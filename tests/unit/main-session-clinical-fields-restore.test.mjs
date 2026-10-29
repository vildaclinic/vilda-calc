import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const clone = value => JSON.parse(JSON.stringify(value));
const clinical = () => ({
  version: 1, name: 'Fikcyjny Celina Sesja',
  user: { age: 13, ageMonths: 4, sex: 'F', height: null, weight: null },
  bp: { heartRate: 82, temperature: 37.2, population: 'hospital', systolic: 118, diastolic: 74 },
  adultVitals: { guideline: 'AHA', heartRate: 83, systolic: 119, diastolic: 75, athlete: true, betaBlocker: false },
  respiratory: { rate: 18, temperature: 37.1, state: 'sleep', population: 'hospital' },
  circumference: { head: 53, chest: 71, headDs: 52 },
  doctor: { isDoctor: true, pwzNumber: '1234567' },
  bisphos: { indication: 'osteogenesis', drug: 'pamidronate', doseNumber: '2' },
  bpDataToggle: true,
});

const ids = ['name', 'age', 'ageMonths', 'height', 'weight', 'sex', 'intakePal',
  'heartRate', 'hrTemperature', 'hrPopulation', 'bpSystolic', 'bpDiastolic',
  'adultBpGuidelineToggle', 'adultHeartRate', 'adultBpSystolic', 'adultBpDiastolic',
  'adultHrAthlete', 'adultHrAthleteNo', 'adultHrBetaBlocker', 'adultHrBetaBlockerNo',
  'respiratoryRateInput', 'respTemperature', 'respState', 'respPopulation',
  'headCircumference', 'chestCircumference', 'headCircumDS', 'isDoctor', 'pwzNumber',
  'bisphosIndication', 'bisphosDrug', 'bisphosDoseNumber', 'bpDataToggle'];

