// P-DZIENNIK-ZDARZEN (E2-PR3a1) — „Usuń konto” kasuje bazę kolejki zmian konta (vilda_sync_<userId>, z kwarantanną),
// jego identyfikator urządzenia i znacznik ponowienia, także przy drugiej karcie z tym kontem; koordynacja kart blokadą
// Web Locks vilda-sync-db:<userId>. Prawdziwy sejf z modułami punktu odzyskiwania w oknie uprzęży
// tests/support/okno-magazynu.mjs (adapter IndexedDB sejfu nad atrapą tests/support/atrapa-indexeddb.mjs, tryb „Komputer
// prywatny”, jeśli przypadek nie mówi inaczej); druga karta = drugie okno na tej samej atrapie, ze wspólną atrapą Web
// Locks i wspólnym localStorage. Bramka dziennika (pole okna VILDA_EVENT_LOG) otwarta, jeśli przypadek nie mówi inaczej.
// Zegary okna są atrapą (limity blokady i kasowania odpalane jawnie). Dane WYŁĄCZNIE FIKCYJNE.
//
// WYMAGANIA (kasowanie konta)
//   - removeUser kończy się dopiero po kasowaniu kolejki konta; kolejność: usunięcie wpisu rejestru → blokada sejfu
//     (powiadomienie user-removed, gdy usuwane jest konto bieżące) → kasowanie bazy kolejki; w gałęzi bez metadanych
//     konta kasowanie kolejki też; tryb „Komputer w pracy” jak „Komputer prywatny”.
//   - Od początku removeUser operacje kolejki i kwarantanny tego konta w tym oknie kończą się odmową bez otwarcia
//     i tworzenia bazy kolejki (do blokady sejfu zwykle SYNC_DB_DELETED, potem zablokowany) i nie czytają bazy sejfu
//     konta (poza wpisem rejestru; także dopisanie każdego rodzaju, które już czeka w trakcie odczytu albo tworzenia
//     bazy); nieudane removeUser cofa swoje oznaczenie, ale nie oznaczenie innego removeUser tego konta w toku.
//   - Druga karta: dopisanie i zapis do kwarantanny biorą blokadę współdzieloną (od odczytu rejestru do zapisu
//     identyfikatora urządzenia), kasowanie — wyłączną; po removeUser nie zostaje baza kolejki, identyfikator urządzenia
//     ani znacznik. Limity: kasujący 10 s (potem kasowanie bez blokady i znacznik), dopisujący i zapis do kwarantanny
//     20 s (SYNC_DB_TIMEOUT); żądanie blokady odrzucone z innego powodu — praca bez blokady jak bez Web Locks; konto
//     ujęte przed żądaniem blokady; sprawdzenia sesji (P-SESJA-ZAPISU).
//   - Znacznik ponowienia (localStorage vilda-sync-delete-v1:<userId> = "1") powstaje tylko przy śladzie kolejki konta,
//     po limicie blokady albo po kasowaniu zablokowanym, w toku albo błędnym (ten ostatni także przy zamkniętej bramce);
//     bez Web Locks zostaje do następnego odblokowania; nigdy dla konta trybu „Zaloguj jednorazowo” (także dla jego
//     identyfikatora poza tym trybem). Ponowienie przy każdym odblokowaniu poza trybem jednorazowym (w testach: hasło,
//     odtworzenie sesji, klucz odzyskiwania): wpis rejestru w trybie prywatnym — zdjęcie znacznika bez kasowania; wpis
//     w trybie chmurowym albo brak wpisu — kasowanie, a błąd zostawia znacznik; konto, którego removeUser w trybie
//     jednorazowym trwa w tym oknie — pominięte (od E2-PR4e2 zakończone removeUser w trybie jednorazowym nie zostawia
//     oznaczenia); nazwa spoza wzorca identyfikatora —
//     pominięta.
//   - Bez listy baz (databases()) kasowanie nie otwiera bazy kolejki.
//   - Tryb „Zaloguj jednorazowo” (ujęty przy oznaczeniu): kasowanie kolejki niczego nie rusza — bez listy baz, otwarcia,
//     kasowania, blokady konta, znacznika i usuwania identyfikatora urządzenia, także gdy removeUser dostaje
//     identyfikator konta trwałego (jego baza kolejki i identyfikator urządzenia nietknięte, konto dalej w rejestrze).
//     Oznaczenie konta, którego removeUser w tym oknie minęło już krok wpisu rejestru (także w trybie jednorazowym),
//     ujmuje tryb od nowa: późniejsze removeUser tego konta poza trybem jednorazowym kasuje jego kolejkę.
//
// PRZYPADKI (K1–K18)
//   K1, K1b  usunięcie bieżącego konta z bazą kolejki (wiersz kolejki; wiersz kwarantanny) — kolejność, brak bazy, klucza
//            i znacznika zaraz po removeUser.
//   K1c      tryb „Komputer w pracy”: z bazą kolejki z czasu trybu prywatnego; bez bazy (jedna blokada wyłączna).
//   K2       gałąź bez metadanych konta: kasowanie bazy kolejki, bez blokady sejfu.
//   K3, K3e  druga karta dopisuje w trakcie removeUser (kasujący czeka na blokadę; karta B po kasowaniu bazy sejfu jest
//            zablokowana — dopisanie kończy się odmową zablokowany, P-USUN-KONTO-KARTY); dopisanie drugiej karty po
//            kasowaniu bazy sejfu → zablokowany bez czekania na blokadę.
//   K3b, K3c bez Web Locks: znacznik po removeUser (baza kolejki; sam identyfikator urządzenia), ponowienie przy
//            odblokowaniu innego konta.
//   K3d      żądanie blokady odrzucone przed przyznaniem — dopisanie bez blokady.
//   K4–K4c   kasowanie zablokowane obcym połączeniem; błąd kasowania bez listy baz i bez identyfikatora urządzenia; błąd
//            kasowania także przy ponowieniu — znacznik zostaje.
//   K5       kasowanie w toku po limicie — znacznik i ponowienie.
//   K6j      tryb jednorazowy: bez listy baz i z listą (liczba wywołań databases() jak bez kasowania kolejki) — bez
//            otwarcia, kasowania, blokady i zapisów vilda-sync-*; baza kolejki konta jednorazowego na liście i baza konta
//            trwałego nietknięte; removeUser konta trwałego w tym trybie — jego baza kolejki i identyfikator urządzenia
//            nietknięte, bez odczytu kluczy vilda-sync-*, także gdy kasowanie skończyłoby się błędem (bez znacznika);
//            potem blokada i removeUser tego konta poza trybem w tym samym oknie (zalogowane to konto albo inne) —
//            kasowanie jego kolejki; identyfikator konta jednorazowego poza tym trybem — kasowanie wywołane, bez
//            znacznika.
//   K7–K7c   nieudane removeUser (błąd kasowania bazy sejfu; złe hasło konta niebieżącego; zachowany punkt odzyskiwania)
//            cofa oznaczenie; nieudane removeUser nie zdejmuje oznaczenia drugiego removeUser tego konta w toku.
//   K8, K8b  dwa konta: usunięcie A nie rusza bazy ani klucza B; usunięcie niebieżącego B przy odblokowanym A.
//   K9–K9f   ponowienie: wpis prywatny (bez kasowania), wpis chmurowy (kasowanie), tryb jednorazowy (nic), nazwa za długa;
//            odtworzenie sesji i klucz odzyskiwania; konto usunięte w tym oknie w trybie jednorazowym — od E2-PR4e2
//            kasowanie przy ponowieniu w tym samym oknie (do E2-PR4e2: pominięte do przeładowania).
//   K10      zapis identyfikatora urządzenia przez drugą kartę w trakcie kasowania — po końcu brak klucza.
//   K11–K11c to samo okno: operacje w trakcie removeUser → SYNC_DB_DELETED; dopisanie (każdy rodzaj) w trakcie odczytu
//            sejfu → SYNC_DB_DELETED, po końcu na liście baz tylko rejestr; w chwili kasowania kolejki sejf jest już
//            zablokowany.
//   K12      dopisanie wstrzymane na otwarciu tworzącym bazę — tworzenie przerwane.
//   K13–K16  limity blokady (kasujący 10 s — także przy pierwszym dopisaniu drugiej karty; dopisujący i zapis do
//            kwarantanny 20 s, blokadę wyłączną konta trzyma inna karta), sprawdzenia sesji (P-SESJA-ZAPISU) dopisania
//            i zapisu do kwarantanny, zapis do kwarantanny w drugiej karcie.
//   K17      bez Web Locks i przy zamkniętej bramce (także tryb jednorazowy): żadnego zapisu vilda-sync-* w localStorage.
//   K18, K18b bez listy baz przy zamkniętej bramce: jedno deleteDatabase bez otwarcia, bez znacznika; błąd kasowania —
//            znacznik do następnego odblokowania.
//   Samotest uprzęży: wspólne Web Locks i localStorage drugiego okna, okno bez navigator.locks, okno bez databases(),
//   moduły punktu odzyskiwania; osobny widok localStorage na okno (localStorage: 'osobny'): karta A nie odczytuje zapisu
//   karty B przed propaguj(), odczytuje go po, zdarzenie storage w karcie A.
// Druga karta z tym samym kontem zamyka połączenie z bazą sejfu przy kasowaniu (P-USUN-KONTO-KARTY), więc przypadki
// drugiej karty nie zamykają go same; na sejfie sprzed tej zmiany (E2-PR3a1) czerwone są K3, K3e, K10, K13, K13b, K16
// i K6j (dwa przypadki ponownego removeUser poza trybem jednorazowym): usuwanie czeka na połączenie drugiej karty.
// Na sejfie bez kasowania kolejki (E2-PR2b2) czerwone są przypadki sprawdzające kasowanie, blokadę, oznaczenie
// i ponowienie; zielone z natury (strażniki): K3d, K6j (pięć przypadków), K7 (trzy przypadki), K8, K9c, K9d, K17 (dwa
// przypadki) i samotest uprzęży (dwa przypadki).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PRZEDROSTEK_KASOWANIA, PRZEDROSTEK_URZADZENIA, SKRYPTY_PUNKTU, bazaKolejki, czytajRekord, drugieOkno, kluczKasowania,
  kluczUrzadzenia, naAtrapie, nazwaBazy, nazwaBlokady, oknoMagazynu, przechwycZadaniaWTle, wierszKolejki,
} from '../support/okno-magazynu.mjs';
import { naglowek, wynik } from './sesja-zapisu-uprzaz.mjs';

const KORZEN_REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BAZA_SEJFU = (uid) => `vilda_user_${uid}`;
const SLOT = '1a2b3c4d'.repeat(8);
const ZMIANA = Object.freeze({ seq: 1, eid: '00000000-0000-4000-8000-000000000001', payload: { iv: 'Rmlrc3lqbmVJVjEy', data: 'AAAA' } });
const NIECZYTELNY = Object.freeze({ status: 'unreadable', reason: 'decrypt' });
const KW = Object.freeze({ slotId: SLOT, appVersion: '1.1.463' });
const USUNIETA = Object.freeze({ ok: false, powod: 'blad', code: 'SYNC_DB_DELETED' });
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
  const o = await oknoMagazynu({ skrypty: SKRYPTY_PUNKTU, konta: 'A', ...opcje });
  OKNA.push(o);
  return o;
}
async function drugie(o, opcje = {}) {
  const o2 = await drugieOkno(o, opcje);
  OKNA.push(o2);
  return o2;
}
// Obietnica z limitem czasu rzeczywistego: po limicie błąd z opisem (przypadek czerwony z czytelnym komunikatem zamiast
// wiszenia).
function doczekaj(obietnica, opis, ms = LIMIT_OCZEKIWANIA_MS) {
  let zegar;
  const limit = new Promise((_, zle) => { zegar = realnySetTimeout(() => zle(new Error(`nie doczekano: ${opis}`)), ms); });
  return Promise.race([Promise.resolve(obietnica), limit]).finally(() => clearTimeout(zegar));
}
// Pierwsze z dwóch: zdarzenie oczekiwane (true) albo koniec obietnicy, który je wyklucza (false).
const ktoreWczesniej = (oczekiwane, koniec) => Promise.race([Promise.resolve(oczekiwane).then(() => true), Promise.resolve(koniec).then(() => false, () => false)]);
async function czekajNa(warunek, opis, ms = LIMIT_OCZEKIWANIA_MS) {
  const koniec = performance.now() + ms;
  while (performance.now() < koniec) {
    if (warunek()) return;
    await makrozadanie();
  }
  throw new Error(`nie doczekano: ${opis}`);
}
const wLogu = (o, wz) => o.idb.__atrapa.log.some((w) => w[0] === wz[0] && w[1] === wz[1]);
function wstrzymaj(o, wz) {
  const h = o.idb.__atrapa.wstrzymaj(wz);
  UCHWYTY.push(h);
  return h;
}
function wstrzymajKrypto(o, metoda) {
  const h = o.krypto.wstrzymaj({ metoda });
  UCHWYTY.push(h);
  return h;
}

