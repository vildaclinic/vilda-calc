import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Real sync encryption/download/ETag logic; fictional vault and HTTP endpoints.
// Vault hydration itself is covered against real encrypted stores in care-plans-vault.
const SLOT = 'c'.repeat(64);
function storage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key), key: index => [...values.keys()][index] ?? null,
    get length() { return values.size; } };
}
async function fixture({ cloudOnly = false, hasAPI = true } = {}) {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const payload = { patients: [{ patientId: 'fictional-care-patient' }], patientNotes: [{
    id: 'care-plan-fictional', patientId: 'fictional-care-patient', category: 'care-plan', title: 'Fikcyjny plan kontroli',
    careContext: { version: 1, role: 'plan', steps: [], log: [] },
  }] };
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key,
    new TextEncoder().encode(JSON.stringify(payload))));
  const blob = new Uint8Array(iv.length + encrypted.length); blob.set(iv); blob.set(encrypted, iv.length);
  const state = { gaps: true, unlocked: true, account: 'fictional-care-account', etag: 'CARE-E1', requests: [], blobStatus: 200,
    keepGaps: false, mergeError: null, mergeGate: null };
  const listeners = { note: [], lock: [], unlock: [] };
  state.notify = kind => listeners[kind].forEach(callback => callback());
  const vault = {
    isUnlocked: () => state.unlocked, getCurrentUser: () => ({ userId: state.account }),
    isCloudOnlyMode: () => cloudOnly, isPersistentCloudCacheEnabled: () => cloudOnly,
    isEphemeralMode: () => false, onUnlock: callback => { listeners.unlock.push(callback); },
    onLock: callback => { listeners.lock.push(callback); }, onPatientNoteChanged: callback => { listeners.note.push(callback); },
    listPatients: async () => payload.patients,
    getSyncMaterial: async () => ({ slotId: SLOT, authToken: 'FICTIONAL', syncEncKey: key }),
    mergeSyncPayload: vi.fn(async incoming => {
      expect(incoming).toEqual(payload);
      if (state.mergeGate) await state.mergeGate;
      if (state.mergeError) throw state.mergeError;
      if (!state.keepGaps) state.gaps = false;
      return { patientNotesMerged: 1 };
    }),
  };
  if (hasAPI) vault.needsCarePlanSyncRepair = vi.fn(async () => state.gaps);
  const win = { localStorage: storage({ [`vilda-sync-state-v1:${SLOT}`]: JSON.stringify({ registered: true, localEtag: state.etag }),
      [`vilda-cloud-etag-v1:${SLOT}`]: state.etag }), sessionStorage: storage(), navigator: {},
    document: { dispatchEvent() {}, addEventListener() {}, removeEventListener() {} },
    addEventListener() {}, removeEventListener() {}, VildaVault: vault };
  win.window = win; win.self = win; win.top = win;
  vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
    const path = new URL(url).pathname.split('/').at(-1);
    const headers = new Headers(init.headers);
    state.requests.push({ path, ifNoneMatch: headers.get('If-None-Match') });
    if (path === 'status') return Response.json({ etag: state.etag, size: blob.length });
    if (path === 'blob') {
      if (state.blobStatus !== 200) return Response.json({}, { status: state.blobStatus });
      if (headers.get('If-None-Match') === '"' + state.etag + '"') return new Response(null, { status: 304 });
      return new Response(blob, { headers: { ETag: '"' + state.etag + '"' } });
    }
    if (path === 'deltas' || path === 'changes') return Response.json({ deltas: [], headSeq: 0 });
    throw Error('Unexpected fictional sync request: ' + path);
  }));
  loadBrowserScript('vilda_sync.js', win);
  return { state, vault, sync: win.VildaSync, blobGets: () => state.requests.filter(req => req.path === 'blob') };
}
afterEach(async () => {
  // Let the production background delta drain finish while HTTP remains mocked.
  await new Promise(resolve => { setTimeout(resolve, 0); });
  vi.unstubAllGlobals();
});

