/* Curva de tonos: interpolación suave sin rebotes (Fritsch-Carlson), tabla de 256 valores para el motor
   y el editor táctil de puntos con canales RGB, rojo, verde y azul. */

/* Devuelve una función x -> y que pasa por los puntos sin crear oscilaciones */
function interpolador(pts){
  const p = pts.slice().sort((a, b) => a[0] - b[0]), n = p.length;
  if (n < 2) return x => x;
  const dx = [], m = [], t = new Array(n);
  for (let i = 0; i < n - 1; i++) { dx[i] = Math.max(1e-6, p[i + 1][0] - p[i][0]); m[i] = (p[i + 1][1] - p[i][1]) / dx[i]; }
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  return x => {
    if (x <= p[0][0]) return p[0][1];
    if (x >= p[n - 1][0]) return p[n - 1][1];
    let i = 0; while (x > p[i + 1][0]) i++;
    const h = dx[i], u = (x - p[i][0]) / h, u2 = u * u, u3 = u2 * u;
    return clamp((2 * u3 - 3 * u2 + 1) * p[i][1] + (u3 - 2 * u2 + u) * h * t[i] + (-2 * u3 + 3 * u2) * p[i + 1][1] + (u3 - u2) * h * t[i + 1], 0, 1);
  };
}

/* Tabla para el motor: cada canal pasa primero por la curva RGB y luego por la suya */
function curvaLUT(cv){
  const fm = interpolador(cv.rgb), fr = interpolador(cv.r), fg = interpolador(cv.g), fb = interpolador(cv.b);
  const out = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const m = fm(i / 255);
    out[i * 4] = Math.round(fr(m) * 255); out[i * 4 + 1] = Math.round(fg(m) * 255); out[i * 4 + 2] = Math.round(fb(m) * 255); out[i * 4 + 3] = 255;
  }
  return out;
}

/* ---------- editor ----------
   Tocar en un lugar vacío agrega un punto; arrastrar lo mueve; doble toque o sacarlo del cuadro lo borra. */
const CANALES = [ { k:'rgb', color:'#FFFFFF' }, { k:'r', color:'#FF5A52' }, { k:'g', color:'#3FCB61' }, { k:'b', color:'#4C8DFF' } ];
let canalCurva = 'rgb';

function htmlCurva(){
  return '<div class="curva-canal" role="radiogroup" aria-label="Canal">' + CANALES.map(c =>
    '<button data-canal="' + c.k + '" style="background:' + c.color + '" aria-label="Canal ' + (c.k === 'rgb' ? 'RGB' : c.k.toUpperCase()) + '"></button>').join('') +
    '<span class="flex"></span><button class="txt" data-curva-reset style="font-size:15px">Restablecer</button></div>' +
    '<svg id="curva-svg" viewBox="0 0 256 256"></svg><p class="nota">Toca para agregar un punto. Doble toque o arrástralo afuera para quitarlo.</p>';
}

/* Pinta la curva del canal activo. alCambiar(soltó) se llama al mover (false) y al soltar (true). */
function montarCurva(raiz, leer, alCambiar){
  const svg = $('#curva-svg', raiz);
  const pintar = () => {
    const cv = leer(), pts = cv[canalCurva], f = interpolador(pts), col = CANALES.find(c => c.k === canalCurva).color;
    let d = ''; for (let i = 0; i <= 64; i++) { const x = i / 64; d += (i ? 'L' : 'M') + (x * 256).toFixed(1) + ' ' + ((1 - f(x)) * 256).toFixed(1); }
    let h = '';
    for (let i = 1; i < 4; i++) h += '<path class="reja" d="M' + i * 64 + ' 0V256M0 ' + i * 64 + 'H256"/>';
    h += '<path class="reja" d="M0 256L256 0" stroke-dasharray="3 4"/>';
    h += '<path class="linea" d="' + d + '" stroke="' + col + '"/>';
    pts.forEach((p, i) => { h += '<circle class="pto' + (i === sel ? ' sel' : '') + '" cx="' + p[0] * 256 + '" cy="' + (1 - p[1]) * 256 + '" r="7"/>'; });
    svg.innerHTML = h;
    $$('[data-canal]', raiz).forEach(b => b.classList.toggle('activo', b.dataset.canal === canalCurva));
  };
  let sel = -1, arrastra = false, ultimoToque = 0;
  const pos = e => { const r = svg.getBoundingClientRect(); return [clamp((e.clientX - r.left) / r.width, 0, 1), clamp(1 - (e.clientY - r.top) / r.height, 0, 1), (e.clientY - r.top) / r.height]; };
  svg.addEventListener('pointerdown', e => {
    e.preventDefault(); svg.setPointerCapture(e.pointerId);
    const pts = leer()[canalCurva], [x, y] = pos(e);
    let cerca = -1, dmin = 0.06;
    pts.forEach((p, i) => { const dd = Math.hypot(p[0] - x, p[1] - y); if (dd < dmin) { dmin = dd; cerca = i; } });
    const ahora = Date.now();
    if (cerca >= 0 && ahora - ultimoToque < 320 && cerca === sel && cerca > 0 && cerca < pts.length - 1) { pts.splice(cerca, 1); sel = -1; pintar(); alCambiar(true); return; }
    ultimoToque = ahora;
    if (cerca < 0) { pts.push([x, y]); pts.sort((a, b) => a[0] - b[0]); cerca = pts.findIndex(p => p[0] === x && p[1] === y); }
    sel = cerca; arrastra = true; pintar(); alCambiar(false);
  });
  svg.addEventListener('pointermove', e => {
    if (!arrastra || sel < 0) return;
    const pts = leer()[canalCurva], [x, y, yb] = pos(e), n = pts.length;
    const lo = sel === 0 ? 0 : pts[sel - 1][0] + .01, hi = sel === n - 1 ? 1 : pts[sel + 1][0] - .01;
    pts[sel] = [clamp(x, lo, hi), y];
    if (sel > 0 && sel < n - 1 && (yb > 1.12 || yb < -0.12)) { pts.splice(sel, 1); sel = -1; arrastra = false; }
    pintar(); alCambiar(false);
  });
  const soltar = () => { if (arrastra) { arrastra = false; alCambiar(true); } };
  svg.addEventListener('pointerup', soltar); svg.addEventListener('pointercancel', soltar);
  raiz.onclick = e => {
    const c = e.target.closest('[data-canal]'); if (c) { canalCurva = c.dataset.canal; sel = -1; pintar(); }
    if (e.target.closest('[data-curva-reset]')) { leer()[canalCurva] = [[0, 0], [1, 1]]; sel = -1; pintar(); alCambiar(true); }
  };
  pintar();
  return pintar;
}
