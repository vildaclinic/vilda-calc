import { expect, test } from '../support/test-czas.mjs';

// GROWTH-PUB-REC — wiek startu pokwitania i wiek menarche jako dane rekordu pacjenta.
//
// Pomiar idzie przez prawdziwy ekran „Edytuj pacjenta", a nie obok niego: to jedyny
// sposób sprawdzenia, że pola trafiają do zaszyfrowanego rekordu i wracają z niego przy
// ponownym otwarciu. Bez tych dwóch liczb podgrupy Kelly'ego są martwym kodem — silnik
// zawsze liczy na krzywej uśrednionej po wszystkich dzieciach.
//
// Service worker zablokowany z tego samego powodu co w pozostałych plikach e2e:
// przy pierwszej wizycie instaluje się i robi `location.reload()` na `controllerchange`.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#Pokwitanie!26aa';

async function otworzZKontem(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem(
        'vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }),
      );
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(
    async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }),
    HASLO,
  );
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(
    () => !document.documentElement.classList.contains('vilda-auth-locked'),
  );
  await page.waitForFunction(() => Boolean(window.VildaAuthUI));
}

async function zalozPacjentke(page) {
  return page.evaluate(async () => {
    const wynik = await window.VildaVault.savePatient({
      name: 'Testowa Anna',
      user: {
        lastName: 'Testowa', firstName: 'Anna', sex: 'K',
        age: 11, ageMonths: 0, height: 140, weight: 33,
      },
    }, { dedup: false });
    return wynik.patientId;
  });
}

async function otworzEdycje(page, patientId) {
  await page.evaluate((id) => window.VildaAuthUI.showPatientEditScreen(id), patientId);
  await expect(page.getByRole('button', { name: 'Zapisz zmiany' })).toBeVisible();
  // Pełna nazwa dostępna, bo od SW 1.0.870 formularz główny ma własny przycisk
  // „+ Pokaż dojrzewanie płciowe" — sama fraza pasowałaby do obu.
  await page.getByRole('button', { name: 'Dojrzewanie płciowe opcjonalne · tempo wzrastania' })
    .click();
}

const sekcjaRekordu = (page, patientId) => page.evaluate(async (id) => {
  const rekord = await window.VildaVault.getPatient(id);
  return rekord.snapshots[0].payload.puberty || null;
}, patientId);

test.describe('Dwie liczby wchodzą do rekordu i z niego wracają', () => {
  test('zapis, ponowne otwarcie i odczyt z rekordu', async ({ page }) => {
    await otworzZKontem(page);
    const patientId = await zalozPacjentke(page);

    await otworzEdycje(page, patientId);
    await page.getByPlaceholder('lata, np. 11,5').fill('9,8');
    await page.getByPlaceholder('lata, np. 12,5').fill('12,25');
    await page.getByRole('button', { name: 'Zapisz zmiany' }).click();
    await page.waitForFunction(
      (id) => window.VildaVault.getPatient(id).then((r) => Boolean(r.snapshots[0].payload.puberty)),
      patientId,
    );

    expect(await sekcjaRekordu(page, patientId), 'liczby w rekordzie, nie tylko na ekranie')
      .toEqual({ onsetAgeYears: 9.8, menarcheAgeYears: 12.25 });

    // Ponowne otwarcie edycji musi pokazać to, co zapisano — inaczej lekarz nadpisze
    // własne dane pustymi polami przy najbliższej korekcie.
    await otworzEdycje(page, patientId);
    await expect(page.getByPlaceholder('lata, np. 11,5')).toHaveValue('9.8');
    await expect(page.getByPlaceholder('lata, np. 12,5')).toHaveValue('12.25');
  });

  test('sama menarche wystarczy — start pokwitania bywa nieznany', async ({ page }) => {
    await otworzZKontem(page);
    const patientId = await zalozPacjentke(page);
    await otworzEdycje(page, patientId);
    await page.getByPlaceholder('lata, np. 12,5').fill('13');
    await page.getByRole('button', { name: 'Zapisz zmiany' }).click();
    await page.waitForFunction(
      (id) => window.VildaVault.getPatient(id).then((r) => Boolean(r.snapshots[0].payload.puberty)),
      patientId,
    );
    expect(await sekcjaRekordu(page, patientId)).toEqual({ menarcheAgeYears: 13 });
  });

  test('kontrola negatywna: pusta sekcja nie tworzy się w rekordzie', async ({ page }) => {
    await otworzZKontem(page);
    const patientId = await zalozPacjentke(page);
    await otworzEdycje(page, patientId);
    await page.getByRole('button', { name: 'Zapisz zmiany' }).click();
    await page.waitForFunction(
      (id) => window.VildaVault.getPatient(id).then((r) => r.snapshots.length > 1),
      patientId,
    );
    expect(await sekcjaRekordu(page, patientId)).toBeNull();
  });
});

test.describe('Błędny wpis zatrzymuje zapis z nazwanym powodem', () => {
  test('menarche wcześniejsza niż start pokwitania', async ({ page }) => {
    await otworzZKontem(page);
    const patientId = await zalozPacjentke(page);
    await otworzEdycje(page, patientId);
    await page.getByPlaceholder('lata, np. 11,5').fill('12');
    await page.getByPlaceholder('lata, np. 12,5').fill('10');
    await page.getByRole('button', { name: 'Zapisz zmiany' }).click();

    await expect(page.getByText('Wiek menarche nie może być wcześniejszy')).toBeVisible();
    expect(await sekcjaRekordu(page, patientId), 'sprzeczny wpis nie wszedł do rekordu')
      .toBeNull();
  });

  test('liczba spoza zakresu wieku (typowa literówka: 115 zamiast 11,5)', async ({ page }) => {
    await otworzZKontem(page);
    const patientId = await zalozPacjentke(page);
    await otworzEdycje(page, patientId);
    await page.getByPlaceholder('lata, np. 11,5').fill('115');
    await page.getByRole('button', { name: 'Zapisz zmiany' }).click();

    await expect(page.getByText('Wiek startu pokwitania podaj w latach')).toBeVisible();
    expect(await sekcjaRekordu(page, patientId)).toBeNull();
  });
});

test.describe('Rekord przeżywa zapis z kalkulatora', () => {
  test('„Zapisz" z formularza nie gubi sekcji, której formularz nie pokazuje', async ({ page }) => {
    await otworzZKontem(page);
    const patientId = await zalozPacjentke(page);
    await otworzEdycje(page, patientId);
    await page.getByPlaceholder('lata, np. 11,5').fill('9,8');
    await page.getByRole('button', { name: 'Zapisz zmiany' }).click();
    await page.waitForFunction(
      (id) => window.VildaVault.getPatient(id).then((r) => Boolean(r.snapshots[0].payload.puberty)),
      patientId,
    );

    // Kalkulator buduje snapshot wyłącznie z kolektora — bez przeniesienia sekcja
    // zniknęłaby z najnowszej wersji rekordu przy pierwszym zapisie.
    const zebrane = await page.evaluate(async (id) => {
      const rekord = await window.VildaVault.getPatient(id);
      window.vildaPubertyData = null;
      const api = window.vildaDataImportExport || window;
      if (typeof api.applyLoadedData === 'function') api.applyLoadedData(rekord.snapshots[0].payload);
      const zebrany = typeof window.collectUserData === 'function' ? window.collectUserData() : null;
      return zebrany ? zebrany.puberty : 'brak kolektora';
    }, patientId);

    expect(zebrane).toEqual({ onsetAgeYears: 9.8 });
  });
});
