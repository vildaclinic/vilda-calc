import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { patchCaDzmSessionHooks, caDzmSessionSource } from '../../tools/patch-klirens-ca-dzm-session.mjs';
import { patchPhSessionHooks } from '../../tools/patch-klirens-ph-session.mjs';
import { patchTmpGfrSessionHooks } from '../../tools/patch-klirens-tmp-session.mjs';
import { patchUagSessionHooks } from '../../tools/patch-klirens-uag-session.mjs';

const source = readFileSync(new URL('../../inline_kalkulator_klirens_07.js', import.meta.url), 'utf8');
const defaults = {
  CA_inputMode: 'concentration', CA_concentration: '', CA_concentrationUnit: 'mmol/L', CA_volume: '',
  CA_volumeUnit: 'mL', CA_reportedValue: '', CA_reportedUnit: 'mg/24h', CA_collectionHours: '24', CA_clinicalMode: 'general',
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
    formulaPicker: 'Ca_mgkg', age: '10', ageMonths: '', ageDays: '', sex: 'M', weight: '30', height: '140',
    ...defaults, CA_concentration: '30.0000', CA_volume: '1200', U_Ca: '99', V24: '2345',
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
  const window = eventTarget({ currentVersion: 'advanced', ClcrCaDzmUi: { ensureControls() { materializations += 1; } }, sessionStorage: {
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

describe('Calcium DZM — production session ownership and explicit elapsed duration', () => {
  it.each(['Ca_mgkg','UA_mgkg','ACR','pH_spot'])('a new %s session never inherits another patient’s calcium or diagnosis', selectedFormula => {
    const result=restore({selectedFormula,inputs:{age:'12'}},{CA_clinicalMode:'phpt'});
    expect(snapshot(result)).toMatchObject(defaults);
    expect(result.api.__vildaClcrVersionValueVault).toMatchObject(defaults);
  });
  it.each(['0','0.0000','0,0004','3.999999999999999','4','1e-12'])('retains entered decimal%s and the selected clinical context', concentration => {
    const input={CA_concentration:concentration,CA_concentrationUnit:'mmol/L',CA_volume:'1,2000',CA_volumeUnit:'L',CA_collectionHours:'24.000',CA_clinicalMode:'hypo'};
    const result=restore({selectedFormula:'Ca_mgkg',inputs:input});
    expect(snapshot(result)).toMatchObject(input);expect(result.materializations()).toBeGreaterThan(0);
  });
  it('restores a preserved-only calcium record with its own patient and diagnosis', () => {
    const input={formulaPicker:'Ca_mgkg',CA_inputMode:'reported',CA_reportedValue:'3',CA_reportedUnit:'mg/kg/24h',CA_clinicalMode:'hypo',age:'10',weight:'',ui_collectionNoMissedVoids_answer:'no'};
    const result=restore({preservedInputs:input},{formulaPicker:'ACR'});
    expect(result.controls.formulaPicker.value).toBe('Ca_mgkg');expect(snapshot(result)).toMatchObject(input);
  });
  it.each([1440,'1440',720])('uses recorded minutes%s instead of local date parsing', durationMinutes => {
    const result=restore({selectedFormula:'Ca_mgkg',context:{durationMinutes},inputs:{U_Ca:'5',V24:'1200',collectionStartAt:'2026-10-24T08:00',collectionEndAt:'2026-10-25T08:00'}});
    expect(snapshot(result)).toMatchObject({CA_concentration:'5',CA_concentrationUnit:'mmol/L',CA_volume:'1200',CA_collectionHours:String(Number(durationMinutes)/60)});
  });
  it('old wall-clock dates cannot invent an elapsed collection time', () => {
    const result=restore({selectedFormula:'Ca_mgkg',inputs:{U_Ca:'5',V24:'1200',collectionStartAt:'2026-10-24T08:00',collectionEndAt:'2026-10-25T08:00'}});
    expect(snapshot(result).CA_collectionHours).toBe('');
  });
  it('clear retains patient facts and current diagnosis while resetting the sample', () => {
    const result=runtime({CA_inputMode:'reported',CA_reportedValue:'320',CA_clinicalMode:'hypo'}),saved=snapshot(result);
    result.document.dispatchEvent({type:'DOMContentLoaded'});
    for(const control of Object.values(result.controls))if(control.type==='checkbox')control.checked=false;else if(control.id!=='formulaPicker')control.value='';
    result.clearBtn.dispatchEvent({type:'click',clcrClearedFormula:'Ca_mgkg',clcrPreservedCaDzmContext:{...saved,arbitrary:'unsafe'}});
    expect(snapshot(result)).toMatchObject({...defaults,CA_clinicalMode:'hypo',age:'10',weight:'30',sex:'M',ui_collectionNoMissedVoids_answer:'no'});
    expect(result.api.__vildaClcrVersionValueVault).not.toHaveProperty('arbitrary');
  });
  it('external no-session patient replacement clears the sample and the selected diagnosis', () => {
    const result=runtime({CA_clinicalMode:'phpt'});expect(result.api.__vildaClcrRehydrate()).toBe(true);
    expect(snapshot(result)).toMatchObject(defaults);
  });
  it('all readable production patches remain idempotent', () => {
    expect(source).toContain(caDzmSessionSource);
    for(const patch of [patchCaDzmSessionHooks,patchPhSessionHooks,patchTmpGfrSessionHooks,patchUagSessionHooks])expect(patch(source)).toBe(source);
    expect(()=>patchCaDzmSessionHooks(source.replace('normalizeCaDzmSessionInputs(n);if(!o)','if(!o)'))).toThrow('Missing or duplicate calcium session hook');
    expect(caDzmSessionSource).not.toContain('Date.parse');
  });
});
