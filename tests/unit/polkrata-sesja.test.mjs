// PR-S4 po P-CHMURA-OPIS: zapisy, które S4 dokłada w scalaniu z chmury (rekord złożony wersji, przypięta wersja z cienia,
// podniesienie rev, nagłówek karty po zmianach W3, rekordy cienia przed listą kosza i sprzątanie po niej), pilnują sesji
// tak jak zapisy z P-CHMURA-OPIS: zapis po await w kroku scalania tylko po synchronicznym sprawdzeniu sesji, bez await
// pomiędzy. Zmiana sesji w trakcie kroku (zalogowanie innego konta B w tej samej karcie albo ponowne zalogowanie tego
// samego konta) kończy scalanie błędem SESSION_CHANGED bez dalszych zapisów — ani na koncie B, ani w nowej sesji;
// następne scalenie w koncie A daje to samo co scalenie bez przerwy. Wyjątek z P-CHMURA-OPIS zostaje: po usunięciu
// wersji lista kosza (z rekordami cienia) idzie do konta i magazynu z chwili usunięcia, a treść cienia czyta z tego
// samego magazynu.
//
// Prawdziwy vilda_vault.js; urządzenie z przełączeniem — okno z atrapą crypto.subtle.decrypt i magazynem w pamięci
// z rejestrem wywołań: przełączenie (blokada i zalogowanie) w jednym, wskazanym miejscu kroku (nazwa funkcji albo wiersz
// kodu w stosie wywołań), po zakończeniu tej operacji. Sztuczny zegar, dane wyłącznie FIKCYJNE („Testowy Jan”).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  repo, SEJF, sztucznyZegar, przesunZegar, urzadzenie, jan, zapisz, gdzie, poprawMase, przypnij, doKosza,
  przytnij, sync, rundy, widoki, widok, stan,
} from './polkrata-uprzaz.mjs';

const M = 60e3;
const HASLO_B = 'Druga#Lekarka!2026bb';
afterEach(() => { vi.useRealTimers(); });

const KOD = {};
const kod = (f) => (KOD[f] || (KOD[f] = readFileSync(path.join(repo, f), 'utf8')));
// Wiersz kodu sejfu w stosie wywołań: new Function dokleja dwa wiersze nagłówka.
const wiersze = (re) => kod(SEJF.N).split('\n').flatMap((l, i) => (re.test(l) ? [i + 3] : []));
// Koniec scalania kosza: odczyt wersji karty (pierwszy await kroku) i odczyt treści wersji tutejszej.
const W_WERSJE = wiersze(/const wersje = nagrobki\.length \|\| Bgw_tu\.length \? await I\(\)\.listSnapshotsForUser\(b, patientId\) : \[\];/);
const W_TRESC = wiersze(/^ {10}try \{ tresc = await G\(lokalna\.payloadCipher\.iv, lokalna\.payloadCipher\.data\); \} catch \{ tresc = null; \}$/);
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

// Atrapa Web Locks (jak w chmura-scalanie-po-blokadzie): blokada metadanych konta trzymana przez test.
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

/* Urządzenie z przełączeniem sesji: konto B (zablokowane) i konto A w tym samym magazynie. hak.kiedy(rodzaj, metoda,
   argumenty, stos) — po zakończeniu operacji (odszyfrowanie albo wywołanie magazynu), dla której zwróci true, raz
   wykonuje hak.akcja (blokada i zalogowanie), a dopiero potem oddaje wynik operacji. Rejestr: [metoda, userId]. */
