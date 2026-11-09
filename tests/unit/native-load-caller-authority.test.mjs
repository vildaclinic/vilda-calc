import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = name => fs.readFileSync(path.join(root, name), 'utf8');
const exporter = source('vilda_data_import_export.js');
const panel = source('vilda_panel_pacjent.js');
const history = source('vilda_version_history_ui.js');
const chrome = source('vilda_chrome.js');
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const PID = 'fictional-load-target';
const OTHER_PID = 'fictional-other-patient';
const payload = { version: 1, name: 'Fikcyjny Wczytany', user: { age: 9, ageMonths: 0, sex: 'F', height: 130, weight: 28 }, foods: { meals: [{ fictional: true }], snacks: [] } };
const snapshot = { snapshotId: 'fictional-version', savedAtISO: '2026-11-01T12:00:00Z', payload };
function deferred() { let resolve, reject; const promise = new Promise((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; }
async function flush() { for (let index = 0; index < 20; index++) await Promise.resolve(); }
function events(target = {}) {
  const listeners = new Map();
  return Object.assign(target, {
    addEventListener(type, callback) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(callback); },
    removeEventListener(type, callback) { listeners.set(type, (listeners.get(type) || []).filter(value => value !== callback)); },
    dispatchEvent(event) { for (const callback of [...(listeners.get(event.type) || [])]) callback(event); return true; },
  });
}
function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
}
function environment() {
  const sessionStorage = storage();
  sessionStorage.setItem('vildaCurrentPatientId', PID);
  let account = 'fictional-account', keyEpoch = 1, main = clone(payload);
  const name = events({ value: payload.name, style: {}, dataset: {} });
  const document = events({ hidden: false, readyState: 'complete', body: {}, documentElement: { classList: { contains: () => false, add() {}, remove() {} } }, getElementById: id => id === 'name' ? name : null, querySelector: () => null, querySelectorAll: () => [] });
  const window = events({ document, sessionStorage, localStorage: storage(), location: { href: 'http://localhost/index.html', pathname: '/index.html', hash: '' }, setTimeout, clearTimeout, setInterval, clearInterval,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } }, _vildaCurrentPatientId: PID, VildaGuestMode: false });
  window.window = window; window.self = window; window.parent = window;
  const records = {
    [PID]: { snapshots: [clone(snapshot)] },
    [OTHER_PID]: { snapshots: [{ ...clone(snapshot), snapshotId: 'fictional-other-version', payload: { ...clone(payload), name: 'Fikcyjny Drugi' } }] },
  };
  const vault = {
    isUnlocked: () => true, getCurrentUser: () => ({ userId: account }),
    captureSyncOperationSession: () => ({ account, keyEpoch }),
    assertSyncOperationSession: token => { if (token.account !== account || token.keyEpoch !== keyEpoch) throw new Error('fictional changed key'); },
    onUnlock() {}, onLock() {},
    getPatient: vi.fn(async id => ({ snapshots: records[id].snapshots, snapshotCount: records[id].snapshots.length })),
    getLatestSnapshot: vi.fn(async id => records[id].snapshots[0]),
    restoreSnapshotAsNew: vi.fn(async (id, snapshotId) => {
      const selected = records[id].snapshots.find(value => value.snapshotId === snapshotId);
      if (!selected) throw new Error('fictional missing version');
      const restored = { ...clone(selected), snapshotId: 'fictional-restored-version' };
      records[id].snapshots.unshift(restored);
      return { patientId: id, newSnapshotId: restored.snapshotId, snapshotCount: records[id].snapshots.length };
    }),
  };
  window.VildaVault = vault;
  window.VildaPersistence = { getStorage: () => sessionStorage, readMainSession: () => clone(main), writeMainSession: value => { main = clone(value); return true; }, clearMainSession: () => { main = null; return true; }, readClcrSession: () => null };
  new Function('window', 'globalThis', panel)(window, window);
  new Function('window', 'globalThis', exporter)(window, window);
  const api = window.VildaDataImportExport;
  const loadResults = [];
  window.VildaDataImportExport = Object.assign({}, api, { runAcceptedPatientLoad(...args) { const result = api.runAcceptedPatientLoad(...args); loadResults.push(result); return result; } });
  const applied = vi.fn(value => api.applyLoadedData(value));
  window.applyLoadedData = applied;
  const published = [];
  document.addEventListener('vilda:patient-loaded', event => { published.push(event.detail); window._vildaCurrentPatientId = event.detail.patientId; sessionStorage.setItem('vildaCurrentPatientId', event.detail.patientId); });
  const guard = [];
  window.VildaUnsavedGuard = { run: options => { guard.push(options); } };
  return { window, document, sessionStorage, vault, api, applied, published, guard, loadResults, records,
    changeAccount: () => { account = 'fictional-next-account'; keyEpoch++; }, changeKey: () => { keyEpoch++; },
  };
}
function versionConfirmation(h, patientId = PID) {
  const start = history.indexOf('function lt('), end = history.indexOf('function mt(', start);
  if (start < 0 || end < 0) throw new Error('Native version restore entry missing');
  const buttons = [];
  const create = (tag, options = {}) => {
    const node = events({ tag, textContent: options.text, disabled: false });
    node.click = () => node.dispatchEvent({ type: 'click' });
    if (tag === 'button') buttons.push(node);
    return node;
  };
  const native = new Function('b', 'i', 'w', 'O', 'S', 'C', history.slice(start, end) + ';return lt;')(h.window, create, value => value.savedAtISO, () => {}, String, String);
  const actions = { parentNode: { replaceChild() {} } };
  const context = { patientId, vault: h.vault, reload: vi.fn(), opts: { onRestored: vi.fn() } };
  native({ querySelector: selector => selector === '.vvh-act' ? actions : null }, h.records[patientId].snapshots[0], {}, {}, {}, context);
  return { confirm: buttons.find(button => button.textContent === 'Tak, przywróć'), cancel: buttons.find(button => button.textContent === 'Anuluj'), context };
}
function pendingChrome(h, { settlement = Promise.resolve({ ready: true, reason: 'restored' }), legacy = false } = {}) {
  if (legacy) delete h.window.VildaDataImportExport.whenInitialMainSessionRestoreSettled;
  else h.window.VildaDataImportExport.whenInitialMainSessionRestoreSettled = vi.fn(() => settlement);
  const start = chrome.indexOf('var re=!1,Gv_initialWait='), end = chrome.indexOf('function Tt(){', start);
  if (start < 0 || end < 0) throw new Error('Native pending load entry missing');
  return new Function('r', 'o', 'Gv_dclDone', 'setTimeout', chrome.slice(start, end) + ';Ot.poll=ae;return Ot;')(h.window, h.document, () => true, setTimeout);
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('native version restoration preserves accepted-load authority', () => {
  it('carries the exact pre-confirmation operation through version write, read, guard and identity event', async () => {
    const h = environment(), ui = versionConfirmation(h);
    ui.confirm.click(); await flush();
    expect(h.vault.restoreSnapshotAsNew).toHaveBeenCalledTimes(1);
    expect(h.vault.getLatestSnapshot).toHaveBeenCalledWith(PID);
    expect(h.applied).not.toHaveBeenCalled();
    h.guard[0].onProceed();
    expect(h.applied).toHaveBeenCalledWith(payload);
    expect(h.published).toHaveLength(1);
    expect(h.published[0]).toMatchObject({ patientId: PID, source: 'version-restore' });
    expect(h.published[0].acceptedLoadAuthority).toBeTruthy();
    expect(h.loadResults).toEqual([true]);
  });
  it('does not begin the version write or form load after confirmation is cancelled', async () => {
    const h = environment(), ui = versionConfirmation(h); ui.cancel.click(); await flush();
    expect(h.vault.restoreSnapshotAsNew).not.toHaveBeenCalled(); expect(h.applied).not.toHaveBeenCalled(); expect(h.published).toHaveLength(0);
  });
  it.each(['account', 'key', 'document', 'patient', 'visit', 'request'].flatMap(kind => ['confirmation', 'queued-write'].map(boundary => [kind, boundary])))('does not create a version after %s changes before %s', async (kind, boundary) => {
    const h = environment(), before = clone(h.records), ui = versionConfirmation(h);
    if (boundary === 'queued-write') ui.confirm.click();
    if (kind === 'account') h.changeAccount();
    if (kind === 'key') h.changeKey();
    if (kind === 'document') h.window.document = {};
    if (kind === 'patient') { h.sessionStorage.setItem('vildaCurrentPatientId', OTHER_PID); h.window._vildaCurrentPatientId = OTHER_PID; }
    if (kind === 'visit') h.api.applyLoadedData(clone(payload));
    if (kind === 'request') h.api.captureAcceptedPatientLoad({ patientId: OTHER_PID });
    if (boundary === 'confirmation') ui.confirm.click();
    await flush();
    expect(h.vault.restoreSnapshotAsNew).not.toHaveBeenCalled();
    expect(h.records).toEqual(before);
    expect(h.vault.getLatestSnapshot).not.toHaveBeenCalled();
    expect(ui.context.reload).not.toHaveBeenCalled(); expect(ui.context.opts.onRestored).not.toHaveBeenCalled();
    expect(h.applied).not.toHaveBeenCalled(); expect(h.published).toHaveLength(0);
  });
  it('does not create a version when the available capability refuses capture', async () => {
    const h = environment(), before = clone(h.records); h.window.VildaPanelPacjent = null;
    const ui = versionConfirmation(h); ui.confirm.click(); await flush();
    expect(h.vault.restoreSnapshotAsNew).not.toHaveBeenCalled(); expect(h.records).toEqual(before);
    expect(ui.context.reload).not.toHaveBeenCalled(); expect(h.applied).not.toHaveBeenCalled();
  });
  it('keeps valid historical restoration available for a target not loaded in the form', async () => {
    const h = environment(), before = clone(h.records), ui = versionConfirmation(h, OTHER_PID);
    ui.confirm.click(); await flush();
    expect(h.vault.restoreSnapshotAsNew).toHaveBeenCalledWith(OTHER_PID, 'fictional-other-version');
    expect(h.records[PID]).toEqual(before[PID]);
    expect(h.records[OTHER_PID].snapshots).toHaveLength(before[OTHER_PID].snapshots.length + 1);
    expect(h.records[OTHER_PID].snapshots[0].payload).toEqual(before[OTHER_PID].snapshots[0].payload);
    expect(h.applied).not.toHaveBeenCalled(); expect(h.published).toHaveLength(0);
    expect(h.sessionStorage.getItem('vildaCurrentPatientId')).toBe(PID);
  });
  it('keeps legacy historical restoration when the capability is absent', async () => {
    const h = environment(), before = clone(h.records); delete h.window.VildaDataImportExport.captureAcceptedPatientLoad;
    const ui = versionConfirmation(h, OTHER_PID); ui.confirm.click(); await flush();
    expect(h.vault.restoreSnapshotAsNew).toHaveBeenCalledTimes(1);
    expect(h.records[PID]).toEqual(before[PID]); expect(h.records[OTHER_PID].snapshots).toHaveLength(2);
    expect(h.applied).not.toHaveBeenCalled(); expect(h.published).toHaveLength(0);
  });
  it.each(['before-confirmation', 'latest-read', 'unsaved-guard'])('does not apply a stale account at %s', async phase => {
    const h = environment(), read = deferred();
    h.vault.getLatestSnapshot.mockReturnValue(read.promise);
    const ui = versionConfirmation(h);
    if (phase === 'before-confirmation') h.changeAccount();
    ui.confirm.click(); await flush();
    if (phase === 'latest-read') h.changeAccount();
    read.resolve(snapshot); await flush();
    if (phase === 'unsaved-guard') { expect(h.guard).toHaveLength(1); h.changeAccount(); h.guard[0].onProceed(); }
    expect(h.applied).not.toHaveBeenCalled(); expect(h.published).toHaveLength(0);
  });
  it('does not publish identity when the native apply refuses', async () => {
    const h = environment(), ui = versionConfirmation(h); h.applied.mockReturnValue(false);
    ui.confirm.click(); await flush(); h.guard[0].onProceed();
    expect(h.published).toHaveLength(0);
  });
  it('keeps the form untouched when the unsaved guard does not proceed', async () => {
    const h = environment(), ui = versionConfirmation(h); ui.confirm.click(); await flush();
    expect(h.guard).toHaveLength(1); expect(h.applied).not.toHaveBeenCalled(); expect(h.published).toHaveLength(0);
  });
});

describe('native pending navigation retains the destination read operation', () => {
  it('captures only after the real startup apply advances its sequence, so the requested patient wins', async () => {
    const h = environment(), initial = deferred();
    h.sessionStorage.setItem('vilda:pendingPatientLoad', OTHER_PID);
    const capture = vi.spyOn(h.window.VildaDataImportExport, 'captureAcceptedPatientLoad');
    const run = pendingChrome(h, { settlement: initial.promise });
    expect(run()).toBe(false); await flush();
    expect(capture).not.toHaveBeenCalled(); expect(h.vault.getPatient).not.toHaveBeenCalled();
    expect(h.sessionStorage.getItem('vilda:pendingPatientLoad')).toBe(OTHER_PID);
    const sequence = h.api.getApplyLoadedDataSequence();
    expect(h.api.applyLoadedData(clone(payload), { isSessionRestore: true })).toBe(true);
    expect(h.api.getApplyLoadedDataSequence()).toBe(sequence + 1);
    initial.resolve({ ready: true, reason: 'restored' }); await flush();
    expect(capture).toHaveBeenCalledExactlyOnceWith({ patientId: OTHER_PID });
    expect(h.vault.getPatient).toHaveBeenCalledExactlyOnceWith(OTHER_PID);
    expect(h.applied).toHaveBeenCalledWith(h.records[OTHER_PID].snapshots[0].payload);
    expect(h.published).toHaveLength(1); expect(h.published[0].patientId).toBe(OTHER_PID);
    expect(h.loadResults).toEqual([true]);
    expect(h.sessionStorage.getItem('vilda:pendingPatientLoad')).toBeNull();
  });

  it('re-reads an overwritten intent after settlement without reading or applying the old target', async () => {
    const h = environment(), initial = deferred();
    h.sessionStorage.setItem('vilda:pendingPatientLoad', OTHER_PID);
    pendingChrome(h, { settlement: initial.promise })(); await flush();
    h.sessionStorage.setItem('vilda:pendingPatientLoad', PID);
    initial.resolve({ ready: true, reason: 'restored' }); await flush();
    expect(h.vault.getPatient).toHaveBeenCalledExactlyOnceWith(PID);
    expect(h.applied).toHaveBeenCalledExactlyOnceWith(payload);
    expect(h.published).toHaveLength(1); expect(h.published[0].patientId).toBe(PID);
  });

  it('does nothing when the pending intent is removed during the startup wait', async () => {
    const h = environment(), initial = deferred();
    h.sessionStorage.setItem('vilda:pendingPatientLoad', OTHER_PID);
    pendingChrome(h, { settlement: initial.promise })(); await flush();
    h.sessionStorage.removeItem('vilda:pendingPatientLoad');
    initial.resolve({ ready: true, reason: 'restored' }); await flush();
    expect(h.vault.getPatient).not.toHaveBeenCalled(); expect(h.applied).not.toHaveBeenCalled();
    expect(h.published).toHaveLength(0);
  });

  it.each(['account', 'key', 'patient', 'visit', 'guest', 'auth-boot'])('cancels its same queued intent when %s changes during startup', async kind => {
    const h = environment(), initial = deferred();
    h.sessionStorage.setItem('vilda:pendingPatientLoad', OTHER_PID);
    pendingChrome(h, { settlement: initial.promise })(); await flush();
    if (kind === 'account') h.changeAccount();
    if (kind === 'key') h.changeKey();
    if (kind === 'patient') h.sessionStorage.setItem('vildaCurrentPatientId', OTHER_PID);
    if (kind === 'visit') h.window.localStorage.setItem('vilda:sharedLoadSeq', 'fictional-new-visit');
    if (kind === 'guest') h.window.VildaGuestMode = true;
    if (kind === 'auth-boot') h.window.VildaAuthUI = { isBootReady: () => false };
    initial.resolve({ ready: true, reason: 'restored' }); await flush();
    expect(h.vault.getPatient).not.toHaveBeenCalled(); expect(h.applied).not.toHaveBeenCalled();
    expect(h.published).toHaveLength(0);
    expect(h.sessionStorage.getItem('vilda:pendingPatientLoad')).toBeNull();
  });

  it('rejects a replaced document without consuming the next document’s queued intent', async () => {
    const h = environment(), initial = deferred();
    h.sessionStorage.setItem('vilda:pendingPatientLoad', OTHER_PID);
    pendingChrome(h, { settlement: initial.promise })(); await flush();
    h.window.document = {};
    initial.resolve({ ready: true, reason: 'restored' }); await flush();
    expect(h.vault.getPatient).not.toHaveBeenCalled(); expect(h.applied).not.toHaveBeenCalled();
    expect(h.sessionStorage.getItem('vilda:pendingPatientLoad')).toBe(OTHER_PID);
  });

  it.each(['persistence', 'session-fallback'])('ignores foreign-tab load notifications using the existing %s tab identity', async identity => {
    const h = environment(), initial = deferred();
    if (identity === 'persistence') h.window.VildaPersistence.getTabId = () => 'fictional-tab-a';
    else h.sessionStorage.setItem('vildaTabIdV1', 'fictional-tab-a');
    h.window.localStorage.setItem('vilda:sharedLoadSeq', 'fictional-tab-a:1');
    h.sessionStorage.setItem('vilda:pendingPatientLoad', OTHER_PID);
    pendingChrome(h, { settlement: initial.promise })(); await flush();
    for (const marker of ['fictional-tab-b:2', 'fictional-tab-c:3']) {
      h.window.localStorage.setItem('vilda:sharedLoadSeq', marker);
      h.window.dispatchEvent({ type: 'storage', key: 'vilda:sharedLoadSeq', newValue: marker });
      expect(h.sessionStorage.getItem('vilda:pendingPatientLoad')).toBe(OTHER_PID);
    }
    initial.resolve({ ready: true, reason: 'restored' }); await flush();
    expect(h.vault.getPatient).toHaveBeenCalledExactlyOnceWith(OTHER_PID);
    expect(h.loadResults).toEqual([true]); expect(h.published[0].patientId).toBe(OTHER_PID);
  });

  it.each([
    ['same then foreign', ['fictional-tab-a:2', 'fictional-tab-b:3']],
    ['foreign then same then foreign', ['fictional-tab-b:2', 'fictional-tab-a:3', 'fictional-tab-b:4']],
  ])('remembers same-tab supersession even after another tab overwrites the shared marker: %s', async (_label, markers) => {
    const h = environment(), initial = deferred();
    h.window.VildaPersistence.getTabId = () => 'fictional-tab-a';
    h.window.localStorage.setItem('vilda:sharedLoadSeq', 'fictional-tab-a:1');
    h.sessionStorage.setItem('vilda:pendingPatientLoad', OTHER_PID);
    pendingChrome(h, { settlement: initial.promise })(); await flush();
    for (const marker of markers) {
      h.window.localStorage.setItem('vilda:sharedLoadSeq', marker);
      h.window.dispatchEvent({ type: 'storage', key: 'vilda:sharedLoadSeq', newValue: marker });
    }
    expect(h.sessionStorage.getItem('vilda:pendingPatientLoad')).toBeNull();
    initial.resolve({ ready: true, reason: 'restored' }); await flush();
    expect(h.vault.getPatient).not.toHaveBeenCalled(); expect(h.applied).not.toHaveBeenCalled();
    expect(h.published).toHaveLength(0);
  });

  it.each([
    ['same tab at settlement', 'fictional-tab-a', 'fictional-tab-a:2'],
    ['missing tab identity', '', 'fictional-tab-b:2'],
    ['legacy marker', 'fictional-tab-a', '2'],
    ['unattributed marker', 'fictional-tab-a', ':2'],
    ['malformed foreign marker', 'fictional-tab-a', 'fictional-tab-b:unknown'],
  ])('keeps conservative cancellation for %s without a storage notification', async (_label, tab, marker) => {
    const h = environment(), initial = deferred();
    h.window.VildaPersistence.getTabId = () => tab;
    h.window.localStorage.setItem('vilda:sharedLoadSeq', 'fictional-tab-a:1');
    h.sessionStorage.setItem('vilda:pendingPatientLoad', OTHER_PID);
    pendingChrome(h, { settlement: initial.promise })(); await flush();
    h.window.localStorage.setItem('vilda:sharedLoadSeq', marker);
    initial.resolve({ ready: true, reason: 'restored' }); await flush();
    expect(h.sessionStorage.getItem('vilda:pendingPatientLoad')).toBeNull();
    expect(h.vault.getPatient).not.toHaveBeenCalled(); expect(h.applied).not.toHaveBeenCalled();
  });

  it('never removes a replacement intent when the waiting account/key is no longer current', async () => {
    const h = environment(), initial = deferred();
    h.sessionStorage.setItem('vilda:pendingPatientLoad', OTHER_PID);
    pendingChrome(h, { settlement: initial.promise })(); await flush();
    h.changeKey(); h.sessionStorage.setItem('vilda:pendingPatientLoad', PID);
    initial.resolve({ ready: true, reason: 'restored' }); await flush();
    expect(h.vault.getPatient).not.toHaveBeenCalled(); expect(h.applied).not.toHaveBeenCalled();
    expect(h.sessionStorage.getItem('vilda:pendingPatientLoad')).toBe(PID);
  });

  it.each(['vilda:user-state-cleared', 'input', 'change'])('a newer user %s cancels the old intent and cannot resurrect it after settlement', async type => {
    const h = environment(), initial = deferred();
    h.sessionStorage.setItem('vilda:pendingPatientLoad', OTHER_PID);
    const run = pendingChrome(h, { settlement: initial.promise }); run(); await flush();
    h.document.dispatchEvent({ type, isTrusted: true });
    expect(h.sessionStorage.getItem('vilda:pendingPatientLoad')).toBeNull();
    initial.resolve({ ready: true, reason: 'restored' }); await flush(); run(); await flush();
    expect(h.vault.getPatient).not.toHaveBeenCalled(); expect(h.applied).not.toHaveBeenCalled();
  });

  it('a newer accepted native load supersedes the queued cross-page target permanently', async () => {
    const h = environment(), initial = deferred();
    h.sessionStorage.setItem('vilda:pendingPatientLoad', PID);
    pendingChrome(h, { settlement: initial.promise })(); await flush();
    const token = h.api.captureAcceptedPatientLoad({ patientId: OTHER_PID });
    expect(h.api.runAcceptedPatientLoad(token, h.records[OTHER_PID].snapshots[0].payload, {
      apply: value => h.window.applyLoadedData(value),
      publish: detail => h.document.dispatchEvent(new h.window.CustomEvent('vilda:patient-loaded', { detail: { patientId: OTHER_PID, source: 'pick', ...detail } })),
    })).toBe(true);
    initial.resolve({ ready: true, reason: 'superseded-load' }); await flush();
    expect(h.vault.getPatient).not.toHaveBeenCalled();
    expect(h.applied).toHaveBeenCalledOnce(); expect(h.published).toHaveLength(1);
    expect(h.published[0].patientId).toBe(OTHER_PID);
    expect(h.sessionStorage.getItem('vilda:pendingPatientLoad')).toBeNull();
  });

  it('pagehide retires the old document’s wait while retaining the intent for its next document', async () => {
    const h = environment(), initial = deferred();
    h.sessionStorage.setItem('vilda:pendingPatientLoad', OTHER_PID);
    pendingChrome(h, { settlement: initial.promise })(); await flush();
    h.window.dispatchEvent({ type: 'pagehide' });
    initial.resolve({ ready: true, reason: 'restored' }); await flush();
    expect(h.vault.getPatient).not.toHaveBeenCalled(); expect(h.applied).not.toHaveBeenCalled();
    expect(h.sessionStorage.getItem('vilda:pendingPatientLoad')).toBe(OTHER_PID);
  });

  it.each(['rejection', 'invalid-result'])('does not consume or load after settlement %s', async kind => {
    const h = environment(), initial = deferred();
    h.sessionStorage.setItem('vilda:pendingPatientLoad', OTHER_PID);
    const run = pendingChrome(h, { settlement: initial.promise }); run(); await flush();
    if (kind === 'rejection') initial.reject(new Error('fictional startup failure')); else initial.resolve(null);
    await flush(); run(); await flush();
    expect(h.vault.getPatient).not.toHaveBeenCalled(); expect(h.applied).not.toHaveBeenCalled();
    expect(h.sessionStorage.getItem('vilda:pendingPatientLoad')).toBe(OTHER_PID);
  });

  it('allows a fresh explicit load after a completed unsuccessful initial restore', async () => {
    const h = environment(), initial = deferred();
    h.sessionStorage.setItem('vilda:pendingPatientLoad', OTHER_PID);
    pendingChrome(h, { settlement: initial.promise })(); await flush();
    initial.resolve({ ready: false, reason: 'unsupported-session' }); await flush();
    expect(h.vault.getPatient).toHaveBeenCalledExactlyOnceWith(OTHER_PID);
    expect(h.loadResults).toEqual([true]); expect(h.published[0].patientId).toBe(OTHER_PID);
  });

  it('actual late settlement resumes after the existing twelve-second polling window has ended', async () => {
    const h = environment(), initial = deferred();
    h.sessionStorage.setItem('vilda:pendingPatientLoad', OTHER_PID);
    pendingChrome(h, { settlement: initial.promise })(); await flush();
    await vi.advanceTimersByTimeAsync(13_000);
    expect(h.vault.getPatient).not.toHaveBeenCalled(); expect(h.applied).not.toHaveBeenCalled();
    expect(h.sessionStorage.getItem('vilda:pendingPatientLoad')).toBe(OTHER_PID);
    initial.resolve({ ready: true, reason: 'restored' }); await flush();
    expect(h.vault.getPatient).toHaveBeenCalledExactlyOnceWith(OTHER_PID);
    expect(h.loadResults).toEqual([true]);
  });

  it('actual late auth boot starts the wait after polling has ended, with the settled account key', async () => {
    const h = environment(); let boot = false;
    h.window.VildaAuthUI = { isBootReady: () => boot, isGuestMode: () => false };
    h.sessionStorage.setItem('vilda:pendingPatientLoad', OTHER_PID);
    pendingChrome(h)(); await vi.advanceTimersByTimeAsync(13_000);
    expect(h.vault.getPatient).not.toHaveBeenCalled();
    h.changeKey(); boot = true;
    h.document.dispatchEvent({ type: 'vilda:auth-boot-settled' }); await flush();
    expect(h.vault.getPatient).toHaveBeenCalledExactlyOnceWith(OTHER_PID);
    expect(h.loadResults).toEqual([true]);
  });

  it('uses the existing immediate path when the legacy initial-settlement API is absent', async () => {
    const h = environment(); h.sessionStorage.setItem('vilda:pendingPatientLoad', PID);
    expect(pendingChrome(h, { legacy: true })()).toBe(true); await flush();
    expect(h.vault.getPatient).toHaveBeenCalledExactlyOnceWith(PID);
    expect(h.loadResults).toEqual([true]); expect(h.published[0].acceptedLoadAuthority).toBeTruthy();
  });

  it('loads and publishes the exact requested patient after its original read', async () => {
    const h = environment(); h.sessionStorage.setItem('vilda:pendingPatientLoad', PID);
    expect(pendingChrome(h)()).toBe(false); await flush();
    expect(h.applied).toHaveBeenCalledWith(payload); expect(h.published).toHaveLength(1);
    expect(h.published[0].acceptedLoadAuthority).toBeTruthy(); expect(h.sessionStorage.getItem('vilda:pendingPatientLoad')).toBeNull();
    expect(h.loadResults).toEqual([true]);
  });
  it.each(['account', 'key', 'document', 'replacement-intent'])('refuses the old completion after %s changes', async kind => {
    const h = environment(), read = deferred(); h.vault.getPatient.mockReturnValue(read.promise);
    h.sessionStorage.setItem('vilda:pendingPatientLoad', PID); pendingChrome(h)(); await flush();
    expect(h.vault.getPatient).toHaveBeenCalledOnce();
    if (kind === 'account') h.changeAccount();
    if (kind === 'key') h.changeKey();
    if (kind === 'document') h.window.document = {};
    if (kind === 'replacement-intent') h.sessionStorage.setItem('vilda:pendingPatientLoad', 'fictional-newer-request');
    read.resolve({ snapshots: [snapshot], snapshotCount: 1 }); await flush();
    expect(h.applied).not.toHaveBeenCalled(); expect(h.published).toHaveLength(0);
    if (kind === 'replacement-intent') expect(h.sessionStorage.getItem('vilda:pendingPatientLoad')).toBe('fictional-newer-request');
  });
  it('does not publish identity after a failed read', async () => {
    const h = environment(); h.vault.getPatient.mockRejectedValue(new Error('fictional read failure'));
    h.sessionStorage.setItem('vilda:pendingPatientLoad', PID); pendingChrome(h)(); await flush();
    expect(h.applied).not.toHaveBeenCalled(); expect(h.published).toHaveLength(0);
  });
  it('refuses a null capability instead of taking the legacy path', async () => {
    const h = environment(); h.window.VildaPanelPacjent = null;
    h.sessionStorage.setItem('vilda:pendingPatientLoad', PID); pendingChrome(h)(); await flush();
    expect(h.vault.getPatient).not.toHaveBeenCalled(); expect(h.applied).not.toHaveBeenCalled(); expect(h.published).toHaveLength(0);
  });
});
