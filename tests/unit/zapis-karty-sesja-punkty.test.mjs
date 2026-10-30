// P-SESJA-ZAPISU — zapis karty pacjenta kończy się w sesji, w której ruszył, także gdy sesja zmienia się w krótkim
// oczekiwaniu między dwoma krokami zapisu.
//
// Pilnuje savePatient w punktach krótkich oczekiwań: po odczycie listy kart, po odszyfrowaniu nagłówka z listy, po
// odczycie rekordu karty pod blokadą karty, po odszyfrowaniu głowy karty, po szyfrowaniu nagłówka, po zapisie wersji,
// po odczycie rekordu przed jego zapisem, po zapisie rekordu i po zdjęciu nagrobka. Hak magazynu albo crypto.subtle
// (uprząż ./sesja-zapisu-uprzaz.mjs) przełącza sesję na konto B (blokada sejfu i zalogowanie B) zaraz po wskazanej
// operacji; operacja oddaje wynik dopiero po przełączeniu. Miejsce w kodzie hak rozpoznaje po nazwach funkcji sejfu
// w stosie wywołań (Bpz_zapis, Bpz_sekcja) i po kolejności operacji, nie po numerach wierszy.
// Oczekiwane po przełączeniu: odrzucenie z kodem SESSION_CHANGED („Zapis przerwany”), żadnego wywołania magazynu (także
// odczytu i bez konta), żadnego szyfrowania (poza treścią szyfrowaną zaraz po nagłówku w P8), żadnego powiadomienia,
// żadnego pytania okna, żadnego żądania blokady, żadnego zapisu localStorage/sessionStorage; konto B bez kart i wersji;
// żadna blokada nie zostaje zajęta. W koncie A zostaje to, co zapis utrwalił przed przełączeniem (ograniczenie opisane
// w P-SESJA-ZAPISU: wersja bez podniesionego licznika w rekordzie po P10/P11, kompletny zapis bez powiadomienia po P13;
// po P12 bez zdjęcia nagrobka).
//
// Strażnik źródła pilnuje układu sprawdzeń sesji w vilda_vault.js: czytelne opakowanie Bpz_zapis bierze sesję operacji
// złożonej (4. parametr) albo zapamiętuje sesję (Bses_opcje) przed wywołaniem rdzenia Bpz_zapisWSesji i zamienia błąd
// po zmianie sesji na Bpz_przerwany(); w rdzeniu
// `Bpz_pilnuj(Bpz_s);` stoi tuż przed i tuż po każdym `await I().put…`, zaraz po `await Bz1(…)` z catch, jako pierwsza
// instrukcja Bpz_sekcja i tuż przed Bzu_zapamietaj (bez await do Vn); wstawek jest dokładnie 11.
//
// Prawdziwe vilda_crypto.js, vilda_retention.js i vilda_vault.js na wspólnej uprzęży: konto A zalogowane i konto B
// zablokowane na jednym magazynie w pamięci z rejestrem wywołań, atrapa Web Locks i crypto.subtle z rejestrem.
// Czekanie wyłącznie na zdarzenia i obietnice. Dane wyłącznie FIKCYJNE („Testowy Jan”).
//
// Przypadki:
//   P0   po 1. listPatientsForUser — dwie karty „Testowy Jan7” bez daty urodzenia, zapis bez daty (okno „Który to
//        pacjent?” ustawione).
//   P1   po 1. decrypt w Bpz_zapis poza Bpz_sekcja (nagłówek karty z listy), jak P0.
//   P4   po 1. getPatientForUser (rekord karty, pierwszy krok pod blokadą karty) — zapis istniejącej karty.
//   P7   po 3. decrypt w Bpz_sekcja (głowa karty) — formularz z baselinePayload bez wiersza dopisanego na innym
//        urządzeniu (okno konfliktu ustawione).
//   P8   po 1. encrypt w Bpz_sekcja (nagłówek nowej wersji).
//   P10  po putSnapshotForUser.
//   P11  po 3. getPatientForUser (rekord przed zapisem licznika wersji).
//   P12  po putPatientForUser.
//   P13  po removeTombstoneForUser — zapis w A kompletny, wynik SESSION_CHANGED, bez powiadomienia o zapisie.
//   K    kontrole: te same haki bez przełączenia — zapis dochodzi do tego samego punktu i kończy się jak dotąd w A.
//   S1   strażnik: opakowanie Bpz_zapis (sesja operacji albo sesja przed rdzeniem, rdzeń wołany tylko przez opakowanie,
//        zamiana błędu).
//   S2   strażnik: wstawki Bpz_pilnuj(Bpz_s) w rdzeniu (put, Bz1 + catch, Bpz_sekcja, Bzu_zapamietaj, liczba 11).
//
// Czerwone na audycie sprzed zmiany (sprawdzone na 2af9de53 i c209fa6b): P0, P1, P4, P7, P8, P10, P11, P12, P13 oraz S1 i S2.
// Zielone na audycie sprzed zmiany: K (każdy punkt).
import { afterEach, describe, expect, it } from 'vitest';
import { naglowek, sprzatnij, urzadzenie, wynik, wytnijFunkcje, zrodlo } from './sesja-zapisu-uprzaz.mjs';

