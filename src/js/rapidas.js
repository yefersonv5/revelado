/* Acciones rápidas, como en Lightroom: arreglos de un toque que se suman a lo que ya tienes
   (mejorar, corregir el ángulo, desenfocar el fondo, blanco y negro y algunos estilos). Cada una muestra
   una miniatura de cómo quedaría y se puede deshacer. */

const RAPIDAS = [
  { k:'mejorar', nom:'Mejorar', aplicar:a => Object.assign(a, valoresAuto(ED.fuente, a), bbAutomatico(), { bbAuto:true, textura:Math.max(a.textura, 8) }) },
  { k:'angulo', nom:'Corregir ángulo', aplicar:a => { const prev = ED.a; ED.a = a; const ok = aplicarUpright('auto'); ED.a = prev; return ok; } },
  { k:'fondo', nom:'Desenfocar fondo', aplicar:a => { const [cx, cy] = salidaASrc(.5, .5); Object.assign(a.desenfoque, { cant:55, cx, cy, rx:.2, ry:.28, ang:0, desv:60 }); } },
  { k:'bn', nom:'Blanco y negro', aplicar:a => Object.assign(a, valoresAuto(ED.fuente, a), { perfil:{ id:'monocromo', cant:100 }, contraste:Math.max(a.contraste, 15) }) },
  { k:'vivido', nom:'Más color', aplicar:a => Object.assign(a, { intensidad:clamp(a.intensidad + 30, -100, 100), saturacion:clamp(a.saturacion + 8, -100, 100) }) },
  { k:'cielo', nom:'Cielo intenso', aplicar:a => Object.assign(a, { m_azul_l:clamp(a.m_azul_l - 25, -100, 100), m_azul_s:clamp(a.m_azul_s + 15, -100, 100), m_aguamarina_l:clamp(a.m_aguamarina_l - 10, -100, 100), altas:clamp(a.altas - 20, -100, 100) }) },
  { k:'piel', nom:'Suavizar piel', aplicar:a => Object.assign(a, { textura:clamp(a.textura - 25, -100, 100), claridad:clamp(a.claridad - 10, -100, 100), m_naranja_l:clamp(a.m_naranja_l + 10, -100, 100) }) },
  { k:'calido', nom:'Luz cálida', aplicar:a => Object.assign(a, { temperatura:clamp(a.temperatura + 18, -100, 100), matiz:clamp(a.matiz + 5, -100, 100), bbAuto:false }) },
];

function pintarRapidas(){
  const p = $('#p-rapidas');
  p.innerHTML = pcab('Acciones rápidas') + '<div class="rejilla-rapidas">' + RAPIDAS.map(r =>
    '<button class="preset" data-rapida="' + r.k + '"><canvas width="148" height="148" data-rmini="' + r.k + '"></canvas><span>' + r.nom + '</span></button>').join('') + '</div>' +
    '<p class="nota">Se suman a lo que ya hiciste y puedes deshacerlas. Las de Lightroom que usan IA (quitar distracciones o personas) no están.</p>';
  pintarMinis($$('#p-rapidas canvas[data-rmini]'), c => {
    const r = RAPIDAS.find(x => x.k === c.dataset.rmini), a = clonar(ED.a);
    return r.aplicar(a) === false ? ED.a : a;
  });
}
function construirRapidas(){
  $('#p-rapidas').addEventListener('click', e => {
    const b = e.target.closest('[data-rapida]'); if (!b) return;
    const r = RAPIDAS.find(x => x.k === b.dataset.rapida), a = clonar(ED.a);
    if (r.aplicar(a) === false) return toast('No encontré líneas rectas para corregir el ángulo');
    ED.a = a; cambiar(true); refrescarTodo(true); toast(r.nom + ' aplicado');
  });
}

/* Cuadrícula sobre la foto mientras se ajusta la geometría, para ver si las líneas quedan rectas */
function pintarCapaReja(W, H){
  let d = ''; for (let i = 1; i < 8; i++) d += 'M' + W * i / 8 + ' 0V' + H + 'M0 ' + H * i / 8 + 'H' + W;
  return '<path class="tercio" d="' + d + '"/>';
}
