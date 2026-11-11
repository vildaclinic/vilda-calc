// P-DZIENNIK-ZDARZEN (E2-PR3b) — haki scalania: wskrzeszenie całą kartą i ratunek notatki do kolejki (uśpione: przy
// zamkniętej bramce każde miejsce haka to jeden odczyt pola bramki i nic więcej). Reguły scalania bez zmian (decyzja 9).
// Hak H1: nagrobek karty, który przegrał z chwilą karty — nagrobek z ładunku spoza zbioru wygranych w Le (pełny
// ładunek, delta, zdarzenie ptomb) albo karta zapisana w trakcie scalania (Bsl_usunPacjenta, pierwsze `return 0`) —
// daje pełną kartę (pfull: nagłówek i wszystkie wersje w porcjach, setId z karty i chwili nagrobka, bez powtórzeń w tym
// dokumencie, poza krokiem importu). Hak H2: ratunek notatki D-21 (Bnp_ratuj, wersja z chwilą R + 1 ms + h) daje pnote
// zawsze — także gdy w tej samej partii przyszła własna koperta pnote tej notatki i także w kroku importu (w partii).
// W jednym scaleniu pełna karta idzie przed notatką. Wiersz z haka pokrywa encję w przeglądzie kolejki (wiersz pfull
// i para jego wiersza przyjętego — wersje karty i nośnik pól karty; para ratunku po udanym dopisaniu — notatka); zmianę
// z haka bez wiersza dokłada przegląd kolejki z pamięci braków (z tym samym setId); pełna wysyłka zostaje. Plan
// docs/SYNC_PRZYROSTOWA_PLAN.md, 3.10 — bez partialSince (etap 3).
// Prawdziwy sejf w oknie uprzęży tests/support/okno-magazynu.mjs (emisja: true, przeglad: true, moduły punktu
// odzyskiwania) na adapterze IndexedDB sejfu nad atrapą tests/support/atrapa-indexeddb.mjs (tryb „Komputer prywatny”,
// jeśli przypadek nie mówi inaczej), ładowany z kopii źródła z licznikiem (tests/support/sejf-bez-wstawek.mjs: l.emisje,
// l.scalenia, l.przegrane — odczyty bramki w Bem_przegrany, l.ratunki — w Bem_ratunek, l.odczyty() — suma). Pole okna
// VILDA_EVENT_LOG z getterem (stan i licznik odczytów); konta zakładane przy zamkniętej bramce. Bliźniak — okno na
// niezależnej kopii baz atrapy (o.idb.__atrapa.klonuj()) z tym samym kontem i zamkniętą bramką; bliźniak z emisją —
// tak samo, z kopią źródła z licznikiem i otwartą bramką (bez przeglądu przy odblokowaniu); trzecie urządzenie — drugi
// bliźniak. Okno w pamięci (HK1, HK5) — okno uprzęży sesji (tests/unit/sesja-zapisu-uprzaz.mjs) z adapterem sejfu
// w pamięci (createInMemoryAdapter z kluczem zrzutu w sessionStorage) w rejestrze wywołań (magazynZRejestrem); jego
// bliźniak — adapter w pamięci odtworzony z tego zrzutu. „Przeładowanie strony” — nowe okno na tej samej atrapie, z tym
// samym localStorage i blokadami. Sztuczny zegar (tylko Date) z jawnym krokiem; po każdej operacji emissionsSettled()
// i cisza okna. Dane WYŁĄCZNIE FIKCYJNE („Testowy Jan…”, „Fikcyjna notatka…”), bez PESEL.
//
// HIGIENA: po przypadku blokady testu zwolnione, cisza każdego okna, zero otwartych połączeń baz kolejki, zero
// transakcji atrapy w toku, każde wstrzymanie zwolnione.
//
// PRZYPADKI
//   HK1  równoważność Le przy zamkniętej bramce: ładunek z przegranym nagrobkiem karty i ratunkiem notatki — sejf wobec
//        sejfu bez wstawek: ten sam wynik mergeSyncPayload, ten sam zapis przebiegu atrapy IndexedDB (te same wpisy,
//        zbiór z krotnością) i te same operacje crypto.subtle (adapter IndexedDB), ta sama lista wywołań adaptera
//        w pamięci (kolejno; adapter w pamięci); odczyty pola bramki w scaleniu 3 (para scalania, przegrany nagrobek,
//        ratunek) wobec 0; bez bazy, kluczy i blokad kolejki.
//   HK2  hak H1 ze zdarzenia ptomb: jeden zestaw pfull (1 porcja, pending, setId <patientId>:<deletedAtISO>,
//        event.full { setId, i: 0, n: 1 }); bliźniak z kartą częściową (wersja ze zdarzenia snap) dostaje wszystkie wersje.
//   HK3  trzy urządzenia w obu kolejnościach (C dostaje najpierw ptomb B, potem snap A — i odwrotnie): po dostawach
//        z haków B i C mają wszystkie wersje A; zestaw powstaje tylko tam, gdzie nagrobek z ładunku przegrał.
//   HK4  hak H1 z pełnego ładunku (mergeSyncPayload) i z delty (applyEncryptedDelta koperty ptomb) — jak HK2.
//   HK5  hak H1 w Bsl_usunPacjenta — karta zapisana w trakcie scalania (po liście kart i nagrobków, przed blokadą
//        pacjenta): karta zostaje (deletedPatientCount 0), jeden zestaw pfull z chwilą nagrobka (atrapa wstrzymana po
//        odczycie listy nagrobków, zapis karty); adapter w pamięci z wstawką (zapis karty po pierwszym
//        listTombstonesForUser) — odczyt bramki w Bem_przegrany i emisja pfull z sesją scalania.
//   HK6  bez haka H1: nagrobek wygrywa (karta usunięta); karta zostaje do ponowienia usunięcia (błąd zapisu listy kosza
//        przed usunięciem karty); lokalny nagrobek przegrywa z kartą z ładunku (Bsl_zdejmijNagrobek) — 0 wierszy pfull.
//   HK7  bez powtórzeń: to samo scalenie dwa razy i powtórka koperty ptomb — jeden zestaw; nagrobek z inną chwilą — nowy
//        zestaw, który zastępuje oczekujący zestaw na ogonie; scalenie najpierw przy zamkniętej, potem przy otwartej
//        bramce — zestaw powstaje przy otwartej.
//   HK8  setId spoza białej listy (karta o identyfikatorze dłuższym niż 40 znaków): h + 8 znaków szesnastkowych
//        (FNV-1a 32 z karty i chwili), ten sam na dwóch urządzeniach; wiersz powstaje.
//   HK9  hak H2: ratunek w scaleniu pełnego ładunku — wiersze [pfull, pnote]; bliźniak dostaje kartę i notatkę.
//   HK10 hak H2 „zawsze do kolejki”: w partii zdarzeń bliźniaka [pnote, ptomb, pnotetomb] (N1) własna koperta pnote
//        notatki — pnote z haka; osobno ratunek w scaleniu zdarzenia pnote — pnote z haka.
//   HK11 bez haka H2: notatka przyjęta zwykłą regułą (wersja późniejsza niż usunięcie, akcja merge), usunięcie notatki
//        przy scaleniu, nagrobek notatki w stanie „czeka” — 0 wierszy pnote i pnotetomb.
//   HK12 przegląd po hakach i wiersz z haka pokrywa encję: po scaleniu z hakami; (a) wiersze snap karty usunięte,
//        wiersz pfull zostaje; (b) wszystkie wiersze przyjęte (outboxAccept), przeładowanie i odblokowanie; (c) ratunek
//        w sekundzie po usunięciu (chwila notatki późniejsza niż createdAtISO wiersza — para ratunku) — dopisane: 0.
//   HK13 pamięć braków: dopisania haków bez wiersza (usterka zatwierdzenia w bazie kolejki; dwie karty i notatka), potem
//        sweepOutbox() — przegląd dokłada pfull obu kart z tym samym setId co hak i pnote; pary ładunku ich nie ukrywają.
//   HK14 krok importu (mergeVaultBackup): hak H1 bez pfull i bez odczytu bramki; hak H2 — pnote ratunku w partii (jeden
//        wiersz, gdy notatka jest w pliku; notatka spoza pliku z nagrobkiem „czeka” — wiersz tylko z haka H2);
//        onBulkChange count = liczba wierszy.
//   HK15 tryby i sesja: „Komputer w pracy” i „Zaloguj jednorazowo” przy otwartej bramce — haki kończą się na trybie
//        (0 wierszy, 0 baz vilda_sync_*, kluczy i blokad); przełączenie na konto B w trakcie dopisania haka — bez wierszy
//        u A i u B. Operacje kolejki i kwarantanny sprawdzają sesję tak jak zapis karty (P-SESJA-ZAPISU): zmiana sesji
//        w trakcie kończy operację bez zapisu.
//   HK16 bez nowego publicznego hooka: hooki VildaVault (on…) jak na bazie, bez onPatientTombstoneRejected, _eventLog —
//        39 kluczy (od E2-PR4c z markSyncCaughtUp; do E2-PR4c 38); w scaleniu z ratunkiem ładunki 8 hooków (onPatientNoteChanged: { id, patientId, action: 'merge' })
//        jak na sejfie bez wstawek.
//
// Okno A przypadku na adapterze IndexedDB (poza sejfem bez wstawek i trybami HK15) zaczyna od sprawdzenia, że sejf ma
// część przeglądu (VildaVault._eventLog.sweepOutbox).
// Czerwone na bazie (4994fef9 — sejf bez haków scalania, z tym plikiem i uprzężą tego PR; liczniki odczytów bramki
// w Bem_przegrany i Bem_ratunek puste; 32 przypadki z wariantami): 22 — HK1 ×2 (odczyty pola bramki 1 zamiast 3), HK2,
// HK3 ×2, HK4 ×2, HK5 ×2, HK7 ×2, HK8, HK9, HK10 ×2, HK12 ×4, HK13, HK14 ×2 (bez wierszy z haków, odczytów bramki
// w hakach i zestawów pfull). Zielone z natury (strażniki regresji): HK6 ×3 i HK11 ×3 (scalanie bez haka nie daje
// wierszy), HK15 ×2 (tryby i zmiana sesji bez wierszy, baz, kluczy i blokad kolejki; sprawdzenia, że haki doszły do
// emisji — tylko na sejfie z hakami), HK16 ×2 (hooki VildaVault i 39 kluczy _eventLog bez zmian — od E2-PR4c z markSyncCaughtUp, ładunki hooków równe na
// sejfie i sejfie bez wstawek); w HK14 część haka H1 (bez pfull i bez odczytu bramki w kroku importu).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SKRYPTY_PUNKTU, drugieOkno, naAtrapie, nazwaBazy, oknoMagazynu, przechwycZadaniaWTle,
} from '../support/okno-magazynu.mjs';
import { HASLO_A, magazynZRejestrem, naglowek, okno as oknoSesji } from './sesja-zapisu-uprzaz.mjs';
import { ZRODLO_SEJFU, bezWstawek, licznikEmisji } from '../support/sejf-bez-wstawek.mjs';

