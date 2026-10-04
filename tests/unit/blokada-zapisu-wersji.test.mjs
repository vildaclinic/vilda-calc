import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-BLOKADA-ZAPISU-WERSJI — pozostałe zapisy rekordu pacjenta pod blokadą pacjenta.
//
// P-ZAPISY-DWIE-KARTY objął blokadą per pacjent tylko `savePatient`. Rekord zmieniają też w miejscu:
// updateSnapshotPayload, updateMeasurementRow, deleteMeasurementRow, setSnapshotPinned i deleteSnapshot — każda
// to „odczytaj → zdecyduj → zapisz”. Mierzone na kodzie sprzed zmiany: edycja pomiaru wykonana, gdy w innej karcie
// czekało pytanie bramy zapisu, znikała z bieżącej wersji, a usunięty w tym czasie pomiar wracał.
//
// Tu: prawdziwy vilda_vault.js, magazyn w pamięci. Część bloków bez `navigator.locks` (sama kolejka strony),
// część z atrapą Web Locks (z `ifAvailable` i `signal`), bo tą drogą idą sygnał „Czekam” i limit 30 s.
// Prawdziwe Web Locks w dwóch kartach sprawdza tests/e2e/blokada-zapisu-wersji.spec.mjs.
// Dane wyłącznie FIKCYJNE.

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

/* Atrapa Web Locks: jedna blokada wyłączna na nazwę, kolejka FIFO, `ifAvailable` (callback dostaje
   null, gdy zajęta) i `signal` (przerwanie czekania odrzuca obietnicę błędem AbortError). */
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

function urzadzenie(opcje = {}) {
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
  // Retencja wyłączona: test liczy wersje sam.
  win.localStorage.setItem('vildaRetention', '0');
  loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_vault.js', win);
  const vault = win.VildaVault;
  vault.setStorageAdapter(vault.createInMemoryAdapter());
  return vault;
}

let licznik = 0;
async function sejf(opcje) {
  licznik += 1;
  const v = urzadzenie(opcje);
  await v.createUser(`Blokada#Wersji!2026${licznik}aa`, { label: `dev${licznik}`, iterations: 10000 });
  return v;
}

// Pomiar z trwałym uid — edycja i usuwanie wskazują wiersz po uid, jak oś czasu Karty Pacjenta.
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

function odroczone() {
  let rozwiaz;
  const obietnica = new Promise((r) => { rozwiaz = r; });
  return { obietnica, rozwiaz };
}
const chwila = (ms) => new Promise((r) => { setTimeout(r, ms); });

/* Stan z przypadku P-ZAPISY-DWIE-KARTY: karta A zapisuje pacjenta, sejf pyta „Ktoś inny zmienił ten rekord”
   (pomiar 80 z innej karty), a lekarz jeszcze nie odpowiedział — zapis A trzyma blokadę pacjenta. */
async function pytanieBramyOtwarte(opcje) {
  const v = await sejf(opcje);
  const odpowiedz = odroczone();
  const pytania = [];
  let pierwsze = true;
  v.setSaveConflictResolver((info) => {
    pytania.push(info.foreign.map((f) => f.pomiar.ageMonths));
    if (pierwsze) { pierwsze = false; return odpowiedz.obietnica; }
    return 'scal';
  });
  const wczytane = payload([60, 66]);
  const a = await v.savePatient(kopia(wczytane), { dedup: false });
  await v.savePatient(payload([60, 66, 80]), { patientId: a.patientId, dedup: false });
  const zapisA = v.savePatient(payload([60, 66, 74]), {
    patientId: a.patientId, dedup: false, baselinePayload: kopia(wczytane),
  });
  // Brama musi faktycznie wejść do resolvera po odczycie i deszyfrowaniu.
  await expect.poll(() => pytania, { timeout: 2000, message: 'pytanie bramy o pomiar 80 czeka na lekarza' }).toEqual([[80]]);
  return { v, patientId: a.patientId, zapisA, odpowiedz };
}

// Śledzi, czy obietnica już się rozstrzygnęła.
function obserwuj(p) {
  const o = { koniec: false, wynik: undefined, blad: undefined };
  o.obietnica = p.then((w) => { o.koniec = true; o.wynik = w; return w; }, (e) => { o.koniec = true; o.blad = e; return null; });
  return o;
}

