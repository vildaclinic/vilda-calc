import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { zaladuj221, zaladuj276, zaladujRetencjeV1 } from '../support/starsza-aplikacja.mjs';

// E3-PR0b2b (P-NOTATKA-POZNIEJSZA) — notatka pacjenta zmieniona na dwóch urządzeniach: zostaje zmiana późniejsza.
//
// Dotąd scalanie notatek (Le, a za nim podgląd „Scal kopię konta”) wybierało wersję „najpierw rev, przy równym rev
// późniejsza chwila zapisu”: dwie poprawki na jednym urządzeniu wygrywały z jedną późniejszą poprawką na drugim, więc
// późniejsza zmiana ginęła po cichu (dawka, termin, wynik). Decyzja właściciela z 2026-11-16 (plan synchronizacji,
// rozdział 6): wygrywa późniejsza zmiana treści, a oznaczenie „wykonane”, „nie zgłosił się” i jego cofnięcie ma własną
// chwilę — treść według chwili zmiany treści, oznaczenie według chwili zmiany oznaczenia; reguła wchodzi od razu.
//
// Ten plik sprawdza samą regułę na prawdziwym sejfie: porządek po chwili treści (pole contentAtISO z kotwicą
// contentForISO === updatedAtISO, inaczej chwila zapisu), potem rev, potem chwila zapisu; rev po scaleniu zawsze
// najwyższy z obu wersji; plany opieki i listy pacjentów — dawna reguła; zapisy techniczne (ratunek D-21, import karty)
// zachowują chwilę treści; stempel zapisu (D-7) obcięty na końcu roku 9999; oznaczenie z wersji o późniejszej chwili
// oznaczenia, a rekord złożony z treści jednej wersji i oznaczenia drugiej dostaje chwilę zapisu o 1 ms późniejszą niż
// obie. Zapis z edytora, przeniesienie przy „Scal pacjentów” i „ta sama widoczna wersja” — notatka-pozniejsza-zapis.
// Opis i uzasadnienie: docs/clinical/ALGORITHMS.md (P-NOTATKA-POZNIEJSZA).
//
// Dane wyłącznie fikcyjne. Prawdziwy vilda_crypto.js + vilda_vault.js na adapterze pamięciowym, kilka urządzeń,
// podstawiony zegar Date (chwile zapisu rozróżnialne i powtarzalne), Math.random ustalony tam, gdzie liczy się stempel.
// Przypadki oznaczone „[kontrola]” mają ten sam wynik przed zmianą i po niej (pilnują, czego reguła nie zmienia).

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PLIKI = ['vilda_crypto.js', 'vilda_vault.js'];
const PLIKI_RATUNKU = ['vilda_crypto.js', 'vilda_retention.js', 'vilda_vault.js'];
const RETENCJA = { vildaRetention: '0' };
const MIN = 60e3;

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

// starsza — '221' albo '276': urządzenie ze starszą aplikacją z fikstur (ucina pola chwil, dawna reguła).
function urzadzenie(pliki, ustawienia = {}, starsza = null) {
  const win = {
    crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: magazyn(), sessionStorage: magazyn(),
    setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
    addEventListener() {}, removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {}, hidden: false },
  };
  win.window = win; win.self = win; win.top = win;
  for (const [klucz, wartosc] of Object.entries(ustawienia)) win.localStorage.setItem(klucz, wartosc);
  if (starsza) {
    loadBrowserScript('vilda_crypto.js', win);
    zaladujRetencjeV1(win);
    (starsza === '221' ? zaladuj221 : zaladuj276)(win);
  } else for (const plik of pliki) loadBrowserScript(plik, win);
  const vault = win.VildaVault, adapter = vault.createInMemoryAdapter();
  vault.setStorageAdapter(adapter);
  // Licznik zapisów rekordów notatek (bez zapisu = bez zmiany w magazynie).
  const put = adapter.putPatientNoteForUser.bind(adapter);
  const d = { win, vault, adapter, zapisy: 0 };
  adapter.putPatientNoteForUser = async (...a) => { d.zapisy += 1; return put(...a); };
  return d;
}

let licznik = 0;
async function sejf(nazwa, { pliki = PLIKI, ustawienia = {}, starsza = null } = {}) {
  licznik += 1;
  const d = urzadzenie(pliki, ustawienia, starsza);
  d.haslo = `Fikcyjne#Pozniej!${licznik}`;
  await d.vault.createUser(d.haslo, { label: `Fikcyjny sejf ${nazwa} ${licznik}`, iterations: 10000 });
  d.uid = d.vault.getCurrentUser().userId;
  d.nazwa = nazwa;
  return d;
}

const START = Date.parse('2026-11-16T08:00:00.000Z');
let teraz = START;
const ustaw = (ms) => { teraz = ms; vi.setSystemTime(teraz); };
const krok = (ms = MIN) => ustaw(teraz + ms);
const iso = (ms) => new Date(ms).toISOString();
const kopia = (x) => JSON.parse(JSON.stringify(x));
// Zegar urządzenia przesunięty względem wspólnego: operacja przy teraz + przesuniecie, potem powrót.
async function zZegarem(przesuniecie, fn) {
  vi.setSystemTime(teraz + przesuniecie);
  try { return await fn(); } finally { vi.setSystemTime(teraz); }
}
const losowo = (r) => vi.spyOn(Math, 'random').mockReturnValue(r);

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); ustaw(START); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

async function wyslij(zrodlo, cel, przerob) {
  let ladunek = kopia(await zrodlo.vault.exportSyncPayload());
  if (przerob) ladunek = przerob(ladunek) || ladunek;
  krok(1000);
  return cel.vault.mergeSyncPayload(ladunek);
}
// Pełna wymiana każdy z każdym (obie strony).
async function wymiana(s) { for (const X of s.urz) for (const Y of s.urz) if (X !== Y) await wyslij(X, Y); }
// Pierścień pełnych kopii w podanej kolejności, dwa obiegi (każde urządzenie dostaje wszystko).
async function pierscien(kolejnosc) {
  for (let r = 0; r < 2; r += 1) for (let i = 0; i < kolejnosc.length; i += 1) await wyslij(kolejnosc[i], kolejnosc[(i + 1) % kolejnosc.length]);
}
const PERMUTACJE = ['ABC', 'ACB', 'BAC', 'BCA', 'CAB', 'CBA'];

const PACJENTKA = { name: 'Fikcyjna Pacjentka Później', user: { sex: 'F', age: 9, height: 130, weight: 28 } };
async function swiat(nazwy = ['A', 'B'], notatka = {}, opcje = {}) {
  const s = { urz: [] };
  for (const n of nazwy) { s[n] = await sejf(n, opcje); s.urz.push(s[n]); }
  const A = s.urz[0];
  krok(); s.patientId = (await A.vault.savePatient(PACJENTKA, { dedup: false })).patientId;
  krok(); s.id = (await A.vault.savePatientNote({ patientId: s.patientId, title: 'Fikcyjna wizyta', body: 'Fikcyjna treść bazowa.', category: 'observation', ...notatka })).id;
  krok();
  for (const U of s.urz.slice(1)) await wyslij(A, U);
  krok();
  return s;
}
const zmien = (s, U, body, ms = MIN, extra = {}) => { krok(ms); return U.vault.savePatientNote({ patientId: s.patientId, id: s.id, title: 'Fikcyjna wizyta', body, category: 'observation', ...extra }); };
const OZNACZ = { wykonane: 'completePatientNote', 'nie zgłosił się': 'noShowPatientNote', cofnij: 'uncompletePatientNote' };
const oznacz = (s, U, akcja, ms = MIN) => { krok(ms); return U.vault[OZNACZ[akcja]](s.id); };
const stan = async (U, id) => {
  const n = await U.vault.getPatientNote(id);
  return n ? { body: n.body, rev: n.rev, wykonane: !!n.completedAtISO, nieZglosil: !!n.noShowAtISO } : null;
};
async function stany(s, id = s.id) { const o = {}; for (const U of s.urz) o[U.nazwa] = await stan(U, id); return o; }
const wszedzie = (s, v) => Object.fromEntries(s.urz.map((U) => [U.nazwa, v]));
const otwarta = (body, rev) => ({ body, rev, wykonane: false, nieZglosil: false });
const zapisana = (U, id) => U.adapter.getPatientNoteForUser(U.uid, id);
async function rekordy(s, id = s.id) { const o = {}; for (const U of s.urz) o[U.nazwa] = await zapisana(U, id); return o; }
// Druga wymiana po zbieżności niczego nie zapisuje (bez cyklu).
async function bezZmianPoKolejnejWymianie(s) {
  const przed = await rekordy(s);
  for (const U of s.urz) U.zapisy = 0;
  await wymiana(s);
  expect(Object.fromEntries(s.urz.map((U) => [U.nazwa, U.zapisy])), 'kolejna wymiana bez zapisów notatki').toEqual(wszedzie(s, 0));
  expect(await rekordy(s), 'rekordy bez zmian po kolejnej wymianie').toEqual(przed);
}
// Wersja z ładunku przerobiona po id (pola jawne rekordu; treść szyfrowana bez zmian).
const przerobNotatke = (id, fn) => (l) => { l.patientNotes = l.patientNotes.map((n) => (n.id === id ? fn({ ...n }) : n)); return l; };

