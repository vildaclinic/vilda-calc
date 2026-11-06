// P-USUN-KONTO-KARTY (E2-PR3a1b) — sejf drugiej karty: „Usuń konto” w jednej karcie nie czeka na drugą kartę z tym
// samym kontem; druga karta zamyka połączenie z bazą sejfu konta, blokuje się (powód user-removed-elsewhere) i nie czyta
// ani nie zapisuje danych konta; logowanie w toku kończy się odmową (formularz logowania zostaje); nowsza wersja bazy
// w innej karcie daje APP_UPDATED.
//
// Prawdziwy sejf z modułami punktu odzyskiwania w oknie uprzęży tests/support/okno-magazynu.mjs (adapter IndexedDB sejfu
// nad atrapą tests/support/atrapa-indexeddb.mjs, tryb „Komputer prywatny”, jeśli przypadek nie mówi inaczej); druga
// karta = drugie okno na tej samej atrapie. Bramka dziennika zdarzeń zamknięta, jeśli przypadek nie mówi inaczej.
// „Konto X” = konto usuwane (o.A), „konto Y” = drugie konto (o.B). Dane WYŁĄCZNIE FIKCYJNE.
//
// WYMAGANIA
//   - Druga karta z tym samym kontem: „Usuń konto” w karcie A kończy się bez czekania; karta B zamyka połączenie z bazą
//     sejfu konta, blokuje się z powodem user-removed-elsewhere (karta usuwająca — user-removed, bez drugiej blokady)
//     i od tej chwili nie czyta ani nie zapisuje danych konta (odmowa ACCOUNT_REMOVED albo sprawdzenia sesji
//     (P-SESJA-ZAPISU)); lista kont karty B pomija usunięte konto; baza konta nie powstaje od nowa.
//   - Karta B z innym kontem — bez zmian (sesja nietknięta), jej połączenie z bazą usuwanego konta zamyka się.
//   - Logowanie w toku w karcie B (hasło, klucz odzyskiwania) kończy się odmową ACCOUNT_REMOVED z tekstem „To konto
//     zostało usunięte z tej przeglądarki.”, bez zapisu sesji i powiadomienia o odblokowaniu, z wyzerowanymi bajtami
//     klucza; blokada user-removed (formularz logowania zostaje). Usunięcie po ustawieniu sesji (ostatnie kroki
//     logowania) — jak karta zalogowana (user-removed-elsewhere); tryb zapisu po odmowie jak po blokadzie. Odtworzenie
//     sesji po przeładowaniu — false, blokada user-removed-elsewhere.
//   - Nowsza wersja bazy sejfu w innej karcie: karta zamyka połączenie (podniesienie wersji nie czeka), kolejne
//     operacje danych konta — APP_UPDATED z tekstem „Aplikację zaktualizowano w innej karcie. Odśwież tę stronę.”;
//     VersionError przy otwarciu → APP_UPDATED; logowanie w takiej karcie kończy się sesją (bez blokady).
//   - Wymuszone zamknięcie połączenia przez przeglądarkę: bazy nie ma — jak usunięcie w innej karcie; baza jest — karta
//     działa dalej. Karta zalogowana bez połączenia z bazą (np. po wymuszonym zamknięciu) po usunięciu konta w innej
//     karcie — blokada przy pierwszej operacji danych konta.
//   - Karta usuwająca: isRemovingCurrentUser() prawdziwe od kasowania bazy sejfu konta bieżącej sesji do blokady
//     (fałsz przy usuwaniu innego konta i po błędzie kasowania); zapis metadanych rozpoczęty przed „Usuń konto” kończy
//     się odmową ACCOUNT_REMOVED, a odczyt metadanych w trakcie własnego kasowania — brakiem metadanych, bez bazy konta.
//   - Odczyt konta bez metadanych nie zakłada bazy sejfu konta; zakłada ją założenie konta.
//   - Karta ze starszą wersją aplikacji (połączenie bez obsługi versionchange): „Usuń konto” czeka, aż ją zamkniesz.
//   - Tryb „Zaloguj jednorazowo” w drugiej karcie (inne konto) — bez zmian.
//   - Ekran startowy: baner tylko z napisu (wywołania bez argumentu, z obiektem albo zdarzeniem — bez banera).
//   - vilda_frame_sync.js nie przeładowuje dokumentu, który sam kasuje konto bieżącej sesji (isRemovingCurrentUser);
//     sejf bez tej funkcji albo z funkcją, która rzuca — przeładowanie jak dotąd.
//   - Błędy ACCOUNT_REMOVED i APP_UPDATED niosą kod i stały komunikat, bez danych konta.
//   - Część magazynu kolejki: karta B w trakcie usuwania konta nie zapisuje identyfikatora urządzenia, a identyfikator,
//     który sama zapisała, usuwa sama.
//
// PRZYPADKI (UK1–UK20)
//   UK1, UK1b, UK1c  druga karta zalogowana na X; dwa równoczesne logowania w toku; połączenie bez obsługi versionchange.
//   UK2      druga karta zalogowana na Y (wcześniej na X).
//   UK3 (1)–(3)  karta usuwająca: isRemovingCurrentUser, osierocone połączenie po trybie jednorazowym, zapis i odczyt
//            metadanych w trakcie własnego kasowania.
//   UK4, UK4b  operacje danych konta po usunięciu; zapis w toku — sprawdzenia sesji (P-SESJA-ZAPISU).
//   UK5, UK6  karta B niezalogowana na ekranie logowania X; stan dokumentu przed powiadomieniem o blokadzie.
//   UK7, UK7b, UK7c  nowsza wersja bazy: odmowy, otwarcie w toku, logowanie w toku.
//   UK8      bramka zamknięta: karta B bez zapisów vilda-sync-* i bez baz kolejki.
//   UK9, UK9b, UK9c  lista kont (getStatus, listUsers) w obsłudze blokady i w karcie usuwającej.
//   UK10, UK10b, UK10c  isRemovingCurrentUser: konto niebieżące, błąd kasowania, drugie removeUser, wyjątek synchroniczny.
//   UK11 (1)–(3)  wymuszone zamknięcie: baza usunięta, baza jest, karta bez połączenia.
//   UK12, UK12c (a)(b)  tryb „Zaloguj jednorazowo” w karcie B; removeUser w obu kartach (bez Web Locks).
//   UK13     tryb „Komputer w pracy”.
//   UK14, UK14b, UK14c, UK14e, UK14f, UK14g  logowanie i odtworzenie sesji w toku.
//   UK15 (1)–(4)  konto bez metadanych (jak gałąź KT K2); założenie konta.
//   UK16 (1)–(3)  ekran startowy bez banera dla wywołań bez napisu.
//   UK17 (1)–(4)  vilda_frame_sync.js (prawdziwy plik) w oknie z celem zdarzeń i szyną BroadcastChannel.
//   UK18     kody i komunikaty błędów.
//   UK19 (1)(2)  strażniki tekstowe: testy drugiej karty nie zamykają połączeń z bazą sejfu same.
//   UK20, UK20b  identyfikator urządzenia przy usunięciu konta (osobny widok localStorage na okno).
// Na sejfie sprzed tej zmiany (E2-PR3a1) czerwonych jest 39 z 50 przypadków — wszystkie poza strażnikami UK1c, UK9b,
// UK12, UK15 (4), UK16 (1)–(3), UK17 (1), UK17 (3) i UK19 (1)(2): usuwanie czeka na połączenie drugiej karty („nie
// doczekano: …”), brak isRemovingCurrentUser albo brak nowego zachowania.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SKRYPTY_PUNKTU, czytajRekord, drugieOkno, kluczUrzadzenia, naAtrapie, oknoMagazynu, przechwycZadaniaWTle,
} from '../support/okno-magazynu.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { naglowek, wynik, zrodlo } from './sesja-zapisu-uprzaz.mjs';

const BAZA = (uid) => `vilda_user_${uid}`;
const REJESTR = 'vilda_registry';
const SESJA = 'vilda-vault-session-v2';
const SESJA_CHMURY = 'vilda-cloud-only-session-v1';
const TEKST_USUNIETE = 'To konto zostało usunięte z tej przeglądarki.';
const TEKST_WERSJA = 'Aplikację zaktualizowano w innej karcie. Odśwież tę stronę.';
const BEZ_KONTA = 'fedcbafedcba0abcfedcbafedcba0def';
const LIMIT_OCZEKIWANIA_MS = 8000;
const realnySetTimeout = globalThis.setTimeout;
const makrozadanie = () => new Promise((r) => { setImmediate(r); });

