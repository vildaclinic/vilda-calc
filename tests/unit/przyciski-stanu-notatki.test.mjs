import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// E3-PR0b2a — przyciski stanu notatki („wykonane”, „nie zgłosił się”, „cofnij wykonanie”,
// „przełóż”) nie wysyłają treści odczytanej przed blokadą notatki.
//
// Przycisk czyta notatkę (getPatientNote), a potem zapisuje ją pod blokadą notatki. Dotąd
// przenosił do zapisu tytuł, treść, kategorię, termin i wiek wizyty z tego wcześniejszego
// odczytu. Gdy w tym oknie scalenie z innego urządzenia zapisało nowszą treść, przycisk ją
// cofał; gdy w tym oknie notatkę usunięto, przycisk ją wskrzeszał starą treścią; przy
// nieczytelnym szyfrogramie zapisywał tytuł zastępczy „(błąd odczytu)” w miejsce oryginału.
// Teraz przycisk wysyła tylko identyfikator, kartę i stan, a resztę sejf bierze z wersji
// zapisanej, odczytanej już pod blokadą. Opis: docs/clinical/ALGORITHMS.md (E3-PR0b2a).
//
// Notatka usunięta w tym oknie albo nieczytelna (także wpis Terminarza bez pacjenta, dla
// którego nie działa bramka „tytuł albo treść”): zapis się nie odbywa, a błąd jest zdaniem
// dla lekarza — Przypomnienia i Terminarz pokazują go w oknie „Nie udało się …: <komunikat>”.
//
// Dane fikcyjne. Prawdziwy vilda_crypto.js + vilda_vault.js na adapterze pamięciowym. Okno
// między odczytem przycisku a blokadą odtwarzamy, wstrzymując operację magazynu WEWNĄTRZ
// blokady (zapis scalenia albo usunięcie) — tak jak tests/unit/klirens-existing-note-update-vault.test.mjs.

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

let licznik = 0;
async function sejf() {
  licznik += 1;
  const win = {
    crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: magazyn(), sessionStorage: magazyn(),
    setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
    addEventListener() {}, removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {}, hidden: false },
  };
  win.window = win; win.self = win; win.top = win;
  loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_vault.js', win);
  const vault = win.VildaVault, adapter = vault.createInMemoryAdapter();
  vault.setStorageAdapter(adapter);
  await vault.createUser(`Fikcyjne#Przyciski!${licznik}`, { label: `Fikcyjny sejf przycisków ${licznik}`, iterations: 10000 });
  return { vault, adapter, uid: vault.getCurrentUser().userId };
}

let teraz = Date.parse('2026-11-16T09:00:00.000Z');
const krok = (ms = 60e3) => { teraz += ms; vi.setSystemTime(teraz); };
const kopia = (x) => JSON.parse(JSON.stringify(x));
const odczekaj = (ms) => new Promise((r) => { setTimeout(r, ms); });
afterEach(() => { vi.useRealTimers(); });

const NOWY_TERMIN = '2026-12-24';
const PRZYCISKI = [
  {
    nazwa: 'wykonane', klik: (v, id) => v.completePatientNote(id),
    stan: (n) => { expect(n.completedAtISO).toBeTruthy(); expect(n.noShowAtISO).toBeNull(); },
  },
  {
    nazwa: 'nie zgłosił się', klik: (v, id) => v.noShowPatientNote(id),
    stan: (n) => { expect(n.noShowAtISO).toBeTruthy(); expect(n.completedAtISO).toBeNull(); },
  },
  {
    nazwa: 'cofnij wykonanie', klik: (v, id) => v.uncompletePatientNote(id), najpierwWykonana: true,
    stan: (n) => { expect(n.completedAtISO).toBeNull(); expect(n.noShowAtISO).toBeNull(); },
  },
  {
    nazwa: 'przełóż', klik: (v, id) => v.snoozePatientNote(id, NOWY_TERMIN), termin: NOWY_TERMIN,
    stan: (n) => { expect(n.completedAtISO).toBeNull(); expect(n.noShowAtISO).toBeNull(); },
  },
];

const POCZATKOWA = { title: 'Fikcyjna kontrola', body: 'Baza.', category: 'followup', dueDateISO: '2026-11-20', linkedAgeMonths: 108 };
// „savePatientNote: …”, „completePatientNote: …” — nazwa funkcji z dwukropkiem nic lekarzowi nie mówi.
const TECHNICZNY_PREFIKS = /^[A-Za-z_$][A-Za-z0-9_$]*:\s/;

async function jednoUrzadzenie(przycisk) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(teraz);
  const A = await sejf();
  const p = await A.vault.savePatient({ name: 'Fikcyjny Pacjent Przyciski', user: { sex: 'M', age: 9, height: 132, weight: 29 } });
  krok();
  const { id } = await A.vault.savePatientNote({ patientId: p.patientId, ...POCZATKOWA });
  if (przycisk && przycisk.najpierwWykonana) { krok(); await A.vault.completePatientNote(id); }
  krok();
  return { A, patientId: p.patientId, id };
}

