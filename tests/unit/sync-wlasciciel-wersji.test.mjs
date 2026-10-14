import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-SYNC-WLASCICIEL — „kradzież wersji” w scalaniu synchronizacji (Bsl_scalPacjenta).
//
// Klucz wersji (snapshotId) jest wspólny dla całego konta, a scalanie sprawdzało „nowość” wersji tylko w karcie
// z ładunku. Typowy przebieg: urządzenie A robi „Scal pacjentów” X → Y, a urządzenie B (jeszcze o tym nie wie) zapisuje
// nową wersję X. Nagrobek X przegrywa z tym zapisem, X wraca — i dotąd zabierał spod Y swoje dawne wersje (albo Y
// zabierał je spod X), bez porównania rekordów i bez korekty licznika drugiej karty.
//
// Zmierzone na `audyt` 2df41a8 (każdy przypadek oznaczony [CZERWONY na audyt] wtedy nie przechodził; [ZIELONY na
// audyt] — kontrola, która przechodziła i musi przechodzić dalej):
//   - wynik zależny od kolejności synchronizacji: chmura B→A — A: X 3/3, Y licznik 5 przy 3 wersjach; chmura A→B —
//     B: X licznik 3 przy 1 wersji;
//   - wymiana krzyżowa: „ping-pong” właściciela bez końca (16 zmian w 4 rundach; A: X 5/1, Y 9/5);
//   - poprawka pomiaru zrobiona po scaleniu na drugim urządzeniu ginęła pod starszą treścią (61 → 60 mies.);
//   - wyścig z zapisem w innej karcie: licznik X 4 przy 2 wersjach;
//   - licznik rozjechany raz zostawał rozjechany na zawsze (gałąź istniejącej karty liczyła przyrostowo).
// Ten plik (130 testów) na `audyt` 2df41a8: 96 czerwonych; na pierwszej wersji tej zmiany (88f558c): 20 — uwagi
// recenzentów: delta karty celu przed osobną deltą nagrobka gubiła ostatnią wersję scalonej karty, dwie równoległe
// poprawki rozjeżdżały urządzenia, delta jednej karty czytała wersje całego konta (oraz strażniki źródła i koszt).
// Pierwsza wersja pliku (55 testów) na `audyt`: 43 czerwone; na wariancie badacza W2e: 14; na szkicu krytyka W2f: 7.
//
// Prawdziwy vilda_vault.js i vilda_crypto.js, dwa „urządzenia” = dwa sejfy z osobnymi magazynami w pamięci, prawdziwe
// exportSyncPayload → mergeSyncPayload. Modele synchronizacji jak vilda_sync.js: „chmura” (pobierz, scal, wyślij pełny
// eksport; ETag szereguje wysyłki), „krzyżowa” (oba urządzenia eksportują, potem każde scala cudzy ładunek — jak
// mijające się delty) i „delty+chmura” (runda 1: prawdziwe buildPatientDelta karty i osobno buildTombstoneDelta
// nagrobków, jak zdarzenia vilda_sync_integration; dalej chmura). Scenariusze idą w obu kolejnościach identyfikatorów
// X i Y (remis rozstrzyga mniejszy patientId), więc wynik nie zależy od losowania. Retencja wyłączona.
// Dane wyłącznie FIKCYJNE („Testowy Jan”).

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function magazyn() {
  const m = Object.create(null);
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
    key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
  };
}

/* Atrapa Web Locks (jak w scalanie-blokada.test.mjs): jedna blokada wyłączna na nazwę, kolejka FIFO, `ifAvailable`
   i `signal`. */
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

function odroczone() {
  let rozwiaz;
  const obietnica = new Promise((r) => { rozwiaz = r; });
  return { obietnica, rozwiaz };
}
const chwila = (ms) => new Promise((r) => { setTimeout(r, ms); });

/* Magazyn w pamięci owinięty: liczy wywołania metod (licz) i ma pułapki — pulapka(metoda, warunek) wstrzymuje pierwsze
   wywołanie spełniające warunek (przed wykonaniem), aż test je zwolni. */
function owin(adapter) {
  const licz = Object.create(null);
  const pulapki = [];
  const owiniety = new Proxy(adapter, {
    get(cel, klucz) {
      const f = cel[klucz];
      if (typeof f !== 'function') return f;
      return async function (...args) {
        licz[klucz] = (licz[klucz] || 0) + 1;
        for (const p of pulapki) {
          if (p.zuzyta || p.metoda !== klucz || !p.warunek(...args)) continue;
          p.zuzyta = true;
          p.osiagnieta.rozwiaz();
          await p.zwolnienie.obietnica;
        }
        return f.apply(cel, args);
      };
    },
  });
  function pulapka(metoda, warunek) {
    const p = { metoda, warunek, zuzyta: false, osiagnieta: odroczone(), zwolnienie: odroczone() };
    pulapki.push(p);
    return { osiagnieta: p.osiagnieta.obietnica, zwolnij: () => p.zwolnienie.rozwiaz() };
  }
  const zeruj = () => { Object.keys(licz).forEach((k) => { delete licz[k]; }); };
  return { owiniety, licz, pulapka, zeruj };
}

let licznik = 0;
async function urzadzenie(nazwa, opcje = {}) {
  licznik += 1;
  const win = {
    crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: magazyn(), sessionStorage: magazyn(),
    setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
    addEventListener() {}, removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {}, hidden: false },
    AbortController,
  };
  if (opcje.locks) win.navigator = { locks: opcje.locks };
  win.window = win; win.self = win; win.top = win;
  win.localStorage.setItem('vildaRetention', '0'); // retencja wyłączona: testy liczą wersje same
  loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_vault.js', win);
  const v = win.VildaVault;
  const baza = v.createInMemoryAdapter();
  // Magazyn bez odczytu wersji po kluczu (obcy adapter) — droga zapasowa.
  if (opcje.bezOdczytuPoKluczu) delete baza.getSnapshotForUser;
  const w = owin(baza);
  v.setStorageAdapter(w.owiniety);
  await v.createUser(`Sync#Wlasciciel!2026${licznik}aa`, { label: `${nazwa}${licznik}`, iterations: 10000 });
  const [u] = await v.listUsers();
  return { nazwa, v, baza, uid: u.userId, licz: w.licz, zeruj: w.zeruj, pulapka: w.pulapka };
}

// Dwa „urządzenia” to w teście dwa konta z różnymi hasłami; pole credential z ładunku dotyczy hasła konta, nie
// pacjentów, więc go nie przenosimy.
const kopia = (x) => { const y = JSON.parse(JSON.stringify(x)); if (y && typeof y === 'object') delete y.credential; return y; };

const pomiar = (m) => ({ uid: `m-${m}`, ageMonths: m, ageYears: m / 12, height: 90 + m / 2, weight: 12 + m / 6 });
const zapis = (wieki) => ({
  name: 'Testowy Jan',
  user: { lastName: 'Testowy', firstName: 'Jan', sex: 'M', age: 5, ageMonths: 6, height: 110, weight: 19 },
  advanced: { data: { measurements: wieki.map(pomiar) } },
});
const pomiaryZ = (p) => ((((p || {}).advanced || {}).data || {}).measurements || []).map((m) => `${m.ageMonths}:${m.height}`).join(',');

/* Karta „Testowy Jan” z dwiema wersjami (60, potem 60+66). */
async function karta(v) {
  const a = await v.savePatient(zapis([60]), { dedup: false });
  await chwila(4);
  await v.savePatient(zapis([60, 66]), { patientId: a.patientId, dedup: false });
  return a.patientId;
}

/* Karta jak wyżej, o identyfikatorze większym (wiekszy = true) albo mniejszym niż `inny`. Remis właściciela rozstrzyga
   mniejszy patientId (losowy UUID), więc scenariusze idą w obu kolejnościach identyfikatorów: wynik testów i liczba
   czerwonych przy mutacjach nie zależą od losowania (uwaga recenzenta do 88f558c: M1 dawało 7–13 czerwonych). Kartę
   w złej kolejności usuwamy wprost z magazynu — przed pierwszą synchronizacją, bez nagrobka — i zakładamy od nowa. */
async function kartaWzgledem(d, inny, wiekszy) {
  for (;;) {
    const id = await karta(d.v);
    if ((id > inny) === wiekszy) return id;
    await d.baza.removePatientForUser(d.uid, id);
  }
}
const KOLEJNOSCI = ['X<Y', 'X>Y'];

/* Delty jak z vilda_sync_integration: po zapisie karty buildPatientDelta (onPatientSaved; nagrobków w niej nie ma),
   po usunięciu albo „Scal pacjentów” osobno buildTombstoneDelta (onPatientDeleted) — w tej kolejności, jak zdarzenia
   w mergePatients (najpierw zapis celu, potem usunięcie źródła). Prawdziwe funkcje sejfu nadawcy; treść odszyfrowuje
   nadawca (dwa „urządzenia” to w teście dwa konta z różnymi kluczami), odbiorca scala ją jak applyEncryptedDelta. */
async function delty(d, pacjenci) {
  const wynik = [];
  const odszyfruj = async (z) => kopia(await d.v.decryptPayloadForCurrentUser(z.iv, z.data));
  for (const pid of pacjenci) {
    const z = await d.v.buildPatientDelta(pid);
    if (z) wynik.push(await odszyfruj(z));
  }
  for (const t of await d.baza.listTombstonesForUser(d.uid)) {
    wynik.push(await odszyfruj(await d.v.buildTombstoneDelta(t.patientId, t.deletedAtISO)));
  }
  return wynik;
}
const zapiszWersje = (d, patientId, wieki) => d.v.savePatient(zapis(wieki), { patientId, dedup: false });

