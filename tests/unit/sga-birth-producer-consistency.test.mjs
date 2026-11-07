import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { sgaBirthEnvironment } from '../support/sga-birth-runtime.mjs';

const INPUT = {
  sourceChoice: 'compare', sourceKeys: ['niklasson', 'intergrowth', 'malewski'],
  sex: 'male', weeks: '34', days: '2', weight: '1650', length: '41', head: '29', hasComputed: false
};
const PERINATAL = { gestationalWeeks: 34, gestationalDays: 2, birthWeightG: 1650, birthLengthCm: 41, birthHeadCircCm: 29 };

function prepared(input = {}, compute = true) {
  const h = sgaBirthEnvironment();
  h.api.restoreState({ ...INPUT, ...input });
  if (compute) h.document.getElementById('computeSgaBirth').click();
  return { ...h, state: h.api.captureStateReadOnly() };
}

function prefill(h, payload = { perinatal: PERINATAL, user: { sex: 'M' } }) {
  let resolve, accountGeneration = 1;
  h.window._vildaCurrentPatientId = 'fictional-sga-patient-a';
  const getPatient = vi.fn(() => new Promise(done => { resolve = done; }));
  h.window.VildaVault = {
    isUnlocked: () => true,
    getPatient,
    captureSyncOperationSession: () => accountGeneration,
    assertSyncOperationSession(token) { if (token !== accountGeneration) throw new Error('SESSION_CHANGED'); }
  };
  const request = () => h.document.dispatchEvent({ type: 'vilda:sync-status-changed' });
  const finish = async () => {
    if (resolve) resolve({ snapshots: [{ payload }] });
    await Promise.resolve(); await Promise.resolve();
  };
  return { request, finish, getPatient, changeAccount: () => { accountGeneration += 1; } };
}

describe('SGA: no-op producers preserve the explicit clinical assessment', () => {
  it('keeps the complete frozen result and timestamp across identical input/change events', () => {
    const h = prepared();
    for (const id of ['sgaBirthWeeks', 'sgaBirthDays', 'sgaBirthWeight', 'sgaBirthLength', 'sgaBirthHead']) {
      for (const event of ['input', 'change']) h.document.getElementById(id).dispatch(event);
    }
    for (const control of [...h.sources, ...h.sex]) control.dispatch('change');
    expect(h.api.captureStateReadOnly()).toEqual(h.state);
  });

  it('retains an assessment for equivalent numeric formatting but records the actual field spelling', () => {
    const h = prepared({ length: '41.5', days: '' });
    h.document.getElementById('sgaBirthLength').value = '41,50';
    h.document.getElementById('sgaBirthLength').dispatch('input');
    h.document.getElementById('sgaBirthDays').value = '0';
    h.document.getElementById('sgaBirthDays').dispatch('change');
    expect(h.api.captureStateReadOnly()).toMatchObject({ length: '41,50', days: '0', assessment: h.state.assessment });
  });

  it.each([
    ['sgaBirthWeeks', '35'], ['sgaBirthDays', '3'], ['sgaBirthWeight', '1651'],
    ['sgaBirthLength', '42'], ['sgaBirthHead', ''], ['sgaBirthWeight', 'invalid']
  ])('invalidates a real %s edit and never resurrects the old result on undo', (id, value) => {
    const h = prepared(), field = h.document.getElementById(id), previous = field.value;
    field.value = value; field.dispatch('input');
    expect(h.api.captureStateReadOnly()).not.toHaveProperty('assessment');
    field.value = previous; field.dispatch('change');
    expect(h.api.captureStateReadOnly()).not.toHaveProperty('assessment');
  });

  it('keeps restored explicit blank days without inventing zero or replacing the assessment', () => {
    const h = prepared({ days: '' });
    expect(h.state.days).toBe('');
    expect(h.state.assessment.inputs.days).toBe(0);
    const restored = sgaBirthEnvironment();
    restored.api.restoreState(h.state);
    expect(restored.document.getElementById('sgaBirthDays').value).toBe('');
    expect(restored.api.captureStateReadOnly()).toEqual(h.state);
  });

  it('does not introduce new rules for absent, null or unsupported day values', () => {
    const h = prepared({}, false);
    for (const days of [undefined, null]) {
      h.api.restoreState({ ...INPUT, days });
      expect(h.api.captureStateReadOnly().days).toBe('2');
    }
    h.api.restoreState({ ...INPUT, days: 'future-format', hasComputed: false });
    expect(h.api.captureStateReadOnly()).toMatchObject({ days: 'future-format', hasComputed: false });
    expect(h.api.captureStateReadOnly()).not.toHaveProperty('assessment');
  });
});

