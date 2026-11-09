// P-DZIENNIK-ZDARZEN (E2-PR3a4) — przegląd kolejki zmian (VildaVault._eventLog.sweepOutbox; uśpione: przy zamkniętej
// bramce każde wywołanie kończy się na bramce). Przegląd porównuje encje sejfu z wierszami kolejki vilda_sync_<userId>
// i dokłada zmianę bez wiersza (limit blokady konta, brak miejsca, blokada sejfu, zapis przy zamkniętej bramce): okno od
// znacznika przeglądu − 10 min (rekord „przeglad” sklepu meta bazy kolejki; pierwszy znacznik — klucz ostatniej wysyłki
// vilda-sync-last-push-ok-v1:<userId>, potem chwila ostatniego scalenia, potem „wszystko”), pokrycie wierszem
// o createdAtISO nie wcześniejszym niż chwila zmiany albo parą z pamięci par (scalanie z chmury, wiersze przyjęte, pary
// utrwalone w rekordzie „pary”). Przegląd jest krokiem łańcucha dopisań konta: rusza na początku odblokowania (z przeglądem
// sierot), po bezczynności łańcucha (przegląd pilny po limicie blokady konta albo należny po dobie) i z sweepOutbox().
// Prawdziwy sejf w oknie uprzęży tests/support/okno-magazynu.mjs (emisja: true, przeglad: true, moduły punktu odzyskiwania)
// na adapterze IndexedDB sejfu nad atrapą tests/support/atrapa-indexeddb.mjs (tryb „Komputer prywatny”, jeśli przypadek
// nie mówi inaczej), ładowany z kopii źródła z licznikiem (tests/support/sejf-bez-wstawek.mjs: emisje, przeglądy i odczyty
// bramki w scaleniu — l.emisje, l.przeglady, l.scalenia). Pole okna VILDA_EVENT_LOG z getterem (stan i licznik odczytów);
// konta zakładane przy zamkniętej bramce. Bliźniak — okno na niezależnej kopii baz atrapy (o.idb.__atrapa.klonuj()) z tym
// samym kontem i zamkniętą bramką; „przeładowanie strony” — nowe okno na tej samej atrapie, z tym samym localStorage
// i blokadami, logowanie przy otwartej bramce. Sztuczny zegar (tylko Date) z jawnym krokiem; po każdej operacji
// emissionsSettled() i cisza okna. Dane WYŁĄCZNIE FIKCYJNE („Testowy Jan…”, „Fikcyjna notatka…”), bez PESEL.
//
// HIGIENA: po przypadku blokady testu zwolnione, cisza każdego okna, zero otwartych połączeń baz kolejki, zero
// transakcji atrapy w toku, każde wstrzymanie zwolnione.
//
// PRZYPADKI
//   PG1  bramka zamknięta: sweepOutbox() → { ok: false, powod: 'bramka' }; sweepOutbox(), odblokowanie i scalenie pełnego
//        ładunku — po jednym odczycie pola bramki; w funkcjach przeglądu (opakowanie kopii) 0 odczytów indexedDB,
//        localStorage i crypto; bez bazy vilda_sync_*, blokad, kluczy vilda-sync-* i nowych zegarów okna.
//   PG2  pierwszy przegląd bez znacznika, klucza wysyłki i chwili scalenia: wiersz każdej encji (2 × snap) i cred;
//        w meta znacznik = start przeglądu i pary.
//   PG3  pierwszy znacznik z klucza ostatniej wysyłki: karta sprzed klucza − 10 min pominięta, zmiana 5 min przed kluczem
//        i karta po nim dopisane; klucz tylko czytany.
//   PG4  pierwszy znacznik z chwili ostatniego scalenia (bez klucza): tylko zmiany po scaleniu − 10 min.
//   PG5  pierwsza aktywacja nie dopisuje całej bazy (50 kart sprzed 2 h, klucz sprzed 1 h): 0 wierszy i bez bazy
//        kolejki; znacznik w meta dopiero w bazie z pierwszym wierszem (przy następnym zakończonym przeglądzie).
//   PG6  zmiana bez wiersza w trakcie sesji — dołożona przy odblokowaniu, drugi przegląd nic; zmiana w trakcie przeglądu
//        (zapis znacznika wstrzymany, zegar + 15 min) — znacznik to start przeglądu, następny przegląd ją dokłada.
//   PG7  wiersz oczekujący sprzed późniejszej zmiany bez wiersza: jeden wiersz z nowszą chwilą, nowym seqLocal i nowszą
//        treścią (łączenie na ogonie).
//   PG8  pokrycie przeglądu: każda z 26 mutacji danych, wiersze emisji usunięte w atrapie — przegląd dokłada każdą encję
//        emisji; nadmiar = literał (snap najnowszej wersji przy zmianie karty bez nowej wersji).
//   PG9  limit blokady konta (SYNC_DB_TIMEOUT): po zwolnieniu blokady przegląd pilny dokłada snap bez innej czynności;
//        limit także przy dopisaniu przeglądu — jeden przegląd, bez następnego pilnego.
//   PG10 SYNC_DB_DELETED (dopisanie w trakcie removeUser tego konta): bez przeglądu pilnego.
//   PG11 brak miejsca (QuotaExceededError przy zatwierdzeniu): bez wiersza i bez przeglądu pilnego, sweepOutbox() dokłada;
//        brak miejsca przy pierwszym dopisaniu przeglądu — koniec bez dalszych dopisań i bez przesunięcia znacznika.
//   PG12 przegląd należny: zmiana bez wiersza, zegar + 24 h, emisja — po bezczynności łańcucha przegląd ją dokłada;
//        bez + 24 h — nie.
//   PG13 przegląd nieudany (usterka zapisu znacznika): znacznik bez zmian; doba liczona od próby.
//   PG14 odtworzenie konta z kopii, potem odblokowanie: wiersze partii bez powtórzeń.
//   PG15 sweepOutbox() w otwartym kroku (kosz czeka na blokadę karty): przegląd czeka do końca kroku i rusza po jego
//        wpisach, bez osobnych wierszy encji kroku.
//   PG16 pary scalania w sesji: po scaleniu pełnego ładunku bliźniaka dopisane tylko 2 wersje własne; pary w meta.
//   PG17 pary utrwalone: po przeładowaniu strony i odblokowaniu 0 wierszy (wiersz, gdyby powstał, zastosowany
//        u bliźniaka nie zmienia jego eksportu).
//   PG18 pary z wierszy przyjętych (outboxAccept): 0 w sesji i 0 po przeładowaniu.
//   PG19 pamięć par ograniczona i wygasająca: para z chwilą nie późniejszą niż próg pominięta, po przeglądzie w meta
//        tylko pary po nowym progu; ładunek z 20 001 parami — w meta 20 000 najpóźniejszych.
//   PG20 importy (import pliku karty, scalenie i odtworzenie kopii konta): bez odczytu bramki w scaleniu i bez par —
//        wiersze partii usunięte, przegląd je dokłada.
//   PG21 strzeżony adapter: removeUser w toku → SYNC_DB_DELETED bez operacji na bazie sejfu i bazie kolejki; oznaczenie
//        konta w trakcie przeglądu — koniec bez dalszych odczytów bazy sejfu.
//   PG22 sesja: przełączenie na konto B w trakcie przeglądu A — bez wierszy u A i u B, znacznik A bez zmian.
//   PG23 rekordy pochodne scalania z nową chwilą: plan opieki scalony równolegle (rewizja max + 1, chwila scalenia)
//        i ratunek notatki D-21 — przegląd dokłada pnote.
//   PG24 przegląd sierot przy odblokowaniu: baza kolejki konta bez wpisu rejestru i konta „Komputer w pracy” usunięte bez
//        znacznika ponowienia, kolejki A i prywatnego B zostają; „Zaloguj jednorazowo” i okno bez databases() — nic.
//   PG25 „Komputer w pracy” i „Zaloguj jednorazowo” przy otwartej bramce: koniec na trybie, bez bazy, kluczy i blokad.
//   PG26 10 dni bez połączenia (bliźniak: 30 kart, 60 wersji; A: 10 notatek biblioteki bez wiersza): przy odblokowaniu
//        10 własnych, po scaleniu pełnego ładunku 0, po przeładowaniu 0.
//   PG27 nagrobek klucza dostępu usuniętego przy zablokowanym sejfie: przy odblokowaniu pktomb.
//   PG28 przegląd rusza przed słuchaczami odblokowania: emissionsSettled() ze słuchacza onUnlock czeka na przegląd.
//   PG29 pamięć braków: wpis łańcucha bez wiersza (limit blokady konta, blokada sejfu) przegląd dokłada bez względu na
//        okno i na wiersz tej encji sprzed usunięcia karty (wersje z pliku importu z chwilami sprzed okna); następny
//        przegląd nic.
//
// Każdy przypadek poza strażnikami PG10 i PG25 zaczyna od sprawdzenia, że sejf ma część przeglądu
// (VildaVault._eventLog.sweepOutbox).
// Czerwone na bazie (77b05e6f — sejf bez przeglądu kolejki; 37 przypadków z wariantami): 35 — PG1–PG9 (PG6 ×2, PG9 ×2),
// PG11–PG24 (PG11 ×2, PG19 ×2, PG21 ×2, PG23 ×2, PG24 ×2), PG26–PG28, PG29 ×2. Zielone z natury (strażniki regresji): PG10
// (bez przeglądu nie ma przeglądu pilnego po SYNC_DB_DELETED), PG25 (tryby bez kolejki: bez bazy, kluczy i blokad także
// bez przeglądu).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PRZEDROSTEK_KASOWANIA, SKRYPTY_PUNKTU, bazaKolejki, drugieOkno, naAtrapie, nazwaBazy, nazwaBlokady, oknoMagazynu,
  przechwycZadaniaWTle, wierszKolejki,
} from '../support/okno-magazynu.mjs';
import { naglowek, wynik } from './sesja-zapisu-uprzaz.mjs';
import { licznikEmisji } from '../support/sejf-bez-wstawek.mjs';
import { utworzIndexedDB } from '../support/atrapa-indexeddb.mjs';

