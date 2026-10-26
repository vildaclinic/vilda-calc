import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { patchUagSessionHooks, uagSessionSource } from '../../tools/patch-klirens-uag-session.mjs';

const source = readFileSync(new URL('../../inline_kalkulator_klirens_07.js', import.meta.url), 'utf8');
const analytes = { U_Na_spot: '40', U_K_spot: '25', U_Cl_spot: '80' };

function eventTarget(target = {}) {
  const listeners = new Map();
  return Object.assign(target, {
    addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(listener); },
    dispatchEvent(event) { for (const listener of listeners.get(event.type) || []) listener(event); },
  });
}

// The fixture executes the complete production session runtime. It models the
// DOM and persistence boundary only, without duplicating any restoration rule.
function runtime(initial = {}) {
  const values = {
    formulaPicker: 'AGu_spot', age: '', ageMonths: '', ageDays: '', sex: '',
    ...analytes, S_Na_spot: '140', S_K_spot: '4', S_Cl_spot: '100',
    Ucr_spot: '100', Ucr_spot_unit: 'mg/dl', Scr_spot: '1', Scr_spot_unit: 'mg/dl',
    FENa_sample_status: 'confirmed', spotSameSpecimen: true, ui_spotSameSpecimen_answer: 'yes',
    spotPairedChemistry: true, ui_spotPairedChemistry_answer: 'yes',
    spotKnownCKD: true, ui_spotKnownCKD_answer: 'yes',
    spotNagmaContext: true, ui_spotNagmaContext_answer: 'yes',
    spotDiureticUse: true, ui_spotDiureticUse_answer: 'yes',
    suspectedAKI: true, ui_suspectedAKI_answer: 'yes', creatinineState: 'rapidlyChanging',
    tmpPairedSameTime: false, ui_tmpPairedSameTime_answer: 'unknown',
    tmpOvernightFasting: false, ui_tmpOvernightFasting_answer: '',
    spotBicarbonateLoad: false, ui_spotBicarbonateLoad_answer: '',
    Cl24DurationHours: '', Cl24DurationSource: '', Cl24CollectionProblem: false,
    ...initial,
  };
  const controls = Object.fromEntries(Object.entries(values).map(([id, value]) => [id, eventTarget(typeof value === 'boolean'
    ? { id, tagName: 'INPUT', type: 'checkbox', checked: value }
    : { id, tagName: id === 'formulaPicker' || id.endsWith('_unit') || id === 'creatinineState' ? 'SELECT' : 'INPUT', type: 'text', value })]));
  const form = eventTarget({ querySelectorAll: () => Object.values(controls) });
  const clearBtn = eventTarget({ id: 'clearBtn', type: 'button' });
  const document = eventTarget({ getElementById: id => id === 'clcrForm' ? form : id === 'clearBtn' ? clearBtn : controls[id] || null, querySelector: () => null });
  const storage = new Map();
  const window = eventTarget({ currentVersion: 'spot', sessionStorage: {
    getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key),
  } });
  const context = { window, document, setTimeout: () => 0, clearTimeout() {} };
  vm.createContext(context); vm.runInContext(source, context);
  return { api: window, context, controls, clearBtn, document, storage };
}

function restore(session, initial, options = {}) {
  const result = runtime(initial), original = structuredClone(session);
  expect(result.api.applyClcrSessionSnapshot(session, { update: false, preserveAcrossVersions: true, ...options })).toBe(true);
  expect(session).toEqual(original);
  return result;
}

function evaluate(result, formula = 'Uag') {
  const name = formula.toLowerCase();
  for (const file of ['clcr_clinical_safety.js', `clcr_${name}_reference_data.js`, `clcr_${name}.js`]) {
    vm.runInContext(readFileSync(new URL('../../' + file, import.meta.url), 'utf8'), result.context);
  }
  const engine = result.api[`VildaClcr${formula}`];
  return engine.evaluate(engine.readInputFromDocument(result.context.document), result.api[`VildaClcr${formula}ReferenceData`].DEFAULT_POLICY);
}

