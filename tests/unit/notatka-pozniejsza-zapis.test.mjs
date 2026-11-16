import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// E3-PR0b2b (P-NOTATKA-POZNIEJSZA) — zapisy notatki pacjenta wokół reguły „zostaje zmiana późniejsza”.
//
// 1. „Ta sama widoczna wersja nie jest konfliktem”. E3-PR0b2a zatrzymuje zapis z edytora, wykonanie przypomnienia,
//    „Opisz wynik” i zmianę albo usunięcie wyniku Klirensu, gdy chwila zapisu wersji w sejfie różni się od chwili
//    wersji pokazanej lekarzowi. Ratunek D-21 („Usuń pacjenta” na innym urządzeniu), import karty i zapis samego
//    numeru wersji przesuwają chwilę zapisu bez zmiany treści — dotąd był to fałszywy konflikt (kierunek bezpieczny,
//    ale lekarz mógł wybrać „Wczytaj nowszą” i stracić wpisany tekst). Teraz wołający podaje obok baseUpdatedAtISO
//    wersję pokazaną (baseNote); przy innej chwili zapisu sejf porównuje pod blokadą notatki wszystkie pola odczytu
//    (poza numerem wersji, chwilami zapisu, utworzenia, treści i oznaczenia). Równe — zapis; różne w czymkolwiek
//    widocznym (treść, termin, „wykonane”, karta, pola kliniczne, kontekst przypomnienia albo planu) — konflikt jak
//    dotąd. Bez baseNote albo przy tej samej chwili zapisu — dokładnie umowa E3-PR0b2a.
// 2. „Scal pacjentów” i „spoza bazy” przenoszą notatki bez treści odczytanej przed blokadą notatki (jak przyciski
//    stanu w E3-PR0b2a): przeniesienie nie jest zmianą treści, więc późniejsza poprawka z innego urządzenia wygrywa;
//    notatka usunięta w oknie jest pomijana, nieczytelny szyfrogram przechodzi bez ponownego szyfrowania.
// 3. Terminarz „Edytuj osobę” przy wpisie bez pacjenta wysyła tylko nazwę osoby (i tytuł, gdy wpis go nie miał).
// 4. Luki modułu planów z etapami (decyzja właściciela z 2026-11-16: reguła wchodzi od razu, poprawka modułu osobno):
//    dowód kroku planu porównywany po rev i zamknięta lista pól dowodu — przypięte tu dzisiejszym zachowaniem.
// Opis: docs/clinical/ALGORITHMS.md (P-NOTATKA-POZNIEJSZA, P-KONFLIKT-ZAPISU-NOTATKI „Ograniczenia”), docs/CARE_PLANS.md.
//
// Dane wyłącznie fikcyjne. Prawdziwy vilda_crypto.js + vilda_vault.js na adapterze pamięciowym, podstawiony zegar Date.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const zrodlo = (plik) => readFileSync(path.join(korzen, plik), 'utf8');
const PLIKI = ['vilda_crypto.js', 'vilda_vault.js'];
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

let licznik = 0;
// zKopii — bliźniak tego samego konta (importSyncCode): rekordy obu urządzeń mają ten sam klucz.
async function sejf(nazwa, { pliki = PLIKI, ustawienia = {}, zKopii = null } = {}) {
  licznik += 1;
  const win = {
    crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: magazyn(), sessionStorage: magazyn(),
    setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
    addEventListener() {}, removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {}, hidden: false },
    AbortController,
  };
  win.window = win; win.self = win; win.top = win;
  for (const [klucz, wartosc] of Object.entries(ustawienia)) win.localStorage.setItem(klucz, wartosc);
  for (const plik of pliki) loadBrowserScript(plik, win);
  const vault = win.VildaVault, adapter = vault.createInMemoryAdapter();
  vault.setStorageAdapter(adapter);
  const d = { win, vault, adapter, nazwa };
  if (zKopii) {
    d.haslo = zKopii.haslo;
    vault.lock('manual');
    await vault.importSyncCode(await zKopii.vault.exportSyncCode(d.haslo), d.haslo, { label: `Fikcyjny bliźniak ${licznik}` });
  } else {
    d.haslo = `Fikcyjne#Zapis!${licznik}`;
    await vault.createUser(d.haslo, { label: `Fikcyjny sejf ${nazwa} ${licznik}`, iterations: 10000 });
  }
  d.uid = vault.getCurrentUser().userId;
  return d;
}

const START = Date.parse('2026-11-16T08:00:00.000Z');
let teraz = START;
const ustaw = (ms) => { teraz = ms; vi.setSystemTime(teraz); };
const krok = (ms = MIN) => ustaw(teraz + ms);
const iso = (ms) => new Date(ms).toISOString();
const kopia = (x) => JSON.parse(JSON.stringify(x));
const operacja = () => `fikcyjna-op-zapis-${++licznik}`;

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); ustaw(START); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

