// P-KOSZ-PO-KLUCZU (PR-E3, przegląd 3) — „Przywróć” wizyty, która leży tu pod inną kartą niż karta jej wpisu kosza
// (F-R5), odtworzenie przypiętej wersji z cienia w delcie (F-R4) i wpisy kosza starego duplikatu, który zniknął (F-R1 —
// znane ograniczenie).
//
// Reguły w skrócie.
//   F-R5 „Przywróć” sprawdza miejsce wersji po kluczu: przed blokadami (Bkz_gdzieLezy) i ponownie pod blokadami karty
//        wpisu i karty, w której wersja leży (kolejność rosnących id, jak „Scal pacjentów”). Wersja leży tu pod inną
//        istniejącą kartą, a karta wpisu jest — przywrócenie w miejscu, w tamtej karcie: ta sama reguła co w karcie
//        wpisu („już w karcie” albo zapis przywrócenia z nową chwilą zmiany), nagłówek i powiadomienie tamtej karty, wynik
//        { patientId: tamta karta }. Dotąd zapis szedł pod kartę wpisu z tym samym snapshotId: wersja przechodziła bez
//        licznika i nagłówka tamtej karty, a ta zostawała na liście z 1 wizytą i bez żadnej — na zawsze. Wersja
//        przeniesiona w międzyczasie pod kartę bez blokady — od nowa (najwyżej 3 razy, potem 'zmieniony'). Karty wpisu
//        tu nie ma — jak dotąd brak-karty (F3 „karta wpisu nieobecna” w kosz-po-kluczu-krawedzie.test.mjs).
//   F-R4 W delcie (bez listy kosza, Bkz_gdzieIndziej nie szuka) Bgw_wskrzes przed zapisem z cienia czyta wersję po
//        kluczu — tylko dla wpisu, który przeszedł jego warunki (nie ważny kosz, przypięty rejestr gwiazdki, cień);
//        wersja leży tu pod inną kartą — bez zapisu, rozstrzyga ją najbliższe pełne scalanie (jak M01). Dotąd delta
//        przenosiła ją z cienia pod kartę wpisu i zostawiała starą kartę z 1 wizytą i bez żadnej.
//   F-R1 (ograniczenie) wpisy kosza starego duplikatu, który znika (zdjęty wyjątek ostatniej wersji, F3), wskazują kartę,
//        której nie ma na żadnym urządzeniu: kosz ich nie pokazuje (listTrashedSnapshots: patientExists false; widok
//        kosza pokazuje tylko wpisy kart, które są), „Przywróć” — brak-karty. Tak samo jak dotąd (8240e0df) przy koszu
//        w karcie przed jej scaleniem i przy koszu w starym duplikacie, który przegrał ze swoim nagrobkiem.
//
// Przygotowanie jak w kosz-po-kluczu-krawedzie.test.mjs (polkrata-uprzaz.mjs: prawdziwy vilda_vault.js w osobnym oknie
// na urządzenie, magazyn w pamięci z licznikiem zapisów, sztuczny zegar, retencja w tle wyłączona): na K „Testowy Jan” X
// (x1 120 cm / 20 kg, x 125 cm / 23 kg, x3 130 cm / 25 kg), „Testowa Ola” Y (y) i Z (z) albo tylko jedna z nich; komplet
// na P i C; kroki co minutę. Przebieg: pierwsze scalenia w podanej kolejności, 3 rundy „każdy z każdym”, pełny stan
// (pelnyStan), runda kontrolna z licznikiem zapisów. Widok: „X[nowa] Y[x:23] Z[z] | kosz y@Y:18 | nagr Y”.
//
// Scenariusze — wynik teraz / bez tej poprawki (E3 przed poprawką „Przywróć”) / na 8240e0df (bez E3) / mutanty kodu, które test zabija.
//   F-R5 żywa Y (stan F3 z kosz-po-kluczu-krawedzie.test.mjs: C scala X → Y i daje do kosza w Y wszystko poza x; P bez
//        wiedzy dopisuje do X nową wizytę i daje x do kosza w X — K i C Y[x:23], P Y[y], wpis x pod X), „Przywróć” x na K
//        albo na C, 8 kolejności → przywrócone w Y (wynik Y), bez pustej karty, po rundach X[nowa] Y[x:23] Z[z] na trzech,
//        0 zapisów / dotąd przywrócone pod X: Y z 1 wizytą i bez żadnej na urządzeniu, które przywracało, na drugim bez Y,
//        na P Y[y] — trzy stany na zawsze (8240e0df tak samo, P dodatkowo z x1 i x3 w X) / zapis zawsze pod kartą wpisu,
//        wersja pod inną kartą nieszukana pod blokadą.
//   F-R5 żywa Y, „Przywróć” x na P (P nie ma x w żadnej karcie, Y[y] — E1) → przywrócone w X; K i C przenoszą x z Y do X,
//        pusta Y znika tam bez nagrobka, P zostaje z Y[y] — rozjazd obecności E1, jak dotąd (znane ograniczenie).
//   F-R5 przerwane scalenie (E4b: P←K, usunięcie X po zapisie listy nie udaje się — P X[x:74] i kosz x@Z:74), „Przywróć”
//        x na P → przywrócone w miejscu, w X; X zapisana później niż „Scal pacjentów” wraca na trzech (D-4 A), po rundach
//        X[x:74] Z[…] na trzech, bez pustej karty / dotąd przywrócone pod Z, P na zawsze z pustą X (1 wizyta, żadnej) /
//        jak wyżej.
//   F-R5 wyścig: między odczytem po kluczu przed blokadami a blokadami druga karta przeglądarki K scala Y → Z (x przechodzi
//        pod Z) → „Przywróć” sprawdza miejsce od nowa i przywraca x w Z (wynik Z), bez pustej karty, dwa odczyty miejsca
//        przed blokadami / dotąd zapis pod X (x znika z Z bez licznika i nagłówka Z).
//   F-R5 blokady: przypięcie x w Y wywołane w tej samej karcie przeglądarki w trakcie „Przywróć” czeka na blokadę Y — x
//        przywrócona i przypięta (rev 3) / mutant: tylko blokada karty wpisu (przypięcie zapisuje rekord sprzed
//        przywrócenia: rev 2, dawna chwila treści — stempel przywrócenia ginie). Przerwane „Przywróć” w miejscu
//        (zalogowanie od nowa po zapisie wersji) — drugie „Przywróć”: już w karcie Y, nagłówek Y nadrobiony / mutanty:
//        nagłówek karty wpisu zamiast karty, w której wizyta leży (w zapisie i w „już w karcie”).
//   F-R5 sesja: konto B z kopią kart A, przełączenie na B zaraz po odczycie po kluczu pod blokadami → SESSION_CHANGED,
//        żadnego zapisu po przełączeniu, konto B bez zmian; po zalogowaniu A „Przywróć” przywraca x w Y; przełączenie
//        zaraz po odczycie wersji karty wpisu pod blokadami → SESSION_CHANGED jeszcze przed odczytem miejsca po kluczu
//        (po przełączeniu ani odczytu po kluczu, ani zapisu) / dotąd bez odczytu po kluczu (hak nie rusza) / mutanty:
//        bez Bses_pilnuj przed odczytem miejsca pod blokadami.
//   F-R4 stan M01 (K X[x:74*] Z[m], wpis retencji x pod Z z cieniem 74), potem delta karty Z z nową wizytą C → K X[x:74*]
//        Z[nz,m], po rundach to samo na trzech, 0 zapisów / dotąd po delcie K X z 1 wizytą i bez żadnej, Z[nz,m,x:74*],
//        po rundach trzy różne stany na zawsze (P X[x1], C bez X) / Bgw_wskrzes w delcie bez sprawdzenia po kluczu.
//   F-R4 kontrola: delta, gdy wersji nie ma tu w żadnej karcie (K usunął kartę X ze stanu M01) → odtworzenie z cienia
//        pod kartą wpisu, jak dotąd (Z[nz,m,x:74*]) / mutant „w delcie Bgw_wskrzes nigdy nie zapisuje”.
//   F-R4 sesja: konto B z kopią kart A, przełączenie na B zaraz po odczycie wersji karty Z w pętli kart delty →
//        SESSION_CHANGED przed odczytem po kluczu w Bgw_wskrzes (po przełączeniu ani odczytu po kluczu, ani zapisu),
//        konto B bez zmian; ta sama delta w koncie A — x 74* pod X / mutant: bez Bses_pilnuj przed tym odczytem.
//   F-R1 (ograniczenie) K: X → Y → Z; P (bez wiedzy) daje do kosza x1 i x3 w X; K daje do kosza x (pod Z); P←K → X znika
//        z P; wpisy x1 i x3 pod X ukryte w koszu na trzech, „Przywróć” x1 i x3 — brak-karty na trzech, stan zbieżny /
//        8240e0df: P i C zostają ze starą X[x:23] obok kosza x, „Przywróć” x1 tam działa (do starego duplikatu), K bez X
//        (x1 i x3 w karcie Z i w koszu); kontrola: kosz x1 w X przed scaleniem — brak-karty na trzech na obu kodach.
//
// Dane wyłącznie fikcyjne.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  sztucznyZegar, przesunZegar, zegar, urzadzenie, jan, zapisz, gdzie, poprawMase, doKosza, sync, rundy, zeruj, zapisy, repo, SEJF,
} from './polkrata-uprzaz.mjs';
import { KOLEJNOSCI_8, ola } from './s4d7-wspolne.mjs';
import { pelnyStan, widok } from './kosz-po-kluczu-wspolne.mjs';

