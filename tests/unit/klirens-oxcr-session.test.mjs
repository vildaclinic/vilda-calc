import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../inline_kalkulator_klirens_07.js', import.meta.url), 'utf8');
const defaults = { OxCr_entry_mode: 'concentration', OxCr_reported: '', OxCr_reported_unit: 'umol/mmol', Ox_Cr_spot: '', Ox_Cr_spot_unit: 'umol/L', OxCr_same_specimen: '', oxalateSpotReportingEntity: '' };
const units = ['umol/mmol', 'mmol/mol', 'mmol/mmol', 'mol/mol', ...['ion', 'acid', 'unknown'].flatMap(basis => ['mg/mg', 'mg/g', 'mg/mmol'].map(unit => unit + ':' + basis))];
function runtime(initial = {}, prefixOnly = false) {
  const values = { formulaPicker: 'OxCr_spot', age: '8', ageMonths: '', ...defaults,
    Ucr_spot: '100', Ucr_spot_unit: 'mmol/L', Ca_spot: '', Ca_spot_unit: 'mg/dl',
    spotSameSpecimen: false, ui_spotSameSpecimen_answer: '', spotSampleKind: '',
    spotMenstruation: false, spotHematuria: false, spotInfection: false, spotExercise: false, spotAcuteIllness: false,
    spotDiureticUse: false, spotKnownCKD: false, Cl24DurationHours: '', Cl24DurationSource: '', Cl24CollectionProblem: false, ...initial };
  const controls = Object.fromEntries(Object.entries(values).map(([id, value]) => [id,
    typeof value === 'boolean' ? { id, tagName: 'INPUT', type: 'checkbox', checked: value }
      : { id, tagName: id.endsWith('_unit') || id.endsWith('_mode') || id.includes('Entity') ? 'SELECT' : 'INPUT', type: 'text', value }]));
  const form = { querySelectorAll: () => Object.values(controls) };
  const context = { window: { currentVersion: 'spot', addEventListener() {} },
    document: { getElementById: id => id === 'clcrForm' ? form : controls[id] || null, querySelector: () => null, addEventListener() {} } };
  vm.createContext(context);
  vm.runInContext(prefixOnly ? source.split('(function(){const b=')[0] : source, context);
  return { controls, context, api: context.window, normalize: context.normalizeOxcrSessionInputs, clear: context.clearOxcrInputContext };
}