describe('E3-PR0b2b — notatka zmieniona na dwóch urządzeniach: zostaje zmiana późniejsza', () => {
  it('A zapisuje dwa razy, B raz pięć sekund później: po wymianie na obu zostaje zmiana B, rev 3 (najwyższy)', async () => {
    const s = await swiat();
    await zmien(s, s.A, 'A: TSH 4,1.');
    await zmien(s, s.A, 'A: TSH 4,1 mIU/l, kontrola za 6 tygodni.');
    await zmien(s, s.B, 'B: lewotyroksyna 50 µg od jutra.', 5e3);
    krok();
    await wymiana(s);
    expect(await stany(s), 'późniejsza zmiana B nie ginie; rev to najwyższy z obu wersji').toEqual(wszedzie(s, otwarta('B: lewotyroksyna 50 µg od jutra.', 3)));
    await bezZmianPoKolejnejWymianie(s);
  });

  it('B zapisuje dwa razy, A raz później: na obu zostaje zmiana A, rev 3', async () => {
    const s = await swiat();
    await zmien(s, s.B, 'B: pierwsza poprawka bez sieci.');
    await zmien(s, s.B, 'B: druga poprawka bez sieci.');
    await zmien(s, s.A, 'A: dawka 75 od jutra (później).', 5e3);
    krok();
    await wymiana(s);
    expect(await stany(s)).toEqual(wszedzie(s, otwarta('A: dawka 75 od jutra (później).', 3)));
    await bezZmianPoKolejnejWymianie(s);
  });

  it.each(PERMUTACJE)('trzy urządzenia (A dwa razy, B trzy razy, C raz najpóźniej), pierścień pełnych kopii %s, dwa obiegi: wszędzie zmiana C, rev 4', async (kol) => {
    const s = await swiat(['A', 'B', 'C']);
    await zmien(s, s.A, 'A1.'); await zmien(s, s.A, 'A2.');
    await zmien(s, s.B, 'B1.'); await zmien(s, s.B, 'B2.'); await zmien(s, s.B, 'B3.');
    await zmien(s, s.C, 'C1: najpóźniejsza zmiana.', 5e3);
    krok();
    await pierscien(kol.split('').map((n) => s[n]));
    expect(await stany(s), `kolejność ${kol}`).toEqual(wszedzie(s, otwarta('C1: najpóźniejsza zmiana.', 4)));
  });

  it('druga strona reguły (skutek do odbioru): laptop trzy razy zapisuje pełny opis wizyty, telefon pięć sekund później poprawia literówkę w starej wersji — wszędzie wersja telefonu', async () => {
    const s = await swiat(['laptop', 'telefon']);
    await zmien(s, s.laptop, 'Wizyta: wzrost 131 cm.');
    await zmien(s, s.laptop, 'Wizyta: wzrost 131 cm, masa 28 kg.');
    await zmien(s, s.laptop, 'Wizyta: wzrost 131 cm, masa 28 kg. Zmiana dawki: 0,9 mg na dobę od poniedziałku.');
    await zmien(s, s.telefon, 'Fikcyjna treść bazowa (poprawiona literówka).', 5e3);
    krok();
    await wymiana(s);
    expect(await stany(s), 'pełniejsza, wcześniejsza wersja przegrywa z późniejszą małą zmianą')
      .toEqual(wszedzie(s, otwarta('Fikcyjna treść bazowa (poprawiona literówka).', 4)));
  });

  it('[kontrola] ta sama milisekunda zapisu na obu urządzeniach: wygrywa wyższy rev (A dwa razy, B raz)', async () => {
    const s = await swiat();
    await zmien(s, s.A, 'A1.');
    await zmien(s, s.A, 'A2 (ta sama chwila co B).');
    const chwila = teraz;
    await s.B.vault.savePatientNote({ patientId: s.patientId, id: s.id, title: 'Fikcyjna wizyta', body: 'B1 (ta sama chwila co A2).', category: 'observation' });
    expect((await zapisana(s.B, s.id)).updatedAtISO).toBe(iso(chwila));
    expect((await zapisana(s.A, s.id)).updatedAtISO).toBe(iso(chwila));
    await wymiana(s);
    expect(await stany(s)).toEqual(wszedzie(s, otwarta('A2 (ta sama chwila co B).', 3)));
  });

  it('[kontrola] ten sam ładunek dwa razy i starsza kopia po nowszej: bez zapisu notatki', async () => {
    const s = await swiat();
    await zmien(s, s.A, 'A1.');
    const stary = kopia(await s.A.vault.exportSyncPayload());
    await zmien(s, s.A, 'A2.');
    const nowy = kopia(await s.A.vault.exportSyncPayload());
    await s.B.vault.mergeSyncPayload(kopia(nowy));
    s.B.zapisy = 0;
    krok(); await s.B.vault.mergeSyncPayload(kopia(nowy));
    krok(); await s.B.vault.mergeSyncPayload(kopia(stary));
    expect(s.B.zapisy, 'ponowiony i starszy ładunek nie zapisują notatki').toBe(0);
    expect(await stan(s.B, s.id)).toEqual(otwarta('A2.', 3));
  });

  it('[kontrola] wersja z ładunku bez chwili zapisu jest pomijana', async () => {
    const s = await swiat();
    await zmien(s, s.A, 'A: późniejsza treść bez chwili zapisu w ładunku.');
    await wyslij(s.A, s.B, przerobNotatke(s.id, (n) => { delete n.updatedAtISO; n.rev = 9; return n; }));
    expect(await stan(s.B, s.id)).toEqual(otwarta('Fikcyjna treść bazowa.', 1));
  });

  it('tutejsza wersja bez chwili zapisu (stary zapis) przegrywa z treścią z ładunku, a rev zostaje najwyższy', async () => {
    const s = await swiat();
    const r = await zapisana(s.B, s.id);
    const bez = { ...r, rev: 5 }; delete bez.updatedAtISO;
    await s.B.adapter.putPatientNoteForUser(s.B.uid, bez);
    await zmien(s, s.A, 'A: treść z chwilą zapisu.');
    await wyslij(s.A, s.B);
    expect(await stan(s.B, s.id)).toEqual(otwarta('A: treść z chwilą zapisu.', 5));
  });

  it('wersja z ładunku bez rev, ale z późniejszą zmianą treści, wygrywa; rev po scaleniu to najwyższy z obu (tutejszy)', async () => {
    const s = await swiat();
    await zmien(s, s.A, 'A: późniejsza treść, ładunek bez rev.');
    await wyslij(s.A, s.B, przerobNotatke(s.id, (n) => { delete n.rev; return n; }));
    expect(await stan(s.B, s.id)).toEqual(otwarta('A: późniejsza treść, ładunek bez rev.', 1));
  });
});

describe('E3-PR0b2b — zegary urządzeń i stempel zapisu', () => {
  it('[kontrola] urządzenie z zegarem 10 min do tyłu poprawia wersję, którą zna: poprawka zostaje na obu', async () => {
    losowo(0.5);
    const s = await swiat();
    await zmien(s, s.A, 'A: wersja X.');
    await wyslij(s.A, s.B);
    krok();
    await zZegarem(-10 * MIN, () => s.B.vault.savePatientNote({ patientId: s.patientId, id: s.id, title: 'Fikcyjna wizyta', body: 'B: poprawka wersji X.', category: 'observation' }));
    await wymiana(s);
    expect(await stany(s)).toEqual(wszedzie(s, otwarta('B: poprawka wersji X.', 3)));
  });

  it('[kontrola] A z zegarem 10 min do przodu zapisuje X, B poprawia X: poprawka zostaje na obu', async () => {
    losowo(0.5);
    const s = await swiat();
    krok();
    await zZegarem(10 * MIN, () => s.A.vault.savePatientNote({ patientId: s.patientId, id: s.id, title: 'Fikcyjna wizyta', body: 'A: wersja X z zegara do przodu.', category: 'observation' }));
    await wyslij(s.A, s.B);
    await zmien(s, s.B, 'B: poprawka X.');
    await wymiana(s);
    expect(await stany(s)).toEqual(wszedzie(s, otwarta('B: poprawka X.', 3)));
  });

  it('[kontrola, znane ograniczenie] A z zegarem 10 min do przodu i B pięć minut później, równolegle: zostaje X z A', async () => {
    const s = await swiat();
    krok();
    await zZegarem(10 * MIN, () => s.A.vault.savePatientNote({ patientId: s.patientId, id: s.id, title: 'Fikcyjna wizyta', body: 'A: lek X (zegar do przodu).', category: 'observation' }));
    await zmien(s, s.B, 'B: lek Y (naprawdę później).', 5 * MIN);
    await wymiana(s);
    expect(await stany(s)).toEqual(wszedzie(s, otwarta('A: lek X (zegar do przodu).', 2)));
  });

  it('stempel w oknie rozjazdu zegarów: B i C poprawiają X z zegara do przodu; poprawka z późniejszym stemplem (los 0,9 wobec 0,1) zostaje wszędzie', async () => {
    const s = await swiat(['A', 'B', 'C']);
    krok();
    await zZegarem(10 * MIN, () => s.A.vault.savePatientNote({ patientId: s.patientId, id: s.id, title: 'Fikcyjna wizyta', body: 'A: X (zegar do przodu).', category: 'observation' }));
    const x = (await zapisana(s.A, s.id)).updatedAtISO;
    await wyslij(s.A, s.B); await wyslij(s.A, s.C);
    const los = losowo(0.9);
    await zmien(s, s.B, 'B: poprawka X (stempel +901 ms).');
    los.mockReturnValue(0.1);
    await zmien(s, s.C, 'C: poprawka X sekundę później (stempel +101 ms).', 1000);
    expect([(await zapisana(s.B, s.id)).updatedAtISO, (await zapisana(s.C, s.id)).updatedAtISO], 'stempel: X + 1 ms + los × 1000 ms')
      .toEqual([iso(Date.parse(x) + 901), iso(Date.parse(x) + 101)]);
    await wymiana(s);
    expect(await stany(s)).toEqual(wszedzie(s, otwarta('B: poprawka X (stempel +901 ms).', 3)));
  });

  it('[znane ograniczenie] ten sam los stempla przy dwóch równoległych poprawkach X: pełny remis, każde urządzenie zostawia swoją (jak D-7)', async () => {
    losowo(0.5);
    const s = await swiat(['A', 'B', 'C']);
    krok();
    await zZegarem(10 * MIN, () => s.A.vault.savePatientNote({ patientId: s.patientId, id: s.id, title: 'Fikcyjna wizyta', body: 'A: X (zegar do przodu).', category: 'observation' }));
    await wyslij(s.A, s.B); await wyslij(s.A, s.C);
    await zmien(s, s.B, 'B: poprawka X.');
    await zmien(s, s.C, 'C: poprawka X sekundę później.', 1000);
    await wyslij(s.B, s.A); await wyslij(s.C, s.A); await wyslij(s.A, s.B); await wyslij(s.A, s.C); await wyslij(s.B, s.C); await wyslij(s.C, s.B);
    expect(await stany(s)).toEqual({ A: otwarta('B: poprawka X.', 3), B: otwarta('B: poprawka X.', 3), C: otwarta('C: poprawka X sekundę później.', 3) });
  });

  it('poprawka wersji z chwilą zapisu 9999-12-31T23:59:59.500Z: stempel zatrzymuje się na 9999-12-31T23:59:59.999Z i poprawka wygrywa', async () => {
    // Stempel = 500 ms + 1 ms + 900 ms — wyszedłby poza rok 9999 (toISOString: „+010000-…”).
    losowo(0.9);
    const s = await swiat();
    await zmien(s, s.A, 'A: wersja z odległą chwilą zapisu.');
    await wyslij(s.A, s.B, przerobNotatke(s.id, (n) => ({ ...n, updatedAtISO: '9999-12-31T23:59:59.500Z' })));
    expect((await zapisana(s.B, s.id)).updatedAtISO).toBe('9999-12-31T23:59:59.500Z');
    await zmien(s, s.B, 'B: poprawka wersji z odległą chwilą.');
    expect((await zapisana(s.B, s.id)).updatedAtISO, 'postać kanoniczna, nie rok 10000').toBe('9999-12-31T23:59:59.999Z');
    await wyslij(s.B, s.A);
    expect(await stan(s.A, s.id)).toEqual(otwarta('B: poprawka wersji z odległą chwilą.', 3));
  });

  // Dwa zapisy tej samej notatki w jednej milisekundzie: drugi dostaje stempel (chwila poprzedniej wersji + 1 ms +
  // los), czyli chwilę z najbliższej sekundy; nagrobek usunięcia bierze max(teraz, chwila usuwanej wersji) (G13).
  // „Zostaw notatkę” (wskrzeszenie) w tej samej chwili — od E3-PR0b2b później niż nagrobek, który zna; inaczej
  // („teraz”) przegrywało z nagrobkiem i wskrzeszona notatka ginęła po cichu na drugim urządzeniu.
  it('wskrzeszenie tuż po zapisie ze stemplem i usunięciu w tej samej chwili: notatka zostaje na obu urządzeniach', async () => {
    losowo(0.5);
    const s = await swiat();
    await zmien(s, s.A, 'A: wersja 1.');
    await zmien(s, s.A, 'A: wersja 2 w tej samej milisekundzie.', 0);
    const u2 = (await zapisana(s.A, s.id)).updatedAtISO;
    expect(u2 > iso(teraz), 'stempel: chwila zapisu późniejsza niż „teraz”').toBe(true);
    await s.A.vault.removePatientNote(s.id);
    const wsk = await s.A.vault.savePatientNote({ patientId: s.patientId, id: s.id, title: 'Fikcyjna wizyta', body: 'A: zostaw notatkę.', category: 'observation' });
    expect(wsk.isNew, 'wskrzeszenie').toBe(true);
    expect((await zapisana(s.A, s.id)).updatedAtISO > u2, 'wskrzeszenie później niż nagrobek').toBe(true);
    await wyslij(s.A, s.B); await wyslij(s.B, s.A);
    expect(await stany(s)).toEqual(wszedzie(s, otwarta('A: zostaw notatkę.', 4)));
  });
});

