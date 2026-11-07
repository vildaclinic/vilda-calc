import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { ktvSessionSource, patchKtvSessionHooks } from '../../tools/patch-klirens-ktv-session.mjs';
import { patchPhDzmSessionHooks } from '../../tools/patch-klirens-ph-dzm-session.mjs';

const source = readFileSync(new URL('../../inline_kalkulator_klirens_07.js', import.meta.url), 'utf8');
function events(target = {}) {
  const listeners = new Map();
  return Object.assign(target, {
    addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(listener); },
    dispatchEvent(event) { for (const listener of listeners.get(event.type) || []) listener(event); },
  });
}

const baseline = {
  formulaPicker: 'KTV', age: '50', ageMonths: '', weight: '75', height: '170', sex: 'F', ktvToggle: true,
  ktvVariant: 'spktv', UreaPre: '100.0001', UreaPost: '30.0001', ktvDurationMinutes: '240', ktvUF: '2', ktvW: '70',
  ktvSessionsPerWeek: '3', ktvPidiDays: '2', ktvAccessType: 'AVF', ktvModality: 'IHD', ktvUreaAnalyte: 'BUN', ktvUreaUnit: 'mg/dL',
  ktvPreAnalyte: '', ktvPostAnalyte: '', ktvPreUnit: '', ktvPostUnit: '',
  ktvSameSession: true, ktvPreBeforeDialysis: true, ktvPreNoDilution: true,
  ui_ktvSameSession_answer: '', ui_ktvPreBeforeDialysis_answer: '', ui_ktvPreNoDilution_answer: '',
  ktvPostMethod: 'slow_flow_100ml_15s', ktvKru: '1.5', ktvKruMeasuredAt: '2026-11-01', ktvTreatmentsDelivered: true,
};

// Run the complete deployed runtime; this fixture supplies DOM and storage,
// rather than reproducing the normalization or restoration implementation.
function runtime(initial = baseline) {
  const controls = Object.fromEntries(Object.entries(initial).map(([id, value]) => [id, events(typeof value === 'boolean'
    ? { id, tagName: 'INPUT', type: 'checkbox', checked: value }
    : { id, tagName: id === 'formulaPicker' ? 'SELECT' : 'INPUT', type: id === 'ktvVariant' ? 'hidden' : 'text', value })]));
  const form = events({ querySelectorAll: () => Object.values(controls) });
  const clearBtn = events({ id: 'clearBtn', type: 'button' });
  const document = events({
    getElementById: id => id === 'clcrForm' ? form : id === 'clearBtn' ? clearBtn : controls[id] || null,
    querySelector: () => null,
  });
  const storage = new Map(), writes = [];
  const window = events({ currentVersion: 'pro', sessionStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key),
  }, setVersion(value) { window.currentVersion = value; },
  VildaPersistence: { readClcrSession: () => storage.has('vildaClcrSessionV1') ? JSON.parse(storage.get('vildaClcrSessionV1')) : null,
    writeClcrSession(session) { writes.push(structuredClone(session)); storage.set('vildaClcrSessionV1', JSON.stringify(session)); return true; },
    clearClcrSession() { storage.delete('vildaClcrSessionV1'); },
  } });
  document.defaultView = window;
  loadBrowserScript('clcr_clinical_safety.js', window);
  loadBrowserScript('clcr_collection_duration.js', window);
  const context = { window, document, setTimeout: () => 0, clearTimeout() {} };
  vm.createContext(context); vm.runInContext(source, context);
  return { api: window, context, document, controls, clearBtn, storage, writes };
}
const input = (result, id) => result.controls[id]?.type === 'checkbox' ? result.controls[id].checked : result.controls[id]?.value;
function restore(session, initial = baseline, options = {}) {
  const result = runtime(initial), original = structuredClone(session);
  expect(result.api.applyClcrSessionSnapshot(session, { update: false, preserveAcrossVersions: true, ...options })).toBe(true);
  expect(session).toEqual(original);
  return result;
}
function evaluate(result) {
  for (const file of ['clcr_ktv_reference_data.js', 'clcr_ktv.js']) loadBrowserScript(file, result.api);
  const engine = result.api.VildaClcrKtv;
  return engine.evaluate(engine.readInputFromDocument(result.document), result.api.VildaClcrKtvReferenceData.DEFAULT_POLICY);
}