const START = Date.parse('2026-03-02T08:00:00.000Z');
const MIN = 60_000;
const CZAS = 60_000;
let zegar = START;
const tik = (ms = 1000) => { zegar += ms; vi.setSystemTime(zegar); };
const naStart = () => { zegar = START; vi.setSystemTime(zegar); };
const makrozadanie = () => new Promise((r) => { setImmediate(r); });
// Sejf z hakami scalania (E2-PR3b). Strażniki HK15 i HK16 na sejfie bez haków sprawdzają tylko stan (bez wierszy,
// ładunki hooków); sprawdzenia, że haki doszły do emisji, — tylko na sejfie z hakami.
const MA_HAKI = /function Bem_przegrany\(/.test(ZRODLO_SEJFU);

const OKNA = [];
const OKNA_W_PAMIECI = [];
const UCHWYTY = [];

beforeEach(() => {
  przechwycZadaniaWTle();
  vi.useFakeTimers({ toFake: ['Date'] });
  naStart();
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
  for (const o of OKNA_W_PAMIECI.splice(0)) { o.krypto.rozbroj(); if (o.locks) await o.locks.zwolnijWszystkie(); o.timery.wyczysc(); }
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  expect(bledy, 'higiena po przypadku').toEqual([]);
}, 60_000);

// ── Okna ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Pole bramki z getterem: stan i licznik odczytów.
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
  o.gotowe = async () => { if (typeof o.ev.emissionsSettled === 'function') await o.ev.emissionsSettled(); await o.cisza(); };
  return o;
}
// Okno z kopią sejfu z licznikiem (zrodlo — tekst sejfu, np. sejf bez wstawek); przegląd przy odblokowaniu jak
// w przeglądarce; konta zakładane przy zamkniętej bramce (odOtwartej: true — przy otwartej, np. tryb „Zaloguj
// jednorazowo”, w którym założenie konta jest jedynym odblokowaniem), potem bramka według opcji.
async function okno({ bramka = true, zrodlo = null, wymagaj = true, odOtwartej = false, ...reszta } = {}) {
  const l = licznikEmisji(zrodlo ? { zrodlo } : {});
  const o = await oknoMagazynu({ konta: 'A', skrypty: SKRYPTY_PUNKTU, ...reszta, emisja: true, przeglad: true, bramka: odOtwartej, zrodla: { 'vilda_vault.js': l.zaladuj } });
  OKNA.push(o);
  zBramka(o, l, bramka);
  if (wymagaj) expect(typeof o.ev.sweepOutbox, 'część przeglądu kolejki (VildaVault._eventLog.sweepOutbox)').toBe('function');
  return o;
}
// Bliźniak: niezależna kopia baz atrapy z tym samym kontem (ten sam klucz). Domyślnie bramka zamknięta (bez pola okna);
// emisja: true — kopia sejfu z licznikiem i otwarta bramka po odblokowaniu (odblokowanie bez przeglądu kolejki).
async function blizniak(o, { emisja = false } = {}) {
  const l = emisja ? licznikEmisji() : null;
  const B = await oknoMagazynu({
    idb: o.idb.__atrapa.klonuj(), istniejace: { A: o.A, B: o.B }, bramka: false, konta: 'A', zaloguj: 'A', skrypty: SKRYPTY_PUNKTU,
    ...(emisja ? { emisja: true, zrodla: { 'vilda_vault.js': l.zaladuj } } : {}),
  });
  OKNA.push(B);
  return emisja ? zBramka(B, l, true) : B;
}
// „Przeładowanie strony”: nowe okno na tej samej atrapie, z tym samym localStorage i blokadami, bez logowania.
async function przeladuj(o) {
  const l = licznikEmisji();
  const o2 = await drugieOkno(o, { zaloguj: null, emisja: true, przeglad: true, bramka: false, zrodla: { 'vilda_vault.js': l.zaladuj } });
  OKNA.push(o2);
  return zBramka(o2, l, true);
}

// Okno w pamięci: okno uprzęży sesji z adapterem sejfu w pamięci (klucz zrzutu stanu w sessionStorage okna) w rejestrze
// wywołań (o.m.wyw — [metoda, userId]); zrodlo — kopia sejfu z licznikiem (o.l), bez zrodla — sejf z repozytorium;
// klon — zrzut stanu adaptera innego okna (bliźniak: ten sam rejestr kont i dane, osobny adapter). Pole bramki
// z getterem (zamknięta).
const KLUCZ_ZRZUTU = 'fikcyjny-zrzut-adaptera-w-pamieci';
function magazynSesji(m) {
  return {
    getItem: (k) => (k in m ? m[k] : null), setItem: (k, w) => { m[k] = String(w); }, removeItem: (k) => { delete m[k]; },
    clear: () => { for (const k of Object.keys(m)) delete m[k]; }, key: (i) => Object.keys(m)[i] || null, get length() { return Object.keys(m).length; },
  };
}
function oknoWPamieci({ zrodlo = null, klon = null, licznik = true } = {}) {
  const l = licznik ? licznikEmisji(zrodlo ? { zrodlo } : {}) : null;
  const o = oknoSesji({
    skrypty: SKRYPTY_PUNKTU,
    ...(l ? { zrodla: { 'vilda_vault.js': l.zaladuj } } : {}),
    ...(klon ? { dodatki: { sessionStorage: magazynSesji({ [KLUCZ_ZRZUTU]: klon }) } } : {}),
  });
  OKNA_W_PAMIECI.push(o);
  o.v = o.win.VildaVault;
  o.m = magazynZRejestrem(o.v.createInMemoryAdapter({ persistKey: KLUCZ_ZRZUTU }));
  o.v.setStorageAdapter(o.m.adapter);
  o.l = l;
  o.bramka = { otwarta: false, odczyty: 0 };
  Object.defineProperty(o.win, 'VILDA_EVENT_LOG', {
    get() { o.bramka.odczyty += 1; return o.bramka.otwarta; },
    set(x) { o.bramka.otwarta = x; },
    configurable: true,
  });
  o.cisza = async () => { for (let i = 0; i < 30; i += 1) await makrozadanie(); };
  return o;
}
// Zrzut stanu adaptera w pamięci (zapis do sessionStorage idzie zegarem okna 0 ms).
async function zrzut(o) {
  for (let i = 0; i < 200 && o.timery.oczekujace().some((t) => t.ms === 0); i += 1) await new Promise((r) => { setTimeout(r, 1); });
  const z = o.win.sessionStorage.getItem(KLUCZ_ZRZUTU);
  expect(typeof z, 'kontrola: zrzut adaptera w pamięci').toBe('string');
  return z;
}

// ── Dane fikcyjne i pomocnicze ───────────────────────────────────────────────────────────────────────────────────────
const NOTATKA = (P, pola = {}) => ({ patientId: P, title: 'Fikcyjna notatka', body: 'Fikcyjna treść.', category: 'inne', ...pola });
const ostatni = (o, kto = 'A') => o.kolejka(kto).reduce((m, w) => Math.max(m, w.seqLocal), 0);
const wierszeOd = (o, od, kto = 'A') => o.kolejka(kto).filter((w) => w.seqLocal > od);
const opis = (w) => [w.kind, w.entityKey, w.setId, w.state];
const klucze = (o, kto = 'A') => o.kolejka(kto).map((w) => `${w.kind}|${w.entityKey}`);
const wersje = async (v, P) => ((await v.getPatient(P)) || { snapshots: [] }).snapshots.map((s) => s.snapshotId).sort();
const odszyfruj = (o, env) => o.v.decryptPayloadForCurrentUser(env.iv, env.data);
const bazyKolejki = async (o) => (await o.idb.databases()).map((d) => d.name).filter((n) => n.startsWith('vilda_sync_'));
const kluczeSync = (o) => Object.keys(o.lokalny.m).filter((k) => k.startsWith('vilda-sync-'));
const zadaniaKolejki = (o) => (o.locks ? o.locks.zadania.filter((z) => !z.test && z.nazwa.startsWith('vilda-sync')) : []);
// Karta „Testowy Jan<i>” z wersjami o podanych masach (krok zegara 1 s po każdej).
async function karta(o, i = 1, masy = [22, 23], opcje = {}) {
  const r = await o.v.savePatient(naglowek(i, { masa: masy[0] }), { dedup: false, ...opcje });
  tik();
  const w = [r.snapshotId];
  for (const m of masy.slice(1)) { w.push((await o.v.savePatient(naglowek(i, { masa: m }), { dedup: false, patientId: r.patientId })).snapshotId); tik(); }
  return { P: r.patientId, w };
}
const wizyta = async (o, P, masa) => { const r = await o.v.savePatient(naglowek(1, { masa }), { dedup: false, patientId: P }); tik(); return r.snapshotId; };
async function notatka(o, P) {
  const n = (await o.v.savePatientNote(NOTATKA(P))).id;
  tik();
  return n;
}
// Koperta zdarzenia bliźniaka zbudowana i zaszyfrowana teraz (builder części Bev_, bez bramki).
async function koperta(B, k) {
  expect(k, 'kontrola: builder dał kopertę').toBeTruthy();
  return { env: (await B.ev.encryptEvent(k)).env, k };
}
// Koperta ptomb bliźniaka zbudowana w chwili usunięcia (zanim bliźniak dostanie wersję karty, która zdejmie jego
// nagrobek) i chwila nagrobka.
async function kopertaNagrobka(B, P) {
  const { env, k } = await koperta(B, await B.ev.buildPatientTombstoneEvent(P, null));
  return { env, deletedAtISO: k.event.atISO };
}
async function zastosuj(Y, wiersze) {
  const s = [];
  for (const w of wiersze) s.push((await Y.ev.applyEncryptedEvent(w.env)).status);
  await Y.cisza();
  return s;
}
const nagrobekWLadunku = (lad, P) => (lad.tombstones || []).find((t) => t.patientId === P).deletedAtISO;
// Liczniki odczytów bramki kopii z licznikiem od znacznika.
const stanLicznika = (l) => ({ emisje: l.emisje.length, przeglady: l.przeglady.length, scalenia: l.scalenia.length, przegrane: l.przegrane.length, ratunki: l.ratunki.length });
const odZnacznika = (l, z) => ({
  emisje: l.emisje.slice(z.emisje), przeglady: l.przeglady.slice(z.przeglady), scalenia: l.scalenia.length - z.scalenia,
  przegrane: l.przegrane.slice(z.przegrane), ratunki: l.ratunki.slice(z.ratunki),
});
// Karta A z dwiema wizytami i notatką; bliźniak usuwa kartę (z notatką), A dopisuje wizytę: pełny ładunek bliźniaka
// ma nagrobek karty, który u A przegrywa z chwilą karty, i nagrobek notatki, którą scalanie u A ratuje (D-21).
async function przegranyZRatunkiem(o) {
  const k = await karta(o, 1);
  const n = await notatka(o, k.P);
  await o.gotowe();
  const B = await blizniak(o);
  tik(MIN);
  await B.v.removePatient(k.P);
  tik(MIN);
  await B.cisza();
  const ladunek = await B.v.exportSyncPayload();
  const S3 = await wizyta(o, k.P, 24);
  tik(MIN);
  await o.gotowe();
  return { ...k, n, B, ladunek, d: nagrobekWLadunku(ladunek, k.P), S3, przed: (await o.v.getPatientNote(n)).updatedAtISO };
}
// Zapis przebiegu atrapy bez identyfikatora konta.
const bezKonta = (log, uid) => log.map((w) => JSON.stringify(w).split(uid).join('<konto>'));
// Wpisy jako zbiór z krotnością (posortowane): kolejność wpisów transakcji atrapy i operacji crypto.subtle rozpoczętych
// równolegle (np. odczyty na starcie scalania) zależy od czasu operacji asynchronicznych, a nie od wstawek.
const zbior = (l) => l.slice().sort();
// FNV-1a 32 (niezależny zapis reguły setId spoza białej listy).
function fnv(s) {
  let f = 2166136261;
  for (let i = 0; i < s.length; i += 1) { f ^= s.charCodeAt(i); f = Math.imul(f, 16777619) >>> 0; }
  return f.toString(16).padStart(8, '0');
}
function wstrzymaj(o, wz) {
  const h = o.idb.__atrapa.wstrzymaj(wz);
  const u = { czeka: h.czeka, zwolniony: false, zwolnij() { u.zwolniony = true; h.zwolnij(); } };
  UCHWYTY.push(u);
  return u;
}
const HOOKI = ['onPatientSaved', 'onPatientDeleted', 'onPatientNoteChanged', 'onNoteChanged', 'onPatientListChanged',
  'onPasskeyChanged', 'onCredentialChanged', 'onPreferenceChanged'];
const ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
function maskarka() {
  const znane = new Map();
  const id = (s) => { if (!znane.has(s)) znane.set(s, `<id${znane.size + 1}>`); return znane.get(s); };
  return (d) => JSON.stringify(d === undefined ? null : d, (k, w) => (typeof w === 'string' ? w.replace(ID, id) : w));
}

// ── HK1 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('HK1: równoważność Le przy zamkniętej bramce', () => {
  it('HK1: adapter IndexedDB — sejf i sejf bez wstawek na ładunku z przegranym nagrobkiem i ratunkiem: ten sam wynik mergeSyncPayload, zapis przebiegu atrapy i operacje crypto.subtle; odczyty pola bramki 3 i 0; bez bazy, kluczy i blokad kolejki', async () => {
    const w = {};
    for (const wariant of ['sejf', 'bez wstawek']) {
      naStart();
      const o = await okno({ bramka: false, zrodlo: wariant === 'sejf' ? null : bezWstawek(), wymagaj: wariant === 'sejf' });
      await o.zaloguj('A');
      const s = await przegranyZRatunkiem(o);
      await o.cisza();
      const z = o.znacznik();
      const k0 = o.krypto.log.length;
      const l0 = stanLicznika(o.l);
      const odczyty0 = o.bramka.odczyty;
      const lOdczyty0 = o.l.odczyty();
      tik(MIN);
      const r = await o.v.mergeSyncPayload(s.ladunek);
      await o.gotowe();
      w[wariant] = {
        s, r, log: zbior(bezKonta(o.idb.__atrapa.log.slice(z.log), o.uid)), krypto: zbior(o.krypto.log.slice(k0).map((x) => x.metoda)),
        odczyty: o.bramka.odczyty - odczyty0, lOdczyty: o.l.odczyty() - lOdczyty0, l: odZnacznika(o.l, l0),
        uratowana: (await o.v.getPatientNote(s.n)).updatedAtISO > s.przed, karta: (await wersje(o.v, s.P)).length,
        kolejka: { bazy: await bazyKolejki(o), log: o.logKolejki(z), klucze: kluczeSync(o), blokady: zadaniaKolejki(o) },
      };
    }
    const [a, b] = [w.sejf, w['bez wstawek']];
    expect([a.r.deletedPatientCount, a.r.updatedPatientNoteCount, a.uratowana, a.karta], 'kontrola: nagrobek karty przegrał, notatka uratowana').toEqual([0, 1, true, 3]);
    expect(a.r, 'wynik mergeSyncPayload').toEqual(b.r);
    expect(a.log.length, 'kontrola: zapis przebiegu atrapy niepusty').toBeGreaterThan(0);
    expect(a.log, 'zapis przebiegu atrapy IndexedDB w scaleniu').toEqual(b.log);
    expect(a.krypto, 'operacje crypto.subtle w scaleniu').toEqual(b.krypto);
    expect({ sejf: a.odczyty, bez: b.odczyty }, 'odczyty pola bramki w scaleniu').toEqual({ sejf: 3, bez: 0 });
    expect({ sejf: a.lOdczyty, bez: b.lOdczyty }, 'l.odczyty() kopii z licznikiem = odczyty pola').toEqual({ sejf: 3, bez: 0 });
    expect(a.l, 'sejf: odczyty bramki w częściach (para scalania, przegrany nagrobek, ratunek)').toEqual({
      emisje: [], przeglady: [], scalenia: 1, przegrane: [{ p: a.s.P, d: a.s.d }], ratunki: [{ id: a.s.n }],
    });
    expect(b.l, 'sejf bez wstawek: bez odczytów bramki').toEqual({ emisje: [], przeglady: [], scalenia: 0, przegrane: [], ratunki: [] });
    for (const [nazwa, x] of [['sejf', a], ['bez wstawek', b]]) {
      expect(x.kolejka, `${nazwa}: bez bazy vilda_sync_*, wpisów atrapy, kluczy vilda-sync-* i blokad vilda-sync*`).toEqual({ bazy: [], log: [], klucze: [], blokady: [] });
    }
  }, CZAS);

  it('HK1: adapter w pamięci — sejf i sejf bez wstawek na tym samym ładunku: ten sam wynik mergeSyncPayload, ta sama lista wywołań adaptera i te same operacje crypto.subtle; odczyty pola bramki 3 i 0', async () => {
    const w = {};
    for (const wariant of ['sejf', 'bez wstawek']) {
      naStart();
      const A = oknoWPamieci({ zrodlo: wariant === 'sejf' ? null : bezWstawek() });
      const u = await A.v.createUser(HASLO_A, { label: 'Fikcyjna Lekarka A', iterations: 1000 });
      tik();
      const r1 = await A.v.savePatient(naglowek(1), { dedup: false });
      tik();
      await A.v.savePatient(naglowek(1, { masa: 23 }), { dedup: false, patientId: r1.patientId });
      tik();
      const P = r1.patientId;
      const n = (await A.v.savePatientNote(NOTATKA(P))).id;
      tik();
      await A.cisza();
      const T = oknoWPamieci({ klon: await zrzut(A), licznik: false });
      await T.v.unlockUser(u.userId, HASLO_A);
      expect((await T.v.getPatient(P)).snapshots.length, 'kontrola: bliźniak w pamięci ma kartę').toBe(2);
      tik(MIN);
      await T.v.removePatient(P);
      tik(MIN);
      const ladunek = await T.v.exportSyncPayload();
      await A.v.savePatient(naglowek(1, { masa: 24 }), { dedup: false, patientId: P });
      tik(MIN);
      await A.cisza();
      const w0 = A.m.wyw.length;
      const k0 = A.krypto.log.length;
      const l0 = stanLicznika(A.l);
      const odczyty0 = A.bramka.odczyty;
      const lOdczyty0 = A.l.odczyty();
      tik(MIN);
      const r = await A.v.mergeSyncPayload(ladunek);
      await A.cisza();
      w[wariant] = {
        P, n, d: nagrobekWLadunku(ladunek, P), r, wyw: A.m.wyw.slice(w0).map(([m, k]) => `${m} ${k === u.userId ? '<konto>' : k}`),
        krypto: zbior(A.krypto.log.slice(k0).map((x) => x.metoda)), odczyty: A.bramka.odczyty - odczyty0, lOdczyty: A.l.odczyty() - lOdczyty0,
        l: odZnacznika(A.l, l0),
      };
    }
    const [a, b] = [w.sejf, w['bez wstawek']];
    expect([a.r.deletedPatientCount, a.r.updatedPatientNoteCount], 'kontrola: nagrobek karty przegrał, notatka uratowana').toEqual([0, 1]);
    expect(a.r, 'wynik mergeSyncPayload').toEqual(b.r);
    expect(a.wyw.length, 'kontrola: lista wywołań adaptera niepusta').toBeGreaterThan(0);
    expect(a.wyw, 'wywołania adaptera w pamięci w scaleniu').toEqual(b.wyw);
    expect(a.krypto, 'operacje crypto.subtle w scaleniu').toEqual(b.krypto);
    expect({ sejf: a.odczyty, bez: b.odczyty }, 'odczyty pola bramki w scaleniu').toEqual({ sejf: 3, bez: 0 });
    expect({ sejf: a.lOdczyty, bez: b.lOdczyty }, 'l.odczyty() kopii z licznikiem = odczyty pola').toEqual({ sejf: 3, bez: 0 });
    expect(a.l, 'sejf: odczyty bramki w częściach').toEqual({ emisje: [], przeglady: [], scalenia: 1, przegrane: [{ p: a.P, d: a.d }], ratunki: [{ id: a.n }] });
    expect(b.l, 'sejf bez wstawek: bez odczytów bramki').toEqual({ emisje: [], przeglady: [], scalenia: 0, przegrane: [], ratunki: [] });
  }, CZAS);
});

