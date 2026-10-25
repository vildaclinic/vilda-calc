import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../inline_kalkulator_klirens_07.js', import.meta.url), 'utf8');
function runtime(initial = {}) {
  const values = { formulaPicker: 'FENa_spot', age: '45', ageMonths: '', sex: 'F',
    U_Na_spot: '40', S_Na_spot: '140', Ucr_spot: '100', Ucr_spot_unit: 'mg/dl', Scr_spot: '1', Scr_spot_unit: 'mg/dl', FENa_sample_status: 'confirmed',
    spotSameSpecimen: true, ui_spotSameSpecimen_answer: 'yes', spotPairedChemistry: true, ui_spotPairedChemistry_answer: 'yes',
    spotDiureticUse: true, ui_spotDiureticUse_answer: 'yes', spotKnownCKD: true, ui_spotKnownCKD_answer: 'yes',
    Cl24DurationHours: '', Cl24DurationSource: '', Cl24CollectionProblem: false, ...initial };
  const controls = Object.fromEntries(Object.entries(values).map(([id, value]) => [id, typeof value === 'boolean'
    ? { id, tagName: 'INPUT', type: 'checkbox', checked: value }
    : { id, tagName: id.endsWith('_unit') ? 'SELECT' : 'INPUT', type: 'text', value }]));
  const form = { querySelectorAll: () => Object.values(controls) };
  const context = { window: { currentVersion: 'spot', addEventListener() {} },
    document: { getElementById: id => id === 'clcrForm' ? form : controls[id] || null, querySelector: () => null, addEventListener() {} } };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { api: context.window, context, controls };
}
function restore(session, initial) {
  const result = runtime(initial);
  const original = structuredClone(session);
  expect(result.api.applyClcrSessionSnapshot(session, { update: false, preserveAcrossVersions: true })).toBe(true);
  expect(session).toEqual(original);
  return result;
}

