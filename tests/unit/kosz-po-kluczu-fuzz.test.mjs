// P-KOSZ-PO-KLUCZU (PR-E3) — fuzz wielu kart: trzy urządzenia, co najmniej trzy żywe karty z kilkoma wizytami i dwa
// niezależne łańcuchy „Scal pacjentów” na dwóch różnych urządzeniach (propozycja §5.6, ryzyko 6: wersja wspólna dwóm
// kartom, rekord złożony W3 z rev + 1, wpis kosza pod inną kartą niż wersja). Prawdziwy vilda_vault.js na P, K i C,
// magazyny w pamięci z licznikiem zapisów, sztuczny zegar (vi.useFakeTimers({ toFake: ['Date'] })), dane fikcyjne
// („Testowy Jan”, „Testowa Ola”). Własny generator (mulberry32; test nie używa Math.random): ziarno wyznacza kroki,
// identyfikatory i IV szyfru (crypto.getRandomValues okna urządzenia) oraz Math.random sejfu (Bpp_chwilaZmiany przy
// zegarze spóźnionym) — przebieg ziarna jest powtarzalny. Domyślnie 13 ziaren z DOMYSLNE (ok. 1 s na ziarno);
// KPK_FUZZ_ZIARNA=N — ziarna KPK_FUZZ_START (domyślnie 1) … START+N−1; KPK_FUZZ_WYNIKI=plik — wynik każdego ziarna
// (dziennik kroków, naruszenia, pełny stan) dopisywany jako JSONL (pomiar; bez zmiennej nic się nie zapisuje).
//
// Program ziarna. Przygotowanie na K: „Testowy Jan” J1 (3 wizyty), J2 (2), J3 (3) i „Testowa Ola” O1 (3), O2 (2), O3
// (3), wizyty w dwóch dniach (retencja z recentHours: 0 zostawia ostatnią wizytę dnia i przypięte); komplet na P i C.
// 18 losowych kroków co 1–3 min na losowym urządzeniu: wymiana z innym urządzeniem, poprawka masy, gwiazdka albo
// odpięcie, kosz („Odepnij i usuń”), retencja karty, nowa wizyta, „Przywróć” z kosza, „Scal pacjentów” dwóch kart
// (karty łańcuchów — dopiero po swoim łańcuchu); cel kroku w połowie przypadków spośród wizyt kart J1, J2 i O1; co
// czwarty krok na zegarze przesuniętym (+10 min, −4 min, +1,5 min). Wplecione w losowych miejscach dwa łańcuchy na
// dwóch różnych urządzeniach: J1 → J2 → J3 i O1 → O2 (żywe zostają J3, O2 i O3). Potem 2–4 losowe pierwsze scalenia,
// 3 rundy pełnej wymiany w losowym porządku 6 par, pomiar, runda kontrolna z licznikiem zapisów i drugi pomiar.
// Historia: po każdym kroku i każdej wymianie stan wersji na urządzeniu, które się zmieniło (karta, chwila zmiany,
// treść, chwila treści, rejestr gwiazdki), i nagrobki pacjentów (z magazynu).
//
// Prawa (każde ziarno, każde urządzenie):
//   Z1 stabilność — runda kontrolna nie zmienia pełnego stanu (karty i wersje z rev, chwilami i treścią, kosz, nagrobki
//      wersji i pacjentów) i nie zapisuje listy nagrobków, wersji ani kart.
//   Z2 zbieżność kosza — ten sam kosz na P, K i C: wizyta, karta wpisu, treść, gwiazdka, chwila usunięcia.
//   Z3 bez zguby — każda wersja, którą kiedykolwiek widziano w karcie (wizyty i głowy „Scal pacjentów”), jest na każdym
//      urządzeniu (a) w karcie, (b) w koszu z treścią, (c) pod tutejszym nagrobkiem retencji, który ją pokonuje
//      (ostatnie przycięcie nie wcześniej niż każda znana zmiana, ostatni rejestr gwiazdki nie przypięty), albo (d)
//      karta jej najnowszego stanu (ostatnia obserwacja z najpóźniejszą chwilą zmiany) miała kiedykolwiek nagrobek
//      pacjenta nie wcześniejszy niż ta chwila, a w historii wersji nie ma kosza ani przycięcia. (d) to klasa sprzed E3:
//      D-4 A — „Scal pacjentów” na urządzeniu, które wizyty nie znało, usuwa kartę z wersjami sprzed nagrobka, także
//      gdy karta wraca potem z nowszą wizytą (przegląd E3, „small random fuzz”). Wersja z koszem albo przycięciem
//      w historii, która ginie z kartą od nagrobka pacjenta (E4a-ret, E4a-ret-pin i to samo w drugą stronę — klasy
//      np-ret i np-ret-A1), to od Bsw_przezyteRetencji naruszenie Z3: wersja, która wygrywa z przycięciem, idzie za
//      scaleniem (dotąd: P-KOSZ-USUWANEJ-KARTY przenosiła tylko wygraną kosza, retencja nie robi cienia karty usuwanej
//      — decyzja 1 z 2026-10-26).
//   Z4 bez wskrzeszenia — wersja, której ostatni kosz nie jest wcześniejszy niż każda znana zmiana (wszystkie
//      urządzenia, wszystkie kroki), nie zostaje w karcie; tak samo po ostatniej retencji bez przypięcia; i w samym
//      stanie: wersja w karcie obok tutejszego nagrobka kosza nie wcześniejszego niż jej chwila zmiany — za każdym
//      razem poza jedyną wersją karty (wyjątek ostatniej wersji karty: E1, Q8).
//   Z5 bez starej treści — wersja w karcie i w koszu naraz nie ma w karcie starszej treści (chwila treści) niż w koszu.
//   Z6 zbieżność kart — te same karty i wersje (treść, gwiazdka) na P, K i C poza wersjami, które leżą w koszu z
//      treścią na każdym urządzeniu (kosz-po-2), i wersjami, które każde urządzenie, które je ma, trzyma jako jedyną
//      wersję karty obok swojego nagrobka tej wersji (wyjątek ostatniej wersji: E1, kosz-po-2 i to samo przy retencji).
//   Z7 W3 — wersja w karcie ma najnowszą treść, jaką kiedykolwiek miała (najpóźniejsza chwila treści), i gwiazdkę
//      z najpóźniejszego rejestru (bez jawnego rejestru — bez gwiazdki); wzorcem nie jest stan, który przepadł zgodnie
//      z regułami: jego karta miała nagrobek pacjenta nie wcześniejszy niż jego chwila zmiany (D-4 A, E4a-ret — jak
//      Z3 (d)) albo retencja nie wcześniejsza niż ta chwila przycięła tę wersję (nagrobek retencji nie niesie treści,
//      cień jest tylko tutejszy, D4 = a; późniejsza gwiazdka na starszej kopii z innego urządzenia zostawia wersję ze
//      starszą treścią).
//
// Dlaczego prawa trzymają w znanych ograniczeniach (ALGORITHMS: P-KOSZ-PO-KLUCZU, P-KOSZ-USUWANEJ-KARTY):
//   E1 (obecność) — dwa urządzenia dają offline do kosza różne wizyty jedynej pary; każde zostawia inną jako ostatnią
//      wersję karty. Z2, Z3 (b): obie wizyty w koszu z treścią na trzech; Z4: zostaje tylko jedyna wersja karty; Z5,
//      Z7: zostawiona wersja przyjmuje najnowszą treść i rejestr (Q8, Bkz_zostawOstatnia); Z6: wyjątek ostatniej
//      wersji.
//   kosz-po-2 — wpis kosza wskazuje starą kartę X, jedno urządzenie zostaje z X[x], pozostałe mają nagrobek X: x jest
//      w koszu z tą samą treścią na trzech (Z2, Z3 (b), Z5), zostaje jako jedyna wersja X (Z4) albo jego zmiana jest
//      późniejsza niż usunięcie; Z6 — poza porównaniem. To samo przy retencji: jedyna wersja X pokonana nagrobkiem
//      retencji zostaje w X tam, gdzie X przetrwało (Z3 (c), Z4, Z6 — wyjątek).
//   E4a-kp — kosz x w X, późniejsza poprawka x w X na urządzeniu bez wiedzy, potem „Scal pacjentów” X: w koszu
//      zostaje starsza treść, x nie wraca do karty. Z2 i Z3 (b): x w koszu z treścią na trzech; Z4, Z5, Z7: x nie ma
//      w żadnej karcie.
//   E4a-ret w drugą stronę (klasa np-ret-A1, ziarna 168 i 198) i E4a-ret-pin (klasa np-ret, ziarna 91, 125, 196, 255,
//      293) — od Bsw_przezyteRetencji naruszenie Z3, nie wyjątek (d): urządzenie bez wiedzy o scaleniu przycina
//      retencją x w starej X (albo urządzenie scalające przycina kopię pod kartą docelową), inne bez wiedzy przypina x
//      w X albo poprawia x później niż to przycięcie, K scala X → Y. Bez tej reguły (E3 bez np-ret-A1) w kolejności, w której K dostaje
//      retencję przed gwiazdką albo poprawką, A1 usuwał na K kopię x spod Y (dla K pokonaną), a stan wygrywający ginął
//      razem z X (nagrobek scalenia) — x nie było nigdzie (na 8240e0df rozjazd: K ze starą x bez gwiazdki). Teraz na
//      początku fazy przeniesień wersja karty ze zbioru N, która wygrywa ze swoim wpisem retencji, przechodzi pod kartę
//      docelową.
//
// Pomiar (ziarna 1–300, KPK_FUZZ_ZIARNA=300, ten sam plik na każdym kodzie; ok. 1 s na ziarno):
//   E3 bez reguły np-ret-A1 — 0 ziaren z naruszeniem. Z3 (wizyta × urządzenie): karta 15202, kosz z treścią 1528 (243 ziarna),
//      retencja 1858 (211), (d) D-4 A 177 (48), E4a-ret 15 (5), w drugą stronę 6 (2). Widok kart różny między
//      urządzeniami w 13 ziarnach (pełny stan w 14) — tylko wyjątek ostatniej wersji karty: E1 (170), kosz-po-2 (38,
//      43, 50, 122, 177, 253, 280; wpis pod inną kartą, karta żywa na K i C — 192) i to samo przy retencji (164, 168,
//      203, 295); runda kontrolna bez zmian i bez zapisów w 300 z 300.
//   E3 z regułą np-ret-A1 (Bsw_przezyteRetencji) — 0 ziaren z naruszeniem przy np-ret i np-ret-A1 jako naruszeniach
//      Z3 (dotąd 15 w 5 i 6 w 2 ziarnach): karta 15223, kosz z treścią 1528, retencja 1858, D-4 A 177 (48); widok kart
//      różny w tych samych 13 ziarnach; inny wynik niż bez tej reguły tylko w 7 ziarnach np-ret i np-ret-A1 — w każdym
//      wizyta w karcie na trzech z najnowszą treścią i gwiazdką.
//   8240e0df — 206 ziaren z naruszeniem: Z4 141 (wersja zostaje w starej karcie mimo kosza, E4b), Z4 po retencji 119,
//      Z5 14, Z6 120, Z7 — treść 10, gwiazdka 8; Z3 — te same klasy (d): D-4 A 177 (48), E4a-ret 15 (5), w drugą
//      stronę 2 (1: 198 na P i C); widok kart różny w 207 ziarnach.
// Mutanty (vilda_vault.js E3 bez reguły np-ret-A1 z jedną zmianą, 59 mutantów z przeglądów E3 i z mutacje.md, w tym 4 zgrubne):
//   13 domyślnych ziaren zabija 14: A1 wyłączone (Bkz_gdzieIndziej), Bkz_usunZObcych nic nie usuwa, brak odszukania
//   dla karty wpisu bez wersji tutaj, Q8 wyłączone, Q8 tylko w pętli kart wyłączone, Q8 po Bpk_trescNowsza, Q8 bierze
//   kandydata z ładunku bez późniejszej chwili treści, Q8 bez rejestru gwiazdki nagrobka, A4 wyłączone, Bsw_rekord
//   zamiast Bsw_rekordW3 w Bsw_doF i w Bsw_poprawTresc, Bsw_rekordW3 bez tutejszej nowszej kopii, Bkz_obceKarty:
//   przypięta pod inną kartą nie ocalona przed retencją, wersja zmieniona po usunięciu liczona jako pokonana.
//   W ziarnach 1–100 te same oprócz kandydata z ładunku w Q8 (zabijają go tylko 164, 170 i 192). Nie zabija ani
//   w domyślnych, ani w 1–100 (45): strażników sesji (fuzz nie zmienia sesji), F2 (bez nieczytelnych wersji), F3
//   i wyjątku ostatniej wersji pod inną kartą (bez żywej karty docelowej z jedną wersją), delty (tylko pełne
//   scalenia), liczników, rev i chwil rekordu złożonego, kolejności zapisu listy i usunięcia, nagłówka po częściowym
//   usunięciu.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appendFileSync } from 'node:fs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { jan, ola } from './s4d7-wspolne.mjs';

