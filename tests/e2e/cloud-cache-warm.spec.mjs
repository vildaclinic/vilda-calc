import { expect, test } from '@playwright/test';

// WYŁĄCZNIK AWARYJNY trwałego cache (vilda_cloud_cache_warm.js, tryb kill-switch).
//
// Kontekst: „Opcja A” (warm start) włączała trwały cache danych, co na iPhone w trybie
// chmurowym zapisywało cały zaszyfrowany zbiór do IndexedDB „vilda-cloud-cache” → skok pamięci
// → crash WebKit i brak danych z chmury. Ten skrypt został przerobiony na WYŁĄCZNIK: wymusza
// wyłączenie bramki Je() (globalny flag=false + localStorage='0') i kasuje bazę cache — na KAŻDYM
// wejściu ładującym sejf, PRZED sejfem. Testy dowodzą, że:
//   • cache jest wyłączony (nawet gdy urządzenie miało wcześniej pref='1' — „zainfekowane”),
//   • w trybie chmurowym NIC już nie ląduje w „vilda-cloud-cache” (crash-causing zachowanie zgaszone),
//   • wyłącznik działa na wszystkich wejściach (app.html i pozostałych), nie tylko index.html.
//
// Sejf SYNTETYCZNY tworzony w kontenerze (nie dotyka danych użytkownika); niskie KDF_ITERATIONS.

const DURABLE_DB = 'vilda-cloud-cache';
const DURABLE_STORE = 'state';
const LS_KEY = 'vilda-persistent-cloud-cache-v1';

async function openIndexGuest(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem(
        'vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }),
      );
    } catch (_) {
      /* brak localStorage — pomiń */
    }
  });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page
    .getByRole('button', { name: 'Korzystaj bez logowania', exact: true })
    .click();
  await page.waitForFunction(
    () => !document.documentElement.classList.contains('vilda-auth-locked'),
  );
  await page.waitForFunction(
    () =>
      Boolean(window.VildaVault) &&
      Boolean(window.VildaCloudCacheWarm && window.VildaCloudCacheWarm.__init),
  );
}

// Symuluje „zainfekowane” urządzenie: pref='1' USTAWIONY zanim wczyta się wyłącznik.
async function preInfect(page) {
  await page.addInitScript((key) => {
    try {
      window.localStorage.setItem(key, '1');
    } catch (_) {
      /* pomiń */
    }
  }, LS_KEY);
}

async function unlockCloudOnlyVault(page) {
  return page.evaluate(async () => {
    const V = window.VildaVault;
    const u = await V.createUser('Haslo-Testowe-123', { iterations: 1, label: 'E2E' });
    await V.setStorageMode(u.userId, 'cloud-only');
    await V.unlockUser(u.userId, 'Haslo-Testowe-123');
    return { userId: u.userId, cloudOnly: V.isCloudOnlyMode() };
  });
}

async function savePatient(page) {
  return page.evaluate(async () => {
    const V = window.VildaVault;
    const res = await V.savePatient({
      name: 'Anna Testowa',
      user: { firstName: 'Anna', lastName: 'Testowa', age: 33, sex: 'K' },
    });
    return {
      patientId: res.patientId || res.id || (res.patient && res.patient.patientId),
    };
  });
}

// Zwraca liczbę rekordów w store „state” (0 gdy baza/store nie istnieje, -1 przy błędzie).
async function durableRecordCount(page) {
  return page.evaluate(
    ({ db, store }) =>
      new Promise((resolve) => {
        let settled = false;
        const done = (v) => {
          if (!settled) {
            settled = true;
            resolve(v);
          }
        };
        try {
          const req = indexedDB.open(db);
          req.onerror = () => done(-1);
          req.onsuccess = () => {
            const conn = req.result;
            try {
              if (!conn.objectStoreNames.contains(store)) {
                conn.close();
                done(0);
                return;
              }
              const tx = conn.transaction(store, 'readonly');
              const cnt = tx.objectStore(store).count();
              cnt.onsuccess = () => {
                done(cnt.result | 0);
                conn.close();
              };
              cnt.onerror = () => {
                done(-1);
                conn.close();
              };
            } catch (_) {
              done(-1);
              try {
                conn.close();
              } catch (__) {
                /* noop */
              }
            }
          };
        } catch (_) {
          done(-1);
        }
      }),
    { db: DURABLE_DB, store: DURABLE_STORE },
  );
}