afterEach(() => sprzatnij());

const kolejnaTura = () => new Promise((r) => { setImmediate(r); });
const blokadaKarty = (patientId) => `vilda-save-pat:${patientId}`;
const kopia = (x) => JSON.parse(JSON.stringify(x));
const PILNUJ = 'Bpz_pilnuj(Bpz_s);';

// ── Scenariusze zapisu ───────────────────────────────────────────────────────────────────────────────────────────────
// Każdy przygotowuje konto A i oddaje zapis do uruchomienia po uzbrojeniu haka.
const SCENARIUSZE = {
  // Dwie karty „Testowy Jan7” bez daty urodzenia; zapis bez daty pyta „Który to pacjent?” (odpowiedź „nowy” od razu).
  async imiennicy(d) {
    await d.v.savePatient(naglowek(7, { dob: null }), { dedup: false });
    await d.v.savePatient(naglowek(7, { dob: null, wzrost: 121 }), { dedup: false });
    const okno = d.oknoTozsamosci({ odpowiedz: { akcja: 'nowy' } });
    return { pid: null, okno, zapisz: () => d.v.savePatient(naglowek(7, { dob: null, wzrost: 140 }), {}) };
  },
  // Druga wersja istniejącej karty.
  async istniejaca(d) {
    const p = await d.v.savePatient(naglowek(4), { dedup: false });
    return { pid: p.patientId, okno: null, zapisz: () => d.v.savePatient(naglowek(4, { wzrost: 131 }), { patientId: p.patientId, dedup: false }) };
  },
  // Karta z jednym pomiarem; „inne urządzenie” dopisuje drugi; formularz zapisuje z baselinePayload = wersja bazowa
  // (okno konfliktu odpowiada „nadpisz” od razu).
  async konflikt(d) {
    const bazowy = naglowek(8, { pomiary: [[100, 118]] });
    const p = await d.v.savePatient(kopia(bazowy), { dedup: false });
    await d.v.savePatient(naglowek(8, { pomiary: [[100, 118], [110, 122]] }), { patientId: p.patientId, dedup: false });
    const okno = d.oknoKonfliktu({ odpowiedz: 'nadpisz' });
    return {
      pid: p.patientId, okno,
      zapisz: () => d.v.savePatient(naglowek(8, { wzrost: 125, pomiary: [[100, 118]] }), { patientId: p.patientId, dedup: false, baselinePayload: bazowy }),
    };
  },
};

