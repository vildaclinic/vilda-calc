import { readFileSync } from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { isolateWorker } from '../../tools/home-preview/export.mjs';

const ROOT = new URL('../../', import.meta.url);
const SOURCE = readFileSync(new URL('service-worker-kalorii.js', ROOT), 'utf8');
const NATIVE_VERSION = SOURCE.match(/const SW_VERSION = '([^']+)';/)[1];
const ORIGIN = 'https://preview.example.invalid';
const OLD_BUILD = 'a'.repeat(20), PREVIOUS_BUILD = 'b'.repeat(20), BUILD = 'c'.repeat(20);
const PREFIX = 'vilda-home-preview-' + BUILD;
const CURRENT_SHELL = PREFIX + '-shell-v' + NATIVE_VERSION + '-preview-' + BUILD;
const CURRENT_RUNTIME = PREFIX + '-runtime';
const PERSIST_VERSION = Math.max(...[...SOURCE.matchAll(/['"]\/vilda_persist_runtime\.js\?v=(\d+)['"]/g)].map(match => Number(match[1])));
const PERSIST_URL = '/vilda_persist_runtime.js?v=' + PERSIST_VERSION;
const HISTORICAL_URL = '/vilda_persist_runtime.js?v=' + (PERSIST_VERSION - 1);
const STALE_ONLY_URL = '/fictional-preview-runtime-only.js?v=1';
const PERSIST_BYTES = readFileSync(new URL('vilda_persist_runtime.js', ROOT));
const hash = value => createHash('sha256').update(value).digest('hex');

// The real worker verifies both archives and every member during installation.
// Other static assets are irrelevant to this cache-ownership regression.
const clinical = JSON.parse(readFileSync(new URL('runtime/clinical-workspace-v1/manifest.json', ROOT)));
const visit = JSON.parse(readFileSync(new URL('runtime/visit-ui-precache/manifest.json', ROOT)));
const PACKS = new Map([clinical.precachePack.path, visit.pack.path].map(path =>
  ['/' + path, readFileSync(new URL(path, ROOT))]));

const OBSOLETE = [
  'vilda-home-preview-shell-v' + NATIVE_VERSION + '-preview-' + OLD_BUILD,
  'vilda-home-preview-runtime',
  'vilda-home-preview-' + PREVIOUS_BUILD + '-shell-v' + NATIVE_VERSION + '-preview-' + PREVIOUS_BUILD,
  'vilda-home-preview-' + PREVIOUS_BUILD + '-runtime',
];
const UNRELATED = [
  'pwa-kalorii-shell-v' + NATIVE_VERSION,
  'pwa-kalorii-runtime',
  'another-application-cache',
  'vilda-home-preview-shell-vinvalid-preview-' + OLD_BUILD,
  'vilda-home-preview-shell-v' + NATIVE_VERSION + '-preview-' + OLD_BUILD + '-backup',
  'vilda-home-preview-runtime-backup',
  'vilda-home-preview-' + PREVIOUS_BUILD + '-shell-v' + NATIVE_VERSION + '-preview-' + OLD_BUILD,
  'vilda-home-preview-' + PREVIOUS_BUILD.toUpperCase() + '-runtime',
];

function memoryCaches() {
  const stores = new Map(), deleted = [];
  const key = input => new URL(typeof input === 'string' ? input : input.url, ORIGIN).href;
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        async put(input, response) {
          const saved = response.clone();
          await response.arrayBuffer();
          entries.set(key(input), saved);
        },
        async match(input) { return entries.get(key(input))?.clone(); },
        async keys() { return [...entries.keys()].map(url => new Request(url)); },
        async delete(input) { return entries.delete(key(input)); },
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { deleted.push(name); return stores.delete(name); },
  };
  async function snapshot(names) {
    const result = {};
    for (const name of names) {
      const entries = stores.get(name);
      result[name] = entries ? await Promise.all([...entries].map(async ([url, response]) =>
        [url, response.status, [...response.headers], await response.clone().text()])) : null;
    }
    return result;
  }
  async function seed() {
    for (const name of [...OBSOLETE, ...UNRELATED]) {
      const cache = await caches.open(name);
      await cache.put(PERSIST_URL, new Response('/* Fictional stale body: ' + name + ' */'));
      // The old worker must retain both versions if the new install fails.
      await cache.put(HISTORICAL_URL, new Response('/* Fictional historical body */'));
      await cache.put(STALE_ONLY_URL, new Response('/* Fictional runtime-only body */'));
    }
  }
  return { caches, snapshot, seed, deleted };
}

function runWorker(storage, { failRequired = false } = {}) {
  const listeners = new Map(), requests = [], forbiddenAccesses = [];
  let offline = false, claims = 0;
  const scope = {
    URL, Request, Response, Headers, TextEncoder, TextDecoder,
    crypto: webcrypto, caches: storage.caches,
    location: new URL('/service-worker-kalorii.js', ORIGIN),
    registration: { navigationPreload: { disable: async () => {} } },
    clients: { claim: async () => { claims++; } },
    skipWaiting() {},
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    async fetch(input) {
      const request = input instanceof Request ? input : new Request(new URL(input, ORIGIN));
      const url = new URL(request.url);
      requests.push({ path: url.pathname + url.search, cache: request.cache, offline });
      if (offline) throw new Error('Fictional network is offline');
      if (failRequired && url.pathname === '/index.html') throw new Error('Fictional required fetch failed');
      const bytes = PACKS.get(url.pathname) || (url.pathname === '/vilda_persist_runtime.js'
        ? PERSIST_BYTES : '/* Fictional current static asset: ' + url.pathname + ' */');
      return new Response(bytes, { headers: { 'Content-Type': 'text/javascript; charset=utf-8' } });
    },
  };
  // self and globalThis are the same object in a real service worker. Record
  // even an access whose thrown exception might be swallowed by native code.
  scope.self = scope;
  for (const name of ['indexedDB', 'localStorage', 'sessionStorage', 'VildaVault']) {
    Object.defineProperty(scope, name, { get() {
      forbiddenAccesses.push(name);
      throw new Error('Preview cache lifecycle must not access ' + name);
    } });
  }
  vm.runInNewContext(isolateWorker(SOURCE, BUILD), scope, { filename: 'exported-preview-worker.js' });

  async function lifecycle(type) {
    const pending = [];
    const callbacks = listeners.get(type) || [];
    expect(callbacks.length).toBeGreaterThan(0);
    for (const callback of callbacks) callback({ waitUntil(value) { pending.push(Promise.resolve(value)); } });
    await Promise.all(pending);
  }
  async function offlineResponse(path) {
    offline = true;
    const pending = [];
    let response;
    const event = { request: new Request(new URL(path, ORIGIN)),
      respondWith(value) { response = Promise.resolve(value); },
      waitUntil(value) { pending.push(Promise.resolve(value)); } };
    for (const callback of listeners.get('fetch') || []) callback(event);
    expect(response, 'the real fetch listener handled the request').toBeDefined();
    const result = await response;
    await Promise.all(pending);
    return result;
  }
  return { lifecycle, offlineResponse, requests, forbiddenAccesses, get claims() { return claims; } };
}

describe('exported preview worker owns caches by build, independently of native ?v=', () => {
  it('installs fresh bytes, activates only its own caches and serves the new same-URL resource offline', async () => {
    const storage = memoryCaches(); await storage.seed();
    const previous = await storage.snapshot([...OBSOLETE, ...UNRELATED]);
    const worker = runWorker(storage);

    await worker.lifecycle('install');
    expect(await storage.snapshot([...OBSOLETE, ...UNRELATED])).toEqual(previous);
    expect(storage.deleted).toEqual([]);
    expect(worker.claims).toBe(0);
    expect(await storage.caches.keys()).toContain(CURRENT_SHELL);
    expect(worker.requests.some(request => request.path.split('?')[0] === '/vilda_persist_runtime.js'
      && request.cache === 'reload')).toBe(true);
    for (const pack of PACKS.keys()) expect(worker.requests.filter(request => request.path === pack)).toHaveLength(1);

    await worker.lifecycle('activate');
    expect(worker.claims).toBe(1);
    expect([...storage.deleted].sort()).toEqual([...OBSOLETE].sort());
    expect(await storage.snapshot(UNRELATED)).toEqual(Object.fromEntries(UNRELATED.map(name => [name, previous[name]])));
    expect(await storage.caches.keys()).toEqual(expect.arrayContaining([CURRENT_SHELL, CURRENT_RUNTIME]));
    expect(await (await storage.caches.open(CURRENT_RUNTIME)).keys()).toEqual([]);

    const count = worker.requests.length;
    const response = await worker.offlineResponse(PERSIST_URL);
    expect(response.status).toBe(200);
    expect(hash(Buffer.from(await response.arrayBuffer()))).toBe(hash(PERSIST_BYTES));
    expect(worker.requests).toHaveLength(count);
    // A unique obsolete runtime entry must not be migrated into this build.
    expect((await worker.offlineResponse(STALE_ONLY_URL)).type).toBe('error');
    expect(await (await storage.caches.open(CURRENT_RUNTIME)).match(STALE_ONLY_URL)).toBeUndefined();
    expect(worker.forbiddenAccesses).toEqual([]);
  });

  it('a failed required install leaves every old cache and its historical entries intact', async () => {
    const storage = memoryCaches(); await storage.seed();
    const before = await storage.snapshot([...OBSOLETE, ...UNRELATED]);
    const worker = runWorker(storage, { failRequired: true });

    await expect(worker.lifecycle('install')).rejects.toThrow('Fictional required fetch failed');
    expect(worker.claims).toBe(0);
    expect(storage.deleted).toEqual([]);
    expect(await storage.snapshot([...OBSOLETE, ...UNRELATED])).toEqual(before);
    expect(worker.forbiddenAccesses).toEqual([]);
  });
});
