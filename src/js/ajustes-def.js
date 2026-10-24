/* Ajustes: valores por defecto, controles de cada panel, bandas de la mezcla de color y presets incluidos.
   Un ajuste de foto es un objeto plano de números (DEF) más curva, geo (geometría) y mascaras. */

/* Bandas de la mezcla de color: tono central en grados y color del punto en la interfaz */
const BANDAS = [
  { k:'rojo', nom:'Rojo', hue:0, color:'#E5484D' },
  { k:'naranja', nom:'Naranja', hue:30, color:'#F08C2E' },
  { k:'amarillo', nom:'Amarillo', hue:58, color:'#E8D33F' },
  { k:'verde', nom:'Verde', hue:120, color:'#4CB860' },
  { k:'aguamarina', nom:'Aguamarina', hue:180, color:'#3EC7C7' },
  { k:'azul', nom:'Azul', hue:225, color:'#3B7CF0' },
  { k:'purpura', nom:'Púrpura', hue:275, color:'#9056E0' },
  { k:'magenta', nom:'Magenta', hue:320, color:'#D64FB3' },
];
const ZONAS = [ { k:'sombras', nom:'Sombras' }, { k:'medios', nom:'Medios tonos' }, { k:'luces', nom:'Luces' }, { k:'global', nom:'Global' } ];

/* Valores numéricos por defecto. Casi todos van de -100 a 100 y valen 0 */
const DEF = {
  exposicion:0, contraste:0, altas:0, sombras:0, blancos:0, negros:0,
  temperatura:0, matiz:0, intensidad:0, saturacion:0,
  textura:0, claridad:0, neblina:0,
  vineta:0, vineta_punto:50, vineta_redondez:0, vineta_desv:50,
  grano:0, grano_tam:25, grano_asp:50,
  nitidez:0, nitidez_radio:1, ruido:0, ruido_color:0,
  g_mezcla:50, g_balance:0,
};
BANDAS.forEach(b => { DEF['m_' + b.k + '_h'] = 0; DEF['m_' + b.k + '_s'] = 0; DEF['m_' + b.k + '_l'] = 0; });
ZONAS.forEach(z => { DEF['g_' + z.k + '_h'] = 0; DEF['g_' + z.k + '_s'] = 0; DEF['g_' + z.k + '_l'] = 0; });

const CURVA_DEF = { rgb:[[0, 0], [1, 1]], r:[[0, 0], [1, 1]], g:[[0, 0], [1, 1]], b:[[0, 0], [1, 1]] };
const GEO_DEF = { rot:0, flipH:false, flipV:false, angulo:0, x:0, y:0, w:1, h:1, aspecto:'libre' };

/* Ajuste completo sin cambios */
const ajustesBase = () => Object.assign(clonar(DEF), { curva:clonar(CURVA_DEF), geo:clonar(GEO_DEF), mascaras:[] });

/* Completa un ajuste guardado con lo que le falte (por si la app agrega ajustes nuevos) */
function completarAjustes(a){
  const b = ajustesBase();
  if (!a) return b;
  for (const k in DEF) if (typeof a[k] === 'number') b[k] = a[k];
  if (a.curva) for (const c in CURVA_DEF) if (Array.isArray(a.curva[c]) && a.curva[c].length >= 2) b.curva[c] = a.curva[c];
  if (a.geo) Object.assign(b.geo, a.geo);
  if (Array.isArray(a.mascaras)) b.mascaras = a.mascaras.map(m => Object.assign(mascaraBase(m.tipo), m, { a:Object.assign(mascaraBase(m.tipo).a, m.a || {}) }));
  return b;
}

const curvaRecta = c => c.length === 2 && c[0][0] === 0 && c[0][1] === 0 && c[1][0] === 1 && c[1][1] === 1;
const curvaEditada = cv => !['rgb', 'r', 'g', 'b'].every(k => curvaRecta(cv[k]));
const cambiado = (a, claves) => claves.some(k => a[k] !== DEF[k]);
const geoEditada = g => g.rot || g.flipH || g.flipV || g.angulo || g.x || g.y || g.w !== 1 || g.h !== 1;

/* ¿La foto tiene algún cambio? Sirve para la marca de "editada" en la biblioteca */
const ajustesEditados = a => cambiado(a, Object.keys(DEF)) || curvaEditada(a.curva) || geoEditada(a.geo) || a.mascaras.length > 0;

/* ---------- controles de los paneles ----------
   k: clave en el ajuste; min, max, paso; riel: degradado del riel (temperatura, matiz);
   depende: solo se muestra si ese otro ajuste no está en su valor por defecto. */
