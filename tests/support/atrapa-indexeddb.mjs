// Atrapa IndexedDB dla testów jednostkowych (vitest, środowisko node — w Node nie ma IndexedDB, a w node_modules nie ma
// gotowej atrapy). Wzorcem jest zmierzone zachowanie Chromium 141: scenariusze p1–p34 z
// tests/support/atrapa-indexeddb-scenariusze.mjs dają na tej atrapie dokładnie literał SLAD_CHROMIUM nagrany w
// prawdziwym Chromium (samotest tests/unit/atrapa-indexeddb.test.mjs, A1; e2e tests/e2e/atrapa-indexeddb-zgodnosc.spec.mjs).
//
// EKSPORTY
//   utworzIndexedDB({ log } = {}) → obiekt o kształcie window.indexedDB: open(name, version?), deleteDatabase(name),
//       databases(), cmp(a, b) oraz pole sterowania __atrapa (niżej). Jedna instancja = jedno „pochodzenie” strony:
//       dwa okna testu na tej samej instancji widzą te same bazy i dostają versionchange od siebie nawzajem.
//   AtrapaIDBKeyRange — only, bound, lowerBound, upperBound, includes; dla kodu, który woła goły IDBKeyRange (sejf),
//       przez vi.stubGlobal('IDBKeyRange', AtrapaIDBKeyRange).
//
// MODEL WYKONANIA (od niego zależy zgodność z przeglądarką)
//   - Każde zdarzenie (żądanie, transakcja, połączenie, otwarcie/kasowanie) jest osobnym makrozadaniem: setImmediate
//     przechwycone przy załadowaniu modułu, więc vi.useFakeTimers({ toFake: ['Date'] }) atrapy nie dotyka.
//   - Transakcja jest aktywna przy utworzeniu i w czasie wysyłania zdarzenia żądania oraz w mikrozadaniach po nim;
//     dezaktywuje ją dopiero opróżnienie kolejki mikrozadań tego makrozadania: queueMicrotask(() =>
//     process.nextTick(dezaktywuj)). Dzięki temu `await` na wynik żądania (łańcuch obietnic) działa jak w przeglądarce,
//     a każde inne oczekiwanie (zegar, wejście-wyjście, crypto.subtle) zastaje transakcję nieaktywną
//     (TransactionInactiveError). ZASADA: testy z atrapą nie fałszują globalnych setImmediate, queueMicrotask,
//     process.nextTick ani setTimeout.
//   - Atrapa jest CELOWO SUROWSZA niż Chromium przy `await crypto.subtle…` w obsłudze zdarzenia żądania: Chromium 141
//     zostawia wtedy transakcję aktywną (dla krótkich operacji), atrapa — nie. Na tej surowości stoją testy, które
//     wykrywają szyfrowanie wewnątrz transakcji; „naprawa” atrapy do zachowania Chromium w tym punkcie jest zakazana.
//   - Zatwierdzenie: transakcja nieaktywna bez żądań w toku (albo po commit()) przechodzi w stan zatwierdzania (nowe
//     żądanie → TransactionInactiveError, abort() → InvalidStateError), `complete` jest osobnym makrozadaniem.
//   - Błąd żądania bez preventDefault() bąbelkuje (żądanie → transakcja → połączenie) i przerywa transakcję; wyjątek
//     w obsłudze zdarzenia żądania przerywa ją z AbortError; tx.error jest ustawiane dopiero przy przerwaniu (w onabort),
//     w onerror żądania i transakcji jest null. Przerwanie cofa zmiany i daje AbortError żądaniom w toku.
//   - Harmonogram (wspólny dla wszystkich połączeń bazy): nowa readwrite czeka na wszystkie wcześniej utworzone,
//     niezakończone transakcje o nakładającym się zakresie, nowa readonly — na wcześniejsze readwrite.
//   - open/deleteDatabase mają kolejkę na nazwę bazy (open za zablokowanym kasowaniem czeka na jego koniec).
//     versionchange dostają połączenia bez close(); `blocked` — gdy któreś połączenie nie zamknęło się w obsłudze
//     versionchange albo było już w trakcie zamykania z transakcją w toku (tak robi Chromium; zamknięcie w obsłudze
//     versionchange przy transakcji w toku NIE daje blocked, kasowanie czeka na koniec transakcji). versionchange
//     kasowania zleconego, gdy transakcja bazy jest w stanie zatwierdzania, dochodzi po jej `complete`.
//   - close() przy transakcji w toku pozwala jej się zatwierdzić; transaction() po close() → InvalidStateError.
//   - readwrite pisze na żywych danych z kopią do cofnięcia (izolację daje harmonogram); wartości są klonowane
//     (structuredClone) przy zapisie i przy każdym odczycie.
//   Poza zakresem: autoIncrement, multiEntry, klucze binarne, czas, rozmiar i limity dysku (QuotaExceededError tylko
//   przez usterka), różnice WebKit.
//
// STEROWANIE TESTOWE (idb.__atrapa)
//   log — wpisy ['open', name, version|null], ['upgrade', name, old, new], ['abort-upgrade', name],
//       ['success', name, version], ['blocked', name, old, new], ['versionchange', name, old, new], ['close', name],
//       ['forced-close', name], ['deleteDatabase', name], ['delete-success', name], ['databases'],
//       ['tx', name, [sklepy], tryb, 'start'|'complete'|'abort', kodBledu?]. Bez wartości rekordów.
//   usterka({ przy, baza?, sklep?, metoda?, tryb?, blad, zdarzenie?, raz = true }) → { odwolaj(), uzyta }
//       przy: 'open' | 'deleteDatabase' (żądanie kończy się błędem `blad`; z zdarzenie: 'blocked' — zamiast błędu
//       dochodzi blocked, a potem operacja idzie dalej) | 'add' | 'put' | 'delete' | 'clear' | 'get' | 'getAll' |
//       'getAllKeys' | 'count' | 'openCursor' (żądanie dostaje błąd `blad`, bąbelkowanie i przerwanie jak dla
//       prawdziwego błędu) | 'commit' (transakcja przerwana przy zatwierdzaniu z tx.error = `blad`, zmiany cofnięte) |
//       'databases' (obietnica odrzucona). baza: napis albo RegExp; blad: nazwa DOMException; tryb: 'readonly' |
//       'readwrite' | 'versionchange' — tryb transakcji żądania albo zatwierdzenia (także w wstrzymaj i hak), żeby
//       odróżnić dwie transakcje o tym samym zakresie sklepów.
//   wstrzymaj({ przy, baza?, sklep?, metoda?, tryb? }) → { zwolnij(), czeka, osiagniety }
//       przy: 'open' | 'deleteDatabase' (przed przetworzeniem w kolejce bazy) | 'databases' | 'commit' (transakcja
//       stoi W STANIE ZATWIERDZANIA: abort() → InvalidStateError, nowe żądanie → TransactionInactiveError) |
//       'success' (żądanie wykonane, onsuccess wstrzymane). Jednorazowe: pierwszy pasujący punkt; `czeka` rozstrzyga
//       się, gdy atrapa do niego doszła; zwolnij() przed dojściem znosi wstrzymanie.
//   hak({ przy: 'success', baza?, sklep?, metoda?, tryb?, raz = true }, fn) → { rozbroj(), wywolany }
//       fn({ baza, sklep, metoda }) synchronicznie przed wysłaniem onsuccess pasującego żądania.
//   wymusZamkniecie(name) — zerwanie połączeń: transakcje przerwane z UnknownError, potem zdarzenie close.
//   bazy() — migawka { name: { version, sklepy: { n: { keyPath, indeksy: { i: { keyPath, unique } }, wiersze, klucze } } } }.
//   utworz(name, version, schemat, wiersze) — baza „z innej wersji aplikacji”: schemat { sklep: { keyPath, indeksy:
//       { i: { keyPath, unique } } } }, wiersze { sklep: [wartość] } (sklep bez keyPath: [[klucz, wartość]]).
//   klonuj() — nowa, niezależna instancja z kopią baz (bez połączeń i bez logu).
//   polaczenia(name?) — liczba otwartych połączeń (bez close()); name: napis albo RegExp.
//   wToku() — liczba niezakończonych transakcji. niezwolnione() — liczba wstrzymań bez zwolnij().
//   wyjatki — wyjątki rzucone w obsługach zdarzeń (atrapa je łapie, jak przeglądarka raportuje je osobno).

