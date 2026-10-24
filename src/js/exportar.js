/* Exportar: revela a tamaño real con el mismo motor de la vista previa. Opciones como en Lightroom:
   formato (JPG o PNG), tamaño (máximo, 2048 o 1080 px por el lado mayor), calidad, marca de agua y
   nombre del archivo. Funciona con una foto (desde el editor) o con varias (desde Seleccionar).
   En el iPhone entrega por la hoja de compartir ("Guardar imagen" las manda a Fotos); en computador, o si
   compartir no está disponible, las descarga. Las fotos se preparan antes de mostrar el botón de compartir
   para que Safari lo acepte como un toque directo. */

const EXP = { formato:'jpg', tam:'max', calidad:92, nombre:'original', marca:{ activa:false, texto:'', tam:4, opac:70, pos:'abajo-der' }, listos:[], url:'' };
try { Object.assign(EXP, JSON.parse(localStorage.getItem('revelado.exportar') || '{}'), { listos:[], url:'' }); } catch (_) {}
const guardarOpcionesExp = () => { try { const { listos, url, ...o } = EXP; localStorage.setItem('revelado.exportar', JSON.stringify(o)); } catch (_) {} };
const LADO_MAX = () => Math.min(Motor.maxLado, esComputador() ? 6000 : 4096);
const POSICIONES = [['arriba-izq', 'Arriba izquierda'], ['arriba-der', 'Arriba derecha'], ['centro', 'Centro'], ['abajo-izq', 'Abajo izquierda'], ['abajo-der', 'Abajo derecha']];

let fotosExp = [];
function hojaExportar(fotos = null){
  fotosExp = fotos || [ED.foto];
  const una = fotosExp.length === 1, seg = (clave, opciones) => '<div class="segmento" role="tablist" style="margin:6px 0 12px">' + opciones.map(([v, n]) =>
    '<button data-exp="' + clave + ':' + v + '" aria-selected="' + (String(EXP[clave]) === v) + '">' + n + '</button>').join('') + '</div>';
  abrirHoja(cabHoja(una ? 'Exportar' : 'Exportar ' + fotosExp.length + ' fotos') +
    '<div class="sub">Formato</div>' + seg('formato', [['jpg', 'JPG'], ['png', 'PNG']]) +
    '<div class="sub">Tamaño (lado mayor)</div>' + seg('tam', [['max', 'Máximo'], ['2048', '2048 px'], ['1080', '1080 px']]) +
    '<div id="exp-calidad"></div>' +
    '<div class="sub">Nombre del archivo</div>' + seg('nombre', [['original', 'Original'], ['fecha', 'Fecha y número']]) +
    '<div class="grupo"><label class="marca"><span>Marca de agua</span><input type="checkbox" id="exp-marca"' + (EXP.marca.activa ? ' checked' : '') + '></label></div>' +
    '<div id="exp-marca-op"' + (EXP.marca.activa ? '' : ' hidden') + '><div class="grupo"><input type="text" id="exp-marca-texto" maxlength="60" placeholder="© Tu nombre" value="' + esc(EXP.marca.texto) + '" autocomplete="off"></div>' +
      '<div class="chips" id="exp-pos">' + POSICIONES.map(([k, n]) => '<button data-pos="' + k + '" class="' + (EXP.marca.pos === k ? 'activo' : '') + '">' + n + '</button>').join('') + '</div><div id="exp-marca-ctl"></div></div>' +
    '<div id="exp-vista"></div>' +
    '<button class="btn primario bloque" id="b-compartir" disabled>Preparando…</button>',
    () => { if (EXP.url) URL.revokeObjectURL(EXP.url); EXP.url = ''; EXP.listos = []; turnoExp++; });
  const cal = $('#exp-calidad');
  if (EXP.formato === 'jpg') cal.appendChild(deslizador({ k:'calidad', nom:'Calidad', min:40, max:100, base:92 }, () => EXP.calidad, (k, v, f) => { EXP.calidad = v; if (f) cambioExp(); }));
  const mc = $('#exp-marca-ctl');
  mc.appendChild(deslizador({ k:'tam', nom:'Tamaño', min:1, max:15, base:4 }, () => EXP.marca.tam, (k, v, f) => { EXP.marca.tam = v; if (f) cambioExp(); }));
  mc.appendChild(deslizador({ k:'opac', nom:'Opacidad', min:10, max:100, base:70 }, () => EXP.marca.opac, (k, v, f) => { EXP.marca.opac = v; if (f) cambioExp(); }));
  $('#hoja').onclick = e => {
    const b = e.target.closest('[data-exp]'), p = e.target.closest('[data-pos]');
    if (b) { const [k, v] = b.dataset.exp.split(':'); if (String(EXP[k]) === v) return; EXP[k] = v; guardarOpcionesExp(); return hojaExportar(fotosExp); }
    if (p) { EXP.marca.pos = p.dataset.pos; $$('#exp-pos button').forEach(x => x.classList.toggle('activo', x === p)); cambioExp(); }
  };
  $('#exp-marca').onchange = e => { EXP.marca.activa = e.target.checked; $('#exp-marca-op').hidden = !EXP.marca.activa; cambioExp(); };
  $('#exp-marca-texto').onchange = e => { EXP.marca.texto = e.target.value; cambioExp(); };
  $('#b-compartir').onclick = entregar;
  if (una) prepararExportacion(); else { $('#b-compartir').disabled = false; $('#b-compartir').textContent = 'Preparar ' + fotosExp.length + ' fotos'; }
}
function cambioExp(){ guardarOpcionesExp(); EXP.listos = []; if (fotosExp.length === 1) prepararExportacion(); else { $('#b-compartir').textContent = 'Preparar ' + fotosExp.length + ' fotos'; $('#b-compartir').disabled = false; } }

