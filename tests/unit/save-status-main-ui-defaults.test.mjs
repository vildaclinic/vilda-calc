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

describe('P-CHIP-NAWIGACJA — dokładnie pusty kontekst wieku kostnego', () => {
  it('pusty model rzeczywistego modułu nie oznacza nowego badania i nie zmienia payloadu', () => {
    const env = environment(base());
    loadBrowserScript('vilda_bone_age.js', env.win);
    const empty = env.win.VildaBoneAge.capture();
    expect(empty).toEqual({ version: 1, current: null, last: null });
    expect(env.win.VildaBoneAge.normaliseContext({ version: 1 })).toEqual(empty);
    const changed = { ...base(), advanced: { boneAgeContext: empty } };
    env.replace(changed);
    env.compare();
    expect(env.indicator.getState()).toBe('saved');
    expect(env.current()).toEqual(changed);
  });

  it.each([false, true])('brak i dokładny model {version:1} są równoważne (odwrotnie=%s)', reverse => {
    const minimal = base();
    const populated = { ...base(), advanced: { boneAgeContext: { version: 1 } } };
    const env = environment(reverse ? populated : minimal);
    env.replace(reverse ? minimal : populated);
    env.compare();
    expect(env.indicator.getState()).toBe('saved');
  });

  it.each([
    { version: 2 }, { version: '1' },
    { version: 1, current: { years: 12, atAgeMonths: 156, source: 'measured' }, last: null },
    { version: 1, current: null, last: { years: 11, atAgeMonths: 144, source: 'history' } },
    { version: 1, extra: 'Fikcyjne rozszerzenie' }, { version: 1, extra: false },
    { version: 1, current: {} },
  ])('kontekst %j nadal jest informacją do zapisania', context => {
    const env = environment(base());
    const changed = { ...base(), advanced: { boneAgeContext: context } };
    env.replace(changed);
    env.compare();
    expect(env.indicator.getState()).toBe('dirty');
    expect(env.current()).toEqual(changed);
  });

  it('historyczna referencja pomija ten sam dokładnie pusty model', () => {
    const env = environment(base());
    env.storage.set('vilda-save-ref-v1', JSON.stringify({ fp: JSON.stringify({ core: {
      ...base(), advanced: { boneAgeContext: { version: 1, current: null, last: null } },
    } }), dirty: true }));
    env.indicator._onUnlock();
    env.compare();
    expect(env.indicator.getState()).toBe('saved');
    expect(env.indicator.getReferenceFingerprint()).toBe(env.indicator._computeCanonicalFingerprint());
  });
});

describe('P-CHIP-NAWIGACJA — dieta automatyczna i świadomy wybór lekarza', () => {
  it.each([false, undefined])('automatyczna materializacja diety nie zmienia danych (dietaWybrana=%s)', flag => {
    const original = { ...base(), plan: { dietLevel: null, dietaWybrana: flag } };
    const env = environment(original);
    const changed = { ...base(), plan: { dietLevel: 'moderate', dietaWybrana: flag } };
    env.replace(changed);
    env.compare();
    expect(env.indicator.getState()).toBe('saved');
    expect(env.current()).toEqual(clone(changed));
  });

  it('zmiana wyłącznie automatycznej rekomendacji nie jest świadomą edycją', () => {
    const env = environment({ ...base(), plan: { dietLevel: 'light', dietaWybrana: false } });
    const changed = { ...base(), plan: { dietLevel: 'moderate', dietaWybrana: false } };
    env.replace(changed);
    env.compare();
    expect(env.indicator.getState()).toBe('saved');
    expect(env.current()).toEqual(changed);
  });

  it.each([false, undefined])('historyczna referencja bez manualtrue zachowuje semantykę automatu (flag=%s)', flag => {
    const env = environment(base());
    env.storage.set('vilda-save-ref-v1', JSON.stringify({ fp: JSON.stringify({ core: {
      ...base(), plan: { dietLevel: 'moderate', dietaWybrana: flag },
    } }), dirty: true }));
    env.indicator._onUnlock();
    env.compare();
    expect(env.indicator.getState()).toBe('saved');
    expect(env.indicator.getReferenceFingerprint()).toBe(env.indicator._computeCanonicalFingerprint());
  });

  it('świadoma edycja zachowuje dietLevel i manualtrue w odcisku', () => {
    const env = environment({ ...base(), plan: { dietLevel: 'moderate', dietaWybrana: false } });
    env.replace({ ...base(), plan: { dietLevel: 'light', dietaWybrana: true } });
    env.indicator._debouncedOnFormChange({ isTrusted: true });
    vi.advanceTimersByTime(400);
    expect(env.indicator.getState()).toBe('dirty');
    expect(JSON.parse(env.indicator._computeCanonicalFingerprint()).core.plan)
      .toEqual({ dietLevel: 'light', dietaWybrana: true });
  });

  it.each([
    { dietLevel: 'intense', dietaWybrana: true },
    { dietLevel: 'moderate', dietaWybrana: false },
    { dietLevel: 'light' },
  ])('zmiana zapisanego ręcznego wyboru na %j pozostaje niezapisana', changedPlan => {
    const env = environment({ ...base(), plan: { dietLevel: 'light', dietaWybrana: true } });
    env.replace({ ...base(), plan: changedPlan });
    env.compare();
    expect(env.indicator.getState()).toBe('dirty');
  });

  it('manualtrue pozostaje decyzją także dla wartości równej rekomendacji', () => {
    const env = environment({ ...base(), plan: { dietLevel: 'moderate', dietaWybrana: false } });
    env.replace({ ...base(), plan: { dietLevel: 'moderate', dietaWybrana: true } });
    env.compare();
    expect(env.indicator.getState()).toBe('dirty');
  });

  it('nie pomija PAL, celu ani nieznanych pól planu przy diecie automatycznej', () => {
    const original = { ...base(), plan: { dietLevel: 'light', dietaWybrana: false, palFactor: 1.6, customGoalKg: 45, extension: 'A' } };
    for (const [field, value] of [['palFactor', 1.8], ['customGoalKg', 44], ['extension', 'B']]) {
      const env = environment(original);
      env.replace({ ...original, plan: { ...original.plan, [field]: value } });
      env.compare();
      expect(env.indicator.getState(), field).toBe('dirty');
    }
  });
});