const START = Date.parse('2026-03-02T08:00:00.000Z');
const MIN = 60_000;
const GODZ = 3_600_000;
const DOBA = 86_400_000;
const NOWE_HASLO = 'Fikcyjne#NoweHaslo!2026xx';
const KLUCZ_WYSYLKI = 'vilda-sync-last-push-ok-v1';
let zegar = START;
const tik = (ms = 1000) => { zegar += ms; vi.setSystemTime(zegar); };
const iso = (ms = zegar) => new Date(ms).toISOString();
const makrozadanie = () => new Promise((r) => { setImmediate(r); });

const OKNA = [];
const UCHWYTY = [];

beforeEach(() => {
  przechwycZadaniaWTle();
  vi.useFakeTimers({ toFake: ['Date'] });
  zegar = START;
  vi.setSystemTime(zegar);
  vi.stubGlobal('fetch', async () => { throw new Error('Fikcyjny brak sieci'); });
});
afterEach(async () => {
  const bledy = [];
  for (const u of UCHWYTY.splice(0)) if (!u.zwolniony) { bledy.push('wstrzymanie bez zwolnienia'); u.zwolnij(); }
  for (const o of OKNA) { if (o.locks) await o.locks.zwolnijWszystkie(); }
  const atrapy = new Set(OKNA.map((o) => o.idb));
  for (const o of OKNA) { try { await o.cisza(); } catch (x) { bledy.push(String(x && x.message)); } }
  for (const idb of atrapy) {
    const p = idb.__atrapa.polaczenia(/^vilda_sync_/);
    if (p) bledy.push(`otwarte połączenia baz kolejki: ${p}`);
    if (idb.__atrapa.wToku()) bledy.push(`transakcje atrapy w toku: ${idb.__atrapa.wToku()}`);
    if (idb.__atrapa.niezwolnione()) bledy.push(`wstrzymania atrapy bez zwolnienia: ${idb.__atrapa.niezwolnione()}`);
  }
  for (const o of OKNA.splice(0)) { o.krypto.rozbroj(); o.timery.wyczysc(); }
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  expect(bledy, 'higiena po przypadku').toEqual([]);
}, 60_000);

// ── Okna ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Pole bramki z getterem: stan i licznik odczytów; o.bezEmisji(fn) — zapis przy zamkniętej bramce (zmiana bez wiersza).
function zBramka(o, l, otwarta) {
  const stan = { otwarta, odczyty: 0 };
  Object.defineProperty(o.win, 'VILDA_EVENT_LOG', {
    get() { stan.odczyty += 1; return stan.otwarta; },
    set(x) { stan.otwarta = x; },
    configurable: true,
  });
  o.l = l;
  o.bramka = stan;
  o.uid = o.A.userId;
  o.gotowe = async () => { await o.ev.emissionsSettled(); await o.cisza(); };
  o.bezEmisji = async (fn) => {
    const byla = stan.otwarta;
    stan.otwarta = false;
    try { return await fn(); } finally { stan.otwarta = byla; }
  };
  return o;
}
// Okno z kopią sejfu z licznikiem (emisje, przeglądy, scalenia); przegląd przy odblokowaniu jak w przeglądarce.
// Konta zakładane przy zamkniętej bramce (pole okna bez wartości; odOtwartej: true — przy otwartej, np. tryb „Zaloguj
// jednorazowo”, w którym założenie konta jest jedynym odblokowaniem), potem bramka według opcji.
async function okno({ bramka = true, opakuj = false, wymagaj = true, odOtwartej = false, ...reszta } = {}) {
  const l = licznikEmisji({ opakuj });
  const o = await oknoMagazynu({ konta: 'A', skrypty: SKRYPTY_PUNKTU, ...reszta, emisja: true, przeglad: true, bramka: odOtwartej, zrodla: { 'vilda_vault.js': l.zaladuj } });
  OKNA.push(o);
  zBramka(o, l, bramka);
  if (wymagaj) expect(typeof o.ev.sweepOutbox, 'część przeglądu kolejki (VildaVault._eventLog.sweepOutbox)').toBe('function');
  return o;
}
// „Przeładowanie strony”: nowe okno na tej samej atrapie, z tym samym localStorage i blokadami, bez logowania.
async function przeladuj(o) {
  const l = licznikEmisji();
  const o2 = await drugieOkno(o, { zaloguj: null, emisja: true, przeglad: true, bramka: false, zrodla: { 'vilda_vault.js': l.zaladuj } });
  OKNA.push(o2);
  return zBramka(o2, l, true);
}
// Bliźniak: niezależna kopia baz atrapy z tym samym kontem (ten sam klucz), bramka zamknięta.
async function blizniak(o) {
  const B = await oknoMagazynu({ idb: o.idb.__atrapa.klonuj(), istniejace: { A: o.A, B: o.B }, bramka: false, konta: 'A', zaloguj: 'A', skrypty: SKRYPTY_PUNKTU });
  OKNA.push(B);
  return B;
}

// ── Dane fikcyjne i pomocnicze ───────────────────────────────────────────────────────────────────────────────────────
const klucz = (w) => `${w.kind}|${w.entityKey}`;
const klucze = (o, kto = 'A') => o.kolejka(kto).map(klucz);
const po = (o, od, kto = 'A') => o.kolejka(kto).filter((w) => w.seqLocal > od).map(klucz);
const ostatni = (o, kto = 'A') => o.kolejka(kto).reduce((m, w) => Math.max(m, w.seqLocal), 0);
const metaKonta = (o, kto = 'A') => Object.fromEntries(o.meta(kto).map((m) => [m.k, m.v]));
// Zmiana bez wiersza: wiersze usunięte wprost w sklepie outbox bazy kolejki (poza sejfem).
const usunWiersze = (o, eids, uid = o.uid) => naAtrapie(o.idb, nazwaBazy(uid), ['outbox'], 'readwrite', (tx) => { for (const e of eids) tx.objectStore('outbox').delete(e); });
async function karta(o, i = 1) {
  const r = await o.v.savePatient(naglowek(i), { dedup: false });
  tik();
  const r2 = await o.v.savePatient(naglowek(i, { masa: 23 }), { dedup: false, patientId: r.patientId });
  tik();
  return { P: r.patientId, S1: r.snapshotId, S2: r2.snapshotId };
}
const snapy = (k) => [`snap|${k.P}/${k.S1}`, `snap|${k.P}/${k.S2}`];
async function notatkaBiblioteki(o, tytul = 'Fikcyjny szablon', tresc = 'Fikcyjna treść szablonu.') {
  const n = await o.v.saveNote({ title: tytul, category: 'badanie', body: tresc });
  tik();
  return n.id;
}
function wstrzymaj(o, wz) {
  const h = o.idb.__atrapa.wstrzymaj(wz);
  const u = { czeka: h.czeka, zwolniony: false, zwolnij() { u.zwolniony = true; h.zwolnij(); } };
  UCHWYTY.push(u);
  return u;
}
async function czekajNa(warunek, opis) {
  for (let i = 0; i < 20000; i += 1) {
    if (warunek()) return;
    await makrozadanie();
  }
  throw new Error(`nie doczekano się: ${opis}`);
}
async function jeszczeCzeka(obietnica, n = 30) {
  let gotowe = false;
  obietnica.then(() => { gotowe = true; }, () => { gotowe = true; });
  for (let i = 0; i < n; i += 1) await makrozadanie();
  return !gotowe;
}
// Atrapa WebAuthn (VildaCrypto okna): rejestracja bez urządzenia.
function atrapaKluczy(o) {
  const c = o.win.VildaCrypto;
  let n = 0;
  const sekret = () => new Uint8Array(32).fill(7);
  c.createPasskeyAndGetPrfSecret = async () => { n += 1; return { credentialId: `fikcyjny-klucz-${n}`, prfSecretBytes: sekret() }; };
  c.getPasskeyPrfSecret = async (id) => ({ credentialId: id, prfSecretBytes: sekret() });
}
const bazyKolejki = async (o) => (await o.idb.databases()).map((d) => d.name).filter((n) => n.startsWith('vilda_sync_'));
const kluczeSync = (o) => Object.keys(o.lokalny.m).filter((k) => k.startsWith('vilda-sync-'));
const zadaniaKolejki = (o) => (o.locks ? o.locks.zadania.filter((z) => !z.test && z.nazwa.startsWith('vilda-sync')) : []);

