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
    { url: 'service-worker-kalorii.js', revision: null },
    // Precache the guided tutorial script so that first‑time visitors can
    // complete the walkthrough even when offline.  Without precaching, the
    // script would be cached only after first use via the runtime caching
    // strategy, which might delay availability.  See also the fallback
    // cache list below.
    { url: 'tutorial.js', revision: null },
    // Precache the posters used as video placeholders on the educational
    // materials page.  Caching these images up front improves perceived
    // performance because the posters display immediately without a network
    // request.  If you replace the posters with your own artwork, update
    // these paths accordingly.
    { url: 'posters/omnitrope_poster.png', revision: null },
    { url: 'posters/genotropin_poster.png', revision: null },
    { url: 'posters/ngenla_poster.png', revision: null }
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

  // ---------------------------------------------------------------------
  // Custom caching strategies for new assets
  // ---------------------------------------------------------------------
  // Certain larger modules should always be fetched from the network when
  // online.  Using a NetworkFirst strategy ensures that clinicians see the
  // most recent dosing tables and algorithms while still falling back to a
  // cached copy when offline.  We register this route before the generic
  // asset handler so that it takes precedence.  In addition to the
  // domain‑specific files ds_lms.js (Down syndrome LMS reference data) and
  // gh_igf_therapy.js (growth hormone/IGF‑1 therapy calculator), we also
  // include ios26-ui.js, which encapsulates the dynamic Liquid Glass
  // interface.  Keeping ios26-ui.js network‑first allows us to push
  // UI improvements and bug fixes to users as soon as they go online.
  workbox.routing.registerRoute(
    ({ url }) => url.pathname.endsWith('gh_igf_therapy.js') ||
                 url.pathname.endsWith('ds_lms.js') ||
                 url.pathname.endsWith('ios26-ui.js'),
    new workbox.strategies.NetworkFirst({
      cacheName: 'pwa-kalorii-special-scripts',
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 10,
          maxAgeSeconds: 30 * 24 * 60 * 60,
        }),
      ],
    })
  );

  // Serve all non‑HTML resources (scripts, styles, fonts, images, icons, etc.)
  // using a stale‑while‑revalidate strategy.  This means the cached version
  // will be returned immediately, while a network request runs in the
  // background to update the cache with any newer version.  This keeps the
  // application fast while still ensuring that users receive updated assets
  // on subsequent loads【715127147570620†L482-L487】.
  workbox.routing.registerRoute(
    ({ request }) => {
      // For any request that is not a navigation (HTML), apply this rule.
      return request.destination === 'script' ||
             request.destination === 'style'  ||
             request.destination === 'font'   ||
             request.destination === 'image'  ||
             request.destination === 'manifest';
    },
    new workbox.strategies.StaleWhileRevalidate({
      cacheName: 'asset-cache',
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 100,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
        }),
      ],
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
  // In the fallback implementation we cache a minimal set of core assets.  The
  // original version of this service worker only cached the manifest and the
  // service worker itself.  To ensure the app can start and render when
  // Workbox fails to load, we now also include the compiled scripts and
  // stylesheets that form the core of the UI.  Caching these resources
  // up front means the calculator will still be usable offline once it has
  // been opened at least once while online.  We deliberately avoid
  // precaching the main HTML file so that navigation requests continue to
  // use a network‑first strategy.
  const urlsToCache = [
    'manifest.json',
    'service-worker-kalorii.js',
    // Core styles
    'style.css',
    'ios26-v2.css',
    // Core scripts
    'app.js',
    'ds_lms.js',
    'gh_igf_therapy.js',
    'ios26-ui.js',
    // Static content pages for offline help/about
    'o-aplikacji.html',
    'instrukcja.html',
    // Logo
    'logo_vilda.jpeg'
    ,
    // Include the tutorial script in the fallback cache so that the guided
    // walkthrough can run offline on first launch when Workbox is not
    // available.  This mirrors the entry in the Workbox precache above.
    'tutorial.js'
    ,
    // Posters for the educational videos.  Caching these images ensures
    // they display instantly when offline.  Update paths if the artwork
    // changes.
    'posters/omnitrope_poster.png',
    'posters/genotropin_poster.png',
    'posters/ngenla_poster.png'
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

    // Special case for our dynamic datasets and therapy logic: attempt a
    // network request first, falling back to cache when offline.  This
    // mirrors the NetworkFirst strategy implemented via Workbox above.
    if (requestURL.pathname.endsWith('gh_igf_therapy.js') ||
        requestURL.pathname.endsWith('ds_lms.js')) {
      event.respondWith(
        fetch(event.request)
          .then((networkResponse) => {
            // Cache the response for offline use if it comes from our
            // origin.  Ignore opaque responses (e.g. cross‑origin fetches).
            if (networkResponse.ok && requestURL.origin === location.origin) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, networkResponse.clone());
              });
            }
            return networkResponse;
          })
          .catch(() => caches.match(event.request))
      );
      return;
    }

    // Default behaviour: serve from cache first if available and update
    // the cache in the background.  If nothing is cached, fetch from the
    // network.  When offline and requesting a navigation, return the
    // cached entry point if available.
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          // Kick off an update for stale‑while‑revalidate behaviour.  We
          // don't await this promise because we want to return the cached
          // response immediately.
          fetch(event.request)
            .then((networkResponse) => {
              if (networkResponse.ok && requestURL.origin === location.origin) {
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(event.request, networkResponse.clone());
                });
              }
            })
            .catch(() => {
              // Ignore network errors during background update.
            });
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
            // If navigating to the app while offline and no network
            // response is available, return the cached HTML file.  When
            // offline we fall back to the cached copy of
            // "index.html", which is the entry point for
            // the calculator.  Note: we intentionally do not precache the
            // HTML file up front; it will be cached the first time the
            // user visits the app while online.
            if (event.request.mode === 'navigate') {
              // Serve the cached entry point of the app when offline
              return caches.match('index.html');
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
