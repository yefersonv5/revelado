/* Biblioteca: fotos guardadas solo en el dispositivo (IndexedDB), la vista en rejilla con filtros
   (editadas, estrellas, marcas y álbumes), orden por fecha de captura o de importación, y la selección
   múltiple para pegar ajustes, agregar a un álbum, exportar o eliminar.
   Cada foto guarda el original intacto aparte (almacén "originales") y en "fotos" sus datos livianos:
   ajustes, versiones, estrellas, marca, álbumes, datos de cámara y la miniatura ya revelada. */

const DB = (() => {
  let db = null;
  const pedir = r => new Promise((ok, mal) => { r.onsuccess = () => ok(r.result); r.onerror = () => mal(r.error); });
  const tx = (almacen, modo = 'readonly') => db.transaction(almacen, modo).objectStore(almacen);
  return {
    async abrir(){
      const r = indexedDB.open('revelado', 2);
      r.onupgradeneeded = () => {
        const d = r.result;
        for (const n of ['fotos', 'originales', 'presets', 'albumes']) if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath:'id' });
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
    albumes: () => pedir(tx('albumes').getAll()),
    guardarAlbum: a => pedir(tx('albumes', 'readwrite').put(a)),
    eliminarAlbum: id => pedir(tx('albumes', 'readwrite').delete(id)),
  };
})();

/* Estado de la biblioteca en memoria */
const BIB = { fotos:[], albumes:[], filtro:'todas', busqueda:'', seleccionando:false, sel:new Set(), urls:new Map(),
  vista:{ orden:'captura', grupos:'mes', estilo:'cuadrada', info:'calificacion' } };
try { Object.assign(BIB.vista, JSON.parse(localStorage.getItem('revelado.bib') || '{}')); } catch (_) {}
const guardarVistaBib = () => { try { localStorage.setItem('revelado.bib', JSON.stringify(BIB.vista)); } catch (_) {} };
let PORTAPAPELES = null; /* ajustes copiados (y qué grupos) para pegar en otras fotos */
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
  const [W, H] = conBorde(foto.ajustes, Math.max(1, Math.round(g.w * Wo * k)), Math.max(1, Math.round(g.h * Ho * k)));
  const px = Motor.revelar(f, foto.ajustes, { ancho:W, alto:H, destino:'pixeles' });
  f.liberar(); foto.asp = W / H; /* proporción de la miniatura para la cuadrícula justificada */
  return aBlob(imagenACanvas(px), 'image/jpeg', .82);
}