// ── Higiena ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const OKNA = [];
const UCHWYTY = [];
beforeEach(() => { przechwycZadaniaWTle(); });
afterEach(async () => {
  for (const u of UCHWYTY.splice(0)) u.zwolnij();
  for (const o of OKNA.splice(0)) {
    o.krypto.rozbroj();
    if (o.locks) await o.locks.zwolnijWszystkie();
    o.timery.wyczysc();
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function nowe(opcje = {}) {
  const o = await oknoMagazynu({ skrypty: SKRYPTY_PUNKTU, konta: 'A', bramka: false, ...opcje });
  OKNA.push(o);
  return o;
}
async function drugie(o, opcje = {}) {
  const o2 = await drugieOkno(o, { bramka: false, ...opcje });
  OKNA.push(o2);
  return o2;
}

// ── Czekanie ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// Obietnica z limitem czasu rzeczywistego: po limicie błąd z opisem (przypadek czerwony z czytelnym komunikatem zamiast
// wiszenia do limitu testu).
function doczekaj(obietnica, opis, ms = LIMIT_OCZEKIWANIA_MS) {
  let zegar;
  const limit = new Promise((_, zle) => { zegar = realnySetTimeout(() => zle(new Error(`nie doczekano: ${opis}`)), ms); });
  return Promise.race([Promise.resolve(obietnica), limit]).finally(() => clearTimeout(zegar));
}
async function czekajNa(warunek, opis, ms = LIMIT_OCZEKIWANIA_MS) {
  const koniec = performance.now() + ms;
  while (performance.now() < koniec) {
    if (warunek()) return;
    await makrozadanie();
  }
  throw new Error(`nie doczekano: ${opis}`);
}
const wstrzymaj = (o, wz) => { const h = o.idb.__atrapa.wstrzymaj(wz); UCHWYTY.push(h); return h; };
const wstrzymajKrypto = (o, dop) => { const h = o.krypto.wstrzymaj(dop); UCHWYTY.push(h); return h; };
// Wstrzymanie drugiego pasującego punktu success (pierwszy przechodzi): uchwyt { h } dostępny po pierwszym.
function wstrzymajDrugi(o, wz) {
  const u = { h: null };
  o.idb.__atrapa.hak({ przy: 'success', ...wz }, () => { u.h = wstrzymaj(o, { przy: 'success', ...wz }); });
  return u;
}

// ── Stan ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
const usun = (o, kto = 'A') => wynik(o.v.removeUser(o[kto].userId, o[kto].haslo));
const bazy = (o) => Object.keys(o.idb.__atrapa.bazy()).sort();
const blokady = (o) => { const l = []; o.v.onLock((p) => l.push(p)); return l; };
const odblokowania = (o) => { const l = []; o.v.onUnlock((x) => l.push(x && x.trigger)); return l; };
const kod = (w) => (w.ok ? { ok: true } : { ok: false, kod: w.kod, komunikat: w.komunikat });
const log = (o) => o.idb.__atrapa.log;
// Indeks pierwszego versionchange bazy sejfu konta w logu atrapy (-1 — nie było).
const poZmianie = (o, uid) => log(o).findIndex((w) => w[0] === 'versionchange' && w[1] === BAZA(uid));
const jestZmiana = (o, uid) => poZmianie(o, uid) >= 0;
const wpisyOd = (o, od, rodzaj, baza) => log(o).slice(od).filter((w) => w[0] === rodzaj && (baza === undefined || (baza instanceof RegExp ? baza.test(String(w[1])) : w[1] === baza)));
// Otwarcie bazy w podanej wersji z innego „dokumentu” (połączenie testu, zamykane po sukcesie): 'ok' | 'blocked' | błąd.
function otworzWersje(idb, nazwa, wersja) {
  return new Promise((ok) => {
    const q = idb.open(nazwa, wersja);
    q.onupgradeneeded = () => {};
    q.onsuccess = () => { q.result.close(); ok('ok'); };
    q.onerror = (e) => { e.preventDefault(); ok(q.error ? q.error.name : 'error'); };
    q.onblocked = () => ok('blocked');
  });
}
// Szpieg importu klucza z bajtów: argumenty (tablice bajtów) zostają do sprawdzenia zerowania.
function szpiegBajtow(o) {
  const bajty = [];
  const c = o.win.VildaCrypto;
  const imp = c.importMasterKeyFromBytes;
  vi.spyOn(c, 'importMasterKeyFromBytes').mockImplementation(function (b) { bajty.push(b); return imp.apply(this, arguments); });
  return bajty;
}
// Import klucza z bajtów w oknie kończy się dla `liczba` wywołań w jednym zadaniu: każde wywołanie po prawdziwym imporcie
// czeka, aż skończy się ostatnie (prawdziwy import kończy się w czasie zależnym od obciążenia maszyny).
function importyRazem(o, liczba) {
  const c = o.win.VildaCrypto;
  const imp = c.importMasterKeyFromBytes;
  let gotowe = 0;
  let pusc;
  const brama = new Promise((r) => { pusc = r; });
  vi.spyOn(c, 'importMasterKeyFromBytes').mockImplementation(async function (...a) {
    const w = await imp.apply(this, a);
    gotowe += 1;
    if (gotowe === liczba) pusc();
    await brama;
    return w;
  });
}
const zerowe = (bajty) => bajty.map((b) => b.length > 0 && b.every((x) => x === 0));
async function wpisRejestru(o, uid, wpis) {
  await naAtrapie(o.idb, REJESTR, ['users'], 'readwrite', (tx) => { tx.objectStore('users').put({ ...wpis, userId: uid }); });
}
// Dwa okna zalogowane na X (konta jak w opcjach): A usuwa, B — druga karta.
async function dwieKarty(opcje = {}, opcjeB = {}) {
  const o = await nowe(opcje);
  const o2 = await drugie(o, { zaloguj: 'A', ...opcjeB });
  return { o, o2, X: o.A.userId };
}

describe('druga karta z tym samym kontem', () => {
  it('UK1: B zalogowana na X, A usuwa X — A kończy bez czekania (bez blocked); A user-removed, B user-removed-elsewhere i zablokowana; lista kont B bez X; zostaje baza konta Y', async () => {
    const { o, o2, X } = await dwieKarty({ konta: 'AB' });
    const lA = blokady(o);
    const lB = blokady(o2);
    expect(await doczekaj(usun(o), 'removeUser w karcie A')).toEqual({ ok: true, w: true });
    await o.cisza();
    await o2.cisza();
    expect(wpisyOd(o, 0, 'blocked', BAZA(X)), 'blocked kasowania bazy sejfu').toEqual([]);
    expect({ lA, lB, odblokowanaB: o2.v.isUnlocked() }).toEqual({ lA: ['user-removed'], lB: ['user-removed-elsewhere'], odblokowanaB: false });
    expect((await o2.v.listUsers()).map((x) => x.userId)).toEqual([o.B.userId]);
    expect(bazy(o)).toEqual([REJESTR, BAZA(o.B.userId)].sort());
    expect(o.idb.__atrapa.polaczenia(BAZA(X))).toBe(0);
  }, 30_000);

  it('UK1b: B — dwa równoczesne unlockUser(X) wstrzymane na odszyfrowaniu, A usuwa X — oba ACCOUNT_REMOVED (tekst), blokada user-removed dokładnie raz, bez odblokowania i sesji, tryb local', async () => {
    const o = await nowe({ konta: 'AB' });
    const X = o.A.userId;
    const o2 = await drugie(o, { zaloguj: null });
    const lB = blokady(o2);
    const odbl = odblokowania(o2);
    // Oba logowania ustawiają sesję w jednym zadaniu (warunek „blokada dokładnie raz”): obie bramy odszyfrowania
    // zwalniane razem, a import klucza obu logowań kończy się razem.
    importyRazem(o2, 2);
    const h1 = wstrzymajKrypto(o2, { metoda: 'decrypt' });
    const p1 = wynik(o2.v.unlockUser(X, o.A.haslo));
    await doczekaj(h1.osiagnieta, 'pierwsze odszyfrowanie w karcie B');
    const h2 = wstrzymajKrypto(o2, { metoda: 'decrypt' });
    const p2 = wynik(o2.v.unlockUser(X, o.A.haslo));
    await doczekaj(h2.osiagnieta, 'drugie odszyfrowanie w karcie B');
    const pA = usun(o);
    await czekajNa(() => jestZmiana(o, X), `versionchange ${BAZA('<X>')}`);
    h1.zwolnij();
    h2.zwolnij();
    expect(await doczekaj(pA, 'removeUser w karcie A')).toEqual({ ok: true, w: true });
    const w1 = await doczekaj(p1, 'pierwsze logowanie w karcie B');
    const w2 = await doczekaj(p2, 'drugie logowanie w karcie B');
    await o.cisza();
    await o2.cisza();
    const odmowa = { ok: false, kod: 'ACCOUNT_REMOVED', komunikat: TEKST_USUNIETE };
    expect({ w1: kod(w1), w2: kod(w2) }).toEqual({ w1: odmowa, w2: odmowa });
    expect({ lB, odbl, odblokowana: o2.v.isUnlocked(), tryb: o2.v.getCurrentStorageModeSync(), sesja: o2.win.sessionStorage.getItem(SESJA) })
      .toEqual({ lB: ['user-removed'], odbl: [], odblokowana: false, tryb: 'local', sesja: null });
  }, 30_000);

  it('UK1c: połączenie z bazą sejfu X bez obsługi versionchange (karta ze starszą wersją aplikacji) — removeUser czeka (blocked), po zamknięciu połączenia kończy; nikt nie dostaje user-removed-elsewhere', async () => {
    const o = await nowe();
    const X = o.A.userId;
    const lA = blokady(o);
    const obce = await new Promise((ok, zle) => { const q = o.idb.open(BAZA(X)); q.onsuccess = () => ok(q.result); q.onerror = () => zle(q.error); });
    let koniec = false;
    const pA = usun(o).finally(() => { koniec = true; });
    await czekajNa(() => wpisyOd(o, 0, 'blocked', BAZA(X)).length > 0, `blocked kasowania ${BAZA('<X>')}`);
    await o.spokoj();
    expect(koniec, 'removeUser przed zamknięciem połączenia').toBe(false);
    obce.close();
    expect(await doczekaj(pA, 'removeUser w karcie A po zamknięciu połączenia')).toEqual({ ok: true, w: true });
    await o.cisza();
    expect(lA).toEqual(['user-removed']);
    expect(bazy(o)).toEqual([REJESTR]);
  }, 30_000);

  it('UK2: B zalogowana wcześniej na X (połączenie z bazą X), potem blokada i zalogowanie na Y — po removeUser(X) w A B nadal odblokowana na Y, bez blokady; połączeń z bazą X brak; konto Y działa', async () => {
    const { o, o2, X } = await dwieKarty({ konta: 'AB' });
    await o2.przelacz('B');
    const lB = blokady(o2);
    expect(await doczekaj(usun(o), 'removeUser w karcie A')).toEqual({ ok: true, w: true });
    await o.cisza();
    await o2.cisza();
    expect({ odblokowana: o2.v.isUnlocked(), konto: o2.v.getCurrentUser().userId, lB }).toEqual({ odblokowana: true, konto: o.B.userId, lB: [] });
    expect(o.idb.__atrapa.polaczenia(BAZA(X))).toBe(0);
    expect(kod(await wynik(o2.v.listPatients()))).toEqual({ ok: true });
  }, 30_000);

  it('UK4: B zalogowana na X, A usuwa — w B potem: listPatients odmawia (sejf zablokowany), listPasskeys(X) → ACCOUNT_REMOVED (tekst); od versionchange żadnego otwarcia bazy X; zostaje tylko rejestr', async () => {
    const { o, o2, X } = await dwieKarty();
    expect(await doczekaj(usun(o), 'removeUser w karcie A')).toEqual({ ok: true, w: true });
    await o.cisza();
    await o2.cisza();
    const od = poZmianie(o, X);
    expect(kod(await wynik(o2.v.listPatients())).ok, 'listPatients w zablokowanej karcie B').toBe(false);
    expect(kod(await wynik(o2.v.listPasskeys(X)))).toEqual({ ok: false, kod: 'ACCOUNT_REMOVED', komunikat: TEKST_USUNIETE });
    // Log atrapy nie wskazuje okna: od versionchange A tylko usuwa wpis rejestru i blokuje sejf (bez otwarcia bazy X),
    // więc każde otwarcie bazy X w logu byłoby otwarciem w karcie B.
    expect(wpisyOd(o, od, 'open', BAZA(X)), 'otwarcia bazy X od versionchange').toEqual([]);
    expect(bazy(o)).toEqual([REJESTR]);
  }, 30_000);

  it('UK4b: B — savePatient w toku (wstrzymany odczyt sklepu patients bazy X), A usuwa — sprawdzenia sesji (P-SESJA-ZAPISU): zapis kończy się SESSION_CHANGED; od versionchange żadnej transakcji readwrite na bazie X; B zablokowana', async () => {
    const { o, o2, X } = await dwieKarty();
    const h = wstrzymaj(o2, { przy: 'success', baza: BAZA(X), sklep: 'patients' });
    const pB = wynik(o2.v.savePatient(naglowek(1), { dedup: false }));
    await doczekaj(h.czeka, 'odczyt sklepu patients w karcie B');
    const lB = blokady(o2);
    const pA = usun(o);
    await czekajNa(() => lB.length > 0, 'blokada karty B');
    h.zwolnij();
    const wB = await doczekaj(pB, 'savePatient w karcie B');
    expect(await doczekaj(pA, 'removeUser w karcie A')).toEqual({ ok: true, w: true });
    await o.cisza();
    await o2.cisza();
    expect(wB.kod).toBe('SESSION_CHANGED');
    const od = poZmianie(o, X);
    expect(log(o).slice(od).filter((w) => w[0] === 'tx' && w[1] === BAZA(X) && w[3] === 'readwrite' && w[4] === 'start'), 'transakcje readwrite bazy X od versionchange').toEqual([]);
    expect(bazy(o)).toEqual([REJESTR]);
    expect(o2.v.isUnlocked()).toBe(false);
  }, 30_000);

  it('UK5: B niezalogowana na ekranie logowania X (listPasskeys otworzył połączenie), A usuwa — B bez blokady; unlockUser(X) → ACCOUNT_REMOVED z tekstem (nie „Użytkownik nie istnieje.”); bazy konta brak', async () => {
    const o = await nowe();
    const X = o.A.userId;
    const o2 = await drugie(o, { zaloguj: null });
    await o2.v.listPasskeys(X);
    const lB = blokady(o2);
    expect(await doczekaj(usun(o), 'removeUser w karcie A')).toEqual({ ok: true, w: true });
    await o.cisza();
    await o2.cisza();
    expect(lB).toEqual([]);
    expect(kod(await wynik(o2.v.unlockUser(X, o.A.haslo)))).toEqual({ ok: false, kod: 'ACCOUNT_REMOVED', komunikat: TEKST_USUNIETE });
    expect(bazy(o)).toEqual([REJESTR]);
  }, 30_000);

  it('UK6: stan dokumentu przed powiadomieniem o blokadzie — w słuchaczu onLock karty B połączeń z bazą X już nie ma, a synchroniczne listPasskeys(X) odmawia ACCOUNT_REMOVED', async () => {
    const { o, o2, X } = await dwieKarty();
    const wSluchaczu = [];
    o2.v.onLock(() => { wSluchaczu.push({ polaczenia: o.idb.__atrapa.polaczenia(BAZA(X)), klucze: wynik(o2.v.listPasskeys(X)) }); });
    expect(await doczekaj(usun(o), 'removeUser w karcie A')).toEqual({ ok: true, w: true });
    await o.cisza();
    await o2.cisza();
    expect(wSluchaczu.map((x) => x.polaczenia), 'połączenia z bazą X w chwili powiadomienia').toEqual([0]);
    expect(kod(await wSluchaczu[0].klucze)).toEqual({ ok: false, kod: 'ACCOUNT_REMOVED', komunikat: TEKST_USUNIETE });
  }, 30_000);

  it('UK8: bramka dziennika zamknięta w obu kartach, A usuwa — w dzienniku karty B żadnego zapisu ani usunięcia vilda-sync-*, w logu atrapy żadnego otwarcia bazy kolejki', async () => {
    const { o, o2 } = await dwieKarty();
    const z = o2.dziennik.length;
    expect(await doczekaj(usun(o), 'removeUser w karcie A')).toEqual({ ok: true, w: true });
    await o.cisza();
    await o2.cisza();
    expect(o2.dziennik.slice(z).filter((x) => x.magazyn === 'localStorage' && String(x.klucz).startsWith('vilda-sync-')), 'zapisy vilda-sync-* karty B').toEqual([]);
    // Log atrapy nie wskazuje okna; przy zamkniętej bramce żadna z kart nie otwiera bazy kolejki.
    expect(wpisyOd(o, 0, 'open', /^vilda_sync_/)).toEqual([]);
  }, 30_000);

  it('UK13: tryb „Komputer w pracy” (konto X w trybie cloud-only), B zalogowana — po usunięciu B zablokowana user-removed-elsewhere, bez znacznika sesji trybu chmurowego', async () => {
    const { o, o2 } = await dwieKarty({ chmura: ['A'] });
    const lB = blokady(o2);
    expect(await doczekaj(usun(o), 'removeUser w karcie A')).toEqual({ ok: true, w: true });
    await o.cisza();
    await o2.cisza();
    expect({ lB, odblokowana: o2.v.isUnlocked(), znacznik: o2.win.sessionStorage.getItem(SESJA_CHMURY) })
      .toEqual({ lB: ['user-removed-elsewhere'], odblokowana: false, znacznik: null });
  }, 30_000);
});

describe('karta usuwająca', () => {
  it('UK3 (1): isRemovingCurrentUser — przed false, w trakcie kasowania bazy sejfu konta true, po końcu false; blokada tylko user-removed', async () => {
    const o = await nowe();
    const lA = blokady(o);
    const przed = o.v.isRemovingCurrentUser();
    const h = wstrzymaj(o, { przy: 'deleteDatabase', baza: BAZA(o.A.userId) });
    const p = usun(o);
    await doczekaj(h.czeka, 'kasowanie bazy sejfu konta');
    const wTrakcie = o.v.isRemovingCurrentUser();
    h.zwolnij();
    expect(await doczekaj(p, 'removeUser')).toEqual({ ok: true, w: true });
    expect({ przed, wTrakcie, po: o.v.isRemovingCurrentUser(), lA }).toEqual({ przed: false, wTrakcie: true, po: false, lA: ['user-removed'] });
  }, 30_000);

  it('UK3 (2): połączenie z bazą Y z mapy sprzed trybu „Zaloguj jednorazowo” w tym samym oknie — removeUser(Y) kończy bez czekania (bez blocked), blokada tylko user-removed', async () => {
    const o = await nowe({ konta: 'AB' });
    const Y = o.B.userId;
    await o.zaloguj('B');
    o.zablokuj();
    o.v.setEphemeralMode(true);
    await o.v.createUser('Fikcyjne#Jednorazowe!2026jj', { label: 'Fikcyjne konto jednorazowe', iterations: 1000 });
    await o.tlo();
    o.zablokuj();
    expect(o.v.isEphemeralMode(), 'tryb jednorazowy po blokadzie').toBe(false);
    await o.zaloguj('B');
    const lA = blokady(o);
    expect(await doczekaj(usun(o, 'B'), 'removeUser(Y) w tym samym oknie')).toEqual({ ok: true, w: true });
    expect(lA).toEqual(['user-removed']);
    expect(wpisyOd(o, 0, 'blocked', BAZA(Y))).toEqual([]);
  }, 30_000);

  it('UK3 (3): (a) zapis metadanych rozpoczęty przed removeUser (addWaitlistList, odczyt wstrzymany) → ACCOUNT_REMOVED, bazy konta brak; (b) listPasskeys(X) w trakcie własnego kasowania → brak metadanych ([]), bez user-removed-elsewhere', async () => {
    const o = await nowe();
    const X = o.A.userId;
    const lA = blokady(o);
    const u = wstrzymajDrugi(o, { baza: BAZA(X), sklep: 'meta', metoda: 'get' });
    const pL = wynik(o.v.addWaitlistList('Fikcyjna procedura'));
    await czekajNa(() => u.h && u.h.osiagniety, 'odczyt metadanych w zapisie listy');
    const z = log(o).length;
    const pA = usun(o);
    await czekajNa(() => wpisyOd(o, z, 'deleteDatabase', BAZA(X)).length > 0, `kasowanie ${BAZA('<X>')}`);
    u.h.zwolnij();
    const wA = await doczekaj(pA, 'removeUser (a)');
    const wL = await doczekaj(pL, 'addWaitlistList (a)');
    await o.cisza();
    expect(bazy(o), '(a) bazy po').toEqual([REJESTR]);
    expect({ wA, wL: kod(wL), lA }).toEqual({ wA: { ok: true, w: true }, wL: { ok: false, kod: 'ACCOUNT_REMOVED', komunikat: TEKST_USUNIETE }, lA: ['user-removed'] });

    const o3 = await nowe();
    const X3 = o3.A.userId;
    const l3 = blokady(o3);
    const h = wstrzymaj(o3, { przy: 'deleteDatabase', baza: BAZA(X3) });
    const p3 = usun(o3);
    await doczekaj(h.czeka, 'kasowanie bazy sejfu konta (b)');
    const pk = wynik(o3.v.listPasskeys(X3));
    await o3.spokoj();
    // Sesja X trwa, aż listPasskeys się rozstrzygnie: usunięcie wpisu rejestru (przed blokadą) wstrzymane.
    const hr = wstrzymaj(o3, { przy: 'success', baza: REJESTR, sklep: 'users', metoda: 'delete' });
    h.zwolnij();
    const wk = await doczekaj(pk, 'listPasskeys (b)');
    const lWChwili = l3.slice();
    hr.zwolnij();
    expect(await doczekaj(p3, 'removeUser (b)')).toEqual({ ok: true, w: true });
    await o3.cisza();
    expect({ wk, lWChwili, l3, bazy: bazy(o3) }).toEqual({ wk: { ok: true, w: [] }, lWChwili: [], l3: ['user-removed'], bazy: [REJESTR] });
  }, 30_000);

  it('UK9b: konta X i Y, removeUser(X) wstrzymany na kasowaniu bazy sejfu — w trakcie listUsers() = [X, Y], getStatus().userCount = 2 (lista pomija tylko konta usunięte w innym dokumencie)', async () => {
    const o = await nowe({ konta: 'AB' });
    const h = wstrzymaj(o, { przy: 'deleteDatabase', baza: BAZA(o.A.userId) });
    const p = usun(o);
    await doczekaj(h.czeka, 'kasowanie bazy sejfu konta');
    const lista = (await o.v.listUsers()).map((x) => x.userId).sort();
    const stan = await o.v.getStatus();
    h.zwolnij();
    expect(await doczekaj(p, 'removeUser')).toEqual({ ok: true, w: true });
    expect({ lista, ile: stan.userCount }).toEqual({ lista: [o.A.userId, o.B.userId].sort(), ile: 2 });
  }, 30_000);

  it('UK10: isRemovingCurrentUser — (a) usuwanie bieżącego: false/true/false; (b) usuwanie niebieżącego Y przy odblokowanym X: false; (c) błąd kasowania bazy sejfu: removeUser odrzucone, false, sejf odblokowany, ponowne removeUser kończy', async () => {
    const o = await nowe({ konta: 'AB' });
    const X = o.A.userId;
    const przed = o.v.isRemovingCurrentUser();
    const hY = wstrzymaj(o, { przy: 'deleteDatabase', baza: BAZA(o.B.userId) });
    const pY = usun(o, 'B');
    await doczekaj(hY.czeka, 'kasowanie bazy sejfu konta Y');
    const wTrakcieY = o.v.isRemovingCurrentUser();
    hY.zwolnij();
    expect(await doczekaj(pY, 'removeUser(Y)')).toEqual({ ok: true, w: true });
    expect({ przed, wTrakcieY, odblokowany: o.v.isUnlocked() }).toEqual({ przed: false, wTrakcieY: false, odblokowany: true });

    o.idb.__atrapa.usterka({ przy: 'deleteDatabase', baza: BAZA(X), blad: 'UnknownError' });
    const wBlad = await doczekaj(usun(o), 'removeUser z błędem kasowania');
    expect({ ok: wBlad.ok, usuwa: o.v.isRemovingCurrentUser(), odblokowany: o.v.isUnlocked() }).toEqual({ ok: false, usuwa: false, odblokowany: true });

    const h = wstrzymaj(o, { przy: 'deleteDatabase', baza: BAZA(X) });
    const p = usun(o);
    await doczekaj(h.czeka, 'kasowanie bazy sejfu konta X');
    const wTrakcie = o.v.isRemovingCurrentUser();
    h.zwolnij();
    expect(await doczekaj(p, 'ponowne removeUser(X)')).toEqual({ ok: true, w: true });
    expect({ wTrakcie, po: o.v.isRemovingCurrentUser() }).toEqual({ wTrakcie: true, po: false });
  }, 30_000);

  it('UK10b: bez Web Locks — drugie removeUser(X) w trakcie pierwszego (kasowanie wstrzymane) odrzucone od razu CARE_TEMPLATE_LIFECYCLE_BUSY; isRemovingCurrentUser zostaje true; pierwsze kończy', async () => {
    const o = await nowe({ locks: false });
    const h = wstrzymaj(o, { przy: 'deleteDatabase', baza: BAZA(o.A.userId) });
    const p1 = usun(o);
    await doczekaj(h.czeka, 'kasowanie bazy sejfu konta');
    const przed = o.v.isRemovingCurrentUser();
    const w2 = await doczekaj(usun(o), 'drugie removeUser');
    const po = o.v.isRemovingCurrentUser();
    h.zwolnij();
    expect(await doczekaj(p1, 'pierwsze removeUser')).toEqual({ ok: true, w: true });
    expect({ przed, w2: w2.kod, po }).toEqual({ przed: true, w2: 'CARE_TEMPLATE_LIFECYCLE_BUSY', po: true });
  }, 30_000);

  it('UK10c: deleteDatabase bazy sejfu rzuca synchronicznie — removeUser odrzucone tym wyjątkiem, isRemovingCurrentUser false, sejf odblokowany', async () => {
    const o = await nowe();
    const oryginal = o.idb.deleteDatabase;
    vi.spyOn(o.idb, 'deleteDatabase').mockImplementation(function (nazwa) {
      if (String(nazwa).startsWith('vilda_user_')) throw new DOMException('Fikcyjny błąd kasowania bazy.', 'UnknownError');
      return oryginal.call(this, nazwa);
    });
    const w = await doczekaj(usun(o), 'removeUser');
    expect({ ok: w.ok, komunikat: w.komunikat }).toEqual({ ok: false, komunikat: 'Fikcyjny błąd kasowania bazy.' });
    expect({ usuwa: o.v.isRemovingCurrentUser(), odblokowany: o.v.isUnlocked() }).toEqual({ usuwa: false, odblokowany: true });
  }, 30_000);
});

describe('logowanie i odtworzenie sesji w toku', () => {
  it('UK14: B — unlockUser(X) wstrzymany na odszyfrowaniu, A usuwa X — ACCOUNT_REMOVED (tekst), B zablokowana user-removed raz, bez odblokowania i sesji, bajty klucza wyzerowane, bazy konta brak', async () => {
    const o = await nowe();
    const X = o.A.userId;
    const o2 = await drugie(o, { zaloguj: null });
    const lB = blokady(o2);
    const odbl = odblokowania(o2);
    const bajty = szpiegBajtow(o2);
    const h = wstrzymajKrypto(o2, { metoda: 'decrypt' });
    const pB = wynik(o2.v.unlockUser(X, o.A.haslo));
    await doczekaj(h.osiagnieta, 'odszyfrowanie w karcie B');
    const pA = usun(o);
    await czekajNa(() => jestZmiana(o, X), `versionchange ${BAZA('<X>')}`);
    h.zwolnij();
    const wB = await doczekaj(pB, 'logowanie w karcie B');
    expect(await doczekaj(pA, 'removeUser w karcie A')).toEqual({ ok: true, w: true });
    await o.cisza();
    await o2.cisza();
    expect(kod(wB)).toEqual({ ok: false, kod: 'ACCOUNT_REMOVED', komunikat: TEKST_USUNIETE });
    expect({ odblokowana: o2.v.isUnlocked(), lB, odbl, sesja: o2.win.sessionStorage.getItem(SESJA), zerowe: zerowe(bajty), bazy: bazy(o) })
      .toEqual({ odblokowana: false, lB: ['user-removed'], odbl: [], sesja: null, zerowe: [true], bazy: [REJESTR] });
  }, 30_000);

  it('UK14b: „Komputer w pracy” z trwałą pamięcią chmury — logowanie wstrzymane na otwarciu bazy pamięci chmury (sesja już ustawiona), A usuwa X — odmowa (tekst), blokada user-removed-elsewhere raz, bez odblokowania, tryb local', async () => {
    const o = await nowe({ chmura: ['A'] });
    const X = o.A.userId;
    const o2 = await drugie(o, { zaloguj: null });
    o2.win.VILDA_PERSISTENT_CLOUD_CACHE = true;
    const lB = blokady(o2);
    const odbl = odblokowania(o2);
    const h = wstrzymaj(o2, { przy: 'open', baza: 'vilda-cloud-cache' });
    const pB = wynik(o2.v.unlockUser(X, o.A.haslo));
    await doczekaj(h.czeka, 'otwarcie bazy pamięci chmury w karcie B');
    // Limit oczekiwania na pamięć chmury (2,5 s zegara okna) zdjęty: logowanie stoi na otwarciu do zwolnienia.
    const zegar = await doczekaj(o2.timery.czekajNa((t) => t.ms === 2500), 'zegar 2500 ms w karcie B');
    o2.win.clearTimeout(zegar.id);
    const pA = usun(o);
    await czekajNa(() => lB.length > 0, 'blokada karty B');
    h.zwolnij();
    const wB = await doczekaj(pB, 'logowanie w karcie B');
    expect(await doczekaj(pA, 'removeUser w karcie A')).toEqual({ ok: true, w: true });
    await o.cisza();
    await o2.cisza();
    expect(kod(wB)).toEqual({ ok: false, kod: 'ACCOUNT_REMOVED', komunikat: TEKST_USUNIETE });
    expect({ lB, odbl, odblokowana: o2.v.isUnlocked(), tryb: o2.v.getCurrentStorageModeSync(), hybryda: o2.v.isCloudOnlyAdapterActive() })
      .toEqual({ lB: ['user-removed-elsewhere'], odbl: [], odblokowana: false, tryb: 'local', hybryda: false });
  }, 30_000);

  it('UK14c: B — logowanie kluczem odzyskiwania wstrzymane na odszyfrowaniu, A usuwa konto — ACCOUNT_REMOVED (tekst), blokada user-removed raz, bez odblokowania i sesji, bajty klucza wyzerowane', async () => {
    const o = await nowe({ konta: 'A', zaloguj: null });
    const HASLO = 'Fikcyjne#KluczOdzyskiwania!2026ko';
    const k = await o.v.createUser(HASLO, { label: 'Fikcyjna Lekarka K', iterations: 1000 });
    await o.tlo();
    const o2 = await drugie(o, { zaloguj: null });
    const lB = blokady(o2);
    const odbl = odblokowania(o2);
    const bajty = szpiegBajtow(o2);
    const h = wstrzymajKrypto(o2, { metoda: 'decrypt' });
    const pB = wynik(o2.v.unlockUserWithRecoveryKey(k.userId, k.recoveryKey));
    await doczekaj(h.osiagnieta, 'odszyfrowanie w karcie B');
    const pA = wynik(o.v.removeUser(k.userId, HASLO));
    await czekajNa(() => jestZmiana(o, k.userId), `versionchange ${BAZA('<K>')}`);
    h.zwolnij();
    const wB = await doczekaj(pB, 'logowanie kluczem odzyskiwania w karcie B');
    expect(await doczekaj(pA, 'removeUser w karcie A')).toEqual({ ok: true, w: true });
    await o.cisza();
    await o2.cisza();
    expect(kod(wB)).toEqual({ ok: false, kod: 'ACCOUNT_REMOVED', komunikat: TEKST_USUNIETE });
    expect({ odblokowana: o2.v.isUnlocked(), lB, odbl, sesja: o2.win.sessionStorage.getItem(SESJA), zerowe: zerowe(bajty) })
      .toEqual({ odblokowana: false, lB: ['user-removed'], odbl: [], sesja: null, zerowe: [true] });
  }, 30_000);

  it('UK14e: okno C z sesją karty B (odtworzenie po przeładowaniu), tryRestoreSession wstrzymane na imporcie klucza, A usuwa X — false, bajty wyzerowane, blokada user-removed-elsewhere raz, bez sesji, bazy konta brak', async () => {
    const { o, o2, X } = await dwieKarty();
    const o3 = await drugie(o, { zaloguj: null, sesja: o2.win.sessionStorage });
    const bajty = szpiegBajtow(o3);
    const lC = blokady(o3);
    const odbl = odblokowania(o3);
    const h = wstrzymajKrypto(o3, { metoda: 'importKey' });
    const pC = wynik(o3.v.tryRestoreSession());
    await doczekaj(h.osiagnieta, 'import klucza w oknie C');
    const pA = usun(o);
    await czekajNa(() => jestZmiana(o, X), `versionchange ${BAZA('<X>')}`);
    h.zwolnij();
    const wC = await doczekaj(pC, 'odtworzenie sesji w oknie C');
    expect(await doczekaj(pA, 'removeUser w karcie A')).toEqual({ ok: true, w: true });
    await o.cisza();
    await o3.cisza();
    expect({ wC, zerowe: zerowe(bajty), lC, odbl, odblokowane: o3.v.isUnlocked(), sesja: o3.win.sessionStorage.getItem(SESJA), bazy: bazy(o) })
      .toEqual({ wC: { ok: true, w: false }, zerowe: [true], lC: ['user-removed-elsewhere'], odbl: [], odblokowane: false, sesja: null, bazy: [REJESTR] });
  }, 30_000);

  it('UK14f: jak UK14e, ale odtworzenie wstrzymane na odczycie metadanych po ustawieniu sesji — false, blokada user-removed-elsewhere raz, bez odblokowania', async () => {
    const { o, o2, X } = await dwieKarty();
    const o3 = await drugie(o, { zaloguj: null, sesja: o2.win.sessionStorage });
    const lC = blokady(o3);
    const odbl = odblokowania(o3);
    const h1 = wstrzymajKrypto(o3, { metoda: 'importKey' });
    const pC = wynik(o3.v.tryRestoreSession());
    await doczekaj(h1.osiagnieta, 'import klucza w oknie C');
    const h2 = wstrzymaj(o3, { przy: 'success', baza: BAZA(X), sklep: 'meta', metoda: 'get' });
    h1.zwolnij();
    await doczekaj(h2.czeka, 'odczyt metadanych w oknie C');
    const pA = usun(o);
    await czekajNa(() => lC.length > 0, 'blokada okna C');
    h2.zwolnij();
    const wC = await doczekaj(pC, 'odtworzenie sesji w oknie C');
    expect(await doczekaj(pA, 'removeUser w karcie A')).toEqual({ ok: true, w: true });
    await o.cisza();
    await o3.cisza();
    expect({ wC, lC, odbl, odblokowane: o3.v.isUnlocked() }).toEqual({ wC: { ok: true, w: false }, lC: ['user-removed-elsewhere'], odbl: [], odblokowane: false });
  }, 30_000);

  it('UK14g: „Komputer w pracy” — usunięcie w trakcie odczytu trybu konta z rejestru (sesja już ustawiona) — ACCOUNT_REMOVED, blokada user-removed-elsewhere raz; na końcu tryb local, bez adaptera chmurowego i bez znacznika sesji trybu chmurowego', async () => {
    const o = await nowe({ chmura: ['A'] });
    const X = o.A.userId;
    const o2 = await drugie(o, { zaloguj: null });
    const lB = blokady(o2);
    const u = wstrzymajDrugi(o2, { baza: REJESTR, sklep: 'users', metoda: 'get' });
    const pB = wynik(o2.v.unlockUser(X, o.A.haslo));
    await czekajNa(() => u.h && u.h.osiagniety, 'odczyt trybu konta w karcie B');
    const pA = usun(o);
    await czekajNa(() => lB.length > 0, 'blokada karty B');
    u.h.zwolnij();
    const wB = await doczekaj(pB, 'logowanie w karcie B');
    expect(await doczekaj(pA, 'removeUser w karcie A')).toEqual({ ok: true, w: true });
    await o.cisza();
    await o2.cisza();
    expect(kod(wB)).toEqual({ ok: false, kod: 'ACCOUNT_REMOVED', komunikat: TEKST_USUNIETE });
    expect({ lB, odblokowana: o2.v.isUnlocked(), tryb: o2.v.getCurrentStorageModeSync(), hybryda: o2.v.isCloudOnlyAdapterActive(), znacznik: o2.win.sessionStorage.getItem(SESJA_CHMURY) })
      .toEqual({ lB: ['user-removed-elsewhere'], odblokowana: false, tryb: 'local', hybryda: false, znacznik: null });
  }, 30_000);
});

describe('nowsza wersja bazy sejfu w innej karcie', () => {
  it('UK7: otwarcie bazy X w wersji 6 z innego dokumentu — bez blocked; karta bez blokady; listPatients → APP_UPDATED (tekst); nowe okno: unlockUser(X) → APP_UPDATED', async () => {
    const o = await nowe();
    const X = o.A.userId;
    const lA = blokady(o);
    expect(await doczekaj(otworzWersje(o.idb, BAZA(X), 6), 'otwarcie bazy X w wersji 6')).toBe('ok');
    await o.cisza();
    expect(lA).toEqual([]);
    expect(kod(await wynik(o.v.listPatients()))).toEqual({ ok: false, kod: 'APP_UPDATED', komunikat: TEKST_WERSJA });
    const o3 = await drugie(o, { zaloguj: null });
    expect(kod(await wynik(o3.v.unlockUser(X, o.A.haslo)))).toEqual({ ok: false, kod: 'APP_UPDATED', komunikat: TEKST_WERSJA });
  }, 30_000);

  it('UK7b: otwarcie bazy Y w toku (listPasskeys(Y) wstrzymane na open), w tym czasie baza X w wersji 6 — po zwolnieniu APP_UPDATED; drugie listPasskeys(Y) → APP_UPDATED bez nowego otwarcia', async () => {
    const { o, o2, X } = await dwieKarty({ konta: 'AB' });
    const Y = o.B.userId;
    const h = wstrzymaj(o2, { przy: 'open', baza: BAZA(Y) });
    const pk = wynik(o2.v.listPasskeys(Y));
    await doczekaj(h.czeka, 'otwarcie bazy Y w karcie B');
    expect(await doczekaj(otworzWersje(o.idb, BAZA(X), 6), 'otwarcie bazy X w wersji 6')).toBe('ok');
    h.zwolnij();
    expect(kod(await doczekaj(pk, 'listPasskeys(Y)'))).toEqual({ ok: false, kod: 'APP_UPDATED', komunikat: TEKST_WERSJA });
    const z = log(o).length;
    expect(kod(await wynik(o2.v.listPasskeys(Y)))).toEqual({ ok: false, kod: 'APP_UPDATED', komunikat: TEKST_WERSJA });
    expect(wpisyOd(o, z, 'open', BAZA(Y))).toEqual([]);
  }, 30_000);

  it('UK7c: B — unlockUser(X) wstrzymany na odszyfrowaniu, baza X w wersji 6 — logowanie kończy się sesją (bez blokady), listPatients → APP_UPDATED', async () => {
    const o = await nowe();
    const X = o.A.userId;
    const o2 = await drugie(o, { zaloguj: null });
    const lB = blokady(o2);
    const h = wstrzymajKrypto(o2, { metoda: 'decrypt' });
    const pB = wynik(o2.v.unlockUser(X, o.A.haslo));
    await doczekaj(h.osiagnieta, 'odszyfrowanie w karcie B');
    const pW = otworzWersje(o.idb, BAZA(X), 6);
    expect(await doczekaj(pW, 'otwarcie bazy X w wersji 6')).toBe('ok');
    h.zwolnij();
    expect(kod(await doczekaj(pB, 'logowanie w karcie B'))).toEqual({ ok: true });
    await o2.tlo();
    expect({ odblokowana: o2.v.isUnlocked(), lB }).toEqual({ odblokowana: true, lB: [] });
    expect(kod(await wynik(o2.v.listPatients()))).toEqual({ ok: false, kod: 'APP_UPDATED', komunikat: TEKST_WERSJA });
  }, 30_000);
});

describe('lista kont w obsłudze blokady', () => {
  it('UK9: konta X i Y, B zalogowana na X — getStatus() w słuchaczu onLock karty B: jedno konto, stan locked', async () => {
    const { o, o2 } = await dwieKarty({ konta: 'AB' });
    const stany = [];
    o2.v.onLock(() => { stany.push(o2.v.getStatus()); });
    expect(await doczekaj(usun(o), 'removeUser w karcie A')).toEqual({ ok: true, w: true });
    await o2.cisza();
    expect(stany.length, 'wywołania słuchacza').toBe(1);
    const s = await stany[0];
    expect({ userCount: s.userCount, state: s.state }).toEqual({ userCount: 1, state: 'locked' });
  }, 30_000);

  it('UK9c: konta X i Y — listUsers() w słuchaczu onLock karty B (jak ekran logowania): tylko Y', async () => {
    const { o, o2 } = await dwieKarty({ konta: 'AB' });
    const listy = [];
    o2.v.onLock(() => { listy.push(o2.v.listUsers()); });
    expect(await doczekaj(usun(o), 'removeUser w karcie A')).toEqual({ ok: true, w: true });
    await o2.cisza();
    expect(listy.length, 'wywołania słuchacza').toBe(1);
    expect((await listy[0]).map((x) => x.userId)).toEqual([o.B.userId]);
  }, 30_000);
});

describe('wymuszone zamknięcie połączenia przez przeglądarkę', () => {
  it('UK11 (1): zalogowane okno; w jednym zadaniu wymuszone zamknięcie i kasowanie bazy X bez versionchange (narzędzia przeglądarki) — blokada user-removed-elsewhere, bazy konta brak', async () => {
    const o = await nowe();
    const X = o.A.userId;
    const lA = blokady(o);
    const kasowanie = new Promise((ok) => {
      o.idb.__atrapa.wymusZamkniecie(BAZA(X));
      const q = o.idb.deleteDatabase(BAZA(X));
      q.onsuccess = () => ok('ok');
      q.onerror = () => ok('blad');
    });
    expect(await doczekaj(kasowanie, 'kasowanie bazy X')).toBe('ok');
    await o.cisza();
    expect({ lA, odblokowany: o.v.isUnlocked() }).toEqual({ lA: ['user-removed-elsewhere'], odblokowany: false });
    expect(bazy(o)).toEqual([REJESTR]);
  }, 30_000);

  it('UK11 (2): wymuszone zamknięcie przy istniejącej bazie — bez blokady; listPatients działa (nowe otwarcie bazy X)', async () => {
    const o = await nowe();
    const X = o.A.userId;
    const lA = blokady(o);
    o.idb.__atrapa.wymusZamkniecie(BAZA(X));
    await o.cisza();
    const z = log(o).length;
    const w = await wynik(o.v.listPatients());
    expect(kod(w)).toEqual({ ok: true });
    expect(lA).toEqual([]);
    expect(wpisyOd(o, z, 'open', BAZA(X)).length, 'nowe otwarcie bazy X').toBe(1);
  }, 30_000);

  it('UK11 (3): B zalogowana na X bez połączenia z bazą (po wymuszonym zamknięciu, baza jest), A (otwarta potem) usuwa X — B: listPatients → ACCOUNT_REMOVED, blokada user-removed-elsewhere', async () => {
    const { o, o2, X } = await dwieKarty();
    o.idb.__atrapa.wymusZamkniecie(BAZA(X));
    await o.cisza();
    await o2.cisza();
    expect(o.idb.__atrapa.polaczenia(BAZA(X)), 'połączenia z bazą X po wymuszonym zamknięciu').toBe(0);
    // Karta A otwarta po wymuszonym zamknięciu (własne połączenie z bazą X).
    const oA = await drugie(o, { zaloguj: 'A' });
    const lB = blokady(o2);
    expect(await doczekaj(usun(oA), 'removeUser w karcie A')).toEqual({ ok: true, w: true });
    await oA.cisza();
    await o2.cisza();
    const w = await wynik(o2.v.listPatients());
    await o2.cisza();
    expect({ lB, odblokowana: o2.v.isUnlocked() }).toEqual({ lB: ['user-removed-elsewhere'], odblokowana: false });
    expect(kod(w)).toEqual({ ok: false, kod: 'ACCOUNT_REMOVED', komunikat: TEKST_USUNIETE });
  }, 30_000);
});

describe('tryb „Zaloguj jednorazowo” i removeUser w obu kartach', () => {
  it('UK12: B w trybie „Zaloguj jednorazowo” (inne konto w pamięci), A usuwa X — removeUser kończy, B odblokowana, bez blokady', async () => {
    const o = await nowe();
    const o2 = await drugie(o, { zaloguj: null });
    o2.v.setEphemeralMode(true);
    await o2.v.createUser('Fikcyjne#Jednorazowe!2026jj', { label: 'Fikcyjne konto jednorazowe', iterations: 1000 });
    await o2.tlo();
    const lB = blokady(o2);
    expect(await doczekaj(usun(o), 'removeUser w karcie A')).toEqual({ ok: true, w: true });
    await o2.cisza();
    expect({ odblokowana: o2.v.isUnlocked(), lB }).toEqual({ odblokowana: true, lB: [] });
  }, 30_000);

  it('UK12c (a): bez Web Locks, obie karty zalogowane na X; removeUser(X) w B wstrzymany na skrócie hasła, A usuwa — A kończy, B: PATIENT_CHECKPOINT_SESSION_CHANGED i blokada user-removed-elsewhere; bazy konta brak', async () => {
    const { o, o2, X } = await dwieKarty({ locks: false });
    const lB = blokady(o2);
    const h = wstrzymajKrypto(o2, { metoda: 'digest' });
    const pB = wynik(o2.v.removeUser(X, o.A.haslo));
    await doczekaj(h.osiagnieta, 'skrót w removeUser karty B');
    const pA = usun(o);
    await czekajNa(() => lB.length > 0, 'blokada karty B');
    h.zwolnij();
    expect(await doczekaj(pA, 'removeUser w karcie A')).toEqual({ ok: true, w: true });
    const wB = await doczekaj(pB, 'removeUser w karcie B');
    await o.cisza();
    await o2.cisza();
    expect({ wB: wB.kod, lB, bazy: bazy(o) }).toEqual({ wB: 'PATIENT_CHECKPOINT_SESSION_CHANGED', lB: ['user-removed-elsewhere'], bazy: [REJESTR] });
  }, 30_000);

  it('UK12c (b): bez Web Locks, B niezalogowana (listPasskeys otworzył połączenie), removeUser(X) z hasłem w B wstrzymany na skrócie hasła, A usuwa — A kończy, B: ACCOUNT_REMOVED (tekst), bez blokady; bazy konta brak', async () => {
    const o = await nowe({ locks: false });
    const X = o.A.userId;
    const o2 = await drugie(o, { zaloguj: null });
    await o2.v.listPasskeys(X);
    const lB = blokady(o2);
    const h = wstrzymajKrypto(o2, { metoda: 'digest' });
    const pB = wynik(o2.v.removeUser(X, o.A.haslo));
    await doczekaj(h.osiagnieta, 'skrót w removeUser karty B');
    const pA = usun(o);
    // Karta A zamyka własne połączenie przed kasowaniem; zostaje połączenie karty B (z listPasskeys), które zamyka sejf B.
    await czekajNa(() => jestZmiana(o, X) && o.idb.__atrapa.polaczenia(BAZA(X)) === 0, `zamknięcie połączenia z ${BAZA('<X>')} w karcie B`);
    h.zwolnij();
    expect(await doczekaj(pA, 'removeUser w karcie A')).toEqual({ ok: true, w: true });
    const wB = await doczekaj(pB, 'removeUser w karcie B');
    await o.cisza();
    await o2.cisza();
    expect({ wB: kod(wB), lB, bazy: bazy(o) }).toEqual({ wB: { ok: false, kod: 'ACCOUNT_REMOVED', komunikat: TEKST_USUNIETE }, lB: [], bazy: [REJESTR] });
  }, 30_000);
});

describe('konto bez metadanych (jak gałąź KT K2) i założenie konta', () => {
  async function bezMetadanych() {
    const o = await nowe({ zaloguj: null });
    await wpisRejestru(o, BEZ_KONTA, { label: 'Fikcyjne konto bez metadanych', createdAtISO: '2026-03-02T08:00:00.000Z', storageMode: 'local', passkeyCount: 0 });
    return o;
  }
  it('UK15 (1): unlockUser → „Użytkownik nie istnieje.”; bazy sejfu tego konta brak', async () => {
    const o = await bezMetadanych();
    const w = await wynik(o.v.unlockUser(BEZ_KONTA, 'Fikcyjne#Dowolne!2026xx'));
    await o.cisza();
    expect(bazy(o), 'bazy po odczycie').toEqual([REJESTR, BAZA(o.A.userId)].sort());
    expect(w.komunikat).toBe('Użytkownik nie istnieje.');
  }, 30_000);

  it('UK15 (2): listPasskeys → []; bazy sejfu tego konta brak', async () => {
    const o = await bezMetadanych();
    const w = await wynik(o.v.listPasskeys(BEZ_KONTA));
    await o.cisza();
    expect(bazy(o), 'bazy po odczycie').toEqual([REJESTR, BAZA(o.A.userId)].sort());
    expect(w).toEqual({ ok: true, w: [] });
  }, 30_000);

  it('UK15 (3): tryRestoreSession z sesją tego konta → false; bazy sejfu tego konta brak', async () => {
    const o = await bezMetadanych();
    o.win.sessionStorage.setItem(SESJA, JSON.stringify({ v: 2, userId: BEZ_KONTA, keyB64: Buffer.alloc(32, 7).toString('base64'), label: 'Fikcyjne konto bez metadanych' }));
    const w = await wynik(o.v.tryRestoreSession());
    await o.cisza();
    expect(bazy(o), 'bazy po odczycie').toEqual([REJESTR, BAZA(o.A.userId)].sort());
    expect(w).toEqual({ ok: true, w: false });
  }, 30_000);

  it('UK15 (4): createUser zakłada bazę sejfu konta i loguje', async () => {
    const o = await nowe({ zaloguj: null });
    const u = await o.v.createUser('Fikcyjne#Nowe!Konto2026nk', { label: 'Fikcyjne nowe konto', iterations: 1000 });
    await o.tlo();
    expect(bazy(o)).toEqual([REJESTR, BAZA(o.A.userId), BAZA(u.userId)].sort());
    expect({ odblokowany: o.v.isUnlocked(), konto: o.v.getCurrentUser().userId }).toEqual({ odblokowany: true, konto: u.userId });
  }, 30_000);
});

describe('ekran startowy (vilda_auth_ui.js) — baner tylko z napisu', () => {
  // Wycinek pliku od ekranu startowego (me) do formularza zakładania konta (mn): „Witamy” i „Kto się loguje?”
  // z atrapami DOM; reszta modułu (logowanie, przyciski) niewołana.
  function ekranStartowy(konta) {
    const src = zrodlo('vilda_auth_ui.js');
    const od = src.indexOf('async function me(');
    const doMn = src.indexOf('function mn(', od);
    if (od < 0 || doMn < 0) throw new Error('vilda_auth_ui.js: brak ekranu startowego');
    class Element {
      constructor(tag) { this.tag = tag; this.className = ''; this.textContent = ''; this.innerHTML = ''; this.atrybuty = {}; this.dzieci = []; this.style = {}; }
      appendChild(d) { this.dzieci.push(d); return d; }
      addEventListener() {}
      setAttribute(k, w) { this.atrybuty[k] = String(w); }
    }
    const e = (tag, a, n) => {
      const r = new Element(tag);
      for (const k of Object.keys(a || {})) {
        if (k === 'class') r.className = a[k];
        else if (k === 'text') r.textContent = a[k];
        else if (k === 'html') r.innerHTML = a[k];
        else if (!(k.indexOf('on') === 0 && typeof a[k] === 'function')) r.setAttribute(k, a[k]);
      }
      for (const d of n == null ? [] : Array.isArray(n) ? n : [n]) {
        if (d != null) r.appendChild(typeof d === 'string' ? Object.assign(new Element('#text'), { textContent: d }) : d);
      }
      return r;
    };
    const ekrany = [];
    const nic = () => {};
    const sejf = { listUsers: async () => konta };
    const me = new Function('e', 'Zt', 'jt', 'Ji', 'pn', 'ma', 'qa', 'fn', 'Ot', 'No', 'Jn', 'mn', 'Re', 'Aa', '$t', 'na', 'Ze', 'qn',
      `${src.slice(od, doMn)}\nreturn me;`)(e, (x) => ekrany.push(x), () => sejf, nic, nic, nic, nic, nic, nic, nic, nic, nic, nic, nic, nic, () => '', () => '', nic);
    const wszystkie = (x) => [x, ...x.dzieci.flatMap(wszystkie)];
    return {
      me,
      ekrany: () => ekrany.map((x) => {
        const el = wszystkie(x);
        return {
          tytul: (el.find((y) => y.className === 'vilda-auth-title') || {}).textContent,
          banery: el.filter((y) => String(y.className).includes('vilda-auth-banner') || y.textContent === '[object Object]').length,
        };
      }),
    };
  }
  const KONTA = [{ userId: 'fikcyjne-konto-1', label: 'Fikcyjna Lekarka', passkeyCount: 0 }];
  const PRZYPADKI = [
    ['UK16 (1)', 'showStartupScreen() bez argumentu', () => []],
    ['UK16 (2)', "showStartupScreen({ context: 'pro-signup' })", () => [{ context: 'pro-signup' }]],
    ['UK16 (3)', 'zdarzenie jako argument', () => [new Event('click')]],
  ];
  it.each(PRZYPADKI)('%s: %s — „Witamy” i „Kto się loguje?” bez banera (ani „[object Object]”)', async (_n, _opis, argumenty) => {
    const witamy = ekranStartowy([]);
    await witamy.me(...argumenty());
    const lista = ekranStartowy(KONTA);
    await lista.me(...argumenty());
    expect([...witamy.ekrany(), ...lista.ekrany()]).toEqual([{ tytul: 'Witamy', banery: 0 }, { tytul: 'Kto się loguje?', banery: 0 }]);
  });
});

describe('vilda_frame_sync.js (prawdziwy plik) w oknie z celem zdarzeń', () => {
  const KANAL = 'vilda-auth';
  // Atrapa VildaSession okna (klucz sesji: domyślnie brak) i załadowanie FS po sejfie.
  function zFs(o, { klucz = () => false } = {}) {
    const s = { hasSessionKey: vi.fn(klucz), notifySessionChanged: vi.fn() };
    o.win.VildaSession = s;
    loadBrowserScript('vilda_frame_sync.js', o.win);
    return s;
  }
  // Komunikat auth-changed od innego nadawcy (kanał testu na szynie rodziny okien); czekanie, aż FS go obsłuży.
  async function komunikat(o, s) {
    const k = new o.win.BroadcastChannel(KANAL);
    const ile = s.hasSessionKey.mock.calls.length;
    k.postMessage({ type: 'auth-changed', ts: Date.now(), sender: 'fikcyjny-inny-nadawca' });
    await czekajNa(() => s.hasSessionKey.mock.calls.length > ile, 'obsługa komunikatu auth-changed');
    await o.spokoj();
    k.close();
  }

  it('UK17 (1): bez klucza sesji, sejf odblokowany, dokument nie kasuje konta — przeładowanie (reload 1×)', async () => {
    const o = await nowe({ zdarzenia: true });
    const s = zFs(o);
    await komunikat(o, s);
    expect({ reload: o.przeladowania(), powiadomienia: s.notifySessionChanged.mock.calls.length }).toEqual({ reload: 1, powiadomienia: 0 });
  }, 30_000);

  it('UK17 (2): dokument kasuje konto bieżącej sesji (isRemovingCurrentUser true w trakcie removeUser) — bez przeładowania i bez powiadomienia', async () => {
    const o = await nowe({ zdarzenia: true });
    const s = zFs(o);
    const h = wstrzymaj(o, { przy: 'deleteDatabase', baza: BAZA(o.A.userId) });
    const p = usun(o);
    await doczekaj(h.czeka, 'kasowanie bazy sejfu konta');
    await komunikat(o, s);
    const wTrakcie = { reload: o.przeladowania(), powiadomienia: s.notifySessionChanged.mock.calls.length };
    h.zwolnij();
    expect(await doczekaj(p, 'removeUser')).toEqual({ ok: true, w: true });
    expect(wTrakcie).toEqual({ reload: 0, powiadomienia: 0 });
  }, 30_000);

  it('UK17 (3): sejf bez isRemovingCurrentUser albo z funkcją, która rzuca — przeładowanie jak dotąd (reload 1× w obu)', async () => {
    const wyniki = [];
    for (const wariant of ['bez funkcji', 'funkcja rzuca']) {
      const o = await nowe({ zdarzenia: true });
      const s = zFs(o);
      const sejf = { ...o.v };
      if (wariant === 'bez funkcji') delete sejf.isRemovingCurrentUser;
      else sejf.isRemovingCurrentUser = () => { throw new Error('fikcyjny błąd'); };
      o.win.VildaVault = sejf;
      await komunikat(o, s);
      wyniki.push([wariant, o.przeladowania()]);
    }
    expect(wyniki).toEqual([['bez funkcji', 1], ['funkcja rzuca', 1]]);
  }, 30_000);

  it('UK17 (4): powłoka P i panel U (prawdziwy sejf i FS, wspólny sessionStorage i szyna); w U removeUser(X) wstrzymany na usunięciu wpisu rejestru, zegary 150 ms odpalone — komunikat P dochodzi do U bez przeładowania; po zwolnieniu removeUser kończy, wpis rejestru usunięty, P zablokowana user-removed-elsewhere', async () => {
    const P = await nowe({ zdarzenia: true });
    const X = P.A.userId;
    const U = await drugie(P, { zdarzenia: true, sesja: P.win.sessionStorage, zaloguj: 'A' });
    const klucz = () => Boolean(P.win.sessionStorage.getItem(SESJA));
    zFs(P, { klucz });
    const sU = zFs(U, { klucz });
    const lP = blokady(P);
    const h = wstrzymaj(U, { przy: 'success', baza: REJESTR, sklep: 'users', metoda: 'delete' });
    const pU = usun(U);
    await doczekaj(h.czeka, 'usunięcie wpisu rejestru w panelu U');
    await doczekaj(P.timery.czekajNa((t) => t.ms === 150), 'zegar 150 ms w powłoce P');
    const ile = sU.hasSessionKey.mock.calls.length;
    expect(P.timery.odpal((t) => t.ms === 150), 'odpalone zegary 150 ms w P').toBeGreaterThan(0);
    await czekajNa(() => sU.hasSessionKey.mock.calls.length > ile, 'komunikat powłoki P w panelu U');
    await U.spokoj();
    const wTrakcie = { reload: U.przeladowania(), powiadomienia: sU.notifySessionChanged.mock.calls.length };
    h.zwolnij();
    expect(await doczekaj(pU, 'removeUser w panelu U')).toEqual({ ok: true, w: true });
    await P.cisza();
    expect(wTrakcie).toEqual({ reload: 0, powiadomienia: 0 });
    expect(await czytajRekord(P.idb, REJESTR, 'users', X), 'wpis rejestru konta X').toBeFalsy();
    expect(lP).toEqual(['user-removed-elsewhere']);
  }, 30_000);
});

describe('błędy ACCOUNT_REMOVED i APP_UPDATED', () => {
  const wlasneKlucze = (e) => Object.getOwnPropertyNames(e).sort();
  it('UK18: baza sejfu konta w wersji 6 (inna wersja aplikacji) — unlockUser → APP_UPDATED, stały komunikat, klucze błędu tylko code/message/stack; ACCOUNT_REMOVED tak samo', async () => {
    const o = await nowe({ zaloguj: null });
    o.idb.__atrapa.utworz(BAZA(BEZ_KONTA), 6, { meta: { keyPath: 'k', indeksy: {} } }, { meta: [] });
    await wpisRejestru(o, BEZ_KONTA, { label: 'Fikcyjne konto nowszej wersji', createdAtISO: '2026-03-02T08:00:00.000Z', storageMode: 'local', passkeyCount: 0 });
    const w = await wynik(o.v.unlockUser(BEZ_KONTA, 'Fikcyjne#Dowolne!2026xx'));
    expect({ kod: w.kod, komunikat: w.komunikat }).toEqual({ kod: 'APP_UPDATED', komunikat: TEKST_WERSJA });
    expect(wlasneKlucze(w.e)).toEqual(['code', 'message', 'stack']);

    // Nowsza wersja bazy obejmuje cały dokument, więc odmowa ACCOUNT_REMOVED — w osobnej parze kart (jak UK5).
    const o3 = await nowe();
    const X = o3.A.userId;
    const o4 = await drugie(o3, { zaloguj: null });
    await o4.v.listPasskeys(X);
    expect(await doczekaj(usun(o3), 'removeUser w karcie A')).toEqual({ ok: true, w: true });
    await o4.cisza();
    const w2 = await wynik(o4.v.unlockUser(X, o3.A.haslo));
    expect({ kod: w2.kod, komunikat: w2.komunikat }).toEqual({ kod: 'ACCOUNT_REMOVED', komunikat: TEKST_USUNIETE });
    expect(wlasneKlucze(w2.e)).toEqual(['code', 'message', 'stack']);
  }, 30_000);
});

describe('strażniki tekstowe: testy drugiej karty nie zamykają połączeń z bazą sejfu same', () => {
  it('UK19 (1): sync-dziennik-konto.test.mjs — bez wymuszonego zamknięcia bazy sejfu, bez czekania na blocked bazy sejfu', () => {
    const t = zrodlo('tests/unit/sync-dziennik-konto.test.mjs');
    expect(t).not.toMatch(/wymusZamkniecie\([^)]*(BAZA_SEJFU|vilda_user_)/);
    expect(t).not.toMatch(/'blocked'[^\n]*(BAZA_SEJFU|vilda_user_)/);
    expect(t).not.toContain('zwolnijBazeSejfuDrugiejKarty');
  });

  it('UK19 (2): tests/support/dwie-karty-chromium.mjs — bez nadpisania IDBFactory.prototype.open', () => {
    expect(zrodlo('tests/support/dwie-karty-chromium.mjs')).not.toMatch(/IDBFactory\.prototype\.open\s*=/);
  });
});

describe('identyfikator urządzenia przy usunięciu konta (osobny widok localStorage na okno)', () => {
  it('UK20: bramka otwarta, pierwsze dopisanie karty B wstrzymane na zatwierdzeniu, A usuwa X — dopisanie B ok, od versionchange karta B nie zapisuje identyfikatora urządzenia; po propaguj() brak w obu kartach', async () => {
    const o = await nowe({ bramka: true, localStorage: 'osobny' });
    const X = o.A.userId;
    const r = await o.v.savePatient(naglowek(1), { dedup: false });
    await o.cisza();
    const o2 = await drugie(o, { bramka: true, localStorage: 'osobny', zaloguj: 'A' });
    const klucz = kluczUrzadzenia(X);
    const h = wstrzymaj(o2, { przy: 'commit', baza: `vilda_sync_${X}`, tryb: 'readwrite' });
    const pB = o2.ev.enqueue('snap', { patientId: r.patientId, snapshotId: r.snapshotId });
    await doczekaj(h.czeka, 'zatwierdzenie dopisania w karcie B');
    const odZmiany = [];
    o2.v.onLock(() => { odZmiany.push(o2.dziennik.length); });
    const pA = usun(o);
    await czekajNa(() => odZmiany.length > 0, 'blokada karty B');
    h.zwolnij();
    const wB = await doczekaj(pB, 'dopisanie w karcie B');
    expect(await doczekaj(pA, 'removeUser w karcie A')).toEqual({ ok: true, w: true });
    await o.cisza();
    await o2.cisza();
    expect(wB.ok, JSON.stringify(wB)).toBe(true);
    expect(o2.dziennik.slice(odZmiany[0]).filter((x) => x.klucz === klucz && x.op === 'set'), 'zapisy identyfikatora w karcie B od versionchange').toEqual([]);
    expect(o2.win.localStorage.getItem(klucz), 'identyfikator w widoku karty B').toBe(null);
    await o2.propaguj();
    await o.propaguj();
    expect([o.win.localStorage.getItem(klucz), o2.win.localStorage.getItem(klucz)]).toEqual([null, null]);
  }, 30_000);

  it('UK20b: karta B zapisała identyfikator urządzenia pełnym dopisaniem przed usunięciem (karta A go nie odczytuje), A usuwa X — po versionchange karta B usuwa go sama, bez nowego zapisu; po propaguj() brak w obu kartach', async () => {
    const o = await nowe({ bramka: true, localStorage: 'osobny' });
    const X = o.A.userId;
    const r = await o.v.savePatient(naglowek(1), { dedup: false });
    await o.cisza();
    const o2 = await drugie(o, { bramka: true, localStorage: 'osobny', zaloguj: 'A' });
    const klucz = kluczUrzadzenia(X);
    const e = await o2.ev.enqueue('snap', { patientId: r.patientId, snapshotId: r.snapshotId });
    expect(e.ok, `pełne dopisanie w karcie B: ${JSON.stringify(e)}`).toBe(true);
    await o2.cisza();
    expect(o2.win.localStorage.getItem(klucz), 'identyfikator w widoku karty B').toMatch(/^[a-km-np-z2-9]{8}$/);
    expect(o.win.localStorage.getItem(klucz), 'warunek wstępny: karta A nie odczytuje identyfikatora urządzenia').toBe(null);
    const odZmiany = [];
    o2.v.onLock(() => { odZmiany.push(o2.dziennik.length); });
    const z = o2.dziennik.length;
    expect(await doczekaj(usun(o), 'removeUser w karcie A')).toEqual({ ok: true, w: true });
    await o.cisza();
    await o2.cisza();
    expect(odZmiany.length, 'blokada karty B').toBe(1);
    expect(o2.win.localStorage.getItem(klucz), 'identyfikator w widoku karty B po versionchange').toBe(null);
    expect(o2.dziennik.slice(z).filter((x) => x.klucz === klucz).map((x) => x.op), 'operacje na identyfikatorze w karcie B').toEqual(['remove']);
    await o2.propaguj();
    await o.propaguj();
    expect([o.win.localStorage.getItem(klucz), o2.win.localStorage.getItem(klucz)]).toEqual([null, null]);
  }, 30_000);
});
