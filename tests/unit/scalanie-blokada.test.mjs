import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-SCALANIE-BLOKADA (decyzja właściciela 2026-10-01: „przeanalizuj i wprowadź to”) — scalanie synchronizacji pod
// blokadą pacjenta.
//
// Do tej zmiany mergeSyncPayload (także delty na żywo) zmieniał rekord pacjenta bez blokady, a decyzje liczył na
// odczycie sprzed zapisu. Mierzone na kodzie sprzed zmiany (każdy przypadek niżej wtedy nie przechodził):
//   - poprawka pomiaru zrobiona w tej karcie w trakcie scalania znikała pod wersją z ładunku;
//   - „Usuń do kosza” w trakcie scalania kończyło się odmową „zmieniony” (P-KOSZ-POPRAWKI tylko zawęziło okno),
//     a wersja przeniesiona do kosza po starcie scalania wracała z ładunku do historii;
//   - zapis karty w trakcie scalania nagrobka pacjenta z innego urządzenia ginął razem z kartą;
//   - nagrobek wersji zapisany po decyzji scalania (kosz w innej karcie) znikał z listy przy końcu scalania.
//
// Prawdziwy vilda_vault.js, magazyn w pamięci z „pułapką”: wybrane wywołanie magazynu czeka, aż test je zwolni —
// tak wstrzymujemy scalanie albo kosz dokładnie między odczytem a zapisem. Dwa tryby: sama kolejka strony (bez Web
// Locks) i atrapa Web Locks (`ifAvailable`, `signal`), bo tą drogą idą sygnał czekania i limit czasu. Prawdziwe Web
// Locks w dwóch kartach sprawdza tests/e2e/scalanie-blokada.spec.mjs. Dane wyłącznie FIKCYJNE.

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

/* Atrapa Web Locks: jedna blokada wyłączna na nazwę, kolejka FIFO, `ifAvailable` (callback dostaje null, gdy zajęta)
   i `signal` (przerwanie czekania odrzuca obietnicę błędem AbortError). */
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

/* Magazyn z pułapkami: pulapka(metoda, warunek, ktore) wstrzymuje `ktore`-te wywołanie metody spełniające warunek
   (przed wykonaniem). Zwraca { osiagnieta, zwolnij }. */
function magazynZPulapkami(adapter) {
  const pulapki = [];
  const owiniety = new Proxy(adapter, {
    get(cel, klucz) {
      const f = cel[klucz];
      if (typeof f !== 'function') return f;
      return async function (...args) {
        for (const p of pulapki) {
          if (p.zuzyta || p.metoda !== klucz || !p.warunek(...args)) continue;
          p.trafienia += 1;
          if (p.trafienia < p.ktore) continue;
          p.zuzyta = true;
          p.osiagnieta.rozwiaz();
          await p.zwolnienie.obietnica;
        }
        return f.apply(cel, args);
      };
    },
  });
  function pulapka(metoda, warunek = () => true, ktore = 1) {
    const p = { metoda, warunek, ktore, trafienia: 0, zuzyta: false, osiagnieta: odroczone(), zwolnienie: odroczone() };
    pulapki.push(p);
    return { osiagnieta: p.osiagnieta.obietnica, zwolnij: () => p.zwolnienie.rozwiaz() };
  }
  return { owiniety, pulapka };
}

let licznik = 0;
async function urzadzenie(opcje = {}) {
  licznik += 1;
  const win = {
    crypto: globalThis.crypto,
    TextEncoder,
    TextDecoder,
    btoa: globalThis.btoa,
    atob: globalThis.atob,
    localStorage: magazyn(),
    sessionStorage: magazyn(),
    setTimeout: setTimeout.bind(globalThis),
    clearTimeout: clearTimeout.bind(globalThis),
    addEventListener() {},
    removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {}, hidden: false },
    AbortController,
  };
  if (opcje.locks) win.navigator = { locks: opcje.locks };
  win.window = win; win.self = win; win.top = win;
  // Retencja wyłączona: testy liczą wersje same.
  win.localStorage.setItem('vildaRetention', '0');
  loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_vault.js', win);
  const v = win.VildaVault;
  const { owiniety, pulapka } = magazynZPulapkami(v.createInMemoryAdapter());
  v.setStorageAdapter(owiniety);
  await v.createUser(`Scalanie#Blokada!2026${licznik}aa`, { label: `dev${licznik}`, iterations: 10000 });
  return { v, pulapka };
}