async function importarArchivos(archivos){
  const lista = [...archivos].filter(a => a.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp)$/i.test(a.name));
  if (!lista.length) return toast('Esos archivos no son fotos');
  const album = BIB.filtro.startsWith('a:') ? BIB.filtro.slice(2) : null; /* importar dentro de un álbum abierto lo agrega ahí */
  let hechas = 0, fallas = 0;
  for (const a of lista) {
    toast('Importando ' + (hechas + 1) + ' de ' + lista.length, 60000);
    try {
      const img = await decodificar(a), id = uid(), exif = await leerExif(a);
      const foto = { id, nombre:a.name.replace(/\.[^.]+$/, '') || 'Foto', fecha:Date.now(), tomada:(exif && exif.fecha) || a.lastModified || Date.now(),
        w:img.width, h:img.height, exif, ajustes:ajustesBase(), versiones:[], estrellas:0, marca:'', albumes:album ? [album] : [], editada:false, mini:null };
      foto.mini = await miniatura(foto, img);
      await DB.agregarOriginal(id, a); await DB.guardar(foto);
      BIB.fotos.push(foto); hechas++;
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
const FILTROS = [['todas', 'Todas'], ['editadas', 'Editadas'], ['estrellas', 'Con estrellas'], ['elegidas', 'Elegidas'], ['rechazadas', 'Rechazadas']];
const ORDENES = { captura:['tomada', 'Fecha de captura'], importacion:['fecha', 'Fecha de importación'], modificacion:['modificada', 'Fecha de modificación'], nombre:['nombre', 'Nombre'] };
function fotosVisibles(){
  const [campo] = ORDENES[BIB.vista.orden] || ORDENES.captura;
  const ord = BIB.fotos.slice().sort(campo === 'nombre' ? (a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric:true }) : (a, b) => (b[campo] || b.fecha || 0) - (a[campo] || a.fecha || 0));
  const f = BIB.filtro, q = BIB.busqueda.trim().toLowerCase();
  let lista = f.startsWith('a:') ? ord.filter(x => (x.albumes || []).includes(f.slice(2)))
    : ord.filter(x => f === 'editadas' ? x.editada : f === 'estrellas' ? x.estrellas > 0 : f === 'elegidas' ? x.marca === 'elegida' : f === 'rechazadas' ? x.marca === 'rechazada' : true);
  if (q) lista = lista.filter(x => [x.nombre, x.exif && x.exif.camara, x.exif && x.exif.objetivo, ...BIB.albumes.filter(a => (x.albumes || []).includes(a.id)).map(a => a.nom)]
    .filter(Boolean).some(t => t.toLowerCase().includes(q)));
  return lista;
}
const ICO_BANDERA = '<svg viewBox="0 0 24 24"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>';
/* Una miniatura con la información que se eligió mostrar encima */
function tarjetaFoto(f){
  const i = BIB.vista.info, d = f.exif || {}, asp = f.asp || f.w / f.h || 1;
  const estilo = BIB.vista.estilo === 'justificada' ? ' style="flex:' + asp.toFixed(3) + ' 1 ' + Math.round(asp * 120) + 'px;aspect-ratio:' + asp.toFixed(3) + '"' : '';
  return '<button class="foto' + (BIB.sel.has(f.id) ? ' sel' : '') + (f.marca === 'rechazada' ? ' rechazada' : '') + '" data-foto="' + f.id + '"' + estilo + ' aria-label="' + esc(f.nombre) +
    (f.estrellas ? ', ' + f.estrellas + ' estrellas' : '') + (f.editada ? ', editada' : '') + '">' +
    '<img src="' + urlMini(f) + '" alt="" loading="lazy">' +
    (i === 'calificacion' ? (f.estrellas ? '<span class="estr">' + '★'.repeat(f.estrellas) + '</span>' : '') + (f.marca === 'elegida' ? '<span class="band">' + ICO_BANDERA + '</span>' : '') +
      (f.editada ? '<svg class="ed" viewBox="0 0 24 24">' + ICO.editada.slice(ICO.editada.indexOf('<path')) : '') : '') +
    (i === 'datos' ? '<span class="datos">' + esc([d.camara || f.nombre, [d.iso, d.apertura, d.velocidad].filter(Boolean).join(' ')].filter(Boolean).join(' · ')) + '</span>' : '') +
    '<span class="chk"></span></button>';
}
/* Agrupa por día o por mes cuando se ordena por fecha */
function grupoDe(f){
  const [campo] = ORDENES[BIB.vista.orden] || ORDENES.captura;
  if (campo === 'nombre' || BIB.vista.grupos === 'ninguno') return '';
  const t = new Date(f[campo] || f.fecha);
  return BIB.vista.grupos === 'dia' ? t.toLocaleDateString('es-CO', { weekday:'long', day:'numeric', month:'long', year:'numeric' }) : t.toLocaleDateString('es-CO', { month:'long', year:'numeric' });
}
function pintarBiblioteca(){
  const vis = fotosVisibles(), rej = $('#rejilla');
  rej.className = BIB.vista.estilo === 'justificada' ? 'justificada' : '';
  let h = '', actual = null, bloque = [];
  const cerrar = () => { if (bloque.length) h += '<div class="bloque">' + bloque.join('') + '</div>'; bloque = []; };
  vis.forEach(f => { const g = grupoDe(f); if (g !== actual) { cerrar(); if (g) h += '<h3 class="grupo-fecha">' + esc(g.charAt(0).toUpperCase() + g.slice(1)) + '</h3>'; actual = g; } bloque.push(tarjetaFoto(f)); });
  cerrar(); rej.innerHTML = h;
  const vacia = !BIB.fotos.length;
  $('#vacio').hidden = !vacia; $('#filtros').hidden = vacia; $('#b-seleccionar').hidden = vacia; $('#b-bib-mas').hidden = vacia; $('#buscar-caja').hidden = vacia;
  $('#filtros').innerHTML = FILTROS.map(([k, n]) => '<button data-filtro="' + k + '" class="' + (BIB.filtro === k ? 'activo' : '') + '">' + n + '</button>').join('') +
    BIB.albumes.map(a => '<button data-filtro="a:' + a.id + '" class="' + (BIB.filtro === 'a:' + a.id ? 'activo' : '') + '">' + esc(a.nom) + '</button>').join('') +
    '<button data-album-nuevo aria-label="Nuevo álbum">+ Álbum</button>';
  const album = BIB.filtro.startsWith('a:') && BIB.albumes.find(a => 'a:' + a.id === BIB.filtro);
  $('#titulo-bib').textContent = album ? album.nom : 'Biblioteca';
  if (!vacia && !vis.length) rej.innerHTML = '<p class="ayuda" style="padding:40px 16px">' +
    (BIB.busqueda ? 'Nada coincide con «' + esc(BIB.busqueda) + '».' : album ? 'Este álbum está vacío. Usa Seleccionar en Todas y luego Álbum.' : BIB.filtro === 'editadas' ? 'Aún no has editado ninguna foto.' : 'No hay fotos con este filtro. Califícalas desde el editor o con Seleccionar.') + '</p>';
  $('#v-biblioteca').classList.toggle('seleccionando', BIB.seleccionando);
  $('#b-seleccionar').textContent = BIB.seleccionando ? 'Listo' : 'Seleccionar';
  $('#barra-sel').hidden = !BIB.seleccionando;
  const n = BIB.sel.size;
  $('#sel-cuenta').textContent = n ? n + (n === 1 ? ' foto' : ' fotos') : 'Elige fotos';
  $$('#barra-sel [data-sel]').forEach(b => { b.disabled = !n || (b.dataset.sel === 'pegar' && !PORTAPAPELES); });
}

function salirSeleccion(){ BIB.seleccionando = false; BIB.sel.clear(); pintarBiblioteca(); }

async function accionSeleccion(accion){
  const ids = [...BIB.sel], fotos = BIB.fotos.filter(f => BIB.sel.has(f.id));
  if (accion === 'calificar') return hojaCalificar(fotos, salirSeleccion);
  if (accion === 'album') return hojaAlbum(fotos);
  if (accion === 'exportar') return hojaExportar(fotos);
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
      f.ajustes = pegarAjustes(f.ajustes); f.editada = ajustesEditados(f.ajustes);
      f.mini = await miniatura(f); await DB.guardar(f);
    }
    toast('Ajustes pegados en ' + fotos.length + (fotos.length === 1 ? ' foto' : ' fotos')); salirSeleccion();
  }
}