let nr = 0;
async function urzadzenieH(nazwa, opcje = {}) {
  nr += 1;
  // kiedy/akcja — przełączenie sesji (przelacz); dodatkowe — inne jednorazowe haki (np. „druga karta”).
  const hak = { kiedy: null, akcja: null, dodatkowe: [] };
  const uzbrojony = () => !!hak.kiedy || hak.dodatkowe.length > 0;
  const odpal = async (rodzaj, k, a, stos) => {
    for (const d of hak.dodatkowe.slice()) {
      if (d.kiedy(rodzaj, k, a, stos)) { hak.dodatkowe.splice(hak.dodatkowe.indexOf(d), 1); await d.akcja(); }
    }
    if (hak.kiedy && hak.kiedy(rodzaj, k, a, stos)) { hak.kiedy = null; await hak.akcja(); }
  };
  const subtle = new Proxy(globalThis.crypto.subtle, { get(cel, k) {
    const f = cel[k];
    if (typeof f !== 'function') return f;
    if (k !== 'decrypt') return f.bind(cel);
    return async (...a) => {
      const stos = uzbrojony() ? String(new Error().stack) : '';
      const r = await f.apply(cel, a);
      await odpal('decrypt', 'decrypt', a, stos);
      return r;
    };
  } });
  const win = {
    crypto: { subtle, getRandomValues: (x) => globalThis.crypto.getRandomValues(x), randomUUID: () => globalThis.crypto.randomUUID() },
    TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: makeStorage(), sessionStorage: makeStorage(),
    setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
    addEventListener() {}, removeEventListener() {}, AbortController,
    document: { addEventListener() {}, removeEventListener() {}, hidden: false },
    console: cicho,
  };
  if (opcje.indexedDB) win.indexedDB = opcje.indexedDB;
  if (opcje.locks) win.navigator = { locks: opcje.locks };
  win.window = win; win.self = win; win.top = win;
  win.localStorage.setItem('vildaRetention', '0');
  for (const f of ['vilda_crypto.js', 'vilda_retention.js', SEJF.N]) new Function('window', 'globalThis', kod(f))(win, win);
  const v = win.VildaVault;
  const wyw = [];
  const owin = (baza) => new Proxy(baza, { get(cel, k) {
    const f = cel[k];
    if (typeof f !== 'function') return f;
    return function (...a) {
      wyw.push([String(k), a[0]]);
      const stos = uzbrojony() ? String(new Error().stack) : '';
      const r = f.apply(cel, a);
      if (!uzbrojony() || !r || typeof r.then !== 'function') return r;
      return r.then(async (w) => { await odpal('magazyn', String(k), a, stos); return w; });
    };
  } });
  let px = null, baza = null;
  if (opcje.jednorazowo) v.setEphemeralMode(true);
  else { baza = v.createInMemoryAdapter(); px = owin(baza); v.setStorageAdapter(px); }
  const kontoB = opcje.bezB ? null : await v.createUser(HASLO_B, { label: `Fikcyjna Druga ${nr}`, iterations: 1000 });
  if (kontoB) v.lock('manual');
  const haslo = `Sesja#S4!2026${nr}aa`;
  const kontoA = await v.createUser(haslo, { label: `${nazwa}${nr}`, iterations: 1000, ...(opcje.chmura ? { storageMode: 'cloud-only' } : {}) });
  Object.assign(v, {
    __nazwa: nazwa, __app: 'N', __licz: { lista: 0, wersje: 0, karty: 0 }, __px: px, __baza: baza, __haslo: haslo,
    __uid: kontoA.userId, __uidB: kontoB && kontoB.userId, __hak: hak, __wyw: wyw, __win: win,
  });
  return v;
}

// „Testowy Jan”: 12 wersji na K, reszta dostaje komplet (jak urzadzenia() w polkrata-uprzaz.mjs); hakNa — urządzenie
// z przełączeniem sesji.
async function urzadzeniaH(nazwy, hakNa) {
  const u = {};
  for (const n of nazwy) u[n] = n === hakNa ? await urzadzenieH(n) : await urzadzenie(n);
  let pid = null;
  const ids = [];
  for (let i = 0; i < 12; i += 1) {
    const r = await zapisz(u.K, jan(100 + i, 20 + i), pid ? { patientId: pid } : {});
    pid = r.patientId; ids.push(r.snapshotId);
  }
  for (const n of nazwy) if (n !== 'K') await sync(u.K, u[n]);
  return { u, lista: nazwy.map((n) => u[n]), pid, ids, sid: ids[3] };
}

// Ładunek urządzenia bez jego koperty hasła i kluczy biometrii (urządzenia testu to osobne konta).
async function ladunek(z) {
  const l = JSON.parse(JSON.stringify(await z.exportSyncPayload()));
  delete l.credential; delete l.passkeys;
  return l;
}
const scal = (v, lad) => v.mergeSyncPayload(JSON.parse(JSON.stringify(lad)))
  .then((w) => ({ ok: true, w }), (e) => ({ ok: false, kod: e && e.code, busy: !!(e && e.vildaMergeBusy), e }));

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
// Zapisy magazynu po przełączeniu (dowolne konto) i operacje magazynu cienia konta B.
const zapisyPo = (v, st) => v.__wyw.slice(st.od).filter(([k]) => ZAPIS.test(k)).map(([k, u]) => `${k}(${kto(v, u)})`);
const cienB = (v, st) => v.__wyw.slice(st.od).filter(([k, u]) => /SnapshotShadow/.test(k) && u === v.__uidB).map(([k]) => k);
async function zalogujA(v) {
  v.__hak.kiedy = null;
  v.lock('manual');
  await v.unlockUser(v.__uid, v.__haslo);
}
const WARIANTY = [['zalogowanie innego konta (B)', true], ['ponowne zalogowanie tego samego konta', false]];

// Przebieg: przygotowanie (scenariusz), scalenie z przełączeniem w miejscu kiedy, sprawdzenia, następne scalenie w A.
async function przerwane(scen, kiedy, naB, opis) {
  const d = await scen();
  const st = przelacz(d.v, kiedy, naB);
  const w = await scal(d.v, d.lad);
  expect(st.zrobione, 'przełączenie w: ' + opis).toBe(true);
  expect(w.ok, 'scalanie przerwane').toBe(false);
  expect(w.kod).toBe('SESSION_CHANGED');
  expect(zapisyPo(d.v, st), 'żaden zapis ze starego scalania po zmianie sesji').toEqual([]);
  expect(cienB(d.v, st), 'magazyn cienia konta B nietknięty').toEqual([]);
  if (naB) {
    const mB = await d.v.__px.getUserMeta(d.v.__uidB);
    expect((mB && mB.snapshotTombstones) || [], 'lista kosza konta B pusta').toEqual([]);
    expect((await d.v.listPatients()).length, 'konto B bez kart').toBe(0);
  }
  await zalogujA(d.v);
  const w2 = await scal(d.v, d.lad);
  expect(w2.ok, 'następne scalenie w A').toBe(true);
  return d;
}