// Kroki magazynu konta A od wejścia do zapisu do wskazanego punktu (włącznie).
const LISTA = ['listPatientsForUser(A)'];
const REKORD = [...LISTA, 'getPatientForUser(A)'];
const GLOWA = [...REKORD, 'getPatientForUser(A)', 'listSnapshotsForUser(A)'];
const WERSJA = [...GLOWA, 'putSnapshotForUser(A)'];
const ODCZYT_H = [...WERSJA, 'getPatientForUser(A)'];
const REKORD_ZAPISANY = [...ODCZYT_H, 'putPatientForUser(A)'];
const NAGROBEK = [...REKORD_ZAPISANY, 'removeTombstoneForUser(A)'];

// Punkty: rodzaj haka (magazyn | krypto), dopasowanie, kroki przed przełączeniem, co zostaje w A, wynik kontroli.
//   wA: 'bez-zmian' — nic nie zapisane; 'wersja' — wersja zapisana, rekord bez zmian; 'pelny' — wersja i rekord.
//   szyfrTrwa: szyfrowanie treści, które rusza po szyfrowaniu nagłówka (P8), nie jest liczone jako krok po zmianie.
const PUNKTY = [
  { id: 'P0', opis: 'po 1. odczycie listy kart (listPatientsForUser) przy imiennikach', scen: 'imiennicy', rodzaj: 'magazyn',
    dop: { metoda: 'listPatientsForUser', konto: 'A' }, kroki: LISTA, wA: 'bez-zmian', kontrola: { isNew: true, pytania: ['tozsamosc(A)'] } },
  { id: 'P1', opis: 'po 1. odszyfrowaniu nagłówka z listy (decrypt w Bpz_zapis poza Bpz_sekcja)', scen: 'imiennicy', rodzaj: 'krypto',
    dop: { metoda: 'decrypt', wStosie: /Bpz_zapis/, bezStosu: /Bpz_sekcja/ }, kroki: LISTA, wA: 'bez-zmian', kontrola: { isNew: true, pytania: ['tozsamosc(A)'] } },
  { id: 'P4', opis: 'po 1. odczycie rekordu karty (getPatientForUser) pod blokadą karty', scen: 'istniejaca', rodzaj: 'magazyn',
    dop: { metoda: 'getPatientForUser', konto: 'A', ktory: 1 }, kroki: REKORD, wA: 'bez-zmian', kontrola: { isNew: false, wersje: 2 } },
  { id: 'P7', opis: 'po 3. odszyfrowaniu w Bpz_sekcja (głowa karty) przy formularzu z obcym wierszem w karcie', scen: 'konflikt', rodzaj: 'krypto',
    dop: { metoda: 'decrypt', wStosie: /Bpz_sekcja/, ktory: 3 }, kroki: GLOWA, wA: 'bez-zmian', kontrola: { isNew: false, wersje: 3, pytania: ['konflikt(A)'] } },
  { id: 'P8', opis: 'po 1. szyfrowaniu w Bpz_sekcja (nagłówek nowej wersji)', scen: 'istniejaca', rodzaj: 'krypto',
    dop: { metoda: 'encrypt', wStosie: /Bpz_sekcja/ }, kroki: GLOWA, wA: 'bez-zmian', szyfrTrwa: true, kontrola: { isNew: false, wersje: 2 } },
  { id: 'P10', opis: 'po zapisie wersji (putSnapshotForUser)', scen: 'istniejaca', rodzaj: 'magazyn',
    dop: { metoda: 'putSnapshotForUser', konto: 'A' }, kroki: WERSJA, wA: 'wersja', kontrola: { isNew: false, wersje: 2 } },
  { id: 'P11', opis: 'po 3. odczycie rekordu karty (getPatientForUser przed zapisem licznika wersji)', scen: 'istniejaca', rodzaj: 'magazyn',
    dop: { metoda: 'getPatientForUser', konto: 'A', ktory: 3 }, kroki: ODCZYT_H, wA: 'wersja', kontrola: { isNew: false, wersje: 2 } },
  { id: 'P12', opis: 'po zapisie rekordu karty (putPatientForUser)', scen: 'istniejaca', rodzaj: 'magazyn',
    dop: { metoda: 'putPatientForUser', konto: 'A' }, kroki: REKORD_ZAPISANY, wA: 'pelny', kontrola: { isNew: false, wersje: 2 } },
  { id: 'P13', opis: 'po zdjęciu nagrobka (removeTombstoneForUser)', scen: 'istniejaca', rodzaj: 'magazyn',
    dop: { metoda: 'removeTombstoneForUser', konto: 'A' }, kroki: NAGROBEK, wA: 'pelny', kontrola: { isNew: false, wersje: 2 } },
];