describe('E3-PR0b2b — nagrobek notatki a późniejsza zmiana', () => {
  it('[kontrola] usunięcie po obu edycjach usuwa; edycja po usunięciu zostaje; usunięcie w tej samej chwili co edycja usuwa', async () => {
    const a = await swiat();
    await zmien(a, a.A, 'A: edycja.');
    await zmien(a, a.B, 'B: edycja.');
    krok(); await a.A.vault.removePatientNote(a.id);
    await wymiana(a);
    expect(await stany(a), 'usunięcie po obu edycjach').toEqual(wszedzie(a, null));

    const b = await swiat();
    krok(); await b.A.vault.removePatientNote(b.id);
    await zmien(b, b.B, 'B: edycja po usunięciu.');
    await wymiana(b);
    expect(await stany(b), 'edycja po usunięciu').toEqual(wszedzie(b, otwarta('B: edycja po usunięciu.', 2)));

    const c = await swiat();
    krok();
    await c.A.vault.removePatientNote(c.id);
    await c.B.vault.savePatientNote({ patientId: c.patientId, id: c.id, title: 'Fikcyjna wizyta', body: 'B: edycja w chwili usunięcia.', category: 'observation' });
    await wymiana(c);
    expect(await stany(c), 'ta sama chwila').toEqual(wszedzie(c, null));
  });

  // Wersja X z zegara 10 min do przodu: poprawka B dostaje stempel późniejszy niż X, więc jest późniejsza także od
  // usunięcia z dobrym zegarem (skutek do odbioru: usunięta notatka może wrócić z poprawką, a poprawka nie ginie).
  it.each([
    ['poprawka B, potem usunięcie na C (bez wiedzy o poprawce)', 'poprawka', otwarta('B: poprawka X.', 3)],
    ['usunięcie na C, potem poprawka B (bez wiedzy o usunięciu)', 'usuniecie', otwarta('B: poprawka X.', 3)],
  ])('wersja z zegara do przodu: %s — notatka zostaje z poprawką', async (_opis, pierwsze, oczek) => {
    losowo(0.5);
    const s = await swiat(['A', 'B', 'C']);
    krok();
    await zZegarem(10 * MIN, () => s.A.vault.savePatientNote({ patientId: s.patientId, id: s.id, title: 'Fikcyjna wizyta', body: 'A: X (zegar do przodu).', category: 'observation' }));
    await wyslij(s.A, s.B); await wyslij(s.A, s.C);
    if (pierwsze === 'poprawka') { await zmien(s, s.B, 'B: poprawka X.'); krok(); await s.C.vault.removePatientNote(s.id); } else { krok(); await s.C.vault.removePatientNote(s.id); await zmien(s, s.B, 'B: poprawka X.'); }
    await wymiana(s); await wymiana(s);
    expect(await stany(s)).toEqual(wszedzie(s, oczek));
  });

  it('[kontrola] dobre zegary: poprawka B, potem usunięcie na C bez wiedzy o poprawce — usunięta wszędzie', async () => {
    const s = await swiat(['A', 'B', 'C']);
    await zmien(s, s.A, 'A: X.');
    await wyslij(s.A, s.B); await wyslij(s.A, s.C);
    await zmien(s, s.B, 'B: poprawka X.');
    krok(); await s.C.vault.removePatientNote(s.id);
    await wymiana(s); await wymiana(s);
    expect(await stany(s)).toEqual(wszedzie(s, null));
  });
});

describe('E3-PR0b2b — pola chwili treści w rekordzie i ładunku', () => {
  // A zapisuje później niż B (ten sam rev). Pole chwili treści z ładunku A, gdyby je przyjąć, przesunęłoby A przed B.
  async function dwieWersje() {
    const s = await swiat();
    await zmien(s, s.B, 'B: wcześniejsza treść.');
    await zmien(s, s.A, 'A: późniejsza treść.');
    s.uA = (await zapisana(s.A, s.id)).updatedAtISO;
    s.uB = (await zapisana(s.B, s.id)).updatedAtISO;
    s.przedB = iso(Date.parse(s.uB) - 1000);
    return s;
  }
  it.each([
    ['postać spoza toISOString', (s) => ({ contentAtISO: s.przedB.replace('.000Z', 'Z'), contentForISO: s.uA })],
    ['bez kotwicy', (s) => ({ contentAtISO: s.przedB })],
    ['kotwica inna niż chwila zapisu', (s) => ({ contentAtISO: s.przedB, contentForISO: s.uB })],
    ['nie napis', () => ({ contentAtISO: Date.parse('2026-11-16T08:00:00.000Z'), contentForISO: 0 })],
  ])('[kontrola] pole chwili treści w ładunku: %s — ignorowane, decyduje chwila zapisu', async (_opis, pola) => {
    const s = await dwieWersje();
    await wyslij(s.A, s.B, przerobNotatke(s.id, (n) => ({ ...n, ...pola(s) })));
    expect(await stan(s.B, s.id)).toEqual(otwarta('A: późniejsza treść.', 2));
  });

  it('[kontrola] pole chwili treści późniejsze niż chwila zapisu tej wersji — ignorowane', async () => {
    const s = await swiat();
    await zmien(s, s.A, 'A: wcześniejsza treść.');
    await zmien(s, s.B, 'B: późniejsza treść.');
    const uA = (await zapisana(s.A, s.id)).updatedAtISO;
    await wyslij(s.A, s.B, przerobNotatke(s.id, (n) => ({ ...n, contentAtISO: iso(teraz + MIN), contentForISO: uA })));
    expect(await stan(s.B, s.id)).toEqual(otwarta('B: późniejsza treść.', 2));
  });

  it('ważne pole chwili treści (z kotwicą): wersja zapisana później, ale z wcześniejszą zmianą treści, przegrywa', async () => {
    const s = await dwieWersje();
    await wyslij(s.A, s.B, przerobNotatke(s.id, (n) => ({ ...n, contentAtISO: s.przedB, contentForISO: s.uA })));
    const b = await zapisana(s.B, s.id);
    expect(await stan(s.B, s.id), 'treść B została (późniejsza zmiana treści)').toEqual(otwarta('B: wcześniejsza treść.', 2));
    expect(b.updatedAtISO, 'zostaje tutejsza wersja').toBe(s.uB);
  });

  it('zwykły zapis notatki nie przyjmuje pól chwili treści ani oznaczenia od wołającego', async () => {
    const s = await swiat();
    krok();
    await s.A.vault.savePatientNote({
      patientId: s.patientId, id: s.id, title: 'Fikcyjna wizyta', body: 'A: zwykły zapis z obcymi polami.', category: 'observation',
      contentAtISO: '2020-01-01T00:00:00.000Z', contentForISO: '2020-01-01T00:00:00.000Z', stateAtISO: '2020-01-01T00:00:00.000Z', stateForISO: '2020-01-01T00:00:00.000Z',
    });
    const r = await zapisana(s.A, s.id);
    expect([r.contentAtISO, r.contentForISO, r.stateAtISO, r.stateForISO].includes('2020-01-01T00:00:00.000Z'), 'żadne pole z ładunku wołającego').toBe(false);
    const odczyt = await s.A.vault.getPatientNote(s.id);
    expect(odczyt.contentAtISO === undefined || odczyt.contentAtISO === odczyt.updatedAtISO || odczyt.contentForISO === odczyt.updatedAtISO).toBe(true);
  });

  it('kopia ucięta przez starszą aplikację (ta sama wersja bez pól chwili): pole znika na obu, kolejna wymiana bez zapisu', async () => {
    const s = await dwieWersje();
    // A ma swoją wersję z ważnym polem chwili treści (np. po ratunku), B — tę samą wersję bez pól. B dostaje ją
    // zwykłym scaleniem (własny szyfrogram — rekord z adaptera A byłby na B nieczytelny i pomijany w eksporcie);
    // pole na A dopisujemy dopiero potem.
    await wyslij(s.A, s.B);
    const a = await zapisana(s.A, s.id);
    expect([(await zapisana(s.B, s.id)).updatedAtISO, (await zapisana(s.B, s.id)).rev], 'B: ta sama wersja co A').toEqual([a.updatedAtISO, a.rev]);
    await s.A.adapter.putPatientNoteForUser(s.A.uid, { ...a, contentAtISO: s.przedB, contentForISO: a.updatedAtISO });
    await wymiana(s);
    const r = await rekordy(s);
    expect([r.A.contentAtISO, r.B.contentAtISO], 'wygrywa wersja bez pola (chwila treści = chwila zapisu, późniejsza)').toEqual([undefined, undefined]);
    expect(await stany(s)).toEqual(wszedzie(s, otwarta('A: późniejsza treść.', 2)));
    await bezZmianPoKolejnejWymianie(s);
  });

  it('[kontrola] pole chwili treści z kotwicą starszej chwili zapisu (rekord przepisany z nową chwilą): liczy się chwila zapisu', async () => {
    const s = await swiat();
    await zmien(s, s.A, 'A: treść, rekord przepisany później.');
    const a = await zapisana(s.A, s.id);
    await zmien(s, s.B, 'B: treść pomiędzy.');
    krok();
    const nowaU = iso(teraz);
    await wyslij(s.A, s.B, przerobNotatke(s.id, (n) => ({ ...n, updatedAtISO: nowaU, contentAtISO: a.updatedAtISO, contentForISO: a.updatedAtISO })));
    expect(await stan(s.B, s.id), 'kotwica nie pasuje do chwili zapisu — pole nieważne').toEqual(otwarta('A: treść, rekord przepisany później.', 2));
  });
});

// h z treści kanonicznej — replika z prawdziwego źródła (Bnp_kanon, Bnp_h i listy pól wycięte z vilda_vault.js),
// jak w tests/unit/notatki-za-karta.test.mjs.
const zrodloVault = readFileSync(path.join(korzen, 'vilda_vault.js'), 'utf8');
const wytnij = (od) => { const a = zrodloVault.indexOf(od); const b = zrodloVault.indexOf('\n}\n', a); return zrodloVault.slice(a, b + 2); };
const linia = (od) => { const a = zrodloVault.indexOf(od); return zrodloVault.slice(a, zrodloVault.indexOf('\n', a)); };
let hFn = null;
const hTresci = (z, n) => (hFn || (hFn = new Function(`${linia('const Bnp_POLA_SZYFRU')}\n${linia('const Bnp_POLA_JAWNE')}\n${wytnij('function Bnp_kanon(')}\n${wytnij('function Bnp_h(')}\nreturn Bnp_h;`)()))(z, n);
const TYTUL_N1 = 'Fikcyjna obserwacja';
// Termin w rekordzie w postaci toISOString (sejf normalizuje datę z kalendarza).
const hN1 = (body) => hTresci({ title: TYTUL_N1, body }, { category: 'followup', dueDateISO: '2026-11-30T00:00:00.000Z' });
// Pierwsza para treści (z przyrostkiem), dla której warunek na h B i h C jest spełniony.
function paraTresci(warunek) {
  for (let i = 0; i < 20000; i += 1) {
    const b = `B: poprawka n1 przed usunięciem pacjenta (${i}).`, c = `C: późniejsza poprawka n1 przed usunięciem pacjenta (${i}).`;
    if (warunek(hN1(b), hN1(c))) return [b, c];
  }
  throw new Error('brak pary treści');
}
function paraTresciTegoSamegoH() {
  const wg = new Map();
  for (let i = 0; i < 20000; i += 1) {
    const t = `Poprawka n1 przed usunięciem pacjenta (${i}).`, h = hN1(t);
    if (wg.has(h)) return [`${wg.get(h)}`, t];
    wg.set(h, t);
  }
  throw new Error('brak pary treści');
}

