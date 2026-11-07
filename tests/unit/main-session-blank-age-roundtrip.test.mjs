import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

// The real collector, session writer, importer and explicit Save. Only browser
// controls, the storage boundary and the fictional Vault are supplied here.
function documentHarness({ shared = { main: null }, route = 'index', values = {}, doctor = false, birth = null, dob = null, weeks = null } = {}) {
  const fields = new Map(), events = [], storage = new Map();
  const initial = { name: '', age: '', ageMonths: '', ageWeeks: '', sex: 'M', height: '', weight: '', ...values };
  for (const [id, value] of Object.entries(initial)) fields.set(id, {
    id, value: String(value), tagName: 'INPUT', type: 'text', checked: false, disabled: false, style: {}, dataset: {},
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, removeAttribute() {},
    dispatchEvent(event) { events.push({ id, type: event.type, value: this.value }); return true; },
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  });
  fields.set('isDoctor', { id: 'isDoctor', checked: doctor, value: '', style: {}, dataset: {},
    addEventListener() {}, dispatchEvent() { return true; } });
  let currentDob = dob, currentWeeks = weeks;
  const token = {}, committed = [], savePatient = vi.fn(async payload => {
    committed.push(clone(payload));
    return { patientId: 'fictional-blank-age-patient', snapshotId: 'fictional-blank-age-snapshot', header: { name: payload.name } };
  });
  const win = {
    document: { readyState: 'complete', hidden: false,
      getElementById: id => fields.get(id) || null, querySelector: () => null, querySelectorAll: () => [],
      addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } },
    location: { pathname: `/${route}.html` },
    setTimeout, clearTimeout, requestAnimationFrame: fn => setTimeout(fn, 0), cancelAnimationFrame: clearTimeout,
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    sessionStorage: { getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    Event: class { constructor(type) { this.type = type; } },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    VildaAuthUI: { isBootReady: () => true },
    VildaVault: { isUnlocked: () => true, getCurrentUser: () => ({ userId: 'fictional-blank-age-account' }),
      captureSyncOperationSession: () => token,
      assertSyncOperationSession(value) { if (value !== token) throw new Error('Fictional stale session'); },
      savePatient },
    VildaPersistence: { getStorage: () => ({}), readMainSession: () => clone(shared.main),
      writeMainSession(value) { shared.main = clone(value); return true; },
      clearMainSession() { shared.main = null; return true; },
      readClcrSession: () => null, readModuleJSON: (_key, fallback) => fallback },
    VildaDobAge: { readISO: () => currentDob, readWeeks: () => currentWeeks, readMeasuredAtISO: () => null,
      setFromSession(value) { currentDob = value; }, setWeeksFromRecord(value) { currentWeeks = value; fields.get('ageWeeks').value = String(value); } },
    vildaBirthData: clone(birth),
  };
  win.window = win; win.self = win; win.parent = win; win.top = win;
  loadBrowserScript('vilda_data_import_export.js', win);
  const api = win.VildaDataImportExport;
  const options = { syncSharedUserDataFromLoadedData() {},
    rehydrateAdvancedFromState() {}, rehydrateIntakeFromState() {},
    applyLoadedData(data, restoreOptions) { return api.applyLoadedData(data, { ...options, ...restoreOptions }); } };
  return { api, win, fields, events, shared, storage, savePatient, committed,
    apply(data, overrides = {}) { return api.applyLoadedData(data, { ...options, ...overrides }); },
    restore() {
      const result = api.restoreMainSessionIfAny(options);
      vi.runOnlyPendingTimers(); vi.runOnlyPendingTimers();
      // Let the native import's published autosave pause expire; do not force
      // the writer or clear its restore guards from the harness.
      vi.advanceTimersByTime(Math.max(0, Number(win.__vildaPersistPauseUntil || 0) - Date.now()));
      expect(api.isMainSessionAutosavePaused()).toBe(false);
      return result;
    },
    collect: () => api.collectUserData(),
    saveSession: () => api.saveMainSessionNow(),
  };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-06T12:00:00Z')); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('native collection preserves an unknown age instead of manufacturing zero months', () => {
  it.each(['index', 'docpro'])('keeps both blank age controls null in the %s save/export payload', route => {
    const h = documentHarness({ route }), payload = h.collect();
    expect(payload.user).toMatchObject({ age: null, ageMonths: null, height: null, weight: null });
    expect(payload.user).not.toHaveProperty('ageWeeks');
    expect(JSON.parse(JSON.stringify(payload)).user).toMatchObject({ age: null, ageMonths: null });
    expect(h.api.hasMeaningfulMainSessionData(payload)).toBe(false);
    expect(h.fields.get('age').value).toBe(''); expect(h.fields.get('ageMonths').value).toBe('');
  });

  it.each([
    ['explicit newborn years', { age: '0' }, { age: 0, ageMonths: 0 }],
    ['explicit newborn months', { ageMonths: '0' }, { age: 0, ageMonths: 0 }],
    ['months-only infant', { ageMonths: '5' }, { age: 0, ageMonths: 5 }],
    ['known years with blank months', { age: '12' }, { age: 12, ageMonths: 0 }],
    ['known years and months', { age: '12', ageMonths: '4' }, { age: 12, ageMonths: 4 }],
  ])('retains the existing numeric contract for %s', (_label, values, expected) => {
    expect(documentHarness({ values }).collect().user).toMatchObject(expected);
  });

  it.each([0, 3])('keeps the authoritative %s-week basis without deriving age from empty controls', weeks => {
    const h = documentHarness({ weeks }), payload = h.collect();
    expect(payload.user).toMatchObject({ age: null, ageMonths: null, ageWeeks: weeks });
    expect(h.fields.get('age').value).toBe(''); expect(h.fields.get('ageMonths').value).toBe('');
  });

  it('preserves the exact DOB without inventing age or a measurement date', () => {
    const payload = documentHarness({ dob: '2026-11-06' }).collect();
    expect(payload.user).toMatchObject({ age: null, ageMonths: null, dobISO: '2026-11-06' });
    expect(payload.user).not.toHaveProperty('measuredAtISO');
  });

  it.each([
    ['name only', true, false],
    ['birth/SGA only', false, true],
    ['name and birth/SGA', true, true],
  ])('%s does not supply the current patient age', (_label, withName, withBirth) => {
    const birth = withBirth ? { weeks: '34', days: '2', weight: '1650', length: '41', head: '29', hasComputed: false } : null;
    const name = withName ? 'Fikcyjna Alicja Bez Wieku' : '';
    const h = documentHarness({ route: 'docpro', values: { name }, birth });
    const payload = h.collect();
    expect(payload.name).toBe(name);
    expect(payload.user).toMatchObject({ age: null, ageMonths: null });
    if (withBirth) expect(payload.birth).toEqual(birth);
    if (withName) expect(h.api.hasMeaningfulMainSessionData(payload)).toBe(true);
  });
});

