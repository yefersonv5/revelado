/* Editor: abre una foto, la pinta con el motor, guarda el historial (deshacer y rehacer) y la edición en el
   dispositivo, y maneja los gestos sobre la foto: mantener para ver el original, pellizcar y doble toque
   para acercar, arrastrar para moverse, deslizar a los lados para cambiar de foto y desde el borde izquierdo
   para volver a la biblioteca. También el menú de más opciones y las versiones. */

const ED = {
  foto:null, a:ajustesBase(), img:null, fuente:null, fuenteMini:null,
  panel:'presets', hist:[], hi:0, sucio:false, preset:null,
  antes:false, zoom:1, px:0, py:0, vista:{ x:0, y:0, w:1, h:1 }, res:{ w:1, h:1 },
  mascara:-1, verMascara:false, verHisto:false,
};
const RECORTE_TODO = { x:0, y:0, w:1, h:1 };
const modoRecorte = () => ED.panel === 'recortar';

/* ---------- abrir y cerrar ---------- */
async function abrirEditor(id){
  const foto = BIB.fotos.find(f => f.id === id); if (!foto) return;
  if (ED.foto) await soltarFoto();
  $('#v-biblioteca').hidden = true; $('#v-editor').hidden = false;
  try {
    const img = await decodificar(await DB.original(id));
    ED.foto = foto; ED.img = img;
    ED.fuente = Motor.fuente(img, esComputador() ? 3072 : 2048); ED.fuenteMini = Motor.fuente(img, 200);
  } catch (e) { console.error(e); toast('No se pudo abrir la foto'); return volverBiblioteca(); }
  ED.a = completarAjustes(foto.ajustes); ED.hist = [JSON.stringify(ED.a)]; ED.hi = 0; ED.sucio = false;
  Object.assign(ED, { preset:null, mascara:-1, verMascara:false, antes:false, zoom:1, px:0, py:0 });
  $$('.pane').forEach(p => { if (p.dataset.abierta) cerrarSub(p); });
  botonesHistorial(); sincronizarPaneles(); sincronizarRecorte(); pintarPresets();
  if (ED.panel === 'mascaras') pintarMascaras();
  acomodar(); pedirPintura();
}

/* Guarda lo pendiente, rehace la miniatura si hubo cambios y libera la memoria de la foto */
async function soltarFoto(){
  const f = ED.foto; if (!f) return;
  clearTimeout(guardadoT);
  if (ED.sucio) {
    f.ajustes = clonar(ED.a); f.editada = ajustesEditados(f.ajustes);
    try { f.mini = await miniatura(f, ED.img); } catch (_) {}
    await DB.guardar(f);
  }
  ED.fuente.liberar(); ED.fuenteMini.liberar(); if (ED.img.close) ED.img.close();
  ED.foto = ED.fuente = ED.fuenteMini = ED.img = null;
}
async function volverBiblioteca(){
  await soltarFoto(); cerrarHoja();
  $('#v-editor').hidden = true; $('#v-biblioteca').hidden = false; pintarBiblioteca();
}
/* Foto anterior o siguiente según el filtro de la biblioteca */
function navegar(dir){
  const lista = fotosVisibles(), i = lista.findIndex(f => f.id === ED.foto.id), sig = lista[i + dir];
  if (sig) abrirEditor(sig.id); else toast(dir > 0 ? 'Es la última foto' : 'Es la primera foto', 1200);
}