const RIEL_TEMP = 'linear-gradient(90deg,#3D7FD6,#8A8A8A 50%,#E3C15A)';
const RIEL_MATIZ = 'linear-gradient(90deg,#3FB35A,#8A8A8A 50%,#CF55C0)';
const PANELES = {
  luz:[
    { k:'exposicion', nom:'Exposición', min:-5, max:5, paso:.01 },
    { k:'contraste', nom:'Contraste' }, { k:'altas', nom:'Altas luces' }, { k:'sombras', nom:'Sombras' },
    { k:'blancos', nom:'Blancos' }, { k:'negros', nom:'Negros' },
  ],
  color:[
    { k:'temperatura', nom:'Temperatura', riel:RIEL_TEMP }, { k:'matiz', nom:'Matiz', riel:RIEL_MATIZ },
    { k:'intensidad', nom:'Intensidad' }, { k:'saturacion', nom:'Saturación' },
  ],
  efectos:[
    { k:'textura', nom:'Textura' }, { k:'claridad', nom:'Claridad' }, { k:'neblina', nom:'Neblina' },
    { k:'vineta', nom:'Viñeta' },
    { k:'vineta_punto', nom:'Punto medio', min:0, max:100, depende:'vineta' },
    { k:'vineta_redondez', nom:'Redondez', depende:'vineta' },
    { k:'vineta_desv', nom:'Desvanecer', min:0, max:100, depende:'vineta' },
    { k:'grano', nom:'Grano', min:0, max:100 },
    { k:'grano_tam', nom:'Tamaño', min:0, max:100, depende:'grano' },
    { k:'grano_asp', nom:'Aspereza', min:0, max:100, depende:'grano' },
  ],
  detalle:[
    { k:'nitidez', nom:'Nitidez', min:0, max:150 },
    { k:'nitidez_radio', nom:'Radio', min:.5, max:3, paso:.1, depende:'nitidez' },
    { k:'ruido', nom:'Reducción de ruido', min:0, max:100 },
    { k:'ruido_color', nom:'Ruido de color', min:0, max:100 },
  ],
};
/* Claves que mueve cada pestaña: sirven para el punto de "editado" y para restablecer por panel */
const CLAVES = {
  luz:PANELES.luz.map(c => c.k),
  color:PANELES.color.map(c => c.k).concat(Object.keys(DEF).filter(k => /^[mg]_/.test(k))),
  efectos:PANELES.efectos.map(c => c.k),
  detalle:PANELES.detalle.map(c => c.k),
};
const CLAVES_MEZCLA = Object.keys(DEF).filter(k => k.startsWith('m_'));
const CLAVES_GRAD = Object.keys(DEF).filter(k => k.startsWith('g_'));

/* ---------- máscaras ---------- */
const AJ_MASCARA = [
  { k:'exposicion', nom:'Exposición', min:-4, max:4, paso:.01 }, { k:'contraste', nom:'Contraste' },
  { k:'altas', nom:'Altas luces' }, { k:'sombras', nom:'Sombras' },
  { k:'temperatura', nom:'Temperatura', riel:RIEL_TEMP }, { k:'matiz', nom:'Matiz', riel:RIEL_MATIZ },
  { k:'saturacion', nom:'Saturación' }, { k:'claridad', nom:'Claridad' },
];
function mascaraBase(tipo){
  const a = {}; AJ_MASCARA.forEach(c => { a[c.k] = 0; });
  /* coordenadas en la foto original (0 a 1). Lineal: de p0 (efecto completo) a p1 (sin efecto).
     Radial: centro, radios como fracción del lado mayor, ángulo y desvanecido. */
  return tipo === 'radial'
    ? { id:uid(), tipo:'radial', invertir:false, cx:.5, cy:.5, rx:.22, ry:.16, ang:0, desv:50, a }
    : { id:uid(), tipo:'lineal', invertir:false, x0:.5, y0:.15, x1:.5, y1:.55, a };
}

/* ---------- presets incluidos ----------
   Al aplicar un preset se restablecen luz, color, efectos, detalle y curva; recorte y máscaras se conservan. */
