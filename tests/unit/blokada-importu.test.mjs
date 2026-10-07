import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-BLOKADA-IMPORT (zlecenie właściciela 2026-10-07: przegląd „co dalej po #518”, punkt 4, część 2: A3, A5, A6, A9).
//
// Import karty z pliku (importPatientFromEnvelope), scalanie kopii konta (mergeVaultBackup), odtworzenie kopii konta
// (restoreVaultBackup) i migracja nazwisk (migratePatientNamesSplit) zmieniały rekord pacjenta bez blokady, którą biorą
// zapis, kosz, poprawki, usunięcie i scalanie synchronizacji. Mierzone na `audyt` 7ea4b54 (każdy przypadek niżej wtedy
// nie przechodził):
//   - import do istniejącej karty i zapis w innej karcie: licznik wersji o jeden za mały, „ostatni zapis” cofnięty (A3, E6);
//   - import wersji leżącej w koszu i scalanie synchronizacji w tym czasie: wersji nie było ani w karcie, ani w koszu,
//     a import zgłaszał jej dodanie (A3, E11);
//   - import przy otwartym pytaniu bramy w karcie INNEGO pacjenta (z wpisem w koszu): import stał 30 s, a notatki
//     z pliku przepadały po cichu (A3, E10);
//   - scalanie kopii konta i karta dochodząca w tym czasie z synchronizacji: licznik wersji nadpisany wartością z kopii
//     (A5); wersja z kopii leżąca w koszu znikała jak w E11 (A5);
//   - odtworzenie kopii konta: synchronizacja startowała (słuchacze odblokowania), zanim kopia była zapisana (A6);
//   - migracja nazwisk nadpisywała kartę zapisaną w trakcie rekordem sprzed zapisu (A9, E7).
//
// Prawdziwy vilda_vault.js na magazynie w pamięci z „pułapkami”; dwa tryby jak w blokada-usuwania-scalania.test.mjs
// (dwie karty na wspólnej atrapie Web Locks oraz jedna karta z kolejką strony). Dane wyłącznie FIKCYJNE.

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
  const haslo = `Blokada#Importu!2026${licznik}aa`;
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
  return { A, B, pulapka: wA.pulapka, baza, uid: u.userId, locks, haslo };
}

/* Inne urządzenie (inne konto): własny magazyn i hasło — jego kopię konta scala się hasłem tamtego konta. */
async function inneUrzadzenie() {
  licznik += 1;
  const v = okno(null);
  v.setStorageAdapter(v.createInMemoryAdapter());
  const haslo = `Blokada#Inne!2026${licznik}bb`;
  await v.createUser(haslo, { label: `inne${licznik}`, iterations: 10000 });
  return { v, haslo };
}

const pomiar = (ageMonths) => ({
  uid: `m-${ageMonths}`, ageMonths, ageYears: ageMonths / 12, height: 90 + ageMonths / 2, weight: 12 + ageMonths / 6,
});
const payload = (wieki, imie = 'Jan') => ({
  name: `Testowy ${imie}`,
  user: { lastName: 'Testowy', firstName: imie, sex: 'M', age: 5, ageMonths: 6, height: 110, weight: 19 },
  advanced: { data: { measurements: wieki.map(pomiar) } },
});

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

const idWersji = async (v, pid) => (await v.getPatient(pid)).snapshots.map((s) => s.snapshotId);
const wKoszu = async (v) => (await v.listTrashedSnapshots()).map((e) => e.snapshotId);

/* Wersja S z pliku (albo z kopii) leży w koszu; import wpisał ją już do karty i stoi przed zdjęciem jej nagrobka. W tym
   czasie druga karta scala ładunek bez kart (koniec scalania stosuje nagrobki z kosza). */
async function koszIScalanie(d, importuj) {
  let wpisana = false;
  d.pulapka('putSnapshotForUser', (_u, rek) => { if (rek && rek.snapshotId === d.S) wpisana = true; return false; });
  const p = d.pulapka('getUserMeta', () => wpisana);
  const imp = obserwuj(importuj());
  await p.osiagnieta;
  const scal = obserwuj(d.B.mergeSyncPayload({ schemaVersion: 1, patients: [], tombstones: [] }));
  await chwila(30);
  const scalCzekalo = !scal.koniec;
  p.zwolnij();
  await Promise.all([imp.obietnica, scal.obietnica]);
  return { imp, scal, scalCzekalo };
}

