/* Paneles de Luz, Color, Efectos, Detalle, Óptica y Geometría: deslizadores ligados al ajuste abierto,
   subvistas de Curva, Mezcla de color y Gradación, perfiles, tratamiento, balance de blancos (Como se tomó,
   Automático y el selector), Auto y el punto de "editado" en cada pestaña. */

/* Deslizador ligado a una clave del ajuste de la foto abierta */
const ctlAjuste = def => deslizador(def, k => ED.a[k], (k, v, final) => { ED.a[k] = v; if (k === 'temperatura' || k === 'matiz') ED.a.bbAuto = false; cambiar(final); });

/* Cabecera de panel con título y acciones a la derecha */
const pcab = (titulo, acciones = '') => '<div class="pcab"><h2>' + esc(titulo) + '</h2><span>' + acciones + '</span></div>';
const filaNav = (clave, nombre, valor = '') => '<button class="fila-nav" data-sub="' + clave + '"><b>' + esc(nombre) + '</b><span>' + valor + ICO.chev + '</span></button>';
/* Cabecera de subvista: volver a la izquierda, como en iOS */
const pcabSub = (titulo, acciones = '') => '<div class="pcab"><button class="txt volver-sub" data-volver-sub aria-label="Volver"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button><h2 class="flex">' + esc(titulo) + '</h2><span>' + acciones + '</span></div>';
const COLORES_BORDE = [['#FFFFFF', 'blanco'], ['#000000', 'negro'], ['#8E8E93', 'gris'], ['#F2EBDD', 'crema']];
const ICO_GOTERO = '<svg viewBox="0 0 24 24"><path d="m14 4 6 6"/><path d="m17 7 2-2a1.4 1.4 0 0 0-2-2l-2 2"/><path d="M15.5 8.5 7 17l-3 1 1-3 8.5-8.5"/></svg>';

