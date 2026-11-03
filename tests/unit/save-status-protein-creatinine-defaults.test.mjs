import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const clone = value => JSON.parse(JSON.stringify(value));
const MAIN = { name: 'Fikcyjny Pacjent B/Cr DZM', user: { age: 8, sex: 'M', height: 130, weight: 25 } };
const PID = 'fictional-bcr-chip';
// Mount the real dedicated controls and execute the complete shipped serializer.
function collector() {
  const document = atrapaDokumentu(), create = document.createElement;
  document.createElement = tag => { const node = create(tag); node.append = (...children) => children.forEach(child => node.appendChild(child)); return node; };
  document.querySelector = selector => document.documentElement.querySelector(selector);
  document.querySelectorAll = selector => document.documentElement.querySelectorAll(selector);
  const form = document.createElement('form'); form.id = 'clcrForm';
  const formula = document.createElement('input'); formula.id = 'formulaPicker'; formula.value = '';
  form.append(formula); document.body.appendChild(form);
  const window = { document, currentVersion: 'advanced', addEventListener() {}, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
  document.defaultView = window;
  const context = vm.createContext({ window, document, setTimeout: () => 0, clearTimeout() {} });
  for (const file of ['clcr_collection_duration.js', 'clcr_protein_creatinine_data.js', 'clcr_protein_creatinine.js', 'clcr_protein_creatinine_ui.js', 'inline_kalkulator_klirens_07.js']) {
    vm.runInContext(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'), context, { filename: file });
  }
  return { document, api: window, capture: () => clone(window.buildClcrSessionSnapshot()), set(id, value) { document.getElementById(id).value = value; } };
}
function status({ legacy, storage: suppliedStorage, initialSession = null } = {}) {
  let session = initialSession && clone(initialSession);
  const storage = suppliedStorage || new Map([['vildaCurrentPatientId', PID]]);
  if (legacy) storage.set('vilda-save-ref-v1', JSON.stringify({ fp: JSON.stringify({ core: MAIN, clcr: legacy }), dirty: true }));
  const win = { setTimeout, clearTimeout, setInterval, clearInterval, addEventListener() {}, console: { debug() {} },
    document: { readyState: 'complete', addEventListener() {}, getElementById: () => null },
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
    VildaVault: { isUnlocked: () => true, onPatientSaved() {} }, VildaDataImportExport: { getApplyLoadedDataSequence: () => 1 },
    VildaPersistence: { readMainSession: () => clone(MAIN), readClcrSession: () => session && clone(session) },
    collectUserData: () => clone(MAIN), hasMeaningfulMainSessionData: value => Boolean(value?.name) };
  // Comparison must also work on Start, where the clinical engine is not loaded.
  loadBrowserScript('vilda_save_status_indicator.js', win);
  const indicator = win.VildaSaveStatusIndicator;
  if (!legacy && !suppliedStorage) indicator._onPatientLoaded({ patientId: PID, applySequence: 1, name: MAIN.name });
  vi.advanceTimersByTime(150);
  return { indicator, storage, session: () => session && clone(session),
    compare(value) { session = value && clone(value); indicator.notifyExternalChange(); vi.advanceTimersByTime(400); } };
}
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('patient chip — B/Cr DZM defaults versus actual measurement meaning', () => {
  it('the actual mounted blank DZM form is equivalent to no renal session and neither is mutated', () => {
    const runtime = collector(), captured = runtime.capture(), env = status();
    expect(captured.inputs).toMatchObject({ BCR_inputMode: 'concentration', BCR_protein: '', BCR_creatinine: '', BCR_sameSpecimen: 'assumed' });
    const reference = env.indicator.getReferenceFingerprint(); env.compare(captured);
    expect(env.indicator.getState()).toBe('saved');
    expect(env.indicator._computeCanonicalFingerprint()).toBe(reference);
    expect(env.session()).toEqual(captured);
  });

  it.each([['BCR_inputMode', 'direct'], ['BCR_proteinUnit', 'g/L'], ['BCR_creatinineUnit', 'mg/L'],
    ['BCR_reportedUnit', 'mg/mmol']])('empty-form configuration %s=%s does not create a patient edit', (field, value) => {
    const runtime = collector(), env = status(); runtime.set(field, value); runtime.set('formulaPicker', 'B_Cr');
    const captured = runtime.capture(); env.compare(captured);
    expect(env.indicator.getState()).toBe('saved'); expect(env.session()).toEqual(captured);
  });

  it.each([['BCR_protein', '5'], ['BCR_protein', '0'], ['BCR_protein', '-1'], ['BCR_protein', 'invalid'],
    ['BCR_creatinine', '100'], ['BCR_creatinine', '0'], ['BCR_reportedValue', '0'],
    ['BCR_reportedValue', '≥0.300000000000000000001']])('actual %s=%s remains meaningful even when zero, invalid or censored', (field, value) => {
    const runtime = collector(), env = status(); runtime.set(field, value);
    const captured = runtime.capture(); env.compare(captured);
    expect(env.indicator.getState()).toBe('dirty'); expect(env.session()).toEqual(captured);
  });

  it.each([['BCR_proteinUnit', 'g/L'], ['BCR_creatinineUnit', 'mg/L'], ['BCR_inputMode', 'direct']])(
    'a populated measurement retains changed %s=%s', (field, value) => {
      const runtime = collector(); runtime.set('BCR_protein', '5'); runtime.set('BCR_creatinine', '100');
      const original = runtime.capture(), env = status({ legacy: original }); runtime.set(field, value); env.compare(runtime.capture());
      expect(env.indicator.getState()).toBe('dirty');
    });

  it.each(['mg/g', 'mg/mmol'])('preserves the direct unit %s before generic Unit-suffix cleanup', unit => {
    const runtime = collector(); runtime.set('BCR_inputMode', 'direct'); runtime.set('BCR_reportedValue', '1');
    const env = status({ legacy: runtime.capture() }); runtime.set('BCR_reportedUnit', unit); env.compare(runtime.capture());
    expect(env.indicator.getState()).toBe('dirty');
    expect(JSON.parse(env.indicator._computeCanonicalFingerprint()).clcr.inputs.BCR_unitSemantics).toMatchObject({ reportedValue: unit });
  });

  it.each([['BCR_sameSpecimen', 'different'], ['BCR_sameSpecimen', 'confirmed'], ['BCR_collectionProblem', true],
    ['BCR_collectionProblem', false], ['BCR_collectionHours', '25'], ['BCR_durationKnown', false]])('explicit specimen fact %s=%s remains meaningful on a blank form', (field, value) => {
    const runtime = collector(), env = status(), current = runtime.capture(); current.inputs[field] = value; env.compare(current);
    expect(env.indicator.getState()).toBe('dirty'); expect(env.session()).toEqual(current);
    const again = status({ storage: env.storage, initialSession: current }); again.compare(current);
    expect(again.indicator.getState()).toBe('dirty');
  });

  it('explicit false facts remain distinct from absent or true facts across repeated normalization', () => {
    const current = collector().capture(); current.inputs.BCR_collectionProblem = false;
    const env = status({ legacy: current }); env.compare(current); expect(env.indicator.getState()).toBe('saved');
    const changed = clone(current); changed.inputs.BCR_collectionProblem = true; env.compare(changed);
    expect(env.indicator.getState()).toBe('dirty');
    expect(JSON.parse(env.indicator._computeCanonicalFingerprint()).clcr.inputs.BCR_contextSemantics).toMatchObject({ collectionProblem: 'true' });
  });

  it('saved comparison stays stable through reload and detects a change beyond Number precision', () => {
    const runtime = collector(); runtime.set('BCR_protein', '5.00000000000000001'); runtime.set('BCR_creatinine', '100');
    const captured = runtime.capture(), env = status({ legacy: captured }); env.compare(captured);
    expect(env.indicator.getState()).toBe('saved');
    const reloaded = status({ storage: env.storage, initialSession: captured }); reloaded.compare(captured);
    expect(reloaded.indicator.getState()).toBe('saved');
    runtime.set('BCR_protein', '5.00000000000000002'); reloaded.compare(runtime.capture());
    expect(reloaded.indicator.getState()).toBe('dirty');
  });

  it('genuine legacy B_Cr migration changes neither the patient comparison nor original source evidence', () => {
    const legacy = { selectedFormula: 'B_Cr', inputs: { U_Prot: '450', V24: '1500', Ucr: '100' } }, original = clone(legacy), runtime = collector();
    expect(runtime.api.applyClcrSessionSnapshot(legacy, { update: false, preserveAcrossVersions: true })).toBe(true);
    const captured = runtime.capture();
    expect(captured.inputs).toMatchObject({ BCR_inputMode: 'legacy', BCR_protein: '', BCR_creatinine: '',
      BCR_proteinUnit: 'mg/L', BCR_creatinineUnit: 'mg/dL', U_Prot: '450', V24: '1500', Ucr: '100' });
    const env = status({ legacy }); env.compare(captured);
    expect(env.indicator.getState()).toBe('saved'); expect(legacy).toEqual(original); expect(env.session()).toEqual(captured);
  });

  it.each([['g/g', 'mg/mg']])('normalizing ratio alias %s retains equivalent meaning and provenance', (original, canonical) => {
    const runtime = collector(); runtime.set('BCR_inputMode', 'direct'); runtime.set('BCR_reportedValue', '0.3'); runtime.set('BCR_reportedUnit', original);
    const legacy = runtime.capture(), env = status({ legacy });
    runtime.set('BCR_reportedUnit', canonical); const migrated = runtime.capture(); migrated.inputs.BCR_reportedUnitOriginal = original; env.compare(migrated);
    expect(env.indicator.getState()).toBe('saved'); expect(env.session()).toEqual(migrated);
  });

  it.each(['not-json', '{"unknown":"5"}', '{"U_Prot":{"value":"5"}}'])('malformed alias provenance %s is not ignored', metadata => {
    const current = collector().capture(), env = status(); current.inputs.BCR_legacyAliases = metadata; env.compare(current);
    expect(env.indicator.getState()).toBe('dirty');
  });

  it('does not reinterpret another calculation shared operands as DZM', () => {
    const current = collector().capture(), env = status(); current.selectedFormula = 'CaCr_spot'; current.inputs.formulaPicker = 'CaCr_spot'; current.inputs.U_Prot = '5'; current.inputs.Ucr = '100';
    env.compare(current); expect(env.indicator.getState()).toBe('dirty');
    const inputs = JSON.parse(env.indicator._computeCanonicalFingerprint()).clcr.inputs;
    expect(inputs).toMatchObject({ U_Prot: '5', Ucr: '100' }); expect(inputs).not.toHaveProperty('BCR_protein');
  });
});
