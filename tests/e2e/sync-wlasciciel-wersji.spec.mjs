import { expect, test } from '@playwright/test';

// P-SYNC-WLASCICIEL — właściciel wersji w scalaniu synchronizacji na prawdziwym IndexedDB i prawdziwych Web Locks.
//
// Testy jednostkowe (tests/unit/sync-wlasciciel-wersji.test.mjs) idą na magazynie w pamięci. Tu ta sama droga
// (mergeSyncPayload) w przeglądarce, z adapterem IndexedDB (odczyt wersji po kluczu, getSnapshotForUser) i fazą
// przeniesień pod dwiema blokadami Web Locks:
//   1. „Scal pacjentów” X → Y, potem ładunek drugiego urządzenia, które o scaleniu nie wie i zapisało x3 w X:
//      X wraca tylko z x3, x1 i x2 zostają pod Y (tam nowsza rewizja). Na kodzie sprzed zmiany: X 3/3, Y licznik 5
//      przy 3 wersjach;
//   2. ładunek z poprawioną x1 (nowsza rewizja) pod X: x1 przechodzi spod Y pod X z poprawioną treścią, liczniki obu
//      kart = liczba ich wersji. Na kodzie sprzed zmiany licznik Y zostawał 5 przy 4 wersjach.
// Drugi test: delty na żywo po „Scal pacjentów” X → Y na innym urządzeniu — delta karty Y (wersje X w nowszej rewizji,
// bez nagrobków), potem osobno delta nagrobka X. Ostatnia wersja X przechodzi pod Y, a pusta X znika (usunięcie
// karty w IndexedDB kasuje wersje po indeksie karty — przeniesiona wersja jest już pod Y). Na 88f558c: Y 4/4, x2
// usunięta razem z X.
// Trzeci test (uwaga przeglądu końcowego do 4270ca1): przypięta wersja X i delta nagrobka z kartą Y — opis niżej.
// Czwarty test (uwagi recenzentów do dd21d11): łańcuch „Scal pacjentów” X → Y → Z i poprawka x1 z drugiego urządzenia.
// Piąty test (przegląd końcowy do 69e41d1): ten sam łańcuch i poprawka bieżącego pomiaru X (głowy) z nową chwilą zapisu,
// jak okno „Edytuj pomiar” — bieżącą wersją Z zostaje głowa scalenia.
//
// Własne, fikcyjne konto sejfu w efemerycznym profilu przeglądarki; dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#SyncWlasciciel!26aa';

async function otworzSejf(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.waitForTimeout(1200); // kaskady odtwarzania po starcie strony
}

