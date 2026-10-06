import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-BLOKADA-USUWANIE (zlecenie właściciela 2026-10-06: przegląd „co dalej po #518”, punkt 4, część 1: A1, A2, A11, A13).
//
// Usunięcie pacjenta (removePatient) i scalanie duplikatów (mergePatients) zmieniały rekord pacjenta bez blokady,
// którą od P-ZAPISY-DWIE-KARTY biorą zapis, kosz, poprawki i scalanie synchronizacji. Mierzone na `audyt` c730011
// (każdy przypadek niżej wtedy nie przechodził):
//   - usunięcie w trakcie zapisu tej karty w innej karcie: pusta karta bez wersji i bez nagrobka, a zapis zgłaszał
//     sukces (A1, E1);
//   - pacjent usunięty w innej karcie w trakcie scalania synchronizacji wracał z ładunku sprzed usunięcia, obok
//     własnego nagrobka (A1, E4);
//   - ponowne usunięcie w trakcie scalania: koniec scalania zdejmował nowy nagrobek (A11, E8);
//   - zapis źródła w trakcie scalania duplikatów był kasowany razem ze źródłem (A2, E2), a poprawka pomiaru w karcie
//     docelowej znikała pod nową głową (A2, E9);
//   - zapis z jawnym id pacjenta, którego karta doszła w tym czasie z synchronizacji, nadpisywał licznik wersji
//     i datę założenia (A13).
//
// Prawdziwy vilda_vault.js na magazynie w pamięci z „pułapkami” (wybrane wywołanie magazynu czeka, aż test je
// zwolni). Dwa tryby: dwie karty jednego urządzenia (dwa okna na wspólnym magazynie i wspólnej atrapie Web Locks)
// oraz jedna karta bez Web Locks (sama kolejka strony). Dane wyłącznie FIKCYJNE.

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

/* Atrapa Web Locks: jedna blokada wyłączna na nazwę, kolejka FIFO, `ifAvailable` i `signal` (jak w
   tests/unit/scalanie-blokada.test.mjs). */
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

/* Pułapka wstrzymuje `ktore`-te wywołanie metody magazynu spełniające warunek (przed wykonaniem). */
function zPulapkami(adapter) {
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

function okno(locks) {
  const win = {
    crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: magazyn(), sessionStorage: magazyn(),
    setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
    addEventListener() {}, removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {}, hidden: false },
    AbortController,
  };
  if (locks) win.navigator = { locks };
  win.window = win; win.self = win; win.top = win;
  win.localStorage.setItem('vildaRetention', '0'); // retencja wyłączona: testy liczą wersje same
  loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_vault.js', win);
  return win.VildaVault;
}

let licznik = 0;
/* Urządzenie: karta A i karta B. Tryb „dwie karty”: dwa okna na wspólnym magazynie i wspólnych Web Locks.
   Tryb „kolejka strony”: jedno okno bez Web Locks (B to ta sama karta co A). Pułapki stawiamy w magazynie karty A. */
async function urzadzenie(dwieKarty) {
  licznik += 1;
  const locks = dwieKarty ? atrapaLocks() : null;
  const haslo = `Blokada#Usuwania!2026${licznik}aa`;
  const A = okno(locks);
  const baza = A.createInMemoryAdapter();
  const wA = zPulapkami(baza);
  A.setStorageAdapter(wA.owiniety);
  await A.createUser(haslo, { label: `dev${licznik}`, iterations: 10000 });
  let B = A;
  if (dwieKarty) {
    B = okno(locks);
    B.setStorageAdapter(baza);
    const [u] = await B.listUsers();
    await B.unlockUser(u.userId, haslo);
  }
  const [u] = await A.listUsers();
  return { A, B, pulapka: wA.pulapka, baza, uid: u.userId, locks };
}

/* Inne urządzenie: własny magazyn, kopia konta przez ładunek synchronizacji. */
async function inneUrzadzenie(zrodlo) {
  licznik += 1;
  const v = okno(null);
  v.setStorageAdapter(v.createInMemoryAdapter());
  await v.createUser(`Blokada#Inne!2026${licznik}bb`, { label: `inne${licznik}`, iterations: 10000 });
  if (zrodlo) await v.mergeSyncPayload(await zrodlo.exportSyncPayload());
  return v;
}

const pomiar = (ageMonths) => ({
  uid: `m-${ageMonths}`, ageMonths, ageYears: ageMonths / 12, height: 90 + ageMonths / 2, weight: 12 + ageMonths / 6,
});
const payload = (wieki, imie = 'Jan') => ({
  name: `Testowy ${imie}`,
  user: { lastName: 'Testowy', firstName: imie, sex: 'M', age: 5, ageMonths: 6, height: 110, weight: 19 },
  advanced: { data: { measurements: wieki.map(pomiar) } },
});
const pomiary = (snap) => ((((snap || {}).payload || {}).advanced || {}).data || {}).measurements || [];
const wzrost = (snap, ageMonths) => (pomiary(snap).find((m) => m.ageMonths === ageMonths) || {}).height;

async function karta(v, kolejne, imie = 'Jan') {
  const a = await v.savePatient(payload(kolejne[0], imie), { dedup: false });
  for (const w of kolejne.slice(1)) {
    await chwila(5);
    await v.savePatient(payload(w, imie), { patientId: a.patientId, dedup: false });
  }
  return a.patientId;
}

function obserwuj(p) {
  const o = { koniec: false, wynik: undefined, blad: undefined };
  o.obietnica = p.then((w) => { o.koniec = true; o.wynik = w; return w; }, (e) => { o.koniec = true; o.blad = e; return null; });
  return o;
}

/* Stan magazynu wprost (rekord, wersje, nagrobek pacjenta) — bez warstwy sejfu, która mogłaby coś ukryć. */
async function stan(d, pid) {
  const rek = await d.baza.getPatientForUser(d.uid, pid);
  const wersje = await d.baza.listSnapshotsForUser(d.uid, pid);
  const nagrobki = (await d.baza.listTombstonesForUser(d.uid)).filter((t) => t.patientId === pid);
  return {
    rekord: rek ? { snapshotCount: rek.snapshotCount, createdAtISO: rek.createdAtISO } : null,
    wersje: wersje.map((s) => s.snapshotId),
    nagrobki: nagrobki.map((t) => t.deletedAtISO),
  };
}

/* Ładunek z kartami w zadanej kolejności (scalanie idzie po kartach po kolei). */
function wKolejnosci(ladunek, ids) {
  const kopia = JSON.parse(JSON.stringify(ladunek));
  kopia.patients = ids.map((id) => kopia.patients.find((p) => p.patientId === id));
  return kopia;
}

for (const [tryb, dwieKarty] of [['dwie karty, Web Locks', true], ['jedna karta, kolejka strony', false]]) {
  describe(`Usuwanie i scalanie duplikatów pod blokadą pacjenta — ${tryb}`, () => {
    it('usunięcie czeka na zapis tej karty; potem karta znika w całości i zostaje nagrobek (A1)', async () => {
      const d = await urzadzenie(dwieKarty);
      const pid = await karta(d.A, [[60], [60, 66]]);

      // Zapis w karcie A zapisał już nową wersję i stoi tuż przed zapisem rekordu.
      const p = d.pulapka('putPatientForUser', (_u, rek) => rek && rek.patientId === pid);
      const zapis = obserwuj(d.A.savePatient(payload([60, 66, 72]), { patientId: pid, dedup: false }));
      await p.osiagnieta;

      const usun = obserwuj(d.B.removePatient(pid));
      await chwila(30);
      expect(usun.koniec, 'usunięcie czeka na koniec zapisu tego pacjenta').toBe(false);

      p.zwolnij();
      await Promise.all([zapis.obietnica, usun.obietnica]);
      expect(zapis.blad).toBeUndefined();
      expect(usun.blad).toBeUndefined();
      const s = await stan(d, pid);
      expect(s.rekord, 'bez pustej karty').toBeNull();
      expect(s.wersje).toEqual([]);
      expect(s.nagrobki, 'nagrobek usunięcia jest').toHaveLength(1);
    });

    it('pacjent usunięty w trakcie scalania synchronizacji nie wraca z ładunku sprzed usunięcia (A1)', async () => {
      const d = await urzadzenie(dwieKarty);
      const p1 = await karta(d.A, [[60], [60, 66]], 'Jan');
      const p2 = await karta(d.A, [[30], [30, 36]], 'Ola');
      const ladunek = wKolejnosci(await d.A.exportSyncPayload(), [p1, p2]); // stan chmury sprzed usunięcia
      await chwila(5);

      // Scalanie przeczytało nagrobki (start) i stoi przy pierwszej karcie, pod jej blokadą.
      const p = d.pulapka('getPatientForUser', (_u, id) => id === p1);
      const scal = obserwuj(d.A.mergeSyncPayload(ladunek));
      await p.osiagnieta;
      await d.B.removePatient(p2);
      p.zwolnij();
      await scal.obietnica;
      expect(scal.blad).toBeUndefined();

      const s = await stan(d, p2);
      expect(s.rekord, 'usunięta karta nie wróciła').toBeNull();
      expect(s.wersje).toEqual([]);
      expect(s.nagrobki, 'nagrobek zostaje').toHaveLength(1);
      expect((await d.A.listPatients()).map((x) => x.patientId)).not.toContain(p2);
    });

    it('ponowne usunięcie w trakcie scalania: koniec scalania nie zdejmuje nowego nagrobka (A11)', async () => {
      const d = await urzadzenie(dwieKarty);
      const x = await karta(d.A, [[60]], 'Jan');
      const y = await karta(d.A, [[30]], 'Ola');
      const inne = await inneUrzadzenie(d.A);
      await chwila(5);
      await d.A.removePatient(x); // pierwsze usunięcie (D1)
      await chwila(5);
      await inne.savePatient(payload([60, 66], 'Jan'), { patientId: x, dedup: false }); // inne urządzenie zapisało X później
      const ladunek = wKolejnosci(await inne.exportSyncPayload(), [x, y]);

      // Scalanie przywróciło X (zapis z innego urządzenia jest nowszy niż D1) i stoi przy karcie Y.
      const p = d.pulapka('getPatientForUser', (_u, id) => id === y);
      const scal = obserwuj(d.A.mergeSyncPayload(ladunek));
      await p.osiagnieta;
      expect(await d.A.getPatient(x), 'kontrola: X przywrócony z ładunku').not.toBeNull();
      await chwila(5);
      await d.B.removePatient(x); // ponowne usunięcie (D3), już po decyzji scalania
      const d3 = (await stan(d, x)).nagrobki[0];
      p.zwolnij();
      await scal.obietnica;
      expect(scal.blad).toBeUndefined();

      const s = await stan(d, x);
      expect(s.rekord).toBeNull();
      expect(s.nagrobki, 'nagrobek ponownego usunięcia zostaje').toEqual([d3]);
    });

    it('zapis źródła w trakcie scalania duplikatów czeka i nie ginie (A2)', async () => {
      const d = await urzadzenie(dwieKarty);
      const zrodlo = await karta(d.A, [[60], [60, 66]], 'Jan');
      const cel = await karta(d.A, [[60], [60, 72]], 'Jan');

      // Scalanie przeczytało wersje źródła i stoi przy przepinaniu pierwszej z nich.
      const p = d.pulapka('putSnapshotForUser', (_u, rek) => rek && rek.patientId === cel);
      const scal = obserwuj(d.A.mergePatients(zrodlo, cel));
      await p.osiagnieta;

      const zapis = obserwuj(d.B.savePatient(payload([60, 66, 80]), { patientId: zrodlo, dedup: false }));
      await chwila(30);
      expect(zapis.koniec, 'zapis źródła czeka na koniec scalania').toBe(false);

      p.zwolnij();
      await Promise.all([scal.obietnica, zapis.obietnica]);
      expect(scal.blad).toBeUndefined();
      expect((await stan(d, cel)).wersje, 'cel ma wersje obu kart i wersję scalenia').toHaveLength(5);
      // Co dzieje się z zapisem do karty usuniętej przez scalenie, rozstrzyga reguła zapisu po usunięciu (decyzja
      // właściciela, A13). Tu pilnujemy tylko jednego: zapis zgłoszony jako udany ma swoją wersję w magazynie.
      if (!zapis.blad) {
        expect((await stan(d, zapis.wynik.patientId)).wersje, 'zgłoszona wersja jest w magazynie').toContain(zapis.wynik.snapshotId);
      }
    });

    it('poprawka pomiaru w karcie docelowej w trakcie scalania duplikatów nie znika pod nową głową (A2)', async () => {
      const d = await urzadzenie(dwieKarty);
      const zrodlo = await karta(d.A, [[60], [60, 66]], 'Jan');
      const cel = await karta(d.A, [[60, 66], [60, 66, 72]], 'Jan');

      const p = d.pulapka('putSnapshotForUser', (_u, rek) => rek && rek.patientId === cel);
      const scal = obserwuj(d.A.mergePatients(zrodlo, cel));
      await p.osiagnieta;

      const edycja = obserwuj(d.B.updateMeasurementRow(cel, { uid: 'm-66' }, { height: 150 }));
      await chwila(30);
      expect(edycja.koniec, 'poprawka czeka na koniec scalania').toBe(false);

      p.zwolnij();
      await Promise.all([scal.obietnica, edycja.obietnica]);
      expect(scal.blad).toBeUndefined();
      expect(edycja.blad).toBeUndefined();
      const glowa = (await d.A.getPatient(cel)).snapshots[0];
      expect(wzrost(glowa, 66), 'poprawka jest w bieżącej wersji').toBe(150);
    });

    it('zapis z jawnym id pacjenta, którego karta dochodzi w tym czasie z synchronizacji, nie nadpisuje licznika ani daty założenia (A13)', async () => {
      const d = await urzadzenie(dwieKarty);
      const inne = await inneUrzadzenie(null);
      const pid = await karta(inne, [[60], [60, 66], [60, 66, 72]]);
      const zalozona = (await inne.getPatient(pid)).createdAtISO;
      const ladunek = await inne.exportSyncPayload();

      // Scalanie wpisuje nową dla tego urządzenia kartę (pod jej blokadą) i stoi przy pierwszej wersji.
      const p = d.pulapka('putSnapshotForUser', (_u, rek) => rek && rek.patientId === pid);
      const scal = obserwuj(d.A.mergeSyncPayload(ladunek));
      await p.osiagnieta;

      // Lista pacjentów tej karty jeszcze jej nie ma — zapis uznaje pacjenta za nowego i czeka na blokadę.
      const zapis = obserwuj(d.B.savePatient(payload([60, 66, 72, 80]), { patientId: pid, dedup: false }));
      await chwila(30);
      expect(zapis.koniec).toBe(false);

      p.zwolnij();
      await Promise.all([scal.obietnica, zapis.obietnica]);
      expect(scal.blad).toBeUndefined();
      expect(zapis.blad).toBeUndefined();
      expect(zapis.wynik.isNew, 'karta już istniała').toBe(false);
      const rek = await d.A.getPatient(pid);
      expect(rek.snapshots).toHaveLength(4);
      expect(rek.snapshotCount, 'licznik wersji w nagłówku').toBe(4);
      expect(rek.createdAtISO, 'data założenia karty z synchronizacji').toBe(zalozona);
    });
  });
}

describe('Zajęta blokada pacjenta przy usuwaniu i scalaniu duplikatów (Web Locks)', () => {
  it('usunięcie: sygnał czekania, po limicie błąd vildaSaveBusy, a karta zostaje nietknięta', async () => {
    const d = await urzadzenie(true);
    const pid = await karta(d.A, [[60], [60, 66]]);
    const zwolnij = odroczone();
    d.locks.request(`vilda-save-pat:${pid}`, () => zwolnij.obietnica); // np. otwarte pytanie bramy w innej karcie

    let czekal = 0;
    const usun = obserwuj(d.B.removePatient(pid, { onLockWait: () => { czekal += 1; }, lockTimeoutMs: 60 }));
    await usun.obietnica;
    expect(czekal, 'sygnał „Czekam…”').toBe(1);
    expect(usun.blad && usun.blad.vildaSaveBusy, 'błąd zajętej blokady').toBe(true);
    const s = await stan(d, pid);
    expect(s.rekord).not.toBeNull();
    expect(s.wersje).toHaveLength(2);
    expect(s.nagrobki).toEqual([]);

    zwolnij.rozwiaz();
    await chwila(5);
    await d.B.removePatient(pid);
    expect((await stan(d, pid)).rekord, 'po zwolnieniu usunięcie przechodzi').toBeNull();
  });

  it('scalanie duplikatów: po limicie błąd vildaSaveBusy, obie karty bez zmian', async () => {
    const d = await urzadzenie(true);
    const zrodlo = await karta(d.A, [[60], [60, 66]], 'Jan');
    const cel = await karta(d.A, [[60], [60, 72]], 'Jan');
    const zwolnij = odroczone();
    d.locks.request(`vilda-save-pat:${cel}`, () => zwolnij.obietnica);

    let czekal = 0;
    const scal = obserwuj(d.B.mergePatients(zrodlo, cel, { onLockWait: () => { czekal += 1; }, lockTimeoutMs: 60 }));
    await scal.obietnica;
    expect(czekal).toBe(1);
    expect(scal.blad && scal.blad.vildaSaveBusy).toBe(true);
    expect((await stan(d, zrodlo)).wersje, 'źródło nietknięte').toHaveLength(2);
    expect((await stan(d, cel)).wersje, 'cel nietknięty').toHaveLength(2);
    zwolnij.rozwiaz();
  });
});