describe('E3-PR0b2b — ratunek D-21 („Usuń pacjenta”) i import karty zachowują chwilę treści', () => {
  const pacjent = (height, weight) => ({ name: 'Fikcyjny Ratunek', user: { lastName: 'Fikcyjny', firstName: 'Ratunek', dobISO: '2016-03-12', sex: 'M', height, weight } });
  // A usuwa pacjenta; B i C (bez wiedzy) poprawiają n1 i dopisują wizytę po usunięciu — ich ratunek nadaje poprawkom
  // chwilę zapisu R + 1 ms + h treści (rev bez zmian).
  async function ratunek(trescB, trescC, nazwy = ['A', 'B', 'C']) {
    const s = { urz: [] };
    for (const n of nazwy) { s[n] = await sejf(n, { pliki: PLIKI_RATUNKU, ustawienia: RETENCJA }); s.urz.push(s[n]); }
    krok(); s.patientId = (await s.A.vault.savePatient(pacjent(120, 22), { dedup: false })).patientId;
    krok(); await s.A.vault.savePatient(pacjent(125, 24), { dedup: false, patientId: s.patientId });
    krok(1000);
    s.id = (await s.A.vault.savePatientNote({ patientId: s.patientId, title: TYTUL_N1, body: 'Fikcyjna treść n1.', category: 'followup', dueDateISO: '2026-11-30' })).id;
    for (const U of s.urz.slice(1)) await wyslij(s.A, U);
    const popraw = (U, body) => { krok(); return U.vault.savePatientNote({ patientId: s.patientId, id: s.id, title: TYTUL_N1, body, category: 'followup', dueDateISO: '2026-11-30' }); };
    await popraw(s.B, trescB);
    await popraw(s.C, trescC);
    krok(); await s.A.vault.removePatient(s.patientId);
    krok(); await s.B.vault.savePatient(pacjent(130, 26), { dedup: false, patientId: s.patientId });
    krok(); await s.C.vault.savePatient(pacjent(131, 27), { dedup: false, patientId: s.patientId });
    krok(5000);
    return s;
  }

  it('B i C poprawiają n1 przed „Usuń pacjenta” na A (C później, h treści B większe): po ratunku wszędzie zostaje poprawka C', async () => {
    const [b, c] = paraTresci((hB, hC) => hB > hC + 10);
    const s = await ratunek(b, c);
    await wyslij(s.A, s.B); await wyslij(s.A, s.C);
    await wymiana(s); await wymiana(s);
    const w = await stany(s);
    expect(w, `h_B = ${hN1(b)}, h_C = ${hN1(c)}`).toEqual(wszedzie(s, otwarta(c, 2)));
  });

  it('dwa ratunki z tym samym h i różną treścią: wszędzie ta sama, późniejsza poprawka (dotąd pełny remis — każde urządzenie zostawiało swoją)', async () => {
    const [b, c] = paraTresciTegoSamegoH();
    expect(hN1(b)).toBe(hN1(c));
    const s = await ratunek(b, c);
    await wyslij(s.A, s.B); await wyslij(s.A, s.C);
    await wymiana(s); await wymiana(s);
    expect(await stany(s), `h = ${hN1(b)}`).toEqual(wszedzie(s, otwarta(c, 2)));
  });

  it('[kontrola] przekaźnik: B ratuje n1 i oddaje dalej, E ma późniejszą poprawkę sprzed usunięcia — wszędzie poprawka E', async () => {
    const s = await ratunek('B: poprawka n1 (wcześniej).', 'C: bez zmian w n1.', ['A', 'B', 'C', 'E']);
    // E poprawia n1 przed usunięciem, ale jego wersja dochodzi dopiero po ratunku na B.
    await wyslij(s.A, s.B);
    await wyslij(s.B, s.C);
    await wyslij(s.C, s.E);
    await wymiana(s); await wymiana(s);
    const w = await stany(s);
    expect(new Set(Object.values(w).map((x) => x && x.body)).size, `jedna wersja wszędzie: ${JSON.stringify(w)}`).toBe(1);
  });

  // Import na urządzeniu bez tej karty (C — nowy sejf): notatka z pliku dostaje nową chwilę zapisu (Bpi_), a jej
  // chwila treści zostaje chwilą z pliku.
  it('[kontrola] import karty z pliku sprzed późniejszej edycji na B: na urządzeniu z importem zostaje edycja B', async () => {
    const s = await swiat(['A', 'B']);
    s.C = await sejf('C'); s.urz.push(s.C);
    const plik = await s.A.vault.exportPatientEnvelope(s.patientId);
    await zmien(s, s.B, 'B: edycja po wyeksportowaniu pliku.');
    krok();
    await s.C.vault.importPatientFromEnvelope(plik, s.A.haslo);
    await wyslij(s.B, s.C); await wyslij(s.C, s.B);
    expect(await stan(s.C, s.id)).toEqual(otwarta('B: edycja po wyeksportowaniu pliku.', 2));
  });

  it('ratunek notatki kroku planu opieki (kontekst planu tylko w treści): notatka wraca jak plan — bez pól chwili treści i oznaczenia', async () => {
    const s = { urz: [] };
    for (const n of ['A', 'B']) { s[n] = await sejf(n, { pliki: PLIKI_RATUNKU, ustawienia: RETENCJA }); s.urz.push(s[n]); }
    krok(); s.patientId = (await s.A.vault.savePatient(pacjent(120, 22), { dedup: false })).patientId;
    krok(); await s.A.vault.savePatient(pacjent(125, 24), { dedup: false, patientId: s.patientId });
    krok(); const plan = (await s.A.vault.mutateCarePlan({ patientId: s.patientId, operationId: 'fikcyjna-op-ratunek-planu-1', action: 'create', title: 'Fikcyjny plan ratunku' })).plan;
    krok(); const p = await s.A.vault.getCarePlan(plan.id);
    const zKrokiem = (await s.A.vault.mutateCarePlan({ planId: p.id, patientId: s.patientId, baseRev: p.rev, operationId: 'fikcyjna-op-ratunek-planu-2', action: 'addStep', step: { title: 'Fikcyjny krok', kind: 'Konsultacja', state: 'pending', description: 'Fikcyjny opis.' } })).plan;
    const kontekst = { version: 1, role: 'note', planId: zKrokiem.id, stepId: zKrokiem.steps[0].id };
    krok(); const nid = (await s.A.vault.savePatientNote({ patientId: s.patientId, title: 'Fikcyjna notatka kroku', body: 'Baza kroku.', category: 'observation', careContext: kontekst })).id;
    await wyslij(s.A, s.B);
    krok(); await s.B.vault.savePatientNote({ patientId: s.patientId, id: nid, title: 'Fikcyjna notatka kroku', body: 'B: poprawka kroku przed usunięciem pacjenta.', category: 'observation', careContext: kontekst });
    krok(); await s.A.vault.removePatient(s.patientId);
    krok(); await s.B.vault.savePatient(pacjent(130, 26), { dedup: false, patientId: s.patientId });
    krok(5000);
    const przed = (await zapisana(s.B, nid)).updatedAtISO;
    await wyslij(s.A, s.B);
    const r = await zapisana(s.B, nid);
    expect(r && r.updatedAtISO > przed, 'notatka kroku uratowana (nowa chwila zapisu)').toBe(true);
    expect([r.contentAtISO, r.stateAtISO], 'plan opieki: dawna reguła, bez pól').toEqual([undefined, undefined]);
  });

  it('import karty na urządzeniu z zegarem 10 min do tyłu: chwila zapisu nie cofa się przed wersję z pliku (stempel importu)', async () => {
    losowo(0.5);
    const s = await swiat(['A', 'B']);
    s.C = await sejf('C'); s.urz.push(s.C);
    await zmien(s, s.A, 'A: treść w pliku.');
    const uPliku = (await zapisana(s.A, s.id)).updatedAtISO;
    const plik = await s.A.vault.exportPatientEnvelope(s.patientId);
    krok();
    await zZegarem(-10 * MIN, () => s.C.vault.importPatientFromEnvelope(plik, s.A.haslo));
    const c = await zapisana(s.C, s.id);
    expect(c.updatedAtISO > uPliku, `chwila zapisu po imporcie (${c.updatedAtISO}) późniejsza niż w pliku (${uPliku})`).toBe(true);
    expect(c.contentAtISO, 'chwila treści z pliku').toBe(uPliku);
    expect(c.contentForISO, 'kotwica — chwila zapisu po imporcie').toBe(c.updatedAtISO);
  });
});

describe('E3-PR0b2b — plany opieki i listy pacjentów zostają przy dawnej regule', () => {
  const PLIKI_PLANOW = ['vilda_crypto.js', 'vilda_vault.js', 'vilda_care_plans.js'];
  let op = 0;
  const operacja = () => `fikcyjna-op-pozniej-${++op}`;

  // Plan opieki scala kroki po swojemu (oba kroki B i A zostają); reguła wyboru rekordu planu zostaje dawna — wynik
  // ten sam co przed zmianą, na obu urządzeniach ten sam rekord.
  it('[kontrola] plan opieki: wersja z ładunku zmieniona później, ale z niższym rev — wynik scalenia planu jak dotąd', async () => {
    const A = await sejf('A', { pliki: PLIKI_PLANOW }), B = await sejf('B', { pliki: PLIKI_PLANOW });
    krok(); const patientId = (await A.vault.savePatient(PACJENTKA, { dedup: false })).patientId;
    krok(); let plan = (await A.vault.mutateCarePlan({ patientId, operationId: operacja(), action: 'create', title: 'Fikcyjny plan dawnej reguły' })).plan;
    await wyslij(A, B);
    const dodaj = async (U, tytul) => { krok(); const p = await U.vault.getCarePlan(plan.id); return (await U.vault.mutateCarePlan({ planId: p.id, patientId, baseRev: p.rev, operationId: operacja(), action: 'addStep', step: { title: tytul, kind: 'Konsultacja', state: 'pending', description: 'Fikcyjny opis.' } })).plan; };
    await dodaj(A, 'A1'); await dodaj(A, 'A2');
    await dodaj(B, 'B1 (później)');
    krok();
    await wyslij(A, B); await wyslij(B, A);
    const kroki = async (U) => (await U.vault.getCarePlan(plan.id)).steps.map((k) => k.title);
    expect([await kroki(A), await kroki(B)]).toEqual([['A1', 'A2', 'B1 (później)'], ['A1', 'A2', 'B1 (później)']]);
    const [ra, rb] = [await zapisana(A, plan.id), await zapisana(B, plan.id)];
    expect([rb.rev, rb.updatedAtISO], 'ten sam rekord planu na obu').toEqual([ra.rev, ra.updatedAtISO]);
    expect([ra.contentAtISO, ra.stateAtISO], 'plan bez pól chwili treści i oznaczenia').toEqual([undefined, undefined]);
  });

  it('[kontrola] lista pacjentów: wersja z ładunku zmieniona później, ale z niższym rev, nie zastępuje tutejszej', async () => {
    const s = await swiat();
    krok(); await s.A.vault.savePatientList({ name: 'Fikcyjna lista', memberIds: [s.patientId] });
    await wyslij(s.A, s.B);
    const zmienListe = async (U, name) => { krok(); const [x] = await U.vault.listPatientLists(); return U.vault.savePatientList({ ...x, name }); };
    await zmienListe(s.A, 'Lista A1'); await zmienListe(s.A, 'Lista A2');
    await zmienListe(s.B, 'Lista B1 (później)');
    await wymiana(s);
    const nazwa = async (U) => (await U.vault.listPatientLists())[0].name;
    expect([await nazwa(s.A), await nazwa(s.B)]).toEqual(['Lista A2', 'Lista A2']);
  });
});