async function wyslij(zrodlo, cel, przerob) {
  let ladunek = kopia(await zrodlo.vault.exportSyncPayload());
  if (przerob) ladunek = przerob(ladunek) || ladunek;
  krok(1000);
  return cel.vault.mergeSyncPayload(ladunek);
}
const przerobNotatke = (id, fn) => (l) => { l.patientNotes = l.patientNotes.map((n) => (n.id === id ? fn({ ...n }) : n)); return l; };
const zapisana = (U, id) => U.adapter.getPatientNoteForUser(U.uid, id);

async function dwaUrzadzenia(notatka = {}) {
  const A = await sejf('A'), B = await sejf('B');
  krok(); const patientId = (await A.vault.savePatient({ name: 'Fikcyjna Pacjentka Zapis', user: { sex: 'F', age: 9, height: 130, weight: 28 } })).patientId;
  krok(); const { id } = await A.vault.savePatientNote({ patientId, title: 'Wizyta', body: 'Baza.', category: 'observation', ...notatka });
  krok(); await wyslij(A, B);
  krok();
  return { A, B, patientId, id };
}
// Dotknięcie techniczne: A oddaje tę samą wersję z nową chwilą zapisu (jak ratunek D-21 albo import karty) — treść,
// rev i oznaczenie bez zmian, pole chwili treści z kotwicą nowej chwili. B przyjmuje ją (późniejsza chwila zapisu).
async function dotkniecie(s, cel = s.B, zrodloU = s.A) {
  krok(1000);
  const nowaU = iso(teraz);
  await wyslij(zrodloU, cel, przerobNotatke(s.id, (n) => ({ ...n, updatedAtISO: nowaU, contentAtISO: n.updatedAtISO, contentForISO: nowaU })));
  const po = await cel.vault.getPatientNote(s.id);
  expect(po.updatedAtISO, 'dotknięcie przesunęło chwilę zapisu').toBe(nowaU);
  krok();
  return po;
}
const edytor = (s, naEkranie, body, extra = {}) => ({
  patientId: s.patientId, id: s.id, title: 'Wizyta', body, category: naEkranie.category,
  baseRev: naEkranie.rev, baseUpdatedAtISO: naEkranie.updatedAtISO, ...extra,
});