// ── Dane i stan ──────────────────────────────────────────────────────────────────────────────────────────────────────
async function karta(o, i = 1) {
  const r = await o.v.savePatient(naglowek(i), { dedup: false });
  await o.cisza();
  return { patientId: r.patientId, snapshotId: r.snapshotId };
}
async function dopisz(o, k) {
  const w = await o.ev.enqueue('snap', k);
  expect(w.ok, `enqueue przed usunięciem konta: ${JSON.stringify(w)}`).toBe(true);
  await o.cisza();
  return w;
}
const usun = (o, kto = 'A') => wynik(o.v.removeUser(o[kto].userId, o[kto].haslo));
const bazy = (o) => Object.keys(o.idb.__atrapa.bazy());
const bazyKolejki = (o) => bazy(o).filter((n) => n.startsWith('vilda_sync_'));
const znaczniki = (o) => o.win.localStorage.klucze().filter((k) => k.startsWith(PRZEDROSTEK_KASOWANIA));
const klucz = (o, kto = 'A') => o.win.localStorage.getItem(kluczUrzadzenia(o[kto].userId));
const zapisySync = (o) => o.dziennik.filter((x) => x.magazyn === 'localStorage' && (x.op === 'set' || x.op === 'remove') && String(x.klucz).startsWith('vilda-sync-'));
const ileWLogu = (o, z, wz) => o.idb.__atrapa.log.slice(z.log).filter((w) => w[0] === wz[0] && (wz[1] === undefined || (wz[1] instanceof RegExp ? wz[1].test(String(w[1])) : w[1] === wz[1]))).length;
// Stan po removeUser: baza kolejki, identyfikator urządzenia i znacznik konta.
const stanKonta = (o, uid) => ({
  bazaKolejki: !!o.idb.__atrapa.bazy()[nazwaBazy(uid)],
  kluczUrzadzenia: o.win.localStorage.getItem(kluczUrzadzenia(uid)),
  znacznik: o.win.localStorage.getItem(kluczKasowania(uid)),
});
const CZYSTO = Object.freeze({ bazaKolejki: false, kluczUrzadzenia: null, znacznik: null });
const DEV_FIKCYJNY = 'abcdefgh';
// Żądania blokady konta (vilda-sync-db:*) od pozycji z w dzienniku atrapy Web Locks.
const blokadyKonta = (o, z) => o.locks.zadania.slice(z).filter((x) => x.nazwa.startsWith('vilda-sync-db:')).map((x) => x.tryb);
// Najmłodszy zegar okna o danym czasie (limit zlecony ostatni).
async function odpalOstatni(o, ms) {
  await doczekaj(o.timery.czekajNa((t) => t.ms === ms), `zegar ${ms} ms w oknie`);
  const id = Math.max(...o.timery.oczekujace().filter((t) => t.ms === ms).map((t) => t.id));
  expect(o.timery.odpal((t) => t.id === id), `odpalony zegar ${ms} ms`).toBe(1);
}
async function wpisRejestru(o, uid, wpis) {
  await naAtrapie(o.idb, 'vilda_registry', ['users'], 'readwrite', (tx) => { tx.objectStore('users').put({ ...wpis, userId: uid }); });
}

