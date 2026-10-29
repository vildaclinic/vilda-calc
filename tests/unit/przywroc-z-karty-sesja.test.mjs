// P-PRZYWROC-Z-KARTY (PRZ0, decyzja właściciela D5 = a, 2026-10-21): „Przywróć” zapisu, który jest jednocześnie w karcie
// i w koszu — sesja (zmiana konta albo ponowne zalogowanie w trakcie) i tryb chmurowy.
//
// Reguła. „Już w karcie” ({ alreadyInCard: true }, bez zapisu wersji, tylko zdjęcie nieaktualnego wpisu kosza) — tylko
// gdy wersja w karcie zmieniona po usunięciu i po przycięciu (Bkz_ostatnie wpisu < updatedAtISO karty) ORAZ jej treść
// nie jest starsza niż treść kosza (chwila treści S4). Inaczej jeden zapis przywrócenia: treść nowsza z dwóch po chwili
// treści, gwiazdka z najpóźniejszego rejestru, updatedAtISO = _contentAtISO = stempel późniejszy niż treść kosza, wersja
// w karcie i usunięcie, rev = max(rev wpisu kosza, rev karty) + 1, wpis kosza zdjęty, nagłówek przebudowany,
// onPatientSaved({ isSnapshotRestore: true }). Straż sesji: sesja (konto + klucz) z chwili kliknięcia; każdy zapis
// (wersja, lista kosza, nagłówek karty) tylko w niej — inaczej błąd SESSION_CHANGED („W trakcie zablokowano sejf albo
// przełączono konto. Przywracanie przerwane.”) i żadnego zapisu po zmianie sesji.
//
// Stan PRZ0 (jak scenariusz PRZ w s4d7-wspolne.mjs): „Testowy Jan”, dwie wizyty na K (s1 20 kg, s2 23 kg), komplet na P
// i C; P daje s1 do kosza (s2 ostatnią wersją karty P); K z zegarem 10 min do przodu daje s2 do kosza; P dostaje kosz K
// (s2 zostaje w karcie P i jest w koszu 23) i poprawia s2 na 78 kg — chwila poprawki przed chwilą usunięcia K. Oczekiwane
// „Przywróć” na P: zapis 78 z rev 2 = max(0, 1) + 1.
//
// Punkty przełączenia (hak urządzenia P, jak w polkrata-sesja.test.mjs: po zakończeniu wskazanej operacji magazynu albo
// odszyfrowania — blokada i zalogowanie, dopiero potem wynik operacji):
//   blokada pacjenta — „Przywróć” czeka na Web Lock vilda-save-pat:<id>, który trzyma „inna karta” (atrapa Web Locks);
//        przełączenie przed wejściem pod blokadę — obowiązuje sesja z chwili kliknięcia;
//   odczyt kosza — getUserMeta w Bkz_czytaj (pierwszy odczyt „Przywróć”, przed odczytem rekordu karty);
//   (a)  odczyt karty — listSnapshotsForUser w „Przywróć” (po odczycie kosza, rekordu karty i wersji);
//   (b1) treść kosza — odszyfrowanie treści wpisu kosza; (b2) treść karty — odszyfrowanie treści wersji w karcie;
//   (c)  zapis wersji — po putSnapshotForUser;
//   (d)  nagłówek — odszyfrowanie najnowszej wersji w Bkz_przebudujNaglowek (wersja już zapisana, lista jeszcze nie);
//   (e)  lista — po odczycie listy pod blokadą metadanych (Bmk_zmien), już po zapisie wersji i nagłówka;
//   (f)  po zapisie listy kosza (putUserMeta), przed powiadomieniem onPatientSaved — przywrócenie jest już kompletne:
//        wynik bez błędu, powiadomienie (należy do tamtej sesji) pominięte.
// Kolejność zapisów: wersja, nagłówek karty, lista kosza — przerwane przed listą zostawia wpis kosza, więc następne
// „Przywróć” kończy przywrócenie („już w karcie” z nagłówkiem).
// zapisyPo — zapisy magazynu po przełączeniu (dowolne konto). Konto B i konto A w tym samym magazynie w pamięci.
// Co zostaje w koncie A (wyprowadzone z kodu i sprawdzane wprost na surowych rekordach magazynu): (a), (b1), (b2) —
// nic; (c), (d) — tylko wersja s2 (78, rev 2, chwila zmiany = chwila treści = stempel późniejszy niż usunięcie K,
// savedAtISO bez zmian), wpis kosza 23 i rekord karty bez zmian — następne „Przywróć” w koncie A daje więc „już
// w karcie” (wersja zmieniona po usunięciu, treść nowsza), rev 2, bez drugiego zapisu wersji, i podnosi nagłówek karty
// do chwili wersji; (e) — wersja s2 i nagłówek (chwila zapisu = stempel), wpis kosza 23 — następne „Przywróć”: „już
// w karcie”, nagłówek bez zmian; (f) — wszystko zapisane (wersja, nagłówek, zdjęty wpis), wynik bez błędu, bez
// powiadomienia w nowej sesji — po zalogowaniu A karta 78 z rev 2, kosz pusty („Przywróć” → 'brak').
//
// Co na tych testach daje STARY kod (baza ae1ac892: „już w karcie” dla każdej wersji w karcie nowszej po chwili zmiany
// rekordu; zmierzone uruchomieniem tego pliku na kopii repozytorium z sejfem bazy: 36 czerwonych, 0 zielonych):
//   S1 strażnik wierszy → w starym kodzie nie ma odszyfrowania treści kosza przed decyzją ani treści karty — czerwony.
//   S1 kontrola bez przełączenia, S4 (wersja w karcie zmieniona po usunięciu, wpis kosza wrócił jak w A10) → „już
//        w karcie”, karta 78 z rev 1 zamiast zapisu rev 2 — czerwony.
//   S1–S3 z przełączeniem → wynik inny niż SESSION_CHANGED bez zapisów po przełączeniu albo, w punktach, których stary
//        kod w stanie PRZ0 nie przechodzi (odszyfrowanie treści, zapis wersji i nagłówka), bez przełączenia — czerwony.
//   C1 tryb chmurowy na P, 8 kolejności → pierwsze „Przywróć” „już w karcie” — czerwony (sonda PRZ0 na bazie: po rundach
//        P „karta 78 + kosz 78”, K „kosz 78”, C „kosz 78” albo „karta 23 + kosz 78” / „karta 78 + kosz 78”; po blokadzie
//        „idle” i ponownym logowaniu P „kosz 78” — wersja P zniknęła z sesją, a K i C jej nie miały).
//
// Prawdziwy vilda_vault.js (urządzenie P z przełączeniem — okno z atrapą crypto.subtle.decrypt i magazynem w pamięci
// z rejestrem wywołań; K i C z polkrata-uprzaz.mjs; P w trybie chmurowym — trwała baza w pamięci w roli IndexedDB, jak
// w polkrata-cien-chmura.test.mjs), synchronizacja przez exportSyncPayload/mergeSyncPayload, sztuczny zegar
// (vi.useFakeTimers({ toFake: ['Date'] })). Dane wyłącznie FIKCYJNE („Testowy Jan”).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  repo, SEJF, sztucznyZegar, przesunZegar, zegar, urzadzenie, jan, zapisz, gdzie, poprawMase, doKosza, sync, rundy, widoki, stan,
} from './polkrata-uprzaz.mjs';
import { KOLEJNOSCI_8 } from './s4d7-wspolne.mjs';

