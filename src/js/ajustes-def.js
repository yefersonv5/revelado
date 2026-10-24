/* Ajustes: valores por defecto, controles de cada panel, perfiles, bandas de la mezcla de color, máscaras,
   grupos para copiar ajustes y presets incluidos.
   Un ajuste de foto es un objeto plano de números (DEF) más: perfil, curva, geo (giro, volteo, enderezar
   y recorte), mascaras, manchas (herramienta Quitar) y desenfoque (desenfoque de lente). */

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
  /* luz */
  exposicion:0, contraste:0, altas:0, sombras:0, blancos:0, negros:0,
  /* color */
  temperatura:0, matiz:0, intensidad:0, saturacion:0,
  g_mezcla:50, g_balance:0,
  /* efectos */
  textura:0, claridad:0, neblina:0,
  vineta:0, vineta_punto:50, vineta_redondez:0, vineta_desv:50, vineta_altas:0,
  grano:0, grano_tam:25, grano_asp:50,
  /* detalle */
  nitidez:0, nitidez_radio:1, nitidez_detalle:25, nitidez_mascara:0,
  ruido:0, ruido_detalle:50, ruido_color:0,
  /* óptica */
  aberracion:0, desfleco_purpura:0, desfleco_verde:0, vineteado_lente:0, vineteado_punto:50,
  /* geometría */
  distorsion:0, vertical:0, horizontal:0, rotar:0, aspecto:0, escala:100, desp_x:0, desp_y:0, restringir:0,
};
BANDAS.forEach(b => { DEF['m_' + b.k + '_h'] = 0; DEF['m_' + b.k + '_s'] = 0; DEF['m_' + b.k + '_l'] = 0; });
ZONAS.forEach(z => { DEF['g_' + z.k + '_h'] = 0; DEF['g_' + z.k + '_s'] = 0; DEF['g_' + z.k + '_l'] = 0; });

const CURVA_DEF = { rgb:[[0, 0], [1, 1]], r:[[0, 0], [1, 1]], g:[[0, 0], [1, 1]], b:[[0, 0], [1, 1]], param:[0, 0, 0, 0] };
const GEO_DEF = { rot:0, flipH:false, flipV:false, angulo:0, x:0, y:0, w:1, h:1, aspecto:'libre' };
const PERFIL_DEF = { id:'color', cant:100 };
const DESENFOQUE_DEF = { cant:0, cx:.5, cy:.5, rx:.18, ry:.24, ang:0, desv:60, tipo:'radial' };

/* Ajuste completo sin cambios */
const BORDE_DEF = { tam:0, color:'#FFFFFF' };
/* puntos: Color puntual (hasta 8 colores muestreados). guias: líneas de Upright guiado en el marco orientado. upright: modo elegido */
const ajustesBase = () => Object.assign(clonar(DEF), { perfil:clonar(PERFIL_DEF), curva:clonar(CURVA_DEF), geo:clonar(GEO_DEF), mascaras:[], manchas:[],
  desenfoque:clonar(DESENFOQUE_DEF), puntos:[], borde:clonar(BORDE_DEF), guias:[], upright:'' });

/* Completa un ajuste guardado con lo que le falte (por si la app agrega ajustes nuevos) */
function completarAjustes(a){
  const b = ajustesBase();
  if (!a) return b;
  for (const k in DEF) if (typeof a[k] === 'number') b[k] = a[k];
  if (a.perfil && PERFILES.some(p => p.id === a.perfil.id)) b.perfil = { id:a.perfil.id, cant:a.perfil.cant ?? 100 };
  if (a.curva) for (const c in CURVA_DEF) if (Array.isArray(a.curva[c]) && a.curva[c].length >= (c === 'param' ? 4 : 2)) b.curva[c] = a.curva[c];
  if (a.geo) Object.assign(b.geo, a.geo);
  if (a.desenfoque) Object.assign(b.desenfoque, a.desenfoque);
  if (Array.isArray(a.manchas)) b.manchas = a.manchas;
  b.bbAuto = !!a.bbAuto;
  if (Array.isArray(a.puntos)) b.puntos = a.puntos.map(p => Object.assign({ h:0, s:0, l:0, rango:50 }, p));
  if (a.borde) Object.assign(b.borde, a.borde);
  if (Array.isArray(a.guias)) b.guias = a.guias;
  b.upright = a.upright || '';
  if (Array.isArray(a.mascaras)) b.mascaras = a.mascaras.map(m => { const base = mascaraBase(m.tipo); return Object.assign(base, m, { a:Object.assign(base.a, m.a || {}), extra:(m.extra || []).map(c => Object.assign(mascaraBase(c.tipo), c, { a:undefined })) }); });
  return b;
}

