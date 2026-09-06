import { expect, test } from '../support/test-czas.mjs';

// Rata C z audytu sekcji „Pacjenci": znaleziska P5 (Notatki) oraz P9/P10 (Historia).
//
// P5. Sejf odróżnia zapis nowej notatki od zapisu, który WSKRZESIŁ notatkę skasowaną
//     w międzyczasie na innym urządzeniu — zwraca wtedy `isNew:true` mimo podanego id.
//     Edytor ten sygnał wyrzucał do kosza: zamykał się bez słowa, notatka wracała,
//     a tombstone znikał po cichu. Lekarz nie miał jak się dowiedzieć, że cofnął
//     własne skasowanie sprzed chwili.
// P9/P10. Widok domyślny Historii grupuje wpisy pod kotwicami pomiarów po
//     `linkedAgeMonths`. Wpis bez tego powiązania — notatka z datą zdarzenia, wynik
//     badania, zmiana leku — nie trafiał do żadnej grupy i po prostu znikał. Wracał
//     dopiero po włączeniu filtra kategorii, bo filtr przełącza widok w tryb płaski.
//     Filtr pokazywał więc WIĘCEJ niż widok bez filtra.
//
// Service worker zablokowany: przy pierwszej wizycie instaluje się i robi
// `location.reload()` na `controllerchange`, co przerywa nawigację testu.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#NotatkiHistoria!26';