function construirPaneles(){
  /* Luz */
  const luz = $('#p-luz');
  luz.innerHTML = '<div class="principal">' + pcab('Luz', '<button class="txt" data-auto>Auto</button><button class="txt" data-reset="luz">Restablecer</button>') + '<div class="ctls"></div>' + filaNav('curva', 'Curva') + '</div><div class="subvista" hidden></div>';
  PANELES.luz.forEach(d => $('.ctls', luz).appendChild(ctlAjuste(d)));

  /* Color: tratamiento, perfil y balance de blancos arriba, como en Lightroom */
  const color = $('#p-color');
  color.innerHTML = '<div class="principal">' + pcab('Color', '<button class="txt" data-reset="color">Restablecer</button>') +
    '<div class="segmento" id="tratamiento" role="tablist"><button data-trat="color">Color</button><button data-trat="bn">Blanco y negro</button></div>' +
    '<button class="fila-nav" data-perfiles><b>Perfil</b><span><span id="perfil-nom"></span>' + ICO.chev + '</span></button>' +
    '<div class="fila-bb"><span>Balance de blancos</span><div class="chips"><button data-bb="como">Como se tomó</button><button data-bb="auto">Automático</button>' +
    '<button data-bb="gotero" aria-label="Selector de balance de blancos" title="Toca algo que deba verse gris">' + ICO_GOTERO + '</button></div></div>' +
    '<div class="ctls"></div>' + filaNav('mezcla', 'Mezcla de color') + filaNav('gradacion', 'Gradación de color') + '</div><div class="subvista" hidden></div>';
  PANELES.color.forEach(d => $('.ctls', color).appendChild(ctlAjuste(d)));

  /* Efectos, Detalle y Óptica */
  const notas = {
    detalle:'Acerca la foto al 100 % (doble toque) para juzgar la nitidez y el ruido.',
    optica:'Corrige a mano lo que el objetivo deja en la foto: orillas de color en los bordes y esquinas más oscuras.',
  };
  const titulos = { efectos:'Efectos', detalle:'Detalle', optica:'Óptica' };
  for (const p of ['efectos', 'detalle', 'optica']) {
    const el = $('#p-' + p);
    el.innerHTML = pcab(titulos[p], '<button class="txt" data-reset="' + p + '">Restablecer</button>') + '<div class="ctls"></div>' + (notas[p] ? '<p class="nota">' + notas[p] + '</p>' : '');
    PANELES[p].forEach(d => { const c = ctlAjuste(d); if (d.depende) c.dataset.depende = d.depende; $('.ctls', el).appendChild(c); });
  }
  /* Borde, al final de Efectos */
  $('#p-efectos').insertAdjacentHTML('beforeend', '<div class="sub">Borde</div><div class="ctls" id="borde-ctl"></div><div class="chips" id="borde-col">' +
    COLORES_BORDE.map(([c, n]) => '<button data-borde="' + c + '" aria-label="Borde ' + n + '" class="muestra-borde" style="background:' + c + '"></button>').join('') +
    '<label class="muestra-borde propio" aria-label="Otro color"><input type="color" id="borde-propio" value="#FFFFFF"></label></div>');
  $('#borde-ctl').appendChild(deslizador({ k:'tam', nom:'Tamaño', min:0, max:100, base:0 }, () => ED.a.borde.tam, (k, v, f) => { ED.a.borde.tam = v; acomodar(); cambiar(f); }));
  $('#borde-propio').addEventListener('change', e => { ED.a.borde.color = e.target.value.toUpperCase(); if (!ED.a.borde.tam) ED.a.borde.tam = 20; acomodar(); cambiar(true); });

  $('#panel').addEventListener('click', e => {
    const bc = e.target.closest('[data-borde]');
    if (bc) { ED.a.borde.color = bc.dataset.borde; if (!ED.a.borde.tam) ED.a.borde.tam = 20; acomodar(); cambiar(true); return; }
    const r = e.target.closest('[data-reset]');
    if (r) {
      CLAVES[r.dataset.reset].forEach(k => { ED.a[k] = DEF[k]; });
      if (r.dataset.reset === 'luz') ED.a.curva = clonar(CURVA_DEF);
      if (r.dataset.reset === 'color') { ED.a.perfil = clonar(PERFIL_DEF); ED.a.bbAuto = false; ED.a.puntos = []; }
      if (r.dataset.reset === 'efectos') { ED.a.borde = clonar(BORDE_DEF); acomodar(); }
      cambiar(true); sincronizarPaneles(); return;
    }
    if (e.target.closest('[data-auto]')) { autoTono(); return; }
    if (e.target.closest('[data-perfiles]')) return hojaPerfiles();
    const t = e.target.closest('[data-trat]');
    if (t) { const bn = perfilDe(ED.a).bn; if ((t.dataset.trat === 'bn') !== !!bn) { ED.a.perfil = { id:bn ? 'color' : 'monocromo', cant:100 }; cambiar(true); } return; }
    const bb = e.target.closest('[data-bb]');
    if (bb) {
      if (bb.dataset.bb === 'como') { ED.a.temperatura = 0; ED.a.matiz = 0; ED.a.bbAuto = false; cambiar(true); }
      if (bb.dataset.bb === 'auto') { Object.assign(ED.a, bbAutomatico(), { bbAuto:true }); cambiar(true); }
      if (bb.dataset.bb === 'gotero') { ED.modoToque = ED.modoToque === 'bb' ? null : 'bb'; if (ED.modoToque) toast('Toca algo que deba verse gris o blanco', 2200); sincronizarPaneles(); }
      return;
    }
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
    montarCurva(sub, () => ED.a.curva, final => final === null ? abrirSub(pane, 'curva') : cambiar(final));
  }
  if (cual === 'mezcla') pintarMezcla(sub);
  if (cual === 'gradacion') pintarGradacion(sub);
}
function cerrarSub(pane){ const sub = $('.subvista', pane); sub.hidden = true; sub.innerHTML = ''; delete pane.dataset.abierta; $('.principal', pane).hidden = false; sincronizarPaneles(); }

/* Mezcla de color (o de grises en blanco y negro) y Color puntual, como en Lightroom.
   La herramienta de ajuste dirigido permite arrastrar sobre la foto: sube o baja el valor de los colores que tocas. */
let vistaMezcla = 'mezcla', propDirigido = 'h', puntoSel = -1;
function pintarMezcla(sub){
  const bn = perfilDe(ED.a).bn;
  let h = pcabSub(bn ? 'Mezcla de blanco y negro' : 'Mezcla de color', '<button class="txt" data-reset-mezcla>Restablecer</button>');
  if (!bn) h += '<div class="segmento" style="margin:2px 0 6px"><button data-vmez="mezcla" aria-selected="' + (vistaMezcla === 'mezcla') + '">Mezcla</button><button data-vmez="puntual" aria-selected="' + (vistaMezcla === 'puntual') + '">Color puntual</button></div>';
  const puntual = !bn && vistaMezcla === 'puntual';
  if (!puntual) {
    const dirigido = ED.modoToque === 'dirigido';
    h += '<div class="fila-dirigido"><button class="chip-ico' + (dirigido ? ' activo' : '') + '" data-dirigido aria-label="Ajuste dirigido">' + ICO_DIANA + '</button>' +
      (dirigido ? '<div class="segmento">' + (bn ? [['l', 'Luminancia']] : [['h', 'Tono'], ['s', 'Saturación'], ['l', 'Luminancia']]).map(([k, n]) => '<button data-prop="' + k + '" aria-selected="' + (propDirigido === k || bn) + '">' + n + '</button>').join('') + '</div>'
        : '<span class="nota" style="margin:0">Ajuste dirigido: arrastra arriba o abajo sobre la foto</span>') + '</div>';
  }
  if (bn) {
    h += '<div class="ctls"></div>'; sub.innerHTML = h;
    BANDAS.forEach(b => $('.ctls', sub).appendChild(ctlAjuste({ k:'m_' + b.k + '_l', nom:b.nom, riel:'linear-gradient(90deg,#111,' + b.color + ',#fff)' })));
  } else if (!puntual) {
    const b = BANDAS.find(x => x.k === bandaSel), h0 = b.hue;
    const rielTono = 'linear-gradient(90deg,' + [-30, 0, 30].map(d => 'hsl(' + (h0 + d + 360) % 360 + ',75%,55%)').join(',') + ')';
    h += '<div class="puntos" role="radiogroup" aria-label="Color">' + BANDAS.map(x => '<button data-banda="' + x.k + '" style="background:' + x.color + '" class="' + (x.k === bandaSel ? 'activo' : '') + '" aria-label="' + x.nom + '"></button>').join('') + '</div><div class="ctls"></div>';
    sub.innerHTML = h;
    const c = $('.ctls', sub);
    c.appendChild(ctlAjuste({ k:'m_' + b.k + '_h', nom:'Tono', riel:rielTono }));
    c.appendChild(ctlAjuste({ k:'m_' + b.k + '_s', nom:'Saturación', riel:'linear-gradient(90deg,#777,' + b.color + ')' }));
    c.appendChild(ctlAjuste({ k:'m_' + b.k + '_l', nom:'Luminancia', riel:'linear-gradient(90deg,#111,' + b.color + ',#fff)' }));
  } else {
    const pts = ED.a.puntos, p = pts[puntoSel];
    h += '<div class="puntos-color">' + pts.map((x, i) => '<button data-punto="' + i + '" class="' + (i === puntoSel ? 'activo' : '') + '" style="background:rgb(' + x.col.map(v => Math.round(v * 255)).join(',') + ')" aria-label="Color ' + (i + 1) + '"></button>').join('') +
      (pts.length < 8 ? '<button data-punto-nuevo class="' + (ED.modoToque === 'puntual' ? 'activo' : '') + '" aria-label="Elegir un color de la foto">' + ICO_GOTERO + '</button>' : '') + '</div>' +
      (ED.modoToque === 'puntual' ? '<p class="nota">Toca en la foto el color que quieres cambiar.</p>' : !p ? '<p class="nota">Toca el gotero y luego un color de la foto. Después ajusta solo ese color.</p>' : '') +
      (p ? '<div class="ctls"></div><div class="chips"><button data-punto-borrar>Quitar este color</button></div>' : '');
    sub.innerHTML = h;
    if (p) {
      const c = $('.ctls', sub), pp = () => ED.a.puntos[puntoSel] || { h:0, s:0, l:0, rango:50 };
      const ctlP = d => deslizador(d, k => pp()[k], (k, v, f) => { pp()[k] = v; cambiar(f); });
      c.appendChild(ctlP({ k:'h', nom:'Desplazamiento de tono', riel:RIEL_PUNTO_H(p.col) }));
      c.appendChild(ctlP({ k:'s', nom:'Desplazamiento de saturación' }));
      c.appendChild(ctlP({ k:'l', nom:'Desplazamiento de luminancia', riel:'linear-gradient(90deg,#111,#888,#fff)' }));
      c.appendChild(ctlP({ k:'rango', nom:'Rango', min:0, max:100, base:50 }));
    }
  }
  sub.onclick = e => {
    const v = e.target.closest('[data-vmez]'); if (v) { vistaMezcla = v.dataset.vmez; if (ED.modoToque === 'dirigido' || ED.modoToque === 'puntual') ED.modoToque = null; return pintarMezcla(sub); }
    const p = e.target.closest('[data-banda]'); if (p) { bandaSel = p.dataset.banda; return pintarMezcla(sub); }
    if (e.target.closest('[data-dirigido]')) { ED.modoToque = ED.modoToque === 'dirigido' ? null : 'dirigido'; return pintarMezcla(sub); }
    const pr = e.target.closest('[data-prop]'); if (pr) { propDirigido = pr.dataset.prop; return pintarMezcla(sub); }
    const pt = e.target.closest('[data-punto]'); if (pt) { puntoSel = +pt.dataset.punto; ED.modoToque = null; return pintarMezcla(sub); }
    if (e.target.closest('[data-punto-nuevo]')) { ED.modoToque = ED.modoToque === 'puntual' ? null : 'puntual'; return pintarMezcla(sub); }
    if (e.target.closest('[data-punto-borrar]')) { ED.a.puntos.splice(puntoSel, 1); puntoSel = -1; cambiar(true); return pintarMezcla(sub); }
    if (e.target.closest('[data-reset-mezcla]')) { CLAVES_MEZCLA.forEach(k => { ED.a[k] = 0; }); if (puntual) { ED.a.puntos = []; puntoSel = -1; } cambiar(true); pintarMezcla(sub); }
  };
}
const ICO_DIANA = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/></svg>';
const RIEL_PUNTO_H = col => { const [h] = rgbHsv(col); return 'linear-gradient(90deg,' + [-40, 0, 40].map(d => 'hsl(' + ((h * 360 + d) + 360) % 360 + ',75%,55%)').join(',') + ')'; };
function rgbHsv([r, g, b]){
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0; if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [((h / 6) + 1) % 1, mx ? d / mx : 0, mx];
}
/* Toque con el gotero de Color puntual: guarda el color de la foto en ese punto */
function elegirColorPuntual(x, y){
  if (ED.a.puntos.length >= 8) return;
  ED.a.puntos.push({ col:muestraFoto(x, y, 2), h:0, s:0, l:0, rango:50 }); puntoSel = ED.a.puntos.length - 1; ED.modoToque = null;
  cambiar(true); const sub = $('#p-color .subvista'); if (sub && !sub.hidden) pintarMezcla(sub);
}
/* Ajuste dirigido: el color tocado reparte el cambio entre sus bandas vecinas */
let dirigido = null;
function dirigidoInicio(x, y){
  const [h, s] = rgbHsv(muestraFoto(x, y, 2)), hd = h * 360, pesos = {};
  if (s < .06 && !perfilDe(ED.a).bn) { dirigido = null; return toast('Ese punto casi no tiene color. Toca una zona con color.'); }
  let suma = 0;
  BANDAS.forEach(b => { let d = Math.abs(hd - b.hue); d = Math.min(d, 360 - d); const w = Math.max(0, 1 - d / 50); if (w > 0) { pesos[b.k] = w; suma += w; } });
  for (const k in pesos) pesos[k] /= suma;
  const prop = perfilDe(ED.a).bn ? 'l' : propDirigido;
  dirigido = { pesos, prop, ini:Object.fromEntries(Object.keys(pesos).map(k => [k, ED.a['m_' + k + '_' + prop]])) };
}
function dirigidoMover(dy){
  if (!dirigido) return;
  for (const k in dirigido.pesos) { const key = 'm_' + k + '_' + dirigido.prop; ED.a[key] = Math.round(clamp(dirigido.ini[k] - dy * .6 * dirigido.pesos[k], -100, 100)); }
  pedirPintura(); $$('#p-color .ctl').forEach(c => c.sync && c.sync());
}
function dirigidoFin(){ if (dirigido) { dirigido = null; cambiar(true); } }

function pintarGradacion(sub){
  const z = zonaSel;
  sub.innerHTML = pcabSub('Gradación de color', '<button class="txt" data-reset-grad>Restablecer</button>') +
    '<div class="segmento" role="tablist">' + ZONAS.map(x => '<button data-zona="' + x.k + '" aria-selected="' + (x.k === z) + '">' + (x.k === 'medios' ? 'Medios' : x.nom) + '</button>').join('') + '</div>' +
    '<div class="ruedas"><div class="rueda" role="slider" aria-label="Tono y saturación de ' + z + '" tabindex="0"><span class="p"></span></div></div><div class="ctls"></div>';
  const c = $('.ctls', sub);
  /* los mismos valores de la rueda en deslizadores, como el acordeón de Lightroom */
  c.appendChild(ctlAjuste({ k:'g_' + z + '_h', nom:'Tono', min:0, max:360, riel:'linear-gradient(90deg,#f44,#fa3,#ee4,#4e4,#4ee,#44f,#e4e,#f44)' }));
  c.appendChild(ctlAjuste({ k:'g_' + z + '_s', nom:'Saturación', min:0, max:100 }));
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
    pintarPunto(); $$('.ctl', sub).forEach(x => x.sync()); cambiar(final);
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

/* Actualiza los deslizadores visibles, lo que depende de otro ajuste, los estados y los puntos de "editado" */
function sincronizarPaneles(){
  const a = ED.a, p = perfilDe(a);
  $$('#panel .ctl').forEach(c => { if (c.sync) c.sync(); if (c.dataset.depende) c.hidden = a[c.dataset.depende] === DEF[c.dataset.depende]; });
  $$('#panel .fila-nav[data-sub]').forEach(f => {
    const k = f.dataset.sub;
    f.classList.toggle('editado', k === 'curva' ? curvaEditada(a.curva) : k === 'mezcla' ? cambiado(a, CLAVES_MEZCLA) : cambiado(a, CLAVES_GRAD));
    if (k === 'mezcla') $('b', f).textContent = p.bn ? 'Mezcla de blanco y negro' : 'Mezcla de color';
  });
  $$('#tratamiento button').forEach(b => b.setAttribute('aria-selected', (b.dataset.trat === 'bn') === !!p.bn));
  $$('[data-borde]').forEach(b => b.classList.toggle('activo', a.borde.tam > 0 && b.dataset.borde === a.borde.color));
  $('#perfil-nom').textContent = p.nom + (a.perfil.cant !== 100 ? ' · ' + a.perfil.cant + ' %' : '');
  const bb = BB_NOMBRE(a);
  $$('[data-bb]').forEach(b => b.classList.toggle('activo', b.dataset.bb === 'gotero' ? ED.modoToque === 'bb' : (b.dataset.bb === 'como' ? bb === 'Como se tomó' : bb === 'Automático')));
  const ed = {
    presets:!!ED.preset, recortar:!!geoEditada(a.geo) || cambiado(a, CLAVES.geometria), mascaras:a.mascaras.length > 0, quitar:a.manchas.length > 0, desenfoque:a.desenfoque.cant > 0,
    luz:cambiado(a, CLAVES.luz) || curvaEditada(a.curva), color:cambiado(a, CLAVES.color) || a.perfil.id !== 'color' || a.puntos.length > 0, efectos:cambiado(a, CLAVES.efectos) || a.borde.tam > 0,
    detalle:cambiado(a, CLAVES.detalle), optica:cambiado(a, CLAVES.optica), versiones:ED.foto && ED.foto.versiones.length > 0,
  };
  $$('#herramientas button').forEach(b => b.classList.toggle('editado', !!ed[b.dataset.p]));
}

/* ---------- perfiles: navegador con miniaturas e intensidad ---------- */
function hojaPerfiles(){
  const grupos = [...new Set(PERFILES.map(p => p.grupo))];
  abrirHoja(cabHoja('Perfiles') + '<div class="ctls" id="perfil-cant"></div>' + grupos.map(g => '<div class="sub">' + esc(g) + '</div><div class="tira">' +
    PERFILES.filter(p => p.grupo === g).map(p => '<button class="preset" data-perfil="' + p.id + '"><canvas width="148" height="148" data-pmini="' + p.id + '"></canvas><span>' + esc(p.nom) + '</span></button>').join('') + '</div>').join(''));
  const marcar = () => $$('#hoja [data-perfil]').forEach(b => b.classList.toggle('activo', b.dataset.perfil === ED.a.perfil.id));
  const cant = $('#perfil-cant');
  const pintarCant = () => { cant.innerHTML = ''; if (ED.a.perfil.id !== 'color') cant.appendChild(deslizador({ k:'pcant', nom:'Intensidad', min:0, max:200, base:100 }, () => ED.a.perfil.cant, (k, v, f) => { ED.a.perfil.cant = v; cambiar(f); })); };
  pintarCant(); marcar();
  $('#hoja').onclick = e => { const b = e.target.closest('[data-perfil]'); if (b) { ED.a.perfil = { id:b.dataset.perfil, cant:100 }; cambiar(true); marcar(); pintarCant(); if ($('#p-color').dataset.abierta) abrirSub($('#p-color'), $('#p-color').dataset.abierta); } };
  pintarMinis($$('#hoja canvas[data-pmini]'), c => Object.assign(clonar(ED.a), { perfil:{ id:c.dataset.pmini, cant:100 } }));
}

/* ---------- muestras de la foto original (selector de balance, rango de color y Quitar) ---------- */
function pixelesFoto(){
  if (!ED.srcPx) { const k = 640 / Math.max(ED.fuente.w, ED.fuente.h); ED.srcPx = Motor.revelar(ED.fuente, ajustesBase(), { ancho:Math.round(ED.fuente.w * k), alto:Math.round(ED.fuente.h * k), antes:true, destino:'pixeles' }); }
  return ED.srcPx;
}
/* Color promedio (0..1) alrededor de un punto de la foto (x, y en 0..1) */
function muestraFoto(x, y, r = 3){
  const p = pixelesFoto(), cx = Math.round(x * (p.width - 1)), cy = Math.round(y * (p.height - 1)), s = [0, 0, 0]; let n = 0;
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
    const xx = clamp(cx + i, 0, p.width - 1), yy = clamp(cy + j, 0, p.height - 1), o = (yy * p.width + xx) * 4;
    s[0] += p.data[o]; s[1] += p.data[o + 1]; s[2] += p.data[o + 2]; n++;
  }
  return s.map(v => v / n / 255);
}
/* Temperatura y matiz que vuelven neutro un color (inverso del balance del motor) */
function bbDesdeColor(rgb){
  const [r, g, b] = rgb.map(v => Math.max(.004, Math.pow(v, 2.2)));
  const q = b / r, te = (q - 1) / (.28 * (1 + q)), m = Math.sqrt(r * b) / g, ti = (1 - m) / (.18 + .12 * m);
  return { temperatura:Math.round(clamp(te * 100, -100, 100)), matiz:Math.round(clamp(ti * 100, -100, 100)) };
}
/* Automático: promedio de los medios tonos de toda la foto */
function bbAutomatico(){
  const d = pixelesFoto().data, s = [0, 0, 0]; let n = 0;
  for (let i = 0; i < d.length; i += 16) { const L = (.2126 * d[i] + .7152 * d[i + 1] + .0722 * d[i + 2]) / 255; if (L > .15 && L < .85) { s[0] += d[i]; s[1] += d[i + 1]; s[2] += d[i + 2]; n++; } }
  if (!n) return { temperatura:0, matiz:0 };
  const v = bbDesdeColor(s.map(x => x / n / 255));
  /* como el automático de Lightroom, corrige a medias para no borrar la luz del momento (un atardecer sigue cálido) */
  return { temperatura:Math.round(clamp(v.temperatura * .5, -40, 40)), matiz:Math.round(clamp(v.matiz * .5, -30, 30)) };
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
    intensidad:12, saturacion:4,
  };
}