describe('E3-PR0b2b — oznaczenie „wykonane”, „nie zgłosił się” i cofnięcie mają własną chwilę', () => {
  const stanO = (body, rev, { wykonane = false, nieZglosil = false } = {}) => ({ body, rev, wykonane, nieZglosil });

  it('laptop zmienia dawkę dwa razy, telefon bez połączenia pięć sekund później klika „wykonane”: na obu nowa dawka i „wykonane”', async () => {
    const s = await swiat(['laptop', 'telefon']);
    await zmien(s, s.laptop, 'Dawka 50 µg.'); await zmien(s, s.laptop, 'Dawka 75 µg od jutra.');
    await oznacz(s, s.telefon, 'wykonane', 5e3);
    krok();
    await wymiana(s);
    expect(await stany(s)).toEqual(wszedzie(s, stanO('Dawka 75 µg od jutra.', 3, { wykonane: true })));
    await bezZmianPoKolejnejWymianie(s);
  });

  it('laptop zmienia dawkę raz, telefon później klika „wykonane” na starej treści: zmiana dawki nie ginie', async () => {
    const s = await swiat(['laptop', 'telefon']);
    await zmien(s, s.laptop, 'Dawka 75 µg od jutra.');
    await oznacz(s, s.telefon, 'wykonane', 5e3);
    krok();
    await wymiana(s);
    expect(await stany(s)).toEqual(wszedzie(s, stanO('Dawka 75 µg od jutra.', 2, { wykonane: true })));
    await bezZmianPoKolejnejWymianie(s);
  });

  it.each([1, 2])('telefon klika „wykonane”, laptop później zmienia treść %s raz(y): „wykonane” nie ginie', async (ile) => {
    const s = await swiat(['laptop', 'telefon']);
    await oznacz(s, s.telefon, 'wykonane');
    for (let i = 1; i <= ile; i += 1) await zmien(s, s.laptop, `Dawka po wizycie (${i}).`);
    krok();
    await wymiana(s);
    expect(await stany(s)).toEqual(wszedzie(s, stanO(`Dawka po wizycie (${ile}).`, 1 + ile, { wykonane: true })));
    await bezZmianPoKolejnejWymianie(s);
  });

  it('telefon klika „nie zgłosił się”, laptop później zmienia treść: na obu nowa treść i „nie zgłosił się”', async () => {
    const s = await swiat(['laptop', 'telefon']);
    await oznacz(s, s.telefon, 'nie zgłosił się');
    await zmien(s, s.laptop, 'Nowy termin do ustalenia telefonicznie.');
    krok();
    await wymiana(s);
    expect(await stany(s)).toEqual(wszedzie(s, stanO('Nowy termin do ustalenia telefonicznie.', 2, { nieZglosil: true })));
  });

  it('„wykonane” na obu; laptop zmienia treść, telefon później cofa „wykonane”: nowa treść i sprawa otwarta', async () => {
    const s = await swiat(['laptop', 'telefon']);
    await oznacz(s, s.laptop, 'wykonane');
    await wymiana(s);
    await zmien(s, s.laptop, 'Wynik do uzupełnienia.');
    await oznacz(s, s.telefon, 'cofnij', 5e3);
    krok();
    await wymiana(s);
    expect(await stany(s)).toEqual(wszedzie(s, stanO('Wynik do uzupełnienia.', 3)));
  });

  it('„wykonane” na obu; telefon cofa „wykonane”, laptop później zmienia treść: nowa treść i sprawa otwarta', async () => {
    const s = await swiat(['laptop', 'telefon']);
    await oznacz(s, s.laptop, 'wykonane');
    await wymiana(s);
    await oznacz(s, s.telefon, 'cofnij');
    await zmien(s, s.laptop, 'Wynik do uzupełnienia.', 5e3);
    krok();
    await wymiana(s);
    expect(await stany(s)).toEqual(wszedzie(s, stanO('Wynik do uzupełnienia.', 3)));
  });

  it.each(PERMUTACJE)('trzy urządzenia: treść na A, „wykonane” na B, późniejsza treść na C; pierścień %s — wszędzie treść C i „wykonane”', async (kol) => {
    const s = await swiat(['A', 'B', 'C']);
    await zmien(s, s.A, 'A: dawka 50 µg.');
    await oznacz(s, s.B, 'wykonane');
    await zmien(s, s.C, 'C: dawka 75 µg (najpóźniej).');
    krok();
    await pierscien(kol.split('').map((n) => s[n]));
    expect(await stany(s), `kolejność ${kol}`).toEqual(wszedzie(s, stanO('C: dawka 75 µg (najpóźniej).', 2, { wykonane: true })));
    const r = await rekordy(s);
    expect(new Set(Object.values(r).map((x) => x.updatedAtISO)).size, 'ta sama chwila zapisu na wszystkich urządzeniach').toBe(1);
  });

  it('złączenie treści i oznaczenia pod otwartym edytorem: chwila zapisu o 1 ms późniejsza niż obie wersje, więc zapis z edytora daje konflikt, a późniejsza dawka zostaje', async () => {
    const s = await swiat();
    await zmien(s, s.A, 'A t1 dawka 50.');
    await wyslij(s.A, s.B);
    await zmien(s, s.B, 'B t2 dawka 75 od jutra.');
    await oznacz(s, s.A, 'wykonane');
    const naEkranie = await s.A.vault.getPatientNote(s.id);
    const uB = (await zapisana(s.B, s.id)).updatedAtISO;
    await wyslij(s.B, s.A);
    const po = await s.A.vault.getPatientNote(s.id);
    expect({ body: po.body, wykonane: !!po.completedAtISO }, 'treść z późniejszej zmiany treści (B), „wykonane” z A').toEqual({ body: 'B t2 dawka 75 od jutra.', wykonane: true });
    const pozniejsza = naEkranie.updatedAtISO > uB ? naEkranie.updatedAtISO : uB;
    expect(po.updatedAtISO, 'rekord złożony ma chwilę różną od obu wersji').toBe(iso(Date.parse(pozniejsza) + 1));
    krok();
    const zapis = await s.A.vault.savePatientNote({ patientId: s.patientId, id: s.id, title: 'Fikcyjna wizyta', body: 'A: dopisek z edytora.', category: 'observation', baseRev: naEkranie.rev, baseUpdatedAtISO: naEkranie.updatedAtISO });
    expect(zapis.conflict, 'późniejsza dawka z B nie może zginąć po cichu').toBe(true);
    expect(zapis.current.body).toBe('B t2 dawka 75 od jutra.');
    expect((await s.A.vault.getPatientNote(s.id)).body).toBe('B t2 dawka 75 od jutra.');
    await wyslij(s.A, s.B);
    expect((await zapisana(s.B, s.id)).updatedAtISO, 'B liczy ten sam rekord złożony').toBe(po.updatedAtISO);
  });

  it('zapis samego oznaczenia: B klika „wykonane” na starej treści, A później zmienia treść; po scaleniu na A treść A i „wykonane”, konflikt w edytorze A, oba urządzenia mają ten sam rekord', async () => {
    const s = await swiat();
    await oznacz(s, s.B, 'wykonane');
    await zmien(s, s.A, 'A t3 dawka 75.');
    const naEkranie = await s.A.vault.getPatientNote(s.id);
    const zmiany = [];
    s.A.vault.onPatientNoteChanged((e) => zmiany.push(e && { id: e.id, action: e.action }));
    const wynik = await wyslij(s.B, s.A);
    const po = await s.A.vault.getPatientNote(s.id);
    expect({ body: po.body, wykonane: !!po.completedAtISO }).toEqual({ body: 'A t3 dawka 75.', wykonane: true });
    expect(po.updatedAtISO, 'chwila zapisu o 1 ms późniejsza niż obie wersje').toBe(iso(Date.parse(naEkranie.updatedAtISO) + 1));
    expect(wynik.updatedPatientNoteCount, 'zapis oznaczenia liczy się jako zmiana notatki').toBe(1);
    expect(zmiany.filter((e) => e && e.id === s.id).map((e) => e.action), 'ekrany dostają zdarzenie scalenia').toContain('merge');
    krok();
    const zapis = await s.A.vault.savePatientNote({ patientId: s.patientId, id: s.id, title: 'Fikcyjna wizyta', body: 'A: dopisek z edytora.', category: 'observation', baseRev: naEkranie.rev, baseUpdatedAtISO: naEkranie.updatedAtISO });
    expect(zapis.conflict, '„wykonane” z B zmieniło się pod otwartym edytorem').toBe(true);
    await wyslij(s.A, s.B);
    const [a, b] = [await zapisana(s.A, s.id), await zapisana(s.B, s.id)];
    expect([b.updatedAtISO, await stan(s.B, s.id)]).toEqual([a.updatedAtISO, await stan(s.A, s.id)]);
  });

  it('zbieżność chwili zapisu złączeń: dwie różne drogi dostaw dają tę samą treść i oznaczenie, po kolejnej wymianie tę samą chwilę zapisu, potem bez zapisów', async () => {
    const wynik = [];
    for (const droga of [['AB', 'BC', 'CA'], ['BC', 'AB', 'CA']]) {
      ustaw(START);
      const s = await swiat(['A', 'B', 'C']);
      await zmien(s, s.A, 'A: dawka 50 µg.');
      await oznacz(s, s.B, 'wykonane');
      await zmien(s, s.C, 'C: dawka 75 µg.');
      krok();
      for (const [x, y] of droga) await wyslij(s[x], s[y]);
      await wymiana(s);
      await wymiana(s);
      const r = await rekordy(s);
      expect(new Set(Object.values(r).map((x) => x.updatedAtISO)).size, `${droga}: jedna chwila zapisu`).toBe(1);
      await bezZmianPoKolejnejWymianie(s);
      wynik.push(await stan(s.A, s.id));
    }
    expect(wynik[0]).toEqual(wynik[1]);
    expect(wynik[0]).toEqual(stanO('C: dawka 75 µg.', 2, { wykonane: true }));
  });
});

describe('E3-PR0b2b — starsza aplikacja we flocie: oznaczenie o tej samej wartości nie przepisuje notatki przy każdej wymianie', () => {
  // A (bieżąca) ma chwilę oznaczenia różną od chwili samego oznaczenia: po cofnięciu „wykonane”, przy dacie wykonania
  // wcześniejszej niż zapis i przy zwykłym „wykonane”, gdy zegar idzie w trakcie zapisu (data z przycisku jest
  // wcześniejsza niż chwila zapisu pod blokadą). Starsza aplikacja (C) przyjmuje wersję A i ucina pola chwil; kopia
  // ucięta wraca z tą samą wartością oznaczenia. Złączenie „treść z kopii, oznaczenie z A” z chwilą zapisu + 1 ms dawało
  // przy każdej pełnej wymianie nowy rekord po obu stronach (zapis, zdarzenie, licznik) — bez końca, dopóki we flocie
  // jest starsze urządzenie. Ta sama wartość oznaczenia to tylko pole chwili oznaczenia, bez nowej chwili zapisu.
  async function flota(app) {
    const s = { urz: [] };
    for (const [n, st] of [['A', null], ['B', null], ['C', app]]) { s[n] = await sejf(n, { starsza: st }); s.urz.push(s[n]); }
    krok(); s.patientId = (await s.A.vault.savePatient(PACJENTKA, { dedup: false })).patientId;
    krok(); s.id = (await s.A.vault.savePatientNote({ patientId: s.patientId, title: 'Fikcyjna kontrola', body: 'Fikcyjna kontrola TSH.', category: 'followup' })).id;
    krok(); await wymiana(s);
    krok();
    return s;
  }
  // Każdy odczyt notatki z magazynu trwa 3 ms (jak IndexedDB): zegar idzie między przyciskiem a zapisem pod blokadą.
  async function zIdacymZegarem(U, fn) {
    const get = U.adapter.getPatientNoteForUser;
    U.adapter.getPatientNoteForUser = async (...a) => { ustaw(teraz + 3); return get.apply(U.adapter, a); };
    try { return await fn(); } finally { U.adapter.getPatientNoteForUser = get; }
  }
  const PRZYPADKI = [
    ['„wykonane”, potem „cofnij”', async (s) => { await oznacz(s, s.A, 'wykonane'); await oznacz(s, s.A, 'cofnij'); }, false],
    ['data wykonania wcześniejsza niż chwila zapisu', async (s) => { krok(); await s.A.vault.savePatientNote({ id: s.id, patientId: s.patientId, completedAtISO: '2026-11-10T12:00:00.000Z' }); }, true],
    ['zwykłe „wykonane” przy zegarze idącym w trakcie zapisu', async (s) => { krok(); await zIdacymZegarem(s.A, () => s.A.vault.completePatientNote(s.id)); }, true],
    ['„nie zgłosił się” przy zegarze idącym, potem „cofnij”', async (s) => { krok(); await zIdacymZegarem(s.A, () => s.A.vault.noShowPatientNote(s.id)); await oznacz(s, s.A, 'cofnij'); }, false],
  ];
  for (const app of ['221', '276']) {
    it.each(PRZYPADKI)(`starsza ${app}: %s — po dwóch pełnych wymianach ten sam widok wszędzie, kolejna wymiana bez zapisów`, async (_opis, zrob, wykonane) => {
      const s = await flota(app);
      await zrob(s);
      krok();
      await wymiana(s); await wymiana(s);
      const w = await stany(s);
      expect(w.A, 'A').toMatchObject({ body: 'Fikcyjna kontrola TSH.', wykonane, nieZglosil: false });
      expect([w.B, w.C], 'B i C widzą to samo co A').toEqual([w.A, w.A]);
      await bezZmianPoKolejnejWymianie(s);
    });
  }

  it('między bieżącymi urządzeniami: oznaczenie z ładunku o tej samej wartości, ale późniejsze — sama chwila oznaczenia, bez nowej chwili zapisu i bez licznika', async () => {
    const s = await swiat();
    // A: „wykonane” z datą wcześniejszą niż zapis (pole chwili oznaczenia = chwila zapisu); B ma tę wersję bez pól chwili
    // oznaczenia (jak kopia przekazana przez starszą aplikację).
    krok(); await s.A.vault.savePatientNote({ id: s.id, patientId: s.patientId, completedAtISO: '2026-11-10T12:00:00.000Z' });
    await wyslij(s.A, s.B);
    const a = await zapisana(s.A, s.id), b0 = await zapisana(s.B, s.id);
    expect([a.stateAtISO, b0.updatedAtISO], 'A: pole chwili oznaczenia; B: ta sama wersja').toEqual([a.updatedAtISO, a.updatedAtISO]);
    const bezPola = { ...b0 }; delete bezPola.stateAtISO; delete bezPola.stateForISO;
    await s.B.adapter.putPatientNoteForUser(s.B.uid, bezPola);
    const wynik = await wyslij(s.A, s.B);
    const b = await zapisana(s.B, s.id);
    expect([b.updatedAtISO, b.stateAtISO, b.stateForISO], 'B: ta sama chwila zapisu, pole chwili oznaczenia z A').toEqual([a.updatedAtISO, a.updatedAtISO, a.updatedAtISO]);
    expect(wynik.updatedPatientNoteCount, 'bez zmiany widocznej — bez licznika').toBe(0);
    await bezZmianPoKolejnejWymianie(s);
  });
});

