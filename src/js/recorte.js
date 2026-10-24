/* Recortar y Geometría, en un mismo panel como en Lightroom.
   Recortar: proporciones, enderezar (con Auto), girar 90° y voltear, con el rectángulo sobre la foto.
   Geometría: Upright (Auto, Guiado, Nivel, Vertical, Completo), Restringir recorte y las transformaciones manuales.
   Mientras el panel está abierto se ve el marco completo; el recorte se aplica al salir de él.
   El rectángulo vive en coordenadas 0..1 del marco orientado (tras giros y volteos). */

const PROPORCIONES = [['libre', 'Libre'], ['original', 'Original'], ['1:1', '1:1'], ['4:5', '4:5'], ['5:4', '5:4'], ['8.5:11', '8,5:11'], ['5:7', '5:7'],
  ['2:3', '2:3'], ['3:2', '3:2'], ['3:4', '3:4'], ['4:3', '4:3'], ['9:16', '9:16'], ['16:9', '16:9']];
const UPRIGHT = [['', 'Apagado'], ['auto', 'Auto'], ['guiado', 'Guiado'], ['nivel', 'Nivel'], ['vertical', 'Vertical'], ['completo', 'Completo']];
let vistaRecorte = 'recortar';

function construirRecorte(){
  $('#p-recortar').addEventListener('click', e => {
    const g = ED.a.geo, b = e.target.closest('button'); if (!b) return;
    if (b.dataset.vistaRec) { vistaRecorte = b.dataset.vistaRec; ED.dibujandoGuias = false; pintarRecorte(); pedirPintura(); return; }
    if (b.dataset.upright !== undefined) {
      const m = b.dataset.upright;
      if (!m) { Object.assign(ED.a, { upright:'', rotar:0, vertical:0, horizontal:0 }); cambiar(true); }
      else if (m === 'guiado') { ED.a.upright = 'guiado'; toast('Dibuja sobre la foto 2 a 4 líneas que deban quedar rectas', 2600); }
      else if (!aplicarUpright(m)) return toast('No encontré suficientes líneas rectas en esta foto. Prueba Guiado.', 2600);
      else cambiar(true);
      pintarRecorte(); pedirPintura(); return;
    }
    if (b.dataset.guiasBorrar !== undefined) { ED.a.guias = []; Object.assign(ED.a, { rotar:0, vertical:0, horizontal:0 }); cambiar(true); pintarRecorte(); return; }
    if (b.dataset.restringirRec !== undefined) { ED.a.restringir = ED.a.restringir ? 0 : 1; cambiar(true); pintarRecorte(); return; }
    if (b.dataset.resetGeo !== undefined) { CLAVES.geometria.forEach(k => { ED.a[k] = DEF[k]; }); ED.a.upright = ''; ED.a.guias = []; cambiar(true); pintarRecorte(); return; }
    if (b.dataset.autoEnderezar !== undefined) { if (!enderezarAuto()) return toast('No encontré un horizonte o líneas rectas para nivelar'); }
    else if (b.dataset.asp) { g.aspecto = b.dataset.asp; aplicarProporcion(); }
    else if (b.dataset.girar !== undefined) {
      /* gira 90° a la izquierda y lleva el recorte con la foto */
      g.rot = (g.rot + 3) % 4; Object.assign(g, { x:g.y, y:1 - g.x - g.w, w:g.h, h:g.w, flipH:g.flipV, flipV:g.flipH }); /* girar un volteo horizontal lo vuelve vertical */
      const [x, y] = g.aspecto.split(':'); if (y && x !== y) g.aspecto = y + ':' + x;
      ED.a.guias = [];
    }
    else if (b.dataset.voltear) { g[b.dataset.voltear] = !g[b.dataset.voltear]; if (b.dataset.voltear === 'flipH') g.x = 1 - g.x - g.w; else g.y = 1 - g.y - g.h; g.angulo = -g.angulo; ED.a.guias = []; }
    else if (b.dataset.resetRecorte !== undefined) Object.assign(g, clonar(GEO_DEF));
    else return;
    encajarRecorte(ED.a, ED.fuente.w, ED.fuente.h); cambiar(true); acomodar(); pintarRecorte();
  });
}
function pintarRecorte(){
  const p = $('#p-recortar'), a = ED.a;
  let h = '<div class="segmento" style="margin:4px 0 2px"><button data-vista-rec="recortar" aria-selected="' + (vistaRecorte === 'recortar') + '">Recortar</button>' +
    '<button data-vista-rec="geometria" aria-selected="' + (vistaRecorte === 'geometria') + '">Geometría</button></div>';
  if (vistaRecorte === 'recortar') {
    h += pcab('Proporción', '<button class="txt" data-auto-enderezar>Auto</button><button class="txt" data-reset-recorte>Restablecer</button>') +
      '<div class="chips" id="proporciones">' + PROPORCIONES.map(([k, n]) => '<button data-asp="' + k + '" class="' + (a.geo.aspecto === k ? 'activo' : '') + '">' + n + '</button>').join('') + '</div><div class="ctls"></div>' +
      '<div class="chips" style="justify-content:center;gap:10px;padding-top:10px">' +
      '<button data-girar>Girar 90°</button><button data-voltear="flipH">Voltear horizontal</button><button data-voltear="flipV">Voltear vertical</button></div>' +
      '<p class="nota">Arrastra fuera del recuadro para enderezar a mano.</p>';
  } else {
    h += pcab('Upright', '<button class="txt" data-reset-geo>Restablecer</button>') +
      '<div class="chips">' + UPRIGHT.map(([k, n]) => '<button data-upright="' + k + '" class="' + (a.upright === k ? 'activo' : '') + '">' + n + '</button>').join('') + '</div>' +
      (a.upright === 'guiado' ? '<p class="nota">Dibuja de 2 a 4 líneas sobre bordes que deban quedar rectos (verticales u horizontales). ' + a.guias.length + ' de 4.' +
        (a.guias.length ? ' <button class="txt" data-guias-borrar style="min-height:0;padding:0">Borrar guías</button>' : '') + '</p>' : '') +
      '<div class="grupo"><label class="marca"><span>Restringir recorte</span><input type="checkbox" data-restringir-rec' + (a.restringir ? ' checked' : '') + '></label></div>' +
      '<div class="sub">Transformación manual</div><div class="ctls"></div>';
  }
  p.innerHTML = h;
  const c = $('.ctls', p);
  if (vistaRecorte === 'recortar') c.appendChild(deslizador({ k:'angulo', nom:'Enderezar', min:-45, max:45, paso:.1, base:0 }, () => ED.a.geo.angulo,
    (k, v, final) => { ED.a.geo.angulo = v; encajarRecorte(ED.a, ED.fuente.w, ED.fuente.h); cambiar(final); }));
  else PANELES.geometria.forEach(d => c.appendChild(deslizador(d, k => ED.a[k], (k, v, f) => { ED.a[k] = v; if (f && ['rotar', 'vertical', 'horizontal'].includes(k)) ED.a.upright = ''; cambiar(f); })));
  const chk = $('[data-restringir-rec]', p); if (chk) chk.onchange = () => { ED.a.restringir = chk.checked ? 1 : 0; cambiar(true); };
}
function sincronizarRecorte(){ if (ED.panel === 'recortar') $$('#proporciones button').forEach(b => b.classList.toggle('activo', b.dataset.asp === ED.a.geo.aspecto)); }

