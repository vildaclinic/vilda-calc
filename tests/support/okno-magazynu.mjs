// Uprząż okna magazynu kolejki: konta A i B, sprawdzenia sesji (P-SESJA-ZAPISU)
//
// Okno przeglądarki z prawdziwym sejfem (okno() z tests/unit/sesja-zapisu-uprzaz.mjs: vilda_crypto.js,
// vilda_retention.js, vilda_vault.js) na adapterze IndexedDB sejfu nad atrapą tests/support/atrapa-indexeddb.mjs — bez
// setStorageAdapter, więc konto działa w trybie „Komputer prywatny”. IDBKeyRange atrapy przez vi.stubGlobal (adapter
// sejfu woła goły IDBKeyRange). Bramka dziennika zdarzeń to pole okna VILDA_EVENT_LOG; uprząż ustawia je tylko na
// żądanie testu. Uprząż niczego nie sprawdza sama — asercje zostają w plikach testów. Dane wyłącznie fikcyjne.
//
// EKSPORTY
//   ZNACZNIK_MAGAZYNU, PRZEDROSTEK_URZADZENIA, kluczUrzadzenia(uid), nazwaBazy(uid), UUID_V4, DEV, LIMIT_BAJTOW, utf8(s)
//       Znacznik części magazynu w bloku P-DZIENNIK-ZDARZEN, klucz identyfikatora urządzenia w localStorage (osobny dla
//       każdego konta: przedrostek + ':' + userId), nazwa bazy kolejki konta, wzorzec UUID v4 małymi literami, wzorzec
//       identyfikatora urządzenia (8 znaków bez l, o, 0, 1), limit rozmiaru zdarzenia i długość napisu w bajtach UTF-8.
//   przechwycZadaniaWTle() — szpieg globalnego setTimeout: zadanie w tle sejfu po zalogowaniu (goły setTimeout 3 s
//       z CareMvpBackgroundFormatError) nie startuje samo, tylko czeka na jawne o.tlo(); reszta przechodzi bez zmian.
//       Wywoływane w beforeEach (vi.restoreAllMocks() w afterEach je zdejmuje).
//   PRZEDROSTEK_KASOWANIA, kluczKasowania(uid), nazwaBlokady(uid), SKRYPTY_PUNKTU
//       Znacznik ponowienia kasowania kolejki konta w localStorage (przedrostek + ':' + userId), nazwa blokady Web Locks
//       bazy kolejki konta i lista skryptów okna z modułami punktu odzyskiwania (jak w zapisie bazowym; bez nich
//       removeUser rzuca „Moduły punktu odzyskiwania są niedostępne.”).
//   oknoMagazynu(opcje) → Promise<o>
//       opcje: idb (atrapa; domyślnie nowa), bramka (true — VILDA_EVENT_LOG = true po załadowaniu), konta ('A' | 'AB';
//       domyślnie 'AB'), chmura (lista kont z trybem 'cloud-only', np. ['A']), jednorazowo (setEphemeralMode(true)
//       przed utworzeniem kont), wPamieci (sejf na createInMemoryAdapter()), sesja (sessionStorage innego okna —
//       odtworzenie sesji po przeładowaniu), istniejace ({ A, B } innego okna: bez tworzenia kont), zaloguj ('A' | 'B' |
//       null — konto zalogowane na końcu; domyślnie 'A'), skrypty (lista plików okna; domyślnie crypto, retention,
//       vault — SKRYPTY_PUNKTU dokłada moduły punktu odzyskiwania), locks (false — okno bez navigator.locks; obiekt
//       atrapaLocks — wspólna atrapa Web Locks; domyślnie nowa atrapa okna), localStorage (stan o.lokalny innego okna —
//       wspólny localStorage; domyślnie nowy; 'osobny' — osobny widok localStorage na okno, rozsyłanie zapisów
//       i zdarzenia storage między oknami: niżej), databases (false — window.indexedDB okna bez databases(), ta sama
//       atrapa), zdarzenia (true — prawdziwy cel zdarzeń okna: niżej; domyślnie addEventListener i dispatchEvent okna
//       nic nie robią), pola (obiekt — pola okna ustawione przed załadowaniem skryptów, ostatnie: nadpisują pola
//       uprzęży o tej samej nazwie; drugieOkno ich nie dziedziczy).
//   drugieOkno(o, opcje) → Promise<o2> — nowe okno na tej samej atrapie z kontami o.A / o.B (bez tworzenia kont); dzieli
//       z o atrapę IndexedDB, atrapę Web Locks (o.locks; okno bez navigator.locks daje drugie też bez), localStorage
//       (o.lokalny), listę skryptów (o.skrypty) i rodzinę okien (szyna BroadcastChannel, rozsyłanie zapisów localStorage),
//       jeśli opcje nie mówią inaczej. sessionStorage, zegary, crypto i dziennik — własne każdego okna.
//       drugieOkno(o, { localStorage: 'osobny' }) dołącza do rodziny o (o też z localStorage: 'osobny').
//
// OPCJA localStorage: 'osobny' (włącza też zdarzenia: true)
//   Każde okno ma własny widok localStorage: kopię widoku okna, z którego powstało (pierwsze okno — pusty), z chwili
//   utworzenia. Zapisy okna (setItem, removeItem, clear) trafiają do jego widoku, do jego dziennika i do kolejki
//   rozsyłania; o.propaguj() → Promise przenosi zapisy tego okna z kolejki do widoków pozostałych okien rodziny, które
//   były w niej w chwili zapisu (w kolejności zapisu, bez wpisów w ich dziennikach), i wysyła w nich zdarzenie storage
//   (key, oldValue, newValue — wartości z chwili zapisu; po clear() key null); obietnica rozstrzyga się po wysłaniu.
//
// OPCJA zdarzenia: true
//   addEventListener, removeEventListener i dispatchEvent okna na prawdziwym EventTarget; BroadcastChannel okna na
//   szynie rodziny (postMessage dochodzi jako zdarzenie message — onmessage i słuchacze — do pozostałych kanałów
//   o tej samej nazwie w oknach rodziny, także kanałów utworzonych przez test przez new o.win.BroadcastChannel(nazwa),
//   po jednym makrozadaniu, z kopią danych); location.reload() i location.replace(adres) okna tylko liczone
//   (o.przeladowania() → liczba reload, o.zamiany → adresy replace).
//
// OKNO o
//   o.win, o.v (VildaVault), o.ev (VildaVault._eventLog), o.idb, o.A / o.B ({ userId, haslo }), o.timery, o.dziennik
//   (zapisy localStorage/sessionStorage tego okna, także we wspólnym localStorage), o.locks (atrapa Web Locks albo null),
//   o.lokalny (stan localStorage do dzielenia), o.skrypty, o.krypto (atrapaKrypto z uprzęży: log, po, przed, wstrzymaj, blad),
//   o.kryptoWToku() — liczba operacji crypto.subtle w toku, o.kto(uid) → 'A' | 'B' | uid, o.sesja() → 'A' | 'B' | null.
//   o.propaguj() → Promise (tylko localStorage: 'osobny'), o.przeladowania() → liczba, o.zamiany (tylko zdarzenia: true).
//   o.zablokuj(powod), o.zaloguj(kto) → Promise (blokada, zalogowanie, zadanie w tle i cisza),
//   o.przelacz(wariant) → Promise<znacznik> — 'B' (inne konto), 'A' (ponowne zalogowanie A), 'blokada'.
//   o.przelaczWTle(wariant) → { sesja, koniec } — blokada od razu, zalogowanie bez czekania: `sesja` rozstrzyga się,
//       gdy nowa sesja jest już ustalona i okno ucichło (także gdy logowanie stoi dalej na wstrzymanym punkcie atrapy),
//       `koniec` — po zakończeniu logowania (dla wariantu 'blokada' obie od razu).
//   o.tlo() → Promise — odpala przechwycone zadania w tle i czeka na ciszę.
//   o.cisza() → Promise — brak transakcji atrapy i operacji crypto.subtle w toku oraz 20 makrozadań bez zmiany śladów.
//   o.spokoj() → Promise — 30 makrozadań bez zmiany śladów i bez crypto.subtle w toku (transakcje atrapy mogą stać
//       na wstrzymaniu).
//   o.kolejka(kto = 'A') → wiersze sklepu outbox bazy kolejki konta po seqLocal (migawka atrapy; [] bez bazy),
//   o.kwarantanna(kto = 'A') → wiersze sklepu quarantine w porządku klucza [slotId, seq] (migawka atrapy; [] bez bazy),
//   o.meta(kto = 'A') → wiersze sklepu meta, o.jestBaza(kto = 'A') → boolean.
//   o.znacznik() → { log, krypto, dziennik } (długości śladów); o.logKolejki(z) → wpisy logu atrapy dla baz kolejki
//       (vilda_sync_*) po znaczniku.
//
// BEZPOŚREDNI DOSTĘP DO ATRAPY (poza sejfem, przez jej API IndexedDB)
//   naAtrapie(idb, baza, sklepy, tryb, praca) → Promise — jedna transakcja na świeżym połączeniu (otwarcie bez wersji),
//       praca(tx) wysyła żądania synchronicznie; połączenie zamykane po zakończeniu.
//   czytajRekord(idb, baza, sklep, klucz), zmienRekord(idb, baza, sklep, klucz, fn), usunRekord(idb, baza, sklep, klucz)
//   bazaKolejki(idb, uid, { wiersze, licznik, wersja, schemat, kwarantanna }) — baza kolejki (domyślnie schemat wersji 1
//       z projektu) utworzona przez __atrapa.utworz, z gotowymi wierszami outbox, quarantine i rekordem licznika.
//   SCHEMAT_V1, wierszKolejki(i, pola) — schemat bazy kolejki wersji 1 i fikcyjny wiersz outbox (env z fikcyjnym iv/data).
import { vi } from 'vitest';
import { AtrapaIDBKeyRange, utworzIndexedDB } from './atrapa-indexeddb.mjs';
import { atrapaKrypto, HASLO_A, HASLO_B, SKRYPTY_SEJFU, okno } from '../unit/sesja-zapisu-uprzaz.mjs';