for (const [tryb, dwieKarty] of [['dwie karty, Web Locks', true], ['jedna karta, kolejka strony', false]]) {
  describe(`Import i kopie konta pod blokadą pacjenta — ${tryb}`, () => {
    it('import do istniejącej karty i zapis w innej karcie: zapis czeka, licznik wersji i ostatni zapis się zgadzają (A3)', async () => {
      const d = await urzadzenie(dwieKarty);
      const pid = await karta(d.A, [[60], [60, 66]]);
      const plik = await d.A.exportPatientEnvelope(pid);
      await chwila(5);
      await d.A.savePatient(payload([60, 66, 70]), { patientId: pid, dedup: false });

      // Import stoi tuż przed zapisem rekordu karty.
      const p = d.pulapka('putPatientForUser', (_u, rek) => rek && rek.patientId === pid);
      const imp = obserwuj(d.A.importPatientFromEnvelope(plik, d.haslo));
      await p.osiagnieta;
      await chwila(5);
      const zapis = obserwuj(d.B.savePatient(payload([60, 66, 70, 80]), { patientId: pid, dedup: false }));
      await chwila(30);
      expect(zapis.koniec, 'zapis czeka na koniec importu tej karty').toBe(false);

      p.zwolnij();
      await Promise.all([imp.obietnica, zapis.obietnica]);
      expect(imp.blad).toBeUndefined();
      expect(zapis.blad).toBeUndefined();
      const rek = await d.A.getPatient(pid);
      expect(rek.snapshots).toHaveLength(4);
      expect(rek.snapshotCount, 'licznik wersji w nagłówku').toBe(4);
      expect(rek.lastSavedAtISO, 'ostatni zapis to zapis z drugiej karty').toBe(zapis.wynik.savedAtISO);
      expect(rek.snapshots[0].snapshotId).toBe(zapis.wynik.snapshotId);
    });

    it('import wersji leżącej w koszu: scalanie w tym czasie czeka, a wersja zostaje w karcie i znika z kosza (A3)', async () => {
      const d = await urzadzenie(dwieKarty);
      const pid = await karta(d.A, [[60], [60, 66], [60, 66, 72]]);
      d.S = (await d.A.getPatient(pid)).snapshots[1].snapshotId;
      const plik = await d.A.exportPatientEnvelope(pid);
      await chwila(5);
      await d.A.moveSnapshotToTrash(pid, d.S);

      const { imp, scal, scalCzekalo } = await koszIScalanie(d, () => d.A.importPatientFromEnvelope(plik, d.haslo));
      expect(scalCzekalo, 'scalanie czeka na koniec importu tej karty').toBe(true);
      expect(imp.blad).toBeUndefined();
      expect(scal.blad).toBeUndefined();
      expect(imp.wynik.addedSnapshots).toBe(1);
      expect(await idWersji(d.A, pid), 'wersja z pliku jest w karcie').toContain(d.S);
      expect(await wKoszu(d.A), 'i nie ma jej w koszu').not.toContain(d.S);
    });

    it('scalanie kopii konta i karta dochodząca w tym czasie z synchronizacji: synchronizacja czeka, licznik wersji się zgadza (A5)', async () => {
      const d = await urzadzenie(dwieKarty);
      const inne = await inneUrzadzenie();
      const pid = await karta(inne.v, [[60], [60, 66]]);
      const kopia = await inne.v.exportVaultBackup();
      await chwila(5);
      await inne.v.savePatient(payload([60, 66, 72]), { patientId: pid, dedup: false });
      const ladunek = await inne.v.exportSyncPayload();

      // Scalanie kopii wpisuje nową dla tego urządzenia kartę i stoi przed zapisem jej rekordu.
      const p = d.pulapka('putPatientForUser', (_u, rek) => rek && rek.patientId === pid);
      const scalKopie = obserwuj(d.A.mergeVaultBackup(kopia, inne.haslo));
      await p.osiagnieta;
      const sync = obserwuj(d.B.mergeSyncPayload(ladunek));
      await chwila(30);
      expect(sync.koniec, 'synchronizacja czeka na koniec zapisu tej karty z kopii').toBe(false);

      p.zwolnij();
      await Promise.all([scalKopie.obietnica, sync.obietnica]);
      expect(scalKopie.blad).toBeUndefined();
      expect(sync.blad).toBeUndefined();
      expect(scalKopie.wynik.addedPatientCount).toBe(1);
      const rek = await d.A.getPatient(pid);
      expect(rek.snapshots).toHaveLength(3);
      expect(rek.snapshotCount, 'licznik wersji w nagłówku').toBe(3);
    });

    it('scalanie kopii konta z wersją leżącą w koszu: scalanie synchronizacji czeka, a wersja zostaje w karcie (A5)', async () => {
      const d = await urzadzenie(dwieKarty);
      const pid = await karta(d.A, [[60], [60, 66], [60, 66, 72]]);
      d.S = (await d.A.getPatient(pid)).snapshots[1].snapshotId;
      const kopia = await d.A.exportVaultBackup();
      await chwila(5);
      await d.A.moveSnapshotToTrash(pid, d.S);

      const { imp, scal, scalCzekalo } = await koszIScalanie(d, () => d.A.mergeVaultBackup(kopia, d.haslo));
      expect(scalCzekalo, 'scalanie czeka na koniec zapisu tej karty z kopii').toBe(true);
      expect(imp.blad).toBeUndefined();
      expect(scal.blad).toBeUndefined();
      expect(imp.wynik.addedSnapshotCount).toBe(1);
      expect(await idWersji(d.A, pid), 'wersja z kopii jest w karcie').toContain(d.S);
      expect(await wKoszu(d.A)).not.toContain(d.S);
    });

    it('migracja nazwisk nie nadpisuje karty zapisanej w trakcie: zapis czeka, licznik i ostatni zapis się zgadzają (A9)', async () => {
      const d = await urzadzenie(dwieKarty);
      const pid = await karta(d.A, [[60]], 'Legat');
      // Nagłówek sprzed podziału nazwiska (stary format: samo „name”).
      const rek0 = await d.baza.getPatientForUser(d.uid, pid);
      await d.baza.putPatientForUser(d.uid, Object.assign({}, rek0, {
        headerCipher: await d.A.encryptPayloadForCurrentUser({ name: 'Testowy Legat', sex: 'M' }),
      }));

      const p = d.pulapka('putPatientForUser', (_u, rek) => rek && rek.patientId === pid);
      const mig = obserwuj(d.A.migratePatientNamesSplit());
      await p.osiagnieta;
      const zapis = obserwuj(d.B.savePatient(payload([60, 66], 'Legat'), { patientId: pid, dedup: false }));
      await chwila(30);
      expect(zapis.koniec, 'zapis czeka na koniec migracji tej karty').toBe(false);

      p.zwolnij();
      await Promise.all([mig.obietnica, zapis.obietnica]);
      expect(mig.blad).toBeUndefined();
      expect(zapis.blad).toBeUndefined();
      expect(mig.wynik.migrated).toBe(1);
      const rek = await d.A.getPatient(pid);
      expect(rek.snapshots).toHaveLength(2);
      expect(rek.snapshotCount, 'licznik wersji w nagłówku').toBe(2);
      expect(rek.lastSavedAtISO, 'ostatni zapis to zapis z drugiej karty').toBe(zapis.wynik.savedAtISO);
      expect([rek.header.lastName, rek.header.firstName]).toEqual(['Testowy', 'Legat']);
    });
  });
}

