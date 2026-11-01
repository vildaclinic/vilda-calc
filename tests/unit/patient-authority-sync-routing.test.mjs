import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Execute the real clinical synchronizer. Only the browser/vault/HTTP boundary
// is replaced; every account, key and patient in these tests is fictional.
const SLOT = 'f'.repeat(64);
const LEGACY = Object.freeze({ mode: 'legacy', code: null, writeAvailable: false });
const BLOCKED = Object.freeze({ mode: 'protected-unavailable', code: 'IDENTITY_BOOTSTRAP_UNVERIFIED', writeAvailable: false });
const PAYLOAD = { patients: [{ patientId: 'FICTIONAL-ROUTING-PATIENT' }] };
const STATE_KEY = `vilda-sync-state-v1:${SLOT}`;
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function storage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return { getItem: key => values.get(key) ?? null,
    setItem: vi.fn((key, value) => values.set(key, String(value))),
    removeItem: vi.fn(key => values.delete(key)), key: index => [...values.keys()][index] ?? null,
    get length() { return values.size; } };
}

function device({ selection = LEGACY, missingSelector = false, registered = false, key } = {}) {
  let route = selection;
  const sessions = new WeakSet();
  const material = { slotId: SLOT, authToken: 'FICTIONAL-TOKEN', authTokenHash: 'FICTIONAL-HASH', syncEncKey: key };
  const vault = { isUnlocked: () => true, isCloudOnlyMode: () => false,
    getSyncMaterial: vi.fn(async () => material), exportSyncPayload: vi.fn(async () => PAYLOAD),
    mergeSyncPayload: vi.fn(async () => ({})), applyEncryptedDelta: vi.fn(async () => ({})),
    rotateSyncIdentity: vi.fn(), listPatients: vi.fn(async () => PAYLOAD.patients),
    captureSyncOperationSession: vi.fn(() => { const token = Object.freeze({}); sessions.add(token); return token; }),
    assertSyncOperationSession: vi.fn(token => {
      if (!sessions.has(token)) throw Object.assign(new Error('Fictional unknown session'), { code: 'SESSION_CHANGED' });
      return true;
    }) };
  if (!missingSelector) vault.selectPatientClinicalRoute = vi.fn(() => route);
  const win = { VildaVault: vault, localStorage: storage(registered ? {
    [STATE_KEY]: JSON.stringify({ registered: true, localEtag: 'fictional-E0', lastSyncAt: null }),
  } : {}), sessionStorage: storage({ 'vilda-sync-pulled-v1': '1' }),
  document: { dispatchEvent: vi.fn() } };
  win.window = win; win.self = win; win.top = win;
  loadBrowserScript('vilda_sync.js', win);
  return { win, vault, sync: win.VildaSync, material, setRoute: value => { route = value; } };
}

