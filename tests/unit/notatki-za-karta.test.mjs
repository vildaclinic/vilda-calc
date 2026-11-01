import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-NOTATKI-ZA-KARTA (D-21 wariant A, decyzje właściciela 2026-10-21 D21-1..9, przyjęte rekomendacje). Karta, która
// przeżyła „Usuń pacjenta” (zmiana na innym urządzeniu po usunięciu, P-ZMIANA-W-KARCIE), wracała BEZ notatek: nagrobki
// notatek z „Usuń pacjenta” wygrywały samą datą na każdym urządzeniu. Teraz nagrobek notatki z „Usuń pacjenta” niesie
// pole deletedWithPatient {patientId, deletedAtISO: e, manualDeletedAtISO?}; po fazie kart nagrobek przegrywa z kartą,
// której lastSavedAtISO > e (RATUNEK: R + 1 ms + h, rev bez zmian), a gdy karta jest, ale nie jest późniejsza (usunięcie
// karty jeszcze nie doszło) — notatka zostaje razem z nagrobkiem (CZEKA). Ręczne usunięcie sprzed „Usuń pacjenta” nie
// wraca (krata M), echo starej aplikacji bez pola z tą samą chwilą nie odbiera pola.
// Prawdziwy vilda_vault.js, sejfy w pamięci (createInMemoryAdapter; w T26 także atrapa IndexedDB), sztuczny zegar, dane
// wyłącznie fikcyjne. Urządzenie „stare” (346dd81a, aplikacja sprzed D-21; kod notatek ten sam co w db0c2d50 =
// 54a84da3) to EMULACJA: adapter ucina pole (jak stary adapter z białą listą), a ładunek przed scaleniem traci pole
// (stare Le go nie zna) — reszta kodu jest wspólna. Emulacja jest wierna dla scalania ładunku synchronizacji (d.scal) i
// zapisu nagrobków przez adapter (bez pola nowa reguła daje wynik dzisiejszy, T15; przegląd przeniesienia na D-7: 1693
// z 1693 obserwacji stanu tego pliku jak z prawdziwym 346dd81a, po jego poprawkach 2262 z 2262 przy 182 testach, w tym
// 256 na starych urządzeniach; po domknięciu przeglądu poprawki MS2 2537 z 2537 przy 185 testach, w tym 271; po
// przeglądzie po scaleniu (uwaga Codexa P1) 2758 z 2758 przy 201 testach, w tym 295; po przeglądzie poprawki P1 3130 z
// 3130 przy 214 testach, w tym 307; po jego weryfikacji 2 3959 z 3959 przy 225 testach, w tym 307, a po scaleniu audyt
// z blokiem K9 z #754 3987 z 3987 przy 227 testach, w tym 307). NIE obejmuje kopii konta na starym urządzeniu:
// mergeVaultBackup, previewVaultBackupMerge i restoreVaultBackup szłyby tam nowym kodem z polem, a prawdziwa stara
// aplikacja kasuje wtedy notatki „jak dziś” (zgł. E2) — na urządzeniu „stara” te metody rzucają błąd (taki test wymaga
// prawdziwego starszego sejfu, jak uprzęże floty spoza repozytorium). Opcja zegar (ms) — zegar urządzenia przesunięty
// względem wspólnego (Z1). [CZERWONY na db0c2d50] — przypadki, które na bazie dają wynik inny niż oczekiwany (lista w
// opisie zmiany); kod notatek na 346dd81a (D-7) jest ten sam. [CZERWONY na 12b0cd4d] — przegląd przeniesienia na D-7
// (MS2); na 12b0cd4d czerwone są też W14a i W11 z domknięcia przeglądu poprawki MS2 (opis przy nich). [CZERWONY na
// 95b6f96e] — przegląd po scaleniu (uwaga Codexa P1 do #746) i przegląd poprawki P1 (recenzje F1, R2; opis przy
// blokach). [CZERWONY na 6db54b78] — weryfikacja 2 przeglądu poprawki P1 (W1, pętla zdejmowania nagrobków; opis przy
// bloku, tam też G13w — luka testów W2, czerwony na 83c04d5b — i ścieżka błędu RZ0e, K1e). [kontrola] — kontrola wobec
// bazy (T4, T7, T19–T22, M6, M7, P1-1k, P1-4k, S2, K1 przed i po scaleniu, K9k, K9d: wynik jak dotąd) albo wobec
// wariantu lub znanego ograniczenia z tego samego bloku (R10c, R10d z nowym O, P5, CZ3b, SP1, EL1, OD2 z nowym D, HD z
// nowym C, T26c z zapasem, S8a, S8c, Z1 z ręcznym nagrobkiem przed ratunkiem): te drugie są na db0c2d50 czerwone z
// powodu zachowania (bez ratunku notatki nie wracają; T26c — nagrobek bez pola). [znane ograniczenie] — test przypina
// opisany wynik. [CZERWONY na ab8ead6] — przegląd poprawki P1 (F2, starsze niż D-21): nagrobek karty cofany przez
// scalanie w drugiej karcie przeglądarki (K9, K9o; blok K9).

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function magazyn() {
  const m = Object.create(null);
  return {
    getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; }, key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
  };
}

/* Atrapa Web Locks (jak w sync-wlasciciel-wersji.test.mjs): blokada wyłączna na nazwę, kolejka FIFO, `ifAvailable`,
   `signal`; liczy żądania po nazwie. */
function atrapaLocks() {
  const stan = new Map(), zadania = [];
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
    zadania,
    request(n, opcje, cb) {
      if (typeof opcje === 'function') { cb = opcje; opcje = {}; }
      zadania.push(n);
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
function odroczone() {
  let rozwiaz;
  const obietnica = new Promise((r) => { rozwiaz = r; });
  return { obietnica, rozwiaz };
}

/* Magazyn owinięty: liczy wywołania; pulapka(metoda, warunek) wstrzymuje pierwsze pasujące wywołanie PO wykonaniu
   (wynik już odczytany), aż test je zwolni; hak(metoda, argumenty) — opcjonalnie po każdym wywołaniu (np. zegar
   biegnący w trakcie „Usuń pacjenta”). */
function owin(adapter) {
  const licz = Object.create(null), pulapki = [], ref = { hak: null };
  const owiniety = new Proxy(adapter, {
    get(cel, klucz) {
      const f = cel[klucz];
      if (typeof f !== 'function') return f;
      return async function (...args) {
        licz[klucz] = (licz[klucz] || 0) + 1;
        const wynik = await f.apply(cel, args);
        if (ref.hak) ref.hak(klucz, args);
        for (const p of pulapki) {
          if (p.zuzyta || p.metoda !== klucz || !p.warunek(...args)) continue;
          p.zuzyta = true;
          p.osiagnieta.rozwiaz();
          await p.zwolnienie.obietnica;
        }
        return wynik;
      };
    },
  });
  function pulapka(metoda, warunek) {
    const p = { metoda, warunek, zuzyta: false, osiagnieta: odroczone(), zwolnienie: odroczone() };
    pulapki.push(p);
    return { osiagnieta: p.osiagnieta.obietnica, zwolnij: () => p.zwolnienie.rozwiaz() };
  }
  const zeruj = () => { Object.keys(licz).forEach((k) => { delete licz[k]; }); };
  return { owiniety, licz, pulapka, zeruj, hak: (f) => { ref.hak = f; } };
}

function okno(opcje = {}) {
  const win = {
    crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: magazyn(), sessionStorage: magazyn(),
    setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
    addEventListener() {}, removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {}, hidden: false }, AbortController,
  };
  if (opcje.locks) win.navigator = { locks: opcje.locks };
  if (opcje.indexedDB) win.indexedDB = opcje.indexedDB;
  win.window = win; win.self = win; win.top = win;
  win.localStorage.setItem('vildaRetention', '0');
  loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_retention.js', win);
  loadBrowserScript('vilda_vault.js', win);
  return win;
}

const kopia = (x) => { const y = JSON.parse(JSON.stringify(x)); if (y && typeof y === 'object') delete y.credential; return y; };
// Emulacja starej aplikacji (346dd81a): pole ucinane w ładunku przed scaleniem i w adapterze.
const bezPola = (p) => { const y = kopia(p); (y.patientNoteTombstones || []).forEach((t) => { delete t.deletedWithPatient; }); return y; };
function adapterStarej(baza) {
  return new Proxy(baza, {
    get(cel, klucz) {
      const f = cel[klucz];
      if (typeof f !== 'function') return f;
      if (klucz === 'putPatientNoteTombstoneForUser') {
        return (u, n) => { const c = Object.assign({}, n); delete c.deletedWithPatient; return f.call(cel, u, c); };
      }
      return f.bind(cel);
    },
  });
}

// Zgł. E2 (przegląd przeniesienia na D-7): kopia konta na starym urządzeniu jest poza emulacją — zamiast po cichu iść
// nowym kodem z polem, metoda rzuca.
const KOPIA_KONTA_STAREJ = ['mergeVaultBackup', 'previewVaultBackupMerge', 'restoreVaultBackup'];
// Zegar urządzenia (opcje.zegar, ms względem wspólnego sztucznego zegara): każde wywołanie API urządzenia działa na
// przesuniętym zegarze, potem zegar wraca (wywołania w testach idą po kolei).
function naZegarze(przes, f) {
  vi.setSystemTime(zegar + przes);
  let w;
  try { w = f(); } catch (er) { vi.setSystemTime(zegar); throw er; }
  if (w && typeof w.then === 'function') return w.finally(() => { vi.setSystemTime(zegar); });
  vi.setSystemTime(zegar);
  return w;
}
function apiUrzadzenia(v, opcje) {
  if (!opcje.stara && !opcje.zegar) return v;
  return new Proxy(v, {
    get(cel, klucz) {
      const f = cel[klucz];
      if (typeof f !== 'function') return f;
      if (opcje.stara && KOPIA_KONTA_STAREJ.includes(klucz)) {
        return async () => { throw new Error(`emulacja starej aplikacji nie obejmuje kopii konta (${klucz}) — potrzebny prawdziwy starszy sejf`); };
      }
      return opcje.zegar ? (...a) => naZegarze(opcje.zegar, () => f.apply(cel, a)) : f.bind(cel);
    },
  });
}

let licznik = 0;
async function urzadzenie(nazwa, opcje = {}) {
  licznik += 1;
  const win = okno(opcje);
  const v0 = win.VildaVault;
  const baza = v0.createInMemoryAdapter();
  const o = owin(opcje.stara ? adapterStarej(baza) : baza);
  v0.setStorageAdapter(o.owiniety);
  const v = apiUrzadzenia(v0, opcje);
  const haslo = `Notatki#ZaKarta!2026${licznik}aa`;
  const u = await v.createUser(haslo, { label: `${nazwa}${licznik}`, iterations: 10000 });
  const d = { nazwa, v, win, baza, uid: u.userId, haslo, stara: !!opcje.stara, licz: o.licz, pulapka: o.pulapka, zeruj: o.zeruj, hak: o.hak, zdarzenia: [] };
  d.scal = (p, op) => v.mergeSyncPayload(d.stara ? bezPola(p) : kopia(p), op);
  v.onPatientNoteChanged((e) => { d.zdarzenia.push(e); });
  return d;
}

let zegar = Date.parse('2026-10-21T09:00:00Z');
function przesun(ms) { zegar += ms; vi.setSystemTime(zegar); return new Date(zegar).toISOString(); }
function sztucznyZegar() { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(zegar); }
afterEach(() => { vi.useRealTimers(); });

const jan = (h, w) => ({ name: 'Testowy Jan', user: { lastName: 'Testowy', firstName: 'Jan', dobISO: '2016-03-12', sex: 'M', height: h, weight: w } });
const wizyta = (d, x, h = 130) => { przesun(60e3); return d.v.savePatient(jan(h, 26), { dedup: false, patientId: x.pid }); };
// Chmura = ostatni pełny ładunek (pobierz, scal, wyślij).
function chmura() {
  let blob = null;
  return { async sync(d) { przesun(5e3); if (blob) await d.scal(blob); blob = kopia(await d.v.exportSyncPayload()); } };
}
// A: karta Jana z 2 wersjami i notatkami; reszta urządzeń dostaje komplet (2 rundy chmury).
async function przygotuj(urz, nazwyNotatek = ['n1', 'n2']) {
  sztucznyZegar();
  const x = { urz: {}, nn: {}, c: chmura() };
  for (const [n, o] of Object.entries(urz)) x.urz[n] = await urzadzenie(n, o);
  const A = x.urz.A;
  przesun(60e3); const k = await A.v.savePatient(jan(120, 22), { dedup: false });
  przesun(60e3); await A.v.savePatient(jan(125, 24), { dedup: false, patientId: k.patientId });
  for (const t of nazwyNotatek) { przesun(1000); const n = await A.v.savePatientNote({ patientId: k.patientId, title: t, body: 'fikcja ' + t }); x.nn[n.id] = t; }
  x.pid = k.patientId;
  for (let r = 0; r < 2; r += 1) for (const n of Object.keys(x.urz)) await x.c.sync(x.urz[n]);
  x.id = (t) => Object.keys(x.nn).find((q) => x.nn[q] === t);
  return x;
}
// Stan urządzenia: karta (albo SIEROTY — notatki bez karty), notatki (=treść, gdy nie fikcyjna), nagrobki notatek
// (+pole — deletedWithPatient, +r — manualDeletedAtISO).
async function stan(d, x) {
  const karta = (await d.v.listPatients()).some((p) => p.patientId === x.pid);
  const notatki = (await d.v.listAllPatientNotes()).filter((n) => n.patientId === x.pid)
    .map((n) => `${x.nn[n.id] || n.title}${n.body && !n.body.startsWith('fikcja') ? '=' + n.body : ''}`).sort();
  const exp = kopia(await d.v.exportSyncPayload());
  const nag = (exp.patientNoteTombstones || []).map((t) => (x.nn[t.id] || '?') + (t.deletedWithPatient ? '+pole' : '')
    + (t.deletedWithPatient && t.deletedWithPatient.manualDeletedAtISO ? '+r' : '')).sort();
  return `${karta ? 'karta' : (notatki.length ? 'SIEROTY' : 'BRAK')} [${notatki.join(',')}] nagr[${nag.join(',')}]`;
}
async function meta(d, x) {
  return (await d.v.listAllPatientNotes()).filter((n) => n.patientId === x.pid).map((n) => `${x.nn[n.id]}:${n.updatedAtISO}:r${n.rev}`).sort();
}
async function migawka(x, nazwy) { const o = {}; for (const n of nazwy) o[n] = await stan(x.urz[n], x); return o; }
async function rundy(x, kolej, ile, nazwy = kolej) {
  const hist = [];
  for (let r = 0; r < ile; r += 1) for (const k of kolej) { await x.c.sync(x.urz[k]); hist.push(JSON.stringify(await migawka(x, nazwy))); }
  const ost = JSON.parse(hist[hist.length - 1]);
  return { ost, stabilne: hist[hist.length - 1] === hist[hist.length - 1 - kolej.length], zbiezne: nazwy.every((q) => ost[q] === ost[nazwy[0]]) };
}
const nagrobkiNotatek = async (d) => (await d.baza.listPatientNoteTombstonesForUser(d.uid)).map(kopia);
const nagrobekKarty = async (d, pid) => (await d.baza.listTombstonesForUser(d.uid)).find((t) => t.patientId === pid) || null;

// Delty jak vilda_sync_integration.js: onPatientSaved → buildPatientDelta, onPatientDeleted → buildTombstoneDelta,
// onPatientNoteChanged → buildNoteTombstoneDelta (delete) albo buildNoteDelta (pozostałe, także „merge”).
function nagrywaj(d, pomin = {}) {
  d.delty = [];
  const dodaj = (typ, f) => d.delty.push({ typ, p: Promise.resolve().then(f) });
  d.v.onPatientSaved((e) => { if (e && e.patientId) dodaj('karta', () => d.v.buildPatientDelta(e.patientId)); });
  d.v.onPatientDeleted((e) => { if (e && e.patientId && !pomin.nagrPac) dodaj('nagrPac', () => d.v.buildTombstoneDelta(e.patientId, e.deletedAtISO)); });
  d.v.onPatientNoteChanged((e) => {
    if (!e || !e.id) return;
    if (e.action === 'delete') dodaj('nagrNot', () => d.v.buildNoteTombstoneDelta(e.id, e.deletedAtISO));
    else if (e.action !== 'merge-delete') dodaj('notatka', () => d.v.buildNoteDelta(e.id));
  });
}
async function dostarcz(z, na, filtr = () => true) {
  const wez = z.delty.filter((q) => filtr(q.typ));
  z.delty = z.delty.filter((q) => !filtr(q.typ));
  const log = [];
  for (const q of wez) {
    const w = await q.p;
    if (!w || !w.iv) continue;
    const j = kopia(await z.v.decryptPayloadForCurrentUser(w.iv, w.data));
    przesun(1000); await na.scal(j);
    log.push(q.typ + (q.typ === 'nagrNot' && j.patientNoteTombstones[0].deletedWithPatient ? '+pole' : ''));
  }
  return log;
}

describe('P-NOTATKI-ZA-KARTA — pełne ładunki, wszystkie urządzenia nowe', () => {
  // T1 [CZERWONY na db0c2d50]: dotąd karta bez notatek i nagrobki n1–n3 na każdym urządzeniu.
  for (const kolej of [['A', 'B'], ['B', 'A'], ['A', 'C', 'B'], ['C', 'B', 'A'], ['B', 'C', 'A']]) {
    it(`T1 A usuwa ręcznie n3, potem pacjenta; B offline dopisuje wizytę; ${kolej.join('→')}: karta [n1,n2], nagrobek tylko n3, te same (rev, updatedAtISO) wszędzie`, async () => {
      const x = await przygotuj(Object.fromEntries(kolej.map((k) => [k, {}])), ['n1', 'n2', 'n3']);
      przesun(60e3); await x.urz.A.v.removePatientNote(x.id('n3'));
      przesun(60e3); await x.urz.A.v.removePatient(x.pid);
      await wizyta(x.urz.B, x);
      const w = await rundy(x, kolej, 4);
      expect(w.zbiezne && w.stabilne, JSON.stringify(w.ost)).toBe(true);
      expect(w.ost.A).toBe('karta [n1,n2] nagr[n3]');
      const m = {};
      for (const k of kolej) m[k] = await meta(x.urz[k], x);
      for (const k of kolej) expect(m[k], `uratowane wersje identyczne na ${k}`).toEqual(m.A);
      expect(m.A.every((s) => s.endsWith(':r1')), 'rev bez zmian').toBe(true);
    });
  }

  // T4 kontrola: B nic nie robi — wszystko znika; nagrobki n1 i n2 z polem (n3 ręcznie — bez pola).
  it('T4 [kontrola] B nic nie robi: karta i notatki znikają wszędzie; nagrobki z „Usuń pacjenta” z polem', async () => {
    const x = await przygotuj({ A: {}, B: {}, C: {} }, ['n1', 'n2', 'n3']);
    przesun(60e3); await x.urz.A.v.removePatientNote(x.id('n3'));
    przesun(60e3); await x.urz.A.v.removePatient(x.pid);
    const w = await rundy(x, ['B', 'A', 'C'], 3, ['A', 'B', 'C']);
    expect(w.zbiezne && w.stabilne).toBe(true);
    expect(w.ost.C).toBe('BRAK [] nagr[n1+pole,n2+pole,n3]');
  });

  // T8 (H1, D21-2) [CZERWONY na db0c2d50: dotąd wszystko znika]: ręczne usunięcie n1 na B przed „Usuń pacjenta” na A
  // (A o nim nie wie) trafia do kraty (M); stare n1 z C nie wraca.
  it('T8 H1: B ręcznie usuwa n1 przed „Usuń pacjenta” na A; B dopisuje wizytę; C ma stare n1 → [n2], n1 zostaje usunięta', async () => {
    const x = await przygotuj({ A: {}, B: {}, C: {} });
    przesun(60e3); await x.urz.B.v.removePatientNote(x.id('n1'));
    przesun(60e3); await x.urz.A.v.removePatient(x.pid);
    await wizyta(x.urz.B, x);
    const w = await rundy(x, ['A', 'B', 'C'], 4);
    expect(w.zbiezne && w.stabilne, JSON.stringify(w.ost)).toBe(true);
    expect(w.ost.A).toBe('karta [n2] nagr[n1+pole+r]');
  });

  // T9 (H2/E2) [CZERWONY na db0c2d50]: nieświadome C usuwa ręcznie n1 2 min po „Usuń pacjenta” — usunięcie wygrywa
  // (jego chwila > R + 1 s, a ratunek daje najwyżej R + 1 s).
  it('T9 H2: C (nie wie o usunięciu) ręcznie usuwa n1 2 min po „Usuń pacjenta” → [n2]', async () => {
    const x = await przygotuj({ A: {}, B: {}, C: {} });
    przesun(60e3); await x.urz.A.v.removePatient(x.pid);
    await wizyta(x.urz.B, x);
    przesun(60e3); await x.urz.C.v.removePatientNote(x.id('n1'));
    const w = await rundy(x, ['A', 'B', 'C'], 4);
    expect(w.zbiezne && w.stabilne).toBe(true);
    expect(w.ost.A).toBe('karta [n2] nagr[n1]');
  });

  // T10 (H2b, D21-3: wyjątek zaakceptowany i opisany) [CZERWONY na db0c2d50: dotąd wszystko znika]. C usuwa n1 ręcznie
  // PRZED „Usuń pacjenta”, ale wysyła to dopiero po ratunku: n1 wraca (widoczna; wystarczy usunąć ponownie).
  it('T10 H2b (znane ograniczenie): ręczne usunięcie n1 na C przed „Usuń pacjenta”, wysłane po ratunku → n1 wraca', async () => {
    const x = await przygotuj({ A: {}, B: {}, C: {} });
    przesun(60e3); await x.urz.C.v.removePatientNote(x.id('n1'));
    przesun(60e3); await x.urz.A.v.removePatient(x.pid);
    await wizyta(x.urz.B, x);
    await rundy(x, ['A', 'B'], 2, ['A', 'B']);
    const w = await rundy(x, ['C', 'A', 'B'], 3, ['A', 'B', 'C']);
    expect(w.zbiezne && w.stabilne).toBe(true);
    expect(w.ost.C).toBe('karta [n1,n2] nagr[]');
  });

  // T11 (D21-4: rev bez zmian) — poprawka E (rev 2) sprzed usunięcia, której A nie znało, wygrywa wszędzie.
  it('T11 E poprawiło n1 (rev 2) przed usunięciem, A tej poprawki nie znało → wszędzie n1 = poprawka E, rev 2', async () => {
    const x = await przygotuj({ A: {}, B: {}, E: {} }, ['n1', 'n2', 'n3']);
    przesun(30e3);
    const [n1] = (await x.urz.E.v.listPatientNotesForPatient(x.pid)).filter((n) => x.nn[n.id] === 'n1');
    await x.urz.E.v.savePatientNote({ ...n1, body: 'poprawka E' });
    przesun(60e3); await x.urz.A.v.removePatientNote(x.id('n3'));
    przesun(60e3); await x.urz.A.v.removePatient(x.pid);
    await wizyta(x.urz.B, x);
    const w = await rundy(x, ['A', 'B', 'E'], 4);
    expect(w.zbiezne && w.stabilne).toBe(true);
    expect(w.ost.A).toBe('karta [n1=poprawka E,n2] nagr[n3]');
    const m = await meta(x.urz.B, x);
    expect(m.find((s) => s.startsWith('n1:'))).toMatch(/:r2$/);
    expect(await meta(x.urz.E, x)).toEqual(m);
  });

  // T13 (H3, D21-5) [CZERWONY na db0c2d50: dotąd wszystko znika]: dwie różne równoległe poprawki n1 (obie rev 2) —
  // ratunek daje im różne chwile (h z treści), więc wszędzie zostaje ta sama; bez h zostawał trwały rozjazd.
  it('T13 H3: B i C równolegle poprawiają n1 (rev 2); A usuwa pacjenta; B i C dopisują wizyty i przyjmują usunięcie od A → jedna wersja n1 wszędzie', async () => {
    const x = await przygotuj({ A: {}, B: {}, C: {} });
    przesun(60e3); await x.urz.B.v.savePatientNote({ id: x.id('n1'), patientId: x.pid, title: 'n1', body: 'wersja B' });
    przesun(60e3); await x.urz.C.v.savePatientNote({ id: x.id('n1'), patientId: x.pid, title: 'n1', body: 'wersja C' });
    przesun(60e3); await x.urz.A.v.removePatient(x.pid);
    await wizyta(x.urz.B, x);
    await wizyta(x.urz.C, x, 131);
    const pA = kopia(await x.urz.A.v.exportSyncPayload());
    przesun(1000); await x.urz.B.scal(pA);
    przesun(1000); await x.urz.C.scal(pA);
    const mB = await meta(x.urz.B, x), mC = await meta(x.urz.C, x);
    expect(mB.find((s) => s.startsWith('n1:')), 'różne poprawki — różne chwile ratunku').not.toBe(mC.find((s) => s.startsWith('n1:')));
    const w = await rundy(x, ['B', 'C', 'A'], 4);
    expect(w.zbiezne && w.stabilne, JSON.stringify(w.ost)).toBe(true);
    expect(w.ost.A).toMatch(/^karta \[n1=wersja [BC],n2\] nagr\[\]$/);
    expect(await meta(x.urz.A, x)).toEqual(await meta(x.urz.B, x));
    expect(await meta(x.urz.C, x)).toEqual(await meta(x.urz.B, x));
  });

  // T22 (H5): zegar A +1 h przy usuwaniu — B zmienia kartę przed tą (przyszłą) chwilą, więc karta i notatki znikają.
  it('T22 H5: zegar A +1 h przy usuwaniu → karta i notatki znikają, bez sierot', async () => {
    const x = await przygotuj({ A: {}, B: {} });
    przesun(60e3);
    vi.setSystemTime(zegar + 3600e3); await x.urz.A.v.removePatient(x.pid); vi.setSystemTime(zegar);
    await wizyta(x.urz.B, x);
    const w = await rundy(x, ['A', 'B'], 3);
    expect(w.zbiezne && w.stabilne).toBe(true);
    expect(w.ost.B).toBe('BRAK [] nagr[n1+pole,n2+pole]');
  });

  // T23 (G13) [CZERWONY na db0c2d50]: notatka z updatedAtISO 1 h w przyszłości — nagrobek ma D = u (Eb: max(teraz, u)),
  // o przeżyciu decyduje e (nagrobek karty), a ratunek daje R + 1 ms + h.
  it('T23 G13: notatka z updatedAtISO 1 h w przyszłości → D = u, ratunek R + 1 ms + h (h < 1000 ms), decyduje e', async () => {
    const x = await przygotuj({ A: {}, B: {} });
    vi.setSystemTime(zegar + 3600e3);
    await x.urz.A.v.savePatientNote({ id: x.id('n1'), patientId: x.pid, title: 'n1', body: 'z przyszłości' });
    vi.setSystemTime(zegar);
    const u = (await x.urz.A.v.listAllPatientNotes()).find((n) => n.id === x.id('n1')).updatedAtISO;
    await rundy(x, ['A', 'B'], 1);
    przesun(60e3); await x.urz.A.v.removePatient(x.pid);
    const D = (await nagrobkiNotatek(x.urz.A)).find((t) => t.id === x.id('n1'));
    const e = (await nagrobekKarty(x.urz.A, x.pid)).deletedAtISO;
    expect(D.deletedAtISO, 'D = u (G13)').toBe(u);
    expect(D.deletedWithPatient.deletedAtISO, 'pole niesie e, nie D').toBe(e);
    await wizyta(x.urz.B, x);
    const w = await rundy(x, ['A', 'B'], 3);
    expect(w.ost.A).toBe('karta [n1=z przyszłości,n2] nagr[]');
    const n1 = (await x.urz.B.v.listAllPatientNotes()).find((n) => n.id === x.id('n1'));
    const roznica = Date.parse(n1.updatedAtISO) - Date.parse(u);
    expect(roznica).toBeGreaterThanOrEqual(1);
    expect(roznica).toBeLessThanOrEqual(1000);
  });

  // T24 (H6): drugie „Usuń pacjenta” po ratunku — nowe e jest późniejsze niż karta, nowe nagrobki późniejsze niż u′.
  it('T24 drugie „Usuń pacjenta” po ratunku → wszystko znika, zbieżnie', async () => {
    const x = await przygotuj({ A: {}, B: {} });
    przesun(60e3); await x.urz.A.v.removePatient(x.pid);
    await wizyta(x.urz.B, x);
    const w1 = await rundy(x, ['B', 'A'], 2);
    expect(w1.ost.A).toBe('karta [n1,n2] nagr[]');
    przesun(60e3); await x.urz.A.v.removePatient(x.pid);
    const w = await rundy(x, ['A', 'B'], 3);
    expect(w.zbiezne && w.stabilne).toBe(true);
    expect(w.ost.B).toBe('BRAK [] nagr[n1+pole,n2+pole]');
  });

  // T25 (D21-4): poprawka A (rev 2) przepadła razem z usunięciem; B ma rev 1 — wraca rev 1.
  it('T25 wersja rev 1 przy nagrobku rev 2 (poprawka A przepadła razem z A) → wraca rev 1', async () => {
    const x = await przygotuj({ A: {}, B: {} });
    przesun(30e3); await x.urz.A.v.savePatientNote({ id: x.id('n1'), patientId: x.pid, title: 'n1', body: 'poprawka A' });
    przesun(30e3); await x.urz.A.v.removePatient(x.pid);
    expect((await nagrobkiNotatek(x.urz.A)).find((t) => t.id === x.id('n1')).rev).toBe(2);
    await wizyta(x.urz.B, x);
    const w = await rundy(x, ['A', 'B'], 3);
    expect(w.zbiezne && w.stabilne).toBe(true);
    expect(w.ost.A).toBe('karta [n1,n2] nagr[]');
    expect((await meta(x.urz.A, x)).find((s) => s.startsWith('n1:'))).toMatch(/:r1$/);
  });
});

describe('P-NOTATKI-ZA-KARTA — same delty i stan „czeka” (D21-6)', () => {
  // T5 [CZERWONY na db0c2d50]: same delty, B zmienił kartę przed deltami. Bez ls czytającego rekord ze sklepu delta
  // szła bez pola i B kasował notatki, zanim przyszedł pełny ładunek.
  it('T5 same delty; B zmienił kartę przed deltami → [n1,n2] na A i B; delta nagrobka niesie pole', async () => {
    const x = await przygotuj({ A: {}, B: {} }, ['n1', 'n2', 'n3']);
    const { A, B } = x.urz;
    nagrywaj(A); nagrywaj(B);
    przesun(60e3); await A.v.removePatientNote(x.id('n3'));
    przesun(60e3); await A.v.removePatient(x.pid);
    await wizyta(B, x);
    const log = await dostarcz(A, B);
    expect(log).toEqual(['nagrNot', 'nagrNot+pole', 'nagrNot+pole', 'nagrPac']);
    for (let r = 0; r < 3; r += 1) { await dostarcz(B, A); await dostarcz(A, B); }
    expect(await stan(A, x)).toBe('karta [n1,n2] nagr[n3]');
    expect(await stan(B, x)).toBe('karta [n1,n2] nagr[n3]');
  });

  // T6 [CZERWONY na db0c2d50]: nagrobki notatek docierają na B przed zmianą karty, nagrobek karty po niej. Pośrodku B
  // widzi notatki (CZEKA), potem ratunek przy nagrobku karty.
  it('T6 delty w oknie: nagrobki notatek → wizyta na B → nagrobek karty: [n1,n2]; pośrodku CZEKA', async () => {
    const x = await przygotuj({ A: {}, B: {} }, ['n1', 'n2', 'n3']);
    const { A, B } = x.urz;
    nagrywaj(A); nagrywaj(B);
    przesun(60e3); await A.v.removePatientNote(x.id('n3'));
    przesun(60e3); await A.v.removePatient(x.pid);
    await dostarcz(A, B, (t) => t === 'nagrNot');
    expect(await stan(B, x), 'CZEKA: karta jest, nie jest późniejsza').toBe('karta [n1,n2] nagr[n1+pole,n2+pole,n3]');
    await wizyta(B, x);
    await dostarcz(A, B);
    for (let r = 0; r < 3; r += 1) { await dostarcz(B, A); await dostarcz(A, B); }
    expect(await stan(A, x)).toBe('karta [n1,n2] nagr[n3]');
    expect(await stan(B, x)).toBe('karta [n1,n2] nagr[n3]');
  });

  // T7 [kontrola ścisłości]: delta nagrobka karty ginie, karta B bez zmian — notatki czekają przy karcie, a po pełnych
  // ładunkach znikają razem z nią (bez sierot). Reguła „karta istnieje” zostawiłaby sieroty.
  it('T7 [kontrola] delta nagrobka karty ginie, karta B bez zmian: pośrodku CZEKA, potem karta i notatki znikają razem', async () => {
    const x = await przygotuj({ A: {}, B: {} });
    const { A, B } = x.urz;
    nagrywaj(A, { nagrPac: true });
    przesun(60e3); await A.v.removePatient(x.pid);
    await dostarcz(A, B);
    expect(await stan(B, x)).toBe('karta [n1,n2] nagr[n1+pole,n2+pole]');
    const w = await rundy(x, ['B', 'A'], 3);
    expect(w.zbiezne && w.stabilne).toBe(true);
    expect(w.ost.B).toBe('BRAK [] nagr[n1+pole,n2+pole]');
  });
});

describe('P-NOTATKI-ZA-KARTA — flota mieszana (D21-7, D21-8; stare = emulacja 346dd81a)', () => {
  // T12 (E1): stare D poprawia n1 po usunięciu — poprawka zostaje, n2 i n3 wracają (dotąd giną).
  it('T12 [CZERWONY na db0c2d50] E1: stare D poprawia n1 po usunięciu → [n1-D, n2, n3]', async () => {
    const x = await przygotuj({ A: {}, B: {}, D: { stara: true } }, ['n1', 'n2', 'n3']);
    przesun(60e3); await x.urz.A.v.removePatient(x.pid);
    przesun(60e3); await x.urz.D.v.savePatientNote({ id: x.id('n1'), patientId: x.pid, title: 'n1', body: 'poprawka D' });
    await wizyta(x.urz.B, x);
    await rundy(x, ['A', 'B'], 1, ['A', 'B', 'D']);
    const w = await rundy(x, ['D', 'A', 'B'], 3, ['A', 'B', 'D']);
    expect(w.zbiezne && w.stabilne).toBe(true);
    expect(w.ost.D).toBe('karta [n1=poprawka D,n2,n3] nagr[]');
  });

  // T14 (F1, D21-7): stare O odbija nagrobki bez pola (ta sama chwila) do A przed ratunkiem — A nie traci pola.
  it('T14 [CZERWONY na db0c2d50] F1: A usuwa, stare O pobiera i wysyła, A pobiera echo, potem B z wizytą → notatki na A, O i B', async () => {
    const x = await przygotuj({ A: {}, O: { stara: true }, B: {} });
    przesun(60e3); await x.urz.A.v.removePatient(x.pid);
    await wizyta(x.urz.B, x);
    for (const k of ['A', 'O', 'A']) await x.c.sync(x.urz[k]);
    expect(await stan(x.urz.O, x), 'stare O: nagrobki bez pola').toBe('BRAK [] nagr[n1,n2]');
    expect(await stan(x.urz.A, x), 'echo bez pola nie odbiera pola').toBe('BRAK [] nagr[n1+pole,n2+pole]');
    await x.c.sync(x.urz.B);
    const w = await rundy(x, ['A', 'O', 'B'], 3);
    expect(w.zbiezne && w.stabilne).toBe(true);
    expect(w.ost.O).toBe('karta [n1,n2] nagr[]');
  });

  // T15: tabela rozdz. 5 specyfikacji. Zbieżnie, bez ping-ponga.
  const FLOTA = [
    // [opis, urządzenia, kto pobiera pierwszy, oczekiwany stan końcowy]
    ['A=nowe, B=stare z wizytą, B wysyła pierwsze: A ratuje z ładunku B, B przyjmuje (u′ > R)', { A: {}, B: { stara: true } }, ['B', 'A'], 'karta [n1,n2] nagr[]'],
    ['A=nowe, B=stare z wizytą, A wysyła pierwsze: B przyjmuje usunięcie pierwsze i kasuje notatki jak dziś (ryzyko 1)', { A: {}, B: { stara: true } }, ['A', 'B'], 'karta [] nagr[n1+pole,n2+pole]'],
    ['A=stare usuwa, B=nowe z wizytą: nagrobki bez pola, wynik jak dziś', { A: { stara: true }, B: {} }, ['B', 'A'], 'karta [] nagr[n1,n2]'],
    ['A=stare usuwa, B=nowe z wizytą, A pobiera pierwsze: wynik jak dziś', { A: { stara: true }, B: {} }, ['A', 'B'], 'karta [] nagr[n1,n2]'],
  ];
  for (const [opis, urz, kolej, cel] of FLOTA) {
    it(`T15 ${opis}`, async () => {
      const x = await przygotuj(urz);
      przesun(60e3); await x.urz.A.v.removePatient(x.pid);
      await wizyta(x.urz.B, x);
      const w = await rundy(x, kolej, 4, ['A', 'B']);
      // stare urządzenie nie widzi pola; nowe może je mieć (kopie nagrobków A i B różnią się tylko polem)
      expect(w.stabilne, JSON.stringify(w.ost)).toBe(true);
      expect(w.ost.A.replace(/\+pole/g, '')).toBe(cel.replace(/\+pole/g, ''));
      expect(w.ost.B.replace(/\+pole/g, '')).toBe(cel.replace(/\+pole/g, ''));
    });
  }
  it('T15 stare D przyjęło usunięcie offline, wraca po ratunku A i B → D dostaje notatki; zbieżnie, bez ping-ponga', async () => {
    const x = await przygotuj({ A: {}, B: {}, D: { stara: true } });
    przesun(60e3); await x.urz.A.v.removePatient(x.pid);
    await wizyta(x.urz.B, x);
    przesun(1000); await x.urz.D.scal(await x.urz.A.v.exportSyncPayload());
    expect(await stan(x.urz.D, x)).toBe('BRAK [] nagr[n1,n2]');
    await rundy(x, ['A', 'B'], 2, ['A', 'B', 'D']);
    const w = await rundy(x, ['D', 'A', 'B'], 4, ['A', 'B', 'D']);
    expect(w.zbiezne && w.stabilne).toBe(true);
    expect(w.ost.D).toBe('karta [n1,n2] nagr[]');
  });
});

/* ---------- T2, T3, T20, T21: scenariusze pomiaru D-21 (wiersze 2–8, 10–13) ---------- */
const W60 = { uid: 'm-60', ageMonths: 60, height: 110, weight: 18 };
const W66 = { uid: 'm-66', ageMonths: 66, height: 113, weight: 19 };
const W72 = { uid: 'm-72', ageMonths: 72, height: 116, weight: 20 };
const W78 = { uid: 'm-78', ageMonths: 78, height: 119, weight: 21 };
const zapisP = (wiersze, biezacy, imie) => ({
  name: imie || 'Testowy Jan',
  user: { sex: 'M', age: Math.floor(biezacy.ageMonths / 12), ageMonths: biezacy.ageMonths % 12, height: biezacy.height, weight: biezacy.weight },
  advanced: { data: { measurements: wiersze.map((w) => Object.assign({ ageYears: w.ageMonths / 12 }, w)) } },
});
async function pelny(z, na) { przesun(5e3); await na.scal(await z.v.exportSyncPayload()); }
async function krzyzowo(a, b) {
  przesun(5e3);
  const ea = kopia(await a.v.exportSyncPayload()), eb = kopia(await b.v.exportSyncPayload());
  await a.scal(eb); await b.scal(ea);
}
async function poczatekP({ zY = false } = {}) {
  sztucznyZegar();
  const A = await urzadzenie('A'), B = await urzadzenie('B'), C = await urzadzenie('C');
  const c = { A, B, C, sn: {}, nn: {}, pacjenci: {} };
  przesun(60e3);
  const s1 = await A.v.savePatient(zapisP([W60, W66], W66), { dedup: false });
  c.pid = s1.patientId; c.s1 = s1.snapshotId; c.sn[s1.snapshotId] = 's1'; c.pacjenci.X = c.pid;
  przesun(60e3);
  const s2 = await A.v.savePatient(zapisP([W60, W66, W72], W72), { patientId: c.pid, dedup: false });
  c.sn[s2.snapshotId] = 's2';
  przesun(60e3);
  const n1 = await A.v.savePatientNote({ patientId: c.pid, title: 'Wynik TSH', body: 'fikcyjny wynik', clinicalDateISO: '2026-10-01',
    labResult: { test: 'TSH', value: '2.1', valueNum: 2.1, unit: 'mIU/l' } });
  przesun(60e3);
  const n2 = await A.v.savePatientNote({ patientId: c.pid, title: 'Lek', body: 'fikcyjne leczenie', clinicalDateISO: '2026-10-02',
    medication: { name: 'Fikcyjna lewotyroksyna', action: 'start', dose: '25 µg' } });
  c.n1 = n1.id; c.n2 = n2.id; c.nn[n1.id] = 'N1'; c.nn[n2.id] = 'N2';
  if (zY) {
    przesun(60e3);
    const y1 = await A.v.savePatient(zapisP([W60], W60, 'Testowy Jan'), { dedup: false });
    c.yid = y1.patientId; c.pacjenci.Y = y1.patientId; c.sn[y1.snapshotId] = 'y1';
    przesun(60e3);
    const n3 = await A.v.savePatientNote({ patientId: y1.patientId, title: 'Notatka Y', body: 'fikcyjna' });
    c.nn[n3.id] = 'N3';
  }
  await pelny(A, B); await pelny(A, C);
  return c;
}
// Stan jak w pomiarze: karty (wersje z wysokościami, gwiazdka), kosz, notatki z właścicielem i tytułem, nagrobki notatek.
async function stanP(d, c) {
  const exp = kopia(await d.v.exportSyncPayload());
  const lista = await d.v.listPatients();
  const kosz = await d.v.listTrashedSnapshots();
  const karty = [];
  for (const [pn, pid] of Object.entries(c.pacjenci)) {
    if (!lista.some((x) => x.patientId === pid)) { karty.push(`${pn}: BRAK`); continue; }
    const p = await d.v.getPatient(pid);
    const wersje = p.snapshots.map((s) => {
      const m = (s.payload.advanced && s.payload.advanced.data && s.payload.advanced.data.measurements) || [];
      return `${c.sn[s.snapshotId] || 'nowa'}[${m.map((w) => w.height).join('/')}]${s.payload._pinned ? '*' : ''}`;
    }).join(' ');
    const k = kosz.filter((x) => x.patientId === pid).map((x) => c.sn[x.snapshotId] || 'nowa').sort().join(',');
    karty.push(`${pn}: ${wersje}${k ? ' kosz ' + k : ''}`);
  }
  const wlasciciel = Object.fromEntries(Object.entries(c.pacjenci).map(([k, v]) => [v, k]));
  const notatki = (exp.patientNotes || []).map((n) => `${c.nn[n.id] || 'nowa'}@${wlasciciel[n.patientId] || '?'} "${n.title}"`).sort();
  const nag = (exp.patientNoteTombstones || []).map((t) => (c.nn[t.id] || '?') + (t.deletedWithPatient ? '+pole' : '')).sort();
  return `${karty.join('; ')} | N[${notatki.join(', ')}] T[${nag.join(', ')}]`;
}
async function zbiezneP(urz, c) {
  const s = []; for (const d of urz) s.push(await stanP(d, c));
  expect(new Set(s).size, s.join('\n')).toBe(1);
  return s[0];
}
const KOLEJNOSCI = {
  'pełny A→B, B→A': async (c) => { await pelny(c.A, c.B); await pelny(c.B, c.A); },
  'pełny B→A, A→B': async (c) => { await pelny(c.B, c.A); await pelny(c.A, c.B); },
  'pełny krzyżowo': async (c) => { await krzyzowo(c.A, c.B); },
  'delty, potem pełny A→B, B→A': async (c) => { await dostarcz(c.A, c.B); await dostarcz(c.B, c.A); await pelny(c.A, c.B); await pelny(c.B, c.A); },
};
const KOLEJNOSCI_C = {
  'C pobiera pierwsze': async (c) => { await pelny(c.A, c.C); await pelny(c.C, c.A); await pelny(c.A, c.B); },
  'C wysyła pierwsze': async (c) => { await pelny(c.C, c.A); await pelny(c.A, c.C); await pelny(c.A, c.B); },
};
async function przebiegP(c, kol, kolC, rund = 3) {
  for (let r = 0; r < rund; r += 1) await KOLEJNOSCI[kol](c);
  for (let r = 0; r < rund; r += 1) await KOLEJNOSCI_C[kolC](c);
}
const NOTATKI_P = 'N[N1@X "Wynik TSH", N2@X "Lek"] T[]';

describe('P-NOTATKI-ZA-KARTA — inne przywrócenia karty (pomiar D-21, wiersze 2–5, 8)', () => {
  // T2 [CZERWONY na db0c2d50]: karta wracała bez notatek. Karta i kosz bez zmian względem bazy (P-KOSZ, P-ZMIANA-W-KARCIE).
  const ZMIANY = {
    'poprawka pomiaru': { zrob: (c) => c.B.v.updateMeasurementRow(c.pid, { uid: 'm-60' }, { ageMonths: 60, height: 110.8, weight: 18 }), karta: 'X: s2[110.8/113/116] s1[110/113]' },
    'gwiazdka': { zrob: (c) => c.B.v.setSnapshotPinned(c.pid, c.s1, true), karta: 'X: s2[110/113/116] s1[110/113]*' },
    'do kosza': { zrob: (c) => c.B.v.moveSnapshotToTrash(c.pid, c.s1), karta: 'X: s2[110/113/116] kosz s1' },
    'Przywróć z kosza': {
      przygotuj: async (c) => { przesun(60e3); await c.B.v.moveSnapshotToTrash(c.pid, c.s1); await pelny(c.B, c.A); await pelny(c.A, c.C); await pelny(c.A, c.B); },
      zrob: (c) => c.B.v.restoreTrashedSnapshot(c.pid, c.s1), karta: 'X: s2[110/113/116] s1[110/113]',
    },
  };
  for (const [zmiana, z] of Object.entries(ZMIANY)) {
    for (const kol of Object.keys(KOLEJNOSCI)) {
      for (const kolC of Object.keys(KOLEJNOSCI_C)) {
        it(`T2 ${zmiana} na B | ${kol} | ${kolC} → karta z [N1,N2]`, async () => {
          const c = await poczatekP();
          if (z.przygotuj) await z.przygotuj(c);
          nagrywaj(c.A); nagrywaj(c.B);
          przesun(60e3); await c.A.v.removePatient(c.pid);
          przesun(60e3); await z.zrob(c);
          await przebiegP(c, kol, kolC);
          expect(await zbiezneP([c.A, c.B, c.C], c)).toBe(`${z.karta} | ${NOTATKI_P}`);
        });
      }
    }
  }
  // T3 [CZERWONY na db0c2d50: dotąd tylko N1]: wizyta i poprawka N1 na B → N1 (poprawiona) i N2.
  for (const kolC of Object.keys(KOLEJNOSCI_C)) {
    it(`T3 wizyta i poprawka N1 na B | pełny A→B, B→A | ${kolC} → N1 poprawiona i N2`, async () => {
      const c = await poczatekP();
      przesun(60e3); await c.A.v.removePatient(c.pid);
      przesun(60e3);
      const s3 = await c.B.v.savePatient(zapisP([W60, W66, W72, W78], W78), { patientId: c.pid, dedup: false });
      c.sn[s3.snapshotId] = 's3B';
      przesun(30e3);
      await c.B.v.savePatientNote({ id: c.n1, patientId: c.pid, title: 'Wynik TSH (poprawiony)', body: 'fikcyjny wynik, poprawka',
        clinicalDateISO: '2026-10-01', labResult: { test: 'TSH', value: '2.4', valueNum: 2.4, unit: 'mIU/l' } });
      await przebiegP(c, 'pełny A→B, B→A', kolC);
      expect(await zbiezneP([c.A, c.B, c.C], c)).toBe('X: s3B[110/113/116/119] s2[110/113/116] s1[110/113] | N[N1@X "Wynik TSH (poprawiony)", N2@X "Lek"] T[]');
    });
  }
});

describe('P-NOTATKI-ZA-KARTA — kontrole bez zmian (pomiar D-21, wiersze 6, 7, 10–13; import karty)', () => {
  // T21 [kontrola]: sieroty z pomiaru 6 i 7 — poza zakresem (D21-9), wynik jak na bazie.
  const SIEROTY = {
    'poprawka N1 na B (bez zmiany wizyt)': {
      zrob: (c) => c.B.v.savePatientNote({ id: c.n1, patientId: c.pid, title: 'Wynik TSH (poprawiony)', body: 'fikcyjny wynik, poprawka',
        clinicalDateISO: '2026-10-01', labResult: { test: 'TSH', value: '2.4', valueNum: 2.4, unit: 'mIU/l' } }),
      cel: 'X: BRAK | N[N1@X "Wynik TSH (poprawiony)"] T[N2]',
    },
    'nowa notatka N4 na B (bez zmiany wizyt)': {
      zrob: async (c) => { const n4 = await c.B.v.savePatientNote({ patientId: c.pid, title: 'Termin kontroli', body: 'fikcyjny termin', dueDateISO: '2026-12-01' }); c.nn[n4.id] = 'N4'; },
      cel: 'X: BRAK | N[N4@X "Termin kontroli"] T[N1, N2]',
    },
  };
  for (const [zmiana, z] of Object.entries(SIEROTY)) {
    it(`T21 [kontrola] ${zmiana}: sieroty jak dotąd (osobny PR, D21-9)`, async () => {
      const c = await poczatekP();
      przesun(60e3); await c.A.v.removePatient(c.pid);
      przesun(60e3); await z.zrob(c);
      await przebiegP(c, 'pełny A→B, B→A', 'C pobiera pierwsze');
      // pole w nagrobku to nowa dana; notatki i karty jak na bazie
      expect((await zbiezneP([c.A, c.B, c.C], c)).replace(/\+pole/g, '')).toBe(z.cel);
    });
  }
  // T20 [kontrola]: „Scal pacjentów” X → Y na A (przepięte notatki bez nagrobków, M7), łącznie z rozjazdem G5.
  const SCAL = {
    'B poprawia wizytę X': { zrob: (c) => c.B.v.updateMeasurementRow(c.pid, { uid: 'm-60' }, { ageMonths: 60, height: 110.8, weight: 18 }) },
    'B dopisuje wizytę X': { zrob: async (c) => { const s3 = await c.B.v.savePatient(zapisP([W60, W66, W72, W78], W78), { patientId: c.pid, dedup: false }); c.sn[s3.snapshotId] = 's3B'; } },
    'B poprawia notatkę N1 pod X (rozjazd G5)': { zrob: (c) => c.B.v.savePatientNote({ id: c.n1, patientId: c.pid, title: 'Wynik TSH (poprawiony)', body: 'fikcyjny wynik, poprawka',
      clinicalDateISO: '2026-10-01', labResult: { test: 'TSH', value: '2.4', valueNum: 2.4, unit: 'mIU/l' } }) },
    'B nic': { zrob: async () => {} },
  };
  for (const [zmiana, z] of Object.entries(SCAL)) {
    it(`T20 [kontrola] „Scal pacjentów” X→Y na A, ${zmiana}: bez zmian`, async () => {
      const c = await poczatekP({ zY: true });
      const wynik = await c.A.v.mergePatients(c.pid, c.yid);
      c.sn[wynik.snapshotId] = 'yScal';
      przesun(60e3); await z.zrob(c);
      for (let r = 0; r < 3; r += 1) await KOLEJNOSCI['pełny A→B, B→A'](c);
      const s = { A: (await stanP(c.A, c)).replace(/\+pole/g, ''), B: (await stanP(c.B, c)).replace(/\+pole/g, '') };
      if (process.env.D21_DRUKUJ) console.log('T20', zmiana, JSON.stringify(s));
      expect(s).toEqual(T20_CEL[zmiana]);
    });
  }
  // T19 [kontrola] import pliku karty (M6, P-IMPORT-NAGROBEK) przywraca notatki jak dotąd.
  it('T19 [kontrola] import pliku karty po „Usuń pacjenta” przywraca notatki (P-IMPORT-NAGROBEK), bez nagrobków', async () => {
    const x = await przygotuj({ A: {}, B: {} });
    const plik = await x.urz.B.v.exportPatientEnvelope(x.pid);
    przesun(60e3); await x.urz.A.v.removePatient(x.pid);
    przesun(60e3);
    const w = await x.urz.A.v.importPatientFromEnvelope(plik, x.urz.B.haslo);
    expect(w.importedPatientNotes).toBe(2);
    expect(await stan(x.urz.A, x)).toBe('karta [n1,n2] nagr[]');
    await pelny(x.urz.A, x.urz.B);
    expect(await stan(x.urz.B, x)).toBe('karta [n1,n2] nagr[]');
  });
});
// Stan po T20 na bazie db0c2d50 (pomiar D-21, wiersze 10–13, ten sam wynik w zwiez.txt pomiaru); zmiana go nie dotyka.
const T20_Y = 'Y: yScal[110/113/116] y1[110] s2[110/113/116] s1[110/113]';
const T20_N = 'N[N1@Y "Wynik TSH", N2@Y "Lek", N3@Y "Notatka Y"] T[]';
const T20_CEL = {
  'B poprawia wizytę X': {
    A: `X: s2[110.8/113/116]; Y: yScal[110/113/116] y1[110] s1[110/113] | ${T20_N}`,
    B: `X: s2[110.8/113/116]; Y: yScal[110/113/116] y1[110] s1[110/113] | ${T20_N}`,
  },
  'B dopisuje wizytę X': { A: `X: s3B[110/113/116/119]; ${T20_Y} | ${T20_N}`, B: `X: s3B[110/113/116/119]; ${T20_Y} | ${T20_N}` },
  // Rozjazd G5 (pomiar 13): B zostaje z N1 pod X — osobny PR (D21-9).
  'B poprawia notatkę N1 pod X (rozjazd G5)': {
    A: `X: BRAK; ${T20_Y} | N[N1@Y "Wynik TSH (poprawiony)", N2@Y "Lek", N3@Y "Notatka Y"] T[]`,
    B: `X: BRAK; ${T20_Y} | N[N1@X "Wynik TSH (poprawiony)", N2@Y "Lek", N3@Y "Notatka Y"] T[]`,
  },
  'B nic': { A: `X: BRAK; ${T20_Y} | ${T20_N}`, B: `X: BRAK; ${T20_Y} | ${T20_N}` },
};

/* ---------- T16, T17, T18: „Scal kopię konta” i odtworzenie konta ---------- */
// Różnica magazynu notatek pacjentów (jak parzystosc() w kopia-konta-dane-konta.test.mjs).
async function migawkaNotatek(d) {
  return {
    notatki: new Map((await d.baza.listPatientNotesForUser(d.uid)).map((n) => [n.id, `${n.updatedAtISO || ''}|${n.rev}|${n.patientId}`])),
    nagrobki: (await d.baza.listPatientNoteTombstonesForUser(d.uid)).map((t) => t.id).sort(),
  };
}
function parzystoscNotatek(przed, po, podglad, wynik) {
  let dodane = 0, zmienione = 0, usuniete = 0, przywrocone = 0, zastapione = 0;
  po.notatki.forEach((v, k) => {
    if (!przed.notatki.has(k)) { dodane += 1; if (przed.nagrobki.includes(k) && !po.nagrobki.includes(k)) przywrocone += 1; }
    else if (przed.notatki.get(k) !== v) { zmienione += 1; if (v.split('|')[0] < przed.notatki.get(k).split('|')[0]) zastapione += 1; }
  });
  przed.notatki.forEach((v, k) => { if (!po.notatki.has(k)) usuniete += 1; });
  for (const [pole, prawda] of [['added', dodane], ['updated', zmienione], ['deleted', usuniete]]) {
    const k = `${pole}PatientNoteCount`;
    expect([podglad[k], wynik[k]], `${k}: podgląd, wynik (magazyn ${prawda})`).toEqual([prawda, prawda]);
  }
  expect(podglad.restoredPatientNoteCount, 'restoredPatientNoteCount').toBe(przywrocone);
  expect(podglad.replacedNewerPatientNoteCount, 'replacedNewerPatientNoteCount').toBe(zastapione);
  return { dodane, zmienione, usuniete, przywrocone };
}
async function scalKopie(B, A) {
  przesun(60e3);
  const plik = await A.v.exportVaultBackup();
  const przed = await migawkaNotatek(B);
  const podglad = await B.v.previewVaultBackupMerge(plik, A.haslo);
  expect(await migawkaNotatek(B), 'podgląd nie zmienia magazynu').toEqual(przed);
  const wynik = await B.v.mergeVaultBackup(plik, A.haslo);
  return { podglad, wynik, d: parzystoscNotatek(przed, await migawkaNotatek(B), podglad, wynik) };
}

describe('P-NOTATKI-ZA-KARTA — „Scal kopię konta” (podgląd = wynik = różnica magazynu) i odtworzenie konta', () => {
  it('T16 [CZERWONY na db0c2d50] B dopisało wizytę, potem scala kopię A (A usunęło pacjenta) → karta [n1,n2], updated = 2 w podglądzie i wyniku', async () => {
    const x = await przygotuj({ A: {}, B: {} });
    przesun(60e3); await x.urz.A.v.removePatient(x.pid);
    await wizyta(x.urz.B, x);
    const r = await scalKopie(x.urz.B, x.urz.A);
    expect(r.d).toEqual({ dodane: 0, zmienione: 2, usuniete: 0, przywrocone: 0 });
    expect(await stan(x.urz.B, x)).toBe('karta [n1,n2] nagr[]');
    const w = await rundy(x, ['B', 'A'], 3);
    expect(w.zbiezne && w.stabilne).toBe(true);
    expect(w.ost.A).toBe('karta [n1,n2] nagr[]');
  });

  it('T17 [CZERWONY na db0c2d50] karta B bez zmian, B scala kopię A → notatki czekają przy karcie (0 zmian); po synchronizacji z A znikają razem z kartą', async () => {
    const x = await przygotuj({ A: {}, B: {} });
    przesun(60e3); await x.urz.A.v.removePatient(x.pid);
    const r = await scalKopie(x.urz.B, x.urz.A);
    expect(r.d).toEqual({ dodane: 0, zmienione: 0, usuniete: 0, przywrocone: 0 });
    expect(await stan(x.urz.B, x)).toBe('karta [n1,n2] nagr[n1+pole,n2+pole]');
    const w = await rundy(x, ['A', 'B'], 3);
    expect(w.zbiezne && w.stabilne).toBe(true);
    expect(w.ost.B).toBe('BRAK [] nagr[n1+pole,n2+pole]');
  });

  it('T16b kopia z karty, której tu nie ma (karta dodawana z kopii, późniejsza niż usunięcie) → notatki z kopii dodane i przywrócone', async () => {
    const x = await przygotuj({ A: {}, B: {} });
    przesun(60e3); await x.urz.A.v.removePatient(x.pid);
    await wizyta(x.urz.B, x);
    const r = await scalKopie(x.urz.A, x.urz.B);
    expect(r.d).toEqual({ dodane: 2, zmienione: 0, usuniete: 0, przywrocone: 2 });
    expect(await stan(x.urz.A, x)).toBe('karta [n1,n2] nagr[]');
  });

  it('T18 odtworzenie konta z kopii w stanie CZEKA = ten sam wynik co pełny ładunek; kopia starej aplikacji daje wynik dzisiejszy', async () => {
    const x = await przygotuj({ A: {}, B: {}, S: { stara: true } });
    przesun(60e3); await x.urz.A.v.removePatient(x.pid);
    await scalKopie(x.urz.B, x.urz.A);
    expect(await stan(x.urz.B, x)).toBe('karta [n1,n2] nagr[n1+pole,n2+pole]');
    przesun(60e3);
    const plikB = await x.urz.B.v.exportVaultBackup();
    const E = { v: okno().VildaVault };
    await E.v.restoreVaultBackup(plikB, x.urz.B.haslo);
    const F = await urzadzenie('F');
    await F.scal(await x.urz.B.v.exportSyncPayload());
    expect(await stan(E, x), 'odtworzenie = stan B').toBe('karta [n1,n2] nagr[n1+pole,n2+pole]');
    expect(await stan(F, x), 'pełny ładunek = to samo').toBe(await stan(E, x));
    E.scal = (p) => E.v.mergeSyncPayload(kopia(p));
    przesun(5e3); await E.scal(await x.urz.A.v.exportSyncPayload());
    expect(await stan(E, x), 'po usunięciu karty z A znika razem z notatkami').toBe('BRAK [] nagr[n1+pole,n2+pole]');
    // Stara aplikacja (S z wizytą) przyjmuje usunięcie: kasuje notatki; jej kopia odtwarza kartę bez notatek, jak dziś.
    await wizyta(x.urz.S, x);
    przesun(5e3); await x.urz.S.scal(await x.urz.A.v.exportSyncPayload());
    const plikS = await x.urz.S.v.exportVaultBackup();
    const G = { v: okno().VildaVault };
    await G.v.restoreVaultBackup(plikS, x.urz.S.haslo);
    expect(await stan(G, x)).toBe('karta [] nagr[n1,n2]');
  });
});

/* ---------- T26: format pola ---------- */
// Atrapa IndexedDB: tylko to, czego używa adapter Sa (open z onupgradeneeded, transakcje, get/getAll/put/delete,
// indeks byPatient z getAll i openCursor). Rekordy klonowane jak w prawdziwym IndexedDB.
function atrapaIndexedDB() {
  const bazy = new Map();
  const zadanie = (f) => { const r = {}; queueMicrotask(() => { try { r.result = f(); if (r.onsuccess) r.onsuccess({ target: r }); } catch (er) { r.error = er; if (r.onerror) r.onerror({ target: r }); } }); return r; };
  const pasuje = (zapytanie, w) => (zapytanie && typeof zapytanie === 'object' && 'jedyna' in zapytanie ? w === zapytanie.jedyna : true);
  function magazynObiektow(m) {
    return {
      get: (k) => zadanie(() => (m.dane.has(k) ? structuredClone(m.dane.get(k)) : undefined)),
      getAll: () => zadanie(() => Array.from(m.dane.values()).map((x) => structuredClone(x))),
      put: (x) => zadanie(() => { m.dane.set(x[m.klucz], structuredClone(x)); return x[m.klucz]; }),
      delete: (k) => zadanie(() => { m.dane.delete(k); }),
      createIndex() { return {}; },
      index: (nazwa) => {
        const pole = m.indeksy[nazwa] || 'patientId';
        return {
          getAll: (q) => zadanie(() => Array.from(m.dane.values()).filter((x) => pasuje(q, x[pole])).map((x) => structuredClone(x))),
          openCursor: (q) => {
            const r = {};
            const klucze = Array.from(m.dane.entries()).filter(([, x]) => pasuje(q, x[pole])).map(([k]) => k);
            let i = 0;
            const krok = () => queueMicrotask(() => {
              const k = klucze[i];
              const kursor = k === undefined ? null : { value: structuredClone(m.dane.get(k)), delete() { m.dane.delete(k); }, continue() { i += 1; krok(); } };
              if (r.onsuccess) r.onsuccess({ target: { result: kursor } });
            });
            krok();
            return r;
          },
        };
      },
    };
  }
  function baza(nazwa) {
    if (!bazy.has(nazwa)) bazy.set(nazwa, new Map());
    const sklepy = bazy.get(nazwa);
    return {
      objectStoreNames: { contains: (n) => sklepy.has(n) },
      createObjectStore(n, o) {
        const m = { dane: new Map(), klucz: o.keyPath, indeksy: {} };
        sklepy.set(n, m);
        return { createIndex(nazwaIndeksu, pole) { m.indeksy[nazwaIndeksu] = pole; return {}; } };
      },
      transaction() { return { objectStore: (n) => magazynObiektow(sklepy.get(n)) }; },
      close() {},
    };
  }
  return {
    open(nazwa) {
      const r = {};
      queueMicrotask(() => {
        const nowa = !bazy.has(nazwa), db = baza(nazwa);
        r.result = db;
        if (nowa && r.onupgradeneeded) r.onupgradeneeded({ target: r });
        if (r.onsuccess) r.onsuccess({ target: r });
      });
      return r;
    },
    deleteDatabase(nazwa) { bazy.delete(nazwa); const r = {}; queueMicrotask(() => { if (r.onsuccess) r.onsuccess({}); }); return r; },
  };
}

describe('P-NOTATKI-ZA-KARTA — T26 format pola deletedWithPatient', () => {
  const D = '2026-10-21T10:00:00.000Z', E = '2026-10-21T09:59:59.500Z', M = '2026-10-21T09:00:00.000Z';
  const NIEWAZNE = {
    'patientId liczbą': { patientId: 7, deletedAtISO: E },
    'pusty patientId': { patientId: '', deletedAtISO: E },
    'patientId dłuższy niż 200 znaków': { patientId: 'p'.repeat(201), deletedAtISO: E },
    'zła data': { patientId: 'pac-1', deletedAtISO: '21.10.2026' },
    'data bez milisekund': { patientId: 'pac-1', deletedAtISO: '2026-10-21T09:59:59Z' },
    'manualDeletedAtISO ≥ D': { patientId: 'pac-1', deletedAtISO: E, manualDeletedAtISO: D },
    'manualDeletedAtISO zła': { patientId: 'pac-1', deletedAtISO: E, manualDeletedAtISO: 'wczoraj' },
    'pole napisem': 'pac-1',
    // Przegląd 1 (flota, zgł. 3): data spoza kalendarza (Date.parse daje 2 marca) i e późniejsze niż nagrobek.
    'data spoza kalendarza (30 lutego)': { patientId: 'pac-1', deletedAtISO: '2026-02-30T00:00:00.000Z' },
    'manualDeletedAtISO spoza kalendarza': { patientId: 'pac-1', deletedAtISO: E, manualDeletedAtISO: '2026-09-31T00:00:00.000Z' },
    'e późniejsze niż nagrobek': { patientId: 'pac-1', deletedAtISO: '2026-10-21T10:00:00.001Z' },
  };
  async function sprawdzAdapter(zapisz, czytaj) {
    await zapisz({ id: 'w1', deletedAtISO: D, rev: 2, deletedWithPatient: { patientId: 'pac-1', deletedAtISO: E, manualDeletedAtISO: M, obce: 1 }, zUsunieciaPacjenta: { patientId: 'pac-1' } });
    const w1 = (await czytaj()).find((t) => t.id === 'w1');
    expect(w1, 'ważne pole zostaje, obce klucze w polu i obce pola nagrobka odpadają (M4)').toEqual({ id: 'w1', deletedAtISO: D, rev: 2, deletedWithPatient: { patientId: 'pac-1', deletedAtISO: E, manualDeletedAtISO: M } });
    let i = 0;
    for (const [opis, pole] of Object.entries(NIEWAZNE)) {
      i += 1;
      await zapisz({ id: `x${i}`, deletedAtISO: D, rev: 1, deletedWithPatient: pole });
      expect(Object.keys((await czytaj()).find((t) => t.id === `x${i}`)).sort(), opis).toEqual(['deletedAtISO', 'id', 'rev']);
    }
  }
  it('adapter pamięciowy zachowuje ważne pole; nieważne i obce odpadają', async () => {
    const d = await urzadzenie('F');
    await sprawdzAdapter((n) => d.baza.putPatientNoteTombstoneForUser(d.uid, n), () => d.baza.listPatientNoteTombstonesForUser(d.uid));
  });
  // Droga przez scalanie: nieważne i obce pole odfiltrowuje już Le (Bnp_zlacz), zanim dotrze do adaptera — test pilnuje,
  // że adapter IndexedDB ZACHOWUJE ważne pole (jego walidację pilnuje strażnik źródła).
  it('adapter IndexedDB zachowuje ważne pole (atrapa IndexedDB, droga przez scalanie i eksport); nieważne i obce nie dochodzą do eksportu', async () => {
    const poprzedni = globalThis.IDBKeyRange;
    globalThis.IDBKeyRange = { only: (w) => ({ jedyna: w }) };
    try {
      const win = okno({ indexedDB: atrapaIndexedDB() });
      const v = win.VildaVault;
      await v.createUser('Notatki#ZaKarta!IDB2026aa', { label: 'idb', iterations: 10000 });
      const pola = Object.entries(NIEWAZNE);
      await v.mergeSyncPayload({ schemaVersion: 2, patients: [], tombstones: [], notes: [], noteTombstones: [], patientNotes: [],
        patientNoteTombstones: [{ id: 'w1', deletedAtISO: D, rev: 2, deletedWithPatient: { patientId: 'pac-1', deletedAtISO: E, manualDeletedAtISO: M, obce: 1 }, zUsunieciaPacjenta: {} }]
          .concat(pola.map(([, pole], i) => ({ id: `x${i + 1}`, deletedAtISO: D, rev: 1, deletedWithPatient: pole }))) });
      const eks = kopia(await v.exportSyncPayload()).patientNoteTombstones;
      expect(eks.find((t) => t.id === 'w1')).toEqual({ id: 'w1', deletedAtISO: D, rev: 2, deletedWithPatient: { patientId: 'pac-1', deletedAtISO: E, manualDeletedAtISO: M } });
      pola.forEach(([opis], i) => { expect(Object.keys(eks.find((t) => t.id === `x${i + 1}`)).sort(), opis).toEqual(['deletedAtISO', 'id', 'rev']); });
    } finally {
      globalThis.IDBKeyRange = poprzedni;
    }
  });
  it('removePatientNote nie stawia pola; „Usuń pacjenta”: pole.deletedAtISO === chwila nagrobka karty, nagrobek notatki ≥ e; ls niesie rev i pole', async () => {
    const x = await przygotuj({ A: {} }, ['n1', 'n2', 'n3']);
    const A = x.urz.A;
    przesun(60e3); await A.v.removePatientNote(x.id('n3'));
    const n3 = (await nagrobkiNotatek(A)).find((t) => t.id === x.id('n3'));
    expect(Object.keys(n3).sort()).toEqual(['deletedAtISO', 'id', 'rev']);
    przesun(60e3); await A.v.removePatient(x.pid);
    const e = (await nagrobekKarty(A, x.pid)).deletedAtISO;
    const nag = (await nagrobkiNotatek(A)).filter((t) => t.id !== x.id('n3'));
    expect(nag.length).toBe(2);
    for (const t of nag) {
      expect(t.deletedWithPatient).toEqual({ patientId: x.pid, deletedAtISO: e });
      expect(t.deletedAtISO >= e, 'nagrobek notatki nie wcześniejszy niż e').toBe(true);
      const zd = await A.v.buildNoteTombstoneDelta(t.id, t.deletedAtISO);
      const delta = kopia(await A.v.decryptPayloadForCurrentUser(zd.iv, zd.data));
      expect(delta.patientNoteTombstones).toEqual([{ id: t.id, deletedAtISO: t.deletedAtISO, rev: 1, deletedWithPatient: { patientId: x.pid, deletedAtISO: e } }]);
    }
    const ev = A.zdarzenia.filter((z) => z.action === 'delete' && z.id !== x.id('n3'));
    expect(ev.every((z) => z.patientId === x.pid)).toBe(true);
    // Brak rekordu w sklepie: postać dotychczasowa.
    const zb = await A.v.buildNoteTombstoneDelta('nie-ma', '2026-10-21T00:00:00.000Z');
    const brak = kopia(await A.v.decryptPayloadForCurrentUser(zb.iv, zb.data));
    expect(brak.patientNoteTombstones).toEqual([{ id: 'nie-ma', deletedAtISO: '2026-10-21T00:00:00.000Z' }]);
  });
  it('Le przy przepisaniu nagrobka zachowuje pole; kopia bez pola o tej samej chwili go nie odbiera, a późniejsza odbiera', async () => {
    const d = await urzadzenie('F');
    const pusty = { schemaVersion: 2, patients: [], tombstones: [], notes: [], noteTombstones: [], patientNotes: [] };
    await d.scal({ ...pusty, patientNoteTombstones: [{ id: 'q1', deletedAtISO: D, rev: 1, deletedWithPatient: { patientId: 'pac-1', deletedAtISO: E } }] });
    expect((await nagrobkiNotatek(d)).find((t) => t.id === 'q1').deletedWithPatient).toEqual({ patientId: 'pac-1', deletedAtISO: E });
    await d.scal({ ...pusty, patientNoteTombstones: [{ id: 'q1', deletedAtISO: D, rev: 1 }] });
    expect((await nagrobkiNotatek(d)).find((t) => t.id === 'q1').deletedWithPatient, 'echo bez pola, ta sama chwila').toEqual({ patientId: 'pac-1', deletedAtISO: E });
    const pozniej = '2026-10-21T11:00:00.000Z';
    await d.scal({ ...pusty, patientNoteTombstones: [{ id: 'q1', deletedAtISO: pozniej, rev: 1 }] });
    expect((await nagrobkiNotatek(d)).find((t) => t.id === 'q1')).toEqual({ id: 'q1', deletedAtISO: pozniej, rev: 1 });
    // Krata: dwie kopie z polem o tej samej chwili — większe pole.deletedAtISO, ręczne usunięcie z kopii bez pola (< R) jako M.
    await d.scal({ ...pusty, patientNoteTombstones: [
      { id: 'q2', deletedAtISO: D, rev: 1, deletedWithPatient: { patientId: 'pac-2', deletedAtISO: M } },
      { id: 'q2', deletedAtISO: D, rev: 1, deletedWithPatient: { patientId: 'pac-1', deletedAtISO: E } },
      { id: 'q2', deletedAtISO: '2026-10-21T08:00:00.000Z', rev: 1 },
    ] });
    expect((await nagrobkiNotatek(d)).find((t) => t.id === 'q2').deletedWithPatient)
      .toEqual({ patientId: 'pac-1', deletedAtISO: E, manualDeletedAtISO: '2026-10-21T08:00:00.000Z' });
  });
});

/* ---------- T27, T28, T29 ---------- */
describe('P-NOTATKI-ZA-KARTA — koszt, wyścig z drugą kartą przeglądarki, Eb nad nagrobkiem „czeka”', () => {
  it('T27 koszt: scalanie bez nagrobków z polem — 0 odczytów kart i 0 blokad pacjenta w sekcji notatek; N kandydatów — odczyt karty raz na pacjenta (+ raz pod blokadą)', async () => {
    const locks = atrapaLocks();
    sztucznyZegar();
    const B = await urzadzenie('B', { locks });
    const pacjenci = [];
    for (let p = 0; p < 2; p += 1) {
      przesun(60e3);
      const k = await B.v.savePatient(jan(120 + p, 22), { dedup: false });
      pacjenci.push(k.patientId);
      for (let n = 0; n < 3; n += 1) { przesun(1000); await B.v.savePatientNote({ patientId: k.patientId, title: `n${p}${n}`, body: 'fikcja' }); }
    }
    const notatki = await B.v.listAllPatientNotes();
    const pusty = { schemaVersion: 2, patients: [], tombstones: [], notes: [], noteTombstones: [], patientNotes: [] };
    const R = przesun(60e3);
    // 1) Nagrobki bez pola (ręczne usunięcia na innym urządzeniu).
    const reczne = { ...pusty, patientNoteTombstones: [{ id: 'obca-1', deletedAtISO: R, rev: 1 }, { id: 'obca-2', deletedAtISO: R, rev: 1 }] };
    B.zeruj(); locks.zadania.length = 0;
    await B.scal(reczne);
    expect(B.licz.getPatientForUser || 0, 'odczyty kart').toBe(0);
    expect(B.licz.listPatientsForUser || 0, 'lista kart tylko na starcie scalania').toBeLessThanOrEqual(1);
    expect(locks.zadania.filter((n) => n.startsWith('vilda-save-pat:')), 'blokady pacjenta').toEqual([]);
    // 2) 6 kandydatów u 2 pacjentów (karty późniejsze niż e): odczyt karty raz na pacjenta przy decyzji i raz pod blokadą.
    const e = '2026-10-21T00:00:00.000Z';
    const zPolem = { ...pusty, patientNoteTombstones: notatki.map((n) => ({ id: n.id, deletedAtISO: R, rev: 1, deletedWithPatient: { patientId: n.patientId, deletedAtISO: e } })) };
    B.zeruj(); locks.zadania.length = 0;
    const w = await B.scal(zPolem);
    expect(w.updatedPatientNoteCount).toBe(6);
    expect(B.licz.getPatientForUser, 'raz na pacjenta przy decyzji + raz pod blokadą').toBe(2 * pacjenci.length);
    expect(B.licz.listPatientsForUser || 0).toBeLessThanOrEqual(1);
    expect(locks.zadania.filter((n) => n.startsWith('vilda-save-pat:')).sort()).toEqual(pacjenci.map((p) => `vilda-save-pat:${p}`).sort());
  });

  it('T28 wyścig: blokada pacjenta zajęta w drugiej karcie (MERGE_BUSY) → CZEKA, następne scalanie ratuje', async () => {
    const locks = atrapaLocks();
    const x = await przygotuj({ A: {}, B: { locks } });
    const { A, B } = x.urz;
    przesun(60e3); await A.v.removePatient(x.pid);
    await wizyta(B, x);
    const ladunek = { ...kopia(await A.v.exportSyncPayload()), patients: [], tombstones: [] };
    const zwolnij = odroczone();
    locks.request(`vilda-save-pat:${x.pid}`, () => zwolnij.obietnica);
    await B.scal(ladunek, { lockTimeoutMs: 150 });
    expect(await stan(B, x), 'blokada zajęta: notatki i nagrobki zostają, bez błędu scalania').toBe('karta [n1,n2] nagr[n1+pole,n2+pole]');
    zwolnij.rozwiaz();
    B.zdarzenia.length = 0;
    const w = await B.scal(ladunek);
    expect(await stan(B, x)).toBe('karta [n1,n2] nagr[]');
    expect(w.updatedPatientNoteCount).toBe(2);
    expect(B.zdarzenia.filter((z) => z.action === 'merge').map((z) => x.nn[z.id]).sort()).toEqual(['n1', 'n2']);
  });

  // Przegląd testów 2 (zgł. 2b): tu notatki już nie ma, więc ratunek kończy się na braku notatki — straż „nowszy
  // nagrobek zostaje” w Bnp_ratuj pilnuje L13 (przegląd 2), blokadę notatki w ratunku — L12.
  it('T28 wyścig: „Usuń pacjenta” w drugiej karcie między decyzją a ratunkiem → brak sierot', async () => {
    const locks = atrapaLocks();
    const x = await przygotuj({ A: {}, B: { locks } });
    const { A, B } = x.urz;
    przesun(60e3); await A.v.removePatient(x.pid);
    const R = (await nagrobkiNotatek(A))[0].deletedAtISO;
    await wizyta(B, x);
    const druga = okno({ locks }).VildaVault;
    druga.setStorageAdapter(B.baza);
    await druga.unlockUser(B.uid, B.haslo);
    const ladunek = { ...kopia(await A.v.exportSyncPayload()), patients: [], tombstones: [] };
    // decyzja: odczyt karty w sekcji notatek (po odczycie nagrobków notatek) — wstrzymany po odczycie
    const p = B.pulapka('getPatientForUser', (_u, pid) => pid === x.pid && (B.licz.listPatientNoteTombstonesForUser || 0) > 0);
    B.zeruj();
    const scal = B.scal(ladunek);
    await p.osiagnieta;
    przesun(1000); await druga.removePatient(x.pid);
    p.zwolnij();
    await scal;
    expect(await stan(B, x)).toBe('BRAK [] nagr[n1+pole,n2+pole]');
    const nag = await nagrobkiNotatek(B);
    expect(nag.every((t) => t.deletedAtISO > R), 'nagrobki drugiego usunięcia nie cofnięte do R').toBe(true);
  });

  it('T29 Eb nad nagrobkiem w stanie „czeka”: manualDeletedAtISO przeniesione do nowego nagrobka', async () => {
    const x = await przygotuj({ A: {}, B: {}, C: {} });
    const { A, B, C } = x.urz;
    // B ręcznie usuwa n2; C (nie wie) poprawia n2 później; A usuwa pacjenta. C dostaje usunięcie od A, potem ręczne
    // usunięcie od B: karta C bez zmian — n1 i n2 czekają, a krata nagrobka n2 pamięta ręczne usunięcie (M < Y).
    przesun(60e3); await B.v.removePatientNote(x.id('n2'));
    const m = (await nagrobkiNotatek(B)).find((t) => t.id === x.id('n2')).deletedAtISO;
    przesun(60e3); await C.v.savePatientNote({ id: x.id('n2'), patientId: x.pid, title: 'n2', body: 'poprawka C' });
    przesun(60e3); await A.v.removePatient(x.pid);
    // nagrobki notatek z A docierają bez nagrobka karty (jak delty w T6), potem pełny ładunek B
    przesun(5e3); await C.scal({ ...kopia(await A.v.exportSyncPayload()), tombstones: [] });
    przesun(5e3); await C.scal(await B.v.exportSyncPayload());
    expect(await stan(C, x)).toBe('karta [n1,n2=poprawka C] nagr[n1+pole,n2+pole+r]');
    const n2 = (await nagrobkiNotatek(C)).find((t) => t.id === x.id('n2'));
    expect(n2.deletedWithPatient.manualDeletedAtISO).toBe(m);
    // „Usuń pacjenta” na C nad nagrobkiem w stanie „czeka”: nowe e, M przeniesione.
    przesun(60e3); await C.v.removePatient(x.pid);
    const e2 = (await nagrobekKarty(C, x.pid)).deletedAtISO;
    const po = await nagrobkiNotatek(C);
    expect(po.find((t) => t.id === x.id('n2')).deletedWithPatient).toEqual({ patientId: x.pid, deletedAtISO: e2, manualDeletedAtISO: m });
    expect(po.find((t) => t.id === x.id('n1')).deletedWithPatient).toEqual({ patientId: x.pid, deletedAtISO: e2 });
    expect(po.every((t) => t.deletedAtISO > n2.deletedAtISO)).toBe(true);
  });
});

/* ---------- T30: strażniki mapy D-21 (M1–M7) ---------- */
describe('P-NOTATKI-ZA-KARTA — T30 strażniki mapy D-21 (M1, M2, M3, M5 zmieniają wynik; M4 na nowe pole; M6, M7 bez zmian)', () => {
  const zapisM = (nazwa, wiek) => ({
    name: nazwa, timestampISO: new Date().toISOString(),
    user: { sex: 'M', age: Math.floor(wiek / 12), ageMonths: wiek % 12, height: 100 + wiek / 6, weight: 15 + wiek / 12, dobISO: '2020-01-01' },
    advanced: { data: { measurements: [{ uid: 'm-' + wiek, ageMonths: wiek, ageYears: wiek / 12, height: 100 + wiek / 6, weight: 15 + wiek / 12 }] } },
  });
  const zapiszM = (d, p, o = {}) => { przesun(60e3); return d.v.savePatient(p, { dedup: false, ...o }); };
  const karty = async (d) => (await d.v.listPatients()).map((k) => k.patientId);
  const tytuly = async (d, pid) => (await d.v.listPatientNotesForPatient(pid)).map((n) => n.title).sort();
  async function startM() {
    sztucznyZegar();
    const A = await urzadzenie('A'), B = await urzadzenie('B');
    const s1 = await zapiszM(A, zapisM('Testowy Jan', 60));
    const pid = s1.patientId;
    przesun(60e3);
    const n1 = await A.v.savePatientNote({ patientId: pid, title: 'TSH 2,1', body: 'wynik fikcyjny', category: 'lab' });
    przesun(60e3);
    const n2 = await A.v.savePatientNote({ patientId: pid, title: 'Kontrola', body: 'termin fikcyjny', dueDateISO: '2026-12-01' });
    await B.scal(await A.v.exportSyncPayload());
    return { A, B, pid, s1, n1, n2 };
  }
  it('M1 [CZERWONY na db0c2d50] usuń na A, nowa wizyta na B, pełny ładunek B→A→B: karta i notatki wracają wszędzie', async () => {
    const { A, B, pid, n1 } = await startM();
    przesun(60e3); await A.v.removePatient(pid);
    const nA = await nagrobkiNotatek(A), kartaA = await nagrobekKarty(A, pid);
    expect(Object.keys(nA.find((t) => t.id === n1.id)).sort()).toEqual(['deletedAtISO', 'deletedWithPatient', 'id', 'rev']);
    expect(nA.every((t) => t.deletedWithPatient.deletedAtISO === kartaA.deletedAtISO && t.deletedAtISO >= kartaA.deletedAtISO)).toBe(true);
    await zapiszM(B, zapisM('Testowy Jan', 66), { patientId: pid });
    const w1 = await A.scal(await B.v.exportSyncPayload());
    expect(await karty(A)).toEqual([pid]);
    expect(await tytuly(A, pid)).toEqual(['Kontrola', 'TSH 2,1']);
    expect(w1.addedPatientNoteCount).toBe(2);
    expect(await nagrobkiNotatek(A)).toEqual([]);
    await B.scal(await A.v.exportSyncPayload());
    expect(await tytuly(B, pid)).toEqual(['Kontrola', 'TSH 2,1']);
  });
  it('M2 [CZERWONY na db0c2d50] kolejność A→B→A: B ratuje notatki (updated 2, deleted 0), A dostaje kartę z notatkami', async () => {
    const { A, B, pid } = await startM();
    przesun(60e3); await A.v.removePatient(pid);
    await zapiszM(B, zapisM('Testowy Jan', 66), { patientId: pid });
    const w = await B.scal(await A.v.exportSyncPayload());
    expect(await karty(B)).toEqual([pid]);
    expect(await tytuly(B, pid)).toEqual(['Kontrola', 'TSH 2,1']);
    expect([w.updatedPatientNoteCount, w.deletedPatientNoteCount]).toEqual([2, 0]);
    await A.scal(await B.v.exportSyncPayload());
    expect(await tytuly(A, pid)).toEqual(['Kontrola', 'TSH 2,1']);
  });
  it('M3 [CZERWONY na db0c2d50] delty: buildNoteTombstoneDelta niesie {id, deletedAtISO, rev, deletedWithPatient}; B po poprawce karty zachowuje notatki', async () => {
    const { A, B, pid, s1 } = await startM();
    przesun(60e3); await A.v.removePatient(pid);
    const ev = A.zdarzenia.filter((z) => z.action === 'delete');
    przesun(60e3);
    const pl = kopia((await B.v.getPatient(pid)).snapshots.find((s) => s.snapshotId === s1.snapshotId).payload);
    pl.user.weight = 16.5;
    await B.v.updateSnapshotPayload(pid, s1.snapshotId, pl, { preserveSavedAt: true });
    const odszyfruj = async (z) => kopia(await A.v.decryptPayloadForCurrentUser(z.iv, z.data));
    await B.scal(await odszyfruj(await A.v.buildTombstoneDelta(pid, (await nagrobekKarty(A, pid)).deletedAtISO)));
    expect(await karty(B)).toEqual([pid]);
    for (const e of ev) {
      const dn = await odszyfruj(await A.v.buildNoteTombstoneDelta(e.id, e.deletedAtISO));
      expect(Object.keys(dn.patientNoteTombstones[0]).sort()).toEqual(['deletedAtISO', 'deletedWithPatient', 'id', 'rev']);
      await B.scal(dn);
    }
    expect(await tytuly(B, pid)).toEqual(['Kontrola', 'TSH 2,1']);
    expect(await nagrobkiNotatek(B)).toEqual([]);
  });
  it('M4 nieznane pole nagrobka notatki dalej ginie (Le i adapter); ważne deletedWithPatient zostaje i jedzie w eksporcie', async () => {
    const { B, pid, n1 } = await startM();
    const teraz = przesun(60e3);
    await B.scal({ schemaVersion: 2, patients: [], tombstones: [], notes: [], noteTombstones: [], patientNotes: [],
      patientNoteTombstones: [{ id: n1.id, deletedAtISO: teraz, rev: 1, zUsunieciaPacjenta: { patientId: pid, deletedAtISO: teraz }, deletedWithPatient: { patientId: pid, deletedAtISO: teraz } }] });
    const zapisany = (await nagrobkiNotatek(B)).find((t) => t.id === n1.id);
    expect(Object.keys(zapisany).sort()).toEqual(['deletedAtISO', 'deletedWithPatient', 'id', 'rev']);
    await B.baza.putPatientNoteTombstoneForUser(B.uid, { id: 'x1', deletedAtISO: teraz, rev: 2, zUsunieciaPacjenta: { patientId: pid } });
    expect(Object.keys((await nagrobkiNotatek(B)).find((t) => t.id === 'x1')).sort()).toEqual(['deletedAtISO', 'id', 'rev']);
    const eks = kopia(await B.v.exportSyncPayload());
    expect(eks.patientNoteTombstones.some((t) => 'zUsunieciaPacjenta' in t)).toBe(false);
    expect(eks.patientNoteTombstones.find((t) => t.id === n1.id).deletedWithPatient).toEqual({ patientId: pid, deletedAtISO: teraz });
  });
  it('M5 [CZERWONY na db0c2d50] „Scal kopię konta” na A z kopii B (nowsza wizyta): karta i notatki wracają', async () => {
    const { A, B, pid } = await startM();
    przesun(60e3); await A.v.removePatient(pid);
    await zapiszM(B, zapisM('Testowy Jan', 66), { patientId: pid });
    const w = await A.v.mergeVaultBackup(await B.v.exportVaultBackup(), B.haslo);
    expect(await karty(A)).toEqual([pid]);
    expect(await tytuly(A, pid)).toEqual(['Kontrola', 'TSH 2,1']);
    expect(w.addedPatientNoteCount).toBe(2);
  });
  it('M6 [kontrola] import karty z pliku przywraca notatki (P-IMPORT-NAGROBEK)', async () => {
    const { A, B, pid } = await startM();
    const plik = await B.v.exportPatientEnvelope(pid);
    przesun(60e3); await A.v.removePatient(pid);
    przesun(60e3);
    const w = await A.v.importPatientFromEnvelope(plik, B.haslo);
    expect(w.importedPatientNotes).toBe(2);
    expect(await tytuly(A, pid)).toEqual(['Kontrola', 'TSH 2,1']);
    expect(await nagrobkiNotatek(A)).toEqual([]);
  });
  it('M7 [kontrola] „Scal pacjentów” X→Y przepina notatki (ten sam id, rev+1) i nie stawia nagrobków notatek', async () => {
    const { A, pid, n1 } = await startM();
    const y = await zapiszM(A, zapisM('Testowy Jan', 61));
    await A.v.mergePatients(pid, y.patientId);
    expect(await tytuly(A, y.patientId)).toEqual(['Kontrola', 'TSH 2,1']);
    expect(await nagrobkiNotatek(A)).toEqual([]);
    const n = await A.v.getPatientNote(n1.id);
    expect([n.patientId, n.rev]).toEqual([y.patientId, 2]);
  });
});

/* ---------- Przegląd 1 (2026-10-21): poprawność (F1–F3), flota (zgł. 1–3), luki testów (L1–L8, P1–P4) ---------- */
// Każdy przypadek odtwarza zgłoszenie recenzenta na prawdziwym sejfie; [CZERWONY na 469c9fe2] — przed poprawkami.
describe('P-NOTATKI-ZA-KARTA — przegląd 1: drugie „Usuń pacjenta” karty, która wróciła bez notatek (F1)', () => {
  // F1 [CZERWONY na 469c9fe2]: A usuwa (e1); B dopisuje wizytę; delta karty B→A (karta wraca na A bez notatek); A usuwa
  // ponownie (e2). Pętla Bpu_usun nie widzi notatek, więc stare nagrobki (pole e1, chwila R) przegrywały z wersjami
  // uratowanymi na B (u′ ≤ R + 1 s) — sieroty na A i B. Teraz nagrobki bez notatek dostają chwilę > R + 1 s i pole e2.
  it('P7 delty: A usuwa ponownie kartę, która wróciła bez notatek → nagrobki odnowione (e2, chwila > R + 1 s), B po deltach i wszyscy po pełnych ładunkach bez sierot', async () => {
    const x = await przygotuj({ A: {}, B: {} });
    const { A, B } = x.urz;
    nagrywaj(A); nagrywaj(B);
    przesun(60e3); await A.v.removePatient(x.pid);
    const R1 = (await nagrobkiNotatek(A))[0].deletedAtISO;
    await wizyta(B, x);
    await dostarcz(B, A, (t) => t === 'karta');
    expect(await stan(A, x), 'karta wróciła na A bez notatek (P-ZMIANA-W-KARCIE)').toBe('karta [] nagr[n1+pole,n2+pole]');
    przesun(60e3); await A.v.removePatient(x.pid);
    const e2 = (await nagrobekKarty(A, x.pid)).deletedAtISO;
    const nag = await nagrobkiNotatek(A);
    expect(nag.map((t) => t.deletedWithPatient)).toEqual([{ patientId: x.pid, deletedAtISO: e2 }, { patientId: x.pid, deletedAtISO: e2 }]);
    expect(nag.every((t) => Date.parse(t.deletedAtISO) > Date.parse(R1) + 1000), 'po pasmie ratunku').toBe(true);
    const log = await dostarcz(A, B);
    expect(log.filter((q) => q === 'nagrNot+pole').length, 'odnowione nagrobki jadą deltą').toBe(4);
    expect(await stan(B, x), 'B po deltach').toBe('BRAK [] nagr[n1+pole,n2+pole]');
    const w = await rundy(x, ['A', 'B'], 4);
    expect(w.zbiezne && w.stabilne).toBe(true);
    expect(w.ost.A).toBe('BRAK [] nagr[n1+pole,n2+pole]');
  });

  it('P7b pełne ładunki: C przyjęło usunięcie, dostaje kartę z delty B (wizyta) i usuwa ją ponownie → bez sierot na A, B i C', async () => {
    const x = await przygotuj({ A: {}, B: {}, C: {} });
    const { A, B, C } = x.urz;
    nagrywaj(B);
    przesun(60e3); await A.v.removePatient(x.pid);
    await pelny(A, C);
    expect(await stan(C, x)).toBe('BRAK [] nagr[n1+pole,n2+pole]');
    await wizyta(B, x);
    await dostarcz(B, C, (t) => t === 'karta');
    przesun(60e3); await C.v.removePatient(x.pid);
    const w = await rundy(x, ['A', 'B', 'C'], 4);
    expect(w.zbiezne && w.stabilne, JSON.stringify(w.ost)).toBe(true);
    expect(w.ost.A).toBe('BRAK [] nagr[n1+pole,n2+pole]');
  });

  // Stare D nie zna kroku „pasmo ratunku bez karty”, więc chroni je tylko odnowiona chwila nagrobka (> u′).
  it('P7c jak P7b, a stare D ma już uratowane notatki → D też je kasuje (odnowione nagrobki późniejsze niż u′)', async () => {
    const x = await przygotuj({ A: {}, B: {}, C: {}, D: { stara: true } });
    const { A, B, C, D } = x.urz;
    nagrywaj(B);
    przesun(60e3); await A.v.removePatient(x.pid);
    await pelny(A, C);
    await wizyta(B, x);
    await pelny(A, B);
    await pelny(B, D);
    expect(await stan(D, x), 'stare D dostało uratowane notatki').toBe('karta [n1,n2] nagr[]');
    await dostarcz(B, C, (t) => t === 'karta');
    przesun(60e3); await C.v.removePatient(x.pid);
    const w = await rundy(x, ['C', 'D', 'A', 'B'], 4, ['A', 'B', 'C', 'D']);
    expect(w.stabilne, JSON.stringify(w.ost)).toBe(true);
    for (const k of ['A', 'B', 'C', 'D']) expect(w.ost[k].replace(/\+pole/g, ''), k).toBe('BRAK [] nagr[n1,n2]');
  });

  // Gałąź „notatka, która w międzyczasie wróciła pod tego pacjenta, idzie przez Eb” pilnuje L10 (przegląd 2).
  it('odnowienie nie rusza nagrobków innego pacjenta ani nagrobków bez pola', async () => {
    const x = await przygotuj({ A: {} }, ['n1', 'n2', 'n3']);
    const A = x.urz.A;
    przesun(60e3); await A.v.removePatientNote(x.id('n3'));
    const n3 = (await nagrobkiNotatek(A)).find((t) => t.id === x.id('n3'));
    const pusty = { schemaVersion: 2, patients: [], tombstones: [], notes: [], noteTombstones: [], patientNotes: [] };
    const obcy = { id: 'obca-1', deletedAtISO: przesun(1000), rev: 1, deletedWithPatient: { patientId: 'inny-pacjent', deletedAtISO: new Date(zegar - 500).toISOString() } };
    await A.scal({ ...pusty, patientNoteTombstones: [obcy] });
    przesun(60e3); await A.v.removePatient(x.pid);
    const po = await nagrobkiNotatek(A);
    expect(po.find((t) => t.id === x.id('n3')), 'ręczne usunięcie bez pola bez zmian').toEqual(n3);
    expect(po.find((t) => t.id === 'obca-1'), 'nagrobek innego pacjenta bez zmian').toEqual(obcy);
  });
});

describe('P-NOTATKI-ZA-KARTA — przegląd 1: nieświadome urządzenie w pasmie ratunku (F2)', () => {
  // F2: C (nie wie o usunięciu z A) usuwa pacjenta 2 ms / 300 ms / 900 ms po A, a B zmienia kartę pomiędzy. B ratuje
  // notatki (u′ = R + 1 ms + h) — u′ bywa późniejsze niż nagrobki C, więc C dostawało sieroty. [CZERWONY na 469c9fe2]
  // tylko 2 ms i 300 ms; przy 900 ms oba h są mniejsze niż odstęp (nagrobki C późniejsze niż u′), więc ten przypadek
  // reguły pasma nie wykonuje — kontrola, że nagrobki C wygrywają zwykłą datą.
  // Teraz wersja w pasmie (R, R + 1 s] przy polu i bez karty ginie razem z kartą.
  for (const odstep of [2, 300, 900]) {
    it(`P1 A usuwa (e1), B zmienia kartę (e1 + ${odstep / 2} ms), nieświadome C usuwa (e1 + ${odstep} ms); B ratuje, C pobiera od B → bez sierot`, async () => {
      const x = await przygotuj({ A: {}, B: {}, C: {} });
      const { A, B, C } = x.urz;
      przesun(60e3); await A.v.removePatient(x.pid);
      przesun(odstep / 2); await B.v.savePatient(jan(130, 26), { dedup: false, patientId: x.pid });
      przesun(odstep / 2); await C.v.removePatient(x.pid);
      await pelny(A, B);
      expect(await stan(B, x)).toBe('karta [n1,n2] nagr[]');
      await pelny(B, C);
      expect(await stan(C, x)).toBe('BRAK [] nagr[n1+pole,n2+pole]');
      const w = await rundy(x, ['A', 'B', 'C'], 4);
      expect(w.zbiezne && w.stabilne, JSON.stringify(w.ost)).toBe(true);
      expect(w.ost.A).toBe('BRAK [] nagr[n1+pole,n2+pole]');
    });
  }

  // G13 poszerza pasmo do przesunięcia zegara notatki: D2 = u = R, a u′ = R + 1 ms + h.
  it('P1c G13: n1 z updatedAtISO +1 h; A usuwa; B zmienia kartę; nieświadome C usuwa 10 min po A; B ratuje, C pobiera od B → bez sierot', async () => {
    const x = await przygotuj({ A: {}, B: {}, C: {} });
    const { A, B, C } = x.urz;
    vi.setSystemTime(zegar + 3600e3);
    await A.v.savePatientNote({ id: x.id('n1'), patientId: x.pid, title: 'n1', body: 'z przyszłości' });
    vi.setSystemTime(zegar);
    await rundy(x, ['A', 'B', 'C'], 1);
    przesun(60e3); await A.v.removePatient(x.pid);
    przesun(60e3); await B.v.savePatient(jan(130, 26), { dedup: false, patientId: x.pid });
    przesun(9 * 60e3); await C.v.removePatient(x.pid);
    await pelny(A, B);
    await pelny(B, C);
    expect(await stan(C, x)).toBe('BRAK [] nagr[n1+pole,n2+pole]');
    const w = await rundy(x, ['A', 'B', 'C'], 4);
    expect(w.zbiezne && w.stabilne).toBe(true);
    expect(w.ost.A).toBe('BRAK [] nagr[n1+pole,n2+pole]');
  });

  // Znane ograniczenie: krok „pasmo bez karty” wymaga pola. Stary D, przez który przechodzą nagrobki C, ucina pole, a B
  // po ratunku nie ma już własnego nagrobka — dopóki B pobiera tylko ładunek D, zostaje z sierotami; pierwszy ładunek
  // nowego urządzenia (nagrobki z polem) je kasuje. Na bazie notatek nie ma nigdzie.
  it('P1d [znane ograniczenie] jak P1 (300 ms), B pobiera tylko przez stary D → B z sierotami; po ładunku nowego A — bez sierot wszędzie', async () => {
    const x = await przygotuj({ A: {}, B: {}, C: {}, D: { stara: true } });
    const { A, B, C } = x.urz;
    przesun(60e3); await A.v.removePatient(x.pid);
    przesun(150); await B.v.savePatient(jan(130, 26), { dedup: false, patientId: x.pid });
    przesun(150); await C.v.removePatient(x.pid);
    await pelny(A, B);
    const w = await rundy(x, ['B', 'C', 'A', 'D'], 3, ['A', 'B', 'C', 'D']);
    expect(w.stabilne, JSON.stringify(w.ost)).toBe(true);
    expect(w.ost).toEqual({ A: 'BRAK [] nagr[n1+pole,n2+pole]', B: 'SIEROTY [n1,n2] nagr[]', C: 'BRAK [] nagr[n1+pole,n2+pole]', D: 'BRAK [] nagr[n1,n2]' });
    await pelny(A, B);
    const w2 = await rundy(x, ['B', 'C', 'A', 'D'], 3, ['A', 'B', 'C', 'D']);
    expect(w2.stabilne).toBe(true);
    for (const k of ['A', 'B', 'C', 'D']) expect(w2.ost[k].replace(/\+pole/g, ''), k).toBe('BRAK [] nagr[n1,n2]');
  });
  // Znane ograniczenie (ALGORITHMS.md, „Ograniczenia”): ręczne usunięcie na nieświadomym urządzeniu w pasmie (R, R + 1 s]
  // przegrywa z ratunkiem, gdy h tej notatki jest większe niż odstęp (tu h(n1) ≈ 0,7 s > 300 ms); późniejsze o ponad 1 s
  // wygrywa (T9), poza spóźnionym zegarem urządzenia usuwającego i G13 (ALGORITHMS, „Ręczne usunięcie w pasmie ratunku”).
  it('P1b [znane ograniczenie] nieświadome C ręcznie usuwa n1 300 ms po „Usuń pacjenta”, B zmieniło kartę 150 ms po → n1 wraca', async () => {
    const x = await przygotuj({ A: {}, B: {}, C: {} });
    const { A, B, C } = x.urz;
    przesun(60e3); await A.v.removePatient(x.pid);
    const R = (await nagrobkiNotatek(A)).find((t) => t.id === x.id('n1')).deletedAtISO;
    przesun(150); await B.v.savePatient(jan(130, 26), { dedup: false, patientId: x.pid });
    przesun(150); await C.v.removePatientNote(x.id('n1'));
    await pelny(A, B);
    const u = (await B.v.listAllPatientNotes()).find((n) => n.id === x.id('n1')).updatedAtISO;
    expect(Date.parse(u) - Date.parse(R), 'h(n1) > 300 ms').toBeGreaterThan(300);
    const w = await rundy(x, ['B', 'C', 'A'], 4);
    expect(w.zbiezne && w.stabilne).toBe(true);
    expect(w.ost.A).toBe('karta [n1,n2] nagr[]');
  });
});

describe('P-NOTATKI-ZA-KARTA — przegląd 1: koszt (F3)', () => {
  // F3 [CZERWONY na 469c9fe2]: „Usuń pacjenta” czytało pełną listę nagrobków notatek raz na notatkę (Bnp_poleEb, pod
  // blokadą pacjenta), a każda delta nagrobka (ls) — znowu pełną listę. Teraz lista raz w Bpu_usun, delta i ratunek
  // czytają pojedynczy rekord (getPatientNoteTombstoneForUser).
  it('„Usuń pacjenta” z 6 notatkami przy 50 innych nagrobkach: jedna lista nagrobków notatek; delty ls i ratunek bez list', async () => {
    const x = await przygotuj({ A: {}, B: {} });
    const { A, B } = x.urz;
    for (let i = 0; i < 4; i += 1) { przesun(1000); const n = await A.v.savePatientNote({ patientId: x.pid, title: `d${i}`, body: 'fikcja' }); x.nn[n.id] = `d${i}`; }
    const pusty = { schemaVersion: 2, patients: [], tombstones: [], notes: [], noteTombstones: [], patientNotes: [] };
    przesun(1000);
    await A.scal({ ...pusty, patientNoteTombstones: Array.from({ length: 50 }, (_, i) => ({ id: `stary-${i}`, deletedAtISO: new Date(zegar - 1000).toISOString(), rev: 1 })) });
    await pelny(A, B);
    A.zeruj();
    przesun(60e3); await A.v.removePatient(x.pid);
    expect(A.licz.listPatientNoteTombstonesForUser || 0, 'w „Usuń pacjenta”').toBe(1);
    A.zeruj();
    const moje = (await nagrobkiNotatek(A)).filter((t) => !t.id.startsWith('stary-'));
    expect(moje.length).toBe(6);
    for (const t of moje) await A.v.buildNoteTombstoneDelta(t.id, t.deletedAtISO);
    expect([A.licz.listPatientNoteTombstonesForUser || 0, A.licz.getPatientNoteTombstoneForUser], 'delty: pojedynczy rekord').toEqual([0, 6]);
    await wizyta(B, x);
    B.zeruj();
    const wynik = await B.scal(await A.v.exportSyncPayload());
    expect(wynik.updatedPatientNoteCount).toBe(6);
    expect(B.licz.listPatientNoteTombstonesForUser, 'scalanie z ratunkiem 6 notatek: lista tylko na starcie sekcji notatek').toBe(1);
  });
});

describe('P-NOTATKI-ZA-KARTA — przegląd 1: flota mieszana (zgł. 1–2; stare = emulacja 346dd81a)', () => {
  // Zgł. 1, znane ograniczenie (H2b we flocie mieszanej, D21-3): stare C ręcznie usuwa n1 przed „Usuń pacjenta” na A
  // i pobiera usunięcie, zanim wyśle. Stare Le przepisuje swój nagrobek ręczny na chwilę R z A, bez pola — chwila
  // ręcznego usunięcia ginie, zanim C cokolwiek wyśle, a kopia bez pola o chwili R to echo (D21-7). n1 wraca.
  it('R10b [znane ograniczenie] stare C ręcznie usuwa n1 przed „Usuń pacjenta”, pobiera usunięcie, zanim wyśle → n1 wraca', async () => {
    const x = await przygotuj({ A: {}, B: {}, C: { stara: true } });
    const { A, C } = x.urz;
    przesun(60e3); await C.v.removePatientNote(x.id('n1'));
    const reczny = (await nagrobkiNotatek(C)).find((t) => t.id === x.id('n1'));
    przesun(60e3); await A.v.removePatient(x.pid);
    const zA = (await nagrobkiNotatek(A)).find((t) => t.id === x.id('n1'));
    await wizyta(x.urz.B, x);
    await x.c.sync(A); await x.c.sync(C);
    expect(reczny.deletedAtISO < zA.deletedAtISO).toBe(true);
    expect((await nagrobkiNotatek(C)).find((t) => t.id === x.id('n1')), 'mechanizm: ręczna chwila zastąpiona chwilą R, bez pola').toEqual({ id: zA.id, deletedAtISO: zA.deletedAtISO, rev: zA.rev });
    const w = await rundy(x, ['A', 'C', 'A', 'B'], 3, ['A', 'B', 'C']);
    expect(w.zbiezne && w.stabilne).toBe(true);
    expect(w.ost.A).toBe('karta [n1,n2] nagr[]');
  });
  it('R10c [kontrola] to samo z nowym C → krata pamięta ręczne usunięcie, [n2]', async () => {
    const x = await przygotuj({ A: {}, B: {}, C: {} });
    przesun(60e3); await x.urz.C.v.removePatientNote(x.id('n1'));
    przesun(60e3); await x.urz.A.v.removePatient(x.pid);
    await wizyta(x.urz.B, x);
    await x.c.sync(x.urz.A); await x.c.sync(x.urz.C);
    const w = await rundy(x, ['A', 'C', 'A', 'B'], 3, ['A', 'B', 'C']);
    expect(w.zbiezne && w.stabilne).toBe(true);
    expect(w.ost.A).toBe('karta [n2] nagr[n1+pole+r]');
  });
  // Zgł. 1, wariant b: nowe C pamięta ręczne usunięcie (manualDeletedAtISO), ale stary przekaźnik O ucina pole razem
  // z tą datą; B ma pole bez ręcznego usunięcia i ratuje n1 — u′ > R wygrywa także na C.
  for (const [opis, staryO, cel] of [['[znane ograniczenie] stary O', true, 'karta [n1,n2] nagr[]'], ['[kontrola] nowy O', false, 'karta [n2] nagr[n1+pole+r]']]) {
    it(`R10d ${opis} przekazuje stan nowego C (ręczne usunięcie n1 przed „Usuń pacjenta”); B ma pole bez M i zmienia kartę → ${cel}`, async () => {
      const x = await przygotuj({ A: {}, B: {}, C: {}, O: { stara: staryO } });
      const { A, B, C, O } = x.urz;
      przesun(60e3); await C.v.removePatientNote(x.id('n1'));
      przesun(60e3); await A.v.removePatient(x.pid);
      przesun(1000); await B.scal({ ...kopia(await A.v.exportSyncPayload()), patients: [], tombstones: [] });
      await x.c.sync(A); await x.c.sync(C); await x.c.sync(O);
      await wizyta(B, x);
      await x.c.sync(B);
      const w = await rundy(x, ['C', 'A', 'B', 'O'], 3, ['A', 'B', 'C']);
      expect(w.zbiezne && w.stabilne, JSON.stringify(w.ost)).toBe(true);
      expect(w.ost.C).toBe(cel);
    });
  }

  // Zgł. 2b [CZERWONY na 469c9fe2]: E w stanie „czeka” ma poprawkę n1 (rev 2) sprzed usunięcia, której A nie znało.
  // B ratuje rev 1 (u′ > R); E dostaje ładunek B: Y = u′ > R, ale zostaje rev 2 z chwilą ≤ R — dotąd bez dotknięcia
  // i bez nagrobka, więc echo starego O (nagrobek bez pola, chwila R) kasowało ją wszędzie. Teraz RATUNEK rev 2.
  it('zgł. 2b: E „czeka” z rev 2 sprzed usunięcia, B ratuje rev 1 → E ratuje rev 2 (chwila > R); echo starego O nie kasuje poprawki E', async () => {
    const x = await przygotuj({ A: {}, B: {}, E: {}, O: { stara: true } });
    const { A, B, E, O } = x.urz;
    przesun(30e3); await E.v.savePatientNote({ id: x.id('n1'), patientId: x.pid, title: 'n1', body: 'poprawka E' });
    przesun(60e3); await A.v.removePatient(x.pid);
    const R = (await nagrobkiNotatek(A)).find((t) => t.id === x.id('n1')).deletedAtISO;
    await pelny(A, O);
    przesun(1000); await E.scal({ ...kopia(await A.v.exportSyncPayload()), patients: [], tombstones: [] });
    expect(await stan(E, x)).toBe('karta [n1=poprawka E,n2] nagr[n1+pole,n2+pole]');
    await wizyta(B, x);
    await pelny(A, B); await pelny(B, A);
    await pelny(B, E);
    const n1E = (await E.v.listAllPatientNotes()).find((n) => n.id === x.id('n1'));
    expect([n1E.body, n1E.rev, n1E.updatedAtISO > R], 'rev 2 uratowana, chwila > R').toEqual(['poprawka E', 2, true]);
    await pelny(E, B); await pelny(E, A);
    await pelny(O, A); await pelny(O, B); await pelny(O, E);
    for (let r = 0; r < 2; r += 1) for (const [z, na] of [[A, O], [O, A], [A, B], [B, E], [E, A]]) await pelny(z, na);
    for (const k of ['A', 'B', 'E', 'O']) expect((await stan(x.urz[k], x)).replace(/\+pole/g, ''), k).toBe('karta [n1=poprawka E,n2] nagr[]');
    expect(await meta(A, x)).toEqual(await meta(E, x));
  });
  // Zgł. 2b, karta jeszcze nie późniejsza: delty uratowanych notatek docierają do E przed kartą B. rev 2 sprzed usunięcia
  // czeka (nagrobek zostaje, bez dotknięcia), a gdy dojdzie karta — RATUNEK; „notatka” zdjęłaby nagrobek i zostawiła
  // rev 2 z chwilą ≤ R na pastwę echa.
  it('zgł. 2b: delty ratunku z B docierają do E przed kartą → rev 2 czeka z nagrobkiem; po karcie RATUNEK; echo starego O nie kasuje poprawki E', async () => {
    const x = await przygotuj({ A: {}, B: {}, E: {}, O: { stara: true } });
    const { A, B, E, O } = x.urz;
    przesun(30e3); await E.v.savePatientNote({ id: x.id('n1'), patientId: x.pid, title: 'n1', body: 'poprawka E' });
    przesun(60e3); await A.v.removePatient(x.pid);
    const R = (await nagrobkiNotatek(A)).find((t) => t.id === x.id('n1')).deletedAtISO;
    await pelny(A, O);
    przesun(1000); await E.scal({ ...kopia(await A.v.exportSyncPayload()), patients: [], tombstones: [] });
    await wizyta(B, x);
    nagrywaj(B);
    await pelny(A, B);
    await dostarcz(B, E, (t) => t === 'notatka');
    expect(await stan(E, x), 'n1 (rev 2) czeka z nagrobkiem, n2 przyjęta').toBe('karta [n1=poprawka E,n2] nagr[n1+pole]');
    await pelny(B, E);
    const n1E = (await E.v.listAllPatientNotes()).find((n) => n.id === x.id('n1'));
    expect([n1E.rev, n1E.updatedAtISO > R, await stan(E, x)]).toEqual([2, true, 'karta [n1=poprawka E,n2] nagr[]']);
    for (let r = 0; r < 2; r += 1) for (const [z, na] of [[E, B], [E, A], [O, A], [O, B], [O, E], [A, O]]) await pelny(z, na);
    for (const k of ['A', 'B', 'E', 'O']) expect((await stan(x.urz[k], x)).replace(/\+pole/g, ''), k).toBe('karta [n1=poprawka E,n2] nagr[]');
  });
  // Zgł. 2a, znane ograniczenie: E NIE miało nagrobka (nie widziało usunięcia), dostaje uratowaną rev 1 — wyższy rev 2
  // wygrywa zwykłą regułą z chwilą ≤ R i rozchodzi się bez nagrobka; echo starego O kasuje n1 wszędzie (jak na bazie,
  // gdzie n1 ginie od razu). Naprawa wymagałaby niesienia R razem z uratowaną notatką (zmiana formatu notatki).
  it('zgł. 2a [znane ograniczenie] E bez nagrobka z rev 2 sprzed usunięcia, ratunek rev 1 na B, potem echo starego O → n1 ginie wszędzie', async () => {
    const x = await przygotuj({ A: {}, B: {}, E: {}, O: { stara: true } });
    const { A, B, E, O } = x.urz;
    przesun(30e3); await E.v.savePatientNote({ id: x.id('n1'), patientId: x.pid, title: 'n1', body: 'poprawka E' });
    przesun(60e3); await A.v.removePatient(x.pid);
    await pelny(A, O);
    await wizyta(B, x);
    await pelny(A, B); await pelny(B, A);
    await pelny(B, E); await pelny(E, B); await pelny(E, A);
    expect(await stan(A, x), 'przed echem: poprawka E widoczna').toBe('karta [n1=poprawka E,n2] nagr[]');
    await pelny(O, A); await pelny(O, B); await pelny(O, E);
    for (let r = 0; r < 2; r += 1) for (const [z, na] of [[A, O], [O, A], [A, B], [B, E], [E, A]]) await pelny(z, na);
    for (const k of ['A', 'B', 'E', 'O']) expect((await stan(x.urz[k], x)).replace(/\+pole/g, ''), k).toBe('karta [n2] nagr[n1]');
  });
});

describe('P-NOTATKI-ZA-KARTA — przegląd 1: luki testów (L1–L8)', () => {
  // L1 (wspólne e w Bpu_usun): zegar A biegnie w trakcie „Usuń pacjenta” (+10 ms po każdej skasowanej notatce), wizyta B
  // ma chwilę pomiędzy. Osobne chwile pola i nagrobka karty dawałyby sieroty albo wieczne CZEKA.
  it('L1 zegar biegnie w trakcie „Usuń pacjenta”, wizyta B 5 ms po e, delty w naturalnej kolejności → [n1,n2] po deltach i po pełnych ładunkach', async () => {
    const x = await przygotuj({ A: {}, B: {} });
    const { A, B } = x.urz;
    nagrywaj(A);
    const t0 = Date.parse(przesun(60e3));
    A.hak((k) => { if (k === 'removePatientNoteForUser') przesun(10); });
    await A.v.removePatient(x.pid);
    A.hak(null);
    expect((await nagrobekKarty(A, x.pid)).deletedAtISO, 'e liczone przed pętlą notatek').toBe(new Date(t0).toISOString());
    zegar = t0 + 5; vi.setSystemTime(zegar);
    await B.v.savePatient(jan(130, 26), { dedup: false, patientId: x.pid });
    przesun(60e3);
    await dostarcz(A, B);
    expect(await stan(B, x), 'po deltach').toBe('karta [n1,n2] nagr[]');
    const w = await rundy(x, ['A', 'B'], 3);
    expect(w.zbiezne && w.stabilne).toBe(true);
    expect(w.ost.A).toBe('karta [n1,n2] nagr[]');
  });

  // L2: granica lastSavedAtISO === e (ta sama ostra nierówność co Bsl_usunPacjenta) — karta przy remisie ginie, więc
  // notatki też.
  it('L2 wizyta B w tej samej milisekundzie co „Usuń pacjenta” (lastSavedAtISO === e), delty → karta i notatki giną razem', async () => {
    const x = await przygotuj({ A: {}, B: {} });
    const { A, B } = x.urz;
    nagrywaj(A);
    const t0 = przesun(60e3);
    await A.v.removePatient(x.pid);
    await B.v.savePatient(jan(130, 26), { dedup: false, patientId: x.pid });
    expect((await B.v.listPatients()).find((p) => p.patientId === x.pid).lastSavedAtISO).toBe(t0);
    await dostarcz(A, B);
    expect(await stan(B, x)).toBe('BRAK [] nagr[n1+pole,n2+pole]');
    const w = await rundy(x, ['A', 'B'], 3);
    expect(w.zbiezne && w.stabilne).toBe(true);
    expect(w.ost.A).toBe('BRAK [] nagr[n1+pole,n2+pole]');
  });

  // L3: najczęstszy stan po rozejściu się „Usuń pacjenta” (365 dni): nagrobki z polem bez wersji notatek i bez karty —
  // scalanie nie czyta karty (leniwy odczyt tylko dla kandydatów).
  it('L3 nagrobki notatek z polem, bez wersji notatek i bez karty → kolejne scalanie: 0 odczytów karty i 0 blokad pacjenta', async () => {
    const locks = atrapaLocks();
    const x = await przygotuj({ A: {} });
    const A = x.urz.A;
    przesun(60e3); await A.v.removePatient(x.pid);
    const D = await urzadzenie('D', { locks });
    const tylkoNotatki = { ...kopia(await A.v.exportSyncPayload()), patients: [], tombstones: [] };
    przesun(5e3); await D.scal(tylkoNotatki);
    D.zeruj(); locks.zadania.length = 0;
    przesun(5e3); await D.scal(tylkoNotatki);
    expect((await nagrobkiNotatek(D)).every((t) => t.deletedWithPatient)).toBe(true);
    expect(D.licz.getPatientForUser || 0, 'odczyty karty').toBe(0);
    expect(locks.zadania.filter((n) => n.startsWith('vilda-save-pat:'))).toEqual([]);
  });

  // L6 = T14b (D21-7 na poziomie decyzji): echo starego O i kopia z polem spotykają się w jednym scaleniu przy żywych
  // wersjach notatek — echo to ta sama wiadomość, nie ręczne usunięcie (M = R skasowałoby notatki).
  it('T14b [CZERWONY przy „echo = ręczne usunięcie”] B „czeka” (delty nagrobków notatek), wizyta B, potem pełny ładunek starego O z echem → notatki uratowane', async () => {
    const x = await przygotuj({ A: {}, B: {} });
    const { A, B } = x.urz;
    nagrywaj(A, { nagrPac: true });
    przesun(60e3); await A.v.removePatient(x.pid);
    await dostarcz(A, B, (t) => t === 'nagrNot');
    expect(await stan(B, x)).toBe('karta [n1,n2] nagr[n1+pole,n2+pole]');
    await wizyta(B, x);
    przesun(5e3); await B.scal(bezPola(await A.v.exportSyncPayload()));
    expect(await stan(B, x)).toBe('karta [n1,n2] nagr[]');
  });

  // L7 (odstępstwo 6): edycja w drugiej karcie przeglądarki między decyzją a ratunkiem — ratunek nie cofa jej chwili.
  it('L7 edycja n1 w drugiej karcie między decyzją a ratunkiem → ratunek nie cofa jej updatedAtISO', async () => {
    const locks = atrapaLocks();
    const x = await przygotuj({ A: {}, B: { locks } });
    const { A, B } = x.urz;
    przesun(60e3); await A.v.removePatient(x.pid);
    await wizyta(B, x);
    const druga = okno({ locks }).VildaVault;
    druga.setStorageAdapter(B.baza);
    await druga.unlockUser(B.uid, B.haslo);
    const ladunek = { ...kopia(await A.v.exportSyncPayload()), patients: [], tombstones: [] };
    const p = B.pulapka('getPatientForUser', (_u, pid) => pid === x.pid && (B.licz.listPatientNoteTombstonesForUser || 0) > 0);
    B.zeruj();
    const scal = B.scal(ladunek);
    await p.osiagnieta;
    const tEdycji = przesun(30e3);
    await druga.savePatientNote({ id: x.id('n1'), patientId: x.pid, title: 'n1', body: 'edycja w drugiej karcie' });
    p.zwolnij();
    await scal;
    const po = (await B.v.listAllPatientNotes()).find((n) => n.id === x.id('n1'));
    expect([po.body, po.updatedAtISO, po.rev]).toEqual(['edycja w drugiej karcie', tEdycji, 2]);
    expect(await stan(B, x)).toBe('karta [n1=edycja w drugiej karcie,n2] nagr[]');
  });

  // L8 (odstępstwo 3): błąd odczytu karty przy decyzji — CZEKA (notatki zostają), nie usunięcie z powodu awarii.
  it('L8 błąd odczytu karty przy decyzji → CZEKA: notatki i nagrobki z polem zostają, bez błędu scalania', async () => {
    const x = await przygotuj({ A: {}, B: {} });
    const { A, B } = x.urz;
    przesun(60e3); await A.v.removePatient(x.pid);
    const ladunek = { ...kopia(await A.v.exportSyncPayload()), patients: [], tombstones: [] };
    const getP = B.baza.getPatientForUser;
    let raz = true;
    B.baza.getPatientForUser = async function (...a) { if (raz && a[1] === x.pid) { raz = false; throw new Error('odczyt karty: awaria'); } return getP.apply(this, a); };
    try { przesun(5e3); await B.scal(ladunek); } finally { B.baza.getPatientForUser = getP; }
    expect(raz, 'awaria wstrzyknięta').toBe(false);
    expect(await stan(B, x)).toBe('karta [n1,n2] nagr[n1+pole,n2+pole]');
  });
});

describe('P-NOTATKI-ZA-KARTA — przegląd 1: podgląd „Scal kopię konta” = wynik = magazyn (P1–P4)', () => {
  // A, B, C bez wymiany; notatki n1, n2 na A tworzy x.notatki() (P3: po wysłaniu karty do B).
  async function trzy() {
    sztucznyZegar();
    const x = { urz: { A: await urzadzenie('A'), B: await urzadzenie('B'), C: await urzadzenie('C') }, nn: {} };
    const { A } = x.urz;
    przesun(60e3); const k = await A.v.savePatient(jan(120, 22), { dedup: false });
    przesun(60e3); await A.v.savePatient(jan(125, 24), { dedup: false, patientId: k.patientId });
    x.pid = k.patientId;
    x.notatki = async () => { for (const t of ['n1', 'n2']) { przesun(1000); const n = await A.v.savePatientNote({ patientId: k.patientId, title: t, body: 'fikcja ' + t }); x.nn[n.id] = t; } };
    return x;
  }
  it('P1 kopia C z nową wizytą (C „czeka”), B z kartą sprzed wizyty → RATUNEK na B; updated 2', async () => {
    const x = await trzy();
    const { A, B, C } = x.urz;
    await x.notatki();
    await pelny(A, B); await pelny(A, C);
    nagrywaj(A);
    przesun(60e3); await A.v.removePatient(x.pid);
    await dostarcz(A, C, (t) => t === 'nagrNot');
    expect(await stan(C, x)).toBe('karta [n1,n2] nagr[n1+pole,n2+pole]');
    await wizyta(C, x);
    const r = await scalKopie(B, C);
    expect(r.d).toEqual({ dodane: 0, zmienione: 2, usuniete: 0, przywrocone: 0 });
  });
  it('P2 kopia C po gwiazdce (karta C późniejsza, bez nowych wersji dla B) → CZEKA na B; 0 zmian', async () => {
    const x = await trzy();
    const { A, B, C } = x.urz;
    await x.notatki();
    await pelny(A, B); await pelny(A, C);
    nagrywaj(A);
    przesun(60e3); await A.v.removePatient(x.pid);
    await dostarcz(A, C, (t) => t === 'nagrNot');
    const s1 = (await C.v.getPatient(x.pid)).snapshots[0].snapshotId;
    przesun(60e3); await C.v.setSnapshotPinned(x.pid, s1, true);
    const r = await scalKopie(B, C);
    expect(r.d).toEqual({ dodane: 0, zmienione: 0, usuniete: 0, przywrocone: 0 });
    expect(await stan(B, x)).toBe('karta [n1,n2] nagr[n1+pole,n2+pole]');
  });
  it('P3 notatki dodane z kopii w stanie CZEKA (nagrobek z polem zostaje) nie są „przywrócone”', async () => {
    const x = await trzy();
    const { A, B, C } = x.urz;
    await pelny(A, B);
    await x.notatki();
    await pelny(A, C);
    nagrywaj(A);
    przesun(60e3); await A.v.removePatient(x.pid);
    await dostarcz(A, B, (t) => t === 'nagrNot');
    expect(await stan(B, x)).toBe('karta [] nagr[n1+pole,n2+pole]');
    const r = await scalKopie(B, C);
    expect(r.d).toEqual({ dodane: 2, zmienione: 0, usuniete: 0, przywrocone: 0 });
    expect(await stan(B, x)).toBe('karta [n1,n2] nagr[n1+pole,n2+pole]');
  });
  it('P4 ratunek wersji z wyższym rev i wcześniejszą chwilą niż tutejsza (G13) → nie „zastąpiona późniejsza edycja”', async () => {
    const x = await trzy();
    const { A, B, C } = x.urz;
    vi.setSystemTime(zegar + 3600e3);
    const n1 = await A.v.savePatientNote({ patientId: x.pid, title: 'n1', body: 'z przyszłości' }); x.nn[n1.id] = 'n1';
    vi.setSystemTime(zegar);
    await pelny(A, B); await pelny(A, C);
    przesun(60e3); await C.v.savePatientNote({ id: n1.id, patientId: x.pid, title: 'n1', body: 'poprawka C' });
    nagrywaj(A);
    przesun(60e3); await A.v.removePatient(x.pid);
    await dostarcz(A, C, (t) => t === 'nagrNot');
    expect(await stan(C, x)).toBe('karta [n1=poprawka C] nagr[n1+pole]');
    await wizyta(B, x);
    const nB = (await B.v.listAllPatientNotes()).find((n) => n.id === n1.id), nC = (await C.v.listAllPatientNotes()).find((n) => n.id === n1.id);
    expect([nC.rev, nB.rev, nC.updatedAtISO < nB.updatedAtISO], 'kopia: wyższy rev, wcześniejsza chwila').toEqual([2, 1, true]);
    const r = await scalKopie(B, C);
    expect(r.d).toEqual({ dodane: 0, zmienione: 1, usuniete: 0, przywrocone: 0 });
    expect(r.podglad.replacedNewerPatientNoteCount).toBe(0);
  });
  // Przegląd 1, F2 w podglądzie. P5 [kontrola]: karta z kopii jest pominięta (nagrobek C późniejszy), więc jej notatek
  // podgląd i ss nie biorą wcale. P5b: kopia urządzenia, które ma uratowane notatki bez karty (dostało tylko delty
  // notatek) — wersja z kopii w pasmie ratunku przy karcie usuniętej tutaj jest „usunięta”, nie „dodana”.
  it('P5 [kontrola] kopia B z uratowanymi notatkami (u′ w pasmie), a C usunęło kartę 300 ms po A, nie wiedząc o tym → podgląd i wynik: notatki nie wracają', async () => {
    const x = await przygotuj({ A: {}, B: {}, C: {} });
    const { A, B, C } = x.urz;
    przesun(60e3); await A.v.removePatient(x.pid);
    przesun(150); await B.v.savePatient(jan(130, 26), { dedup: false, patientId: x.pid });
    przesun(150); await C.v.removePatient(x.pid);
    await pelny(A, B);
    expect(await stan(B, x)).toBe('karta [n1,n2] nagr[]');
    const r = await scalKopie(C, B);
    expect(r.d).toEqual({ dodane: 0, zmienione: 0, usuniete: 0, przywrocone: 0 });
    expect(await stan(C, x)).toBe('BRAK [] nagr[n1+pole,n2+pole]');
  });
  it('P5b [CZERWONY na 469c9fe2] kopia Q (uratowane notatki z delt, bez karty); C usunęło kartę 300 ms po A, nie wiedząc o tym → 0 dodanych, bez sierot', async () => {
    const x = await przygotuj({ A: {}, B: {}, C: {} });
    const { A, B, C } = x.urz;
    const Q = await urzadzenie('Q');
    przesun(60e3); await A.v.removePatient(x.pid);
    przesun(150); await B.v.savePatient(jan(130, 26), { dedup: false, patientId: x.pid });
    przesun(150); await C.v.removePatient(x.pid);
    nagrywaj(B);
    await pelny(A, B);
    await dostarcz(B, Q, (t) => t === 'notatka');
    expect(await stan(Q, x), 'Q: notatki z delt ratunku, bez karty').toBe('SIEROTY [n1,n2] nagr[]');
    const r = await scalKopie(C, Q);
    expect(r.d).toEqual({ dodane: 0, zmienione: 0, usuniete: 0, przywrocone: 0 });
    expect(await stan(C, x)).toBe('BRAK [] nagr[n1+pole,n2+pole]');
  });
  // Zgł. 2b w podglądzie. replacedNewer liczony semantycznie: ratunek nie jest „zastąpioną późniejszą edycją” (tutejsza
  // u′ to tylko dotknięcie starszej rev 1; mechaniczna różnica chwil zależy tu od h obu treści), reszta = magazyn.
  it('P6 kopia E (rev 2 sprzed usunięcia, „czeka”) na B z uratowaną rev 1 → wersja E wchodzi i jest ratowana (rev 2, chwila > R); podgląd = wynik = magazyn', async () => {
    const x = await przygotuj({ A: {}, B: {}, E: {} });
    const { A, B, E } = x.urz;
    przesun(30e3); await E.v.savePatientNote({ id: x.id('n1'), patientId: x.pid, title: 'n1', body: 'poprawka E' });
    przesun(60e3); await A.v.removePatient(x.pid);
    przesun(1000); await E.scal({ ...kopia(await A.v.exportSyncPayload()), patients: [], tombstones: [] });
    await wizyta(B, x);
    await pelny(A, B);
    przesun(60e3);
    const plik = await E.v.exportVaultBackup();
    const przed = await migawkaNotatek(B);
    const podglad = await B.v.previewVaultBackupMerge(plik, E.haslo);
    const wynik = await B.v.mergeVaultBackup(plik, E.haslo);
    const po = await migawkaNotatek(B);
    const zmienione = Array.from(po.notatki.keys()).filter((k) => przed.notatki.has(k) && przed.notatki.get(k) !== po.notatki.get(k)).length;
    expect([podglad.addedPatientNoteCount, podglad.updatedPatientNoteCount, podglad.deletedPatientNoteCount, podglad.restoredPatientNoteCount, podglad.replacedNewerPatientNoteCount]).toEqual([0, 1, 0, 0, 0]);
    expect([wynik.addedPatientNoteCount, wynik.updatedPatientNoteCount, wynik.deletedPatientNoteCount, zmienione, po.notatki.size]).toEqual([0, 1, 0, 1, 2]);
    const n1 = (await B.v.listAllPatientNotes()).find((n) => n.id === x.id('n1'));
    const R = (await nagrobkiNotatek(A)).find((t) => t.id === x.id('n1')).deletedAtISO;
    expect([n1.rev, n1.updatedAtISO > R, await stan(B, x)]).toEqual([2, true, 'karta [n1=poprawka E,n2] nagr[]']);
  });
});

describe('P-NOTATKI-ZA-KARTA — przegląd 2: zapis notatki w stanie „czeka” (poprawność zgł. 1, flota Z1)', () => {
  // [CZERWONY na 8c70884d] Zapis notatki (savePatientNote → Ad) zawsze zdejmował jej nagrobek. W stanie CZEKA (karta jest,
  // usunięcie karty jeszcze nie doszło, D21-6) poprawka dostawała chwilę > R + 1 s, więc gdy dochodziło usunięcie karty,
  // zostawała sierotą na każdym urządzeniu (na db0c2d50 notatek w tym oknie nie było, edycja była niemożliwa). Teraz
  // nagrobek z polem zostaje z chwilą zapisu (Bnp_poZapisie): poprawka znika razem z kartą albo wraca z nią.
  // Na 8c70884d czerwone CZ1–CZ9 i CZ1r (CZ8 — także bez zapisu: pętla CZEKA cofała nowszy nagrobek przy istniejącej
  // notatce); zielone granice CZ3b, CZ3c, CZ7b (8c70884d zawsze zdejmowało nagrobek) i kontrole SP1, EL1.
  const popraw = async (d, x, t = 'n1', tresc = 'poprawka B') => {
    const kiedy = przesun(60e3);
    await d.v.savePatientNote({ id: x.id(t), patientId: x.pid, title: t, body: tresc });
    return kiedy;
  };
  const nagrobekNotatki = async (d, x, t) => (await nagrobkiNotatek(d)).find((q) => q.id === x.id(t)) || null;
  // B „czeka”: nagrobki notatek z polem doszły deltami, delta nagrobka karty zginęła (jak T7).
  async function czekaDelty(urz = { A: {}, B: {} }) {
    const x = await przygotuj(urz);
    nagrywaj(x.urz.A, { nagrPac: true });
    przesun(60e3); await x.urz.A.v.removePatient(x.pid);
    x.e = (await nagrobekKarty(x.urz.A, x.pid)).deletedAtISO;
    await dostarcz(x.urz.A, x.urz.B);
    expect(await stan(x.urz.B, x), 'B czeka').toBe('karta [n1,n2] nagr[n1+pole,n2+pole]');
    return x;
  }
  // B „czeka” po „Scal kopię konta” z kopii A, która usunęła pacjenta (jak T17).
  async function czekaKopia() {
    const x = await przygotuj({ A: {}, B: {} });
    przesun(60e3); await x.urz.A.v.removePatient(x.pid);
    przesun(60e3); await x.urz.B.v.mergeVaultBackup(await x.urz.A.v.exportVaultBackup(), x.urz.A.haslo);
    expect(await stan(x.urz.B, x), 'B czeka').toBe('karta [n1,n2] nagr[n1+pole,n2+pole]');
    return x;
  }

  it('CZ1 [CZERWONY na 8c70884d] delty (delta nagrobka karty ginie); B „czeka” i poprawia n1 → nagrobek n1 zostaje z chwilą zapisu; pełne ładunki → karta i notatki znikają razem', async () => {
    const x = await czekaDelty();
    const { B } = x.urz;
    const kiedy = await popraw(B, x);
    expect(await stan(B, x)).toBe('karta [n1=poprawka B,n2] nagr[n1+pole,n2+pole]');
    const n1 = await nagrobekNotatki(B, x, 'n1');
    expect([n1.deletedAtISO, n1.rev, n1.deletedWithPatient], 'chwila zapisu, rev zapisu, pole bez zmian').toEqual([kiedy, 2, { patientId: x.pid, deletedAtISO: x.e }]);
    const w = await rundy(x, ['B', 'A'], 3);
    expect(w.zbiezne && w.stabilne, JSON.stringify(w.ost)).toBe(true);
    expect(w.ost.A).toBe('BRAK [] nagr[n1+pole,n2+pole]');
  });

  it('CZ2 [CZERWONY na 8c70884d] „Scal kopię konta” z kopii A (A usunęło pacjenta); B „czeka” i poprawia n1 → po synchronizacji z A karta i notatki znikają razem', async () => {
    const x = await czekaKopia();
    await popraw(x.urz.B, x);
    const w = await rundy(x, ['A', 'B'], 3);
    expect(w.zbiezne && w.stabilne, JSON.stringify(w.ost)).toBe(true);
    expect(w.ost.A).toBe('BRAK [] nagr[n1+pole,n2+pole]');
  });

  it('CZ4 [CZERWONY na 8c70884d] jak CZ2, ale B oznacza n2 jako zrobioną w Terminarzu (completePatientNote) → bez sierot', async () => {
    const x = await czekaKopia();
    const { B } = x.urz;
    przesun(60e3); await B.v.completePatientNote(x.id('n2'));
    expect((await B.v.listAllPatientNotes()).find((n) => n.id === x.id('n2')).completedAtISO, 'zrobiona').toBeTruthy();
    expect(await stan(B, x)).toBe('karta [n1,n2] nagr[n1+pole,n2+pole]');
    const w = await rundy(x, ['A', 'B'], 3);
    expect(w.zbiezne && w.stabilne, JSON.stringify(w.ost)).toBe(true);
    expect(w.ost.B).toBe('BRAK [] nagr[n1+pole,n2+pole]');
  });

  it('CZ3 B „czeka”, poprawia n1, potem dopisuje wizytę → wszędzie karta [n1=poprawka B, n2]; poprawka uratowana z chwilą zapisu + 1 ms + h, rev 2', async () => {
    const x = await czekaDelty();
    const { A, B } = x.urz;
    const kiedy = await popraw(B, x);
    await wizyta(B, x);
    const w = await rundy(x, ['B', 'A'], 3);
    expect(w.zbiezne && w.stabilne, JSON.stringify(w.ost)).toBe(true);
    expect(w.ost.A).toBe('karta [n1=poprawka B,n2] nagr[]');
    const [, u, r] = (await meta(A, x)).find((s) => s.startsWith('n1:')).match(/^n1:(.+):r(\d+)$/);
    const d = Date.parse(u) - Date.parse(kiedy);
    expect([r, d >= 1 && d <= 1000], 'R′ + 1 ms + h, rev bez zmian').toEqual(['2', true]);
    expect(await meta(B, x)).toEqual(await meta(A, x));
  });

  // Znane ograniczenie (opisane): delta zapisu niesie samą notatkę (jedno zdarzenie = jedna encja), więc urządzenie
  // bez karty, które dostanie ją przed pełnym ładunkiem, przyjmuje poprawkę jako sierotę (Y > R + 1 s) i zdejmuje swój
  // nagrobek; pierwszy pełny ładunek z przesuniętym nagrobkiem kasuje ją (zapis od razu woła pełną wysyłkę).
  it('CZ5 [znane ograniczenie] delta poprawki z B dochodzi do A (bez karty) przed pełnym ładunkiem → sierota na A do pełnego ładunku B', async () => {
    const x = await czekaDelty();
    const { A, B } = x.urz;
    nagrywaj(B);
    await popraw(B, x);
    expect(await dostarcz(B, A)).toEqual(['notatka']);
    expect(await stan(A, x), 'przejściowo').toBe('SIEROTY [n1=poprawka B] nagr[n2+pole]');
    await pelny(B, A);
    expect(await stan(A, x)).toBe('BRAK [] nagr[n1+pole,n2+pole]');
  });

  // Stare O (emulacja) dostaje przesunięty nagrobek bez pola i kasuje poprawkę (notatek i tak już nie miało — przyjęło
  // usunięcie); jego echo (ta sama chwila, bez pola) nie odbiera pola (D21-7), a gdy karta B okaże się późniejsza —
  // poprawka wraca wszędzie, także na O (u′ > R′).
  it('CZ6 stare O między A i B: przesunięty nagrobek bez pola wraca echem, B dopisuje wizytę → poprawka uratowana na A, B i O', async () => {
    const x = await czekaDelty({ A: {}, B: {}, O: { stara: true } });
    const { A, B, O } = x.urz;
    await pelny(A, O);
    await popraw(B, x);
    const kiedy = (await nagrobkiNotatek(B)).find((q) => q.id === x.id('n1')).deletedAtISO;
    await pelny(B, O);
    expect(await stan(O, x)).toBe('BRAK [] nagr[n1,n2]');
    expect((await nagrobkiNotatek(O)).find((q) => q.id === x.id('n1')), 'echo: ta sama chwila, bez pola').toEqual({ id: x.id('n1'), deletedAtISO: kiedy, rev: 2 });
    await wizyta(B, x);
    await pelny(O, B);
    expect(await stan(B, x), 'echo nie odbiera pola: ratunek poprawki').toBe('karta [n1=poprawka B,n2] nagr[]');
    const w = await rundy(x, ['B', 'O', 'A'], 3, ['A', 'B', 'O']);
    expect(w.zbiezne && w.stabilne, JSON.stringify(w.ost)).toBe(true);
    expect(w.ost.O).toBe('karta [n1=poprawka B,n2] nagr[]');
  });

  // Druga karta przeglądarki zapisuje n1 między decyzją CZEKA a zapisem kanonu nagrobka w pierwszej (Ad przed tym
  // zapisem nie widziało jeszcze nagrobka, więc nie miało czego przesunąć). Pętla CZEKA zapisuje kanon z chwilą tego
  // zapisu, jak Bnp_poZapisie — inaczej poprawka zostałaby obok nagrobku R i stała się sierotą po usunięciu karty.
  it('CZ7 [CZERWONY na 8c70884d] druga karta zapisuje n1 między decyzją CZEKA a zapisem kanonu → nagrobek z chwilą zapisu; po delcie nagrobka karty bez sierot', async () => {
    const locks = atrapaLocks();
    const x = await przygotuj({ A: {}, B: { locks } });
    const { A, B } = x.urz;
    nagrywaj(A);
    przesun(60e3); await A.v.removePatient(x.pid);
    const druga = okno({ locks }).VildaVault;
    druga.setStorageAdapter(B.baza);
    await druga.unlockUser(B.uid, B.haslo);
    const ladunek = { ...kopia(await A.v.exportSyncPayload()), patients: [], tombstones: [] };
    const p = B.pulapka('getPatientForUser', (_u, pid) => pid === x.pid && (B.licz.listPatientNoteTombstonesForUser || 0) > 0);
    B.zeruj();
    przesun(5e3);
    const scal = B.scal(ladunek);
    await p.osiagnieta; // decyzja: karta jest, nie późniejsza → CZEKA
    const kiedy = przesun(30e3);
    await druga.savePatientNote({ id: x.id('n1'), patientId: x.pid, title: 'n1', body: 'poprawka B' });
    p.zwolnij(); await scal;
    expect(await stan(B, x)).toBe('karta [n1=poprawka B,n2] nagr[n1+pole,n2+pole]');
    expect((await nagrobekNotatki(B, x, 'n1')).deletedAtISO, 'kanon z chwilą zapisu').toBe(kiedy);
    await dostarcz(A, B, (t) => t === 'nagrPac');
    expect(await stan(B, x)).toBe('BRAK [] nagr[n1+pole,n2+pole]');
  });

  // Druga karta scala nagrobki R2 z późniejszego „Usuń pacjenta” na D (karta B dalej nie późniejsza → CZEKA, kanon R2)
  // między decyzją CZEKA a zapisem kanonu w pierwszej karcie. Pętla CZEKA czyta świeży nagrobek zawsze (także przy
  // istniejącej notatce), więc nie cofa R2 do R z A; potem dochodzi sama delta nagrobka karty z D.
  it('CZ8 druga karta zapisuje nowsze nagrobki R2 (CZEKA) między decyzją CZEKA a zapisem kanonu → R2 zostaje; delta nagrobka karty D → bez sierot', async () => {
    const locks = atrapaLocks();
    const x = await przygotuj({ A: {}, B: { locks }, D: {} });
    const { A, B, D } = x.urz;
    przesun(60e3); await A.v.removePatient(x.pid);
    przesun(60e3); await D.v.removePatient(x.pid);
    const eD = (await nagrobekKarty(D, x.pid)).deletedAtISO;
    const tylko = async (d) => ({ ...kopia(await d.v.exportSyncPayload()), patients: [], tombstones: [] });
    const zA = await tylko(A), zD = await tylko(D);
    const druga = okno({ locks }).VildaVault;
    druga.setStorageAdapter(B.baza);
    await druga.unlockUser(B.uid, B.haslo);
    const p = B.pulapka('getPatientForUser', (_u, pid) => pid === x.pid && (B.licz.listPatientNoteTombstonesForUser || 0) > 0);
    B.zeruj();
    przesun(5e3);
    const scal = B.scal(zA);
    await p.osiagnieta;
    przesun(1000); await druga.mergeSyncPayload(kopia(zD));
    p.zwolnij(); await scal;
    expect(await stan(B, x)).toBe('karta [n1,n2] nagr[n1+pole,n2+pole]');
    expect((await nagrobkiNotatek(B)).map((t) => t.deletedAtISO).sort(), 'R2 nie cofnięte').toEqual((await nagrobkiNotatek(D)).map((t) => t.deletedAtISO).sort());
    const zd = await D.v.buildTombstoneDelta(x.pid, eD);
    przesun(1000); await B.scal(kopia(await D.v.decryptPayloadForCurrentUser(zd.iv, zd.data)));
    expect(await stan(B, x)).toBe('BRAK [] nagr[n1+pole,n2+pole]');
  });

  // Granice Bnp_poZapisie (mutacje przeglądu 2): remis lastSavedAtISO === e to dalej CZEKA (ta sama ostra nierówność co
  // Bnp_stan); karta już późniejsza przed scaleniem i zapis późniejszy niż R — nagrobek zdjęty jak dotąd, bez
  // dotknięcia; błąd odczytu nagrobka nie wstrzymuje zdjęcia; G13 — chwila nagrobka nie cofa się (max), bo echo starego
  // urządzenia o chwili R odebrałoby wtedy pole.
  it('CZ1r remis: karta B zapisana w tej samej milisekundzie co „Usuń pacjenta” (CZEKA); poprawka n1 → nagrobek z chwilą zapisu; delta nagrobka karty → bez sierot', async () => {
    const x = await przygotuj({ A: {}, B: {} });
    const { A, B } = x.urz;
    nagrywaj(A);
    const t0 = przesun(60e3);
    await A.v.removePatient(x.pid);
    await B.v.savePatient(jan(130, 26), { dedup: false, patientId: x.pid });
    expect((await B.v.listPatients()).find((q) => q.patientId === x.pid).lastSavedAtISO).toBe(t0);
    await dostarcz(A, B, (t) => t === 'nagrNot');
    expect(await stan(B, x)).toBe('karta [n1,n2] nagr[n1+pole,n2+pole]');
    const kiedy = await popraw(B, x);
    expect((await nagrobekNotatki(B, x, 'n1')).deletedAtISO).toBe(kiedy);
    await dostarcz(A, B, (t) => t === 'nagrPac');
    expect(await stan(B, x)).toBe('BRAK [] nagr[n1+pole,n2+pole]');
  });

  it('CZ3b [kontrola] B „czeka”, dopisuje wizytę (karta późniejsza, przed scaleniem), potem poprawia n1 → nagrobek n1 zdjęty jak dotąd; wszędzie poprawka z chwilą zapisu', async () => {
    const x = await czekaDelty();
    const { A, B } = x.urz;
    await wizyta(B, x);
    const kiedy = await popraw(B, x);
    expect(await stan(B, x)).toBe('karta [n1=poprawka B,n2] nagr[n2+pole]');
    const w = await rundy(x, ['B', 'A'], 3);
    expect(w.zbiezne && w.stabilne, JSON.stringify(w.ost)).toBe(true);
    expect(w.ost.A).toBe('karta [n1=poprawka B,n2] nagr[]');
    expect((await meta(A, x)).find((q) => q.startsWith('n1:')), 'bez dotknięcia').toBe(`n1:${kiedy}:r2`);
  });

  it('CZ3c błąd odczytu nagrobka przy zapisie (karta późniejsza) → nagrobek zdjęty jak dotąd', async () => {
    const x = await czekaDelty();
    const { B } = x.urz;
    await wizyta(B, x);
    const oryg = B.baza.getPatientNoteTombstoneForUser;
    B.baza.getPatientNoteTombstoneForUser = async () => { throw new Error('awaria odczytu (test)'); };
    try { await popraw(B, x); } finally { B.baza.getPatientNoteTombstoneForUser = oryg; }
    expect(await stan(B, x)).toBe('karta [n1=poprawka B,n2] nagr[n2+pole]');
  });

  it('CZ9 G13: n1 z updatedAtISO 1 h w przyszłości (R = u); B „czeka” i poprawia n1 → nagrobek zostaje na R; echo starego O i wizyta B → poprawka uratowana', async () => {
    const x = await przygotuj({ A: {}, B: {}, O: { stara: true } });
    const { A, B, O } = x.urz;
    vi.setSystemTime(zegar + 3600e3);
    await A.v.savePatientNote({ id: x.id('n1'), patientId: x.pid, title: 'n1', body: 'z przyszłości' });
    vi.setSystemTime(zegar);
    await rundy(x, ['A', 'B', 'O'], 1);
    nagrywaj(A, { nagrPac: true });
    przesun(60e3); await A.v.removePatient(x.pid);
    const R = (await nagrobekNotatki(A, x, 'n1')).deletedAtISO;
    await dostarcz(A, B);
    expect(await stan(B, x)).toBe('karta [n1=z przyszłości,n2] nagr[n1+pole,n2+pole]');
    await pelny(A, O);
    const kiedy = await popraw(B, x);
    expect(kiedy < R, 'zapis wcześniejszy niż R').toBe(true);
    expect((await nagrobekNotatki(B, x, 'n1')).deletedAtISO, 'max(R, chwila zapisu)').toBe(R);
    await wizyta(B, x);
    await pelny(O, B);
    expect(await stan(B, x)).toBe('karta [n1=poprawka B,n2] nagr[]');
  });

  // Druga karta przeglądarki robi „Scal pacjentów” X→Y między decyzją CZEKA a zapisem kanonu: notatka jest już pod Y,
  // więc pętla CZEKA nie bierze jej chwili (kanon R zostaje i przegra z wersją pod Y); z chwilą zapisu kanon z polem X
  // skasowałby przepięte notatki przy następnym scaleniu.
  it('CZ7b druga karta scala X→Y między decyzją CZEKA a zapisem kanonu → po delcie nagrobka karty X i kolejnym scaleniu notatki pod Y zostają', async () => {
    const locks = atrapaLocks();
    const x = await przygotuj({ A: {}, B: { locks } });
    const { A, B } = x.urz;
    przesun(60e3);
    const y = await A.v.savePatient({ name: 'Testowa Ewa', user: { lastName: 'Testowa', firstName: 'Ewa', dobISO: '2015-05-05', sex: 'K', height: 120, weight: 22 } }, { dedup: false });
    await x.c.sync(A); await x.c.sync(B);
    nagrywaj(A);
    przesun(60e3); await A.v.removePatient(x.pid);
    const druga = okno({ locks }).VildaVault;
    druga.setStorageAdapter(B.baza);
    await druga.unlockUser(B.uid, B.haslo);
    const ladunek = { ...kopia(await A.v.exportSyncPayload()), patients: [], tombstones: [] };
    const p = B.pulapka('getPatientForUser', (_u, pid) => pid === x.pid && (B.licz.listPatientNoteTombstonesForUser || 0) > 0);
    B.zeruj();
    przesun(5e3);
    const scal = B.scal(ladunek);
    await p.osiagnieta;
    przesun(30e3);
    expect((await druga.mergePatients(x.pid, y.patientId)).notesMoved).toBe(2);
    p.zwolnij(); await scal;
    await dostarcz(A, B, (t) => t === 'nagrPac');
    przesun(1000); await B.scal(ladunek);
    expect((await B.v.listAllPatientNotes()).filter((n) => n.patientId === y.patientId).map((n) => x.nn[n.id]).sort()).toEqual(['n1', 'n2']);
  });

  // Kontrole poprawki: „Scal pacjentów” X→Y na B w stanie CZEKA przepina notatki (zapis pod innym pacjentem zdejmuje
  // nagrobek jak dotąd), a poprawka nieświadomego D (bez nagrobka) zostaje (E1/T12 w innej kolejności).
  it('SP1 [kontrola] A usuwa X; B „czeka” (delty) i scala X→Y; delty i pełne ładunki → notatki X pod Y wszędzie, bez sierot', async () => {
    const x = await przygotuj({ A: {}, B: {} });
    const { A, B } = x.urz;
    przesun(60e3);
    const y = await A.v.savePatient({ name: 'Testowa Ewa', user: { lastName: 'Testowa', firstName: 'Ewa', dobISO: '2015-05-05', sex: 'K', height: 120, weight: 22 } }, { dedup: false });
    await x.c.sync(A); await x.c.sync(B);
    nagrywaj(A, { nagrPac: true }); nagrywaj(B);
    przesun(60e3); await A.v.removePatient(x.pid);
    await dostarcz(A, B);
    expect(await stan(B, x)).toBe('karta [n1,n2] nagr[n1+pole,n2+pole]');
    przesun(60e3); const scal = await B.v.mergePatients(x.pid, y.patientId);
    expect(scal.notesMoved).toBe(2);
    await dostarcz(B, A);
    const w = await rundy(x, ['A', 'B'], 3);
    expect(w.zbiezne && w.stabilne, JSON.stringify(w.ost)).toBe(true);
    expect(w.ost.A).toBe('BRAK [] nagr[]');
    for (const k of ['A', 'B']) expect((await x.urz[k].v.listAllPatientNotes()).filter((n) => n.patientId === y.patientId).map((n) => x.nn[n.id]).sort(), k).toEqual(['n1', 'n2']);
  });

  it('EL1 [kontrola] A usuwa; nieświadome D poprawia n1 i pobiera usunięcie; B dopisuje wizytę i pobiera → wszędzie karta [n1=poprawka D, n2]', async () => {
    const x = await przygotuj({ A: {}, B: {}, D: {} });
    const { A, B, D } = x.urz;
    przesun(60e3); await A.v.removePatient(x.pid);
    await x.c.sync(A);
    await popraw(D, x, 'n1', 'poprawka D');
    await x.c.sync(D);
    expect(await stan(D, x)).toBe('SIEROTY [n1=poprawka D] nagr[n2+pole]');
    await wizyta(B, x);
    await x.c.sync(B);
    const w = await rundy(x, ['A', 'B', 'D'], 3);
    expect(w.zbiezne && w.stabilne, JSON.stringify(w.ost)).toBe(true);
    expect(w.ost.A).toBe('karta [n1=poprawka D,n2] nagr[]');
  });
});

describe('P-NOTATKI-ZA-KARTA — przegląd 2: flota mieszana, drugie usunięcie (poprawność zgł. 2, flota Z2 i Z3; stare = emulacja 346dd81a)', () => {
  // Znane ograniczenie (poprawność zgł. 2, flota Z2; opisane, nota wydania D21-8, otwarta kwestia dla właściciela):
  // urządzenie z kartą, która wróciła bez notatek, a które nie odnawia nagrobków z polem (stara aplikacja, albo nowa
  // z nagrobkami zapisanymi przez starą bez pola), usuwa pacjenta ponownie. Nowe A i B mają uratowane notatki bez
  // nagrobków (ratunek je zdjął), a nagrobek karty e2 niczego z notatkami nie robi → sieroty wszędzie, trwale. Na
  // db0c2d50 notatek po pierwszym usunięciu nie było. Kontrola: nowe D odnawia nagrobki (Bnp_odnow) → bez sierot.
  for (const [opis, opD, cel] of [
    ['[znane ograniczenie] stare D', { stara: true }, 'SIEROTY [n1,n2] nagr[]'],
    ['[kontrola] nowe D', {}, 'BRAK [] nagr[n1+pole,n2+pole]'],
  ]) {
    it(`OD2 ${opis}: A usuwa, D przyjmuje; B dopisuje wizytę i ratuje; do D dochodzi sama delta karty B; D usuwa ponownie → ${cel} wszędzie`, async () => {
      const x = await przygotuj({ A: {}, B: {}, D: opD });
      const { A, B, D } = x.urz;
      nagrywaj(A); nagrywaj(B); nagrywaj(D);
      przesun(60e3); await A.v.removePatient(x.pid);
      const zapA = [...A.delty];
      await dostarcz(A, D);
      A.delty = zapA;
      await wizyta(B, x);
      await dostarcz(A, B);
      expect(await stan(B, x)).toBe('karta [n1,n2] nagr[]');
      const zapB = [...B.delty];
      await dostarcz(B, A);
      B.delty = zapB;
      await dostarcz(B, D, (t) => t === 'karta');
      B.delty = [];
      expect((await stan(D, x)).replace(/\+pole/g, ''), 'karta wróciła na D bez notatek').toBe('karta [] nagr[n1,n2]');
      przesun(60e3); await D.v.removePatient(x.pid);
      await dostarcz(D, B); await dostarcz(D, A);
      const w = await rundy(x, ['A', 'B', 'D'], 4);
      expect(w.stabilne, JSON.stringify(w.ost)).toBe(true);
      for (const k of ['A', 'B']) expect(w.ost[k], k).toBe(cel);
      expect(w.ost.D.replace(/\+pole/g, '')).toBe(cel.replace(/\+pole/g, ''));
    });
  }

  it('OD2c [znane ograniczenie] chmura: B „czeka” (delta nagrobka karty zginęła), stare S z wizytą przyjmuje usunięcie (karta bez notatek), B ratuje, A pobiera; S usuwa ponownie → sieroty wszędzie', async () => {
    const x = await przygotuj({ A: {}, B: {}, S: { stara: true } });
    const { A, B, S } = x.urz;
    przesun(60e3); await A.v.removePatient(x.pid);
    await x.c.sync(A);
    przesun(1000); await B.scal({ ...kopia(await A.v.exportSyncPayload()), patients: [], tombstones: [] });
    await wizyta(S, x); await x.c.sync(S);
    expect(await stan(S, x)).toBe('karta [] nagr[n1,n2]');
    await wizyta(B, x); await x.c.sync(B);
    await x.c.sync(A);
    expect(await stan(A, x)).toBe('karta [n1,n2] nagr[]');
    przesun(60e3); await S.v.removePatient(x.pid);
    const w = await rundy(x, ['S', 'A', 'B'], 3);
    expect(w.zbiezne && w.stabilne, JSON.stringify(w.ost)).toBe(true);
    expect(w.ost.A).toBe('SIEROTY [n1,n2] nagr[]');
  });

  // Ten sam mechanizm przy samych nowych urządzeniach w chwili drugiego usunięcia: S dostało pierwsze usunięcie przez
  // stary przekaźnik O (nagrobki bez pola), więc Bnp_odnow nie ma czego odnowić.
  it('OD2o [znane ograniczenie] nowe S dostaje usunięcie przez stary przekaźnik O (karta S późniejsza, notatki skasowane), B ratuje; S usuwa ponownie → sieroty na A, B i S', async () => {
    const x = await przygotuj({ A: {}, B: {}, S: {}, O: { stara: true } });
    const { A, B, S, O } = x.urz;
    przesun(60e3); await A.v.removePatient(x.pid);
    await wizyta(B, x); await wizyta(S, x);
    await pelny(A, O); await pelny(O, S);
    expect(await stan(S, x)).toBe('karta [] nagr[n1,n2]');
    await pelny(A, B); await pelny(B, A);
    przesun(60e3); await S.v.removePatient(x.pid);
    for (let r = 0; r < 3; r += 1) for (const [z, na] of [[S, A], [S, B], [A, B], [B, A], [A, S], [B, S]]) await pelny(z, na);
    for (const k of ['A', 'B', 'S']) expect(await stan(x.urz[k], x), k).toBe('SIEROTY [n1,n2] nagr[]');
  });

  // Znane ograniczenie (flota Z3; opisane, nota wydania D21-8): A usuwa (e1), B ratuje; nieświadome D poprawia n2;
  // B usuwa ponownie (e2 > u_D: nagrobki późniejsze niż poprawka D); stare C dopisuje wizytę po e2 (karta wraca),
  // ucina pole i przekazuje nagrobki do D → poprawka D ginie. Na db0c2d50 zostaje karta [n2=poprawka D] (B nie miało
  // notatek, więc drugie usunięcie ich nie nagrobkowało). Kontrola: nowe C ratuje → karta [n1, n2=poprawka D].
  for (const [opis, opC, cel] of [
    ['[znane ograniczenie] stare C', { stara: true }, 'karta [] nagr[n1+pole,n2+pole]'],
    ['[kontrola] nowe C', {}, 'karta [n1,n2=poprawka D] nagr[]'],
  ]) {
    it(`HD ${opis}: poprawka nieświadomego D między dwoma usunięciami, karta wraca wizytą na C po drugim → D: ${cel}`, async () => {
      const x = await przygotuj({ A: {}, B: {}, C: opC, D: {} });
      const { A, B, C, D } = x.urz;
      przesun(60e3); await A.v.removePatient(x.pid);
      await wizyta(B, x); await pelny(A, B);
      przesun(60e3); await D.v.savePatientNote({ id: x.id('n2'), patientId: x.pid, title: 'n2', body: 'poprawka D' });
      przesun(60e3); await B.v.removePatient(x.pid);
      await wizyta(C, x);
      await pelny(B, C); await pelny(C, D);
      for (let r = 0; r < 3; r += 1) for (const [z, na] of [[C, A], [A, B], [B, D], [D, A], [A, C], [D, C]]) await pelny(z, na);
      expect(await stan(D, x)).toBe(cel);
    });
  }
});

describe('P-NOTATKI-ZA-KARTA — przegląd 2: chwila rekordu nagrobka z polem (flota Z4)', () => {
  // [CZERWONY na 8c70884d] Pole było ważne przy dowolnym napisie jako chwili nagrobka (R). Przy R nieparsowalnym ratunek
  // rzucał RangeError (CZEKA na zawsze, a stare urządzenia kasowały notatkę), a przy R poprawnym, ale nie w postaci
  // toISOString (strefa, bez milisekund) albo bez zapasu na R + 1 s w roku czterocyfrowym, u′ ≤ R jako napis — ratunek
  // w każdym scaleniu bez końca (2 zapisy notatek i 2 zdarzenia „merge” na rundę). Teraz pole nieważne = usunięcie, jak
  // na db0c2d50; kolejne scalania bez zapisów notatek.
  const PRZYPADKI = {
    'z dopiskiem („…Zx”)': (D) => D + 'x',
    'bez sekund i strefy': (D) => D.slice(0, 16),
    '9999-12-31T23:59:59.999Z (przepełnienie R + 1 ms + h)': () => '9999-12-31T23:59:59.999Z',
    'z przesunięciem strefy (+02:00, ta sama chwila)': (D) => new Date(Date.parse(D) + 2 * 3600e3).toISOString().replace('Z', '+02:00'),
    'bez milisekund': (D) => D.replace(/\.\d{3}Z$/, 'Z'),
  };
  for (const [opis, f] of Object.entries(PRZYPADKI)) {
    it(`T26c chwila nagrobka ${opis} przy ważnym polu i karcie B późniejszej niż e → notatki skasowane, bez zapisów w kolejnych scaleniach`, async () => {
      const x = await przygotuj({ A: {}, B: {} });
      const { A, B } = x.urz;
      przesun(60e3); await A.v.removePatient(x.pid);
      await wizyta(B, x);
      const p = kopia(await A.v.exportSyncPayload());
      const e = p.tombstones.find((t) => t.patientId === x.pid).deletedAtISO;
      p.patientNoteTombstones.forEach((t) => { t.deletedAtISO = f(t.deletedAtISO); t.deletedWithPatient = { patientId: x.pid, deletedAtISO: e }; });
      const ladunek = { ...p, patients: [], tombstones: [] };
      przesun(1000); await B.scal(ladunek);
      for (let r = 0; r < 2; r += 1) {
        B.zeruj(); const z0 = B.zdarzenia.length;
        przesun(1000); await B.scal(ladunek);
        expect([B.licz.putPatientNoteForUser || 0, B.zdarzenia.length - z0], `runda ${r + 2}: zapisy notatek i zdarzenia`).toEqual([0, 0]);
      }
      expect(await stan(B, x)).toMatch(/^karta \[\] /);
    });
  }
  it('T26c [kontrola] chwila nagrobka 9999-12-31T23:59:57.999Z (z zapasem) przy ważnym polu → pole ważne', async () => {
    const x = await przygotuj({ A: {} });
    const A = x.urz.A;
    const pusty = { schemaVersion: 2, patients: [], tombstones: [], notes: [], noteTombstones: [], patientNotes: [] };
    const t = { id: 'graniczny-1', deletedAtISO: '9999-12-31T23:59:57.999Z', rev: 1, deletedWithPatient: { patientId: 'inny-pacjent', deletedAtISO: '2026-10-21T09:00:00.000Z' } };
    await A.scal({ ...pusty, patientNoteTombstones: [t] });
    expect((await nagrobkiNotatek(A)).find((q) => q.id === t.id)).toEqual(t);
  });
});


describe('P-NOTATKI-ZA-KARTA — przegląd 2: luki testów (L9–L16; przegląd testów 2, Z1–Z8)', () => {
  // Każdy przypadek łapie mutację, która przechodziła cały plik na 8c70884d (L14 i L15 przypinają zdania dokumentacji).
  // Na db0c2d50 czerwone z powodu zachowania (scenariusze wymagają ratunku).
  const tylkoNotatki = async (d) => ({ ...kopia(await d.v.exportSyncPayload()), patients: [], tombstones: [] });
  const czekaj = async (n = 60) => { for (let i = 0; i < n; i += 1) await new Promise((r) => { setTimeout(r, 0); }); };
  // L9 (przegląd testów 2, Z1; mutacja stan-M-ostre: >= na >).
  // krok 4 „M ≥ Y → usuń” przy remisie M = Y (dokumentacja: „remis dalej na korzyść usunięcia”). Remis powstaje
  // przy G13: B ręcznie kasuje notatkę z updatedAtISO u z przyszłości (nagrobek max(teraz, u) = u), a A usuwa pacjenta
  // później niż u (R > u). Kopia B bez pola o chwili u < R to ręczne usunięcie (M = u), C ma wersję u (Y = u).
  it('L9 G13: B ręcznie usuwa n1 z chwilą z przyszłości (M = Y), potem A usuwa pacjenta, B dopisuje wizytę, C ma n1 → n1 nie wraca', async () => {
    const x = await przygotuj({ A: {}, B: {}, C: {} });
    const { A, B, C } = x.urz;
    vi.setSystemTime(zegar + 120e3);
    await A.v.savePatientNote({ id: x.id('n1'), patientId: x.pid, title: 'n1', body: 'z przyszłości' });
    vi.setSystemTime(zegar);
    await rundy(x, ['A', 'B', 'C'], 1);
    const u = (await C.v.listAllPatientNotes()).find((n) => n.id === x.id('n1')).updatedAtISO;
    przesun(1000); await B.v.removePatientNote(x.id('n1'));
    expect((await nagrobkiNotatek(B)).find((t) => t.id === x.id('n1')).deletedAtISO, 'ręczny nagrobek = u (G13)').toBe(u);
    przesun(180e3); await A.v.removePatient(x.pid);
    const R = (await nagrobkiNotatek(A)).find((t) => t.id === x.id('n1')).deletedAtISO;
    expect(R > u, 'R > u').toBe(true);
    await wizyta(B, x);
    const w = await rundy(x, ['B', 'A', 'C'], 4);
    expect(w.zbiezne && w.stabilne, JSON.stringify(w.ost)).toBe(true);
    expect(w.ost.A).toBe('karta [n2] nagr[n1+pole+r]');
  });

  // L10 (przegląd testów 2, Z2; mutacja odnow-bez-Eb).
  // Bnp_odnow, gałąź „notatka, która w międzyczasie wróciła pod tego pacjenta, idzie przez Eb” (tytuł testu
  // „odnowienie nie rusza …” ją obiecuje, a test jej nie wykonuje). Druga karta przeglądarki scala ładunek B
  // z uratowanymi notatkami: decyzja (karta jest → „notatka”) zapada przed „Usuń pacjenta” w pierwszej karcie, zapis
  // notatek — po liście notatek w Bpu_usun, a przed odnowieniem.
  it('L10 ponowne „Usuń pacjenta”, gdy druga karta przeglądarki wpisuje uratowane notatki między listą notatek a odnowieniem → bez sierot', async () => {
    const locks = atrapaLocks();
    const x = await przygotuj({ A: { locks }, B: {} });
    const { A, B } = x.urz;
    przesun(60e3); await A.v.removePatient(x.pid);
    await wizyta(B, x);
    await pelny(A, B);
    expect(await stan(B, x)).toBe('karta [n1,n2] nagr[]');
    const pB = kopia(await B.v.exportSyncPayload());
    przesun(1000); await A.scal({ ...pB, patientNotes: [] });
    expect(await stan(A, x), 'karta wróciła na A bez notatek').toBe('karta [] nagr[n1+pole,n2+pole]');
    // druga karta przeglądarki na tym samym magazynie A, z własnymi pułapkami
    const o2 = owin(A.baza);
    const druga = okno({ locks }).VildaVault;
    druga.setStorageAdapter(o2.owiniety);
    await druga.unlockUser(A.uid, A.haslo);
    const p2 = o2.pulapka('getPatientForUser', (_u, pid) => pid === x.pid && (o2.licz.listPatientNoteTombstonesForUser || 0) > 0);
    przesun(1000);
    const scal2 = druga.mergeSyncPayload(kopia(pB));
    await p2.osiagnieta; // decyzja w drugiej karcie: karta jest
    const p1 = A.pulapka('listPatientNotesForUser', () => true);
    przesun(1000);
    const usun = A.v.removePatient(x.pid);
    await p1.osiagnieta; // Bpu_usun: karta skasowana, lista notatek pusta
    p2.zwolnij(); await scal2; // druga karta wpisuje n1, n2 i zdejmuje ich nagrobki
    expect((await A.baza.listPatientNotesForUser(A.uid)).length, 'notatki wpisane w drugiej karcie').toBe(2);
    p1.zwolnij(); await usun;
    expect(await stan(A, x)).toBe('BRAK [] nagr[n1+pole,n2+pole]');
  });

  // L11 (przegląd testów 2, Z3).
  // Bnp_odnow: chwila odnowionego nagrobka to max(teraz, R + 1 s + 1 ms). Część „teraz” chroni edycję uratowanej
  // notatki zrobioną po ratunku, a przed ponownym usunięciem (późniejsze usunięcie wygrywa, jak T24).
  it('L11 B edytuje uratowaną n1 (po paśmie ratunku), karta wraca na A bez notatek, A usuwa ponownie → wszystko znika, bez sierot', async () => {
    const x = await przygotuj({ A: {}, B: {} });
    const { A, B } = x.urz;
    nagrywaj(B);
    przesun(60e3); await A.v.removePatient(x.pid);
    await wizyta(B, x);
    await pelny(A, B);
    expect(await stan(B, x)).toBe('karta [n1,n2] nagr[]');
    przesun(30e3); await B.v.savePatientNote({ id: x.id('n1'), patientId: x.pid, title: 'n1', body: 'edycja B po ratunku' });
    await dostarcz(B, A, (t) => t === 'karta');
    expect(await stan(A, x)).toBe('karta [] nagr[n1+pole,n2+pole]');
    przesun(60e3); await A.v.removePatient(x.pid);
    const w = await rundy(x, ['A', 'B'], 4);
    expect(w.zbiezne && w.stabilne, JSON.stringify(w.ost)).toBe(true);
    expect(w.ost.B).toBe('BRAK [] nagr[n1+pole,n2+pole]');
  });

  // L12 (przegląd testów 2, Z4; mutacja ratuj-bez-blokady-notatki).
  // ratunek pod blokadą notatki (2.4: „w środku pod Ac(id)”). Zapis notatki w drugiej karcie przeglądarki
  // w trakcie ratunku (po świeżym odczycie notatki w Bnp_ratuj) nie może zostać nadpisany starą treścią z dotknięciem.
  it('L12 zapis n1 w drugiej karcie w trakcie ratunku (po świeżym odczycie) → edycja zostaje', async () => {
    const locks = atrapaLocks();
    const x = await przygotuj({ A: {}, B: { locks } });
    const { A, B } = x.urz;
    przesun(60e3); await A.v.removePatient(x.pid);
    await wizyta(B, x);
    const druga = okno({ locks }).VildaVault;
    druga.setStorageAdapter(B.baza);
    await druga.unlockUser(B.uid, B.haslo);
    const ladunek = await tylkoNotatki(A);
    const id1 = x.id('n1');
    // odczyt notatki w Bnp_ratuj: po odczycie jej nagrobka (Bnp_nagrobek) w sekcji ratunku
    const p = B.pulapka('getPatientNoteForUser', (_u, id) => id === id1 && (B.licz.getPatientNoteTombstoneForUser || 0) > 0);
    B.zeruj();
    przesun(5e3);
    const scal = B.scal(ladunek);
    await p.osiagnieta;
    const tEdycji = przesun(30e3);
    const zapis = druga.savePatientNote({ id: id1, patientId: x.pid, title: 'n1', body: 'edycja w drugiej karcie' });
    await czekaj();
    p.zwolnij();
    await scal; await zapis;
    const po = (await B.v.listAllPatientNotes()).find((n) => n.id === id1);
    expect([po.body, po.updatedAtISO], 'edycja nie nadpisana ratunkiem').toEqual(['edycja w drugiej karcie', tEdycji]);
  });

  // L13 (przegląd testów 2, Z5; mutacja ratuj-bez-warunku-nowszego-nagrobka, ratuj-bez-obu-strazy).
  // ratunek nie zdejmuje nowszego nagrobka (2.4: „Nowszy, z równoległego usunięcia, zostaje”; T28 tego nie
  // rozróżnia, bo tam notatki już nie ma). Druga karta przeglądarki scala nagrobki z późniejszego „Usuń pacjenta” na D
  // (karta B jeszcze jest → CZEKA, nagrobki R2 obok notatek) między decyzją a ratunkiem w pierwszej karcie. Potem
  // dochodzi sama delta nagrobka karty z D.
  it('L13 nowszy nagrobek (R2, CZEKA) zapisany w drugiej karcie między decyzją a ratunkiem zostaje; delta nagrobka karty D → bez sierot', async () => {
    const locks = atrapaLocks();
    const x = await przygotuj({ A: {}, B: { locks }, D: {} });
    const { A, B, D } = x.urz;
    przesun(60e3); await A.v.removePatient(x.pid);
    await wizyta(B, x);
    przesun(60e3); await D.v.removePatient(x.pid);
    const eD = (await nagrobekKarty(D, x.pid)).deletedAtISO;
    const zA = await tylkoNotatki(A), zD = await tylkoNotatki(D);
    const druga = okno({ locks }).VildaVault;
    druga.setStorageAdapter(B.baza);
    await druga.unlockUser(B.uid, B.haslo);
    const p = B.pulapka('getPatientForUser', (_u, pid) => pid === x.pid && (B.licz.listPatientNoteTombstonesForUser || 0) > 0);
    B.zeruj();
    przesun(5e3);
    const scal = B.scal(zA);
    await p.osiagnieta;
    przesun(1000); await druga.mergeSyncPayload(kopia(zD));
    p.zwolnij(); await scal;
    expect(await stan(B, x), 'notatki czekają z nagrobkami R2').toBe('karta [n1,n2] nagr[n1+pole,n2+pole]');
    const R2 = (await nagrobkiNotatek(D)).map((t) => t.deletedAtISO).sort();
    expect((await nagrobkiNotatek(B)).map((t) => t.deletedAtISO).sort(), 'nagrobki R2 nie zdjęte').toEqual(R2);
    const zd = await D.v.buildTombstoneDelta(x.pid, eD);
    przesun(1000); await B.scal(kopia(await D.v.decryptPayloadForCurrentUser(zd.iv, zd.data)));
    expect(await stan(B, x)).toBe('BRAK [] nagr[n1+pole,n2+pole]');
  });

  // L14 (przegląd testów 2, Z6).
  // dokumentacja („Ograniczenia”, kolejność delt przy kroku „pasmo bez karty”): urządzenie bez karty, które dostanie
  // deltę uratowanej notatki przed deltą karty, kasuje ją; notatka wraca z następnym pełnym ładunkiem.
  it('L14 [dokumentacja] C bez karty dostaje delty ratunku z B przed deltą karty → kasuje; po delcie karty karta bez notatek; pełny ładunek B przywraca', async () => {
    const x = await przygotuj({ A: {}, B: {}, C: {} });
    const { A, B, C } = x.urz;
    przesun(60e3); await A.v.removePatient(x.pid);
    await pelny(A, C);
    expect(await stan(C, x)).toBe('BRAK [] nagr[n1+pole,n2+pole]');
    nagrywaj(B);
    await wizyta(B, x);
    await pelny(A, B);
    expect(await stan(B, x)).toBe('karta [n1,n2] nagr[]');
    await dostarcz(B, C, (t) => t === 'notatka');
    expect(await stan(C, x), 'delty ratunku przed kartą: skasowane').toBe('BRAK [] nagr[n1+pole,n2+pole]');
    await dostarcz(B, C, (t) => t === 'karta');
    expect(await stan(C, x), 'po delcie karty: karta bez notatek').toBe('karta [] nagr[n1+pole,n2+pole]');
    await pelny(B, C);
    expect(await stan(C, x)).toBe('karta [n1,n2] nagr[]');
  });

  // L15 (przegląd testów 2, Z7).
  // plan, w. 198 (zdanie poprawione w przeglądzie 2; dawniej „Pętli nie ma: odbiorca … niczego nie ratuje”). Odbiorca
  // uratowanej wersji ratuje jednak własną (zgł. 2b: E z rev 2 sprzed usunięcia) i wysyła zdarzenie „merge”; pętli nie ma,
  // bo B przyjmuje rev 2 zwykłą regułą i niczego nie dotyka.
  it('L15 [dokumentacja] odbiorca uratowanej wersji (E z rev 2, nagrobek z polem) sam ratuje i wysyła „merge”; B przyjmuje bez ratunku', async () => {
    const x = await przygotuj({ A: {}, B: {}, E: {} });
    const { A, B, E } = x.urz;
    przesun(30e3); await E.v.savePatientNote({ id: x.id('n1'), patientId: x.pid, title: 'n1', body: 'poprawka E' });
    przesun(60e3); await A.v.removePatient(x.pid);
    przesun(1000); await E.scal(await tylkoNotatki(A));
    await wizyta(B, x);
    await pelny(A, B);
    const przed = (await E.v.listAllPatientNotes()).find((n) => n.id === x.id('n1')).updatedAtISO;
    E.zdarzenia.length = 0;
    await pelny(B, E);
    const n1E = (await E.v.listAllPatientNotes()).find((n) => n.id === x.id('n1'));
    expect([n1E.rev, n1E.updatedAtISO !== przed], 'E dotknęło własną rev 2 (ratunek)').toEqual([2, true]);
    expect(E.zdarzenia.filter((z) => z.action === 'merge' && z.id === x.id('n1')).length, 'E wysyła merge').toBe(1);
    B.zdarzenia.length = 0;
    await pelny(E, B);
    const n1B = (await B.v.listAllPatientNotes()).find((n) => n.id === x.id('n1'));
    expect([n1B.rev, n1B.updatedAtISO]).toEqual([2, n1E.updatedAtISO]);
    expect(B.zdarzenia.filter((z) => z.action === 'merge' && z.id === x.id('n1')).length, 'B: jedno zdarzenie z pętli przyjmowania').toBe(1);
    await pelny(B, E);
    expect((await E.v.listAllPatientNotes()).find((n) => n.id === x.id('n1')).updatedAtISO, 'bez dalszych dotknięć').toBe(n1E.updatedAtISO);
  });

  // L16 (przegląd testów 2, Z8; mutacja stan-karta-ge-decyzja).
  // remis karty z e w podglądzie „Scal kopię konta” (decyzja z ostrą nierównością także w podglądzie).
  it('L16 B zmienia kartę w tej samej milisekundzie co „Usuń pacjenta” na A, B scala kopię A → podgląd = wynik = magazyn (0 zmian)', async () => {
    const x = await przygotuj({ A: {}, B: {} });
    const { A, B } = x.urz;
    const t0 = przesun(60e3);
    await A.v.removePatient(x.pid);
    await B.v.savePatient(jan(130, 26), { dedup: false, patientId: x.pid });
    expect((await B.v.listPatients()).find((p) => p.patientId === x.pid).lastSavedAtISO).toBe(t0);
    przesun(60e3);
    const plik = await A.v.exportVaultBackup();
    const podglad = await B.v.previewVaultBackupMerge(plik, A.haslo);
    const wynik = await B.v.mergeVaultBackup(plik, A.haslo);
    expect([podglad.updatedPatientNoteCount, podglad.deletedPatientNoteCount], 'podgląd').toEqual([wynik.updatedPatientNoteCount, wynik.deletedPatientNoteCount]);
    expect(await stan(B, x)).toBe('karta [n1,n2] nagr[n1+pole,n2+pole]');
  });
});

// h z treści kanonicznej — replika z prawdziwego źródła (Bnp_kanon, Bnp_h i listy pól wycięte z vilda_vault.js).
const zrodloVault = readFileSync(path.join(korzen, 'vilda_vault.js'), 'utf8');
const wytnij = (od) => { const a = zrodloVault.indexOf(od); const b = zrodloVault.indexOf('\n}\n', a); return zrodloVault.slice(a, b + 2); };
const linia = (od) => { const a = zrodloVault.indexOf(od); return zrodloVault.slice(a, zrodloVault.indexOf('\n', a)); };
let hFn = null;
const hTresci = (z, n) => (hFn || (hFn = new Function(`${linia('const Bnp_POLA_SZYFRU')}\n${linia('const Bnp_POLA_JAWNE')}\n${wytnij('function Bnp_kanon(')}\n${wytnij('function Bnp_h(')}\nreturn Bnp_h;`)()))(z, n);
const trescNowej = (title, body) => ({ title, body, externalName: null, dueTime: null, durationMin: null, igf1: null, medication: null, labResult: null, clinicalDateISO: null, procedureType: null, waitlistPriority: null });
const jawneNowej = (o = {}) => ({ category: 'observation', dueDateISO: null, completedAtISO: null, noShowAtISO: null, linkedAgeMonths: null, seriesId: null, seriesRule: null, ghPointId: null, recheckDays: null, ...o });

describe('P-NOTATKI-ZA-KARTA — przegląd 2: h i +1 ms (L17–L18; przegląd testów 2, Z9–Z10)', () => {
  // L17 (przegląd testów 2, Z9; mutacja h-bez-pol-jawnych).
  // h liczy także pola jawne (2.4: category, dueDateISO, completedAtISO, …). Dwie równoległe poprawki różniące się
  // TYLKO polem jawnym (termin kontroli) dostają różne chwile ratunku, więc wszędzie zostaje ta sama (D21-5); T13 zmienia
  // tylko treść szyfrowaną.
  it('L17 B i C równolegle zmieniają tylko termin n1 (dueDateISO, pole jawne); A usuwa pacjenta; B i C dopisują wizyty → jedna wersja n1 wszędzie', async () => {
    const x = await przygotuj({ A: {}, B: {}, C: {} });
    const { A, B, C } = x.urz;
    przesun(60e3); await B.v.savePatientNote({ id: x.id('n1'), patientId: x.pid, title: 'n1', body: 'fikcja n1', dueDateISO: '2026-12-01' });
    przesun(60e3); await C.v.savePatientNote({ id: x.id('n1'), patientId: x.pid, title: 'n1', body: 'fikcja n1', dueDateISO: '2026-12-15' });
    przesun(60e3); await A.v.removePatient(x.pid);
    await wizyta(B, x);
    await wizyta(C, x, 131);
    const pA = kopia(await A.v.exportSyncPayload());
    przesun(1000); await B.scal(pA);
    przesun(1000); await C.scal(pA);
    const uB = (await B.v.listAllPatientNotes()).find((n) => n.id === x.id('n1')).updatedAtISO;
    const uC = (await C.v.listAllPatientNotes()).find((n) => n.id === x.id('n1')).updatedAtISO;
    expect(uB, 'różne terminy — różne chwile ratunku').not.toBe(uC);
    const w = await rundy(x, ['B', 'C', 'A'], 4);
    expect(w.zbiezne && w.stabilne, JSON.stringify(w.ost)).toBe(true);
    const dd = async (d) => (await d.v.listAllPatientNotes()).filter((n) => n.id === x.id('n1')).map((n) => `${n.dueDateISO}|${n.updatedAtISO}|r${n.rev}`);
    expect(await dd(B)).toEqual(await dd(A));
    expect(await dd(C)).toEqual(await dd(A));
  });

  // L18 (przegląd testów 2, Z10; mutacja ratuj-bez-1ms).
  // „+ 1 ms” w R + 1 ms + h gwarantuje u′ > R także przy h = 0 (1 notatka na 1000). Bez tego stare urządzenie,
  // które przyjęło usunięcie, odrzuca uratowaną wersję (R ≥ Y), a nowe ją mają (rozdz. 5: „B przyjmuje, bo u′ > R”).
  it('L18 notatka z h = 0: ratunek daje R + 1 ms; stare D, które przyjęło usunięcie, dostaje ją po ratunku', async () => {
    let body = null;
    for (let i = 0; i < 20000 && body === null; i += 1) if (hTresci(trescNowej('h0', `fikcja ${i}`), jawneNowej()) === 0) body = `fikcja ${i}`;
    expect(body, 'treść z h = 0').not.toBe(null);
    const x = await przygotuj({ A: {}, B: {}, D: { stara: true } });
    const { A, B, D } = x.urz;
    przesun(1000); const n0 = await A.v.savePatientNote({ patientId: x.pid, title: 'h0', body }); x.nn[n0.id] = 'h0';
    await pelny(A, B); await pelny(A, D);
    przesun(60e3); await A.v.removePatient(x.pid);
    const R = Object.fromEntries((await nagrobkiNotatek(A)).map((t) => [x.nn[t.id], t.deletedAtISO]));
    await wizyta(B, x);
    przesun(1000); await D.scal(await A.v.exportSyncPayload());
    expect(await stan(D, x)).toBe('BRAK [] nagr[h0,n1,n2]');
    await pelny(A, B);
    const uB = Object.fromEntries((await B.v.listAllPatientNotes()).filter((n) => n.patientId === x.pid).map((n) => [x.nn[n.id], n.updatedAtISO]));
    // replika h zgodna z sejfem: n1 (treść 'fikcja n1') uratowana na R + 1 + h
    expect(Date.parse(uB.n1) - Date.parse(R.n1), 'replika h').toBe(1 + hTresci(trescNowej('n1', 'fikcja n1'), jawneNowej()));
    expect(Date.parse(uB.h0) - Date.parse(R.h0), 'h = 0: R + 1 ms').toBe(1);
    const w = await rundy(x, ['B', 'A', 'D'], 3, ['A', 'B', 'D']);
    expect(w.zbiezne && w.stabilne, JSON.stringify(w.ost)).toBe(true);
    expect(w.ost.D).toBe('karta [h0,n1,n2] nagr[]');
  });
});

/* ---------- przegląd przeniesienia na D-7: MS1–MS5, S8, F1, Z1, E2, SP1g, IM1 ---------- */
// D-21 przeniesione na audyt z D-7 (346dd81a). Przegląd: 3 soczewki (interakcja reguł, flota mieszana z prawdziwym
// 346dd81a, mutacje) i sceptyk dla każdego zgłoszenia; 10 zgłoszeń niskiej wagi, każde istniało już przed
// przeniesieniem (c9373e0d), żadne z połączenia D-7 i D-21. MS1–MS5: mutacje, które przechodziły cały plik; S8: wada
// zapisu w stanie CZEKA przy G13 ujawniona przez mutację MS2 (poprawka w Bnp_poZapisie); F1 i Z1: znane ograniczenia
// przypięte testem; E2: granica emulacji starej aplikacji; SP1g i IM1: inne miejsca zdejmujące nagrobek z polem
// (gałąź „inny pacjent” Bnp_poZapisie przy G13, import pliku karty) — wynik jak na bazie, przypięty jako ograniczenie.
const nagrobekNotatkiM = async (d, x, t) => (await nagrobkiNotatek(d)).find((q) => q.id === x.id(t)) || null;
const kartaNa = async (d, x) => (await d.v.listPatients()).find((p) => p.patientId === x.pid).lastSavedAtISO;
// A, B, C bez wymiany: karta Jana na A (2 wersje); notatki dopisuje x.notatki().
async function trzyM() {
  sztucznyZegar();
  const x = { urz: { A: await urzadzenie('A'), B: await urzadzenie('B'), C: await urzadzenie('C') }, nn: {} };
  const { A } = x.urz;
  przesun(60e3); const k = await A.v.savePatient(jan(120, 22), { dedup: false });
  przesun(60e3); await A.v.savePatient(jan(125, 24), { dedup: false, patientId: k.patientId });
  x.pid = k.patientId;
  x.id = (t) => Object.keys(x.nn).find((q) => x.nn[q] === t);
  x.notatki = async () => { for (const t of ['n1', 'n2']) { przesun(1000); const n = await A.v.savePatientNote({ patientId: k.patientId, title: t, body: 'fikcja ' + t }); x.nn[n.id] = t; } };
  return x;
}
// G13: A zapisuje n1 z zegarem o 1 h do przodu i rozsyła ją pełnym ładunkiem — nagrobek n1 z „Usuń pacjenta” ma wtedy
// chwilę R = u > e (Eb: max(teraz, u)).
async function n1ZPrzyszlosci(x, kolej, tresc = 'z przyszłości') {
  vi.setSystemTime(zegar + 3600e3);
  await x.urz.A.v.savePatientNote({ id: x.id('n1'), patientId: x.pid, title: 'n1', body: tresc });
  vi.setSystemTime(zegar);
  await rundy(x, kolej, 1);
}

describe('P-NOTATKI-ZA-KARTA — przegląd przeniesienia na D-7: zapis w stanie „czeka” przy G13 (MS2, S8)', () => {
  // Wada (sceptyk zgłoszenia MS2): Bnp_poZapisie porównywało kartę tylko z e. Przy G13 (R > e) karta po wizycie B jest
  // późniejsza niż e, ale zapis poprawki nie jest późniejszy niż R — zdjęcie nagrobka zostawiało wersję z chwilą ≤ R bez
  // nagrobka, a echo starego urządzenia (nagrobek R bez pola) kasowało n1 razem z poprawką wszędzie, przy żywej karcie.
  // Teraz nagrobek zdejmowany tylko przy karcie > e i zapisie > R; inaczej zostaje na R (pole bez zmian, rev = max)
  // i najbliższe scalanie ratuje poprawkę (R + 1 ms + h). Na 346dd81a w S8b giną obie notatki (bez D-21).
  async function czekaG13(urz) {
    const x = await przygotuj(urz);
    await n1ZPrzyszlosci(x, Object.keys(urz));
    nagrywaj(x.urz.A, { nagrPac: true });
    przesun(60e3); await x.urz.A.v.removePatient(x.pid);
    x.e = (await nagrobekKarty(x.urz.A, x.pid)).deletedAtISO;
    x.R = (await nagrobekNotatkiM(x.urz.A, x, 'n1')).deletedAtISO;
    expect(x.R > x.e, 'G13: R > e').toBe(true);
    await dostarcz(x.urz.A, x.urz.B);
    expect(await stan(x.urz.B, x), 'B czeka').toBe('karta [n1=z przyszłości,n2] nagr[n1+pole,n2+pole]');
    return x;
  }
  // wizyta B (karta między e i R), potem poprawka n1; zwraca chwilę zapisu
  async function wizytaIPoprawka(x) {
    const { B } = x.urz;
    await wizyta(B, x);
    const karta = await kartaNa(B, x);
    expect([karta > x.e, karta < x.R], 'karta B między e i R').toEqual([true, true]);
    const kiedy = przesun(60e3);
    await B.v.savePatientNote({ id: x.id('n1'), patientId: x.pid, title: 'n1', body: 'poprawka B' });
    expect(kiedy < x.R, 'zapis wcześniejszy niż R').toBe(true);
    return kiedy;
  }

  it('S8b [CZERWONY na 12b0cd4d] flota mieszana: B „czeka” (G13), offline dopisuje wizytę i poprawia n1; stare O przyjęło usunięcie i wysyła ostatnie → poprawka B wszędzie', async () => {
    const x = await czekaG13({ A: {}, B: {}, O: { stara: true } });
    const { A, B, O } = x.urz;
    await x.c.sync(A); await x.c.sync(O);
    expect(await stan(O, x), 'stare O przyjęło usunięcie').toBe('BRAK [] nagr[n1,n2]');
    await wizytaIPoprawka(x);
    expect(await stan(B, x), 'nagrobek n1 zostaje').toBe('karta [n1=poprawka B,n2] nagr[n1+pole,n2+pole]');
    await x.c.sync(B);
    expect(await stan(B, x), 'echo starego O nie odbiera pola: ratunek poprawki').toBe('karta [n1=poprawka B,n2] nagr[]');
    const w = await rundy(x, ['A', 'B', 'O'], 3);
    expect(w.zbiezne && w.stabilne, JSON.stringify(w.ost)).toBe(true);
    expect(w.ost.O).toBe('karta [n1=poprawka B,n2] nagr[]');
  });

  // MS2 (mutacja st:pozapisie-karta-vs-R) w odwróconej postaci: przypina nową regułę — nagrobek n1 zostaje z chwilą R
  // i z polem, rev = max (poprawka B ma rev 3). CZ3b (R = e) tego nie odróżnia.
  it('MS2 [CZERWONY na 12b0cd4d] G13: B „czeka”, dopisuje wizytę (karta > e, ale < R), poprawia n1 → nagrobek n1 zostaje (chwila R, pole, rev 3); wszędzie poprawka B', async () => {
    const x = await czekaG13({ A: {}, B: {} });
    const { B } = x.urz;
    await wizytaIPoprawka(x);
    expect(await stan(B, x)).toBe('karta [n1=poprawka B,n2] nagr[n1+pole,n2+pole]');
    const n1 = await nagrobekNotatkiM(B, x, 'n1');
    expect([n1.deletedAtISO, n1.rev, n1.deletedWithPatient], 'chwila R, rev = max, pole bez zmian').toEqual([x.R, 3, { patientId: x.pid, deletedAtISO: x.e }]);
    const w = await rundy(x, ['B', 'A'], 3);
    expect(w.zbiezne && w.stabilne, JSON.stringify(w.ost)).toBe(true);
    expect(w.ost.A).toBe('karta [n1=poprawka B,n2] nagr[]');
  });

  // MS2r (granice nowej reguły): zapis dokładnie w chwili R nie jest późniejszy niż R — nagrobek zostaje (mutacja „≥”);
  // zapis R + 1 ms przy karcie > e (karta między e i R) — zdjęty jak dotąd (mutacja „karta porównana z R”).
  it('MS2r [CZERWONY na 12b0cd4d] granice: B „czeka” (G13), wizyta (karta między e i R); zapis poprawki w chwili R → nagrobek n1 zostaje, w R + 1 ms → zdjęty', async () => {
    for (const [d, oczek] of [[0, 'karta [n1=poprawka B,n2] nagr[n1+pole,n2+pole]'], [1, 'karta [n1=poprawka B,n2] nagr[n2+pole]']]) {
      const x = await czekaG13({ A: {}, B: {} });
      const { B } = x.urz;
      await wizyta(B, x);
      const karta = await kartaNa(B, x);
      expect([karta > x.e, karta < x.R], 'karta B między e i R').toEqual([true, true]);
      vi.setSystemTime(Date.parse(x.R) + d);
      await B.v.savePatientNote({ id: x.id('n1'), patientId: x.pid, title: 'n1', body: 'poprawka B' });
      vi.setSystemTime(zegar);
      expect(await stan(B, x), `zapis w R + ${d} ms`).toBe(oczek);
      if (!d) expect((await nagrobekNotatkiM(B, x, 'n1')).deletedAtISO, 'chwila R').toBe(x.R);
    }
  });

  // S8a [kontrola]: bez starego urządzenia koniec jest ten sam z regułą i bez niej (zmierzone na c9373e0d i 4fa68948):
  // n1 = poprawka B, rev 3, chwila R + 1 ms + h, identyczna na A i B.
  it('S8a [kontrola] MS2 bez starego urządzenia: koniec A i B identyczny — poprawka B, rev 3, chwila R + 1 ms + h', async () => {
    const x = await czekaG13({ A: {}, B: {} });
    const { A, B } = x.urz;
    await wizytaIPoprawka(x);
    const w = await rundy(x, ['B', 'A'], 3);
    expect(w.zbiezne && w.stabilne, JSON.stringify(w.ost)).toBe(true);
    expect(w.ost.A).toBe('karta [n1=poprawka B,n2] nagr[]');
    const m = await meta(A, x);
    expect(await meta(B, x)).toEqual(m);
    const [, u, r] = m.find((s) => s.startsWith('n1:')).match(/^n1:(.+):r(\d+)$/);
    const d = Date.parse(u) - Date.parse(x.R);
    expect([r, d >= 1 && d <= 1000], 'R + 1 ms + h, rev 3').toEqual(['3', true]);
  });

  // S8c [kontrola]: S8b bez G13 (R = e) — zapis po wizycie jest późniejszy niż R, nagrobek zdjęty jak dotąd (CZ3b), echo
  // starego O nie kasuje poprawki (chwila zapisu > R).
  it('S8c [kontrola] S8b bez G13: zapis po wizycie zdejmuje nagrobek jak dotąd; echo starego O nie kasuje poprawki → poprawka B wszędzie', async () => {
    const x = await przygotuj({ A: {}, B: {}, O: { stara: true } });
    const { A, B, O } = x.urz;
    przesun(1000); await A.v.savePatientNote({ id: x.id('n1'), patientId: x.pid, title: 'n1', body: 'teraz' });
    await rundy(x, ['A', 'B', 'O'], 1);
    nagrywaj(A, { nagrPac: true });
    przesun(60e3); await A.v.removePatient(x.pid);
    await dostarcz(A, B);
    expect(await stan(B, x), 'B czeka').toBe('karta [n1=teraz,n2] nagr[n1+pole,n2+pole]');
    await x.c.sync(A); await x.c.sync(O);
    await wizyta(B, x);
    przesun(60e3); await B.v.savePatientNote({ id: x.id('n1'), patientId: x.pid, title: 'n1', body: 'poprawka B' });
    expect(await stan(B, x)).toBe('karta [n1=poprawka B,n2] nagr[n2+pole]');
    await x.c.sync(B);
    expect(await stan(B, x)).toBe('karta [n1=poprawka B,n2] nagr[]');
    const w = await rundy(x, ['A', 'B', 'O'], 3);
    expect(w.zbiezne && w.stabilne, JSON.stringify(w.ost)).toBe(true);
    expect(w.ost.O).toBe('karta [n1=poprawka B,n2] nagr[]');
  });

  // SP1g [znane ograniczenie] (sprawdzenie innych miejsc zdejmujących nagrobek): „Scal pacjentów” X→Y w stanie CZEKA
  // przy G13. Gałąź „inny pacjent” Bnp_poZapisie zdejmuje nagrobek jak dotąd, a przepięta n1 dostaje chwilę zapisu
  // (teraz < R = u). Następne scalanie: Y ≤ R, pole X, karty X nie ma (scalona) → n1 ginie także pod Y, na każdym
  // urządzeniu; n2 (bez G13) zostaje pod Y jak w SP1. Pozostawiony nagrobek nie pomógłby (pole X, karty X nie ma).
  // Na bazie (346dd81a) B kasuje notatki już przy nagrobkach notatek, więc scalenie żadnej nie przepina — klasa D21-9
  // („Scal pacjentów” równolegle z „Usuń pacjenta”: przepięte notatki giną jak dziś).
  it('SP1g [znane ograniczenie] G13: B „czeka” i scala X→Y → n1 (chwila z przyszłości) ginie także pod Y, n2 zostaje pod Y', async () => {
    const x = await przygotuj({ A: {}, B: {} });
    const { A, B } = x.urz;
    przesun(60e3);
    const y = await A.v.savePatient({ name: 'Testowa Ewa', user: { lastName: 'Testowa', firstName: 'Ewa', dobISO: '2015-05-05', sex: 'K', height: 120, weight: 22 } }, { dedup: false });
    await n1ZPrzyszlosci(x, ['A', 'B']);
    nagrywaj(A, { nagrPac: true }); nagrywaj(B);
    przesun(60e3); await A.v.removePatient(x.pid);
    const R = (await nagrobekNotatkiM(A, x, 'n1')).deletedAtISO;
    await dostarcz(A, B);
    expect(await stan(B, x), 'B czeka').toBe('karta [n1=z przyszłości,n2] nagr[n1+pole,n2+pole]');
    przesun(60e3); expect((await B.v.mergePatients(x.pid, y.patientId)).notesMoved).toBe(2);
    const n1 = (await B.v.listAllPatientNotes()).find((n) => n.id === x.id('n1'));
    expect([n1.patientId === y.patientId, n1.updatedAtISO < R], 'n1 pod Y z chwilą < R').toEqual([true, true]);
    await dostarcz(B, A);
    const w = await rundy(x, ['A', 'B'], 3);
    expect(w.zbiezne && w.stabilne, JSON.stringify(w.ost)).toBe(true);
    expect(w.ost.A).toBe('BRAK [] nagr[n1+pole]');
    const podY = async (d) => (await d.v.listAllPatientNotes()).filter((n) => n.patientId === y.patientId).map((n) => x.nn[n.id]).sort();
    for (const k of ['A', 'B']) expect(await podY(x.urz[k]), k).toEqual(['n2']);
  });
});

describe('P-NOTATKI-ZA-KARTA — przegląd przeniesienia na D-7: luki testów (MS1, MS3–MS5)', () => {
  // MS1 (mutacja st:podglad-kartaPo-bez-max). Bks_kartaPo: karta tutaj z nowymi wersjami z kopii = PÓŹNIEJSZA z obu
  // chwil, jak pętla kart ss. Tu kopia C („czeka”) niesie wizytę sprzed usunięcia, której B nie zna (karta C < e), a B
  // dopisał wizytę po usunięciu (karta B > e): po pętli kart karta B > e → RATUNEK. Lustro (karta kopii późniejsza
  // niż tutejsza, tutejsza < e) to P1 — oba testy razem pilnują obu ramion max.
  it('MS1 kopia C („czeka”, wizyta sprzed usunięcia nieznana B), B z wizytą po usunięciu → RATUNEK na B; podgląd = wynik (updated 2)', async () => {
    const x = await trzyM();
    const { A, B, C } = x.urz;
    await x.notatki();
    await pelny(A, B); await pelny(A, C);
    przesun(30e3); await C.v.savePatient(jan(127, 25), { dedup: false, patientId: x.pid });
    nagrywaj(A);
    przesun(60e3); await A.v.removePatient(x.pid);
    const e = (await nagrobekKarty(A, x.pid)).deletedAtISO;
    await dostarcz(A, C, (t) => t === 'nagrNot');
    expect(await stan(C, x), 'C czeka').toBe('karta [n1,n2] nagr[n1+pole,n2+pole]');
    await wizyta(B, x);
    expect([await kartaNa(C, x) < e, await kartaNa(B, x) > e], 'karta kopii przed e, tutejsza po e').toEqual([true, true]);
    const r = await scalKopie(B, C);
    expect(r.d).toEqual({ dodane: 0, zmienione: 2, usuniete: 0, przywrocone: 0 });
    expect(await stan(B, x)).toBe('karta [n1,n2] nagr[]');
  });

  // MS3 (mutacja st:stan-stara-karta-ge) z granicami e ± 1 ms. Gałąź „wersja sprzed usunięcia” (zgł. 2b) Bnp_stan:
  // karta = e to CZEKA, nie RATUNEK (ostra nierówność). W Le mutacja jest niewidoczna (świeża karta w Bnp_ratuj, ostro),
  // ale podgląd liczyłby ratunek jako „zmienioną” ([2, 1]). L16 pilnuje remisu tylko w gałęzi głównej. E: poprawka n1
  // (rev 2) przed usunięciem i wizyta o d ms względem „Usuń pacjenta” na A; prawdziwe delty nagrobków notatek z A
  // (delta nagrobka karty zgubiona). B (gwiazdka po usunięciu, bez nowej wersji dla E) ratuje rev 1; E scala kopię B.
  // d = −1 i 0: E czeka, n1 CZEKA (gałąź 2b), n2 — wersja B wchodzi (updated 1). d = +1: E ratuje już przy deltach.
  for (const [d, poDeltach, zmienione, koniec] of [
    [-1, 'karta [n1=poprawka E,n2] nagr[n1+pole,n2+pole]', 1, 'karta [n1=poprawka E,n2] nagr[n1+pole]'],
    [0, 'karta [n1=poprawka E,n2] nagr[n1+pole,n2+pole]', 1, 'karta [n1=poprawka E,n2] nagr[n1+pole]'],
    [1, 'karta [n1=poprawka E,n2] nagr[]', 0, 'karta [n1=poprawka E,n2] nagr[]'],
  ]) {
    it(`MS3 karta E = e ${d < 0 ? '−' : '+'} ${Math.abs(d)} ms, wersja sprzed usunięcia (zgł. 2b), kopia B z ratunkiem rev 1 → podgląd = wynik (updated ${zmienione})`, async () => {
      const x = await przygotuj({ A: {}, B: {}, E: {} });
      const { A, B, E } = x.urz;
      przesun(30e3); await E.v.savePatientNote({ id: x.id('n1'), patientId: x.pid, title: 'n1', body: 'poprawka E' });
      nagrywaj(A, { nagrPac: true });
      const t0 = przesun(60e3);
      await A.v.removePatient(x.pid);
      expect((await nagrobekKarty(A, x.pid)).deletedAtISO, 'e').toBe(t0);
      vi.setSystemTime(zegar + d);
      await E.v.savePatient(jan(131, 27), { dedup: false, patientId: x.pid });
      vi.setSystemTime(zegar);
      expect(await kartaNa(E, x), 'karta E = e + d').toBe(new Date(Date.parse(t0) + d).toISOString());
      expect(await dostarcz(A, E), 'delty nagrobków notatek z polem').toEqual(['nagrNot+pole', 'nagrNot+pole']);
      expect(await stan(E, x)).toBe(poDeltach);
      const s1 = (await B.v.getPatient(x.pid)).snapshots[0].snapshotId;
      przesun(60e3); await B.v.setSnapshotPinned(x.pid, s1, true);
      await pelny(A, B);
      expect(await stan(B, x), 'B ratuje').toBe('karta [n1,n2] nagr[]');
      const r = await scalKopie(E, B);
      expect(r.d).toEqual({ dodane: 0, zmienione, usuniete: 0, przywrocone: 0 });
      expect(await stan(E, x)).toBe(koniec);
    });
  }

  // MS4 (mutacja st:stan-stara-karta-vs-R). Gałąź „wersja sprzed usunięcia” (zgł. 2b) porównuje kartę z e, nie z R.
  // Testy zgł. 2b mają R = e. Tu G13: R = u > e; E poprawia n1 (rev 3, chwila < R) przed usunięciem, którego A nie zna;
  // B ratuje rev 2; karta E po wizycie B jest późniejsza niż e, ale nie niż R → RATUNEK rev 3 (chwila > R) już przy
  // pierwszym ładunku B (krok 2, drugi wyjątek). Mutant kończy zbieżnie (ratunek przychodzi scalanie później, gałęzią
  // główną), więc test pilnuje chwili ratunku, nie utraty danych.
  it('MS4 G13 (R > e): E „czeka” z rev 3 sprzed usunięcia, B ratuje rev 2, karta E > e (< R) → E ratuje rev 3 przy pierwszym ładunku B; zbieżnie, także stare O', async () => {
    const x = await przygotuj({ A: {}, B: {}, E: {}, O: { stara: true } });
    const { A, B, E, O } = x.urz;
    await n1ZPrzyszlosci(x, ['A', 'B', 'E', 'O']);
    przesun(30e3); await E.v.savePatientNote({ id: x.id('n1'), patientId: x.pid, title: 'n1', body: 'poprawka E' });
    przesun(60e3); await A.v.removePatient(x.pid);
    const e = (await nagrobekKarty(A, x.pid)).deletedAtISO;
    const R = (await nagrobekNotatkiM(A, x, 'n1')).deletedAtISO;
    expect(R > e, 'G13: R > e').toBe(true);
    await pelny(A, O);
    przesun(1000); await E.scal({ ...kopia(await A.v.exportSyncPayload()), patients: [], tombstones: [] });
    expect(await stan(E, x)).toBe('karta [n1=poprawka E,n2] nagr[n1+pole,n2+pole]');
    await wizyta(B, x);
    await pelny(A, B); await pelny(B, A);
    const kartaB = await kartaNa(B, x);
    expect([kartaB > e, kartaB < R], 'karta B między e i R').toEqual([true, true]);
    await pelny(B, E);
    const n1E = (await E.v.listAllPatientNotes()).find((n) => n.id === x.id('n1'));
    expect([n1E.body, n1E.rev, n1E.updatedAtISO > R, await stan(E, x)], 'rev 3 uratowana, chwila > R')
      .toEqual(['poprawka E', 3, true, 'karta [n1=poprawka E,n2] nagr[]']);
    await pelny(E, B); await pelny(E, A);
    await pelny(O, A); await pelny(O, B); await pelny(O, E);
    for (let r = 0; r < 2; r += 1) for (const [z, na] of [[A, O], [O, A], [A, B], [B, E], [E, A]]) await pelny(z, na);
    for (const k of ['A', 'B', 'E', 'O']) expect((await stan(x.urz[k], x)).replace(/\+pole/g, ''), k).toBe('karta [n1=poprawka E,n2] nagr[]');
  });

  // MS4 na prawdziwych deltach (sceptyk MS4, SK5-2): E dostaje same delty nagrobków notatek A (delta nagrobka karty
  // jeszcze nie doszła) — stan CZEKA bez okrojonego ładunku; spóźniona delta nagrobka karty niczego nie zmienia.
  it('MS4 delty: E dostaje tylko delty nagrobków notatek A → RATUNEK rev 3 przy pierwszym ładunku B; spóźniona delta nagrobka karty nic nie zmienia', async () => {
    const x = await przygotuj({ A: {}, B: {}, E: {} });
    const { A, B, E } = x.urz;
    await n1ZPrzyszlosci(x, ['A', 'B', 'E']);
    przesun(30e3); await E.v.savePatientNote({ id: x.id('n1'), patientId: x.pid, title: 'n1', body: 'poprawka E' });
    nagrywaj(A);
    przesun(60e3); await A.v.removePatient(x.pid);
    const R = (await nagrobekNotatkiM(A, x, 'n1')).deletedAtISO;
    expect(R > (await nagrobekKarty(A, x.pid)).deletedAtISO, 'G13').toBe(true);
    expect(await dostarcz(A, E, (t) => t === 'nagrNot'), 'delty nagrobków z polem').toEqual(['nagrNot+pole', 'nagrNot+pole']);
    expect(await stan(E, x), 'E czeka').toBe('karta [n1=poprawka E,n2] nagr[n1+pole,n2+pole]');
    await wizyta(B, x);
    await pelny(A, B);
    expect(await stan(B, x), 'B ratuje').toBe('karta [n1=z przyszłości,n2] nagr[]');
    await pelny(B, E);
    const n1E = (await E.v.listAllPatientNotes()).find((n) => n.id === x.id('n1'));
    expect([n1E.body, n1E.rev, n1E.updatedAtISO > R, await stan(E, x)], 'rev 3 uratowana przy pierwszym ładunku B')
      .toEqual(['poprawka E', 3, true, 'karta [n1=poprawka E,n2] nagr[]']);
    await dostarcz(A, E);
    expect(await stan(E, x), 'po spóźnionej delcie nagrobka karty').toBe('karta [n1=poprawka E,n2] nagr[]');
  });

  // MS5 (mutacja ad:czeka-zawsze-zapis). Pętla CZEKA nie zapisuje kanonu, który już leży (ta sama chwila, pole i rev),
  // i nie czyta wtedy pojedynczego nagrobka; listę nagrobków notatek scalanie czyta raz, jak w każdym scaleniu
  // (wer-dok, TEST-2). Test utrwala optymalizację: zwykłe nagrobki notatek pętla U przepisuje przy każdym scaleniu (tak
  // było i na 346dd81a), nagrobki w stanie CZEKA (do 365 dni) — nie. T27 liczy odczyty kart i blokady.
  it('MS5 B „czeka”; kolejne scalenie tego samego ładunku → 0 zapisów i 0 pojedynczych odczytów nagrobka notatki; lista nagrobków czytana raz; stan bez zmian', async () => {
    const x = await przygotuj({ A: {}, B: {} });
    const { A, B } = x.urz;
    nagrywaj(A, { nagrPac: true });
    przesun(60e3); await A.v.removePatient(x.pid);
    await dostarcz(A, B);
    expect(await stan(B, x), 'B czeka').toBe('karta [n1,n2] nagr[n1+pole,n2+pole]');
    const ladunek = { ...kopia(await A.v.exportSyncPayload()), patients: [], tombstones: [] };
    przesun(1000); await B.scal(ladunek);
    const przed = await nagrobkiNotatek(B);
    B.zeruj();
    przesun(1000); await B.scal(ladunek);
    expect([B.licz.putPatientNoteTombstoneForUser || 0, B.licz.getPatientNoteTombstoneForUser || 0, B.licz.listPatientNoteTombstonesForUser || 0], 'zapisy i pojedyncze odczyty nagrobka notatki, odczyty listy nagrobków').toEqual([0, 0, 1]);
    expect(await nagrobkiNotatek(B)).toEqual(przed);
    expect(await stan(B, x)).toBe('karta [n1,n2] nagr[n1+pole,n2+pole]');
  });

  // MS5 na prawdziwych deltach (sceptyk MS5, R1): B „czeka” z delt (nagrobki notatek doszły, nagrobek karty jeszcze nie),
  // potem delta nowej karty innego pacjenta przechodzi przez całe Le → 0 zapisów i 0 pojedynczych odczytów nagrobka
  // notatki (lista nagrobków czytana raz); po delcie nagrobka karty — karta i notatki znikają razem.
  it('MS5 delty: B „czeka”, delta nowej karty innego pacjenta → 0 zapisów i 0 pojedynczych odczytów nagrobka notatki; lista nagrobków czytana raz; po nagrobku karty BRAK', async () => {
    const x = await przygotuj({ A: {}, B: {} });
    const { A, B } = x.urz;
    nagrywaj(A);
    przesun(60e3); await A.v.removePatient(x.pid);
    await dostarcz(A, B, (t) => t === 'nagrNot');
    expect(await stan(B, x), 'B czeka').toBe('karta [n1,n2] nagr[n1+pole,n2+pole]');
    const przed = await nagrobkiNotatek(B);
    przesun(60e3);
    await A.v.savePatient({ name: 'Testowa Ewa', user: { lastName: 'Testowa', firstName: 'Ewa', dobISO: '2017-05-20', sex: 'F', height: 118, weight: 21 } }, { dedup: false });
    B.zeruj();
    expect(await dostarcz(A, B, (t) => t === 'karta'), 'delta karty Ewy').toEqual(['karta']);
    expect([B.licz.putPatientNoteTombstoneForUser || 0, B.licz.getPatientNoteTombstoneForUser || 0, B.licz.listPatientNoteTombstonesForUser || 0], 'zapisy i pojedyncze odczyty nagrobka notatki, odczyty listy nagrobków').toEqual([0, 0, 1]);
    expect(await nagrobkiNotatek(B)).toEqual(przed);
    await dostarcz(A, B);
    expect(await stan(B, x), 'po nagrobku karty').toBe('BRAK [] nagr[n1+pole,n2+pole]');
  });
});

describe('P-NOTATKI-ZA-KARTA — przegląd przeniesienia na D-7: znane ograniczenia (F1, Z1, IM1) i granica emulacji (E2)', () => {
  // F1 [znane ograniczenie, D21-9: rozjazd G5 po „Scal pacjentów”, tu drogą „Scal kopię konta”]. A usuwa X; B
  // (nieświadome) stawia gwiazdkę na X; C scala kopię konta A (X zostaje, n1 w stanie CZEKA); B robi „Scal pacjentów”
  // X→Y (n1 pod Y, rev 2); C scala kopię konta B — Bks_notatki (P-KOPIA-POMIJA) zostawia notatkę z kopii pod tutejszą
  // kartą X, z tymi samymi (rev, updatedAtISO) co n1@Y na A i B; Le takiego remisu nie rozstrzyga, a nagrobek X ze
  // scalenia notatek nie kasuje. Koniec: A i B n1@Y, C n1@X bez karty (sierota widoczna nigdzie). Na bazie ta sama droga
  // istnieje bez usunięcia (wariant „bez usunięcia”) i z usunięciem bez kopii A („C bez kopii A”); D-21 dokłada wejście
  // przez CZEKA (na 346dd81a wariant podstawowy jest zbieżny tylko dlatego, że C kasowało n1 przy żywej karcie X).
  // Rozjazd znika przy następnej poprawce n1 na urządzeniu, na którym jest widoczna (A albo B).
  const ola = (h, w) => ({ name: 'Testowa Ola', user: { lastName: 'Testowa', firstName: 'Ola', dobISO: '2015-05-02', sex: 'F', height: h, weight: w } });
  async function stanF1(d, c) {
    const karty = new Set((await d.v.listPatients()).map((p) => p.patientId));
    const imie = { [c.x]: 'X', [c.y]: 'Y' };
    const n = (await d.v.listAllPatientNotes()).filter((q) => imie[q.patientId]).map((q) => `${c.nn[q.id] || q.title}@${imie[q.patientId]}`).sort();
    return `X:${karty.has(c.x) ? 'karta' : 'brak'} Y:${karty.has(c.y) ? 'karta' : 'brak'} [${n.join(',')}]`;
  }
  const metaF1 = async (d, c) => (await d.v.listAllPatientNotes()).filter((q) => q.id === c.n1).map((q) => `r${q.rev}:${q.updatedAtISO}`).join(' ');
  async function wszystkie(urz, ile) { for (let r = 0; r < ile; r += 1) for (const a of urz) for (const b of urz) if (a !== b) await pelny(a, b); }
  async function migawkaF1(urz, c) { const s = {}; for (const d of urz) s[d.nazwa] = await stanF1(d, c); return s; }
  const kopiaKontaF1 = async (z, na) => { przesun(60e3); return na.v.mergeVaultBackup(await z.v.exportVaultBackup(), z.haslo); };
  for (const wariant of ['podstawowy', 'C bez kopii A', 'bez usunięcia']) {
    it(`F1 [znane ograniczenie] ${wariant}: „Scal pacjentów” X→Y na B, C scala kopie konta → n1@Y na A i B, n1@X bez karty na C; poprawka n1 na A leczy rozjazd`, async () => {
      sztucznyZegar();
      const A = await urzadzenie('A'), B = await urzadzenie('B'), C = await urzadzenie('C');
      const urz = [A, B, C];
      przesun(60e3); const kx = await A.v.savePatient(jan(120, 22), { dedup: false });
      przesun(60e3); await A.v.savePatient(jan(125, 24), { dedup: false, patientId: kx.patientId });
      przesun(60e3); const ky = await A.v.savePatient(ola(118, 21), { dedup: false });
      const c = { x: kx.patientId, y: ky.patientId, nn: {} };
      przesun(1000); const n1 = await A.v.savePatientNote({ patientId: c.x, title: 'n1', body: 'fikcja n1' });
      c.n1 = n1.id; c.nn[n1.id] = 'n1';
      for (let r = 0; r < 2; r += 1) for (const d of [B, C]) { await pelny(A, d); await pelny(d, A); }
      if (wariant !== 'bez usunięcia') { przesun(60e3); await A.v.removePatient(c.x); }
      przesun(60e3); await B.v.setSnapshotPinned(c.x, (await B.v.getPatient(c.x)).snapshots[0].snapshotId, true);
      if (wariant === 'podstawowy') {
        await kopiaKontaF1(A, C);
        expect(await stanF1(C, c), 'C: n1 czeka przy karcie X (na 346dd81a skasowana)').toBe('X:karta Y:karta [n1@X]');
      }
      przesun(60e3); expect((await B.v.mergePatients(c.x, c.y)).notesMoved).toBe(1);
      await kopiaKontaF1(B, C);
      expect(await stanF1(C, c), 'C po kopii B: notatka pod tutejszą kartą X').toBe('X:karta Y:karta [n1@X]');
      await wszystkie(urz, 4);
      expect(await migawkaF1(urz, c)).toEqual({ A: 'X:brak Y:karta [n1@Y]', B: 'X:brak Y:karta [n1@Y]', C: 'X:brak Y:karta [n1@X]' });
      const m = await metaF1(A, c);
      expect([await metaF1(B, c), await metaF1(C, c)], 'te same (rev, updatedAtISO)').toEqual([m, m]);
      // leczenie: A poprawia n1 (widoczną pod Y)
      przesun(60e3); await A.v.savePatientNote({ id: c.n1, patientId: c.y, title: 'n1', body: 'fikcja n1, poprawka A' });
      await wszystkie(urz, 3);
      expect(await migawkaF1(urz, c)).toEqual({ A: 'X:brak Y:karta [n1@Y]', B: 'X:brak Y:karta [n1@Y]', C: 'X:brak Y:karta [n1@Y]' });
    });
  }

  // Z1 [znane ograniczenie: H2b przy rozjeździe zegarów, klasa D13/G17]. C nie wie o „Usuń pacjenta” na A i 2 min po nim
  // (czas rzeczywisty) ręcznie usuwa n1, ale zegar C jest za zegarem A o więcej niż ten odstęp (dokładniej: o więcej niż
  // odstęp − 1 ms − h) — chwila ręcznego nagrobka wypada przed R, więc ratunek B (R + 1 ms + h, krok 2: Y > R) wygrywa
  // z nim jak w H2b i n1 wraca wszędzie (widoczna, zbieżnie; wystarczy usunąć ponownie). Przy zgodnych zegarach — T9:
  // usunięcie wygrywa. Gdy nagrobek C dojdzie przed ratunkiem, M (D21-2) działa także przy rozjeździe zegarów.
  // Flota samych 346dd81a traci n1 i n2 (karta wraca bez notatek); C stare albo nowe — ten sam wynik.
  async function z1({ zegC, stara = false, reczneNajpierw = false }) {
    const x = await przygotuj({ A: {}, B: {}, C: { stara, zegar: zegC } });
    const { A, B, C } = x.urz;
    przesun(60e3); await A.v.removePatient(x.pid);
    przesun(120e3); await C.v.removePatientNote(x.id('n1'));
    await wizyta(B, x);
    if (reczneNajpierw) { await pelny(C, B); await pelny(C, A); }
    await pelny(A, B);
    await pelny(B, A);
    if (!reczneNajpierw) { await pelny(C, A); await pelny(C, B); }
    const w = await rundy(x, ['A', 'B', 'C'], 4);
    // stare C nie przechowuje pola — zbieżność bez znaczników pola
    const bez = (q) => q.replace(/\+pole/g, '').replace(/\+r/g, '');
    expect(w.stabilne && ['B', 'C'].every((k) => bez(w.ost[k]) === bez(w.ost.A)), JSON.stringify(w.ost)).toBe(true);
    return bez(w.ost.A);
  }
  for (const stara of [false, true]) {
    it(`Z1 [znane ograniczenie] ${stara ? 'stare' : 'nowe'} C (zegar −10 min, nie wie o usunięciu) ręcznie usuwa n1 2 min po „Usuń pacjenta”, ratunek B dochodzi wcześniej → n1 wraca; zegar 0 → [n2] (T9)`, async () => {
      expect(await z1({ zegC: -600e3, stara })).toBe('karta [n1,n2] nagr[]');
      expect(await z1({ zegC: 0, stara })).toBe('karta [n2] nagr[n1]');
    });
  }
  it('Z1 próg przy odstępie 120 s: zegar C −118 s → n1 usunięta, −122 s → n1 wraca', async () => {
    expect(await z1({ zegC: -118e3 })).toBe('karta [n2] nagr[n1]');
    expect(await z1({ zegC: -122e3 })).toBe('karta [n1,n2] nagr[]');
  });
  for (const stara of [false, true]) {
    it(`Z1 [kontrola] ${stara ? 'stare' : 'nowe'} C, zegar −10 min, ręczny nagrobek C dochodzi do B i A przed ratunkiem → n1 usunięta`, async () => {
      expect(await z1({ zegC: -600e3, stara, reczneNajpierw: true })).toBe('karta [n2] nagr[n1]');
    });
  }

  // IM1 [znane ograniczenie] (sprawdzenie innych miejsc zdejmujących nagrobek): import pliku karty do istniejącej karty
  // w stanie CZEKA zdejmuje nagrobki importowanych notatek (P-NOTATKI-1 G3), a ich chwil nie podbija (P-IMPORT-NAGROBEK
  // podbija tylko przy karcie przywracanej z pliku) — zostają wersje z chwilą ≤ R bez nagrobka, jak w zgł. 2a. Echo
  // starego O (nagrobki bez pola) kasuje je potem przy żywej karcie; bez importu D-21 je ratuje, a z nowym O ratunek
  // z ładunku z polem je przywraca. Na bazie (346dd81a) giną w każdym z tych wariantów. Reguła importu bez zmian.
  it('IM1 [znane ograniczenie] B „czeka”, dopisuje wizytę i importuje plik karty; stare O przyjęło usunięcie → notatki giną (jak na bazie); bez importu albo z nowym O wracają', async () => {
    async function im(stara, importuj) {
      const x = await przygotuj({ A: {}, B: {}, O: { stara } });
      const { A, B, O } = x.urz;
      const plik = await B.v.exportPatientEnvelope(x.pid);
      nagrywaj(A, { nagrPac: true });
      przesun(60e3); await A.v.removePatient(x.pid);
      await dostarcz(A, B);
      expect(await stan(B, x), 'B czeka').toBe('karta [n1,n2] nagr[n1+pole,n2+pole]');
      await x.c.sync(A); await x.c.sync(O);
      await wizyta(B, x);
      if (importuj) {
        przesun(60e3); await B.v.importPatientFromEnvelope(plik, B.haslo);
        expect(await stan(B, x), 'import zdejmuje nagrobki z polem').toBe('karta [n1,n2] nagr[]');
      }
      await x.c.sync(B);
      const w = await rundy(x, ['A', 'B', 'O'], 3);
      // stare O nie przechowuje pola — zbieżność bez znaczników pola
      const bez = (q) => q.replace(/\+pole/g, '');
      expect(w.stabilne && ['B', 'O'].every((k) => bez(w.ost[k]) === bez(w.ost.A)), JSON.stringify(w.ost)).toBe(true);
      return bez(w.ost.A);
    }
    expect(await im(true, true), 'stare O, import').toBe('karta [] nagr[n1,n2]');
    expect(await im(true, false), 'stare O, bez importu').toBe('karta [n1,n2] nagr[]');
    expect(await im(false, true), 'nowe O, import').toBe('karta [n1,n2] nagr[]');
  });

  // E2: emulacja starej aplikacji nie obejmuje kopii konta — na urządzeniu „stara” mergeVaultBackup,
  // previewVaultBackupMerge i restoreVaultBackup rzucają (prawdziwa stara aplikacja kasuje tam notatki „jak dziś”).
  it('E2 emulacja starej aplikacji: scalanie, podgląd i odtworzenie kopii konta na urządzeniu „stara” rzucają; eksport kopii działa', async () => {
    const x = await przygotuj({ A: {}, S: { stara: true } });
    const plik = await x.urz.A.v.exportVaultBackup();
    for (const m of ['mergeVaultBackup', 'previewVaultBackupMerge', 'restoreVaultBackup']) {
      await expect(x.urz.S.v[m](plik, x.urz.A.haslo), m).rejects.toThrow(/emulacja starej aplikacji nie obejmuje kopii konta/);
    }
    expect(typeof (await x.urz.S.v.exportVaultBackup())).not.toBe('undefined');
  });
});

/* ---------- przegląd poprawki MS2 (domknięcie): W14a, W14b, W11 ---------- */
// Weryfikacja poprawki MS2 (af4f7d10): scenariusze adwersarza na nowej wersji i na 12b0cd4d, fuzz różnicowy (W14
// znalazł sam w ziarnach 1215 i 3710 floty samych nowych urządzeń) i sondy dokumentacji. Decyzja integratora zgodna z
// D21-3 (klasa H2b: notatka może wrócić, wystarczy usunąć ją ponownie): bez zmiany kodu, W14a i W14b przypięte jako
// znane ograniczenie G13, W11 przypina zdanie „Flota mieszana”. Na 12b0cd4d czerwone W14a (nagrobek D zdejmowany przy
// zapisie, ręczne usunięcie wygrywało) i W11 (stare O zachowywało n1 z poprawką B i traciło tylko n2); W14b zielony na
// obu.
describe('P-NOTATKI-ZA-KARTA — przegląd poprawki MS2: ręczne usunięcie przy G13 (W14a, W14b) i stare nieświadome urządzenie (W11)', () => {
  // G13 + CZEKA: n1 (treść tresc) zapisana na A z zegarem +1 h i rozesłana; A usuwa pacjenta; urządzenia z listy
  // czekaja dostają same nagrobki notatek (ładunek A bez kart i nagrobków kart).
  async function g13Czeka(urz, czekaja, tresc) {
    const x = await przygotuj(urz);
    await n1ZPrzyszlosci(x, Object.keys(urz), tresc);
    przesun(60e3); await x.urz.A.v.removePatient(x.pid);
    x.e = (await nagrobekKarty(x.urz.A, x.pid)).deletedAtISO;
    x.R = (await nagrobekNotatkiM(x.urz.A, x, 'n1')).deletedAtISO;
    expect(x.R > x.e, 'G13: R > e').toBe(true);
    const lad = { ...kopia(await x.urz.A.v.exportSyncPayload()), patients: [], tombstones: [] };
    for (const k of czekaja) { przesun(1000); await x.urz[k].scal(lad); }
    return x;
  }
  const n1Na = async (d, x) => (await d.v.listAllPatientNotes()).find((n) => n.id === x.id('n1')) || null;
  const po = (iso, x) => Date.parse(iso) - Date.parse(x.R) - 1;

  // W14 [znane ograniczenie G13] (wer-kod, fuzz różnicowy bez sieci, ziarno 1215; flota samych nowych). B dopisuje
  // wizytę i ratuje n1 (u_B = R + 1 ms + h_B), A dostaje tę wersję. D „czeka” i poprawia n1 (rev 3, zapis < R): (a) po
  // wizycie — nowa gałąź MS2 (karta > e, zapis ≤ R), (b) przed wizytą — stara gałąź CZEKA; w obu nagrobek z polem
  // zostaje na D z chwilą R. A — kilka minut po „Usuń pacjenta” według każdego zegara — ręcznie usuwa n1: nagrobek bez
  // pola z chwilą max(teraz, u_B) = u_B, bo u_B jest z przyszłości. D scala ładunek B sprzed tego usunięcia i ratuje
  // swoją poprawkę (wyższy rev, krok 2) na R + 1 ms + h_D. Przy h_D > h_B (około połowa treści) poprawka D wygrywa z
  // ręcznym usunięciem: n1 wraca wszędzie, zbieżnie i stabilnie (widoczna; ponowne ręczne usunięcie — tu na B —
  // wygrywa, bo nagrobków z polem już nie ma); przy h_D < h_B usunięcie wygrywa od razu. Gałąź (b) istniała przed MS2;
  // MS2 rozszerza ją na kolejność „wizyta, potem poprawka” (a). Na 12b0cd4d w (a) nagrobek D był przy zapisie
  // zdejmowany, poprawka zostawała z chwilą < R i usunięcie wygrywało — ale przy starym urządzeniu ta sama poprawka
  // ginęła przy żywej karcie (S8b). Wariant kodu (ręczny nagrobek wersji z przyszłości na u + 1 s, Eb) zmieniałby
  // regułę P-NOTATKI-1 G13 — nie wdrożony.
  async function w14(kol, tresc) {
    const x = await g13Czeka({ A: {}, B: {}, D: {} }, ['B', 'D'], 'z przyszłości 1');
    const { A, B, D } = x.urz;
    await wizyta(B, x);
    await pelny(A, B); await pelny(B, A);
    const uB = (await n1Na(A, x)).updatedAtISO;
    if (kol === 'a') await wizyta(D, x);
    przesun(60e3); await D.v.savePatientNote({ id: x.id('n1'), patientId: x.pid, title: 'n1', body: tresc });
    if (kol === 'b') await wizyta(D, x);
    const nagD = await nagrobekNotatkiM(D, x, 'n1');
    przesun(60e3); await A.v.removePatientNote(x.id('n1'));
    const reczny = await nagrobekNotatkiM(A, x, 'n1');
    await pelny(B, D);
    const nD = await n1Na(D, x);
    const w = await rundy(x, ['A', 'B', 'D'], 4);
    return { x, uB, nagD, reczny, nD, w };
  }
  for (const [kol, opis] of [['a', 'wizyta, potem poprawka n1 (nowa gałąź MS2)'], ['b', 'poprawka n1 w stanie CZEKA, potem wizyta']]) {
    it(`W14${kol} [znane ograniczenie] G13: D „czeka”, ${opis}; A ręcznie usuwa uratowaną n1 → przy h_D > h_B ratunek D wygrywa i n1 wraca wszędzie, przy h_D < h_B usunięcie wygrywa`, async () => {
      const hB = hTresci(trescNowej('n1', 'z przyszłości 1'), jawneNowej());
      for (const [tresc, oczek] of [['poprawka D2', 'karta [n1=poprawka D2,n2] nagr[]'], ['poprawka D1', 'karta [n2] nagr[n1]']]) {
        const hD = hTresci(trescNowej('n1', tresc), jawneNowej());
        const r = await w14(kol, tresc);
        const { x } = r;
        expect(po(r.uB, x), 'u_B = R + 1 ms + h_B').toBe(hB);
        expect(r.nagD && [r.nagD.deletedAtISO, r.nagD.deletedWithPatient], 'nagrobek z polem zostaje na D (chwila R)').toEqual([x.R, { patientId: x.pid, deletedAtISO: x.e }]);
        expect([r.reczny.deletedAtISO, r.reczny.deletedWithPatient], 'ręczny nagrobek A: chwila u_B, bez pola').toEqual([r.uB, undefined]);
        expect([r.nD.body, r.nD.rev, po(r.nD.updatedAtISO, x)], 'ratunek D: rev 3, R + 1 ms + h_D').toEqual([tresc, 3, hD]);
        expect(r.w.zbiezne && r.w.stabilne, JSON.stringify(r.w.ost)).toBe(true);
        expect(r.w.ost.A, `h_B = ${hB}, h_D = ${hD}`).toBe(oczek);
        if (oczek.startsWith('karta [n1')) {
          // H2b: wystarczy usunąć ponownie — nikt nie ma już nagrobka z polem, więc drugie ręczne usunięcie wygrywa
          przesun(60e3); await x.urz.B.v.removePatientNote(x.id('n1'));
          const w2 = await rundy(x, ['B', 'A', 'D'], 3, ['A', 'B', 'D']);
          expect(w2.zbiezne && w2.stabilne, JSON.stringify(w2.ost)).toBe(true);
          expect(w2.ost.D, 'po ponownym ręcznym usunięciu').toBe('karta [n2] nagr[n1]');
        }
      }
    });
  }

  // W11 (wer-kod; „Flota mieszana”). Stare O nie widziało usunięcia i ma n1 i n2. B jest w nowej gałęzi MS2 (wizyta,
  // potem poprawka n1; nagrobki z polem zostają). Pełny ładunek B: stara aplikacja ucina pole, R ≥ Y, więc O kasuje
  // obie notatki, które miało. Echo O (nagrobki bez pola, te same chwile) nie odbiera pola na B, B ratuje, a O dostaje
  // notatki z powrotem z następnym ładunkiem B. Na 12b0cd4d O traciło pośrodku tylko n2 (nagrobek n1 był przy zapisie
  // zdejmowany); koniec ten sam.
  it('W11 stare nieświadome O (ma n1 i n2) dostaje pełny ładunek B w nowej gałęzi MS2 → O kasuje obie notatki do ratunku na B; potem poprawka B wszędzie', async () => {
    const x = await g13Czeka({ A: {}, B: {}, O: { stara: true } }, ['B'], 'z przyszłości');
    const { B, O } = x.urz;
    expect(await stan(O, x), 'O nie wie o usunięciu').toBe('karta [n1=z przyszłości,n2] nagr[]');
    await wizyta(B, x);
    const karta = await kartaNa(B, x);
    expect([karta > x.e, karta < x.R], 'karta B między e i R').toEqual([true, true]);
    const kiedy = przesun(60e3);
    await B.v.savePatientNote({ id: x.id('n1'), patientId: x.pid, title: 'n1', body: 'poprawka B' });
    expect(kiedy < x.R, 'zapis wcześniejszy niż R').toBe(true);
    expect(await stan(B, x), 'nowa gałąź MS2: nagrobki zostają').toBe('karta [n1=poprawka B,n2] nagr[n1+pole,n2+pole]');
    await pelny(B, O);
    expect(await stan(O, x), 'O kasuje notatki, które miało').toBe('karta [] nagr[n1,n2]');
    await pelny(O, B);
    expect(await stan(B, x), 'echo O nie odbiera pola: ratunek').toBe('karta [n1=poprawka B,n2] nagr[]');
    await pelny(B, O);
    expect(await stan(O, x), 'notatki wracają do O').toBe('karta [n1=poprawka B,n2] nagr[]');
    const w = await rundy(x, ['B', 'O', 'A'], 3);
    expect(w.zbiezne && w.stabilne, JSON.stringify(w.ost)).toBe(true);
    expect(w.ost.A).toBe('karta [n1=poprawka B,n2] nagr[]');
  });
});

/* ---------- przegląd po scaleniu: uwaga Codexa P1 (#746) i przegląd poprawki P1 ---------- */
const chwila = (ms) => new Promise((r) => { setTimeout(r, ms); });
// Druga karta przeglądarki: drugi VildaVault na tym samym magazynie urządzenia i tej samej atrapie Web Locks (jak L10).
async function drugaKarta(d, locks) {
  const o2 = owin(d.baza);
  const druga = okno({ locks }).VildaVault;
  druga.setStorageAdapter(o2.owiniety);
  await druga.unlockUser(d.uid, d.haslo);
  return { v: druga, o2 };
}
// Nagrobek, który nie pozwala na ratunek: bez pola (ręczne usunięcie) albo z polem i manualDeletedAtISO (krata M).
const nieratowalny = (t) => !!t && (!t.deletedWithPatient || typeof t.deletedWithPatient.manualDeletedAtISO === 'string');
const nagrobekId = async (d, id) => (await nagrobkiNotatek(d)).find((t) => t.id === id) || null;

// Pętla „Usuń pacjenta” (Bpu_usun) szła przez Eb bez blokady notatki, z mapą nagrobków notatek odczytaną przed listą
// notatek. Druga karta przeglądarki (drugi VildaVault na tym samym magazynie i tej samej atrapie Web Locks, jak L10)
// ręcznie usuwa notatkę po tej liście: Eb nadpisywało ręczny nagrobek polem bez manualDeletedAtISO (i z rev 0), więc
// gdy karta przeżyła usunięcie, ratunek przywracał ręcznie usuniętą notatkę (wbrew D21-2). Teraz każda notatka z pętli
// idzie pod blokadą notatki, na świeżym odczycie notatki i nagrobka (Bnp_usunZPacjentem); notatki, której już nie ma,
// pętla nie kasuje, tylko odnawia nagrobek z ważnym polem tego pacjenta (Bnp_odnowJeden, jak F1). [CZERWONY na
// 95b6f96e]: P1-0, P1-1, P1-2, P1-2b, P1-3, P1-5, P1-5b, P1-6, S1 [po liście] i dwa strażniki źródła; przed D-21
// (affdeb64) przeplot z ręcznym usunięciem nie miał skutku klinicznego (notatki nie wracały wcale, jedynie rev nagrobka
// spadał do 0), a P1-6 kończył się tak samo jak na 95b6f96e.
describe('P-NOTATKI-ZA-KARTA — przegląd po scaleniu: uwaga Codexa P1 („Usuń pacjenta” a druga karta przeglądarki)', () => {

  it('P1-0 [CZERWONY na 95b6f96e] pętla „Usuń pacjenta” bierze blokadę notatki (vilda-note-<id>) dla każdej usuwanej notatki', async () => {
    const locks = atrapaLocks();
    const x = await przygotuj({ A: { locks }, B: {} });
    locks.zadania.length = 0;
    przesun(60e3); await x.urz.A.v.removePatient(x.pid);
    const notatkowe = locks.zadania.filter((n) => n.startsWith('vilda-note-') && n !== 'vilda-note-kosz-zapisow').sort();
    expect(notatkowe, 'blokady notatek w „Usuń pacjenta”').toEqual([`vilda-note-${x.id('n1')}`, `vilda-note-${x.id('n2')}`].sort());
  });

  it('P1-1 [CZERWONY na 95b6f96e] druga karta ręcznie usuwa n1 po liście notatek w Bpu_usun, B dopisuje wizytę → n1 nie wraca z kartą, ręczny nagrobek zostaje (rev bez zmian)', async () => {
    const locks = atrapaLocks();
    const x = await przygotuj({ A: { locks }, B: {} });
    const { A, B } = x.urz;
    const { v: druga } = await drugaKarta(A, locks);
    const id1 = x.id('n1');
    const p1 = A.pulapka('listPatientNotesForUser', () => true); // po mapie nagrobków i liście notatek, przed n1
    przesun(60e3);
    const usun = A.v.removePatient(x.pid);
    await p1.osiagnieta;
    przesun(5);
    await druga.removePatientNote(id1); // Ac(n1) w drugiej karcie: na 95b6f96e blokada wolna
    const reczny = await nagrobekId(A, id1);
    expect(reczny && !reczny.deletedWithPatient, 'kontrola: ręczny nagrobek bez pola').toBe(true);
    przesun(5);
    p1.zwolnij(); await usun;
    const po = await nagrobekId(A, id1);
    expect(nieratowalny(po), 'nagrobek n1 po „Usuń pacjenta”: ' + JSON.stringify(po)).toBe(true);
    expect(po.rev || 0, 'rev nagrobka nie cofa się (G6)').toBe(reczny.rev);
    await wizyta(B, x); // B nie wie o usunięciu — karta przeżywa (P-ZMIANA-W-KARCIE)
    const w = await rundy(x, ['A', 'B'], 4);
    expect(w.zbiezne && w.stabilne, JSON.stringify(w.ost)).toBe(true);
    expect(w.ost.A, 'n1 usunięta ręcznie nie wraca, n2 wraca z kartą').toMatch(/^karta \[n2\] nagr\[n1(\+pole\+r)?\]$/);
  });

  it('P1-1k [kontrola] ręczne usunięcie n1 w drugiej karcie PRZED „Usuń pacjenta” → n1 nie wraca (wynik P1-1 nie zależy od przeplotu)', async () => {
    const locks = atrapaLocks();
    const x = await przygotuj({ A: { locks }, B: {} });
    const { A, B } = x.urz;
    const { v: druga } = await drugaKarta(A, locks);
    przesun(60e3); await druga.removePatientNote(x.id('n1'));
    przesun(10); await A.v.removePatient(x.pid);
    await wizyta(B, x);
    const w = await rundy(x, ['A', 'B'], 4);
    expect(w.zbiezne && w.stabilne, JSON.stringify(w.ost)).toBe(true);
    expect(w.ost.A).toMatch(/^karta \[n2\] nagr\[n1(\+pole\+r)?\]$/);
  });

  it('P1-2 [CZERWONY na 95b6f96e] druga karta ręcznie usuwa n1 w trakcie usuwania n1 przez „Usuń pacjenta” (po odczycie notatki) → ręczne usunięcie czeka na blokadę n1, n1 nie wraca', async () => {
    const locks = atrapaLocks();
    const x = await przygotuj({ A: { locks }, B: {} });
    const { A, B } = x.urz;
    const { v: druga } = await drugaKarta(A, locks);
    const id1 = x.id('n1');
    const p1 = A.pulapka('getPatientNoteForUser', (_u, id) => id === id1 && (A.licz.listPatientNotesForUser || 0) > 0);
    A.zeruj();
    przesun(60e3);
    const usun = A.v.removePatient(x.pid);
    await p1.osiagnieta;
    przesun(5);
    let skonczone = false;
    const r2 = druga.removePatientNote(id1).then(() => { skonczone = true; });
    await chwila(30);
    expect(skonczone, 'ręczne usunięcie czeka na blokadę n1').toBe(false);
    przesun(5);
    p1.zwolnij(); await usun; await r2;
    expect(nieratowalny(await nagrobekId(A, id1)), 'nagrobek n1').toBe(true);
    await wizyta(B, x);
    const w = await rundy(x, ['A', 'B'], 4);
    expect(w.zbiezne && w.stabilne, JSON.stringify(w.ost)).toBe(true);
    expect(w.ost.A).toMatch(/^karta \[n2\] nagr\[n1(\+pole\+r)?\]$/);
  });

  // P1-2b: ręczne usunięcie między świeżym odczytem nagrobka (Bnp_poleEb) a zapisem nagrobka z polem — sam świeży
  // odczyt bez blokady notatki tego nie zamyka. Na 95b6f96e pętla nie czyta pojedynczego nagrobka (mapa), więc pułapka
  // nie zadziała.
  it('P1-2b [CZERWONY na 95b6f96e] druga karta ręcznie usuwa n1 między odczytem nagrobka a zapisem nagrobka z polem → n1 nie wraca', async () => {
    const locks = atrapaLocks();
    const x = await przygotuj({ A: { locks }, B: {} });
    const { A, B } = x.urz;
    const { v: druga } = await drugaKarta(A, locks);
    const id1 = x.id('n1');
    const p1 = A.pulapka('getPatientNoteTombstoneForUser', (_u, id) => id === id1);
    A.zeruj();
    przesun(60e3);
    const usun = A.v.removePatient(x.pid);
    const doszlo = await Promise.race([p1.osiagnieta.then(() => true), usun.then(() => false)]);
    przesun(5);
    const r2 = druga.removePatientNote(id1);
    await chwila(30);
    przesun(5);
    p1.zwolnij(); await usun; await r2;
    expect(doszlo, 'świeży odczyt nagrobka n1 w „Usuń pacjenta”').toBe(true);
    expect(nieratowalny(await nagrobekId(A, id1)), 'nagrobek n1').toBe(true);
    await wizyta(B, x);
    const w = await rundy(x, ['A', 'B'], 4);
    expect(w.zbiezne && w.stabilne, JSON.stringify(w.ost)).toBe(true);
    expect(w.ost.A).toMatch(/^karta \[n2\] nagr\[n1(\+pole\+r)?\]$/);
  });

  it('P1-3 [CZERWONY na 95b6f96e] jak P1-1, B dostaje nagrobki notatek z A deltami (ls) → po deltach i rundach n1 nie wraca', async () => {
    const locks = atrapaLocks();
    const x = await przygotuj({ A: { locks }, B: {} });
    const { A, B } = x.urz;
    nagrywaj(A);
    const { v: druga } = await drugaKarta(A, locks);
    const p1 = A.pulapka('listPatientNotesForUser', () => true);
    przesun(60e3);
    const usun = A.v.removePatient(x.pid);
    await p1.osiagnieta;
    przesun(5); await druga.removePatientNote(x.id('n1')); // delta drugiej karty idzie jej kanałem — tu jej nie ma (S2)
    przesun(5); p1.zwolnij(); await usun;
    await wizyta(B, x);
    await dostarcz(A, B, (t) => t === 'nagrNot'); // karta B jest późniejsza niż e
    const sB = await stan(B, x);
    const w = await rundy(x, ['B', 'A'], 4);
    expect(w.zbiezne && w.stabilne, JSON.stringify(w.ost)).toBe(true);
    expect(w.ost.A, 'B po deltach: ' + sB).toMatch(/^karta \[n2\] nagr\[n1(\+pole\+r)?\]$/);
  });

  // S2: delta ręcznego usunięcia z drugiej karty (ls, zbudowana od razu, jak Ut w vilda_sync_integration.js) dochodzi do
  // B przed ładunkiem A — krata B ma M, więc n1 nie wraca także na 95b6f96e. Łagodzi P1, gdy delta wyjdzie i dojdzie
  // (synchronizacja włączona, sieć); bez niej — P1-1.
  it('S2 [kontrola] jak P1-1, delta ręcznego usunięcia z drugiej karty (zbudowana przed nadpisaniem) dochodzi do B → n1 nie wraca', async () => {
    const locks = atrapaLocks();
    const x = await przygotuj({ A: { locks }, B: {} });
    const { A, B } = x.urz;
    const { v: druga } = await drugaKarta(A, locks);
    const delty2 = [];
    druga.onPatientNoteChanged((e) => { if (e && e.action === 'delete') delty2.push(Promise.resolve().then(() => druga.buildNoteTombstoneDelta(e.id, e.deletedAtISO))); });
    const p1 = A.pulapka('listPatientNotesForUser', () => true);
    przesun(60e3);
    const usun = A.v.removePatient(x.pid);
    await p1.osiagnieta;
    przesun(5); await druga.removePatientNote(x.id('n1'));
    const d2 = await Promise.all(delty2);
    przesun(5); p1.zwolnij(); await usun;
    expect(d2.length).toBe(1);
    for (const q of d2) { przesun(1000); await B.scal(kopia(await druga.decryptPayloadForCurrentUser(q.iv, q.data))); }
    await wizyta(B, x);
    const w = await rundy(x, ['A', 'B'], 4);
    expect(w.zbiezne && w.stabilne, JSON.stringify(w.ost)).toBe(true);
    expect(w.ost.A).toMatch(/^karta \[n2\] nagr\[n1(\+pole\+r)?\]$/);
  });

  // P1-5 (druga połowa uwagi: świeży nagrobek pod blokadą notatki). Notatka jest i leży obok nagrobka z polem (CZEKA).
  // Scalanie w drugiej karcie decyduje CZEKA przed „Usuń pacjenta”, a kanon z M (ręczne usunięcie z B, M < Y) zapisuje
  // po odczycie mapy w Bpu_usun, przed n2 — Eb z mapą sprzed listy nie przenosiło M (T29 w wyścigu).
  it('P1-5 [CZERWONY na 95b6f96e] kanon „czeka” z M zapisany w drugiej karcie po odczycie mapy → nowy nagrobek n2 z „Usuń pacjenta” przenosi M', async () => {
    const locks = atrapaLocks();
    const x = await przygotuj({ A: {}, B: {}, C: { locks } });
    const { A, B, C } = x.urz;
    const id2 = x.id('n2');
    przesun(60e3); await B.v.removePatientNote(id2);
    const m = (await nagrobekId(B, id2)).deletedAtISO;
    przesun(60e3); await C.v.savePatientNote({ id: id2, patientId: x.pid, title: 'n2', body: 'poprawka C' });
    przesun(60e3); await A.v.removePatient(x.pid);
    przesun(5e3); await C.scal({ ...kopia(await A.v.exportSyncPayload()), tombstones: [] });
    expect(await stan(C, x)).toBe('karta [n1,n2=poprawka C] nagr[n1+pole,n2+pole]');
    const { v: druga, o2 } = await drugaKarta(C, locks);
    const ladB = { ...kopia(await B.v.exportSyncPayload()), patients: [], tombstones: [] };
    const q = o2.pulapka('getPatientForUser', (_u, pid) => pid === x.pid && (o2.licz.listPatientNoteTombstonesForUser || 0) > 0);
    przesun(1000);
    const scal2 = druga.mergeSyncPayload(ladB);
    await q.osiagnieta; // decyzja w drugiej karcie: karta jest, nie późniejsza niż e → CZEKA (n2 z M)
    const p1 = C.pulapka('listPatientNotesForUser', () => true);
    przesun(1000);
    const usun = C.v.removePatient(x.pid);
    await p1.osiagnieta; // Bpu_usun: mapa nagrobków (bez M) i lista notatek odczytane
    q.zwolnij(); await scal2;
    expect((await nagrobekId(C, id2)).deletedWithPatient.manualDeletedAtISO, 'kontrola: kanon z M zapisany w drugiej karcie').toBe(m);
    p1.zwolnij(); await usun;
    const e2 = (await nagrobekKarty(C, x.pid)).deletedAtISO;
    expect((await nagrobekId(C, id2)).deletedWithPatient).toEqual({ patientId: x.pid, deletedAtISO: e2, manualDeletedAtISO: m });
  });

  // P1-5b: to samo w odnowieniu (Bnp_odnow, gałąź „notatka wróciła pod tego pacjenta → Eb”). C nie zna n2 (powstała na A
  // po ostatniej wymianie z C), ma tylko jej nagrobek z polem — kandydat odnowienia. Druga karta wpisuje n2 (poprawka A
  // sprzed usunięcia) z kanonem „czeka” z M (ręczne usunięcie z B) po liście notatek w Bpu_usun, przed odnowieniem.
  it('P1-5b [CZERWONY na 95b6f96e] odnowienie: druga karta wpisuje n2 z kanonem „czeka” z M po liście notatek → nagrobek n2 z „Usuń pacjenta” przenosi M', async () => {
    const locks = atrapaLocks();
    const x = await przygotuj({ A: {}, B: {}, C: { locks } }, ['n1']);
    const { A, B, C } = x.urz;
    przesun(1000); const n2 = await A.v.savePatientNote({ patientId: x.pid, title: 'n2', body: 'fikcja n2' });
    const id2 = n2.id; x.nn[id2] = 'n2';
    await pelny(A, B);
    przesun(60e3); await B.v.removePatientNote(id2);
    const m = (await nagrobekId(B, id2)).deletedAtISO;
    przesun(60e3); await A.v.savePatientNote({ id: id2, patientId: x.pid, title: 'n2', body: 'poprawka A' });
    const wersjaA = kopia(await A.v.exportSyncPayload()).patientNotes.filter((n) => n.id === id2);
    przesun(60e3); await A.v.removePatient(x.pid);
    przesun(5e3); await C.scal({ ...kopia(await A.v.exportSyncPayload()), tombstones: [] });
    expect(await stan(C, x), 'C: karta bez n2, nagrobek n2 z polem').toBe('karta [n1] nagr[n1+pole,n2+pole]');
    const { v: druga, o2 } = await drugaKarta(C, locks);
    const lad = { ...kopia(await B.v.exportSyncPayload()), patients: [], tombstones: [], patientNotes: wersjaA };
    const q = o2.pulapka('getPatientForUser', (_u, pid) => pid === x.pid && (o2.licz.listPatientNoteTombstonesForUser || 0) > 0);
    przesun(1000);
    const scal2 = druga.mergeSyncPayload(lad);
    await q.osiagnieta; // decyzja w drugiej karcie: karta jest, nie późniejsza niż e → CZEKA (n2 z M)
    const p1 = C.pulapka('listPatientNotesForUser', () => true);
    przesun(1000);
    const usun = C.v.removePatient(x.pid);
    await p1.osiagnieta; // Bpu_usun: mapa (n2 bez M) i lista notatek (bez n2) odczytane
    q.zwolnij(); await scal2;
    expect(await stan(C, x), 'kontrola: druga karta wpisała n2 obok kanonu z M').toBe('SIEROTY [n1,n2=poprawka A] nagr[n1+pole,n2+pole+r]');
    p1.zwolnij(); await usun;
    const e2 = (await nagrobekKarty(C, x.pid)).deletedAtISO;
    expect((await nagrobekId(C, id2)).deletedWithPatient).toEqual({ patientId: x.pid, deletedAtISO: e2, manualDeletedAtISO: m });
    expect(await stan(C, x)).toBe('BRAK [] nagr[n1+pole,n2+pole+r]');
  });

  // P1-6: notatka przepięta pod innego pacjenta po liście notatek (druga karta scala ładunek, w którym „Scal pacjentów”
  // X→Y na B przepięło n1 pod Y). Na 95b6f96e Eb kasowało n1 — już notatkę Y — i stawiało nagrobek z polem X, a ten
  // kasował ją potem także na B (karty X tam nie ma). Teraz pętla jej nie rusza, jak notatki przepiętej przed listą.
  // n2 (przepięta na B przed „Usuń pacjenta” na A) ginie jak dotąd — „Scal pacjentów” równolegle z „Usuń pacjenta” (SP1g).
  it('P1-6 [CZERWONY na 95b6f96e] druga karta wpisuje n1 przepiętą pod Y po liście notatek → n1 zostaje pod Y, bez nagrobka; po rundach n1 pod Y na A i B', async () => {
    const locks = atrapaLocks();
    const x = await przygotuj({ A: { locks }, B: {} });
    const { A, B } = x.urz;
    przesun(60e3);
    const y = await A.v.savePatient({ name: 'Testowa Ewa', user: { lastName: 'Testowa', firstName: 'Ewa', dobISO: '2015-05-05', sex: 'K', height: 120, weight: 22 } }, { dedup: false });
    await x.c.sync(A); await x.c.sync(B);
    przesun(60e3); expect((await B.v.mergePatients(x.pid, y.patientId)).notesMoved).toBe(2);
    const id1 = x.id('n1');
    const n1Y = kopia(await B.v.exportSyncPayload()).patientNotes.filter((n) => n.id === id1);
    const lad = { schemaVersion: 2, patients: [], tombstones: [], notes: [], noteTombstones: [], patientNotes: n1Y, patientNoteTombstones: [] };
    const { v: druga } = await drugaKarta(A, locks);
    const p1 = A.pulapka('listPatientNotesForUser', () => true);
    przesun(60e3);
    const usun = A.v.removePatient(x.pid);
    await p1.osiagnieta; // lista: n1 i n2 pod X
    przesun(5); await druga.mergeSyncPayload(lad);
    przesun(5); p1.zwolnij(); await usun;
    const pod = async (d, pid) => (await d.v.listAllPatientNotes()).filter((n) => n.patientId === pid).map((n) => x.nn[n.id]).sort();
    expect(await pod(A, y.patientId), 'n1 pod Y na A').toEqual(['n1']);
    expect(await nagrobekId(A, id1), 'bez nagrobka n1').toBe(null);
    await rundy(x, ['A', 'B'], 3);
    expect([await pod(A, y.patientId), await pod(B, y.patientId)], 'n1 pod Y na A i B').toEqual([['n1'], ['n1']]);
  });

  // P1-7: błąd odczytu notatki w pętli nie wstrzymuje usunięcia (Eb jak dotąd); pilnuje, żeby brak odczytu nie był
  // traktowany jak brak notatki.
  it('P1-7 [kontrola] błąd odczytu n1 w „Usuń pacjenta” → n1 usunięta z nagrobkiem z polem (jak dotąd)', async () => {
    const x = await przygotuj({ A: {}, B: {} });
    const { A } = x.urz;
    const id1 = x.id('n1'), orig = A.baza.getPatientNoteForUser;
    A.baza.getPatientNoteForUser = async function (u, id) { if (id === id1) throw new Error('awaria odczytu (test)'); return orig.call(this, u, id); };
    try { przesun(60e3); await A.v.removePatient(x.pid); } finally { A.baza.getPatientNoteForUser = orig; }
    const e = (await nagrobekKarty(A, x.pid)).deletedAtISO;
    expect((await nagrobekId(A, id1)).deletedWithPatient).toEqual({ patientId: x.pid, deletedAtISO: e });
    const w = await rundy(x, ['A', 'B'], 3);
    expect(w.zbiezne && w.stabilne, JSON.stringify(w.ost)).toBe(true);
    expect(w.ost.A).toBe('BRAK [] nagr[n1+pole,n2+pole]');
  });

  // S1 (sceptyk P1): scalanie w drugiej karcie w oknie pętli kasuje n1 starym nagrobkiem z polem (e1, R1; wersja n1
  // w paśmie (R1, R1 + 1 s], karty już nie ma, więc „usuń”). Stare C (emulacja 346dd81a) nie zna kroku „pasmo bez karty”
  // — chroni je tylko nagrobek późniejszy niż wersja n1. Po liście notatek: notatki już nie ma, pętla odnawia nagrobek
  // (Bnp_odnowJeden: chwila po paśmie, nowe e, rev bez zmian); na 95b6f96e Eb zapisywało świeży nagrobek z rev 0, a samo
  // pominięcie brakującej notatki (bez odnowienia) zostawiało (R1, e1) i sierotę n1 na C. Przed listą (między odczytem
  // mapy a listą notatek) n1 nie ma ani w liście, ani wśród kandydatów odnowienia — nagrobek (R1, e1) zostaje, stare C
  // ma sierotę n1 (znane ograniczenie, tak samo na 95b6f96e; obszar D21-8).
  async function s1(przedLista) {
    const locks = atrapaLocks();
    const x = await przygotuj({ A: { locks }, B: {}, C: { stara: true } });
    const { A } = x.urz;
    const { v: druga } = await drugaKarta(A, locks);
    const id1 = x.id('n1');
    const u = (await A.baza.listPatientNotesForUser(A.uid)).find((n) => n.id === id1).updatedAtISO;
    const R1 = new Date(Date.parse(u) - 500).toISOString(), e1 = new Date(Date.parse(u) - 600).toISOString();
    const lad = { ...kopia(await A.v.exportSyncPayload()), patients: [], tombstones: [], patientNotes: [],
      patientNoteTombstones: [{ id: id1, deletedAtISO: R1, deletedWithPatient: { patientId: x.pid, deletedAtISO: e1 } }] };
    const p1 = A.pulapka(przedLista ? 'listPatientNoteTombstonesForUser' : 'listPatientNotesForUser', () => true);
    przesun(60e3);
    const usun = A.v.removePatient(x.pid);
    await p1.osiagnieta;
    przesun(5); await druga.mergeSyncPayload(lad);
    const scalony = await nagrobekId(A, id1);
    expect((await A.baza.listPatientNotesForUser(A.uid)).some((n) => n.id === id1), 'kontrola: druga karta skasowała n1').toBe(false);
    expect([scalony.deletedAtISO, scalony.deletedWithPatient], 'kontrola: nagrobek (R1, e1)').toEqual([R1, { patientId: x.pid, deletedAtISO: e1 }]);
    przesun(5); p1.zwolnij(); await usun;
    return { x, R1, scalony, po: await nagrobekId(A, id1), e: (await nagrobekKarty(A, x.pid)).deletedAtISO, w: await rundy(x, ['A', 'B', 'C'], 4) };
  }
  it('S1 [CZERWONY na 95b6f96e] scalanie w drugiej karcie po liście notatek kasuje n1 starym nagrobkiem z polem → nagrobek odnowiony (nowe e, po paśmie, rev bez zmian); stare C bez sierot', async () => {
    const { x, R1, scalony, po, e, w } = await s1(false);
    expect(po.deletedWithPatient, 'pole z nowym e').toEqual({ patientId: x.pid, deletedAtISO: e });
    expect(Date.parse(po.deletedAtISO) > Date.parse(R1) + 1000, 'chwila po paśmie ratunku').toBe(true);
    expect(po.rev || 0, 'rev nagrobka nie cofa się (G6)').toBe(scalony.rev);
    expect(w.stabilne, JSON.stringify(w.ost)).toBe(true);
    expect(w.ost).toEqual({ A: 'BRAK [] nagr[n1+pole,n2+pole]', B: 'BRAK [] nagr[n1+pole,n2+pole]', C: 'BRAK [] nagr[n1,n2]' });
  });
  it('S1 [znane ograniczenie, tak samo na 95b6f96e] scalanie w drugiej karcie między odczytem mapy nagrobków a listą notatek → nagrobek (R1, e1) zostaje, stare C z sierotą n1', async () => {
    const { R1, po, w } = await s1(true);
    expect(po.deletedAtISO, 'nagrobek n1 bez odnowienia').toBe(R1);
    expect(w.stabilne, JSON.stringify(w.ost)).toBe(true);
    expect(w.ost).toEqual({ A: 'BRAK [] nagr[n1+pole,n2+pole]', B: 'BRAK [] nagr[n1+pole,n2+pole]', C: 'SIEROTY [n1] nagr[n2]' });
  });

  // Pokrewne, poza P1 (przed D-21 tak samo): „Usuń pacjenta” kasuje kartę na początku, a nagrobek karty zapisuje dopiero
  // po pętli notatek i odnowieniu; strażnik savePatientNote (P-NOTATKI-1 D2) patrzy na nagrobek karty. Zapis n1 w drugiej
  // karcie w tym oknie przechodzi i zostawia sierotę: na 95b6f96e ze STARĄ treścią (Eb kasuje nową wersję, Bnp_poZapisie
  // bez karty zdejmuje nagrobek z polem, B odsyła starą n1), teraz z edycją (zapis czeka na blokadę n1 i wchodzi po Eb,
  // przed nagrobkiem karty). Po zapisaniu nagrobka karty zapis jest odrzucany (P1-4k).
  it('P1-4k [kontrola] zapis n1 w drugiej karcie PO „Usuń pacjenta” → odmowa „pacjent został usunięty”, bez sierot', async () => {
    const locks = atrapaLocks();
    const x = await przygotuj({ A: { locks }, B: {} });
    const { v: druga } = await drugaKarta(x.urz.A, locks);
    przesun(60e3); await x.urz.A.v.removePatient(x.pid);
    przesun(5);
    await expect(druga.savePatientNote({ id: x.id('n1'), patientId: x.pid, title: 'n1', body: 'edycja w drugiej karcie' })).rejects.toThrow(/pacjent został usunięty/);
    const w = await rundy(x, ['A', 'B'], 3);
    expect(w.zbiezne && w.stabilne, JSON.stringify(w.ost)).toBe(true);
    expect(w.ost.A).toBe('BRAK [] nagr[n1+pole,n2+pole]');
  });
  it('P1-4 [znane ograniczenie, przed D-21 też] zapis n1 w drugiej karcie w trakcie „Usuń pacjenta” (przed nagrobkiem karty) → sierota n1', async () => {
    const locks = atrapaLocks();
    const x = await przygotuj({ A: { locks }, B: {} });
    const { A } = x.urz;
    const { v: druga, o2 } = await drugaKarta(A, locks);
    const id1 = x.id('n1');
    const p1 = A.pulapka('getPatientNoteForUser', (_u, id) => id === id1 && (A.licz.listPatientNotesForUser || 0) > 0);
    const q1 = o2.pulapka('putPatientNoteForUser', (_u, n) => n && n.id === id1); // po zapisie notatki, przed Bnp_poZapisie
    A.zeruj();
    przesun(60e3);
    const usun = A.v.removePatient(x.pid);
    await p1.osiagnieta;
    przesun(5);
    const zapis = druga.savePatientNote({ id: id1, patientId: x.pid, title: 'n1', body: 'edycja w drugiej karcie' }).catch((er) => er);
    await chwila(30);
    p1.zwolnij(); await usun;
    q1.zwolnij();
    expect(await zapis, 'zapis w drugiej karcie przechodzi').not.toBeInstanceOf(Error);
    const w = await rundy(x, ['A', 'B'], 3);
    expect(w.zbiezne && w.stabilne, JSON.stringify(w.ost)).toBe(true);
    expect(w.ost.A).toMatch(/^SIEROTY \[n1(=edycja w drugiej karcie)?\] nagr\[n2\+pole\]$/);
  });
});

/* ---------- przegląd poprawki P1 (recenzje: współbieżność F1; reguły R1, R2; F2 — blok K9 z #754) ---------- */
// F1 (recenzja współbieżności): ta sama klasa co uwaga Codexa P1, ale w scalaniu (Le, sekcja notatek, pętla zapisu
// nagrobków U), którą idą pobranie, delty, „Scal kopię konta” i import, także w tle w tej samej karcie. Decyzja „usuń”
// albo „zostaw” zapada na odczycie nagrobków K ze startu sekcji; pod blokadą notatki pętla czytała świeżo tylko notatkę,
// a nagrobek zapisywała z R, polem i rev sprzed scalania. Ręczne usunięcie albo „Usuń pacjenta” w tym oknie (druga karta
// albo ta sama) było nadpisywane: ręczny nagrobek — nagrobkiem z polem bez M (karta przeżywa, ratunek przywraca ręcznie
// usuniętą notatkę wbrew D21-2; na affdeb64 nagrobek bez pola, nic nie wraca), nagrobek z e2 — starym (R1, e1) (stare
// urządzenie z sierotą: S1 „po pętli”), rev — cofnięty (G6). Teraz pod tą samą blokadą świeży rekord nagrobka łączony
// kratą z kopiami z ładunku i z K (Bnp_nagrobekScalania). [CZERWONY na 95b6f96e] (i na 83c04d5b, pierwszym commicie
// poprawki P1): K1 [w trakcie], K1b, K1m, K2 i strażnik źródła Le. R2: P1-8 [CZERWONY na 95b6f96e]. R1 — znane
// ograniczenie (opis przy testach), tak samo na 95b6f96e. F2 poprawione osobno (#754, Bsl_usunPacjenta) — blok K9 niżej;
// testy K9, K9k i K9d tej gałęzi (F2 jako znane ograniczenie) zastąpił przy scaleniu audyt blok K9 z #754.
describe('P-NOTATKI-ZA-KARTA — przegląd poprawki P1: scalanie w oknie ręcznego usunięcia (F1), nagrobek innego pacjenta (R2), pasmo w drugiej karcie (R1)', () => {
  // B usuwa X; A scala ładunek B: karta X znika, dla n1 decyzja „usuń” (pole, karty nie ma). kiedy: 'przed' albo 'po'
  // scaleniu, 'w trakcie' — po odczycie K, przed zapisem nagrobka. sposob: 'reczne' — removePatientNote w drugiej albo
  // tej samej karcie; 'LM' — druga karta scala ręczny nagrobek n1 z innego urządzenia (bez pola, rev 3). C (nie wie
  // o usunięciu) dopisuje wizytę — karta przeżywa.
  async function k1(kiedy, { tenSama = false, sposob = 'reczne' } = {}) {
    const locks = atrapaLocks();
    const x = await przygotuj({ A: { locks }, B: {}, C: {} });
    const { A, B, C } = x.urz;
    const druga = tenSama ? A.v : (await drugaKarta(A, locks)).v;
    const id1 = x.id('n1');
    przesun(60e3); await B.v.removePatient(x.pid);
    const ladB = kopia(await B.v.exportSyncPayload());
    const usunN1 = async () => {
      if (sposob === 'reczne') { await druga.removePatientNote(id1); return; }
      await druga.mergeSyncPayload({ schemaVersion: 2, patients: [], tombstones: [], notes: [], noteTombstones: [], patientNotes: [],
        patientNoteTombstones: [{ id: id1, deletedAtISO: new Date(zegar).toISOString(), rev: 3 }] });
    };
    if (kiedy === 'przed') { przesun(1000); await usunN1(); }
    A.zeruj();
    const p = A.pulapka('listPatientNoteTombstonesForUser', () => (A.licz.listPatientNotesForUser || 0) > 0); // K w Le
    przesun(5e3);
    const scal = A.v.mergeSyncPayload(ladB);
    const doszlo = await Promise.race([p.osiagnieta.then(() => true), scal.then(() => false)]);
    let reczny = null;
    if (kiedy === 'w trakcie') { przesun(5); await usunN1(); reczny = await nagrobekId(A, id1); }
    p.zwolnij(); await scal;
    if (kiedy === 'po') { przesun(1000); await usunN1(); }
    const po = await nagrobekId(A, id1);
    await wizyta(C, x);
    const w = await rundy(x, ['A', 'C', 'B'], 4);
    return { doszlo, reczny, po, w };
  }
  const bezN1 = /^karta \[n2\] nagr\[n1(\+pole\+r)?\]$/;
  it('K1 [kontrola] ręczne usunięcie n1 w drugiej karcie przed scaleniem ładunku z „Usuń pacjenta” → n1 nie wraca', async () => {
    const { w } = await k1('przed');
    expect(w.zbiezne && w.stabilne, JSON.stringify(w.ost)).toBe(true);
    expect(w.ost.A).toMatch(bezN1);
  });
  it('K1 [kontrola] ręczne usunięcie n1 w drugiej karcie po scaleniu → n1 nie wraca', async () => {
    const { w } = await k1('po');
    expect(w.zbiezne && w.stabilne, JSON.stringify(w.ost)).toBe(true);
    expect(w.ost.A).toMatch(bezN1);
  });
  it('K1 [CZERWONY na 95b6f96e] ręczne usunięcie n1 w drugiej karcie w trakcie scalania (po decyzji „usuń”, przed zapisem nagrobka) → ręczny nagrobek zostaje, n1 nie wraca', async () => {
    const { doszlo, reczny, po, w } = await k1('w trakcie');
    expect(doszlo, 'pułapka w sekcji notatek Le').toBe(true);
    expect(reczny && !reczny.deletedWithPatient, 'kontrola: ręczny nagrobek bez pola').toBe(true);
    expect([po.deletedAtISO, po.deletedWithPatient || null, po.rev || 0], 'nagrobek n1 po scaleniu = ręczny').toEqual([reczny.deletedAtISO, null, reczny.rev || 0]);
    expect(w.zbiezne && w.stabilne, JSON.stringify(w.ost)).toBe(true);
    expect(w.ost.A).toMatch(bezN1);
  });
  it('K1b [CZERWONY na 95b6f96e] ta sama karta: ręczne usunięcie n1 w trakcie scalania w tle → ręczny nagrobek zostaje, n1 nie wraca', async () => {
    const { doszlo, reczny, po, w } = await k1('w trakcie', { tenSama: true });
    expect(doszlo, 'pułapka w sekcji notatek Le').toBe(true);
    expect(reczny && !reczny.deletedWithPatient, 'kontrola: ręczny nagrobek bez pola').toBe(true);
    expect([po.deletedAtISO, po.deletedWithPatient || null, po.rev || 0], 'nagrobek n1 po scaleniu = ręczny').toEqual([reczny.deletedAtISO, null, reczny.rev || 0]);
    expect(w.zbiezne && w.stabilne, JSON.stringify(w.ost)).toBe(true);
    expect(w.ost.A).toMatch(bezN1);
  });
  it('K1m [CZERWONY na 95b6f96e] druga karta scala w tym oknie ręczny nagrobek n1 z innego urządzenia (rev 3) → nagrobek bez pola z rev 3, n1 nie wraca', async () => {
    const { doszlo, reczny, po, w } = await k1('w trakcie', { sposob: 'LM' });
    expect(doszlo, 'pułapka w sekcji notatek Le').toBe(true);
    expect([reczny.deletedWithPatient || null, reczny.rev], 'kontrola: druga karta zapisała ręczny nagrobek z rev 3').toEqual([null, 3]);
    expect([po.deletedAtISO, po.deletedWithPatient || null, po.rev], 'nagrobek n1 po scaleniu (rev nie cofa się, G6)').toEqual([reczny.deletedAtISO, null, 3]);
    expect(w.zbiezne && w.stabilne, JSON.stringify(w.ost)).toBe(true);
    expect(w.ost.A).toMatch(bezN1);
  });

  // K2 (S1 „po pętli”): scalanie w drugiej karcie decyduje „usuń” dla n1 (wersja w pasmie (R1, R1 + 1 s] starego nagrobka
  // z polem, karty już nie ma — skasował ją Bpu_usun), zanim pętla „Usuń pacjenta” dojdzie do n1, a nagrobek zapisuje po
  // niej. Dotąd stary nagrobek (R1, e1) nadpisywał świeży (e2) i stare C (emulacja 346dd81a) zostawało z sierotą n1.
  it('K2 [CZERWONY na 95b6f96e] scalanie w drugiej karcie decyduje „usuń” przed pętlą „Usuń pacjenta”, zapisuje nagrobek po niej → zostaje nagrobek z e2; stare C bez sierot', async () => {
    const locks = atrapaLocks();
    const x = await przygotuj({ A: { locks }, B: {}, C: { stara: true } });
    const { A } = x.urz;
    const { v: druga, o2 } = await drugaKarta(A, locks);
    const id1 = x.id('n1');
    const u = (await A.baza.listPatientNotesForUser(A.uid)).find((n) => n.id === id1).updatedAtISO;
    const R1 = new Date(Date.parse(u) - 500).toISOString(), e1 = new Date(Date.parse(u) - 600).toISOString();
    const lad = { ...kopia(await A.v.exportSyncPayload()), patients: [], tombstones: [], patientNotes: [],
      patientNoteTombstones: [{ id: id1, deletedAtISO: R1, deletedWithPatient: { patientId: x.pid, deletedAtISO: e1 } }] };
    const pA = A.pulapka('listPatientNotesForUser', () => true); // Bpu_usun: karta skasowana, mapa i lista odczytane
    przesun(60e3);
    const usun = A.v.removePatient(x.pid);
    await pA.osiagnieta;
    const q = o2.pulapka('getPatientForUser', (_u, pid) => pid === x.pid); // Bnp_karta w drugiej karcie: brak karty
    przesun(5);
    const scal = druga.mergeSyncPayload(lad);
    await q.osiagnieta; // n1 jest, nagrobka brak, decyzja „usuń”
    pA.zwolnij(); await usun; // pętla: n1 przez Eb z polem e2
    const poUsun = await nagrobekId(A, id1);
    q.zwolnij(); await scal; // zapis nagrobka U
    const po = await nagrobekId(A, id1);
    const e2 = (await nagrobekKarty(A, x.pid)).deletedAtISO;
    expect(poUsun.deletedWithPatient, 'kontrola: „Usuń pacjenta” zapisało n1 z e2').toEqual({ patientId: x.pid, deletedAtISO: e2 });
    expect([po.deletedAtISO, po.deletedWithPatient, po.rev || 0], 'nagrobek n1 z „Usuń pacjenta” nie jest nadpisany (R1, e1)').toEqual([poUsun.deletedAtISO, poUsun.deletedWithPatient, poUsun.rev || 0]);
    const w = await rundy(x, ['A', 'B', 'C'], 4);
    expect(w.stabilne, JSON.stringify(w.ost)).toBe(true);
    expect(w.ost).toEqual({ A: 'BRAK [] nagr[n1+pole,n2+pole]', B: 'BRAK [] nagr[n1+pole,n2+pole]', C: 'BRAK [] nagr[n1,n2]' });
  });

  // R2 (recenzja reguły): Bnp_odnowJeden odnawia tylko nagrobek z ważnym polem TEGO pacjenta. B scala X→Y (notatki
  // przepięte; A o tym nie wie) i usuwa Y; delty nagrobków n1 i n2 z polem Y dochodzą do drugiej karty A po liście notatek
  // w „Usuń pacjenta” X na A (druga karta kasuje n1 i n2 — karty Y na A nie ma). C (nie wie o usunięciu Y) zmienia kartę
  // Y, więc karta Y przeżywa. Pętla na A nie zastaje notatek, a świeże nagrobki mają pole Y → bez zmian. Odnowienie także
  // nagrobka z polem innego pacjenta (mutacja „if (!p) return;”; na 95b6f96e Eb z polem X i rev 0) kasowało n1 i n2 pod
  // ocalałą kartą Y na każdym urządzeniu.
  it('P1-8 [CZERWONY na 95b6f96e] nagrobki n1 i n2 z polem innego pacjenta (Y) wpisane w drugiej karcie po liście notatek → bez zmian; karta Y przeżywa, n1 i n2 pod Y na A, B i C', async () => {
    const locks = atrapaLocks();
    const x = await przygotuj({ A: { locks }, B: {}, C: {} });
    const { A, B, C } = x.urz;
    const id1 = x.id('n1'), id2 = x.id('n2');
    const ewa = (h) => ({ name: 'Testowa Ewa', user: { lastName: 'Testowa', firstName: 'Ewa', dobISO: '2015-05-05', sex: 'K', height: h, weight: 22 } });
    przesun(60e3); const y = await B.v.savePatient(ewa(120), { dedup: false });
    przesun(60e3); expect((await B.v.mergePatients(x.pid, y.patientId)).notesMoved).toBe(2);
    await pelny(B, C);
    nagrywaj(B);
    przesun(60e3); await B.v.removePatient(y.patientId);
    przesun(60e3); await C.v.savePatient(ewa(121), { dedup: false, patientId: y.patientId }); // C nie wie o usunięciu Y
    const delty = [];
    for (const q of B.delty.filter((d) => d.typ === 'nagrNot')) { const w = await q.p; delty.push(kopia(await B.v.decryptPayloadForCurrentUser(w.iv, w.data))); }
    expect(delty.map((d) => d.patientNoteTombstones[0].deletedWithPatient.patientId), 'kontrola: delty nagrobków z polem Y').toEqual([y.patientId, y.patientId]);
    const { v: druga } = await drugaKarta(A, locks);
    const p1 = A.pulapka('listPatientNotesForUser', () => true);
    przesun(60e3);
    const usun = A.v.removePatient(x.pid);
    await p1.osiagnieta; // lista: n1 i n2 pod X
    for (const d of delty) { przesun(5); await druga.mergeSyncPayload(d); }
    const przed = [await nagrobekId(A, id1), await nagrobekId(A, id2)];
    expect((await A.baza.listPatientNotesForUser(A.uid)).length, 'kontrola: druga karta skasowała n1 i n2').toBe(0);
    expect(przed.map((t) => t.deletedWithPatient.patientId), 'kontrola: nagrobki z polem Y').toEqual([y.patientId, y.patientId]);
    przesun(5); p1.zwolnij(); await usun;
    expect([await nagrobekId(A, id1), await nagrobekId(A, id2)], 'nagrobki z polem Y bez zmian').toEqual(przed);
    for (let r = 0; r < 4; r += 1) for (const k of ['A', 'B', 'C']) await x.c.sync(x.urz[k]);
    const wynik = {};
    for (const k of ['A', 'B', 'C']) {
      const d = x.urz[k];
      wynik[k] = { kartaY: (await d.v.listPatients()).some((q) => q.patientId === y.patientId),
        podY: (await d.v.listAllPatientNotes()).filter((n) => n.patientId === y.patientId).map((n) => x.nn[n.id]).sort() };
    }
    const cel = { kartaY: true, podY: ['n1', 'n2'] };
    expect(wynik).toEqual({ A: cel, B: cel, C: cel });
  });

  // R1 (recenzja reguły): ręczne usunięcie, które czekało na blokadę n1 i weszło po Eb pętli (P1-2), albo przyszło
  // z nieaktualnego widoku po „Usuń pacjenta” (np. samoczynne usunięcie wpisu Terminarza 4 s po „zrobione”), zastaje
  // notatkę już usuniętą: Eb zapisuje ręczny nagrobek z chwilą teraz = R_e + δ i rev 0. Delta nagrobka z polem (R_e)
  // z pętli, doręczona na żywo urządzeniu z ocalałą kartą przed ręcznym nagrobkiem, daje tam ratunek R_e + 1 ms + h; przy
  // h ≥ δ ręczne usunięcie przegrywa — klasa „Ręczne usunięcie w pasmie ratunku”, tu w drugiej karcie tego samego
  // urządzenia. Same pełne ładunki (P1-2) — n1 nie wraca; odstęp ponad 1 s — też (T9). Na 95b6f96e n1 wraca w obu
  // przeplotach, w RR1d z innego powodu: pętla bez blokady nadpisywała ręczny nagrobek (P1-2), więc kontrola mechanizmu
  // jest tam czerwona.
  async function pasmo(kiedy, delty) {
    const locks = atrapaLocks();
    const x = await przygotuj({ A: { locks }, B: {} });
    const { A, B } = x.urz;
    if (delty) nagrywaj(A);
    const { v: druga } = await drugaKarta(A, locks);
    const delty2 = [];
    druga.onPatientNoteChanged((ev) => { if (ev && ev.action === 'delete') delty2.push(Promise.resolve().then(() => druga.buildNoteTombstoneDelta(ev.id, ev.deletedAtISO))); });
    const id1 = x.id('n1');
    przesun(60e3);
    if (kiedy === 'po') {
      await A.v.removePatient(x.pid);
      przesun(1); await druga.removePatientNote(id1); // nieaktualny widok drugiej karty
    } else {
      const p1 = A.pulapka('getPatientNoteForUser', (_u, id) => id === id1 && (A.licz.listPatientNotesForUser || 0) > 0);
      A.zeruj();
      A.hak((k, a) => { if (k === 'putPatientNoteTombstoneForUser' && a[1] && a[1].id === id1 && a[1].deletedWithPatient) przesun(1); });
      const usun = A.v.removePatient(x.pid);
      await p1.osiagnieta;
      const r2 = druga.removePatientNote(id1); // czeka na blokadę n1
      await chwila(30);
      p1.zwolnij(); await usun; await r2;
      A.hak(null);
    }
    const lokalnie = await nagrobekId(A, id1);
    await wizyta(B, x); // B nie wie o usunięciu — karta przeżywa
    let doreczone = 0;
    if (delty) {
      await dostarcz(A, B);
      for (const q of await Promise.all(delty2)) { if (!q || !q.iv) continue; przesun(1000); await B.scal(kopia(await druga.decryptPayloadForCurrentUser(q.iv, q.data))); doreczone += 1; }
    }
    const w = await rundy(x, ['A', 'B'], 4);
    return { lokalnie, w, nagA: await nagrobekId(A, id1), nagB: await nagrobekId(B, id1), ileDelt2: doreczone };
  }
  it('RR1d [znane ograniczenie; n1 wraca też na 95b6f96e] ręczne usunięcie w drugiej karcie czeka na blokadę n1 (P1-2), 1 ms po nagrobku z polem; delty A i drugiej karty do B → n1 wraca', async () => {
    const { lokalnie, w, ileDelt2 } = await pasmo('w trakcie', true);
    expect([!!lokalnie && !lokalnie.deletedWithPatient, ileDelt2], 'kontrola: ręczny nagrobek na A, delta ręcznego usunięcia').toEqual([true, 1]);
    expect(w.zbiezne && w.stabilne, JSON.stringify(w.ost)).toBe(true);
    expect(w.ost.A).toBe('karta [n1,n2] nagr[]');
  });
  it('RR1e [znane ograniczenie, tak samo na 95b6f96e] ręczne usunięcie z nieaktualnego widoku drugiej karty 1 ms po „Usuń pacjenta”; delty → n1 wraca', async () => {
    const { lokalnie, w, ileDelt2 } = await pasmo('po', true);
    expect([!!lokalnie && !lokalnie.deletedWithPatient, ileDelt2], 'kontrola: ręczny nagrobek na A, delta ręcznego usunięcia').toEqual([true, 1]);
    expect(w.zbiezne && w.stabilne, JSON.stringify(w.ost)).toBe(true);
    expect(w.ost.A).toBe('karta [n1,n2] nagr[]');
  });
  // G6 w tym przeplocie: ręczne Eb na notatce, której już nie ma, zapisuje rev 0 (jak odroczone usunięcie Terminarza po
  // „Usuń pacjenta”, sprzed D-21). Na 95b6f96e ręczne Eb wchodziło przed Eb pętli, a pętla nadpisywała ręczny nagrobek
  // nagrobkiem z polem z rev 1 (P1-2: n1 wracała). Przejściowo: pierwszy pełny ładunek przenosi najwyższy znany rev
  // (rundy → rev 1 na A i B).
  it('RR2 [znane ograniczenie, G6 przejściowo] przeplot P1-2 bez delt: lokalny ręczny nagrobek n1 z rev 0; po rundach pełnych ładunków rev 1 na A i B, n1 nie wraca', async () => {
    const { lokalnie, w, nagA, nagB } = await pasmo('w trakcie', false);
    expect([!lokalnie.deletedWithPatient, lokalnie.rev || 0], 'lokalnie: ręczny nagrobek, rev 0').toEqual([true, 0]);
    expect([nagA.rev || 0, nagB.rev || 0], 'po rundach').toEqual([1, 1]);
    expect(w.ost.A).toMatch(bezN1);
  });
});

/* ---------- przegląd poprawki P1, weryfikacja 2: pętla zdejmowania nagrobków w oknie scalania (W1), świeży nagrobek wcześniejszy niż R (W2) ---------- */
// W1 (weryfikacja 2 przeglądu poprawki P1; ta sama klasa co F1, mechanizm sprzed D-21): pętla zdejmowania nagrobków w
// Le, zaraz po pętli U (nagrobki z K spoza U, RATUNKU i CZEKA, czyli decyzja „notatka”: wersja nowsza niż każdy
// nagrobek), szła bez blokady notatki i bez świeżego odczytu. Nagrobek zapisany w oknie scalania — od odczytu K (w
// stanie CZEKA notatka jest widoczna obok nagrobka przez całą sekcję) albo od przyjęcia notatki w pętli przyjmowania
// (RZ0) do tej pętli — przez ręczne usunięcie albo „Usuń pacjenta”, w drugiej karcie przeglądarki albo w tej samej przy
// scalaniu w tle, był zdejmowany: ręcznie usunięta notatka wracała z poprawką nieświadomego urządzenia na wszystkie
// urządzenia (wbrew D21-2), a po „Usuń pacjenta” zostawała sierotą na każdym urządzeniu. Teraz zdjęcie idzie pod
// blokadą notatki, na świeżym rekordzie nagrobka: nagrobek nowszy niż R (równoległe usunięcie) zostaje, jak w ratunku;
// brak rekordu albo błąd odczytu — zdjęcie jak dotąd. [CZERWONY na 6db54b78] — także na 83c04d5b i 95b6f96e; RZ0 i RZ0b
// także na affdeb64 (sprzed D-21; RZu i RZub są tam czerwone już w kontroli, bo nagrobek nie ma pola). RZ0e i K1e
// (ścieżka błędu odczytu) są zielone w zachowaniu na każdej wersji, a na wersjach bez świeżego odczytu czerwony jest
// tylko licznik odczytów.
describe('P-NOTATKI-ZA-KARTA — przegląd poprawki P1, weryfikacja 2: pętla zdejmowania nagrobków (decyzja „notatka”) w oknie scalania (W1), świeży nagrobek wcześniejszy niż R (W2)', () => {
  // RZ: A w stanie CZEKA (delty nagrobków notatek z „Usuń pacjenta” X na B doszły przed nagrobkiem karty); C (nie wie
  // o usunięciu) poprawia n1 później niż R + 1 s, więc w scaleniu ładunku C na A dla n1 decyzja „notatka”. Operacja na
  // n1 przed scaleniem, po nim albo w trakcie (po odczycie K): ręczne usunięcie w drugiej karcie albo w tej samej
  // (scalanie w tle), albo „Usuń pacjenta” X w drugiej karcie (karta nie przeżywa). Wynik w trakcie = przed = po.
  async function rz(kiedy, { tenSama = false, sposob = 'reczne', przezyje = true } = {}) {
    const locks = atrapaLocks();
    const x = await przygotuj({ A: { locks }, B: {}, C: {} });
    const { A, B, C } = x.urz;
    const druga = tenSama ? A.v : (await drugaKarta(A, locks)).v;
    const id1 = x.id('n1');
    nagrywaj(B);
    przesun(60e3); await B.v.removePatient(x.pid);
    await dostarcz(B, A, (t) => t === 'nagrNot');
    const czeka = await stan(A, x);
    przesun(60e3); await C.v.savePatientNote({ id: id1, patientId: x.pid, title: 'n1', body: 'edycja C' });
    const ladC = kopia(await C.v.exportSyncPayload());
    const op = async () => { if (sposob === 'reczne') await druga.removePatientNote(id1); else await druga.removePatient(x.pid); };
    if (kiedy === 'przed') { przesun(1000); await op(); }
    A.zeruj();
    const p = A.pulapka('listPatientNoteTombstonesForUser', () => (A.licz.listPatientNotesForUser || 0) > 0); // K w Le
    przesun(5e3);
    const scal = A.v.mergeSyncPayload(ladC);
    const doszlo = await Promise.race([p.osiagnieta.then(() => true), scal.then(() => false)]);
    let wOknie = null;
    if (kiedy === 'w trakcie') { przesun(5); await op(); wOknie = await nagrobekId(A, id1); }
    p.zwolnij(); await scal;
    if (kiedy === 'po') { przesun(1000); await op(); }
    const poScal = await nagrobekId(A, id1);
    if (przezyje) await wizyta(C, x);
    const w = await rundy(x, ['A', 'C', 'B'], 4);
    return { czeka, doszlo, wOknie, poScal, w };
  }
  for (const [nazwa, o, cel] of [
    ['ręczne usunięcie n1 w drugiej karcie', {}, 'karta [n2] nagr[n1]'],
    ['ręczne usunięcie n1 w tej samej karcie (scalanie w tle)', { tenSama: true }, 'karta [n2] nagr[n1]'],
    ['„Usuń pacjenta” X w drugiej karcie, karta nie przeżywa', { sposob: 'usunPacjenta', przezyje: false }, 'BRAK [] nagr[n1+pole,n2+pole]'],
  ]) {
    it(`RZ [CZERWONY na 6db54b78] A „czeka”, C poprawia n1 później niż R + 1 s; ${nazwa} w trakcie scalania ładunku C → nagrobek z okna zostaje, wynik jak przed i po scaleniu`, async () => {
      const przed = await rz('przed', o), po = await rz('po', o), wt = await rz('w trakcie', o);
      expect(przed.czeka, 'kontrola: A w stanie CZEKA').toBe('karta [n1,n2] nagr[n1+pole,n2+pole]');
      expect(wt.doszlo, 'pułapka w sekcji notatek Le').toBe(true);
      for (const r of [przed, po]) {
        expect(r.w.zbiezne && r.w.stabilne, JSON.stringify(r.w.ost)).toBe(true);
        expect(r.w.ost.A, 'kontrola: operacja przed albo po scaleniu').toBe(cel);
      }
      expect(wt.wOknie, 'kontrola: nagrobek n1 zapisany w oknie').not.toBeNull();
      expect([wt.poScal && wt.poScal.deletedAtISO, wt.poScal && (wt.poScal.deletedWithPatient || null)], 'nagrobek z okna zostaje po scaleniu').toEqual([wt.wOknie.deletedAtISO, wt.wOknie.deletedWithPatient || null]);
      expect(wt.w.zbiezne && wt.w.stabilne, JSON.stringify(wt.w.ost)).toBe(true);
      expect(wt.w.ost).toEqual(przed.w.ost);
    }, 60e3);
  }

  // RZ0 (bez stanu CZEKA, mechanizm sprzed D-21): A ręcznie usunęło n3 i n1; C (nie wie) poprawia n1 później, więc
  // w scaleniu ładunku C na A dla n1 decyzja „notatka” (pętla przyjmowania przywraca n1), a n3 trafia do U („zostaw”).
  // Pauza w pętli U na n3 — po przyjęciu n1, przed pętlą zdejmowania; w tym oknie ręczne usunięcie przywróconej n1 albo
  // „Usuń pacjenta” X, w drugiej karcie albo w tej samej. Odniesienie: ta sama operacja po scaleniu.
  async function rz0(kiedy, { tenSama = false, sposob = 'reczne' } = {}) {
    const locks = atrapaLocks();
    const x = await przygotuj({ A: { locks }, B: {}, C: {} }, ['n1', 'n2', 'n3']);
    const { A, C } = x.urz;
    const druga = tenSama ? A.v : (await drugaKarta(A, locks)).v;
    const id1 = x.id('n1'), id3 = x.id('n3');
    przesun(60e3); await A.v.removePatientNote(id3);
    przesun(60e3); await A.v.removePatientNote(id1);
    const reczny1 = await nagrobekId(A, id1);
    przesun(60e3); await C.v.savePatientNote({ id: id1, patientId: x.pid, title: 'n1', body: 'edycja C' });
    const ladC = kopia(await C.v.exportSyncPayload());
    const yC = ladC.patientNotes.find((n) => n.id === id1).updatedAtISO;
    const op = async () => { if (sposob === 'reczne') await druga.removePatientNote(id1); else await druga.removePatient(x.pid); };
    A.zeruj();
    const p = A.pulapka('getPatientNoteForUser', (_u, id) => id === id3 && (A.licz.putPatientNoteForUser || 0) > 0); // pętla U, po przyjęciu n1
    przesun(5e3);
    const scal = A.v.mergeSyncPayload(ladC);
    const doszlo = await Promise.race([p.osiagnieta.then(() => true), scal.then(() => false)]);
    let wOknie = null;
    if (kiedy === 'w trakcie') {
      wOknie = { n1: !!(await A.baza.getPatientNoteForUser(A.uid, id1)), staryNagrobek: (await nagrobekId(A, id1) || {}).deletedAtISO === reczny1.deletedAtISO };
      przesun(5); await op(); wOknie.nagrobek = await nagrobekId(A, id1);
    }
    p.zwolnij(); await scal;
    if (kiedy === 'po') { przesun(1000); await op(); }
    const poScal = await nagrobekId(A, id1);
    const w = await rundy(x, ['A', 'C', 'B'], 4);
    return { doszlo, wOknie, poScal, w, yC };
  }
  for (const [kod, nazwa, o, cel] of [
    ['RZ0 [CZERWONY na 6db54b78 i affdeb64]', 'ręczne usunięcie przywróconej n1 w drugiej karcie', {}, 'karta [n2] nagr[n1,n3]'],
    ['RZ0b [CZERWONY na 6db54b78 i affdeb64]', 'ręczne usunięcie przywróconej n1 w tej samej karcie (scalanie w tle)', { tenSama: true }, 'karta [n2] nagr[n1,n3]'],
    ['RZu [CZERWONY na 6db54b78]', '„Usuń pacjenta” X w drugiej karcie', { sposob: 'usunPacjenta' }, /^BRAK \[\] nagr\[n1\+pole(\+r)?,n2\+pole,n3\]$/],
    ['RZub [CZERWONY na 6db54b78]', '„Usuń pacjenta” X w tej samej karcie (scalanie w tle)', { tenSama: true, sposob: 'usunPacjenta' }, /^BRAK \[\] nagr\[n1\+pole(\+r)?,n2\+pole,n3\]$/],
  ]) {
    it(`${kod} A ręcznie usunęło n1, C poprawia ją później; ${nazwa} po przyjęciu n1, przed pętlą zdejmowania → nagrobek z okna zostaje, wynik jak po scaleniu`, async () => {
      const po = await rz0('po', o), wt = await rz0('w trakcie', o);
      const dopasuj = (s) => (typeof cel === 'string' ? expect(s).toBe(cel) : expect(s).toMatch(cel));
      expect(po.w.zbiezne && po.w.stabilne, JSON.stringify(po.w.ost)).toBe(true);
      dopasuj(po.w.ost.A);
      expect(wt.doszlo, 'pułapka w pętli U').toBe(true);
      expect([wt.wOknie.n1, wt.wOknie.staryNagrobek], 'kontrola: w oknie n1 przyjęta, stary ręczny nagrobek jeszcze leży').toEqual([true, true]);
      expect(wt.wOknie.nagrobek, 'kontrola: nagrobek n1 z okna').not.toBeNull();
      expect([wt.poScal && wt.poScal.deletedAtISO, wt.poScal && !!wt.poScal.deletedWithPatient], 'nagrobek z okna zostaje po scaleniu').toEqual([wt.wOknie.nagrobek.deletedAtISO, !!wt.wOknie.nagrobek.deletedWithPatient]);
      expect(wt.w.zbiezne && wt.w.stabilne, JSON.stringify(wt.w.ost)).toBe(true);
      dopasuj(wt.w.ost.A);
      // „Usuń pacjenta” w oknie zastaje jeszcze stary ręczny nagrobek n1 i przenosi jego chwilę jako M (Bnp_poleEb);
      // M jest wcześniejsze niż poprawka C, więc niczego nie blokuje — jedyna różnica wobec „po”
      if (o.sposob === 'usunPacjenta' && wt.poScal.deletedWithPatient.manualDeletedAtISO) {
        expect(wt.poScal.deletedWithPatient.manualDeletedAtISO < wt.yC, 'M wcześniejsze niż poprawka C').toBe(true);
      }
    }, 60e3);
  }
  // RZ0l: przeplot wewnątrz pętli zdejmowania — ręczne usunięcie w drugiej karcie po świeżym odczycie nagrobka n1,
  // przed jego zdjęciem: czeka na blokadę n1 i wchodzi po zdjęciu, więc ręczny nagrobek zostaje (bez blokady zdjęcie
  // kasowało świeży ręczny nagrobek po decyzji z odczytu sprzed niego).
  it('RZ0l [CZERWONY na 6db54b78] ręczne usunięcie n1 w drugiej karcie między świeżym odczytem a zdjęciem nagrobka n1 → czeka na blokadę n1, ręczny nagrobek zostaje; karta [n2] wszędzie', async () => {
    const locks = atrapaLocks();
    const x = await przygotuj({ A: { locks }, B: {}, C: {} }, ['n1', 'n2', 'n3']);
    const { A, C } = x.urz;
    const { v: druga } = await drugaKarta(A, locks);
    const id1 = x.id('n1');
    przesun(60e3); await A.v.removePatientNote(x.id('n3'));
    przesun(60e3); await A.v.removePatientNote(id1);
    przesun(60e3); await C.v.savePatientNote({ id: id1, patientId: x.pid, title: 'n1', body: 'edycja C' });
    const ladC = kopia(await C.v.exportSyncPayload());
    A.zeruj();
    const p = A.pulapka('getPatientNoteTombstoneForUser', (_u, id) => id === id1); // świeży odczyt w pętli zdejmowania
    przesun(5e3);
    const scal = A.v.mergeSyncPayload(ladC);
    const doszlo = await Promise.race([p.osiagnieta.then(() => true), scal.then(() => false)]);
    przesun(5);
    const reczne = druga.removePatientNote(id1);
    await chwila(30);
    const czekalo = (await nagrobekId(A, id1) || {}).deletedAtISO !== undefined && !!(await A.baza.getPatientNoteForUser(A.uid, id1));
    p.zwolnij(); await scal; await reczne;
    const poScal = await nagrobekId(A, id1);
    expect(doszlo, 'pułapka: świeży odczyt nagrobka n1 w pętli zdejmowania (na 6db54b78 go nie ma)').toBe(true);
    expect(czekalo, 'kontrola: ręczne usunięcie czeka na blokadę n1 (notatka i stary nagrobek jeszcze leżą)').toBe(true);
    expect(poScal && !poScal.deletedWithPatient, 'ręczny nagrobek n1 zostaje po scaleniu').toBe(true);
    const w = await rundy(x, ['A', 'C', 'B'], 4);
    expect(w.zbiezne && w.stabilne, JSON.stringify(w.ost)).toBe(true);
    expect(w.ost.A).toBe('karta [n2] nagr[n1,n3]');
  }, 60e3);

  // Błąd odczytu świeżego nagrobka w scaleniu (getPatientNoteTombstoneForUser rzuca): pętla U zapisuje nagrobek ze
  // stanu z początku sekcji, pętla zdejmowania zdejmuje nagrobek jak dotąd, scalanie kończy się bez błędu. Wynik jak na
  // 83c04d5b (bez świeżego odczytu); wyjątek przerywałby sekcję notatek po cichu.
  async function zAwaria(A, f) {
    const oryg = A.baza.getPatientNoteTombstoneForUser;
    let bledy = 0;
    A.baza.getPatientNoteTombstoneForUser = async () => { bledy += 1; throw new Error('awaria odczytu nagrobka (test)'); };
    try { await f(); } finally { A.baza.getPatientNoteTombstoneForUser = oryg; }
    return bledy;
  }
  it('RZ0e [ścieżka błędu; na 6db54b78 i starszych czerwony tylko licznik odczytów] A ręcznie usunęło n3 i n1, C poprawia n1; scalanie ładunku C przy błędzie odczytu nagrobka → n1 przyjęta, jej nagrobek zdjęty, nagrobek n3 zostaje, jak dotąd', async () => {
    const x = await przygotuj({ A: {}, B: {}, C: {} }, ['n1', 'n2', 'n3']);
    const { A, C } = x.urz;
    const id1 = x.id('n1'), id3 = x.id('n3');
    przesun(60e3); await A.v.removePatientNote(id3);
    przesun(60e3); await A.v.removePatientNote(id1);
    const n3przed = await nagrobekId(A, id3);
    przesun(60e3); await C.v.savePatientNote({ id: id1, patientId: x.pid, title: 'n1', body: 'edycja C' });
    const ladC = kopia(await C.v.exportSyncPayload());
    przesun(5e3);
    const bledy = await zAwaria(A, () => A.v.mergeSyncPayload(ladC));
    expect(bledy, 'kontrola: odczyt rzucał w pętli U (n3) i w pętli zdejmowania (n1)').toBe(2);
    expect(!!(await A.baza.getPatientNoteForUser(A.uid, id1)), 'n1 przyjęta').toBe(true);
    expect(await nagrobekId(A, id1), 'nagrobek n1 zdjęty').toBeNull();
    const n3 = await nagrobekId(A, id3);
    expect([n3 && n3.deletedAtISO, n3 && (n3.deletedWithPatient || null)], 'nagrobek n3 jak dotąd').toEqual([n3przed.deletedAtISO, null]);
    const w = await rundy(x, ['A', 'C', 'B'], 3);
    expect(w.zbiezne && w.stabilne, JSON.stringify(w.ost)).toBe(true);
    expect(w.ost.A).toBe('karta [n1=edycja C,n2] nagr[n3]');
  }, 60e3);
  it('K1e [ścieżka błędu; na 83c04d5b i starszych czerwony tylko licznik odczytów] B usuwa X; A scala ładunek B przy błędzie odczytu nagrobka → nagrobki n1 i n2 z polem X zapisane ze stanu z początku sekcji, bez błędu scalania', async () => {
    const x = await przygotuj({ A: {}, B: {}, C: {} });
    const { A, B, C } = x.urz;
    przesun(60e3); await B.v.removePatient(x.pid);
    const ladB = kopia(await B.v.exportSyncPayload());
    const naB = Object.fromEntries((ladB.patientNoteTombstones || []).map((t) => [x.nn[t.id], [t.deletedAtISO, t.deletedWithPatient]]));
    przesun(5e3);
    const bledy = await zAwaria(A, () => A.v.mergeSyncPayload(ladB));
    expect(bledy, 'kontrola: odczyt rzucał w pętli U').toBeGreaterThanOrEqual(2);
    const naA = Object.fromEntries((await nagrobkiNotatek(A)).map((t) => [x.nn[t.id], [t.deletedAtISO, t.deletedWithPatient]]));
    expect(naA, 'nagrobki n1 i n2 jak w ładunku B (R, pole)').toEqual(naB);
    expect(await stan(A, x)).toBe('BRAK [] nagr[n1+pole,n2+pole]');
    await wizyta(C, x); // C nie wie o usunięciu — karta przeżywa, notatki wracają
    const w = await rundy(x, ['A', 'C', 'B'], 4);
    expect(w.zbiezne && w.stabilne, JSON.stringify(w.ost)).toBe(true);
    expect(w.ost.A).toBe('karta [n1,n2] nagr[]');
  }, 60e3);

  // W2 (luka testów): świeży nagrobek WCZEŚNIEJSZY niż R w pętli U (Bnp_nagrobekScalania). Nagrobek z polem z zegara B
  // przesuniętego o +10 min (G13); w oknie scalania ręczne usunięcie n1 na A z chwilą teraz < R. Krata: R i pole
  // zostają, M = chwila ręcznego usunięcia, więc n1 nie wraca z kartą, która przeżyła (C zmienia ją po R). Mutacje
  // „świeży tylko, gdy późniejszy niż R”, „najnowszy wygrywa bez kraty” i „pole ze starej kopii przy tym samym R” gubią
  // M i przechodziły cały plik (łapał je tylko strażnik źródła). Zielony na 6db54b78, czerwony na 83c04d5b i 95b6f96e.
  async function g13(kiedy) {
    const locks = atrapaLocks();
    const x = await przygotuj({ A: { locks }, B: { zegar: 600e3 }, C: {} });
    const { A, B, C } = x.urz;
    const { v: druga } = await drugaKarta(A, locks);
    const id1 = x.id('n1');
    przesun(60e3); await B.v.removePatient(x.pid);
    const ladB = kopia(await B.v.exportSyncPayload());
    if (kiedy === 'przed') { przesun(1000); await druga.removePatientNote(id1); }
    A.zeruj();
    const p = A.pulapka('listPatientNoteTombstonesForUser', () => (A.licz.listPatientNotesForUser || 0) > 0); // K w Le
    przesun(5e3);
    const scal = A.v.mergeSyncPayload(ladB);
    const doszlo = await Promise.race([p.osiagnieta.then(() => true), scal.then(() => false)]);
    let wOknie = null;
    if (kiedy === 'w trakcie') { przesun(5); await druga.removePatientNote(id1); wOknie = await nagrobekId(A, id1); }
    p.zwolnij(); await scal;
    if (kiedy === 'po') { przesun(1000); await druga.removePatientNote(id1); }
    const poScal = await nagrobekId(A, id1);
    przesun(700e3); await wizyta(C, x); // C nie wie o usunięciu, zmienia kartę po R — karta przeżywa
    const w = await rundy(x, ['A', 'C', 'B'], 4);
    return { doszlo, wOknie, poScal, w };
  }
  it('G13w [luka testów W2; CZERWONY na 83c04d5b i starszych] nagrobek z polem z zegara +10 min; ręczne usunięcie n1 w drugiej karcie w trakcie scalania, z chwilą < R → nagrobek (R, pole, M = chwila ręczna), n1 nie wraca; wynik jak przed i po scaleniu', async () => {
    const przed = await g13('przed'), po = await g13('po'), wt = await g13('w trakcie');
    expect(wt.doszlo, 'pułapka w sekcji notatek Le').toBe(true);
    expect(wt.wOknie && !wt.wOknie.deletedWithPatient && wt.wOknie.deletedAtISO < wt.poScal.deletedAtISO, 'kontrola: świeży ręczny nagrobek wcześniejszy niż R').toBe(true);
    expect(wt.poScal.deletedWithPatient && wt.poScal.deletedWithPatient.manualDeletedAtISO, 'M = chwila ręcznego usunięcia').toBe(wt.wOknie.deletedAtISO);
    for (const r of [przed, po, wt]) expect(r.w.zbiezne && r.w.stabilne, JSON.stringify(r.w.ost)).toBe(true);
    expect(wt.w.ost.A).toBe('karta [n2] nagr[n1+pole+r]');
    expect(wt.w.ost).toEqual(przed.w.ost);
    expect(po.w.ost).toEqual(przed.w.ost);
  }, 90e3);
});

/* ---------- Przegląd poprawki P1 (F2): nagrobek karty a scalanie w drugiej karcie przeglądarki ---------- */
describe('P-NOTATKI-ZA-KARTA — przegląd poprawki P1: nagrobek karty cofnięty przez scalanie w drugiej karcie przeglądarki (F2)', () => {
  // Starsze niż D-21 (#518, P-SYNC-WLASCICIEL). B usuwa X (eB); C, które o tym nie wie, zapisuje wizytę X po eB; na A
  // karta przeglądarki A1 robi „Usuń pacjenta” X (e, później niż zapis C), a karta A2 w tym czasie scala pełny ładunek B.
  // Scalanie decyduje na starcie (nagrobek eB z ładunku; lokalnego jeszcze nie ma), a Bsl_usunPacjenta pod blokadą X
  // wpisywało nagrobek z chwilą z tej decyzji: eB zastępowało e, karta X wygrywała zapisem C i wracała na A, B i C (po
  // D-21 z notatkami w stanie CZEKA). Teraz Bsl_usunPacjenta czyta pod blokadą lokalny nagrobek karty i zostawia
  // późniejszą chwilę. Tylko pełne ładunki: delta nagrobka karty z A1 (onPatientDeleted → buildTombstoneDelta z e)
  // ginie na każdym urządzeniu; gdy dojdzie do jednego z nich, wynik jest BRAK także bez poprawki (K9d).
  // [CZERWONY na ab8ead6] — przed poprawką: nagrobek karty X na A = eB, karta X i notatki wracają na A, B i C.
  async function k9(locks) {
    const x = await przygotuj({ A: { locks }, B: {}, C: {} });
    const { A, B, C } = x.urz;
    przesun(60e3); await B.v.removePatient(x.pid);
    x.eB = (await nagrobekKarty(B, x.pid)).deletedAtISO;
    await wizyta(C, x);
    x.tC = (await C.v.listPatients()).find((p) => p.patientId === x.pid).lastSavedAtISO;
    x.ladunekB = kopia(await B.v.exportSyncPayload());
    // A1 — A.v (magazyn A z pułapkami); A2 — druga karta przeglądarki na tym samym magazynie i tych samych blokadach
    // (bez pułapek A, chyba że dostanie własną owijkę).
    x.A2 = async (adapter = A.baza) => {
      const v = okno({ locks }).VildaVault;
      v.setStorageAdapter(adapter);
      await v.unlockUser(A.uid, A.haslo);
      return { v, scal: (p, op) => v.mergeSyncPayload(kopia(p), op) };
    };
    x.e = null;
    A.v.onPatientDeleted((z) => { if (z && z.patientId === x.pid) x.e = z.deletedAtISO; });
    return x;
  }
  const BRAK = 'BRAK [] nagr[n1+pole,n2+pole]';
  async function poRundach(x) {
    const w = await rundy(x, ['C', 'A', 'B'], 3, ['A', 'B', 'C']);
    expect(w.zbiezne && w.stabilne, JSON.stringify(w.ost)).toBe(true);
    return w.ost;
  }

  it('K9 [CZERWONY na ab8ead6] wyścig: scalanie ładunku B w A2 czeka na blokadę X trzymaną przez „Usuń pacjenta” w A1 → nagrobek karty e, BRAK na A, B i C', async () => {
    const locks = atrapaLocks();
    const x = await k9(locks);
    const { A, B, C } = x.urz;
    const A2 = await x.A2();
    // A1: karta X już zdjęta z magazynu, blokada X trzymana, nagrobek e jeszcze niezapisany
    const p = A.pulapka('removePatientForUser', (_u, pid) => pid === x.pid);
    przesun(60e3);
    const usun = A.v.removePatient(x.pid);
    await p.osiagnieta;
    // A2: decyzja na starcie (nagrobek eB z ładunku), potem czekanie na blokadę X w Bsl_usunPacjenta (onLockWait)
    const czeka = odroczone();
    let koniec = false;
    const scal = A2.scal(x.ladunekB, { onLockWait: czeka.rozwiaz }).then((w) => { koniec = true; return w; });
    await czeka.obietnica;
    expect(koniec, 'scalanie czeka na blokadę X').toBe(false);
    p.zwolnij();
    await usun;
    await scal;
    expect(x.eB < x.tC && x.tC < x.e, `eB ${x.eB} < zapis C ${x.tC} < e ${x.e}`).toBe(true);
    expect((await nagrobekKarty(A, x.pid)).deletedAtISO, 'nagrobek karty na A: e, nie cofnięty do eB').toBe(x.e);
    expect(await stan(A, x)).toBe(BRAK);
    const ost = await poRundach(x);
    expect(ost).toEqual({ A: BRAK, B: BRAK, C: BRAK });
    for (const d of [A, B, C]) expect((await nagrobekKarty(d, x.pid)).deletedAtISO, d.nazwa).toBe(x.e);
  });

  it('K9o [CZERWONY na ab8ead6] okno: „Usuń pacjenta” w A1 kończy się między decyzją scalania w A2 a usunięciem karty → nagrobek karty e, BRAK na A, B i C', async () => {
    const locks = atrapaLocks();
    const x = await k9(locks);
    const { A, B, C } = x.urz;
    const w2 = owin(A.baza);
    const A2 = await x.A2(w2.owiniety);
    // decyzja: odczyt nagrobków kart na starcie scalania — wstrzymany po odczycie (lokalnego nagrobka X jeszcze nie ma)
    const p = w2.pulapka('listTombstonesForUser', () => true);
    const scal = A2.scal(x.ladunekB);
    await p.osiagnieta;
    przesun(60e3); await A.v.removePatient(x.pid);
    p.zwolnij();
    await scal;
    expect(x.eB < x.tC && x.tC < x.e).toBe(true);
    expect((await nagrobekKarty(A, x.pid)).deletedAtISO, 'nagrobek karty na A: e, nie cofnięty do eB').toBe(x.e);
    const ost = await poRundach(x);
    expect(ost).toEqual({ A: BRAK, B: BRAK, C: BRAK });
    for (const d of [A, B, C]) expect((await nagrobekKarty(d, x.pid)).deletedAtISO, d.nazwa).toBe(x.e);
  });

  it.each([['usunięcie, potem scalanie'], ['scalanie, potem usunięcie']])('K9k [kontrola] kolejno (%s) → nagrobek karty e, BRAK na A, B i C', async (kolej) => {
    const locks = atrapaLocks();
    const x = await k9(locks);
    const { A, B, C } = x.urz;
    const A2 = await x.A2();
    if (kolej === 'usunięcie, potem scalanie') { przesun(60e3); await A.v.removePatient(x.pid); await A2.scal(x.ladunekB); }
    else { await A2.scal(x.ladunekB); przesun(60e3); await A.v.removePatient(x.pid); }
    expect(x.eB < x.tC && x.tC < x.e).toBe(true);
    expect((await nagrobekKarty(A, x.pid)).deletedAtISO).toBe(x.e);
    const ost = await poRundach(x);
    expect(ost).toEqual({ A: BRAK, B: BRAK, C: BRAK });
    for (const d of [A, B, C]) expect((await nagrobekKarty(d, x.pid)).deletedAtISO, d.nazwa).toBe(x.e);
  });

  it('K9d [kontrola] wyścig jak w K9, delta nagrobka karty z A1 (chwila e ze zdarzenia) dochodzi do B → BRAK na A, B i C także bez poprawki', async () => {
    const locks = atrapaLocks();
    const x = await k9(locks);
    const { A, B, C } = x.urz;
    nagrywaj(A);
    const A2 = await x.A2();
    const p = A.pulapka('removePatientForUser', (_u, pid) => pid === x.pid);
    przesun(60e3);
    const usun = A.v.removePatient(x.pid);
    await p.osiagnieta;
    const czeka = odroczone();
    const scal = A2.scal(x.ladunekB, { onLockWait: czeka.rozwiaz });
    await czeka.obietnica;
    p.zwolnij();
    await usun;
    await scal;
    expect(await dostarcz(A, B, (t) => t === 'nagrPac')).toEqual(['nagrPac']);
    expect((await nagrobekKarty(B, x.pid)).deletedAtISO, 'B: nagrobek e z delty').toBe(x.e);
    const ost = await poRundach(x);
    expect(ost).toEqual({ A: BRAK, B: BRAK, C: BRAK });
    for (const d of [A, B, C]) expect((await nagrobekKarty(d, x.pid)).deletedAtISO, d.nazwa).toBe(x.e);
  });
});

/* ---------- strażniki źródła ---------- */
describe('P-NOTATKI-ZA-KARTA — strażniki źródła', () => {
  const src = readFileSync(path.join(korzen, 'vilda_vault.js'), 'utf8');
  const sekcja = (od, doo) => { const a = src.indexOf(od); return a < 0 ? '' : src.slice(a, src.indexOf(doo, a)); };
  it('Le: krata i decyzja przed pętlą przyjmowania, ratunek po niej, zdjęcie nagrobków pomija RATUNEK i CZEKA; bez listy kart w sekcji notatek; nagrobki U na świeżym rekordzie (przegląd poprawki P1, F1); zdjęcie nagrobków pod blokadą notatki na świeżym rekordzie (weryfikacja 2, W1)', () => {
    const notatki = sekcja('var Qch=[];', 'let St=0,Dt=0,dt=0;');
    expect(notatki.length).toBeGreaterThan(5000);
    expect(notatki).toContain('Qkn=Bnp_zlacz(W.concat(K))');
    expect(notatki).toContain('Qwy=Bnp_zwyciezcy(X,j)');
    expect(notatki).toContain('let Qs=Bnp_stan(Qkn[S],g,void 0,Qwy[S]);');
    expect(notatki).toContain('Qs=Bnp_stan(Qkn[S],g,Qkr[Qp],Qwy[S])');
    expect(notatki).toContain('Nt+=await Bnp_ratuj(P,{kanon:Qkn,ratunek:Qrt,czeka:Qcz,rev:Qrev,liczone:Qdn,zdarzenia:Qch,nagrobki:K},e);');
    // przegląd poprawki P1 (F1): nagrobki U pod blokadą notatki na świeżym rekordzie, krata z kopiami z ładunku i z K
    expect(notatki).toContain('const S=Array.from(U),Qkp=Bnp_wgId(W.concat(K));');
    expect(notatki).toContain('await Bnp_nagrobekScalania(P,M,Qkp.get(M)||[],R[M],Qkn[M]&&Qkn[M].pole||null,');
    expect(notatki).not.toContain('await P.putPatientNoteTombstoneForUser(b,{id:M,deletedAtISO:R[M]');
    const ns = sekcja('async function Bnp_nagrobekScalania(', '\n}\n');
    expect(ns).toContain("try { swiezy = await Bnp_nagrobek(h, id); } catch(PatientClinicalCaught) {PatientClinicalRethrow(PatientClinicalCaught); swiezy = null; }");
    expect(ns).toContain('const k = Bnp_zlacz((kopie || []).concat([swiezy]))[id];');
    expect(ns).toContain('if (k) { D = k.R; p = k.pole; }');
    expect(ns).toContain('if (Bnp_rev(swiezy) > r) r = Bnp_rev(swiezy);');
    // weryfikacja 2 przeglądu P1 (W1): zdjęcie nagrobka po decyzji „notatka” pod blokadą notatki, na świeżym rekordzie
    expect(notatki).toContain("!U.has(M.id)&&!Qrt.has(M.id)&&!Qcz.has(M.id)&&await Ac(M.id,function(){return PatientClinicalWriteValue(PatientClinicalOperationAccount,Bnp_zdejmijPoScaleniu(P,M.id,R[M.id]))})");
    expect(notatki).not.toContain('&&await P.removePatientNoteTombstoneForUser(b,M.id)');
    const zd = sekcja('async function Bnp_zdejmijPoScaleniu(', '\n}\n');
    expect(zd).toContain("try { swiezy = await Bnp_nagrobek(h, id); } catch(PatientClinicalCaught) {PatientClinicalRethrow(PatientClinicalCaught); swiezy = null; }");
    expect(zd).toContain("if (swiezy && typeof swiezy.deletedAtISO === 'string' && swiezy.deletedAtISO > (R || '')) return PatientClinicalWriteValue(PatientClinicalOperationAccount,undefined);");
    expect(zd).toContain("await h.removePatientNoteTombstoneForUser(b, PatientClinicalWriteValue(b,id));");
    expect(notatki).not.toContain('listPatientsForUser');
    expect(notatki.indexOf('Bnp_stan(')).toBeLessThan(notatki.indexOf('for(let S=0;S<j.length;S+=1)'));
    expect(notatki.indexOf('Bnp_ratuj(')).toBeGreaterThan(notatki.indexOf('M?Nt++:Et++,Qdn.add(g.id)'));
  });
  it('Bpu_usun: jedna chwila e przed pętlą notatek, Eb z polem; Eb i $o; ls czyta rekord ze sklepu; adaptery bez zmian strzeżonych napisów', () => {
    // P-SESJA-ZAPISU (PR-S, przegląd 3): Bpu_usun dostaje opcjonalną sesję „Scal pacjentów” (Bpu_s) i podaje ją dalej.
    const bpu = sekcja('async function Bpu_usun(t,Bpu_s){', 'async function co(');
    // przegląd 1: lista nagrobków notatek raz (F3), odnowienie nagrobków bez notatek przed nagrobkiem karty (F1)
    expect(bpu.indexOf('const e=new Date().toISOString(),Qnm=await Bnp_mapaNagrobkow(I()),Qnd=new Set;')).toBeGreaterThan(-1);
    // uwaga Codexa P1: notatka z pętli przez Bnp_usunZPacjentem (blokada notatki, świeży odczyt), nie Eb z mapą
    expect(bpu.indexOf('const e=new Date().toISOString(),')).toBeLessThan(bpu.indexOf('await Bnp_usunZPacjentem(Qd0,Qd4.id,t,e,Bpu_s)'));
    expect(bpu.indexOf('await Bnp_usunZPacjentem(Qd0,Qd4.id,t,e,Bpu_s)')).toBeLessThan(bpu.indexOf('await Bnp_odnow(I(),t,e,Qnm,Qnd,Bpu_s);'));
    expect(bpu.indexOf('await Bnp_odnow(I(),t,e,Qnm,Qnd,Bpu_s);')).toBeLessThan(bpu.indexOf("putTombstoneForUser(b,PatientClinicalWriteValue(b,{patientId:t,deletedAtISO:e}))"));
    expect(bpu.split('new Date().toISOString()').length - 1, 'jedna chwila').toBe(1);
    expect(bpu).not.toContain('listPatientNoteTombstonesForUser');
    // Care-owned notes dispatch inside the original Ac note lock; ordinary
    // notes retain the Eb fallback and its storage/tombstone policy below.
    expect(src).toContain('return Ac(t,async function(){const CareMvpRemoved=await CareMvpLegacyDelete(t);if(CareMvpRemoved)return true;return Eb(t)})');
    // Klirens adds a private, opt-in fourth argument. Ordinary $o and the
    // patient-deletion loop still call Eb without it; retain their storage,
    // tombstone fields and historical error policy rather than matching only
    // the former three-argument spelling of the declaration. P-SESJA-ZAPISU
    // (PR-S, przegląd 3): the patient-deletion loop passes only the optional
    // fifth argument (the „Scal pacjentów” session; undefined otherwise).
    const eb = sekcja('async function Eb(t,Qwp,Qwm,Qwf){', 'async function ts(');
    expect(eb).toContain('const Qwg=Qwf&&Qwf.token===VildaExistingNoteUpdateToken?Qwf:null;');
    expect(eb).toContain('await (Qwg?Qwg.adapter:I()).getPatientNoteForUser(Qwg?Qwg.account:b,t)');
    expect(eb).toContain("if(Qwg)Qwg.beforeCommit();await (Qwg?Qwg.adapter:I()).removePatientNoteForUser(Qwg?Qwg.account:b,PatientClinicalWriteValue(Qwg?Qwg.account:b,t));");
    expect(eb).toContain('const r=Qwg?Qwg.adapter:I();');
    expect(eb).toContain("r.putPatientNoteTombstoneForUser(Qwg?Qwg.account:b,PatientClinicalWriteValue(Qwg?Qwg.account:b,{id:t,deletedAtISO:n,rev:Qd5,deletedWithPatient:Qwq}))");
    expect(eb.split("catch(Qwe){PatientClinicalRethrow(Qwe);if(Qwg)throw Qwe}").length - 1, 'read/tombstone catches propagate clinical guards and preserve the private guarded rethrow').toBe(2);
    expect(src).toContain('await Bnp_poleEb(t,Qwp,n,Qwm)');
    expect(sekcja('async function ls(t,e){', 'async function ds(')).toContain('const Qx=await Bnp_nagrobek(I(),t)');
    expect(src).toContain('typeof a.rev=="number"&&isFinite(a.rev)&&a.rev>0&&(c.rev=a.rev)');
    expect(src).toContain('typeof f.rev=="number"&&isFinite(f.rev)&&f.rev>0&&(E.rev=f.rev)');
    expect(src).toContain('{const Qw=Bnp_pole(a);Qw&&(c.deletedWithPatient=Qw)}');
    expect(src).toContain('{const Qw=Bnp_pole(f);Qw&&(E.deletedWithPatient=Qw)}');
    // przegląd 1 (F3): pojedynczy nagrobek notatki w adapterach IndexedDB, pamięciowym i pośredniczącym
    expect(src).toContain('async getPatientNoteTombstoneForUser(o,a){const i=(await r(o)).transaction(Kt,"readonly").objectStore(Kt);return t(i.get(a))}');
    expect(src).toContain('async getPatientNoteTombstoneForUser(u,f){if(!a.has(u))return;');
    expect(src).toContain('getPatientNoteTombstoneForUser:function(n,r){return typeof e.getPatientNoteTombstoneForUser=="function"');
  });
  it('przegląd 2: zapis notatki (Ad) przez Bnp_poZapisie, bez ślepego zdjęcia nagrobka; pętla CZEKA ze świeżym nagrobkiem i chwilą zapisu; chwila rekordu w Bnp_pole', () => {
    const ad = sekcja('async function Ad(t,e){', 'async function bo(');
    // P-SESJA-ZAPISU (PR-S, przegląd 2): Bnp_poZapisie dostaje też opcje zapisu notatki (sesja „Scal pacjentów”).
    expect(ad).toContain("await I().putPatientNoteForUser(b,PatientClinicalWriteValue(b,nt));");
    expect(ad.indexOf("await I().putPatientNoteForUser(b,PatientClinicalWriteValue(b,nt));")).toBeLessThan(ad.indexOf('await Bnp_poZapisie(s,$,J+1,t.patientId,e);'));
    expect(ad.indexOf('await Bnp_poZapisie(s,$,J+1,t.patientId,e);')).toBeGreaterThan(-1);
    expect(ad).not.toContain('removePatientNoteTombstoneForUser');
    const ratuj = sekcja('async function Bnp_ratuj(', '/* P-KOPIA-DANE-KONTA');
    const czeka = ratuj.slice(ratuj.indexOf('for (const id of czeka) {'));
    expect(czeka).toContain("n.updatedAtISO > k.R ? n.updatedAtISO : k.R;");
    expect(czeka).toContain("const nag = await Bnp_nagrobek(h, id);\n        if (nag && nag.deletedAtISO > R) return PatientClinicalWriteValue(PatientClinicalOperationAccount,undefined);");
    expect(sekcja('function Bnp_pole(', '\n}\n')).toContain('!Bnp_iso(n.deletedAtISO) || n.deletedAtISO >= Bnp_R_MAX');
  });
  it('uwaga Codexa P1: „Usuń pacjenta” — Eb pod blokadą notatki, bez mapy nagrobków; brak notatki → odnowienie nagrobka z polem', () => {
    const uz = sekcja('async function Bnp_usunZPacjentem(', '\n}\n');
    expect(uz).toContain('return Ac(id, async function () {');
    expect(uz).toContain('if (odczyt && !n) { await Bnp_odnowJeden(h, id, t, e, o); return; }');
    expect(uz).toContain('if (odczyt && n.patientId !== t) return;');
    expect(uz).toContain('await Eb(id, { patientId: t, deletedAtISO: e }, undefined, undefined, o);');
    expect(uz.indexOf('if (odczyt && !n)')).toBeLessThan(uz.indexOf('await Eb(id,'));
    const od = sekcja('async function Bnp_odnow(', '\n}\n');
    expect(od).toContain('if (n.patientId === t) await Eb(id, { patientId: t, deletedAtISO: e }, undefined, undefined, o);');
    expect(od).toContain('await Bnp_odnowJeden(h, id, t, e, o);');
    expect(sekcja('async function Bnp_odnowJeden(', '\n}\n')).toContain('const nag = await Bnp_nagrobek(h, id), p = Bnp_pole(nag);');
    // przegląd poprawki P1 (R2): nagrobek z polem innego pacjenta zostaje bez zmian (P1-8)
    expect(sekcja('async function Bnp_odnowJeden(', '\n}\n')).toContain("if (!p || p.patientId !== t) return PatientClinicalWriteValue(PatientClinicalOperationAccount,undefined);");
    // mapa nagrobków sprzed listy tylko jako lista kandydatów odnowienia: żadne Eb w źródle nie dostaje mapy
    expect(src.match(/\bEb\([^()]*\{[^{}]*\},\s*(Qnm|mapa)\)/g), 'Eb z mapą').toBe(null);
  });
  it('podgląd „Scal kopię konta” liczy te same stany co Le (Bnp_zlacz, Bnp_stan), z kartą przewidywaną po pętli kart', () => {
    const plan = sekcja('async function Bks_planDanych(', 'async function Bks_mapyOczekujacych(');
    expect(plan).toContain('const stan = await Bks_stanNotatek(kontekst, kopia, tutaj, nagrobki, zKopii, nagrobkiKopii);');
    expect(plan.split(', stan));').length - 1).toBe(2);
    const st = sekcja('async function Bks_stanNotatek(', 'const Bks_RODZAJE');
    expect(st).toContain('Bnp_zlacz(nagrobkiKopii.concat(nagrobki))');
    expect(st).toContain('Bks_kartaPo(kontekst, kopia, pid)');
  });
  it('przegląd przeniesienia na D-7 (MS2): Bnp_poZapisie zdejmuje nagrobek tylko przy karcie późniejszej niż e i zapisie późniejszym niż R', () => {
    const pz = sekcja('async function Bnp_poZapisie(', '\n}\n');
    expect(pz).toContain('if (karta !== null && (!(karta > p.deletedAtISO) || !(kiedy > nag.deletedAtISO))) {');
    expect(pz).toContain('const D = nag.deletedAtISO > kiedy ? nag.deletedAtISO : kiedy;');
  });
});