// Pomiar z trwałym uid — edycja wskazuje wiersz po uid, jak oś czasu Karty Pacjenta.
const pomiar = (ageMonths) => ({
  uid: `m-${ageMonths}`, ageMonths, ageYears: ageMonths / 12, height: 90 + ageMonths / 2, weight: 12 + ageMonths / 6,
});
const payload = (wieki, imie = 'Jan') => ({
  name: `Testowy ${imie}`,
  user: { lastName: 'Testowy', firstName: imie, sex: 'M', age: 5, ageMonths: 6, height: 110, weight: 19 },
  advanced: { data: { measurements: wieki.map(pomiar) } },
});
const kopia = (x) => JSON.parse(JSON.stringify(x));
const pomiary = (snap) => ((((snap || {}).payload || {}).advanced || {}).data || {}).measurements || [];
const wieki = (snap) => pomiary(snap).map((m) => m.ageMonths).sort((a, b) => a - b);
const wzrost = (snap, ageMonths) => (pomiary(snap).find((m) => m.ageMonths === ageMonths) || {}).height;
const idWersji = async (v, pid) => (await v.getPatient(pid)).snapshots.map((s) => s.snapshotId);

// Kolejne zapisy z odstępem jak u człowieka: wersje z tej samej milisekundy porządkuje inna reguła (P-KOLEJNOSC-WERSJI).
async function karta(v, kolejne, imie = 'Jan') {
  const a = await v.savePatient(payload(kolejne[0], imie), { dedup: false });
  for (const w of kolejne.slice(1)) {
    await chwila(5);
    await v.savePatient(payload(w, imie), { patientId: a.patientId, dedup: false });
  }
  return a.patientId;
}

// Drugie urządzenie z kopią konta A (to samo, co daje pierwsza synchronizacja); własne Web Locks.
async function kopiaUrzadzenia(A, opcje = {}) {
  const B = await urzadzenie(opcje.locks ? { locks: atrapaLocks() } : {});
  await B.v.mergeSyncPayload(await A.v.exportSyncPayload());
  return B;
}

// Śledzi, czy obietnica już się rozstrzygnęła.
function obserwuj(p) {
  const o = { koniec: false, wynik: undefined, blad: undefined };
  o.obietnica = p.then((w) => { o.koniec = true; o.wynik = w; return w; }, (e) => { o.koniec = true; o.blad = e; return null; });
  return o;
}

/* Karta A trzyma blokadę pacjenta: zapis na formularzu sprzed pomiaru 80 i otwarte pytanie bramy (P-ZAPISY-DWIE-KARTY).
   Ładunek z urządzenia B ma nowy zapis tej karty (pomiar 90). */
async function pytanieBramyIZapisNaB(opcje) {
  const A = await urzadzenie(opcje);
  const odpowiedz = odroczone();
  let pierwsze = true;
  A.v.setSaveConflictResolver(() => {
    if (pierwsze) { pierwsze = false; return odpowiedz.obietnica; }
    return 'scal';
  });
  const pid = await karta(A.v, [[60, 66], [60, 66, 80]]);
  const B = await kopiaUrzadzenia(A, opcje);
  await chwila(5);
  await B.v.savePatient(payload([60, 66, 80, 90]), { patientId: pid, dedup: false });
  const ladunekB = await B.v.exportSyncPayload();
  const zapisA = A.v.savePatient(payload([60, 66, 74]), {
    patientId: pid, dedup: false, baselinePayload: payload([60, 66]),
  });
  await chwila(20);
  return { A, pid, ladunekB, zapisA, odpowiedz };
}

