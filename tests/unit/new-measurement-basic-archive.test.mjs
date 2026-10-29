import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const OLD = { ageMonths: 120, ageYears: 10, height: 141, weight: 33 };
const PID = 'fictional-basic-new-c';
const record = () => ({ version: 1, name: 'Fikcyjny Pacjent C',
  user: { age: 13, ageMonths: 4, sex: 'M', height: 158, weight: 46 },
  advanced: { data: { measurements: [clone(OLD)] } },
  growthBasic: { name: 'Fikcyjny Pacjent C', data: { measurements: [clone(OLD)], fictionalMetadata: 'keep' } },
  intake: { pal: '1.8' }, plan: { palFactor: 1.8, palWybrany: true },
});

function events(target = {}) {
  const listeners = [];
  target.addEventListener = (type, callback, options) => {
    listeners.push({ type, callback, capture: options === true || !!options?.capture });
  };
  target.removeEventListener = (type, callback) => {
    const index = listeners.findIndex(item => item.type === type && item.callback === callback);
    if (index >= 0) listeners.splice(index, 1);
  };
  target.dispatchEvent = event => {
    for (const listener of listeners.filter(item => item.type === event.type)
      .sort((a, b) => Number(b.capture) - Number(a.capture))) listener.callback(event);
    return true;
  };
  return target;
}