describe('kasowanie kolejki przy usunięciu konta (to samo okno)', () => {
  it('K1: bieżące konto z bazą kolejki i identyfikatorem urządzenia — removeUser true; zaraz po nim brak bazy, klucza i znacznika; kolejność: usunięcie wpisu rejestru → blokada sejfu (user-removed) → kasowanie bazy kolejki', async () => {
    const o = await nowe();
    const uid = o.A.userId;
    await dopisz(o, await karta(o));
    expect(o.jestBaza(), 'baza kolejki przed usunięciem konta').toBe(true);
    expect(klucz(o), 'identyfikator urządzenia przed usunięciem konta').toBeTruthy();
    const blokady = [];
    o.v.onLock((powod) => {
      const rejestr = o.idb.__atrapa.bazy().vilda_registry;
      blokady.push({
        powod, poz: o.idb.__atrapa.log.length,
        wpisRejestru: !!rejestr && rejestr.sklepy.users.wiersze.some((w) => w && w.userId === uid),
        bazaKolejki: !!o.idb.__atrapa.bazy()[nazwaBazy(uid)],
      });
    });
    const z = o.znacznik();
    const w = await usun(o);
    expect(w).toEqual({ ok: true, w: true });
    expect(stanKonta(o, uid), 'zaraz po removeUser (bez czekania na ciszę)').toEqual(CZYSTO);
    await o.cisza();
    expect(stanKonta(o, uid)).toEqual(CZYSTO);
    expect(znaczniki(o)).toEqual([]);
    expect(blokady.map((x) => x.powod)).toEqual(['user-removed']);
    expect(blokady[0].wpisRejestru, 'w chwili blokady sejfu wpisu rejestru już nie ma').toBe(false);
    expect(blokady[0].bazaKolejki, 'w chwili blokady sejfu baza kolejki jeszcze jest').toBe(true);
    const log = o.idb.__atrapa.log;
    const kasowanie = log.findIndex((x, i) => i >= z.log && x[0] === 'deleteDatabase' && x[1] === nazwaBazy(uid));
    expect(kasowanie, 'deleteDatabase bazy kolejki w removeUser').toBeGreaterThanOrEqual(0);
    expect(kasowanie, 'kasowanie kolejki po blokadzie sejfu').toBeGreaterThanOrEqual(blokady[0].poz);
    expect(o.v.isUnlocked()).toBe(false);
  }, 30_000);

  it('K1b: baza kolejki z wierszem kwarantanny (quarantinePut) — po removeUser baza usunięta', async () => {
    const o = await nowe();
    const uid = o.A.userId;
    const q = await o.ev.quarantinePut(ZMIANA, NIECZYTELNY, KW);
    expect(q.ok, JSON.stringify(q)).toBe(true);
    await o.cisza();
    expect(o.kwarantanna()).toHaveLength(1);
    expect(await usun(o)).toEqual({ ok: true, w: true });
    expect(stanKonta(o, uid)).toEqual(CZYSTO);
    await o.cisza();
    expect(bazyKolejki(o)).toEqual([]);
  }, 30_000);

  it('K2: gałąź bez metadanych konta (wpis rejestru bez bazy sejfu) — baza kolejki tego konta skasowana; sejf bieżącego konta nie jest blokowany', async () => {
    const o = await nowe();
    const X = 'fedcba98765432100123456789abcdef';
    const wpis = await czytajRekord(o.idb, 'vilda_registry', 'users', o.A.userId);
    expect(wpis, 'wpis rejestru konta A').toBeTruthy();
    await wpisRejestru(o, X, { ...wpis, label: 'Fikcyjne konto bez sejfu' });
    bazaKolejki(o.idb, X, { wiersze: [wierszKolejki(1)] });
    const blokady = [];
    o.v.onLock((p) => { blokady.push(p); });
    const w = await wynik(o.v.removeUser(X, 'Fikcyjne#DowolneHaslo!2026kk'));
    expect(w).toEqual({ ok: true, w: true });
    expect(stanKonta(o, X)).toEqual(CZYSTO);
    await o.cisza();
    expect(bazyKolejki(o)).toEqual([]);
    expect(await czytajRekord(o.idb, 'vilda_registry', 'users', X), 'wpis rejestru usunięty').toBeUndefined();
    expect(blokady).toEqual([]);
    expect(o.v.isUnlocked(), 'konto A dalej odblokowane').toBe(true);
  }, 30_000);

  it('K1c: konto w trybie „Komputer w pracy” z bazą kolejki i identyfikatorem urządzenia z czasu trybu prywatnego — po removeUser brak bazy, klucza i znacznika', async () => {
    const o = await nowe({ chmura: ['A'] });
    const uid = o.A.userId;
    bazaKolejki(o.idb, uid, { wiersze: [wierszKolejki(1)] });
    o.win.localStorage.setItem(kluczUrzadzenia(uid), DEV_FIKCYJNY);
    expect(await usun(o)).toEqual({ ok: true, w: true });
    await o.cisza();
    expect(stanKonta(o, uid)).toEqual(CZYSTO);
  }, 30_000);

  it('K1c: konto w trybie „Komputer w pracy” bez bazy kolejki — removeUser true, jedna blokada wyłączna konta, bez zapisów vilda-sync-* w localStorage', async () => {
    const o = await nowe({ chmura: ['A'] });
    const uid = o.A.userId;
    const zl = o.locks.zadania.length;
    expect(await usun(o)).toEqual({ ok: true, w: true });
    await o.cisza();
    expect(blokadyKonta(o, zl), 'żądania blokady konta').toEqual(['exclusive']);
    expect(zapisySync(o)).toEqual([]);
    expect(stanKonta(o, uid)).toEqual(CZYSTO);
  }, 30_000);

  it('K8b: usunięcie konta niebieżącego B (z hasłem) przy odblokowanym A — baza kolejki i identyfikator urządzenia B usunięte, bez znacznika; A odblokowane, bez blokady sejfu, kolejka A bez zmian', async () => {
    const o = await nowe({ konta: 'AB' });
    await o.zaloguj('B');
    await dopisz(o, await karta(o, 2));
    await o.zaloguj('A');
    await dopisz(o, await karta(o, 1));
    const kolejkaA = o.kolejka('A');
    const kluczA = klucz(o, 'A');
    const blokady = [];
    o.v.onLock((p) => { blokady.push(p); });
    expect(await usun(o, 'B')).toEqual({ ok: true, w: true });
    await o.cisza();
    expect(stanKonta(o, o.B.userId), 'konto B').toEqual(CZYSTO);
    expect({ odblokowane: o.v.isUnlocked(), konto: o.v.getCurrentUser().userId, blokady }).toEqual({ odblokowane: true, konto: o.A.userId, blokady: [] });
    expect(o.kolejka('A'), 'kolejka A').toEqual(kolejkaA);
    expect(klucz(o, 'A'), 'identyfikator urządzenia A').toBe(kluczA);
  }, 30_000);

  it('K11: removeUser wstrzymany na kasowaniu bazy sejfu — enqueue i quarantinePut tego konta w tym oknie → SYNC_DB_DELETED, bez otwarcia bazy kolejki', async () => {
    const o = await nowe();
    const uid = o.A.userId;
    const k = await karta(o);
    const h = wstrzymaj(o, { przy: 'deleteDatabase', baza: BAZA_SEJFU(uid) });
    const z = o.znacznik();
    const p = usun(o);
    await doczekaj(h.czeka, 'kasowanie bazy sejfu w removeUser');
    const e = await doczekaj(o.ev.enqueue('snap', k), 'wynik enqueue w trakcie removeUser');
    const q = await doczekaj(o.ev.quarantinePut(ZMIANA, NIECZYTELNY, KW), 'wynik quarantinePut w trakcie removeUser');
    expect({ e, q }).toEqual({ e: USUNIETA, q: USUNIETA });
    expect(o.logKolejki(z).filter((x) => x[0] === 'open'), 'otwarcia bazy kolejki od wejścia w removeUser').toEqual([]);
    h.zwolnij();
    expect(await p).toEqual({ ok: true, w: true });
    await o.cisza();
    expect(stanKonta(o, uid)).toEqual(CZYSTO);
  }, 30_000);

  it('K11b: enqueue wstrzymane na odczycie karty w builderze, w tym czasie removeUser — po końcu databases() = [vilda_registry]', async () => {
    const o = await nowe();
    const uid = o.A.userId;
    const k = await karta(o);
    const h = wstrzymaj(o, { przy: 'success', baza: BAZA_SEJFU(uid), sklep: 'patients', metoda: 'get' });
    const pE = o.ev.enqueue('snap', k);
    await doczekaj(h.czeka, 'odczyt karty w builderze');
    const z = o.znacznik();
    const pU = usun(o);
    await doczekaj(czekajNa(() => ileWLogu(o, z, ['deleteDatabase', BAZA_SEJFU(uid)]) > 0, 'kasowanie'), 'deleteDatabase bazy sejfu');
    h.zwolnij();
    const e = await doczekaj(pE, 'wynik enqueue');
    expect(e.ok, `enqueue po rozpoczęciu removeUser: ${JSON.stringify(e)}`).toBe(false);
    expect(await doczekaj(pU, 'wynik removeUser')).toEqual({ ok: true, w: true });
    await o.cisza();
    expect(bazy(o), 'bazy po usunięciu konta').toEqual(['vilda_registry']);
  }, 30_000);

  // Dopisanie każdego rodzaju wstrzymane przed builderem (otwarcie sprawdzające bazy kolejki), removeUser bieżącego konta
  // wstrzymany na usunięciu wpisu rejestru; zwolnienie dopisania, potem removeUser.
  const RODZAJE = [
    ['snap', (k) => k], ['pfull', (k) => ({ patientId: k.patientId })], ['ptomb', (k) => k.patientId], ['stomb', (k) => k.snapshotId],
    ['pnote', () => 'fikcyjna-notatka-1'], ['pnotetomb', () => 'fikcyjna-notatka-1'], ['note', () => 'fikcyjny-szablon-1'],
    ['notetomb', () => 'fikcyjny-szablon-1'], ['plist', () => 'fikcyjna-lista-1'], ['plisttomb', () => 'fikcyjna-lista-1'],
    ['pref', () => 'fikcyjnaPreferencja'], ['pk', () => 'Zmlrc3lqbnlLbHVjekRvc3RlcHUx'], ['pktomb', () => 'Zmlrc3lqbnlLbHVjekRvc3RlcHUx'], ['cred', () => null],
  ];
  for (const [kind, klucze] of RODZAJE) {
    it(`K11b (${kind}): dopisanie wstrzymane przed builderem, removeUser po kasowaniu bazy sejfu — SYNC_DB_DELETED; po końcu databases() = [vilda_registry]`, async () => {
      const o = await nowe();
      const uid = o.A.userId;
      const k = await karta(o);
      const h1 = wstrzymaj(o, { przy: 'open', baza: nazwaBazy(uid) });
      const pE = o.ev.enqueue(kind, klucze(k));
      await doczekaj(h1.czeka, 'otwarcie sprawdzające bazy kolejki w dopisaniu');
      const h2 = wstrzymaj(o, { przy: 'success', baza: 'vilda_registry', sklep: 'users', metoda: 'delete' });
      const pU = usun(o);
      await doczekaj(h2.czeka, 'usunięcie wpisu rejestru w removeUser');
      expect(bazy(o).includes(BAZA_SEJFU(uid)), 'baza sejfu skasowana przed zwolnieniem dopisania').toBe(false);
      h1.zwolnij();
      expect(await doczekaj(pE, 'wynik dopisania'), `wynik dopisania ${kind}`).toEqual(USUNIETA);
      h2.zwolnij();
      expect(await doczekaj(pU, 'wynik removeUser')).toEqual({ ok: true, w: true });
      await o.cisza();
      expect(bazy(o), 'bazy po usunięciu konta').toEqual(['vilda_registry']);
    }, 30_000);
  }

  it('K11c: gałąź z metadanymi konta — w chwili kasowania bazy kolejki sejf jest już zablokowany (getSyncMaterial odmawia); po końcu brak bazy sejfu konta', async () => {
    const o = await nowe();
    const uid = o.A.userId;
    await dopisz(o, await karta(o));
    const h = wstrzymaj(o, { przy: 'deleteDatabase', baza: nazwaBazy(uid) });
    const p = usun(o);
    expect(await doczekaj(ktoreWczesniej(h.czeka, p), 'kasowanie bazy kolejki albo koniec removeUser'), 'removeUser kasuje bazę kolejki przed końcem').toBe(true);
    expect(o.v.isUnlocked(), 'sejf zablokowany przed kasowaniem kolejki').toBe(false);
    const m = await wynik(o.v.getSyncMaterial());
    expect(m.ok, 'getSyncMaterial w trakcie kasowania kolejki').toBe(false);
    h.zwolnij();
    expect(await p).toEqual({ ok: true, w: true });
    await o.cisza();
    expect(bazy(o).includes(BAZA_SEJFU(uid)), 'baza sejfu konta po końcu').toBe(false);
    expect(stanKonta(o, uid)).toEqual(CZYSTO);
  }, 30_000);

  it('K12: enqueue wstrzymane na otwarciu tworzącym bazę kolejki, w tym czasie removeUser — tworzenie przerwane (SYNC_DB_DELETED), bazy nie ma', async () => {
    const o = await nowe();
    const uid = o.A.userId;
    const k = await karta(o);
    // Pierwsze dopisanie konta: po szyfrowaniu otwarcie sprawdzające (bazy nie ma), potem otwarcie tworzące.
    const hk = wstrzymajKrypto(o, 'encrypt');
    const pE = o.ev.enqueue('snap', k);
    await doczekaj(hk.osiagnieta, 'szyfrowanie dopisania');
    const h1 = wstrzymaj(o, { przy: 'open', baza: nazwaBazy(uid) });
    hk.zwolnij();
    await doczekaj(h1.czeka, 'otwarcie sprawdzające bazy kolejki');
    const h2 = wstrzymaj(o, { przy: 'open', baza: nazwaBazy(uid) });
    h1.zwolnij();
    await doczekaj(h2.czeka, 'otwarcie tworzące bazy kolejki');
    const pU = usun(o);
    h2.zwolnij();
    expect(await doczekaj(pE, 'wynik enqueue')).toEqual(USUNIETA);
    expect(await doczekaj(pU, 'wynik removeUser')).toEqual({ ok: true, w: true });
    await o.cisza();
    expect(stanKonta(o, uid)).toEqual(CZYSTO);
    expect(o.idb.__atrapa.log.filter((x) => x[0] === 'success' && x[1] === nazwaBazy(uid)), 'otwarcie bazy kolejki z sukcesem').toEqual([]);
  }, 30_000);

  it('K7: nieudane removeUser bieżącego konta (błąd kasowania bazy sejfu) — oznaczenie cofnięte: enqueue i quarantinePut w tym oknie → ok', async () => {
    const o = await nowe();
    const uid = o.A.userId;
    const k = await karta(o);
    o.idb.__atrapa.usterka({ przy: 'deleteDatabase', baza: BAZA_SEJFU(uid), blad: 'UnknownError' });
    const w = await usun(o);
    expect(w.ok, 'removeUser przy błędzie kasowania bazy sejfu').toBe(false);
    await o.cisza();
    expect(o.v.isUnlocked()).toBe(true);
    const e = await o.ev.enqueue('snap', k);
    const q = await o.ev.quarantinePut(ZMIANA, NIECZYTELNY, KW);
    expect({ e: e.ok, q: q.ok }, JSON.stringify({ e, q })).toEqual({ e: true, q: true });
    await o.cisza();
    expect(o.jestBaza()).toBe(true);
  }, 30_000);

  it('K7: nieudane removeUser konta niebieżącego (złe hasło) — oznaczenie cofnięte: po zalogowaniu tego konta enqueue → ok', async () => {
    const o = await nowe({ konta: 'AB' });
    const w = await wynik(o.v.removeUser(o.B.userId, 'Fikcyjne#ZleHaslo!2026zz'));
    expect(w.ok, 'removeUser ze złym hasłem').toBe(false);
    await o.zaloguj('B');
    const e = await o.ev.enqueue('snap', await karta(o, 2));
    expect(e.ok, JSON.stringify(e)).toBe(true);
    await o.cisza();
    expect(o.jestBaza('B')).toBe(true);
  }, 30_000);

  it('K7: nieudane removeUser bieżącego konta (zachowany punkt odzyskiwania, PATIENT_CHECKPOINT_RETAINED) — oznaczenie cofnięte: enqueue w tym oknie → ok', async () => {
    const o = await nowe();
    const k = await karta(o);
    const st = o.win.VildaPatientCheckpointStore;
    o.win.VildaPatientCheckpointStore = Object.assign(Object.create(Object.getPrototypeOf(st)), st, {
      createIndexedDBStore: (opcje) => {
        const s = st.createIndexedDBStore(opcje);
        return Object.assign(Object.create(Object.getPrototypeOf(s)), s, { has: async () => true, close: () => { s.close(); } });
      },
    });
    const w = await usun(o);
    o.win.VildaPatientCheckpointStore = st;
    expect({ ok: w.ok, kod: w.kod }).toEqual({ ok: false, kod: 'PATIENT_CHECKPOINT_RETAINED' });
    const e = await o.ev.enqueue('snap', k);
    expect(e.ok, JSON.stringify(e)).toBe(true);
    await o.cisza();
    expect(o.jestBaza()).toBe(true);
  }, 30_000);

  it('K7b: drugie removeUser tego konta w trakcie pierwszego kończy się błędem — oznaczenie pierwszego zostaje (quarantinePut → SYNC_DB_DELETED)', async () => {
    const o = await nowe();
    const uid = o.A.userId;
    const h = wstrzymaj(o, { przy: 'deleteDatabase', baza: BAZA_SEJFU(uid) });
    const p1 = usun(o);
    await doczekaj(h.czeka, 'kasowanie bazy sejfu w pierwszym removeUser');
    o.krypto.blad({ metoda: 'digest' });
    const w2 = await doczekaj(usun(o), 'wynik drugiego removeUser');
    expect(w2.ok, 'drugie removeUser z błędem wyprowadzenia powiązania').toBe(false);
    const q = await doczekaj(o.ev.quarantinePut(ZMIANA, NIECZYTELNY, KW), 'wynik quarantinePut');
    h.zwolnij();
    expect(q).toEqual(USUNIETA);
    expect(await doczekaj(p1, 'wynik pierwszego removeUser')).toEqual({ ok: true, w: true });
    await o.cisza();
    expect(stanKonta(o, uid)).toEqual(CZYSTO);
  }, 30_000);

  it('K7c: dwa removeUser bieżącego konta naraz, wcześniejsze kończy się błędem, późniejsze kasuje — oznaczenie zostaje: enqueue w trakcie → SYNC_DB_DELETED; po końcu databases() = [vilda_registry]', async () => {
    const o = await nowe();
    const uid = o.A.userId;
    const k = await karta(o);
    const kc = o.win.VildaClinicalCrypto;
    let n = 0;
    o.win.VildaClinicalCrypto = Object.assign(Object.create(Object.getPrototypeOf(kc)), kc, {
      deriveLocalBinding: async function (...a) {
        n += 1;
        if (n === 1) throw Object.assign(new Error('Fikcyjny błąd wyprowadzenia powiązania.'), { code: 'FIKCYJNY' });
        return kc.deriveLocalBinding.apply(kc, a);
      },
    });
    expect(o.win.VildaClinicalCrypto.deriveLocalBinding, 'podmiana modułu w oknie').not.toBe(kc.deriveLocalBinding);
    const h = wstrzymaj(o, { przy: 'deleteDatabase', baza: BAZA_SEJFU(uid) });
    const p1 = usun(o);
    const p2 = usun(o);
    const w1 = await doczekaj(p1, 'wynik wcześniejszego removeUser');
    expect(w1.ok, 'wcześniejsze removeUser z błędem').toBe(false);
    await doczekaj(h.czeka, 'kasowanie bazy sejfu w późniejszym removeUser');
    const e = await doczekaj(o.ev.enqueue('snap', k), 'wynik enqueue w trakcie późniejszego removeUser', 3000);
    h.zwolnij();
    expect(e).toEqual(USUNIETA);
    expect(await doczekaj(p2, 'wynik późniejszego removeUser')).toEqual({ ok: true, w: true });
    await o.cisza();
    expect(bazy(o), 'bazy po usunięciu konta').toEqual(['vilda_registry']);
  }, 30_000);

  it('K8: dwa konta — usunięcie A nie rusza bazy kolejki, wierszy ani identyfikatora urządzenia B', async () => {
    const o = await nowe({ konta: 'AB' });
    await dopisz(o, await karta(o, 1));
    await o.zaloguj('B');
    await dopisz(o, await karta(o, 2));
    const kluczB = klucz(o, 'B');
    const wierszeB = o.kolejka('B');
    expect(kluczB).toBeTruthy();
    await o.zaloguj('A');
    expect(await usun(o)).toEqual({ ok: true, w: true });
    await o.cisza();
    expect(o.jestBaza('B')).toBe(true);
    expect(o.kolejka('B')).toEqual(wierszeB);
    expect(klucz(o, 'B')).toBe(kluczB);
    expect(o.win.localStorage.getItem(kluczKasowania(o.B.userId))).toBe(null);
  }, 30_000);

  it('K18: bez listy baz (window.indexedDB bez databases()), tryb prywatny, bramka zamknięta — jedno deleteDatabase bazy kolejki bez otwarcia, 0 baz kolejki, 0 znaczników', async () => {
    const o = await nowe({ databases: false, bramka: false });
    const uid = o.A.userId;
    expect(typeof o.win.indexedDB.databases, 'okno bez databases()').toBe('undefined');
    const z = o.znacznik();
    expect(await usun(o)).toEqual({ ok: true, w: true });
    await o.cisza();
    expect({
      open: ileWLogu(o, z, ['open', /^vilda_sync_/]),
      deleteDatabase: ileWLogu(o, z, ['deleteDatabase', nazwaBazy(uid)]),
      inneKasowania: ileWLogu(o, z, ['deleteDatabase', /^vilda_sync_/]) - ileWLogu(o, z, ['deleteDatabase', nazwaBazy(uid)]),
    }).toEqual({ open: 0, deleteDatabase: 1, inneKasowania: 0 });
    expect(bazyKolejki(o)).toEqual([]);
    expect(znaczniki(o)).toEqual([]);
    expect(zapisySync(o)).toEqual([]);
  }, 30_000);

  it('K18b: bez listy baz, bramka zamknięta, deleteDatabase bazy kolejki kończy się błędem — znacznik ponowienia; ponowienie przy odblokowaniu innego konta zdejmuje go', async () => {
    const o = await nowe({ konta: 'AB', databases: false, bramka: false });
    const uid = o.A.userId;
    o.idb.__atrapa.usterka({ przy: 'deleteDatabase', baza: nazwaBazy(uid), blad: 'UnknownError' });
    expect(await usun(o)).toEqual({ ok: true, w: true });
    await o.cisza();
    expect(stanKonta(o, uid), 'po removeUser z błędem kasowania').toEqual({ bazaKolejki: false, kluczUrzadzenia: null, znacznik: '1' });
    await o.zaloguj('B');
    await o.cisza();
    expect(stanKonta(o, uid), 'po odblokowaniu konta B').toEqual(CZYSTO);
    expect(znaczniki(o)).toEqual([]);
  }, 30_000);

  it('K17: bez Web Locks, bramka zamknięta — removeUser nie zapisuje ani nie usuwa żadnego klucza vilda-sync-* w localStorage, 0 baz kolejki', async () => {
    const o = await nowe({ locks: false, bramka: false });
    expect(o.win.navigator.locks, 'okno bez navigator.locks').toBeUndefined();
    expect(await usun(o)).toEqual({ ok: true, w: true });
    await o.cisza();
    expect(zapisySync(o)).toEqual([]);
    expect(znaczniki(o)).toEqual([]);
    expect(bazyKolejki(o)).toEqual([]);
  }, 30_000);

  it('K17: bez Web Locks, bramka zamknięta, „Zaloguj jednorazowo” — removeUser bez zapisów vilda-sync-* w localStorage, 0 baz kolejki', async () => {
    const o = await nowe({ locks: false, bramka: false, jednorazowo: true });
    expect(await usun(o)).toEqual({ ok: true, w: true });
    await o.cisza();
    expect(zapisySync(o)).toEqual([]);
    expect(bazyKolejki(o)).toEqual([]);
  }, 30_000);
});

