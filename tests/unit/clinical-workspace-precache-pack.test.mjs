import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SW_SOURCE = fs.readFileSync(path.join(ROOT, 'service-worker-kalorii.js'), 'utf8');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, 'runtime/clinical-workspace-v1/manifest.json'), 'utf8'));
const PACK_BYTES = fs.readFileSync(path.join(ROOT, MANIFEST.precachePack.path));
const PACK_URL = '/' + MANIFEST.precachePack.path;
const MODULE_URLS = MANIFEST.files.map(file => '/' + file.path);
const MODULES = new Set(MODULE_URLS);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

// Execute the production worker, including install.waitUntil and cache lookup.
// Cache.put consumes its response just as the browser does. The network serves
// the real built archive; a direct request for any packed module is an error.
function worker({ scope = '/', packResponse, failPut = () => false } = {}) {
  const base = new URL(scope, 'https://vilda.test');
  const requests = [], writes = [], stores = new Map(), listeners = new Map();
  const key = value => {
    const url = new URL(typeof value === 'string' ? value : value.url, base);
    return url.pathname + url.search;
  };
  const caches = {
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
    async open(name) {
      if (!stores.has(name)) {
        const entries = new Map();
        stores.set(name, {
          entries,
          async put(address, response) {
            const url = key(address);
            if (failPut(url)) throw new Error('cache write failed');
            const copy = response.clone();
            await response.arrayBuffer();
            entries.set(url, copy);
            writes.push(url);
          },
          async match(address) { return entries.get(key(address))?.clone(); },
          async keys() { return [...entries.keys()].map(url => new Request(new URL(url, base))); },
          async delete(address) { return entries.delete(key(address)); },
        });
      }
      return stores.get(name);
    },
  };
  const fetch = async request => {
    requests.push(request);
    const url = new URL(request.url);
    const relative = '/' + url.pathname.slice(base.pathname.length);
    if (relative === PACK_URL) return packResponse ? packResponse(request) : new Response(PACK_BYTES);
    if (MODULES.has(relative)) throw new Error('unexpected individual module fetch');
    return new Response('/* independent static resource */');
  };
  const self = {
    location: new URL('service-worker-kalorii.js', base), crypto: webcrypto,
    registration: {}, clients: { claim: async () => {} }, skipWaiting() {},
    addEventListener(type, callback) { listeners.set(type, callback); },
  };
  const sw = new Function('self', 'caches', 'fetch', `${SW_SOURCE}
    return { installShell, readFromShellCache, createClinicalWorkspacePrecacheState,
      fetchAndStorePrecacheUrl, CLINICAL_WORKSPACE_PRECACHE_PACK, INSTALL_CORE_URLS, SHELL_CACHE };`)(self, caches, fetch);
  const installEvent = () => {
    let pending;
    listeners.get('install')({ waitUntil(promise) { pending = promise; } });
    return pending;
  };
  return { sw, caches, requests, writes, installEvent };
}

