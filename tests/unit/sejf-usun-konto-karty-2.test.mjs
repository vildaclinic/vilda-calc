// P-USUN-KONTO-KARTY (E2-PR3a1c) — „Usuń konto” a inne karty: dziennik dostępu konta, karta odświeżona albo odtworzona,
// lista kont w kartach bez sesji, czekanie kasowania bazy sejfu, przerwane usuwanie, ustawienia kopii konta i zapis
// sesji innego konta.
//
// Prawdziwy sejf z modułami punktu odzyskiwania w oknie uprzęży tests/support/okno-magazynu.mjs (adapter IndexedDB sejfu
// nad atrapą tests/support/atrapa-indexeddb.mjs, tryb „Komputer prywatny”), w przypadkach dziennika z prawdziwym
// vilda_audit_log.js, w przypadkach ustawień kopii z prawdziwym vilda_file_export.js; druga karta = drugie okno na tej
// samej atrapie. Ekran logowania — wycinek prawdziwego vilda_auth_ui.js (jak UK16 w sejf-usun-konto-karty.test.mjs)
// z lekką atrapą DOM (tests/support/atrapa-dom-lekka.mjs). „Konto X” = konto usuwane (o.A), „konto Y” = drugie konto
// (o.B). Bramka dziennika zdarzeń zamknięta. Dane WYŁĄCZNIE FIKCYJNE.
//
// WYMAGANIA
//   - Dziennik dostępu konta (vilda_audit_v1_<userId>) usuwany razem z kontem, także przy drugiej karcie: po „Usuń
//     konto” pełna lista baz zawiera tylko bazy wspólne. „Usuń konto” na dziennik nie czeka; jeśli inna karta ze starszą
//     wersją aplikacji go trzyma, kasowanie kończy się samo (znacznik ponowienia vilda-audit-delete-v1:<userId> do
//     sukcesu) albo przy następnym logowaniu. Kasowanie idzie po usunięciu wpisu rejestru i po blokadzie sejfu.
//   - Moduł dziennika trzyma jedno połączenie na dokument, zamykane przy versionchange, close i blokadzie sejfu; bazę
//     dziennika zakłada tylko logowanie (niezależnie od tego, co strona czyta z dziennika przy logowaniu); bez bazy
//     dziennik jest pusty („✓ spójny (0)”); po usunięciu konta nie ma bazy jego dziennika także wtedy, gdy logowanie
//     w innej karcie zbiegło się z usunięciem.
//   - „Usuń konto” usuwa też ustawienia kopii zapasowej tego konta (folder, auto-kopia, ostatnia kopia), także gdy inna
//     karta właśnie je zapisuje; ustawienia innych kont bez zmian; kasowanie tych wpisów trwa najwyżej 2 s.
//   - Karta odświeżona albo odtworzona (przeładowanie, pamięć przeglądarki, wznowienie) po usunięciu konta w innej karcie:
//     ekran logowania bez tego konta z banerem „Konto zostało usunięte z tej przeglądarki.” (powód
//     user-removed-elsewhere; znacznik karty vilda-vault-removed-v1 w sessionStorage, tylko identyfikator konta), przy
//     każdym odświeżeniu do zalogowania w tej karcie; tak samo po wygaśnięciu sesji, gdy konto w tym czasie usunięto,
//     i po odświeżeniu karty z banerem w trakcie czekającego usuwania (jeśli usunięcie się nie uda, następne odświeżenie
//     pokazuje konto). Bez banera — jak dotąd: wylogowanie, bezczynność, błąd hasła, zwykłe wygaśnięcie, „Usuń konto”
//     w tej karcie, logowanie w toku.
//   - Sejf ogłasza usunięcie konta innym dokumentom (BroadcastChannel vilda-konta, jeden obiekt na dokument, komunikat
//     bez danych konta) po udanym usunięciu wpisu rejestru; „Kto się loguje?” i „Witamy” w kartach bez sesji odświeżają
//     listę bez usuniętego konta, z banerem; formularz logowania innego konta i pozostałe ekrany bez zmian.
//   - Gdy kasowanie bazy sejfu w tym dokumencie czeka (blocked albo brak końca po 1 s), słuchacze onRemoveUserWaiting
//     dostają true, a po końcu false (tekst REMOVE_USER_WAITING_TEXT: „Czekam, aż inne karty z aplikacją zwolnią to
//     konto. Zamknij je albo odpowiedz na pytanie otwarte w innej karcie. Nie zamykaj tej strony.”); Ustawienia pytają
//     przed zamknięciem albo przeładowaniem strony tylko na czas usuwania; w aplikacji zainstalowanej pasek
//     #appShellRemoveWait (role="status", pusty od wczytania).
//   - Usuwanie przerwane zamknięciem albo odświeżeniem strony kończy się przy następnym wyświetleniu listy kont (konto
//     znika z listy od razu); nieudana próba — przy następnej karcie.
//   - W aplikacji zainstalowanej „Usuń konto” nie wylogowuje innego konta, które ktoś zalogował w tym oknie w trakcie
//     czekania: zapis sesji karty zdejmowany tylko, gdy należy do usuwanego konta.
//   - Tryb „Zaloguj jednorazowo”: bez kasowania dziennika, znaczników, ponowień i dokończenia.
//
// PRZYPADKI (UK21–UK50)
//   UK21 (1)(2)  dziennik usuwany razem z kontem: jedna karta, dwie karty.
//   UK22, UK23 (a)–(d)  jedno połączenie dziennika na dokument; blokada, versionchange, close, ponowne zalogowanie.
//   UK24, UK24b, UK24c, UK24d  bazę dziennika zakłada tylko logowanie; logowanie w innej karcie w trakcie usuwania.
//   UK25, UK26 (a)–(c)  karta ze starszą wersją trzyma dziennik; znacznik ponowienia przy logowaniu.
//   UK27 (1)(2), UK28  kolejność kasowania dziennika; tryb „Zaloguj jednorazowo”.
//   UK29 (a)–(e)  ustawienia kopii konta.
//   UK30–UK36  karta odświeżona albo odtworzona (znacznik karty, powód blokady, powrót z pamięci przeglądarki).
//   UK37  baner ekranu startowego po usunięciu konta.
//   UK38, UK39  ogłoszenie usunięcia konta.
//   UK40, UK41  odświeżenie listy kont w kartach bez sesji (wycinek vilda_auth_ui.js).
//   UK42–UK47  czekanie kasowania bazy sejfu; UK48 (a)–(c)  strażniki tekstowe Ustawień i powłoki.
//   UK49 (a)–(j)  przerwane usuwanie kończy się przy liście kont.
//   UK50  zapis sesji innego konta przy „Usuń konto”.
//   UK16 w sejf-usun-konto-karty.test.mjs bez zmian.
// Na kodzie sprzed tej zmiany (E2-PR3a1b) czerwonych jest 61 z 92 przypadków — wszystkie poza strażnikami UK23 (c),
// UK24b, UK26 (c), UK27 (1), UK28, UK29 (b) (oba warianty), UK31b (wariant), UK32 (a) (trzy warianty) i (b)–(e),
// UK33 (4), UK34, UK36 (wariant) (trzy warianty), UK39 (a)–(c), UK49 (b)–(e), (h), (j) i UK50 (wariant) (oba warianty):
// brak nowego zachowania („nie doczekano: …” albo inny wynik) albo brak funkcji (TypeError, brak wycinka
// w vilda_auth_ui.js).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SKRYPTY_PUNKTU, bazaKolejki, czytajRekord, drugieOkno, naAtrapie, nazwaBazy, oknoMagazynu, przechwycZadaniaWTle, wierszKolejki,
} from '../support/okno-magazynu.mjs';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';
import { wynik, wytnijFunkcje, zrodlo } from './sesja-zapisu-uprzaz.mjs';

const BAZA = (uid) => `vilda_user_${uid}`;
const DZIENNIK = (uid) => `vilda_audit_v1_${uid}`;
const PRZEDROSTEK_ZNACZNIKA_DZIENNIKA = 'vilda-audit-delete-v1';
const ZNACZNIK_DZIENNIKA = (uid) => `${PRZEDROSTEK_ZNACZNIKA_DZIENNIKA}:${uid}`;
const ZNACZNIK_KARTY = 'vilda-vault-removed-v1';
const CYKL = (uid) => `vilda-care-template-lifecycle-v1:${uid}`;
const REJESTR = 'vilda_registry';
const USTAWIENIA = 'vilda_export_settings';
const SESJA = 'vilda-vault-session-v2';
const SESJA_JEDNORAZOWA = 'vilda-ephemeral-session-v1';
const TEKST_BANERA = 'Konto zostało usunięte z tej przeglądarki.';
const TEKST_CZEKANIA = 'Czekam, aż inne karty z aplikacją zwolnią to konto. Zamknij je albo odpowiedz na pytanie otwarte w innej karcie. Nie zamykaj tej strony.';
const TEKST_WERSJA = 'Aplikację zaktualizowano w innej karcie. Odśwież tę stronę.';
const BEZ_KONTA = 'fedcbafedcba0abcfedcbafedcba0def';
const OPERACJA = '11111111-2222-4333-8444-5555aaaa0001';
const SKRYPTY_DZIENNIKA = Object.freeze([...SKRYPTY_PUNKTU, 'vilda_audit_log.js']);
const SKRYPTY_EKSPORTU = Object.freeze([...SKRYPTY_PUNKTU, 'vilda_file_export.js']);
const SCHEMAT_DZIENNIKA = Object.freeze({ entries: { keyPath: 'seq', indeksy: {} } });
const SCHEMAT_USTAWIEN = Object.freeze({ folderHandlesByUser: { keyPath: 'userId', indeksy: {} }, preferencesByUser: { keyPath: 'userId', indeksy: {} } });
const OK = Object.freeze({ ok: true, w: true });
const LIMIT_OCZEKIWANIA_MS = 8000;
const realnySetTimeout = globalThis.setTimeout;
const makrozadanie = () => new Promise((r) => { setImmediate(r); });