// Domyślne ziarna (CI) z pomiaru 300 ziaren: 1, 15, 38, 48, 77, 87 — razem zabijają każdy mutant, który fuzz zabił
// w ziarnach 1–100 (nagłówek); 163, 164, 170, 192, 197, 198, 293 — po jednym przebiegu klas wyłączonych z praw:
// D-4 A z powrotem karty, kosz-po-2 przy retencji, E1, wpis pod inną kartą, Z7 (ii); 198 i 293 — E4a-ret w drugą
// stronę i E4a-ret-pin (od Bsw_przezyteRetencji naruszenia Z3, czerwone bez reguły np-ret-A1). Wszystkie poza 87 są czerwone
// na 8240e0df albo bez reguły np-ret-A1. Z KPK_FUZZ_ZIARNA — ziarna START…START+N−1.
const DOMYSLNE = [1, 15, 38, 48, 77, 87, 163, 164, 170, 192, 197, 198, 293];
const START = Number(process.env.KPK_FUZZ_START) || 1;
const ZIARNA = process.env.KPK_FUZZ_ZIARNA ? Array.from({ length: Number(process.env.KPK_FUZZ_ZIARNA) }, (_, i) => START + i) : DOMYSLNE;
const WYNIKI = process.env.KPK_FUZZ_WYNIKI || '';
const KROKI = 18;
const DEV = ['P', 'K', 'C'];

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