describe('tryb „Zaloguj jednorazowo” (K6j)', () => {
  const TRWALE = 'abcdef0123456789abcdef0123456789';
  // Konto trwałe B z bazą kolejki (jedno dopisanie) i identyfikatorem urządzenia, potem blokada i konto „Zaloguj
  // jednorazowo” (zalogowane) w tym samym oknie.
  async function kontoTrwaleIJednorazowe() {
    const o = await nowe({ konta: 'AB' });
    await o.zaloguj('B');
    await dopisz(o, await karta(o, 2));
    o.zablokuj();
    o.v.setEphemeralMode(true);
    await o.v.createUser('Fikcyjne#Jednorazowe!2026jj', { label: 'Fikcyjne konto jednorazowe', iterations: 1000 });
    await o.tlo();
    return o;
  }
  const zapisySyncOd = (o, z) => zapisySync({ dziennik: o.dziennik.slice(z.dziennik) });

  it('K6j: bez listy baz — 0 otwarć i kasowań vilda_sync_*, 0 zapisów vilda-sync-* w localStorage, baza konta trwałego nietknięta', async () => {
    const o = await nowe({ jednorazowo: true, databases: false });
    bazaKolejki(o.idb, TRWALE, { wiersze: [wierszKolejki(1)] });
    const przed = o.idb.__atrapa.bazy()[nazwaBazy(TRWALE)];
    const z = o.znacznik();
    const zl = o.locks.zadania.length;
    expect(await usun(o)).toEqual({ ok: true, w: true });
    await o.cisza();
    expect(blokadyKonta(o, zl), 'żądania blokady konta').toEqual([]);
    expect({ open: ileWLogu(o, z, ['open', /^vilda_sync_/]), deleteDatabase: ileWLogu(o, z, ['deleteDatabase', /^vilda_sync_/]) }).toEqual({ open: 0, deleteDatabase: 0 });
    expect(zapisySync(o)).toEqual([]);
    expect(o.idb.__atrapa.bazy()[nazwaBazy(TRWALE)]).toEqual(przed);
  }, 30_000);

  it('K6j: z listą baz — w removeUser dwa wywołania databases() (marker dokumentacji i biblioteka szablonów, bez listy przy kasowaniu kolejki), 0 otwarć i kasowań vilda_sync_*, 0 zapisów vilda-sync-*, baza konta trwałego nietknięta', async () => {
    const o = await nowe({ jednorazowo: true });
    bazaKolejki(o.idb, TRWALE, { wiersze: [wierszKolejki(1)] });
    const przed = o.idb.__atrapa.bazy()[nazwaBazy(TRWALE)];
    const z = o.znacznik();
    const zl = o.locks.zadania.length;
    expect(await usun(o)).toEqual({ ok: true, w: true });
    await o.cisza();
    expect(blokadyKonta(o, zl), 'żądania blokady konta').toEqual([]);
    expect({ databases: ileWLogu(o, z, ['databases']), open: ileWLogu(o, z, ['open', /^vilda_sync_/]), deleteDatabase: ileWLogu(o, z, ['deleteDatabase', /^vilda_sync_/]) })
      .toEqual({ databases: 2, open: 0, deleteDatabase: 0 });
    expect(zapisySync(o)).toEqual([]);
    expect(o.idb.__atrapa.bazy()[nazwaBazy(TRWALE)]).toEqual(przed);
  }, 30_000);

  it('K6j: baza kolejki konta jednorazowego na liście baz — nietknięta: bez otwarcia, kasowania i znacznika', async () => {
    const o = await nowe({ jednorazowo: true });
    const uid = o.A.userId;
    bazaKolejki(o.idb, uid, { wiersze: [wierszKolejki(1)] });
    const przed = o.idb.__atrapa.bazy()[nazwaBazy(uid)];
    const z = o.znacznik();
    const zl = o.locks.zadania.length;
    expect(await usun(o)).toEqual({ ok: true, w: true });
    await o.cisza();
    expect(blokadyKonta(o, zl), 'żądania blokady konta').toEqual([]);
    expect({ open: ileWLogu(o, z, ['open', /^vilda_sync_/]), deleteDatabase: ileWLogu(o, z, ['deleteDatabase', /^vilda_sync_/]) }).toEqual({ open: 0, deleteDatabase: 0 });
    expect(o.idb.__atrapa.bazy()[nazwaBazy(uid)], 'baza kolejki konta jednorazowego').toEqual(przed);
    expect(zapisySync(o)).toEqual([]);
    expect(znaczniki(o)).toEqual([]);
  }, 30_000);

  it('K6j: removeUser konta trwałego B (baza kolejki, identyfikator urządzenia) wywołane w trybie jednorazowym — baza kolejki i identyfikator urządzenia B nietknięte, bez listy baz przy kasowaniu kolejki, bez kasowania, blokady konta i dostępu do kluczy vilda-sync-*; konto B dalej w rejestrze', async () => {
    const o = await kontoTrwaleIJednorazowe();
    const uidB = o.B.userId;
    const przed = o.idb.__atrapa.bazy()[nazwaBazy(uidB)];
    const kluczB = klucz(o, 'B');
    expect(kluczB, 'identyfikator urządzenia B przed usunięciem').toMatch(/^[a-km-np-z2-9]{8}$/);
    const z = o.znacznik();
    const zl = o.locks.zadania.length;
    const odczyty = vi.spyOn(o.win.localStorage, 'getItem');
    expect(await wynik(o.v.removeUser(uidB, o.B.haslo))).toEqual({ ok: true, w: true });
    await o.cisza();
    const odczytaneSync = odczyty.mock.calls.map(([k]) => String(k)).filter((k) => k.startsWith('vilda-sync-'));
    odczyty.mockRestore();
    expect(odczytaneSync, 'odczyty vilda-sync-* w localStorage w removeUser').toEqual([]);
    expect(stanKonta(o, uidB), 'konto B po removeUser').toEqual({ bazaKolejki: true, kluczUrzadzenia: kluczB, znacznik: null });
    expect(o.idb.__atrapa.bazy()[nazwaBazy(uidB)], 'baza kolejki B').toEqual(przed);
    expect({ databases: ileWLogu(o, z, ['databases']), open: ileWLogu(o, z, ['open', /^vilda_sync_/]), deleteDatabase: ileWLogu(o, z, ['deleteDatabase', /^vilda_sync_/]) })
      .toEqual({ databases: 2, open: 0, deleteDatabase: 0 });
    expect(blokadyKonta(o, zl), 'żądania blokady konta').toEqual([]);
    expect(zapisySyncOd(o, z), 'zapisy i usunięcia vilda-sync-* w localStorage').toEqual([]);
    expect(await czytajRekord(o.idb, 'vilda_registry', 'users', uidB), 'wpis rejestru konta B').toBeTruthy();
  }, 30_000);

  it('K6j: removeUser konta trwałego B w trybie jednorazowym, deleteDatabase bazy kolejki B kończyłby się błędem — kasowanie niewołane, bez znacznika i bez zapisów vilda-sync-*', async () => {
    const o = await kontoTrwaleIJednorazowe();
    const uidB = o.B.userId;
    o.idb.__atrapa.usterka({ przy: 'deleteDatabase', baza: nazwaBazy(uidB), blad: 'UnknownError' });
    const z = o.znacznik();
    expect(await wynik(o.v.removeUser(uidB, o.B.haslo))).toEqual({ ok: true, w: true });
    await o.cisza();
    expect(ileWLogu(o, z, ['deleteDatabase', /^vilda_sync_/]), 'kasowania baz kolejki').toBe(0);
    expect(zapisySyncOd(o, z), 'zapisy i usunięcia vilda-sync-* w localStorage').toEqual([]);
    expect(znaczniki(o)).toEqual([]);
  }, 30_000);

  it.each([['B'], ['A']])('K6j: removeUser konta trwałego B w trybie jednorazowym, potem blokada (koniec trybu), zalogowanie %s i removeUser B poza tym trybem w tym samym oknie — kasowanie kolejki B jak poza trybem: blokada wyłączna konta, po końcu brak bazy kolejki, identyfikatora urządzenia i znacznika B', async (kto) => {
    const o = await kontoTrwaleIJednorazowe();
    const uidB = o.B.userId;
    const kluczB = klucz(o, 'B');
    expect(await wynik(o.v.removeUser(uidB, o.B.haslo)), 'removeUser B w trybie jednorazowym').toEqual({ ok: true, w: true });
    await o.cisza();
    expect(stanKonta(o, uidB), 'konto B po removeUser w trybie jednorazowym').toEqual({ bazaKolejki: true, kluczUrzadzenia: kluczB, znacznik: null });
    o.zablokuj();
    expect(o.v.isEphemeralMode(), 'tryb jednorazowy po blokadzie').toBe(false);
    await o.zaloguj(kto);
    expect(o.sesja(), 'zalogowane konto').toBe(kto);
    const z = o.znacznik();
    const zl = o.locks.zadania.length;
    const p = wynik(o.v.removeUser(uidB, o.B.haslo));
    expect(await doczekaj(p, 'removeUser B poza trybem jednorazowym')).toEqual({ ok: true, w: true });
    await o.cisza();
    expect(stanKonta(o, uidB), 'konto B po removeUser poza trybem jednorazowym').toEqual(CZYSTO);
    expect(ileWLogu(o, z, ['deleteDatabase', nazwaBazy(uidB)]), 'kasowanie bazy kolejki B').toBe(1);
    expect(blokadyKonta(o, zl), 'żądania blokady konta').toEqual(['exclusive']);
    expect(znaczniki(o)).toEqual([]);
    expect(await czytajRekord(o.idb, 'vilda_registry', 'users', uidB), 'wpis rejestru konta B').toBeFalsy();
  }, 30_000);

  it('K6j: removeUser bieżącego konta trwałego B poza trybem, potem tryb jednorazowy i removeUser B w tym samym oknie — kasowanie kolejki niczego nie rusza: bez listy baz przy kasowaniu kolejki, blokady konta i dostępu do kluczy vilda-sync-*', async () => {
    const o = await nowe({ konta: 'AB' });
    const uidB = o.B.userId;
    await o.zaloguj('B');
    await dopisz(o, await karta(o, 2));
    expect(await usun(o, 'B'), 'removeUser B poza trybem jednorazowym').toEqual({ ok: true, w: true });
    await o.cisza();
    expect(stanKonta(o, uidB), 'konto B po removeUser poza trybem jednorazowym').toEqual(CZYSTO);
    expect(o.v.isUnlocked(), 'sejf po usunięciu bieżącego konta').toBe(false);
    o.v.setEphemeralMode(true);
    await o.v.createUser('Fikcyjne#Jednorazowe!2026jj', { label: 'Fikcyjne konto jednorazowe', iterations: 1000 });
    await o.tlo();
    const z = o.znacznik();
    const zl = o.locks.zadania.length;
    const odczyty = vi.spyOn(o.win.localStorage, 'getItem');
    expect(await wynik(o.v.removeUser(uidB, o.B.haslo)), 'removeUser B w trybie jednorazowym').toEqual({ ok: true, w: true });
    await o.cisza();
    const odczytaneSync = odczyty.mock.calls.map(([k]) => String(k)).filter((k) => k.startsWith('vilda-sync-'));
    odczyty.mockRestore();
    expect(odczytaneSync, 'odczyty vilda-sync-* w localStorage w removeUser').toEqual([]);
    expect({ databases: ileWLogu(o, z, ['databases']), open: ileWLogu(o, z, ['open', /^vilda_sync_/]), deleteDatabase: ileWLogu(o, z, ['deleteDatabase', /^vilda_sync_/]) })
      .toEqual({ databases: 2, open: 0, deleteDatabase: 0 });
    expect(blokadyKonta(o, zl), 'żądania blokady konta').toEqual([]);
    expect(zapisySyncOd(o, z), 'zapisy i usunięcia vilda-sync-* w localStorage').toEqual([]);
  }, 30_000);

  it.each([['eph:', 'ab12'.repeat(8)], ['eph-qr:', 'mk3b0fikcja']])('K6j: identyfikator konta trybu jednorazowego (%s) poza tym trybem, bez listy baz, kasowanie kończy się błędem — kasowanie wywołane, bez znacznika', async (przedrostek, reszta) => {
    const o = await nowe({ databases: false, bramka: false });
    const X = przedrostek + reszta;
    o.idb.__atrapa.usterka({ przy: 'deleteDatabase', baza: nazwaBazy(X), blad: 'UnknownError' });
    const z = o.znacznik();
    expect(await wynik(o.v.removeUser(X, 'Fikcyjne#DowolneHaslo!2026kk'))).toEqual({ ok: true, w: true });
    await o.cisza();
    expect(ileWLogu(o, z, ['deleteDatabase', nazwaBazy(X)]), 'kasowanie bazy kolejki wywołane i zakończone błędem').toBe(1);
    expect(zapisySync(o)).toEqual([]);
    expect(znaczniki(o)).toEqual([]);
  }, 30_000);
});

