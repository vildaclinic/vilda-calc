import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { wytnijFunkcje } from './sesja-zapisu-uprzaz.mjs';

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
//    2c — dowód kroku według chwili zmiany treści dokumentu (decyzja właściciela z 2026-11-17: pole niesie chwilę
//    zmiany treści dokumentu; nowe pole w dwóch wydaniach: najpierw odczyt i porównanie, zapis pola dopiero po
//    potwierdzeniu właściciela); reguła notatek we fragmencie natywnym — z artefaktów repozytorium źródeł modułu
//    (vilda-source, commit f2130f8993aa9f07de8b4ef7970b2cf23127c8dc): kontrola przed scaleniem wybiera zwycięzcę notatki
//    i nagrobka jak scalanie, a moduł zapisu planu porównuje dowód z polem po chwili treści, jak ekran planu i sejf.
// Opis: docs/clinical/ALGORITHMS.md (P-NOTATKA-POZNIEJSZA, P-KONFLIKT-ZAPISU-NOTATKI „Ograniczenia”, P-DOWOD-KROKU),
// docs/CARE_PLANS.md.
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

  it('[kontrola] baseNote różny w wieku wizyty (notatka z wiekiem wizyty): konflikt, nic nie zapisano', async () => {
    const s = await dwaUrzadzenia({ linkedAgeMonths: 110 });
    const naEkranie = await s.B.vault.getPatientNote(s.id);
    expect(naEkranie.linkedAgeMonths).toBe(110);
    await dotkniecie(s);
    const w = await s.B.vault.savePatientNote(edytor(s, naEkranie, 'B: zapis na innej wersji.', { baseNote: { ...naEkranie, linkedAgeMonths: 98 } }));
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
    const wynik = await s.A.vault.mergePatients(s.P, s.Q);
    expect(await zapisana(s.A, s.id), 'usunięcie z okna nie jest cofane').toBeFalsy();
    expect(wynik.notesMoved, 'pominięta notatka nie jest liczona jako przeniesiona').toBe(0);
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

  it('notatka z nieczytelnym szyfrogramem i polami klinicznymi w metadanych (stary zapis): lek, data kliniczna, zabieg i priorytet zostają po przeniesieniu', async () => {
    const s = await poczatek();
    const r = await zapisana(s.A, s.id);
    const uszkodzony = { ...r.bodyCipher, data: r.bodyCipher.data.split('').reverse().join('') };
    await s.A.adapter.putPatientNoteForUser(s.A.uid, { ...r, bodyCipher: uszkodzony,
      medication: { name: 'Fikcyjny lek', dose: '50 mg', action: 'start' }, clinicalDateISO: '2026-11-10', procedureType: 'Fikcyjny zabieg', waitlistPriority: 'urgent' });
    const pola = (n) => ({ medication: n.medication, clinicalDateISO: n.clinicalDateISO, procedureType: n.procedureType, waitlistPriority: n.waitlistPriority });
    const przed = pola(await s.A.vault.getPatientNote(s.id));
    expect(przed.medication, 'pola widoczne przed scaleniem').toBeTruthy();
    krok(); await s.A.vault.mergePatients(s.P, s.Q);
    const po = await s.A.vault.getPatientNote(s.id);
    expect([s.karty[po.patientId], pola(po)]).toEqual(['Q', przed]);
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
    expect(obiekt, 'tytuł z listy tylko dla wpisu bez tytułu (tytuł zmieniony w oknie nie jest cofany)')
      .toContain('Object.assign({id:t.id,patientId:i,externalName:_},t.title&&t.title.trim()?{}:{title:_})');
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

  it('sejf: notatki według nowej reguły (Le pod blokadą i w filtrze, podgląd „Scal kopię konta”, kontrola przed scaleniem we fragmencie natywnym), listy — dawnej', () => {
    for (const f of ['function Bnp_nowsza(', 'function Bnp_staraRegula(', 'function Bnp_chwilaTresci(', 'function Bnp_chwilaStanu(', 'function Bks_wygrywaNotatka(', 'function Bnp_zPrzeniesienia(', 'function Bnp_bezChwil(']) expect(sejfZrodlo, f).toContain(f);
    const i = sejfZrodlo.indexOf('function Bks_planDanych(');
    const planDanych = sejfZrodlo.slice(i, sejfZrodlo.indexOf('\n}\n', i));
    expect(planDanych, 'podgląd: notatki i Terminarz').toContain('Bks_wygrywaNotatka');
    expect(planDanych, 'podgląd: listy pacjentów').toContain('Bks_wygrywaRev');
    // Kontrola przed scaleniem we fragmencie natywnym (artefakty repozytorium źródeł modułu, vilda-source f2130f8993aa)
    // przewiduje wynik scalenia, więc wybiera zwycięzcę jak Le: notatki — Bnp_nowsza z informacją o planie zapisanym
    // tylko w zaszyfrowanej treści (Bnp_planyTutaj), nagrobka — Bnp_zwyciezcy z tą samą informacją. Działanie
    // (odmowa dla dokumentu-dowodu przenoszonego ładunkiem z niższym rev i późniejszą treścią) sprawdza e2e
    // tests/e2e/care-template-native-storage.spec.mjs.
    const od = sejfZrodlo.indexOf('/* BEGIN VILDA CLINICAL WORKSPACE NATIVE V1 */'), doo = sejfZrodlo.indexOf('/* END VILDA CLINICAL WORKSPACE NATIVE V1 */');
    const fragment = sejfZrodlo.slice(od, doo);
    expect(fragment, 'fragment natywny bez dawnej reguły wins (najpierw rev)').not.toContain('var wins = Bnp_rev(incoming) > Bnp_rev(stored)');
    expect(fragment, 'fragment natywny: plan zapisany tylko w treści tutejszej notatki')
      .toContain('var localPlans = await Bnp_planyTutaj([stored], [incoming], [incoming.id]); check();');
    expect(fragment, 'fragment natywny: zwycięzca notatki jak w Le').toContain('var wins = Bnp_nowsza(incoming, stored, localPlans.has(incoming.id));');
    expect(fragment, 'fragment natywny: plany tutaj dla nagrobka').toContain('var planyTutaj = await Bnp_planyTutaj(localRows, related, [tombId]); check();');
    expect(fragment.match(/Bnp_zwyciezcy\([^)]*\)/g), 'fragment natywny: zwycięzca nagrobka z planami tutaj, jedno wywołanie')
      .toEqual(['Bnp_zwyciezcy(localRows, related, planyTutaj)']);
    // Cała funkcja (wielowierszowa): rekord oryginału po edycji składany z poprzedniego rekordu bez jego pól chwil.
    const j = sejfZrodlo.indexOf('async function CareMvpWriteCalendarOriginal(');
    expect(j, 'funkcja zapisu oryginału terminu planu').toBeGreaterThan(0);
    expect(sejfZrodlo.slice(j, sejfZrodlo.indexOf('\n}\n', j)), 'oryginał terminu planu bez pól chwili z poprzedniego rekordu').toContain('Object.assign({}, Bnp_bezChwil(original), next, { bodyCipher })');
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

  it('wpis bez tytułu usunięty w innej karcie przed zapisem nazwy osoby: odmowa z komunikatem, wpis nie wraca bez treści i terminu', async () => {
    const A = await sejf('A');
    const PID = '__vilda_activity__';
    krok(); const { id } = await A.vault.savePatientNote({ patientId: PID, title: '', body: 'Fikcyjny opis wizyty.', category: 'followup', dueDateISO: '2026-11-20', externalName: 'Fikcyjny Gość' });
    krok(); await A.vault.removePatientNote(id);
    krok();
    // Ładunek Terminarza dla wpisu, który nie miał tytułu: id, karta, nazwa osoby i tytuł = nazwa.
    await expect(A.vault.savePatientNote({ id, patientId: PID, externalName: 'Fikcyjny Gość Nowy', title: 'Fikcyjny Gość Nowy' }))
      .rejects.toThrow('Ta notatka już nie istnieje');
    expect(await A.vault.getPatientNote(id), 'usunięty wpis nie wraca').toBeFalsy();
  });

  it('[kontrola] nowy wpis nieobecności bez treści z identyfikatorem nadanym przez Terminarz (seria): zapisany', async () => {
    const A = await sejf('A');
    const PID = '__vilda_activity__';
    krok();
    const r = await A.vault.savePatientNote({ id: 'fikcyjny-wpis-nieobecnosci-1', patientId: PID, externalName: '', title: 'Urlop (fikcja)', category: 'absence', dueDateISO: '2026-12-01', dueTime: null, seriesId: 'fikcyjna-seria-1' });
    expect(r.isNew).toBe(true);
    expect((await A.vault.getPatientNote('fikcyjny-wpis-nieobecnosci-1')).title).toBe('Urlop (fikcja)');
  });
});


describe('E3-PR0b2b — luki modułu planów z etapami: dowód kroku według chwili zmiany treści dokumentu (pole czytane i porównywane, zapis pola w drugim wydaniu); reguła notatek we fragmencie natywnym — z artefaktów repozytorium źródeł modułu', () => {
  // Dowód kroku planu z etapami pamięta numer wersji dokumentu (sourceRecordRevAtCapture). Po E3-PR0b2b scalenie może
  // przyjąć późniejszą treść z niższym rev (rev zostaje najwyższy — bez zmiany) albo podnieść sam rev bez zmiany treści.
  // 2c (P-DOWOD-KROKU), decyzja właściciela z 2026-11-17: pole niesie chwilę zmiany treści dokumentu
  // (sourceRecordContentAtISOAtCapture), nie chwilę zapisu. Ekran planu porównuje wtedy efektywną chwilę treści
  // dokumentu — regułą sejfu Bnp_chwilaTresci: contentAtISO tylko w postaci toISOString, nie później niż updatedAtISO
  // i z kotwicą contentForISO === updatedAtISO, inaczej updatedAtISO; dokładne napisy. Dowód bez pola — jak dotąd po rev.
  // Nowe pole w dwóch wydaniach: najpierw odczyt i porównanie, zapis pola dopiero po potwierdzeniu właściciela, że
  // wszystkie urządzenia mają pierwsze. Testy niżej pokazują na prawdziwym sejfie, które drogi zapisu zmieniają chwilę
  // treści, a które tylko chwilę zapisu; działanie ekranu i modeli: tests/unit/care-plan-staged-ui.test.mjs,
  // care-plan-model.test.mjs, care-plan-mutation.test.mjs.
  const sejfTekst = zrodlo('vilda_vault.js');
  const RETENCJA = { vildaRetention: '0' };
  const PLIKI_RATUNKU = ['vilda_crypto.js', 'vilda_retention.js', 'vilda_vault.js'];
  // Reguła sejfu wycięta z prawdziwego vilda_vault.js (Bnp_iso i Bnp_chwilaTresci) — ta sama, której używa scalanie.
  const chwilaTresciSejfu = new Function(`${wytnijFunkcje(sejfTekst, 'Bnp_iso')}\n${wytnijFunkcje(sejfTekst, 'Bnp_chwilaTresci')}\nreturn Bnp_chwilaTresci;`)();
  // Pola widoczne w dowodzie kroku planu: nagłówek (tytuł) i treść oryginału (termin z godziną, data badania, wynik, treść).
  const WIDOCZNE = ['title', 'body', 'dueDateISO', 'dueTime', 'clinicalDateISO', 'labResult'];
  const DOK = { title: 'Fikcyjny wynik', body: 'Fikcyjna treść wyniku.', category: 'observation', dueDateISO: '2026-11-30', dueTime: '09:30',
    clinicalDateISO: '2026-11-10', labResult: { test: 'Fikcyjne badanie', value: '2,1', valueNum: 2.1, unit: 'mIU/l', norm: '0,4–4,0' } };
  const bezChwil = (r) => { const x = { ...r }; for (const k of ['contentAtISO', 'contentForISO', 'stateAtISO', 'stateForISO']) delete x[k]; return x; };

  // Stan dokumentu tak, jak go widzi dowód kroku: pola widoczne, rev, chwila zapisu i chwila treści (reguła sejfu na
  // surowym rekordzie). Odczyt getPatientNote podaje contentAtISO tylko przy ważnej kotwicy — chwila z odczytu ta sama.
  async function stan(U, id) {
    const n = await U.vault.getPatientNote(id), r = await zapisana(U, id);
    expect(n, 'dokument jest w sejfie').toBeTruthy();
    const tresc = chwilaTresciSejfu(r);
    expect(n.contentAtISO === undefined ? n.updatedAtISO : n.contentAtISO, 'chwila treści z odczytu = chwila treści z rekordu').toBe(tresc);
    return { widoczne: JSON.stringify(WIDOCZNE.map((k) => (n[k] === undefined ? null : n[k]))), patientId: n.patientId, rev: n.rev,
      zapis: n.updatedAtISO, tresc, kotwica: typeof r.contentAtISO === 'string' && r.contentForISO === r.updatedAtISO };
  }
  async function dokument(U, extra = {}) {
    krok(); const patientId = (await U.vault.savePatient({ name: 'Fikcyjna Pacjentka Dowód', user: { sex: 'F', age: 9, height: 130, weight: 28 } }, { dedup: false })).patientId;
    krok(); const { id } = await U.vault.savePatientNote({ patientId, ...DOK, ...extra });
    krok();
    return { patientId, id };
  }
  const zapiszDok = (U, s, zmiana = {}) => U.vault.savePatientNote({ patientId: s.patientId, id: s.id, ...DOK, ...zmiana });

  it('scalenie przyjmuje późniejszą treść z niższym rev, a rev dokumentu się nie zmienia — po rev tej zmiany nie widać, po chwili treści — widać', async () => {
    const s = await dwaUrzadzenia();
    for (const t of ['A1.', 'A2.']) { krok(); await s.A.vault.savePatientNote({ patientId: s.patientId, id: s.id, title: 'Wizyta', body: t, category: 'observation' }); }
    const przed = await stan(s.A, s.id), przypiety = przed.rev;
    krok(5000); await s.B.vault.savePatientNote({ patientId: s.patientId, id: s.id, title: 'Wizyta', body: 'B1 (później).', category: 'observation' });
    await wyslij(s.B, s.A);
    const po = await stan(s.A, s.id);
    expect([JSON.parse(po.widoczne)[1], po.rev], 'treść zmieniona, rev ten sam co przy przypięciu').toEqual(['B1 (później).', przypiety]);
    expect(typeof przed.tresc, 'dokument przy przypięciu ma chwilę treści').toBe('string');
    expect(po.tresc, 'chwila treści się zmieniła — porównanie po niej tę zmianę widzi').not.toBe(przed.tresc);
    expect(po.tresc > przed.tresc, 'późniejsza chwila treści').toBe(true);
  });

  it('zapis samego rev: dokument zostaje bez zmian treści, a rev rośnie — po rev byłby fałszywy alarm, po chwili treści go nie ma', async () => {
    const s = await dwaUrzadzenia();
    for (const t of ['A1.', 'A2.']) { krok(); await s.A.vault.savePatientNote({ patientId: s.patientId, id: s.id, title: 'Wizyta', body: t, category: 'observation' }); }
    krok(5000); await s.B.vault.savePatientNote({ patientId: s.patientId, id: s.id, title: 'Wizyta', body: 'B1 (później).', category: 'observation' });
    const przed = await stan(s.B, s.id), przypiety = przed.rev;
    await wyslij(s.A, s.B);
    const po = await stan(s.B, s.id);
    expect([po.widoczne, po.rev], 'ta sama treść, wyższy rev').toEqual([przed.widoczne, przypiety + 1]);
    expect(po.tresc, 'chwila treści bez zmian — porównanie po niej nie zgłasza zmiany').toBe(przed.tresc);
    expect(po.zapis, 'chwila zapisu też bez zmian').toBe(przed.zapis);
  });

  // Import karty na urządzeniu bez dokumentu daje mu nową chwilę zapisu „teraz” i zachowuje chwilę treści z pliku
  // (kotwica nowej chwili zapisu); synchronizacja niesie nową chwilę zapisu dalej (ta sama treść i rev — wygrywa
  // późniejsza chwila zapisu). Pole z chwilą zapisu dawałoby tu trwały fałszywy „Dokument został zmieniony…” na każdym
  // urządzeniu — dlatego pole niesie chwilę treści: dowód złapany przed importem otwiera się wszędzie.
  it('import karty przesuwa chwilę zapisu, nie chwilę treści: dowód złapany przed importem otwiera się na urządzeniu z importem i na tym, które miało dokument od początku', async () => {
    const A = await sejf('A'), s = await dokument(A);
    const przed = await stan(A, s.id), plik = await A.vault.exportPatientEnvelope(s.patientId);
    krok(5 * MIN); const C = await sejf('C', { zKopii: A });
    await C.vault.importPatientFromEnvelope(plik, C.haslo);
    const naC = await stan(C, s.id);
    expect([naC.widoczne, naC.rev, naC.tresc], 'po imporcie: ta sama treść, rev i chwila treści').toEqual([przed.widoczne, przed.rev, przed.tresc]);
    expect(naC.zapis, 'po imporcie: nowa chwila zapisu').not.toBe(przed.zapis);
    expect(naC.kotwica, 'chwila treści z pliku zakotwiczona do nowej chwili zapisu').toBe(true);
    await wyslij(C, A);
    const naA = await stan(A, s.id);
    expect([naA.widoczne, naA.rev, naA.tresc], 'po synchronizacji: ta sama treść, rev i chwila treści').toEqual([przed.widoczne, przed.rev, przed.tresc]);
    expect(naA.zapis, 'chwila zapisu z importu doszła do urządzenia, które miało dokument od początku').toBe(naC.zapis);
  });

  // Groźny przypadek porównania po chwili zapisu w zwykłej pracy: A poprawia dokument dwa razy (pierwsza poprawka dochodzi
  // do C, druga nie), B — z pierwotną wersją — oznacza „wykonane”. Złączenia „treść stąd, oznaczenie stamtąd” liczone
  // z różnymi wersjami A dostają tę samą chwilę zapisu (1 ms po „wykonane”), a różną treść. Dowód złapany na C przy
  // pierwszej poprawce, potem na C przychodzi złączenie z drugą poprawką: chwila zapisu ta sama, chwila treści — nie.
  it.each([['trzy urządzenia: złączenie z drugą poprawką liczy A', false], ['cztery urządzenia: złączenie z drugą poprawką liczy D', true]])(
    'dwa złączenia z tą samą chwilą zapisu i różną treścią (%s): po chwili zapisu zmiany nie widać, po chwili treści — widać', async (_opis, cztery) => {
      const A = await sejf('A'), B = await sejf('B'), C = await sejf('C'), D = cztery ? await sejf('D') : null, s = await dokument(A);
      for (const U of [B, C, D]) if (U) await wyslij(A, U);
      krok(); await zapiszDok(A, s, { body: 'V2: pierwsza poprawka na A.' });
      await wyslij(A, C);
      krok(); await zapiszDok(A, s, { body: 'V3: druga poprawka na A.' });
      if (cztery) await wyslij(A, D);
      krok(); await B.vault.completePatientNote(s.id);
      await wyslij(B, C); await wyslij(B, cztery ? D : A);
      const przed = await stan(C, s.id);
      expect(JSON.parse(przed.widoczne)[1], 'dowód na C: pierwsza poprawka z „wykonane” z B').toBe('V2: pierwsza poprawka na A.');
      await wyslij(cztery ? D : A, C);
      const po = await stan(C, s.id);
      expect(JSON.parse(po.widoczne)[1], 'na C przyszła druga poprawka').toBe('V3: druga poprawka na A.');
      expect(po.zapis, 'ta sama chwila zapisu — porównanie po niej uznałoby dokument za niezmieniony').toBe(przed.zapis);
      expect(po.tresc, 'chwila treści się zmieniła — porównanie po niej pokazuje zmianę').not.toBe(przed.tresc);
      expect(po.tresc > przed.tresc).toBe(true);
    });

  // Zapisy bez zmiany widocznej treści: chwila zapisu się przesuwa (pole z chwilą zapisu dawałoby fałszywy alarm),
  // chwila treści zostaje — dowód złapany wcześniej otwiera się.
  const BEZ_ZMIANY_TRESCI = [
    ['„wykonane” na tym samym urządzeniu', async () => {
      const A = await sejf('A'), s = await dokument(A), przed = await stan(A, s.id);
      krok(); await A.vault.completePatientNote(s.id);
      return { przed, po: [await stan(A, s.id)] };
    }],
    ['„nie zgłosił się”, potem cofnięcie', async () => {
      const A = await sejf('A'), s = await dokument(A), przed = await stan(A, s.id);
      krok(); await A.vault.noShowPatientNote(s.id); const po1 = await stan(A, s.id);
      krok(); await A.vault.uncompletePatientNote(s.id);
      return { przed, po: [po1, await stan(A, s.id)] };
    }],
    ['„wykonane” z innego urządzenia', async () => {
      const A = await sejf('A'), B = await sejf('B'), s = await dokument(A);
      await wyslij(A, B); const przed = await stan(A, s.id);
      krok(); await B.vault.completePatientNote(s.id); await wyslij(B, A);
      return { przed, po: [await stan(A, s.id)] };
    }],
    ['zapis z edytora bez zmian, tu i z innego urządzenia', async () => {
      const A = await sejf('A'), B = await sejf('B'), s = await dokument(A);
      await wyslij(A, B); const przed = await stan(A, s.id);
      krok(); await zapiszDok(A, s); const tutaj = await stan(A, s.id);
      krok(); await zapiszDok(B, s); await wyslij(B, A);
      return { przed, po: [tutaj, await stan(A, s.id)] };
    }],
    ['złączenie: treść stąd, „wykonane” z innego urządzenia — na tym i na drugim urządzeniu', async () => {
      const A = await sejf('A'), B = await sejf('B'), s = await dokument(A);
      await wyslij(A, B);
      krok(); await zapiszDok(A, s, { body: 'A: późniejsza treść.' });
      const przed = await stan(A, s.id);
      krok(); await B.vault.completePatientNote(s.id); await wyslij(B, A);
      const naA = await stan(A, s.id); await wyslij(A, B);
      return { przed, po: [naA, await stan(B, s.id)] };
    }],
    ['„Scal kopię konta” z kopii z „wykonane” z innego urządzenia', async () => {
      const A = await sejf('A'), B = await sejf('B'), s = await dokument(A);
      await wyslij(A, B); const przed = await stan(A, s.id);
      krok(); await B.vault.completePatientNote(s.id);
      krok(); const kopiaKonta = await B.vault.exportVaultBackup();
      krok(); await A.vault.mergeVaultBackup(kopiaKonta, B.haslo);
      return { przed, po: [await stan(A, s.id)] };
    }],
    ['ratunek D-21 prawdziwą ścieżką („Usuń pacjenta” na A, późniejszy zapis karty na B)', async () => {
      const A = await sejf('A', { pliki: PLIKI_RATUNKU, ustawienia: RETENCJA }), B = await sejf('B', { pliki: PLIKI_RATUNKU, ustawienia: RETENCJA });
      const karta = (height) => ({ name: 'Fikcyjny Ratunek', user: { lastName: 'Fikcyjny', firstName: 'Ratunek', dobISO: '2016-03-12', sex: 'M', height, weight: 24 } });
      krok(); const { patientId } = await A.vault.savePatient(karta(120), { dedup: false });
      krok(); await A.vault.savePatient(karta(125), { dedup: false, patientId });
      krok(1000); const { id } = await A.vault.savePatientNote({ patientId, ...DOK });
      await wyslij(A, B); const przed = await stan(B, id);
      krok(); await A.vault.removePatient(patientId);
      krok(); await B.vault.savePatient(karta(130), { dedup: false, patientId });
      krok(5000); await wyslij(A, B);
      return { przed, po: [await stan(B, id)] };
    }],
  ];
  it.each(BEZ_ZMIANY_TRESCI)('%s: chwila zapisu się przesuwa, chwila treści zostaje — dowód złapany wcześniej otwiera się', async (_opis, przebieg) => {
    const { przed, po } = await przebieg();
    for (const [i, teraz] of po.entries()) {
      expect(teraz.widoczne, `odczyt ${i + 1}: widoczna treść bez zmian`).toBe(przed.widoczne);
      expect(teraz.zapis, `odczyt ${i + 1}: nowa chwila zapisu`).not.toBe(przed.zapis);
      expect(teraz.tresc, `odczyt ${i + 1}: ta sama chwila treści`).toBe(przed.tresc);
      expect(teraz.kotwica, `odczyt ${i + 1}: chwila treści zakotwiczona do nowej chwili zapisu`).toBe(true);
    }
  });

  // Znane ograniczenie (jak przy rev i chwili zapisu): wskrzeszenie usuniętej notatki tą samą treścią („Zostaw notatkę”)
  // jest nowym zapisem treści — dowód pokaże „Dokument został zmieniony…”.
  it('wskrzeszenie usuniętej notatki tą samą treścią daje nową chwilę treści', async () => {
    const A = await sejf('A'), s = await dokument(A), przed = await stan(A, s.id);
    krok(); await A.vault.removePatientNote(s.id);
    krok(); await zapiszDok(A, s);
    const po = await stan(A, s.id);
    expect(po.widoczne).toBe(przed.widoczne);
    expect(po.tresc, 'nowa chwila treści').not.toBe(przed.tresc);
    expect(po.kotwica, 'bez kotwicy: chwila treści = chwila zapisu').toBe(false);
  });

  // Znane ograniczenie porównania po chwili treści (zbieg stempli co do milisekundy): dwie różne treści zapisane w tej
  // samej milisekundzie na dwóch urządzeniach. Scalenie zostawia wersję z wyższym rev, a obie wersje mają tę samą chwilę
  // treści — dowód z chwilą treści złapany przy wersji przegranej nie pokaże zmiany. Rev ją pokazuje.
  it('znane ograniczenie: dwie różne treści z tej samej milisekundy na dwóch urządzeniach mają tę samą chwilę treści', async () => {
    const A = await sejf('A'), B = await sejf('B'), s = await dokument(A);
    await wyslij(A, B);
    krok(); await zapiszDok(A, s, { body: 'A: pierwsza poprawka.' });
    krok(); const ta = teraz;
    await zapiszDok(A, s, { body: 'A: druga poprawka (wyższy rev).' });
    ustaw(ta); await zapiszDok(B, s, { body: 'B: poprawka z tej samej milisekundy.' });
    const przed = await stan(B, s.id);
    await wyslij(A, B);
    const po = await stan(B, s.id);
    expect(JSON.parse(po.widoczne)[1], 'zostaje wersja z wyższym rev').toBe('A: druga poprawka (wyższy rev).');
    expect(po.tresc, 'ta sama chwila treści — porównanie po niej tej zmiany nie widzi').toBe(przed.tresc);
    expect(po.rev, 'rev się zmienił — porównanie po rev ją widzi').not.toBe(przed.rev);
  });

  // Jedna reguła w trzech miejscach (sejf, ekran planu, moduł zapisu planu): funkcja ekranu wycięta z vilda_care_plans.js
  // ma dawać dla tych samych rekordów tę samą chwilę co Bnp_chwilaTresci z sejfu — z surowego rekordu i z odczytu
  // getPatientNote (który podaje contentAtISO tylko przy ważnej kotwicy). Te same przypadki sprawdza test modułu zapisu
  // planu z aktywnej rodziny modułów natywnych niżej.
  const ekranPlanu = () => new Function(`${wytnijFunkcje(zrodlo('vilda_care_plans.js'), 'stagedContentInstant')}\nreturn stagedContentInstant;`)();
  const KOTWICE = (() => {
    const U = '2026-11-16T09:00:00.000Z', C = '2026-11-16T08:30:00.000Z';
    return [
      ['bez kotwicy', { updatedAtISO: U }],
      ['ważna kotwica', { updatedAtISO: U, contentAtISO: C, contentForISO: U }],
      ['kotwica innej chwili zapisu', { updatedAtISO: U, contentAtISO: C, contentForISO: '2026-11-16T08:45:00.000Z' }],
      ['chwila treści bez contentForISO', { updatedAtISO: U, contentAtISO: C }],
      ['chwila treści późniejsza niż chwila zapisu', { updatedAtISO: C, contentAtISO: U, contentForISO: C }],
      ['chwila treści równa chwili zapisu', { updatedAtISO: U, contentAtISO: U, contentForISO: U }],
      ['chwila treści bez milisekund', { updatedAtISO: U, contentAtISO: '2026-11-16T08:30:00Z', contentForISO: U }],
      ['chwila treści z przesunięciem strefy', { updatedAtISO: U, contentAtISO: '2026-11-16T09:30:00.000+01:00', contentForISO: U }],
      ['chwila treści z niemożliwym dniem', { updatedAtISO: U, contentAtISO: '2026-02-31T08:30:00.000Z', contentForISO: U }],
      ['chwila treści jako liczba', { updatedAtISO: U, contentAtISO: Date.parse(C), contentForISO: U }],
      ['chwila zapisu bez milisekund z kotwicą do niej', { updatedAtISO: '2026-11-16T09:00:00Z', contentAtISO: C, contentForISO: '2026-11-16T09:00:00Z' }],
      ['chwila zapisu bez milisekund, bez kotwicy', { updatedAtISO: '2026-11-16T09:00:00Z' }],
      // Rok w postaci rozszerzonej: toISOString oddaje ten sam napis, ale to nie postać czterocyfrowa (Bnp_iso).
      ['chwila treści z rokiem w postaci rozszerzonej po 9999', { updatedAtISO: U, contentAtISO: '+010000-01-01T00:00:00.000Z', contentForISO: U }],
      ['chwila treści z rokiem w postaci rozszerzonej przed rokiem 0', { updatedAtISO: U, contentAtISO: '-000001-01-01T00:00:00.000Z', contentForISO: U }],
      // Napis w postaci czterocyfrowej, który nie jest chwilą (miesiąc 13): reguła go nie liczy i nie rzuca wyjątku.
      ['chwila treści z niemożliwym miesiącem', { updatedAtISO: U, contentAtISO: '2026-13-16T08:30:00.000Z', contentForISO: U }],
    ];
  })();
  // Rekordy bez chwili zapisu (pole usunięte): sejf daje pusty napis, ekran i moduł zapisu — brak chwili.
  const BEZ_CHWILI_ZAPISU = [{}, { contentAtISO: '2026-11-16T08:30:00.000Z', contentForISO: '2026-11-16T08:30:00.000Z' }, { contentAtISO: '2026-11-16T08:30:00.000Z' }];
  it('funkcja ekranu planu (stagedContentInstant) liczy chwilę treści tak samo jak sejf (Bnp_chwilaTresci) dla tych samych rekordów, przy ważnej i nieważnych kotwicach', async () => {
    const ekran = ekranPlanu();
    const A = await sejf('A'), s = await dokument(A), r0 = bezChwil(await zapisana(A, s.id));
    const C = '2026-11-16T08:30:00.000Z';
    for (const [opis, pola] of KOTWICE) {
      await A.adapter.putPatientNoteForUser(A.uid, { ...r0, ...pola });
      const surowy = await zapisana(A, s.id), odczyt = await A.vault.getPatientNote(s.id), wSejfie = chwilaTresciSejfu(surowy);
      expect(ekran(surowy), `${opis}: z surowego rekordu`).toBe(wSejfie);
      expect(ekran(odczyt), `${opis}: z odczytu getPatientNote`).toBe(wSejfie);
      expect(odczyt.contentAtISO !== undefined, `${opis}: odczyt podaje contentAtISO tylko przy ważnej kotwicy`).toBe(wSejfie !== surowy.updatedAtISO);
    }
    // Bez chwili zapisu sejf daje pusty napis (żaden dowód mu nie odpowiada), ekran — brak chwili (dokument „zmieniony”).
    for (const pola of BEZ_CHWILI_ZAPISU) {
      const rekord = { ...r0, ...pola }; delete rekord.updatedAtISO;
      await A.adapter.putPatientNoteForUser(A.uid, rekord);
      const surowy = await zapisana(A, s.id), odczyt = await A.vault.getPatientNote(s.id);
      expect(chwilaTresciSejfu(surowy), JSON.stringify(pola)).toBe('');
      expect(ekran(surowy), JSON.stringify(pola) + ': z surowego rekordu').toBeNull();
      expect(ekran(odczyt), JSON.stringify(pola) + ': z odczytu getPatientNote').toBeNull();
    }
    // Pusta chwila zapisu: z surowego rekordu sejf i ekran dają ten sam pusty napis, a odczyt getPatientNote podaje brak
    // chwili zapisu, więc ekran — brak chwili. Pole dowodu nigdy nie jest pustym napisem (walidator modelu), więc w obu
    // przypadkach dokument jest „zmieniony”.
    await A.adapter.putPatientNoteForUser(A.uid, { ...r0, updatedAtISO: '', contentAtISO: C, contentForISO: '' });
    const pustySurowy = await zapisana(A, s.id), pustyOdczyt = await A.vault.getPatientNote(s.id);
    expect([chwilaTresciSejfu(pustySurowy), ekran(pustySurowy)], 'pusta chwila zapisu: z surowego rekordu').toEqual(['', '']);
    expect([pustyOdczyt.updatedAtISO, pustyOdczyt.contentAtISO, ekran(pustyOdczyt)], 'pusta chwila zapisu: z odczytu getPatientNote').toEqual([null, undefined, null]);
  });

  // Trzecia kopia reguły: moduł zapisu planu z aktywnej rodziny modułów natywnych, zbudowanej w repozytorium źródeł
  // modułu (vilda-source) — plan-service.mjs porównuje dowód z polem funkcją documentContentInstant z adapter.mjs, a adapter
  // podaje dokument z chwilami rekordu (createNativeStage, konto przygotowane). Prawdziwe moduły z katalogu rodziny,
  // import jak w testach rodziny (przez manifest), prawdziwe modele planu z tego repozytorium.
  const manifestRodziny = JSON.parse(zrodlo('runtime/clinical-workspace-v1/manifest.json'));
  const katalogRodziny = path.join(korzen, 'runtime/clinical-workspace-v1', manifestRodziny.moduleTreeSHA256.slice(0, 12),
    'client/patient-clinical-workspace-native');
  const modulRodziny = (plik) => import(pathToFileURL(path.join(katalogRodziny, plik)).href);
  // Dokument czytany przez moduł na koncie przygotowanym: obraz z jedną kartą i jednym rekordem notatki. Odszyfrowana treść
  // ma własne (fikcyjne, wcześniejsze) klucze chwil — moduł nie może ich przepuścić.
  const TRESC_Z_CHWILAMI = { title: 'Fikcyjny wynik', body: 'Fikcyjna treść wyniku.', updatedAtISO: '2000-01-01T00:00:00.000Z',
    contentAtISO: '2000-01-01T00:00:00.000Z', contentForISO: '2000-01-01T00:00:00.000Z' };
  function obrazModulu(STORE_KEYS, rekordy = []) {
    const image = { stores: Object.keys(STORE_KEYS).map((name) => ({ name, records: [] })), clinicalMeta: { key: 'singleton', value: {} }, shadows: [] };
    const sklep = (name) => image.stores.find((store) => store.name === name).records;
    sklep('patients').push({ key: 'fikcyjna-karta-modulu', value: { patientId: 'fikcyjna-karta-modulu', header: { name: 'Fikcyjna Pacjentka Modułu' } } });
    for (const value of rekordy) sklep('patientNotes').push({ key: value.id, value });
    return image;
  }
  const etapModulu = (createNativeStage, image, zegar) => createNativeStage({ accountId: 'fikcyjne-konto-modulu', image, assertCurrent() {},
    legacyAdapter: {}, decrypt: async () => kopia(TRESC_Z_CHWILAMI), encrypt: async (value) => ({ iv: 'fikcyjny-iv', data: JSON.stringify(value) }),
    clock: () => kopia(zegar) });
  const rekordModulu = (pola, id = 'fikcyjny-dokument-modulu') => {
    const r = { id, patientId: 'fikcyjna-karta-modulu', category: 'observation', rev: 1, bodyCipher: { iv: 'fikcyjny-iv', data: '{}' }, ...pola };
    for (const k of Object.keys(r)) if (r[k] === undefined) delete r[k];
    return r;
  };
  const ZEGAR_MODULU = { recordedAtISO: '2026-11-16T10:00:00.000Z', recordedLocalDateISO: '2026-11-16', originTimeZone: 'Europe/Warsaw' };

  it('moduł zapisu planu z aktywnej rodziny (documentContentInstant z adapter.mjs, której używa plan-service.mjs) liczy chwilę treści tak samo jak ekran planu i sejf — trzy kopie reguły, jedna odpowiedź', async () => {
    const adapterModulu = await modulRodziny('adapter.mjs');
    expect(typeof adapterModulu.documentContentInstant, 'reguła chwili treści w module natywnym').toBe('function');
    expect(readFileSync(path.join(katalogRodziny, 'plan-service.mjs'), 'utf8'), 'moduł zapisu bierze regułę z adaptera')
      .toContain("import { documentContentInstant } from './adapter.mjs';");
    const modul = adapterModulu.documentContentInstant, ekran = ekranPlanu();
    async function odczytModulu(rekord) {
      const etap = etapModulu(adapterModulu.createNativeStage, obrazModulu(adapterModulu.STORE_KEYS, [rekord]), ZEGAR_MODULU);
      try { return await etap.transaction.getDocument(rekord.id); } finally { etap.finish(); }
    }
    const A = await sejf('A'), s = await dokument(A), r0 = bezChwil(await zapisana(A, s.id));
    for (const [opis, pola] of KOTWICE) {
      await A.adapter.putPatientNoteForUser(A.uid, { ...r0, ...pola });
      const surowy = await zapisana(A, s.id), wSejfie = chwilaTresciSejfu(surowy);
      const zSejfu = await A.vault.getPatientNote(s.id), zModulu = await odczytModulu(rekordModulu(pola));
      expect([modul(surowy), ekran(surowy)], `${opis}: z surowego rekordu (moduł, ekran)`).toEqual([wSejfie, wSejfie]);
      expect([modul(zSejfu), modul(zModulu), ekran(zModulu)], `${opis}: z odczytu sejfu i odczytu modułu`).toEqual([wSejfie, wSejfie, wSejfie]);
      expect([zModulu.updatedAtISO, zModulu.contentAtISO, zModulu.contentForISO], `${opis}: odczyt modułu podaje chwile jak odczyt sejfu`)
        .toEqual([zSejfu.updatedAtISO, zSejfu.contentAtISO, zSejfu.contentForISO]);
    }
    for (const pola of BEZ_CHWILI_ZAPISU) {
      const rekord = { ...r0, ...pola }; delete rekord.updatedAtISO;
      await A.adapter.putPatientNoteForUser(A.uid, rekord);
      const surowy = await zapisana(A, s.id), zSejfu = await A.vault.getPatientNote(s.id), zModulu = await odczytModulu(rekordModulu(pola));
      expect(chwilaTresciSejfu(surowy), JSON.stringify(pola)).toBe('');
      expect([modul(surowy), modul(zSejfu), modul(zModulu), ekran(zModulu)], JSON.stringify(pola) + ': brak chwili').toEqual([null, null, null, null]);
      expect([zModulu.updatedAtISO, zModulu.contentAtISO, zModulu.contentForISO], JSON.stringify(pola) + ': bez kluczy chwil z treści').toEqual([null, undefined, undefined]);
    }
    // Pusta chwila zapisu: z surowego rekordu sejf, ekran i moduł dają ten sam pusty napis; odczyt sejfu podaje brak chwili
    // zapisu, odczyt modułu — pusty napis z rekordu. Pole dowodu nigdy nie jest pustym napisem (walidator modelu), więc
    // każda z tych odpowiedzi daje „zmieniony”.
    const pusty = { updatedAtISO: '', contentAtISO: '2026-11-16T08:30:00.000Z', contentForISO: '' };
    await A.adapter.putPatientNoteForUser(A.uid, { ...r0, ...pusty });
    const pustySurowy = await zapisana(A, s.id), pustyZModulu = await odczytModulu(rekordModulu(pusty));
    expect([chwilaTresciSejfu(pustySurowy), ekran(pustySurowy), modul(pustySurowy)], 'pusta chwila zapisu: z surowego rekordu').toEqual(['', '', '']);
    expect([modul(await A.vault.getPatientNote(s.id)), modul(pustyZModulu), pustyZModulu.contentAtISO], 'pusta chwila zapisu: z odczytów').toEqual([null, '', undefined]);
  });

  // Decyzja modułu zapisu na prawdziwych modułach: plan utworzony z szablonu przez plan-service.mjs na koncie przygotowanym
  // (createNativeStage z adapter.mjs), potwierdzenie kroku istniejącym dokumentem z polem sourceRecordContentAtISOAtCapture
  // (tak zapisze je drugie wydanie). Zapis przechodzi tylko wtedy, gdy pole jest dokładnie chwilą treści dokumentu według
  // sejfu (Bnp_chwilaTresci) i ekranu planu; każda inna chwila, także ta sama zapisana bez milisekund, daje odmowę
  // CARE_APPLICATION_DOCUMENT_CHANGED — przy tym samym rev dokumentu co w dowodzie. Dokument bez chwili zapisu — odmowa.
  it('moduł zapisu planu z aktywnej rodziny (plan-service.mjs na adapterze konta przygotowanego) przyjmuje dowód z polem tylko przy chwili równej chwili treści dokumentu według sejfu — dokładny napis, ten sam rev', async () => {
    const { createCarePlanService } = await modulRodziny('plan-service.mjs'), adapterModulu = await modulRodziny('adapter.mjs');
    const okno = { crypto: { subtle: webcrypto.subtle } }, kontekst = vm.createContext({ window: okno });
    for (const plik of ['vilda_care_plan_model.js', 'vilda_care_template_model.js', 'vilda_care_plan_mutation.js']) vm.runInContext(zrodlo(plik), kontekst);
    const templateModel = okno.VildaCareTemplateModel, mutationModel = okno.VildaCarePlanMutation;
    const definicja = { contentVersion: 1, name: 'Fikcyjny plan modułu', purpose: 'Fikcyjny cel.', labels: [], stageOrder: ['fikcyjny-etap'],
      stages: [{ id: 'fikcyjny-etap', title: 'Fikcyjny etap', stepIds: ['fikcyjny-krok'] }],
      steps: [{ id: 'fikcyjny-krok', stageId: 'fikcyjny-etap', title: 'Fikcyjne badanie', taskKind: 'examination', instruction: 'Fikcyjna instrukcja.',
        requiredOutcome: 'resultReceipt', reminderRule: { kind: 'none' }, includedByDefault: true }] };
    const przygotowany = await templateModel.prepareTemplateOperation(null, { action: 'save', templateId: 'fikcyjny-szablon-modulu',
      operationId: 'fikcyjna-op-szablon-modulu', baseToken: null, definition: definicja }, { recordedAtISO: ZEGAR_MODULU.recordedAtISO });
    expect(przygotowany.ok, przygotowany.code).toBe(true);
    const widok = przygotowany.view, rewizja = widok.revisions.find((item) => item.id === widok.headRevisionId);
    const szablon = { templateId: widok.templateId, status: 'active', baseToken: widok.baseToken, headRevisionId: widok.headRevisionId,
      revisionId: widok.headRevisionId, revisionNumber: rewizja.revisionNumber, title: rewizja.definition.name, definition: rewizja.definition,
      stageCount: rewizja.definition.stages.length, stepCount: rewizja.definition.steps.length, conflicts: null, revisions: widok.revisions, syncState: { pending: 0 } };
    let obraz = obrazModulu(adapterModulu.STORE_KEYS), numer = 0;
    async function wEtapie(callback, zapis) {
      const etap = etapModulu(adapterModulu.createNativeStage, obraz, ZEGAR_MODULU);
      try { const wynik = await callback(etap.transaction); if (zapis && etap.changed) obraz = etap.image(); return wynik; } finally { etap.finish(); }
    }
    const usluga = createCarePlanService({ templateModel, mutationModel,
      workspace: { getCapability: async () => ({ available: true }), read: (callback) => wEtapie(callback, false), transact: (_, callback) => wEtapie(callback, true) },
      readTemplate: async () => kopia(szablon), listPatients: async () => [{ patientId: 'fikcyjna-karta-modulu', header: { name: 'Fikcyjna Pacjentka Modułu' } }],
      captureSession: () => Object.freeze({ epoch: 1 }), assertSession: (token) => { if (!token || token.epoch !== 1) throw new Error('fikcyjna-zmiana-sesji'); },
      newId: () => `fikcyjny-id-modulu-${++numer}`, clock: () => kopia(ZEGAR_MODULU) });
    const wejscie = { patientId: 'fikcyjna-karta-modulu', templateId: szablon.templateId, revisionId: szablon.revisionId };
    const szkic = await usluga.application.prepare(wejscie);
    const { plan } = await usluga.application.commit({ ...wejscie, token: szkic.token, operationId: 'fikcyjna-op-plan-modulu', definition: kopia(szkic.definition) });
    const poUtworzeniu = kopia(obraz), ekran = ekranPlanu();
    async function potwierdz(pola, chwila) {
      obraz = kopia(poUtworzeniu);
      const rekord = rekordModulu({ rev: 3, ...pola });
      obraz.stores.find((store) => store.name === 'patientNotes').records.push({ key: rekord.id, value: rekord });
      let wynik;
      try {
        wynik = await usluga.mutate({ action: 'recordFact', operationId: `fikcyjna-op-dowod-${++numer}`, planId: plan.id, patientId: plan.patientId,
          expectedRevision: plan.rev, stepId: plan.careContext.steps[0].id, factId: `fikcyjny-fakt-${numer}`, kind: 'resultReceipt', effectiveDateISO: '2026-11-16',
          evidence: { noteId: rekord.id, sourceRecordRevAtCapture: 3, sourceRecordContentAtISOAtCapture: chwila } });
      } catch (error) { return error.code || error.message; }
      expect(wynik.plan.careContext.facts[0].evidence.sourceRecordContentAtISOAtCapture, 'pole w zapisanym planie').toBe(chwila);
      return 'zapis';
    }
    // Chwile, które przechodzą sprawdzian modelu (RRRR-MM-DDTgg:mm:ss[.mmm]Z), w tym ta sama chwila bez milisekund.
    const CHWILE = ['2026-11-16T09:00:00.000Z', '2026-11-16T08:30:00.000Z', '2026-11-16T08:45:00.000Z', '2026-11-16T09:00:00Z', '2026-11-16T08:30:00Z'];
    const przypadki = [...KOTWICE, ...BEZ_CHWILI_ZAPISU.map((pola) => [`bez chwili zapisu ${JSON.stringify(pola)}`, pola]),
      ['pusta chwila zapisu', { updatedAtISO: '', contentAtISO: '2026-11-16T08:30:00.000Z', contentForISO: '' }]];
    for (const [opis, pola] of przypadki) {
      const rekord = rekordModulu({ rev: 3, ...pola }), wSejfie = chwilaTresciSejfu(rekord);
      const wyniki = [];
      for (const chwila of CHWILE) {
        const oczekiwany = wSejfie !== '' && chwila === wSejfie ? 'zapis' : 'CARE_APPLICATION_DOCUMENT_CHANGED';
        expect(ekran(rekord) === chwila, `${opis}, ${chwila}: ekran planu tak samo`).toBe(oczekiwany === 'zapis');
        wyniki.push([chwila, await potwierdz(pola, chwila), oczekiwany]);
      }
      expect(wyniki.map(([chwila, wynik]) => [chwila, wynik]), opis).toEqual(wyniki.map(([chwila, , oczekiwany]) => [chwila, oczekiwany]));
      expect(wyniki.filter(([, wynik]) => wynik === 'zapis').length, `${opis}: przechodzi dokładnie chwila treści według sejfu`)
        .toBe(CHWILE.includes(wSejfie) ? 1 : 0);
    }
  });

  // Niezmiennik (chwila treści robi z kotwicy własność bezpieczeństwa dowodu, nie tylko regułę scalania): każdy zapis
  // notatki, który zmienia pole widoczne w dowodzie, nie zostawia ważnej kotwicy ze starą chwilą treści. Dokument startuje
  // z ważną kotwicą (zapis z edytora bez zmian), więc stara chwila treści jest w rekordzie i mogłaby przetrwać.
  const ZMIANY_WIDOCZNE = [
    ['treść', { body: 'Fikcyjna treść wyniku — poprawiona.' }],
    ['tytuł', { title: 'Fikcyjny wynik (kontrola)' }],
    ['termin', { dueDateISO: '2026-12-02' }],
    ['godzina', { dueTime: '11:00' }],
    ['data badania', { clinicalDateISO: '2026-11-11' }],
    ['wartość wyniku', { labResult: { ...DOK.labResult, value: '7,9', valueNum: 7.9 } }],
    ['jednostka wyniku', { labResult: { ...DOK.labResult, unit: 'µIU/ml' } }],
  ];
  async function zakotwiczony(U) {
    const s = await dokument(U);
    krok(); await zapiszDok(U, s);
    const przed = await stan(U, s.id);
    expect(przed.kotwica, 'start: ważna kotwica ze starą chwilą treści').toBe(true);
    return { s, przed };
  }
  function niezmiennik(przed, po, opis) {
    expect(po.widoczne, `${opis}: pole widoczne zmienione`).not.toBe(przed.widoczne);
    expect(po.tresc, `${opis}: nie zostaje stara chwila treści`).not.toBe(przed.tresc);
    expect(po.tresc > przed.tresc, `${opis}: chwila treści późniejsza`).toBe(true);
  }
  const DROGI = [
    ['zapis z edytora', async (zmiana) => {
      const A = await sejf('A'), { s, przed } = await zakotwiczony(A);
      krok(); await zapiszDok(A, s, zmiana);
      return { przed, po: await stan(A, s.id) };
    }],
    ['późniejsza treść z innego urządzenia (scalenie synchronizacji)', async (zmiana) => {
      const A = await sejf('A'), B = await sejf('B'), { s, przed } = await zakotwiczony(A);
      await wyslij(A, B);
      krok(); await zapiszDok(B, s, zmiana); await wyslij(B, A);
      return { przed, po: await stan(A, s.id) };
    }],
    ['złączenie: treść z innego urządzenia, „wykonane” stąd (scalenie synchronizacji)', async (zmiana) => {
      const A = await sejf('A'), B = await sejf('B'), { s } = await zakotwiczony(A);
      await wyslij(A, B);
      krok(); await zapiszDok(B, s, zmiana);
      krok(); await A.vault.completePatientNote(s.id);
      const przed = await stan(A, s.id);
      await wyslij(B, A);
      const po = await stan(A, s.id);
      expect(po.zapis > przed.zapis && po.zapis !== przed.zapis, 'złączenie z nową chwilą zapisu').toBe(true);
      return { przed, po };
    }],
    // Osobna gałąź scalenia: to samo oznaczenie po obu stronach, a chwila oznaczenia tylko tutaj. „Przełóż” potwierdza
    // tu sprawę otwartą z chwilą tego zapisu; wersja z innego urządzenia jest otwarta bez tej chwili i ma późniejszą treść.
    // Treść przychodzi z ładunku, oznaczenie zostaje tutejsze bez złączenia (chwila zapisu z ładunku). Bez zmiany terminu:
    // nowy termin z edytora też zapisuje chwilę oznaczenia, więc wtedy scalenie idzie drogą „późniejsza treść z innego
    // urządzenia” wyżej.
    ['„Przełóż” stąd, późniejsza treść z innego urządzenia (scalenie synchronizacji, oznaczenie zostaje tutejsze)', async (zmiana) => {
      const A = await sejf('A'), B = await sejf('B'), { s } = await zakotwiczony(A);
      await wyslij(A, B);
      krok(); await A.vault.snoozePatientNote(s.id, '2026-12-05');
      const przed = await stan(A, s.id), oznaczenie = (await zapisana(A, s.id)).stateAtISO;
      expect(typeof oznaczenie, '„Przełóż” zapisuje chwilę oznaczenia').toBe('string');
      krok(); await zapiszDok(B, s, zmiana); await wyslij(B, A);
      const po = await stan(A, s.id), r = await zapisana(A, s.id);
      expect([r.updatedAtISO, r.stateAtISO], 'bez złączenia: chwila zapisu z ładunku, chwila oznaczenia stąd')
        .toEqual([(await zapisana(B, s.id)).updatedAtISO, oznaczenie]);
      return { przed, po };
    }, ['termin']],
    ['import pliku pacjenta z nowszą treścią', async (zmiana) => {
      const A = await sejf('A'), B = await sejf('B'), { s, przed } = await zakotwiczony(A);
      await wyslij(A, B);
      krok(); await zapiszDok(B, s, zmiana);
      krok(); const plik = await B.vault.exportPatientEnvelope(s.patientId);
      krok(); await A.vault.importPatientFromEnvelope(plik, B.haslo);
      return { przed, po: await stan(A, s.id) };
    }],
    ['„Scal kopię konta” z kopii z nowszą treścią', async (zmiana) => {
      const A = await sejf('A'), B = await sejf('B'), { s, przed } = await zakotwiczony(A);
      await wyslij(A, B);
      krok(); await zapiszDok(B, s, zmiana);
      krok(); const kopiaKonta = await B.vault.exportVaultBackup();
      krok(); await A.vault.mergeVaultBackup(kopiaKonta, B.haslo);
      return { przed, po: await stan(A, s.id) };
    }],
  ];
  it.each(DROGI.flatMap(([droga, przebieg, bez = []]) => ZMIANY_WIDOCZNE.filter(([pole]) => !bez.includes(pole)).map(([pole, zmiana]) => [droga, pole, przebieg, zmiana])))(
    'niezmiennik — %s, zmienione pole: %s: nie zostaje ważna kotwica ze starą chwilą treści', async (droga, pole, przebieg, zmiana) => {
      const { przed, po } = await przebieg(zmiana);
      niezmiennik(przed, po, `${droga} / ${pole}`);
    });

  it.each([
    ['„Przełóż” (snoozePatientNote)', async (A, s) => { await A.vault.snoozePatientNote(s.id, '2026-12-05'); }],
    ['wykonanie przypomnienia z opisem (saveReminderOutcome)', async (A, s) => {
      const cur = await A.vault.getPatientNote(s.id);
      const w = await A.vault.saveReminderOutcome({ id: s.id, patientId: s.patientId, baseRev: cur.rev, baseUpdatedAtISO: cur.updatedAtISO, baseNote: cur,
        operationId: operacja(), action: 'complete', dateISO: '2026-11-16', text: 'Fikcyjny opis wykonania.' });
      expect(w.saved).toBe(true);
    }],
  ])('niezmiennik — %s: nie zostaje ważna kotwica ze starą chwilą treści', async (_opis, zapis) => {
    const A = await sejf('A'), { s, przed } = await zakotwiczony(A);
    krok(); await zapis(A, s);
    niezmiennik(przed, await stan(A, s.id), _opis);
  });

  // „Scal pacjentów” przenosi dokument do karty docelowej bez nowej treści i zachowuje chwilę treści (przeniesienie nie
  // jest zmianą treści). Dokument bez tytułu dostaje przy tym tytuł „(wpis)” — to jedyna znana droga, która zmienia pole
  // widoczne (nagłówek) i zostawia ważną kotwicę. Dokument trafia do innej karty niż plan, a ekran planu otwiera tylko
  // dokument z karty planu („Dokument jest niedostępny”), więc dowód tej zmiany nie pokaże jako niezmienionej.
  it.each([['dokument z tytułem', {}, false], ['dokument bez tytułu', { title: '' }, true]])('„Scal pacjentów” — %s: chwila treści zostaje, dokument przechodzi do karty docelowej', async (_opis, extra, nowyTytul) => {
    const A = await sejf('A'), s = await dokument(A, extra), przed = await stan(A, s.id);
    krok(); const cel = (await A.vault.savePatient({ name: 'Fikcyjna Pacjentka Docelowa', user: { sex: 'F', age: 9, height: 131, weight: 29 } }, { dedup: false })).patientId;
    krok(); await A.vault.mergePatients(s.patientId, cel);
    const po = await stan(A, s.id);
    expect([po.patientId, po.tresc, po.kotwica], 'karta docelowa, ta sama chwila treści z kotwicą').toEqual([cel, przed.tresc, true]);
    if (nowyTytul) expect(JSON.parse(po.widoczne)[0], 'dokument bez tytułu dostaje tytuł „(wpis)”').toBe('(wpis)');
    else expect(po.widoczne, 'widoczna treść bez zmian').toBe(przed.widoczne);
    const plany = zrodlo('vilda_care_plans.js');
    expect(plany, 'ekran planu otwiera tylko dokument z karty planu').toContain("stagedOriginal.patientId !== patientId) throw new Error('Dokument jest niedostępny. Sprawdź dokumentację pacjenta.')");
  });

  // Hydracja (starszy klient pominął rozszerzenie planu opieki): rozszerzenie wraca tylko do rekordu równego we wszystkich
  // polach odczytu poza careContext i polami chwil — zapis bez zmiany pól widocznych, z tą samą chwilą zapisu i treści.
  it('hydracja rozszerzenia planu opieki nie zmienia pól widocznych ani chwili treści; rekord z inną treścią nie jest hydratowany', async () => {
    const A = await sejf('A'), B = await sejf('B');
    krok(); const patientId = (await A.vault.savePatient({ name: 'Fikcyjna Pacjentka Plan', user: { sex: 'F', age: 12, height: 150, weight: 40 } }, { dedup: false })).patientId;
    krok(); const utworzony = await A.vault.mutateCarePlan({ patientId, operationId: operacja(), action: 'create', title: 'Fikcyjny plan', goal: 'Fikcyjny cel planu.' });
    expect(utworzony.saved).toBe(true);
    const plan = utworzony.plan || await A.vault.getCarePlan(utworzony.planId);
    krok(); const krokPlanu = await A.vault.mutateCarePlan({ planId: plan.id, patientId, baseRev: plan.rev, operationId: operacja(), action: 'addStep',
      step: { title: 'Fikcyjne badanie', kind: 'Badanie', state: 'pending', reminderDateISO: '2026-11-30', description: 'Fikcyjne ustalenia.' } });
    expect(krokPlanu.saved).toBe(true);
    const ladunek = kopia(await A.vault.exportSyncPayload()), stary = kopia(ladunek);
    stary.patientNotes.forEach((n) => { delete n.careContext; });
    await B.vault.mergeSyncPayload(stary);
    expect(await B.vault.getCarePlan(plan.id), 'po starszym kliencie: plan bez rozszerzenia').toBeNull();
    const ids = ladunek.patientNotes.map((n) => n.id), przed = new Map();
    for (const id of ids) przed.set(id, { stan: await stan(B, id), rekord: bezChwil(await zapisana(B, id)), chwile: await zapisana(B, id) });
    // Rekord o tym samym rev i chwili zapisu, ale innej treści — nie jest hydratowany (rekord bez zmian).
    const inna = kopia(ladunek); inna.patients = [];
    inna.patientNotes = inna.patientNotes.filter((n) => n.id === plan.id).map((n) => ({ ...n, body: `${n.body}\nFikcyjna inna treść.` }));
    await B.vault.mergeSyncPayload(inna);
    expect(await zapisana(B, plan.id), 'rekord z inną treścią: bez zmian').toEqual(przed.get(plan.id).chwile);
    await B.vault.mergeSyncPayload(ladunek);
    expect(await B.vault.getCarePlan(plan.id), 'hydracja przywróciła plan').toBeTruthy();
    for (const id of ids) {
      const po = await stan(B, id), r = await zapisana(B, id), p = przed.get(id);
      expect([po.widoczne, po.rev, po.zapis, po.tresc], `${id}: pola widoczne, rev, chwila zapisu i treści bez zmian`).toEqual([p.stan.widoczne, p.stan.rev, p.stan.zapis, p.stan.tresc]);
      for (const k of ['contentAtISO', 'contentForISO']) expect(r[k], `${id}: ${k} bez zmian`).toBe(p.chwile[k]);
    }
  });

  // Strażnik źródła tego samego niezmiennika: zapisy, które budują rekord notatki z poprzedniego rekordu (Object.assign
  // z nowym szyfrogramem), przenoszą jego pola chwil. Dziś kotwicę unieważnia nowa chwila zapisu albo zapis nie zmienia
  // pól widocznych. Nowy taki zapis musi zrobić jedno z dwojga albo usunąć pola chwil (Bnp_bezChwil).
  it('sejf: zapisy budowane z poprzedniego rekordu z nowym szyfrogramem — znana lista, każdy z nową chwilą zapisu albo bez zmiany pól widocznych', () => {
    const znalezione = [];
    const re = /Object\.assign\(\{\},\s*([^,()]{1,60}?)\s*,\s*\{([^{}]{0,400})\}/g;
    for (let m = re.exec(sejfTekst); m; m = re.exec(sejfTekst)) if (/bodyCipher/.test(m[2])) znalezione.push(m[0]);
    expect(znalezione, 'lista zapisów z nowym szyfrogramem na metadanych poprzedniego rekordu').toEqual([
      // migracja clinicalScrubDoneV1: pola kliniczne z metadanych do szyfrogramu (odczyt bierze treść, potem metadane) —
      // pola widoczne bez zmian, ta sama chwila zapisu
      'Object.assign({},a,{bodyCipher:c,medication:null,labResult:null,clinicalDateISO:null,procedureType:null,waitlistPriority:null}',
      // hydracja rozszerzenia planu: tylko przy równych polach odczytu (test wyżej)
      'Object.assign({}, stored, { bodyCipher }',
      // odłączenie terminu z historii planu i odłączenie oryginału od planu: nowa chwila zapisu unieważnia kotwicę
      'Object.assign({}, parent, { bodyCipher, rev: (parent.rev || 0) + 1, updatedAtISO: new Date().toISOString() }',
      'Object.assign({}, original.stored, { bodyCipher, updatedAtISO: new Date().toISOString(), rev: (original.stored.rev || 0) + 1 }',
      // Uzupełnienie brakującego kontekstu leczenia lub wizyty z tej samej wersji zapisu.
      'Object.assign({}, stored, { bodyCipher }',
    ]);
    const h = wytnijFunkcje(sejfTekst, 'CareMvpHydrateSyncRecord');
    expect(h, 'hydracja tylko przy równych polach odczytu poza careContext i polami chwil')
      .toContain("keys.every(function (key) { return key === 'careContext' || Bnp_POLA_CHWIL.indexOf(key) >= 0 || CareMvpSyncEqual(decoded[key], incoming[key]); })");
    expect(wytnijFunkcje(sejfTekst, 'CareMvpSyncHydrationCandidate'), 'hydracja przy tej samej chwili zapisu i rev').toContain('stored.updatedAtISO === incoming.updatedAtISO');
    const t = wytnijFunkcje(sejfTekst, 'TreatmentHydrateSyncRecord');
    expect(t, 'uzupełnienie dotyczy tylko pól nieobecnych w lokalnym szyfrogramie')
      .toContain("if (!Object.hasOwn(plain, 'treatmentContext'))")
      .toContain("if (!Object.hasOwn(plain, 'visitContext') && Object.hasOwn(incoming, 'visitContext'))");
    expect(t, 'pozostałe pola odczytu są równe, z wyjątkiem znaczników zmian treści i stanu')
      .toContain('keys.every(function (key) { return Object.hasOwn(additions, key) || Bnp_POLA_CHWIL.includes(key) || CareMvpSyncEqual(decoded[key], incoming[key]); })');
    const kandydat = wytnijFunkcje(sejfTekst, 'TreatmentSyncHydrationCandidate');
    expect(kandydat, 'uzupełnienie tej samej wersji notatki tego samego pacjenta')
      .toContain('stored.id === incoming.id && stored.patientId === incoming.patientId')
      .toContain('stored.updatedAtISO === incoming.updatedAtISO')
      .toContain('(stored.rev || 0) === incoming.rev');
    // Zapis planu we fragmencie natywnym składa rekord z poprzedniego z nową chwilą zapisu „teraz” i przed nowym
    // szyfrogramem usuwa pola chwil treści i stanu poprzedniego rekordu (jak Bnp_bezChwil; działanie — test niżej).
    const i = sejfTekst.indexOf('async function seal(note, before, hidden) {');
    expect(i, 'zapis rekordu we fragmencie natywnym').toBeGreaterThan(0);
    const seal = sejfTekst.slice(i, sejfTekst.indexOf('\n  }\n', i));
    const zlozenie = seal.indexOf('var now = new Date().toISOString(), raw = Object.assign({}, before || {}, {');
    const bezChwilPoprzedniego = seal.indexOf("['contentAtISO', 'contentForISO', 'stateAtISO', 'stateForISO'].forEach(function (key) { delete raw[key]; });");
    const szyfrogram = seal.indexOf('raw.bodyCipher = await V(plain);');
    expect(seal).toContain('updatedAtISO: now,');
    expect([zlozenie, bezChwilPoprzedniego, szyfrogram].every((x) => x > 0), 'złożenie z poprzedniego rekordu, usunięcie pól chwil, szyfrogram').toBe(true);
    expect(zlozenie < bezChwilPoprzedniego && bezChwilPoprzedniego < szyfrogram, 'pola chwil usuwane po złożeniu rekordu, przed szyfrogramem').toBe(true);
    // Jedyne miejsce, które ustawia pole chwili treści, bierze chwilę wersji, której treść zostaje (Bnp_ustawChwileTresci).
    expect(sejfTekst.split(/\.contentAtISO\s*=(?!=)/).length - 1, 'contentAtISO przypisywane tylko w Bnp_ustawChwileTresci').toBe(1);
    expect(wytnijFunkcje(sejfTekst, 'Bnp_ustawChwileTresci')).toMatch(/r\.contentAtISO\s*=\s*c;\s*r\.contentForISO\s*=\s*u;/);
  });

  // To samo działaniem: prawdziwa funkcja zapisu rekordu z fragmentu natywnego (wycięta z sejfu; nowy szyfrogram i blokada
  // sesji zastąpione). Zegar może dać napis równy chwili zapisu poprzedniego rekordu (ta sama milisekunda). Gdyby zapis
  // zostawił pola chwil poprzedniego rekordu, stara kotwica byłaby ważna przy nowej treści i dowód kroku pokazałby
  // zmienioną treść jako niezmienioną.
  it.each([['ta sama milisekunda co poprzedni zapis', 0], ['późniejsza chwila zapisu', MIN]])(
    'fragment natywny: zapis rekordu planu (seal) nie przenosi chwil treści i stanu poprzedniego rekordu — %s', async (_opis, odstep) => {
      const i = sejfTekst.indexOf('async function seal(note, before, hidden) {');
      const tekst = sejfTekst.slice(i, sejfTekst.indexOf('\n  }\n', i) + 4);
      const szyfr = async (plain) => ({ iv: 'fikcyjny-iv', data: JSON.stringify(plain) });
      const seal = new Function('check', 'V', `${tekst}\nreturn seal;`)(() => {}, szyfr);
      const U = iso(teraz), C = iso(teraz - 30 * MIN);
      const before = { id: 'fikcyjny-dokument-planu', patientId: 'fikcyjna-karta', category: 'followup', rev: 4,
        createdAtISO: iso(teraz - 60 * MIN), updatedAtISO: U, contentAtISO: C, contentForISO: U, stateAtISO: C, stateForISO: U,
        dueDateISO: '2026-11-30', bodyCipher: { iv: 'stary-iv', data: '{}' } };
      expect(chwilaTresciSejfu(before), 'start: ważna kotwica ze starą chwilą treści').toBe(C);
      krok(odstep);
      const raw = await seal({ id: before.id, patientId: before.patientId, category: 'followup', title: 'Fikcyjny krok planu',
        body: 'Fikcyjna nowa treść kroku.', dueDateISO: '2026-12-01' }, before, false);
      expect([raw.updatedAtISO, raw.rev], 'nowa chwila zapisu i wyższy rev').toEqual([iso(teraz), 5]);
      for (const k of ['contentAtISO', 'contentForISO', 'stateAtISO', 'stateForISO']) expect(raw, k).not.toHaveProperty(k);
      expect(chwilaTresciSejfu(raw), 'nowa treść ma chwilę treści tego zapisu, nie starą').toBe(raw.updatedAtISO);
      expect(JSON.parse(raw.bodyCipher.data).body).toBe('Fikcyjna nowa treść kroku.');
    });

  it('ekran planu porównuje dowód z chwilą treści po efektywnej chwili treści dokumentu (jedna funkcja, dokładne napisy), a dowód bez niej — po rev; modele przyjmują tylko nową nazwę pola', () => {
    const plany = zrodlo('vilda_care_plans.js');
    const regula = wytnijFunkcje(plany, 'stagedContentInstant'), porownanie = wytnijFunkcje(plany, 'stagedEvidenceChanged');
    expect(porownanie, 'dowód z chwilą treści: pole po nowej nazwie').toContain("'sourceRecordContentAtISOAtCapture'");
    expect(porownanie, 'dowód z chwilą treści: porównanie z efektywną chwilą treści dokumentu').toContain('stagedContentInstant(original)');
    expect(porownanie, 'dawny dowód: porównanie po rev').toContain('sourceRecordRevAtCapture !== original.rev');
    // Porównanie dokładnych napisów: bez Date.parse i bez sprowadzania postaci (kontrola postaci kanonicznej jak Bnp_iso
    // jest w funkcji reguły; jej wynik to zawsze jeden z napisów dokumentu — sprawdza to test zgodności z sejfem wyżej).
    expect(porownanie, 'porównanie bez Date.parse').not.toContain('Date.parse');
    expect(porownanie, 'porównanie bez sprowadzania do toISOString').not.toContain('toISOString');
    // Reguła jest jedna: pola kotwicy czyta tylko stagedContentInstant.
    const bezReguly = plany.replace(regula, '');
    expect(bezReguly, 'contentAtISO poza funkcją reguły').not.toContain('contentAtISO');
    expect(bezReguly, 'contentForISO poza funkcją reguły').not.toContain('contentForISO');
    expect(plany.split('stagedEvidenceChanged(').length - 1, 'funkcja porównania użyta przy otwarciu dokumentu z planu').toBeGreaterThanOrEqual(2);
    // Ponowny odczyt przed zapisem: rev, chwila zapisu i efektywna chwila treści obu odczytów.
    const i = plany.indexOf('return { box: box, read: async function () {');
    expect(i, 'odczyt dowodu przed zapisem').toBeGreaterThan(0);
    const odczyt = plany.slice(i, plany.indexOf('return { noteId: selected.id', i));
    expect(odczyt).toContain('original.rev !== selected.rev');
    expect(odczyt).toContain('original.updatedAtISO !== selected.updatedAtISO');
    expect(odczyt).toMatch(/stagedContentInstant\(original\)\s*!==\s*stagedContentInstant\(selected\)/);
    expect(plany, 'bez dawnej listy samych numerów wersji').not.toContain('capturedRevisions');
    expect(plany).toContain('Dokument został zmieniony po powiązaniu z planem.');
    const model = zrodlo('vilda_care_plan_model.js'), zmiany = zrodlo('vilda_care_plan_mutation.js');
    expect(model, 'lista pól dowodu').toContain("['noteId', 'sourceRecordRevAtCapture', 'sourceRecordContentAtISOAtCapture']");
    expect(model, 'lista pól powiązania').toContain("'noteId', 'sourceRecordRevAtCapture', 'sourceRecordContentAtISOAtCapture', 'operationId', 'recordedAtISO'");
    expect(zmiany, 'zależność odczytu z chwilą treści').toContain('expectedContentAtISO');
    for (const [plik, kod] of [['vilda_care_plans.js', plany], ['vilda_care_plan_model.js', model], ['vilda_care_plan_mutation.js', zmiany]]) {
      expect(kod, `${plik}: bez dawnej nazwy pola`).not.toContain('sourceRecordUpdatedAtISOAtCapture');
      expect(kod, `${plik}: bez dawnego klucza zależności`).not.toContain('expectedUpdatedAtISO');
    }
  });

  it('ekran planu w tym wydaniu nie zapisuje pola w dowodzie kroku (ani nowej, ani dawnej nazwy) — zapis dopiero w drugim wydaniu, po potwierdzeniu właściciela', () => {
    const plany = zrodlo('vilda_care_plans.js');
    expect(plany, 'dowód z wyboru dokumentu: identyfikator i numer wersji').toContain('return { noteId: selected.id, sourceRecordRevAtCapture: selected.rev };');
    for (const pole of ['sourceRecordContentAtISOAtCapture', 'sourceRecordUpdatedAtISOAtCapture']) {
      expect(plany, `${pole}: nie jest kluczem literału`).not.toMatch(new RegExp(`${pole}['"]?\\s*:`));
      expect(plany, `${pole}: nie jest przypisywane`).not.toMatch(new RegExp(`(?:\\.${pole}|\\[\\s*['"]${pole}['"]\\s*\\])\\s*=(?!=)`));
    }
  });
});
