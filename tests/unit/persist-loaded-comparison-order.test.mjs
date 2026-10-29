import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const record = {
  version: 1, name: 'Fikcyjny Antoni',
  user: { age: 13, ageMonths: 0, sex: 'M', weight: 46, height: 158,
    dobISO: '2013-06-17', measuredAtISO: '2026-06-17' },
};

function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key), key: index => [...values.keys()][index] ?? null,
    get length() { return values.size; } };
}

// Real adapter, persistence runtime and DOB module. The rehydrate callback is a
// synchronous consumer, as the real growth cards are; it calls the actual DOB API.
function harness() {
  const fields = {}, listeners = {};
  const document = { readyState: 'complete', hidden: false,
    addEventListener(type, callback) { (listeners[type] ||= []).push(callback); },
    dispatchEvent(event) { for (const callback of listeners[event.type] || []) callback(event); return true; },
    getElementById: id => fields[id] || null,
    getElementsByName: () => [], querySelectorAll: () => [],
  };
  for (const id of ['name', 'age', 'ageMonths', 'weight', 'height', 'sex',
    'dobInput', 'dobNote', 'dobError', 'dobClear', 'ageWeeks', 'ageWeeksRow',
    'ageWeeksNote', 'ageWeeksError', 'restoreStateBtn']) {
    const own = {};
    fields[id] = { id, tagName: 'INPUT', type: 'text', value: '', dataset: {},
      disabled: false, readOnly: false, hidden: false, textContent: '', style: { display: 'none' },
      classList: { toggle() {} }, closest: () => null, focus() {},
      addEventListener(type, callback) { (own[type] ||= []).push(callback); },
      dispatchEvent(event) {
        const forwarded = { type: event.type, target: this, isTrusted: false };
        for (const callback of own[event.type] || []) callback(forwarded);
        return document.dispatchEvent(forwarded);
      },
    };
  }
  const win = new EventTarget();
  Object.assign(win, { document, sessionStorage: storage(), localStorage: storage(),
    setTimeout, clearTimeout, Event, CustomEvent, vildaAppOnReady() {},
    VildaPanelPacjent: { nieaktualny: () => false },
  });
  win.sessionStorage.setItem('vildaCurrentPatientId', 'fictional-restored-visit');
  win.sessionStorage.setItem('vildaLoadChoiceV1', 'restore');
  const observations = [];
  win.vildaRehydrateAdvancedFromState = () => {
    win.VildaDobAge.refresh();
    observations.push({ months: fields.ageMonths.value,
      loaded: win.lastLoadedData == null ? null : clone(win.lastLoadedData) });
  };
  for (const file of ['vilda_persistence_adapter.js', 'vilda_dob_age.js', 'vilda_persist_runtime.js']) {
    new Function('window', 'globalThis', 'document', source(file))(win, win, document);
  }
  win.VildaPersistRuntime.init();
  const snapshot = (comparison = record) => ({
    name: record.name, age: '13', ageMonths: '0', weight: '46', height: '158', sex: 'M',
    _vildaPersist: {
      byId: { age: '13', ageMonths: '0', weight: '46', height: '158', sex: 'M' },
      globals: { loadedComparisonData: clone(comparison), hasUserModifiedAfterLoad: false,
        advancedGrowthData: { measurements: [] } },
    },
  });
  const seed = (comparison = record) => win.VildaPersistence.writeShared(snapshot(comparison), { force: true });
  seed();
  const comparison = () => win.VildaPersistence.readShared()?._vildaPersist?.globals?.loadedComparisonData;
  return { win, fields, observations, seed, comparison };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 28, 12));
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('P-CHIP-NAWIGACJA — loaded comparison survives restoration', () => {
  it('a force flush before the first restore preserves the saved comparison', () => {
    const h = harness();
    expect(h.win.lastLoadedData).toBeUndefined();
    h.win.vildaPersistFlushNow({ force: true });
    expect(h.comparison()).toEqual(record);
  });

  it('the first synchronous rehydrate reads the saved visit and DOB never changes it to today', () => {
    const h = harness();
    h.fields.dobInput.value = '17-06-2013';
    const ages = [];
    h.win.document.addEventListener('input', event => {
      if (event.target === h.fields.ageMonths) ages.push(h.fields.ageMonths.value);
    });
    h.win.vildaPersistRestoreAll();
    expect(h.observations).toEqual([{ months: '0', loaded: record }]);
    expect(ages).not.toContain('4');
    expect(h.fields.ageMonths.value).toBe('0');
    expect(h.win.VildaDobAge.readMeasuredAtISO()).toBe('2026-06-17');
    expect(h.win.lastLoadedData).not.toBe(record);
    expect(h.win.lastLoadedData).toEqual(record);
    vi.advanceTimersByTime(20);
    expect(h.fields.ageMonths.value).toBe('0');
  });

  it.each(['restoring', 'main-session-pending', 'dob-pending'])('%s protects comparison after the first restore', reason => {
    const h = harness();
    h.win.vildaPersistRestoreAll();
    vi.advanceTimersByTime(20);
    h.win.lastLoadedData = null;
    if (reason === 'restoring') h.win.__vildaPersistRestoring = true;
    if (reason === 'main-session-pending') h.win.VildaDataImportExport = { isMainSessionRestorePending: () => true };
    if (reason === 'dob-pending') h.win.document.dispatchEvent({ type: 'vilda:persist-restored' });
    h.win.vildaPersistFlushNow({ force: true });
    expect(h.comparison()).toEqual(record);
  });

  it('after a completed restore the ordinary removal of an absent comparison still applies', () => {
    const h = harness();
    h.win.vildaPersistRestoreAll();
    vi.advanceTimersByTime(20);
    h.win.lastLoadedData = null;
    h.win.vildaPersistFlushNow({ force: true });
    expect(h.comparison()).toBeNull();
  });

  it('an invalid comparison replaces an old window baseline before synchronous rehydrate', () => {
    const h = harness();
    h.win.lastLoadedData = clone(record);
    h.seed({ version: 1, user: {} });
    h.win.vildaRehydrateAdvancedFromState = () => h.observations.push(h.win.lastLoadedData);
    h.win.vildaPersistRestoreAll();
    expect(h.observations).toEqual([null]);
    expect(h.win.lastLoadedData).toBeNull();
  });

  it('an explicit clear removes shared comparison and cannot resurrect it with force', () => {
    const h = harness();
    h.win.VildaPersistence.clearUserState({ includeSessions: true, source: 'fictional-test-clear', durationMs: 1000 });
    h.win.vildaPersistClearAfterUserClear('fictional-test-clear');
    h.win.vildaPersistFlushNow({ force: true });
    expect(h.comparison()).toBeUndefined();
    expect(h.win.lastLoadedData).toBeNull();
  });

  it('a queued write cannot replace another patient after the selected ID changes', () => {
    const h = harness();
    h.win.document.dispatchEvent({ type: 'input', target: h.fields.ageMonths, isTrusted: true });
    h.win.sessionStorage.setItem('vildaCurrentPatientId', 'fictional-other-visit');
    const next = { ...clone(record), name: 'Fikcyjna Inna' };
    h.seed(next);
    h.win.vildaPersistFlushNow({ force: true });
    expect(h.comparison()).toEqual(next);
  });
});
