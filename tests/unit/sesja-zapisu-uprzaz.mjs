// P-SESJA-ZAPISU — wspólna uprząż testów sesji zapisu (PR-S): zapis karty, okna zapisu, pobranie z chmury i emisje
// scalania kończą się w sesji, w której ruszyły. Uprząż niczego nie sprawdza sama — daje urządzenie z dwoma kontami,
// rejestry i haki, a asercje zostają w plikach testów. Dane wyłącznie FIKCYJNE („Testowy Jan”, „Fikcyjna Lekarka”).
//
// Prawdziwe vilda_crypto.js, vilda_retention.js i vilda_vault.js (opcjonalnie vilda_sync.js) przez
// tests/support/load-browser-script.mjs, każde okno osobno; automatyczna retencja wyłączona (vildaRetention = '0');
// Error.stackTraceLimit = 100 (haki rozpoznają miejsce po NAZWIE funkcji sejfu w stosie wywołań, nie po numerze wiersza).
// Czekanie wyłącznie na zdarzenia i obietnice (kolejka blokady, pytanie okna, hak, brama) — bez stałych odczekań.
//
// EKSPORTY
//   repo, zrodlo(plik), wytnijFunkcje(src, nazwa)
//       Korzeń repozytorium (worktree, w którym leży plik), tekst pliku (pamięć podręczna) i wycięcie funkcji po nazwie:
//       `function nazwa(`, `async function nazwa(` albo `nazwa = [async] function(` — od słowa function do domykającej
//       klamry (pomija napisy, komentarze, szablony i wyrażenia regularne). Brak funkcji: wyjątek.
//   HASLO_A, HASLO_B, naglowek(i, { wzrost, masa, dob, pomiary })
//       Fikcyjne hasła kont i nagłówek pacjenta „Testowy Jan<i>” (dob: null — bez daty urodzenia; pomiary: [[mies.,
//       wzrost], …] → advanced.data.measurements).
//   ZAPIS, NA_KONCIE
//       Wzorce metod magazynu: zapisy (put/remove/write/delete/update/commit/wipe) i metody z kontem w 1. argumencie.
//   wynik(obietnica) → Promise<{ ok: true, w } | { ok: false, kod, komunikat, e }>
//   atrapaLocks(ctx?) — atrapa navigator.locks: request(nazwa, [opcje], cb) z ifAvailable, signal (AbortError), mode
//       ('exclusive' | 'shared'); query(); zadania (rejestr żądań: { nr, nazwa, tryb, ifAvailable, sygnal, test, sesja,
//       nrSesji, wynik: 'przyznana' | 'w-kolejce' | 'zajeta' | 'przerwana' }); trzymaj(nazwa) → Promise<{ zwolnij() }>
//       („inna karta” trzyma blokadę do zwolnij(), które oddaje obietnicę zwolnienia); zajeta(nazwa), czekajacych(nazwa),
//       czekajNaKolejke(nazwa, n = 1), czekajNaZadanie(gdy, { od }) → Promise; zwolnijWszystkie() → Promise.
//   atrapaKrypto(ctx?) — crypto z subtle owiniętym Proxy: log ({ nr, metoda, sesja, nrSesji } każdego wywołania
//       subtle), haki jak w magazynie (po, przed, wstrzymaj, blad, obserwuj, rozbroj).
//   atrapaTimerow() — setTimeout/clearTimeout okna z rejestrem: oczekujace() → [{ id, ms }], czekajNa(gdy) → Promise
//       (timer o danym czasie zlecony), odpal(gdy) → liczba odpalonych teraz timerów, wyczysc().
//   magazynZRejestrem(baza, ctx?) — Proxy na adapterze w pamięci: wyw ([metoda, userId] każdego wywołania), wywPelne
//       ({ nr, metoda, userId, argumenty, sesja, nrSesji, wPrzelaczeniu }), haki (po, przed, wstrzymaj, blad, obserwuj).
//   okno(opcje) → { win, timery, locks, krypto, dziennik }
//       Okno przeglądarki z prawdziwymi skryptami. opcje: locks (false — bez navigator.locks), krypto (false — zwykłe
//       crypto), skrypty (lista plików; domyślnie SKRYPTY_SEJFU: crypto, retention, vault), dokument, navigator, dodatki,
//       ctx. dziennik — zapisy localStorage/sessionStorage ({ nr, magazyn, op, klucz, sesja, nrSesji }); dodatki — pola okna.
//   urzadzenie(opcje) → Promise<d>
//       Konto B (zablokowane) i konto A (zalogowane) na JEDNYM magazynie w pamięci z rejestrem. opcje: chmura (A
//       w trybie 'cloud-only'), chmuraB, locks, krypto, dokument, navigator, dodatki, skrypty.
//   atrapaChmury() → { fetch, sloty, log, wstrzymaj(gdy), wgrajKonto(d, { etag }) }
//       Serwer synchronizacji w pamięci (register, status, blob GET/PUT, changes, delta, entitlement). log: { nr, metoda,
//       slot, sciezka }. wstrzymaj(gdy) → { osiagnieta: Promise<wpis>, zwolnij() } — żądanie czeka na zwolnienie.
//       wgrajKonto(d) — ładunek bieżącej sesji zaszyfrowany kluczem synchronizacji konta do jego slotu.
//   ADRES_CHMURY, zaladujSync(d, { fetch }) — prawdziwy vilda_sync.js w oknie urządzenia; fetch przez vi.stubGlobal.
//   KLUCZ_SESJI_CHMURY — klucz sessionStorage części sesyjnej trybu chmurowego (stanSesjiChmury urządzenia).
//   sprzatnij() → Promise — po teście (afterEach): vi.unstubAllGlobals(), haki, timery i blokady wszystkich urządzeń.
//
// URZĄDZENIE d
//   d.win, d.v (VildaVault), d.baza (surowy adapter — odczyt bez rejestru), d.magazyn, d.locks, d.krypto, d.timery,
//   d.dziennik, d.A / d.B ({ userId, haslo }), d.wyw, d.wywPelne, d.zdarzenia ({ nr, typ, sesja, nrSesji, dane }:
//   patientSaved, patientDeleted, patientNoteChanged, noteChanged, patientListChanged, credentialChanged,
//   preferenceChanged), d.pytania ({ nr, okno, sesja, nrSesji }), d.przelaczenia (znaczniki), d.nrSesji().
//   d.kto(userId) → 'A' | 'B' | null | userId;  d.sesja() → konto bieżącej sesji (null — sejf zablokowany).
//   d.znacznik() → { wyw, krypto, locks, zdarzenia, pytania, dziennik } (długości rejestrów).
//   d.po(z = ostatnie przełączenie) → { wyw, wywKto, zapisy, bezKonta, krypto, locks, zdarzenia, pytania, dziennik }
//       — wszystko po znaczniku (locks: żądania sejfu, bez żądań testu).
//   d.przelacz(wariant, { powod }) → Promise<znacznik>
//       'B' (blokada + zalogowanie B), 'A' (blokada + ponowne zalogowanie A — nowa sesja), 'blokada' (sama blokada,
//       domyślnie lock('idle')). Znacznik liczy się od końca logowania: wywołania w trakcie logowania należą do
//       logowania (znacznik.start — stan przed blokadą; wywPelne[i].wPrzelaczeniu). Znacznik trafia do d.przelaczenia.
//   d.zaloguj(kto) — blokada i zalogowanie konta (bez wpisu w d.przelaczenia), np. powrót do A po scenariuszu.
//   d.przelaczPo(dopasowanie, wariant, opcje) / d.przelaczWKrypto(dopasowanie, wariant, opcje) → uchwyt haka
//       Przełączenie raz, zaraz po zakończeniu pasującej operacji magazynu / crypto.subtle; operacja oddaje wynik
//       dopiero po przełączeniu. uchwyt: { gotowe: Promise<znacznik>, zrobione, rozbroj() }.
//   d.oknoTozsamosci(opcje) / d.oknoKonfliktu(opcje) → uchwyt okna
//       setPatientIdentityResolver / setSaveConflictResolver z pytaniem wstrzymanym do odpowiedzi testu. uchwyt:
//       { pytania, czekaj(n = 1) → Promise<pytanie>, odpowiedz(x), zamknij() }; pytanie: { nr, info, sesja, nrSesji,
//       odpowiedziano, odpowiedz(x) }. opcje.odpowiedz — odpowiedź od razu (wartość albo funkcja info → wartość).
//   d.trwaly(kto) → Promise<{ karty, wersje, nagrobki, notatki, listy }> — magazyn trwały konta (surowy adapter, bez
//       wpisów w rejestrze).
//   d.kartaTrwala(kto, patientId) → Promise<{ jest, wersje }>.
//   d.stanSesjiChmury() → { A: { karty, wersje }, B: … } | null — część sesyjna trybu chmurowego (po odpaleniu
//       zaległych zapisów stanu, timery 0 ms).
//   d.zapisySesyjne(z = ostatnie przełączenie) → liczba utrwaleń części sesyjnej po znaczniku (odpala timery 0 ms).
//       TRYB CHMUROWY: karty, wersje, nagrobki kart, notatki pacjenta i listy idą do części sesyjnej, której rejestr
//       magazynu NIE widzi (widzi tylko magazyn trwały: rejestr kont, metadane konta, notatki biblioteki). Po
//       ponownym zalogowaniu A w trybie chmurowym zapisy kart sprawdza się przez d.zapisySesyjne(z), d.po(z).krypto,
//       d.po(z).zdarzenia albo odczyt przez API w nowej sesji — d.po(z).wyw ich nie pokaże.
//   d.zamknij() → Promise — zwolnienie haków, timerów i blokad tego urządzenia.
//
// DOPASOWANIE (haki magazynu i krypto)
//   'metoda' | /wzorzec/ | funkcja (metoda, argumenty, stos) → bool | { metoda, ktory (1 = pierwsze pasujące od
//   uzbrojenia), konto ('A' | 'B' | userId — 1. argument; tylko magazyn), wStosie, bezStosu (napis albo RegExp),
//   gdy (metoda, argumenty, stos) → bool }. Hak odpala raz (blad: opcja staly — za każdym razem).
//   po(dop, akcja) — akcja po zakończeniu operacji, przed oddaniem wyniku; przed(dop, akcja) — przed wykonaniem;
//   wstrzymaj(dop) → { osiagnieta: Promise<{ metoda, argumenty }>, zwolnij(), zrobione } — operacja czeka;
//   blad(dop, { staly, komunikat, kod }) — operacja kończy się błędem bez wykonania (kod: pole code błędu);
//   obserwuj(fn) — każde wywołanie.
//   Uchwyt haka: { gotowe: Promise<wynik akcji>, zrobione, rozbroj() }.
import { vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

Error.stackTraceLimit = 100;

export const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const KOD = {};
export function zrodlo(plik) {
  if (!KOD[plik]) KOD[plik] = readFileSync(path.join(repo, plik), 'utf8');
  return KOD[plik];
}

// ── Wycinanie funkcji ze źródła ──────────────────────────────────────────────────────────────────────────────────────
const PRZED_REGEXEM = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^']);
function koniecNapisu(src, i, q) {
  for (let k = i + 1; k < src.length; k += 1) {
    if (src[k] === '\\') { k += 1; continue; }
    if (src[k] === q) return k;
  }
  return src.length;
}
function koniecSzablonu(src, i) {
  for (let k = i + 1; k < src.length; k += 1) {
    if (src[k] === '\\') { k += 1; continue; }
    if (src[k] === '`') return k;
    if (src[k] === '$' && src[k + 1] === '{') k = domknij(src, k + 1);
  }
  return src.length;
}
function koniecRegexu(src, i) {
  let klasa = false;
  for (let k = i + 1; k < src.length; k += 1) {
    const c = src[k];
    if (c === '\\') { k += 1; continue; }
    if (c === '\n') return i; // to nie był regex
    if (klasa) { if (c === ']') klasa = false; continue; }
    if (c === '[') klasa = true;
    else if (c === '/') return k;
  }
  return i;
}
// Indeks klamry domykającej otwartą w `i` (src[i] === '{' albo '(').
function domknij(src, i) {
  const otw = src[i];
  const zam = otw === '{' ? '}' : ')';
  let glebokosc = 0;
  let ostatni = '';
  for (let k = i; k < src.length; k += 1) {
    const c = src[k];
    if (c === '"' || c === "'") { k = koniecNapisu(src, k, c); ostatni = 'a'; continue; }
    if (c === '`') { k = koniecSzablonu(src, k); ostatni = 'a'; continue; }
    if (c === '/' && src[k + 1] === '/') { const n = src.indexOf('\n', k); k = n < 0 ? src.length : n; continue; }
    if (c === '/' && src[k + 1] === '*') { const n = src.indexOf('*/', k + 2); k = n < 0 ? src.length : n + 1; continue; }
    if (c === '/' && PRZED_REGEXEM.has(ostatni)) { const n = koniecRegexu(src, k); if (n > k) { k = n; ostatni = 'a'; continue; } }
    if (c === otw) glebokosc += 1;
    else if (c === zam) { glebokosc -= 1; if (!glebokosc) return k; }
    if (!/\s/.test(c)) ostatni = /[A-Za-z0-9_$]/.test(c) ? 'a' : c;
  }
  throw new Error('nie domknięto nawiasu od pozycji ' + i);
}
export function wytnijFunkcje(src, nazwa) {
  const n = nazwa.replace(/\$/g, '\\$');
  const wzorce = [new RegExp(`(?:async\\s+)?function\\s+${n}\\s*\\(`), new RegExp(`(?<![A-Za-z0-9_$.])${n}\\s*=\\s*((?:async\\s+)?function\\s*\\()`)];
  for (const [j, re] of wzorce.entries()) {
    const m = re.exec(src);
    if (!m) continue;
    const od = j === 0 ? m.index : m.index + m[0].length - m[1].length;
    const nawias = src.indexOf('(', od);
    const cialo = src.indexOf('{', domknij(src, nawias));
    return src.slice(od, domknij(src, cialo) + 1);
  }
  throw new Error(`nie ma funkcji ${nazwa}`);
}

// ── Dane fikcyjne ────────────────────────────────────────────────────────────────────────────────────────────────────
export const HASLO_A = 'KontoA#SesjaZapisu!2026aa';
export const HASLO_B = 'KontoB#SesjaZapisu!2026bb';
export function naglowek(i, { wzrost = 120, masa = 22, dob = '2016-03-12', pomiary = null } = {}) {
  const p = { name: `Testowy Jan${i}`, user: { lastName: 'Testowy', firstName: `Jan${i}`, sex: 'M', height: wzrost, weight: masa } };
  if (dob) p.user.dobISO = dob;
  if (pomiary) p.advanced = { data: { measurements: pomiary.map(([ageMonths, height]) => ({ ageMonths, height, weight: 20 })) } };
  return p;
}

export const ZAPIS = /^(put|remove|write|delete|update|commit|wipe)/;
export const NA_KONCIE = /ForUser$|^(getUserMeta|putUserMeta|deleteUserDatabase)$/;
export function wynik(obietnica) {
  return Promise.resolve(obietnica).then(
    (w) => ({ ok: true, w }),
    (e) => ({ ok: false, kod: (e && e.code) || null, komunikat: String((e && e.message) || e), e }),
  );
}

const BEZ_KONTEKSTU = { kto: () => null, nrSesji: () => 0, wPrzelaczeniu: () => false, kontoId: (x) => x };
const cicho = { log() {}, info() {}, warn() {}, error() {}, debug() {} };
const pasujeTekst = (wz, s) => (wz instanceof RegExp ? wz.test(s) : s.includes(String(wz)));

// ── Haki (wspólne dla magazynu i crypto.subtle) ──────────────────────────────────────────────────────────────────────
function normalizuj(dop) {
  if (typeof dop === 'function') return { gdy: dop };
  if (typeof dop === 'string' || dop instanceof RegExp) return { metoda: dop };
  return dop || {};
}
function zestawHakow(ctx) {
  const haki = [];
  const obserwatorzy = [];
  function pasuje(wz, metoda, args, stos) {
    if (wz.metoda != null && !(wz.metoda instanceof RegExp ? wz.metoda.test(metoda) : wz.metoda === metoda)) return false;
    if (wz.konto != null && args[0] !== wz.konto && args[0] !== ctx.kontoId(wz.konto)) return false;
    if (wz.wStosie != null && !pasujeTekst(wz.wStosie, stos)) return false;
    if (wz.bezStosu != null && pasujeTekst(wz.bezStosu, stos)) return false;
    if (wz.gdy && !wz.gdy(metoda, args, stos)) return false;
    return true;
  }
  function uzbroj(rodzaj, dop, akcja, opcje = {}) {
    let rozwiaz, odrzuc;
    const gotowe = new Promise((res, rej) => { rozwiaz = res; odrzuc = rej; });
    gotowe.catch(() => {});
    const h = {
      rodzaj, wz: normalizuj(dop), akcja, staly: !!opcje.staly, komunikat: opcje.komunikat, kod: opcje.kod, aktywny: true, licznik: 0,
      zrobione: false,
      async odpal(info) {
        h.zrobione = true;
        try { const w = akcja ? await akcja(info) : undefined; rozwiaz(w); return w; } catch (e) { odrzuc(e); throw e; }
      },
    };
    haki.push(h);
    return { gotowe, get zrobione() { return h.zrobione; }, rozbroj() { h.aktywny = false; } };
  }
  function wykonaj(metoda, args, uruchom) {
    const czynne = haki.filter((h) => h.aktywny);
    if (!czynne.length && !obserwatorzy.length) return uruchom();
    const stos = String(new Error().stack);
    for (const o of obserwatorzy) o(metoda, args, stos);
    const trafione = [];
    for (const h of czynne) {
      if (!pasuje(h.wz, metoda, args, stos)) continue;
      h.licznik += 1;
      if (h.staly || h.licznik === (h.wz.ktory || 1)) { trafione.push(h); if (!h.staly) h.aktywny = false; }
    }
    if (!trafione.length) return uruchom();
    const info = { metoda, argumenty: args, stos };
    return (async () => {
      for (const h of trafione.filter((x) => x.rodzaj === 'przed')) await h.odpal(info);
      const blad = trafione.find((x) => x.rodzaj === 'blad');
      if (blad) {
        blad.odpal(info).catch(() => {});
        const e = new Error(blad.komunikat || `atrapa: ${metoda} nie powiodło się`);
        if (blad.kod) e.code = blad.kod;
        throw e;
      }
      const w = await uruchom();
      for (const h of trafione.filter((x) => x.rodzaj === 'po')) await h.odpal({ ...info, wynik: w });
      return w;
    })();
  }
  return {
    wykonaj,
    po: (dop, akcja) => uzbroj('po', dop, akcja),
    przed: (dop, akcja) => uzbroj('przed', dop, akcja),
    blad: (dop, opcje = {}) => uzbroj('blad', dop, null, opcje),
    wstrzymaj(dop) {
      let osiagnietaR, zwolnijR;
      const osiagnieta = new Promise((r) => { osiagnietaR = r; });
      const brama = new Promise((r) => { zwolnijR = r; });
      const u = uzbroj('przed', dop, (info) => { osiagnietaR({ metoda: info.metoda, argumenty: info.argumenty }); return brama; });
      return { osiagnieta, zwolnij: () => zwolnijR(), get zrobione() { return u.zrobione; }, rozbroj: u.rozbroj };
    },
    obserwuj(fn) { obserwatorzy.push(fn); },
    rozbroj() { for (const h of haki) h.aktywny = false; obserwatorzy.length = 0; },
  };
}

// ── Atrapa Web Locks ─────────────────────────────────────────────────────────────────────────────────────────────────
export function atrapaLocks(ctx = BEZ_KONTEKSTU) {
  const stan = new Map();
  const zadania = [];
  const czekajacy = new Set();
  const nazwa = (n) => { if (!stan.has(n)) stan.set(n, { trzymajacy: [], kolejka: [] }); return stan.get(n); };
  const wolna = (s, tryb) => (tryb === 'shared' ? s.trzymajacy.every((t) => t.tryb === 'shared') : s.trzymajacy.length === 0);
  const powiadom = () => { for (const c of [...czekajacy]) if (c.sprawdz()) czekajacy.delete(c); };
  function przyznaj(n, s, wpis) {
    const uchwyt = { tryb: wpis.tryb };
    s.trzymajacy.push(uchwyt);
    const w = Promise.resolve().then(() => wpis.cb({ name: n, mode: wpis.tryb }));
    const zwolnij = () => {
      const i = s.trzymajacy.indexOf(uchwyt);
      if (i >= 0) s.trzymajacy.splice(i, 1);
      while (s.kolejka.length && wolna(s, s.kolejka[0].tryb)) { const nast = s.kolejka.shift(); nast.start(); }
      powiadom();
    };
    w.then(zwolnij, zwolnij);
    return w;
  }
  function request(n, opcje, cb) {
    if (typeof opcje === 'function') { cb = opcje; opcje = {}; }
    opcje = opcje || {};
    const tryb = opcje.mode === 'shared' ? 'shared' : 'exclusive';
    const wpis = {
      nr: zadania.length, nazwa: String(n), tryb, ifAvailable: !!opcje.ifAvailable, sygnal: !!opcje.signal,
      test: !!opcje.__test, sesja: ctx.kto(), nrSesji: ctx.nrSesji(), wynik: null, cb,
    };
    zadania.push(wpis);
    const s = nazwa(wpis.nazwa);
    const blad = () => { const e = new Error('Żądanie blokady przerwane.'); e.name = 'AbortError'; return e; };
    let p;
    if (opcje.signal && opcje.signal.aborted) { wpis.wynik = 'przerwana'; p = Promise.reject(blad()); }
    else if (wolna(s, tryb) && !s.kolejka.length) { wpis.wynik = 'przyznana'; p = przyznaj(wpis.nazwa, s, wpis); }
    else if (wpis.ifAvailable) { wpis.wynik = 'zajeta'; p = Promise.resolve().then(() => cb(null)); }
    else {
      wpis.wynik = 'w-kolejce';
      p = new Promise((resolve, reject) => {
        const w = { tryb, start: () => { wpis.wynik = 'przyznana'; przyznaj(wpis.nazwa, s, wpis).then(resolve, reject); } };
        s.kolejka.push(w);
        if (opcje.signal) {
          opcje.signal.addEventListener('abort', () => {
            const i = s.kolejka.indexOf(w);
            if (i < 0) return;
            s.kolejka.splice(i, 1);
            wpis.wynik = 'przerwana';
            reject(blad());
            powiadom();
          });
        }
      });
    }
    powiadom();
    return p;
  }
  function czekaj(sprawdz) {
    return new Promise((r) => {
      const c = { sprawdz: () => { const w = sprawdz(); if (w === undefined || w === false) return false; r(w); return true; } };
      if (!c.sprawdz()) czekajacy.add(c);
    });
  }
  const trzymane = new Set();
  return {
    request,
    zadania,
    query: async () => ({
      held: [...stan.entries()].flatMap(([n, s]) => s.trzymajacy.map((t) => ({ name: n, mode: t.tryb }))),
      pending: [...stan.entries()].flatMap(([n, s]) => s.kolejka.map((k) => ({ name: n, mode: k.tryb }))),
    }),
    zajeta: (n) => nazwa(n).trzymajacy.length > 0,
    czekajacych: (n) => nazwa(n).kolejka.length,
    czekajNaKolejke: (n, ile = 1) => czekaj(() => nazwa(n).kolejka.length >= ile || undefined),
    czekajNaZadanie(gdy, { od = 0 } = {}) {
      const g = typeof gdy === 'string' ? (z) => z.nazwa === gdy : gdy instanceof RegExp ? (z) => gdy.test(z.nazwa) : gdy;
      return czekaj(() => zadania.slice(od).find((z) => !z.test && g(z)));
    },
    trzymaj(n, { tryb } = {}) {
      let pusc, przyznano;
      const trzymana = new Promise((r) => { pusc = r; });
      const przyznana = new Promise((r) => { przyznano = r; });
      const uchwyt = { zwolnij: null };
      const p = request(n, { mode: tryb, __test: true }, () => { przyznano(uchwyt); return trzymana; });
      uchwyt.zwolnij = () => { trzymane.delete(uchwyt); pusc(); return p.then(() => {}); };
      trzymane.add(uchwyt);
      return przyznana;
    },
    zwolnijWszystkie() { return Promise.all([...trzymane].map((u) => u.zwolnij())).then(() => {}); },
  };
}

// ── Atrapa crypto (subtle z hakami) ──────────────────────────────────────────────────────────────────────────────────
export function atrapaKrypto(ctx = BEZ_KONTEKSTU) {
  const prawdziwe = globalThis.crypto.subtle;
  const log = [];
  const haki = zestawHakow(ctx);
  const subtle = new Proxy(prawdziwe, {
    get(cel, k) {
      const f = cel[k];
      if (typeof f !== 'function') return f;
      const metoda = String(k);
      return function (...a) {
        log.push({ nr: log.length, metoda, sesja: ctx.kto(), nrSesji: ctx.nrSesji() });
        return haki.wykonaj(metoda, a, () => f.apply(cel, a));
      };
    },
  });
  const crypto = {
    subtle,
    getRandomValues: (x) => globalThis.crypto.getRandomValues(x),
    randomUUID: () => globalThis.crypto.randomUUID(),
  };
  return { crypto, log, po: haki.po, przed: haki.przed, wstrzymaj: haki.wstrzymaj, blad: haki.blad, obserwuj: haki.obserwuj, rozbroj: haki.rozbroj };
}

// ── Timery okna ──────────────────────────────────────────────────────────────────────────────────────────────────────
export function atrapaTimerow() {
  const oczek = new Map();
  const czekajacy = new Set();
  let nr = 0;
  const opis = (t) => ({ id: t.id, ms: t.ms });
  return {
    setTimeout(fn, ms, ...a) {
      nr += 1;
      const t = { id: nr, ms: Number(ms) || 0, fn: typeof fn === 'function' ? fn : () => {}, a, h: null };
      t.h = setTimeout(() => { oczek.delete(t.id); t.fn(...t.a); }, t.ms);
      oczek.set(t.id, t);
      for (const c of [...czekajacy]) if (c.gdy(opis(t))) { czekajacy.delete(c); c.r(opis(t)); }
      return t.id;
    },
    clearTimeout(id) { const t = oczek.get(id); if (t) { clearTimeout(t.h); oczek.delete(id); } },
    oczekujace: () => [...oczek.values()].map(opis),
    czekajNa(gdy) {
      const istniejacy = [...oczek.values()].map(opis).find(gdy);
      if (istniejacy) return Promise.resolve(istniejacy);
      return new Promise((r) => { czekajacy.add({ gdy, r }); });
    },
    odpal(gdy = () => true) {
      const lista = [...oczek.values()].filter((t) => gdy(opis(t)));
      for (const t of lista) { clearTimeout(t.h); oczek.delete(t.id); t.fn(...t.a); }
      return lista.length;
    },
    wyczysc() { for (const t of oczek.values()) clearTimeout(t.h); oczek.clear(); czekajacy.clear(); },
  };
}

// ── Magazyn w pamięci z rejestrem wywołań ────────────────────────────────────────────────────────────────────────────
function kontoZArgumentow(a) {
  if (typeof a[0] === 'string') return a[0];
  if (a[0] && typeof a[0] === 'object' && typeof a[0].userId === 'string') return a[0].userId;
  return null;
}
export function magazynZRejestrem(baza, ctx = BEZ_KONTEKSTU) {
  const wyw = [];
  const wywPelne = [];
  const haki = zestawHakow(ctx);
  const adapter = new Proxy(baza, {
    get(cel, k) {
      const f = cel[k];
      if (typeof f !== 'function') return f;
      const metoda = String(k);
      return function (...a) {
        const userId = kontoZArgumentow(a);
        wyw.push([metoda, userId]);
        wywPelne.push({ nr: wywPelne.length, metoda, userId, argumenty: a, sesja: ctx.kto(), nrSesji: ctx.nrSesji(), wPrzelaczeniu: ctx.wPrzelaczeniu() });
        return haki.wykonaj(metoda, a, () => f.apply(cel, a));
      };
    },
  });
  return { adapter, wyw, wywPelne, po: haki.po, przed: haki.przed, wstrzymaj: haki.wstrzymaj, blad: haki.blad, obserwuj: haki.obserwuj, rozbroj: haki.rozbroj };
}

// ── Okno przeglądarki ────────────────────────────────────────────────────────────────────────────────────────────────
function magazynPrzegladarki(nazwa, dziennik, ctx) {
  const m = Object.create(null);
  const zapisz = (op, klucz) => dziennik.push({ nr: dziennik.length, magazyn: nazwa, op, klucz, sesja: ctx.kto(), nrSesji: ctx.nrSesji() });
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); zapisz('set', String(k)); },
    removeItem: (k) => { delete m[k]; zapisz('remove', String(k)); },
    clear: () => { for (const k of Object.keys(m)) delete m[k]; zapisz('clear', null); },
    key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
    klucze: () => Object.keys(m),
  };
}
export const SKRYPTY_SEJFU = ['vilda_crypto.js', 'vilda_retention.js', 'vilda_vault.js'];
export function okno(opcje = {}) {
  const ctx = opcje.ctx || BEZ_KONTEKSTU;
  const timery = atrapaTimerow();
  const locks = opcje.locks === false ? null : (opcje.locks || atrapaLocks(ctx));
  const krypto = opcje.krypto === false ? null : (opcje.krypto || atrapaKrypto(ctx));
  const dziennik = [];
  const win = {
    crypto: krypto ? krypto.crypto : globalThis.crypto,
    TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: magazynPrzegladarki('localStorage', dziennik, ctx),
    sessionStorage: magazynPrzegladarki('sessionStorage', dziennik, ctx),
    setTimeout: timery.setTimeout, clearTimeout: timery.clearTimeout, setInterval: () => 0, clearInterval() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    document: opcje.dokument || { addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; }, hidden: false, readyState: 'complete' },
    location: { hostname: 'localhost', origin: 'http://localhost', pathname: '/index.html', href: 'http://localhost/index.html' },
    navigator: Object.assign({}, opcje.navigator, locks ? { locks } : {}),
    AbortController,
    console: cicho,
    ...opcje.dodatki,
  };
  win.window = win; win.self = win; win.top = win;
  win.localStorage.setItem('vildaRetention', '0');
  for (const plik of opcje.skrypty || SKRYPTY_SEJFU) loadBrowserScript(plik, win);
  dziennik.length = 0;
  return { win, timery, locks, krypto, dziennik };
}