describe('E3-PR0b2b — ta sama widoczna wersja nie jest konfliktem (edytor notatki)', () => {
  it('po dotknięciu technicznym: bez baseNote konflikt jak w E3-PR0b2a; z baseNote (wersja pokazana) zapis bez konfliktu', async () => {
    const s = await dwaUrzadzenia();
    const naEkranie = await s.B.vault.getPatientNote(s.id);
    await dotkniecie(s);
    const bez = await s.B.vault.savePatientNote(edytor(s, naEkranie, 'B: zapis bez wersji pokazanej.'));
    expect(bez.conflict, 'bez baseNote zostaje umowa E3-PR0b2a').toBe(true);
    expect((await s.B.vault.getPatientNote(s.id)).body).toBe('Baza.');
    const z = await s.B.vault.savePatientNote(edytor(s, naEkranie, 'B: dopisek lekarza.', { baseNote: naEkranie }));
    expect(z.conflict, 'w sejfie jest dokładnie to, co lekarz ma na ekranie').toBeUndefined();
    expect((await s.B.vault.getPatientNote(s.id)).body).toBe('B: dopisek lekarza.');
  });

  // Każda widoczna różnica między wersją pokazaną a wersją w sejfie musi dalej zatrzymać zapis.
  const ROZNICE = [
    ['tytuł', { title: 'Inny tytuł' }],
    ['treść', { body: 'Inna treść.' }],
    ['kategoria', { category: 'followup' }],
    ['termin', { dueDateISO: '2026-12-01T00:00:00.000Z' }],
    ['godzina', { dueTime: '10:15' }],
    ['„wykonane”', { completedAtISO: '2026-11-16T09:00:00.000Z' }],
    ['„nie zgłosił się”', { noShowAtISO: '2026-11-16T09:00:00.000Z' }],
    ['karta pacjenta', { patientId: 'fikcyjna-inna-karta' }],
    ['lek', { medication: { name: 'Fikcyjny lek', dose: '1 mg' } }],
    ['wynik badania', { labResult: { test: 'Fikcyjne TSH', value: '4,1', valueNum: 4.1, unit: 'mIU/l' } }],
    ['kontekst przypomnienia', { reminderContext: { kind: 'fikcyjny' } }],
    ['kontekst planu (podłączenie do planu)', { careContext: { planId: 'fikcyjny-plan' } }],
  ];
  it.each(ROZNICE)('[kontrola] baseNote różny w jednym polu (%s): konflikt, nic nie zapisano', async (_opis, zmiana) => {
    const s = await dwaUrzadzenia();
    const naEkranie = await s.B.vault.getPatientNote(s.id);
    await dotkniecie(s);
    const w = await s.B.vault.savePatientNote(edytor(s, naEkranie, 'B: zapis na innej wersji.', { baseNote: { ...naEkranie, ...zmiana } }));
    expect(w.conflict).toBe(true);
    expect((await s.B.vault.getPatientNote(s.id)).body).toBe('Baza.');
  });

  it('[kontrola] baseNote niespójny (inne id albo inna chwila zapisu niż baseUpdatedAtISO): konflikt', async () => {
    const s = await dwaUrzadzenia();
    const naEkranie = await s.B.vault.getPatientNote(s.id);
    await dotkniecie(s);
    for (const zle of [{ ...naEkranie, id: 'fikcyjna-inna-notatka' }, { ...naEkranie, updatedAtISO: iso(teraz) }]) {
      expect((await s.B.vault.savePatientNote(edytor(s, naEkranie, 'B: zapis.', { baseNote: zle }))).conflict).toBe(true);
    }
    expect((await s.B.vault.getPatientNote(s.id)).body).toBe('Baza.');
  });

  it('baseNote z dodatkowym kluczem spoza odczytu sejfu (dopisanym przez ekran) i z inną chwilą utworzenia: zapis bez konfliktu', async () => {
    const s = await dwaUrzadzenia();
    const naEkranie = await s.B.vault.getPatientNote(s.id);
    await dotkniecie(s);
    const w = await s.B.vault.savePatientNote(edytor(s, naEkranie, 'B: dopisek.', { baseNote: { ...naEkranie, _ekran: { rozwiniety: true }, createdAtISO: iso(START) } }));
    expect(w.conflict, 'klucze spoza odczytu i chwila utworzenia nie są widoczną zmianą').toBeUndefined();
    expect((await s.B.vault.getPatientNote(s.id)).body).toBe('B: dopisek.');
  });

  it('[kontrola] ta sama chwila zapisu: baseNote przerobiony przez ekran nie zatrzymuje zapisu (zwolnienie nie dodaje konfliktów)', async () => {
    const s = await dwaUrzadzenia();
    const naEkranie = await s.B.vault.getPatientNote(s.id);
    krok();
    const w = await s.B.vault.savePatientNote(edytor(s, naEkranie, 'B: zwykła edycja.', { baseNote: { ...naEkranie, body: 'przerobione przez ekran' } }));
    expect(w.conflict).toBeUndefined();
    expect((await s.B.vault.getPatientNote(s.id)).body).toBe('B: zwykła edycja.');
  });

  it('[kontrola] prawdziwa zmiana treści z innego urządzenia przy baseNote: konflikt, zostaje treść z drugiego urządzenia', async () => {
    const s = await dwaUrzadzenia();
    const naEkranie = await s.B.vault.getPatientNote(s.id);
    krok(); await s.A.vault.savePatientNote({ patientId: s.patientId, id: s.id, title: 'Wizyta', body: 'A: dawka 75 od jutra.', category: 'observation' });
    await wyslij(s.A, s.B);
    krok();
    const w = await s.B.vault.savePatientNote(edytor(s, naEkranie, 'B: dopisek na starej wersji.', { baseNote: naEkranie }));
    expect(w.conflict).toBe(true);
    expect(w.current.body).toBe('A: dawka 75 od jutra.');
    expect((await s.B.vault.getPatientNote(s.id)).body).toBe('A: dawka 75 od jutra.');
  });

  it('[kontrola] nieczytelny szyfrogram w sejfie przy innej chwili zapisu i baseNote: konflikt', async () => {
    const s = await dwaUrzadzenia();
    const naEkranie = await s.B.vault.getPatientNote(s.id);
    await dotkniecie(s);
    const r = await zapisana(s.B, s.id);
    await s.B.adapter.putPatientNoteForUser(s.B.uid, { ...r, bodyCipher: { ...r.bodyCipher, data: r.bodyCipher.data.split('').reverse().join('') } });
    const w = await s.B.vault.savePatientNote(edytor(s, naEkranie, 'B: zapis na nieczytelnej wersji.', { baseNote: naEkranie }));
    expect(w.conflict).toBe(true);
  });
});

