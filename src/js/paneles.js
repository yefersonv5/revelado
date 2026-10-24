/* Paneles de Luz, Color, Efectos y Detalle: deslizadores ligados al ajuste abierto, subvistas de Curva,
   Mezcla de color y Gradación, el botón Auto y el punto de "editado" en cada pestaña. */

/* Deslizador ligado a una clave del ajuste de la foto abierta */
const ctlAjuste = def => deslizador(def, k => ED.a[k], (k, v, final) => { ED.a[k] = v; cambiar(final); });

/* Cabecera de panel con título y acciones a la derecha */
const pcab = (titulo, acciones = '') => '<div class="pcab"><h2>' + esc(titulo) + '</h2><span>' + acciones + '</span></div>';
const filaNav = (clave, nombre) => '<button class="fila-nav" data-sub="' + clave + '"><b>' + esc(nombre) + '</b><span>' + ICO.chev + '</span></button>';
/* Cabecera de subvista: volver a la izquierda, como en iOS */
const pcabSub = (titulo, acciones = '') => '<div class="pcab"><button class="txt volver-sub" data-volver-sub aria-label="Volver"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button><h2 class="flex">' + esc(titulo) + '</h2><span>' + acciones + '</span></div>';

function construirPaneles(){
  /* Luz */
  const luz = $('#p-luz');
  luz.innerHTML = '<div class="principal">' + pcab('Luz', '<button class="txt" data-auto>Auto</button><button class="txt" data-reset="luz">Restablecer</button>') + '<div class="ctls"></div>' + filaNav('curva', 'Curva') + '</div><div class="subvista" hidden></div>';
  PANELES.luz.forEach(d => $('.ctls', luz).appendChild(ctlAjuste(d)));

  /* Color */
  const color = $('#p-color');
  color.innerHTML = '<div class="principal">' + pcab('Color', '<button class="txt" data-reset="color">Restablecer</button>') + '<div class="ctls"></div>' + filaNav('mezcla', 'Mezcla de color') + filaNav('gradacion', 'Gradación de color') + '</div><div class="subvista" hidden></div>';
  PANELES.color.forEach(d => $('.ctls', color).appendChild(ctlAjuste(d)));

  /* Efectos y Detalle */
  for (const p of ['efectos', 'detalle']) {
    const el = $('#p-' + p);
    el.innerHTML = pcab(p === 'efectos' ? 'Efectos' : 'Detalle', '<button class="txt" data-reset="' + p + '">Restablecer</button>') + '<div class="ctls"></div>' +
      (p === 'detalle' ? '<p class="nota">Acerca la foto al 100 % (doble toque) para juzgar la nitidez y el ruido.</p>' : '');
    PANELES[p].forEach(d => { const c = ctlAjuste(d); if (d.depende) c.dataset.depende = d.depende; $('.ctls', el).appendChild(c); });
  }

  $('#panel').addEventListener('click', e => {
    const r = e.target.closest('[data-reset]');
    if (r) { CLAVES[r.dataset.reset].forEach(k => { ED.a[k] = DEF[k]; }); if (r.dataset.reset === 'luz') ED.a.curva = clonar(CURVA_DEF); cambiar(true); sincronizarPaneles(); return; }
    if (e.target.closest('[data-auto]')) { autoTono(); return; }
    const s = e.target.closest('[data-sub]'); if (s) return abrirSub(s.closest('.pane'), s.dataset.sub);
    if (e.target.closest('[data-volver-sub]')) return cerrarSub(e.target.closest('.pane'));
  });
}

/* ---------- subvistas ---------- */
let bandaSel = 'rojo', zonaSel = 'sombras';
function abrirSub(pane, cual){
  const sub = $('.subvista', pane), reabrir = pane.dataset.abierta === cual;
  $('.principal', pane).hidden = true; sub.hidden = false; pane.dataset.abierta = cual; if (!reabrir) pane.scrollTop = 0;
  if (cual === 'curva') {
    sub.innerHTML = pcabSub('Curva') + htmlCurva();
    montarCurva(sub, () => ED.a.curva, final => cambiar(final));
  }
  if (cual === 'mezcla') pintarMezcla(sub);
  if (cual === 'gradacion') pintarGradacion(sub);
}
function cerrarSub(pane){ const sub = $('.subvista', pane); sub.hidden = true; sub.innerHTML = ''; delete pane.dataset.abierta; $('.principal', pane).hidden = false; sincronizarPaneles(); }