// Własny generator (mulberry32) — ziarno wyznacza kroki, identyfikatory i IV szyfru oraz Math.random sejfu.
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function makeStorage() {
  const m = Object.create(null);
  return {
    getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; }, key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
  };
}
// Licznik zapisów (tylko gdy licz.aktywny): lista nagrobków (putUserMeta ze zmienioną listą), wersje, karty.
function owin(baza, licz) {
  return new Proxy(baza, {
    get(cel, k) {
      const f = cel[k];
      if (typeof f !== 'function') return f;
      if (k === 'putUserMeta') {
        return async function (...a) {
          if (licz.aktywny) {
            const przed = JSON.stringify(((await cel.getUserMeta(a[0])) || {}).snapshotTombstones || null);
            if (przed !== JSON.stringify((a[1] && a[1].snapshotTombstones) || null)) licz.lista += 1;
          }
          return f.apply(cel, a);
        };
      }
      if (licz.aktywny && (k === 'putSnapshotForUser' || k === 'removeSnapshotForUser')) return function (...a) { licz.wersje += 1; return f.apply(cel, a); };
      if (licz.aktywny && (k === 'putPatientForUser' || k === 'removePatientForUser')) return function (...a) { licz.karty += 1; return f.apply(cel, a); };
      return function (...a) { return f.apply(cel, a); };
    },
  });
}
let licznikUrz = 0;
async function urzadzenie(nazwa, ziarno) {
  licznikUrz += 1;
  const los = rng(ziarno);
  const crypto = {
    subtle: globalThis.crypto.subtle,
    getRandomValues: (x) => {
      if (x instanceof Uint8Array && (x.length === 16 || x.length === 12)) { for (let i = 0; i < x.length; i += 1) x[i] = Math.floor(los() * 256); return x; }
      return globalThis.crypto.getRandomValues(x);
    },
    randomUUID: () => 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(los() * 16).toString(16)),
  };
  const win = {
    crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: makeStorage(), sessionStorage: makeStorage(),
    setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
    addEventListener() {}, removeEventListener() {}, AbortController,
    document: { addEventListener() {}, removeEventListener() {}, hidden: false },
    console: { log() {}, info() {}, warn() {}, error() {}, debug() {} },
  };
  win.window = win; win.self = win; win.top = win;
  win.localStorage.setItem('vildaRetention', '0'); // retencja tylko jawnie (krok programu)
  loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_retention.js', win);
  loadBrowserScript('vilda_vault.js', win);
  const v = win.VildaVault;
  const licz = { aktywny: false, lista: 0, wersje: 0, karty: 0 };
  const baza = v.createInMemoryAdapter();
  v.setStorageAdapter(owin(baza, licz));
  await v.createUser(`Kpk#Fuzz!2026${licznikUrz}aa`, { label: `${nazwa}${licznikUrz}`, iterations: 2000 });
  const [uz] = await v.listUsers();
  // Nagrobki pacjentów prosto z magazynu (bez odszyfrowania) — do historii nagrobków w obserwacji.
  v.__nagrobkiPacjentow = () => baza.listTombstonesForUser(uz.userId);
  v.__nazwa = nazwa; v.__licz = licz;
  return v;
}

// Sztuczny zegar: zegar — chwila programu; krok z rozjazdem zegara wykonuje się na zegarze przesuniętym o ms.
let zegar = 0;
const ustaw = (ms = 0) => vi.setSystemTime(zegar + ms);
async function naZegarze(ms, fn) { ustaw(ms); try { return await fn(); } finally { ustaw(0); } }
const kopia = (x) => JSON.parse(JSON.stringify(x));
async function sync(u, z, na, ms = 0) {
  const l = kopia(await u[z].exportSyncPayload());
  await naZegarze(ms, () => u[na].mergeSyncPayload(l));
  await obserwuj(u, na);
}