describe('SGA: asynchronous perinatal prefill belongs to its original uncomputed form', () => {
  it('never fills optional head beneath a computed assessment on sync/auth/save refresh', async () => {
    const h = prepared({ head: '' }), fetch = prefill(h);
    fetch.request(); await fetch.finish();
    h.document.dispatchEvent({ type: 'vilda:auth-hidden' }); await fetch.finish();
    h.document.dispatchEvent({ type: 'vilda:patient-loaded', detail: { patientId: h.window._vildaCurrentPatientId, source: 'save' } }); await fetch.finish();
    expect(h.api.captureStateReadOnly()).toEqual(h.state);
    expect(fetch.getPatient).not.toHaveBeenCalled();
  });

  it('preserves the previous legacy computed form even when it carries no saved assessment', async () => {
    const h = prepared({ head: '', hasComputed: true }, false), fetch = prefill(h);
    fetch.request(); await fetch.finish();
    expect(h.api.captureStateReadOnly()).toEqual(h.state);
    expect(h.api.captureStateReadOnly()).not.toHaveProperty('assessment');
  });

  it('still prefills a fresh uncomputed card and brings valid days together with weeks', async () => {
    const h = prepared({ weeks: '', days: '0', weight: '', length: '', head: '', sex: '' }, false), fetch = prefill(h);
    fetch.request(); await fetch.finish();
    expect(h.api.captureStateReadOnly()).toMatchObject({ weeks: '34', days: '2', weight: '1650', length: '41', head: '29', sex: 'male' });
    expect(h.api.captureStateReadOnly()).not.toHaveProperty('assessment');
    expect(fetch.getPatient).toHaveBeenCalledOnce();
  });

  it('does not let an already requested prefill alter a newly computed result', async () => {
    const h = prepared({ head: '' }, false), fetch = prefill(h);
    fetch.request();
    h.document.getElementById('computeSgaBirth').click();
    const computed = h.api.captureStateReadOnly();
    await fetch.finish();
    expect(h.api.captureStateReadOnly()).toEqual(computed);
  });

  it.each(['reset', 'restore', 'patient', 'account', 'edit', 'lock', 'apply-sequence'])('rejects an old request after %s', async change => {
    const h = prepared({ head: '' }, false), fetch = prefill(h);
    let applySequence = 1;
    h.window.VildaDataImportExport = { getApplyLoadedDataSequence: () => applySequence };
    fetch.request();
    if (change === 'reset') h.api.resetState();
    if (change === 'restore') h.api.restoreState({ ...INPUT, head: '', weight: '1800' });
    if (change === 'patient') h.window._vildaCurrentPatientId = 'fictional-sga-patient-b';
    if (change === 'account') fetch.changeAccount();
    if (change === 'lock') h.window.VildaVault.isUnlocked = () => false;
    if (change === 'apply-sequence') applySequence += 1;
    if (change === 'edit') { h.document.getElementById('sgaBirthWeight').value = '1800'; h.document.getElementById('sgaBirthWeight').dispatch('input'); }
    const before = h.api.captureStateReadOnly();
    await fetch.finish();
    expect(h.api.captureStateReadOnly()).toEqual(before);
  });

  it('uses the current shared patient before a stale panel-local identity', async () => {
    const h = prepared({ head: '' }, false), fetch = prefill(h);
    h.window.sessionStorage.getItem = key => key === 'vildaCurrentPatientId' ? 'fictional-sga-patient-b' : null;
    fetch.request(); await fetch.finish();
    expect(fetch.getPatient).toHaveBeenCalledWith('fictional-sga-patient-b');
    expect(h.api.captureStateReadOnly().head).toBe('29');
  });

  it('lets only the latest request prefill the same still-empty form', async () => {
    const h = prepared({ head: '' }, false), fetch = prefill(h), pending = [];
    h.window.VildaVault.getPatient = () => new Promise(resolve => { pending.push(resolve); });
    fetch.request(); fetch.request();
    pending[0]({ snapshots: [{ payload: { perinatal: { ...PERINATAL, birthHeadCircCm: 28 } } }] });
    await Promise.resolve(); await Promise.resolve();
    expect(h.api.captureStateReadOnly().head).toBe('');
    pending[1]({ snapshots: [{ payload: { perinatal: { ...PERINATAL, birthHeadCircCm: 30 } } }] });
    await Promise.resolve(); await Promise.resolve();
    expect(h.api.captureStateReadOnly().head).toBe('30');
  });

  it('allows fresh prefill after an explicit reset/new load while refusing the old request', async () => {
    const h = prepared({ head: '' }, false), fetch = prefill(h);
    fetch.request(); h.api.resetState(); await fetch.finish();
    expect(h.api.captureStateReadOnly()).toMatchObject({ weeks: '', weight: '', head: '' });
    h.document.dispatchEvent({ type: 'vilda:patient-loaded', detail: { patientId: h.window._vildaCurrentPatientId, source: 'pick' } });
    await fetch.finish();
    expect(h.api.captureStateReadOnly()).toMatchObject({ weeks: '34', days: '2', weight: '1650', head: '29' });
  });
});