describe('UAG — production session replacement and shared specimen provenance', () => {
  it.each(Object.keys(analytes))('a thin incoming %s never reuses the preceding two urine concentrations', id => {
    const result = restore({ selectedFormula: 'AGu_spot', inputs: { [id]: '0' } });
    for (const key of Object.keys(analytes)) expect(result.controls[key].value).toBe(key === id ? '0' : '');
    expect(evaluate(result).valid).toBe(false);
  });

  it('preserved-only UAG identifies its formula and restores its own signed calculation', () => {
    const result = restore({ preservedInputs: { formulaPicker: 'AGu_spot', ...analytes } }, { formulaPicker: 'FEK_spot' });
    expect(result.controls.formulaPicker.value).toBe('AGu_spot');
    expect(evaluate(result)).toMatchObject({ valid: true, rawValue: -15, sample: { sameUrineSpecimen: 'assumed' } });
    expect(result.controls.spotPairedChemistry.checked).toBe(false);
    expect(result.controls.spotSameSpecimen.checked).toBe(false);
  });

  it('explicit empty concentrations and unknown facts override preserved values', () => {
    const result = restore({ selectedFormula: 'AGu_spot', inputs: { U_K_spot: '', ui_spotNagmaContext_answer: 'unknown' }, preservedInputs: { ...analytes, spotNagmaContext: true } });
    expect(result.controls.U_K_spot.value).toBe('');
    expect(result.controls.spotNagmaContext.checked).toBe(false);
    expect(result.controls.ui_spotNagmaContext_answer.value).toBe('unknown');
    expect(evaluate(result).valid).toBe(false);
  });

  it.each(['FENa_spot', 'FEK_spot', 'FECl_spot', 'FEHCO3_spot', 'ACR'])('an incoming %s cannot carry preceding NAGMA or complete UAG after a formula switch', selectedFormula => {
    const result = restore({ selectedFormula, inputs: { Ucr_spot: '100' } });
    result.controls.formulaPicker.value = 'AGu_spot';
    for (const id of Object.keys(analytes)) expect(result.controls[id].value).toBe('');
    expect(result.controls.spotNagmaContext.checked).toBe(false);
    expect(result.controls.ui_spotNagmaContext_answer.value).toBe('');
    expect(evaluate(result).valid).toBe(false);
  });

  it.each(['yes', 'no', 'unknown'])('explicit NAGMA %s survives a restore with its answer control absent', answer => {
    const result = runtime();
    delete result.controls.ui_spotNagmaContext_answer;
    expect(result.api.applyClcrSessionSnapshot({ selectedFormula: 'AGu_spot', inputs: { ...analytes, ui_spotNagmaContext_answer: answer }, preservedInputs: { spotNagmaContext: true } }, { update: false })).toBe(true);
    expect(result.controls.spotNagmaContext.checked).toBe(answer === 'yes');
    expect(result.api.buildClcrSessionSnapshot().inputs.ui_spotNagmaContext_answer).toBe(answer);
    expect(evaluate(result).knownFacts.nagmaContext).toBe(answer === 'unknown' ? null : answer === 'yes');
  });

  it('absent NAGMA and CKD stay unknown, without assuming either diagnosis or its absence', () => {
    const result = restore({ selectedFormula: 'AGu_spot', inputs: analytes });
    expect(evaluate(result)).toMatchObject({ valid: true, knownFacts: { nagmaContext: null, knownCKD: null } });
    expect(result.api.buildClcrSessionSnapshot().inputs).toMatchObject({ spotNagmaContext: false, ui_spotNagmaContext_answer: '', spotKnownCKD: false, ui_spotKnownCKD_answer: '' });
  });

  it('valid legacy paired-chemistry confirmation keeps its original provenance', () => {
    const result = restore({ selectedFormula: 'AGu_spot', inputs: { ...analytes, spotPairedChemistry: true, spotSameSpecimen: false, ui_spotSameSpecimen_answer: '', ui_spotPairedChemistry_answer: '', FENa_sample_status: '' } });
    expect(evaluate(result)).toMatchObject({ valid: true, rawValue: -15, sample: { sameUrineSpecimen: 'confirmed' } });
    expect(result.api.buildClcrSessionSnapshot().inputs).toMatchObject({ spotPairedChemistry: true, spotSameSpecimen: false, ui_spotSameSpecimen_answer: '' });
  });

  it('blank tri-state widgets retain independent known legacy facts instead of erasing them', () => {
    const facts = { spotKnownCKD: true, ui_spotKnownCKD_answer: '', spotNagmaContext: true, ui_spotNagmaContext_answer: '', suspectedAKI: true, ui_suspectedAKI_answer: '', spotBicarbonateLoad: true, ui_spotBicarbonateLoad_answer: '' };
    const result = restore({ selectedFormula: 'AGu_spot', inputs: { ...analytes, ...facts } });
    expect(result.api.buildClcrSessionSnapshot().inputs).toMatchObject(facts);
    expect(evaluate(result).knownFacts).toMatchObject({ knownCKD: true, knownAKI: true, nagmaContext: true });
  });

  it('an explicit unknown sample answer remains an assumption despite stale checked legacy flags', () => {
    const result = restore({ selectedFormula: 'AGu_spot', inputs: { ...analytes, ui_spotSameSpecimen_answer: 'unknown', spotSameSpecimen: true, spotPairedChemistry: true } });
    expect(evaluate(result)).toMatchObject({ valid: true, sample: { sameUrineSpecimen: 'assumed' } });
    expect(result.api.buildClcrSessionSnapshot().inputs.ui_spotSameSpecimen_answer).toBe('unknown');
  });

  it.each([{ ui_spotSameSpecimen_answer: 'no' }, { FENa_sample_status: 'different-urine' }])('known urine mismatch blocks stale confirmations: %j', issue => {
    const result = restore({ selectedFormula: 'AGu_spot', inputs: { ...analytes, spotSameSpecimen: true, spotPairedChemistry: true, ...issue } });
    expect(evaluate(result)).toMatchObject({ valid: false, sample: { sameUrineSpecimen: 'different' } });
  });

  it('blood-only mismatch remains known for FE while UAG can use the common urine', () => {
    const result = restore({ selectedFormula: 'AGu_spot', inputs: { ...analytes, FENa_sample_status: 'different-time', spotSameSpecimen: true, spotPairedChemistry: true } });
    expect(evaluate(result)).toMatchObject({ valid: true, rawValue: -15, sample: { sameUrineSpecimen: 'confirmed' } });
    expect(result.api.buildClcrSessionSnapshot().inputs).toMatchObject({ FENa_sample_status: 'different-time', spotPairedChemistry: false, ui_spotPairedChemistry_answer: 'no' });
    expect(evaluate(result, 'Fena')).toMatchObject({ valid: false, errorCode: 'different-specimens' });
  });

  it('ordinary formula capture/restore keeps unknown provenance and never confirms FE blood', () => {
    const result = restore({ selectedFormula: 'AGu_spot', inputs: { ...analytes, ui_spotSameSpecimen_answer: 'unknown', ui_spotPairedChemistry_answer: 'unknown', spotKnownCKD: true } });
    for (const formula of ['FENa_spot', 'FEK_spot', 'FECl_spot', 'FEHCO3_spot', 'AGu_spot']) {
      result.api.clcrCaptureVersionValues({ force: true });
      result.controls.formulaPicker.value = formula;
      result.api.clcrRestoreVersionValues({ visibleOnly: false });
      expect(result.controls.spotPairedChemistry.checked).toBe(false);
      expect(result.controls.ui_spotPairedChemistry_answer.value).toBe('unknown');
      expect(result.controls.ui_spotSameSpecimen_answer.value).toBe('unknown');
      expect(result.controls.spotKnownCKD.checked).toBe(true);
    }
    expect(evaluate(result)).toMatchObject({ valid: true, sample: { sameUrineSpecimen: 'assumed' } });
  });

  it('JSON restore calls the real ownership hook only after applying the session and preserves raw strings over two cycles', () => {
    let saved = restore({ selectedFormula: 'AGu_spot', inputs: { U_Na_spot: '0.300', U_K_spot: '0.600', U_Cl_spot: '0.940', ui_spotKnownCKD_answer: 'no', ui_spotNagmaContext_answer: 'unknown' } }).api.buildClcrSessionSnapshot();
    for (let cycle = 0; cycle < 2; cycle += 1) {
      const result = runtime(); let receipts = 0;
      result.api.ClcrVisitSave = { markRestoredPatientCalculation() { receipts += 1; expect(result.controls.U_Na_spot.value).toBe('0.300'); } };
      expect(result.api.applyClcrSessionSnapshot(JSON.parse(JSON.stringify(saved)), { source: 'json-restore', update: false })).toBe(true);
      expect(receipts).toBe(1);
      expect(evaluate(result)).toMatchObject({ valid: true, rawValue: -0.04, knownFacts: { knownCKD: false, nagmaContext: null } });
      const next = result.api.buildClcrSessionSnapshot();
      expect(next.inputs).toEqual(saved.inputs);
      saved = next;
    }
  });

  it('no-session rehydrate clears every old urine operand and NAGMA fact', () => {
    const result = runtime();
    expect(result.api.__vildaClcrRehydrate()).toBe(true);
    for (const id of Object.keys(analytes)) expect(result.controls[id].value).toBe('');
    expect(result.controls.spotNagmaContext.checked).toBe(false);
    expect(result.controls.ui_spotNagmaContext_answer.value).toBe('');
    expect(result.controls.spotKnownCKD.checked).toBe(false);
  });

  it.each(['different-urine', 'different-time'])('real clear listener starts a new urine sample while retaining patient facts and independent blood issue %s', issue => {
    const result = restore({ selectedFormula: 'AGu_spot', inputs: { ...analytes, FENa_sample_status: issue, spotKnownCKD: true, ui_spotNagmaContext_answer: 'no' } });
    const saved = result.api.buildClcrSessionSnapshot().inputs;
    result.document.dispatchEvent({ type: 'DOMContentLoaded' });
    result.clearBtn.dispatchEvent({ type: 'click', clcrClearedFormula: 'AGu_spot', clcrPreservedUagContext: saved });
    for (const id of Object.keys(analytes)) expect(result.controls[id].value).toBe('');
    expect(result.controls.spotKnownCKD.checked).toBe(true);
    expect(result.controls.ui_spotSameSpecimen_answer.value).toBe('');
    expect(result.controls.spotSameSpecimen.checked).toBe(false);
    expect(result.controls.spotPairedChemistry.checked).toBe(false);
    expect(result.controls.FENa_sample_status.value).toBe(issue === 'different-time' ? 'different-time' : '');
    for (const [id, value] of Object.entries(analytes)) result.controls[id].value = value;
    expect(evaluate(result)).toMatchObject({ valid: true, rawValue: -15, sample: { sameUrineSpecimen: 'assumed' }, knownFacts: { knownCKD: true, nagmaContext: false } });
    if (issue === 'different-time') expect(evaluate(result, 'Fena')).toMatchObject({ valid: false, errorCode: 'different-specimens' });
  });

  it('the readable patch is idempotent and rejects missing runtime hooks', () => {
    expect(source).toContain(uagSessionSource);
    expect(patchUagSessionHooks(source)).toBe(source);
    expect(() => patchUagSessionHooks(source.replace('normalizeUagSessionInputs(n);', ''))).toThrow('Missing or duplicate UAG session hook');
  });
});