describe('Ox/Cr — actual legacy migration and session runtime', () => {
  it.each([['oxalic_acid', 'acid'], ['oxalate_ion', 'ion'], ['', 'unknown'], [undefined, 'unknown']])(
    'a legacy mass concentration with entity %s acquires only its own basis %s', (entity, basis) => {
      const session = { selectedFormula: 'OxCr_spot', inputs: { Ox_Cr_spot: '0', Ucr_spot: '100', age: '8',
        ...(entity === undefined ? {} : { oxalateSpotReportingEntity: entity }) } };
      const original = structuredClone(session.inputs);
      runtime({ oxalateSpotReportingEntity: 'oxalate_ion' }, true).normalize(session);
      expect(session.inputs).toMatchObject({ ...original, Ox_Cr_spot: '0', Ox_Cr_spot_unit: 'mg/dL:' + basis,
        OxCr_entry_mode: 'concentration', OxCr_reported: '', OxCr_reported_unit: 'umol/mmol', Ucr_spot_unit: 'mg/dl' });
      expect(original).not.toHaveProperty('Ox_Cr_spot_unit');
      expect(session.inputs).not.toHaveProperty('spotInfection');
    });

  it.each(units)('two real restore cycles retain the full signed result and unit %s', unit => {
    const { api } = runtime({ OxCr_entry_mode: 'direct', OxCr_reported: '≥0,3000100', OxCr_reported_unit: unit,
      Ox_Cr_spot: '1,2345', Ox_Cr_spot_unit: 'mg/dL:acid', OxCr_same_specimen: 'different',
      spotSampleKind: 'random', spotInfection: true, ui_spotInfection_answer: 'yes',
      CaCr_entry_mode: 'direct', CaCr_reported: '>0.3', CaCr_reported_unit: 'mg/mg', CaCr_same_specimen: 'confirmed' });
    let saved = api.buildClcrSessionSnapshot();
    for (let cycle = 0; cycle < 2; cycle += 1) {
      const { api: next } = runtime();
      const incoming = structuredClone(saved);
      expect(next.applyClcrSessionSnapshot(incoming, { update: false })).toBe(true);
      expect(incoming).toEqual(saved);
      const restored = next.buildClcrSessionSnapshot();
      expect(restored.inputs).toEqual(saved.inputs);
      expect(restored.inputs).toMatchObject({ OxCr_reported: '≥0,3000100', OxCr_reported_unit: unit,
        Ox_Cr_spot: '1,2345', Ox_Cr_spot_unit: 'mg/dL:acid', OxCr_same_specimen: 'different',
        spotInfection: true, ui_spotInfection_answer: 'yes', spotSampleKind: 'random', CaCr_reported: '>0.3' });
      saved = restored;
    }
  });

  it.each(['umol/L', 'mmol/L', 'mg/L:ion', 'mg/dL:acid', 'mg/L:unknown'])('restores preserved concentration %s without replacing an explicit zero', unit => {
    const { api, controls } = runtime({ Ucr_spot: '99', Ucr_spot_unit: 'mg/dl' });
    const session = { selectedFormula: 'OxCr_spot', inputs: { Ox_Cr_spot: '0', spotInfection: false }, preservedInputs: {
      Ox_Cr_spot: '999', Ox_Cr_spot_unit: unit, Ucr_spot: '10', Ucr_spot_unit: 'mmol/L',
      ui_spotHematuria_answer: 'unknown', spotHematuria: true, spotInfection: true, spotSampleKind: 'secondMorning' } };
    const original = structuredClone(session);
    expect(api.applyClcrSessionSnapshot(session, { update: false })).toBe(true);
    expect(session).toEqual(original);
    expect(controls.Ox_Cr_spot.value).toBe('0');
    expect(controls.Ox_Cr_spot_unit.value).toBe(unit);
    expect(controls.Ucr_spot.value).toBe('10');
    expect(controls.Ucr_spot_unit.value).toBe('mmol/L');
    expect(api.buildClcrSessionSnapshot().inputs).toMatchObject({ spotInfection: false, spotHematuria: true,
      ui_spotHematuria_answer: 'unknown', spotSampleKind: 'secondMorning' });
  });

  it.each([['OxCr_reported_unit', ''], ['OxCr_reported_unit', 'mg/mg'], ['OxCr_reported_unit', null],
    ['Ox_Cr_spot_unit', ''], ['Ox_Cr_spot_unit', 'mg/dL'], ['Ox_Cr_spot_unit', null]])(
    'explicit unknown unit %s=%s never becomes a silently confirmed mass basis', (key, value) => {
      const { api, controls } = runtime();
      const session = { selectedFormula: 'OxCr_spot', inputs: { [key]: value, OxCr_entry_mode: 'direct', OxCr_reported: '0.3' },
        preservedInputs: { [key]: key === 'Ox_Cr_spot_unit' ? 'mg/dL:acid' : 'mg/mg:ion' } };
      const original = structuredClone(session);
      expect(api.applyClcrSessionSnapshot(session, { update: false })).toBe(true);
      expect(session).toEqual(original);
      expect(controls[key].value).toBe('');
      expect(api.buildClcrSessionSnapshot().inputs[key]).toBe('');
    });

  it('an explicit empty result wins over a preserved prior reading', () => {
    const { api, controls } = runtime();
    const session = { selectedFormula: 'OxCr_spot', inputs: { OxCr_reported: '' },
      preservedInputs: { OxCr_entry_mode: 'direct', OxCr_reported: '>60', OxCr_reported_unit: 'umol/mmol' } };
    expect(api.applyClcrSessionSnapshot(session, { update: false })).toBe(true);
    expect(controls.OxCr_reported.value).toBe('');
    expect(controls.OxCr_entry_mode.value).toBe('direct');
    expect(api.buildClcrSessionSnapshot().inputs.OxCr_reported).toBe('');
  });

  it.each([['no', 'different'], ['unknown', ''], ['yes', 'confirmed']])('legacy answer %s wins over a checkbox', (answer, expected) => {
    const { api, controls } = runtime();
    expect(api.applyClcrSessionSnapshot({ selectedFormula: 'OxCr_spot', inputs: { ui_spotSameSpecimen_answer: answer }, preservedInputs: { spotSameSpecimen: true } }, { update: false })).toBe(true);
    expect(controls.OxCr_same_specimen.value).toBe(expected);
  });

  it('a sparse next session and a no-session rehydrate never inherit the previous entity', () => {
    const { api, controls } = runtime({ oxalateSpotReportingEntity: 'oxalate_ion', Ox_Cr_spot_unit: 'mg/dL:ion',
      OxCr_entry_mode: 'direct', OxCr_reported: '>60', OxCr_reported_unit: 'mg/mg:ion', OxCr_same_specimen: 'different' });
    expect(api.applyClcrSessionSnapshot({ selectedFormula: 'OxCr_spot', inputs: { Ox_Cr_spot: '1', Ucr_spot: '100' } }, { update: false })).toBe(true);
    expect(controls.oxalateSpotReportingEntity.value).toBe('');
    expect(controls.Ox_Cr_spot_unit.value).toBe('mg/dL:unknown');
    expect(api.buildClcrSessionSnapshot().inputs.oxalateSpotReportingEntity).toBe('');
    expect(api.__vildaClcrRehydrate()).toBe(true);
    for (const [key, value] of Object.entries(defaults)) expect(controls[key].value).toBe(value);
    expect(controls.Ucr_spot.value).toBe('');
    expect(controls.Ucr_spot_unit.value).toBe('mmol/L');
  });

  it('an explicit empty legacy entity overrides preserved ion evidence', () => {
    const { api, controls } = runtime({ oxalateSpotReportingEntity: 'oxalate_ion' });
    expect(api.applyClcrSessionSnapshot({ selectedFormula: 'OxCr_spot', inputs: { Ox_Cr_spot: '1', oxalateSpotReportingEntity: '' },
      preservedInputs: { oxalateSpotReportingEntity: 'oxalate_ion' } }, { update: false })).toBe(true);
    expect(controls.Ox_Cr_spot_unit.value).toBe('mg/dL:unknown');
  });

  it('fresh empty Ox/Cr starts in SI without interpreting an empty legacy value as mass', () => {
    const session = { selectedFormula: 'OxCr_spot', inputs: { Ox_Cr_spot: '', Ucr_spot: '' } };
    runtime({}, true).normalize(session);
    expect(session.inputs).toMatchObject({ Ox_Cr_spot_unit: 'umol/L', Ucr_spot_unit: 'mmol/L', oxalateSpotReportingEntity: '' });
  });

  it('restoring thin legacy Ca/Cr while Ox/Cr is active does not relabel an old Cr concentration as mmol/L', () => {
    const { api, controls } = runtime({ formulaPicker: 'OxCr_spot', Ucr_spot_unit: 'mg/dl', Ca_spot: '10', Ca_spot_unit: 'mg/dl',
      CaCr_entry_mode: 'concentration', CaCr_reported: '', CaCr_reported_unit: 'mg/mg', CaCr_same_specimen: '' });
    expect(api.applyClcrSessionSnapshot({ selectedFormula: 'CaCr_spot', inputs: { Ca_spot: '10', Ucr_spot: '100' } }, { update: false })).toBe(true);
    expect(controls.formulaPicker.value).toBe('CaCr_spot');
    expect(controls.Ucr_spot_unit.value).toBe('mg/dl');
  });

  it('a derived problem picker is not restored as new clinical information', () => {
    const { api, controls } = runtime();
    controls.ui_oxcr_known_problem = { id: 'ui_oxcr_known_problem', type: 'text', value: 'different', dataset: { clcrDerivedControl: 'true' } };
    expect(api.buildClcrSessionSnapshot().inputs).not.toHaveProperty('ui_oxcr_known_problem');
    const session = { selectedFormula: 'OxCr_spot', inputs: { ui_oxcr_known_problem: 'different', OxCr_same_specimen: '' },
      preservedInputs: { ui_oxcr_known_problem: 'different', OxCr_same_specimen: 'different' } };
    const original = structuredClone(session);
    expect(api.applyClcrSessionSnapshot(session, { update: false })).toBe(true);
    expect(session).toEqual(original);
    expect(controls.ui_oxcr_known_problem.value).toBe('');
    expect(controls.OxCr_same_specimen.value).toBe('');
    const saved = api.buildClcrSessionSnapshot();
    expect(saved.inputs).not.toHaveProperty('ui_oxcr_known_problem');
    expect(saved.preservedInputs).not.toHaveProperty('ui_oxcr_known_problem');
  });

  it('missing prior sample facts are cleared while explicit no/unknown answers are retained', () => {
    const fields = ['spotMenstruation', 'spotHematuria', 'spotInfection', 'spotExercise', 'spotAcuteIllness', 'spotDiureticUse', 'spotKnownCKD'];
    const initial = Object.fromEntries(fields.flatMap(id => [[id, true], [`ui_${id}_answer`, 'yes']]));
    const { api, controls, context } = runtime(initial);
    const session = { selectedFormula: 'OxCr_spot', inputs: { ui_spotInfection_answer: 'no', ui_spotHematuria_answer: 'unknown', spotExercise: false },
      preservedInputs: { spotInfection: true, ui_spotInfection_answer: 'yes', spotHematuria: true, ui_spotHematuria_answer: 'yes' } };
    expect(api.applyClcrSessionSnapshot(session, { update: false })).toBe(true);
    expect(controls.ui_spotInfection_answer.value).toBe('no');
    expect(controls.ui_spotHematuria_answer.value).toBe('unknown');
    for (const id of ['spotMenstruation', 'spotAcuteIllness', 'spotDiureticUse', 'spotKnownCKD']) {
      expect(controls[id].checked).toBe(false);
      expect(controls[`ui_${id}_answer`].value).toBe('');
    }
    vm.runInContext(readFileSync(new URL('../../clcr_oxcr.js', import.meta.url), 'utf8'), context);
    const actual = context.window.VildaClcrOxcr.readInputFromDocument(context.document);
    expect(actual.knownFacts).toMatchObject({ infection: false, hematuria: null });
    expect(actual.confounders).not.toContain('infection');
    expect(actual.confounders).not.toContain('hematuria');
  });
});
