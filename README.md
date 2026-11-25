# Guitarra Diaria
Escuela de guitarra personal: 119 lecciones en 12 áreas (Básico → Avanzado), 15 piezas de repertorio, repaso espaciado, base de batería y bajo, evaluaciones, rutina diaria, canciones con tablatura, mástil en vivo, cuaderno a mano (S Pen), grabadora, metrónomo y afinador. Funciona sin internet una vez instalada (PWA).

## Archivos
- `index.html`: la app (datos, vistas, audio, afinador, gráficas).
- `guitarra.js`: motor de sonido compartido: grabaciones reales y, si faltan, una cuerda modelada.
- `sonidos/`: 375 grabaciones de guitarra acústica (6 cuerdas, 3 intensidades), de [Meta Steel Guitar](https://github.com/facebookincubator/Meta-open-sound), licencia CC0. Recortadas a 7 s y convertidas a AAC 192 kbps. `indice.js` guarda la corrección de afinación y volumen de cada una.
- `studio.html`: Canciones → Estudio detallado (GuitarLab Studio). Lleva el CSS de Tailwind ya compilado: una clase nueva obliga a recompilarlo.
- `sw.js` + `manifest.webmanifest`: instalación y uso sin internet.
- `tests.html`: pruebas automáticas. Abrir `tests.html` desde un servidor local; no toca tu progreso.

## Datos (en cada dispositivo)
localStorage `gd1` (progreso, no cambiar la clave), `gd1-notas` (cuaderno), `guitarlab_*` (Canciones) e IndexedDB `gd-audio` (grabaciones). Si un dato llega dañado se guarda copia en `<clave>-rescate`.

## Publicar
1. Correr `tests.html`: todo en verde.
2. Subir `VERSION` en `sw.js`.
3. `git push` (GitHub Pages).

## Gráficas de un ejercicio
`framesFor(L)` decide qué se dibuja. Si un ejercicio nuevo no sale de `seq`, `sc`, `cue` o `pat`, agrégalo en `DRILL` (por id o nombre).
