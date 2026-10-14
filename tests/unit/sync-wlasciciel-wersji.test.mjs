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
// Ten plik (240 testów) na `audyt` 2df41a8: 191 czerwonych; na trzeciej wersji tej zmiany (dd21d11): 34; na czwartej
// (69e41d1): 17 — uwagi przeglądu końcowego do 69e41d1: przeniesiona wersja brała chwilę zapisu z treścią, więc
// poprawka bieżącego pomiaru starej karty (okno „Edytuj pomiar”, nowa chwila zapisu) stawała się po synchronizacji
// bieżącą wersją karty scalonej — bez pomiarów pozostałych kart; decyzja „treść” w gałęzi istniejącej karty nie miała
// testu.
// Wcześniejsze stany pliku: 233 testy — na `audyt` 184, na dd21d11 29 (po łańcuchu „Scal pacjentów” X → Y → Z zmiana
// wersji w starej karcie na urządzeniu, które o scaleniach nie wiedziało, ginęła pod dawną treścią z wyższą rev; z dwóch
// współbieżnych poprawek pod różnymi kartami wygrywała ta z urządzenia scalającego, nie późniejsza); 203 testy — na
// `audyt` 155, na 88f558c 66, na 4270ca1 40 (zmieniona bez nowego zapisu
// wersja starej karty ginęła, gdy delta karty celu przychodziła przed osobną deltą nagrobka; trzy urządzenia
// rozjeżdżały się na stałe; karty z fazy przeniesień nie liczyły się w wyniku scalania); 130 testów — na `audyt` 96,
// na 88f558c 20; 55 testów — na `audyt` 43, na wariancie badacza W2e 14, na szkicu krytyka W2f 7.
//
// Prawdziwy vilda_vault.js i vilda_crypto.js, dwa „urządzenia” = dwa sejfy z osobnymi magazynami w pamięci, prawdziwe
// exportSyncPayload → mergeSyncPayload. Modele synchronizacji jak vilda_sync.js: „chmura” (pobierz, scal, wyślij pełny
// eksport; ETag szereguje wysyłki), „krzyżowa” (oba urządzenia eksportują, potem każde scala cudzy ładunek — jak
// mijające się delty) i „delty+chmura” (runda 1: prawdziwe buildPatientDelta karty i osobno buildTombstoneDelta
// nagrobków, jak zdarzenia vilda_sync_integration; dalej chmura); część scenariuszy na trzech urządzeniach i na
// prawdziwym vilda_sync_integration.js (odświeżenie listy pacjentów). Scenariusze idą w obu kolejnościach identyfikatorów
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

/* Identyfikator w kształcie UUID, większy (wiekszy = true) albo mniejszy w porządku napisów niż `inny`, za jednym
   razem: pierwsza cyfra `inny` (poza myślnikami), która nie jest skrajna (f przy „większy”, 0 przy „mniejszy”), dostaje
   losową cyfrę po właściwej stronie, wcześniejsze zostają, dalsze są losowe. */
function idWzgledem(inny, wiekszy) {
  const hex = '0123456789abcdef';
  const los = (od, doW) => hex[od + Math.floor(Math.random() * (doW - od + 1))];
  for (let i = 0; i < inny.length; i += 1) {
    const c = hex.indexOf(inny[i]);
    if (c < 0 || (wiekszy ? c === 15 : c === 0)) continue;
    const reszta = inny.slice(i + 1).replace(/[0-9a-f]/g, () => los(0, 15));
    return inny.slice(0, i) + (wiekszy ? los(c + 1, 15) : los(0, c - 1)) + reszta;
  }
  return wiekszy ? `${inny}0` : inny.slice(0, -1); // same skrajne cyfry: przedłużenie albo skrócenie napisu
}

/* Karta jak wyżej, o identyfikatorze większym (wiekszy = true) albo mniejszym niż `inny`. Remis właściciela rozstrzyga
   mniejszy patientId (losowy UUID), więc scenariusze idą w obu kolejnościach identyfikatorów: wynik testów i liczba
   czerwonych przy mutacjach nie zależą od losowania (uwaga recenzenta do 88f558c: M1 dawało 7–13 czerwonych).
   Identyfikator nadajemy jawnie (savePatient z patientId zakłada nieznaną kartę pod tym id). Dotąd karty zakładane
   do skutku, aż wypadnie właściwa kolejność: przy `inny` blisko końca zakresu szansa na próbę spadała do ok. 1/3600,
   ogon liczby prób P(N > n) = 1/(n + 1), a ok. 4% przebiegów pliku przekraczało limit 30 s (uwaga recenzenta do
   dd21d11). */
