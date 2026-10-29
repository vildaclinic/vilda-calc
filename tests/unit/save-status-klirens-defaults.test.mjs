import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Values emitted by the real empty Klirens page. The browser regression also
// executes its serializer so a future new default cannot escape this contract.
const EMPTY_INPUTS = {
  ACR_entry_mode: 'concentration', PCR_entry_mode: 'concentration',
  CaCr_entry_mode: 'concentration', OxCr_entry_mode: 'concentration', CitCr_entry_mode: 'concentration',
  CitCr_reported_basis: 'unknown', citrateSpotReportingEntity: 'unknown', creatinineState: 'unknown',
  CA_inputMode: 'concentration', CA_clinicalMode: 'general', MG_inputMode: 'concentration', UA_inputMode: 'concentration',
  Cl24DurationHours: '24', Cl24DurationSource: 'assumed-24h',
  CA_collectionHours: '24', CA_collectionSource: 'assumed-24h',
  MG_collectionHours: '24', MG_collectionSource: 'assumed-24h',
  UA_collectionHours: '24', UA_collectionSource: 'assumed-24h',
};
const MAIN = { name: 'Fikcyjna Pacjentka Chipa', user: { sex: 'F', age: 12, height: 150, weight: 40 } };
const PATIENT = 'fictional-chip-klirens';
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