const kroki = (d, od, doZnacznika) => d.wywPelne.slice(od.wyw, doZnacznika).map((x) => `${x.metoda}(${x.userId === d.A.userId ? 'A' : x.userId === d.B.userId ? 'B' : String(x.userId)})`);

async function stanA(d, pid) {
  const caly = await d.trwaly('A');
  if (!pid) return { caly };
  const rekord = await d.baza.getPatientForUser(d.A.userId, pid);
  return { caly, karta: await d.kartaTrwala('A', pid), licznik: rekord ? rekord.snapshotCount : null };
}

// Odrzucenie zapisu po zmianie sesji: kod i komunikat zapisu (nie scalania).
function przerwany(r) {
  expect(r.ok, `zapis po zmianie sesji nie kończy się powodzeniem (wynik: ${JSON.stringify(r.ok ? { isNew: r.w.isNew, snapshotCount: r.w.snapshotCount } : null)})`).toBe(false);
  expect(r.kod, `zapis kończy się w sesji, w której ruszył (komunikat: ${r.komunikat})`).toBe('SESSION_CHANGED');
  expect(r.komunikat).toMatch(/Zapis przerwany/);
  expect(r.komunikat).not.toMatch(/scalan/i);
}

describe('P-SESJA-ZAPISU: punkty krótkich oczekiwań — zapis kończy się w sesji, w której ruszył', () => {
  it.each(PUNKTY.map((p) => [p.id, p.opis, p]))('%s: przełączenie na konto B %s — SESSION_CHANGED, po przełączeniu brak zapisów i powiadomień', async (_id, _opis, p) => {
    const d = await urzadzenie();
    const s = await SCENARIUSZE[p.scen](d);
    const przedA = await stanA(d, s.pid);
    const hak = p.rodzaj === 'magazyn' ? d.przelaczPo(p.dop, 'B') : d.przelaczWKrypto(p.dop, 'B');
    const z0 = d.znacznik();

    const r = await wynik(s.zapisz());
    expect(hak.zrobione, `zapis doszedł do punktu ${p.id}`).toBe(true);
    const z = await hak.gotowe;
    expect(z.sesja, 'po przełączeniu zalogowane konto B').toBe('B');
    expect(kroki(d, z0, z.start.wyw), 'kroki magazynu przed przełączeniem — w koncie A, do wskazanego punktu').toEqual(p.kroki);

    przerwany(r);
    await kolejnaTura();
    const po = d.po(z);
    expect(po.wywKto, 'po zmianie sesji żadnego wywołania magazynu').toEqual([]);
    expect(po.bezKonta, 'po zmianie sesji żadnego wywołania magazynu bez konta').toEqual([]);
    expect(po.zdarzenia.map((e) => `${e.typ}(${e.sesja})`), 'po zmianie sesji żadnego powiadomienia').toEqual([]);
    expect(po.pytania, 'po zmianie sesji żadnego pytania okna').toEqual([]);
    expect(po.locks, 'po zmianie sesji żadnego żądania blokady (także blokady karty)').toEqual([]);
    expect(po.dziennik.map((x) => `${x.magazyn} ${x.op} ${x.klucz}`), 'po zmianie sesji żadnego zapisu localStorage i sessionStorage').toEqual([]);
    if (!p.szyfrTrwa) expect(po.krypto.filter((m) => m === 'encrypt'), 'po zmianie sesji żadnego szyfrowania').toEqual([]);
    expect((await d.locks.query()).held, 'żadna blokada nie zostaje zajęta').toEqual([]);
    if (s.pid) expect(d.locks.zajeta(blokadaKarty(s.pid)), 'blokada karty wolna po odrzuceniu').toBe(false);
    expect(d.zdarzenia.slice(z0.zdarzenia).filter((e) => e.typ === 'patientSaved'), 'bez powiadomienia o zapisie w żadnej sesji').toEqual([]);

    expect(await d.trwaly('B'), 'konto B bez kart i wersji').toMatchObject({ karty: 0, wersje: 0 });
    expect(await d.baza.listPatientsForUser(d.B.userId), 'lista kart konta B pusta').toEqual([]);
    const poA = await stanA(d, s.pid);
    if (p.wA === 'bez-zmian') {
      expect(poA, 'konto A bez zmian — przełączenie przed pierwszym zapisem').toEqual(przedA);
    } else {
      expect(poA.karta, 'w koncie A zostaje wersja zapisana przed przełączeniem').toEqual({ jest: true, wersje: przedA.karta.wersje + 1 });
      expect(poA.licznik, p.wA === 'pelny' ? 'rekord karty A zapisany przed przełączeniem' : 'rekord karty A bez zmian — zapis rekordu po przełączeniu nie rusza')
        .toBe(przedA.licznik + (p.wA === 'pelny' ? 1 : 0));
      expect(poA.caly.karty, 'konto A bez nowej karty').toBe(przedA.caly.karty);
    }
  });
});