/* Proporción buscada en píxeles (ancho / alto) o null si es libre */
function razonRecorte(){
  const g = ED.a.geo, [Wo, Ho] = marcoOrientado(g, ED.fuente.w, ED.fuente.h);
  if (g.aspecto === 'libre') return null;
  if (g.aspecto === 'original') return Wo / Ho;
  const [a, b] = g.aspecto.split(':').map(parseFloat); return a / b;
}
/* El recorte más grande con la proporción elegida, centrado donde estaba */
function aplicarProporcion(){
  const g = ED.a.geo, r = razonRecorte(); if (!r) return;
  const [Wo, Ho] = marcoOrientado(g, ED.fuente.w, ED.fuente.h);
  let w = 1, h = Wo / (r * Ho); if (h > 1) { h = 1; w = r * Ho / Wo; }
  const cx = g.x + g.w / 2, cy = g.y + g.h / 2;
  Object.assign(g, { w, h, x:clamp(cx - w / 2, 0, 1 - w), y:clamp(cy - h / 2, 0, 1 - h) });
}

/* ---------- capa sobre la foto ---------- */
function pintarCapaRecorte(W, H){
  const g = ED.a.geo, x = g.x * W, y = g.y * H, w = g.w * W, h = g.h * H, l = Math.min(22, w / 3, h / 3);
  let s = '<path class="sombra" fill-rule="evenodd" d="M0 0H' + W + 'V' + H + 'H0Z M' + x + ' ' + y + 'h' + w + 'v' + h + 'h' + -w + 'Z"/>';
  for (let i = 1; i < 3; i++) s += '<path class="tercio" d="M' + (x + w * i / 3) + ' ' + y + 'v' + h + 'M' + x + ' ' + (y + h * i / 3) + 'h' + w + '"/>';
  s += '<rect class="rect" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '"/>';
  s += '<path class="asa" d="M' + x + ' ' + (y + l) + 'V' + y + 'H' + (x + l) + 'M' + (x + w - l) + ' ' + y + 'H' + (x + w) + 'V' + (y + l) +
    'M' + (x + w) + ' ' + (y + h - l) + 'V' + (y + h) + 'H' + (x + w - l) + 'M' + (x + l) + ' ' + (y + h) + 'H' + x + 'V' + (y + h - l) + '"/>';
  return s;
}

