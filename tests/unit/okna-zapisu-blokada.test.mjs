// P-SESJA-ZAPISU — okna zapisu należą do sesji, w której je otwarto, i zamykają się przy blokadzie sejfu.
//
// Pilnuje okien dopinanych do body przez vilda_auth_ui.js: „Który to pacjent?” (Gz2), „Ktoś inny zmienił ten rekord po
// wczytaniu danych” (Gh2, pod blokadą karty), „Dane pacjenta zmieniły się od otwarcia edycji” (Ga2), „Scalić w jeden
// rekord?” (Bsc9), „Ten pacjent może już być w bazie” na ekranach „Dodaj pacjenta” i „Dodaj do bazy” oraz okna
// szybkiego pomiaru (.vilda-quick-measure-overlay). Przy blokadzie sejfu (onLock) każde otwarte okno znika w tej samej
// chwili: nakładka usunięta, klasa vilda-modal-alert-open zdjęta, nasłuch klawisza Escape zdjęty. Okna z obietnicą
// rozstrzygają ją wynikiem „anuluj” (Bsc9: false), więc zapis, który na nie czekał, kończy się od razu SESSION_CHANGED
// i zwalnia blokadę karty; po zalogowaniu innego konta nie ma już okna ani karty w tym koncie. Okno otwierane, gdy sejf
// jest już zablokowany, zamyka się od razu. Blokada sejfu w czasie wyszukania imienników na ekranach „Dodaj pacjenta”
// i „Dodaj do bazy” kończy wyszukanie bez okna duplikatu i bez zapisu (przycisk odblokowany). Pętla „Importuj” kończy się
// przy blokadzie przed następnym plikiem, bez podsumowania. UI rejestruje jeden nasłuch onLock na dokument (Gh3 przy
// starcie i każde okno korzystają z tej samej rejestracji); okno zamknięte kliknięciem wypisuje się z rejestru, więc
// blokada nie zamyka go drugi raz (nie zdejmuje klasy modala okna otwartego później).
//
// Funkcje UI są wycinane z prawdziwego vilda_auth_ui.js po kotwicach tekstowych (e, Gr4, Gz0, Gz1, Gz3, Gz2, Gh2,
// Bsc9, Ga1, Ga2, Gh3, ekrany ss „Dodaj pacjenta”, ds „Dodaj do bazy” i zi „Importuj pacjentów” oraz — gdy jest w pliku
// — blok Gs_*: deklaracja rejestru, Gs_zwiaz, Gs_przyBlokadzie); Gh1 (opis wiersza okna konfliktu), Ot (dziennik
// błędów) i przejścia między ekranami (montowanie ekranu, otwarcie karty, lista pacjentów, wskaźnik pracy) to atrapy.
// Dokument z tests/support/atrapa-dom-lekka.mjs. U1–U4 i U6–U9:
// prawdziwe vilda_crypto.js, vilda_retention.js i vilda_vault.js na wspólnej uprzęży ./sesja-zapisu-uprzaz.mjs (konto
// A zalogowane, konto B zablokowane, jeden magazyn w pamięci z rejestrem, atrapa Web Locks); okna rejestruje
// prawdziwe Gh3 (setPatientIdentityResolver(Gz2), setSaveConflictResolver(Gh2)) przez cienką nakładkę na sejf, która
// tylko zapisuje, kiedy okno się otworzyło i czym rozstrzygnęło. U5: atrapa sejfu licząca rejestracje onLock.
// Czekanie wyłącznie na zdarzenia i obietnice (otwarcie okna, rozstrzygnięcie obietnicy). Dane wyłącznie FIKCYJNE
// („Testowy Jan”).
//
// Przypadki:
//   U1  „Który to pacjent?” (dwaj imiennicy bez daty urodzenia) otwarte, blokada sejfu: okno znika od razu, obietnica
//       okna rozstrzygnięta „anuluj”, zapis kończy się SESSION_CHANGED bez kliknięcia, bez wywołań magazynu po
//       blokadzie; po zalogowaniu B brak okna i przycisku „To inne dziecko”, w B 0 kart.
//   U2  okno konfliktu (Gh2) pod blokadą karty otwarte, blokada sejfu: okno znika, obietnica „anuluj”, zapis kończy się
//       SESSION_CHANGED, blokada karty wolna od razu; po zalogowaniu B brak okna, w B 0 kart; po ponownym zalogowaniu A
//       następny zapis tej karty przechodzi bez czekania na blokadę (onLockWait).
//   U3  Ga2 i Bsc9 otwarte, blokada sejfu: oba znikają, Ga2 rozstrzyga „anuluj”, Bsc9 false.
//   U4  okno szybkiego pomiaru znika przy blokadzie sejfu także wtedy, gdy żadne inne okno nie jest otwarte
//       (rejestracja z Gh3).
//   U5  atrapa sejfu: Gh3 i trzy rundy okien Gz2, Gh2, Ga2, Bsc9 zamykanych kliknięciem (odpowiedzi jak dotąd) —
//       dokładnie jedna rejestracja onLock, rejestr okien pusty; blokada nie zdejmuje klasy modala okna otwartego
//       później; okno otwarte po ponownym zalogowaniu zamyka następna blokada.
//   U6  „Dodaj pacjenta” z imiennikiem w A: okno „Ten pacjent może już być w bazie” otwarte, blokada sejfu — okno
//       znika od razu (nasłuch Escape zdjęty); po zalogowaniu B brak okna i przycisku „Utwórz nowego”, w B 0 kart.
//   U7  „Dodaj do bazy” osoby spoza bazy z imiennikiem w bazie A: to samo dla okna „Ten pacjent może już być w bazie”.
//   U8  blokada sejfu, zanim wyszukanie imienników się skończy (wynikiem albo błędem; „Dodaj pacjenta”, „Dodaj do
//       bazy”): okno duplikatu się nie otwiera (także po zalogowaniu B), bez zapisu, przycisk odblokowany; Gz2, Gh2,
//       Ga2 i Bsc9 otwierane przy
//       atrapie sejfu zablokowanego — od razu zamknięte, obietnice rozstrzygnięte „anuluj” / false, bez klasy modala
//       i nasłuchu.
//   U8b blokada sejfu i zalogowanie B, zanim wyszukanie imienników (imiennik w A) się skończy (wynikiem albo błędem; oba
//       ekrany): bez okna duplikatu z kartą A w sesji B, bez zapisu formularza A w B, przycisk odblokowany.
//   U9  „Importuj” trzech plików .json: blokada sejfu (sama albo z zalogowaniem B) w trakcie zapisu pierwszego pliku —
//       pętla kończy się przed drugim plikiem, bez podsumowania z nazwami plików; w B 0 kart, po zmianie sesji żadnych
//       wywołań magazynu.
//   U10 „Anuluj” w oknie duplikatu („Dodaj pacjenta”, „Dodaj do bazy”) zamyka okno i wypisuje je z rejestru; blokada
//       niczego już nie zamyka.
//   U11 „Dodaj pacjenta”, „Dodaj do bazy”: blokada sejfu i zalogowanie B w czasie wyszukania imienników (po odczycie
//       listy kart A) — bez okna duplikatu i bez zapisu z formularza, w B 0 kart, przycisk odblokowany.
//   U12 Gz2 bez sejfu w UI — zamknięte od razu („anuluj”); atrapa sejfu bez isUnlocked — okno otwarte i w rejestrze,
//       blokada je zamyka.
//   K6, K7, K9 kontrole w jednej sesji: „Utwórz nowego” zapisuje kartę w A („Dodaj pacjenta”) i przenosi osobę do bazy
//       („Dodaj do bazy”); import bez blokady — trzy karty w A i podsumowanie.
//   K10 kontrola: wyszukanie imienników kończy się błędem w tej samej sesji — zapis z formularza jak dotąd, rejestr
//       okien pusty.
//
// Czerwone na audycie sprzed zmiany (sprawdzone na 2af9de53 i c209fa6b): U1–U12 (z U8b; U8b czerwone także na kodzie rundy 1 przeglądu). Bloku Gs_* tam nie ma — wycięcie pomija go, a reszta okien i ekranów ładuje się z pliku
// bazy bez zmian. Zielone na audycie sprzed zmiany: K6, K7, K9, K10.
import { afterEach, describe, expect, it } from 'vitest';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';
import { naglowek, sprzatnij, urzadzenie, wynik, wytnijFunkcje, zrodlo } from './sesja-zapisu-uprzaz.mjs';