const M = 60e3;
const HASLO_B = 'Druga#Lekarka!2026bb';
const PRZERWANE = 'W trakcie zablokowano sejf albo przełączono konto. Przywracanie przerwane.';
afterEach(() => { vi.useRealTimers(); });

const KOD = {};
const kod = (f) => (KOD[f] || (KOD[f] = readFileSync(path.join(repo, f), 'utf8')));
// Wiersz kodu sejfu w stosie wywołań: new Function dokleja dwa wiersze nagłówka.
const wiersze = (re) => kod(SEJF.N).split('\n').flatMap((l, i) => (re.test(l) ? [i + 3] : []));
const W_KARTA = wiersze(/^ {4}let obecna = \(await I\(\)\.listSnapshotsForUser\(b, patientId\)\)\.find\(function \(x\) \{ return x\.snapshotId === snapshotId; \}\);$/);
const W_TRESC_KOSZA = wiersze(/^ {4}try \{ tresc = await G\(e\.payloadCipher\.iv, e\.payloadCipher\.data\); st = Bgw_stan\(e, tresc\); \} catch \{ tresc = null; \}$/);
const W_TRESC_KARTY = wiersze(/^ {6}try \{ tk = await G\(obecna\.payloadCipher\.iv, obecna\.payloadCipher\.data\); \} catch \{ tk = null; \}$/);
// Odczyt listy pod blokadą metadanych (Bmk_zmien) — w zapisie listy kosza.
const W_LISTA = wiersze(/^ {4}const swiezy = await Bmk_mag\.getUserMeta\(uid\);$/);
const wWierszu = (w) => (s) => s.includes('<anonymous>:' + w + ':');
const wFunkcji = (f) => (s) => s.includes('at ' + f + ' (') || s.includes('at async ' + f + ' (');

function makeStorage() {
  const m = Object.create(null);
  return {
    getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; }, key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
  };
}
const cicho = { log() {}, info() {}, warn() {}, error() {}, debug() {} };
const chwila = (ms) => new Promise((r) => { setTimeout(r, ms); });
function okno(subtle, ss, ls, locks) {
  const win = {
    crypto: subtle
      ? { subtle, getRandomValues: (x) => globalThis.crypto.getRandomValues(x), randomUUID: () => globalThis.crypto.randomUUID() }
      : globalThis.crypto,
    TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: ls, sessionStorage: ss,
    setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
    addEventListener() {}, removeEventListener() {}, AbortController,
    document: { addEventListener() {}, removeEventListener() {}, hidden: false },
    console: cicho,
  };
  if (locks) win.navigator = { locks };
  win.window = win; win.self = win; win.top = win;
  ls.setItem('vildaRetention', '0');
  for (const f of ['vilda_crypto.js', 'vilda_retention.js', SEJF.N]) new Function('window', 'globalThis', kod(f))(win, win);
  return win;
}

/* Urządzenie z przełączeniem sesji (jak urzadzenieH w polkrata-sesja.test.mjs): konto B (zablokowane) i konto A w tym
   samym magazynie. hak.kiedy(rodzaj, metoda, argumenty, stos) — po zakończeniu operacji (odszyfrowanie albo wywołanie
   magazynu), dla której zwróci true, raz wykonuje hak.akcja, a dopiero potem oddaje wynik. Rejestr: [metoda, userId]. */