for (const [tryb, opcje] of [['kolejka strony (bez Web Locks)', () => ({})], ['Web Locks', () => ({ locks: atrapaLocks() })]]) {
  describe(`Scalanie pod blokadą pacjenta — ${tryb}`, () => {
    it('scalanie czeka na zapis tego pacjenta (otwarte pytanie bramy) i kończy się po odpowiedzi; licznik wersji się zgadza', async () => {
      const { A, pid, ladunekB, zapisA, odpowiedz } = await pytanieBramyIZapisNaB(opcje());

      const scal = obserwuj(A.v.mergeSyncPayload(ladunekB));
      await chwila(30);
      expect(scal.koniec, 'scalanie czeka, aż lekarz odpowie w karcie A').toBe(false);
      expect(await idWersji(A.v, pid), 'w tym czasie nic nie dopisane').toHaveLength(2);

      odpowiedz.rozwiaz('scal');
      await Promise.all([zapisA, scal.obietnica]);
      expect(scal.blad).toBeUndefined();
      expect(scal.wynik.addedSnapshotCount, 'zapis z B dopisany').toBe(1);

      const rek = await A.v.getPatient(pid);
      expect(rek.snapshots).toHaveLength(4);
      expect(rek.snapshotCount, 'licznik wersji w nagłówku').toBe(4);
    });

    it('poprawka pomiaru zrobiona w trakcie scalania nie znika pod wersją z ładunku', async () => {
      const A = await urzadzenie(opcje());
      const pid = await karta(A.v, [[60, 66], [60, 66, 72]]);
      const B = await kopiaUrzadzenia(A, opcje());
      await B.v.updateMeasurementRow(pid, { uid: 'm-60' }, { height: 111 });
      const ladunekB = await B.v.exportSyncPayload();

      // Scalanie przeczytało wersje i zdecydowało, że poprawka z B jest nowsza — stoi tuż przed zapisem.
      const p = A.pulapka('putSnapshotForUser', (_u, rek) => rek && rek.patientId === pid);
      const scal = obserwuj(A.v.mergeSyncPayload(ladunekB));
      await p.osiagnieta;

      const edycja = obserwuj(A.v.updateMeasurementRow(pid, { uid: 'm-66' }, { height: 150 }));
      await chwila(30);
      expect(edycja.koniec, 'poprawka w karcie A czeka na koniec scalania tego pacjenta').toBe(false);

      p.zwolnij();
      await Promise.all([scal.obietnica, edycja.obietnica]);
      expect(scal.blad).toBeUndefined();
      expect(edycja.blad).toBeUndefined();

      const glowa = (await A.v.getPatient(pid)).snapshots[0];
      expect(wzrost(glowa, 60), 'poprawka z urządzenia B').toBe(111);
      expect(wzrost(glowa, 66), 'poprawka z karty A nie zginęła').toBe(150);
      expect(wieki(glowa)).toEqual([60, 66, 72]);
    });

    it('„Usuń do kosza” w trakcie scalania: scalanie czeka, usunięcie się udaje, a wersja nie wraca z ładunku', async () => {
      const A = await urzadzenie(opcje());
      const pid = await karta(A.v, [[60], [60, 66], [60, 66, 72]]);
      const [, srodkowa] = await idWersji(A.v, pid);
      const B = await kopiaUrzadzenia(A, opcje());
      // Na B poprawiono środkową wersję (nowsza rewizja), zanim lekarz w A przeniósł ją do kosza.
      const naB = (await B.v.getPatient(pid)).snapshots.find((s) => s.snapshotId === srodkowa);
      const poprawiona = kopia(naB.payload);
      poprawiona.advanced.data.measurements[0].height = 99;
      await B.v.updateSnapshotPayload(pid, srodkowa, poprawiona, { preserveSavedAt: true });
      const ladunekB = await B.v.exportSyncPayload();
      await chwila(5);

      // Kosz zapisał nagrobek i stoi tuż przed usunięciem wersji.
      const p = A.pulapka('putUserMeta', (_u, meta) => !!(meta && Array.isArray(meta.snapshotTombstones)
        && meta.snapshotTombstones.some((e) => e.snapshotId === srodkowa)));
      const kosz = obserwuj(A.v.moveSnapshotToTrash(pid, srodkowa));
      await p.osiagnieta;

      const scal = obserwuj(A.v.mergeSyncPayload(ladunekB));
      await chwila(30);
      expect(scal.koniec, 'scalanie czeka na koniec przenoszenia do kosza').toBe(false);

      p.zwolnij();
      await Promise.all([kosz.obietnica, scal.obietnica]);
      expect(kosz.blad, 'usunięcie nie dostało odmowy „zmieniony”').toBeUndefined();
      expect(scal.blad).toBeUndefined();

      const rek = await A.v.getPatient(pid);
      expect(rek.snapshots.map((s) => s.snapshotId), 'wersja w koszu nie wróciła').not.toContain(srodkowa);
      expect(rek.snapshotCount).toBe(rek.snapshots.length);
      expect((await A.v.listTrashedSnapshots()).map((e) => e.snapshotId)).toEqual([srodkowa]);
    });

    it('wersja przeniesiona do kosza po starcie scalania nie wraca z ładunku sprzed usunięcia', async () => {
      const A = await urzadzenie(opcje());
      const pid = await karta(A.v, [[60], [60, 66], [60, 66, 72]]);
      const [, srodkowa] = await idWersji(A.v, pid);
      const ladunek = await A.v.exportSyncPayload(); // stan w chmurze sprzed usunięcia
      await chwila(5);

      // Scalanie już przeczytało nagrobki (start) i stoi przed pętlą kart.
      const p = A.pulapka('listTombstonesForUser');
      const scal = obserwuj(A.v.mergeSyncPayload(ladunek));
      await p.osiagnieta;
      await A.v.moveSnapshotToTrash(pid, srodkowa);
      p.zwolnij();
      await scal.obietnica;
      expect(scal.blad).toBeUndefined();

      const rek = await A.v.getPatient(pid);
      expect(rek.snapshots.map((s) => s.snapshotId), 'wersja z kosza nie wróciła do historii').not.toContain(srodkowa);
      expect(rek.snapshots).toHaveLength(2);
      expect(rek.snapshotCount).toBe(2);
      expect((await A.v.listTrashedSnapshots()).map((e) => e.snapshotId)).toEqual([srodkowa]);
    });

    it('karta zapisana w trakcie scalania nagrobka pacjenta z innego urządzenia zostaje razem z zapisem', async () => {
      const A = await urzadzenie(opcje());
      const pid = await karta(A.v, [[60]]);
      const B = await kopiaUrzadzenia(A, opcje());
      await B.v.removePatient(pid);
      const ladunekB = await B.v.exportSyncPayload();
      await chwila(5);

      const p = A.pulapka('listTombstonesForUser');
      const scal = obserwuj(A.v.mergeSyncPayload(ladunekB));
      await p.osiagnieta;
      await A.v.savePatient(payload([60, 66]), { patientId: pid, dedup: false }); // zapis po usunięciu na B
      p.zwolnij();
      await scal.obietnica;
      expect(scal.blad).toBeUndefined();
      expect(scal.wynik.deletedPatientCount, 'scalanie nie usunęło karty').toBe(0);

      const rek = await A.v.getPatient(pid);
      expect(rek, 'karta jest').not.toBeNull();
      expect(rek.snapshots).toHaveLength(2);
      expect(wieki(rek.snapshots[0]), 'zapis z karty A jest').toEqual([60, 66]);
      expect((await A.v.exportSyncPayload()).tombstones.map((t) => t.patientId), 'bez nagrobka tej karty').not.toContain(pid);
    });

    it('nagrobek pacjenta przy otwartym pytaniu bramy: scalanie czeka, a po zapisie karta zostaje z całą historią', async () => {
      const A = await urzadzenie(opcje());
      const odpowiedz = odroczone();
      let pierwsze = true;
      A.v.setSaveConflictResolver(() => {
        if (pierwsze) { pierwsze = false; return odpowiedz.obietnica; }
        return 'scal';
      });
      const pid = await karta(A.v, [[60, 66], [60, 66, 80]]);
      const B = await kopiaUrzadzenia(A, opcje());
      await chwila(5);
      await B.v.removePatient(pid); // usunięcie na B jest późniejsze niż ostatni zapis, który A ma w chwili scalania
      const ladunekB = await B.v.exportSyncPayload();
      const zapisA = A.v.savePatient(payload([60, 66, 74]), { patientId: pid, dedup: false, baselinePayload: payload([60, 66]) });
      await chwila(20);

      const scal = obserwuj(A.v.mergeSyncPayload(ladunekB));
      await chwila(30);
      expect(scal.koniec, 'scalanie czeka na zapis tej karty').toBe(false);
      expect(await A.v.getPatient(pid), 'karta jeszcze jest').not.toBeNull();

      odpowiedz.rozwiaz('scal');
      await Promise.all([zapisA, scal.obietnica]);
      expect(scal.blad).toBeUndefined();
      expect(scal.wynik.deletedPatientCount).toBe(0);
      const rek = await A.v.getPatient(pid);
      expect(rek.snapshots, 'cała historia i zapis po usunięciu na B').toHaveLength(3);
      expect(rek.snapshotCount).toBe(3);
    });

    it('nagrobek wersji zapisany po decyzji scalania (kosz w innej karcie) nie znika przy końcu scalania', async () => {
      const A = await urzadzenie(opcje());
      const x = await karta(A.v, [[60], [60, 66], [60, 66, 72]], 'Jan');
      const y = await karta(A.v, [[48], [48, 54]], 'Adam');
      const [, srodkowaX] = await idWersji(A.v, x);
      const [, starszaY] = await idWersji(A.v, y);
      const B = await kopiaUrzadzenia(A, opcje());
      await chwila(5);
      await A.v.moveSnapshotToTrash(x, srodkowaX); // A: pierwsze usunięcie
      await chwila(5);
      // B o nim nie wie: poprawia tę wersję później (wygrywa z pierwszym usunięciem) i usuwa wersję Adama.
      const naB = (await B.v.getPatient(x)).snapshots.find((s) => s.snapshotId === srodkowaX);
      const poprawiona = kopia(naB.payload);
      poprawiona.advanced.data.measurements[0].height = 99;
      await B.v.updateSnapshotPayload(x, srodkowaX, poprawiona, { preserveSavedAt: true });
      await B.v.moveSnapshotToTrash(y, starszaY);
      const ladunekB = await B.v.exportSyncPayload();
      await chwila(5);

      // Scalanie wróciło poprawioną wersję do karty X i stosuje nagrobki — stoi przy karcie Adama.
      const p = A.pulapka('listSnapshotsForUser', (_u, pid) => pid === y, 2);
      const scal = obserwuj(A.v.mergeSyncPayload(ladunekB));
      await p.osiagnieta;
      expect(await idWersji(A.v, x), 'poprawiona wersja wróciła z B').toContain(srodkowaX);
      await A.v.moveSnapshotToTrash(x, srodkowaX); // drugie usunięcie, już po decyzji scalania
      p.zwolnij();
      await scal.obietnica;
      expect(scal.blad).toBeUndefined();

      expect(await idWersji(A.v, x), 'drugie usunięcie zostaje').not.toContain(srodkowaX);
      expect(await idWersji(A.v, y), 'nagrobek z B zastosowany').not.toContain(starszaY);
      const kosz = await A.v.listTrashedSnapshots();
      const wpis = kosz.find((e) => e.snapshotId === srodkowaX);
      expect(wpis, 'wpis kosza po drugim usunięciu jest').toBeTruthy();
      expect(wpis.payload.advanced.data.measurements[0].height, 'z poprawioną treścią').toBe(99);
    });
  });
}

