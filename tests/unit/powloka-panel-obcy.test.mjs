import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { powloka } from '../support/powloka-harness.mjs';

// P-POWLOKA-OBCY (2026-10-06) — panel powłoki nie może po cichu przejąć innego pacjenta.
// Każdy test wykonuje PRAWDZIWY kod produkcyjny (vilda_panel_pacjent.js, vilda_persistence_adapter.js,
// moduł lustra z custom-fixes.js, vilda_shell.js) na atrapach okna. Dane wyłącznie FIKCYJNE.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const zrodlo = (plik) => fs.readFileSync(path.join(korzen, plik), 'utf8');

function magazyn() {
  const m = Object.create(null);
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
    key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
  };
}

function okno({ dane = true, protokol = 1, formularz = {}, migawka = null } = {}) {
  const sluchacze = { win: {}, doc: {} };
  const dodaj = (mapa) => (typ, fn) => { (mapa[typ] = mapa[typ] || []).push(fn); };
  const pola = {};
  Object.entries(formularz).forEach(([id, value]) => { pola[id] = { id, value }; });
  const win = {
    sessionStorage: magazyn(),
    localStorage: magazyn(),
    addEventListener: dodaj(sluchacze.win),
    removeEventListener() {},
    dispatchEvent(e) { (sluchacze.win[e.type] || []).forEach((f) => f(e)); return true; },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = (init || {}).detail; } },
    setTimeout: setTimeout.bind(globalThis),
    clearTimeout: clearTimeout.bind(globalThis),
    VildaDataImportExport: { anyDataEntered: () => dane },
    VildaPersistence: { readMainSession: () => migawka },
    VildaDobAge: { readISO: () => (pola.dobInput ? pola.dobInput.value : null) || null },
    document: {
      addEventListener: dodaj(sluchacze.doc),
      removeEventListener() {},
      dispatchEvent(e) { (sluchacze.doc[e.type] || []).forEach((f) => f(e)); return true; },
      readyState: 'complete', hidden: false, querySelectorAll: () => [], getElementById: (id) => pola[id] || null,
    },
  };
  // Ramka powłoki: rodzic deklaruje obsługę protokołu (VildaShell.protokolPanelu). Strona samodzielna: parent === window.
  win.parent = protokol === 'samodzielna' ? win : { VildaShell: protokol == null ? { navigate() {} } : { protokolPanelu: protokol } };
  const zInnejRamki = (nowy) => {
    if (nowy == null) win.sessionStorage.removeItem('vildaCurrentPatientId');
    else win.sessionStorage.setItem('vildaCurrentPatientId', nowy);
  };
  const wlasne = (typ, detail) => (sluchacze.doc[typ] || []).forEach((f) => f({ type: typ, detail }));
  return { win, zInnejRamki, wlasne, sluchacze, pola };
}

function zaladuj(opcje, pacjent = 'pac-x') {
  const o = okno(opcje);
  if (pacjent) o.win.sessionStorage.setItem('vildaCurrentPatientId', pacjent);
  loadBrowserScript('vilda_panel_pacjent.js', o.win);
  return { ...o, api: o.win.VildaPanelPacjent };
}