function owned(h, { patientId = 'fictional-sga-patient-a', ownerId = 'fictional-sga-owner' } = {}) {
  const fetch = prefill(h);
  let pid = patientId, owner = ownerId, sequence = 3;
  h.window.sessionStorage.getItem = key => key === 'vildaCurrentPatientId' ? pid : null;
  h.window._vildaCurrentPatientId = patientId;
  h.window.VildaVault.getCurrentUser = () => owner ? { userId: owner } : null;
  h.window.VildaDataImportExport = { getApplyLoadedDataSequence: () => sequence };
  return {
    ...fetch, setOwner: value => { owner = value; }, setSequence: value => { sequence = value; },
    setPatient(value) { pid = value; h.window._vildaCurrentPatientId = value; }
  };
}

const EMPTY = { sourceChoice: 'niklasson', sourceKeys: ['niklasson'], sex: '', weeks: '', days: '0', weight: '', length: '', head: '', hasComputed: false };

describe('SGA: deliberate Reset is scoped UI intent rather than clinical data', () => {
  it('keeps a native Reset empty across newly requested sync/auth/own Save and no-op input', async () => {
    const h = prepared(), fetch = owned(h);
    h.document.getElementById('resetSgaBirth').click();
    const ui = h.api.captureUiState();
    expect(ui).toEqual({ version: 1, prefillCleared: true, ownerId: 'fictional-sga-owner', patientId: 'fictional-sga-patient-a' });
    h.document.getElementById('sgaBirthWeight').dispatch('input');
    fetch.request(); await fetch.finish();
    h.document.dispatchEvent({ type: 'vilda:auth-hidden' }); await fetch.finish();
    h.document.dispatchEvent({ type: 'vilda:patient-loaded', detail: { patientId: 'fictional-sga-patient-a', source: 'save' } }); await fetch.finish();
    expect(h.api.captureStateReadOnly()).toEqual(EMPTY);
    expect(h.api.captureState()).toEqual(EMPTY);
    expect(h.api.captureUiState()).toEqual(ui);
    expect(fetch.getPatient).not.toHaveBeenCalled();
  });

  it.each(['programmatic-reset', 'load', 'restore'])('ends suppression on %s without generating an assessment', async action => {
    const h = prepared(), fetch = owned(h);
    h.document.getElementById('resetSgaBirth').click();
    if (action === 'programmatic-reset') h.api.resetState({ hideCard: true });
    if (action === 'load') h.document.dispatchEvent({ type: 'vilda:patient-loaded', detail: { patientId: 'fictional-sga-patient-a', source: 'pick' } });
    if (action === 'restore') h.api.restoreState(EMPTY);
    expect(h.api.captureUiState()).toBeNull();
    fetch.request(); await fetch.finish();
    expect(h.api.captureStateReadOnly()).toMatchObject({ weeks: '34', head: '29' });
    expect(h.api.captureStateReadOnly()).not.toHaveProperty('assessment');
  });

  it('restores the same working UI after F5 and leaves its clinical capture byte-equivalent', async () => {
    const first = prepared(); owned(first); first.document.getElementById('resetSgaBirth').click();
    const state = JSON.parse(JSON.stringify(first.api.captureStateReadOnly()));
    const ui = JSON.parse(JSON.stringify(first.api.captureUiState()));
    const next = sgaBirthEnvironment(), fetch = owned(next);
    expect(next.api.restoreUiState(state, ui, next.api.captureUiRestoreScope())).toBe(true);
    fetch.request(); await fetch.finish();
    expect(next.api.captureStateReadOnly()).toEqual(state);
    expect(next.api.captureUiState()).toEqual(ui);
    expect(fetch.getPatient).not.toHaveBeenCalled();
    expect(Object.keys(state).sort()).toEqual(Object.keys(EMPTY).sort());
  });

  it('defers a marked UI candidate until its account is known, without first hydrating it', () => {
    const h = prepared(), fetch = owned(h, { ownerId: null });
    const ui = { version: 1, prefillCleared: true, ownerId: 'fictional-sga-owner', patientId: 'fictional-sga-patient-a' };
    const before = h.api.captureStateReadOnly(), scope = h.api.captureUiRestoreScope();
    expect(h.api.restoreUiState(EMPTY, ui, scope)).toBe(false);
    expect(h.api.captureStateReadOnly()).toEqual(before);
    fetch.setOwner('fictional-sga-owner');
    expect(h.api.restoreUiState(EMPTY, ui, scope)).toBe(true);
    expect(h.api.captureStateReadOnly()).toEqual(EMPTY);
    expect(h.api.captureUiState()).toEqual(ui);
  });

  it.each(['reset', 'edit', 'restore', 'patient', 'account-session'])('rejects a stale UI restoration after %s', action => {
    const h = prepared(), fetch = owned(h), scope = h.api.captureUiRestoreScope();
    const ui = { version: 1, prefillCleared: true, ownerId: 'fictional-sga-owner', patientId: 'fictional-sga-patient-a' };
    if (action === 'reset') h.api.resetState({ hideCard: true });
    if (action === 'edit') { h.document.getElementById('sgaBirthWeight').value = '1600'; h.document.getElementById('sgaBirthWeight').dispatch('input'); }
    if (action === 'restore') h.api.restoreState({ ...INPUT, weight: '1800' });
    if (action === 'patient') fetch.setPatient('fictional-sga-patient-b');
    if (action === 'account-session') fetch.changeAccount();
    const before = h.api.captureStateReadOnly();
    expect(h.api.restoreUiState(EMPTY, ui, scope)).toBe(true);
    expect(h.api.captureStateReadOnly()).toEqual(before);
    expect(h.api.captureUiState()).toBeNull();
  });

  it('defers first prefill until UI restoration settles and retries untouched initial forms', async () => {
    const h = sgaBirthEnvironment(), fetch = owned(h);
    let ready = false;
    h.window.VildaDocproStatePersistence = { isReady: () => ready };
    fetch.request(); await fetch.finish();
    expect(fetch.getPatient).not.toHaveBeenCalled();
    ready = true; h.document.dispatchEvent({ type: 'vilda:docpro-state-ready' }); await fetch.finish();
    expect(fetch.getPatient).toHaveBeenCalledOnce();
    expect(h.api.captureStateReadOnly()).toMatchObject({ weeks: '34', days: '2', weight: '1650' });
  });

  it.each(['verified', 'unverified', 'new-session', 'new-apply'])('handles anonymous first own Save only with the %s receipt scope', async condition => {
    const h = prepared(), fetch = owned(h, { patientId: null });
    h.document.getElementById('resetSgaBirth').click();
    fetch.setPatient('fictional-first-save-id');
    if (condition === 'new-session') fetch.changeAccount();
    if (condition === 'new-apply') fetch.setSequence(4);
    h.document.dispatchEvent({ type: 'vilda:patient-loaded', detail: {
      source: 'save', patientId: 'fictional-first-save-id', snapshotId: 'fictional-snapshot', applySequence: 3,
      referenceVerified: condition !== 'unverified'
    } });
    await fetch.finish();
    if (condition === 'verified') {
      expect(h.api.captureUiState()).toMatchObject({ patientId: 'fictional-first-save-id', prefillCleared: true });
      expect(h.api.captureStateReadOnly()).toEqual(EMPTY);
      expect(fetch.getPatient).not.toHaveBeenCalled();
    } else {
      expect(h.api.captureUiState()).toBeNull();
      expect(fetch.getPatient).toHaveBeenCalledOnce();
    }
  });
});

