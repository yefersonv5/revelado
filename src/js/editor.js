/* Editor: abre una foto, la pinta con el motor, guarda el historial (deshacer y rehacer) y la edición en el
   dispositivo, y maneja los gestos sobre la foto como Lightroom:
   - mantener un dedo: ver el original; pellizcar o doble toque: acercar; arrastrar con zoom: moverse
   - deslizar a los lados: otra foto; desde el borde izquierdo: volver a la biblioteca
   - tocar con dos dedos: alterna la información superpuesta (nada, histograma, datos de la cámara)
   - tocar la foto con el selector activo (balance de blancos, rango de color) o en Quitar para agregar manchas
   También el menú de más opciones, Antes y después dividido, avisos de recorte, copiar y pegar por grupos
   y las versiones. */

const ED = {
  foto:null, a:ajustesBase(), img:null, fuente:null, fuenteMini:null, srcPx:null, inicial:null,
  panel:'presets', hist:[], hi:0, sucio:false, preset:null, autoPrevio:null,
  antes:false, zoom:1, px:0, py:0, vista:{ x:0, y:0, w:1, h:1 }, res:{ w:1, h:1 },
  mascara:-1, verMascara:false, mancha:-1, modoToque:null, cursor:null,
  division:null, avisos:false, avisosTemp:false, info:0,
};
const RECORTE_TODO = { x:0, y:0, w:1, h:1 };
const modoRecorte = () => ED.panel === 'recortar';
try { ED.info = +localStorage.getItem('revelado.info') || 0; } catch (_) {}