describe('vilda_panel_pacjent.js — kiedy dokument panelu przestaje należeć do pacjenta karty', () => {
  it('inna ramka wczytuje innego pacjenta przy panelu z danymi: dokument nieaktualny, właściciel X (ocena leniwa, bez zdarzeń)', () => {
    const { api, zInnejRamki } = zaladuj();
    expect(api.nieaktualny()).toBe(false);
    expect(api.wlasciciel()).toBe('pac-x');
    zInnejRamki('pac-y'); // inna ramka zmienia sesję karty; żadne zdarzenie nie jest potrzebne
    expect(api.nieaktualny()).toBe(true);
    expect(api.wlasciciel()).toBe('pac-x');
    expect(api.pacjentKarty()).toBe('pac-y');
    zInnejRamki('pac-z'); // kolejny pacjent nie zmienia właściciela
    expect(api.wlasciciel()).toBe('pac-x');
  });

  it('własne wczytanie (vilda:patient-loaded z patientId) zmienia znanego pacjenta — bez fałszywej nieaktualności', () => {
    const { api, wlasne, win } = zaladuj();
    wlasne('vilda:patient-loaded', { patientId: 'pac-y' });
    win.sessionStorage.setItem('vildaCurrentPatientId', 'pac-y'); // custom-fixes.js po patient-loaded
    expect(api.nieaktualny()).toBe(false);
    expect(api.wlasciciel()).toBe('pac-y');
  });

  it('nowy, niezapisany pacjent w panelu staje się nieaktualny, gdy inna ramka wczyta Y (migawka karty to Y)', () => {
    const { api, zInnejRamki } = zaladuj({
      formularz: { name: 'Fikcyjny Nowy', dobInput: '2015-03-01' },
      migawka: { name: 'Fikcyjna Druga', user: { dobISO: '2013-07-07' } },
    }, null);
    zInnejRamki('pac-y');
    expect(api.nieaktualny()).toBe(true);
    expect(api.wlasciciel()).toBe(null);
  });

  it('zapis tego samego nowego dziecka w innej ramce (identyfikator nadany, nazwisko i data jak w migawce) — panel przyjmuje identyfikator', () => {
    const { api, zInnejRamki } = zaladuj({
      formularz: { name: 'Fikcyjny  Nowy', dobInput: '2015-03-01' },
      migawka: { name: 'fikcyjny nowy', user: { dobISO: '2015-03-01' } },
    }, null);
    zInnejRamki('pac-nowy');
    expect(api.nieaktualny()).toBe(false);
    expect(api.wlasciciel()).toBe('pac-nowy');
  });

  it('nadany identyfikator, ale inna data urodzenia albo brak nazwiska w formularzu — panel nieaktualny', () => {
    const inna = zaladuj({
      formularz: { name: 'Fikcyjny Nowy', dobInput: '2015-03-01' },
      migawka: { name: 'Fikcyjny Nowy', user: { dobISO: '2016-01-01' } },
    }, null);
    inna.zInnejRamki('pac-nowy');
    expect(inna.api.nieaktualny()).toBe(true);
    const bezNazwiska = zaladuj({ formularz: {}, migawka: { name: 'Fikcyjny Nowy' } }, null);
    bezNazwiska.zInnejRamki('pac-nowy');
    expect(bezNazwiska.api.nieaktualny()).toBe(true);
  });

  it('pusty panel przyjmuje pacjenta karty (P-ODTWORZ-ZYWO, P-POWLOKA-ID)', () => {
    const { api, zInnejRamki } = zaladuj({ dane: false });
    zInnejRamki('pac-y');
    expect(api.nieaktualny()).toBe(false);
    expect(api.wlasciciel()).toBe('pac-y');
  });

  it('stan pacjenta poza polami formularza (wczytany rekord, punkty GH, pomiary) też jest „danymi”', () => {
    for (const ustaw of [
      (w) => { w.lastLoadedData = { name: 'Fikcyjny Pierwszy' }; },
      (w) => { w.ghTherapyPoints = [{ id: 'gh-x1' }]; },
      (w) => { w.advancedGrowthData = { measurements: [{ age: 10 }] }; },
    ]) {
      const { api, zInnejRamki, win } = zaladuj({ dane: false });
      ustaw(win);
      zInnejRamki('pac-y');
      expect(api.nieaktualny()).toBe(true);
    }
  });

  it('usunięcie identyfikatora karty (blokada sejfu, usunięcie pacjenta, „Wyczyść” w innej ramce) nie jest zmianą pacjenta', () => {
    for (const opcje of [{}, { dane: false }]) {
      const { api, zInnejRamki } = zaladuj(opcje);
      zInnejRamki(null);
      expect(api.nieaktualny()).toBe(false);
      expect(api.wlasciciel()).toBe('pac-x');
    }
  });

  it('powrót karty do pacjenta dokumentu (X → Y → X), własne wczytanie i własne „Wyczyść” (na window) kończą nieaktualność', () => {
    const { api, zInnejRamki, wlasne, win } = zaladuj();
    zInnejRamki('pac-y');
    expect(api.nieaktualny()).toBe(true);
    zInnejRamki('pac-x');
    expect(api.nieaktualny()).toBe(false);
    zInnejRamki('pac-y');
    expect(api.nieaktualny()).toBe(true);
    wlasne('vilda:patient-loaded');
    expect(api.nieaktualny()).toBe(false);
    zInnejRamki('pac-z');
    expect(api.nieaktualny()).toBe(true);
    win.dispatchEvent({ type: 'vilda:user-state-cleared' }); // VildaPersistence.clearUserState rozgłasza na window
    win.sessionStorage.removeItem('vildaCurrentPatientId');
    expect(api.nieaktualny()).toBe(false);
  });

  it('utrwal() (powłoka przeładowuje ramkę): powrót karty X nie kończy nieaktualności; początek własnego wczytania kończy', () => {
    const { api, zInnejRamki } = zaladuj();
    expect(api.utrwal()).toBe(false); // aktualny dokument nie jest utrwalany
    zInnejRamki('pac-y');
    expect(api.utrwal()).toBe(true);
    zInnejRamki('pac-x');
    expect(api.nieaktualny()).toBe(true);
    api.wczytanie();
    expect(api.nieaktualny()).toBe(false);
    expect(api.wlasciciel()).toBe('pac-x');
  });

  it('cel zapisu i notatki: aktualny dokument — pacjent karty; nieaktualny — jego własny pacjent (także „nowy”, null)', () => {
    const { api, zInnejRamki } = zaladuj();
    expect(api.cel('pac-x')).toBe('pac-x');
    zInnejRamki('pac-y');
    expect(api.cel('pac-y')).toBe('pac-x');
    const nowy = zaladuj({ formularz: { name: 'Fikcyjny Nowy' }, migawka: { name: 'Fikcyjna Druga' } }, null);
    nowy.zInnejRamki('pac-y');
    expect(nowy.api.cel('pac-y')).toBe(null);
  });

  it('bez powłoki z protokołem (strona samodzielna, starsza powłoka po aktualizacji) moduł jest nieczynny', () => {
    for (const protokol of ['samodzielna', null]) {
      const { api, zInnejRamki } = zaladuj({ protokol });
      zInnejRamki('pac-y');
      expect(api.nieaktualny()).toBe(false);
      expect(api.cel('pac-y')).toBe('pac-y');
    }
  });
});

