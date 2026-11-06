import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const PID = 'fictional-committed-reference-patient';
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const patient = () => ({ version: 1, name: 'Fikcyjny Pacjent Referencji Zapisu',
  user: { sex: 'M', age: 12, ageMonths: 0, height: 153, weight: 40 },
  birth: { sourceChoice: 'niklasson', sourceKeys: ['niklasson'], sex: 'male',
    weeks: '34', days: '2', weight: '1650', length: '41', head: '29' } });
function computedBirth() {
  const value = patient(); value.birth.head = ''; value.birth.hasComputed = true;
  value.birth.assessment = { version: 1, computedAtISO: '2026-11-06T14:55:50.460Z',
    inputs: { sex: 'male', weeks: 34, days: 2, weightG: 1650, lengthCm: 41, headCm: null },
    requestedSourceKeys: ['niklasson'], sources: [{ sourceKey: 'niklasson',
      metrics: { weight: { sds: -3.1265622206700416 }, length: { sds: -3.4761904761904767 } } }] };
  return value;
}

// Execute real DIX save/receipt/witness publication and the whole SSI. The fake
// vault is the durable boundary: only its exact returned result object resolves
// to a cloned committed payload, without any later Vault read. The DOM collector
// is represented by a mutable
// detached model, so model changes do not silently update the persisted session.
function environment() {
  const listeners = {}, windowListeners = {}, savedListeners = [], storage = new Map([['vildaCurrentPatientId', PID]]);
  let form = patient(), session = clone(form), unlocked = true, userId = 'fictional-committed-reference-owner', generation = 1;
  let afterCommit = null, commitGate = null, commitFailure = null, snapshotNumber = 0;
  const snapshots = [], committedPayloads = new WeakMap(), writes = vi.fn(), persist = vi.fn(() => { session = clone(form); return true; });
  const pure = vi.fn(() => clone(form)), collect = vi.fn(() => clone(form));
  const vault = {
    isUnlocked: () => unlocked, getCurrentUser: () => unlocked ? { userId } : null,
    captureSyncOperationSession: () => Object.freeze({ generation, userId }),
    assertSyncOperationSession(token) { if (!unlocked || token.generation !== generation || token.userId !== userId) throw Object.assign(new Error('Fikcyjna zmiana sesji'), { code: 'SESSION_CHANGED' }); return true; },
    onPatientSaved(callback) { savedListeners.push(callback); },
    getPatient: vi.fn(async id => id === PID ? { patientId: PID, snapshots: clone(snapshots) } : null),
    getCommittedSavePayload(result) {
      const entry = result && committedPayloads.get(result);
      return entry && unlocked && entry.generation === generation && entry.userId === userId ? clone(entry.payload) : null;
    },
    savePatient: vi.fn(async payload => {
      if (commitGate) await commitGate;
      if (commitFailure) throw commitFailure;
      const snapshotId = `fictional-committed-snapshot-${++snapshotNumber}`;
      snapshots.unshift({ snapshotId, payload: clone(payload), savedAtISO: new Date().toISOString(), rev: 1 });
      const result = { patientId: PID, snapshotId, snapshotCount: snapshots.length,
        savedAtISO: new Date().toISOString(), header: { name: payload.name } };
      committedPayloads.set(result, { generation, userId, payload: clone(payload) });
      for (const callback of savedListeners) callback(clone(result));
      if (afterCommit) afterCommit();
      return result;
    }),
  };
  const document = { readyState: 'complete', getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    addEventListener(type, callback) { (listeners[type] ||= []).push(callback); },
    removeEventListener(type, callback) { listeners[type] = (listeners[type] || []).filter(value => value !== callback); },
    dispatchEvent(event) { for (const callback of [...(listeners[event.type] || [])]) callback(event); return true; } };
  const win = { document, location: { pathname: '/docpro.html' }, setTimeout, clearTimeout, setInterval, clearInterval,
    addEventListener(type, callback) { (windowListeners[type] ||= []).push(callback); }, console: { debug() {} },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    sessionStorage: { getItem: key => storage.get(key) ?? null,
      setItem(key, value) { writes(key, value); storage.set(key, String(value)); },
      removeItem(key) { writes(key, null); storage.delete(key); } },
    VildaVault: vault, VildaPanelPacjent: { nieaktualny: () => false },
    VildaAuthUI: { isBootReady: () => true }, VildaDobAge: { restorePending: () => false },
    VildaDocproStatePersistence: { isReady: () => true, isRestoring: () => false },
    VildaPersistence: { readMainSession: () => clone(session), readClcrSession: () => null,
      isClearInProgress: () => false, isRestoring: () => false, isAutosaveSuppressed: () => false },
    VildaSaveFeedback: { capture: () => Object.freeze({ generation }), isCurrent: scope => scope.generation === generation, pokaz: () => true },
    _vildaCurrentPatientId: PID, collectUserData: collect, saveMainSessionNow: persist,
    vildaPersistFlushNow: vi.fn(() => { session = clone(form); return true; }), alert: vi.fn(),
  };
  win.parent = win;
  loadBrowserScript('vilda_data_import_export.js', win);
  const data = win.VildaDataImportExport;
  data.applyLoadedData(clone(form), { syncSharedUserDataFromLoadedData() {} });
  data.captureCurrentUserDataReadOnly = pure;
  loadBrowserScript('vilda_save_status_indicator.js', win);
  const indicator = win.VildaSaveStatusIndicator;
  indicator._onPatientLoaded({ patientId: PID, name: form.name, applySequence: data.getApplyLoadedDataSequence(), snapshotCount: 1 });
  vi.advanceTimersByTime(150);
  expect(indicator.getCurrentDecision()).toMatchObject({ ready: true, state: 'saved' });
  writes.mockClear(); persist.mockClear(); pure.mockClear(); collect.mockClear(); win.vildaPersistFlushNow.mockClear();
  return { win, data, indicator, vault, writes, persist, pure, collect, storage,
    setForm(value) { form = clone(value); }, form: () => clone(form), session: () => clone(session),
    setAfterCommit(callback) { afterCommit = callback; },
    failCommit(error) { commitFailure = error; },
    pauseSave() { let release; commitGate = new Promise(resolve => { release = resolve; }); return () => { commitGate = null; release(); }; },
    onSavePublished(callback) { document.addEventListener('vilda:patient-loaded', event => { if (event.detail?.source === 'save') callback(event); }); },
    notifySaved(value) { for (const callback of savedListeners) callback(clone(value)); },
    async save() { return data.saveUserDataWithReceipt({ collectUserData: () => clone(form) }); },
    snapshot(receipt) { return clone(snapshots.find(value => value.snapshotId === receipt.snapshotId)); },
    changeAccount() { userId = 'fictional-other-committed-owner'; generation++; },
    lock() { unlocked = false; generation++; indicator._onLock(); },
    emit(type, detail) { document.dispatchEvent(new win.CustomEvent(type, { detail })); },
  };
}

