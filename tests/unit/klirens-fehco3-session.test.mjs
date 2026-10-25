import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../inline_kalkulator_klirens_07.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../../kalkulator-klirens.html', import.meta.url), 'utf8');
function runtime(initial = {}) {
  const values = { formulaPicker: 'FEHCO3_spot', age: '8', ageMonths: '0', ageDays: '', sex: 'F', U_HCO3_spot: '40', S_HCO3_spot: '4',
    U_Na_spot: '20', S_Na_spot: '140', Ucr_spot: '100', Ucr_spot_unit: 'mg/dl', Scr_spot: '1', Scr_spot_unit: 'mg/dl', FENa_sample_status: 'confirmed',
    spotSameSpecimen: true, ui_spotSameSpecimen_answer: 'yes', spotPairedChemistry: true, ui_spotPairedChemistry_answer: 'yes',
    spotDiureticUse: true, ui_spotDiureticUse_answer: 'yes', spotKnownCKD: true, ui_spotKnownCKD_answer: 'yes',
    spotBicarbonateLoad: true, ui_spotBicarbonateLoad_answer: 'yes', suspectedAKI: true, ui_suspectedAKI_answer: 'yes', creatinineState: 'rapidlyChanging', Cl24DurationHours: '', Cl24DurationSource: '', Cl24CollectionProblem: false, ...initial };
  const controls = Object.fromEntries(Object.entries(values).map(([id, value]) => [id, typeof value === 'boolean' ? { id, tagName: 'INPUT', type: 'checkbox', checked: value } : { id, tagName: id.endsWith('_unit') || id === 'creatinineState' ? 'SELECT' : 'INPUT', type: id.endsWith('_unit') || id === 'creatinineState' ? 'select-one' : 'text', value }]));
  // Apply the actual select option contract, including the browser behavior
  // that assigning a non-option unit makes .value empty.
  for (const id of ['Ucr_spot_unit', 'Scr_spot_unit']) {
    const options = html.match(new RegExp('<select id="' + id + '">([\\s\\S]*?)</select>'))[1];
    const allowed = Array.from(options.matchAll(/<option value="([^"]+)"/g), match => match[1]);
    let value = allowed.includes(controls[id].value) ? controls[id].value : '';
    Object.defineProperty(controls[id], 'value', { enumerable: true, get: () => value, set: next => { value = allowed.includes(next) ? next : ''; } });
  }
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
  for (const file of ['clcr_clinical_safety.js', 'clcr_fehco3_reference_data.js', 'clcr_fehco3.js']) vm.runInContext(readFileSync(new URL('../../' + file, import.meta.url), 'utf8'), result.context);
  const input = result.api.VildaClcrFehco3.readInputFromDocument(result.context.document);
  return result.api.VildaClcrFehco3.evaluate(input, result.api.VildaClcrFehco3ReferenceData.DEFAULT_POLICY);
}

