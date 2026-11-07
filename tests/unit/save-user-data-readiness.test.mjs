import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const PID = 'fictional-save-readiness-patient';
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const patient = () => ({ version: 1, name: 'Fikcyjny Pacjent Gotowości Zapisu',
  user: { sex: 'M', age: 12, ageMonths: 0, height: 145, weight: 35 } });

// DIX is real. The fake vault implements only its actual public owner/session
// and immutable committed-result boundary; it cannot manufacture a witness from
// an arbitrary PID/snapshot pair or from the later live model.
function environment() {
  let generation = 1, owner = 'fictional-readiness-owner', unlocked = true, snapshot = 0, saveImpl = null;
  const committed = new WeakMap(), published = [], listeners = {}, storage = new Map([['vildaCurrentPatientId', PID]]);
  const collect = vi.fn(patient), notify = vi.fn(), feedback = vi.fn();
  const vault = {
    isUnlocked: () => unlocked, getCurrentUser: () => unlocked ? { userId: owner } : null,
    captureSyncOperationSession: () => Object.freeze({ owner, generation }),
    assertSyncOperationSession(token) {
      if (!unlocked || token.owner !== owner || token.generation !== generation) throw new Error('Fikcyjna zmiana sesji');
      return true;
    },
    getCommittedSavePayload: result => clone(committed.get(result)?.payload),
    savePatient: vi.fn(async payload => {
      const result = { patientId: PID, snapshotId: `fictional-readiness-snapshot-${++snapshot}`,
        savedAtISO: '2026-11-06T15:00:00Z', snapshotCount: snapshot };
      committed.set(result, { payload: clone({ ...payload, _contentAtISO: result.savedAtISO }) });
      if (saveImpl) await saveImpl(result, payload);
      return result;
    }),
  };
  const document = { readyState: 'loading', getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    getElementsByName: () => [],
    addEventListener(type, callback) { (listeners[type] ||= []).push(callback); }, removeEventListener() {},
    dispatchEvent(event) { published.push(event); for (const callback of listeners[event.type] || []) callback(event); return true; },
  };
  const win = { VildaVault: vault, document, location: { pathname: '/index.html' },
    setTimeout: () => 0, clearTimeout() {}, addEventListener() {}, Event,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    sessionStorage: { getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
    VildaAuthUI: { isBootReady: () => true }, VildaDobAge: { restorePending: () => false },
    VildaDocproStatePersistence: { isReady: () => true, isRestoring: () => false },
    VildaPanelPacjent: { nieaktualny: () => false },
    VildaSaveStatusIndicator: { notifySaveFailed: notify, getCurrentDecision: () => ({ ready: false }) },
    VildaSaveFeedback: { capture: () => Object.freeze({ generation }), isCurrent: token => token.generation === generation, pokaz: feedback },
  };
  loadBrowserScript('vilda_data_import_export.js', win);
  const api = win.VildaDataImportExport;
  return { win, vault, api, collect, notify, feedback, published, options: { collectUserData: collect },
    setSave(callback) { saveImpl = callback; },
    changeOwner() { owner = 'fictional-readiness-next-owner'; generation++; },
    lock() { unlocked = false; generation++; },
    unlock() { unlocked = true; generation++; },
    selector(receipt) { return { patientId: receipt.patientId, snapshotId: receipt.snapshotId, applySequence: api.getApplyLoadedDataSequence() }; },
  };
}

describe('save collection and durable queue require actual producer/owner readiness', () => {
  it.each(['locked', 'restoring', 'unavailable'])('routes the %s refusal to Save feedback without reading patient data', kind => {
    const h = environment(), legacy = vi.fn();
    h.win.VildaStatusBar = { pokaz: legacy };
    h.feedback.mockReturnValue(true);
    if (kind === 'locked') h.lock();
    if (kind === 'restoring') h.win.__vildaPersistRestoring = true;
    if (kind === 'unavailable') h.win.VildaVault = null;
    expect(h.api.saveUserData(h.options)).toBeNull();
    expect(h.feedback).toHaveBeenCalledOnce();
    expect(h.feedback.mock.calls[0][0]).toMatchObject({ scope: expect.any(Object),
      ton: kind === 'unavailable' ? 'blad' : 'uwaga' });
    expect(legacy).not.toHaveBeenCalled();
    expect(h.collect).not.toHaveBeenCalled(); expect(h.vault.savePatient).not.toHaveBeenCalled();
  });

  it.each([
    ['auth-pending', h => { h.win.VildaAuthUI.isBootReady = () => false; }],
    ['panel-stale', h => { h.win.VildaPanelPacjent.nieaktualny = () => true; }],
    ['restore-in-progress', h => { h.win.__vildaPersistRestoring = true; }],
    ['restore-in-progress', h => { h.win.__vildaLustroWpis = true; }],
    ['dob-restore-pending', h => { h.win.VildaDobAge.restorePending = () => true; }],
    ['docpro-restore-pending', h => { h.win.VildaDocproStatePersistence.isRestoring = () => true; }],
    ['docpro-restore-pending', h => { h.win.VildaDocproStatePersistence.isReady = () => false; }],
    ['owner-unavailable', h => { h.vault.getCurrentUser = () => null; }],
    ['owner-unavailable', h => { delete h.vault.getCurrentUser; }],
    ['owner-unavailable', h => { delete h.vault.captureSyncOperationSession; }],
    ['owner-unavailable', h => { delete h.vault.assertSyncOperationSession; }],
    ['vault-locked', h => { h.lock(); }],
  ])('blocks %s before invoking the collector', async (reason, prepare) => {
    const h = environment(); prepare(h);
    expect(h.api.getSaveReadiness()).toEqual({ ready: false, reason });
    expect(Object.isFrozen(h.api.getSaveReadiness())).toBe(true);
    expect(await h.api.saveUserDataWithReceipt(h.options)).toMatchObject({ saved: false });
    expect(h.collect).not.toHaveBeenCalled(); expect(h.vault.savePatient).not.toHaveBeenCalled();
  });

  it.each(['capture', 'assert', 'changed-owner'])('rejects an unusable %s session ticket before invoking the collector', async stage => {
    const h = environment();
    if (stage === 'capture') h.vault.captureSyncOperationSession = () => { throw new Error('Fikcyjny brak sesji'); };
    if (stage === 'assert') h.vault.assertSyncOperationSession = () => { throw new Error('Fikcyjna nieaktualna sesja'); };
    if (stage === 'changed-owner') {
      const capture = h.vault.captureSyncOperationSession;
      h.vault.captureSyncOperationSession = () => { h.changeOwner(); return capture(); };
    }
    expect(await h.api.saveUserDataWithReceipt(h.options)).toMatchObject({ saved: false });
    expect(h.collect).not.toHaveBeenCalled(); expect(h.vault.savePatient).not.toHaveBeenCalled();
  });

  it('rechecks a restore that starts after collection, before the queued durable write', async () => {
    const h = environment(), operation = h.api.saveUserDataWithReceipt(h.options);
    expect(h.collect).toHaveBeenCalledOnce(); h.win.__vildaPersistRestoring = true;
    expect(await operation).toEqual({ saved: false, reason: 'not-ready' });
    expect(h.vault.savePatient).not.toHaveBeenCalled();
  });

  it.each(['restore', 'owner'])('rejects %s started inside the collector before queueing', async cause => {
    const h = environment(); h.collect.mockImplementation(() => {
      if (cause === 'restore') h.win.__vildaPersistRestoring = true; else h.changeOwner();
      return patient();
    });
    expect(await h.api.saveUserDataWithReceipt(h.options)).toMatchObject({ saved: false });
    expect(h.vault.savePatient).not.toHaveBeenCalled();
  });

  it('allows an immediate explicit save during ordinary debounce, quarantine and unpublished SSI state', async () => {
    const h = environment(); h.win.__vildaPersistPauseUntil = Date.now() + 5000;
    h.win.__vildaPersistClearUntil = Date.now() + 5000;
    h.win.VildaPersistence = { isClearInProgress: () => true, isAutosaveSuppressed: () => true };
    expect(h.api.getSaveReadiness()).toEqual({ ready: true, reason: null });
    const receipt = await h.api.saveUserDataWithReceipt(h.options);
    expect(receipt).toMatchObject({ saved: true, referenceVerified: true });
    expect(h.collect).toHaveBeenCalledOnce(); expect(h.vault.savePatient).toHaveBeenCalledOnce();
  });

  it('covers app-ready and both startup frames when a main snapshot is waiting', async () => {
    const h = environment(), frames = [], ready = [], apply = vi.fn(() => true);
    h.win.requestAnimationFrame = callback => { frames.push(callback); return frames.length; };
    h.win.cancelAnimationFrame = () => {};
    h.win.VildaPersistence = { getStorage: () => ({}), readMainSession: () => patient() };
    h.api.initMainSessionPersistence({ ...h.options, applyLoadedData: apply,
      vildaAppOnReady: (_name, callback) => ready.push(callback) });
    for (const phase of ['app-ready', 'first-frame', 'second-frame']) {
      expect(h.api.getSaveReadiness(), phase).toEqual({ ready: false, reason: 'main-session-restore-pending' });
      expect(h.api.isMainSessionRestorePending(), phase).toBe(true);
      expect(h.api.isMainSessionAutosavePaused(), phase).toBe(true);
      expect(h.collect).not.toHaveBeenCalled(); expect(h.vault.savePatient).not.toHaveBeenCalled();
      if (phase === 'app-ready') ready.shift()();
      else frames.shift()();
    }
    expect(apply).toHaveBeenCalledOnce();
  });

  it.each([null, undefined])('does not delay a fresh form with no existing main snapshot (%s)', async main => {
    const h = environment();
    h.win.VildaPersistence = { getStorage: () => ({}), readMainSession: () => main };
    h.api.initMainSessionPersistence(h.options);
    expect(h.api.getSaveReadiness()).toEqual({ ready: true, reason: null });
    expect(await h.api.saveUserDataWithReceipt(h.options)).toMatchObject({ saved: true, referenceVerified: true });
  });

  it('allows newer edits after auth settles to supersede an older startup restore before its queued RAF', async () => {
    const h = environment(), frames = new Map(), apply = vi.fn(); let nextFrame = 0;
    let main = { ...patient(), user: { ...patient().user, weight: 38, height: 133 } };
    h.win.requestAnimationFrame = callback => { frames.set(++nextFrame, callback); return nextFrame; };
    h.win.cancelAnimationFrame = id => frames.delete(id);
    h.win.VildaPersistence = { getStorage: () => ({}), readMainSession: () => clone(main),
      writeMainSession(value) { main = clone(value); return true; }, clearMainSession() { main = null; } };
    const options = { ...h.options, anyDataEntered: () => true, applyLoadedData: apply };
    h.api.initMainSessionPersistence(options); h.lock(); h.win.VildaAuthUI.isBootReady = () => false;
    expect(h.api.restoreMainSessionIfAny()).toBe(false); expect(h.api.isMainSessionRestorePending()).toBe(true);
    h.unlock(); h.win.VildaAuthUI.isBootReady = () => true;
    h.win.document.dispatchEvent(new h.win.CustomEvent('vilda:auth-boot-settled'));
    expect(frames.size).toBe(1); expect(h.api.isMainSessionRestorePending()).toBe(true);
    h.collect.mockImplementation(() => ({ ...patient(), user: { ...patient().user, weight: 40, height: 135 } }));
    const controls = Object.fromEntries(Object.entries({ name: patient().name, age: '12', ageMonths: '0', sex: 'M', weight: '40', height: '135' })
      .map(([id, value]) => [id, { id, value, style: {}, dataset: {} }]));
    h.win.document.getElementById = id => controls[id] || null;
    expect(h.api.getSaveReadiness()).toEqual({ ready: true, reason: null });
    expect(await h.api.saveUserDataWithReceipt(options)).toMatchObject({ saved: true, referenceVerified: true });
    expect(h.api.isMainSessionRestorePending()).toBe(false); expect(frames.size).toBe(0);
    h.api.saveMainSessionNow({ ...options, force: true });
    expect(main.user).toMatchObject({ weight: 40, height: 135 }); expect(apply).not.toHaveBeenCalled();
    expect(h.win.lastLoadedData.user).toMatchObject({ weight: 40, height: 135 });
  });

  it('blocks reentrant Save inside the real Clear producer, then allows fresh user data during its quarantine', async () => {
    const h = environment(); let reentrant, during;
    h.win.VildaPersistence = { clearUserState() {
      during = h.api.getSaveReadiness(); reentrant = h.api.saveUserDataWithReceipt(h.options);
      h.win.__vildaPersistClearUntil = Date.now() + 2500;
    } };
    h.api.clearAllData();
    expect(during).toEqual({ ready: false, reason: 'clear-in-progress' });
    expect(await reentrant).toMatchObject({ saved: false }); expect(h.collect).not.toHaveBeenCalled();
    expect(h.api.getSaveReadiness()).toEqual({ ready: true, reason: null });
    expect(await h.api.saveUserDataWithReceipt(h.options)).toMatchObject({ saved: true, referenceVerified: true });
  });

  it('fences a queued save when an actual Clear completes before its microtask', async () => {
    const h = environment(), operation = h.api.saveUserDataWithReceipt(h.options);
    h.api.clearAllData();
    expect(h.api.getSaveReadiness().ready).toBe(true);
    expect(await operation).toEqual({ saved: false, reason: 'not-confirmed' });
    expect(h.vault.savePatient).not.toHaveBeenCalled();
  });

  it('keeps explicit Restore protected through final synchronous recompute callbacks', async () => {
    const h = environment(); let during, reentrant;
    h.api.restoreLoadedState({ data: patient(), anyDataEntered: () => false,
      calculateGrowthAdvanced() { during = h.api.getSaveReadiness(); reentrant = h.api.saveUserDataWithReceipt(h.options); } });
    expect(during).toEqual({ ready: false, reason: 'restore-in-progress' });
    expect(await reentrant).toMatchObject({ saved: false }); expect(h.collect).not.toHaveBeenCalled();
    expect(h.api.getSaveReadiness().ready).toBe(true);
  });
});

describe('committed witness lifetime and own completion ordering', () => {
  it('retains the immutable commit through later edits but invalidates it at actual explicit Restore', async () => {
    const h = environment(), saved = await h.api.saveUserDataWithReceipt(h.options), selector = h.selector(saved);
    h.collect.mockImplementation(() => ({ ...patient(), birth: { head: '29' } }));
    expect(h.api.getCommittedSaveWitness(selector).payload).not.toHaveProperty('birth');
    h.api.restoreLoadedState({ data: patient(), anyDataEntered: () => false });
    expect(h.api.getCommittedSaveWitness(selector)).toBeNull();
  });

  it('does not replace the newer actual committed witness when an older result returns late', async () => {
    const h = environment(), releases = [];
    h.setSave(() => new Promise(resolve => { releases.push(resolve); }));
    const first = h.api.saveUserDataWithReceipt(h.options); await Promise.resolve();
    h.collect.mockImplementation(() => ({ ...patient(), birth: { head: '29' } }));
    const second = h.api.saveUserDataWithReceipt(h.options); await Promise.resolve();
    releases[1](); const recent = await second;
    expect(recent).toMatchObject({ saved: true, referenceVerified: true });
    const recentWitness = h.api.getCommittedSaveWitness(h.selector(recent));
    releases[0](); const earlier = await first;
    expect(earlier).toMatchObject({ saved: true, referenceVerified: false });
    expect(h.api.getCommittedSaveWitness(h.selector(recent))).toEqual(recentWitness);
    expect(h.api.getCommittedSaveWitness(h.selector(earlier))).toBeNull();
    const saveEvents = h.published.filter(event => event.detail?.source === 'save');
    expect(saveEvents).toHaveLength(1); expect(saveEvents[0].detail.snapshotId).toBe(recent.snapshotId);
    expect(h.win.lastLoadedData.birth).toEqual({ head: '29' });
  });
});
