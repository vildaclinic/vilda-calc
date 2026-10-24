import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../inline_kalkulator_klirens_07.js', import.meta.url), 'utf8');
const defaults = { CitCr_entry_mode: 'concentration', CitCr_reported: '', CitCr_reported_unit: 'umol/mmol', CitCr_reported_basis: 'unknown',
  Cit_Cr_spot: '', Cit_Cr_spot_unit: 'umol/L', citrateSpotReportingEntity: 'unknown', CitCr_same_specimen: '' };
const units = ['umol/mmol', 'mmol/mol', 'mmol/mmol', 'mol/mol', 'mg/mg', 'mg/g', 'mg/mmol'];
function runtime(initial = {}, prefixOnly = false) {
  const values = { formulaPicker: 'CitCr_spot', age: '8', ageMonths: '', sex: 'F', ...defaults,
    Ucr_spot: '100', Ucr_spot_unit: 'mmol/L', Ca_spot: '', Ca_spot_unit: 'mg/dl',
    spotSameSpecimen: false, ui_spotSameSpecimen_answer: '', spotSampleKind: '',
    spotMenstruation: false, spotHematuria: false, spotInfection: false, spotExercise: false, spotAcuteIllness: false,
    spotDiureticUse: false, spotKnownCKD: false, Cl24DurationHours: '', Cl24DurationSource: '', Cl24CollectionProblem: false, ...initial };
  const controls = Object.fromEntries(Object.entries(values).map(([id, value]) => [id,
    typeof value === 'boolean' ? { id, tagName: 'INPUT', type: 'checkbox', checked: value }
      : { id, tagName: id.endsWith('_unit') || id.endsWith('_basis') || id.endsWith('_mode') || id.includes('Entity') ? 'SELECT' : 'INPUT', type: 'text', value }]));
  const form = { querySelectorAll: () => Object.values(controls) };
  const context = { window: { currentVersion: 'spot', addEventListener() {} },
    document: { getElementById: id => id === 'clcrForm' ? form : controls[id] || null, querySelector: () => null, addEventListener() {} } };
  vm.createContext(context);
  vm.runInContext(prefixOnly ? source.split('(function(){const b=')[0] : source, context);
  return { controls, context, api: context.window, normalize: context.normalizeCitcrSessionInputs, clear: context.clearCitcrInputContext };
}

