import { expect, test } from '../support/test-czas.mjs';

// Rata A z audytu sekcji „Pacjenci" — pomiar na żywym ekranie „Edytuj pacjenta".
//
// P13a: rekord miał pomiar z wieku 5 lat i 6 miesięcy oraz datę urodzenia, z której
//       dziś wychodzi 6 lat i 8 miesięcy. Samo otwarcie edycji i naciśnięcie
//       „Zapisz zmiany" przestawiało wiek zapisanego pomiaru na dzisiejszy: na osi
//       czasu znikał punkt z 66. miesiąca, a pojawiał się zmyślony z 80. — z tym
//       samym wzrostem i masą.
// P13b: formularz trzyma klon rekordu z chwili otwarcia. Zapis po zmianie rekordu
//       na innym urządzeniu kasował tamtą zmianę bez słowa.
//
// Service worker zablokowany z tego samego powodu co w pozostałych plikach e2e:
// przy pierwszej wizycie instaluje się i robi `location.reload()` na `controllerchange`.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#KartaPacjenta!26aa';

async function otworzZKontem(page) {
  // Bramka regulaminu to modal, który przechwytuje kliknięcia. Akceptacja jest
  // fikcyjna i wyłącznie na potrzeby testu — mierzymy ekran edycji, nie bramkę.
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
  // Konto założone z konsoli nie przechodzi przez ekran logowania, więc nakładka
  // zostaje na wierzchu — wchodzimy jeszcze raz, jak przy starcie z zapamiętaną sesją.
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(
    () => !document.documentElement.classList.contains('vilda-auth-locked'),
  );
  await page.waitForFunction(() => Boolean(window.VildaAuthUI));
}

// Pacjent z datą urodzenia sprzed 80 miesięcy i pomiarem zapisanym w 66. miesiącu.
async function zalozPacjenta(page) {
  return page.evaluate(async () => {
    const dzis = new Date();
    const ur = new Date(Date.UTC(dzis.getFullYear(), dzis.getMonth() - 80, 12));
    const dobISO = ur.toISOString().slice(0, 10);
    const wynik = await window.VildaVault.savePatient({
      name: 'Kowalski Jan',
      user: {
        lastName: 'Kowalski',
        firstName: 'Jan',
        sex: 'M',
        dobISO,
        age: 5,
        ageMonths: 6,
        height: 110,
        weight: 19,
      },
      growthBasic: { data: { measurements: [{ ageMonths: 60, ageYears: 5, height: 105, weight: 17 }] } },
    }, { dedup: false });
    return { patientId: wynik.patientId, snapshotId: wynik.snapshotId, dobISO };
  });
}

const stanRekordu = (page, patientId) => page.evaluate(async (id) => {
  const rekord = await window.VildaVault.getPatient(id);
  const glowa = rekord.snapshots[0];
  const os = await window.VildaVault.listPatientTimelineEvents(id);
  return {
    user: glowa.payload.user,
    osCzasu: (os || [])
      .filter((z) => z && z.type === 'measurement')
      .map((z) => z.ageMonths)
      .sort((a, b) => a - b),
    historia: ((glowa.payload.growthBasic || {}).data || {}).measurements || [],
  };
}, patientId);

async function otworzEdycje(page, patientId) {
  await page.evaluate((id) => window.VildaAuthUI.showPatientEditScreen(id), patientId);
  await expect(page.getByRole('button', { name: 'Zapisz zmiany' })).toBeVisible();
}