/* Rekord złożony wersji w pętli kart (Bgw_scal): K przypina wizytę, P poprawia masę (nie wie o gwiazdce); P scala K —
   treść z P, gwiazdka z K (58*). */
async function scenZlozony() {
  sztucznyZegar();
  const { u, sid } = await urzadzeniaH(['P', 'K'], 'P');
  przesunZegar(M); await przypnij(u.K, sid, true);
  przesunZegar(M); await poprawMase(u.P, sid, 58);
  przesunZegar(M);
  return { v: u.P, u, sid, lad: await ladunek(u.K) };
}
describe('S4 po P-CHMURA-OPIS: rekord złożony wersji w pętli kart (Bgw_scal)', () => {
  it('bez przełączenia: karta 58* (treść z P, gwiazdka z K)', async () => {
    const d = await scenZlozony();
    expect((await scal(d.v, d.lad)).ok).toBe(true);
    expect(widok(await stan(d.v, d.sid))).toBe('karta 58*');
  }, 120_000);
  for (const [opis, naB] of WARIANTY) {
    it(`${opis} w odczycie treści wersji tutejszej: bez zapisu rekordu złożonego, po następnym scaleniu karta 58*`, async () => {
      const d = await przerwane(scenZlozony, (r, k, a, s) => r === 'decrypt' && wFunkcji('Bgw_scal')(s), naB, 'Bgw_scal');
      expect(widok(await stan(d.v, d.sid))).toBe('karta 58*');
    }, 120_000);
  }
  it('applyEncryptedDelta: delta przerwana zmianą sesji — SESSION_CHANGED jak zajęta blokada (kursor stoi), bez zapisu', async () => {
    const d = await scenZlozony();
    const delta = await d.v.encryptPayloadForCurrentUser(d.lad);
    const st = przelacz(d.v, (r, k, a, s) => r === 'decrypt' && wFunkcji('Bgw_scal')(s), true);
    const w = await d.v.applyEncryptedDelta(delta).then(() => ({ ok: true }), (e) => ({ ok: false, kod: e && e.code, busy: !!(e && e.vildaMergeBusy) }));
    expect(st.zrobione).toBe(true);
    expect(w).toEqual({ ok: false, kod: 'SESSION_CHANGED', busy: true });
    expect(zapisyPo(d.v, st)).toEqual([]);
  }, 120_000);
});

/* Wersja późniejsza niż kosz przyjmuje rejestr gwiazdki nagrobka (Bgw_zloz, koniec scalania): P przypina, K (bez wiedzy)
   daje do kosza, C (bez wiedzy o niczym) poprawia masę na 74; P→K, potem C scala K — karta 74* (przypieta-w3-reguly). */
async function scenPozniejsza() {
  sztucznyZegar();
  const { u, sid } = await urzadzeniaH(['P', 'K', 'C'], 'C');
  przesunZegar(M); await przypnij(u.P, sid, true);
  przesunZegar(M); await doKosza(u.K, sid);
  przesunZegar(M); await poprawMase(u.C, sid, 74);
  przesunZegar(M); await sync(u.P, u.K);
  return { v: u.C, u, sid, lad: await ladunek(u.K) };
}
describe('S4 po P-CHMURA-OPIS: wersja późniejsza niż kosz przyjmuje gwiazdkę nagrobka (Bgw_zloz)', () => {
  it('bez przełączenia: karta 74*', async () => {
    const d = await scenPozniejsza();
    expect((await scal(d.v, d.lad)).ok).toBe(true);
    expect(widok(await stan(d.v, d.sid))).toBe('karta 74*');
  }, 120_000);
  for (const [opis, naB] of WARIANTY) {
    it(`${opis} w odczycie treści wersji: bez zapisu rekordu złożonego, po następnym scaleniu karta 74*`, async () => {
      const d = await przerwane(scenPozniejsza, (r, k, a, s) => r === 'decrypt' && wFunkcji('Bgw_zloz')(s), naB, 'Bgw_zloz');
      expect(widok(await stan(d.v, d.sid))).toBe('karta 74*');
    }, 120_000);
  }
});

/* Przypięta wersja, która przeżyła przycięcie, przyjmuje nowszą treść z cienia (Bgw_zloz z odczytem cienia): P przypina,
   C (bez wiedzy) poprawia na 74, K dostaje 74 i traci ją przez przycięcie C (cień 74); K scala P — 74*. */