describe('Kt/V actual session runtime', () => {
  it.each(['spktv', 'ektv', 'urr'])('preserves %s and exact operands through JSON, autosave and read-only capture', value => {
    let session = { currentVersion: 'pro', selectedFormula: 'KTV', inputs: { ...baseline, ktvVariant: value } };
    for (let cycle = 0; cycle < 2; cycle += 1) {
      const result = restore(JSON.parse(JSON.stringify(session)));
      expect(input(result, 'ktvVariant')).toBe(value);
      expect(input(result, 'UreaPre')).toBe('100.0001');
      expect(input(result, 'UreaPost')).toBe('30.0001');
      const vault = structuredClone(result.api.__vildaClcrVersionValueVault);
      const readonly = result.api.VildaClcrSessionRuntime.captureCurrentSessionReadOnly();
      expect(readonly.inputs).toMatchObject({ ktvVariant: value, UreaPre: '100.0001', UreaPost: '30.0001' });
      expect(result.api.__vildaClcrVersionValueVault).toEqual(vault);
      expect(result.writes).toEqual([]);
      expect(result.api.saveClcrSession({ force: true })).toBe(true);
      session = result.writes.at(-1);
      expect(session.inputs.ktvVariant).toBe(value);
    }
  });

  it.each(['', undefined])('uses spktv for an absent legacy variant %s', ktvVariant => {
    const inputs = { UreaPre: '100', UreaPost: '50' };
    if (ktvVariant !== undefined) inputs.ktvVariant = ktvVariant;
    const result = restore({ selectedFormula: 'KTV', inputs });
    expect(input(result, 'ktvVariant')).toBe('spktv');
    expect(result.api.buildClcrSessionSnapshot().inputs.ktvVariant).toBe('spktv');
  });

  it.each(['Unsupported', false, 0])('does not reinterpret unsupported saved variant %s as a valid spKt/V calculation', ktvVariant => {
    const result = restore({ selectedFormula: 'KTV', inputs: { ...baseline, ktvVariant } });
    expect(input(result, 'ktvVariant')).toBe(String(ktvVariant).toLowerCase());
    expect(evaluate(result)).toMatchObject({ valid: false, errorCode: 'invalid-variant' });
  });

  it('normalizes a legacy variant and repairs its Pro scope synchronously', () => {
    const result = restore({ currentVersion: 'advanced', selectedFormula: 'KTV', inputs: { ktvVariant: ' EKTV ', UreaPre: '100' } });
    expect(input(result, 'ktvVariant')).toBe('ektv');
    expect(result.api.currentVersion).toBe('pro');
    expect(result.api.buildClcrSessionSnapshot()).toMatchObject({ currentVersion: 'pro', selectedFormula: 'KTV' });
  });

  it('recognizes a preserved-only KTV session and an old enabled KTV panel', () => {
    for (const session of [
      { preservedInputs: { formulaPicker: 'KTV', ktvVariant: 'urr', UreaPre: '100', UreaPost: '45' } },
      { inputs: { ktvToggle: true, ktvVariant: 'urr', UreaPre: '100', UreaPost: '45' } },
    ]) {
      const result = restore(session);
      expect(input(result, 'formulaPicker')).toBe('KTV');
      expect(input(result, 'ktvVariant')).toBe('urr');
      expect(input(result, 'UreaPost')).toBe('45');
    }
  });

  it('a stale enabled panel cannot replace an explicit different formula', () => {
    const result = restore({ selectedFormula: 'ACR', inputs: { formulaPicker: 'ACR', ktvToggle: true } });
    expect(input(result, 'formulaPicker')).toBe('ACR');
  });

  it('explicit current blanks override preserved operands and specimen metadata', () => {
    const result = restore({ selectedFormula: 'KTV', inputs: { UreaPost: '', ktvPreUnit: '', ktvPostMethod: '' },
      preservedInputs: { UreaPre: '100', UreaPost: '30', ktvPreUnit: 'mmol/L', ktvPostMethod: 'other', ktvVariant: 'urr' } });
    expect(input(result, 'UreaPre')).toBe('100');
    for (const id of ['UreaPost', 'ktvPreUnit', 'ktvPostMethod']) expect(input(result, id)).toBe('');
    expect(input(result, 'ktvVariant')).toBe('urr');
  });

  it('a new patient cannot inherit clinical or numeric KTV values from a prior result', () => {
    const result = restore({ selectedFormula: 'KTV', inputs: { UreaPre: '120' } });
    expect(input(result, 'UreaPre')).toBe('120');
    for (const id of ['UreaPost', 'ktvDurationMinutes', 'ktvUF', 'ktvW', 'ktvSessionsPerWeek', 'ktvPidiDays', 'ktvAccessType', 'ktvModality', 'ktvKru', 'ktvKruMeasuredAt', 'ktvPostMethod']) expect(input(result, id), id).toBe('');
    for (const id of ['ktvSameSession', 'ktvPreBeforeDialysis', 'ktvPreNoDilution', 'ktvTreatmentsDelivered']) expect(input(result, id), id).toBe(false);
    expect(result.api.buildClcrSessionSnapshot().inputs.ktvKru).toBe('');
  });

  it.each(['yes', 'no', 'unknown'])('keeps explicit %s sampling provenance instead of treating a checkbox as its answer', answer => {
    const result = restore({ selectedFormula: 'KTV', inputs: { ktvSameSession: true, ui_ktvSameSession_answer: answer } });
    expect(input(result, 'ui_ktvSameSession_answer')).toBe(answer);
    expect(input(result, 'ktvSameSession')).toBe(answer === 'yes');
    const roundtrip = restore(JSON.parse(JSON.stringify(result.api.buildClcrSessionSnapshot())));
    expect(input(roundtrip, 'ui_ktvSameSession_answer')).toBe(answer);
    expect(input(roundtrip, 'ktvSameSession')).toBe(answer === 'yes');
  });

  it('does not invent negative provenance from legacy unchecked sampling boxes', () => {
    const result = restore({ selectedFormula: 'KTV', inputs: { ktvSameSession: false, ktvPreBeforeDialysis: false, ktvPreNoDilution: false } });
    for (const id of ['ui_ktvSameSession_answer', 'ui_ktvPreBeforeDialysis_answer', 'ui_ktvPreNoDilution_answer']) expect(input(result, id)).toBe('');
    expect(result.api.buildClcrSessionSnapshot().inputs.ui_ktvSameSession_answer).toBe('');
  });

  it('turns an explicitly typed negative source fact into durable hidden answer provenance', () => {
    const result = restore({ selectedFormula: 'KTV', inputs: { UreaPre: '100', UreaPost: '30' }, sourceContext: { knownFacts: { ktvSameSession: false, ktvPreNoDilution: false } } });
    expect(input(result, 'ui_ktvSameSession_answer')).toBe('no');
    expect(input(result, 'ui_ktvPreNoDilution_answer')).toBe('no');
    const roundtrip = restore(JSON.parse(JSON.stringify(result.api.buildClcrSessionSnapshot())));
    expect(input(roundtrip, 'ui_ktvSameSession_answer')).toBe('no');
    expect(input(roundtrip, 'ui_ktvPreNoDilution_answer')).toBe('no');
  });

  it('restores its typed snapshot operands and preserves all whitelisted source facts', () => {
    const result = restore({ selectedFormula: 'KTV', inputs: {}, ktvSnapshot: { schema: 'clcr-ktv', version: 1, input: {
      variant: 'urr', preUrea: '100.0001', postUrea: '30.0001', ageYears: '10', ageMonths: '2', knownFacts: { ktvSameSession: false, ktvTreatmentsDelivered: false, ktvModality: 'PD', arbitrary: 'ignored', UreaPre: 'not a fact' },
    } } });
    expect(input(result, 'ktvVariant')).toBe('urr');
    expect(input(result, 'UreaPre')).toBe('100.0001');
    expect(input(result, 'age')).toBe('10');
    expect(input(result, 'ageMonths')).toBe('2');
    expect(result.api.ClcrKtvSession.readContext(result.document)).toEqual({ knownFacts: { ktvSameSession: false, ktvTreatmentsDelivered: false, ktvModality: 'PD' } });
    const roundtrip = restore(JSON.parse(JSON.stringify(result.api.buildClcrSessionSnapshot())));
    expect(roundtrip.api.ClcrKtvSession.readContext(roundtrip.document)).toEqual({ knownFacts: { ktvSameSession: false, ktvTreatmentsDelivered: false, ktvModality: 'PD' } });
    expect(input(roundtrip, 'ui_ktvSameSession_answer')).toBe('no');
  });

  it('whitelists JSON metadata without executing data or accepting arbitrary field names', () => {
    const result = restore({ selectedFormula: 'KTV', inputs: { ktvKnownFacts: '{"ktvSameSession":false,"arbitrary":"alert(1)","age":99,"UreaPre":100}' } });
    expect(result.api.ClcrKtvSession.readContext(result.document)).toEqual({ knownFacts: { ktvSameSession: false } });
    expect(result.api.buildClcrSessionSnapshot().inputs.ktvKnownFacts).toBe('{"ktvSameSession":false}');
    for (const invalid of ['{', '[]', 'null', '"ktvSameSession:false"']) {
      const cleared = restore({ selectedFormula: 'KTV', inputs: { ktvKnownFacts: invalid } });
      expect(cleared.api.ClcrKtvSession.readContext(cleared.document)).toEqual({ knownFacts: {} });
    }
  });

  it('keeps an unsupported select fact when a real select cannot represent its restored value', () => {
    const result = runtime();
    const control = result.controls.ktvModality;
    let selected = 'IHD';
    Object.defineProperty(control, 'value', { get: () => selected, set(value) { selected = value === 'IHD' ? value : ''; }, configurable: true });
    control.tagName = 'SELECT'; control.type = 'select-one';
    expect(result.api.applyClcrSessionSnapshot({ selectedFormula: 'KTV', inputs: { ktvModality: 'PD', UreaPre: '100', UreaPost: '30' } }, { update: false })).toBe(true);
    expect(input(result, 'ktvModality')).toBe('');
    expect(result.api.ClcrKtvSession.readContext(result.document).knownFacts.ktvModality).toBe('PD');
    const saved = result.api.VildaClcrSessionRuntime.captureCurrentSessionReadOnly();
    expect(JSON.parse(saved.inputs.ktvKnownFacts).ktvModality).toBe('PD');
  });

  it('restores the actual engine without inventing confirmations or zero residual function', () => {
    const result = restore({ selectedFormula: 'KTV', inputs: { age: '50', UreaPre: '100', UreaPost: '30', ktvDurationMinutes: '240', ktvUF: '2', ktvW: '70', ktvSessionsPerWeek: '3', ktvPidiDays: '2' } });
    const assessment = evaluate(result);
    expect(assessment).toMatchObject({ valid: true, referenceActive: true, assumptions: { samplingConfirmed: false, residualKidneyFunction: 'unknown-unless-recorded', renalContribution: 'not-added' } });
    expect(assessment.input.knownFacts).not.toHaveProperty('ktvKru', 0);
    expect(assessment.input.knownFacts).not.toHaveProperty('ktvSameSession', false);
    expect(assessment.input.knownFacts).not.toHaveProperty('ktvTreatmentsDelivered', false);
    expect(input(result, 'ktvSameSession')).toBe(false);
  });

  it('preserves typed negative sampling through a blank legacy DOM, read-only capture and a real engine roundtrip', () => {
    const result = restore({ selectedFormula: 'KTV', inputs: { ...baseline, ktvSameSession: false, ui_ktvSameSession_answer: 'unknown', ktvKnownFacts: '{"ktvSameSession":false}' } });
    const before = result.api.buildClcrSessionSnapshot();
    expect(evaluate(result)).toMatchObject({ valid: false, referenceActive: false, guard: { code: 'different-sessions' }, input: { knownFacts: { ktvSameSession: false } } });
    const vault = structuredClone(result.api.__vildaClcrVersionValueVault);
    const readonly = result.api.VildaClcrSessionRuntime.captureCurrentSessionReadOnly();
    expect(result.api.__vildaClcrVersionValueVault).toEqual(vault);
    expect(before.inputs).toEqual(readonly.inputs);
    expect(result.writes).toEqual([]);
    const roundtrip = restore(JSON.parse(JSON.stringify(readonly)));
    expect(evaluate(roundtrip)).toMatchObject({ valid: false, guard: { code: 'different-sessions' } });
  });

  it('the actual engine retains unsupported modality even if its select discards the old option', () => {
    const result = runtime();
    let selected = 'IHD';
    Object.defineProperty(result.controls.ktvModality, 'value', { get: () => selected, set(value) { selected = value === 'IHD' ? value : ''; }, configurable: true });
    expect(result.api.applyClcrSessionSnapshot({ selectedFormula: 'KTV', inputs: { ...baseline, ktvModality: 'CRRT' } }, { update: false })).toBe(true);
    expect(input(result, 'ktvModality')).toBe('');
    expect(evaluate(result)).toMatchObject({ valid: false, guard: { code: 'unsupported-modality' }, input: { knownFacts: { ktvModality: 'CRRT' } } });
  });

  it('retains unsupported modality, mismatched units and post-sampling method exactly', () => {
    const result = restore({ selectedFormula: 'KTV', inputs: { ktvModality: 'PD', ktvPreAnalyte: 'BUN', ktvPostAnalyte: 'urea', ktvPreUnit: 'mg/dL', ktvPostUnit: 'mmol/L', ktvPostMethod: 'other' } });
    const expected = { ktvModality: 'PD', ktvPreAnalyte: 'BUN', ktvPostAnalyte: 'urea', ktvPreUnit: 'mg/dL', ktvPostUnit: 'mmol/L', ktvPostMethod: 'other' };
    expect(result.api.buildClcrSessionSnapshot().inputs).toMatchObject(expected);
    const roundtrip = restore(JSON.parse(JSON.stringify(result.api.buildClcrSessionSnapshot())));
    expect(roundtrip.api.VildaClcrSessionRuntime.captureCurrentSessionReadOnly().inputs).toMatchObject(expected);
  });

  it('retains hidden metadata in the vault when corresponding controls do not exist', () => {
    const initial = { ...baseline };
    for (const id of ['ktvPreUnit', 'ktvPostUnit', 'ui_ktvSameSession_answer']) delete initial[id];
    const result = restore({ selectedFormula: 'KTV', inputs: { ktvPreUnit: 'mg/dL', ktvPostUnit: 'mmol/L', ui_ktvSameSession_answer: 'no' } }, initial);
    expect(result.api.buildClcrSessionSnapshot().inputs).toMatchObject({ ktvPreUnit: 'mg/dL', ktvPostUnit: 'mmol/L', ui_ktvSameSession_answer: 'no' });
    expect(result.controls).not.toHaveProperty('ktvPreUnit');
  });

  it('formula and version switches keep variant, exact measurements and known problems together', () => {
    const result = restore({ selectedFormula: 'KTV', inputs: { ...baseline, ktvVariant: 'urr', ui_ktvSameSession_answer: 'no', ktvPostMethod: 'other' } });
    for (const formula of ['ACR', 'pH24', 'KTV']) {
      result.api.clcrCaptureVersionValues({ force: true });
      result.controls.formulaPicker.value = formula;
      result.api.clcrRestoreVersionValues({ visibleOnly: false });
      expect(input(result, 'ktvVariant')).toBe('urr');
      expect(input(result, 'UreaPre')).toBe('100.0001');
      expect(input(result, 'ui_ktvSameSession_answer')).toBe('no');
      expect(input(result, 'ktvPostMethod')).toBe('other');
    }
  });

  it('clear resets variant and all own clinical fields without replaying stale facts', () => {
    const result = runtime({ ...baseline, ktvVariant: 'ektv', ui_ktvSameSession_answer: 'no' });
    result.api.clcrCaptureVersionValues({ force: true });
    result.document.dispatchEvent({ type: 'DOMContentLoaded' });
    result.clearBtn.dispatchEvent({ type: 'click' });
    expect(input(result, 'ktvVariant')).toBe('spktv');
    for (const id of result.api.ClcrKtvSession.OWN_IDS) {
      if (result.controls[id]) expect(input(result, id), id).toBe(result.api.ClcrKtvSession.DEFAULTS[id]);
      expect(result.api.__vildaClcrVersionValueVault, id).not.toHaveProperty(id);
    }
    expect(result.api.ClcrKtvSession.readContext(result.document)).toEqual({ knownFacts: {} });
  });

  it.each([['urr', 2], ['ektv', 8]])('explicit native clear keeps %s selected with 0/%s data and removes every clinical fact', (selectedVariant, count) => {
    const result = restore({ selectedFormula: 'KTV', inputs: { ...baseline, ktvVariant: selectedVariant, ktvKnownFacts: '{"ktvSameSession":false,"ktvModality":"CRRT"}' } });
    result.document.dispatchEvent({ type: 'DOMContentLoaded' });
    result.clearBtn.dispatchEvent({ type: 'click', clcrClearedFormula: 'KTV', clcrPreservedKtvVariant: selectedVariant });
    expect(input(result, 'ktvVariant')).toBe(selectedVariant);
    for (const id of result.api.ClcrKtvSession.OWN_IDS.filter(id => id !== 'ktvVariant')) {
      if (result.controls[id]) expect(input(result, id), id).toBe(result.api.ClcrKtvSession.DEFAULTS[id]);
      expect(result.api.__vildaClcrVersionValueVault, id).not.toHaveProperty(id);
    }
    expect(result.api.ClcrKtvSession.readContext(result.document)).toEqual({ knownFacts: {} });
    const assessment = evaluate(result);
    expect(assessment).toMatchObject({ variant: selectedVariant, valid: false });
    expect(assessment.requiredFields).toHaveLength(count);
    expect(assessment.missingIds).toHaveLength(count);
    expect(result.api.VildaClcrSessionRuntime.captureCurrentSessionReadOnly().inputs.ktvVariant).toBe(selectedVariant);
  });

  it('external no-session patient rehydration clears preceding KTV clinical values', () => {
    const result = runtime({ ...baseline, ktvVariant: 'urr' });
    expect(result.api.__vildaClcrRehydrate()).toBe(true);
    expect(input(result, 'ktvVariant')).toBe('spktv');
    for (const id of ['UreaPre', 'UreaPost', 'ktvKru', 'ktvKruMeasuredAt', 'ktvModality', 'ktvPostMethod']) expect(input(result, id), id).toBe('');
  });

  it('unrelated sessions never gain unrendered KTV metadata or defaults', () => {
    const result = runtime({ formulaPicker: 'ACR', age: '10', U_Alb: '20' });
    expect(result.api.applyClcrSessionSnapshot({ selectedFormula: 'ACR', inputs: { age: '12', U_Alb: '30' } }, { update: false })).toBe(true);
    const saved = result.api.buildClcrSessionSnapshot();
    for (const id of result.api.ClcrKtvSession.OWN_IDS) {
      expect(saved.inputs, id).not.toHaveProperty(id);
      expect(result.api.__vildaClcrVersionValueVault, id).not.toHaveProperty(id);
    }
  });

  it('ignores other calculators’ source contexts and prevents stale KTV on a later switch', () => {
    const result = restore({ selectedFormula: 'ACR', inputs: { age: '12' }, sourceContext: { sourceFormula: 'ACR', ktvKru: '0', knownFacts: { ktvSameSession: false } } });
    result.controls.formulaPicker.value = 'KTV';
    expect(input(result, 'UreaPre')).toBe('');
    expect(input(result, 'ktvKru')).toBe('');
    expect(input(result, 'ui_ktvSameSession_answer')).toBe('');
  });

  it('installs synchronously and its readable patch is exactly reproducible', () => {
    const result = runtime();
    expect(result.api.ClcrKtvSession.FIELD_IDS).toContain('ktvVariant');
    expect(source).toContain(ktvSessionSource);
    expect(patchKtvSessionHooks(source)).toBe(source);
    expect(patchPhDzmSessionHooks(source)).toBe(source);
    const preceding = source.replace(ktvSessionSource, '').replace('installPhDzmSessionAdapter();installKtvSessionAdapter();', 'installPhDzmSessionAdapter();');
    expect(patchKtvSessionHooks(preceding)).toBe(source);
    expect(() => patchKtvSessionHooks(source.replace('function installKtvSessionAdapter()', 'function corruptedAdapter()'))).toThrow();
  });
});