/* Pega los grupos copiados sobre unos ajustes */
const pegarAjustes = destino => aplicarGrupos(destino, PORTAPAPELES.a, PORTAPAPELES.grupos);

/* Estrellas y marca (elegida o rechazada) para una o varias fotos */
function hojaCalificar(fotos, alTerminar = null){
  const una = fotos.length === 1 ? fotos[0] : null;
  const pintar = () => {
    abrirHoja(cabHoja(una ? 'Calificar' : 'Calificar ' + fotos.length + ' fotos') +
      '<div class="estrellas">' + [1, 2, 3, 4, 5].map(n => '<button data-estr="' + n + '" class="' + (una && una.estrellas >= n ? 'on' : '') + '" aria-label="' + n + ' estrellas">' + ICO.estrella + '</button>').join('') + '</div>' +
      '<div class="segmento" style="margin-bottom:14px">' + [['elegida', 'Elegida'], ['', 'Sin marca'], ['rechazada', 'Rechazada']].map(([k, n]) =>
        '<button data-marca="' + k + '" aria-selected="' + (una ? una.marca === k : false) + '">' + n + '</button>').join('') + '</div>' +
      '<button class="btn bloque" data-cerrar>Listo</button>', alTerminar);
    $('#hoja').onclick = async e => {
      const s = e.target.closest('[data-estr]'), m = e.target.closest('[data-marca]'); if (!s && !m) return;
      for (const f of fotos) {
        if (s) f.estrellas = una && una.estrellas === +s.dataset.estr ? 0 : +s.dataset.estr;
        if (m) f.marca = m.dataset.marca;
        await DB.guardar(f);
      }
      if (una) pintar(); else { cerrarHoja(); toast('Calificación aplicada'); }
    };
  };
  pintar();
}