test('scalanie synchronizacji nie zabiera wersji spod innej karty bez porównania (IndexedDB, Web Locks)', async ({ page }) => {
  await otworzSejf(page);
  const wynik = await page.evaluate(async () => {
    const V = window.VildaVault;
    const czekaj = (ms) => new Promise((r) => { setTimeout(r, ms); });
    const pomiar = (m) => ({ uid: `m-${m}`, ageMonths: m, ageYears: m / 12, height: 90 + m / 2, weight: 12 + m / 6 });
    const rekord = (wieki) => ({
      name: 'Testowy Jan',
      user: { lastName: 'Testowy', firstName: 'Jan', sex: 'M', age: 5, ageMonths: 6, height: 110, weight: 19 },
      advanced: { data: { measurements: wieki.map(pomiar) } },
    });
    const zapisz = (wieki, patientId) => V.savePatient(rekord(wieki), patientId ? { patientId, dedup: false } : { dedup: false });
    const kopia = (x) => JSON.parse(JSON.stringify(x));
    const x = await zapisz([60]); await czekaj(5); const x2 = await zapisz([60, 66], x.patientId);
    await czekaj(5);
    const y = await zapisz([60]); await czekaj(5); await zapisz([60, 66], y.patientId);
    const X = x.patientId, Y = y.patientId, x1 = x.snapshotId;
    const p0 = kopia(await V.exportSyncPayload());
    await czekaj(5);
    await V.mergePatients(X, Y);
    await czekaj(5);
    const stan = async () => {
      const lista = await V.listPatients(), o = {};
      for (const [nazwa, id] of [['X', X], ['Y', Y]]) {
        const e = lista.find((p) => p.patientId === id);
        const p = e ? await V.getPatient(id) : null;
        o[nazwa] = e ? { licznik: e.snapshotCount, wersje: p.snapshots.map((s) => s.snapshotId).sort() } : null;
      }
      return o;
    };
    // 1. Ładunek drugiego urządzenia: stan sprzed scalenia + nowa wersja x3 w X (nagrobek X przegrywa).
    const teraz = new Date().toISOString();
    const lad1 = kopia(p0);
    const kartaX = lad1.patients.find((p) => p.patientId === X);
    const x3 = `e2e-x3-${Math.random().toString(36).slice(2)}`;
    kartaX.snapshots.push({ snapshotId: x3, savedAtISO: teraz, rev: 0, updatedAtISO: null, payload: rekord([60, 66, 72]) });
    kartaX.lastSavedAtISO = teraz;
    kartaX.snapshotCount = 3;
    await V.mergeSyncPayload(lad1);
    const po1 = await stan();
    // 2. Ładunek z poprawioną x1 (rev 5) pod X — nowszy rekord przenosi x1 spod Y.
    await czekaj(5);
    const lad2 = kopia(await V.exportSyncPayload());
    const kY = lad2.patients.find((p) => p.patientId === Y), kX = lad2.patients.find((p) => p.patientId === X);
    const s1 = kY.snapshots.find((s) => s.snapshotId === x1);
    kY.snapshots = kY.snapshots.filter((s) => s.snapshotId !== x1);
    kX.snapshots.push(Object.assign({}, s1, { rev: 5, updatedAtISO: new Date().toISOString(), payload: rekord([61]) }));
    await V.mergeSyncPayload(lad2);
    const po2 = await stan();
    const wx1 = (await V.getPatient(X)).snapshots.find((s) => s.snapshotId === x1);
    return {
      X, Y, x1, x2: x2.snapshotId, x3, po1, po2,
      x1Wieki: wx1 ? wx1.payload.advanced.data.measurements.map((m) => m.ageMonths) : null,
      locks: Boolean(navigator.locks && typeof navigator.locks.request === 'function'),
    };
  });

  expect(wynik.locks, 'prawdziwe Web Locks').toBe(true);
  expect(wynik.po1.X).toEqual({ licznik: 1, wersje: [wynik.x3] });
  expect(wynik.po1.Y.licznik).toBe(5);
  expect(wynik.po1.Y.wersje).toHaveLength(5);
  expect(wynik.po1.Y.wersje).toEqual(expect.arrayContaining([wynik.x1, wynik.x2]));

  expect(wynik.po2.X).toEqual({ licznik: 2, wersje: [wynik.x1, wynik.x3].sort() });
  expect(wynik.po2.Y.licznik).toBe(4);
  expect(wynik.po2.Y.wersje).toHaveLength(4);
  expect(wynik.po2.Y.wersje).not.toContain(wynik.x1);
  expect(wynik.x1Wieki, 'treść poprawki z ładunku').toEqual([61]);
});

