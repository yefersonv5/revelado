/* Presets: los incluidos por grupo y los propios (guardados en el dispositivo), con miniatura de la foto
   abierta y un deslizador de intensidad para el preset elegido (0 a 200 %). Al tocar otro ajuste,
   el preset queda aplicado y se suelta la intensidad. */

let PRESETS_PROPIOS = [];
const presetPorClave = clave => {
  const [t, i, j] = clave.split(':');
  return t === 'u' ? PRESETS_PROPIOS.find(p => p.id === i) : PRESETS_INCLUIDOS[+i].lista[+j];
};

/* La cabecera (intensidad del preset elegido) se repinta sola; la lista con miniaturas, solo al abrir una foto
   o al crear o borrar un preset propio. */
function pintarPresets(soloCabecera = false){
  const p = $('#p-presets'), sel = ED.preset;
  if (!soloCabecera) {
    const tarjeta = (clave, nom) => '<button class="preset" data-pre="' + clave + '"><canvas width="148" height="148" data-mini="' + clave + '"></canvas><span>' + esc(nom) + '</span></button>';
    let h = '<div id="pre-cab"></div><div class="sub">Mis presets</div><div class="tira">' + PRESETS_PROPIOS.map(x => tarjeta('u:' + x.id, x.nom)).join('') +
      '<button class="preset" data-pre-crear><span class="nuevo">' + ICO_M.mas + '</span><span>Crear</span></button></div>';
    PRESETS_INCLUIDOS.forEach((g, i) => { h += '<div class="sub">' + esc(g.grupo) + '</div><div class="tira">' + g.lista.map((x, j) => tarjeta('i:' + i + ':' + j, x.nom)).join('') + '</div>'; });
    p.innerHTML = h;
    pintarMinisPresets();
  }
  const cab = $('#pre-cab', p);
  cab.innerHTML = pcab('Presets', sel ? '<button class="txt" data-pre-quitar>Quitar</button>' : '') +
    (sel ? '<div class="ctls"></div>' + (sel.clave.startsWith('u:') ? '<div class="chips"><button data-pre-borrar>Eliminar este preset</button></div>' : '') : '');
  if (sel) $('.ctls', cab).appendChild(deslizador({ k:'cant', nom:'Intensidad', min:0, max:200, base:100 }, () => ED.preset.cant,
    (k, v, final) => { ED.preset.cant = v; ED.a = ajustesDePreset(ED.preset.base, ED.preset.p, v / 100); cambiar(final, true); }));
  $$('.preset[data-pre]', p).forEach(b => b.classList.toggle('activo', !!sel && b.dataset.pre === sel.clave));
}

/* Miniaturas con la foto abierta; se dibujan de a una para no trabar la interfaz */
let turnoMinis = 0;
async function pintarMinisPresets(){
  const turno = ++turnoMinis, f = ED.fuenteMini; if (!f) return;
  const g = ED.a.geo, [Wo, Ho] = marcoOrientado(g, f.w, f.h), k = 160 / Math.max(g.w * Wo, g.h * Ho);
  const W = Math.max(1, Math.round(g.w * Wo * k)), H = Math.max(1, Math.round(g.h * Ho * k));
  for (const c of $$('#p-presets canvas[data-mini]')) {
    if (turno !== turnoMinis || ED.foto == null) return;
    let p = presetPorClave(c.dataset.mini); if (!p) continue;
    if (p.auto) p = { a:valoresAuto(f, ED.a) };
    const img = imagenACanvas(Motor.revelar(f, ajustesDePreset(ED.a, p, 1), { ancho:W, alto:H, destino:'pixeles' }));
    const x = c.getContext('2d'), s = Math.min(W, H);
    x.drawImage(img, (W - s) / 2, (H - s) / 2, s, s, 0, 0, c.width, c.height);
    await new Promise(r => requestAnimationFrame(r));
  }
}

function construirPresets(){
  $('#p-presets').addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.pre) {
      if (ED.preset && ED.preset.clave === b.dataset.pre) return;
      let p = presetPorClave(b.dataset.pre); if (!p) return;
      const base = ED.preset ? ED.preset.base : clonar(ED.a);
      if (p.auto) p = { nom:'Auto', a:valoresAuto(ED.fuente, base) };
      ED.preset = { clave:b.dataset.pre, p, cant:100, base };
      ED.a = ajustesDePreset(base, p, 1); cambiar(true, true); sincronizarPaneles(); pintarPresets(true);
    }
    else if (b.dataset.preQuitar !== undefined) { ED.a = clonar(ED.preset.base); ED.preset = null; cambiar(true); sincronizarPaneles(); pintarPresets(true); }
    else if (b.dataset.preCrear !== undefined) crearPreset();
    else if (b.dataset.preBorrar !== undefined) {
      const id = ED.preset.clave.slice(2), pr = PRESETS_PROPIOS.find(x => x.id === id);
      if (!pr || !(await confirmar('Eliminar preset', 'Se borra «' + pr.nom + '». Las fotos que ya lo usan no cambian.', 'peligro'))) return;
      await DB.eliminarPreset(id); PRESETS_PROPIOS = PRESETS_PROPIOS.filter(x => x.id !== id); ED.preset = null; sincronizarPaneles(); pintarPresets(); toast('Preset eliminado');
    }
  });
}

/* Guarda los ajustes actuales (sin recorte ni máscaras) como preset propio */
function crearPreset(){
  abrirHoja(cabHoja('Crear preset') + '<p class="ayuda" style="text-align:left">Guarda la luz, el color, los efectos, el detalle y la curva de esta foto. El recorte y las máscaras no se incluyen.</p>' +
    '<form id="f-preset"><div class="grupo"><input type="text" id="preset-nombre" maxlength="40" placeholder="Nombre del preset" autofocus autocomplete="off"></div>' +
    '<button class="btn primario bloque" type="submit">Guardar preset</button></form>');
  $('#f-preset').onsubmit = async e => {
    e.preventDefault();
    const nom = $('#preset-nombre').value.trim() || 'Mi preset ' + (PRESETS_PROPIOS.length + 1), a = {};
    for (const k in DEF) if (ED.a[k] !== DEF[k]) a[k] = ED.a[k];
    const pr = { id:uid(), nom, a, curva:clonar(ED.a.curva), fecha:Date.now() };
    await DB.guardarPreset(pr); PRESETS_PROPIOS.push(pr); cerrarHoja(); pintarPresets(); toast('Preset guardado');
  };
}
