import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../inline_kalkulator_klirens_07.js', import.meta.url), 'utf8');
function runtime(initial = {}) {
  const values = { formulaPicker: 'FEK_spot', age: '8', ageMonths: '0', ageDays: '', sex: 'F', U_K_spot: '40', S_K_spot: '4',
    U_Na_spot: '20', S_Na_spot: '140', Ucr_spot: '100', Ucr_spot_unit: 'mg/dl', Scr_spot: '1', Scr_spot_unit: 'mg/dl', FENa_sample_status: 'confirmed',
    spotSameSpecimen: true, ui_spotSameSpecimen_answer: 'yes', spotPairedChemistry: true, ui_spotPairedChemistry_answer: 'yes',
    spotDiureticUse: true, ui_spotDiureticUse_answer: 'yes', spotKnownCKD: true, ui_spotKnownCKD_answer: 'yes',
    suspectedAKI: true, ui_suspectedAKI_answer: 'yes', creatinineState: 'rapidlyChanging', Cl24DurationHours: '', Cl24DurationSource: '', Cl24CollectionProblem: false, ...initial };
  const controls = Object.fromEntries(Object.entries(values).map(([id, value]) => [id, typeof value === 'boolean' ? { id, tagName: 'INPUT', type: 'checkbox', checked: value } : { id, tagName: id.endsWith('_unit') || id === 'creatinineState' ? 'SELECT' : 'INPUT', type: id.endsWith('_unit') || id === 'creatinineState' ? 'select-one' : 'text', value }]));
  const form = { querySelectorAll: () => Object.values(controls) };
  const context = { window: { currentVersion: 'spot', addEventListener() {} }, document: { getElementById: id => id === 'clcrForm' ? form : controls[id] || null, querySelector: () => null, addEventListener() {} } };
  vm.createContext(context); vm.runInContext(source, context);
  return { api: context.window, context, controls };
}
function restore(session, initial) {
  const result = runtime(initial), original = structuredClone(session);
  expect(result.api.applyClcrSessionSnapshot(session, { update: false, preserveAcrossVersions: true })).toBe(true);
  expect(session).toEqual(original);
  return result;
}
function evaluate(result) {
  for (const file of ['clcr_clinical_safety.js', 'clcr_fek_reference_data.js', 'clcr_fek.js']) vm.runInContext(readFileSync(new URL('../../' + file, import.meta.url), 'utf8'), result.context);
  const input = result.api.VildaClcrFek.readInputFromDocument(result.context.document);
  return result.api.VildaClcrFek.evaluate(input, result.api.VildaClcrFekReferenceData.DEFAULT_POLICY);
}