// A new document starts Hidden while sharing the already saved tab reference.
// Its DOB producer has not yet completed; no load/save event establishes a new
// baseline merely to make the presentation ready.
function coldIndicator(h, options = {}) {
  const listeners = {}, windowListeners = {}; let dobPending = options.dobPending ?? true, authReady = options.authReady ?? true;
  const document = { ...h.win.document,
    addEventListener(type, callback) { (listeners[type] ||= []).push(callback); },
    removeEventListener(type, callback) { listeners[type] = (listeners[type] || []).filter(value => value !== callback); },
    dispatchEvent(event) { for (const callback of [...(listeners[event.type] || [])]) callback(event); return true; } };
  const win = { ...h.win, document, VildaDobAge: { restorePending: () => dobPending },
    VildaAuthUI: { isBootReady: () => authReady },
    addEventListener(type, callback) { (windowListeners[type] ||= []).push(callback); } }; win.parent = win;
  loadBrowserScript('vilda_save_status_indicator.js', win);
  return { win, indicator: win.VildaSaveStatusIndicator, setDobPending(value) { dobPending = value; },
    setAuthReady(value) { authReady = value; },
    emit(type) { document.dispatchEvent(new win.CustomEvent(type, { detail: { iso: '2009-07-20' } })); },
    emitWindow(type) { for (const callback of [...(windowListeners[type] || [])]) callback(new win.CustomEvent(type)); } };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-06T15:00:00Z')); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('proven automatic PAL defaults are comparison-only', () => {
  it.each(['proven-default', 'different-committed-payload', 'later-clinical-edit'])(
    '%s preserves the raw committed reference and does not hide a clinical edit', async scenario => {
      const h = environment(), original = h.form();
      original.plan = { palFactor: null, palWybrany: false };
      original.intake = { pal: null }; h.setForm(original);
      h.setAfterCommit(() => {
        const live = h.form(); live.plan.palFactor = 1.6; live.intake.pal = '1.6';
        if (scenario === 'later-clinical-edit') live.user.height++;
        h.setForm(live);
      });
      const receipt = await h.save(), committed = h.snapshot(receipt).payload;
      const proof = clone(committed);
      if (scenario === 'different-committed-payload') proof.user.weight++;
      // The producer proof itself is covered against real DIX synthesis in
      // save-user-data-readiness; this contract test checks SSI composition.
      h.data.getOwnSaveAutomaticPalComparison = vi.fn(() => ({ patientId: PID,
        payload: clone(proof), planPal: 1.6, intakePal: '1.6' }));
      const rawReference = h.indicator.getReferenceFingerprint(), liveBefore = h.form();
      vi.advanceTimersByTime(150);
      const expected = scenario === 'proven-default' ? 'saved' : 'dirty';
      expect(h.indicator.getState()).toBe(expected);
      expect(h.indicator.getCurrentDecision()).toMatchObject({ ready: true, state: expected });
      expect(h.indicator.getReferenceFingerprint()).toBe(rawReference);
      expect(JSON.parse(rawReference).core).not.toHaveProperty('plan');
      expect(JSON.parse(rawReference).core).not.toHaveProperty('intake');
      expect(h.snapshot(receipt).payload).toEqual(committed);
      expect(h.form()).toEqual(liveBefore);
    });
});

