import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const clone = value => JSON.parse(JSON.stringify(value));
const MAIN = { name: 'Fikcyjny Pacjent Potasu DZM', user: { age: 10, sex: 'F', height: 135, weight: 30 } };
const PID = 'fictional-potassium-dzm-chip';

// Mount the production potassium controls and use the complete shipped renal
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
  for (const file of ['clcr_collection_duration.js', 'clcr_potassium_dzm_data.js', 'clcr_potassium_dzm.js', 'clcr_potassium_dzm_ui.js', 'inline_kalkulator_klirens_07.js']) {
    vm.runInContext(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'), context, { filename: file });
  }
  return { document, api: window, capture: () => clone(window.buildClcrSessionSnapshot()),
    set(field, value) { document.getElementById(field).value = value; },
    nativeVolumeUnit(value) {
      const control = document.getElementById('K_volumeUnit'); control.value = value;
      for (const listener of control.sluchacze.get('input') || []) listener({ type: 'input', target: control, isTrusted: true });
    },
    convert(kind, value, from, to) { return window.VildaClcrPotassiumDzm.convertUnitInput(value, from, to, kind); } };
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
  if (!withoutEngine) for (const file of ['clcr_potassium_dzm_data.js', 'clcr_potassium_dzm.js']) loadBrowserScript(file, win);
  loadBrowserScript('vilda_save_status_indicator.js', win);
  const indicator = win.VildaSaveStatusIndicator;
  if (!legacy && !suppliedStorage) indicator._onPatientLoaded({ patientId: PID, applySequence: 1, name: MAIN.name });
  vi.advanceTimersByTime(150);
  return { indicator, storage, session: () => clone(session),
    compare(value) { session = value && clone(value); indicator.notifyExternalChange(); vi.advanceTimersByTime(400); } };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('patient chip — potassium DZM defaults and exact production quantity comparison', () => {
  it('actual mounted potassium defaults are equivalent to an absent renal calculator', () => {
    const runtime = collector(), captured = runtime.capture(), env = status();
    expect(captured.inputs).toMatchObject({ K_inputMode: 'concentration', K_collectionHours: '24',
      K_collectionSource: 'assumed-24h', K_durationNeedsConfirmation: 'false' });
    const reference = env.indicator.getReferenceFingerprint();
    env.compare(captured);
    expect(env.indicator.getState()).toBe('saved');
    expect(env.indicator._computeCanonicalFingerprint()).toBe(reference);
    expect(env.session()).toEqual(captured);
  });

  it('formula selection and output-unit presentation alone leave the saved patient untouched', () => {
    const runtime = collector(), env = status();
    runtime.set('formulaPicker', 'K_mmol_d'); runtime.set('K_outputUnit', 'mmol/24h');
    env.compare(runtime.capture());
    expect(env.indicator.getState()).toBe('saved');
  });

  it.each([undefined, null, '', '  '])('old assumed potassium hours %j normalize to the real new24h without modifying either record', hours => {
    const legacy = { inputs: { K_collectionSource: 'assumed-24h' } };
    if (hours !== undefined) legacy.inputs.K_collectionHours = hours;
    const before = clone(legacy), runtime = collector(), captured = runtime.capture(), env = status({ legacy });
    env.compare(captured);
    expect(env.indicator.getState()).toBe('saved');
    expect(legacy).toEqual(before);
    expect(env.session()).toEqual(captured);
  });

  it('pure normalization of the captured blank24h does not alter the DOM, baseline or value vault', () => {
    const runtime = collector(), env = status();
    runtime.set('K_collectionHours', '');
    runtime.api.__vildaClcrVersionValueVault = {};
    const baseline = env.indicator.getReferenceFingerprint(), captured = runtime.capture();
    expect(captured.inputs.K_collectionHours).toBe('24');
    expect(runtime.document.getElementById('K_collectionHours').value).toBe('');
    expect(runtime.api.__vildaClcrVersionValueVault).toEqual({});
    env.compare(captured);
    expect(env.indicator.getState()).toBe('saved');
    expect(env.indicator.getReferenceFingerprint()).toBe(baseline);
  });

  it.each([
    ['K_concentration', '50'], ['K_concentration', '0'], ['K_volume', '1500'], ['K_reportedValue', '0'],
    ['K_reportedValue', '0.015'], ['K_inputMode', 'reported'], ['K_collectionHours', '12'], ['K_collectionHours', '0'],
    ['K_collectionSource', 'hours'], ['K_collectionSource', 'historical-missing'], ['K_durationNeedsConfirmation', 'true'],
    ['K_unitConversions', '{"reportedValue":{"originalValue":"1"}}'],
  ])('retains real patient input %s=%s as unsaved', (field, value) => {
    const runtime = collector(), env = status(); runtime.set(field, value);
    const captured = runtime.capture(); env.compare(captured);
    expect(env.indicator.getState()).toBe('dirty');
    expect(env.session()).toEqual(captured);
  });

  it('an actual potassium edit stays dirty after reload and returning to the same saved patient; reverting restores saved', () => {
    const runtime = collector(), env = status();
    runtime.set('K_concentration', '50'); const edited = runtime.capture(); env.compare(edited);
    expect(env.indicator.getState()).toBe('dirty');
    const reloaded = status({ storage: env.storage, initialSession: edited });
    reloaded.compare(edited);
    expect(reloaded.indicator.getState()).toBe('dirty');
    runtime.set('K_concentration', ''); reloaded.compare(runtime.capture());
    expect(reloaded.indicator.getState()).toBe('saved');
  });

  it.each([
    ['volume', 'K_volume', 'K_volumeUnit', '1500', 'mL', 'L'],
    ['volume', 'K_volume', 'K_volumeUnit', '1500.0000000000000000001', 'mL', 'L'],
    ['volume', 'K_volume', 'K_volumeUnit', '0.000000000001', 'mL', 'L'],
  ])('actual production conversion of %s preserves the save fingerprint across units and reload', (kind, valueId, unitId, value, from, to) => {
    const runtime = collector(); runtime.set(valueId, value); runtime.set(unitId, from);
    const original = runtime.capture(), env = status({ legacy: original });
    const converted = runtime.convert(kind, value, from, to);
    expect(converted.ok).toBe(true);
    runtime.set(valueId, converted.text); runtime.set(unitId, to);
    runtime.set('K_unitConversions', JSON.stringify({ [kind]: { originalValue: value, originalUnit: from,
      convertedValue: converted.text, convertedUnit: to } }));
    const current = runtime.capture(), before = clone(current); env.compare(current);
    expect(env.indicator.getState()).toBe('saved');
    expect(env.session()).toEqual(before);
    const reloaded = status({ storage: env.storage, initialSession: current }); reloaded.compare(current);
    expect(reloaded.indicator.getState()).toBe('saved');
  });

  it('a real quantity change remains dirty even when accompanied by stale conversion provenance', () => {
    const runtime = collector(); runtime.set('K_volume', '1500');
    const env = status({ legacy: runtime.capture() }), converted = runtime.convert('volume', '1500', 'mL', 'L');
    runtime.set('K_volume', '1'); runtime.set('K_volumeUnit', 'L');
    runtime.set('K_unitConversions', JSON.stringify({ volume: { originalValue: '1500', originalUnit: 'mL', convertedValue: converted.text, convertedUnit: 'L' } }));
    env.compare(runtime.capture());
    expect(env.indicator.getState()).toBe('dirty');
  });

  it('actual unit controls clear old hidden conversion metadata from the restored version vault on returning to mL', () => {
    const runtime = collector();
    expect(runtime.api.applyClcrSessionSnapshot({ selectedFormula: 'K_mmol_d', inputs: { K_concentration: '100', K_volume: '200', K_volumeUnit: 'mL',
      K_collectionHours: '24', K_collectionSource: 'assumed-24h' } }, { update: false, preserveAcrossVersions: true })).toBe(true);
    const original = runtime.capture(), env = status({ legacy: original });
    for (const unit of ['L', 'mL', 'L']) {
      runtime.nativeVolumeUnit(unit);
      const captured = runtime.capture(); env.compare(captured);
      expect(env.indicator.getState()).toBe('saved');
      expect(captured.inputs.K_volumeUnit).toBe(unit);
      expect(captured.inputs.K_unitConversions).toBe(runtime.document.getElementById('K_unitConversions').value);
      expect(runtime.api.__vildaClcrVersionValueVault.K_unitConversions).toBe(captured.inputs.K_unitConversions);
      if (unit === 'mL') expect(captured.inputs.K_unitConversions).toBe('');
    }
  });

  it.each([['0.2', '0,2'], ['0,2', '0.2']])('equivalent decimal separator %s versus conversion metadata %s preserves the exact save comparison', (currentValue, metadataValue) => {
    const runtime = collector(); runtime.set('K_volume', '200');
    const env = status({ legacy: runtime.capture() });
    runtime.set('K_volume', currentValue); runtime.set('K_volumeUnit', 'L');
    runtime.set('K_unitConversions', JSON.stringify({ volume: { originalValue: '200', originalUnit: 'mL', convertedValue: metadataValue, convertedUnit: 'L' } }));
    const captured = runtime.capture(); env.compare(captured);
    expect(env.indicator.getState()).toBe('saved');
    expect(env.session()).toEqual(captured);
    const reloaded = status({ storage: env.storage, initialSession: captured }); reloaded.compare(captured);
    expect(reloaded.indicator.getState()).toBe('saved');
    runtime.set('K_volume', '0.2000000000000000001'); env.compare(runtime.capture());
    expect(env.indicator.getState()).toBe('dirty');
  });

  it.each(['{"unknown":"source"}', '{"__proto__":{"unknown":"source"}}'])('unrecognized conversion metadata %s remains visible to comparison with the engine present', metadata => {
    const runtime = collector(), env = status(); runtime.set('K_unitConversions', metadata);
    const current = runtime.capture(); env.compare(current);
    expect(env.indicator.getState()).toBe('dirty');
    expect(env.session()).toEqual(current);
  });

  it('keeps old missing-clock facts and explicit24h provenance distinct from a new assumed collection', () => {
    const runtime = collector(), env = status();
    runtime.set('K_collectionHours', ''); runtime.set('K_collectionSource', 'historical-missing'); runtime.set('K_durationNeedsConfirmation', 'true');
    const historical = runtime.capture(); env.compare(historical);
    expect(env.indicator.getState()).toBe('dirty');
    expect(env.session()).toEqual(historical);
    runtime.set('K_collectionHours', '24'); runtime.set('K_collectionSource', 'hours'); runtime.set('K_durationNeedsConfirmation', 'false');
    env.compare(runtime.capture()); expect(env.indicator.getState()).toBe('dirty');
  });

  it('conservative engine-unavailable comparison keeps real potassium edits and metadata intact', () => {
    const runtime = collector(), env = status({ withoutEngine: true });
    env.compare(runtime.capture()); expect(env.indicator.getState()).toBe('saved');
    runtime.set('K_reportedValue', '0.015'); runtime.set('K_unitConversions', '{"unknown":"source"}');
    const current = runtime.capture(); env.compare(current);
    expect(env.indicator.getState()).toBe('dirty');
    expect(env.session()).toEqual(current);
  });

  it('never normalizes another calculator quantity or shared spot U_Na away', () => {
    const env = status(), current = collector().capture();
    current.inputs.U_K = '20'; current.inputs.Prot_concentration = '100';
    env.compare(current);
    expect(env.indicator.getState()).toBe('dirty');
    expect(JSON.parse(env.indicator._computeCanonicalFingerprint()).clcr.inputs).toMatchObject({ U_K: '20', Prot_concentration: '100' });
  });
});