const CLINICAL_OPERATIONS = [
  ['push', sync => sync.syncPush()], ['pull', sync => sync.syncPull()], ['full', sync => sync.syncFull()],
  ['status', sync => sync.getSyncStatus()], ['clear', sync => sync.clearSyncState()],
  ['delete', sync => sync.deleteSyncSlot()], ['probe', sync => sync.probeNewDevice()],
  ['restore', sync => sync.restorePrevBlob()], ['revoke', sync => sync.revokeAllDevices('FICTIONAL-PASSWORD')],
  ['upload helper', sync => sync.uploadToSlot(SLOT, 'FICTIONAL-TOKEN', 'FICTIONAL-HASH', new Uint8Array([1]))],
  ['delete helper', sync => sync.deleteSlotWithMaterial(SLOT, 'FICTIONAL-TOKEN')],
];

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('patient clinical authority routing in the actual sync module', () => {
  it.each(CLINICAL_OPERATIONS)('blocks %s before identity, export, rotation or HTTP', async (_label, run) => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const d = device({ selection: BLOCKED });
    await expect(run(d.sync)).rejects.toMatchObject({ code: BLOCKED.code, patientClinicalUnavailable: true });
    expect(d.vault.getSyncMaterial).not.toHaveBeenCalled();
    expect(d.vault.exportSyncPayload).not.toHaveBeenCalled();
    expect(d.vault.rotateSyncIdentity).not.toHaveBeenCalled();
    expect(d.vault.mergeSyncPayload).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(d.win.localStorage.setItem).not.toHaveBeenCalled();
    expect(d.win.localStorage.removeItem).not.toHaveBeenCalled();
  });

  it('also protects the exported legacy metadata helpers', () => {
    const d = device({ selection: BLOCKED });
    for (const run of [() => d.sync._loadSyncState(SLOT), () => d.sync._saveSyncState(SLOT, { registered: true }),
      () => d.sync._clearSyncStateForSlot(SLOT)]) expect(run).toThrow(expect.objectContaining({ code: BLOCKED.code }));
    expect(d.win.localStorage.setItem).not.toHaveBeenCalled();
    expect(d.win.localStorage.removeItem).not.toHaveBeenCalled();
  });

  it.each([null, {}, { mode: 'legacy', writeAvailable: true }, { mode: 'future-format', writeAvailable: false }])(
    'fails closed for an explicit invalid or unknown descriptor %j', async selection => {
      const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
      const d = device({ selection });
      await expect(d.sync.syncPull()).rejects.toMatchObject({ code: 'PATIENT_AUTHORITY_UNAVAILABLE' });
      expect(d.vault.getSyncMaterial).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
    });

  it('does not turn a throwing or stale selector into an inconclusive probe', async () => {
    const d = device();
    d.vault.selectPatientClinicalRoute.mockImplementation(() => { throw Object.assign(new Error('Fictional stale session'), { code: 'SESSION_CHANGED' }); });
    await expect(d.sync.probeNewDevice()).rejects.toMatchObject({ code: 'SESSION_CHANGED', patientClinicalUnavailable: true });
    expect(d.vault.getSyncMaterial).not.toHaveBeenCalled();
  });

  it.each(CLINICAL_OPERATIONS.slice(0, 9))('rechecks %s after held identity material resolves', async (_label, run) => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const d = device(), held = deferred();
    d.vault.getSyncMaterial.mockReturnValue(held.promise);
    const pending = run(d.sync);
    // Pull has an existing promise barrier before material acquisition.
    await vi.waitFor(() => expect(d.vault.getSyncMaterial).toHaveBeenCalledTimes(1));
    d.setRoute(BLOCKED); held.resolve(d.material);
    await expect(pending).rejects.toMatchObject({ code: BLOCKED.code });
    expect(d.vault.exportSyncPayload).not.toHaveBeenCalled(); expect(d.vault.rotateSyncIdentity).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled(); expect(d.win.localStorage.setItem).not.toHaveBeenCalled();
  });

  it.each([false, true])('keeps the one-request legacy pull unchanged (old bundle = %s)', async missingSelector => {
    const fetch = vi.fn(async () => new Response('{}', { status: 401 })); vi.stubGlobal('fetch', fetch);
    const d = device({ missingSelector });
    await expect(d.sync.syncPull()).resolves.toEqual({ action: 'not-registered', httpStatus: 401 });
    expect(d.vault.getSyncMaterial).toHaveBeenCalledTimes(1);
    expect(d.vault.exportSyncPayload).not.toHaveBeenCalled(); expect(d.vault.listPatients).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe(`https://vilda-sync.maciej-4b9.workers.dev/v1/slots/${SLOT}/status`);
    expect(options).toMatchObject({ cache: 'no-store', method: 'GET', headers: { Authorization: 'Bearer FICTIONAL-TOKEN' }, signal: expect.any(AbortSignal) });
    expect(Object.keys(options).sort()).toEqual(['cache', 'headers', 'method', 'signal']);
    expect(d.win.localStorage.setItem).not.toHaveBeenCalled();
  });

  it('rejects a held HTTP response before it can start a blob download or merge', async () => {
    const held = deferred(), fetch = vi.fn(() => held.promise); vi.stubGlobal('fetch', fetch);
    const d = device(); const pending = d.sync.syncPull();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    d.setRoute(BLOCKED); held.resolve(new Response(JSON.stringify({ etag: 'fictional-E1', size: 100 }), { status: 200 }));
    await expect(pending).rejects.toMatchObject({ code: BLOCKED.code });
    expect(fetch).toHaveBeenCalledTimes(1); expect(d.vault.mergeSyncPayload).not.toHaveBeenCalled();
    expect(d.win.localStorage.setItem).not.toHaveBeenCalled();
  });

  it('does not acknowledge an upload whose JSON receipt arrived after the route changed', async () => {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const held = deferred(), json = vi.fn(() => held.promise);
    const fetch = vi.fn(async () => ({ status: 200, ok: true, json })); vi.stubGlobal('fetch', fetch);
    const d = device({ registered: true, key }), originalState = d.win.localStorage.getItem(STATE_KEY);
    const pending = d.sync.syncPush();
    await vi.waitFor(() => expect(json).toHaveBeenCalledTimes(1));
    d.setRoute(BLOCKED); held.resolve({ etag: 'fictional-E1' });
    await expect(pending).rejects.toMatchObject({ code: BLOCKED.code });
    expect(fetch).toHaveBeenCalledTimes(1); expect(d.win.localStorage.getItem(STATE_KEY)).toBe(originalState);
    expect(d.win.localStorage.setItem).not.toHaveBeenCalled();
  });

  it('leaves the detached delta cursor unacknowledged when selection changes during apply', async () => {
    const held = deferred(), checkedAfterApply = deferred();
    const d = device({ registered: true }); d.vault.applyEncryptedDelta.mockReturnValue(held.promise);
    const fetch = vi.fn(async url => new Response(JSON.stringify(url.endsWith('/status')
      ? { etag: 'fictional-E0', size: 100 }
      : { deltas: [{ seq: 1, payload: { fictional: 'encrypted-delta' } }], headSeq: 1 }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    await expect(d.sync.syncPull()).resolves.toMatchObject({ action: 'up-to-date' });
    await vi.waitFor(() => expect(d.vault.applyEncryptedDelta).toHaveBeenCalledTimes(1));
    d.vault.selectPatientClinicalRoute.mockImplementation(operation => {
      if (operation === 'apply-sync-delta') checkedAfterApply.resolve();
      return BLOCKED;
    });
    held.resolve({ addedPatientCount: 1 }); await checkedAfterApply.promise;
    expect(d.win.localStorage.getItem(`vilda-sync-cursor-v1:${SLOT}`)).toBeNull();
    expect(d.win.document.dispatchEvent.mock.calls.some(([event]) => event.type === 'vilda:sync-merged')).toBe(false);
    expect(d.vault.applyEncryptedDelta).toHaveBeenCalledTimes(1);
  });

  it('retains the legacy upload request, encryption payload and material/export counts', async () => {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const fetch = vi.fn(async () => new Response(JSON.stringify({ etag: 'fictional-E1' }), { status: 200 })); vi.stubGlobal('fetch', fetch);
    const d = device({ registered: true, key });
    await expect(d.sync.syncPush({ keepalive: true })).resolves.toMatchObject({ action: 'uploaded', etag: 'fictional-E1' });
    expect(d.vault.getSyncMaterial).toHaveBeenCalledTimes(1); expect(d.vault.exportSyncPayload).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, request] = fetch.mock.calls[0], encrypted = new Uint8Array(request.body);
    expect(url).toBe(`https://vilda-sync.maciej-4b9.workers.dev/v1/slots/${SLOT}/blob`);
    expect(request).toMatchObject({ method: 'PUT', keepalive: true,
      headers: { 'Content-Type': 'application/octet-stream', Authorization: 'Bearer FICTIONAL-TOKEN', 'If-Match': '"fictional-E0"' } });
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: encrypted.slice(0, 12) }, key, encrypted.slice(12));
    expect(new TextDecoder().decode(plain)).toBe(JSON.stringify(PAYLOAD));
    expect(encrypted.byteLength).toBe(new TextEncoder().encode(JSON.stringify(PAYLOAD)).byteLength + 28);
    expect(JSON.parse(d.win.localStorage.getItem(STATE_KEY))).toMatchObject({ registered: true, localEtag: 'fictional-E1' });
  });

  it('keeps the established independent library transport while the clinical route is blocked', async () => {
    const d = device({ selection: BLOCKED }), token = Object.freeze({
      userId: 'fictional-library-owner', slotId: SLOT, authToken: 'FICTIONAL-LIBRARY-TOKEN', keyBinding: 'fictional-library-key',
    });
    Object.assign(d.vault, {
      getCurrentUser: () => ({ userId: token.userId }),
      captureCareTemplateSession: vi.fn(async () => token), assertCareTemplateSession: vi.fn(() => true),
      getCareTemplateSyncState: vi.fn(async () => ({ epoch: 1, cursor: 0, dirty: false, initializeIntent: false })),
      applyCareTemplateEvents: vi.fn(async () => ({ applied: true, cursor: 0 })),
      prepareCareTemplatePending: vi.fn(async () => ({ epoch: 1, events: [] })),
    });
    d.win.VildaCareTemplateModel = {}; d.win.VildaCareTemplateStore = {};
    d.win.localStorage.setItem('vilda-sync-enabled-v1', 'true');
    const receipt = { ok: true, namespace: 'care-template-library', protocol: 1, slotId: SLOT,
      initialized: true, epoch: 1, headSeq: 0, floorSeq: 0, eventsStored: 0, bytesStored: 0,
      limits: { maxEventBytes: 1048576, maxBodyBytes: 1048576, maxBatchEvents: 200, maxPageEvents: 200,
        maxAccountBytes: 67108864, maxAccountEvents: 16384 } };
    const fetch = vi.fn(async url => {
      if (url.includes('/template-library/state')) return new Response(JSON.stringify(receipt), { status: 200 });
      if (url.includes('/template-library/changes?')) return new Response(JSON.stringify({ ...receipt, events: [], cursor: 0, hasMore: false }), { status: 200 });
      throw new Error('Unexpected fictional request outside the template library');
    });
    vi.stubGlobal('fetch', fetch);
    const library = d.sync.syncTemplateLibrary();
    await expect(d.sync.syncPull()).rejects.toMatchObject({ code: BLOCKED.code });
    await expect(library).resolves.toEqual({ state: 'ready', epoch: 1, cursor: 0, pending: false });
    expect(fetch.mock.calls.map(([url]) => new URL(url).pathname.split('/').at(-1))).toEqual(['state', 'changes']);
    expect(fetch.mock.calls.every(([, request]) => request.method === 'GET')).toBe(true);
    expect(d.vault.applyCareTemplateEvents).toHaveBeenCalledTimes(1);
    expect(d.vault.getSyncMaterial).not.toHaveBeenCalled(); expect(d.vault.exportSyncPayload).not.toHaveBeenCalled();
    d.sync.deactivateTemplateLibrarySync();
  });
});