describe('znacznik ponowienia i ponowienie przy odblokowaniu', () => {
  it('K3b: bez Web Locks, bramka otwarta, baza kolejki istnieje — po removeUser znacznik; po odblokowaniu innego konta brak bazy i znacznika', async () => {
    const o = await nowe({ konta: 'AB', locks: false });
    const uid = o.A.userId;
    await dopisz(o, await karta(o));
    expect(await usun(o)).toEqual({ ok: true, w: true });
    await o.cisza();
    expect(stanKonta(o, uid), 'po removeUser bez Web Locks').toEqual({ bazaKolejki: false, kluczUrzadzenia: null, znacznik: '1' });
    expect(znaczniki(o)).toEqual([kluczKasowania(uid)]);
    await o.zaloguj('B');
    await o.cisza();
    expect(stanKonta(o, uid), 'po odblokowaniu konta B').toEqual(CZYSTO);
  }, 30_000);

  it('K4: kasowanie zablokowane obcym połączeniem bez obsługi versionchange — znacznik; po zamknięciu połączenia i odblokowaniu innego konta brak bazy i znacznika', async () => {
    const o = await nowe({ konta: 'AB' });
    const uid = o.A.userId;
    await dopisz(o, await karta(o));
    const obce = await new Promise((ok, zle) => {
      const r = o.idb.open(nazwaBazy(uid));
      r.onsuccess = () => ok(r.result);
      r.onerror = () => zle(r.error);
    });
    const z = o.znacznik();
    expect(await usun(o)).toEqual({ ok: true, w: true });
    expect(ileWLogu(o, z, ['blocked', nazwaBazy(uid)]), 'blocked kasowania bazy kolejki').toBe(1);
    expect(o.win.localStorage.getItem(kluczKasowania(uid)), 'znacznik po kasowaniu zablokowanym').toBe('1');
    expect(klucz(o), 'identyfikator urządzenia usunięty mimo blokady').toBe(null);
    obce.close();
    await o.cisza();
    expect(bazyKolejki(o), 'kasowanie dokończone po zamknięciu połączenia').toEqual([]);
    await o.zaloguj('B');
    await o.cisza();
    expect(stanKonta(o, uid)).toEqual(CZYSTO);
  }, 30_000);

  it('K5: kasowanie w toku po limicie 10 s (zegar okna) — znacznik; po dokończeniu i odblokowaniu innego konta brak bazy i znacznika', async () => {
    const o = await nowe({ konta: 'AB' });
    const uid = o.A.userId;
    await dopisz(o, await karta(o));
    const h = wstrzymaj(o, { przy: 'deleteDatabase', baza: nazwaBazy(uid) });
    const p = usun(o);
    expect(await doczekaj(ktoreWczesniej(h.czeka, p), 'kasowanie bazy kolejki albo koniec removeUser'), 'removeUser kasuje bazę kolejki').toBe(true);
    await odpalOstatni(o, 10000);
    expect(await doczekaj(p, 'wynik removeUser po limicie kasowania')).toEqual({ ok: true, w: true });
    expect(o.win.localStorage.getItem(kluczKasowania(uid)), 'znacznik po kasowaniu w toku').toBe('1');
    h.zwolnij();
    await o.cisza();
    expect(bazyKolejki(o)).toEqual([]);
    await o.zaloguj('B');
    await o.cisza();
    expect(stanKonta(o, uid)).toEqual(CZYSTO);
  }, 30_000);

  it('K3c: bez Web Locks, bazy kolejki nie ma na liście, zapisany identyfikator urządzenia konta — znacznik po removeUser; po odblokowaniu innego konta czysto', async () => {
    const o = await nowe({ konta: 'AB', locks: false });
    const uid = o.A.userId;
    o.win.localStorage.setItem(kluczUrzadzenia(uid), DEV_FIKCYJNY);
    expect(await usun(o)).toEqual({ ok: true, w: true });
    await o.cisza();
    expect(stanKonta(o, uid), 'po removeUser').toEqual({ bazaKolejki: false, kluczUrzadzenia: null, znacznik: '1' });
    await o.zaloguj('B');
    await o.cisza();
    expect(stanKonta(o, uid), 'po odblokowaniu konta B').toEqual(CZYSTO);
  }, 30_000);

  it('K4b: bez listy baz i bez identyfikatora urządzenia (baza kolejki jest), kasowanie kończy się błędem — znacznik po removeUser', async () => {
    const o = await nowe({ databases: false });
    const uid = o.A.userId;
    bazaKolejki(o.idb, uid, { wiersze: [wierszKolejki(1)] });
    expect(klucz(o), 'bez identyfikatora urządzenia').toBe(null);
    o.idb.__atrapa.usterka({ przy: 'deleteDatabase', baza: nazwaBazy(uid), blad: 'UnknownError' });
    expect(await usun(o)).toEqual({ ok: true, w: true });
    await o.cisza();
    expect(stanKonta(o, uid), 'po błędzie kasowania bazy kolejki').toEqual({ bazaKolejki: true, kluczUrzadzenia: null, znacznik: '1' });
  }, 30_000);

  it('K4c: ponowienie przy odblokowaniu kończy się błędem kasowania — znacznik zostaje do następnego odblokowania', async () => {
    const o = await nowe({ konta: 'AB' });
    const uid = o.A.userId;
    await dopisz(o, await karta(o));
    o.idb.__atrapa.usterka({ przy: 'deleteDatabase', baza: nazwaBazy(uid), blad: 'UnknownError' });
    expect(await usun(o)).toEqual({ ok: true, w: true });
    await o.cisza();
    expect(stanKonta(o, uid), 'po removeUser z błędem kasowania').toEqual({ bazaKolejki: true, kluczUrzadzenia: null, znacznik: '1' });
    o.idb.__atrapa.usterka({ przy: 'deleteDatabase', baza: nazwaBazy(uid), blad: 'UnknownError' });
    await o.zaloguj('B');
    await o.cisza();
    expect(stanKonta(o, uid), 'po ponowieniu z błędem').toEqual({ bazaKolejki: true, kluczUrzadzenia: null, znacznik: '1' });
    o.zablokuj();
    await o.zaloguj('B');
    await o.cisza();
    expect(stanKonta(o, uid), 'po kolejnym odblokowaniu konta B').toEqual(CZYSTO);
  }, 30_000);

  it('K9: znacznik konta obecnego w rejestrze w trybie prywatnym — ponowienie przy odblokowaniu zdejmuje znacznik bez kasowania bazy', async () => {
    const o = await nowe({ konta: 'AB' });
    const uid = o.A.userId;
    await dopisz(o, await karta(o));
    o.win.localStorage.setItem(kluczKasowania(uid), '1');
    const wiersze = o.kolejka('A');
    const z = o.znacznik();
    await o.zaloguj('B');
    await o.cisza();
    expect(o.win.localStorage.getItem(kluczKasowania(uid)), 'znacznik po odblokowaniu').toBe(null);
    expect(ileWLogu(o, z, ['deleteDatabase', nazwaBazy(uid)]), 'kasowanie bazy konta z rejestru').toBe(0);
    expect(o.kolejka('A')).toEqual(wiersze);
  }, 30_000);

  it('K9b: znacznik konta, którego wpis rejestru jest w trybie chmurowym (baza kolejki istnieje) — ponowienie kasuje bazę i zdejmuje znacznik', async () => {
    const o = await nowe({ konta: 'AB', chmura: ['B'] });
    const uidB = o.B.userId;
    bazaKolejki(o.idb, uidB, { wiersze: [wierszKolejki(1)] });
    o.win.localStorage.setItem(kluczKasowania(uidB), '1');
    o.zablokuj();
    await o.zaloguj('A');
    await o.cisza();
    expect(stanKonta(o, uidB)).toEqual(CZYSTO);
  }, 30_000);

  it('K9c: tryb jednorazowy — znacznik konta trwałego (w rejestrze, z bazą kolejki): po odblokowaniu jednorazowym baza i znacznik nietknięte', async () => {
    const o = await nowe();
    const uid = o.A.userId;
    await dopisz(o, await karta(o));
    o.win.localStorage.setItem(kluczKasowania(uid), '1');
    const przed = o.idb.__atrapa.bazy()[nazwaBazy(uid)];
    o.zablokuj();
    const z = o.znacznik();
    o.v.setEphemeralMode(true);
    await o.v.createUser('Fikcyjne#Jednorazowe!2026jj', { label: 'Fikcyjne konto jednorazowe', iterations: 1000 });
    await o.tlo();
    expect(o.win.localStorage.getItem(kluczKasowania(uid))).toBe('1');
    expect(o.idb.__atrapa.bazy()[nazwaBazy(uid)]).toEqual(przed);
    expect(o.logKolejki(z)).toEqual([]);
  }, 30_000);

  it('K9d: znacznik z nazwą konta dłuższą niż 128 znaków — pominięty (bez deleteDatabase), klucz zostaje', async () => {
    const o = await nowe({ konta: 'AB' });
    const dlugi = 'f'.repeat(129);
    o.win.localStorage.setItem(kluczKasowania(dlugi), '1');
    const z = o.znacznik();
    await o.zaloguj('B');
    await o.cisza();
    expect(ileWLogu(o, z, ['deleteDatabase', /^vilda_sync_/])).toBe(0);
    expect(o.win.localStorage.getItem(kluczKasowania(dlugi))).toBe('1');
  }, 30_000);

  it('K9e: ponowienie przy odtworzeniu sesji po przeładowaniu (tryRestoreSession) — baza kolejki konta usuniętego skasowana, znacznik zdjęty', async () => {
    const o = await nowe({ konta: 'A' });
    const X = 'fedcba98765432100123456789abcdef';
    bazaKolejki(o.idb, X, { wiersze: [wierszKolejki(1)] });
    o.win.localStorage.setItem(kluczKasowania(X), '1');
    const o2 = await oknoMagazynu({ skrypty: SKRYPTY_PUNKTU, idb: o.idb, localStorage: o.lokalny, locks: o.locks, sesja: o.win.sessionStorage, istniejace: { A: o.A, B: o.B }, zaloguj: null });
    OKNA.push(o2);
    expect(await o2.v.tryRestoreSession(), 'odtworzenie sesji').toBe(true);
    await o2.cisza();
    expect(o2.v.isUnlocked()).toBe(true);
    expect(stanKonta(o2, X)).toEqual(CZYSTO);
  }, 30_000);

  it('K9e: ponowienie przy odblokowaniu kluczem odzyskiwania — baza kolejki konta usuniętego skasowana, znacznik zdjęty', async () => {
    const o = await nowe({ konta: 'A' });
    const X = 'fedcba98765432100123456789abcdee';
    o.zablokuj();
    const C = await o.v.createUser('Fikcyjne#KontoC!2026cc', { label: 'Fikcyjne konto C', iterations: 1000 });
    await o.tlo();
    o.zablokuj();
    bazaKolejki(o.idb, X, { wiersze: [wierszKolejki(1)] });
    o.win.localStorage.setItem(kluczKasowania(X), '1');
    await o.v.unlockUserWithRecoveryKey(C.userId, C.recoveryKey);
    await o.tlo();
    await o.cisza();
    expect(o.v.isUnlocked()).toBe(true);
    expect(stanKonta(o, X)).toEqual(CZYSTO);
  }, 30_000);

  it('K9f: removeUser konta X (znacznik, baza kolejki, bez wpisu rejestru) w trybie jednorazowym, potem blokada i odblokowanie konta trwałego w tym samym oknie — od E2-PR4e2 usuwanie w trybie jednorazowym kończy oznaczenie konta w oknie (tryb przekazany od oznaczenia do kasowania), więc ponowienie X w tym oknie kasuje osieroconą bazę X (brak wpisu rejestru) i zdejmuje znacznik', async () => {
    const o = await nowe({ konta: 'AB' });
    const X = 'ab12cd34ef56ab78cd90ef12ab34cd56';
    o.zablokuj();
    o.v.setEphemeralMode(true);
    await o.v.createUser('Fikcyjne#Jednorazowe!2026jj', { label: 'Fikcyjne konto jednorazowe', iterations: 1000 });
    await o.tlo();
    bazaKolejki(o.idb, X, { wiersze: [wierszKolejki(1)] });
    o.win.localStorage.setItem(kluczKasowania(X), '1');
    expect(await wynik(o.v.removeUser(X, 'Fikcyjne#DowolneHaslo!2026kk')), 'removeUser X w trybie jednorazowym').toEqual({ ok: true, w: true });
    await o.cisza();
    const zX = { bazaKolejki: true, kluczUrzadzenia: null, znacznik: '1' };
    expect(stanKonta(o, X), 'konto X po removeUser w trybie jednorazowym — kasowanie pominięte').toEqual(zX);
    o.zablokuj();
    expect(o.v.isEphemeralMode(), 'tryb jednorazowy po blokadzie').toBe(false);
    const z = o.znacznik();
    await o.zaloguj('A');
    await o.cisza();
    expect(ileWLogu(o, z, ['deleteDatabase', nazwaBazy(X)]), 'kasowanie bazy kolejki X w tym oknie').toBe(1);
    expect(stanKonta(o, X), 'konto X po odblokowaniu konta A w tym oknie').toEqual(CZYSTO);
  }, 30_000);
});