describe('E3-PR0b2b — ta sama widoczna wersja po ratunku D-21 i imporcie karty (prawdziwe ścieżki)', () => {
  const RETENCJA = { vildaRetention: '0' };
  const PLIKI_RATUNKU = ['vilda_crypto.js', 'vilda_retention.js', 'vilda_vault.js'];
  const pacjent = (height, weight) => ({ name: 'Fikcyjny Ratunek', user: { lastName: 'Fikcyjny', firstName: 'Ratunek', dobISO: '2016-03-12', sex: 'M', height, weight } });

  it('ratunek D-21 pod otwartym edytorem i formularzem wykonania: z baseNote zapis i wykonanie bez fałszywego konfliktu', async () => {
    const A = await sejf('A', { pliki: PLIKI_RATUNKU, ustawienia: RETENCJA }), B = await sejf('B', { pliki: PLIKI_RATUNKU, ustawienia: RETENCJA });
    krok(); const { patientId } = await A.vault.savePatient(pacjent(120, 22), { dedup: false });
    krok(); await A.vault.savePatient(pacjent(125, 24), { dedup: false, patientId });
    krok(1000);
    const n1 = await A.vault.savePatientNote({ patientId, title: 'Fikcyjna obserwacja', body: 'Fikcyjna treść n1.', category: 'followup', dueDateISO: '2026-11-30' });
    krok(1000);
    const n2 = await A.vault.savePatientNote({ patientId, title: 'Fikcyjna kontrola', body: 'Fikcyjna treść n2.', category: 'followup', dueDateISO: '2026-11-30' });
    await wyslij(A, B);
    const naEkranie = await B.vault.getPatientNote(n1.id), formularz = await B.vault.getPatientNote(n2.id);
    krok(); await A.vault.removePatient(patientId);
    krok(); await B.vault.savePatient(pacjent(130, 26), { dedup: false, patientId });
    krok(5000);
    await wyslij(A, B);
    const po = await B.vault.getPatientNote(n1.id);
    expect(po.updatedAtISO > naEkranie.updatedAtISO, 'ratunek: nowa chwila zapisu, ta sama treść').toBe(true);
    krok();
    const zapis = await B.vault.savePatientNote({ patientId, id: n1.id, title: 'Fikcyjna obserwacja', body: 'Fikcyjna treść n1. Dopisek lekarza.', category: 'followup', dueDateISO: '2026-11-30', baseRev: naEkranie.rev, baseUpdatedAtISO: naEkranie.updatedAtISO, baseNote: naEkranie });
    expect(zapis.conflict, 'ratunek nie zmienił niczego, co lekarz widzi').toBeUndefined();
    expect((await B.vault.getPatientNote(n1.id)).body).toBe('Fikcyjna treść n1. Dopisek lekarza.');
    const wynik = await B.vault.saveReminderOutcome({ id: n2.id, patientId, baseRev: formularz.rev, baseUpdatedAtISO: formularz.updatedAtISO, baseNote: formularz, operationId: operacja(), action: 'complete', dateISO: '2026-11-16', text: 'Fikcyjne wykonanie.' });
    expect(wynik).toMatchObject({ saved: true, id: n2.id });
  });

  it('import karty na innym urządzeniu (ta sama notatka z nową chwilą zapisu) pod otwartym edytorem: z baseNote zapis bez konfliktu', async () => {
    const s = await dwaUrzadzenia();
    const naEkranie = await s.B.vault.getPatientNote(s.id);
    const plik = await s.A.vault.exportPatientEnvelope(s.patientId);
    const I = await sejf('I');
    krok(); await I.vault.importPatientFromEnvelope(plik, s.A.haslo);
    await wyslij(I, s.B);
    const po = await s.B.vault.getPatientNote(s.id);
    expect([po.body, po.updatedAtISO > naEkranie.updatedAtISO], 'import: ta sama treść, późniejsza chwila zapisu').toEqual(['Baza.', true]);
    krok();
    const bez = await s.B.vault.savePatientNote(edytor(s, naEkranie, 'B: bez wersji pokazanej.'));
    expect(bez.conflict, 'bez baseNote — jak w E3-PR0b2a').toBe(true);
    const z = await s.B.vault.savePatientNote(edytor(s, naEkranie, 'B: dopisek po imporcie na innym urządzeniu.', { baseNote: naEkranie }));
    expect(z.conflict).toBeUndefined();
    expect((await s.B.vault.getPatientNote(s.id)).body).toBe('B: dopisek po imporcie na innym urządzeniu.');
  });
});

describe('E3-PR0b2b — ta sama widoczna wersja: wykonanie przypomnienia, „Opisz wynik” i wynik Klirensu', () => {
  it.each([
    ['wykonanie przypomnienia', 'complete', ''],
    ['„Opisz wynik” (Badania)', 'result', 'Fikcyjny opis wyniku.'],
  ])('%s po dotknięciu technicznym: bez baseNote konflikt, z baseNote zapis', async (_opis, action, text) => {
    const s = await dwaUrzadzenia({ dueDateISO: '2026-12-01', category: 'followup' });
    const naEkranie = await s.B.vault.getPatientNote(s.id);
    await dotkniecie(s);
    const prosba = (extra) => ({ id: s.id, patientId: s.patientId, baseRev: naEkranie.rev, baseUpdatedAtISO: naEkranie.updatedAtISO, operationId: operacja(), action, dateISO: '2026-11-16', text, ...extra });
    expect(await s.B.vault.saveReminderOutcome(prosba({})), 'bez baseNote').toMatchObject({ saved: false, conflict: true });
    expect(await s.B.vault.saveReminderOutcome(prosba({ baseNote: naEkranie })), 'z baseNote').toMatchObject({ saved: true, id: s.id });
  });

  const pomiar = {
    category: 'wynik-klirens', title: 'Fikcyjny ACR', clinicalDateISO: '2026-10-25', body: 'Fikcyjna ocena.',
    labResult: { test: 'Fikcyjny ACR', value: '45', valueNum: 45, unit: 'mg/g' },
  };
  const edycja = (s, naEkranie, zmiany = {}) => ({
    id: s.id, patientId: s.patientId, baseRev: naEkranie.rev, baseUpdatedAtISO: naEkranie.updatedAtISO,
    category: 'wynik-klirens', title: 'Fikcyjny ACR', clinicalDateISO: '2026-10-24', body: 'Fikcyjna nowa ocena.',
    labResult: { test: 'Fikcyjny ACR', value: '13,6', valueNum: 13.6, unit: 'mg/g' }, ...zmiany,
  });

  it.each(['zmiana', 'usunięcie'])('wynik Klirensu, %s po dotknięciu technicznym z baseNote: wykonane bez konfliktu', async (rodzaj) => {
    const s = await dwaUrzadzenia(pomiar);
    const naEkranie = await s.B.vault.getPatientNote(s.id);
    await dotkniecie(s);
    const w = rodzaj === 'zmiana'
      ? await s.B.vault.updateExistingPatientNote(edycja(s, naEkranie, { baseNote: naEkranie }))
      : await s.B.vault.removeExistingPatientNote({ id: s.id, patientId: s.patientId, baseRev: naEkranie.rev, baseUpdatedAtISO: naEkranie.updatedAtISO, baseNote: naEkranie });
    expect(w).toMatchObject(rodzaj === 'zmiana' ? { id: s.id, updated: true } : { id: s.id, removed: true });
  });

  it.each(['zmiana', 'usunięcie'])('[kontrola] wynik Klirensu, %s z baseNote po prawdziwej zmianie komentarza na drugim urządzeniu: konflikt', async (rodzaj) => {
    const s = await dwaUrzadzenia(pomiar);
    const naEkranie = await s.B.vault.getPatientNote(s.id);
    krok(); await s.A.vault.savePatientNote({ ...pomiar, id: s.id, patientId: s.patientId, body: 'A: późniejszy komentarz.' });
    await wyslij(s.A, s.B);
    krok();
    const w = rodzaj === 'zmiana'
      ? await s.B.vault.updateExistingPatientNote(edycja(s, naEkranie, { baseNote: naEkranie }))
      : await s.B.vault.removeExistingPatientNote({ id: s.id, patientId: s.patientId, baseRev: naEkranie.rev, baseUpdatedAtISO: naEkranie.updatedAtISO, baseNote: naEkranie });
    expect(w).toMatchObject({ reason: 'conflict', conflict: true });
    expect((await s.B.vault.getPatientNote(s.id)).body).toBe('A: późniejszy komentarz.');
  });
});

