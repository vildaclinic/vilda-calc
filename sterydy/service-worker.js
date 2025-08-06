/*
 * A service worker that uses Google's Workbox library to provide offline
 * support and ensure users always receive the most up‑to‑date version of the
 * application when they're online. If Workbox can't be loaded (for example,
 * due to a network error), this file falls back to the previous manual cache
 * implementation. The update flow is based on the Workbox documentation,
 * which explains how to skip the waiting phase and take control of existing
 * clients immediately【731631889626113†L175-L184】.
 */

// Load Workbox from Google's CDN. If the import fails, the `workbox` global
// will be undefined and the fallback implementation below will run.
importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

// Force an updated service worker to activate immediately and take control
// of any existing clients. This is recommended when your app uses precaching,
// as described in Workbox's update guidance【731631889626113†L175-L184】.
try {
  workbox.core.skipWaiting();
  workbox.core.clientsClaim();
} catch (e) {
  // If workbox failed to load the globals won't be defined. We'll handle
  // this in the fallback branch below.
}

if (typeof workbox !== 'undefined') {
  // Workbox loaded successfully. Configure caching and routing.
  console.log('Workbox loaded successfully');

  // Set a custom cache name prefix to avoid collisions with other sites.
  // Use a unique prefix for this steroid dose calculator. If you add more
  // applications, update the prefix in their respective service workers.
  workbox.core.setCacheNameDetails({ prefix: 'pwa-steroids' });

  // Precache critical application assets. The `revision` field should be
  // updated whenever the file contents change. Using a content hash for the
  // revision ensures that updates are detected properly.
  /*
   * Precache critical application assets. The `manifest.json` file used to be
   * precached here but has been removed to allow Workbox to fetch it
   * directly from the network. This ensures that users always receive the
   * freshest version of the manifest when they load or update the app.
   *
   * The revision values below are MD5 hashes of the file contents. They must
   * be updated whenever the files change so that Workbox knows to fetch the
   * latest version from the network and update the cache. For this steroid
   * dose calculator, only the service worker itself is precached so Workbox
   * can detect updates. Icons and the manifest are deliberately omitted from
   * precaching and are instead cached via runtime strategies defined below.
   */
  workbox.precaching.precacheAndRoute([
    // Include the service worker itself so Workbox can detect updates. Setting
    // revision to null instructs Workbox to treat the URL as versioned.
    { url: 'service-worker.js',                revision: null }
    // Note: Icons are not precached here because they may not be provided in
    // the project files. They will still be cached at runtime via the static
    // resource and image caching strategies defined below.
  ]);

  // Fetch the web app manifest using a network‑first strategy. When online
  // the network version will update the cache; when offline the cached
  // manifest will be returned. Keeping the cache limited to one entry avoids
  // storing outdated manifests.
  workbox.routing.registerRoute(
    ({url}) => url.pathname.endsWith('manifest.json'),
    new workbox.strategies.NetworkFirst({
      cacheName: 'manifest-cache',
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 1,
          maxAgeSeconds: 7 * 24 * 60 * 60, // expire manifests after one week
        }),
      ],
    })
  );

  // ②  Sprząta stare precache’y po aktualizacji (usunie z cache
  //     wcześniejsze wersje HTML, bo nie ma ich już w manifeście).
  workbox.precaching.cleanupOutdatedCaches();

  // Use a network‑first strategy for navigation requests (e.g. when
  // navigating to new pages). If the network is unavailable the cached
  // version will be used. This ensures that when online, the browser checks
  // for a newer version of the HTML and updates the cache accordingly.
  workbox.routing.registerRoute(
    ({ request }) => request.mode === 'navigate',
    new workbox.strategies.NetworkFirst({
      cacheName: 'pages-cache',
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 50,
        })
      ],
    })
  );

  // Serve JS, CSS and font files from the cache first, falling back to the
  // network if they're not cached. This improves performance for static
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
          // Keep static files for up to 30 days.
          maxAgeSeconds: 30 * 24 * 60 * 60,
        })
      ],
    })
  );

  // Use a stale‑while‑revalidate strategy for images. This returns cached
  // images immediately while updating the cache in the background when
  // online.
  workbox.routing.registerRoute(
    ({ request }) => request.destination === 'image',
    new workbox.strategies.StaleWhileRevalidate({
      cacheName: 'image-cache',
    })
  );

  // Listen for messages from the window context to skip waiting. This
  // enables code in the page to trigger immediate activation of a new
  // service worker when an update is available【731631889626113†L175-L184】.
  self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
      self.skipWaiting();
    }
  });
} else {
  // Workbox failed to load; fall back to the original manual caching logic.
  console.log('Workbox failed to load, falling back to manual caching');

  const CACHE_NAME = 'pwa-klirens-v1';
  // Only cache the core application files in the fallback implementation. Icons
  // are excluded here because they may not be present in the deployed
  // environment. Additional assets will be cached on demand via the fetch
  // handler below.
  const urlsToCache = [
    'Kalkulator_klirens.html',
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
            if (networkResponse.ok && requestURL.origin === location.origin) {
              caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, networkResponse.clone());
              });
            }
            return networkResponse;
          })
          .catch(() => {
            if (event.request.mode === 'navigate') {
              return caches.match('Kalkulator_klirens.html');
            }
          });
      })
    );
  });

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
}
