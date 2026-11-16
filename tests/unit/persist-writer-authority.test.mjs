import fs from 'node:fs';
import vm from 'node:vm';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { powloka } from '../support/powloka-harness.mjs';

const source = file => fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key), key: index => [...values.keys()][index] ?? null,
    get length() { return values.size; } };
}

// Real runtime, adapter, patient panel and shell. Only DOM and task timing are
// controlled; the apply-sequence getter models completion of another visit.
function harness() {
  const session = storage(), local = storage();
  session.setItem('vildaCurrentPatientId', 'fictional-persist-writer');
  const shell = powloka(null, host => { host.sessionStorage = session; host.localStorage = local; });
  shell.shell.navigate('start');
  const frame = shell.ramki.get(shell.shell.routes.start.src.split('?')[0]);
  const win = frame.contentWindow, document = frame.contentDocument;
  let applySequence = 1;
  const fields = Object.fromEntries(['age', 'ageMonths', 'height', 'weight', 'sex'].map(id => [id, {
    id, tagName: 'INPUT', type: 'number', value: ({ age: '13', ageMonths: '4', height: '160', weight: '48', sex: 'M' })[id],
    dataset: {}, disabled: false, closest: () => null,
    dispatchEvent(event) { document.dispatchEvent({ type: event.type, target: this, isTrusted: false }); return true; },
  }]));
  Object.assign(document, { readyState: 'complete', getElementById: id => fields[id] || null,
    getElementsByName: () => [], querySelectorAll: () => [], removeEventListener() {} });
  Object.assign(win, { sessionStorage: session, localStorage: local, vildaAppOnReady() {},
    setTimeout, clearTimeout, frameElement: frame, Event, CustomEvent,
    VildaDataImportExport: { getApplyLoadedDataSequence: () => applySequence, anyDataEntered: () => true },
    VildaVault: { isUnlocked: () => true }, removeEventListener() {} });
  win.window = win; win.top = win.parent;
  for (const file of ['vilda_panel_pacjent.js', 'vilda_persistence_adapter.js', 'vilda_persist_runtime.js']) {
    new Function('window', 'globalThis', 'document', 'setTimeout', 'clearTimeout', 'Event', 'CustomEvent', source(file))(
      win, win, document, setTimeout, clearTimeout, Event, CustomEvent);
  }
  win.VildaPersistRuntime.init();
  const base = { age: '13', ageMonths: '4', height: '160', weight: '48', sex: 'M',
    unrelatedHistory: [{ ageMonths: 156, height: 158, weight: 46 }],
    _vildaPersist: { byId: { age: '13', ageMonths: '4', height: '160', weight: '48', sex: 'M' } } };
  const seed = value => { win.VildaPersistence.writeShared(clone(value), { force: true }); return clone(win.VildaPersistence.readShared()); };
  seed(base);
  return { ...shell, win, frame, document, fields, base, seed,
    nextVisit() { applySequence += 1; },
    edit(value, id = 'weight') { fields[id].value = value; document.dispatchEvent({ type: 'input', target: fields[id], isTrusted: true }); },
    read: () => win.VildaPersistence.readShared(),
  };
}

function attachNativeCollector(h) {
  const getSequence = h.win.VildaDataImportExport.getApplyLoadedDataSequence;
  h.win.VildaVault.getCurrentUser = () => ({ userId: 'fictional-persist-owner' });
  h.win.crypto = { randomUUID: vi.fn(() => '00000000-0000-4000-8000-000000000001') };
  h.win.VildaClcrSessionRuntime = { saveNow: vi.fn() };
  delete h.win.VildaDataImportExport;
  for (const file of ['vilda_visit_context.js', 'vilda_data_import_export.js']) {
    new Function('window', 'globalThis', 'document', source(file))(h.win, h.win, h.document);
  }
  const api = h.win.VildaDataImportExport = { ...h.win.VildaDataImportExport, getApplyLoadedDataSequence: getSequence };
  const collect = vi.spyOn(api, 'collectUserData');
  const capture = vi.spyOn(api, 'captureCurrentUserDataReadOnly');
  return { api, collect, capture, uuid: h.win.crypto.randomUUID, renalSave: h.win.VildaClcrSessionRuntime.saveNow };
}