test('delta karty celu „Scal pacjentów”, potem osobna delta nagrobka: żadna wersja scalonej karty nie ginie (IndexedDB)', async ({ page }) => {
  await otworzSejf(page);
  const wynik = await page.evaluate(async () => {
    const V = window.VildaVault;
    const czekaj = (ms) => new Promise((r) => { setTimeout(r, ms); });
    const pomiar = (m) => ({ uid: `m-${m}`, ageMonths: m, ageYears: m / 12, height: 90 + m / 2, weight: 12 + m / 6 });
    const rekord = (wieki) => ({
      name: 'Testowy Jan',
      user: { lastName: 'Testowy', firstName: 'Jan', sex: 'M', age: 5, ageMonths: 6, height: 110, weight: 19 },
      advanced: { data: { measurements: wieki.map(pomiar) } },
    });
    const zapisz = (wieki, patientId) => V.savePatient(rekord(wieki), patientId ? { patientId, dedup: false } : { dedup: false });
    const kopia = (x) => JSON.parse(JSON.stringify(x));
    const x = await zapisz([60]); await czekaj(5); const x2 = await zapisz([60, 66], x.patientId);
    await czekaj(5);
    const y = await zapisz([60]); await czekaj(5); await zapisz([60, 66], y.patientId);
    const X = x.patientId, Y = y.patientId;
    const p0 = kopia(await V.exportSyncPayload());
    await czekaj(5);
    // Delta karty Y z urządzenia, które zrobiło „Scal pacjentów” X → Y: wersje X pod Y w rewizji podbitej przy scaleniu,
    // nowa wersja ym, bez nagrobków (jak buildPatientDelta).
    const teraz = new Date().toISOString();
    const kX = p0.patients.find((p) => p.patientId === X), kY = kopia(p0.patients.find((p) => p.patientId === Y));
    kX.snapshots.forEach((s) => { kY.snapshots.push(Object.assign({}, s, { rev: (s.rev || 0) + 1 })); });
    const ym = `e2e-ym-${Math.random().toString(36).slice(2)}`;
    kY.snapshots.push({ snapshotId: ym, savedAtISO: teraz, rev: 0, updatedAtISO: null, payload: rekord([60, 66]) });
    kY.lastSavedAtISO = teraz;
    kY.snapshotCount = kY.snapshots.length;
    await V.mergeSyncPayload({ schemaVersion: p0.schemaVersion, patients: [kY], tombstones: [] });
    await czekaj(5);
    // Potem osobna delta nagrobka X (jak buildTombstoneDelta).
    await V.mergeSyncPayload({ schemaVersion: p0.schemaVersion, patients: [], tombstones: [{ patientId: X, deletedAtISO: new Date().toISOString() }] });
    const lista = await V.listPatients();
    const eY = lista.find((p) => p.patientId === Y);
    const pY = await V.getPatient(Y);
    return {
      x1: x.snapshotId, x2: x2.snapshotId, ym,
      jestX: lista.some((p) => p.patientId === X),
      licznikY: eY ? eY.snapshotCount : null,
      wersjeY: pY ? pY.snapshots.map((s) => s.snapshotId) : [],
    };
  });

  expect(wynik.jestX, 'karta X znika (nagrobek)').toBe(false);
  expect(wynik.wersjeY).toHaveLength(5);
  expect(wynik.wersjeY).toEqual(expect.arrayContaining([wynik.x1, wynik.x2, wynik.ym]));
  expect(wynik.licznikY).toBe(5);
});

