/* Presets: los incluidos por grupo y los propios (guardados en el dispositivo), con miniatura de la foto
   abierta y un deslizador de intensidad para el preset elegido (0 a 200 %). Al tocar otro ajuste,
   el preset queda aplicado y se suelta la intensidad. También el dibujo de miniaturas que comparten
   presets y perfiles. */

let PRESETS_PROPIOS = [];
const presetPorClave = clave => {
  const [t, i, j] = clave.split(':');
  return t === 'u' ? PRESETS_PROPIOS.find(p => p.id === i) : PRESETS_INCLUIDOS[+i].lista[+j];
};

/* Dibuja miniaturas cuadradas con la foto abierta; ajustesDe(canvas) dice con qué ajustes. Van de a una
   para no trabar la interfaz, y se cancelan si se piden otras. */
let turnoMinis = 0;
async function pintarMinis(lienzos, ajustesDe){
  const turno = ++turnoMinis, f = ED.fuenteMini; if (!f) return;
  const g = ED.a.geo, [Wo, Ho] = marcoOrientado(g, f.w, f.h), k = 160 / Math.max(g.w * Wo, g.h * Ho);
  const [W, H] = conBorde(ED.a, Math.max(1, Math.round(g.w * Wo * k)), Math.max(1, Math.round(g.h * Ho * k)));
  for (const c of lienzos) {
    if (turno !== turnoMinis || !ED.foto) return;
    const a = ajustesDe(c); if (!a) continue;
    const img = imagenACanvas(Motor.revelar(f, a, { ancho:W, alto:H, destino:'pixeles' }));
    const s = Math.min(W, H); c.getContext('2d').drawImage(img, (W - s) / 2, (H - s) / 2, s, s, 0, 0, c.width, c.height);
    await new Promise(r => requestAnimationFrame(r));
  }
}

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
    pintarMinis($$('#p-presets canvas[data-mini]'), c => {
      let pr = presetPorClave(c.dataset.mini); if (!pr) return null;
      if (pr.auto) pr = { a:valoresAuto(ED.fuenteMini, ED.a) };
      return ajustesDePreset(ED.a, pr, 1);
    });
  }
  const cab = $('#pre-cab', p); if (!cab) return; /* la lista aún no se ha pintado */
  cab.innerHTML = pcab('Presets', sel ? '<button class="txt" data-pre-quitar>Quitar</button>' : '') +
    (sel ? '<div class="ctls"></div>' + (sel.clave.startsWith('u:') ? '<div class="chips"><button data-pre-borrar>Eliminar este preset</button></div>' : '') : '');
  if (sel) $('.ctls', cab).appendChild(deslizador({ k:'cant', nom:'Intensidad', min:0, max:200, base:100 }, () => ED.preset.cant,
    (k, v, final) => { ED.preset.cant = v; ED.a = ajustesDePreset(ED.preset.base, ED.preset.p, v / 100); cambiar(final, true); }));
  $$('.preset[data-pre]', p).forEach(b => b.classList.toggle('activo', !!sel && b.dataset.pre === sel.clave));
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
      ED.a = ajustesDePreset(base, p, 1); cambiar(true, true); refrescarTodo(false);
    }
    else if (b.dataset.preQuitar !== undefined) { ED.a = clonar(ED.preset.base); ED.preset = null; cambiar(true); refrescarTodo(false); }
    else if (b.dataset.preCrear !== undefined) crearPreset();
    else if (b.dataset.preBorrar !== undefined) {
      const id = ED.preset.clave.slice(2), pr = PRESETS_PROPIOS.find(x => x.id === id);
      if (!pr || !(await confirmar('Eliminar preset', 'Se borra «' + pr.nom + '». Las fotos que ya lo usan no cambian.', 'peligro'))) return;
      await DB.eliminarPreset(id); PRESETS_PROPIOS = PRESETS_PROPIOS.filter(x => x.id !== id); ED.preset = null; sincronizarPaneles(); pintarPresets(); toast('Preset eliminado');
    }
  });
}

/* Guarda los ajustes actuales como preset propio, eligiendo qué grupos incluye (como en Lightroom) */
function crearPreset(){
  const grupos = GRUPOS_COPIA.filter(g => !['recorte', 'manchas', 'mascaras', 'geometria', 'optica'].includes(g.k));
  abrirHoja(cabHoja('Crear preset') +
    '<form id="f-preset"><div class="grupo"><input type="text" id="preset-nombre" maxlength="40" placeholder="Nombre del preset" autofocus autocomplete="off"></div>' +
    '<div class="sub">Incluir</div><div class="grupo">' + grupos.map(g => '<label class="marca"><span>' + g.nom + '</span><input type="checkbox" value="' + g.k + '" checked></label>').join('') + '</div>' +
    '<button class="btn primario bloque" type="submit">Guardar preset</button></form>');
  $('#f-preset').onsubmit = async e => {
    e.preventDefault();
    const nom = $('#preset-nombre').value.trim() || 'Mi preset ' + (PRESETS_PROPIOS.length + 1);
    const incl = $$('#f-preset input[type=checkbox]:checked').map(c => c.value), a = {};
    const claves = incl.flatMap(g => CLAVES[g] || []);
    for (const k of claves) if (ED.a[k] !== DEF[k]) a[k] = ED.a[k];
    const pr = { id:uid(), nom, a, fecha:Date.now() };
    if (incl.includes('curva')) pr.curva = clonar(ED.a.curva);
    if (incl.includes('perfil') && ED.a.perfil.id !== 'color') pr.perfil = ED.a.perfil.id;
    await DB.guardarPreset(pr); PRESETS_PROPIOS.push(pr); cerrarHoja(); pintarPresets(); toast('Preset guardado');
  };
}