describe('Limit czasu blokady w scalaniu (Web Locks)', () => {
  it('po limicie: błąd MERGE_BUSY, karta bez zmian; po zwolnieniu blokady to samo scalanie przechodzi', async () => {
    const { A, pid, ladunekB, zapisA, odpowiedz } = await pytanieBramyIZapisNaB({ locks: atrapaLocks() });
    let czekal = 0;
    const blad = await A.v.mergeSyncPayload(ladunekB, { onLockWait: () => { czekal += 1; }, lockTimeoutMs: 150 })
      .then(() => null, (e) => e);
    expect(blad && blad.code).toBe('MERGE_BUSY');
    expect(blad.vildaMergeBusy).toBe(true);
    expect(blad.vildaSaveBusy).toBe(true);
    expect(blad.message).toMatch(/^Synchronizacja wstrzymana — pacjent jest właśnie zapisywany w innej karcie/);
    expect(czekal, 'sygnał czekania').toBe(1);
    expect(await idWersji(A.v, pid), 'nic nie dopisane').toHaveLength(2);

    odpowiedz.rozwiaz('scal');
    await zapisA;
    const wynik = await A.v.mergeSyncPayload(ladunekB);
    expect(wynik.addedSnapshotCount).toBe(1);
    const rek = await A.v.getPatient(pid);
    expect(rek.snapshots).toHaveLength(4);
    expect(rek.snapshotCount).toBe(4);
  });

  it('przerwanie przy nagrobkach: lista nagrobków i tak się zapisuje — treść kosza dołączona z wersji lokalnej nie ginie', async () => {
    const locks = atrapaLocks();
    const A = await urzadzenie({ locks });
    const x = await karta(A.v, [[60], [60, 66], [60, 66, 72]], 'Jan');
    const y = await karta(A.v, [[48], [48, 54]], 'Adam');
    const [, srodkowaX] = await idWersji(A.v, x);
    const [, starszaY] = await idWersji(A.v, y);
    const B = await kopiaUrzadzenia(A, { locks: atrapaLocks() });
    await chwila(5);
    await B.v.moveSnapshotToTrash(x, srodkowaX);
    await B.v.moveSnapshotToTrash(y, starszaY);
    const ladunekB = await B.v.exportSyncPayload();
    // Nagrobek bez treści (urządzenie, które nie umiało jej dołączyć): treść kosza bierze A z własnej wersji.
    ladunekB.snapshotTombstones.forEach((e) => { delete e.payload; });
    ladunekB.snapshotTombstones.sort((a, b) => (a.patientId === x ? -1 : 0) - (b.patientId === x ? -1 : 0));
    // Karta Adama zajęta w innej karcie, gdy scalanie dochodzi do nagrobków.
    const p = A.pulapka('listSnapshotsForUser', (_u, pid) => pid === x, 2);
    const scal = obserwuj(A.v.mergeSyncPayload(ladunekB, { lockTimeoutMs: 150 }));
    await p.osiagnieta;
    const zwolnijY = odroczone();
    locks.request(`vilda-save-pat:${y}`, () => zwolnijY.obietnica);
    p.zwolnij();
    await scal.obietnica;
    expect(scal.blad && scal.blad.code).toBe('MERGE_BUSY');

    expect(await idWersji(A.v, x), 'nagrobek karty X zastosowany przed przerwaniem').not.toContain(srodkowaX);
    const wpis = (await A.v.listTrashedSnapshots()).find((e) => e.snapshotId === srodkowaX);
    expect(wpis, 'wpis kosza z treścią z wersji lokalnej').toBeTruthy();
    expect(wieki({ payload: wpis.payload })).toEqual([60, 66]);

    zwolnijY.rozwiaz();
    await A.v.mergeSyncPayload(ladunekB);
    expect(await idWersji(A.v, y), 'po zwolnieniu nagrobek Adama zastosowany').not.toContain(starszaY);
  });
});

