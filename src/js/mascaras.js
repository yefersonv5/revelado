/* Máscaras: ajustes locales como en Lightroom. Tipos: degradado lineal, degradado radial, pincel,
   rango de color y rango de luminancia (la selección automática de sujeto o cielo necesita IA y no está).
   Hasta 8 por foto, cada una con su cantidad, invertir y 16 ajustes. Las formas se editan sobre la foto;
   las posiciones se guardan en coordenadas de la foto original, así siguen en su lugar aunque cambie el recorte.
   Aquí vive también el Desenfoque de lente, que usa el mismo óvalo para el área de enfoque. */

const MAX_MASCARAS = 8;
const ICO_M = {
  lineal:'<svg viewBox="0 0 24 24"><path d="M4 8h16M4 16h16"/><path d="M12 5v14" stroke-dasharray="2 2.5"/></svg>',
  radial:'<svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="8" ry="6"/><ellipse cx="12" cy="12" rx="4.5" ry="3" stroke-dasharray="2 2"/></svg>',
  pincel:'<svg viewBox="0 0 24 24"><path d="M14 4l6 6-8 8H6v-6z"/><path d="M4 20h4"/></svg>',
  color:'<svg viewBox="0 0 24 24"><path d="M12 3.5c3 4 6 7 6 10.5a6 6 0 0 1-12 0c0-3.5 3-6.5 6-10.5z"/></svg>',
  luminancia:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" class="lleno"/></svg>',
  mas:'<svg viewBox="0 0 24 24"><path d="M12 6v12M6 12h12"/></svg>',
};
const DESC_M = {
  pincel:'Pinta a mano la zona que quieres ajustar.', lineal:'Un degradado: ideal para cielos o suelos.', radial:'Un óvalo para resaltar o apagar un sujeto.',
  color:'Toca un color de la foto y ajusta todo lo que se le parece.', luminancia:'Elige un rango de brillo: solo las luces o solo las sombras.',
};
/* La máscara que se edita sobre la foto: la elegida, o el área de enfoque en Desenfoque de lente */
const mascaraSel = () => ED.panel === 'desenfoque' ? ED.a.desenfoque : ED.a.mascaras[ED.mascara] || null;
const PINCEL = { tam:20, dureza:50, flujo:100, borrar:false };
/* para los deslizadores: si la máscara ya no existe (se borró o se deshizo), leen una vacía */
const mascaraSegura = () => ED.a.mascaras[ED.mascara] || mascaraBase('radial');

