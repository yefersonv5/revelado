/* Gestos del celular, con los mismos estándares de Caudal:
   - sin zoom accidental de la página (pellizco y doble toque); el pellizco solo acerca la foto en el editor
   - el gesto de atrás del sistema (o el botón atrás del navegador) cierra la hoja abierta o vuelve a la biblioteca
   - en la app instalada, deslizar desde el borde izquierdo vuelve a la biblioteca, porque iOS no trae ese gesto */

const esInstalada = () => navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);

/* ---------- sin zoom de la página ---------- */
['gesturestart', 'gesturechange', 'gestureend'].forEach(ev => document.addEventListener(ev, e => e.preventDefault(), { passive:false }));
document.addEventListener('touchmove', e => { if (e.touches && e.touches.length > 1 && !e.target.closest('#escena')) e.preventDefault(); }, { passive:false });

/* ---------- historial: atrás del sistema ---------- */
const NAVH = { depth:0, skip:0 };
function navPush(s){ if (esComputador()) return; try { history.pushState({ rev:s }, ''); NAVH.depth++; } catch (_) {} }
/* Vuelve en el historial si la app había empujado un paso; si no, no hace nada (y devuelve false) */
function navAtras(){ if (NAVH.depth < 1) return false; NAVH.skip++; NAVH.depth--; history.back(); return true; }
window.addEventListener('popstate', () => {
  if (NAVH.skip) { NAVH.skip--; return; }
  if (NAVH.depth > 0) NAVH.depth--;
  if (!$('#hoja').hidden) { cerrarHoja(); navPush('hoja'); return; } /* con una hoja abierta, el gesto solo la cierra */
  if (!$('#v-editor').hidden) volverBiblioteca(true);
});

/* ---------- deslizar desde el borde izquierdo (app instalada) ---------- */
(() => {
  if (!esInstalada()) return;
  let x0 = null, y0 = 0, dx = 0, on = false, t0 = 0;
  const vista = () => $('#v-editor');
  document.addEventListener('touchstart', e => {
    x0 = null;
    if (esComputador() || $('#v-editor').hidden || !$('#hoja').hidden || e.touches.length > 1) return;
    const t = e.touches[0]; if (t.clientX > 24) return;
    x0 = t.clientX; y0 = t.clientY; dx = 0; on = false; t0 = Date.now();
  }, { passive:true });
  document.addEventListener('touchmove', e => {
    if (x0 === null) return; const t = e.touches[0]; dx = t.clientX - x0; const dy = t.clientY - y0;
    if (!on) { if (Math.abs(dy) > 12 && Math.abs(dy) > dx) { x0 = null; return; } if (dx > 10) { on = true; vista().style.transition = 'none'; } else return; }
    e.preventDefault(); vista().style.transform = 'translateX(' + Math.max(0, dx) + 'px)';
  }, { passive:false });
  const fin = () => {
    if (x0 === null) return; x0 = null; if (!on) return; on = false;
    const v = vista(), vel = dx / Math.max(1, Date.now() - t0);
    if (dx > window.innerWidth * .3 || (vel > .45 && dx > 40)) {
      v.style.transition = 'transform .18s ease-out'; v.style.transform = 'translateX(100%)';
      setTimeout(() => { v.style.transition = 'none'; v.style.transform = ''; volverBiblioteca(); requestAnimationFrame(() => { v.style.transition = ''; }); }, 180);
    } else { v.style.transition = 'transform .2s ease-out'; v.style.transform = ''; setTimeout(() => { v.style.transition = ''; }, 220); }
  };
  document.addEventListener('touchend', fin, { passive:true });
  document.addEventListener('touchcancel', fin, { passive:true });
})();
