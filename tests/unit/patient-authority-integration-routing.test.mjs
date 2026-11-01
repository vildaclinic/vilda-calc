import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Actual integration code with fictional encrypted payloads. The selector is a
// controlled vault boundary; protocol authentication is exercised by its own
// actual-module tests. No server, account or patient data is used here.
const LEGACY = Object.freeze({ mode: 'legacy', code: 'CLINICAL_V1', writeAvailable: false });
const PROTECTED = Object.freeze({ mode: 'protected-unavailable', code: 'CLINICAL_AUTHORITY_UNAVAILABLE', writeAvailable: false });
const MATERIAL = Object.freeze({ slotId: 'f'.repeat(64), authToken: 'FICTIONAL-AUTHORITY-TEST-TOKEN' });
const BUILDER_NAMES = ['buildPatientDelta', 'buildTombstoneDelta', 'buildNoteDelta',
  'buildNoteTombstoneDelta', 'buildLibraryNoteDelta', 'buildLibraryNoteTombstoneDelta'];
const LANES = [
  { name: 'patient save', event: 'patientSaved', detail: { patientId: 'fictional-patient' }, builder: 'buildPatientDelta', args: ['fictional-patient'] },
  { name: 'patient tombstone', event: 'patientDeleted', detail: { patientId: 'fictional-patient', deletedAtISO: '2026-06-17T10:00:00.000Z' }, builder: 'buildTombstoneDelta', args: ['fictional-patient', '2026-06-17T10:00:00.000Z'] },
  { name: 'patient note save', event: 'patientNote', detail: { action: 'save', id: 'fictional-note' }, builder: 'buildNoteDelta', args: ['fictional-note'] },
  { name: 'patient note tombstone', event: 'patientNote', detail: { action: 'delete', id: 'fictional-note', deletedAtISO: '2026-06-17T10:00:00.000Z' }, builder: 'buildNoteTombstoneDelta', args: ['fictional-note', '2026-06-17T10:00:00.000Z'] },
  { name: 'library note save', event: 'note', detail: { action: 'save', id: 'fictional-library-note' }, builder: 'buildLibraryNoteDelta', args: ['fictional-library-note'] },
  { name: 'library note tombstone', event: 'note', detail: { action: 'delete', id: 'fictional-library-note', deletedAtISO: '2026-06-17T10:00:00.000Z' }, builder: 'buildLibraryNoteTombstoneDelta', args: ['fictional-library-note', '2026-06-17T10:00:00.000Z'] },
];

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function storage(seed = {}) {
  const data = new Map(Object.entries(seed));
  return {
    getItem: vi.fn((key) => data.has(key) ? data.get(key) : null),
    setItem: vi.fn((key, value) => { data.set(key, String(value)); }),
    removeItem: vi.fn((key) => { data.delete(key); }),
    key: (index) => [...data.keys()][index] || null,
    get length() { return data.size; },
  };
}

function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener: vi.fn((type, fn) => {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    }),
    removeEventListener: vi.fn((type, fn) => {
      listeners.set(type, (listeners.get(type) || []).filter((listener) => listener !== fn));
    }),
    dispatchEvent: vi.fn((event) => {
      for (const fn of listeners.get(event.type) || []) fn(event);
      return true;
    }),
  };
}