// Run both real controllers with deterministic browser timers. Clinical SGA
// calculation/reference tables remain the same production files as above.
function startDocproUi(h, saved) {
  let now = 0, id = 0;
  const tasks = [], writes = [];
  const schedule = (callback, delay = 0) => {
    tasks.push({ id: ++id, time: now + delay, callback }); return id;
  };
  h.context.setTimeout = schedule;
  h.context.clearTimeout = cancelled => { const task = tasks.find(item => item.id === cancelled); if (task) task.cancelled = true; };
  h.context.MutationObserver = class { observe() {} disconnect() {} };
  h.window.setTimeout = schedule;
  h.window.CustomEvent = class { constructor(type) { this.type = type; } };
  h.window.VildaPersistence = {
    readDocproUi: () => saved, clearLegacyDocproState() {},
    writeDocproUi(value) { writes.push(JSON.parse(JSON.stringify(value))); }
  };
  vm.runInContext(readFileSync(new URL('../../docpro_state_persist.js', import.meta.url), 'utf8'), h.context);
  function advance(target) {
    for (;;) {
      const task = tasks.filter(item => !item.cancelled && item.time <= target).sort((a, b) => a.time - b.time || a.id - b.id)[0];
      if (!task) break;
      task.cancelled = true; now = task.time; task.callback();
    }
    now = target;
  }
  return { writes, advance };
}