describe('adapter trwałości — nieaktualny dokument nie zapisuje stanu karty', () => {
  function adapter({ nieaktualny }) {
    const o = okno();
    o.win.VildaPanelPacjent = { nieaktualny: () => nieaktualny };
    loadBrowserScript('vilda_persistence_adapter.js', o.win);
    return { P: o.win.VildaPersistence, ss: o.win.sessionStorage, win: o.win };
  }

  it('migawka sesji, stan wspólny (także z force), sesje klirensu i sterydów, stan DocPro (także z force), punkty terapii', () => {
    const { P, ss } = adapter({ nieaktualny: true });
    expect(P.writeMainSession({ version: 1, name: 'Fikcyjna Druga' })).toBe(false);
    expect(P.writeShared({ name: 'Fikcyjna Druga' }, { force: true })).toBe(false);
    expect(P.writeClcrSession({ a: 1 })).toBe(false);
    expect(P.writeSteroidSession({ a: 1 })).toBe(false);
    expect(P.writeDocproUi({ version: 2 }, { force: true })).toBe(false);
    expect(P.writeModuleJSON('ghTherapyPoints', [{ id: 'gh-x1' }], { force: true })).toBe(false);
    expect(P.writeModuleJSON('OBESITY_THERAPY_POINTS', [{ id: 'ob-x1' }], { force: true })).toBe(false);
    for (const k of ['vildaMainSessionV1', 'sharedUserData', 'vildaClcrSessionV1', 'wagaiwzrost:docproUi:v2', 'ghTherapyPoints', 'OBESITY_THERAPY_POINTS']) {
      expect(ss.getItem(k), k).toBe(null);
    }
  });

  it('kontrola: aktualny dokument zapisuje jak dotąd', () => {
    const { P, ss } = adapter({ nieaktualny: false });
    expect(P.writeMainSession({ version: 1, name: 'Fikcyjny Pierwszy' })).toBe(true);
    expect(P.writeShared({ name: 'Fikcyjny Pierwszy' }, { force: true })).toBe(true);
    expect(P.writeModuleJSON('ghTherapyPoints', [{ id: 'gh-x1' }], { force: true })).toBe(true);
    expect(JSON.parse(ss.getItem('vildaMainSessionV1')).name).toBe('Fikcyjny Pierwszy');
  });

  it('wpis z lustra formularza (__vildaLustroWpis) wstrzymuje autozapis (isAutosaveSuppressed), ale nie zapis wymuszony', () => {
    const { P, win } = adapter({ nieaktualny: false });
    expect(P.isAutosaveSuppressed()).toBe(false);
    win.__vildaLustroWpis = true;
    expect(P.isAutosaveSuppressed()).toBe(true);
    expect(P.writeShared({ name: 'Fikcyjny Pierwszy' })).toBe(false);
    expect(P.writeShared({ name: 'Fikcyjny Pierwszy' }, { force: true })).toBe(true);
  });
});