describe('druga karta z tym samym kontem (blokada vilda-sync-db:<userId>)', () => {
  it('K3: karta B dopisuje (szyfrowanie wstrzymane), karta A wykonuje removeUser i czeka na blokadę — removeUser true; brak bazy, klucza i znacznika; karta B zablokowana, dopisanie B → zablokowany', async () => {
    const o = await nowe();
    const uid = o.A.userId;
    const k = await karta(o);
    const o2 = await drugie(o);
    expect(o2.locks, 'wspólna atrapa Web Locks').toBe(o.locks);
    const h = wstrzymajKrypto(o2, 'encrypt');
    const pB = o2.ev.enqueue('snap', k);
    await doczekaj(h.osiagnieta, 'szyfrowanie dopisania w karcie B');
    const pA = usun(o);
    const czeka = await doczekaj(ktoreWczesniej(o.locks.czekajNaKolejke(nazwaBlokady(uid)), pA), 'karta A w kolejce blokady albo koniec removeUser');
    h.zwolnij();
    const [wA, wB] = await Promise.all([doczekaj(pA, 'wynik removeUser'), doczekaj(pB, 'wynik dopisania B')]);
    await o.cisza();
    await o2.cisza();
    expect(stanKonta(o, uid), 'po removeUser przy dopisaniu w drugiej karcie').toEqual(CZYSTO);
    expect(czeka, 'karta A czekała na blokadę wyłączną vilda-sync-db, którą trzymało dopisanie B').toBe(true);
    expect(wA).toEqual({ ok: true, w: true });
    expect(wB).toEqual({ ok: false, powod: 'zablokowany' });
    expect(o2.v.isUnlocked(), 'karta B po kasowaniu bazy sejfu').toBe(false);
  }, 30_000);

  it('K3e: karta B zaczyna dopisanie, gdy A trzyma blokadę wyłączną (kasowanie kolejki wstrzymane) — karta B jest już zablokowana: dopisanie → zablokowany bez czekania na blokadę i bez otwarcia bazy kolejki; brak bazy', async () => {
    const o = await nowe();
    const uid = o.A.userId;
    const k = await karta(o);
    await dopisz(o, k);
    const o2 = await drugie(o);
    const h = wstrzymaj(o, { przy: 'deleteDatabase', baza: nazwaBazy(uid) });
    const pA = usun(o);
    expect(await doczekaj(ktoreWczesniej(h.czeka, pA), 'kasowanie bazy kolejki albo koniec removeUser'), 'removeUser kasuje bazę kolejki').toBe(true);
    const z = o.znacznik();
    const zl = o.locks.zadania.length;
    expect(await doczekaj(o2.ev.enqueue('snap', k), 'wynik dopisania B')).toEqual({ ok: false, powod: 'zablokowany' });
    expect(blokadyKonta(o, zl), 'żądania blokady konta karty B').toEqual([]);
    expect(ileWLogu(o, z, ['open', nazwaBazy(uid)]), 'otwarcia bazy kolejki').toBe(0);
    h.zwolnij();
    expect(await doczekaj(pA, 'wynik removeUser')).toEqual({ ok: true, w: true });
    await o.cisza();
    await o2.cisza();
    expect(stanKonta(o, uid)).toEqual(CZYSTO);
  }, 30_000);

  it('K10: pierwsze dopisanie karty B (zatwierdzenie wstrzymane) zapisuje identyfikator urządzenia w trakcie kasowania przez A — po końcu brak klucza i bazy', async () => {
    const o = await nowe();
    const uid = o.A.userId;
    const k = await karta(o);
    const o2 = await drugie(o);
    expect(klucz(o), 'bez identyfikatora urządzenia przed dopisaniem').toBe(null);
    const h = wstrzymaj(o, { przy: 'commit', baza: nazwaBazy(uid), tryb: 'readwrite' });
    const pB = o2.ev.enqueue('snap', k);
    await doczekaj(h.czeka, 'zatwierdzenie dopisania B');
    const pA = usun(o);
    const czeka = await doczekaj(ktoreWczesniej(o.locks.czekajNaKolejke(nazwaBlokady(uid)), pA), 'karta A w kolejce blokady albo koniec removeUser');
    h.zwolnij();
    const [wA, wB] = await Promise.all([doczekaj(pA, 'wynik removeUser'), doczekaj(pB, 'wynik dopisania B')]);
    await o.cisza();
    await o2.cisza();
    expect(o.win.localStorage.getItem(kluczUrzadzenia(uid)), 'identyfikator urządzenia po końcu (wspólny localStorage)').toBe(null);
    expect(stanKonta(o, uid)).toEqual(CZYSTO);
    expect(czeka, 'kasowanie czekało na blokadę dopisania B').toBe(true);
    expect({ a: wA, b: wB.ok }).toEqual({ a: { ok: true, w: true }, b: true });
  }, 30_000);

  it('K13: B trzyma blokadę współdzieloną (szyfrowanie wstrzymane), limit 10 s kasującego — kasowanie bez blokady i znacznik; po zwolnieniu B i odblokowaniu innego konta brak bazy i znacznika', async () => {
    const o = await nowe({ konta: 'AB' });
    const uid = o.A.userId;
    const k = await karta(o);
    await dopisz(o, k);
    const o2 = await drugie(o);
    const h = wstrzymajKrypto(o2, 'encrypt');
    const pB = o2.ev.enqueue('snap', k);
    await doczekaj(h.osiagnieta, 'szyfrowanie dopisania w karcie B');
    const pA = usun(o);
    expect(await doczekaj(ktoreWczesniej(o.locks.czekajNaKolejke(nazwaBlokady(uid)), pA), 'karta A w kolejce blokady albo koniec removeUser'), 'karta A czeka na blokadę wyłączną').toBe(true);
    await odpalOstatni(o, 10000);
    expect(await doczekaj(pA, 'wynik removeUser po limicie blokady')).toEqual({ ok: true, w: true });
    expect(o.jestBaza(), 'baza skasowana bez blokady').toBe(false);
    expect(o.win.localStorage.getItem(kluczKasowania(uid)), 'znacznik po kasowaniu bez blokady').toBe('1');
    h.zwolnij();
    await doczekaj(pB, 'wynik dopisania B');
    await o2.cisza();
    await o.zaloguj('B');
    await o.cisza();
    expect(stanKonta(o, uid), 'po zwolnieniu B i odblokowaniu konta B').toEqual(CZYSTO);
  }, 30_000);

  it('K13b: pierwsze dopisanie karty B (bez bazy kolejki i bez identyfikatora urządzenia) trzyma blokadę współdzieloną, limit 10 s kasującego — znacznik; po zwolnieniu B i odblokowaniu innego konta brak bazy, klucza i znacznika', async () => {
    const o = await nowe({ konta: 'AB' });
    const uid = o.A.userId;
    const k = await karta(o);
    const o2 = await drugie(o);
    expect(stanKonta(o, uid), 'przed dopisaniem B').toEqual(CZYSTO);
    const h = wstrzymajKrypto(o2, 'encrypt');
    const pB = o2.ev.enqueue('snap', k);
    await doczekaj(h.osiagnieta, 'szyfrowanie dopisania w karcie B');
    const pA = usun(o);
    expect(await doczekaj(ktoreWczesniej(o.locks.czekajNaKolejke(nazwaBlokady(uid)), pA), 'karta A w kolejce blokady albo koniec removeUser'), 'karta A czeka na blokadę wyłączną').toBe(true);
    await odpalOstatni(o, 10000);
    expect(await doczekaj(pA, 'wynik removeUser po limicie blokady')).toEqual({ ok: true, w: true });
    expect(stanKonta(o, uid), 'po removeUser (limit blokady)').toEqual({ bazaKolejki: false, kluczUrzadzenia: null, znacznik: '1' });
    h.zwolnij();
    await doczekaj(pB, 'wynik dopisania B');
    await o2.cisza();
    await o.zaloguj('B');
    await o.cisza();
    expect(stanKonta(o, uid), 'po zwolnieniu B i odblokowaniu konta B').toEqual(CZYSTO);
  }, 30_000);

  it('K14: blokadę wyłączną konta trzyma inna karta, enqueue czeka, limit 20 s dopisującego — SYNC_DB_TIMEOUT, bez nowego wiersza', async () => {
    const o = await nowe();
    const uid = o.A.userId;
    const k = await karta(o);
    await dopisz(o, k);
    const wiersze = o.kolejka();
    const trzymana = await o.locks.trzymaj(nazwaBlokady(uid), { tryb: 'exclusive' });
    UCHWYTY.push({ zwolnij: () => { trzymana.zwolnij(); } });
    const p = o.ev.enqueue('snap', k);
    expect(await doczekaj(ktoreWczesniej(o.locks.czekajNaKolejke(nazwaBlokady(uid)), p), 'dopisanie w kolejce blokady'), 'dopisanie czeka na blokadę').toBe(true);
    await odpalOstatni(o, 20000);
    expect(await doczekaj(p, 'wynik dopisania po limicie')).toEqual({ ok: false, powod: 'blad', code: 'SYNC_DB_TIMEOUT' });
    expect(o.kolejka(), 'bez nowego wiersza').toEqual(wiersze);
    await trzymana.zwolnij();
  }, 30_000);

  it('K14b: blokadę wyłączną konta trzyma inna karta, quarantinePut czeka, limit 20 s — SYNC_DB_TIMEOUT, bez wiersza kwarantanny', async () => {
    const o = await nowe();
    const uid = o.A.userId;
    await dopisz(o, await karta(o));
    const trzymana = await o.locks.trzymaj(nazwaBlokady(uid), { tryb: 'exclusive' });
    UCHWYTY.push({ zwolnij: () => { trzymana.zwolnij(); } });
    const p = o.ev.quarantinePut(ZMIANA, NIECZYTELNY, KW);
    expect(await doczekaj(ktoreWczesniej(o.locks.czekajNaKolejke(nazwaBlokady(uid)), p), 'zapis do kwarantanny w kolejce blokady'), 'zapis do kwarantanny czeka na blokadę').toBe(true);
    await odpalOstatni(o, 20000);
    expect(await doczekaj(p, 'wynik quarantinePut po limicie')).toEqual({ ok: false, powod: 'blad', code: 'SYNC_DB_TIMEOUT' });
    expect(o.kwarantanna(), 'bez wiersza kwarantanny').toEqual([]);
    await trzymana.zwolnij();
  }, 30_000);

  it('K15: dopisanie czeka na blokadę, w tym czasie przełączenie konta — sprawdzenia sesji (P-SESJA-ZAPISU): po zwolnieniu odmowa sesja, bez zapisu', async () => {
    const o = await nowe({ konta: 'AB' });
    const uid = o.A.userId;
    const k = await karta(o);
    const trzymana = await o.locks.trzymaj(nazwaBlokady(uid), { tryb: 'exclusive' });
    UCHWYTY.push({ zwolnij: () => { trzymana.zwolnij(); } });
    const p = o.ev.enqueue('snap', k);
    expect(await doczekaj(ktoreWczesniej(o.locks.czekajNaKolejke(nazwaBlokady(uid)), p), 'dopisanie w kolejce blokady'), 'dopisanie czeka na blokadę').toBe(true);
    const prz = o.przelaczWTle('B');
    await prz.sesja;
    await trzymana.zwolnij();
    expect(await doczekaj(p, 'wynik dopisania')).toEqual({ ok: false, powod: 'sesja' });
    await prz.koniec;
    await o.cisza();
    expect({ A: o.kolejka('A'), B: o.kolejka('B'), bazaA: o.jestBaza('A'), bazaB: o.jestBaza('B') }).toEqual({ A: [], B: [], bazaA: false, bazaB: false });
  }, 30_000);

  it('K15b: zapis do kwarantanny czeka na blokadę, w tym czasie przełączenie konta — sprawdzenia sesji (P-SESJA-ZAPISU): po zwolnieniu odmowa sesja, bez zapisu', async () => {
    const o = await nowe({ konta: 'AB' });
    const uid = o.A.userId;
    const trzymana = await o.locks.trzymaj(nazwaBlokady(uid), { tryb: 'exclusive' });
    UCHWYTY.push({ zwolnij: () => { trzymana.zwolnij(); } });
    const p = o.ev.quarantinePut(ZMIANA, NIECZYTELNY, KW);
    expect(await doczekaj(ktoreWczesniej(o.locks.czekajNaKolejke(nazwaBlokady(uid)), p), 'zapis do kwarantanny w kolejce blokady'), 'zapis do kwarantanny czeka na blokadę').toBe(true);
    const prz = o.przelaczWTle('B');
    await prz.sesja;
    await trzymana.zwolnij();
    expect(await doczekaj(p, 'wynik quarantinePut')).toEqual({ ok: false, powod: 'sesja' });
    await prz.koniec;
    await o.cisza();
    expect({ A: o.kwarantanna('A'), B: o.kwarantanna('B'), bazaA: o.jestBaza('A'), bazaB: o.jestBaza('B') }).toEqual({ A: [], B: [], bazaA: false, bazaB: false });
  }, 30_000);

  it('K16: jak K3, ale B zapisuje do kwarantanny (wstrzymane na otwarciu bazy kolejki) — po removeUser brak bazy; zapis B → zablokowany', async () => {
    const o = await nowe();
    const uid = o.A.userId;
    const o2 = await drugie(o);
    const h = wstrzymaj(o, { przy: 'open', baza: nazwaBazy(uid) });
    const pB = o2.ev.quarantinePut(ZMIANA, NIECZYTELNY, KW);
    await doczekaj(h.czeka, 'otwarcie bazy kolejki w zapisie do kwarantanny B');
    const pA = usun(o);
    const czeka = await doczekaj(ktoreWczesniej(o.locks.czekajNaKolejke(nazwaBlokady(uid)), pA), 'karta A w kolejce blokady albo koniec removeUser');
    h.zwolnij();
    const [wA, wB] = await Promise.all([doczekaj(pA, 'wynik removeUser'), doczekaj(pB, 'wynik quarantinePut B')]);
    await o.cisza();
    await o2.cisza();
    expect(stanKonta(o, uid), 'po removeUser przy zapisie do kwarantanny w drugiej karcie').toEqual(CZYSTO);
    expect(czeka, 'kasowanie czekało na blokadę zapisu do kwarantanny').toBe(true);
    expect({ a: wA, b: wB }).toEqual({ a: { ok: true, w: true }, b: { ok: false, powod: 'zablokowany' } });
  }, 30_000);

  it('K3d: żądanie blokady konta odrzucone przed przyznaniem z innego powodu niż limit — dopisanie bez blokady (jak bez Web Locks) kończy się ok', async () => {
    const o = await nowe();
    const k = await karta(o);
    const l = o.win.navigator.locks;
    const prawdziwe = l.request;
    l.request = function (n, ...a) {
      if (String(n).startsWith('vilda-sync-db:')) return Promise.reject(Object.assign(new Error('Fikcyjny dokument nieaktywny.'), { name: 'InvalidStateError' }));
      return prawdziwe.call(this, n, ...a);
    };
    let w;
    try {
      w = await o.ev.enqueue('snap', k);
    } finally {
      l.request = prawdziwe;
    }
    expect(w.ok, JSON.stringify(w)).toBe(true);
    await o.cisza();
    expect(o.jestBaza()).toBe(true);
  }, 30_000);
});

