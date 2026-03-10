

/*
 * Custom service worker for the Vilda Clinic PWA.
 *
 * This implementation follows a simple network‑first strategy for
 * navigation requests and a stale‑while‑revalidate strategy for all
 * other static assets.  It also adds a cache version so that new
 * releases clean up old caches automatically.  Po zainstalowaniu nowej wersji service workera NIE aktywujemy jej automatycznie.
 * Nowy SW przechodzi w stan "waiting" i czeka na decyzję użytkownika.
 * Klient może wymusić natychmiastową aktywację wysyłając wiadomość
 * `{type: 'SKIP_WAITING'}` (np. po kliknięciu „Przeładuj” w banerze).
 *
 * Assets defined in the `ASSETS` array are cached during install so
 * that the app continues to load when offline.  You should update
 * `CACHE_VER` and the contents of `ASSETS` whenever you publish a new
 * version of the application.
 */

// Wersja aplikacji – zmieniaj tę wartość przy publikowaniu nowej funkcjonalności
// (np. z '0.78' na '0.79').  Zmiana tej stałej powoduje utworzenie nowej
// nazwy cache i wymusza aktualizację service workera u użytkowników.
const SW_VERSION = '0.79.1.1';
// Nazwa cache zawiera numer wersji.  Podniesienie wersji (SW_VERSION)
// gwarantuje odświeżenie zasobów i usunięcie starych cache.
const CACHE_VER = `pwa-kalorii-v${SW_VERSION}`;
const ASSETS = [
  '/',
  '/index.html',
  '/instrukcja.html',
  '/o-aplikacji.html',
  '/materialy-edukacyjne.html',
  '/style.css',
  '/ios26-v2.css',
  '/ios26-ui.js',
  '/app.js',
  '/ds_lms.js',
  '/gh_igf_therapy.js',
  '/tutorial.js',
  '/manifest.json',
  '/service-worker-kalorii.js',
  '/logo_vilda.jpeg',
  '/posters/omnitrope_poster.png',
  '/posters/genotropin_poster.png',
  '/posters/ngenla_poster.png'
];

// Install event: pre‑cache core assets (bez automatycznego skipWaiting).
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VER).then((cache) => cache.addAll(ASSETS))
  );
});

// Activate event: remove old caches and take control of clients.
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((key) => key !== CACHE_VER).map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

// Fetch event: network‑first for navigations, network‑first for certain
// scripts, stale‑while‑revalidate for everything else.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Only handle GET requests.
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Handle navigation requests (HTML pages) with a network‑first strategy.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const networkResponse = await fetch(req);
        // Cache the fresh copy for offline use.
        const cache = await caches.open(CACHE_VER);
        cache.put(req, networkResponse.clone());
        return networkResponse;
      } catch (e) {
        // When offline or network fails, serve the cached page (if any).
        const cache = await caches.open(CACHE_VER);
        // Fallback to '/' or '/index.html' when no match for the request.
        return (
          (await cache.match(req)) ||
          (await cache.match('/')) ||
          (await cache.match('/index.html'))
        );
      }
    })());
    return;
  }

  // Always fetch growth hormone and Down syndrome modules from the
  // network first and update the cache.  These files contain
  // frequently updated clinical tables and should not be served stale
  // when a connection is available.
  if (
    url.pathname.endsWith('gh_igf_therapy.js') ||
    url.pathname.endsWith('ds_lms.js')
  ) {
    event.respondWith((async () => {
      try {
        const networkResponse = await fetch(req);
        if (networkResponse && networkResponse.ok) {
          const cache = await caches.open(CACHE_VER);
          cache.put(req, networkResponse.clone());
        }
        return networkResponse;
      } catch (e) {
        // On network error serve the cached version if available.
        const cache = await caches.open(CACHE_VER);
        return cache.match(req);
      }
    })());
    return;
  }

  // For all other requests use stale‑while‑revalidate:
  // return the cached version immediately (if any) and update it in the background.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VER);
    const cached = await cache.match(req);
    const fetchPromise = fetch(req)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.ok) {
          cache.put(req, networkResponse.clone());
        }
        return networkResponse;
      })
      .catch(() => cached);
    return cached || fetchPromise;
  })());
});

// Listen for messages from the client.  When a message with
// `{type:'SKIP_WAITING'}` is received we call skipWaiting() so that
// the new service worker becomes active immediately.
self.addEventListener('message', (event) => {
  if (event?.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});