function pintarMezcla(sub){
  const b = BANDAS.find(x => x.k === bandaSel), h0 = b.hue;
  const rielTono = 'linear-gradient(90deg,' + [-30, 0, 30].map(d => 'hsl(' + (h0 + d + 360) % 360 + ',75%,55%)').join(',') + ')';
  sub.innerHTML = pcabSub('Mezcla de color', '<button class="txt" data-reset-mezcla>Restablecer</button>') +
    '<div class="puntos" role="radiogroup" aria-label="Color">' + BANDAS.map(x => '<button data-banda="' + x.k + '" style="background:' + x.color + '" class="' + (x.k === bandaSel ? 'activo' : '') + '" aria-label="' + x.nom + '"></button>').join('') + '</div><div class="ctls"></div>';
  const c = $('.ctls', sub);
  c.appendChild(ctlAjuste({ k:'m_' + b.k + '_h', nom:'Tono', riel:rielTono }));
  c.appendChild(ctlAjuste({ k:'m_' + b.k + '_s', nom:'Saturación', riel:'linear-gradient(90deg,#777,' + b.color + ')' }));
  c.appendChild(ctlAjuste({ k:'m_' + b.k + '_l', nom:'Luminancia', riel:'linear-gradient(90deg,#111,' + b.color + ',#fff)' }));
  sub.onclick = e => {
    const p = e.target.closest('[data-banda]'); if (p) { bandaSel = p.dataset.banda; pintarMezcla(sub); }
    if (e.target.closest('[data-reset-mezcla]')) { CLAVES_MEZCLA.forEach(k => { ED.a[k] = 0; }); cambiar(true); pintarMezcla(sub); }
  };
}

