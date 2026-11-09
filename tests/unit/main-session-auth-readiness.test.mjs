import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

// Real main-session orchestrator; only browser events, storage, frame scheduling
// and authentication are controlled. Every record below is explicitly fictional.
function harness({ patientId = 'fictional-a', locked = true, bootReady = false, auth = true } = {}) {
  const events = () => {
    const listeners = new Map();
    return {
      addEventListener(type, callback) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(callback);
      },
      removeEventListener(type, callback) { listeners.get(type)?.delete(callback); },
      dispatchEvent(event) { [...(listeners.get(event.type) || [])].forEach(callback => callback(event)); return true; },
      count(type) { return listeners.get(type)?.size || 0; },
      callbacks(type) { return [...(listeners.get(type) || [])]; },
    };
  };
  const document = { ...events(), readyState: 'complete',
    getElementById: id => id === 'intakePal' ? { value: '' } : null,
    querySelector: () => null, querySelectorAll: () => [] };
  const frames = new Map(), timers = new Map(), ready = [], applied = [], writes = [];
  const local = new Map(), sharedSignals = [];
  let frameId = 0, timerId = 0, summaries = 0;
  let owner = patientId, unlocked = !locked, readyFlag = bootReady;
  let session = { version: 1, name: 'FIKCYJNY Pacjent A', user: { sex: 'M', age: 13, height: 159, weight: 47,
    pubertyAssessment: { version: 99, fictionalMarker: ['opaque', null, 1] } } };
  const original = JSON.parse(JSON.stringify(session));
  const unlockListeners = [], lockListeners = [];
  const vault = { isUnlocked: () => unlocked,
    onUnlock: callback => unlockListeners.push(callback), onLock: callback => lockListeners.push(callback) };
  const win = { ...events(), document, VildaVault: vault,
    updateProfessionalSummaryCard: () => { summaries += 1; },
    VildaAuthUI: auth ? { isBootReady: () => readyFlag } : undefined,
    sessionStorage: { getItem: key => key === 'vildaCurrentPatientId' ? owner : null },
    localStorage: { getItem: key => local.get(key) ?? null,
      setItem(key, value) { local.set(key, value); if (key === 'vilda:sharedLoadSeq') sharedSignals.push(value); },
      removeItem: key => local.delete(key) },
    requestAnimationFrame: callback => { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: id => frames.delete(id),
    setTimeout: callback => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: id => timers.delete(id),
    location: { pathname: '/index.html' },
    Event: class { constructor(type) { this.type = type; } },
    CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } },
    VildaPersistence: {
      getStorage: () => ({}), getTabId: () => 'fictional-tab', readMainSession: () => session,
      writeMainSession: value => { writes.push(value); session = value; return true; },
      clearMainSession: () => { session = null; },
    },
  };
  new Function('window', 'globalThis', 'setTimeout', 'clearTimeout',
    fs.readFileSync('vilda_data_import_export.js', 'utf8'))(win, win, win.setTimeout, win.clearTimeout);
  // Presentation subscribes once for the document lifetime, before any restore
  // operation. Cleanup must preserve these exact callbacks, not just their count.
  const initialClearListeners = {
    document: document.callbacks('vilda:user-state-cleared'),
    window: win.callbacks('vilda:user-state-cleared'),
  };
  const api = win.VildaDataImportExport;
  api.initMainSessionPersistence({
    vildaAppOnReady: (_name, callback) => ready.push(callback),
    anyDataEntered: () => false,
    collectUserData: () => ({ version: 1, name: 'FIKCYJNY częściowy formularz', user: { height: 1 } }),
    applyLoadedData: (payload, options) => applied.push({ payload, options }),
  });
  const frame = () => {
    const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback());
  };
  const tick = () => {
    const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(callback => callback());
  };
  return { win, api, applied, writes, sharedSignals, original, frames, timers, unlockListeners, lockListeners, frame, tick, initialClearListeners,
    summaries: () => summaries, session: () => session, replaceSession: value => { session = value; }, owner: value => { owner = value; },
    start: () => { ready.forEach(callback => callback()); frame(); frame(); },
    unlock: () => { unlocked = true; unlockListeners.forEach(callback => callback({ trigger: 'restore' })); },
    lock: () => { unlocked = false; lockListeners.forEach(callback => callback('manual')); },
    settle: () => { readyFlag = true; document.dispatchEvent({ type: 'vilda:auth-boot-settled' }); },
  };
}