/* ---------- cambios, historial y guardado ---------- */
let guardadoT;
/* Llamar tras modificar ED.a. final = el gesto terminó (entra al historial). dePreset = lo hizo un preset */
function cambiar(final, dePreset = false){
  if (!dePreset && ED.preset) { ED.preset = null; pintarPresets(true); }
  pedirPintura();
  if (!final) return;
  const s = JSON.stringify(ED.a);
  if (s !== ED.hist[ED.hi]) { ED.hist = ED.hist.slice(0, ED.hi + 1); ED.hist.push(s); if (ED.hist.length > 100) ED.hist.shift(); ED.hi = ED.hist.length - 1; }
  botonesHistorial(); sincronizarPaneles(); sincronizarRecorte(); programarGuardado();
}
function programarGuardado(){
  ED.sucio = true; clearTimeout(guardadoT);
  guardadoT = setTimeout(() => { if (!ED.foto) return; ED.foto.ajustes = clonar(ED.a); ED.foto.editada = ajustesEditados(ED.a); DB.guardar(ED.foto); }, 500);
}
function botonesHistorial(){ $('#b-deshacer').disabled = ED.hi <= 0; $('#b-rehacer').disabled = ED.hi >= ED.hist.length - 1; }
function restaurar(s){
  const geo = JSON.stringify(ED.a.geo);
  ED.a = JSON.parse(s); ED.preset = null;
  if (ED.mascara >= ED.a.mascaras.length) ED.mascara = -1;
  refrescarTodo(JSON.stringify(ED.a.geo) !== geo);
  botonesHistorial(); programarGuardado();
}
/* Repinta paneles, subvistas abiertas y la foto después de un cambio que no vino de un control */
function refrescarTodo(geoCambio = true){
  sincronizarPaneles(); sincronizarRecorte(); pintarPresets(true);
  $$('.pane').forEach(p => { if (p.dataset.abierta) abrirSub(p, p.dataset.abierta); });
  if (ED.panel === 'mascaras') pintarMascaras();
  if (geoCambio) acomodar();
  pedirPintura();
}
function deshacer(){ if (ED.hi > 0) restaurar(ED.hist[--ED.hi]); }
function rehacer(){ if (ED.hi < ED.hist.length - 1) restaurar(ED.hist[++ED.hi]); }
/* Aplica un ajuste entero (versión, pegar, restablecer) como un solo paso del historial */
function reemplazarAjustes(a){ ED.a = completarAjustes(a); ED.preset = null; ED.mascara = -1; cambiar(true); refrescarTodo(true); }

/* ---------- pestañas ---------- */
function elegirPanel(p){
  const salia = ED.panel; ED.panel = p;
  $$('#herramientas button').forEach(b => b.setAttribute('aria-selected', b.dataset.p === p));
  $$('.pane').forEach(el => { el.hidden = el.id !== 'p-' + p; });
  if (p === 'mascaras') pintarMascaras();
  if (p === 'recortar' || salia === 'recortar' || p === 'mascaras') { ED.zoom = 1; ED.px = ED.py = 0; }
  if (p === 'recortar' || salia === 'recortar') acomodar();
  aplicarTransformacion(); pedirPintura();
}