const makro = globalThis.setImmediate.bind(globalThis);
const mikro = globalThis.queueMicrotask.bind(globalThis);
const tik = process.nextTick.bind(process);
const klon = globalThis.structuredClone.bind(globalThis);
const wlasne = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const blad = (nazwa, opis) => new DOMException(opis || nazwa, nazwa);
const BRAK = Symbol('brak');

// ── Klucze ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const jestData = (x) => Object.prototype.toString.call(x) === '[object Date]';
function naKlucz(x, widziane = new Set()) {
  if (typeof x === 'number') return Number.isNaN(x) ? BRAK : x;
  if (typeof x === 'string') return x;
  if (jestData(x)) { const t = x.getTime(); return Number.isNaN(t) ? BRAK : new Date(t); }
  if (Array.isArray(x)) {
    if (widziane.has(x)) return BRAK;
    widziane.add(x);
    const out = [];
    for (let i = 0; i < x.length; i += 1) {
      if (!wlasne(x, i)) return BRAK;
      const k = naKlucz(x[i], widziane);
      if (k === BRAK) return BRAK;
      out.push(k);
    }
    widziane.delete(x);
    return out;
  }
  return BRAK;
}
function klucz(x) {
  const k = naKlucz(x);
  if (k === BRAK) throw blad('DataError', 'Wartość nie jest poprawnym kluczem.');
  return k;
}
const ranga = (k) => (typeof k === 'number' ? 1 : jestData(k) ? 2 : typeof k === 'string' ? 3 : 4);
function porownaj(a, b) {
  const ra = ranga(a);
  const rb = ranga(b);
  if (ra !== rb) return ra < rb ? -1 : 1;
  if (ra === 4) {
    for (let i = 0; i < Math.min(a.length, b.length); i += 1) { const c = porownaj(a[i], b[i]); if (c) return c; }
    return a.length === b.length ? 0 : a.length < b.length ? -1 : 1;
  }
  const x = ra === 2 ? a.getTime() : a;
  const y = rb === 2 ? b.getTime() : b;
  return x < y ? -1 : x > y ? 1 : 0;
}
function wartoscSciezki(w, sciezka) {
  if (Array.isArray(sciezka)) {
    const out = [];
    for (const s of sciezka) { const x = wartoscSciezki(w, s); if (x === BRAK) return BRAK; out.push(x); }
    return out;
  }
  if (sciezka === '') return w;
  let v = w;
  for (const id of sciezka.split('.')) {
    if ((typeof v === 'string' || Array.isArray(v)) && id === 'length') { v = v.length; continue; }
    if (v === null || typeof v !== 'object' || !wlasne(v, id)) return BRAK;
    v = v[id];
  }
  return v;
}
const kluczIndeksu = (w, sciezka) => naKlucz(wartoscSciezki(w, sciezka));
function poprawnaSciezka(s) {
  const jedna = (x) => typeof x === 'string' && (x === '' || x.split('.').every((c) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(c)));
  return Array.isArray(s) ? s.length > 0 && s.every((x) => x !== '' && jedna(x)) : jedna(s);
}

// ── Zakresy kluczy ───────────────────────────────────────────────────────────────────────────────────────────────────
const TWORZENIE = Symbol('zakres');
export class AtrapaIDBKeyRange {
  constructor(znak, dolna, gorna, dolnaOtwarta, gornaOtwarta) {
    if (znak !== TWORZENIE) throw new TypeError('Illegal constructor');
    this._d = dolna;
    this._g = gorna;
    this._dOtw = !!dolnaOtwarta;
    this._gOtw = !!gornaOtwarta;
  }
  get lower() { return this._d; }
  get upper() { return this._g; }
  get lowerOpen() { return this._dOtw; }
  get upperOpen() { return this._gOtw; }
  includes(x) { return wZakresie(this, klucz(x)); }
  static only(x) { const k = klucz(x); return new AtrapaIDBKeyRange(TWORZENIE, k, k, false, false); }
  static lowerBound(x, otwarta = false) { return new AtrapaIDBKeyRange(TWORZENIE, klucz(x), undefined, otwarta, true); }
  static upperBound(x, otwarta = false) { return new AtrapaIDBKeyRange(TWORZENIE, undefined, klucz(x), true, otwarta); }
  static bound(d, g, dOtw = false, gOtw = false) {
    const a = klucz(d);
    const b = klucz(g);
    const c = porownaj(a, b);
    if (c > 0 || (c === 0 && (dOtw || gOtw))) throw blad('DataError', 'Dolna granica zakresu jest większa od górnej.');
    return new AtrapaIDBKeyRange(TWORZENIE, a, b, dOtw, gOtw);
  }
}
function wZakresie(z, k) {
  if (!z) return true;
  if (z._d !== undefined) { const c = porownaj(k, z._d); if (c < 0 || (c === 0 && z._dOtw)) return false; }
  if (z._g !== undefined) { const c = porownaj(k, z._g); if (c > 0 || (c === 0 && z._gOtw)) return false; }
  return true;
}
function naZakres(q, nullDozwolony) {
  if (q instanceof AtrapaIDBKeyRange) return q;
  if (q === undefined || q === null) {
    if (nullDozwolony) return null;
    throw blad('DataError', 'Brak klucza albo zakresu.');
  }
  const k = klucz(q);
  return new AtrapaIDBKeyRange(TWORZENIE, k, k, false, false);
}

// ── Listy nazw (DOMStringList) ───────────────────────────────────────────────────────────────────────────────────────
function listaNazw(nazwy) {
  const t = [...nazwy].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const l = {
    get length() { return t.length; },
    item(i) { return i >= 0 && i < t.length ? t[i] : null; },
    contains(n) { return t.includes(n); },
    [Symbol.iterator]() { return t[Symbol.iterator](); },
  };
  t.forEach((n, i) => { Object.defineProperty(l, i, { value: n, enumerable: true }); });
  return Object.freeze(l);
}

// ── Zdarzenia ────────────────────────────────────────────────────────────────────────────────────────────────────────
class Zdarzenie {
  constructor(type, { bubbles = false, cancelable = false, wersje = null } = {}) {
    this.type = type;
    this.bubbles = bubbles;
    this.cancelable = cancelable;
    this.defaultPrevented = false;
    this.target = null;
    this.currentTarget = null;
    this.timeStamp = 0;
    this._stop = false;
    this._stopTeraz = false;
    if (wersje) { this.oldVersion = wersje[0]; this.newVersion = wersje[1]; }
  }
  preventDefault() { if (this.cancelable) this.defaultPrevented = true; }
  stopPropagation() { this._stop = true; }
  stopImmediatePropagation() { this._stop = true; this._stopTeraz = true; }
}
class Cel {
  _lista(typ) {
    if (!this._sl) this._sl = Object.create(null);
    if (!this._sl[typ]) this._sl[typ] = [];
    return this._sl[typ];
  }
  addEventListener(typ, fn, opcje) {
    if (!fn) return;
    const l = this._lista(typ);
    if (l.some((s) => !s.atrybut && s.fn === fn)) return;
    l.push({ fn, atrybut: false, raz: !!(opcje && typeof opcje === 'object' && opcje.once) });
  }
  removeEventListener(typ, fn) {
    const l = this._lista(typ);
    const i = l.findIndex((s) => !s.atrybut && s.fn === fn);
    if (i >= 0) l.splice(i, 1);
  }
}
// Atrybut on<typ> zajmuje w kolejności słuchaczy miejsce z chwili pierwszego ustawienia (jak w DOM); podmiana zostawia
// miejsce, null usuwa.
function atrybutyZdarzen(klasa, typy) {
  for (const typ of typy) {
    Object.defineProperty(klasa.prototype, 'on' + typ, {
      configurable: true,
      get() { const s = this._lista(typ).find((x) => x.atrybut); return s ? s.fn : null; },
      set(fn) {
        const l = this._lista(typ);
        const i = l.findIndex((x) => x.atrybut);
        if (typeof fn !== 'function' && (fn === null || typeof fn !== 'object')) { if (i >= 0) l.splice(i, 1); return; }
        if (i >= 0) l[i].fn = fn;
        else l.push({ fn, atrybut: true, raz: false });
      },
    });
  }
}