/* Moduł lustra z custom-fixes.js na atrapie okna (wzór z odtworzenie-na-zywo.test.mjs). */
function lustro({ pacjentKarty = null, nieaktualny = false } = {}) {
  const src = zrodlo('custom-fixes.js');
  const i = src.indexOf('vilda-form-mirror-ping-v1');
  const start = src.lastIndexOf('(function(){', i);
  const koniec = src.indexOf('})()', i) + 4;
  const modul = src.slice(start, koniec);
  const flagiWZdarzeniu = [];
  const el = (id) => ({
    id, value: '', nasluchy: {},
    addEventListener(n, f) { (this.nasluchy[n] = this.nasluchy[n] || []).push(f); },
    dispatchEvent(ev) { flagiWZdarzeniu.push(Boolean(win.__vildaLustroWpis)); (this.nasluchy[ev.type] || []).forEach((f) => f(ev)); return true; },
  });
  const pola = {};
  ['name', 'age', 'ageMonths', 'weight', 'height', 'sex'].forEach((id) => { pola[id] = el(id); });
  const kanaly = [];
  class BC {
    constructor() { this.wyslane = []; this.nasluchy = {}; kanaly.push(this); }
    postMessage(m) { this.wyslane.push(m); }
    addEventListener(n, f) { this.nasluchy[n] = f; }
  }
  const stan = { pacjentKarty, nieaktualny };
  const win = {
    location: { pathname: '/index.html' },
    localStorage: { setItem() {}, removeItem() {} },
    sessionStorage: { getItem: (k) => (k === 'vildaTabIdV1' ? 'karta-1' : k === 'vildaCurrentPatientId' ? stan.pacjentKarty : null) },
    addEventListener() {},
    __vildaPersistRestoring: false,
    VildaPanelPacjent: { nieaktualny: () => stan.nieaktualny },
  };
  const doc = { getElementById: (id) => pola[id] || null, addEventListener() {} };
  new Function('window', 'document', 'BroadcastChannel', 'setTimeout', 'clearTimeout', 'Event', modul)(
    win, doc, BC, () => 0, () => {}, function Event(type) { this.type = type; });
  const kanal = kanaly[0];
  const odbierz = (msg) => kanal.nasluchy.message({ data: Object.assign({ sender: 'drugie-okno', tabId: 'karta-1', ts: 1 }, msg) });
  return { pola, win, kanal, odbierz, stan, flagiWZdarzeniu };
}