// --- przygotowanie --------------------------------------------------------------------------------------------------
// Na K: „Testowy Jan” J1 (3 wizyty), J2 (2), J3 (3) i „Testowa Ola” O1 (3), O2 (2), O3 (3); wizyty w dwóch dniach
// (retencja z recentHours: 0 zostawia ostatnią wersję każdego dnia i przypięte). Komplet na P i C.
const KARTY = [['J1', 3], ['J2', 2], ['J3', 3], ['O1', 3], ['O2', 2], ['O3', 3]];
const tresc = (rodzina, h, w) => (rodzina === 'O' ? ola(h, w) : jan(h, w));
async function przygotuj(u) {
  for (let i = 0; i < KARTY.length; i += 1) {
    const [lab, n] = KARTY[i];
    let pid = null;
    for (let j = 0; j < n; j += 1) {
      zegar = Date.parse('2026-10-10T08:00:00Z') + (j < 2 ? 0 : 864e5) + (i * 10 + j) * 60e3; ustaw();
      const r = await u.K.savePatient(tresc(lab[0], 100 + 5 * i + j, 20 + 3 * i + j), { dedup: false, ...(pid ? { patientId: pid } : {}) });
      pid = r.patientId;
      u.lab.set(r.snapshotId, `${lab}${'abc'[j]}`);
    }
    u.karta.set(pid, lab); u.pid[lab] = pid;
    if (lab === 'J1' || lab === 'J2' || lab === 'O1') for (const s of (await u.K.getPatient(pid)).snapshots) u.zrodlowe.add(s.snapshotId);
  }
  zegar = Date.parse('2026-10-14T09:00:00Z'); ustaw();
  await obserwuj(u, 'K');
  await sync(u, 'K', 'P'); await sync(u, 'K', 'C');
}

// --- obserwacja -----------------------------------------------------------------------------------------------------
const rejestr = (p) => (p && p._pinnedState && typeof p._pinnedState === 'object' ? p._pinnedState : null);
async function karty(v) {
  const o = [];
  for (const p of await v.listPatients()) { const pp = await v.getPatient(p.patientId); if (pp) o.push(pp); }
  return o;
}
// Historia każdej wersji: kolejne stany na każdym urządzeniu (karta, chwila zmiany, zapisu, rev, treść, rejestr).
async function obserwuj(u, n) {
  u.nr += 1;
  for (const t of (await u[n].__nagrobkiPacjentow()) || []) {
    if (t && t.patientId && typeof t.deletedAtISO === 'string' && !(u.nagrobkiP.get(t.patientId) >= t.deletedAtISO)) u.nagrobkiP.set(t.patientId, t.deletedAtISO);
  }
  for (const k of await karty(u[n])) {
    for (const s of k.snapshots) {
      const sid = s.snapshotId;
      if (!u.lab.has(sid)) u.lab.set(sid, `?${u.lab.size}`);
      const p = s.payload || null;
      const r = rejestr(p);
      const o = {
        pid: k.patientId, zm: s.updatedAtISO || s.savedAtISO || '', sav: s.savedAtISO || '', rev: s.rev || 0,
        h: p && p.user ? p.user.height : null, w: p && p.user ? p.user.weight : null, pin: !!s.pinned,
        rp: r ? !!r.pin : null, ra: r ? r.at || null : null, cz: p && typeof p._contentAtISO === 'string' ? p._contentAtISO : null,
      };
      const h = u.hist.get(sid) || [];
      const ost = [...h].reverse().find((x) => x.d === n);
      const j = JSON.stringify(o);
      if (!ost || ost.j !== j) h.push({ d: n, i: u.nr, j, ...o });
      u.hist.set(sid, h);
    }
  }
}
const L = (u, sid) => u.lab.get(sid) || `?${String(sid).slice(0, 4)}`;
const K = (u, pid) => u.karta.get(pid) || `?${String(pid).slice(0, 4)}`;
// Pełny stan urządzenia (etykiety zamiast identyfikatorów).
async function stan(u, n) {
  const v = u[n];
  const kk = (await karty(v)).map((k) => ({
    k: K(u, k.patientId), n: k.snapshotCount, last: k.lastSavedAtISO || null,
    w: k.snapshots.map((s) => {
      const p = s.payload || null; const r = rejestr(p);
      return {
        s: L(u, s.snapshotId), rev: s.rev || 0, zm: s.updatedAtISO || null, sav: s.savedAtISO || null,
        h: p && p.user ? p.user.height : null, w: p && p.user ? p.user.weight : null, pin: !!s.pinned,
        cz: p ? p._contentAtISO || null : null, rp: r ? !!r.pin : null, ra: r ? r.at || null : null,
      };
    }).sort((a, b) => (a.s < b.s ? -1 : a.s > b.s ? 1 : 0)),
  })).sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));
  const kosz = (await v.listTrashedSnapshots()).map((e) => ({
    s: L(u, e.snapshotId), k: K(u, e.patientId), del: e.deletedAtISO, pin: !!e.pinned,
    tresc: !!e.payload, h: e.payload && e.payload.user ? e.payload.user.height : null, w: e.payload && e.payload.user ? e.payload.user.weight : null,
    cz: e.payload ? e.payload._contentAtISO || null : null,
  })).sort((a, b) => (a.s < b.s ? -1 : a.s > b.s ? 1 : 0));
  const ex = await v.exportSyncPayload();
  const nagrW = (ex.snapshotTombstones || []).map((e) => ({
    s: L(u, e.snapshotId), k: K(u, e.patientId), powod: e.powod || 'kosz', del: e.deletedAtISO, przyc: e.przycietoISO || null,
    rev: e.rev || 0, zm: e.updatedAtISO || null, zmiana: e.zmianaISO || null, g: e.gwiazdka ? JSON.stringify(e.gwiazdka) : null,
    tresc: e.payload ? [e.payload.user && e.payload.user.height, e.payload.user && e.payload.user.weight, !!e.payload._pinned, e.payload._contentAtISO || null] : null,
  })).sort((a, b) => (a.s < b.s ? -1 : a.s > b.s ? 1 : 0));
  const nagrP = (ex.tombstones || []).map((t) => ({ k: K(u, t.patientId), del: t.deletedAtISO || null })).sort((a, b) => (a.k < b.k ? -1 : 1));
  return { karty: kk, kosz, nagrW, nagrP };
}
const widok = (s) => [
  s.karty.map((k) => `${k.k}[${k.w.map((w) => `${w.s}:${w.w}${w.pin ? '*' : ''}`).join(',')}]`).join(' '),
  s.kosz.length ? `kosz ${s.kosz.map((e) => `${e.s}@${e.k}:${e.w}${e.pin ? '*' : ''}`).join(',')}` : '',
  s.nagrP.length ? `nagr ${s.nagrP.map((t) => t.k).join(',')}` : '',
].filter(Boolean).join(' | ');

