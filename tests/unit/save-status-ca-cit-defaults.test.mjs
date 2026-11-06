import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const MAIN = { name: 'Fikcyjny Pacjent Ca/Cit', user: { age: 10, sex: 'F', height: 135, weight: 30 } };
const PID = 'fictional-calcium-citrate-chip';

// Use the shipped controls and complete session serializer. The comparison
// assertions below exercise the production indicator even on Start, where no
// renal engine is loaded.
function collector() {
  const document = atrapaDokumentu(), create = document.createElement;
  document.createElement = tag => { const node = create(tag); node.append = (...children) => children.forEach(child => node.appendChild(child)); return node; };
  document.querySelector = selector => document.documentElement.querySelector(selector);
  document.querySelectorAll = selector => document.documentElement.querySelectorAll(selector);
  const form = document.createElement('form'); form.id = 'clcrForm';
  const formula = document.createElement('input'); formula.id = 'formulaPicker'; formula.value = '';
  form.append(formula); document.body.appendChild(form);
  const window = { document, currentVersion: 'advanced', addEventListener() {},
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
  document.defaultView = window;
  const context = vm.createContext({ window, document, setTimeout: () => 0, clearTimeout() {} });
  for (const file of ['clcr_ca_cit_reference_data.js', 'clcr_ca_cit.js', 'clcr_ca_cit_ui.js', 'inline_kalkulator_klirens_07.js']) {
    vm.runInContext(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'), context, { filename: file });
  }
  return { document, api: window, context, capture: () => clone(window.buildClcrSessionSnapshot()),
    set(id, value) { document.getElementById(id).value = value; } };
}

function status({ legacy, storage: suppliedStorage, initialSession = null, passive = false } = {}) {
  let session = clone(initialSession);
  const storage = suppliedStorage || new Map([['vildaCurrentPatientId', PID]]), writes = vi.fn();
  if (legacy) storage.set('vilda-save-ref-v1', JSON.stringify({ fp: JSON.stringify({ core: MAIN, clcr: legacy }), dirty: true }));
  const persist = vi.fn(), collect = vi.fn(() => clone(MAIN));
  const win = {
    setTimeout, clearTimeout, setInterval, clearInterval, addEventListener() {}, console: { debug() {} },
    document: { readyState: 'complete', addEventListener() {}, getElementById: () => null },
    sessionStorage: { getItem: key => storage.get(key) ?? null,
      setItem(key, value) { writes(key, value); storage.set(key, String(value)); },
      removeItem(key) { writes(key, null); storage.delete(key); } },
    VildaVault: { isUnlocked: () => true, onPatientSaved() {} },
    VildaDataImportExport: { getApplyLoadedDataSequence: () => 1, captureCurrentUserDataReadOnly: () => clone(MAIN) },
    VildaPersistence: { readMainSession: () => clone(MAIN), readClcrSession: () => clone(session) },
    collectUserData: collect, hasMeaningfulMainSessionData: value => Boolean(value?.name), saveMainSessionNow: persist,
  };
  if (passive) { win.__vildaSaveStatusReadOnly = true; delete win.collectUserData; delete win.saveMainSessionNow; }
  loadBrowserScript('vilda_save_status_indicator.js', win);
  const indicator = win.VildaSaveStatusIndicator;
  if (!legacy && !suppliedStorage) indicator._onPatientLoaded({ patientId: PID, applySequence: 1, name: MAIN.name });
  vi.advanceTimersByTime(150); writes.mockClear(); persist.mockClear(); collect.mockClear();
  return { indicator, storage, writes, persist, collect, session: () => clone(session),
    compare(value) { session = clone(value); indicator.notifyExternalChange(); vi.advanceTimersByTime(400); } };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('patient chip — Ca/Cit input meaning and read-only comparison', () => {
  it('opening the actual empty form preserves the saved fingerprint and session', () => {
    const runtime = collector(), captured = runtime.capture(), env = status();
    expect(captured.inputs).toMatchObject({ CACIT_inputMode: 'concentration', CACIT_calcium: '', CACIT_citrate: '' });
    const reference = env.indicator.getReferenceFingerprint(); env.compare(captured);
    expect(env.indicator.getState()).toBe('saved');
    expect(env.indicator._computeCanonicalFingerprint()).toBe(reference);
    expect(env.session()).toEqual(captured);
  });

  it.each([['CACIT_inputMode', 'reported'], ['CACIT_calciumUnit', 'mg/L'], ['CACIT_citrateUnit', 'µmol/L'],
    ['CACIT_reportedUnit', 'mmol/mmol']])('empty configuration %s=%s is not a patient edit', (field, value) => {
    const runtime = collector(), env = status(); runtime.set('formulaPicker', 'Ca_Cit'); runtime.set(field, value);
    const captured = runtime.capture(); env.compare(captured);
    expect(env.indicator.getState()).toBe('saved'); expect(env.session()).toEqual(captured);
  });

  it.each([['CACIT_calcium', '0'], ['CACIT_calcium', '-1'], ['CACIT_calcium', 'invalid'],
    ['CACIT_citrate', '0'], ['CACIT_citrate', '-1'], ['CACIT_reportedValue', '0'],
    ['CACIT_reportedValue', '0.00000000000000000001']])('actual %s=%s remains meaningful', (field, value) => {
    const runtime = collector(), env = status(); runtime.set(field, value);
    const captured = runtime.capture(); env.compare(captured);
    expect(env.indicator.getState()).toBe('dirty'); expect(env.session()).toEqual(captured);
  });

  it.each([['CACIT_calciumUnit', 'mg/L'], ['CACIT_citrateUnit', 'mmol/L'], ['CACIT_inputMode', 'reported']])(
    'a populated measurement retains changed %s=%s', (field, value) => {
      const runtime = collector(); runtime.set('CACIT_calcium', '5'); runtime.set('CACIT_citrate', '100');
      const env = status({ legacy: runtime.capture() }); runtime.set(field, value); env.compare(runtime.capture());
      expect(env.indicator.getState()).toBe('dirty');
    });

  it('mass and molar ready ratios remain distinct before generic Unit cleanup', () => {
    const runtime = collector(); runtime.set('CACIT_inputMode', 'reported'); runtime.set('CACIT_reportedValue', '0.5');
    const env = status({ legacy: runtime.capture() }); runtime.set('CACIT_reportedUnit', 'mmol/mmol'); env.compare(runtime.capture());
    expect(env.indicator.getState()).toBe('dirty');
    expect(JSON.parse(env.indicator._computeCanonicalFingerprint()).clcr.inputs.CACIT_unitSemantics).toEqual({ reportedValue: 'mmol/mmol' });
  });

  it.each([['CACIT_sameSpecimen', 'different'], ['CACIT_sameSpecimen', 'confirmed'],
    ['CACIT_collectionProblem', true], ['CACIT_collectionProblem', false], ['CACIT_collectionHours', '12'],
    ['CACIT_durationKnown', false], ['CACIT_sampleType', 'spot'], ['CACIT_sampleSource', 'historical-missing'],
    ['CACIT_durationSource', 'historical-missing']])('explicit specimen fact %s=%s stays meaningful', (field, value) => {
    const runtime = collector(), env = status(), captured = runtime.capture(); captured.inputs[field] = value; env.compare(captured);
    expect(env.indicator.getState()).toBe('dirty'); expect(env.session()).toEqual(captured);
    const reloaded = status({ storage: env.storage, initialSession: captured }); reloaded.compare(captured);
    expect(reloaded.indicator.getState()).toBe('dirty');
  });

  it('does not collapse explicit false facts, precise raw strings or mass-basis evidence', () => {
    const original = { selectedFormula: 'Ca_Cit', inputs: { CACIT_calcium: '5.00000000000000001', CACIT_citrate: '100',
      CACIT_collectionProblem: false, CACIT_reportingEntity: 'citric_acid' } };
    const env = status({ legacy: original }); env.compare(original); expect(env.indicator.getState()).toBe('saved');
    const changed = clone(original); changed.inputs.CACIT_calcium = '5.00000000000000002'; env.compare(changed);
    expect(env.indicator.getState()).toBe('dirty');
    changed.inputs.CACIT_calcium = original.inputs.CACIT_calcium; changed.inputs.CACIT_collectionProblem = true; env.compare(changed);
    expect(env.indicator.getState()).toBe('dirty');
    changed.inputs.CACIT_collectionProblem = false; delete changed.inputs.CACIT_reportingEntity; env.compare(changed);
    expect(env.indicator.getState()).toBe('dirty');
  });

  it.each([['g/g', 'mg/mg'], ['mol/mol', 'mmol/mmol']])('equivalent alias %s keeps its original evidence without a false edit', (original, canonical) => {
    const legacy = { selectedFormula: 'Ca_Cit', inputs: { CACIT_inputMode: 'reported', CACIT_reportedValue: '0.3', CACIT_reportedUnit: original } };
    const env = status({ legacy }), current = clone(legacy); current.inputs.CACIT_reportedUnit = canonical; current.inputs.CACIT_reportedUnitOriginal = original;
    env.compare(current); expect(env.indicator.getState()).toBe('saved'); expect(env.session()).toEqual(current);
  });

  it.each(['not-json', '{"unknown":"5"}', '{"U_Ca":{"value":"5"}}'])('malformed provenance %s is not ignored', metadata => {
    const env = status(), captured = collector().capture(); captured.inputs.CACIT_legacyAliases = metadata; env.compare(captured);
    expect(env.indicator.getState()).toBe('dirty');
  });

  it('preserves false and unknown facts inside canonical carrier JSON and detects their edits', () => {
    const carrier = { version: 1, contexts: [{ knownFacts: { collectionNoMissedVoids: false, fictionalMethodUncertain: null } }] };
    const original = { selectedFormula: 'Ca_Cit', inputs: { CACIT_reportedValue: '0.3', CACIT_inputMode: 'reported', CACIT_sourceContext: JSON.stringify(carrier),
      CACIT_sampleType: 'timed', CACIT_sampleSource: 'assumed-current', CACIT_collectionHours: '', CACIT_durationKnown: '', CACIT_durationSource: '' } };
    const env = status({ legacy: original }); env.compare(original); expect(env.indicator.getState()).toBe('saved');
    const canonical = JSON.parse(env.indicator._computeCanonicalFingerprint()).clcr.inputs.CACIT_sourceContext;
    expect(JSON.parse(canonical).contexts[0].knownFacts).toEqual({ collectionNoMissedVoids: false, fictionalMethodUncertain: null });
    const reordered = clone(original); reordered.inputs.CACIT_sourceContext = JSON.stringify({ contexts: carrier.contexts, version: 1 });
    env.compare(reordered); expect(env.indicator.getState()).toBe('saved');
    const dormant = clone(original); dormant.selectedFormula = 'ACR'; dormant.inputs.formulaPicker = 'ACR';
    env.compare(dormant); expect(env.indicator.getState()).toBe('saved');
    const changed = clone(original); const modified = clone(carrier); modified.contexts[0].knownFacts.collectionNoMissedVoids = true;
    changed.inputs.CACIT_sourceContext = JSON.stringify(modified); env.compare(changed); expect(env.indicator.getState()).toBe('dirty');
  });

  it('does not reinterpret another formula shared operands as Ca/Cit', () => {
    const current = { selectedFormula: 'Ca_Cr', inputs: { U_Ca: '5', U_Cit: '100' } }, env = status(); env.compare(current);
    expect(env.indicator.getState()).toBe('dirty');
    const inputs = JSON.parse(env.indicator._computeCanonicalFingerprint()).clcr.inputs;
    expect(inputs).toMatchObject({ U_Ca: '5', U_Cit: '100' }); expect(inputs).not.toHaveProperty('CACIT_calcium');
  });

  it.each([{}, { context: { sameUrineSample: false, sampleType: 'spot', sampleSource: 'captured', collectionHours: '12', durationKnown: true,
    knownFacts: { collectionNoMissedVoids: false } } }])('actual legacy restoration keeps the saved fingerprint and original input evidence: %j', extra => {
    const legacy = { selectedFormula: 'Ca_Cit', inputs: { U_Ca: 2, U_Cit: '40.000' }, ...extra }, original = clone(legacy), runtime = collector();
    expect(runtime.api.applyClcrSessionSnapshot(legacy, { update: false, preserveAcrossVersions: true })).toBe(true);
    const captured = runtime.capture(), env = status({ legacy }); env.compare(captured);
    expect(JSON.parse(env.indicator._computeCanonicalFingerprint())).toEqual(JSON.parse(env.indicator.getReferenceFingerprint()));
    expect(env.indicator.getState()).toBe('saved'); expect(legacy).toEqual(original); expect(env.session()).toEqual(captured);
    expect(captured.inputs).toMatchObject({ CACIT_calcium: '2', CACIT_citrate: '40.000', CACIT_reportingEntity: 'citric_acid' });
  });

  it('typed omitted-patient fallback metadata stays equivalent during actual restoration and read-only comparison', () => {
    const runtime = collector(); runtime.context.syntheticInput = JSON.stringify({ mode: 'reported', reportedValue: '0.2', reportedUnit: 'mg/mg',
      ageYears: 10, ageYearsRaw: '10', agePrecision: 'completed-years', ageInterval: { minimumAgeYearsInclusive: 10, maximumAgeYearsExclusive: 11 },
      sex: 'F', sameSpecimen: 'different', reportedSameSpecimen: 'confirmed', sampleType: 'timed', sampleSource: 'captured', durationKnown: true, collectionHours: '24' });
    const frozen = clone(vm.runInContext('window.VildaClcrCaCit.evaluate(JSON.parse(syntheticInput), window.ClcrCaCitReferenceData.getProfile(window.ClcrCaCitReferenceData.DEFAULT_PROFILE_ID)).snapshot', runtime.context));
    const legacy = { selectedFormula: 'Ca_Cit', inputs: { CACIT_inputMode: 'reported', CACIT_reportedValue: '0.2', CACIT_reportedUnit: 'mg/mg' }, caCitSnapshot: frozen };
    expect(runtime.api.applyClcrSessionSnapshot(legacy, { update: false, preserveAcrossVersions: true })).toBe(true);
    const captured = runtime.capture(), env = status({ legacy }); env.compare(captured);
    expect(env.indicator.getState()).toBe('saved');
    expect(JSON.parse(env.indicator._computeCanonicalFingerprint())).toEqual(JSON.parse(env.indicator.getReferenceFingerprint()));
    const reference = env.indicator.getReferenceFingerprint(), session = env.session(), storage = [...env.storage]; env.writes.mockClear();
    expect(env.indicator.getCurrentDecision()).toMatchObject({ ready: true, state: 'saved' });
    expect(env.indicator.getReferenceFingerprint()).toBe(reference); expect(env.session()).toEqual(session); expect([...env.storage]).toEqual(storage);
    expect(env.writes).not.toHaveBeenCalled();
  });

  it('live save decisions and a passive read do not write a reference or session', () => {
    const current = { selectedFormula: 'Ca_Cit', inputs: { CACIT_inputMode: 'reported', CACIT_reportedValue: '0', CACIT_reportedUnit: 'mg/mg' } };
    const owner = status({ legacy: current, initialSession: current }), stored = [...owner.storage], before = owner.session();
    const reference = owner.indicator.getReferenceFingerprint();
    expect(owner.indicator.getCurrentDecision()).toMatchObject({ ready: true, state: 'saved' });
    expect(owner.indicator._computeCanonicalFingerprint()).toBe(reference);
    expect([...owner.storage]).toEqual(stored); expect(owner.session()).toEqual(before);
    expect(owner.writes).not.toHaveBeenCalled(); expect(owner.persist).not.toHaveBeenCalled(); expect(owner.collect).not.toHaveBeenCalled();
    const passive = status({ storage: owner.storage, initialSession: current, passive: true });
    passive.writes.mockClear();
    expect(passive.indicator.getCurrentDecision()).toMatchObject({ ready: true, state: 'saved' });
    expect(passive.indicator._computeCanonicalFingerprint()).toBe(reference);
    expect([...owner.storage]).toEqual(stored); expect(passive.session()).toEqual(before);
    expect(passive.writes).not.toHaveBeenCalled(); expect(passive.persist).not.toHaveBeenCalled(); expect(passive.collect).not.toHaveBeenCalled();
  });
});
