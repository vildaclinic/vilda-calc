import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const clone = value => JSON.parse(JSON.stringify(value));
const base = () => ({ name: 'Fikcyjny Pacjent Domyślnych Kontrolek', user: { age: 13, height: 158, weight: 46, sex: 'M' } });
const defaults = () => ({ adultVitals: { guideline: 'ESC' }, bp: { population: 'healthy' },
  respiratory: { population: 'healthy', state: 'awake' } });

function environment(initial) {
  let current = clone(initial);
  const storage = new Map([['vildaCurrentPatientId', 'fictional-main-ui-defaults']]);
  const win = {
    setTimeout, clearTimeout, setInterval, clearInterval, addEventListener() {}, console: { debug() {} },
    document: { readyState: 'complete', addEventListener() {}, getElementById: () => null },
    sessionStorage: { getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
    VildaVault: { isUnlocked: () => true, onPatientSaved() {} },
    VildaDataImportExport: { getApplyLoadedDataSequence: () => 1 },
    VildaPersistence: { readMainSession: () => clone(current) },
    collectUserData: () => clone(current), hasMeaningfulMainSessionData: value => Boolean(value?.name),
  };
  loadBrowserScript('vilda_save_status_indicator.js', win);
  const indicator = win.VildaSaveStatusIndicator;
  indicator._onPatientLoaded({ patientId: 'fictional-main-ui-defaults', applySequence: 1, name: current.name });
  vi.advanceTimersByTime(150);
  expect(indicator.getState()).toBe('saved');
  return { indicator, storage, win,
    replace(value) { current = clone(value); },
    compare() { indicator.notifyExternalChange(); vi.advanceTimersByTime(400); },
    current: () => clone(current) };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('P-CHIP-NAWIGACJA — tylko domyślne kontrolki pustych kart Start', () => {
  it.each([false, true])('brak kontrolek i ich domyślna materializacja są równoważne (odwrotnie=%s)', reverse => {
    const minimal = base(), populated = { ...base(), ...defaults() };
    const env = environment(reverse ? populated : minimal);
    const reference = env.indicator.getReferenceFingerprint();
    env.replace(reverse ? minimal : populated);
    env.compare();
    expect(env.indicator.getState()).toBe('saved');
    expect(env.indicator.getReferenceFingerprint()).toBe(reference);
    expect(env.indicator._computeCanonicalFingerprint()).toBe(reference);
  });

  it.each([
    ['adultVitals', 'guideline', 'AHA', 'ESC'],
    ['bp', 'population', 'hospital', 'healthy'],
    ['respiratory', 'population', 'hospital', 'healthy'],
    ['respiratory', 'state', 'sleep', 'awake'],
  ])('%s.%s: inny wybór i powrót zapisanego innego wyboru do default pozostają edycją', (section, field, selected, defaultValue) => {
    const initial = { ...base(), [section]: { [field]: selected } };
    const env = environment(initial);
    env.replace({ ...base(), [section]: { [field]: defaultValue } });
    env.compare();
    expect(env.indicator.getState()).toBe('dirty');
    env.replace(initial);
    env.compare();
    expect(env.indicator.getState()).toBe('saved');
    env.replace(base());
    env.compare();
    expect(env.indicator.getState()).toBe('dirty');
  });

  it.each([
    ['adultVitals', 'heartRate', 82], ['adultVitals', 'systolic', 112], ['adultVitals', 'diastolic', 74],
    ['bp', 'heartRate', 83], ['bp', 'temperature', 38], ['bp', 'systolic', 113], ['bp', 'diastolic', 75],
    ['respiratory', 'rate', 18], ['respiratory', 'temperature', 37],
  ])('%s.%s: pomiar zawsze uczestniczy w porównaniu', (section, field, value) => {
    const env = environment({ ...base(), ...defaults() });
    const changed = { ...base(), ...defaults() };
    changed[section][field] = value;
    env.replace(changed);
    env.compare();
    expect(env.indicator.getState()).toBe('dirty');
  });

  it('pozostawia dodatkowe metadane i kolejność list, nie zmienia danych sesji', () => {
    const initial = { ...base(), adultVitals: { guideline: 'ESC', samples: [80, 82], note: 'Fikcyjna uwaga' } };
    const env = environment(initial);
    expect(env.current()).toEqual(initial);
    env.replace({ ...initial, adultVitals: { ...initial.adultVitals, samples: [82, 80] } });
    env.compare();
    expect(env.indicator.getState()).toBe('dirty');
    expect(env.current().adultVitals.guideline).toBe('ESC');
    env.replace({ ...initial, adultVitals: { ...initial.adultVitals, note: 'Inna fikcyjna uwaga' } });
    env.compare();
    expect(env.indicator.getState()).toBe('dirty');
  });

  it('normalizuje również referencję pozostawioną przez poprzednią wersję', () => {
    const env = environment(base());
    env.storage.set('vilda-save-ref-v1', JSON.stringify({ fp: JSON.stringify({ core: { ...base(), ...defaults() } }), dirty: true }));
    env.indicator._onUnlock();
    env.compare();
    expect(env.indicator.getState()).toBe('saved');
    expect(env.indicator.getReferenceFingerprint()).toBe(env.indicator._computeCanonicalFingerprint());
  });
});

describe('P-CHIP-NAWIGACJA — techniczne znaczniki treści i gwiazdki sejfu', () => {
  const vaultMetadata = () => ({ _pinned: true,
    _pinnedState: { pin: true, at: '2026-10-29T10:00:00.000Z', h: 'fictional-content-hash' },
    _contentAtISO: '2026-10-29T10:00:00.000Z' });

  it.each(['_pinned', '_pinnedState', '_contentAtISO'])('%s nie zmienia odcisku danych i pozostaje nietknięte w sesji', field => {
    const original = { ...base(), ...vaultMetadata() };
    const env = environment(original);
    const changed = clone(original);
    delete changed[field];
    env.replace(changed);
    env.compare();
    expect(env.indicator.getState()).toBe('saved');
    expect(env.current()).toEqual(changed);
    env.replace(original);
    env.compare();
    expect(env.indicator.getState()).toBe('saved');
    expect(env.current()).toEqual(original);
  });

  it('historyczna referencja porównuje treść bez technicznych znaczników sejfu', () => {
    const env = environment(base());
    env.storage.set('vilda-save-ref-v1', JSON.stringify({ fp: JSON.stringify({ core: { ...base(), ...vaultMetadata() } }), dirty: true }));
    env.indicator._onUnlock();
    env.compare();
    expect(env.indicator.getState()).toBe('saved');
    expect(env.indicator.getReferenceFingerprint()).toBe(env.indicator._computeCanonicalFingerprint());
  });

  it('rzeczywista edycja masy pozostaje niezapisana mimo równoczesnych zmian technicznych', () => {
    const env = environment({ ...base(), ...vaultMetadata() });
    const changed = base();
    changed.user.weight = 47;
    env.replace(changed);
    env.compare();
    expect(env.indicator.getState()).toBe('dirty');
  });

  it.each(['_pinned', '_pinnedState', '_contentAtISO'])('pole o nazwie %s wewnątrz danych nie jest pomijane', field => {
    const original = { ...base(), clinical: { [field]: 'Fikcyjna informacja A' } };
    const env = environment(original);
    env.replace({ ...base(), clinical: { [field]: 'Fikcyjna informacja B' } });
    env.compare();
    expect(env.indicator.getState()).toBe('dirty');
  });

  it('nie usuwa innych metadanych ani nie sortuje list danych', () => {
    const original = { ...base(), ...vaultMetadata(), _customMetadata: 'A', clinical: { notes: ['A', 'B'] } };
    const env = environment(original);
    env.replace({ ...original, _customMetadata: 'B' });
    env.compare();
    expect(env.indicator.getState()).toBe('dirty');
    env.replace({ ...original, clinical: { notes: ['B', 'A'] } });
    env.compare();
    expect(env.indicator.getState()).toBe('dirty');
    expect(env.current()).toEqual({ ...original, clinical: { notes: ['B', 'A'] } });
  });
});

describe('P-CHIP-NAWIGACJA — nieznane rozszerzenia są porównywane jako dane', () => {
  it.each(['root', 'nested'])('własny klucz __proto__ (%s) zostaje w odcisku, a jego edycja jest wykrywana', location => {
    const initial = base();
    const extension = JSON.parse('{"__proto__":{"fictionalPrototypeMarker":"A"}}');
    if (location === 'root') Object.defineProperty(initial, '__proto__', {
      value: extension.__proto__, enumerable: true, configurable: true, writable: true,
    });
    else initial.clinical = { extension };
    const env = environment(initial);
    const fingerprint = JSON.parse(env.indicator.getReferenceFingerprint());
    const projected = location === 'root' ? fingerprint.core : fingerprint.core.clinical?.extension;
    expect(Object.prototype.hasOwnProperty.call(projected, '__proto__')).toBe(true);
    expect(projected.__proto__.fictionalPrototypeMarker).toBe('A');
    const changed = clone(initial);
    const changedExtension = location === 'root' ? changed : changed.clinical.extension;
    changedExtension.__proto__.fictionalPrototypeMarker = 'B';
    env.replace(changed);
    env.compare();
    expect(env.indicator.getState()).toBe('dirty');
    expect(env.current()).toEqual(changed);
    expect(Object.getPrototypeOf(env.current())).toBe(Object.prototype);
    expect(Object.prototype).not.toHaveProperty('fictionalPrototypeMarker');
  });
});