// ── Higiena ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const OKNA = [];
const UCHWYTY = [];
const SPRZATANIE = [];
beforeEach(() => { przechwycZadaniaWTle(); });
afterEach(async () => {
  for (const f of SPRZATANIE.splice(0)) { try { f(); } catch { /* sprzątanie */ } }
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

// ── Stan ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
const usun = (o, kto = 'A') => wynik(o.v.removeUser(o[kto].userId, o[kto].haslo));
const bazy = (o) => Object.keys(o.idb.__atrapa.bazy()).sort();
const blokady = (o) => { const l = []; o.v.onLock((p) => l.push(p)); return l; };
const kod = (w) => (w.ok ? { ok: true } : { ok: false, kod: w.kod, komunikat: w.komunikat });
const log = (o) => o.idb.__atrapa.log;
const pasujeBaza = (w, baza) => baza === undefined || (baza instanceof RegExp ? baza.test(String(w[1])) : w[1] === baza);
const wpisyOd = (o, od, rodzaj, baza) => log(o).slice(od).filter((w) => w[0] === rodzaj && pasujeBaza(w, baza));
const rodzaje = (o, od, baza) => log(o).slice(od).filter((w) => w[1] === baza).map((w) => w[0]);
const zapisyRejestru = (o, od) => wpisyOd(o, od, 'tx', REJESTR).filter((w) => w[3] === 'readwrite' && w[4] === 'start');
const polaczenia = (o, nazwa) => o.idb.__atrapa.polaczenia(nazwa);
const wiersze = (o, nazwa) => { const b = o.idb.__atrapa.bazy()[nazwa]; return b && b.sklepy.entries ? b.sklepy.entries.wiersze : []; };
const id = (lista) => lista.map((u) => u.userId);
const stanCyklu = (o, uid) => { try { return JSON.parse(o.win.localStorage.getItem(CYKL(uid))).state; } catch { return null; } };
const znacznikKarty = (s) => { const t = s.getItem(ZNACZNIK_KARTY); return t === null ? null : JSON.parse(t); };
const powod = async (o) => (await o.v.getStatus()).lockReason;
const czekanie = (o) => { const l = []; o.v.onRemoveUserWaiting((x) => l.push(x)); return l; };
const przeszlosc = () => new Date(Date.now() - 60_000).toISOString();

// sessionStorage karty do wczytania jej od nowa (karta zamknięta, przywrócona albo przeładowana): magazyn o zachowaniu
// sessionStorage z podanymi wpisami.
function magazynSesji(wpisy = {}) {
  const m = Object.assign(Object.create(null), wpisy);
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
    clear: () => { for (const k of Object.keys(m)) delete m[k]; },
    key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
    klucze: () => Object.keys(m),
  };
}
function kopiaSesji(o, { wygasla = false } = {}) {
  const s = o.win.sessionStorage;
  const wpisy = {};
  for (const k of s.klucze()) wpisy[k] = s.getItem(k);
  if (wygasla) wpisy[SESJA] = JSON.stringify({ ...JSON.parse(wpisy[SESJA]), expiresAtISO: przeszlosc() });
  return magazynSesji(wpisy);
}
// Połączenie testu z bazą (jak karta ze starszą wersją aplikacji): bez obsługi versionchange; zamykane po teście.
function otworzSurowo(idb, nazwa, wersja) {
  return new Promise((ok, zle) => {
    const q = wersja === undefined ? idb.open(nazwa) : idb.open(nazwa, wersja);
    q.onsuccess = () => { const db = q.result; SPRZATANIE.push(() => db.close()); ok(db); };
    q.onerror = (e) => { e.preventDefault(); zle(q.error); };
  });
}
// Otwarcie bazy w podanej wersji z innego „dokumentu” (połączenie zamykane po sukcesie): 'ok' | 'blocked' | błąd.
function otworzWersje(idb, nazwa, wersja) {
  return new Promise((ok) => {
    const q = idb.open(nazwa, wersja);
    q.onupgradeneeded = () => {};
    q.onsuccess = () => { q.result.close(); ok('ok'); };
    q.onerror = (e) => { e.preventDefault(); ok(q.error ? q.error.name : 'error'); };
    q.onblocked = () => ok('blocked');
  });
}
// Skasowanie bazy narzędziami przeglądarki: zerwanie połączeń i kasowanie w jednym zadaniu, czekanie na sukces.
function kasujBaze(idb, nazwa) {
  return doczekaj(new Promise((ok, zle) => {
    idb.__atrapa.wymusZamkniecie(nazwa);
    const q = idb.deleteDatabase(nazwa);
    q.onsuccess = () => ok();
    q.onerror = () => zle(q.error);
  }), `kasowanie ${nazwa} przez test`);
}
// Kanał testu na szynie rodziny okien: komunikaty kanału vilda-konta od sejfów okien.
function kanalTestu(o) {
  const k = new o.win.BroadcastChannel('vilda-konta');
  const komunikaty = [];
  k.onmessage = (e) => { komunikaty.push(e.data); };
  SPRZATANIE.push(() => k.close());
  return { komunikaty };
}
async function wpisRejestru(o, uid, wpis) {
  await naAtrapie(o.idb, REJESTR, ['users'], 'readwrite', (tx) => { tx.objectStore('users').put({ ...wpis, userId: uid }); });
}
const wierszDziennika = (seq) => ({ seq, ts: '2026-03-02T08:00:00.000Z', prevHash: '0', hash: `fikcyjny-skrot-${seq}`, iv: 'fikcyjneIV', data: 'Fikcyjny-szyfrogram' });
// Powrót strony z pamięci przeglądarki albo zwykłe pokazanie strony (persisted false).
async function pokazStrone(o, persisted) {
  const e = new Event('pageshow');
  Object.defineProperty(e, 'persisted', { value: persisted, enumerable: true });
  o.win.dispatchEvent(e);
  await o.spokoj();
  await o.cisza();
}

describe('dziennik dostępu konta przy „Usuń konto”', () => {
  it('UK21 (1): jedno okno z dziennikiem dostępu, X zalogowane — „Usuń konto” usuwa też dziennik dostępu konta: pełna lista baz po usunięciu konta — tylko bazy wspólne, bez blocked dziennika, bez znacznika ponowienia', async () => {
    const o = await nowe({ skrypty: SKRYPTY_DZIENNIKA });
    const X = o.A.userId;
    await o.cisza();
    expect(bazy(o), 'baza dziennika dostępu konta przed usunięciem').toContain(DZIENNIK(X));
    const z = log(o).length;
    expect(await doczekaj(usun(o), 'removeUser')).toEqual(OK);
    await czekajNa(() => wpisyOd(o, z, 'delete-success', DZIENNIK(X)).length > 0, `kasowanie ${DZIENNIK('<X>')}`);
    await o.cisza();
    expect(bazy(o), 'pełna lista baz po usunięciu konta — tylko bazy wspólne').toEqual([REJESTR]);
    expect(wpisyOd(o, z, 'blocked', DZIENNIK(X)), 'blocked kasowania dziennika').toEqual([]);
    expect(o.win.localStorage.getItem(ZNACZNIK_DZIENNIKA(X)), 'znacznik ponowienia po kasowaniu').toBe(null);
  }, 30_000);

  it('UK21 (2): dwie karty z dziennikiem zalogowane na X (w B wpis, list, verify), A usuwa X — A kończy w limicie; pełna lista baz — tylko bazy wspólne; połączeń z bazą dziennika brak; bez blocked dziennika', async () => {
    const o = await nowe({ skrypty: SKRYPTY_DZIENNIKA });
    const X = o.A.userId;
    const o2 = await drugie(o, { zaloguj: 'A' });
    const d = o2.win.VildaAuditLog;
    await d.log('patient.view', { patientId: 'fikcyjny-pacjent-1' });
    await d.list();
    await d.verify();
    await o.cisza();
    await o2.cisza();
    const z = log(o).length;
    expect(await doczekaj(usun(o), 'removeUser w karcie A')).toEqual(OK);
    await czekajNa(() => wpisyOd(o, z, 'delete-success', DZIENNIK(X)).length > 0, `kasowanie ${DZIENNIK('<X>')}`);
    await o.cisza();
    await o2.cisza();
    expect(bazy(o), 'pełna lista baz po usunięciu konta — tylko bazy wspólne').toEqual([REJESTR]);
    expect(polaczenia(o, DZIENNIK(X)), 'połączenia z bazą dziennika').toBe(0);
    expect(wpisyOd(o, z, 'blocked', DZIENNIK(X)), 'blocked kasowania dziennika').toEqual([]);
  }, 30_000);

  it('UK22: jedno połączenie dziennika na dokument — od zalogowania: 3 wpisy, list, verify, exportLog — jedno otwarcie bazy dziennika, jedno otwarte połączenie', async () => {
    const o = await nowe({ skrypty: SKRYPTY_DZIENNIKA });
    const X = o.A.userId;
    await o.cisza();
    const z = log(o).length;
    await o.zaloguj('A');
    const d = o.win.VildaAuditLog;
    for (let i = 1; i <= 3; i += 1) await d.log('patient.view', { patientId: `fikcyjny-pacjent-${i}` });
    await d.list();
    await d.verify();
    await d.exportLog();
    await o.cisza();
    expect(wpisyOd(o, z, 'open', DZIENNIK(X)).length, 'otwarcia bazy dziennika od zalogowania').toBe(1);
    expect(polaczenia(o, DZIENNIK(X)), 'otwarte połączenia z bazą dziennika').toBe(1);
  }, 30_000);

  it('UK23 (a): blokada sejfu (manual) zamyka połączenie dziennika', async () => {
    const o = await nowe({ skrypty: SKRYPTY_DZIENNIKA });
    const X = o.A.userId;
    await o.cisza();
    expect(polaczenia(o, DZIENNIK(X)), 'połączenie dziennika zalogowanej karty').toBeGreaterThan(0);
    o.zablokuj('manual');
    await o.spokoj();
    expect(polaczenia(o, DZIENNIK(X)), 'połączenia z bazą dziennika po blokadzie').toBe(0);
  }, 30_000);

  it('UK23 (b): kasowanie bazy dziennika z innego dokumentu przy otwartej sesji — pierwsze zdarzenie kasowania to success (połączenie zamknięte przy versionchange); okno odblokowane, bez blokady', async () => {
    const o = await nowe({ skrypty: SKRYPTY_DZIENNIKA });
    const X = o.A.userId;
    await o.cisza();
    const lA = blokady(o);
    const pierwsze = new Promise((ok) => {
      const q = o.idb.deleteDatabase(DZIENNIK(X));
      q.onsuccess = () => ok('success');
      q.onblocked = () => ok('blocked');
      q.onerror = () => ok('error');
    });
    expect(await doczekaj(pierwsze, 'pierwsze zdarzenie kasowania bazy dziennika')).toBe('success');
    await o.cisza();
    expect({ odblokowane: o.v.isUnlocked(), lA }).toEqual({ odblokowane: true, lA: [] });
  }, 30_000);

  it('UK23 (c): wymuszone zamknięcie połączenia dziennika (baza jest) — następny wpis zapisany przez nowe otwarcie', async () => {
    const o = await nowe({ skrypty: SKRYPTY_DZIENNIKA });
    const X = o.A.userId;
    await o.cisza();
    const przed = wiersze(o, DZIENNIK(X)).length;
    o.idb.__atrapa.wymusZamkniecie(DZIENNIK(X));
    await o.spokoj();
    const z = log(o).length;
    await o.win.VildaAuditLog.log('patient.view', { patientId: 'fikcyjny-pacjent-1' });
    await o.cisza();
    expect(wpisyOd(o, z, 'open', DZIENNIK(X)).length, 'nowe otwarcie bazy dziennika').toBe(1);
    expect(wiersze(o, DZIENNIK(X)).length, 'wpisy dziennika').toBe(przed + 1);
  }, 30_000);

  it('UK23 (d): otwarcie dziennika w list() wstrzymane, w tym czasie blokada i ponowne zalogowanie X; po zwolnieniu i blokadzie — połączeń z bazą dziennika brak', async () => {
    const o = await nowe({ skrypty: SKRYPTY_DZIENNIKA });
    const X = o.A.userId;
    await o.cisza();
    o.idb.__atrapa.wymusZamkniecie(DZIENNIK(X));
    await o.spokoj();
    const h = wstrzymaj(o, { przy: 'open', baza: DZIENNIK(X) });
    const pL = o.win.VildaAuditLog.list();
    await doczekaj(h.czeka, 'otwarcie bazy dziennika w list()');
    await o.zaloguj('A');
    h.zwolnij();
    await doczekaj(pL, 'list()');
    await o.cisza();
    o.zablokuj('manual');
    await o.spokoj();
    expect(polaczenia(o, DZIENNIK(X)), 'połączenia z bazą dziennika po blokadzie').toBe(0);
  }, 30_000);

  it('UK24: sesja X otwarta, bazy dziennika nie ma (skasowana narzędziami przeglądarki) — wpis, list, verify, clear nie zakładają bazy: pusty dziennik ([], ✓ spójny (0), true); ponowne logowanie zakłada bazę z wpisem seq 1', async () => {
    const o = await nowe({ skrypty: SKRYPTY_DZIENNIKA });
    const X = o.A.userId;
    await o.cisza();
    await kasujBaze(o.idb, DZIENNIK(X));
    await o.spokoj();
    const z = log(o).length;
    const d = o.win.VildaAuditLog;
    await d.log('patient.view', { patientId: 'fikcyjny-pacjent-1' });
    const lista = await d.list();
    const spojnosc = await d.verify();
    const wyczysc = await d.clear();
    await o.cisza();
    expect(bazy(o), 'bez bazy dziennika: operacje dziennika poza logowaniem nie zakładają bazy').not.toContain(DZIENNIK(X));
    expect(rodzaje(o, z, DZIENNIK(X)).filter((r) => !['open', 'upgrade', 'abort-upgrade'].includes(r)), 'zdarzenia bazy dziennika poza przerwanym zakładaniem').toEqual([]);
    expect({ lista, spojnosc, wyczysc }).toEqual({ lista: [], spojnosc: { ok: true, count: 0, brokenAt: null }, wyczysc: true });
    await o.zaloguj('A');
    await o.cisza();
    expect(wiersze(o, DZIENNIK(X)).map((w) => w.seq), 'dziennik po ponownym zalogowaniu').toEqual([1]);
  }, 30_000);

  it('UK24b: bazy dziennika nie ma, słuchacz onUnlock zarejestrowany po module woła verify() przy logowaniu — baza powstaje z wpisem odblokowania; verify słuchacza ✓ spójny (0), następne ✓ spójny (1)', async () => {
    const o = await nowe({ skrypty: SKRYPTY_DZIENNIKA });
    const X = o.A.userId;
    await o.cisza();
    o.zablokuj('manual');
    await o.spokoj();
    await kasujBaze(o.idb, DZIENNIK(X));
    const spojnosci = [];
    o.v.onUnlock(() => { spojnosci.push(o.win.VildaAuditLog.verify()); });
    await o.zaloguj('A');
    await o.cisza();
    const wSluchaczu = await spojnosci[0];
    const wpisy = (await o.win.VildaAuditLog.list()).map((x) => x.action);
    const potem = await o.win.VildaAuditLog.verify();
    expect(bazy(o), 'baza dziennika po logowaniu').toContain(DZIENNIK(X));
    expect({ wSluchaczu, wpisy, potem }).toEqual({ wSluchaczu: { ok: true, count: 0, brokenAt: null }, wpisy: ['unlock'], potem: { ok: true, count: 1, brokenAt: null } });
  }, 30_000);

  it('UK24c: bazy dziennika nie ma; w karcie B otwarcie dziennika przy wpisie odblokowania X wstrzymane, A usuwa X (B zablokowana) — po zwolnieniu zakładanie przerwane (abort-upgrade, bez success i bez kasowania); po usunięciu konta bazy dziennika nie ma', async () => {
    const o = await nowe({ skrypty: SKRYPTY_DZIENNIKA });
    const X = o.A.userId;
    const o2 = await drugie(o, { zaloguj: null });
    await o.cisza();
    await kasujBaze(o.idb, DZIENNIK(X));
    await o.spokoj();
    const h = wstrzymaj(o, { przy: 'open', baza: DZIENNIK(X) });
    const p = o2.przelaczWTle('A');
    await doczekaj(p.sesja, 'logowanie X w karcie B');
    await doczekaj(h.czeka, 'otwarcie bazy dziennika przy wpisie odblokowania w karcie B');
    const lB = blokady(o2);
    expect(await doczekaj(usun(o), 'removeUser w karcie A')).toEqual(OK);
    await czekajNa(() => lB.length > 0, 'blokada karty B');
    const z = log(o).length;
    h.zwolnij();
    await czekajNa(() => rodzaje(o, z, DZIENNIK(X)).some((r) => r === 'abort-upgrade' || r === 'success'), 'koniec otwarcia bazy dziennika w karcie B');
    await o.cisza();
    await o2.cisza();
    const r = rodzaje(o, z, DZIENNIK(X));
    expect({ przerwane: r.includes('abort-upgrade'), success: r.includes('success'), kasowanie: r.includes('deleteDatabase') }, 'zdarzenia bazy dziennika od zwolnienia').toEqual({ przerwane: true, success: false, kasowanie: false });
    expect(bazy(o), 'po usunięciu konta bazy dziennika nie ma').not.toContain(DZIENNIK(X));
  }, 30_000);

  it('UK24d: jak UK24c, ale zakładanie bazy dziennika w karcie B wstrzymane na zatwierdzaniu (po sprawdzeniu konta) — po zwolnieniu moduł zamyka i kasuje pustą bazę (success, close, deleteDatabase, delete-success); bazy dziennika nie ma', async () => {
    const o = await nowe({ skrypty: SKRYPTY_DZIENNIKA });
    const X = o.A.userId;
    const o2 = await drugie(o, { zaloguj: null });
    await o.cisza();
    await kasujBaze(o.idb, DZIENNIK(X));
    await o.spokoj();
    const h = wstrzymaj(o, { przy: 'commit', baza: DZIENNIK(X), tryb: 'versionchange' });
    const p = o2.przelaczWTle('A');
    await doczekaj(p.sesja, 'logowanie X w karcie B');
    await doczekaj(h.czeka, 'zatwierdzanie zakładania bazy dziennika w karcie B');
    const lB = blokady(o2);
    expect(await doczekaj(usun(o), 'removeUser w karcie A')).toEqual(OK);
    await czekajNa(() => lB.length > 0, 'blokada karty B');
    await o.spokoj();
    const z = log(o).length;
    h.zwolnij();
    await czekajNa(() => rodzaje(o, z, DZIENNIK(X)).some((r) => r === 'abort-upgrade' || r === 'success'), 'koniec zakładania bazy dziennika w karcie B');
    await o.cisza();
    await o2.cisza();
    expect(rodzaje(o, z, DZIENNIK(X)).filter((r) => ['success', 'close', 'deleteDatabase', 'delete-success', 'tx'].includes(r)), 'zdarzenia bazy dziennika od zwolnienia')
      .toEqual(['success', 'close', 'deleteDatabase', 'delete-success']);
    expect(bazy(o), 'po usunięciu konta bazy dziennika nie ma').not.toContain(DZIENNIK(X));
  }, 30_000);

  it('UK25: połączenie z bazą dziennika bez obsługi versionchange (karta ze starszą wersją aplikacji) — „Usuń konto” kończy bez czekania na dziennik; kasowanie dziennika czeka (blocked) ze znacznikiem ponowienia "1"; po zamknięciu połączenia baza znika, znacznik zdjęty', async () => {
    const o = await nowe({ skrypty: SKRYPTY_DZIENNIKA });
    const X = o.A.userId;
    await o.cisza();
    const obce = await otworzSurowo(o.idb, DZIENNIK(X));
    const z = log(o).length;
    expect(await doczekaj(usun(o), 'removeUser bez czekania na dziennik dostępu')).toEqual(OK);
    await czekajNa(() => wpisyOd(o, z, 'blocked', DZIENNIK(X)).length > 0, `blocked kasowania ${DZIENNIK('<X>')}`);
    expect(o.win.localStorage.getItem(ZNACZNIK_DZIENNIKA(X)), 'znacznik ponowienia w trakcie kasowania').toBe('1');
    obce.close();
    await czekajNa(() => wpisyOd(o, z, 'delete-success', DZIENNIK(X)).length > 0, `kasowanie ${DZIENNIK('<X>')} po zamknięciu połączenia`);
    await o.cisza();
    expect(bazy(o), 'pełna lista baz po usunięciu konta — tylko bazy wspólne').toEqual([REJESTR]);
    expect(o.win.localStorage.getItem(ZNACZNIK_DZIENNIKA(X)), 'znacznik ponowienia po kasowaniu').toBe(null);
  }, 30_000);

  it('UK26 (a): znacznik ponowienia konta bez wpisu rejestru i jego baza dziennika — logowanie Y kasuje tę bazę i zdejmuje znacznik', async () => {
    const o = await nowe({ konta: 'AB', zaloguj: null });
    o.idb.__atrapa.utworz(DZIENNIK(BEZ_KONTA), 1, SCHEMAT_DZIENNIKA, { entries: [wierszDziennika(1)] });
    o.win.localStorage.setItem(ZNACZNIK_DZIENNIKA(BEZ_KONTA), '1');
    const z = log(o).length;
    await o.zaloguj('B');
    await czekajNa(() => wpisyOd(o, z, 'delete-success', DZIENNIK(BEZ_KONTA)).length > 0, 'kasowanie dziennika konta ze znacznikiem ponowienia przy logowaniu');
    await o.cisza();
    expect(bazy(o), 'baza dziennika konta bez wpisu rejestru').not.toContain(DZIENNIK(BEZ_KONTA));
    expect(o.win.localStorage.getItem(ZNACZNIK_DZIENNIKA(BEZ_KONTA)), 'znacznik ponowienia').toBe(null);
  }, 30_000);

  it('UK26 (b): znacznik ponowienia konta Y z wpisem rejestru — logowanie zdejmuje znacznik, baza dziennika Y nietknięta', async () => {
    const o = await nowe({ konta: 'AB', zaloguj: null });
    const Y = o.B.userId;
    o.idb.__atrapa.utworz(DZIENNIK(Y), 1, SCHEMAT_DZIENNIKA, { entries: [wierszDziennika(1)] });
    const przed = o.idb.__atrapa.bazy()[DZIENNIK(Y)];
    o.win.localStorage.setItem(ZNACZNIK_DZIENNIKA(Y), '1');
    const z = log(o).length;
    await o.zaloguj('A');
    await czekajNa(() => o.win.localStorage.getItem(ZNACZNIK_DZIENNIKA(Y)) === null, 'zdjęcie znacznika ponowienia konta, które istnieje');
    await o.cisza();
    expect(o.idb.__atrapa.bazy()[DZIENNIK(Y)], 'baza dziennika Y').toEqual(przed);
    expect(wpisyOd(o, z, 'deleteDatabase', DZIENNIK(Y)), 'kasowania bazy dziennika Y').toEqual([]);
  }, 30_000);

  it('UK26 (c): logowanie w trybie „Zaloguj jednorazowo” przy znaczniku ponowienia — bez operacji na bazach vilda_audit_v1_* i na kluczach vilda-audit-delete-v1:*, bez listy baz; znacznik bez zmian', async () => {
    const o = await nowe({ zaloguj: null });
    o.idb.__atrapa.utworz(DZIENNIK(BEZ_KONTA), 1, SCHEMAT_DZIENNIKA, { entries: [wierszDziennika(1)] });
    o.win.localStorage.setItem(ZNACZNIK_DZIENNIKA(BEZ_KONTA), '1');
    const z = o.znacznik();
    const odczyty = vi.spyOn(o.win.localStorage, 'getItem');
    o.v.setEphemeralMode(true);
    await o.v.createUser('Fikcyjne#Jednorazowe!2026jj', { label: 'Fikcyjne konto jednorazowe', iterations: 1000 });
    await o.tlo();
    const odczytane = odczyty.mock.calls.map(([k]) => String(k)).filter((k) => k.startsWith(PRZEDROSTEK_ZNACZNIKA_DZIENNIKA));
    odczyty.mockRestore();
    expect(o.v.isEphemeralMode(), 'tryb jednorazowy').toBe(true);
    expect(odczytane, 'odczyty znaczników ponowienia').toEqual([]);
    expect({ databases: wpisyOd(o, z.log, 'databases').length, open: wpisyOd(o, z.log, 'open', /^vilda_audit_v1_/).length, deleteDatabase: wpisyOd(o, z.log, 'deleteDatabase', /^vilda_audit_v1_/).length })
      .toEqual({ databases: 0, open: 0, deleteDatabase: 0 });
    expect(o.dziennik.slice(z.dziennik).filter((x) => String(x.klucz).startsWith(PRZEDROSTEK_ZNACZNIKA_DZIENNIKA)), 'zapisy znaczników ponowienia').toEqual([]);
    expect(o.win.localStorage.getItem(ZNACZNIK_DZIENNIKA(BEZ_KONTA))).toBe('1');
  }, 30_000);

  it('UK27 (1): błąd kasowania bazy sejfu — „Usuń konto” odrzucone; baza dziennika konta jest, bez znacznika ponowienia i bez ogłoszenia usunięcia', async () => {
    const o = await nowe({ skrypty: SKRYPTY_DZIENNIKA, zdarzenia: true });
    const X = o.A.userId;
    await o.cisza();
    const k = kanalTestu(o);
    o.idb.__atrapa.usterka({ przy: 'deleteDatabase', baza: BAZA(X), blad: 'UnknownError' });
    const w = await doczekaj(usun(o), 'removeUser z błędem kasowania bazy sejfu');
    await o.cisza();
    expect(w.ok, 'removeUser').toBe(false);
    expect(bazy(o), 'baza dziennika konta, które nie zostało usunięte').toContain(DZIENNIK(X));
    expect({ znacznik: o.win.localStorage.getItem(ZNACZNIK_DZIENNIKA(X)), komunikaty: k.komunikaty }).toEqual({ znacznik: null, komunikaty: [] });
  }, 30_000);

  it('UK27 (2): kolejność — kasowanie bazy dziennika po usunięciu wpisu rejestru i po blokadzie user-removed', async () => {
    const o = await nowe({ skrypty: SKRYPTY_DZIENNIKA });
    const X = o.A.userId;
    await o.cisza();
    let wChwiliBlokady = -1;
    o.v.onLock((p) => { if (p === 'user-removed') wChwiliBlokady = log(o).length; });
    const z = log(o).length;
    expect(await doczekaj(usun(o), 'removeUser')).toEqual(OK);
    await czekajNa(() => wpisyOd(o, z, 'delete-success', DZIENNIK(X)).length > 0, `kasowanie ${DZIENNIK('<X>')}`);
    await o.cisza();
    const l = log(o);
    const kasowanie = l.findIndex((w, i) => i >= z && w[0] === 'deleteDatabase' && w[1] === DZIENNIK(X));
    const rejestr = l.findIndex((w, i) => i >= z && w[0] === 'tx' && w[1] === REJESTR && w[3] === 'readwrite' && w[4] === 'start');
    expect({ poUsunieciuWpisu: rejestr >= z && kasowanie > rejestr, poBlokadzie: wChwiliBlokady >= 0 && kasowanie >= wChwiliBlokady })
      .toEqual({ poUsunieciuWpisu: true, poBlokadzie: true });
  }, 30_000);

  it('UK28: „Usuń konto” w trybie „Zaloguj jednorazowo” — jedna lista baz (jak K6j w sync-dziennik-konto.test.mjs), bez otwarć i kasowań vilda_audit_v1_*, bez zapisów vilda-audit-delete-v1:*', async () => {
    const o = await nowe({ jednorazowo: true });
    const z = o.znacznik();
    expect(await usun(o)).toEqual(OK);
    await o.cisza();
    expect({ databases: wpisyOd(o, z.log, 'databases').length, open: wpisyOd(o, z.log, 'open', /^vilda_audit_v1_/).length, deleteDatabase: wpisyOd(o, z.log, 'deleteDatabase', /^vilda_audit_v1_/).length })
      .toEqual({ databases: 1, open: 0, deleteDatabase: 0 });
    expect(o.dziennik.slice(z.dziennik).filter((x) => String(x.klucz).startsWith(PRZEDROSTEK_ZNACZNIKA_DZIENNIKA)), 'zapisy znaczników ponowienia').toEqual([]);
  }, 30_000);
});

describe('ustawienia kopii konta przy „Usuń konto”', () => {
  const ustawienia = (X, Y) => ({
    folderHandlesByUser: [{ userId: X, handle: { name: 'Fikcyjny folder X' } }, { userId: Y, handle: { name: 'Fikcyjny folder Y' } }],
    preferencesByUser: [
      { userId: X, autoBackupIntervalMin: 15, lastVaultBackupAtISO: '2026-03-02T08:00:00.000Z', lastVaultBackupFilename: 'fikcyjna-kopia-x' },
      { userId: Y, autoBackupIntervalMin: 30, lastVaultBackupAtISO: '2026-03-02T09:00:00.000Z', lastVaultBackupFilename: 'fikcyjna-kopia-y' },
    ],
  });
  const klucze = (o, sklep) => { const b = o.idb.__atrapa.bazy()[USTAWIENIA]; return b ? b.sklepy[sklep].klucze : []; };
  // Uchwyt folderu (File System Access): klonowalny jak FileSystemDirectoryHandle, uprawnienie do zapisu przyznane.
  class FikcyjnyFolder {
    constructor() { this.kind = 'directory'; this.name = 'Fikcyjny folder kopii'; }
    async queryPermission() { return 'granted'; }
    async requestPermission() { return 'granted'; }
  }

  it('UK29 (a): wpisy X i Y w obu magazynach ustawień eksportu — po usunięciu X ustawienia kopii tego konta usunięte, innych kont bez zmian; baza ustawień eksportu jest', async () => {
    const o = await nowe({ konta: 'AB' });
    const X = o.A.userId;
    const Y = o.B.userId;
    o.idb.__atrapa.utworz(USTAWIENIA, 1, SCHEMAT_USTAWIEN, ustawienia(X, Y));
    expect(await doczekaj(usun(o), 'removeUser')).toEqual(OK);
    await o.cisza();
    expect(bazy(o), 'baza ustawień eksportu wszystkich kont').toContain(USTAWIENIA);
    expect({ folder: klucze(o, 'folderHandlesByUser'), preferencje: klucze(o, 'preferencesByUser') }, 'ustawienia kopii tego konta usunięte, innych kont bez zmian')
      .toEqual({ folder: [Y], preferencje: [Y] });
  }, 30_000);

  it.each([['z listą baz', {}], ['bez listy baz (przeglądarka bez databases())', { databases: false }]])('UK29 (b): bez bazy ustawień eksportu, %s — „Usuń konto” jej nie zakłada', async (_n, opcje) => {
    const o = await nowe(opcje);
    expect(bazy(o), 'przed usunięciem').not.toContain(USTAWIENIA);
    expect(await doczekaj(usun(o), 'removeUser')).toEqual(OK);
    await o.cisza();
    expect(bazy(o), 'po usunięciu').not.toContain(USTAWIENIA);
  }, 30_000);

  it('UK29 (c): karta B zalogowana na X zmienia interwał auto-kopii, otwarcie bazy przy zapisie preferencji wstrzymane; A usuwa X (B zablokowana), zwolnienie — od blokady B bez zapisu preferencji karty B; ustawień kopii X brak', async () => {
    const o = await nowe();
    const X = o.A.userId;
    const o2 = await drugie(o, { zaloguj: 'A', skrypty: SKRYPTY_EKSPORTU });
    const u = { h: null };
    o.idb.__atrapa.hak({ przy: 'success', baza: USTAWIENIA, sklep: 'preferencesByUser', metoda: 'get' }, () => { u.h = wstrzymaj(o, { przy: 'open', baza: USTAWIENIA }); });
    const pB = wynik(o2.win.VildaFileExport.setAutoBackupInterval(15));
    await czekajNa(() => u.h && u.h.osiagniety, 'otwarcie bazy ustawień przy zapisie preferencji w karcie B');
    let odBlokady = -1;
    o2.v.onLock(() => { if (odBlokady < 0) odBlokady = log(o).length; });
    const pA = usun(o);
    await czekajNa(() => odBlokady >= 0, 'blokada karty B');
    u.h.zwolnij();
    expect(await doczekaj(pA, 'removeUser w karcie A')).toEqual(OK);
    await doczekaj(pB, 'zmiana interwału auto-kopii w karcie B');
    await o.cisza();
    await o2.cisza();
    const zapisyB = log(o).slice(odBlokady).filter((w) => w[0] === 'tx' && w[1] === USTAWIENIA && w[3] === 'readwrite' && w[4] === 'start' && w[2].length === 1 && w[2][0] === 'preferencesByUser');
    expect(zapisyB, 'zapisy preferencji karty B od jej blokady').toEqual([]);
    expect(klucze(o, 'preferencesByUser'), 'ustawienia kopii konta X').not.toContain(X);
  }, 30_000);

  it('UK29 (d): karta B zalogowana na X wybiera folder kopii (wybór trwa do blokady B), A usuwa X — wybór odrzucony tekstem „zaloguj się przed wyborem folderu kopii”, folderu X brak', async () => {
    const o = await nowe();
    const X = o.A.userId;
    let wybierz;
    const wybor = new Promise((r) => { wybierz = r; });
    const o2 = await drugie(o, { zaloguj: 'A', skrypty: SKRYPTY_EKSPORTU, pola: { showDirectoryPicker: () => wybor } });
    expect(o2.win.VildaFileExport.SUPPORTS_FSA, 'wybór folderu dostępny w karcie B').toBe(true);
    const pB = wynik(o2.win.VildaFileExport.setFolderForCurrentUser());
    const lB = blokady(o2);
    const pA = usun(o);
    await czekajNa(() => lB.length > 0, 'blokada karty B');
    wybierz(new FikcyjnyFolder());
    const wB = await doczekaj(pB, 'wybór folderu kopii w karcie B');
    expect(await doczekaj(pA, 'removeUser w karcie A')).toEqual(OK);
    await o.cisza();
    await o2.cisza();
    expect({ ok: wB.ok, tekst: /zaloguj się przed wyborem folderu kopii/.test(String(wB.komunikat || '')) }, 'wybór folderu po blokadzie karty B').toEqual({ ok: false, tekst: true });
    expect(klucze(o, 'folderHandlesByUser'), 'folder kopii konta X').not.toContain(X);
  }, 30_000);

  it('UK29 (e): otwarcie bazy ustawień eksportu przy usuwaniu wpisów konta wstrzymane — „Usuń konto” czeka najwyżej do limitu 2 s i kończy bez błędu', async () => {
    const o = await nowe({ konta: 'AB', skrypty: SKRYPTY_EKSPORTU });
    o.idb.__atrapa.utworz(USTAWIENIA, 1, SCHEMAT_USTAWIEN, ustawienia(o.A.userId, o.B.userId));
    const h = wstrzymaj(o, { przy: 'open', baza: USTAWIENIA });
    let koniec = false;
    const p = usun(o).finally(() => { koniec = true; });
    await doczekaj(h.czeka, 'otwarcie bazy ustawień eksportu przy usuwaniu wpisów konta');
    await doczekaj(o.timery.czekajNa((t) => t.ms === 2000), 'limit 2 s kasowania wpisów ustawień kopii');
    await o.spokoj();
    expect(koniec, '„Usuń konto” przed limitem').toBe(false);
    expect(o.timery.odpal((t) => t.ms === 2000), 'odpalone zegary 2000 ms').toBeGreaterThan(0);
    expect(await doczekaj(p, 'removeUser po limicie')).toEqual(OK);
    h.zwolnij();
    await o.cisza();
  }, 30_000);
});

describe('karta odświeżona albo odtworzona po usunięciu konta w innej karcie', () => {
  it('UK30: karta zalogowana na X zamknięta przed usunięciem, X usunięte w innej karcie, karta wczytana od nowa z jej sessionStorage — tryRestoreSession() false, powód user-removed-elsewhere, znacznik karty z identyfikatorem konta, bez klucza sesji', async () => {
    const o = await nowe();
    const X = o.A.userId;
    const sesja = kopiaSesji(o);
    o.zablokuj();
    const o2 = await drugie(o, { zaloguj: null });
    expect(await doczekaj(usun(o2), 'removeUser w innej karcie')).toEqual(OK);
    await o2.cisza();
    const o3 = await drugie(o, { zaloguj: null, sesja });
    expect(await wynik(o3.v.tryRestoreSession())).toEqual({ ok: true, w: false });
    await o3.cisza();
    expect(await powod(o3), 'powód blokady karty wczytanej od nowa').toBe('user-removed-elsewhere');
    expect({ znacznik: znacznikKarty(sesja), klucz: sesja.getItem(SESJA) }).toEqual({ znacznik: { v: 1, userId: X }, klucz: null });
  }, 30_000);

  it('UK30 (wariant): baza sejfu X skasowana narzędziami przeglądarki, karta zalogowana na X wczytana od nowa — tryRestoreSession() false, powód user-removed-elsewhere, lista kont tej karty bez X', async () => {
    const o = await nowe({ konta: 'AB' });
    const X = o.A.userId;
    const sesja = kopiaSesji(o);
    o.zablokuj();
    await kasujBaze(o.idb, BAZA(X));
    await o.cisza();
    const o3 = await drugie(o, { zaloguj: null, sesja });
    expect(await wynik(o3.v.tryRestoreSession())).toEqual({ ok: true, w: false });
    await o3.cisza();
    expect(id(await o3.v.listUsers()), 'lista kont karty').toEqual([o.B.userId]);
    expect(await powod(o3), 'powód blokady').toBe('user-removed-elsewhere');
  }, 30_000);

  it('UK31: karta B zalogowana na X, A usuwa X — w chwili powiadomienia o blokadzie znacznik karty w sessionStorage B; karta wczytana od nowa z tym sessionStorage (bez klucza) — powód user-removed-elsewhere, przy kolejnym odświeżeniu tak samo', async () => {
    const o = await nowe();
    const X = o.A.userId;
    const o2 = await drugie(o, { zaloguj: 'A' });
    const wChwiliBlokady = [];
    o.v.onLock(() => { wChwiliBlokady.push(o.win.sessionStorage.getItem(ZNACZNIK_KARTY)); });
    expect(await doczekaj(usun(o2), 'removeUser w karcie A')).toEqual(OK);
    await o.cisza();
    await o2.cisza();
    expect(wChwiliBlokady.map((t) => (t === null ? null : JSON.parse(t))), 'znacznik karty w chwili powiadomienia o blokadzie').toEqual([{ v: 1, userId: X }]);
    for (const nr of [1, 2]) {
      const ox = await drugie(o, { zaloguj: null, sesja: o.win.sessionStorage });
      expect(await wynik(ox.v.tryRestoreSession())).toEqual({ ok: true, w: false });
      expect(await powod(ox), `powód blokady po ${nr}. odświeżeniu`).toBe('user-removed-elsewhere');
    }
  }, 30_000);

  // Karta B zablokowana przez versionchange, a kasowanie bazy sejfu X w A czeka na połączenie karty ze starszą wersją.
  async function czekajaceKasowanie() {
    const o = await nowe({ konta: 'AB' });
    const X = o.A.userId;
    const o2 = await drugie(o, { zaloguj: 'A' });
    const obce = await otworzSurowo(o.idb, BAZA(X));
    const lB = blokady(o);
    const p = usun(o2);
    await czekajNa(() => lB.length > 0 && wpisyOd(o, 0, 'blocked', BAZA(X)).length > 0, 'blokada karty B i czekające kasowanie bazy sejfu');
    expect(await czytajRekord(o.idb, REJESTR, 'users', X), 'wpis rejestru w trakcie czekającego kasowania').toBeTruthy();
    expect(stanCyklu(o, X), 'znacznik cyklu konta w trakcie usuwania').toBe('removing');
    return { o, X, Y: o.B.userId, obce, p };
  }

  it('UK31b: karta B z banerem odświeżona w trakcie czekającego kasowania bazy sejfu X — lista kont tej karty bez X, powód user-removed-elsewhere', async () => {
    const { o, Y, obce, p } = await czekajaceKasowanie();
    const o3 = await drugie(o, { zaloguj: null, sesja: o.win.sessionStorage });
    const odtworzenie = await wynik(o3.v.tryRestoreSession());
    const lista = id(await o3.v.listUsers());
    const powodBlokady = await powod(o3);
    obce.close();
    expect(await doczekaj(p, 'removeUser w karcie A')).toEqual(OK);
    expect({ odtworzenie, lista, powodBlokady }).toEqual({ odtworzenie: { ok: true, w: false }, lista: [Y], powodBlokady: 'user-removed-elsewhere' });
  }, 30_000);

  it('UK31b (wariant): jak UK31b, ale stan jak po nieudanym usuwaniu (znacznik cyklu konta zdjęty) — odświeżona karta B pokazuje X, bez banera', async () => {
    const { o, X, Y, obce, p } = await czekajaceKasowanie();
    o.win.localStorage.removeItem(CYKL(X));
    const o3 = await drugie(o, { zaloguj: null, sesja: o.win.sessionStorage });
    const odtworzenie = await wynik(o3.v.tryRestoreSession());
    const lista = id(await o3.v.listUsers()).sort();
    const powodBlokady = await powod(o3);
    obce.close();
    expect(await doczekaj(p, 'removeUser w karcie A')).toEqual(OK);
    expect({ odtworzenie, lista, powodBlokady }).toEqual({ odtworzenie: { ok: true, w: false }, lista: [X, Y].sort(), powodBlokady: null });
  }, 30_000);

  it.each([['manual'], ['idle'], ['user']])('UK32 (a): blokada %s, potem karta wczytana od nowa — bez banera i bez znacznika karty', async (p) => {
    const o = await nowe();
    o.zablokuj(p);
    await o.cisza();
    expect({ powod: await powod(o), znacznik: o.win.sessionStorage.getItem(ZNACZNIK_KARTY) }).toEqual({ powod: p, znacznik: null });
    const o3 = await drugie(o, { zaloguj: null, sesja: o.win.sessionStorage });
    expect(await wynik(o3.v.tryRestoreSession())).toEqual({ ok: true, w: false });
    expect({ powod: await powod(o3), znacznik: o.win.sessionStorage.getItem(ZNACZNIK_KARTY) }).toEqual({ powod: null, znacznik: null });
  }, 30_000);

  it('UK32 (b): wygasła sesja konta, które istnieje — bez banera i bez znacznika karty, klucz sesji zdjęty', async () => {
    const o = await nowe();
    const sesja = kopiaSesji(o, { wygasla: true });
    const o3 = await drugie(o, { zaloguj: null, sesja });
    expect(await wynik(o3.v.tryRestoreSession())).toEqual({ ok: true, w: false });
    expect({ powod: await powod(o3), znacznik: sesja.getItem(ZNACZNIK_KARTY), klucz: sesja.getItem(SESJA) }).toEqual({ powod: null, znacznik: null, klucz: null });
  }, 30_000);

  it('UK32 (c): „Usuń konto” w tej karcie — powód user-removed, bez znacznika karty; karta wczytana od nowa — bez banera', async () => {
    const o = await nowe();
    expect(await doczekaj(usun(o), 'removeUser')).toEqual(OK);
    await o.cisza();
    expect({ powod: await powod(o), znacznik: o.win.sessionStorage.getItem(ZNACZNIK_KARTY) }).toEqual({ powod: 'user-removed', znacznik: null });
    const o3 = await drugie(o, { zaloguj: null, sesja: o.win.sessionStorage });
    expect(await wynik(o3.v.tryRestoreSession())).toEqual({ ok: true, w: false });
    expect(await powod(o3)).toBe(null);
  }, 30_000);

  it('UK32 (d): znacznik karty dla konta, które istnieje i nie jest w trakcie usuwania — bez banera, konto na liście, znacznik bez zmian', async () => {
    const o = await nowe({ zaloguj: null });
    const X = o.A.userId;
    const sesja = magazynSesji({ [ZNACZNIK_KARTY]: JSON.stringify({ v: 1, userId: X }) });
    const o3 = await drugie(o, { zaloguj: null, sesja });
    expect(await wynik(o3.v.tryRestoreSession())).toEqual({ ok: true, w: false });
    expect({ powod: await powod(o3), lista: id(await o3.v.listUsers()), znacznik: znacznikKarty(sesja) }).toEqual({ powod: null, lista: [X], znacznik: { v: 1, userId: X } });
  }, 30_000);

  it('UK32 (e): logowanie w toku w karcie B (wstrzymane na odszyfrowaniu), A usuwa X — odmowa ACCOUNT_REMOVED, powód user-removed, bez znacznika karty', async () => {
    const o = await nowe();
    const X = o.A.userId;
    const o2 = await drugie(o, { zaloguj: null });
    const h = wstrzymajKrypto(o2, { metoda: 'decrypt' });
    const pB = wynik(o2.v.unlockUser(X, o.A.haslo));
    await doczekaj(h.osiagnieta, 'odszyfrowanie w karcie B');
    const pA = usun(o);
    await czekajNa(() => wpisyOd(o, 0, 'versionchange', BAZA(X)).length > 0, `versionchange ${BAZA('<X>')}`);
    h.zwolnij();
    const wB = await doczekaj(pB, 'logowanie w karcie B');
    expect(await doczekaj(pA, 'removeUser w karcie A')).toEqual(OK);
    await o.cisza();
    await o2.cisza();
    expect({ kod: wB.kod, powod: await powod(o2), znacznik: o2.win.sessionStorage.getItem(ZNACZNIK_KARTY) }).toEqual({ kod: 'ACCOUNT_REMOVED', powod: 'user-removed', znacznik: null });
  }, 30_000);

  it('UK33 (1): znacznik karty wpisany w sessionStorage — zalogowanie w tej karcie go zdejmuje', async () => {
    const o = await nowe({ zaloguj: null });
    o.win.sessionStorage.setItem(ZNACZNIK_KARTY, JSON.stringify({ v: 1, userId: o.A.userId }));
    await o.zaloguj('A');
    expect(o.win.sessionStorage.getItem(ZNACZNIK_KARTY), 'znacznik karty po zalogowaniu').toBe(null);
  }, 30_000);

  it('UK33 (2): znacznik karty wpisany w sessionStorage — założenie konta w tej karcie go zdejmuje', async () => {
    const o = await nowe({ zaloguj: null });
    o.win.sessionStorage.setItem(ZNACZNIK_KARTY, JSON.stringify({ v: 1, userId: o.A.userId }));
    await o.v.createUser('Fikcyjne#Nowe!Konto2026nk', { label: 'Fikcyjne nowe konto', iterations: 1000 });
    await o.tlo();
    expect(o.win.sessionStorage.getItem(ZNACZNIK_KARTY), 'znacznik karty po założeniu konta').toBe(null);
  }, 30_000);

  it('UK33 (3): znacznik karty obok zapisu sesji — odtworzenie sesji go zdejmuje', async () => {
    const o = await nowe();
    const sesja = kopiaSesji(o);
    sesja.setItem(ZNACZNIK_KARTY, JSON.stringify({ v: 1, userId: o.A.userId }));
    const o3 = await drugie(o, { zaloguj: null, sesja });
    expect(await wynik(o3.v.tryRestoreSession())).toEqual({ ok: true, w: true });
    await o3.tlo();
    expect(sesja.getItem(ZNACZNIK_KARTY), 'znacznik karty po odtworzeniu sesji').toBe(null);
  }, 30_000);

  it('UK33 (4): bez znacznika karty — zalogowanie bez usuwania klucza znacznika z sessionStorage', async () => {
    const o = await nowe({ zaloguj: null });
    const z = o.dziennik.length;
    await o.zaloguj('A');
    expect(o.dziennik.slice(z).filter((x) => x.magazyn === 'sessionStorage' && x.klucz === ZNACZNIK_KARTY), 'operacje na kluczu znacznika karty').toEqual([]);
  }, 30_000);

  it('UK34: wygasły zapis sesji trybu „Zaloguj jednorazowo” konta, którego nie ma — bez odczytu rejestru kont, bez banera i bez znacznika karty', async () => {
    const o = await nowe({ zaloguj: null });
    const sesja = magazynSesji({
      [SESJA]: JSON.stringify({ v: 2, userId: BEZ_KONTA, keyB64: Buffer.alloc(32, 7).toString('base64'), label: 'Fikcyjne konto jednorazowe', expiresAtISO: przeszlosc() }),
      [SESJA_JEDNORAZOWA]: '1',
    });
    const o3 = await drugie(o, { zaloguj: null, sesja });
    const z = log(o).length;
    expect(await wynik(o3.v.tryRestoreSession())).toEqual({ ok: true, w: false });
    await o3.cisza();
    expect(log(o).slice(z).filter((w) => w[1] === REJESTR), 'odczyty rejestru kont').toEqual([]);
    expect({ znacznik: sesja.getItem(ZNACZNIK_KARTY), powod: await powod(o3) }).toEqual({ znacznik: null, powod: null });
  }, 30_000);

  it('UK35: wygasła sesja X, a X w tym czasie usunięte w innej karcie — tryRestoreSession() false, powód user-removed-elsewhere, znacznik karty', async () => {
    const o = await nowe();
    const X = o.A.userId;
    const sesja = kopiaSesji(o, { wygasla: true });
    expect(await doczekaj(usun(o), 'removeUser w innej karcie')).toEqual(OK);
    await o.cisza();
    const o3 = await drugie(o, { zaloguj: null, sesja });
    expect(await wynik(o3.v.tryRestoreSession())).toEqual({ ok: true, w: false });
    expect({ powod: await powod(o3), znacznik: znacznikKarty(sesja), klucz: sesja.getItem(SESJA) }).toEqual({ powod: 'user-removed-elsewhere', znacznik: { v: 1, userId: X }, klucz: null });
  }, 30_000);

  it('UK36: karta zalogowana na X bez połączenia z bazą sejfu (po wymuszonym zamknięciu), baza X skasowana, powrót strony z pamięci przeglądarki (pageshow, persisted) — blokada user-removed-elsewhere, znacznik karty', async () => {
    const o = await nowe({ zdarzenia: true });
    const X = o.A.userId;
    o.idb.__atrapa.wymusZamkniecie(BAZA(X));
    await o.cisza();
    expect(polaczenia(o, BAZA(X)), 'połączenia z bazą sejfu po wymuszonym zamknięciu').toBe(0);
    const lA = blokady(o);
    await kasujBaze(o.idb, BAZA(X));
    await o.cisza();
    expect(lA, 'blokady przed pokazaniem strony').toEqual([]);
    await pokazStrone(o, true);
    expect({ lA, znacznik: znacznikKarty(o.win.sessionStorage) }).toEqual({ lA: ['user-removed-elsewhere'], znacznik: { v: 1, userId: X } });
  }, 30_000);

  it.each([
    ['zwykłe pokazanie strony (persisted false), baza X skasowana', { persisted: false, kasuj: true }],
    ['powrót z pamięci przeglądarki, baza X jest', { persisted: true, kasuj: false }],
    ['tryb „Zaloguj jednorazowo”, powrót z pamięci przeglądarki', { persisted: true, kasuj: false, jednorazowo: true }],
  ])('UK36 (wariant): %s — bez blokady', async (_n, { persisted, kasuj, jednorazowo }) => {
    const o = await nowe({ zdarzenia: true, jednorazowo: !!jednorazowo });
    const X = o.A.userId;
    o.idb.__atrapa.wymusZamkniecie(BAZA(X));
    await o.cisza();
    const lA = blokady(o);
    if (kasuj) await kasujBaze(o.idb, BAZA(X));
    await o.cisza();
    await pokazStrone(o, persisted);
    expect({ lA, odblokowane: o.v.isUnlocked() }).toEqual({ lA: [], odblokowane: true });
  }, 30_000);
});

// ── Ekran logowania: wycinek vilda_auth_ui.js ────────────────────────────────────────────────────────────────────────
// Od pierwszej deklaracji pamięci i funkcji odświeżenia listy kont (przed ekranem startowym me) do formularza
// zakładania konta (mn): baner startu, rejestracja odświeżenia, odświeżenie listy kont, me, ar, nr — z atrapami DOM
// (tests/support/atrapa-dom-lekka.mjs), sejfu i funkcji pomocniczych modułu; reszta modułu niewołana.
function ekranLogowania({ bezSluchacza = false } = {}) {
  const src = zrodlo('vilda_auth_ui.js');
  const doMe = src.indexOf('async function me(');
  const doMn = src.indexOf('function mn(', doMe);
  const pozycje = ['let Bkr_widoczne', 'function Bkr_banerStartu(', 'function Bkr_sluchaj(', 'function Bkr_odswiez('].map((t) => {
    const p = src.indexOf(t);
    return p >= 6 && src.slice(p - 6, p) === 'async ' ? p - 6 : p;
  });
  if (doMe < 0 || doMn < 0 || pozycje.some((p) => p < 0 || p > doMe)) {
    throw new Error('vilda_auth_ui.js: brak pamięci ostatnio narysowanej listy kont, banera startu albo odświeżenia listy kont przed ekranem startowym');
  }
  const doc = atrapaDokumentu();
  const e = (tag, a, n) => {
    const r = doc.createElement(tag);
    r.style = {};
    for (const k of Object.keys(a || {})) {
      if (k === 'class') r.className = a[k];
      else if (k === 'text') r.textContent = a[k];
      else if (k === 'html') r.innerHTML = a[k];
      else if (k.indexOf('on') === 0 && typeof a[k] === 'function') r.addEventListener(k.substring(2), a[k]);
      else r.setAttribute(k, a[k]);
    }
    for (const d of n == null ? [] : Array.isArray(n) ? n : [n]) {
      if (d == null) continue;
      if (typeof d === 'string') { const t = doc.createElement('span'); t.style = {}; t.textContent = d; r.appendChild(t); } else r.appendChild(d);
    }
    return r;
  };
  const Rt = e('div', { id: 'vilda-auth-ui-root', class: 'vilda-auth-root', 'aria-live': 'polite' });
  Rt.style.display = 'none';
  doc.body.appendChild(Rt);
  const ekrany = [];
  // Rysowanie ekranu jak Zt modułu: korzeń czyszczony, nakładka > karta > [marka, ekran], korzeń widoczny.
  const Zt = (ekran) => {
    ekrany.push(ekran);
    while (Rt.firstChild) Rt.removeChild(Rt.firstChild);
    const karta = e('div', { class: 'vilda-auth-card', role: 'dialog' }, [e('div', { class: 'vilda-auth-brand' }), ekran]);
    Rt.appendChild(e('div', { class: 'vilda-auth-overlay' }, [karta]));
    Rt.style.display = 'block';
  };
  const stan = { odblokowany: false, konta: [], odpowiedzi: [] };
  const wywolania = { listUsers: 0, qa: [], Ji: 0, Ot: [] };
  const sluchaczeUsuniecia = [];
  const sejf = {
    isUnlocked: () => stan.odblokowany,
    listUsers: () => { wywolania.listUsers += 1; const o = stan.odpowiedzi.shift(); return o ? o.p : Promise.resolve(stan.konta.slice()); },
    onLock() {},
    onUnlock() {},
  };
  if (!bezSluchacza) sejf.onAccountRemovedElsewhere = (f) => { sluchaczeUsuniecia.push(f); };
  const zdarzeniaOkna = [];
  const okno = {
    document: doc,
    addEventListener: (typ, f) => { zdarzeniaOkna.push([typ, f]); },
    removeEventListener() {},
    getComputedStyle: (el) => ({ display: (el.style && el.style.display) || 'block' }),
  };
  const nic = () => {};
  const wycinek = `${src.slice(Math.min(...pozycje), doMn)}\nreturn { me, nr, ar, Bkr_banerStartu, Bkr_sluchaj, Bkr_odswiez, widoczne: () => Bkr_widoczne };`;
  const f = new Function('i', 'e', 'Zt', 'jt', 'Rt', 'Xi', 'Ji', 'pn', 'ma', 'qa', 'fn', 'Ot', 'No', 'Jn', 'mn', 'Re', 'Aa', '$t', 'na', 'Ze', 'qn', 'Gt', wycinek)(
    okno, e, Zt, () => sejf, Rt, () => Rt, () => { wywolania.Ji += 1; }, nic, nic, (x) => { wywolania.qa.push(x); }, nic,
    (...a) => { wywolania.Ot.push(a); }, nic, nic, nic, nic, nic, nic, () => '', () => '', nic, nic,
  );
  // Odpowiedź listUsers wstrzymana do rozstrzygnij(lista).
  const odroczona = () => { let rozstrzygnij; const p = new Promise((r) => { rozstrzygnij = r; }); stan.odpowiedzi.push({ p }); return (lista) => rozstrzygnij(lista.slice()); };
  const wszystkie = (x) => [x, ...x.children.flatMap(wszystkie)];
  const opis = (ekran) => {
    const el = wszystkie(ekran);
    return {
      klasa: ['vilda-auth-picker', 'vilda-auth-startup', 'vilda-auth-login', 'vilda-auth-setup'].find((k) => ekran.classList.contains(k)) || ekran.className,
      banery: el.filter((y) => y.classList.contains('vilda-auth-banner')).map((y) => y.textContent),
      konta: el.filter((y) => y.classList.contains('vilda-auth-user-name')).map((y) => y.textContent),
    };
  };
  return { ...f, doc, Rt, Zt, e, stan, wywolania, ekrany, sluchaczeUsuniecia, zdarzeniaOkna, odroczona, opis, wszystkie };
}
const konto = (n) => ({ userId: `fikcyjne-konto-${n}`, label: `Fikcyjne konto ${n}`, passkeyCount: 0 });
const KONTO_X = konto('x');
const KONTO_Y = konto('y');
const KONTO_Z = konto('z');
const chwila = async (n = 5) => { for (let i = 0; i < n; i += 1) await makrozadanie(); };

describe('baner ekranu startowego (vilda_auth_ui.js)', () => {
  it('UK37: baner startu — tekst „Konto zostało usunięte z tej przeglądarki.” tylko dla karty bez sesji z powodem user-removed-elsewhere', () => {
    const w = ekranLogowania();
    const baner = (s) => { const t = w.Bkr_banerStartu(s); return typeof t === 'string' && t ? t : null; };
    expect(baner({ currentUser: null, lockReason: 'user-removed-elsewhere' })).toBe(TEKST_BANERA);
    expect([
      baner({ currentUser: null, lockReason: 'manual' }),
      baner({ currentUser: null, lockReason: 'idle' }),
      baner({ currentUser: null, lockReason: null }),
      baner({ currentUser: { userId: KONTO_X.userId, label: KONTO_X.label }, lockReason: 'user-removed-elsewhere' }),
      baner(null),
    ]).toEqual([null, null, null, null, null]);
  });
});

describe('ogłoszenie usunięcia konta innym dokumentom (BroadcastChannel vilda-konta)', () => {
  // Para okien na wspólnej szynie: A (usuwa) i B (bez sesji) ze słuchaczami ogłoszenia usunięcia konta.
  async function paraZeSluchaczami(opcje = {}) {
    const o = await nowe({ zdarzenia: true, konta: 'AB', ...opcje });
    const o2 = await drugie(o, { zdarzenia: true, zaloguj: null });
    const s = { a: 0, b: 0, listy: [] };
    o.v.onAccountRemovedElsewhere(() => { s.a += 1; });
    o2.v.onAccountRemovedElsewhere(() => { s.b += 1; s.listy.push(o2.v.listUsers()); });
    return { o, o2, s };
  }
  const bezMetadanych = async (o) => {
    await wpisRejestru(o, BEZ_KONTA, { label: 'Fikcyjne konto bez metadanych', createdAtISO: '2026-03-02T08:00:00.000Z', storageMode: 'local', passkeyCount: 0 });
    return () => wynik(o.v.removeUser(BEZ_KONTA, ''));
  };

  it('UK38 (a): „Usuń konto” X w A — słuchacz w B dokładnie raz, w A ani razu; lista kont B czytana w słuchaczu bez X', async () => {
    const { o, o2, s } = await paraZeSluchaczami();
    const X = o.A.userId;
    expect(await doczekaj(usun(o), 'removeUser w karcie A')).toEqual(OK);
    await czekajNa(() => s.b > 0, 'ogłoszenie usunięcia konta w karcie B');
    await o.spokoj();
    await o2.spokoj();
    expect({ a: s.a, b: s.b }).toEqual({ a: 0, b: 1 });
    expect(id(await s.listy[0]), 'lista kont B w słuchaczu').not.toContain(X);
  }, 30_000);

  it('UK38 (b): konto bez metadanych usuwane w A — słuchacz w B dokładnie raz, lista kont B bez tego konta', async () => {
    const { o, o2, s } = await paraZeSluchaczami();
    const usunBez = await bezMetadanych(o);
    expect(await doczekaj(usunBez(), 'removeUser konta bez metadanych')).toEqual(OK);
    await czekajNa(() => s.b > 0, 'ogłoszenie usunięcia konta w karcie B');
    await o.spokoj();
    await o2.spokoj();
    expect({ a: s.a, b: s.b }).toEqual({ a: 0, b: 1 });
    expect(id(await s.listy[0])).not.toContain(BEZ_KONTA);
  }, 30_000);

  it.each([['zwykła'], ['konto bez metadanych']])('UK38 (c): gałąź %s — przy wstrzymanym usunięciu wpisu rejestru słuchacz w B niewołany; po zwolnieniu raz, lista bez konta', async (galaz) => {
    const { o, o2, s } = await paraZeSluchaczami();
    const uid = galaz === 'zwykła' ? o.A.userId : BEZ_KONTA;
    const usunKonto = galaz === 'zwykła' ? () => usun(o) : await bezMetadanych(o);
    const h = wstrzymaj(o, { przy: 'success', baza: REJESTR, sklep: 'users', metoda: 'delete' });
    const p = usunKonto();
    await doczekaj(h.czeka, 'usunięcie wpisu rejestru');
    await o2.spokoj();
    const wTrakcie = s.b;
    h.zwolnij();
    expect(await doczekaj(p, 'removeUser')).toEqual(OK);
    await czekajNa(() => s.b > 0, 'ogłoszenie usunięcia konta w karcie B');
    await o2.spokoj();
    expect({ wTrakcie, po: s.b }).toEqual({ wTrakcie: 0, po: 1 });
    expect(id(await s.listy[0])).not.toContain(uid);
  }, 30_000);

  it('UK38 (d): drugie „Usuń konto” X (już bez wpisu rejestru) — bez kolejnego ogłoszenia', async () => {
    const { o, o2, s } = await paraZeSluchaczami();
    const X = o.A.userId;
    expect(await doczekaj(usun(o), 'removeUser w karcie A')).toEqual(OK);
    await czekajNa(() => s.b > 0, 'ogłoszenie usunięcia konta w karcie B');
    expect(await doczekaj(wynik(o.v.removeUser(X, '')), 'drugie removeUser konta bez wpisu rejestru')).toEqual(OK);
    await o.cisza();
    await o2.spokoj();
    expect(s.b, 'ogłoszenia w karcie B').toBe(1);
  }, 30_000);

  it('UK39 (a): błąd kasowania bazy sejfu — bez ogłoszenia usunięcia konta', async () => {
    const o = await nowe({ zdarzenia: true });
    const o2 = await drugie(o, { zdarzenia: true, zaloguj: null });
    const k = kanalTestu(o2);
    o.idb.__atrapa.usterka({ przy: 'deleteDatabase', baza: BAZA(o.A.userId), blad: 'UnknownError' });
    const w = await doczekaj(usun(o), 'removeUser z błędem kasowania');
    await o.cisza();
    await o2.spokoj();
    expect({ ok: w.ok, komunikaty: k.komunikaty }).toEqual({ ok: false, komunikaty: [] });
  }, 30_000);

  it('UK39 (b): okno bez BroadcastChannel — „Usuń konto” działa', async () => {
    const o = await nowe();
    expect(typeof o.win.BroadcastChannel, 'BroadcastChannel w oknie').toBe('undefined');
    expect(await doczekaj(usun(o), 'removeUser')).toEqual(OK);
  }, 30_000);

  it('UK39 (c): konstruktor BroadcastChannel rzuca — sejf się ładuje, „Usuń konto” działa', async () => {
    class KanalZBledem { constructor() { throw new Error('Fikcyjny błąd kanału.'); } }
    const o = await nowe({ pola: { BroadcastChannel: KanalZBledem } });
    expect(typeof o.v.removeUser, 'sejf załadowany').toBe('function');
    expect(await doczekaj(usun(o), 'removeUser')).toEqual(OK);
  }, 30_000);

  it('UK39 (d): słuchacz ogłoszenia rzuca — kolejny słuchacz wołany, „Usuń konto” kończy', async () => {
    const o = await nowe({ zdarzenia: true });
    const o2 = await drugie(o, { zdarzenia: true, zaloguj: null });
    let drugi = 0;
    o2.v.onAccountRemovedElsewhere(() => { throw new Error('Fikcyjny błąd słuchacza.'); });
    o2.v.onAccountRemovedElsewhere(() => { drugi += 1; });
    expect(await doczekaj(usun(o), 'removeUser')).toEqual(OK);
    await czekajNa(() => drugi > 0, 'drugi słuchacz ogłoszenia w karcie B');
    await o2.spokoj();
    expect(drugi).toBe(1);
  }, 30_000);
});

describe('lista kont w kartach bez sesji (vilda_auth_ui.js)', () => {
  it('UK40 (1): „Kto się loguje?” [X, Y], z rejestru znika X — lista [Y] narysowana raz, z banerem, bez ekranu startowego me()', async () => {
    const w = ekranLogowania();
    w.nr([KONTO_X, KONTO_Y]);
    w.stan.konta = [KONTO_Y];
    await w.Bkr_odswiez();
    await chwila();
    expect(w.ekrany.map(w.opis)).toEqual([
      { klasa: 'vilda-auth-picker', banery: [], konta: [KONTO_X.label, KONTO_Y.label] },
      { klasa: 'vilda-auth-picker', banery: [TEKST_BANERA], konta: [KONTO_Y.label] },
    ]);
    expect({ me: w.wywolania.qa, Ji: w.wywolania.Ji }, 'ekran startowy me()').toEqual({ me: [], Ji: 0 });
  });

  it('UK40 (2): ta sama lista kont — bez ponownego rysowania', async () => {
    const w = ekranLogowania();
    w.nr([KONTO_X, KONTO_Y]);
    w.stan.konta = [KONTO_X, KONTO_Y];
    await w.Bkr_odswiez();
    await chwila();
    expect(w.ekrany.length, 'narysowane ekrany').toBe(1);
  });

  it.each([
    ['formularz logowania', (w) => { w.Zt(w.e('div', { class: 'vilda-auth-screen vilda-auth-login' })); }],
    ['zakładanie konta', (w) => { w.Zt(w.e('div', { class: 'vilda-auth-screen vilda-auth-setup' })); }],
    ['ekran zajęty (data-busy)', (w) => { w.Rt.setAttribute('data-busy', '1'); }],
    ['sejf odblokowany', (w) => { w.stan.odblokowany = true; }],
    ['korzeń ekranu logowania ukryty', (w) => { w.Rt.style.display = 'none'; }],
  ])('UK40 (3): %s — bez odświeżenia listy kont', async (_n, przygotuj) => {
    const w = ekranLogowania();
    w.nr([KONTO_X, KONTO_Y]);
    przygotuj(w);
    const narysowane = w.ekrany.length;
    w.stan.konta = [KONTO_Y];
    await w.Bkr_odswiez();
    await chwila();
    expect({ ekrany: w.ekrany.length - narysowane, listUsers: w.wywolania.listUsers }).toEqual({ ekrany: 0, listUsers: 0 });
  });

  it('UK40 (4): ekran podmieniony w trakcie odczytu listy kont — bez rysowania', async () => {
    const w = ekranLogowania();
    w.nr([KONTO_X, KONTO_Y]);
    const rozstrzygnij = w.odroczona();
    const p = w.Bkr_odswiez();
    await chwila();
    w.nr([KONTO_X, KONTO_Y]);
    rozstrzygnij([KONTO_Y]);
    await p;
    await chwila();
    expect(w.ekrany.length, 'narysowane ekrany (lista i ekran podmieniony)').toBe(2);
  });

  it('UK40 (5): na liście tylko dodane konto — baner bez zmian (brak albo baner z blokady)', async () => {
    const w = ekranLogowania();
    w.nr([KONTO_X]);
    w.stan.konta = [KONTO_X, KONTO_Z];
    await w.Bkr_odswiez();
    await chwila();
    const w2 = ekranLogowania();
    w2.nr([KONTO_X], TEKST_BANERA);
    w2.stan.konta = [KONTO_X, KONTO_Z];
    await w2.Bkr_odswiez();
    await chwila();
    expect([w.opis(w.ekrany.at(-1)), w2.opis(w2.ekrany.at(-1))]).toEqual([
      { klasa: 'vilda-auth-picker', banery: [], konta: [KONTO_X.label, KONTO_Z.label] },
      { klasa: 'vilda-auth-picker', banery: [TEKST_BANERA], konta: [KONTO_X.label, KONTO_Z.label] },
    ]);
  });

  it('UK40 (6): zniknęło jedyne konto — „Witamy” z banerem', async () => {
    const w = ekranLogowania();
    w.nr([KONTO_X]);
    w.stan.konta = [];
    await w.Bkr_odswiez();
    await chwila();
    expect(w.ekrany.length, 'narysowane ekrany').toBe(2);
    expect(w.opis(w.ekrany[1])).toEqual({ klasa: 'vilda-auth-startup', banery: [TEKST_BANERA], konta: [] });
  });

  it('UK40 (7): trzy wywołania w trakcie jednego odczytu listy — dwa odczyty listy kont (jedno powtórzenie po końcu), jedno rysowanie', async () => {
    const w = ekranLogowania();
    w.nr([KONTO_X, KONTO_Y]);
    const rozstrzygnij = w.odroczona();
    w.stan.konta = [KONTO_Y];
    const p = [w.Bkr_odswiez(), w.Bkr_odswiez(), w.Bkr_odswiez()];
    await chwila();
    rozstrzygnij([KONTO_Y]);
    await Promise.all(p);
    await chwila(20);
    expect({ listUsers: w.wywolania.listUsers, ekrany: w.ekrany.length }).toEqual({ listUsers: 2, ekrany: 2 });
  });

  it('UK40 (8): fokus na karcie konta Z, z listy znika X — po odświeżeniu fokus na karcie konta Z', async () => {
    const w = ekranLogowania();
    w.nr([KONTO_X, KONTO_Y, KONTO_Z]);
    const karty = w.wszystkie(w.ekrany[0]).filter((y) => y.classList.contains('vilda-auth-user-card'));
    karty[2].focus();
    w.stan.konta = [KONTO_Y, KONTO_Z];
    await w.Bkr_odswiez();
    await chwila();
    const aktywny = w.doc.activeElement;
    const nazwa = aktywny && w.wszystkie(aktywny).find((y) => y.classList.contains('vilda-auth-user-name'));
    expect({ ekrany: w.ekrany.length, wNowymEkranie: !!aktywny && w.ekrany[1].contains(aktywny), konto: nazwa ? nazwa.textContent : null })
      .toEqual({ ekrany: 2, wNowymEkranie: true, konto: KONTO_Z.label });
  });

  it('UK40 (9): rejestracja odświeżenia — ogłoszenie usunięcia konta i pageshow z persisted true wołają odświeżenie, pageshow z persisted false nie; sejf bez ogłoszeń — bez błędu', async () => {
    const w = ekranLogowania();
    w.nr([KONTO_X, KONTO_Y]);
    w.stan.konta = [KONTO_X, KONTO_Y];
    w.Bkr_sluchaj();
    const pokaz = w.zdarzeniaOkna.filter(([t]) => t === 'pageshow').map(([, f]) => f);
    expect({ sluchaczeUsuniecia: w.sluchaczeUsuniecia.length, pageshow: pokaz.length }).toEqual({ sluchaczeUsuniecia: 1, pageshow: 1 });
    pokaz[0]({ type: 'pageshow', persisted: false });
    await chwila();
    const poZwyklym = w.wywolania.listUsers;
    pokaz[0]({ type: 'pageshow', persisted: true });
    await chwila();
    const poPowrocie = w.wywolania.listUsers;
    w.sluchaczeUsuniecia[0]();
    await chwila();
    expect({ poZwyklym, poPowrocie, poOgloszeniu: w.wywolania.listUsers }).toEqual({ poZwyklym: 0, poPowrocie: 1, poOgloszeniu: 2 });
    const bez = ekranLogowania({ bezSluchacza: true });
    expect(() => bez.Bkr_sluchaj()).not.toThrow();
  });

  it('UK41: pamięć ostatnio narysowanej listy kont — po nr([X, Y]) [X, Y], po ar() []; karty kont bez atrybutu z identyfikatorem konta', () => {
    const w = ekranLogowania();
    w.nr([KONTO_X, KONTO_Y]);
    const poLiscie = w.widoczne();
    const atrybuty = w.wszystkie(w.ekrany[0]).flatMap((y) => [y.id, ...y.atrybuty.values()]);
    w.ar();
    expect({ poLiscie, poWitamy: w.widoczne() }).toEqual({ poLiscie: [KONTO_X.userId, KONTO_Y.userId], poWitamy: [] });
    expect(atrybuty.filter((a) => a === KONTO_X.userId || a === KONTO_Y.userId), 'identyfikatory kont w atrybutach ekranu').toEqual([]);
  });
});

describe('czekanie kasowania bazy sejfu', () => {
  it('UK42: połączenie z bazą sejfu X bez obsługi versionchange — po blocked słuchacz czekania [true], isRemoveUserWaiting() true; po zamknięciu połączenia [true, false], „Usuń konto” kończy', async () => {
    const o = await nowe();
    const X = o.A.userId;
    const stany = czekanie(o);
    const obce = await otworzSurowo(o.idb, BAZA(X));
    let koniec = false;
    const p = usun(o).finally(() => { koniec = true; });
    await czekajNa(() => wpisyOd(o, 0, 'blocked', BAZA(X)).length > 0, `blocked kasowania ${BAZA('<X>')}`);
    await o.spokoj();
    const wTrakcie = { stany: stany.slice(), czeka: o.v.isRemoveUserWaiting(), koniec };
    obce.close();
    expect(await doczekaj(p, 'removeUser po zamknięciu połączenia')).toEqual(OK);
    expect(wTrakcie).toEqual({ stany: [true], czeka: true, koniec: false });
    expect({ stany, czeka: o.v.isRemoveUserWaiting() }).toEqual({ stany: [true, false], czeka: false });
  }, 30_000);

  it('UK43: bez innych połączeń — słuchacz czekania niewołany; po końcu bez oczekujących zegarów 1000 ms i 2000 ms', async () => {
    const o = await nowe();
    const stany = czekanie(o);
    expect(await doczekaj(usun(o), 'removeUser')).toEqual(OK);
    await o.cisza();
    expect(stany).toEqual([]);
    expect(o.timery.oczekujace().filter((t) => t.ms === 1000 || t.ms === 2000), 'oczekujące zegary okna').toEqual([]);
  }, 30_000);

  it('UK44: kasowanie bazy sejfu stoi bez blocked (okno pytania w innej karcie) — przed progiem 1 s słuchacz niewołany; po progu [true]; po końcu [true, false]', async () => {
    const o = await nowe();
    const X = o.A.userId;
    const stany = czekanie(o);
    const h = wstrzymaj(o, { przy: 'deleteDatabase', baza: BAZA(X) });
    const p = usun(o);
    await doczekaj(h.czeka, 'kasowanie bazy sejfu konta');
    const przedProgiem = stany.slice();
    await doczekaj(o.timery.czekajNa((t) => t.ms === 1000), 'próg 1 s czekania kasowania bazy sejfu');
    expect(o.timery.odpal((t) => t.ms === 1000), 'odpalone zegary 1000 ms').toBeGreaterThan(0);
    const poProgu = { stany: stany.slice(), czeka: o.v.isRemoveUserWaiting() };
    h.zwolnij();
    expect(await doczekaj(p, 'removeUser')).toEqual(OK);
    expect({ przedProgiem, poProgu, po: stany }).toEqual({ przedProgiem: [], poProgu: { stany: [true], czeka: true }, po: [true, false] });
  }, 30_000);

  it('UK45: czekające kasowanie bazy sejfu kończy się błędem — [true, false]; „Usuń konto” odrzucone, isRemovingCurrentUser() false; baza sejfu i wpis rejestru X są', async () => {
    const o = await nowe();
    const X = o.A.userId;
    const stany = czekanie(o);
    const h = wstrzymaj(o, { przy: 'deleteDatabase', baza: BAZA(X) });
    o.idb.__atrapa.usterka({ przy: 'deleteDatabase', baza: BAZA(X), blad: 'UnknownError' });
    const p = usun(o);
    await doczekaj(h.czeka, 'kasowanie bazy sejfu konta');
    await doczekaj(o.timery.czekajNa((t) => t.ms === 1000), 'próg 1 s czekania kasowania bazy sejfu');
    o.timery.odpal((t) => t.ms === 1000);
    h.zwolnij();
    const w = await doczekaj(p, 'removeUser z błędem kasowania');
    await o.cisza();
    expect({ ok: w.ok, stany, usuwa: o.v.isRemovingCurrentUser(), czeka: o.v.isRemoveUserWaiting() }).toEqual({ ok: false, stany: [true, false], usuwa: false, czeka: false });
    expect(bazy(o), 'baza sejfu konta').toContain(BAZA(X));
    expect(await czytajRekord(o.idb, REJESTR, 'users', X), 'wpis rejestru konta').toBeTruthy();
  }, 30_000);

  it('UK46: druga karta tej wersji zalogowana na X — bez czekania (słuchacz niewołany)', async () => {
    const o = await nowe();
    await drugie(o, { zaloguj: 'A' });
    const stany = czekanie(o);
    expect(await doczekaj(usun(o), 'removeUser')).toEqual(OK);
    await o.cisza();
    expect(stany).toEqual([]);
  }, 30_000);

  it('UK47: wypisany słuchacz czekania niewołany; słuchacz rzucający nie zatrzymuje kolejnego; REMOVE_USER_WAITING_TEXT dosłownie', async () => {
    const o = await nowe();
    const X = o.A.userId;
    const s1 = [];
    const s3 = [];
    const wypisz = o.v.onRemoveUserWaiting((x) => s1.push(x));
    o.v.onRemoveUserWaiting(() => { throw new Error('Fikcyjny błąd słuchacza.'); });
    o.v.onRemoveUserWaiting((x) => s3.push(x));
    expect(typeof wypisz, 'funkcja wypisania').toBe('function');
    wypisz();
    const obce = await otworzSurowo(o.idb, BAZA(X));
    const p = usun(o);
    await czekajNa(() => wpisyOd(o, 0, 'blocked', BAZA(X)).length > 0, `blocked kasowania ${BAZA('<X>')}`);
    obce.close();
    expect(await doczekaj(p, 'removeUser')).toEqual(OK);
    expect({ s1, s3, tekst: o.v.REMOVE_USER_WAITING_TEXT }).toEqual({ s1: [], s3: [true, false], tekst: TEKST_CZEKANIA });
  }, 30_000);
});

describe('strażniki tekstowe: Ustawienia i powłoka przy czekającym usuwaniu konta', () => {
  // Najbardziej wewnętrzna nazwana funkcja pliku obejmująca pozycję (null — poza nazwaną funkcją).
  function funkcjaObejmujaca(src, poz) {
    let najlepsza = null;
    for (const m of src.matchAll(/(?:async\s+)?function\s+([\w$]+)\s*\(/g)) {
      if (m.index > poz) break;
      const tekst = wytnijFunkcje(src.slice(m.index), m[1]);
      if (m.index + tekst.length > poz && (!najlepsza || m.index > najlepsza.od)) najlepsza = { nazwa: m[1], od: m.index };
    }
    return najlepsza && najlepsza.nazwa;
  }
  // Wywołanie wewnątrz fragmentu: kod wprost we fragmencie albo wywołanie funkcji, która go zawiera.
  function wywolanaWe(src, poz, od, doPoz) {
    if (poz >= od && poz < doPoz) return true;
    const nazwa = funkcjaObejmujaca(src, poz);
    if (!nazwa) return false;
    return new RegExp(`(?<![\\w$.])${nazwa.replace(/\$/g, '\\$')}\\(`).test(src.slice(od, doPoz));
  }

  it('UK48 (a): inline_ustawienia_04.js — jedno dodanie i jedno zdjęcie słuchacza beforeunload; dodanie po potwierdzeniu „Usuń konto”, zdjęcie przed przejściem na index.html', () => {
    const src = zrodlo('inline_ustawienia_04.js');
    const dodania = [...src.matchAll(/addEventListener\(\s*["']beforeunload["']/g)].map((m) => m.index);
    const zdjecia = [...src.matchAll(/removeEventListener\(\s*["']beforeunload["']/g)].map((m) => m.index);
    expect({ dodania: dodania.length, zdjecia: zdjecia.length }, 'słuchacz beforeunload').toEqual({ dodania: 1, zdjecia: 1 });
    const potwierdzenie = src.indexOf('confirm("UWAGA \\u2014 wszystkie dane pacjent');
    const usuwanie = src.indexOf('.removeUser(', potwierdzenie);
    const przejscie = src.indexOf('location.replace("index.html")', usuwanie);
    expect({ potwierdzenie: potwierdzenie >= 0, usuwanie: usuwanie >= 0, przejscie: przejscie >= 0 }, 'obsługa „Usuń to konto”').toEqual({ potwierdzenie: true, usuwanie: true, przejscie: true });
    expect({ dodaniePoPotwierdzeniu: wywolanaWe(src, dodania[0], potwierdzenie, usuwanie), zdjeciePrzedPrzejsciem: wywolanaWe(src, zdjecia[0], usuwanie, przejscie) })
      .toEqual({ dodaniePoPotwierdzeniu: true, zdjeciePrzedPrzejsciem: true });
  });

  it('UK48 (b): vilda_shell.js — VildaShell.removeUserWaiting zmienia tylko tekst paska (bez stylów wpisywanych w JS)', () => {
    const src = zrodlo('vilda_shell.js');
    const m = /removeUserWaiting\s*:\s*([\w$]+)/.exec(src);
    expect(m && m[1], 'pole removeUserWaiting w VildaShell').toBeTruthy();
    const f = wytnijFunkcje(src, m[1]);
    expect({ tekst: f.includes('textContent'), style: f.includes('.style.'), pasek: f.includes('appShellRemoveWait') }).toEqual({ tekst: true, style: false, pasek: true });
  });

  it('UK48 (c): app.html — pasek #appShellRemoveWait z role="status", pusty od wczytania', () => {
    const src = zrodlo('app.html');
    const m = /<p\b([^>]*\bid="appShellRemoveWait"[^>]*)>([\s\S]*?)<\/p>/.exec(src);
    expect(m, 'element #appShellRemoveWait').toBeTruthy();
    expect({ rola: /\brole="status"/.test(m[1]), ukryty: /\bhidden\b|display\s*:\s*none/.test(m[1]), tresc: m[2].trim() }).toEqual({ rola: true, ukryty: false, tresc: '' });
  });
});

describe('przerwane usuwanie kończy się przy liście kont', () => {
  // Usuwanie konta X przerwane po skasowaniu bazy sejfu (strona zamknięta w trakcie): znacznik cyklu konta „removing”,
  // baza sejfu konta skasowana, dalsze kroki usuwania jeszcze przed nim; okno o zablokowane. Opcjonalnie baza dziennika
  // i baza kolejki konta.
  async function przerwane(o, { dziennik = false, kolejka = false } = {}) {
    const X = o.A.userId;
    if (o.v.isUnlocked()) o.zablokuj();
    await kasujBaze(o.idb, BAZA(X));
    o.win.localStorage.setItem(CYKL(X), JSON.stringify({ state: 'removing', operationId: OPERACJA }));
    if (dziennik) o.idb.__atrapa.utworz(DZIENNIK(X), 1, SCHEMAT_DZIENNIKA, { entries: [wierszDziennika(1)] });
    if (kolejka) bazaKolejki(o.idb, X, { wiersze: [wierszKolejki(1)] });
    await o.cisza();
    return X;
  }

  it('UK49 (a): przerwane usuwanie X (baza sejfu już skasowana, znacznik cyklu removing), baza dziennika X — lista kont od razu bez X; w tle usuwanie kończy się: wpis rejestru usunięty, znacznik cyklu removed, ogłoszenie usunięcia konta, bazy dziennika X nie ma', async () => {
    const o = await nowe({ konta: 'AB', zaloguj: null, zdarzenia: true });
    const X = await przerwane(o, { dziennik: true });
    const o3 = await drugie(o, { zaloguj: null, zdarzenia: true });
    const k = kanalTestu(o3);
    expect(id(await o3.v.listUsers()), 'lista kont bez konta, którego usuwanie przerwano').toEqual([o.B.userId]);
    await czekajNa(() => stanCyklu(o3, X) === 'removed', 'przerwane usuwanie kończy się przy liście kont');
    await czekajNa(() => !bazy(o).includes(DZIENNIK(X)) && k.komunikaty.length > 0, 'kasowanie dziennika i ogłoszenie usunięcia konta');
    await o3.cisza();
    expect(await czytajRekord(o.idb, REJESTR, 'users', X), 'wpis rejestru konta X').toBeFalsy();
    expect(k.komunikaty, 'ogłoszenie usunięcia konta (bez danych konta)').toEqual([{ type: 'account-removed' }]);
  }, 30_000);

  it('UK49 (b): znacznik cyklu removing, baza sejfu X jest (usuwanie przed kasowaniem bazy) — bez dokończenia: X na liście, wpis rejestru bez zmian', async () => {
    const o = await nowe({ zaloguj: null });
    const X = o.A.userId;
    o.win.localStorage.setItem(CYKL(X), JSON.stringify({ state: 'removing', operationId: OPERACJA }));
    const o3 = await drugie(o, { zaloguj: null });
    const z = log(o).length;
    expect(id(await o3.v.listUsers())).toEqual([X]);
    await o3.cisza();
    expect({ wpis: !!(await czytajRekord(o.idb, REJESTR, 'users', X)), zapisy: zapisyRejestru(o, z).length, cykl: stanCyklu(o3, X) }).toEqual({ wpis: true, zapisy: 0, cykl: 'removing' });
  }, 30_000);

  it('UK49 (c): baza sejfu X skasowana narzędziami przeglądarki, bez znacznika cyklu — bez dokończenia: X na liście, wpis rejestru bez zmian', async () => {
    const o = await nowe({ zaloguj: null });
    const X = o.A.userId;
    await kasujBaze(o.idb, BAZA(X));
    const o3 = await drugie(o, { zaloguj: null });
    const z = log(o).length;
    expect(id(await o3.v.listUsers())).toEqual([X]);
    await o3.cisza();
    expect({ wpis: !!(await czytajRekord(o.idb, REJESTR, 'users', X)), zapisy: zapisyRejestru(o, z).length }).toEqual({ wpis: true, zapisy: 0 });
  }, 30_000);

  it('UK49 (d): przerwane usuwanie X, okno bez databases() — bez dokończenia: X na liście, wpis rejestru i znacznik cyklu bez zmian', async () => {
    const o = await nowe({ zaloguj: null });
    const X = await przerwane(o);
    const o3 = await drugie(o, { zaloguj: null, databases: false });
    const z = log(o).length;
    expect(id(await o3.v.listUsers())).toEqual([X]);
    await o3.cisza();
    expect({ wpis: !!(await czytajRekord(o.idb, REJESTR, 'users', X)), zapisy: zapisyRejestru(o, z).length, cykl: stanCyklu(o3, X) }).toEqual({ wpis: true, zapisy: 0, cykl: 'removing' });
  }, 30_000);

  it('UK49 (e): przerwane usuwanie X, okno w trybie „Zaloguj jednorazowo” — bez dokończenia: wpis rejestru i znacznik cyklu bez zmian, bez kasowań', async () => {
    const o = await nowe({ zaloguj: null });
    const X = await przerwane(o);
    const o3 = await drugie(o, { zaloguj: null });
    o3.v.setEphemeralMode(true);
    await o3.v.createUser('Fikcyjne#Jednorazowe!2026jj', { label: 'Fikcyjne konto jednorazowe', iterations: 1000 });
    await o3.tlo();
    const z = log(o).length;
    await o3.v.listUsers();
    await o3.cisza();
    expect({ wpis: !!(await czytajRekord(o.idb, REJESTR, 'users', X)), zapisy: zapisyRejestru(o, z).length, kasowania: wpisyOd(o, z, 'deleteDatabase').length, cykl: stanCyklu(o3, X) })
      .toEqual({ wpis: true, zapisy: 0, kasowania: 0, cykl: 'removing' });
  }, 30_000);

  it('UK49 (f): dwie listy kont naraz i trzecia po końcu — za każdym razem bez X; jedno kasowanie bazy kolejki X i jedna zmiana rejestru', async () => {
    const o = await nowe({ konta: 'AB', zaloguj: null });
    const X = await przerwane(o, { kolejka: true });
    const Y = o.B.userId;
    const o3 = await drugie(o, { zaloguj: null });
    const z = log(o).length;
    const [l1, l2] = await Promise.all([o3.v.listUsers(), o3.v.listUsers()]);
    expect([id(l1), id(l2)], 'listy kont w trakcie').toEqual([[Y], [Y]]);
    await czekajNa(() => stanCyklu(o3, X) === 'removed', 'przerwane usuwanie kończy się przy liście kont');
    await o3.cisza();
    expect(id(await o3.v.listUsers()), 'lista kont po końcu').toEqual([Y]);
    await o3.cisza();
    expect({ kasowanieKolejki: wpisyOd(o, z, 'deleteDatabase', nazwaBazy(X)).length, zmianyRejestru: zapisyRejestru(o, z).length }).toEqual({ kasowanieKolejki: 1, zmianyRejestru: 1 });
  }, 30_000);

  it('UK49 (g): usunięcie wpisu rejestru w dokończeniu kończy się błędem — znacznik cyklu removing przywrócony, ta karta nie próbuje drugi raz; nowa karta — lista bez X i dokończenie kończy (wpis usunięty, removed)', async () => {
    const o = await nowe({ konta: 'AB', zaloguj: null });
    const X = await przerwane(o);
    const Y = o.B.userId;
    const stary = o.win.localStorage.getItem(CYKL(X));
    const u = o.idb.__atrapa.usterka({ przy: 'delete', baza: REJESTR, sklep: 'users', blad: 'UnknownError' });
    const o3 = await drugie(o, { zaloguj: null });
    expect(id(await o3.v.listUsers()), 'lista kont przy pierwszej próbie').toEqual([Y]);
    await czekajNa(() => u.uzyta > 0 && o.win.localStorage.getItem(CYKL(X)) === stary, 'przywrócenie znacznika cyklu po nieudanej próbie');
    await o3.cisza();
    expect(id(await o3.v.listUsers()), 'druga lista kont tej karty').toEqual([Y]);
    await o3.cisza();
    expect({ wpis: !!(await czytajRekord(o.idb, REJESTR, 'users', X)), cykl: o.win.localStorage.getItem(CYKL(X)) === stary }, 'po drugiej liście tej karty').toEqual({ wpis: true, cykl: true });
    const o4 = await drugie(o, { zaloguj: null });
    expect(id(await o4.v.listUsers()), 'lista kont nowej karty').toEqual([Y]);
    await czekajNa(() => stanCyklu(o4, X) === 'removed', 'dokończenie w nowej karcie');
    await o4.cisza();
    expect(await czytajRekord(o.idb, REJESTR, 'users', X), 'wpis rejestru konta X').toBeFalsy();
  }, 30_000);

  it('UK49 (h): karta usuwająca w trakcie czekającego kasowania i druga karta zalogowana na X czytają listę kont — po końcu jedno kasowanie bazy kolejki X i jedna zmiana rejestru', async () => {
    const o = await nowe({ konta: 'AB' });
    const X = o.A.userId;
    const o2 = await drugie(o, { zaloguj: 'A' });
    bazaKolejki(o.idb, X, { wiersze: [wierszKolejki(1)] });
    const obce = await otworzSurowo(o.idb, BAZA(X));
    const z = log(o).length;
    const p = usun(o);
    await czekajNa(() => wpisyOd(o, z, 'blocked', BAZA(X)).length > 0, `blocked kasowania ${BAZA('<X>')}`);
    await o.v.listUsers();
    await o2.v.listUsers();
    obce.close();
    expect(await doczekaj(p, 'removeUser w karcie usuwającej')).toEqual(OK);
    await o.v.listUsers();
    await o2.v.listUsers();
    await o.cisza();
    await o2.cisza();
    expect({ kasowanieKolejki: wpisyOd(o, z, 'deleteDatabase', nazwaBazy(X)).length, zmianyRejestru: zapisyRejestru(o, z).length }).toEqual({ kasowanieKolejki: 1, zmianyRejestru: 1 });
  }, 30_000);

  it('UK49 (i): karta usuwająca odświeżona w trakcie własnego usuwania (zapis sesji X, baza sejfu X już skasowana, znacznik cyklu removing) — tryRestoreSession() false, powód user-removed-elsewhere; lista kont bez X i dokończenie w tej karcie', async () => {
    const o = await nowe({ konta: 'AB' });
    const X = o.A.userId;
    const sesja = kopiaSesji(o);
    await przerwane(o);
    const o3 = await drugie(o, { zaloguj: null, sesja });
    expect(await wynik(o3.v.tryRestoreSession())).toEqual({ ok: true, w: false });
    expect(await powod(o3), 'powód blokady').toBe('user-removed-elsewhere');
    expect(id(await o3.v.listUsers()), 'lista kont tej karty').toEqual([o.B.userId]);
    await czekajNa(() => stanCyklu(o3, X) === 'removed', 'przerwane usuwanie kończy się przy liście kont tej karty');
    await o3.cisza();
    expect(await czytajRekord(o.idb, REJESTR, 'users', X), 'wpis rejestru konta X').toBeFalsy();
  }, 30_000);

  it('UK49 (j): przerwane usuwanie X, karta po nowszej wersji bazy sejfu innego konta (APP_UPDATED) — bez dokończenia: X na liście, znacznik cyklu i wpis rejestru bez zmian', async () => {
    const o = await nowe({ konta: 'AB', zaloguj: null });
    const X = await przerwane(o);
    const Y = o.B.userId;
    const o3 = await drugie(o, { zaloguj: null });
    expect(kod(await wynik(o3.v.listPasskeys(Y))), 'połączenie z bazą sejfu Y').toEqual({ ok: true });
    expect(await doczekaj(otworzWersje(o.idb, BAZA(Y), 6), 'otwarcie bazy Y w wersji 6')).toBe('ok');
    await o3.cisza();
    expect(kod(await wynik(o3.v.listPasskeys(Y))), 'karta po nowszej wersji bazy w innej karcie').toEqual({ ok: false, kod: 'APP_UPDATED', komunikat: TEKST_WERSJA });
    const stary = o.win.localStorage.getItem(CYKL(X));
    const z = log(o).length;
    const lista = id(await o3.v.listUsers());
    await o3.cisza();
    expect({ zX: lista.includes(X), wpis: !!(await czytajRekord(o.idb, REJESTR, 'users', X)), zapisy: zapisyRejestru(o, z).length, cykl: o.win.localStorage.getItem(CYKL(X)) === stary })
      .toEqual({ zX: true, wpis: true, zapisy: 0, cykl: true });
  }, 30_000);
});

describe('zapis sesji innego konta przy „Usuń konto”', () => {
  it('UK50: wspólny sessionStorage (ramka Ustawień i powłoka): okno 1 zalogowane na X, okno 2 loguje Y; „Usuń konto” X w oknie 1 — zapis sesji Y bez zmian, okno 2 dalej zalogowane na Y', async () => {
    const o = await nowe({ konta: 'AB' });
    const Y = o.B.userId;
    const o2 = await drugie(o, { sesja: o.win.sessionStorage, zaloguj: 'B' });
    const zapisY = o.win.sessionStorage.getItem(SESJA);
    expect(JSON.parse(zapisY).userId, 'zapis sesji karty po zalogowaniu Y').toBe(Y);
    expect(await doczekaj(usun(o), 'removeUser(X) w oknie 1')).toEqual(OK);
    await o.cisza();
    await o2.cisza();
    expect({ zapis: o.win.sessionStorage.getItem(SESJA) === zapisY, odblokowane: o2.v.isUnlocked(), konto: o2.v.getCurrentUser() && o2.v.getCurrentUser().userId })
      .toEqual({ zapis: true, odblokowane: true, konto: Y });
  }, 30_000);

  it.each([
    ['zapis sesji usuwanego konta (ta sama karta)', () => null],
    ['zapis sesji o złym kształcie', () => '{"v":2,"userId":7}'],
  ])('UK50 (wariant): %s — zdjęty przy „Usuń konto”', async (_n, nadpisz) => {
    const o = await nowe();
    const zly = nadpisz();
    if (zly !== null) o.win.sessionStorage.setItem(SESJA, zly);
    expect(o.win.sessionStorage.getItem(SESJA), 'zapis sesji przed usunięciem').not.toBe(null);
    expect(await doczekaj(usun(o), 'removeUser')).toEqual(OK);
    await o.cisza();
    expect(o.win.sessionStorage.getItem(SESJA), 'zapis sesji po usunięciu').toBe(null);
  }, 30_000);
});