afterEach(() => sprzatnij());

const PLIK_UI = 'vilda_auth_ui.js';
const KOTWICE = [
  'function e(t,a,n){', 'function Gr4(t){', 'function Gz1(t){', 'function Gz0(t){', 'function Gz3(t){',
  'function Gz2(t){', 'function Gh2(t){', 'function Bsc9(t){', 'function Ga1(Sa,Sb){', 'function Ga2(Sa,Sb,Sc){',
  'function Gh3(){',
];
const KOTWICE_GS = ['function Gs_zwiaz(){', 'function Gs_przyBlokadzie(zamknij){'];
const DEKLARACJA_GS = /^var Gs_otwarte=[^;\n]*;/m;

// Funkcja zaczynająca się od kotwicy (kotwica dokładnie raz w pliku); domknięcie — wytnijFunkcje z uprzęży.
function wytnijPoKotwicy(src, kotwica) {
  const i = src.indexOf(kotwica);
  if (i < 0 || src.indexOf(kotwica, i + 1) >= 0) throw new Error(`${PLIK_UI}: kotwica „${kotwica}” nie występuje dokładnie raz`);
  return wytnijFunkcje(src.slice(i), /^function\s+([\w$]+)\s*\(/.exec(kotwica)[1]);
}

// Blok Gs_* w całości albo wcale (plik bez bloku — pusty tekst; połowa bloku — błąd wycięcia).
function blokGs(src) {
  const deklaracja = DEKLARACJA_GS.exec(src);
  const funkcje = KOTWICE_GS.filter((k) => src.includes(k));
  if (!deklaracja && !funkcje.length) return '';
  if (!deklaracja || funkcje.length !== KOTWICE_GS.length) throw new Error(`${PLIK_UI}: niepełny blok Gs_*`);
  return [deklaracja[0], ...KOTWICE_GS.map((k) => wytnijPoKotwicy(src, k))].join('\n');
}

// Okna zapisu z prawdziwego pliku UI w oknie `win`; jt() oddaje `sejf`.
function oknaUi(win, sejf) {
  const src = zrodlo(PLIK_UI);
  const kod = [blokGs(src), ...KOTWICE.map((k) => wytnijPoKotwicy(src, k))].join('\n');
  const Gh1 = (g) => `pomiar ${(g && g.rodzaj) || 'zmieniony'} gdzie indziej`;
  const Ot = () => {};
  const rejestr = "rejestr: () => (typeof Gs_otwarte === 'undefined' ? null : Gs_otwarte.length)";
  return new Function('i', 'jt', 'Gh1', 'Ot', `${kod}\nreturn { Gz2, Gh2, Ga2, Bsc9, Gh3, ${rejestr} };`)(win, () => sejf, Gh1, Ot);
}

// Dokument z tests/support/atrapa-dom-lekka.mjs, z document.querySelectorAll i rejestrem nasłuchów klawisza.
function dokumentUi() {
  const doc = atrapaDokumentu();
  doc.querySelectorAll = (s) => doc.documentElement.querySelectorAll(s);
  const klawisze = new Set();
  const dodaj = doc.addEventListener;
  doc.addEventListener = (typ, fn, opcje) => { if (typ === 'keydown') klawisze.add(fn); return dodaj(typ, fn, opcje); };
  doc.removeEventListener = (typ, fn) => { if (typ === 'keydown') klawisze.delete(fn); };
  doc.nasluchyKlawisza = () => klawisze.size;
  return doc;
}

// Stan obietnicy bez czekania na nią: { rozstrzygnieta, wartosc, blad }.
function sledz(obietnica) {
  const st = { rozstrzygnieta: false, wartosc: undefined, blad: undefined };
  obietnica.then((w) => { st.rozstrzygnieta = true; st.wartosc = w; }, (e) => { st.rozstrzygnieta = true; st.blad = e; });
  return st;
}

// Nakładka na prawdziwy sejf dla UI: rejestracje onLock i każde okno otwarte przez sejf (Gz2, Gh2) ze stanem obietnicy.
function sejfDlaUi(v) {
  const s = { rejestracjeOnLock: 0, okna: [] };
  const czekajacy = [];
  const owin = (rodzaj, f) => (typeof f !== 'function' ? f : (info) => {
    const obietnica = f(info);
    const okno = { rodzaj, info, stan: sledz(obietnica) };
    s.okna.push(okno);
    for (const c of czekajacy.splice(0)) if (c.rodzaj === rodzaj) c.r(okno); else czekajacy.push(c);
    return obietnica;
  });
  s.sejf = Object.create(v, {
    onLock: { value: (fn) => { s.rejestracjeOnLock += 1; return v.onLock(fn); } },
    setPatientIdentityResolver: { value: (f) => v.setPatientIdentityResolver(owin('Gz2', f)) },
    setSaveConflictResolver: { value: (f) => v.setSaveConflictResolver(owin('Gh2', f)) },
  });
  s.czekajNaOkno = (rodzaj) => {
    const jest = s.okna.find((o) => o.rodzaj === rodzaj);
    return jest ? Promise.resolve(jest) : new Promise((r) => { czekajacy.push({ rodzaj, r }); });
  };
  return s;
}

// Urządzenie z dwoma kontami (uprząż), dokumentem UI i oknami zarejestrowanymi przez Gh3 jak przy starcie strony.
async function urzadzenieZOknami() {
  const doc = dokumentUi();
  const d = await urzadzenie({ dokument: doc });
  const s = sejfDlaUi(d.v);
  const ui = oknaUi(d.win, s.sejf);
  ui.Gh3();
  return { d, doc, s, ui };
}

const kolejnaTura = () => new Promise((r) => { setImmediate(r); });
const kopia = (x) => JSON.parse(JSON.stringify(x));
const blokadaKarty = (patientId) => `vilda-save-pat:${patientId}`;
const nakladki = (doc) => doc.body.querySelectorAll('.vilda-auth-overlay').length;
const przyciski = (doc, wzor) => doc.body.querySelectorAll('button').filter((b) => wzor.test(b.textContent));
const klasaModala = (doc) => doc.body.classList.contains('vilda-modal-alert-open');

// Okno zamknięte w całości (od razu po blokadzie, bez czekania).
function oknoZamkniete(doc, opis) {
  expect(nakladki(doc), `${opis}: po blokadzie sejfu nakładka usunięta od razu`).toBe(0);
  expect(klasaModala(doc), `${opis}: po blokadzie sejfu klasa vilda-modal-alert-open zdjęta`).toBe(false);
}

// Odrzucenie zapisu po blokadzie sejfu: kod i komunikat zapisu.
function przerwany(r) {
  expect(r.ok, 'zapis po blokadzie sejfu nie kończy się powodzeniem').toBe(false);
  expect(r.kod, `zapis kończy się w sesji, w której ruszył (komunikat: ${r.komunikat})`).toBe('SESSION_CHANGED');
  expect(r.komunikat).toMatch(/Zapis przerwany/);
  expect(r.e.vildaSaveAborted, 'odrzucenie ze zmiany sesji, nie z anulowania w oknie').toBeFalsy();
}

// Od znacznika (stan sprzed blokady) — brak wywołań magazynu, szyfrowania, żądań blokady i powiadomień.
async function nicPoBlokadzie(d, z) {
  await kolejnaTura();
  const po = d.po(z);
  expect(po.wywKto, 'po blokadzie sejfu żadnego wywołania magazynu').toEqual([]);
  expect(po.bezKonta, 'po blokadzie sejfu żadnego wywołania magazynu bez konta').toEqual([]);
  expect(po.krypto, 'po blokadzie sejfu żadnej operacji crypto.subtle').toEqual([]);
  expect(po.locks, 'po blokadzie sejfu żadnego żądania blokady').toEqual([]);
  expect(po.zdarzenia.map((x) => x.typ), 'po blokadzie sejfu żadnego powiadomienia').toEqual([]);
  expect(d.zapisySesyjne(z), 'po blokadzie sejfu żadnego utrwalenia części sesyjnej').toBe(0);
}

// Blokada sejfu (lock('idle')) wykonuje się synchronicznie w chwili wywołania; oddaje stan sprzed niej.
function zablokujSejf(d) {
  const przed = d.znacznik();
  const gotowe = d.przelacz('blokada');
  return { przed, gotowe };
}

describe('P-SESJA-ZAPISU: okna zapisu zamykają się przy blokadzie sejfu', () => {
  it('U1: „Który to pacjent?” znika przy blokadzie sejfu, a zapis kończy się SESSION_CHANGED bez kliknięcia', async () => {
    const { d, doc, s } = await urzadzenieZOknami();
    const p1 = await d.v.savePatient(naglowek(7, { dob: null }), { dedup: false });
    const p2 = await d.v.savePatient(naglowek(7, { dob: null, wzrost: 121 }), { dedup: false });
    const zapis = wynik(d.v.savePatient(naglowek(7, { dob: null, wzrost: 140 }), {}));
    const okno = await s.czekajNaOkno('Gz2');
    expect(okno.info.candidates.map((k) => k.patientId).sort()).toEqual([p1.patientId, p2.patientId].sort());
    expect(nakladki(doc), 'okno otwarte').toBe(1);
    expect(klasaModala(doc)).toBe(true);
    expect(przyciski(doc, /To inne dziecko/)).toHaveLength(1);
    expect(doc.nasluchyKlawisza(), 'okno słucha klawisza Escape').toBe(1);
    const przedA = await d.trwaly('A');
    const przedB = await d.trwaly('B');

    const b = zablokujSejf(d);
    oknoZamkniete(doc, '„Który to pacjent?”');
    expect(doc.nasluchyKlawisza(), 'po blokadzie sejfu nasłuch klawisza Escape zdjęty').toBe(0);
    await b.gotowe;
    expect(okno.stan, 'obietnica okna rozstrzygnięta „anuluj”').toEqual({ rozstrzygnieta: true, wartosc: { akcja: 'anuluj' }, blad: undefined });

    przerwany(await zapis);
    await nicPoBlokadzie(d, b.przed);
    expect(d.po(b.przed).locks.filter((n) => n.startsWith('vilda-save-pat:')), 'żadnego żądania blokady karty').toEqual([]);

    await d.zaloguj('B');
    expect(nakladki(doc), 'po zalogowaniu B brak okna').toBe(0);
    expect(przyciski(doc, /To inne dziecko/), 'po zalogowaniu B brak przycisku „To inne dziecko”').toEqual([]);
    expect(s.okna, 'po zalogowaniu B żadnego nowego okna').toHaveLength(1);
    expect(await d.trwaly('B'), 'konto B: 0 kart').toEqual(przedB);
    expect(przedB).toMatchObject({ karty: 0, wersje: 0 });
    expect(await d.trwaly('A'), 'konto A bez nowej karty i wersji').toEqual(przedA);
  });

  it('U2: okno konfliktu pod blokadą karty znika przy blokadzie sejfu, zapis kończy się SESSION_CHANGED, blokada karty wolna od razu', async () => {
    const { d, doc, s } = await urzadzenieZOknami();
    const bazowy = naglowek(8, { pomiary: [[100, 118]] });
    const p = await d.v.savePatient(kopia(bazowy), { dedup: false });
    await d.v.savePatient(naglowek(8, { pomiary: [[100, 118], [110, 122]] }), { patientId: p.patientId, dedup: false });
    const zapis = wynik(d.v.savePatient(naglowek(8, { wzrost: 125, pomiary: [[100, 118]] }), {
      patientId: p.patientId, dedup: false, baselinePayload: bazowy,
    }));
    const okno = await s.czekajNaOkno('Gh2');
    const nazwa = blokadaKarty(p.patientId);
    expect(nakladki(doc), 'okno otwarte').toBe(1);
    expect(przyciski(doc, /Zapisz to, co w formularzu/)).toHaveLength(1);
    expect(d.locks.zajeta(nazwa), 'okno konfliktu czeka pod blokadą karty').toBe(true);
    const przedA = await d.kartaTrwala('A', p.patientId);

    const b = zablokujSejf(d);
    oknoZamkniete(doc, 'okno konfliktu');
    await b.gotowe;
    expect(okno.stan, 'obietnica okna rozstrzygnięta „anuluj”').toEqual({ rozstrzygnieta: true, wartosc: 'anuluj', blad: undefined });

    const r = await zapis;
    const wolnaPoOdrzuceniu = !d.locks.zajeta(nazwa);
    przerwany(r);
    expect(wolnaPoOdrzuceniu, 'blokada karty wolna zaraz po odrzuceniu').toBe(true);
    await nicPoBlokadzie(d, b.przed);

    await d.zaloguj('B');
    expect(nakladki(doc), 'po zalogowaniu B brak okna').toBe(0);
    expect(przyciski(doc, /Zapisz to, co w formularzu|Przyjmij dane z bazy/), 'po zalogowaniu B brak przycisków okna').toEqual([]);
    expect(await d.trwaly('B'), 'konto B: 0 kart i 0 wersji').toMatchObject({ karty: 0, wersje: 0 });
    expect(await d.v.getPatient(p.patientId), 'karta nieczytelna w sesji B').toBeNull();
    expect(await d.kartaTrwala('A', p.patientId), 'karta A bez nowej wersji').toEqual(przedA);

    await d.zaloguj('A');
    let czekal = 0;
    const nastepny = await wynik(d.v.savePatient(naglowek(8, { wzrost: 126, pomiary: [[100, 118], [110, 122]] }), {
      patientId: p.patientId, dedup: false, onLockWait() { czekal += 1; },
    }));
    expect(nastepny.ok, `następny zapis tej karty po ponownym zalogowaniu A (${nastepny.komunikat || ''})`).toBe(true);
    expect(nastepny.w.isNew).toBe(false);
    expect(czekal, 'następny zapis nie czeka na blokadę karty').toBe(0);
    expect(d.locks.zajeta(nazwa), 'blokada karty wolna po zapisie').toBe(false);
    expect(await d.kartaTrwala('A', p.patientId)).toEqual({ jest: true, wersje: przedA.wersje + 1 });
    expect(s.okna, 'żadnego nowego okna').toHaveLength(1);
  });

  it('U3: Ga2 i Bsc9 znikają przy blokadzie sejfu — Ga2 rozstrzyga „anuluj”, Bsc9 false', async () => {
    const { d, doc, ui } = await urzadzenieZOknami();
    const formularz = { name: 'Testowy Jan', user: { lastName: 'Testowy', firstName: 'Jan', sex: 'M', height: 120, weight: 22 } };
    const aktualne = { name: 'Testowy Jan', user: { lastName: 'Testowy', firstName: 'Jan', sex: 'M', height: 121, weight: 22 } };
    const ga = sledz(ui.Ga2(formularz, aktualne, '2026-10-29T08:00:00.000Z'));
    const bs = sledz(ui.Bsc9({
      cel: { patientId: 'karta-cel', header: { name: 'Testowy Jan', sex: 'M' }, snapshotCount: 2 },
      inne: [{ patientId: 'karta-dolaczana', header: { name: 'Testowy Jan', sex: 'M' }, snapshotCount: 1 }],
    }));
    expect(nakladki(doc), 'oba okna otwarte').toBe(2);
    expect(przyciski(doc, /Wróć do formularza/)).toHaveLength(1);
    expect(przyciski(doc, /Scal w jeden rekord/)).toHaveLength(1);
    expect(klasaModala(doc)).toBe(true);
    expect(doc.nasluchyKlawisza(), 'Bsc9 słucha klawisza Escape').toBe(1);

    const b = zablokujSejf(d);
    oknoZamkniete(doc, 'Ga2 i Bsc9');
    expect(doc.nasluchyKlawisza(), 'po blokadzie sejfu nasłuch klawisza Escape zdjęty').toBe(0);
    await b.gotowe;
    expect(ga, 'Ga2 rozstrzyga „anuluj”').toEqual({ rozstrzygnieta: true, wartosc: 'anuluj', blad: undefined });
    expect(bs, 'Bsc9 rozstrzyga false').toEqual({ rozstrzygnieta: true, wartosc: false, blad: undefined });
  });

  it('U4: okno szybkiego pomiaru znika przy blokadzie sejfu, także gdy żadne inne okno nie jest otwarte', async () => {
    const { d, doc } = await urzadzenieZOknami();
    const szybki = doc.createElement('div');
    szybki.className = 'vilda-auth-overlay vilda-auth-overlay-sheet vilda-quick-measure-overlay';
    szybki.appendChild(doc.createElement('input'));
    doc.body.appendChild(szybki);
    expect(doc.body.querySelectorAll('.vilda-quick-measure-overlay')).toHaveLength(1);

    const b = zablokujSejf(d);
    expect(doc.body.querySelectorAll('.vilda-quick-measure-overlay'), 'po blokadzie sejfu okno szybkiego pomiaru usunięte').toHaveLength(0);
    expect(szybki.isConnected).toBe(false);
    expect(nakladki(doc)).toBe(0);
    await b.gotowe;
  });
});

// Atrapa sejfu dla U5 i U8: liczy rejestracje onLock, lock() zamyka sejf i woła zarejestrowane nasłuchy, zaloguj()
// otwiera go ponownie.
function atrapaSejfu({ odblokowany = true } = {}) {
  const nasluchy = [];
  return {
    rejestracjeOnLock: 0,
    odblokowany,
    isUnlocked() { return this.odblokowany; },
    onLock(fn) { this.rejestracjeOnLock += 1; nasluchy.push(fn); },
    lock(powod = 'idle') { this.odblokowany = false; for (const fn of nasluchy.slice()) fn(powod); },
    zaloguj() { this.odblokowany = true; },
    setSaveConflictResolver() {},
    setPatientIdentityResolver() {},
  };
}

describe('P-SESJA-ZAPISU: rejestr okien zapisu w UI', () => {
  it('U5: jedna rejestracja onLock na dokument; okna zamknięte kliknięciem nie są zamykane drugi raz', async () => {
    const doc = dokumentUi();
    const sejf = atrapaSejfu();
    const ui = oknaUi({ document: doc }, sejf);
    ui.Gh3();
    const kandydaci = [
      { patientId: 'karta-1', name: 'Testowy Jan', sex: 'M', snapshotCount: 1 },
      { patientId: 'karta-2', name: 'Testowy Jan', sex: 'M', snapshotCount: 2 },
    ];
    const rundy = [
      { gz2: (o) => o.querySelectorAll('.vilda-auth-kandydat')[0], gz2W: { akcja: 'dopisz', patientId: 'karta-1' }, gh2: /Przyjmij dane z bazy/, gh2W: 'scal', ga2: /Zapisz moje zmiany/, ga2W: 'moje', bsc9: /Scal w jeden rekord/, bsc9W: true },
      { gz2: /To inne dziecko/, gz2W: { akcja: 'nowy' }, gh2: /Zapisz to, co w formularzu/, gh2W: 'nadpisz', ga2: /Porzuć moje zmiany/, ga2W: 'ich', bsc9: /^Anuluj$/, bsc9W: false },
      { gz2: /Anuluj zapis/, gz2W: { akcja: 'anuluj' }, gh2: /Anuluj zapis/, gh2W: 'anuluj', ga2: /Wróć do formularza/, ga2W: 'anuluj', bsc9: /^Anuluj$/, bsc9W: false },
    ];
    const kliknij = (wybor) => {
      const el = typeof wybor === 'function' ? wybor(doc.body) : przyciski(doc, wybor)[0];
      expect(el, `przycisk ${wybor}`).toBeTruthy();
      el.click();
    };
    for (const r of rundy) {
      const gz2 = ui.Gz2({ name: 'Testowy Jan', dobISO: null, candidates: kandydaci });
      kliknij(r.gz2);
      expect(await gz2).toEqual(r.gz2W);
      const gh2 = ui.Gh2({ foreign: [{ rodzaj: 'dopisany' }], headSavedAtISO: '2026-10-29T08:00:00.000Z' });
      kliknij(r.gh2);
      expect(await gh2).toBe(r.gh2W);
      const ga2 = ui.Ga2({ name: 'Testowy Jan', user: { height: 120 } }, { name: 'Testowy Jan', user: { height: 121 } }, null);
      kliknij(r.ga2);
      expect(await ga2).toBe(r.ga2W);
      const bsc9 = ui.Bsc9({ cel: { header: { name: 'Testowy Jan' } }, inne: [{ header: { name: 'Testowy Jan' } }] });
      kliknij(r.bsc9);
      expect(await bsc9).toBe(r.bsc9W);
      expect(nakladki(doc), 'okna zamknięte kliknięciem').toBe(0);
      expect(klasaModala(doc)).toBe(false);
    }
    expect(sejf.rejestracjeOnLock, 'dokładnie jedna rejestracja onLock na dokument (Gh3 i dwanaście okien)').toBe(1);
    expect(ui.rejestr(), 'okna zamknięte kliknięciem wypisane z rejestru').toBe(0);

    doc.body.classList.add('vilda-modal-alert-open'); // inne okno, otwarte później
    sejf.lock('idle');
    expect(klasaModala(doc), 'blokada nie zamyka drugi raz okien zamkniętych wcześniej kliknięciem').toBe(true);
    doc.body.classList.remove('vilda-modal-alert-open');

    sejf.zaloguj();
    const poBlokadzie = sledz(ui.Gz2({ name: 'Testowy Jan', dobISO: null, candidates: kandydaci }));
    expect(nakladki(doc)).toBe(1);
    sejf.lock('idle');
    oknoZamkniete(doc, 'okno otwarte po wcześniejszej blokadzie');
    await kolejnaTura();
    expect(poBlokadzie, 'obietnica okna rozstrzygnięta „anuluj”').toEqual({ rozstrzygnieta: true, wartosc: { akcja: 'anuluj' }, blad: undefined });
    expect(sejf.rejestracjeOnLock, 'nadal jedna rejestracja onLock').toBe(1);
  });
});

// ── Ekrany „Dodaj pacjenta”, „Dodaj do bazy” i „Importuj pacjentów” ───────────────────────────────────────────────────
const KOTWICE_EKRANOW = ['function ss(t,a,n){', 'function ds(t,a,n){', 'function zi(t,a){'];
const TYTUL_DUPLIKATU = /Ten pacjent może już być w bazie/;

// Dokument UI z polami formularzy (style, value), węzłami tekstu i fragmentem dokumentu.
function dokumentEkranu() {
  const doc = dokumentUi();
  const utworz = doc.createElement;
  doc.createElement = (tag) => { const el = utworz(tag); el.style = {}; el.value = ''; return el; };
  doc.createTextNode = (t) => { const el = utworz('#text'); el.textContent = String(t); return el; };
  doc.createDocumentFragment = () => utworz('#fragment');
  return doc;
}

// Czytnik plików okna: plik testu niesie treść w polu `tekst`.
class CzytnikPlikow {
  readAsText(plik) { Promise.resolve().then(() => { this.result = plik.tekst; this.onload(); }); }
}

// Ekrany z prawdziwego pliku UI w oknie `win`; jt() oddaje `sejf`. Ekran montowany w #vilda-auth-ui-root; otwarcie
// karty (se), lista pacjentów (ze) i wskaźnik pracy (Kt) zapisywane w `slad`.
function ekranyUi(win, sejf) {
  const src = zrodlo(PLIK_UI);
  const kod = [blokGs(src), ...KOTWICE.map((k) => wytnijPoKotwicy(src, k)), ...KOTWICE_EKRANOW.map((k) => wytnijPoKotwicy(src, k))].join('\n');
  const doc = win.document;
  const korzen = doc.createElement('div');
  korzen.id = 'vilda-auth-ui-root';
  doc.body.appendChild(korzen);
  const slad = { otwarte: [], listy: 0, praca: [] };
  const czekajacy = [];
  const powiadom = () => { for (const c of czekajacy.splice(0)) if (!c.sprawdz()) czekajacy.push(c); };
  slad.czekaj = (warunek) => new Promise((r) => { const c = { sprawdz: () => (warunek() ? (r(), true) : false) }; if (!c.sprawdz()) czekajacy.push(c); });
  const atrapy = {
    Gh1: () => 'pomiar zmieniony gdzie indziej', Ot: () => {}, jn: () => {}, ln: () => {}, $t: () => {}, je: () => {},
    me: () => {}, Be: () => {}, uo: () => {}, na: () => '', Xa: (x) => String(x), wiekLataMianownik: () => 'lat',
    ze: () => { slad.listy += 1; powiadom(); },
    se: (pid) => { slad.otwarte.push(pid); powiadom(); },
    Zt: (wezel) => { korzen.textContent = ''; korzen.appendChild(wezel); },
    Kt: (x) => { slad.praca.push(!!x); powiadom(); },
  };
  const nazwy = Object.keys(atrapy);
  const rejestr = "rejestr: () => (typeof Gs_otwarte === 'undefined' ? null : Gs_otwarte.length)";
  const api = new Function('i', 'jt', ...nazwy, `${kod}\nreturn { ss, ds, zi, Gz2, Gh2, Ga2, Bsc9, Gh3, ${rejestr} };`)(win, () => sejf, ...nazwy.map((n) => atrapy[n]));
  return { ...api, slad, korzen };
}

// Nakładka na prawdziwy sejf dla ekranów: wyszukanie imienników zapisuje wynik, a z bramą czeka na jej otwarcie
// (`bladWyszukania` — po bramie kończy się błędem); koniecWyszukania() — wyszukanie zakończone (wynikiem albo błędem);
// zapisy — wywołania zapisu z formularza ekranu
// (savePatient, saveExternalPatient, promoteExternalToBase, mergeExternalIntoPatient) z sesją w chwili wywołania.
function sejfEkranow(v, sesja) {
  const s = { wyszukania: [], brama: null, bladWyszukania: false, zakonczone: 0, zapisy: [] };
  const czekajacy = [];
  const konczacy = [];
  const zapis = (nazwa) => ({ value: (...a) => { s.zapisy.push(`${nazwa}(${sesja()})`); return v[nazwa](...a); } });
  s.sejf = Object.create(v, {
    findSameNamePatients: {
      value: async (nazwa) => {
        try {
          const w = await v.findSameNamePatients(nazwa);
          s.wyszukania.push(w);
          for (const c of czekajacy.splice(0)) c();
          if (s.brama) await s.brama;
          if (s.bladWyszukania) throw new Error('atrapa: wyszukanie imienników nieudane');
          return w;
        } finally {
          s.zakonczone += 1;
          for (const c of konczacy.splice(0)) c();
        }
      },
    },
    savePatient: zapis('savePatient'),
    saveExternalPatient: zapis('saveExternalPatient'),
    promoteExternalToBase: zapis('promoteExternalToBase'),
    mergeExternalIntoPatient: zapis('mergeExternalIntoPatient'),
  });
  s.wyszukano = () => (s.wyszukania.length ? Promise.resolve() : new Promise((r) => { czekajacy.push(r); }));
  s.koniecWyszukania = () => (s.zakonczone ? Promise.resolve() : new Promise((r) => { konczacy.push(r); }));
  return s;
}

async function urzadzenieZEkranami() {
  const doc = dokumentEkranu();
  const d = await urzadzenie({ dokument: doc, dodatki: { FileReader: CzytnikPlikow } });
  const s = sejfEkranow(d.v, () => d.sesja());
  const ui = ekranyUi(d.win, s.sejf);
  ui.Gh3();
  return { d, doc, s, ui };
}

const pole = (doc, placeholder) => doc.body.potomkowie().find((el) => el.tagName === 'INPUT' && String(el.getAttribute('placeholder') || '').startsWith(placeholder));
function wpisz(doc, pola) {
  for (const [placeholder, wartosc] of Object.entries(pola)) {
    const el = pole(doc, placeholder);
    expect(el, `pole „${placeholder}”`).toBeTruthy();
    el.value = wartosc;
    el.dispatch('input');
  }
}
const oknaDuplikatu = (doc) => doc.body.children.filter((el) => el.classList.contains('vilda-edit2') && TYTUL_DUPLIKATU.test(el.textContent));
function kliknijPrzycisk(doc, wzor) {
  const el = przyciski(doc, wzor)[0];
  expect(el, `przycisk ${wzor}`).toBeTruthy();
  el.click();
}

// Ekrany z imiennikiem w bazie A, z wypełnionym formularzem (przed kliknięciem): „Dodaj pacjenta” z danymi imiennika
// karty A i „Dodaj do bazy” osoby spoza bazy „Testowy Jan9” (otworz() oddaje jej patientId); przycisk — wyszukanie
// imienników i dalej zapis.
const EKRANY_WYSZUKANIA = {
  'Dodaj pacjenta': {
    przycisk: /Dodaj pacjenta/,
    async otworz({ d, doc, ui }) {
      await d.v.savePatient(naglowek(5), { dedup: false });
      ui.ss({}, null, 'base');
      wpisz(doc, { Nazwisko: 'Testowy', Imię: 'Jan5', 'DD-MM-RRRR': '12-03-2016', 'Imię i nazwisko opiekuna': 'Fikcyjna Matka', 'np. +48 600 100 200': '+48 000 000 000' });
      return null;
    },
  },
  'Dodaj do bazy': {
    przycisk: /Dodaj do bazy/,
    async otworz({ d, doc, ui }) {
      await d.v.savePatient(naglowek(9), { dedup: false });
      const zew = await d.v.saveExternalPatient({ lastName: 'Testowy', firstName: 'Jan9', sex: 'M', birthYear: '2016', contact: 'Fikcyjny kontakt' });
      ui.ds(await d.v.getPatient(zew.patientId), {}, null);
      wpisz(doc, { 'DD-MM-': '12-03-2016' });
      return zew.patientId;
    },
  },
};

// Ekran z imiennikiem; okno duplikatu otwarte po wyszukaniu imienników.
async function ekranZOknemDuplikatu(u, ekran) {
  const e = EKRANY_WYSZUKANIA[ekran];
  const pid = await e.otworz(u);
  kliknijPrzycisk(u.doc, e.przycisk);
  await u.s.wyszukano();
  await kolejnaTura();
  return pid;
}
const dodajPacjentaZImiennikiem = (u) => ekranZOknemDuplikatu(u, 'Dodaj pacjenta');
const dodajDoBazyZImiennikiem = (u) => ekranZOknemDuplikatu(u, 'Dodaj do bazy');

const EKRANY_DUPLIKATU = {
  'Dodaj pacjenta': dodajPacjentaZImiennikiem,
  'Dodaj do bazy': dodajDoBazyZImiennikiem,
};

describe('P-SESJA-ZAPISU: okno „Ten pacjent może już być w bazie” zamyka się przy blokadzie sejfu', () => {
  it.each(Object.keys(EKRANY_DUPLIKATU).map((n, i) => [`U${6 + i}`, n]))('%s: „%s” — okno duplikatu znika przy blokadzie sejfu; po zalogowaniu B brak okna i kart', async (_id, ekran) => {
    const u = await urzadzenieZEkranami();
    const { d, doc, ui } = u;
    await EKRANY_DUPLIKATU[ekran](u);
    expect(oknaDuplikatu(doc), 'okno duplikatu otwarte w sesji A').toHaveLength(1);
    expect(przyciski(doc, /Utwórz nowego/)).toHaveLength(1);
    expect(doc.nasluchyKlawisza(), 'okno słucha klawisza Escape').toBe(1);
    const przedA = await d.trwaly('A');
    const przedB = await d.trwaly('B');

    const b = zablokujSejf(d);
    expect(oknaDuplikatu(doc), 'po blokadzie sejfu okno usunięte od razu').toHaveLength(0);
    expect(doc.nasluchyKlawisza(), 'po blokadzie sejfu nasłuch klawisza Escape zdjęty').toBe(0);
    expect(ui.rejestr(), 'rejestr okien pusty').toBe(0);
    await b.gotowe;

    await d.zaloguj('B');
    expect(oknaDuplikatu(doc), 'po zalogowaniu B brak okna').toHaveLength(0);
    expect(przyciski(doc, /Utwórz nowego/), 'po zalogowaniu B brak przycisku „Utwórz nowego”').toEqual([]);
    expect(ui.slad.otwarte, 'żadna karta nie otwarta').toEqual([]);
    expect(await d.trwaly('B'), 'konto B bez kart').toEqual(przedB);
    expect(await d.trwaly('A'), 'konto A bez zmian').toEqual(przedA);
  });

  it.each(Object.keys(EKRANY_WYSZUKANIA).flatMap((n) => [[n, 'wynikiem'], [n, 'błędem']]))('U8: „%s” — wyszukanie imienników kończy się %s po blokadzie sejfu: bez okna duplikatu i bez zapisu, przycisk odblokowany, także po zalogowaniu B', async (ekran, koniec) => {
    const u = await urzadzenieZEkranami();
    const { d, doc, s, ui } = u;
    const e = EKRANY_WYSZUKANIA[ekran];
    await e.otworz(u);
    let otworz;
    s.brama = new Promise((r) => { otworz = r; });
    s.bladWyszukania = koniec === 'błędem';
    kliknijPrzycisk(doc, e.przycisk);
    await s.wyszukano();
    expect(s.wyszukania[0], 'imiennik znaleziony w sesji A').toHaveLength(1);
    const przedB = await d.trwaly('B');

    const b = zablokujSejf(d);
    otworz();
    await s.koniecWyszukania();
    await kolejnaTura();
    expect(oknaDuplikatu(doc), 'okno duplikatu nie zostaje').toHaveLength(0);
    expect(doc.nasluchyKlawisza(), 'bez nasłuchu klawisza Escape').toBe(0);
    expect(ui.rejestr(), 'rejestr okien pusty').toBe(0);
    expect(s.zapisy, 'bez zapisu z formularza').toEqual([]);
    expect(przyciski(doc, e.przycisk)[0].disabled, 'przycisk odblokowany').toBe(false);
    await b.gotowe;

    await d.zaloguj('B');
    expect(oknaDuplikatu(doc), 'po zalogowaniu B brak okna').toHaveLength(0);
    expect(przyciski(doc, /Utwórz nowego/)).toEqual([]);
    expect(ui.slad.otwarte, 'żadna karta nie otwarta').toEqual([]);
    expect(s.zapisy, 'po zalogowaniu B bez zapisu z formularza').toEqual([]);
    expect(await d.trwaly('B'), 'konto B bez kart').toEqual(przedB);
  });

  // Przegląd 2 (F1): blokada i zalogowanie B, zanim wyszukanie (wynik z imiennikiem A policzony w A) się skończy. Bez flagi
  // wyszukania okno duplikatu z kartą A otworzyłoby się w odblokowanej sesji B, a przy błędzie wyszukania formularz A
  // zapisałby się w B. U8 (sama blokada) tego nie rozróżnia: okno otwarte przy zablokowanym sejfie zamyka się od razu.
  it.each(Object.keys(EKRANY_WYSZUKANIA).flatMap((n) => [[n, 'wynikiem'], [n, 'błędem']]))('U8b: „%s” — blokada i zalogowanie B, zanim wyszukanie imienników (imiennik w A) skończy się %s: bez okna duplikatu i bez zapisu w B, przycisk odblokowany', async (ekran, koniec) => {
    const u = await urzadzenieZEkranami();
    const { d, doc, s, ui } = u;
    const e = EKRANY_WYSZUKANIA[ekran];
    await e.otworz(u);
    let otworz;
    s.brama = new Promise((r) => { otworz = r; });
    s.bladWyszukania = koniec === 'błędem';
    kliknijPrzycisk(doc, e.przycisk);
    await s.wyszukano();
    expect(s.wyszukania[0], 'imiennik znaleziony w sesji A').toHaveLength(1);
    const przedB = await d.trwaly('B');

    await zablokujSejf(d).gotowe;
    await d.zaloguj('B');
    otworz();
    await s.koniecWyszukania();
    await kolejnaTura();

    expect(d.sesja()).toBe('B');
    expect(oknaDuplikatu(doc), 'bez okna duplikatu (z kartą A) w sesji B').toHaveLength(0);
    expect(przyciski(doc, /Utwórz nowego/), 'bez przycisku „Utwórz nowego”').toEqual([]);
    expect(doc.nasluchyKlawisza(), 'bez nasłuchu klawisza Escape').toBe(0);
    expect(ui.rejestr(), 'rejestr okien pusty').toBe(0);
    expect(ui.slad.otwarte, 'żadna karta nie otwarta').toEqual([]);
    expect(s.zapisy, 'bez zapisu z formularza A w sesji B').toEqual([]);
    expect(przyciski(doc, e.przycisk)[0].disabled, 'przycisk odblokowany').toBe(false);
    expect(await d.trwaly('B'), 'konto B bez kart').toEqual(przedB);
  });

  it.each(Object.keys(EKRANY_WYSZUKANIA))('U11: „%s” — blokada i zalogowanie B w czasie wyszukania imienników (po odczycie listy kart A): bez okna duplikatu i bez zapisu, w B 0 kart, przycisk odblokowany', async (ekran) => {
    const u = await urzadzenieZEkranami();
    const { d, doc, s, ui } = u;
    const e = EKRANY_WYSZUKANIA[ekran];
    await e.otworz(u);
    const przedA = await d.trwaly('A');
    const przedB = await d.trwaly('B');
    const hak = d.przelaczPo({ metoda: 'listPatientsForUser', konto: 'A' }, 'B');

    kliknijPrzycisk(doc, e.przycisk);
    await s.koniecWyszukania();
    expect(hak.zrobione, 'wyszukanie imienników odczytało listę kart A').toBe(true);
    await hak.gotowe;
    await kolejnaTura();

    expect(d.sesja()).toBe('B');
    expect(s.zapisy, 'bez zapisu z formularza').toEqual([]);
    expect(oknaDuplikatu(doc), 'bez okna duplikatu').toHaveLength(0);
    expect(doc.nasluchyKlawisza(), 'bez nasłuchu klawisza Escape').toBe(0);
    expect(ui.rejestr(), 'rejestr okien pusty').toBe(0);
    expect(ui.slad.otwarte, 'żadna karta nie otwarta').toEqual([]);
    expect(przyciski(doc, e.przycisk)[0].disabled, 'przycisk odblokowany').toBe(false);
    expect(await d.trwaly('B'), 'konto B: 0 kart').toEqual(przedB);
    expect(przedB).toMatchObject({ karty: 0 });
    expect(await d.trwaly('A'), 'konto A bez zmian').toEqual(przedA);
  });

  it('U8: Gz2, Gh2, Ga2 i Bsc9 otwierane przy zablokowanym sejfie — zamknięte od razu, obietnice rozstrzygnięte', async () => {
    const doc = dokumentUi();
    const sejf = atrapaSejfu({ odblokowany: false });
    const ui = oknaUi({ document: doc }, sejf);
    ui.Gh3();
    const okna = [
      ['Gz2', () => ui.Gz2({ name: 'Testowy Jan', dobISO: null, candidates: [{ patientId: 'karta-1', name: 'Testowy Jan', sex: 'M', snapshotCount: 1 }] }), { akcja: 'anuluj' }],
      ['Gh2', () => ui.Gh2({ foreign: [{ rodzaj: 'dopisany' }], headSavedAtISO: '2026-10-29T08:00:00.000Z' }), 'anuluj'],
      ['Ga2', () => ui.Ga2({ name: 'Testowy Jan', user: { height: 120 } }, { name: 'Testowy Jan', user: { height: 121 } }, null), 'anuluj'],
      ['Bsc9', () => ui.Bsc9({ cel: { header: { name: 'Testowy Jan' } }, inne: [{ header: { name: 'Testowy Jan' } }] }), false],
    ];
    for (const [nazwa, otworz, oczek] of okna) {
      const stan = sledz(otworz());
      expect(nakladki(doc), `${nazwa}: żadna nakładka nie zostaje`).toBe(0);
      expect(klasaModala(doc), `${nazwa}: bez klasy vilda-modal-alert-open`).toBe(false);
      expect(doc.nasluchyKlawisza(), `${nazwa}: bez nasłuchu klawisza Escape`).toBe(0);
      expect(ui.rejestr(), `${nazwa}: rejestr okien pusty`).toBe(0);
      await kolejnaTura();
      expect(stan, `${nazwa}: obietnica rozstrzygnięta`).toEqual({ rozstrzygnieta: true, wartosc: oczek, blad: undefined });
    }
  });

  it('U12: Gz2, gdy UI nie ma sejfu (jt() bez sejfu) — okno zamknięte od razu, obietnica „anuluj”', async () => {
    const doc = dokumentUi();
    const ui = oknaUi({ document: doc }, null);
    const stan = sledz(ui.Gz2({ name: 'Testowy Jan', dobISO: null, candidates: [{ patientId: 'karta-1', name: 'Testowy Jan', sex: 'M', snapshotCount: 1 }] }));
    expect(nakladki(doc), 'bez nakładki').toBe(0);
    expect(klasaModala(doc)).toBe(false);
    expect(doc.nasluchyKlawisza()).toBe(0);
    await kolejnaTura();
    expect(stan).toEqual({ rozstrzygnieta: true, wartosc: { akcja: 'anuluj' }, blad: undefined });
  });

  it('U12: atrapa sejfu bez isUnlocked — okno otwarte i zarejestrowane, blokada je zamyka', async () => {
    const doc = dokumentUi();
    const { isUnlocked: _bez, ...sejf } = atrapaSejfu();
    const ui = oknaUi({ document: doc }, sejf);
    ui.Gh3();
    const stan = sledz(ui.Gz2({ name: 'Testowy Jan', dobISO: null, candidates: [{ patientId: 'karta-1', name: 'Testowy Jan', sex: 'M', snapshotCount: 1 }] }));
    expect(nakladki(doc), 'okno otwarte').toBe(1);
    expect(ui.rejestr(), 'okno w rejestrze').toBe(1);
    sejf.lock('idle');
    oknoZamkniete(doc, 'Gz2');
    await kolejnaTura();
    expect(stan).toEqual({ rozstrzygnieta: true, wartosc: { akcja: 'anuluj' }, blad: undefined });
  });

  it.each(Object.keys(EKRANY_DUPLIKATU))('U10: „%s” — „Anuluj” zamyka okno duplikatu i wypisuje je z rejestru; blokada niczego już nie zamyka', async (ekran) => {
    const u = await urzadzenieZEkranami();
    const { d, doc, ui } = u;
    await EKRANY_DUPLIKATU[ekran](u);
    expect(ui.rejestr(), 'okno w rejestrze').toBe(1);
    const anuluj = oknaDuplikatu(doc)[0].potomkowie().find((el) => el.tagName === 'BUTTON' && el.textContent === 'Anuluj');
    anuluj.click();
    expect(oknaDuplikatu(doc)).toHaveLength(0);
    expect(doc.nasluchyKlawisza()).toBe(0);
    expect(ui.rejestr(), 'okno wypisane z rejestru').toBe(0);
    await zablokujSejf(d).gotowe;
    expect(ui.slad.otwarte).toEqual([]);
  });
});

// Pliki .json „Testowy Jan21…23” (stary format, bez szyfrowania).
const PLIKI_IMPORTU = [21, 22, 23].map((i) => ({ name: `testowy-jan${i}.json`, tekst: JSON.stringify(naglowek(i)) }));

// Ekran „Importuj pacjentów” z wybranymi plikami (lista podglądu gotowa).
async function ekranImportu({ doc, ui }) {
  ui.zi({}, {});
  const wybor = doc.body.potomkowie().find((el) => el.tagName === 'INPUT' && el.getAttribute('type') === 'file');
  expect(wybor, 'pole wyboru plików').toBeTruthy();
  wybor.files = PLIKI_IMPORTU;
  const od = ui.slad.praca.length;
  wybor.dispatch('change');
  await ui.slad.czekaj(() => ui.slad.praca.slice(od).includes(false));
  const importuj = przyciski(doc, /^Importuj/)[0];
  expect(importuj && importuj.textContent, 'przycisk importu wszystkich plików').toBe('Importuj wszystko (3)');
  return importuj;
}
const podsumowanie = (doc) => doc.body.querySelectorAll('.vilda-auth-info')[0];

describe('P-SESJA-ZAPISU: pętla „Importuj” kończy się przy blokadzie sejfu', () => {
  it.each(['B', 'blokada'])('U9: przełączenie %s w trakcie zapisu pierwszego pliku — import kończy się przed drugim plikiem, bez podsumowania', async (wariant) => {
    const u = await urzadzenieZEkranami();
    const { d, doc, ui } = u;
    const importuj = await ekranImportu(u);
    const przedA = await d.trwaly('A');
    const przedB = await d.trwaly('B');
    const hak = d.przelaczPo({ metoda: 'removeTombstoneForUser', konto: 'A' }, wariant);

    const od = ui.slad.praca.length;
    importuj.click();
    await ui.slad.czekaj(() => ui.slad.praca.slice(od).includes(false));
    const z = await hak.gotowe;
    await kolejnaTura();

    expect(d.po(z).wywKto, 'po zmianie sesji żadnego wywołania magazynu (dalsze pliki nie ruszają)').toEqual([]);
    expect(d.po(z).zdarzenia.map((e) => e.typ), 'po zmianie sesji żadnego powiadomienia').toEqual([]);
    expect(await d.trwaly('B'), 'konto B bez kart').toEqual(przedB);
    expect((await d.trwaly('A')).karty, 'w A tylko pierwszy plik (zapisany przed zmianą sesji)').toBe(przedA.karty + 1);
    const info = podsumowanie(doc);
    expect(info.style.display, 'podsumowanie nie pokazane').not.toBe('block');
    expect(info.textContent, 'bez podsumowania z nazwami plików').toBe('');
    expect(importuj.textContent).not.toBe('Import zakończony');
    expect(ui.rejestr(), 'rejestr okien pusty').toBe(0);
  });
});

describe('P-SESJA-ZAPISU: kontrole ekranów w jednej sesji', () => {
  it.each([['Dodaj pacjenta', 'savePatient'], ['Dodaj do bazy', 'promoteExternalToBase']])('K10: „%s” — wyszukanie imienników kończy się błędem w tej samej sesji: zapis jak dotąd (%s w A), rejestr okien pusty', async (ekran, zapis) => {
    const u = await urzadzenieZEkranami();
    const { d, doc, s, ui } = u;
    const e = EKRANY_WYSZUKANIA[ekran];
    const pid = await e.otworz(u);
    s.bladWyszukania = true;
    kliknijPrzycisk(doc, e.przycisk);
    await s.koniecWyszukania();
    await ui.slad.czekaj(() => ui.slad.otwarte.length > 0);
    expect(s.zapisy, 'zapis z formularza po nieudanym wyszukaniu, jak dotąd').toEqual([`${zapis}(A)`]);
    expect(oknaDuplikatu(doc)).toHaveLength(0);
    expect(ui.rejestr() ?? 0, 'rejestr okien pusty (gdy jest w pliku)').toBe(0);
    if (pid) expect(ui.slad.otwarte).toEqual([pid]);
    const karta = await d.v.getPatient(ui.slad.otwarte[0]);
    expect(karta.header.external, 'karta w bazie').toBeFalsy();
  });

  it('K6: „Dodaj pacjenta” — „Utwórz nowego” w oknie duplikatu zapisuje kartę w A i otwiera ją', async () => {
    const u = await urzadzenieZEkranami();
    const { d, doc, ui } = u;
    await dodajPacjentaZImiennikiem(u);
    const przedA = await d.trwaly('A');
    kliknijPrzycisk(doc, /Utwórz nowego/);
    await ui.slad.czekaj(() => ui.slad.otwarte.length > 0);
    expect(oknaDuplikatu(doc)).toHaveLength(0);
    expect(ui.rejestr() ?? 0, 'rejestr okien pusty (gdy jest w pliku)').toBe(0);
    expect((await d.trwaly('A')).karty).toBe(przedA.karty + 1);
    const karta = await d.v.getPatient(ui.slad.otwarte[0]);
    expect(karta.header.name).toBe('Testowy Jan5');
    expect(karta.snapshots[0].payload.guardian).toMatchObject({ name: 'Fikcyjna Matka', phone: '+48 000 000 000' });
  });

  it('K7: „Dodaj do bazy” — „Utwórz nowego” w oknie duplikatu przenosi osobę do bazy A', async () => {
    const u = await urzadzenieZEkranami();
    const { d, doc, ui } = u;
    const pid = await dodajDoBazyZImiennikiem(u);
    kliknijPrzycisk(doc, /Utwórz nowego/);
    await ui.slad.czekaj(() => ui.slad.otwarte.length > 0);
    expect(ui.slad.otwarte).toEqual([pid]);
    expect(oknaDuplikatu(doc)).toHaveLength(0);
    expect(ui.rejestr() ?? 0, 'rejestr okien pusty (gdy jest w pliku)').toBe(0);
    const karta = await d.v.getPatient(pid);
    expect(karta.header.external, 'osoba w bazie').toBeFalsy();
    expect(karta.header.dobISO).toBe('2016-03-12');
  });

  it('K9: „Importuj” bez blokady — trzy karty w A i podsumowanie', async () => {
    const u = await urzadzenieZEkranami();
    const { d, doc, ui } = u;
    const importuj = await ekranImportu(u);
    const przedA = await d.trwaly('A');
    const od = ui.slad.praca.length;
    importuj.click();
    await ui.slad.czekaj(() => ui.slad.praca.slice(od).includes(false));
    await kolejnaTura();
    expect((await d.trwaly('A')).karty).toBe(przedA.karty + 3);
    const info = podsumowanie(doc);
    expect(info.style.display).toBe('block');
    expect(info.textContent).toMatch(/Import zakończony/);
    expect(info.textContent).toMatch(/Nowych pacjentów: 3/);
    expect(importuj.textContent).toBe('Import zakończony');
    expect(ui.rejestr() ?? 0, 'rejestracja importu zdjęta (gdy rejestr jest w pliku)').toBe(0);
  });
});