describe('saved reference belongs to the actual committed snapshot', () => {
  it.each(['before-return', 'source-save-event'])('retains the exact committed SGA assessment when live fields mutate at %s', async phase => {
    const h = environment(), saved = computedBirth(); h.setForm(saved);
    const decision = h.indicator.getCurrentDecision();
    const mutate = () => { const next = h.form(); next.birth.head = '29'; delete next.birth.assessment; h.setForm(next); };
    if (phase === 'before-return') h.setAfterCommit(mutate); else h.onSavePublished(mutate);
    const receipt = await h.save(); expect(receipt).toMatchObject({ saved: true, patientId: PID });
    expect(h.snapshot(receipt).payload.birth).toEqual(saved.birth); expect(h.vault.getPatient).not.toHaveBeenCalled();
    vi.advanceTimersByTime(150);
    const reference = h.indicator.getReferenceFingerprint();
    expect(JSON.parse(reference).core.birth).toMatchObject({ assessment: { computedAtISO: saved.birth.assessment.computedAtISO } });
    expect(JSON.parse(reference).core.birth).not.toHaveProperty('head');
    expect(h.form().birth).toMatchObject({ head: '29' }); expect(h.form().birth.assessment).toBeUndefined();
    expect(h.indicator.getState()).toBe('dirty'); expect(h.indicator.getCurrentDecision()).toMatchObject({ ready: true, state: 'dirty' });
    expect(h.indicator.isCurrentDecisionAfterSave(decision.scope, receipt)).toBe(false);
    h.indicator.reconcileFromSharedReference(); vi.advanceTimersByTime(400);
    expect(h.indicator.getReferenceFingerprint()).toBe(reference); expect(h.indicator.getState()).toBe('dirty');
  });

  it('publishes an unchanged own save as Saved and returns a detached, exact snapshot witness', async () => {
    const h = environment(), saved = computedBirth(); h.setForm(saved);
    const decision = h.indicator.getCurrentDecision(), receipt = await h.save();
    expect(h.indicator.isCurrentDecisionAfterSave(decision.scope, receipt)).toBe(true);
    vi.advanceTimersByTime(150);
    expect(h.indicator.getCurrentDecision()).toMatchObject({ ready: true, state: 'saved' });
    expect(h.indicator.isCurrentDecisionAfterSave(decision.scope, receipt)).toBe(true);
    expect(typeof h.data.getCommittedSaveWitness).toBe('function');
    const request = { patientId: PID, snapshotId: receipt.snapshotId, applySequence: h.data.getApplyLoadedDataSequence() };
    const witness = h.data.getCommittedSaveWitness(request);
    expect(witness).toMatchObject({ patientId: PID, snapshotId: receipt.snapshotId, payload: h.snapshot(receipt).payload });
    // A readonly/frozen returned clone is also valid; neither representation
    // may let a caller mutate the internal confirmed snapshot.
    Reflect.set(witness.payload.birth, 'head', 'fictional-mutated-detached-copy');
    Reflect.deleteProperty(witness.payload.birth, 'assessment');
    expect(h.data.getCommittedSaveWitness(request).payload.birth).toEqual(saved.birth);
    expect(h.snapshot(receipt).payload.birth).toEqual(saved.birth);
    expect(h.vault.getCommittedSavePayload({ patientId: PID, snapshotId: receipt.snapshotId })).toBeNull();
    expect(h.vault.getPatient).not.toHaveBeenCalled();
  });

  it.each(['same-patient', 'other-patient'])('does not rebaseline from an unrelated %s vault acknowledgement', name => {
    const h = environment(), reference = h.indicator.getReferenceFingerprint(), changed = h.form(); changed.user.weight = 41; h.setForm(changed);
    h.notifySaved({ patientId: name === 'same-patient' ? PID : 'fictional-unrelated-patient',
      snapshotId: 'fictional-unrelated-snapshot', snapshotCount: 99, header: { name: 'Fikcyjny Obcy Zapis' } });
    vi.advanceTimersByTime(400); h.indicator.reconcileFromSharedReference();
    expect(h.indicator.getReferenceFingerprint()).toBe(reference);
    expect(h.indicator.getCurrentDecision()).toMatchObject({ ready: true, state: 'dirty' });
    expect(h.persist).not.toHaveBeenCalled(); expect(h.collect).not.toHaveBeenCalled();
  });

  it('a source-save event without its exact own committed witness cannot bless a newer form', () => {
    const h = environment(), reference = h.indicator.getReferenceFingerprint(), next = h.form(); next.user.weight = 42; h.setForm(next);
    h.emit('vilda:patient-loaded', { source: 'save', patientId: PID, snapshotId: 'fictional-unwitnessed-snapshot',
      applySequence: h.data.getApplyLoadedDataSequence(), snapshotCount: 99 });
    vi.advanceTimersByTime(400);
    expect(h.indicator.getReferenceFingerprint()).toBe(reference);
    expect(h.indicator.getCurrentDecision()).toMatchObject({ ready: true, state: 'dirty' });
    expect(h.persist).not.toHaveBeenCalled(); expect(h.collect).not.toHaveBeenCalled();
  });

  it('reconciles display against detached live input while session and reference remain unchanged', () => {
    const h = environment(), before = h.session(), reference = h.indicator.getReferenceFingerprint(), next = h.form(); next.user.weight = 41; h.setForm(next);
    h.indicator.reconcileFromSharedReference();
    expect(h.indicator.getState()).toBe('dirty'); expect(h.indicator.getCurrentDecision()).toMatchObject({ ready: true, state: 'dirty' });
    expect(h.session()).toEqual(before); expect(h.indicator.getReferenceFingerprint()).toBe(reference);
    expect(h.persist).not.toHaveBeenCalled(); expect(h.collect).not.toHaveBeenCalled();
    h.setForm(before); h.indicator.reconcileFromSharedReference(); expect(h.indicator.getState()).toBe('saved');
  });

  it.each(['wrong-snapshot', 'wrong-sequence', 'account', 'lock'])('does not expose the committed witness after %s invalidates its scope', async change => {
    const h = environment(), receipt = await h.save(); vi.advanceTimersByTime(150);
    const request = { patientId: PID, snapshotId: receipt.snapshotId, applySequence: h.data.getApplyLoadedDataSequence() };
    expect(h.data.getCommittedSaveWitness(request)).toBeTruthy();
    if (change === 'wrong-snapshot') request.snapshotId = 'fictional-not-committed';
    if (change === 'wrong-sequence') request.applySequence += 1;
    if (change === 'account') h.changeAccount(); if (change === 'lock') h.lock();
    expect(h.data.getCommittedSaveWitness(request)).toBeNull();
  });
});