/* ---------- álbumes ---------- */
function hojaAlbum(fotos){
  abrirHoja(cabHoja('Agregar a álbum') + (BIB.albumes.length ? '<div class="grupo">' + BIB.albumes.map(a =>
    '<button data-album="' + a.id + '"><span>' + esc(a.nom) + '</span><small>' + BIB.fotos.filter(f => (f.albumes || []).includes(a.id)).length + '</small></button>').join('') + '</div>' : '') +
    '<form id="f-album"><div class="grupo"><input type="text" id="album-nombre" maxlength="40" placeholder="Nuevo álbum" autocomplete="off"></div><button class="btn primario bloque" type="submit">Crear y agregar</button></form>');
  const agregar = async id => { for (const f of fotos) { f.albumes = [...new Set([...(f.albumes || []), id])]; await DB.guardar(f); } cerrarHoja(); toast('Agregadas al álbum'); salirSeleccion(); };
  $('#hoja').onclick = e => { const b = e.target.closest('[data-album]'); if (b) agregar(b.dataset.album); };
  $('#f-album').onsubmit = async e => { e.preventDefault(); const a = await crearAlbum($('#album-nombre').value); if (a) agregar(a.id); };
}
async function crearAlbum(nombre){
  const nom = (nombre || '').trim(); if (!nom) { toast('Escribe un nombre para el álbum'); return null; }
  const a = { id:uid(), nom, fecha:Date.now() }; await DB.guardarAlbum(a); BIB.albumes.push(a); return a;
}
function hojaNuevoAlbum(){
  abrirHoja(cabHoja('Nuevo álbum') + '<form id="f-album"><div class="grupo"><input type="text" id="album-nombre" maxlength="40" placeholder="Nombre del álbum" autofocus autocomplete="off"></div><button class="btn primario bloque" type="submit">Crear álbum</button></form>');
  $('#f-album').onsubmit = async e => { e.preventDefault(); const a = await crearAlbum($('#album-nombre').value); if (a) { BIB.filtro = 'a:' + a.id; cerrarHoja(); pintarBiblioteca(); } };
}
function hojaOpcionesAlbum(){
  const id = BIB.filtro.slice(2), a = BIB.albumes.find(x => x.id === id); if (!a) return;
  abrirHoja(cabHoja(a.nom) + '<form id="f-album"><div class="grupo"><input type="text" id="album-nombre" maxlength="40" value="' + esc(a.nom) + '" autocomplete="off"></div><button class="btn bloque" type="submit">Cambiar nombre</button></form>' +
    '<div class="grupo" style="margin-top:14px"><button data-album-quitar><span>Sacar fotos seleccionadas</span></button><button class="peligro" data-album-borrar><span>Eliminar álbum (las fotos se quedan)</span></button></div>');
  $('#f-album').onsubmit = async e => { e.preventDefault(); const n = $('#album-nombre').value.trim(); if (n) { a.nom = n; await DB.guardarAlbum(a); cerrarHoja(); pintarBiblioteca(); } };
  $('#hoja').onclick = async e => {
    if (e.target.closest('[data-album-borrar]')) {
      for (const f of BIB.fotos) if ((f.albumes || []).includes(id)) { f.albumes = f.albumes.filter(x => x !== id); await DB.guardar(f); }
      await DB.eliminarAlbum(id); BIB.albumes = BIB.albumes.filter(x => x.id !== id); BIB.filtro = 'todas'; cerrarHoja(); pintarBiblioteca(); toast('Álbum eliminado');
    }
    if (e.target.closest('[data-album-quitar]')) {
      if (!BIB.sel.size) { cerrarHoja(); BIB.seleccionando = true; pintarBiblioteca(); return toast('Elige las fotos y vuelve a tocar el álbum'); }
      for (const f of BIB.fotos.filter(x => BIB.sel.has(x.id))) { f.albumes = (f.albumes || []).filter(x => x !== id); await DB.guardar(f); }
      cerrarHoja(); salirSeleccion(); toast('Fotos sacadas del álbum');
    }
  };
}
/* Opciones de la biblioteca: ordenar, agrupar, estilo de cuadrícula, información sobre miniaturas, presentación y álbum */
function hojaOpcionesBib(){
  const V = BIB.vista, sel = (k, v) => V[k] === v ? '<span style="color:var(--brand)">✓</span>' : '';
  const album = BIB.filtro.startsWith('a:');
  abrirHoja(cabHoja('Opciones') +
    '<div class="sub">Ordenar por</div><div class="grupo">' + Object.entries(ORDENES).map(([k, [, n]]) => '<button data-ob="orden:' + k + '"><span>' + n + '</span>' + sel('orden', k) + '</button>').join('') + '</div>' +
    '<div class="sub">Agrupar</div><div class="segmento" style="margin:6px 0 14px">' + [['ninguno', 'Sin grupos'], ['dia', 'Por día'], ['mes', 'Por mes']].map(([k, n]) => '<button data-ob="grupos:' + k + '" aria-selected="' + (V.grupos === k) + '">' + n + '</button>').join('') + '</div>' +
    '<div class="sub">Cuadrícula</div><div class="segmento" style="margin:6px 0 14px">' + [['cuadrada', 'Cuadrada'], ['justificada', 'Justificada']].map(([k, n]) => '<button data-ob="estilo:' + k + '" aria-selected="' + (V.estilo === k) + '">' + n + '</button>').join('') + '</div>' +
    '<div class="sub">Información en las miniaturas</div><div class="segmento" style="margin:6px 0 14px">' + [['ninguna', 'Ninguna'], ['calificacion', 'Calificación'], ['datos', 'Datos']].map(([k, n]) => '<button data-ob="info:' + k + '" aria-selected="' + (V.info === k) + '">' + n + '</button>').join('') + '</div>' +
    '<div class="grupo"><button data-ob-pres><span>Iniciar presentación</span></button>' + (album ? '<button data-ob-album><span>Opciones del álbum</span>' + ICO.chev + '</button>' : '') + '</div>');
  $('#hoja').onclick = e => {
    const b = e.target.closest('[data-ob]');
    if (b) { const [k, v] = b.dataset.ob.split(':'); V[k] = v; guardarVistaBib(); pintarBiblioteca(); return hojaOpcionesBib(); }
    if (e.target.closest('[data-ob-pres]')) { cerrarHoja(); iniciarPresentacion(); }
    if (e.target.closest('[data-ob-album]')) hojaOpcionesAlbum();
  };
}

