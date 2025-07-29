const CACHE_NAME = 'pwa-klirens-v1';
const urlsToCache = [
  // Główny dokument aplikacji PWA. Musi odpowiadać start_url z manifestu.
  'Kalkulator_klirens.html',
  // Plik manifestu oraz skrypt service‑worker.
  'manifest.json',
  'service-worker.js',
  // Ikony aplikacji w różnych rozmiarach – dzięki nim PWA działa offline również na iOS.
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-180.png',
  'icons/icon-152.png',
  'icons/icon-144.png',
  'icons/icon-120.png',
  'icons/icon-76.png',
  'icons/icon-72.png',
  'icons/icon-57.png'
];

// During the install phase the service worker pre-caches the application shell.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache);
    })
  );
});

// Intercept fetch requests to serve cached content when available. If the
// resource is not in the cache, fetch it from the network and cache a copy
// of same-origin requests for future use. For navigation requests, fall
// back to the cached app shell when offline.
self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') {
    return;
  }
  const requestURL = new URL(event.request.url);
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request)
        .then(networkResponse => {
          // Cache successful same-origin responses for later use
          if (networkResponse.ok && requestURL.origin === location.origin) {
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, networkResponse.clone());
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // If the request is for a navigation to a page, provide the app shell.
          if (event.request.mode === 'navigate') {
            return caches.match('Kalkulator_klirens.html');
          }
        });
    })
  );
});

// Clean up old caches on activation. Only caches matching CACHE_NAME will be kept.
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (!cacheWhitelist.includes(cacheName)) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});