describe('blank Start and DocPro session round trips', () => {
  it('keeps an entirely empty form empty through three actual collection/restore cycles', () => {
    const shared = { main: null };
    for (let cycle = 0; cycle < 3; cycle++) {
      for (const route of ['index', 'docpro']) {
        const h = documentHarness({ shared, route });
        expect(h.restore(), `${route}, cycle ${cycle}`).toBe(false);
        expect(h.saveSession()).toBe(false);
        expect(shared.main).toBeNull();
        expect(h.collect().user).toMatchObject({ age: null, ageMonths: null });
        for (const id of ['age', 'ageMonths', 'ageWeeks']) expect(h.fields.get(id).value, `${route}/${id}`).toBe('');
      }
    }
  });

  it.each(['M', 'F'])('retains doctor preferences and editable sex %s without turning the session into a newborn', sex => {
    const shared = { main: null };
    const start = documentHarness({ shared, doctor: true, values: { sex } });
    expect(start.restore()).toBe(false);
    expect(start.saveSession()).toBe(true);
    for (let cycle = 0; cycle < 3; cycle++) {
      for (const route of ['docpro', 'index']) {
        const h = documentHarness({ shared, route });
        expect(h.restore(), `${route}, cycle ${cycle}`).toBe(true);
        expect(h.fields.get('isDoctor').checked).toBe(true);
        expect(h.fields.get('sex').value, `${route}, cycle ${cycle}`).toBe(sex);
        expect(h.fields.get('sex').disabled, `${route}, cycle ${cycle}`).toBe(false);
        for (const id of ['age', 'ageMonths', 'ageWeeks']) expect(h.fields.get(id).value, `${route}/${id}`).toBe('');
        expect(h.collect().user).toMatchObject({ age: null, ageMonths: null });
        expect(h.saveSession()).toBe(true);
        expect(shared.main.user).toMatchObject({ age: null, ageMonths: null });
        expect(shared.main.user).not.toHaveProperty('ageWeeks');
        expect(shared.main.doctor.isDoctor).toBe(true);
      }
    }
  });

  it.each([
    ['newborn', { age: '0', height: '50', weight: '3.2' }, null, null],
    ['months only', { ageMonths: '5' }, null, null],
    ['DOB', {}, '2026-11-06', null],
    ['weeks', {}, null, 3],
  ])('session restoration retains real %s input', (_label, values, dob, weeks) => {
    const shared = { main: null }, name = 'Fikcyjny Pacjent Z Podanym Wiekiem';
    const h = documentHarness({ shared, values: { name, ...values }, dob, weeks });
    h.restore(); expect(h.saveSession()).toBe(true);
    const expected = clone(shared.main.user);
    const next = documentHarness({ shared, route: 'docpro' });
    expect(next.restore()).toBe(true);
    expect(next.collect().user).toEqual(expected);
    expect(shared.main.user).toEqual(expected);
  });
});

