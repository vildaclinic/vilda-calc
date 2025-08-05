/*
 * A service worker for the HOMA‑IR calculator. This version uses Google's
 * Workbox library to provide offline support without manually tracking file
 * hashes or precaching the HTML. Instead of precaching the main page, a
 * network‑first strategy is used so that when the user is online a fresh copy
 * of the HTML is always fetched. When offline the last successfully fetched
 * copy will be served from the cache. If Workbox fails to load (for example
 * due to a network error), a simple manual fallback implementation with a
 * similar strategy is provided. Any references to the previous klirens
 * calculator have been removed.
 */

// Attempt to load Workbox from Google's CDN. If this import fails the
// `workbox` global will be undefined and the fallback code will run.
importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

// Immediately activate the new service worker and take control of uncontrolled
// clients. This mirrors the recommended update flow in the Workbox docs.
try {
  workbox.core.skipWaiting();
  workbox.core.clientsClaim();
} catch (e) {
  // Workbox failed to load; the manual fallback below will handle caching.
}

if (typeof workbox !== 'undefined') {
  // Workbox loaded successfully. Configure cache names for this app.
  workbox.core.setCacheNameDetails({ prefix: 'pwa-homa-ir' });

  /*
   * Precache only a minimal set of assets. We deliberately omit the main
   * HTML file from precaching so that navigation requests always attempt to
   * fetch a fresh copy first. The revision is set to null which tells
   * Workbox to treat these URLs as versioned and update the cache whenever
   * the contents change. Icons are cached on demand via the image strategy.
   */
  workbox.precaching.precacheAndRoute([
    { url: 'manifest.json',    revision: null },
    { url: 'service-worker.js', revision: null }
  ]);

  /*
   * Navigation requests (i.e. requests where request.mode === 'navigate')
   * use a network‑first strategy. When online this returns a fresh copy of
   * the HTML and updates the cache. If the network is unreachable, the
   * previously cached response will be used instead.
   */
  workbox.routing.registerRoute(
    ({ request }) => request.mode === 'navigate',
    new workbox.strategies.NetworkFirst({
      cacheName: 'pages-cache',
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 50
        })
      ]
    })
  );

  /*
   * Static assets such as JavaScript, CSS and fonts use a stale‑while‑revalidate
   * strategy. This serves assets from the cache immediately and refreshes the
   * cache in the background when online.
   */
  workbox.routing.registerRoute(
    ({ request }) =>
      request.destination === 'script' ||
      request.destination === 'style'  ||
      request.destination === 'font',
    new workbox.strategies.StaleWhileRevalidate({
      cacheName: 'static-cache',
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 60,
          // Keep static resources for up to 30 days.
          maxAgeSeconds: 30 * 24 * 60 * 60
        })
      ]
    })
  );

  /*
   * Images (including icons) also use a stale‑while‑revalidate strategy. This
   * improves perceived performance while still ensuring updates are picked up
   * when online.
   */
  workbox.routing.registerRoute(
    ({ request }) => request.destination === 'image',
    new workbox.strategies.StaleWhileRevalidate({
      cacheName: 'image-cache'
    })
  );

  // Listen for a custom SKIP_WAITING message to immediately activate a new SW.
  self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
      self.skipWaiting();
    }
  });
} else {
  // Workbox failed to load; implement a manual fallback strategy.
  const CACHE_NAME = 'pwa-homa-ir-v1';
  // Minimal set of files to cache on install. We do not cache the HTML here.
  const urlsToCache = [
    'manifest.json',
    'service-worker.js'
  ];

  self.addEventListener('install', event => {
    event.waitUntil(
      caches.open(CACHE_NAME).then(cache => {
        return cache.addAll(urlsToCache);
      })
    );
  });

  self.addEventListener('fetch', event => {
    const { request } = event;
    // Only handle GET requests; ignore others such as POST.
    if (request.method !== 'GET') {
      return;
    }
    // For navigations use a network‑first strategy similar to the Workbox
    // implementation above. This ensures the user sees the latest version
    // when online and falls back to cache when offline.
    if (request.mode === 'navigate') {
      event.respondWith(
        fetch(request)
          .then(response => {
            // Clone the response so we can cache it and still return it.
            const respClone = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, respClone);
            });
            return response;
          })
          .catch(() => {
            // If the network fails, try to return a cached response.
            return caches.match(request).then(cached => {
              // If the requested page isn't in the cache, fall back to the
              // main HOMA_2.html file if it has been cached previously.
              return cached || caches.match('HOMA_2.html');
            });
          })
      );
      return;
    }
    // For other requests, try the cache first then go to the network. If the
    // network response is successful and is same‑origin, update the cache.
    event.respondWith(
      caches.match(request).then(cached => {
        return (
          cached ||
          fetch(request)
            .then(networkResponse => {
              if (networkResponse && networkResponse.ok) {
                const reqURL = new URL(request.url);
                if (reqURL.origin === location.origin) {
                  caches.open(CACHE_NAME).then(cache => {
                    cache.put(request, networkResponse.clone());
                  });
                }
              }
              return networkResponse;
            })
            .catch(() => cached)
        );
      })
    );
  });

  self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(name => {
            if (!cacheWhitelist.includes(name)) {
              return caches.delete(name);
            }
          })
        );
      })
    );
  });
}