const pending = h => h.api.isMainSessionRestorePending();
const clean = h => {
  expect(h.win.document.count('vilda:auth-boot-settled')).toBe(0);
  expect(h.win.document.count('vilda:patient-loaded')).toBe(0);
  expect(h.win.document.callbacks('vilda:user-state-cleared')).toEqual(h.initialClearListeners.document);
  expect(h.win.callbacks('vilda:user-state-cleared')).toEqual(h.initialClearListeners.window);
  expect(h.win.count('pageshow')).toBe(0);
};

describe('Saved main session waits for the owner authentication boot to finish', () => {
  it('removes each cancelled/resumed operation callback while preserving the original presentation listeners', () => {
    const h = harness();
    expect(h.initialClearListeners.document).toHaveLength(1);
    expect(h.initialClearListeners.window).toHaveLength(1);
    const pendingCallbacks = () => {
      const result = {};
      for (const [name, target] of [['document', h.win.document], ['window', h.win]]) {
        const callbacks = target.callbacks('vilda:user-state-cleared');
        expect(callbacks).toEqual(expect.arrayContaining(h.initialClearListeners[name]));
        result[name] = callbacks.filter(callback => !h.initialClearListeners[name].includes(callback));
        expect(result[name]).toHaveLength(1);
      }
      expect(h.win.document.count('vilda:auth-boot-settled')).toBe(1);
      expect(h.win.document.count('vilda:patient-loaded')).toBe(1);
      expect(h.win.count('pageshow')).toBe(1);
      return result;
    };
    h.start(); const first = pendingCallbacks();
    h.win.document.dispatchEvent({ type: 'vilda:user-state-cleared' });
    expect(pending(h)).toBe(false); clean(h);
    expect(h.win.vildaSession.restore()).toBe(false);
    const second = pendingCallbacks();
    expect(second.document[0]).not.toBe(first.document[0]);
    expect(second.window[0]).not.toBe(first.window[0]);
    h.unlock(); h.settle(); h.frame();
    expect(h.applied).toHaveLength(1); clean(h);
    h.unlock(); h.settle(); h.frame();
    expect(h.applied).toHaveLength(1); clean(h);
  });

  it('session application is quiet while an explicit patient load and restore still notify other panels', () => {
    const h = harness({ locked: false, bootReady: true });
    expect(h.api.applyLoadedData(h.original, { isSessionRestore: true })).toBe(true);
    expect(h.sharedSignals, 'a read must not ask the sender DocPro panel to restore older shared fields').toEqual([]);
    expect(h.api.applyLoadedData(h.original, { source: 'fictional-patient-load' })).toBe(true);
    expect(h.sharedSignals, 'explicit patient loads still notify sibling panels').toEqual(['fictional-tab:1']);
    h.api.restoreLoadedState({ data: h.original, anyDataEntered: () => false });
    expect(h.sharedSignals, 'explicit Restore saved state still notifies sibling panels').toEqual(['fictional-tab:1', 'fictional-tab:2']);
    expect(h.api.applyLoadedData(h.original, { isSessionRestore: true })).toBe(true);
    expect(h.sharedSignals).toEqual(['fictional-tab:1', 'fictional-tab:2']);
  });

  it('keeps the restore latch and complete session protected, including force and pagehide saves', () => {
    const h = harness(); h.start();
    expect(pending(h)).toBe(true);
    expect(h.applied).toEqual([]);
    expect(h.win.vildaSession.saveNow({ force: true })).toBe(false);
    h.win.dispatchEvent({ type: 'pagehide' });
    expect(h.writes).toEqual([]);
    expect(h.session()).toEqual(h.original);
  });

  it('resumes once after unlock, reads the latest session and releases pending before guarded apply', () => {
    const h = harness(); h.start();
    const latest = { ...h.original, name: 'FIKCYJNY najnowszy szkic' };
    h.replaceSession(latest);
    h.unlock(); h.settle();
    expect(pending(h)).toBe(true);
    expect(h.applied).toEqual([]);
    h.frame();
    expect(pending(h)).toBe(false);
    expect(h.win.__vildaPersistRestoring).toBe(true);
    expect(h.applied).toEqual([{ payload: latest, options: { isSessionRestore: true } }]);
    clean(h);
    h.frame(); h.tick();
    expect(h.win.__vildaPersistRestoring).toBe(false);
    expect(h.win.vildaSession.saveNow({ force: true })).toBe(true);
  });


  it('announces completion once after restore flags, the session save and summary have finished', () => {
    const h = harness(), completions = [];
    h.win.document.addEventListener('vilda:main-session-restored', event => completions.push({
      detail: event.detail, pending: pending(h), restoring: h.win.__vildaPersistRestoring,
      writes: h.writes.length, summaries: h.summaries(),
    }));
    h.start(); h.unlock(); h.settle(); h.frame();
    expect(completions).toEqual([]);
    h.frame();
    expect(completions).toEqual([]);
    h.tick();
    expect(completions).toEqual([{
      detail: { source: 'main-session' }, pending: false, restoring: false, writes: 1, summaries: 1,
    }]);
    h.settle(); h.frame(); h.tick();
    expect(completions).toHaveLength(1);
  });

  it('repeated public restore calls share one waiting operation and one set of vault subscriptions', () => {
    const h = harness(); h.start();
    for (let i = 0; i < 8; i++) expect(h.win.vildaSession.restore()).toBe(false);
    expect(h.unlockListeners).toHaveLength(1);
    expect(h.lockListeners).toHaveLength(1);
    expect(h.win.document.count('vilda:auth-boot-settled')).toBe(1);
    h.unlock(); h.frame(); h.settle(); h.frame(); h.tick();
    expect(h.applied).toHaveLength(1);
    clean(h);
  });

  it.each([
    { patientId: null }, { bootReady: true }, { auth: false },
  ])('retains the original immediate path outside the narrow gate: %j', options => {
    const h = harness(options); h.start();
    expect(pending(h)).toBe(false);
    expect(h.applied).toHaveLength(1);
    expect(h.unlockListeners).toHaveLength(0);
  });

  it.each(['missing', 'empty'])('does not defer an anonymous legacy vault without a known account (%s)', kind => {
    const h = harness({ patientId: null, locked: false });
    if (kind === 'empty') h.win.VildaVault.getCurrentUser = () => null;
    h.start(); expect(pending(h)).toBe(false); expect(h.applied).toHaveLength(1);
    expect(h.unlockListeners).toHaveLength(0);
  });

  it.each([true, false])('retains immediate restoration for an explicit anonymous guest during boot (locked=%s)', locked => {
    const h = harness({ patientId: null, locked }); h.win.VildaAuthUI.isGuestMode = () => true;
    h.win.VildaVault.getCurrentUser = () => ({ userId: 'fictional-account-not-used-in-guest-mode' });
    h.start(); expect(pending(h)).toBe(false); expect(h.applied).toHaveLength(1);
  });

  it.each(['settled', 'new-patient'])('the real non-guest bootstrap wait with no current owner ends safely (%s)', outcome => {
    const h = harness({ patientId: null }); h.win.VildaAuthUI.isGuestMode = () => false;
    h.start(); expect(pending(h)).toBe(true); expect(h.applied).toEqual([]);
    if (outcome === 'new-patient') h.owner('fictional-new-selection');
    h.settle(); h.frame(); h.tick();
    expect(pending(h)).toBe(false); expect(h.applied).toHaveLength(outcome === 'settled' ? 1 : 0);
    clean(h);
  });

  it('keeps the known-patient gate independent of the new anonymous-account query', () => {
    const h = harness();
    h.win.VildaVault.getCurrentUser = () => { throw new Error('This locked legacy getter must not be called'); };
    h.start(); expect(pending(h)).toBe(true); expect(h.applied).toEqual([]);
  });

  it('keeps an already unlocked owner pending until authentication finishes its key activation', () => {
    const h = harness({ locked: false }); h.start();
    expect(pending(h)).toBe(true); expect(h.applied).toEqual([]);
    h.unlock(); h.frame();
    expect(pending(h)).toBe(true); expect(h.applied).toEqual([]);
    h.settle(); h.frame();
    expect(pending(h)).toBe(false); expect(h.applied).toHaveLength(1); clean(h);
  });

  it('preserves the legacy restore attempt after a failed boot settles with the same owner', () => {
    const h = harness(); h.start(); h.settle();
    expect(h.win.VildaVault.isUnlocked()).toBe(false);
    h.frame();
    expect(h.applied).toHaveLength(1);
    expect(pending(h)).toBe(false);
    clean(h);
  });

  it('does not resume a former owner if failed authentication reset the selected patient', () => {
    const h = harness(); h.start(); h.owner(null); h.settle(); h.frame();
    expect(h.applied).toEqual([]);
    expect(pending(h)).toBe(false);
    clean(h);
  });

  it.each(['window-clear', 'document-clear', 'patient-loaded', 'lock', 'session-clear'])('%s cancels a pending restore synchronously', action => {
    const h = harness(); h.start();
    if (action === 'window-clear') h.win.dispatchEvent({ type: 'vilda:user-state-cleared' });
    if (action === 'document-clear') h.win.document.dispatchEvent({ type: 'vilda:user-state-cleared' });
    if (action === 'patient-loaded') h.win.document.dispatchEvent({ type: 'vilda:patient-loaded' });
    if (action === 'lock') h.lock();
    if (action === 'session-clear') h.win.vildaSession.clear();
    expect(pending(h)).toBe(false);
    h.unlock(); h.settle(); h.frame();
    expect(h.applied).toEqual([]);
    clean(h);
  });

  it('changed storage owner wins over a stale window owner and cancels the queued frame', () => {
    const h = harness(); h.start(); h.unlock();
    h.win._vildaCurrentPatientId = 'fictional-a'; h.owner('fictional-b'); h.frame();
    expect(h.applied).toEqual([]);
    expect(pending(h)).toBe(false);
    clean(h);
  });

  it('a replaced vault cannot inherit an old vault unlock callback', () => {
    const h = harness(); h.start();
    h.win.VildaVault = { isUnlocked: () => true }; h.unlock(); h.frame();
    expect(h.applied).toEqual([]);
    expect(pending(h)).toBe(false);
    clean(h);
  });

  it('a fresh explicit load of even the same owner supersedes the pending session', () => {
    const h = harness(); h.start();
    expect(h.api.applyLoadedData({ version: 1, user: {} }, { source: 'fictional-explicit-load' })).toBe(true);
    expect(pending(h)).toBe(false);
    h.unlock(); h.settle(); h.frame();
    expect(h.applied).toEqual([]);
    clean(h);
  });

  it('a newer application sequence rejects a previously queued restore', () => {
    const h = harness(); h.start(); h.unlock();
    expect(h.api.applyLoadedData({ version: 1, user: {} }, { isSessionRestore: true })).toBe(true);
    h.frame();
    expect(h.applied).toEqual([]);
    expect(pending(h)).toBe(false);
    clean(h);
  });

  it('a page in BFCache waits for pageshow and then rechecks the current owner', () => {
    const h = harness(); h.start(); h.unlock();
    h.win.dispatchEvent({ type: 'pagehide' });
    h.settle(); h.frame();
    expect(h.applied).toEqual([]);
    expect(pending(h)).toBe(true);
    h.win.dispatchEvent({ type: 'pageshow' }); h.frame();
    expect(h.applied).toHaveLength(1);
    expect(pending(h)).toBe(false);
    clean(h);
  });

  it('BFCache pageshow cannot restore a patient selected before the tab changed owner', () => {
    const h = harness(); h.start(); h.win.dispatchEvent({ type: 'pagehide' });
    h.owner('fictional-b'); h.unlock(); h.settle();
    h.win.dispatchEvent({ type: 'pageshow' }); h.frame();
    expect(h.applied).toEqual([]);
    expect(pending(h)).toBe(false);
    clean(h);
  });
});

