import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { patchProteinDzmSessionHooks, proteinDzmSessionSource } from '../../tools/patch-klirens-protein-dzm-session.mjs';

const source = readFileSync(new URL('../../inline_kalkulator_klirens_07.js', import.meta.url), 'utf8');
const durationSource = readFileSync(new URL('../../clcr_collection_duration.js', import.meta.url), 'utf8');
const legacySource = readFileSync(new URL('../../clcr_saved_legacy_calculator.js', import.meta.url), 'utf8');
const defaults = { Prot_inputMode: 'concentration', Prot_concentration: '', Prot_concentrationUnit: 'mg/L', Prot_volume: '',
  Prot_volumeUnit: 'mL', Prot_reportedValue: '', Prot_reportedUnit: 'mg/24h', Prot_outputUnit: 'mg/24h',
  Prot_collectionHours: '24', Prot_collectionSource: 'assumed-24h', Prot_unitConversions: '' };

function eventTarget(target = {}) {
  const listeners = new Map();
  return Object.assign(target, {
    addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(listener); },
    dispatchEvent(event) { for (const listener of listeners.get(event.type) || []) listener(event); },
  });
}

// The complete production session runtime and legacy calculator are loaded.
// Only the DOM/storage boundary is synthetic; no clinical formula is copied.
function runtime(initial = {}, options = {}) {
  const values = { formulaPicker: 'Prot_mgkg', age: '10', ageMonths: '0', ageDays: '', sex: 'M', weight: '30', height: '140',
    ...defaults, Prot_concentration: '200.0000', Prot_volume: '1500', Prot_reportedValue: '300', Prot_durationNeedsConfirmation: false,
    U_Prot: '99', V24: '2345', Cl24DurationHours: '12', Cl24DurationSource: 'hours',
    collectionStartAt: '2026-10-24T08:00', collectionEndAt: '2026-10-25T08:00', Cl24CollectionProblem: true,
    collectionNoMissedVoids: false, ui_collectionNoMissedVoids_answer: 'no', ...initial };
  const controls = {};
  let documentRef;
  const add = (id, value) => (controls[id] = eventTarget(typeof value === 'boolean'
    ? { id, ownerDocument: documentRef, tagName: 'INPUT', type: 'checkbox', checked: value }
    : { id, ownerDocument: documentRef, tagName: id === 'formulaPicker' || /Unit$/.test(id) ? 'SELECT' : 'INPUT', type: 'text', value }));
  for (const [id, value] of Object.entries(values)) {
    if (options.omitProtein && id.startsWith('Prot_') || options.omitConfirmationControl && id === 'Prot_durationNeedsConfirmation') continue;
    add(id, value);
  }
  const form = eventTarget({ querySelectorAll: () => Object.values(controls) }), clearBtn = eventTarget({ id: 'clearBtn', type: 'button' });
  const document = eventTarget({ getElementById: id => id === 'clcrForm' ? form : id === 'clearBtn' ? clearBtn : controls[id] || null, querySelector: () => null });
  documentRef = document;
  for (const control of Object.values(controls)) control.ownerDocument = document;
  let materializations = 0, parses = 0;
  const storage = new Map(), window = eventTarget({ currentVersion: 'advanced', document,
    ClcrProteinDzmUi: { ensureControls() { materializations += 1; for (const [id, value] of Object.entries(defaults)) if (!controls[id]) add(id, value); } },
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
  });
  document.defaultView = window;
  const timers = [], dailyCalls = [];
  class NoWallClockDate extends Date { static parse() { parses += 1; throw new Error('Session restore must not parse old wall-clock dates'); } }
  const context = { window, document, Date: NoWallClockDate,
    setTimeout: callback => { timers.push(callback); return timers.length; }, clearTimeout() {} };
  vm.createContext(context);
  if (!options.omitDurationModule) vm.runInContext(durationSource, context);
  vm.runInContext(legacySource, context);
  const actualLegacy = window.ClcrSavedLegacyCalculator;
  window.ClcrSavedLegacyCalculator = { ...actualLegacy, math: { ...actualLegacy.math,
    dailyAmount(...args) { dailyCalls.push(args); return actualLegacy.math.dailyAmount(...args); } } };
  vm.runInContext(source, context);
  return { api: window, context, document, controls, clearBtn, storage, timers, dailyCalls,
    materializations: () => materializations, parses: () => parses };
}
function restore(session, initial, options) {
  const result = runtime(initial, options), original = structuredClone(session);
  expect(result.api.applyClcrSessionSnapshot(session, { update: false, preserveAcrossVersions: true })).toBe(true);
  expect(session).toEqual(original);
  return result;
}
const snapshot = result => result.api.buildClcrSessionSnapshot().inputs;

