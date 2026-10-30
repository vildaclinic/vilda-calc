import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { patchPo4DzmSessionHooks, po4DzmSessionSource } from '../../tools/patch-klirens-po4-dzm-session.mjs';
import { patchProteinDzmSessionHooks, proteinDzmSessionSource } from '../../tools/patch-klirens-protein-dzm-session.mjs';
import { patchSodiumDzmSessionHooks, sodiumDzmSessionSource } from '../../tools/patch-klirens-sodium-dzm-session.mjs';
import { patchMgDzmSessionHooks } from '../../tools/patch-klirens-mg-dzm-session.mjs';
import { patchCaDzmSessionHooks } from '../../tools/patch-klirens-ca-dzm-session.mjs';
import { patchUaSessionHooks } from '../../tools/patch-klirens-ua-session.mjs';
import { patchPhSessionHooks } from '../../tools/patch-klirens-ph-session.mjs';
import { patchTmpGfrSessionHooks } from '../../tools/patch-klirens-tmp-session.mjs';
import { patchUagSessionHooks } from '../../tools/patch-klirens-uag-session.mjs';

const source = readFileSync(new URL('../../inline_kalkulator_klirens_07.js', import.meta.url), 'utf8');
const durationSource = readFileSync(new URL('../../clcr_collection_duration.js', import.meta.url), 'utf8');
const defaults = { PO4_inputMode: 'concentration', PO4_concentration: '', PO4_concentrationUnit: 'mgP/dL', PO4_volume: '',
  PO4_volumeUnit: 'mL', PO4_reportedValue: '', PO4_reportedUnit: 'mgP/24h', PO4_outputUnit: 'mgP/24h', PO4_collectionHours: '24', PO4_collectionSource: 'assumed-24h', PO4_unitConversions: '' };
function eventTarget(target = {}) {
  const listeners = new Map();
  return Object.assign(target, {
    addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(listener); },
    dispatchEvent(event) { for (const listener of listeners.get(event.type) || []) listener(event); },
  });
}
// Execute the complete production session runtime. Only the browser/storage
// boundary is synthetic; restoration and migration use the shipped functions.
function runtime(initial = {}, options = {}) {
  const values = { formulaPicker: 'PO4_mgkg', age: '10', ageMonths: '0', ageDays: '', sex: 'M', weight: '30', height: '135',
    ...defaults, PO4_concentration: '20.0000', PO4_volume: '1500', PO4_unitConversions: '{"reportedValue":{"originalValue":"500","originalUnit":"mgP/24h","convertedValue":"16.14268","convertedUnit":"mmol/24h"}}', U_PO4: '99', V24: '2345',
    Cl24DurationHours: '12', Cl24DurationSource: 'hours', PO4_durationNeedsConfirmation: false,
    collectionStartAt: '2026-10-24T08:00', collectionEndAt: '2026-10-25T08:00', Cl24CollectionProblem: true,
    collectionNoMissedVoids: false, ui_collectionNoMissedVoids_answer: 'no', ...initial };
  const controls = {};
  let documentRef;
  const add = (id, value) => (controls[id] = eventTarget(typeof value === 'boolean'
    ? { id, ownerDocument: documentRef, tagName: 'INPUT', type: 'checkbox', checked: value }
    : { id, ownerDocument: documentRef, tagName: id === 'formulaPicker' || /Unit$/.test(id) ? 'SELECT' : 'INPUT', type: 'text', value }));
  for (const [id, value] of Object.entries(values)) {
    if (options.omitPo4 && id.startsWith('PO4_') || options.omitConfirmationControl && id === 'PO4_durationNeedsConfirmation') continue;
    add(id, value);
  }
  const form = eventTarget({ querySelectorAll: () => Object.values(controls) }), clearBtn = eventTarget({ id: 'clearBtn', type: 'button' });
  const document = eventTarget({ getElementById: id => id === 'clcrForm' ? form : id === 'clearBtn' ? clearBtn : controls[id] || null, querySelector: () => null });
  documentRef = document;
  for (const control of Object.values(controls)) control.ownerDocument = document;
  let materializations = 0, parses = 0;
  const storage = new Map(), window = eventTarget({ currentVersion: 'advanced', document,
    ClcrPo4DzmUi: { ensureControls() { materializations += 1; for (const [id, value] of Object.entries(defaults)) if (!controls[id]) add(id, value); } },
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
  });
  document.defaultView = window;
  const timers = [];
  class NoWallClockDate extends Date { static parse() { parses += 1; throw new Error('Session restore must not parse old wall-clock dates'); } }
  const context = { window, document, Date: NoWallClockDate,
    setTimeout: callback => { timers.push(callback); return timers.length; }, clearTimeout() {} };
  vm.createContext(context);
  if (!options.omitDurationModule) vm.runInContext(durationSource, context);
  vm.runInContext(source, context);
  return { api: window, context, document, controls, clearBtn, storage, timers, materializations: () => materializations, parses: () => parses };
}
function restore(session, initial, options) {
  const result = runtime(initial, options), original = structuredClone(session);
  expect(result.api.applyClcrSessionSnapshot(session, { update: false, preserveAcrossVersions: true })).toBe(true);
  expect(session).toEqual(original);
  return result;
}
const snapshot = result => result.api.buildClcrSessionSnapshot().inputs;