// Wstrzymuje jedną operację magazynu dla tej notatki — wywołaną już pod blokadą notatki.
// `odczytPrzycisku` spełnia się przy pierwszym odczycie tej notatki w czasie wstrzymania
// (odczyt przycisku sprzed blokady).
function wstrzymaj(adapter, metoda, id) {
  const oryginal = adapter[metoda].bind(adapter), odczyt = adapter.getPatientNoteForUser.bind(adapter);
  let wszedl, zwolnij, wstrzymane = false, odczytany;
  const weszlo = new Promise((r) => { wszedl = r; }), puszczone = new Promise((r) => { zwolnij = r; });
  const odczytPrzycisku = new Promise((r) => { odczytany = r; });
  // putPatientNoteForUser(user, rekord) albo removePatientNoteForUser(user, id).
  const tejNotatki = (cel) => cel === id || Boolean(cel && cel.id === id);
  adapter[metoda] = async function (...args) {
    if (!wstrzymane && tejNotatki(args[1])) { wstrzymane = true; wszedl(); await puszczone; }
    return oryginal(...args);
  };
  adapter.getPatientNoteForUser = async function (...args) {
    const wynik = await odczyt(...args);
    if (wstrzymane && args[1] === id) odczytany();
    return wynik;
  };
  return { weszlo, odczytPrzycisku, zwolnij: () => zwolnij() };
}

// Klik w czasie wstrzymania: czekamy na odczyt przycisku (sprzed blokady) i chwilę na
// odszyfrowanie, żeby przycisk stał już w kolejce do blokady, a dopiero potem zwalniamy.
// Obietnica kliku wraca w obiekcie — sama czeka na blokadę, czyli na zwolnienie.
async function kliknijWOknie(przycisk, A, id, brama) {
  await brama.weszlo;
  const klik = przycisk.klik(A.vault, id).then((w) => ({ ok: true, w }), (e) => ({ ok: false, blad: e }));
  await brama.odczytPrzycisku;
  await odczekaj(50);
  return { klik };
}