/* Chmura jak vilda_sync.js: urządzenie pobiera blob, scala go i wysyła swój pełny eksport. wyslij — sama wysyłka
   (stan chmury po ostatniej wysyłce danego urządzenia). */
function chmura() {
  let blob = null;
  const sync = async function (d) {
    if (blob) await d.v.mergeSyncPayload(kopia(blob));
    blob = kopia(await d.v.exportSyncPayload());
  };
  sync.wyslij = async function (d) { blob = kopia(await d.v.exportSyncPayload()); };
  return sync;
}

/* Etykiety: patientId → nazwa karty, snapshotId → nazwa wersji (x1, x2 — po kolejności zapisu). */
async function etykiety(d, karty, et = {}) {
  for (const [nazwa, pid] of Object.entries(karty)) {
    et[pid] = nazwa;
    const w = (await d.baza.listSnapshotsForUser(d.uid, pid)).sort((a, b) => (a.savedAtISO < b.savedAtISO ? -1 : 1));
    w.forEach((s, i) => { if (!et[s.snapshotId]) et[s.snapshotId] = `${nazwa.toLowerCase()}${i + 1}`; });
  }
  return et;
}

/* Stan magazynu wprost z adaptera: karty (licznik, wersje), właściciel każdej wersji, nagrobki pacjentów, kosz,
   liczba wersji w magazynie (wersja bez karty = sierota). */
async function stan(d, et) {
  const n = (id) => et[id] || `?${String(id).slice(0, 6)}`;
  const karty = {}, wlasciciel = {};
  let wKartach = 0;
  for (const k of await d.baza.listPatientsForUser(d.uid)) {
    const wersje = await d.baza.listSnapshotsForUser(d.uid, k.patientId);
    wKartach += wersje.length;
    wersje.forEach((w) => { wlasciciel[n(w.snapshotId)] = n(k.patientId); });
    karty[n(k.patientId)] = { licznik: k.snapshotCount, wersje: wersje.map((w) => n(w.snapshotId)).sort() };
  }
  const podglad = d.baza._peek().userDbs.find((u) => u[0] === d.uid);
  const wMagazynie = podglad ? podglad[1].snapshotCount : 0;
  const nagrobki = (await d.baza.listTombstonesForUser(d.uid)).map((t) => n(t.patientId)).sort();
  const kosz = (await d.v.listTrashedSnapshots()).map((e) => n(e.snapshotId)).sort();
  return { karty, wlasciciel, nagrobki, kosz, sieroty: wMagazynie - wKartach };
}
const posortowane = (karty) => Object.keys(karty).sort().map((k) => [k, karty[k]]);
const zgodne = (a, b) => JSON.stringify([posortowane(a.karty), a.nagrobki]) === JSON.stringify([posortowane(b.karty), b.nagrobki]);

/* Przebieg: X i Y na A (po 2 wersje; kolejnosc — porządek ich identyfikatorów), pełna synchronizacja, akcje(ctx), rundy
   synchronizacji wg modelu. Zwraca log stanów obu urządzeń po każdym kroku. */
async function przebieg({ model, akcje, rundy = 4, poRundach, opcjeUrzadzen = {}, kolejnosc = 'X<Y' }) {
  const A = await urzadzenie('A', opcjeUrzadzen), B = await urzadzenie('B', opcjeUrzadzen);
  const X = await karta(A.v);
  await chwila(4);
  const Y = await kartaWzgledem(A, X, kolejnosc === 'X<Y');
  const karty = { X, Y };
  const sync = chmura();
  await sync(A); await sync(B);
  const et = await etykiety(A, karty);
  const ctx = { A, B, X, Y, et, karty, sync, kolejnosc, delta: { A: 'Y', B: 'X' } };
  await akcje(ctx);
  await etykiety(A, ctx.karty, et);
  const log = [];
  const zrzut = async (krok) => {
    const a = await stan(A, et), b = await stan(B, et);
    log.push({ krok, A: a, B: b, zbiezne: zgodne(a, b) });
  };
  await zrzut('po akcjach');
  const runda = async (i) => {
    if (model === 'krzyzowa') {
      const pa = kopia(await A.v.exportSyncPayload()), pb = kopia(await B.v.exportSyncPayload());
      await A.v.mergeSyncPayload(pb);
      await B.v.mergeSyncPayload(pa);
      await zrzut(`runda ${i}`);
    } else if (model === 'delty+chmura' && i === 1) {
      // Mijające się delty na żywo: karta zmieniona na danym urządzeniu, potem osobno jego nagrobki pacjentów (model
      // do 88f558c doklejał nagrobki do delty karty, a produkcyjna buildPatientDelta ma `tombstones: []`).
      const da = await delty(A, [ctx.karty[ctx.delta.A]]), db = await delty(B, [ctx.karty[ctx.delta.B]]);
      for (const d of db) await A.v.mergeSyncPayload(d);
      for (const d of da) await B.v.mergeSyncPayload(d);
      await zrzut(`runda ${i}`);
    } else {
      const [p, q] = model === 'chmura-BA' ? [B, A] : [A, B];
      await sync(p); await zrzut(`runda ${i}a (${p.nazwa})`);
      await sync(q); await zrzut(`runda ${i}b (${q.nazwa})`);
    }
  };
  for (let i = 1; i <= rundy; i += 1) await runda(i);
  if (poRundach) {
    await poRundach(ctx);
    await etykiety(A, ctx.karty, et);
    await zrzut('po drugich akcjach');
    for (let i = 1; i <= rundy; i += 1) await runda(rundy + i);
  }
  return { log, ctx, koniec: log[log.length - 1] };
}

/* Wersje widziane po akcjach, których na końcu nie ma na danym urządzeniu (ani w karcie, ani w koszu). */
function utracone(log) {
  const widziane = new Set();
  log.forEach((z) => ['A', 'B'].forEach((d) => Object.keys(z[d].wlasciciel).forEach((s) => widziane.add(s))));
  const kon = log[log.length - 1], wynik = [];
  for (const d of ['A', 'B']) {
    widziane.forEach((s) => { if (!(s in kon[d].wlasciciel) && !kon[d].kosz.includes(s)) wynik.push(`${d}:${s}`); });
  }
  return wynik;
}
/* Liczniki niezgodne z liczbą wersji (oraz wersje bez karty) — na końcu, na obu urządzeniach. */
function rozjazdy(z) {
  const wynik = [];
  for (const d of ['A', 'B']) {
    for (const [p, c] of Object.entries(z[d].karty)) if (c.licznik !== c.wersje.length) wynik.push(`${d}:${p} ${c.licznik}/${c.wersje.length}`);
    if (z[d].sieroty) wynik.push(`${d}: ${z[d].sieroty} wersji bez karty`);
  }
  return wynik;
}
/* Zmiany właściciela wersji między kolejnymi krokami logu od indeksu `od`. */
function zmianyWlasciciela(log, od) {
  let n = 0;
  for (const d of ['A', 'B']) {
    for (let i = Math.max(1, od); i < log.length; i += 1) {
      const a = log[i - 1][d].wlasciciel, b = log[i][d].wlasciciel;
      Object.keys(b).forEach((s) => { if (a[s] && a[s] !== b[s]) n += 1; });
    }
  }
  return n;
}
const karta2 = (licznik, wersje) => ({ licznik, wersje: [...wersje].sort() });
function oczekujNaObu(koniec, karty, nagrobki = []) {
  for (const d of ['A', 'B']) {
    expect(koniec[d].karty, `urządzenie ${d}`).toEqual(karty);
    expect(koniec[d].nagrobki, `nagrobki ${d}`).toEqual(nagrobki);
    expect(koniec[d].sieroty, `wersje bez karty ${d}`).toBe(0);
  }
}
async function trescWersji(d, patientId, snapshotId) {
  const p = await d.v.getPatient(patientId);
  const s = p && p.snapshots.find((q) => q.snapshotId === snapshotId);
  return s ? pomiaryZ(s.payload) : null;
}
const idPo = (et, nazwa) => Object.keys(et).find((k) => et[k] === nazwa);

