# Revelado

Editor de fotos personal al estilo de Lightroom para iPhone: revelado no destructivo, presets, curva de tonos, mezcla de color, gradación, máscaras, recorte y exportación.

- `index.html`: la app (PWA). Se publica con GitHub Pages y se instala desde Safari con «Agregar a pantalla de inicio».
- `src/`: código fuente por módulos. `python3 src/build.py` genera `index.html`.
- Las fotos y sus ediciones se guardan solo en el dispositivo (IndexedDB). No salen del teléfono.