const curvaRecta = c => c.length === 2 && c[0][0] === 0 && c[0][1] === 0 && c[1][0] === 1 && c[1][1] === 1;
const curvaEditada = cv => !['rgb', 'r', 'g', 'b'].every(k => curvaRecta(cv[k])) || cv.param.some(v => v);
const cambiado = (a, claves) => claves.some(k => a[k] !== DEF[k]);
const geoEditada = g => g.rot || g.flipH || g.flipV || g.angulo || g.x || g.y || g.w !== 1 || g.h !== 1;

/* ¿La foto tiene algún cambio? Sirve para la marca de "editada" en la biblioteca */
const ajustesEditados = a => cambiado(a, Object.keys(DEF)) || a.perfil.id !== 'color' || curvaEditada(a.curva) || geoEditada(a.geo) || a.puntos.length > 0 || a.borde.tam > 0 ||
  a.mascaras.length > 0 || a.manchas.length > 0 || a.desenfoque.cant > 0;

/* ---------- perfiles ----------
   Un perfil es la interpretación de partida de la foto, como en Lightroom: se suma por debajo de tus
   ajustes (no mueve los deslizadores) y tiene su propia intensidad. Los de blanco y negro activan el
   tratamiento monocromo. */
const PERFILES = [
  { id:'color', nom:'Color', grupo:'Básicos', a:{} },
  { id:'vivido', nom:'Vívido', grupo:'Básicos', a:{ contraste:14, saturacion:10, intensidad:12 }, curva:[[0, 0], [.25, .21], [.75, .8], [1, 1]] },
  { id:'paisaje', nom:'Paisaje', grupo:'Básicos', a:{ intensidad:22, contraste:8, m_verde_s:10, m_azul_s:12, m_azul_l:-8 } },
  { id:'retrato', nom:'Retrato', grupo:'Básicos', a:{ contraste:-6, m_naranja_s:-8, m_naranja_l:6, m_rojo_s:-6 } },
  { id:'neutral', nom:'Neutro', grupo:'Básicos', a:{ contraste:-16, saturacion:-6 }, curva:[[0, .02], [1, .98]] },
  { id:'monocromo', nom:'Monocromo', grupo:'Blanco y negro', bn:true, a:{ contraste:6 } },
  { id:'bn_alto', nom:'Alto contraste', grupo:'Blanco y negro', bn:true, a:{ contraste:30, claridad:12 }, curva:[[0, 0], [.25, .17], [.75, .84], [1, 1]] },
  { id:'bn_suave', nom:'Suave', grupo:'Blanco y negro', bn:true, a:{ contraste:-12 }, curva:[[0, .06], [1, .96]] },
  { id:'bn_infrarrojo', nom:'Infrarrojo', grupo:'Blanco y negro', bn:true, a:{ m_verde_l:60, m_amarillo_l:40, m_azul_l:-50, contraste:15 } },
  { id:'vintage', nom:'Vintage', grupo:'Artísticos', a:{ saturacion:-14, g_sombras_h:205, g_sombras_s:18, g_luces_h:45, g_luces_s:22 }, curva:[[0, .1], [.5, .52], [1, .93]] },
  { id:'moderno', nom:'Moderno', grupo:'Artísticos', a:{ contraste:12, g_sombras_h:190, g_sombras_s:26, g_luces_h:30, g_luces_s:24, saturacion:-6 } },
  { id:'calido_art', nom:'Dorado', grupo:'Artísticos', a:{ temperatura:18, matiz:6, g_global_h:40, g_global_s:12, intensidad:8 } },
];
const perfilDe = a => PERFILES.find(p => p.id === a.perfil.id) || PERFILES[0];

