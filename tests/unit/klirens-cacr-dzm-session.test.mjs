import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../inline_kalkulator_klirens_07.js', import.meta.url), 'utf8');
const defaults = { CACR_DZM_inputMode: 'concentration', CACR_DZM_calcium: '', CACR_DZM_calciumUnit: 'mmol/L',
  CACR_DZM_creatinine: '', CACR_DZM_creatinineUnit: 'mg/dL', CACR_DZM_reportedValue: '', CACR_DZM_reportedUnit: 'mg/mg',
  CACR_DZM_sameSpecimen: 'assumed', CACR_DZM_collectionProblem: '', CACR_DZM_collectionHours: '', CACR_DZM_durationKnown: '', CACR_DZM_currentPreterm: '' };
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
  const values = { formulaPicker: 'Ca_Cr', age: '8', ageMonths: '0', ageDays: '', sex: 'M', weight: '25', height: '130', ...defaults,
    CACR_DZM_calcium: '5', CACR_DZM_creatinine: '100', U_Ca: '12', Ucr: '30', Ca_spot: '90', Ca_spot_unit: 'mg/dl',
    Ucr_spot: '200', Ucr_spot_unit: 'mg/dl', CaCr_reported: '', CaCr_reported_unit: 'mg/mg', CaCr_entry_mode: 'concentration', ...initial };
  for (const [id, value] of Object.entries(values)) if (!(options.omitDedicated && id.startsWith('CACR_DZM_'))) add(id, value);
  const form = target({ querySelectorAll: () => Object.values(controls) }), clearBtn = target({ id: 'clearBtn', type: 'button' });
  document = target({ readyState: 'loading', getElementById: id => id === 'clcrForm' ? form : id === 'clearBtn' ? clearBtn : controls[id] || null,
    querySelector: () => null });
  for (const control of Object.values(controls)) control.ownerDocument = document;
  const window = target({ document, currentVersion: 'advanced', setVersion(value) { window.currentVersion = value; },
    ClcrCacrDzmUi: { ensureControls() { mounts += 1; for (const [id, value] of Object.entries(defaults)) if (!controls[id]) add(id, value); } },
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
  });
  document.defaultView = window;
  const context = vm.createContext({ window, document, Date, setTimeout: callback => { timers.push(callback); return timers.length; }, clearTimeout() {} });
  vm.runInContext(readFileSync(new URL('../../clcr_collection_duration.js', import.meta.url), 'utf8'), context, { filename: 'clcr_collection_duration.js' });
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

