import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-POKWITANIE-WIZYTA: przyciski G/Th/P nie generują input/change. Wskaźnik zapisu
// (prawdziwy importer + prawdziwy wskaźnik, fikcyjne dane, bez sejfu) ma przeliczyć
// odcisk formularza po świadomej edycji oceny, a nie dopiero po innym polu.
function environment() {
  const events = { document: {}, window: {} };
  const storage = new Map();
  const savedListeners = [];
  let payload = { name: 'Fikcyjna Pierwsza', user: { sex: 'M', age: 12, height: 150, weight: 40 } };
  const on = target => (type, listener) => { (events[target][type] ||= []).push(listener); };
  const emit = (target, type, detail) => { for (const listener of events[target][type] || []) listener({ type, detail }); };
  const win = {
    setTimeout, clearTimeout, setInterval, clearInterval, console: { debug() {} },
    addEventListener: on('window'), removeEventListener() {},
    document: {
      readyState: 'complete', hidden: false, addEventListener: on('document'), removeEventListener() {},
      dispatchEvent(event) { emit('document', event.type, event.detail); return true; },
      getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    Event: class { constructor(type) { this.type = type; } },
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { pathname: '/index.html' },
    VildaVault: { isUnlocked: () => true, onPatientSaved: listener => savedListeners.push(listener) },
    VildaPersistence: { readMainSession: () => payload, isClearInProgress: () => false },
    collectUserData: () => payload,
    hasMeaningfulMainSessionData: value => Boolean(value?.name),
  };
  loadBrowserScript('vilda_data_import_export.js', win);
  loadBrowserScript('vilda_save_status_indicator.js', win);
  // The indicator is active only after the vault unlock callback (as in the browser after login).
  win.VildaSaveStatusIndicator._onUnlock();
  win.VildaDataImportExport.applyLoadedData(payload, {});
  storage.set('vildaCurrentPatientId', 'fictional-first');
  emit('document', 'vilda:patient-loaded', { patientId: 'fictional-first', name: payload.name, source: 'pick',
    applySequence: win.VildaDataImportExport.getApplyLoadedDataSequence?.() });
  // The importer pauses form-change handling briefly after a load; leave that window.
  vi.advanceTimersByTime(5000);
  return {
    indicator: win.VildaSaveStatusIndicator,
    editAssessment(reason = 'edit') {
      payload = { ...payload, user: { ...payload.user, pubertyAssessment: { version: 1, sex: 'M',
        observations: { G: { stage: 3, observedAtISO: null, ageMonths: 144, source: 'clinician-entry' }, Th: null, P: null } } } };
      win.document.dispatchEvent(new win.CustomEvent('vilda:puberty-assessment-changed', { detail: { reason, patientId: 'fictional-first' } }));
    },
  };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-15T12:00:00Z')); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('save indicator reacts to a conscious G/Th/P edit', () => {
  it('a stage edit alone turns the saved reference into unsaved changes', () => {
    const env = environment();
    expect(env.indicator.getState()).toBe('saved');
    env.editAssessment('edit');
    vi.advanceTimersByTime(500);
    expect(env.indicator.getState()).toBe('dirty');
  });

  it('a load or clear notification of the carrier does not by itself mark the form dirty', () => {
    const env = environment();
    env.editAssessment('load');
    env.editAssessment('clear');
    vi.advanceTimersByTime(500);
    expect(env.indicator.getState()).toBe('saved');
  });
});