// Uwaga przeglądu końcowego do 4270ca1: na tym urządzeniu (B) przypięcie najnowszej wersji x2 karty X — zwykła
// operacja historii wersji, bez zmiany chwili zapisu karty — a w tym czasie na A „Scal pacjentów” X → Y. B dostaje
// deltę karty Y, potem deltę nagrobka X. Od tej zmiany delta nagrobka z urządzenia scalającego niesie też kartę Y
// (buildTombstoneDelta): X jest wtedy w zbiorze N, a przypięta x2 przechodzi pod Y z przypięciem. Na 4270ca1 (delta
// nagrobka bez karty) x2 zostawała przy X i znikała razem z nią — wersjeY 4, x2 ani w Y, ani w koszu. Na końcu ta sama
// strona wykonuje prawdziwe „Scal pacjentów” P → Q na IndexedDB i sprawdza, że jej delta nagrobka P niesie kartę Q.
test('przypięta x2 w X, delta Y, potem delta nagrobka X z kartą Y: x2 pod Y z przypięciem; nadawca dołącza kartę celu (IndexedDB)', async ({ page }) => {
  await otworzSejf(page);
  const wynik = await page.evaluate(async () => {
    const V = window.VildaVault;
    const czekaj = (ms) => new Promise((r) => { setTimeout(r, ms); });
    const pomiar = (m) => ({ uid: `m-${m}`, ageMonths: m, ageYears: m / 12, height: 90 + m / 2, weight: 12 + m / 6 });
    const rekord = (wieki) => ({
      name: 'Testowy Jan',
      user: { lastName: 'Testowy', firstName: 'Jan', sex: 'M', age: 5, ageMonths: 6, height: 110, weight: 19 },
      advanced: { data: { measurements: wieki.map(pomiar) } },
    });
    const zapisz = (wieki, patientId) => V.savePatient(rekord(wieki), patientId ? { patientId, dedup: false } : { dedup: false });
    const kopia = (x) => JSON.parse(JSON.stringify(x));
    const x = await zapisz([60]); await czekaj(5); const x2 = await zapisz([60, 66], x.patientId);
    await czekaj(5);
    const y = await zapisz([60]); await czekaj(5); await zapisz([60, 66], y.patientId);
    const X = x.patientId, Y = y.patientId;
    const p0 = kopia(await V.exportSyncPayload());
    await czekaj(5);
    await V.setSnapshotPinned(X, x2.snapshotId, true);
    await czekaj(5);
    // Delty urządzenia A po „Scal pacjentów” X → Y: karta Y (wersje X w rewizji podbitej przy scaleniu, nowa ym), potem
    // nagrobek X razem z kartą Y (jak buildTombstoneDelta po scaleniu).
    const teraz = new Date().toISOString();
    const kX = p0.patients.find((p) => p.patientId === X), kY = kopia(p0.patients.find((p) => p.patientId === Y));
    kX.snapshots.forEach((s) => { kY.snapshots.push(Object.assign({}, s, { rev: (s.rev || 0) + 1 })); });
    const ym = `e2e-ym-${Math.random().toString(36).slice(2)}`;
    kY.snapshots.push({ snapshotId: ym, savedAtISO: teraz, rev: 0, updatedAtISO: null, payload: rekord([60, 66]) });
    kY.lastSavedAtISO = teraz;
    kY.snapshotCount = kY.snapshots.length;
    await V.mergeSyncPayload({ schemaVersion: p0.schemaVersion, patients: [kopia(kY)], tombstones: [] });
    await czekaj(5);
    const r2 = await V.mergeSyncPayload({ schemaVersion: p0.schemaVersion, patients: [kopia(kY)], tombstones: [{ patientId: X, deletedAtISO: new Date().toISOString() }] });
    const lista = await V.listPatients();
    const pY = await V.getPatient(Y);
    const sx2 = pY ? pY.snapshots.find((s) => s.snapshotId === x2.snapshotId) : null;
    const kosz = await V.listTrashedSnapshots();
    // Nadawca: prawdziwe „Scal pacjentów” P → Q i delta nagrobka P.
    const pp = await zapisz([48]); await czekaj(5);
    const qq = await zapisz([50]);
    await V.mergePatients(pp.patientId, qq.patientId);
    const z = await V.buildTombstoneDelta(pp.patientId);
    const d = await V.decryptPayloadForCurrentUser(z.iv, z.data);
    return {
      jestX: lista.some((p) => p.patientId === X),
      wersjeY: pY ? pY.snapshots.map((s) => s.snapshotId) : [],
      licznikY: (lista.find((p) => p.patientId === Y) || {}).snapshotCount,
      x2wY: Boolean(sx2), x2Przypieta: Boolean(sx2 && sx2.payload && sx2.payload._pinned),
      x2wKoszu: kosz.some((e) => e.snapshotId === x2.snapshotId),
      x1: x.snapshotId, ym, deletedPatientCount: r2.deletedPatientCount,
      deltaNagrobka: { karty: d.patients.map((p) => p.patientId), nagrobki: d.tombstones.map((t) => t.patientId), Q: qq.patientId, P: pp.patientId },
    };
  });

  expect(wynik.jestX, 'karta X znika (nagrobek)').toBe(false);
  expect(wynik.wersjeY).toHaveLength(5);
  expect(wynik.wersjeY).toEqual(expect.arrayContaining([wynik.x1, wynik.ym]));
  expect(wynik.x2wY, 'przypięta x2 pod Y').toBe(true);
  expect(wynik.x2Przypieta, 'przypięcie z tego urządzenia zachowane').toBe(true);
  expect(wynik.x2wKoszu).toBe(false);
  expect(wynik.licznikY).toBe(5);
  expect(wynik.deletedPatientCount).toBe(1);
  expect(wynik.deltaNagrobka.karty).toEqual([wynik.deltaNagrobka.Q]);
  expect(wynik.deltaNagrobka.nagrobki).toEqual([wynik.deltaNagrobka.P]);
});

