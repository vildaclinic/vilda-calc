import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../inline_kalkulator_klirens_07.js', import.meta.url), 'utf8');
const defaults = { MGCA_inputMode: 'concentration', MGCA_magnesium: '', MGCA_magnesiumUnit: 'mg/L',
  MGCA_calcium: '', MGCA_calciumUnit: 'mmol/L', MGCA_reportedValue: '', MGCA_reportedUnit: 'mg/mg',
  MGCA_sameSpecimen: 'assumed', MGCA_collectionProblem: '', MGCA_collectionHours: '', MGCA_durationKnown: '' };
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
  const values = { formulaPicker: 'Mg_Ca', age: '8', ageMonths: '0', ageDays: '', sex: 'M', weight: '25', height: '130', ...defaults,
    MGCA_magnesium: '5', MGCA_calcium: '100', U_Mg: '12', U_Ca: '30', Ca_spot: '90', Ca_spot_unit: 'mg/dl',
    Ucr_spot: '200', Ucr_spot_unit: 'mg/dl', CaCr_reported: '', CaCr_reported_unit: 'mg/mg', CaCr_entry_mode: 'concentration', ...initial };
  for (const [id, value] of Object.entries(values)) if (!(options.omitDedicated && id.startsWith('MGCA_'))) add(id, value);
  const form = target({ querySelectorAll: () => Object.values(controls) }), clearBtn = target({ id: 'clearBtn', type: 'button' });
  document = target({ readyState: 'loading', getElementById: id => id === 'clcrForm' ? form : id === 'clearBtn' ? clearBtn : controls[id] || null,
    querySelector: () => null });
  for (const control of Object.values(controls)) control.ownerDocument = document;
  const window = target({ document, currentVersion: 'advanced', setVersion(value) { window.currentVersion = value; },
    ClcrMagnesiumCalciumUi: options.noUi ? undefined : { ensureControls() { mounts += 1; for (const [id, value] of Object.entries(defaults)) if (!controls[id]) add(id, value); } },
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
  });
  document.defaultView = window;
  const context = vm.createContext({ window, document, Date, setTimeout: callback => { timers.push(callback); return timers.length; }, clearTimeout() {} });
  for (const file of ['clcr_collection_duration.js', 'clcr_magnesium_calcium_data.js', 'clcr_magnesium_calcium.js']) {
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

describe('Mg/Ca DZM — actual session boundary and sample ownership', () => {
  it('materializes an empty new form without copying the shared or spot operands on formula selection', () => {
    const result = runtime({ formulaPicker: 'CaCr_spot' }, { omitDedicated: true });
    expect(captured(result)).toMatchObject(defaults);
    expect(result.api.ClcrMagnesiumCalciumSession.DEFAULTS).toEqual(defaults);
    expect(result.mounts()).toBeGreaterThan(0);
    result.controls.formulaPicker.value = 'Mg_Ca';
    expect(captured(result)).toMatchObject({ ...defaults, U_Mg: '12', U_Ca: '30', Ca_spot: '90' });
    expect(result.api.ClcrMagnesiumCalciumSession.legacyAliasValues()).toEqual({});
  });

  it.each(['Mg_Ca', 'Ca_Cr', 'Mg_mgkg', 'ClCr24', 'ACR'])('a sparse restored %s clears the previous dedicated sample', selectedFormula => {
    const result = restore({ selectedFormula, inputs: { age: '12' } });
    expect(captured(result)).toMatchObject(defaults);
  });

  it.each(['CaCr_spot', 'Mg_mgkg', 'Ca_Cr', 'ClCr24', 'ACR'])('does not migrate aliases from %s when DZM is subsequently selected', selectedFormula => {
    const result = restore({ selectedFormula, inputs: { U_Mg: '8', U_Ca: '100', Ca_spot: '50', Ucr_spot: '200', Cl24DurationHours: '24',
      Cl24CollectionProblem: true, spotSameSpecimen: false, ui_spotSameSpecimen_answer: 'no' }, context: { collectionProblem: true, sameSpecimen: 'different', collectionHours: '26' } });
    result.controls.formulaPicker.value = 'Mg_Ca';
    expect(captured(result)).toMatchObject(defaults);
    expect(result.api.ClcrMagnesiumCalciumSession.legacyAliasValues()).toEqual({});
  });

  it('migrates only an imported legacy Mg_Ca pair, preserving exact source text and leaving its historical clock unknown', () => {
    const result = restore({ selectedFormula: 'Mg_Ca', inputs: { U_Mg: '005,000000000000001', U_Ca: '100.000', age: '8',
      Cl24DurationHours: '24', Cl24CollectionProblem: true, spotSameSpecimen: false, ui_spotSameSpecimen_answer: 'no' } });
    expect(captured(result)).toMatchObject({ MGCA_magnesium: '005,000000000000001', MGCA_calcium: '100.000',
      MGCA_collectionHours: '', MGCA_durationKnown: '', MGCA_sameSpecimen: 'assumed', MGCA_collectionProblem: '',
      U_Mg: '005,000000000000001', U_Ca: '100.000' });
    expect(result.api.ClcrMagnesiumCalciumSession.legacyAliasValues()).toEqual({ U_Mg: '005,000000000000001', U_Ca: '100.000' });
  });

  it('restores a preserved-only legacy Mg_Ca record without mutating it', () => {
    const result = restore({ preservedInputs: { formulaPicker: 'Mg_Ca', U_Mg: '5', U_Ca: '100' } });
    expect(captured(result)).toMatchObject({ MGCA_magnesium: '5', MGCA_calcium: '100', U_Mg: '5', U_Ca: '100' });
    expect(result.controls.formulaPicker.value).toBe('Mg_Ca');
  });

  it.each([0, '-0.1', '-100', 'not-a-number'])('preserves invalid or zero source operand %j instead of repairing it', value => {
    const result = restore({ selectedFormula: 'Mg_Ca', inputs: { U_Mg: value, U_Ca: '100' } });
    expect(captured(result).MGCA_magnesium).toBe(String(value));
  });

  it('an explicit dedicated blank prevents fallback to either preserved data or legacy aliases', () => {
    const result = restore({ selectedFormula: 'Mg_Ca', inputs: { MGCA_magnesium: '', MGCA_sameSpecimen: '', MGCA_collectionHours: '',
      MGCA_durationKnown: '', MGCA_collectionProblem: '' }, preservedInputs: { MGCA_magnesium: '5', MGCA_sameSpecimen: 'different',
      MGCA_collectionHours: '25', MGCA_durationKnown: true, MGCA_collectionProblem: true, U_Mg: '10', U_Ca: '100' },
      context: { sameSpecimen: 'different', collectionProblem: true, collectionHours: '30', durationKnown: true } });
    expect(captured(result)).toMatchObject({ MGCA_magnesium: '', MGCA_calcium: '', MGCA_sameSpecimen: '',
      MGCA_collectionProblem: '', MGCA_collectionHours: '', MGCA_durationKnown: '' });
    expect(result.api.ClcrMagnesiumCalciumSession.legacyAliasValues()).toEqual({});
  });

  it.each(['mg/mg', 'mmol/mmol'])('roundtrips exact direct inequalities in %s without changing specimen or precision', unit => {
    const inputs = { ...defaults, MGCA_inputMode: 'direct', MGCA_reportedValue: '≥0,300000000000000000001', MGCA_reportedUnit: unit,
      MGCA_magnesium: '0005.00', MGCA_magnesiumUnit: 'µmol/L', MGCA_calcium: '100.00', MGCA_calciumUnit: 'mg/L',
      MGCA_sameSpecimen: 'different', MGCA_collectionProblem: 'true', MGCA_collectionHours: '25.000000000001', MGCA_durationKnown: 'true' };
    const result = restore({ selectedFormula: 'Mg_Ca', inputs });
    expect(captured(result)).toMatchObject(inputs);
    expect(captured(restore(result.api.buildClcrSessionSnapshot()))).toMatchObject(inputs);
  });

  it.each([['g/g', 'mg/mg'], ['mol/mol', 'mmol/mmol']])('canonicalizes DZM alias %s while retaining source evidence', (original, canonical) => {
    const result = restore({ selectedFormula: 'Mg_Ca', inputs: { MGCA_inputMode: 'direct', MGCA_reportedValue: '0.3', MGCA_reportedUnit: original } });
    expect(captured(result)).toMatchObject({ MGCA_reportedUnit: canonical, MGCA_reportedUnitOriginal: original, MGCA_reportedValue: '0.3' });
    expect(captured(restore(result.api.buildClcrSessionSnapshot()))).toMatchObject({ MGCA_reportedUnit: canonical, MGCA_reportedUnitOriginal: original });
  });

  it('a DZM session also retains the declared unit of a dormant independent spot measurement', () => {
    const result = restore({ selectedFormula: 'Mg_Ca', inputs: { ...defaults, MGCA_magnesium: '5', MGCA_calcium: '100',
      CaCr_entry_mode: 'concentration', Ca_spot: '50', Ca_spot_unit: 'µmol/L', Ucr_spot: '1000', Ucr_spot_unit: 'mg/L' } });
    expect(captured(result)).toMatchObject({ Ca_spot: '50', Ca_spot_unit: 'µmol/L', Ucr_spot: '1000', Ucr_spot_unit: 'mg/L' });
    result.controls.formulaPicker.value = 'CaCr_spot';
    expect(captured(result)).toMatchObject({ MGCA_magnesium: '5', MGCA_calcium: '100', Ucr_spot_unit: 'mg/L' });
  });

  it('restores owned safety context without copying the other calculator clock', () => {
    const result = restore({ selectedFormula: 'Mg_Ca', inputs: { U_Mg: '5', U_Ca: '100', Cl24DurationHours: '24' },
      context: { sameSpecimen: 'different', collectionProblem: true, collectionHours: '25', durationKnown: false } });
    expect(captured(result)).toMatchObject({ MGCA_sameSpecimen: 'different', MGCA_collectionProblem: 'true',
      MGCA_collectionHours: '25', MGCA_durationKnown: 'false' });
  });

  it('uses only correctly identified timed Mg/Ca version-1 snapshot context', () => {
    const context = { sampleType: 'timed', sameSpecimen: 'different', collectionProblem: true, collectionHours: '25', durationKnown: false };
    const result = restore({ selectedFormula: 'Mg_Ca', inputs: { U_Mg: '5', U_Ca: '100' }, magnesiumCalciumSnapshot: { schema: 'clcr-magnesium-calcium', version: 1, sourceFormula: 'Mg_Ca', context } });
    expect(captured(result)).toMatchObject({ MGCA_sameSpecimen: 'different', MGCA_collectionProblem: 'true', MGCA_collectionHours: '25', MGCA_durationKnown: 'false' });
    for (const snapshot of [{ schema: 'clcr-magnesium-calcium', version: 1, sourceFormula: 'CaCr_spot', context }, { schema: 'clcr-magnesium-calcium', version: 1, sourceFormula: 'Mg_Ca', context: { ...context, sampleType: 'random' } },
      { schema: 'wrong-schema', version: 1, sourceFormula: 'Mg_Ca', context }]) {
      expect(captured(restore({ selectedFormula: 'Mg_Ca', inputs: { U_Mg: '5', U_Ca: '100' }, magnesiumCalciumSnapshot: snapshot }))).toMatchObject({ MGCA_sameSpecimen: 'assumed', MGCA_collectionProblem: '', MGCA_collectionHours: '', MGCA_durationKnown: '' });
    }
  });

  it('retains specifically typed DZM context while another formula is selected', () => {
    const result = restore({ selectedFormula: 'ACR', inputs: { MGCA_magnesium: '5', MGCA_calcium: '100' },
      context: { magnesiumCalcium: { sameSpecimen: false, collectionProblem: true, collectionHours: '25' } } });
    expect(captured(result)).toMatchObject({ MGCA_sameSpecimen: 'false', MGCA_collectionProblem: 'true', MGCA_collectionHours: '25' });
  });

  it('keeps the known concentration mismatch when a frozen direct report has an independent effective specimen', () => {
    const result = restore({ selectedFormula: 'Mg_Ca', inputs: { MGCA_inputMode: 'direct', MGCA_magnesium: '20', MGCA_calcium: '2', MGCA_reportedValue: '0.3' },
      magnesiumCalciumSnapshot: { schema: 'clcr-magnesium-calcium', version: 1, sourceFormula: 'Mg_Ca',
        context: { sampleType: 'timed', sameSpecimen: 'not-applicable', concentrationSameSpecimen: 'different' } } });
    const engine = result.api.VildaClcrMagnesiumCalcium, profile = result.api.VildaClcrMagnesiumCalciumData.getProfile('MGCA_DZM_2026_11');
    expect(captured(result).MGCA_sameSpecimen).toBe('different');
    expect(engine.evaluate(engine.inputFromValues(captured(result)), profile).valid).toBe(true);
    result.controls.MGCA_inputMode.value = 'concentration';
    const again = restore(result.api.buildClcrSessionSnapshot());
    expect(captured(again)).toMatchObject({ MGCA_inputMode: 'concentration', MGCA_sameSpecimen: 'different' });
    expect(engine.evaluate(engine.inputFromValues(captured(again)), profile)).toMatchObject({ valid: false, reasonCode: 'different-specimens' });
  });

  it('keeps the independent drafts and exact facts through formula, version, missing DOM and reload', () => {
    const inputs = { ...defaults, MGCA_inputMode: 'direct', MGCA_reportedValue: '≤0,300000000000000000001', MGCA_reportedUnit: 'mmol/mmol',
      MGCA_magnesium: '00020,00', MGCA_magnesiumUnit: 'mg/dL', MGCA_calcium: '2.000', MGCA_calciumUnit: 'µmol/L',
      MGCA_sameSpecimen: 'different', MGCA_collectionHours: '23.0001', MGCA_durationKnown: 'false', MGCA_collectionProblem: 'true' };
    const result = restore({ selectedFormula: 'Mg_Ca', inputs });
    result.api.clcrCaptureVersionValues({ force: true });
    for (const id of Object.keys(defaults)) delete result.controls[id];
    result.api.ClcrMagnesiumCalciumUi = undefined;
    result.controls.formulaPicker.value = 'ACR'; result.api.setVersion('basic');
    expect(captured(result)).toMatchObject(inputs);
    const absent = restore(result.api.buildClcrSessionSnapshot(), {}, { omitDedicated: true, noUi: true });
    expect(Object.keys(absent.controls).some(id => id.startsWith('MGCA_'))).toBe(false);
    expect(captured(absent)).toMatchObject(inputs);
    absent.controls.formulaPicker.value = 'Mg_Ca'; absent.api.setVersion('advanced');
    expect(captured(restore(absent.api.buildClcrSessionSnapshot()))).toMatchObject(inputs);
  });

  it.each([{ sourceFormula: 'CaCr_spot' }, { sourceFormulaId: 'ClCr24' }, { formulaId: 'ACR' }, { sampleType: 'random' }])(
    'does not treat an explicitly foreign %j context as DZM safety evidence', descriptor => {
      const result = restore({ selectedFormula: 'Mg_Ca', inputs: { U_Mg: '5', U_Ca: '100' }, context: { ...descriptor,
        sameSpecimen: 'different', collectionProblem: true, collectionHours: '24', durationKnown: true } });
      expect(captured(result)).toMatchObject({ MGCA_sameSpecimen: 'assumed', MGCA_collectionProblem: '', MGCA_collectionHours: '', MGCA_durationKnown: '' });
    });

  it('capture preserves migration provenance but never infers it from coincident new values', () => {
    const result = restore({ selectedFormula: 'Mg_Ca', inputs: { U_Mg: '5', U_Ca: '100' } });
    const again = restore(result.api.buildClcrSessionSnapshot());
    expect(again.api.ClcrMagnesiumCalciumSession.legacyAliasValues()).toEqual({ U_Mg: '5', U_Ca: '100' });
    again.controls.MGCA_magnesium.value = '8';
    expect(again.api.ClcrMagnesiumCalciumSession.legacyAliasValues()).toEqual({ U_Mg: '5', U_Ca: '100' });
    again.controls.formulaPicker.value = 'CaCr_spot';
    expect(again.api.ClcrMagnesiumCalciumSession.legacyAliasValues()).toEqual({});
    expect(restore({ selectedFormula: 'Mg_Ca', inputs: { ...defaults, MGCA_magnesium: '5', MGCA_calcium: '100', U_Mg: '5', U_Ca: '100' } })
      .api.ClcrMagnesiumCalciumSession.legacyAliasValues()).toEqual({});
  });

  it.each(['not-json', '{"U_Mg":"5","other":"100"}', '{"U_Mg":{"value":"5"}}'])('does not trust malformed migration metadata %s', metadata => {
    const result = restore({ selectedFormula: 'Mg_Ca', inputs: { ...defaults, MGCA_legacyAliases: metadata } });
    expect(result.api.ClcrMagnesiumCalciumSession.legacyAliasValues()).toEqual({});
    expect(captured(result).MGCA_legacyAliases).toBe(metadata);
  });

  it('read-only capture changes neither mounted controls, the vault, nor restoration flags', () => {
    const result = restore({ selectedFormula: 'Mg_Ca', inputs: { MGCA_magnesium: '5', MGCA_calcium: '100', MGCA_collectionHours: '25' } });
    const mounts = result.mounts(), vault = structuredClone(result.api.__vildaClcrVersionValueVault), preserve = result.api.__vildaClcrPreserveVersionValues;
    expect(result.api.VildaClcrSessionRuntime.captureCurrentSessionReadOnly().inputs).toMatchObject({ MGCA_magnesium: '5', MGCA_collectionHours: '25' });
    expect(result.mounts()).toBe(mounts);
    expect(result.api.__vildaClcrVersionValueVault).toEqual(vault);
    expect(result.api.__vildaClcrPreserveVersionValues).toBe(preserve);
  });

  it('clear resets the operands and provenance while retaining only allowed owned context', () => {
    const result = restore({ selectedFormula: 'Mg_Ca', inputs: { U_Mg: '5', U_Ca: '100' } });
    result.document.dispatchEvent({ type: 'DOMContentLoaded' });
    result.clearBtn.dispatchEvent({ type: 'click', clcrClearedFormula: 'Mg_Ca', clcrPreservedMagnesiumCalciumContext: { age: '8', sex: 'M',
      MGCA_magnesium: '5', MGCA_reportedValue: '300', MGCA_sameSpecimen: 'different', MGCA_collectionProblem: true,
      MGCA_collectionHours: '25', MGCA_durationKnown: false, MGCA_legacyAliases: '{"U_Mg":"5","U_Ca":"100"}', arbitrary: 'unsafe' } });
    expect(captured(result)).toMatchObject({ ...defaults, age: '8', sex: 'M', MGCA_sameSpecimen: 'different', MGCA_collectionProblem: 'true', MGCA_collectionHours: '25', MGCA_durationKnown: 'false' });
    expect(captured(result)).not.toHaveProperty('MGCA_legacyAliases');
    expect(result.api.ClcrMagnesiumCalciumSession.legacyAliasValues()).toEqual({});
    expect(result.api.__vildaClcrVersionValueVault).not.toHaveProperty('arbitrary');
  });

  it('external patient load without a renal session removes old operands, context and provenance', () => {
    const result = restore({ selectedFormula: 'Mg_Ca', inputs: { ...defaults, MGCA_magnesium: '5', MGCA_calcium: '100',
      MGCA_collectionProblem: 'true', MGCA_collectionHours: '25', MGCA_legacyAliases: '{"U_Mg":"5","U_Ca":"100"}' } });
    expect(captured(result)).toMatchObject({ MGCA_magnesium: '5', MGCA_calcium: '100', MGCA_collectionProblem: 'true', MGCA_collectionHours: '25' });
    expect(result.api.ClcrMagnesiumCalciumSession.legacyAliasValues()).toEqual({ U_Mg: '5', U_Ca: '100' });
    expect(result.api.__vildaClcrRehydrate()).toBe(true);
    expect(captured(result)).toMatchObject(defaults);
    expect(captured(result)).not.toHaveProperty('MGCA_legacyAliases');
    expect(result.api.ClcrMagnesiumCalciumSession.legacyAliasValues()).toEqual({});
  });
});
