import fs from 'node:fs';
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

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-06T12:00:00Z')); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('queued shared state retains its document and visit authority', () => {
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

  it.each(['meaningful', 'empty'])('a real main-session collector cannot %s-flush after replacing the visit', kind => {
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
    // The real collector delegates to clinical module capture hooks. Model a
    // completed visit replacement inside that callback, without copying the
    // collector or meaningful-data rules into the fixture.
    const captureState = vi.fn(() => {
      h.nextVisit();
      current = h.seed({ ...h.base, weight: '50' });
      h.win.VildaPersistence.writeMainSession(main);
      h.win.sessionStorage.setItem('vildaLoadChoiceV1', 'new');
      h.win.sessionStorage.setItem('vildaPrevSummaryPid', 'fictional-next-visit');
      h.win.sessionStorage.setItem('vildaPrevSummaryAnchor', 'fictional-next-anchor');
      return null;
    });
    h.win.vildaSgaBirthPersistApi = { captureState };
    h.win.vildaPersistFlushNow({ force: true });
    expect(captureState).toHaveBeenCalledTimes(1);
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

  it('an actually empty shared and main session still removes automatic residue', () => {
    const h = harness();
    delete h.win.VildaDataImportExport;
    new Function('window', 'globalThis', 'document', source('vilda_data_import_export.js'))(h.win, h.win, h.document);
    const empty = { version: 1, name: '', user: {}, clcr: null };
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
