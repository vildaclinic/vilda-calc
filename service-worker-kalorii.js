/*
 * wagaiwzrost.pl — service worker PWA
 *
 * Priorytety tej wersji:
 * 1) aplikacja ma otwierać się natychmiast z cache,
 * 2) aktualizacja ma odświeżać zasoby w tle,
 * 3) nowy SW nadal czeka w stanie "waiting" aż użytkownik kliknie „Przeładuj”,
 * 4) unikamy oddawania nawigacji odpowiedzi oznaczonych jako redirected,
 *    co ogranicza ryzyko błędu WebKit/Chrome:
 *    "Response served by service worker has redirections".
 *
 * Najważniejsze zmiany względem poprzedniej wersji:
 * - nawigacja używa cache-first + background refresh,
 * - root aplikacji jest kanonizowany do /index.html (nie precache'ujemy '/'),
 * - runtime cache NIE jest wersjonowany, więc CDN-y i inne zasoby runtime
 *   nie znikają przy każdej publikacji nowej wersji,
 * - navigation preload jest wyłączony: tutaj nie daje realnej korzyści,
 *   bo i tak chcemy zwracać HTML z cache natychmiast.
 */

const SW_VERSION = '0.9.155';
const CACHE_PREFIX = 'pwa-kalorii';
const SHELL_CACHE = `${CACHE_PREFIX}-shell-v${SW_VERSION}`;
const RUNTIME_CACHE = `${CACHE_PREFIX}-runtime`;
const ACTIVE_CACHE_NAMES = new Set([SHELL_CACHE, RUNTIME_CACHE]);
const ROOT_DOCUMENT = '/index.html';

// Minimalny shell wymagany do natychmiastowego startu aplikacji z cache.
// Jeśli któregoś z tych plików nie uda się pobrać podczas instalacji nowego SW,
// nowa wersja NIE powinna zastępować starej.
const CORE_SHELL_URLS = [
  ROOT_DOCUMENT,
  '/manifest.json',
  '/style.css',
  '/sidebar.css',
  '/ios26-v2.css',
  '/logo_vilda.jpeg',
  '/app.js',
  '/ds_lms.js',
  '/centile_data.js',
  '/vitalSigns.js',
  '/gh_igf_therapy.js',
  '/antibiotic_therapy.js',
  '/userData.js',
  '/ios26-ui.js',
  '/tutorial.js',
  '/bp_module.js',
  '/circumference_module.js',
  '/respiratory_module.js',
  '/custom-fixes.js',
  '/reposition.js',
  '/growth-basic-module.js'
];

// Dodatkowe strony i zasoby próbujemy dociągnąć w tle podczas instalacji,
// ale ich brak nie może zablokować bezpiecznego wdrożenia nowej wersji SW.
const OPTIONAL_DOCUMENTS = [
  '/docpro.html',
  '/homa-ir.html',
  '/instrukcja.html',
  '/kalkulator-klirens.html',
  '/kontakt.html',
  '/materialy-edukacyjne.html',
  '/o-aplikacji.html',
  '/steroidy.html',
  '/ustawienia.html',
  '/cukrzyca.html',
  '/omnitrope-instrukcja.html',
  '/genotropin-instrukcja.html',
  '/ngenla-instrukcja.html',
  '/przelicznik-doposilkowy-instrukcja.html'
];