export const ZNACZNIK_MAGAZYNU = '/* P-DZIENNIK-ZDARZEN: magazyn kolejki */';
export const PRZEDROSTEK_URZADZENIA = 'vilda-sync-device-v1';
export const kluczUrzadzenia = (uid) => `${PRZEDROSTEK_URZADZENIA}:${uid}`;
export const PRZEDROSTEK_KASOWANIA = 'vilda-sync-delete-v1';
export const kluczKasowania = (uid) => `${PRZEDROSTEK_KASOWANIA}:${uid}`;
export const nazwaBlokady = (uid) => `vilda-sync-db:${uid}`;
export const SKRYPTY_PUNKTU = Object.freeze(['vilda_crypto.js', 'vilda_retention.js', 'vilda_care_plan_model.js', 'vilda_clinical_crypto.js',
  'vilda_patient_checkpoint_store.js', 'vilda_patient_checkpoint.js', 'vilda_vault.js']);
export const nazwaBazy = (uid) => `vilda_sync_${uid}`;
export const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const DEV = /^[a-km-np-z2-9]{8}$/;
export const LIMIT_BAJTOW = 262144;
const KODER = new TextEncoder();
export const utf8 = (s) => KODER.encode(s).length;

const ZADANIE_W_TLE = 'CareMvpBackgroundFormatError';
const oryginalnySetTimeout = globalThis.setTimeout;
const makrozadanie = () => new Promise((r) => { setImmediate(r); });
let przechwycone = null;