/* Akcje scenariuszy. */
const AKCJE = {
  // A scala X → Y; B (jeszcze nie wie) zapisuje nową wersję X.
  async XdoY(c) {
    await chwila(5);
    const r = await c.A.v.mergePatients(c.X, c.Y); c.et[r.snapshotId] = 'ym';
    await chwila(5);
    const e = await zapiszWersje(c.B, c.X, [60, 66, 72]); c.et[e.snapshotId] = 'x3';
  },
  // B scala Y → X; A zapisuje nową wersję Y.
  async YdoX(c) {
    await chwila(5);
    const r = await c.B.v.mergePatients(c.Y, c.X); c.et[r.snapshotId] = 'xm';
    await chwila(5);
    const e = await zapiszWersje(c.A, c.Y, [60, 66, 72]); c.et[e.snapshotId] = 'y3';
    c.delta = { A: 'Y', B: 'X' };
  },
  // Kontrola: bez scalania; A nowa wersja X, B nowa wersja Y i X.
  async bez(c) {
    await chwila(5);
    c.et[(await zapiszWersje(c.A, c.X, [60, 66, 72])).snapshotId] = 'x3';
    await chwila(5);
    c.et[(await zapiszWersje(c.B, c.Y, [60, 66, 78])).snapshotId] = 'y3';
    await chwila(5);
    c.et[(await zapiszWersje(c.B, c.X, [60, 66, 72, 84])).snapshotId] = 'x4';
  },
  // Kontrola: A scala X → Y, B nic nie robi.
  async bezEdycji(c) {
    await chwila(5);
    const r = await c.A.v.mergePatients(c.X, c.Y); c.et[r.snapshotId] = 'ym';
  },
  // A scala X → Y; B poprawia treść x1 (61 mies. zamiast 60) bez zmiany chwili zapisu — nagrobek X wygrywa.
  async korekta(c) {
    await chwila(5);
    const r = await c.A.v.mergePatients(c.X, c.Y); c.et[r.snapshotId] = 'ym';
    await chwila(5);
    await c.B.v.updateSnapshotPayload(c.X, idPo(c.et, 'x1'), zapis([61]), { preserveSavedAt: true });
  },
  // A scala X → Y; B poprawia x1 i zapisuje nową wersję X.
  async korektaEdycja(c) {
    await chwila(5);
    const r = await c.A.v.mergePatients(c.X, c.Y); c.et[r.snapshotId] = 'ym';
    await chwila(5);
    await c.B.v.updateSnapshotPayload(c.X, idPo(c.et, 'x1'), zapis([61]), { preserveSavedAt: false });
    await chwila(5);
    c.et[(await zapiszWersje(c.B, c.X, [60, 66, 72])).snapshotId] = 'x3';
  },
  // A scala X → Y; B poprawia x1 w X (preserveSavedAt: false — chwila zapisu X = teraz, nagrobek X przegrywa), bez
  // nowego zapisu. Scenariusz recenzenta „korektaBezZapisu”: karta X wraca na A dopiero w fazie przeniesień.
  async korektaBezZapisu(c) {
    await chwila(5);
    const r = await c.A.v.mergePatients(c.X, c.Y); c.et[r.snapshotId] = 'ym';
    await chwila(5);
    await c.B.v.updateSnapshotPayload(c.X, idPo(c.et, 'x1'), zapis([61]), { preserveSavedAt: false });
  },
  // A scala X → Y i poprawia x1 już pod Y (62 mies.; rev 2 = podbicie przy scaleniu + poprawka); później B poprawia x1
  // w starej X (61 mies.; rev 1, chwila zapisu X = teraz). Scenariusz recenzenta „dwiePoprawki”.
  async dwiePoprawki(c) {
    await chwila(5);
    const r = await c.A.v.mergePatients(c.X, c.Y); c.et[r.snapshotId] = 'ym';
    await chwila(5);
    await c.A.v.updateSnapshotPayload(c.Y, idPo(c.et, 'x1'), zapis([62]), { preserveSavedAt: true });
    await chwila(5);
    await c.B.v.updateSnapshotPayload(c.X, idPo(c.et, 'x1'), zapis([61]), { preserveSavedAt: false });
  },
};

const MODELE = ['chmura-AB', 'chmura-BA', 'krzyzowa', 'delty+chmura'];
// Każdy model w obu kolejnościach identyfikatorów X i Y (kartaWzgledem).
const PRZYPADKI = MODELE.flatMap((m) => KOLEJNOSCI.map((k) => [m, k]));
const CZAS = 30_000;

describe('P-SYNC-WLASCICIEL — „Scal pacjentów” na jednym urządzeniu, nowy zapis starej karty na drugim', () => {
  // [CZERWONY na audyt — wszystkie 8] chmura-BA: A X 3/3 [x1 x2 x3], Y licznik 5 przy 3 wersjach; chmura-AB: B X licznik
  // 3 przy 1 wersji; krzyżowa: ping-pong (16 zmian właściciela w 4 rundach); delty+chmura: rozjechane liczniki.
  it.each(PRZYPADKI)('X → Y (%s, %s): oba urządzenia X [x3], Y [x1 x2 y1 y2 ym], liczniki zgodne, nic nie ginie', async (model, kolejnosc) => {
    const { log, koniec } = await przebieg({ model, kolejnosc, akcje: AKCJE.XdoY });
    oczekujNaObu(koniec, {
      X: karta2(1, ['x3']),
      Y: karta2(5, ['x1', 'x2', 'y1', 'y2', 'ym']),
    });
    expect(utracone(log)).toEqual([]);
    const iR1 = log.findIndex((z) => z.krok.startsWith('runda 1'));
    if (model === 'krzyzowa') {
      // zbieżne od rundy 1, potem bez zmian właściciela (dotąd „ping-pong”)
      expect(log.slice(iR1).every((z) => z.zbiezne)).toBe(true);
      expect(zmianyWlasciciela(log, iR1 + 1)).toBe(0);
    }
  }, CZAS);

  // [CZERWONY na audyt — wszystkie 8] kierunek odwrotny (B scala Y → X, A zapisuje Y): rozjazdy 3/1 i 5/3, ping-pong
  // w krzyżowej.
  it.each(PRZYPADKI)('Y → X (%s, %s): oba urządzenia X [x1 x2 xm y1 y2], Y [y3]', async (model, kolejnosc) => {
    const { log, koniec } = await przebieg({ model, kolejnosc, akcje: AKCJE.YdoX });
    oczekujNaObu(koniec, {
      X: karta2(5, ['x1', 'x2', 'xm', 'y1', 'y2']),
      Y: karta2(1, ['y3']),
    });
    expect(utracone(log)).toEqual([]);
  }, CZAS);

  // [CZERWONY na audyt] poprawka x1 na B (bez zmiany chwili zapisu), nagrobek X wygrywa: dotąd x1 kończył z treścią
  // 60:120 na obu urządzeniach (poprawka utracona). Pełne ładunki (chmura, krzyżowa): karta Y i nagrobek X w jednym
  // ładunku — wyjątek „zabierz” z nowszą treścią.
  it.each(PRZYPADKI.filter(([m]) => m !== 'delty+chmura'))('poprawka pomiaru w X po scaleniu (%s, %s): x1 pod Y z poprawioną treścią na obu', async (model, kolejnosc) => {
    const { ctx, koniec, log } = await przebieg({ model, kolejnosc, akcje: AKCJE.korekta });
    oczekujNaObu(koniec, { Y: karta2(5, ['x1', 'x2', 'y1', 'y2', 'ym']) }, ['X']);
    expect(utracone(log)).toEqual([]);
    const x1 = idPo(ctx.et, 'x1');
    expect(await trescWersji(ctx.A, ctx.Y, x1)).toBe('61:120.5');
    expect(await trescWersji(ctx.B, ctx.Y, x1)).toBe('61:120.5');
  }, CZAS);

  // [ZIELONY na audyt i na 88f558c — przypięte znane ograniczenie, bez zmian] Ten sam scenariusz, gdy delta karty Y
  // i delta nagrobka X przychodzą osobno (delty na żywo): w chwili delty Y karta X nie jest jeszcze skazana, poprawiona
  // x1 (nowsza treść) zostaje przy X, a delta nagrobka usuwa X razem z nią; w odwrotnej kolejności nagrobek usuwa X
  // od razu. Treść poprawki z B ginie (jak na audyt, gdzie ginęła we wszystkich modelach), żadna wersja nie ginie.
  // Domknięcie wymaga nagrobka X w delcie karty Y albo zmiany reguły nagrobka — decyzja właściciela.
  it.each(KOLEJNOSCI)('poprawka pomiaru w X po scaleniu, delty osobno (delty+chmura, %s): znane ograniczenie — treść poprawki ginie, wersje nie', async (kolejnosc) => {
    const { ctx, koniec, log } = await przebieg({ model: 'delty+chmura', kolejnosc, akcje: AKCJE.korekta });
    oczekujNaObu(koniec, { Y: karta2(5, ['x1', 'x2', 'y1', 'y2', 'ym']) }, ['X']);
    expect(koniec.zbiezne).toBe(true);
    expect(utracone(log)).toEqual([]);
    const x1 = idPo(ctx.et, 'x1');
    expect(await trescWersji(ctx.A, ctx.Y, x1)).toBe('60:120');
    expect(await trescWersji(ctx.B, ctx.Y, x1)).toBe('60:120');
  }, CZAS);

  // [CZERWONY na audyt — wszystkie 8] poprawka x1 i nowy zapis X na B: dotąd chmura-AB 60:120 na obu (poprawka
  // utracona), krzyżowa — treść rozjechana (A Y:60:120, B X:61:120.5) i liczniki rozjechane. Teraz poprawiona x1 (nowsza
  // rewizja) wraca pod X, x2 zostaje pod Y — zbieżnie, bez utraty.
  it.each(PRZYPADKI)('poprawka i nowy zapis X po scaleniu (%s, %s): poprawka zachowana, zbieżnie', async (model, kolejnosc) => {
    const { ctx, koniec, log } = await przebieg({ model, kolejnosc, akcje: AKCJE.korektaEdycja });
    oczekujNaObu(koniec, {
      X: karta2(2, ['x1', 'x3']),
      Y: karta2(4, ['x2', 'y1', 'y2', 'ym']),
    });
    expect(utracone(log)).toEqual([]);
    const x1 = idPo(ctx.et, 'x1');
    expect(await trescWersji(ctx.A, ctx.X, x1)).toBe('61:120.5');
    expect(await trescWersji(ctx.B, ctx.X, x1)).toBe('61:120.5');
  }, CZAS);

  // [CZERWONY na audyt — wszystkie 8; ZIELONY na 88f558c] Uwaga recenzenta do 88f558c (scenariusz
  // „korektaBezZapisu”): karta X powstaje na A dopiero w fazie przeniesień (gałąź „czekają” w Bsl_scalPacjenta
  // i zakładanie brakującej karty w Bsw_przenies). Mutanty R2 i R9 (przeżywały wszystkie 55 testów) dawały: A Y 5/5
  // z x1 = 60:120, B X 1/1 [x1] 61:120.5 — poprawka z B ginęła na A, urządzenia rozjeżdżały się na stałe.
  it.each(PRZYPADKI)('poprawka x1 w X po scaleniu, bez nowego zapisu (%s, %s): X [x1] z poprawką, Y [x2 y1 y2 ym], bez nagrobka', async (model, kolejnosc) => {
    const { ctx, koniec, log } = await przebieg({ model, kolejnosc, akcje: AKCJE.korektaBezZapisu });
    oczekujNaObu(koniec, {
      X: karta2(1, ['x1']),
      Y: karta2(4, ['x2', 'y1', 'y2', 'ym']),
    });
    expect(koniec.zbiezne).toBe(true);
    expect(utracone(log)).toEqual([]);
    const x1 = idPo(ctx.et, 'x1');
    expect(await trescWersji(ctx.A, ctx.X, x1)).toBe('61:120.5');
    expect(await trescWersji(ctx.B, ctx.X, x1)).toBe('61:120.5');
  }, CZAS);

  // [CZERWONY na audyt i na 88f558c — wszystkie 8] Uwaga recenzenta do 88f558c (scenariusz „dwiePoprawki”). Na 88f558c
  // we wszystkich modelach: A Y 5/5 bez X i bez nagrobka X, B X 1/1 [x2] + Y 4/4 — urządzenia trwale rozjechane
  // (x2 była ostatnią wersją X, więc nie przechodziła; nagrobek scalenia na A znikał, bo X tam nie powstała); mutant
  // R1 (bez wczesnego powrotu w gałęzi nowej karty) zakładał na A pustą X 0/0. Na audyt dodatkowo rozjechane liczniki.
  // Teraz x2 przechodzi pod Y także na B (pusta X znika), a nagrobek scalenia zostaje na A — zbieżnie, nic nie ginie.
  it.each(PRZYPADKI)('dwie poprawki x1 — pod Y na A i w starej X na B (%s, %s): Y [x1 x2 y1 y2 ym] na obu, nagrobek X, x1 z poprawką A', async (model, kolejnosc) => {
    const { ctx, koniec, log } = await przebieg({ model, kolejnosc, akcje: AKCJE.dwiePoprawki });
    oczekujNaObu(koniec, { Y: karta2(5, ['x1', 'x2', 'y1', 'y2', 'ym']) }, ['X']);
    expect(koniec.zbiezne).toBe(true);
    expect(utracone(log)).toEqual([]);
    // Skutek rev + 1 przy scaleniu: poprawka zrobiona po scaleniu na urządzeniu scalającym (rev 2) wygrywa z późniejszą
    // poprawką tej wersji w starej karcie (rev 1) — treść B (61) przepada. Przypięte, do decyzji właściciela.
    const x1 = idPo(ctx.et, 'x1');
    expect(await trescWersji(ctx.A, ctx.Y, x1)).toBe('62:121');
    expect(await trescWersji(ctx.B, ctx.Y, x1)).toBe('62:121');
  }, CZAS);

  // [CZERWONY na audyt — wszystkie 8] dwa równoległe scalenia tej samej karty z różnymi celami (A: X → Y, B: X → Z):
  // dotąd rozjazd liczników i ping-pong. Teraz x1 i x2 pod jedną kartą na obu; remis (ta sama rewizja i chwila zmiany)
  // rozstrzyga deterministycznie mniejszy patientId — tu w obu kolejnościach Y i Z.
  it.each(PRZYPADKI)('dwa równoległe scalenia X → Y i X → Z (%s, %s): x1, x2 pod tą samą kartą na obu', async (model, kolejnosc) => {
    const { ctx, koniec, log } = await przebieg({
      model,
      kolejnosc,
      akcje: async (c) => {
        // Z: trzecia karta, założona na A i zsynchronizowana przed scaleniami; X<Y: Z > Y (wygrywa Y), X>Y: Z < Y.
        const sync = chmura();
        c.Z = await kartaWzgledem(c.A, c.Y, c.kolejnosc === 'X<Y');
        c.karty.Z = c.Z;
        await sync(c.A); await sync(c.B);
        await etykiety(c.A, { Z: c.Z }, c.et);
        await chwila(5);
        c.et[(await c.A.v.mergePatients(c.X, c.Y)).snapshotId] = 'ym';
        await chwila(5);
        c.et[(await c.B.v.mergePatients(c.X, c.Z)).snapshotId] = 'zm';
        c.delta = { A: 'Y', B: 'Z' };
      },
    });
    const cel = ctx.Y < ctx.Z ? 'Y' : 'Z', inny = cel === 'Y' ? 'Z' : 'Y';
    expect(cel).toBe(kolejnosc === 'X<Y' ? 'Y' : 'Z');
    const wlasne = (k) => [`${k.toLowerCase()}1`, `${k.toLowerCase()}2`, `${k.toLowerCase()}m`];
    oczekujNaObu(koniec, {
      [cel]: karta2(5, [...wlasne(cel), 'x1', 'x2']),
      [inny]: karta2(3, wlasne(inny)),
    }, ['X']);
    expect(utracone(log)).toEqual([]);
  }, CZAS);

  // Ponowne „Scal pacjentów” X → Y po wskrzeszeniu X domyka duplikat: [CZERWONY na audyt] w krzyżowej (B: Y 9/7)
  // i w delty+chmura; chmura — kontrola [ZIELONY na audyt].
  it.each(PRZYPADKI)('ponowne scalenie X → Y po wskrzeszeniu X (%s, %s): Y [x1 x2 x3 y1 y2 ym ym2], nagrobek X', async (model, kolejnosc) => {
    const { koniec, log } = await przebieg({
      model,
      kolejnosc,
      rundy: 2,
      akcje: AKCJE.XdoY,
      poRundach: async (c) => {
        await chwila(5);
        c.et[(await c.A.v.mergePatients(c.X, c.Y)).snapshotId] = 'ym2';
      },
    });
    oczekujNaObu(koniec, { Y: karta2(7, ['x1', 'x2', 'x3', 'y1', 'y2', 'ym', 'ym2']) }, ['X']);
    expect(utracone(log)).toEqual([]);
  }, CZAS);
});

