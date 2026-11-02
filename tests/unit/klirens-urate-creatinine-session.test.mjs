import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { patchUrateCreatinineSessionHooks, urateCreatinineSessionSource } from '../../tools/patch-klirens-urate-creatinine-session.mjs';

const source = readFileSync(new URL('../../inline_kalkulator_klirens_07.js', import.meta.url), 'utf8');
const defaults = { URCR_inputMode: 'concentration', URCR_uricAcid: '', URCR_uricAcidUnit: 'mg/dL',
  URCR_creatinine: '', URCR_creatinineUnit: 'mg/dL', URCR_reportedValue: '', URCR_reportedUnit: 'mmol/mmol',
  URCR_specimen: 'random', URCR_outputUnit: 'mmol/mmol' };
const clone = value => structuredClone(value);
function target(object = {}) {
  const listeners = new Map();
  return Object.assign(object, {
    addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(listener); },
    dispatchEvent(event) { for (const listener of listeners.get(event.type) || []) listener(event); },
  });
}
// The complete production session runtime is executed. Only DOM controls,
// browser events and storage are replaced; no normalizer is copied into tests.
function runtime(initial = {}, options = {}) {
  const controls = {}, storage = new Map(), timers = [];
  let document, materializations = 0;
  const add = (id, value) => (controls[id] = target({ id, ownerDocument: document, type: typeof value === 'boolean' ? 'checkbox' : 'text', checked: value === true,
    tagName: id === 'formulaPicker' || /Unit$/.test(id) || id === 'URCR_specimen' ? 'SELECT' : 'INPUT', value: String(value) }));
  const values = { formulaPicker: 'KM_Cr', age: '10', ageMonths: '0', ageDays: '', sex: 'F', weight: '30', height: '140',
    ...defaults, URCR_uricAcid: '40', URCR_creatinine: '100', U_UA: '90', Ucr: '30', U_Na: '20', ...initial };
  for (const [id, value] of Object.entries(values)) if (!(options.omitDedicated && id.startsWith('URCR_'))) add(id, value);
  const form = target({ querySelectorAll: () => Object.values(controls) }), clearBtn = target({ id: 'clearBtn', type: 'button' });
  document = target({ readyState: 'loading', getElementById: id => id === 'clcrForm' ? form : id === 'clearBtn' ? clearBtn : controls[id] || null,
    querySelector: () => null });
  for (const control of Object.values(controls)) control.ownerDocument = document;
  const window = target({ document, currentVersion: 'advanced',
    setVersion(value) { window.currentVersion = value; },
    ClcrUrateCreatinineUi: { ensureControls() { materializations += 1; for (const [id, value] of Object.entries(defaults)) if (!controls[id]) add(id, value); } },
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
  });
  document.defaultView = window;
  const context = vm.createContext({ window, document, Date, setTimeout: callback => { timers.push(callback); return timers.length; }, clearTimeout() {} });
  for (const file of ['clcr_collection_duration.js', 'clcr_urate_creatinine_data.js', 'clcr_urate_creatinine.js']) {
    vm.runInContext(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'), context, { filename: file });
  }
  vm.runInContext(source, context, { filename: 'inline_kalkulator_klirens_07.js' });
  return { api: window, controls, document, form, context, storage, clearBtn, timers, materializations: () => materializations };
}
function restore(session, initial, options) {
  const result = runtime(initial, options), original = clone(session);
  expect(result.api.applyClcrSessionSnapshot(session, { update: false, preserveAcrossVersions: true })).toBe(true);
  expect(session).toEqual(original);
  return result;
}
const captured = result => result.api.buildClcrSessionSnapshot().inputs;
const calculation = result => result.api.VildaClcrUrateCreatinine.compute(result.api.VildaClcrUrateCreatinine.inputFromValues(captured(result)), result.api.ClcrUrateCreatinineReferenceData.DATA);

async function savedGuard(session) {
  const result = restore(session);
  result.controls.U_Na.value = '';
  for (const control of Object.values(result.controls)) {
    if (control.tagName === 'SELECT') control.type = 'select-one';
    else if (['URCR_inputMode', 'URCR_outputUnit'].includes(control.id)) control.type = 'hidden';
    else if (control.type !== 'checkbox') control.type = 'number';
  }
  result.form.querySelectorAll = selector => selector === 'input, select, textarea' ? Object.values(result.controls)
    : Object.values(result.controls).filter(control => control.tagName === 'INPUT' && ['text', 'number'].includes(control.type));
  result.document.querySelectorAll = () => [];
  const locked = {}; loadBrowserScript('vilda_vault.js', locked);
  const notes = [], writes = [];
  const patientId = 'fictional-kmcr-migrated-alias-guard';
  result.api.VildaVault = {
    isUnlocked: () => true, getCurrentUser: () => ({ userId: 'fictional-kmcr-account' }),
    getPatient: async id => ({ id, patientId: id, name: 'Fikcyjny Pacjent KM/Cr' }), getPatientNote: async id => notes.find(note => note.id === id),
    savePatientNoteOnce: async payload => { writes.push(payload); notes.push({ ...payload, rev: 1,
      body: locked.VildaVault.sanitizeNoteText(payload.body), labResult: locked.VildaVault.sanitizeLabResult(payload.labResult) }); return { id: payload.id, saved: true }; },
    sanitizeNoteText: locked.VildaVault.sanitizeNoteText, sanitizeLabResult: locked.VildaVault.sanitizeLabResult,
  };
  for (const file of ['clcr_urate_creatinine_persistence.js', 'clcr_saved_calculation.js', 'clcr_saved_results.js', 'clcr_ui_workflow.js']) {
    vm.runInContext(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'), result.context, { filename: file });
  }
  const ids = [...Object.keys(defaults), 'age', 'ageMonths', 'ageDays', 'sex', 'weight', 'height'];
  const historical = new Set(['age', 'ageMonths', 'ageDays', 'sex', 'weight', 'height']);
  const fields = ids.map(id => ({ id, label: id, type: result.controls[id]?.type === 'number' ? 'number' : 'select', historicalContext: historical.has(id) }));
  result.api.ClcrUiWorkflow = { state: { activeFormulaId: 'KM_Cr' }, getCalculationFieldSpec: () => ({ formulaId: 'KM_Cr', fieldIds: ids, fields }) };
  const workflow = result.api.ClcrVisitSave; workflow._setPatientId(patientId);
  const model = calculation(result); expect(model.valid).toBe(true);
  const dp = { id: 'KM_Cr', sourceFormulaId: 'KM_Cr', label: 'Kwas moczowy/kreatynina' };
  result.api.ClcrUrateCreatininePersistence.augmentDatapoint({ getAttribute: key => key === 'data-clcr-urate-creatinine-snapshot' ? JSON.stringify(model) : null }, dp);
  dp.capture = workflow.captureCalculationFields('KM_Cr', { root: result.document });
  const saved = await workflow.saveActiveResultToCard({ clinicalDateISO: workflow.todayISO(), datapoints: [dp] });
  expect(saved.ok).toBe(true); expect(writes).toHaveLength(1); expect(locked.VildaVault.isUnlocked()).toBe(false);
  return { ...result, workflow, saved };
}

describe('KM/Cr — complete shipped session boundary', () => {
  it('mounts only its own blank new defaults before capture and does not use shared concentrations', () => {
    const result = runtime({ formulaPicker: 'FEK_spot' }, { omitDedicated: true });
    expect(captured(result)).toMatchObject(defaults);
    expect(result.api.ClcrUrateCreatinineSession.DEFAULTS).toMatchObject(defaults);
    expect(result.materializations()).toBeGreaterThan(0);
    result.controls.formulaPicker.value = 'KM_Cr';
    expect(captured(result)).toMatchObject({ ...defaults, U_UA: '90', Ucr: '30' });
    expect(result.api.ClcrUrateCreatinineSession.legacyAliasValues()).toEqual({});
  });

  it.each(['KM_Cr', 'ACR', 'FENa_spot'])('a new restored %s clears the previous dedicated sample', selectedFormula => {
    const result = restore({ selectedFormula, inputs: { age: '12' } });
    expect(captured(result)).toMatchObject(defaults);
  });

  it.each(['UA_mgkg', 'ACR', 'FEK_spot'])('restored %s does not migrate its shared U_UA/Ucr when KM/Cr is later selected', selectedFormula => {
    const result = restore({ selectedFormula, inputs: { U_UA: '80', Ucr: '120' } });
    result.controls.formulaPicker.value = 'KM_Cr';
    expect(captured(result)).toMatchObject({ ...defaults, U_UA: '80', Ucr: '120' });
    expect(calculation(result).valid).toBe(false);
    expect(result.api.ClcrUrateCreatinineSession.legacyAliasValues()).toEqual({});
  });

  it.each(['advanced', 'pro', 'spot'])('genuine legacy KM/Cr restored from %s migrates to spot with unknown specimen', currentVersion => {
    const result = restore({ currentVersion, selectedFormula: 'KM_Cr', inputs: { U_UA: '100.000', Ucr: '100', age: '40' } });
    expect(captured(result)).toMatchObject({ URCR_uricAcid: '100.000', URCR_creatinine: '100', URCR_uricAcidUnit: 'mg/dL',
      URCR_creatinineUnit: 'mg/dL', URCR_specimen: 'unknown', currentVersion: 'spot', U_UA: '100.000', Ucr: '100' });
    expect(result.api.currentVersion).toBe('spot');
    expect(calculation(result)).toMatchObject({ valid: true, outOfRange: null, referenceAvailable: false });
    expect(result.api.ClcrUrateCreatinineSession.legacyAliasValues()).toEqual({ U_UA: '100.000', Ucr: '100' });
  });

  it('restores a preserved-only legacy record without mutating it or discarding its source values', () => {
    const result = restore({ preservedInputs: { formulaPicker: 'KM_Cr', U_UA: '80', Ucr: '100', age: '10' } });
    expect(captured(result)).toMatchObject({ URCR_uricAcid: '80', URCR_creatinine: '100', URCR_specimen: 'unknown', U_UA: '80', Ucr: '100' });
    expect(result.api.currentVersion).toBe('spot');
  });

  it.each([['random', 'random'], ['spot', 'random'], ['timed', 'timed'], ['24h', 'timed'], ['unknown', 'unknown']])('preserves explicit legacy source material %s as %s', (specimen, expected) => {
    const result = restore({ selectedFormula: 'KM_Cr', inputs: { U_UA: '100', Ucr: '100' }, context: { specimen } });
    expect(captured(result).URCR_specimen).toBe(expected);
  });

  it('does not mistake a shared generic sample selector or DZM menu label for evidence of a random specimen', () => {
    const result = restore({ selectedFormula: 'KM_Cr', inputs: { U_UA: '100', Ucr: '100', specimen: 'random', sampleType: 'random' }, label: 'Kwas moczowy/kreatynina (DZM)' });
    expect(captured(result).URCR_specimen).toBe('unknown');
  });

  it.each(['', 'invalid'])('an explicitly empty or invalid material %j is unknown, not the new random default', specimen => {
    const result = restore({ selectedFormula: 'KM_Cr', inputs: { URCR_uricAcid: '100', URCR_creatinine: '100', URCR_specimen: specimen } });
    expect(captured(result).URCR_specimen).toBe('unknown');
    expect(calculation(result).referenceAvailable).toBe(false);
  });

  it('restored dedicated concentrations without material remain historical unknown even under another formula', () => {
    const result = restore({ selectedFormula: 'ACR', inputs: { URCR_uricAcid: '100', URCR_creatinine: '100' }, context: { specimen: 'random' } });
    expect(captured(result).URCR_specimen).toBe('unknown');
    result.controls.formulaPicker.value = 'KM_Cr';
    expect(calculation(result).referenceAvailable).toBe(false);
  });

  it.each(['random', 'timed', 'unknown'])('new typed %s sample roundtrips exact values and declared units', specimen => {
    const input = { ...defaults, URCR_inputMode: 'reported', URCR_reportedValue: '0.5300000000000000000001', URCR_reportedUnit: 'mmol/mmol', URCR_specimen: specimen,
      URCR_uricAcid: '00100,00000000000000001', URCR_uricAcidUnit: 'mg/L', URCR_creatinine: '1000', URCR_creatinineUnit: 'µmol/L', age: '40', ageMonths: '2', ageDays: '3' };
    const result = restore({ selectedFormula: 'KM_Cr', inputs: input });
    expect(captured(result)).toMatchObject(input);
    const again = restore(result.api.buildClcrSessionSnapshot());
    expect(captured(again)).toMatchObject(input);
  });

  it('restores exact zero as data and leaves the old sample unqualified', () => {
    const result = restore({ selectedFormula: 'KM_Cr', inputs: { U_UA: 0, Ucr: 100 } });
    expect(captured(result)).toMatchObject({ URCR_uricAcid: '0', URCR_creatinine: '100', URCR_specimen: 'unknown' });
    expect(calculation(result)).toMatchObject({ valid: true, rawValue: 0, outOfRange: null });
  });

  it('does not sanitize a negative historical concentration into an apparently valid positive measurement', () => {
    const result = restore({ selectedFormula: 'KM_Cr', inputs: { U_UA: '-20.0', Ucr: '-100' } });
    expect(captured(result)).toMatchObject({ URCR_uricAcid: '-20.0', URCR_creatinine: '-100', URCR_specimen: 'unknown' });
    expect(calculation(result).valid).toBe(false);
  });

  it('preserves known false matching evidence ahead of a conflicting restored true and never adds a question', () => {
    const result = restore({ selectedFormula: 'KM_Cr', inputs: { ...defaults, URCR_uricAcid: '100', URCR_creatinine: '100', URCR_sameUrineSample: true },
      context: { knownFacts: { sameUrineSample: false } } });
    expect(captured(result).URCR_sameUrineSample).toBe(false);
    expect(result.controls.URCR_sameUrineSample).toBeUndefined();
    expect(calculation(result).valid).toBe(false);
  });

  it('unrelated sample facts do not transfer from another calculation', () => {
    const result = restore({ selectedFormula: 'ACR', inputs: { ...defaults, URCR_uricAcid: '100', URCR_creatinine: '100' }, context: { knownFacts: { sameUrineSample: false } } });
    expect(captured(result)).not.toHaveProperty('URCR_sameUrineSample');
  });

  it('capture/read-only capture retain migrated alias provenance but do not infer it from coincident new values', () => {
    const result = restore({ selectedFormula: 'KM_Cr', inputs: { U_UA: '100', Ucr: '100' } });
    const snapshot = result.api.buildClcrSessionSnapshot(), again = restore(snapshot);
    expect(again.api.ClcrUrateCreatinineSession.legacyAliasValues()).toEqual({ U_UA: '100', Ucr: '100' });
    again.controls.URCR_uricAcid.value = '60';
    expect(again.api.ClcrUrateCreatinineSession.legacyAliasValues()).toEqual({ U_UA: '100', Ucr: '100' });
    again.controls.formulaPicker.value = 'UA_mgkg';
    expect(again.api.ClcrUrateCreatinineSession.legacyAliasValues()).toEqual({});
    const fresh = restore({ selectedFormula: 'KM_Cr', inputs: { ...defaults, URCR_uricAcid: '100', URCR_creatinine: '100', U_UA: '100', Ucr: '100' } });
    expect(fresh.api.ClcrUrateCreatinineSession.legacyAliasValues()).toEqual({});
  });

  it.each(['not-json', '{"U_UA":"100","arbitrary":"100"}', '{"U_UA":{"value":"100"}}'])('malformed alias metadata %s cannot suppress a measurement', metadata => {
    const result = restore({ selectedFormula: 'KM_Cr', inputs: { ...defaults, URCR_uricAcid: '100', URCR_creatinine: '100', URCR_legacyAliases: metadata } });
    expect(result.api.ClcrUrateCreatinineSession.legacyAliasValues()).toEqual({});
    expect(captured(result).URCR_legacyAliases).toBe(metadata);
  });

  it('the actual post-save measurement guard covers migrated aliases only while their captured raw source still matches', async () => {
    const result = await savedGuard({ selectedFormula: 'KM_Cr', inputs: { U_UA: '100', Ucr: '100', age: '40' } });
    expect(result.workflow.hasUnsavedMeasurement()).toBe(false);
    result.controls.U_UA.value = '101';
    expect(result.workflow.hasUnsavedMeasurement()).toBe(true);
    result.controls.U_UA.value = '100';
    expect(result.workflow.hasUnsavedMeasurement()).toBe(false);
    result.api.__vildaClcrVersionValueVault.URCR_legacyAliases = '{"unrecognized":"100"}';
    expect(result.workflow.hasUnsavedMeasurement()).toBe(true);
  });

  it('the actual post-save guard does not suppress a different unsaved source merely because its value equals the typed KM/Cr input', async () => {
    const result = await savedGuard({ selectedFormula: 'KM_Cr', inputs: { ...defaults, URCR_uricAcid: '100', URCR_creatinine: '100', U_UA: '100', Ucr: '100', age: '40' } });
    expect(result.api.ClcrUrateCreatinineSession.legacyAliasValues()).toEqual({});
    expect(result.workflow.hasUnsavedMeasurement()).toBe(true);
  });

  it('read-only capture neither mounts controls, changes the vault, nor changes restoration flags', () => {
    const result = restore({ selectedFormula: 'KM_Cr', inputs: { ...defaults, URCR_uricAcid: '100', URCR_creatinine: '100', URCR_specimen: 'timed' } });
    const count = result.materializations(), vault = clone(result.api.__vildaClcrVersionValueVault), preserve = result.api.__vildaClcrPreserveVersionValues;
    const read = result.api.VildaClcrSessionRuntime.captureCurrentSessionReadOnly();
    expect(read.inputs).toMatchObject({ URCR_uricAcid: '100', URCR_creatinine: '100', URCR_specimen: 'timed' });
    expect(result.materializations()).toBe(count);
    expect(result.api.__vildaClcrVersionValueVault).toEqual(vault);
    expect(result.api.__vildaClcrPreserveVersionValues).toBe(preserve);
  });

  it('clear keeps only patient context and starts a new blank random specimen without old sample-match facts', () => {
    const result = restore({ selectedFormula: 'KM_Cr', inputs: { U_UA: '100', Ucr: '100', age: '10', ageMonths: '2', weight: '30', height: '140', URCR_sameUrineSample: false, newbornContext: true } }, { newbornContext: true });
    result.document.dispatchEvent({ type: 'DOMContentLoaded' });
    result.clearBtn.dispatchEvent({ type: 'click', clcrClearedFormula: 'KM_Cr', clcrPreservedUrateCreatinineContext: { age: '10', ageMonths: '2', weight: '30', height: '140',
      URCR_uricAcid: '100', URCR_specimen: 'unknown', URCR_sameUrineSample: false, newbornContext: true, arbitrary: 'unsafe' } });
    expect(captured(result)).toMatchObject({ ...defaults, age: '10', ageMonths: '2', weight: '30', height: '140', newbornContext: true });
    expect(captured(result)).not.toHaveProperty('URCR_sameUrineSample');
    expect(captured(result)).not.toHaveProperty('URCR_legacyAliases');
    expect(result.api.ClcrUrateCreatinineSession.legacyAliasValues()).toEqual({});
    expect(result.api.__vildaClcrVersionValueVault).not.toHaveProperty('arbitrary');
  });

  it('external patient load without a renal session drops the previous sample and migration provenance', () => {
    const result = restore({ selectedFormula: 'KM_Cr', inputs: { U_UA: '100', Ucr: '100' } });
    expect(result.api.__vildaClcrRehydrate()).toBe(true);
    expect(captured(result)).toMatchObject(defaults);
    expect(result.api.ClcrUrateCreatinineSession.legacyAliasValues()).toEqual({});
  });

  it('reproduces the shipped adapter and capture hook exactly from readable source', () => {
    expect(patchUrateCreatinineSessionHooks(source)).toBe(source);
    const preceding = source.replace(urateCreatinineSessionSource, '').replace('try{window.ClcrUrateCreatinineUi?.ensureControls?.(document)}catch{}', '');
    expect(patchUrateCreatinineSessionHooks(preceding)).toBe(source);
    expect(() => patchUrateCreatinineSessionHooks(preceding.replace('(function(){const b="vildaClcrSessionV1";', ''))).toThrow('Ambiguous urate/creatinine session integration anchor');
  });
});
