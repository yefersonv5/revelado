/* Upright, como en Lightroom: detecta líneas rectas de la foto (o usa las guías que dibujas) y calcula
   la rotación y la perspectiva que las dejan verticales y horizontales.
   Modos: Auto (equilibrado), Nivel (solo el horizonte), Vertical (horizonte y verticales), Completo
   (todo) y Guiado (tus líneas). Las líneas se guardan en el marco orientado de la foto sin corregir (0..1). */

/* ---------- detección de líneas: bordes de Sobel y transformada de Hough guiada por la dirección del borde ---------- */
let lineasCache = null;
function detectarLineas(){
  const geo = ED.a.geo, clave = ED.foto.id + JSON.stringify([geo.rot, geo.flipH, geo.flipV]);
  if (lineasCache && lineasCache.clave === clave) return lineasCache.lineas;
  const p = pixelesFoto(), W = p.width, H = p.height, d = p.data, N = W * H;
  const gris = new Float32Array(N);
  for (let i = 0; i < N; i++) gris[i] = .299 * d[i * 4] + .587 * d[i * 4 + 1] + .114 * d[i * 4 + 2];
  const mag = new Float32Array(N), ang = new Float32Array(N);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x, g = j => gris[j];
    const gx = g(i - W + 1) + 2 * g(i + 1) + g(i + W + 1) - g(i - W - 1) - 2 * g(i - 1) - g(i + W - 1);
    const gy = g(i + W - 1) + 2 * g(i + W) + g(i + W + 1) - g(i - W - 1) - 2 * g(i - W) - g(i - W + 1);
    mag[i] = Math.hypot(gx, gy); ang[i] = Math.atan2(gy, gx);
  }
  /* umbral: el 9 % de los bordes más fuertes */
  const muestra = []; for (let i = 0; i < N; i += 37) muestra.push(mag[i]); muestra.sort((a, b) => a - b);
  const umbral = Math.max(40, muestra[Math.floor(muestra.length * .91)]);
  const bordes = []; for (let i = 0; i < N; i++) if (mag[i] > umbral) bordes.push(i);
  /* votación: cada borde vota solo por ángulos cercanos a su normal */
  const R = Math.ceil(Math.hypot(W, H)), T = 180, acc = new Int32Array(T * (2 * R + 1));
  const cos = new Float32Array(T), sin = new Float32Array(T);
  for (let t = 0; t < T; t++) { cos[t] = Math.cos(t * Math.PI / 180); sin[t] = Math.sin(t * Math.PI / 180); }
  for (const i of bordes) {
    const x = i % W, y = (i / W) | 0; let t0 = Math.round(((ang[i] * 180 / Math.PI) + 360) % 180);
    for (let k = -3; k <= 3; k++) { const t = (t0 + k + T) % T, r = Math.round(x * cos[t] + y * sin[t]) + R; acc[t * (2 * R + 1) + r]++; }
  }
  /* picos con supresión de vecinos */
  const minVotos = Math.min(W, H) * .1, picos = [];
  for (let t = 0; t < T; t++) for (let r = 2; r < 2 * R - 1; r++) {
    const v = acc[t * (2 * R + 1) + r]; if (v < minVotos) continue;
    let max = true;
    for (let dt = -2; dt <= 2 && max; dt++) for (let dr = -3; dr <= 3; dr++) { const tt = (t + dt + T) % T; if (acc[tt * (2 * R + 1) + r + dr] > v) { max = false; break; } }
    if (max) picos.push([v, t, r - R]);
  }
  picos.sort((a, b) => b[0] - a[0]);
  /* cada pico se vuelve un segmento: el tramo continuo más largo de bordes sobre esa recta */
  const lineas = [], Lmin = Math.max(W, H) * .12;
  for (const [, t, r] of picos.slice(0, 40)) {
    const proy = [];
    for (const i of bordes) {
      const x = i % W, y = (i / W) | 0;
      if (Math.abs(x * cos[t] + y * sin[t] - r) > 1.5) continue;
      const da = Math.abs((((ang[i] * 180 / Math.PI) - t) % 180 + 180) % 180); if (Math.min(da, 180 - da) > 8) continue;
      proy.push(-x * sin[t] + y * cos[t]);
    }
    if (proy.length < Lmin * .5) continue;
    proy.sort((a, b) => a - b);
    let ini = proy[0], mejor = [0, 0];
    for (let k = 1; k <= proy.length; k++) {
      if (k === proy.length || proy[k] - proy[k - 1] > 6) { if (proy[k - 1] - ini > mejor[1] - mejor[0]) mejor = [ini, proy[k - 1]]; if (k < proy.length) ini = proy[k]; }
    }
    if (mejor[1] - mejor[0] < Lmin) continue;
    const punto = s => [r * cos[t] - s * sin[t], r * sin[t] + s * cos[t]];
    const [a, b] = [punto(mejor[0]), punto(mejor[1])];
    /* a coordenadas 0..1 del marco orientado */
    const I = afInv(matrizFoto(geo)), A = afAplicar(I, a[0] / W, a[1] / H), B = afAplicar(I, b[0] / W, b[1] / H);
    lineas.push([A[0], A[1], B[0], B[1]]);
  }
  lineasCache = { clave, lineas };
  return lineas;
}

