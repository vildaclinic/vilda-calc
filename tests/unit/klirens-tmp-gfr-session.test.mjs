import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { patchTmpGfrSessionHooks, tmpGfrSessionSource } from '../../tools/patch-klirens-tmp-session.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const source = readFileSync(new URL('../../inline_kalkulator_klirens_07.js', import.meta.url), 'utf8');
const analytes = { U_PO4_spot: '20', S_PO4_spot: '1.8', Ucr_spot: '5', Scr_spot: '50' };
const sample = { ...analytes, age: '10', ageMonths: '0', sex: 'M', U_PO4_spot_unit: 'mmol/L', S_PO4_spot_unit: 'mmol/L', Ucr_spot_unit: 'mmol/L', Scr_spot_unit: 'umol' };
const html = readFileSync(new URL('../../kalkulator-klirens.html', import.meta.url), 'utf8');

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
    formulaPicker: 'TMP_GFR', age: '', ageMonths: '', ageDays: '', sex: '',
    ...analytes, U_PO4_spot_unit: 'mmol/L', S_PO4_spot_unit: 'mmol/L', tmpBurosumab: true, tmpDaysSinceDose: '14', S_Na_spot: '140', S_K_spot: '4', S_Cl_spot: '100',
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
  for (const id of ['Ucr_spot_unit', 'Scr_spot_unit', 'U_PO4_spot_unit', 'S_PO4_spot_unit']) {
    const options = html.match(new RegExp('<select id="' + id + '">([\\s\\S]*?)</select>'))[1];
    const allowed = Array.from(options.matchAll(/<option value="([^"]+)"/g), match => match[1]);
    let value = allowed.includes(controls[id].value) ? controls[id].value : '';
    Object.defineProperty(controls[id], 'value', { enumerable: true, get: () => value, set: next => { value = allowed.includes(next) ? next : ''; } });
  }
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

function evaluate(result) {
  for (const file of ['clcr_clinical_safety.js', 'clcr_tmp_gfr_reference_data.js', 'clcr_tmp_gfr.js']) {
    vm.runInContext(readFileSync(new URL('../../' + file, import.meta.url), 'utf8'), result.context);
  }
  const engine = result.api.VildaClcrTmpGfr;
  return engine.evaluate(engine.readInputFromDocument(result.context.document), result.api.VildaClcrTmpGfrReferenceData.DEFAULT_POLICY);
}