/* Balance de blancos de una foto JPG: como en Lightroom, solo "Como se tomó", "Automático" y "Personalizado" */
const BB_NOMBRE = a => a.temperatura === 0 && a.matiz === 0 ? 'Como se tomó' : a.bbAuto ? 'Automático' : 'Personalizado';

/* ---------- controles de los paneles ----------
   k: clave en el ajuste; min, max, paso; riel: degradado del riel (temperatura, matiz);
   depende: solo se muestra si ese otro ajuste no está en su valor por defecto; avisos: muestra los
   avisos de recorte mientras se arrastra (como mantener Alt en Lightroom). */
const RIEL_TEMP = 'linear-gradient(90deg,#3D7FD6,#8A8A8A 50%,#E3C15A)';
const RIEL_MATIZ = 'linear-gradient(90deg,#3FB35A,#8A8A8A 50%,#CF55C0)';
const PANELES = {
  luz:[
    { k:'exposicion', nom:'Exposición', min:-5, max:5, paso:.01, avisos:true },
    { k:'contraste', nom:'Contraste' }, { k:'altas', nom:'Altas luces', avisos:true }, { k:'sombras', nom:'Sombras', avisos:true },
    { k:'blancos', nom:'Blancos', avisos:true }, { k:'negros', nom:'Negros', avisos:true },
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
    { k:'vineta_altas', nom:'Altas luces', min:0, max:100, depende:'vineta' },
    { k:'grano', nom:'Grano', min:0, max:100 },
    { k:'grano_tam', nom:'Tamaño', min:0, max:100, depende:'grano' },
    { k:'grano_asp', nom:'Aspereza', min:0, max:100, depende:'grano' },
  ],
  detalle:[
    { k:'nitidez', nom:'Nitidez', min:0, max:150 },
    { k:'nitidez_radio', nom:'Radio', min:.5, max:3, paso:.1, depende:'nitidez' },
    { k:'nitidez_detalle', nom:'Detalle', min:0, max:100, depende:'nitidez' },
    { k:'nitidez_mascara', nom:'Máscara', min:0, max:100, depende:'nitidez' },
    { k:'ruido', nom:'Reducción de ruido', min:0, max:100 },
    { k:'ruido_detalle', nom:'Detalle', min:0, max:100, depende:'ruido' },
    { k:'ruido_color', nom:'Reducción de ruido de color', min:0, max:100 },
  ],
  optica:[
    { k:'aberracion', nom:'Aberración cromática' },
    { k:'desfleco_purpura', nom:'Desfleco púrpura', min:0, max:100 },
    { k:'desfleco_verde', nom:'Desfleco verde', min:0, max:100 },
    { k:'vineteado_lente', nom:'Viñeteado del objetivo' },
    { k:'vineteado_punto', nom:'Punto medio', min:0, max:100, depende:'vineteado_lente' },
  ],
  geometria:[
    { k:'distorsion', nom:'Distorsión' }, { k:'vertical', nom:'Vertical' }, { k:'horizontal', nom:'Horizontal' },
    { k:'rotar', nom:'Rotar', min:-10, max:10, paso:.1 }, { k:'aspecto', nom:'Aspecto' }, { k:'escala', nom:'Escala', min:50, max:150 },
    { k:'desp_x', nom:'Desplazamiento X' }, { k:'desp_y', nom:'Desplazamiento Y' },
  ],
};
/* Claves que mueve cada pestaña: sirven para el punto de "editado" y para restablecer por panel */
const CLAVES_MEZCLA = Object.keys(DEF).filter(k => k.startsWith('m_'));
const CLAVES_GRAD = Object.keys(DEF).filter(k => k.startsWith('g_'));
const CLAVES = {
  luz:PANELES.luz.map(c => c.k),
  color:PANELES.color.map(c => c.k).concat(CLAVES_MEZCLA, CLAVES_GRAD),
  efectos:PANELES.efectos.map(c => c.k),
  detalle:PANELES.detalle.map(c => c.k),
  optica:PANELES.optica.map(c => c.k),
  geometria:PANELES.geometria.map(c => c.k).concat(['restringir']),
};

