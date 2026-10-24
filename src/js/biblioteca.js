/* Biblioteca: fotos guardadas solo en el dispositivo (IndexedDB) y la vista en rejilla con filtros y selección.
   Cada foto guarda el original intacto aparte (almacén "originales") y en "fotos" sus datos livianos:
   ajustes, versiones, favorita y la miniatura ya revelada. */

const DB = (() => {
  let db = null;
  const pedir = r => new Promise((ok, mal) => { r.onsuccess = () => ok(r.result); r.onerror = () => mal(r.error); });
  const tx = (almacen, modo = 'readonly') => db.transaction(almacen, modo).objectStore(almacen);
  return {
    async abrir(){
      const r = indexedDB.open('revelado', 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore('fotos', { keyPath:'id' });
        d.createObjectStore('originales', { keyPath:'id' });
        d.createObjectStore('presets', { keyPath:'id' });
      };
      db = await pedir(r);
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (_) {}
    },
    todas: () => pedir(tx('fotos').getAll()),
    guardar: f => pedir(tx('fotos', 'readwrite').put(f)),
    original: async id => (await pedir(tx('originales').get(id)))?.blob,
    async eliminar(id){ await pedir(tx('fotos', 'readwrite').delete(id)); await pedir(tx('originales', 'readwrite').delete(id)); },
    async agregarOriginal(id, blob){ await pedir(tx('originales', 'readwrite').put({ id, blob })); },
    presets: () => pedir(tx('presets').getAll()),
    guardarPreset: p => pedir(tx('presets', 'readwrite').put(p)),
    eliminarPreset: id => pedir(tx('presets', 'readwrite').delete(id)),
  };
})();

/* Estado de la biblioteca en memoria */
const BIB = { fotos:[], filtro:'todas', seleccionando:false, sel:new Set(), urls:new Map() };
let PORTAPAPELES = null; /* ajustes copiados para pegar en otras fotos */
try { PORTAPAPELES = JSON.parse(localStorage.getItem('revelado.copiados') || 'null'); } catch (_) {}