// ── HK2–HK5: hak H1 ──────────────────────────────────────────────────────────────────────────────────────────────────
// Karta A z trzema wizytami; bliźniak B usuwa kartę (koperta ptomb z chwili usunięcia); A dopisuje czwartą wizytę;
// B dostaje zdarzenie snap tej wizyty (karta częściowa — nagrobek B przegrywa z nowszą chwilą karty).
async function kartaCzesciowa(o) {
  const k = await karta(o, 1, [22, 23, 24]);
  await o.gotowe();
  const B = await blizniak(o);
  tik(MIN);
  await B.v.removePatient(k.P);
  tik(MIN);
  await B.cisza();
  const nag = await kopertaNagrobka(B, k.P);
  const ladunek = await B.v.exportSyncPayload();
  const S4 = await wizyta(o, k.P, 25);
  tik(MIN);
  await o.gotowe();
  const snap = o.kolejka('A').filter((w) => w.kind === 'snap' && w.entityKey === `${k.P}/${S4}`);
  expect(await zastosuj(B, snap), 'kontrola: snap nowej wizyty u B').toEqual(['applied']);
  expect(await wersje(B.v, k.P), 'kontrola: B z kartą częściową (jedna wersja)').toEqual([S4]);
  return { ...k, B, nag, ladunek, S4, snap };
}
// Jeden zestaw pfull karty P (jedna porcja, pending, setId z chwili nagrobka, event.full); odbiorca dostaje wszystkie wersje A.
async function sprawdzZestaw(o, s0, P, deletedAtISO, odbiorca) {
  const setId = `${P}:${deletedAtISO}`;
  const nowe = wierszeOd(o, s0);
  expect(nowe.map(opis), 'wiersze po scaleniu: jeden zestaw pfull').toEqual([['pfull', P, setId, 'pending']]);
  const k = await odszyfruj(o, nowe[0].env);
  expect([k.event.kind, k.event.key, k.event.full], 'koperta pfull: rodzaj, karta, event.full').toEqual(['pfull', P, { setId, i: 0, n: 1 }]);
  expect(k.patients.map((x) => x.snapshots.length), 'koperta pfull: wszystkie wersje karty').toEqual([(await wersje(o.v, P)).length]);
  if (odbiorca) {
    expect(await zastosuj(odbiorca, nowe), 'pfull u odbiorcy').toEqual(['applied']);
    expect(await wersje(odbiorca.v, P), 'odbiorca ma wszystkie wersje A').toEqual(await wersje(o.v, P));
  }
  return nowe;
}

describe('HK2–HK5: hak H1 — przegrany nagrobek karty', () => {
  it('HK2: zdarzenie ptomb bliźniaka przegrywa z nowszą wizytą A — jeden zestaw pfull (1 porcja, pending, setId <patientId>:<deletedAtISO>, event.full { setId, i: 0, n: 1 }); bliźniak z kartą częściową dostaje wszystkie 4 wersje', async () => {
    const o = await okno();
    await o.zaloguj('A');
    const s = await kartaCzesciowa(o);
    const s0 = ostatni(o);
    const l0 = stanLicznika(o.l);
    expect((await o.ev.applyEncryptedEvent(s.nag.env)).status, 'ptomb B na A').toBe('applied');
    tik();
    await o.gotowe();
    expect(odZnacznika(o.l, l0).przegrane, 'odczyt bramki w haku H1').toEqual([{ p: s.P, d: s.nag.deletedAtISO }]);
    await sprawdzZestaw(o, s0, s.P, s.nag.deletedAtISO, s.B);
    expect(await wersje(s.B.v, s.P), 'kontrola: 4 wersje').toHaveLength(4);
  }, CZAS);

  for (const [nazwa, nagrobekNajpierw] of [['C: najpierw ptomb B, potem snap A', true], ['C: najpierw snap A, potem ptomb B', false]]) {
    it(`HK3: trzy urządzenia (${nazwa}) — po dostawach z haków B i C mają wszystkie wersje A; zestaw tylko tam, gdzie nagrobek z ładunku przegrał`, async () => {
      const o = await okno();
      await o.zaloguj('A');
      const k = await karta(o, 1, [22, 23, 24]);
      await o.gotowe();
      const B = await blizniak(o);
      const C = await blizniak(o, { emisja: true });
      tik(MIN);
      await B.v.removePatient(k.P);
      tik(MIN);
      await B.cisza();
      const nag = await kopertaNagrobka(B, k.P);
      const S4 = await wizyta(o, k.P, 25);
      tik(MIN);
      await o.gotowe();
      const snap = o.kolejka('A').filter((w) => w.kind === 'snap' && w.entityKey === `${k.P}/${S4}`);
      const sA = ostatni(o);
      const sC = ostatni(C);
      if (nagrobekNajpierw) {
        expect(await zastosuj(C, [{ env: nag.env }]), 'C: ptomb B').toEqual(['applied']);
        expect(await wersje(C.v, k.P), 'kontrola: C bez karty').toEqual([]);
        expect(await zastosuj(C, snap), 'C: snap A').toEqual(['applied']);
        expect(await wersje(C.v, k.P), 'kontrola: C z kartą częściową').toEqual([S4]);
      } else {
        expect(await zastosuj(C, snap), 'C: snap A').toEqual(['applied']);
        expect(await zastosuj(C, [{ env: nag.env }]), 'C: ptomb B').toEqual(['applied']);
        expect(await wersje(C.v, k.P), 'kontrola: C z pełną kartą').toHaveLength(4);
      }
      await C.gotowe();
      expect((await o.ev.applyEncryptedEvent(nag.env)).status, 'A: ptomb B').toBe('applied');
      tik();
      await o.gotowe();
      expect(await zastosuj(B, snap), 'B: snap A').toEqual(['applied']);
      const setId = `${k.P}:${nag.deletedAtISO}`;
      const zA = wierszeOd(o, sA);
      const zC = wierszeOd(C, sC);
      expect({ A: zA.map(opis), C: zC.map(opis) }, 'zestawy z haka H1').toEqual({
        A: [['pfull', k.P, setId, 'pending']], C: nagrobekNajpierw ? [] : [['pfull', k.P, setId, 'pending']],
      });
      for (const [Y, zestawy] of [[B, [zA, zC]], [C, [zA]], [o, [zC]]]) {
        for (const z of zestawy) expect(await zastosuj(Y, z), 'dostawa z haka').toEqual(z.map(() => 'applied'));
      }
      await o.gotowe();
      const pelna = await wersje(o.v, k.P);
      expect(pelna, 'kontrola: A ma 4 wersje').toHaveLength(4);
      expect({ B: await wersje(B.v, k.P), C: await wersje(C.v, k.P) }, 'B i C mają wszystkie wersje A').toEqual({ B: pelna, C: pelna });
      await C.gotowe();
      expect(wierszeOd(C, sC).map(opis), 'C: dostawy nie dają nowych zestawów').toEqual(zC.map(opis));
    }, CZAS);
  }

  for (const sposob of ['mergeSyncPayload (pełny ładunek)', 'applyEncryptedDelta (koperta ptomb)']) {
    it(`HK4: hak H1 z ${sposob} — jeden zestaw pfull z setId z chwili nagrobka; bliźniak z kartą częściową dostaje wszystkie wersje`, async () => {
      const o = await okno();
      await o.zaloguj('A');
      const s = await kartaCzesciowa(o);
      const s0 = ostatni(o);
      tik(MIN);
      if (sposob.startsWith('merge')) await o.v.mergeSyncPayload(s.ladunek);
      else expect(await o.v.applyEncryptedDelta(s.nag.env), 'kontrola: delta zastosowana').toBeTruthy();
      tik();
      await o.gotowe();
      expect(nagrobekWLadunku(s.ladunek, s.P), 'kontrola: ta sama chwila nagrobka w ładunku i kopercie').toBe(s.nag.deletedAtISO);
      await sprawdzZestaw(o, s0, s.P, s.nag.deletedAtISO, s.B);
    }, CZAS);
  }

  it('HK5: karta zapisana w trakcie scalania (atrapa wstrzymana po odczycie listy nagrobków, zapis wizyty) — Bsl_usunPacjenta zostawia kartę (deletedPatientCount 0) i daje jeden zestaw pfull z chwilą nagrobka; bliźniak dostaje kartę ze wszystkimi wersjami', async () => {
    const o = await okno();
    await o.zaloguj('A');
    const k = await karta(o, 1);
    await o.gotowe();
    const B = await blizniak(o);
    tik(MIN);
    await B.v.removePatient(k.P);
    tik(MIN);
    await B.cisza();
    const ladunek = await B.v.exportSyncPayload();
    const d = nagrobekWLadunku(ladunek, k.P);
    const s0 = ostatni(o);
    const l0 = stanLicznika(o.l);
    const h = wstrzymaj(o, { przy: 'success', baza: `vilda_user_${o.uid}`, sklep: 'tombstones', metoda: 'getAll' });
    const p = o.v.mergeSyncPayload(ladunek);
    await h.czeka;
    tik();
    // Zapis wizyty rusza, gdy scalanie ma już listę kart i nagrobków; atrapa zwolniona dopiero, gdy zapis trzyma blokadę
    // pacjenta — Bsl_usunPacjenta czeka na nią i czyta kartę po zapisie.
    const blokada = new RegExp(`pat:${k.P}$`);
    const od = o.locks.zadania.length;
    const zapis = o.v.savePatient(naglowek(1, { masa: 26 }), { dedup: false, patientId: k.P });
    const zadanie = await o.locks.czekajNaZadanie((z) => blokada.test(z.nazwa), { od });
    expect(zadanie.wynik, 'kontrola: zapis karty trzyma blokadę pacjenta w trakcie scalania').toBe('przyznana');
    h.zwolnij();
    const r = await p;
    const S3 = (await zapis).snapshotId;
    expect(o.locks.zadania.slice(od).filter((z) => blokada.test(z.nazwa) && !z.test).length, 'kontrola: blokada pacjenta — zapis, potem scalanie').toBeGreaterThanOrEqual(2);
    tik();
    await o.gotowe();
    expect(r.deletedPatientCount, 'karta zostaje').toBe(0);
    expect(await wersje(o.v, k.P), 'kontrola: karta z wizytą zapisaną w trakcie scalania').toEqual([...k.w, S3].sort());
    expect(odZnacznika(o.l, l0).przegrane, 'odczyt bramki w haku H1 (Bsl_usunPacjenta)').toEqual([{ p: k.P, d }]);
    const nowe = wierszeOd(o, s0);
    expect(nowe.map(opis), 'wiersze: snap zapisu i jeden zestaw pfull z chwilą nagrobka').toEqual([
      ['snap', `${k.P}/${S3}`, null, 'pending'], ['pfull', k.P, `${k.P}:${d}`, 'pending'],
    ]);
    expect(await zastosuj(B, nowe), 'wiersze u bliźniaka').toEqual(['applied', 'applied']);
    expect(await wersje(B.v, k.P), 'bliźniak ma wszystkie wersje A').toEqual(await wersje(o.v, k.P));
  }, CZAS);

  it('HK5: adapter w pamięci z wstawką (karta zapisana w trakcie scalania, po pierwszym listTombstonesForUser) — karta zostaje, odczyt bramki w Bem_przegrany z chwilą nagrobka i emisja pfull z sesją scalania (bez kolejki poza trybem „Komputer prywatny”)', async () => {
    const A = oknoWPamieci();
    const u = await A.v.createUser(HASLO_A, { label: 'Fikcyjna Lekarka A', iterations: 1000 });
    tik();
    const r1 = await A.v.savePatient(naglowek(1), { dedup: false });
    tik();
    const P = r1.patientId;
    await A.cisza();
    const T = oknoWPamieci({ klon: await zrzut(A), licznik: false });
    await T.v.unlockUser(u.userId, HASLO_A);
    tik(MIN);
    await T.v.removePatient(P);
    tik(MIN);
    const ladunek = await T.v.exportSyncPayload();
    const d = nagrobekWLadunku(ladunek, P);
    A.bramka.otwarta = true;
    const l0 = stanLicznika(A.l);
    let zapis = null;
    A.m.po('listTombstonesForUser', async () => { tik(); zapis = await A.v.savePatient(naglowek(1, { masa: 27 }), { dedup: false, patientId: P }); });
    const r = await A.v.mergeSyncPayload(ladunek);
    await A.cisza();
    expect(!!zapis, 'kontrola: karta zapisana w trakcie scalania').toBe(true);
    expect(r.deletedPatientCount, 'karta zostaje').toBe(0);
    expect((await A.v.getPatient(P)).snapshots.map((x) => x.snapshotId).sort(), 'kontrola: karta z wizytą').toEqual([r1.snapshotId, zapis.snapshotId].sort());
    const l = odZnacznika(A.l, l0);
    expect(l.przegrane, 'odczyt bramki w haku H1 (Bsl_usunPacjenta)').toEqual([{ p: P, d }]);
    expect(l.emisje.filter((e) => e.kind === 'pfull'), 'emisja pfull z sesją scalania').toEqual([{ kind: 'pfull', klucze: { patientId: P }, sesja: true }]);
  }, CZAS);
});