function savedEmptyUi() {
  return {
    version: 2, patientId: 'fictional-sga-patient-a', controls: {}, details: {}, buttonStates: {}, ui: {},
    moduleStates: { sgaBirth: { ...EMPTY }, sgaBirthUi: {
      version: 1, prefillCleared: true, ownerId: 'fictional-sga-owner', patientId: 'fictional-sga-patient-a'
    } }
  };
}

describe('SGA Reset through the actual DocPro UI persistence controller', () => {
  it('restores the marker before readiness and persists it while auth is still pending', async () => {
    const h = sgaBirthEnvironment(), fetch = owned(h, { ownerId: null });
    const saved = savedEmptyUi(), before = JSON.stringify(saved), ui = startDocproUi(h, saved);
    expect(h.window.VildaDocproStatePersistence.isReady()).toBe(false);
    fetch.request(); await fetch.finish();
    expect(fetch.getPatient).not.toHaveBeenCalled();
    ui.advance(1850); await fetch.finish();
    expect(h.window.VildaDocproStatePersistence.isReady()).toBe(false);
    expect(ui.writes).toEqual([]);
    expect(fetch.getPatient).not.toHaveBeenCalled();
    fetch.setOwner('fictional-sga-owner'); h.document.dispatchEvent({ type: 'vilda:auth-hidden' }); ui.advance(1851); await fetch.finish();
    expect(h.window.VildaDocproStatePersistence.isReady()).toBe(true);
    expect(ui.writes.at(-1).moduleStates).toEqual(saved.moduleStates);
    expect(fetch.getPatient).not.toHaveBeenCalled();
    expect(h.api.captureStateReadOnly()).toEqual(EMPTY);
    expect(JSON.stringify(saved)).toBe(before);
  });

  it('does not replay old module state over a genuine Reset during the restore timers', async () => {
    const original = prepared();
    const h = sgaBirthEnvironment(), fetch = owned(h), saved = savedEmptyUi();
    saved.moduleStates.sgaBirth = original.state;
    delete saved.moduleStates.sgaBirthUi;
    // Named/id SGA controls must not participate in the generic control restore.
    saved.controls['id:sgaBirthWeight'] = { kind: 'text', value: '9999' };
    const ui = startDocproUi(h, saved);
    h.document.getElementById('resetSgaBirth').click();
    ui.advance(4000); await fetch.finish();
    expect(h.api.captureStateReadOnly()).toEqual(EMPTY);
    expect(ui.writes.at(-1).moduleStates.sgaBirthUi).toMatchObject({ prefillCleared: true });
    expect(fetch.getPatient).not.toHaveBeenCalled();
  });

  it('lets the readiness notification prefill an untouched old-format empty card', async () => {
    const h = sgaBirthEnvironment(), fetch = owned(h), saved = savedEmptyUi();
    delete saved.moduleStates.sgaBirthUi;
    const ui = startDocproUi(h, saved);
    ui.advance(1850); await fetch.finish();
    expect(fetch.getPatient).toHaveBeenCalledOnce();
    expect(h.api.captureStateReadOnly()).toMatchObject({ weeks: '34', days: '2', weight: '1650', head: '29' });
    expect(h.api.captureUiState()).toBeNull();
  });
});

