import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Prawdziwy runtime i adapter, wyłącznie fikcyjne dane. Ręczne zdarzenie z isTrusted
// modeluje edycję użytkownika; syntetyczne input/change od restore nie ma tego prawa.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');
const storage = () => {
  const items = new Map();
  return { getItem: key => items.get(key) ?? null, setItem: (key, value) => items.set(key, String(value)),
    removeItem: key => items.delete(key), key: i => [...items.keys()][i] ?? null, get length() { return items.size; } };
};

function harness() {
  const events = {};
  const document = { readyState: 'complete', hidden: false,
    addEventListener(type, listener) { (events[type] ||= []).push(listener); },
    dispatchEvent(event) { for (const listener of events[event.type] || []) listener(event); return true; },
    getElementById: id => fields[id] || null, getElementsByName: () => [], querySelectorAll: () => [] };
  const fields = Object.fromEntries(['age', 'ageMonths', 'weight', 'height', 'sex'].map(id => [id, {
    id, tagName: 'INPUT', type: 'number', value: '', dataset: {}, disabled: false, closest: () => null,
    dispatchEvent(event) { return document.dispatchEvent({ type: event.type, target: this, isTrusted: false }); },
  }]));
  const win = new EventTarget();
  Object.assign(win, { document, sessionStorage: storage(), localStorage: storage(), vildaAppOnReady() {},
    setTimeout, clearTimeout, CustomEvent, Event, VildaPanelPacjent: { nieaktualny: () => false } });
  win.sessionStorage.setItem('vildaCurrentPatientId', 'fictional-infant-a');
  for (const file of ['vilda_persistence_adapter.js', 'vilda_persist_runtime.js']) {
    new Function('window', 'globalThis', 'document', source(file))(win, win, document);
  }
  win.VildaPersistRuntime.init();
  const seed = (months = '4') => win.VildaPersistence.writeShared({ age: '0', ageMonths: months, height: '62', weight: '6',
    _vildaPersist: { byId: { age: '0', ageMonths: months, height: '62', weight: '6' } } }, { force: true });
  seed();
  win.vildaPersistRestoreAll();
  const edit = (value, { trusted = true, type = 'input' } = {}) => {
    fields.ageMonths.value = value;
    document.dispatchEvent({ type, target: fields.ageMonths, isTrusted: trusted });
  };
  const saved = () => {
    const state = win.VildaPersistence.readShared();
    return [state.ageMonths, state._vildaPersist.byId.ageMonths];
  };
  return { win, fields, edit, seed, saved };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('autosave — edycja wieku 4→3 miesiące w pauzie po odtworzeniu', () => {
  it.each(['input', 'change'])('%s: zachowuje edycję i zapisuje ją po pauzie bez następnej interakcji', async type => {
    const h = harness();
    h.win.VildaPersistence.pauseAutosave(900);
    h.edit('3', { type });
    await vi.advanceTimersByTimeAsync(400);
    expect(h.saved(), 'pauza nadal blokuje zwykły zapis').toEqual(['4', '4']);
    await vi.advanceTimersByTimeAsync(600);
    expect(h.saved()).toEqual(['3', '3']);
    h.win.vildaPersistRestoreAll();
    expect(h.fields.ageMonths.value).toBe('3');
  });

  it('force podczas pauzy zapisuje ostatnią edycję; późniejsze restore nie przywraca 4', () => {
    const h = harness();
    h.win.VildaPersistence.pauseAutosave(900);
    h.edit('3');
    h.win.vildaPersistFlushNow({ force: true });
    expect(h.saved()).toEqual(['3', '3']);
    h.win.vildaPersistRestoreAll();
    expect(h.fields.ageMonths.value).toBe('3');
  });

  it('force w zewnętrznym kontekście restore nadal zapisuje wcześniej uchwyconą edycję', () => {
    const h = harness();
    h.edit('3');
    h.win.__vildaPersistRestoring = true;
    h.win.vildaPersistFlushNow({ force: true });
    expect(h.saved()).toEqual(['3', '3']);
  });

  it('przedłużenie pauzy po edycji nie gubi czekającego zapisu', async () => {
    const h = harness();
    h.win.VildaPersistence.pauseAutosave(500);
    h.edit('3');
    await vi.advanceTimersByTimeAsync(300);
    h.win.VildaPersistence.pauseAutosave(900);
    await vi.advanceTimersByTimeAsync(600);
    expect(h.saved()).toEqual(['4', '4']);
    await vi.advanceTimersByTimeAsync(400);
    expect(h.saved()).toEqual(['3', '3']);
  });

  it.each(['synthetic', 'restoring', 'mirror', 'clear', 'stale-panel'])('%s: nie zapisuje obcych/syntetycznych zdarzeń podczas pauzy', async guard => {
    const h = harness();
    h.win.VildaPersistence.pauseAutosave(900);
    if (guard === 'restoring') h.win.__vildaPersistRestoring = true;
    if (guard === 'mirror') h.win.__vildaLustroWpis = true;
    if (guard === 'clear') h.win.VildaPersistence.markClearInProgress(900);
    if (guard === 'stale-panel') h.win.VildaPanelPacjent.nieaktualny = () => true;
    h.edit('3', { trusted: guard !== 'synthetic' });
    h.win.vildaPersistFlushNow({ force: true });
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.saved()).toEqual(['4', '4']);
  });

  it('syntetyczne echo po ręcznej edycji nie jest ponownie czytane jako edycja użytkownika', async () => {
    const h = harness();
    h.win.VildaPersistence.pauseAutosave(900);
    h.edit('3');
    h.edit('4', { trusted: false });
    await vi.advanceTimersByTimeAsync(0);
    h.win.vildaPersistFlushNow({ force: true });
    expect(h.saved()).toEqual(['3', '3']);
  });

  it('kolejny input po zmianie pacjenta nie przypisuje starej kolejki nowej osobie', async () => {
    const h = harness();
    h.win.VildaPersistence.pauseAutosave(900);
    h.edit('3');
    h.win.sessionStorage.setItem('vildaCurrentPatientId', 'fictional-infant-b');
    h.seed('8');
    h.edit('5');
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.saved()).toEqual(['8', '8']);
  });

  it('zmiana identyfikatora pacjenta przed force odrzuca czekające dane poprzedniej osoby', async () => {
    const h = harness();
    h.win.VildaPersistence.pauseAutosave(900);
    h.edit('3');
    h.win.sessionStorage.setItem('vildaCurrentPatientId', 'fictional-infant-b');
    h.seed('8');
    h.win.vildaPersistFlushNow({ force: true });
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.saved()).toEqual(['8', '8']);
  });

  it.each([true, false])('nadanie ID w drugiej ramce: adopcja tego samego pacjenta potwierdzona przez panel = %s', confirmed => {
    const h = harness();
    h.win.sessionStorage.removeItem('vildaCurrentPatientId');
    h.win._vildaCurrentPatientId = null;
    h.win.vildaPersistRestoreAll();
    h.win.VildaPersistence.pauseAutosave(900);
    h.edit('3');
    h.win.sessionStorage.setItem('vildaCurrentPatientId', 'fictional-new-infant');
    // Potwierdzenie nazwy i daty urodzenia należy do VildaPanelPacjent (ma własne
    // regresje). Sama obecność nowego ID / nieaktualny() === false nie wystarcza.
    h.win.VildaPanelPacjent.wlasciciel = () => confirmed ? 'fictional-new-infant' : null;
    h.win.vildaPersistFlushNow({ force: true });
    expect(h.saved()).toEqual(confirmed ? ['3', '3'] : ['4', '4']);
  });

  it.each(['restore', 'invalidate'])('%s unieważnia także odroczone elementy i timer starej osoby', async method => {
    const h = harness();
    h.win.VildaPersistence.pauseAutosave(900);
    h.edit('3');
    h.seed('8');
    if (method === 'restore') h.win.vildaPersistRestoreAll();
    else h.win.__vildaPersistInvalidatePendingRoot();
    await vi.advanceTimersByTimeAsync(1000);
    h.win.vildaPersistFlushNow({ force: true });
    expect(h.saved()).toEqual(['8', '8']);
  });
});
