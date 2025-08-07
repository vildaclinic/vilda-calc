// Service Worker for the Vilda Clinic steroid dosage calculator
//
// This service worker uses Workbox to provide sensible caching defaults for
// a Progressive Web App. It implements a Network First strategy for
// navigation requests and the web manifest so that the application always
// fetches the freshest version when online, while still providing a cached
// fallback when offline. All other static assets (scripts, stylesheets,
// images, fonts) are served from a cache first and will be updated in the
// background.

/* global workbox */

// Import Workbox from the official CDN. If the CDN is unavailable the
// service worker will fail to register, which is preferable to providing
// stale content indefinitely.
importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

// Disable Workbox debugging by default. You can set this to true during
// development to see verbose logs in the browser console.
workbox.setConfig({ debug: false });

// Ensure the service worker activates immediately and starts controlling
// existing pages without requiring a refresh.
self.addEventListener('install', event => {
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

// Network‑first caching for navigation requests (HTML pages). When a
// navigation request occurs and the user is online, Workbox will fetch
// the newest version from the network. If the network is unavailable,
// the last cached version is served instead. The networkTimeoutSeconds
// option ensures we don’t wait indefinitely for the network to respond.
workbox.routing.registerRoute(
  ({ request }) => request.mode === 'navigate',
  new workbox.strategies.NetworkFirst({
    cacheName: 'pages-cache',
    networkTimeoutSeconds: 3,
    plugins: [
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 50,
        purgeOnQuotaError: true,
      }),
    ],
  })
);

// Network‑first strategy for the web manifest. This ensures the manifest
// file itself stays current while still working offline. The manifest is
// requested infrequently so a small cache is sufficient.
workbox.routing.registerRoute(
  ({ url }) => url.pathname.endsWith('manifest.json'),
  new workbox.strategies.NetworkFirst({
    cacheName: 'manifest-cache',
    networkTimeoutSeconds: 3,
    plugins: [
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 5,
        purgeOnQuotaError: true,
      }),
    ],
  })
);

// Cache‑first strategy for other assets such as stylesheets, scripts,
// workers, images and fonts. These assets rarely change compared with
// navigation content and can be served directly from the cache. Workbox
// will automatically update cached resources in the background when
// they're requested again.
workbox.routing.registerRoute(
  ({ request }) => [
    'style',
    'script',
    'worker',
    'image',
    'font',
  ].includes(request.destination),
  new workbox.strategies.CacheFirst({
    cacheName: 'assets-cache',
    plugins: [
      new workbox.cacheableResponse.CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
        purgeOnQuotaError: true,
      }),
    ],
  })
);

// Fall back to a generic offline response for other requests if desired.
// Here we leave unhandled requests to be processed by the browser
// default behaviour, which will result in network errors when offline.