/* ---------- geometría de la vista ---------- */
function acomodar(){
  if (!ED.fuente) return;
  const g = ED.a.geo, [Wo, Ho] = marcoOrientado(g, ED.fuente.w, ED.fuente.h);
  const fw = modoRecorte() ? Wo : g.w * Wo, fh = modoRecorte() ? Ho : g.h * Ho;
  const E = $('#escena').getBoundingClientRect(), pad = esComputador() ? 28 : modoRecorte() ? 22 : 10;
  const s = Math.min((E.width - 2 * pad) / fw, (E.height - 2 * pad) / fh), w = fw * s, h = fh * s;
  ED.vista = { x:(E.width - w) / 2, y:(E.height - h) / 2, w, h };
  const k = Math.min(1, 2048 / Math.max(fw, fh)); ED.res = { w:Math.max(1, Math.round(fw * k)), h:Math.max(1, Math.round(fh * k)) };
  const m = $('#marco'); m.style.width = w + 'px'; m.style.height = h + 'px';
  $('#capa').setAttribute('viewBox', '0 0 ' + w + ' ' + h);
  limitarPaneo(); aplicarTransformacion(); pedirPintura();
}
function aplicarTransformacion(){ $('#marco').style.transform = 'translate(' + (ED.vista.x + ED.px) + 'px,' + (ED.vista.y + ED.py) + 'px) scale(' + ED.zoom + ')'; }
function limitarPaneo(){
  const E = $('#escena').getBoundingClientRect(), v = ED.vista, z = ED.zoom;
  const eje = (ancho, inicio, total, actual) => { const s = ancho * z; return s <= total ? (total - s) / 2 - inicio : clamp(actual, total - s - inicio, -inicio); };
  ED.px = eje(v.w, v.x, E.width, ED.px); ED.py = eje(v.h, v.y, E.height, ED.py);
}
const zoom100 = () => ED.res.w / (ED.vista.w * (window.devicePixelRatio || 1));
let zoomT;
function mostrarZoom(){ const e = $('#etq-zoom'); e.textContent = Math.round(ED.zoom / zoom100() * 100) + ' %'; e.classList.add('ver'); clearTimeout(zoomT); zoomT = setTimeout(() => e.classList.remove('ver'), 900); }
/* Acerca o aleja manteniendo fijo el punto de la pantalla (cx, cy relativos a la escena) */
function zoomEn(z, cx, cy){
  const zmax = Math.max(4, zoom100() * 2), z0 = ED.zoom; z = clamp(z, 1, zmax);
  const bx = (cx - ED.vista.x - ED.px) / z0, by = (cy - ED.vista.y - ED.py) / z0;
  ED.zoom = z; ED.px = cx - ED.vista.x - bx * z; ED.py = cy - ED.vista.y - by * z;
  limitarPaneo(); aplicarTransformacion(); mostrarZoom();
}
/* Conversión entre la salida (0..1 de lo que se ve) y la foto original (0..1) */
const salidaASrc = (u, v) => afAplicar(matrizGeo(ED.a.geo, ED.fuente.w, ED.fuente.h), u, v);
const srcASalida = (x, y) => afAplicar(afInv(matrizGeo(ED.a.geo, ED.fuente.w, ED.fuente.h)), x, y);

/* ---------- pintura ---------- */
let pinturaPedida = false, histoT;
function pedirPintura(){ if (!pinturaPedida) { pinturaPedida = true; requestAnimationFrame(pintar); } }
function pintar(){
  pinturaPedida = false; if (!ED.fuente) return;
  Motor.revelar(ED.fuente, ED.a, { ancho:ED.res.w, alto:ED.res.h, antes:ED.antes, recorte:modoRecorte() ? RECORTE_TODO : null,
    verMascara:ED.panel === 'mascaras' && ED.verMascara ? ED.mascara : -1 });
  const W = ED.vista.w, H = ED.vista.h;
  $('#capa').innerHTML = ED.antes ? '' : modoRecorte() ? pintarCapaRecorte(W, H) : ED.panel === 'mascaras' ? pintarCapaMascaras(W, H) : '';
  $('#etq-antes').classList.toggle('ver', ED.antes);
  if (ED.verHisto) { clearTimeout(histoT); histoT = setTimeout(pintarHistograma, 120); }
}
function pintarHistograma(){
  if (!ED.fuente) return;
  const k = 200 / Math.max(ED.res.w, ED.res.h), d = Motor.revelar(ED.fuente, ED.a, { ancho:Math.max(1, Math.round(ED.res.w * k)), alto:Math.max(1, Math.round(ED.res.h * k)), antes:ED.antes, destino:'pixeles' }).data;
  const R = new Uint32Array(64), G = new Uint32Array(64), B = new Uint32Array(64);
  for (let i = 0; i < d.length; i += 4) { R[d[i] >> 2]++; G[d[i + 1] >> 2]++; B[d[i + 2] >> 2]++; }
  let m = 1; for (let i = 1; i < 63; i++) m = Math.max(m, R[i], G[i], B[i]);
  const c = $('#histo'), x = c.getContext('2d'), W = c.width, H = c.height, bw = W / 64;
  x.clearRect(0, 0, W, H); x.globalCompositeOperation = 'lighter';
  [[R, 'rgba(255,69,58,.75)'], [G, 'rgba(48,209,88,.75)'], [B, 'rgba(10,132,255,.8)']].forEach(([a, col]) => {
    x.fillStyle = col; x.beginPath(); x.moveTo(0, H);
    for (let i = 0; i < 64; i++) x.lineTo(i * bw + bw / 2, H - Math.min(1, a[i] / m) * (H - 4));
    x.lineTo(W, H); x.closePath(); x.fill();
  });
  x.globalCompositeOperation = 'source-over';
}

