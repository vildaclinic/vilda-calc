import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Actual DOB API and importer, with the same missing DOB/weeks inputs as the
// native Klirens form. Calendar calculations stay in the production DOB module.
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const infant = (extra = {}) => ({ version: 1, name: 'Fikcyjne Niemowlę',
  timestampISO: '2026-09-29T12:00:00.000Z',
  user: { age: 0, ageMonths: 1, ageWeeks: 4, dobISO: '2026-08-29',
    measuredAtISO: '2026-09-29', sex: 'M', height: 60, weight: 5, ...extra } });

function harness() {
  const fields = new Map(Object.entries({ fullName: 'Fikcyjne Niemowlę', age: '0',
    ageMonths: '1', height: '60', weight: '5', sex: 'M' }).map(([id, value]) => [id,
    { id, value, tagName: 'INPUT', type: 'text', style: {}, dataset: {},
      addEventListener() {}, dispatchEvent() { return true; }, removeAttribute() {}, setAttribute() {} }]));
  const storage = new Map([['vildaCurrentPatientId', 'fictional-native-infant']]);
  let session = null, shared = {};
  const writes = [];
  const document = { readyState: 'complete', getElementById: id => fields.get(id) || null,
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } };
  const win = { document, setTimeout, clearTimeout, addEventListener() {}, removeEventListener() {},
    location: { pathname: '/kalkulator-klirens.html' }, confirm: () => true,
    Event: class { constructor(type, options) { this.type = type; this.bubbles = !!options?.bubbles; } },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    sessionStorage: { getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    VildaVault: { isUnlocked: () => true }, VildaAuthUI: { isBootReady: () => true },
    VildaPersistence: {
      getStorage: () => ({}), readMainSession: () => clone(session),
      writeMainSession(value) { session = clone(value); writes.push(clone(value)); return true; },
      clearMainSession() { session = null; },
      readShared: () => clone(shared), writeShared(value) { shared = clone(value); return true; },
      updateShared(callback) { callback(shared); return shared; },
      readModuleJSON: (_key, fallback) => fallback, readClcrSession: () => null,
    },
  };
  win.window = win; win.self = win; win.parent = win; win.top = win;
  loadBrowserScript('vilda_dob_age.js', win);
  loadBrowserScript('vilda_data_import_export.js', win);
  const api = win.VildaDataImportExport, dob = win.VildaDobAge;
  api.restoreMainSessionIfAny(); vi.advanceTimersByTime(20);
  return { win, fields, storage, writes, api, dob, session: () => clone(session),
    load(payload, options) {
      expect(api.applyLoadedData(payload, options)).toBe(true);
      vi.advanceTimersByTime(2000);
    },
    save() { expect(api.saveMainSessionNow({ force: true })).toBe(true); return clone(session); },
  };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 29, 12)); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('native headless visits carry the complete DOB age consistently', () => {
  it('the current two-month visit uses eight weeks in the collector and its very first session write', () => {
    const h = harness(), input = infant(), original = clone(input);
    const current = h.dob.ageFromDobISO(input.user.dobISO);
    expect(current).toMatchObject({ years: 0, ageMonths: 2, weeks: 8 });
    expect(h.dob.weeksApplicable(current.totalMonths)).toBe(true);
    h.load(input);
    expect(h.api.collectUserData().user).toMatchObject({ age: current.years, ageMonths: current.ageMonths, ageWeeks: current.weeks });
    expect(h.writes[0].user).toMatchObject({ age: current.years, ageMonths: current.ageMonths, ageWeeks: current.weeks });
    expect(h.save().user.ageWeeks).toBe(current.weeks);
    expect(input).toEqual(original);
    expect(h.win.lastLoadedData.user.ageWeeks).toBe(4);
  });

  it('a current visit outside the public weeks window omits the old stored weeks', () => {
    const h = harness(), input = infant({ dobISO: '2026-06-01' }), original = clone(input);
    const current = h.dob.ageFromDobISO(input.user.dobISO);
    expect(h.dob.weeksApplicable(current.totalMonths)).toBe(false);
    h.load(input);
    expect(h.api.collectUserData().user).not.toHaveProperty('ageWeeks');
    expect(h.writes[0].user).not.toHaveProperty('ageWeeks');
    expect(h.save().user).not.toHaveProperty('ageWeeks');
    expect(input).toEqual(original);
  });

  it('explicit restore keeps the old measurement weeks through the real public restore API', () => {
    const h = harness(), input = infant(), original = clone(input);
    h.load(input);
    h.api.restoreLoadedState(); vi.advanceTimersByTime(2000);
    expect(h.dob.showsSavedMeasurement()).toBe(true);
    const old = h.dob.ageAtMeasurement(input, input.user.dobISO);
    expect(old.weeks).toBe(4);
    expect(h.api.collectUserData().user).toMatchObject({ age: old.years, ageMonths: old.ageMonths, ageWeeks: old.weeks });
    expect(h.save().user.ageWeeks).toBe(4);
    expect(input).toEqual(original);
  });

  it.each(['restore', 'saved'])('session restoration in the real %s mode keeps historical weeks', mode => {
    const h = harness(), input = infant(), original = clone(input);
    h.win.lastLoadedData = clone(input);
    if (mode === 'restore') h.storage.set('vildaLoadChoiceV1', 'restore');
    else h.storage.set('vildaDobAgeZapisV1', '1');
    h.load(input, { isSessionRestore: true });
    expect(h.dob.showsSavedMeasurement()).toBe(true);
    expect(h.api.collectUserData().user).toMatchObject({ age: 0, ageMonths: 1, ageWeeks: 4 });
    expect(h.save().user.ageWeeks).toBe(4);
    expect(input).toEqual(original);
  });

  it('manual weeks without DOB keep their calendar-independent age package', () => {
    const h = harness(), input = infant({ ageWeeks: 6 });
    delete input.user.dobISO; delete input.user.measuredAtISO;
    const original = clone(input), ageMonths = h.dob.monthsFromWeeks(input.user.ageWeeks);
    expect(ageMonths).toBe(1);
    h.load(input);
    expect(h.api.collectUserData().user).toMatchObject({ age: 0, ageMonths, ageWeeks: 6 });
    expect(h.writes[0].user).toMatchObject({ age: 0, ageMonths, ageWeeks: 6 });
    expect(h.save().user).toMatchObject({ age: 0, ageMonths, ageWeeks: 6 });
    expect(input).toEqual(original);
  });

  it('loading a different patient without DOB or weeks does not inherit the infant weeks', () => {
    const h = harness(); h.load(infant());
    const next = { version: 1, name: 'Fikcyjny Nastolatek Bez Daty',
      user: { age: 13, ageMonths: 0, sex: 'M', height: 158, weight: 46 } };
    const original = clone(next);
    h.storage.set('vildaCurrentPatientId', 'fictional-native-teen');
    h.load(next);
    expect(h.api.collectUserData().user).not.toHaveProperty('ageWeeks');
    expect(h.save().user).not.toHaveProperty('ageWeeks');
    expect(next).toEqual(original);
  });
});
