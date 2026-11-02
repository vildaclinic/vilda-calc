import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const clone = value => JSON.parse(JSON.stringify(value));
const MAIN = { name: 'Fikcyjny Pacjent KM/Cr', user: { age: 40, sex: 'M', height: 175, weight: 75 } };
const PID = 'fictional-urate-creatinine-chip';

// Mount the production controls and complete shipped renal serializer. The
// fake boundary holds only fictional data; no real encrypted vault is opened.
function collector() {
  const document = atrapaDokumentu(), create = document.createElement;
  document.createElement = tag => { const node = create(tag); node.append = (...children) => children.forEach(child => node.appendChild(child)); return node; };
  document.querySelector = selector => document.documentElement.querySelector(selector);
  document.querySelectorAll = selector => document.documentElement.querySelectorAll(selector);
  const form = document.createElement('form'); form.id = 'clcrForm';
  const formula = document.createElement('input'); formula.id = 'formulaPicker'; formula.value = '';
  form.append(formula); document.body.appendChild(form);
  const window = { document, currentVersion: 'spot', addEventListener() {}, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
  document.defaultView = window;
  const context = vm.createContext({ window, document, setTimeout: () => 0, clearTimeout() {} });
  for (const file of ['clcr_collection_duration.js', 'clcr_urate_creatinine_data.js', 'clcr_urate_creatinine.js', 'clcr_urate_creatinine_ui.js', 'inline_kalkulator_klirens_07.js']) {
    vm.runInContext(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'), context, { filename: file });
  }
  return { document, api: window, capture: () => clone(window.buildClcrSessionSnapshot()), set(id, value) { document.getElementById(id).value = value; } };
}
function status({ legacy, storage: suppliedStorage, initialSession = null, withoutEngine = false } = {}) {
  let session = initialSession && clone(initialSession);
  const storage = suppliedStorage || new Map([['vildaCurrentPatientId', PID]]);
  if (legacy) storage.set('vilda-save-ref-v1', JSON.stringify({ fp: JSON.stringify({ core: MAIN, clcr: legacy }), dirty: true }));
  const win = { setTimeout, clearTimeout, setInterval, clearInterval, addEventListener() {}, console: { debug() {} },
    document: { readyState: 'complete', addEventListener() {}, getElementById: () => null },
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
    VildaVault: { isUnlocked: () => true, onPatientSaved() {} }, VildaDataImportExport: { getApplyLoadedDataSequence: () => 1 },
    VildaPersistence: { readMainSession: () => clone(MAIN), readClcrSession: () => session && clone(session) },
    collectUserData: () => clone(MAIN), hasMeaningfulMainSessionData: value => Boolean(value?.name) };
  if (!withoutEngine) for (const file of ['clcr_urate_creatinine_data.js', 'clcr_urate_creatinine.js']) loadBrowserScript(file, win);
  loadBrowserScript('vilda_save_status_indicator.js', win);
  const indicator = win.VildaSaveStatusIndicator;
  if (!legacy && !suppliedStorage) indicator._onPatientLoaded({ patientId: PID, applySequence: 1, name: MAIN.name });
  vi.advanceTimersByTime(150);
  return { indicator, storage, session: () => session && clone(session),
    compare(value) { session = value && clone(value); indicator.notifyExternalChange(); vi.advanceTimersByTime(400); } };
}
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('patient chip — KM/Cr measurement meaning and blank UI defaults', () => {
  it('the actual mounted blank controls are equivalent to no renal session', () => {
    const runtime = collector(), captured = runtime.capture(), env = status();
    expect(captured.inputs).toMatchObject({ URCR_inputMode: 'concentration', URCR_uricAcid: '', URCR_creatinine: '', URCR_specimen: 'random' });
    const reference = env.indicator.getReferenceFingerprint(); env.compare(captured);
    expect(env.indicator.getState()).toBe('saved');
    expect(env.indicator._computeCanonicalFingerprint()).toBe(reference);
    expect(env.session()).toEqual(captured);
  });

  it.each([['URCR_inputMode', 'reported'], ['URCR_uricAcidUnit', 'mmol/L'], ['URCR_creatinineUnit', 'µmol/L'],
    ['URCR_reportedUnit', 'mg/g'], ['URCR_specimen', 'timed'], ['URCR_specimen', 'unknown']])('blank-form configuration %s=%s is UI state, not a patient edit', (field, value) => {
    const runtime = collector(), env = status(); runtime.set(field, value); runtime.set('formulaPicker', 'KM_Cr');
    const captured = runtime.capture(); env.compare(captured);
    expect(env.indicator.getState()).toBe('saved'); expect(env.session()).toEqual(captured);
  });

  it.each([['URCR_uricAcid', '100'], ['URCR_uricAcid', '0'], ['URCR_uricAcid', '-1'],
    ['URCR_creatinine', '100'], ['URCR_creatinine', '0'], ['URCR_reportedValue', '0'],
    ['URCR_reportedValue', '0.00000000001']])('actual %s=%s stays meaningful even when invalid or exactly zero', (field, value) => {
    const runtime = collector(), env = status(); runtime.set(field, value);
    const captured = runtime.capture(); env.compare(captured);
    expect(env.indicator.getState()).toBe('dirty'); expect(env.session()).toEqual(captured);
  });

  it.each([['URCR_uricAcidUnit', 'mmol/L'], ['URCR_creatinineUnit', 'µmol/L'], ['URCR_specimen', 'timed'],
    ['URCR_specimen', 'unknown'], ['URCR_inputMode', 'reported'], ['URCR_outputUnit', 'mg/mg']])('a populated measurement retains changed %s=%s in its comparison', (field, value) => {
    const runtime = collector(); runtime.set('URCR_uricAcid', '100'); runtime.set('URCR_creatinine', '100');
    const original = runtime.capture(), env = status({ legacy: original }); runtime.set(field, value); env.compare(runtime.capture());
    expect(env.indicator.getState()).toBe('dirty');
  });

  it('a reported ratio retains its declared unit rather than losing it to the generic Unit suffix cleanup', () => {
    const runtime = collector(); runtime.set('URCR_inputMode', 'reported'); runtime.set('URCR_reportedValue', '1');
    const env = status({ legacy: runtime.capture() }); runtime.set('URCR_reportedUnit', 'mg/mg'); env.compare(runtime.capture());
    expect(env.indicator.getState()).toBe('dirty');
    expect(JSON.parse(env.indicator._computeCanonicalFingerprint()).clcr.inputs.URCR_unitSemantics).toMatchObject({ reportedValue: 'mg/mg' });
  });

  it('the unit of an empty inactive value is presentation only', () => {
    const runtime = collector(); runtime.set('URCR_uricAcid', '100'); runtime.set('URCR_creatinine', '100');
    const env = status({ legacy: runtime.capture() }); runtime.set('URCR_reportedUnit', 'mg/g'); env.compare(runtime.capture());
    expect(env.indicator.getState()).toBe('saved');
  });

  it('the saved-patient comparison remains stable across reload with exact declared units and material', () => {
    const runtime = collector(); runtime.set('URCR_uricAcid', '100.00000000000000001'); runtime.set('URCR_creatinine', '100'); runtime.set('URCR_specimen', 'timed');
    const captured = runtime.capture(), env = status({ legacy: captured }); env.compare(captured);
    expect(env.indicator.getState()).toBe('saved');
    const reloaded = status({ storage: env.storage, initialSession: captured }); reloaded.compare(captured);
    expect(reloaded.indicator.getState()).toBe('saved');
    runtime.set('URCR_uricAcid', '100.00000000000000002'); reloaded.compare(runtime.capture());
    expect(reloaded.indicator.getState()).toBe('dirty');
  });

  it('genuine legacy migration creates no patient edit and keeps source concentrations in the captured session', () => {
    const legacy = { selectedFormula: 'KM_Cr', inputs: { U_UA: '100', Ucr: '100' } }, original = clone(legacy), runtime = collector();
    expect(runtime.api.applyClcrSessionSnapshot(legacy, { update: false, preserveAcrossVersions: true })).toBe(true);
    const captured = runtime.capture();
    expect(captured.inputs).toMatchObject({ URCR_uricAcid: '100', URCR_creatinine: '100', URCR_specimen: 'unknown', U_UA: '100', Ucr: '100' });
    expect(captured.inputs.URCR_legacyAliases).toBe('{"U_UA":"100","Ucr":"100"}');
    const env = status({ legacy }); env.compare(captured);
    expect(env.indicator.getState()).toBe('saved'); expect(legacy).toEqual(original); expect(env.session()).toEqual(captured);
  });

  it('the absence of an optional engine does not erase values, declared units or specimen changes', () => {
    const runtime = collector(), env = status({ withoutEngine: true }); env.compare(runtime.capture());
    expect(env.indicator.getState()).toBe('saved');
    runtime.set('URCR_reportedValue', '1'); env.compare(runtime.capture()); expect(env.indicator.getState()).toBe('dirty');
    const original = runtime.capture(), baseline = status({ legacy: original, withoutEngine: true }); runtime.set('URCR_reportedUnit', 'mg/g'); baseline.compare(runtime.capture());
    expect(baseline.indicator.getState()).toBe('dirty');
  });

  it('explicit false same-sample evidence is retained and is distinct from omitted or true evidence', () => {
    const runtime = collector(); const initial = runtime.capture();
    initial.inputs.URCR_sameUrineSample = false;
    const env = status({ legacy: initial }); env.compare(initial); expect(env.indicator.getState()).toBe('saved');
    const changed = clone(initial); changed.inputs.URCR_sameUrineSample = true; env.compare(changed);
    expect(env.indicator.getState()).toBe('dirty');
    expect(JSON.parse(env.indicator._computeCanonicalFingerprint()).clcr.inputs.URCR_sampleMatchMeaning).toBe('true');
  });

  it('derived validated alias provenance alone does not create a patient edit', () => {
    const runtime = collector(); runtime.set('URCR_uricAcid', '100'); runtime.set('URCR_creatinine', '100');
    const captured = runtime.capture(), env = status({ legacy: captured });
    captured.inputs.URCR_legacyAliases = '{"U_UA":"100","Ucr":"100"}'; env.compare(captured);
    expect(env.indicator.getState()).toBe('saved');
  });

  it.each(['not-json', '{"unknown":"100"}', '{"U_UA":{"value":"100"}}'])('malformed alias provenance %s is not silently normalized away', marker => {
    const runtime = collector(), env = status(), captured = runtime.capture(); captured.inputs.URCR_legacyAliases = marker; env.compare(captured);
    expect(env.indicator.getState()).toBe('dirty');
  });

  it('does not interpret another calculation shared U_UA/Ucr as a KM/Cr value or normalize its input away', () => {
    const env = status(), current = collector().capture(); current.selectedFormula = 'UA_mgkg'; current.inputs.formulaPicker = 'UA_mgkg'; current.inputs.U_UA = '100'; current.inputs.Ucr = '100';
    env.compare(current); expect(env.indicator.getState()).toBe('dirty');
    const inputs = JSON.parse(env.indicator._computeCanonicalFingerprint()).clcr.inputs;
    expect(inputs).toMatchObject({ U_UA: '100', Ucr: '100' }); expect(inputs).not.toHaveProperty('URCR_uricAcid');
  });
});