/* Presentación: las fotos visibles, reveladas a tamaño de pantalla, una cada 3 segundos. Tocar la cierra. */
let presentando = null;
async function iniciarPresentacion(){
  const lista = fotosVisibles(); if (!lista.length) return;
  const el = $('#presentacion'), img = $('#pres-img'); el.hidden = false; presentando = { i:0 };
  const yo = presentando, lado = Math.round(Math.max(innerWidth, innerHeight) * Math.min(2, devicePixelRatio || 1));
  try { document.documentElement.requestFullscreen && await document.documentElement.requestFullscreen(); } catch (_) {}
  while (presentando === yo) {
    const f = lista[yo.i % lista.length];
    try {
      const im = await decodificar(await DB.original(f.id)), a = completarAjustes(f.ajustes), fu = Motor.fuente(im, lado);
      const g = a.geo, [Wo, Ho] = marcoOrientado(g, fu.w, fu.h), [W, H] = conBorde(a, Math.round(g.w * Wo), Math.round(g.h * Ho));
      const px = Motor.revelar(fu, a, { ancho:W, alto:H, destino:'pixeles' }); fu.liberar(); if (im.close) im.close();
      const blob = await aBlob(imagenACanvas(px), 'image/jpeg', .9), url = URL.createObjectURL(blob);
      if (presentando !== yo) { URL.revokeObjectURL(url); break; }
      const viejo = img.src; img.src = url; $('#pres-pie').textContent = (yo.i % lista.length + 1) + ' de ' + lista.length;
      if (viejo.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(viejo), 1000);
    } catch (_) {}
    yo.i++; await esperar(3000);
  }
}
function cerrarPresentacion(){ presentando = null; $('#presentacion').hidden = true; try { if (document.fullscreenElement) document.exitFullscreen(); } catch (_) {} }

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