function pintarGradacion(sub){
  const z = zonaSel;
  sub.innerHTML = pcabSub('Gradación de color', '<button class="txt" data-reset-grad>Restablecer</button>') +
    '<div class="segmento" role="tablist">' + ZONAS.map(x => '<button data-zona="' + x.k + '" aria-selected="' + (x.k === z) + '">' + (x.k === 'medios' ? 'Medios' : x.nom) + '</button>').join('') + '</div>' +
    '<div class="ruedas"><div class="rueda" role="slider" aria-label="Tono y saturación de ' + z + '" tabindex="0"><span class="p"></span></div></div><div class="ctls"></div>';
  const c = $('.ctls', sub);
  c.appendChild(ctlAjuste({ k:'g_' + z + '_l', nom:'Luminancia', riel:'linear-gradient(90deg,#111,#fff)' }));
  c.appendChild(ctlAjuste({ k:'g_mezcla', nom:'Mezcla', min:0, max:100 }));
  c.appendChild(ctlAjuste({ k:'g_balance', nom:'Balance' }));
  const rueda = $('.rueda', sub), punto = $('.p', rueda);
  const pintarPunto = () => {
    const h = ED.a['g_' + z + '_h'] * Math.PI / 180, s = ED.a['g_' + z + '_s'] / 100;
    punto.style.left = (50 + Math.cos(h) * s * 50) + '%'; punto.style.top = (50 - Math.sin(h) * s * 50) + '%';
    const [r, g, b] = hsvRgb(ED.a['g_' + z + '_h'] / 360); punto.style.background = 'rgb(' + [r, g, b].map(v => Math.round(128 + (v * 255 - 128) * s)).join(',') + ')';
  };
  const mover = (e, final) => {
    const r = rueda.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * 2 - 1, y = 1 - (e.clientY - r.top) / r.height * 2;
    let s = Math.min(1, Math.hypot(x, y)); if (s < .04) s = 0;
    ED.a['g_' + z + '_h'] = Math.round(((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360); ED.a['g_' + z + '_s'] = Math.round(s * 100);
    pintarPunto(); cambiar(final);
  };
  let ultimo = 0;
  rueda.addEventListener('pointerdown', e => {
    e.preventDefault(); rueda.setPointerCapture(e.pointerId);
    const ahora = Date.now(); if (ahora - ultimo < 320) { ED.a['g_' + z + '_s'] = 0; pintarPunto(); cambiar(true); ultimo = 0; return; }
    ultimo = ahora; mover(e, false);
  });
  rueda.addEventListener('pointermove', e => { if (rueda.hasPointerCapture(e.pointerId)) mover(e, false); });
  rueda.addEventListener('pointerup', e => { if (rueda.hasPointerCapture(e.pointerId)) mover(e, true); });
  pintarPunto();
  sub.onclick = e => {
    const zb = e.target.closest('[data-zona]'); if (zb) { zonaSel = zb.dataset.zona; pintarGradacion(sub); }
    if (e.target.closest('[data-reset-grad]')) { CLAVES_GRAD.forEach(k => { ED.a[k] = DEF[k]; }); cambiar(true); pintarGradacion(sub); }
  };
}

/* Actualiza todos los deslizadores visibles, lo que depende de otro ajuste y los puntos de "editado" */
function sincronizarPaneles(){
  $$('#panel .ctl').forEach(c => { if (c.sync) c.sync(); if (c.dataset.depende) c.hidden = ED.a[c.dataset.depende] === DEF[c.dataset.depende]; });
  $$('#panel .fila-nav').forEach(f => {
    const k = f.dataset.sub;
    f.classList.toggle('editado', k === 'curva' ? curvaEditada(ED.a.curva) : k === 'mezcla' ? cambiado(ED.a, CLAVES_MEZCLA) : cambiado(ED.a, CLAVES_GRAD));
  });
  const ed = {
    presets:!!ED.preset, recortar:!!geoEditada(ED.a.geo), mascaras:ED.a.mascaras.length > 0,
    luz:cambiado(ED.a, CLAVES.luz) || curvaEditada(ED.a.curva), color:cambiado(ED.a, CLAVES.color), efectos:cambiado(ED.a, CLAVES.efectos), detalle:cambiado(ED.a, CLAVES.detalle),
  };
  $$('#herramientas button').forEach(b => b.classList.toggle('editado', !!ed[b.dataset.p]));
}

/* ---------- Auto: tono a partir del histograma de la foto sin ajustes ---------- */
function autoTono(){ Object.assign(ED.a, valoresAuto(ED.fuente, ED.a)); cambiar(true); sincronizarPaneles(); toast('Ajuste automático aplicado'); }
function valoresAuto(fuente, a){
  const px = Motor.revelar(fuente, a, { ancho:160, alto:Math.max(1, Math.round(160 * fuente.h / fuente.w)), antes:true, recorte:{ x:0, y:0, w:1, h:1 }, destino:'pixeles' }).data;
  const L = [];
  for (let i = 0; i < px.length; i += 4) L.push((.2126 * px[i] + .7152 * px[i + 1] + .0722 * px[i + 2]) / 255);
  L.sort((a, b) => a - b);
  const q = p => L[Math.min(L.length - 1, Math.floor(p * L.length))];
  const med = Math.max(.02, q(.5)), ev = clamp(2.2 * Math.log2(.46 / med) * .8, -2.5, 2.5);
  const k = Math.pow(2, ev / 2.2), alto = Math.min(1, q(.995) * k), bajo = q(.005) * k;
  return {
    exposicion:+ev.toFixed(2),
    contraste:Math.round(clamp((.5 - (q(.9) - q(.1))) * 60, -20, 30)),
    altas:Math.round(alto > .93 ? -45 : -15), sombras:Math.round(med < .35 ? 30 : 12),
    blancos:Math.round(clamp((.96 - alto) * 160, -30, 40)), negros:Math.round(clamp((bajo - .03) * -220, -35, 25)),
    intensidad:12,
  };
}