describe('P-SYNC-WLASCICIEL — kontrole zwykłej synchronizacji i zwykłego scalenia', () => {
  // [ZIELONY na audyt] bez scalania: nowe wersje obu kart z obu urządzeń dochodzą, nikt nie zmienia właściciela.
  it.each(PRZYPADKI)('bez scalania (%s, %s): X [x1 x2 x3 x4], Y [y1 y2 y3], 0 zmian właściciela', async (model, kolejnosc) => {
    const { log, koniec } = await przebieg({ model, kolejnosc, akcje: AKCJE.bez });
    oczekujNaObu(koniec, {
      X: karta2(4, ['x1', 'x2', 'x3', 'x4']),
      Y: karta2(3, ['y1', 'y2', 'y3']),
    });
    expect(zmianyWlasciciela(log, 1)).toBe(0);
    expect(utracone(log)).toEqual([]);
  }, CZAS);

  // [ZIELONY na audyt; CZERWONY na 88f558c w delty+chmura] zwykłe scalenie bez edycji na drugim urządzeniu. Pilnuje
  // wyjątku dla karty z wygrywającym nagrobkiem (strażnik bez niego zostawiał x1 i x2 przy X i usuwał je razem z X)
  // oraz drogi delt na żywo: delta karty Y przed osobną deltą nagrobka X — na 88f558c ostatnia wersja X zostawała przy
  // X i ginęła z nią (B: Y 4/4 [x1 y1 y2 ym] po rundzie 1; uwaga recenzenta).
  it.each(PRZYPADKI)('zwykłe scalenie X → Y bez edycji (%s, %s): Y [x1 x2 y1 y2 ym] na obu, nagrobek X', async (model, kolejnosc) => {
    const { log, koniec } = await przebieg({ model, kolejnosc, akcje: AKCJE.bezEdycji });
    oczekujNaObu(koniec, { Y: karta2(5, ['x1', 'x2', 'y1', 'y2', 'ym']) }, ['X']);
    expect(utracone(log)).toEqual([]);
    // Po pierwszym scaleniu ładunku A urządzenie B ma już Y z x1 i x2 (nie zostawia ich przy usuwanej X). W chmura-BA
    // B pobiera w rundzie 1 jeszcze swój stary stan, a ładunek A dopiero w rundzie 2.
    const krokB = { 'chmura-AB': 'runda 1b', 'chmura-BA': 'runda 2a', krzyzowa: 'runda 1', 'delty+chmura': 'runda 1' }[model];
    const pierwszeB = log.find((z) => z.krok.startsWith(krokB));
    expect(pierwszeB.B.karty.Y).toEqual(karta2(5, ['x1', 'x2', 'y1', 'y2', 'ym']));
  }, CZAS);

  // [CZERWONY na audyt] „Scal pacjentów” przepina wersję jako nową rewizję rekordu (dotąd rev 0 → 0, więc rekordy
  // „x1 pod X” i „x1 pod Y” były nierozróżnialne). Treść, chwila zmiany i chwila zapisu bez zmian.
  it('„Scal pacjentów” podbija rev przeniesionej wersji, bez zmiany chwil i treści', async () => {
    const A = await urzadzenie('A');
    const X = await karta(A.v);
    await chwila(4);
    const Y = await karta(A.v);
    const przed = await A.baza.listSnapshotsForUser(A.uid, X);
    await A.v.mergePatients(X, Y);
    const po = await A.baza.listSnapshotsForUser(A.uid, Y);
    for (const w of przed) {
      const nowy = po.find((s) => s.snapshotId === w.snapshotId);
      expect(nowy.patientId).toBe(Y);
      expect(nowy.rev).toBe((w.rev || 0) + 1);
      expect(nowy.updatedAtISO ?? null).toBe(w.updatedAtISO ?? null);
      expect(nowy.savedAtISO).toBe(w.savedAtISO);
      expect(nowy.payloadCipher).toEqual(w.payloadCipher);
    }
  });
});