describe('Protein DZM — complete production session runtime', () => {
  it('materializes defaults before capture and exposes the clear-context contract', () => {
    const result = runtime({}, { omitProtein: true });
    expect(snapshot(result)).toMatchObject(defaults);
    expect(result.api.ClcrProteinDzmSession.CONTEXT_IDS).toContain('height');
    expect(result.materializations()).toBeGreaterThan(0);
  });

  it('captures a new blank as24h without changing the DOM or writing metadata to the value vault', () => {
    const result = runtime({ Prot_collectionHours: '', Prot_collectionSource: 'assumed-24h', Prot_durationNeedsConfirmation: 'false' });
    result.api.__vildaClcrVersionValueVault = {};
    expect(snapshot(result)).toMatchObject({ Prot_collectionHours: '24', Prot_collectionSource: 'assumed-24h', Prot_durationNeedsConfirmation: 'false' });
    expect(result.controls.Prot_collectionHours.value).toBe('');
    expect(result.api.__vildaClcrVersionValueVault).toEqual({});
  });

  it.each(['Prot_mgkg', 'PO4_mgkg', 'Ca_mgkg', 'ACR'])('new %s clears the previous protein specimen and conversion metadata', selectedFormula => {
    const result = restore({ selectedFormula, inputs: { age: '12' } });
    expect(snapshot(result)).toMatchObject({ ...defaults, Prot_durationNeedsConfirmation: false });
    expect(result.api.__vildaClcrVersionValueVault).toMatchObject(defaults);
  });

  it.each(['0', '0.015', '0,0004', '88.0000000001', '1e-12'])('preserves modern quantity text %s and supplied collection facts', value => {
    const input = { Prot_inputMode: 'reported', Prot_reportedValue: value, Prot_reportedUnit: 'g/24h', Prot_outputUnit: 'mg/24h',
      Prot_collectionHours: '12.000', Prot_collectionSource: 'hours', age: '', weight: '', height: '', Cl24CollectionProblem: true,
      ui_collectionNoMissedVoids_answer: 'no', U_Prot: '999' };
    const result = restore({ selectedFormula: 'Prot_mgkg', inputs: input });
    expect(snapshot(result)).toMatchObject(input);
    expect(result.dailyCalls).toEqual([]);
  });

  it('restores preserved-only ready input and explicit blanks without inheriting a previous specimen', () => {
    const input = { formulaPicker: 'Prot_mgkg', Prot_inputMode: 'reported', Prot_reportedValue: '0,3000', Prot_reportedUnit: 'g/24h',
      weight: '', height: '', age: '', ageMonths: '', sex: '' };
    const result = restore({ preservedInputs: input }, { formulaPicker: 'ACR' });
    expect(snapshot(result)).toMatchObject({ ...input, Prot_collectionHours: '24', Prot_concentration: '', Prot_volume: '' });
  });

  it.each(['object', 'string'])('preserves %s conversion provenance across restoration', type => {
    const provenance = { concentration: { originalValue: '200', originalUnit: 'mg/L', convertedValue: '20', convertedUnit: 'mg/dL' } };
    const result = restore({ selectedFormula: 'Prot_mgkg', inputs: { Prot_concentration: '20', Prot_concentrationUnit: 'mg/dL', Prot_volume: '1500',
      Prot_unitConversions: type === 'object' ? provenance : JSON.stringify(provenance) } });
    expect(JSON.parse(snapshot(result).Prot_unitConversions)).toEqual(provenance);
    expect(JSON.parse(result.api.__vildaClcrVersionValueVault.Prot_unitConversions)).toEqual(provenance);
  });

  it.each(['12', '24'])('migrates old U_Prot total with known %sh using actual legacy arithmetic', hours => {
    const result = restore({ selectedFormula: 'Prot_mgkg', inputs: { U_Prot: '300.000', V24: '9000', Cl24DurationHours: hours, Cl24DurationSource: 'hours' } });
    expect(snapshot(result)).toMatchObject({ Prot_inputMode: 'reported', Prot_reportedValue: hours === '12' ? '600' : '300', Prot_reportedUnit: 'mg/24h',
      Prot_concentration: '', Prot_volume: '', Prot_collectionHours: hours, Prot_collectionSource: 'captured', U_Prot: '300.000', V24: '9000',
      Cl24DurationHours: hours, Cl24DurationSource: 'hours' });
    expect(result.dailyCalls).toEqual([[300, Number(hours) * 60]]);
    expect(result.parses()).toBe(0);
    const reloaded = restore(result.api.buildClcrSessionSnapshot());
    expect(snapshot(reloaded)).toMatchObject({ Prot_reportedValue: hours === '12' ? '600' : '300', Prot_collectionHours: hours });
    expect(reloaded.dailyCalls).toEqual([]);
  });

  it.each([720, '1440'])('uses a portable captured duration of %s minutes for an old collection amount', minutes => {
    const result = restore({ selectedFormula: 'Prot_mgkg', context: { durationMinutes: minutes }, inputs: { U_Prot: '300',
      collectionStartAt: '2026-10-24T08:00', collectionEndAt: '2026-10-25T08:00' } });
    expect(snapshot(result)).toMatchObject({ Prot_inputMode: 'reported', Prot_reportedValue: Number(minutes) === 720 ? '600' : '300',
      Prot_collectionHours: String(Number(minutes) / 60), U_Prot: '300' });
    expect(result.dailyCalls).toEqual([[300, Number(minutes)]]);
    expect(result.parses()).toBe(0);
  });

  it.each([['0', '0'], ['0.015', '0.03']])('retains old zero or a small positive total %s using native12h arithmetic', (amount, daily) => {
    const result = restore({ selectedFormula: 'Prot_mgkg', inputs: { U_Prot: amount, Cl24DurationHours: '12', Cl24DurationSource: 'hours' } });
    expect(snapshot(result)).toMatchObject({ Prot_reportedValue: daily, U_Prot: amount });
    expect(result.dailyCalls).toEqual([[Number(amount), 720]]);
  });

  it.each(['1e-999', '1e999', 'invalid'])('keeps a nonrepresentable legacy amount %s visibly invalid instead of manufacturing zero', amount => {
    const result = restore({ selectedFormula: 'Prot_mgkg', inputs: { U_Prot: amount, Cl24DurationHours: '24', Cl24DurationSource: 'hours' } });
    expect(snapshot(result)).toMatchObject({ Prot_reportedValue: amount, U_Prot: amount });
    expect(result.dailyCalls).toEqual([]);
  });

  it('does not turn daily normalization underflow into an exact zero', () => {
    const result = restore({ selectedFormula: 'Prot_mgkg', inputs: { U_Prot: '5e-324', Cl24DurationHours: '48', Cl24DurationSource: 'hours' } });
    expect(snapshot(result)).toMatchObject({ Prot_reportedValue: '', U_Prot: '5e-324', Prot_collectionHours: '48' });
    expect(result.dailyCalls).toEqual([[5e-324, 2880]]);
  });

  it.each([{}, { collectionStartAt: '2026-10-24T08:00', collectionEndAt: '2026-10-25T08:00' },
    { Cl24DurationHours: '24', Cl24DurationSource: 'assumed-24h' }])('never invents24h for an old amount without captured duration %j', metadata => {
    const result = restore({ selectedFormula: 'Prot_mgkg', inputs: { U_Prot: '300', ...metadata } });
    expect(snapshot(result)).toMatchObject({ Prot_inputMode: 'reported', Prot_reportedValue: '', Prot_collectionHours: '',
      Prot_collectionSource: 'historical-missing', Prot_durationNeedsConfirmation: true, U_Prot: '300' });
    expect(result.dailyCalls).toEqual([]);
    expect(result.parses()).toBe(0);
  });

  it.each(['0', '-1', 'invalid'])('keeps invalid historical duration %s explicit instead of assuming24h', hours => {
    const result = restore({ selectedFormula: 'Prot_mgkg', inputs: { U_Prot: '300', Cl24DurationHours: hours, Cl24DurationSource: 'hours' } });
    expect(snapshot(result)).toMatchObject({ Prot_inputMode: 'reported', Prot_reportedValue: '', Prot_collectionHours: hours,
      Prot_collectionSource: 'captured', U_Prot: '300' });
    expect(result.api.ClcrCollectionDuration.fromValues(snapshot(result), {}, { fieldId: 'Prot_collectionHours' }).valid).toBe(false);
    expect(result.dailyCalls).toEqual([]);
  });

  it('does not migrate U_Prot over explicit modern blanks or use V24 as the new volume', () => {
    const result = restore({ selectedFormula: 'Prot_mgkg', inputs: { U_Prot: '300', V24: '9000', Prot_concentration: '', Prot_reportedValue: '' } });
    expect(snapshot(result)).toMatchObject({ Prot_inputMode: 'concentration', Prot_concentration: '', Prot_reportedValue: '', Prot_volume: '', U_Prot: '300', V24: '9000' });
    expect(result.dailyCalls).toEqual([]);
  });

  it('does not reinterpret the shared U_Prot when restoring B_Cr', () => {
    const result = restore({ selectedFormula: 'B_Cr', inputs: { U_Prot: '300', V24: '1500', Cl24DurationHours: '12', Cl24DurationSource: 'hours' } });
    expect(snapshot(result)).toMatchObject({ ...defaults, U_Prot: '300', V24: '1500', Cl24DurationHours: '12' });
    expect(result.dailyCalls).toEqual([]);
  });

  it.each(['0', '-1', 'invalid', ''])('retains a historical gap with invalid input %j across repeated restores', hours => {
    const input = { Prot_inputMode: 'reported', Prot_reportedValue: '300', Prot_collectionHours: hours,
      Prot_collectionSource: 'historical-missing', Prot_durationNeedsConfirmation: true };
    const result = restore({ selectedFormula: 'Prot_mgkg', inputs: input });
    expect(snapshot(result)).toMatchObject(input);
    expect(snapshot(restore(result.api.buildClcrSessionSnapshot()))).toMatchObject(input);
  });

  it('a valid entered duration resolves only this historical marker and remains portable', () => {
    const result = restore({ selectedFormula: 'Prot_mgkg', inputs: { Prot_collectionHours: '', Prot_collectionSource: 'historical-missing', Prot_durationNeedsConfirmation: true } });
    const control = result.controls.Prot_collectionHours;
    result.api.ClcrCollectionDuration.bindControl(control);
    control.value = '12'; control.dispatchEvent({ type: 'input', isTrusted: true });
    expect(result.controls.Prot_durationNeedsConfirmation.checked).toBe(false);
    expect(snapshot(result)).toMatchObject({ Prot_collectionHours: '12', Prot_collectionSource: 'hours', Prot_durationNeedsConfirmation: false });
  });

  it('clear preserves only allowed patient and collection facts while resetting the specimen', () => {
    const result = runtime({ Prot_inputMode: 'reported', Prot_collectionHours: '12' }), before = snapshot(result);
    result.document.dispatchEvent({ type: 'DOMContentLoaded' });
    for (const control of Object.values(result.controls)) if (control.type === 'checkbox') control.checked = false; else if (control.id !== 'formulaPicker') control.value = '';
    result.clearBtn.dispatchEvent({ type: 'click', clcrClearedFormula: 'Prot_mgkg', clcrPreservedProteinDzmContext: { ...before, arbitrary: 'unsafe' } });
    expect(snapshot(result)).toMatchObject({ ...defaults, age: '10', weight: '30', height: '140', Cl24CollectionProblem: true,
      ui_collectionNoMissedVoids_answer: 'no', Prot_durationNeedsConfirmation: false });
    expect(result.api.__vildaClcrVersionValueVault).not.toHaveProperty('arbitrary');
  });

  it('a new patient without a Klirens session resets the previous specimen and historical marker', () => {
    const result = runtime({ Prot_collectionHours: '', Prot_collectionSource: 'historical-missing', Prot_durationNeedsConfirmation: true });
    expect(result.api.__vildaClcrRehydrate()).toBe(true);
    expect(snapshot(result)).toMatchObject({ ...defaults, Prot_durationNeedsConfirmation: false });
  });

  it('reconstructs the shipped additive adapter and capture hook from readable source', () => {
    expect(patchProteinDzmSessionHooks(source)).toBe(source);
    const preceding = source.replace(proteinDzmSessionSource, '').replace('try{window.ClcrProteinDzmUi?.ensureControls?.(document)}catch{}', '');
    expect(patchProteinDzmSessionHooks(preceding)).toBe(source);
    expect(() => patchProteinDzmSessionHooks(preceding.replace('(function(){const b="vildaClcrSessionV1";', ''))).toThrow('Ambiguous protein session integration anchor');
  });
});
