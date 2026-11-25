// Guarda la app para que abra sin internet. Sube VERSION cuando cambies archivos.
const VERSION = 'gd-v8', FONTS = 'gd-fonts', SONIDOS = 'gd-sonidos';
const FILES = ['./', './index.html', './studio.html', './guitarra.js', './sonidos/indice.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  // Solo borra cachés propias: dtug21.github.io aloja varias apps y comparten este almacenamiento
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('gd-') && k !== VERSION && k !== FONTS && k !== SONIDOS).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
const guardar = (nombre, req, res) => { const copia = res.clone(); return caches.open(nombre).then(c => c.put(req, copia)).catch(() => {}); };
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Tipografías: primero la copia guardada
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONTS).then(c => c.match(req)).then(hit => hit || fetch(req).then(r => { if (r.ok || r.type === 'opaque') e.waitUntil(guardar(FONTS, req, r)); return r; })));
    return;
  }
  if (url.origin !== location.origin) return;
  // Grabaciones: no cambian nunca, se guardan la primera vez y se quedan entre versiones
  if (url.pathname.includes('/sonidos/') && url.pathname.endsWith('.m4a')) {
    e.respondWith(caches.open(SONIDOS).then(c => c.match(req).then(hit => hit || fetch(req).then(r => { if (r.status === 200) e.waitUntil(c.put(req, r.clone()).catch(() => {})); return r; }))));
    return;
  }
  // Red primero; si no hay internet o tarda más de 4 s, la copia guardada (ignorando ?theme=…)
  const copia = () => caches.open(VERSION).then(c => c.match(req, { ignoreSearch: true }).then(r => r || (req.mode === 'navigate' ? c.match('./index.html') : undefined)));
  const red = fetch(req).then(r => { if (r.ok && !url.search) e.waitUntil(guardar(VERSION, req, r)); return r; });
  const lenta = new Promise(ok => setTimeout(ok, 4000)).then(copia).then(r => r || red);
  e.respondWith(Promise.race([red, lenta]).catch(() => copia().then(r => r || Response.error())));
});