// Atrapa Web Locks (jak w polkrata-sesja.test.mjs): blokadę pacjenta może trzymać test („inna karta”).
function atrapaLocks() {
  const stan = new Map();
  const nazwa = (n) => { if (!stan.has(n)) stan.set(n, { zajeta: false, kolejka: [] }); return stan.get(n); };
  function uruchom(n, cb) {
    const s = nazwa(n);
    s.zajeta = true;
    const wynik = Promise.resolve().then(() => cb({ name: n }));
    wynik.then(zwolnij, zwolnij);
    function zwolnij() {
      s.zajeta = false;
      const nast = s.kolejka.shift();
      if (nast) nast.start();
    }
    return wynik;
  }
  return {
    czekajacych: (n) => nazwa(n).kolejka.length,
    request(n, opcje, cb) {
      if (typeof opcje === 'function') { cb = opcje; opcje = {}; }
      const s = nazwa(n);
      if (opcje.ifAvailable) return s.zajeta ? Promise.resolve().then(() => cb(null)) : uruchom(n, cb);
      if (!s.zajeta) return uruchom(n, cb);
      return new Promise((resolve, reject) => {
        const wpis = { start: () => uruchom(n, cb).then(resolve, reject) };
        s.kolejka.push(wpis);
        if (opcje.signal) {
          opcje.signal.addEventListener('abort', () => {
            const i = s.kolejka.indexOf(wpis);
            if (i >= 0) { s.kolejka.splice(i, 1); reject(Object.assign(new Error('przerwano'), { name: 'AbortError' })); }
          });
        }
      });
    },
  };
}

let nr = 0;
async function urzadzenieH(nazwa, opcje = {}) {
  nr += 1;
  const hak = { kiedy: null, akcja: null };
  const odpal = async (rodzaj, k, a, stos) => {
    if (hak.kiedy && hak.kiedy(rodzaj, k, a, stos)) { hak.kiedy = null; await hak.akcja(); }
  };
  const subtle = new Proxy(globalThis.crypto.subtle, { get(cel, k) {
    const f = cel[k];
    if (typeof f !== 'function') return f;
    if (k !== 'decrypt') return f.bind(cel);
    return async (...a) => {
      const stos = hak.kiedy ? String(new Error().stack) : '';
      const r = await f.apply(cel, a);
      await odpal('decrypt', 'decrypt', a, stos);
      return r;
    };
  } });
  const v = okno(subtle, makeStorage(), makeStorage(), opcje.locks).VildaVault;
  const wyw = [];
  const baza = v.createInMemoryAdapter();
  const px = new Proxy(baza, { get(cel, k) {
    const f = cel[k];
    if (typeof f !== 'function') return f;
    return function (...a) {
      wyw.push([String(k), a[0]]);
      const stos = hak.kiedy ? String(new Error().stack) : '';
      const r = f.apply(cel, a);
      if (!hak.kiedy || !r || typeof r.then !== 'function') return r;
      return r.then(async (w) => { await odpal('magazyn', String(k), a, stos); return w; });
    };
  } });
  v.setStorageAdapter(px);
  const kontoB = await v.createUser(HASLO_B, { label: `Fikcyjna Druga ${nr}`, iterations: 1000 });
  v.lock('manual');
  const haslo = `Przywroc#Sesja!2026${nr}aa`;
  const kontoA = await v.createUser(haslo, { label: `${nazwa}${nr}`, iterations: 1000 });
  Object.assign(v, {
    __nazwa: nazwa, __app: 'N', __licz: { lista: 0, wersje: 0, karty: 0 }, __px: px, __baza: baza, __haslo: haslo,
    __uid: kontoA.userId, __uidB: kontoB.userId, __hak: hak, __wyw: wyw,
  });
  return v;
}
// Przełączenie sesji raz, w miejscu wskazanym przez kiedy: blokada i zalogowanie konta B albo ponownie konta A.
function przelacz(v, kiedy, naB) {
  const st = { zrobione: false, od: -1 };
  v.__hak.kiedy = kiedy;
  v.__hak.akcja = async () => {
    st.zrobione = true;
    v.lock('manual');
    if (naB) await v.unlockUser(v.__uidB, HASLO_B);
    else await v.unlockUser(v.__uid, v.__haslo);
    st.od = v.__wyw.length;
  };
  return st;
}
const kto = (v, u) => (u === v.__uid ? 'A' : u === v.__uidB ? 'B' : String(u));
const ZAPIS = /^(put|remove|write|delete|update)/;
const zapisyPo = (v, st) => v.__wyw.slice(st.od).filter(([k]) => ZAPIS.test(k)).map(([k, u]) => `${k}(${kto(v, u)})`);
async function zalogujA(v) {
  v.__hak.kiedy = null;
  v.lock('manual');
  await v.unlockUser(v.__uid, v.__haslo);
}
async function naZegarze(ms, fn) {
  vi.setSystemTime(zegar.t + ms);
  try { return await fn(); } finally { vi.setSystemTime(zegar.t); }
}
const przywroc = (v, pid, sid) => v.restoreTrashedSnapshot(pid, sid)
  .then((w) => ({ ok: true, juz: w.alreadyInCard === true }), (e) => ({ ok: false, kod: e && e.code, komunikat: e && e.message }));

// Surowe rekordy konta A w magazynie (z pominięciem rejestru wywołań): lista kosza, rekord karty, wersje.
async function daneA(v, pid) {
  const m = (await v.__baza.getUserMeta(v.__uid)) || {};
  const wersje = {};
  for (const s of await v.__baza.listSnapshotsForUser(v.__uid, pid)) wersje[s.snapshotId] = JSON.stringify(s);
  return { lista: JSON.stringify(m.snapshotTombstones || []), karta: JSON.stringify(await v.__baza.getPatientForUser(v.__uid, pid)), wersje };
}
// Konto B w magazynie: wpisy kosza, karty, wersje karty pacjenta A.
async function daneB(v, pid) {
  const m = (await v.__baza.getUserMeta(v.__uidB)) || {};
  return {
    lista: (m.snapshotTombstones || []).length,
    karty: (await v.__baza.listPatientsForUser(v.__uidB)).length,
    wersje: (await v.__baza.listSnapshotsForUser(v.__uidB, pid)).length,
  };
}
const zmienioneWersje = (przed, po) => Object.keys({ ...przed.wersje, ...po.wersje }).filter((k) => przed.wersje[k] !== po.wersje[k]);
// Widok i rev zapisu sid na każdym urządzeniu.
async function karty(u, sid) {
  const w = {};
  for (const [n, v] of Object.entries(u)) {
    const s = await stan(v, sid);
    w[n] = `${(await widoki({ [n]: v }, sid))[n]}${s.karta ? ' r' + s.karta.rev : ''}`;
  }
  return w;
}

