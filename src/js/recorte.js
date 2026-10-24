/* Recortar: proporciones, enderezar, girar 90° y voltear, con el rectángulo de recorte sobre la foto.
   Mientras la pestaña está abierta se ve el marco completo; el recorte se aplica al salir de ella.
   El rectángulo vive en coordenadas 0..1 del marco orientado (tras giros y volteos). */

const PROPORCIONES = [['libre', 'Libre'], ['original', 'Original'], ['1:1', '1:1'], ['4:5', '4:5'], ['5:4', '5:4'], ['2:3', '2:3'], ['3:2', '3:2'], ['9:16', '9:16'], ['16:9', '16:9']];

function construirRecorte(){
  const p = $('#p-recortar');
  p.innerHTML = pcab('Recortar', '<button class="txt" data-reset-recorte>Restablecer</button>') +
    '<div class="chips" id="proporciones">' + PROPORCIONES.map(([k, n]) => '<button data-asp="' + k + '">' + n + '</button>').join('') + '</div><div class="ctls"></div>' +
    '<div class="chips" style="justify-content:center;gap:10px;padding-top:10px">' +
    '<button data-girar>Girar 90°</button><button data-voltear="flipH">Voltear horizontal</button><button data-voltear="flipV">Voltear vertical</button></div>';
  $('.ctls', p).appendChild(deslizador({ k:'angulo', nom:'Enderezar', min:-45, max:45, paso:.1, base:0 }, () => ED.a.geo.angulo,
    (k, v, final) => { ED.a.geo.angulo = v; encajarRecorte(ED.a.geo, ED.fuente.w, ED.fuente.h); cambiar(final); }));
  p.addEventListener('click', e => {
    const g = ED.a.geo, b = e.target.closest('button'); if (!b) return;
    if (b.dataset.asp) { g.aspecto = b.dataset.asp; aplicarProporcion(); }
    else if (b.dataset.girar !== undefined) {
      /* gira 90° a la izquierda y lleva el recorte con la foto */
      g.rot = (g.rot + 3) % 4; Object.assign(g, { x:g.y, y:1 - g.x - g.w, w:g.h, h:g.w, flipH:g.flipV, flipV:g.flipH }); /* girar un volteo horizontal lo vuelve vertical */
      const inv = { '4:5':'5:4', '5:4':'4:5', '2:3':'3:2', '3:2':'2:3', '9:16':'16:9', '16:9':'9:16' }[g.aspecto]; if (inv) g.aspecto = inv;
    }
    else if (b.dataset.voltear) { g[b.dataset.voltear] = !g[b.dataset.voltear]; if (b.dataset.voltear === 'flipH') g.x = 1 - g.x - g.w; else g.y = 1 - g.y - g.h; g.angulo = -g.angulo; }
    else if (b.dataset.resetRecorte !== undefined) Object.assign(g, clonar(GEO_DEF));
    else return;
    encajarRecorte(g, ED.fuente.w, ED.fuente.h); cambiar(true); acomodar(); sincronizarRecorte();
  });
}
function sincronizarRecorte(){ $$('#proporciones button').forEach(b => b.classList.toggle('activo', b.dataset.asp === ED.a.geo.aspecto)); }

/* Proporción buscada en píxeles (ancho / alto) o null si es libre */
function razonRecorte(){
  const g = ED.a.geo, [Wo, Ho] = marcoOrientado(g, ED.fuente.w, ED.fuente.h);
  if (g.aspecto === 'libre') return null;
  if (g.aspecto === 'original') return Wo / Ho;
  const [a, b] = g.aspecto.split(':').map(Number); return a / b;
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
  if (!modo) return false;
  RC.modo = modo; RC.ini = { x:g.x, y:g.y, w:g.w, h:g.h }; RC.p0 = [nx, ny];
  return true;
}
function recorteMover(nx, ny){
  const g = ED.a.geo, i = RC.ini, dx = nx - RC.p0[0], dy = ny - RC.p0[1], m = RC.modo, min = .06;
  const antes = { x:g.x, y:g.y, w:g.w, h:g.h };
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
  if (!recorteValido(g, ED.fuente.w, ED.fuente.h)) Object.assign(g, antes);
}