describe('E3-PR0b2b — przełożenie otwartej sprawy liczy się jako zmiana oznaczenia na „otwarte”', () => {
  // Przypomnienie albo wizyta zamknięta na jednym urządzeniu („wykonane”, „nie zgłosił się”), a na drugim — bez
  // połączenia, na wersji otwartej — później przełożona (przycisk „Przełóż”, Terminarz, edytor, formularz wykonania
  // z akcją „przełóż”). Zamiar przełożenia to „sprawa otwarta, wróć w nowym terminie”; dotąd po synchronizacji wpis
  // zostawał zamknięty z nowym terminem (przypomnienie nie wracało, przyszła wizyta jako „nie zgłosił się”). Zmiana
  // terminu otwartego wpisu daje oznaczeniu „otwarte” chwilę tego zapisu — późniejsze przełożenie otwiera wpis wszędzie.
  const ZADANIE = { title: 'Kontrola TSH', body: 'Kontrola TSH za 3 mies.', category: 'followup', dueDateISO: '2026-12-01' };
  const widok = async (U, id) => {
    const n = await U.vault.getPatientNote(id);
    return { body: n.body, termin: String(n.dueDateISO || '').slice(0, 10), wykonane: !!n.completedAtISO, nieZglosil: !!n.noShowAtISO };
  };
  async function widoki(s) { const o = {}; for (const U of s.urz) o[U.nazwa] = await widok(U, s.id); return o; }
  const sprawa = (termin, { wykonane = false, nieZglosil = false, body = ZADANIE.body } = {}) => ({ body, termin, wykonane, nieZglosil });

  it('tablet „wykonane”, laptop (bez połączenia) później „Przełóż”: na obu nowy termin i sprawa otwarta', async () => {
    const s = await swiat(['tablet', 'laptop'], ZADANIE);
    krok(); await s.tablet.vault.completePatientNote(s.id);
    krok(5e3); await s.laptop.vault.snoozePatientNote(s.id, '2027-01-15');
    krok(); await wymiana(s); await wymiana(s);
    expect(await widoki(s)).toEqual(wszedzie(s, sprawa('2027-01-15')));
    await bezZmianPoKolejnejWymianie(s);
  });

  it('telefon „nie zgłosił się”, recepcja (bez połączenia) później „Przełóż”: na obu nowy termin i wizyta otwarta', async () => {
    const s = await swiat(['telefon', 'recepcja'], ZADANIE);
    krok(); await s.telefon.vault.noShowPatientNote(s.id);
    krok(5e3); await s.recepcja.vault.snoozePatientNote(s.id, '2026-12-08');
    krok(); await wymiana(s); await wymiana(s);
    expect(await widoki(s)).toEqual(wszedzie(s, sprawa('2026-12-08')));
  });

  it('telefon „nie zgłosił się”, recepcja później zmienia termin w edytorze: na obu nowy termin i wizyta otwarta', async () => {
    const s = await swiat(['telefon', 'recepcja'], ZADANIE);
    krok(); await s.telefon.vault.noShowPatientNote(s.id);
    krok(5e3); await s.recepcja.vault.savePatientNote({ id: s.id, patientId: s.patientId, ...ZADANIE, dueDateISO: '2026-12-08' });
    krok(); await wymiana(s); await wymiana(s);
    expect(await widoki(s)).toEqual(wszedzie(s, sprawa('2026-12-08')));
  });

  it('telefon „nie zgłosił się”, recepcja później przenosi wizytę w Terminarzu (tylko id, karta i termin): wizyta otwarta', async () => {
    const s = await swiat(['telefon', 'recepcja'], ZADANIE);
    krok(); await s.telefon.vault.noShowPatientNote(s.id);
    krok(5e3); await s.recepcja.vault.savePatientNote({ id: s.id, patientId: s.patientId, dueDateISO: '2026-12-08' });
    krok(); await wymiana(s); await wymiana(s);
    expect(await widoki(s)).toEqual(wszedzie(s, sprawa('2026-12-08')));
  });

  it('laptop „wykonane”, telefon później zapisuje w formularzu wykonania akcję „przełóż”: nowy termin, wpis formularza w treści, sprawa otwarta', async () => {
    const s = await swiat(['laptop', 'telefon'], ZADANIE);
    krok(); await s.laptop.vault.completePatientNote(s.id);
    const w = await s.telefon.vault.getPatientNote(s.id);
    krok(5e3);
    const r = await s.telefon.vault.saveReminderOutcome({ id: s.id, patientId: s.patientId, baseRev: w.rev, baseUpdatedAtISO: w.updatedAtISO, baseNote: w, operationId: 'fikcyjna-op-przeloz', action: 'reschedule', dateISO: '2027-01-15', text: 'Pacjent prosi o przesunięcie.' });
    expect(r.saved).toBe(true);
    krok(); await wymiana(s); await wymiana(s);
    const v = await widoki(s);
    expect(v.laptop).toEqual(v.telefon);
    expect(v.telefon).toMatchObject({ termin: '2027-01-15', wykonane: false, nieZglosil: false });
    expect(v.telefon.body).toContain('Zmieniono termin: 01.12.2026 → 15.01.2027');
  });

  it('[kontrola] telefon przekłada, laptop (bez połączenia) później „wykonane”: na obu nowy termin i „wykonane”', async () => {
    const s = await swiat(['laptop', 'telefon'], ZADANIE);
    krok(); await s.telefon.vault.snoozePatientNote(s.id, '2027-01-15');
    krok(5e3); await s.laptop.vault.completePatientNote(s.id);
    krok(); await wymiana(s); await wymiana(s);
    expect(await widoki(s)).toEqual(wszedzie(s, sprawa('2027-01-15', { wykonane: true })));
  });

  it('[kontrola] zmiana terminu wpisu oznaczonego „wykonane” w edytorze nie otwiera go (na tym i na drugim urządzeniu)', async () => {
    const s = await swiat(['laptop', 'telefon'], ZADANIE);
    krok(); await s.laptop.vault.completePatientNote(s.id);
    krok(); await wymiana(s);
    krok(); await s.laptop.vault.savePatientNote({ id: s.id, patientId: s.patientId, ...ZADANIE, dueDateISO: '2026-12-20' });
    krok(); await wymiana(s);
    expect(await widoki(s)).toEqual(wszedzie(s, sprawa('2026-12-20', { wykonane: true })));
  });
});

describe('E3-PR0b2b — wykonanie przypomnienia z kolejnym krokiem a późniejsza zmiana treści na drugim urządzeniu', () => {
  it('telefon zapisuje wykonanie z kolejnym krokiem, laptop (bez połączenia) później zmienia treść, potem ponowne wykonanie na laptopie: odmowa, jeden kolejny krok wszędzie', async () => {
    const s = await swiat(['laptop', 'telefon'], { title: 'Kontrola TSH', body: 'Kontrola TSH za 3 mies.', category: 'followup', dueDateISO: '2026-12-01' });
    const w = await s.telefon.vault.getPatientNote(s.id);
    krok();
    const r1 = await s.telefon.vault.saveReminderOutcome({ id: s.id, patientId: s.patientId, baseRev: w.rev, baseUpdatedAtISO: w.updatedAtISO, baseNote: w, operationId: 'fikcyjna-op-krok-1', action: 'complete', dateISO: '2026-11-16', text: 'TSH 2,1 mIU/l — bez zmian dawki.', next: { title: 'Kontrola TSH za 6 mies.', dateISO: '2027-05-16' } });
    expect(r1.saved).toBe(true);
    krok(5e3); await s.laptop.vault.savePatientNote({ id: s.id, patientId: s.patientId, title: 'Kontrola TSH', body: 'Kontrola TSH + FT4 (dopisek laptopa).', category: 'followup', dueDateISO: '2026-12-01' });
    krok(); await wymiana(s); await wymiana(s);
    const naLaptopie = await s.laptop.vault.getPatientNote(s.id);
    expect([naLaptopie.body, !!naLaptopie.completedAtISO], 'późniejsza treść laptopa i „wykonane” z telefonu').toEqual(['Kontrola TSH + FT4 (dopisek laptopa).', true]);
    krok();
    const r2 = await s.laptop.vault.saveReminderOutcome({ id: s.id, patientId: s.patientId, baseRev: naLaptopie.rev, baseUpdatedAtISO: naLaptopie.updatedAtISO, baseNote: naLaptopie, operationId: 'fikcyjna-op-krok-2', action: 'complete', dateISO: '2026-11-16', text: 'Ponowne wykonanie.', next: { title: 'Kontrola TSH za 6 mies. (drugi raz)', dateISO: '2027-05-17' } });
    expect([r2.saved, r2.reason], 'sprawa już zamknięta na laptopie').toEqual([false, 'already-closed']);
    krok(); await wymiana(s); await wymiana(s);
    for (const U of s.urz) {
      const kroki = (await U.vault.listPatientNotesForPatient(s.patientId)).filter((n) => /^rem-next-/.test(n.id)).map((n) => n.title);
      expect(kroki, `${U.nazwa}: jeden kolejny krok`).toEqual(['Kontrola TSH za 6 mies.']);
    }
  });
});

describe('E3-PR0b2b — chwila zapisu spoza postaci toISOString przy złączeniu treści i oznaczenia', () => {
  it('zwycięzca treści z chwilą zapisu bez milisekund (uszkodzony ładunek) i późniejsze „wykonane”: złączenie zachowuje chwilę treści, późniejsza treść z trzeciego urządzenia wygrywa wszędzie', async () => {
    const s = await swiat(['A', 'B', 'C']);
    await zmien(s, s.A, 'W (A).');
    const uW = (await zapisana(s.A, s.id)).updatedAtISO, uWn = uW.replace('.000Z', 'Z');
    await zmien(s, s.C, 'C: później niż W.');
    await oznacz(s, s.B, 'wykonane');
    await wyslij(s.A, s.B, przerobNotatke(s.id, (n) => ({ ...n, updatedAtISO: uWn })));
    const b = await zapisana(s.B, s.id);
    expect([b.contentAtISO, b.contentForISO], 'B: złączenie z chwilą treści W w postaci kanonicznej').toEqual([uW, b.updatedAtISO]);
    for (let r = 0; r < 2; r += 1) { await wyslij(s.B, s.C); await wyslij(s.C, s.B); }
    expect([await stan(s.B, s.id), await stan(s.C, s.id)]).toEqual([
      { body: 'C: później niż W.', rev: 2, wykonane: true, nieZglosil: false },
      { body: 'C: później niż W.', rev: 2, wykonane: true, nieZglosil: false },
    ]);
  });
});

describe('E3-PR0b2b — zapis zmieniający jedno pole (poza oznaczeniem) jest zmianą treści', () => {
  // Przełożenie, zmiana samego leku, kategorii, tytułu, wyniku, wieku wizyty albo karty — późniejsza niż poprawka treści
  // na drugim urządzeniu — nie może zginąć po cichu pod wcześniejszą poprawką.
  const ZMIANY = [
    ['termin', { dueDateISO: '2026-12-01' }, (n) => n.dueDateISO && n.dueDateISO.slice(0, 10) === '2026-12-01'],
    ['lek', { medication: { action: 'change', name: 'Fikcyjny lek', dose: '1 mg' } }, (n) => !!n.medication && n.medication.name === 'Fikcyjny lek'],
    ['kategoria', { category: 'followup' }, (n) => n.category === 'followup'],
    ['tytuł', { title: 'Fikcyjna wizyta (nowy tytuł)' }, (n) => n.title === 'Fikcyjna wizyta (nowy tytuł)'],
    ['wynik badania', { labResult: { test: 'Fikcyjne TSH', value: '4,1', valueNum: 4.1, unit: 'mIU/l' } }, (n) => !!n.labResult && n.labResult.test === 'Fikcyjne TSH'],
    ['wiek wizyty', { linkedAgeMonths: 110 }, (n) => n.linkedAgeMonths === 110],
    ['karta', 'karta', null],
  ];
  it.each(ZMIANY)('A zmienia tylko %s pięć sekund po poprawce treści na B: zostaje zmiana A (późniejsza), na obu ta sama wersja', async (_o, zmiana, jest) => {
    const s = await swiat();
    let Q = null;
    if (zmiana === 'karta') { krok(); Q = (await s.A.vault.savePatient({ name: 'Fikcyjna Druga Karta', user: { sex: 'F', age: 8, height: 125, weight: 25 } }, { dedup: false })).patientId; await wyslij(s.A, s.B); }
    await zmien(s, s.B, 'B: poprawka treści.');
    krok(5000);
    const a0 = await s.A.vault.getPatientNote(s.id);
    const extra = zmiana === 'karta' ? { patientId: Q } : zmiana;
    await s.A.vault.savePatientNote({ patientId: s.patientId, id: s.id, title: a0.title, body: a0.body, category: a0.category, ...extra });
    krok(); await wymiana(s); await wymiana(s);
    const [a, b] = [await s.A.vault.getPatientNote(s.id), await s.B.vault.getPatientNote(s.id)];
    expect([a.body, b.body], 'treść z wersji A (zmiana A późniejsza)').toEqual(['Fikcyjna treść bazowa.', 'Fikcyjna treść bazowa.']);
    if (jest) expect([jest(a), jest(b)], 'zmienione pole na obu').toEqual([true, true]);
    else expect([a.patientId, b.patientId], 'karta na obu').toEqual([Q, Q]);
  });
});

