import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { patchCitDzmSessionHooks, citDzmSessionSource } from '../../tools/patch-klirens-cit-dzm-session.mjs';
import { patchOxDzmSessionHooks } from '../../tools/patch-klirens-ox-dzm-session.mjs';
import { patchProteinDzmSessionHooks } from '../../tools/patch-klirens-protein-dzm-session.mjs';
import { patchPotassiumDzmSessionHooks } from '../../tools/patch-klirens-potassium-dzm-session.mjs';
import { patchUrateCreatinineSessionHooks } from '../../tools/patch-klirens-urate-creatinine-session.mjs';

const source = readFileSync(new URL('../../inline_kalkulator_klirens_07.js', import.meta.url), 'utf8');
const durationSource = readFileSync(new URL('../../clcr_collection_duration.js', import.meta.url), 'utf8');
const clinicalSource = readFileSync(new URL('../../clcr_clinical_safety.js', import.meta.url), 'utf8');
const defaults = { CITDZM_inputMode: 'concentration', CITDZM_concentration: '', CITDZM_concentrationUnit: 'mmol/L',
  CITDZM_volume: '', CITDZM_volumeUnit: 'mL', CITDZM_reportedValue: '', CITDZM_reportedUnit: 'mmol/24h',
  CITDZM_collectionHours: '24', CITDZM_collectionSource: 'assumed-24h', CITDZM_durationNeedsConfirmation: false,
  CITDZM_reportingEntity: 'unknown', CITDZM_unitConversions: '' };

function eventTarget(target = {}) {
  const listeners = new Map();
  return Object.assign(target, {
    addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(listener); },
    dispatchEvent(event) { for (const listener of listeners.get(event.type) || []) listener(event); },
  });
}

// The complete production session runtime and shared duration reader are loaded.
// Only the DOM/storage boundary is synthetic; no clinical formula is copied.
function runtime(initial = {}, options = {}) {
  const values = { formulaPicker: 'Cit_mgkg', age: '10', ageMonths: '0', ageDays: '', sex: 'M', weight: '30', height: '140',
    ...defaults, CITDZM_concentration: '200.0000', CITDZM_volume: '1500', CITDZM_reportedValue: '300', CITDZM_durationNeedsConfirmation: false,
    U_Cit: '99', citrateSpotReportingEntity: 'citric_acid', V24: '2345', Cl24DurationHours: '12', Cl24DurationSource: 'hours',
    collectionStartAt: '2026-10-24T08:00', collectionEndAt: '2026-10-25T08:00', Cl24CollectionProblem: true,
    collectionNoMissedVoids: false, ui_collectionNoMissedVoids_answer: 'no', ...initial };
  const controls = {};
  let documentRef;
  const add = (id, value) => (controls[id] = eventTarget(typeof value === 'boolean'
    ? { id, ownerDocument: documentRef, tagName: 'INPUT', type: 'checkbox', checked: value }
    : { id, ownerDocument: documentRef, tagName: id === 'formulaPicker' || /Unit$/.test(id) ? 'SELECT' : 'INPUT', type: 'text', value }));
  for (const [id, value] of Object.entries(values)) {
    if (options.omitCit && id.startsWith('CITDZM_') || options.omitConfirmationControl && id === 'CITDZM_durationNeedsConfirmation') continue;
    add(id, value);
  }
  const form = eventTarget({ querySelectorAll: () => Object.values(controls) }), clearBtn = eventTarget({ id: 'clearBtn', type: 'button' });
  const document = eventTarget({ getElementById: id => id === 'clcrForm' ? form : id === 'clearBtn' ? clearBtn : controls[id] || null, querySelector: () => null });
  documentRef = document;
  for (const control of Object.values(controls)) control.ownerDocument = document;
  let materializations = 0, parses = 0;
  const storage = new Map(), window = eventTarget({ currentVersion: 'advanced', document,
    ClcrCitDzmUi: { ensureControls() { materializations += 1; for (const [id, value] of Object.entries(defaults)) if (!controls[id]) add(id, value); } },
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
  });
  document.defaultView = window;
  const timers = [];
  class NoWallClockDate extends Date { static parse() { parses += 1; throw new Error('Session restore must not parse old wall-clock dates'); } }
  const context = { window, document, Date: NoWallClockDate,
    setTimeout: callback => { timers.push(callback); return timers.length; }, clearTimeout() {} };
  vm.createContext(context);
  if (!options.omitDurationModule) vm.runInContext(durationSource, context);
  vm.runInContext(clinicalSource, context);
  vm.runInContext(source, context);
  return { api: window, context, document, controls, clearBtn, storage, timers,
    materializations: () => materializations, parses: () => parses };
}
function restore(session, initial, options) {
  const result = runtime(initial, options), original = structuredClone(session);
  expect(result.api.applyClcrSessionSnapshot(session, { update: false, preserveAcrossVersions: true })).toBe(true);
  expect(session).toEqual(original);
  return result;
}
const snapshot = result => result.api.buildClcrSessionSnapshot().inputs;