const PRESETS_INCLUIDOS = [
  { grupo:'Esenciales', lista:[
    { nom:'Auto', auto:true },
    { nom:'Vívido', a:{ intensidad:35, saturacion:10, contraste:18, claridad:15, textura:10 } },
    { nom:'Suave', a:{ contraste:-15, altas:-20, sombras:20, claridad:-15, textura:-10 } },
    { nom:'Brillante', a:{ exposicion:.35, sombras:25, blancos:15, intensidad:12 } },
  ]},
  { grupo:'Retrato', lista:[
    { nom:'Cálido', a:{ temperatura:18, matiz:4, intensidad:10, sombras:12, textura:-15 } },
    { nom:'Piel luminosa', a:{ exposicion:.15, textura:-25, claridad:-10, m_naranja_l:15, m_naranja_s:-8, m_rojo_s:-6 } },
    { nom:'Contraste suave', a:{ contraste:12, altas:-25, sombras:18, vineta:-15 }, curva:{ rgb:[[0, .03], [.25, .22], [.75, .8], [1, .98]] } },
  ]},
  { grupo:'Paisaje', lista:[
    { nom:'Atardecer', a:{ temperatura:35, matiz:12, intensidad:25, exposicion:.1, vineta:-25, g_luces_h:38, g_luces_s:25 } },
    { nom:'Cielo profundo', a:{ m_azul_l:-25, m_azul_s:15, m_aguamarina_l:-10, altas:-30, intensidad:15, neblina:10 } },
    { nom:'Sin neblina', a:{ neblina:35, contraste:8, intensidad:10 } },
    { nom:'Verde bosque', a:{ m_verde_h:-12, m_verde_s:-15, m_verde_l:-10, m_amarillo_h:-10, sombras:15, temperatura:-6 } },
  ]},
  { grupo:'Película', lista:[
    { nom:'Película cálida', a:{ temperatura:12, saturacion:-12, grano:30, vineta:-18, g_sombras_h:200, g_sombras_s:12, g_luces_h:40, g_luces_s:18 }, curva:{ rgb:[[0, .06], [.3, .27], [.75, .8], [1, .95]] } },
    { nom:'Película fría', a:{ temperatura:-10, saturacion:-15, grano:25, g_sombras_h:210, g_sombras_s:20, g_medios_h:180, g_medios_s:6 }, curva:{ rgb:[[0, .07], [.5, .5], [1, .94]] } },
    { nom:'Mate', a:{ contraste:-12, altas:-15, saturacion:-15 }, curva:{ rgb:[[0, .12], [.25, .27], [.75, .76], [1, .94]] } },
    { nom:'Cinematográfico', a:{ contraste:15, saturacion:-10, g_sombras_h:190, g_sombras_s:30, g_luces_h:32, g_luces_s:28, g_balance:-10, vineta:-20 } },
  ]},
  { grupo:'Blanco y negro', lista:[
    { nom:'Clásico', a:{ saturacion:-100, contraste:20, claridad:10 } },
    { nom:'Alto contraste', a:{ saturacion:-100, contraste:45, blancos:20, negros:-25, claridad:30, vineta:-25 } },
    { nom:'Suave con grano', a:{ saturacion:-100, contraste:-10, grano:40, grano_tam:35 }, curva:{ rgb:[[0, .08], [1, .95]] } },
    { nom:'Sepia', a:{ saturacion:-100, g_global_h:35, g_global_s:22, contraste:10 } },
  ]},
];

/* Mezcla un preset con la intensidad elegida (0 a 2): 1 es el preset tal cual */
function ajustesDePreset(base, p, cant = 1){
  const a = Object.assign(clonar(DEF), { curva:clonar(CURVA_DEF), geo:clonar(base.geo), mascaras:clonar(base.mascaras) });
  /* el tono de la gradación no se escala: la intensidad la da su saturación */
  for (const k in (p.a || {})) a[k] = /^g_.+_h$/.test(k) ? p.a[k] : clampAjuste(k, DEF[k] + (p.a[k] - DEF[k]) * cant);
  for (const c in (p.curva || {})) a.curva[c] = p.curva[c].map(([x, y]) => [x, clamp(x + (y - x) * cant, 0, 1)]);
  return a;
}

/* Límites de cada clave numérica, tomados de los controles */
const LIMITES = {};
Object.values(PANELES).flat().forEach(c => { LIMITES[c.k] = [c.min ?? -100, c.max ?? 100]; });
BANDAS.forEach(b => ['h', 's', 'l'].forEach(x => { LIMITES['m_' + b.k + '_' + x] = [-100, 100]; }));
ZONAS.forEach(z => { LIMITES['g_' + z.k + '_h'] = [0, 360]; LIMITES['g_' + z.k + '_s'] = [0, 100]; LIMITES['g_' + z.k + '_l'] = [-100, 100]; });
LIMITES.g_mezcla = [0, 100]; LIMITES.g_balance = [-100, 100];
const clampAjuste = (k, v) => LIMITES[k] ? clamp(v, LIMITES[k][0], LIMITES[k][1]) : v;