/* Grupos para "Copiar ajustes", como la lista de Lightroom */
const GRUPOS_COPIA = [
  { k:'perfil', nom:'Perfil' }, { k:'luz', nom:'Luz' }, { k:'curva', nom:'Curva de tonos' }, { k:'color', nom:'Color' },
  { k:'efectos', nom:'Efectos' }, { k:'detalle', nom:'Detalle' }, { k:'optica', nom:'Óptica' }, { k:'geometria', nom:'Geometría' },
  { k:'mascaras', nom:'Máscaras' }, { k:'desenfoque', nom:'Desenfoque de lente' }, { k:'recorte', nom:'Recorte', apagado:true }, { k:'manchas', nom:'Quitar', apagado:true },
];
/* Copia en destino solo los grupos marcados */
function aplicarGrupos(destino, origen, grupos){
  const a = completarAjustes(clonar(destino)), o = completarAjustes(clonar(origen));
  for (const g of grupos) {
    if (CLAVES[g]) CLAVES[g].forEach(k => { a[k] = o[k]; });
    if (g === 'perfil') a.perfil = o.perfil;
    if (g === 'curva') a.curva = o.curva;
    if (g === 'mascaras') a.mascaras = o.mascaras;
    if (g === 'color') { a.puntos = o.puntos; a.bbAuto = o.bbAuto; }
    if (g === 'efectos') a.borde = o.borde;
    if (g === 'geometria') { a.upright = o.upright; a.guias = o.guias; }
    if (g === 'desenfoque') a.desenfoque = o.desenfoque;
    if (g === 'manchas') a.manchas = o.manchas;
    if (g === 'recorte') a.geo = o.geo;
  }
  return a;
}

/* ---------- máscaras ---------- */
const AJ_MASCARA = [
  { k:'temperatura', nom:'Temperatura', riel:RIEL_TEMP }, { k:'matiz', nom:'Matiz', riel:RIEL_MATIZ },
  { k:'exposicion', nom:'Exposición', min:-4, max:4, paso:.01 }, { k:'contraste', nom:'Contraste' },
  { k:'altas', nom:'Altas luces' }, { k:'sombras', nom:'Sombras' }, { k:'blancos', nom:'Blancos' }, { k:'negros', nom:'Negros' },
  { k:'saturacion', nom:'Saturación' }, { k:'textura', nom:'Textura' }, { k:'claridad', nom:'Claridad' }, { k:'neblina', nom:'Neblina' },
  { k:'nitidez', nom:'Nitidez' }, { k:'ruido', nom:'Ruido', min:0, max:100 },
  { k:'color_h', nom:'Color: tono', min:0, max:360, riel:'linear-gradient(90deg,#f44,#fa3,#ee4,#4e4,#4ee,#44f,#e4e,#f44)' }, { k:'color_s', nom:'Color: intensidad', min:0, max:100 },
];
const TIPOS_MASCARA = {
  lineal:{ nom:'Degradado lineal', corto:'Lineal' }, radial:{ nom:'Degradado radial', corto:'Radial' }, pincel:{ nom:'Pincel', corto:'Pincel' },
  color:{ nom:'Rango de color', corto:'Color' }, luminancia:{ nom:'Rango de luminancia', corto:'Luminancia' },
};
function mascaraBase(tipo){
  const a = {}; AJ_MASCARA.forEach(c => { a[c.k] = 0; });
  /* coordenadas en la foto original (0 a 1). Lineal: de p0 (efecto completo) a p1 (sin efecto).
     Radial: centro, radios como fracción del lado mayor, ángulo y desvanecido.
     Pincel: trazos con radio en fracción del lado mayor. Rangos: valores de 0 a 1. */
  /* una máscara es su forma principal más componentes extra que agregan o restan zona (extra), como en Lightroom */
  const m = { id:uid(), tipo, invertir:false, cant:100, nombre:'', oculta:false, extra:[], modo:'agregar', a };
  if (tipo === 'radial') Object.assign(m, { cx:.5, cy:.5, rx:.22, ry:.16, ang:0, desv:50 });
  else if (tipo === 'pincel') Object.assign(m, { trazos:[] });
  else if (tipo === 'color') Object.assign(m, { col:null, tol:30 });
  else if (tipo === 'luminancia') Object.assign(m, { desde:60, hasta:100, suav:20 });
  else Object.assign(m, { tipo:'lineal', x0:.5, y0:.15, x1:.5, y1:.55 });
  return m;
}