function pintarMascaras(){
  const p = $('#p-mascaras'), ms = ED.a.mascaras, m = ED.a.mascaras[ED.mascara];
  const n = {};
  let h = pcab('Máscaras', ms.length ? '<button class="txt" data-m="ver">' + (ED.verMascara ? 'Ocultar zona' : 'Ver zona') + '</button>' : '') +
    '<div class="lista-m">' + ms.map((x, i) => '<button data-msel="' + i + '" class="' + (i === ED.mascara ? 'activo' : '') + '"><span class="ico">' + ICO_M[x.tipo] + '</span>' +
      TIPOS_MASCARA[x.tipo].corto + ' ' + (n[x.tipo] = (n[x.tipo] || 0) + 1) + '</button>').join('');
  if (ms.length < MAX_MASCARAS) h += '<button data-m="crear"><span class="ico">' + ICO_M.mas + '</span>Crear</button>';
  h += '</div>';
  if (!m) h += '<p class="nota">' + (ms.length ? 'Toca una máscara para editarla o crea otra.' : 'Crea una máscara para ajustar solo una parte de la foto.') + '</p>';
  else {
    h += '<div class="chips"><button data-m="invertir" class="' + (m.invertir ? 'activo' : '') + '">Invertir</button><button data-m="duplicar">Duplicar</button><button data-m="eliminar">Eliminar</button></div>';
    if (m.tipo === 'pincel') h += '<div class="segmento" style="margin:6px 0"><button data-pin="pintar" aria-selected="' + !PINCEL.borrar + '">Pincel</button><button data-pin="borrar" aria-selected="' + PINCEL.borrar + '">Borrar</button></div><div class="ctls" id="m-pincel"></div>' +
      '<p class="nota">Pinta con un dedo sobre la foto. Pellizca con dos para acercar.</p>';
    if (m.tipo === 'color') h += '<div class="fila-color"><span class="muestra" style="background:' + (m.col ? 'rgb(' + m.col.map(v => Math.round(v * 255)).join(',') + ')' : 'transparent') + '"></span>' +
      '<span>' + (m.col ? 'Color elegido' : 'Toca un color en la foto') + '</span><button class="txt" data-m="elegir-color">' + (ED.modoToque === 'color' ? 'Tocando…' : 'Elegir') + '</button></div>';
    h += '<div class="ctls" id="m-forma"></div><div class="sub">Ajustes</div><div class="ctls" id="m-ajustes"></div>';
  }
  p.innerHTML = h;
  if (!m) return;
  const forma = $('#m-forma', p), aj = $('#m-ajustes', p);
  const ctlM = d => deslizador(d, k => mascaraSegura()[k], (k, v, f) => { mascaraSegura()[k] = v; cambiar(f); });
  forma.appendChild(ctlM({ k:'cant', nom:'Cantidad', min:0, max:100, base:100 }));
  if (m.tipo === 'radial') forma.appendChild(ctlM({ k:'desv', nom:'Desvanecer', min:0, max:100, base:50 }));
  if (m.tipo === 'color') forma.appendChild(ctlM({ k:'tol', nom:'Tolerancia', min:1, max:100, base:30 }));
  if (m.tipo === 'luminancia') {
    forma.appendChild(ctlM({ k:'desde', nom:'Desde', min:0, max:100, base:60, riel:'linear-gradient(90deg,#000,#fff)' }));
    forma.appendChild(ctlM({ k:'hasta', nom:'Hasta', min:0, max:100, base:100, riel:'linear-gradient(90deg,#000,#fff)' }));
    forma.appendChild(ctlM({ k:'suav', nom:'Suavidad', min:0, max:100, base:20 }));
  }
  if (m.tipo === 'pincel') {
    const pin = $('#m-pincel', p), ctlP = d => deslizador(d, k => PINCEL[k], (k, v) => { PINCEL[k] = v; });
    pin.appendChild(ctlP({ k:'tam', nom:'Tamaño', min:1, max:100, base:20 })); pin.appendChild(ctlP({ k:'dureza', nom:'Desvanecer', min:0, max:100, base:50 })); pin.appendChild(ctlP({ k:'flujo', nom:'Flujo', min:1, max:100, base:100 }));
  }
  AJ_MASCARA.forEach(d => aj.appendChild(deslizador(d, k => mascaraSegura().a[k], (k, v, f) => { mascaraSegura().a[k] = v; cambiar(f); })));
}

function construirMascaras(){
  $('#p-mascaras').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const ms = ED.a.mascaras, m = ms[ED.mascara];
    if (b.dataset.msel) { ED.mascara = +b.dataset.msel === ED.mascara ? -1 : +b.dataset.msel; ED.modoToque = null; }
    else if (b.dataset.m === 'crear') return hojaCrearMascara();
    else if (b.dataset.m === 'ver') ED.verMascara = !ED.verMascara;
    else if (b.dataset.m === 'invertir') { m.invertir = !m.invertir; cambiar(true); }
    else if (b.dataset.m === 'duplicar' && ms.length < MAX_MASCARAS) { const c = clonar(m); c.id = uid(); ms.push(c); ED.mascara = ms.length - 1; cambiar(true); }
    else if (b.dataset.m === 'eliminar') { ms.splice(ED.mascara, 1); ED.mascara = -1; ED.modoToque = null; cambiar(true); }
    else if (b.dataset.m === 'elegir-color') { ED.modoToque = ED.modoToque === 'color' ? null : 'color'; }
    else if (b.dataset.pin) { PINCEL.borrar = b.dataset.pin === 'borrar'; }
    else return;
    pintarMascaras(); pedirPintura();
  });
}

function hojaCrearMascara(){
  abrirHoja(cabHoja('Crear máscara') + '<div class="grupo">' + Object.keys(TIPOS_MASCARA).map(t =>
    '<button data-nueva="' + t + '"><span class="izq"><span class="ico-f">' + ICO_M[t] + '</span><span>' + TIPOS_MASCARA[t].nom + '<br><small>' + DESC_M[t] + '</small></span></span></button>').join('') + '</div>' +
    '<p class="ayuda">Sujeto, Cielo, Fondo y Personas usan inteligencia artificial de Adobe y no están en Revelado.</p>');
  $('#hoja').onclick = e => {
    const b = e.target.closest('[data-nueva]'); if (!b) return;
    const m = mascaraBase(b.dataset.nueva);
    /* nace en el centro de lo que se ve; la lineal, del borde de arriba hacia la mitad */
    if (m.tipo === 'radial') { const [cx, cy] = salidaASrc(.5, .5); Object.assign(m, { cx, cy }); }
    if (m.tipo === 'lineal') { const [x0, y0] = salidaASrc(.5, .15), [x1, y1] = salidaASrc(.5, .55); Object.assign(m, { x0, y0, x1, y1 }); }
    ED.a.mascaras.push(m); ED.mascara = ED.a.mascaras.length - 1;
    ED.verMascara = ['pincel', 'color', 'luminancia'].includes(m.tipo);
    ED.modoToque = m.tipo === 'color' ? 'color' : null;
    if (m.tipo === 'color') toast('Toca en la foto el color que quieres ajustar', 2400);
    cerrarHoja(); cambiar(true); pintarMascaras();
  };
}