describe('SGA: only explicitly cleared input fields are protected from prefill', () => {
  it.each([false, true])('keeps manually deleted measurements empty after sync and UI reload (computed=%s)', async computed => {
    const h = prepared({}, computed), fetch = owned(h);
    for (const id of ['sgaBirthWeight', 'sgaBirthLength', 'sgaBirthHead']) {
      h.document.getElementById(id).value = ''; h.document.getElementById(id).dispatch('input');
    }
    const state = h.api.captureStateReadOnly(), ui = h.api.captureUiState();
    expect(ui.clearedFields).toEqual(['weight', 'length', 'head']);
    expect(state).not.toHaveProperty('assessment');
    fetch.request(); await fetch.finish();
    expect(h.api.captureStateReadOnly()).toEqual(state);
    const next = sgaBirthEnvironment(), nextFetch = owned(next);
    next.api.restoreUiState(state, ui, next.api.captureUiRestoreScope());
    nextFetch.request(); await nextFetch.finish();
    expect(next.api.captureStateReadOnly()).toMatchObject({ weeks: '34', weight: '', length: '', head: '' });
    expect(next.api.captureStateReadOnly()).not.toHaveProperty('assessment');
    expect(next.api.captureUiState().clearedFields).toEqual(['weight', 'length', 'head']);
  });

  it('protects only a field really cleared by the user, while untouched empty fields still prefill', async () => {
    const h = prepared({ length: '', head: '' }, false), fetch = owned(h);
    h.document.getElementById('sgaBirthWeight').value = ''; h.document.getElementById('sgaBirthWeight').dispatch('input');
    fetch.request(); await fetch.finish();
    expect(h.api.captureStateReadOnly()).toMatchObject({ weight: '', length: '41', head: '29' });
    expect(h.api.captureUiState().clearedFields).toEqual(['weight']);
  });

  it('does not invent clearing intent for an untouched blank event or unknown metadata keys', async () => {
    const h = sgaBirthEnvironment(), fetch = owned(h);
    h.document.getElementById('sgaBirthWeight').dispatch('input');
    expect(h.api.captureUiState()).toBeNull();
    h.api.restoreUiState(EMPTY, { ...savedEmptyUi().moduleStates.sgaBirthUi, prefillCleared: false, clearedFields: ['unexpected', 'assessment', 'sourceChoice'] }, h.api.captureUiRestoreScope());
    fetch.request(); await fetch.finish();
    expect(h.api.captureStateReadOnly().weight).toBe('1650');
    expect(h.api.captureUiState()).toBeNull();
  });

  it('removes a field from clearing intent only when the user fills it and keeps other cleared fields owned', async () => {
    const h = prepared(), fetch = owned(h);
    h.document.getElementById('resetSgaBirth').click();
    h.document.getElementById('sgaBirthWeight').value = '1700'; h.document.getElementById('sgaBirthWeight').dispatch('input');
    expect(h.api.captureUiState().clearedFields).toEqual(['weeks', 'length', 'head']);
    fetch.request(); await fetch.finish();
    expect(h.api.captureStateReadOnly()).toMatchObject({ weeks: '', weight: '1700', length: '', head: '' });
  });

  it('does not interpret an unsuccessful Calculate after clearing as permission to refill', async () => {
    const h = prepared(), fetch = owned(h);
    h.document.getElementById('resetSgaBirth').click();
    h.document.getElementById('computeSgaBirth').click();
    fetch.request(); await fetch.finish();
    expect(h.api.captureStateReadOnly()).toEqual(EMPTY);
    expect(h.api.captureUiState()).toMatchObject({ prefillCleared: true });
    expect(fetch.getPatient).not.toHaveBeenCalled();
  });
});