/* ---------- gestos sobre la foto ---------- */
(() => {
  const PT = new Map(); let gesto = null, retener, ultimoToque = 0, ini = null;
  const escena = () => $('#escena');
  const rel = e => { const r = escena().getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const norm = e => { const r = $('#marco').getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
  const finAntes = () => { if (ED.antes) { ED.antes = false; pedirPintura(); } };

  document.addEventListener('pointerdown', e => {
    if (!escena().contains(e.target) || !ED.fuente || e.button) return;
    escena().setPointerCapture(e.pointerId);
    PT.set(e.pointerId, rel(e));
    if (PT.size === 1) {
      const [nx, ny] = norm(e);
      ini = { p:rel(e), t:Date.now(), px:ED.px, py:ED.py };
      if (modoRecorte() && recorteInicio(nx, ny, ED.vista.w, ED.vista.h)) { gesto = 'recorte'; return; }
      const n = ED.panel === 'mascaras' && e.target.closest('[data-nodo]');
      if (n) { mascaraInicio(n, nx, ny); gesto = n.dataset.nodo === 'elegir' ? 'nada' : 'mascara'; return; }
      gesto = 'toque';
      retener = setTimeout(() => { if (gesto === 'toque') { gesto = 'antes'; ED.antes = true; pedirPintura(); } }, 260);
    } else if (PT.size === 2 && !modoRecorte() && gesto !== 'mascara' && gesto !== 'recorte') {
      clearTimeout(retener); finAntes();
      const [a, b] = [...PT.values()];
      gesto = 'pellizco'; ini = { d:Math.hypot(a[0] - b[0], a[1] - b[1]), z:ED.zoom };
    }
  });
  document.addEventListener('pointermove', e => {
    if (!PT.has(e.pointerId)) return;
    PT.set(e.pointerId, rel(e));
    const [x, y] = rel(e);
    if (gesto === 'recorte') { recorteMover(...norm(e)); pedirPintura(); return; }
    if (gesto === 'mascara') { mascaraMover(...norm(e)); pedirPintura(); return; }
    if (gesto === 'toque' && Math.hypot(x - ini.p[0], y - ini.p[1]) > 8) { clearTimeout(retener); gesto = ED.zoom > 1.01 ? 'paneo' : modoRecorte() || ED.panel === 'mascaras' ? 'nada' : 'barrido'; }
    if (gesto === 'paneo') { ED.px = ini.px + x - ini.p[0]; ED.py = ini.py + y - ini.p[1]; limitarPaneo(); aplicarTransformacion(); }
    if (gesto === 'barrido') { $('#marco').style.transform = 'translate(' + (ED.vista.x + (x - ini.p[0]) * .35) + 'px,' + ED.vista.y + 'px)'; }
    if (gesto === 'pellizco' && PT.size === 2) {
      const [a, b] = [...PT.values()];
      zoomEn(ini.z * Math.hypot(a[0] - b[0], a[1] - b[1]) / ini.d, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    }
  });
  const soltar = e => {
    if (!PT.has(e.pointerId)) return;
    const [x, y] = rel(e); PT.delete(e.pointerId); clearTimeout(retener);
    if (gesto === 'recorte') { gesto = null; cambiar(true); return; }
    if (gesto === 'mascara') { gesto = null; mascaraFin(); return; }
    if (gesto === 'antes') { gesto = null; finAntes(); return; }
    if (gesto === 'toque' && e.type === 'pointerup') {
      const ahora = Date.now();
      if (ahora - ultimoToque < 300 && !modoRecorte() && ED.panel !== 'mascaras') {
        ultimoToque = 0;
        if (ED.zoom > 1.01) { ED.zoom = 1; ED.px = ED.py = 0; limitarPaneo(); aplicarTransformacion(); mostrarZoom(); }
        else zoomEn(Math.max(zoom100(), 2.5), x, y);
      } else ultimoToque = ahora;
    }
    if (gesto === 'barrido') {
      const dx = x - ini.p[0], dy = y - ini.p[1];
      aplicarTransformacion();
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) { if (ini.p[0] < 28 && dx > 0) volverBiblioteca(); else navegar(dx < 0 ? 1 : -1); }
    }
    if (gesto === 'pellizco') { if (PT.size === 1) { const p = [...PT.values()][0]; gesto = 'paneo'; ini = { p, px:ED.px, py:ED.py }; return; } if (ED.zoom < 1.03) { ED.zoom = 1; limitarPaneo(); aplicarTransformacion(); } }
    if (!PT.size) gesto = null;
  };
  document.addEventListener('pointerup', soltar); document.addEventListener('pointercancel', soltar);
  /* rueda o pellizco del trackpad en computador */
  document.addEventListener('wheel', e => {
    if (!escena().contains(e.target) || !ED.fuente || modoRecorte()) return;
    e.preventDefault(); const [x, y] = rel(e); zoomEn(ED.zoom * Math.exp(-e.deltaY * (e.ctrlKey ? .01 : .002)), x, y);
  }, { passive:false });
  document.addEventListener('contextmenu', e => { if (escena().contains(e.target)) e.preventDefault(); });
})();

/* ---------- más opciones ---------- */
function menuMas(){
  const f = ED.foto, fecha = new Date(f.tomada || f.fecha).toLocaleDateString('es-CO', { day:'numeric', month:'short', year:'numeric' });
  abrirHoja(cabHoja(f.nombre) +
    '<div class="grupo">' +
      '<button data-mas="fav"><span class="izq"><svg class="ico-f" viewBox="0 0 24 24" style="color:var(--fav)">' + ICO.estrella.slice(ICO.estrella.indexOf('<path')).replace('<path', '<path' + (f.fav ? ' fill="currentColor"' : '')) + '<span>' + (f.fav ? 'Quitar de favoritas' : 'Marcar como favorita') + '</span></span></button>' +
      '<button data-mas="histo"><span>' + (ED.verHisto ? 'Ocultar histograma' : 'Mostrar histograma') + '</span></button>' +
    '</div><div class="grupo">' +
      '<button data-mas="copiar"><span>Copiar ajustes</span></button>' +
      '<button data-mas="pegar"' + (PORTAPAPELES ? '' : ' disabled style="opacity:.4"') + '><span>Pegar ajustes</span></button>' +
      '<button data-mas="versiones"><span>Versiones</span><small>' + (f.versiones.length || '') + ' ' + ICO.chev + '</small></button>' +
    '</div><div class="grupo">' +
      '<button data-mas="restablecer"><span>Restablecer todos los ajustes</span></button>' +
    '</div><div class="grupo"><div><span>Original</span><small class="num">' + f.w + ' × ' + f.h + ' · ' + fecha + '</small></div></div>' +
    '<div class="grupo"><button data-mas="eliminar" class="peligro"><span>Eliminar foto</span></button></div>');
  $('#hoja').onclick = async e => {
    const b = e.target.closest('[data-mas]'); if (!b) return;
    const q = b.dataset.mas;
    if (q === 'fav') { f.fav = !f.fav; await DB.guardar(f); cerrarHoja(); toast(f.fav ? 'Marcada como favorita' : 'Quitada de favoritas'); }
    if (q === 'histo') { ED.verHisto = !ED.verHisto; $('#histo').hidden = !ED.verHisto; try { localStorage.setItem('revelado.histo', ED.verHisto ? '1' : ''); } catch (_) {} cerrarHoja(); pedirPintura(); }
    if (q === 'copiar') { PORTAPAPELES = clonar(ED.a); try { localStorage.setItem('revelado.copiados', JSON.stringify(PORTAPAPELES)); } catch (_) {} cerrarHoja(); toast('Ajustes copiados. Pégalos en otra foto o en varias con Seleccionar.', 2600); }
    if (q === 'pegar' && PORTAPAPELES) { reemplazarAjustes(pegarAjustes(ED.a, PORTAPAPELES)); cerrarHoja(); toast('Ajustes pegados'); }
    if (q === 'versiones') hojaVersiones();
    if (q === 'restablecer') { cerrarHoja(); if (await confirmar('Restablecer ajustes', 'La foto vuelve a como la importaste. Puedes deshacerlo.', 'normal', 'Restablecer')) reemplazarAjustes(ajustesBase()); }
    if (q === 'eliminar') {
      cerrarHoja();
      if (!(await confirmar('Eliminar foto', 'Se borra de Revelado con sus ediciones. La foto de tu galería no se toca.', 'peligro'))) return;
      const id = f.id; ED.sucio = false; await soltarFoto(); await DB.eliminar(id); BIB.fotos = BIB.fotos.filter(x => x.id !== id);
      $('#v-editor').hidden = true; $('#v-biblioteca').hidden = false; pintarBiblioteca(); toast('Foto eliminada');
    }
  };
}

/* Versiones: instantáneas con nombre de los ajustes de esta foto */
function hojaVersiones(){
  const f = ED.foto;
  abrirHoja(cabHoja('Versiones') +
    '<form id="f-version"><div class="grupo"><input type="text" id="version-nombre" maxlength="40" placeholder="Versión ' + (f.versiones.length + 1) + '" autocomplete="off"></div>' +
    '<button class="btn primario bloque" type="submit">Guardar versión actual</button></form>' +
    (f.versiones.length ? '<div class="sub" style="margin-top:18px">Guardadas · toca una para aplicarla</div><div class="grupo">' + f.versiones.map((v, i) =>
      '<div><button data-ver="' + i + '" style="flex:1;text-align:left;min-height:46px">' + esc(v.nombre) + ' <small>· ' + new Date(v.fecha).toLocaleDateString('es-CO', { day:'numeric', month:'short' }) + '</small></button>' +
      '<button class="x" data-ver-borrar="' + i + '" aria-label="Eliminar versión">' + ICO.cerrar + '</button></div>').join('') + '</div>' : '<p class="ayuda" style="margin-top:14px">Guarda distintas ediciones de la misma foto y cambia entre ellas cuando quieras.</p>'));
  $('#f-version').onsubmit = async e => {
    e.preventDefault();
    f.versiones.unshift({ nombre:$('#version-nombre').value.trim() || 'Versión ' + (f.versiones.length + 1), fecha:Date.now(), ajustes:clonar(ED.a) });
    await DB.guardar(f); toast('Versión guardada'); hojaVersiones();
  };
  $('#hoja').onclick = async e => {
    const v = e.target.closest('[data-ver]'), d = e.target.closest('[data-ver-borrar]');
    if (d) { f.versiones.splice(+d.dataset.verBorrar, 1); await DB.guardar(f); hojaVersiones(); }
    else if (v) { reemplazarAjustes(f.versiones[+v.dataset.ver].ajustes); cerrarHoja(); toast('Versión aplicada'); }
  };
}