describe('samotest uprzęży okna magazynu (drugie okno, Web Locks, localStorage, lista baz, moduły)', () => {
  it('drugie okno dzieli atrapę IndexedDB, atrapę Web Locks i localStorage; zapisy localStorage trafiają do dziennika okna, które je wykonało; sessionStorage osobny', async () => {
    const o = await nowe({ bramka: false });
    const o2 = await drugie(o, { bramka: false });
    expect(o2.idb).toBe(o.idb);
    expect(o2.locks).toBe(o.locks);
    expect(o2.win.navigator.locks).toBe(o.win.navigator.locks);
    expect(o2.lokalny).toBe(o.lokalny);
    const z1 = o.dziennik.length;
    const z2 = o2.dziennik.length;
    o2.win.localStorage.setItem('fikcyjny-klucz-testu', 'x');
    expect(o.win.localStorage.getItem('fikcyjny-klucz-testu')).toBe('x');
    expect(o.dziennik.slice(z1).filter((x) => x.klucz === 'fikcyjny-klucz-testu')).toEqual([]);
    expect(o2.dziennik.slice(z2).filter((x) => x.klucz === 'fikcyjny-klucz-testu').map((x) => [x.magazyn, x.op])).toEqual([['localStorage', 'set']]);
    o.win.sessionStorage.setItem('fikcyjny-klucz-sesji', 'y');
    expect(o2.win.sessionStorage.getItem('fikcyjny-klucz-sesji')).toBe(null);
    const u = await o.locks.trzymaj('fikcyjna-blokada-testu');
    expect(o2.locks.zajeta('fikcyjna-blokada-testu')).toBe(true);
    await u.zwolnij();
    o.win.localStorage.removeItem('fikcyjny-klucz-testu');
  }, 30_000);

  it('okno bez navigator.locks (także drugie), okno bez databases() na tej samej atrapie, moduły punktu odzyskiwania tylko z SKRYPTY_PUNKTU', async () => {
    const o = await nowe({ locks: false, databases: false, bramka: false });
    expect(o.locks).toBe(null);
    expect(o.win.navigator.locks).toBeUndefined();
    expect(typeof o.win.indexedDB.databases).toBe('undefined');
    expect(typeof o.idb.databases).toBe('function');
    expect(typeof o.win.VildaPatientCheckpoint).toBe('object');
    const o2 = await drugie(o, { bramka: false });
    expect(o2.win.navigator.locks).toBeUndefined();
    expect(typeof o2.win.indexedDB.databases, 'drugie okno z listą baz, jeśli opcje nie mówią inaczej').toBe('function');
    const o3 = await oknoMagazynu({ konta: 'A', bramka: false });
    OKNA.push(o3);
    expect(o3.win.VildaPatientCheckpoint).toBeUndefined();
    expect(typeof o3.win.navigator.locks.request).toBe('function');
    expect(PRZEDROSTEK_URZADZENIA).toBe('vilda-sync-device-v1');
    expect(kluczKasowania('u1')).toBe('vilda-sync-delete-v1:u1');
    expect(nazwaBlokady('u1')).toBe('vilda-sync-db:u1');
  }, 30_000);

  it("osobny widok localStorage na okno (localStorage: 'osobny'): karta A nie odczytuje zapisu karty B przed propaguj(), odczytuje go po; zdarzenie storage w karcie A; zapis tylko w dzienniku karty B", async () => {
    const o = await nowe({ bramka: false, localStorage: 'osobny' });
    const o2 = await drugie(o, { bramka: false, localStorage: 'osobny' });
    expect(o2.lokalny).not.toBe(o.lokalny);
    expect(o2.rodzina).toBe(o.rodzina);
    const zdarzenia = [];
    o.win.addEventListener('storage', (e) => { if (e.key === 'fikcyjny-klucz-testu') zdarzenia.push([e.key, e.oldValue, e.newValue]); });
    const z1 = o.dziennik.length;
    o2.win.localStorage.setItem('fikcyjny-klucz-testu', 'x');
    expect(o2.win.localStorage.getItem('fikcyjny-klucz-testu')).toBe('x');
    expect(o.win.localStorage.getItem('fikcyjny-klucz-testu'), 'karta A przed propaguj()').toBe(null);
    await o.propaguj();
    expect(o.win.localStorage.getItem('fikcyjny-klucz-testu'), 'propaguj() karty A nie przenosi zapisów karty B').toBe(null);
    expect(zdarzenia).toEqual([]);
    await o2.propaguj();
    expect(o.win.localStorage.getItem('fikcyjny-klucz-testu'), 'karta A po propaguj() karty B').toBe('x');
    expect(zdarzenia).toEqual([['fikcyjny-klucz-testu', null, 'x']]);
    o2.win.localStorage.removeItem('fikcyjny-klucz-testu');
    await o2.propaguj();
    expect(o.win.localStorage.getItem('fikcyjny-klucz-testu')).toBe(null);
    expect(zdarzenia).toEqual([['fikcyjny-klucz-testu', null, 'x'], ['fikcyjny-klucz-testu', 'x', null]]);
    expect(o.dziennik.slice(z1).filter((x) => x.klucz === 'fikcyjny-klucz-testu'), 'dziennik karty A').toEqual([]);
    await expect(oknoMagazynu({ konta: 'A', bramka: false }).then((o3) => { OKNA.push(o3); return drugieOkno(o3, { bramka: false, localStorage: 'osobny' }); }))
      .rejects.toThrow(/wspólny localStorage/);
  }, 30_000);
});

// ── P-SYNC-NADAWCA-WPIECIA (E2-PR4e2; plan wiersz 8e2; decyzja 4 z 2026-11-11) ──────────────────────────────────────
// KT1–KT3  zmiana trybu przechowywania z „Komputer prywatny” na „Komputer w pracy” przy włączonym dzienniku
//          (VildaSync.isEventLogEnabled() === true, atrapa VildaSync w oknie): najpierw wysyłka kolejki
//          (sendOutboxBounded, limit 10 s, wpis rejestru jeszcze prywatny); po udanej — kasowanie kolejki konta; bez
//          sieci — znacznik ponowienia i kasowanie przy najbliższym odblokowaniu; inne konto niż bieżące — znacznik;
//          zmiana na prywatny — nic.
// KT4      uśpienie [zielony także na bazie]: bez dziennika (bez VildaSync albo isEventLogEnabled() fałsz, przy otwartym
//          polu bramki) — bez wysyłki, kasowania, znacznika i zapisów vilda-sync-*.
// KT5      po kasowaniu przy odblokowaniu (wpis chmurowy, znacznik) powrót do trybu prywatnego w tym samym oknie —
//          kolejka konta działa bez przeładowania; KT5b — to samo po kasowaniu w przeglądzie sierot.
// KT6      removeUser konta trwałego w trybie jednorazowym, potem blokada i logowanie tego konta w tym samym oknie —
//          kolejka konta działa.
// KT7      dwa removeUser tego samego konta w toku w różnych trybach logowania — każde kasuje według trybu swojego
//          wywołania (removeUser poza trybem jednorazowym kasuje kolejkę).
// KT8      applyEncryptedEvent w trakcie usuwania bieżącego konta (po odszyfrowaniu; na wejściu, sejf jeszcze
//          odblokowany) — session-changed, bez zastosowania.
// KT9      strażnik: kolejność blokad nadawca → baza (sejf nie żąda blokady nadawcy).
function dziennikSync(o, wynikWysylki) {
  const s = { limity: [], tryby: [] };
  o.win.VildaSync = {
    isEventLogEnabled: () => true,
    async sendOutboxBounded(ms) {
      s.limity.push(ms);
      s.tryby.push(await o.v.getStorageMode(o.A.userId));
      return typeof wynikWysylki === 'function' ? wynikWysylki() : wynikWysylki;
    },
  };
  return s;
}
const WYSLANE = Object.freeze({ ok: true, powod: null, partie: 1, wyslane: 1, odrzucone: 0, kod: null });
const BEZ_SIECI = Object.freeze({ ok: false, powod: 'odstep', partie: 0, wyslane: 0, odrzucone: 0, kod: 'NETWORK', ponowZaMs: 2000 });