Error.stackTraceLimit = 100;
const M = 60e3;
const ZERO = { lista: 0, wersje: 0, karty: 0 };
const ZERO3 = { P: ZERO, K: ZERO, C: ZERO };
const HASLO_B = 'Druga#Lekarka!2026bb';
afterEach(() => { vi.useRealTimers(); });

// --- przygotowanie i przebieg (jak w kosz-po-kluczu-krawedzie.test.mjs) -------------------------------------------------
async function przygotuj({ dwie = null, P = null } = {}) {
  sztucznyZegar();
  const u = {};
  u.P = P ? await P() : await urzadzenie('P', 'N');
  for (const n of ['K', 'C']) u[n] = await urzadzenie(n, 'N');
  const x1 = await zapisz(u.K, jan(120, 20)); u.X = x1.patientId;
  const x = await zapisz(u.K, jan(125, 23), { patientId: u.X }); u.sid = x.snapshotId;
  u.wersje = { [x1.snapshotId]: 'x1', [x.snapshotId]: 'x' };
  u.x1 = x1.snapshotId;
  if (!dwie) { const x3 = await zapisz(u.K, jan(130, 25), { patientId: u.X }); u.wersje[x3.snapshotId] = 'x3'; u.x3 = x3.snapshotId; }
  for (const [k, kg] of [['Y', 18], ['Z', 19]]) {
    if (dwie && dwie !== k) continue;
    const r = await zapisz(u.K, ola(110 + kg - 18, kg));
    u[k] = r.patientId; u.wersje[r.snapshotId] = k.toLowerCase(); u[k.toLowerCase()] = r.snapshotId;
  }
  u.karty = { [u.X]: 'X' }; if (u.Y) u.karty[u.Y] = 'Y'; if (u.Z) u.karty[u.Z] = 'Z';
  u.urz = [u.P, u.K, u.C];
  for (const v of [u.P, u.C]) await sync(u.K, v);
  u.t0 = zegar.t;
  return u;
}
async function krok(f) { przesunZegar(M); return f(); }
async function przebieg(u, kol) {
  for (const k of kol ? kol.split(',') : []) { const [na, z] = k.split('←'); await sync(u[z], u[na]); }
  await rundy(u.urz, 3);
  const st = {};
  for (const n of ['P', 'K', 'C']) st[n] = await pelnyStan(u, u[n]);
  zeruj(u.urz); await rundy(u.urz, 1);
  const zap = zapisy(u.urz);
  const st2 = {};
  for (const n of ['P', 'K', 'C']) st2[n] = await pelnyStan(u, u[n]);
  const j = JSON.stringify;
  return {
    st, zapisy: zap, widoki: Object.fromEntries(['P', 'K', 'C'].map((n) => [n, widok(st[n])])),
    zbiezny: j(st.P) === j(st.K) && j(st.K) === j(st.C), stabilny: j(st) === j(st2),
  };
}
// Karty z licznikiem wersji innym niż liczba wersji w karcie (pusta karta: 1 wizyta na liście, żadnej w karcie).
const puste = (s) => s.karty.filter((k) => k.n !== k.wersje.length || !k.wersje.length).map((k) => `${k.karta}(n=${k.n}, ${k.wersje.length})`);
async function przywroc(u, v, pid, sid = u.sid) {
  try {
    const w = await krok(() => v.restoreTrashedSnapshot(pid, sid));
    return w.alreadyInCard ? `już w karcie ${u.karty[w.patientId] || '?'}` : `przywrócono ${u.karty[w.patientId] || '?'}`;
  } catch (er) { return er.code || er.message; }
}