describe('lustro formularza (custom-fixes.js) — pacjent nadawcy i brak autozapisu z lustra', () => {
  it('ping i paczka niosą pacjenta karty z chwili wysyłki', () => {
    const { pola, kanal } = lustro({ pacjentKarty: 'pac-x' });
    pola.weight.value = '25';
    pola.weight.dispatchEvent({ type: 'input' });
    expect(kanal.wyslane.at(-1)).toMatchObject({ key: 'weight', value: '25', pacjent: 'pac-x' });
  });

  it('wiadomość z innym pacjentem niż bieżący pacjent karty jest odrzucana; ten sam pacjent przechodzi', () => {
    const { pola, odbierz } = lustro({ pacjentKarty: 'pac-y' });
    pola.name.value = 'Fikcyjny Pierwszy';
    odbierz({ type: 'bulk', pacjent: 'pac-x', fields: { name: 'Inny Pacjent', sex: 'F' } });
    odbierz({ key: 'name', value: 'Inny Pacjent', pacjent: 'pac-x' });
    expect(pola.name.value).toBe('Fikcyjny Pierwszy');
    odbierz({ type: 'bulk', pacjent: 'pac-y', fields: { weight: '36' } });
    expect(pola.weight.value).toBe('36');
  });

  it('nieaktualny dokument nie przyjmuje wpisów i nie nadaje', () => {
    const { pola, odbierz, kanal } = lustro({ pacjentKarty: 'pac-y', nieaktualny: true });
    pola.name.value = 'Fikcyjny Pierwszy';
    odbierz({ type: 'bulk', pacjent: 'pac-y', fields: { name: 'Fikcyjna Druga' } });
    expect(pola.name.value).toBe('Fikcyjny Pierwszy');
    pola.weight.value = '25';
    pola.weight.dispatchEvent({ type: 'input' });
    expect(kanal.wyslane.filter((m) => m.key === 'weight')).toHaveLength(0);
  });

  it('wiadomość bez pola pacjent (stary format) i odbiorca bez pacjenta — jak dotąd', () => {
    const { pola, odbierz } = lustro({ pacjentKarty: null });
    odbierz({ type: 'bulk', fields: { weight: '31' } });
    expect(pola.weight.value).toBe('31');
    odbierz({ type: 'bulk', pacjent: null, fields: { height: '135' } });
    expect(pola.height.value).toBe('135');
  });

  it('wpis z lustra wysyła input/change z ustawionym __vildaLustroWpis i przywraca flagę', () => {
    const { odbierz, win, flagiWZdarzeniu } = lustro({ pacjentKarty: 'pac-x' });
    odbierz({ type: 'bulk', pacjent: 'pac-x', fields: { weight: '27' } });
    expect(flagiWZdarzeniu).toEqual([true, true]);
    expect(Boolean(win.__vildaLustroWpis)).toBe(false);
  });

  it('pingi pojedynczych pól w trakcie wczytania (applyLoadedData) nie wychodzą', () => {
    const { pola, kanal, win } = lustro({ pacjentKarty: 'pac-x' });
    win.__vildaLoadInFlightUntil = Date.now() + 5000;
    pola.sex.value = 'F';
    pola.sex.dispatchEvent({ type: 'change' });
    expect(kanal.wyslane.filter((m) => m.key === 'sex')).toHaveLength(0);
    win.__vildaLoadInFlightUntil = 0;
    pola.sex.dispatchEvent({ type: 'change' });
    expect(kanal.wyslane.filter((m) => m.key === 'sex')).toHaveLength(1);
  });
});