describe('zmiana trybu przechowywania i koniec usuwania w oknie (E2-PR4e2)', () => {
  it('KT1 [czerwony na bazie]: „Komputer w pracy” przy włączonym dzienniku — najpierw wysyłka kolejki (wpis jeszcze prywatny, limit 10 s); po udanej wysyłce baza kolejki, identyfikator urządzenia i znacznik skasowane', async () => {
    const o = await nowe();
    const uid = o.A.userId;
    await dopisz(o, await karta(o));
    expect(o.jestBaza(), 'baza kolejki przed zmianą trybu').toBe(true);
    const s = dziennikSync(o, WYSLANE);
    expect(await o.v.setStorageMode(uid, 'cloud-only')).toEqual({ userId: uid, storageMode: 'cloud-only' });
    await o.cisza();
    expect(s.limity, 'jedna wysyłka z limitem 10 s').toEqual([10000]);
    expect(s.tryby, 'wysyłka przed zmianą wpisu rejestru').toEqual(['local']);
    expect(await o.v.getStorageMode(uid)).toBe('cloud-only');
    expect(stanKonta(o, uid), 'kolejka konta skasowana').toEqual(CZYSTO);
  }, 30_000);

  it('KT2 [czerwony na bazie]: bez sieci (wysyłka nieudana) — kolejka zostaje ze znacznikiem ponowienia, kasowanie przy najbliższym odblokowaniu (wpis chmurowy); inne konto — znacznik bez wysyłki', async () => {
    const o = await nowe({ konta: 'AB' });
    const uid = o.A.userId;
    await dopisz(o, await karta(o));
    const kluczPrzed = klucz(o);
    const s = dziennikSync(o, BEZ_SIECI);
    await o.v.setStorageMode(uid, 'cloud-only');
    await o.cisza();
    expect(s.limity).toEqual([10000]);
    expect(stanKonta(o, uid), 'kolejka czeka na odblokowanie').toEqual({ bazaKolejki: true, kluczUrzadzenia: kluczPrzed, znacznik: '1' });
    const z = o.znacznik();
    await o.zaloguj('A');
    await o.cisza();
    expect(ileWLogu(o, z, ['deleteDatabase', nazwaBazy(uid)]), 'kasowanie przy odblokowaniu').toBe(1);
    expect(stanKonta(o, uid), 'po najbliższym odblokowaniu').toEqual(CZYSTO);
    // konto B (niebieżące) — bez wysyłki (nadawca wysyła tylko kolejkę bieżącego konta), znacznik
    const uidB = o.B.userId;
    await o.v.setStorageMode(uidB, 'cloud-only');
    expect(s.limity, 'bez drugiej wysyłki').toEqual([10000]);
    expect(o.win.localStorage.getItem(kluczKasowania(uidB))).toBe('1');
  }, 30_000);

  it('KT3 [czerwony na bazie]: zmiana na „Komputer prywatny” i z trybu jednorazowego — bez wysyłki i znacznika; wysyłka zawieszona ponad limit nadawcy — wynik limitu daje znacznik', async () => {
    const o = await nowe();
    const uid = o.A.userId;
    await dopisz(o, await karta(o));
    const s = dziennikSync(o, { ok: false, powod: 'limit' });
    await o.v.setStorageMode(uid, 'local');
    expect(s.limity, 'prywatny → prywatny').toEqual([]);
    await o.v.setStorageMode(uid, 'cloud-only');
    expect(s.limity, 'prywatny → chmurowy').toEqual([10000]);
    expect(stanKonta(o, uid).znacznik, 'limit wysyłki — znacznik').toBe('1');
    o.win.localStorage.removeItem(kluczKasowania(uid));
    await o.v.setStorageMode(uid, 'cloud-only');
    expect(s.limity, 'chmurowy → chmurowy').toEqual([10000]);
    await o.v.setStorageMode(uid, 'local');
    expect(s.limity, 'chmurowy → prywatny').toEqual([10000]);
    expect(stanKonta(o, uid).znacznik, 'chmurowy → chmurowy i prywatny bez znacznika').toBe(null);
    // tryb „Zaloguj jednorazowo”: konto bez kolejki — bez wysyłki i znacznika
    o.zablokuj();
    o.v.setEphemeralMode(true);
    const j = await o.v.createUser('Fikcyjne#Jednorazowe!2026jj', { label: 'Fikcyjne konto jednorazowe', iterations: 1000 });
    await o.tlo();
    await o.v.setStorageMode(j.userId, 'cloud-only');
    expect(s.limity, 'tryb jednorazowy').toEqual([10000]);
    expect(o.win.localStorage.getItem(kluczKasowania(j.userId))).toBe(null);
  }, 30_000);

  it.each([['bez VildaSync', false], ['isEventLogEnabled() fałsz', true]])('KT4 [zielony także na bazie]: uśpienie (%s) — zmiana trybu bez wysyłki, kasowania, znacznika i zapisów vilda-sync-*', async (_, zSync) => {
    const o = await nowe();
    const uid = o.A.userId;
    await dopisz(o, await karta(o));
    const wysylki = [];
    if (zSync) o.win.VildaSync = { isEventLogEnabled: () => false, sendOutboxBounded: async (ms) => { wysylki.push(ms); return WYSLANE; } };
    const z = o.znacznik();
    const zapisy = zapisySync(o).length;
    await o.v.setStorageMode(uid, 'cloud-only');
    await o.v.setStorageMode(uid, 'local');
    await o.cisza();
    expect(ileWLogu(o, z, ['deleteDatabase']), 'kasowanie baz').toBe(0);
    expect(o.jestBaza(), 'baza kolejki nietknięta').toBe(true);
    expect(stanKonta(o, uid).znacznik).toBe(null);
    expect(zapisySync(o).slice(zapisy), 'zapisy vilda-sync-* w localStorage').toEqual([]);
    expect(wysylki, 'wysyłka przy wyłączonym dzienniku').toEqual([]);
  }, 30_000);

  it('KT5 [czerwony na bazie]: kasowanie przy odblokowaniu (wpis chmurowy, znacznik), potem powrót do „Komputer prywatny” w tym samym oknie — kolejka konta działa bez przeładowania', async () => {
    const o = await nowe();
    const uid = o.A.userId;
    await dopisz(o, await karta(o));
    await o.v.setStorageMode(uid, 'cloud-only'); // bez dziennika: tylko wpis rejestru
    o.win.localStorage.setItem(kluczKasowania(uid), '1');
    await o.zaloguj('A');
    await o.cisza();
    expect(stanKonta(o, uid), 'kolejka skasowana przy odblokowaniu').toEqual(CZYSTO);
    await o.v.setStorageMode(uid, 'local');
    await o.zaloguj('A');
    await o.cisza();
    const w = await o.ev.enqueue('snap', await karta(o, 2));
    expect(w.ok, `dopisanie po powrocie do trybu prywatnego: ${JSON.stringify(w)}`).toBe(true);
    await o.cisza();
    expect(o.jestBaza(), 'nowa baza kolejki').toBe(true);
  }, 30_000);

  it('KT5b [czerwony na bazie]: przegląd sierot przy odblokowaniu A kasuje kolejkę konta B z wpisem chmurowym; potem B w trybie prywatnym w tym samym oknie — kolejka B działa', async () => {
    const o = await nowe({ konta: 'AB', przeglad: true });
    const uidB = o.B.userId;
    await o.zaloguj('B');
    await dopisz(o, await karta(o, 5));
    expect(o.jestBaza('B')).toBe(true);
    await o.v.setStorageMode(uidB, 'cloud-only'); // bez dziennika: tylko wpis rejestru
    await o.zaloguj('A');
    await o.cisza();
    expect(o.jestBaza('B'), 'przegląd sierot skasował kolejkę B').toBe(false);
    await o.v.setStorageMode(uidB, 'local');
    await o.zaloguj('B');
    await o.cisza();
    const w = await o.ev.enqueue('snap', await karta(o, 6));
    expect(w.ok, `dopisanie konta B: ${JSON.stringify(w)}`).toBe(true);
  }, 30_000);

  it('KT6 [czerwony na bazie]: removeUser konta trwałego B w trybie jednorazowym, potem blokada i logowanie B w tym samym oknie — kolejka B działa', async () => {
    const o = await nowe({ konta: 'AB' });
    const uidB = o.B.userId;
    o.zablokuj();
    o.v.setEphemeralMode(true);
    await o.v.createUser('Fikcyjne#Jednorazowe!2026jj', { label: 'Fikcyjne konto jednorazowe', iterations: 1000 });
    await o.tlo();
    expect(await wynik(o.v.removeUser(uidB, o.B.haslo)), 'removeUser B w trybie jednorazowym').toEqual({ ok: true, w: true });
    await o.cisza();
    o.zablokuj();
    expect(o.v.isEphemeralMode()).toBe(false);
    await o.zaloguj('B');
    await o.cisza();
    const w = await o.ev.enqueue('snap', await karta(o, 3));
    expect(w.ok, `dopisanie konta B: ${JSON.stringify(w)}`).toBe(true);
    await o.cisza();
    expect(o.jestBaza('B'), 'baza kolejki B').toBe(true);
  }, 30_000);

  it('KT7 [czerwony na bazie]: dwa removeUser konta B w toku — pierwsze w trybie jednorazowym, drugie poza nim — drugie kasuje kolejkę B', async () => {
    const o = await nowe({ konta: 'AB' });
    const uidB = o.B.userId;
    await o.zaloguj('B');
    await dopisz(o, await karta(o, 4));
    expect(o.jestBaza('B')).toBe(true);
    o.zablokuj();
    // Pierwsze removeUser zatrzymane na blokadzie cyklu życia punktów odzyskiwania — już po oznaczeniu konta (w trybie
    // jednorazowym); dopiero wtedy zmiana trybu i drugie removeUser.
    const prawdziwe = o.locks.request.bind(o.locks);
    let pusc = null;
    const brama = new Promise((r) => { pusc = r; });
    let dotarl = null;
    const przyBlokadzie = new Promise((r) => { dotarl = r; });
    vi.spyOn(o.locks, 'request').mockImplementation((nazwa, ...a) => {
      if (dotarl && String(nazwa).startsWith('patient-clinical-checkpoint-lifecycle:')) {
        const d = dotarl;
        dotarl = null;
        d();
        return brama.then(() => prawdziwe(nazwa, ...a));
      }
      return prawdziwe(nazwa, ...a);
    });
    o.v.setEphemeralMode(true);
    const p1 = wynik(o.v.removeUser(uidB, o.B.haslo));
    await doczekaj(przyBlokadzie, 'pierwsze removeUser oznaczone, przed blokadą cyklu życia');
    o.v.setEphemeralMode(false);
    const p2 = wynik(o.v.removeUser(uidB, o.B.haslo));
    await doczekaj(p2, 'drugie removeUser');
    pusc();
    const [w1, w2] = await Promise.all([doczekaj(p1, 'pierwsze removeUser'), doczekaj(p2, 'drugie removeUser')]);
    await o.cisza();
    // Pierwsze (oznaczone w trybie jednorazowym) kończy się po zmianie trybu tak albo inaczej; drugie usuwa konto.
    expect(w1).toBeTruthy();
    expect(w2).toEqual({ ok: true, w: true });
    expect(stanKonta(o, uidB).bazaKolejki, 'baza kolejki B po drugim removeUser (poza trybem jednorazowym)').toBe(false);
  }, 30_000);

  it('KT8 [czerwony na bazie]: applyEncryptedEvent w trakcie removeUser bieżącego konta — na wejściu i po odszyfrowaniu session-changed, bez zastosowania', async () => {
    const o = await nowe();
    const uid = o.A.userId;
    const k = await karta(o);
    const env = (await o.ev.encryptEvent(await o.ev.buildSnapshotEvent(k.patientId, k.snapshotId, null))).env;
    expect(await o.ev.applyEncryptedEvent(env), 'kontrola: przed usuwaniem').toMatchObject({ status: 'applied' });
    // po odszyfrowaniu: removeUser rusza, gdy odszyfrowanie zdarzenia czeka
    const hd = wstrzymajKrypto(o, 'decrypt');
    const pE = o.ev.applyEncryptedEvent(env);
    await doczekaj(hd.osiagnieta, 'odszyfrowanie zdarzenia');
    const h = wstrzymaj(o, { przy: 'deleteDatabase', baza: BAZA_SEJFU(uid) });
    const pU = usun(o);
    await doczekaj(h.czeka, 'kasowanie bazy sejfu w removeUser (konto już oznaczone)');
    hd.zwolnij();
    expect(await doczekaj(pE, 'wynik zastosowania'), 'po odszyfrowaniu').toEqual({ status: 'session-changed' });
    // na wejściu: sejf jeszcze odblokowany (bieżące konto blokuje się po usunięciu wpisu rejestru)
    expect(o.v.isUnlocked(), 'kontrola: sejf odblokowany w trakcie kasowania bazy sejfu').toBe(true);
    const odKrypto = o.krypto.log.length;
    expect(await o.ev.applyEncryptedEvent(env), 'na wejściu').toEqual({ status: 'session-changed' });
    expect(o.krypto.log.slice(odKrypto).filter((x) => x.metoda === 'decrypt'), 'na wejściu bez odszyfrowania').toEqual([]);
    h.zwolnij();
    expect(await pU).toEqual({ ok: true, w: true });
  }, 30_000);

  it('KT9: strażnik — sejf nie żąda blokady nadawcy (vilda-outbox-sender), więc kolejność blokad jest stała: nadawca, potem blokada bazy kolejki konta', () => {
    expect(fs.readFileSync(path.join(KORZEN_REPO, 'vilda_vault.js'), 'utf8').includes('vilda-outbox-sender')).toBe(false);
    expect(fs.readFileSync(path.join(KORZEN_REPO, 'vilda_sync.js'), 'utf8')).toContain("Bns_BLOKADA = 'vilda-outbox-sender:'");
  });
});
