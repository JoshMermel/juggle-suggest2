const CACHE_NAME = 'juggle-suggest2-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './suggest.js',
  './random_siteswap.js',
  './orbits.js',
  './orbits_graph.js',
  './juggler.js',
  './anim.js',
  './autocomplete.js',
  './storage.js',
  './utils.js',
  './manifest.json',
  './icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Network-first for same-origin GET requests so online deploys appear right away,
// with seamless fallback to the precached copy when offline.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request, { ignoreSearch: true });
        if (cached) {
          return cached;
        }
        if (request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        throw new Error('Offline and not cached');
      })
  );
});