function attachNativeRenalWriter(h) {
  const native = attachNativeCollector(h);
  Object.values(h.fields).forEach(field => { field.addEventListener = () => {}; });
  for (const [id, value] of Object.entries({ formulaPicker: 'ckid_u25', Scr: '', CA_collectionHours: '24', CA_collectionSource: 'assumed-24h' })) {
    h.fields[id] = { ...h.fields.weight, id, type: 'text', value, style: {}, addEventListener() {} };
  }
  const form = { id: 'clcrForm', tagName: 'FORM', addEventListener() {},
    querySelectorAll: () => Object.values(h.fields).filter(field => field !== form) };
  h.fields.clcrForm = form;
  h.document.querySelector = () => null;
  h.win.currentVersion = 'advanced';
  const context = vm.createContext({ window: h.win, document: h.document, setTimeout, clearTimeout, Date });
  for (const file of ['clcr_collection_duration.js', 'inline_kalkulator_klirens_07.js']) {
    vm.runInContext(source(file), context, { filename: file });
  }
  const adapter = h.win.VildaPersistence;
  const write = vi.fn(value => adapter.writeClcrSession(value));
  h.win.VildaPersistence = { ...adapter, writeClcrSession: write };
  return { ...native, write };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-06T12:00:00Z')); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('queued shared state retains its document and visit authority', () => {
  it.each(['runtime', 'clcrSaveSessionNow', 'saveClcrSession'])('the shared writer explicitly saves owned renal defaults through %s without allocating a visit', route => {
    const h = harness(), native = attachNativeRenalWriter(h);
    if (route !== 'runtime') delete h.win.VildaClcrSessionRuntime;
    if (route === 'saveClcrSession') delete h.win.clcrSaveSessionNow;
    expect(h.win.VildaPersistence.readClcrSession()).toBeNull();
    h.win.vildaPersistFlushNow({ force: true });
    expect(native.write).toHaveBeenCalledTimes(1);
    expect(h.win.VildaPersistence.readClcrSession().inputs).toMatchObject({ CA_collectionHours: '24', Scr: '' });
    expect(native.collect).not.toHaveBeenCalled();
    expect(native.uuid).not.toHaveBeenCalled();
    expect(h.read().weight).toBe('48');
  });

  it('reading the current renal projection does not save defaults or allocate a visit', () => {
    const h = harness(), native = attachNativeRenalWriter(h);
    const first = native.api.captureCurrentUserDataReadOnly();
    const second = native.api.captureCurrentUserDataReadOnly();
    expect(first.clcr.inputs.CA_collectionHours).toBe('24');
    expect(second).toEqual(first);
    expect(native.write).not.toHaveBeenCalled();
    expect(h.win.VildaPersistence.readClcrSession()).toBeNull();
    expect(native.collect).not.toHaveBeenCalled();
    expect(native.uuid).not.toHaveBeenCalled();
  });

  it.each(['visit', 'account'])('a reentrant renal collector cannot publish old shared or renal data after a new %s', change => {
    const h = harness(), native = attachNativeRenalWriter(h);
    const freshRenal = { version: 2, inputs: { Scr: '0.9' } };
    let current, entered = false;
    Object.defineProperty(h.fields.CA_collectionHours, 'value', { get() {
      if (!entered) {
        entered = true;
        if (change === 'visit') h.nextVisit();
        else h.win.VildaVault.getCurrentUser = () => ({ userId: 'fictional-next-owner' });
        current = h.seed({ ...h.base, weight: '50' });
        h.win.VildaPersistence.writeClcrSession(freshRenal);
      }
      return '24';
    } });
    h.win.vildaPersistFlushNow({ force: true });
    expect(entered).toBe(true);
    expect(native.write).toHaveBeenCalledTimes(1); // Only the new owner's explicit seed.
    expect(h.win.VildaPersistence.readClcrSession()).toEqual(freshRenal);
    expect(h.read()).toEqual(current);
    expect(native.capture).not.toHaveBeenCalled();
    expect(native.collect).not.toHaveBeenCalled();
    expect(native.uuid).not.toHaveBeenCalled();
  });

  it.each(['locked', 'foreign-patient', 'inactive'])('a queued shared writer cannot save renal defaults after becoming %s', change => {
    const h = harness(), native = attachNativeRenalWriter(h);
    h.edit('47');
    if (change === 'locked') h.win.VildaVault.isUnlocked = () => false;
    if (change === 'foreign-patient') h.win.sessionStorage.setItem('vildaCurrentPatientId', 'fictional-other-patient');
    if (change === 'inactive') {
      h.shell.navigate('docpro'); // The valid outgoing flush precedes deactivation.
      native.write.mockClear();
    }
    const current = h.read(), renal = h.win.VildaPersistence.readClcrSession();
    vi.advanceTimersByTime(500);
    expect(native.write).not.toHaveBeenCalled();
    expect(h.win.VildaPersistence.readClcrSession()).toEqual(renal);
    expect(h.read()).toEqual(current);
    expect(native.collect).not.toHaveBeenCalled();
    expect(native.uuid).not.toHaveBeenCalled();
  });

  it('a normal shared flush respects restore pause before saving the owned renal form', () => {
    const h = harness(), native = attachNativeRenalWriter(h);
    h.win.VildaPersistence.pauseAutosave(900);
    h.win.vildaPersistFlushNow();
    expect(native.write).not.toHaveBeenCalled();
    expect(h.win.VildaPersistence.readClcrSession()).toBeNull();
    vi.advanceTimersByTime(901);
    h.win.vildaPersistFlushNow();
    expect(native.write).toHaveBeenCalledTimes(1);
    expect(h.win.VildaPersistence.readClcrSession().inputs.CA_collectionHours).toBe('24');
    expect(native.collect).not.toHaveBeenCalled();
    expect(native.uuid).not.toHaveBeenCalled();
  });

  it('the delayed meaningful-data check cannot create a visit or change the captured form', () => {
    const h = harness();
    const native = attachNativeCollector(h);
    h.win.VildaPersistence.pauseAutosave(900);
    h.edit('48');
    const before = native.api.captureCurrentUserDataReadOnly();
    expect(before.visit).toBeUndefined();
    native.capture.mockClear();
    vi.advanceTimersByTime(1200);
    expect(native.capture).toHaveBeenCalledWith();
    expect(native.collect).not.toHaveBeenCalled();
    expect(native.renalSave).not.toHaveBeenCalled();
    expect(native.uuid).not.toHaveBeenCalled();
    expect(h.read().weight).toBe('48');
    expect(h.read().unrelatedHistory).toEqual(h.base.unrelatedHistory);
    const after = native.api.captureCurrentUserDataReadOnly();
    delete before.timestampISO; delete after.timestampISO;
    expect(after).toEqual(before);

    // Identity allocation remains the responsibility of the normal collector.
    const saved = native.api.collectUserData();
    expect(native.uuid).toHaveBeenCalledTimes(1);
    expect(saved.visit).toMatchObject({ patientId: null, origin: 'explicit' });
    native.collect.mockClear(); native.renalSave.mockClear();
    h.win.vildaPersistFlushNow({ force: true });
    expect(native.api.captureCurrentUserDataReadOnly().visit).toEqual(saved.visit);
    expect(native.uuid).toHaveBeenCalledTimes(1);
    expect(native.collect).not.toHaveBeenCalled();
    expect(native.renalSave).not.toHaveBeenCalled();
  });

  it('the read-only native predicate preserves a draft containing only obesity therapy history', () => {
    const h = harness();
    const native = attachNativeCollector(h);
    Object.values(h.fields).forEach(field => { field.value = ''; });
    h.seed({});
    h.win.obesityTherapyPoints = [{ ageMonths: 156, weight: 48, note: 'Fikcyjna obserwacja' }];
    const main = native.api.captureCurrentUserDataReadOnly();
    expect(main.obesityTherapyPoints).toEqual(h.win.obesityTherapyPoints);
    expect(native.api.hasMeaningfulMainSessionData(main)).toBe(true);
    h.win.VildaPersistence.writeMainSession(main);
    h.win.sessionStorage.setItem('vildaLoadChoiceV1', 'new');
    native.capture.mockClear();
    h.win.vildaPersistFlushNow({ force: true });
    expect(native.capture).toHaveBeenCalledWith();
    expect(native.collect).not.toHaveBeenCalled();
    expect(h.win.VildaPersistence.readMainSession()).toEqual(main);
    expect(h.win.sessionStorage.getItem('vildaLoadChoiceV1')).toBe('new');
  });

  it('an unavailable bone-age reader preserves the sole-module draft and queued own edit until the form can be read', () => {
    const h = harness();
    const native = attachNativeCollector(h);
    Object.values(h.fields).forEach(field => { field.value = ''; });
    h.seed({});
    h.win.obesityTherapyPoints = [{ ageMonths: 156, weight: 48, note: 'Fikcyjna obserwacja' }];
    const main = native.api.captureCurrentUserDataReadOnly();
    expect(native.api.hasMeaningfulMainSessionData(main)).toBe(true);
    h.win.VildaPersistence.writeMainSession(main);
    h.win.sessionStorage.setItem('vildaLoadChoiceV1', 'new');
    // The field can mount before its delegated read-only API is available.
    h.fields.advBoneAge = { id: 'advBoneAge', value: '' };
    h.fields.customGoalKg = { ...h.fields.weight, id: 'customGoalKg', value: '' };
    h.edit('40', 'customGoalKg');
    expect(() => native.api.captureCurrentUserDataReadOnly()).toThrow('CURRENT_DATA_CAPTURE_UNAVAILABLE: bone-age');
    vi.advanceTimersByTime(500);
    expect(h.read()._vildaPersist.byId.customGoalKg).toBe('40');
    expect(h.win.VildaPersistence.readMainSession()).toEqual(main);
    expect(h.win.sessionStorage.getItem('vildaLoadChoiceV1')).toBe('new');
    expect(native.collect).not.toHaveBeenCalled();

    delete h.fields.advBoneAge;
    h.win.obesityTherapyPoints = [];
    h.edit('', 'customGoalKg');
    expect(native.api.hasMeaningfulMainSessionData(native.api.captureCurrentUserDataReadOnly())).toBe(false);
    vi.advanceTimersByTime(500);
    expect(h.win.sessionStorage.getItem('sharedUserData')).toBeNull();
    expect(h.win.VildaPersistence.readMainSession()).toBeNull();
    expect(h.win.sessionStorage.getItem('vildaLoadChoiceV1')).toBeNull();
    expect(native.collect).not.toHaveBeenCalled();
  });

  it('a shared flush without a renal form preserves an independent renal-only session', () => {
    const h = harness();
    const native = attachNativeCollector(h);
    Object.values(h.fields).forEach(field => { field.value = ''; });
    h.seed({});
    const renal = { version: 2, inputs: { U_Alb: '45', Ucr_spot: '100' },
      preservedInputs: { U_Alb: '45', Ucr_spot: '100' } };
    h.win.VildaPersistence.writeClcrSession(renal);
    expect(h.win.VildaPersistence.readClcrSession()).toEqual(renal);
    const main = native.api.collectUserData();
    expect(main.clcr).toEqual(renal);
    expect(native.api.hasMeaningfulMainSessionData(main)).toBe(true);
    expect(native.api.captureCurrentUserDataReadOnly().clcr).toBeNull();
    h.win.VildaPersistence.writeMainSession(main);
    h.win.sessionStorage.setItem('vildaLoadChoiceV1', 'new');
    native.collect.mockClear(); native.renalSave.mockClear();
    h.win.vildaPersistFlushNow({ force: true });
    expect(h.win.VildaPersistence.readMainSession()).toEqual(main);
    expect(h.win.VildaPersistence.readClcrSession()).toEqual(renal);
    expect(h.win.sessionStorage.getItem('vildaLoadChoiceV1')).toBe('new');
    expect(native.collect).not.toHaveBeenCalled();
    expect(native.renalSave).not.toHaveBeenCalled();
  });

  it('an owned empty renal form does not borrow a cached renal session to avoid cleanup', () => {
    const h = harness();
    const native = attachNativeCollector(h);
    Object.values(h.fields).forEach(field => { field.value = ''; });
    h.seed({});
    const renal = { version: 2, inputs: { U_Alb: '45', Ucr_spot: '100' } };
    h.win.VildaPersistence.writeClcrSession(renal);
    h.win.VildaPersistence.writeMainSession({ version: 1, user: {}, clcr: renal });
    h.fields.clcrForm = { id: 'clcrForm' };
    h.win.VildaClcrSessionRuntime.captureCurrentSessionReadOnly = vi.fn(() => ({ version: 2, inputs: {} }));
    expect(native.api.hasMeaningfulMainSessionData(native.api.captureCurrentUserDataReadOnly())).toBe(false);
    expect(native.renalSave).not.toHaveBeenCalled();
    h.win.vildaPersistFlushNow({ force: true });
    expect(h.win.VildaPersistence.readMainSession()).toBeNull();
    expect(h.win.sessionStorage.getItem('sharedUserData')).toBeNull();
    expect(native.collect).not.toHaveBeenCalled();
    expect(native.renalSave).toHaveBeenCalledExactlyOnceWith({ force: true, reason: 'shared-state-flush' });
  });

  it.each(['null', 'throw'])('an independent renal-session %s read distinguishes absence from unavailability', mode => {
    const h = harness();
    const native = attachNativeCollector(h);
    Object.values(h.fields).forEach(field => { field.value = ''; });
    h.seed({});
    const main = { version: 1, user: {}, clcr: { version: 2, inputs: { U_Alb: '45' } } };
    h.win.VildaPersistence.writeMainSession(main);
    const readClcrSession = vi.fn(() => {
      if (mode === 'throw') throw new Error('fictional unavailable renal session');
      return null;
    });
    h.win.VildaPersistence = { ...h.win.VildaPersistence, readClcrSession };
    h.win.vildaPersistFlushNow({ force: true });
    expect(readClcrSession).toHaveBeenCalled();
    expect(h.win.VildaPersistence.readMainSession()).toEqual(mode === 'throw' ? main : null);
    expect(native.collect).not.toHaveBeenCalled();
    expect(native.renalSave).not.toHaveBeenCalled();
  });

  it.each(['missing', 'null', 'throw'])('a %s read-only capture retains the legacy shared-state fallback without a mutating read', mode => {
    const h = harness();
    const native = attachNativeCollector(h);
    if (mode === 'missing') delete native.api.captureCurrentUserDataReadOnly;
    else native.capture.mockImplementation(() => {
      if (mode === 'throw') throw new Error('fictional unavailable module capture');
      return null;
    });
    h.win.vildaPersistFlushNow({ force: true });
    expect(h.read().weight).toBe('48');
    expect(h.read().unrelatedHistory).toEqual(h.base.unrelatedHistory);
    expect(native.collect).not.toHaveBeenCalled();
    expect(native.uuid).not.toHaveBeenCalled();
    expect(native.renalSave).not.toHaveBeenCalled();

    Object.values(h.fields).forEach(field => { field.value = ''; });
    h.seed({});
    const empty = { version: 1, user: {} };
    h.win.VildaPersistence.writeMainSession(empty);
    h.win.vildaPersistFlushNow({ force: true });
    if (mode !== 'missing') {
      expect(h.win.VildaPersistence.readMainSession()).toEqual(empty);
      native.capture.mockRestore();
      h.win.vildaPersistFlushNow({ force: true });
    }
    expect(h.win.sessionStorage.getItem('sharedUserData')).toBeNull();
    expect(h.win.VildaPersistence.readMainSession()).toBeNull();
    expect(native.collect).not.toHaveBeenCalled();
  });

  it.each(['timer', 'force'])('%s cannot publish a queued root from an earlier visit of the same patient', method => {
    const h = harness(); h.edit('47');
    h.nextVisit();
    const current = h.seed({ ...h.base, weight: '50', _vildaPersist: { byId: { ...h.base._vildaPersist.byId, weight: '50' } } });
    if (method === 'force') h.win.vildaPersistFlushNow({ force: true });
    vi.advanceTimersByTime(500);
    expect(h.read()).toEqual(current);
  });

  it('an element refresh cannot read stale DOM into a later same-patient visit', () => {
    const h = harness(); h.edit('47'); h.nextVisit();
    const current = h.seed({ ...h.base, weight: '50' });
    vi.advanceTimersByTime(0);
    expect(h.win.vildaGetPersistAutosaveCoalescingSnapshot().pendingElementRefreshCount).toBe(0);
    vi.advanceTimersByTime(500);
    expect(h.read()).toEqual(current);
  });

  it('a queued debounce cannot regain authority after A→B→A', () => {
    const h = harness(); h.edit('47');
    h.shell.navigate('docpro'); // synchronous genuine outgoing flush is allowed
    expect(h.read().weight).toBe('47');
    h.shell.navigate('start');
    const current = h.seed({ ...h.base, weight: '50' });
    h.fields.weight.value = '41';
    vi.advanceTimersByTime(500);
    expect(h.read()).toEqual(current);
  });

  it('an inactive same-patient panel cannot queue or force a shared write', () => {
    const h = harness(); h.shell.navigate('docpro');
    const current = h.read();
    h.edit('41'); h.win.vildaPersistFlushNow({ force: true });
    vi.advanceTimersByTime(500);
    expect(h.read()).toEqual(current);
  });

  it('a deferred force flush belongs to the visit that scheduled it', () => {
    const h = harness();
    const write = vi.spyOn(h.win.sessionStorage, 'setItem');
    h.document.dispatchEvent({ type: 'click', target: { closest: selector => selector === '#advAddMeasurementBtn' ? {} : null } });
    h.nextVisit();
    vi.advanceTimersByTime(200);
    expect(write.mock.calls.filter(([key]) => key === 'sharedUserData')).toEqual([]);
  });

  it('a locked hidden pane cannot erase the active shared identity on pagehide', () => {
    const h = harness();
    h.seed({ ...h.base, name: 'Fikcyjny Pacjent Aktywnej Wizyty', nameLocked: true });
    h.shell.navigate('docpro');
    const current = h.read();
    h.win.VildaVault.isUnlocked = () => false;
    h.win.dispatchEvent({ type: 'pagehide' });
    expect(h.read()).toEqual(current);
  });

  it.each([false, true])('the active locked document still removes cleartext aliases, reload quarantine=%s', quarantine => {
    const h = harness();
    h.seed({ ...h.base, name: 'Fikcyjny Pacjent Sprzątania', fullName: 'Fikcyjny Pacjent Sprzątania', nameLocked: true });
    const current = h.read();
    h.win.VildaVault.isUnlocked = () => false;
    if (quarantine) {
      h.win.parent.dispatchEvent({ type: 'pagehide' });
      expect(h.shell.isAppUpdateReloadPending()).toBe(true);
      expect(h.win.VildaPanelPacjent.canWriteSession()).toBe(false);
    }
    h.win.dispatchEvent({ type: 'pagehide' });
    delete current.name; delete current.fullName; delete current.nameLocked;
    expect(h.read()).toEqual(current);
  });

  it.each(['meaningful', 'empty'])('a real read-only collector cannot %s-flush after replacing the visit', kind => {
    const h = harness();
    const getSequence = h.win.VildaDataImportExport.getApplyLoadedDataSequence;
    delete h.win.VildaDataImportExport;
    new Function('window', 'globalThis', 'document', source('vilda_data_import_export.js'))(h.win, h.win, h.document);
    h.win.VildaDataImportExport = { ...h.win.VildaDataImportExport, getApplyLoadedDataSequence: getSequence };
    if (kind === 'empty') {
      Object.values(h.fields).forEach(field => { field.value = ''; });
      h.seed({});
    }
    const main = { version: 1, name: 'Fikcyjny Pacjent Następnej Wizyty', user: { weight: 50, height: 160 } };
    let current;
    // The real collector delegates to clinical module read-only hooks. Model a
    // completed visit replacement inside that callback, without copying the
    // collector or meaningful-data rules into the fixture.
    const captureStateReadOnly = vi.fn(() => {
      h.nextVisit();
      current = h.seed({ ...h.base, weight: '50' });
      h.win.VildaPersistence.writeMainSession(main);
      h.win.sessionStorage.setItem('vildaLoadChoiceV1', 'new');
      h.win.sessionStorage.setItem('vildaPrevSummaryPid', 'fictional-next-visit');
      h.win.sessionStorage.setItem('vildaPrevSummaryAnchor', 'fictional-next-anchor');
      return null;
    });
    const captureState = vi.fn();
    h.win.vildaSgaBirthPersistApi = { captureState, captureStateReadOnly };
    h.win.vildaPersistFlushNow({ force: true });
    expect(captureStateReadOnly).toHaveBeenCalledTimes(1);
    expect(captureState).not.toHaveBeenCalled();
    expect(h.read()).toEqual(current);
    expect(h.win.VildaPersistence.readMainSession()).toEqual(main);
    expect(h.win.sessionStorage.getItem('vildaLoadChoiceV1')).toBe('new');
    expect(h.win.sessionStorage.getItem('vildaPrevSummaryPid')).toBe('fictional-next-visit');
    expect(h.win.sessionStorage.getItem('vildaPrevSummaryAnchor')).toBe('fictional-next-anchor');
  });

  it('an empty hidden restore cannot delete another pane’s draft or visit context', () => {
    const h = harness();
    h.shell.navigate('docpro');
    const main = { version: 1, name: 'Fikcyjny Pacjent Zachowanej Wizyty', user: { age: 13, weight: 50, height: 160 } };
    const session = h.win.sessionStorage;
    session.setItem('vildaMainSessionV1', JSON.stringify(main));
    session.removeItem('sharedUserData');
    session.setItem('vildaLoadChoiceV1', 'new');
    session.setItem('vildaPrevSummaryPid', 'fictional-persist-writer');
    session.setItem('vildaPrevSummaryAnchor', 'fictional-anchor');
    h.win.vildaPersistRestoreAll();
    expect(JSON.parse(session.getItem('vildaMainSessionV1'))).toEqual(main);
    expect(session.getItem('vildaLoadChoiceV1')).toBe('new');
    expect(session.getItem('vildaPrevSummaryPid')).toBe('fictional-persist-writer');
    expect(session.getItem('vildaPrevSummaryAnchor')).toBe('fictional-anchor');
  });

  it.each(['clinical', 'anonymous-clcr'])('active empty shared restore preserves the independent %s main draft', kind => {
    const h = harness();
    delete h.win.VildaDataImportExport;
    new Function('window', 'globalThis', 'document', source('vilda_data_import_export.js'))(h.win, h.win, h.document);
    const main = kind === 'clinical'
      ? { version: 1, name: 'Fikcyjny Pacjent Osobnego Stanu', user: { age: 13, height: 160, weight: 50 } }
      : { version: 1, name: '', user: {}, clcr: { version: 2,
        inputs: { U_Alb: '45', Ucr_spot: '100' }, preservedInputs: { U_Alb: '45', Ucr_spot: '100' } } };
    const session = h.win.sessionStorage;
    if (kind === 'anonymous-clcr') {
      session.removeItem('vildaCurrentPatientId');
      h.win.VildaPanelPacjent.wczytanie();
      Object.values(h.fields).forEach(field => { field.value = ''; });
    }
    expect(h.win.VildaDataImportExport.hasMeaningfulMainSessionData(main)).toBe(true);
    expect(h.win.VildaPersistence.writeMainSession(main)).toBe(true);
    session.removeItem('sharedUserData');
    session.setItem('vildaLoadChoiceV1', 'new');
    const remove = vi.spyOn(session, 'removeItem');
    h.win.vildaPersistRestoreAll();
    expect(h.win.VildaPersistence.readMainSession()).toEqual(main);
    expect(session.getItem('vildaLoadChoiceV1')).toBe('new');
    expect(remove.mock.calls.filter(([key]) => key === 'vildaMainSessionV1')).toEqual([]);
    h.win.VildaPersistence.clearUserState({ includeSessions: true, includeModuleState: false, source: 'fictional-explicit-clear' });
    expect(h.win.VildaPersistence.readMainSession()).toBeNull();
  });

  it.each(['captured-ui', 'doctor', 'bp-ui'])('empty shared restore removes only the %s preference-only main residue', kind => {
    const h = harness();
    delete h.win.VildaDataImportExport;
    new Function('window', 'globalThis', 'document', source('vilda_data_import_export.js'))(h.win, h.win, h.document);
    // Full synthetic browser snapshot at the first erroneous startup sex lock.
    const main = JSON.parse(source('tests/fixtures/main-session-docpro-empty-ui.json'));
    if (kind !== 'captured-ui') main.zscore = { resultsMode: false, dataSource: 'OLAF' };
    if (kind === 'doctor') main.doctor = { isDoctor: true, pwzNumber: '0000000' };
    if (kind === 'bp-ui') main.bpDataToggle = true;
    expect(h.win.VildaDataImportExport.hasMeaningfulMainSessionData(main)).toBe(true);
    h.win.VildaPersistence.writeMainSession(main);
    h.win.sessionStorage.removeItem('sharedUserData');
    h.win.vildaPersistRestoreAll();
    expect(h.win.VildaPersistence.readMainSession()).toBeNull();
    expect(h.fields.sex.disabled).toBe(false);
  });

  it.each([
    ['SGA birth', { birth: { weeks: '38', weight: '2100', length: '45', hasComputed: true } }],
    ['perinatal', { perinatal: { gestationalWeeks: 38, birthWeightGrams: 2100 } }],
    ['puberty', { puberty: { onsetAgeYears: 11 } }],
    ['chart annotation', { chartCreator: { annotation: 'Fikcyjna adnotacja kliniczna' } }],
    ['bisphosphonate history', { bisphosTherapyPoints: [{ ageMonths: 120, drug: 'fictional' }] }],
    ['DOB', { user: { dobISO: '2013-01-02' } }],
    ['legacy DOB', { dobISO: '2013-01-02' }],
    ['first name', { user: { firstName: 'Fikcyjna' } }],
    ['last name', { user: { lastName: 'Przykładowa' } }],
    ['zero completed weeks', { user: { ageWeeks: 0 } }],
    ['explicit newborn years', { user: { age: 0 } }],
    ['legacy explicit newborn years', { user: { age: '0' } }],
    ['advanced patient name', { advanced: { name: 'Fikcyjna Przykładowa' } }],
    ['growth patient name', { growthBasic: { name: 'Fikcyjna Przykładowa' } }],
    ['measurement date', { user: { measuredAtISO: '2026-11-05' } }],
    ['legacy Tanner', { user: { tannerStage: '2' } }],
    ['current bone age', { advanced: { boneAgeContext: { version: 1, current: { years: 10, atAgeMonths: 132 }, last: null } } }],
    ['previous bone age', { advanced: { data: { boneAgeContext: { version: 1, current: null, last: { years: 9, atAgeMonths: 120 } } } } }],
    ['custom weight goal', { plan: { customGoalKg: 40 } }],
    ['chosen diet', { plan: { dietLevel: 'balanced', dietaWybrana: true } }],
    ['chosen PAL', { plan: { palFactor: 1.4, palWybrany: true } }],
    ['future clinical extension', { fictionalClinicalExtension: { observation: 'Fikcyjna obserwacja' } }],
    ['future zero observation', { fictionalClinicalExtension: 0 }],
    ['future negative answer', { fictionalClinicalExtension: false }],
    ['Clcr only', { clcr: { inputs: { U_Alb: '45', Ucr_spot: '100' } } }],
    ['ordinary clinical', { user: { weight: 50, height: 160 } }],
  ])('empty aliases preserve %s independently of preference-only metadata', (_label, extension) => {
    const h = harness();
    delete h.win.VildaDataImportExport;
    new Function('window', 'globalThis', 'document', source('vilda_data_import_export.js'))(h.win, h.win, h.document);
    const main = { version: 1, name: '', user: {}, ...clone(extension) };
    h.win.VildaPersistence.writeMainSession(main);
    h.win.sessionStorage.removeItem('sharedUserData');
    h.win.vildaPersistRestoreAll();
    expect(h.win.VildaPersistence.readMainSession()).toEqual(main);
    // The restoration decision never edits profile sections or the draft.
    const withPreferences = { ...main, doctor: { isDoctor: true }, zscore: { resultsMode: true }, bpDataToggle: true };
    h.win.VildaPersistence.writeMainSession(withPreferences);
    h.win.vildaPersistRestoreAll();
    expect(h.win.VildaPersistence.readMainSession()).toEqual(withPreferences);
    h.win.VildaPersistence.clearUserState({ includeSessions: true, includeModuleState: false, source: 'fictional-explicit-clear' });
    expect(h.win.VildaPersistence.readMainSession()).toBeNull();
  });

  it.each([false, true])('an empty main session still removes residue with visit metadata=%s', withVisit => {
    const h = harness();
    delete h.win.VildaDataImportExport;
    new Function('window', 'globalThis', 'document', source('vilda_data_import_export.js'))(h.win, h.win, h.document);
    const empty = { version: 1, name: '', user: {}, clcr: null };
    if (withVisit) empty.visit = { version: 1, visitId: 'fictional-visit', patientId: null,
      clinicalDateISO: '2026-11-14', createdAtISO: '2026-11-14T10:00:00.000Z', origin: 'explicit' };
    expect(h.win.VildaDataImportExport.hasMeaningfulMainSessionData(empty)).toBe(false);
    h.win.VildaPersistence.writeMainSession(empty);
    h.win.sessionStorage.removeItem('sharedUserData');
    h.win.sessionStorage.setItem('vildaLoadChoiceV1', 'new');
    h.win.vildaPersistRestoreAll();
    expect(h.win.VildaPersistence.readMainSession()).toBeNull();
    expect(h.win.sessionStorage.getItem('vildaLoadChoiceV1')).toBeNull();
  });

  it('current edits still save while the browser tab itself is hidden', () => {
    const h = harness(); h.edit('49');
    h.document.hidden = true; h.document.visibilityState = 'hidden';
    h.document.dispatchEvent({ type: 'visibilitychange' });
    expect(h.read().weight).toBe('49');
    expect(h.read()._vildaPersist.byId.weight).toBe('49');
    expect(h.read().unrelatedHistory).toEqual(h.base.unrelatedHistory);
  });

  it('a new valid edit works after stale queued state is discarded', () => {
    const h = harness(); h.edit('47'); h.nextVisit();
    h.seed({ ...h.base, weight: '50' });
    h.edit('51'); vi.advanceTimersByTime(500);
    expect(h.read().weight).toBe('51');
    expect(h.read()._vildaPersist.byId.weight).toBe('51');
  });
});