export function przechwycZadaniaWTle() {
  przechwycone = [];
  const lista = przechwycone;
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(function (fn, ms, ...a) {
    if (typeof fn === 'function' && String(fn).includes(ZADANIE_W_TLE)) { lista.push(fn); return 0; }
    return oryginalnySetTimeout(fn, ms, ...a);
  });
  return lista;
}

// ── Bezpośredni dostęp do atrapy ─────────────────────────────────────────────────────────────────────────────────────
export function naAtrapie(idb, baza, sklepy, tryb, praca) {
  return new Promise((ok, zle) => {
    const r = idb.open(baza);
    r.onupgradeneeded = () => { r.transaction.abort(); };
    r.onerror = (e) => { e.preventDefault(); zle(new Error(`atrapa: brak bazy ${baza}`)); };
    r.onsuccess = () => {
      const db = r.result;
      let wynik;
      let tx;
      try { tx = db.transaction(sklepy, tryb); wynik = praca(tx); } catch (x) { db.close(); zle(x); return; }
      tx.oncomplete = () => { db.close(); ok(typeof wynik === 'function' ? wynik() : wynik); };
      tx.onabort = () => { db.close(); zle(tx.error || new Error('atrapa: transakcja przerwana')); };
    };
  });
}
export function czytajRekord(idb, baza, sklep, klucz) {
  let z;
  return naAtrapie(idb, baza, [sklep], 'readonly', (tx) => { z = tx.objectStore(sklep).get(klucz); return () => z.result; });
}
export function zmienRekord(idb, baza, sklep, klucz, fn) {
  return naAtrapie(idb, baza, [sklep], 'readwrite', (tx) => {
    const s = tx.objectStore(sklep);
    const r = s.get(klucz);
    r.onsuccess = () => { s.put(fn(r.result)); };
  });
}
export function usunRekord(idb, baza, sklep, klucz) {
  return naAtrapie(idb, baza, [sklep], 'readwrite', (tx) => { tx.objectStore(sklep).delete(klucz); });
}