const OPTIONAL_ASSETS = [
  '/cukrzyca.js',
  '/gh_therapy_monitor.js',
  '/flu_therapy.js',
  '/bisphos_therapy.js',
  '/thyroid_cancer_kids.js',
  '/hypertension_therapy.js',
  '/obesity_therapy.js',
  '/sga_intergrowth_data.js',
  '/sga_malewski_data.js',
  '/sga_birth_module.js',
  '/docpro_state_persist.js',
  '/klirens.xlsx',
  '/zscore_przyklad_palczewska.xlsx',
  '/zscore_przyklad_olaf.xlsx',
  '/Bad Cat.json',
  '/thyroid_neck_levels_pl.png',
  '/IMG_8041.JPG',
  '/edu-video-ui.css',
  '/posters/omnitrope_poster.png',
  '/posters/genotropin_poster.png',
  '/posters/ngenla_poster.png',
  '/posters/przelicznik_doposilkowy_poster.png',
  '/favicon-48x48.png',
  '/favicon-96x96.png',
  '/favicon-144x144.png',
  '/favicon-512x512.png',
  '/favicon.ico',
  '/icons/favicon-16x16.png',
  '/icons/favicon-32x32.png',
  '/pwa-icons/icon-120x120.png',
  '/pwa-icons/icon-152x152.png',
  '/pwa-icons/icon-167x167.png',
  '/pwa-icons/icon-180x180.png'
];