async function scenCienPrzypietej() {
  sztucznyZegar();
  const { u, sid } = await urzadzeniaH(['P', 'K', 'C'], 'K');
  przesunZegar(M); await przypnij(u.P, sid, true);
  przesunZegar(M); await poprawMase(u.C, sid, 74);
  przesunZegar(M); await sync(u.C, u.K);
  przesunZegar(M); await przytnij(u.C, sid);
  przesunZegar(M); await sync(u.C, u.K);
  przesunZegar(M);
  return { v: u.K, u, sid, lad: await ladunek(u.P) };
}
describe('S4 po P-CHMURA-OPIS: przypięta wersja przyjmuje nowszą treść z cienia (Bgw_zloz, odczyt cienia)', () => {
  it('bez przełączenia: karta 74*', async () => {
    const d = await scenCienPrzypietej();
    expect((await scal(d.v, d.lad)).ok).toBe(true);
    expect(widok(await stan(d.v, d.sid))).toBe('karta 74*');
  }, 120_000);
  it('strażnik: jeden odczyt treści wersji tutejszej w końcu scalania kosza', () => { expect(W_TRESC).toHaveLength(1); });
  for (const [opis, naB] of WARIANTY) {
    it(`${opis} przed odczytem cienia: cień czytany tylko w sesji scalania, po następnym scaleniu karta 74*`, async () => {
      const d = await przerwane(scenCienPrzypietej, (r, k, a, s) => r === 'decrypt' && wWierszu(W_TRESC[0])(s), naB, 'odczyt treści przed Bgw_zloz');
      expect(widok(await stan(d.v, d.sid))).toBe('karta 74*');
    }, 120_000);
    it(`${opis} w odszyfrowaniu cienia: bez zapisu rekordu złożonego, po następnym scaleniu karta 74*`, async () => {
      const d = await przerwane(scenCienPrzypietej, (r, k, a, s) => r === 'decrypt' && wFunkcji('Bgw_zloz')(s), naB, 'Bgw_zloz');
      expect(widok(await stan(d.v, d.sid))).toBe('karta 74*');
    }, 120_000);
  }
});

/* „Przypięta → karta”: wersja wraca z cienia (Bgw_wskrzes, trasa N4 z polkrata-cien): gwiazdka P, kosz K, P←K, C poprawia
   na 74, K←C, przycięcie C, K←C (u K cień 74), K scala P — 74* wraca na K. */
async function scenWskrzes() {
  sztucznyZegar();
  const { u, sid } = await urzadzeniaH(['P', 'K', 'C'], 'K');
  const { P, K, C } = u;
  przesunZegar(M); await przypnij(P, sid, true);
  przesunZegar(M); await doKosza(K, sid);
  przesunZegar(M); await sync(K, P);
  przesunZegar(M); await poprawMase(C, sid, 74);
  przesunZegar(M); await sync(C, K);
  przesunZegar(M); await przytnij(C, sid);
  przesunZegar(M); await sync(C, K);
  przesunZegar(M);
  return { v: K, u, sid, lad: await ladunek(P) };
}
describe('S4 po P-CHMURA-OPIS: przypięta wersja wraca z cienia (Bgw_wskrzes)', () => {
  it('bez przełączenia: karta 74*', async () => {
    const d = await scenWskrzes();
    expect((await scal(d.v, d.lad)).ok).toBe(true);
    expect(widok(await stan(d.v, d.sid))).toBe('karta 74*');
  }, 120_000);
  it('strażnik: jeden odczyt wersji w końcu scalania kosza', () => { expect(W_WERSJE).toHaveLength(1); });
  for (const [opis, naB] of WARIANTY) {
    it(`${opis} w odczycie wersji karty (przed odczytem cienia): cień czytany tylko w sesji scalania, po następnym scaleniu karta 74*`, async () => {
      const d = await przerwane(scenWskrzes, (r, k, a, s) => r === 'magazyn' && k === 'listSnapshotsForUser' && wWierszu(W_WERSJE[0])(s), naB, 'odczyt wersji końca scalania');
      expect(widok(await stan(d.v, d.sid))).toBe('karta 74*');
    }, 120_000);
    it(`${opis} w odszyfrowaniu cienia: wersja nie wraca w nowej sesji, po następnym scaleniu karta 74*`, async () => {
      const d = await przerwane(scenWskrzes, (r, k, a, s) => r === 'decrypt' && wFunkcji('Bgw_wskrzes')(s), naB, 'Bgw_wskrzes');
      expect(widok(await stan(d.v, d.sid))).toBe('karta 74*');
    }, 120_000);
  }
});

/* P-REV-MAX (R3a) w końcu scalania (Bpk_podnies) i nagłówek karty po zmianach W3: ładunek z wersją o wyższej rev,
   którą pokonuje kosz z tego samego ładunku (jak od starszej aplikacji), a tutejsza wersja jest późniejsza niż kosz —
   zostaje w karcie i dostaje wyższą rev (5). */