describe('PG1: bramka zamknięta', () => {
  it('PG1: część przeglądu istnieje; przy zamkniętej bramce sweepOutbox(), odblokowanie i scalenie pełnego ładunku — jeden odczyt pola bramki na wywołanie, w funkcjach przeglądu bez indexedDB, localStorage i crypto, bez bazy kolejki i nowych zegarów', async () => {
    const o = await okno({ bramka: false, opakuj: true });
    const B = await blizniak(o);
    await karta(B, 5);
    await B.v.saveNote({ title: 'Fikcyjny szablon B', category: 'badanie', body: 'Fikcyjna treść B.' });
    tik();
    const ladunek = await B.v.exportSyncPayload();
    await o.cisza();
    const pola = { indexedDB: 0, localStorage: 0, crypto: 0 };
    for (const pole of Object.keys(pola)) {
      const w = o.win[pole];
      Object.defineProperty(o.win, pole, { get() { if (o.l.wEmisji()) pola[pole] += 1; return w; }, configurable: true });
    }
    const zegary = o.timery.oczekujace().map((t) => t.ms).sort();
    const pomiar = async (fn) => {
      tik();
      const z = { odczyty: o.bramka.odczyty, przeglady: o.l.przeglady.length, scalenia: o.l.scalenia.length, emisje: o.l.emisje.length };
      const w = await fn();
      await o.gotowe();
      return { w, odczyty: o.bramka.odczyty - z.odczyty, przeglady: o.l.przeglady.slice(z.przeglady), scalenia: o.l.scalenia.length - z.scalenia, emisje: o.l.emisje.length - z.emisje };
    };
    const sw = await pomiar(() => o.ev.sweepOutbox());
    const od = await pomiar(() => o.zaloguj('A'));
    const sc = await pomiar(() => o.v.mergeSyncPayload(ladunek));
    expect(sw.w).toEqual({ ok: false, powod: 'bramka' });
    expect([sw.odczyty, sw.przeglady, sw.scalenia, sw.emisje], 'sweepOutbox(): odczyty, przeglądy, scalenia, emisje').toEqual([1, [{ sieroty: false }], 0, 0]);
    expect([od.odczyty, od.przeglady, od.scalenia, od.emisje], 'odblokowanie').toEqual([1, [{ sieroty: true }], 0, 0]);
    expect([sc.odczyty, sc.przeglady, sc.scalenia, sc.emisje], 'scalenie pełnego ładunku').toEqual([1, [], 1, 0]);
    expect(pola, 'odczyty pól okna w funkcjach przeglądu').toEqual({ indexedDB: 0, localStorage: 0, crypto: 0 });
    expect(await bazyKolejki(o), 'bazy vilda_sync_*').toEqual([]);
    expect(o.logKolejki(), 'wpisy vilda_sync_* w dzienniku atrapy').toEqual([]);
    expect(zadaniaKolejki(o), 'blokady vilda-sync*').toEqual([]);
    expect(kluczeSync(o), 'klucze vilda-sync-*').toEqual([]);
    expect(o.timery.oczekujace().map((t) => t.ms).sort(), 'zegary okna').toEqual(zegary);
  }, 60_000);
});

describe('PG2–PG7: znacznik przeglądu, pierwszy znacznik, zmiana bez wiersza, pokrycie wierszem', () => {
  it('PG2: pierwszy przegląd bez znacznika, bez klucza ostatniej wysyłki i bez chwili scalenia — wiersz każdej encji i poświadczenia; w meta znacznik = start przeglądu i pary', async () => {
    const o = await okno({ bramka: false });
    const k = await karta(o, 1);
    await o.gotowe();
    o.bramka.otwarta = true;
    tik();
    const start = iso();
    await o.zaloguj('A');
    await o.gotowe();
    expect(klucze(o)).toEqual([...snapy(k), 'cred|cred']);
    expect(o.meta('A').map((m) => m.k)).toEqual(['licznik', 'pary', 'przeglad']);
    expect(metaKonta(o)).toMatchObject({ przeglad: start, pary: {} });
  }, 60_000);

  it('PG3: pierwszy znacznik z klucza ostatniej wysyłki — karta sprzed klucza − 10 min pominięta, zmiana 5 min przed kluczem i karta po nim dopisane; klucz bez zapisu', async () => {
    const o = await okno({ bramka: false });
    await karta(o, 1);
    tik(25 * MIN);
    const n = await notatkaBiblioteki(o);
    tik(5 * MIN);
    const wysylka = iso();
    tik(30 * MIN);
    const k2 = await karta(o, 2);
    await o.gotowe();
    const kl = `${KLUCZ_WYSYLKI}:${o.uid}`;
    o.lokalny.m[kl] = wysylka;
    o.bramka.otwarta = true;
    await o.zaloguj('A');
    await o.gotowe();
    expect(klucze(o)).toEqual([...snapy(k2), `note|${n}`]);
    expect(o.lokalny.m[kl], 'klucz ostatniej wysyłki bez zmian').toBe(wysylka);
    expect(o.dziennik.filter((d) => d.klucz === kl), 'zapisy klucza ostatniej wysyłki').toEqual([]);
  }, 60_000);

  it('PG4: pierwszy znacznik z chwili ostatniego scalenia (bez klucza wysyłki) — tylko zmiany po scaleniu − 10 min', async () => {
    const o = await okno({ bramka: false });
    const B = await blizniak(o);
    await karta(o, 1);
    tik(25 * MIN);
    const n = await notatkaBiblioteki(o);
    tik(5 * MIN);
    await o.v.mergeSyncPayload(await B.v.exportSyncPayload());
    tik(30 * MIN);
    const k2 = await karta(o, 2);
    await o.gotowe();
    o.bramka.otwarta = true;
    await o.zaloguj('A');
    await o.gotowe();
    expect(klucze(o)).toEqual([...snapy(k2), `note|${n}`]);
  }, 60_000);

  it('PG5: pierwsza aktywacja nie dopisuje całej bazy — 50 kart sprzed 2 h, klucz wysyłki sprzed 1 h: 0 wierszy, bez bazy kolejki; znacznik dopiero w bazie z pierwszym wierszem', async () => {
    const o = await okno({ bramka: false });
    for (let i = 1; i <= 50; i += 1) await o.v.savePatient(naglowek(i), { dedup: false });
    tik(GODZ);
    o.lokalny.m[`${KLUCZ_WYSYLKI}:${o.uid}`] = iso();
    tik(GODZ);
    await o.gotowe();
    o.bramka.otwarta = true;
    await o.zaloguj('A');
    await o.gotowe();
    expect(o.jestBaza('A'), 'baza kolejki po przeglądzie bez dopisań').toBe(false);
    expect(o.kolejka('A')).toEqual([]);
    const n = await notatkaBiblioteki(o);
    await o.gotowe();
    expect(klucze(o)).toEqual([`note|${n}`]);
    expect(o.meta('A').map((m) => m.k), 'meta po pierwszym wierszu').toEqual(['licznik']);
    tik();
    const start = iso();
    const sw = await o.ev.sweepOutbox();
    await o.gotowe();
    expect(sw).toEqual({ ok: true, kandydaci: 1, dopisane: 0 });
    expect(metaKonta(o)).toMatchObject({ przeglad: start, pary: {} });
    expect(klucze(o)).toEqual([`note|${n}`]);
  }, 60_000);

  it('PG6: zmiana bez wiersza w trakcie sesji (zapis przy zamkniętej bramce) — przegląd przy odblokowaniu ją dokłada; drugi przegląd nic', async () => {
    const o = await okno();
    await o.zaloguj('A');
    const k = await karta(o, 1);
    await o.gotowe();
    const s0 = ostatni(o);
    const r = await o.bezEmisji(() => o.v.savePatient(naglowek(1, { masa: 24 }), { dedup: false, patientId: k.P }));
    tik();
    const n = await o.bezEmisji(() => notatkaBiblioteki(o));
    await o.gotowe();
    expect(po(o, s0), 'zapisy przy zamkniętej bramce').toEqual([]);
    o.zablokuj();
    tik(MIN);
    await o.zaloguj('A');
    await o.gotowe();
    expect(po(o, s0)).toEqual([`snap|${k.P}/${r.snapshotId}`, `note|${n}`]);
    const sw = await o.ev.sweepOutbox();
    await o.gotowe();
    expect(sw).toEqual({ ok: true, kandydaci: 5, dopisane: 0 });
  }, 60_000);

  it('PG6: zmiana bez wiersza w trakcie przeglądu (zapis znacznika wstrzymany, zegar +15 min) — znacznik to start przeglądu, następny przegląd ją dokłada', async () => {
    const o = await okno();
    await o.zaloguj('A');
    await notatkaBiblioteki(o);
    await o.gotowe();
    tik(MIN);
    const start = iso();
    const h = wstrzymaj(o, { przy: 'commit', baza: nazwaBazy(o.uid), tryb: 'readwrite' });
    const p = o.ev.sweepOutbox();
    await h.czeka;
    tik(MIN);
    const n = await o.bezEmisji(() => notatkaBiblioteki(o, 'Fikcyjny szablon 2'));
    tik(15 * MIN);
    h.zwolnij();
    expect(await p).toEqual({ ok: true, kandydaci: 2, dopisane: 0 });
    await o.gotowe();
    expect(metaKonta(o).przeglad, 'znacznik = start przeglądu').toBe(start);
    const s0 = ostatni(o);
    const sw = await o.ev.sweepOutbox();
    await o.gotowe();
    expect(sw).toEqual({ ok: true, kandydaci: 3, dopisane: 1 });
    expect(po(o, s0)).toEqual([`note|${n}`]);
  }, 60_000);

  it('PG7: wiersz oczekujący sprzed późniejszej zmiany bez wiersza — jeden wiersz encji z nowszą chwilą i nowym seqLocal (łączenie na ogonie), treść nowsza', async () => {
    const o = await okno();
    await o.zaloguj('A');
    const n = await o.v.saveNote({ title: 'Fikcyjny szablon', category: 'badanie', body: 'Fikcyjna treść 1.' });
    await o.gotowe();
    const przed = o.kolejka('A').find((w) => w.kind === 'note');
    tik(MIN);
    await o.bezEmisji(() => o.v.saveNote({ id: n.id, title: 'Fikcyjny szablon', category: 'badanie', body: 'Fikcyjna treść 2.' }));
    tik(MIN);
    const sw = await o.ev.sweepOutbox();
    await o.gotowe();
    expect(sw).toEqual({ ok: true, kandydaci: 2, dopisane: 1 });
    const wiersze = o.kolejka('A').filter((w) => w.kind === 'note');
    expect(wiersze, 'jeden wiersz notatki').toHaveLength(1);
    const [w] = wiersze;
    expect(w.seqLocal, 'nowy seqLocal').toBeGreaterThan(przed.seqLocal);
    expect(w.createdAtISO > przed.createdAtISO, 'nowsza chwila wiersza').toBe(true);
    const tresc = JSON.stringify(await o.v.decryptPayloadForCurrentUser(w.env.iv, w.env.data));
    expect(tresc).toContain('Fikcyjna treść 2.');
  }, 60_000);
});