function sharedLoadHarness() {
  let stamp = 'fictional-sga-tab:1';
  const events = new Map();
  const h = sgaBirthEnvironment({ configureWindow(win) {
    win.localStorage = { getItem: key => key === 'vilda:sharedLoadSeq' ? stamp : null };
    win.VildaPersistence = { getTabId: () => 'fictional-sga-tab' };
    win.addEventListener = (type, listener) => {
      if (!events.has(type)) events.set(type, []);
      events.get(type).push(listener);
    };
  } });
  const fetch = owned(h);
  h.api.restoreState(INPUT); h.document.getElementById('computeSgaBirth').click();
  return {
    ...h, fetch, setStamp: value => { stamp = value; },
    deliver(value, storageArea = h.window.localStorage) {
      for (const listener of events.get('storage') || []) listener({ key: 'vilda:sharedLoadSeq', storageArea, newValue: value });
    }
  };
}

describe('SGA: accepted same-tab shared loads end only the previous working UI', () => {
  it('ends a warm same-patient Reset on the existing newer accepted-load signal', async () => {
    const h = sharedLoadHarness(); h.document.getElementById('resetSgaBirth').click();
    h.setStamp('fictional-sga-tab:2'); h.deliver('fictional-sga-tab:2');
    expect(h.api.captureUiState()).toBeNull();
    h.document.dispatchEvent({ type: 'vilda:main-session-restored' }); await h.fetch.finish();
    expect(h.api.captureStateReadOnly()).toMatchObject({ weeks: '34', weight: '1650' });
  });

  it.each(['reset', 'edit', 'clinical-restore'])('does not let a queued earlier signal erase a newer %s', action => {
    const h = sharedLoadHarness();
    h.setStamp('fictional-sga-tab:2');
    // A foreign tab can overwrite the shared global key before delivery.
    h.setStamp('fictional-other-tab:3');
    if (action === 'reset') h.document.getElementById('resetSgaBirth').click();
    if (action === 'edit') { h.document.getElementById('sgaBirthWeight').value = '1700'; h.document.getElementById('sgaBirthWeight').dispatch('input'); }
    if (action === 'clinical-restore') h.api.restoreState({ ...INPUT, weight: '1800' });
    const before = h.api.captureStateReadOnly(), marker = h.api.captureUiState();
    h.deliver('fictional-sga-tab:2');
    expect(h.api.captureStateReadOnly()).toEqual(before);
    expect(h.api.captureUiState()).toEqual(marker);
  });

  it('ignores foreign tabs, wrong storage and duplicate older signals', () => {
    const h = sharedLoadHarness(); h.document.getElementById('resetSgaBirth').click();
    const marker = h.api.captureUiState();
    h.setStamp('fictional-other-tab:2'); h.deliver('fictional-other-tab:2');
    h.deliver('fictional-sga-tab:3', {});
    h.deliver('fictional-sga-tab:1');
    expect(h.api.captureUiState()).toEqual(marker);
  });

  it('rejects old pending prefill before the newer same-tab event is delivered', async () => {
    const h = sharedLoadHarness(); h.api.resetState({ hideCard: true });
    h.fetch.request(); h.setStamp('fictional-sga-tab:2');
    await h.fetch.finish();
    expect(h.api.captureStateReadOnly()).toEqual(EMPTY);
  });
});


it('rejects the entire marked UI candidate if another account becomes known before hydration', () => {
  const h = prepared(), fetch = owned(h, { ownerId: null }), scope = h.api.captureUiRestoreScope();
  const before = h.api.captureStateReadOnly();
  fetch.setOwner('fictional-other-owner');
  expect(h.api.restoreUiState(EMPTY, savedEmptyUi().moduleStates.sgaBirthUi, scope)).toBe(true);
  expect(h.api.captureStateReadOnly()).toEqual(before);
  expect(h.api.captureUiState()).toBeNull();
});