describe('actual save lifecycle owns the Saving presentation', () => {
  it('shows Saving for an immediate edit before the cached Saved header updates, then confirms the unchanged commit', async () => {
    const h = environment(), next = h.form(); next.user.weight = 41; h.setForm(next);
    expect(h.indicator.getState()).toBe('saved'); expect(h.indicator.getCurrentDecision().state).toBe('dirty');
    const release = h.pauseSave(), operation = h.save(); let receipt;
    try {
      expect(h.data.isSaveUserDataPending()).toBe(true); expect(h.indicator.getState()).toBe('saving');
      await Promise.resolve(); expect(h.indicator.getState()).toBe('saving');
    } finally { release(); receipt = await operation; }
    expect(receipt).toMatchObject({ saved: true, referenceVerified: true });
    vi.advanceTimersByTime(150);
    expect(h.indicator.getState()).toBe('saved'); expect(h.indicator.getCurrentDecision()).toMatchObject({ ready: true, state: 'saved' });
    expect(h.snapshot(receipt).payload.user.weight).toBe(41);
    expect(JSON.parse(h.indicator.getReferenceFingerprint()).core.user.weight).toBe(41);
  });

  it.each(['validation', 'rejection'])('does not leave Saving after a handled %s failure', async reason => {
    const h = environment(), reference = h.indicator.getReferenceFingerprint(), next = h.form(); next.user.weight = 41;
    if (reason === 'validation') h.setForm({ version: 1, name: '', user: {} });
    else { h.setForm(next); h.failCommit(new Error('Fikcyjna odmowa trwałego zapisu')); }
    const receipt = await h.save(); expect(receipt.saved).toBe(false); expect(h.data.isSaveUserDataPending()).toBe(false);
    // A click/start notification without an accepted own operation is not a
    // reason to show Saving, including after a failed validation or error.
    h.indicator.notifySaveStarted();
    expect(h.indicator.getState()).not.toBe('saving'); expect(h.indicator.getReferenceFingerprint()).toBe(reference);
    if (reason === 'validation') expect(h.vault.savePatient).not.toHaveBeenCalled();
    else { expect(h.indicator.getState()).toBe('error'); expect(h.indicator.getCurrentDecision().state).toBe('dirty'); }
  });

  it('returns an actually cancelled held save to Dirty while preserving its content and confirmed reference', async () => {
    const h = environment(), reference = h.indicator.getReferenceFingerprint(), stored = h.session(), next = h.form(); next.user.weight = 41; h.setForm(next);
    h.failCommit(Object.assign(new Error('Fikcyjne anulowanie przez lekarza'), { vildaSaveAborted: true }));
    const release = h.pauseSave(), operation = h.save(); let receipt;
    try { expect(h.indicator.getState()).toBe('saving'); await Promise.resolve(); }
    finally { release(); receipt = await operation; }
    expect(receipt.saved).toBe(false); expect(h.data.isSaveUserDataPending()).toBe(false);
    expect(h.indicator.getState()).toBe('dirty'); expect(h.indicator.getCurrentDecision()).toMatchObject({ ready: true, state: 'dirty' });
    expect(h.indicator.getReferenceFingerprint()).toBe(reference); expect(h.form()).toEqual(next); expect(h.session()).toEqual(stored);
  });

  it('keeps a durable save with an unavailable committed payload in Error instead of clearing that error during pending cleanup', async () => {
    const h = environment(), reference = h.indicator.getReferenceFingerprint(), next = h.form(); next.user.weight = 41; h.setForm(next);
    h.vault.getCommittedSavePayload = () => null;
    const receipt = await h.save();
    expect(receipt).toMatchObject({ saved: true, referenceVerified: false }); expect(h.data.isSaveUserDataPending()).toBe(false);
    expect(h.indicator.getState()).toBe('error'); expect(h.indicator.getReferenceFingerprint()).toBe(reference);
    expect(h.snapshot(receipt).payload).toEqual(next); expect(h.form()).toEqual(next);
  });
});