// ── PG8 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
// 26 mutacji danych z listy pokrycia przeglądu; s — stan scenariusza. Wpis: [nazwa, mutacja, przygotowanie?]
// (przygotowanie przed przeglądem, który ustawia znacznik — jego wiersze nie należą do mutacji).
function mutacje(o, s) {
  const v = o.v;
  const notatka = (tytul, pola = {}) => ({ patientId: s.karta1, title: tytul, body: 'Fikcyjna treść.', category: 'inne', ...pola });
  const pomiary = [[96, 110], [108, 115], [120, 120]];
  return [
    ['savePatient', async () => { const r = await v.savePatient(naglowek(1, { pomiary }), { dedup: false }); s.karta1 = r.patientId; s.wersja1 = r.snapshotId; }],
    ['savePatient (nowa wersja)', async () => { s.wersja2 = (await v.savePatient(naglowek(1, { masa: 23, pomiary }), { dedup: false, patientId: s.karta1 })).snapshotId; }],
    ['updateSnapshotPayload', async () => {
      const w = (await v.getPatient(s.karta1)).snapshots.find((x) => x.snapshotId === s.wersja1);
      return v.updateSnapshotPayload(s.karta1, s.wersja1, { ...w.payload, user: { ...w.payload.user, weight: 21 } }, { preserveSavedAt: true });
    }],
    ['setSnapshotPinned', () => v.setSnapshotPinned(s.karta1, s.wersja1, true)],
    ['setSnapshotPinned (zdjęcie)', () => v.setSnapshotPinned(s.karta1, s.wersja1, false)],
    ['updateMeasurementRow', () => v.updateMeasurementRow(s.karta1, { key: '108|115.00|20.00' }, { height: 116 })],
    ['deleteMeasurementRow', () => v.deleteMeasurementRow(s.karta1, { key: '96|110.00|20.00' })],
    ['moveSnapshotToTrash', () => v.moveSnapshotToTrash(s.karta1, s.wersja1, { odepnij: true })],
    ['restoreTrashedSnapshot', () => v.restoreTrashedSnapshot(s.karta1, s.wersja1)],
    ['restoreSnapshotAsNew', async () => { s.wersja3 = (await v.restoreSnapshotAsNew(s.karta1, s.wersja1)).newSnapshotId; }],
    ['pruneSnapshotsForPatient', () => v.pruneSnapshotsForPatient(s.karta1, { recentHours: 0 })],
    ['mergePatients', () => v.mergePatients(s.karta2, s.karta1), async () => { s.karta2 = (await v.savePatient(naglowek(2), { dedup: false })).patientId; }],
    ['removePatient', () => v.removePatient(s.karta3), async () => { s.karta3 = (await v.savePatient(naglowek(3), { dedup: false })).patientId; }],
    ['savePatientNote', async () => { s.notatka1 = (await v.savePatientNote(notatka('Fikcyjna notatka 1', { dueDateISO: '2026-03-20' }))).id; }],
    ['completePatientNote', () => v.completePatientNote(s.notatka1)],
    ['snoozePatientNote', () => v.snoozePatientNote(s.notatka1, '2027-02-02')],
    ['removePatientNote', () => v.removePatientNote(s.notatka1)],
    ['mutateCarePlan', async () => { s.plan = (await v.mutateCarePlan({ patientId: s.karta1, operationId: 'fikcyjna-operacja-planu-1', action: 'create', title: 'Fikcyjny plan opieki' })).planId; }],
    ['saveNote', async () => { s.szablon1 = (await v.saveNote({ title: 'Fikcyjny szablon', category: 'badanie', body: 'Fikcyjna treść szablonu.' })).id; }],
    ['removeNote', () => v.removeNote(s.szablon1)],
    ['savePatientList', async () => { s.lista1 = (await v.savePatientList({ name: 'Fikcyjna lista', memberIds: [s.karta1] })).id; }],
    ['deletePatientList', () => v.deletePatientList(s.lista1)],
    ['addWaitlistList', () => v.addWaitlistList('Fikcyjny zabieg 1')],
    ['registerPasskey', () => v.registerPasskey('Fikcyjny telefon')],
    ['removePasskey', () => v.removePasskey(o.uid, 'fikcyjny-klucz-1')],
    ['changePassword', async () => { await v.changePassword(o.A.haslo, NOWE_HASLO); o.A.haslo = NOWE_HASLO; }],
  ];
}
// Klucz encji z nazwami zamiast identyfikatorów (karta1, wersja1, …); identyfikator spoza scenariusza — „?”.
function nazwy(s) {
  const m = new Map(Object.entries(s).filter(([, x]) => typeof x === 'string').map(([k, x]) => [x, k]));
  return (kl) => kl.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, (x) => m.get(x) || '?');
}

describe('PG8: pokrycie przeglądu', () => {
  it('PG8: każda z 26 mutacji — wiersze emisji usunięte, przegląd dokłada każdą encję emisji; nadmiar tylko snap najnowszej wersji karty przy zmianie karty bez nowej wersji', async () => {
    const o = await okno();
    atrapaKluczy(o);
    await o.zaloguj('A');
    await o.gotowe();
    const s = {};
    const lista = mutacje(o, s);
    expect(lista).toHaveLength(26);
    const wyniki = {};
    for (const [nazwa, fn, przygotowanie] of lista) {
      if (przygotowanie) { tik(); await przygotowanie(); await o.gotowe(); }
      tik(MIN);
      const pr = await o.ev.sweepOutbox();
      await o.gotowe();
      tik(MIN);
      const przed = new Set(o.kolejka('A').map((w) => w.eid));
      await fn();
      tik();
      await o.gotowe();
      const nowe = o.kolejka('A').filter((w) => !przed.has(w.eid));
      const emisja = nowe.map(klucz);
      await usunWiersze(o, nowe.map((w) => w.eid));
      const zostaly = new Set(o.kolejka('A').map((w) => w.eid));
      const sw = await o.ev.sweepOutbox();
      await o.gotowe();
      const przeglad = o.kolejka('A').filter((w) => !zostaly.has(w.eid)).map(klucz);
      const n = nazwy(s);
      wyniki[nazwa] = {
        ok: [pr.ok, sw.ok], emisja: emisja.map(n), brak: emisja.filter((x) => !przeglad.includes(x)).map(n),
        nadmiar: przeglad.filter((x) => !emisja.includes(x)).map(n),
      };
    }
    const zle = Object.entries(wyniki).filter(([, w]) => !w.emisja.length || w.brak.length || w.ok.some((x) => x !== true));
    expect(zle, 'mutacje bez wiersza emisji, z encją bez wiersza po przeglądzie albo z nieudanym przeglądem').toEqual([]);
    const nadmiar = Object.fromEntries(Object.entries(wyniki).filter(([, w]) => w.nadmiar.length).map(([k, w]) => [k, w.nadmiar]));
    // Zmiana karty bez nowej wersji (poprawka starszej wersji, gwiazdka i jej zdjęcie, kosz, „Przywróć”): przegląd
    // dokłada też snap najnowszej wersji (nośnik pól karty z chwilą zapisu karty).
    expect(nadmiar, 'nadmiar przeglądu').toEqual({
      updateSnapshotPayload: ['snap|karta1/wersja2'],
      setSnapshotPinned: ['snap|karta1/wersja2'],
      'setSnapshotPinned (zdjęcie)': ['snap|karta1/wersja2'],
      moveSnapshotToTrash: ['snap|karta1/wersja2'],
      restoreTrashedSnapshot: ['snap|karta1/wersja2'],
    });
  }, 120_000);
});