describe('FEK — actual session runtime replaces potassium instead of mixing patients', () => {
  it('a thin incoming creatinine sample cannot use the preceding potassium values', () => {
    const result = restore({ selectedFormula: 'FEK_spot', inputs: { Ucr_spot: '120', Scr_spot: '1.2', spotPairedChemistry: true } });
    expect(result.controls.Ucr_spot.value).toBe('120');
    expect(result.controls.Scr_spot.value).toBe('1.2');
    for (const id of ['U_K_spot', 'S_K_spot']) expect(result.controls[id].value).toBe('');
    expect(evaluate(result)).toMatchObject({ valid: false, errorCode: 'missing-concentration' });
  });
  it('one incoming potassium clears the other three old concentration operands', () => {
    const { controls, api } = restore({ selectedFormula: 'FEK_spot', inputs: { U_K_spot: '0' } });
    expect(controls.U_K_spot.value).toBe('0');
    for (const id of ['S_K_spot', 'Ucr_spot', 'Scr_spot']) expect(controls[id].value).toBe('');
    expect(api.buildClcrSessionSnapshot().inputs.S_K_spot).toBe('');
  });
  it('a preserved-only FEK session restores its own inputs, units, confirmation and context', () => {
    const result = restore({ selectedFormula: 'FEK_spot', preservedInputs: { U_K_spot: '0', S_K_spot: '4', Ucr_spot: '8.84', Ucr_spot_unit: 'mmol/L', Scr_spot: '88.4', Scr_spot_unit: 'umol/L', FENa_sample_status: '', ui_spotDiureticUse_answer: 'no', ui_spotKnownCKD_answer: 'unknown' } });
    expect(result.controls.U_K_spot.value).toBe('0');
    expect(result.controls.Scr_spot_unit.value).toBe('umol/L');
    expect(result.controls.Ucr_spot_unit.value).toBe('mmol/L');
    expect(evaluate(result)).toMatchObject({ valid: true, rawValue: 0, knownFacts: { diureticUse: false, knownCKD: null, knownAKI: null, rapidlyChangingCreatinine: null } });
  });
  it('a preserved-only session can identify FEK without an outer formula', () => {
    const { controls } = restore({ preservedInputs: { formulaPicker: 'FEK_spot', U_K_spot: '20', S_K_spot: '4', Ucr_spot: '100', Scr_spot: '1' } }, { formulaPicker: 'FENa_spot' });
    expect(controls.formulaPicker.value).toBe('FEK_spot');
    expect(controls.U_K_spot.value).toBe('20');
  });
  it('explicit blanks override preserved potassium, creatinine and units', () => {
    const result = restore({ selectedFormula: 'FEK_spot', inputs: { U_K_spot: '', Scr_spot: '', Ucr_spot_unit: '' }, preservedInputs: { U_K_spot: '20', S_K_spot: '4', Ucr_spot: '100', Scr_spot: '1', Ucr_spot_unit: 'mg/dl' } });
    expect(result.controls.U_K_spot.value).toBe('');
    expect(result.controls.Scr_spot.value).toBe('');
    expect(result.controls.Ucr_spot_unit.value).toBe('');
    expect(evaluate(result).valid).toBe(false);
  });
  it.each(['FENa_spot', 'ACR', 'FECl_spot'])('restoring %s without potassium does not finish FEK on a later switch', selectedFormula => {
    const result = restore({ selectedFormula, inputs: { U_Na_spot: '20', S_Na_spot: '140', Ucr_spot: '100', Scr_spot: '1' } });
    result.controls.formulaPicker.value = 'FEK_spot';
    expect(result.controls.U_K_spot.value).toBe('');
    expect(result.controls.S_K_spot.value).toBe('');
    expect(evaluate(result)).toMatchObject({ valid: false, errorCode: 'missing-concentration' });
  });
  it('restoring ACR with only urine creatinine cannot reuse an old serum creatinine', () => {
    const result = restore({ selectedFormula: 'ACR', inputs: { U_Alb: '20', Ucr_spot: '100' } });
    result.controls.formulaPicker.value = 'FEK_spot'; result.controls.U_K_spot.value = '20'; result.controls.S_K_spot.value = '4';
    expect(result.controls.Scr_spot.value).toBe('');
    expect(evaluate(result).valid).toBe(false);
  });
  it('absent AKI and rapidly changing creatinine become unknown, not inherited facts', () => {
    const result = restore({ selectedFormula: 'FEK_spot', inputs: { U_K_spot: '20', S_K_spot: '4', Ucr_spot: '100', Scr_spot: '1' } });
    expect(result.controls.suspectedAKI.checked).toBe(false);
    expect(result.controls.ui_suspectedAKI_answer.value).toBe('');
    expect(result.controls.creatinineState.value).toBe('unknown');
    expect(evaluate(result).knownFacts).toMatchObject({ knownAKI: null, rapidlyChangingCreatinine: null });
  });
  it('provided AKI and rapidly changing creatinine remain distinct known facts', () => {
    const result = restore({ selectedFormula: 'FEK_spot', inputs: { U_K_spot: '20', S_K_spot: '4', Ucr_spot: '100', Scr_spot: '1', suspectedAKI: true, creatinineState: 'rapidlyChanging' } });
    expect(evaluate(result)).toMatchObject({ valid: true, referenceActive: false, knownFacts: { knownAKI: true, rapidlyChangingCreatinine: true } });
  });
  it.each(['yes', 'no', 'unknown'])('explicit AKI answer %s has precedence over a preserved checked flag', answer => {
    const result = restore({ selectedFormula: 'FEK_spot', inputs: { U_K_spot: '20', S_K_spot: '4', Ucr_spot: '100', Scr_spot: '1', ui_suspectedAKI_answer: answer }, preservedInputs: { suspectedAKI: true } });
    expect(result.controls.suspectedAKI.checked).toBe(answer === 'yes');
    expect(evaluate(result).knownFacts.knownAKI).toBe(answer === 'unknown' ? null : answer === 'yes');
  });
  it('a derived UI problem picker cannot persist or invent sample facts', () => {
    const result = runtime();
    result.controls.ui_fek_sample_issue = { id: 'ui_fek_sample_issue', tagName: 'SELECT', type: 'select-one', value: 'different-time', dataset: { clcrDerivedControl: 'true' } };
    expect(result.api.applyClcrSessionSnapshot({ selectedFormula: 'FEK_spot', inputs: { ui_fek_sample_issue: 'different-time', FENa_sample_status: '' }, preservedInputs: { ui_fek_sample_issue: 'different-time', FENa_sample_status: 'different-time' } }, { update: false })).toBe(true);
    expect(result.controls.ui_fek_sample_issue.value).toBe('');
    expect(result.controls.FENa_sample_status.value).toBe('');
    expect(result.api.buildClcrSessionSnapshot().inputs).not.toHaveProperty('ui_fek_sample_issue');
    expect(result.api.buildClcrSessionSnapshot().preservedInputs).not.toHaveProperty('ui_fek_sample_issue');
  });
  it.each(['different-time', 'different-urine'])('a known %s overrides stale legacy confirmations in FEK', issue => {
    const result = restore({ selectedFormula: 'FEK_spot', inputs: { U_K_spot: '20', S_K_spot: '4', Ucr_spot: '100', Scr_spot: '1', FENa_sample_status: issue, spotSameSpecimen: true, spotPairedChemistry: true, ui_spotSameSpecimen_answer: 'yes', ui_spotPairedChemistry_answer: 'yes' } });
    expect(result.controls.spotPairedChemistry.checked).toBe(false);
    expect(evaluate(result)).toMatchObject({ valid: false, errorCode: 'different-specimens' });
  });
  it('explicit no and unknown confounders win when their visible question controls are absent', () => {
    const result = runtime(); delete result.controls.ui_spotKnownCKD_answer; delete result.controls.ui_spotDiureticUse_answer;
    expect(result.api.applyClcrSessionSnapshot({ selectedFormula: 'FEK_spot', inputs: { U_K_spot: '20', S_K_spot: '4', Ucr_spot: '100', Scr_spot: '1', ui_spotKnownCKD_answer: 'unknown', ui_spotDiureticUse_answer: 'no' }, preservedInputs: { spotKnownCKD: true, spotDiureticUse: true } }, { update: false })).toBe(true);
    expect(evaluate(result).knownFacts).toMatchObject({ knownCKD: null, diureticUse: false });
  });
  it('the public no-session rehydrate clears all four FEK operands and old facts', () => {
    const result = runtime(); expect(result.api.__vildaClcrRehydrate()).toBe(true);
    for (const id of ['U_K_spot', 'S_K_spot', 'Ucr_spot', 'Scr_spot', 'FENa_sample_status']) expect(result.controls[id].value).toBe('');
    expect(result.controls.suspectedAKI.checked).toBe(false);
    expect(result.controls.creatinineState.value).toBe('unknown');
    expect(result.controls.spotKnownCKD.checked).toBe(false);
  });
  it('two full restore cycles keep original concentration strings, units and explicit facts', () => {
    let saved = runtime({ U_K_spot: '20.000', S_K_spot: '4.000', Ucr_spot: '8.8400', Ucr_spot_unit: 'mmol/L', Scr_spot: '88.400', Scr_spot_unit: 'umol/L', ui_spotDiureticUse_answer: 'no', spotDiureticUse: false, ui_suspectedAKI_answer: 'unknown', suspectedAKI: false }).api.buildClcrSessionSnapshot();
    for (let count = 0; count < 2; count += 1) {
      const restored = restore(saved), next = restored.api.buildClcrSessionSnapshot();
      expect(next.inputs).toEqual(saved.inputs); saved = next;
    }
  });
});
