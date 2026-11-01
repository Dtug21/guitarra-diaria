# Guitarra Diaria
Escuela de guitarra personal: 90 lecciones en 12 áreas (Básico → Avanzado), evaluaciones, rutina diaria, cuaderno a mano (S Pen), grabadora, metrónomo y afinador. Funciona sin internet una vez instalada (PWA).

- Un solo `index.html` + `sw.js` + `manifest.webmanifest`.
- Datos en el dispositivo: localStorage `gd1` (progreso, no cambiar la clave), `gd1-notas` (cuaderno a mano) e IndexedDB `gd-audio` (grabaciones).
- Al actualizar, subir `VERSION` en `sw.js`.