async function scenRev() {
  sztucznyZegar();
  const { u, sid, pid } = await urzadzeniaH(['P', 'K'], 'P');
  przesunZegar(M);
  const kosz = new Date(Date.now()).toISOString();
  przesunZegar(M); await poprawMase(u.P, sid, 58);
  przesunZegar(M);
  const lad = await ladunek(u.K);
  const S = lad.patients.find((p) => p.patientId === pid).snapshots.find((x) => x.snapshotId === sid);
  S.rev = 5;
  lad.snapshotTombstones = [{ patientId: pid, snapshotId: sid, deletedAtISO: kosz, savedAtISO: S.savedAtISO, rev: 5, updatedAtISO: S.updatedAtISO || null }];
  return { v: u.P, u, sid, lad };
}
const karta = async (v, sid) => { const g = await gdzie(v, sid); return g && { masa: g.s.payload.user.weight, rev: g.s.rev, kosz: !!(await v.listTrashedSnapshots()).find((e) => e.snapshotId === sid) }; };
describe('S4 po P-CHMURA-OPIS: wyższa rev pominiętej wersji z ładunku (Bpk_podnies) i nagłówek karty', () => {
  it('bez przełączenia: karta 58 z rev 5, bez kosza', async () => {
    const d = await scenRev();
    expect((await scal(d.v, d.lad)).ok).toBe(true);
    expect(await karta(d.v, d.sid)).toEqual({ masa: 58, rev: 5, kosz: false });
  }, 120_000);
  for (const [opis, naB] of WARIANTY) {
    it(`${opis} w odczycie wersji karty: bez zapisu wyższej rev, po następnym scaleniu karta 58 z rev 5`, async () => {
      const d = await przerwane(scenRev, (r, k, a, s) => r === 'magazyn' && k === 'listSnapshotsForUser' && wWierszu(W_WERSJE[0])(s), naB, 'odczyt wersji końca scalania');
      expect(await karta(d.v, d.sid)).toEqual({ masa: 58, rev: 5, kosz: false });
    }, 120_000);
    it(`${opis} w przebudowie nagłówka karty: bez zapisu karty w nowej sesji, po następnym scaleniu karta 58 z rev 5`, async () => {
      const d = await przerwane(scenRev, (r, k, a, s) => r === 'decrypt' && wFunkcji('Bkz_przebudujNaglowek')(s), naB, 'Bkz_przebudujNaglowek');
      expect(await karta(d.v, d.sid)).toEqual({ masa: 58, rev: 5, kosz: false });
    }, 120_000);
  }
});

// Cień w liście konta: zaślepki bez rekordu i rekordy, których lista nie wskazuje.
async function cienListy(v) {
  const m = (await v.__px.getUserMeta(v.__uid)) || {};
  const zasl = (m.snapshotTombstones || []).filter((e) => e.Bpk && e.Bpk.t && e.Bpk.t.c && e.Bpk.t.c.cien === 1).map((e) => e.Bpk.t.c.iv);
  const klucze = await v.__px.listSnapshotShadowKeysForUser(v.__uid);
  return { zaslepki: zasl.length, wiszace: zasl.filter((k) => !klucze.includes(k)).length, sieroty: klucze.filter((k) => !zasl.includes(k)).length };
}

/* Nowy rekord cienia przed listą kosza, bez usunięcia wersji w tym scaleniu (lista tylko w sesji scalania): K daje
   wizytę do kosza (P←K), P przycina pozostałe; C (bez wiedzy o koszu) poprawia ją na 74 i przycina — u P kosz traci
   ważność, jego treść zostaje cieniem (rekord przed listą). */