function setup({ selection = LEGACY, selector = true } = {}) {
  const state = { selection, unlocked: false };
  const handlers = {};
  const register = (name) => (fn) => { handlers[name] = fn; };
  const payloads = Object.fromEntries(BUILDER_NAMES.map((name) => [name,
    Object.freeze({ iv: 'FICTIONAL-IV', data: `FICTIONAL-ENCRYPTED-${name}` })]));
  const builders = Object.fromEntries(BUILDER_NAMES.map((name) => [name, vi.fn(async () => payloads[name])]));
  const vault = {
    isUnlocked: () => state.unlocked,
    isCloudOnlyMode: () => false,
    isEphemeralMode: () => false,
    getCurrentUser: () => ({ userId: 'fictional-authority-routing-user' }),
    getSyncMaterial: vi.fn(async () => MATERIAL),
    applyEncryptedDelta: vi.fn(async () => ({ addedPatientCount: 1 })),
    inspectPatientAuthority: vi.fn(() => { throw Error('Unexpected authority probe'); }),
    peekExistingSyncIdentity: vi.fn(() => { throw Error('Unexpected identity read'); }),
    ...builders,
  };
  if (selector) vault.selectPatientClinicalRoute = vi.fn(() => state.selection);
  for (const [method, name] of Object.entries({
    onUnlock: 'unlock', onLock: 'lock', onPatientSaved: 'patientSaved', onPatientDeleted: 'patientDeleted',
    onPatientNoteChanged: 'patientNote', onNoteChanged: 'note', onPasskeyChanged: 'passkey',
    onCredentialChanged: 'credential', onPreferenceChanged: 'preference', onPatientListChanged: 'patientList',
  })) vault[method] = register(name);
  const sync = {
    syncPush: vi.fn(async () => ({ action: 'uploaded' })),
    syncPull: vi.fn(async () => ({ action: 'up-to-date' })),
    syncFull: vi.fn(async () => ({ action: 'complete' })),
    probeNewDevice: vi.fn(async () => ({ isNewDevice: false })),
    continueTemplateLibrarySync: vi.fn(),
    onSyncStart: register('syncStart'), onSyncComplete: register('syncComplete'), onSyncError: register('syncError'),
  };
  const document = { ...eventTarget(), readyState: 'complete', hidden: false };
  const win = {
    ...eventTarget(), document,
    localStorage: storage({ 'vilda-sync-enabled-v1': 'true' }),
    sessionStorage: storage({ 'vilda-probe-done-v1': '1' }),
    navigator: { onLine: true, sendBeacon: vi.fn(() => true) },
    fetch: vi.fn(async () => ({ ok: true })),
    setTimeout: (...args) => setTimeout(...args), clearTimeout: (...args) => clearTimeout(...args),
    setInterval: (...args) => setInterval(...args), clearInterval: (...args) => clearInterval(...args),
    frames: [], location: { origin: 'https://fictional-authority.test' },
    VildaVault: vault, VildaSync: sync,
  };
  win.window = win; win.self = win; win.top = win; win.parent = win;
  loadBrowserScript('vilda_sync_integration.js', win);
  state.unlocked = true;
  const events = (type) => document.dispatchEvent.mock.calls.map(([event]) => event).filter((event) => event.type === type);
  return { state, handlers, vault, builders, payloads, sync, win, events, api: win.VildaSyncIntegration };
}