/* ---------- abrir y cerrar ---------- */
async function abrirEditor(id){
  const foto = BIB.fotos.find(f => f.id === id); if (!foto) return;
  if (ED.foto) await soltarFoto(); else navPush('editor'); /* el gesto de atrás del sistema vuelve a la biblioteca */
  $('#v-biblioteca').hidden = true; $('#v-editor').hidden = false;
  try {
    const img = await decodificar(await DB.original(id));
    ED.foto = foto; ED.img = img;
    ED.fuente = Motor.fuente(img, esComputador() ? 3072 : 2048); ED.fuenteMini = Motor.fuente(img, 200);
  } catch (e) { console.error(e); toast('No se pudo abrir la foto'); return volverBiblioteca(); }
  foto.versiones = foto.versiones || [];
  ED.a = completarAjustes(foto.ajustes); ED.inicial = JSON.stringify(ED.a); ED.hist = [ED.inicial]; ED.hi = 0; ED.sucio = false;
  Object.assign(ED, { preset:null, autoPrevio:null, mascara:-1, verMascara:false, mancha:-1, modoToque:null, antes:false, zoom:1, px:0, py:0, srcPx:null, division:null });
  $$('.pane').forEach(p => { if (p.dataset.abierta) cerrarSub(p); });
  botonesHistorial(); refrescarTodo(true); pintarPresets(); mostrarInfo();
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
  ED.foto = ED.fuente = ED.fuenteMini = ED.img = ED.srcPx = null;
}
/* desdeHistorial: el sistema ya retrocedió (gesto de atrás); si no, se retrocede aquí para no dejar pasos colgando */
async function volverBiblioteca(desdeHistorial = false){
  if ($('#v-editor').hidden) return;
  if (!desdeHistorial) navAtras();
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
/* Llamar tras modificar ED.a. final = el gesto terminó (entra al historial). dePreset = lo hizo un preset o Auto */
function cambiar(final, dePreset = false){
  if (!dePreset) { if (ED.preset) { ED.preset = null; pintarPresets(true); } ED.autoPrevio = null; }
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
  ED.a = JSON.parse(s); ED.preset = null; ED.autoPrevio = null;
  refrescarTodo(JSON.stringify(ED.a.geo) !== geo);
  botonesHistorial(); programarGuardado();
}
/* Repinta paneles, subvistas abiertas y la foto después de un cambio que no vino de un control */
function refrescarTodo(geoCambio = true){
  if (ED.mascara >= ED.a.mascaras.length) ED.mascara = -1;
  if (ED.mancha >= ED.a.manchas.length) ED.mancha = -1;
  sincronizarPaneles(); sincronizarRecorte(); pintarPresets(true);
  $$('.pane').forEach(p => { if (p.dataset.abierta) abrirSub(p, p.dataset.abierta); });
  pintarPanelActual();
  if (geoCambio) acomodar();
  pedirPintura();
}
function deshacer(){ if (ED.hi > 0) restaurar(ED.hist[--ED.hi]); }
function rehacer(){ if (ED.hi < ED.hist.length - 1) restaurar(ED.hist[++ED.hi]); }
/* Aplica un ajuste entero (versión, pegar, restablecer) como un solo paso del historial */
function reemplazarAjustes(a){ ED.a = completarAjustes(a); ED.preset = null; ED.mascara = -1; ED.mancha = -1; cambiar(true); refrescarTodo(true); }

/* ---------- pestañas ---------- */
function pintarPanelActual(){
  const p = ED.panel;
  if (p === 'mascaras') pintarMascaras();
  if (p === 'quitar') pintarQuitar();
  if (p === 'desenfoque') pintarDesenfoque();
  if (p === 'versiones') pintarVersiones();
  $$('#herramientas [data-p="auto"]').forEach(b => b.classList.toggle('activo', !!ED.autoPrevio));
}
function elegirPanel(p){
  if (p === 'auto') return alternarAuto();
  const salia = ED.panel; ED.panel = p;
  if (ED.modoToque === 'color' && p !== 'mascaras') ED.modoToque = null;
  $$('#herramientas button').forEach(b => b.setAttribute('aria-selected', b.dataset.p === p));
  const tb = $('#herramientas [data-p="' + p + '"]'); if (tb) tb.scrollIntoView({ block:'nearest', inline:'nearest', behavior:'smooth' });
  $$('.pane').forEach(el => { el.hidden = el.id !== 'p-' + p; });
  pintarPanelActual();
  if (p === 'recortar' || salia === 'recortar') { ED.zoom = 1; ED.px = ED.py = 0; acomodar(); }
  aplicarTransformacion(); pedirPintura();
}
/* Auto como en Lightroom: un toque lo aplica y otro lo quita */
function alternarAuto(){
  if (ED.autoPrevio) { const prev = ED.autoPrevio; ED.a = prev; ED.autoPrevio = null; cambiar(true, true); toast('Auto desactivado'); }
  else { const prev = clonar(ED.a); Object.assign(ED.a, valoresAuto(ED.fuente, ED.a)); cambiar(true, true); ED.autoPrevio = prev; toast('Auto aplicado. Toca otra vez para quitarlo.'); }
  refrescarTodo(false);
}

/* ---------- versiones ---------- */
function pintarVersiones(){
  const f = ED.foto, p = $('#p-versiones'); if (!f) return;
  p.innerHTML = pcab('Versiones') +
    '<form id="f-version" class="fila-version"><input type="text" id="version-nombre" maxlength="40" placeholder="Versión ' + (f.versiones.length + 1) + '" autocomplete="off"><button class="btn primario" type="submit">Guardar</button></form>' +
    '<div class="sub">Guardadas</div>' + (f.versiones.length ? '<div class="grupo">' + f.versiones.map((v, i) =>
      '<div><button data-ver="' + i + '" style="flex:1;text-align:left;min-height:46px">' + esc(v.nombre) + ' <small>· ' + new Date(v.fecha).toLocaleDateString('es-CO', { day:'numeric', month:'short' }) + '</small></button>' +
      '<button class="x" data-ver-borrar="' + i + '" aria-label="Eliminar versión">' + ICO.cerrar + '</button></div>').join('') + '</div>' : '<p class="nota">Guarda distintas ediciones de la misma foto y cambia entre ellas cuando quieras.</p>') +
    '<div class="sub">Automáticas</div><div class="grupo"><button data-ver-inicial><span>Como estaba al abrir</span></button><button data-ver-original><span>Original, sin ajustes</span></button></div>';
  $('#f-version').onsubmit = async e => {
    e.preventDefault();
    f.versiones.unshift({ nombre:$('#version-nombre').value.trim() || 'Versión ' + (f.versiones.length + 1), fecha:Date.now(), ajustes:clonar(ED.a) });
    await DB.guardar(f); toast('Versión guardada'); pintarVersiones(); sincronizarPaneles();
  };
  p.onclick = async e => {
    const v = e.target.closest('[data-ver]'), d = e.target.closest('[data-ver-borrar]');
    if (d) { f.versiones.splice(+d.dataset.verBorrar, 1); await DB.guardar(f); pintarVersiones(); }
    else if (v) { reemplazarAjustes(f.versiones[+v.dataset.ver].ajustes); toast('Versión aplicada'); }
    else if (e.target.closest('[data-ver-inicial]')) { reemplazarAjustes(JSON.parse(ED.inicial)); toast('Volviste a como estaba al abrir'); }
    else if (e.target.closest('[data-ver-original]')) { reemplazarAjustes(ajustesBase()); toast('Foto sin ajustes. Puedes deshacerlo.'); }
  };
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
  limitarPaneo(); aplicarTransformacion(); mostrarZoom(); pedirPintura();
}
/* Conversión entre la salida (0..1 de lo que se ve) y la foto original (0..1), con toda la geometría */
let cadenaCache = { k:'', g:null };
function cadenaActual(){
  const k = JSON.stringify([ED.a.geo, CLAVES.geometria.map(c => ED.a[c]), modoRecorte(), ED.fuente.w, ED.fuente.h]);
  if (k !== cadenaCache.k) cadenaCache = { k, g:cadenaGeo(ED.a, ED.fuente.w, ED.fuente.h, modoRecorte() ? RECORTE_TODO : ED.a.geo) };
  return cadenaCache.g;
}
const salidaASrc = (u, v) => cadenaActual().ida(u, v);
const srcASalida = (x, y) => cadenaActual().vuelta(x, y);

/* ---------- pintura ---------- */
let pinturaPedida = false, histoT;
function pedirPintura(){ if (!pinturaPedida) { pinturaPedida = true; requestAnimationFrame(pintar); } }
function pintar(){
  pinturaPedida = false; if (!ED.fuente) return;
  const pinta = ED.panel === 'mascaras' && ED.a.mascaras[ED.mascara] && ED.a.mascaras[ED.mascara].tipo === 'pincel' && ED.cursor;
  Motor.revelar(ED.fuente, ED.a, { ancho:ED.res.w, alto:ED.res.h, antes:ED.antes, recorte:modoRecorte() ? RECORTE_TODO : null,
    verMascara:ED.panel === 'mascaras' && (ED.verMascara || pinta) ? ED.mascara : -1,
    division:ED.division, avisos:ED.avisos || ED.avisosTemp });
  const W = ED.vista.w, H = ED.vista.h;
  let capa = '';
  if (!ED.antes) {
    if (modoRecorte()) capa = pintarCapaRecorte(W, H);
    else if (ED.panel === 'mascaras' || ED.panel === 'desenfoque') capa = pintarCapaMascaras(W, H);
    else if (ED.panel === 'quitar') capa = pintarCapaQuitar(W, H);
    if (ED.division != null && !modoRecorte()) { const x = ED.division * W; capa += '<path class="division" d="M' + x + ' 0V' + H + '"/><circle class="nodo vivo" cx="' + x + '" cy="' + H / 2 + '" r="11" data-division="1"/>'; }
  }
  $('#capa').innerHTML = capa;
  $('#etq-antes').classList.toggle('ver', ED.antes);
  $('#etq-division').hidden = ED.division == null || modoRecorte();
  if (ED.info === 1) { clearTimeout(histoT); histoT = setTimeout(pintarHistograma, 120); }
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
/* Información superpuesta: 0 nada, 1 histograma, 2 datos de la cámara */
function mostrarInfo(){
  $('#histo').hidden = ED.info !== 1;
  const f = ED.foto, d = f && f.exif, el = $('#info');
  el.hidden = ED.info !== 2 || !f;
  if (f) el.innerHTML = '<b>' + esc(f.nombre) + '</b><br>' + (d ? [d.camara, d.objetivo].filter(Boolean).map(esc).join('<br>') + '<br>' + [d.iso, d.apertura, d.velocidad, d.focal].filter(Boolean).join(' · ') : 'Sin datos de cámara') + '<br>' + f.w + ' × ' + f.h;
  pedirPintura();
}
function alternarInfo(){ ED.info = (ED.info + 1) % 3; try { localStorage.setItem('revelado.info', ED.info); } catch (_) {} mostrarInfo(); }

/* ---------- toques sobre la foto que eligen algo ---------- */
function tocarFoto(nx, ny){
  const [x, y] = salidaASrc(nx, ny);
  if (ED.modoToque === 'bb') { Object.assign(ED.a, bbDesdeColor(muestraFoto(x, y)), { bbAuto:false }); ED.modoToque = null; cambiar(true); toast('Balance de blancos ajustado'); return true; }
  if (ED.modoToque === 'color') { elegirColorMascara(x, y); return true; }
  if (ED.panel === 'quitar') { tocarQuitar(nx, ny); return true; }
  return false;
}

/* ---------- gestos sobre la foto ---------- */
(() => {
  const PT = new Map(); let gesto = null, retener, ultimoToque = 0, ini = null, dosDedos = null;
  const escena = () => $('#escena');
  const rel = e => { const r = escena().getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const norm = e => { const r = $('#marco').getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
  const finAntes = () => { if (ED.antes) { ED.antes = false; pedirPintura(); } };

  document.addEventListener('pointerdown', e => {
    if (!escena().contains(e.target) || !ED.fuente || e.button) return;
    escena().setPointerCapture(e.pointerId);
    PT.set(e.pointerId, rel(e));
    if (PT.size === 1) {
      const [nx, ny] = norm(e), p = ED.panel;
      ini = { p:rel(e), t:Date.now(), px:ED.px, py:ED.py };
      if (e.clientX < 24) { gesto = 'nada'; return; } /* el borde izquierdo es del gesto de atrás */
      if (e.target.closest('[data-division]')) { gesto = 'division'; return; }
      if (modoRecorte() && recorteInicio(nx, ny, ED.vista.w, ED.vista.h)) { gesto = 'recorte'; return; }
      const n = (p === 'mascaras' || p === 'desenfoque') && e.target.closest('[data-nodo]');
      if (n) { mascaraInicio(n, nx, ny); gesto = n.dataset.nodo === 'elegir' ? 'nada' : 'mascara'; return; }
      const mq = p === 'quitar' && e.target.closest('[data-mancha]');
      if (mq) { quitarInicio(mq, nx, ny); gesto = 'mancha'; pedirPintura(); return; }
      const m = ED.a.mascaras[ED.mascara];
      if (p === 'mascaras' && m && m.tipo === 'pincel' && !ED.modoToque) { pincelInicio(nx, ny); gesto = 'pintar'; return; }
      gesto = 'toque';
      retener = setTimeout(() => { if (gesto === 'toque') { gesto = 'antes'; ED.antes = true; pedirPintura(); } }, 260);
    } else if (PT.size === 2 && !modoRecorte() && !['mascara', 'recorte', 'mancha', 'division'].includes(gesto)) {
      clearTimeout(retener); finAntes();
      if (gesto === 'pintar') pincelFin(true);
      const [a, b] = [...PT.values()];
      gesto = 'pellizco'; ini = { d:Math.hypot(a[0] - b[0], a[1] - b[1]), z:ED.zoom }; dosDedos = { t:Date.now(), z:ED.zoom, movio:false };
    }
  });
  document.addEventListener('pointermove', e => {
    if (!PT.has(e.pointerId)) return;
    PT.set(e.pointerId, rel(e));
    const [x, y] = rel(e), [nx, ny] = norm(e);
    if (gesto === 'division') { ED.division = clamp(nx, .02, .98); pedirPintura(); return; }
    if (gesto === 'recorte') { recorteMover(nx, ny); pedirPintura(); return; }
    if (gesto === 'mascara') { mascaraMover(nx, ny); pedirPintura(); return; }
    if (gesto === 'mancha') { quitarMover(nx, ny); pedirPintura(); return; }
    if (gesto === 'pintar') { pincelMover(nx, ny); return; }
    if (gesto === 'toque' && Math.hypot(x - ini.p[0], y - ini.p[1]) > 8) {
      clearTimeout(retener);
      gesto = ED.zoom > 1.01 ? 'paneo' : ['recortar', 'mascaras', 'quitar', 'desenfoque'].includes(ED.panel) ? 'nada' : 'barrido';
    }
    if (gesto === 'paneo') { ED.px = ini.px + x - ini.p[0]; ED.py = ini.py + y - ini.p[1]; limitarPaneo(); aplicarTransformacion(); }
    if (gesto === 'barrido') { $('#marco').style.transform = 'translate(' + (ED.vista.x + (x - ini.p[0]) * .35) + 'px,' + ED.vista.y + 'px)'; }
    if (gesto === 'pellizco' && PT.size === 2) {
      const [a, b] = [...PT.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (Math.abs(d - ini.d) > 12) dosDedos.movio = true;
      if (dosDedos.movio) zoomEn(ini.z * d / ini.d, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    }
  });
  const soltar = e => {
    if (!PT.has(e.pointerId)) return;
    const [x, y] = rel(e), [nx, ny] = norm(e); PT.delete(e.pointerId); clearTimeout(retener);
    if (gesto === 'division') { gesto = null; return; }
    if (gesto === 'recorte') { gesto = null; cambiar(true); return; }
    if (gesto === 'mascara') { gesto = null; mascaraFin(); return; }
    if (gesto === 'mancha') { gesto = null; quitarFin(); return; }
    if (gesto === 'pintar') { gesto = null; pincelFin(); return; }
    if (gesto === 'antes') { gesto = null; finAntes(); return; }
    if (gesto === 'toque' && e.type === 'pointerup') {
      if (tocarFoto(nx, ny)) { gesto = null; return; }
      const ahora = Date.now();
      if (ahora - ultimoToque < 300 && !['recortar', 'mascaras', 'desenfoque'].includes(ED.panel)) {
        ultimoToque = 0;
        if (ED.zoom > 1.01) { ED.zoom = 1; ED.px = ED.py = 0; limitarPaneo(); aplicarTransformacion(); mostrarZoom(); }
        else zoomEn(Math.max(zoom100(), 2.5), x, y);
      } else ultimoToque = ahora;
    }
    if (gesto === 'barrido') {
      const dx = x - ini.p[0], dy = y - ini.p[1];
      aplicarTransformacion();
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) navegar(dx < 0 ? 1 : -1);
    }
    if (gesto === 'pellizco') {
      if (dosDedos && !dosDedos.movio && Date.now() - dosDedos.t < 350) { dosDedos = null; gesto = PT.size ? 'nada' : null; alternarInfo(); return; }
      if (PT.size === 1) { const p = [...PT.values()][0]; gesto = 'paneo'; ini = { p, px:ED.px, py:ED.py }; return; }
      if (ED.zoom < 1.03) { ED.zoom = 1; limitarPaneo(); aplicarTransformacion(); }
    }
    if (!PT.size) gesto = null;
  };
  document.addEventListener('pointerup', soltar); document.addEventListener('pointercancel', soltar);
  /* cursor del pincel al pasar el ratón en computador */
  document.addEventListener('pointermove', e => {
    if (PT.size || e.pointerType !== 'mouse' || !escena().contains(e.target) || ED.panel !== 'mascaras') return;
    const m = ED.a.mascaras[ED.mascara]; if (!m || m.tipo !== 'pincel') return;
    ED.cursor = norm(e); pedirPintura();
  });
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
  const est = f.estrellas ? '★'.repeat(f.estrellas) : '', marca = f.marca === 'elegida' ? 'Elegida' : f.marca === 'rechazada' ? 'Rechazada' : '';
  const INFO = ['Nada', 'Histograma', 'Datos de la cámara'];
  abrirHoja(cabHoja(f.nombre) +
    '<div class="grupo">' +
      '<button data-mas="calificar"><span>Calificar</span><small>' + ([est, marca].filter(Boolean).join(' · ') || 'Sin calificar') + ' ' + ICO.chev + '</small></button>' +
      '<button data-mas="division"><span>Antes y después</span><small>' + (ED.division != null ? 'Activo' : 'Apagado') + '</small></button>' +
      '<button data-mas="avisos"><span>Avisos de recorte</span><small>' + (ED.avisos ? 'Activos' : 'Apagados') + '</small></button>' +
      '<button data-mas="info"><span>Información superpuesta</span><small>' + INFO[ED.info] + '</small></button>' +
    '</div><div class="grupo">' +
      '<button data-mas="copiar"><span>Copiar ajustes</span>' + ICO.chev + '</button>' +
      '<button data-mas="pegar"' + (PORTAPAPELES ? '' : ' disabled style="opacity:.4"') + '><span>Pegar ajustes</span></button>' +
      '<button data-mas="versiones"><span>Versiones</span><small>' + (f.versiones.length || '') + '</small></button>' +
      '<button data-mas="preset"><span>Crear preset</span></button>' +
    '</div><div class="grupo">' +
      '<button data-mas="restablecer"><span>Restablecer</span>' + ICO.chev + '</button>' +
    '</div><div class="grupo"><div><span>Original</span><small class="num">' + f.w + ' × ' + f.h + ' · ' + fecha + '</small></div>' +
      (f.exif && f.exif.camara ? '<div><span>Cámara</span><small>' + esc(f.exif.camara) + '</small></div>' : '') + '</div>' +
    '<div class="grupo"><button data-mas="eliminar" class="peligro"><span>Eliminar foto</span></button></div>');
  $('#hoja').onclick = async e => {
    const b = e.target.closest('[data-mas]'); if (!b) return;
    const q = b.dataset.mas;
    if (q === 'calificar') hojaCalificar([f]);
    if (q === 'division') { ED.division = ED.division == null ? .5 : null; cerrarHoja(); pedirPintura(); toast(ED.division != null ? 'Arrastra la línea para comparar' : 'Antes y después apagado'); }
    if (q === 'avisos') { ED.avisos = !ED.avisos; cerrarHoja(); pedirPintura(); }
    if (q === 'info') { cerrarHoja(); alternarInfo(); }
    if (q === 'copiar') hojaCopiar();
    if (q === 'pegar' && PORTAPAPELES) { reemplazarAjustes(pegarAjustes(ED.a)); cerrarHoja(); toast('Ajustes pegados'); }
    if (q === 'versiones') { cerrarHoja(); elegirPanel('versiones'); }
    if (q === 'preset') crearPreset();
    if (q === 'restablecer') hojaRestablecer();
    if (q === 'eliminar') {
      cerrarHoja();
      if (!(await confirmar('Eliminar foto', 'Se borra de Revelado con sus ediciones. La foto de tu galería no se toca.', 'peligro'))) return;
      const id = f.id; ED.sucio = false; navAtras(); await soltarFoto(); await DB.eliminar(id); BIB.fotos = BIB.fotos.filter(x => x.id !== id);
      $('#v-editor').hidden = true; $('#v-biblioteca').hidden = false; pintarBiblioteca(); toast('Foto eliminada');
    }
  };
}

/* Copiar ajustes eligiendo los grupos, como en Lightroom */
function hojaCopiar(){
  abrirHoja(cabHoja('Copiar ajustes') + '<form id="f-copiar"><div class="grupo">' + GRUPOS_COPIA.map(g =>
    '<label class="marca"><span>' + g.nom + '</span><input type="checkbox" value="' + g.k + '"' + (g.apagado ? '' : ' checked') + '></label>').join('') + '</div>' +
    '<button class="btn primario bloque" type="submit">Copiar</button></form>');
  $('#f-copiar').onsubmit = e => {
    e.preventDefault();
    PORTAPAPELES = { a:clonar(ED.a), grupos:$$('#f-copiar input:checked').map(c => c.value) };
    try { localStorage.setItem('revelado.copiados', JSON.stringify(PORTAPAPELES)); } catch (_) {}
    cerrarHoja(); toast('Ajustes copiados. Pégalos en otra foto o en varias con Seleccionar.', 2600);
  };
}
function hojaRestablecer(){
  abrirHoja(cabHoja('Restablecer') + '<div class="grupo">' +
    '<button data-rest="todo"><span>Todo</span><small>La foto como la importaste</small></button>' +
    '<button data-rest="ajustes"><span>Solo los ajustes</span><small>Conserva recorte y geometría</small></button>' +
    '<button data-rest="geo"><span>Solo recorte y geometría</span></button>' +
    '<button data-rest="abrir"><span>Como estaba al abrir</span></button></div><p class="ayuda">Puedes deshacerlo.</p>');
  $('#hoja').onclick = e => {
    const b = e.target.closest('[data-rest]'); if (!b) return;
    const r = b.dataset.rest, base = ajustesBase();
    if (r === 'todo') reemplazarAjustes(base);
    if (r === 'ajustes') reemplazarAjustes(Object.assign(base, { geo:clonar(ED.a.geo) }, Object.fromEntries(CLAVES.geometria.map(k => [k, ED.a[k]]))));
    if (r === 'geo') reemplazarAjustes(Object.assign(clonar(ED.a), { geo:clonar(GEO_DEF) }, Object.fromEntries(CLAVES.geometria.map(k => [k, DEF[k]]))));
    if (r === 'abrir') reemplazarAjustes(JSON.parse(ED.inicial));
    cerrarHoja(); toast('Restablecido');
  };
}