async function scenNowyCien() {
  sztucznyZegar();
  const { u, sid, pid } = await urzadzeniaH(['P', 'K', 'C'], 'P');
  przesunZegar(M); await doKosza(u.K, sid);
  przesunZegar(M); await sync(u.K, u.P);
  przesunZegar(M); await u.P.pruneSnapshotsForPatient(pid, { recentHours: 0 });
  przesunZegar(M); await poprawMase(u.C, sid, 74);
  przesunZegar(M); await przytnij(u.C, sid);
  przesunZegar(M);
  return { v: u.P, u, sid, lad: await ladunek(u.C) };
}
describe('S4 po P-CHMURA-OPIS: rekordy cienia przed listą kosza i sprzątanie po niej (lista w sesji scalania)', () => {
  it('bez przełączenia (nowy cień): kosz nieaktualny — brak w karcie i koszu, cień w liście z rekordem', async () => {
    const d = await scenNowyCien();
    expect((await scal(d.v, d.lad)).ok).toBe(true);
    expect(widok(await stan(d.v, d.sid))).toBe('brak');
    expect(await cienListy(d.v)).toEqual({ zaslepki: 1, wiszace: 0, sieroty: 0 });
  }, 120_000);
  for (const [opis, naB] of WARIANTY) {
    it(`${opis} po zapisie rekordów cienia: lista nie zapisuje się w nowej sesji, po następnym scaleniu jak bez przerwy`, async () => {
      const d = await przerwane(scenNowyCien, (r, k, a) => r === 'magazyn' && k === 'writeSnapshotShadowsForUser' && (a[1] || []).length > 0, naB, 'zapis rekordów cienia');
      expect(widok(await stan(d.v, d.sid))).toBe('brak');
      const c = await cienListy(d.v);
      expect({ zaslepki: c.zaslepki, wiszace: c.wiszace }).toEqual({ zaslepki: 1, wiszace: 0 });
    }, 120_000);
  }

  /* Sprzątanie po liście (polkrata-cien M2): u P cień 58 (przycięcie C); K ze starą kopią daje wizytę do kosza — u P
     ważny kosz z treścią z cienia, rekord cienia usuwa sprzątanie po zapisie listy. */
  async function scenSprzatanie() {
    sztucznyZegar();
    const { u, sid, pid } = await urzadzeniaH(['P', 'K', 'C'], 'P');
    przesunZegar(M); await poprawMase(u.P, sid, 58);
    przesunZegar(M); await sync(u.P, u.C);
    przesunZegar(M); await przytnij(u.C, sid);
    przesunZegar(M); await sync(u.C, u.P);
    przesunZegar(M); await doKosza(u.K, sid);
    przesunZegar(M);
    return { v: u.P, u, sid, pid, lad: await ladunek(u.K) };
  }
  it('bez przełączenia (sprzątanie): kosz 58, 10 zaślepek, 0 sierot', async () => {
    const d = await scenSprzatanie();
    expect((await scal(d.v, d.lad)).ok).toBe(true);
    expect(widok(await stan(d.v, d.sid))).toBe('kosz 58');
    expect(await cienListy(d.v)).toEqual({ zaslepki: 10, wiszace: 0, sieroty: 0 });
  }, 120_000);
  for (const [opis, naB] of WARIANTY) {
    it(`${opis} po zapisie listy, przed sprzątaniem: bez usuwania rekordów w nowej sesji; sierotę zamiata pierwszy zapis listy konta A`, async () => {
      const d = await przerwane(scenSprzatanie, (r, k) => r === 'magazyn' && k === 'putUserMeta', naB, 'zapis listy');
      expect(widok(await stan(d.v, d.sid))).toBe('kosz 58');
      expect(await cienListy(d.v), 'sprzątanie przerwane — sierota do zamiecenia').toEqual({ zaslepki: 10, wiszace: 0, sieroty: 1 });
      // Pierwszy zapis listy w sesji konta A zamiata sieroty (raz na sesję): kosz nowej wizyty.
      przesunZegar(M); const nowa = await d.v.savePatient(jan(130, 30), { dedup: false, patientId: d.pid });
      przesunZegar(M); await d.v.moveSnapshotToTrash(d.pid, nowa.snapshotId, { odepnij: true });
      expect((await cienListy(d.v)).sieroty, 'sierota zamieciona').toBe(0);
    }, 120_000);
  }
});

/* Obca zaślepka sprawdzana w magazynie przed zapisem nowych rekordów cienia (Bpc_przedZapisem; wyścig kart jednego
   urządzenia jak polkrata-cien M8a, ale rekord zostaje): dwie karty. Jan — u P 11 zaślepek (przycięcie C). Ola — ważny
   kosz u P (z K), P przycina resztę; C (bez wiedzy o koszu) poprawia tę wizytę i przycina — u P kosz traci ważność,
   jego treść zostaje nowym cieniem. W trakcie scalenia C „druga karta” zdejmuje z listy na dysku zaślepkę czwartej
   wizyty Jana (rekord zostaje), więc lista scalenia wskazuje zaślepkę spoza listy na dysku. */
const ola = (height, weight) => ({ name: 'Testowa Ola', user: { lastName: 'Testowa', firstName: 'Ola', dobISO: '2017-05-01', sex: 'F', height, weight } });
async function scenObca() {
  sztucznyZegar();
  const P = await urzadzenieH('P'), K = await urzadzenie('K'), C = await urzadzenie('C');
  const karta12 = async (f) => {
    let pid = null; const ids = [];
    for (let i = 0; i < 12; i += 1) { const r = await zapisz(K, f(100 + i, 20 + i), pid ? { patientId: pid } : {}); pid = r.patientId; ids.push(r.snapshotId); }
    return { pid, sid: ids[3] };
  };
  const J = await karta12(jan), O = await karta12(ola);
  przesunZegar(M); await sync(K, P); await sync(K, C);
  przesunZegar(M); await poprawMase(P, J.sid, 58);
  przesunZegar(M); await sync(P, C);
  przesunZegar(M); await przytnij(C, J.sid);
  przesunZegar(M); await sync(C, P);
  przesunZegar(M); await doKosza(K, O.sid);
  przesunZegar(M); await sync(K, P);
  przesunZegar(M); await P.pruneSnapshotsForPatient(O.pid, { recentHours: 0 });
  przesunZegar(M); await poprawMase(C, O.sid, 74);
  przesunZegar(M); await przytnij(C, O.sid);
  przesunZegar(M);
  // „Druga karta” po starcie scalenia (pierwszy odczyt wersji karty): zaślepka czwartej wizyty Jana znika z listy na dysku.
  P.__hak.dodatkowe.push({ kiedy: (r, k) => r === 'magazyn' && k === 'listSnapshotsForUser', akcja: async () => {
    const m = await P.__baza.getUserMeta(P.__uid);
    const lista = m.snapshotTombstones.map((e) => (e.snapshotId === J.sid ? { ...e, Bpk: { ...e.Bpk, t: { ...e.Bpk.t, c: null } } } : e));
    await P.__baza.putUserMeta(P.__uid, { ...m, snapshotTombstones: lista });
  } });
  return { v: P, u: { P, K, C }, J, O, sid: O.sid, lad: await ladunek(C) };
}
describe('S4 po P-CHMURA-OPIS: obca zaślepka sprawdzona przed zapisem nowych rekordów cienia (Bpc_przedZapisem)', () => {
  it('bez przełączenia: kosz Oli nieaktualny — nowy cień z rekordem; zaślepka Jana sprawdzona w magazynie i zostaje', async () => {
    const d = await scenObca();
    const od = d.v.__wyw.length;
    expect((await scal(d.v, d.lad)).ok).toBe(true);
    expect(d.v.__hak.dodatkowe, '„druga karta” zadziałała').toEqual([]);
    expect(d.v.__wyw.slice(od).filter(([k]) => k === 'getSnapshotShadowForUser').length, 'obca zaślepka sprawdzona w magazynie').toBe(1);
    expect(widok(await stan(d.v, d.O.sid))).toBe('brak');
    expect(await cienListy(d.v)).toEqual({ zaslepki: 12, wiszace: 0, sieroty: 0 });
  }, 120_000);
  for (const [opis, naB] of WARIANTY) {
    it(`${opis} w sprawdzeniu obcej zaślepki: bez zapisu rekordów cienia i listy w nowej sesji; po następnym scaleniu kosz Oli jak bez przerwy`, async () => {
      const d = await przerwane(scenObca, (r, k, a, s) => r === 'magazyn' && k === 'getSnapshotShadowForUser' && wFunkcji('Bpc_przedZapisem')(s), naB, 'Bpc_przedZapisem');
      expect(widok(await stan(d.v, d.O.sid))).toBe('brak');
      expect((await cienListy(d.v)).wiszace).toBe(0);
    }, 120_000);
  }
});