describe('Cit DZM — complete production session runtime', () => {
  it('materializes all independent controls before capture', () => {
    const result = runtime({}, { omitCit: true });
    expect(snapshot(result)).toMatchObject(defaults);
    expect(result.api.ClcrCitDzmSession.CONTEXT_IDS).toEqual(['age', 'ageMonths', 'ageDays', 'sex', 'weight', 'height', 'newbornContext']);
    expect(result.materializations()).toBeGreaterThan(0);
  });

  it('captures a new blank clock as24h without changing its active input or the value vault', () => {
    const result = runtime({ CITDZM_collectionHours: '', CITDZM_collectionSource: 'assumed-24h', CITDZM_durationNeedsConfirmation: 'false' });
    result.api.__vildaClcrVersionValueVault = {};
    expect(snapshot(result)).toMatchObject({ CITDZM_collectionHours: '24', CITDZM_collectionSource: 'assumed-24h', CITDZM_durationNeedsConfirmation: 'false' });
    expect(result.controls.CITDZM_collectionHours.value).toBe('');
    expect(result.api.__vildaClcrVersionValueVault).toEqual({});
  });

  it.each(['Cit_mgkg', 'ACR', 'Ox_mgkg', 'Prot_mgkg'])('new %s never inherits previous citrate operands, form or conversion metadata', selectedFormula => {
    const result = restore({ selectedFormula, inputs: { age: '12' } }, { CITDZM_reportingEntity: 'citric_acid', CITDZM_unitConversions: '{"old":true}' });
    expect(snapshot(result)).toMatchObject(defaults);
    expect(result.api.__vildaClcrVersionValueVault).toMatchObject(defaults);
    expect(result.parses()).toBe(0);
  });

  it.each(['0', '0.015', '0,0004', '88.0000000001', '1e-12', '-1', 'invalid'])('preserves modern concentration text %s and its captured facts', value => {
    const input = { CITDZM_concentration: value, CITDZM_concentrationUnit: 'mg/dL', CITDZM_volume: '1,5000', CITDZM_volumeUnit: 'L',
      CITDZM_reportingEntity: 'citrate_ion', CITDZM_collectionHours: '23.500', CITDZM_collectionSource: 'hours',
      age: '', weight: '', height: '', Cl24CollectionProblem: true, ui_collectionNoMissedVoids_answer: 'no' };
    const result = restore({ selectedFormula: 'Cit_mgkg', inputs: input });
    expect(snapshot(result)).toMatchObject(input);
    expect(snapshot(restore(result.api.buildClcrSessionSnapshot()))).toMatchObject(input);
  });

  it('restores a ready result and explicit empty patient data from preserved inputs', () => {
    const input = { formulaPicker: 'Cit_mgkg', CITDZM_inputMode: 'reported', CITDZM_reportedValue: '0,6000', CITDZM_reportedUnit: 'mmol/24h',
      CITDZM_collectionHours: '24', CITDZM_collectionSource: 'assumed-24h', weight: '', height: '', age: '', ageMonths: '', sex: '' };
    const result = restore({ preservedInputs: input }, { formulaPicker: 'ACR' });
    expect(snapshot(result)).toMatchObject({ ...input, CITDZM_concentration: '', CITDZM_volume: '', CITDZM_reportingEntity: 'unknown' });
    expect(result.api.ClcrCitDzmSession.readContext().ageYears).toBe(null);
  });

  it.each(['object', 'string'])('preserves %s exact-conversion metadata', type => {
    const provenance = { concentration: { originalValue: '200', originalUnit: 'µmol/L', convertedValue: '0.2', convertedUnit: 'mmol/L' } };
    const result = restore({ selectedFormula: 'Cit_mgkg', inputs: { CITDZM_concentration: '0.2', CITDZM_concentrationUnit: 'mmol/L',
      CITDZM_unitConversions: type === 'object' ? provenance : JSON.stringify(provenance) } });
    expect(JSON.parse(snapshot(result).CITDZM_unitConversions)).toEqual(provenance);
    expect(JSON.parse(result.api.__vildaClcrVersionValueVault.CITDZM_unitConversions)).toEqual(provenance);
  });

  it('migrates the explicitly labelled legacy citric acid concentration without arithmetic or a guessed form', () => {
    const input = { U_Cit: '2.000', V24: '1500', Cl24DurationHours: '24', Cl24DurationSource: 'hours' };
    input.citrateSpotReportingEntity = 'citrate_ion'; // A spot-form control cannot reinterpret this legacy DZM operand.
    const result = restore({ selectedFormula: 'Cit_mgkg', inputs: input });
    expect(snapshot(result)).toMatchObject({ CITDZM_inputMode: 'concentration', CITDZM_concentration: '2.000', CITDZM_concentrationUnit: 'mg/dL',
      CITDZM_volume: '1500', CITDZM_volumeUnit: 'mL', CITDZM_reportedValue: '', CITDZM_collectionHours: '24', CITDZM_collectionSource: 'captured',
      CITDZM_reportingEntity: 'citric_acid', U_Cit: '2.000', V24: '1500', Cl24DurationHours: '24', Cl24DurationSource: 'hours' });
    expect(result.parses()).toBe(0);
  });

  it.each(['0', '0.0001', '-1', 'invalid'])('retains raw legacy %s so engine validation, not session coercion, decides its meaning', value => {
    const result = restore({ selectedFormula: 'Cit_mgkg', inputs: { U_Cit: value, V24: '1500', Cl24DurationHours: '12', Cl24DurationSource: 'hours' } });
    expect(snapshot(result)).toMatchObject({ CITDZM_concentration: value, CITDZM_concentrationUnit: 'mg/dL', CITDZM_collectionHours: '12' });
  });

  it.each([720, '1440'])('uses portable captured %s minutes without parsing old local dates', minutes => {
    const result = restore({ selectedFormula: 'Cit_mgkg', context: { durationMinutes: minutes }, inputs: { U_Cit: '2', V24: '1500',
      collectionStartAt: '2026-10-24T08:00', collectionEndAt: '2026-10-25T08:00' } });
    expect(snapshot(result)).toMatchObject({ CITDZM_concentration: '2', CITDZM_collectionHours: String(Number(minutes) / 60), CITDZM_collectionSource: 'captured' });
    expect(result.parses()).toBe(0);
  });

  it.each([{}, { collectionStartAt: '2026-10-24T08:00', collectionEndAt: '2026-10-25T08:00' },
    { Cl24DurationHours: '24', Cl24DurationSource: 'assumed-24h' }])('never manufactures a recorded duration for legacy inputs %j', metadata => {
    const result = restore({ selectedFormula: 'Cit_mgkg', inputs: { U_Cit: '2', V24: '1500', ...metadata } });
    expect(snapshot(result)).toMatchObject({ CITDZM_concentration: '2', CITDZM_volume: '1500', CITDZM_collectionHours: '',
      CITDZM_collectionSource: 'historical-missing', CITDZM_durationNeedsConfirmation: true });
    result.api.ClcrCollectionDuration.ensureDefaults(result.document);
    expect(result.controls.CITDZM_collectionHours.value).toBe('');
    expect(result.parses()).toBe(0);
  });

  it.each(['0', '-1', 'invalid'])('retains invalid captured duration %s explicitly', hours => {
    const result = restore({ selectedFormula: 'Cit_mgkg', context: { collectionHours: hours }, inputs: { U_Cit: '2', V24: '1500' } });
    expect(snapshot(result)).toMatchObject({ CITDZM_collectionHours: hours, CITDZM_collectionSource: 'captured' });
    expect(result.api.ClcrCollectionDuration.fromValues(snapshot(result), {}, { fieldId: 'CITDZM_collectionHours' }).valid).toBe(false);
  });

  it('does not reinterpret shared spot inputs or overwrite dedicated blanks', () => {
    expect(snapshot(restore({ selectedFormula: 'Ca_Cit', inputs: { U_Cit: '2', V24: '1500' } }))).toMatchObject(defaults);
    const result = restore({ selectedFormula: 'Cit_mgkg', inputs: { U_Cit: '2', V24: '1500', CITDZM_concentration: '', CITDZM_reportedValue: '' } });
    expect(snapshot(result)).toMatchObject({ CITDZM_concentration: '', CITDZM_volume: '', CITDZM_concentrationUnit: 'mmol/L', CITDZM_reportingEntity: 'unknown' });
  });

  it('keeps a historical clock gap portable across repeated restores and resolves it only on a valid edit', () => {
    const input = { CITDZM_concentration: '200', CITDZM_collectionHours: '', CITDZM_collectionSource: 'historical-missing', CITDZM_durationNeedsConfirmation: true };
    const result = restore({ selectedFormula: 'Cit_mgkg', inputs: input });
    expect(snapshot(result)).toMatchObject(input);
    expect(snapshot(restore(result.api.buildClcrSessionSnapshot()))).toMatchObject(input);
    const control = result.controls.CITDZM_collectionHours;
    result.api.ClcrCollectionDuration.bindControl(control);
    control.value = '12'; control.dispatchEvent({ type: 'input', isTrusted: true });
    expect(snapshot(result)).toMatchObject({ CITDZM_collectionHours: '12', CITDZM_collectionSource: 'hours', CITDZM_durationNeedsConfirmation: false });
  });

  it('keeps explicit invalid source after capture and blur without creating24h', () => {
    const result = restore({ selectedFormula: 'Cit_mgkg', inputs: { CITDZM_reportedValue: '0.6', CITDZM_collectionHours: '', CITDZM_collectionSource: 'invalid' } });
    const field = result.controls.CITDZM_collectionHours;
    result.api.ClcrCollectionDuration.bindControl(field);
    field.dispatchEvent({ type: 'blur' });
    expect(snapshot(result)).toMatchObject({ CITDZM_collectionHours: '', CITDZM_collectionSource: 'invalid', CITDZM_durationNeedsConfirmation: false });
    expect(result.api.ClcrCollectionDuration.readFromDocument(result.document, { fieldId: 'CITDZM_collectionHours' }).valid).toBe(false);
  });

  it('does not let an unrelated shared missing-clock marker override an explicit new citrate clock', () => {
    const result = runtime({ durationNeedsConfirmation: true, CITDZM_collectionHours: '24', CITDZM_durationNeedsConfirmation: false });
    const duration = result.api.ClcrCollectionDuration.fromValues(snapshot(result), {}, { fieldId: 'CITDZM_collectionHours' });
    expect(duration).toMatchObject({ valid: true, hours: 24, assumed: true });
  });

  it('restores negative collection facts recorded in context before older adapters can erase them', () => {
    const result = restore({ selectedFormula: 'Cit_mgkg', inputs: { CITDZM_concentration: '200', CITDZM_volume: '1500', CITDZM_collectionHours: '24' },
      context: { knownFacts: { collectionNoMissedVoids: false }, collectionProblem: true } });
    expect(snapshot(result)).toMatchObject({ Cl24CollectionProblem: true, collectionNoMissedVoids: false, ui_collectionNoMissedVoids_answer: 'no' });
    expect(result.api.ClcrCitDzmSession.readContext().knownFacts).toMatchObject({ Cl24CollectionProblem: true, collectionNoMissedVoids: false });
  });

  it('clear retains patient demographics but removes the previous collection, mass form and conversion metadata', () => {
    const result = runtime({ CITDZM_inputMode: 'reported', CITDZM_collectionHours: '12', CITDZM_reportingEntity: 'citric_acid', CITDZM_unitConversions: '{"old":true}' });
    const before = snapshot(result);
    result.document.dispatchEvent({ type: 'DOMContentLoaded' });
    for (const control of Object.values(result.controls)) if (control.type === 'checkbox') control.checked = false; else if (control.id !== 'formulaPicker') control.value = '';
    result.clearBtn.dispatchEvent({ type: 'click', clcrClearedFormula: 'Cit_mgkg', clcrPreservedCitDzmContext: { ...before, arbitrary: 'unsafe' } });
    expect(snapshot(result)).toMatchObject({ ...defaults, age: '10', weight: '30', height: '140', Cl24CollectionProblem: false,
      ui_collectionNoMissedVoids_answer: '', collectionStartAt: '', collectionEndAt: '' });
    expect(result.api.__vildaClcrVersionValueVault).not.toHaveProperty('arbitrary');
    expect(result.api.ClcrCitDzmSession.readContext().knownFacts).toEqual({});
  });

  it('external patient load without a session resets historical and specimen context', () => {
    const result = runtime({ CITDZM_collectionHours: '', CITDZM_collectionSource: 'historical-missing', CITDZM_durationNeedsConfirmation: true });
    expect(result.api.__vildaClcrRehydrate()).toBe(true);
    expect(snapshot(result)).toMatchObject(defaults);
  });

  it('current DOM age and explicit blanks win over previous demographics', () => {
    const result = restore({ selectedFormula: 'Cit_mgkg', inputs: { age: '10', ageMonths: '6', sex: 'F', weight: '30', height: '140' } });
    expect(result.api.ClcrCitDzmSession.readContext()).toMatchObject({ ageYears: 10.5, sex: 'F', weightKg: '30', heightCm: '140', agePrecision: 'exact' });
    result.controls.age.value = '17'; result.controls.ageMonths.value = ''; result.controls.weight.value = '';
    expect(result.api.ClcrCitDzmSession.readContext()).toMatchObject({ ageYears: 17, agePrecision: 'completed-years', weightKg: '' });
    result.controls.age.value = ''; result.controls.sex.value = '';
    expect(result.api.ClcrCitDzmSession.readContext()).toMatchObject({ ageYears: null, sex: '' });
  });

  it('reconstructs the shipped additive adapter and preserves earlier patch contracts', () => {
    expect(patchCitDzmSessionHooks(source)).toBe(source);
    const withoutCit = source.replace(citDzmSessionSource, '').replace('try{window.ClcrCitDzmUi?.ensureControls?.(document)}catch{}', '');
    expect(patchCitDzmSessionHooks(withoutCit)).toBe(source);
    expect(patchOxDzmSessionHooks(source)).toBe(source);
    expect(patchProteinDzmSessionHooks(source)).toBe(source);
    expect(patchPotassiumDzmSessionHooks(source)).toBe(source);
    expect(patchUrateCreatinineSessionHooks(source)).toBe(source);
    expect(() => patchCitDzmSessionHooks(withoutCit.replace('(function(){const b="vildaClcrSessionV1";', ''))).toThrow('Ambiguous citrate session integration anchor');
  });
});
