import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../inline_kalkulator_klirens_07.js', import.meta.url), 'utf8');
const defaults = { BCR_inputMode: 'concentration', BCR_protein: '', BCR_proteinUnit: 'mg/L',
  BCR_creatinine: '', BCR_creatinineUnit: 'mg/dL', BCR_reportedValue: '', BCR_reportedUnit: 'mg/mg',
  BCR_sameSpecimen: 'assumed', BCR_collectionProblem: '', BCR_collectionHours: '', BCR_durationKnown: '' };
function target(object = {}) {
  const listeners = new Map();
  return Object.assign(object, {
    addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(listener); },
    dispatchEvent(event) { for (const listener of listeners.get(event.type) || []) listener(event); },
  });
}
// Execute the complete shipped session boundary. Only browser controls/events
// and storage are mocked; no production normalizer is copied into this test.
function runtime(initial = {}, options = {}) {
  const controls = {}, storage = new Map(), timers = [];
  let document, mounts = 0;
  const add = (id, value) => (controls[id] = target({ id, ownerDocument: document, type: typeof value === 'boolean' ? 'checkbox' : 'text',
    checked: value === true, tagName: id === 'formulaPicker' || /Unit$/.test(id) ? 'SELECT' : 'INPUT', value: String(value) }));
  const values = { formulaPicker: 'B_Cr', age: '8', ageMonths: '0', ageDays: '', sex: 'M', weight: '25', height: '130', ...defaults,
    BCR_protein: '5', BCR_creatinine: '100', U_Prot: '450', V24: '1500', Ucr: '30', Ca_spot: '90', Ca_spot_unit: 'mg/dl',
    Ucr_spot: '200', Ucr_spot_unit: 'mg/dl', CaCr_reported: '', CaCr_reported_unit: 'mg/mg', CaCr_entry_mode: 'concentration', ...initial };
  for (const [id, value] of Object.entries(values)) if (!(options.omitDedicated && id.startsWith('BCR_'))) add(id, value);
  const form = target({ querySelectorAll: () => Object.values(controls) }), clearBtn = target({ id: 'clearBtn', type: 'button' });
  document = target({ readyState: 'loading', getElementById: id => id === 'clcrForm' ? form : id === 'clearBtn' ? clearBtn : controls[id] || null,
    querySelector: () => null });
  for (const control of Object.values(controls)) control.ownerDocument = document;
  const window = target({ document, currentVersion: 'advanced', setVersion(value) { window.currentVersion = value; },
    ClcrProteinCreatinineUi: options.noUi ? undefined : { ensureControls() { mounts += 1; for (const [id, value] of Object.entries(defaults)) if (!controls[id]) add(id, value); } },
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
  });
  document.defaultView = window;
  const context = vm.createContext({ window, document, Date, setTimeout: callback => { timers.push(callback); return timers.length; }, clearTimeout() {} });
  for (const file of ['clcr_collection_duration.js', 'clcr_protein_creatinine_data.js', 'clcr_protein_creatinine.js']) {
    vm.runInContext(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'), context, { filename: file });
  }
  vm.runInContext(source, context, { filename: 'inline_kalkulator_klirens_07.js' });
  return { api: window, controls, document, form, context, clearBtn, mounts: () => mounts };
}
function restore(session, initial, options) {
  const result = runtime(initial, options), original = structuredClone(session);
  expect(result.api.applyClcrSessionSnapshot(session, { update: false, preserveAcrossVersions: true })).toBe(true);
  expect(session).toEqual(original);
  return result;
}
const captured = result => result.api.buildClcrSessionSnapshot().inputs;

describe('B/Cr DZM — complete production session boundary', () => {
  it('new formula selection materializes blank dedicated fields without importing shared mass or spot concentrations', () => {
    const result = runtime({ formulaPicker: 'CaCr_spot' }, { omitDedicated: true });
    expect(captured(result)).toMatchObject(defaults);
    result.controls.formulaPicker.value = 'B_Cr';
    expect(captured(result)).toMatchObject({ ...defaults, U_Prot: '450', V24: '1500', Ucr: '30' });
    expect(result.api.ClcrProteinCreatinineSession.legacyAliasValues()).toEqual({});
    expect(result.mounts()).toBeGreaterThan(0);
  });

  it.each(['B_Cr', 'Prot_mgkg', 'PCR', 'ACR', 'Ca_Cr'])('sparse patient session %s removes the previous B/Cr values and facts', selectedFormula => {
    const result = restore({ selectedFormula, inputs: { age: '12' } });
    expect(captured(result)).toMatchObject(defaults);
  });

  it.each(['Prot_mgkg', 'PCR', 'ACR', 'Ca_Cr'])('does not migrate another formula %s shared operands or sample facts', selectedFormula => {
    const result = restore({ selectedFormula, inputs: { U_Prot: '450', V24: '1500', Ucr: '100', Cl24CollectionProblem: true,
      Cl24DurationHours: '25', spotSameSpecimen: false }, context: { sameSpecimen: 'different', collectionProblem: true } });
    result.controls.formulaPicker.value = 'B_Cr';
    expect(captured(result)).toMatchObject(defaults);
    expect(result.api.ClcrProteinCreatinineSession.legacyAliasValues()).toEqual({});
  });

  it('preserves legacy whole-collection MASS, volume and creatinine exactly instead of rounding to a concentration', () => {
    const values = { U_Prot: '000450,000000000000001', V24: '1700.000', Ucr: '100.00', age: '8' };
    const result = restore({ selectedFormula: 'B_Cr', inputs: values });
    expect(captured(result)).toMatchObject({ ...defaults, ...values, BCR_inputMode: 'legacy' });
    for (const id of ['U_Prot', 'V24', 'Ucr']) expect(result.controls[id].type).toBe('text');
    expect(result.api.ClcrProteinCreatinineSession.legacyAliasValues()).toEqual({ U_Prot: values.U_Prot, V24: values.V24, Ucr: values.Ucr });
    expect(captured(restore(result.api.buildClcrSessionSnapshot()))).toMatchObject({ ...values, BCR_inputMode: 'legacy' });
  });

  it('restores preserved-only legacy sessions without modifying the original object', () => {
    const result = restore({ preservedInputs: { formulaPicker: 'B_Cr', U_Prot: '450', V24: '1500', Ucr: '100' } });
    expect(captured(result)).toMatchObject({ BCR_inputMode: 'legacy', U_Prot: '450', V24: '1500', Ucr: '100' });
    expect(result.controls.formulaPicker.value).toBe('B_Cr');
  });

  it('the actual engine retains legacy mass meaning and current concentration meaning', () => {
    const legacy = restore({ selectedFormula: 'B_Cr', inputs: { U_Prot: '450', V24: '1500', Ucr: '100' } });
    const current = restore({ selectedFormula: 'B_Cr', inputs: { ...defaults, BCR_protein: '450', BCR_creatinine: '100' } });
    const engine = legacy.api.VildaClcrProteinCreatinine;
    expect(engine.evaluate(engine.inputFromValues(captured(legacy)), null)).toMatchObject({ valid: true, rawValue: 0.3, unit: 'mg/mg', mode: 'legacy' });
    expect(engine.evaluate(engine.inputFromValues(captured(current)), null)).toMatchObject({ valid: true, rawValue: 0.45, unit: 'mg/mg', mode: 'concentration' });
  });

  it.each([0, '-0.1', 'not-a-number'])('retains legacy invalid or zero mass %j without silently repairing it', value => {
    const result = restore({ selectedFormula: 'B_Cr', inputs: { U_Prot: value, V24: '1500', Ucr: '100' } });
    expect(captured(result)).toMatchObject({ BCR_inputMode: 'legacy', U_Prot: String(value) });
  });

  it('missing legacy volume stays missing rather than inheriting a prior patient volume', () => {
    const result = restore({ selectedFormula: 'B_Cr', inputs: { U_Prot: '450', Ucr: '100' } });
    expect(captured(result)).toMatchObject({ BCR_inputMode: 'legacy', V24: '' });
    const engine = result.api.VildaClcrProteinCreatinine;
    expect(engine.evaluate(engine.inputFromValues(captured(result)), null).valid).toBe(false);
  });

  it('a dedicated blank overrides preserved values and prevents migration from shared mass', () => {
    const result = restore({ selectedFormula: 'B_Cr', inputs: { BCR_protein: '', BCR_sameSpecimen: '', BCR_collectionProblem: '', BCR_collectionHours: '', BCR_durationKnown: '' },
      preservedInputs: { BCR_protein: '450', BCR_sameSpecimen: 'different', U_Prot: '450', V24: '1500', Ucr: '100' },
      context: { sameSpecimen: 'different', collectionProblem: true } });
    expect(captured(result)).toMatchObject({ ...defaults, BCR_sameSpecimen: '' });
    expect(result.api.ClcrProteinCreatinineSession.legacyAliasValues()).toEqual({});
  });

  it.each(['mg/mg', 'mg/g', 'mg/mmol'])('roundtrips exact direct operator in %s and the dormant concentration facts', unit => {
    const inputs = { ...defaults, BCR_inputMode: 'direct', BCR_reportedValue: '≥0,150000000000000000001', BCR_reportedUnit: unit,
      BCR_protein: '000450.00', BCR_proteinUnit: 'g/L', BCR_creatinine: '100.00', BCR_creatinineUnit: 'µmol/L',
      BCR_sameSpecimen: 'different', BCR_collectionProblem: 'true', BCR_collectionHours: '25.000001', BCR_durationKnown: 'false' };
    const result = restore({ selectedFormula: 'B_Cr', inputs });
    expect(captured(result)).toMatchObject(inputs);
    expect(captured(restore(result.api.buildClcrSessionSnapshot()))).toMatchObject(inputs);
  });

  it('canonicalizes only the supported mass ratio alias while retaining its source spelling', () => {
    const result = restore({ selectedFormula: 'B_Cr', inputs: { BCR_inputMode: 'direct', BCR_reportedValue: '0.3', BCR_reportedUnit: 'g/g' } });
    expect(captured(result)).toMatchObject({ BCR_reportedUnit: 'mg/mg', BCR_reportedUnitOriginal: 'g/g' });
    expect(captured(restore(result.api.buildClcrSessionSnapshot()))).toMatchObject({ BCR_reportedUnit: 'mg/mg', BCR_reportedUnitOriginal: 'g/g' });
  });

  it('retains owned context, but does not import an unrelated clock or spot specimen answer', () => {
    const result = restore({ selectedFormula: 'B_Cr', inputs: { U_Prot: '450', V24: '1500', Ucr: '100', Cl24DurationHours: '24', spotSameSpecimen: false },
      context: { sameSpecimen: 'different', collectionProblem: true, collectionHours: '25', durationKnown: false } });
    expect(captured(result)).toMatchObject({ BCR_sameSpecimen: 'different', BCR_collectionProblem: 'true', BCR_collectionHours: '25', BCR_durationKnown: 'false' });
  });

  it('only correctly typed timed snapshots provide context, even while another formula is selected', () => {
    const context = { sampleType: 'timed', sameSpecimen: 'different', collectionProblem: true, collectionHours: '25', durationKnown: false };
    const snapshot = { schema: 'clcr-protein-creatinine', version: 1, sourceFormula: 'B_Cr', context };
    expect(captured(restore({ selectedFormula: 'PCR', inputs: { BCR_protein: '450' }, proteinCreatinineSnapshot: snapshot })))
      .toMatchObject({ BCR_sameSpecimen: 'different', BCR_collectionProblem: 'true', BCR_collectionHours: '25', BCR_durationKnown: 'false' });
    for (const invalid of [{ ...snapshot, sourceFormula: 'PCR' }, { ...snapshot, version: 2 }, { ...snapshot, schema: 'other' }, { ...snapshot, context: { ...context, sampleType: 'random' } }]) {
      expect(captured(restore({ selectedFormula: 'B_Cr', inputs: {}, proteinCreatinineSnapshot: invalid }))).toMatchObject(defaults);
    }
  });

  it('direct result does not erase a concentration mismatch during restore or later return to concentration mode', () => {
    const result = restore({ selectedFormula: 'B_Cr', inputs: { ...defaults, BCR_inputMode: 'direct', BCR_reportedValue: '0.3', BCR_protein: '300', BCR_creatinine: '100' },
      proteinCreatinineSnapshot: { schema: 'clcr-protein-creatinine', version: 1, sourceFormula: 'B_Cr',
        context: { sampleType: 'timed', sameSpecimen: 'not-applicable', concentrationSameSpecimen: 'different' } } });
    // An explicit default in inputs is authoritative. A frozen historical
    // context supplies the fact only if that input key was not captured.
    const historical = result.api.buildClcrSessionSnapshot(); delete historical.inputs.BCR_sameSpecimen;
    historical.proteinCreatinineSnapshot = { schema: 'clcr-protein-creatinine', version: 1, sourceFormula: 'B_Cr', context: { sampleType: 'timed', concentrationSameSpecimen: 'different' } };
    delete historical.preservedInputs?.BCR_sameSpecimen;
    const again = restore(historical), engine = again.api.VildaClcrProteinCreatinine;
    expect(captured(again).BCR_sameSpecimen).toBe('different');
    expect(engine.evaluate(engine.inputFromValues(captured(again)), null).valid).toBe(true);
    again.controls.BCR_inputMode.value = 'concentration';
    expect(engine.evaluate(engine.inputFromValues(captured(again)), null)).toMatchObject({ valid: false, reasonCode: 'different-specimens' });
  });

  it('retains independent drafts and exact facts when controls temporarily disappear or another formula/version is active', () => {
    const inputs = { ...defaults, BCR_inputMode: 'direct', BCR_reportedValue: '≤0,150000000000000001', BCR_reportedUnit: 'mg/mmol',
      BCR_protein: '300.00', BCR_proteinUnit: 'mg/L', BCR_creatinine: '100', BCR_sameSpecimen: 'different' };
    const result = restore({ selectedFormula: 'B_Cr', inputs });
    result.api.clcrCaptureVersionValues({ force: true });
    for (const id of Object.keys(defaults)) delete result.controls[id];
    result.api.ClcrProteinCreatinineUi = undefined;
    result.controls.formulaPicker.value = 'ACR'; result.api.setVersion('basic');
    expect(captured(result)).toMatchObject(inputs);
    const absent = restore(result.api.buildClcrSessionSnapshot(), {}, { omitDedicated: true, noUi: true });
    expect(Object.keys(absent.controls).some(id => id.startsWith('BCR_'))).toBe(false);
    expect(captured(absent)).toMatchObject(inputs);
  });

  it.each([{ sourceFormula: 'PCR' }, { sourceFormulaId: 'ClCr24' }, { formulaId: 'ACR' }, { sampleType: 'random' }])('ignores foreign context %j', descriptor => {
    const result = restore({ selectedFormula: 'B_Cr', inputs: { U_Prot: '450', V24: '1500', Ucr: '100' }, context: { ...descriptor, sameSpecimen: 'different', collectionProblem: true } });
    expect(captured(result)).toMatchObject({ BCR_sameSpecimen: 'assumed', BCR_collectionProblem: '' });
  });

  it.each(['not-json', '{"U_Prot":"450","other":"100"}', '{"U_Prot":{"value":"450"}}'])('does not trust malformed migration provenance %s', metadata => {
    const result = restore({ selectedFormula: 'B_Cr', inputs: { ...defaults, BCR_legacyAliases: metadata } });
    expect(result.api.ClcrProteinCreatinineSession.legacyAliasValues()).toEqual({});
    expect(captured(result).BCR_legacyAliases).toBe(metadata);
  });

  it('read-only capture mutates neither mounted fields, migration provenance nor restoration flags', () => {
    const result = restore({ selectedFormula: 'B_Cr', inputs: { U_Prot: '450', V24: '1500', Ucr: '100' } });
    const mounts = result.mounts(), vault = structuredClone(result.api.__vildaClcrVersionValueVault), preserve = result.api.__vildaClcrPreserveVersionValues;
    expect(result.api.VildaClcrSessionRuntime.captureCurrentSessionReadOnly().inputs).toMatchObject({ BCR_inputMode: 'legacy', U_Prot: '450' });
    expect(result.mounts()).toBe(mounts); expect(result.api.__vildaClcrVersionValueVault).toEqual(vault); expect(result.api.__vildaClcrPreserveVersionValues).toBe(preserve);
  });

  it('clear discards old operands/provenance while retaining only allowed owned patient/sample context', () => {
    const result = restore({ selectedFormula: 'B_Cr', inputs: { U_Prot: '450', V24: '1500', Ucr: '100' } });
    result.document.dispatchEvent({ type: 'DOMContentLoaded' });
    result.clearBtn.dispatchEvent({ type: 'click', clcrClearedFormula: 'B_Cr', clcrPreservedProteinCreatinineContext: { age: '8', sex: 'M',
      BCR_protein: '300', BCR_reportedValue: '300', BCR_sameSpecimen: 'different', BCR_collectionProblem: true,
      BCR_collectionHours: '25', BCR_durationKnown: false, BCR_legacyAliases: '{"U_Prot":"450"}', arbitrary: 'unsafe' } });
    expect(captured(result)).toMatchObject({ ...defaults, age: '8', sex: 'M', BCR_sameSpecimen: 'different', BCR_collectionProblem: 'true', BCR_collectionHours: '25', BCR_durationKnown: 'false' });
    expect(captured(result)).not.toHaveProperty('BCR_legacyAliases');
    expect(result.api.ClcrProteinCreatinineSession.legacyAliasValues()).toEqual({});
    expect(result.api.__vildaClcrVersionValueVault).not.toHaveProperty('arbitrary');
  });

  it('loading a different patient without renal session clears old operands and provenance', () => {
    const result = restore({ selectedFormula: 'B_Cr', inputs: { ...defaults, BCR_protein: '300', BCR_creatinine: '100', BCR_collectionProblem: 'true', BCR_legacyAliases: '{"U_Prot":"450"}' } });
    expect(result.api.__vildaClcrRehydrate()).toBe(true);
    expect(captured(result)).toMatchObject(defaults);
    expect(captured(result)).not.toHaveProperty('BCR_legacyAliases');
  });
});
