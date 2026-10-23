import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-KREATOR-ZAPIS-PAUZA: prawdziwy wskaźnik i jego C()/B(), odrębny formularz
// oraz kopia sesji. Dane fikcyjne; zegar kontroluje granice pauzy i publikacji.
const clone = (value) => JSON.parse(JSON.stringify(value));

function environment({ publish = true } = {}) {
  const events = {};
  const storage = new Map([['vildaCurrentPatientId', 'fictional-first']]);
  const form = { name: 'Fikcyjny Pierwszy', user: { sex: 'M', age: 16, height: 174, weight: 62 } };
  let session = clone(form);
  let sequence = 1;
  let unlocked = true;
  let stale = false;
  const save = vi.fn(() => { session = clone(form); return true; });
  const win = {
    setTimeout, clearTimeout, setInterval, clearInterval,
    console: { debug() {} }, addEventListener() {},
    document: {
      readyState: 'complete',
      addEventListener(type, listener) { (events[type] ||= []).push(listener); },
      getElementById: () => null,
    },
    sessionStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key),
    },
    VildaVault: { isUnlocked: () => unlocked, onPatientSaved() {} },
    VildaPanelPacjent: { nieaktualny: () => stale },
    VildaDataImportExport: { getApplyLoadedDataSequence: () => sequence },
    VildaPersistence: { readMainSession: () => clone(session) },
    collectUserData: () => clone(form),
    hasMeaningfulMainSessionData: value => Boolean(value?.name),
    saveMainSessionNow: save,
  };
  loadBrowserScript('vilda_save_status_indicator.js', win);
  const indicator = win.VildaSaveStatusIndicator;
  const emit = (type, detail) => {
    for (const listener of events[type] || []) listener({ type, detail });
  };
  emit('vilda:patient-loaded', { patientId: 'fictional-first', applySequence: sequence, name: form.name });
  if (publish) {
    vi.advanceTimersByTime(150);
    expect(indicator.getState()).toBe('saved');
    save.mockClear();
  }
  return {
    win, indicator, form, save,
    session: () => clone(session),
    pause(ms) { win.__vildaPersistPauseUntil = Date.now() + ms; },
    edit(value, { trusted = true, type = 'input' } = {}) {
      form.user.weight = value;
      for (const listener of events[type] || []) listener({ type, isTrusted: trusted });
    },
    changePatient() { storage.set('vildaCurrentPatientId', 'fictional-second'); },
    restorePatient(id) { storage.set('vildaCurrentPatientId', id); emit('vilda:persist-restored'); },
    changeSequence() { sequence += 1; },
    lock() { unlocked = false; },
    stalePanel() { stale = true; },
  };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-23T10:00:00Z')); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('P-KREATOR-ZAPIS-PAUZA — świadoma edycja po opublikowaniu bazy', () => {
  it.each(['input', 'change'])('%s: po pauzie zapisuje bieżący formularz do sesji i wykrywa zmianę bez kolejnej interakcji', type => {
    const env = environment();
    const reference = env.indicator.getReferenceFingerprint();
    env.pause(900);
    env.edit(63, { type });
    vi.advanceTimersByTime(400);
    expect(env.session().user.weight).toBe(62);
    expect(env.indicator.getState()).toBe('saved');
    expect(env.indicator._computeCanonicalFingerprint()).toBe(reference);
    vi.advanceTimersByTime(500);
    expect(env.save).toHaveBeenCalledWith({ force: true });
    expect(env.session().user.weight).toBe(63);
    expect(env.indicator.getReferenceFingerprint()).toBe(reference);
    expect(env.indicator._computeCanonicalFingerprint()).not.toBe(reference);
    expect(env.indicator.getState()).toBe('dirty');
  });

  it('ponowne wpisanie tej samej masy pozostaje saved', () => {
    const env = environment();
    env.pause(900);
    env.edit(62);
    vi.advanceTimersByTime(900);
    expect(env.save).toHaveBeenCalledTimes(1);
    expect(env.indicator.getState()).toBe('saved');
  });

  it('pauza rozpoczęta między input a callbackiem debounce także zachowuje edycję', () => {
    const env = environment();
    env.edit(63);
    vi.advanceTimersByTime(300);
    env.pause(900);
    vi.advanceTimersByTime(100);
    expect(env.indicator.getState()).toBe('saved');
    expect(env.save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(800);
    expect(env.session().user.weight).toBe(63);
    expect(env.indicator.getState()).toBe('dirty');
  });

  it('przedłużenie pauzy i kolejny input sprawdzają ostatnią wartość po jej końcu', () => {
    const env = environment();
    env.pause(900);
    env.edit(63);
    vi.advanceTimersByTime(600);
    env.pause(900);
    env.edit(64);
    vi.advanceTimersByTime(300);
    expect(env.save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(600);
    expect(env.save).toHaveBeenCalledTimes(1);
    expect(env.session().user.weight).toBe(64);
    expect(env.indicator.getState()).toBe('dirty');
  });

  it('przedłużona pauza bez kolejnego input również odracza callback', () => {
    const env = environment();
    env.pause(900);
    env.edit(63);
    vi.advanceTimersByTime(600);
    env.pause(900);
    vi.advanceTimersByTime(300);
    expect(env.save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(600);
    expect(env.indicator.getState()).toBe('dirty');
  });

  it.each(['patient', 'sequence', 'generation', 'lock', 'clear', 'stale-panel'])('%s unieważnia oczekującą edycję przed wymuszonym zapisem sesji', boundary => {
    const env = environment();
    env.pause(900);
    env.edit(63);
    if (boundary === 'patient') env.changePatient();
    if (boundary === 'sequence') env.changeSequence();
    if (boundary === 'generation') env.indicator._onUnlock();
    if (boundary === 'lock') { env.lock(); env.indicator._onLock(); }
    if (boundary === 'clear') env.indicator._onUserStateCleared();
    if (boundary === 'stale-panel') env.stalePanel();
    vi.advanceTimersByTime(1000);
    expect(env.save).not.toHaveBeenCalled();
    expect(env.session().user.weight).toBe(62);
  });

  it('nowe Z tej samej operacji kasuje kolejkę i zachowuje dotychczasową publikację jej bazy', () => {
    const env = environment();
    env.pause(900);
    env.edit(63);
    env.indicator._onStateRestored();
    vi.advanceTimersByTime(150);
    expect(env.save).toHaveBeenCalledTimes(1);
    const reference = env.indicator.getReferenceFingerprint();
    vi.advanceTimersByTime(900);
    expect(env.save).toHaveBeenCalledTimes(1);
    expect(env.indicator.getReferenceFingerprint()).toBe(reference);
    expect(env.indicator.getState()).toBe('saved');
  });

  it('przejęcie pacjenta A→B→A przez runtime restore nie ożywia starej kolejki A', () => {
    const env = environment();
    env.pause(900);
    env.edit(63);
    env.restorePatient('fictional-second');
    vi.advanceTimersByTime(200);
    env.restorePatient('fictional-first');
    vi.advanceTimersByTime(700);
    expect(env.save).not.toHaveBeenCalled();
    expect(env.session().user.weight).toBe(62);
    expect(env.indicator.getState()).toBe('saved');
  });

  it('nowy import nie dziedziczy kolejki potwierdzonego pacjenta', () => {
    const env = environment();
    env.pause(900);
    env.edit(63);
    env.changeSequence();
    env.indicator._onJsonImported({ applySequence: 2, name: 'Fikcyjna Druga' });
    vi.advanceTimersByTime(1000);
    expect(env.save).not.toHaveBeenCalled();
    expect(env.indicator.getState()).toBe('new_patient');
  });

  it('potwierdzony zapis unieważnia kolejkę i ustanawia bazę dla następnej edycji', () => {
    const env = environment();
    env.pause(900);
    env.edit(63);
    env.indicator._onPatientSaved({ patientId: 'fictional-first', applySequence: 1 });
    const reference = env.indicator.getReferenceFingerprint();
    expect(env.save).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(900);
    expect(env.save).toHaveBeenCalledTimes(1);
    expect(env.indicator.getState()).toBe('saved');
    env.pause(900);
    env.edit(64);
    vi.advanceTimersByTime(900);
    expect(env.indicator.getReferenceFingerprint()).toBe(reference);
    expect(env.indicator.getState()).toBe('dirty');
  });

  it('adopcja zapisanej referencji po unlock ustanawia nowy gotowy scope', () => {
    const env = environment();
    env.indicator._onUnlock();
    env.pause(900);
    env.edit(63);
    vi.advanceTimersByTime(900);
    expect(env.save).toHaveBeenCalledTimes(1);
    expect(env.indicator.getState()).toBe('dirty');
  });

  it.each(['restoring', 'mirror', 'clear-in-progress', 'locked-without-event'])('%s rozpoczęte po input blokuje C(force) na końcu pauzy', guard => {
    const env = environment();
    env.pause(900);
    env.edit(63);
    vi.advanceTimersByTime(400);
    if (guard === 'restoring') env.win.__vildaPersistRestoring = true;
    if (guard === 'mirror') env.win.__vildaLustroWpis = true;
    if (guard === 'clear-in-progress') env.win.__vildaPersistClearUntil = Date.now() + 900;
    if (guard === 'locked-without-event') env.lock();
    vi.advanceTimersByTime(500);
    expect(env.save).not.toHaveBeenCalled();
    expect(env.session().user.weight).toBe(62);
  });

  it.each(['synthetic', 'restoring', 'mirror', 'clear-in-progress'])('%s nie tworzy odroczonej edycji', guard => {
    const env = environment();
    env.pause(900);
    if (guard === 'restoring') env.win.__vildaPersistRestoring = true;
    if (guard === 'mirror') env.win.__vildaLustroWpis = true;
    if (guard === 'clear-in-progress') env.win.__vildaPersistClearUntil = Date.now() + 900;
    env.edit(63, { trusted: guard !== 'synthetic' });
    env.win.__vildaPersistRestoring = false;
    env.win.__vildaLustroWpis = false;
    vi.advanceTimersByTime(1000);
    expect(env.save).not.toHaveBeenCalled();
    expect(env.indicator.getState()).toBe('saved');
  });

  it('przed publikacją bazy nie dodaje kolejki ani nie zmienia istniejącego kontraktu G', () => {
    const env = environment({ publish: false });
    env.pause(900);
    env.edit(63);
    vi.advanceTimersByTime(150);
    expect(env.save).toHaveBeenCalledTimes(1);
    const reference = env.indicator.getReferenceFingerprint();
    vi.advanceTimersByTime(900);
    expect(env.save).toHaveBeenCalledTimes(1);
    expect(env.indicator.getReferenceFingerprint()).toBe(reference);
    expect(env.indicator.getState()).toBe('saved');
  });
});

describe('P-KREATOR-ZAPIS-PAUZA — sesja opóźniona względem zwykłej edycji', () => {
  it('trusted input bez pauzy porównuje aktualny formularz zamiast starszej kopii sesji', () => {
    const env = environment();
    const reference = env.indicator.getReferenceFingerprint();
    env.edit(63);
    vi.advanceTimersByTime(399);
    expect(env.session().user.weight).toBe(62);
    expect(env.indicator._computeCanonicalFingerprint()).toBe(reference);
    vi.advanceTimersByTime(1);
    expect(env.save).toHaveBeenCalledWith({ force: true });
    expect(env.session().user.weight).toBe(63);
    expect(env.indicator.getReferenceFingerprint()).toBe(reference);
    expect(env.indicator.getState()).toBe('dirty');
  });

  it('ta sama masa bez pauzy pozostaje saved po utrwaleniu kopii sesji', () => {
    const env = environment();
    env.edit(62);
    vi.advanceTimersByTime(400);
    expect(env.save).toHaveBeenCalledTimes(1);
    expect(env.indicator.getState()).toBe('saved');
  });

  it('powrót do zapisanej masy przywraca saved bez zmiany referencji', () => {
    const env = environment();
    const reference = env.indicator.getReferenceFingerprint();
    env.edit(63);
    vi.advanceTimersByTime(400);
    expect(env.indicator.getState()).toBe('dirty');
    env.edit(62);
    vi.advanceTimersByTime(400);
    expect(env.session().user.weight).toBe(62);
    expect(env.save).toHaveBeenCalledTimes(2);
    expect(env.indicator.getReferenceFingerprint()).toBe(reference);
    expect(env.indicator.getState()).toBe('saved');
  });

  it.each(['patient', 'sequence', 'generation', 'lock', 'clear', 'stale-panel', 'mirror', 'restoring'])('%s między input i J400 blokuje wymuszony zapis obcego/starego formularza', guard => {
    const env = environment();
    env.edit(63);
    vi.advanceTimersByTime(200);
    if (guard === 'patient') env.changePatient();
    if (guard === 'sequence') env.changeSequence();
    if (guard === 'generation') env.indicator._onUnlock();
    if (guard === 'lock') { env.lock(); env.indicator._onLock(); }
    if (guard === 'clear') env.indicator._onUserStateCleared();
    if (guard === 'stale-panel') env.stalePanel();
    if (guard === 'mirror') env.win.__vildaLustroWpis = true;
    if (guard === 'restoring') env.win.__vildaPersistRestoring = true;
    vi.advanceTimersByTime(200);
    expect(env.save).not.toHaveBeenCalled();
    expect(env.session().user.weight).toBe(62);
  });
});