// --- 1. F-R5: żywa Y ---------------------------------------------------------------------------------------------------
// Stan F3 „żywa Y” (kosz-po-kluczu-krawedzie.test.mjs, bez notatek): C scala X → Y i daje do kosza w Y wszystko poza x
// (Y = [x]); C→K. P (bez wiedzy o scaleniu) dopisuje do X nową wizytę i daje x do kosza w X (wpis x pod X).
async function zywaY(u) {
  await krok(() => sync(u.C, u.K)); await krok(() => sync(u.C, u.P));
  const m = await krok(() => u.C.mergePatients(u.X, u.Y)); u.wersje[m.snapshotId] = 'm';
  for (const s of (await u.C.getPatient(u.Y)).snapshots) if (s.snapshotId !== u.sid) await krok(() => u.C.moveSnapshotToTrash(u.Y, s.snapshotId, { odepnij: true }));
  await krok(() => sync(u.C, u.K));
  const r = await krok(() => u.P.savePatient(jan(135, 27), { dedup: false, patientId: u.X })); u.wersje[r.snapshotId] = 'nowa';
  await krok(() => doKosza(u.P, u.sid));
}
const KOSZ_Y = 'kosz m@Y:18 kosz x1@Y:20 kosz x3@Y:25 kosz y@Y:18';
const ZYWA = { P: `X[nowa] Y[y] Z[z] | ${KOSZ_Y.replace('kosz x1', 'kosz x@X:23 kosz x1')}`, KC: `X[nowa] Y[x:23] Z[z] | ${KOSZ_Y.replace('kosz x1', 'kosz x@X:23 kosz x1')}` };
describe('P-KOSZ-PO-KLUCZU — F-R5: „Przywróć” wizyty, którą żywa karta docelowa „Scal pacjentów” trzyma jako ostatnią wersję, przywraca ją w miejscu', () => {
  for (const kto of ['K', 'C']) {
    for (const kol of KOLEJNOSCI_8) {
      it(`żywa Y (${kol}), „Przywróć” x (wpis pod X) na ${kto} — x zostaje w Y, bez pustej karty, po rundach ten sam stan na trzech`, async () => {
        const u = await przygotuj();
        await zywaY(u);
        const r0 = await przebieg(u, kol);
        expect(r0.widoki, 'kontrola: stan F3 — x w Y na K i C, Y[y] na P').toEqual({ P: ZYWA.P, K: ZYWA.KC, C: ZYWA.KC });
        const zdarzenia = [];
        u[kto].onPatientSaved((e) => { if (e && e.isSnapshotRestore) zdarzenia.push(u.karty[e.patientId]); });
        const przed = await pelnyStan(u, u[kto]);
        expect(await przywroc(u, u[kto], u.X), `${kto}: przywrócono w Y (tam leży)`).toBe('przywrócono Y');
        expect(zdarzenia, `${kto}: powiadomienie onPatientSaved o karcie Y (synchronizacja wysyła Y)`).toEqual(['Y']);
        const s = await pelnyStan(u, u[kto]);
        expect({ widok: widok(s), puste: puste(s), x: (await gdzie(u[kto], u.sid)).s.rev }, `${kto} po „Przywróć”`)
          .toEqual({ widok: `X[nowa] Y[x:23] Z[z] | ${KOSZ_Y}`, puste: [], x: 2 });
        const k = (st, n) => st.karty.find((q) => q.karta === n);
        expect({ Y: k(s, 'Y').last, X: k(s, 'X').last }, `${kto}: chwila zapisu karty Y = chwila zmiany przywróconej x, karta X bez zmian`)
          .toEqual({ Y: k(s, 'Y').wersje.find((q) => q.w === 'x').upd, X: k(przed, 'X').last });
        const r = await przebieg(u, null);
        const w = `X[nowa] Y[x:23] Z[z] | ${KOSZ_Y}`;
        expect(r.widoki, 'po rundach').toEqual({ P: w, K: w, C: w });
        for (const n of ['P', 'K', 'C']) expect(puste(r.st[n]), `${n}: bez pustej karty`).toEqual([]);
        expect(r.zbiezny, 'ten sam pełny stan').toBe(true);
        expect(r.stabilny).toBe(true);
        expect(r.zapisy, 'runda kontrolna bez zapisów').toEqual(ZERO3);
      }, 30000);
    }
  }

  // Znane ograniczenie (E1 — obecność): P nie ma x w żadnej karcie, a ostatnią wersją jego Y jest y (dana do kosza na C).
  for (const kol of ['K←C,P←K', 'C←P,C←K']) {
    it(`żywa Y (${kol}), „Przywróć” x na P — do X; K i C przenoszą x z Y do X (pusta Y znika bez nagrobka), P zostaje z Y[y] (E1, jak dotąd)`, async () => {
      const u = await przygotuj();
      await zywaY(u);
      await przebieg(u, kol);
      expect(await przywroc(u, u.P, u.X), 'P: przywrócono do karty wpisu').toBe('przywrócono X');
      const r = await przebieg(u, null);
      expect(r.widoki, 'po rundach').toEqual({ P: `X[nowa,x:23] Y[y] Z[z] | ${KOSZ_Y}`, K: `X[nowa,x:23] Z[z] | ${KOSZ_Y}`, C: `X[nowa,x:23] Z[z] | ${KOSZ_Y}` });
      for (const n of ['P', 'K', 'C']) expect(puste(r.st[n]), `${n}: bez pustej karty`).toEqual([]);
      expect(r.stabilny).toBe(true);
      expect(r.zapisy, 'runda kontrolna bez zapisów').toEqual(ZERO3);
    }, 30000);
  }
});

