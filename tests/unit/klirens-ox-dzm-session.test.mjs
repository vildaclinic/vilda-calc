import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { patchOxDzmSessionHooks, oxDzmSessionSource } from '../../tools/patch-klirens-ox-dzm-session.mjs';
import { patchProteinDzmSessionHooks } from '../../tools/patch-klirens-protein-dzm-session.mjs';
import { patchPotassiumDzmSessionHooks } from '../../tools/patch-klirens-potassium-dzm-session.mjs';
import { patchUrateCreatinineSessionHooks } from '../../tools/patch-klirens-urate-creatinine-session.mjs';

const source = readFileSync(new URL('../../inline_kalkulator_klirens_07.js', import.meta.url), 'utf8');
const durationSource = readFileSync(new URL('../../clcr_collection_duration.js', import.meta.url), 'utf8');
const clinicalSource = readFileSync(new URL('../../clcr_clinical_safety.js', import.meta.url), 'utf8');
const defaults = { OXDZM_inputMode: 'concentration', OXDZM_concentration: '', OXDZM_concentrationUnit: 'µmol/L',
  OXDZM_volume: '', OXDZM_volumeUnit: 'mL', OXDZM_reportedValue: '', OXDZM_reportedUnit: 'mmol/24h',
  OXDZM_collectionHours: '24', OXDZM_collectionSource: 'assumed-24h', OXDZM_durationNeedsConfirmation: false,
  OXDZM_reportingEntity: 'unknown', OXDZM_unitConversions: '' };

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
  const values = { formulaPicker: 'Ox_mgkg', age: '10', ageMonths: '0', ageDays: '', sex: 'M', weight: '30', height: '140',
    ...defaults, OXDZM_concentration: '200.0000', OXDZM_volume: '1500', OXDZM_reportedValue: '300', OXDZM_durationNeedsConfirmation: false,
    U_Ox: '99', oxalateReportingEntity: 'oxalic_acid', V24: '2345', Cl24DurationHours: '12', Cl24DurationSource: 'hours',
    collectionStartAt: '2026-10-24T08:00', collectionEndAt: '2026-10-25T08:00', Cl24CollectionProblem: true,
    collectionNoMissedVoids: false, ui_collectionNoMissedVoids_answer: 'no', ...initial };
  const controls = {};
  let documentRef;
  const add = (id, value) => (controls[id] = eventTarget(typeof value === 'boolean'
    ? { id, ownerDocument: documentRef, tagName: 'INPUT', type: 'checkbox', checked: value }
    : { id, ownerDocument: documentRef, tagName: id === 'formulaPicker' || /Unit$/.test(id) ? 'SELECT' : 'INPUT', type: 'text', value }));
  for (const [id, value] of Object.entries(values)) {
    if (options.omitOx && id.startsWith('OXDZM_') || options.omitConfirmationControl && id === 'OXDZM_durationNeedsConfirmation') continue;
    add(id, value);
  }
  const form = eventTarget({ querySelectorAll: () => Object.values(controls) }), clearBtn = eventTarget({ id: 'clearBtn', type: 'button' });
  const document = eventTarget({ getElementById: id => id === 'clcrForm' ? form : id === 'clearBtn' ? clearBtn : controls[id] || null, querySelector: () => null });
  documentRef = document;
  for (const control of Object.values(controls)) control.ownerDocument = document;
  let materializations = 0, parses = 0;
  const storage = new Map(), window = eventTarget({ currentVersion: 'advanced', document,
    ClcrOxDzmUi: { ensureControls() { materializations += 1; for (const [id, value] of Object.entries(defaults)) if (!controls[id]) add(id, value); } },
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

describe('Ox DZM — complete production session runtime', () => {
  it('materializes all independent controls before capture', () => {
    const result = runtime({}, { omitOx: true });
    expect(snapshot(result)).toMatchObject(defaults);
    expect(result.api.ClcrOxDzmSession.CONTEXT_IDS).toEqual(['age', 'ageMonths', 'ageDays', 'sex', 'weight', 'height', 'newbornContext']);
    expect(result.materializations()).toBeGreaterThan(0);
  });

  it('captures a new blank clock as24h without changing its active input or the value vault', () => {
    const result = runtime({ OXDZM_collectionHours: '', OXDZM_collectionSource: 'assumed-24h', OXDZM_durationNeedsConfirmation: 'false' });
    result.api.__vildaClcrVersionValueVault = {};
    expect(snapshot(result)).toMatchObject({ OXDZM_collectionHours: '24', OXDZM_collectionSource: 'assumed-24h', OXDZM_durationNeedsConfirmation: 'false' });
    expect(result.controls.OXDZM_collectionHours.value).toBe('');
    expect(result.api.__vildaClcrVersionValueVault).toEqual({});
  });

  it.each(['Ox_mgkg', 'ACR', 'Cit_mgkg', 'Prot_mgkg'])('new %s never inherits previous oxalate operands, form or conversion metadata', selectedFormula => {
    const result = restore({ selectedFormula, inputs: { age: '12' } }, { OXDZM_reportingEntity: 'oxalic_acid', OXDZM_unitConversions: '{"old":true}' });
    expect(snapshot(result)).toMatchObject(defaults);
    expect(result.api.__vildaClcrVersionValueVault).toMatchObject(defaults);
    expect(result.parses()).toBe(0);
  });

  it.each(['0', '0.015', '0,0004', '88.0000000001', '1e-12', '-1', 'invalid'])('preserves modern concentration text %s and its captured facts', value => {
    const input = { OXDZM_concentration: value, OXDZM_concentrationUnit: 'mg/dL', OXDZM_volume: '1,5000', OXDZM_volumeUnit: 'L',
      OXDZM_reportingEntity: 'oxalate_ion', OXDZM_collectionHours: '23.500', OXDZM_collectionSource: 'hours',
      age: '', weight: '', height: '', Cl24CollectionProblem: true, ui_collectionNoMissedVoids_answer: 'no' };
    const result = restore({ selectedFormula: 'Ox_mgkg', inputs: input });
    expect(snapshot(result)).toMatchObject(input);
    expect(snapshot(restore(result.api.buildClcrSessionSnapshot()))).toMatchObject(input);
  });

  it('restores a ready result and explicit empty patient data from preserved inputs', () => {
    const input = { formulaPicker: 'Ox_mgkg', OXDZM_inputMode: 'reported', OXDZM_reportedValue: '0,6000', OXDZM_reportedUnit: 'mmol/24h',
      OXDZM_collectionHours: '24', OXDZM_collectionSource: 'assumed-24h', weight: '', height: '', age: '', ageMonths: '', sex: '' };
    const result = restore({ preservedInputs: input }, { formulaPicker: 'ACR' });
    expect(snapshot(result)).toMatchObject({ ...input, OXDZM_concentration: '', OXDZM_volume: '', OXDZM_reportingEntity: 'unknown' });
    expect(result.api.ClcrOxDzmSession.readContext().ageYears).toBe(null);
  });

  it.each(['object', 'string'])('preserves %s exact-conversion metadata', type => {
    const provenance = { concentration: { originalValue: '200', originalUnit: 'µmol/L', convertedValue: '0.2', convertedUnit: 'mmol/L' } };
    const result = restore({ selectedFormula: 'Ox_mgkg', inputs: { OXDZM_concentration: '0.2', OXDZM_concentrationUnit: 'mmol/L',
      OXDZM_unitConversions: type === 'object' ? provenance : JSON.stringify(provenance) } });
    expect(JSON.parse(snapshot(result).OXDZM_unitConversions)).toEqual(provenance);
    expect(JSON.parse(result.api.__vildaClcrVersionValueVault.OXDZM_unitConversions)).toEqual(provenance);
  });

  it.each(['oxalate_ion', 'oxalic_acid', undefined, 'unrecognized'])('migrates a legacy concentration in mg/dL and recorded mass form %s without arithmetic', entity => {
    const input = { U_Ox: '2.000', V24: '1500', Cl24DurationHours: '24', Cl24DurationSource: 'hours' };
    if (entity !== undefined) input.oxalateReportingEntity = entity;
    const result = restore({ selectedFormula: 'Ox_mgkg', inputs: input });
    expect(snapshot(result)).toMatchObject({ OXDZM_inputMode: 'concentration', OXDZM_concentration: '2.000', OXDZM_concentrationUnit: 'mg/dL',
      OXDZM_volume: '1500', OXDZM_volumeUnit: 'mL', OXDZM_reportedValue: '', OXDZM_collectionHours: '24', OXDZM_collectionSource: 'captured',
      OXDZM_reportingEntity: ['oxalate_ion', 'oxalic_acid'].includes(entity) ? entity : 'unknown', ...input });
    expect(result.parses()).toBe(0);
  });

  it.each(['0', '0.0001', '-1', 'invalid'])('retains raw legacy %s so engine validation, not session coercion, decides its meaning', value => {
    const result = restore({ selectedFormula: 'Ox_mgkg', inputs: { U_Ox: value, V24: '1500', Cl24DurationHours: '12', Cl24DurationSource: 'hours' } });
    expect(snapshot(result)).toMatchObject({ OXDZM_concentration: value, OXDZM_concentrationUnit: 'mg/dL', OXDZM_collectionHours: '12' });
  });

  it.each([720, '1440'])('uses portable captured %s minutes without parsing old local dates', minutes => {
    const result = restore({ selectedFormula: 'Ox_mgkg', context: { durationMinutes: minutes }, inputs: { U_Ox: '2', V24: '1500',
      collectionStartAt: '2026-10-24T08:00', collectionEndAt: '2026-10-25T08:00' } });
    expect(snapshot(result)).toMatchObject({ OXDZM_concentration: '2', OXDZM_collectionHours: String(Number(minutes) / 60), OXDZM_collectionSource: 'captured' });
    expect(result.parses()).toBe(0);
  });

  it.each([{}, { collectionStartAt: '2026-10-24T08:00', collectionEndAt: '2026-10-25T08:00' },
    { Cl24DurationHours: '24', Cl24DurationSource: 'assumed-24h' }])('never manufactures a recorded duration for legacy inputs %j', metadata => {
    const result = restore({ selectedFormula: 'Ox_mgkg', inputs: { U_Ox: '2', V24: '1500', ...metadata } });
    expect(snapshot(result)).toMatchObject({ OXDZM_concentration: '2', OXDZM_volume: '1500', OXDZM_collectionHours: '',
      OXDZM_collectionSource: 'historical-missing', OXDZM_durationNeedsConfirmation: true });
    result.api.ClcrCollectionDuration.ensureDefaults(result.document);
    expect(result.controls.OXDZM_collectionHours.value).toBe('');
    expect(result.parses()).toBe(0);
  });

  it.each(['0', '-1', 'invalid'])('retains invalid captured duration %s explicitly', hours => {
    const result = restore({ selectedFormula: 'Ox_mgkg', context: { collectionHours: hours }, inputs: { U_Ox: '2', V24: '1500' } });
    expect(snapshot(result)).toMatchObject({ OXDZM_collectionHours: hours, OXDZM_collectionSource: 'captured' });
    expect(result.api.ClcrCollectionDuration.fromValues(snapshot(result), {}, { fieldId: 'OXDZM_collectionHours' }).valid).toBe(false);
  });

  it('does not reinterpret shared spot inputs or overwrite dedicated blanks', () => {
    expect(snapshot(restore({ selectedFormula: 'Ox_Cr', inputs: { U_Ox: '2', V24: '1500' } }))).toMatchObject(defaults);
    const result = restore({ selectedFormula: 'Ox_mgkg', inputs: { U_Ox: '2', V24: '1500', OXDZM_concentration: '', OXDZM_reportedValue: '' } });
    expect(snapshot(result)).toMatchObject({ OXDZM_concentration: '', OXDZM_volume: '', OXDZM_concentrationUnit: 'µmol/L', OXDZM_reportingEntity: 'unknown' });
  });

  it('keeps a historical clock gap portable across repeated restores and resolves it only on a valid edit', () => {
    const input = { OXDZM_concentration: '200', OXDZM_collectionHours: '', OXDZM_collectionSource: 'historical-missing', OXDZM_durationNeedsConfirmation: true };
    const result = restore({ selectedFormula: 'Ox_mgkg', inputs: input });
    expect(snapshot(result)).toMatchObject(input);
    expect(snapshot(restore(result.api.buildClcrSessionSnapshot()))).toMatchObject(input);
    const control = result.controls.OXDZM_collectionHours;
    result.api.ClcrCollectionDuration.bindControl(control);
    control.value = '12'; control.dispatchEvent({ type: 'input', isTrusted: true });
    expect(snapshot(result)).toMatchObject({ OXDZM_collectionHours: '12', OXDZM_collectionSource: 'hours', OXDZM_durationNeedsConfirmation: false });
  });

  it('keeps explicit invalid source after capture and blur without creating24h', () => {
    const result = restore({ selectedFormula: 'Ox_mgkg', inputs: { OXDZM_reportedValue: '0.6', OXDZM_collectionHours: '', OXDZM_collectionSource: 'invalid' } });
    const field = result.controls.OXDZM_collectionHours;
    result.api.ClcrCollectionDuration.bindControl(field);
    field.dispatchEvent({ type: 'blur' });
    expect(snapshot(result)).toMatchObject({ OXDZM_collectionHours: '', OXDZM_collectionSource: 'invalid', OXDZM_durationNeedsConfirmation: false });
    expect(result.api.ClcrCollectionDuration.readFromDocument(result.document, { fieldId: 'OXDZM_collectionHours' }).valid).toBe(false);
  });

  it('does not let an unrelated shared missing-clock marker override an explicit new oxalate clock', () => {
    const result = runtime({ durationNeedsConfirmation: true, OXDZM_collectionHours: '24', OXDZM_durationNeedsConfirmation: false });
    const duration = result.api.ClcrCollectionDuration.fromValues(snapshot(result), {}, { fieldId: 'OXDZM_collectionHours' });
    expect(duration).toMatchObject({ valid: true, hours: 24, assumed: true });
  });

  it('restores negative collection facts recorded in context before older adapters can erase them', () => {
    const result = restore({ selectedFormula: 'Ox_mgkg', inputs: { OXDZM_concentration: '200', OXDZM_volume: '1500', OXDZM_collectionHours: '24' },
      context: { knownFacts: { collectionNoMissedVoids: false }, collectionProblem: true } });
    expect(snapshot(result)).toMatchObject({ Cl24CollectionProblem: true, collectionNoMissedVoids: false, ui_collectionNoMissedVoids_answer: 'no' });
    expect(result.api.ClcrOxDzmSession.readContext().knownFacts).toMatchObject({ Cl24CollectionProblem: true, collectionNoMissedVoids: false });
  });

  it('clear retains patient demographics but removes the previous collection, mass form and conversion metadata', () => {
    const result = runtime({ OXDZM_inputMode: 'reported', OXDZM_collectionHours: '12', OXDZM_reportingEntity: 'oxalic_acid', OXDZM_unitConversions: '{"old":true}' });
    const before = snapshot(result);
    result.document.dispatchEvent({ type: 'DOMContentLoaded' });
    for (const control of Object.values(result.controls)) if (control.type === 'checkbox') control.checked = false; else if (control.id !== 'formulaPicker') control.value = '';
    result.clearBtn.dispatchEvent({ type: 'click', clcrClearedFormula: 'Ox_mgkg', clcrPreservedOxDzmContext: { ...before, arbitrary: 'unsafe' } });
    expect(snapshot(result)).toMatchObject({ ...defaults, age: '10', weight: '30', height: '140', Cl24CollectionProblem: false,
      ui_collectionNoMissedVoids_answer: '', collectionStartAt: '', collectionEndAt: '' });
    expect(result.api.__vildaClcrVersionValueVault).not.toHaveProperty('arbitrary');
    expect(result.api.ClcrOxDzmSession.readContext().knownFacts).toEqual({});
  });

  it('external patient load without a session resets historical and specimen context', () => {
    const result = runtime({ OXDZM_collectionHours: '', OXDZM_collectionSource: 'historical-missing', OXDZM_durationNeedsConfirmation: true });
    expect(result.api.__vildaClcrRehydrate()).toBe(true);
    expect(snapshot(result)).toMatchObject(defaults);
  });

  it('current DOM age and explicit blanks win over previous demographics', () => {
    const result = restore({ selectedFormula: 'Ox_mgkg', inputs: { age: '10', ageMonths: '6', weight: '30', height: '140' } });
    expect(result.api.ClcrOxDzmSession.readContext()).toMatchObject({ ageYears: 10.5, weightKg: '30', heightCm: '140', agePrecision: 'exact' });
    result.controls.age.value = '17'; result.controls.ageMonths.value = ''; result.controls.weight.value = '';
    expect(result.api.ClcrOxDzmSession.readContext()).toMatchObject({ ageYears: 17, agePrecision: 'completed-years', weightKg: '' });
    result.controls.age.value = '';
    expect(result.api.ClcrOxDzmSession.readContext().ageYears).toBe(null);
  });

  it('reconstructs the shipped additive adapter and preserves earlier patch contracts', () => {
    expect(patchOxDzmSessionHooks(source)).toBe(source);
    const withoutOx = source.replace(oxDzmSessionSource, '').replace('try{window.ClcrOxDzmUi?.ensureControls?.(document)}catch{}', '');
    expect(patchOxDzmSessionHooks(withoutOx)).toBe(source);
    expect(patchProteinDzmSessionHooks(source)).toBe(source);
    expect(patchPotassiumDzmSessionHooks(source)).toBe(source);
    expect(patchUrateCreatinineSessionHooks(source)).toBe(source);
    expect(() => patchOxDzmSessionHooks(withoutOx.replace('(function(){const b="vildaClcrSessionV1";', ''))).toThrow('Ambiguous oxalate session integration anchor');
  });
});