describe('session restoration does not own an anonymous form identity lock', () => {
  const preferences = () => ({ version: 1, name: '',
    user: { age: null, ageMonths: null, sex: 'F', height: null, weight: null },
    doctor: { isDoctor: true } });

  it.each(['index', 'docpro'])('restores an anonymous preference-only %s session without locking sex', route => {
    const h = documentHarness({ route }), payload = preferences(), before = clone(payload);
    expect(h.apply(payload, { isSessionRestore: true })).toBe(true);
    expect(h.fields.get('sex').value).toBe('F');
    expect(h.fields.get('sex').disabled).toBe(false);
    expect(payload).toEqual(before);
  });

  it.each([
    ['newborn', { age: 0, ageMonths: 0, height: 50, weight: 3.2 }],
    ['measured child', { age: 12, ageMonths: 4, height: 150, weight: 40 }],
  ])('keeps an unnamed unsaved %s editable while preserving the entered measurements', (_label, user) => {
    const h = documentHarness(), payload = preferences();
    Object.assign(payload.user, user);
    expect(h.apply(payload, { isSessionRestore: true })).toBe(true);
    expect(h.fields.get('sex').value).toBe('F');
    expect(h.fields.get('sex').disabled).toBe(false);
    expect(h.collect().user).toMatchObject({ ...user, sex: 'F' });
  });

  it('does not release an existing lock owned by another module', () => {
    const h = documentHarness();
    h.fields.get('sex').disabled = true;
    expect(h.apply(preferences(), { isSessionRestore: true })).toBe(true);
    expect(h.fields.get('sex').disabled).toBe(true);
  });

  it.each(['name', 'user-names', 'selected-patient'])('preserves the %s patient identity lock during session restore', identity => {
    const h = documentHarness(), payload = preferences();
    if (identity === 'name') payload.name = 'Fikcyjna Alicja Z Kartoteki';
    if (identity === 'user-names') Object.assign(payload.user, { firstName: 'Fikcyjna', lastName: 'Alicja Z Kartoteki' });
    if (identity === 'selected-patient') h.storage.set('vildaCurrentPatientId', 'fictional-selected-patient');
    expect(h.apply(payload, { isSessionRestore: true })).toBe(true);
    expect(h.fields.get('sex').value).toBe('F');
    expect(h.fields.get('sex').disabled).toBe(true);
  });

  it('preserves the existing lock when an anonymous record is explicitly imported', () => {
    const h = documentHarness();
    expect(h.apply(preferences())).toBe(true);
    expect(h.fields.get('sex').disabled).toBe(true);
  });
});

