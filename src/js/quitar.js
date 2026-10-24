/* Quitar: borra manchas, polvo o detalles pequeños como el pincel corrector de Lightroom.
   Tocar la foto agrega una mancha y la app busca sola una zona parecida para copiar (el círculo punteado);
   se puede arrastrar cualquiera de los dos círculos. Recuperar iguala el color y la luz del entorno;
   Clonar copia tal cual. Las manchas se guardan en coordenadas de la foto original. */

const QUITAR = { modo:'recuperar', tam:25, desv:40, opac:100 };
const MAX_MANCHAS = 64;
const radioMancha = tam => .004 + tam / 100 * .09;   /* fracción del lado mayor de la foto */
const tamMancha = r => Math.round((r - .004) / .09 * 100);
const manchaSel = () => ED.a.manchas[ED.mancha] || null;

function pintarQuitar(){
  const p = $('#p-quitar'), m = manchaSel(), o = m || QUITAR;
  p.innerHTML = pcab('Quitar', ED.a.manchas.length ? '<button class="txt" data-q="todo">Borrar todas</button>' : '') +
    '<div class="segmento" style="margin:4px 0 6px"><button data-q="recuperar" aria-selected="' + (o.modo === 'recuperar') + '">Recuperar</button><button data-q="clonar" aria-selected="' + (o.modo === 'clonar') + '">Clonar</button></div>' +
    '<div class="ctls"></div>' + (m ? '<div class="chips"><button data-q="buscar">Buscar otro origen</button><button data-q="eliminar">Eliminar mancha</button></div>' : '') +
    '<p class="nota">' + (m ? 'Arrastra el círculo punteado para elegir de dónde se copia. Toca en otro lugar para agregar otra mancha.' : 'Toca lo que quieras quitar. Acerca la foto con dos dedos para ser más precisa.') + '</p>';
  const c = $('.ctls', p);
  const fijar = (k, v, f) => {
    QUITAR[k] = v; const s = manchaSel();
    if (s) { if (k === 'tam') s.r = radioMancha(v); else s[k] = v; cambiar(f); }
  };
  c.appendChild(deslizador({ k:'tam', nom:'Tamaño', min:1, max:100, base:25 }, () => manchaSel() ? tamMancha(manchaSel().r) : QUITAR.tam, fijar));
  c.appendChild(deslizador({ k:'desv', nom:'Desvanecer', min:0, max:100, base:40 }, () => (manchaSel() || QUITAR).desv, fijar));
  c.appendChild(deslizador({ k:'opac', nom:'Opacidad', min:1, max:100, base:100 }, () => (manchaSel() || QUITAR).opac, fijar));
}

function construirQuitar(){
  $('#p-quitar').addEventListener('click', e => {
    const b = e.target.closest('[data-q]'); if (!b) return;
    const q = b.dataset.q, m = manchaSel();
    if (q === 'recuperar' || q === 'clonar') { QUITAR.modo = q; if (m) { m.modo = q; cambiar(true); } }
    if (q === 'eliminar' && m) { ED.a.manchas.splice(ED.mancha, 1); ED.mancha = -1; cambiar(true); }
    if (q === 'buscar' && m) { Object.assign(m, buscarOrigen(m.x, m.y, m.r, [m.sx, m.sy])); cambiar(true); }
    if (q === 'todo') { ED.a.manchas = []; ED.mancha = -1; cambiar(true); }
    pintarQuitar(); pedirPintura();
  });
}

/* Toque en la foto: elige una mancha existente o crea una nueva */
function tocarQuitar(nx, ny){
  const [x, y] = salidaASrc(nx, ny);
  if (x < 0 || y < 0 || x > 1 || y > 1) return;
  if (ED.a.manchas.length >= MAX_MANCHAS) return toast('Llegaste al máximo de ' + MAX_MANCHAS + ' manchas en esta foto');
  const r = radioMancha(QUITAR.tam);
  ED.a.manchas.push(Object.assign({ x, y, r, modo:QUITAR.modo, desv:QUITAR.desv, opac:QUITAR.opac }, buscarOrigen(x, y, r)));
  ED.mancha = ED.a.manchas.length - 1; cambiar(true); pintarQuitar();
}