// --- kroki ----------------------------------------------------------------------------------------------------------
// Każdy krok losuje komplet liczb z góry (ten sam strumień niezależnie od gałęzi). Progi: wymiana 0,17, poprawka 0,18,
// gwiazdka albo odpięcie 0,12, kosz 0,14, retencja 0,08, nowa wizyta 0,08, „Przywróć” 0,08, „Scal pacjentów” 0,04,
// reszta — wymiana.
const ROZJAZD = [600e3, -240e3, 90e3];
async function krok(u, k, los, wymuszony) {
  const n = wymuszony ? wymuszony.n : DEV[Math.floor(los.dev * 3)];
  const v = u[n];
  const ms = los.zeg < 0.25 ? ROZJAZD[Math.floor(los.zr * 3)] : 0;
  const z = ms ? `@${ms > 0 ? '+' : ''}${ms / 60e3}m` : '';
  const kk = await karty(v);
  const wszystkie = kk.flatMap((c) => c.snapshots.map((s) => ({ pid: c.patientId, s, n: c.snapshots.length })));
  const zr = wszystkie.filter((x) => u.zrodlowe.has(x.s.snapshotId));
  const pula = zr.length && los.b < 0.5 ? zr : wszystkie;
  const cel = pula.length ? pula[Math.floor(los.a * pula.length)] : null;
  const x = wymuszony ? -1 : los.x;
  try {
    if (wymuszony) {
      const a = u.pid[wymuszony.z], b = u.pid[wymuszony.na];
      if (!kk.some((c) => c.patientId === a) || !kk.some((c) => c.patientId === b)) return `${n}:scal ${wymuszony.z}→${wymuszony.na}(brak)`;
      const przed = new Set(wszystkie.map((q) => q.s.snapshotId));
      await naZegarze(ms, () => v.mergePatients(a, b));
      for (const c of await karty(v)) for (const s of c.snapshots) if (!przed.has(s.snapshotId)) u.lab.set(s.snapshotId, `m${k}`);
      return `${n}:scal ${wymuszony.z}→${wymuszony.na}${z}`;
    }
    if (x < 0.17) {
      const zi = (DEV.indexOf(n) + 1 + Math.floor(los.c * 2)) % 3;
      await sync(u, DEV[zi], n, ms);
      return `${n}←${DEV[zi]}${z}`;
    }
    if (!cel) return `${n}:pusto`;
    const opis = `${K(u, cel.pid)}/${L(u, cel.s.snapshotId)}`;
    if (x < 0.35) {
      const kg = 30 + Math.floor(los.c * 60);
      await naZegarze(ms, () => v.updateSnapshotPayload(cel.pid, cel.s.snapshotId, { ...cel.s.payload, user: { ...cel.s.payload.user, weight: kg } }, { preserveSavedAt: true }));
      return `${n}:popraw ${opis}=${kg}${z}`;
    }
    if (x < 0.47) {
      await naZegarze(ms, () => v.setSnapshotPinned(cel.pid, cel.s.snapshotId, !cel.s.pinned));
      return `${n}:${cel.s.pinned ? 'odepnij' : 'gwiazdka'} ${opis}${z}`;
    }
    if (x < 0.61) {
      await naZegarze(ms, () => v.moveSnapshotToTrash(cel.pid, cel.s.snapshotId, { odepnij: true }));
      const e = (await v.listTrashedSnapshots()).find((q) => q.snapshotId === cel.s.snapshotId);
      if (e) u.kosze.push({ sid: cel.s.snapshotId, del: e.deletedAtISO });
      return `${n}:kosz ${opis}${cel.s.pinned ? '*' : ''}${z}`;
    }
    if (x < 0.69) {
      const pr = await naZegarze(ms, () => v.pruneSnapshotsForPatient(cel.pid, { recentHours: 0 }));
      const nw = (await v.exportSyncPayload()).snapshotTombstones || [];
      for (const sid of pr.prunedIds) { const e = nw.find((q) => q.snapshotId === sid); if (e) u.przyciecia.push({ sid, t: e.powod === 'retencja' ? e.deletedAtISO : e.przycietoISO }); }
      return `${n}:retencja ${K(u, cel.pid)}(${pr.prunedIds.map((q) => L(u, q)).join(',')})${z}`;
    }
    if (x < 0.77) {
      const rodz = K(u, cel.pid)[0] === 'O' ? 'O' : 'J';
      const r = await naZegarze(ms, () => v.savePatient(tresc(rodz, 140 + k, 40 + Math.floor(los.c * 20)), { dedup: false, patientId: cel.pid }));
      u.lab.set(r.snapshotId, `w${k}`);
      return `${n}:wizyta ${K(u, cel.pid)}/w${k}${z}`;
    }
    if (x < 0.85) {
      const t = await v.listTrashedSnapshots();
      if (!t.length) return `${n}:przywroc(pusto)`;
      const e = t[Math.floor(los.c * t.length)];
      const w = await naZegarze(ms, () => v.restoreTrashedSnapshot(e.patientId, e.snapshotId));
      return `${n}:przywroc ${K(u, e.patientId)}/${L(u, e.snapshotId)}${w && w.alreadyInCard ? '(już)' : ''}${z}`;
    }
    if (x < 0.89) {
      // Karty łańcuchów, które jeszcze czekają na swój krok, nie biorą udziału w losowym scaleniu.
      const ok = kk.filter((c) => c.snapshots.length && !u.chron.has(K(u, c.patientId)));
      if (ok.length < 2) return `${n}:scal(pusto)`;
      const a = ok[Math.floor(los.c * ok.length)];
      const reszta = ok.filter((c) => c.patientId !== a.patientId);
      const b = reszta[Math.floor(los.b * reszta.length)];
      const przed = new Set(wszystkie.map((q) => q.s.snapshotId));
      await naZegarze(ms, () => v.mergePatients(a.patientId, b.patientId));
      for (const c of await karty(v)) for (const s of c.snapshots) if (!przed.has(s.snapshotId)) u.lab.set(s.snapshotId, `m${k}`);
      return `${n}:scal ${K(u, a.patientId)}→${K(u, b.patientId)}${z}`;
    }
    const zi = (DEV.indexOf(n) + 1 + Math.floor(los.c * 2)) % 3;
    await sync(u, DEV[zi], n, ms);
    return `${n}←${DEV[zi]}${z}`;
  } catch (er) {
    return `${n}:blad(${(er && (er.code || er.message)) || er})`;
  } finally {
    await obserwuj(u, n);
  }
}