describe('P-SYNC-WLASCICIEL — zwykłe scalenie, delty na żywo w osobnych ładunkach', () => {
  /* Uwaga recenzenta do 88f558c. A robi „Scal pacjentów” X → Y; vilda_sync_integration wysyła dwie osobne delty:
     buildPatientDelta(Y) (onPatientSaved, `tombstones: []`) i buildTombstoneDelta(X) (onPatientDeleted). Urządzenie B
     stosuje je osobno (applyEncryptedDelta → mergeSyncPayload), w dowolnej kolejności. Potem B synchronizuje się
     z chmurą, w której A nie zdążył zapisać pełnego stanu (stan sprzed scalenia), a nowe urządzenie C pobiera chmurę.
     [ZIELONY na audyt] — wersje przepinane bez porównania. [CZERWONY na 88f558c] w kolejności „Y, potem nagrobek X”:
     ostatnia (najnowsza) wersja X zostawała przy X, a nagrobek X usuwał ją razem z kartą — B: Y 4/4 [x1 y1 y2 ym]
     (X z jedną wersją: Y 3/3), kosz pusty; po synchronizacji B z chmurą to samo w chmurze i na C. */
  async function kartaN(v, n) {
    const a = await v.savePatient(zapis([60]), { dedup: false });
    for (let i = 1; i < n; i += 1) { await chwila(4); await v.savePatient(zapis([60, 60 + 6 * i]), { patientId: a.patientId, dedup: false }); }
    return a.patientId;
  }
  const WARIANTY = ['Y, potem nagrobek X', 'nagrobek X, potem Y'].flatMap((k) => [2, 1].flatMap((n) => KOLEJNOSCI.map((id) => [k, n, id])));
  it.each(WARIANTY)('%s, X z %i wersjami (%s): Y z wszystkimi wersjami X na B, w chmurze i na C', async (kolejnosc, nX, kolejnoscId) => {
    const A = await urzadzenie('A'), B = await urzadzenie('B'), C = await urzadzenie('C');
    const X = await kartaN(A.v, nX);
    await chwila(4);
    const Y = await kartaWzgledem(A, X, kolejnoscId === 'X<Y');
    const sync = chmura();
    await sync(A); await sync(B); // w chmurze stan sprzed scalenia
    const et = await etykiety(A, { X, Y });
    await chwila(5);
    et[(await A.v.mergePatients(X, Y)).snapshotId] = 'ym';
    const [dY, dX, ...reszta] = await delty(A, [Y]);
    expect(reszta).toEqual([]);
    expect(dY.patients.map((q) => q.patientId)).toEqual([Y]);
    expect(dY.tombstones).toEqual([]);
    expect(dX.tombstones.map((t) => t.patientId)).toEqual([X]);
    for (const d of kolejnosc.startsWith('Y') ? [dY, dX] : [dX, dY]) await B.v.mergeSyncPayload(d);
    const wersjeX = Array.from({ length: nX }, (_, i) => `x${i + 1}`);
    const oczekiwane = { Y: karta2(nX + 3, [...wersjeX, 'y1', 'y2', 'ym']) };
    const sB = await stan(B, et);
    expect(sB.karty).toEqual(oczekiwane);
    expect(sB.nagrobki).toEqual(['X']);
    expect(sB.kosz).toEqual([]);
    expect(sB.sieroty).toBe(0);
    // B: pobierz nieaktualną chmurę, scal, wyślij; C: pierwsze pobranie.
    await sync(B);
    await sync(C);
    for (const d of [B, C]) {
      const s = await stan(d, et);
      expect(s.karty, `urządzenie ${d.nazwa}`).toEqual(oczekiwane);
      expect(s.nagrobki, `nagrobki ${d.nazwa}`).toEqual(['X']);
      expect(s.sieroty).toBe(0);
    }
  }, CZAS);
});

describe('P-SYNC-WLASCICIEL — stan zastany po kodzie sprzed zmiany', () => {
  // Stany zmierzone na `audyt` 2df41a8 po akcji i 2 rundach synchronizacji (skrypt krytyka e2-stan-zastany): liczniki
  // rozjechane, w modelu krzyżowym także różni właściciele na obu urządzeniach; wersje przeniesione bez podbicia rev.
  // Odtwarzamy je wprost w magazynie (kod sprzed zmiany nie jest dostępny w CI): po zwykłej synchronizacji, w której
  // każde urządzenie ma wszystkie wersje, ustawiamy właściciela i licznik każdej karty jak w tabeli.
  // [CZERWONY na audyt] (i na wariancie badacza W2e) — licznik przyrostowy nie naprawiał się nigdy.
  const STANY = {
    'X → Y, chmura-AB': {
      model: 'chmura-AB', kier: 'XdoY',
      A: { X: [1, ['x3']], Y: [5, ['x1', 'x2', 'y1', 'y2', 'ym']] },
      B: { X: [3, ['x3']], Y: [5, ['x1', 'x2', 'y1', 'y2', 'ym']] },
    },
    'X → Y, chmura-BA': {
      model: 'chmura-BA', kier: 'XdoY',
      A: { X: [3, ['x1', 'x2', 'x3']], Y: [5, ['y1', 'y2', 'ym']] },
      B: { X: [3, ['x1', 'x2', 'x3']], Y: [3, ['y1', 'y2', 'ym']] },
    },
    'X → Y, krzyżowa': {
      model: 'krzyzowa', kier: 'XdoY',
      A: { X: [3, ['x3']], Y: [7, ['x1', 'x2', 'y1', 'y2', 'ym']] },
      B: { X: [5, ['x1', 'x2', 'x3']], Y: [5, ['y1', 'y2', 'ym']] },
    },
    'Y → X, chmura-AB': {
      model: 'chmura-AB', kier: 'YdoX',
      A: { X: [3, ['x1', 'x2', 'xm']], Y: [3, ['y1', 'y2', 'y3']] },
      B: { X: [5, ['x1', 'x2', 'xm']], Y: [3, ['y1', 'y2', 'y3']] },
    },
    'Y → X, chmura-BA': {
      model: 'chmura-BA', kier: 'YdoX',
      A: { X: [5, ['x1', 'x2', 'xm', 'y1', 'y2']], Y: [3, ['y3']] },
      B: { X: [5, ['x1', 'x2', 'xm', 'y1', 'y2']], Y: [1, ['y3']] },
    },
    'Y → X, krzyżowa': {
      model: 'krzyzowa', kier: 'YdoX',
      A: { X: [5, ['x1', 'x2', 'xm']], Y: [5, ['y1', 'y2', 'y3']] },
      B: { X: [7, ['x1', 'x2', 'xm', 'y1', 'y2']], Y: [3, ['y3']] },
    },
  };

  async function ustawStan(d, karty, et, tabela) {
    const id = (nazwa) => idPo(et, nazwa);
    for (const [nazwaKarty, [licznikKarty, wersje]] of Object.entries(tabela)) {
      const pid = karty[nazwaKarty];
      for (const nazwa of wersje) {
        const sid = id(nazwa);
        let rekord = null;
        for (const p of Object.values(karty)) {
          rekord = (await d.baza.listSnapshotsForUser(d.uid, p)).find((s) => s.snapshotId === sid) || rekord;
        }
        expect(rekord, `${d.nazwa}: wersja ${nazwa} jest w magazynie`).toBeTruthy();
        // Przeniesienie jak na starym kodzie: inny właściciel, rev bez zmian.
        await d.baza.putSnapshotForUser(d.uid, Object.assign({}, rekord, { patientId: pid }));
      }
      const rek = await d.baza.getPatientForUser(d.uid, pid);
      await d.baza.putPatientForUser(d.uid, Object.assign({}, rek, { snapshotCount: licznikKarty }));
    }
    for (const t of await d.baza.listTombstonesForUser(d.uid)) await d.baza.removeTombstoneForUser(d.uid, t.patientId);
  }

  it.each(Object.keys(STANY).flatMap((n) => KOLEJNOSCI.map((k) => [n, k])))('%s (%s): po 4 rundach na nowym kodzie liczniki = liczba wersji, A = B, nic nie ginie', async (nazwa, kolejnosc) => {
    const s = STANY[nazwa];
    const { log, koniec, ctx } = await przebieg({
      model: s.model,
      kolejnosc,
      rundy: 4,
      akcje: async (c) => {
        // Wersje jak po scaleniu na starym kodzie, ale zapisane zwykle (ym / xm to wersje karty docelowej), potem
        // zwykła synchronizacja, aż każde urządzenie ma wszystkie wersje.
        const sync = chmura();
        if (s.kier === 'XdoY') {
          c.et[(await zapiszWersje(c.A, c.Y, [60, 66, 70])).snapshotId] = 'ym';
          await chwila(5);
          c.et[(await zapiszWersje(c.B, c.X, [60, 66, 72])).snapshotId] = 'x3';
        } else {
          c.et[(await zapiszWersje(c.B, c.X, [60, 66, 70])).snapshotId] = 'xm';
          await chwila(5);
          c.et[(await zapiszWersje(c.A, c.Y, [60, 66, 72])).snapshotId] = 'y3';
        }
        await sync(c.A); await sync(c.B); await sync(c.A);
        await ustawStan(c.A, c.karty, c.et, s.A);
        await ustawStan(c.B, c.karty, c.et, s.B);
        // W chmurze stan urządzenia, które wysyłało ostatnie (chmura-AB: B, chmura-BA: A).
        await c.sync.wyslij(s.model === 'chmura-BA' ? c.A : c.B);
      },
    });
    const start = log[0];
    expect(rozjazdy(start).length, 'stan zastany ma rozjechane liczniki').toBeGreaterThan(0);
    expect(rozjazdy(koniec)).toEqual([]);
    expect(koniec.zbiezne).toBe(true);
    expect(utracone(log)).toEqual([]);
    // Właściciel wersji przeniesionych „po staremu”: tam, gdzie urządzenia się zgadzały — bez zmian; gdzie się różniły
    // (krzyżowa) — remis (ta sama rev i chwila zmiany) rozstrzyga mniejszy patientId, tak samo na obu.
    const przeniesione = s.kier === 'XdoY' ? ['x1', 'x2'] : ['y1', 'y2'];
    const wlA = przeniesione.map((w) => koniec.A.wlasciciel[w]);
    if (s.model === 'krzyzowa') expect(wlA).toEqual(przeniesione.map(() => (ctx.X < ctx.Y ? 'X' : 'Y')));
    else expect(wlA).toEqual(przeniesione.map((w) => Object.keys(s.A).find((k) => s.A[k][1].includes(w))));
  }, CZAS);
});