describe('P-SESJA-ZAPISU: kontrole punktów — bez przełączenia zapis dochodzi do tego samego miejsca i kończy się w A', () => {
  it.each(PUNKTY.map((p) => [p.id, p.opis, p]))('K-%s: hak %s bez przełączenia — zapis jak dotąd, jedno powiadomienie w A', async (_id, _opis, p) => {
    const d = await urzadzenie();
    const s = await SCENARIUSZE[p.scen](d);
    const przedA = await stanA(d, s.pid);
    const hak = p.rodzaj === 'magazyn' ? d.magazyn.po(p.dop, () => {}) : d.krypto.po(p.dop, () => {});
    const z0 = d.znacznik();

    const r = await wynik(s.zapisz());
    expect(hak.zrobione, `zapis doszedł do punktu ${p.id}`).toBe(true);
    expect(r.ok, r.komunikat).toBe(true);
    expect(r.w.isNew).toBe(p.kontrola.isNew);
    if (p.kontrola.wersje) expect(r.w.snapshotCount).toBe(p.kontrola.wersje);
    expect(kroki(d, z0).slice(0, p.kroki.length), 'kroki magazynu zapisu w koncie A').toEqual(p.kroki);
    expect(d.pytania.slice(z0.pytania).map((q) => `${q.okno}(${q.sesja})`), 'pytania okien w sesji A').toEqual(p.kontrola.pytania || []);
    expect(d.zdarzenia.slice(z0.zdarzenia).filter((e) => e.typ === 'patientSaved').map((e) => [e.sesja, e.dane && e.dane.patientId])).toEqual([['A', r.w.patientId]]);
    expect((await d.locks.query()).held, 'żadna blokada nie zostaje zajęta').toEqual([]);
    expect(await d.trwaly('B')).toMatchObject({ karty: 0, wersje: 0 });
    const poA = await stanA(d, r.w.patientId);
    if (p.kontrola.isNew) {
      expect(poA.caly.karty).toBe(przedA.caly.karty + 1);
      expect(poA.karta).toEqual({ jest: true, wersje: 1 });
    } else {
      expect(poA.karta).toEqual({ jest: true, wersje: przedA.karta.wersje + 1 });
      expect(poA.licznik).toBe(przedA.licznik + 1);
    }
  });
});