/* ---------- cálculo de la corrección ---------- */
/* Ángulo de una línea ya corregida, en grados, respecto a su eje (vertical u horizontal) */
function errorLinea(l, p, esVertical){
  const inv = o => { let x = o.slice(); for (let i = 0; i < 14; i++) { const d = deformar(x, p); x = [x[0] + o[0] - d[0], x[1] + o[1] - d[1]]; } return x; };
  const A = inv([l[0], l[1]]), B = inv([l[2], l[3]]);
  const dx = (B[0] - A[0]) * p.wo[0], dy = (B[1] - A[1]) * p.wo[1];
  let e = esVertical ? Math.atan2(dx, dy) : Math.atan2(dy, dx);
  e = e * 180 / Math.PI; while (e > 90) e -= 180; while (e < -90) e += 180;
  return clamp(e, -20, 20);
}
const esVerticalL = (l, wo, tol) => { const a = Math.abs(Math.atan2((l[2] - l[0]) * wo[0], (l[3] - l[1]) * wo[1]) * 180 / Math.PI) % 180; return Math.min(a, 180 - a) < tol; };
const esHorizontalL = (l, wo, tol) => { const a = Math.abs(Math.atan2((l[3] - l[1]) * wo[1], (l[2] - l[0]) * wo[0]) * 180 / Math.PI) % 180; return Math.min(a, 180 - a) < tol; };

/* Resuelve un modo de Upright y deja los valores en el ajuste. Devuelve false si no hay líneas suficientes */
function aplicarUpright(modo){
  const a = ED.a, base = paramGeo(Object.assign({}, a, { rotar:0, vertical:0, horizontal:0, restringir:0 }), ED.fuente.w, ED.fuente.h, true);
  const guiado = modo === 'guiado', todas = guiado ? a.guias : detectarLineas();
  const ver = todas.filter(l => esVerticalL(l, base.wo, guiado ? 45 : 22)), hor = todas.filter(l => !esVerticalL(l, base.wo, guiado ? 45 : 22) && esHorizontalL(l, base.wo, guiado ? 45 : 12));
  const largo = l => Math.hypot((l[2] - l[0]) * base.wo[0], (l[3] - l[1]) * base.wo[1]);
  let vars = [], lineas = [];
  if (modo === 'nivel') { vars = ['rot']; lineas = hor.length ? hor.map(l => [l, false]) : ver.map(l => [l, true]); }
  else if (modo === 'vertical') { vars = ['rot', 'ver']; lineas = ver.map(l => [l, true]).concat(hor.map(l => [l, false])); }
  else { vars = ['rot', 'ver', 'hor']; lineas = ver.map(l => [l, true]).concat(hor.map(l => [l, false])); }
  if (modo === 'vertical' && ver.length < 2) return false;
  if (!lineas.length || (modo !== 'nivel' && lineas.length < 2)) return false;
  if (!hor.length) vars = vars.filter(v => v !== 'hor');
  const p = Object.assign({}, base), lim = { rot:10 * Math.PI / 180, ver:1, hor:1 };
  const costo = () => lineas.reduce((s, [l, v]) => { const e = errorLinea(l, p, v); return s + e * e * largo(l); }, 0);
  let mejor = costo();
  for (const paso of [.2, .05, .012, .003]) for (let vuelta = 0; vuelta < 12; vuelta++) {
    let mejoro = false;
    for (const v of vars) for (const sgn of [1, -1]) {
      const antes = p[v], dv = (v === 'rot' ? paso * .5 : paso) * sgn;
      p[v] = clamp(antes + dv, -lim[v], lim[v]); const c = costo();
      if (c < mejor - 1e-9) { mejor = c; mejoro = true; } else p[v] = antes;
    }
    if (!mejoro) break;
  }
  const k = modo === 'auto' ? .8 : 1; /* Auto equilibra: no lleva la perspectiva al extremo */
  a.rotar = +clamp(p.rot * 180 / Math.PI, -10, 10).toFixed(1);
  a.vertical = Math.round(clamp(p.ver * 100 * k, -100, 100)); a.horizontal = Math.round(clamp(p.hor * 100 * k, -100, 100));
  a.upright = modo; a.restringir = 1;
  return true;
}
/* Auto en Recortar: solo nivela con el ángulo de enderezar */
function enderezarAuto(){
  const geo = ED.a.geo, base = paramGeo(ED.a, ED.fuente.w, ED.fuente.h, true), lineas = detectarLineas();
  const hor = lineas.filter(l => esHorizontalL(l, base.wo, 12)), ver = lineas.filter(l => esVerticalL(l, base.wo, 12));
  const usar = hor.length ? hor.map(l => [l, false]) : ver.map(l => [l, true]); if (!usar.length) return false;
  /* ángulo medio ponderado por largo, medido en píxeles del marco orientado */
  let s = 0, n = 0;
  for (const [l, v] of usar) {
    const dx = (l[2] - l[0]) * base.wo[0], dy = (l[3] - l[1]) * base.wo[1], L = Math.hypot(dx, dy);
    let e = (v ? Math.atan2(dx, dy) : Math.atan2(dy, dx)) * 180 / Math.PI; while (e > 90) e -= 180; while (e < -90) e += 180;
    if (Math.abs(e) < 15) { s += e * L; n += L; }
  }
  if (!n) return false;
  geo.angulo = +clamp(s / n, -45, 45).toFixed(1); /* las líneas se miden en la foto sin enderezar */
  return true;
}