describe('clinical workspace immutable precache transport', () => {
  it('pins the exact built archive and every original required module URL independently of the loader', () => {
    const { sw } = worker();
    expect(sw.CLINICAL_WORKSPACE_PRECACHE_PACK).toEqual({
      url: PACK_URL, sha256: MANIFEST.precachePack.sha256,
      files: MANIFEST.files.map(file => ({ url: '/' + file.path, sha256: file.sha256 })),
    });
    expect(digest(PACK_BYTES)).toBe(MANIFEST.precachePack.sha256);
    expect(PACK_BYTES.length).toBe(MANIFEST.precachePack.byteLength);
    expect(MODULE_URLS).toHaveLength(49);
    for (const url of MODULE_URLS) expect(sw.INSTALL_CORE_URLS).toContain(url);
    expect(sw.INSTALL_CORE_URLS).not.toContain(PACK_URL);
  });

  it.each(['/', '/vilda-calc/'])('installs every exact module body and resolves scoped offline requests under %s', async scope => {
    const { sw, caches, requests, writes, installEvent } = worker({ scope });
    await installEvent();
    const archiveRequests = requests.filter(request => request.url.endsWith(PACK_URL));
    expect(archiveRequests).toHaveLength(1);
    expect(archiveRequests[0].url).toBe('https://vilda.test' + scope + PACK_URL.slice(1));
    expect(archiveRequests[0].cache).toBe('reload');
    expect(archiveRequests[0].redirect).toBe('error');
    expect(writes.filter(url => MODULES.has(url))).toEqual(MODULE_URLS);
    const cache = await caches.open(sw.SHELL_CACHE);
    expect(await cache.match(PACK_URL)).toBeUndefined();
    for (const file of MANIFEST.files) {
      const response = await sw.readFromShellCache(new Request('https://vilda.test' + scope + file.path));
      const original = fs.readFileSync(path.join(ROOT, file.path));
      expect(response, file.path).toBeDefined();
      expect(response.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
      expect(Number(response.headers.get('content-length'))).toBe(original.byteLength);
      expect(Buffer.from(await response.arrayBuffer()), file.path).toEqual(original);
    }
  });

  it('fetches a fresh archive per install and never reuses unchecked module bodies from an older cache', async () => {
    const { sw, caches, requests, installEvent } = worker();
    const previous = await caches.open('pwa-kalorii-shell-1.1.488');
    for (const url of MODULE_URLS) await previous.put(url, new Response('/* stale module */'));
    await installEvent();
    await installEvent();
    expect(requests.filter(request => request.url.endsWith(PACK_URL))).toHaveLength(2);
    const cached = await sw.readFromShellCache(new Request('https://vilda.test' + MODULE_URLS[0]));
    expect(Buffer.from(await cached.arrayBuffer())).toEqual(fs.readFileSync(path.join(ROOT, MANIFEST.files[0].path)));
  });

  it.each(['network', '503', 'truncated', 'changed bytes', 'redirected'])('rejects install.waitUntil before the first module write on %s', async failure => {
    const packResponse = () => {
      if (failure === 'network') throw new TypeError('network unavailable');
      if (failure === '503') return new Response(PACK_BYTES, { status: 503 });
      if (failure === 'truncated') return new Response(PACK_BYTES.subarray(0, -1));
      if (failure === 'changed bytes') return new Response(Buffer.concat([PACK_BYTES, Buffer.from(' ')]));
      const response = new Response(PACK_BYTES);
      Object.defineProperty(response, 'redirected', { value: true });
      return response;
    };
    const { requests, writes, installEvent } = worker({ packResponse });
    await expect(installEvent()).rejects.toThrow();
    expect(writes.filter(url => MODULES.has(url))).toEqual([]);
    expect(requests.filter(request => request.url.endsWith(PACK_URL))).toHaveLength(1);
    expect(requests.some(request => MODULES.has(new URL(request.url).pathname))).toBe(false);
  });

  // Give a corrupted archive its matching outer digest to exercise the member
  // boundary independently: the pinned original module digests stay unchanged.
  it.each([
    ['missing member', pack => { pack.files.pop(); }],
    ['extra member', pack => { pack.files.push(pack.files[0]); }],
    ['duplicate member', pack => { pack.files[pack.files.length - 1] = pack.files[0]; }],
    ['absolute URL', pack => { pack.files[0].path = 'https://other.test/module.mjs'; }],
    ['parent path', pack => { pack.files[0].path = '../module.mjs'; }],
    ['wrong member digest', pack => { pack.files[0].sha256 = '0'.repeat(64); }],
    ['changed last source', pack => { pack.files[pack.files.length - 1].source += '\n// changed'; }],
    ['non-string source', pack => { pack.files[0].source = {}; }],
    ['unknown file property', pack => { pack.files[0].extra = true; }],
    ['unknown root property', pack => { pack.extra = true; }],
    ['unsupported schema', pack => { pack.schemaVersion = 2; }],
  ])('rejects %s before caching any otherwise valid earlier member', async (_name, mutate) => {
    const pack = JSON.parse(PACK_BYTES);
    mutate(pack);
    const bytes = Buffer.from(JSON.stringify(pack));
    const { sw, writes } = worker({ packResponse: () => new Response(bytes) });
    const config = { ...sw.CLINICAL_WORKSPACE_PRECACHE_PACK, sha256: digest(bytes) };
    const state = sw.createClinicalWorkspacePrecacheState(config);
    await expect(sw.fetchAndStorePrecacheUrl(MODULE_URLS[0], {
      required: true, clinicalWorkspacePack: state,
    })).rejects.toThrow();
    expect(writes).toEqual([]);
  });

  it('keeps a failed pack rejected within one install instead of fetching it again or falling back', async () => {
    const { sw, requests, writes } = worker({ packResponse: () => new Response('corrupt') });
    const state = sw.createClinicalWorkspacePrecacheState();
    for (const url of MODULE_URLS.slice(0, 2)) {
      await expect(sw.fetchAndStorePrecacheUrl(url, { required: true, clinicalWorkspacePack: state })).rejects.toThrow();
    }
    expect(requests).toHaveLength(1);
    expect(writes).toEqual([]);
  });

  it('rejects required installation on a module cache write failure and fetches afresh for the retry', async () => {
    let failing = true;
    const { requests, writes, installEvent } = worker({ failPut: url => failing && url === MODULE_URLS[0] });
    await expect(installEvent()).rejects.toThrow('cache write failed');
    expect(writes.filter(url => MODULES.has(url))).toEqual([]);
    failing = false;
    await installEvent();
    expect(requests.filter(request => request.url.endsWith(PACK_URL))).toHaveLength(2);
    expect(writes.filter(url => MODULES.has(url))).toEqual(MODULE_URLS);
  });
});