/* Wyjątek P-CHMURA-OPIS (lista kosza po usunięciu wersji, bez sprawdzania sesji): rekordy cienia, sprzątanie i odczyt treści
   kosza z cienia idą do konta i magazynu z chwili usunięcia wersji. */
describe('S4 po P-CHMURA-OPIS: lista kosza po usunięciu wersji — cień w koncie i magazynie z chwili usunięcia', () => {
  it('zalogowanie konta B w oknie zapisu listy (P←C usuwa 11 wersji): rekordy cienia do konta A, nic na koncie B; po zalogowaniu A kosz 58 na trzech', async () => {
    sztucznyZegar();
    const { u, sid } = await urzadzeniaH(['P', 'K', 'C'], 'P');
    przesunZegar(M); await poprawMase(u.P, sid, 58);
    przesunZegar(M); await sync(u.P, u.C);
    przesunZegar(M); await przytnij(u.C, sid);
    przesunZegar(M);
    const lad = await ladunek(u.C);
    // Drugi odczyt metadanych po zapisie nagłówka karty — odczyt pod blokadą metadanych w Bmk_zmien (jak M9).
    let naglowek = false, odczyty = 0;
    const st = przelacz(u.P, (r, k) => {
      if (r !== 'magazyn') return false;
      if (k === 'putPatientForUser') naglowek = true;
      return k === 'getUserMeta' && naglowek && (odczyty += 1) === 2;
    }, true);
    const w = await scal(u.P, lad);
    expect(st.zrobione).toBe(true);
    expect(w.kod).toBe('SESSION_CHANGED');
    const poZmianie = u.P.__wyw.slice(st.od);
    expect(poZmianie.filter(([k, x]) => x === u.P.__uidB && (ZAPIS.test(k) || /SnapshotShadow/.test(k))).map(([k]) => k), 'nic na koncie B').toEqual([]);
    expect(poZmianie.filter(([k, x]) => k === 'writeSnapshotShadowsForUser' && x === u.P.__uid).length, 'rekordy cienia do konta A').toBeGreaterThan(0);
    await zalogujA(u.P);
    expect(await cienListy(u.P)).toEqual({ zaslepki: 11, wiszace: 0, sieroty: 0 });
    przesunZegar(M); await doKosza(u.K, sid);
    przesunZegar(M); await sync(u.K, u.P);
    await rundy([u.P, u.K, u.C]);
    expect(await widoki(u, sid)).toEqual({ P: 'kosz 58', K: 'kosz 58', C: 'kosz 58' });
  }, 120_000);
});

/* Wyjątek P-CHMURA-OPIS w trybie jednorazowym i chmurowym: blokada z bezczynności, gdy lista kosza czeka na blokadę
   metadanych, a scalanie usunęło już wersję. Treść ważnego kosza z cienia (zaślepka w liście) doczytuje się z magazynu
   z chwili usunięcia — nie z bieżącego (po końcu sesji jednorazowej: IndexedDB; w trybie chmurowym: trwała baza bez
   cienia). Scenariusz jak polkrata-cien M2 z usunięciem wersji: u P cień 58 (przycięcie C), nowa wizyta N na P; K ze
   starą kopią 23 daje do kosza czwartą wizytę i N — u P scalenie K usuwa N, a kosz czwartej bierze treść 58 z cienia. */