describe('E3-PR0b2a — przyciski stanu nie cofają treści zapisanej w oknie przed blokadą', () => {
  it.each(PRZYCISKI.map((p) => [p.nazwa, p]))('„%s”: scalenie z innego urządzenia zapisało nową treść między odczytem przycisku a blokadą', async (_nazwa, przycisk) => {
    const s = await jednoUrzadzenie(przycisk);
    const B = await sejf();
    await B.vault.mergeSyncPayload(kopia(await s.A.vault.exportSyncPayload()));
    krok(5000);
    const zmianaB = { title: 'Fikcyjna kontrola dawki', body: 'Drugie urządzenie: dawka 75 od jutra.', category: 'reminder-exam', linkedAgeMonths: 110 };
    if (!przycisk.termin) zmianaB.dueDateISO = '2026-12-10';
    await B.vault.savePatientNote({ id: s.id, patientId: s.patientId, ...zmianaB });
    const wersjaB = await B.vault.getPatientNote(s.id);
    const ladunek = kopia(await B.vault.exportSyncPayload());
    krok(1000);

    const brama = wstrzymaj(s.A.adapter, 'putPatientNoteForUser', s.id);
    const scalenie = s.A.vault.mergeSyncPayload(ladunek);
    const { klik } = await kliknijWOknie(przycisk, s.A, s.id, brama);
    brama.zwolnij();
    await scalenie;
    const wynik = await klik;
    expect(wynik.blad, 'przycisk zapisuje bez błędu').toBeUndefined();

    const koniec = await s.A.vault.getPatientNote(s.id);
    expect(koniec.title, 'tytuł z drugiego urządzenia zostaje').toBe(zmianaB.title);
    expect(koniec.body, 'treść z drugiego urządzenia zostaje').toBe(zmianaB.body);
    expect(koniec.category).toBe(zmianaB.category);
    expect(koniec.linkedAgeMonths, 'wiek wizyty z drugiego urządzenia zostaje').toBe(110);
    expect(koniec.dueDateISO).toContain(przycisk.termin || '2026-12-10');
    przycisk.stan(koniec);
    expect(koniec.rev).toBe(wersjaB.rev + 1);
  });

  it.each(PRZYCISKI.map((p) => [p.nazwa, p]))('„%s”: notatka usunięta między odczytem przycisku a blokadą nie wraca starą treścią', async (_nazwa, przycisk) => {
    const s = await jednoUrzadzenie(przycisk);
    const brama = wstrzymaj(s.A.adapter, 'removePatientNoteForUser', s.id);
    const usuniecie = s.A.vault.removePatientNote(s.id);
    const { klik } = await kliknijWOknie(przycisk, s.A, s.id, brama);
    brama.zwolnij();
    await usuniecie;
    const wynik = await klik;

    expect(wynik.ok, 'przycisk kończy się błędem zamiast wskrzesić notatkę').toBe(false);
    const komunikat = String(wynik.blad && wynik.blad.message);
    expect(komunikat, 'lekarz czyta, co się stało i co zrobić')
      .toBe('Ta notatka już nie istnieje — została w międzyczasie usunięta (w innej karcie albo na innym urządzeniu). Nic nie zapisano; odśwież listę.');
    expect(komunikat, 'bez technicznego prefiksu nazwy funkcji').not.toMatch(TECHNICZNY_PREFIKS);
    expect(await s.A.vault.getPatientNote(s.id), 'notatka zostaje usunięta').toBeNull();
    expect((await s.A.adapter.listPatientNoteTombstonesForUser(s.A.uid)).map((n) => n.id), 'nagrobek zostaje').toContain(s.id);
  });

  // Wpis Terminarza bez pacjenta (ACTIVITY_PATIENT_ID) omija bramkę „tytuł albo treść”, więc przy
  // nieczytelnym szyfrogramie zapis samego stanu podmieniał oryginał na pusty tytuł i treść.
  const RODZAJE = [
    ['notatka pacjenta', (s) => s.patientId],
    ['wpis Terminarza bez pacjenta', (s) => s.A.vault.ACTIVITY_PATIENT_ID],
  ];
  it.each(RODZAJE.flatMap(([rodzaj, karta]) => PRZYCISKI.map((p) => [p.nazwa, rodzaj, p, karta])))('„%s” na nieczytelnym szyfrogramie (%s): odmowa ze zrozumiałym komunikatem, oryginał zostaje', async (_nazwa, _rodzaj, przycisk, karta) => {
    const s = await jednoUrzadzenie();
    const patientId = karta(s);
    expect(typeof patientId).toBe('string');
    const { id } = await s.A.vault.savePatientNote({ patientId, ...POCZATKOWA });
    if (przycisk.najpierwWykonana) { krok(); await s.A.vault.completePatientNote(id); }
    krok();
    const zapisana = await s.A.adapter.getPatientNoteForUser(s.A.uid, id);
    const uszkodzona = { ...zapisana, bodyCipher: { ...zapisana.bodyCipher, data: zapisana.bodyCipher.data.split('').reverse().join('') } };
    await s.A.adapter.putPatientNoteForUser(s.A.uid, uszkodzona);
    expect((await s.A.vault.getPatientNote(id)).title, 'odczyt nie‑ścisły podstawia tytuł zastępczy').toBe('(błąd odczytu)');

    const wynik = await przycisk.klik(s.A.vault, id).then((w) => ({ ok: true, w }), (e) => ({ ok: false, blad: e }));

    expect(wynik.ok, 'zapis samego stanu nie może podmienić nieczytelnej treści').toBe(false);
    const komunikat = String(wynik.blad && wynik.blad.message);
    expect(komunikat).toBe('Nie można odczytać zapisanej treści tej notatki — nic nie zapisano, notatka zostaje bez zmian.');
    expect(komunikat).not.toMatch(TECHNICZNY_PREFIKS);
    const po = await s.A.adapter.getPatientNoteForUser(s.A.uid, id);
    expect(po, 'oryginalny szyfrogram, stan, termin i wersja zostają').toEqual(uszkodzona);
  });

  it('kontrola: zapis z tytułem i treścią (edytor) na nieczytelnym szyfrogramie nadal zapisuje — odmowa dotyczy tylko zapisu samego stanu', async () => {
    // Lekarz, który świadomie wpisuje nową treść w miejsce nieczytelnej, robi to jak dotąd.
    const s = await jednoUrzadzenie();
    const zapisana = await s.A.adapter.getPatientNoteForUser(s.A.uid, s.id);
    await s.A.adapter.putPatientNoteForUser(s.A.uid, { ...zapisana, bodyCipher: { ...zapisana.bodyCipher, data: zapisana.bodyCipher.data.split('').reverse().join('') } });

    await s.A.vault.savePatientNote({ id: s.id, patientId: s.patientId, title: 'Fikcyjna kontrola', body: 'Treść wpisana od nowa.' });

    expect(await s.A.vault.getPatientNote(s.id)).toMatchObject({ title: 'Fikcyjna kontrola', body: 'Treść wpisana od nowa.', rev: zapisana.rev + 1 });
  });

  it.each(PRZYCISKI.map((p) => [p.nazwa, p]))('„%s” bez wyścigu: tytuł, treść, kategoria, termin i wiek wizyty bez zmian, stan ustawiony', async (_nazwa, przycisk) => {
    const s = await jednoUrzadzenie(przycisk);
    const przed = await s.A.vault.getPatientNote(s.id);

    await przycisk.klik(s.A.vault, s.id);

    const koniec = await s.A.vault.getPatientNote(s.id);
    expect(koniec).toMatchObject({ title: POCZATKOWA.title, body: POCZATKOWA.body, category: POCZATKOWA.category, linkedAgeMonths: 108, patientId: s.patientId, createdAtISO: przed.createdAtISO });
    expect(koniec.dueDateISO).toContain(przycisk.termin || '2026-11-20');
    przycisk.stan(koniec);
    expect(koniec.rev).toBe(przed.rev + 1);
  });
});