for (const [tryb, opcje] of [['kolejka strony (bez Web Locks)', () => ({})], ['Web Locks', () => ({ locks: atrapaLocks() })]]) {
  describe(`Zapisy w miejscu czekają na zapis tego pacjenta — ${tryb}`, () => {
    it('edycja pomiaru w czasie pytania bramy trafia do bieżącej wersji, a nie do poprzedniej', async () => {
      const { v, patientId, zapisA, odpowiedz } = await pytanieBramyOtwarte(opcje());

      const edycja = obserwuj(v.updateMeasurementRow(patientId, { uid: 'm-66' }, { height: 150 }));
      await chwila(20);
      expect(edycja.koniec, 'edycja czeka, aż lekarz odpowie w karcie A').toBe(false);

      odpowiedz.rozwiaz('scal');
      await Promise.all([zapisA, edycja.obietnica]);
      expect(edycja.blad).toBeUndefined();

      const rek = await v.getPatient(patientId);
      expect(wieki(rek.snapshots[0]), 'bieżąca wersja: wszystkie pomiary').toEqual([60, 66, 74, 80]);
      expect(wzrost(rek.snapshots[0], 66), 'poprawka wzrostu w bieżącej wersji').toBe(150);
      expect(rek.snapshots).toHaveLength(3);
    });

    it('pomiar usunięty w czasie pytania bramy nie wraca do bieżącej wersji', async () => {
      const { v, patientId, zapisA, odpowiedz } = await pytanieBramyOtwarte(opcje());

      const usun = obserwuj(v.deleteMeasurementRow(patientId, { uid: 'm-80' }));
      await chwila(20);
      expect(usun.koniec, 'usunięcie czeka, aż lekarz odpowie w karcie A').toBe(false);

      odpowiedz.rozwiaz('scal');
      await Promise.all([zapisA, usun.obietnica]);
      expect(usun.blad).toBeUndefined();

      const rek = await v.getPatient(patientId);
      expect(wieki(rek.snapshots[0]), 'usunięty pomiar 80 nie wrócił').toEqual([60, 66, 74]);
    });

    it('poprawka wersji w miejscu (updateSnapshotPayload) czeka na zapis tego pacjenta', async () => {
      const { v, patientId, zapisA, odpowiedz } = await pytanieBramyOtwarte(opcje());
      const glowa = (await v.getPatient(patientId)).snapshots[0];
      const poprawiona = kopia(glowa.payload);
      poprawiona.user.firstName = 'Janusz';
      poprawiona.name = 'Testowy Janusz';

      const zmiana = obserwuj(v.updateSnapshotPayload(patientId, glowa.snapshotId, poprawiona, { preserveSavedAt: true }));
      await chwila(20);
      expect(zmiana.koniec, 'poprawka czeka, aż lekarz odpowie w karcie A').toBe(false);

      odpowiedz.rozwiaz('scal');
      await Promise.all([zapisA, zmiana.obietnica]);
      expect(zmiana.blad).toBeUndefined();
      const rek = await v.getPatient(patientId);
      expect(rek.snapshots).toHaveLength(3);
      expect(rek.snapshotCount, 'licznik wersji w nagłówku').toBe(3);
    });

    it('usunięcie i przypięcie wersji czekają; licznik wersji zgadza się z ich liczbą', async () => {
      const { v, patientId, zapisA, odpowiedz } = await pytanieBramyOtwarte(opcje());
      const przed = (await v.getPatient(patientId)).snapshots;
      const najstarsza = przed[przed.length - 1].snapshotId;
      const glowa = przed[0].snapshotId;

      const usun = obserwuj(v.deleteSnapshot(patientId, najstarsza));
      const przypnij = obserwuj(v.setSnapshotPinned(patientId, glowa, true));
      await chwila(20);
      expect(usun.koniec, 'usunięcie wersji czeka').toBe(false);
      expect(przypnij.koniec, 'przypięcie czeka').toBe(false);

      odpowiedz.rozwiaz('scal');
      await Promise.all([zapisA, usun.obietnica, przypnij.obietnica]);
      expect(usun.blad).toBeUndefined();
      expect(przypnij.blad).toBeUndefined();

      const rek = await v.getPatient(patientId);
      expect(rek.snapshots.map((s) => s.snapshotId)).not.toContain(najstarsza);
      expect(rek.snapshots).toHaveLength(2);
      expect(rek.snapshotCount, 'licznik wersji w nagłówku').toBe(2);
      expect(rek.snapshots.find((s) => s.snapshotId === glowa).pinned).toBe(true);
    });

    it('zapisy INNEGO pacjenta nie czekają', async () => {
      const { v, zapisA, odpowiedz } = await pytanieBramyOtwarte(opcje());
      const b = await v.savePatient(payload([48], 'Adam'), { dedup: false });
      const r = await v.updateMeasurementRow(b.patientId, { uid: 'm-48' }, { height: 111 });
      expect(r.updated, 'inny pacjent poprawiony od razu').toBe(true);
      odpowiedz.rozwiaz('scal');
      await zapisA;
    });

    it('kosz, retencja i edycja pomiaru biorą blokadę raz — bez zakleszczenia na własnej blokadzie', async () => {
      const v = await sejf(opcje());
      let czekal = 0;
      const naCzekanie = { onLockWait: () => { czekal += 1; } };
      const a = await v.savePatient(payload([60]), { dedup: false });
      // Odstęp między zapisami jak u człowieka: dwie wersje z tej samej milisekundy porządkuje inna reguła
      // (P-KOLEJNOSC-WERSJI), a przypięcie starszej z nich mogłoby wtedy zrobić z niej bieżącą.
      for (const w of [[60, 66], [60, 66, 72], [60, 66, 72, 78]]) {
        await chwila(5);
        await v.savePatient(payload(w), { patientId: a.patientId, dedup: false });
      }
      const pid = a.patientId;
      const wersje = (await v.getPatient(pid)).snapshots.map((s) => s.snapshotId);

      await v.updateMeasurementRow(pid, { uid: 'm-66' }, { height: 140 }, naCzekanie);
      await v.deleteMeasurementRow(pid, { uid: 'm-78' }, naCzekanie);
      await v.setSnapshotPinned(pid, wersje[1], true, naCzekanie);
      await v.setSnapshotPinned(pid, wersje[1], false, naCzekanie);
      await v.moveSnapshotToTrash(pid, wersje[2]);
      await v.deleteSnapshot(pid, wersje[3], naCzekanie);
      await v.pruneSnapshotsForPatient(pid);

      const rek = await v.getPatient(pid);
      expect(wieki(rek.snapshots[0])).toEqual([60, 66, 72]);
      expect(wzrost(rek.snapshots[0], 66)).toBe(140);
      expect(rek.snapshots).toHaveLength(2);
      expect(rek.snapshotCount).toBe(2);
      expect(czekal, 'nikt inny nie zapisywał — brak komunikatu „Czekam”').toBe(0);
    });
  });
}

