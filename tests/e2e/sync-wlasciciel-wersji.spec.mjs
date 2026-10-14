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
//
// Własne, fikcyjne konto sejfu w efemerycznym profilu przeglądarki; dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#SyncWlasciciel!26aa';

test('scalanie synchronizacji nie zabiera wersji spod innej karty bez porównania (IndexedDB, Web Locks)', async ({ page }) => {
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