function harness(payload = clinical()) {
  vi.useFakeTimers();
  const fields = new Map(), events = [], documentEvents = [], writes = [];
  const storage = new Map([
    ['vildaCurrentPatientId', 'fictional-session-c'],
    ['vildaLoadChoiceV1', 'new'],
    ['vildaSaveStatusRefV1', 'existing-reference'],
  ]);
  for (const id of ids) fields.set(id, {
    id, value: '', checked: false, style: {}, dataset: {},
    dispatchEvent(event) { events.push({ id, type: event.type, heartRate: fields.get('heartRate')?.value }); },
    addEventListener() {}, removeAttribute() {}, setAttribute() {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  });
  fields.get('hrPopulation').value = 'healthy';
  fields.get('respState').value = 'awake';
  fields.get('respPopulation').value = 'healthy';
  fields.get('adultBpGuidelineToggle').checked = true;
  const doctorChanged = vi.fn(); fields.get('isDoctor').onchange = doctorChanged;
  let main = clone(payload);
  const win = {
    document: { readyState: 'loading', getElementById: id => fields.get(id) || null,
      querySelector: () => null, querySelectorAll: () => [], addEventListener() {},
      dispatchEvent(event) { documentEvents.push(event.type); } },
    VildaPersistence: { getStorage: () => ({}), readMainSession: () => clone(main),
      writeMainSession(value) { main = clone(value); writes.push(clone(value)); return true; },
      readClcrSession: () => null },
    location: { pathname: '/index.html' },
    sessionStorage: { getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
    setTimeout: () => 0, clearTimeout() {}, requestAnimationFrame: fn => fn(),
    addEventListener() {}, dispatchEvent() {},
    Event: class { constructor(type) { this.type = type; } },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
  };
  loadBrowserScript('vilda_data_import_export.js', win);
  const api = win.VildaDataImportExport;
  const options = { syncSharedUserDataFromLoadedData() {},
    rehydrateAdvancedFromState() {}, rehydrateIntakeFromState() {},
    applyLoadedData(data, restoreOptions) { return api.applyLoadedData(data, { ...options, ...restoreOptions }); } };
  return { api, win, fields, storage, events, documentEvents, writes, doctorChanged,
    main: () => clone(main),
    restore() { const restored = api.restoreMainSessionIfAny(options); vi.runOnlyPendingTimers(); return restored; },
    apply(data, overrides = {}) { return api.applyLoadedData(data, { ...options, ...overrides }); } };
}

afterEach(() => vi.useRealTimers());

describe('main-session restore hydrates clinical inputs carried from another page', () => {
  it('restores meaningful inputs before the first collection and module events, without changing the visit or reference', () => {
    const source = clinical(), h = harness(source);
    expect(h.restore()).toBe(true);
    const restored = h.main();
    for (const key of ['bp', 'adultVitals', 'respiratory', 'circumference', 'doctor', 'bpDataToggle']) {
      expect(restored[key], key).toEqual(source[key]);
    }
    expect(h.fields.get('bisphosDrug').value).toBe('pamidronate');
    expect(h.fields.get('bisphosIndication').value).toBe('osteogenesis');
    expect(h.fields.get('bisphosDoseNumber').value).toBe('2');
    expect(h.events.filter(event => event.id === 'heartRate')).toEqual([
      { id: 'heartRate', type: 'input', heartRate: '82' },
      { id: 'heartRate', type: 'change', heartRate: '82' },
    ]);
    expect(h.doctorChanged).toHaveBeenCalledOnce();
    expect(h.storage.get('vildaLoadChoiceV1')).toBe('new');
    expect(h.storage.get('vildaCurrentPatientId')).toBe('fictional-session-c');
    expect(h.storage.get('vildaSaveStatusRefV1')).toBe('existing-reference');
    expect(h.documentEvents).not.toContain('vilda:load-choice-applied');
    expect(source).toEqual(clinical());
    const writesBefore = h.writes.length;
    expect(h.api.saveMainSessionNow({ force: true })).toBe(true);
    expect(h.writes.length).toBeGreaterThan(writesBefore);
    expect(h.main().bp).toEqual(source.bp);
    expect(h.main().respiratory).toEqual(source.respiratory);
  });

  it('restores own nulls and false values over a warm populated form using the existing empty-control defaults', () => {
    const source = clinical(), h = harness();
    for (const field of h.fields.values()) { field.value = 'old'; field.checked = true; }
    source.bp = { heartRate: null, population: null };
    source.adultVitals = { guideline: null, athlete: false, betaBlocker: null };
    source.respiratory = { rate: null, state: null, population: null };
    source.circumference = { head: null };
    source.doctor = { isDoctor: false, pwzNumber: null };
    source.bisphos = { drug: null };
    source.bpDataToggle = false;
    h.apply(source, { isSessionRestore: true });
    for (const id of ['heartRate', 'hrPopulation', 'respiratoryRateInput', 'headCircumference', 'pwzNumber', 'bisphosDrug']) {
      expect(h.fields.get(id).value, id).toBe('');
    }
    expect(h.fields.get('respState').value).toBe('awake');
    expect(h.fields.get('respPopulation').value).toBe('healthy');
    expect(h.fields.get('adultBpGuidelineToggle').checked).toBe(true);
    for (const id of ['adultHrAthlete', 'adultHrBetaBlocker', 'isDoctor', 'bpDataToggle']) expect(h.fields.get(id).checked, id).toBe(false);
    for (const id of ['adultHrAthleteNo', 'adultHrBetaBlockerNo']) expect(h.fields.get(id).checked, id).toBe(true);
    expect(h.fields.get('hrTemperature').value).toBe('old');
    expect(h.fields.get('adultHeartRate').value).toBe('old');
    expect(h.fields.get('respTemperature').value).toBe('old');
    expect(h.fields.get('chestCircumference').value).toBe('old');
    expect(h.fields.get('bisphosIndication').value).toBe('old');
  });

  it('leaves absent legacy sections and inherited properties untouched', () => {
    const h = harness();
    h.fields.get('heartRate').value = '91'; h.fields.get('isDoctor').checked = true;
    h.apply({ version: 1, name: 'Fikcyjny Stary Zapis', user: { age: 13 },
      bp: Object.create({ heartRate: 82 }), doctor: null }, { isSessionRestore: true });
    expect(h.fields.get('heartRate').value).toBe('91');
    expect(h.fields.get('hrPopulation').value).toBe('healthy');
    expect(h.fields.get('isDoctor').checked).toBe(true);
    expect(h.doctorChanged).not.toHaveBeenCalled();
    expect(h.fields.get('adultBpGuidelineToggle').checked).toBe(true);
  });

  it('writes only controls rendered on the destination page', () => {
    const h = harness();
    for (const id of ids) if (!['name', 'age', 'bpSystolic'].includes(id)) h.fields.delete(id);
    expect(h.apply(clinical(), { isSessionRestore: true })).toBe(true);
    expect(h.fields.get('bpSystolic').value).toBe('118');
    expect(h.win).not.toHaveProperty('heartRate');
    expect(h.doctorChanged).not.toHaveBeenCalled();
  });

  it('does not turn a fresh load or Klirens preview into a saved-visit restore', () => {
    const h = harness();
    h.apply(clinical());
    expect(h.fields.get('heartRate').value).toBe('');
    expect(h.fields.get('respState').value).toBe('awake');
    expect(h.fields.get('adultBpGuidelineToggle').checked).toBe(true);
    const preview = harness();
    preview.fields.set('clcrForm', { id: 'clcrForm' });
    preview.fields.get('heartRate').value = '91';
    preview.apply({ ...clinical(), clcr: { inputs: { Scr: '0.8' } } });
    expect(preview.fields.get('heartRate').value).toBe('91');
    expect(preview.storage.get('vildaLoadChoiceV1')).toBeUndefined();
    expect(preview.doctorChanged).not.toHaveBeenCalled();
  });
});