test.describe('P13a — zapis edycji nie przestawia wieku pomiaru na dzisiejszy', () => {
  test('wiek zapisany z pomiarem zostaje po otwarciu i zapisaniu edycji', async ({ page }) => {
    await otworzZKontem(page);
    const { patientId } = await zalozPacjenta(page);
    const przed = await stanRekordu(page, patientId);
    expect(przed.user.ageMonths, 'punkt wyjścia: pomiar z 66. miesiąca').toBe(6);

    await otworzEdycje(page, patientId);
    await page.getByRole('button', { name: 'Zapisz zmiany' }).click();
    await page.waitForFunction(
      (id) => window.VildaVault.getPatient(id).then((r) => r.snapshots.length > 1),
      patientId,
    );

    const po = await stanRekordu(page, patientId);
    expect(po.user.age, 'lata pomiaru bez zmian').toBe(5);
    expect(po.user.ageMonths, 'miesiące pomiaru bez zmian').toBe(6);
    expect(po.osCzasu, 'oś czasu bez zmyślonego punktu z dzisiejszego wieku')
      .toEqual(przed.osCzasu);
  });

  test('bez rozjazdu nie ma o co pytać', async ({ page }) => {
    // Kontrola negatywna: modal konfliktu nie może wyskakiwać przy zwykłym zapisie.
    await otworzZKontem(page);
    const { patientId } = await zalozPacjenta(page);
    await otworzEdycje(page, patientId);
    await page.getByRole('button', { name: 'Zapisz zmiany' }).click();
    await expect(page.getByText('Dane pacjenta zmieni')).toHaveCount(0);
  });
});

test.describe('P13b — rozjazd z innym urządzeniem', () => {
  test('zapis na starej kopii pyta i nie kasuje cudzego pomiaru', async ({ page }) => {
    await otworzZKontem(page);
    const { patientId } = await zalozPacjenta(page);
    await otworzEdycje(page, patientId);

    // W międzyczasie inne urządzenie dopisuje pomiar do tego samego rekordu.
    await page.evaluate(async (id) => {
      const rekord = await window.VildaVault.getPatient(id);
      const p = JSON.parse(JSON.stringify(rekord.snapshots[0].payload));
      p.growthBasic.data.measurements.push({ ageMonths: 72, ageYears: 6, height: 118, weight: 21 });
      await window.VildaVault.savePatient(p, { patientId: id, dedup: false });
    }, patientId);

    await page.getByPlaceholder('Nazwisko', { exact: true }).fill('Kowalska-Nowak');
    await page.getByRole('button', { name: 'Zapisz zmiany' }).click();

    const modal = page.getByRole('alertdialog');
    await expect(modal, 'rekord zmieniony gdzie indziej — pytamy, nie scalamy po cichu')
      .toBeVisible();
    await expect(modal).toContainText('Pomiary w historii (podstawowe): 1 → 2');

    await modal.getByRole('button', { name: 'Zapisz moje zmiany na aktualnych danych' }).click();
    await page.waitForFunction(
      (id) => window.VildaVault.getPatient(id).then((r) => r.snapshots.length > 2),
      patientId,
    );

    const po = await stanRekordu(page, patientId);
    expect(po.historia.map((m) => m.ageMonths).sort((a, b) => a - b),
      'pomiar z drugiego urządzenia zostaje').toEqual([60, 72]);
    expect(po.user.lastName, 'zmiana z formularza też wchodzi').toBe('Kowalska-Nowak');
  });

  test('„Wróć do formularza" niczego nie zapisuje', async ({ page }) => {
    await otworzZKontem(page);
    const { patientId } = await zalozPacjenta(page);
    await otworzEdycje(page, patientId);

    await page.evaluate(async (id) => {
      const rekord = await window.VildaVault.getPatient(id);
      const p = JSON.parse(JSON.stringify(rekord.snapshots[0].payload));
      p.growthBasic.data.measurements.push({ ageMonths: 72, ageYears: 6, height: 118, weight: 21 });
      await window.VildaVault.savePatient(p, { patientId: id, dedup: false });
    }, patientId);

    const ile = async () => page.evaluate(
      (id) => window.VildaVault.getPatient(id).then((r) => r.snapshots.length),
      patientId,
    );
    const przed = await ile();

    await page.getByRole('button', { name: 'Zapisz zmiany' }).click();
    const modal = page.getByRole('alertdialog');
    await modal.getByRole('button', { name: 'Wróć do formularza' }).click();
    await expect(modal).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Zapisz zmiany' }),
      'zostajemy w formularzu').toBeVisible();
    expect(await ile(), 'nic nie doszło do rekordu').toBe(przed);
  });
});