describe('read-only initial restore outcome for the startup indicator', () => {
  const eventName = 'vilda:initial-main-session-restore-settled';
  const observe = h => {
    const seen = [];
    h.win.document.addEventListener(eventName, event => seen.push({
      outcome: h.api.getInitialMainSessionRestoreState(), detail: event.detail,
      restoring: h.win.__vildaPersistRestoring === true,
      pending: h.api.isMainSessionRestorePending(), writes: h.writes.length,
    }));
    return seen;
  };

  it('does not read or write the session and publishes the settled native result after all restore flags', async () => {
    const h = harness(), seen = observe(h);
    const originalReader = h.win.VildaPersistence.readMainSession;
    let reads = 0;
    h.win.VildaPersistence.readMainSession = () => { reads += 1; return originalReader(); };
    const waiting = h.api.whenInitialMainSessionRestoreSettled();
    for (let attempt = 0; attempt < 5; attempt++) expect(h.api.getInitialMainSessionRestoreState()).toBeNull();
    expect(reads).toBe(0); expect(h.writes).toEqual([]);
    h.start();
    expect(h.api.getInitialMainSessionRestoreState()).toBeNull(); expect(seen).toEqual([]);
    h.unlock(); h.settle(); h.frame();
    expect(h.api.getInitialMainSessionRestoreState()).toBeNull(); expect(seen).toEqual([]);
    h.frame(); h.tick();
    const result = h.api.getInitialMainSessionRestoreState(), settledReads = reads;
    expect(result).toEqual({ ready: true, reason: 'restored' });
    expect(Object.isFrozen(result)).toBe(true);
    expect(seen).toEqual([{ outcome: result, detail: undefined, restoring: false, pending: false, writes: 1 }]);
    expect(seen[0].outcome).toBe(result);
    expect(await waiting).toEqual({ ...result, waited: true });
    expect(await h.api.whenInitialMainSessionRestoreSettled()).toEqual({ ...result, waited: false });
    for (let attempt = 0; attempt < 5; attempt++) expect(h.api.getInitialMainSessionRestoreState()).toBe(result);
    expect(reads).toBe(settledReads); expect(h.writes).toHaveLength(1);
    h.settle(); h.frame(); h.tick(); expect(seen).toHaveLength(1);
  });

  it.each([
    { title: 'missing session', value: null, ready: true, reason: 'empty' },
    { title: 'only view defaults', value: { version: 1, user: { sex: 'M' } }, ready: true, reason: 'empty' },
    { title: 'unsupported session', value: { version: 999, name: 'Fikcyjny rekord' }, ready: false, reason: 'unsupported-session' },
  ])('settles $title instead of leaving the startup presentation pending', async ({ value, ready, reason }) => {
    const h = harness({ locked: false, bootReady: true }), seen = observe(h);
    h.replaceSession(value); h.start();
    expect(h.api.getInitialMainSessionRestoreState()).toEqual({ ready, reason });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ outcome: { ready, reason }, restoring: false, pending: false, writes: 0 });
    expect(h.applied).toEqual([]); expect(h.writes).toEqual([]);
    expect(await h.api.whenInitialMainSessionRestoreSettled()).toEqual({ ready, reason, waited: false });
  });

  it.each(['storage-unavailable', 'missing-reader', 'apply-refused', 'restore-failed'])('exposes the native %s failure without changing its outcome', async reason => {
    const h = harness({ locked: false, bootReady: true }), seen = observe(h), before = h.session();
    if (reason === 'storage-unavailable') h.win.VildaPersistence.getStorage = () => null;
    if (reason === 'missing-reader') delete h.win.VildaPersistence.readMainSession;
    const options = reason === 'apply-refused' ? { applyLoadedData: () => false }
      : reason === 'restore-failed' ? { applyLoadedData: () => { throw new Error('Fikcyjny błąd odtwarzania'); } } : {};
    h.api.restoreMainSessionIfAny(options); h.frame(); h.tick();
    expect(h.api.getInitialMainSessionRestoreState()).toEqual({ ready: false, reason });
    expect(seen).toHaveLength(1); expect(seen[0].restoring).toBe(false);
    expect(await h.api.whenInitialMainSessionRestoreSettled()).toEqual({ ready: false, reason, waited: false });
    // Finalization of the native refused apply still performs its existing
    // guarded autosave; observing the result must not add another one.
    const writes = h.writes.length;
    for (let attempt = 0; attempt < 3; attempt++) h.api.getInitialMainSessionRestoreState();
    expect(h.writes).toHaveLength(writes);
    if (reason !== 'apply-refused') expect(h.session()).toBe(before);
  });

  it('announces explicit successful recovery without replaying the already settled promise', async () => {
    const h = harness({ locked: false, bootReady: true }), seen = observe(h);
    const waiting = h.api.whenInitialMainSessionRestoreSettled();
    h.api.restoreMainSessionIfAny({ applyLoadedData: () => false }); h.frame(); h.tick();
    const failure = h.api.getInitialMainSessionRestoreState();
    expect(failure).toEqual({ ready: false, reason: 'apply-refused' });
    expect(await waiting).toEqual({ ...failure, waited: true });
    expect(h.api.applyLoadedData(h.original, { source: 'fictional-recovery' })).toBe(true);
    const recovery = h.api.getInitialMainSessionRestoreState();
    expect(recovery).toEqual({ ready: true, reason: 'superseded-load' });
    expect(Object.isFrozen(recovery)).toBe(true); expect(recovery).not.toBe(failure);
    expect(seen.map(item => item.outcome)).toEqual([failure, recovery]);
    expect(await waiting).toEqual({ ...failure, waited: true });
    expect(await h.api.whenInitialMainSessionRestoreSettled()).toEqual({ ...recovery, waited: false });
    h.api.applyLoadedData(h.original, { source: 'fictional-next-load' });
    expect(seen).toHaveLength(2);
  });

  it('settles a pending authentication restore when the real session-clear operation supersedes it', () => {
    const h = harness(), seen = observe(h); h.start();
    expect(h.api.getInitialMainSessionRestoreState()).toBeNull();
    h.win.vildaSession.clear();
    expect(h.api.getInitialMainSessionRestoreState()).toEqual({ ready: true, reason: 'superseded-session-clear' });
    expect(seen).toHaveLength(1); expect(seen[0].pending).toBe(false);
    expect(h.session()).toBeNull(); expect(h.applied).toEqual([]); expect(h.writes).toEqual([]);
    h.unlock(); h.settle(); h.frame(); h.tick();
    expect(seen).toHaveLength(1); expect(h.applied).toEqual([]);
  });
});