// ── HK6–HK8 ──────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('HK6–HK8: bez haka H1, bez powtórzeń, setId spoza białej listy', () => {
  it('HK6: nagrobek wygrywa (karta usunięta) — 0 wierszy pfull, bez odczytu bramki w haku H1', async () => {
    const o = await okno();
    await o.zaloguj('A');
    const k = await karta(o, 1);
    await o.gotowe();
    const B = await blizniak(o);
    tik(MIN);
    await B.v.removePatient(k.P);
    tik(MIN);
    await B.cisza();
    const s0 = ostatni(o);
    const l0 = stanLicznika(o.l);
    const r = await o.v.mergeSyncPayload(await B.v.exportSyncPayload());
    tik();
    await o.gotowe();
    expect([r.deletedPatientCount, await wersje(o.v, k.P)], 'kontrola: karta usunięta').toEqual([1, []]);
    expect(wierszeOd(o, s0).map(opis), 'wiersze po scaleniu').toEqual([]);
    expect(odZnacznika(o.l, l0).przegrane, 'odczyty bramki w haku H1').toEqual([]);
  }, CZAS);

  it('HK6: karta zostaje do ponowienia usunięcia (błąd zapisu listy kosza przed usunięciem karty) — 0 wierszy pfull; następne scalenie usuwa kartę, też bez pfull', async () => {
    const ostrzezenia = [];
    vi.spyOn(console, 'warn').mockImplementation((...a) => { ostrzezenia.push(String(a[0])); });
    const o = await okno();
    await o.zaloguj('A');
    const k = await karta(o, 1, [20, 23, 25]);
    await o.gotowe();
    const B = await blizniak(o);
    tik(MIN);
    // A poprawia drugą wizytę, potem B daje ją do kosza i usuwa kartę: przed usunięciem karty A zapisuje listę kosza.
    const x = (await o.v.getPatient(k.P)).snapshots.find((w) => w.snapshotId === k.w[1]);
    await o.v.updateSnapshotPayload(k.P, k.w[1], { ...x.payload, user: { ...x.payload.user, weight: 74 } }, { preserveSavedAt: true });
    tik(MIN);
    await o.gotowe();
    await B.v.moveSnapshotToTrash(k.P, k.w[1]);
    tik(MIN);
    await B.v.removePatient(k.P);
    tik(MIN);
    await B.cisza();
    const ladunek = await B.v.exportSyncPayload();
    const s0 = ostatni(o);
    const l0 = stanLicznika(o.l);
    const u = o.idb.__atrapa.usterka({ przy: 'put', baza: `vilda_user_${o.uid}`, sklep: 'meta', blad: 'QuotaExceededError' });
    const r1 = await o.v.mergeSyncPayload(ladunek);
    tik();
    await o.gotowe();
    expect({ usterka: u.uzyta, ostrzezenie: ostrzezenia.some((t) => t.includes('lista przed usunieciem karty')) }, 'kontrola: błąd zapisu listy kosza przed usunięciem karty').toEqual({ usterka: 1, ostrzezenie: true });
    expect([r1.deletedPatientCount, !!(await o.v.getPatient(k.P))], 'karta zostaje do ponowienia').toEqual([0, true]);
    const r2 = await o.v.mergeSyncPayload(ladunek);
    tik();
    await o.gotowe();
    expect([r2.deletedPatientCount, await wersje(o.v, k.P)], 'kontrola: następne scalenie usuwa kartę').toEqual([1, []]);
    expect(wierszeOd(o, s0).map(opis), 'wiersze po obu scaleniach').toEqual([]);
    expect(odZnacznika(o.l, l0).przegrane, 'odczyty bramki w haku H1').toEqual([]);
  }, CZAS);

  it('HK6: lokalny nagrobek przegrywa z kartą z ładunku (Bsl_zdejmijNagrobek) — karta wraca, 0 wierszy pfull', async () => {
    const o = await okno();
    await o.zaloguj('A');
    const k = await karta(o, 1);
    await o.gotowe();
    const B = await blizniak(o);
    tik(MIN);
    await o.v.removePatient(k.P);
    tik(MIN);
    await o.gotowe();
    const S3 = await wizyta(B, k.P, 30);
    await B.cisza();
    const s0 = ostatni(o);
    const l0 = stanLicznika(o.l);
    await o.v.mergeSyncPayload(await B.v.exportSyncPayload());
    tik();
    await o.gotowe();
    expect(await wersje(o.v, k.P), 'kontrola: karta wraca z ładunku').toEqual([...k.w, S3].sort());
    expect(wierszeOd(o, s0).map(opis), 'wiersze po scaleniu').toEqual([]);
    expect(odZnacznika(o.l, l0).przegrane, 'odczyty bramki w haku H1').toEqual([]);
  }, CZAS);

  it('HK7: bez powtórzeń — to samo scalenie pełnego ładunku dwa razy i powtórka koperty ptomb: jeden zestaw; nagrobek z inną chwilą przegrywa — nowy zestaw zastępuje oczekujący zestaw na ogonie', async () => {
    const o = await okno();
    await o.zaloguj('A');
    const k = await karta(o, 1);
    await o.gotowe();
    const B = await blizniak(o);
    const C = await blizniak(o);
    tik(MIN);
    await B.v.removePatient(k.P);
    tik(MIN);
    await B.cisza();
    const nagB = await kopertaNagrobka(B, k.P);
    const ladunek = await B.v.exportSyncPayload();
    await C.v.removePatient(k.P);
    tik(MIN);
    await C.cisza();
    const nagC = await kopertaNagrobka(C, k.P);
    await wizyta(o, k.P, 24);
    tik(MIN);
    await o.gotowe();
    expect(nagC.deletedAtISO > nagB.deletedAtISO, 'kontrola: nagrobek C późniejszy niż nagrobek B').toBe(true);
    const s0 = ostatni(o);
    const l0 = stanLicznika(o.l);
    await o.v.mergeSyncPayload(ladunek);
    tik();
    await o.gotowe();
    const pierwszy = wierszeOd(o, s0).map(opis);
    expect(pierwszy, 'pierwsze scalenie: jeden zestaw').toEqual([['pfull', k.P, `${k.P}:${nagB.deletedAtISO}`, 'pending']]);
    const seq1 = ostatni(o);
    await o.v.mergeSyncPayload(ladunek);
    tik();
    await o.gotowe();
    expect((await o.ev.applyEncryptedEvent(nagB.env)).status, 'powtórka koperty ptomb').toBe('applied');
    tik();
    await o.gotowe();
    expect(wierszeOd(o, s0).map(opis), 'drugie scalenie i powtórka koperty: bez nowego zestawu').toEqual(pierwszy);
    expect(ostatni(o), 'kontrola: bez nowych wierszy').toBe(seq1);
    expect((await o.ev.applyEncryptedEvent(nagC.env)).status, 'ptomb C').toBe('applied');
    tik();
    await o.gotowe();
    const po = wierszeOd(o, s0);
    expect(po.map(opis), 'nowy zestaw zastępuje oczekujący zestaw na ogonie').toEqual([['pfull', k.P, `${k.P}:${nagC.deletedAtISO}`, 'pending']]);
    expect(po[0].seqLocal, 'kontrola: nowy wiersz').toBeGreaterThan(seq1);
    const l = odZnacznika(o.l, l0);
    expect({ przegrane: l.przegrane.length, pfull: l.emisje.filter((e) => e.kind === 'pfull').length }, 'odczyty bramki w haku H1 (4) i emisje pfull (2)').toEqual({ przegrane: 4, pfull: 2 });
  }, CZAS);

  it('HK7: to samo scalenie najpierw przy zamkniętej, potem przy otwartej bramce — zestaw powstaje przy otwartej', async () => {
    const o = await okno();
    await o.zaloguj('A');
    const s = await kartaCzesciowa(o);
    const s0 = ostatni(o);
    o.bramka.otwarta = false;
    const l0 = stanLicznika(o.l);
    await o.v.mergeSyncPayload(s.ladunek);
    tik();
    await o.gotowe();
    expect(odZnacznika(o.l, l0).przegrane, 'kontrola: hak H1 przy zamkniętej bramce (odczyt pola)').toEqual([{ p: s.P, d: s.nag.deletedAtISO }]);
    expect(wierszeOd(o, s0).map(opis), 'przy zamkniętej bramce bez wierszy').toEqual([]);
    o.bramka.otwarta = true;
    await o.v.mergeSyncPayload(s.ladunek);
    tik();
    await o.gotowe();
    await sprawdzZestaw(o, s0, s.P, s.nag.deletedAtISO, s.B);
  }, CZAS);

  it('HK8: setId spoza białej listy (karta o identyfikatorze dłuższym niż 40 znaków) — h + 8 znaków szesnastkowych (FNV-1a 32 z karty i chwili), ten sam na dwóch urządzeniach; wiersz powstaje', async () => {
    const DLUGI = 'fikcyjna-karta-ze-starego-importu-0000000001';
    const o = await okno();
    await o.zaloguj('A');
    const k = await karta(o, 1, [22, 23], { patientId: DLUGI });
    expect(k.P, 'kontrola: karta o długim identyfikatorze').toBe(DLUGI);
    await o.gotowe();
    const B = await blizniak(o);
    const C = await blizniak(o, { emisja: true });
    tik(MIN);
    await B.v.removePatient(k.P);
    tik(MIN);
    await B.cisza();
    const nag = await kopertaNagrobka(B, k.P);
    const S3 = await wizyta(o, k.P, 24);
    tik(MIN);
    await o.gotowe();
    expect(`${k.P}:${nag.deletedAtISO}`.length, 'kontrola: napis karty i chwili dłuższy niż 64 znaki').toBeGreaterThan(64);
    expect(await zastosuj(C, o.kolejka('A').filter((w) => w.kind === 'snap' && w.entityKey === `${k.P}/${S3}`)), 'C: snap A').toEqual(['applied']);
    const sA = ostatni(o);
    const sC = ostatni(C);
    expect(await zastosuj(o, [{ env: nag.env }]), 'A: ptomb B').toEqual(['applied']);
    expect(await zastosuj(C, [{ env: nag.env }]), 'C: ptomb B').toEqual(['applied']);
    await o.gotowe();
    await C.gotowe();
    const setId = `h${fnv(`${k.P}|${nag.deletedAtISO}`)}`;
    expect(setId, 'kontrola: h + 8 znaków szesnastkowych').toMatch(/^h[0-9a-f]{8}$/);
    expect({ A: wierszeOd(o, sA).map(opis), C: wierszeOd(C, sC).map(opis) }, 'ten sam zestaw na dwóch urządzeniach').toEqual({
      A: [['pfull', k.P, setId, 'pending']], C: [['pfull', k.P, setId, 'pending']],
    });
    const kop = await odszyfruj(o, wierszeOd(o, sA)[0].env);
    expect(kop.event.full, 'event.full').toEqual({ setId, i: 0, n: 1 });
  }, CZAS);
});

