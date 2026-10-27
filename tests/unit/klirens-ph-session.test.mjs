import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { patchPhSessionHooks, phSessionSource } from '../../tools/patch-klirens-ph-session.mjs';
import { patchUagSessionHooks } from '../../tools/patch-klirens-uag-session.mjs';
import { patchTmpGfrSessionHooks } from '../../tools/patch-klirens-tmp-session.mjs';

const source = readFileSync(new URL('../../inline_kalkulator_klirens_07.js', import.meta.url), 'utf8');

function eventTarget(target = {}) {
  const listeners = new Map();
  return Object.assign(target, {
    addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(listener); },
    dispatchEvent(event) { for (const listener of listeners.get(event.type) || []) listener(event); },
  });
}

// Execute the complete production session runtime. This fixture supplies only
// its DOM/persistence boundary; it does not reproduce restoration decisions.
function runtime(initial = {}) {
  const values = {
    formulaPicker: 'pH_spot', age: '10', ageMonths: '', ageDays: '', sex: 'F', weight: '30', height: '140',
    U_pH: '8.0001', pH24: '7.1234', spotSampleKind: 'random',
    spotInfection: true, ui_spotInfection_answer: 'yes', spotHematuria: false, ui_spotHematuria_answer: 'no',
    spotMenstruation: false, ui_spotMenstruation_answer: 'unknown',
    spotExercise: false, ui_spotExercise_answer: '', spotAcuteIllness: false, ui_spotAcuteIllness_answer: '',
    spotSameSpecimen: true, ui_spotSameSpecimen_answer: 'yes',
    spotPairedChemistry: false, ui_spotPairedChemistry_answer: 'no', FENa_sample_status: 'different-time',
    spotKnownCKD: true, ui_spotKnownCKD_answer: 'yes', spotDiureticUse: false, ui_spotDiureticUse_answer: 'unknown',
    suspectedAKI: true, ui_suspectedAKI_answer: 'yes', creatinineState: 'rapidlyChanging',
    stoneSpotFasting: true, stonePhPersistent: true, stoneUtiExcluded: false,
    Ucr_spot_unit: 'mmol/L', Scr_spot_unit: 'umol', U_PO4_spot_unit: 'mmol/L', S_PO4_spot_unit: 'mmol/L',
    tmpBurosumab: true, tmpDaysSinceDose: '14',
    tmpPairedSameTime: false, ui_tmpPairedSameTime_answer: 'no',
    tmpOvernightFasting: true, ui_tmpOvernightFasting_answer: '',
    spotBicarbonateLoad: true, ui_spotBicarbonateLoad_answer: 'yes',
    spotNagmaContext: false, ui_spotNagmaContext_answer: 'unknown',
    ...initial,
  };
  const controls = Object.fromEntries(Object.entries(values).map(([id, value]) => [id, eventTarget(typeof value === 'boolean'
    ? { id, tagName: 'INPUT', type: 'checkbox', checked: value }
    : { id, tagName: id === 'formulaPicker' || id.endsWith('_unit') ? 'SELECT' : 'INPUT', type: 'text', value })]));
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

describe('pH — actual session replacement and retained shared context', () => {
  it.each(['pH_spot', 'ACR', 'FEK_spot', 'AGu_spot', 'pH24'])('incoming %s without pH cannot inherit the preceding patient measurement', selectedFormula => {
    const result = restore({ selectedFormula, inputs: { age: '12' } });
    expect(result.controls.U_pH.value).toBe('');
    expect(result.api.buildClcrSessionSnapshot().inputs.U_pH).toBe('');
    expect(result.api.__vildaClcrVersionValueVault.U_pH).toBe('');
  });

  it.each([0, '0', '0.0000', '4.4999', '4.5', '8', '8.0001', '14'])('preserves incoming pH %s without treating zero as missing or rounding a boundary', U_pH => {
    const result = restore({ selectedFormula: 'pH_spot', inputs: { U_pH } });
    expect(result.controls.U_pH.value).toBe(String(U_pH));
    expect(result.api.buildClcrSessionSnapshot().inputs.U_pH).toBe(String(U_pH));
  });

  it('explicit blank measurement wins over a preserved value', () => {
    const result = restore({ selectedFormula: 'pH_spot', inputs: { U_pH: '' }, preservedInputs: { U_pH: '6.5' } });
    expect(result.controls.U_pH.value).toBe('');
    expect(result.api.__vildaClcrVersionValueVault.U_pH).toBe('');
  });

  it('a preserved-only pH session resolves its own formula, measured value and known facts', () => {
    const result = restore({ preservedInputs: { formulaPicker: 'pH_spot', U_pH: '4.4999', spotInfection: true, ui_spotInfection_answer: 'yes' } }, { formulaPicker: 'ACR' });
    expect(result.controls.formulaPicker.value).toBe('pH_spot');
    expect(result.controls.U_pH.value).toBe('4.4999');
    expect(result.api.buildClcrSessionSnapshot().inputs).toMatchObject({ U_pH: '4.4999', spotInfection: true, ui_spotInfection_answer: 'yes' });
  });

  it('a preserved-only autosave is accepted during external rehydration', () => {
    const result = runtime();
    result.storage.set('vildaClcrSessionV1', JSON.stringify({ preservedInputs: { formulaPicker: 'pH_spot', U_pH: '0.0000' } }));
    expect(result.api.__vildaClcrRehydrate()).toBe(true);
    expect(result.controls.formulaPicker.value).toBe('pH_spot');
    expect(result.controls.U_pH.value).toBe('0.0000');
  });

  it('two JSON restore cycles retain the exact measured pH and independent pH24 value', () => {
    let saved = restore({ selectedFormula: 'pH_spot', inputs: { U_pH: '8.0001', pH24: '7.1234', spotInfection: true } }).api.buildClcrSessionSnapshot();
    for (let cycle = 0; cycle < 2; cycle += 1) {
      const result = restore(JSON.parse(JSON.stringify(saved)));
      const next = result.api.buildClcrSessionSnapshot();
      expect(next.inputs).toEqual(saved.inputs);
      expect(next.inputs).toMatchObject({ U_pH: '8.0001', pH24: '7.1234', spotInfection: true });
      saved = next;
    }
  });

  it('an incoming patient without infection data does not inherit a preceding infection', () => {
    const result = restore({ selectedFormula: 'pH_spot', inputs: { U_pH: '6.5' } });
    expect(result.controls.spotInfection.checked).toBe(false);
    expect(result.controls.ui_spotInfection_answer.value).toBe('');
  });

  it('ordinary version switches preserve the pH measurement and known infection', () => {
    const result = restore({ selectedFormula: 'pH_spot', inputs: { U_pH: '8.0001', spotInfection: true, ui_spotInfection_answer: 'yes' } });
    for (const formula of ['ACR', 'FEK_spot', 'pH24', 'pH_spot']) {
      result.api.clcrCaptureVersionValues({ force: true });
      result.controls.formulaPicker.value = formula;
      result.api.clcrRestoreVersionValues({ visibleOnly: false });
      expect(result.controls.U_pH.value).toBe('8.0001');
      expect(result.controls.spotInfection.checked).toBe(true);
      expect(result.controls.ui_spotInfection_answer.value).toBe('yes');
    }
  });

  it('clear removes measured pH while retaining known patient and shared specimen facts exactly', () => {
    const result = runtime();
    const saved = result.api.buildClcrSessionSnapshot().inputs;
    result.document.dispatchEvent({ type: 'DOMContentLoaded' });
    result.clearBtn.dispatchEvent({ type: 'click', clcrClearedFormula: 'pH_spot', clcrPreservedPhContext: saved });
    expect(result.controls.U_pH.value).toBe('');
    expect(result.api.__vildaClcrVersionValueVault.U_pH).toBe('');
    for (const id of result.api.ClcrPhSession.CONTEXT_IDS) {
      if (!Object.hasOwn(saved, id)) continue;
      const control = result.controls[id];
      expect(control.type === 'checkbox' ? control.checked : control.value, id).toBe(saved[id]);
      expect(result.api.__vildaClcrVersionValueVault[id], id).toBe(saved[id]);
    }
  });

  it('clear restores vault-only facts without inventing fields or accepting arbitrary keys', () => {
    const result = runtime();
    delete result.controls.ui_spotInfection_answer;
    result.document.dispatchEvent({ type: 'DOMContentLoaded' });
    result.clearBtn.dispatchEvent({ type: 'click', clcrClearedFormula: 'pH_spot', clcrPreservedPhContext: {
      ui_spotInfection_answer: 'unknown', spotInfection: false, newbornContext: true, U_pH: '9', arbitraryField: 'unsafe', age: Number.NaN,
    } });
    expect(result.api.__vildaClcrVersionValueVault).toMatchObject({ ui_spotInfection_answer: 'unknown', spotInfection: false, newbornContext: true, U_pH: '' });
    expect(Object.hasOwn(result.api.__vildaClcrVersionValueVault, 'arbitraryField')).toBe(false);
    expect(Object.hasOwn(result.api.__vildaClcrVersionValueVault, 'age')).toBe(false);
  });

  it('the pH clear context cannot overwrite another formula reset', () => {
    const result = runtime();
    result.document.dispatchEvent({ type: 'DOMContentLoaded' });
    result.clearBtn.dispatchEvent({ type: 'click', clcrClearedFormula: 'pH24', clcrPreservedPhContext: { spotInfection: true, U_pH: '7' } });
    expect(result.controls.U_pH.value).toBe('');
    expect(result.controls.spotInfection.checked).toBe(false);
    expect(Object.hasOwn(result.api.__vildaClcrVersionValueVault, 'spotInfection')).toBe(false);
  });

  it('no-session external rehydration clears a preceding measured pH', () => {
    const result = runtime();
    expect(result.api.__vildaClcrRehydrate()).toBe(true);
    expect(result.controls.U_pH.value).toBe('');
  });

  it('readable patches remain reproducible and detect missing hooks', () => {
    expect(source).toContain(phSessionSource);
    expect(patchPhSessionHooks(source)).toBe(source);
    expect(patchUagSessionHooks(source)).toBe(source);
    expect(patchTmpGfrSessionHooks(source)).toBe(source);
    expect(() => patchPhSessionHooks(source.replace('normalizePhSessionInputs(n);', ''))).toThrow('Missing or duplicate pH session hook');
  });
});