async function kartaWzgledem(d, inny, wiekszy) {
  const id = idWzgledem(inny, wiekszy);
  const a = await d.v.savePatient(zapis([60]), { patientId: id, dedup: false });
  expect(a.patientId).toBe(id);
  await chwila(4);
  await d.v.savePatient(zapis([60, 66]), { patientId: id, dedup: false });
  return id;
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
  // w starej X (61 mies.; rev 1, chwila zapisu X = teraz). Scenariusz recenzenta „dwiePoprawki”: dwie współbieżne
  // poprawki tej samej wersji pod różnymi kartami — wygrywa późniejsza (61).
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

  // [CZERWONY na audyt i na 4270ca1 — x1 = 60:120 na obu, treść poprawki z B ginęła] Ten sam scenariusz, gdy delta
  // karty Y i delta nagrobka X przychodzą osobno (delty na żywo). Dotąd w chwili delty Y karta X nie była jeszcze skazana,
  // poprawiona x1 (nowsza treść) zostawała przy X, a delta nagrobka usuwała X razem z nią. Teraz delta nagrobka X
  // z urządzenia scalającego niesie kartę Y (Bsw_deltaNagrobka): X jest w zbiorze N, x1 przechodzi pod Y z poprawką.
  it.each(KOLEJNOSCI)('poprawka pomiaru w X po scaleniu, delty osobno (delty+chmura, %s): x1 pod Y z poprawioną treścią na obu', async (kolejnosc) => {
    const { ctx, koniec, log } = await przebieg({ model: 'delty+chmura', kolejnosc, akcje: AKCJE.korekta });
    oczekujNaObu(koniec, { Y: karta2(5, ['x1', 'x2', 'y1', 'y2', 'ym']) }, ['X']);
    expect(koniec.zbiezne).toBe(true);
    expect(utracone(log)).toEqual([]);
    const x1 = idPo(ctx.et, 'x1');
    expect(await trescWersji(ctx.A, ctx.Y, x1)).toBe('61:120.5');
    expect(await trescWersji(ctx.B, ctx.Y, x1)).toBe('61:120.5');
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
    // bieżące wersje: X — poprawiona x1 (jedyna), Y — głowa scalenia
    for (const d of [ctx.A, ctx.B]) {
      expect((await d.v.getLatestSnapshot(ctx.X)).snapshotId, `bieżąca wersja X na ${d.nazwa}`).toBe(x1);
      expect((await d.v.getLatestSnapshot(ctx.Y)).snapshotId, `bieżąca wersja Y na ${d.nazwa}`).toBe(idPo(ctx.et, 'ym'));
    }
  }, CZAS);

  // [CZERWONY na audyt i na 88f558c — wszystkie 8] Uwaga recenzenta do 88f558c (scenariusz „dwiePoprawki”). Na 88f558c
  // we wszystkich modelach: A Y 5/5 bez X i bez nagrobka X, B X 1/1 [x2] + Y 4/4 — urządzenia trwale rozjechane
  // (x2 była ostatnią wersją X, więc nie przechodziła; nagrobek scalenia na A znikał, bo X tam nie powstała); mutant
  // R1 (bez wczesnego powrotu w gałęzi nowej karty) zakładał na A pustą X 0/0. Na audyt dodatkowo rozjechane liczniki.
  // Teraz x2 przechodzi pod Y także na B (pusta X znika), a nagrobek scalenia zostaje na A — zbieżnie, nic nie ginie.
  // Treść x1: [CZERWONY na dd21d11 — wszystkie 8: x1 = 62:121, bo rev 2 (podbicie przy scaleniu + poprawka) wygrywała
  // z późniejszą poprawką w starej karcie (rev 1)] Treść wersji wspólnej dwom kartom wybiera teraz późniejsza chwila
  // zmiany (uwagi recenzentów do dd21d11): wygrywa późniejsza poprawka z B, także w kolejnych rundach (rev wyniku =
  // wyższa z dwóch, więc reguła tej samej karty jej nie cofa). Do akceptacji właściciela (zmiana względem dd21d11).
  // Bieżąca wersja Y: [CZERWONY na 69e41d1 — x1 z chwilą zapisu poprawki B (późniejszą niż ym) była bieżącą wersją Y
  // na obu urządzeniach; uwaga przeglądu końcowego do 69e41d1] Chwila zapisu wersji — ze strony, która wygrała
  // przypisanie karty (Y), więc bieżącą wersją Y zostaje głowa scalenia.
  it.each(PRZYPADKI)('dwie poprawki x1 — pod Y na A i w starej X na B (%s, %s): Y [x1 x2 y1 y2 ym] na obu, nagrobek X, x1 z późniejszą poprawką (B), bieżąca wersja Y = ym', async (model, kolejnosc) => {
    const { ctx, koniec, log } = await przebieg({ model, kolejnosc, akcje: AKCJE.dwiePoprawki });
    oczekujNaObu(koniec, { Y: karta2(5, ['x1', 'x2', 'y1', 'y2', 'ym']) }, ['X']);
    expect(koniec.zbiezne).toBe(true);
    expect(utracone(log)).toEqual([]);
    const x1 = idPo(ctx.et, 'x1');
    expect(await trescWersji(ctx.A, ctx.Y, x1)).toBe('61:120.5');
    expect(await trescWersji(ctx.B, ctx.Y, x1)).toBe('61:120.5');
    for (const d of [ctx.A, ctx.B]) {
      expect((await d.v.getLatestSnapshot(ctx.Y)).snapshotId, `bieżąca wersja Y na ${d.nazwa}`).toBe(idPo(ctx.et, 'ym'));
    }
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
     (X z jedną wersją: Y 3/3), kosz pusty; po synchronizacji B z chmurą to samo w chmurze i na C.
     Od poprawek do 4270ca1 delta nagrobka X z urządzenia scalającego niesie też kartę Y; wariant „sam nagrobek” (delta
     ponad limit sygnału albo nadawca sprzed zmiany) pilnuje dalej drogi bez karty Y (ostatnia wersja X w fazie
     przeniesień). */
  async function kartaN(v, n) {
    const a = await v.savePatient(zapis([60]), { dedup: false });
    for (let i = 1; i < n; i += 1) { await chwila(4); await v.savePatient(zapis([60, 60 + 6 * i]), { patientId: a.patientId, dedup: false }); }
    return a.patientId;
  }
  const WARIANTY = ['Y, potem nagrobek X', 'nagrobek X, potem Y'].flatMap((k) => [2, 1].flatMap((n) => KOLEJNOSCI.flatMap((id) => ['nagrobek z kartą Y', 'sam nagrobek'].map((t) => [k, n, id, t]))));
  it.each(WARIANTY)('%s, X z %i wersjami (%s, %s): Y z wszystkimi wersjami X na B, w chmurze i na C', async (kolejnosc, nX, kolejnoscId, rodzaj) => {
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
    if (rodzaj === 'sam nagrobek') dX.patients = [];
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

describe('P-SYNC-WLASCICIEL — zmiana wersji starej karty bez nowego zapisu a delty na żywo po „Scal pacjentów”', () => {
  /* Uwaga recenzenta do 4270ca1 (waga wysoka). A robi „Scal pacjentów” X → Y i wysyła delty jak vilda_sync_integration:
     kartę Y (buildPatientDelta), potem nagrobek X (buildTombstoneDelta). Na B użytkownik — przed scaleniem na A albo po
     nim, bez synchronizacji — wykonuje na X zwykłą operację Karty, która podbija rev i chwilę zmiany wersji, ale nie
     chwilę zapisu karty: edycja albo usunięcie wiersza pomiaru (updateMeasurementRow, deleteMeasurementRow — bieżąca
     wersja x2), przypięcie x2 (setSnapshotPinned), korekta x1 z zachowaną chwilą zapisu (updateSnapshotPayload,
     preserveSavedAt). Nagrobek X wygrywa (chwila zapisu X sprzed scalenia). Potem B synchronizuje się z chmurą, w której
     jest jeszcze stan sprzed scalenia, a nowe urządzenie C pobiera chmurę.
     [CZERWONY na 4270ca1] kolejność „Y, potem nagrobek X”: zmieniona wersja była na B nowszym rekordem, więc zostawała
     przy X, a delta nagrobka usuwała ją razem z X — B, chmura i C: Y 4/4 bez niej, kosz pusty (rk-ogon5, rk-ogon4).
     [CZERWONY na audyt] treść zmiany ginęła (Y 5/5, ale x2 bez przypięcia i z dawnym wierszem, x1 = 60:120); na
     4270ca1 w kolejności „nagrobek X, potem Y” tak samo.
     Teraz delta nagrobka X z urządzenia scalającego niesie też kartę Y: X jest w zbiorze N, jej wersje przechodzą pod Y
     z nowszą treścią (wyjątek „zabierz”) w obu kolejnościach delt. */
  const OPERACJE = {
    'edycja wiersza': { wersja: 'x2', zrob: (B, X) => B.v.updateMeasurementRow(X, { uid: 'm-66' }, { height: 124 }) },
    'usunięcie wiersza': { wersja: 'x2', zrob: (B, X) => B.v.deleteMeasurementRow(X, { uid: 'm-60' }) },
    'przypięcie': { wersja: 'x2', zrob: (B, X, sid) => B.v.setSnapshotPinned(X, sid, true) },
    'korekta z zachowaną chwilą zapisu': { wersja: 'x1', zrob: (B, X, sid) => B.v.updateSnapshotPayload(X, sid, zapis([61]), { preserveSavedAt: true }) },
  };
  // Treść wersji, którą zmienia operacja: pomiary (wiek:wzrost) i przypięcie.
  async function sygnatura(d, patientId, snapshotId) {
    const p = await d.v.getPatient(patientId);
    const s = p && p.snapshots.find((q) => q.snapshotId === snapshotId);
    return s ? `${pomiaryZ(s.payload)}${s.payload && s.payload._pinned ? ' przypięta' : ''}` : null;
  }
  async function przebiegOperacji(oper, kiedy, kolejnoscId) {
    const A = await urzadzenie('A'), B = await urzadzenie('B'), C = await urzadzenie('C');
    const X = await karta(A.v);
    await chwila(4);
    const Y = await kartaWzgledem(A, X, kolejnoscId === 'X<Y');
    const sync = chmura();
    await sync(A); await sync(B); // w chmurze stan sprzed scalenia
    const et = await etykiety(A, { X, Y });
    const op = OPERACJE[oper], sid = idPo(et, op.wersja);
    const przed = await sygnatura(B, X, sid);
    await chwila(5);
    if (kiedy === 'przed scaleniem') { await op.zrob(B, X, sid); await chwila(5); }
    et[(await A.v.mergePatients(X, Y)).snapshotId] = 'ym';
    if (kiedy === 'po scaleniu') { await chwila(5); await op.zrob(B, X, sid); }
    const zmieniona = await sygnatura(B, X, sid);
    expect(zmieniona, 'operacja zmieniła treść wersji').not.toBe(przed);
    const nagrobekX = (await A.baza.listTombstonesForUser(A.uid)).find((t) => t.patientId === X).deletedAtISO;
    expect((await B.baza.getPatientForUser(B.uid, X)).lastSavedAtISO < nagrobekX, 'nagrobek X wygrywa').toBe(true);
    const [dY, dX, ...reszta] = await delty(A, [Y]);
    expect(reszta).toEqual([]);
    return { A, B, C, X, Y, et, sid, sync, dY, dX, zmieniona };
  }
  const oczekiwane = { Y: karta2(5, ['x1', 'x2', 'y1', 'y2', 'ym']) };

  const WARIANTY = Object.keys(OPERACJE).flatMap((o) => ['po scaleniu', 'przed scaleniem'].flatMap((k) => KOLEJNOSCI.map((id) => [o, k, 'Y, potem nagrobek X', id])))
    .concat(Object.keys(OPERACJE).flatMap((o) => KOLEJNOSCI.map((id) => [o, 'po scaleniu', 'nagrobek X, potem Y', id])));
  it.each(WARIANTY)('%s w X (%s), delty %s (%s): B, chmura i C — Y 5/5 ze zmienioną wersją, nic nie ginie', async (oper, kiedy, kolejnoscDelt, kolejnoscId) => {
    const p = await przebiegOperacji(oper, kiedy, kolejnoscId);
    for (const d of kolejnoscDelt.startsWith('Y') ? [p.dY, p.dX] : [p.dX, p.dY]) await p.B.v.mergeSyncPayload(d);
    const sB = await stan(p.B, p.et);
    expect(sB.karty).toEqual(oczekiwane);
    expect(sB.nagrobki).toEqual(['X']);
    expect(sB.kosz).toEqual([]);
    expect(sB.sieroty).toBe(0);
    expect(await sygnatura(p.B, p.Y, p.sid), 'zmiana z B zachowana').toBe(p.zmieniona);
    // B: pobierz nieaktualną chmurę, scal, wyślij; C: pierwsze pobranie.
    await p.sync(p.B);
    await p.sync(p.C);
    for (const d of [p.B, p.C]) {
      const s = await stan(d, p.et);
      expect(s.karty, `urządzenie ${d.nazwa}`).toEqual(oczekiwane);
      expect(s.nagrobki, `nagrobki ${d.nazwa}`).toEqual(['X']);
      expect(s.sieroty).toBe(0);
      expect(await sygnatura(d, p.Y, p.sid), `treść na ${d.nazwa}`).toBe(p.zmieniona);
    }
    // A po pobraniu chmury też ma zmianę z B (ta sama wersja, nowsza treść).
    await p.sync(p.A);
    expect((await stan(p.A, p.et)).karty).toEqual(oczekiwane);
    expect(await sygnatura(p.A, p.Y, p.sid)).toBe(p.zmieniona);
  }, CZAS);

  // [ZIELONY na 4270ca1 — przypięte znane ograniczenie; CZERWONY na audyt, gdzie delta Y przepinała x2 bez porównania]
  // Delta nagrobka bez karty Y po delcie Y: przypięta x2 zostaje na B przy X i ginie z nią; po synchronizacji B
  // z nieaktualną chmurą brak jej też w chmurze i na C. Wraca (bez przypięcia) dopiero z pełnym stanem urządzenia
  // scalającego. Urządzenie po tej zmianie wysyła deltę Y i nagrobek bez karty Y tylko razem z… niczym: gdy delta Y
  // przekracza limit, nie idzie żadna z nich z kartą (sam nagrobek, jak na audyt). Tę drogę daje więc nadawca sprzed
  // zmiany („Flota mieszana”); test pilnuje, że strata jest przejściowa.
  it.each(KOLEJNOSCI)('sam nagrobek X po delcie Y, przypięcie x2 po scaleniu (%s): x2 znika do pełnej synchronizacji A — znane ograniczenie', async (kolejnoscId) => {
    const p = await przebiegOperacji('przypięcie', 'po scaleniu', kolejnoscId);
    p.dX.patients = [];
    await p.B.v.mergeSyncPayload(p.dY);
    await p.B.v.mergeSyncPayload(p.dX);
    const bez = { Y: karta2(4, ['x1', 'y1', 'y2', 'ym']) };
    expect((await stan(p.B, p.et)).karty).toEqual(bez);
    await p.sync(p.B);
    await p.sync(p.C);
    expect((await stan(p.C, p.et)).karty).toEqual(bez);
    await p.sync(p.A);
    await p.sync(p.B);
    await p.sync(p.C);
    for (const d of [p.A, p.B, p.C]) {
      expect((await stan(d, p.et)).karty, `urządzenie ${d.nazwa}`).toEqual(oczekiwane);
      expect(await sygnatura(d, p.Y, p.sid), `x2 bez przypięcia na ${d.nazwa}`).not.toContain('przypięta');
    }
  }, CZAS);

  // [CZERWONY na audyt i na 4270ca1 — delta nagrobka zawsze bez kart] Format delty nagrobka: po „Scal pacjentów” X → Y
  // na tym urządzeniu — karta Y (ta sama co w buildPatientDelta(Y)) i nagrobek X; zwykłe usunięcie karty — sam nagrobek;
  // karta Y, z którą delta przekroczyłaby limit sygnału (60 000 znaków szyfrogramu, jak dla delty karty w integracji) —
  // sam nagrobek.
  it('delta nagrobka po „Scal pacjentów” niesie kartę docelową; zwykłe usunięcie i delta ponad limit — sam nagrobek', async () => {
    const A = await urzadzenie('A');
    const odszyfruj = async (z) => kopia(await A.v.decryptPayloadForCurrentUser(z.iv, z.data));
    const X = await karta(A.v), Y = await karta(A.v), Z = await karta(A.v);
    await A.v.mergePatients(X, Y);
    const tX = (await A.baza.listTombstonesForUser(A.uid)).find((t) => t.patientId === X);
    const dX = await odszyfruj(await A.v.buildTombstoneDelta(X, tX.deletedAtISO));
    const dY = await odszyfruj(await A.v.buildPatientDelta(Y));
    expect(dX.tombstones).toEqual([{ patientId: X, deletedAtISO: tX.deletedAtISO }]);
    expect(dX.patients).toEqual(dY.patients);
    expect(dX.patients[0].snapshots).toHaveLength(5);
    // zwykłe usunięcie karty — sam nagrobek, jak dotąd
    await A.v.removePatient(Z);
    const tZ = (await A.baza.listTombstonesForUser(A.uid)).find((t) => t.patientId === Z);
    const dZ = await odszyfruj(await A.v.buildTombstoneDelta(Z, tZ.deletedAtISO));
    expect(dZ.patients).toEqual([]);
    expect(dZ.tombstones).toEqual([{ patientId: Z, deletedAtISO: tZ.deletedAtISO }]);
    // karta docelowa ponad limit: wersja z długim opisem (dane fikcyjne)
    const P = await karta(A.v), Q = await karta(A.v);
    const duzy = Object.assign(zapis([60, 66, 72]), { notatkaTestowa: 'Testowy opis '.repeat(5000) });
    await A.v.savePatient(duzy, { patientId: Q, dedup: false });
    await A.v.mergePatients(P, Q);
    const zQ = await A.v.buildPatientDelta(Q);
    expect(zQ.data.length, 'delta karty Q ponad limit (integracja jej nie wysyła)').toBeGreaterThan(6e4);
    const tP = (await A.baza.listTombstonesForUser(A.uid)).find((t) => t.patientId === P);
    const zP = await A.v.buildTombstoneDelta(P, tP.deletedAtISO);
    expect(zP.data.length).toBeLessThanOrEqual(6e4);
    expect((await odszyfruj(zP)).patients).toEqual([]);
    // Karta docelowa, której delta mieści się w limicie, a razem z nagrobkiem już nie: delta nagrobka i tak niesie kartę
    // (to samo kryterium co dla delty karty w integracji — nie ma okna „delta Y poszła, a nagrobek bez karty Y”).
    const R = await karta(A.v), S = await karta(A.v);
    await A.v.mergePatients(R, S);
    const glowaS = (await A.v.getPatient(S)).snapshots[0].snapshotId;
    let dlugosc = 40000, rozmiar = 0;
    for (let i = 0; i < 8; i += 1) {
      await A.v.updateSnapshotPayload(S, glowaS, Object.assign(zapis([60, 66, 72]), { notatkaTestowa: 'x'.repeat(dlugosc) }), { preserveSavedAt: true });
      rozmiar = (await A.v.buildPatientDelta(S)).data.length;
      if (rozmiar <= 6e4 && rozmiar > 6e4 - 40) break;
      dlugosc += Math.floor((6e4 - 20 - rozmiar) * 3 / 4);
    }
    expect(rozmiar, 'delta karty S tuż pod limitem').toBeGreaterThan(6e4 - 40);
    expect(rozmiar).toBeLessThanOrEqual(6e4);
    const tR = (await A.baza.listTombstonesForUser(A.uid)).find((t) => t.patientId === R);
    const zR = await A.v.buildTombstoneDelta(R, tR.deletedAtISO);
    expect(zR.data.length, 'z nagrobkiem ponad 60 000 znaków').toBeGreaterThan(6e4);
    expect(zR.data.length, 'poniżej limitu sygnału 64 KiB').toBeLessThan(65536 - 1000);
    expect((await odszyfruj(zR)).patients.map((q) => q.patientId)).toEqual([S]);
  }, CZAS);
});

describe('P-SYNC-WLASCICIEL — trzy urządzenia przez chmurę', () => {
  /* Uwaga recenzenta do 4270ca1 (waga średnia). Trzy urządzenia po pełnej synchronizacji; A scala X → Y, B poprawia x1
     w X z nową chwilą zapisu karty (preserveSavedAt: false), C nic nie robi. Synchronizacja przez chmurę w stałej
     kolejce, 4 rundy. Dotąd C przyjmowało poprawkę x1 jako zmianę wersji bez podniesienia chwili zapisu karty X i
     odsyłało X z chwilą sprzed nagrobka scalenia; A pomijało ją (nagrobek wygrywał) i nigdy nie dostawało ani poprawki,
     ani X. [CZERWONY na 4270ca1] w kolejkach, w których C synchronizuje się tuż przed A (ABC, BCA, CAB): A — Y 5/5
     z x1 = 60:120 i nagrobek X; B i C — X 1/1 [x1] = 61:120,5 i Y 4/4, trwale. [CZERWONY na audyt] B i C — pusta X 2/0.
     Teraz przyjęta z ładunku poprawka wersji podnosi chwilę zapisu karty do późniejszej z dwóch (Bsw_bezNowych). */
  const KOLEJKI = ['ABC', 'ACB', 'BAC', 'BCA', 'CAB', 'CBA'];
  async function trzy(akcja, kolejka, kolejnosc, rundy = 4) {
    const A = await urzadzenie('A'), B = await urzadzenie('B'), C = await urzadzenie('C');
    const X = await karta(A.v);
    await chwila(4);
    const Y = await kartaWzgledem(A, X, kolejnosc === 'X<Y');
    const sync = chmura();
    await sync(A); await sync(B); await sync(C);
    const et = await etykiety(A, { X, Y });
    const ctx = { A, B, X, Y, et, karty: { X, Y } };
    await akcja(ctx);
    const U = { A, B, C };
    for (let r = 0; r < rundy; r += 1) for (const n of kolejka) await sync(U[n]);
    const stany = {};
    for (const n of 'ABC') stany[n] = await stan(U[n], et);
    return { ...ctx, C, U, stany };
  }
  function oczekujNaTrzech(stany, karty, nagrobki = []) {
    for (const n of 'ABC') {
      expect(stany[n].karty, `urządzenie ${n}`).toEqual(karty);
      expect(stany[n].nagrobki, `nagrobki ${n}`).toEqual(nagrobki);
      expect(stany[n].sieroty, `wersje bez karty ${n}`).toBe(0);
    }
  }

  it.each(KOLEJKI.flatMap((k) => KOLEJNOSCI.map((id) => [k, id])))('poprawka x1 w X bez nowego zapisu, kolejka %s (%s): wszędzie X [x1] 61:120,5 i Y [x2 y1 y2 ym]', async (kolejka, kolejnosc) => {
    const r = await trzy(AKCJE.korektaBezZapisu, kolejka, kolejnosc);
    oczekujNaTrzech(r.stany, { X: karta2(1, ['x1']), Y: karta2(4, ['x2', 'y1', 'y2', 'ym']) });
    const x1 = idPo(r.et, 'x1');
    for (const n of 'ABC') expect(await trescWersji(r.U[n], r.X, x1), `x1 na ${n}`).toBe('61:120.5');
  }, 60_000);

  // [ZIELONY na 4270ca1 (pomiar recenzenta); CZERWONY na audyt] pozostałe scenariusze w kolejkach z C tuż przed A —
  // te same wyniki co przy dwóch urządzeniach. dwiePoprawki: [CZERWONY na dd21d11 — x1 = 62:121 na A, B i C] późniejsza
  // poprawka (61) na wszystkich trzech.
  const INNE = {
    XdoY: { karty: { X: karta2(1, ['x3']), Y: karta2(5, ['x1', 'x2', 'y1', 'y2', 'ym']) }, nagrobki: [] },
    korekta: { karty: { Y: karta2(5, ['x1', 'x2', 'y1', 'y2', 'ym']) }, nagrobki: ['X'], x1: ['Y', '61:120.5'] },
    korektaEdycja: { karty: { X: karta2(2, ['x1', 'x3']), Y: karta2(4, ['x2', 'y1', 'y2', 'ym']) }, nagrobki: [], x1: ['X', '61:120.5'] },
    dwiePoprawki: { karty: { Y: karta2(5, ['x1', 'x2', 'y1', 'y2', 'ym']) }, nagrobki: ['X'], x1: ['Y', '61:120.5'] },
  };
  it.each(Object.keys(INNE).flatMap((s) => ['CAB', 'BCA'].flatMap((k) => KOLEJNOSCI.map((id) => [s, k, id]))))('%s, kolejka %s (%s): zbieżnie na trzech', async (scen, kolejka, kolejnosc) => {
    const r = await trzy(AKCJE[scen], kolejka, kolejnosc);
    oczekujNaTrzech(r.stany, INNE[scen].karty, INNE[scen].nagrobki);
    if (INNE[scen].x1) {
      const [gdzie, tresc] = INNE[scen].x1;
      for (const n of 'ABC') expect(await trescWersji(r.U[n], r[gdzie], idPo(r.et, 'x1')), `x1 na ${n}`).toBe(tresc);
    }
  }, 60_000);
});

describe('P-SYNC-WLASCICIEL — wynik scalania i odświeżenie listy pacjentów (prawdziwy vilda_sync_integration.js)', () => {
  /* Uwaga recenzenta do 4270ca1 (waga niska). Faza przeniesień usuwa pustą kartę albo zakłada brakującą, a wynik
     scalania tego nie liczył. Integracja (applyDelta) odświeża listę pacjentów (vilda:sync-merged) tylko przy
     addedPatientCount albo deletedPatientCount (oraz licznikach notatek), więc po „Scal pacjentów” na innym urządzeniu
     lista na B dalej pokazywała nieistniejącą kartę X, a karta X założona w fazie przeniesień nie pojawiała się.
     [CZERWONY na 4270ca1 — kolejność „Y, potem nagrobek X” (X znika już po delcie Y, 0 zdarzeń) i założenie X (0
     zdarzeń, addedPatientCount 0)] [ZIELONY na audyt — tam X znikała dopiero z deltą nagrobka (deletedPatientCount 1),
     a X powstawała w pętli pacjentów (addedPatientCount 1)]. */
  function oknoIntegracji(vault) {
    const zdarzenia = [];
    class CustomEvent { constructor(type, init) { this.type = type; this.detail = init ? init.detail : undefined; } }
    let ostatnie = null;
    // Ta sama funkcja sejfu; zapamiętujemy jej obietnicę, żeby poczekać na koniec scalania przed liczeniem zdarzeń.
    const sejf = Object.assign(Object.create(vault), { applyEncryptedDelta: (z) => (ostatnie = vault.applyEncryptedDelta(z)) });
    const win = {
      CustomEvent, localStorage: magazyn(), sessionStorage: magazyn(), navigator: { sendBeacon: () => true },
      setTimeout: (...a) => setTimeout(...a), clearTimeout: (...a) => clearTimeout(...a), setInterval: () => 0, clearInterval: () => {},
      addEventListener() {}, removeEventListener() {},
      document: { addEventListener() {}, removeEventListener() {}, dispatchEvent(ev) { zdarzenia.push(ev.type); return true; }, hidden: false },
      VildaVault: sejf,
      VildaSync: { syncPush: () => Promise.resolve(), syncPull: () => Promise.resolve(), onSyncStart() {}, onSyncComplete() {}, onSyncError() {} },
    };
    win.window = win; win.self = win; win.top = win;
    loadBrowserScript('vilda_sync_integration.js', win);
    return {
      odswiezenia: () => zdarzenia.filter((t) => t === 'vilda:sync-merged').length,
      async zastosuj(z) {
        win.VildaSyncIntegration.applyDelta(z);
        const wynik = await ostatnie;
        await chwila(5);
        return wynik;
      },
    };
  }
  const listaKart = async (d, nazwy) => (await d.baza.listPatientsForUser(d.uid)).map((k) => nazwy[k.patientId] || '?').sort();

  it.each(KOLEJNOSCI.flatMap((id) => ['Y, potem nagrobek X', 'nagrobek X, potem Y'].map((k) => [k, id])))('„Scal pacjentów” X → Y na A, delty na B (%s, %s): każda zmiana listy kart odświeża listę', async (kolejnoscDelt, kolejnoscId) => {
    const A = await urzadzenie('A'), B = await urzadzenie('B');
    const X = await karta(A.v);
    await chwila(4);
    const Y = await kartaWzgledem(A, X, kolejnoscId === 'X<Y');
    const sync = chmura();
    await sync(A); await sync(B);
    await chwila(5);
    await A.v.mergePatients(X, Y);
    const [pY, pX] = await delty(A, [Y]);
    const okno = oknoIntegracji(B.v);
    const nazwy = { [X]: 'X', [Y]: 'Y' };
    const delta = { Y: await B.v.encryptPayloadForCurrentUser(pY), X: await B.v.encryptPayloadForCurrentUser(pX) };
    let usuniete = 0;
    for (const k of kolejnoscDelt.startsWith('Y') ? ['Y', 'X'] : ['X', 'Y']) {
      const przed = await listaKart(B, nazwy), zdarzenPrzed = okno.odswiezenia();
      const wynik = await okno.zastosuj(delta[k]);
      usuniete += wynik.deletedPatientCount;
      const po = await listaKart(B, nazwy);
      if (JSON.stringify(po) !== JSON.stringify(przed)) {
        expect(okno.odswiezenia(), `delta ${k} zmieniła listę kart ${przed} → ${po}`).toBeGreaterThan(zdarzenPrzed);
      }
    }
    expect(await listaKart(B, nazwy)).toEqual(['Y']);
    expect(usuniete, 'karta X policzona jako usunięta').toBe(1);
    expect(okno.odswiezenia()).toBeGreaterThanOrEqual(1);
  }, CZAS);

  it.each(KOLEJNOSCI)('poprawka x1 w starej X na B, delta X na A (%s): X założona w fazie przeniesień liczy się jako dodana i odświeża listę', async (kolejnoscId) => {
    const A = await urzadzenie('A'), B = await urzadzenie('B');
    const X = await karta(A.v);
    await chwila(4);
    const Y = await kartaWzgledem(A, X, kolejnoscId === 'X<Y');
    const sync = chmura();
    await sync(A); await sync(B);
    const et = await etykiety(A, { X, Y });
    await chwila(5);
    await A.v.mergePatients(X, Y);
    await chwila(5);
    await B.v.updateSnapshotPayload(X, idPo(et, 'x1'), zapis([61]), { preserveSavedAt: false });
    const [pX] = await delty(B, [X]);
    const okno = oknoIntegracji(A.v);
    const wynik = await okno.zastosuj(await A.v.encryptPayloadForCurrentUser(pX));
    expect(await listaKart(A, { [X]: 'X', [Y]: 'Y' })).toEqual(['X', 'Y']);
    expect(wynik.addedPatientCount).toBe(1);
    expect(okno.odswiezenia()).toBe(1);
  }, CZAS);
});

describe('P-SYNC-WLASCICIEL — faza przeniesień: chwila zapisu i nagrobek karty docelowej', () => {
  // [ZIELONY na audyt (Y nie traciła chwili zapisu); mutant K1 recenzenta (chwila zapisu F z samego ładunku) — B traci Y
  // z 6 wersjami] A scala X → Y, C usuwa Y, B zapisuje yB w Y później niż to usunięcie. B dostaje deltę Y z A (faza
  // przeniesień przenosi x1 i x2 pod Y), potem nagrobek Y z C. Faza przeniesień nie może cofnąć chwili zapisu Y do
  // chwili z ładunku: zapis yB jest późniejszy niż usunięcie na C, więc Y zostaje ze wszystkimi wersjami.
  it.each(KOLEJNOSCI)('nagrobek Y z trzeciego urządzenia po fazie przeniesień, późniejszy zapis Y na B (%s): Y zostaje 6/6', async (kolejnoscId) => {
    const A = await urzadzenie('A'), B = await urzadzenie('B'), C = await urzadzenie('C');
    const X = await karta(A.v);
    await chwila(4);
    const Y = await kartaWzgledem(A, X, kolejnoscId === 'X<Y');
    const sync = chmura();
    await sync(A); await sync(B); await sync(C);
    const et = await etykiety(A, { X, Y });
    await chwila(5);
    et[(await A.v.mergePatients(X, Y)).snapshotId] = 'ym';
    const [dY] = await delty(A, [Y]);
    await chwila(5);
    await C.v.removePatient(Y);
    const tY = (await delty(C, [])).find((d) => d.tombstones.some((t) => t.patientId === Y));
    await chwila(5);
    et[(await zapiszWersje(B, Y, [60, 66, 78])).snapshotId] = 'yB';
    const zapisYPrzed = (await B.baza.getPatientForUser(B.uid, Y)).lastSavedAtISO;
    await B.v.mergeSyncPayload(kopia(dY));
    expect((await B.baza.getPatientForUser(B.uid, Y)).lastSavedAtISO, 'chwila zapisu Y bez cofnięcia').toBe(zapisYPrzed);
    await B.v.mergeSyncPayload(kopia(tY));
    const s = await stan(B, et);
    expect(s.karty.Y).toEqual(karta2(6, ['x1', 'x2', 'y1', 'y2', 'yB', 'ym']));
    expect(s.nagrobki).not.toContain('Y');
  }, CZAS);

  // [CZERWONY na audyt — bez fazy przeniesień: x1 i x2 przechodziły pod X od razu, X powstawała; mutant K2 recenzenta
  // (bez sprawdzenia nagrobka F w fazie) — X powstaje od nowa mimo nowszego nagrobka] A scaliło X → Y; B poprawia x1 w X z nową chwilą zapisu.
  // Delta X z B: x1 czeka na fazę przeniesień (X tu nie ma, jej nagrobek przegrywa z zapisem z ładunku). Zanim faza
  // przeczyta stan (w realnym przebiegu: zanim weźmie blokady — np. delta nagrobka X z czwartego urządzenia w innej
  // karcie przeglądarki), zapisuje się tu nagrobek X późniejszy niż zapis z ładunku. Faza nie zakłada wtedy X od nowa,
  // x1 zostaje pod Y.
  it.each(KOLEJNOSCI)('nagrobek karty F zapisany między decyzją a fazą przeniesień (%s): F nie powstaje, wersja zostaje pod G', async (kolejnoscId) => {
    const A = await urzadzenie('A'), B = await urzadzenie('B');
    const X = await karta(A.v);
    await chwila(4);
    const Y = await kartaWzgledem(A, X, kolejnoscId === 'X<Y');
    await B.v.mergeSyncPayload(kopia(await A.v.exportSyncPayload()));
    const et = await etykiety(A, { X, Y });
    const x1 = idPo(et, 'x1');
    await chwila(5);
    await A.v.mergePatients(X, Y);
    await chwila(5);
    await B.v.updateSnapshotPayload(X, x1, zapis([61]), { preserveSavedAt: false });
    const [dX] = await delty(B, [X]);
    // Pierwszy odczyt wersji karty Y w tym scalaniu to świeży odczyt fazy przeniesień (delta niesie tylko X).
    const p = A.pulapka('listSnapshotsForUser', (uid, pid) => pid === Y);
    const scalanie = A.v.mergeSyncPayload(dX);
    const krok = await Promise.race([p.osiagnieta.then(() => 'faza przeniesień'), scalanie.then(() => 'koniec scalania')]);
    await chwila(5);
    const pozniej = new Date().toISOString();
    expect(pozniej > dX.patients[0].lastSavedAtISO).toBe(true);
    await A.baza.putTombstoneForUser(A.uid, { patientId: X, deletedAtISO: pozniej });
    p.zwolnij();
    const wynik = await scalanie;
    expect(await A.baza.getPatientForUser(A.uid, X), 'X nie powstaje od nowa').toBeFalsy();
    expect(await A.baza.listSnapshotsForUser(A.uid, X)).toEqual([]);
    const wY = (await A.baza.listSnapshotsForUser(A.uid, Y)).map((s) => s.snapshotId);
    expect(wY).toContain(x1);
    expect(wY).toHaveLength(5);
    expect((await A.baza.getPatientForUser(A.uid, Y)).snapshotCount).toBe(5);
    expect((await A.baza.listTombstonesForUser(A.uid)).filter((t) => t.patientId === X).map((t) => t.deletedAtISO)).toEqual([pozniej]);
    expect(wynik.addedPatientCount).toBe(0);
    expect(krok, 'x1 czekała na fazę przeniesień').toBe('faza przeniesień');
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

describe('P-SYNC-WLASCICIEL — łańcuch „Scal pacjentów” a późniejsza zmiana wersji w starej karcie', () => {
  /* Uwagi recenzentów do dd21d11 (dwie, waga wysoka). A: „Scal pacjentów” X → Y, potem Y → Z (łańcuch duplikatów).
     B nie wie o scaleniach i zmienia x1 w X: korekta z zachowaną chwilą zapisu, korekta z nową chwilą zapisu albo
     przypięcie (rev 1, późniejsza chwila zmiany). Każde „Scal pacjentów” podbija rev bez zmiany treści, więc na dd21d11
     x1 pod Z miała rev 2 i wygrywała regułą „najpierw rev”: zmiana z B przepadała na obu urządzeniach, choć urządzenie
     scalające niczego w x1 nie zmieniało. Treść wersji wspólnej dwom kartom wybiera teraz późniejsza chwila zmiany
     (Bsw_nowszaTresc) — scalenie jej nie rusza; rev wyniku = wyższa z dwóch (Bsw_rekord). Karta, pod którą kończy x1,
     bez zmian (nowszy rekord: po dwóch scaleniach Z; po jednym — Y, a przy nowej chwili zapisu X wraca z x1).
     Pomiar na dd21d11: dwa scalenia — 9 z 9 czerwonych (x1 = 60:120 bez przypięcia na obu), jedno scalenie — 9 z 9
     zielonych (kontrola). Na audyt 2df41a8: dwa scalenia — 8 z 9 czerwonych (zielony: korekta z nową chwilą zapisu,
     chmura-BA — regres dd21d11), jedno — 8 z 9 czerwonych. */
  const ZMIANY = {
    'korekta z zachowaną chwilą zapisu': { zrob: (B, X, s) => B.v.updateSnapshotPayload(X, s, zapis([61]), { preserveSavedAt: true }), tresc: '61:120.5' },
    'korekta z nową chwilą zapisu': { zrob: (B, X, s) => B.v.updateSnapshotPayload(X, s, zapis([61]), { preserveSavedAt: false }), tresc: '61:120.5' },
    'przypięcie': { zrob: (B, X, s) => B.v.setSnapshotPinned(X, s, true), tresc: '60:120 przypięta' },
  };
  // Treść wersji (pomiary i przypięcie) i karta, pod którą leży — albo null.
  async function wersjaNa(d, snapshotId, et) {
    for (const k of await d.baza.listPatientsForUser(d.uid)) {
      const p = await d.v.getPatient(k.patientId);
      const s = p && p.snapshots.find((q) => q.snapshotId === snapshotId);
      if (s) return { karta: et[k.patientId], tresc: `${pomiaryZ(s.payload)}${s.payload && s.payload._pinned ? ' przypięta' : ''}` };
    }
    return null;
  }
  async function trzyKarty(urz) {
    const [A] = urz;
    const X = await karta(A.v); await chwila(4);
    const Y = await karta(A.v); await chwila(4);
    const Z = await karta(A.v);
    const sync = chmura();
    for (const d of urz) await sync(d);
    const et = await etykiety(A, { X, Y, Z });
    return { X, Y, Z, sync, et, x1: idPo(et, 'x1') };
  }
  async function rundy(model, A, B, sync, n = 4) {
    for (let i = 0; i < n; i += 1) {
      if (model === 'krzyzowa') {
        const pa = kopia(await A.v.exportSyncPayload()), pb = kopia(await B.v.exportSyncPayload());
        await A.v.mergeSyncPayload(pb);
        await B.v.mergeSyncPayload(pa);
      } else {
        const [p, q] = model === 'chmura-BA' ? [B, A] : [A, B];
        await sync(p); await sync(q);
      }
    }
  }
  // Wersje widziane na starcie, których na końcu nie ma na urządzeniu (ani w karcie, ani w koszu), i liczniki niezgodne
  // z liczbą wersji.
  async function bezStrat(d, et, wersje) {
    const s = await stan(d, et);
    expect(wersje.filter((w) => !(w in s.wlasciciel) && !s.kosz.includes(w)), `utracone na ${d.nazwa}`).toEqual([]);
    expect(Object.entries(s.karty).filter(([, c]) => c.licznik !== c.wersje.length), `liczniki na ${d.nazwa}`).toEqual([]);
    expect(s.sieroty).toBe(0);
    return s;
  }
  const WSZYSTKIE = ['x1', 'x2', 'y1', 'y2', 'z1', 'z2'];

  const PRZYPADKI_LANCUCHA = [2, 1].flatMap((n) => Object.keys(ZMIANY).flatMap((z) => ['chmura-AB', 'chmura-BA', 'krzyzowa'].map((m) => [n, z, m])));
  it.each(PRZYPADKI_LANCUCHA)('%i × „Scal pacjentów”, potem %s x1 w X na B (%s): zmiana z B na obu, ta sama karta, nic nie ginie', async (scalen, zmiana, model) => {
    const A = await urzadzenie('A'), B = await urzadzenie('B');
    const { X, Y, Z, sync, et, x1 } = await trzyKarty([A, B]);
    await chwila(5);
    et[(await A.v.mergePatients(X, Y)).snapshotId] = 'ym';
    if (scalen === 2) { await chwila(5); et[(await A.v.mergePatients(Y, Z)).snapshotId] = 'zm'; }
    await chwila(5);
    await ZMIANY[zmiana].zrob(B, X, x1);
    await rundy(model, A, B, sync);
    const naA = await wersjaNa(A, x1, et), naB = await wersjaNa(B, x1, et);
    const cel = scalen === 2 ? 'Z' : (zmiana === 'korekta z nową chwilą zapisu' ? 'X' : 'Y');
    expect(naA, 'x1 na A').toEqual({ karta: cel, tresc: ZMIANY[zmiana].tresc });
    expect(naB, 'x1 na B').toEqual({ karta: cel, tresc: ZMIANY[zmiana].tresc });
    const wersje = [...WSZYSTKIE, 'ym', ...(scalen === 2 ? ['zm'] : [])];
    const sA = await bezStrat(A, et, wersje), sB = await bezStrat(B, et, wersje);
    expect(zgodne(sA, sB), 'A = B').toBe(true);
    // Bieżąca wersja karty scalonej = głowa ostatniego scalenia [CZERWONY na 69e41d1 przy korekcie z nową chwilą zapisu
    // po dwóch scaleniach: bieżąca wersja Z = x1 „61:120.5”; uwaga przeglądu końcowego do 69e41d1].
    const [kartaScalona, glowa] = scalen === 2 ? [Z, 'zm'] : [Y, 'ym'];
    for (const d of [A, B]) {
      expect((await d.v.getLatestSnapshot(kartaScalona)).snapshotId, `bieżąca wersja karty scalonej na ${d.nazwa}`).toBe(idPo(et, glowa));
    }
  }, CZAS);

  // [CZERWONY na dd21d11 i na audyt — x1 = 60:120 na A, B i C; na 69e41d1 przy preserveSavedAt: false — bieżąca wersja
  // Z = x1] Scalenia na dwóch różnych urządzeniach: A scala X → Y, C (po synchronizacji) scala Y → Z, B offline poprawia
  // x1 w X. Synchronizacja przez chmurę w kolejce C, B, A.
  it.each([true, false])('X → Y na A, Y → Z na C, poprawka x1 w X na B (preserveSavedAt: %s): 61 na A, B i C', async (zachowaj) => {
    const A = await urzadzenie('A'), B = await urzadzenie('B'), C = await urzadzenie('C');
    const { X, Y, Z, sync, et, x1 } = await trzyKarty([A, B, C]);
    await chwila(5);
    et[(await A.v.mergePatients(X, Y)).snapshotId] = 'ym';
    await chwila(5);
    await sync(A); await sync(C);
    await chwila(5);
    et[(await C.v.mergePatients(Y, Z)).snapshotId] = 'zm';
    await chwila(5);
    await B.v.updateSnapshotPayload(X, x1, zapis([61]), { preserveSavedAt: zachowaj });
    for (let i = 0; i < 4; i += 1) { await sync(C); await sync(B); await sync(A); }
    const stany = [];
    for (const d of [A, B, C]) {
      expect(await wersjaNa(d, x1, et), `x1 na ${d.nazwa}`).toEqual({ karta: 'Z', tresc: '61:120.5' });
      expect((await d.v.getLatestSnapshot(Z)).snapshotId, `bieżąca wersja Z na ${d.nazwa}`).toBe(idPo(et, 'zm'));
      stany.push(await bezStrat(d, et, [...WSZYSTKIE, 'ym', 'zm']));
    }
    expect(zgodne(stany[0], stany[1]) && zgodne(stany[1], stany[2]), 'A = B = C').toBe(true);
  }, CZAS);

  // [CZERWONY na dd21d11 i na audyt — 62:121 na obu] A poprawia x1 (62) PRZED „Scal pacjentów” X → Y (rev 1, potem 2),
  // B — nie wiedząc o niczym — poprawia x1 w X później (61, rev 1). Dwie współbieżne poprawki: wygrywa późniejsza, jak
  // bez scalenia (ta sama karta: rev 1 i rev 1, późniejsza chwila zmiany). Do akceptacji właściciela.
  it.each(['chmura-AB', 'chmura-BA', 'krzyzowa'])('poprawka na A przed scaleniem, późniejsza poprawka na B (%s): 61 na obu', async (model) => {
    const A = await urzadzenie('A'), B = await urzadzenie('B');
    const { X, Y, sync, et, x1 } = await trzyKarty([A, B]);
    await chwila(5);
    await A.v.updateSnapshotPayload(X, x1, zapis([62]), { preserveSavedAt: true });
    await chwila(5);
    et[(await A.v.mergePatients(X, Y)).snapshotId] = 'ym';
    await chwila(5);
    await B.v.updateSnapshotPayload(X, x1, zapis([61]), { preserveSavedAt: true });
    await rundy(model, A, B, sync);
    for (const d of [A, B]) {
      expect(await wersjaNa(d, x1, et), `x1 na ${d.nazwa}`).toEqual({ karta: 'Y', tresc: '61:120.5' });
      expect((await d.v.getLatestSnapshot(Y)).snapshotId, `bieżąca wersja Y na ${d.nazwa}`).toBe(idPo(et, 'ym'));
    }
  }, CZAS);

  // [CZERWONY na dd21d11 i na audyt — A: x1 = 60:120] Decyzja 'tresc': tutejszy rekord x1 (pod Z, rev 2) jest nowszy, więc
  // x1 zostaje pod Z, ale treść z ładunku (poprawka z B, późniejsza) przechodzi od razu — przy jednym scaleniu ładunku B,
  // także gdy B już się nie zsynchronizuje (dotąd poprawka czekała na pełną synchronizację B z nowym stanem A, a do
  // tego czasu wysyłka A zastępowała ją w chmurze). Karta X na A nie powstaje (nagrobek zostaje), liczniki zgodne.
  // Chwila zapisu x1 pod Z bez zmian, bieżąca wersja Z = zm [CZERWONY na 69e41d1: x1 dostawała chwilę zapisu poprawki
  // B i stawała się bieżącą wersją Z; uwaga przeglądu końcowego do 69e41d1].
  it('poprawka x1 w X z nową chwilą zapisu po dwóch scaleniach: jedno scalenie ładunku B przenosi treść do x1 pod Z', async () => {
    const A = await urzadzenie('A'), B = await urzadzenie('B');
    const { X, Y, Z, et, x1 } = await trzyKarty([A, B]);
    await chwila(5);
    await A.v.mergePatients(X, Y);
    await chwila(5);
    const zm = (await A.v.mergePatients(Y, Z)).snapshotId;
    await chwila(5);
    await B.v.updateSnapshotPayload(X, x1, zapis([61]), { preserveSavedAt: false });
    const przed = (await A.baza.listSnapshotsForUser(A.uid, Z)).find((s) => s.snapshotId === x1);
    const wynik = await A.v.mergeSyncPayload(kopia(await B.v.exportSyncPayload()));
    const po = (await A.baza.listSnapshotsForUser(A.uid, Z)).find((s) => s.snapshotId === x1);
    expect(await wersjaNa(A, x1, et)).toEqual({ karta: 'Z', tresc: '61:120.5' });
    expect(po.rev, 'rev bez zmian (wyższa z dwóch)').toBe(przed.rev);
    expect(po.updatedAtISO > przed.updatedAtISO, 'chwila zmiany poprawki').toBe(true);
    expect(po.savedAtISO, 'chwila zapisu (miejsce w historii Z) bez zmian').toBe(przed.savedAtISO);
    expect((await A.v.getLatestSnapshot(Z)).snapshotId, 'bieżąca wersja Z').toBe(zm);
    expect(await A.baza.getPatientForUser(A.uid, X), 'X nie wraca').toBeFalsy();
    expect((await A.baza.listTombstonesForUser(A.uid)).map((t) => t.patientId)).toContain(X);
    expect((await A.baza.getPatientForUser(A.uid, Z)).snapshotCount).toBe((await A.baza.listSnapshotsForUser(A.uid, Z)).length);
    expect(wynik.addedPatientCount).toBe(0);
  }, CZAS);

  // [CZERWONY na dd21d11 i na audyt — decyzji 'tresc' nie było (x1 = 60:120); mutant „Bsw_poprawTresc bez obu
  // zabezpieczeń świeżego odczytu” (bez warunku „treść z ładunku nadal późniejsza” i bez Bsw_rekord na świeżym
  // rekordzie) — czerwony] Decyzja 'tresc' zapada pod blokadą karty z ładunku; zanim faza przeniesień przeczyta x1 pod
  // Z (w realnym przebiegu: zanim weźmie blokady — np. poprawka x1 pod Z w innej karcie przeglądarki), zapisuje się tu
  // nowsza zmiana x1 (pułapka magazynu, zapis wprost: rev 3, późniejsza chwila zmiany). Faza na świeżym odczycie widzi
  // późniejszą treść tutejszą (Bsw_nowszaTresc) i nie nadpisuje jej treścią z ładunku.
  it('decyzja „treść” a zmiana x1 pod Z między decyzją a fazą przeniesień: nowsza zmiana zostaje', async () => {
    const A = await urzadzenie('A'), B = await urzadzenie('B');
    const { X, Y, Z, et, x1 } = await trzyKarty([A, B]);
    await chwila(5);
    await A.v.mergePatients(X, Y);
    await chwila(5);
    await A.v.mergePatients(Y, Z);
    await chwila(5);
    await B.v.updateSnapshotPayload(X, x1, zapis([61]), { preserveSavedAt: false });
    const [dX] = await delty(B, [X]);
    // Pierwszy odczyt wersji karty Z w tym scalaniu to świeży odczyt fazy przeniesień (delta niesie tylko X).
    const p = A.pulapka('listSnapshotsForUser', (uid, pid) => pid === Z);
    const scalanie = A.v.mergeSyncPayload(dX);
    const krok = await Promise.race([p.osiagnieta.then(() => 'faza przeniesień'), scalanie.then(() => 'koniec scalania')]);
    await chwila(5);
    const wersjeZ = await A.baza.listSnapshotsForUser(A.uid, Z);
    const w1 = wersjeZ.find((s) => s.snapshotId === x1), w2 = wersjeZ.find((s) => s.snapshotId === idPo(et, 'x2'));
    // „Nowsza zmiana” x1: treść x2 (60, 66), rev 3, chwila zmiany = teraz (później niż poprawka z B).
    await A.baza.putSnapshotForUser(A.uid, Object.assign({}, w1, { payloadCipher: w2.payloadCipher, rev: 3, updatedAtISO: new Date().toISOString() }));
    p.zwolnij();
    await scalanie;
    expect(krok, 'x1 czekała na fazę przeniesień').toBe('faza przeniesień');
    expect(await wersjaNa(A, x1, et)).toEqual({ karta: 'Z', tresc: '60:120,66:123' });
    expect((await A.baza.listSnapshotsForUser(A.uid, Z)).find((s) => s.snapshotId === x1).rev).toBe(3);
  }, CZAS);

  /* Uwaga przeglądu końcowego do 69e41d1 (waga wysoka): bieżąca wersja karty scalonej. Trzy duplikaty „Testowy Jan”:
     X [60, 66], Y [72, 78], Z [84, 90]; A: „Scal pacjentów” X → Y, potem Y → Z — głowa Z (zm) ma 6 pomiarów. B nie wie
     o scaleniach i w oknie „Edytuj pomiar” poprawia bieżący pomiar X (66 mies.: 123 → 124 cm); dla głowy karty okno
     woła updateSnapshotPayload z preserveSavedAt: false (vilda_auth_ui.js), więc chwila zapisu x2 = teraz. Rekord x2
     pod Z jest nowszy (rev 2), więc x2 zostaje pod Z, a treść bierze późniejszą zmianę (B). Na 69e41d1 x2 brała też
     chwilę zapisu poprawki — późniejszą niż zm — i stawała się bieżącą wersją Z na obu urządzeniach: lekarz widział
     stan sprzed scalenia jednego duplikatu (bez pomiarów 72–90 mies.), a kolejny zapis formularza budowałby się na nim.
     Chwila zapisu wersji (miejsce w historii karty) pochodzi teraz ze strony, która wygrała przypisanie karty (Z).
     [CZERWONY na 69e41d1 — 3/3: bieżąca wersja Z = x2 „60:120,66:124”; CZERWONY na dd21d11 — 3/3: bieżąca wersja zm,
     ale poprawka B ginie (x2 = 60:120,66:123); CZERWONY na audyt 2df41a8 — 3/3: poprawka ginie (chmura-AB, krzyżowa)
     albo x2 wraca pod X (chmura-BA)] */
  async function kartaPomiary(d, a, b) {
    const p = await d.v.savePatient(zapis([a]), { dedup: false });
    await chwila(4);
    const q = await d.v.savePatient(zapis([a, b]), { patientId: p.patientId, dedup: false });
    await chwila(4);
    return { id: p.patientId, w2: q.snapshotId };
  }
  // Trzy (albo dwie) karty na A z różnymi pomiarami, synchronizacja z B, „Scal pacjentów” na A, potem B poprawia bieżący
  // pomiar X tak jak okno „Edytuj pomiar” (nowa chwila zapisu głowy). Zwraca karty, etykiety i chwilę zapisu x2 przed
  // scaleniami.
  async function edycjaGlowyPoScaleniach(scalen) {
    const A = await urzadzenie('A'), B = await urzadzenie('B');
    const x = await kartaPomiary(A, 60, 66), y = await kartaPomiary(A, 72, 78);
    const z = scalen === 2 ? await kartaPomiary(A, 84, 90) : null;
    const sync = chmura(); await sync(A); await sync(B);
    const et = await etykiety(A, Object.assign({ X: x.id, Y: y.id }, z ? { Z: z.id } : {}));
    const zapisX2 = (await A.baza.listSnapshotsForUser(A.uid, x.id)).find((q) => q.snapshotId === x.w2).savedAtISO;
    await chwila(5);
    et[(await A.v.mergePatients(x.id, y.id)).snapshotId] = 'ym';
    if (z) { await chwila(5); et[(await A.v.mergePatients(y.id, z.id)).snapshotId] = 'zm'; }
    const cel = z ? z.id : y.id;
    const glowa = await A.v.getLatestSnapshot(cel);
    await chwila(5);
    const glowaX = await B.v.getLatestSnapshot(x.id);
    expect(glowaX.snapshotId).toBe(x.w2);
    const nowy = JSON.parse(JSON.stringify(glowaX.payload));
    nowy.advanced.data.measurements[1].height = 124; // 66 mies.: 123 → 124 cm
    await B.v.updateSnapshotPayload(x.id, x.w2, nowy, { preserveSavedAt: false });
    return { A, B, sync, et, x, cel, glowa, zapisX2 };
  }

  it.each(['chmura-AB', 'chmura-BA', 'krzyzowa'])('X → Y → Z na A, B poprawia bieżący pomiar X z nową chwilą zapisu (%s): bieżąca wersja Z = głowa scalenia z 6 pomiarami, x2 pod Z z poprawką i dawnym miejscem w historii', async (model) => {
    const { A, B, sync, et, x, cel, glowa, zapisX2 } = await edycjaGlowyPoScaleniach(2);
    expect(pomiaryZ(glowa.payload)).toBe('60:120,66:123,72:126,78:129,84:132,90:135');
    await rundy(model, A, B, sync);
    const stany = [];
    for (const d of [A, B]) {
      const g = await d.v.getLatestSnapshot(cel);
      expect(g.snapshotId, `bieżąca wersja Z na ${d.nazwa}`).toBe(glowa.snapshotId);
      expect(pomiaryZ(g.payload), `bieżące pomiary Z na ${d.nazwa}`).toBe(pomiaryZ(glowa.payload));
      expect((await d.v.getPatient(cel)).snapshots[0].snapshotId).toBe(glowa.snapshotId);
      expect(await wersjaNa(d, x.w2, et), `x2 na ${d.nazwa}`).toEqual({ karta: 'Z', tresc: '60:120,66:124' });
      const r = (await d.baza.listSnapshotsForUser(d.uid, cel)).find((q) => q.snapshotId === x.w2);
      expect(r.savedAtISO, `chwila zapisu x2 na ${d.nazwa} — miejsce w historii sprzed scaleń`).toBe(zapisX2);
      expect((await d.baza.getPatientForUser(d.uid, cel)).lastSavedAtISO >= g.savedAtISO, 'chwila zapisu karty Z').toBe(true);
      stany.push(await bezStrat(d, et, [...WSZYSTKIE, 'ym', 'zm']));
    }
    expect(zgodne(stany[0], stany[1]), 'A = B').toBe(true);
    expect(Object.keys(stany[0].karty)).toEqual(['Z']);
  }, CZAS);

  // [ZIELONY na 69e41d1 i na dd21d11 — kontrola; CZERWONY na audyt 2df41a8 — 3/3: X na A bez wersji (chmura-AB,
  // krzyżowa) albo licznik Y rozjechany (chmura-BA)]
  // Jedno scalenie X → Y: rekord x2 z B jest nowszy niż pod Y (ta sama rev 1, późniejsza chwila zmiany), więc X wraca
  // z x2 jako bieżącą wersją (z jej nową chwilą zapisu — X wygrała przypisanie), a bieżącą wersją Y zostaje ym.
  it.each(['chmura-AB', 'chmura-BA', 'krzyzowa'])('X → Y na A, B poprawia bieżący pomiar X z nową chwilą zapisu (%s): X wraca z x2, bieżąca wersja Y = ym', async (model) => {
    const { A, B, sync, et, x, cel, glowa } = await edycjaGlowyPoScaleniach(1);
    expect(pomiaryZ(glowa.payload)).toBe('60:120,66:123,72:126,78:129');
    await rundy(model, A, B, sync);
    const stany = [];
    for (const d of [A, B]) {
      expect((await d.v.getLatestSnapshot(cel)).snapshotId, `bieżąca wersja Y na ${d.nazwa}`).toBe(glowa.snapshotId);
      const gx = await d.v.getLatestSnapshot(x.id);
      expect(gx && gx.snapshotId, `bieżąca wersja X na ${d.nazwa}`).toBe(x.w2);
      expect(pomiaryZ(gx.payload)).toBe('60:120,66:124');
      stany.push(await bezStrat(d, et, ['x1', 'x2', 'y1', 'y2', 'ym']));
    }
    expect(zgodne(stany[0], stany[1]), 'A = B').toBe(true);
    expect(stany[0].karty).toEqual({ X: karta2(1, ['x2']), Y: karta2(4, ['x1', 'y1', 'y2', 'ym']) });
  }, CZAS);

  /* Uwaga przeglądu końcowego do 69e41d1 (waga średnia): decyzja 'tresc' w gałęzi ISTNIEJĄCEJ karty z ładunku
     (Bsl_scalPacjenta, karta X jest już na A) nie miała testu — mutant bez niej (MK2) przeżywał cały plik, a gubi
     poprawkę z urządzenia, które potem znika. A: X → Y → Z; B zapisuje x3 w X i A scala ładunek B (X wraca na A z samą
     x3); B poprawia x1 w X (61 mies., zachowana chwila zapisu); A scala jeden ładunek B; B znika, a nowe urządzenie C
     pobiera stan A.
     [CZERWONY na dd21d11 i na mutancie MK2 — x1 pod Z = 60:120 na A i C (poprawka zostaje tylko na B); CZERWONY na
     audyt 2df41a8 — x1 przechodzi pod X (kradzież wersji)] */
  it('decyzja „treść” w gałęzi istniejącej karty: poprawka x1 z B dochodzi do x1 pod Z po jednym scaleniu, nowe urządzenie C ją dostaje', async () => {
    const A = await urzadzenie('A'), B = await urzadzenie('B'), C = await urzadzenie('C');
    const { X, Y, Z, et, x1 } = await trzyKarty([A, B]);
    await chwila(5);
    await A.v.mergePatients(X, Y);
    await chwila(5);
    const zm = (await A.v.mergePatients(Y, Z)).snapshotId;
    await chwila(5);
    et[(await zapiszWersje(B, X, [60, 66, 72])).snapshotId] = 'x3';
    await A.v.mergeSyncPayload(kopia(await B.v.exportSyncPayload())); // X wraca na A z samą x3
    expect(await A.baza.getPatientForUser(A.uid, X), 'X istnieje na A').toBeTruthy();
    expect(await wersjaNa(A, x1, et)).toEqual({ karta: 'Z', tresc: '60:120' });
    await chwila(5);
    await B.v.updateSnapshotPayload(X, x1, zapis([61]), { preserveSavedAt: true });
    const wynik = await A.v.mergeSyncPayload(kopia(await B.v.exportSyncPayload()));
    await C.v.mergeSyncPayload(kopia(await A.v.exportSyncPayload())); // B znika; C pobiera stan A
    for (const d of [A, C]) {
      expect(await wersjaNa(d, x1, et), `x1 na ${d.nazwa}`).toEqual({ karta: 'Z', tresc: '61:120.5' });
      expect((await d.baza.listSnapshotsForUser(d.uid, Z)).find((q) => q.snapshotId === x1).rev, `rev x1 na ${d.nazwa}`).toBe(2);
      expect((await d.v.getLatestSnapshot(Z)).snapshotId, `bieżąca wersja Z na ${d.nazwa}`).toBe(zm);
      const s = await stan(d, et);
      expect(s.karty.X, `X na ${d.nazwa}`).toEqual(karta2(1, ['x3']));
      expect(s.karty.Z.licznik).toBe(s.karty.Z.wersje.length);
    }
    expect(wynik.addedPatientCount).toBe(0);
  }, CZAS);
});

describe('P-SYNC-WLASCICIEL — treść, chwila zmiany i chwila zapisu wersji z tej samej strony (Bsw_rekord)', () => {
  /* Uwaga recenzenta do dd21d11 (waga średnia): mutanty MR2 (rev z ładunku przy treści tutejszej) i MR3 (chwila zapisu
     z ładunku przy treści tutejszej) przeżywały 203 testy. Scenariusze recenzenta S2 i S3 (dane fikcyjne).
     [CZERWONY na audyt 2df41a8 — S2: 65:122.5, S3: x1 = 60:120; ZIELONY na dd21d11; mutant MR2 — czerwony]
     Chwila zapisu w S3 — zmiana oczekiwania po przeglądzie końcowym 69e41d1 (do akceptacji właściciela): chwila zapisu
     wersji (miejsce w historii karty) pochodzi ze strony, która wygrała przypisanie karty, a nie z tej, której treść
     wygrała — dotąd szła z treścią, więc poprawka dawnej głowy starej karty po „Scal pacjentów” wyprzedzała głowę
     scalenia (testy „bieżąca wersja karty scalonej” wyżej). Dawny MR3 jest teraz regułą; jego odwrotność (chwila zapisu
     z treścią) jest czerwona w S3 i w testach bieżącej wersji. [CZERWONY na 69e41d1: chwila zapisu poprawki B] */
  it('S2: A scala X → Y i poprawia x1 dwa razy, B poprawia x1 w starej X trzy razy (ostatnia najpóźniejsza) → na obu ostatnia poprawka B', async () => {
    const A = await urzadzenie('A'), B = await urzadzenie('B');
    const X = await karta(A.v); await chwila(4);
    const Y = await karta(A.v);
    const sync = chmura(); await sync(A); await sync(B);
    const et = await etykiety(A, { X, Y });
    const x1 = idPo(et, 'x1');
    await chwila(5);
    await A.v.mergePatients(X, Y); // x1 pod Y, rev 1
    await chwila(5);
    await A.v.updateSnapshotPayload(Y, x1, zapis([62]), { preserveSavedAt: true }); // A: rev 2
    const pA = kopia(await A.v.exportSyncPayload()); // ładunek A (x1 rev 2, nagrobek X)
    await chwila(5);
    await B.v.updateSnapshotPayload(X, x1, zapis([63]), { preserveSavedAt: true }); // B: rev 1
    await chwila(5);
    await B.v.updateSnapshotPayload(X, x1, zapis([64]), { preserveSavedAt: true }); // B: rev 2
    await chwila(5);
    await A.v.updateSnapshotPayload(Y, x1, zapis([65]), { preserveSavedAt: true }); // A: rev 3
    await chwila(5);
    await B.v.updateSnapshotPayload(X, x1, zapis([66]), { preserveSavedAt: true }); // B: rev 3, najpóźniejsza
    await B.v.mergeSyncPayload(pA); // X w N: „zabierz”, treść tutejsza (późniejsza) z jej rev 3
    expect((await B.baza.listSnapshotsForUser(B.uid, Y)).find((s) => s.snapshotId === x1).rev).toBe(3);
    const pa = kopia(await A.v.exportSyncPayload()), pb = kopia(await B.v.exportSyncPayload());
    await A.v.mergeSyncPayload(pb); await B.v.mergeSyncPayload(pa);
    expect(await trescWersji(A, Y, x1)).toBe('66:123');
    expect(await trescWersji(B, Y, x1)).toBe('66:123');
  }, CZAS);

  it('S3: B poprawia x1 w X z nową chwilą zapisu, potem A scala X → Y → x1 pod Y z treścią poprawki i chwilą zapisu sprzed scalenia (Y wygrała przypisanie) na obu', async () => {
    const A = await urzadzenie('A'), B = await urzadzenie('B');
    const X = await karta(A.v); await chwila(4);
    const Y = await karta(A.v);
    const sync = chmura(); await sync(A); await sync(B);
    const et = await etykiety(A, { X, Y });
    const x1 = idPo(et, 'x1');
    await chwila(5);
    await B.v.updateSnapshotPayload(X, x1, zapis([61]), { preserveSavedAt: false }); // B: rev 1, chwila zapisu = teraz
    const zapisB = (await B.baza.listSnapshotsForUser(B.uid, X)).find((s) => s.snapshotId === x1).savedAtISO;
    const zapisA = (await A.baza.listSnapshotsForUser(A.uid, X)).find((s) => s.snapshotId === x1).savedAtISO;
    expect(zapisB > zapisA).toBe(true);
    await chwila(5);
    const ym = (await A.v.mergePatients(X, Y)).snapshotId; // nagrobek X późniejszy niż zapis X na B
    await sync(A); await sync(B); await sync(A);
    for (const d of [A, B]) {
      const s = (await d.baza.listSnapshotsForUser(d.uid, Y)).find((q) => q.snapshotId === x1);
      expect(await trescWersji(d, Y, x1), `treść na ${d.nazwa}`).toBe('61:120.5');
      expect(s.savedAtISO, `chwila zapisu na ${d.nazwa} — z Y, która wygrała przypisanie`).toBe(zapisA);
      expect((await d.v.getLatestSnapshot(Y)).snapshotId, `bieżąca wersja Y na ${d.nazwa}`).toBe(ym);
    }
  }, CZAS);
});

describe('P-SYNC-WLASCICIEL — rev wyniku bez nadmuchania i pętla scaleń (znane ograniczenie)', () => {
  /* Fuzz różnicowy do tej poprawki (400 przebiegów, trzy urządzenia): pierwsza wersja poprawki dawała wynikowi
     rozstrzygnięcia między kartami rev o 1 wyższą niż obie (propozycja recenzenta), także gdy treść obu rekordów była
     ta sama (ta sama chwila zmiany). Rev rosła bez zmiany treści, a później regułą tej samej karty („najpierw rev”)
     wygrywała z późniejszą poprawką tej wersji — w 4 przebiegach gubiło to poprawki, które zostawały na dd21d11.
     Scenariusz z przebiegu 50: B scala X → Y, C (później) scala Y → X, A poprawia x1 w X; B dostaje ładunek C — Y jest
     w zbiorze N, x1 wraca pod X („zabierz”, treść ta sama). Potem poprawka A ma przetrwać na wszystkich.
     [ZIELONY na dd21d11; CZERWONY na wariancie „max + 1” — x1 = 60:120 na A, B i C] */
  it('wynik „zabierz” z tą samą treścią nie dostaje wyższej rev: późniejsza poprawka tej samej karty przetrwa', async () => {
    const A = await urzadzenie('A'), B = await urzadzenie('B'), C = await urzadzenie('C');
    const X = await karta(A.v); await chwila(4);
    const Y = await karta(A.v);
    const sync = chmura(); await sync(A); await sync(B); await sync(C);
    const et = await etykiety(A, { X, Y });
    const x1 = idPo(et, 'x1');
    await chwila(5);
    await B.v.mergePatients(X, Y); // B: x1 pod Y, rev 1
    await chwila(5);
    await C.v.mergePatients(Y, X); // C: nagrobek Y późniejszy; x1 zostaje pod X (rev 0)
    await chwila(5);
    await A.v.updateSnapshotPayload(X, x1, zapis([61]), { preserveSavedAt: true }); // A: rev 1, najpóźniejsza zmiana
    const pb = kopia(await B.v.exportSyncPayload()), pc = kopia(await C.v.exportSyncPayload());
    await B.v.mergeSyncPayload(pc); await C.v.mergeSyncPayload(pb);
    const wB = (await B.baza.listSnapshotsForUser(B.uid, X)).find((s) => s.snapshotId === x1);
    for (let i = 0; i < 3; i += 1) { await sync(A); await sync(B); await sync(C); }
    for (const d of [A, B, C]) expect(await trescWersji(d, X, x1), `x1 na ${d.nazwa}`).toBe('61:120.5');
    expect(wB && wB.rev, 'x1 wróciła pod X na B z rev 1 (wyższa z dwóch), nie 2').toBe(1);
  }, CZAS);

  /* ZNANE OGRANICZENIE (do decyzji właściciela; przebieg 332 fuzzu). Pętla scaleń na dwóch urządzeniach: A scala X → Y;
     B ma nowy zapis X (X zostaje), przyjmuje scalenie A (x1 pod Y, rev 1), a potem sam scala Y → X — x1 wraca pod X
     z rev 2 bez zmiany treści. C (bez synchronizacji od początku) poprawia x1 w X (rev 1, najpóźniejsza zmiana). Obie
     wersje leżą pod tą samą kartą, więc rozstrzyga reguła tej samej karty z audyt — najpierw rev: wygrywa rev 2 (dwa
     przeniesienia), poprawka C ginie na B i C. Na audyt 2df41a8 przetrwała (scalenia nie podbijały rev). Na dd21d11 tak
     samo jak teraz. Domknięcie wymaga osobnego licznika właściciela (zmiana formatu) albo reguły „późniejsza zmiana”
     także w tej samej karcie (zmiana zwykłej synchronizacji) — test pilnuje opisanego zachowania. */
  it('pętla scaleń X → Y (A) i Y → X (B), poprawka x1 w X na C: wygrywa rev 2 z przeniesień — znane ograniczenie', async () => {
    const A = await urzadzenie('A'), B = await urzadzenie('B'), C = await urzadzenie('C');
    const X = await karta(A.v); await chwila(4);
    const Y = await karta(A.v);
    const sync = chmura(); await sync(A); await sync(B); await sync(C);
    const et = await etykiety(A, { X, Y });
    const x1 = idPo(et, 'x1');
    await chwila(5);
    await A.v.mergePatients(X, Y);
    await chwila(5);
    await zapiszWersje(B, X, [60, 66, 72]); // X na B zapisana po scaleniu na A — zostaje
    await sync(A); await sync(B); // B: x1, x2 pod Y (rev 1), X z nową wersją
    await chwila(5);
    await B.v.mergePatients(Y, X); // B: x1 z powrotem pod X, rev 2
    expect((await B.baza.listSnapshotsForUser(B.uid, X)).find((s) => s.snapshotId === x1).rev).toBe(2);
    await chwila(5);
    await C.v.updateSnapshotPayload(X, x1, zapis([61]), { preserveSavedAt: true }); // C: rev 1, najpóźniejsza
    const pb = kopia(await B.v.exportSyncPayload()), pc = kopia(await C.v.exportSyncPayload());
    await B.v.mergeSyncPayload(pc); await C.v.mergeSyncPayload(pb);
    expect(await trescWersji(B, X, x1)).toBe('60:120');
    expect(await trescWersji(C, X, x1)).toBe('60:120');
  }, CZAS);
});

describe('P-SYNC-WLASCICIEL — pomocnik testów kartaWzgledem', () => {
  // [CZERWONY na dd21d11 — pętla „do skutku” przy skrajnym identyfikatorze przekracza limit] Uwaga recenzenta do
  // dd21d11 (waga średnia): identyfikator po właściwej stronie za jednym razem, także przy `inny` na końcu zakresu.
  it('karta po właściwej stronie także przy skrajnym identyfikatorze, bez losowania do skutku', async () => {
    const A = await urzadzenie('A');
    const PRZYPADKI_ID = [
      ['ffffffff-ffff-4fff-bfff-fffffffffff0', true], ['ffee0000-0000-4000-8000-000000000000', true],
      ['00000000-0000-4000-8000-00000000000f', false], ['0045ffff-ffff-4fff-bfff-ffffffffffff', false],
      [globalThis.crypto.randomUUID(), true], [globalThis.crypto.randomUUID(), false],
    ];
    for (const [inny, wiekszy] of PRZYPADKI_ID) {
      const id = await kartaWzgledem(A, inny, wiekszy);
      expect(id > inny, `${id} względem ${inny}`).toBe(wiekszy);
      expect((await A.baza.listSnapshotsForUser(A.uid, id)).length).toBe(2);
    }
  }, 10_000);
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
    // zapisy przeniesienia (Bsw_przenies) i poprawki treści pod kartą G (Bsw_poprawTresc, decyzja 'tresc') wołane
    // wyłącznie z wnętrza obu blokad
    expect(f).toContain('return p.tylkoTresc ? Bsw_poprawTresc(p, teraz) : Bsw_przenies(p, teraz);');
    expect(f.indexOf('Bsw_poprawTresc(p, teraz)')).toBeGreaterThan(i1);
    expect(src.match(/Bsw_przenies\(/g)).toHaveLength(2);
    expect(src.match(/Bsw_poprawTresc\(/g)).toHaveLength(2);
    // karta oddająca wersję (licznik albo usunięcie pustej karty) — tylko z Bsw_przenies, czyli pod obiema blokadami
    expect(src.match(/Bsw_poOddaniu\(/g)).toHaveLength(2);
    const fp = src.slice(src.indexOf('async function Bsw_przenies('), src.indexOf('async function Bsw_poOddaniu('));
    expect(fp).toContain('usunieta: await Bsw_poOddaniu(G, rekG, wersjeG.length - 1)');
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
    // karty założone i usunięte w fazie przeniesień w wyniku scalania (addedPatientCount `l`, deletedPatientCount `w`)
    expect(le).toContain('const Bsw_f=await Bsl_przeniesWersje(Bkz_S,i,e);l+=Bsw_f.dodane,w+=Bsw_f.usuniete;');
    expect(le).toContain('mergedPatientCount:c,addedPatientCount:l,');
    expect(le).toContain(',deletedPatientCount:w,');
    const iUsun = le.indexOf('w+=await Bsl_usunPacjenta(j,m[j],e)');
    const iKosz = le.indexOf('await Bkz_scalKoniec(Bkz_S,e)');
    expect(iPetla).toBeGreaterThan(0);
    expect(iPrzen).toBeGreaterThan(iPetla);
    expect(iUsun).toBeGreaterThan(iPrzen);
    expect(iKosz).toBeGreaterThan(iUsun);
  });

  it('„Scal pacjentów” zapisuje przeniesioną wersję przez Bsw_poScaleniu; adaptery mają odczyt wersji po kluczu', () => {
    expect(src).toContain('await I().putSnapshotForUser(b,Object.assign({},o[d],Bsw_poScaleniu(o[d],e),Bm1(o[d])))');
    // cel scalenia zapamiętany przed usunięciem karty źródłowej (zdarzenie onPatientDeleted -> delta nagrobka)
    expect(src).toContain('}catch{}Bsw_zapamietajCel(t,e);await Bpu_usun(t);return{targetPatientId:e,');
    expect(src).toContain('const n=typeof e=="string"&&e?e:new Date().toISOString();return await Bsw_deltaNagrobka(t,{schemaVersion:at,patients:[],tombstones:[{patientId:t,deletedAtISO:n}],');
    expect(src).toContain('async getSnapshotForUser(o,a){const i=(await r(o)).transaction(It,"readonly").objectStore(It);return await t(i.get(a))||null}');
    expect(src).toContain('getSnapshotForUser:function(n,r){return e.getSnapshotForUser(n,r)}');
  });
});