describe('Sygnał czekania i limit czasu (Web Locks)', () => {
  it('zajęta blokada: każda z operacji dostaje sygnał czekania', async () => {
    const { v, patientId, zapisA, odpowiedz } = await pytanieBramyOtwarte({ locks: atrapaLocks() });
    const glowa = (await v.getPatient(patientId)).snapshots[0];
    const sygnaly = [];
    const naCzekanie = (nazwa) => ({ onLockWait: () => { sygnaly.push(nazwa); }, lockTimeoutMs: 5000 });

    const operacje = [
      v.updateMeasurementRow(patientId, { uid: 'm-66' }, { height: 150 }, naCzekanie('edycja')),
      v.setSnapshotPinned(patientId, glowa.snapshotId, true, naCzekanie('przypięcie')),
      v.updateSnapshotPayload(patientId, glowa.snapshotId, kopia(glowa.payload),
        { preserveSavedAt: true, ...naCzekanie('poprawka') }),
    ];
    await expect.poll(() => sygnaly.slice().sort(), { timeout: 2000 }).toEqual(['edycja', 'poprawka', 'przypięcie']);

    odpowiedz.rozwiaz('scal');
    await Promise.all([zapisA, ...operacje]);
  });

  it('po limicie: błąd vildaSaveBusy, rekord bez zmian; po zwolnieniu blokady ta sama operacja przechodzi', async () => {
    const { v, patientId, zapisA, odpowiedz } = await pytanieBramyOtwarte({ locks: atrapaLocks() });
    const przed = await v.getPatient(patientId);

    let czekal = 0;
    const opcje = { onLockWait: () => { czekal += 1; }, lockTimeoutMs: 150 };
    const bledy = await Promise.all([
      v.updateMeasurementRow(patientId, { uid: 'm-66' }, { height: 150 }, opcje).then(() => null, (e) => e),
      v.deleteMeasurementRow(patientId, { uid: 'm-60' }, opcje).then(() => null, (e) => e),
      v.deleteSnapshot(patientId, przed.snapshots[1].snapshotId, opcje).then(() => null, (e) => e),
    ]);
    bledy.forEach((b) => { expect(b && b.vildaSaveBusy, 'przerwane po limicie').toBe(true); });
    expect(czekal).toBe(3);

    const po = await v.getPatient(patientId);
    expect(po.snapshots.map((s) => s.snapshotId), 'żadna wersja nie zniknęła').toEqual(przed.snapshots.map((s) => s.snapshotId));
    expect(wzrost(po.snapshots[0], 66), 'wzrost bez zmian').toBe(wzrost(przed.snapshots[0], 66));
    expect(wieki(po.snapshots[0]), 'pomiary bez zmian').toEqual(wieki(przed.snapshots[0]));

    odpowiedz.rozwiaz('scal');
    await zapisA;
    await v.updateMeasurementRow(patientId, { uid: 'm-66' }, { height: 150 }, opcje);
    expect(wzrost((await v.getPatient(patientId)).snapshots[0], 66), 'ponowna edycja po zwolnieniu').toBe(150);
  });

  it('sejf zablokowany albo brak patientId: od razu ten sam błąd co dotąd, bez czekania na blokadę', async () => {
    const { v, patientId, zapisA, odpowiedz } = await pytanieBramyOtwarte({ locks: atrapaLocks() });
    let czekal = 0;
    const blad = await v.updateMeasurementRow('', { uid: 'm-66' }, { height: 150 }, { onLockWait: () => { czekal += 1; } })
      .then(() => null, (e) => e);
    expect(blad && blad.message).toMatch(/brak patientId/);
    expect(blad.vildaSaveBusy).toBeUndefined();
    expect(czekal).toBe(0);
    odpowiedz.rozwiaz('scal');
    await zapisA;
    expect((await v.getPatient(patientId)).snapshots).toHaveLength(3);
  });
});