// --- 2. F-R5: przerwane scalenie (wizyta jeszcze w starym duplikacie i w koszu) -------------------------------------------
// E4b (kosz-po-kluczu.test.mjs): K: X → Y → Z; P (bez wiedzy) poprawia x w starej X na 74; K daje x do kosza (pod Z).
// P←K: po zapisie listy kosza z x usunięcie karty X nie udaje się raz (atrapa magazynu: zamknięcie aplikacji) — na P
// zostaje X[x:74] i kosz x@Z:74 do następnego scalenia.
async function przerwaneE4b(u) {
  for (const [z, na, m] of [['X', 'Y', 'm1'], ['Y', 'Z', 'm2']]) u.wersje[(await krok(() => u.K.mergePatients(u[z], u[na]))).snapshotId] = m;
  await krok(() => poprawMase(u.P, u.sid, 74));
  await krok(() => doKosza(u.K, u.sid));
  const baza = u.P.__px;
  const st = { lista: false, blad: false };
  u.P.setStorageAdapter(new Proxy(baza, { get(cel, k) {
    const f = cel[k];
    if (typeof f !== 'function') return f;
    return async function (...a) {
      if (k === 'removePatientForUser' && st.lista && !st.blad && a[1] === u.X) { st.blad = true; throw new Error('atrapa: zamknięcie aplikacji'); }
      const r = await f.apply(cel, a);
      if (k === 'putUserMeta' && ((a[1] && a[1].snapshotTombstones) || []).some((e) => e && e.snapshotId === u.sid && e.patientId === u.Z)) st.lista = true;
      return r;
    };
  } }));
  przesunZegar(M);
  try { await u.P.mergeSyncPayload(JSON.parse(JSON.stringify(await u.K.exportSyncPayload()))); } catch { /* przerwane */ }
  u.P.setStorageAdapter(baza);
  return st;
}
describe('P-KOSZ-PO-KLUCZU — F-R5: „Przywróć” po scaleniu przerwanym po zapisie listy (wizyta w starej karcie i w koszu)', () => {
  it('E4b, P←K przerwane przed usunięciem X; „Przywróć” x na P — x 74 zostaje w X (bez pustej karty), X wraca na trzech (D-4 A), po rundach zbieżnie', async () => {
    const u = await przygotuj();
    const st = await przerwaneE4b(u);
    expect(st, 'kontrola: lista zapisana, usunięcie X nieudane').toEqual({ lista: true, blad: true });
    expect(widok(await pelnyStan(u, u.P)), 'kontrola: P — x 74 w X i w koszu').toBe('X[x:74] Z[m2,m1,z,y,x3,x1] | kosz x@Z:74 | nagr Y');
    expect(await przywroc(u, u.P, u.Z), 'P: przywrócono w X (tam leży)').toBe('przywrócono X');
    const s = await pelnyStan(u, u.P);
    expect({ widok: widok(s), puste: puste(s) }, 'P po „Przywróć”').toEqual({ widok: 'X[x:74] Z[m2,m1,z,y,x3,x1] | nagr Y', puste: [] });
    const r = await przebieg(u, null);
    const w = 'X[x:74] Z[m2,m1,z,y,x3,x1] | nagr Y';
    expect(r.widoki, 'po rundach').toEqual({ P: w, K: w, C: w });
    for (const n of ['P', 'K', 'C']) expect(puste(r.st[n]), `${n}: bez pustej karty`).toEqual([]);
    expect(r.zbiezny, 'ten sam pełny stan').toBe(true);
    expect(r.stabilny).toBe(true);
    expect(r.zapisy, 'runda kontrolna bez zapisów').toEqual(ZERO3);
  }, 30000);
  it('kontrola: to samo przerwane scalenie bez „Przywróć” — następne scalenie kończy usunięcie, po rundach bez X, kosz 74', async () => {
    const u = await przygotuj();
    await przerwaneE4b(u);
    const r = await przebieg(u, null);
    const w = 'Z[m2,m1,z,y,x3,x1] | kosz x@Z:74 | nagr X,Y';
    expect(r.widoki, 'po rundach').toEqual({ P: w, K: w, C: w });
    expect(r.zbiezny).toBe(true);
    expect(r.zapisy, 'runda kontrolna bez zapisów').toEqual(ZERO3);
  }, 30000);
});