describe('P-SYNC-WLASCICIEL — wyścig z zapisem tej karty w innej karcie przeglądarki', () => {
  // Na B zapis nowej wersji X (savePatient, blokada X) stoi tuż przed zapisem rekordu karty X, a w tym czasie
  // synchronizacja scala ładunek A po „Scal pacjentów” X → Y.
  //   przeniesienie: B zapisał x3 PO scaleniu na A — nagrobek X przegrywa, x1 i x2 przechodzą pod Y w fazie przeniesień
  //                  (blokady X i Y), więc synchronizacja czeka na zapis X;
  //   cofnięte usunięcie: B zapisał x3 PRZED scaleniem — na starcie nagrobek X wygrywa, x1 i x2 przechodzą pod Y od razu,
  //                  a usunięcie X czeka na blokadę i widzi świeży zapis x4: karta zostaje.
  // [CZERWONY na audyt] oba tryby: X licznik 4 przy 2 wersjach.
  const TRYBY_BLOKAD = { 'kolejka strony': () => null, 'atrapa Web Locks': () => atrapaLocks() };
  for (const [nazwaBlokad, locks] of Object.entries(TRYBY_BLOKAD)) {
    it.each([['przeniesienie', 'X<Y'], ['przeniesienie', 'X>Y'], ['cofnięte usunięcie', 'X<Y'], ['cofnięte usunięcie', 'X>Y']])(`%s (${nazwaBlokad}, %s): X [x3 x4] licznik 2, Y 5/5`, async (tryb, kolejnosc) => {
      const A = await urzadzenie('A');
      const B = await urzadzenie('B', { locks: locks() });
      const X = await karta(A.v);
      await chwila(4);
      const Y = await kartaWzgledem(A, X, kolejnosc === 'X<Y');
      await B.v.mergeSyncPayload(kopia(await A.v.exportSyncPayload()));
      await chwila(5);
      if (tryb === 'cofnięte usunięcie') { await zapiszWersje(B, X, [60, 66, 72]); await chwila(5); }
      await A.v.mergePatients(X, Y);
      if (tryb === 'przeniesienie') { await chwila(5); await zapiszWersje(B, X, [60, 66, 72]); }
      const ladunekA = kopia(await A.v.exportSyncPayload());
      await chwila(5);
      const p = B.pulapka('putPatientForUser', (uid, rek) => rek && rek.patientId === X);
      const zapisX = zapiszWersje(B, X, [60, 66, 72, 78]);
      await p.osiagnieta;
      let koniecSync = false;
      const sync = B.v.mergeSyncPayload(ladunekA).then(() => { koniecSync = true; });
      await chwila(30);
      const czekala = !koniecSync;
      p.zwolnij();
      await zapisX;
      await sync;
      const rekX = await B.baza.getPatientForUser(B.uid, X);
      const wX = await B.baza.listSnapshotsForUser(B.uid, X);
      expect(wX.length).toBe(2);
      expect(rekX.snapshotCount, 'licznik X = liczba wersji').toBe(2);
      const rekY = await B.baza.getPatientForUser(B.uid, Y);
      const wY = await B.baza.listSnapshotsForUser(B.uid, Y);
      expect([rekY.snapshotCount, wY.length]).toEqual([5, 5]);
      expect(czekala, 'synchronizacja czekała na blokadę X').toBe(true);
    }, CZAS);

    // [CZERWONY na audyt — x1 i x2 przechodziły pod Y od razu, bez porównania i bez blokady X, a zapis poprawki
    // wpisywał x1 z powrotem pod X: licznik X 3 przy 2 wersjach] Poprawka x1 w X (inna karta przeglądarki) stoi tuż przed
    // zapisem, trzymając blokadę X; w tym czasie synchronizacja decyduje (x1 w rev 0, ładunek A ma rev 1 → przenieść)
    // i czeka w fazie przeniesień na blokadę X. Po zapisie poprawki x1 ma rev 1 i późniejszą chwilę zmiany — jest
    // nowszy niż rekord z ładunku, więc faza przeniesień (świeży odczyt) go nie przenosi; x2 przechodzi.
    it.each(KOLEJNOSCI)(`poprawka x1 w trakcie scalania (${nazwaBlokad}, %s): x1 zostaje pod X z poprawką, x2 przechodzi pod Y`, async (kolejnosc) => {
      const A = await urzadzenie('A');
      const B = await urzadzenie('B', { locks: locks() });
      const X = await karta(A.v);
      await chwila(4);
      const Y = await kartaWzgledem(A, X, kolejnosc === 'X<Y');
      await B.v.mergeSyncPayload(kopia(await A.v.exportSyncPayload()));
      const et = await etykiety(B, { X, Y });
      const x1 = idPo(et, 'x1'), x2 = idPo(et, 'x2');
      await chwila(5);
      await A.v.mergePatients(X, Y);
      await chwila(5);
      await zapiszWersje(B, X, [60, 66, 72]);
      const ladunekA = kopia(await A.v.exportSyncPayload());
      await chwila(5);
      const p = B.pulapka('putSnapshotForUser', (uid, rek) => rek && rek.snapshotId === x1 && rek.patientId === X);
      const poprawka = B.v.updateSnapshotPayload(X, x1, zapis([61]), { preserveSavedAt: true });
      await p.osiagnieta;
      const sync = B.v.mergeSyncPayload(ladunekA);
      await chwila(30);
      p.zwolnij();
      await poprawka;
      await sync;
      const wX = (await B.baza.listSnapshotsForUser(B.uid, X)).map((s) => s.snapshotId);
      const wY = (await B.baza.listSnapshotsForUser(B.uid, Y)).map((s) => s.snapshotId);
      expect(wX).toContain(x1);
      expect(wY).toContain(x2);
      expect(wY).not.toContain(x1);
      expect(await trescWersji(B, X, x1)).toBe('61:120.5');
      expect((await B.baza.getPatientForUser(B.uid, X)).snapshotCount).toBe(wX.length);
      expect((await B.baza.getPatientForUser(B.uid, Y)).snapshotCount).toBe(wY.length);
    }, CZAS);
  }
});