describe('E3-PR0b2b — notatka kroku planu: odłączenie na jednym urządzeniu, równoległa edycja na drugim', () => {
  // Plan opieki po którejkolwiek stronie (kategoria albo kontekst w metadanych lub w treści) — dawna reguła treści
  // i oznaczenia; careContext: null (znacznik odłączenia) to zwykła notatka. Podgląd „Scal kopię konta” liczy to samo.
  let op = 0;
  const operacja = () => `fikcyjna-op-odlaczenie-${++op}`;
  async function swiatPlanu() {
    const s = await swiat(['A', 'B']);
    krok(); const plan = (await s.A.vault.mutateCarePlan({ patientId: s.patientId, operationId: operacja(), action: 'create', title: 'Fikcyjny plan kroku' })).plan;
    krok(); const p = await s.A.vault.getCarePlan(plan.id);
    const po = (await s.A.vault.mutateCarePlan({ planId: p.id, patientId: s.patientId, baseRev: p.rev, operationId: operacja(), action: 'addStep', step: { title: 'Fikcyjny krok', kind: 'Konsultacja', state: 'pending', description: 'Fikcyjny opis.' } })).plan;
    s.plan = po; s.stepId = po.steps[0].id;
    krok(); s.nid = (await s.A.vault.savePatientNote({ patientId: s.patientId, title: 'Fikcyjna notatka kroku', body: 'Baza kroku.', category: 'observation', careContext: { version: 1, role: 'note', planId: po.id, stepId: s.stepId } })).id;
    krok(); await wyslij(s.A, s.B);
    return s;
  }
  const notatka = async (U, id) => { const n = await U.vault.getPatientNote(id); return n && { body: n.body, plan: n.careContext === null ? 'odłączona' : n.careContext ? 'plan' : 'brak', rev: n.rev }; };
  it('A odłącza notatkę od planu (później), B dwa razy poprawia treść w planie: dawna reguła (plan po jednej stronie) — wszędzie ta sama wersja', async () => {
    const s = await swiatPlanu();
    const b0 = await s.B.vault.getPatientNote(s.nid);
    krok(); await s.B.vault.savePatientNote({ patientId: s.patientId, id: s.nid, title: 'Fikcyjna notatka kroku', body: 'B1.', category: 'observation', careContext: b0.careContext });
    krok(); await s.B.vault.savePatientNote({ patientId: s.patientId, id: s.nid, title: 'Fikcyjna notatka kroku', body: 'B2.', category: 'observation', careContext: b0.careContext });
    const a0 = await s.A.vault.getPatientNote(s.nid);
    krok(5000); const odl = await s.A.vault.savePatientNote({ id: s.nid, patientId: s.patientId, baseRev: a0.rev, careContext: null });
    expect(odl.conflict).toBeUndefined();
    expect((await notatka(s.A, s.nid)).plan, 'odłączona na A').toBe('odłączona');
    krok(); await wymiana(s); await wymiana(s);
    const [a, b] = [await notatka(s.A, s.nid), await notatka(s.B, s.nid)];
    expect(a, 'oba urządzenia mają tę samą wersję').toEqual(b);
    expect(a.body, 'dawna reguła: wyższy rev (dwie poprawki B)').toBe('B2.');
  });
  it('notatka odłączona od planu na obu (careContext: null) — zwykła notatka: A dwa razy, B raz później, zostaje zmiana B', async () => {
    const s = await swiatPlanu();
    const a0 = await s.A.vault.getPatientNote(s.nid);
    krok(); await s.A.vault.savePatientNote({ id: s.nid, patientId: s.patientId, baseRev: a0.rev, careContext: null });
    krok(); await wymiana(s);
    expect([(await notatka(s.A, s.nid)).plan, (await notatka(s.B, s.nid)).plan]).toEqual(['odłączona', 'odłączona']);
    krok(); await s.A.vault.savePatientNote({ patientId: s.patientId, id: s.nid, title: 'Fikcyjna notatka kroku', body: 'A1.', category: 'observation' });
    krok(); await s.A.vault.savePatientNote({ patientId: s.patientId, id: s.nid, title: 'Fikcyjna notatka kroku', body: 'A2.', category: 'observation' });
    krok(5000); await s.B.vault.savePatientNote({ patientId: s.patientId, id: s.nid, title: 'Fikcyjna notatka kroku', body: 'B1 (później).', category: 'observation' });
    krok(); await wymiana(s);
    expect([(await notatka(s.A, s.nid)).body, (await notatka(s.B, s.nid)).body]).toEqual(['B1 (później).', 'B1 (później).']);
  });
  it('notatka kroku planu: B dwa razy poprawia treść, A później klika „wykonane”: dawna reguła oznaczenia planów — wszędzie wersja B bez „wykonane”', async () => {
    const s = await swiatPlanu();
    const b0 = await s.B.vault.getPatientNote(s.nid);
    krok(); await s.B.vault.savePatientNote({ patientId: s.patientId, id: s.nid, title: 'Fikcyjna notatka kroku', body: 'B1.', category: 'observation', careContext: b0.careContext });
    krok(); await s.B.vault.savePatientNote({ patientId: s.patientId, id: s.nid, title: 'Fikcyjna notatka kroku', body: 'B2.', category: 'observation', careContext: b0.careContext });
    krok(5000); await s.A.vault.completePatientNote(s.nid);
    expect((await s.A.vault.getPatientNote(s.nid)).completedAtISO, 'A: wykonane').toBeTruthy();
    krok(); await wymiana(s); await wymiana(s);
    const w = async (U) => { const n = await U.vault.getPatientNote(s.nid); return [n.body, !!n.completedAtISO, n.rev, n.updatedAtISO]; };
    const [a, b] = [await w(s.A), await w(s.B)];
    expect(a, 'ta sama wersja na obu').toEqual(b);
    expect(a.slice(0, 2), 'plan: dawna reguła (wyższy rev, bez złączenia oznaczenia)').toEqual(['B2.', false]);
  });
  it('notatka kroku planu odłączona na A i potem „wykonane” na A; B (w planie) trzy razy poprawia treść w międzyczasie: plan po stronie B — bez złączenia oznaczenia, wszędzie wersja B', async () => {
    const s = await swiatPlanu();
    const a0 = await s.A.vault.getPatientNote(s.nid), b0 = await s.B.vault.getPatientNote(s.nid);
    krok(); await s.A.vault.savePatientNote({ id: s.nid, patientId: s.patientId, baseRev: a0.rev, careContext: null });
    for (const t of ['B1.', 'B2.', 'B3.']) { krok(); await s.B.vault.savePatientNote({ patientId: s.patientId, id: s.nid, title: 'Fikcyjna notatka kroku', body: t, category: 'observation', careContext: b0.careContext }); }
    krok(5000); await s.A.vault.completePatientNote(s.nid);
    krok(); await wymiana(s); await wymiana(s);
    const w = async (U) => { const n = await U.vault.getPatientNote(s.nid); return [n.body, !!n.completedAtISO, n.rev, n.updatedAtISO]; };
    const [a, b] = [await w(s.A), await w(s.B)];
    expect(a, 'ta sama wersja na obu').toEqual(b);
    expect(a.slice(0, 2), 'plan po stronie B: dawna reguła oznaczenia').toEqual(['B3.', false]);
  });
  it('„Scal kopię konta” na B (notatka w planie, dwie poprawki) z kopii A (odłączona później): podgląd = wynik', async () => {
    const s = await swiatPlanu();
    const b0 = await s.B.vault.getPatientNote(s.nid);
    krok(); await s.B.vault.savePatientNote({ patientId: s.patientId, id: s.nid, title: 'Fikcyjna notatka kroku', body: 'B1.', category: 'observation', careContext: b0.careContext });
    krok(); await s.B.vault.savePatientNote({ patientId: s.patientId, id: s.nid, title: 'Fikcyjna notatka kroku', body: 'B2.', category: 'observation', careContext: b0.careContext });
    const a0 = await s.A.vault.getPatientNote(s.nid);
    krok(5000); await s.A.vault.savePatientNote({ id: s.nid, patientId: s.patientId, baseRev: a0.rev, careContext: null });
    krok();
    const kopiaA = await s.A.vault.exportVaultBackup();
    const podglad = await s.B.vault.previewVaultBackupMerge(kopiaA, s.A.haslo);
    const wynik = await s.B.vault.mergeVaultBackup(kopiaA, s.A.haslo);
    const k = ['updatedPatientNoteCount', 'addedPatientNoteCount'];
    expect(k.map((x) => podglad[x]), 'podgląd').toEqual(k.map((x) => wynik[x]));
    expect((await s.B.vault.getPatientNote(s.nid)).body, 'plan na B: dawna reguła').toBe('B2.');
  });
  it('A (odłączona) dwa razy poprawia treść, B (w planie) później klika „wykonane”: treść A wygrywa, plan po stronie B — bez złączenia oznaczenia, wszędzie ta sama wersja', async () => {
    const s = await swiatPlanu();
    const a0 = await s.A.vault.getPatientNote(s.nid);
    krok(); await s.A.vault.savePatientNote({ id: s.nid, patientId: s.patientId, baseRev: a0.rev, careContext: null });
    for (const t of ['A1.', 'A2.']) { krok(); await s.A.vault.savePatientNote({ patientId: s.patientId, id: s.nid, title: 'Fikcyjna notatka kroku', body: t, category: 'observation' }); }
    krok(5000); await s.B.vault.completePatientNote(s.nid);
    krok(); await wymiana(s); await wymiana(s);
    const w = async (U) => { const n = await U.vault.getPatientNote(s.nid); return [n.body, !!n.completedAtISO, n.rev, n.updatedAtISO]; };
    const [a, b] = [await w(s.A), await w(s.B)];
    expect(a, 'ta sama wersja na obu').toEqual(b);
    expect(a.slice(0, 2), 'plan po stronie B: dawna reguła oznaczenia (wyższy rev bez „wykonane”)').toEqual(['A2.', false]);
  });
  it('„Scal kopię konta” na B (w planie, trzy poprawki) z kopii A (odłączona, potem „wykonane”): podgląd = wynik', async () => {
    const s = await swiatPlanu();
    const a0 = await s.A.vault.getPatientNote(s.nid), b0 = await s.B.vault.getPatientNote(s.nid);
    krok(); await s.A.vault.savePatientNote({ id: s.nid, patientId: s.patientId, baseRev: a0.rev, careContext: null });
    for (const t of ['B1.', 'B2.', 'B3.']) { krok(); await s.B.vault.savePatientNote({ patientId: s.patientId, id: s.nid, title: 'Fikcyjna notatka kroku', body: t, category: 'observation', careContext: b0.careContext }); }
    krok(5000); await s.A.vault.completePatientNote(s.nid);
    krok();
    const kopiaA = await s.A.vault.exportVaultBackup();
    const podglad = await s.B.vault.previewVaultBackupMerge(kopiaA, s.A.haslo);
    const wynik = await s.B.vault.mergeVaultBackup(kopiaA, s.A.haslo);
    const k = ['updatedPatientNoteCount', 'addedPatientNoteCount'];
    expect(k.map((x) => podglad[x]), 'podgląd').toEqual(k.map((x) => wynik[x]));
  });
  it('notatka kroku planu (kontekst tylko w treści): „wykonane” i cofnięcie nie zapisują pól chwili treści ani oznaczenia (plany bez pól)', async () => {
    const s = await swiatPlanu();
    krok(); await s.A.vault.completePatientNote(s.nid);
    let r = await zapisana(s.A, s.nid);
    expect([r.contentAtISO, r.stateAtISO], 'po „wykonane”').toEqual([undefined, undefined]);
    krok(); await s.A.vault.uncompletePatientNote(s.nid);
    r = await zapisana(s.A, s.nid);
    expect([r.contentAtISO, r.stateAtISO], 'po cofnięciu').toEqual([undefined, undefined]);
  });
});