/* Busca alrededor una zona cuyo entorno se parezca al de la mancha (así la copia empata con lo que la rodea) */
function buscarOrigen(x, y, r, evitar = null){
  const px = pixelesFoto(), [ax, ay] = asp(), W = px.width, H = px.height, d = px.data;
  const leer = (u, v) => { const i = (Math.round(clamp(v, 0, 1) * (H - 1)) * W + Math.round(clamp(u, 0, 1) * (W - 1))) * 4; return [d[i], d[i + 1], d[i + 2]]; };
  const anillo = []; for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; for (const f of [1.15, 1.5]) anillo.push([Math.cos(a) * r * f / ax, Math.sin(a) * r * f / ay]); }
  const ref = anillo.map(([u, v]) => leer(x + u, y + v));
  let mejor = null, pmejor = Infinity;
  for (const dist of [2.3, 3, 4]) for (let k = 0; k < 16; k++) {
    const a = k / 16 * Math.PI * 2, sx = x + Math.cos(a) * r * dist / ax, sy = y + Math.sin(a) * r * dist / ay;
    if (sx - r / ax < 0 || sy - r / ay < 0 || sx + r / ax > 1 || sy + r / ay > 1) continue;
    if (evitar && Math.hypot((sx - evitar[0]) * ax, (sy - evitar[1]) * ay) < r * .5) continue;
    let p = 0; anillo.forEach(([u, v], i) => { const c = leer(sx + u, sy + v), q = ref[i]; p += Math.abs(c[0] - q[0]) + Math.abs(c[1] - q[1]) + Math.abs(c[2] - q[2]); });
    p *= 1 + dist * .04; /* a igual parecido, mejor cerca */
    if (p < pmejor) { pmejor = p; mejor = { sx, sy }; }
  }
  return mejor || { sx:clamp(x + 2.5 * r / ax, 0, 1), sy:y };
}

/* ---------- capa: círculo de la mancha, círculo punteado del origen y la línea que los une ---------- */
function pintarCapaQuitar(W, H){
  const [Wo] = marcoOrientado(ED.a.geo, ED.fuente.w, ED.fuente.h), L = Math.max(ED.fuente.w, ED.fuente.h), k = L * W / (ED.a.geo.w * Wo);
  let s = '';
  ED.a.manchas.forEach((m, i) => {
    const [u, v] = srcASalida(m.x, m.y), [su, sv] = srcASalida(m.sx, m.sy), r = m.r * k, P = [u * W, v * H], S = [su * W, sv * H];
    if (i !== ED.mancha) { s += '<circle class="elipse vivo" style="stroke-opacity:.55" cx="' + P[0] + '" cy="' + P[1] + '" r="' + r + '" data-mancha="' + i + '" data-cual="d"/>'; return; }
    s += '<path class="linea-m trazo" d="M' + P + 'L' + S + '"/>' +
      '<circle class="elipse int vivo" style="stroke-opacity:1" cx="' + S[0] + '" cy="' + S[1] + '" r="' + r + '" data-mancha="' + i + '" data-cual="s"/>' +
      '<circle class="elipse vivo" style="stroke-width:2.5" cx="' + P[0] + '" cy="' + P[1] + '" r="' + r + '" data-mancha="' + i + '" data-cual="d"/>';
  });
  return s;
}
/* Arrastre de una mancha (d) o de su origen (s) */
const MQ = { i:-1, cual:'', p0:null, m0:null };
function quitarInicio(el, nx, ny){
  MQ.i = +el.dataset.mancha; MQ.cual = el.dataset.cual; MQ.p0 = salidaASrc(nx, ny); MQ.m0 = clonar(ED.a.manchas[MQ.i]);
  if (ED.mancha !== MQ.i) { ED.mancha = MQ.i; pintarQuitar(); }
}
function quitarMover(nx, ny){
  const m = ED.a.manchas[MQ.i]; if (!m) return;
  const [x, y] = salidaASrc(nx, ny), dx = x - MQ.p0[0], dy = y - MQ.p0[1], o = MQ.m0;
  if (MQ.cual === 's') { m.sx = o.sx + dx; m.sy = o.sy + dy; }
  else { m.x = o.x + dx; m.y = o.y + dy; m.sx = o.sx + dx; m.sy = o.sy + dy; }
}
function quitarFin(){ if (MQ.i >= 0) { MQ.i = -1; cambiar(true); } }
