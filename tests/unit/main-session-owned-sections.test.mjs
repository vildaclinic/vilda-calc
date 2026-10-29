import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { oknoZSilnikiem, wczytajDoOkna } from '../support/silnik-bmi.mjs';

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const record = (name = 'Fikcyjny Pacjent C', pal = '1.8') => ({ version: 1, name,
  user: { age: 13, ageMonths: 0, sex: 'M', height: 158, weight: 75, dobISO: '2013-06-17',
    measuredAtISO: '2026-06-17', waist: 81, tannerStage: '3' },
  intake: { pal, history: [{ ageMonths: 150, height: 156, weight: 73 }], estKcalPerDay: 2100 },
  plan: { palFactor: Number(pal), palWybrany: true, dietLevel: 'reduction', dietaWybrana: true, customGoalKg: 65 },
  bp: { heartRate: 82, temperature: 37.2, population: 'hospital', systolic: 118, diastolic: 74 },
  adultVitals: { guideline: 'AHA', heartRate: 83, systolic: 119, diastolic: 75, athlete: true, betaBlocker: false },
  respiratory: { rate: 18, temperature: 37.1, state: 'sleep', population: 'hospital' },
  advanced: { motherHeight: 164, data: { measurements: [{ ageMonths: 150, height: 156 }] } },
  extension: { note: `source-${name}` } });

// A partial page has these actual collector controls. Nulls and false values
// represent deliberate edits/new-visit blanks, not a missing other-page form.
const partial = source => ({ version: 1, name: source.name,
  user: { age: 13, ageMonths: 0, sex: 'M', height: null, weight: null, dobISO: source.user?.dobISO },
  intake: { pal: null, history: null, estKcalPerDay: null },
  plan: { palFactor: null, palWybrany: false, dietLevel: null, dietaWybrana: false, customGoalKg: null },
  bp: { heartRate: null, temperature: null, population: null, systolic: null, diastolic: null },
  adultVitals: { guideline: null, heartRate: null, systolic: null, diastolic: null, athlete: null, betaBlocker: null },
  respiratory: { rate: null, temperature: null, state: null, population: null },
  advanced: { motherHeight: null, data: null } });

function harness(previous = record('Fikcyjny Pacjent B', '1.4')) {
  let main = clone(previous), current = partial(record()), allowWrite = true;
  const writes = [], fields = new Map(), listeners = [], modules = new Map(), storage = new Map([['vildaCurrentPatientId', 'fictional-current-c']]);
  for (const id of ['name', 'age', 'ageMonths', 'sex', 'height', 'weight', 'dobInput',
    'customGoalKg', 'bpSystolic', 'bpDiastolic', 'advMotherHeight']) {
    fields.set(id, { id, value: '', style: {}, dataset: {}, checked: false,
      addEventListener() {}, dispatchEvent() {}, setAttribute() {}, removeAttribute() {},
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false } });
  }
  const persistence = {
    getStorage: () => ({}), readMainSession: () => clone(main),
    writeMainSession(value) { writes.push(clone(value)); if (allowWrite) main = clone(value); return allowWrite; },
    clearMainSession() { main = null; }, readClcrSession: () => null,
    readModuleJSON: (key, fallback) => modules.has(key) ? clone(modules.get(key)) : fallback,
    writeModuleJSON(key, value) { modules.set(key, clone(value)); return true; },
  };
  const win = { document: { readyState: 'loading', getElementById: id => fields.get(id) || null,
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener(type, callback, options) { listeners.push({ type, callback, capture: options === true || !!options?.capture }); },
    dispatchEvent(event) {
      for (const listener of listeners.filter(item => item.type === event.type).sort((a, b) => Number(b.capture) - Number(a.capture))) {
        listener.callback(event);
      }
    } },
  VildaPersistence: persistence, location: { pathname: '/docpro.html' },
  sessionStorage: { getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
  setTimeout: () => 0, clearTimeout() {}, addEventListener() {}, dispatchEvent() {},
  Event: class { constructor(type) { this.type = type; } },
  CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } } };
  loadBrowserScript('vilda_data_import_export.js', win);
  main = null;
  win.VildaDataImportExport.restoreMainSessionIfAny();
  main = clone(previous);
  const api = win.VildaDataImportExport;
  const options = { collectUserData: () => clone(current), syncSharedUserDataFromLoadedData() {} };
  api.initMainSessionPersistence(options);
  return { api, win, fields, writes, modules, main: () => clone(main),
    current(value) { current = clone(value); }, previous(value) { main = clone(value); },
    allow(value) { allowWrite = value; },
    load(value, overrides = {}) { return api.applyLoadedData(value, { ...options, ...overrides }); },
    newChoice(overrides = {}) {
      storage.set('vildaLoadChoiceV1', 'new');
      win.document.dispatchEvent(new win.CustomEvent('vilda:load-choice-applied', { detail: {
        choice: 'new', patientId: storage.get('vildaCurrentPatientId'), applySequence: api.getApplyLoadedDataSequence(), ...overrides,
      } }));
    },
    restore(value) { return api.restoreLoadedState({ ...options, data: value, anyDataEntered: () => false }); },
    save() { return api.saveMainSessionNow({ ...options, force: true }); } };
}

