/* Máscaras: ajustes locales con degradado lineal (cielos, suelos) o radial (resaltar un sujeto).
   Hasta 8 por foto. La forma se edita arrastrando sus puntos sobre la foto; las posiciones se guardan en
   coordenadas de la foto original, así siguen en su lugar aunque cambie el recorte. */

const MAX_MASCARAS = 8;
const ICO_M = {
  lineal:'<svg viewBox="0 0 24 24"><path d="M4 8h16M4 16h16" /><path d="M12 5v14" stroke-dasharray="2 2.5"/></svg>',
  radial:'<svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="8" ry="6"/><ellipse cx="12" cy="12" rx="4.5" ry="3" stroke-dasharray="2 2"/></svg>',
  mas:'<svg viewBox="0 0 24 24"><path d="M12 6v12M6 12h12"/></svg>',
};
const mascaraSel = () => ED.a.mascaras[ED.mascara] || null;

function pintarMascaras(){
  const p = $('#p-mascaras'), ms = ED.a.mascaras, m = mascaraSel();
  const n = { lineal:0, radial:0 };
  let h = pcab('Máscaras', ms.length ? '<button class="txt" data-m="ver" aria-pressed="' + ED.verMascara + '">' + (ED.verMascara ? 'Ocultar zona' : 'Ver zona') + '</button>' : '') +
    '<div class="lista-m">' + ms.map((x, i) => '<button data-msel="' + i + '" class="' + (i === ED.mascara ? 'activo' : '') + '"><span class="ico">' + ICO_M[x.tipo] + '</span>' +
      (x.tipo === 'lineal' ? 'Lineal ' : 'Radial ') + (++n[x.tipo]) + '</button>').join('');
  if (ms.length < MAX_MASCARAS) h += '<button data-madd="lineal"><span class="ico">' + ICO_M.mas + '</span>Lineal</button><button data-madd="radial"><span class="ico">' + ICO_M.mas + '</span>Radial</button>';
  h += '</div>';
  if (!m) h += '<p class="nota">La máscara lineal es un degradado: ideal para oscurecer un cielo o aclarar el suelo. La radial resalta o apaga un sujeto. Después arrastra sus puntos sobre la foto.</p>';
  else h += '<div class="chips"><button data-m="invertir" class="' + (m.invertir ? 'activo' : '') + '">Invertir</button><button data-m="duplicar">Duplicar</button><button data-m="eliminar">Eliminar</button></div><div class="ctls"></div>';
  p.innerHTML = h;
  if (m) {
    const c = $('.ctls', p);
    if (m.tipo === 'radial') c.appendChild(deslizador({ k:'desv', nom:'Desvanecer', min:0, max:100, base:50 }, () => mascaraSel().desv, (k, v, f) => { mascaraSel().desv = v; cambiar(f); }));
    AJ_MASCARA.forEach(d => c.appendChild(deslizador(d, k => mascaraSel().a[k], (k, v, f) => { mascaraSel().a[k] = v; cambiar(f); })));
  }
}

function construirMascaras(){
  $('#p-mascaras').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const ms = ED.a.mascaras;
    if (b.dataset.msel) ED.mascara = +b.dataset.msel === ED.mascara ? -1 : +b.dataset.msel;
    else if (b.dataset.madd) {
      /* nace en el centro de lo que se ve; la lineal, del borde de arriba hacia la mitad */
      const m = mascaraBase(b.dataset.madd);
      if (m.tipo === 'radial') { const [cx, cy] = salidaASrc(.5, .5); Object.assign(m, { cx, cy }); }
      else { const [x0, y0] = salidaASrc(.5, .15), [x1, y1] = salidaASrc(.5, .55); Object.assign(m, { x0, y0, x1, y1 }); }
      ms.push(m); ED.mascara = ms.length - 1; cambiar(true);
    }
    else if (b.dataset.m === 'ver') ED.verMascara = !ED.verMascara;
    else if (b.dataset.m === 'invertir') { mascaraSel().invertir = !mascaraSel().invertir; cambiar(true); }
    else if (b.dataset.m === 'duplicar' && ms.length < MAX_MASCARAS) { const c = clonar(mascaraSel()); c.id = uid(); ms.push(c); ED.mascara = ms.length - 1; cambiar(true); }
    else if (b.dataset.m === 'eliminar') { ms.splice(ED.mascara, 1); ED.mascara = -1; cambiar(true); }
    else return;
    pintarMascaras(); pedirPintura();
  });
}

/* ---------- capa sobre la foto ---------- */
const asp = () => { const L = Math.max(ED.fuente.w, ED.fuente.h); return [ED.fuente.w / L, ED.fuente.h / L]; };
/* de coordenadas q (foto corregida por proporción) a píxeles de la capa */
function qAPantalla(q, W, H){ const [ax, ay] = asp(), [u, v] = srcASalida(q[0] / ax, q[1] / ay); return [u * W, v * H]; }
const nodo = (p, clase, dato, i) => '<circle class="nodo vivo ' + clase + '" cx="' + p[0] + '" cy="' + p[1] + '" r="' + (clase ? 7 : 10) + '" data-nodo="' + dato + '" data-i="' + i + '"/>';

