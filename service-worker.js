const CACHE_VERSION = 'labtools-v3';

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './css/main.css',
  './css/themes.css',
  './js/app.js',
  './js/router.js',
  './js/db.js',
  './js/utils.js',
  './js/calculators/calculator-shell.js',
  './js/calculators/registry.js',
  './js/calculators/configs/water-alkalinity.js',
  './js/calculators/configs/water-hardness.js',
  './js/calculators/configs/water-chlorine-residual.js',
  './js/calculators/configs/water-tds-conductivity.js',
  './js/calculators/configs/water-coagulant-dose.js',
  './js/calculators/configs/water-feed-pump-rate.js',
  './js/calculators/configs/water-jar-test.js',
  './js/calculators/configs/boiler-coc.js',
  './js/calculators/configs/boiler-blowdown-rate.js',
  './js/calculators/configs/boiler-percent-blowdown.js',
  './js/calculators/configs/boiler-silica-carryover.js',
  './js/calculators/configs/boiler-phosphate-dose.js',
  './js/calculators/configs/boiler-sulfite-dose.js',
  './js/calculators/configs/boiler-condensate-return.js',
  './js/calculators/configs/boiler-tds-conductivity.js',
  './js/calculators/configs/boiler-ph-from-conductivity.js',
  './js/calculators/configs/boiler-conductivity-from-ph.js',
  './js/calculators/lib/high-purity-ph.js',
  './js/calculators/configs/wastewater-bod5.js',
  './js/calculators/configs/wastewater-cod.js',
  './js/calculators/configs/wastewater-mlss.js',
  './js/calculators/configs/wastewater-svi.js',
  './js/calculators/configs/wastewater-srt.js',
  './js/calculators/configs/wastewater-fm-ratio.js',
  './js/calculators/configs/wastewater-do-saturation.js',
  './js/procedures/procedures-viewer.js',
  './js/notes/notes.js',
  './js/notes/notes-ui.js',
  './js/settings/settings-ui.js',
  './js/shifts/shift-engine.js',
  './js/shifts/shifts-store.js',
  './js/shifts/ics.js',
  './js/shifts/shifts-ui.js',
  './data/procedures/water.json',
  './data/procedures/boiler.json',
  './data/procedures/wastewater.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE_URLS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