describe('TmP/GFR — actual session replacement and burosumab context', () => {
  it.each(Object.keys(analytes))('one incoming %s cannot reuse the previous three concentrations or treatment timing', id => {
    const result = restore({ selectedFormula: 'TMP_GFR', inputs: { [id]: '1', age: '10' } });
    for (const key of Object.keys(analytes)) expect(result.controls[key].value).toBe(key === id ? '1' : '');
    expect(result.controls.tmpBurosumab.checked).toBe(false);
    expect(result.controls.tmpDaysSinceDose.value).toBe('');
    expect(evaluate(result).valid).toBe(false);
  });

  it.each(['ACR', 'FEK_spot', 'AGu_spot'])('incoming %s cannot leave phosphate or drug facts for a later switch', selectedFormula => {
    const result = restore({ selectedFormula, inputs: { Ucr_spot: '100' } });
    result.controls.formulaPicker.value = 'TMP_GFR';
    for (const key of ['U_PO4_spot', 'S_PO4_spot', 'tmpDaysSinceDose']) expect(result.controls[key].value).toBe('');
    expect(result.controls.tmpBurosumab.checked).toBe(false);
  });

  it('preserved-only TMP resolves its formula and all original inputs', () => {
    const result = restore({ preservedInputs: { formulaPicker: 'TMP_GFR', ...sample, tmpBurosumab: true, tmpDaysSinceDose: '14' } }, { formulaPicker: 'FEK_spot' });
    expect(result.controls.formulaPicker.value).toBe('TMP_GFR');
    expect(result.api.buildClcrSessionSnapshot().inputs).toMatchObject({ ...sample, tmpBurosumab: true, tmpDaysSinceDose: '14' });
    expect(evaluate(result).valid).toBe(true);
    expect(evaluate(result).rawValue).toBeCloseTo(1.6, 12);
  });

  it('explicit blank timing and false therapy override preserved treatment facts', () => {
    const result = restore({ selectedFormula: 'TMP_GFR', inputs: { tmpBurosumab: false, tmpDaysSinceDose: '' }, preservedInputs: { ...sample, tmpBurosumab: true, tmpDaysSinceDose: '14' } });
    expect(result.controls.tmpBurosumab.checked).toBe(false);
    expect(result.controls.tmpDaysSinceDose.value).toBe('');
    expect(evaluate(result).treatment.enabled).toBe(false);
  });

  it.each(['yes', 'no', 'unknown'])('saved pairing %s takes precedence over a checked legacy confirmation', answer => {
    const result = restore({ selectedFormula: 'TMP_GFR', inputs: { ...sample, ui_tmpPairedSameTime_answer: answer }, preservedInputs: { tmpPairedSameTime: true } });
    expect(result.controls.tmpPairedSameTime.checked).toBe(answer === 'yes');
    expect(result.api.buildClcrSessionSnapshot().inputs.ui_tmpPairedSameTime_answer).toBe(answer);
  });

  it('blank tri-state answers retain historical facts instead of inventing a new no', () => {
    const result = restore({ selectedFormula: 'TMP_GFR', inputs: { ...sample, tmpPairedSameTime: true, tmpOvernightFasting: true, ui_tmpPairedSameTime_answer: '', ui_tmpOvernightFasting_answer: '' } });
    expect(result.api.buildClcrSessionSnapshot().inputs).toMatchObject({ tmpPairedSameTime: true, tmpOvernightFasting: true, ui_tmpPairedSameTime_answer: '', ui_tmpOvernightFasting_answer: '' });
  });

  it.each(['different-time', 'different-urine'])('known %s survives stale confirmations and blocks computation', issue => {
    const result = restore({ selectedFormula: 'TMP_GFR', inputs: { ...sample, FENa_sample_status: issue, tmpPairedSameTime: true, spotSameSpecimen: true, spotPairedChemistry: true } });
    expect(result.controls.tmpPairedSameTime.checked).toBe(false);
    expect(evaluate(result).valid).toBe(false);
  });

  it('unknown protocol remains an assumption, never a newly checked confirmation', () => {
    const result = restore({ selectedFormula: 'TMP_GFR', inputs: sample });
    expect(result.api.buildClcrSessionSnapshot().inputs).toMatchObject({ tmpPairedSameTime: false, ui_tmpPairedSameTime_answer: '', tmpOvernightFasting: false, ui_tmpOvernightFasting_answer: '', tmpBurosumab: false, tmpDaysSinceDose: '' });
    expect(evaluate(result).valid).toBe(true);
  });

  it('unit aliases are compatible with the actual native selects without converting the number', () => {
    const result = restore({ selectedFormula: 'TMP_GFR', inputs: { ...sample, Scr_spot_unit: 'µmol/L', Ucr_spot_unit: 'mmol', U_PO4_spot_unit: 'MMOL/L' } });
    expect(result.controls.Scr_spot_unit.value).toBe('umol');
    expect(result.controls.Ucr_spot_unit.value).toBe('mmol/L');
    expect(result.controls.U_PO4_spot_unit.value).toBe('mmol/L');
    expect(evaluate(result).valid).toBe(true);
    expect(evaluate(result).rawValue).toBeCloseTo(1.6, 12);
  });

  it('an unknown unit is never converted into a valid default', () => {
    const result = restore({ selectedFormula: 'TMP_GFR', inputs: { ...sample, S_PO4_spot_unit: 'mEq/L' } });
    expect(result.controls.S_PO4_spot_unit.value).toBe('');
    expect(evaluate(result).valid).toBe(false);
  });

  it('two JSON restore cycles preserve raw strings, therapy interval and independent clinical facts', () => {
    let saved = restore({ selectedFormula: 'TMP_GFR', inputs: { ...sample, U_PO4_spot: '20.000', S_PO4_spot: '1.8000', tmpBurosumab: true, tmpDaysSinceDose: '014', spotKnownCKD: true, ui_suspectedAKI_answer: 'no' } }).api.buildClcrSessionSnapshot();
    for (let cycle = 0; cycle < 2; cycle += 1) {
      const result = restore(JSON.parse(JSON.stringify(saved)));
      const next = result.api.buildClcrSessionSnapshot();
      expect(next.inputs).toEqual(saved.inputs);
      expect(next.inputs).toMatchObject({ tmpBurosumab: true, tmpDaysSinceDose: '014', U_PO4_spot: '20.000', spotKnownCKD: true, ui_suspectedAKI_answer: 'no' });
      saved = next;
    }
  });

  it('no-session external rehydrate clears treatment, timing and all four concentrations', () => {
    const result = runtime();
    expect(result.api.__vildaClcrRehydrate()).toBe(true);
    for (const id of [...Object.keys(analytes), 'tmpDaysSinceDose']) expect(result.controls[id].value).toBe('');
    expect(result.controls.tmpBurosumab.checked).toBe(false);
    expect(result.controls.tmpPairedSameTime.checked).toBe(false);
    expect(result.controls.tmpOvernightFasting.checked).toBe(false);
  });

  it('clear preserves patient facts and starts a new paired sample without previous specimen problems or dose timing', () => {
    const result = restore({ selectedFormula: 'TMP_GFR', inputs: { ...sample, tmpBurosumab: true, tmpDaysSinceDose: '14', spotKnownCKD: true, FENa_sample_status: 'different-time' } });
    expect(evaluate(result).valid).toBe(false);
    const saved = result.api.buildClcrSessionSnapshot().inputs;
    result.document.dispatchEvent({ type: 'DOMContentLoaded' });
    result.clearBtn.dispatchEvent({ type: 'click', clcrClearedFormula: 'TMP_GFR', clcrPreservedTmpGfrContext: saved });
    for (const id of [...Object.keys(analytes), 'tmpDaysSinceDose']) expect(result.controls[id].value).toBe('');
    expect(result.controls.tmpBurosumab.checked).toBe(true);
    expect(result.controls.age.value).toBe('10');
    expect(result.controls.spotKnownCKD.checked).toBe(true);
    expect(result.controls.FENa_sample_status.value).toBe('');
    expect(result.controls.tmpPairedSameTime.checked).toBe(false);
    expect(result.controls.ui_tmpPairedSameTime_answer.value).toBe('');
    expect(result.controls.spotPairedChemistry.checked).toBe(false);
    expect(result.controls.spotSameSpecimen.checked).toBe(false);
    expect(result.api.__vildaClcrVersionValueVault.tmpDaysSinceDose).toBe('');
    for (const [id, value] of Object.entries(analytes)) result.controls[id].value = value;
    expect(evaluate(result).valid).toBe(true);
    expect(evaluate(result).knownFacts.knownCKD).toBe(true);
  });

  it('readable session patch is idempotent and detects a missing runtime hook', () => {
    expect(source).toContain(tmpGfrSessionSource);
    expect(patchTmpGfrSessionHooks(source)).toBe(source);
    expect(() => patchTmpGfrSessionHooks(source.replace('normalizeTmpGfrSessionInputs(n);', ''))).toThrow('Missing or duplicate TmP/GFR session hook');
  });
});