describe('E3-PR0b2b — „Scal pacjentów” i „spoza bazy” przenoszą notatki bez treści sprzed blokady', () => {
  const pacjentka = (imie, wzrost) => ({
    name: `Fikcyjna ${imie}`, user: { lastName: 'Fikcyjna', firstName: imie, sex: 'F', age: 9, height: wzrost, weight: 28 },
    advanced: { data: { measurements: [{ uid: `m-${wzrost}`, ageMonths: 110, ageYears: 110 / 12, height: wzrost, weight: 28 }] } },
  });
  // A i B — bliźniaki jednego konta; karty P i Q, notatka n pod P.
  async function poczatek() {
    const A = await sejf('A');
    krok(); const P = (await A.vault.savePatient(pacjentka('Ola', 131), { dedup: false })).patientId;
    krok(); const Q = (await A.vault.savePatient(pacjentka('Ewa', 128), { dedup: false })).patientId;
    krok(); const id = (await A.vault.savePatientNote({ patientId: P, title: 'n (fikcja)', body: 'Fikcyjna treść.', category: 'followup' })).id;
    const B = await sejf('B', { zKopii: A });
    krok(); await wyslij(A, B);
    krok();
    return { A, B, P, Q, id, karty: { [P]: 'P', [Q]: 'Q' } };
  }
  const gdzie = async (s, U) => { const n = await zapisana(U, s.id); return n ? s.karty[n.patientId] || '?' : 'brak'; };
  const tresc = async (U, id) => { const n = await U.vault.getPatientNote(id); return n ? n.body : null; };
  const popraw = (s, U, body) => { krok(); return U.vault.savePatientNote({ id: s.id, patientId: s.P, title: 'n (poprawka B)', body, category: 'followup' }); };

  it.each([1, 2])('B poprawia n %s raz(y) bez połączenia, A scala P → Q: po pierwszej wymianie n pod Q na obu, z poprawką B', async (ile) => {
    const s = await poczatek();
    for (let i = 1; i <= ile; i += 1) await popraw(s, s.B, `B: poprawka ${i} bez połączenia.`);
    krok(); await s.A.vault.mergePatients(s.P, s.Q);
    await wyslij(s.A, s.B); await wyslij(s.B, s.A);
    expect([await gdzie(s, s.A), await gdzie(s, s.B), await tresc(s.A, s.id), await tresc(s.B, s.id)])
      .toEqual(['Q', 'Q', `B: poprawka ${ile} bez połączenia.`, `B: poprawka ${ile} bez połączenia.`]);
  });

  it('B poprawia n, A scala P → Q, B najpierw dostaje ładunek A (P martwa): po jednej wymianie n pod Q na obu, z poprawką B', async () => {
    const s = await poczatek();
    await popraw(s, s.B, 'B: poprawka przed scaleniem na A.');
    krok(); await s.A.vault.mergePatients(s.P, s.Q);
    await wyslij(s.A, s.B);
    expect([await gdzie(s, s.B), await tresc(s.B, s.id)], 'B: karta martwa — notatka idzie do Q, treść B zostaje').toEqual(['Q', 'B: poprawka przed scaleniem na A.']);
    await wyslij(s.B, s.A);
    expect([await gdzie(s, s.A), await tresc(s.A, s.id)]).toEqual(['Q', 'B: poprawka przed scaleniem na A.']);
  });

  // Okno między listą notatek karty (odczyt „Scal pacjentów” przed blokadą) a zapisem pod blokadą notatki: w tym
  // czasie inna karta przeglądarki zapisuje wersję z drugiego urządzenia albo usuwa notatkę.
  function oknoListy(A, wOknie) {
    const lista = A.adapter.listPatientNotesForUser.bind(A.adapter);
    let uzbrojone = true;
    A.adapter.listPatientNotesForUser = async (...a) => {
      const w = await lista(...a);
      if (uzbrojone) { uzbrojone = false; await wOknie(); }
      return w;
    };
  }

  it('notatka zmieniona w oknie między listą notatek a blokadą: zostaje treść zapisana w oknie, pod kartą docelową', async () => {
    const s = await poczatek();
    await popraw(s, s.B, 'B: dawka 75 od jutra (zapis w oknie).');
    const wersjaB = await zapisana(s.B, s.id);
    krok();
    oknoListy(s.A, () => s.A.adapter.putPatientNoteForUser(s.A.uid, wersjaB));
    await s.A.vault.mergePatients(s.P, s.Q);
    expect([await gdzie(s, s.A), await tresc(s.A, s.id)]).toEqual(['Q', 'B: dawka 75 od jutra (zapis w oknie).']);
  });

  it('notatka usunięta w oknie między listą notatek a blokadą: pominięta — nie wraca, nagrobek zostaje', async () => {
    const s = await poczatek();
    krok(); await s.B.vault.removePatientNote(s.id);
    const nagrobek = (await s.B.adapter.listPatientNoteTombstonesForUser(s.B.uid)).find((t) => t.id === s.id);
    krok();
    oknoListy(s.A, async () => { await s.A.adapter.removePatientNoteForUser(s.A.uid, s.id); await s.A.adapter.putPatientNoteTombstoneForUser(s.A.uid, nagrobek); });
    await s.A.vault.mergePatients(s.P, s.Q);
    expect(await zapisana(s.A, s.id), 'usunięcie z okna nie jest cofane').toBeFalsy();
    expect((await s.A.adapter.listPatientNoteTombstonesForUser(s.A.uid)).map((t) => t.id)).toContain(s.id);
  });

  it('notatka z nieczytelnym szyfrogramem: przeniesiona pod kartę docelową bez ponownego szyfrowania (oryginał nie ginie)', async () => {
    const s = await poczatek();
    const r = await zapisana(s.A, s.id);
    const uszkodzony = { ...r.bodyCipher, data: r.bodyCipher.data.split('').reverse().join('') };
    await s.A.adapter.putPatientNoteForUser(s.A.uid, { ...r, bodyCipher: uszkodzony });
    krok(); await s.A.vault.mergePatients(s.P, s.Q);
    const po = await zapisana(s.A, s.id);
    expect([s.karty[po.patientId], po.bodyCipher]).toEqual(['Q', uszkodzony]);
  });

  it('„spoza bazy” (osoba z Terminarza dołączona do karty): notatka zmieniona w oknie zostaje z treścią z okna', async () => {
    const A = await sejf('A');
    krok(); const Q = (await A.vault.savePatient(pacjentka('Ewa', 128), { dedup: false })).patientId;
    krok(); const zew = await A.vault.saveExternalPatient({ lastName: 'Fikcyjny', firstName: 'Gość', sex: 'M', birthYear: 2016, contact: null });
    const X = zew.patientId;
    krok(); const id = (await A.vault.savePatientNote({ patientId: X, title: 'Wizyta gościa (fikcja)', body: 'Fikcyjna treść.', category: 'followup' })).id;
    const B = await sejf('B', { zKopii: A });
    krok(); await wyslij(A, B);
    krok(); await B.vault.savePatientNote({ id, patientId: X, title: 'Wizyta gościa (fikcja)', body: 'B: zmiana w oknie.', category: 'followup' });
    const wersjaB = await zapisana(B, id);
    krok();
    oknoListy(A, () => A.adapter.putPatientNoteForUser(A.uid, wersjaB));
    await A.vault.mergeExternalIntoPatient(X, Q);
    const po = await A.vault.getPatientNote(id);
    expect([po.patientId === Q, po.body]).toEqual([true, 'B: zmiana w oknie.']);
  });
});