// „Testowy Jan”: s1 120 cm / 20 kg, s2 125 cm / 23 kg na K; P (z fabryki — urządzenie z przełączeniem albo w trybie
// chmurowym) i C dostają komplet.
async function jan2(fabrykaP) {
  sztucznyZegar();
  const P = await fabrykaP(), K = await urzadzenie('K'), C = await urzadzenie('C');
  const s1 = await zapisz(K, jan(120, 20));
  const s2 = await zapisz(K, jan(125, 23), { patientId: s1.patientId });
  await sync(K, P); await sync(K, C);
  return { u: { P, K, C }, P, K, C, pid: s1.patientId, sid: s2.snapshotId, s1: s1.snapshotId };
}
// Stan PRZ0 na P: karta 78 r1 + kosz 23 (usunięcie K z zegarem +10 min, później niż poprawka P).
async function stanPRZ0(fabrykaP = () => urzadzenieH('P')) {
  const d = await jan2(fabrykaP);
  przesunZegar(M); await doKosza(d.P, d.s1);
  przesunZegar(M); await naZegarze(10 * M, () => doKosza(d.K, d.sid));
  d.usuniecieK = (await d.K.listTrashedSnapshots()).find((e) => e.snapshotId === d.sid).deletedAtISO;
  przesunZegar(M); await sync(d.K, d.P);
  przesunZegar(M); await poprawMase(d.P, d.sid, 78);
  przesunZegar(M);
  expect(await karty(d.u, d.sid), 'kontrola stanu PRZ0').toEqual({ P: 'karta 78 + kosz 23 r1', K: 'kosz 23', C: 'karta 23 r0' });
  return d;
}
// Kontrola: s2 tylko w koszu P (K dał ją do kosza, P←K; s1 zostaje w karcie).
async function stanTylkoKosz() {
  const d = await jan2(() => urzadzenieH('P'));
  przesunZegar(M); await doKosza(d.K, d.sid);
  przesunZegar(M); await sync(d.K, d.P);
  przesunZegar(M);
  expect(await karty({ P: d.P }, d.sid), 'kontrola: tylko w koszu').toEqual({ P: 'kosz 23' });
  return d;
}

// Punkty przełączenia (nowy predykat na każdy test).
const PUNKT = {
  odczytKosza: () => (r, k, a, s) => r === 'magazyn' && k === 'getUserMeta' && wFunkcji('Bkz_czytaj')(s),
  odczytKarty: () => (r, k, a, s) => r === 'magazyn' && k === 'listSnapshotsForUser' && wWierszu(W_KARTA[0])(s),
  trescKosza: () => (r, k, a, s) => r === 'decrypt' && wWierszu(W_TRESC_KOSZA[0])(s),
  trescKarty: () => (r, k, a, s) => r === 'decrypt' && wWierszu(W_TRESC_KARTY[0])(s),
  zapisWersji: () => (r, k) => r === 'magazyn' && k === 'putSnapshotForUser',
  lista: () => {
    let poWersji = false;
    return (r, k, a, s) => {
      if (r !== 'magazyn') return false;
      if (k === 'putSnapshotForUser') { poWersji = true; return false; }
      return poWersji && k === 'getUserMeta' && wWierszu(W_LISTA[0])(s);
    };
  },
  naglowek: () => (r, k, a, s) => r === 'decrypt' && wFunkcji('Bkz_przebudujNaglowek')(s),
  poLiscie: () => {
    let poWersji = false;
    return (r, k) => {
      if (r !== 'magazyn') return false;
      if (k === 'putSnapshotForUser') { poWersji = true; return false; }
      return poWersji && k === 'putUserMeta';
    };
  },
};

// Przerwane „Przywróć”: przełączenie w punkcie, SESSION_CHANGED, bez zapisów po przełączeniu; przy koncie B jego magazyn
// pusty. Zwraca dane konta A przed i po.
// Przy (f) — po ostatnim zapisie — przywrócenie jest kompletne: wynik bez błędu, bez powiadomienia w nowej sesji.
async function przerwane(d, punkt, naB, opis) {
  const przed = await daneA(d.P, d.pid);
  const st = przelacz(d.P, PUNKT[punkt](), naB);
  const zdarzenia = [];
  const odpis = d.P.onPatientSaved((e) => { if (st.zrobione) zdarzenia.push(e && e.snapshotId); });
  const w = await przywroc(d.P, d.pid, d.sid);
  if (typeof odpis === 'function') odpis();
  expect(st.zrobione, 'przełączenie w: ' + opis).toBe(true);
  if (punkt === 'poLiscie') expect(w, 'przywrócenie kompletne przed zmianą sesji').toEqual({ ok: true, juz: false });
  else expect(w).toEqual({ ok: false, kod: 'SESSION_CHANGED', komunikat: PRZERWANE });
  expect(zdarzenia, 'bez onPatientSaved w nowej sesji').toEqual([]);
  expect(zapisyPo(d.P, st), 'żaden zapis „Przywróć” po zmianie sesji').toEqual([]);
  if (naB) expect(await daneB(d.P, d.pid), 'magazyn konta B nietknięty').toEqual({ lista: 0, karty: 0, wersje: 0 });
  return { przed, po: await daneA(d.P, d.pid) };
}