function harness(source = record()) {
  let main = null;
  const writes = [], fields = new Map(), storage = new Map([['vildaCurrentPatientId', PID]]);
  for (const id of ['name', 'age', 'ageMonths', 'sex', 'height', 'weight', 'dobInput', 'restoreStateBtn']) {
    fields.set(id, { id, value: '', tagName: 'INPUT', type: 'text', dataset: {},
      style: { display: 'none' }, addEventListener() {}, dispatchEvent() { return true; },
      setAttribute() {}, removeAttribute() {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false } });
  }
  // DocPro owns the advanced editor, but has no basic-history table.
  fields.set('advMeasurements', { id: 'advMeasurements', querySelectorAll: () => [] });
  const document = events({ readyState: 'loading', getElementById: id => fields.get(id) || null,
    querySelector: () => null, querySelectorAll: () => [] });
  const win = events({ document, location: { pathname: '/docpro.html' },
    setTimeout: () => 0, clearTimeout() {},
    sessionStorage: { getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    Event: class { constructor(type) { this.type = type; } },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    VildaVault: { isUnlocked: () => true }, VildaAuthUI: { isBootReady: () => true },
    VildaPersistence: { getStorage: () => ({}), readMainSession: () => clone(main),
      writeMainSession(value) { writes.push(clone(value)); main = clone(value); return true; },
      clearMainSession() { main = null; }, readClcrSession: () => null,
      readModuleJSON: (_key, fallback) => fallback },
  });
  win.window = win; win.self = win; win.parent = { VildaShell: { protokolPanelu: 1 } }; win.top = win.parent;
  loadBrowserScript('vilda_panel_pacjent.js', win);
  loadBrowserScript('vilda_data_import_export.js', win);
  const api = win.VildaDataImportExport;
  api.restoreMainSessionIfAny();
  const options = { showRestoreButton() { fields.get('restoreStateBtn').style.display = 'inline-block'; },
    showLoadDataMessage() {}, hideLoadDataMessage() {}, debouncedUpdate() {}, updateSaveBtnVisibility() {} };
  function load(value) { expect(api.applyLoadedData(value, options)).toBe(true); }
  load(source);
  const defaultDetail = () => ({ choice: 'new', patientId: storage.get('vildaCurrentPatientId'),
    applySequence: api.getApplyLoadedDataSequence() });
  return { win, api, fields, storage, writes, load, main: () => clone(main),
    previous(value) { main = clone(value); },
    archiveInCallback() {
      // The real helper used by custom-fixes creates both archive views. Its
      // historical basic alias is not the basicGrowthData read by the collector.
      const archived = clone(win.lastLoadedData);
      api._ensureCurrentMeasurementInHistory(archived);
      win.advancedGrowthData = clone(archived.advanced.data);
      win.growthBasicData = clone(archived.growthBasic.data);
    },
    newChoice(overrides = {}) {
      storage.set('vildaLoadChoiceV1', 'new');
      document.dispatchEvent(new win.CustomEvent('vilda:load-choice-applied', {
        detail: { ...defaultDetail(), ...overrides },
      }));
    },
    save() { return api.saveMainSessionNow({ force: true }); },
  };
}

function currentPoint(api, source) {
  const archived = { user: clone(source.user) };
  api._ensureCurrentMeasurementInHistory(archived);
  return archived.growthBasic.data.measurements[0];
}

describe('New measurement archives the previous current point in the basic session view', () => {
  it('persists 120 + 160 before the saved-status baseline and leaves the source snapshot unchanged', () => {
    const source = record(), h = harness(source), before = clone(source);
    const expectedPoint = currentPoint(h.api, source);
    expect(expectedPoint.ageMonths).toBe(160);
    expect(h.main().growthBasic.data.measurements).toEqual([OLD]);
    h.archiveInCallback();
    expect(h.api.collectUserData().growthBasic.data.measurements).toEqual([OLD]);
    let baseline;
    h.win.document.addEventListener('vilda:load-choice-applied', () => { baseline = h.main(); });
    h.newChoice();
    expect(h.main().growthBasic.data.measurements).toEqual([OLD, expectedPoint]);
    expect(baseline.growthBasic.data.measurements).toEqual([OLD, expectedPoint]);
    expect(h.main().growthBasic.data.fictionalMetadata).toBe('keep');
    expect(h.main().advanced.data.measurements).toEqual([OLD, expectedPoint]);
    expect(h.main().user).toMatchObject({ height: null, weight: null });
    expect(source).toEqual(before);
    expect(h.save()).toBe(true);
    expect(h.main().growthBasic.data.measurements).toEqual([OLD, expectedPoint]);
  });

  it('retains all four materialized legacy rows and appends 156 instead of replacing them with one row', () => {
    const source = record(); delete source.growthBasic; source.user.ageMonths = 0;
    const rows = [60, 84, 108, 132].map((ageMonths, index) => ({
      ageMonths, ageYears: ageMonths / 12, height: 110 + index * 10, weight: 20 + index * 5,
    }));
    source.advanced.data.measurements = clone(rows);
    const h = harness(source), previous = h.main();
    // The legacy missing-view restore has already materialized the shared basic
    // model. The NEW transaction must continue this model, not raw missing data.
    previous.growthBasic = { data: { measurements: clone(rows) } }; h.previous(previous);
    h.archiveInCallback(); h.newChoice();
    expect(h.main().growthBasic.data.measurements).toEqual([...rows, currentPoint(h.api, source)]);
    expect(h.main().growthBasic.data.measurements).toHaveLength(5);
    expect(h.main().growthBasic.data.measurements.at(-1).ageMonths).toBe(156);
  });

  it('preserves independent and GH basic rows from the latest main model rather than copying advanced rows', () => {
    const source = record(), h = harness(source), previous = h.main();
    const unique = { ageMonths: 121, height: 142, weight: 34, fictionalNote: 'independent basic observation' };
    const gh = { ageMonths: 132, height: 147, weight: 38, ghSync: true, pointId: 'fictional-gh' };
    previous.growthBasic.data.measurements = [unique, gh]; h.previous(previous);
    h.archiveInCallback(); h.newChoice();
    expect(h.main().growthBasic.data.measurements).toEqual([unique, gh, currentPoint(h.api, source)]);
    expect(h.main().growthBasic.data.measurements).not.toContainEqual(OLD);
  });

  it('adds only the previous current point after an explicit latest-main empty history', () => {
    const source = record(), h = harness(source), previous = h.main();
    previous.growthBasic.data.measurements = []; h.previous(previous);
    h.archiveInCallback(); h.newChoice();
    expect(h.main().growthBasic.data.measurements).toEqual([currentPoint(h.api, source)]);
  });

  it.each([[null], [[]], [{ data: null }]])('does not create a history for an explicit missing basic model %j', basic => {
    const source = record(); source.growthBasic = clone(basic);
    const h = harness(source), previous = h.main();
    previous.growthBasic = clone(basic); h.previous(previous);
    h.archiveInCallback(); h.newChoice();
    expect(h.main().growthBasic).toEqual(basic);
  });

  it('consumes the archive transaction once so replay cannot undo a subsequent explicit clear', () => {
    const h = harness(); h.archiveInCallback(); h.newChoice();
    expect(h.main().growthBasic.data.measurements).toEqual([OLD, currentPoint(h.api, record())]);
    const previous = h.main(); previous.growthBasic.data.measurements = []; h.previous(previous);
    const count = h.writes.length; h.newChoice();
    expect(h.main().growthBasic.data.measurements).toEqual([]);
    expect(h.writes).toHaveLength(count);
  });

  it.each(['autosave retry', 'replayed NEW'])('a failed first archive cannot revive another owner clear through %s', retry => {
    const source = record(), h = harness(source), before = h.main();
    h.archiveInCallback();
    const write = h.win.VildaPersistence.writeMainSession, rejected = [];
    h.win.VildaPersistence.writeMainSession = value => { rejected.push(clone(value)); return false; };
    h.newChoice();
    expect(rejected).toHaveLength(1);
    expect(rejected[0].growthBasic.data.measurements).toEqual([OLD, currentPoint(h.api, source)]);
    expect(h.main()).toEqual(before);
    h.win.VildaPersistence.writeMainSession = write;
    // A different live owner has explicitly cleared the same patient's basic
    // archive after this document's attempted transaction was rejected.
    const cleared = h.main(); cleared.growthBasic.data.measurements = []; h.previous(cleared);
    if (retry === 'replayed NEW') h.newChoice();
    expect(h.save()).toBe(true);
    expect(h.main().growthBasic.data.measurements).toEqual([]);
    expect(source).toEqual(record());
  });

  it('does not invent an archived observation when the previous current point has no height or weight', () => {
    const source = record(); source.user.height = null; source.user.weight = null;
    const h = harness(source), before = h.main(), count = h.writes.length;
    h.archiveInCallback(); h.newChoice();
    expect(h.main()).toEqual(before);
    expect(h.writes).toHaveLength(count);
  });
});

describe('New basic archive respects the existing load and owner boundaries', () => {
  it.each(['patient', 'sequence', 'owner', 'clear', 'next-load', 'restore-choice'])('rejects the %s boundary without any write', reason => {
    const h = harness(); h.archiveInCallback();
    const detail = {};
    if (reason === 'patient') detail.patientId = 'fictional-other-patient';
    if (reason === 'sequence') detail.applySequence = h.api.getApplyLoadedDataSequence() - 1;
    if (reason === 'owner') {
      h.storage.set('vildaCurrentPatientId', 'fictional-other-patient');
      expect(h.win.VildaPanelPacjent.nieaktualny()).toBe(true);
    }
    if (reason === 'clear') h.api.clearMainSessionStorage();
    if (reason === 'next-load') {
      const oldSequence = h.api.getApplyLoadedDataSequence(), next = record();
      next.name = 'Fikcyjny Pacjent D'; h.load(next); detail.applySequence = oldSequence;
    }
    if (reason === 'restore-choice') detail.choice = 'restore';
    const before = h.main(), count = h.writes.length; h.newChoice(detail);
    expect(h.main()).toEqual(before);
    expect(h.writes).toHaveLength(count);
  });

  it.each([null, { measurements: [] }])('an ordinary absent-table placeholder %j remains nonauthoritative outside NEW', placeholder => {
    const h = harness(); h.win.basicGrowthData = clone(placeholder);
    expect(h.save()).toBe(true);
    expect(h.main().growthBasic.data.measurements).toEqual([OLD]);
  });
});