function historyRuntime() {
  const patientId = 'fictional-tmp-current';
  const state = { unlocked: true, account: 'fictional-account', reads: [], invalidations: 0 };
  const listeners = {};
  const notes = [{ id: 'fictional-tmp-measurement', patientId }, { id: 'fictional-other-measurement', patientId: 'fictional-other' }];
  const vault = {
    isUnlocked: () => state.unlocked,
    getCurrentUser: () => ({ userId: state.account }),
    getPatient: async id => ({ patientId: id }),
    listPatientNotesForPatient: async id => { state.reads.push(id); return notes; },
    onLock: fn => { listeners.lock = fn; return () => {}; },
    onPatientNoteChanged: fn => { listeners.note = fn; return () => {}; },
  };
  const browser = { VildaVault: vault, ClcrTmpGfrHistory: { invalidate() { state.invalidations += 1; } } };
  loadBrowserScript('clcr_ui_workflow.js', browser);
  browser.ClcrVisitSave._setPatientId(patientId);
  return { browser, api: browser.ClcrVisitSave, vault, patientId, state, listeners, notes };
}

describe('TmP/GFR — treatment history belongs to the current saved patient', () => {
  it('returns only current-patient notes and does not write anything', async () => {
    const r = historyRuntime();
    expect(await r.api.readTmpGfrHistory(r.patientId)).toEqual([r.notes[0]]);
    expect(r.state.reads).toEqual([r.patientId]);
  });

  it.each(['no-patient', 'other-patient', 'locked'])('rejects %s before reading clinical notes', async mode => {
    const r = historyRuntime();
    if (mode === 'no-patient') r.api._setPatientId(null);
    if (mode === 'locked') r.state.unlocked = false;
    await expect(r.api.readTmpGfrHistory(mode === 'other-patient' ? 'fictional-other' : r.patientId)).rejects.toThrow('TMP_HISTORY_CONTEXT_UNAVAILABLE');
    expect(r.state.reads).toEqual([]);
  });

  it('a non-persisted patient is not accepted merely because its id is selected', async () => {
    const r = historyRuntime();
    r.vault.getPatient = async () => null;
    await expect(r.api.readTmpGfrHistory(r.patientId)).rejects.toThrow('TMP_HISTORY_CONTEXT_CHANGED');
    expect(r.state.reads).toEqual([]);
  });

  it('a read failure is distinguishable from an empty history', async () => {
    const r = historyRuntime();
    r.vault.listPatientNotesForPatient = async () => { throw new Error('Fikcyjny błąd odczytu'); };
    await expect(r.api.readTmpGfrHistory(r.patientId)).rejects.toThrow('Fikcyjny błąd odczytu');
  });

  it.each(['patient', 'account', 'vault', 'lock', 'patient-away-and-back'])('rejects a late %s history response', async change => {
    const r = historyRuntime();
    let complete;
    const pending = new Promise(resolve => { complete = resolve; });
    let begin;
    const started = new Promise(resolve => { begin = resolve; });
    r.vault.listPatientNotesForPatient = async () => { begin(); return pending; };
    const reading = r.api.readTmpGfrHistory(r.patientId);
    await started;
    if (change === 'patient') r.api._setPatientId('fictional-other');
    if (change === 'account') r.state.account = 'fictional-other-account';
    if (change === 'vault') r.browser.VildaVault = { ...r.vault };
    if (change === 'lock') { r.state.unlocked = false; r.listeners.lock(); }
    if (change === 'patient-away-and-back') { r.api._setPatientId('fictional-other'); r.api._setPatientId(r.patientId); }
    complete(r.notes);
    await expect(reading).rejects.toThrow('TMP_HISTORY_CONTEXT_CHANGED');
  });

  it('note changes and vault lock invalidate a cached treatment comparison', async () => {
    const r = historyRuntime();
    await r.api.readTmpGfrHistory(r.patientId);
    const initial = r.state.invalidations;
    r.listeners.note({ patientId: r.patientId, noteId: 'fictional-tmp-measurement' });
    expect(r.state.invalidations).toBe(initial + 1);
    r.listeners.note({ patientId: 'fictional-other', noteId: 'fictional-other-measurement' });
    expect(r.state.invalidations).toBe(initial + 1);
    r.listeners.lock();
    expect(r.state.invalidations).toBe(initial + 2);
  });
});

