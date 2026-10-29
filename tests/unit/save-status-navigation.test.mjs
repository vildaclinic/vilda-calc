import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-CHIP-NAWIGACJA: prawdziwy wskaźnik, fikcyjne dane i zapisana referencja
// tej samej karty. Odtworzenie może wyliczyć dane modułu, ale nie jest edycją.
const clone = value => JSON.parse(JSON.stringify(value));
const PATIENT = 'fictional-chip-patient';
const SAVED_AT = '2026-06-17T12:00:00.000Z';
const ADVANCED = { ageMonths: 84, height: 123.6, weight: 23.9 };
const BASIC = { ageMonths: 108, height: 135, weight: 29.9 };
const INDEPENDENT = { ageMonths: 120, ageYears: 10, height: 141, weight: 33 };

function fictionalPayload() {
  return {
    name: 'Fikcyjny Pacjent Chipa',
    user: { sex: 'M', age: 13, ageMonths: 0, height: 158, weight: 46 },
    advanced: { data: { measurements: [clone(ADVANCED)] } },
    growthBasic: { data: { measurements: [clone(BASIC)] } },
    intake: { pal: '1.6' },
  };
}

function environment({ initial = fictionalPayload(), legacyReference } = {}) {
  const storage = new Map([['vildaCurrentPatientId', PATIENT]]);
  const listeners = {};
  let payload = clone(initial);
  let sequence = 1;
  if (legacyReference) storage.set('vilda-save-ref-v1', JSON.stringify(legacyReference));
  const win = {
    setTimeout, clearTimeout, setInterval, clearInterval,
    console: { debug() {} }, addEventListener() {},
    document: {
      readyState: 'complete', getElementById: () => null,
      addEventListener(type, callback) { (listeners[type] ||= []).push(callback); },
    },
    sessionStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key),
    },
    VildaVault: { isUnlocked: () => true, onPatientSaved() {} },
    VildaDataImportExport: { getApplyLoadedDataSequence: () => sequence },
    VildaPersistence: { readMainSession: () => clone(payload) },
    collectUserData: () => clone(payload),
    hasMeaningfulMainSessionData: value => Boolean(value?.name),
    saveMainSessionNow: vi.fn(() => true),
  };
  loadBrowserScript('vilda_save_status_indicator.js', win);
  const indicator = win.VildaSaveStatusIndicator;
  const emit = (type, detail) => {
    for (const callback of listeners[type] || []) callback({ type, detail });
  };
  if (!legacyReference) {
    emit('vilda:patient-loaded', {
      patientId: PATIENT, applySequence: sequence, name: payload.name,
      savedAtISO: SAVED_AT, snapshotCount: 4,
    });
    vi.advanceTimersByTime(150);
    expect(indicator.getState()).toBe('saved');
  }
  return {
    indicator, win, emit, storage,
    get payload() { return payload; },
    replace(value) { payload = clone(value); },
    compare() { indicator.notifyExternalChange(); vi.advanceTimersByTime(400); },
    editWeight(value) {
      payload.user.weight = value;
      for (const callback of listeners.input || []) callback({ type: 'input', isTrusted: true });
    },
    nextSequence() { sequence += 1; },
  };
}

function calculatedIntake(payload) {
  payload.intake.history = [
    { ...clone(ADVANCED), ageYears: 7 },
    { ...clone(BASIC), ageYears: 9 },
    { ageMonths: 156, ageYears: 13, height: 158, weight: 46 },
  ];
  payload.intake.estKcalPerDay = 2362;
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-28T12:00:00Z')); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('P-CHIP-NAWIGACJA — porównanie wejść po odtworzeniu', () => {
  it('wyliczone spożycie i lustrzane pomiary nie zmieniają zapisanej referencji', () => {
    const env = environment();
    const reference = env.indicator.getReferenceFingerprint();
    calculatedIntake(env.payload);
    env.compare();
    expect(env.indicator.getState()).toBe('saved');
    expect(env.indicator.getReferenceFingerprint()).toBe(reference);
    expect(env.indicator._computeCanonicalFingerprint()).toBe(reference);
  });

  it('kolejność kluczy obiektów po rekonstrukcji sesji nie jest zmianą danych', () => {
    const env = environment();
    const original = env.payload;
    env.replace({
      intake: original.intake, growthBasic: original.growthBasic, advanced: original.advanced,
      user: { weight: 46, height: 158, ageMonths: 0, age: 13, sex: 'M' }, name: original.name,
    });
    env.compare();
    expect(env.indicator.getState()).toBe('saved');
  });

  it.each(['add', 'edit', 'delete'])('niezależna historia spożycia: %s pozostaje edycją', operation => {
    const initial = fictionalPayload();
    if (operation !== 'add') initial.intake.history = [clone(INDEPENDENT)];
    const env = environment({ initial });
    if (operation === 'add') env.payload.intake.history = [clone(INDEPENDENT)];
    if (operation === 'edit') env.payload.intake.history[0].weight = 34;
    if (operation === 'delete') env.payload.intake.history = [];
    env.compare();
    expect(env.indicator.getState()).toBe('dirty');
  });

  it('dodatkowa treść wiersza nie znika tylko dlatego, że liczby powtarzają pomiar', () => {
    const env = environment();
    env.payload.intake.history = [{ ...clone(ADVANCED), note: 'Fikcyjna uwaga do pomiaru' }];
    env.compare();
    expect(env.indicator.getState()).toBe('dirty');
  });

  it.each(['pal', 'weight'])('%s zmienione przez lekarza nadal oznacza niezapisane dane', field => {
    const env = environment();
    calculatedIntake(env.payload);
    if (field === 'pal') env.payload.intake.pal = '1.8';
    else env.payload.user.weight = 47;
    env.compare();
    expect(env.indicator.getState()).toBe('dirty');
  });

  it.each(['advanced', 'growthBasic'])('usunięcie z %s nie ginie za wyliczoną kopią intake', section => {
    const initial = fictionalPayload();
    calculatedIntake(initial);
    const env = environment({ initial });
    env.payload[section].data.measurements = [];
    env.compare();
    expect(env.indicator.getState()).toBe('dirty');
  });

  it.each(['advanced', 'growthBasic'])('edycja historii %s nadal jest wykrywana', section => {
    const env = environment();
    env.payload[section].data.measurements[0].weight += 1;
    env.compare();
    expect(env.indicator.getState()).toBe('dirty');
  });

  it('porównanie nie modyfikuje danych formularza ani sesji', () => {
    const env = environment();
    calculatedIntake(env.payload);
    const expected = clone(env.payload);
    env.compare();
    expect(env.payload).toEqual(expected);
  });
});