describe('powłoka (vilda_shell.js) — nieaktualny panel jest bezczynny w tle i przeładowywany przy pokazaniu', () => {
  function atrapa(w) {
    w.vildaPersistRestoreAll = vi.fn();
    w.vildaSession = { restore: vi.fn(), saveNow: vi.fn() };
    w.vildaPersistFlushNow = vi.fn();
    w.location = { reload: vi.fn() };
    let nieaktualny = false;
    w.VildaPanelPacjent = { nieaktualny: () => nieaktualny, utrwal: vi.fn(() => nieaktualny) };
    return (v) => { nieaktualny = v; };
  }
  function przygotuj() {
    const p = powloka();
    const docpro = p.load('docpro');
    const w = docpro.contentWindow;
    const ustaw = atrapa(w);
    p.shell.navigate('terminarz');
    p.tick(50);
    p.load('terminarz');
    return { ...p, docpro, w, ustaw };
  }

  it('powłoka deklaruje protokół panelu i nie ma już zgłaszania z ramki', () => {
    const p = powloka();
    expect(p.shell.protokolPanelu).toBe(1);
    expect(p.shell.panelNieaktualny).toBeUndefined();
  });

  it('odświeżanie w tle (ping vilda:sharedLoadSeq): nieaktualny panel pominięty — bez vildaPersistRestoreAll i bez przeładowania', () => {
    const p = przygotuj();
    p.win.sessionStorage = { getItem: (k) => (k === 'vildaTabIdV1' ? 'karta-1' : null) };
    p.win.dispatchEvent({ type: 'storage', key: 'vilda:sharedLoadSeq', newValue: 'karta-1:1' });
    expect(p.w.vildaPersistRestoreAll).toHaveBeenCalledTimes(1);
    p.ustaw(true);
    const srcPrzed = p.docpro._src;
    p.win.dispatchEvent({ type: 'storage', key: 'vilda:sharedLoadSeq', newValue: 'karta-1:2' });
    p.tick(100);
    expect(p.w.vildaPersistRestoreAll).toHaveBeenCalledTimes(1);
    expect(p.w.location.reload).not.toHaveBeenCalled();
    expect(p.docpro._src).toBe(srcPrzed);
  });

  it('pokazanie nieaktualnego panelu: utrwal() i location.reload() — bez restore, bez nowego src (wpisu w historii)', () => {
    const p = przygotuj();
    p.ustaw(true);
    const srcPrzed = p.docpro._src;
    const wpisyPrzed = p.history.pushState.mock.calls.length;
    p.shell.navigate('docpro');
    p.tick(50);
    expect(p.w.VildaPanelPacjent.utrwal).toHaveBeenCalledTimes(1);
    expect(p.w.location.reload).toHaveBeenCalledTimes(1);
    expect(p.w.vildaPersistRestoreAll).not.toHaveBeenCalled();
    expect(p.w.vildaSession.restore).not.toHaveBeenCalled();
    expect(p.docpro._src).toBe(srcPrzed);
    expect(p.history.pushState.mock.calls.length).toBe(wpisyPrzed + 1); // tylko sama nawigacja #/docpro
  });

  it('kontrola: pokazanie aktualnego panelu odtwarza sesję jak dotąd, bez przeładowania', () => {
    const p = przygotuj();
    p.w.VildaPersistence = { readMainSession: () => ({ name: 'Fikcyjny Pierwszy' }) };
    p.shell.navigate('docpro');
    p.tick(50);
    expect(p.w.location.reload).not.toHaveBeenCalled();
    expect(p.w.VildaPanelPacjent.utrwal).not.toHaveBeenCalled();
  });

  it('cel trasy (Sn_target) niedoręczony staremu dokumentowi trafia do świeżego po load', () => {
    const p = przygotuj();
    p.ustaw(true);
    p.shell.navigate('docpro', true, 'docpro.html#gh=gh-y0');
    p.tick(50);
    expect(p.w.location.reload).toHaveBeenCalledTimes(1);
    expect(p.w.__events).toEqual([]);
    p.ustaw(false); // świeży dokument
    p.load('docpro');
    p.tick(50);
    expect(p.w.__events).toEqual(['/docpro.html#gh=gh-y0']);
  });

  it('„Pacjenci” przy nieaktualnym Starcie: przeładowanie nie anuluje żądania — lista otwiera się w świeżym dokumencie', () => {
    const p = powloka();
    p.shell.openPatientsInStart();
    const start = p.load('start');
    p.tick(500);
    const w = start.contentWindow;
    expect(w.VildaAuthUI.showPatientsList).toHaveBeenCalledTimes(1);
    const ustaw = atrapa(w);
    p.shell.navigate('docpro');
    p.tick(50);
    p.load('docpro');
    ustaw(true);
    p.shell.openPatientsInStart();
    p.tick(300);
    expect(w.location.reload).toHaveBeenCalledTimes(1);
    expect(w.VildaAuthUI.showPatientsList).toHaveBeenCalledTimes(1); // stary dokument nie dostaje żądania
    ustaw(false);
    p.load('start');
    p.tick(300);
    expect(w.VildaAuthUI.showPatientsList).toHaveBeenCalledTimes(2);
  });
});