describe('E3-PR0b2b — strażniki źródła: przeniesienie, Terminarz „Edytuj osobę”, wołający z baseNote', () => {
  const sejfZrodlo = zrodlo('vilda_vault.js');
  it('„Scal pacjentów” i „spoza bazy” wysyłają do zapisu tylko id, kartę docelową i wyczyszczenie nazwy osoby spoza bazy', () => {
    const wywolania = sejfZrodlo.match(/await ie\(\{id:[a-z]\.id,patientId:e,[^}]*\},B(?:sc|me)_s\)|await ie\(\{id:[a-z]\.id,patientId:e,[^}]*\},Bnp_zPrzeniesienia\(B(?:sc|me)_s\)\)/g) || [];
    expect(wywolania, 'dwa miejsca przeniesienia').toHaveLength(2);
    for (const w of wywolania) {
      expect(w, 'bez tytułu, treści, kategorii i terminu z odczytu sprzed blokady').not.toMatch(/title:|body:|category:|dueDateISO:/);
      expect(w, 'opcja przeniesienia: zmiana karty nie jest zmianą treści').toContain('Bnp_zPrzeniesienia(');
    }
  });

  it('Terminarz „Edytuj osobę” (wpis bez pacjenta) wysyła tylko id, kartę i nazwę osoby — tytuł tylko, gdy wpis go nie miał', () => {
    const t = zrodlo('vilda_terminarz.js');
    const i = t.indexOf('d==="sentinel"?L=a.savePatientNote(');
    expect(i, 'gałąź wpisu bez pacjenta').toBeGreaterThan(0);
    const obiekt = t.slice(i, t.indexOf('})', i) + 2);
    expect(obiekt).toContain('externalName:_');
    expect(obiekt, 'treść, kategoria i termin z listy sprzed okna nie wracają do zapisu').not.toMatch(/body:|category:|dueDateISO:/);
  });

  // Każdy wołający, który podaje baseUpdatedAtISO, podaje też wersję pokazaną lekarzowi (baseNote).
  it.each([
    ['vilda_auth_ui.js', 'baseUpdatedAtISO: row.n.updatedAtISO', 'formularz wykonania przypomnienia'],
    ['vilda_lab_history_tab.js', 'baseUpdatedAtISO: note.updatedAtISO', '„Opisz wynik” w Badaniach'],
    ['clcr_result_details.js', 'baseUpdatedAtISO: draft.note.updatedAtISO', 'zmiana wyniku Klirensu'],
    ['clcr_result_details.js', 'baseUpdatedAtISO: currentNote.updatedAtISO', 'usunięcie wyniku Klirensu'],
  ])('%s — %s (%s) idzie razem z baseNote', (plik, kotwica) => {
    const t = zrodlo(plik), i = t.indexOf(kotwica);
    expect(i, 'miejsce wywołania').toBeGreaterThan(0);
    const instrukcja = t.slice(t.lastIndexOf('\n', i), t.indexOf('\n', i));
    expect(instrukcja).toMatch(/baseNote\s*:/);
  });

  it('edytor notatki wysyła wersję, z którą się otworzył (baseNote), a „Nadpisz moją wersją” podnosi ją do wersji z sejfu', () => {
    const ui = zrodlo('vilda_auth_ui.js');
    expect(ui).toMatch(/Vt\.baseNote=/);
    const i = ui.indexOf('(Qbase=Qw0.rev);');
    expect(i).toBeGreaterThan(0);
    expect(ui.slice(i, i + 400), '„Nadpisz moją wersją” bierze current jako nową wersję pokazaną').toMatch(/QbaseN=Qw0&&Qw0\.current|baseNote=Qw0\.current/);
  });

  it('sejf: zwolnienie „ta sama widoczna wersja” tylko w gałęzi konfliktu po chwili zapisu — edytor, przypomnienia, wynik Klirensu', () => {
    expect(sejfZrodlo).toContain('function Bnp_takSamoWidoczna(');
    expect(sejfZrodlo).toMatch(/Bnp_takSamoWidoczna\(Qcf0,t\.baseNote,s,t\.baseUpdatedAtISO\)/);
    expect(sejfZrodlo).toMatch(/Bnp_takSamoWidoczna\(current, request\.baseNote, request\.id, request\.baseUpdatedAtISO\)/);
    expect(sejfZrodlo).toMatch(/Bnp_takSamoWidoczna\(current, next\.baseNote, next\.id, next\.baseUpdatedAtISO\)/);
    const narzedzie = zrodlo('tools/patch-vault-existing-note.mjs');
    expect(narzedzie, 'narzędzie Klirensu (blok istniejącego wyniku) zgodne z blokiem w sejfie').toContain('Bnp_takSamoWidoczna(current, next.baseNote, next.id, next.baseUpdatedAtISO)');
  });

  it('sejf: notatki według nowej reguły (Le pod blokadą i w filtrze, podgląd „Scal kopię konta”), listy i fragment natywny — dawnej', () => {
    for (const f of ['function Bnp_nowsza(', 'function Bnp_staraRegula(', 'function Bnp_chwilaTresci(', 'function Bnp_chwilaStanu(', 'function Bks_wygrywaNotatka(', 'function Bnp_zPrzeniesienia(', 'function Bnp_bezChwil(']) expect(sejfZrodlo, f).toContain(f);
    const i = sejfZrodlo.indexOf('function Bks_planDanych(');
    const planDanych = sejfZrodlo.slice(i, sejfZrodlo.indexOf('\n}\n', i));
    expect(planDanych, 'podgląd: notatki i Terminarz').toContain('Bks_wygrywaNotatka');
    expect(planDanych, 'podgląd: listy pacjentów').toContain('Bks_wygrywaRev');
    const od = sejfZrodlo.indexOf('/* BEGIN VILDA CLINICAL WORKSPACE NATIVE V1 */'), doo = sejfZrodlo.indexOf('/* END VILDA CLINICAL WORKSPACE NATIVE V1 */');
    expect(sejfZrodlo.slice(od, doo), 'fragment natywny bez zmian (dawna reguła wins)')
      .toContain("var wins = Bnp_rev(incoming) > Bnp_rev(stored) || Bnp_rev(incoming) === Bnp_rev(stored) && incoming.updatedAtISO > (stored.updatedAtISO || '');");
    const j = sejfZrodlo.indexOf('async function CareMvpWriteCalendarOriginal(');
    expect(sejfZrodlo.slice(j, sejfZrodlo.indexOf('\n', j)), 'oryginał terminu planu bez pól chwili z poprzedniego rekordu').toContain('Bnp_bezChwil(');
  });
});