/* ---------- presets incluidos ----------
   Al aplicar un preset se restablecen luz, color, efectos, detalle, perfil y curva; recorte, geometría,
   óptica, máscaras y Quitar se conservan. */
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
    { nom:'Clásico', perfil:'monocromo', a:{ contraste:20, claridad:10 } },
    { nom:'Alto contraste', perfil:'bn_alto', a:{ blancos:20, negros:-25, claridad:30, vineta:-25 } },
    { nom:'Suave con grano', perfil:'bn_suave', a:{ grano:40, grano_tam:35 } },
    { nom:'Sepia', perfil:'monocromo', a:{ g_global_h:35, g_global_s:22, contraste:10 } },
  ]},
];

/* Mezcla un preset con la intensidad elegida (0 a 2): 1 es el preset tal cual */
const CLAVES_PRESET = Object.keys(DEF).filter(k => !CLAVES.optica.includes(k) && !CLAVES.geometria.includes(k));
function ajustesDePreset(base, p, cant = 1){
  const a = completarAjustes(clonar(base));
  CLAVES_PRESET.forEach(k => { a[k] = DEF[k]; });
  a.curva = clonar(CURVA_DEF); a.perfil = { id:p.perfil || 'color', cant:100 };
  /* el tono de la gradación no se escala: la intensidad la da su saturación */
  for (const k in (p.a || {})) a[k] = /^g_.+_h$/.test(k) ? p.a[k] : clampAjuste(k, DEF[k] + (p.a[k] - DEF[k]) * cant);
  for (const c in (p.curva || {})) a.curva[c] = c === 'param' ? p.curva[c].map(v => v * cant) : p.curva[c].map(([x, y]) => [x, clamp(x + (y - x) * cant, 0, 1)]);
  return a;
}

/* Límites de cada clave numérica, tomados de los controles */
const LIMITES = {};
Object.values(PANELES).flat().forEach(c => { LIMITES[c.k] = [c.min ?? -100, c.max ?? 100]; });
BANDAS.forEach(b => ['h', 's', 'l'].forEach(x => { LIMITES['m_' + b.k + '_' + x] = [-100, 100]; }));
ZONAS.forEach(z => { LIMITES['g_' + z.k + '_h'] = [0, 360]; LIMITES['g_' + z.k + '_s'] = [0, 100]; LIMITES['g_' + z.k + '_l'] = [-100, 100]; });
LIMITES.g_mezcla = [0, 100]; LIMITES.g_balance = [-100, 100];
const clampAjuste = (k, v) => LIMITES[k] ? clamp(v, LIMITES[k][0], LIMITES[k][1]) : v;

/* Valores efectivos para el motor: tus ajustes más el perfil (escalado por su intensidad) */
function ajustesEfectivos(a){
  const p = perfilDe(a), k = a.perfil.cant / 100, e = Object.assign({}, a);
  for (const c in p.a) e[c] = /^g_.+_h$/.test(c) ? (a[c.replace('_h', '_s')] ? a[c] : p.a[c]) : clampAjuste(c, a[c] + p.a[c] * k);
  e.bn = p.bn ? 1 : 0;
  e.curvaPerfil = p.curva ? p.curva.map(([x, y]) => [x, x + (y - x) * Math.min(k, 2)]) : null;
  return e;
}