/* Atrapa okna dla vilda_data_import_export.js (wzór z czyszczenie-pol-odswiezenie.test.mjs). */
function oknoFormularza(korzenStanu) {
  const pola = {};
  const pole = (id) => ({
    id, value: '', disabled: false, style: {}, dataset: {}, selectedIndex: 0, textContent: '', innerHTML: '', parentElement: null,
    classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
    dispatchEvent() { return true; }, addEventListener() {}, removeEventListener() {},
    setAttribute() {}, removeAttribute() {}, getAttribute() { return null; },
    querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; },
  });
  ['name', 'age', 'ageMonths', 'weight', 'height', 'sex', 'advBoneAge', 'advMotherHeight', 'advFatherHeight'].forEach((id) => { pola[id] = pole(id); });
  const win = {
    localStorage: magazyn(), sessionStorage: magazyn(),
    setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
    requestAnimationFrame: (f) => setTimeout(f, 0),
    location: { pathname: '/docpro.html', href: 'http://localhost/docpro.html' },
    Event: class { constructor(type) { this.type = type; } },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = (init || {}).detail; } },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    document: {
      readyState: 'complete', hidden: false, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
      getElementById: (id) => pola[id] || null, querySelector: () => null, querySelectorAll: () => [],
      body: pole('body'), documentElement: pole('html'),
    },
  };
  win.window = win; win.self = win; win.top = win; win.parent = win;
  win.VildaPersistence = {
    updateShared(fn) { fn(korzenStanu, korzenStanu._vildaPersist); return korzenStanu; },
    readShared: () => korzenStanu, writeShared: () => true, writeMainSession: () => true, readMainSession: () => null,
  };
  win.VildaPanelPacjent = { wczytanie: vi.fn(), nieaktualny: () => false, cel: (d) => d };
  loadBrowserScript('vilda_data_import_export.js', win);
  return win;
}

const korzenX = () => ({
  name: 'Fikcyjny Pierwszy', advBoneAge: '10.5', advMotherHeight: '158', advFatherHeight: '171',
  _vildaPersist: {
    v: 1, byId: {},
    globals: {
      foodRows: [{ key: 'chleb', qty: '2' }], intakeRowsUI: [{ ageY: '9' }], intakeHistory: [{ ageY: 9 }],
      intakeEstimatedKcalPerDay: 1500, basicGrowthData: { measurements: [{ age: 8 }] },
      advancedGrowthData: { measurements: [{ age: 8 }] }, advancedGrowthRowsUI: [{ age: '8' }],
      ghTherapyPoints: [{ id: 'gh-x1' }], loadedComparisonData: { name: 'Fikcyjny Pierwszy' },
      hasUserModifiedAfterLoad: true, boneAgeContext: { version: 1 }, chartCreatorData: { wykres: 1 },
    },
  },
});