// --- 3. F-R5: wyścig z drugą kartą przeglądarki i zmiana sesji ------------------------------------------------------------
const KOD = {};
const kod = (f) => (KOD[f] || (KOD[f] = readFileSync(path.join(repo, f), 'utf8')));
function makeStorage() {
  const m = Object.create(null);
  return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, key: (i) => Object.keys(m)[i] || null, get length() { return Object.keys(m).length; } };
}
function okno() {
  const win = {
    crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: makeStorage(), sessionStorage: makeStorage(), setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
    addEventListener() {}, removeEventListener() {}, AbortController, document: { addEventListener() {}, removeEventListener() {}, hidden: false },
    console: { log() {}, info() {}, warn() {}, error() {}, debug() {} },
  };
  win.window = win; win.self = win; win.top = win;
  win.localStorage.setItem('vildaRetention', '0');
  for (const f of ['vilda_crypto.js', 'vilda_retention.js', SEJF.N]) new Function('window', 'globalThis', kod(f))(win, win);
  return win;
}
// Druga karta przeglądarki tego samego urządzenia: drugie okno sejfu na tym samym magazynie, to samo konto.
async function drugaKarta(v) {
  const n = okno().VildaVault;
  n.setStorageAdapter(v.__px);
  await n.unlockUser(v.__uid, v.__haslo);
  return n;
}
// Hak magazynu urządzenia: po zakończeniu wywołania, dla którego kiedy(metoda, argumenty, stos) zwróci true, raz
// wykonuje akcja(), dopiero potem oddaje wynik; obserwuj(metoda, argumenty, stos) — przy każdym wywołaniu. Rejestr
// wywołań: [metoda, userId].
function hak(v, kiedy, akcja, obserwuj = null) {
  const baza = v.__px;
  const st = { zrobione: false, wyw: [], od: -1 };
  v.setStorageAdapter(new Proxy(baza, { get(cel, k) {
    const f = cel[k];
    if (typeof f !== 'function') return f;
    return async function (...a) {
      st.wyw.push([String(k), a[0]]);
      const stos = String(new Error().stack);
      if (obserwuj) obserwuj(String(k), a, stos);
      const w = await f.apply(cel, a);
      if (!st.zrobione && kiedy(String(k), a, stos)) { st.zrobione = true; await akcja(); st.od = st.wyw.length; }
      return w;
    };
  } }));
  st.zdejmij = () => v.setStorageAdapter(baza);
  return st;
}
const ZAPIS = /^(put|remove|write|delete|update)/;
// Po przełączeniu: zapisy i odczyty po kluczu (getSnapshotForUser) — ani jednego.
const poPrzelaczeniu = (st) => st.wyw.slice(st.od).filter(([k]) => ZAPIS.test(k) || k === 'getSnapshotForUser').map(([k]) => k);
// Konto B na tym samym magazynie urządzenia z kopią kart konta A (te same patientId i snapshotId — np. kopia
// zaimportowana); wraca zalogowane konto A. Zwraca { userId, przed } — przed: pełny stan konta B.
async function kontoBzKopia(u, v) {
  const ex = JSON.parse(JSON.stringify(await v.exportSyncPayload()));
  delete ex.credential; delete ex.passkeys; delete ex.passkeyTombstones; ex.userPreferences = {};
  v.lock('manual');
  const konto = await v.createUser(HASLO_B, { label: 'Fikcyjna Druga', iterations: 1000 });
  await v.mergeSyncPayload(ex);
  const przed = JSON.stringify(await pelnyStan(u, v));
  v.lock('manual'); await v.unlockUser(v.__uid, v.__haslo);
  return { userId: konto.userId, przed };
}
const naB = (v, B) => async () => { v.lock('manual'); await v.unlockUser(B.userId, HASLO_B); };
// Wiersz kodu sejfu w funkcji `funkcja` pasujący do re — w stosie wywołań jako „<anonymous>:wiersz:” (new Function
// dokleja dwa wiersze nagłówka; wywołania magazynu spod blokady karty nie mają w stosie nazwy funkcji).
function wierszW(funkcja, re) {
  const l = kod(SEJF.N).split('\n');
  const od = l.findIndex((x) => x.startsWith(`async function ${funkcja}(`));
  const i = l.findIndex((x, j) => j > od && re.test(x));
  if (od < 0 || i < 0 || l.slice(od + 1, i).some((x) => /^(async )?function /.test(x))) throw new Error(`brak wiersza w ${funkcja}`);
  return `<anonymous>:${i + 3}:`;
}
describe('P-KOSZ-PO-KLUCZU — F-R5: miejsce wersji sprawdzane pod blokadami (wyścig) i tylko w sesji „Przywróć”', () => {
  it('wyścig: druga karta przeglądarki K scala Y → Z zaraz po odczycie miejsca x przed blokadami — „Przywróć” sprawdza od nowa i przywraca x w Z, bez pustej karty', async () => {
    const u = await przygotuj();
    await zywaY(u);
    await przebieg(u, 'K←C,P←K');
    const tab2 = await drugaKarta(u.K);
    let przedBlokada = 0;
    const przed = (k, a, stos) => k === 'getSnapshotForUser' && a[1] === u.sid && stos.includes('Bkz_gdzieLezy') && !stos.includes('Bkz_przywrocWSesji');
    const st = hak(u.K, przed, async () => { u.wersje[(await tab2.mergePatients(u.Y, u.Z)).snapshotId] = 'm2'; },
      (k, a, stos) => { if (przed(k, a, stos)) przedBlokada += 1; });
    const w = await przywroc(u, u.K, u.X);
    st.zdejmij();
    expect(st.zrobione, 'druga karta scaliła Y → Z w trakcie').toBe(true);
    expect({ w, przedBlokada }, 'K: przywrócono w Z, miejsce sprawdzone dwa razy przed blokadami').toEqual({ w: 'przywrócono Z', przedBlokada: 2 });
    const s = await pelnyStan(u, u.K);
    expect({ x: await gdzie(u.K, u.sid).then((g) => u.karty[g.pid]), puste: puste(s), wpis: !!(await u.K.listTrashedSnapshots()).find((e) => e.snapshotId === u.sid) }, 'K po „Przywróć”')
      .toEqual({ x: 'Z', puste: [], wpis: false });
  }, 30000);

  it('blokada karty, w której wizyta leży: przypięcie x w Y wywołane w tej samej karcie przeglądarki w trakcie „Przywróć” czeka na nie — x przywrócona i przypięta', async () => {
    const u = await przygotuj();
    await zywaY(u);
    await przebieg(u, 'K←C,P←K');
    const czPrzed = (await pelnyStan(u, u.K)).karty.find((q) => q.karta === 'Y').wersje.find((q) => q.w === 'x').cz;
    przesunZegar(M);
    let pin = null;
    // Zaraz po odczycie wersji karty Y pod blokadami (x stąd bierze „Przywróć”), przed jej zapisem.
    const st = hak(u.K, (k, a, stos) => k === 'listSnapshotsForUser' && a[1] === u.Y && stos.includes('Bkz_przywrocWSesji'), async () => {
      pin = u.K.setSnapshotPinned(u.Y, u.sid, true).then(() => 'ok', (er) => er.code || er.message);
    });
    const w = await u.K.restoreTrashedSnapshot(u.X, u.sid).then((r) => u.karty[r.patientId], (er) => er.code || er.message);
    const p = await pin;
    st.zdejmij();
    const g = await gdzie(u.K, u.sid);
    const xs = (await pelnyStan(u, u.K)).karty.find((q) => q.karta === 'Y').wersje.find((q) => q.w === 'x');
    // Bez blokady Y przypięcie zapisywało rekord x sprzed przywrócenia (rev 2, dawna chwila treści) — znikał stempel
    // przywrócenia, z którym x wygrywa z usunięciem na innych urządzeniach.
    expect({ w, p, karta: u.karty[g.pid], przypieta: !!g.s.pinned, rev: g.s.rev, trescPrzywrocona: xs.cz !== czPrzed, puste: puste(await pelnyStan(u, u.K)) }, 'K: przywrócenie, potem przypięcie (pod blokadą Y)')
      .toEqual({ w: 'Y', p: 'ok', karta: 'Y', przypieta: true, rev: 3, trescPrzywrocona: true, puste: [] });
  }, 30000);

  it('przerwane „Przywróć” w miejscu (zalogowanie od nowa zaraz po zapisie x w Y) — drugie „Przywróć”: już w karcie Y, nagłówek Y nadrobiony, wpis zdjęty', async () => {
    const u = await przygotuj();
    await zywaY(u);
    await przebieg(u, 'K←C,P←K');
    const przed = await pelnyStan(u, u.K);
    const st = hak(u.K, (k, a, stos) => k === 'putSnapshotForUser' && a[1] && a[1].snapshotId === u.sid && stos.includes('Bkz_przywrocWSesji'), async () => {
      u.K.lock('manual'); await u.K.unlockUser(u.K.__uid, u.K.__haslo);
    });
    expect(await przywroc(u, u.K, u.X), 'pierwsze „Przywróć” — przerwane po zapisie wersji').toBe('SESSION_CHANGED');
    st.zdejmij();
    const k = (s, n) => s.karty.find((q) => q.karta === n);
    const s1 = await pelnyStan(u, u.K);
    expect({ x: k(s1, 'Y').wersje.map((q) => `${q.w} r${q.rev}`), Y: k(s1, 'Y').last, wpis: s1.kosz.some((e) => e.w === 'x') }, 'K: x zapisana w Y, nagłówek Y i wpis jeszcze bez zmian')
      .toEqual({ x: ['x r2'], Y: k(przed, 'Y').last, wpis: true });
    expect(await przywroc(u, u.K, u.X), 'drugie „Przywróć”').toBe('już w karcie Y');
    const s2 = await pelnyStan(u, u.K);
    expect({ Y: k(s2, 'Y').last, X: k(s2, 'X').last, wpis: s2.kosz.some((e) => e.w === 'x'), puste: puste(s2) }, 'K: nagłówek Y nadrobiony do chwili zmiany x, X bez zmian')
      .toEqual({ Y: k(s2, 'Y').wersje.find((q) => q.w === 'x').upd, X: k(przed, 'X').last, wpis: false, puste: [] });
  }, 30000);

  it('sesja: konto B z kopią kart A, przełączenie na B zaraz po odczycie miejsca x pod blokadami → SESSION_CHANGED, żadnego zapisu po przełączeniu; po zalogowaniu A x przywrócone w Y', async () => {
    const u = await przygotuj();
    await zywaY(u);
    await przebieg(u, 'K←C,P←K');
    const B = await kontoBzKopia(u, u.K);
    const przedA = JSON.stringify(await pelnyStan(u, u.K));
    const st = hak(u.K, (k, a, stos) => k === 'getSnapshotForUser' && a[1] === u.sid && stos.includes('Bkz_przywrocWSesji'), naB(u.K, B));
    const w = await przywroc(u, u.K, u.X);
    st.zdejmij();
    expect({ zrobione: st.zrobione, w }, 'przełączenie pod blokadami').toEqual({ zrobione: true, w: 'SESSION_CHANGED' });
    expect(st.wyw.slice(st.od).filter(([k]) => ZAPIS.test(k)), 'po przełączeniu żadnego zapisu').toEqual([]);
    expect(JSON.stringify(await pelnyStan(u, u.K)), 'konto B bez zmian').toBe(B.przed);
    u.K.lock('manual'); await u.K.unlockUser(u.K.__uid, u.K.__haslo);
    expect(JSON.stringify(await pelnyStan(u, u.K)), 'konto A bez zmian').toBe(przedA);
    expect(await przywroc(u, u.K, u.X), 'po zalogowaniu A').toBe('przywrócono Y');
    expect(puste(await pelnyStan(u, u.K))).toEqual([]);
  }, 30000);

  it('sesja: przełączenie na B zaraz po odczycie wersji karty wpisu pod blokadami (x tam nie ma) → SESSION_CHANGED przed odczytem miejsca po kluczu — po przełączeniu ani odczytu po kluczu, ani zapisu', async () => {
    const u = await przygotuj();
    await zywaY(u);
    await przebieg(u, 'K←C,P←K');
    const B = await kontoBzKopia(u, u.K);
    const st = hak(u.K, (k, a, stos) => k === 'listSnapshotsForUser' && a[1] === u.X && stos.includes('Bkz_przywrocWSesji'), naB(u.K, B));
    const w = await przywroc(u, u.K, u.X);
    st.zdejmij();
    expect({ zrobione: st.zrobione, w, po: poPrzelaczeniu(st) }, 'przełączenie pod blokadami').toEqual({ zrobione: true, w: 'SESSION_CHANGED', po: [] });
    expect(JSON.stringify(await pelnyStan(u, u.K)), 'konto B bez zmian').toBe(B.przed);
  }, 30000);
});