describe('native beforeunload uses the fresh read-only save decision', () => {
  it.each([
    ['saved', false, false], ['saved', true, true], ['dirty', false, false], ['dirty', true, true],
  ])('uses cached %s only as presentation when fresh changed=%s', (cached, changed, warn) => {
    const h = environment(), next = h.form();
    if (changed) { next.user.weight = 41; h.setForm(next); }
    h.indicator._forceTransition(cached);
    loadBrowserScript('vilda_unsaved_guard.js', h.win);
    const before = [...h.storage], currentSession = h.session(), preventDefault = vi.fn(), event = { preventDefault };
    h.win.VildaUnsavedGuard._onBeforeUnload(event);
    if (warn) { expect(preventDefault).toHaveBeenCalledTimes(1); expect(event.returnValue).toBe(''); }
    else expect(preventDefault).not.toHaveBeenCalled();
    expect([...h.storage]).toEqual(before); expect(h.session()).toEqual(currentSession);
    expect(h.persist).not.toHaveBeenCalled(); expect(h.collect).not.toHaveBeenCalled();
  });

  it.each(['saved', 'dirty', 'new_patient', 'saving'])('preserves the conservative cached %s fallback only while fresh capture is unready', state => {
    const h = environment(); h.indicator._forceTransition(state); h.win.__vildaPersistRestoring = true;
    loadBrowserScript('vilda_unsaved_guard.js', h.win);
    const preventDefault = vi.fn(); h.win.VildaUnsavedGuard._onBeforeUnload({ preventDefault });
    expect(preventDefault).toHaveBeenCalledTimes(state === 'saved' ? 0 : 1);
    expect(h.persist).not.toHaveBeenCalled(); expect(h.collect).not.toHaveBeenCalled();
  });

  it('warns about an actual pending DIX save without a preceding button-click notification', async () => {
    const h = environment(), release = h.pauseSave(), operation = h.save();
    expect(h.data.isSaveUserDataPending()).toBe(true); expect(h.indicator.getState()).toBe('saving');
    loadBrowserScript('vilda_unsaved_guard.js', h.win);
    try {
      const preventDefault = vi.fn(); h.win.VildaUnsavedGuard._onBeforeUnload({ preventDefault });
      expect(preventDefault).toHaveBeenCalledTimes(1);
    } finally { release(); await operation; }
  });

  it('warns for a pending Klirens calculation when the fresh patient decision is Saved', () => {
    const h = environment(); h.win.ClcrVisitSave = { hasUnsavedMeasurement: () => true };
    loadBrowserScript('vilda_unsaved_guard.js', h.win);
    const preventDefault = vi.fn(); h.win.VildaUnsavedGuard._onBeforeUnload({ preventDefault });
    expect(preventDefault).toHaveBeenCalledTimes(1); expect(h.persist).not.toHaveBeenCalled(); expect(h.collect).not.toHaveBeenCalled();
  });

  it('keeps the established anonymous Hidden passthrough', () => {
    const h = environment(); h.win.VildaGuestMode = true; h.indicator._forceTransition('hidden');
    loadBrowserScript('vilda_unsaved_guard.js', h.win);
    const preventDefault = vi.fn(); h.win.VildaUnsavedGuard._onBeforeUnload({ preventDefault });
    expect(preventDefault).not.toHaveBeenCalled(); expect(h.persist).not.toHaveBeenCalled(); expect(h.collect).not.toHaveBeenCalled();
  });
});

