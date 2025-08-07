/*
 * Service worker for the steroid dose calculator (Vilda Clinic)
 *
 * This service worker uses Google’s Workbox library to implement
 * offline support and caching strategies.  Navigation requests and
 * the PWA manifest are handled using a network‑first strategy so
 * that the freshest version of the page is delivered whenever a
 * network connection is available; if the user is offline, the last
 * cached version will be served instead.  All other static assets
 * (scripts, styles, images, fonts) are cached with a cache‑first
 * strategy to ensure fast load times and reduce network usage.
 *
 * The Workbox CDN can be used in a service worker by calling
 * importScripts with a versioned URL.  The official documentation
 * demonstrates this pattern, where the Workbox runtime modules are
 * loaded from the Google storage CDN【212836258290767†L165-L179】.
 */

// Load Workbox from the public CDN.  If a future version is desired,
// update the version number below.  Workbox will automatically
// download additional modules as they are referenced.
importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.4.1/workbox-sw.js');

if (typeof workbox !== 'undefined') {
  // Immediately take control of all clients once the service worker is
  // activated.  Without these calls, a page refresh would be needed
  // before the service worker controls existing tabs.
  workbox.core.skipWaiting();
  workbox.core.clientsClaim();

  // Network‑first strategy for all navigation requests (e.g. page
  // navigations).  When online the most up‑to‑date version of the
  // application shell will be fetched.  If the network is unavailable
  // the last cached response is used.
  workbox.routing.registerRoute(
    ({ request }) => request.mode === 'navigate',
    new workbox.strategies.NetworkFirst({
      cacheName: 'pages',
      networkTimeoutSeconds: 5,
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 20,
          purgeOnQuotaError: true
        })
      ]
    })
  );

  // Network‑first strategy for the manifest file.  The manifest is
  // small and only changes occasionally, so caching it ensures that
  // offline users still receive a manifest.  When online, the
  // manifest will be refreshed from the network.
  workbox.routing.registerRoute(
    ({ url }) => url.pathname.endsWith('manifest.webmanifest') || url.pathname.endsWith('manifest.json'),
    new workbox.strategies.NetworkFirst({
      cacheName: 'manifest',
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 1,
          purgeOnQuotaError: true
        })
      ]
    })
  );

  // Cache‑first strategy for static assets such as scripts, styles,
  // images and fonts.  These resources rarely change and benefit
  // from being served out of the cache whenever possible.  They will
  // still update in the background when a new version is requested.
  workbox.routing.registerRoute(
    ({ request }) => ['style', 'script', 'image', 'font'].includes(request.destination),
    new workbox.strategies.CacheFirst({
      cacheName: 'assets',
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 100,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
          purgeOnQuotaError: true
        })
      ]
    })
  );
} else {
  // If Workbox failed to load, log a warning so that offline
  // behaviour can still be debugged.  The site will still
  // function, but caching strategies will not be applied.
  console.warn('Workbox failed to load in the service worker.');
}