describe('PO4 DZM — complete production session runtime', () => {
  it('the actual capture canonicalizes native-reset duration defaults before their first restoration without mutating DOM or value vault', () => {
    const resetHours = { Cl24DurationHours: '24', Cl24DurationSource: 'assumed-24h',
      CA_collectionHours: '', CA_collectionSource: 'assumed-24h', UA_collectionHours: '', UA_collectionSource: 'assumed-24h',
      MG_collectionHours: '', MG_collectionSource: 'assumed-24h', PO4_collectionHours: '', PO4_collectionSource: 'assumed-24h',
      Prot_collectionHours: '', Prot_collectionSource: 'assumed-24h', Na_collectionHours: '', Na_collectionSource: 'assumed-24h' };
    const result = runtime({ formulaPicker: 'ckid_u25', ...resetHours, PO4_durationNeedsConfirmation: 'false',
      collectionStartAt: '', collectionEndAt: '', Cl24CollectionProblem: false });
    // The existing capture lazily allocates an empty vault. Seed that same
    // empty boundary so this assertion detects new metadata writes, not the
    // established lazy allocation itself.
    result.api.__vildaClcrVersionValueVault = {};
    const vaultBefore = structuredClone(result.api.__vildaClcrVersionValueVault);
    const first = result.api.buildClcrSessionSnapshot();
    for (const [field, value] of Object.entries(resetHours)) expect(result.controls[field].value).toBe(value);
    expect(result.api.__vildaClcrVersionValueVault).toEqual(vaultBefore);
    const durationKeys = result.api.ClcrCollectionDuration.HOURS_FIELDS.flatMap(field => [field, result.api.ClcrCollectionDuration.SOURCES[field],
      field === 'Cl24DurationHours' ? 'durationNeedsConfirmation' : field.split('_')[0] + '_durationNeedsConfirmation']);
    const durationValues = input => Object.fromEntries(durationKeys.map(key => [key, input[key]]));
    for (const field of result.api.ClcrCollectionDuration.HOURS_FIELDS) expect(first.inputs[field]).toBe('24');
    expect(first.inputs.PO4_durationNeedsConfirmation).toBe('false');
    expect(first.inputs.CA_durationNeedsConfirmation).toBe(false);
    expect(first.inputs.durationNeedsConfirmation).toBe(false);
    expect(result.api.applyClcrSessionSnapshot(first, { update: false, preserveAcrossVersions: true })).toBe(true);
    expect(durationValues(snapshot(result))).toEqual(durationValues(first.inputs));
  });
  it.each(['PO4_mgkg', 'Mg_mgkg', 'Ca_mgkg', 'UA_mgkg', 'ACR', 'Na_mmol_d'])('new %s never inherits previous phosphorus specimen values', selectedFormula => {
    const result = restore({ selectedFormula, inputs: { age: '12' } });
    expect(snapshot(result)).toMatchObject({ ...defaults, PO4_durationNeedsConfirmation: false });
    expect(result.api.__vildaClcrVersionValueVault).toMatchObject(defaults);
    expect(result.parses()).toBe(0);
  });

  it.each(['0', '0.0000', '0,0004', '88.0000000001', '1e-12'])('preserves original concentration text %s, units and patient facts', value => {
    const input = { PO4_concentration: value, PO4_concentrationUnit: 'mmol/L', PO4_volume: '1,5000', PO4_volumeUnit: 'L',
      PO4_outputUnit: 'mmol/24h', PO4_collectionHours: '23.500', PO4_collectionSource: 'captured', age: '13', ageMonths: '0', weight: '', sex: 'F',
      Cl24CollectionProblem: true, ui_collectionNoMissedVoids_answer: 'no' };
    const result = restore({ selectedFormula: 'PO4_mgkg', inputs: input });
    expect(snapshot(result)).toMatchObject(input);
    expect(result.materializations()).toBeGreaterThan(0);
  });

  it('restores a preserved-only ready record with no weight and explicit missing patient data', () => {
    const input = { formulaPicker: 'PO4_mgkg', PO4_inputMode: 'reported', PO4_reportedValue: '1,2000', PO4_reportedUnit: 'mmol/24h',
      PO4_outputUnit: 'mgP/24h', weight: '', height: '', age: '', ageMonths: '', sex: '', ui_collectionNoMissedVoids_answer: 'no' };
    const result = restore({ preservedInputs: input }, { formulaPicker: 'ACR' });
    expect(result.controls.formulaPicker.value).toBe('PO4_mgkg');
    expect(snapshot(result)).toMatchObject({ ...input, PO4_collectionHours: '24' });
    expect(snapshot(result).PO4_concentration).toBe('');
    expect(snapshot(result).PO4_volume).toBe('');
  });

  it.each(['object', 'string'])('preserves incoming %s unit-conversion provenance through a session round trip', kind => {
    const metadata = {
      concentration: { originalValue: '13', originalUnit: 'mgP/dL', convertedValue: '4.19709', convertedUnit: 'mmol/L' },
      volume: { originalValue: '1500', originalUnit: 'mL', convertedValue: '1.5', convertedUnit: 'L' },
      reportedValue: { originalValue: '941', originalUnit: 'mgP/24h', convertedValue: '30.38051', convertedUnit: 'mmol/24h' },
    };
    const input = { PO4_concentration: '4.19709', PO4_concentrationUnit: 'mmol/L', PO4_volume: '1.5', PO4_volumeUnit: 'L',
      PO4_reportedValue: '30.38051', PO4_reportedUnit: 'mmol/24h', PO4_unitConversions: kind === 'object' ? metadata : JSON.stringify(metadata) };
    const result = restore({ selectedFormula: 'PO4_mgkg', inputs: input });
    expect(JSON.parse(snapshot(result).PO4_unitConversions)).toEqual(metadata);
    expect(JSON.parse(result.api.__vildaClcrVersionValueVault.PO4_unitConversions)).toEqual(metadata);
    expect(snapshot(restore(result.api.buildClcrSessionSnapshot()))).toMatchObject({ ...input, PO4_unitConversions: JSON.stringify(metadata) });
  });

  it('does not inherit previous-patient unit-conversion provenance when the incoming session omits it', () => {
    const metadata = JSON.stringify({ concentration: { originalValue: '13', originalUnit: 'mgP/dL', convertedValue: '4.19709', convertedUnit: 'mmol/L' } });
    const result = restore({ selectedFormula: 'PO4_mgkg', inputs: { PO4_unitConversions: metadata } });
    expect(snapshot(result).PO4_unitConversions).toBe(metadata);
    expect(result.api.applyClcrSessionSnapshot({ selectedFormula: 'PO4_mgkg', inputs: { PO4_concentration: '10', PO4_volume: '1500' } }, { update: false })).toBe(true);
    expect(snapshot(result).PO4_unitConversions).toBe('');
    expect(result.api.__vildaClcrVersionValueVault.PO4_unitConversions).toBe('');
  });

  it.each([1440, '1440', 720, '1410'])('migrates legacy phosphorus with captured %s minutes without parsing dates or rescaling values', minutes => {
    const result = restore({ selectedFormula: 'PO4_mgkg', context: { durationMinutes: minutes }, inputs: { U_PO4: '20.000', V24: '1500',
      collectionStartAt: '2026-10-24T08:00', collectionEndAt: '2026-10-25T08:00' } });
    expect(snapshot(result)).toMatchObject({ PO4_concentration: '20.000', PO4_concentrationUnit: 'mgP/dL', PO4_volume: '1500', PO4_volumeUnit: 'mL',
      PO4_collectionHours: String(Number(minutes) / 60), PO4_collectionSource: 'captured', PO4_durationNeedsConfirmation: false });
    expect(result.parses()).toBe(0);
  });

  it.each([{ durationHours: 0 }, { durationHours: '-1' }, { durationMinutes: 0 }, { durationMinutes: '-60' }, { durationMinutes: 'invalid' }])('keeps invalid captured duration $durationHours$durationMinutes explicit', captured => {
    const result = restore({ selectedFormula: 'PO4_mgkg', context: captured, inputs: { U_PO4: '20', V24: '1500' } });
    const value = captured.durationHours ?? (captured.durationMinutes === 'invalid' ? 'invalid' : Number(captured.durationMinutes) / 60);
    expect(snapshot(result)).toMatchObject({ PO4_collectionHours: String(value), PO4_collectionSource: 'captured' });
    expect(result.api.ClcrCollectionDuration.fromValues(snapshot(result), {}, { fieldId: 'PO4_collectionHours', sourceId: 'PO4_collectionSource' }).valid).toBe(false);
  });

  it('migrates a legacy specimen even when its dedicated duration was already captured', () => {
    const result = restore({ selectedFormula: 'PO4_mgkg', inputs: { U_PO4: '20.000', V24: '1500', PO4_collectionHours: '12', PO4_collectionSource: 'hours' } });
    expect(snapshot(result)).toMatchObject({ PO4_concentration: '20.000', PO4_volume: '1500', PO4_collectionHours: '12' });
  });

  it('does not restore a legacy concentration over explicit modern blanks', () => {
    const result = restore({ selectedFormula: 'PO4_mgkg', inputs: { U_PO4: '20.000', V24: '1500', PO4_concentration: '', PO4_volume: '' } });
    expect(snapshot(result)).toMatchObject({ PO4_concentration: '', PO4_volume: '' });
  });

  it('legacy dates without numeric duration require deliberate confirmation', () => {
    const result = restore({ selectedFormula: 'PO4_mgkg', inputs: { U_PO4: '20', V24: '1500', Cl24DurationHours: '24', Cl24DurationSource: 'assumed-24h',
      collectionStartAt: '2026-10-24T08:00', collectionEndAt: '2026-10-25T08:00' } });
    expect(snapshot(result)).toMatchObject({ PO4_collectionHours: '', PO4_collectionSource: 'historical-missing', PO4_durationNeedsConfirmation: true });
    result.api.ClcrCollectionDuration.ensureDefaults(result.document);
    expect(result.controls.PO4_collectionHours.value).toBe('');
    expect(result.parses()).toBe(0);
  });

  it('materializes phosphorus controls before the first capture without a session restore', () => {
    const result = runtime({}, { omitPo4: true });
    expect(snapshot(result)).toMatchObject(defaults);
    expect(result.materializations()).toBeGreaterThan(0);
  });

  it.each(['concentration', 'reported'])('restoring %s preserves non24h and invalid time without rescaling specimen text', mode => {
    for (const hours of ['12', '23,5', '25', '0', '-1', 'invalid']) {
      const input = { PO4_inputMode: mode, PO4_reportedValue: '600.000', PO4_concentration: '20.000', PO4_volume: '1500', PO4_collectionHours: hours, PO4_collectionSource: 'hours' };
      const result = restore({ selectedFormula: 'PO4_mgkg', inputs: input });
      expect(snapshot(result)).toMatchObject(input);
      const roundTrip = restore(result.api.buildClcrSessionSnapshot());
      expect(snapshot(roundTrip)).toMatchObject(input);
    }
  });

  it('clearing phosphorus preserves known patient facts and collection errors, then resets the specimen and24h', () => {
    const result = runtime({ PO4_inputMode: 'reported', PO4_reportedValue: '1', PO4_collectionHours: '12' }), saved = snapshot(result);
    result.document.dispatchEvent({ type: 'DOMContentLoaded' });
    for (const control of Object.values(result.controls)) if (control.type === 'checkbox') control.checked = false; else if (control.id !== 'formulaPicker') control.value = '';
    result.clearBtn.dispatchEvent({ type: 'click', clcrClearedFormula: 'PO4_mgkg', clcrPreservedPo4DzmContext: { ...saved, arbitrary: 'unsafe' } });
    expect(snapshot(result)).toMatchObject({ ...defaults, age: '10', ageMonths: '0', weight: '30', height: '135', sex: 'M', Cl24CollectionProblem: true,
      ui_collectionNoMissedVoids_answer: 'no', PO4_durationNeedsConfirmation: false });
    expect(result.api.__vildaClcrVersionValueVault).not.toHaveProperty('arbitrary');
  });

  it('loading a patient without Klirens session resets phosphorus specimen and duration', () => {
    const result = runtime();
    expect(result.api.__vildaClcrRehydrate()).toBe(true);
    expect(snapshot(result)).toMatchObject({ ...defaults, PO4_durationNeedsConfirmation: false, Cl24DurationHours: '24', Cl24DurationSource: 'assumed-24h' });
  });
});