describe('Cit/Cr — real session runtime preserves only the incoming operands and basis', () => {
  it.each(['0', '10'])('legacy citrate %s is migrated as the historical acid concentration, not previous DOM basis', value => {
    const session = { selectedFormula: 'CitCr_spot', inputs: { Cit_Cr_spot: value, Ucr_spot: '100' } };
    runtime({ citrateSpotReportingEntity: 'ion' }, true).normalize(session);
    expect(session.inputs).toMatchObject({ Cit_Cr_spot: value, Cit_Cr_spot_unit: 'mg/dL', citrateSpotReportingEntity: 'acid', Ucr_spot_unit: 'mg/dl' });
  });

  it.each(units.flatMap(unit => ['acid', 'ion', 'unknown'].map(basis => [unit, basis])))('two restore cycles preserve unit %s and reported basis %s independently', (unit, basis) => {
    let saved = runtime({ CitCr_entry_mode: 'direct', CitCr_reported: '≥0,3000100', CitCr_reported_unit: unit, CitCr_reported_basis: basis,
      Cit_Cr_spot: '1,2345', Cit_Cr_spot_unit: 'mg/dL', citrateSpotReportingEntity: 'ion', CitCr_same_specimen: 'different',
      Ucr_spot: '10', Ucr_spot_unit: 'mmol/L', spotSampleKind: 'random', spotInfection: true, ui_spotInfection_answer: 'yes' }).api.buildClcrSessionSnapshot();
    for (let cycle = 0; cycle < 2; cycle += 1) {
      const { api } = runtime(); const original = structuredClone(saved);
      expect(api.applyClcrSessionSnapshot(saved, { update: false })).toBe(true);
      expect(saved).toEqual(original);
      const restored = api.buildClcrSessionSnapshot();
      expect(restored.inputs).toEqual(saved.inputs);
      expect(restored.inputs).toMatchObject({ CitCr_reported: '≥0,3000100', CitCr_reported_unit: unit, CitCr_reported_basis: basis,
        Cit_Cr_spot: '1,2345', citrateSpotReportingEntity: 'ion', CitCr_same_specimen: 'different', Ucr_spot: '10' });
      saved = restored;
    }
  });

  it.each([
    [{ Ucr_spot: '200' }, '', '200'],
    [{ Cit_Cr_spot: '2' }, '2', ''],
    [{}, '', ''],
  ])('a thin session %j does not inherit either previous operand', (inputs, citrate, cr) => {
    const { api, controls } = runtime({ Cit_Cr_spot: '1.2345', citrateSpotReportingEntity: 'ion', Cit_Cr_spot_unit: 'mg/dL' });
    const session = { selectedFormula: 'CitCr_spot', inputs };
    const original = structuredClone(session);
    expect(api.applyClcrSessionSnapshot(session, { update: false })).toBe(true);
    expect(session).toEqual(original);
    expect(controls.Cit_Cr_spot.value).toBe(citrate);
    expect(controls.Ucr_spot.value).toBe(cr);
  });

  it.each([true, false])('preserved-only Cit/Cr (inputs object present: %s) restores its actual values', withInputs => {
    const { api, controls } = runtime({ Cit_Cr_spot: '1.2345', Ucr_spot: '100' });
    const session = { selectedFormula: 'CitCr_spot', ...(withInputs ? { inputs: {} } : {}),
      preservedInputs: { Cit_Cr_spot: '3', Ucr_spot: '400', Ucr_spot_unit: 'mg/dl' } };
    const original = structuredClone(session);
    expect(api.applyClcrSessionSnapshot(session, { update: false })).toBe(true);
    expect(session).toEqual(original);
    expect(controls.Cit_Cr_spot.value).toBe('3');
    expect(controls.Ucr_spot.value).toBe('400');
    expect(controls.citrateSpotReportingEntity.value).toBe('acid');
    expect(api.buildClcrSessionSnapshot().inputs).toMatchObject({ Cit_Cr_spot: '3', Ucr_spot: '400' });
  });

  it.each(['Cit_Cr_spot', 'Ucr_spot'])('explicit empty %s wins over a preserved old operand', key => {
    const { api, controls } = runtime();
    const session = { selectedFormula: 'CitCr_spot', inputs: { [key]: '' }, preservedInputs: { Cit_Cr_spot: '3', Ucr_spot: '400' } };
    expect(api.applyClcrSessionSnapshot(session, { update: false })).toBe(true);
    expect(controls[key].value).toBe('');
    expect(api.buildClcrSessionSnapshot().inputs[key]).toBe('');
  });

  it.each(['', null, 'not-a-unit'])('an explicit invalid/empty unit %s never silently becomes legacy mass', value => {
    const { api, controls } = runtime();
    expect(api.applyClcrSessionSnapshot({ selectedFormula: 'CitCr_spot', inputs: { Cit_Cr_spot: '10', Cit_Cr_spot_unit: value },
      preservedInputs: { Cit_Cr_spot_unit: 'mg/dL', citrateSpotReportingEntity: 'acid' } }, { update: false })).toBe(true);
    expect(controls.Cit_Cr_spot_unit.value).toBe('');
  });

  it.each(['', 'unknown', null])('an explicit basis %s overrides preserved acid without inventing a known basis', value => {
    const { api, controls } = runtime();
    expect(api.applyClcrSessionSnapshot({ selectedFormula: 'CitCr_spot', inputs: { citrateSpotReportingEntity: value },
      preservedInputs: { Cit_Cr_spot: '3', Cit_Cr_spot_unit: 'mg/dL', citrateSpotReportingEntity: 'acid' } }, { update: false })).toBe(true);
    expect(controls.citrateSpotReportingEntity.value).toBe('unknown');
  });

  it('new mass unit without a supplied basis does not acquire the previous acid/ion', () => {
    const { api, controls } = runtime({ citrateSpotReportingEntity: 'acid' });
    expect(api.applyClcrSessionSnapshot({ selectedFormula: 'CitCr_spot', inputs: { Cit_Cr_spot: '10', Cit_Cr_spot_unit: 'mg/dL' } }, { update: false })).toBe(true);
    expect(controls.citrateSpotReportingEntity.value).toBe('unknown');
  });

  it.each([['no', 'different'], ['unknown', ''], ['yes', 'confirmed']])('legacy specimen answer %s wins over the old checked box', (answer, expected) => {
    const { api, controls } = runtime();
    expect(api.applyClcrSessionSnapshot({ selectedFormula: 'CitCr_spot', inputs: { ui_spotSameSpecimen_answer: answer },
      preservedInputs: { spotSameSpecimen: true } }, { update: false })).toBe(true);
    expect(controls.CitCr_same_specimen.value).toBe(expected);
  });

  it('the public rehydrate API resets a no-session mass context and both operands', () => {
    const { api, controls } = runtime({ Cit_Cr_spot: '10', Cit_Cr_spot_unit: 'mg/dL', citrateSpotReportingEntity: 'acid',
      CitCr_entry_mode: 'direct', CitCr_reported: '<0.1', CitCr_reported_unit: 'mg/mg', CitCr_reported_basis: 'ion', CitCr_same_specimen: 'different' });
    expect(api.__vildaClcrRehydrate()).toBe(true);
    for (const [key, value] of Object.entries(defaults)) expect(controls[key].value).toBe(value);
    expect(controls.Ucr_spot.value).toBe('');
    expect(controls.Ucr_spot_unit.value).toBe('mmol/L');
  });

  it('the public rehydrate API does not fill a thin next session with an earlier Cit value', () => {
    const { api, controls } = runtime({ Cit_Cr_spot: '1.2345', Ucr_spot: '100' });
    api.VildaPersistence = { readClcrSession: () => ({ selectedFormula: 'CitCr_spot', inputs: { Ucr_spot: '200' } }) };
    expect(api.__vildaClcrRehydrate()).toBe(true);
    expect(controls.Cit_Cr_spot.value).toBe('');
    expect(controls.Ucr_spot.value).toBe('200');
  });

  it('known no/unknown sample answers stay distinct from old true checkboxes', () => {
    const { api, controls, context } = runtime({ spotInfection: true, spotHematuria: true, ui_spotInfection_answer: 'yes', ui_spotHematuria_answer: 'yes', spotExercise: true });
    expect(api.applyClcrSessionSnapshot({ selectedFormula: 'CitCr_spot', inputs: { ui_spotInfection_answer: 'no', ui_spotHematuria_answer: 'unknown' },
      preservedInputs: { spotInfection: true, spotHematuria: true } }, { update: false })).toBe(true);
    expect(controls.spotExercise.checked).toBe(false);
    vm.runInContext(readFileSync(new URL('../../clcr_citcr.js', import.meta.url), 'utf8'), context);
    const input = context.window.VildaClcrCitcr.readInputFromDocument(context.document);
    expect(input.knownFacts).toMatchObject({ infection: false, hematuria: null });
    expect(input.confounders).not.toContain('infection');
    expect(input.confounders).not.toContain('hematuria');
  });

  it('an unrelated thin Ca/Cr session retains its own shared concentration unit', () => {
    const { api, controls } = runtime({ formulaPicker: 'CitCr_spot', citrateSpotReportingEntity: 'acid' });
    expect(api.applyClcrSessionSnapshot({ selectedFormula: 'CaCr_spot', inputs: { Ca_spot: '10', Ucr_spot: '100' } }, { update: false })).toBe(true);
    expect(controls.Ucr_spot.value).toBe('100');
    expect(controls.Ucr_spot_unit.value).toBe('mg/dl');
  });

  it('a derived problem-picker value is neither restored as a fact nor saved as patient input', () => {
    const { api, controls } = runtime();
    controls.ui_citcr_known_problem = { id: 'ui_citcr_known_problem', tagName: 'SELECT', type: 'select-one', value: 'different', dataset: { clcrDerivedControl: 'true' } };
    const session = { selectedFormula: 'CitCr_spot', inputs: { ui_citcr_known_problem: 'different', CitCr_same_specimen: '' },
      preservedInputs: { ui_citcr_known_problem: 'different', CitCr_same_specimen: 'different' } };
    const original = structuredClone(session);
    expect(api.applyClcrSessionSnapshot(session, { update: false })).toBe(true);
    expect(session).toEqual(original);
    expect(controls.ui_citcr_known_problem.value).toBe('');
    expect(controls.CitCr_same_specimen.value).toBe('');
    const saved = api.buildClcrSessionSnapshot();
    expect(saved.inputs).not.toHaveProperty('ui_citcr_known_problem');
    expect(saved.preservedInputs).not.toHaveProperty('ui_citcr_known_problem');
  });
});