// ── Strażnik źródła ──────────────────────────────────────────────────────────────────────────────────────────────────
// Pomija początkowe białe znaki i komentarze.
function poKomentarzach(t) {
  let s = t;
  for (;;) {
    const przed = s;
    s = s.replace(/^\s+/, '');
    if (s.startsWith('/*')) { const k = s.indexOf('*/'); s = k < 0 ? '' : s.slice(k + 2); }
    else if (s.startsWith('//')) { const k = s.indexOf('\n'); s = k < 0 ? '' : s.slice(k + 1); }
    if (s === przed) return s;
  }
}
// Pomija końcowe białe znaki i komentarze blokowe.
function przedKomentarzami(t) {
  let s = t;
  for (;;) {
    const przed = s;
    s = s.replace(/\s+$/, '');
    if (s.endsWith('*/')) { const k = s.lastIndexOf('/*'); s = k < 0 ? '' : s.slice(0, k); }
    if (s === przed) return s;
  }
}
// Indeks klamry domykającej klamrę otwartą w `i` (fragmenty bez napisów z klamrami).
function domknijKlamre(t, i) {
  let g = 0;
  for (let k = i; k < t.length; k += 1) {
    if (t[k] === '{') g += 1;
    else if (t[k] === '}') { g -= 1; if (!g) return k; }
  }
  throw new Error(`nie domknięto klamry od ${i}`);
}
const wszystkie = (t, re) => [...t.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`))];

describe('P-SESJA-ZAPISU: strażnik źródła sejfu (vilda_vault.js)', () => {
  const src = zrodlo('vilda_vault.js');

  it('S1: opakowanie Bpz_zapis bierze sesję operacji albo zapamiętuje sesję przed wywołaniem rdzenia i zamienia błąd po zmianie sesji na Bpz_przerwany()', () => {
    const opak = wytnijFunkcje(src, 'Bpz_zapis');
    const sesja = opak.search(/Bpz_s\s*=\s*Bpz_zew\s*!==\s*undefined\s*\?\s*Bpz_zew\s*:\s*T\(\)\s*\?\s*Bses_opcje\(\s*null\s*\)\s*:\s*null/);
    const rdzen = opak.indexOf('Bpz_zapisWSesji(');
    expect(opak, 'opakowanie przyjmuje sesję operacji złożonej (4. parametr)').toMatch(/^async function Bpz_zapis\(\s*t\s*,\s*e\s*,\s*Bpz_bez\s*,\s*Bpz_zew\s*\)/);
    expect(sesja, 'sesja operacji albo zapamiętana w opakowaniu Bpz_zapis (Bses_opcje, tylko przy odblokowanym sejfie)').toBeGreaterThan(-1);
    expect(rdzen, 'opakowanie woła rdzeń Bpz_zapisWSesji').toBeGreaterThan(-1);
    expect(sesja, 'Bses_opcje przed wywołaniem rdzenia').toBeLessThan(rdzen);
    expect(opak.slice(0, rdzen).replace(/\bawait\s*$/, ''), 'przed wywołaniem rdzenia żadnego await').not.toMatch(/\bawait\b/);
    expect(opak.slice(rdzen), 'rdzeń dostaje sesję parametrem').toMatch(/^Bpz_zapisWSesji\([^)]*\bBpz_s\s*\)/);
    const lap = opak.slice(opak.indexOf('catch', rdzen));
    expect(lap, 'błąd po zmianie sesji (kod SESSION_CHANGED albo Bses_zmieniona) zamieniany na Bpz_przerwany()')
      .toMatch(/SESSION_CHANGED[\s\S]*Bses_zmieniona\(\s*Bpz_s\s*\)[\s\S]*\?\s*Bpz_przerwany\(\)\s*:\s*err/);
    expect(wszystkie(src, /\bBpz_zapisWSesji\(/).length, 'rdzeń: definicja i jedno wywołanie (z opakowania)').toBe(2);
    expect(wytnijFunkcje(src, 'Bpz_pilnuj'), 'Bpz_pilnuj rzuca Bpz_przerwany() po zmianie sesji').toMatch(/if\s*\(\s*Bses_zmieniona\(\s*o\s*\)\s*\)\s*throw\s+Bpz_przerwany\(\)/);
    const blad = wytnijFunkcje(src, 'Bpz_przerwany');
    expect(blad).toMatch(/code\s*=\s*['"]SESSION_CHANGED['"]/);
    expect(blad).toMatch(/Zapis przerwany/);
  });

  it('S2: rdzeń Bpz_zapisWSesji — Bpz_pilnuj(Bpz_s) przy każdym await I().put…, po Bz1 z catch, na początku Bpz_sekcja i przed Bzu_zapamietaj; 11 wstawek', () => {
    expect(src.includes('async function Bpz_zapisWSesji('), 'rdzeń zapisu Bpz_zapisWSesji w vilda_vault.js').toBe(true);
    const rdzen = wytnijFunkcje(src, 'Bpz_zapisWSesji');

    const zapisy = wszystkie(rdzen, /await\s+I\(\)\.(put\w*)\([^)]*\)\s*;/);
    expect(zapisy.map((m) => m[1]), 'zapisy magazynu w rdzeniu').toEqual(expect.arrayContaining(['putSnapshotForUser', 'putPatientForUser']));
    for (const m of zapisy) {
      expect(przedKomentarzami(rdzen.slice(0, m.index)).endsWith(PILNUJ), `Bpz_pilnuj tuż przed await I().${m[1]}`).toBe(true);
      expect(poKomentarzach(rdzen.slice(m.index + m[0].length)).startsWith(PILNUJ), `Bpz_pilnuj tuż po await I().${m[1]}`).toBe(true);
    }

    const bz1 = rdzen.indexOf('await Bz1(');
    expect(bz1, 'okno „Który to pacjent?” (await Bz1)').toBeGreaterThan(-1);
    const lap = rdzen.slice(bz1).match(/\}\s*catch\s*(\([^)]*\)\s*)?\{/);
    expect(lap, 'await Bz1 w try z catch').not.toBeNull();
    const klamra = bz1 + lap.index + lap[0].length - 1;
    expect(poKomentarzach(rdzen.slice(domknijKlamre(rdzen, klamra) + 1)).startsWith(PILNUJ), 'Bpz_pilnuj zaraz po catch okna Bz1 (poza try)').toBe(true);

    const sekcja = rdzen.match(/Bpz_sekcja\s*=\s*async\s+function\s*\(\s*\)\s*\{/);
    expect(sekcja, 'sekcja pod blokadą karty (Bpz_sekcja)').not.toBeNull();
    expect(poKomentarzach(rdzen.slice(sekcja.index + sekcja[0].length)).startsWith(PILNUJ), 'pierwsza instrukcja Bpz_sekcja to Bpz_pilnuj').toBe(true);

    const pamiec = rdzen.indexOf('Bzu_zapamietaj(');
    expect(pamiec).toBeGreaterThan(-1);
    expect(przedKomentarzami(rdzen.slice(0, pamiec)).endsWith(PILNUJ), 'Bpz_pilnuj tuż przed Bzu_zapamietaj').toBe(true);
    const vn = rdzen.indexOf('Vn(', pamiec);
    expect(vn, 'powiadomienie Vn po Bzu_zapamietaj').toBeGreaterThan(pamiec);
    expect(rdzen.slice(pamiec, vn), 'od ostatniego sprawdzenia do Vn bez await').not.toMatch(/\bawait\b/);

    expect(wszystkie(rdzen, /Bpz_pilnuj\(\s*Bpz_s\s*\)\s*;/).length, 'liczba sprawdzeń sesji w rdzeniu').toBe(11);
  });
});
