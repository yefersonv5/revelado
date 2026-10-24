/* Eventos generales y arranque: botones de la biblioteca y del editor, pestañas, cambios de tamaño,
   guardado al salir de la app, instalación sin conexión y recarga automática con cada versión nueva. */

/* ---------- biblioteca ---------- */
$('#f-importar').addEventListener('change', e => { const a = e.target.files; if (a && a.length) importarArchivos(a); e.target.value = ''; });
$('#b-ejemplo').addEventListener('click', fotoEjemplo);
$('#filtros').addEventListener('click', e => {
  if (e.target.closest('[data-album-nuevo]')) return hojaNuevoAlbum();
  const b = e.target.closest('[data-filtro]'); if (b) { BIB.filtro = b.dataset.filtro; pintarBiblioteca(); }
});
$('#b-bib-mas').addEventListener('click', hojaOpcionesBib);
$('#buscar').addEventListener('input', e => { BIB.busqueda = e.target.value; pintarBiblioteca(); });
$('#presentacion').addEventListener('click', cerrarPresentacion);
$('#b-seleccionar').addEventListener('click', () => { if (BIB.seleccionando) salirSeleccion(); else { BIB.seleccionando = true; pintarBiblioteca(); } });
$('#rejilla').addEventListener('click', e => {
  const b = e.target.closest('[data-foto]'); if (!b) return;
  const id = b.dataset.foto;
  if (BIB.seleccionando) { BIB.sel.has(id) ? BIB.sel.delete(id) : BIB.sel.add(id); pintarBiblioteca(); }
  else abrirEditor(id);
});
$('#barra-sel').addEventListener('click', e => { const b = e.target.closest('[data-sel]'); if (b && !b.disabled) accionSeleccion(b.dataset.sel); });
/* arrastrar fotos sobre la ventana en computador */
document.addEventListener('dragover', e => { if (!$('#v-biblioteca').hidden) e.preventDefault(); });
document.addEventListener('drop', e => { if ($('#v-biblioteca').hidden) return; e.preventDefault(); if (e.dataTransfer.files.length) importarArchivos(e.dataTransfer.files); });

/* ---------- editor ---------- */
$('#b-volver').addEventListener('click', volverBiblioteca);
$('#b-deshacer').addEventListener('click', deshacer);
$('#b-rehacer').addEventListener('click', rehacer);
$('#b-mas').addEventListener('click', menuMas);
$('#b-info').addEventListener('click', hojaInfo);
$('#b-exportar').addEventListener('click', () => hojaExportar());
$('#herramientas').addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (b) elegirPanel(b.dataset.p); });
document.addEventListener('keydown', e => {
  if ($('#v-editor').hidden || !$('#hoja').hidden || e.target.closest('input')) return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? rehacer() : deshacer(); }
  else if (e.key === '\\' && !ED.antes) { ED.antes = true; pedirPintura(); }   /* como en Lightroom: \ muestra el original */
  else if (e.key.toLowerCase() === 'y' && !mod) { ED.division = ED.division == null ? .5 : null; pedirPintura(); } /* Y: antes y después */
  else if (e.key.toLowerCase() === 'j' && !mod) { ED.avisos = !ED.avisos; pedirPintura(); }                     /* J: avisos de recorte */
  else if (e.key.toLowerCase() === 'i' && !mod) alternarInfo();
  else if (e.key === 'ArrowRight' && !e.target.closest('.ctl')) navegar(1);
  else if (e.key === 'ArrowLeft' && !e.target.closest('.ctl')) navegar(-1);
});
document.addEventListener('keyup', e => { if (e.key === '\\' && ED.antes) { ED.antes = false; pedirPintura(); } });
/* la foto se reacomoda cada vez que cambia el espacio que le queda (giro del teléfono, panel más alto o más bajo) */
new ResizeObserver(() => { if (!$('#v-editor').hidden) acomodar(); }).observe($('#escena'));
/* guarda la edición al salir de la app o cambiar de pestaña */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && ED.foto && ED.sucio) { clearTimeout(guardadoT); ED.foto.ajustes = clonar(ED.a); ED.foto.editada = ajustesEditados(ED.a); DB.guardar(ED.foto); }
});

/* ---------- arranque ---------- */
(async () => {
  if (!Motor.iniciar($('#lienzo'))) {
    $('#vacio').hidden = false;
    $('#vacio').innerHTML = '<b>Este navegador no puede revelar fotos</b><p>Revelado necesita WebGL2. Actualiza iOS o abre la app en Safari o Chrome recientes.</p>';
    return;
  }
  if (PORTAPAPELES && !PORTAPAPELES.grupos) PORTAPAPELES = null; /* copias de una versión anterior */
  construirPaneles(); construirRecorte(); construirMascaras(); construirQuitar(); construirPresets(); construirRapidas();
  try {
    await DB.abrir();
    BIB.fotos = await DB.todas(); BIB.albumes = (await DB.albumes()).sort((a, b) => a.fecha - b.fecha);
    PRESETS_PROPIOS = (await DB.presets()).sort((a, b) => a.fecha - b.fecha);
  } catch (e) { console.error(e); toast('No se pudo abrir la biblioteca de este dispositivo', 4000); }
  pintarBiblioteca();
})();

if ('serviceWorker' in navigator && location.protocol === 'https:' && !location.hostname.endsWith('claude.ai') && !/claudeusercontent|claude\.site/.test(location.hostname))
  navigator.serviceWorker.register('sw.js', { updateViaCache:'none' }).then(r => r.update()).catch(() => {});
/* Si hay una versión publicada más nueva, recarga (una vez por sesión, para no entrar en bucle) */
async function revisarVersion(){
  try {
    const v = (await (await fetch('version.json?t=' + Date.now(), { cache:'no-store' })).json()).v;
    if (v && v !== BUILD && !ED.foto) { let ya = false; try { ya = sessionStorage.getItem('revelado.recargada') === v; sessionStorage.setItem('revelado.recargada', v); } catch (_) {} if (!ya) location.reload(); }
  } catch (_) {}
}
if (location.protocol === 'https:') { revisarVersion(); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') revisarVersion(); }); }