describe('P-CHIP-NAWIGACJA — tylko zgodny z pozycją indeks DOM wiersza', () => {
  const rows = () => [
    { ageMonths: 84, ageYears: 7, height: 123.6, weight: 23.9 },
    { ageMonths: 108, ageYears: 9, height: 135, weight: 29.9 },
  ];

  it.each(['advanced', 'growthBasic'])('%s: dodanie zgodnych indeksów DOM nie jest edycją i nie zmienia sesji', section => {
    const original = { ...base(), [section]: { data: { measurements: rows() } } };
    const env = environment(original);
    const changed = { ...base(), [section]: { data: {
      measurements: rows().map((row, index) => ({ ...row, domIndex: index })),
    } } };
    env.replace(changed);
    env.compare();
    expect(env.indicator.getState()).toBe('saved');
    expect(env.current()).toEqual(changed);
  });

  it('historyczna referencja pomija tylko te same zgodne indeksy DOM', () => {
    const original = { ...base(), advanced: { data: { measurements: rows() } } };
    const env = environment(original);
    env.storage.set('vilda-save-ref-v1', JSON.stringify({ fp: JSON.stringify({ core: {
      ...base(), advanced: { data: { measurements: rows().map((row, index) => ({ ...row, domIndex: index })) } },
    } }), dirty: true }));
    env.indicator._onUnlock();
    env.compare();
    expect(env.indicator.getState()).toBe('saved');
  });

  it.each([9, -1, 0.5, '0'])('niezgodny lub nienumeryczny domIndex=%j pozostaje informacją do zapisania', index => {
    const env = environment({ ...base(), advanced: { data: { measurements: rows() } } });
    const changedRows = rows();
    changedRows[0].domIndex = index;
    env.replace({ ...base(), advanced: { data: { measurements: changedRows } } });
    env.compare();
    expect(env.indicator.getState()).toBe('dirty');
  });

  it.each(['weight', 'order', 'extra', 'ageYears'])('zgodne indeksy DOM nie ukrywają zmiany %s', edit => {
    const env = environment({ ...base(), advanced: { data: { measurements: rows() } } });
    let changedRows = rows();
    if (edit === 'weight') changedRows[0].weight += 1;
    else if (edit === 'order') changedRows.reverse();
    else if (edit === 'extra') changedRows[0].extension = 'Fikcyjna informacja';
    else changedRows[0].ageYears += 1;
    changedRows = changedRows.map((row, index) => ({ ...row, domIndex: index }));
    env.replace({ ...base(), advanced: { data: { measurements: changedRows } } });
    env.compare();
    expect(env.indicator.getState()).toBe('dirty');
  });

  it('wyczyszczenie basic pozostaje edycją również przy identycznej historii advanced', () => {
    const original = { ...base(), advanced: { data: { measurements: rows() } }, growthBasic: { data: { measurements: rows() } } };
    const env = environment(original);
    env.replace({ ...original, growthBasic: { data: { measurements: [] } } });
    env.indicator._debouncedOnFormChange({ isTrusted: true });
    vi.advanceTimersByTime(400);
    expect(env.indicator.getState()).toBe('dirty');
    expect(env.current().growthBasic.data.measurements).toEqual([]);
  });
});