// Wynik w koncie A po przerwaniu (co zostaje), następne „Przywróć” po zalogowaniu A i stan po rundach na trzech.
async function sprawdzA(d, { przed, po }, zostaje) {
  const sid = d.sid;
  if (zostaje === 'nic') {
    expect(po, 'konto A bez zmian').toEqual(przed);
  } else {
    expect(zmienioneWersje(przed, po), 'w koncie A zmieniona tylko wersja s2').toEqual([sid]);
    const s2 = JSON.parse(po.wersje[sid]), byla = JSON.parse(przed.wersje[sid]);
    expect({ rev: s2.rev, poUsunieciu: s2.updatedAtISO > d.usuniecieK, savedAtISO: s2.savedAtISO }, 'zapisana wersja s2')
      .toEqual({ rev: 2, poUsunieciu: true, savedAtISO: byla.savedAtISO });
    const karta = JSON.parse(po.karta);
    if (zostaje === 'wersja') expect(po.karta, 'rekord karty (nagłówek) bez zmian').toBe(przed.karta);
    else expect(karta.lastSavedAtISO, 'nagłówek karty: chwila zapisu = stempel przywrócenia').toBe(s2.updatedAtISO);
    const wpisy = (l) => JSON.parse(l).map((e) => e.snapshotId).sort();
    if (zostaje !== 'wszystko') expect(po.lista, 'lista kosza bez zmian (wpis s2 nadal w koszu)').toBe(przed.lista);
    else expect(wpisy(po.lista), 'z listy kosza zdjęty tylko wpis s2').toEqual(wpisy(przed.lista).filter((x) => x !== sid));
  }
  await zalogujA(d.P);
  if (zostaje === 'nic') {
    expect(await karty({ P: d.P }, sid)).toEqual({ P: 'karta 78 + kosz 23 r1' });
    expect(await przywroc(d.P, d.pid, sid), 'następne „Przywróć” w koncie A: zapis').toEqual({ ok: true, juz: false });
  } else if (zostaje === 'wersja' || zostaje === 'wersja+naglowek') {
    expect(await karty({ P: d.P }, sid), 'wersja 78 z rev 2 zapisana, wpis kosza został').toEqual({ P: 'karta 78 + kosz 23 r2' });
    const g = await gdzie(d.P, sid);
    expect(g.s.payload._contentAtISO, 'chwila treści zapisanej wersji = stempel przywrócenia').toBe(g.s.updatedAtISO);
    // Wersja zapisana stemplem późniejszym niż usunięcie, z chwilą treści = stempel: „już w karcie”, bez drugiego zapisu
    // wersji; nagłówek karty nadrobiony (przy (e) już był).
    const wersjePrzed = (await daneA(d.P, d.pid)).wersje;
    expect(await przywroc(d.P, d.pid, sid), 'następne „Przywróć” w koncie A: już w karcie').toEqual({ ok: true, juz: true });
    const po2 = await daneA(d.P, d.pid);
    expect(po2.wersje, 'bez drugiego zapisu wersji').toEqual(wersjePrzed);
    const karta = JSON.parse(po2.karta);
    expect({ zapis: karta.lastSavedAtISO, wersji: karta.snapshotCount }, 'nagłówek karty po „już w karcie”')
      .toEqual({ zapis: g.s.updatedAtISO, wersji: 1 });
  } else {
    expect(await karty({ P: d.P }, sid)).toEqual({ P: 'karta 78 r2' });
    expect((await przywroc(d.P, d.pid, sid)).kod, 'wpisu nie ma już w koszu').toBe('brak');
  }
  expect(await karty({ P: d.P }, sid), 'P po „Przywróć” w koncie A').toEqual({ P: 'karta 78 r2' });
  await rundy([d.P, d.K, d.C]);
  expect(await karty(d.u, sid), 'po rundach na trzech').toEqual({ P: 'karta 78 r2', K: 'karta 78 r2', C: 'karta 78 r2' });
}

// Przełączenie, gdy „Przywróć” czeka na blokadę pacjenta (Web Lock vilda-save-pat:<id> trzyma „inna karta”): obowiązuje
// sesja z chwili kliknięcia, nie z chwili wejścia pod blokadę.
async function czekaNaBlokade(naB) {
  const locks = atrapaLocks();
  const d = await stanPRZ0(() => urzadzenieH('P', { locks }));
  const blokada = 'vilda-save-pat:' + d.pid;
  let zwolnij, wzieta;
  const trzymana = new Promise((r) => { zwolnij = r; });
  const ma = new Promise((r) => { wzieta = r; });
  locks.request(blokada, () => { wzieta(); return trzymana; });
  await ma;
  const przed = await daneA(d.P, d.pid);
  const wynik = przywroc(d.P, d.pid, d.sid);
  for (let i = 0; i < 400 && locks.czekajacych(blokada) === 0; i += 1) await chwila(2);
  expect(locks.czekajacych(blokada), '„Przywróć” czeka na blokadę pacjenta').toBe(1);
  d.P.lock('manual');
  if (naB) await d.P.unlockUser(d.P.__uidB, HASLO_B);
  else await d.P.unlockUser(d.P.__uid, d.P.__haslo);
  const st = { od: d.P.__wyw.length };
  zwolnij();
  expect(await wynik).toEqual({ ok: false, kod: 'SESSION_CHANGED', komunikat: PRZERWANE });
  expect(zapisyPo(d.P, st), 'żaden zapis „Przywróć” po zmianie sesji').toEqual([]);
  if (naB) expect(await daneB(d.P, d.pid), 'magazyn konta B nietknięty').toEqual({ lista: 0, karty: 0, wersje: 0 });
  await sprawdzA(d, { przed, po: await daneA(d.P, d.pid) }, 'nic');
}