/* ---------- guías dibujadas (Upright guiado) ---------- */
function oOriginalDesdePantalla(nx, ny){
  const M1 = matrizSalida(ED.a.geo, ED.fuente.w, ED.fuente.h, RECORTE_TODO), o = afAplicar(M1, nx, ny);
  return deformar(o, paramGeo(ED.a, ED.fuente.w, ED.fuente.h));
}
function pantallaDesdeOOriginal(o){
  const p = paramGeo(ED.a, ED.fuente.w, ED.fuente.h); let x = o.slice();
  for (let i = 0; i < 14; i++) { const d = deformar(x, p); x = [x[0] + o[0] - d[0], x[1] + o[1] - d[1]]; }
  return afAplicar(afInv(matrizSalida(ED.a.geo, ED.fuente.w, ED.fuente.h, RECORTE_TODO)), x[0], x[1]);
}
let guiaNueva = null;
function guiaInicio(nx, ny){ const o = oOriginalDesdePantalla(nx, ny); guiaNueva = [o[0], o[1], o[0], o[1]]; }
function guiaMover(nx, ny){ if (!guiaNueva) return; const o = oOriginalDesdePantalla(nx, ny); guiaNueva[2] = o[0]; guiaNueva[3] = o[1]; }
function guiaFin(){
  const g = guiaNueva; guiaNueva = null; if (!g) return;
  if (Math.hypot(g[2] - g[0], g[3] - g[1]) < .05) { pedirPintura(); return; }
  if (ED.a.guias.length >= 4) ED.a.guias.shift();
  ED.a.guias.push(g.map(v => +v.toFixed(4)));
  if (ED.a.guias.length >= 2 || esVerticalL(g, paramGeo(ED.a, ED.fuente.w, ED.fuente.h).wo, 45)) aplicarUpright('guiado');
  cambiar(true); pintarRecorte();
}
function pintarCapaGuias(W, H){
  const todas = ED.a.guias.concat(guiaNueva ? [guiaNueva] : []);
  return todas.map(g => { const A = pantallaDesdeOOriginal([g[0], g[1]]), B = pantallaDesdeOOriginal([g[2], g[3]]);
    return '<path class="guia" d="M' + A[0] * W + ' ' + A[1] * H + 'L' + B[0] * W + ' ' + B[1] * H + '"/><circle class="nodo chico" r="5" cx="' + A[0] * W + '" cy="' + A[1] * H + '"/><circle class="nodo chico" r="5" cx="' + B[0] * W + '" cy="' + B[1] * H + '"/>'; }).join('');
}
