import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { patchUaSessionHooks, uaSessionSource } from '../../tools/patch-klirens-ua-session.mjs';
import { patchPhSessionHooks } from '../../tools/patch-klirens-ph-session.mjs';
import { patchTmpGfrSessionHooks } from '../../tools/patch-klirens-tmp-session.mjs';
import { patchUagSessionHooks } from '../../tools/patch-klirens-uag-session.mjs';

const source = readFileSync(new URL('../../inline_kalkulator_klirens_07.js', import.meta.url), 'utf8');
const defaults = {
  UA_inputMode: 'concentration', UA_concentration: '', UA_concentrationUnit: 'mg/dL', UA_volume: '',
  UA_volumeUnit: 'mL', UA_reportedValue: '', UA_reportedUnit: 'mg/24h', UA_collectionHours: '24',
};
function eventTarget(target = {}) {
  const listeners = new Map();
  return Object.assign(target, {
    addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(listener); },
    dispatchEvent(event) { for (const listener of listeners.get(event.type) || []) listener(event); },
  });
}
// The complete production session runtime supplies restoration/normalization
// decisions. This fixture implements only its DOM and storage boundary.
function runtime(initial = {}) {
  const values = {
    formulaPicker: 'UA_mgkg', age: '10', ageMonths: '', ageDays: '', sex: 'M', weight: '30', height: '140',
    ...defaults, UA_concentration: '30.0000', UA_volume: '1200', U_UA: '99', V24: '2345', U_Ca: '15',
    collectionStartAt: '2026-10-24T08:00', collectionEndAt: '2026-10-25T08:00', Cl24CollectionProblem: true,
    collectionNoMissedVoids: false, ui_collectionNoMissedVoids_answer: 'no',
    collectionStorageFollowed: false, ui_collectionStorageFollowed_answer: 'unknown', ...initial,
  };
  const controls = Object.fromEntries(Object.entries(values).map(([id, value]) => [id, eventTarget(typeof value === 'boolean'
    ? { id, tagName: 'INPUT', type: 'checkbox', checked: value }
    : { id, tagName: id === 'formulaPicker' || /Unit$/.test(id) ? 'SELECT' : 'INPUT', type: 'text', value })]));
  const form = eventTarget({ querySelectorAll: () => Object.values(controls) });
  const clearBtn = eventTarget({ id: 'clearBtn', type: 'button' });
  const document = eventTarget({ getElementById: id => id === 'clcrForm' ? form : id === 'clearBtn' ? clearBtn : controls[id] || null, querySelector: () => null });
  const storage = new Map(); let materializations = 0;
  const window = eventTarget({ currentVersion: 'advanced', ClcrUaUi: { ensureControls() { materializations += 1; } }, sessionStorage: {
    getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key),
  } });
  const timers = [];
  const context = { window, document, setTimeout: callback => { timers.push(callback); return timers.length; }, clearTimeout() {} };
  vm.createContext(context); vm.runInContext(source, context);
  return { api: window, context, controls, clearBtn, document, storage, timers, materializations: () => materializations };
}
function restore(session, initial) {
  const result = runtime(initial), original = structuredClone(session);
  expect(result.api.applyClcrSessionSnapshot(session, { update: false, preserveAcrossVersions: true })).toBe(true);
  expect(session).toEqual(original);
  return result;
}
const snapshot = result => result.api.buildClcrSessionSnapshot().inputs;

