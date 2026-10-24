"""Construye index.html para GitHub Pages: python3 src/build.py (desde la raíz del repo).
Con --vista genera vista-claude.html, una copia para probar dentro de Claude (no se sube al repo).

Une en un solo archivo: head.html, la plantilla (marcado), la hoja de estilos y
los módulos de JavaScript de src/js en el orden de ORDEN. El orden importa: cada
módulo puede usar lo que definen los anteriores al cargar la página.
"""
import os, sys, time, json

here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(here)
read = lambda f: open(os.path.join(here, f), encoding='utf-8').read()

ORDEN = [
    'nucleo.js',             # utilidades, avisos y hojas
    'ajustes-def.js',        # ajustes, valores por defecto y presets incluidos
    'curva.js',              # curva de tonos: interpolación y editor
    'motor.js',              # motor de revelado en WebGL2
    'biblioteca.js',         # fotos en el dispositivo (IndexedDB) y vista de biblioteca
    'deslizador.js',         # deslizador táctil al estilo Lightroom
    'paneles.js',            # paneles de Luz, Color, Efectos y Detalle
    'recorte.js',            # recortar, enderezar, girar y voltear
    'mascaras.js',           # máscaras lineales y radiales
    'presets.js',            # presets incluidos y propios
    'editor.js',             # editor: vista, historial y gestos
    'exportar.js',           # exportar y compartir
    'eventos.js',            # navegación y arranque: siempre al final
]

build = time.strftime('%Y%m%d%H%M%S')  # versión publicada: la app se recarga sola si version.json cambia
script = '\n'.join(["const BUILD = '" + build + "';"] + [read('js/' + m) for m in ORDEN])
sobran = set(os.listdir(os.path.join(here, 'js'))) - set(ORDEN)
assert not sobran, 'Módulos sin incluir en ORDEN: %s' % sobran

t = read('app.template.html').replace('__STYLES__', read('styles.css')).replace('__SCRIPT__', script)
if '--vista' in sys.argv:
    # python3 src/build.py --vista: vista previa para abrir dentro de Claude (sin head propio, manifiesto ni íconos)
    open(os.path.join(root, 'vista-claude.html'), 'w', encoding='utf-8').write('<title>Revelado</title>\n' + t)
    sys.exit(print('vista-claude.html listo'))
open(os.path.join(root, 'index.html'), 'w', encoding='utf-8').write(read('head.html') + t + '\n</body>\n</html>\n')
open(os.path.join(root, 'version.json'), 'w').write(json.dumps({'v': build}))
print('index.html listo · versión', build)