// ── Urządzenie: dwa konta na jednym magazynie ────────────────────────────────────────────────────────────────────────
export const KLUCZ_SESJI_CHMURY = 'veph:cloud-only:per-user-v1';
const ZDARZENIA = [
  ['patientSaved', 'onPatientSaved'], ['patientDeleted', 'onPatientDeleted'], ['patientNoteChanged', 'onPatientNoteChanged'],
  ['noteChanged', 'onNoteChanged'], ['patientListChanged', 'onPatientListChanged'], ['credentialChanged', 'onCredentialChanged'],
  ['preferenceChanged', 'onPreferenceChanged'],
];
const urzadzenia = new Set();
let licznikUrzadzen = 0;

function oknoPytan(d, rodzaj, ustaw, opcje = {}) {
  const pytania = [];
  const czekajacy = new Set();
  const u = {
    pytania,
    czekaj(n = 1) {
      if (pytania.length >= n) return Promise.resolve(pytania[n - 1]);
      return new Promise((r) => { czekajacy.add({ n, r }); });
    },
    odpowiedz(x) {
      const p = pytania.find((q) => !q.odpowiedziano);
      if (!p) throw new Error(`okno ${rodzaj}: brak pytania bez odpowiedzi`);
      p.odpowiedz(x);
    },
    zamknij() { ustaw(null); },
  };
  ustaw((info) => {
    const p = { nr: pytania.length + 1, info, sesja: d.sesja(), nrSesji: d.nrSesji(), odpowiedziano: false, odpowiedz: null };
    d.pytania.push({ nr: d.pytania.length, okno: rodzaj, sesja: p.sesja, nrSesji: p.nrSesji });
    const obietnica = new Promise((res) => { p.odpowiedz = (x) => { p.odpowiedziano = true; res(x); }; });
    pytania.push(p);
    for (const c of [...czekajacy]) if (pytania.length >= c.n) { czekajacy.delete(c); c.r(pytania[c.n - 1]); }
    if (opcje.odpowiedz !== undefined) p.odpowiedz(typeof opcje.odpowiedz === 'function' ? opcje.odpowiedz(info) : opcje.odpowiedz);
    return obietnica;
  });
  return u;
}