describe('wczytanie innego pacjenta (applyLoadedData) — stan wspólny bez resztek poprzedniego', () => {
  it('czyści globals pacjenta w korzeniu (kanał 8b), zostawia ustawienia nie-pacjenta; wiek kostny i rodzice z rekordu bez sekcji advanced = ""', () => {
    const korzen = korzenX();
    const win = oknoFormularza(korzen);
    expect(win.applyLoadedData({ name: 'Fikcyjna Druga', user: { age: 9, sex: 'F', weight: 30, height: 130 } })).toBe(true);
    expect(Object.keys(korzen._vildaPersist.globals)).toEqual(['chartCreatorData']);
    expect(korzen.advBoneAge).toBe('');
    expect(korzen.advMotherHeight).toBe('');
    expect(korzen.advFatherHeight).toBe('');
    expect(korzen.name).toBe('Fikcyjna Druga');
  });

  it('początek własnego wczytania zgłasza się modułowi panelu (VildaPanelPacjent.wczytanie); odtworzenie sesji — nie', () => {
    const win = oknoFormularza(korzenX());
    win.applyLoadedData({ name: 'Fikcyjna Druga', user: { age: 9, sex: 'F' } }, { isSessionRestore: true });
    expect(win.VildaPanelPacjent.wczytanie).not.toHaveBeenCalled();
    win.applyLoadedData({ name: 'Fikcyjna Druga', user: { age: 9, sex: 'F' } });
    expect(win.VildaPanelPacjent.wczytanie).toHaveBeenCalledTimes(1);
  });
});

describe('zapis do sejfu z nieaktualnego dokumentu (BdupId) celuje w pacjenta, którego dane dokument trzyma', () => {
  function wytnij(src, nazwa) {
    const i = src.indexOf(`function ${nazwa}(`);
    let d = 0;
    for (let k = src.indexOf('{', i); k < src.length; k += 1) {
      if (src[k] === '{') d += 1;
      else if (src[k] === '}') { d -= 1; if (d === 0) return src.slice(i, k + 1); }
    }
    return null;
  }
  const src = zrodlo('vilda_data_import_export.js');
  const BdupId = new Function(`${wytnij(src, 'BdupNazwa')}\n${wytnij(src, 'BdupId')}\nreturn BdupId;`)();
  // Normalizacja nazwiska pochodzi z sejfu — jego funkcja, nie kopia reguły.
  const Ne = new Function(`${wytnij(zrodlo('vilda_vault.js'), 'Ne')}\nreturn Ne;`)();
  const okn = (panel) => ({
    VildaVault: { normalizePatientName: Ne },
    lastLoadedData: { name: 'Fikcyjny Pierwszy' },
    sessionStorage: { getItem: (k) => (k === 'vildaCurrentPatientId' ? 'pac-y' : null) },
    VildaPanelPacjent: panel,
  });

  it('aktualny dokument: pacjent karty; nieaktualny: właściciel X; nieaktualny z nowym pacjentem: brak (nowy rekord)', () => {
    expect(BdupId({ name: 'Fikcyjny Pierwszy' }, okn({ cel: (d) => d }))).toBe('pac-y');
    expect(BdupId({ name: 'Fikcyjny Pierwszy' }, okn({ cel: () => 'pac-x' }))).toBe('pac-x');
    expect(BdupId({ name: 'Fikcyjny Pierwszy' }, okn({ cel: () => null }))).toBe(null);
  });
});

describe('strażnik niezapisanych zmian — nieaktualny dokument nie zatrzymuje przeładowania natywnym oknem', () => {
  function straznik(nieaktualny) {
    const win = {
      document: { readyState: 'complete', addEventListener() {}, getElementById: () => null, head: { appendChild() {} }, createElement: () => ({}) },
      addEventListener() {},
      VildaSaveStatusIndicator: { getState: () => 'dirty' },
      VildaPanelPacjent: { nieaktualny: () => nieaktualny },
    };
    loadBrowserScript('vilda_unsaved_guard.js', win);
    return win.VildaUnsavedGuard;
  }

  it('niezapisane zmiany w aktualnym dokumencie: pytanie jak dotąd; w nieaktualnym: bez pytania', () => {
    const e1 = { preventDefault: vi.fn() };
    straznik(false)._onBeforeUnload(e1);
    expect(e1.preventDefault).toHaveBeenCalled();
    const e2 = { preventDefault: vi.fn() };
    straznik(true)._onBeforeUnload(e2);
    expect(e2.preventDefault).not.toHaveBeenCalled();
    expect(e2.returnValue).toBeUndefined();
  });
});