function environment({ initial = null, legacy, dirty = false } = {}) {
  const storage = new Map([['vildaCurrentPatientId', PATIENT]]);
  const listeners = {};
  let session = initial == null ? null : { inputs: clone(initial) };
  if (legacy !== undefined) storage.set('vilda-save-ref-v1', JSON.stringify({
    fp: JSON.stringify({ core: MAIN, clcr: legacy == null ? null : { inputs: legacy } }),
    dirty, patientId: PATIENT, savedAtISO: '2026-06-17T12:00:00Z', snapshotCount: 2, patientName: MAIN.name,
  }));
  const win = {
    setTimeout, clearTimeout, setInterval, clearInterval,
    console: { debug() {} }, addEventListener() {},
    sessionStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key),
    },
    document: {
      readyState: 'complete', getElementById: () => null,
      addEventListener(type, callback) { (listeners[type] ||= []).push(callback); },
    },
    VildaVault: { isUnlocked: () => true, onPatientSaved() {} },
    VildaDataImportExport: { getApplyLoadedDataSequence: () => 1 },
    VildaPersistence: { readMainSession: () => clone(MAIN), readClcrSession: () => clone(session) },
    collectUserData: () => clone(MAIN), hasMeaningfulMainSessionData: value => Boolean(value?.name),
    saveMainSessionNow: vi.fn(() => true),
  };
  loadBrowserScript('vilda_save_status_indicator.js', win);
  const indicator = win.VildaSaveStatusIndicator;
  if (legacy === undefined) {
    indicator._onPatientLoaded({ patientId: PATIENT, applySequence: 1, name: MAIN.name });
    vi.advanceTimersByTime(150);
  }
  return {
    indicator,
    session: () => session,
    replace(inputs) { session = inputs == null ? null : { inputs: clone(inputs) }; },
    compare() { indicator.notifyExternalChange(); vi.advanceTimersByTime(400); },
  };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-29T12:00:00Z')); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('patient chip — empty Klirens controls materialized by navigation', () => {
  it('an absent calculator and its real empty defaults have the same saved inputs', () => {
    const env = environment();
    const reference = env.indicator.getReferenceFingerprint();
    env.replace(EMPTY_INPUTS);
    env.compare();
    expect(env.indicator.getState()).toBe('saved');
    expect(env.indicator._computeCanonicalFingerprint()).toBe(reference);
    expect(env.indicator.getReferenceFingerprint()).toBe(reference);
    expect(env.session()).toEqual({ inputs: EMPTY_INPUTS });
  });

  it.each([false, true])('normalizes a legacy reference containing the empty defaults (dirty=%s)', dirty => {
    const env = environment({ initial: null, legacy: EMPTY_INPUTS, dirty });
    env.compare();
    expect(env.indicator.getState()).toBe('saved');
    expect(env.indicator._computeCanonicalFingerprint()).toBe(env.indicator.getReferenceFingerprint());
  });

  it.each([
    ['Scr', '1.2'], ['Scr', '0'], ['U_Alb', '30'], ['CA_concentration', '2.5'],
    ['CA_volume', '1500'], ['CA_reportedValue', '240'], ['MG_concentration', '1.3'],
    ['UA_reportedValue', '500'], ['collectionStartAt', '2026-10-28T09:00'],
    ['ACR_entry_mode', 'direct'], ['PCR_entry_mode', 'direct'], ['CA_inputMode', 'reported'],
    ['CA_clinicalMode', 'hypercalcemia'], ['CitCr_reported_basis', 'acid'],
    ['citrateSpotReportingEntity', 'ion'], ['creatinineState', 'stable'],
    ['CA_durationNeedsConfirmation', true], ['durationNeedsConfirmation', true],
    ['Cl24DurationHours', '12'], ['CA_collectionHours', '23'],
    ['MG_collectionHours', '0'], ['UA_collectionHours', 'invalid'],
    ['Cl24DurationSource', 'historical-missing'], ['CA_collectionSource', 'hours'],
    ['MG_collectionSource', 'captured'], ['UA_collectionSource', 'legacy-dates'],
  ])('retains meaningful measurement or protocol change %s=%j', (field, value) => {
    const env = environment({ initial: EMPTY_INPUTS });
    env.replace({ ...EMPTY_INPUTS, [field]: value });
    env.compare();
    expect(env.indicator.getState()).toBe('dirty');
  });

  it.each([
    ['Cl24DurationHours', 'Cl24DurationSource'], ['CA_collectionHours', 'CA_collectionSource'],
    ['MG_collectionHours', 'MG_collectionSource'], ['UA_collectionHours', 'UA_collectionSource'],
  ])('an explicitly entered 24-hour %s remains different from an assumed day', (hours, source) => {
    const env = environment({ initial: EMPTY_INPUTS });
    env.replace({ ...EMPTY_INPUTS, [hours]: '24', [source]: 'hours' });
    env.compare();
    expect(env.indicator.getState()).toBe('dirty');
  });

  it.each([
    ['Cl24DurationHours', 'Cl24DurationSource'], ['CA_collectionHours', 'CA_collectionSource'],
    ['MG_collectionHours', 'MG_collectionSource'], ['UA_collectionHours', 'UA_collectionSource'],
  ])('returning a saved nondefault %s from 12 to 24 still marks the edit', (hours, source) => {
    const env = environment({ initial: { ...EMPTY_INPUTS, [hours]: '12', [source]: 'hours' } });
    env.replace({ ...EMPTY_INPUTS, [hours]: '24', [source]: 'hours' });
    env.compare();
    expect(env.indicator.getState()).toBe('dirty');
  });

  it('legacy explicit duration without a source matches the existing serializer migration', () => {
    const env = environment({ initial: { Cl24DurationHours: '24', Cl24DurationSource: 'hours' },
      legacy: { Cl24DurationHours: '24' } });
    env.compare();
    expect(env.indicator.getState()).toBe('saved');
  });

  it.each(['24.0', '+24', '2.4e1', 24])('recognizes a valid representation %j of the existing assumed-day default', value => {
    const env = environment();
    env.replace({ ...EMPTY_INPUTS, Cl24DurationHours: value });
    env.compare();
    expect(env.indicator.getState()).toBe('saved');
  });

  it.each(['0x18', '24 hours', 'Infinity'])('does not hide an invalid duration %j behind the assumed-day provenance', value => {
    const env = environment();
    env.replace({ ...EMPTY_INPUTS, Cl24DurationHours: value });
    env.compare();
    expect(env.indicator.getState()).toBe('dirty');
  });

  it('migrating an empty legacy reference never accepts a genuine new measurement', () => {
    const env = environment({ initial: { ...EMPTY_INPUTS, Scr: '1.2' }, legacy: EMPTY_INPUTS, dirty: true });
    env.compare();
    expect(env.indicator.getState()).toBe('dirty');
  });
});