// --- 4. F-R4: Bgw_wskrzes w delcie ---------------------------------------------------------------------------------------
// Stan M01 (kosz-po-kluczu-krawedzie.test.mjs): X (x1, x) i Z; K: X → Z, K→C, kosz x (pod Z); P (bez wiedzy) przypina x
// w X; C poprawia x na 74, C→K; retencja C przycina Z, C→K (K: wpis retencji x pod Z z cieniem 74); K←P → K X[x:74*] Z[m].
async function M01(u) {
  const m = await krok(() => u.K.mergePatients(u.X, u.Z)); u.wersje[m.snapshotId] = 'm';
  await krok(() => sync(u.K, u.C));
  await krok(() => doKosza(u.K, u.sid));
  await krok(() => u.P.setSnapshotPinned(u.X, u.sid, true));
  await krok(() => poprawMase(u.C, u.sid, 74));
  await krok(() => sync(u.C, u.K));
  await krok(async () => { const r = await u.C.pruneSnapshotsForPatient(u.Z, { recentHours: 0 }); expect(r.prunedIds, 'C: retencja przycina x pod Z').toContain(u.sid); });
  await krok(() => sync(u.C, u.K));
  await krok(() => sync(u.P, u.K));
  expect(widok(await pelnyStan(u, u.K)), 'kontrola: stan M01 na K').toBe('X[x:74*] Z[m]');
}
// Delta karty Z z C (nowa wizyta nz): buildPatientDelta odszyfrowana kluczem C, scalana jak ładunek jawny (bez listy kosza).
async function deltaZ(u) {
  const nz = await krok(() => u.C.savePatient(ola(112, 20), { dedup: false, patientId: u.Z })); u.wersje[nz.snapshotId] = 'nz';
  const d = await u.C.buildPatientDelta(u.Z);
  const delta = JSON.parse(JSON.stringify(await u.C.decryptPayloadForCurrentUser(d.iv, d.data)));
  expect(Array.isArray(delta.snapshotTombstones), 'kontrola: delta bez listy kosza').toBe(false);
  przesunZegar(M);
  await u.K.mergeSyncPayload(delta);
}
describe('P-KOSZ-PO-KLUCZU — F-R4: delta nie odtwarza z cienia wersji, która leży tu pod inną kartą', () => {
  it('M01, potem delta karty Z (nowa wizyta C) na K — x 74* zostaje pod X, bez pustej karty; po rundach ten sam stan na trzech', async () => {
    const u = await przygotuj({ dwie: 'Z' });
    await M01(u);
    await deltaZ(u);
    const s = await pelnyStan(u, u.K);
    expect({ widok: widok(s), puste: puste(s) }, 'K po delcie').toEqual({ widok: 'X[x:74*] Z[nz,m]', puste: [] });
    const r = await przebieg(u, null);
    const w = 'X[x:74*] Z[nz,m]';
    expect(r.widoki, 'po rundach').toEqual({ P: w, K: w, C: w });
    for (const n of ['P', 'K', 'C']) expect(puste(r.st[n]), `${n}: bez pustej karty`).toEqual([]);
    expect(r.zbiezny, 'ten sam pełny stan').toBe(true);
    expect(r.stabilny).toBe(true);
    expect(r.zapisy, 'runda kontrolna bez zapisów').toEqual(ZERO3);
  }, 30000);
  it('kontrola: wersji nie ma tu w żadnej karcie (K usuwa kartę X ze stanu M01) — delta odtwarza x 74* z cienia pod Z, jak dotąd', async () => {
    const u = await przygotuj({ dwie: 'Z' });
    await M01(u);
    await krok(() => u.K.removePatient(u.X));
    expect(widok(await pelnyStan(u, u.K)), 'kontrola: K bez X i bez x').toBe('Z[m] | nagr X');
    await deltaZ(u);
    expect(widok(await pelnyStan(u, u.K)), 'K po delcie: x 74* z cienia pod Z').toBe('Z[nz,m,x:74*] | nagr X');
  }, 30000);
  it('sesja: konto B z kopią kart A, przełączenie na B zaraz po odczycie wersji karty Z w delcie (przed Bgw_wskrzes) → SESSION_CHANGED, po przełączeniu ani odczytu po kluczu, ani zapisu; ta sama delta w A — x 74* pod X', async () => {
    const u = await przygotuj({ dwie: 'Z' });
    await M01(u);
    const B = await kontoBzKopia(u, u.K);
    const nz = await krok(() => u.C.savePatient(ola(112, 20), { dedup: false, patientId: u.Z })); u.wersje[nz.snapshotId] = 'nz';
    const d = await u.C.buildPatientDelta(u.Z);
    const delta = JSON.parse(JSON.stringify(await u.C.decryptPayloadForCurrentUser(d.iv, d.data)));
    const wiersz = wierszW('Bkz_scalKoniec', /const wersje = nagrobki\.length \|\| Bgw_tu\.length \? await I\(\)\.listSnapshotsForUser\(b, patientId\)/);
    const st = hak(u.K, (k, a, stos) => k === 'listSnapshotsForUser' && a[1] === u.Z && stos.includes(wiersz), naB(u.K, B));
    przesunZegar(M);
    let wynik;
    try { await u.K.mergeSyncPayload(JSON.parse(JSON.stringify(delta))); wynik = 'ok'; } catch (er) { wynik = er.code || er.message; }
    st.zdejmij();
    expect({ zrobione: st.zrobione, wynik, po: poPrzelaczeniu(st) }, 'przełączenie w pętli kart delty').toEqual({ zrobione: true, wynik: 'SESSION_CHANGED', po: [] });
    expect(JSON.stringify(await pelnyStan(u, u.K)), 'konto B bez zmian').toBe(B.przed);
    u.K.lock('manual'); await u.K.unlockUser(u.K.__uid, u.K.__haslo);
    await u.K.mergeSyncPayload(JSON.parse(JSON.stringify(delta)));
    const s = await pelnyStan(u, u.K);
    expect({ widok: widok(s), puste: puste(s) }, 'konto A po tej samej delcie').toEqual({ widok: 'X[x:74*] Z[nz,m]', puste: [] });
  }, 30000);
});