describe('E3-PR0b2b — Terminarz „Edytuj osobę”: zapis samej nazwy osoby nie cofa treści zmienionej w oknie', () => {
  it('wpis bez pacjenta: treść i termin z wersji zapisanej zostają, nazwa osoby nowa', async () => {
    const A = await sejf('A');
    const PID = '__vilda_activity__';
    krok(); const { id } = await A.vault.savePatientNote({ patientId: PID, title: 'Fikcyjna konsultacja', body: 'Fikcyjna treść 1.', category: 'observation', dueDateISO: '2026-11-20', externalName: 'Fikcyjny Gość' });
    krok(); await A.vault.savePatientNote({ id, patientId: PID, title: 'Fikcyjna konsultacja', body: 'Treść zmieniona w oknie.', category: 'observation', dueDateISO: '2026-11-21', externalName: 'Fikcyjny Gość' });
    krok(); await A.vault.savePatientNote({ id, patientId: PID, externalName: 'Fikcyjny Gość Nowy' });
    const po = await A.vault.getPatientNote(id);
    expect([po.title, po.body, String(po.dueDateISO).slice(0, 10), po.externalName]).toEqual(['Fikcyjna konsultacja', 'Treść zmieniona w oknie.', '2026-11-21', 'Fikcyjny Gość Nowy']);
  });
});

