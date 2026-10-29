import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Production importer and collector. A partial page has the patient's common
// inputs, but startup-created globals do not make absent history editors live.
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const OLD_ROW = { ageMonths: 120, ageYears: 10, height: 141, weight: 33 };
const NEW_ROW = { ageMonths: 132, ageYears: 11, height: 147, weight: 38 };
const record = () => ({ version: 1, name: 'Fikcyjny Zapis Ze Startu',
  user: { age: 13, ageMonths: 0, sex: 'M', height: 158, weight: 46 },
  advanced: { name: 'Fikcyjny Zapis Ze Startu', motherHeight: 165, fatherHeight: 180,
    data: { measurements: [clone(OLD_ROW)] },
    boneAgeContext: { version: 1, current: null, last: { years: 9, atAgeMonths: 120, source: 'fictional-history' } } },
  growthBasic: { name: 'Fikcyjny Zapis Ze Startu', data: { measurements: [clone(OLD_ROW)] } },
  intake: { pal: '1.6', history: [clone(OLD_ROW)], estKcalPerDay: 2362 },
  birth: { weeks: '38', weight: '3200', length: '51', head: '34', hasComputed: false },
  chartCreator: { fictionalExtension: { annotation: 'Fikcyjna adnotacja' } },
});

function harness({ live = [] } = {}) {
  let session = record();
  const fields = new Map();
  for (const [id, value] of Object.entries({ fullName: session.name, age: '13', ageMonths: '0', sex: 'M', height: '158', weight: '46' })) {
    fields.set(id, { id, value, tagName: 'INPUT', type: 'text', style: {}, dataset: {},
      addEventListener() {}, dispatchEvent() { return true; }, setAttribute() {}, removeAttribute() {} });
  }
  for (const id of live) fields.set(id, { id });
  const storage = new Map([['vildaCurrentPatientId', 'fictional-origin-c']]);
  const win = {
    document: { readyState: 'complete', hidden: false,
      getElementById: id => fields.get(id) || null,
      querySelector: () => null, querySelectorAll: () => [],
      addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } },
    location: { pathname: '/kalkulator-klirens.html' },
    setTimeout, clearTimeout, addEventListener() {}, removeEventListener() {},
    sessionStorage: { getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    Event: class { constructor(type) { this.type = type; } },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    VildaVault: { isUnlocked: () => true }, VildaAuthUI: { isBootReady: () => true },
    VildaPersistence: {
      getStorage: () => ({}), readMainSession: () => clone(session),
      writeMainSession(value) { session = clone(value); return true; },
      readModuleJSON: (_key, fallback) => fallback,
    },
  };
  win.window = win; win.self = win; win.parent = win; win.top = win;
  loadBrowserScript('vilda_data_import_export.js', win);
  const api = win.VildaDataImportExport;
  // Consume the real startup gate, without mounting unrelated clinical cards.
  expect(api.restoreMainSessionIfAny({ applyLoadedData: () => true })).toBe(true);
  vi.advanceTimersByTime(20);
  return { win, api, fields, session: () => clone(session),
    save() { expect(api.saveMainSessionNow({ force: true })).toBe(true); return clone(session); } };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-29T12:00:00Z')); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('partial pages preserve histories despite startup globals', () => {
  it.each([null, { measurements: [] }])('an advancedGrowthData placeholder %j cannot replace the Start history', placeholder => {
    const h = harness(); h.win.advancedGrowthData = clone(placeholder);
    const saved = h.save();
    expect(saved.advanced.data.measurements).toEqual([OLD_ROW]);
    expect(saved.advanced.motherHeight).toBe(165);
    expect(saved.advanced.fatherHeight).toBe(180);
  });

  it.each([null, { measurements: [] }])('a basicGrowthData placeholder %j cannot replace an absent basic editor', placeholder => {
    const h = harness(); h.win.basicGrowthData = clone(placeholder);
    expect(h.save().growthBasic.data.measurements).toEqual([OLD_ROW]);
  });

  it.each([null, []])('an intakeHistory placeholder %j cannot clear an absent intake editor', placeholder => {
    const h = harness(); h.win.intakeHistory = clone(placeholder); h.win.intakeEstimatedKcalPerDay = null;
    expect(h.save().intake).toEqual(record().intake);
  });

  it('the combined Klirens startup placeholders preserve all three histories in one session write', () => {
    const h = harness();
    h.win.advancedGrowthData = null;
    h.win.basicGrowthData = { measurements: [] };
    h.win.intakeHistory = [];
    h.win.intakeEstimatedKcalPerDay = null;
    const saved = h.save();
    expect(saved.advanced.data.measurements).toEqual([OLD_ROW]);
    expect(saved.growthBasic.data.measurements).toEqual([OLD_ROW]);
    expect(saved.intake).toEqual(record().intake);
  });

  it('a birth placeholder without the mounted birth form preserves the carried record', () => {
    const h = harness(); h.win.vildaBirthData = null;
    expect(h.save().birth).toEqual(record().birth);
  });

  it('an empty creator root without the creator controller preserves annotations', () => {
    const h = harness(); h.win.chartCreatorData = {};
    expect(h.save().chartCreator).toEqual(record().chartCreator);
  });

  it('a real bone-age module can publish an empty context without owning a missing input', () => {
    const h = harness(); loadBrowserScript('vilda_bone_age.js', h.win);
    expect(h.win.VildaBoneAge.capture()).toEqual({ version: 1, current: null, last: null });
    expect(h.save().advanced.boneAgeContext).toEqual(record().advanced.boneAgeContext);
  });
});

