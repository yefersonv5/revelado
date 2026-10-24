# Revelado: guía para trabajar en este repo

- La app publicada es `index.html` (GitHub Pages, rama main). **No se edita a mano**: se genera con `python3 src/build.py`.
- Fuentes en `src/`: `head.html`, `app.template.html` (solo el marcado), `styles.css` (toda la hoja de estilos) y `js/` con la lógica en módulos. Cada módulo abre con un comentario que dice qué contiene.
- `build.py` une los módulos en el orden de su lista `ORDEN` y falla si hay un archivo en `js/` que no está en la lista. Un módulo nuevo se agrega ahí, antes de `eventos.js`.
- Higiene: no repitas código que ya existe como utilidad (`$`, `$$`, `esc`, `clamp`, `toast`, `abrirHoja`, `DEF`, `clonar`...). Todo vive en un solo script, así que no hacen falta comprobaciones `typeof x === 'function'`.

## Cómo está armada

- `motor.js` es el motor de revelado en WebGL2: sube la foto como textura, prepara cuatro desenfoques (detalle fino, textura, claridad y neblina) y aplica todos los ajustes en un solo sombreador. Las previsualizaciones, miniaturas, histograma y exportación usan el mismo motor, así lo que ves es lo que exportas.
- Los ajustes de una foto son un objeto plano con valores numéricos (`DEF` en `ajustes-def.js`) más `curva`, `geo` (giro, volteo, enderezar y recorte) y `mascaras`. Nunca se toca el archivo original: la edición es no destructiva y se guarda junto a la foto.
- Las fotos viven solo en el dispositivo, en IndexedDB (`biblioteca.js`). No hay backend ni cuentas. Si se borran los datos del navegador o de la app, se borra la biblioteca.
- Si agregas un ajuste nuevo: valor por defecto en `DEF`, control en `PANELES` y su uso en el sombreador de `motor.js` (y en `uniformes()`).

## Sistema visual

- Concepto: cuarto oscuro de bolsillo, como Lightroom en iPhone. Fondo gris carbón (no negro puro), superficies que se aclaran por nivel (`--surface`, `--surface-2`, `--surface-3`) y un solo color de marca, el azul `--brand`, para la acción principal y lo que está activo.
- La foto manda: la interfaz es neutra para no teñir la percepción del color. Nada de colores de marca sobre la foto salvo los controles activos.
- Patrones de iOS: barra de herramientas abajo, hojas que suben desde abajo y se cierran arrastrando, objetivos táctiles de 44 px, tipografía del sistema, avisos arriba.
- Gestos: mantener la foto muestra el original; pellizcar acerca; doble toque alterna ajustar y 100 %; deslizar a los lados cambia de foto; doble toque en un deslizador lo devuelve a su valor; arrastrar una hoja hacia abajo la cierra.
- En computador (1024 px o más) la app tiene diseño propio: la biblioteca usa más columnas y el editor muestra los paneles a la derecha.
- El repo es público: nunca subir fotos personales, llaves secretas ni respaldos.
- Tras cambiar `src/`, subir el número de `CACHE` en `sw.js`. `build.py` también escribe `version.json`: la app abierta compara su versión con ese archivo y se recarga sola cuando hay una nueva. Publicar siempre `index.html` y `version.json` juntos.
- Idioma de la app y de los textos: español de Colombia. Sin raya larga en los textos.