describe('PO4 DZM — portable collection provenance', () => {
  it.each(['', '0', '-1', 'invalid', '0x18', '23,5.0'])('historical missing duration %s stays unresolved across restores', hours => {
    const input = { PO4_collectionHours: hours, PO4_collectionSource: 'historical-missing', PO4_durationNeedsConfirmation: true };
    const result = restore({ selectedFormula: 'PO4_mgkg', inputs: input }, {}, { omitConfirmationControl: true });
    expect(snapshot(result)).toMatchObject(input);
    const roundTrip = restore(result.api.buildClcrSessionSnapshot(), {}, { omitConfirmationControl: true });
    expect(snapshot(roundTrip)).toMatchObject(input);
    expect(roundTrip.parses()).toBe(0);
  });

  it.each(['12', '+12', '1e1', '2.4e1', '1e+1', '+1e1'])('positive entered %s resolves the historical gap with and without duration module', hours => {
    for (const omitDurationModule of [false, true]) {
      const result = restore({ selectedFormula: 'PO4_mgkg', inputs: { PO4_collectionHours: hours, PO4_collectionSource: 'historical-missing', PO4_durationNeedsConfirmation: 'true' } }, {}, { omitConfirmationControl: true, omitDurationModule });
      expect(snapshot(result)).toMatchObject({ PO4_collectionHours: hours, PO4_collectionSource: 'hours', PO4_durationNeedsConfirmation: false });
      expect(result.api.__vildaClcrVersionValueVault.PO4_durationNeedsConfirmation).toBe(false);
    }
  });

  it('new blank time is24h and a contradictory24h assumption becomes explicit hours', () => {
    expect(snapshot(restore({ selectedFormula: 'PO4_mgkg', inputs: { PO4_collectionHours: '' } }))).toMatchObject(defaults);
    expect(snapshot(restore({ selectedFormula: 'PO4_mgkg', inputs: { PO4_collectionHours: '12', PO4_collectionSource: 'assumed-24h' } }))).toMatchObject({ PO4_collectionHours: '12', PO4_collectionSource: 'hours' });
  });

  it('a new patient resets the previous historical flag and known collection error to unknown', () => {
    const result = restore({ selectedFormula: 'PO4_mgkg', inputs: { PO4_collectionHours: '', PO4_collectionSource: 'historical-missing', PO4_durationNeedsConfirmation: true,
      Cl24CollectionProblem: true, ui_collectionNoMissedVoids_answer: 'no' } }, {}, { omitConfirmationControl: true });
    expect(result.api.applyClcrSessionSnapshot({ selectedFormula: 'PO4_mgkg', inputs: { age: '12', weight: '', sex: '' } }, { update: false })).toBe(true);
    expect(snapshot(result)).toMatchObject({ ...defaults, PO4_durationNeedsConfirmation: false, age: '12', weight: '', sex: '', Cl24CollectionProblem: false, ui_collectionNoMissedVoids_answer: '' });
  });

  it('clear and no-session patient reset discard historical flags without a flag control', () => {
    const input = { PO4_collectionHours: '', PO4_collectionSource: 'historical-missing', PO4_durationNeedsConfirmation: true };
    const result = restore({ selectedFormula: 'PO4_mgkg', inputs: input }, {}, { omitConfirmationControl: true });
    result.document.dispatchEvent({ type: 'DOMContentLoaded' });
    result.clearBtn.dispatchEvent({ type: 'click', clcrClearedFormula: 'PO4_mgkg' });
    expect(snapshot(result)).toMatchObject(defaults);
    expect(snapshot(result).PO4_durationNeedsConfirmation).not.toBe(true);
    expect(result.api.applyClcrSessionSnapshot({ selectedFormula: 'PO4_mgkg', inputs: input }, { update: false })).toBe(true);
    expect(snapshot(result).PO4_durationNeedsConfirmation).toBe(true);
    expect(result.api.__vildaClcrRehydrate()).toBe(true);
    expect(snapshot(result)).toMatchObject(defaults);
    expect(snapshot(result).PO4_durationNeedsConfirmation).not.toBe(true);
  });

  it('all preceding readable session patches remain byte-for-byte idempotent', () => {
    expect(source).toContain(po4DzmSessionSource);
    for (const patch of [patchPo4DzmSessionHooks, patchMgDzmSessionHooks, patchCaDzmSessionHooks, patchUaSessionHooks, patchPhSessionHooks, patchTmpGfrSessionHooks, patchUagSessionHooks, patchProteinDzmSessionHooks, patchSodiumDzmSessionHooks]) expect(patch(source)).toBe(source);
    expect(po4DzmSessionSource).not.toContain('Date.parse');
    expect(() => patchPo4DzmSessionHooks(source.replace('try{window.ClcrPo4DzmUi?.ensureControls?.(document)}catch{}', ''))).toThrow('Missing or duplicate phosphorus session capture hook');
  });

  it('reproduces the shipped adapter from the preceding audited session source', () => {
    const beforeSodium = source.replace(sodiumDzmSessionSource, '').replace('try{window.ClcrSodiumDzmUi?.ensureControls?.(document)}catch{}', '');
    const beforeProtein = beforeSodium.replace(proteinDzmSessionSource, '').replace('try{window.ClcrProteinDzmUi?.ensureControls?.(document)}catch{}', '');
    const preceding = beforeProtein.replace(po4DzmSessionSource, '').replace('try{window.ClcrPo4DzmUi?.ensureControls?.(document)}catch{}', '')
      .replace('o.inputs=window.ClcrCollectionDuration?.normalizeCapturedInputs?.(o.inputs)||o.inputs,', '');
    expect(patchPo4DzmSessionHooks(preceding)).toBe(beforeProtein);
    expect(patchProteinDzmSessionHooks(patchPo4DzmSessionHooks(preceding))).toBe(beforeSodium);
    expect(patchSodiumDzmSessionHooks(patchProteinDzmSessionHooks(patchPo4DzmSessionHooks(preceding)))).toBe(source);
    expect(() => patchPo4DzmSessionHooks(preceding.replace('(function(){const b="vildaClcrSessionV1";', ''))).toThrow('Ambiguous phosphorus session integration anchor');
    expect(() => patchPo4DzmSessionHooks(preceding.replace('o.inputs.formulaPicker=r,o}', 'o.inputs.formulaPicker=r}'))).toThrow('Ambiguous captured duration normalization anchor');
  });
});