// --- program --------------------------------------------------------------------------------------------------------
async function program(seed) {
  vi.useFakeTimers({ toFake: ['Date'] });
  const r = rng(seed * 2654435761 >>> 0);
  const mr = rng((seed * 40503 + 977) >>> 0);
  vi.spyOn(Math, 'random').mockImplementation(() => mr());
  zegar = Date.parse('2026-10-10T08:00:00Z'); ustaw();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  const u = { lab: new Map(), karta: new Map(), pid: {}, zrodlowe: new Set(), hist: new Map(), kosze: [], przyciecia: [], nr: 0, log: [], chron: new Set(), nagrobkiP: new Map() };
  for (let i = 0; i < 3; i += 1) u[DEV[i]] = await urzadzenie(DEV[i], seed * 8 + i + 1);
  await przygotuj(u);
  // Dwa niezależne łańcuchy „Scal pacjentów” na dwóch różnych urządzeniach: J1 → J2 → J3 i O1 → O2.
  const dA = Math.floor(r() * 3); const dB = (dA + 1 + Math.floor(r() * 2)) % 3;
  const poz = [0, 1, 2].map(() => Math.floor(r() * KROKI)).sort((a, b) => a - b);
  const lancuch = [{ n: DEV[dA], z: 'J1', na: 'J2', p: poz[0] }, { n: DEV[dA], z: 'J2', na: 'J3', p: Math.max(poz[1], poz[0] + 1) }, { n: DEV[dB], z: 'O1', na: 'O2', p: poz[2] }];
  for (let k = 0; k < KROKI + 2; k += 1) {
    const los = { x: r(), dev: r(), a: r(), b: r(), c: r(), zeg: r(), zr: r(), dt: r() };
    zegar += 60e3 + Math.floor(los.dt * 120e3); ustaw();
    u.chron = new Set(lancuch.filter((q) => q.p >= k).flatMap((q) => [q.z, q.na]));
    for (const w of lancuch.filter((q) => q.p === k)) { u.log.push(await krok(u, `${k}${w.z}`, los, w)); zegar += 30e3; ustaw(); }
    u.chron = new Set(lancuch.filter((q) => q.p > k).flatMap((q) => [q.z, q.na]));
    if (k < KROKI) u.log.push(await krok(u, k, los, null));
  }
  // Pierwsze scalenia w losowej kolejności (2–4 par), potem 3 rundy pełnej wymiany w losowym porządku par.
  const ile = 2 + Math.floor(r() * 3);
  const pierwsze = [];
  for (let i = 0; i < ile; i += 1) { const na = Math.floor(r() * 3); const z = (na + 1 + Math.floor(r() * 2)) % 3; pierwsze.push([DEV[z], DEV[na]]); }
  const pary = DEV.flatMap((a) => DEV.filter((b) => b !== a).map((b) => [a, b]));
  for (let i = pary.length - 1; i > 0; i -= 1) { const j = Math.floor(r() * (i + 1)); [pary[i], pary[j]] = [pary[j], pary[i]]; }
  for (const [z, na] of pierwsze) { zegar += 60e3; ustaw(); await sync(u, z, na); }
  for (let rr = 0; rr < 3; rr += 1) for (const [z, na] of pary) { zegar += 60e3; ustaw(); await sync(u, z, na); }
  const st = {}; for (const n of DEV) st[n] = await stan(u, n);
  for (const n of DEV) Object.assign(u[n].__licz, { aktywny: true, lista: 0, wersje: 0, karty: 0 });
  for (const [z, na] of pary) { zegar += 60e3; ustaw(); await sync(u, z, na); }
  const zapisy = {};
  for (const n of DEV) { const l = u[n].__licz; l.aktywny = false; zapisy[n] = [l.lista, l.wersje, l.karty]; }
  const st2 = {}; for (const n of DEV) st2[n] = await stan(u, n);
  return { u, st, st2, zapisy, pierwsze: pierwsze.map(([z, na]) => `${na}←${z}`), pary: pary.map(([z, na]) => `${na}←${z}`) };
}

