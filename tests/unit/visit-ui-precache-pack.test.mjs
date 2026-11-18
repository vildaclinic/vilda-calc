import { readFileSync } from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyVisitUIPrecache } from '../../tools/build-visit-ui-precache.mjs';

const built = verifyVisitUIPrecache();
const config = built.config, urls = config.files.map(file => file.url);
const bytes = Buffer.from(built.bytes);
const source = readFileSync(new URL('../../service-worker-kalorii.js', import.meta.url), 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');
function worker({ scope = '/', response, failPut = () => false } = {}) {
  const base = new URL(scope, 'https://vilda.test'), requests = [], writes = [], entries = new Map();
  const key = input => { const url = new URL(typeof input === 'string' ? input : input.url, base); return url.pathname + url.search; };
  const cache = {
    async put(input, value) {
      const path = key(input); if (failPut(path)) throw new Error('cache write failed');
      const copy = value.clone(); await value.arrayBuffer(); entries.set(path, copy); writes.push(path);
    },
    async match(input) { return entries.get(key(input))?.clone(); },
  };
  const self = { location: new URL('service-worker-kalorii.js', base), crypto: webcrypto,
    registration: {}, clients: { claim: async () => {} }, skipWaiting() {}, addEventListener() {} };
  const fetch = async request => {
    requests.push(request);
    const path = new URL(request.url).pathname;
    if (!path.startsWith(base.pathname + 'runtime/visit-ui-precache/precache-')) throw new Error('unexpected individual resource fetch');
    return response ? response(request) : new Response(bytes);
  };
  const execute = new Function('self', 'caches', 'fetch', source + '\nreturn { createVisitUIPrecacheState, createClinicalWorkspacePrecacheState, fetchAndStorePrecacheUrl, VISIT_UI_PRECACHE_PACK, readFromShellCache };');
  const api = execute(self, { open: async () => cache }, fetch);
  const installUI = async (state = api.createVisitUIPrecacheState()) => {
    for (const url of urls) await api.fetchAndStorePrecacheUrl(url, { required: true, visitUIPack: state });
  };
  return { api, cache, requests, writes, installUI };
}

describe('twenty-five independent visit and home UI resources in one verified transport', () => {
  it.each(['/', '/vilda-calc/'])('caches every original body and MIME under its own offline URL in %s', async scope => {
    const w = worker({ scope }); await w.installUI();
    expect(w.api.VISIT_UI_PRECACHE_PACK).toEqual(config);
    expect(urls).toHaveLength(25);
    expect(urls).toContain('/vilda_home_perinatal.js?v=1');
    expect(urls).toContain('/vilda_home_growth.js?v=4');
    expect(urls).toContain('/vilda_sga_birth_results.css?v=1');
    expect(urls).toContain('/vilda_home_growth_views.js?v=5');
    expect(urls).toContain('/vilda_home_growth_views.css?v=6');
    expect(urls).toContain('/vilda_home_growth_charts.js?v=1');
    expect(urls).toContain('/vilda_home_diet.js?v=2');
    expect(urls).toContain('/vilda_home_diet_bmi.css?v=1');
    expect(urls).toContain('/vilda_home_diet.css?v=3');
    expect(urls).toContain('/vilda_home_dialog_history.js?v=1');
    expect(urls).toContain('/vilda_home_patient_data.js?v=2');
    expect(urls).toContain('/vilda_home_patient_note_host.js?v=1');
    expect(urls).toContain('/vilda_home_patient_note_host.css?v=1');
    expect(urls).toContain('/vilda_home_patient.js?v=2');
    expect(urls).toContain('/vilda_home_patient.css?v=2');
    expect(urls).toContain('/vilda_home_patient_native.js?v=1');
    expect(urls).toContain('/vilda_home_patient_native.css?v=1');
    expect(urls).toContain('/vilda_patient_treatment_ui.js?v=1');
    expect(urls).toContain('/vilda_patient_treatment_ui.css?v=1');
    expect(urls).toContain('/vilda_home_patient_native_note.js?v=1');
    expect(urls).toContain('/vilda_home_workspace.js?v=6');
    expect(urls).toContain('/vilda_home_workspace.css?v=7');
    expect(w.requests).toHaveLength(1);
    expect(w.requests[0].url).toBe('https://vilda.test' + scope + config.url.slice(1));
    expect(w.requests[0].cache).toBe('reload'); expect(w.requests[0].redirect).toBe('error');
    expect(w.writes).toEqual(urls);
    for (const url of urls) {
      const response = await w.api.readFromShellCache(new Request('https://vilda.test' + scope + url.slice(1)));
      const original = readFileSync(new URL('../../' + url.slice(1).split('?')[0], import.meta.url));
      expect(Buffer.from(await response.arrayBuffer())).toEqual(original);
      expect(response.headers.get('content-type')).toBe(url.includes('.css?') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8');
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(Number(response.headers.get('content-length'))).toBe(original.byteLength);
    }
    expect(await w.cache.match(config.url)).toBeUndefined();
  });

  it('rechecks the archive for a new install and never uses an unchecked stale asset', async () => {
    const w = worker();
    for (const url of urls) await w.cache.put(url, new Response('old'));
    await w.installUI(); await w.installUI();
    expect(w.requests).toHaveLength(2);
    for (const url of urls) expect(await (await w.cache.match(url)).text()).not.toBe('old');
  });

  it.each(['network', '503', 'truncated', 'wrong digest', 'redirected'])('rejects %s before any member is cached', async failure => {
    const w = worker({ response: () => {
      if (failure === 'network') throw new Error('network unavailable');
      if (failure === '503') return new Response(bytes, { status: 503 });
      if (failure === 'truncated') return new Response(bytes.subarray(0, -1));
      if (failure === 'wrong digest') return new Response(Buffer.concat([bytes, Buffer.from(' ')]));
      const response = new Response(bytes); Object.defineProperty(response, 'redirected', { value: true }); return response;
    } });
    const state = w.api.createVisitUIPrecacheState();
    for (const url of urls) await expect(w.api.fetchAndStorePrecacheUrl(url, { required: true, visitUIPack: state })).rejects.toThrow();
    expect(w.requests).toHaveLength(1); expect(w.writes).toEqual([]);
  });

  it.each([
    ['missing member', value => value.files.pop()],
    ['duplicate member', value => { value.files[2] = value.files[0]; }],
    ['extra member', value => value.files.push(value.files[0])],
    ['wrong body', value => { value.files[2].source += '/* changed */'; }],
    ['wrong home UI body', value => { value.files[3].source += '/* changed */'; }],
    ['wrong member digest', value => { value.files[0].sha256 = '0'.repeat(64); }],
    ['wrong URL', value => { value.files[1].path = 'style.css?v=1'; }],
    ['member MIME override', value => { value.files[2].mime = 'text/javascript'; }],
    ['home UI MIME override', value => { value.files[4].mime = 'text/javascript'; }],
    ['schema change', value => { value.schemaVersion = 2; }],
  ])('rejects %s even with the matching archive hash', async (_name, mutate) => {
    const value = JSON.parse(bytes); mutate(value);
    const corrupt = Buffer.from(JSON.stringify(value)), digest = hash(corrupt);
    const w = worker({ response: () => new Response(corrupt) });
    const state = w.api.createVisitUIPrecacheState({ ...config, sha256: digest,
      url: '/runtime/visit-ui-precache/precache-' + digest.slice(0, 12) + '.json' });
    await expect(w.installUI(state)).rejects.toThrow(); expect(w.writes).toEqual([]);
  });

  it('keeps both fixed resource allowlists separate', () => {
    const w = worker();
    expect(() => w.api.createClinicalWorkspacePrecacheState(config)).toThrow();
    const changed = structuredClone(config); changed.files[0].url = '/style.css?v=1';
    expect(() => w.api.createVisitUIPrecacheState(changed)).toThrow();
    const mime = structuredClone(config); mime.files[2].mime = 'text/javascript';
    expect(() => w.api.createVisitUIPrecacheState(mime)).toThrow();
    expect(() => w.api.createVisitUIPrecacheState({ ...config, url: 'https://other.test/archive.json' })).toThrow();
  });

  it('fails on a required cache write and fetches afresh on the next install', async () => {
    let failing = true;
    const w = worker({ failPut: url => failing && url === urls[0] });
    await expect(w.installUI()).rejects.toThrow('cache write failed'); expect(w.writes).toEqual([]);
    failing = false; await w.installUI(); expect(w.requests).toHaveLength(2); expect(w.writes).toEqual(urls);
  });
});