// Uwagi recenzentów do dd21d11: „Scal pacjentów” X → Y, potem Y → Z na tym urządzeniu (x1 pod Z z rev 2, treść bez
// zmian), a z drugiego urządzenia, które o scaleniach nie wiedziało, przychodzi karta X z poprawioną x1 (rev 1, nowa
// chwila zapisu, późniejsza chwila zmiany). Rekord x1 pod Z jest nowszy (rev 2), więc x1 zostaje pod Z, ale jego treść
// jest starsza: faza przeniesień, pod blokadami Web Locks obu kart, wpisuje do x1 pod Z poprawkę z ładunku (decyzja
// „treść”, Bsw_poprawTresc; odczyt wersji po kluczu w IndexedDB). Na dd21d11 x1 zostawał z 60 mies. (poprawka ginęła).
// Przegląd końcowy do 69e41d1: x1 z chwilą zapisu poprawki (późniejszą niż głowa scalenia) stawała się bieżącą wersją
// Z; teraz chwila zapisu x1 pod Z bez zmian (Z wygrała przypisanie), bieżąca wersja Z = głowa scalenia.
test('łańcuch „Scal pacjentów” X → Y → Z, poprawka x1 w X z drugiego urządzenia: x1 pod Z z poprawką (IndexedDB)', async ({ page }) => {
  await otworzSejf(page);
  const wynik = await page.evaluate(async () => {
    const V = window.VildaVault;
    const czekaj = (ms) => new Promise((r) => { setTimeout(r, ms); });
    const pomiar = (m) => ({ uid: `m-${m}`, ageMonths: m, ageYears: m / 12, height: 90 + m / 2, weight: 12 + m / 6 });
    const rekord = (wieki) => ({
      name: 'Testowy Jan',
      user: { lastName: 'Testowy', firstName: 'Jan', sex: 'M', age: 5, ageMonths: 6, height: 110, weight: 19 },
      advanced: { data: { measurements: wieki.map(pomiar) } },
    });
    const zapisz = (wieki, patientId) => V.savePatient(rekord(wieki), patientId ? { patientId, dedup: false } : { dedup: false });
    const kopia = (x) => JSON.parse(JSON.stringify(x));
    const karta = async () => { const a = await zapisz([60]); await czekaj(5); await zapisz([60, 66], a.patientId); await czekaj(5); return a; };
    const x = await karta(), y = await karta(), z = await karta();
    const X = x.patientId, Y = y.patientId, Z = z.patientId, x1 = x.snapshotId;
    const p0 = kopia(await V.exportSyncPayload());
    await V.mergePatients(X, Y);
    await czekaj(5);
    const zm = (await V.mergePatients(Y, Z)).snapshotId;
    const x1Przed = (await V.getPatient(Z)).snapshots.find((s) => s.snapshotId === x1);
    await czekaj(5);
    // Delta karty X z drugiego urządzenia: x1 poprawiona (61 mies.) z nową chwilą zapisu.
    const teraz = new Date().toISOString();
    const kX = kopia(p0.patients.find((p) => p.patientId === X));
    kX.snapshots = kX.snapshots.map((s) => (s.snapshotId === x1
      ? Object.assign({}, s, { rev: 1, updatedAtISO: teraz, savedAtISO: teraz, payload: rekord([61]) }) : s));
    kX.lastSavedAtISO = teraz;
    const wynikScalania = await V.mergeSyncPayload({ schemaVersion: p0.schemaVersion, patients: [kX], tombstones: [] });
    const lista = await V.listPatients();
    const pZ = await V.getPatient(Z);
    const s1 = pZ.snapshots.find((s) => s.snapshotId === x1);
    return {
      jestX: lista.some((p) => p.patientId === X),
      licznikZ: (lista.find((p) => p.patientId === Z) || {}).snapshotCount,
      wersjeZ: pZ.snapshots.length,
      x1Wieki: s1 ? s1.payload.advanced.data.measurements.map((m) => m.ageMonths) : null,
      x1Rev: s1 ? s1.rev : null,
      x1ZapisBezZmian: Boolean(s1 && s1.savedAtISO === x1Przed.savedAtISO),
      glowaZ: pZ.snapshots[0].snapshotId === zm && (await V.getLatestSnapshot(Z)).snapshotId === zm,
      dodaneKarty: wynikScalania.addedPatientCount,
      locks: Boolean(navigator.locks && typeof navigator.locks.request === 'function'),
    };
  });

  expect(wynik.locks, 'prawdziwe Web Locks').toBe(true);
  expect(wynik.jestX, 'karta X nie wraca (x1 zostaje pod Z — nowszy rekord)').toBe(false);
  expect(wynik.x1Wieki, 'treść poprawki z drugiego urządzenia').toEqual([61]);
  expect(wynik.x1Rev, 'rev wyższa z dwóch').toBe(2);
  expect(wynik.x1ZapisBezZmian, 'chwila zapisu x1 pod Z (miejsce w historii) bez zmian').toBe(true);
  expect(wynik.glowaZ, 'bieżąca wersja Z = głowa scalenia').toBe(true);
  // Z: z1, z2, zm + wersje Y po pierwszym scaleniu (y1, y2, x1, x2, ym)
  expect(wynik.wersjeZ).toBe(8);
  expect(wynik.licznikZ).toBe(8);
  expect(wynik.dodaneKarty).toBe(0);
});