it.each(['reset', 'edit', 'calculate'])('ends pending UI-auth restoration after a newer %s instead of blocking readiness', action => {
  const h = prepared(), fetch = owned(h, { ownerId: null }), ui = startDocproUi(h, savedEmptyUi());
  ui.advance(1850);
  expect(h.window.VildaDocproStatePersistence.isReady()).toBe(false);
  if (action === 'reset') h.document.getElementById('resetSgaBirth').click();
  if (action === 'edit') { h.document.getElementById('sgaBirthWeight').value = '1700'; h.document.getElementById('sgaBirthWeight').dispatch('input'); }
  if (action === 'calculate') h.document.getElementById('computeSgaBirth').click();
  expect(h.window.VildaDocproStatePersistence.isReady()).toBe(true);
  ui.advance(1851);
  expect(ui.writes).toHaveLength(1);
  fetch.setOwner('fictional-other-owner');
  h.document.dispatchEvent({ type: 'vilda:auth-hidden' });
  expect(h.api.captureUiState()).toBeNull();
});

it('retains UI clearing intent across working-session hydration but ends it on a real Restore', () => {
  const h = prepared(), fetch = owned(h);
  for (const id of ['sgaBirthWeight', 'sgaBirthLength', 'sgaBirthHead']) {
    h.document.getElementById(id).value = ''; h.document.getElementById(id).dispatch('input');
  }
  const state = h.api.captureStateReadOnly(), intent = h.api.captureUiState();
  expect(state.hasComputed).toBe(false);
  h.api.restoreSessionState(state);
  expect(h.api.captureStateReadOnly()).toEqual(state);
  expect(h.api.captureUiState()).toEqual(intent);
  const next = sgaBirthEnvironment(); owned(next);
  const scope = next.api.captureUiRestoreScope(state);
  next.api.restoreSessionState(state);
  next.api.restoreUiState(state, intent, scope);
  expect(next.api.captureStateReadOnly()).toEqual(state);
  expect(next.api.captureUiState()).toEqual(intent);
  h.api.restoreState(state);
  expect(h.api.captureUiState()).toBeNull();
  expect(fetch.getPatient).not.toHaveBeenCalled();
});


it('lets a different current session assessment win over an earlier delayed DocPro UI candidate', () => {
  const old = prepared(), newer = prepared({ weight: '1800', sex: 'female' });
  const h = sgaBirthEnvironment(); owned(h);
  const saved = savedEmptyUi(); saved.moduleStates.sgaBirth = old.state; delete saved.moduleStates.sgaBirthUi;
  const ui = startDocproUi(h, saved);
  h.api.restoreSessionState(newer.state);
  ui.advance(4000);
  expect(h.api.captureStateReadOnly()).toEqual(newer.state);
  expect(ui.writes.at(-1).moduleStates.sgaBirth).toEqual(newer.state);
});


it.each([false, true])('adopts a first native Save PID after later event listeners only while its original scope survives (superseded=%s)', async superseded => {
  const h = prepared(), fetch = owned(h, { patientId: null });
  h.document.getElementById('resetSgaBirth').click();
  const event = { type: 'vilda:patient-loaded', detail: { source: 'save', patientId: 'fictional-first-save-id', snapshotId: 'fictional-snapshot', applySequence: 3, referenceVerified: true } };
  h.document.dispatchEvent(event);
  expect(h.api.captureUiState().patientId).toBeNull();
  if (superseded) fetch.changeAccount();
  fetch.setPatient('fictional-first-save-id');
  await Promise.resolve();
  if (superseded) expect(h.api.captureUiState()).toBeNull();
  else expect(h.api.captureUiState()).toMatchObject({ patientId: 'fictional-first-save-id', prefillCleared: true });
});


it('binds deferred first-save adoption to copied receipt fields, not a later mutation of event.detail', async () => {
  const h = prepared(), fetch = owned(h, { patientId: null });
  h.document.getElementById('resetSgaBirth').click();
  const detail = { source: 'save', patientId: 'fictional-first-save-id', snapshotId: 'fictional-snapshot', applySequence: 3, referenceVerified: true };
  h.document.dispatchEvent({ type: 'vilda:patient-loaded', detail });
  detail.patientId = 'fictional-unrelated-id'; detail.referenceVerified = false;
  fetch.setPatient('fictional-first-save-id');
  await Promise.resolve();
  expect(h.api.captureUiState()).toMatchObject({ patientId: 'fictional-first-save-id', prefillCleared: true });
});