export const SCHEMAT_V1 = Object.freeze({
  meta: { keyPath: 'k', indeksy: {} },
  outbox: {
    keyPath: 'eid',
    indeksy: {
      byState: { keyPath: 'state', unique: false },
      byEntity: { keyPath: ['kind', 'entityKey'], unique: false },
      bySeqLocal: { keyPath: 'seqLocal', unique: true },
    },
  },
  quarantine: { keyPath: ['slotId', 'seq'], indeksy: { bySlot: { keyPath: 'slotId', unique: false } } },
});
// Fikcyjny wiersz outbox o kształcie z projektu (env z fikcyjnymi iv/data — nie da się go odszyfrować).
export function wierszKolejki(i, pola = {}) {
  const hex = (n) => n.toString(16).padStart(12, '0');
  const env = pola.env !== undefined ? pola.env : { iv: `fikcyjneIV${String(i).padStart(6, '0')}`, data: `Fikcyjny-szyfrogram-${i}-`.repeat(pola.powtorz || 1) };
  return {
    eid: `00000000-0000-4000-8000-${hex(i)}`,
    createdAtISO: '2026-03-02T08:00:00.000Z',
    seqLocal: i,
    kind: 'pnote',
    entityKey: `fikcyjna-notatka-${i}`,
    setId: null,
    env,
    bytes: env ? utf8(JSON.stringify(env)) : 0,
    state: 'pending',
    attempts: 0,
    lastError: null,
    lastAttemptAtISO: null,
    inflightAtISO: null,
    ...pola,
  };
}
export function bazaKolejki(idb, uid, { wiersze = [], licznik, wersja = 1, schemat = SCHEMAT_V1, meta, kwarantanna = [] } = {}) {
  const max = wiersze.reduce((m, w) => Math.max(m, w.seqLocal || 0), 0);
  const zMeta = schemat.meta ? (meta || [{ k: 'licznik', v: licznik === undefined ? max : licznik, baza: '11111111-1111-4111-8111-111111111111' }]) : undefined;
  const dane = {};
  if (schemat.outbox) dane.outbox = wiersze;
  if (schemat.quarantine) dane.quarantine = kwarantanna;
  if (zMeta) dane.meta = zMeta;
  idb.__atrapa.utworz(nazwaBazy(uid), wersja, schemat, dane);
}

