import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Actual importer + indicator. All records are fictional; no vault authentication.
function environment() {
  const events = { document: {}, window: {} };
  const storage = new Map();
  const savedListeners = [];
  let payload = { name: 'Fikcyjna Pierwsza', user: { sex: 'F', age: 8, height: 126, weight: 25 } };
  const on = target => (type, listener) => { (events[target][type] ||= []).push(listener); };
  const emit = (target, type, detail) => {
    for (const listener of events[target][type] || []) listener({ type, detail });
  };
  const win = {
    setTimeout, clearTimeout, setInterval, clearInterval,
    console: { debug() {} },
    addEventListener: on('window'), removeEventListener() {},
    document: {
      readyState: 'complete', hidden: false,
      addEventListener: on('document'), removeEventListener() {},
      dispatchEvent(event) { emit('document', event.type, event.detail); return true; },
      getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    Event: class { constructor(type) { this.type = type; } },
    sessionStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key),
    },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { pathname: '/index.html' },
    VildaVault: {
      isUnlocked: () => true,
      onPatientSaved: listener => savedListeners.push(listener),
      async savePatient(value) {
        const saved = { patientId: 'fictional-first', header: { name: value.name }, snapshotCount: 1 };
        savedListeners.forEach(listener => listener(saved));
        return saved;
      },
    },
    VildaPersistence: { readMainSession: () => payload, isClearInProgress: () => false },
    collectUserData: () => payload,
    hasMeaningfulMainSessionData: value => Boolean(value?.name),
  };
  loadBrowserScript('vilda_data_import_export.js', win);
  loadBrowserScript('vilda_save_status_indicator.js', win);
  const imported = [];
  on('document')('vilda:json-imported', event => imported.push(event.detail));
  return {
    win, imported, indicator: win.VildaSaveStatusIndicator,
    apply(name = payload.name, options) {
      payload = { name, user: { sex: 'F', age: 8, height: 126, weight: 25 } };
      win.VildaDataImportExport.applyLoadedData(payload, options);
      return win.VildaDataImportExport.getApplyLoadedDataSequence?.();
    },
    confirm(patientId = 'fictional-first', source, beforeIdentity = false) {
      const applySequence = win.VildaDataImportExport.getApplyLoadedDataSequence?.();
      if (beforeIdentity) {
        emit('document', 'vilda:patient-loaded', { patientId, name: payload.name, source, applySequence });
      }
      storage.set('vildaCurrentPatientId', patientId);
      if (!beforeIdentity) {
        emit('document', 'vilda:patient-loaded', { patientId, name: payload.name, source, applySequence });
      }
    },
    clear() {
      payload = { name: '', user: {} };
      emit('window', 'vilda:user-state-cleared');
      storage.delete('vildaCurrentPatientId');
    },
    setPatient(patientId) { storage.set('vildaCurrentPatientId', patientId); },
    save: () => win.VildaDataImportExport.saveUserData({ collectUserData: () => payload }),
    emitLoad: detail => emit('document', 'vilda:patient-loaded', detail),
    emitImport: detail => emit('document', 'vilda:json-imported', detail),
  };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-15T12:00:00Z')); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('save indicator follows the import operation instead of a 500 ms window', () => {
  it('late JSON notification of a confirmed vault load keeps its saved reference', () => {
    const env = environment();
    env.apply();
    env.confirm();
    // A busy renderer delays the queued notification beyond the old 500 ms window.
    vi.setSystemTime(Date.now() + 2000);
    vi.advanceTimersByTime(300);
    expect(env.indicator.getState()).toBe('saved');
    expect(env.indicator.getReferenceFingerprint()).not.toBeNull();
    expect(env.imported[0].applySequence).toBe(1);
  });

  it('a genuine next JSON import remains a new patient even immediately after a vault load', () => {
    const env = environment();
    env.apply();
    env.confirm();
    env.apply('Fikcyjna Druga');
    vi.advanceTimersByTime(300);
    expect(env.indicator.getState()).toBe('new_patient');
    expect(env.indicator.getReferenceFingerprint()).toBeNull();
    expect(env.imported.map(event => event.applySequence)).toEqual([1, 2]);
  });

  it('a previous queued import cannot replace a newer confirmed patient', () => {
    const env = environment();
    env.apply();
    env.confirm();
    env.apply('Fikcyjna Druga');
    env.confirm('fictional-second');
    vi.setSystemTime(Date.now() + 2000);
    vi.advanceTimersByTime(300);
    const reference = env.indicator.getReferenceFingerprint();
    env.emitImport({ applySequence: 1, name: 'Fikcyjna Pierwsza' });
    vi.advanceTimersByTime(300);
    expect(env.indicator.getState()).toBe('saved');
    expect(env.indicator.getReferenceFingerprint()).toBe(reference);
    expect(reference).toContain('Fikcyjna Druga');
  });

  it('clear cancels a queued saved reference and its old import notification', () => {
    const env = environment();
    env.apply();
    env.confirm();
    env.clear();
    vi.advanceTimersByTime(400);
    expect(env.indicator.getState()).toBe('hidden');
    expect(env.indicator.getReferenceFingerprint()).toBeNull();
  });

  it('changing the patient ID cancels a pending reference publication', () => {
    const env = environment();
    env.apply();
    env.confirm();
    env.setPatient('fictional-other-frame');
    vi.advanceTimersByTime(300);
    expect(env.indicator.getReferenceFingerprint()).toBeNull();
  });

  it('session restore advances the operation boundary without emitting a JSON notification', () => {
    const env = environment();
    env.apply();
    vi.advanceTimersByTime(300);
    const sequence = env.win.VildaDataImportExport.getApplyLoadedDataSequence?.();
    env.apply('Fikcyjna Pierwsza', { isSessionRestore: true });
    vi.advanceTimersByTime(300);
    expect(sequence).toBe(1);
    expect(env.win.VildaDataImportExport.getApplyLoadedDataSequence()).toBe(sequence + 1);
    expect(env.imported).toHaveLength(1);
  });

  it('a queued JSON import cannot clear the reference of a later session restore', () => {
    const env = environment();
    env.apply();
    env.confirm();
    vi.advanceTimersByTime(300);
    const reference = env.indicator.getReferenceFingerprint();
    env.apply('Fikcyjna Druga');
    env.apply('Fikcyjna Pierwsza', { isSessionRestore: true });
    vi.setSystemTime(Date.now() + 2000);
    vi.advanceTimersByTime(300);
    expect(env.indicator.getState()).toBe('saved');
    expect(env.indicator.getReferenceFingerprint()).toBe(reference);
  });

  it('the real main save confirms its pending import after the ordinary vault callback', async () => {
    const env = environment();
    env.apply();
    env.setPatient('fictional-first');
    await env.save();
    vi.setSystemTime(Date.now() + 2000);
    vi.advanceTimersByTime(300);
    expect(env.indicator.getState()).toBe('saved');
    expect(env.indicator.getReferenceFingerprint()).not.toBeNull();
  });

  it('locking cancels delayed callbacks and keeps the reference cleared', () => {
    const env = environment();
    env.apply();
    env.confirm();
    env.indicator._onLock();
    vi.advanceTimersByTime(400);
    expect(env.indicator.getState()).toBe('hidden');
    expect(env.indicator.getReferenceFingerprint()).toBeNull();
  });

  it('a loader may assign the target patient ID after the indicator listener', () => {
    const env = environment();
    env.apply();
    env.confirm('fictional-first', undefined, true);
    vi.setSystemTime(Date.now() + 2000);
    vi.advanceTimersByTime(300);
    expect(env.indicator.getState()).toBe('saved');
    expect(env.indicator.getReferenceFingerprint()).not.toBeNull();
  });

  it('an older save notification cannot acknowledge a newer JSON import', () => {
    const env = environment();
    env.apply();
    env.confirm();
    env.apply('Fikcyjna Druga');
    env.emitLoad({ source: 'save', applySequence: 1, patientId: 'fictional-first' });
    vi.advanceTimersByTime(300);
    expect(env.indicator.getState()).toBe('new_patient');
    expect(env.indicator.getReferenceFingerprint()).toBeNull();
  });

  it('a vault callback without import provenance cannot acknowledge the newest import', () => {
    const env = environment();
    env.apply();
    env.indicator._onPatientSaved({ patientId: 'fictional-other', header: { name: 'Fikcyjny Inny' } });
    vi.advanceTimersByTime(300);
    expect(env.indicator.getState()).toBe('new_patient');
    expect(env.indicator.getReferenceFingerprint()).toBeNull();
  });

  it('unlocking does not confirm a genuine JSON import waiting behind the previous saved reference', () => {
    const env = environment();
    env.apply();
    env.confirm();
    vi.advanceTimersByTime(300);
    env.apply('Fikcyjna Druga');
    env.indicator._onUnlock();
    vi.advanceTimersByTime(300);
    expect(env.indicator.getState()).toBe('new_patient');
    expect(env.indicator.getReferenceFingerprint()).toBeNull();
  });

  it('a stale tagged load cannot publish a saved reference after the newest JSON import settled', () => {
    const env = environment();
    env.apply();
    env.confirm();
    env.apply('Fikcyjna Druga');
    vi.advanceTimersByTime(300);
    env.emitLoad({ source: 'vault-load', applySequence: 1, patientId: 'fictional-first' });
    vi.advanceTimersByTime(300);
    expect(env.indicator.getState()).toBe('new_patient');
    expect(env.indicator.getReferenceFingerprint()).toBeNull();
  });

  it('an unprovenanced save notification cannot publish a reference for a later imported form', () => {
    const env = environment();
    env.apply('Fikcyjna Druga');
    vi.advanceTimersByTime(300);
    env.emitLoad({ source: 'save', patientId: 'fictional-first' });
    env.setPatient('fictional-first');
    vi.advanceTimersByTime(300);
    expect(env.indicator.getState()).toBe('new_patient');
    expect(env.indicator.getReferenceFingerprint()).toBeNull();
  });

  it('operation identity stays outside the patient payload and invalid applies do not advance it', () => {
    const env = environment();
    env.apply();
    vi.advanceTimersByTime(300);
    expect(JSON.stringify(env.win.lastLoadedData)).not.toContain('applySequence');
    expect(env.win.VildaDataImportExport.applyLoadedData(null)).toBe(false);
    expect(env.win.VildaDataImportExport.getApplyLoadedDataSequence()).toBe(1);
  });
});
