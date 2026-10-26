import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

// Explicitly fictional measurements. The real restore orchestrator and intake
// rehydrator run together; only DOM rows and an intervening calculation are held
// under test control.
const CURRENT = { ageMonths: 160, height: 159.4, weight: 47.2 };
const STALE = { ageMonths: 160, height: 159, weight: 47 };
const HISTORY = [
  { ageMonths: 84, height: 123.6, weight: 23.9 },
  { ageMonths: 144, height: 153, weight: 40 },
];
const clone = value => JSON.parse(JSON.stringify(value));

function harness({ intakeDom = true } = {}) {
  const rows = [], timers = [], elements = new Map();
  function element(id, value = '') {
    const node = {
      id, value, dataset: {}, style: {}, disabled: false,
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      dispatchEvent() { return true; }, addEventListener() {},
      setAttribute() {}, removeAttribute() {}, getAttribute: () => null,
      querySelector: () => null, querySelectorAll: () => [],
    };
    elements.set(id, node);
    return node;
  }
  for (const [id, value] of Object.entries({
    age: '13', ageMonths: '4', sex: 'M', height: '159', weight: '47', intakePal: '1.4',
  })) element(id, value);
  if (intakeDom) {
    const container = element('intakeMeasurements');
    Object.defineProperty(container, 'textContent', { set() { rows.length = 0; } });
  }
  const storage = new Map([['vildaCurrentPatientId', 'fictional-restore-owner']]);
  const win = {
    document: {
      readyState: 'loading', getElementById: id => elements.get(id) || null,
      querySelector: () => null, querySelectorAll: () => [],
      addEventListener() {}, dispatchEvent() { return true; },
    },
    sessionStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key),
    },
    addEventListener() {}, dispatchEvent() { return true; },
    setTimeout: callback => { timers.push(callback); return timers.length; }, clearTimeout() {},
    location: { pathname: '/index.html' },
    Event: class { constructor(type) { this.type = type; } },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    hasCompleteIntakeCurrentBasics: () => true,
    _getUserBasics: () => ({ ...CURRENT }),
    intakeAddRow: row => rows.push(clone(row || {})),
    intakeHistory: [{ ...STALE }],
  };
  for (const file of ['vilda_estimated_intake_runtime.js', 'vilda_data_import_export.js']) {
    new Function('window', 'globalThis', 'setTimeout', 'clearTimeout',
      fs.readFileSync(file, 'utf8'))(win, win, win.setTimeout, win.clearTimeout);
  }
  const api = win.VildaDataImportExport;
  let intermediateCalculations = 0;
  function restore(intake, { isSessionRestore = true } = {}) {
    const payload = {
      version: 1, name: 'FIKCYJNY test odtworzenia',
      user: { sex: 'M', age: 13, ageMonths: 4, height: CURRENT.height, weight: CURRENT.weight },
      zscore: { resultsMode: true },
    };
    if (intake !== undefined) payload.intake = intake;
    const before = clone(payload);
    expect(api.applyLoadedData(payload, {
      isSessionRestore,
      applyResultsModeRestoreState() {
        // Result/access restoration can calculate the old shared table before
        // the main-session intake DOM is rebuilt. It must not become history.
        if (isSessionRestore) expect(elements.get('height').value).toBe(String(CURRENT.height));
        win.VildaEstimatedIntakeRuntime.commitEstimatedIntakeWindowState([STALE], null, { root: win });
        intermediateCalculations += 1;
      },
      rehydrateAdvancedFromState() {},
      syncSharedUserDataFromLoadedData() {},
    })).toBe(true);
    expect(payload).toEqual(before);
    expect(intermediateCalculations).toBe(1);
    return rows;
  }
  return { win, api, rows, restore };
}

describe('Main-session intake history remains authoritative during restoration', () => {
  it.each([null, []])('explicit %j cannot harvest an older shared current measurement', history => {
    const h = harness();
    expect(h.restore({ pal: '1.4', history })).toEqual([CURRENT]);
  });

  it('preserves a nonempty saved history despite an intervening calculation', () => {
    const h = harness();
    expect(h.restore({ history: clone(HISTORY) })).toEqual([CURRENT, ...HISTORY]);
  });

  it('still omits a saved current duplicate without losing other measurements', () => {
    const h = harness();
    expect(h.restore({ history: [...clone(HISTORY), { ...CURRENT }] })).toEqual([CURRENT, ...HISTORY]);
  });

  it.each([{}, undefined, { history: 'legacy-invalid-carrier' }])(
    'keeps the legacy global fallback when no supported history was supplied: %j', intake => {
      const h = harness();
      expect(h.restore(intake)).toEqual([CURRENT, STALE]);
    });

  it('does not clear another panel’s history when the intake DOM is absent', () => {
    const h = harness({ intakeDom: false });
    expect(h.restore({ history: null })).toEqual([]);
    expect(h.win.intakeHistory).toEqual([STALE]);
  });

  it('retains the public rehydrator’s ordinary global fallback', () => {
    const h = harness();
    expect(h.api.rehydrateIntakeFromState('1.4')).toMatchObject({ rendered: true, historyRows: 1 });
    expect(h.rows).toEqual([CURRENT, STALE]);
  });

  it('does not extend the main-session history override to ordinary imports', () => {
    const h = harness();
    expect(h.restore({ history: null }, { isSessionRestore: false })).toEqual([CURRENT, STALE]);
  });
});
