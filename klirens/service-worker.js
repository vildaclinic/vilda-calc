importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

// nowy SW ma przejąć kontrolę natychmiast po instalacji
workbox.core.skipWaiting();
workbox.core.clientsClaim();

/* --------------------  1. HTML   -------------------- */
// Dla każdej nawigacji (kliknięcie linku, odświeżenie) spróbuj sieci,
// a gdy brak internetu – użyj ostatniej wersji z cache.
workbox.routing.registerRoute(
  ({request}) => request.mode === 'navigate',
  new workbox.strategies.NetworkFirst({
    cacheName: 'pages',
  })
);

/* --------------------  2. Ikony / manifest / CSS / JS  -------------------- */
// Stale‑While‑Revalidate → pierwsze ładowanie z cache, w tle pobierz świeże.
workbox.routing.registerRoute(
  ({request}) => request.destination === 'style' ||
                 request.destination === 'script' ||
                 request.destination === 'image' ||
                 request.url.endsWith('manifest.json'),
  new workbox.strategies.StaleWhileRevalidate({
    cacheName: 'static-assets',
  })
);
