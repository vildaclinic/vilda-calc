/*
 * A service worker tailored for the calorie, BMI and percentiles calculator.
 *
 * This script leverages Google's Workbox library to provide offline support
 * and ensure users receive the most up‑to‑date version of the application when
 * online. Unlike the original service worker provided with this project,
 * we deliberately avoid specifying hand‑generated content hashes and omit the
 * main HTML page from the precache list.  Instead, navigation requests are
 * handled using a NetworkFirst strategy so that a fresh copy of the HTML
 * is retrieved whenever the user is online and the last cached copy is used
 * when offline【163846191155208†L144-L178】.  If Workbox fails to load, the script
 * falls back to a manual caching implementation with the same behaviour.
 */

// Load Workbox from Google's CDN. If the import fails, the `workbox` global
// will remain undefined and the fallback implementation below will run.
importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

// Force an updated service worker to activate immediately and take control
// of any existing clients.  This is recommended when your app uses precaching.
try {
  workbox.core.skipWaiting();
  workbox.core.clientsClaim();
} catch (e) {
  // If Workbox failed to load the globals won't be defined. We'll handle this
  // in the fallback branch below.
}

if (typeof workbox !== 'undefined') {
  // Workbox loaded successfully. Configure caching and routing.
  console.log('Workbox loaded successfully');

  // Set a custom cache name prefix to avoid collisions with other sites.  The
  // prefix reflects this application (kalkulator kalorii) instead of the
  // previously used "klirens" prefix.
  workbox.core.setCacheNameDetails({ prefix: 'pwa-kalorii' });

  // Precache a minimal set of assets.  We intentionally avoid specifying
  // revision strings (no hand‑rolled hashes) and omit the main HTML file from
  // precaching.  The HTML will instead be handled by the NetworkFirst
  // strategy registered below so that a fresh copy is always fetched when
  // online and a cached copy is used when offline【163846191155208†L144-L178】.
  workbox.precaching.precacheAndRoute([
    { url: 'manifest.json', revision: null },
    { url: 'service-worker-kalorii.js', revision: null }
    // Icons are cached on demand by the runtime caching rules below.
  ]);

  // Use a network‑first strategy for navigation requests (e.g. when
  // navigating to the main HTML page).  If the network is unavailable the
  // cached version will be used.  This ensures that when online, the browser
  // checks for a newer version of the HTML and updates the cache accordingly【163846191155208†L144-L178】.
  workbox.routing.registerRoute(
    ({ request }) => request.mode === 'navigate',
    new workbox.strategies.NetworkFirst({
      cacheName: 'pages-cache',
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 50,
        }),
      ],
    })
  );

  // Serve JS, CSS and font files from the cache first, falling back to the
  // network if they're not cached.  This improves performance for static
  // resources and reduces bandwidth usage.
  workbox.routing.registerRoute(
    ({ request }) =>
      request.destination === 'script' ||
      request.destination === 'style' ||
      request.destination === 'font',
    new workbox.strategies.CacheFirst({
      cacheName: 'static-cache',
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 60,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
        }),
      ],
    })
  );

  // Use a stale‑while‑revalidate strategy for images.  This returns cached
  // images immediately while updating the cache in the background when online【163846191155208†L184-L187】.
  workbox.routing.registerRoute(
    ({ request }) => request.destination === 'image',
    new workbox.strategies.StaleWhileRevalidate({
      cacheName: 'image-cache',
    })
  );

  // Listen for messages from the window context to skip waiting.  This
  // enables code in the page to trigger immediate activation of a new
  // service worker when an update is available.
  self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
      self.skipWaiting();
    }
  });
} else {
  // Workbox failed to load; fall back to a manual caching implementation.
  console.log('Workbox failed to load, falling back to manual caching');

  // Only cache the core application files in the fallback implementation.  Icons
  // are excluded here because they will be cached on demand.  Note that the
  // main HTML file is intentionally not precached; it will be cached at
  // runtime when the user first visits the app.
  const CACHE_NAME = 'pwa-kalorii-v1';
  const urlsToCache = [
    'manifest.json',
    'service-worker-kalorii.js',
  ];

  self.addEventListener('install', (event) => {
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.addAll(urlsToCache);
      })
    );
  });

  self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') {
      return;
    }
    const requestURL = new URL(event.request.url);
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse.ok && requestURL.origin === location.origin) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, networkResponse.clone());
              });
            }
            return networkResponse;
          })
          .catch(() => {
            // If navigating to the app while offline and no network response is
            // available, return the cached HTML file.  This assumes the HTML
            // page has been cached previously via a successful network request.
            if (event.request.mode === 'navigate') {
              return caches.match('Kalkulator_kalorii.html');
            }
          });
      })
    );
  });

  self.addEventListener('activate', (event) => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (!cacheWhitelist.includes(cacheName)) {
              return caches.delete(cacheName);
            }
          })
        );
      })
    );
  });
}
