import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const MAIN = { name: 'Fikcyjna Pacjentka KtV', user: { sex: 'F', age: 50, height: 170, weight: 70 } };
const PATIENT_ID = 'fictional-ktv-neutral-default';
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const EMPTY = { ktvVariant: 'spktv', ktvToggle: false, UreaPre: '', UreaPost: '', ktvDurationMinutes: '', ktvUF: '', ktvW: '',
  ktvSessionsPerWeek: '', ktvPidiDays: '', ktvAccessType: '', ktvModality: '', ktvPostMethod: '', ktvKru: '', ktvKruMeasuredAt: '',
  ktvSameSession: false, ktvPreBeforeDialysis: false, ktvPreNoDilution: false, ktvTreatmentsDelivered: false };
const FULL = { ktvVariant: 'spktv', UreaPre: '20', UreaPost: '6', ktvDurationMinutes: '240', ktvUF: '0', ktvW: '70', ktvSessionsPerWeek: '3', ktvPidiDays: '2' };

// Exercise the production status/fingerprint API. There is no calculator or
// save implementation here; only the storage/document boundary is supplied.
function environment({ initial = null, legacy, dirty = false } = {}) {
  const storage = new Map([['vildaCurrentPatientId', PATIENT_ID]]);
  let session = initial == null ? null : { inputs: clone(initial) };
  if (legacy !== undefined) storage.set('vilda-save-ref-v1', JSON.stringify({
    fp: JSON.stringify({ core: MAIN, clcr: legacy == null ? null : { inputs: legacy } }), dirty,
    patientId: PATIENT_ID, savedAtISO: '2026-11-06T12:00:00Z', snapshotCount: 1, patientName: MAIN.name,
  }));
  const window = {
    setTimeout, clearTimeout, setInterval, clearInterval, console: { debug() {} }, addEventListener() {},
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
    document: { readyState: 'complete', getElementById: () => null, addEventListener() {} },
    VildaVault: { isUnlocked: () => true, onPatientSaved() {} },
    VildaDataImportExport: { getApplyLoadedDataSequence: () => 1 },
    VildaPersistence: { readMainSession: () => clone(MAIN), readClcrSession: () => clone(session) },
    collectUserData: () => clone(MAIN), hasMeaningfulMainSessionData: value => Boolean(value?.name), saveMainSessionNow: vi.fn(() => true),
  };
  loadBrowserScript('vilda_save_status_indicator.js', window);
  const api = window.VildaSaveStatusIndicator;
  if (legacy === undefined) { api._onPatientLoaded({ patientId: PATIENT_ID, applySequence: 1, name: MAIN.name }); vi.advanceTimersByTime(150); }
  return { api, session: () => session, replace(value) { session = value == null ? null : { inputs: clone(value) }; },
    compare() { api.notifyExternalChange(); vi.advanceTimersByTime(400); } };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-06T12:00:00Z')); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('patient status — the default Kt/V selector is neutral', () => {
  it.each([{ ktvVariant: 'spktv' }, EMPTY])('opening empty Klirens with %j preserves the saved fingerprint', inputs => {
    const h = environment(), reference = h.api.getReferenceFingerprint();
    h.replace(inputs); h.compare();
    expect(h.api.getState()).toBe('saved');
    expect(h.api._computeCanonicalFingerprint()).toBe(reference);
    expect(h.api.getReferenceFingerprint()).toBe(reference);
    expect(h.session()).toEqual({ inputs });
  });

  it.each([false, true])('normalizes a legacy reference containing only the default (dirty=%s)', dirty => {
    const h = environment({ legacy: { ktvVariant: 'spktv' }, dirty }); h.compare();
    expect(h.api.getState()).toBe('saved');
    expect(h.api._computeCanonicalFingerprint()).toBe(h.api.getReferenceFingerprint());
  });

  it('keeps a complete actual Kt/V measurement, including explicitly entered zero UF, meaningful', () => {
    const h = environment(), reference = h.api.getReferenceFingerprint(); h.replace(FULL); h.compare();
    expect(h.api.getState()).toBe('dirty');
    expect(h.api._computeCanonicalFingerprint()).not.toBe(reference);
    expect(JSON.parse(h.api._computeCanonicalFingerprint()).clcr.inputs).toMatchObject({
      UreaPre: '20', UreaPost: '6', ktvDurationMinutes: '240', ktvUF: '0', ktvW: '70', ktvSessionsPerWeek: '3', ktvPidiDays: '2',
    });
    expect(h.session()).toEqual({ inputs: FULL });
  });

  it.each(['ektv', 'urr'])('retains an explicit nondefault %s variant', ktvVariant => {
    const h = environment({ initial: EMPTY }); h.replace({ ...EMPTY, ktvVariant }); h.compare();
    expect(h.api.getState()).toBe('dirty');
    expect(JSON.parse(h.api._computeCanonicalFingerprint()).clcr.inputs.ktvVariant).toBe(ktvVariant);
  });

  it.each(['ektv', 'urr'])('returning a saved %s measurement to default spKt/V remains an edit', ktvVariant => {
    const h = environment({ initial: { ...FULL, ktvVariant } }); h.replace(FULL); h.compare();
    expect(h.api.getState()).toBe('dirty');
    expect(h.api._computeCanonicalFingerprint()).not.toBe(h.api.getReferenceFingerprint());
  });

  it('a real concentration change is dirty and reverting it restores the saved status', () => {
    const h = environment({ initial: FULL }), reference = h.api.getReferenceFingerprint();
    h.replace({ ...FULL, UreaPost: '7' }); h.compare(); expect(h.api.getState()).toBe('dirty');
    h.replace(FULL); h.compare(); expect(h.api.getState()).toBe('saved');
    expect(h.api._computeCanonicalFingerprint()).toBe(reference);
  });

  it.each([
    ['UreaPre', '0'], ['UreaPost', '6'], ['ktvUF', '0'], ['ktvModality', 'PD'], ['ktvModality', 'CRRT'],
    ['ktvPostMethod', 'equilibrated_30_60min'], ['ui_ktvSameSession_answer', 'no'],
    ['ktvKnownFacts', '{"ktvSameSession":false}'], ['ktvKnownFacts', '{"ktvPreUnit":"mg/dL","ktvPostUnit":"mmol/L"}'],
  ])('preserves real values or factual context %s=%s', (field, value) => {
    const h = environment({ initial: EMPTY }); h.replace({ ...EMPTY, [field]: value }); h.compare();
    expect(h.api.getState()).toBe('dirty');
    expect(JSON.parse(h.api._computeCanonicalFingerprint()).clcr.inputs[field]).toBe(value);
  });

  it('legacy default migration cannot accept a newly entered result', () => {
    const h = environment({ legacy: EMPTY, initial: { ...EMPTY, UreaPre: '20', UreaPost: '6' }, dirty: true }); h.compare();
    expect(h.api.getState()).toBe('dirty');
    expect(h.api._computeCanonicalFingerprint()).not.toBe(h.api.getReferenceFingerprint());
  });
});
