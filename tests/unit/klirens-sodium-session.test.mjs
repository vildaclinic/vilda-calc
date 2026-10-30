import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { patchSodiumDzmSessionHooks, sodiumDzmSessionSource } from '../../tools/patch-klirens-sodium-dzm-session.mjs';

const source = readFileSync(new URL('../../inline_kalkulator_klirens_07.js', import.meta.url), 'utf8');
const defaults = { Na_inputMode: 'concentration', Na_concentration: '', Na_volume: '', Na_volumeUnit: 'mL', Na_reportedValue: '',
  Na_reportedUnit: 'mmol/24h', Na_collectionHours: '24', Na_collectionSource: 'assumed-24h', Na_outputUnit: 'mmol/24h',
  Na_unitConversions: '', Na_durationNeedsConfirmation: false };

function eventTarget(target = {}) {
  const listeners = new Map();
  return Object.assign(target, {
    addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(listener); },
    dispatchEvent(event) { for (const listener of listeners.get(event.type) || []) listener(event); },
  });
}

// The shipped complete serializer, duration reader and sodium calculator are
// executed together. Only controls, events and the storage boundary are fake.
function runtime(initial = {}, options = {}) {
  const values = { formulaPicker: 'Na_mmol_d', age: '10', ageMonths: '0', ageDays: '', sex: 'F', weight: '30', height: '140',
    ...defaults, Na_concentration: '50.000', Na_volume: '1500', U_Na: '18', V24: '999', U_K: '20',
    Cl24DurationHours: '12', Cl24DurationSource: 'hours', collectionStartAt: '', collectionEndAt: '',
    Cl24CollectionProblem: false, ui_collectionNoMissedVoids_answer: '', ...initial };
  const controls = {};
  let documentRef;
  const add = (id, value) => (controls[id] = eventTarget(typeof value === 'boolean'
    ? { id, ownerDocument: documentRef, tagName: 'INPUT', type: 'checkbox', checked: value }
    : { id, ownerDocument: documentRef, tagName: id === 'formulaPicker' || /Unit$/.test(id) ? 'SELECT' : 'INPUT', type: 'text', value }));
  for (const [id, value] of Object.entries(values)) if (!(options.omitSodium && id.startsWith('Na_'))) add(id, value);
  const form = eventTarget({ querySelectorAll: () => Object.values(controls) }), clearBtn = eventTarget({ id: 'clearBtn', type: 'button' });
  const document = eventTarget({ getElementById: id => id === 'clcrForm' ? form : id === 'clearBtn' ? clearBtn : controls[id] || null, querySelector: () => null });
  documentRef = document;
  for (const control of Object.values(controls)) control.ownerDocument = document;
  let materializations = 0, localDateParses = 0;
  const storage = new Map(), window = eventTarget({ currentVersion: 'advanced', document,
    ClcrSodiumDzmUi: { ensureControls() { materializations += 1; for (const [id, value] of Object.entries(defaults)) if (!controls[id]) add(id, value); } },
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
  });
  document.defaultView = window;
  const timers = [];
  class NoLocalDateParse extends Date { static parse() { localDateParses += 1; throw new Error('A restored local date must not be reparsed'); } }
  const context = vm.createContext({ window, document, Date: NoLocalDateParse,
    setTimeout: callback => { timers.push(callback); return timers.length; }, clearTimeout() {} });
  for (const file of ['clcr_collection_duration.js', 'clcr_sodium_dzm_data.js', 'clcr_sodium_dzm.js']) {
    vm.runInContext(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'), context, { filename: file });
  }
  vm.runInContext(source, context);
  return { api: window, document, controls, clearBtn, storage, timers, materializations: () => materializations,
    localDateParses: () => localDateParses };
}
function restore(session, initial, options) {
  const result = runtime(initial, options), original = structuredClone(session);
  expect(result.api.applyClcrSessionSnapshot(session, { update: false, preserveAcrossVersions: true })).toBe(true);
  expect(session).toEqual(original);
  return result;
}
const snapshot = result => result.api.buildClcrSessionSnapshot().inputs;
const compute = result => result.api.VildaClcrSodiumDzm.evaluate(result.api.VildaClcrSodiumDzm.inputFromValues(snapshot(result)), result.api.ClcrSodiumDzmReferenceData.DEFAULT_POLICY);

describe('Sodium DZM — complete shipped session boundary', () => {
  it('mounts its own blank24h defaults before the first capture', () => {
    const result = runtime({}, { omitSodium: true });
    expect(snapshot(result)).toMatchObject(defaults);
    expect(result.api.ClcrSodiumDzmSession.DEFAULTS).toMatchObject(defaults);
    expect(result.api.ClcrSodiumDzmSession.CONTEXT_IDS).toContain('height');
    expect(result.materializations()).toBeGreaterThan(0);
  });

  it('normalizes a reset new blank24h in a copy, without changing controls or the vault', () => {
    const result = runtime({ Na_collectionHours: '', Na_collectionSource: 'assumed-24h', Na_durationNeedsConfirmation: 'false' });
    result.api.__vildaClcrVersionValueVault = {};
    expect(snapshot(result)).toMatchObject({ Na_collectionHours: '24', Na_collectionSource: 'assumed-24h', Na_durationNeedsConfirmation: 'false' });
    expect(result.controls.Na_collectionHours.value).toBe('');
    expect(result.api.__vildaClcrVersionValueVault).toEqual({});
  });

  it.each(['Na_mmol_d', 'ACR', 'FENa_spot'])('new %s restoration does not inherit a previous sodium specimen', selectedFormula => {
    const result = restore({ selectedFormula, inputs: { age: '12' } });
    expect(snapshot(result)).toMatchObject(defaults);
  });

  it.each(['FENa_spot', 'AGu_spot', 'FEK_spot'])('a restored %s never seeds the dedicated sodium DZM from shared spot U_Na', selectedFormula => {
    const values = { U_Na: '50', U_K: '20', V24: '1500', Cl24DurationHours: '12', Cl24DurationSource: 'hours' };
    const result = restore({ selectedFormula, inputs: values });
    expect(snapshot(result)).toMatchObject({ ...values, ...defaults });
    result.controls.formulaPicker.value = 'Na_mmol_d';
    expect(snapshot(result)).toMatchObject({ ...values, ...defaults, formulaPicker: 'Na_mmol_d' });
  });

  it('ordinary formula selection preserves the unrelated spot U_Na and leaves the new DZM blank', () => {
    const result = runtime({ formulaPicker: 'FENa_spot', U_Na: '70' }, { omitSodium: true });
    result.controls.formulaPicker.value = 'Na_mmol_d';
    expect(snapshot(result)).toMatchObject({ ...defaults, U_Na: '70', formulaPicker: 'Na_mmol_d' });
  });

  it.each(['0', '0.015', '0,0004', '88.0000000001', '1e-12'])('retains modern measured text %s and known collection facts without conversion', value => {
    const inputs = { Na_inputMode: 'reported', Na_reportedValue: value, Na_reportedUnit: 'gNa/24h', Na_outputUnit: 'mmol/24h',
      Na_collectionHours: '12.000', Na_collectionSource: 'hours', age: '', sex: '', Cl24CollectionProblem: true,
      ui_collectionNoMissedVoids_answer: 'no', U_Na: '999' };
    const result = restore({ selectedFormula: 'Na_mmol_d', inputs });
    expect(snapshot(result)).toMatchObject({ ...inputs, Na_concentration: '', Na_volume: '', Na_durationNeedsConfirmation: false });
  });

  it.each(['object', 'string'])('keeps %s source conversion metadata losslessly', type => {
    const provenance = { volume: { originalValue: '1500', originalUnit: 'mL', convertedValue: '1,5', convertedUnit: 'L' } };
    const result = restore({ selectedFormula: 'Na_mmol_d', inputs: { Na_volume: '1,5', Na_volumeUnit: 'L', Na_collectionHours: '24',
      Na_unitConversions: type === 'object' ? provenance : JSON.stringify(provenance) } });
    expect(JSON.parse(snapshot(result).Na_unitConversions)).toEqual(provenance);
  });

  it.each(['12', '24'])('migrates a genuine legacy sodium concentration with captured %sh without relabelling the amount', hours => {
    const inputs = { U_Na: '50.000', V24: '1500', Cl24DurationHours: hours, Cl24DurationSource: 'hours' };
    const result = restore({ selectedFormula: 'Na_mmol_d', inputs });
    expect(snapshot(result)).toMatchObject({ ...inputs, Na_concentration: '50.000', Na_volume: '1500', Na_collectionHours: hours,
      Na_collectionSource: 'captured', Na_inputMode: 'concentration', Na_reportedValue: '' });
    expect(compute(result)).toMatchObject({ valid: true, rawValue: hours === '12' ? 150 : 75 });
    expect(snapshot(restore(result.api.buildClcrSessionSnapshot()))).toMatchObject({ Na_concentration: '50.000', Na_volume: '1500', Na_collectionHours: hours });
  });

  it.each([720, '1440', 0, -60, 'invalid'])('keeps captured duration evidence %j minutes instead of inventing24h', durationMinutes => {
    const result = restore({ selectedFormula: 'Na_mmol_d', context: { durationMinutes }, inputs: { U_Na: '50', V24: '1500' } });
    expect(snapshot(result).Na_collectionHours).toBe(durationMinutes === 'invalid' ? 'invalid' : String(Number(durationMinutes) / 60));
    expect(snapshot(result).Na_collectionSource).toBe('captured');
    expect(compute(result).valid).toBe(Number(durationMinutes) > 0);
  });

  it('uses timezone-qualified captured UTC instants and retains their original text', () => {
    const inputs = { U_Na: '50', V24: '1500', collectionStartAt: '2026-10-24T08:00:00+02:00', collectionEndAt: '2026-10-25T06:00:00Z' };
    const result = restore({ selectedFormula: 'Na_mmol_d', inputs });
    expect(snapshot(result)).toMatchObject({ ...inputs, Na_collectionHours: '24', Na_collectionSource: 'legacy-dates' });
    expect(result.localDateParses()).toBe(0);
  });

  it.each([
    { inputs: { U_Na: '50', V24: '1500', Cl24DurationHours: '24', Cl24DurationSource: 'invalid' } },
    { inputs: { U_Na: '50', V24: '1500' }, context: { collectionHours: '24', durationSource: 'invalid' } },
    { inputs: { Na_inputMode: 'reported', Na_reportedValue: '150' }, context: { durationSource: 'invalid' } },
  ])('never replaces an explicitly invalid captured source with a valid new day: %j', session => {
    const result = restore({ selectedFormula: 'Na_mmol_d', ...session });
    expect(snapshot(result).Na_collectionSource).toBe('invalid');
    expect(compute(result)).toMatchObject({ valid: false, errorCode: 'invalid-hours' });
  });

  it('restores known negative collection facts and captured UTC date text from the source context', () => {
    const result = restore({ selectedFormula: 'Na_mmol_d', inputs: { U_Na: '50', V24: '1500', Cl24CollectionProblem: false,
      ui_collectionNoMissedVoids_answer: 'unknown', collectionStartAt: '', collectionEndAt: '' }, context: {
      collectionStartAt: '2026-10-24T08:00:00Z', collectionEndAt: '2026-10-25T08:00:00Z',
      knownFacts: { collectionNoMissedVoids: false, Cl24CollectionProblem: true },
    } });
    expect(snapshot(result)).toMatchObject({ Na_collectionHours: '24', Na_collectionSource: 'legacy-dates', Cl24CollectionProblem: true,
      collectionNoMissedVoids: false, ui_collectionNoMissedVoids_answer: 'no', collectionStartAt: '2026-10-24T08:00:00Z', collectionEndAt: '2026-10-25T08:00:00Z' });
    expect(compute(result)).toMatchObject({ valid: false, errorCode: 'collection-conflict' });
  });

  it.each([
    { U_Na: '50', V24: '1500' },
    { U_Na: '50', V24: '1500', collectionStartAt: '2026-10-24T08:00', collectionEndAt: '2026-10-25T08:00' },
    { U_Na: '50', V24: '1500', Cl24DurationHours: '24', Cl24DurationSource: 'assumed-24h' },
  ])('old sodium concentration with unknown time stays unresolved: %j', inputs => {
    const result = restore({ selectedFormula: 'Na_mmol_d', inputs });
    expect(snapshot(result)).toMatchObject({ Na_concentration: '50', Na_collectionHours: '', Na_collectionSource: 'historical-missing', Na_durationNeedsConfirmation: true });
    expect(compute(result).valid).toBe(false);
    expect(result.localDateParses()).toBe(0);
  });

  it('a reported per-day amount without a captured clock remains numerical and has no full-day reference', () => {
    const result = restore({ selectedFormula: 'Na_mmol_d', inputs: { Na_inputMode: 'reported', Na_reportedValue: '150' } });
    expect(snapshot(result)).toMatchObject({ Na_reportedValue: '150', Na_collectionHours: '', Na_collectionSource: 'historical-missing', Na_durationNeedsConfirmation: true });
    expect(compute(result)).toMatchObject({ valid: true, rawValue: 150, outOfRange: null });
  });

  it.each(['0', '-12', 'invalid'])('retains invalid clock %s in the ready-daily mode and rejects it', hours => {
    const result = restore({ selectedFormula: 'Na_mmol_d', inputs: { Na_inputMode: 'reported', Na_reportedValue: '150', Na_collectionHours: hours, Na_collectionSource: 'hours' } });
    expect(snapshot(result).Na_collectionHours).toBe(hours);
    expect(compute(result).valid).toBe(false);
  });

  it.each(['', '24'])('retains an explicit invalid clock source with %j hours and blocks ready-daily interpretation', hours => {
    const result = restore({ selectedFormula: 'Na_mmol_d', inputs: { Na_inputMode: 'reported', Na_reportedValue: '150', Na_collectionHours: hours, Na_collectionSource: 'invalid' } });
    expect(snapshot(result)).toMatchObject({ Na_collectionHours: hours, Na_collectionSource: 'invalid' });
    expect(compute(result)).toMatchObject({ valid: false, errorCode: 'invalid-hours' });
  });

  it('restores a preserved-only active legacy Na session without mutating its source', () => {
    const result = restore({ preservedInputs: { formulaPicker: 'Na_mmol_d', U_Na: '50', V24: '1500', Cl24DurationHours: '24', Cl24DurationSource: 'hours' } });
    expect(snapshot(result)).toMatchObject({ Na_concentration: '50', Na_volume: '1500', Na_collectionHours: '24', Na_collectionSource: 'captured' });
  });

  it('clear restores the allowed patient and collection context and starts a genuinely new24h collection', () => {
    const result = runtime({ Na_inputMode: 'reported', Na_collectionHours: '12', Na_collectionSource: 'hours', Na_durationNeedsConfirmation: true,
      Na_reportedValue: '150', Na_unitConversions: '{"old":"specimen"}', Cl24CollectionProblem: true, ui_collectionNoMissedVoids_answer: 'no' });
    const before = snapshot(result);
    result.document.dispatchEvent({ type: 'DOMContentLoaded' });
    for (const control of Object.values(result.controls)) if (control.type === 'checkbox') control.checked = false; else if (control.id !== 'formulaPicker') control.value = '';
    result.clearBtn.dispatchEvent({ type: 'click', clcrClearedFormula: 'Na_mmol_d', clcrPreservedSodiumDzmContext: { ...before, arbitrary: 'unsafe' } });
    expect(snapshot(result)).toMatchObject({ ...defaults, age: '10', weight: '30', height: '140', Cl24CollectionProblem: true, ui_collectionNoMissedVoids_answer: 'no' });
    expect(result.api.__vildaClcrVersionValueVault).not.toHaveProperty('arbitrary');
  });

  it('loading a patient without a renal session drops the old specimen and missing-time flag', () => {
    const result = runtime({ Na_collectionHours: '', Na_collectionSource: 'historical-missing', Na_durationNeedsConfirmation: true });
    expect(result.api.__vildaClcrRehydrate()).toBe(true);
    expect(snapshot(result)).toMatchObject(defaults);
  });

  it('reproduces exactly the production adapter and capture hook from readable source', () => {
    expect(patchSodiumDzmSessionHooks(source)).toBe(source);
    const preceding = source.replace(sodiumDzmSessionSource, '').replace('try{window.ClcrSodiumDzmUi?.ensureControls?.(document)}catch{}', '');
    expect(patchSodiumDzmSessionHooks(preceding)).toBe(source);
    expect(() => patchSodiumDzmSessionHooks(preceding.replace('(function(){const b="vildaClcrSessionV1";', ''))).toThrow('Ambiguous sodium session integration anchor');
  });
});