export async function urzadzenie(opcje = {}) {
  licznikUrzadzen += 1;
  const nr = licznikUrzadzen;
  const stan = { nrSesji: 0, wPrzelaczeniu: false };
  const A = { userId: null, haslo: HASLO_A };
  const B = { userId: null, haslo: HASLO_B };
  const kto = (u) => (u == null ? null : u === A.userId ? 'A' : u === B.userId ? 'B' : u);
  let v = null;
  const sesja = () => { const u = v && v.getCurrentUser(); return u ? kto(u.userId) : null; };
  const ctx = { kto: sesja, nrSesji: () => stan.nrSesji, wPrzelaczeniu: () => stan.wPrzelaczeniu, kontoId: (k) => (k === 'A' ? A.userId : k === 'B' ? B.userId : k) };
  const o = okno({ ...opcje, ctx });
  v = o.win.VildaVault;
  const baza = v.createInMemoryAdapter();
  const magazyn = magazynZRejestrem(baza, ctx);
  v.setStorageAdapter(magazyn.adapter);
  const tryb = (chmura) => (chmura ? { storageMode: 'cloud-only' } : {});
  B.userId = (await v.createUser(HASLO_B, { label: `Fikcyjny Lekarz B${nr}`, iterations: 1000, ...tryb(opcje.chmuraB) })).userId;
  stan.nrSesji += 1;
  v.lock('manual');
  stan.nrSesji += 1;
  A.userId = (await v.createUser(HASLO_A, { label: `Fikcyjna Lekarka A${nr}`, iterations: 1000, ...tryb(opcje.chmura) })).userId;
  stan.nrSesji += 1;

  const d = {
    win: o.win, v, baza, magazyn, locks: o.locks, krypto: o.krypto, timery: o.timery, dziennik: o.dziennik, A, B,
    wyw: magazyn.wyw, wywPelne: magazyn.wywPelne, zdarzenia: [], pytania: [], przelaczenia: [],
    kto, sesja, nrSesji: () => stan.nrSesji,
  };
  for (const [typ, api] of ZDARZENIA) {
    v[api]((dane) => d.zdarzenia.push({ nr: d.zdarzenia.length, typ, sesja: sesja(), nrSesji: stan.nrSesji, dane }));
  }
  const nazwaKonta = (u) => { const k = kto(u); return k == null ? 'null' : k === 'A' || k === 'B' ? k : String(k).slice(0, 8); };
  d.znacznik = () => ({
    wyw: d.wywPelne.length, krypto: d.krypto ? d.krypto.log.length : 0, locks: d.locks ? d.locks.zadania.length : 0,
    zdarzenia: d.zdarzenia.length, pytania: d.pytania.length, dziennik: d.dziennik.length,
  });
  d.po = (z = d.przelaczenia[d.przelaczenia.length - 1]) => {
    if (!z) throw new Error('po(): brak znacznika (nie było przełączenia)');
    const w = d.wywPelne.slice(z.wyw);
    return {
      wyw: w.map((x) => [x.metoda, x.userId]),
      wywKto: w.map((x) => `${x.metoda}(${nazwaKonta(x.userId)})`),
      zapisy: w.filter((x) => ZAPIS.test(x.metoda)).map((x) => `${x.metoda}(${nazwaKonta(x.userId)})`),
      bezKonta: w.filter((x) => NA_KONCIE.test(x.metoda) && !x.userId).map((x) => x.metoda),
      krypto: d.krypto ? d.krypto.log.slice(z.krypto).map((x) => x.metoda) : [],
      locks: d.locks ? d.locks.zadania.slice(z.locks).filter((x) => !x.test).map((x) => x.nazwa) : [],
      zdarzenia: d.zdarzenia.slice(z.zdarzenia),
      pytania: d.pytania.slice(z.pytania),
      dziennik: d.dziennik.slice(z.dziennik),
    };
  };
  async function zmienSesje(wariant, powod) {
    if (!['A', 'B', 'blokada'].includes(wariant)) throw new Error(`nieznany wariant przełączenia: ${wariant}`);
    stan.wPrzelaczeniu = true;
    try {
      v.lock(powod || (wariant === 'blokada' ? 'idle' : 'manual'));
      stan.nrSesji += 1;
      if (wariant !== 'blokada') {
        const k = wariant === 'A' ? A : B;
        await v.unlockUser(k.userId, k.haslo);
        stan.nrSesji += 1;
      }
    } finally { stan.wPrzelaczeniu = false; }
  }
  d.przelacz = async (wariant = 'B', { powod } = {}) => {
    const start = d.znacznik();
    await zmienSesje(wariant, powod);
    const z = { ...d.znacznik(), wariant, start, sesja: sesja(), nrSesji: stan.nrSesji };
    d.przelaczenia.push(z);
    return z;
  };
  d.zaloguj = async (k) => { await zmienSesje(k); return d.znacznik(); };
  d.przelaczPo = (dop, wariant = 'B', op = {}) => magazyn.po(dop, () => d.przelacz(wariant, op));
  d.przelaczWKrypto = (dop, wariant = 'B', op = {}) => {
    if (!d.krypto) throw new Error('urządzenie bez atrapy krypto');
    return d.krypto.po(dop, () => d.przelacz(wariant, op));
  };
  d.oknoTozsamosci = (op) => oknoPytan(d, 'tozsamosc', (f) => v.setPatientIdentityResolver(f), op);
  d.oknoKonfliktu = (op) => oknoPytan(d, 'konflikt', (f) => v.setSaveConflictResolver(f), op);
  d.trwaly = async (k) => {
    const uid = ctx.kontoId(k);
    const db = ((baza._peek() || {}).userDbs || []).find(([u]) => u === uid);
    const ile = async (metoda) => ((await baza[metoda](uid)) || []).length;
    return {
      karty: db ? db[1].patientCount : 0, wersje: db ? db[1].snapshotCount : 0, nagrobki: await ile('listTombstonesForUser'),
      notatki: await ile('listPatientNotesForUser'), listy: await ile('listPatientListsForUser'),
    };
  };
  d.kartaTrwala = async (k, patientId) => {
    const uid = ctx.kontoId(k);
    const karta = await baza.getPatientForUser(uid, patientId);
    const wersje = await baza.listSnapshotsForUser(uid, patientId);
    return { jest: !!karta, wersje: (wersje || []).length };
  };
  d.stanSesjiChmury = () => {
    d.timery.odpal((t) => t.ms === 0);
    const surowy = d.win.sessionStorage.getItem(KLUCZ_SESJI_CHMURY);
    if (!surowy) return null;
    const st = JSON.parse(surowy);
    const wynikStanu = {};
    for (const [uid, x] of st.userDbs || []) wynikStanu[nazwaKonta(uid)] = { karty: (x.patients || []).length, wersje: (x.snapshots || []).length };
    return wynikStanu;
  };
  // Zapisy części sesyjnej trybu chmurowego po znaczniku: sejf utrwala ją w sessionStorage (KLUCZ_SESJI_CHMURY) timerem
  // 0 ms po każdej zmianie — najpierw odpalamy zaległe timery 0 ms, potem liczymy wpisy dziennika.
  d.zapisySesyjne = (z = d.przelaczenia[d.przelaczenia.length - 1]) => {
    if (!z) throw new Error('zapisySesyjne(): brak znacznika (nie było przełączenia)');
    d.timery.odpal((t) => t.ms === 0);
    return d.dziennik.slice(z.dziennik).filter((x) => x.magazyn === 'sessionStorage' && x.op === 'set' && x.klucz === KLUCZ_SESJI_CHMURY).length;
  };
  d.zamknij = async () => {
    urzadzenia.delete(d);
    magazyn.rozbroj();
    if (d.krypto) d.krypto.rozbroj();
    d.timery.wyczysc();
    if (d.locks) await d.locks.zwolnijWszystkie();
    d.timery.wyczysc();
  };
  urzadzenia.add(d);
  return d;
}