describe('TmP/GFR — asynchronous comparison does not create another saved measurement', () => {
  function saveRuntime() {
    const browser = {}, writes = [];
    for (const file of ['clcr_clinical_safety.js', 'clcr_tmp_gfr_reference_data.js', 'clcr_tmp_gfr.js', 'clcr_tmp_gfr_persistence.js', 'clcr_saved_legacy_calculator.js']) loadBrowserScript(file, browser);
    browser.VildaVault = {
      isUnlocked: () => true,
      getCurrentUser: () => ({ userId: 'fictional-tmp-account' }),
      getPatient: async patientId => ({ patientId }),
      getPatientNote: async id => writes.find(note => note.id === id) || null,
      savePatientNoteOnce: async payload => { writes.push(payload); return { id: payload.id, saved: true }; },
    };
    loadBrowserScript('clcr_ui_workflow.js', browser);
    browser.ClcrVisitSave._setPatientId('fictional-tmp-patient');
    const values = { ...sample, tmpBurosumab: true, tmpDaysSinceDose: '14' };
    const policy = browser.VildaClcrTmpGfrReferenceData.DEFAULT_POLICY;
    const engine = browser.VildaClcrTmpGfr;
    const input = { ...engine.inputFromValues(values), clinicalDate: '2026-10-26' };
    const base = browser.ClcrSavedLegacyCalculator.recalculate('TMP_GFR', values, 'TMP_GFR', { clinicalDateISO: input.clinicalDate });
    const point = (options, patch = {}) => ({ ...base, tmpGfrSnapshot: engine.evaluate({ ...input, ...patch }, policy, options) });
    return { browser, api: browser.ClcrVisitSave, writes, point, input, policy, engine };
  }

  it('reuses the completed operation after history loading, a new comparison and an edited prior measurement', async () => {
    const r = saveRuntime();
    const loading = r.point({ comparisonReason: 'history-loading' });
    const options = { clinicalDateISO: '2026-10-26', datapoints: [loading] };
    const identity = r.api.createSaveOperation(options).key;
    expect(await r.api.saveActiveResultToCard(options)).toMatchObject({ ok: true, saved: 1 });
    const previous = r.engine.evaluate({ ...r.input, serumPhosphate: '1.1', clinicalDate: '2026-09-28' }, r.policy);
    const withHistory = r.point({ previous });
    expect(withHistory.tmpGfrSnapshot.treatment.comparisonAllowed).toBe(true);
    expect(r.api.createSaveOperation({ ...options, datapoints: [withHistory] }).key).toBe(identity);
    expect(await r.api.saveActiveResultToCard({ ...options, datapoints: [withHistory] })).toMatchObject({ ok: true, saved: 1 });
    const editedPrior = r.engine.evaluate({ ...r.input, serumPhosphate: '1.5', clinicalDate: '2026-09-27' }, r.policy);
    const changedComparison = r.point({ previous: editedPrior });
    expect(r.api.createSaveOperation({ ...options, datapoints: [changedComparison] }).key).toBe(identity);
    expect(await r.api.saveActiveResultToCard({ ...options, datapoints: [changedComparison] })).toMatchObject({ ok: true, saved: 1 });
    expect(r.writes).toHaveLength(1);
    // The saved record still contains the exact comment displayed at save;
    // identity normalization never rewrites its clinical payload.
    expect(r.browser.ClcrTmpGfrPersistence.savedAssessment(r.writes[0]).treatment.reason).toBe('history-loading');
    expect(loading.tmpGfrSnapshot.treatment.reason).toBe('history-loading');
  });

  it.each([{ daysSinceDose: 7, daysSinceDoseRaw: '7' }, { burosumab: false }, { knownAKI: true }, { knownCKD: true }, { serumPhosphate: '1.4' }, { ageYears: 19 }])('retains current clinical changes in measurement identity: %j', patch => {
    const r = saveRuntime(), options = { clinicalDateISO: '2026-10-26' };
    const before = r.api.createSaveOperation({ ...options, datapoints: [r.point({ comparisonReason: 'history-loading' })] });
    const after = r.api.createSaveOperation({ ...options, datapoints: [r.point({ comparisonReason: 'history-loading' }, patch)] });
    expect(after.key).not.toBe(before.key);
  });

  it('keeps patient, date and current reference policy in measurement identity', () => {
    const r = saveRuntime(), dp = r.point({}), options = { clinicalDateISO: '2026-10-26', datapoints: [dp] };
    const before = r.api.createSaveOperation(options).key;
    expect(r.api.createSaveOperation({ ...options, patientId: 'fictional-other' }).key).not.toBe(before);
    expect(r.api.createSaveOperation({ ...options, clinicalDateISO: '2026-10-25' }).key).not.toBe(before);
    const changed = { ...dp, tmpGfrSnapshot: { ...dp.tmpGfrSnapshot, policy: { ...dp.tmpGfrSnapshot.policy, version: 'fictional-other-version' } } };
    expect(r.api.createSaveOperation({ ...options, datapoints: [changed] }).key).not.toBe(before);
  });
});