describe('native importer only describes a missing previous measurement in a patient context', () => {
  const preferences = () => ({ version: 1, name: '',
    user: { age: null, ageMonths: null, sex: 'M', height: null, weight: null },
    doctor: { isDoctor: true } });

  it('does not show a missing-measurement hint for an anonymous preference-only session restore', () => {
    const h = documentHarness(), payload = preferences(), before = clone(payload), showLoadDataMessage = vi.fn();
    expect(h.apply(payload, { isSessionRestore: true, showLoadDataMessage })).toBe(true);
    expect(showLoadDataMessage).toHaveBeenCalledOnce();
    expect(showLoadDataMessage).toHaveBeenCalledWith({ noMeasurement: false });
    expect(payload).toEqual(before);
  });

  it('retains the hint for a named or selected patient restored without a measurement', () => {
    for (const identity of ['name', 'user-names', 'selected-patient']) {
      const h = documentHarness(), payload = preferences(), showLoadDataMessage = vi.fn();
      if (identity === 'name') payload.name = 'Fikcyjny Jan Bez Pomiaru';
      if (identity === 'user-names') Object.assign(payload.user, { firstName: 'Fikcyjna', lastName: 'Alicja Bez Pomiaru' });
      if (identity === 'selected-patient') h.storage.set('vildaCurrentPatientId', 'fictional-selected-patient');
      expect(h.apply(payload, { isSessionRestore: true, showLoadDataMessage }), identity).toBe(true);
      expect(showLoadDataMessage, identity).toHaveBeenCalledOnce();
      expect(showLoadDataMessage, identity).toHaveBeenCalledWith({ noMeasurement: true });
    }
  });

  it('retains the existing hint when an anonymous record is explicitly loaded', () => {
    const h = documentHarness(), showLoadDataMessage = vi.fn();
    expect(h.apply(preferences(), { showLoadDataMessage })).toBe(true);
    expect(showLoadDataMessage).toHaveBeenCalledOnce();
    expect(showLoadDataMessage).toHaveBeenCalledWith({ noMeasurement: true });
  });
});

describe('explicit native Save keeps the unknown/zero age boundary', () => {
  it('refuses a missing age instead of storing an invented newborn', async () => {
    const h = documentHarness({ values: { name: 'Fikcyjna Alicja Bez Wieku', height: '150', weight: '40' } });
    h.restore();
    expect(h.api.getSaveReadiness().ready).toBe(true);
    const receipt = await h.api.saveUserDataWithReceipt();
    expect(receipt.saved).toBe(false);
    expect(h.savePatient).not.toHaveBeenCalled();
    expect(h.collect().user).toMatchObject({ age: null, ageMonths: null });
  });

  it('still commits an explicitly entered newborn zero with zero months', async () => {
    const h = documentHarness({ values: { name: 'Fikcyjny Jan Noworodek', age: '0', height: '50', weight: '3.2' } });
    h.restore();
    expect(h.api.getSaveReadiness().ready).toBe(true);
    const before = h.collect(), receipt = await h.api.saveUserDataWithReceipt();
    expect(receipt).toMatchObject({ saved: true, patientId: 'fictional-blank-age-patient' });
    expect(h.savePatient).toHaveBeenCalledOnce();
    expect(h.committed[0]).toEqual(before);
    expect(h.committed[0].user).toMatchObject({ age: 0, ageMonths: 0, height: 50, weight: 3.2 });
    expect(h.fields.get('age').value).toBe('0'); expect(h.fields.get('ageMonths').value).toBe('');
  });
});