async function otworzZKontem(page) {
  // Bramka regulaminu to modal przechwytujący kliknięcia; akceptacja fikcyjna, na potrzeby testu.
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

const zalozPacjenta = (page) => page.evaluate(async () => {
  const wynik = await window.VildaVault.savePatient({
    name: 'Kowalski Jan',
    user: { lastName: 'Kowalski', firstName: 'Jan', sex: 'M', age: 5, ageMonths: 0, height: 110, weight: 19 },
  }, { dedup: false });
  return wynik.patientId;
});

const notatki = (page, patientId) => page.evaluate(
  (id) => window.VildaVault.listPatientNotesForPatient(id),
  patientId,
);

test.describe('P5 — zapis wskrzeszający notatkę skasowaną na innym urządzeniu', () => {
  async function edytujNotatke(page, patientId) {
    await page.evaluate(async (id) => {
      await window.VildaVault.savePatientNote({
        patientId: id, title: 'Notatka kontrolna', body: 'Treść notatki.', category: 'observation',
      });
    }, patientId);
    const lista = await notatki(page, patientId);
    expect(lista.length, 'notatka założona').toBe(1);

    await page.evaluate((d) => window.VildaAuthUI.showPatientNoteEditor({
      patientId: d.patientId, note: d.note,
    }), { patientId, note: lista[0] });
    await expect(page.getByRole('button', { name: 'Zapisz zmiany' })).toBeVisible();
    return lista[0].id;
  }

  test('edytor mówi o wskrzeszeniu i nie zamyka się sam', async ({ page }) => {
    await otworzZKontem(page);
    const patientId = await zalozPacjenta(page);
    const noteId = await edytujNotatke(page, patientId);

    // Drugie urządzenie kasuje notatkę, gdy edytor jest już otwarty.
    await page.evaluate((id) => window.VildaVault.removePatientNote(id), noteId);
    expect((await notatki(page, patientId)).length, 'notatka skasowana').toBe(0);

    await page.getByRole('button', { name: 'Zapisz zmiany' }).click();

    await expect(page.getByText('Ta notatka była w międzyczasie skasowana na innym urządzeniu.'),
      'zapis wskrzesił notatkę — lekarz musi to zobaczyć').toBeVisible();
    await expect(page.getByRole('button', { name: 'Zostaw notatkę' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Usuń ponownie' })).toBeVisible();
    expect((await notatki(page, patientId)).length, 'notatka faktycznie wróciła').toBe(1);
  });

  test('„Usuń ponownie" domyka skasowanie', async ({ page }) => {
    await otworzZKontem(page);
    const patientId = await zalozPacjenta(page);
    const noteId = await edytujNotatke(page, patientId);
    await page.evaluate((id) => window.VildaVault.removePatientNote(id), noteId);

    await page.getByRole('button', { name: 'Zapisz zmiany' }).click();
    await page.getByRole('button', { name: 'Usuń ponownie' }).click();

    await page.waitForFunction(
      (id) => window.VildaVault.listPatientNotesForPatient(id).then((l) => l.length === 0),
      patientId,
    );
    await expect(page.getByRole('button', { name: 'Zostaw notatkę' })).toHaveCount(0);
  });

  test('zwykły zapis notatki zamyka edytor bez ostrzeżenia', async ({ page }) => {
    // Kontrola negatywna: ostrzeżenie pojawia się tylko wtedy, gdy jest o czym mówić.
    await otworzZKontem(page);
    const patientId = await zalozPacjenta(page);
    await edytujNotatke(page, patientId);

    await page.getByRole('button', { name: 'Zapisz zmiany' }).click();
    await expect(page.getByRole('button', { name: 'Zapisz zmiany' }),
      'edytor zamyka się jak dotąd').toHaveCount(0);
    await expect(page.getByText('Ta notatka była w międzyczasie skasowana')).toHaveCount(0);
    expect((await notatki(page, patientId)).length).toBe(1);
  });
});

test.describe('P9/P10 — Historia nie chowa wpisów bez powiązania z pomiarem', () => {
  async function pacjentZTrzemaWpisami(page) {
    const patientId = await zalozPacjenta(page);
    await page.evaluate(async (id) => {
      // A: przypięta do wieku pomiaru — widoczna także przed naprawą.
      await window.VildaVault.savePatientNote({
        patientId: id, title: 'Wpis A przy pomiarze', body: 'x', category: 'observation', linkedAgeMonths: 60,
      });
      // B: z datą zdarzenia, bez powiązania z pomiarem.
      await window.VildaVault.savePatientNote({
        patientId: id, title: 'Wpis B z datą', body: 'x', category: 'observation', clinicalDateISO: '2026-03-12',
      });
      // C: zwykła notatka, bez daty i bez powiązania.
      await window.VildaVault.savePatientNote({
        patientId: id, title: 'Wpis C bez daty', body: 'x', category: 'observation',
      });
    }, patientId);
    return patientId;
  }

  async function otworzHistorie(page, patientId) {
    await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id), patientId);
    await page.locator('.vilda-patient-tab[data-tab="timeline"]').click();
    await expect(page.locator('.vilda-patient-tab-content[data-tab="timeline"]')).toBeVisible();
  }

  const historia = (page) => page.locator('.vilda-patient-tab-content[data-tab="timeline"]');

  test('widok domyślny pokazuje wszystkie trzy wpisy', async ({ page }) => {
    await otworzZKontem(page);
    const patientId = await pacjentZTrzemaWpisami(page);
    await otworzHistorie(page, patientId);

    for (const tytul of ['Wpis A przy pomiarze', 'Wpis B z datą', 'Wpis C bez daty']) {
      await expect(historia(page).getByText(tytul), `${tytul} w widoku domyślnym`).toBeVisible();
    }
    await expect(historia(page).getByText('Bez przypisanego pomiaru (2)'),
      'sekcja nazywa to, czego nie da się przypiąć do pomiaru').toBeVisible();
  });

  test('filtr niczego nie odsłania, bo nic nie było ukryte', async ({ page }) => {
    // Sedno P10: filtr ma zawężać, nigdy poszerzać. Zbiór po filtrze „Obserwacja"
    // musi być podzbiorem widoku domyślnego.
    await otworzZKontem(page);
    const patientId = await pacjentZTrzemaWpisami(page);
    await otworzHistorie(page, patientId);

    // Dopasowanie dokładne, nie prefiksem: ten sam tytuł siedzi i w liściu, i w opakowaniu,
    // a opakowanie dokłada do tekstu treść notatki — prefiks liczyłby każdy wpis dwa razy.
    const SZUKANE = ['Wpis A przy pomiarze', 'Wpis B z datą', 'Wpis C bez daty'];
    const tytuly = async () => page.evaluate((szukane) => {
      const znalezione = new Set();
      document.querySelectorAll('.vilda-patient-tab-content[data-tab="timeline"] *').forEach((el) => {
        const tekst = (el.textContent || '').trim();
        if (szukane.indexOf(tekst) !== -1) znalezione.add(tekst);
      });
      return [...znalezione].sort();
    }, SZUKANE);
    const przed = await tytuly();

    await historia(page).getByRole('button', { name: 'Obserwacja', exact: true }).click();
    const po = await tytuly();

    expect(przed.length, 'w widoku domyślnym widać wszystkie trzy').toBe(3);
    expect(po, 'filtr nie dokłada wpisów, których wcześniej nie było').toEqual(przed);
  });
});