// Przegląd końcowy do 69e41d1 (waga wysoka): trzy duplikaty X [60, 66], Y [72, 78], Z [84, 90]; „Scal pacjentów”
// X → Y, potem Y → Z — głowa Z ma 6 pomiarów. Z drugiego urządzenia, które o scaleniach nie wiedziało, przychodzi karta
// X z poprawionym bieżącym pomiarem (głowa x2: 66 mies. 123 → 124 cm, rev 1, nowa chwila zapisu — jak okno „Edytuj
// pomiar”). x2 zostaje pod Z (rekord pod Z nowszy: rev 2), przyjmuje treść poprawki (decyzja „treść”, faza przeniesień
// pod blokadami Web Locks), ale nie jej chwilę zapisu. Na 69e41d1 x2 stawała się bieżącą wersją Z („60:120,66:124” —
// bez pomiarów Y i Z).
test('łańcuch „Scal pacjentów” X → Y → Z, poprawka bieżącego pomiaru X z drugiego urządzenia: bieżąca wersja Z = głowa scalenia (IndexedDB)', async ({ page }) => {
  await otworzSejf(page);
  const wynik = await page.evaluate(async () => {
    const V = window.VildaVault;
    const czekaj = (ms) => new Promise((r) => { setTimeout(r, ms); });
    const pomiar = (m) => ({ uid: `m-${m}`, ageMonths: m, ageYears: m / 12, height: 90 + m / 2, weight: 12 + m / 6 });
    const rekord = (wieki) => ({
      name: 'Testowy Jan',
      user: { lastName: 'Testowy', firstName: 'Jan', sex: 'M', age: 5, ageMonths: 6, height: 110, weight: 19 },
      advanced: { data: { measurements: wieki.map(pomiar) } },
    });
    const zapisz = (wieki, patientId) => V.savePatient(rekord(wieki), patientId ? { patientId, dedup: false } : { dedup: false });
    const kopia = (x) => JSON.parse(JSON.stringify(x));
    const karta = async (a, b) => {
      const p = await zapisz([a]); await czekaj(5);
      const q = await zapisz([a, b], p.patientId); await czekaj(5);
      return { id: p.patientId, glowa: q.snapshotId };
    };
    const pomiary = (s) => s.payload.advanced.data.measurements.map((m) => `${m.ageMonths}:${m.height}`).join(',');
    const x = await karta(60, 66), y = await karta(72, 78), z = await karta(84, 90);
    const p0 = kopia(await V.exportSyncPayload());
    const x2Zapis = p0.patients.find((p) => p.patientId === x.id).snapshots.find((s) => s.snapshotId === x.glowa).savedAtISO;
    await V.mergePatients(x.id, y.id); await czekaj(5);
    const zm = (await V.mergePatients(y.id, z.id)).snapshotId; await czekaj(5);
    const przed = await V.getLatestSnapshot(z.id);
    const teraz = new Date().toISOString();
    const kX = kopia(p0.patients.find((p) => p.patientId === x.id));
    kX.snapshots = kX.snapshots.map((s) => {
      if (s.snapshotId !== x.glowa) return s;
      const pl = kopia(s.payload);
      pl.advanced.data.measurements[1].height = 124;
      return Object.assign({}, s, { rev: 1, updatedAtISO: teraz, savedAtISO: teraz, payload: pl });
    });
    kX.lastSavedAtISO = teraz;
    const wynikScalania = await V.mergeSyncPayload({ schemaVersion: p0.schemaVersion, patients: [kX], tombstones: [] });
    const po = await V.getLatestSnapshot(z.id);
    const pZ = await V.getPatient(z.id);
    const x2 = pZ.snapshots.find((s) => s.snapshotId === x.glowa);
    return {
      przed: pomiary(przed), po: pomiary(po), glowaPoToZm: po.snapshotId === zm, pierwszaToZm: pZ.snapshots[0].snapshotId === zm,
      x2: x2 ? pomiary(x2) : null, x2ZapisBezZmian: Boolean(x2 && x2.savedAtISO === x2Zapis),
      jestX: (await V.listPatients()).some((p) => p.patientId === x.id), dodaneKarty: wynikScalania.addedPatientCount,
    };
  });

  expect(wynik.przed).toBe('60:120,66:123,72:126,78:129,84:132,90:135');
  expect(wynik.po, 'bieżące pomiary Z bez zmian').toBe(wynik.przed);
  expect(wynik.glowaPoToZm, 'getLatestSnapshot(Z) = głowa scalenia').toBe(true);
  expect(wynik.pierwszaToZm, 'getPatient(Z).snapshots[0] = głowa scalenia').toBe(true);
  expect(wynik.x2, 'x2 pod Z z poprawką z drugiego urządzenia').toBe('60:120,66:124');
  expect(wynik.x2ZapisBezZmian, 'chwila zapisu x2 — miejsce w historii sprzed scaleń').toBe(true);
  expect(wynik.jestX).toBe(false);
  expect(wynik.dodaneKarty).toBe(0);
});