// ── localStorage do dzielenia między oknami ──────────────────────────────────────────────────────────────────────────
// Stan (wspólny dla okien) i fasada okna o zachowaniu localStorage z okno() uprzęży sesji: zapisy trafiają do dziennika
// okna, które je wykonało (cel.dziennik ustawiany po załadowaniu skryptów — zapisy przy ładowaniu nie są liczone, jak
// w okno()).
const magazynLokalny = () => ({ m: Object.create(null) });
function fasadaLokalna(stan, ctx) {
  const { m } = stan;
  const cel = { dziennik: null };
  const zapisz = (op, klucz) => {
    if (cel.dziennik) cel.dziennik.push({ nr: cel.dziennik.length, magazyn: 'localStorage', op, klucz, sesja: ctx.kto(), nrSesji: ctx.nrSesji() });
  };
  const obiekt = {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); zapisz('set', String(k)); },
    removeItem: (k) => { delete m[k]; zapisz('remove', String(k)); },
    clear: () => { for (const k of Object.keys(m)) delete m[k]; zapisz('clear', null); },
    key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
    klucze: () => Object.keys(m),
  };
  return { obiekt, cel };
}
// Rodzina okien: szyna BroadcastChannel i okna z osobnym widokiem localStorage (cele rozsyłania zapisów).
const nowaRodzina = () => ({ kanaly: new Set(), widoki: new Set() });
// Klasa BroadcastChannel okna na szynie rodziny: wiadomość dochodzi do pozostałych otwartych kanałów o tej samej nazwie
// po jednym makrozadaniu (onmessage, potem słuchacze), z kopią danych.
function klasaKanalu(rodzina) {
  return class BroadcastChannel extends EventTarget {
    constructor(nazwa) {
      super();
      this.name = String(nazwa);
      this.onmessage = null;
      this.zamkniety = false;
      rodzina.kanaly.add(this);
    }
    postMessage(dane) {
      if (this.zamkniety) throw new DOMException('Kanał jest zamknięty.', 'InvalidStateError');
      const kopia = structuredClone(dane);
      for (const k of rodzina.kanaly) {
        if (k === this || k.name !== this.name) continue;
        setImmediate(() => {
          if (k.zamkniety) return;
          const e = new MessageEvent('message', { data: kopia });
          if (typeof k.onmessage === 'function') k.onmessage(e);
          k.dispatchEvent(e);
        });
      }
    }
    close() { this.zamkniety = true; rodzina.kanaly.delete(this); }
  };
}
// Osobny widok localStorage okna w rodzinie: zapisy do widoku i do kolejki rozsyłania (cele — pozostałe okna rodziny
// z chwili zapisu); propaguj() przenosi je do widoków celów i wysyła w nich zdarzenie storage.
function widokOsobny(rodzina, stan, ctx, wyslij) {
  const czlonek = { stan, wyslij };
  const kolejka = [];
  const fasada = fasadaLokalna(stan, ctx);
  const { obiekt } = fasada;
  const zapisz = (klucz, stara, nowa) => { kolejka.push({ klucz, stara, nowa, cele: [...rodzina.widoki].filter((c) => c !== czlonek) }); };
  const setItem = obiekt.setItem;
  const removeItem = obiekt.removeItem;
  const clear = obiekt.clear;
  obiekt.setItem = (k, v) => { const stara = obiekt.getItem(k); setItem(k, v); zapisz(String(k), stara, String(v)); };
  obiekt.removeItem = (k) => { const stara = obiekt.getItem(k); removeItem(k); zapisz(String(k), stara, null); };
  obiekt.clear = () => { clear(); zapisz(null, null, null); };
  rodzina.widoki.add(czlonek);
  async function propaguj() {
    const wpisy = kolejka.splice(0);
    const zdarzenia = [];
    for (const w of wpisy) {
      for (const c of w.cele) {
        if (w.klucz === null) for (const k of Object.keys(c.stan.m)) delete c.stan.m[k];
        else if (w.nowa === null) delete c.stan.m[w.klucz];
        else c.stan.m[w.klucz] = w.nowa;
        zdarzenia.push([c, w]);
      }
    }
    await new Promise((r) => { setImmediate(r); });
    for (const [c, w] of zdarzenia) c.wyslij({ key: w.klucz, oldValue: w.stara, newValue: w.nowa });
  }
  return { fasada, propaguj };
}
// window.indexedDB okna bez databases() (przeglądarka bez listy baz); ta sama atrapa, sterowanie przez o.idb.
function bezListyBaz(idb) {
  return new Proxy(idb, {
    get: (cel, k) => (k === 'databases' ? undefined : Reflect.get(cel, k)),
    has: (cel, k) => k !== 'databases' && Reflect.has(cel, k),
  });
}