describe('a mounted history editor retains authority over its current model', () => {
  it.each([
    ['advancedGrowthData', 'advMeasurements', 'advanced'],
    ['basicGrowthData', 'basicGrowthMeasurements', 'growthBasic'],
  ])('%s can clear history through its real editor', (global, container, section) => {
    const h = harness({ live: [container] });
    h.win[global] = { measurements: [] };
    expect(h.save()[section].data.measurements).toEqual([]);
  });

  it.each([
    ['advancedGrowthData', 'advMeasurements', 'advanced'],
    ['basicGrowthData', 'basicGrowthMeasurements', 'growthBasic'],
  ])('%s keeps the edited archive rather than the older shared copy', (global, container, section) => {
    const h = harness({ live: [container] });
    h.win[global] = { measurements: [clone(NEW_ROW)] };
    expect(h.save()[section].data.measurements).toEqual([NEW_ROW]);
  });

  it('a mounted intake editor can explicitly clear its own history and calculated result', () => {
    const h = harness({ live: ['intakeMeasurements'] });
    h.win.intakeHistory = []; h.win.intakeEstimatedKcalPerDay = null;
    const saved = h.save();
    expect(saved.intake.history).toEqual([]);
    expect(saved.intake.estKcalPerDay).toBeNull();
  });

  it('a mounted intake editor preserves its current rows and computed output', () => {
    const h = harness({ live: ['intakeMeasurements'] });
    h.win.intakeHistory = [clone(NEW_ROW)]; h.win.intakeEstimatedKcalPerDay = 2400;
    const saved = h.save();
    expect(saved.intake.history).toEqual([NEW_ROW]);
    expect(saved.intake.estKcalPerDay).toBe(2400);
  });

  it('a mounted birth form can explicitly clear its carried record', () => {
    const h = harness(); h.win.vildaBirthData = null;
    h.win.vildaSgaBirthPersistApi = { captureState: () => ({ weeks: '', weight: '', length: '', head: '', hasComputed: false }) };
    expect(h.save().birth).toBeNull();
  });

  it('the active creator controller can explicitly clear its annotation root', () => {
    const h = harness(); h.win.chartCreatorData = {};
    h.win.VildaPublicationCreator = { __vildaPublicationCreator: true };
    expect(h.save().chartCreator).toEqual({});
  });
});