describe('P-SYNC-WLASCICIEL — liczniki i przypadki brzegowe', () => {
  // [CZERWONY na audyt — licznik 6 przy 3 wersjach] Licznik karty rozjechany wcześniej (tu: 5 przy 2 wersjach), a ta
  // sama synchronizacja dopisuje nową wersję: licznik = liczba wersji od razu, nie „dawny licznik + nowe”.
  it('licznik rozjechany i nowa wersja w tej samej synchronizacji: licznik = liczba wersji', async () => {
    const A = await urzadzenie('A'), B = await urzadzenie('B');
    const X = await karta(A.v);
    await B.v.mergeSyncPayload(kopia(await A.v.exportSyncPayload()));
    const rek = await B.baza.getPatientForUser(B.uid, X);
    await B.baza.putPatientForUser(B.uid, Object.assign({}, rek, { snapshotCount: 5 }));
    await chwila(5);
    await zapiszWersje(A, X, [60, 66, 72]);
    const wynik = await B.v.mergeSyncPayload(kopia(await A.v.exportSyncPayload()));
    expect(wynik.addedSnapshotCount).toBe(1);
    expect((await B.baza.listSnapshotsForUser(B.uid, X)).length).toBe(3);
    expect((await B.baza.getPatientForUser(B.uid, X)).snapshotCount).toBe(3);
  }, CZAS);

  // [CZERWONY na audyt — x1 przechodził pod Y, X zostawała z licznikiem 1 bez żadnej wersji; CZERWONY na 88f558c —
  // ostatnia wersja zostawała przy X] Ostatnia wersja karty przechodzi pod kartę z nowszym rekordem tak jak pozostałe,
  // a karta bez wersji znika — bez nagrobka (karty nie usunął użytkownik; inne urządzenia opróżniają ją tą samą regułą).
  // Tu X ma jedną wersję, A scala X → Y, a ładunek A nie niesie nagrobka X (delta karty Y bez nagrobków albo nagrobek
  // przycięty po 365 dniach). Dotąd X zostawała z x1 na B (rozbieżność), a nagrobek X z osobnej delty usuwał ją potem
  // razem z x1.
  it.each(KOLEJNOSCI)('ostatnia wersja karty przechodzi pod kartę z nowszym rekordem, pusta karta znika bez nagrobka (%s)', async (kolejnosc) => {
    const A = await urzadzenie('A'), B = await urzadzenie('B');
    const x = await A.v.savePatient(zapis([60]), { dedup: false });
    const X = x.patientId;
    await chwila(4);
    const Y = await kartaWzgledem(A, X, kolejnosc === 'X<Y');
    await B.v.mergeSyncPayload(kopia(await A.v.exportSyncPayload()));
    await chwila(5);
    await A.v.mergePatients(X, Y);
    const ladunek = kopia(await A.v.exportSyncPayload());
    ladunek.tombstones = [];
    const wynik = await B.v.mergeSyncPayload(ladunek);
    expect(await B.baza.getPatientForUser(B.uid, X), 'karta X bez wersji znika').toBeFalsy();
    expect(await B.baza.listSnapshotsForUser(B.uid, X)).toEqual([]);
    expect((await B.baza.listTombstonesForUser(B.uid)).map((t) => t.patientId), 'bez nagrobka X').toEqual([]);
    const wY = (await B.baza.listSnapshotsForUser(B.uid, Y)).map((s) => s.snapshotId);
    expect(wY).toContain(x.snapshotId);
    expect(wY).toHaveLength(4);
    expect((await B.baza.getPatientForUser(B.uid, Y)).snapshotCount).toBe(4);
    expect(wynik.mergedPatientCount, 'karta Y scalona').toBe(1);
    // Potem przychodzi nagrobek X (osobna delta albo pełny ładunek A): nic do usunięcia, nagrobek zapisany, Y bez zmian.
    await B.v.mergeSyncPayload(kopia(await A.v.exportSyncPayload()));
    expect((await B.baza.listTombstonesForUser(B.uid)).map((t) => t.patientId)).toEqual([X]);
    expect((await B.baza.listSnapshotsForUser(B.uid, Y)).map((s) => s.snapshotId).sort()).toEqual([...wY].sort());
  }, CZAS);

  // [CZERWONY na audyt — x1 przepinany pod Y bez porównania, licznik Z rozjechany] Scalanie stoi po zapisie karty P
  // z ładunku (magazyn bez odczytu po kluczu: mapa właścicieli już zbudowana przy nowej wersji P); w tym czasie
  // „Scal pacjentów” X → Z w innej karcie przeglądarki przenosi x1, x2, x3 pod Z. Scalanie Y czyta x1 po kluczu albo
  // szuka jej tam, gdzie wskazuje mapa (X), nie znajduje i buduje mapę od nowa — decyzja na świeżym rekordzie spod Z.
  // Remis (ta sama rev i chwila zmiany) rozstrzyga mniejszy patientId (obie kolejności Y i Z); liczniki zgodne, nic nie
  // ginie.
  it.each([[false, 'Y<Z'], [false, 'Y>Z'], [true, 'Y<Z'], [true, 'Y>Z']])('wersja przeniesiona w innej karcie w trakcie scalania (magazyn bez odczytu po kluczu: %s, %s)', async (bezKlucza, kolejnosc) => {
    const A = await urzadzenie('A');
    const B = await urzadzenie('B', { bezOdczytuPoKluczu: bezKlucza });
    const P = await karta(A.v);
    await chwila(4);
    const X = await karta(A.v);
    await chwila(4);
    const Y = await karta(A.v);
    await chwila(4);
    const Z = await kartaWzgledem(A, Y, kolejnosc === 'Y<Z');
    expect(Y < Z).toBe(kolejnosc === 'Y<Z');
    await B.v.mergeSyncPayload(kopia(await A.v.exportSyncPayload()));
    await chwila(5);
    await A.v.mergePatients(X, Y);
    await chwila(5);
    await zapiszWersje(A, P, [60, 66, 72]);
    await zapiszWersje(B, X, [60, 66, 74]);
    const ladunek = kopia(await A.v.exportSyncPayload());
    // karta P (z nową wersją — ona buduje mapę) idzie w ładunku przed Y
    ladunek.patients.sort((a, b) => (a.patientId === P ? -1 : b.patientId === P ? 1 : 0));
    const p = B.pulapka('putPatientForUser', (uid, rek) => rek && rek.patientId === P);
    const sync = B.v.mergeSyncPayload(ladunek);
    await p.osiagnieta;
    await B.v.mergePatients(X, Z);
    p.zwolnij();
    await sync;
    let wszystkie = 0;
    for (const k of await B.baza.listPatientsForUser(B.uid)) {
      const w = await B.baza.listSnapshotsForUser(B.uid, k.patientId);
      wszystkie += w.length;
      expect(k.snapshotCount, `licznik karty ${k.patientId === Y ? 'Y' : k.patientId === Z ? 'Z' : k.patientId === P ? 'P' : '?'}`).toBe(w.length);
    }
    // P 3, Y 2 + ym, Z 2 + x1 x2 x3 + zm — każda wersja jest w jakiejś karcie
    expect(wszystkie).toBe(3 + 3 + 6);
    const wlasciciel = (await B.baza.listSnapshotsForUser(B.uid, Y < Z ? Y : Z)).length;
    expect(wlasciciel, 'x1 i x2 pod kartą o mniejszym id').toBe(Y < Z ? 5 : 6);
  }, CZAS);
});

describe('P-SYNC-WLASCICIEL — wersja bez karty', () => {
  // [CZERWONY na audyt — licznik X 3 przy 2 wersjach (licznik przyrostowy); ZIELONY na 88f558c] Wersja, która leży tu
  // pod kartą, której już nie ma (sierota — np. po przerwanym usunięciu karty), nie jest „pod inną istniejącą kartą”:
  // ładunek zapisuje ją pod swoją kartą jak nową. Pilnuje gałęzi „karta wersji nie istnieje” w Bsw_decyzja (mutant
  // recenzenta R12 — „pomiń” — przeżywał wszystkie testy).
  it('wersja-sierota wraca pod kartę z ładunku, licznik = liczba wersji', async () => {
    const A = await urzadzenie('A'), B = await urzadzenie('B');
    const X = await karta(A.v);
    await B.v.mergeSyncPayload(kopia(await A.v.exportSyncPayload()));
    const [w1] = (await B.baza.listSnapshotsForUser(B.uid, X)).sort((a, b) => (a.savedAtISO < b.savedAtISO ? -1 : 1));
    await B.baza.putSnapshotForUser(B.uid, Object.assign({}, w1, { patientId: 'karta-usunieta-testowa' }));
    expect((await B.baza.listSnapshotsForUser(B.uid, X)).length).toBe(1);
    await B.v.mergeSyncPayload(kopia(await A.v.exportSyncPayload()));
    const wX = (await B.baza.listSnapshotsForUser(B.uid, X)).map((s) => s.snapshotId);
    expect(wX).toContain(w1.snapshotId);
    expect(wX).toHaveLength(2);
    expect((await B.baza.getPatientForUser(B.uid, X)).snapshotCount).toBe(2);
    expect(await B.baza.listSnapshotsForUser(B.uid, 'karta-usunieta-testowa')).toEqual([]);
  }, CZAS);
});