// --- 5. F-R1 (znane ograniczenie): wpisy kosza duplikatu, który zniknął ---------------------------------------------------
describe('P-KOSZ-PO-KLUCZU — F-R1 (znane ograniczenie): wpisy kosza starego duplikatu, który zniknął, nie mają karty', () => {
  const ukryte = async (u, v) => (await v.listTrashedSnapshots()).filter((e) => !e.patientExists).map((e) => `${u.wersje[e.snapshotId]}@${u.karty[e.patientId]}`).sort();
  it('K: X → Y → Z; P (bez wiedzy) daje do kosza x1 i x3 w X; K daje do kosza x; P←K — X znika z P, x1 i x3 w koszu bez karty, „Przywróć” — brak-karty na trzech', async () => {
    const u = await przygotuj();
    for (const [z, na, m] of [['X', 'Y', 'm1'], ['Y', 'Z', 'm2']]) u.wersje[(await krok(() => u.K.mergePatients(u[z], u[na]))).snapshotId] = m;
    for (const s of [u.x1, u.x3]) await krok(() => u.P.moveSnapshotToTrash(u.X, s, { odepnij: true }));
    await krok(() => doKosza(u.K, u.sid));
    await krok(() => sync(u.K, u.P));
    expect({ widok: widok(await pelnyStan(u, u.P)), ukryte: await ukryte(u, u.P) }, 'P←K: bez X')
      .toEqual({ widok: 'Z[m2,m1,z,y] | kosz x@Z:23 kosz x1@X:20 kosz x3@X:25 | nagr X,Y', ukryte: ['x1@X', 'x3@X'] });
    expect(await przywroc(u, u.P, u.X, u.x1), 'P: „Przywróć” x1').toBe('brak-karty');
    const r = await przebieg(u, null);
    const w = 'Z[m2,m1,z,y] | kosz x@Z:23 kosz x1@X:20 kosz x3@X:25 | nagr X,Y';
    expect(r.widoki, 'po rundach').toEqual({ P: w, K: w, C: w });
    expect(r.zbiezny).toBe(true);
    for (const n of ['P', 'K', 'C']) {
      expect(await ukryte(u, u[n]), `${n}: x1 i x3 bez karty`).toEqual(['x1@X', 'x3@X']);
      expect(await przywroc(u, u[n], u.X, u.x3), `${n}: „Przywróć” x3`).toBe('brak-karty');
    }
  }, 30000);
  it('kontrola (tak samo jak dotąd): K daje do kosza x1 w X, potem scala X → Y → Z — „Przywróć” x1 — brak-karty na trzech', async () => {
    const u = await przygotuj();
    await krok(() => u.K.moveSnapshotToTrash(u.X, u.x1, { odepnij: true }));
    for (const [z, na, m] of [['X', 'Y', 'm1'], ['Y', 'Z', 'm2']]) u.wersje[(await krok(() => u.K.mergePatients(u[z], u[na]))).snapshotId] = m;
    const r = await przebieg(u, null);
    expect(r.zbiezny).toBe(true);
    for (const n of ['P', 'K', 'C']) {
      expect(await ukryte(u, u[n]), `${n}: x1 bez karty`).toEqual(['x1@X']);
      expect(await przywroc(u, u[n], u.X, u.x1), `${n}: „Przywróć” x1`).toBe('brak-karty');
    }
  }, 30000);
});
