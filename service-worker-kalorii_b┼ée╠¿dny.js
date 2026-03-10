/*
 * wagaiwzrost.pl — service worker PWA
 *
 * Priorytet tej wersji:
 * 1) aplikacja ma otwierać się natychmiast z cache nawet przy słabym internecie,
 * 2) aktualizacja ma pobierać się w tle,
 * 3) nowy SW nadal czeka w stanie "waiting" aż użytkownik kliknie „Przeładuj”.
 *
 * Najważniejsza zmiana względem poprzedniej wersji:
 * - NAWIGACJA (HTML) działa teraz w strategii stale-while-revalidate,
 *   a nie network-first. Jeżeli strona jest już w cache, oddajemy ją od razu,
 *   a świeżą wersję pobieramy w tle.
 *
 * Dodatkowo:
 * - pre-cache obejmuje główne podstrony oraz lokalne pliki JS/CSS potrzebne do pracy,
 * - runtime cache akceptuje także odpowiedzi "opaque", więc po pierwszym użyciu
 *   mogą zostać zachowane również zasoby z CDN,
 * - filmy i żądania Range NIE są cache’owane (żeby nie zapychać pamięci cache).
 */

const SW_VERSION = '0.80.0';
const CACHE_PREFIX = 'pwa-kalorii';
const SHELL_CACHE = `${CACHE_PREFIX}-shell-v${SW_VERSION}`;
const RUNTIME_CACHE = `${CACHE_PREFIX}-runtime-v${SW_VERSION}`;
const CACHE_NAMES = [SHELL_CACHE, RUNTIME_CACHE];

const CORE_DOCUMENTS = [
  '/',
  '/index.html',
  '/docpro.html',
  '/homa-ir.html',
  '/instrukcja.html',
  '/kalkulator-klirens.html',
  '/kontakt.html',
  '/materialy-edukacyjne.html',
  '/o-aplikacji.html',
  '/steroidy.html',
  '/ustawienia.html',
  '/cukrzyca.html'
];

const CORE_ASSETS = [
  '/manifest.json',
  '/style.css',
  '/sidebar.css',
  '/ios26-v2.css',
  '/ios26-ui.js',
  '/app.js',
  '/ds_lms.js',
  '/gh_igf_therapy.js',
  '/gh_therapy_monitor.js',
  '/antibiotic_therapy.js',
  '/flu_therapy.js',
  '/bisphos_therapy.js',
  '/thyroid_cancer_kids.js',
  '/hypertension_therapy.js',
  '/obesity_therapy.js',
  '/centile_data.js',
  '/vitalSigns.js',
  '/userData.js',
  '/tutorial.js',
  '/bp_module.js',
  '/circumference_module.js',
  '/respiratory_module.js',
  '/custom-fixes.js',
  '/reposition.js',
  '/cukrzyca.js',
  '/klirens.xlsx',
  '/zscore_przyklad_palczewska.xlsx',
  '/zscore_przyklad_olaf.xlsx',
  '/Bad Cat.json',
  '/logo_vilda.jpeg',
  '/thyroid_neck_levels_pl.png'
];

const OPTIONAL_ASSETS = [
  '/posters/omnitrope_poster.png',
  '/posters/genotropin_poster.png',
  '/posters/ngenla_poster.png'
];

const PRECACHE_URLS = [...CORE_DOCUMENTS, ...CORE_ASSETS, ...OPTIONAL_ASSETS];
const PRECACHE_PATHS = new Set(
  PRECACHE_URLS
    .map((value) => {
      try {
        return new URL(value, self.location.origin).pathname;
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean)
);

function isSameOrigin(input) {
  try {
    const url = typeof input === 'string' ? new URL(input, self.location.origin) : new URL(input.url);
    return url.origin === self.location.origin;
  } catch (_) {
    return false;
  }
}

function getPathname(input) {
  try {
    const url = typeof input === 'string' ? new URL(input, self.location.origin) : new URL(input.url);
    return url.pathname;
  } catch (_) {
    return '';
  }
}

function isCacheableResponse(response) {
  return !!response && (response.ok || response.type === 'opaque');
}

function shouldBypassCache(request) {
  const pathname = getPathname(request);

  if (request.headers.has('range')) return true;
  if (request.destination === 'video') return true;
  if (pathname.startsWith('/videos/')) return true;
  if (pathname.startsWith('/presentations/')) return true;

  return false;
}

function getTargetCacheName(request) {
  const pathname = getPathname(request);
  return isSameOrigin(request) && PRECACHE_PATHS.has(pathname) ? SHELL_CACHE : RUNTIME_CACHE;
}

async function putInCache(request, response) {
  if (!isCacheableResponse(response) || shouldBypassCache(request)) return;

  try {
    const cache = await caches.open(getTargetCacheName(request));
    await cache.put(request, response);
  } catch (_) {
    // Nie blokujemy działania aplikacji, jeśli zapis do cache się nie powiedzie.
  }
}

async function matchFromCaches(request) {
  const exactMatch = await caches.match(request);
  if (exactMatch) return exactMatch;

  if (isSameOrigin(request)) {
    return caches.match(request, { ignoreSearch: true });
  }

  return undefined;
}

async function precacheUrlList(urls) {
  const cache = await caches.open(SHELL_CACHE);

  await Promise.allSettled(
    urls.map(async (url) => {
      try {
        const request = new Request(url, { cache: 'reload' });
        const response = await fetch(request);

        if (isCacheableResponse(response)) {
          await cache.put(request, response.clone());
        }
      } catch (_) {
        // Brak pojedynczego pliku nie może wywrócić instalacji całego SW.
      }
    })
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheUrlList(PRECACHE_URLS));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();

      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && !CACHE_NAMES.includes(key))
          .map((key) => caches.delete(key))
      );

      if ('navigationPreload' in self.registration) {
        try {
          await self.registration.navigationPreload.enable();
        } catch (_) {
          // Ignorujemy – nie każda przeglądarka wspiera navigation preload.
        }
      }

      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') return;

  // Workaround dla Safari/Chrome przy certain only-if-cached requests.
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;

  if (shouldBypassCache(request)) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cachedResponse = await matchFromCaches(request);

        const networkResponsePromise = (async () => {
          const preloadResponse = 'preloadResponse' in event ? await event.preloadResponse : null;
          return preloadResponse || (await fetch(request));
        })();

        event.waitUntil(
          networkResponsePromise
            .then((networkResponse) => {
              if (isSameOrigin(request)) {
                return putInCache(request, networkResponse.clone());
              }
            })
            .catch(() => undefined)
        );

        if (cachedResponse) {
          return cachedResponse;
        }

        try {
          return await networkResponsePromise;
        } catch (_) {
          return (
            (await caches.match('/')) ||
            (await caches.match('/index.html')) ||
            Response.error()
          );
        }
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cachedResponse = await matchFromCaches(request);
      const networkResponsePromise = fetch(request);

      event.waitUntil(
        networkResponsePromise
          .then((networkResponse) => putInCache(request, networkResponse.clone()))
          .catch(() => undefined)
      );

      if (cachedResponse) {
        return cachedResponse;
      }

      try {
        return await networkResponsePromise;
      } catch (_) {
        return cachedResponse || Response.error();
      }
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event?.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
