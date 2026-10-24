/* Núcleo: utilidades pequeñas, aviso tipo iOS, hojas que suben desde abajo y el gesto de arrastrarlas para cerrar. */

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const clonar = o => JSON.parse(JSON.stringify(o));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const esperar = ms => new Promise(r => setTimeout(r, ms));
const esComputador = () => window.innerWidth >= 1024;

/* Íconos que se repiten en varias pantallas */
const ICO = {
  cerrar:'<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  chev:'<svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>',
  estrella:'<svg viewBox="0 0 24 24"><path d="m12 3.2 2.7 5.5 6 .9-4.35 4.25 1.03 6L12 17l-5.38 2.85 1.03-6L3.3 9.6l6-.9z"/></svg>',
  editada:'<svg viewBox="0 0 24 24"><path d="M4 8h10M18 8h2M4 16h2M10 16h10"/><circle cx="16" cy="8" r="2"/><circle cx="8" cy="16" r="2"/></svg>',
};

/* ---------- aviso breve arriba, como las notificaciones de iOS ---------- */
let avisoT;
function toast(msg, ms = 2000){
  const a = $('#aviso'); a.textContent = msg; a.hidden = false;
  clearTimeout(avisoT); avisoT = setTimeout(() => { a.hidden = true; }, ms);
}

/* ---------- hojas ----------
   abrirHoja(html) pinta el contenido con su agarradera; cerrarHoja() la baja.
   Un botón con data-cerrar dentro de la hoja la cierra. alCerrarHoja se llama una vez al cerrar. */
let alCerrarHoja = null;
const cabHoja = titulo => '<div class="hcab"><b id="hoja-titulo">' + esc(titulo) + '</b><button class="x" data-cerrar aria-label="Cerrar">' + ICO.cerrar + '</button></div>';
function abrirHoja(html, alCerrar = null){
  const h = $('#hoja'), s = $('#scrim');
  if (h.hidden && alCerrarHoja) { const f = alCerrarHoja; alCerrarHoja = null; f(); }
  alCerrarHoja = alCerrar;
  h.innerHTML = '<div class="grab"></div>' + html;
  if (h.hidden) { h.classList.add('entrando'); h.hidden = false; s.hidden = false; s.style.opacity = '0';
    requestAnimationFrame(() => requestAnimationFrame(() => { h.classList.remove('entrando'); s.style.opacity = ''; })); }
  h.scrollTop = 0;
  const f = h.querySelector('input[autofocus]'); if (f) setTimeout(() => f.focus(), 280);
}
function cerrarHoja(){
  const h = $('#hoja'), s = $('#scrim'); if (h.hidden) return;
  h.classList.add('entrando'); s.style.opacity = '0';
  setTimeout(() => { h.hidden = true; s.hidden = true; h.classList.remove('entrando'); h.style.transform = ''; s.style.opacity = ''; h.innerHTML = ''; }, 260);
  if (alCerrarHoja) { const f = alCerrarHoja; alCerrarHoja = null; f(); }
}
document.addEventListener('click', e => {
  if (e.target.closest('[data-cerrar]') || e.target.id === 'scrim') cerrarHoja();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarHoja(); });

/* Arrastrar la hoja hacia abajo para cerrarla (celular). Igual que en Caudal: si la hoja está
   desplazada, primero sube el contenido y, cuando llega arriba, el mismo gesto baja la hoja. */
(() => {
  let y0 = null, x0 = 0, dy = 0, arrastra = false, rastro = [];
  const hoja = () => $('#hoja');
  document.addEventListener('touchstart', e => {
    const h = hoja(); if (h.hidden || esComputador() || e.touches.length > 1 || !h.contains(e.target)) return;
    if (e.target.closest('input,.ctl,.rueda,#curva-svg') && !e.target.closest('.grab,.hcab')) return;
    y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; dy = 0; arrastra = false; rastro = [[Date.now(), y0]];
  }, { passive:true });
  document.addEventListener('touchmove', e => {
    if (y0 === null) return; const h = hoja(), y = e.touches[0].clientY, x = e.touches[0].clientX;
    if (!arrastra) {
      if (Math.abs(x - x0) > 14 && Math.abs(x - x0) > Math.abs(y - y0)) { y0 = null; return; } /* gesto lateral */
      if (h.scrollTop > 0 && !e.target.closest('.grab,.hcab')) { y0 = y; return; }        /* aún sube el contenido */
      if (y - y0 > 6) { arrastra = true; h.style.transition = 'none'; } else return;
    }
    e.preventDefault();
    dy = Math.max(0, y - y0); h.style.transform = 'translateY(' + dy + 'px)';
    rastro.push([Date.now(), y]); if (rastro.length > 6) rastro.shift();
    $('#scrim').style.opacity = String(Math.max(0, 1 - dy / 400));
  }, { passive:false });
  const fin = () => {
    if (y0 === null) return; const h = hoja(); y0 = null;
    if (!arrastra) return; arrastra = false;
    const a = rastro[0], z = rastro[rastro.length - 1], v = z && a && z[0] > a[0] ? (z[1] - a[1]) / (z[0] - a[0]) : 0; /* px por ms */
    h.style.transition = ''; $('#scrim').style.opacity = '';
    if (dy > 80 || (v > 0.4 && dy > 24)) { h.style.transform = 'translateY(100%)'; cerrarHoja(); }
    else h.style.transform = '';
  };
  document.addEventListener('touchend', fin, { passive:true });
  document.addEventListener('touchcancel', fin, { passive:true });
})();

/* ---------- confirmación dentro de una hoja (sin confirm(), que iOS bloquea en apps instaladas) ---------- */
function confirmar(titulo, texto, accion, etiqueta = 'Eliminar'){
  return new Promise(res => {
    let ok = false;
    abrirHoja(cabHoja(titulo) + '<p class="ayuda" style="text-align:left;font-size:15px">' + esc(texto) + '</p>' +
      '<div class="grupo"><button data-confirma class="' + (accion === 'peligro' ? 'peligro' : '') + '" style="justify-content:center;font-weight:600">' + esc(etiqueta) + '</button></div>' +
      '<div class="grupo"><button data-cerrar style="justify-content:center">Cancelar</button></div>', () => res(ok));
    $('#hoja [data-confirma]').onclick = () => { ok = true; cerrarHoja(); };
  });
}