const PUNKTY_PRZ0 = [
  ['odczytKarty', '(a) po odczycie kosza i wersji karty', 'nic'],
  ['trescKosza', '(b1) po odszyfrowaniu treści kosza', 'nic'],
  ['trescKarty', '(b2) po odszyfrowaniu treści wersji w karcie', 'nic'],
  ['zapisWersji', '(c) po putSnapshotForUser', 'wersja'],
  ['naglowek', '(d) w przebudowie nagłówka karty', 'wersja'],
  ['lista', '(e) po odczycie listy kosza pod blokadą metadanych', 'wersja+naglowek'],
  ['poLiscie', '(f) po zapisie listy kosza, przed powiadomieniem (wynik: przywrócono)', 'wszystko'],
];
const CO_ZOSTAJE = {
  nic: 'konto A bez zmian; po zalogowaniu A „Przywróć” zapisuje 78 z rev 2',
  wersja: 'w A zostaje tylko zapisana wersja 78 z rev 2 (lista kosza i nagłówek bez zmian); po zalogowaniu A „Przywróć” — już w karcie, rev 2, nagłówek nadrobiony',
  'wersja+naglowek': 'w A zostaje wersja 78 z rev 2 i nagłówek (wpis kosza został); po zalogowaniu A „Przywróć” — już w karcie, rev 2',
  wszystko: 'w A zapisane wszystko (wersja, nagłówek, zdjęty wpis kosza), bez powiadomienia w nowej sesji; po zalogowaniu A karta 78 z rev 2, kosz pusty',
};

describe('P-PRZYWROC-Z-KARTY, sesja — S1: stan PRZ0, zalogowanie innego konta (B) w trakcie „Przywróć”', () => {
  it('strażnik: wiersze punktów przełączenia — odczyt wersji karty, odszyfrowanie treści kosza i treści karty, odczyt listy pod blokadą metadanych — po jednym', () => {
    expect([W_KARTA.length, W_TRESC_KOSZA.length, W_TRESC_KARTY.length, W_LISTA.length]).toEqual([1, 1, 1, 1]);
  });
  it('bez przełączenia (kontrola urządzenia z kontem B): zapis przywrócenia — karta 78 z rev 2, kosz pusty; po rundach 78 z rev 2 na trzech', async () => {
    const d = await stanPRZ0();
    expect(await przywroc(d.P, d.pid, d.sid)).toEqual({ ok: true, juz: false });
    expect(await karty({ P: d.P }, d.sid)).toEqual({ P: 'karta 78 r2' });
    expect(await daneB(d.P, d.pid)).toEqual({ lista: 0, karty: 0, wersje: 0 });
    await rundy([d.P, d.K, d.C]);
    expect(await karty(d.u, d.sid)).toEqual({ P: 'karta 78 r2', K: 'karta 78 r2', C: 'karta 78 r2' });
  }, 120_000);
  for (const [punkt, opis, zostaje] of PUNKTY_PRZ0) {
    it(`${opis} → ${punkt === 'poLiscie' ? 'przywrócono' : 'SESSION_CHANGED'}, 0 zapisów w koncie B ani po przełączeniu; ${CO_ZOSTAJE[zostaje]}; po rundach 78 z rev 2 na trzech`, async () => {
      const d = await stanPRZ0();
      await sprawdzA(d, await przerwane(d, punkt, true, opis), zostaje);
    }, 120_000);
  }
  it('w czasie czekania na blokadę pacjenta (trzyma ją inna karta) → SESSION_CHANGED (sesja z chwili kliknięcia), 0 zapisów w koncie B; konto A bez zmian; po zalogowaniu A zapis 78 z rev 2; po rundach 78 z rev 2 na trzech', async () => {
    await czekaNaBlokade(true);
  }, 120_000);
  it('zaraz po odczycie kosza (przed odczytem rekordu karty) → odrzucone, 0 zapisów w koncie B ani po przełączeniu, konto A bez zmian; po zalogowaniu A zapis 78 z rev 2', async () => {
    // Rekord karty czytany już w koncie B (brak karty): błąd 'brak-karty' zamieniony na SESSION_CHANGED — bez
    // mylącego „Karta tego zapisu została usunięta”.
    const d = await stanPRZ0();
    const przed = await daneA(d.P, d.pid);
    const st = przelacz(d.P, PUNKT.odczytKosza(), true);
    const w = await przywroc(d.P, d.pid, d.sid);
    expect(st.zrobione, 'przełączenie po odczycie kosza').toBe(true);
    expect(w.ok, 'odrzucone').toBe(false);
    expect(w.kod, 'przerwane, nie „brak karty”').toBe('SESSION_CHANGED');
    expect(zapisyPo(d.P, st)).toEqual([]);
    expect(await daneB(d.P, d.pid)).toEqual({ lista: 0, karty: 0, wersje: 0 });
    await sprawdzA(d, { przed, po: await daneA(d.P, d.pid) }, 'nic');
  }, 120_000);
});

describe('P-PRZYWROC-Z-KARTY, sesja — S2: stan PRZ0, ponowne zalogowanie tego samego konta (A) w trakcie „Przywróć”', () => {
  it('w czasie czekania na blokadę pacjenta (trzyma ją inna karta) → SESSION_CHANGED (sesja z chwili kliknięcia), 0 zapisów w nowej sesji; konto A bez zmian; po zalogowaniu A zapis 78 z rev 2; po rundach 78 z rev 2 na trzech', async () => {
    await czekaNaBlokade(false);
  }, 120_000);
  for (const [punkt, opis, zostaje] of [['odczytKosza', 'zaraz po odczycie kosza', 'nic'], ...PUNKTY_PRZ0]) {
    it(`${opis} → ${punkt === 'poLiscie' ? 'przywrócono' : 'SESSION_CHANGED'}, 0 zapisów w nowej sesji; ${CO_ZOSTAJE[zostaje]}; po rundach 78 z rev 2 na trzech`, async () => {
      const d = await stanPRZ0();
      await sprawdzA(d, await przerwane(d, punkt, false, opis), zostaje);
    }, 120_000);
  }
});