describe('UA DZM — production session replacement, exact inputs and duration', () => {
  it.each(['UA_mgkg', 'ACR', 'Ca_mgkg', 'pH_spot'])('incoming %s without UA cannot reuse the previous patient measurement', selectedFormula => {
    const result = restore({ selectedFormula, inputs: { age: '12' } });
    expect(snapshot(result)).toMatchObject(defaults);
    for (const [id, value] of Object.entries(defaults)) expect(result.controls[id].value, id).toBe(value);
    expect(result.api.__vildaClcrVersionValueVault).toMatchObject(defaults);
  });

  it.each(['0', '0.0000', '0,0004', '9.2999999', '9.3', '1e-12'])('preserves exact raw concentration %s, units and explicit duration', UA_concentration => {
    const input = { UA_inputMode: 'concentration', UA_concentration, UA_concentrationUnit: 'mmol/L',
      UA_volume: '1,2000', UA_volumeUnit: 'L', UA_collectionHours: '24.0000' };
    const result = restore({ selectedFormula: 'UA_mgkg', inputs: input });
    expect(snapshot(result)).toMatchObject(input);
    expect(result.materializations()).toBeGreaterThan(0);
  });

  it('a preserved-only reported UA restore owns its formula, patient context and negative collection facts', () => {
    const input = { formulaPicker: 'UA_mgkg', UA_inputMode: 'reported', UA_reportedValue: '0,0004', UA_reportedUnit: 'mg/kg/24h',
      age: '5.5', weight: '', collectionNoMissedVoids: false, ui_collectionNoMissedVoids_answer: 'no' };
    const result = restore({ preservedInputs: input }, { formulaPicker: 'ACR' });
    expect(result.controls.formulaPicker.value).toBe('UA_mgkg');
    expect(snapshot(result)).toMatchObject(input);
  });

  it('preserved-only autosave materializes the UA controls before external rehydration', () => {
    const result = runtime({ formulaPicker: 'ACR' });
    result.storage.set('vildaClcrSessionV1', JSON.stringify({ preservedInputs: {
      formulaPicker: 'UA_mgkg', UA_inputMode: 'reported', UA_reportedValue: '300.000', UA_reportedUnit: 'mg/24h',
    } }));
    expect(result.api.__vildaClcrRehydrate()).toBe(true);
    expect(snapshot(result)).toMatchObject({ formulaPicker: 'UA_mgkg', UA_inputMode: 'reported', UA_reportedValue: '300.000', UA_reportedUnit: 'mg/24h' });
  });

  it('explicit specimen blanks override preserved values and blank duration uses the new24h default', () => {
    const result = restore({ selectedFormula: 'UA_mgkg', inputs: { UA_concentration: '', UA_collectionHours: '' },
      preservedInputs: { UA_concentration: '30', UA_collectionHours: '24' } });
    expect(snapshot(result)).toMatchObject({ UA_concentration: '', UA_collectionHours: '24', UA_collectionSource: 'assumed-24h' });
  });

  it('legacy UA migrates only its canonical concentration and volume without changing other DZM inputs', () => {
    const result = restore({ selectedFormula: 'UA_mgkg', inputs: { U_UA: '30,000', V24: '1200', U_Ca: '15' } });
    expect(snapshot(result)).toMatchObject({ UA_concentration: '30,000', UA_concentrationUnit: 'mg/dL', UA_volume: '1200', UA_volumeUnit: 'mL', UA_collectionHours: '24', U_UA: '30,000', V24: '1200', U_Ca: '15' });
  });

  it('another formula never turns its legacy aliases into an unrequested UA measurement', () => {
    const result = restore({ selectedFormula: 'Ca_mgkg', inputs: { U_UA: '30', V24: '1200', U_Ca: '15' } });
    expect(snapshot(result)).toMatchObject({ ...defaults, U_UA: '30', V24: '1200', U_Ca: '15' });
  });

  it('legacy dates without resolved duration require explicit hours instead of device-timezone calculation', () => {
    const result = restore({ selectedFormula: 'UA_mgkg', inputs: { U_UA: '30', V24: '1200',
      collectionStartAt: '2026-10-24T08:00', collectionEndAt: '2026-10-25T08:00' } });
    expect(snapshot(result).UA_collectionHours).toBe('');
  });

  it.each([1440, '1500'])('uses captured duration %s minutes rather than local date strings', durationMinutes => {
    const result = restore({ selectedFormula: 'UA_mgkg', context: { durationMinutes }, inputs: { U_UA: '30', V24: '1200',
      collectionStartAt: '2026-10-24T08:00', collectionEndAt: '2026-10-25T08:00' } });
    expect(snapshot(result).UA_collectionHours).toBe(String(Number(durationMinutes) / 60));
  });

  it('incoming missing collection facts cannot inherit a known negative or stale local date', () => {
    const result = restore({ selectedFormula: 'UA_mgkg', inputs: { UA_concentration: '30', UA_volume: '1200' } });
    expect(result.controls.collectionNoMissedVoids.checked).toBe(false);
    expect(result.controls.ui_collectionNoMissedVoids_answer.value).toBe('');
    expect(result.controls.Cl24CollectionProblem.checked).toBe(false);
    expect(result.controls.collectionStartAt.value).toBe('');
    expect(result.controls.collectionEndAt.value).toBe('');
  });

  it('two JSON cycles and formula switches retain exact modern UA inputs independently of shared aliases', () => {
    const input = { UA_inputMode: 'concentration', UA_concentration: '0,0004', UA_concentrationUnit: 'mmol/L',
      UA_volume: '1.2000', UA_volumeUnit: 'L', UA_collectionHours: '23,5', U_UA: '99', V24: '1234' };
    let saved = restore({ selectedFormula: 'UA_mgkg', inputs: input }).api.buildClcrSessionSnapshot();
    for (let cycle = 0; cycle < 2; cycle += 1) {
      const result = restore(JSON.parse(JSON.stringify(saved)));
      for (const formula of ['Ca_mgkg', 'pH_spot', 'UA_mgkg']) {
        result.api.clcrCaptureVersionValues({ force: true }); result.controls.formulaPicker.value = formula;
        result.api.clcrRestoreVersionValues({ visibleOnly: false }); expect(snapshot(result)).toMatchObject(input);
      }
      saved = result.api.buildClcrSessionSnapshot();
    }
  });

  it('clear resets UA to the concentration default and keeps only the approved patient/known-fact whitelist', () => {
    const result = runtime({ UA_inputMode: 'reported', UA_reportedValue: '300', UA_reportedUnit: 'mmol/24h' });
    const saved = snapshot(result); result.document.dispatchEvent({ type: 'DOMContentLoaded' });
    const refreshed = [];
    result.api.ClcrUiWorkflow = { refresh() { refreshed.push(['workflow', result.controls.weight.value]); } };
    result.api.clcrUpdate = () => refreshed.push(['result', result.controls.weight.value]);
    // inline04's generic reset runs before this production session listener.
    for (const control of Object.values(result.controls)) {
      if (control.type === 'checkbox') control.checked = false; else if (control.id !== 'formulaPicker') control.value = '';
    }
    result.clearBtn.dispatchEvent({ type: 'click', clcrClearedFormula: 'UA_mgkg', clcrPreservedUaContext: { ...saved, arbitraryField: 'unsafe' } });
    expect(snapshot(result)).toMatchObject({ ...defaults, age: '10', sex: 'M', weight: '30', height: '140', ui_collectionNoMissedVoids_answer: 'no', Cl24CollectionProblem: true });
    expect(result.api.__vildaClcrVersionValueVault).not.toHaveProperty('arbitraryField');
    expect(result.api.__vildaClcrVersionValueVault.U_UA).toBe('');
    expect(refreshed).toEqual([]);
    result.timers.at(-1)();
    expect(refreshed).toEqual([['workflow', '30'], ['result', '30']]);
  });

  it('no-session external load clears measured UA and restores its defaults after the generic reset', () => {
    const result = runtime(); expect(result.api.__vildaClcrRehydrate()).toBe(true);
    expect(snapshot(result)).toMatchObject(defaults);
  });

  it('UA and previous readable session patches remain idempotent and reject missing hooks', () => {
    expect(source).toContain(uaSessionSource);
    for (const patch of [patchUaSessionHooks, patchPhSessionHooks, patchTmpGfrSessionHooks, patchUagSessionHooks]) expect(patch(source)).toBe(source);
    expect(() => patchUaSessionHooks(source.replace('e=prepareUaSession(e);const r=', 'const r='))).toThrow('Missing or duplicate UA session hook');
    expect(uaSessionSource).not.toContain('Date.parse');
  });
});
