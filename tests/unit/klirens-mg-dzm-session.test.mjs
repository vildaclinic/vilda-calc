import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { patchMgDzmSessionHooks, mgDzmSessionSource } from '../../tools/patch-klirens-mg-dzm-session.mjs';
import { patchCaDzmSessionHooks } from '../../tools/patch-klirens-ca-dzm-session.mjs';
import { patchUaSessionHooks } from '../../tools/patch-klirens-ua-session.mjs';
import { patchPhSessionHooks } from '../../tools/patch-klirens-ph-session.mjs';
import { patchTmpGfrSessionHooks } from '../../tools/patch-klirens-tmp-session.mjs';
import { patchUagSessionHooks } from '../../tools/patch-klirens-uag-session.mjs';

const source = readFileSync(new URL('../../inline_kalkulator_klirens_07.js', import.meta.url), 'utf8');
const durationSource = readFileSync(new URL('../../clcr_collection_duration.js', import.meta.url), 'utf8');
const defaults = { MG_inputMode: 'concentration', MG_concentration: '', MG_concentrationUnit: 'mg/L', MG_volume: '',
  MG_volumeUnit: 'mL', MG_reportedValue: '', MG_reportedUnit: 'mg/24h', MG_collectionHours: '24', MG_collectionSource: 'assumed-24h' };