/* Revela una foto a tamaño de exportación y la devuelve como archivo */
async function revelarParaExportar(foto, img, ajustes, n){
  const f = Motor.fuente(img, LADO_MAX());
  try {
    const g = ajustes.geo, [Wo, Ho] = marcoOrientado(g, f.w, f.h), lado = EXP.tam === 'max' ? Infinity : +EXP.tam;
    const k = Math.min(1, lado / Math.max(g.w * Wo, g.h * Ho));
    const [W, H] = conBorde(ajustes, Math.max(1, Math.round(g.w * Wo * k)), Math.max(1, Math.round(g.h * Ho * k)));
    const c = imagenACanvas(Motor.revelar(f, ajustes, { ancho:W, alto:H, destino:'pixeles' }));
    if (EXP.marca.activa && EXP.marca.texto.trim()) dibujarMarca(c);
    const tipo = EXP.formato === 'png' ? 'image/png' : 'image/jpeg';
    const blob = await aBlob(c, tipo, EXP.calidad / 100);
    const base = EXP.nombre === 'fecha' ? 'Revelado ' + new Date().toISOString().slice(0, 10) + ' ' + String(n + 1).padStart(3, '0') : (foto.nombre || 'Revelado').replace(/[\\/:*?"<>|]/g, '') + ' revelada';
    return { archivo:new File([blob], base + '.' + EXP.formato, { type:tipo }), W, H, blob };
  } finally { f.liberar(); }
}
/* Marca de agua de texto con una sombra suave para que se lea sobre cualquier fondo */
function dibujarMarca(c){
  const x = c.getContext('2d'), m = EXP.marca, t = Math.max(10, Math.round(Math.max(c.width, c.height) * m.tam / 100 * .6)), pad = t * .9;
  x.font = '600 ' + t + 'px -apple-system,"Helvetica Neue",Arial,sans-serif'; x.globalAlpha = m.opac / 100;
  x.fillStyle = '#fff'; x.shadowColor = 'rgba(0,0,0,.45)'; x.shadowBlur = t * .25;
  const izq = m.pos.endsWith('izq'), der = m.pos.endsWith('der');
  x.textAlign = izq ? 'left' : der ? 'right' : 'center'; x.textBaseline = m.pos.startsWith('arriba') ? 'top' : m.pos === 'centro' ? 'middle' : 'bottom';
  x.fillText(m.texto.trim(), izq ? pad : der ? c.width - pad : c.width / 2, m.pos.startsWith('arriba') ? pad : m.pos === 'centro' ? c.height / 2 : c.height - pad);
  x.globalAlpha = 1; x.shadowBlur = 0;
}

let turnoExp = 0;
async function prepararExportacion(){
  const turno = ++turnoExp, boton = $('#b-compartir'); if (!boton) return;
  boton.disabled = true; boton.textContent = 'Preparando…';
  $('#exp-vista').innerHTML = fotosExp.length === 1 ? '<p class="ayuda">Preparando la foto…</p>' : '';
  await esperar(60); /* deja pintar la hoja antes del trabajo pesado */
  if (turno !== turnoExp) return;
  try {
    const listos = [];
    for (let i = 0; i < fotosExp.length; i++) {
      const f = fotosExp[i];
      if (fotosExp.length > 1) boton.textContent = 'Preparando ' + (i + 1) + ' de ' + fotosExp.length + '…';
      const enEditor = ED.foto && ED.foto.id === f.id, img = enEditor ? ED.img : await decodificar(await DB.original(f.id));
      listos.push(await revelarParaExportar(f, img, enEditor ? ED.a : completarAjustes(f.ajustes), i));
      if (!enEditor && img.close) img.close();
      if (turno !== turnoExp) return;
    }
    EXP.listos = listos;
    if (listos.length === 1) {
      const r = listos[0]; if (EXP.url) URL.revokeObjectURL(EXP.url); EXP.url = URL.createObjectURL(r.blob);
      $('#exp-vista').innerHTML = '<img class="vista-exp" src="' + EXP.url + '" alt="Vista de la foto exportada"><p class="ayuda num">' + r.W + ' × ' + r.H + ' px · ' + (r.blob.size / 1048576).toFixed(1) + ' MB</p>';
    }
    boton.disabled = false;
    boton.textContent = esComputador() ? (listos.length > 1 ? 'Descargar ' + listos.length + ' fotos' : 'Descargar') : (listos.length > 1 ? 'Compartir ' + listos.length + ' fotos' : 'Compartir o guardar en Fotos');
  } catch (e) {
    console.error(e); $('#exp-vista').innerHTML = '<p class="ayuda">No se pudo preparar. Prueba con un tamaño menor.</p>'; boton.textContent = 'Reintentar'; boton.disabled = false;
  }
}

async function entregar(){
  if (!EXP.listos.length) return prepararExportacion();
  const archivos = EXP.listos.map(r => r.archivo);
  if (!esComputador() && navigator.canShare && navigator.canShare({ files:archivos })) {
    try { await navigator.share({ files:archivos }); cerrarHoja(); if (BIB.seleccionando) salirSeleccion(); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  let ok = true; for (const a of archivos) ok = (await guardarArchivo(a)) && ok;
  if (ok) { cerrarHoja(); if (BIB.seleccionando) salirSeleccion(); toast(archivos.length > 1 ? archivos.length + ' fotos exportadas' : 'Foto exportada'); return; }
  const ay = $('#exp-vista .ayuda'); if (ay) ay.textContent = 'Mantén presionada la imagen y elige «Guardar en Fotos».';
}

/* Descarga el archivo. Dentro de Claude usa el permiso de descargas de la página; si no, un enlace */
async function guardarArchivo(archivo){
  try {
    const dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null;
    if (dl) { await dl.save({ filename:archivo.name, data:archivo }); return true; }
  } catch (e) { if (e && e.code === 'declined') return false; }
  try {
    const url = URL.createObjectURL(archivo), en = document.createElement('a');
    en.href = url; en.download = archivo.name; document.body.appendChild(en); en.click(); en.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000); return true;
  } catch (_) { return false; }
}