/* Toque en la foto con el selector de color de una máscara */
function elegirColorMascara(x, y){
  const m = ED.a.mascaras[ED.mascara]; if (!m || m.tipo !== 'color') return;
  m.col = muestraFoto(x, y, 2); ED.modoToque = null; cambiar(true); pintarMascaras();
}

/* ---------- pincel: un trazo es una lista de puntos en la foto con radio, dureza y flujo ---------- */
let trazo = null;
function pincelInicio(nx, ny){
  const m = ED.a.mascaras[ED.mascara], [x, y] = salidaASrc(nx, ny);
  trazo = { p:[[+x.toFixed(4), +y.toFixed(4)]], r:.004 + PINCEL.tam / 100 * .12, dureza:PINCEL.dureza < 100 ? 1 - PINCEL.dureza / 100 : .02, flujo:PINCEL.flujo / 100, borrar:PINCEL.borrar };
  m.trazos.push(trazo); ED.cursor = [nx, ny]; pedirPintura();
}
function pincelMover(nx, ny){
  if (!trazo) return;
  const [x, y] = salidaASrc(nx, ny), u = trazo.p[trazo.p.length - 1], [ax, ay] = asp();
  if (Math.hypot((x - u[0]) * ax, (y - u[1]) * ay) > trazo.r * .3) { trazo.p.push([+x.toFixed(4), +y.toFixed(4)]); }
  ED.cursor = [nx, ny]; pedirPintura();
}
function pincelFin(cancelar = false){
  if (!trazo) return;
  if (cancelar) { const m = ED.a.mascaras[ED.mascara]; m.trazos.pop(); }
  trazo = null; ED.cursor = null; cambiar(true);
}

/* ---------- Desenfoque de lente ---------- */
function pintarDesenfoque(){
  const p = $('#p-desenfoque'), d = () => ED.a.desenfoque;
  p.innerHTML = pcab('Desenfoque de lente', '<button class="txt" data-des-reset>Restablecer</button>') + '<div class="ctls"></div>' +
    '<p class="nota">Lo que queda dentro del óvalo se ve nítido y el resto se desenfoca, como con un objetivo luminoso. Arrastra el óvalo hasta tu sujeto. En Lightroom el área se calcula con IA a partir de la profundidad; aquí la eliges tú.</p>';
  const c = $('.ctls', p);
  c.appendChild(deslizador({ k:'cant', nom:'Cantidad de desenfoque', min:0, max:100, base:0 }, k => d()[k], (k, v, f) => { d()[k] = v; cambiar(f); }));
  c.appendChild(deslizador({ k:'desv', nom:'Transición del enfoque', min:0, max:100, base:60 }, k => d()[k], (k, v, f) => { d()[k] = v; cambiar(f); }));
  p.onclick = e => { if (e.target.closest('[data-des-reset]')) { ED.a.desenfoque = Object.assign(clonar(DESENFOQUE_DEF), { cant:0 }); cambiar(true); pintarDesenfoque(); } };
}