describe('strażniki źródła', () => {
  const src = readFileSync(path.join(repoRoot, 'vilda_vault.js'), 'utf8');
  const le = src.slice(src.indexOf('async function Le(t,e){'), src.indexOf('prunedSnapshotCount:Bkz_S.przyciete||0}'));

  it('scalanie nie zapisuje rekordu pacjenta poza funkcjami pod blokadą', () => {
    expect(le.length).toBeGreaterThan(1000);
    for (const zapis of ['putSnapshotForUser(', 'putPatientForUser(', 'removePatientForUser(', 'removeSnapshotForUser(', 'putTombstoneForUser(']) {
      expect(le, zapis).not.toContain(zapis);
    }
    expect(le).toContain('const Bsl_w=await Bsl_scalPacjenta(F,j,H,R,Bkz_S,i,e);');
    expect(le).toContain('w+=await Bsl_usunPacjenta(j,m[j],e)');
    // P-BLOKADA-IMPORT: wewnętrzne scalanie importu (Bpb_IMPORT) pomija koniec scalania kosza; synchronizacja nie.
    expect(le).toContain('Bkz_n=e===Bpb_IMPORT?0:await Bkz_scalKoniec(Bkz_S,e)}catch(Bkz_e){if(Bkz_e&&Bkz_e.vildaMergeBusy)throw Bkz_e;');
    for (const f of ['Bsl_scalPacjenta', 'Bsl_usunPacjenta']) {
      const cialo = src.slice(src.indexOf(`async function ${f}(`));
      expect(cialo.slice(0, 200), f).toMatch(/return Bsl_podBlokada\(/);
    }
  });

  it('delty na żywo idą tą samą drogą (applyEncryptedDelta → Le)', () => {
    expect(src).toContain('applyEncryptedDelta:ps,');
    const ps = src.slice(src.indexOf('async function ps(t){'));
    expect(ps.slice(0, 300)).toContain('return!e||typeof e!="object"?null:await Le(e)}');
  });
});
