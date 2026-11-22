// Offline app shell. Bump CACHE on every release. Never touches IndexedDB (your data).
const CACHE = 'billable-v1';
const FILES = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
  './js/app.js', './js/achievements.js', './js/backup.js', './js/camera.js', './js/contracts.js', './js/courses-data.js',
  './js/demo.js', './js/dom.js', './js/economy.js', './js/grades.js', './js/items.js', './js/marks.js', './js/office.js',
  './js/review.js', './js/session.js', './js/sound.js', './js/store.js', './js/streak.js', './js/time.js', './js/timelapse.js',
  './js/views/home.js', './js/views/marks.js', './js/views/office.js', './js/views/receipt.js', './js/views/session.js',
  './js/views/settings.js', './js/views/stats.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('billable-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (new URL(req.url).pathname.includes('/tests/')) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then(hit => hit || fetch(req).catch(() =>
      req.mode === 'navigate' ? caches.match('./index.html') : Response.error())));
});