/* Abre un archivo de imagen respetando la orientación de la cámara */
async function decodificar(blob){
  try { return await createImageBitmap(blob, { imageOrientation:'from-image' }); }
  catch (_) {
    const url = URL.createObjectURL(blob), img = new Image();
    try { img.src = url; await img.decode(); return img; } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
}
const aBlob = (canvas, tipo = 'image/jpeg', q = .86) => new Promise(r => canvas.toBlob(r, tipo, q));
function imagenACanvas(img){ const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').putImageData(img, 0, 0); return c; }

/* Miniatura revelada con los ajustes actuales (lado mayor 480 px) */
async function miniatura(foto, imagen = null){
  const img = imagen || await decodificar(await DB.original(foto.id));
  const f = Motor.fuente(img, 480), [Wo, Ho] = marcoOrientado(foto.ajustes.geo, f.w, f.h);
  const g = foto.ajustes.geo, k = 480 / Math.max(g.w * Wo, g.h * Ho);
  const px = Motor.revelar(f, foto.ajustes, { ancho:Math.max(1, Math.round(g.w * Wo * k)), alto:Math.max(1, Math.round(g.h * Ho * k)), destino:'pixeles' });
  f.liberar();
  return aBlob(imagenACanvas(px), 'image/jpeg', .82);
}

async function importarArchivos(archivos){
  const lista = [...archivos].filter(a => a.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp)$/i.test(a.name));
  if (!lista.length) return toast('Esos archivos no son fotos');
  let hechas = 0, fallas = 0;
  for (const a of lista) {
    toast('Importando ' + (hechas + 1) + ' de ' + lista.length, 60000);
    try {
      const img = await decodificar(a), id = uid();
      const foto = { id, nombre:a.name.replace(/\.[^.]+$/, '') || 'Foto', fecha:Date.now(), tomada:a.lastModified || Date.now(),
        w:img.width, h:img.height, ajustes:ajustesBase(), versiones:[], fav:false, editada:false, mini:null };
      foto.mini = await miniatura(foto, img);
      await DB.agregarOriginal(id, a); await DB.guardar(foto);
      BIB.fotos.unshift(foto); hechas++;
    } catch (e) { fallas++; console.error(e); }
  }
  pintarBiblioteca();
  toast(fallas ? 'Se importaron ' + hechas + '. ' + fallas + ' no se pudieron abrir (prueba JPG o PNG).' : (hechas === 1 ? 'Foto importada' : hechas + ' fotos importadas'), 2600);
}

/* ---------- vista ---------- */
function urlMini(f){
  const prev = BIB.urls.get(f.id);
  if (prev && prev.blob === f.mini) return prev.url;
  if (prev) URL.revokeObjectURL(prev.url);
  const url = f.mini ? URL.createObjectURL(f.mini) : ''; BIB.urls.set(f.id, { blob:f.mini, url }); return url;
}
function fotosVisibles(){
  const ord = BIB.fotos.slice().sort((a, b) => b.fecha - a.fecha);
  return BIB.filtro === 'editadas' ? ord.filter(f => f.editada) : BIB.filtro === 'favoritas' ? ord.filter(f => f.fav) : ord;
}
function pintarBiblioteca(){
  const vis = fotosVisibles();
  $('#rejilla').innerHTML = vis.map(f => '<button class="foto' + (BIB.sel.has(f.id) ? ' sel' : '') + '" data-foto="' + f.id + '" aria-label="' + esc(f.nombre) + (f.fav ? ', favorita' : '') + (f.editada ? ', editada' : '') + '">' +
    '<img src="' + urlMini(f) + '" alt="" loading="lazy">' + (f.fav ? '<svg class="fav" viewBox="0 0 24 24">' + ICO.estrella.slice(ICO.estrella.indexOf('<path')) : '') +
    (f.editada ? '<svg class="ed" viewBox="0 0 24 24">' + ICO.editada.slice(ICO.editada.indexOf('<path')) : '') + '<span class="chk"></span></button>').join('');
  const vacia = !BIB.fotos.length;
  $('#vacio').hidden = !vacia; $('#filtros').hidden = vacia; $('#b-seleccionar').hidden = vacia;
  if (!vacia && !vis.length) $('#rejilla').innerHTML = '<p class="ayuda" style="grid-column:1/-1;padding:40px 16px">' + (BIB.filtro === 'editadas' ? 'Aún no has editado ninguna foto.' : 'Marca fotos como favoritas desde el editor o con Seleccionar.') + '</p>';
  $$('#filtros button').forEach(b => b.setAttribute('aria-selected', b.dataset.filtro === BIB.filtro));
  $('#v-biblioteca').classList.toggle('seleccionando', BIB.seleccionando);
  $('#b-seleccionar').textContent = BIB.seleccionando ? 'Listo' : 'Seleccionar';
  $('#barra-sel').hidden = !BIB.seleccionando;
  const n = BIB.sel.size;
  $$('#barra-sel [data-sel]').forEach(b => { b.disabled = !n || (b.dataset.sel === 'pegar' && !PORTAPAPELES); });
}

function salirSeleccion(){ BIB.seleccionando = false; BIB.sel.clear(); pintarBiblioteca(); }

async function accionSeleccion(accion){
  const ids = [...BIB.sel], fotos = BIB.fotos.filter(f => BIB.sel.has(f.id));
  if (accion === 'favorita') {
    const todas = fotos.every(f => f.fav);
    for (const f of fotos) { f.fav = !todas; await DB.guardar(f); }
    toast(todas ? 'Quitadas de favoritas' : 'Marcadas como favoritas'); return salirSeleccion();
  }
  if (accion === 'eliminar') {
    const ok = await confirmar(ids.length === 1 ? 'Eliminar foto' : 'Eliminar ' + ids.length + ' fotos', 'Se borran de Revelado con sus ediciones. Las fotos de tu galería no se tocan.', 'peligro');
    if (!ok) return;
    for (const id of ids) { await DB.eliminar(id); const u = BIB.urls.get(id); if (u) URL.revokeObjectURL(u.url); BIB.urls.delete(id); }
    BIB.fotos = BIB.fotos.filter(f => !BIB.sel.has(f.id)); toast(ids.length === 1 ? 'Foto eliminada' : ids.length + ' fotos eliminadas'); return salirSeleccion();
  }
  if (accion === 'pegar' && PORTAPAPELES) {
    let i = 0;
    for (const f of fotos) {
      toast('Pegando ajustes ' + (++i) + ' de ' + fotos.length, 60000);
      f.ajustes = pegarAjustes(f.ajustes, PORTAPAPELES); f.editada = ajustesEditados(f.ajustes);
      f.mini = await miniatura(f); await DB.guardar(f);
    }
    toast('Ajustes pegados en ' + fotos.length + (fotos.length === 1 ? ' foto' : ' fotos')); salirSeleccion();
  }
}

/* Pega los ajustes copiados: todo menos la geometría, que es propia de cada foto */
function pegarAjustes(destino, copiados){
  const a = completarAjustes(copiados); a.geo = clonar(destino.geo); return a;
}

/* ---------- foto de ejemplo: atardecer sobre montañas y un lago, dibujado en el momento ---------- */
async function fotoEjemplo(){
  const c = document.createElement('canvas'); c.width = 2400; c.height = 1600;
  const x = c.getContext('2d'), w = c.width, h = c.height, hz = h * .62;
  let g = x.createLinearGradient(0, 0, 0, hz); g.addColorStop(0, '#1c2a52'); g.addColorStop(.55, '#b5546d'); g.addColorStop(1, '#f3a85c');
  x.fillStyle = g; x.fillRect(0, 0, w, hz);
  const sx = w * .66, sy = hz - 45, r = x.createRadialGradient(sx, sy, 0, sx, sy, w * .35);
  r.addColorStop(0, 'rgba(255,236,190,.95)'); r.addColorStop(.08, 'rgba(255,214,150,.7)'); r.addColorStop(1, 'rgba(255,180,120,0)');
  x.fillStyle = r; x.fillRect(0, 0, w, hz);
  const cresta = (base, amp, col, s) => { x.beginPath(); x.moveTo(0, hz); for (let i = 0; i <= w; i += 8) x.lineTo(i, base - amp * (.55 * Math.sin(i * .0027 + s) + .3 * Math.sin(i * .0073 + s * 2) + .15 * Math.sin(i * .021 + s * 3))); x.lineTo(w, hz); x.closePath(); x.fillStyle = col; x.fill(); };
  cresta(hz - 105, 135, '#6b3d5c', 1.3); cresta(hz - 38, 105, '#3e2741', 4.1); cresta(hz + 3, 60, '#22172a', 2.2);
  x.save(); x.translate(0, hz * 2); x.scale(1, -1); x.globalAlpha = .55; x.drawImage(c, 0, 0, w, hz, 0, 0, w, hz); x.restore();
  g = x.createLinearGradient(0, hz, 0, h); g.addColorStop(0, 'rgba(20,16,34,.35)'); g.addColorStop(1, 'rgba(10,10,20,.9)'); x.fillStyle = g; x.fillRect(0, hz, w, h - hz);
  x.globalAlpha = .25; x.strokeStyle = '#ffd9a0';
  for (let i = 0; i < 70; i++) { const y = hz + 12 + Math.pow(i / 70, 1.6) * (h - hz), l = 60 + Math.random() * 240; x.lineWidth = 1 + i / 30; x.beginPath(); x.moveTo(sx - l / 2 + (Math.random() - .5) * 90, y); x.lineTo(sx + l / 2, y); x.stroke(); }
  x.globalAlpha = 1;
  const blob = await aBlob(c, 'image/jpeg', .92);
  await importarArchivos([new File([blob], 'Atardecer de ejemplo.jpg', { type:'image/jpeg', lastModified:Date.now() })]);
}