const BLOKADA_LISTY = 'vilda-note-kosz-zapisow';
async function scenKoszZCienia(opcjeH) {
  sztucznyZegar();
  const locks = atrapaLocks();
  const P = await urzadzenieH('P', { ...opcjeH, locks, bezB: true });
  const K = await urzadzenie('K'), C = await urzadzenie('C');
  let pid = null;
  const ids = [];
  for (let i = 0; i < 12; i += 1) {
    const r = await zapisz(K, jan(100 + i, 20 + i), pid ? { patientId: pid } : {});
    pid = r.patientId; ids.push(r.snapshotId);
  }
  przesunZegar(M); await sync(K, P); await sync(K, C);
  const sid = ids[3];
  przesunZegar(M); await poprawMase(P, sid, 58);
  przesunZegar(M); await sync(P, C);
  przesunZegar(M); await przytnij(C, sid);
  przesunZegar(M); await sync(C, P);
  przesunZegar(M); await doKosza(K, sid);
  const N = await zapisz(P, jan(130, 30), { patientId: pid });
  przesunZegar(M); await sync(P, K);
  przesunZegar(M); await K.moveSnapshotToTrash(pid, N.snapshotId, { odepnij: true });
  przesunZegar(M);
  return { P, K, C, sid, pid, N: N.snapshotId, locks, lad: await ladunek(K) };
}
// Scalenie z blokadą „idle”, gdy lista kosza czeka na blokadę metadanych (wersja N już usunięta).
async function scalZBlokada(d, poBlokadzie) {
  let zwolnij, wzieta;
  const trzymana = new Promise((r) => { zwolnij = r; });
  const ma = new Promise((r) => { wzieta = r; });
  d.locks.request(BLOKADA_LISTY, () => { wzieta(); return trzymana; });
  await ma;
  const scalanie = scal(d.P, d.lad);
  for (let i = 0; i < 400 && d.locks.czekajacych(BLOKADA_LISTY) === 0; i += 1) await chwila(2);
  expect(d.locks.czekajacych(BLOKADA_LISTY), 'lista kosza czeka na blokadę metadanych').toBe(1);
  expect((await d.P.getPatient(d.pid)).snapshots.map((x) => x.snapshotId), 'N już usunięta').not.toContain(d.N);
  d.P.lock('idle');
  if (poBlokadzie) poBlokadzie();
  zwolnij();
  // Atrapa IndexedDB nigdy nie kończy otwarcia: odczyt z bieżącego magazynu zawisłby — wtedy liczy się nazwa bazy.
  const w = await Promise.race([scalanie, chwila(3000).then(() => ({ ok: false, kod: 'WISI' }))]);
  await chwila(30);
  return w;
}
describe('S4 po P-CHMURA-OPIS: treść kosza z cienia na liście po usunięciu wersji — z magazynu z chwili usunięcia', () => {
  it('„Zaloguj jednorazowo”: blokada po usunięciu wersji — treść kosza z cienia z magazynu sesji, bez bazy IndexedDB', async () => {
    const otwarte = [];
    const d = await scenKoszZCienia({ jednorazowo: true, indexedDB: { open(n) { otwarte.push(n); return {}; }, deleteDatabase() { return {}; } } });
    const w = await scalZBlokada(d, () => {
      // Pamięć sesji veph:* czyści przy końcu sesji jednorazowej VildaPersistence (tu nieładowany) — jak ona:
      d.P.__win.sessionStorage.removeItem('veph:vault:adapter-v1');
    });
    expect(otwarte, 'żadna baza IndexedDB (konto jednorazowe)').toEqual([]);
    expect(w.kod).toBe('SESSION_CHANGED');
  }, 120_000);

  it('tryb chmurowy, bez blokady: kosz 58 (treść z cienia), po ponownym logowaniu kosz 58', async () => {
    const d = await scenKoszZCienia({ chmura: true });
    expect(d.P.isCloudOnlyMode()).toBe(true);
    expect((await scal(d.P, d.lad)).ok).toBe(true);
    expect(widok(await stan(d.P, d.sid))).toBe('kosz 58');
    await zalogujA(d.P);
    expect(widok(await stan(d.P, d.sid))).toBe('kosz 58');
  }, 120_000);

  it('tryb chmurowy: blokada „idle” po usunięciu wersji — treść kosza z cienia z części sesyjnej (0 rekordów cienia w trwałej bazie); po ponownym logowaniu kosz 58 jak bez blokady', async () => {
    const d = await scenKoszZCienia({ chmura: true });
    const od = d.P.__wyw.length;
    const w = await scalZBlokada(d);
    expect(w.kod).toBe('SESSION_CHANGED');
    expect(d.P.__wyw.slice(od).filter(([k]) => k === 'writeSnapshotShadowsForUser').length, 'trwała baza bez zapisów cienia').toBe(0);
    await zalogujA(d.P);
    expect(d.P.isCloudOnlyMode()).toBe(true);
    expect(widok(await stan(d.P, d.sid)), 'kosz z treścią z cienia (jak bez blokady)').toBe('kosz 58');
  }, 120_000);
});