// ── Okno ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
export async function oknoMagazynu(opcje = {}) {
  const idb = opcje.idb || utworzIndexedDB();
  vi.stubGlobal('IDBKeyRange', AtrapaIDBKeyRange);
  const stan = { nrSesji: 0 };
  const A = opcje.istniejace ? opcje.istniejace.A : { userId: null, haslo: HASLO_A };
  const B = opcje.istniejace ? opcje.istniejace.B : { userId: null, haslo: HASLO_B };
  const kto = (u) => (u == null ? null : u === A.userId ? 'A' : u === B.userId ? 'B' : u);
  let v = null;
  const sesja = () => { const u = v && v.getCurrentUser(); return u ? kto(u.userId) : null; };
  const ctx = { kto: sesja, nrSesji: () => stan.nrSesji, wPrzelaczeniu: () => false, kontoId: (k) => (k === 'A' ? A.userId : k === 'B' ? B.userId : k) };
  // crypto.subtle okna: atrapa z uprzęży (log, haki) i licznik operacji w toku (do ciszy).
  const krypto = atrapaKrypto(ctx);
  let kryptoWToku = 0;
  const subtle = new Proxy(krypto.crypto.subtle, {
    get(cel, k) {
      const f = cel[k];
      if (typeof f !== 'function') return f;
      return (...a) => {
        kryptoWToku += 1;
        let p;
        try { p = Promise.resolve(f.apply(cel, a)); } catch (e) { kryptoWToku -= 1; throw e; }
        return p.finally(() => { kryptoWToku -= 1; });
      };
    },
  });
  const rodzina = opcje.rodzina || nowaRodzina();
  const osobny = opcje.localStorage === 'osobny';
  const zdarzenia = osobny || opcje.zdarzenia === true;
  const cel = zdarzenia ? new EventTarget() : null;
  let lokalny;
  let fasada;
  let propaguj = null;
  if (osobny) {
    const zrodlo = opcje.widokZrodla;
    if (opcje.rodzina && !(zrodlo && [...rodzina.widoki].some((c) => c.stan === zrodlo))) {
      throw new Error("localStorage: 'osobny' — okno, z którego powstaje drugie, ma wspólny localStorage (utwórz je z localStorage: 'osobny')");
    }
    lokalny = { m: Object.assign(Object.create(null), zrodlo ? zrodlo.m : {}) };
    const wyslij = (pola) => {
      const e = new Event('storage');
      for (const [k, w] of Object.entries(pola)) Object.defineProperty(e, k, { value: w, enumerable: true });
      cel.dispatchEvent(e);
    };
    const w = widokOsobny(rodzina, lokalny, ctx, wyslij);
    fasada = w.fasada;
    propaguj = w.propaguj;
  } else {
    lokalny = opcje.localStorage || magazynLokalny();
    fasada = fasadaLokalna(lokalny, ctx);
  }
  const dodatki = { indexedDB: opcje.databases === false ? bezListyBaz(idb) : idb, localStorage: fasada.obiekt };
  if (opcje.sesja) dodatki.sessionStorage = opcje.sesja;
  let przeladowania = 0;
  const zamiany = [];
  if (zdarzenia) {
    dodatki.addEventListener = cel.addEventListener.bind(cel);
    dodatki.removeEventListener = cel.removeEventListener.bind(cel);
    dodatki.dispatchEvent = cel.dispatchEvent.bind(cel);
    dodatki.BroadcastChannel = klasaKanalu(rodzina);
    dodatki.location = {
      hostname: 'localhost', origin: 'http://localhost', pathname: '/index.html', href: 'http://localhost/index.html',
      reload: () => { przeladowania += 1; },
      replace: (adres) => { zamiany.push(String(adres)); },
    };
  }
  if (opcje.pola) Object.assign(dodatki, opcje.pola);
  const skrypty = opcje.skrypty || SKRYPTY_SEJFU;
  const o0 = okno({ ctx, krypto: { ...krypto, crypto: { ...krypto.crypto, subtle } }, dodatki, skrypty, locks: opcje.locks });
  fasada.cel.dziennik = o0.dziennik;
  const win = o0.win;
  v = win.VildaVault;
  if (opcje.bramka !== false) win.VILDA_EVENT_LOG = true;

  const sygnatura = () => [idb.__atrapa.log.length, krypto.log.length, o0.dziennik.length, idb.__atrapa.wToku(), kryptoWToku].join();
  async function spokoj(n = 30) {
    const koniec = performance.now() + 30_000;
    let poprzedni = null;
    let stabilne = 0;
    while (performance.now() < koniec) {
      await makrozadanie();
      const s = sygnatura();
      if (s === poprzedni && !kryptoWToku) { stabilne += 1; if (stabilne >= n) return; } else stabilne = 0;
      poprzedni = s;
    }
    throw new Error('okno magazynu nie ucichło (30 s)');
  }
  async function cisza() {
    const koniec = performance.now() + 30_000;
    while (performance.now() < koniec) {
      await spokoj(20);
      if (!idb.__atrapa.wToku() && !kryptoWToku) return;
    }
    throw new Error('okno magazynu: transakcje atrapy albo crypto.subtle w toku (30 s)');
  }
  async function tlo() {
    const lista = przechwycone || [];
    for (let fn = lista.shift(); fn; fn = lista.shift()) fn();
    await cisza();
  }
  const zablokuj = (powod = 'manual') => { v.lock(powod); stan.nrSesji += 1; };
  async function zaloguj(k) {
    if (v.isUnlocked()) zablokuj();
    const konto = k === 'A' ? A : B;
    await v.unlockUser(konto.userId, konto.haslo);
    stan.nrSesji += 1;
    await tlo();
  }
  const znacznik = () => ({ log: idb.__atrapa.log.length, krypto: krypto.log.length, dziennik: o0.dziennik.length, nrSesji: stan.nrSesji });
  async function przelacz(wariant) {
    if (!['A', 'B', 'blokada'].includes(wariant)) throw new Error(`nieznany wariant przełączenia: ${wariant}`);
    zablokuj(wariant === 'blokada' ? 'idle' : 'manual');
    if (wariant !== 'blokada') await zaloguj(wariant);
    else await cisza();
    return znacznik();
  }
  function przelaczWTle(wariant) {
    if (!['A', 'B', 'blokada'].includes(wariant)) throw new Error(`nieznany wariant przełączenia: ${wariant}`);
    zablokuj(wariant === 'blokada' ? 'idle' : 'manual');
    if (wariant === 'blokada') return { sesja: Promise.resolve(znacznik()), koniec: Promise.resolve(znacznik()) };
    const konto = wariant === 'A' ? A : B;
    const koniec = v.unlockUser(konto.userId, konto.haslo).then(() => { stan.nrSesji += 1; return znacznik(); });
    koniec.catch(() => {});
    const sesjaGotowa = (async () => {
      for (let i = 0; i < 100_000 && !(v.isUnlocked() && v.getCurrentUser().userId === konto.userId); i += 1) await makrozadanie();
      if (!v.isUnlocked()) throw new Error('przełączenie: sesja nie powstała');
      await spokoj();
      return znacznik();
    })();
    return { sesja: sesjaGotowa, koniec };
  }

  if (opcje.jednorazowo) v.setEphemeralMode(true);
  if (opcje.wPamieci) v.setStorageAdapter(v.createInMemoryAdapter());
  const chmura = new Set(opcje.chmura || []);
  const tryb = (k) => (chmura.has(k) ? { storageMode: 'cloud-only' } : {});
  const konta = opcje.konta || 'AB';
  if (!opcje.istniejace) {
    if (konta.includes('B')) {
      B.userId = (await v.createUser(HASLO_B, { label: 'Fikcyjny Lekarz B', iterations: 1000, ...tryb('B') })).userId;
      stan.nrSesji += 1;
      await tlo();
      zablokuj();
    }
    A.userId = (await v.createUser(HASLO_A, { label: 'Fikcyjna Lekarka A', iterations: 1000, ...tryb('A') })).userId;
    stan.nrSesji += 1;
    await tlo();
  }
  const naKoniec = opcje.zaloguj === undefined ? 'A' : opcje.zaloguj;
  if (opcje.istniejace && naKoniec) await zaloguj(naKoniec);
  else if (!opcje.istniejace && naKoniec === 'B') await zaloguj('B');
  else if (!opcje.istniejace && naKoniec === null) zablokuj();
  o0.dziennik.length = 0;

  const uidKto = (k) => (k === 'A' ? A.userId : k === 'B' ? B.userId : k);
  const migawka = (k, sklep) => {
    const b = idb.__atrapa.bazy()[nazwaBazy(uidKto(k))];
    return b && b.sklepy[sklep] ? b.sklepy[sklep].wiersze : null;
  };
  const o = {
    win, v, ev: v._eventLog, idb, A, B, timery: o0.timery, dziennik: o0.dziennik, krypto, locks: o0.locks, lokalny, skrypty, rodzina,
    przeladowania: () => przeladowania, zamiany,
    propaguj: () => {
      if (!propaguj) throw new Error("propaguj(): okno bez localStorage: 'osobny'");
      return propaguj();
    },
    kryptoWToku: () => kryptoWToku, kto, sesja, zablokuj, zaloguj, przelacz, przelaczWTle, tlo, cisza, spokoj, znacznik,
    kolejka: (k = 'A') => (migawka(k, 'outbox') || []).slice().sort((x, y) => x.seqLocal - y.seqLocal),
    kwarantanna: (k = 'A') => (migawka(k, 'quarantine') || []).slice(),
    meta: (k = 'A') => migawka(k, 'meta') || [],
    jestBaza: (k = 'A') => !!idb.__atrapa.bazy()[nazwaBazy(uidKto(k))],
    logKolejki: (z = { log: 0 }) => idb.__atrapa.log.slice(z.log).filter((w) => typeof w[1] === 'string' && w[1].startsWith('vilda_sync_')),
  };
  return o;
}

export function drugieOkno(o, opcje = {}) {
  return oknoMagazynu({
    skrypty: o.skrypty, locks: o.locks || false, localStorage: o.lokalny, ...opcje, idb: o.idb, istniejace: { A: o.A, B: o.B },
    rodzina: o.rodzina, widokZrodla: o.lokalny,
  });
}