// ── HK9–HK11: hak H2 ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('HK9–HK11: hak H2 — ratunek notatki', () => {
  it('HK9: ratunek w scaleniu pełnego ładunku — wiersze [pfull, pnote] w tej kolejności; bliźniak dostaje kartę ze wszystkimi wersjami i notatkę', async () => {
    const o = await okno();
    await o.zaloguj('A');
    const s = await przegranyZRatunkiem(o);
    const s0 = ostatni(o);
    const l0 = stanLicznika(o.l);
    tik(MIN);
    await o.v.mergeSyncPayload(s.ladunek);
    tik();
    await o.gotowe();
    const nota = await o.v.getPatientNote(s.n);
    expect(nota.updatedAtISO > s.przed, 'kontrola: notatka uratowana z nową chwilą').toBe(true);
    expect(odZnacznika(o.l, l0).ratunki, 'odczyt bramki w haku H2').toEqual([{ id: s.n }]);
    const nowe = wierszeOd(o, s0);
    expect(nowe.map(opis), 'wiersze: pełna karta przed notatką').toEqual([['pfull', s.P, `${s.P}:${s.d}`, 'pending'], ['pnote', s.n, null, 'pending']]);
    expect(await zastosuj(s.B, nowe), 'wiersze u bliźniaka').toEqual(['applied', 'applied']);
    expect(await wersje(s.B.v, s.P), 'bliźniak: wszystkie wersje A').toEqual(await wersje(o.v, s.P));
    const nB = await s.B.v.getPatientNote(s.n);
    expect(nB && [nB.patientId, nB.updatedAtISO], 'bliźniak: notatka uratowana').toEqual([s.P, nota.updatedAtISO]);
  }, CZAS);

  it('HK10: „zawsze do kolejki” (N1) — bliźniak zapisuje notatkę i usuwa kartę, partia [pnote, ptomb, pnotetomb] z własną kopertą pnote notatki: u A pfull i pnote z haków; bliźniak po wierszach A ma kartę i notatkę', async () => {
    const o = await okno();
    await o.zaloguj('A');
    const k = await karta(o, 1);
    await o.gotowe();
    const B = await blizniak(o, { emisja: true });
    tik(MIN);
    const sB = ostatni(B);
    const n = (await B.v.savePatientNote(NOTATKA(k.P, { body: 'Fikcyjna treść notatki bliźniaka.' }))).id;
    tik(MIN);
    await B.v.removePatient(k.P);
    tik(MIN);
    await B.gotowe();
    const partia = wierszeOd(B, sB);
    expect(partia.map((w) => w.kind), 'kontrola: partia bliźniaka').toEqual(['pnote', 'ptomb', 'pnotetomb']);
    await wizyta(o, k.P, 24);
    tik(MIN);
    await o.gotowe();
    const s0 = ostatni(o);
    expect(await zastosuj(o, partia), 'partia u A').toEqual(['applied', 'applied', 'applied']);
    await o.gotowe();
    const nowe = wierszeOd(o, s0);
    expect(nowe.map((w) => [w.kind, w.entityKey]), 'wiersze z haków u A').toEqual([['pfull', k.P], ['pnote', n]]);
    expect(await zastosuj(B, nowe), 'wiersze A u bliźniaka').toEqual(['applied', 'applied']);
    const nB = await B.v.getPatientNote(n);
    expect({ karta: (await wersje(B.v, k.P)).length, notatka: nB && nB.body }, 'bliźniak: karta i notatka').toEqual({ karta: 3, notatka: 'Fikcyjna treść notatki bliźniaka.' });
  }, CZAS);

  it('HK10: ratunek w scaleniu zdarzenia pnote — A usuwa kartę, bliźniak dopisuje wizytę (snap: karta wraca u A), potem koperta pnote notatki sprzed usunięcia: pnote z haka', async () => {
    const o = await okno();
    await o.zaloguj('A');
    const k = await karta(o, 1);
    const n = await notatka(o, k.P);
    await o.gotowe();
    const B = await blizniak(o);
    const pnote = await koperta(B, await B.ev.buildPatientNoteEvent(n, null));
    tik(MIN);
    await o.v.removePatient(k.P);
    tik(MIN);
    await o.gotowe();
    const S3 = await wizyta(B, k.P, 30);
    await B.cisza();
    const snap = await koperta(B, await B.ev.buildSnapshotEvent(k.P, S3, null));
    const s0 = ostatni(o);
    const l0 = stanLicznika(o.l);
    expect(await zastosuj(o, [snap]), 'snap bliźniaka u A').toEqual(['applied']);
    await o.gotowe();
    expect({ karta: await wersje(o.v, k.P), wiersze: wierszeOd(o, s0).map(opis) }, 'kontrola: karta wraca (jedna wersja), bez wierszy').toEqual({ karta: [S3], wiersze: [] });
    expect(await zastosuj(o, [pnote]), 'pnote bliźniaka u A').toEqual(['applied']);
    await o.gotowe();
    expect(odZnacznika(o.l, l0).ratunki, 'odczyt bramki w haku H2').toEqual([{ id: n }]);
    expect(wierszeOd(o, s0).map(opis), 'pnote z haka').toEqual([['pnote', n, null, 'pending']]);
    expect(!!(await o.v.getPatientNote(n)), 'kontrola: notatka u A').toBe(true);
  }, CZAS);

  it('HK11: bez haka H2 — notatka przyjęta zwykłą regułą (wersja bliźniaka późniejsza niż usunięcie, akcja merge): 0 wierszy', async () => {
    const o = await okno();
    await o.zaloguj('A');
    const k = await karta(o, 1);
    const n = await notatka(o, k.P);
    await o.gotowe();
    const B = await blizniak(o);
    tik(MIN);
    await o.v.removePatient(k.P);
    tik(MIN);
    await o.gotowe();
    await B.v.savePatientNote(NOTATKA(k.P, { id: n, body: 'Fikcyjna treść poprawiona przez bliźniaka.' }));
    tik();
    await wizyta(B, k.P, 30);
    await B.cisza();
    const akcje = [];
    o.v.onPatientNoteChanged((d) => { if (d && d.id === n) akcje.push(d.action); });
    const s0 = ostatni(o);
    const l0 = stanLicznika(o.l);
    await o.v.mergeSyncPayload(await B.v.exportSyncPayload());
    tik();
    await o.gotowe();
    expect({ tresc: ((await o.v.getPatientNote(n)) || {}).body, akcje }, 'kontrola: notatka przyjęta zwykłą regułą').toEqual({ tresc: 'Fikcyjna treść poprawiona przez bliźniaka.', akcje: ['merge'] });
    expect(odZnacznika(o.l, l0).ratunki, 'odczyty bramki w haku H2').toEqual([]);
    expect(wierszeOd(o, s0).map(opis), 'wiersze po scaleniu').toEqual([]);
  }, CZAS);

  it('HK11: bez haka H2 — usunięcie notatki przy scaleniu: 0 wierszy', async () => {
    const o = await okno();
    await o.zaloguj('A');
    const k = await karta(o, 1);
    const n = await notatka(o, k.P);
    await o.gotowe();
    const B = await blizniak(o);
    tik(MIN);
    await B.v.removePatientNote(n);
    tik(MIN);
    await B.cisza();
    const s0 = ostatni(o);
    const l0 = stanLicznika(o.l);
    await o.v.mergeSyncPayload(await B.v.exportSyncPayload());
    tik();
    await o.gotowe();
    expect(await o.v.getPatientNote(n), 'kontrola: notatka usunięta').toBeFalsy();
    expect(odZnacznika(o.l, l0).ratunki, 'odczyty bramki w haku H2').toEqual([]);
    expect(wierszeOd(o, s0).map(opis), 'wiersze po scaleniu').toEqual([]);
  }, CZAS);

  it('HK11: bez haka H2 — nagrobek notatki w stanie „czeka” (zdarzenie pnotetomb bez nagrobka karty, karta nie jest późniejsza niż usunięcie): 0 wierszy', async () => {
    const o = await okno();
    await o.zaloguj('A');
    const k = await karta(o, 1);
    const n = await notatka(o, k.P);
    await o.gotowe();
    const B = await blizniak(o);
    tik(MIN);
    await B.v.removePatient(k.P);
    tik(MIN);
    await B.cisza();
    const pnotetomb = await koperta(B, await B.ev.buildPatientNoteTombstoneEvent(n, null));
    const s0 = ostatni(o);
    const l0 = stanLicznika(o.l);
    expect(await zastosuj(o, [pnotetomb]), 'pnotetomb u A').toEqual(['applied']);
    await o.gotowe();
    const nagrobki = ((await o.v.exportSyncPayload()).patientNoteTombstones || []).filter((x) => x.id === n);
    expect({ karta: (await wersje(o.v, k.P)).length, nagrobek: nagrobki.map((x) => !!x.deletedWithPatient) }, 'kontrola: karta zostaje, nagrobek notatki „czeka” (z kartą)').toEqual({ karta: 2, nagrobek: [true] });
    expect(odZnacznika(o.l, l0).ratunki, 'odczyty bramki w haku H2').toEqual([]);
    expect(wierszeOd(o, s0).map(opis), 'wiersze po zdarzeniu').toEqual([]);
  }, CZAS);
});

