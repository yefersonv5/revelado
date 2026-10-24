/* Exportar: revela la foto a tamaño real con el mismo motor de la vista previa y la entrega por la hoja de
   compartir de iOS ("Guardar imagen" la manda a Fotos). En computador, o si compartir no está disponible,
   la descarga. La foto se prepara al abrir la hoja para que el botón de compartir responda al instante,
   como pide Safari. */

const EXP = { tam:'max', calidad:'alta', archivo:null, url:'' };
const LADO_MAX = () => Math.min(Motor.maxLado, esComputador() ? 6000 : 4096);

function hojaExportar(){
  const seg = (clave, opciones) => '<div class="segmento" role="tablist" style="margin:6px 0 12px">' + opciones.map(([v, n]) =>
    '<button data-exp="' + clave + ':' + v + '" aria-selected="' + (EXP[clave] === v) + '">' + n + '</button>').join('') + '</div>';
  abrirHoja(cabHoja('Exportar') +
    '<div class="sub">Tamaño</div>' + seg('tam', [['max', 'Máximo'], ['2048', '2048 px (redes)']]) +
    '<div class="sub">Calidad</div>' + seg('calidad', [['alta', 'Alta'], ['media', 'Estándar']]) +
    '<div id="exp-vista"><p class="ayuda">Preparando la foto…</p></div>' +
    '<button class="btn primario bloque" id="b-compartir" disabled>' + (esComputador() ? 'Descargar' : 'Compartir o guardar en Fotos') + '</button>',
    () => { if (EXP.url) URL.revokeObjectURL(EXP.url); EXP.url = ''; EXP.archivo = null; });
  $('#hoja').onclick = e => {
    const b = e.target.closest('[data-exp]'); if (!b) return;
    const [k, v] = b.dataset.exp.split(':'); if (EXP[k] === v) return;
    EXP[k] = v; $$('[data-exp^="' + k + ':"]').forEach(x => x.setAttribute('aria-selected', x === b)); prepararExportacion();
  };
  $('#b-compartir').onclick = entregar;
  prepararExportacion();
}

let turnoExp = 0;
async function prepararExportacion(){
  const turno = ++turnoExp, boton = $('#b-compartir'); boton.disabled = true;
  $('#exp-vista').innerHTML = '<p class="ayuda">Preparando la foto…</p>';
  await esperar(60); /* deja pintar la hoja antes del trabajo pesado */
  if (turno !== turnoExp || !ED.img) return;
  let f;
  try {
    f = Motor.fuente(ED.img, LADO_MAX());
    const g = ED.a.geo, [Wo, Ho] = marcoOrientado(g, f.w, f.h);
    const k = EXP.tam === '2048' ? Math.min(1, 2048 / Math.max(g.w * Wo, g.h * Ho)) : 1;
    const W = Math.max(1, Math.round(g.w * Wo * k)), H = Math.max(1, Math.round(g.h * Ho * k));
    const px = Motor.revelar(f, ED.a, { ancho:W, alto:H, destino:'pixeles' });
    const blob = await aBlob(imagenACanvas(px), 'image/jpeg', EXP.calidad === 'alta' ? .93 : .82);
    if (turno !== turnoExp) return;
    EXP.archivo = new File([blob], (ED.foto.nombre || 'Revelado').replace(/[\\/:*?"<>|]/g, '') + ' revelada.jpg', { type:'image/jpeg' });
    if (EXP.url) URL.revokeObjectURL(EXP.url); EXP.url = URL.createObjectURL(blob);
    $('#exp-vista').innerHTML = '<img class="vista-exp" src="' + EXP.url + '" alt="Vista de la foto exportada"><p class="ayuda num">' + W + ' × ' + H + ' px · ' + (blob.size / 1048576).toFixed(1) + ' MB</p>';
    boton.disabled = false;
  } catch (e) {
    console.error(e); $('#exp-vista').innerHTML = '<p class="ayuda">No se pudo preparar la foto. Prueba con el tamaño de 2048 px.</p>';
  } finally { if (f) f.liberar(); }
}

async function entregar(){
  const a = EXP.archivo; if (!a) return;
  if (!esComputador() && navigator.canShare && navigator.canShare({ files:[a] })) {
    try { await navigator.share({ files:[a] }); cerrarHoja(); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  if (await guardarArchivo(a)) { cerrarHoja(); toast('Foto exportada'); return; }
  $('.ayuda', $('#exp-vista')).textContent = 'Mantén presionada la imagen y elige «Guardar en Fotos».';
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