describe('PG9–PG13: przegląd pilny, brak miejsca, przegląd należny i nieudany', () => {
  it('PG9: limit blokady konta (SYNC_DB_TIMEOUT, blokada wyłączna trzymana przez test, zegar 20 s) — po zwolnieniu blokady przegląd pilny dokłada snap bez innej czynności', async () => {
    const o = await okno();
    await o.zaloguj('A');
    await o.gotowe();
    const s0 = ostatni(o);
    const zp = o.l.przeglady.length;
    const h = await o.locks.trzymaj(nazwaBlokady(o.uid));
    const r = await o.v.savePatient(naglowek(1), { dedup: false });
    await o.locks.czekajNaKolejke(nazwaBlokady(o.uid), 1);
    expect(o.timery.odpal((t) => t.ms === 20000), 'limit blokady dopisania z emisji').toBe(1);
    await o.locks.czekajNaKolejke(nazwaBlokady(o.uid), 1);
    await o.spokoj();
    expect(po(o, s0), 'w trakcie: bez wiersza').toEqual([]);
    expect(o.l.przeglady.slice(zp), 'przegląd pilny po bezczynności łańcucha').toEqual([{ sieroty: false }]);
    await h.zwolnij();
    await o.gotowe();
    expect(po(o, s0)).toEqual([`snap|${r.patientId}/${r.snapshotId}`]);
    expect(o.l.przeglady.length - zp, 'jeden przegląd').toBe(1);
  }, 60_000);

  it('PG9: własne dopisanie przeglądu po limicie blokady nie ustawia przeglądu pilnego — przy blokadzie nadal trzymanej najwyżej jeden przegląd; zmianę dokłada następny', async () => {
    const o = await okno();
    await o.zaloguj('A');
    await o.gotowe();
    const s0 = ostatni(o);
    const zp = o.l.przeglady.length;
    const h = await o.locks.trzymaj(nazwaBlokady(o.uid));
    const r = await o.v.savePatient(naglowek(1), { dedup: false });
    await o.locks.czekajNaKolejke(nazwaBlokady(o.uid), 1);
    expect(o.timery.odpal((t) => t.ms === 20000)).toBe(1);
    await o.locks.czekajNaKolejke(nazwaBlokady(o.uid), 1);
    await o.timery.czekajNa((t) => t.ms === 20000);
    expect(o.timery.odpal((t) => t.ms === 20000), 'limit blokady dopisania przeglądu').toBe(1);
    await o.gotowe();
    expect(o.l.przeglady.length - zp, 'jeden przegląd pilny').toBe(1);
    expect(o.timery.oczekujace().filter((t) => t.ms === 20000), 'bez następnego czekania na blokadę').toEqual([]);
    await h.zwolnij();
    await o.gotowe();
    expect(po(o, s0), 'bez przeglądu po zwolnieniu').toEqual([]);
    expect(o.l.przeglady.length - zp).toBe(1);
    expect(await o.ev.sweepOutbox()).toEqual({ ok: true, kandydaci: 2, dopisane: 1 });
    await o.gotowe();
    expect(po(o, s0)).toEqual([`snap|${r.patientId}/${r.snapshotId}`]);
  }, 60_000);

  it('PG10: SYNC_DB_DELETED (dopisanie z łańcucha w trakcie removeUser tego konta) — bez przeglądu pilnego', async () => {
    const o = await okno({ wymagaj: false });
    await o.zaloguj('A');
    await o.gotowe();
    const zp = o.l.przeglady.length;
    const h = await o.locks.trzymaj(nazwaBlokady(o.uid));
    await o.v.savePatient(naglowek(1), { dedup: false });
    await o.locks.czekajNaKolejke(nazwaBlokady(o.uid), 1);
    const kasowanie = wstrzymaj(o, { przy: 'deleteDatabase', baza: `vilda_user_${o.uid}` });
    const usun = wynik(o.v.removeUser(o.uid, o.A.haslo));
    await kasowanie.czeka;
    const z = o.znacznik();
    await h.zwolnij();
    await o.ev.emissionsSettled();
    await o.spokoj();
    expect(o.v.isUnlocked(), 'sejf odblokowany w chwili dopisania').toBe(true);
    expect(o.logKolejki(z).filter((w) => w[0] === 'open'), 'otwarcia bazy kolejki po oznaczeniu konta').toEqual([]);
    expect(o.l.przeglady.length - zp, 'przeglądy po SYNC_DB_DELETED').toBe(0);
    kasowanie.zwolnij();
    const w = await usun;
    expect(w.ok, w.komunikat).toBe(true);
    await o.gotowe();
    expect(o.l.przeglady.length - zp).toBe(0);
    expect(o.jestBaza('A')).toBe(false);
  }, 60_000);

  it('PG11: brak miejsca (QuotaExceededError przy zatwierdzeniu dopisania) — bez wiersza i bez przeglądu pilnego; sweepOutbox() dokłada snap', async () => {
    const o = await okno();
    await o.zaloguj('A');
    await o.gotowe();
    const s0 = ostatni(o);
    const zp = o.l.przeglady.length;
    const u = o.idb.__atrapa.usterka({ przy: 'commit', baza: nazwaBazy(o.uid), tryb: 'readwrite', blad: 'QuotaExceededError' });
    const r = await o.v.savePatient(naglowek(1), { dedup: false });
    await o.gotowe();
    expect(u.uzyta, 'usterka użyta').toBe(1);
    expect(po(o, s0)).toEqual([]);
    expect(o.l.przeglady.length - zp, 'bez przeglądu pilnego').toBe(0);
    tik(MIN);
    expect(await o.ev.sweepOutbox()).toEqual({ ok: true, kandydaci: 2, dopisane: 1 });
    await o.gotowe();
    expect(po(o, s0)).toEqual([`snap|${r.patientId}/${r.snapshotId}`]);
  }, 60_000);

  it('PG11: brak miejsca przy pierwszym dopisaniu przeglądu — przegląd kończy się bez dalszych dopisań i bez przesunięcia znacznika; następny dokłada obie zmiany', async () => {
    const o = await okno();
    await o.zaloguj('A');
    await o.gotowe();
    const znacznik = metaKonta(o).przeglad;
    const s0 = ostatni(o);
    tik(MIN);
    const n1 = await o.bezEmisji(() => notatkaBiblioteki(o, 'Fikcyjny szablon 1'));
    const n2 = await o.bezEmisji(() => notatkaBiblioteki(o, 'Fikcyjny szablon 2'));
    tik(MIN);
    o.idb.__atrapa.usterka({ przy: 'commit', baza: nazwaBazy(o.uid), tryb: 'readwrite', blad: 'QuotaExceededError' });
    expect(await o.ev.sweepOutbox()).toEqual({ ok: false, powod: 'blad', code: 'SYNC_DB_QUOTA', dopisane: 0 });
    await o.gotowe();
    expect(po(o, s0), 'bez wierszy po nieudanym przeglądzie').toEqual([]);
    expect(metaKonta(o).przeglad, 'znacznik bez zmian').toBe(znacznik);
    tik(MIN);
    const start = iso();
    expect(await o.ev.sweepOutbox()).toEqual({ ok: true, kandydaci: 3, dopisane: 2 });
    await o.gotowe();
    expect(po(o, s0)).toEqual([`note|${n1}`, `note|${n2}`]);
    expect(metaKonta(o).przeglad).toBe(start);
  }, 60_000);

  it('PG12: przegląd należny — zmiana bez wiersza, zegar + 24 h, dowolna emisja: po bezczynności łańcucha przegląd dokłada zmianę; bez + 24 h — nie', async () => {
    const o = await okno();
    await o.zaloguj('A');
    await o.gotowe();
    const s0 = ostatni(o);
    const zp = o.l.przeglady.length;
    tik(MIN);
    const n1 = await o.bezEmisji(() => notatkaBiblioteki(o, 'Fikcyjny szablon 1'));
    tik(GODZ);
    const n2 = await notatkaBiblioteki(o, 'Fikcyjny szablon 2');
    await o.gotowe();
    expect(po(o, s0), 'bez + 24 h').toEqual([`note|${n2}`]);
    expect(o.l.przeglady.length - zp).toBe(0);
    tik(DOBA);
    const n3 = await notatkaBiblioteki(o, 'Fikcyjny szablon 3');
    await o.gotowe();
    expect(po(o, s0), 'po + 24 h').toEqual([`note|${n2}`, `note|${n3}`, `note|${n1}`]);
    expect(o.l.przeglady.slice(zp)).toEqual([{ sieroty: false }]);
  }, 60_000);

  it('PG13: przegląd nieudany (usterka zapisu znacznika) — znacznik bez zmian; emisje w tej dobie od próby nie wywołują przeglądu (próba liczy się do doby)', async () => {
    const o = await okno();
    await o.zaloguj('A');
    await o.gotowe();
    const znacznik = metaKonta(o).przeglad;
    const zp = o.l.przeglady.length;
    tik(12 * GODZ);
    const proba = zegar;
    o.idb.__atrapa.usterka({ przy: 'commit', baza: nazwaBazy(o.uid), tryb: 'readwrite', blad: 'UnknownError' });
    const sw = await o.ev.sweepOutbox();
    await o.gotowe();
    expect(sw).toEqual({ ok: false, powod: 'blad', code: 'SYNC_DB_CLOSED', dopisane: 0 });
    expect(metaKonta(o).przeglad, 'znacznik bez zmian').toBe(znacznik);
    // Doba od znacznika minęła, od próby — nie.
    zegar = proba + 12 * GODZ + MIN;
    vi.setSystemTime(zegar);
    await notatkaBiblioteki(o, 'Fikcyjny szablon 1');
    await o.gotowe();
    expect(o.l.przeglady.length - zp, 'przeglądy w dobie od próby').toBe(1);
    zegar = proba + DOBA + MIN;
    vi.setSystemTime(zegar);
    await notatkaBiblioteki(o, 'Fikcyjny szablon 2');
    const start = iso();
    await o.gotowe();
    expect(o.l.przeglady.length - zp, 'przegląd należny po dobie od próby').toBe(2);
    expect(metaKonta(o).przeglad).toBe(start);
  }, 60_000);
});

describe('PG14–PG15: przegląd jako krok łańcucha dopisań', () => {
  it('PG14: odtworzenie konta z kopii, potem odblokowanie — przegląd nie dubluje wierszy partii', async () => {
    const o = await okno();
    await o.zaloguj('A');
    await karta(o, 1);
    await notatkaBiblioteki(o);
    await o.gotowe();
    const kopia = await o.v.exportVaultBackup();
    tik();
    o.zablokuj();
    const zp = o.l.przeglady.length;
    const r = await o.v.restoreVaultBackup(kopia, o.A.haslo, { label: 'Fikcyjne konto z kopii' });
    await o.gotowe();
    const wiersze = klucze(o, r.userId);
    expect(o.l.przeglady.slice(zp), 'przegląd przy odblokowaniu konta z kopii').toEqual([{ sieroty: true }]);
    expect(o.meta(r.userId).map((m) => m.k), 'przegląd zakończony (znacznik w bazie kolejki konta z kopii)').toEqual(['licznik', 'pary', 'przeglad']);
    // Konto z kopii nie ma chwili zmiany hasła (eksport bez credential) — bez wiersza cred.
    expect(wiersze.map((x) => x.split('|')[0])).toEqual(['snap', 'snap', 'note']);
    expect(wiersze.filter((x, i) => wiersze.indexOf(x) !== i), 'powtórzenia').toEqual([]);
    o.zablokuj();
    tik(MIN);
    await o.v.unlockUser(r.userId, o.A.haslo);
    await o.gotowe();
    expect(o.l.przeglady.slice(zp)).toEqual([{ sieroty: true }, { sieroty: true }]);
    expect(klucze(o, r.userId), 'po ponownym odblokowaniu').toEqual(wiersze);
  }, 60_000);

  it('PG15: sweepOutbox() w trakcie otwartego kroku (kosz czeka na blokadę karty) — przegląd rusza po wpisach kroku, bez osobnych wierszy encji kroku', async () => {
    const o = await okno();
    await o.zaloguj('A');
    const k = await karta(o, 1);
    await o.gotowe();
    const s0 = ostatni(o);
    const nazwa = `vilda-save-pat:${k.P}`;
    const h = await o.locks.trzymaj(nazwa);
    const kosz = wynik(o.v.moveSnapshotToTrash(k.P, k.S1));
    await o.locks.czekajNaKolejke(nazwa, 1);
    tik();
    const p = o.ev.sweepOutbox();
    await o.ev.emissionsSettled();
    await o.spokoj();
    expect(await jeszczeCzeka(p), 'przegląd czeka na koniec kroku').toBe(true);
    await h.zwolnij();
    expect((await kosz).ok).toBe(true);
    const w = await p;
    await o.gotowe();
    expect(w).toEqual({ ok: true, kandydaci: 3, dopisane: 1 });
    expect(po(o, s0), 'wpis kroku, potem przegląd (nośnik pól karty)').toEqual([`stomb|${k.S1}`, `snap|${k.P}/${k.S2}`]);
  }, 60_000);
});