describe('P-SYNC-WLASCICIEL — koszt odczytów', () => {
  async function zrodlo(karty, wersji) {
    const Z = await urzadzenie('Z');
    for (let p = 0; p < karty; p += 1) {
      const a = await Z.v.savePatient(zapis([60]), { dedup: false });
      for (let k = 1; k < wersji; k += 1) await Z.v.savePatient(zapis([60 + k]), { patientId: a.patientId, dedup: false });
    }
    return kopia(await Z.v.exportSyncPayload());
  }

  // [ZIELONY na audyt] Pierwsze pobranie na puste urządzenie: żadnego odczytu wersji po kluczu ani przeglądu kart
  // (sito: wersji tu nie ma). Wariant badacza bez sita robił jeden odczyt na wersję (480 przy 480 wersjach), a bez
  // metody adaptera — przegląd wszystkich kart przy każdej wersji (14160 list wersji).
  it.each([false, true])('pierwsze pobranie 12 kart × 4 wersje (magazyn bez odczytu po kluczu: %s): 0 dodatkowych odczytów', async (bezKlucza) => {
    const ladunek = await zrodlo(12, 4);
    const D = await urzadzenie('D', { bezOdczytuPoKluczu: bezKlucza });
    D.zeruj();
    const w1 = await D.v.mergeSyncPayload(kopia(ladunek));
    expect(w1.addedSnapshotCount).toBe(48);
    expect(D.licz.getSnapshotForUser || 0, 'odczyty po kluczu').toBe(0);
    expect(D.licz.listSnapshotsForUser || 0, 'listy wersji').toBe(0);
    expect(D.licz.listPatientsForUser || 0, 'listy kart').toBeLessThanOrEqual(2);
    expect(D.licz.putSnapshotForUser).toBe(48);
    // Ponowne pobranie bez zmian: tyle co dotąd (lista wersji każdej karty z ładunku), bez mapy i odczytów po kluczu.
    D.zeruj();
    await D.v.mergeSyncPayload(kopia(ladunek));
    expect(D.licz.getSnapshotForUser || 0).toBe(0);
    expect(D.licz.listSnapshotsForUser || 0).toBe(12);
    expect(D.licz.listPatientsForUser || 0).toBe(1);
    expect(D.licz.putSnapshotForUser || 0).toBe(0);
    expect(D.licz.putPatientForUser || 0, 'w stanie zgodnym nic się nie zapisuje').toBe(0);
  }, CZAS);

  // [CZERWONY na audyt — X_i zabierała dawne wersje spod Y_i (X_i 3 wersje zamiast 1)] Wersje leżące tu pod innymi
  // kartami (6 par scalonych tutaj X_i → Y_i, każda X_i z nowym zapisem na drugim urządzeniu): jeden odczyt po kluczu na
  // wersję z ładunku, której karta z ładunku tu nie ma (12 dawnych wersji X_i i 6 nowych), bez mapy właścicieli;
  // magazyn bez odczytu po kluczu — mapa raz na scalanie.
  it.each([false, true])('6 scalonych par, 12 wersji pod innymi kartami (magazyn bez odczytu po kluczu: %s): koszt liniowy', async (bezKlucza) => {
    const A = await urzadzenie('A');
    const B = await urzadzenie('B', { bezOdczytuPoKluczu: bezKlucza });
    const pary = [];
    for (let i = 0; i < 6; i += 1) pary.push([await karta(A.v), await karta(A.v)]);
    await B.v.mergeSyncPayload(kopia(await A.v.exportSyncPayload()));
    await chwila(5);
    for (const [x, y] of pary) await B.v.mergePatients(x, y);
    await chwila(5);
    for (const [x] of pary) await zapiszWersje(A, x, [60, 66, 72]);
    B.zeruj();
    await B.v.mergeSyncPayload(kopia(await A.v.exportSyncPayload()));
    // każda X_i wraca z nowym zapisem; jej dawne wersje zostają pod Y_i (tam nowsza rewizja)
    for (const [x, y] of pary) {
      expect((await B.baza.listSnapshotsForUser(B.uid, x)).length).toBe(1);
      expect((await B.baza.getPatientForUser(B.uid, x)).snapshotCount).toBe(1);
      expect((await B.baza.listSnapshotsForUser(B.uid, y)).length).toBe(5);
    }
    if (bezKlucza) {
      expect(B.licz.listPatientsForUser || 0, 'mapa właścicieli raz na scalanie').toBeLessThanOrEqual(2);
      // 6 kart Y z ładunku + mapa (najwyżej 12 kart) + 12 odczytów karty wskazanej przez mapę; wariant badacza:
      // przegląd kart przy każdej wersji (13 list kart).
      expect(B.licz.listSnapshotsForUser || 0).toBeLessThanOrEqual(6 + 12 + 12);
    } else {
      expect(B.licz.listPatientsForUser || 0, 'bez mapy właścicieli').toBe(1);
      expect(B.licz.getSnapshotForUser || 0, 'odczyt po kluczu: 12 dawnych wersji X_i + 6 nowych').toBe(18);
      expect(B.licz.listSnapshotsForUser || 0, 'listy wersji tylko kart Y_i z ładunku').toBe(6);
    }
  }, CZAS);

  // [ZIELONY na audyt (bez sprawdzania właściciela); CZERWONY na 88f558c — 41 list wersji na jedną deltę] Uwaga
  // recenzenta do 88f558c: najczęstsza delta (zapis jednej karty na innym urządzeniu) budowała mapę właścicieli z wersji
  // wszystkich kart konta, pod blokadą karty z delty (200 kart: 201 list wersji, 264 KB szyfrogramów zamiast 1,3 KB;
  // w Chromium na IndexedDB przy 1600 kartach ok. 1,3–1,9 s zamiast 25–36 ms). Teraz: odczyt po kluczu tylko nowej
  // wersji, lista wersji tylko karty z delty — koszt nie zależy od liczby kart.
  it.each([false, true])('delta na żywo jednej karty z jedną nową wersją, konto 40 kart (magazyn bez odczytu po kluczu: %s): koszt niezależny od liczby kart', async (bezKlucza) => {
    const A = await urzadzenie('A');
    const B = await urzadzenie('B', { bezOdczytuPoKluczu: bezKlucza });
    const ids = [];
    for (let i = 0; i < 40; i += 1) {
      const a = await A.v.savePatient(zapis([60]), { dedup: false });
      await A.v.savePatient(zapis([60, 66]), { patientId: a.patientId, dedup: false });
      ids.push(a.patientId);
    }
    await B.v.mergeSyncPayload(kopia(await A.v.exportSyncPayload()));
    await chwila(5);
    await zapiszWersje(A, ids[7], [60, 66, 72]);
    const d = await delty(A, [ids[7]]);
    expect(d).toHaveLength(1);
    B.zeruj();
    const w = await B.v.mergeSyncPayload(d[0]);
    expect(w.addedSnapshotCount).toBe(1);
    expect((await B.baza.listSnapshotsForUser(B.uid, ids[7])).length).toBe(3);
    if (bezKlucza) {
      // droga zapasowa dla obcego magazynu: mapa właścicieli (przegląd kart) najwyżej raz na scalanie
      expect(B.licz.listPatientsForUser || 0).toBeLessThanOrEqual(2);
      expect(B.licz.listSnapshotsForUser || 0).toBeLessThanOrEqual(1 + 40);
    } else {
      expect(B.licz.listPatientsForUser || 0, 'lista kart raz (start scalania), bez mapy właścicieli').toBe(1);
      expect(B.licz.listSnapshotsForUser || 0, 'tylko lista wersji karty z delty').toBe(1);
      expect(B.licz.getSnapshotForUser || 0, 'odczyt po kluczu tylko nowej wersji').toBeLessThanOrEqual(1);
    }
  }, CZAS);
});

// [CZERWONY na audyt — tych funkcji i wywołań nie było]
describe('strażniki źródła (P-SYNC-WLASCICIEL)', () => {
  const src = readFileSync(path.join(repoRoot, 'vilda_vault.js'), 'utf8');

  it('faza przeniesień bierze blokady obu kart (Bsl_podBlokada) w kolejności rosnących id', () => {
    const f = src.slice(src.indexOf('async function Bsl_przeniesWersje('), src.indexOf('async function Bsw_przenies('));
    expect(f.length).toBeGreaterThan(100);
    expect(f).toContain('const para = F < G ? [F, G] : [G, F];');
    const i0 = f.indexOf('Bsl_podBlokada(para[0],'), i1 = f.indexOf('Bsl_podBlokada(para[1],'), ip = f.indexOf('Bsw_przenies(p, teraz)');
    expect(i0).toBeGreaterThan(0);
    expect(i1).toBeGreaterThan(i0);
    expect(ip).toBeGreaterThan(i1);
    // zapisy przeniesienia (Bsw_przenies) wołane wyłącznie z wnętrza obu blokad
    expect(src.match(/Bsw_przenies\(/g)).toHaveLength(2);
    // karta oddająca wersję (licznik albo usunięcie pustej karty) — tylko z Bsw_przenies, czyli pod obiema blokadami
    expect(src.match(/Bsw_poOddaniu\(/g)).toHaveLength(2);
    const fp = src.slice(src.indexOf('async function Bsw_przenies('), src.indexOf('async function Bsw_poOddaniu('));
    expect(fp).toContain('await Bsw_poOddaniu(G, rekG, wersjeG.length - 1);');
    const fo = src.slice(src.indexOf('async function Bsw_poOddaniu('), src.indexOf('// Najnowszy lokalny nagrobek pacjenta'));
    expect(fo).toContain('else await I().removePatientForUser(b, G);');
    expect(fo).not.toContain('putTombstoneForUser');
  });

  it('Le: N w kontekście, faza przeniesień po pętli pacjentów, przed usuwaniem kart i końcem scalania kosza', () => {
    const le = src.slice(src.indexOf('async function Le(t,e){'), src.indexOf('prunedSnapshotCount:Bkz_S.przyciete||0}'));
    expect(le).toContain('(!F||m[P]>=F)&&N.add(P)});Bkz_S.Bsw_N=N;Bkz_S.Bsw_pusto=!a.length;for(let P=0;P<o.length;P++){');
    // `a` w Le to lista kart konta na starcie scalania (konto bez kart: pierwsze pobranie, bez odczytów po kluczu)
    expect(le).toContain(',a=await I().listPatientsForUser(b);const Bkz_S=await Bkz_scalStart(t);');
    const iPetla = le.indexOf('const Bsl_w=await Bsl_scalPacjenta(F,j,H,R,Bkz_S,i,e);');
    const iPrzen = le.indexOf('await Bsl_przeniesWersje(Bkz_S,i,e);');
    const iUsun = le.indexOf('w+=await Bsl_usunPacjenta(j,m[j],e)');
    const iKosz = le.indexOf('await Bkz_scalKoniec(Bkz_S,e)');
    expect(iPetla).toBeGreaterThan(0);
    expect(iPrzen).toBeGreaterThan(iPetla);
    expect(iUsun).toBeGreaterThan(iPrzen);
    expect(iKosz).toBeGreaterThan(iUsun);
  });

  it('„Scal pacjentów” zapisuje przeniesioną wersję przez Bsw_poScaleniu; adaptery mają odczyt wersji po kluczu', () => {
    expect(src).toContain('await I().putSnapshotForUser(b,Object.assign({},o[d],Bsw_poScaleniu(o[d],e),Bm1(o[d])))');
    expect(src).toContain('async getSnapshotForUser(o,a){const i=(await r(o)).transaction(It,"readonly").objectStore(It);return await t(i.get(a))||null}');
    expect(src).toContain('getSnapshotForUser:function(n,r){return e.getSnapshotForUser(n,r)}');
  });
});