describe('main-session persistence respects partial-page ownership and the actual incoming record', () => {
  it('carries C unrendered choices/numbers after B, while preserving owned new-visit blanks', () => {
    const source = record(), h = harness();
    expect(h.load(source)).toBe(true);
    const saved = h.main();
    expect(saved.intake.pal).toBe('1.8');
    expect(saved.plan).toEqual({ ...source.plan, customGoalKg: null });
    expect(saved.bp).toEqual({ ...source.bp, systolic: null, diastolic: null });
    expect(saved.adultVitals).toEqual(source.adultVitals);
    expect(saved.respiratory).toEqual(source.respiratory);
    expect(saved.user).toMatchObject({ height: null, weight: null });
    expect(saved.user).not.toHaveProperty('measuredAtISO');
    expect(saved.advanced.motherHeight).toBeNull();
    expect(saved.extension).toEqual(source.extension);
    expect(source).toEqual(record());
  });

  it('uses the new snapshot for the same identity instead of the previous session', () => {
    const source = record(), h = harness(record(source.name, '1.4'));
    h.load(source);
    expect(h.main().intake.pal).toBe('1.8');
    expect(h.main().plan.palFactor).toBe(1.8);
  });

  it('carries explicit null and false from C without reviving populated values from B', () => {
    const source = record();
    source.intake.pal = null; source.plan.palFactor = null; source.plan.palWybrany = false;
    source.adultVitals.athlete = false; source.respiratory.rate = null;
    const h = harness(); h.load(source);
    expect(h.main().intake.pal).toBeNull();
    expect(h.main().plan).toMatchObject({ palFactor: null, palWybrany: false });
    expect(h.main().adultVitals.athlete).toBe(false);
    expect(h.main().respiratory.rate).toBeNull();
  });

  it('retains a cloned incoming source across a failed first write and consumes it on success', () => {
    const source = record(), h = harness(); h.allow(false); h.load(source);
    expect(h.writes.length).toBeGreaterThan(0);
    source.intake.pal = '2.4'; source.plan.palFactor = 2.4;
    h.allow(true); expect(h.save()).toBe(true);
    expect(h.main().intake.pal).toBe('1.8');
    const updated = h.main(); updated.intake.pal = '2.0'; updated.plan.palFactor = 2;
    h.previous(updated); expect(h.save()).toBe(true);
    expect(h.main().intake.pal).toBe('2.0');
    expect(h.main().plan.palFactor).toBe(2);
  });

  it('replaces a failed pending C source when a new explicit D record arrives', () => {
    const h = harness(); h.allow(false); h.load(record());
    const next = record('Fikcyjny Pacjent D', '2.0'); h.current(partial(next));
    h.load(next); h.allow(true); h.save();
    expect(h.main().name).toBe(next.name);
    expect(h.main().intake.pal).toBe('2.0');
    expect(h.main().extension).toEqual(next.extension);
  });

  it('invalidates a pending source on clear before an anonymous draft is entered', () => {
    const h = harness(); h.allow(false); h.load(record());
    h.api.clearMainSessionStorage(); h.allow(true);
    h.current({ version: 1, user: { age: 14, weight: 45 }, intake: { pal: null } });
    expect(h.save()).toBe(true);
    expect(h.main().intake.pal).toBeNull();
    expect(h.main()).not.toHaveProperty('extension');
  });

  it('keeps current runtime archives and intentional empty arrays authoritative', () => {
    const source = record(), h = harness(); h.load(source);
    const edited = partial(source);
    edited.advanced.data = { measurements: [{ ageMonths: 156, weight: 75, height: 158 }] };
    edited.intake.history = []; edited.intake.estKcalPerDay = null;
    edited.ghTherapyPoints = []; edited.obesityTherapyPoints = []; edited.birth = null;
    h.win.advancedGrowthData = {}; h.win.intakeHistory = [];
    h.win.intakeEstimatedKcalPerDay = null; h.win.ghTherapyPoints = [];
    h.win.obesityTherapyPoints = []; h.win.vildaBirthData = null;
    h.fields.set('advMeasurements', { id: 'advMeasurements' });
    h.fields.set('intakeMeasurements', { id: 'intakeMeasurements' });
    h.win.vildaSgaBirthPersistApi = { captureState: () => null };
    h.modules.set('GH_THERAPY_POINTS', []); h.modules.set('OBESITY_THERAPY_POINTS', []);
    const old = h.main(); old.ghTherapyPoints = [{ ageMonths: 120 }];
    old.obesityTherapyPoints = [{ ageMonths: 121 }]; old.birth = { weightGrams: 3000 };
    h.previous(old); h.current(edited); h.save();
    expect(h.main().advanced.data).toEqual(edited.advanced.data);
    expect(h.main().intake.history).toEqual([]);
    expect(h.main().intake.estKcalPerDay).toBeNull();
    expect(h.main().ghTherapyPoints).toEqual([]);
    expect(h.main().obesityTherapyPoints).toEqual([]);
    expect(h.main().birth).toBeNull();
  });

  it.each(['missing-key', 'no-module-reader'])('empty therapy globals retain the previous-session fallback with %s', reason => {
    const source = record(), h = harness(); h.load(source);
    h.modules.clear();
    const previous = h.main(), current = partial(source);
    for (const key of ['ghTherapyPoints', 'obesityTherapyPoints', 'bisphosTherapyPoints']) {
      previous[key] = [{ id: `fictional-${key}`, ageMonths: 120 }]; current[key] = []; h.win[key] = [];
    }
    if (reason === 'no-module-reader') delete h.win.VildaPersistence.readModuleJSON;
    h.previous(previous); h.current(current); h.save();
    for (const key of ['ghTherapyPoints', 'obesityTherapyPoints', 'bisphosTherapyPoints']) {
      expect(h.main()[key]).toEqual(previous[key]);
    }
  });

  it.each([
    ['obesity', 'obesity_therapy_monitor.js', 'obesityTherapyPoints', 'OBESITY_THERAPY_POINTS', 'obesityTherapyMonitorSetPoints'],
    ['bisphos', 'bisphos_therapy_monitor.js', 'bisphosTherapyPoints', 'BISPHOS_THERAPY_POINTS', 'bisphosTherapyMonitorSetPoints'],
  ])('%s monitor explicit clear remains empty in the main session', (_name, file, field, key, setter) => {
    const source = record(), h = harness(); h.load(source);
    const previous = h.main(), current = partial(source);
    previous[field] = [{ id: `fictional-${field}`, ageMonths: 120 }]; current[field] = [];
    h.modules.set(key, clone(previous[field]));
    h.previous(previous); h.current(current);
    const script = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    new Function('window', 'globalThis', 'document', script)(h.win, h.win, h.win.document);
    h.win[setter]([]);
    expect(h.modules.get(key)).toEqual([]);
    expect(h.save()).toBe(true);
    expect(h.main()[field]).toEqual([]);
  });

  it('a nonempty current therapy list remains current when no module key exists', () => {
    const source = record(), h = harness(); h.load(source);
    h.modules.clear();
    const previous = h.main(), current = partial(source);
    previous.obesityTherapyPoints = [{ id: 'fictional-old', weight: 70 }];
    current.obesityTherapyPoints = [{ id: 'fictional-current', weight: 71 }];
    h.win.obesityTherapyPoints = current.obesityTherapyPoints;
    h.previous(previous); h.current(current); h.save();
    expect(h.main().obesityTherapyPoints).toEqual(current.obesityTherapyPoints);
  });

  it('a fresh C load replaces B module empties before the first main-session write', () => {
    const source = record(), h = harness();
    source.obesityTherapyPoints = [{ id: 'fictional-c-obesity', ageMonths: 150, weight: 75 }];
    source.bisphosTherapyPoints = [{ id: 'fictional-c-bisphos', ageMonths: 151, weight: 75 }];
    h.modules.set('OBESITY_THERAPY_POINTS', []); h.modules.set('BISPHOS_THERAPY_POINTS', []);
    const current = partial(source); current.obesityTherapyPoints = []; current.bisphosTherapyPoints = [];
    h.current(current); h.load(source);
    expect(h.modules.get('OBESITY_THERAPY_POINTS')).toEqual(source.obesityTherapyPoints);
    expect(h.modules.get('BISPHOS_THERAPY_POINTS')).toEqual(source.bisphosTherapyPoints);
    expect(h.writes[0].obesityTherapyPoints).toEqual(source.obesityTherapyPoints);
    expect(h.writes[0].bisphosTherapyPoints).toEqual(source.bisphosTherapyPoints);
  });

  it('preserves an explicit clear and false for fields owned by this page', () => {
    const source = record(), h = harness();
    h.fields.set('palFactor', { value: '', dataset: {}, style: {} });
    h.fields.set('adultHrAthlete', { checked: false, dataset: {}, style: {} });
    const current = partial(source); current.adultVitals.athlete = false; h.current(current);
    h.load(source);
    expect(h.main().plan.palFactor).toBeNull();
    expect(h.main().plan.palWybrany).toBe(false);
    expect(h.main().adultVitals.athlete).toBe(false);
  });

  it('never borrows B or invents defaults for a sparse incoming record', () => {
    const source = { version: 1, name: 'Fikcyjny Pacjent C', user: { age: 13, sex: 'M' } };
    const h = harness(); h.current(partial(source)); h.load(source);
    expect(h.main().intake.pal).toBeNull();
    expect(h.main().adultVitals.guideline).toBeNull();
    expect(h.main().respiratory.population).toBeNull();
    expect(h.main()).not.toHaveProperty('extension');
  });

  it.each(['identity', 'dob'])('rejects a pending source after an incompatible %s change', change => {
    const source = record(), h = harness(); h.allow(false); h.load(source);
    const next = partial(source);
    if (change === 'identity') next.name = 'Fikcyjny Inny Pacjent';
    else next.user.dobISO = '2012-06-17';
    h.current(next); h.allow(true); h.save();
    expect(h.main().intake.pal).toBeNull();
    expect(h.main()).not.toHaveProperty('extension');
  });

  it('retains ordinary anonymous draft continuity across pages without an explicit patient load', () => {
    const previous = { version: 1, user: { age: 13, weight: 45 }, intake: { pal: '1.8' } };
    const h = harness(previous);
    h.current({ version: 1, user: { age: 13, weight: 45 }, intake: { pal: null } });
    expect(h.save()).toBe(true);
    expect(h.main().intake.pal).toBe('1.8');
  });

  it.each([null, ''])('session restoration replaces warm measurement controls with explicit blanks (%j)', blank => {
    const h = harness(), source = { version: 1, name: 'Fikcyjny Pacjent C',
      user: { age: 13, ageMonths: 0, weight: blank, height: blank, waist: blank, hip: blank } };
    for (const [id, value] of Object.entries({ age: '12', ageMonths: '4', weight: '75', height: '158', waistCm: '81', hipCm: '90' })) {
      if (!h.fields.has(id)) h.fields.set(id, { id, dataset: {}, style: {} });
      h.fields.get(id).value = value;
    }
    h.load(source, { isSessionRestore: true });
    for (const id of ['weight', 'height', 'waistCm', 'hipCm']) expect(h.fields.get(id).value).toBe('');
    expect(h.fields.get('age').value).toBe('13');
    expect(h.fields.get('ageMonths').value).toBe('0');
  });

  it('session restoration leaves absent legacy measurement fields alone', () => {
    const h = harness(); h.fields.get('weight').value = '75'; h.fields.get('height').value = '158';
    h.load({ version: 1, name: 'Fikcyjny Pacjent C', user: { age: 13 } }, { isSessionRestore: true });
    expect(h.fields.get('weight').value).toBe('75');
    expect(h.fields.get('height').value).toBe('158');
  });

  it('the separate Restore saved state flow carries the selected record rather than B', () => {
    const h = harness(), source = record(); h.win.lastLoadedData = record('Fikcyjny Pacjent B');
    h.restore(source);
    expect(h.main().intake.pal).toBe('1.8');
    expect(h.main().extension).toEqual(source.extension);
    expect(h.main().user.weight).toBeNull();
  });

  it('retains arbitrary own JSON extension keys as data without traversing object prototypes', () => {
    const source = record();
    const extension = JSON.parse('{"__proto__":{"fictionalCarrierMarker":"data"},"constructor":{"prototype":{"fictionalConstructorMarker":"data"}},"prototype":{"note":"ordinary extension"}}');
    source.extension = extension;
    Object.defineProperty(source, '__proto__', { value: { fictionalRootMarker: 'data' }, enumerable: true });
    const h = harness(), current = partial(source); current.extension = {}; h.current(current); h.load(source);
    expect(Object.prototype).not.toHaveProperty('fictionalCarrierMarker');
    expect(Object.prototype).not.toHaveProperty('fictionalRootMarker');
    expect(Object.prototype).not.toHaveProperty('fictionalConstructorMarker');
    expect(Object.getPrototypeOf(h.main())).toBe(Object.prototype);
    expect(Object.hasOwn(h.main(), '__proto__')).toBe(true);
    expect(h.main().__proto__).toEqual({ fictionalRootMarker: 'data' });
    expect(h.main().extension).toEqual(extension);
    expect(JSON.parse(JSON.stringify(h.main())).extension).toEqual(extension);
  });

  it('materializes missing legacy PAL using the existing public APIs and exact incoming anthropometry', () => {
    const source = record(); delete source.intake.pal; source.plan.palFactor = null;
    source.user.ageMonths = 4;
    const h = harness(), calls = [];
    h.win.energyDefaultPlanPal = function (...args) {
      expect(this).toBe(h.win); calls.push(['plan', ...args]); return 1.6;
    };
    h.win.energyNormalizePal = function (...args) {
      expect(this).toBe(h.win); calls.push(['intake', ...args]); return { pal: 1.6 };
    };
    h.load(source);
    expect(calls).toEqual([
      ['plan', 13 + 4 / 12, 4, { sex: 'M', weightKg: 75, heightCm: 158 }],
      ['intake', 13 + 4 / 12, 4, 1.6, 'clinical'],
    ]);
    expect(h.main().plan).toMatchObject({ palFactor: 1.6, palWybrany: true });
    expect(h.main().intake.pal).toBe('1.6');
    const previous = h.main(); previous.intake.pal = null; previous.plan.palFactor = null;
    h.previous(previous); h.save();
    expect(calls).toHaveLength(2);
    expect(h.main().intake.pal).toBeNull();
    expect(h.main().plan.palFactor).toBeNull();
  });

  it('missing intake follows a preserved manually selected plan PAL', () => {
    const source = record(); delete source.intake.pal;
    const h = harness(), candidates = [];
    h.win.energyDefaultPlanPal = () => { throw new Error('An existing plan must remain authoritative'); };
    h.win.energyNormalizePal = (_age, _months, candidate) => { candidates.push(candidate); return { pal: candidate }; };
    h.load(source);
    expect(candidates).toEqual([1.8]);
    expect(h.main().intake.pal).toBe('1.8');
    expect(h.main().plan.palWybrany).toBe(true);
  });

  it('never replaces an existing intake choice when the plan needs a legacy default', () => {
    const source = record(); source.intake.pal = '2.0'; source.plan.palFactor = null;
    const h = harness(); h.win.energyDefaultPlanPal = () => 1.6;
    h.win.energyNormalizePal = () => { throw new Error('An existing intake choice must remain authoritative'); };
    h.load(source);
    expect(h.main().intake.pal).toBe('2.0');
    expect(h.main().plan.palFactor).toBe(1.6);
  });

  it('keeps missing values when a public model is unavailable or rejects the context', () => {
    const source = record(); source.intake.pal = null; source.plan.palFactor = null;
    const h = harness(); h.win.energyDefaultPlanPal = () => { throw new Error('Fictional model failure'); };
    h.win.energyNormalizePal = () => { throw new Error('No candidate'); };
    h.load(source);
    expect(h.main().intake.pal).toBeNull();
    expect(h.main().plan.palFactor).toBeNull();
  });

  it.each([[46, 1.6], [75, 1.4]])('uses the actual BMI and PAL models for legacy C (%s kg → %s)', (weight, expected) => {
    const source = record(); source.user.weight = weight; delete source.intake; delete source.plan;
    const h = harness(), model = oknoZSilnikiem({ document: h.win.document });
    wczytajDoOkna(model, 'vilda_diet_plan_ui.js');
    h.win.energyDefaultPlanPal = model.energyDefaultPlanPal;
    h.win.energyNormalizePal = model.energyNormalizePal;
    h.load(source);
    expect(h.main().plan.palFactor).toBe(expected);
    expect(h.main().intake.pal).toBe(expected.toFixed(1));
  });

  it('a new measurement uses current anthropometry for PAL synthesized from a legacy record', () => {
    const source = record(); delete source.intake; delete source.plan;
    const h = harness(), model = oknoZSilnikiem({ document: h.win.document });
    wczytajDoOkna(model, 'vilda_diet_plan_ui.js');
    h.win.energyDefaultPlanPal = model.energyDefaultPlanPal;
    h.win.energyNormalizePal = model.energyNormalizePal;
    const current = partial(source); current.user = clone(source.user); h.current(current);
    h.load(source);
    expect(h.main().plan.palFactor).toBe(1.4);
    h.current(partial(source));
    const expected = model.energyDefaultPlanPal(13, 0, { sex: 'M', weightKg: null, heightCm: null });
    expect(expected).toBe(1.6);
    let baseline;
    h.win.document.addEventListener('vilda:load-choice-applied', () => { baseline = h.main().plan.palFactor; });
    h.newChoice();
    expect(h.main().plan.palFactor).toBe(expected);
    expect(baseline).toBe(expected);
    expect(h.main().intake.pal).toBe('1.4');
    expect(h.main().user.weight).toBeNull();
    expect(h.main().user.height).toBeNull();
  });

  it.each(['patient', 'sequence', 'clear', 'next-load', 'unavailable', 'manual', 'changed'])('a synthesized legacy plan respects the %s guard at new-measurement choice', reason => {
    const source = record(); delete source.plan; delete source.intake;
    const h = harness();
    h.win.energyDefaultPlanPal = (_age, _months, user) => user.weightKg == null ? 1.6 : 1.4;
    h.win.energyNormalizePal = (_age, _months, candidate) => ({ pal: candidate });
    h.load(source); h.current(partial(source));
    const detail = {};
    if (reason === 'patient') detail.patientId = 'fictional-stale-patient';
    if (reason === 'sequence') detail.applySequence = h.api.getApplyLoadedDataSequence() - 1;
    if (reason === 'clear') h.api.clearMainSessionStorage();
    if (reason === 'next-load') {
      const next = record(); next.plan.palFactor = 1.8;
      h.load(next); detail.applySequence = h.api.getApplyLoadedDataSequence() - 1;
    }
    if (reason === 'unavailable') delete h.win.energyDefaultPlanPal;
    if (reason === 'manual' || reason === 'changed') {
      const previous = h.main();
      if (reason === 'manual') previous.plan.palWybrany = true;
      else previous.plan.palFactor = 1.8;
      h.previous(previous);
    }
    const before = h.main(); h.newChoice(detail);
    expect(h.main()?.plan?.palFactor ?? null).toBe(before?.plan?.palFactor ?? null);
  });

  it('a real incoming manual plan and intake remain unchanged at a new-measurement choice', () => {
    const source = record(), h = harness();
    h.win.energyDefaultPlanPal = () => 1.6;
    h.load(source); h.current(partial(source)); h.newChoice(); h.save();
    expect(h.main().plan).toMatchObject({ palFactor: 1.8, palWybrany: true });
    expect(h.main().intake.pal).toBe('1.8');
  });

  it.each([false, true])('a native default visit resolves DOB age before saving and preserves real PAL choices (%s)', manualPal => {
    const source = record(), h = harness();
    if (!manualPal) { delete source.plan; delete source.intake; }
    for (const id of ['dobInput', 'customGoalKg', 'bpSystolic', 'bpDiastolic', 'advMotherHeight']) h.fields.delete(id);
    loadBrowserScript('vilda_dob_age.js', h.win);
    const model = oknoZSilnikiem({ document: h.win.document });
    wczytajDoOkna(model, 'vilda_diet_plan_ui.js');
    h.win.energyDefaultPlanPal = model.energyDefaultPlanPal;
    h.win.energyNormalizePal = model.energyNormalizePal;
    const expectedAge = h.win.VildaDobAge.ageFromDobISO(source.user.dobISO);
    h.load(source, { collectUserData: () => h.api.collectUserData() });
    expect(h.main().user).toMatchObject({ age: expectedAge.years, ageMonths: expectedAge.ageMonths, height: null, weight: null });
    expect(h.writes[0].user).toMatchObject({ age: expectedAge.years, ageMonths: expectedAge.ageMonths });
    expect(h.main().plan.palFactor).toBe(manualPal ? 1.8 : model.energyDefaultPlanPal(expectedAge.years + expectedAge.ageMonths / 12,
      expectedAge.ageMonths, { sex: source.user.sex, weightKg: null, heightCm: null }));
    expect(h.main().intake.pal).toBe(manualPal ? '1.8' : '1.6');
  });

  it('the native default age path does not replace a session measurement with today', () => {
    const source = record(), h = harness(); source.user.age = 7; source.user.ageMonths = 3;
    h.fields.delete('dobInput'); loadBrowserScript('vilda_dob_age.js', h.win);
    let calls = 0;
    h.win.VildaDobAge.ageFromDobISO = () => { calls += 1; throw new Error('Session age must remain authoritative'); };
    h.load(source, { isSessionRestore: true });
    expect(h.fields.get('age').value).toBe('7');
    expect(h.fields.get('ageMonths').value).toBe('3');
    expect(calls).toBe(0);
  });

  it('the native default visit does not invent age when the public DOB API is unavailable', () => {
    const source = record(), h = harness(); h.fields.delete('dobInput');
    h.load(source, { collectUserData: () => h.api.collectUserData() });
    expect(h.main().user.age).toBeNull();
    expect(h.main().plan.palFactor).toBe(1.8);
    expect(h.main().intake.pal).toBe('1.8');
  });

  it('a missing legacy professional basic view is materialized from normalized advanced observations before the first write', () => {
    const source = record(), original = clone(source), h = harness(); source.zscore = { resultsMode: true };
    original.zscore = clone(source.zscore);
    h.fields.delete('dobInput'); loadBrowserScript('vilda_dob_age.js', h.win);
    h.load(source, { collectUserData: () => h.api.collectUserData() });
    const advanced = h.api.sanitizeAdvancedMeasurementEntries(clone(source.advanced.data.measurements));
    const basic = advanced.map(({ ageMonths, ageYears, height, weight }) => ({ ageMonths, ageYears, height, weight }));
    expect(h.writes[0].advanced.data.measurements).toEqual(advanced);
    expect(h.writes[0].growthBasic.data.measurements).toEqual(basic);
    expect(source).toEqual(original);
    expect(source).not.toHaveProperty('growthBasic');
  });

  it.each([null, { measurements: [] }, { measurements: [{ ageMonths: 132, ageYears: 11, height: 147, weight: 38, ghId: 'fictional-independent-gh' }] }])('an explicit basic model %j is not replaced by the advanced mirror', data => {
    const source = record(), h = harness(); source.zscore = { resultsMode: true }; source.growthBasic = { data };
    h.fields.delete('dobInput'); loadBrowserScript('vilda_dob_age.js', h.win);
    h.load(source, { collectUserData: () => h.api.collectUserData() });
    expect(h.writes[0].growthBasic.data).toEqual(data);
  });

  it('materializing the missing basic data preserves its own JSON wrapper extensions', () => {
    const source = record(), h = harness(); source.zscore = { resultsMode: true };
    source.growthBasic = JSON.parse('{"__proto__":{"fictionalBasicWrapper":"data"},"futureExtension":{"source":"fictional"}}');
    const wrapper = clone(source.growthBasic);
    h.fields.delete('dobInput'); loadBrowserScript('vilda_dob_age.js', h.win);
    h.load(source, { collectUserData: () => h.api.collectUserData() });
    expect(Object.hasOwn(h.main().growthBasic, '__proto__')).toBe(true);
    expect(h.main().growthBasic.__proto__).toEqual(wrapper.__proto__);
    expect(h.main().growthBasic.futureExtension).toEqual(wrapper.futureExtension);
    expect(h.main().growthBasic.data.measurements).toHaveLength(1);
    expect(Object.prototype).not.toHaveProperty('fictionalBasicWrapper');
    expect(source.growthBasic).toEqual(wrapper);
    expect(source.growthBasic).not.toHaveProperty('data');
  });

  it('an explicit basic array shape is not converted into a mirrored object', () => {
    const source = record(), h = harness(); source.zscore = { resultsMode: true }; source.growthBasic = [];
    const current = partial(source); current.growthBasic = []; h.current(current);
    h.fields.delete('dobInput'); loadBrowserScript('vilda_dob_age.js', h.win);
    h.load(source);
    expect(h.main().growthBasic).toEqual([]);
    expect(source.growthBasic).toEqual([]);
  });

  it.each(['standard', 'adult', 'manual-age-default'])('the missing basic view respects the existing %s UI support condition', reason => {
    const source = record(), h = harness(); source.zscore = { resultsMode: reason !== 'standard' };
    if (reason === 'adult') { source.user.age = 56; source.user.dobISO = '1970-06-17'; }
    if (reason === 'manual-age-default') delete source.user.dobISO;
    h.fields.delete('dobInput'); loadBrowserScript('vilda_dob_age.js', h.win);
    h.load(source, { collectUserData: () => h.api.collectUserData() });
    expect(h.writes[0].growthBasic.data.measurements).toEqual([]);
  });

  it('a cleared native form keeps a newly entered manual age without the previous DOB', () => {
    const source = record(), h = harness(); h.fields.delete('dobInput');
    loadBrowserScript('vilda_dob_age.js', h.win);
    h.load(source, { collectUserData: () => h.api.collectUserData() });
    h.api.clearAllData();
    for (const [id, value] of Object.entries({ name: 'Fikcyjny Pacjent D', age: '16', ageMonths: '2', weight: '44', height: '156' })) {
      h.fields.get(id).value = value;
    }
    expect(h.api.saveMainSessionNow({ force: true, collectUserData: () => h.api.collectUserData() })).toBe(true);
    expect(h.main().user).toMatchObject({ age: 16, ageMonths: 2, weight: 44, height: 156 });
    expect(h.main().user).not.toHaveProperty('dobISO');
  });
});