describe('P-PRZYWROC-Z-KARTY, sesja — S3 (kontrola): zwykłe „Przywróć” (wizyty nie ma w karcie), zalogowanie konta B', () => {
  for (const [punkt, opis, zapisana] of [
    ['odczytKarty', '(a) po odczycie kosza i wersji karty', false],
    ['trescKosza', '(b1) po odszyfrowaniu treści kosza', false],
    ['zapisWersji', '(c) po putSnapshotForUser', true],
  ]) {
    it(`${opis} → SESSION_CHANGED, 0 zapisów w koncie B (wersja konta A nie trafia do magazynu B); po zalogowaniu A 23 z rev 1 na trzech`, async () => {
      const d = await stanTylkoKosz();
      const { przed, po } = await przerwane(d, punkt, true, opis);
      if (!zapisana) expect(po, 'konto A bez zmian').toEqual(przed);
      else {
        expect(zmienioneWersje(przed, po), 'w A tylko zapisana wersja s2').toEqual([d.sid]);
        expect([po.lista, po.karta], 'lista kosza i nagłówek A bez zmian').toEqual([przed.lista, przed.karta]);
      }
      await zalogujA(d.P);
      expect(await przywroc(d.P, d.pid, d.sid)).toEqual({ ok: true, juz: zapisana });
      await rundy([d.P, d.K, d.C]);
      expect(await karty(d.u, d.sid)).toEqual({ P: 'karta 23 r1', K: 'karta 23 r1', C: 'karta 23 r1' });
    }, 120_000);
  }
  it('zaraz po odczycie kosza → odrzucone, 0 zapisów w koncie B, konto A bez zmian; po zalogowaniu A 23 z rev 1', async () => {
    const d = await stanTylkoKosz();
    const przed = await daneA(d.P, d.pid);
    const st = przelacz(d.P, PUNKT.odczytKosza(), true);
    const w = await przywroc(d.P, d.pid, d.sid);
    expect(st.zrobione).toBe(true);
    expect(w.ok).toBe(false);
    expect(w.kod, 'przerwane, nie „brak karty”').toBe('SESSION_CHANGED');
    expect(zapisyPo(d.P, st)).toEqual([]);
    expect(await daneB(d.P, d.pid)).toEqual({ lista: 0, karty: 0, wersje: 0 });
    expect(await daneA(d.P, d.pid)).toEqual(przed);
    await zalogujA(d.P);
    expect(await przywroc(d.P, d.pid, d.sid)).toEqual({ ok: true, juz: false });
    expect(await karty({ P: d.P }, d.sid)).toEqual({ P: 'karta 23 r1' });
  }, 120_000);
});

/* S4: gałąź „już w karcie” też tylko w sesji kliknięcia. Po przywróceniu PRZ0 (78 r2) wpis kosza wraca do metadanych
   konta (stan po A10, jak kosz-przywroc-nowsza.test.mjs) — wersja w karcie zmieniona po usunięciu i z nowszą treścią. */
async function stanWKarcieIWKoszu() {
  const d = await stanPRZ0();
  const lista = (await d.P.__baza.getUserMeta(d.P.__uid)).snapshotTombstones;
  expect(await przywroc(d.P, d.pid, d.sid), 'pierwsze „Przywróć”: zapis').toEqual({ ok: true, juz: false });
  const meta = await d.P.__baza.getUserMeta(d.P.__uid);
  await d.P.__baza.putUserMeta(d.P.__uid, { ...meta, snapshotTombstones: lista });
  przesunZegar(M);
  expect(await karty({ P: d.P }, d.sid), 'kontrola: w karcie (78 r2) i w koszu').toEqual({ P: 'karta 78 + kosz 23 r2' });
  return d;
}
describe('P-PRZYWROC-Z-KARTY, sesja — S4: „już w karcie” (zdjęcie wpisu kosza) tylko w sesji kliknięcia', () => {
  it('bez przełączenia: { alreadyInCard: true }, karta 78 z rev 2, kosz pusty', async () => {
    const d = await stanWKarcieIWKoszu();
    expect(await przywroc(d.P, d.pid, d.sid)).toEqual({ ok: true, juz: true });
    expect(await karty({ P: d.P }, d.sid)).toEqual({ P: 'karta 78 r2' });
  }, 120_000);
  for (const [opis, naB] of [['zalogowanie konta B', true], ['ponowne zalogowanie konta A', false]]) {
    it(`${opis} po odczycie wersji karty → SESSION_CHANGED, bez zapisu listy po przełączeniu, konto A bez zmian; po zalogowaniu A już w karcie, rev 2`, async () => {
      const d = await stanWKarcieIWKoszu();
      const { przed, po } = await przerwane(d, 'odczytKarty', naB, 'odczyt wersji karty');
      expect(po).toEqual(przed);
      await zalogujA(d.P);
      expect(await przywroc(d.P, d.pid, d.sid)).toEqual({ ok: true, juz: true });
      expect(await karty({ P: d.P }, d.sid)).toEqual({ P: 'karta 78 r2' });
    }, 120_000);
  }
});