// ── HK12–HK13: przegląd kolejki ──────────────────────────────────────────────────────────────────────────────────────
describe('HK12–HK13: przegląd kolejki a haki', () => {
  it('HK12: przegląd po scaleniu z hakami H1 i H2 — nic nie dokłada', async () => {
    const o = await okno();
    await o.zaloguj('A');
    const s = await przegranyZRatunkiem(o);
    const s0 = ostatni(o);
    tik(MIN);
    await o.v.mergeSyncPayload(s.ladunek);
    tik();
    await o.gotowe();
    expect(wierszeOd(o, s0).map((w) => w.kind), 'kontrola: wiersze z haków').toEqual(['pfull', 'pnote']);
    const s1 = ostatni(o);
    tik(MIN);
    expect(await o.ev.sweepOutbox()).toEqual({ ok: true, kandydaci: 5, dopisane: 0 });
    await o.gotowe();
    expect(wierszeOd(o, s1).map(opis), 'po przeglądzie').toEqual([]);
  }, CZAS);

  it('HK12 (a): wiersz pfull pokrywa wersje karty i nośnik pól karty — wiersze snap karty usunięte, przegląd nic nie dokłada', async () => {
    const o = await okno();
    await o.zaloguj('A');
    const s = await kartaCzesciowa(o);
    expect(await zastosuj(o, [{ env: s.nag.env }]), 'ptomb B na A').toEqual(['applied']);
    await o.gotowe();
    const snapy = o.kolejka('A').filter((w) => w.kind === 'snap');
    expect(snapy.length, 'kontrola: wiersze snap karty').toBe(4);
    await naAtrapie(o.idb, nazwaBazy(o.uid), ['outbox'], 'readwrite', (tx) => { for (const w of snapy) tx.objectStore('outbox').delete(w.eid); });
    expect(o.kolejka('A').map((w) => w.kind).filter((x) => x !== 'cred'), 'kontrola: został wiersz pfull').toEqual(['pfull']);
    const s1 = ostatni(o);
    tik(MIN);
    expect(await o.ev.sweepOutbox()).toEqual({ ok: true, kandydaci: 5, dopisane: 0 });
    await o.gotowe();
    expect(wierszeOd(o, s1).map(opis), 'po przeglądzie').toEqual([]);
  }, CZAS);

  it('HK12 (b): wszystkie wiersze przyjęte (outboxAccept), przeładowanie strony i odblokowanie — przegląd przy odblokowaniu nic nie dokłada', async () => {
    const o = await okno();
    await o.zaloguj('A');
    const s = await przegranyZRatunkiem(o);
    const s0 = ostatni(o);
    tik(MIN);
    await o.v.mergeSyncPayload(s.ladunek);
    tik();
    await o.gotowe();
    expect(wierszeOd(o, s0).map((w) => w.kind), 'kontrola: wiersze z haków').toEqual(['pfull', 'pnote']);
    const pr = await o.ev.outboxAccept(o.kolejka('A').map((w) => w.eid));
    expect(pr, 'outboxAccept').toMatchObject({ ok: true });
    await o.gotowe();
    expect(o.kolejka('A'), 'kontrola: kolejka pusta').toEqual([]);
    tik(MIN);
    expect(await o.ev.sweepOutbox(), 'przegląd po przyjęciu wierszy').toEqual({ ok: true, kandydaci: 5, dopisane: 0 });
    await o.gotowe();
    expect(o.kolejka('A'), 'po przeglądzie').toEqual([]);
    tik(MIN);
    const o2 = await przeladuj(o);
    await o2.zaloguj('A');
    await o2.gotowe();
    expect(o2.l.przeglady, 'przegląd przy odblokowaniu').toEqual([{ sieroty: true }]);
    expect(o2.kolejka('A'), 'po przeładowaniu i odblokowaniu').toEqual([]);
  }, CZAS);

  it('HK12 (c): ratunek w sekundzie po usunięciu (chwila notatki późniejsza niż createdAtISO wiersza) — para ratunku: przegląd nic nie dokłada', async () => {
    const o = await okno();
    await o.zaloguj('A');
    const k = await karta(o, 1);
    const n = await notatka(o, k.P);
    await o.gotowe();
    const B = await blizniak(o);
    tik(MIN);
    await B.v.removePatient(k.P);
    await B.cisza();
    const ladunek = await B.v.exportSyncPayload();
    tik(1);
    await o.v.savePatient(naglowek(1, { masa: 24 }), { dedup: false, patientId: k.P });
    await o.gotowe();
    tik(1);
    const s0 = ostatni(o);
    await o.v.mergeSyncPayload(ladunek);
    await o.gotowe();
    const nota = await o.v.getPatientNote(n);
    const wiersz = wierszeOd(o, s0).filter((w) => w.kind === 'pnote');
    expect(wiersz.length, 'kontrola: wiersz pnote z haka').toBe(1);
    expect(nota.updatedAtISO > wiersz[0].createdAtISO, `kontrola: chwila notatki ${nota.updatedAtISO} późniejsza niż wiersz ${wiersz[0].createdAtISO}`).toBe(true);
    const s1 = ostatni(o);
    tik(MIN);
    expect(await o.ev.sweepOutbox()).toEqual({ ok: true, kandydaci: 5, dopisane: 0 });
    await o.gotowe();
    expect(wierszeOd(o, s1).map(opis), 'po przeglądzie').toEqual([]);
  }, CZAS);

  it('HK13: pamięć braków — dopisania haków bez wiersza (usterka zatwierdzenia w bazie kolejki; dwie karty i notatka), potem sweepOutbox(): pfull obu kart z setId haka i pnote; pary ładunku ich nie ukrywają', async () => {
    const o = await okno();
    await o.zaloguj('A');
    const k1 = await karta(o, 1);
    const k2 = await karta(o, 2);
    const n = await notatka(o, k1.P);
    await o.gotowe();
    const B = await blizniak(o);
    tik(MIN);
    await B.v.removePatient(k1.P);
    await B.v.removePatient(k2.P);
    tik(MIN);
    await B.cisza();
    const ladunek = await B.v.exportSyncPayload();
    await wizyta(o, k1.P, 24);
    await o.v.savePatient(naglowek(2, { masa: 31 }), { dedup: false, patientId: k2.P });
    tik(MIN);
    await o.gotowe();
    const s0 = ostatni(o);
    const u = o.idb.__atrapa.usterka({ przy: 'commit', baza: /^vilda_sync_/, blad: 'QuotaExceededError', raz: false });
    await o.v.mergeSyncPayload(ladunek);
    tik();
    await o.gotowe();
    u.odwolaj();
    expect({ usterka: u.uzyta > 0, wiersze: wierszeOd(o, s0).map(opis) }, 'kontrola: dopisania haków bez wiersza').toEqual({ usterka: true, wiersze: [] });
    tik(MIN);
    const sw = await o.ev.sweepOutbox();
    await o.gotowe();
    expect(sw, 'przegląd').toMatchObject({ ok: true, dopisane: 3 });
    const nowe = wierszeOd(o, s0).map(opis);
    const zestaw = (k) => ['pfull', k.P, `${k.P}:${nagrobekWLadunku(ladunek, k.P)}`, 'pending'];
    expect(nowe.filter((w) => w[0] === 'pfull').sort(), 'pfull obu kart z setId haka').toEqual([zestaw(k1), zestaw(k2)].sort());
    expect(nowe.slice(2), 'pnote po pełnych kartach').toEqual([['pnote', n, null, 'pending']]);
    expect(sw.kandydaci, 'kontrola: kandydaci przeglądu').toBe(10);
  }, CZAS);
});