const PRECACHE_URLS = [...new Set([...CORE_SHELL_URLS, ...OPTIONAL_DOCUMENTS, ...OPTIONAL_ASSETS])];
const DOCUMENT_PATHS = new Set([ROOT_DOCUMENT, ...OPTIONAL_DOCUMENTS]);
const SHELL_PATHS = new Set(
  PRECACHE_URLS
    .map((url) => {
      try {
        return new URL(url, self.location.origin).pathname;
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean)
);

function toURL(input) {
  try {
    return typeof input === 'string'
      ? new URL(input, self.location.origin)
      : new URL(input.url, self.location.origin);
  } catch (_) {
    return null;
  }
}

function isHttpRequest(request) {
  const url = toURL(request);
  return !!url && (url.protocol === 'http:' || url.protocol === 'https:');
}

function isSameOrigin(input) {
  const url = toURL(input);
  return !!url && url.origin === self.location.origin;
}

function getPathname(input) {
  const url = toURL(input);
  return url ? url.pathname : '';
}

function normalizeNavigationPath(pathname) {
  if (!pathname || pathname === '/') return ROOT_DOCUMENT;

  if (DOCUMENT_PATHS.has(pathname)) return pathname;

  if (pathname.endsWith('/')) {
    const withoutTrailingSlash = pathname.slice(0, -1);
    const htmlCandidate = `${withoutTrailingSlash}.html`;
    if (DOCUMENT_PATHS.has(htmlCandidate)) return htmlCandidate;
  }

  if (!pathname.endsWith('.html')) {
    const htmlCandidate = `${pathname}.html`;
    if (DOCUMENT_PATHS.has(htmlCandidate)) return htmlCandidate;
  }

  return pathname;
}

function isNavigationRequest(request) {
  return request.mode === 'navigate';
}

function shouldBypassCache(request) {
  const pathname = getPathname(request);

  if (request.headers.has('range')) return true;
  if (request.destination === 'video') return true;
  if (pathname.startsWith('/videos/')) return true;
  if (pathname.startsWith('/presentations/')) return true;

  return false;
}

function isCacheableResponse(response) {
  if (!response) return false;
  if (response.type === 'error') return false;

  const cacheControl = response.headers?.get?.('cache-control') || '';
  if (/\bno-store\b/i.test(cacheControl)) return false;

  return response.ok || response.type === 'opaque';
}

function copyHeadersForSyntheticResponse(response) {
  const headers = new Headers(response.headers || undefined);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.delete('transfer-encoding');
  return headers;
}

async function makeNavigationResponseSafe(response) {
  if (!response) return response;

  // Dla navigation requests nie chcemy oddawać odpowiedzi, która niesie
  // znacznik redirected/opaqueredirect. Tworzymy więc „czystą” odpowiedź.
  if (!response.redirected && response.type !== 'opaqueredirect') {
    return response;
  }

  // Opaqueredirect nie da się sensownie zwrócić do nawigacji przez SW.
  // Traktujemy to jako błąd sieci i przechodzimy do fallbacku z cache.
  if (response.type === 'opaqueredirect') {
    throw new Error('Navigation returned opaqueredirect response');
  }

  const headers = copyHeadersForSyntheticResponse(response);
  const body = await response.blob();

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function buildNavigationNetworkRequest(request) {
  // Dla dokumentów robimy osobny GET z redirect:'follow', żeby uniknąć
  // problemów z redirect mode „manual” oryginalnej nawigacji.
  return new Request(request.url, {
    method: 'GET',
    credentials: 'same-origin',
    mode: 'same-origin',
    redirect: 'follow',
    cache: 'no-cache'
  });
}

function getShellCacheKeyFromRequest(request) {
  if (!isSameOrigin(request)) return null;

  const pathname = getPathname(request);

  if (isNavigationRequest(request)) {
    const normalizedPath = normalizeNavigationPath(pathname);
    return DOCUMENT_PATHS.has(normalizedPath) ? normalizedPath : null;
  }

  return SHELL_PATHS.has(pathname) ? pathname : null;
}

function getNavigationCacheKeyFromResponse(request, response) {
  if (!isSameOrigin(request)) return null;

  const responseUrl = toURL(response?.url || request.url);
  const pathname = responseUrl ? responseUrl.pathname : getPathname(request);
  const normalizedPath = normalizeNavigationPath(pathname);

  if (DOCUMENT_PATHS.has(normalizedPath)) return normalizedPath;
  if (pathname === '/' || pathname === ROOT_DOCUMENT) return ROOT_DOCUMENT;

  return null;
}

async function cacheResponse(cacheName, key, response) {
  if (!key || !isCacheableResponse(response)) return response;

  const cache = await caches.open(cacheName);
  await cache.put(key, response.clone());
  return response;
}

async function readFromShellCache(request) {
  const key = getShellCacheKeyFromRequest(request);
  if (!key) return undefined;

  const cache = await caches.open(SHELL_CACHE);
  return cache.match(key, { ignoreSearch: true });
}

async function readDocumentFromShell(pathname) {
  const key = normalizeNavigationPath(pathname);
  if (!DOCUMENT_PATHS.has(key)) return undefined;

  const cache = await caches.open(SHELL_CACHE);
  return cache.match(key, { ignoreSearch: true });
}

async function readFromRuntimeCache(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const exactMatch = await cache.match(request);
  if (exactMatch) return exactMatch;

  if (isSameOrigin(request)) {
    return cache.match(request, { ignoreSearch: true });
  }

  return undefined;
}

async function updateShellFromNetwork(request) {
  const networkRequest = isNavigationRequest(request)
    ? buildNavigationNetworkRequest(request)
    : request;

  const networkResponse = await fetch(networkRequest);

  if (isNavigationRequest(request)) {
    const cacheKey = getNavigationCacheKeyFromResponse(request, networkResponse);
    const safeResponse = await makeNavigationResponseSafe(networkResponse);

    if (cacheKey && isCacheableResponse(safeResponse)) {
      await cacheResponse(SHELL_CACHE, cacheKey, safeResponse);
    }

    return safeResponse;
  }

  const cacheKey = getShellCacheKeyFromRequest(request);

  // Zasobów innych niż dokumenty nie zapisujemy do shell cache, jeśli po drodze
  // wydarzył się redirect — to zwykle sygnał, że adres URL nie jest kanoniczny.
  if (cacheKey && isCacheableResponse(networkResponse) && !networkResponse.redirected) {
    await cacheResponse(SHELL_CACHE, cacheKey, networkResponse);
  }

  return networkResponse;
}

async function updateRuntimeFromNetwork(request) {
  const networkResponse = await fetch(request);

  if (isCacheableResponse(networkResponse) && !shouldBypassCache(request)) {
    await cacheResponse(RUNTIME_CACHE, request, networkResponse);
  }

  return networkResponse;
}

async function fetchAndStorePrecacheUrl(url, { required = false } = {}) {
  const cache = await caches.open(SHELL_CACHE);
  const request = new Request(url, { cache: 'reload', redirect: 'follow' });
  const response = await fetch(request);
  const pathname = getPathname(url);
  const cacheKey = DOCUMENT_PATHS.has(pathname) ? normalizeNavigationPath(pathname) : pathname;
  const safeResponse = DOCUMENT_PATHS.has(cacheKey)
    ? await makeNavigationResponseSafe(response)
    : response;

  if (!cacheKey || !isCacheableResponse(safeResponse)) {
    if (required) {
      throw new Error(`Nie udało się precache'ować wymaganego pliku: ${url}`);
    }
    return;
  }

  await cache.put(cacheKey, safeResponse);
}

async function installShell() {
  // Najpierw minimalny shell – jeśli to się nie uda, nowa wersja SW nie powinna wejść.
  for (const url of CORE_SHELL_URLS) {
    await fetchAndStorePrecacheUrl(url, { required: true });
  }

  // Następnie dodatkowe strony i zasoby pobieramy spokojnie, jeden po drugim,
  // żeby nie zapychać łącza użytkownika przy słabym internecie.
  for (const url of [...OPTIONAL_DOCUMENTS, ...OPTIONAL_ASSETS]) {
    try {
      await fetchAndStorePrecacheUrl(url, { required: false });
    } catch (_) {
      // Best-effort: brak pojedynczego pliku nie przerywa instalacji nowego SW.
    }
  }
}

async function migrateOldRuntimeCaches(keys) {
  const runtimeCache = await caches.open(RUNTIME_CACHE);

  const oldRuntimeKeys = keys.filter((key) =>
    key.startsWith(`${CACHE_PREFIX}-runtime-`) && key !== RUNTIME_CACHE
  );

  for (const oldKey of oldRuntimeKeys) {
    try {
      const oldCache = await caches.open(oldKey);
      const requests = await oldCache.keys();

      for (const request of requests) {
        const response = await oldCache.match(request);
        if (response) {
          await runtimeCache.put(request, response);
        }
      }
    } catch (_) {
      // Migracja jest best-effort. W najgorszym razie runtime cache odtworzy się po użyciu.
    }
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(installShell());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();

      await migrateOldRuntimeCaches(keys);

      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && !ACTIVE_CACHE_NAMES.has(key))
          .map((key) => caches.delete(key))
      );

      if ('navigationPreload' in self.registration) {
        try {
          await self.registration.navigationPreload.disable();
        } catch (_) {
          // Ignorujemy – część przeglądarek nie wspiera tej operacji.
        }
      }

      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') return;
  if (!isHttpRequest(request)) return;

  // Safari/Chrome workaround dla certain only-if-cached requests.
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;

  if (shouldBypassCache(request)) return;

  if (isNavigationRequest(request)) {
    event.respondWith(
      (async () => {
        const requestedPath = normalizeNavigationPath(getPathname(request));
        const cachedResponse = await readFromShellCache(request);
        const networkResponsePromise = updateShellFromNetwork(request);

        event.waitUntil(networkResponsePromise.catch(() => undefined));

        if (cachedResponse) {
          return cachedResponse;
        }

        try {
          return await networkResponsePromise;
        } catch (_) {
          return (
            (await readDocumentFromShell(requestedPath)) ||
            ((requestedPath === ROOT_DOCUMENT || getPathname(request) === '/')
              ? await readDocumentFromShell(ROOT_DOCUMENT)
              : undefined) ||
            Response.error()
          );
        }
      })()
    );
    return;
  }

  const shellCacheKey = getShellCacheKeyFromRequest(request);

  if (shellCacheKey) {
    event.respondWith(
      (async () => {
        const cachedResponse =
          (await readFromShellCache(request)) ||
          (await readFromRuntimeCache(request));

        const networkResponsePromise = updateShellFromNetwork(request);
        event.waitUntil(networkResponsePromise.catch(() => undefined));

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
    return;
  }

  event.respondWith(
    (async () => {
      const cachedResponse = await readFromRuntimeCache(request);
      const networkResponsePromise = updateRuntimeFromNetwork(request);

      event.waitUntil(networkResponsePromise.catch(() => undefined));

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