describe('saved presentation resumes when the real DOB readiness producer completes', () => {
  it('synchronously leaves cold Hidden after dob-restored without changing session or the confirmed reference', () => {
    const h = environment(), reference = h.indicator.getReferenceFingerprint(), stored = h.session(), raw = [...h.storage];
    const cold = coldIndicator(h);
    expect(cold.indicator.getState()).toBe('hidden'); expect(cold.indicator.getCurrentDecision().ready).toBe(false);
    h.writes.mockClear(); h.persist.mockClear(); h.collect.mockClear();
    cold.setDobPending(false); cold.emit('vilda:dob-restored');
    expect(cold.indicator.getState()).toBe('saved'); expect(cold.indicator.getCurrentDecision()).toMatchObject({ ready: true, state: 'saved' });
    expect(cold.indicator.getReferenceFingerprint()).toBe(reference); expect([...h.storage]).toEqual(raw); expect(h.session()).toEqual(stored);
    expect(h.writes).not.toHaveBeenCalled(); expect(h.persist).not.toHaveBeenCalled(); expect(h.collect).not.toHaveBeenCalled();
  });

  it('keeps other restore gates authoritative when DOB completes before the main producer is ready', () => {
    const h = environment(), reference = h.indicator.getReferenceFingerprint(), stored = h.session(), cold = coldIndicator(h), raw = [...h.storage];
    cold.setDobPending(false); cold.win.__vildaPersistRestoring = true; cold.emit('vilda:dob-restored');
    expect(cold.indicator.getState()).toBe('hidden'); expect(cold.indicator.getCurrentDecision().ready).toBe(false);
    expect(cold.indicator.getReferenceFingerprint()).toBe(reference); expect([...h.storage]).toEqual(raw); expect(h.session()).toEqual(stored);
    cold.win.__vildaPersistRestoring = false; cold.emit('vilda:main-session-restored'); vi.advanceTimersByTime(200);
    expect(cold.indicator.getState()).toBe('saved'); expect(cold.indicator.getReferenceFingerprint()).toBe(reference);
    expect(h.persist).not.toHaveBeenCalled(); expect(h.collect).not.toHaveBeenCalled();
  });
});