// Pary scalania w sesji: pełny ładunek bliźniaka (karta z 2 wersjami, notatka pacjenta, notatka biblioteki) i własna
// karta bez wiersza; wynik przeglądu po scaleniu.
async function paryWSesji() {
  const o = await okno();
  await o.zaloguj('A');
  await o.gotowe();
  const B = await blizniak(o);
  tik();
  const kb = await karta(B, 5);
  const nb = await notatkaBiblioteki(B, 'Fikcyjny szablon B');
  const pb = (await B.v.savePatientNote({ patientId: kb.P, title: 'Fikcyjna notatka B', body: 'Fikcyjna treść.', category: 'inne' })).id;
  tik();
  await B.cisza();
  const ka = await o.bezEmisji(() => karta(o, 1));
  await o.gotowe();
  const ladunek = await B.v.exportSyncPayload();
  tik();
  const s0 = ostatni(o);
  const sc0 = o.l.scalenia.length;
  await o.v.mergeSyncPayload(ladunek);
  tik();
  await o.gotowe();
  const scalenia = o.l.scalenia.length - sc0;
  const sw = await o.ev.sweepOutbox();
  await o.gotowe();
  return { o, B, ka, kb, nb, pb, s0, sw, scalenia };
}

describe('PG16–PG19: pamięć par', () => {
  it('PG16: pary scalania w sesji — po scaleniu pełnego ładunku bliźniaka przegląd dopisuje tylko 2 wersje własne, encje bliźniaka pominięte', async () => {
    const { o, ka, kb, nb, pb, s0, sw, scalenia } = await paryWSesji();
    expect(scalenia, 'odczyty bramki w scaleniu').toBe(1);
    expect(sw).toEqual({ ok: true, kandydaci: 7, dopisane: 2 });
    expect(po(o, s0)).toEqual(snapy(ka));
    expect(Object.keys(metaKonta(o).pary).sort(), 'pary utrwalone').toEqual(['cred|cred', `karta|${kb.P}`, ...snapy(kb), `note|${nb}`, `pnote|${pb}`].sort());
  }, 60_000);

  it('PG17: pary utrwalone — po scaleniu i przeglądzie przeładowanie strony i odblokowanie: 0 wierszy; wiersze echa (gdyby powstały) bez skutku u bliźniaka', async () => {
    const { o, B } = await paryWSesji();
    tik(MIN);
    const o2 = await przeladuj(o);
    const n0 = ostatni(o2);
    await o2.zaloguj('A');
    await o2.gotowe();
    expect(o2.l.przeglady, 'przegląd przy odblokowaniu').toEqual([{ sieroty: true }]);
    const echo = o2.kolejka('A').filter((w) => w.seqLocal > n0);
    expect(echo.map(klucz), 'wiersze po przeładowaniu').toEqual([]);
    const bez = (x) => x.replace(/"exportedAtISO":"[^"]*"/, '').replace(/"lastMergeAtISO":("[^"]*"|null)/, '');
    const e0 = JSON.stringify(await B.v.exportSyncPayload());
    for (const w of echo) expect((await B.ev.applyEncryptedEvent(w.env)).status).toBe('applied');
    await B.cisza();
    expect(bez(JSON.stringify(await B.v.exportSyncPayload())), 'eksport bliźniaka').toBe(bez(e0));
  }, 60_000);

  it('PG18: pary z wierszy przyjętych — outboxAccept wszystkich, sweepOutbox(), przeładowanie i odblokowanie: 0 i 0', async () => {
    const o = await okno();
    await o.zaloguj('A');
    await karta(o, 1);
    await notatkaBiblioteki(o);
    await o.gotowe();
    const eids = o.kolejka('A').map((w) => w.eid);
    const pr = await o.ev.outboxAccept(eids);
    expect(pr).toMatchObject({ ok: true });
    expect(pr.usuniete).toHaveLength(4);
    await o.gotowe();
    tik(MIN);
    expect(await o.ev.sweepOutbox()).toEqual({ ok: true, kandydaci: 4, dopisane: 0 });
    await o.gotowe();
    expect(o.kolejka('A')).toEqual([]);
    tik(MIN);
    const o2 = await przeladuj(o);
    await o2.zaloguj('A');
    await o2.gotowe();
    expect(o2.l.przeglady).toEqual([{ sieroty: true }]);
    expect(o2.kolejka('A'), 'po przeładowaniu').toEqual([]);
  }, 60_000);

  it('PG19: pamięć par ograniczona i wygasająca — para z chwilą nie późniejszą niż próg pominięta; po przeglądzie w meta tylko pary z chwilą po nowym progu', async () => {
    const o = await okno();
    const B = await blizniak(o);
    const stara = await notatkaBiblioteki(B, 'Fikcyjny szablon stary');
    tik(GODZ);
    await o.zaloguj('A');
    await o.gotowe();
    const nowa = await notatkaBiblioteki(B, 'Fikcyjny szablon nowy');
    await B.cisza();
    await o.v.mergeSyncPayload(await B.v.exportSyncPayload());
    tik();
    await o.gotowe();
    expect(await o.ev.sweepOutbox()).toEqual({ ok: true, kandydaci: 1, dopisane: 0 });
    await o.gotowe();
    const pary = metaKonta(o).pary;
    expect(Object.keys(pary), 'pary z chwilą po progu').toEqual([`note|${nowa}`]);
    expect(Object.keys(pary)).not.toContain(`note|${stara}`);
    tik(30 * MIN);
    expect(await o.ev.sweepOutbox(), 'okno od poprzedniego znacznika: notatka pokryta parą').toEqual({ ok: true, kandydaci: 1, dopisane: 0 });
    await o.gotowe();
    expect(metaKonta(o).pary, 'pary po nowym progu (30 min później)').toEqual({});
  }, 60_000);

  it('PG19: ładunek z 20 001 parami — w meta najwyżej 20 000 par (najpóźniejsze chwile)', async () => {
    const o = await okno();
    await o.zaloguj('A');
    await o.gotowe();
    tik(MIN);
    const N = 20001;
    const chwila0 = zegar - 30_000;
    const nazwa = (i) => `fikcyjna-preferencja-${String(i).padStart(5, '0')}`;
    const userPreferences = {};
    for (let i = 0; i < N; i += 1) userPreferences[nazwa(i)] = { value: 'fikcyjna', updatedAtISO: iso(chwila0 + i) };
    await o.v.mergeSyncPayload({ userPreferences });
    tik();
    await o.gotowe();
    const sw = await o.ev.sweepOutbox();
    await o.gotowe();
    expect(sw).toEqual({ ok: true, kandydaci: N + 1, dopisane: 0 });
    const pary = metaKonta(o).pary;
    expect(Object.keys(pary).length).toBe(20000);
    expect(pary[`pref|${nazwa(0)}`], 'najstarsza para odpada').toBeUndefined();
    expect(pary[`pref|${nazwa(1)}`]).toBe(iso(chwila0 + 1));
    expect(pary[`pref|${nazwa(N - 1)}`]).toBe(iso(chwila0 + N - 1));
  }, 120_000);
});