/* Arrastre del recorte: esquinas, bordes o mover todo. Devuelve true si tomó el gesto. */
const RC = { modo:null, ini:null, p0:null };
function recorteInicio(nx, ny, W, H){
  const g = ED.a.geo, tol = 28, px = nx * W, py = ny * H;
  const bordes = { l:Math.abs(px - g.x * W) < tol, r:Math.abs(px - (g.x + g.w) * W) < tol, t:Math.abs(py - g.y * H) < tol, b:Math.abs(py - (g.y + g.h) * H) < tol };
  const dentroX = px > g.x * W - tol && px < (g.x + g.w) * W + tol, dentroY = py > g.y * H - tol && py < (g.y + g.h) * H + tol;
  let modo = '';
  if (dentroY) { if (bordes.l) modo += 'l'; else if (bordes.r) modo += 'r'; }
  if (dentroX) { if (bordes.t) modo += 't'; else if (bordes.b) modo += 'b'; }
  if (!modo && px > g.x * W && px < (g.x + g.w) * W && py > g.y * H && py < (g.y + g.h) * H) modo = 'mover';
  /* fuera del recorte: arrastrar en círculo endereza la foto, como en Lightroom */
  if (!modo) modo = 'girar';
  RC.modo = modo; RC.ini = { x:g.x, y:g.y, w:g.w, h:g.h, ang:g.angulo }; RC.p0 = [nx, ny];
  RC.c = [(g.x + g.w / 2) * W, (g.y + g.h / 2) * H]; RC.a0 = Math.atan2(py - RC.c[1], px - RC.c[0]); RC.W = W; RC.H = H;
  return true;
}
function recorteMover(nx, ny){
  const g = ED.a.geo, i = RC.ini, dx = nx - RC.p0[0], dy = ny - RC.p0[1], m = RC.modo, min = .06;
  const antes = { x:g.x, y:g.y, w:g.w, h:g.h };
  if (m === 'girar') {
    const a1 = Math.atan2(ny * RC.H - RC.c[1], nx * RC.W - RC.c[0]);
    let d = (a1 - RC.a0) * 180 / Math.PI; if (d > 180) d -= 360; if (d < -180) d += 360;
    g.angulo = +clamp(i.ang - d, -45, 45).toFixed(1); Object.assign(g, { x:i.x, y:i.y, w:i.w, h:i.h });
    encajarRecorte(ED.a, ED.fuente.w, ED.fuente.h); $$('#p-recortar .ctl').forEach(c => c.sync()); return;
  }
  if (m === 'mover') { g.x = clamp(i.x + dx, 0, 1 - i.w); g.y = clamp(i.y + dy, 0, 1 - i.h); }
  else {
    let x0 = i.x, y0 = i.y, x1 = i.x + i.w, y1 = i.y + i.h;
    if (m.includes('l')) x0 = clamp(x0 + dx, 0, x1 - min); if (m.includes('r')) x1 = clamp(x1 + dx, x0 + min, 1);
    if (m.includes('t')) y0 = clamp(y0 + dy, 0, y1 - min); if (m.includes('b')) y1 = clamp(y1 + dy, y0 + min, 1);
    const r = razonRecorte();
    if (r) {
      /* conserva la proporción: manda el lado que más se movió; el otro crece desde el borde fijo o el centro */
      const [Wo, Ho] = marcoOrientado(g, ED.fuente.w, ED.fuente.h);
      let w = x1 - x0, h = y1 - y0;
      const lateral = m === 'l' || m === 'r', vertical = m === 't' || m === 'b';
      if (lateral || (!vertical && Math.abs(dx) * Wo >= Math.abs(dy) * Ho)) h = w * Wo / (r * Ho); else w = h * r * Ho / Wo;
      if (w > 1) { w = 1; h = w * Wo / (r * Ho); } if (h > 1) { h = 1; w = h * r * Ho / Wo; }
      if (lateral) { const cy = i.y + i.h / 2; y0 = cy - h / 2; } else if (m.includes('t')) y0 = y1 - h;
      if (vertical) { const cx = i.x + i.w / 2; x0 = cx - w / 2; } else if (m.includes('l')) x0 = x1 - w;
      x1 = x0 + w; y1 = y0 + h;
      if (x0 < 0 || y0 < 0 || x1 > 1 || y1 > 1) return;
    }
    Object.assign(g, { x:x0, y:y0, w:x1 - x0, h:y1 - y0 });
  }
  if (!recorteValido(ED.a, ED.fuente.w, ED.fuente.h)) Object.assign(g, antes);
}