describe('FEHCO₃ — actual session runtime replaces bicarbonate instead of mixing patients', () => {
  it('a thin incoming creatinine sample cannot use the preceding bicarbonate values', () => {
    const result = restore({ selectedFormula: 'FEHCO3_spot', inputs: { Ucr_spot: '120', Scr_spot: '1.2', spotPairedChemistry: true } });
    expect(result.controls.Ucr_spot.value).toBe('120');
    expect(result.controls.Scr_spot.value).toBe('1.2');
    for (const id of ['U_HCO3_spot', 'S_HCO3_spot']) expect(result.controls[id].value).toBe('');
    expect(evaluate(result)).toMatchObject({ valid: false, errorCode: 'missing-concentration' });
  });
  it('one incoming bicarbonate clears the other three old concentration operands', () => {
    const { controls, api } = restore({ selectedFormula: 'FEHCO3_spot', inputs: { U_HCO3_spot: '0' } });
    expect(controls.U_HCO3_spot.value).toBe('0');
    for (const id of ['S_HCO3_spot', 'Ucr_spot', 'Scr_spot']) expect(controls[id].value).toBe('');
    expect(api.buildClcrSessionSnapshot().inputs.S_HCO3_spot).toBe('');
  });
  it('a preserved-only FEHCO₃ session restores its own inputs, units, confirmation and context', () => {
    const result = restore({ selectedFormula: 'FEHCO3_spot', preservedInputs: { U_HCO3_spot: '0', S_HCO3_spot: '4', Ucr_spot: '8.84', Ucr_spot_unit: 'mmol/L', Scr_spot: '88.4', Scr_spot_unit: 'umol/L', FENa_sample_status: '', ui_spotDiureticUse_answer: 'no', ui_spotKnownCKD_answer: 'unknown' } });
    expect(result.controls.U_HCO3_spot.value).toBe('0');
    expect(result.controls.Scr_spot_unit.value).toBe('umol');
    expect(result.controls.Ucr_spot_unit.value).toBe('mmol/L');
    expect(evaluate(result)).toMatchObject({ valid: true, rawValue: 0, knownFacts: { diureticUse: false, knownCKD: null, knownAKI: null, rapidlyChangingCreatinine: null } });
  });
  it('a preserved-only session can identify FEHCO₃ without an outer formula', () => {
    const { controls } = restore({ preservedInputs: { formulaPicker: 'FEHCO3_spot', U_HCO3_spot: '20', S_HCO3_spot: '4', Ucr_spot: '100', Scr_spot: '1' } }, { formulaPicker: 'FENa_spot' });
    expect(controls.formulaPicker.value).toBe('FEHCO3_spot');
    expect(controls.U_HCO3_spot.value).toBe('20');
  });
  it('explicit blanks override preserved bicarbonate, creatinine and units', () => {
    const result = restore({ selectedFormula: 'FEHCO3_spot', inputs: { U_HCO3_spot: '', Scr_spot: '', Ucr_spot_unit: '' }, preservedInputs: { U_HCO3_spot: '20', S_HCO3_spot: '4', Ucr_spot: '100', Scr_spot: '1', Ucr_spot_unit: 'mg/dl' } });
    expect(result.controls.U_HCO3_spot.value).toBe('');
    expect(result.controls.Scr_spot.value).toBe('');
    expect(result.controls.Ucr_spot_unit.value).toBe('');
    expect(evaluate(result).valid).toBe(false);
  });
  it.each(['FENa_spot', 'ACR', 'FEK_spot', 'FECl_spot'])('restoring %s without bicarbonate does not finish FEHCO₃ on a later switch', selectedFormula => {
    const result = restore({ selectedFormula, inputs: { U_Na_spot: '20', S_Na_spot: '140', Ucr_spot: '100', Scr_spot: '1' } });
    result.controls.formulaPicker.value = 'FEHCO3_spot';
    expect(result.controls.U_HCO3_spot.value).toBe('');
    expect(result.controls.S_HCO3_spot.value).toBe('');
    expect(evaluate(result)).toMatchObject({ valid: false, errorCode: 'missing-concentration' });
  });
  it('restoring ACR with only urine creatinine cannot reuse an old serum creatinine', () => {
    const result = restore({ selectedFormula: 'ACR', inputs: { U_Alb: '20', Ucr_spot: '100' } });
    result.controls.formulaPicker.value = 'FEHCO3_spot'; result.controls.U_HCO3_spot.value = '20'; result.controls.S_HCO3_spot.value = '4';
    expect(result.controls.Scr_spot.value).toBe('');
    expect(evaluate(result).valid).toBe(false);
  });
  it('absent AKI and rapidly changing creatinine become unknown, not inherited facts', () => {
    const result = restore({ selectedFormula: 'FEHCO3_spot', inputs: { U_HCO3_spot: '20', S_HCO3_spot: '4', Ucr_spot: '100', Scr_spot: '1' } });
    expect(result.controls.suspectedAKI.checked).toBe(false);
    expect(result.controls.ui_suspectedAKI_answer.value).toBe('');
    expect(result.controls.creatinineState.value).toBe('unknown');
    expect(evaluate(result).knownFacts).toMatchObject({ knownAKI: null, rapidlyChangingCreatinine: null });
  });
  it('provided AKI and rapidly changing creatinine remain distinct known facts', () => {
    const result = restore({ selectedFormula: 'FEHCO3_spot', inputs: { U_HCO3_spot: '20', S_HCO3_spot: '4', Ucr_spot: '100', Scr_spot: '1', suspectedAKI: true, creatinineState: 'rapidlyChanging' } });
    expect(evaluate(result)).toMatchObject({ valid: true, referenceActive: false, knownFacts: { knownAKI: true, rapidlyChangingCreatinine: true } });
  });
  it.each(['yes', 'no', 'unknown'])('explicit AKI answer %s has precedence over a preserved checked flag', answer => {
    const result = restore({ selectedFormula: 'FEHCO3_spot', inputs: { U_HCO3_spot: '20', S_HCO3_spot: '4', Ucr_spot: '100', Scr_spot: '1', ui_suspectedAKI_answer: answer }, preservedInputs: { suspectedAKI: true } });
    expect(result.controls.suspectedAKI.checked).toBe(answer === 'yes');
    expect(evaluate(result).knownFacts.knownAKI).toBe(answer === 'unknown' ? null : answer === 'yes');
  });
  it('a derived UI problem picker cannot persist or invent sample facts', () => {
    const result = runtime();
    result.controls.ui_fehco3_sample_issue = { id: 'ui_fehco3_sample_issue', tagName: 'SELECT', type: 'select-one', value: 'different-time', dataset: { clcrDerivedControl: 'true' } };
    expect(result.api.applyClcrSessionSnapshot({ selectedFormula: 'FEHCO3_spot', inputs: { ui_fehco3_sample_issue: 'different-time', FENa_sample_status: '' }, preservedInputs: { ui_fehco3_sample_issue: 'different-time', FENa_sample_status: 'different-time' } }, { update: false })).toBe(true);
    expect(result.controls.ui_fehco3_sample_issue.value).toBe('');
    expect(result.controls.FENa_sample_status.value).toBe('');
    expect(result.api.buildClcrSessionSnapshot().inputs).not.toHaveProperty('ui_fehco3_sample_issue');
    expect(result.api.buildClcrSessionSnapshot().preservedInputs).not.toHaveProperty('ui_fehco3_sample_issue');
  });
  it.each(['different-time', 'different-urine'])('a known %s overrides stale legacy confirmations in FEHCO₃', issue => {
    const result = restore({ selectedFormula: 'FEHCO3_spot', inputs: { U_HCO3_spot: '20', S_HCO3_spot: '4', Ucr_spot: '100', Scr_spot: '1', FENa_sample_status: issue, spotSameSpecimen: true, spotPairedChemistry: true, ui_spotSameSpecimen_answer: 'yes', ui_spotPairedChemistry_answer: 'yes' } });
    expect(result.controls.spotPairedChemistry.checked).toBe(false);
    expect(evaluate(result)).toMatchObject({ valid: false, errorCode: 'different-specimens' });
  });
  it('explicit no and unknown confounders win when their visible question controls are absent', () => {
    const result = runtime(); delete result.controls.ui_spotKnownCKD_answer; delete result.controls.ui_spotDiureticUse_answer;
    expect(result.api.applyClcrSessionSnapshot({ selectedFormula: 'FEHCO3_spot', inputs: { U_HCO3_spot: '20', S_HCO3_spot: '4', Ucr_spot: '100', Scr_spot: '1', ui_spotKnownCKD_answer: 'unknown', ui_spotDiureticUse_answer: 'no' }, preservedInputs: { spotKnownCKD: true, spotDiureticUse: true } }, { update: false })).toBe(true);
    expect(evaluate(result).knownFacts).toMatchObject({ knownCKD: null, diureticUse: false });
  });
  it('the public no-session rehydrate clears all four FEHCO₃ operands and old facts', () => {
    const result = runtime(); expect(result.api.__vildaClcrRehydrate()).toBe(true);
    for (const id of ['U_HCO3_spot', 'S_HCO3_spot', 'Ucr_spot', 'Scr_spot', 'FENa_sample_status']) expect(result.controls[id].value).toBe('');
    expect(result.controls.suspectedAKI.checked).toBe(false);
    expect(result.controls.creatinineState.value).toBe('unknown');
    expect(result.controls.spotKnownCKD.checked).toBe(false);
    expect(result.controls.spotBicarbonateLoad.checked).toBe(false);
    expect(result.controls.ui_spotBicarbonateLoad_answer.value).toBe('');
    expect(evaluate(result).knownFacts.bicarbonateLoad).toBeNull();
  });
  it('two full restore cycles keep original concentration strings, units and explicit facts', () => {
    let saved = runtime({ U_HCO3_spot: '20.000', S_HCO3_spot: '4.000', Ucr_spot: '8.8400', Ucr_spot_unit: 'mmol/L', Scr_spot: '88.400', Scr_spot_unit: 'umol', ui_spotDiureticUse_answer: 'no', spotDiureticUse: false, ui_suspectedAKI_answer: 'unknown', suspectedAKI: false }).api.buildClcrSessionSnapshot();
    for (let count = 0; count < 2; count += 1) {
      const restored = restore(saved), next = restored.api.buildClcrSessionSnapshot();
      expect(next.inputs).toEqual(saved.inputs); saved = next;
    }
  });
  it('default FEHCO₃ pairing stays an assumption and does not confirm other protocols', () => {
    const result = restore({ selectedFormula: 'FEHCO3_spot', inputs: { U_HCO3_spot: '20', S_HCO3_spot: '100', Ucr_spot: '100', Scr_spot: '1' } });
    expect(evaluate(result)).toMatchObject({ valid: true, rawValue: .2, sample: { sameUrineSpecimen: 'assumed', pairedSameTime: 'assumed' } });
    expect(result.api.buildClcrSessionSnapshot().inputs).toMatchObject({ spotSameSpecimen: false, spotPairedChemistry: false });
    expect(result.api.buildClcrSessionSnapshot().inputs).not.toHaveProperty('spotBicarbonateLoad', true);
    expect(result.api.buildClcrSessionSnapshot().inputs).not.toHaveProperty('tmpPairedSameTime', true);
  });
  it('clear-context restoration retains known facts and independent protocol answers, without restoring operands', () => {
    const result = runtime({ U_HCO3_spot: '', S_HCO3_spot: '', Ucr_spot: '', Scr_spot: '', FENa_sample_status: '', spotPairedChemistry: false });
    const saved = { FENa_sample_status: 'different-time', spotPairedChemistry: false, ui_spotPairedChemistry_answer: 'no',
      spotDiureticUse: true, ui_spotDiureticUse_answer: 'yes', spotKnownCKD: false, ui_spotKnownCKD_answer: 'no',
      tmpPairedSameTime: false, ui_tmpPairedSameTime_answer: 'no', spotBicarbonateLoad: false, ui_spotBicarbonateLoad_answer: 'unknown',
      age: '8', Ucr_spot_unit: 'mmol/L', Scr_spot_unit: 'umol/L', U_HCO3_spot: '80', Scr_spot: '9' };
    result.context.restoreClearedFehco3Context({ clcrClearedFormula: 'FEHCO3_spot', clcrPreservedFehco3Context: saved });
    expect(result.controls.FENa_sample_status.value).toBe('different-time');
    expect(result.controls.spotDiureticUse.checked).toBe(true);
    expect(result.controls.ui_spotKnownCKD_answer.value).toBe('no');
    expect(result.api.__vildaClcrVersionValueVault).toMatchObject({ tmpPairedSameTime: false, ui_tmpPairedSameTime_answer: 'no', spotBicarbonateLoad: false, ui_spotBicarbonateLoad_answer: 'unknown' });
    for (const id of ['U_HCO3_spot', 'S_HCO3_spot', 'Ucr_spot', 'Scr_spot']) expect(result.controls[id].value).toBe('');
    expect(evaluate(result)).toMatchObject({ valid: false, errorCode: 'different-specimens' });
  });


  it('a thin new sample clears the preceding loading confirmation even before switching back to FEHCO3', () => {
    const result = restore({ selectedFormula: 'FECl_spot', inputs: { U_Cl_spot: '20', S_Cl_spot: '100', Ucr_spot: '100', Scr_spot: '1' } });
    expect(result.controls.spotBicarbonateLoad.checked).toBe(false);
    expect(result.controls.ui_spotBicarbonateLoad_answer.value).toBe('');
    result.controls.formulaPicker.value = 'FEHCO3_spot';
    expect(evaluate(result)).toMatchObject({ valid: false, knownFacts: { bicarbonateLoad: null } });
  });
  it.each(['yes', 'no', 'unknown'])('explicit loading answer %s replaces any older checked flag', answer => {
    const result = restore({ selectedFormula: 'FEHCO3_spot', inputs: { U_HCO3_spot: '20', S_HCO3_spot: '100', Ucr_spot: '100', Scr_spot: '1', ui_spotBicarbonateLoad_answer: answer }, preservedInputs: { spotBicarbonateLoad: true } });
    expect(result.controls.spotBicarbonateLoad.checked).toBe(answer === 'yes');
    expect(evaluate(result)).toMatchObject({ valid: true, knownFacts: { bicarbonateLoad: answer === 'unknown' ? null : answer === 'yes' }, protocol: { completion: 'not-assessed', comparisonActive: false } });
  });

  it.each(['no', 'unknown'])('a supplied loading answer %s survives without its optional question control', answer => {
    const result = runtime();
    delete result.controls.ui_spotBicarbonateLoad_answer;
    expect(result.api.applyClcrSessionSnapshot({ selectedFormula: 'FEHCO3_spot', inputs: { U_HCO3_spot: '20', S_HCO3_spot: '100', Ucr_spot: '100', Scr_spot: '1', ui_spotBicarbonateLoad_answer: answer }, preservedInputs: { spotBicarbonateLoad: true } }, { update: false })).toBe(true);
    expect(result.controls.spotBicarbonateLoad.checked).toBe(false);
    expect(evaluate(result).knownFacts.bicarbonateLoad).toBe(answer === 'no' ? false : null);
  });
  it('changing only the selected formula keeps this intentional sample and loading fact', () => {
    const result = runtime();
    result.api.clcrCaptureVersionValues({ force: true });
    result.controls.formulaPicker.value = 'FECl_spot';
    result.controls.U_HCO3_spot.value = '';
    result.controls.spotBicarbonateLoad.checked = false;
    expect(result.api.clcrRestoreVersionValues({ visibleOnly: false })).toBe(true);
    result.controls.formulaPicker.value = 'FEHCO3_spot';
    expect(result.controls.U_HCO3_spot.value).toBe('40');
    expect(result.controls.spotBicarbonateLoad.checked).toBe(true);
    expect(evaluate(result)).toMatchObject({ valid: true, knownFacts: { bicarbonateLoad: true }, protocol: { completion: 'not-assessed', comparisonActive: false } });
  });

  it.each([
    ['mg/dL', 'mg/dl', '100', '1'],
    ['umol/L', 'umol', '8840', '88.4'],
    ['µmol/L', 'umol', '8840', '88.4'],
    ['μmol/L', 'umol', '8840', '88.4'],
    ['mmol', 'mmol/L', '8.84', '0.0884'],
  ])('incoming FEHCO₃ unit alias %s restores as actual native option %s without changing concentrations', (alias, canonical, urine, serum) => {
    const result = restore({ selectedFormula: 'FEHCO3_spot', inputs: { U_HCO3_spot: '20', S_HCO3_spot: '100', Ucr_spot: urine, Ucr_spot_unit: alias, Scr_spot: serum, Scr_spot_unit: alias } });
    expect(result.controls.Ucr_spot_unit.value).toBe(canonical);
    expect(result.controls.Scr_spot_unit.value).toBe(canonical);
    expect(result.controls.Ucr_spot.value).toBe(urine);
    expect(result.controls.Scr_spot.value).toBe(serum);
    expect(evaluate(result)).toMatchObject({ valid: true, rawValue: .2 });
    const snapshot = result.api.buildClcrSessionSnapshot();
    expect(snapshot.inputs).toMatchObject({ Ucr_spot: urine, Scr_spot: serum, Ucr_spot_unit: canonical, Scr_spot_unit: canonical });
  });
  it.each(['', 'other', 'mg/L'])('blank or unsupported FEHCO₃ select unit %s remains unavailable', unit => {
    const result = restore({ selectedFormula: 'FEHCO3_spot', inputs: { U_HCO3_spot: '20', S_HCO3_spot: '100', Ucr_spot: '100', Ucr_spot_unit: unit, Scr_spot: '1', Scr_spot_unit: 'mg/dL' } });
    expect(result.controls.Ucr_spot_unit.value).toBe('');
    expect(result.controls.Scr_spot_unit.value).toBe('mg/dl');
    expect(evaluate(result)).toMatchObject({ valid: false, errorCode: 'invalid-unit' });
  });

});