describe('PG20–PG22: importy, strzeżony adapter, sesja', () => {
  it('PG20: importy (import pliku karty, scalenie i odtworzenie kopii konta) nie dają par i nie czytają bramki w scaleniu; wiersze partii usunięte — przegląd je dokłada', async () => {
    const o = await okno();
    await o.zaloguj('A');
    await o.gotowe();
    const B = await blizniak(o);
    tik();
    const kb = await karta(B, 5);
    const plik = await B.v.exportPatientEnvelope(kb.P);
    tik();
    const kb2 = await karta(B, 6);
    const kopiaB = await B.v.exportVaultBackup();
    tik();
    const wyniki = {};
    const zImportu = async (nazwa, fn, oczekiwane) => {
      tik();
      const z = { scalenia: o.l.scalenia.length, s: ostatni(o) };
      await fn();
      await o.gotowe();
      const nowe = o.kolejka('A').filter((w) => w.seqLocal > z.s);
      const partia = nowe.map(klucz);
      await usunWiersze(o, nowe.map((w) => w.eid));
      tik();
      const s1 = ostatni(o);
      const sw = await o.ev.sweepOutbox();
      await o.gotowe();
      wyniki[nazwa] = { scalenia: o.l.scalenia.length - z.scalenia, partia, przeglad: po(o, s1), dopisane: sw.dopisane };
      expect(partia, `${nazwa}: wiersze partii`).toEqual(oczekiwane);
    };
    await zImportu('importPatientFromEnvelope', () => o.v.importPatientFromEnvelope(plik, o.A.haslo), snapy(kb));
    await zImportu('mergeVaultBackup', () => o.v.mergeVaultBackup(kopiaB, o.A.haslo), snapy(kb2));
    for (const [nazwa, w] of Object.entries(wyniki)) {
      expect(w.scalenia, `${nazwa}: odczyty bramki w scaleniu`).toBe(0);
      expect(w.przeglad, `${nazwa}: przegląd dokłada wiersze partii`).toEqual(w.partia);
    }
    const kopia = await o.v.exportVaultBackup();
    tik();
    o.zablokuj();
    const z = { scalenia: o.l.scalenia.length, przeglady: o.l.przeglady.length };
    await o.v.restoreVaultBackup(kopia, o.A.haslo, { label: 'Fikcyjne konto z kopii' });
    await o.gotowe();
    expect([o.l.scalenia.length - z.scalenia, o.l.przeglady.slice(z.przeglady)], 'restoreVaultBackup: scalenia, przeglądy').toEqual([0, [{ sieroty: true }]]);
  }, 90_000);

  it('PG21: strzeżony adapter — removeUser w toku (konto oznaczone, kasowanie bazy sejfu wstrzymane) → sweepOutbox(): SYNC_DB_DELETED, bez odczytów bazy sejfu i bazy kolejki konta', async () => {
    const o = await okno();
    await o.zaloguj('A');
    await karta(o, 1);
    await o.gotowe();
    const kasowanie = wstrzymaj(o, { przy: 'deleteDatabase', baza: `vilda_user_${o.uid}` });
    const usun = wynik(o.v.removeUser(o.uid, o.A.haslo));
    await kasowanie.czeka;
    const z = o.znacznik();
    expect(await o.ev.sweepOutbox()).toEqual({ ok: false, powod: 'blad', code: 'SYNC_DB_DELETED' });
    const wpisy = o.idb.__atrapa.log.slice(z.log).filter((w) => typeof w[1] === 'string' && (w[1] === `vilda_user_${o.uid}` || w[1].startsWith('vilda_sync_')));
    expect(wpisy, 'operacje na bazie sejfu i bazie kolejki konta').toEqual([]);
    kasowanie.zwolnij();
    expect((await usun).ok).toBe(true);
    await o.gotowe();
  }, 60_000);

  it('PG21: strzeżony adapter — oznaczenie konta w trakcie przeglądu (po odczycie listy kart) kończy go SYNC_DB_DELETED bez dalszych odczytów bazy sejfu', async () => {
    const o = await okno();
    await o.zaloguj('A');
    await karta(o, 1);
    await o.gotowe();
    const lista = wstrzymaj(o, { przy: 'success', baza: `vilda_user_${o.uid}`, sklep: 'patients' });
    const p = o.ev.sweepOutbox();
    await lista.czeka;
    const kasowanie = wstrzymaj(o, { przy: 'deleteDatabase', baza: `vilda_user_${o.uid}` });
    const usun = wynik(o.v.removeUser(o.uid, o.A.haslo));
    await kasowanie.czeka;
    const z = o.znacznik();
    lista.zwolnij();
    expect(await p).toEqual({ ok: false, powod: 'blad', code: 'SYNC_DB_DELETED' });
    const wpisy = o.idb.__atrapa.log.slice(z.log).filter((w) => w[0] === 'tx' && w[4] === 'start' && (w[1] === `vilda_user_${o.uid}` || w[1].startsWith('vilda_sync_')));
    expect(wpisy, 'transakcje na bazie sejfu i bazie kolejki po oznaczeniu').toEqual([]);
    kasowanie.zwolnij();
    expect((await usun).ok).toBe(true);
    await o.gotowe();
  }, 60_000);

  it('PG22: sesja — przełączenie na konto B w trakcie przeglądu A (atrapa wstrzymana na odczycie listy kart): bez wierszy u A i u B, znacznik A bez zmian', async () => {
    const o = await okno({ konta: 'AB' });
    await o.zaloguj('B');
    await o.gotowe();
    await o.zaloguj('A');
    await o.gotowe();
    const znacznik = metaKonta(o, 'A').przeglad;
    const wiersze = { A: klucze(o, 'A'), B: klucze(o, 'B') };
    tik(MIN);
    await o.bezEmisji(() => notatkaBiblioteki(o));
    await o.gotowe();
    const lista = wstrzymaj(o, { przy: 'success', baza: `vilda_user_${o.uid}`, sklep: 'patients' });
    const p = o.ev.sweepOutbox();
    await lista.czeka;
    const przelaczenie = o.przelaczWTle('B');
    await przelaczenie.sesja;
    lista.zwolnij();
    expect(await p).toEqual({ ok: false, powod: 'sesja' });
    await przelaczenie.koniec;
    await o.gotowe();
    expect({ A: klucze(o, 'A'), B: klucze(o, 'B') }, 'wiersze A i B').toEqual(wiersze);
    expect(metaKonta(o, 'A').przeglad, 'znacznik A').toBe(znacznik);
  }, 60_000);
});

describe('PG23: rekordy pochodne scalania z nową chwilą', () => {
  it('PG23: równoległa zmiana planu opieki na A i bliźniaku, A scala pełny ładunek bliźniaka — przegląd dokłada pnote planu (rewizja max + 1, chwila scalenia)', async () => {
    const o = await okno();
    await o.zaloguj('A');
    await o.gotowe();
    let nr = 0;
    const operacja = () => `fikcyjna-operacja-planu-${++nr}`;
    const zmien = async (okn, f, action, pola = {}) => {
      const plan = f.planId && await okn.v.getCarePlan(f.planId);
      return okn.v.mutateCarePlan({ patientId: f.patientId, operationId: operacja(), action, ...(plan ? { planId: f.planId, baseRev: plan.rev } : {}), ...pola });
    };
    const f = {};
    f.patientId = (await o.v.savePatient(naglowek(1), { dedup: false })).patientId;
    tik();
    f.planId = (await zmien(o, f, 'create', { title: 'Fikcyjny plan opieki' })).planId;
    tik();
    await o.gotowe();
    const B = await blizniak(o);
    tik(MIN);
    await zmien(o, f, 'edit', { title: 'Fikcyjny plan opieki', goal: 'Fikcyjny cel A.' });
    tik(MIN);
    await zmien(B, f, 'edit', { title: 'Fikcyjny plan opieki (B)', goal: 'Fikcyjny cel B.' });
    tik(MIN);
    await o.gotowe();
    await B.cisza();
    const ladunek = await B.v.exportSyncPayload();
    tik(MIN);
    const chwila = iso();
    await o.v.mergeSyncPayload(ladunek);
    tik();
    await o.gotowe();
    const plan = await o.v.getCarePlan(f.planId);
    const s0 = ostatni(o);
    const sw = await o.ev.sweepOutbox();
    await o.gotowe();
    expect([plan.rev, plan.updatedAtISO], 'plan po scaleniu: rewizja i chwila').toEqual([3, chwila]);
    expect(sw).toEqual({ ok: true, kandydaci: 4, dopisane: 1 });
    expect(po(o, s0)).toEqual([`pnote|${f.planId}`]);
  }, 60_000);

  it('PG23: ratunek notatki D-21 — bliźniak usuwa pacjenta, A dopisuje wizytę i scala pełny ładunek bliźniaka: notatka uratowana z nową chwilą, przegląd dokłada pnote', async () => {
    const o = await okno();
    await o.zaloguj('A');
    const k = await karta(o, 1);
    const n = (await o.v.savePatientNote({ patientId: k.P, title: 'Fikcyjna notatka', body: 'Fikcyjna treść.', category: 'inne' })).id;
    tik();
    await o.gotowe();
    const B = await blizniak(o);
    tik(MIN);
    await B.v.removePatient(k.P);
    tik(MIN);
    await B.cisza();
    const r = await o.v.savePatient(naglowek(1, { masa: 24 }), { dedup: false, patientId: k.P });
    tik(MIN);
    await o.gotowe();
    const przed = (await o.v.getPatientNote(n)).updatedAtISO;
    const ladunek = await B.v.exportSyncPayload();
    tik(MIN);
    await o.v.mergeSyncPayload(ladunek);
    tik();
    await o.gotowe();
    const notatka = await o.v.getPatientNote(n);
    const s0 = ostatni(o);
    const sw = await o.ev.sweepOutbox();
    await o.gotowe();
    expect(notatka && notatka.updatedAtISO > przed, 'notatka uratowana z nową chwilą').toBe(true);
    expect(sw).toEqual({ ok: true, kandydaci: 5, dopisane: 1 });
    expect(po(o, s0)).toEqual([`pnote|${n}`]);
  }, 60_000);
});