describe('P-CHIP-NAWIGACJA — referencja pozostawiona przez poprzednią wersję', () => {
  it.each([false, true])('referencja historyczna (dirty=%s) porównuje te same wejścia bez fałszywej zmiany', dirty => {
    const referencePayload = fictionalPayload();
    calculatedIntake(referencePayload);
    const current = fictionalPayload();
    const env = environment({ initial: current, legacyReference: {
      fp: JSON.stringify({ core: referencePayload, clcr: null }), dirty,
      savedAtISO: SAVED_AT, snapshotCount: 4, patientName: referencePayload.name,
    } });
    env.compare();
    expect(env.indicator.getState()).toBe('saved');
    expect(env.indicator.getLastSavedAtISO()).toBe(SAVED_AT);
    expect(env.indicator.getLastSnapshotCount()).toBe(4);
  });

  it('normalizacja historycznej referencji zachowuje rzeczywistą niezapisaną zmianę', () => {
    const referencePayload = fictionalPayload();
    calculatedIntake(referencePayload);
    const current = fictionalPayload();
    current.user.weight = 47;
    const env = environment({ initial: current, legacyReference: {
      fp: JSON.stringify({ core: referencePayload, clcr: null }), dirty: true,
      savedAtISO: SAVED_AT, snapshotCount: 4, patientName: referencePayload.name,
    } });
    env.compare();
    expect(env.indicator.getState()).toBe('dirty');
    expect(env.indicator.getLastSavedAtISO()).toBe(SAVED_AT);
  });
});

describe('P-CHIP-NAWIGACJA — zakończenie wyboru „Nowy pomiar”', () => {
  function archivePreviousMeasurement(env) {
    const archived = { ageMonths: 156, height: 158, weight: 46 };
    env.payload.advanced.data.measurements.push(clone(archived));
    env.payload.growthBasic.data.measurements.push(clone(archived));
    env.payload.user.height = null;
    env.payload.user.weight = null;
  }

  it('ustanawia bazę po archiwizacji poprzedniego pomiaru i zachowuje metadane zapisu', () => {
    const env = environment();
    archivePreviousMeasurement(env);
    env.emit('vilda:load-choice-applied', { choice: 'new', patientId: PATIENT, applySequence: 1 });
    vi.advanceTimersByTime(150);
    env.compare();
    expect(env.indicator.getState()).toBe('saved');
    expect(env.indicator.getLastSavedAtISO()).toBe(SAVED_AT);
    expect(env.indicator.getLastSnapshotCount()).toBe(4);
    expect(env.indicator.getLastPatientName()).toBe('Fikcyjny Pacjent Chipa');
    env.payload.user.weight = 47;
    env.compare();
    expect(env.indicator.getState()).toBe('dirty');
  });

  it.each([
    { choice: 'new', patientId: 'fictional-other-patient', applySequence: 1 },
    { choice: 'new', patientId: PATIENT, applySequence: 0 },
    { choice: 'new', patientId: PATIENT },
    { choice: 'restore', patientId: PATIENT, applySequence: 1 },
  ])('obcy lub nieaktualny wybór %j nie zatwierdza bieżących zmian', detail => {
    const env = environment();
    env.payload.user.weight = 47;
    env.emit('vilda:load-choice-applied', detail);
    vi.advanceTimersByTime(150);
    env.compare();
    expect(env.indicator.getState()).toBe('dirty');
  });

  it('szybka edycja po wyborze pomiaru nie trafia do jego zapisanej bazy', () => {
    const env = environment();
    archivePreviousMeasurement(env);
    env.emit('vilda:load-choice-applied', { choice: 'new', patientId: PATIENT, applySequence: 1 });
    vi.advanceTimersByTime(50);
    env.editWeight(47);
    vi.advanceTimersByTime(400);
    expect(env.indicator.getState()).toBe('dirty');
  });

  it('kolejna operacja po zakończeniu wyboru nie zmienia przyjętej referencji', () => {
    const env = environment();
    archivePreviousMeasurement(env);
    env.emit('vilda:load-choice-applied', { choice: 'new', patientId: PATIENT, applySequence: 1 });
    const reference = env.indicator.getReferenceFingerprint();
    env.nextSequence();
    env.payload.user.weight = 47;
    env.compare();
    expect(env.indicator.getState()).toBe('dirty');
    expect(env.indicator.getReferenceFingerprint()).toBe(reference);
  });
});
