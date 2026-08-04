import { expect, test } from '@playwright/test';

// „Ciepły start” trybu chmurowego (vilda_cloud_cache_warm.js): włączenie uśpionego trwałego
// cache’u danych w sejfie, tak by po odblokowaniu w trybie chmurowym dane hydratowały się OD RAZU
// z IndexedDB (baza „vilda-cloud-cache”, store „state”), zamiast czekać na pełny syncPull.
//
// Kluczowy fakt architektury (ustalony w kodzie i potwierdzony empirycznie): trwały cache jest
// używany TYLKO w trybie chmurowym (cloud-only) i tylko gdy bramka Je() jest włączona. Dlatego
// test aktywuje tryb chmurowy PRZED odblokowaniem (jak realne konto chmurowe użytkownika),
// bo warstwa trwałości inicjalizuje się przy odblokowaniu.
//
// Sejf SYNTETYCZNY tworzony w kontenerze (nie dotyka danych użytkownika); niskie KDF_ITERATIONS
// dla szybkości. Wzorowane na tests/e2e/name-fix.spec.mjs.

const DURABLE_DB = 'vilda-cloud-cache';
const DURABLE_STORE = 'state';

async function openIndexGuest(page) {
  await page.addInitScript(() => {
    // Wyłącz bramkę regulaminu (modal), aby nie przechwytywała kliknięć — akceptacja fikcyjna,
    // wyłącznie na potrzeby testu; nie dotyka danych ani logiki sejfu.
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

// Tworzy syntetyczny sejf, ustawia tryb chmurowy PRZED odblokowaniem, odblokowuje.
async function unlockCloudOnlyVault(page) {
  return page.evaluate(async () => {
    const V = window.VildaVault;
    const u = await V.createUser('Haslo-Testowe-123', { iterations: 1, label: 'E2E' });
    // Tryb chmurowy w rejestrze PRZED odblokowaniem → przy odblokowaniu warstwa trwałości
    // inicjalizuje się w trybie chmurowym (dokładnie jak realne konto chmurowe).
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

// Zlicza rekordy w trwałym store cache’u „state”. Zwraca 0, gdy baza/store nie istnieje
// (np. gdy cache jest wyłączony i nigdy nie powstał). Zwraca -1 przy błędzie odczytu.
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

test('enabler włącza trwały cache: flagi + API sejfu isPersistentCloudCacheEnabled()', async ({
  page,
}) => {
  await openIndexGuest(page);

  // Marker skryptu: włączony, bez trafienia w opt-out.
  const marker = await page.evaluate(() => window.VildaCloudCacheWarm);
  expect(marker.__init).toBe(true);
  expect(marker.enabled).toBe(true);
  expect(marker.respectedOptOut).toBe(false);

  // Oba źródła prawdy bramki Je() ustawione.
  expect(await page.evaluate(() => window.VILDA_PERSISTENT_CLOUD_CACHE)).toBe(true);
  expect(
    await page.evaluate(() =>
      window.localStorage.getItem('vilda-persistent-cloud-cache-v1'),
    ),
  ).toBe('1');

  // Sejf zgadza się przez własne, publiczne API: trwały cache jest WŁĄCZONY.
  expect(
    await page.evaluate(() => window.VildaVault.isPersistentCloudCacheEnabled()),
  ).toBe(true);
});

test('WARM START (tryb chmurowy): zapis pacjenta trafia do trwałego cache’u → hydratacja bez czekania na pull', async ({
  page,
}) => {
  await openIndexGuest(page);
  const setup = await unlockCloudOnlyVault(page);
  expect(setup.cloudOnly).toBe(true);

  const saved = await savePatient(page);
  expect(saved.patientId && saved.patientId.length).toBeGreaterThan(0);

  // Warm-start możliwy: bramka włączona + tryb chmurowy + są dane pacjenta.
  await expect
    .poll(() => page.evaluate(() => window.VildaVault.canWarmStartCloudOnly()), {
      timeout: 15000,
    })
    .toBe(true);

  // DOWÓD TRWAŁOŚCI: rekord faktycznie wylądował w IndexedDB „vilda-cloud-cache”/„state”.
  // (zapis jest zdebouncowany, więc pollujemy). To jest dokładnie ten stan, z którego przy
  // następnym odblokowaniu dane pokażą się OD RAZU, bez czekania na syncPull (np. Terminarz).
  await expect
    .poll(() => durableRecordCount(page), { timeout: 15000 })
    .toBeGreaterThan(0);
});

test('KONTROLA + opt-out: przy pref „0” cache pozostaje pusty mimo trybu chmurowego (dowód, że to flaga włącza warm start)', async ({
  page,
}) => {
  // Jawne wyłączenie ZANIM wczyta się enabler (symuluje opt-out / bezpiecznik sejfu).
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-persistent-cloud-cache-v1', '0');
    } catch (_) {
      /* pomiń */
    }
  });
  await openIndexGuest(page);

  // Enabler respektuje „0”: nie włącza, sejf raportuje wyłączony cache.
  const marker = await page.evaluate(() => window.VildaCloudCacheWarm);
  expect(marker.enabled).toBe(false);
  expect(marker.respectedOptOut).toBe(true);
  expect(
    await page.evaluate(() => window.VildaVault.isPersistentCloudCacheEnabled()),
  ).toBe(false);

  // Nawet w trybie chmurowym z zapisanym pacjentem trwały cache NIE powstaje — to dowodzi,
  // że warm start bierze się właśnie z włączenia bramki przez nasz enabler (przyczynowość).
  const setup = await unlockCloudOnlyVault(page);
  expect(setup.cloudOnly).toBe(true);
  const saved = await savePatient(page);
  expect(saved.patientId && saved.patientId.length).toBeGreaterThan(0);

  // Damy zapisom czas (gdyby miały nastąpić) — i potwierdzamy, że store „state” jest pusty.
  await page.waitForTimeout(3500);
  expect(await durableRecordCount(page)).toBe(0);
});

// POKRYCIE WSZYSTKICH WEJŚĆ: enabler musi działać na KAŻDEJ stronie ładującej sejf, bo PWA
// startuje z app.html (start_url manifestu), a nie z index.html. localStorage jest współdzielony
// per-origin, ale gdy urządzenie nigdy nie otworzy index.html (jak PWA na iPhonie), pref nie
// zostałby ustawiony — dlatego enabler jest wpięty przed vilda_vault.js na wszystkich wejściach.
for (const entry of ['app.html', 'terminarz.html', 'kalkulator-klirens.html', 'ustawienia.html']) {
  test(`enabler aktywny na wejściu „${entry}” (nie tylko index.html)`, async ({ page }) => {
    await page.goto(`/${entry}`, { waitUntil: 'domcontentloaded' });
    // Enabler to skrypt ładowany przy starcie (defer, przed vault) — niezależny od stanu logowania.
    await page.waitForFunction(
      () => window.VildaCloudCacheWarm && window.VildaCloudCacheWarm.__init,
      { timeout: 10000 },
    );
    const marker = await page.evaluate(() => window.VildaCloudCacheWarm);
    expect(marker.enabled).toBe(true);
    expect(await page.evaluate(() => window.VILDA_PERSISTENT_CLOUD_CACHE)).toBe(true);
    expect(
      await page.evaluate(() =>
        window.localStorage.getItem('vilda-persistent-cloud-cache-v1'),
      ),
    ).toBe('1');
    // Gdy sejf zdąży się załadować, jego własne API też potwierdza włączenie.
    await page.waitForFunction(() => Boolean(window.VildaVault), { timeout: 10000 });
    expect(
      await page.evaluate(() => window.VildaVault.isPersistentCloudCacheEnabled()),
    ).toBe(true);
  });
}
