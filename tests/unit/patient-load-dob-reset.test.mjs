import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Real DOB module + importer. The two identities are fictional; no vault or
// browser profile is opened. A new load must not retain another form's DOB.
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const patient = (name, user = {}) => ({ version: 1, name,
  user: { sex: 'M', age: 13, ageMonths: 0, height: 158, weight: 46, ...user } });

function events(target = {}) {
  const listeners = new Map();
  target.addEventListener = (type, callback) => {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(callback);
  };
  target.removeEventListener = (type, callback) => {
    listeners.set(type, (listeners.get(type) || []).filter(value => value !== callback));
  };
  target.dispatchEvent = event => {
    for (const callback of [...(listeners.get(event.type) || [])]) callback(event);
    return true;
  };
  return target;
}

function harness() {
  const fields = new Map(), storage = new Map();
  let session = null, shared = {};
  const document = events({ readyState: 'complete',
    getElementById: id => fields.get(id) || null,
    getElementsByName: () => [], querySelector: () => null, querySelectorAll: () => [] });
  for (const id of ['name', 'lastName', 'firstName', 'advName', 'basicGrowthName',
    'age', 'ageMonths', 'height', 'weight', 'sex', 'tannerStage', 'dobInput',
    'dobNote', 'dobError', 'dobClear', 'ageWeeks', 'ageWeeksRow', 'ageWeeksNote',
    'ageWeeksError', 'restoreStateBtn']) {
    const input = events({ id, value: '', tagName: 'INPUT', type: 'text', dataset: {},
      readOnly: false, disabled: false, hidden: false, textContent: '',
      style: { display: 'none' }, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      setAttribute() {}, removeAttribute() {}, getAttribute: () => null, focus() {} });
    const localDispatch = input.dispatchEvent;
    input.dispatchEvent = event => {
      const forwarded = { type: event.type, target: input, bubbles: event.bubbles, isTrusted: false };
      localDispatch(forwarded);
      if (event.bubbles) document.dispatchEvent(forwarded);
      return true;
    };
    fields.set(id, input);
  }
  const win = events({ document, setTimeout, clearTimeout,
    Event: class { constructor(type, options) { this.type = type; this.bubbles = !!options?.bubbles; } },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    confirm: () => true, location: { pathname: '/docpro.html' },
    sessionStorage: { getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    VildaVault: { isUnlocked: () => true, onLock() {} },
    VildaPersistence: {
      getStorage: () => ({}), readMainSession: () => clone(session),
      writeMainSession(value) { session = clone(value); return true; },
      clearMainSession() { session = null; },
      readShared: () => clone(shared),
      updateShared(callback) { callback(shared); return shared; },
      writeShared(value) { shared = clone(value); return true; },
      readClcrSession: () => null, readModuleJSON: (_key, fallback) => fallback,
      getTabId: () => 'fictional-dob-load-tab',
    },
  });
  win.window = win; win.self = win; win.parent = win; win.top = win;
  for (const file of ['vilda_dob_age.js', 'vilda_data_import_export.js']) {
    const source = fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    new Function('window', 'globalThis', 'document', source)(win, win, document);
  }
  const api = win.VildaDataImportExport;
  api.restoreMainSessionIfAny();
  const options = { showRestoreButton() { fields.get('restoreStateBtn').style.display = 'inline-block'; },
    showLoadDataMessage() {}, hideLoadDataMessage() {}, debouncedUpdate() {}, updateSaveBtnVisibility() {} };
  return { win, fields, api, storage, session: () => clone(session),
    load(record, id = 'fictional-dob-load-a') {
      storage.set('vildaCurrentPatientId', id);
      expect(api.applyLoadedData(record, options)).toBe(true);
      document.dispatchEvent(new win.CustomEvent('vilda:patient-loaded', { detail: { patientId: id } }));
      vi.advanceTimersByTime(5000);
      storage.set('vildaLoadChoiceV1', 'restore');
      api.restoreLoadedState(options);
      vi.advanceTimersByTime(5000);
    },
  };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 29, 12)); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('a real patient load resets DOB at the identity boundary', () => {
  it('a record without DOB keeps its manual age after a different patient with DOB', () => {
    const h = harness();
    h.load(patient('Fikcyjny B', { dobISO: '2014-06-17' }), 'fictional-b');
    expect(h.win.VildaDobAge.readISO()).toBe('2014-06-17');
    expect(h.fields.get('dobInput').readOnly).toBe(true);
    h.load(patient('Fikcyjny C'), 'fictional-c');
    expect(h.win.VildaDobAge.readISO()).toBeNull();
    expect(h.fields.get('dobInput').readOnly).toBe(false);
    expect(h.fields.get('dobInput').dataset.dobSource).toBeUndefined();
    expect(h.fields.get('age').value).toBe('13');
    expect(h.fields.get('ageMonths').value).toBe('0');
    expect(h.api.collectUserData().user).not.toHaveProperty('dobISO');
    expect(h.api.collectUserData().user).not.toHaveProperty('measuredAtISO');
  });

  it('removing DOB from a newer record of the same patient cannot merge the old date back', () => {
    const h = harness();
    h.load(patient('Fikcyjny Ten Sam', { dobISO: '2014-06-17' }));
    h.load(patient('Fikcyjny Ten Sam'));
    expect(h.win.VildaDobAge.readISO()).toBeNull();
    expect(h.fields.get('age').value).toBe('13');
    expect(h.api.saveMainSessionNow({ force: true })).toBe(true);
    expect(h.session().user).not.toHaveProperty('dobISO');
    expect(h.session().user).toMatchObject({ age: 13, ageMonths: 0 });
  });

  it('a new explicit DOB replaces the previous locked record date', () => {
    const h = harness();
    h.load(patient('Fikcyjny B', { dobISO: '2014-06-17' }), 'fictional-b');
    h.load(patient('Fikcyjny C', { dobISO: '2013-06-17' }), 'fictional-c');
    expect(h.win.VildaDobAge.readISO()).toBe('2013-06-17');
    expect(h.fields.get('dobInput').readOnly).toBe(true);
    expect(h.api.collectUserData().user.dobISO).toBe('2013-06-17');
  });

  it('completed weeks from the previous infant do not accompany a different older patient', () => {
    const h = harness();
    h.load(patient('Fikcyjne Niemowlę', { age: 0, ageMonths: 1, ageWeeks: 6 }), 'fictional-infant');
    expect(h.win.VildaDobAge.readWeeks()).toBe(6);
    h.load(patient('Fikcyjny Nastolatek'), 'fictional-teen');
    expect(h.fields.get('ageWeeks').value).toBe('');
    expect(h.win.VildaDobAge.readWeeks()).toBeNull();
    expect(h.fields.get('age').value).toBe('13');
    expect(h.api.collectUserData().user).not.toHaveProperty('ageWeeks');
  });

  it('session restoration keeps a manually entered DOB editable and exact', () => {
    const h = harness();
    h.win.VildaDobAge.setFromSession('2013-06-17', { zRekordu: false });
    const clear = vi.spyOn(h.win.VildaDobAge, 'clearAll');
    expect(h.api.applyLoadedData(patient('Fikcyjny Ręczny', { dobISO: '2013-06-17' }),
      { isSessionRestore: true })).toBe(true);
    vi.advanceTimersByTime(5000);
    expect(clear).not.toHaveBeenCalled();
    expect(h.win.VildaDobAge.readISO()).toBe('2013-06-17');
    expect(h.fields.get('dobInput').readOnly).toBe(false);
    expect(h.fields.get('dobInput').dataset.dobSource).toBeUndefined();
  });
});