describe('PG24–PG25: przegląd sierot, tryby', () => {
  const SIEROTA = 'fikcyjne-konto-usuniete-1';
  it('PG24: sieroty przy odblokowaniu A — baza kolejki konta bez wpisu rejestru i baza konta „Komputer w pracy” usunięte (bez znacznika ponowienia); kolejki A i konta prywatnego B zostają', async () => {
    const o = await okno({ konta: 'AB' });
    o.bramka.otwarta = false;
    const C = await o.v.createUser('Fikcyjne#KontoC!2026cc', { label: 'Fikcyjny Lekarz C', iterations: 1000, storageMode: 'cloud-only' });
    await o.tlo();
    o.bramka.otwarta = true;
    bazaKolejki(o.idb, SIEROTA, {});
    bazaKolejki(o.idb, o.B.userId, {});
    bazaKolejki(o.idb, C.userId, {});
    bazaKolejki(o.idb, o.A.userId, { wiersze: [wierszKolejki(1)] });
    const nazwy = (l) => l.map((x) => x.replace(o.A.userId, '<A>').replace(o.B.userId, '<B>').replace(C.userId, '<C>')).sort();
    expect(nazwy(await bazyKolejki(o))).toEqual(nazwy([nazwaBazy(o.A.userId), nazwaBazy(o.B.userId), nazwaBazy(C.userId), nazwaBazy(SIEROTA)]));
    await o.zaloguj('A');
    await o.gotowe();
    expect(nazwy(await bazyKolejki(o)), 'bazy kolejki po odblokowaniu').toEqual(nazwy([nazwaBazy(o.A.userId), nazwaBazy(o.B.userId)]));
    expect(kluczeSync(o).filter((x) => x.startsWith(PRZEDROSTEK_KASOWANIA)), 'znaczniki ponowienia kasowania').toEqual([]);
    expect(o.kolejka('A').map((w) => w.eid), 'kolejka A nietknięta przez przegląd sierot').toContain(wierszKolejki(1).eid);
  }, 60_000);

  it('PG24: tryb „Zaloguj jednorazowo” (konto założone przy otwartej bramce) i okno bez databases() — przegląd sierot nic nie usuwa', async () => {
    const idb = utworzIndexedDB();
    bazaKolejki(idb, SIEROTA, {});
    const o1 = await okno({ idb, jednorazowo: true, odOtwartej: true });
    await o1.gotowe();
    expect(o1.l.przeglady, 'przegląd przy założeniu konta').toEqual([{ sieroty: true }]);
    const o2 = await okno({ databases: false });
    bazaKolejki(o2.idb, SIEROTA, {});
    const zp = o2.l.przeglady.length;
    await o2.zaloguj('A');
    await o2.gotowe();
    expect(o2.l.przeglady.slice(zp), 'przegląd przy odblokowaniu').toEqual([{ sieroty: true }]);
    for (const [nazwa, o] of [['Zaloguj jednorazowo', o1], ['bez databases()', o2]]) {
      expect(await bazyKolejki(o), nazwa).toContain(nazwaBazy(SIEROTA));
      expect(kluczeSync(o).filter((x) => x.startsWith(PRZEDROSTEK_KASOWANIA)), nazwa).toEqual([]);
    }
  }, 60_000);

  it('PG25: tryby przy otwartej bramce („Komputer w pracy”, „Zaloguj jednorazowo”) — przegląd kończy się na trybie: bez bazy kolejki, kluczy vilda-sync-* i blokad', async () => {
    for (const [nazwa, opcje] of [['Komputer w pracy', { chmura: ['A'] }], ['Zaloguj jednorazowo', { jednorazowo: true }]]) {
      const o = await okno({ ...opcje, odOtwartej: true, wymagaj: false });
      if (nazwa === 'Komputer w pracy') await o.zaloguj('A');
      const k = await karta(o, 1);
      await o.v.savePatientNote({ patientId: k.P, title: 'Fikcyjna notatka', body: 'Fikcyjna treść.', category: 'inne' });
      await notatkaBiblioteki(o);
      await o.gotowe();
      // Sejf sprzed E2-PR3a4 nie ma sweepOutbox — wtedy zostaje samo sprawdzenie stanu (strażnik regresji).
      if (typeof o.ev.sweepOutbox === 'function') expect(await o.ev.sweepOutbox(), nazwa).toEqual({ ok: false, powod: 'tryb' });
      await o.gotowe();
      expect(await bazyKolejki(o), `${nazwa}: bazy kolejki`).toEqual([]);
      expect(kluczeSync(o), `${nazwa}: klucze vilda-sync-*`).toEqual([]);
      expect(zadaniaKolejki(o), `${nazwa}: blokady vilda-sync*`).toEqual([]);
      expect(o.logKolejki(), `${nazwa}: wpisy vilda_sync_* w dzienniku atrapy`).toEqual([]);
    }
  }, 60_000);
});

describe('PG26–PG28: 10 dni bez połączenia, klucz dostępu przy blokadzie, kolejność w odblokowaniu', () => {
  it('PG26: 10 dni bez połączenia — bliźniak dodaje 30 kart (60 wersji), A 10 notatek biblioteki bez wiersza: przy odblokowaniu tylko 10 własnych, po scaleniu pełnego ładunku 0, po przeładowaniu 0', async () => {
    const o = await okno();
    await o.zaloguj('A');
    await o.gotowe();
    const B = await blizniak(o);
    const wlasne = [];
    for (let d = 0; d < 10; d += 1) {
      tik(DOBA);
      for (let j = 0; j < 3; j += 1) await karta(B, 10 + d * 3 + j);
      wlasne.push(`note|${await o.bezEmisji(() => notatkaBiblioteki(o, `Fikcyjny szablon dnia ${d + 1}`))}`);
    }
    await B.cisza();
    await o.gotowe();
    tik(GODZ);
    const s0 = ostatni(o);
    await o.zaloguj('A');
    await o.gotowe();
    expect(po(o, s0), 'przy odblokowaniu').toEqual(wlasne);
    const s1 = ostatni(o);
    const ladunek = await B.v.exportSyncPayload();
    expect(ladunek.patients.reduce((n, p) => n + p.snapshots.length, 0), 'wersje w ładunku bliźniaka').toBe(60);
    await o.v.mergeSyncPayload(ladunek);
    tik();
    await o.gotowe();
    const sw = await o.ev.sweepOutbox();
    await o.gotowe();
    expect(sw).toEqual({ ok: true, kandydaci: 0, dopisane: 0 });
    expect(po(o, s1), 'po scaleniu').toEqual([]);
    tik(MIN);
    const o2 = await przeladuj(o);
    await o2.zaloguj('A');
    await o2.gotowe();
    expect(po(o2, s1), 'po przeładowaniu').toEqual([]);
  }, 120_000);

  it('PG27: nagrobek klucza dostępu usuniętego przy zablokowanym sejfie — bez wiersza przy blokadzie, przy odblokowaniu pktomb', async () => {
    const o = await okno();
    atrapaKluczy(o);
    await o.zaloguj('A');
    await o.v.registerPasskey('Fikcyjny telefon');
    tik();
    await o.gotowe();
    const s0 = ostatni(o);
    o.zablokuj();
    tik(MIN);
    await o.v.removePasskey(o.uid, 'fikcyjny-klucz-1');
    await o.gotowe();
    expect(po(o, s0), 'przy zablokowanym sejfie').toEqual([]);
    tik(MIN);
    await o.zaloguj('A');
    await o.gotowe();
    expect(po(o, s0)).toEqual(['pktomb|fikcyjny-klucz-1']);
  }, 60_000);

  it('PG28: przegląd rusza przed słuchaczami odblokowania — w słuchaczu onUnlock łańcuch konta nie jest pusty, emissionsSettled() rozstrzyga się po przeglądzie', async () => {
    const o = await okno();
    const stan = { wSluchaczu: null, poRozstrzygnieciu: null };
    o.v.onUnlock(() => {
      stan.wSluchaczu = klucze(o);
      o.ev.emissionsSettled().then(() => { stan.poRozstrzygnieciu = klucze(o); });
    });
    await o.zaloguj('A');
    await o.gotowe();
    await czekajNa(() => stan.poRozstrzygnieciu, 'emissionsSettled ze słuchacza');
    expect(stan).toEqual({ wSluchaczu: [], poRozstrzygnieciu: ['cred|cred'] });
  }, 60_000);
});

// Plik karty z chwilami sprzed okna przeglądu: karta z dwiema wersjami zapisana przy otwartej bramce (wiersze kolejki),
// eksport do pliku, „Usuń pacjenta”, potem dwie doby i przegląd — znacznik po chwilach wersji z pliku.
async function plikSprzedOkna(o) {
  const k = await karta(o, 1);
  await o.gotowe();
  const plik = await o.v.exportPatientEnvelope(k.P);
  tik();
  await o.v.removePatient(k.P);
  await o.gotowe();
  tik(2 * DOBA);
  expect((await o.ev.sweepOutbox()).ok, 'przegląd przed importem').toBe(true);
  await o.gotowe();
  expect(metaKonta(o).przeglad > iso(zegar - 2 * DOBA), 'znacznik po chwilach wersji z pliku').toBe(true);
  return { ...k, plik };
}

describe('PG29: pamięć braków', () => {
  it('PG29: wpis partii importu bez wiersza po limicie blokady konta (wersja z pliku z chwilą sprzed okna, w kolejce wiersz tej wersji sprzed usunięcia karty) — przegląd pilny dokłada ją mimo okna i tego wiersza; następny przegląd nic', async () => {
    const o = await okno();
    await o.zaloguj('A');
    await o.gotowe();
    const k = await plikSprzedOkna(o);
    const s0 = ostatni(o);
    const h = await o.locks.trzymaj(nazwaBlokady(o.uid));
    tik();
    await o.v.importPatientFromEnvelope(k.plik, o.A.haslo);
    await o.locks.czekajNaKolejke(nazwaBlokady(o.uid), 1);
    expect(o.timery.odpal((t) => t.ms === 20000), 'limit pierwszego wpisu partii').toBe(1);
    await o.locks.czekajNaKolejke(nazwaBlokady(o.uid), 1);
    await h.zwolnij();
    await o.gotowe();
    expect(po(o, s0), 'wiersz partii (druga wersja), potem przegląd pilny: pierwsza wersja').toEqual([`snap|${k.P}/${k.S2}`, `snap|${k.P}/${k.S1}`]);
    const nagrobek = o.kolejka('A').find((w) => w.kind === 'ptomb' && w.entityKey === k.P);
    expect(o.kolejka('A').filter((w) => klucz(w) === `snap|${k.P}/${k.S1}`).map((w) => w.seqLocal > nagrobek.seqLocal), 'pierwsza wersja: wiersz sprzed nagrobka karty i po nim').toEqual([false, true]);
    tik(MIN);
    expect((await o.ev.sweepOutbox()).dopisane, 'następny przegląd').toBe(0);
    await o.gotowe();
    expect(po(o, s0)).toHaveLength(2);
  }, 60_000);

  it('PG29: wpisy partii importu bez wiersza po blokadzie sejfu w trakcie czekania na blokadę konta — przy ponownym odblokowaniu przegląd dokłada obie wersje z pliku (chwile sprzed okna)', async () => {
    const o = await okno();
    await o.zaloguj('A');
    await o.gotowe();
    const k = await plikSprzedOkna(o);
    const s0 = ostatni(o);
    const h = await o.locks.trzymaj(nazwaBlokady(o.uid));
    tik();
    await o.v.importPatientFromEnvelope(k.plik, o.A.haslo);
    await o.locks.czekajNaKolejke(nazwaBlokady(o.uid), 1);
    o.zablokuj();
    await h.zwolnij();
    await o.gotowe();
    expect(po(o, s0), 'po blokadzie sejfu: bez wierszy').toEqual([]);
    tik(MIN);
    await o.zaloguj('A');
    await o.gotowe();
    expect(po(o, s0), 'przegląd przy odblokowaniu').toEqual(snapy(k));
    tik(MIN);
    expect((await o.ev.sweepOutbox()).dopisane, 'następny przegląd').toBe(0);
  }, 60_000);
});
