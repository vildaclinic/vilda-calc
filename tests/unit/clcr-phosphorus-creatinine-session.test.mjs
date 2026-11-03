import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../inline_kalkulator_klirens_07.js', import.meta.url), 'utf8');
const defaults = { PICR_inputMode: 'concentration', PICR_phosphorus: '', PICR_phosphorusUnit: 'mmol/L',
  PICR_creatinine: '', PICR_creatinineUnit: 'mmol/L', PICR_reportedValue: '', PICR_reportedUnit: 'mg/mg',
  PICR_sameSpecimen: 'assumed', PICR_collectionProblem: '', PICR_collectionHours: '', PICR_durationKnown: '' };
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
  const values = { formulaPicker: 'PO4_Cr', age: '8', ageMonths: '0', ageDays: '', sex: 'M', weight: '25', height: '130', ...defaults,
    PICR_phosphorus: '5', PICR_creatinine: '100', U_PO4: '12', Ucr: '30', Ca_spot: '90', Ca_spot_unit: 'mg/dl',
    Ucr_spot: '200', Ucr_spot_unit: 'mg/dl', CaCr_reported: '', CaCr_reported_unit: 'mg/mg', CaCr_entry_mode: 'concentration', ...initial };
  for (const [id, value] of Object.entries(values)) if (!(options.omitDedicated && id.startsWith('PICR_'))) add(id, value);
  const form = target({ querySelectorAll: () => Object.values(controls) }), clearBtn = target({ id: 'clearBtn', type: 'button' });
  document = target({ readyState: 'loading', getElementById: id => id === 'clcrForm' ? form : id === 'clearBtn' ? clearBtn : controls[id] || null,
    querySelector: () => null });
  for (const control of Object.values(controls)) control.ownerDocument = document;
  const window = target({ document, currentVersion: 'advanced', setVersion(value) { window.currentVersion = value; },
    ClcrPhosphorusCreatinineUi: options.noUi ? undefined : { ensureControls() { mounts += 1; for (const [id, value] of Object.entries(defaults)) if (!controls[id]) add(id, value); } },
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
  });
  document.defaultView = window;
  const context = vm.createContext({ window, document, Date, setTimeout: callback => { timers.push(callback); return timers.length; }, clearTimeout() {} });
  for (const file of ['clcr_collection_duration.js', 'clcr_phosphorus_creatinine_data.js', 'clcr_phosphorus_creatinine.js']) {
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

describe('Pᵢ/Cr DZM — actual session boundary and sample ownership', () => {
  it('materializes an empty new form without copying the shared or spot operands on formula selection', () => {
    const result = runtime({ formulaPicker: 'CaCr_spot' }, { omitDedicated: true });
    expect(captured(result)).toMatchObject(defaults);
    expect(result.api.ClcrPhosphorusCreatinineSession.DEFAULTS).toEqual(defaults);
    expect(result.mounts()).toBeGreaterThan(0);
    result.controls.formulaPicker.value = 'PO4_Cr';
    expect(captured(result)).toMatchObject({ ...defaults, U_PO4: '12', Ucr: '30', Ca_spot: '90' });
    expect(result.api.ClcrPhosphorusCreatinineSession.legacyAliasValues()).toEqual({});
  });

  it.each(['PO4_Cr', 'Ca_Cr', 'PO4_mgkg', 'ClCr24', 'ACR'])('a sparse restored %s clears the previous dedicated sample', selectedFormula => {
    const result = restore({ selectedFormula, inputs: { age: '12' } });
    expect(captured(result)).toMatchObject(defaults);
  });

  it.each(['CaCr_spot', 'PO4_mgkg', 'Ca_Cr', 'ClCr24', 'ACR'])('does not migrate aliases from %s when DZM is subsequently selected', selectedFormula => {
    const result = restore({ selectedFormula, inputs: { U_PO4: '8', Ucr: '100', Ca_spot: '50', Ucr_spot: '200', Cl24DurationHours: '24',
      Cl24CollectionProblem: true, spotSameSpecimen: false, ui_spotSameSpecimen_answer: 'no' }, context: { collectionProblem: true, sameSpecimen: 'different', collectionHours: '26' } });
    result.controls.formulaPicker.value = 'PO4_Cr';
    expect(captured(result)).toMatchObject(defaults);
    expect(result.api.ClcrPhosphorusCreatinineSession.legacyAliasValues()).toEqual({});
  });

  it('migrates only an imported legacy PO4_Cr pair, preserving exact source text and leaving its historical clock unknown', () => {
    const result = restore({ selectedFormula: 'PO4_Cr', inputs: { U_PO4: '005,000000000000001', Ucr: '100.000', age: '8',
      Cl24DurationHours: '24', Cl24CollectionProblem: true, spotSameSpecimen: false, ui_spotSameSpecimen_answer: 'no' } });
    expect(captured(result)).toMatchObject({ PICR_phosphorus: '005,000000000000001', PICR_creatinine: '100.000',
      PICR_phosphorusUnit: 'mg P/dL', PICR_creatinineUnit: 'mg/dL',
      PICR_collectionHours: '', PICR_durationKnown: '', PICR_sameSpecimen: 'assumed', PICR_collectionProblem: '',
      U_PO4: '005,000000000000001', Ucr: '100.000' });
    expect(result.api.ClcrPhosphorusCreatinineSession.legacyAliasValues()).toEqual({ U_PO4: '005,000000000000001', Ucr: '100.000' });
  });

  it('restores a preserved-only legacy PO4_Cr record without mutating it', () => {
    const result = restore({ preservedInputs: { formulaPicker: 'PO4_Cr', U_PO4: '5', Ucr: '100' } });
    expect(captured(result)).toMatchObject({ PICR_phosphorus: '5', PICR_creatinine: '100',
      PICR_phosphorusUnit: 'mg P/dL', PICR_creatinineUnit: 'mg/dL', U_PO4: '5', Ucr: '100' });
    expect(result.controls.formulaPicker.value).toBe('PO4_Cr');
  });

  it('keeps the clinical meaning of legacy mass concentrations instead of applying the new molar defaults', () => {
    const legacy = restore({ selectedFormula: 'PO4_Cr', inputs: { U_PO4: '5', Ucr: '100' } });
    const current = restore({ selectedFormula: 'PO4_Cr', inputs: { ...defaults, PICR_phosphorus: '5', PICR_creatinine: '100' } });
    const engine = legacy.api.VildaClcrPhosphorusCreatinine;
    expect(engine.evaluate(engine.inputFromValues(captured(legacy)), null)).toMatchObject({ valid: true, rawValue: 0.05, unit: 'mg/mg' });
    expect(engine.evaluate(engine.inputFromValues(captured(current)), null).rawValue).toBeCloseTo(5 * 30.973761998 / (100 * 113.12), 14);
  });

  it.each([0, '-0.1', '-100', 'not-a-number'])('preserves invalid or zero source operand %j instead of repairing it', value => {
    const result = restore({ selectedFormula: 'PO4_Cr', inputs: { U_PO4: value, Ucr: '100' } });
    expect(captured(result).PICR_phosphorus).toBe(String(value));
  });

  it('an explicit dedicated blank prevents fallback to either preserved data or legacy aliases', () => {
    const result = restore({ selectedFormula: 'PO4_Cr', inputs: { PICR_phosphorus: '', PICR_sameSpecimen: '', PICR_collectionHours: '',
      PICR_durationKnown: '', PICR_collectionProblem: '' }, preservedInputs: { PICR_phosphorus: '5', PICR_sameSpecimen: 'different',
      PICR_collectionHours: '25', PICR_durationKnown: true, PICR_collectionProblem: true, U_PO4: '10', Ucr: '100' },
      context: { sameSpecimen: 'different', collectionProblem: true, collectionHours: '30', durationKnown: true } });
    expect(captured(result)).toMatchObject({ PICR_phosphorus: '', PICR_creatinine: '', PICR_sameSpecimen: '',
      PICR_collectionProblem: '', PICR_collectionHours: '', PICR_durationKnown: '' });
    expect(result.api.ClcrPhosphorusCreatinineSession.legacyAliasValues()).toEqual({});
  });

  it.each(['mg/mg', 'mg/g', 'mmol/mmol'])('roundtrips exact direct inequalities in %s without changing specimen or precision', unit => {
    const inputs = { ...defaults, PICR_inputMode: 'direct', PICR_reportedValue: '≥0,300000000000000000001', PICR_reportedUnit: unit,
      PICR_phosphorus: '0005.00', PICR_phosphorusUnit: 'µmol/L', PICR_creatinine: '100.00', PICR_creatinineUnit: 'mg/L',
      PICR_sameSpecimen: 'different', PICR_collectionProblem: 'true', PICR_collectionHours: '25.000000000001', PICR_durationKnown: 'true' };
    const result = restore({ selectedFormula: 'PO4_Cr', inputs });
    expect(captured(result)).toMatchObject(inputs);
    expect(captured(restore(result.api.buildClcrSessionSnapshot()))).toMatchObject(inputs);
  });

  it.each([['g/g', 'mg/mg'], ['mol/mol', 'mmol/mmol']])('canonicalizes DZM alias %s while retaining source evidence', (original, canonical) => {
    const result = restore({ selectedFormula: 'PO4_Cr', inputs: { PICR_inputMode: 'direct', PICR_reportedValue: '0.3', PICR_reportedUnit: original } });
    expect(captured(result)).toMatchObject({ PICR_reportedUnit: canonical, PICR_reportedUnitOriginal: original, PICR_reportedValue: '0.3' });
    expect(captured(restore(result.api.buildClcrSessionSnapshot()))).toMatchObject({ PICR_reportedUnit: canonical, PICR_reportedUnitOriginal: original });
  });

  it('a DZM session also retains the declared unit of a dormant independent spot measurement', () => {
    const result = restore({ selectedFormula: 'PO4_Cr', inputs: { ...defaults, PICR_phosphorus: '5', PICR_creatinine: '100',
      CaCr_entry_mode: 'concentration', Ca_spot: '50', Ca_spot_unit: 'µmol/L', Ucr_spot: '1000', Ucr_spot_unit: 'mg/L' } });
    expect(captured(result)).toMatchObject({ Ca_spot: '50', Ca_spot_unit: 'µmol/L', Ucr_spot: '1000', Ucr_spot_unit: 'mg/L' });
    result.controls.formulaPicker.value = 'CaCr_spot';
    expect(captured(result)).toMatchObject({ PICR_phosphorus: '5', PICR_creatinine: '100', Ucr_spot_unit: 'mg/L' });
  });

  it('restores owned safety context without copying the other calculator clock', () => {
    const result = restore({ selectedFormula: 'PO4_Cr', inputs: { U_PO4: '5', Ucr: '100', Cl24DurationHours: '24' },
      context: { sameSpecimen: 'different', collectionProblem: true, collectionHours: '25', durationKnown: false } });
    expect(captured(result)).toMatchObject({ PICR_sameSpecimen: 'different', PICR_collectionProblem: 'true',
      PICR_collectionHours: '25', PICR_durationKnown: 'false' });
  });

  it('uses only correctly identified timed Pᵢ/Cr version-1 snapshot context', () => {
    const context = { sampleType: 'timed', sameSpecimen: 'different', collectionProblem: true, collectionHours: '25', durationKnown: false };
    const result = restore({ selectedFormula: 'PO4_Cr', inputs: { U_PO4: '5', Ucr: '100' }, phosphorusCreatinineSnapshot: { schema: 'clcr-phosphorus-creatinine', version: 1, sourceFormula: 'PO4_Cr', context } });
    expect(captured(result)).toMatchObject({ PICR_sameSpecimen: 'different', PICR_collectionProblem: 'true', PICR_collectionHours: '25', PICR_durationKnown: 'false' });
    for (const snapshot of [{ schema: 'clcr-phosphorus-creatinine', version: 1, sourceFormula: 'CaCr_spot', context }, { schema: 'clcr-phosphorus-creatinine', version: 1, sourceFormula: 'PO4_Cr', context: { ...context, sampleType: 'random' } },
      { schema: 'wrong-schema', version: 1, sourceFormula: 'PO4_Cr', context }]) {
      expect(captured(restore({ selectedFormula: 'PO4_Cr', inputs: { U_PO4: '5', Ucr: '100' }, phosphorusCreatinineSnapshot: snapshot }))).toMatchObject({ PICR_sameSpecimen: 'assumed', PICR_collectionProblem: '', PICR_collectionHours: '', PICR_durationKnown: '' });
    }
  });

  it('retains specifically typed DZM context while another formula is selected', () => {
    const result = restore({ selectedFormula: 'ACR', inputs: { PICR_phosphorus: '5', PICR_creatinine: '100' },
      context: { phosphorusCreatinine: { sameSpecimen: false, collectionProblem: true, collectionHours: '25' } } });
    expect(captured(result)).toMatchObject({ PICR_sameSpecimen: 'false', PICR_collectionProblem: 'true', PICR_collectionHours: '25' });
  });

  it('keeps the known concentration mismatch when a frozen direct report has an independent effective specimen', () => {
    const result = restore({ selectedFormula: 'PO4_Cr', inputs: { PICR_inputMode: 'direct', PICR_phosphorus: '20', PICR_creatinine: '2', PICR_reportedValue: '0.3' },
      phosphorusCreatinineSnapshot: { schema: 'clcr-phosphorus-creatinine', version: 1, sourceFormula: 'PO4_Cr',
        context: { sampleType: 'timed', sameSpecimen: 'not-applicable', concentrationSameSpecimen: 'different' } } });
    const engine = result.api.VildaClcrPhosphorusCreatinine, profile = result.api.VildaClcrPhosphorusCreatinineData.getProfile('PICR_DZM_2026_11');
    expect(captured(result).PICR_sameSpecimen).toBe('different');
    expect(engine.evaluate(engine.inputFromValues(captured(result)), profile).valid).toBe(true);
    result.controls.PICR_inputMode.value = 'concentration';
    const again = restore(result.api.buildClcrSessionSnapshot());
    expect(captured(again)).toMatchObject({ PICR_inputMode: 'concentration', PICR_sameSpecimen: 'different' });
    expect(engine.evaluate(engine.inputFromValues(captured(again)), profile)).toMatchObject({ valid: false, reasonCode: 'different-specimens' });
  });

  it('keeps the independent drafts and exact facts through formula, version, missing DOM and reload', () => {
    const inputs = { ...defaults, PICR_inputMode: 'direct', PICR_reportedValue: '≤0,300000000000000000001', PICR_reportedUnit: 'mmol/mmol',
      PICR_phosphorus: '00020,00', PICR_phosphorusUnit: 'mg P/dL', PICR_creatinine: '2.000', PICR_creatinineUnit: 'µmol/L',
      PICR_sameSpecimen: 'different', PICR_collectionHours: '23.0001', PICR_durationKnown: 'false', PICR_collectionProblem: 'true' };
    const result = restore({ selectedFormula: 'PO4_Cr', inputs });
    result.api.clcrCaptureVersionValues({ force: true });
    for (const id of Object.keys(defaults)) delete result.controls[id];
    result.api.ClcrPhosphorusCreatinineUi = undefined;
    result.controls.formulaPicker.value = 'ACR'; result.api.setVersion('basic');
    expect(captured(result)).toMatchObject(inputs);
    const absent = restore(result.api.buildClcrSessionSnapshot(), {}, { omitDedicated: true, noUi: true });
    expect(Object.keys(absent.controls).some(id => id.startsWith('PICR_'))).toBe(false);
    expect(captured(absent)).toMatchObject(inputs);
    absent.controls.formulaPicker.value = 'PO4_Cr'; absent.api.setVersion('advanced');
    expect(captured(restore(absent.api.buildClcrSessionSnapshot()))).toMatchObject(inputs);
  });

  it.each([{ sourceFormula: 'CaCr_spot' }, { sourceFormulaId: 'ClCr24' }, { formulaId: 'ACR' }, { sampleType: 'random' }])(
    'does not treat an explicitly foreign %j context as DZM safety evidence', descriptor => {
      const result = restore({ selectedFormula: 'PO4_Cr', inputs: { U_PO4: '5', Ucr: '100' }, context: { ...descriptor,
        sameSpecimen: 'different', collectionProblem: true, collectionHours: '24', durationKnown: true } });
      expect(captured(result)).toMatchObject({ PICR_sameSpecimen: 'assumed', PICR_collectionProblem: '', PICR_collectionHours: '', PICR_durationKnown: '' });
    });

  it('capture preserves migration provenance but never infers it from coincident new values', () => {
    const result = restore({ selectedFormula: 'PO4_Cr', inputs: { U_PO4: '5', Ucr: '100' } });
    const again = restore(result.api.buildClcrSessionSnapshot());
    expect(again.api.ClcrPhosphorusCreatinineSession.legacyAliasValues()).toEqual({ U_PO4: '5', Ucr: '100' });
    again.controls.PICR_phosphorus.value = '8';
    expect(again.api.ClcrPhosphorusCreatinineSession.legacyAliasValues()).toEqual({ U_PO4: '5', Ucr: '100' });
    again.controls.formulaPicker.value = 'CaCr_spot';
    expect(again.api.ClcrPhosphorusCreatinineSession.legacyAliasValues()).toEqual({});
    expect(restore({ selectedFormula: 'PO4_Cr', inputs: { ...defaults, PICR_phosphorus: '5', PICR_creatinine: '100', U_PO4: '5', Ucr: '100' } })
      .api.ClcrPhosphorusCreatinineSession.legacyAliasValues()).toEqual({});
  });

  it.each(['not-json', '{"U_PO4":"5","other":"100"}', '{"U_PO4":{"value":"5"}}'])('does not trust malformed migration metadata %s', metadata => {
    const result = restore({ selectedFormula: 'PO4_Cr', inputs: { ...defaults, PICR_legacyAliases: metadata } });
    expect(result.api.ClcrPhosphorusCreatinineSession.legacyAliasValues()).toEqual({});
    expect(captured(result).PICR_legacyAliases).toBe(metadata);
  });

  it('read-only capture changes neither mounted controls, the vault, nor restoration flags', () => {
    const result = restore({ selectedFormula: 'PO4_Cr', inputs: { PICR_phosphorus: '5', PICR_creatinine: '100', PICR_collectionHours: '25' } });
    const mounts = result.mounts(), vault = structuredClone(result.api.__vildaClcrVersionValueVault), preserve = result.api.__vildaClcrPreserveVersionValues;
    expect(result.api.VildaClcrSessionRuntime.captureCurrentSessionReadOnly().inputs).toMatchObject({ PICR_phosphorus: '5', PICR_collectionHours: '25' });
    expect(result.mounts()).toBe(mounts);
    expect(result.api.__vildaClcrVersionValueVault).toEqual(vault);
    expect(result.api.__vildaClcrPreserveVersionValues).toBe(preserve);
  });

  it('clear resets the operands and provenance while retaining only allowed owned context', () => {
    const result = restore({ selectedFormula: 'PO4_Cr', inputs: { U_PO4: '5', Ucr: '100' } });
    result.document.dispatchEvent({ type: 'DOMContentLoaded' });
    result.clearBtn.dispatchEvent({ type: 'click', clcrClearedFormula: 'PO4_Cr', clcrPreservedPhosphorusCreatinineContext: { age: '8', sex: 'M',
      PICR_phosphorus: '5', PICR_reportedValue: '300', PICR_sameSpecimen: 'different', PICR_collectionProblem: true,
      PICR_collectionHours: '25', PICR_durationKnown: false, PICR_legacyAliases: '{"U_PO4":"5","Ucr":"100"}', arbitrary: 'unsafe' } });
    expect(captured(result)).toMatchObject({ ...defaults, age: '8', sex: 'M', PICR_sameSpecimen: 'different', PICR_collectionProblem: 'true', PICR_collectionHours: '25', PICR_durationKnown: 'false' });
    expect(captured(result)).not.toHaveProperty('PICR_legacyAliases');
    expect(result.api.ClcrPhosphorusCreatinineSession.legacyAliasValues()).toEqual({});
    expect(result.api.__vildaClcrVersionValueVault).not.toHaveProperty('arbitrary');
  });

  it('external patient load without a renal session removes old operands, context and provenance', () => {
    const result = restore({ selectedFormula: 'PO4_Cr', inputs: { ...defaults, PICR_phosphorus: '5', PICR_creatinine: '100',
      PICR_collectionProblem: 'true', PICR_collectionHours: '25', PICR_legacyAliases: '{"U_PO4":"5","Ucr":"100"}' } });
    expect(captured(result)).toMatchObject({ PICR_phosphorus: '5', PICR_creatinine: '100', PICR_collectionProblem: 'true', PICR_collectionHours: '25' });
    expect(result.api.ClcrPhosphorusCreatinineSession.legacyAliasValues()).toEqual({ U_PO4: '5', Ucr: '100' });
    expect(result.api.__vildaClcrRehydrate()).toBe(true);
    expect(captured(result)).toMatchObject(defaults);
    expect(captured(result)).not.toHaveProperty('PICR_legacyAliases');
    expect(result.api.ClcrPhosphorusCreatinineSession.legacyAliasValues()).toEqual({});
  });
});