describe('auth boot completion resumes the restored presentation', () => {
  it.each(['saved', 'dirty'])('publishes cold %s only after the final auth readiness boundary', state => {
    const h = environment();
    if (state === 'dirty') {
      const changed = h.form(); changed.user.weight++;
      h.setForm(changed); h.win.saveMainSessionNow(); h.indicator.reconcileFromSharedReference();
    }
    const reference = h.indicator.getReferenceFingerprint(), stored = h.session(), raw = [...h.storage];
    const cold = coldIndicator(h, { authReady: false, dobPending: false });
    expect(cold.indicator.getState()).toBe('hidden');
    expect(cold.indicator.getCurrentDecision().ready).toBe(false);
    // These producers can finish during authentication. Editable pages ignore
    // session-changed, and their later load handler only paints the cached label.
    cold.emit('vilda:main-session-restored'); cold.emit('vilda:dob-restored');
    cold.emit('vilda:auth-state-settled'); cold.emit('vilda:session-changed'); vi.advanceTimersByTime(200);
    expect(cold.indicator.getState()).toBe('hidden');
    h.writes.mockClear(); h.persist.mockClear(); h.collect.mockClear(); h.pure.mockClear();
    cold.setAuthReady(true); cold.emitWindow('load');
    expect(cold.indicator.getState()).toBe('hidden');
    expect(cold.indicator.getCurrentDecision()).toMatchObject({ ready: true, state });
    cold.emit('vilda:auth-boot-settled');
    expect(cold.indicator.getState()).toBe(state);
    expect(cold.indicator.getCurrentDecision()).toMatchObject({ ready: true, state });
    expect(cold.indicator.getReferenceFingerprint()).toBe(reference);
    expect([...h.storage]).toEqual(raw); expect(h.session()).toEqual(stored);
    expect(h.writes).not.toHaveBeenCalled(); expect(h.persist).not.toHaveBeenCalled(); expect(h.collect).not.toHaveBeenCalled();
    expect(h.win.vildaPersistFlushNow).not.toHaveBeenCalled(); expect(h.pure).toHaveBeenCalled();
  });

  it.each(['auth', 'main', 'dob'])('keeps the %s producer gate authoritative at auth completion', gate => {
    const h = environment(), reference = h.indicator.getReferenceFingerprint(), stored = h.session(), raw = [...h.storage];
    const cold = coldIndicator(h, { authReady: false, dobPending: false });
    if (gate !== 'auth') cold.setAuthReady(true);
    if (gate === 'main') cold.win.__vildaPersistRestoring = true;
    if (gate === 'dob') cold.setDobPending(true);
    h.writes.mockClear(); h.persist.mockClear(); h.collect.mockClear();
    cold.emit('vilda:auth-boot-settled');
    expect(cold.indicator.getState()).toBe('hidden'); expect(cold.indicator.getCurrentDecision().ready).toBe(false);
    expect(cold.indicator.getReferenceFingerprint()).toBe(reference); expect([...h.storage]).toEqual(raw); expect(h.session()).toEqual(stored);
    expect(h.writes).not.toHaveBeenCalled(); expect(h.persist).not.toHaveBeenCalled(); expect(h.collect).not.toHaveBeenCalled();
  });
});