// --- prawa ----------------------------------------------------------------------------------------------------------
const max = (a) => a.reduce((m, x) => (x && x > m ? x : m), '');
function prawa(w) {
  const { u, st, st2, zapisy } = w;
  const nar = [];
  const j = JSON.stringify;
  // Z1 stabilność
  for (const n of DEV) {
    if (j(st[n]) !== j(st2[n])) nar.push({ p: 'Z1', n, o: 'stan zmienił się w rundzie kontrolnej' });
    if (zapisy[n].some((x) => x)) nar.push({ p: 'Z1', n, o: `zapisy w rundzie kontrolnej ${zapisy[n].join('/')}` });
  }
  // Z2 zbieżność kosza
  const wk = (s) => j(s.kosz.map((e) => [e.s, e.k, e.h, e.w, e.pin, e.del, e.tresc]));
  if (DEV.some((n) => wk(st[n]) !== wk(st.P))) nar.push({ p: 'Z2', n: '*', o: `kosz: ${DEV.map((n) => `${n} ${wk(st[n])}`).join(' / ')}` });
  // Z6 zbieżność kart (poza kosz-po-2 i wyjątkiem ostatniej wersji — zbieznosc)
  if (!zbieznosc(st).modulo) nar.push({ p: 'Z6', n: '*', o: 'karty różnią się poza wizytami z kosza' });
  // Dane do Z3–Z7: historia każdej wersji (najpóźniejsza zmiana, kosz, przycięcie, rejestr gwiazdki, najnowszy stan).
  const info = new Map();
  for (const [sid, h] of u.hist) {
    const s = L(u, sid);
    const zm = max(h.map((o) => o.zm));
    const sav = max(h.map((o) => o.sav));
    const rej = h.filter((o) => o.ra).reduce((m, o) => (!m || o.ra > m.ra || (o.ra === m.ra && o.rp && !m.rp) ? o : m), null);
    const kosz = max(u.kosze.filter((x) => x.sid === sid).map((x) => x.del));
    const przyc = max(u.przyciecia.filter((x) => x.sid === sid).map((x) => x.t));
    // Karta najnowszego stanu wersji: ostatnia obserwacja z najpóźniejszą chwilą zmiany (przeniesienie „Scal
    // pacjentów” chwili nie zmienia, więc to karta, w której najnowszy stan widziano ostatnio).
    const ostatnia = h.filter((o) => o.zm === zm).reduce((m, o) => (o.i >= m.i ? o : m));
    // W3: najnowsza treść (najpóźniejsza chwila treści; remis z różną treścią — bez wzorca) i najpóźniejszy rejestr gwiazdki.
    // Stan, który przepadł zgodnie z regułami, nie jest wzorcem: (i) jego karta miała nagrobek pacjenta nie wcześniejszy
    // niż chwila zmiany tego stanu (D-4 A; P-KOSZ-USUWANEJ-KARTY przenosi tylko wygraną kosza — E4a-ret), (ii) retencja
    // nie wcześniejsza niż ta chwila (nagrobek retencji nie niesie treści; cień jest tylko tutejszy, D4 = a).
    const przepadl = (o) => !!o && ((u.nagrobkiP.get(o.pid) || '') >= o.zm || przyc >= o.zm);
    const czMax = max(h.map((o) => o.cz));
    const zTrescia = h.filter((o) => o.cz === czMax);
    const tresci = new Set(zTrescia.map((o) => `${o.h}/${o.w}`));
    const wzorTresci = czMax && tresci.size === 1 && !przepadl(zTrescia.reduce((m, o) => (o.i >= m.i ? o : m))) ? [...tresci][0] : null;
    const rejOst = rej ? h.filter((o) => o.ra === rej.ra && o.rp === rej.rp).reduce((m, o) => (o.i >= m.i ? o : m)) : null;
    info.set(s, { sid, zm, sav, pinRej: rej ? rej.rp : false, wzorGwiazdki: !przepadl(rejOst), tresc: wzorTresci, kosz, przyc, ostKarta: K(u, ostatnia.pid), nagrOst: u.nagrobkiP.get(ostatnia.pid) || null, kartySid: [...new Set(h.map((o) => K(u, o.pid)))], kartyZnagrobkiem: [...new Set(h.filter((o) => u.nagrobkiP.has(o.pid)).map((o) => K(u, o.pid)))] });
  }
  const klasy = { karta: 0, kosz: 0, retencja: 0, np: 0, 'np-ret': 0, 'np-ret-A1': 0 };
  const szczegoly = [];
  for (const n of DEV) {
    const s = st[n];
    const wKartach = new Map();
    for (const k of s.karty) for (const x of k.w) wKartach.set(x.s, { k: k.k, x, ile: k.w.length });
    const wKoszu = new Map(s.kosz.map((e) => [e.s, e]));
    const nagr = new Map(s.nagrW.map((e) => [e.s, e]));
    const nagrP = new Map(s.nagrP.map((t) => [t.k, t]));
    // Z3 bez zguby
    for (const [lab, inf] of info) {
      if (wKartach.has(lab)) { klasy.karta += 1; continue; }
      if (wKoszu.has(lab) && wKoszu.get(lab).tresc) { klasy.kosz += 1; continue; }
      const e = nagr.get(lab);
      if (e && e.powod === 'retencja' && inf.przyc && inf.przyc >= inf.zm && !inf.pinRej) { klasy.retencja += 1; continue; }
      const t = inf.nagrOst;
      if (t && t >= inf.zm) {
        // np-ret-A1: kopia w karcie, która nigdy nie miała nagrobka pacjenta (zwykle docelowa scalenia), zniknęła pod
        // nagrobkiem retencji innej karty (A1, retencja starej karty po kluczu) — wynik jak E4a-ret-pin („brak”), dotąd
        // ta kopia zostawała na urządzeniu scalającym ze starą treścią (rozjazd); liczone osobno.
        const zywa = inf.kartySid.some((k) => !inf.kartyZnagrobkiem.includes(k) && e && e.k !== k);
        const kl = e || inf.przyc ? (zywa ? 'np-ret-A1' : 'np-ret') : 'np';
        klasy[kl] += 1;
        // np-ret i np-ret-A1 — od Bsw_przezyteRetencji naruszenie Z3 (wersja wygrywająca z przycięciem idzie za scaleniem).
        if (kl !== 'np') nar.push({ p: 'Z3', n, s: lab, o: `${kl}: wizyta zgubiona (ostatnio ${inf.ostKarta}, zmiana ${inf.zm}; nagrobek wersji ${e ? j(e) : '-'})` });
        szczegoly.push({ kl, n, s: lab, ost: inf.ostKarta, ostNagr: t, teraz: nagrP.has(inf.ostKarta), sav: inf.sav, zm: inf.zm, pinRej: inf.pinRej, karty: inf.kartySid, kosz: inf.kosz, przyc: inf.przyc, nagrW: e || null });
        continue;
      }
      nar.push({ p: 'Z3', n, s: lab, o: `wizyta zgubiona (ostatnio ${inf.ostKarta}, zmiana ${inf.zm}; nagrobek pacjenta ${t || '-'}; nagrobek wersji ${e ? j(e) : '-'}; karty ${inf.kartySid.join(',')})` });
    }
    for (const [lab, { k, x, ile }] of wKartach) {
      const inf = info.get(lab);
      // Z4 bez wskrzeszenia: wersja pokonana (kosz albo retencja bez gwiazdki nie wcześniej niż każda znana zmiana)
      // nie zostaje w karcie, chyba że jest ostatnią wersją tej karty.
      if (inf && ile > 1) {
        if (inf.kosz && inf.kosz >= inf.zm) nar.push({ p: 'Z4', n, s: lab, o: `w karcie ${k} po koszu ${inf.kosz} (ostatnia zmiana ${inf.zm})` });
        else if (inf.przyc && inf.przyc >= inf.zm && !inf.pinRej && !x.pin) nar.push({ p: 'Z4r', n, s: lab, o: `w karcie ${k} po retencji ${inf.przyc} (ostatnia zmiana ${inf.zm})` });
      }
      const e = nagr.get(lab);
      if (e && ile > 1) {
        const od = e.powod === 'retencja' ? null : e.del;
        if (od && od >= x.zm) nar.push({ p: 'Z4t', n, s: lab, o: `w karcie ${k} obok nagrobka kosza ${od} (zmiana ${x.zm})` });
      }
      // Z7 W3: wersja w karcie ma najnowszą treść, jaką kiedykolwiek miała (po chwili treści), i gwiazdkę z najpóźniejszego
      // rejestru (bez jawnego rejestru — bez gwiazdki).
      if (inf && inf.tresc && `${x.h}/${x.w}` !== inf.tresc) nar.push({ p: 'Z7', n, s: lab, o: `karta ${k}: treść ${x.h}/${x.w}, najnowsza ${inf.tresc}` });
      if (inf && inf.wzorGwiazdki && x.pin !== inf.pinRej) nar.push({ p: 'Z7g', n, s: lab, o: `karta ${k}: gwiazdka ${x.pin}, ostatni rejestr ${inf.pinRej}` });
      // Z5 bez starej treści: wersja w karcie i w koszu — treść karty nie starsza niż treść kosza.
      const t = wKoszu.get(lab);
      if (t && t.tresc && (x.h !== t.h || x.w !== t.w) && (x.cz || '') < (t.cz || '')) nar.push({ p: 'Z5', n, s: lab, o: `karta ${k} ${x.w} (treść ${x.cz}) starsza niż kosz ${t.w} (treść ${t.cz})` });
    }
  }
  return { nar, klasy, szczegoly, info: Object.fromEntries(info) };
}
// Zbieżność: pełny stan i widok (pomiar) oraz Z6 — karty bez wersji z wyjątku ostatniej wersji i z kosza na trzech.
function zbieznosc(st) {
  const j = JSON.stringify;
  const pelny = DEV.every((n) => j(st[n]) === j(st.P));
  const wid = DEV.every((n) => widok(st[n]) === widok(st.P));
  // Poza porównaniem: wersje w koszu z treścią na każdym urządzeniu (kosz-po-2) i wersje, które każde urządzenie, które
  // je trzyma, trzyma jako jedyną wersję karty obok swojego nagrobka tej wersji (wyjątek ostatniej wersji: E1, kosz-po-2
  // przy retencji).
  const wKoszuWszedzie = new Set(st.P.kosz.map((e) => e.s).filter((s) => DEV.every((n) => st[n].kosz.some((e) => e.s === s && e.tresc))));
  const wszystkie = new Set(DEV.flatMap((n) => st[n].karty.flatMap((k) => k.w.map((x) => x.s))));
  const wyjatek = new Set([...wszystkie].filter((s) => DEV.every((n) => st[n].karty.every((k) => !k.w.some((x) => x.s === s) || (k.w.length === 1 && st[n].nagrW.some((e) => e.s === s))))));
  const bez = (s) => j(s.karty.map((k) => ({ k: k.k, w: k.w.filter((x) => !wKoszuWszedzie.has(x.s) && !wyjatek.has(x.s)).map((x) => [x.s, x.h, x.w, x.pin]) })).filter((k) => k.w.length));
  const modulo = DEV.every((n) => bez(st[n]) === bez(st.P));
  return { pelny, wid, modulo };
}

describe('P-KOSZ-PO-KLUCZU: fuzz wielu kart (3 urządzenia, dwa łańcuchy „Scal pacjentów”)', () => {
  for (const seed of ZIARNA) {
    it(`ziarno ${seed}: prawa Z1–Z7 po rundach`, async () => {
      const t0 = performance.now();
      const w = await program(seed);
      const { nar, klasy, szczegoly, info } = prawa(w);
      const zb = zbieznosc(w.st);
      if (WYNIKI) {
        appendFileSync(WYNIKI, JSON.stringify({
          seed, ms: Math.round(performance.now() - t0), log: w.u.log, pierwsze: w.pierwsze, pary: w.pary, nar, klasy, szczegoly, zb,
          widok: Object.fromEntries(DEV.map((n) => [n, widok(w.st[n])])), st: w.st, info, zapisy: w.zapisy,
          stabilny: DEV.every((n) => JSON.stringify(w.st[n]) === JSON.stringify(w.st2[n])),
        }) + '\n');
      }
      expect(nar, `${w.u.log.join(' ; ')} | ${DEV.map((n) => `${n}: ${widok(w.st[n])}`).join(' || ')}`).toEqual([]);
    }, 120_000);
  }
});