function eventTarget(target = {}) {
  const listeners = new Map();
  return Object.assign(target, {
    addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(listener); },
    dispatchEvent(event) { for (const listener of listeners.get(event.type) || []) listener(event); },
  });
}
// The real complete runtime owns every normalization/restore/capture decision;
// this fixture supplies only its storage and DOM boundary, never a copied rule.
function runtime(initial = {}, options = {}) {
  const values = { formulaPicker: 'Mg_mgkg', age: '10', ageMonths: '', ageDays: '', sex: 'M', weight: '30', height: '135',
    ...defaults, MG_concentration: '20.0000', MG_volume: '1500', U_Mg: '99', V24: '2345',
    Cl24DurationHours: '12', Cl24DurationSource: 'hours', CA_collectionHours: '12', CA_collectionSource: 'hours',
    UA_collectionHours: '12', UA_collectionSource: 'hours', MG_durationNeedsConfirmation: false,
    collectionStartAt: '2026-10-24T08:00', collectionEndAt: '2026-10-25T08:00', Cl24CollectionProblem: true,
    collectionNoMissedVoids: false, ui_collectionNoMissedVoids_answer: 'no', ...initial };
  const controls = {};
  let documentRef;
  const add = (id, value) => (controls[id] = eventTarget(typeof value === 'boolean'
    ? { id, ownerDocument: documentRef, tagName: 'INPUT', type: 'checkbox', checked: value }
    : { id, ownerDocument: documentRef, tagName: id === 'formulaPicker' || /Unit$/.test(id) ? 'SELECT' : 'INPUT', type: 'text', value }));
  for (const [id, value] of Object.entries(values)) {
    if (options.omitMg && id.startsWith('MG_') || options.omitConfirmationControls && (id === 'durationNeedsConfirmation' || /_durationNeedsConfirmation$/.test(id))) continue;
    add(id, value);
  }
  const form = eventTarget({ querySelectorAll: () => Object.values(controls) }), clearBtn = eventTarget({ id: 'clearBtn', type: 'button' });
  const document = eventTarget({ getElementById: id => id === 'clcrForm' ? form : id === 'clearBtn' ? clearBtn : controls[id] || null, querySelector: () => null });
  documentRef = document;
  for (const control of Object.values(controls)) control.ownerDocument = document;
  let materializations = 0, parses = 0;
  const storage = new Map(), window = eventTarget({ currentVersion: 'advanced', document,
    ClcrMgDzmUi: { ensureControls() { materializations += 1; for (const [id, value] of Object.entries(defaults)) if (!controls[id]) add(id, value); } },
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

describe('Mg DZM — complete production session runtime', () => {
  it.each(['Mg_mgkg', 'Ca_mgkg', 'UA_mgkg', 'ACR', 'Na_mmol_d'])('new %s never inherits previous magnesium values', selectedFormula => {
    const result = restore({ selectedFormula, inputs: { age: '12' } });
    expect(snapshot(result)).toMatchObject(defaults);
    expect(result.api.__vildaClcrVersionValueVault).toMatchObject(defaults);
    expect(result.parses()).toBe(0);
  });

  it.each(['0', '0.0000', '0,0004', '88.0000000001', '1e-12'])('preserves original concentration text %s and units', value => {
    const input = { MG_concentration: value, MG_concentrationUnit: 'mmol/L', MG_volume: '1,5000', MG_volumeUnit: 'L', MG_collectionHours: '23.500', MG_collectionSource: 'hours' };
    const result = restore({ selectedFormula: 'Mg_mgkg', inputs: input });
    expect(snapshot(result)).toMatchObject(input);
    expect(result.materializations()).toBeGreaterThan(0);
  });

  it('restores a preserved-only Mg record and its own missing patient data', () => {
    const input = { formulaPicker: 'Mg_mgkg', MG_inputMode: 'reported', MG_reportedValue: '1,2000', MG_reportedUnit: 'mg/kg/24h', weight: '', height: '', age: '10', ui_collectionNoMissedVoids_answer: 'no' };
    const result = restore({ preservedInputs: input }, { formulaPicker: 'ACR' });
    expect(result.controls.formulaPicker.value).toBe('Mg_mgkg');
    expect(snapshot(result)).toMatchObject(input);
    expect(snapshot(result).MG_collectionHours).toBe('24');
  });

  it.each([1440, '1440', 720])('migrates legacy Mg with captured %s minutes, not local dates', minutes => {
    const result = restore({ selectedFormula: 'Mg_mgkg', context: { durationMinutes: minutes }, inputs: { U_Mg: '20.000', V24: '1500', collectionStartAt: '2026-10-24T08:00', collectionEndAt: '2026-10-25T08:00' } });
    expect(snapshot(result)).toMatchObject({ MG_concentration: '20.000', MG_concentrationUnit: 'mg/L', MG_volume: '1500', MG_volumeUnit: 'mL', MG_collectionHours: String(Number(minutes) / 60), MG_collectionSource: 'captured', MG_durationNeedsConfirmation: false });
    expect(result.parses()).toBe(0);
  });

  it.each([{ durationHours: 0 }, { durationHours: '-1' }, { durationMinutes: 0 }, { durationMinutes: '-60' }, { durationMinutes: 'invalid' }])('keeps invalid captured duration $durationHours$durationMinutes explicit', captured => {
    const result = restore({ selectedFormula: 'Mg_mgkg', context: captured, inputs: { U_Mg: '20', V24: '1500' } });
    const value = captured.durationHours ?? (captured.durationMinutes === 'invalid' ? 'invalid' : Number(captured.durationMinutes) / 60);
    expect(snapshot(result)).toMatchObject({ MG_collectionHours: String(value), MG_collectionSource: 'captured' });
    expect(result.api.ClcrCollectionDuration.fromValues(snapshot(result), {}, { fieldId: 'MG_collectionHours', sourceId: 'MG_collectionSource' }).valid).toBe(false);
  });

  it('keeps a historical confirmation flag captured as a primitive string', () => {
    const result = restore({ selectedFormula: 'Mg_mgkg', inputs: { MG_collectionHours: '', MG_durationNeedsConfirmation: 'true' } });
    expect(snapshot(result)).toMatchObject({ MG_collectionHours: '', MG_collectionSource: 'historical-missing', MG_durationNeedsConfirmation: true });
  });

  it('legacy dates without numeric duration require deliberate confirmation', () => {
    const result = restore({ selectedFormula: 'Mg_mgkg', inputs: { U_Mg: '20', V24: '1500', collectionStartAt: '2026-10-24T08:00', collectionEndAt: '2026-10-25T08:00' } });
    expect(snapshot(result)).toMatchObject({ MG_collectionHours: '', MG_collectionSource: 'historical-missing', MG_durationNeedsConfirmation: true });
    result.api.ClcrCollectionDuration.ensureDefaults(result.document);
    expect(result.controls.MG_collectionHours.value).toBe('');
    expect(result.parses()).toBe(0);
  });

  it('materializes Mg controls before the first capture without a session restore', () => {
    const result = runtime({}, { omitMg: true });
    expect(result.api.buildClcrSessionSnapshot().inputs).toMatchObject(defaults);
    expect(result.materializations()).toBeGreaterThan(0);
  });

  it('clearing Mg preserves known patient facts and errors, then resets the specimen and24h', () => {
    const result = runtime({ MG_inputMode: 'reported', MG_reportedValue: '1', MG_collectionHours: '12' }), saved = snapshot(result);
    result.document.dispatchEvent({ type: 'DOMContentLoaded' });
    for (const control of Object.values(result.controls)) if (control.type === 'checkbox') control.checked = false; else if (control.id !== 'formulaPicker') control.value = '';
    result.clearBtn.dispatchEvent({ type: 'click', clcrClearedFormula: 'Mg_mgkg', clcrPreservedMgDzmContext: { ...saved, arbitrary: 'unsafe' } });
    expect(snapshot(result)).toMatchObject({ ...defaults, age: '10', weight: '30', height: '135', sex: 'M', Cl24CollectionProblem: true, ui_collectionNoMissedVoids_answer: 'no', MG_durationNeedsConfirmation: false });
    expect(result.api.__vildaClcrVersionValueVault).not.toHaveProperty('arbitrary');
  });

  it('loading a patient without Klirens session resets Mg and every collection duration', () => {
    const result = runtime();
    expect(result.api.__vildaClcrRehydrate()).toBe(true);
    expect(snapshot(result)).toMatchObject({ ...defaults, Cl24DurationHours: '24', Cl24DurationSource: 'assumed-24h', CA_collectionHours: '24', CA_collectionSource: 'assumed-24h', UA_collectionHours: '24', UA_collectionSource: 'assumed-24h' });
  });
});

describe('Shared DZM duration restoration — one numeric default, no historical re-evaluation', () => {
  it.each(['cl24', 'Ca_mgkg', 'UA_mgkg', 'Mg_mgkg', 'Na_mmol_d', 'K_mmol_d', 'PO4_mgkg', 'Prot_mgkg', 'Ox_mgkg', 'Cit_mgkg', 'pH24'])('%s receives24h when duration is absent', selectedFormula => {
    const result = restore({ selectedFormula, inputs: {} });
    expect(snapshot(result)).toMatchObject({ Cl24DurationHours: '24', Cl24DurationSource: 'assumed-24h', durationNeedsConfirmation: false });
  });

  it.each(['Cl24DurationHours', 'CA_collectionHours', 'UA_collectionHours', 'MG_collectionHours'])('empty new %s becomes actual24', field => {
    const result = restore({ selectedFormula: field.startsWith('CA') ? 'Ca_mgkg' : field.startsWith('UA') ? 'UA_mgkg' : 'Mg_mgkg', inputs: { [field]: '' } });
    expect(snapshot(result)[field]).toBe('24');
  });

  it.each(['0', '-1', 'NaN', 'Infinity', '0x18', '23,5.0'])('explicit invalid %s remains visible and invalid', hours => {
    const result = restore({ selectedFormula: 'Mg_mgkg', inputs: { Cl24DurationHours: hours, CA_collectionHours: hours, UA_collectionHours: hours, MG_collectionHours: hours } });
    for (const field of ['Cl24DurationHours', 'CA_collectionHours', 'UA_collectionHours', 'MG_collectionHours']) expect(snapshot(result)[field]).toBe(hours);
  });

  it('retains an explicit different duration and its captured source, correcting contradictory assumption metadata', () => {
    const result = restore({ selectedFormula: 'Mg_mgkg', inputs: { MG_collectionHours: '12', MG_collectionSource: 'assumed-24h', CA_collectionHours: '23,5', CA_collectionSource: 'captured', Cl24DurationHours: '25', Cl24DurationSource: 'legacy-dates' } });
    expect(snapshot(result)).toMatchObject({ MG_collectionHours: '12', MG_collectionSource: 'hours', CA_collectionHours: '23,5', CA_collectionSource: 'captured', Cl24DurationHours: '25', Cl24DurationSource: 'legacy-dates' });
  });

  it.each(['Ca_mgkg', 'UA_mgkg'])('does not prevent the prior%s legacy concentration migration', selectedFormula => {
    const prefix = selectedFormula === 'Ca_mgkg' ? 'CA' : 'UA', old = selectedFormula === 'Ca_mgkg' ? 'U_Ca' : 'U_UA';
    const result = restore({ selectedFormula, inputs: { [old]: '5.000', V24: '1200', collectionStartAt: '2026-10-24T08:00', collectionEndAt: '2026-10-25T08:00' } });
    expect(snapshot(result)[prefix + '_concentration']).toBe('5.000');
    expect(snapshot(result)[prefix + '_volume']).toBe('1200');
    expect(snapshot(result)[prefix + '_collectionHours']).toBe('');
    expect(snapshot(result)[prefix + '_collectionSource']).toBe('historical-missing');
    expect(result.parses()).toBe(0);
  });

  const historicalDurations = [
    ['cl24', 'Cl24DurationHours', 'Cl24DurationSource', 'durationNeedsConfirmation'],
    ['Ca_mgkg', 'CA_collectionHours', 'CA_collectionSource', 'CA_durationNeedsConfirmation'],
    ['UA_mgkg', 'UA_collectionHours', 'UA_collectionSource', 'UA_durationNeedsConfirmation'],
    ['Mg_mgkg', 'MG_collectionHours', 'MG_collectionSource', 'MG_durationNeedsConfirmation'],
  ];
  it.each(historicalDurations)('%s keeps historical provenance through blank and invalid restores until valid12h', (selectedFormula, field, sourceId, flag) => {
    for (const hours of ['', '0', '-1', 'invalid', '0x18', '23,5.0']) {
      const inputs = { [field]: hours, [sourceId]: 'historical-missing', [flag]: true };
      const first = restore({ selectedFormula, inputs }, {}, { omitConfirmationControls: true });
      expect(snapshot(first), field + ' = ' + hours).toMatchObject(inputs);
      const restored = restore(first.api.buildClcrSessionSnapshot(), {}, { omitConfirmationControls: true });
      expect(snapshot(restored), field + ' second restore = ' + hours).toMatchObject(inputs);
    }
    for (const hours of ['12', '+12', '1e1', '2.4e1', '1e+1', '+1e1']) {
      for (const omitDurationModule of [false, true]) {
        const confirmed = restore({ selectedFormula, inputs: { [field]: hours, [sourceId]: 'historical-missing', [flag]: true } }, {}, { omitConfirmationControls: true, omitDurationModule });
        expect(snapshot(confirmed), field + ' confirmed = ' + hours).toMatchObject({ [field]: hours, [sourceId]: 'hours', [flag]: false });
        expect(confirmed.api.__vildaClcrVersionValueVault[flag]).toBe(false);
      }
    }
  });

  it.each(historicalDurations)('%s clear and no-session patient reset discard a historical flag without a flag control', (selectedFormula, field, sourceId, flag) => {
    const result = restore({ selectedFormula, inputs: { [field]: '', [sourceId]: 'historical-missing', [flag]: true } }, {}, { omitConfirmationControls: true });
    result.document.dispatchEvent({ type: 'DOMContentLoaded' });
    result.clearBtn.dispatchEvent({ type: 'click', clcrClearedFormula: selectedFormula });
    expect(snapshot(result)).toMatchObject({ [field]: '24', [sourceId]: 'assumed-24h' });
    expect(snapshot(result)[flag]).not.toBe(true);
    expect(result.api.applyClcrSessionSnapshot({ selectedFormula, inputs: { [field]: '', [sourceId]: 'historical-missing', [flag]: true } }, { update: false })).toBe(true);
    expect(snapshot(result)[flag]).toBe(true);
    expect(result.api.__vildaClcrRehydrate()).toBe(true);
    expect(snapshot(result)).toMatchObject({ [field]: '24', [sourceId]: 'assumed-24h' });
    expect(snapshot(result)[flag]).not.toBe(true);
  });

  it.each(historicalDurations)('%s restoring a new patient clears the prior patient historical flag', (selectedFormula, field, sourceId, flag) => {
    const result = restore({ selectedFormula, inputs: { [field]: '', [sourceId]: 'historical-missing', [flag]: true } }, {}, { omitConfirmationControls: true });
    expect(result.api.applyClcrSessionSnapshot({ selectedFormula, inputs: { age: '12' } }, { update: false })).toBe(true);
    expect(snapshot(result)).toMatchObject({ [field]: '24', [sourceId]: 'assumed-24h', [flag]: false, age: '12' });
  });

  it('all preceding readable session patches remain idempotent', () => {
    expect(source).toContain(mgDzmSessionSource);
    for (const patch of [patchMgDzmSessionHooks, patchCaDzmSessionHooks, patchUaSessionHooks, patchPhSessionHooks, patchTmpGfrSessionHooks, patchUagSessionHooks]) expect(patch(source)).toBe(source);
    expect(mgDzmSessionSource).not.toContain('Date.parse');
    expect(() => patchMgDzmSessionHooks(source.replace('try{window.ClcrMgDzmUi?.ensureControls?.(document)}catch{}', ''))).toThrow('Missing or duplicate magnesium session capture hook');
  });
});