describe('Import, kopie konta i blokady innych pacjentów (Web Locks)', () => {
  it('import przy otwartym pytaniu bramy innego pacjenta (z wpisem w koszu) kończy się od razu i przywraca notatkę (A3)', async () => {
    const d = await urzadzenie(true);
    const odpowiedz = odroczone();
    d.B.setSaveConflictResolver(() => odpowiedz.obietnica);
    const q = await karta(d.A, [[60, 66], [60, 66, 80], [60, 66, 80, 90]], 'Kuba');
    await d.A.moveSnapshotToTrash(q, (await d.A.getPatient(q)).snapshots[2].snapshotId);
    const pid = await karta(d.A, [[60]], 'Piotr');
    await d.A.savePatientNote({ patientId: pid, title: 'Morfologia', body: 'Bez odchyleń.', category: 'badanie' });
    const plik = await d.A.exportPatientEnvelope(pid);
    await d.A.removePatient(pid);

    // Karta B zapisuje Kubę i czeka na odpowiedź lekarza w pytaniu bramy — trzyma blokadę Kuby.
    const zapisB = obserwuj(d.B.savePatient(payload([60, 66, 74], 'Kuba'), {
      patientId: q, dedup: false, baselinePayload: payload([60, 66], 'Kuba'),
    }));
    await chwila(30);
    expect(zapisB.koniec, 'kontrola: karta B czeka na odpowiedź').toBe(false);

    const imp = obserwuj(d.A.importPatientFromEnvelope(plik, d.haslo));
    await Promise.race([imp.obietnica, chwila(3000)]);
    expect(imp.koniec, 'import nie czeka na blokadę innego pacjenta').toBe(true);
    expect(imp.blad).toBeUndefined();
    expect(imp.wynik.importedPatientNotes, 'notatka z pliku przywrócona').toBe(1);
    expect((await d.A.listPatientNotesForPatient(pid)).map((n) => n.title)).toEqual(['Morfologia']);

    odpowiedz.rozwiaz('scal');
    await zapisB.obietnica;
    expect(zapisB.blad).toBeUndefined();
  });

  it('import przy zajętej blokadzie tej karty: sygnał czekania, po limicie błąd vildaSaveBusy, karta bez zmian', async () => {
    const d = await urzadzenie(true);
    const pid = await karta(d.A, [[60], [60, 66]]);
    const plik = await d.A.exportPatientEnvelope(pid);
    await d.A.savePatient(payload([60, 66, 72]), { patientId: pid, dedup: false });
    const przed = await d.A.getPatient(pid);
    const zwolnij = odroczone();
    d.locks.request(`vilda-save-pat:${pid}`, () => zwolnij.obietnica);

    let czekal = 0;
    const imp = obserwuj(d.B.importPatientFromEnvelope(plik, d.haslo, { onLockWait: () => { czekal += 1; }, lockTimeoutMs: 60 }));
    await imp.obietnica;
    expect(czekal, 'sygnał „Czekam…”').toBe(1);
    expect(imp.blad && imp.blad.vildaSaveBusy, 'błąd zajętej blokady').toBe(true);
    const po = await d.A.getPatient(pid);
    expect(po.snapshots.map((s) => s.snapshotId)).toEqual(przed.snapshots.map((s) => s.snapshotId));
    expect(po.lastSavedAtISO).toBe(przed.lastSavedAtISO);
    zwolnij.rozwiaz();
  });

  it('migracja nazwisk przy zajętej blokadzie: pomija tę kartę i kończy się błędem (UI powtórzy ją przy następnym odblokowaniu), resztę migruje (A9)', async () => {
    const d = await urzadzenie(true);
    const zajety = await karta(d.A, [[60]], 'Legat');
    const wolny = await karta(d.A, [[30]], 'Olek');
    for (const [pid, name] of [[zajety, 'Testowy Legat'], [wolny, 'Probny Olek']]) {
      const rek0 = await d.baza.getPatientForUser(d.uid, pid);
      await d.baza.putPatientForUser(d.uid, Object.assign({}, rek0, {
        headerCipher: await d.A.encryptPayloadForCurrentUser({ name, sex: 'M' }),
      }));
    }
    const zwolnij = odroczone();
    d.locks.request(`vilda-save-pat:${zajety}`, () => zwolnij.obietnica);

    const mig = obserwuj(d.B.migratePatientNamesSplit({ lockTimeoutMs: 60 }));
    await mig.obietnica;
    expect(mig.blad && mig.blad.vildaSaveBusy, 'migracja zgłasza pominiętą kartę').toBe(true);
    expect((await d.A.getPatient(wolny)).header.lastName, 'wolna karta zmigrowana').toBe('Probny');
    expect((await d.A.getPatient(zajety)).header.lastName, 'zajęta karta jeszcze nie').toBeUndefined();

    zwolnij.rozwiaz();
    await chwila(5);
    expect(await d.B.migratePatientNamesSplit()).toMatchObject({ migrated: 1 });
    expect((await d.A.getPatient(zajety)).header.lastName, 'ponowienie migruje zajętą wcześniej kartę').toBe('Testowy');
  });

  it('odtworzenie kopii konta: słuchacze odblokowania (start synchronizacji) ruszają dopiero po zapisie całej kopii (A6)', async () => {
    const d = await urzadzenie(false);
    await karta(d.A, [[60], [60, 66]], 'Jan');
    await karta(d.A, [[30]], 'Ola');
    const kopia = await d.A.exportVaultBackup();

    const R = okno(null);
    const bazaR = R.createInMemoryAdapter();
    R.setStorageAdapter(bazaR);
    const widziane = [];
    // Odczyt magazynu w chwili wywołania słuchacza — to, co zobaczyłoby scalanie synchronizacji.
    R.onUnlock((ev) => { widziane.push(bazaR.listPatientsForUser(ev.userId)); });
    const w = await R.restoreVaultBackup(kopia, d.haslo);
    expect(w.patientCount).toBe(2);
    expect(widziane, 'słuchacze wywołani raz').toHaveLength(1);
    expect((await widziane[0]).length, 'w chwili startu synchronizacji obie karty są w magazynie').toBe(2);
  });
});

describe('Strażnik: pominięcie końca scalania kosza tylko w imporcie', () => {
  it('znacznik Bpb_IMPORT jest prywatny dla sejfu i przekazują go tylko import karty i scalanie kopii konta', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../../vilda_vault.js', import.meta.url), 'utf8');
    expect(src).toContain('const Bpb_IMPORT=Object.freeze({});');
    // Le z tym znacznikiem: wewnętrzne scalanie notatek w ns i danych konta w ss — i nic więcej.
    expect(src.match(/\},Bpb_IMPORT\)/g)).toHaveLength(2);
    const ns = src.slice(src.indexOf('async function ns('), src.indexOf('async function rs('));
    const ss = src.slice(src.indexOf('async function ss('));
    expect(ns).toContain('patientNoteTombstones:[]},Bpb_IMPORT)');
    expect(ss.slice(0, ss.indexOf('mergedPatientCount'))).toContain('},Bpb_IMPORT)');
    // Publiczne API nie wystawia znacznika.
    expect(src).not.toMatch(/:\s*Bpb_IMPORT\s*[,}]/);
  });
});