test('kill-switch WYŁĄCZA trwały cache: flagi + API sejfu isPersistentCloudCacheEnabled()===false', async ({
  page,
}) => {
  await openIndexGuest(page);

  const marker = await page.evaluate(() => window.VildaCloudCacheWarm);
  expect(marker.__init).toBe(true);
  expect(marker.killswitch).toBe(true);
  expect(marker.enabled).toBe(false);
  expect(marker.dbDeleteRequested).toBe(true); // wyłącznik zażądał skasowania bazy cache

  // Oba źródła prawdy bramki Je() USTAWIONE NA WYŁĄCZONE.
  expect(await page.evaluate(() => window.VILDA_PERSISTENT_CLOUD_CACHE)).toBe(false);
  expect(await page.evaluate((k) => window.localStorage.getItem(k), LS_KEY)).toBe('0');

  // Sejf potwierdza własnym API: trwały cache jest WYŁĄCZONY.
  expect(
    await page.evaluate(() => window.VildaVault.isPersistentCloudCacheEnabled()),
  ).toBe(false);
});

test('kill-switch NADPISUJE wcześniejsze „1” (naprawa zainfekowanego urządzenia)', async ({
  page,
}) => {
  await preInfect(page); // urządzenie miało pref='1' (jak po feralnym deployu)
  await openIndexGuest(page);

  // Mimo startowego „1”, po wyłączniku jest „0” i sejf raportuje wyłączenie.
  expect(await page.evaluate((k) => window.localStorage.getItem(k), LS_KEY)).toBe('0');
  expect(await page.evaluate(() => window.VILDA_PERSISTENT_CLOUD_CACHE)).toBe(false);
  expect(
    await page.evaluate(() => window.VildaVault.isPersistentCloudCacheEnabled()),
  ).toBe(false);
});

test('tryb chmurowy: zapis pacjenta NIC nie zapisuje do „vilda-cloud-cache” (crash-causing ścieżka zgaszona)', async ({
  page,
}) => {
  await preInfect(page); // nawet na zainfekowanym urządzeniu…
  await openIndexGuest(page);
  const setup = await unlockCloudOnlyVault(page);
  expect(setup.cloudOnly).toBe(true);

  const saved = await savePatient(page);
  expect(saved.patientId && saved.patientId.length).toBeGreaterThan(0);

  // Warm start NIEMOŻLIWY (bramka wyłączona) i trwały store pusty — to jest dokładnie zniknięcie
  // zachowania, które zabijało proces strony na iPhonie.
  expect(
    await page.evaluate(() => window.VildaVault.canWarmStartCloudOnly()),
  ).toBe(false);
  await page.waitForTimeout(3500);
  expect(await durableRecordCount(page)).toBe(0);
});

// Wyłącznik MUSI działać na każdym wejściu ładującym sejf — bo PWA startuje z app.html,
// a nie z index.html.
for (const entry of ['app.html', 'terminarz.html', 'kalkulator-klirens.html', 'ustawienia.html']) {
  test(`kill-switch aktywny na wejściu „${entry}” (nie tylko index.html)`, async ({ page }) => {
    await preInfect(page);
    await page.goto(`/${entry}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () =>
        window.VildaCloudCacheWarm &&
        window.VildaCloudCacheWarm.__init &&
        window.VildaCloudCacheWarm.killswitch === true,
      { timeout: 20000 },
    );
    expect(await page.evaluate((k) => window.localStorage.getItem(k), LS_KEY)).toBe('0');
    expect(await page.evaluate(() => window.VILDA_PERSISTENT_CLOUD_CACHE)).toBe(false);
    await page.waitForFunction(() => Boolean(window.VildaVault), { timeout: 20000 });
    expect(
      await page.evaluate(() => window.VildaVault.isPersistentCloudCacheEnabled()),
    ).toBe(false);
  });
}
