/* Deslizador táctil al estilo Lightroom.
   Se arrastra desde cualquier punto de la fila (el valor se mueve en relación al dedo, sin saltos al tocar),
   el desplazamiento vertical sigue funcionando para recorrer el panel, tiene un leve imán en el valor
   por defecto, y un doble toque lo devuelve a ese valor. También responde a las flechas del teclado. */

function deslizador(def, obtener, fijar){
  const min = def.min ?? -100, max = def.max ?? 100, paso = def.paso ?? 1, base = def.base ?? DEF[def.k] ?? 0;
  const el = document.createElement('div');
  el.className = 'ctl'; el.tabIndex = 0; el.dataset.k = def.k;
  el.setAttribute('role', 'slider'); el.setAttribute('aria-label', def.nom);
  el.setAttribute('aria-valuemin', min); el.setAttribute('aria-valuemax', max);
  el.innerHTML = '<span class="nom">' + esc(def.nom) + '</span><span class="val"></span><div class="pista"><div class="relleno"></div><div class="perilla"></div></div>';
  if (def.riel) el.style.setProperty('--riel', def.riel);
  const pista = $('.pista', el), relleno = $('.relleno', el), perilla = $('.perilla', el), val = $('.val', el);
  const fmt = v => paso < 1 ? (v > 0 ? '+' : '') + v.toFixed(2) : (v > 0 && min < 0 ? '+' : '') + Math.round(v);
  const pct = v => (v - min) / (max - min) * 100;

  el.sync = () => {
    const v = obtener(def.k), p = pct(v), b = pct(clamp(base, min, max));
    perilla.style.left = p + '%';
    relleno.hidden = !!def.riel;
    relleno.style.left = Math.min(p, b) + '%'; relleno.style.width = Math.abs(p - b) + '%';
    val.textContent = fmt(v); el.classList.toggle('cambiado', v !== base);
    el.setAttribute('aria-valuenow', v); el.setAttribute('aria-valuetext', fmt(v));
  };
  const poner = (v, final) => {
    v = clamp(Math.round(v / paso) * paso, min, max);
    if (Math.abs(v - base) < (max - min) * .006) v = base;   /* imán en el valor por defecto */
    v = +v.toFixed(4);
    if (v !== obtener(def.k) || final) fijar(def.k, v, final);
    el.sync();
  };

  let x0 = 0, v0 = 0, ancho = 1, id = null, arrastra = false, ultimoToque = 0;
  el.addEventListener('pointerdown', e => {
    if (e.button) return;
    id = e.pointerId; x0 = e.clientX; v0 = obtener(def.k); ancho = pista.getBoundingClientRect().width || 1; arrastra = false;
  });
  el.addEventListener('pointermove', e => {
    if (e.pointerId !== id) return;
    const dx = e.clientX - x0;
    if (!arrastra) { if (Math.abs(dx) < 5) return; arrastra = true; el.setPointerCapture(id); el.classList.add('arrastrando'); x0 = e.clientX; return; }
    poner(v0 + dx / ancho * (max - min), false);
  });
  const soltar = e => {
    if (e.pointerId !== id) return; id = null;
    if (arrastra) { arrastra = false; el.classList.remove('arrastrando'); poner(obtener(def.k), true); return; }
    if (e.type !== 'pointerup') return;
    const ahora = Date.now();
    if (ahora - ultimoToque < 320) { ultimoToque = 0; poner(base, true); } else ultimoToque = ahora;
  };
  el.addEventListener('pointerup', soltar); el.addEventListener('pointercancel', soltar);
  el.addEventListener('keydown', e => {
    const d = { ArrowRight:1, ArrowUp:1, ArrowLeft:-1, ArrowDown:-1 }[e.key];
    if (d) { e.preventDefault(); poner(obtener(def.k) + d * paso * (e.shiftKey ? 10 : 1), true); }
    else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); poner(base, true); }
  });
  el.sync();
  return el;
}