describe('E3-PR0b2b — zapis przy wygranej tutejszej treści: świeży rekord, chwila utworzenia, remis oznaczenia, kontekst przypomnienia', () => {
  it('zapis w oknie (inna karta przeglądarki) między listą notatek a blokadą: zapis oznaczenia z ładunku idzie na świeży rekord, treść z okna zostaje', async () => {
    const s = await swiat();
    await oznacz(s, s.A, 'wykonane');
    await zmien(s, s.B, 'B2.'); await zmien(s, s.B, 'B2b.');
    const stary = await zapisana(s.B, s.id);
    await zmien(s, s.B, 'B3 (zapis w oknie).');
    const nowy = await zapisana(s.B, s.id);
    await s.B.adapter.putPatientNoteForUser(s.B.uid, stary);
    const odczyt = s.B.adapter.getPatientNoteForUser.bind(s.B.adapter);
    let uzbrojone = true;
    s.B.adapter.getPatientNoteForUser = async (u, id) => { if (uzbrojone && id === s.id) { uzbrojone = false; await s.B.adapter.putPatientNoteForUser(s.B.uid, nowy); } return odczyt(u, id); };
    await wyslij(s.A, s.B);
    const b = await stan(s.B, s.id);
    expect([b.body, b.wykonane], 'treść z okna i „wykonane” z A').toEqual(['B3 (zapis w oknie).', true]);
  });
  it('para wpuszczona pod blokadę przez dawną regułę, zostaje tutejsza treść: chwila utworzenia z ładunku (wcześniejsza) przyjęta', async () => {
    const s = await swiat();
    await zmien(s, s.B, 'B1.'); await zmien(s, s.B, 'B2.');
    await zmien(s, s.A, 'A1 (później).');
    const wczesniej = iso(START - 3600e3);
    await wyslij(s.B, s.A, przerobNotatke(s.id, (n) => ({ ...n, createdAtISO: wczesniej })));
    const a = await zapisana(s.A, s.id);
    expect([(await stan(s.A, s.id)).body, a.createdAtISO]).toEqual(['A1 (później).', wczesniej]);
  });
  it('„wykonane” na A i „nie zgłosił się” na B w tej samej milisekundzie: po wymianie na obu to samo oznaczenie', async () => {
    const s = await swiat();
    await oznacz(s, s.A, 'wykonane');
    await oznacz(s, s.B, 'nie zgłosił się', 0);
    krok(); await wymiana(s); await wymiana(s);
    const [a, b] = [await stan(s.A, s.id), await stan(s.B, s.id)];
    expect([a.wykonane, a.nieZglosil], 'A').toEqual([b.wykonane, b.nieZglosil]);
    expect([a.wykonane, a.nieZglosil], 'stały porządek: „wykonane”').toEqual([true, false]);
  });
  it('wykonanie przypomnienia na A pięć sekund po poprawce treści na B: kontekst przypomnienia z A zostaje na obu', async () => {
    const s = await swiat(['A', 'B'], { dueDateISO: '2026-12-01', category: 'followup' });
    await zmien(s, s.B, 'B: poprawka treści.', MIN, { category: 'followup', dueDateISO: '2026-12-01' });
    krok(5000);
    const n = await s.A.vault.getPatientNote(s.id);
    const w = await s.A.vault.saveReminderOutcome({ id: s.id, patientId: s.patientId, baseRev: n.rev, baseUpdatedAtISO: n.updatedAtISO, operationId: 'fikcyjna-op-tutejsza-1', action: 'complete', dateISO: '2026-11-16', text: '' });
    expect(w.saved).toBe(true);
    const ctxA = (await s.A.vault.getPatientNote(s.id)).reminderContext;
    expect(ctxA, 'kontekst po wykonaniu').toBeTruthy();
    krok(); await wymiana(s); await wymiana(s);
    const [a, b] = [await s.A.vault.getPatientNote(s.id), await s.B.vault.getPatientNote(s.id)];
    expect([a.reminderContext && a.reminderContext.operationId, b.reminderContext && b.reminderContext.operationId]).toEqual(['fikcyjna-op-tutejsza-1', 'fikcyjna-op-tutejsza-1']);
  });
});

describe('E3-PR0b2b — zapis samego oznaczenia przy wygranej tutejszej treści', () => {
  it('para wpuszczona pod blokadę przez dawną regułę (A: dwie poprawki i „wykonane”, B: jedna poprawka pomiędzy): na B treść B, „wykonane” z A, licznik i zdarzenie „merge”', async () => {
    const s = await swiat();
    await zmien(s, s.A, 'A1.'); await zmien(s, s.A, 'A2.');
    await zmien(s, s.B, 'B1 (później).');
    await oznacz(s, s.A, 'wykonane');
    const zmiany = [];
    s.B.vault.onPatientNoteChanged((e) => zmiany.push(e && { id: e.id, action: e.action }));
    const wynik = await wyslij(s.A, s.B);
    const b = await stan(s.B, s.id);
    expect([b.body, b.wykonane]).toEqual(['B1 (później).', true]);
    expect(wynik.updatedPatientNoteCount, 'licznik').toBe(1);
    expect(zmiany.filter((e) => e && e.id === s.id).map((e) => e.action), 'zdarzenie scalenia').toContain('merge');
  });
  it('cofnięcie z A przekazane dalej przez zapis samego oznaczenia na B: C (z „wykonane”) dostaje od B cofnięcie', async () => {
    const s = await swiat(['A', 'B', 'C']);
    await oznacz(s, s.A, 'wykonane');
    await wyslij(s.A, s.B); await wyslij(s.A, s.C);
    await oznacz(s, s.A, 'cofnij');
    await zmien(s, s.B, 'B: późniejsza treść.');
    await wyslij(s.A, s.B);
    expect((await stan(s.B, s.id)).wykonane, 'B: cofnięcie z A').toBe(false);
    await wyslij(s.B, s.C);
    const c = await stan(s.C, s.id);
    expect([c.body, c.wykonane], 'C: treść B i cofnięcie (późniejsze niż „wykonane” na C)').toEqual(['B: późniejsza treść.', false]);
  });
  it('zapis samego oznaczenia zachowuje tutejszą chwilę treści: późniejsza treść C (sprzed „wykonane” na A) wygrywa na B', async () => {
    const s = await swiat(['A', 'B', 'C']);
    await zmien(s, s.B, 'B: treść.');
    await zmien(s, s.C, 'C: późniejsza treść.');
    await oznacz(s, s.A, 'wykonane');
    await wyslij(s.A, s.B);
    expect((await stan(s.B, s.id)).wykonane).toBe(true);
    await wyslij(s.C, s.B);
    const b = await stan(s.B, s.id);
    expect([b.body, b.wykonane]).toEqual(['C: późniejsza treść.', true]);
  });
  it('„nie zgłosił się” na B, A później zmienia treść; najpierw B → A: na A treść A i „nie zgłosił się” (zapis samego oznaczenia)', async () => {
    const s = await swiat();
    await oznacz(s, s.B, 'nie zgłosił się');
    await zmien(s, s.A, 'A: nowy termin do ustalenia.');
    await wyslij(s.B, s.A);
    const a = await stan(s.A, s.id);
    expect([a.body, a.nieZglosil, a.wykonane]).toEqual(['A: nowy termin do ustalenia.', true, false]);
  });
});

describe('E3-PR0b2b — import karty zachowuje chwilę oznaczenia (cofnięcie „wykonane”)', () => {
  it('A: „wykonane”, B to dostaje, A cofa; karta A zaimportowana na nowym urządzeniu I, I → B: na B sprawa otwarta (cofnięcie późniejsze niż „wykonane”)', async () => {
    const s = await swiat(['A', 'B']);
    await oznacz(s, s.A, 'wykonane');
    await wyslij(s.A, s.B);
    expect((await stan(s.B, s.id)).wykonane).toBe(true);
    await oznacz(s, s.A, 'cofnij');
    const plik = await s.A.vault.exportPatientEnvelope(s.patientId);
    const I = await sejf('I');
    krok(); await I.vault.importPatientFromEnvelope(plik, s.A.haslo);
    expect((await stan(I, s.id)).wykonane, 'I: po imporcie otwarta').toBe(false);
    await wyslij(I, s.B);
    expect((await stan(s.B, s.id)).wykonane, 'B: cofnięcie z A (przez import) późniejsze niż „wykonane”').toBe(false);
  });
});

describe('E3-PR0b2b — nieważne pole chwili treści w zapisanym rekordzie (kotwica innej chwili zapisu)', () => {
  it('rekord z nieważnym polem (kotwica innej chwili zapisu), potem „wykonane”: późniejsza treść B nie przegrywa z wcześniejszą treścią A', async () => {
    const s = await swiat();
    await zmien(s, s.A, 'A: wcześniejsza treść.');
    await zmien(s, s.B, 'B: późniejsza treść.');
    const b = await zapisana(s.B, s.id);
    // pole przeniesione przez kopię rekordu z nową chwilą zapisu (np. starsza aplikacja) — nieważne, bo kotwica nie pasuje
    await s.B.adapter.putPatientNoteForUser(s.B.uid, { ...b, contentAtISO: iso(START), contentForISO: iso(START) });
    await oznacz(s, s.B, 'wykonane');
    krok();
    await wymiana(s);
    const st = await stany(s);
    expect(Object.values(st).map((x) => [x.body, x.wykonane])).toEqual([['B: późniejsza treść.', true], ['B: późniejsza treść.', true]]);
  });
  it('odczyt notatki (Ft) nie oddaje nieważnego pola chwili treści (kotwica innej chwili zapisu)', async () => {
    const s = await swiat();
    await zmien(s, s.B, 'B: treść.');
    const b = await zapisana(s.B, s.id);
    await s.B.adapter.putPatientNoteForUser(s.B.uid, { ...b, contentAtISO: iso(START), contentForISO: iso(START) });
    const n = await s.B.vault.getPatientNote(s.id);
    expect([n.contentAtISO, n.contentForISO]).toEqual([undefined, undefined]);
    const l = await s.B.vault.exportSyncPayload();
    const w = l.patientNotes.find((x) => x.id === s.id);
    expect([w.contentAtISO, w.contentForISO], 'ładunek synchronizacji bez nieważnego pola').toEqual([undefined, undefined]);
  });
});

describe('E3-PR0b2b — pole chwili oznaczenia w ładunku: tylko z kotwicą i nie później niż chwila zapisu', () => {
  async function wykonaneNaBTrescNaA() {
    const s = await swiat();
    await oznacz(s, s.B, 'wykonane');
    await zmien(s, s.A, 'A: późniejsza treść.');
    s.uA = (await zapisana(s.A, s.id)).updatedAtISO;
    s.W = (await zapisana(s.B, s.id)).completedAtISO;
    return s;
  }
  it.each([
    ['bez kotwicy', (s) => ({ stateAtISO: iso(Date.parse(s.uA) - 1000) })],
    ['kotwica inna niż chwila zapisu', (s) => ({ stateAtISO: iso(Date.parse(s.uA) - 1000), stateForISO: s.W })],
    ['późniejsze niż chwila zapisu tej wersji', (s) => ({ stateAtISO: iso(Date.parse(s.uA) + MIN), stateForISO: s.uA })],
  ])('pole chwili oznaczenia w ładunku: %s — ignorowane, „wykonane” z B zostaje', async (_o, pola) => {
    const s = await wykonaneNaBTrescNaA();
    await wyslij(s.A, s.B, przerobNotatke(s.id, (n) => ({ ...n, ...pola(s) })));
    const b = await stan(s.B, s.id);
    expect({ body: b.body, wykonane: b.wykonane }).toEqual({ body: 'A: późniejsza treść.', wykonane: true });
  });
});

describe('E3-PR0b2b — złączenie, gdy jedna wersja ma chwilę zapisu 9999-12-31T23:59:59.999Z', () => {
  it('treść z ładunku z chwilą 9999-12-31T23:59:59.999Z, „wykonane” tutejsze: rekord złączony w postaci kanonicznej (bez roku 10000)', async () => {
    const s = await swiat();
    await oznacz(s, s.B, 'wykonane');
    await wyslij(s.A, s.B, przerobNotatke(s.id, (n) => ({ ...n, updatedAtISO: '9999-12-31T23:59:59.999Z' })));
    const r = await zapisana(s.B, s.id);
    expect(r.updatedAtISO, 'postać kanoniczna').toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect((await stan(s.B, s.id)).wykonane).toBe(true);
  });
});