// ── Fabryka ──────────────────────────────────────────────────────────────────────────────────────────────────────────
export function utworzIndexedDB({ log = [] } = {}) {
  const st = {
    bazy: new Map(), kolejki: new Map(), polaczenia: new Set(), transakcje: new Set(), oczekujace: [],
    usterki: [], wstrzymania: [], haki: [], log, wyjatki: [],
  };
  const loguj = (w) => { st.log.push(w); };

  function wyslij(sciezka, zd) {
    zd.target = sciezka[0];
    let rzucil = false;
    for (const cel of zd.bubbles ? sciezka : [sciezka[0]]) {
      if (!cel) continue;
      zd.currentTarget = cel;
      const lista = cel._lista(zd.type);
      for (const s of [...lista]) {
        if (zd._stopTeraz) break;
        if (!lista.includes(s)) continue;
        if (s.raz) lista.splice(lista.indexOf(s), 1);
        try {
          if (typeof s.fn === 'function') s.fn.call(cel, zd);
          else if (s.fn && typeof s.fn.handleEvent === 'function') s.fn.handleEvent(zd);
        } catch (x) {
          rzucil = true;
          st.wyjatki.push(String((x && x.message) || x));
        }
      }
      if (zd._stop) break;
    }
    zd.currentTarget = null;
    return rzucil;
  }

  // Dopasowanie punktów sterowania testowego.
  function pasuje(wz, o) {
    if (wz.przy !== o.przy) return false;
    if (wz.baza != null && !(wz.baza instanceof RegExp ? wz.baza.test(o.baza) : wz.baza === o.baza)) return false;
    if (wz.sklep != null && !(o.sklepy ? o.sklepy.includes(wz.sklep) : wz.sklep === o.sklep)) return false;
    if (wz.metoda != null && wz.metoda !== o.metoda) return false;
    if (wz.tryb != null && wz.tryb !== o.tryb) return false;
    return true;
  }
  function usterka(o) {
    const u = st.usterki.find((x) => pasuje(x.wz, o));
    if (!u) return null;
    u.uzyta += 1;
    if (u.wz.raz !== false) st.usterki.splice(st.usterki.indexOf(u), 1);
    return u.wz;
  }
  function zatrzymaj(o, dalej) {
    const w = st.wstrzymania.find((x) => !x.osiagniety && pasuje(x.wz, o));
    if (!w) return false;
    w.osiagniety = true;
    w.dalej = dalej;
    w.osiagnij(o);
    return true;
  }
  function czekaj(warunek, dalej) {
    if (warunek()) { dalej(); return; }
    st.oczekujace.push({ warunek, dalej });
  }
  function sprawdzOczekujace() {
    for (const o of [...st.oczekujace]) {
      if (!st.oczekujace.includes(o) || !o.warunek()) continue;
      st.oczekujace.splice(st.oczekujace.indexOf(o), 1);
      makro(o.dalej);
    }
  }

  // ── Dane baz ───────────────────────────────────────────────────────────────────────────────────────────────────────
  const nowaBaza = (nazwa) => ({ nazwa, wersja: 0, sklepy: new Map(), utworzona: false, harmonogram: [] });
  const nowySklep = (nazwa, keyPath) => ({ nazwa, keyPath, indeksy: new Map(), wiersze: [], wersja: 0, pamiec: new Map(), usuniety: false });
  function szukaj(wiersze, k) {
    let lo = 0;
    let hi = wiersze.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (porownaj(wiersze[m].k, k) < 0) lo = m + 1; else hi = m; }
    return lo;
  }
  function wpisy(s, def) {
    const id = def ? def.nazwa : '';
    const p = s.pamiec.get(id);
    if (p && p.wersja === s.wersja && p.def === def) return p.wpisy;
    let out;
    if (!def) out = s.wiersze.map((w) => ({ ik: w.k, pk: w.k, v: w.v }));
    else {
      out = [];
      for (const w of s.wiersze) { const ik = kluczIndeksu(w.v, def.keyPath); if (ik !== BRAK) out.push({ ik, pk: w.k, v: w.v }); }
      out.sort((a, b) => porownaj(a.ik, b.ik) || porownaj(a.pk, b.pk));
    }
    s.pamiec.set(id, { wersja: s.wersja, def, wpisy: out });
    return out;
  }
  function doCofniecia(tx, s) {
    if (tx._upgrade || tx._kopie.has(s)) return;
    tx._kopie.set(s, s.wiersze.slice());
  }
  function zapisz(tx, s, k, v, bezNadpisu) {
    const i = szukaj(s.wiersze, k);
    const jest = i < s.wiersze.length && porownaj(s.wiersze[i].k, k) === 0;
    if (jest && bezNadpisu) throw blad('ConstraintError', 'Klucz już istnieje w sklepie.');
    for (const def of s.indeksy.values()) {
      if (!def.unique) continue;
      const ik = kluczIndeksu(v, def.keyPath);
      if (ik === BRAK) continue;
      if (wpisy(s, def).some((e) => porownaj(e.ik, ik) === 0 && porownaj(e.pk, k) !== 0)) {
        throw blad('ConstraintError', 'Wartość indeksu unikalnego już istnieje.');
      }
    }
    doCofniecia(tx, s);
    if (jest) s.wiersze[i] = { k, v };
    else s.wiersze.splice(i, 0, { k, v });
    s.wersja += 1;
    return k;
  }
  function usun(tx, s, z) {
    const zostaja = s.wiersze.filter((w) => !wZakresie(z, w.k));
    if (zostaja.length === s.wiersze.length) return undefined;
    doCofniecia(tx, s);
    s.wiersze = zostaja;
    s.wersja += 1;
    return undefined;
  }
  function migawkaBazy(b) {
    const sklepy = new Map();
    for (const [n, s] of b.sklepy) sklepy.set(n, Object.assign({}, s, { indeksy: new Map(s.indeksy), wiersze: s.wiersze.slice(), pamiec: new Map() }));
    return { wersja: b.wersja, sklepy, utworzona: b.utworzona };
  }

  // ── Kursory ────────────────────────────────────────────────────────────────────────────────────────────────────────
  function pierwszyNieMniejszy(lista, k) {
    let lo = 0;
    let hi = lista.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (porownaj(lista[m].ik, k) < 0) lo = m + 1; else hi = m; }
    return lo;
  }
  function ostatniNieWiekszy(lista, k) {
    let lo = 0;
    let hi = lista.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (porownaj(lista[m].ik, k) <= 0) lo = m + 1; else hi = m; }
    return lo - 1;
  }
  function nastepnyWpis(lista, z, kier, poz, pozPk, cel) {
    if (kier === 'next' || kier === 'nextunique') {
      let od = 0;
      for (const g of [z ? z._d : undefined, poz, cel]) if (g !== undefined) od = Math.max(od, pierwszyNieMniejszy(lista, g));
      for (let i = od; i < lista.length; i += 1) {
        const e = lista[i];
        if (!wZakresie(z, e.ik)) { if (z && z._g !== undefined && porownaj(e.ik, z._g) >= 0) return null; continue; }
        if (poz !== undefined) {
          const c = porownaj(e.ik, poz);
          if (c < 0 || (c === 0 && (kier === 'nextunique' || porownaj(e.pk, pozPk) <= 0))) continue;
        }
        if (cel !== undefined && porownaj(e.ik, cel) < 0) continue;
        return e;
      }
      return null;
    }
    let od = lista.length - 1;
    for (const g of [z ? z._g : undefined, poz, cel]) if (g !== undefined) od = Math.min(od, ostatniNieWiekszy(lista, g));
    for (let i = od; i >= 0; i -= 1) {
      const e = lista[i];
      if (!wZakresie(z, e.ik)) { if (z && z._d !== undefined && porownaj(e.ik, z._d) <= 0) return null; continue; }
      if (poz !== undefined) {
        const c = porownaj(e.ik, poz);
        if (c > 0 || (c === 0 && (kier === 'prevunique' || porownaj(e.pk, pozPk) >= 0))) continue;
      }
      if (cel !== undefined && porownaj(e.ik, cel) > 0) continue;
      if (kier === 'prevunique') {
        let j = i;
        while (j > 0 && porownaj(lista[j - 1].ik, e.ik) === 0 && wZakresie(z, lista[j - 1].ik)) j -= 1;
        return lista[j];
      }
      return e;
    }
    return null;
  }

  // ── Żądania ────────────────────────────────────────────────────────────────────────────────────────────────────────
  class Zadanie extends Cel {
    constructor(zrodlo, tx) {
      super();
      this.source = zrodlo;
      this.transaction = tx;
      this._gotowe = false;
      this._wynik = undefined;
      this._blad = null;
    }
    get readyState() { return this._gotowe ? 'done' : 'pending'; }
    get result() { if (!this._gotowe) throw blad('InvalidStateError', 'Żądanie jeszcze się nie zakończyło.'); return this._wynik; }
    get error() { if (!this._gotowe) throw blad('InvalidStateError', 'Żądanie jeszcze się nie zakończyło.'); return this._blad; }
  }
  atrybutyZdarzen(Zadanie, ['success', 'error']);
  class ZadanieOtwarcia extends Zadanie {
    constructor() { super(null, null); }
  }
  atrybutyZdarzen(ZadanieOtwarcia, ['blocked', 'upgradeneeded']);

  // ── Transakcje ─────────────────────────────────────────────────────────────────────────────────────────────────────
  class Transakcja extends Cel {
    constructor(pol, zakres, tryb, upgrade) {
      super();
      this._pol = pol;
      this._baza = pol._baza;
      this._zakres = zakres;
      this._tryb = tryb;
      this._upgrade = !!upgrade;
      this._stan = 'active';
      this._rozpoczeta = false;
      this._kolejka = [];
      this._biezace = null;
      this._wToku = false;
      this._pompa = false;
      this._zatwierdzanie = false;
      this._kopie = new Map();
      this._error = null;
      this._uchwyty = new Map();
      this._poKoncu = null;
    }
    get mode() { return this._tryb; }
    get db() { return this._pol; }
    get error() { return this._error; }
    get durability() { return 'default'; }
    get objectStoreNames() { return listaNazw(this._upgrade ? this._baza.sklepy.keys() : this._zakres); }
    objectStore(nazwa) {
      if (this._stan === 'finished') throw blad('InvalidStateError', 'Transakcja jest zakończona.');
      const s = this._baza.sklepy.get(nazwa);
      if (!s || (!this._upgrade && !this._zakres.includes(nazwa))) throw blad('NotFoundError', 'Sklep poza zakresem transakcji.');
      return uchwytSklepu(this, s);
    }
    abort() {
      if (this._stan === 'committing' || this._stan === 'finished') throw blad('InvalidStateError', 'Transakcja zatwierdza się albo jest zakończona.');
      przerwij(this, null);
    }
    commit() {
      if (this._stan !== 'active') throw blad('InvalidStateError', 'Transakcja nie jest aktywna.');
      this._stan = 'committing';
      dalejTx(this);
    }
  }
  atrybutyZdarzen(Transakcja, ['complete', 'abort', 'error']);
  const opisTx = (tx) => ({ baza: tx._baza.nazwa, sklepy: tx._upgrade ? [...tx._baza.sklepy.keys()] : tx._zakres, tryb: tx._upgrade ? 'versionchange' : tx._tryb });

  function wymagajAktywnej(tx) {
    if (tx._stan !== 'active') throw blad('TransactionInactiveError', 'Transakcja nie jest aktywna.');
  }
  function wymagajZapisu(tx) {
    if (tx._tryb === 'readonly') throw blad('ReadOnlyError', 'Transakcja tylko do odczytu.');
  }
  function umiesc(tx, z, operacja, metoda, sklep) {
    z._gotowe = false;
    tx._kolejka.push({ z, operacja, metoda, sklep });
    pompuj(tx);
    return z;
  }
  function pompuj(tx) {
    if (!tx._rozpoczeta || tx._pompa || tx._wToku || tx._stan === 'finished' || !tx._kolejka.length) return;
    tx._pompa = true;
    makro(() => { krokPompy(tx); });
  }
  function krokPompy(tx) {
    tx._pompa = false;
    if (tx._stan === 'finished' || tx._wToku || !tx._kolejka.length) return;
    const e = tx._kolejka.shift();
    tx._wToku = true;
    tx._biezace = e;
    const opis = { przy: e.metoda, baza: tx._baza.nazwa, sklep: e.sklep, metoda: e.metoda, tryb: tx._upgrade ? 'versionchange' : tx._tryb };
    let wynik;
    let bladOp = null;
    const u = usterka(opis);
    if (u) bladOp = blad(u.blad, 'Usterka atrapy.');
    else {
      try { wynik = e.operacja(); } catch (x) { bladOp = x instanceof DOMException ? x : blad('UnknownError', String((x && x.message) || x)); }
    }
    const dalej = () => { wynikZadania(tx, e, wynik, bladOp); };
    if (!bladOp && zatrzymaj(Object.assign({}, opis, { przy: 'success' }), dalej)) return;
    dalej();
  }
  function wynikZadania(tx, e, wynik, bladOp) {
    if (tx._stan === 'finished') return;
    const z = e.z;
    z._gotowe = true;
    z._wynik = bladOp ? undefined : wynik;
    z._blad = bladOp;
    if (!bladOp) {
      const o = { przy: 'success', baza: tx._baza.nazwa, sklep: e.sklep, metoda: e.metoda, tryb: tx._upgrade ? 'versionchange' : tx._tryb };
      const h = st.haki.find((x) => pasuje(x.wz, o));
      if (h) {
        h.wywolany += 1;
        if (h.wz.raz !== false) st.haki.splice(st.haki.indexOf(h), 1);
        try { h.fn({ baza: o.baza, sklep: o.sklep, metoda: o.metoda }); } catch (x) { st.wyjatki.push(String((x && x.message) || x)); }
      }
    }
    if (tx._stan === 'finished') return;
    tx._biezace = null;
    if (tx._stan === 'inactive') tx._stan = 'active';
    const zd = bladOp ? new Zdarzenie('error', { bubbles: true, cancelable: true }) : new Zdarzenie('success');
    const rzucil = wyslij(bladOp ? [z, tx, tx._pol] : [z], zd);
    mikro(() => { tik(() => { poZdarzeniu(tx, rzucil, bladOp, zd); }); });
  }
  function poZdarzeniu(tx, rzucil, bladOp, zd) {
    tx._wToku = false;
    if (tx._stan === 'finished') return;
    if (tx._stan === 'active') tx._stan = 'inactive';
    if (rzucil) { przerwij(tx, blad('AbortError', 'Wyjątek w obsłudze zdarzenia.')); return; }
    if (bladOp && !zd.defaultPrevented) { przerwij(tx, bladOp); return; }
    dalejTx(tx);
  }
  function dezaktywuj(tx) {
    if (tx._stan === 'active') tx._stan = 'inactive';
    dalejTx(tx);
  }
  function dalejTx(tx) {
    if (tx._stan === 'finished') return;
    if (tx._kolejka.length) { pompuj(tx); return; }
    if (tx._wToku || !tx._rozpoczeta) return;
    if (tx._stan === 'inactive' || tx._stan === 'committing') zatwierdz(tx);
  }
  function zatwierdz(tx) {
    if (tx._zatwierdzanie) return;
    tx._zatwierdzanie = true;
    tx._stan = 'committing';
    const koncz = () => {
      makro(() => {
        if (tx._stan === 'finished') return;
        const u = usterka(Object.assign({ przy: 'commit' }, opisTx(tx)));
        if (u) { przerwij(tx, blad(u.blad, 'Usterka atrapy przy zatwierdzaniu.')); return; }
        tx._stan = 'finished';
        tx._kopie = new Map();
        if (!tx._upgrade) loguj(['tx', tx._baza.nazwa, tx._zakres.slice(), tx._tryb, 'complete']);
        wyslij([tx], new Zdarzenie('complete'));
        zakonczTx(tx, false);
      });
    };
    if (!zatrzymaj(Object.assign({ przy: 'commit' }, opisTx(tx)), koncz)) koncz();
  }
  function przerwij(tx, przyczyna) {
    if (tx._stan === 'finished') return;
    tx._stan = 'finished';
    if (tx._upgrade) {
      const m = tx._migawka;
      tx._baza.wersja = m.wersja;
      tx._baza.sklepy = m.sklepy;
      tx._baza.utworzona = m.utworzona;
      if (!m.utworzona && st.bazy.get(tx._baza.nazwa) === tx._baza) st.bazy.delete(tx._baza.nazwa);
    } else {
      for (const [s, wiersze] of tx._kopie) { s.wiersze = wiersze; s.wersja += 1; }
    }
    tx._kopie = new Map();
    tx._error = przyczyna;
    const doBledu = (tx._biezace ? [tx._biezace] : []).concat(tx._kolejka);
    tx._biezace = null;
    tx._kolejka = [];
    for (const e of doBledu) {
      makro(() => {
        e.z._gotowe = true;
        e.z._wynik = undefined;
        e.z._blad = blad('AbortError', 'Transakcja przerwana.');
        wyslij([e.z, tx, tx._pol], new Zdarzenie('error', { bubbles: true, cancelable: true }));
      });
    }
    makro(() => {
      if (!tx._upgrade) loguj(['tx', tx._baza.nazwa, tx._zakres.slice(), tx._tryb, 'abort', przyczyna ? przyczyna.name : null]);
      wyslij([tx, tx._pol], new Zdarzenie('abort', { bubbles: true }));
      zakonczTx(tx, true);
    });
  }
  function zakonczTx(tx, przerwana) {
    st.transakcje.delete(tx);
    const h = tx._baza.harmonogram;
    if (h.includes(tx)) h.splice(h.indexOf(tx), 1);
    tx._pol._tx.delete(tx);
    if (tx._poKoncu) tx._poKoncu(przerwana);
    if (tx._pol._zamykane && !tx._pol._tx.size) zamknijPolaczenie(tx._pol);
    harmonogramuj(tx._baza);
    sprawdzOczekujace();
  }
  const nakladaSie = (a, b) => a._upgrade || b._upgrade || a._zakres.some((n) => b._zakres.includes(n));
  function harmonogramuj(baza) {
    const lista = baza.harmonogram;
    for (let i = 0; i < lista.length; i += 1) {
      const t = lista[i];
      if (t._rozpoczeta) continue;
      let mozna = true;
      for (let j = 0; j < i && mozna; j += 1) {
        const u = lista[j];
        if (nakladaSie(t, u) && (t._tryb !== 'readonly' || u._tryb !== 'readonly')) mozna = false;
      }
      if (mozna) rozpocznij(t);
    }
  }
  function rozpocznij(t) {
    t._rozpoczeta = true;
    if (!t._upgrade) loguj(['tx', t._baza.nazwa, t._zakres.slice(), t._tryb, 'start']);
    dalejTx(t);
  }

  // ── Sklepy i indeksy ───────────────────────────────────────────────────────────────────────────────────────────────
  function uchwytSklepu(tx, s) {
    let u = tx._uchwyty.get(s);
    if (!u) { u = new Sklep(tx, s); tx._uchwyty.set(s, u); }
    return u;
  }
  class Sklep {
    constructor(tx, s) { this._tx = tx; this._s = s; this._indeksy = new Map(); }
    get name() { return this._s.nazwa; }
    get keyPath() { return Array.isArray(this._s.keyPath) ? this._s.keyPath.slice() : this._s.keyPath; }
    get autoIncrement() { return false; }
    get transaction() { return this._tx; }
    get indexNames() { return listaNazw(this._s.indeksy.keys()); }
    _sprawdz() {
      if (this._s.usuniety) throw blad('InvalidStateError', 'Sklep został usunięty.');
      wymagajAktywnej(this._tx);
    }
    _zapis(wartosc, kl, bezNadpisu) {
      this._sprawdz();
      wymagajZapisu(this._tx);
      const s = this._s;
      if (s.keyPath !== null && kl !== undefined) throw blad('DataError', 'Sklep z keyPath nie przyjmuje osobnego klucza.');
      if (s.keyPath === null && kl === undefined) throw blad('DataError', 'Sklep bez keyPath wymaga klucza.');
      const kk = kl === undefined ? undefined : klucz(kl);
      const v = klon(wartosc);
      const k = s.keyPath === null ? kk : naKlucz(wartoscSciezki(v, s.keyPath));
      if (k === BRAK) throw blad('DataError', 'Rekord nie ma poprawnego klucza.');
      const tx = this._tx;
      return umiesc(tx, new Zadanie(this, tx), () => zapisz(tx, s, k, v, bezNadpisu), bezNadpisu ? 'add' : 'put', s.nazwa);
    }
    put(wartosc, kl) { return this._zapis(wartosc, kl, false); }
    add(wartosc, kl) { return this._zapis(wartosc, kl, true); }
    delete(q) {
      this._sprawdz();
      wymagajZapisu(this._tx);
      const z = naZakres(q, false);
      const tx = this._tx;
      return umiesc(tx, new Zadanie(this, tx), () => usun(tx, this._s, z), 'delete', this._s.nazwa);
    }
    clear() {
      this._sprawdz();
      wymagajZapisu(this._tx);
      const tx = this._tx;
      return umiesc(tx, new Zadanie(this, tx), () => usun(tx, this._s, null), 'clear', this._s.nazwa);
    }
    _odczyt(metoda, q, nullDozwolony, fn) {
      this._sprawdz();
      const z = naZakres(q, nullDozwolony);
      return umiesc(this._tx, new Zadanie(this, this._tx), () => fn(wpisy(this._s, null).filter((e) => wZakresie(z, e.ik))), metoda, this._s.nazwa);
    }
    get(q) { return this._odczyt('get', q, false, (l) => (l.length ? klon(l[0].v) : undefined)); }
    getKey(q) { return this._odczyt('get', q, false, (l) => (l.length ? klon(l[0].pk) : undefined)); }
    getAll(q, ile) { return this._odczyt('getAll', q, true, (l) => (ile ? l.slice(0, ile) : l).map((e) => klon(e.v))); }
    getAllKeys(q, ile) { return this._odczyt('getAllKeys', q, true, (l) => (ile ? l.slice(0, ile) : l).map((e) => klon(e.pk))); }
    count(q) { return this._odczyt('count', q, true, (l) => l.length); }
    openCursor(q, kier = 'next') { return otworzKursor(this, null, q, kier, true); }
    openKeyCursor(q, kier = 'next') { return otworzKursor(this, null, q, kier, false); }
    index(nazwa) {
      if (this._s.usuniety || this._tx._stan === 'finished') throw blad('InvalidStateError', 'Sklep usunięty albo transakcja zakończona.');
      const def = this._s.indeksy.get(nazwa);
      if (!def) throw blad('NotFoundError', 'Nie ma takiego indeksu.');
      let i = this._indeksy.get(def);
      if (!i) { i = new Indeks(this, def); this._indeksy.set(def, i); }
      return i;
    }
    createIndex(nazwa, keyPath, opcje = {}) {
      const tx = this._tx;
      if (!tx._upgrade) throw blad('InvalidStateError', 'Indeks można utworzyć tylko w onupgradeneeded.');
      if (this._s.usuniety) throw blad('InvalidStateError', 'Sklep został usunięty.');
      wymagajAktywnej(tx);
      if (this._s.indeksy.has(nazwa)) throw blad('ConstraintError', 'Indeks już istnieje.');
      if (!poprawnaSciezka(keyPath)) throw blad('SyntaxError', 'Zła ścieżka klucza.');
      if (opcje && opcje.multiEntry) throw new Error('atrapa IndexedDB: multiEntry nie jest obsługiwany');
      const def = { nazwa, keyPath: Array.isArray(keyPath) ? keyPath.slice() : keyPath, unique: !!(opcje && opcje.unique), multiEntry: false };
      if (def.unique) {
        const l = wpisy(this._s, def);
        for (let i = 1; i < l.length; i += 1) if (porownaj(l[i - 1].ik, l[i].ik) === 0) { mikro(() => { przerwij(tx, blad('ConstraintError', 'Dane łamią indeks unikalny.')); }); break; }
      }
      this._s.indeksy.set(nazwa, def);
      return this.index(nazwa);
    }
    deleteIndex(nazwa) {
      if (!this._tx._upgrade) throw blad('InvalidStateError', 'Indeks można usunąć tylko w onupgradeneeded.');
      wymagajAktywnej(this._tx);
      if (!this._s.indeksy.has(nazwa)) throw blad('NotFoundError', 'Nie ma takiego indeksu.');
      this._s.indeksy.delete(nazwa);
    }
  }
  class Indeks {
    constructor(sklep, def) { this._sklep = sklep; this._def = def; }
    get name() { return this._def.nazwa; }
    get keyPath() { return Array.isArray(this._def.keyPath) ? this._def.keyPath.slice() : this._def.keyPath; }
    get unique() { return this._def.unique; }
    get multiEntry() { return false; }
    get objectStore() { return this._sklep; }
    _odczyt(metoda, q, nullDozwolony, fn) {
      const sk = this._sklep;
      sk._sprawdz();
      if (sk._s.indeksy.get(this._def.nazwa) !== this._def) throw blad('InvalidStateError', 'Indeks został usunięty.');
      const z = naZakres(q, nullDozwolony);
      return umiesc(sk._tx, new Zadanie(this, sk._tx), () => fn(wpisy(sk._s, this._def).filter((e) => wZakresie(z, e.ik))), metoda, sk._s.nazwa);
    }
    get(q) { return this._odczyt('get', q, false, (l) => (l.length ? klon(l[0].v) : undefined)); }
    getKey(q) { return this._odczyt('get', q, false, (l) => (l.length ? klon(l[0].pk) : undefined)); }
    getAll(q, ile) { return this._odczyt('getAll', q, true, (l) => (ile ? l.slice(0, ile) : l).map((e) => klon(e.v))); }
    getAllKeys(q, ile) { return this._odczyt('getAllKeys', q, true, (l) => (ile ? l.slice(0, ile) : l).map((e) => klon(e.pk))); }
    count(q) { return this._odczyt('count', q, true, (l) => l.length); }
    openCursor(q, kier = 'next') { return otworzKursor(this._sklep, this._def, q, kier, true, this); }
    openKeyCursor(q, kier = 'next') { return otworzKursor(this._sklep, this._def, q, kier, false, this); }
  }

  class Kursor {
    constructor(sklep, def, zakres, kier, zrodlo, zadanie) {
      this._sklep = sklep;
      this._def = def;
      this._zakres = zakres;
      this._kier = kier;
      this._zrodlo = zrodlo;
      this._zadanie = zadanie;
      this._poz = undefined;
      this._pozPk = undefined;
      this._v = undefined;
      this._maWartosc = false;
    }
    get source() { return this._zrodlo; }
    get direction() { return this._kier; }
    get key() { return this._poz === undefined ? undefined : klon(this._poz); }
    get primaryKey() { return this._pozPk === undefined ? undefined : klon(this._pozPk); }
    get request() { return this._zadanie; }
    _krok(cel, ile) {
      const lista = wpisy(this._sklep._s, this._def);
      let e = null;
      for (let i = 0; i < ile; i += 1) {
        e = nastepnyWpis(lista, this._zakres, this._kier, this._poz, this._pozPk, i === 0 ? cel : undefined);
        if (!e) break;
        this._poz = e.ik;
        this._pozPk = e.pk;
      }
      if (!e) { this._v = undefined; this._maWartosc = false; return null; }
      this._v = e.v;
      this._maWartosc = true;
      return this;
    }
    _dalej(cel, ile) {
      const tx = this._sklep._tx;
      wymagajAktywnej(tx);
      if (this._sklep._s.usuniety) throw blad('InvalidStateError', 'Sklep został usunięty.');
      if (!this._maWartosc) throw blad('InvalidStateError', 'Kursor nie stoi na rekordzie albo już przesuwa się dalej.');
      this._maWartosc = false;
      umiesc(tx, this._zadanie, () => this._krok(cel, ile), 'openCursor', this._sklep._s.nazwa);
    }
    continue(kl) {
      let cel;
      if (kl !== undefined) {
        cel = klucz(kl);
        const c = this._poz === undefined ? 1 : porownaj(cel, this._poz);
        if ((this._kier.startsWith('next') && c <= 0) || (this._kier.startsWith('prev') && c >= 0)) throw blad('DataError', 'Klucz nie leży za bieżącą pozycją kursora.');
      }
      this._dalej(cel, 1);
    }
    advance(ile) {
      const n = Number(ile);
      if (!Number.isInteger(n) || n < 1) throw new TypeError('advance wymaga liczby całkowitej ≥ 1');
      this._dalej(undefined, n);
    }
    _zmiana() {
      const tx = this._sklep._tx;
      wymagajAktywnej(tx);
      wymagajZapisu(tx);
      if (this._sklep._s.usuniety) throw blad('InvalidStateError', 'Sklep został usunięty.');
      if (!this._maWartosc || !(this instanceof KursorZWartoscia)) throw blad('InvalidStateError', 'Kursor nie stoi na rekordzie.');
      return tx;
    }
    delete() {
      const tx = this._zmiana();
      const pk = this._pozPk;
      return umiesc(tx, new Zadanie(this, tx), () => usun(tx, this._sklep._s, naZakres(pk, false)), 'delete', this._sklep._s.nazwa);
    }
    update(wartosc) {
      const tx = this._zmiana();
      const s = this._sklep._s;
      const pk = this._pozPk;
      const v = klon(wartosc);
      if (s.keyPath !== null) {
        const k = naKlucz(wartoscSciezki(v, s.keyPath));
        if (k === BRAK || porownaj(k, pk) !== 0) throw blad('DataError', 'Klucz rekordu różni się od klucza kursora.');
      }
      return umiesc(tx, new Zadanie(this, tx), () => zapisz(tx, s, pk, v, false), 'put', s.nazwa);
    }
  }
  class KursorZWartoscia extends Kursor {
    get value() { return this._v === undefined ? undefined : klon(this._v); }
  }
  function otworzKursor(sklep, def, q, kier, zWartoscia, zrodlo) {
    sklep._sprawdz();
    if (!['next', 'nextunique', 'prev', 'prevunique'].includes(kier)) throw new TypeError('Zły kierunek kursora.');
    const z = naZakres(q, true);
    const tx = sklep._tx;
    const zadanie = new Zadanie(zrodlo || sklep, tx);
    const KlasaKursora = zWartoscia ? KursorZWartoscia : Kursor;
    const k = new KlasaKursora(sklep, def, z, kier, zrodlo || sklep, zadanie);
    return umiesc(tx, zadanie, () => k._krok(undefined, 1), 'openCursor', sklep._s.nazwa);
  }

  // ── Połączenia ─────────────────────────────────────────────────────────────────────────────────────────────────────
  class Polaczenie extends Cel {
    constructor(baza, wersja) {
      super();
      this._baza = baza;
      this._wersja = wersja;
      this._zamykane = false;
      this._zamkniete = false;
      this._tx = new Set();
      this._upgrade = null;
      st.polaczenia.add(this);
    }
    get name() { return this._baza.nazwa; }
    get version() { return this._wersja; }
    get objectStoreNames() { return listaNazw(this._baza.sklepy.keys()); }
    transaction(nazwy, tryb = 'readonly') {
      if (!['readonly', 'readwrite', 'versionchange'].includes(tryb)) throw new TypeError('Zły tryb transakcji.');
      if (this._upgrade && this._upgrade._stan !== 'finished') throw blad('InvalidStateError', 'Trwa zmiana wersji.');
      if (this._zamykane || this._zamkniete) throw blad('InvalidStateError', 'Połączenie jest zamknięte.');
      const lista = [...new Set(typeof nazwy === 'string' ? [nazwy] : Array.from(nazwy, String))].sort();
      for (const n of lista) if (!this._baza.sklepy.has(n)) throw blad('NotFoundError', 'Nie ma sklepu ' + n + '.');
      if (!lista.length) throw blad('InvalidAccessError', 'Pusty zakres transakcji.');
      if (tryb === 'versionchange') throw new TypeError('Zły tryb transakcji.');
      const tx = new Transakcja(this, lista, tryb, false);
      this._tx.add(tx);
      st.transakcje.add(tx);
      this._baza.harmonogram.push(tx);
      mikro(() => { tik(() => { dezaktywuj(tx); }); });
      harmonogramuj(this._baza);
      return tx;
    }
    createObjectStore(nazwa, opcje = {}) {
      const tx = this._upgrade;
      if (!tx || tx._stan === 'finished') throw blad('InvalidStateError', 'Sklep można utworzyć tylko w onupgradeneeded.');
      wymagajAktywnej(tx);
      const keyPath = opcje && opcje.keyPath !== undefined ? opcje.keyPath : null;
      if (keyPath !== null && !poprawnaSciezka(keyPath)) throw blad('SyntaxError', 'Zła ścieżka klucza.');
      if (this._baza.sklepy.has(nazwa)) throw blad('ConstraintError', 'Sklep już istnieje.');
      if (opcje && opcje.autoIncrement) throw new Error('atrapa IndexedDB: autoIncrement nie jest obsługiwany');
      const s = nowySklep(String(nazwa), Array.isArray(keyPath) ? keyPath.slice() : keyPath);
      this._baza.sklepy.set(s.nazwa, s);
      return uchwytSklepu(tx, s);
    }
    deleteObjectStore(nazwa) {
      const tx = this._upgrade;
      if (!tx || tx._stan === 'finished') throw blad('InvalidStateError', 'Sklep można usunąć tylko w onupgradeneeded.');
      wymagajAktywnej(tx);
      const s = this._baza.sklepy.get(nazwa);
      if (!s) throw blad('NotFoundError', 'Nie ma takiego sklepu.');
      this._baza.sklepy.delete(nazwa);
      s.usuniety = true;
    }
    close() {
      if (this._zamykane) return;
      this._zamykane = true;
      loguj(['close', this._baza.nazwa]);
      if (!this._tx.size) zamknijPolaczenie(this);
    }
  }
  atrybutyZdarzen(Polaczenie, ['versionchange', 'close', 'abort', 'error']);
  function zamknijPolaczenie(p) {
    if (p._zamkniete) return;
    p._zamkniete = true;
    p._zamykane = true;
    st.polaczenia.delete(p);
    sprawdzOczekujace();
  }

  // ── Kolejka open / deleteDatabase na nazwę bazy ────────────────────────────────────────────────────────────────────
  function kolejka(nazwa) {
    if (!st.kolejki.has(nazwa)) st.kolejki.set(nazwa, { elementy: [], biezacy: null });
    return st.kolejki.get(nazwa);
  }
  function doKolejki(nazwa, start) {
    kolejka(nazwa).elementy.push(start);
    makro(() => { nastepny(nazwa); });
  }
  function nastepny(nazwa) {
    const k = kolejka(nazwa);
    if (k.biezacy || !k.elementy.length) return;
    k.biezacy = k.elementy.shift();
    k.biezacy(() => { k.biezacy = null; makro(() => { nastepny(nazwa); }); });
  }
  // Zanim zmiana wersji albo kasowanie ruszy: versionchange do otwartych połączeń, ewentualnie blocked, czekanie na
  // zamknięcie wszystkich (połączenie zamykane z transakcją w toku jest zamknięte dopiero po jej końcu).
  function wymagajZamkniecia(baza, stara, nowa, z, dalej) {
    czekaj(() => ![...st.transakcje].some((t) => t._baza === baza && t._stan === 'committing'), () => {
      const otwarte = [...st.polaczenia].filter((p) => p._baza === baza && !p._zamkniete);
      if (!otwarte.length) { dalej(); return; }
      let zignorowane = otwarte.some((p) => p._zamykane);
      const doWyslania = otwarte.filter((p) => !p._zamykane);
      let i = 0;
      const poWyslaniu = () => {
        if (zignorowane && otwarte.some((p) => !p._zamkniete)) {
          loguj(['blocked', baza.nazwa, stara, nowa]);
          wyslij([z], new Zdarzenie('blocked', { wersje: [stara, nowa] }));
        }
        czekaj(() => otwarte.every((p) => p._zamkniete), dalej);
      };
      const wyslijNastepny = () => {
        if (i >= doWyslania.length) { makro(poWyslaniu); return; }
        const p = doWyslania[i];
        i += 1;
        if (!p._zamkniete) {
          if (p._zamykane) zignorowane = true;
          else {
            loguj(['versionchange', baza.nazwa, stara, nowa]);
            wyslij([p], new Zdarzenie('versionchange', { wersje: [stara, nowa] }));
            if (!p._zamykane) zignorowane = true;
          }
        }
        makro(wyslijNastepny);
      };
      makro(wyslijNastepny);
    });
  }
  function bladZadania(z, b) {
    z._gotowe = true;
    z._wynik = undefined;
    z._blad = b;
    z.transaction = null;
    wyslij([z], new Zdarzenie('error', { bubbles: true, cancelable: true }));
  }
  function procesOtwarcia(z, nazwa, wersja, koniec) {
    const krok = () => {
      const u = usterka({ przy: 'open', baza: nazwa });
      if (u && u.zdarzenie === 'blocked') {
        const b0 = st.bazy.get(nazwa);
        const w0 = b0 ? b0.wersja : 0;
        loguj(['blocked', nazwa, w0, wersja === undefined ? Math.max(w0, 1) : wersja]);
        wyslij([z], new Zdarzenie('blocked', { wersje: [w0, wersja === undefined ? Math.max(w0, 1) : wersja] }));
      } else if (u) { bladZadania(z, blad(u.blad, 'Usterka atrapy przy otwarciu.')); koniec(); return; }
      let baza = st.bazy.get(nazwa);
      const nowa = !baza;
      const docelowa = wersja === undefined ? (baza ? baza.wersja : 1) : wersja;
      if (baza && docelowa < baza.wersja) { bladZadania(z, blad('VersionError', 'Żądana wersja jest niższa od istniejącej.')); koniec(); return; }
      if (baza && docelowa === baza.wersja) {
        const pol = new Polaczenie(baza, baza.wersja);
        z._gotowe = true;
        z._wynik = pol;
        loguj(['success', nazwa, pol.version]);
        wyslij([z], new Zdarzenie('success'));
        koniec();
        return;
      }
      if (!baza) { baza = nowaBaza(nazwa); st.bazy.set(nazwa, baza); }
      const stara = nowa ? 0 : baza.wersja;
      const b = baza;
      wymagajZamkniecia(b, stara, docelowa, z, () => { zmianaWersji(z, b, stara, docelowa, koniec); });
    };
    if (!zatrzymaj({ przy: 'open', baza: nazwa }, krok)) krok();
  }
  function zmianaWersji(z, baza, stara, docelowa, koniec) {
    const migawka = migawkaBazy(baza);
    const pol = new Polaczenie(baza, docelowa);
    baza.wersja = docelowa;
    const tx = new Transakcja(pol, [], 'versionchange', true);
    tx._migawka = migawka;
    pol._upgrade = tx;
    pol._tx.add(tx);
    st.transakcje.add(tx);
    z._gotowe = true;
    z._wynik = pol;
    z.transaction = tx;
    tx._poKoncu = (przerwana) => {
      if (przerwana) {
        loguj(['abort-upgrade', baza.nazwa]);
        pol._wersja = migawka.utworzona ? migawka.wersja : 0;
        pol._zamykane = true;
        makro(() => { bladZadania(z, blad('AbortError', 'Zmiana wersji przerwana.')); koniec(); });
        return;
      }
      baza.utworzona = true;
      makro(() => {
        z.transaction = null;
        if (pol._zamykane) { bladZadania(z, blad('AbortError', 'Połączenie zamknięte przed końcem zmiany wersji.')); koniec(); return; }
        loguj(['success', baza.nazwa, docelowa]);
        wyslij([z], new Zdarzenie('success'));
        koniec();
      });
    };
    loguj(['upgrade', baza.nazwa, stara, docelowa]);
    tx._rozpoczeta = true;
    const rzucil = wyslij([z], new Zdarzenie('upgradeneeded', { wersje: [stara, docelowa] }));
    mikro(() => {
      tik(() => {
        if (tx._stan === 'active') tx._stan = 'inactive';
        if (rzucil) przerwij(tx, blad('AbortError', 'Wyjątek w onupgradeneeded.'));
        else dalejTx(tx);
      });
    });
  }
  function procesKasowania(z, nazwa, koniec) {
    const krok = () => {
      const u = usterka({ przy: 'deleteDatabase', baza: nazwa });
      const baza = st.bazy.get(nazwa);
      if (u && u.zdarzenie === 'blocked') {
        loguj(['blocked', nazwa, baza ? baza.wersja : 0, null]);
        wyslij([z], new Zdarzenie('blocked', { wersje: [baza ? baza.wersja : 0, null] }));
      } else if (u) { bladZadania(z, blad(u.blad, 'Usterka atrapy przy kasowaniu.')); koniec(); return; }
      const sukces = (stara) => {
        loguj(['delete-success', nazwa]);
        z._gotowe = true;
        z._wynik = undefined;
        wyslij([z], new Zdarzenie('success', { wersje: [stara, null] }));
        koniec();
      };
      if (!baza) { sukces(0); return; }
      wymagajZamkniecia(baza, baza.wersja, null, z, () => {
        if (st.bazy.get(nazwa) === baza) st.bazy.delete(nazwa);
        sukces(baza.wersja);
      });
    };
    if (!zatrzymaj({ przy: 'deleteDatabase', baza: nazwa }, krok)) krok();
  }

  // ── Obiekt fabryki ─────────────────────────────────────────────────────────────────────────────────────────────────
  function kopiujBazy(cel) {
    for (const b of st.bazy.values()) {
      if (!b.utworzona) continue;
      const n = nowaBaza(b.nazwa);
      n.wersja = b.wersja;
      n.utworzona = true;
      for (const [nazwa, s] of b.sklepy) {
        const k = nowySklep(nazwa, Array.isArray(s.keyPath) ? s.keyPath.slice() : s.keyPath);
        for (const [ni, d] of s.indeksy) k.indeksy.set(ni, Object.assign({}, d));
        k.wiersze = s.wiersze.map((w) => ({ k: klon(w.k), v: klon(w.v) }));
        n.sklepy.set(nazwa, k);
      }
      cel.bazy.set(n.nazwa, n);
    }
  }
  const sterowanie = {
    get log() { return st.log; },
    get wyjatki() { return st.wyjatki; },
    usterka(wz) {
      if (!wz || !wz.przy || (!wz.blad && wz.zdarzenie !== 'blocked')) throw new Error('atrapa IndexedDB: usterka wymaga pól przy i blad');
      const u = { wz, uzyta: 0 };
      st.usterki.push(u);
      return { odwolaj() { const i = st.usterki.indexOf(u); if (i >= 0) st.usterki.splice(i, 1); }, get uzyta() { return u.uzyta; } };
    },
    wstrzymaj(wz) {
      if (!wz || !wz.przy) throw new Error('atrapa IndexedDB: wstrzymaj wymaga pola przy');
      const w = { wz, osiagniety: false, zwolniony: false, dalej: null, osiagnij: null };
      const czeka = new Promise((ok) => { w.osiagnij = ok; });
      st.wstrzymania.push(w);
      return {
        czeka,
        get osiagniety() { return w.osiagniety; },
        zwolnij() {
          if (w.zwolniony) return;
          w.zwolniony = true;
          const i = st.wstrzymania.indexOf(w);
          if (i >= 0) st.wstrzymania.splice(i, 1);
          if (w.dalej) { const d = w.dalej; w.dalej = null; makro(d); }
        },
      };
    },
    hak(wz, fn) {
      if (!wz || wz.przy !== 'success' || typeof fn !== 'function') throw new Error('atrapa IndexedDB: hak wymaga { przy: "success" } i funkcji');
      const h = { wz, fn, wywolany: 0 };
      st.haki.push(h);
      return { rozbroj() { const i = st.haki.indexOf(h); if (i >= 0) st.haki.splice(i, 1); }, get wywolany() { return h.wywolany; } };
    },
    wymusZamkniecie(nazwa) {
      for (const p of [...st.polaczenia]) {
        if (p._baza.nazwa !== nazwa || p._zamkniete) continue;
        loguj(['forced-close', nazwa]);
        p._zamykane = true;
        for (const t of [...p._tx]) przerwij(t, blad('UnknownError', 'Połączenie z bazą zerwane.'));
        if (!p._tx.size) zamknijPolaczenie(p);
        makro(() => { wyslij([p], new Zdarzenie('close')); });
      }
    },
    bazy() {
      const out = {};
      for (const b of [...st.bazy.values()].sort((x, y) => (x.nazwa < y.nazwa ? -1 : 1))) {
        if (!b.utworzona) continue;
        const sklepy = {};
        for (const s of [...b.sklepy.values()].sort((x, y) => (x.nazwa < y.nazwa ? -1 : 1))) {
          const indeksy = {};
          for (const d of [...s.indeksy.values()].sort((x, y) => (x.nazwa < y.nazwa ? -1 : 1))) indeksy[d.nazwa] = { keyPath: klon(d.keyPath), unique: d.unique };
          sklepy[s.nazwa] = { keyPath: klon(s.keyPath), indeksy, wiersze: s.wiersze.map((w) => klon(w.v)), klucze: s.wiersze.map((w) => klon(w.k)) };
        }
        out[b.nazwa] = { version: b.wersja, sklepy };
      }
      return out;
    },
    utworz(nazwa, wersja, schemat = {}, wiersze = {}) {
      if (st.bazy.has(nazwa)) throw new Error('atrapa IndexedDB: baza ' + nazwa + ' już istnieje');
      const b = nowaBaza(nazwa);
      b.wersja = wersja;
      b.utworzona = true;
      for (const [n, d] of Object.entries(schemat)) {
        const s = nowySklep(n, d.keyPath === undefined ? null : klon(d.keyPath));
        for (const [ni, di] of Object.entries(d.indeksy || {})) s.indeksy.set(ni, { nazwa: ni, keyPath: klon(di.keyPath), unique: !!di.unique, multiEntry: false });
        b.sklepy.set(n, s);
      }
      const bezTx = { _upgrade: true, _kopie: new Map() };
      for (const [n, lista] of Object.entries(wiersze)) {
        const s = b.sklepy.get(n);
        if (!s) throw new Error('atrapa IndexedDB: brak sklepu ' + n + ' w schemacie');
        for (const x of lista) {
          const v = klon(s.keyPath === null ? x[1] : x);
          const k = s.keyPath === null ? klucz(x[0]) : naKlucz(wartoscSciezki(v, s.keyPath));
          if (k === BRAK) throw new Error('atrapa IndexedDB: wiersz bez klucza w sklepie ' + n);
          zapisz(bezTx, s, k, v, true);
        }
      }
      st.bazy.set(nazwa, b);
    },
    klonuj() {
      const nowa = utworzIndexedDB();
      nowa.__atrapa._kopiujZ(kopiujBazy);
      return nowa;
    },
    _kopiujZ(kopiuj) { kopiuj(st); },
    polaczenia(nazwa) {
      return [...st.polaczenia].filter((p) => !p._zamykane && (nazwa == null || (nazwa instanceof RegExp ? nazwa.test(p._baza.nazwa) : p._baza.nazwa === nazwa))).length;
    },
    wToku() { return st.transakcje.size; },
    niezwolnione() { return st.wstrzymania.length; },
  };
  return {
    open(nazwa, wersja) {
      const n = String(nazwa);
      let w;
      if (wersja !== undefined) {
        const x = Number(wersja);
        if (!Number.isFinite(x)) throw new TypeError('Wersja bazy musi być liczbą.');
        w = Math.trunc(x);
        if (w < 1 || w > Number.MAX_SAFE_INTEGER) throw new TypeError('Wersja bazy musi być liczbą całkowitą ≥ 1.');
      }
      loguj(['open', n, w === undefined ? null : w]);
      const z = new ZadanieOtwarcia();
      doKolejki(n, (koniec) => { procesOtwarcia(z, n, w, koniec); });
      return z;
    },
    deleteDatabase(nazwa) {
      const n = String(nazwa);
      loguj(['deleteDatabase', n]);
      const z = new ZadanieOtwarcia();
      doKolejki(n, (koniec) => { procesKasowania(z, n, koniec); });
      return z;
    },
    databases() {
      loguj(['databases']);
      return new Promise((ok, zle) => {
        const dalej = () => {
          makro(() => {
            const u = usterka({ przy: 'databases' });
            if (u) { zle(blad(u.blad, 'Usterka atrapy przy databases().')); return; }
            ok([...st.bazy.values()].filter((b) => b.utworzona).map((b) => ({ name: b.nazwa, version: b.wersja }))
              .sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0)));
          });
        };
        if (!zatrzymaj({ przy: 'databases' }, dalej)) dalej();
      });
    },
    cmp(a, b) { return porownaj(klucz(a), klucz(b)); },
    __atrapa: sterowanie,
  };
}