describe('FENa — actual session runtime never completes a thin sample with previous patient operands', () => {
  it('one incoming sodium clears the other three old concentrations and all absent facts', () => {
    const { api, controls } = restore({ selectedFormula: 'FENa_spot', inputs: { U_Na_spot: '20' } });
    expect(controls.U_Na_spot.value).toBe('20');
    for (const id of ['S_Na_spot', 'Ucr_spot', 'Scr_spot', 'FENa_sample_status']) expect(controls[id].value).toBe('');
    for (const id of ['spotSameSpecimen', 'spotPairedChemistry', 'spotDiureticUse', 'spotKnownCKD']) {
      expect(controls[id].checked).toBe(false);
      expect(controls[`ui_${id}_answer`].value).toBe('');
    }
    expect(api.buildClcrSessionSnapshot().inputs.Scr_spot).toBe('');
  });
  it('a preserved-only session is accepted and restores its own four operands and units', () => {
    const { controls } = restore({ selectedFormula: 'FENa_spot', preserveAcrossVersions: true, preservedInputs: {
      U_Na_spot: '0', S_Na_spot: '140', Ucr_spot: '8.84', Ucr_spot_unit: 'mmol/L', Scr_spot: '88.4', Scr_spot_unit: 'umol/L', FENa_sample_status: '' } });
    expect(controls.U_Na_spot.value).toBe('0');
    expect(controls.Scr_spot.value).toBe('88.4');
    expect(controls.Scr_spot_unit.value).toBe('umol/L');
    expect(controls.Ucr_spot_unit.value).toBe('mmol/L');
    expect(controls.FENa_sample_status.value).toBe('');
  });
  it('explicit blanks win over preserved values, units and a sample confirmation', () => {
    const { api, controls } = restore({ selectedFormula: 'FENa_spot', inputs: { Scr_spot: '', Ucr_spot_unit: '', FENa_sample_status: '' },
      preservedInputs: { U_Na_spot: '20', S_Na_spot: '140', Ucr_spot: '100', Scr_spot: '1', Ucr_spot_unit: 'mg/dl', FENa_sample_status: 'confirmed' } });
    expect(controls.Scr_spot.value).toBe('');
    expect(controls.Ucr_spot_unit.value).toBe('');
    expect(controls.FENa_sample_status.value).toBe('');
    expect(api.buildClcrSessionSnapshot().inputs.Scr_spot).toBe('');
  });
  it.each(['no', 'unknown', 'yes'])('legacy paired answer %s determines the otherwise stale checkbox', answer => {
    const { controls } = restore({ selectedFormula: 'FENa_spot', inputs: { ui_spotPairedChemistry_answer: answer }, preservedInputs: { spotPairedChemistry: true } });
    expect(controls.ui_spotPairedChemistry_answer.value).toBe(answer);
    expect(controls.spotPairedChemistry.checked).toBe(answer === 'yes');
    expect(controls.FENa_sample_status.value).toBe(answer === 'no' ? 'different-time' : '');
  });
  it('unchecked legacy paired checkbox remains unknown rather than creating a no answer', () => {
    const { controls } = restore({ selectedFormula: 'FENa_spot', inputs: { spotPairedChemistry: false } });
    expect(controls.spotPairedChemistry.checked).toBe(false);
    expect(controls.ui_spotPairedChemistry_answer.value).toBe('');
  });
  it('known explicit no/unknown confounder facts are not overwritten by a preserved true', () => {
    const { controls } = restore({ selectedFormula: 'FENa_spot', inputs: { ui_spotDiureticUse_answer: 'no', ui_spotKnownCKD_answer: 'unknown' },
      preservedInputs: { spotDiureticUse: true, spotKnownCKD: true } });
    expect(controls.spotDiureticUse.checked).toBe(false);
    expect(controls.ui_spotDiureticUse_answer.value).toBe('no');
    expect(controls.spotKnownCKD.checked).toBe(false);
    expect(controls.ui_spotKnownCKD_answer.value).toBe('unknown');
  });
  it('the derived problem selector cannot restore or persist a clinical fact', () => {
    const { api, controls } = runtime();
    controls.ui_fena_sample_issue = { id: 'ui_fena_sample_issue', tagName: 'SELECT', type: 'select-one', value: 'different-time', dataset: { clcrDerivedControl: 'true' } };
    expect(api.applyClcrSessionSnapshot({ selectedFormula: 'FENa_spot', inputs: { ui_fena_sample_issue: 'different-time', FENa_sample_status: '' },
      preservedInputs: { ui_fena_sample_issue: 'different-time', FENa_sample_status: 'different-time' } }, { update: false })).toBe(true);
    expect(controls.ui_fena_sample_issue.value).toBe('');
    expect(controls.FENa_sample_status.value).toBe('');
    const saved = api.buildClcrSessionSnapshot();
    expect(saved.inputs).not.toHaveProperty('ui_fena_sample_issue');
    expect(saved.preservedInputs).not.toHaveProperty('ui_fena_sample_issue');
  });
  it('two full restore/save cycles retain original concentrations, context and units', () => {
    let saved = runtime({ U_Na_spot: '1.4000', Ucr_spot_unit: 'umol/L', Ucr_spot: '8840', Scr_spot: '0.0884', Scr_spot_unit: 'mmol/L',
      FENa_sample_status: 'different-time', ui_spotPairedChemistry_answer: 'no', spotPairedChemistry: false }).api.buildClcrSessionSnapshot();
    for (let cycle = 0; cycle < 2; cycle += 1) {
      const { api, controls } = restore(saved);
      const next = api.buildClcrSessionSnapshot();
      expect(next.inputs).toEqual(saved.inputs);
      expect(controls.FENa_sample_status.value).toBe('different-time');
      saved = next;
    }
  });
  it('the public no-session rehydrate clears all old concentrations and facts', () => {
    const { api, controls } = runtime();
    expect(api.__vildaClcrRehydrate()).toBe(true);
    for (const id of ['U_Na_spot', 'S_Na_spot', 'Ucr_spot', 'Scr_spot', 'FENa_sample_status']) expect(controls[id].value).toBe('');
    expect(controls.spotPairedChemistry.checked).toBe(false);
    expect(controls.spotDiureticUse.checked).toBe(false);
    expect(controls.spotKnownCKD.checked).toBe(false);
  });
  it('unrelated FEK data keep their concentrations and provided units', () => {
    const { controls } = restore({ selectedFormula: 'FEK_spot', inputs: { Ucr_spot: '500', Ucr_spot_unit: 'umol/L', Scr_spot: '77', Scr_spot_unit: 'umol/L' } });
    expect(controls.Ucr_spot.value).toBe('500');
    expect(controls.Ucr_spot_unit.value).toBe('umol/L');
    expect(controls.Scr_spot.value).toBe('77');
    expect(controls.Scr_spot_unit.value).toBe('umol/L');
    expect(controls.FENa_sample_status.value).toBe('');
    expect(controls.U_Na_spot.value).toBe('');
    expect(controls.S_Na_spot.value).toBe('');
  });
  it('a preserved-only FENa session can identify its own formula without an outer selectedFormula', () => {
    const { controls } = restore({ preservedInputs: { formulaPicker: 'FENa_spot', U_Na_spot: '0', S_Na_spot: '140', Ucr_spot: '100', Scr_spot: '1' } }, { formulaPicker: 'FEK_spot' });
    expect(controls.formulaPicker.value).toBe('FENa_spot');
    expect(controls.U_Na_spot.value).toBe('0');
    expect(controls.Scr_spot.value).toBe('1');
  });
  it('restoring another formula never leaves the preceding sample ready to calculate FENa', () => {
    const { api, controls, context } = runtime();
    expect(api.applyClcrSessionSnapshot({ selectedFormula: 'FEK_spot', inputs: { U_K_spot: '25', S_K_spot: '4', Ucr_spot: '100', Scr_spot: '1' } }, { update: false })).toBe(true);
    controls.formulaPicker.value = 'FENa_spot';
    for (const id of ['U_Na_spot', 'S_Na_spot']) expect(controls[id].value).toBe('');
    for (const file of ['clcr_fena_reference_data.js', 'clcr_fena.js']) vm.runInContext(readFileSync(new URL('../../' + file, import.meta.url), 'utf8'), context);
    const input = context.window.VildaClcrFena.readInputFromDocument(context.document);
    expect(context.window.VildaClcrFena.evaluate(input, context.window.VildaClcrFenaReferenceData.DEFAULT_POLICY)).toMatchObject({ valid: false, errorCode: 'missing-concentration' });
  });
  it('a restored ACR urine concentration cannot combine with old serum creatinine later', () => {
    const { api, controls } = restore({ selectedFormula: 'ACR', inputs: { U_Alb: '20', Ucr_spot: '100' } });
    controls.formulaPicker.value = 'FENa_spot';
    controls.U_Na_spot.value = '40';
    controls.S_Na_spot.value = '140';
    expect(controls.Scr_spot.value).toBe('');
    expect(api.buildClcrSessionSnapshot().inputs.Scr_spot).toBe('');
    expect(controls.spotPairedChemistry.checked).toBe(false);
  });
  it.each(['FEK_spot', 'FECl_spot'])('a full %s session keeps all supplied shared creatinine and sample facts', formulaPicker => {
    const { api } = runtime({ formulaPicker, U_Na_spot: '', S_Na_spot: '', Ucr_spot: '10.00', Ucr_spot_unit: 'mmol/L', Scr_spot: '77.00', Scr_spot_unit: 'umol/L',
      U_K_spot: '25', S_K_spot: '4', U_Cl_spot: '35', S_Cl_spot: '100', FENa_sample_status: '',
      spotSameSpecimen: true, ui_spotSameSpecimen_answer: 'yes', spotPairedChemistry: true, ui_spotPairedChemistry_answer: 'yes',
      spotDiureticUse: false, ui_spotDiureticUse_answer: 'no', spotKnownCKD: false, ui_spotKnownCKD_answer: 'unknown' });
    const saved = api.buildClcrSessionSnapshot();
    const { api: next } = restore(saved);
    expect(next.buildClcrSessionSnapshot().inputs).toEqual(saved.inputs);
  });

  it.each([['ui_spotSameSpecimen_answer', 'different-urine'], ['ui_spotPairedChemistry_answer', 'different-time']])(
    'legacy known no %s reaches canonical status even when its removed UI control is absent', (key, expected) => {
      const { api, controls } = runtime();
      delete controls[key];
      expect(api.applyClcrSessionSnapshot({ selectedFormula: 'FENa_spot', inputs: { [key]: 'no', FENa_sample_status: 'confirmed' } }, { update: false })).toBe(true);
      expect(controls.FENa_sample_status.value).toBe(expected);
      expect(api.buildClcrSessionSnapshot().preservedInputs[key]).toBe('no');
    });

});