// --- C1: tryb chmurowy na P ------------------------------------------------------------------------------------------
// „Trwała baza” urządzenia (rola IndexedDB vilda_user_<id>) z licznikiem zapisów wersji i rekordów kart.
let nrCh = 0;
async function chmurowe(nazwa) {
  nrCh += 1;
  const v = okno(null, makeStorage(), makeStorage()).VildaVault;
  const baza = v.createInMemoryAdapter();
  const licz = { wersje: 0, karty: 0 };
  const px = new Proxy(baza, { get(cel, k) {
    const f = cel[k];
    if (typeof f !== 'function') return f;
    if (k === 'putSnapshotForUser' || k === 'removeSnapshotForUser') return (...a) => { licz.wersje += 1; return f.apply(cel, a); };
    if (k === 'putPatientForUser' || k === 'removePatientForUser') return (...a) => { licz.karty += 1; return f.apply(cel, a); };
    return f.bind(cel);
  } });
  v.setStorageAdapter(px);
  const haslo = `Chmura#Przywroc!2026${nrCh}aa`;
  await v.createUser(haslo, { label: `${nazwa}${nrCh}`, iterations: 10000, storageMode: 'cloud-only' });
  const [uz] = await v.listUsers();
  Object.assign(v, { __nazwa: nazwa, __R: px, __trwale: licz, __uid: uz.userId, __haslo: haslo, __licz: { lista: 0, wersje: 0, karty: 0 } });
  return v;
}
describe('P-PRZYWROC-Z-KARTY — C1: tryb chmurowy na P (wersje tylko w części sesyjnej)', () => {
  for (const kol of KOLEJNOSCI_8) {
    it(`${kol}: „Przywróć” na P → zapis; po rundach 78 z rev 2 na P, K i C; 0 zapisów wersji i kart w trwałej bazie P; po blokadzie „idle” i ponownym logowaniu P dostaje 78 z rev 2 z synchronizacji`, async () => {
      const d = await stanPRZ0(() => chmurowe('P'));
      const { P } = d;
      expect(P.isCloudOnlyAdapterActive()).toBe(true);
      const trwalePrzed = { ...P.__trwale };
      expect(await przywroc(P, d.pid, d.sid)).toEqual({ ok: true, juz: false });
      expect(await karty({ P }, d.sid)).toEqual({ P: 'karta 78 r2' });
      for (const k of kol.split(',')) { const [na, z] = k.split('←'); await sync(d.u[z], d.u[na]); }
      await rundy([d.P, d.K, d.C]);
      expect(await karty(d.u, d.sid)).toEqual({ P: 'karta 78 r2', K: 'karta 78 r2', C: 'karta 78 r2' });
      expect(P.__trwale, 'trwała baza P: żadnego zapisu wersji ani karty (tylko część sesyjna)').toEqual(trwalePrzed);
      expect(trwalePrzed).toEqual({ wersje: 0, karty: 0 });
      expect((await P.__R.listPatientsForUser(P.__uid)).length, 'karty w trwałej bazie P').toBe(0);
      P.lock('idle');
      await P.unlockUser(P.__uid, P.__haslo);
      expect(P.isCloudOnlyAdapterActive()).toBe(true);
      expect(await karty({ P }, d.sid), 'po ponownym logowaniu, przed synchronizacją: część sesyjna pusta, kosz bez wpisu').toEqual({ P: 'brak' });
      przesunZegar(M); await sync(d.K, P); await rundy([d.P, d.K, d.C], 1);
      expect(await karty(d.u, d.sid)).toEqual({ P: 'karta 78 r2', K: 'karta 78 r2', C: 'karta 78 r2' });
      expect(P.__trwale).toEqual({ wersje: 0, karty: 0 });
    }, 120_000);
  }
});

/* S5: przerwane „Przywróć” a nagłówek karty. Wizyta tylko w koszu P; C (bez wiedzy) usuwa pacjenta przed
   przywróceniem; P przywraca, a sejf blokuje się tuż po zapisie wersji (ponowne zalogowanie A). Następne „Przywróć” —
   „już w karcie” — nadrabia nagłówek (chwila zapisu karty = chwila przywróconej wersji), więc późniejsza zmiana w karcie
   wygrywa z wcześniejszym „Usuń pacjenta” na trzech (P-ZMIANA-W-KARCIE). Baza: nagłówek zostaje w tyle, karta znika
   z trzech urządzeń — czerwony. */
describe('P-PRZYWROC-Z-KARTY, sesja — S5: przerwane „Przywróć” i nagłówek karty', () => {
  it('blokada po zapisie wersji, C usunął pacjenta wcześniej → po zalogowaniu „Przywróć”: już w karcie, nagłówek nadrobiony; po rundach karta i wizyta 23 r1 na trzech', async () => {
    const d = await stanTylkoKosz();
    przesunZegar(M); await d.C.removePatient(d.pid);
    przesunZegar(M);
    const { przed, po } = await przerwane(d, 'zapisWersji', false, '(c) po putSnapshotForUser');
    expect(zmienioneWersje(przed, po), 'w A tylko zapisana wersja s2').toEqual([d.sid]);
    expect([po.lista, po.karta], 'lista kosza i nagłówek A bez zmian').toEqual([przed.lista, przed.karta]);
    await zalogujA(d.P);
    przesunZegar(M);
    expect(await przywroc(d.P, d.pid, d.sid), 'następne „Przywróć”: już w karcie').toEqual({ ok: true, juz: true });
    const s2 = JSON.parse(po.wersje[d.sid]);
    const karta = JSON.parse((await daneA(d.P, d.pid)).karta);
    expect({ zapis: karta.lastSavedAtISO, wersji: karta.snapshotCount }, 'nagłówek karty nadrobiony')
      .toEqual({ zapis: s2.updatedAtISO, wersji: 2 });
    await rundy([d.P, d.K, d.C]);
    const pacjenci = {};
    for (const [n, v] of Object.entries(d.u)) pacjenci[n] = (await v.listPatients()).length;
    expect({ pacjenci, karty: await karty(d.u, d.sid) }, 'po rundach na trzech').toEqual({
      pacjenci: { P: 1, K: 1, C: 1 }, karty: { P: 'karta 23 r1', K: 'karta 23 r1', C: 'karta 23 r1' },
    });
  }, 120_000);
});