function pintarCapaMascaras(W, H){
  /* las líneas de la máscara lineal se recortan al borde de la foto */
  const [ax, ay] = asp(); let s = '<clipPath id="capa-foto"><rect width="' + W + '" height="' + H + '"/></clipPath>';
  ED.a.mascaras.forEach((m, i) => {
    const c = m.tipo === 'radial' ? [m.cx * ax, m.cy * ay] : [(m.x0 + m.x1) / 2 * ax, (m.y0 + m.y1) / 2 * ay];
    if (i !== ED.mascara) { s += nodo(qAPantalla(c, W, H), 'chico', 'elegir', i); return; }
    if (m.tipo === 'lineal') {
      const A = [m.x0 * ax, m.y0 * ay], B = [m.x1 * ax, m.y1 * ay], d = [B[0] - A[0], B[1] - A[1]], l = Math.hypot(d[0], d[1]) || 1, nn = [-d[1] / l * 3, d[0] / l * 3];
      const lin = (P, clase) => { const a = qAPantalla([P[0] - nn[0], P[1] - nn[1]], W, H), b = qAPantalla([P[0] + nn[0], P[1] + nn[1]], W, H); return '<path class="linea-m ' + clase + '" d="M' + a + 'L' + b + '"/>'; };
      const pa = qAPantalla(A, W, H), pb = qAPantalla(B, W, H);
      s += '<g clip-path="url(#capa-foto)">' + lin(A, '') + lin(B, 'trazo') + '</g>' + '<path class="linea-m trazo" d="M' + pa + 'L' + pb + '"/>' + nodo(pa, '', 'p0', i) + nodo(pb, 'chico', 'p1', i) + nodo(qAPantalla(c, W, H), 'chico', 'centro', i);
    } else {
      const ca = Math.cos(m.ang), sa = Math.sin(m.ang), pt = (lx, ly) => qAPantalla([c[0] + ca * lx - sa * ly, c[1] + sa * lx + ca * ly], W, H);
      const elipse = (k, clase) => { let d = ''; for (let t = 0; t <= 64; t++) { const a = t / 64 * Math.PI * 2; d += (t ? 'L' : 'M') + pt(m.rx * k * Math.cos(a), m.ry * k * Math.sin(a)); } return '<path class="elipse ' + clase + '" d="' + d + 'Z"/>'; };
      s += elipse(1, '') + elipse(Math.max(.02, 1 - m.desv / 100), 'int') + nodo(qAPantalla(c, W, H), '', 'centro', i) + nodo(pt(m.rx, 0), 'chico', 'rx', i) + nodo(pt(0, -m.ry), 'chico', 'ry', i);
    }
  });
  return s;
}

/* Arrastre de un punto de máscara; nx, ny en coordenadas 0..1 de la salida */
const MK = { nodo:null, q0:null, m0:null };
function mascaraInicio(nodoEl, nx, ny){
  const i = +nodoEl.dataset.i;
  if (nodoEl.dataset.nodo === 'elegir') { ED.mascara = i; pintarMascaras(); pedirPintura(); return; }
  MK.nodo = nodoEl.dataset.nodo; MK.q0 = pantallaAQ(nx, ny); MK.m0 = clonar(mascaraSel());
}
function pantallaAQ(nx, ny){ const [ax, ay] = asp(), [x, y] = salidaASrc(nx, ny); return [x * ax, y * ay]; }
function mascaraMover(nx, ny){
  const m = mascaraSel(); if (!m || !MK.nodo) return;
  const [ax, ay] = asp(), q = pantallaAQ(nx, ny), d = [(q[0] - MK.q0[0]) / ax, (q[1] - MK.q0[1]) / ay], o = MK.m0;
  if (m.tipo === 'lineal') {
    if (MK.nodo === 'p0' || MK.nodo === 'centro') { m.x0 = o.x0 + d[0]; m.y0 = o.y0 + d[1]; }
    if (MK.nodo === 'p1' || MK.nodo === 'centro') { m.x1 = o.x1 + d[0]; m.y1 = o.y1 + d[1]; }
  } else {
    const c = [o.cx * ax, o.cy * ay], v = [q[0] - c[0], q[1] - c[1]];
    if (MK.nodo === 'centro') { m.cx = o.cx + d[0]; m.cy = o.cy + d[1]; }
    if (MK.nodo === 'rx') { m.rx = Math.max(.01, Math.hypot(v[0], v[1])); m.ang = Math.atan2(v[1], v[0]); }
    if (MK.nodo === 'ry') m.ry = Math.max(.01, Math.abs(-Math.sin(m.ang) * v[0] + Math.cos(m.ang) * v[1]));
  }
}
function mascaraFin(){ if (MK.nodo) { MK.nodo = null; cambiar(true); } }
