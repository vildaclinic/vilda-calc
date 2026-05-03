#!/usr/bin/env node
'use strict';

/*
 * Vilda 8O-11i — Service Worker offline/update-flow + versioned shell cache-key + runtime cache TTL/max-entry pruning smoke.
 *
 * This runner executes service-worker-kalorii.js in a controlled Node VM with
 * mocked Cache API, fetch(), clients, registration and ServiceWorker events.
 * It does not register a real Service Worker, does not touch browser storage,
 * does not change clinical data and validates versioned shell cache keys, stale cache pruning scope and runtime cache TTL/max-entry pruning in a mock cache.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DEFAULT_ORIGIN = 'https://vilda.test';
const ROOT = path.resolve(__dirname, '..');
const SERVICE_WORKER_FILE = path.join(ROOT, 'service-worker-kalorii.js');

class TestHeaders {
  constructor(init) {
    this._map = new Map();
    if (init instanceof TestHeaders) {
      init.forEach((value, key) => this.set(key, value));
    } else if (init && typeof init.forEach === 'function') {
      init.forEach((value, key) => this.set(key, value));
    } else if (Array.isArray(init)) {
      init.forEach(([key, value]) => this.set(key, value));
    } else if (init && typeof init === 'object') {
      Object.keys(init).forEach((key) => this.set(key, init[key]));
    }
  }
  _key(key) { return String(key || '').toLowerCase(); }
  get(key) {
    const entry = this._map.get(this._key(key));
    return entry ? entry.value : null;
  }
  has(key) { return this._map.has(this._key(key)); }
  set(key, value) { this._map.set(this._key(key), { key: String(key), value: String(value) }); }
  delete(key) { this._map.delete(this._key(key)); }
  forEach(fn) { this._map.forEach((entry) => fn(entry.value, entry.key, this)); }
}

class TestRequest {
  constructor(input, init) {
    const opts = init || {};
    const source = input && typeof input === 'object' && input.url ? input : null;
    const rawUrl = source ? source.url : String(input || '/');
    this.url = new URL(rawUrl, DEFAULT_ORIGIN).href;
    this.method = String(opts.method || (source && source.method) || 'GET').toUpperCase();
    this.mode = opts.mode || (source && source.mode) || 'cors';
    this.credentials = opts.credentials || (source && source.credentials) || 'same-origin';
    this.redirect = opts.redirect || (source && source.redirect) || 'follow';
    this.cache = opts.cache || (source && source.cache) || 'default';
    this.destination = opts.destination || (source && source.destination) || '';
    this.headers = new TestHeaders(opts.headers || (source && source.headers) || undefined);
  }
  clone() { return new TestRequest(this); }
}

function absoluteUrl(input, origin) {
  const raw = input && typeof input === 'object' && input.url ? input.url : String(input || '/');
  return new URL(raw, origin || DEFAULT_ORIGIN).href;
}

function requestCacheKey(input, options) {
  const opts = options || {};
  const raw = input && typeof input === 'object' && input.url ? input.url : String(input || '/');
  const url = new URL(raw, DEFAULT_ORIGIN);
  if (typeof input === 'string' && input.charAt(0) === '/') {
    return opts.ignoreSearch ? url.pathname : `${url.pathname}${url.search}`;
  }
  return opts.ignoreSearch ? `${url.origin}${url.pathname}` : url.href;
}

function normalizeStoredKeyForIgnoreSearch(key) {
  const url = new URL(key, DEFAULT_ORIGIN);
  if (String(key).charAt(0) === '/') return url.pathname;
  return `${url.origin}${url.pathname}`;
}

class MemoryCache {
  constructor(name) {
    this.name = name;
    this._entries = new Map();
  }
  async put(requestOrKey, response) {
    this._entries.set(requestCacheKey(requestOrKey), response.clone());
  }
  async match(requestOrKey, options) {
    const opts = options || {};
    const exactKey = requestCacheKey(requestOrKey);
    if (this._entries.has(exactKey)) return this._entries.get(exactKey).clone();
    if (opts.ignoreSearch) {
      const ignoreKey = requestCacheKey(requestOrKey, { ignoreSearch: true });
      for (const [storedKey, response] of this._entries.entries()) {
        if (normalizeStoredKeyForIgnoreSearch(storedKey) === ignoreKey) return response.clone();
      }
    }
    return undefined;
  }
  async delete(requestOrKey) { return this._entries.delete(requestCacheKey(requestOrKey)); }
  async keys() {
    return Array.from(this._entries.keys()).map((key) => new TestRequest(key));
  }
  dumpKeys() { return Array.from(this._entries.keys()).sort(); }
}

class MemoryCacheStorage {
  constructor() {
    this._caches = new Map();
  }
  async open(name) {
    if (!this._caches.has(name)) this._caches.set(name, new MemoryCache(name));
    return this._caches.get(name);
  }
  async keys() { return Array.from(this._caches.keys()).sort(); }
  async delete(name) { return this._caches.delete(name); }
  cache(name) { return this._caches.get(name); }
}

function createExtendableEvent(extra) {
  const waitUntilPromises = [];
  return Object.assign({
    waitUntil(promise) { waitUntilPromises.push(Promise.resolve(promise)); },
    async flushWaitUntil() {
      const settled = await Promise.allSettled(waitUntilPromises);
      const rejected = settled.find((item) => item.status === 'rejected');
      if (rejected) throw rejected.reason;
      return settled;
    },
    waitUntilCount() { return waitUntilPromises.length; }
  }, extra || {});
}

function createFetchEvent(request) {
  let responsePromise = null;
  const event = createExtendableEvent({
    request,
    respondWith(promise) { responsePromise = Promise.resolve(promise); },
    hasRespondWith() { return !!responsePromise; },
    async response() { return responsePromise ? responsePromise : undefined; }
  });
  return event;
}

async function responseText(response) {
  if (!response) return null;
  if (typeof response.text === 'function') return response.clone().text();
  return null;
}

function makeResponse(body, options) {
  return new Response(body, Object.assign({ status: 200, headers: { 'content-type': 'text/plain' } }, options || {}));
}

function createNetwork(origin) {
  const calls = [];
  const bodies = new Map();
  const failures = new Set();
  let offline = false;

  function keyFor(input) {
    const url = new URL(absoluteUrl(input, origin));
    return `${url.pathname}${url.search}`;
  }

  function setBody(pathnameWithSearch, body) { bodies.set(pathnameWithSearch, body); }
  function fail(pathnameWithSearch) { failures.add(pathnameWithSearch); }
  function clearFailures() { failures.clear(); }
  function setOffline(value) { offline = !!value; }
  function callCount(pathnamePrefix) {
    return calls.filter((item) => !pathnamePrefix || item.path.startsWith(pathnamePrefix)).length;
  }

  async function fetchMock(input) {
    const key = keyFor(input);
    calls.push({ path: key, method: input && input.method ? input.method : 'GET' });
    if (offline || failures.has(key)) {
      throw new Error(`mock network offline for ${key}`);
    }
    const body = bodies.has(key) ? bodies.get(key) : `network:${key}`;
    return makeResponse(body, { status: 200 });
  }

  return { fetchMock, setBody, fail, clearFailures, setOffline, callCount, calls };
}

function extractSwVersion(source) {
  const match = source.match(/const\s+SW_VERSION\s*=\s*'([^']+)'/);
  return match ? match[1] : null;
}

function shellCacheName(version) { return `pwa-kalorii-shell-v${version}`; }
function runtimeCacheName() { return 'pwa-kalorii-runtime'; }
function extractNumericConst(source, name) {
  const pattern = new RegExp(`const\\s+${name}\\s*=\\s*([0-9]+)\\s*;`);
  const match = source.match(pattern);
  return match ? Number(match[1]) : null;
}
function isRuntimeMetadataKey(key) { return String(key || '').indexOf('/__vilda_runtime_cache_metadata__/') >= 0; }
function runtimeContentKeys(keys) { return (keys || []).filter((key) => !isRuntimeMetadataKey(key)); }
function runtimeMetadataKeys(keys) { return (keys || []).filter(isRuntimeMetadataKey); }

async function dispatch(listenerList, event) {
  (listenerList || []).forEach((listener) => listener(event));
  return event;
}

function createServiceWorkerHarness() {
  const source = fs.readFileSync(SERVICE_WORKER_FILE, 'utf8');
  const swVersion = extractSwVersion(source);
  const listeners = { install: [], activate: [], fetch: [], message: [] };
  const caches = new MemoryCacheStorage();
  const network = createNetwork(DEFAULT_ORIGIN);
  const flags = { skipWaitingCalled: 0, clientsClaimCalled: 0, navigationPreloadDisableCalled: 0 };
  let currentTimeMs = 1700000000000;
  const DateMock = { now() { return currentTimeMs; } };

  const self = {
    location: { origin: DEFAULT_ORIGIN, href: `${DEFAULT_ORIGIN}/service-worker-kalorii.js` },
    addEventListener(type, listener) {
      listeners[type] = listeners[type] || [];
      listeners[type].push(listener);
    },
    skipWaiting() { flags.skipWaitingCalled += 1; return Promise.resolve(); },
    clients: { claim() { flags.clientsClaimCalled += 1; return Promise.resolve(); } },
    registration: {
      navigationPreload: { disable() { flags.navigationPreloadDisableCalled += 1; return Promise.resolve(); } }
    }
  };

  const context = {
    self,
    caches,
    fetch: network.fetchMock,
    Request: TestRequest,
    Response,
    Headers: TestHeaders,
    URL,
    Promise,
    Error,
    Set,
    Map,
    Object,
    Array,
    String,
    Number,
    Boolean,
    RegExp,
    Date: DateMock,
    encodeURIComponent,
    decodeURIComponent,
    console
  };
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: SERVICE_WORKER_FILE });

  async function install() {
    const event = await dispatch(listeners.install, createExtendableEvent());
    await event.flushWaitUntil();
    return event;
  }
  async function activate() {
    const event = await dispatch(listeners.activate, createExtendableEvent());
    await event.flushWaitUntil();
    return event;
  }
  async function fetchEvent(request) {
    const event = await dispatch(listeners.fetch, createFetchEvent(request));
    const response = event.hasRespondWith() ? await event.response() : undefined;
    return { event, response };
  }
  async function fetchAndFlush(request) {
    const event = await dispatch(listeners.fetch, createFetchEvent(request));
    const response = event.hasRespondWith() ? await event.response() : undefined;
    await event.flushWaitUntil();
    return { event, response };
  }
  async function message(data) {
    const event = await dispatch(listeners.message, { data });
    return event;
  }

  function advanceTime(ms) { currentTimeMs += Number(ms) || 0; }
  function setTime(ms) { currentTimeMs = Number(ms) || currentTimeMs; }

  return { source, swVersion, listeners, caches, network, flags, install, activate, fetchEvent, fetchAndFlush, message, advanceTime, setTime };
}

function addCheck(checks, id, ok, details) {
  checks.push({ id, ok: !!ok, details: details || null });
}

async function runServiceWorkerOfflineUpdateFlowSmoke(options) {
  const opts = options || {};
  const checks = [];
  const harness = createServiceWorkerHarness();
  const version = harness.swVersion;
  const shellName = shellCacheName(version);
  const runtimeName = runtimeCacheName();
  const runtimeMaxEntries = extractNumericConst(harness.source, 'RUNTIME_CACHE_MAX_ENTRIES') || 96;
  const runtimeTtlMs = 30 * 24 * 60 * 60 * 1000;

  addCheck(checks, 'service-worker-script-version-detected', !!version, { version });
  addCheck(checks, 'service-worker-listeners-registered',
    ['install', 'activate', 'fetch', 'message'].every((type) => harness.listeners[type] && harness.listeners[type].length === 1),
    Object.fromEntries(Object.keys(harness.listeners).map((type) => [type, harness.listeners[type].length])));

  const currentRuntimeBeforeActivate = await harness.caches.open(runtimeName);
  await currentRuntimeBeforeActivate.put(new TestRequest('/current-runtime.json'), makeResponse('current-runtime-before-activate'));
  const oldRuntime = await harness.caches.open('pwa-kalorii-runtime-v0.9.old');
  await oldRuntime.put(new TestRequest('/legacy-runtime.json'), makeResponse('legacy-runtime-v1'));
  await harness.caches.open('pwa-kalorii-shell-v0.0.old');
  await harness.caches.open('pwa-kalorii-shell-v0.9.399');
  const unrelatedCacheBeforeActivate = await harness.caches.open('external-cache');
  await unrelatedCacheBeforeActivate.put(new TestRequest('/external.txt'), makeResponse('external-cache-preserved'));
  harness.network.fail('/normy-02.01.pdf'); // optional precache asset; install must continue.

  await harness.install();
  const shellCache = harness.caches.cache(shellName);
  const installedIndex = shellCache ? await shellCache.match('/index.html') : null;
  const installedStyle = shellCache ? await shellCache.match('/style.css') : null;
  addCheck(checks, 'install-required-shell-precache', !!(installedIndex && installedStyle), {
    shellName,
    hasIndex: !!installedIndex,
    hasStyle: !!installedStyle,
    optionalFailurePath: '/normy-02.01.pdf'
  });

  const installedAppVersioned = shellCache ? await shellCache.match('/app.js?v=150') : null;
  const installedAppUnversioned = shellCache ? await shellCache.match('/app.js') : null;
  const installedSmokeVersioned = shellCache ? await shellCache.match('/vilda_smoke_tests.js?v=25') : null;
  addCheck(checks, 'install-versioned-shell-cache-key-precache',
    !!installedAppVersioned && !!installedAppUnversioned && !!installedSmokeVersioned &&
      await responseText(installedAppVersioned) === 'network:/app.js?v=150' &&
      await responseText(installedAppUnversioned) === 'network:/app.js' &&
      await responseText(installedSmokeVersioned) === 'network:/vilda_smoke_tests.js?v=25',
    {
      shellName,
      appVersionedText: await responseText(installedAppVersioned),
      appUnversionedText: await responseText(installedAppUnversioned),
      smokeVersionedText: await responseText(installedSmokeVersioned)
    });

  await harness.activate();
  const cacheKeysAfterActivate = await harness.caches.keys();
  const runtimeCache = harness.caches.cache(runtimeName);
  const migratedLegacy = runtimeCache ? await runtimeCache.match(new TestRequest('/legacy-runtime.json')) : null;
  addCheck(checks, 'activate-migrates-runtime-and-prunes-old-caches',
    cacheKeysAfterActivate.includes(shellName) && cacheKeysAfterActivate.includes(runtimeName) &&
      !cacheKeysAfterActivate.includes('pwa-kalorii-runtime-v0.9.old') &&
      !cacheKeysAfterActivate.includes('pwa-kalorii-shell-v0.0.old') &&
      !cacheKeysAfterActivate.includes('pwa-kalorii-shell-v0.9.399') &&
      !!migratedLegacy && harness.flags.clientsClaimCalled === 1 && harness.flags.navigationPreloadDisableCalled === 1,
    { cacheKeysAfterActivate, clientsClaimCalled: harness.flags.clientsClaimCalled, navigationPreloadDisableCalled: harness.flags.navigationPreloadDisableCalled });

  const preservedCurrentRuntime = runtimeCache ? await runtimeCache.match(new TestRequest('/current-runtime.json')) : null;
  const preservedUnrelated = harness.caches.cache('external-cache') ? await harness.caches.cache('external-cache').match(new TestRequest('/external.txt')) : null;
  const stalePrefixedCachesAfterActivate = cacheKeysAfterActivate.filter((key) =>
    key.startsWith('pwa-kalorii-shell-v') && key !== shellName || key.startsWith('pwa-kalorii-runtime-')
  );
  addCheck(checks, 'activate-stale-cache-pruning-scope-audit',
    stalePrefixedCachesAfterActivate.length === 0 &&
      await responseText(preservedCurrentRuntime) === 'current-runtime-before-activate' &&
      await responseText(preservedUnrelated) === 'external-cache-preserved',
    { cacheKeysAfterActivate, stalePrefixedCachesAfterActivate, currentRuntimeText: await responseText(preservedCurrentRuntime), unrelatedText: await responseText(preservedUnrelated) });

  harness.network.clearFailures();
  harness.network.setBody('/', 'network-index-v2');
  const navigationCached = await harness.fetchEvent(new TestRequest('/', { mode: 'navigate' }));
  const navigationCachedText = await responseText(navigationCached.response);
  await navigationCached.event.flushWaitUntil();
  const navigationCacheAfterRefresh = shellCache ? await shellCache.match('/index.html') : null;
  addCheck(checks, 'navigation-cache-first-background-refresh',
    navigationCached.event.hasRespondWith() === true && navigationCached.event.waitUntilCount() === 1 &&
      navigationCachedText === 'network:/index.html' &&
      await responseText(navigationCacheAfterRefresh) === 'network-index-v2',
    { returnedText: navigationCachedText, refreshedText: await responseText(navigationCacheAfterRefresh), waitUntilCount: navigationCached.event.waitUntilCount() });

  harness.network.setOffline(true);
  const navigationOffline = await harness.fetchAndFlush(new TestRequest('/kontakt', { mode: 'navigate' }));
  const navigationOfflineText = await responseText(navigationOffline.response);
  addCheck(checks, 'navigation-offline-document-fallback',
    navigationOffline.event.hasRespondWith() === true && navigationOfflineText === 'network:/kontakt.html',
    { returnedText: navigationOfflineText, request: '/kontakt', normalizedDocument: '/kontakt.html' });
  harness.network.setOffline(false);

  harness.network.setBody('/style.css', 'style-v2');
  const shellAsset = await harness.fetchEvent(new TestRequest('/style.css'));
  const shellAssetText = await responseText(shellAsset.response);
  await shellAsset.event.flushWaitUntil();
  const shellAssetAfterRefresh = shellCache ? await shellCache.match('/style.css') : null;
  addCheck(checks, 'shell-asset-cache-first-background-refresh',
    typeof shellAssetText === 'string' && shellAssetText.indexOf('network:/style.css') === 0 && shellAssetText !== 'style-v2' && await responseText(shellAssetAfterRefresh) === 'style-v2',
    { returnedText: shellAssetText, refreshedText: await responseText(shellAssetAfterRefresh), waitUntilCount: shellAsset.event.waitUntilCount() });

  harness.network.setOffline(true);
  const versionedShellOffline = await harness.fetchAndFlush(new TestRequest('/app.js?v=150'));
  const versionedShellOfflineText = await responseText(versionedShellOffline.response);
  addCheck(checks, 'versioned-shell-asset-offline-cache-hit',
    versionedShellOffline.event.hasRespondWith() === true && versionedShellOffline.event.waitUntilCount() === 1 &&
      versionedShellOfflineText === 'network:/app.js?v=150',
    { returnedText: versionedShellOfflineText, request: '/app.js?v=150', waitUntilCount: versionedShellOffline.event.waitUntilCount() });
  harness.network.setOffline(false);

  harness.network.setBody('/api/runtime.json?rev=1', 'runtime-v1');
  const runtimeMiss = await harness.fetchAndFlush(new TestRequest('/api/runtime.json?rev=1'));
  const runtimeMissText = await responseText(runtimeMiss.response);
  harness.network.setBody('/api/runtime.json?rev=1', 'runtime-v2');
  const runtimeHit = await harness.fetchEvent(new TestRequest('/api/runtime.json?rev=1'));
  const runtimeHitText = await responseText(runtimeHit.response);
  await runtimeHit.event.flushWaitUntil();
  const runtimeAfterRefresh = runtimeCache ? await runtimeCache.match(new TestRequest('/api/runtime.json?rev=1')) : null;
  addCheck(checks, 'runtime-cache-first-background-refresh',
    runtimeMissText === 'runtime-v1' && runtimeHitText === 'runtime-v1' && await responseText(runtimeAfterRefresh) === 'runtime-v2',
    { firstResponse: runtimeMissText, secondResponse: runtimeHitText, refreshedText: await responseText(runtimeAfterRefresh), waitUntilCount: runtimeHit.event.waitUntilCount() });

  harness.network.setOffline(true);
  const runtimeOfflineHit = await harness.fetchAndFlush(new TestRequest('/api/runtime.json?rev=1'));
  const runtimeOfflineText = await responseText(runtimeOfflineHit.response);
  addCheck(checks, 'runtime-offline-cache-hit-fallback', runtimeOfflineText === 'runtime-v2', { returnedText: runtimeOfflineText });
  harness.network.setOffline(false);

  const runtimeCacheKeysAfterRuntimeFetch = runtimeCache ? runtimeCache.dumpKeys() : [];
  const runtimeContentKeysAfterRuntimeFetch = runtimeContentKeys(runtimeCacheKeysAfterRuntimeFetch);
  const runtimeMetadataKeysAfterRuntimeFetch = runtimeMetadataKeys(runtimeCacheKeysAfterRuntimeFetch);
  addCheck(checks, 'runtime-cache-metadata-written',
    harness.source.includes('RUNTIME_CACHE_MAX_ENTRIES') &&
      harness.source.includes('RUNTIME_CACHE_TTL_MS') &&
      harness.source.includes('function pruneRuntimeCache') &&
      runtimeContentKeysAfterRuntimeFetch.some((key) => key.indexOf('/api/runtime.json?rev=1') >= 0) &&
      runtimeMetadataKeysAfterRuntimeFetch.some((key) => key.indexOf('runtime.json') >= 0),
    { runtimeContentKeysAfterRuntimeFetch, runtimeMetadataKeysAfterRuntimeFetch, runtimeCachePruningImplemented: true, runtimeCachePruningRecommendedFollowUp: false });

  harness.network.setBody('/api/ttl-expire.json', 'runtime-ttl-live');
  const ttlLive = await harness.fetchAndFlush(new TestRequest('/api/ttl-expire.json'));
  const ttlLiveText = await responseText(ttlLive.response);
  harness.advanceTime(runtimeTtlMs + 1);
  harness.network.setOffline(true);
  const ttlExpired = await harness.fetchAndFlush(new TestRequest('/api/ttl-expire.json'));
  const runtimeCacheKeysAfterTtl = runtimeCache ? runtimeCache.dumpKeys() : [];
  addCheck(checks, 'runtime-cache-ttl-expired-entry-pruned',
    ttlLiveText === 'runtime-ttl-live' &&
      ttlExpired.response && ttlExpired.response.type === 'error' &&
      !runtimeCacheKeysAfterTtl.some((key) => key.indexOf('/api/ttl-expire.json') >= 0) &&
      !runtimeCacheKeysAfterTtl.some((key) => key.indexOf('ttl-expire') >= 0 && isRuntimeMetadataKey(key)),
    { ttlLiveText, expiredResponseType: ttlExpired.response && ttlExpired.response.type, runtimeCacheKeysAfterTtl, runtimeTtlMs });
  harness.network.setOffline(false);

  for (let i = 0; i < runtimeMaxEntries + 8; i += 1) {
    harness.advanceTime(1);
    const url = `/api/prune-${i}.json`;
    harness.network.setBody(url, `runtime-prune-${i}`);
    await harness.fetchAndFlush(new TestRequest(url));
  }
  const runtimeCacheKeysAfterMaxPrune = runtimeCache ? runtimeCache.dumpKeys() : [];
  const runtimeContentKeysAfterMaxPrune = runtimeContentKeys(runtimeCacheKeysAfterMaxPrune);
  const runtimeMetadataKeysAfterMaxPrune = runtimeMetadataKeys(runtimeCacheKeysAfterMaxPrune);
  addCheck(checks, 'runtime-cache-max-entry-prune',
    runtimeContentKeysAfterMaxPrune.length <= runtimeMaxEntries &&
      runtimeMetadataKeysAfterMaxPrune.length === runtimeContentKeysAfterMaxPrune.length &&
      !runtimeContentKeysAfterMaxPrune.some((key) => key.indexOf('/api/prune-0.json') >= 0) &&
      runtimeContentKeysAfterMaxPrune.some((key) => key.indexOf(`/api/prune-${runtimeMaxEntries + 7}.json`) >= 0),
    {
      runtimeMaxEntries,
      contentCount: runtimeContentKeysAfterMaxPrune.length,
      metadataCount: runtimeMetadataKeysAfterMaxPrune.length,
      oldestPruneEntryPresent: runtimeContentKeysAfterMaxPrune.some((key) => key.indexOf('/api/prune-0.json') >= 0),
      newestPruneEntryPresent: runtimeContentKeysAfterMaxPrune.some((key) => key.indexOf(`/api/prune-${runtimeMaxEntries + 7}.json`) >= 0),
      sampleContentKeys: runtimeContentKeysAfterMaxPrune.slice(0, 8)
    });

  const rangeRequest = new TestRequest('/videos/demo.mp4', { headers: { range: 'bytes=0-128' }, destination: 'video' });
  const bypass = await harness.fetchAndFlush(rangeRequest);
  addCheck(checks, 'streaming-range-video-bypass', bypass.event.hasRespondWith() === false && !bypass.response, {
    hasRespondWith: bypass.event.hasRespondWith(),
    responsePresent: !!bypass.response
  });

  await harness.message({ type: 'SKIP_WAITING' });
  addCheck(checks, 'message-skip-waiting-update-flow', harness.flags.skipWaitingCalled === 1, { skipWaitingCalled: harness.flags.skipWaitingCalled });

  const failed = checks.filter((item) => item.ok !== true);
  return {
    ok: failed.length === 0,
    failedCount: failed.length,
    total: checks.length,
    step: '8O-11k',
    name: 'service-worker-offline-update-flow-smoke',
    swVersion: version,
    origin: DEFAULT_ORIGIN,
    checks,
    failed,
    scope: {
      registeredRealServiceWorker: false,
      touchedBrowserCacheApi: false,
      touchedIndexedDb: false,
      changedClinicalData: false,
      changedGhIgfData: false,
      changedServiceWorkerCacheStrategy: false,
      auditedStaleCachePruningScope: true,
      runtimeCachePruningImplemented: true,
      runtimeCachePruningRecommendedFollowUp: false,
      runtimeCacheTtlMs: runtimeTtlMs,
      runtimeCacheMaxEntries: runtimeMaxEntries,
      mockedCacheApiOnly: true
    }
  };
}

if (require.main === module) {
  runServiceWorkerOfflineUpdateFlowSmoke()
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      process.exit(result.ok ? 0 : 1);
    })
    .catch((error) => {
      const result = {
        ok: false,
        failedCount: 1,
        total: 1,
        step: '8O-11k',
        name: 'service-worker-offline-update-flow-smoke',
        error: error && error.stack ? error.stack : String(error)
      };
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      process.exit(1);
    });
}

module.exports = { runServiceWorkerOfflineUpdateFlowSmoke };
