import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const clone = value => JSON.parse(JSON.stringify(value));
const MAIN = { name: 'Fikcyjny Pacjent Pᵢ/Cr DZM', user: { age: 8, sex: 'M', height: 130, weight: 25 } };
const PID = 'fictional-picr-chip';
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
  for (const file of ['clcr_collection_duration.js', 'clcr_phosphorus_creatinine_data.js', 'clcr_phosphorus_creatinine.js', 'clcr_phosphorus_creatinine_ui.js', 'inline_kalkulator_klirens_07.js']) {
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

describe('patient chip — Pᵢ/Cr DZM defaults versus actual measurement meaning', () => {
  it('the actual mounted blank DZM form is equivalent to no renal session and neither is mutated', () => {
    const runtime = collector(), captured = runtime.capture(), env = status();
    expect(captured.inputs).toMatchObject({ PICR_inputMode: 'concentration', PICR_phosphorus: '', PICR_creatinine: '', PICR_sameSpecimen: 'assumed' });
    const reference = env.indicator.getReferenceFingerprint(); env.compare(captured);
    expect(env.indicator.getState()).toBe('saved');
    expect(env.indicator._computeCanonicalFingerprint()).toBe(reference);
    expect(env.session()).toEqual(captured);
  });

  it.each([['PICR_inputMode', 'direct'], ['PICR_phosphorusUnit', 'µmol/L'], ['PICR_creatinineUnit', 'mg/L'],
    ['PICR_reportedUnit', 'mmol/mmol']])('empty-form configuration %s=%s does not create a patient edit', (field, value) => {
    const runtime = collector(), env = status(); runtime.set(field, value); runtime.set('formulaPicker', 'PO4_Cr');
    const captured = runtime.capture(); env.compare(captured);
    expect(env.indicator.getState()).toBe('saved'); expect(env.session()).toEqual(captured);
  });

  it.each([['PICR_phosphorus', '5'], ['PICR_phosphorus', '0'], ['PICR_phosphorus', '-1'], ['PICR_phosphorus', 'invalid'],
    ['PICR_creatinine', '100'], ['PICR_creatinine', '0'], ['PICR_reportedValue', '0'],
    ['PICR_reportedValue', '≥0.300000000000000000001']])('actual %s=%s remains meaningful even when zero, invalid or censored', (field, value) => {
    const runtime = collector(), env = status(); runtime.set(field, value);
    const captured = runtime.capture(); env.compare(captured);
    expect(env.indicator.getState()).toBe('dirty'); expect(env.session()).toEqual(captured);
  });

  it.each([['PICR_phosphorusUnit', 'µmol/L'], ['PICR_creatinineUnit', 'mg/L'], ['PICR_inputMode', 'direct']])(
    'a populated measurement retains changed %s=%s', (field, value) => {
      const runtime = collector(); runtime.set('PICR_phosphorus', '5'); runtime.set('PICR_creatinine', '100');
      const original = runtime.capture(), env = status({ legacy: original }); runtime.set(field, value); env.compare(runtime.capture());
      expect(env.indicator.getState()).toBe('dirty');
    });

  it.each(['mg/g', 'mmol/mmol'])('preserves the direct unit %s before generic Unit-suffix cleanup', unit => {
    const runtime = collector(); runtime.set('PICR_inputMode', 'direct'); runtime.set('PICR_reportedValue', '1');
    const env = status({ legacy: runtime.capture() }); runtime.set('PICR_reportedUnit', unit); env.compare(runtime.capture());
    expect(env.indicator.getState()).toBe('dirty');
    expect(JSON.parse(env.indicator._computeCanonicalFingerprint()).clcr.inputs.PICR_unitSemantics).toMatchObject({ reportedValue: unit });
  });

  it.each([['PICR_sameSpecimen', 'different'], ['PICR_sameSpecimen', 'confirmed'], ['PICR_collectionProblem', true],
    ['PICR_collectionProblem', false], ['PICR_collectionHours', '25'], ['PICR_durationKnown', false]])('explicit specimen fact %s=%s remains meaningful on a blank form', (field, value) => {
    const runtime = collector(), env = status(), current = runtime.capture(); current.inputs[field] = value; env.compare(current);
    expect(env.indicator.getState()).toBe('dirty'); expect(env.session()).toEqual(current);
    const again = status({ storage: env.storage, initialSession: current }); again.compare(current);
    expect(again.indicator.getState()).toBe('dirty');
  });

  it('explicit false facts remain distinct from absent or true facts across repeated normalization', () => {
    const current = collector().capture(); current.inputs.PICR_collectionProblem = false;
    const env = status({ legacy: current }); env.compare(current); expect(env.indicator.getState()).toBe('saved');
    const changed = clone(current); changed.inputs.PICR_collectionProblem = true; env.compare(changed);
    expect(env.indicator.getState()).toBe('dirty');
    expect(JSON.parse(env.indicator._computeCanonicalFingerprint()).clcr.inputs.PICR_contextSemantics).toMatchObject({ collectionProblem: 'true' });
  });

  it('saved comparison stays stable through reload and detects a change beyond Number precision', () => {
    const runtime = collector(); runtime.set('PICR_phosphorus', '5.00000000000000001'); runtime.set('PICR_creatinine', '100');
    const captured = runtime.capture(), env = status({ legacy: captured }); env.compare(captured);
    expect(env.indicator.getState()).toBe('saved');
    const reloaded = status({ storage: env.storage, initialSession: captured }); reloaded.compare(captured);
    expect(reloaded.indicator.getState()).toBe('saved');
    runtime.set('PICR_phosphorus', '5.00000000000000002'); reloaded.compare(runtime.capture());
    expect(reloaded.indicator.getState()).toBe('dirty');
  });

  it('genuine legacy PO4_Cr migration changes neither the patient comparison nor original source evidence', () => {
    const legacy = { selectedFormula: 'PO4_Cr', inputs: { U_PO4: '5', Ucr: '100' } }, original = clone(legacy), runtime = collector();
    expect(runtime.api.applyClcrSessionSnapshot(legacy, { update: false, preserveAcrossVersions: true })).toBe(true);
    const captured = runtime.capture();
    expect(captured.inputs).toMatchObject({ PICR_phosphorus: '5', PICR_creatinine: '100',
      PICR_phosphorusUnit: 'mg P/dL', PICR_creatinineUnit: 'mg/dL', U_PO4: '5', Ucr: '100' });
    const env = status({ legacy }); env.compare(captured);
    expect(env.indicator.getState()).toBe('saved'); expect(legacy).toEqual(original); expect(env.session()).toEqual(captured);
  });

  it.each([['g/g', 'mg/mg'], ['mol/mol', 'mmol/mmol']])('normalizing ratio alias %s retains equivalent meaning and provenance', (original, canonical) => {
    const runtime = collector(); runtime.set('PICR_inputMode', 'direct'); runtime.set('PICR_reportedValue', '0.3'); runtime.set('PICR_reportedUnit', original);
    const legacy = runtime.capture(), env = status({ legacy });
    runtime.set('PICR_reportedUnit', canonical); const migrated = runtime.capture(); migrated.inputs.PICR_reportedUnitOriginal = original; env.compare(migrated);
    expect(env.indicator.getState()).toBe('saved'); expect(env.session()).toEqual(migrated);
  });

  it.each(['not-json', '{"unknown":"5"}', '{"U_PO4":{"value":"5"}}'])('malformed alias provenance %s is not ignored', metadata => {
    const current = collector().capture(), env = status(); current.inputs.PICR_legacyAliases = metadata; env.compare(current);
    expect(env.indicator.getState()).toBe('dirty');
  });

  it('does not reinterpret another calculation shared operands as DZM', () => {
    const current = collector().capture(), env = status(); current.selectedFormula = 'CaCr_spot'; current.inputs.formulaPicker = 'CaCr_spot'; current.inputs.U_PO4 = '5'; current.inputs.Ucr = '100';
    env.compare(current); expect(env.indicator.getState()).toBe('dirty');
    const inputs = JSON.parse(env.indicator._computeCanonicalFingerprint()).clcr.inputs;
    expect(inputs).toMatchObject({ U_PO4: '5', Ucr: '100' }); expect(inputs).not.toHaveProperty('PICR_phosphorus');
  });
});