/* ---------- capa sobre la foto ---------- */
const asp = () => { const L = Math.max(ED.fuente.w, ED.fuente.h); return [ED.fuente.w / L, ED.fuente.h / L]; };
/* de coordenadas q (foto corregida por proporción) a píxeles de la capa */
function qAPantalla(q, W, H){ const [ax, ay] = asp(), [u, v] = srcASalida(q[0] / ax, q[1] / ay); return [u * W, v * H]; }
const nodo = (p, clase, dato, i) => '<circle class="nodo vivo ' + clase + '" cx="' + p[0] + '" cy="' + p[1] + '" r="' + (clase ? 7 : 10) + '" data-nodo="' + dato + '" data-i="' + i + '"/>';
function elipse(m, W, H, k, clase){
  const [ax, ay] = asp(), c = [m.cx * ax, m.cy * ay], ca = Math.cos(m.ang), sa = Math.sin(m.ang);
  let d = ''; for (let t = 0; t <= 64; t++) { const a = t / 64 * Math.PI * 2, lx = m.rx * k * Math.cos(a), ly = m.ry * k * Math.sin(a); d += (t ? 'L' : 'M') + qAPantalla([c[0] + ca * lx - sa * ly, c[1] + sa * lx + ca * ly], W, H); }
  return '<path class="elipse ' + clase + '" d="' + d + 'Z"/>';
}
function nodosRadial(m, W, H, i){
  const [ax, ay] = asp(), c = [m.cx * ax, m.cy * ay], ca = Math.cos(m.ang), sa = Math.sin(m.ang), pt = (lx, ly) => qAPantalla([c[0] + ca * lx - sa * ly, c[1] + sa * lx + ca * ly], W, H);
  return nodo(qAPantalla(c, W, H), '', 'centro', i) + nodo(pt(m.rx, 0), 'chico', 'rx', i) + nodo(pt(0, -m.ry), 'chico', 'ry', i);
}

function pintarCapaMascaras(W, H){
  if (ED.panel === 'desenfoque') {
    const d = ED.a.desenfoque;
    return elipse(d, W, H, 1 + d.desv / 200, 'int') + elipse(d, W, H, 1, '') + nodosRadial(d, W, H, -1);
  }
  const [ax, ay] = asp(); let s = '<clipPath id="capa-foto"><rect width="' + W + '" height="' + H + '"/></clipPath>';
  ED.a.mascaras.forEach((m, i) => {
    if (m.tipo !== 'lineal' && m.tipo !== 'radial') return;
    const c = m.tipo === 'radial' ? [m.cx * ax, m.cy * ay] : [(m.x0 + m.x1) / 2 * ax, (m.y0 + m.y1) / 2 * ay];
    if (i !== ED.mascara) { s += nodo(qAPantalla(c, W, H), 'chico', 'elegir', i); return; }
    if (m.tipo === 'lineal') {
      const A = [m.x0 * ax, m.y0 * ay], B = [m.x1 * ax, m.y1 * ay], d = [B[0] - A[0], B[1] - A[1]], l = Math.hypot(d[0], d[1]) || 1, nn = [-d[1] / l * 3, d[0] / l * 3];
      const lin = (P, clase) => { const a = qAPantalla([P[0] - nn[0], P[1] - nn[1]], W, H), b = qAPantalla([P[0] + nn[0], P[1] + nn[1]], W, H); return '<path class="linea-m ' + clase + '" d="M' + a + 'L' + b + '"/>'; };
      const pa = qAPantalla(A, W, H), pb = qAPantalla(B, W, H);
      s += '<g clip-path="url(#capa-foto)">' + lin(A, '') + lin(B, 'trazo') + '</g><path class="linea-m trazo" d="M' + pa + 'L' + pb + '"/>' + nodo(pa, '', 'p0', i) + nodo(pb, 'chico', 'p1', i) + nodo(qAPantalla(c, W, H), 'chico', 'centro', i);
    } else s += elipse(m, W, H, 1, '') + elipse(m, W, H, Math.max(.02, 1 - m.desv / 100), 'int') + nodosRadial(m, W, H, i);
  });
  /* cursor del pincel */
  const m = ED.a.mascaras[ED.mascara];
  if (m && m.tipo === 'pincel' && ED.cursor) {
    const [Wo] = marcoOrientado(ED.a.geo, ED.fuente.w, ED.fuente.h), L = Math.max(ED.fuente.w, ED.fuente.h);
    const r = (.004 + PINCEL.tam / 100 * .12) * L * W / (ED.a.geo.w * Wo);
    s += '<circle class="elipse" cx="' + ED.cursor[0] * W + '" cy="' + ED.cursor[1] * H + '" r="' + r + '"/>';
  }
  return s;
}

/* Arrastre de un punto de máscara o del área de enfoque; nx, ny en coordenadas 0..1 de la salida */
const MK = { nodo:null, q0:null, m0:null };
function mascaraInicio(nodoEl, nx, ny){
  const i = +nodoEl.dataset.i;
  if (nodoEl.dataset.nodo === 'elegir') { ED.mascara = i; ED.modoToque = null; pintarMascaras(); pedirPintura(); return; }
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