const settle = () => vi.advanceTimersByTimeAsync(0);
const fire = (h, lane) => h.handlers[lane.event]({ ...lane.detail });
function expectNoClinicalTransport(h) {
  expect(h.vault.getSyncMaterial).not.toHaveBeenCalled();
  for (const builder of Object.values(h.builders)) expect(builder).not.toHaveBeenCalled();
  expect(h.win.navigator.sendBeacon).not.toHaveBeenCalled();
  expect(h.win.fetch).not.toHaveBeenCalled();
  expect(h.sync.syncPush).not.toHaveBeenCalled();
  expect(h.sync.syncPull).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-17T10:00:00.000Z'));
  vi.stubGlobal('CustomEvent', class {
    constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
  });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('actual integration direct-delta routing', () => {
  it.each(LANES)('legacy $name retains its encrypted payload and one beacon', async (lane) => {
    const h = setup();
    fire(h, lane);
    await settle();
    expect(h.vault.getSyncMaterial).toHaveBeenCalledTimes(1);
    expect(h.builders[lane.builder]).toHaveBeenCalledExactlyOnceWith(...lane.args);
    for (const name of BUILDER_NAMES.filter((name) => name !== lane.builder)) expect(h.builders[name]).not.toHaveBeenCalled();
    expect(h.win.navigator.sendBeacon).toHaveBeenCalledTimes(1);
    const [url, body] = h.win.navigator.sendBeacon.mock.calls[0];
    expect(url).toBe(`https://vilda-sync.maciej-4b9.workers.dev/v1/slots/${MATERIAL.slotId}/delta`);
    expect(JSON.parse(body)).toEqual({ token: MATERIAL.authToken, payload: h.payloads[lane.builder] });
    expect(h.win.fetch).not.toHaveBeenCalled();
    expect(h.events('vilda:sync-merged')).toEqual([]);
    expect(h.win.localStorage.setItem).not.toHaveBeenCalled();
  });

  it.each(LANES)('protected $name stops before material, encryption and transport', async (lane) => {
    const h = setup({ selection: PROTECTED });
    fire(h, lane);
    await settle();
    expectNoClinicalTransport(h);
    expect(h.events('vilda:sync-status-changed').map((event) => event.detail)).toContainEqual(expect.objectContaining({
      state: 'error', code: PROTECTED.code, operation: 'direct-delta',
    }));
    expect(h.win.localStorage.setItem).not.toHaveBeenCalled();
  });

  it.each(LANES)('$name rechecks selection after delayed material', async (lane) => {
    const h = setup();
    const gate = deferred();
    h.vault.getSyncMaterial.mockReturnValueOnce(gate.promise);
    fire(h, lane);
    expect(h.vault.getSyncMaterial).toHaveBeenCalledTimes(1);
    h.state.selection = PROTECTED;
    gate.resolve(MATERIAL);
    await settle();
    for (const builder of Object.values(h.builders)) expect(builder).not.toHaveBeenCalled();
    expect(h.win.navigator.sendBeacon).not.toHaveBeenCalled();
    expect(h.win.fetch).not.toHaveBeenCalled();
  });

  it.each(LANES)('$name rechecks selection after delayed encrypted payload', async (lane) => {
    const h = setup();
    const gate = deferred();
    h.builders[lane.builder].mockReturnValueOnce(gate.promise);
    fire(h, lane);
    await settle();
    expect(h.builders[lane.builder]).toHaveBeenCalledExactlyOnceWith(...lane.args);
    h.state.selection = PROTECTED;
    gate.resolve(h.payloads[lane.builder]);
    await settle();
    expect(h.win.navigator.sendBeacon).not.toHaveBeenCalled();
    expect(h.win.fetch).not.toHaveBeenCalled();
  });
});

describe('actual integration beacon fallback and incoming delta', () => {
  it('rejected beacon reuses the same URL/body for fetch without a durable-success publication', async () => {
    const h = setup();
    h.win.navigator.sendBeacon.mockReturnValue(false);
    fire(h, LANES[0]);
    await settle();
    expect(h.win.navigator.sendBeacon).toHaveBeenCalledTimes(1);
    const [url, body] = h.win.navigator.sendBeacon.mock.calls[0];
    expect(h.win.fetch).toHaveBeenCalledExactlyOnceWith(url, { method: 'POST', body, mode: 'no-cors', credentials: 'omit' });
    expect(h.events('vilda:sync-merged')).toEqual([]);
    expect(h.win.localStorage.getItem('vilda-sync-last-push-ok-v1:fictional-authority-routing-user')).toBeNull();
  });

  it('selection changing during a rejected beacon blocks the fetch fallback', async () => {
    const h = setup();
    h.win.navigator.sendBeacon.mockImplementation(() => { h.state.selection = PROTECTED; return false; });
    fire(h, LANES[0]);
    await settle();
    expect(h.win.navigator.sendBeacon).toHaveBeenCalledTimes(1);
    expect(h.win.fetch).not.toHaveBeenCalled();
    expect(h.events('vilda:sync-merged')).toEqual([]);
  });

  it('protected incoming delta stops before vault mutation or merged publication', async () => {
    const h = setup({ selection: PROTECTED });
    h.api.applyDelta({ iv: 'FICTIONAL-IV', data: 'FICTIONAL-DELTA' });
    await settle();
    expect(h.vault.applyEncryptedDelta).not.toHaveBeenCalled();
    expect(h.events('vilda:sync-merged')).toEqual([]);
    expect(h.win.localStorage.setItem).not.toHaveBeenCalled();
  });

  it('legacy incoming delta retains its actual merge notification', async () => {
    const h = setup();
    const payload = { iv: 'FICTIONAL-IV', data: 'FICTIONAL-DELTA' };
    h.api.applyDelta(payload);
    await settle();
    expect(h.vault.applyEncryptedDelta).toHaveBeenCalledExactlyOnceWith(payload);
    expect(h.events('vilda:sync-merged')).toHaveLength(1);
    expect(JSON.parse(h.win.localStorage.getItem('vilda-sync-data-ping-v1'))).toMatchObject({ type: 'merged' });
  });

  it('selection changing after apply starts prevents a stale merged publication', async () => {
    const h = setup();
    const gate = deferred();
    h.vault.applyEncryptedDelta.mockReturnValueOnce(gate.promise);
    h.api.applyDelta({ iv: 'FICTIONAL-IV', data: 'FICTIONAL-DELTA' });
    expect(h.vault.applyEncryptedDelta).toHaveBeenCalledTimes(1);
    h.state.selection = PROTECTED;
    gate.resolve({ addedPatientCount: 1 });
    await settle();
    expect(h.events('vilda:sync-merged')).toEqual([]);
    expect(h.win.localStorage.getItem('vilda-sync-data-ping-v1')).toBeNull();
  });
});

describe('actual integration lifecycle shares routing without a new scheduler', () => {
  it('inactive locked boot has only the original binding timer and no authority, identity or network probe', async () => {
    const h = setup();
    expect(vi.getTimerCount()).toBe(1);
    expect(h.vault.selectPatientClinicalRoute).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(vi.getTimerCount()).toBe(0);
    expectNoClinicalTransport(h);
    expect(h.vault.inspectPatientAuthority).not.toHaveBeenCalled();
    expect(h.vault.peekExistingSyncIdentity).not.toHaveBeenCalled();
    expect(h.sync.continueTemplateLibrarySync).not.toHaveBeenCalled();
  });

  it('inactive unlock retains the original 600ms startup and 10s interval', async () => {
    const h = setup();
    h.handlers.unlock();
    expect(vi.getTimerCount()).toBe(3);
    await vi.advanceTimersByTimeAsync(599);
    expect(h.sync.syncFull).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(h.sync.syncFull).toHaveBeenCalledTimes(1);
    expect(h.sync.probeNewDevice).not.toHaveBeenCalled();
    expect(h.vault.inspectPatientAuthority).not.toHaveBeenCalled();
    expect(h.vault.peekExistingSyncIdentity).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(9400);
    expect(h.sync.syncPull).toHaveBeenCalledTimes(1);
    expect(h.sync.continueTemplateLibrarySync).toHaveBeenCalledTimes(1);
    expect(h.vault.getSyncMaterial).not.toHaveBeenCalled();
    expect(h.win.fetch).not.toHaveBeenCalled();
  });

  it('protected startup reports unavailable before the legacy startup transport', async () => {
    const h = setup({ selection: PROTECTED });
    h.handlers.unlock();
    await vi.advanceTimersByTimeAsync(600);
    expectNoClinicalTransport(h);
    expect(h.sync.syncFull).not.toHaveBeenCalled();
    expect(h.sync.probeNewDevice).not.toHaveBeenCalled();
    expect(h.events('vilda:sync-status-changed').map((event) => event.detail)).toContainEqual(expect.objectContaining({
      state: 'error', code: PROTECTED.code, operation: 'startup',
    }));
  });

  it('selection changing before the queued startup callback prevents its probe and creates no retry', async () => {
    const h = setup();
    h.win.sessionStorage.removeItem('vilda-probe-done-v1');
    h.handlers.unlock();
    expect(h.api.isStartupSyncInProgress()).toBe(true);
    expect(vi.getTimerCount()).toBe(3);
    h.state.selection = PROTECTED;
    // The existing 100ms binding timer finishes; the clinical callback is 600ms.
    await vi.advanceTimersByTimeAsync(600);
    expect(h.sync.probeNewDevice).not.toHaveBeenCalled();
    expect(h.sync.syncFull).not.toHaveBeenCalled();
    expectNoClinicalTransport(h);
    expect(h.api.isStartupSyncInProgress()).toBe(false);
    // Only the original 10s lifecycle interval survives, with no startup retry.
    expect(vi.getTimerCount()).toBe(1);
    expect(h.events('vilda:sync-status-changed').map((event) => event.detail)).toContainEqual(expect.objectContaining({
      state: 'error', code: PROTECTED.code,
    }));
  });

  it.each([false, true])('selection changing during cloud-only warm-start lookup (%s) blocks legacy startup publication and pull', async (warm) => {
    const h = setup();
    const gate = deferred();
    h.vault.isCloudOnlyMode = () => true;
    h.vault.canWarmStartCloudOnly = vi.fn(() => gate.promise);
    h.handlers.unlock();
    expect(h.vault.canWarmStartCloudOnly).toHaveBeenCalledTimes(1);
    expect(h.api.isStartupSyncInProgress()).toBe(true);
    h.state.selection = PROTECTED;
    gate.resolve(warm);
    await settle();
    expectNoClinicalTransport(h);
    expect(h.events('vilda:cloud-only-sync-pulling')).toEqual([]);
    expect(h.events('vilda:cloud-only-sync-complete')).toEqual([]);
    expect(h.events('vilda:cloud-only-sync-failed')).toEqual([]);
    expect(h.api.isStartupSyncInProgress()).toBe(false);
    await vi.advanceTimersByTimeAsync(100);
    expect(vi.getTimerCount()).toBe(1);
  });

  it.each(['resolved', 'rejected'])('a %s warm-start cloud pull cannot overwrite unavailable status after selection changes', async (outcome) => {
    const h = setup();
    const gate = deferred();
    h.vault.isCloudOnlyMode = () => true;
    h.vault.canWarmStartCloudOnly = vi.fn(async () => true);
    h.sync.syncPull.mockReturnValueOnce(gate.promise);
    h.handlers.unlock();
    await settle();
    expect(h.sync.syncPull).toHaveBeenCalledTimes(1);
    expect(h.events('vilda:cloud-only-sync-complete').map((event) => event.detail)).toEqual([{ warm: true }]);
    // The cache is already visible; only publications after the authority flip
    // belong to the pending cloud pull and must preserve its unavailable state.
    h.win.document.dispatchEvent.mockClear();
    h.state.selection = PROTECTED;
    if (outcome === 'resolved') gate.resolve({ action: 'up-to-date' });
    else gate.reject(new Error('fictional warm-start transport failure'));
    await settle();
    const statuses = h.events('vilda:sync-status-changed').map((event) => event.detail);
    expect(statuses.at(-1)).toMatchObject({ state: 'error', code: PROTECTED.code });
    expect(statuses.some((status) => status.state === 'ok')).toBe(false);
    expect(h.events('vilda:cloud-only-sync-complete')).toEqual([]);
    expect(h.events('vilda:cloud-only-sync-failed')).toEqual([]);
    expect(h.api.isStartupSyncInProgress()).toBe(false);
  });

  it.each(['resolved', 'rejected'])('selection changing during a %s new-device probe prevents legacy full sync and completion marker', async (outcome) => {
    const h = setup();
    const gate = deferred();
    h.win.sessionStorage.removeItem('vilda-probe-done-v1');
    h.sync.probeNewDevice.mockReturnValueOnce(gate.promise);
    h.handlers.unlock();
    await vi.advanceTimersByTimeAsync(600);
    expect(h.sync.probeNewDevice).toHaveBeenCalledTimes(1);
    expect(h.sync.syncFull).not.toHaveBeenCalled();
    h.state.selection = PROTECTED;
    if (outcome === 'resolved') gate.resolve({ isNewDevice: false });
    else gate.reject(new Error('fictional probe transport failure'));
    await settle();
    expect(h.sync.syncFull).not.toHaveBeenCalled();
    expectNoClinicalTransport(h);
    expect(h.win.sessionStorage.getItem('vilda-probe-done-v1')).toBeNull();
    expect(h.api.isStartupSyncInProgress()).toBe(false);
    expect(vi.getTimerCount()).toBe(1);
  });

  it.each(['pullNow', 'focus', 'visibility', 'interval'])('%s still reports selected protected state after a legacy auth suspension', async (entry) => {
    const h = setup();
    h.handlers.unlock();
    h.handlers.syncError({ operation: 'pull', error: { code: 'AUTH_FAILED', message: 'fictional legacy401' } });
    h.state.selection = PROTECTED;
    h.vault.selectPatientClinicalRoute.mockClear();
    h.sync.continueTemplateLibrarySync.mockClear();
    h.win.document.dispatchEvent.mockClear();
    if (entry === 'pullNow') h.api.pullNow();
    else if (entry === 'focus') h.win.dispatchEvent({ type: 'focus' });
    else if (entry === 'visibility') h.win.document.dispatchEvent({ type: 'visibilitychange' });
    else await vi.advanceTimersByTimeAsync(10000);
    await settle();
    expect(h.vault.selectPatientClinicalRoute).toHaveBeenCalledWith('lifecycle-pull');
    expect(h.sync.continueTemplateLibrarySync).toHaveBeenCalledTimes(1);
    expect(h.sync.syncPull).not.toHaveBeenCalled();
    expect(h.sync.syncFull).not.toHaveBeenCalled();
    expect(h.events('vilda:sync-status-changed').map((event) => event.detail)).toContainEqual(expect.objectContaining({
      state: 'error', code: PROTECTED.code, operation: 'lifecycle-pull',
    }));
  });

  it.each(['forcePullForCloudOnly', 'pullForNewDevice'])('%s rejects unavailable protected selection before legacy pull', async (entry) => {
    const h = setup({ selection: PROTECTED });
    await expect(h.api[entry]()).rejects.toMatchObject({ code: PROTECTED.code, patientClinicalUnavailable: true });
    expectNoClinicalTransport(h);
  });

  it.each(['forcePullForCloudOnly', 'pullForNewDevice'])('%s rejects a stale completed legacy pull after selection changes', async (entry) => {
    const h = setup();
    const gate = deferred();
    h.sync.syncPull.mockReturnValueOnce(gate.promise);
    const result = h.api[entry]();
    const rejected = expect(result).rejects.toMatchObject({ code: PROTECTED.code, patientClinicalUnavailable: true });
    await settle();
    expect(h.sync.syncPull).toHaveBeenCalledTimes(1);
    h.state.selection = PROTECTED;
    gate.resolve({ action: 'merged' });
    await rejected;
  });

  it('a legacy fixture without the additive selector keeps the existing transport path', async () => {
    const h = setup({ selector: false });
    fire(h, LANES[0]);
    await settle();
    expect(h.vault.getSyncMaterial).toHaveBeenCalledTimes(1);
    expect(h.builders.buildPatientDelta).toHaveBeenCalledTimes(1);
    expect(h.win.navigator.sendBeacon).toHaveBeenCalledTimes(1);
  });
});