describe('Care-plan recovery from an already acknowledged cloud version', () => {
  it.each([false, true])('replays the unchanged blob with a context gap (cloud-only=%s), then keeps normal ETag behavior', async cloudOnly => {
    const f = await fixture({ cloudOnly });
    expect((await f.sync.syncPull()).action).toBe('merged');
    expect(f.vault.mergeSyncPayload).toHaveBeenCalledTimes(1);
    expect(f.blobGets()).toEqual([{ path: 'blob', ifNoneMatch: null }]);
    expect((await f.sync.syncPull()).action).toBe('up-to-date');
    expect(f.blobGets()).toHaveLength(1);
  });

  it('does not download an unchanged blob for an intact vault or a vault without the optional recovery API', async () => {
    const intact = await fixture(); intact.state.gaps = false;
    expect((await intact.sync.syncPull()).action).toBe('up-to-date');
    expect(intact.blobGets()).toHaveLength(0);
    const oldAPI = await fixture({ hasAPI: false });
    expect((await oldAPI.sync.syncPull()).action).toBe('up-to-date');
    expect(oldAPI.blobGets()).toHaveLength(0);
  });

  it.each(['note', 'lock', 'unlock'])('caches an intact result and invalidates it after %s changes', async kind => {
    const f = await fixture(); f.state.gaps = false;
    for (let i = 0; i < 3; i += 1) expect((await f.sync.syncPull()).action).toBe('up-to-date');
    expect(f.vault.needsCarePlanSyncRepair).toHaveBeenCalledTimes(1);
    f.state.gaps = true; f.state.notify(kind);
    expect((await f.sync.syncPull()).action).toBe('merged');
    expect(f.vault.needsCarePlanSyncRepair).toHaveBeenCalledTimes(2);
    expect(f.blobGets()).toHaveLength(1);
  });

  it('does not cache a negative gap check when a note changes during that check', async () => {
    const f = await fixture(); f.state.gaps = false;
    f.vault.needsCarePlanSyncRepair.mockImplementationOnce(async () => {
      f.state.gaps = true; f.state.notify('note'); return false;
    });
    expect((await f.sync.syncPull()).action).toBe('up-to-date');
    expect((await f.sync.syncPull()).action).toBe('merged');
    expect(f.blobGets()).toHaveLength(1);
  });

  it('retries the same ETag after a failed download instead of recording a completed repair', async () => {
    const f = await fixture(); f.state.blobStatus = 503;
    await expect(f.sync.syncPull()).rejects.toMatchObject({ code: 'DOWNLOAD_FAILED' });
    f.state.blobStatus = 200;
    expect((await f.sync.syncPull()).action).toBe('merged');
    expect(f.blobGets()).toHaveLength(2);
    expect(f.vault.mergeSyncPayload).toHaveBeenCalledTimes(1);
  });

  it('retries after a failed merge without acknowledging incomplete recovery', async () => {
    const f = await fixture(); f.state.mergeError = Error('FICTIONAL_MERGE_FAILURE');
    await expect(f.sync.syncPull()).rejects.toThrow('FICTIONAL_MERGE_FAILURE');
    f.state.mergeError = null;
    expect((await f.sync.syncPull()).action).toBe('merged');
    expect(f.vault.mergeSyncPayload).toHaveBeenCalledTimes(2);
  });

  it('does not repeatedly download an unchanged cloud copy that also lacks the missing context', async () => {
    const f = await fixture(); f.state.keepGaps = true;
    expect((await f.sync.syncPull()).action).toBe('merged');
    for (let i = 0; i < 3; i += 1) expect((await f.sync.syncPull()).action).toBe('up-to-date');
    expect(f.blobGets()).toHaveLength(1);
    f.state.etag = 'CARE-E2';
    expect((await f.sync.syncPull()).action).toBe('merged');
    expect(f.blobGets()).toHaveLength(2);
  });

  it('shares an in-flight repair when two pulls observe the same gap', async () => {
    const f = await fixture(); let release;
    f.state.mergeGate = new Promise(resolve => { release = resolve; });
    const first = f.sync.syncPull();
    await vi.waitFor(() => expect(f.vault.mergeSyncPayload).toHaveBeenCalledTimes(1));
    const second = f.sync.syncPull();
    await vi.waitFor(() => expect(f.state.requests.filter(req => req.path === 'status')).toHaveLength(2));
    release();
    expect((await Promise.all([first, second])).map(result => result.action).sort()).toEqual(['merged', 'up-to-date']);
    expect(f.blobGets()).toHaveLength(1);
  });

  it.each(['lock', 'account'])('rechecks the %s boundary after waiting for another pull', async boundary => {
    const f = await fixture(); let release;
    f.state.mergeGate = new Promise(resolve => { release = resolve; });
    const first = f.sync.syncPull();
    await vi.waitFor(() => expect(f.vault.mergeSyncPayload).toHaveBeenCalledTimes(1));
    const second = f.sync.syncPull();
    const both = Promise.allSettled([first, second]);
    await vi.waitFor(() => expect(f.state.requests.filter(req => req.path === 'status')).toHaveLength(2));
    if (boundary === 'lock') f.state.unlocked = false;
    else f.state.account = 'fictional-changed-account';
    release();
    const results = await both;
    // P-SESJA-ZAPISU: pobranie przerwane przez inne zalogowane konto kończy się kodem SESSION_CHANGED.
    const code = boundary === 'account' ? 'SESSION_CHANGED' : 'VAULT_LOCKED';
    expect(results[1]).toMatchObject({ status: 'rejected', reason: { code } });
    expect(f.blobGets()).toHaveLength(1);
  });

  it('rechecks the account after a negative asynchronous gap check', async () => {
    const f = await fixture();
    f.vault.needsCarePlanSyncRepair.mockImplementationOnce(async () => {
      f.state.account = 'fictional-changed-account'; return false;
    });
    // P-SESJA-ZAPISU: pobranie przerwane przez inne zalogowane konto kończy się kodem SESSION_CHANGED.
    await expect(f.sync.syncPull()).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
    expect(f.blobGets()).toHaveLength(0);
  });

  it('does not carry a completed repair marker into another local account', async () => {
    const f = await fixture();
    await f.sync.syncPull();
    f.state.account = 'fictional-other-local-account'; f.state.gaps = true;
    expect((await f.sync.syncPull()).action).toBe('merged');
    expect(f.blobGets()).toHaveLength(2);
  });

  it('propagates a failed vault gap check and allows a later successful retry', async () => {
    const f = await fixture();
    f.vault.needsCarePlanSyncRepair.mockRejectedValueOnce(Error('FICTIONAL_CONTEXT_READ_FAILURE'));
    await expect(f.sync.syncPull()).rejects.toThrow('FICTIONAL_CONTEXT_READ_FAILURE');
    expect(f.blobGets()).toHaveLength(0);
    expect((await f.sync.syncPull()).action).toBe('merged');
  });
});
