import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const clone = value => JSON.parse(JSON.stringify(value));
const MAIN = { name: 'Fikcyjny Pacjent Szczawianów DZM', user: { age: 10, sex: 'F', height: 135, weight: 30 } };
const PID = 'fictional-oxalate-dzm-chip';

// Mount the production oxalate controls and use the complete shipped renal
// serializer; no duplicate control defaults or medical arithmetic live here.
function collector() {
  const document = atrapaDokumentu(), create = document.createElement;
  document.createElement = tag => {
    const node = create(tag);
    node.append = (...children) => children.forEach(child => node.appendChild(child));
    return node;
  };
  document.querySelector = selector => document.documentElement.querySelector(selector);
  document.querySelectorAll = selector => document.documentElement.querySelectorAll(selector);
  const form = document.createElement('form'); form.id = 'clcrForm';
  const formula = document.createElement('input'); formula.id = 'formulaPicker'; formula.value = '';
  form.append(formula); document.body.appendChild(form);
  const window = { document, currentVersion: 'basic', addEventListener() {},
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
  document.defaultView = window;
  const context = vm.createContext({ window, document, setTimeout: () => 0, clearTimeout() {} });
  for (const file of ['clcr_collection_duration.js', 'clcr_ox_dzm_reference_data.js', 'clcr_ox_dzm.js', 'clcr_ox_dzm_ui.js', 'inline_kalkulator_klirens_07.js']) {
    vm.runInContext(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'), context, { filename: file });
  }
  return { document, api: window, capture: () => clone(window.buildClcrSessionSnapshot()),
    set(field, value) { document.getElementById(field).value = value; } };
}

function status({ legacy, storage: suppliedStorage, initialSession = null, withoutEngine = false } = {}) {
  let session = initialSession && clone(initialSession);
  const storage = suppliedStorage || new Map([['vildaCurrentPatientId', PID]]);
  if (legacy) storage.set('vilda-save-ref-v1', JSON.stringify({ fp: JSON.stringify({ core: MAIN, clcr: legacy }), dirty: true }));
  const win = {
    setTimeout, clearTimeout, setInterval, clearInterval, addEventListener() {}, console: { debug() {} },
    document: { readyState: 'complete', addEventListener() {}, getElementById: () => null },
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
    VildaVault: { isUnlocked: () => true, onPatientSaved() {} },
    VildaDataImportExport: { getApplyLoadedDataSequence: () => 1 },
    VildaPersistence: { readMainSession: () => clone(MAIN), readClcrSession: () => session && clone(session) },
    collectUserData: () => clone(MAIN), hasMeaningfulMainSessionData: value => Boolean(value?.name),
  };
  if (!withoutEngine) for (const file of ['clcr_ox_dzm_reference_data.js', 'clcr_ox_dzm.js']) loadBrowserScript(file, win);
  loadBrowserScript('vilda_save_status_indicator.js', win);
  const indicator = win.VildaSaveStatusIndicator;
  if (!legacy && !suppliedStorage) indicator._onPatientLoaded({ patientId: PID, applySequence: 1, name: MAIN.name });
  vi.advanceTimersByTime(150);
  return { indicator, storage, session: () => clone(session),
    compare(value) { session = value && clone(value); indicator.notifyExternalChange(); vi.advanceTimersByTime(400); } };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('patient chip — mounted oxalate defaults versus patient input', () => {
  it('opening an empty Ox module preserves the saved fingerprint and the actual session', () => {
    const runtime = collector(), captured = runtime.capture(), env = status({ withoutEngine: true });
    expect(captured.inputs).toMatchObject({ OXDZM_inputMode: 'concentration', OXDZM_collectionHours: '24',
      OXDZM_collectionSource: 'assumed-24h', OXDZM_durationNeedsConfirmation: 'false', OXDZM_reportingEntity: 'unknown' });
    const reference = env.indicator.getReferenceFingerprint();
    env.compare(captured);
    expect(env.indicator.getState()).toBe('saved');
    expect(env.indicator._computeCanonicalFingerprint()).toBe(reference);
    expect(env.session()).toEqual(captured);
  });

  it('formula selection alone does not make a saved patient dirty', () => {
    const runtime = collector(), env = status();
    runtime.set('formulaPicker', 'Ox_mgkg'); env.compare(runtime.capture());
    expect(env.indicator.getState()).toBe('saved');
  });

  it.each([
    ['OXDZM_concentration', '50'], ['OXDZM_concentration', '0'], ['OXDZM_concentration', '-1'],
    ['OXDZM_concentration', 'invalid'], ['OXDZM_volume', '1500'], ['OXDZM_reportedValue', '0'],
    ['OXDZM_reportedValue', '0.000000000001'], ['OXDZM_inputMode', 'reported'],
    ['OXDZM_collectionHours', '12'], ['OXDZM_collectionHours', '0'], ['OXDZM_collectionSource', 'hours'],
    ['OXDZM_collectionSource', 'historical-missing'], ['OXDZM_durationNeedsConfirmation', 'true'],
    ['OXDZM_reportingEntity', 'oxalic_acid'], ['OXDZM_reportingEntity', 'oxalate_ion'],
    ['OXDZM_unitConversions', '{"reportedValue":{"originalValue":"1"}}'],
  ])('retains real input or provenance %s=%s as unsaved', (field, value) => {
    const runtime = collector(), env = status({ withoutEngine: true }); runtime.set(field, value);
    const captured = runtime.capture(); env.compare(captured);
    expect(env.indicator.getState()).toBe('dirty');
    expect(env.session()).toEqual(captured);
  });

  it('an actual zero stays dirty across reload and reverting to empty restores saved', () => {
    const runtime = collector(), env = status();
    runtime.set('OXDZM_reportedValue', '0'); const current = runtime.capture(); env.compare(current);
    expect(env.indicator.getState()).toBe('dirty');
    const reloaded = status({ storage: env.storage, initialSession: current, withoutEngine: true });
    reloaded.compare(current); expect(reloaded.indicator.getState()).toBe('dirty');
    runtime.set('OXDZM_reportedValue', ''); reloaded.compare(runtime.capture());
    expect(reloaded.indicator.getState()).toBe('saved');
  });
});