describe('E3-PR0b2b — luki modułu planów z etapami (przypięte; poprawka w osobnym PR modułu planów)', () => {
  // Dowód kroku planu z etapami pamięta numer wersji dokumentu (sourceRecordRevAtCapture) i porównuje go z bieżącym rev
  // (vilda_care_plans.js, model z zamkniętą listą pól dowodu: vilda_care_plan_model.js). Po E3-PR0b2b scalenie może
  // przyjąć późniejszą treść z niższym rev (rev zostaje najwyższy — bez zmiany) albo podnieść sam rev bez zmiany treści.
  // Oba skutki przypinamy tu; po poprawce modułu (porównanie chwili treści) ten blok trzeba odwrócić.
  it('scalenie przyjmuje późniejszą treść z niższym rev, a rev dokumentu się nie zmienia — porównanie dowodu po rev tej zmiany nie widzi', async () => {
    const s = await dwaUrzadzenia();
    for (const t of ['A1.', 'A2.']) { krok(); await s.A.vault.savePatientNote({ patientId: s.patientId, id: s.id, title: 'Wizyta', body: t, category: 'observation' }); }
    const przypiety = (await s.A.vault.getPatientNote(s.id)).rev;
    krok(5000); await s.B.vault.savePatientNote({ patientId: s.patientId, id: s.id, title: 'Wizyta', body: 'B1 (później).', category: 'observation' });
    await wyslij(s.B, s.A);
    const po = await s.A.vault.getPatientNote(s.id);
    expect([po.body, po.rev], 'treść zmieniona, rev ten sam co przy przypięciu').toEqual(['B1 (później).', przypiety]);
  });

  it('zapis samego rev: dokument zostaje bez zmian treści, a rev rośnie — porównanie dowodu po rev zgłosi zmianę dokumentu (fałszywy alarm)', async () => {
    const s = await dwaUrzadzenia();
    for (const t of ['A1.', 'A2.']) { krok(); await s.A.vault.savePatientNote({ patientId: s.patientId, id: s.id, title: 'Wizyta', body: t, category: 'observation' }); }
    krok(5000); await s.B.vault.savePatientNote({ patientId: s.patientId, id: s.id, title: 'Wizyta', body: 'B1 (później).', category: 'observation' });
    const przypiety = (await s.B.vault.getPatientNote(s.id)).rev;
    await wyslij(s.A, s.B);
    const po = await s.B.vault.getPatientNote(s.id);
    expect([po.body, po.rev], 'ta sama treść, wyższy rev').toEqual(['B1 (później).', przypiety + 1]);
  });

  it('moduł planów z etapami nadal porównuje dowód kroku po rev, a model dowodu ma zamkniętą listę pól (noteId, sourceRecordRevAtCapture)', () => {
    const plany = zrodlo('vilda_care_plans.js');
    expect(plany).toContain('if (capturedRevisions.some(function (revision) { return revision !== stagedOriginal.rev; }))');
    expect(plany).toContain('Dokument został zmieniony po powiązaniu z planem.');
    expect(zrodlo('vilda_care_plan_model.js')).toContain("if (!fields(value, ['noteId', 'sourceRecordRevAtCapture'], path, issues)) return;");
  });
});