describe('Ca/Cr DZM — actual session boundary and sample ownership', () => {
  it('materializes an empty new form without copying the shared or spot operands on formula selection', () => {
    const result = runtime({ formulaPicker: 'CaCr_spot' }, { omitDedicated: true });
    expect(captured(result)).toMatchObject(defaults);
    expect(result.api.ClcrCacrDzmSession.DEFAULTS).toEqual(defaults);
    expect(result.mounts()).toBeGreaterThan(0);
    result.controls.formulaPicker.value = 'Ca_Cr';
    expect(captured(result)).toMatchObject({ ...defaults, U_Ca: '12', Ucr: '30', Ca_spot: '90' });
    expect(result.api.ClcrCacrDzmSession.legacyAliasValues()).toEqual({});
  });

  it.each(['Ca_Cr', 'CaCr_spot', 'ClCr24', 'ACR'])('a sparse restored %s clears the previous dedicated sample', selectedFormula => {
    const result = restore({ selectedFormula, inputs: { age: '12' } });
    expect(captured(result)).toMatchObject(defaults);
  });

  it.each(['CaCr_spot', 'Ca_mgkg', 'ClCr24', 'ACR'])('does not migrate aliases from %s when DZM is subsequently selected', selectedFormula => {
    const result = restore({ selectedFormula, inputs: { U_Ca: '8', Ucr: '100', Ca_spot: '50', Ucr_spot: '200', Cl24DurationHours: '24',
      Cl24CollectionProblem: true, spotSameSpecimen: false, ui_spotSameSpecimen_answer: 'no' }, context: { collectionProblem: true, sameSpecimen: 'different', collectionHours: '26' } });
    result.controls.formulaPicker.value = 'Ca_Cr';
    expect(captured(result)).toMatchObject(defaults);
    expect(result.api.ClcrCacrDzmSession.legacyAliasValues()).toEqual({});
  });

  it('migrates only an imported legacy Ca_Cr pair, preserving exact source text and leaving its historical clock unknown', () => {
    const result = restore({ selectedFormula: 'Ca_Cr', inputs: { U_Ca: '005,000000000000001', Ucr: '100.000', age: '8',
      Cl24DurationHours: '24', Cl24CollectionProblem: true, spotSameSpecimen: false, ui_spotSameSpecimen_answer: 'no' } });
    expect(captured(result)).toMatchObject({ CACR_DZM_calcium: '005,000000000000001', CACR_DZM_creatinine: '100.000',
      CACR_DZM_collectionHours: '', CACR_DZM_durationKnown: '', CACR_DZM_sameSpecimen: 'assumed', CACR_DZM_collectionProblem: '',
      U_Ca: '005,000000000000001', Ucr: '100.000' });
    expect(result.api.ClcrCacrDzmSession.legacyAliasValues()).toEqual({ U_Ca: '005,000000000000001', Ucr: '100.000' });
  });

  it('restores a preserved-only legacy Ca_Cr record without mutating it', () => {
    const result = restore({ preservedInputs: { formulaPicker: 'Ca_Cr', U_Ca: '5', Ucr: '100' } });
    expect(captured(result)).toMatchObject({ CACR_DZM_calcium: '5', CACR_DZM_creatinine: '100', U_Ca: '5', Ucr: '100' });
    expect(result.controls.formulaPicker.value).toBe('Ca_Cr');
  });

  it.each([0, '-0.1', '-100', 'not-a-number'])('preserves invalid or zero source operand %j instead of repairing it', value => {
    const result = restore({ selectedFormula: 'Ca_Cr', inputs: { U_Ca: value, Ucr: '100' } });
    expect(captured(result).CACR_DZM_calcium).toBe(String(value));
  });

  it('an explicit dedicated blank prevents fallback to either preserved data or legacy aliases', () => {
    const result = restore({ selectedFormula: 'Ca_Cr', inputs: { CACR_DZM_calcium: '', CACR_DZM_sameSpecimen: '', CACR_DZM_collectionHours: '',
      CACR_DZM_durationKnown: '', CACR_DZM_collectionProblem: '' }, preservedInputs: { CACR_DZM_calcium: '5', CACR_DZM_sameSpecimen: 'different',
      CACR_DZM_collectionHours: '25', CACR_DZM_durationKnown: true, CACR_DZM_collectionProblem: true, U_Ca: '10', Ucr: '100' },
      context: { sameSpecimen: 'different', collectionProblem: true, collectionHours: '30', durationKnown: true } });
    expect(captured(result)).toMatchObject({ CACR_DZM_calcium: '', CACR_DZM_creatinine: '', CACR_DZM_sameSpecimen: '',
      CACR_DZM_collectionProblem: '', CACR_DZM_collectionHours: '', CACR_DZM_durationKnown: '' });
    expect(result.api.ClcrCacrDzmSession.legacyAliasValues()).toEqual({});
  });

  it.each(['mg/mg', 'mg/g', 'mmol/mmol', 'mg/mmol', 'mmol/mol'])('roundtrips exact direct inequalities in %s without changing specimen or precision', unit => {
    const inputs = { ...defaults, CACR_DZM_inputMode: 'direct', CACR_DZM_reportedValue: '≥0,300000000000000000001', CACR_DZM_reportedUnit: unit,
      CACR_DZM_calcium: '0005.00', CACR_DZM_calciumUnit: 'µmol/L', CACR_DZM_creatinine: '100.00', CACR_DZM_creatinineUnit: 'mg/L',
      CACR_DZM_sameSpecimen: 'different', CACR_DZM_collectionProblem: 'true', CACR_DZM_collectionHours: '25.000000000001', CACR_DZM_durationKnown: 'true' };
    const result = restore({ selectedFormula: 'Ca_Cr', inputs });
    expect(captured(result)).toMatchObject(inputs);
    expect(captured(restore(result.api.buildClcrSessionSnapshot()))).toMatchObject(inputs);
  });

  it.each([['g/g', 'mg/mg'], ['mol/mol', 'mmol/mmol']])('canonicalizes DZM alias %s while retaining source evidence', (original, canonical) => {
    const result = restore({ selectedFormula: 'Ca_Cr', inputs: { CACR_DZM_inputMode: 'direct', CACR_DZM_reportedValue: '0.3', CACR_DZM_reportedUnit: original } });
    expect(captured(result)).toMatchObject({ CACR_DZM_reportedUnit: canonical, CACR_DZM_reportedUnitOriginal: original, CACR_DZM_reportedValue: '0.3' });
    expect(captured(restore(result.api.buildClcrSessionSnapshot()))).toMatchObject({ CACR_DZM_reportedUnit: canonical, CACR_DZM_reportedUnitOriginal: original });
  });

  it.each([['g/g', 'mg/mg'], ['mol/mol', 'mmol/mmol']])('canonicalizes spot alias %s and permits the new concentration units', (original, canonical) => {
    const result = restore({ selectedFormula: 'CaCr_spot', inputs: { CaCr_entry_mode: 'direct', CaCr_reported: '>0.3', CaCr_reported_unit: original,
      Ca_spot: '50', Ca_spot_unit: 'µmol/L', Ucr_spot: '1000', Ucr_spot_unit: 'mg/L' } });
    expect(captured(result)).toMatchObject({ CaCr_reported_unit: canonical, CaCr_reported_unit_original: original,
      Ca_spot_unit: 'µmol/L', Ucr_spot_unit: 'mg/L', CaCr_reported: '>0.3' });
    expect(captured(result)).toMatchObject(defaults);
  });

  it('a DZM session also retains the declared unit of a dormant independent spot measurement', () => {
    const result = restore({ selectedFormula: 'Ca_Cr', inputs: { ...defaults, CACR_DZM_calcium: '5', CACR_DZM_creatinine: '100',
      CaCr_entry_mode: 'concentration', Ca_spot: '50', Ca_spot_unit: 'µmol/L', Ucr_spot: '1000', Ucr_spot_unit: 'mg/L' } });
    expect(captured(result)).toMatchObject({ Ca_spot: '50', Ca_spot_unit: 'µmol/L', Ucr_spot: '1000', Ucr_spot_unit: 'mg/L' });
    result.controls.formulaPicker.value = 'CaCr_spot';
    expect(captured(result)).toMatchObject({ CACR_DZM_calcium: '5', CACR_DZM_creatinine: '100', Ucr_spot_unit: 'mg/L' });
  });

  it('restores owned safety context without copying the other calculator clock', () => {
    const result = restore({ selectedFormula: 'Ca_Cr', inputs: { U_Ca: '5', Ucr: '100', Cl24DurationHours: '24' },
      context: { sameSpecimen: 'different', collectionProblem: true, collectionHours: '25', durationKnown: false } });
    expect(captured(result)).toMatchObject({ CACR_DZM_sameSpecimen: 'different', CACR_DZM_collectionProblem: 'true',
      CACR_DZM_collectionHours: '25', CACR_DZM_durationKnown: 'false' });
  });

  it('uses only correctly identified timed version-2 snapshot context', () => {
    const context = { sampleType: 'timed', sameSpecimen: 'different', collectionProblem: true, collectionHours: '25', durationKnown: false };
    const result = restore({ selectedFormula: 'Ca_Cr', inputs: { U_Ca: '5', Ucr: '100' }, cacrSnapshot: { version: 2, sourceFormula: 'Ca_Cr', context } });
    expect(captured(result)).toMatchObject({ CACR_DZM_sameSpecimen: 'different', CACR_DZM_collectionProblem: 'true', CACR_DZM_collectionHours: '25', CACR_DZM_durationKnown: 'false' });
    for (const snapshot of [{ version: 2, sourceFormula: 'CaCr_spot', context }, { version: 2, sourceFormula: 'Ca_Cr', context: { ...context, sampleType: 'random' } },
      { version: 1, sourceFormula: 'Ca_Cr', context }]) {
      expect(captured(restore({ selectedFormula: 'Ca_Cr', inputs: { U_Ca: '5', Ucr: '100' }, cacrSnapshot: snapshot }))).toMatchObject({ CACR_DZM_sameSpecimen: 'assumed', CACR_DZM_collectionProblem: '', CACR_DZM_collectionHours: '', CACR_DZM_durationKnown: '' });
    }
  });

  it('retains specifically typed DZM context while another formula is selected', () => {
    const result = restore({ selectedFormula: 'ACR', inputs: { CACR_DZM_calcium: '5', CACR_DZM_creatinine: '100' },
      context: { cacrDzm: { sameSpecimen: false, collectionProblem: true, collectionHours: '25' } } });
    expect(captured(result)).toMatchObject({ CACR_DZM_sameSpecimen: 'false', CACR_DZM_collectionProblem: 'true', CACR_DZM_collectionHours: '25' });
  });

  it.each([true, false])('preserves the explicit owned population.currentPreterm=%s without inferring it from newbornContext', currentPreterm => {
    const result = restore({ selectedFormula: 'Ca_Cr', inputs: { U_Ca: '5', Ucr: '100', newbornContext: true },
      cacrSnapshot: { version: 2, sourceFormula: 'Ca_Cr', context: { sampleType: 'timed', population: { currentPreterm } } } });
    expect(captured(result).CACR_DZM_currentPreterm).toBe(String(currentPreterm));
    expect(captured(restore(result.api.buildClcrSessionSnapshot())).CACR_DZM_currentPreterm).toBe(String(currentPreterm));
    expect(captured(restore({ selectedFormula: 'Ca_Cr', inputs: { U_Ca: '5', Ucr: '100', newbornContext: true } })).CACR_DZM_currentPreterm).toBe('');
  });

  it('an explicit blank currentPreterm overrides an older population fact and foreign snapshots cannot supply it', () => {
    const snapshot = { version: 2, sourceFormula: 'Ca_Cr', context: { sampleType: 'timed', population: { currentPreterm: true } } };
    expect(captured(restore({ selectedFormula: 'Ca_Cr', inputs: { CACR_DZM_currentPreterm: '' }, cacrSnapshot: snapshot })).CACR_DZM_currentPreterm).toBe('');
    expect(captured(restore({ selectedFormula: 'Ca_Cr', inputs: {}, cacrSnapshot: { ...snapshot, sourceFormula: 'CaCr_spot' } })).CACR_DZM_currentPreterm).toBe('');
  });

  it.each([{ sourceFormula: 'CaCr_spot' }, { sourceFormulaId: 'ClCr24' }, { formulaId: 'ACR' }, { sampleType: 'random' }])(
    'does not treat an explicitly foreign %j context as DZM safety evidence', descriptor => {
      const result = restore({ selectedFormula: 'Ca_Cr', inputs: { U_Ca: '5', Ucr: '100' }, context: { ...descriptor,
        sameSpecimen: 'different', collectionProblem: true, collectionHours: '24', durationKnown: true } });
      expect(captured(result)).toMatchObject({ CACR_DZM_sameSpecimen: 'assumed', CACR_DZM_collectionProblem: '', CACR_DZM_collectionHours: '', CACR_DZM_durationKnown: '' });
    });

  it('capture preserves migration provenance but never infers it from coincident new values', () => {
    const result = restore({ selectedFormula: 'Ca_Cr', inputs: { U_Ca: '5', Ucr: '100' } });
    const again = restore(result.api.buildClcrSessionSnapshot());
    expect(again.api.ClcrCacrDzmSession.legacyAliasValues()).toEqual({ U_Ca: '5', Ucr: '100' });
    again.controls.CACR_DZM_calcium.value = '8';
    expect(again.api.ClcrCacrDzmSession.legacyAliasValues()).toEqual({ U_Ca: '5', Ucr: '100' });
    again.controls.formulaPicker.value = 'CaCr_spot';
    expect(again.api.ClcrCacrDzmSession.legacyAliasValues()).toEqual({});
    expect(restore({ selectedFormula: 'Ca_Cr', inputs: { ...defaults, CACR_DZM_calcium: '5', CACR_DZM_creatinine: '100', U_Ca: '5', Ucr: '100' } })
      .api.ClcrCacrDzmSession.legacyAliasValues()).toEqual({});
  });

  it.each(['not-json', '{"U_Ca":"5","other":"100"}', '{"U_Ca":{"value":"5"}}'])('does not trust malformed migration metadata %s', metadata => {
    const result = restore({ selectedFormula: 'Ca_Cr', inputs: { ...defaults, CACR_DZM_legacyAliases: metadata } });
    expect(result.api.ClcrCacrDzmSession.legacyAliasValues()).toEqual({});
    expect(captured(result).CACR_DZM_legacyAliases).toBe(metadata);
  });

  it('read-only capture changes neither mounted controls, the vault, nor restoration flags', () => {
    const result = restore({ selectedFormula: 'Ca_Cr', inputs: { CACR_DZM_calcium: '5', CACR_DZM_creatinine: '100', CACR_DZM_collectionHours: '25' } });
    const mounts = result.mounts(), vault = structuredClone(result.api.__vildaClcrVersionValueVault), preserve = result.api.__vildaClcrPreserveVersionValues;
    expect(result.api.VildaClcrSessionRuntime.captureCurrentSessionReadOnly().inputs).toMatchObject({ CACR_DZM_calcium: '5', CACR_DZM_collectionHours: '25' });
    expect(result.mounts()).toBe(mounts);
    expect(result.api.__vildaClcrVersionValueVault).toEqual(vault);
    expect(result.api.__vildaClcrPreserveVersionValues).toBe(preserve);
  });

  it('clear resets the operands and provenance while retaining only allowed owned context', () => {
    const result = restore({ selectedFormula: 'Ca_Cr', inputs: { U_Ca: '5', Ucr: '100' } });
    result.document.dispatchEvent({ type: 'DOMContentLoaded' });
    result.clearBtn.dispatchEvent({ type: 'click', clcrClearedFormula: 'Ca_Cr', clcrPreservedCacrDzmContext: { age: '8', sex: 'M',
      CACR_DZM_calcium: '5', CACR_DZM_reportedValue: '300', CACR_DZM_sameSpecimen: 'different', CACR_DZM_collectionProblem: true,
      CACR_DZM_collectionHours: '25', CACR_DZM_durationKnown: false, CACR_DZM_legacyAliases: '{"U_Ca":"5","Ucr":"100"}', arbitrary: 'unsafe' } });
    expect(captured(result)).toMatchObject({ ...defaults, age: '8', sex: 'M', CACR_DZM_sameSpecimen: 'different', CACR_DZM_collectionProblem: 'true', CACR_DZM_collectionHours: '25', CACR_DZM_durationKnown: 'false' });
    expect(captured(result)).not.toHaveProperty('CACR_DZM_legacyAliases');
    expect(result.api.ClcrCacrDzmSession.legacyAliasValues()).toEqual({});
    expect(result.api.__vildaClcrVersionValueVault).not.toHaveProperty('arbitrary');
  });

  it('external patient load without a renal session removes old operands, context and provenance', () => {
    const result = restore({ selectedFormula: 'Ca_Cr', inputs: { ...defaults, CACR_DZM_calcium: '5', CACR_DZM_creatinine: '100',
      CACR_DZM_collectionProblem: 'true', CACR_DZM_collectionHours: '25', CACR_DZM_legacyAliases: '{"U_Ca":"5","Ucr":"100"}' } });
    expect(captured(result)).toMatchObject({ CACR_DZM_calcium: '5', CACR_DZM_creatinine: '100', CACR_DZM_collectionProblem: 'true', CACR_DZM_collectionHours: '25' });
    expect(result.api.ClcrCacrDzmSession.legacyAliasValues()).toEqual({ U_Ca: '5', Ucr: '100' });
    expect(result.api.__vildaClcrRehydrate()).toBe(true);
    expect(captured(result)).toMatchObject(defaults);
    expect(captured(result)).not.toHaveProperty('CACR_DZM_legacyAliases');
    expect(result.api.ClcrCacrDzmSession.legacyAliasValues()).toEqual({});
  });
});