// ── Chmura (atrapa serwera synchronizacji) i vilda_sync.js ───────────────────────────────────────────────────────────
export const ADRES_CHMURY = 'https://atrapa-synchronizacji.invalid';
export function atrapaChmury() {
  const sloty = new Map();
  const log = [];
  const bramy = [];
  let licznik = 0;
  const json = (status, cialo) => new Response(status === 204 ? null : JSON.stringify(cialo || {}), { status, headers: { 'content-type': 'application/json' } });
  const bajty = async (body) => new Uint8Array(await new Response(body).arrayBuffer());
  async function fetchAtrapa(url, init = {}) {
    const u = new URL(String(url));
    const metoda = String(init.method || 'GET').toUpperCase();
    const m = u.pathname.match(/\/slots\/([^/]+)(\/.*)?$/);
    const slot = m ? decodeURIComponent(m[1]) : null;
    const sciezka = m ? (m[2] || '/') : u.pathname;
    const wpis = { nr: log.length, metoda, slot, sciezka };
    log.push(wpis);
    const brama = bramy.find((b) => !b.uzyta && b.gdy(wpis));
    if (brama) { brama.uzyta = true; brama.osiagnietaR(wpis); await brama.brama; }
    const s = slot ? sloty.get(slot) : null;
    if (sciezka === '/register' && metoda === 'POST') {
      if (s) return json(409, {});
      licznik += 1;
      sloty.set(slot, { body: await bajty(init.body), etag: `r${licznik}` });
      return json(201, { etag: `r${licznik}` });
    }
    if (sciezka === '/status') return s ? json(200, { etag: s.etag, size: s.body.byteLength, lastModified: '2026-10-29T08:00:00.000Z' }) : json(404, {});
    if (sciezka === '/blob' && metoda === 'GET') {
      if (!s) return json(404, {});
      return new Response(s.body, { status: 200, headers: { ETag: `"${s.etag}"`, 'Content-Length': String(s.body.byteLength), 'content-type': 'application/octet-stream' } });
    }
    if (sciezka === '/blob' && metoda === 'PUT') {
      licznik += 1;
      sloty.set(slot, { body: await bajty(init.body), etag: `p${licznik}` });
      return json(200, { etag: `p${licznik}` });
    }
    if (sciezka === '/changes') return json(200, { deltas: [], headSeq: 0 });
    if (sciezka === '/delta') return json(204);
    if (sciezka === '/entitlement') return json(200, { plan: 'free' });
    return json(404, {});
  }
  return {
    fetch: fetchAtrapa,
    sloty,
    log,
    wstrzymaj(gdy) {
      const g = typeof gdy === 'function' ? gdy : (w) => Object.entries(gdy || {}).every(([k, x]) => (x instanceof RegExp ? x.test(String(w[k])) : w[k] === x));
      let osiagnietaR, zwolnijR;
      const osiagnieta = new Promise((r) => { osiagnietaR = r; });
      const brama = new Promise((r) => { zwolnijR = r; });
      bramy.push({ gdy: g, uzyta: false, osiagnietaR, brama });
      return { osiagnieta, zwolnij: () => zwolnijR() };
    },
    // Ładunek bieżącej sesji urządzenia (iv 12 B || AES-GCM kluczem synchronizacji konta) jako blob jego slotu.
    async wgrajKonto(d, { etag } = {}) {
      const mat = await d.v.getSyncMaterial();
      const jawne = new TextEncoder().encode(JSON.stringify(await d.v.exportSyncPayload()));
      const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
      const szyfr = new Uint8Array(await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, mat.syncEncKey, jawne));
      const body = new Uint8Array(12 + szyfr.length);
      body.set(iv, 0); body.set(szyfr, 12);
      licznik += 1;
      sloty.set(mat.slotId, { body, etag: etag || `w${licznik}` });
      return { slotId: mat.slotId, etag: sloty.get(mat.slotId).etag };
    },
  };
}
export function zaladujSync(d, { fetch } = {}) {
  d.win.VILDA_SYNC_WORKER_URL = ADRES_CHMURY;
  vi.stubGlobal('fetch', fetch || (() => Promise.reject(new Error('atrapa: brak sieci'))));
  loadBrowserScript('vilda_sync.js', d.win);
  d.sync = d.win.VildaSync;
  return d.sync;
}

export async function sprzatnij() {
  vi.unstubAllGlobals();
  await Promise.all([...urzadzenia].map((d) => d.zamknij()));
}