// ── HK14–HK16 ────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('HK14–HK16: krok importu, tryby i sesja, hooki', () => {
  it('HK14: krok importu (mergeVaultBackup kopii bliźniaka z nagrobkiem karty przegrywającym z kartą lokalną i nagrobkiem notatki lokalnej) — bez pfull i bez odczytu bramki w haku H1; pnote ratunku w partii (jeden wiersz, notatka w pliku); onBulkChange count 1', async () => {
    const o = await okno();
    await o.zaloguj('A');
    const partie = [];
    o.ev.onBulkChange((d) => { partie.push(d); });
    const k = await karta(o, 1);
    const n = await notatka(o, k.P);
    await o.gotowe();
    const B = await blizniak(o);
    tik(MIN);
    await B.v.removePatient(k.P);
    tik(MIN);
    await B.cisza();
    const kopia = await B.v.exportVaultBackup();
    const przed = (await o.v.getPatientNote(n)).updatedAtISO;
    await wizyta(o, k.P, 24);
    tik(MIN);
    await o.gotowe();
    const s0 = ostatni(o);
    partie.length = 0;
    const l0 = stanLicznika(o.l);
    await o.v.mergeVaultBackup(kopia, o.A.haslo);
    tik();
    await o.gotowe();
    expect({ karta: (await wersje(o.v, k.P)).length, uratowana: (await o.v.getPatientNote(n)).updatedAtISO > przed }, 'kontrola: karta zostaje, notatka uratowana').toEqual({ karta: 3, uratowana: true });
    const l = odZnacznika(o.l, l0);
    expect({ przegrane: l.przegrane, ratunki: l.ratunki }, 'odczyty bramki w hakach (hak H1 w kroku importu — bez odczytu)').toEqual({ przegrane: [], ratunki: [{ id: n }] });
    expect(wierszeOd(o, s0).map(opis), 'wiersze partii').toEqual([['pnote', n, null, 'pending']]);
    expect(partie, 'onBulkChange').toEqual([{ reason: 'mergeVaultBackup', count: 1 }]);
  }, CZAS);

  it('HK14: notatka spoza pliku (nagrobek „czeka” z wcześniejszego zdarzenia pnotetomb, plik kopii z nową wizytą karty) — pnote ratunku w partii tylko z haka H2; onBulkChange count 2', async () => {
    const o = await okno();
    await o.zaloguj('A');
    const partie = [];
    o.ev.onBulkChange((d) => { partie.push(d); });
    const k = await karta(o, 1);
    await o.gotowe();
    const C = await blizniak(o);
    const n = await notatka(o, k.P);
    await o.gotowe();
    const B = await blizniak(o);
    tik(MIN);
    await B.v.removePatient(k.P);
    tik(MIN);
    await B.cisza();
    const pnotetomb = await koperta(B, await B.ev.buildPatientNoteTombstoneEvent(n, null));
    expect(await zastosuj(o, [pnotetomb]), 'pnotetomb u A („czeka”)').toEqual(['applied']);
    await o.gotowe();
    const S3 = await wizyta(C, k.P, 30);
    await C.cisza();
    const kopia = await C.v.exportVaultBackup();
    expect((kopia.patientNotes || []).length + (kopia.patientNoteTombstones || []).length, 'kontrola: plik bez notatek').toBe(0);
    const s0 = ostatni(o);
    partie.length = 0;
    const l0 = stanLicznika(o.l);
    await o.v.mergeVaultBackup(kopia, o.A.haslo);
    tik();
    await o.gotowe();
    expect(odZnacznika(o.l, l0).ratunki, 'odczyt bramki w haku H2').toEqual([{ id: n }]);
    expect(wierszeOd(o, s0).map(opis), 'wiersze partii: wizyta z pliku i notatka z haka H2').toEqual([['snap', `${k.P}/${S3}`, null, 'pending'], ['pnote', n, null, 'pending']]);
    expect(partie, 'onBulkChange').toEqual([{ reason: 'mergeVaultBackup', count: 2 }]);
  }, CZAS);

  it('HK15: tryby przy otwartej bramce („Komputer w pracy”, „Zaloguj jednorazowo”) — haki H1 i H2 kończą się na trybie: 0 wierszy, bez bazy kolejki, kluczy vilda-sync-* i blokad', async () => {
    for (const [nazwa, opcje] of [['Komputer w pracy', { chmura: ['A'] }], ['Zaloguj jednorazowo', { jednorazowo: true }]]) {
      const o = await okno({ ...opcje, odOtwartej: true, wymagaj: false });
      if (nazwa === 'Komputer w pracy') await o.zaloguj('A');
      const k = await karta(o, 1);
      const n = await notatka(o, k.P);
      await o.gotowe();
      // Bliźniak w tym samym trybie: „Komputer w pracy” — drugie okno tego samego konta z danymi z pełnego ładunku A;
      // „Zaloguj jednorazowo” — okno z kopią sessionStorage (adapter jednorazowy odtwarza z niej konto i dane).
      let B;
      if (nazwa === 'Komputer w pracy') {
        B = await drugieOkno(o, { bramka: false, zaloguj: 'A' });
        OKNA.push(B);
        await B.v.mergeSyncPayload(await o.v.exportSyncPayload());
      } else {
        for (let i = 0; i < 200 && o.timery.oczekujace().some((t) => t.ms === 0); i += 1) await new Promise((r) => { setTimeout(r, 1); });
        const m = {};
        for (const kl of o.win.sessionStorage.klucze()) m[kl] = o.win.sessionStorage.getItem(kl);
        B = await oknoMagazynu({ idb: o.idb, istniejace: { A: o.A, B: o.B }, jednorazowo: true, sesja: { ...magazynSesji(m), klucze: () => Object.keys(m) }, bramka: false, konta: 'A', zaloguj: 'A', skrypty: SKRYPTY_PUNKTU });
        OKNA.push(B);
      }
      expect((await wersje(B.v, k.P)).length, `${nazwa}: kontrola — bliźniak ma kartę`).toBe(2);
      tik(MIN);
      await B.v.removePatient(k.P);
      tik(MIN);
      await B.cisza();
      const ladunek = await B.v.exportSyncPayload();
      await wizyta(o, k.P, 24);
      tik(MIN);
      await o.gotowe();
      const l0 = stanLicznika(o.l);
      const r = await o.v.mergeSyncPayload(ladunek);
      tik();
      await o.gotowe();
      const l = odZnacznika(o.l, l0);
      expect([r.deletedPatientCount, r.updatedPatientNoteCount], `${nazwa}: kontrola — nagrobek karty przegrał, notatka uratowana`).toEqual([0, 1]);
      if (MA_HAKI) {
        expect({ przegrane: l.przegrane.length, ratunki: l.ratunki, emisje: l.emisje.map((e) => [e.kind, e.sesja]) }, `${nazwa}: haki dochodzą do emisji`).toEqual({
          przegrane: 1, ratunki: [{ id: n }], emisje: [['pfull', true], ['pnote', true]],
        });
      }
      expect(await bazyKolejki(o), `${nazwa}: bazy kolejki`).toEqual([]);
      expect(kluczeSync(o), `${nazwa}: klucze vilda-sync-*`).toEqual([]);
      expect(zadaniaKolejki(o), `${nazwa}: blokady vilda-sync*`).toEqual([]);
      expect(o.logKolejki(), `${nazwa}: wpisy vilda_sync_* w dzienniku atrapy`).toEqual([]);
    }
  }, CZAS);

  it('HK15: sesja — przełączenie na konto B w trakcie dopisania wiersza z haka H1 (atrapa wstrzymana przy otwarciu bazy kolejki A): bez wierszy u A i u B', async () => {
    const o = await okno({ konta: 'AB' });
    await o.zaloguj('B');
    await o.gotowe();
    await o.zaloguj('A');
    await o.gotowe();
    const s = await przegranyZRatunkiem(o);
    const wiersze = { A: klucze(o, 'A'), B: klucze(o, 'B') };
    const h = wstrzymaj(o, { przy: 'open', baza: nazwaBazy(o.uid) });
    const l0 = stanLicznika(o.l);
    tik(MIN);
    const p = o.v.mergeSyncPayload(s.ladunek).then(() => 'ok', (e) => (e && e.code) || 'blad');
    // Dopisanie wiersza z haka stoi na otwarciu bazy kolejki A (sejf bez haków do niego nie dochodzi — scalenie kończy się
    // bez otwarcia, a przełączenie idzie po scaleniu).
    const doszlo = await Promise.race([h.czeka.then(() => true), p.then(async () => { for (let i = 0; i < 2000; i += 1) await makrozadanie(); return false; })]);
    if (MA_HAKI) {
      expect(doszlo, 'kontrola: dopisanie wiersza z haka czeka na otwarciu bazy kolejki').toBe(true);
      expect(odZnacznika(o.l, l0).emisje.map((e) => e.kind), 'kontrola: hak H1 wyemitował pełną kartę').toEqual(['pfull']);
    }
    const przelaczenie = o.przelaczWTle('B');
    await przelaczenie.sesja;
    h.zwolnij();
    await p;
    await przelaczenie.koniec;
    await o.gotowe();
    expect({ A: klucze(o, 'A'), B: klucze(o, 'B') }, 'wiersze A i B').toEqual(wiersze);
  }, CZAS);

  it('HK16: bez nowego publicznego hooka — hooki VildaVault (on…) jak na bazie, bez onPatientTombstoneRejected; _eventLog — 39 kluczy (E2-PR4c: markSyncCaughtUp)', async () => {
    const o = await okno({ bramka: false });
    const v = o.win.VildaVault;
    expect(Object.keys(v).filter((k) => /^on[A-Z]/.test(k)).sort(), 'hooki VildaVault').toEqual([
      'onAccountRemovedElsewhere', 'onCarePlanTemplateChanged', 'onCredentialChanged', 'onLock', 'onNoteChanged', 'onPasskeyChanged',
      'onPatientDeleted', 'onPatientListChanged', 'onPatientNoteChanged', 'onPatientSaved', 'onPreferenceChanged', 'onRemoveUserWaiting', 'onUnlock',
    ]);
    expect('onPatientTombstoneRejected' in v, 'onPatientTombstoneRejected').toBe(false);
    expect(Object.keys(v._eventLog), '_eventLog: 39 kluczy').toHaveLength(39);
    expect(Object.keys(v._eventLog)).toContain('markSyncCaughtUp');
  }, CZAS);

  it('HK16: scalenie z przegranym nagrobkiem i ratunkiem przy otwartej bramce — ładunki 8 hooków jak na sejfie bez wstawek; onPatientNoteChanged ratunku { id, patientId, action: \'merge\' }', async () => {
    const w = {};
    for (const wariant of ['sejf', 'bez wstawek']) {
      naStart();
      const o = await okno({ zrodlo: wariant === 'sejf' ? null : bezWstawek(), wymagaj: wariant === 'sejf' });
      await o.zaloguj('A');
      const s = await przegranyZRatunkiem(o);
      const maska = maskarka();
      maska({ P: s.P, n: s.n });
      const hooki = [];
      const surowe = [];
      for (const hk of HOOKI) o.v[hk]((d) => { hooki.push([hk, maska(d)]); surowe.push([hk, d]); });
      const s0 = ostatni(o);
      tik(MIN);
      await o.v.mergeSyncPayload(s.ladunek);
      tik();
      await o.gotowe();
      w[wariant] = { s, hooki, surowe, wiersze: wierszeOd(o, s0).map((x) => x.kind) };
    }
    const [a, b] = [w.sejf, w['bez wstawek']];
    if (MA_HAKI) expect({ sejf: a.wiersze, bez: b.wiersze }, 'kontrola: wiersze z haków tylko na sejfie').toEqual({ sejf: ['pfull', 'pnote'], bez: [] });
    expect(a.hooki, 'ładunki hooków w scaleniu').toEqual(b.hooki);
    expect(a.surowe.filter(([hk, d]) => hk === 'onPatientNoteChanged' && d && d.id === a.s.n).map(([, d]) => d), 'onPatientNoteChanged ratunku').toEqual([{ id: a.s.n, patientId: a.s.P, action: 'merge' }]);
  }, CZAS);
});