// Uwaga recenzji gałęzi 44ba49f7 (U2): po „Scal pacjentów” X → Y integracja wysyła prawie jednocześnie dwie delty przez
// navigator.sendBeacon — kartę Y (onPatientSaved) i nagrobek X (onPatientDeleted), który od P-SYNC-WLASCICIEL niesie
// też kartę Y (Bsw_deltaNagrobka), więc ma rozmiar delty Y. Chromium ogranicza ŁĄCZNY rozmiar ciał żądań keepalive
// w locie do 64 KiB: przy delcie Y ok. 30–60 tys. znaków i serwerze odpowiadającym z opóźnieniem drugi sendBeacon
// zwraca false, a integracja wyniku nie sprawdzała — nagrobek X nie wychodził na żywo, a zapis z otwartej karty X na
// innym urządzeniu wskrzeszał duplikat. [CZERWONY na 44ba49f7: serwer dostawał 1 deltę, drugi beacon false]. Po
// poprawce odrzucona delta idzie tym samym ciałem zwykłym fetch (strona żyje — to chwila zaraz po scaleniu).
// Serwer synchronizacji to trasa page.route na tym samym originie, z opóźnieniem odpowiedzi; materiał synchronizacji
// podmieniony (bez prawdziwego slotu). Dane FIKCYJNE.
test('„Scal pacjentów” z deltą Y 30–60 tys. znaków: serwer dostaje i deltę Y, i deltę nagrobka X z kartą Y (limit sendBeacon)', async ({ page }) => {
  test.setTimeout(120_000);
  const delty = [];
  await page.route(/\/__e2e_sync\//, async (r) => {
    const req = r.request();
    if (/\/delta$/.test(req.url()) && req.method() === 'POST') delty.push((req.postDataBuffer() || Buffer.alloc(0)).toString('utf8'));
    await new Promise((res) => { setTimeout(res, 400); });
    await r.fulfill({ status: 503, body: 'e2e' });
  });
  await page.addInitScript(() => {
    window.VILDA_SYNC_WORKER_URL = `${location.origin}/__e2e_sync`;
    window.__beacony = [];
    const oryg = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (u, d) {
      const r = oryg(u, d);
      window.__beacony.push({ rozmiar: d && (d.size || d.length), wynik: r });
      return r;
    };
  });
  await otworzSejf(page);
  const wynik = await page.evaluate(async () => {
    const V = window.VildaVault;
    const czekaj = (ms) => new Promise((r) => { setTimeout(r, ms); });
    const rekord = (n) => ({
      name: 'Testowy Jan',
      user: { lastName: 'Testowy', firstName: 'Jan', sex: 'M', age: 5, height: 110, weight: 19 },
      advanced: { data: { measurements: Array.from({ length: n }, (_, i) => ({ uid: `m-${i}`, ageMonths: 12 + i, ageYears: (12 + i) / 12, height: 70 + i / 2, weight: 9 + i / 6, note: 'pomiar kontrolny fikcyjny' })) } },
    });
    const x = await V.savePatient(rekord(2), { dedup: false });
    let y = null;
    for (let i = 0; i < 14; i += 1) { y = await V.savePatient(rekord(6 + i), y ? { patientId: y.patientId, dedup: false } : { dedup: false }); await czekaj(3); }
    const dY = await V.buildPatientDelta(y.patientId);
    Object.defineProperty(V, 'getSyncMaterial', { value: async () => ({ slotId: 'e2e-slot', authToken: 'e2e-token' }), configurable: true, writable: true });
    // Synchronizacja włączona dopiero teraz: zapisy wyżej nie wysyłały delt.
    window.__beacony.length = 0;
    window.localStorage.setItem('vilda-sync-enabled-v1', 'true');
    await V.mergePatients(x.patientId, y.patientId);
    await czekaj(3000);
    return { X: x.patientId, Y: y.patientId, dY: dY.data.length, beacony: window.__beacony.slice() };
  });
  expect(wynik.dY, 'delta Y w paśmie 30–60 tys. znaków (poniżej limitu delty karty integracji)').toBeGreaterThan(30_000);
  expect(wynik.dY).toBeLessThanOrEqual(60_000);
  await expect.poll(() => delty.length, { timeout: 10_000 }).toBe(2);
  // Kontrola: przypadek trafia w limit (drugi beacon odrzucony) — delta doszła drogą zapasową, a nie dzięki temu, że oba beacony się zmieściły.
  expect(wynik.beacony.map((b) => b.wynik).sort(), `beacony: ${JSON.stringify(wynik.beacony)}`).toEqual([false, true]);
  // Treść obu delt: odszyfrowana na tej stronie (ten sam klucz konta).
  const ladunki = await page.evaluate(async (ciala) => Promise.all(ciala.map(async (c) => {
    const { payload } = JSON.parse(c);
    const p = await window.VildaVault.decryptPayloadForCurrentUser(payload.iv, payload.data);
    return { karty: (p.patients || []).map((k) => k.patientId), nagrobki: (p.tombstones || []).map((t) => t.patientId) };
  })), delty);
  const nagrobek = ladunki.find((l) => l.nagrobki.includes(wynik.X));
  expect(nagrobek, `delta nagrobka X doszła do serwera (beacony: ${JSON.stringify(wynik.beacony)})`).toBeTruthy();
  expect(nagrobek.karty, 'delta nagrobka niesie kartę Y').toEqual([wynik.Y]);
  expect(ladunki.filter((l) => !l.nagrobki.length && l.karty.includes(wynik.Y)), 'delta karty Y doszła do serwera').toHaveLength(1);
});
