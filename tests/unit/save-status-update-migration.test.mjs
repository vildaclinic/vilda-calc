import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/save-status-pre-823-duration.json', import.meta.url), 'utf8'));
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const pairs = [['Cl24DurationHours', 'Cl24DurationSource', 'durationNeedsConfirmation'],
  ...['CA', 'MG', 'UA', 'PO4'].map(prefix => [`${prefix}_collectionHours`, `${prefix}_collectionSource`, `${prefix}_durationNeedsConfirmation`])];

// The complete current collector executes with real duration normalization.
// Its synthetic controls have exactly the historical reset values that produced
// the golden pre-823 fingerprint, rather than a copied canonicalization formula.
function collect(inputs = fixture.resetInputs) {
  const controls = Object.fromEntries(Object.entries(inputs).map(([id, value]) => [id,
    { id, tagName: 'INPUT', type: typeof value === 'boolean' ? 'checkbox' : 'text',
      value, checked: value === true, addEventListener() {} }]));
  const form = { querySelectorAll: () => Object.values(controls), addEventListener() {} };
  const document = { getElementById: id => id === 'clcrForm' ? form : controls[id] || null,
    querySelector: () => null, addEventListener() {} };
  const window = { document, currentVersion: 'basic', addEventListener() {},
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
  document.defaultView = window;
  const context = vm.createContext({ window, document, setTimeout: () => 0, clearTimeout() {} });
  for (const file of ['clcr_collection_duration.js', 'inline_kalkulator_klirens_07.js']) {
    vm.runInContext(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'), context, { filename: file });
  }
  return { snapshot: clone(window.buildClcrSessionSnapshot()), controls, duration: window.ClcrCollectionDuration };
}

function indicator(current, reference = fixture.reference) {
  const session = clone(current), persisted = JSON.stringify(reference);
  const storage = new Map([['vildaCurrentPatientId', fixture.patientId], ['vilda-save-ref-v1', persisted]]);
  const win = {
    setTimeout, clearTimeout, setInterval, clearInterval, addEventListener() {}, console: { debug() {} },
    document: { readyState: 'complete', addEventListener() {}, getElementById: () => null },
    sessionStorage: { getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
    VildaVault: { isUnlocked: () => true, onPatientSaved() {} },
    VildaDataImportExport: { getApplyLoadedDataSequence: () => 1 },
    VildaPersistence: { readMainSession: () => clone(fixture.main), readClcrSession: () => clone(session) },
    collectUserData: () => clone(fixture.main), hasMeaningfulMainSessionData: value => Boolean(value?.name),
    saveMainSessionNow: vi.fn(),
  };
  loadBrowserScript('vilda_save_status_indicator.js', win);
  const api = win.VildaSaveStatusIndicator;
  api.reconcileFromSharedReference();
  return { api, session, storage, persisted, win };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('patient chip — upgrade of a real pre-823 persisted fingerprint', () => {
  it.each([false, true])('migrates old reset provenance without replacing the saved reference (old dirty=%s)', dirty => {
    const runtime = collect(), captured = clone(runtime.snapshot);
    for (const prefix of ['CA', 'MG', 'UA']) {
      expect(runtime.controls[`${prefix}_collectionHours`].value).toBe('');
      expect(captured.inputs[`${prefix}_collectionHours`]).toBe('24');
      expect(JSON.parse(fixture.reference.fp).clcr.inputs).not.toHaveProperty(`${prefix}_collectionHours`);
    }
    const env = indicator(captured, { ...fixture.reference, dirty });
    expect(env.api.getState()).toBe('saved');
    expect(env.api.getReferenceFingerprint()).toBe(env.api._computeCanonicalFingerprint());
    expect(env.storage.get('vilda-save-ref-v1')).toBe(env.persisted);
    expect(env.session).toEqual(captured);
    expect(runtime.snapshot).toEqual(captured);
    expect(env.win.saveMainSessionNow).not.toHaveBeenCalled();
  });

  it('keeps a genuine new measurement dirty across the same migration', () => {
    const captured = collect({ ...fixture.resetInputs, Scr: '0.5' }).snapshot;
    const env = indicator(captured);
    expect(env.api.getState()).toBe('dirty');
    expect(env.api.getReferenceFingerprint()).not.toBe(env.api._computeCanonicalFingerprint());
    expect(env.storage.get('vilda-save-ref-v1')).toBe(env.persisted);
    expect(env.session.inputs.Scr).toBe('0.5');
  });
});

describe('patient chip — only unresolved default provenance is equivalent', () => {
  it.each(pairs)('%s: missing/blank assumed hours follow the existing duration model', (hours, source) => {
    for (const value of [undefined, null, '', '  ']) {
      const inputs = { [source]: 'assumed-24h' };
      if (value !== undefined) inputs[hours] = value;
      const runtime = collect();
      expect(runtime.duration.fromValues(inputs, {}, { fieldId: hours, sourceId: source })).toMatchObject({ hours: 24, assumed: true });
      const env = indicator({ inputs }, { ...fixture.reference, fp: JSON.stringify({ core: fixture.main }) });
      expect(env.api.getState()).toBe('saved');
      expect(env.session).toEqual({ inputs });
    }
  });

  it.each(pairs)('%s: a true confirmation marker is retained', (hours, source, flag) => {
    for (const confirmation of [true, 'true']) {
      for (const flagId of new Set([flag, 'durationNeedsConfirmation'])) {
        const inputs = { [source]: 'assumed-24h', [flagId]: confirmation };
        const env = indicator({ inputs }, { ...fixture.reference, fp: JSON.stringify({ core: fixture.main }) });
        expect(env.api.getState()).toBe('dirty');
        expect(JSON.parse(env.api._computeCanonicalFingerprint()).clcr.inputs[source]).toBe('assumed-24h');
        expect(env.session).toEqual({ inputs });
      }
    }
  });

  it.each(['hours', 'captured', 'legacy-dates', 'historical-missing', 'invalid'])('retains nondefault duration source %s', source => {
    const env = indicator({ inputs: { CA_collectionSource: source } },
      { ...fixture.reference, fp: JSON.stringify({ core: fixture.main }) });
    expect(env.api.getState()).toBe('dirty');
    expect(JSON.parse(env.api._computeCanonicalFingerprint()).clcr.inputs.CA_collectionSource).toBe(source);
  });

  it.each(['12', '0', 'invalid', '0x18', false, [], {}])('retains a nonempty or invalid duration %j', hours => {
    const inputs = { CA_collectionHours: hours, CA_collectionSource: 'assumed-24h' };
    const env = indicator({ inputs }, { ...fixture.reference, fp: JSON.stringify({ core: fixture.main }) });
    expect(env.api.getState()).toBe('dirty');
    expect(JSON.parse(env.api._computeCanonicalFingerprint()).clcr.inputs.CA_collectionSource).toBe('assumed-24h');
    expect(env.session).toEqual({ inputs });
  });

  it('retains unknown extensions and clinical facts beside the migrated default', () => {
    const inputs = { CA_collectionSource: 'assumed-24h', CA_concentration: '0',
      CA_volume: '1500', fictionalExtension: { note: 'Fikcyjna uwaga', rows: [2, 1] } };
    const env = indicator({ inputs }, { ...fixture.reference, fp: JSON.stringify({ core: fixture.main }) });
    expect(env.api.getState()).toBe('dirty');
    expect(JSON.parse(env.api._computeCanonicalFingerprint()).clcr.inputs).toEqual({
      CA_concentration: '0', CA_volume: '1500', fictionalExtension: inputs.fictionalExtension,
    });
    expect(env.session).toEqual({ inputs });
  });
});
