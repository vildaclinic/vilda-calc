/*
 * A service worker that uses Google's Workbox library to provide offline
 * support and ensure users always receive the most up‑to‑date version of the
 * application when they're online. If Workbox can't be loaded (for example,
 * due to a network error), this file falls back to the previous manual cache
 * implementation. The update flow is based on the Workbox documentation,
 * which explains how to skip the waiting phase and take control of existing
 * clients immediately【731631889626113†L175-L184】.
 */

// Attempt to load the Workbox library from Google's CDN. According to MDN,
// `importScripts()` throws a NETWORK_ERROR and aborts further code execution
// if a script fails to load【214677110537867†L311-L327】. Wrapping the call in
// try/catch allows us to handle failure gracefully instead of letting the
// service worker crash when the user is offline or the CDN is unreachable.
let workboxLoaded = false;
try {
  importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');
  // The global `workbox` will be defined if the script loads successfully.
  workboxLoaded = typeof workbox !== 'undefined';
} catch (err) {
  console.warn('Workbox failed to load, falling back to manual caching', err);
}

// Only call Workbox APIs if the library was loaded successfully.  Skip waiting
// and claim clients up front to ensure users always get the latest version.
if (workboxLoaded) {
  workbox.core.skipWaiting();
  workbox.core.clientsClaim();
  // Workbox loaded successfully. Configure caching and routing.
  console.log('Workbox loaded successfully');

  // Set a custom cache name prefix to avoid collisions with other sites.
  // Give this app its own cache prefix to avoid collisions with other PWAs
  // on the same domain. Use a short, descriptive name derived from the app
  // (e.g. 'pwa-homa-ir'). If you create additional apps in their own
  // directories, update the prefix accordingly in each service worker file.
  workbox.core.setCacheNameDetails({ prefix: 'pwa-homa-ir' });

  // Precache critical application assets. Do not manually manage revision
  // hashes here; Workbox will use the URLs themselves as version identifiers.
  // The main HTML page is intentionally excluded to ensure a network‑first
  // strategy is used for navigation requests (see the route below). When
  // updating assets like the manifest or service worker itself, Workbox will
  // detect changes based on the file contents.
  // Precache critical application assets.  In addition to the manifest
  // and service worker, also cache the main HTML page so it can be
  // served while offline.  Revision values are set to null to allow
  // Workbox to use a content hash automatically.
  workbox.precaching.precacheAndRoute([
    { url: 'HOMA_2.html', revision: null },
    { url: 'manifest.json', revision: null },
    { url: 'service-worker.js', revision: null }
    // Icons and external resources (fonts, avatars) are fetched at
    // runtime via the caching strategies below, so they are not
    // explicitly precached here.
  ]);

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

  // When Workbox fails to load, fall back to a basic cache implementation.
  // Use a cache name unique to this app to avoid clobbering other apps on
  // the same origin. If you create additional apps, update this constant
  // accordingly in each service worker file.
  const CACHE_NAME = 'pwa-homa-ir-v1';
  // Only cache the core application files in the fallback implementation. Icons
  // are excluded here because they may not be present in the deployed
  // environment. Additional assets will be cached on demand via the fetch
  // handler below.
  const urlsToCache = [
    // Precache core assets in the fallback implementation.  Cache the
    // main HTML page as well so the calculator can load offline, along with
    // the manifest and the service worker itself.  Remote images and fonts
    // will be cached on demand via the fetch handler.
    'HOMA_2.html',
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
    // Use a network‑first strategy for navigation requests (HTML pages). This
    // ensures the user always gets the latest content when online while
    // allowing offline access to the last retrieved version.
    if (event.request.mode === 'navigate') {
      event.respondWith(
        fetch(event.request)
          .then(networkResponse => {
            // On success, update the cache so it can be used offline.
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, networkResponse.clone());
            });
            return networkResponse;
          })
          .catch(() => {
            // If the network request fails, try to serve the cached version
            // of the requested page. If it's not cached, this will resolve
            // with undefined and the fetch will fail gracefully.
            return caches.match(event.request);
          })
      );
      return;
    }

    // For non‑navigation requests (scripts, styles, images, etc.), fall back
    // to a simple cache‑first strategy with a network fallback and cache
    // population. This keeps static resources available offline while
    // reducing network usage.
    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then(networkResponse => {
          if (
            networkResponse &&
            networkResponse.ok &&
            new URL(event.request.url).origin === location.origin
          ) {
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, networkResponse.clone());
            });
          }
          return networkResponse;
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