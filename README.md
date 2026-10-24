# Revelado

Editor de fotos personal al estilo de Lightroom para iPhone, instalable desde Safari.

- **Biblioteca**: álbumes, estrellas, marcas (elegida o rechazada), filtros, orden por fecha de captura o importación, datos de la cámara, acciones en lote.
- **Editor**: presets (incluidos y propios, con intensidad), Auto, perfiles (color, blanco y negro y artísticos), recortar y enderezar, máscaras (lineal, radial, pincel, rango de color y de luminancia), Quitar (recuperar y clonar), Luz con curva paramétrica y de puntos, Color (balance de blancos con selector, mezcla de color o de grises, gradación), Efectos, Detalle, Óptica, Geometría, Desenfoque de lente y Versiones.
- **Revisión**: antes y después dividido, avisos de recorte, histograma, deshacer y rehacer, copiar y pegar ajustes por grupos.
- **Exportar**: JPG o PNG, tamaño, calidad, marca de agua y nombre del archivo, una foto o varias.

Archivos:
- `index.html`: la app (PWA), publicada con GitHub Pages. Se genera con `python3 src/build.py`.
- `src/`: código fuente por módulos (ver `CLAUDE.md`).

Las fotos y sus ediciones se guardan solo en el dispositivo (IndexedDB). No salen del teléfono.
