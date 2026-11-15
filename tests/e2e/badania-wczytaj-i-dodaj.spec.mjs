import { expect, test } from '@playwright/test';
import { createFictionalVault, loadPatient, shellFrame } from '../support/centile-live-fixture.mjs';

// P-BADANIA-WEJSCIE (decyzja właściciela 2026-11-15): wyniki dodaje się tylko w Jednostkach lab., pacjentowi wczytanemu
// do formularza. Zakładka „Badania” w karcie pacjenta, który nie jest wczytany, ma jedną akcję: „Wczytaj pacjenta
// i dodaj wyniki →” — wczytanie drogą karty (strażnik niezapisanych zmian, wybór „Nowy pomiar” / „Odtwórz zapisany
// stan”), a po wyborze wizyty przelicznik z tym pacjentem i jego wiekiem.
// Wyłącznie fikcyjny sejf w efemerycznym profilu Playwrighta. Natywny zegar (jak patient-chip-navigation.spec.mjs):
// sprawdzamy prawdziwe wczytanie, pauzę autozapisu i zapis sesji wspólnej.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(150_000);

const sekcjaBadan = (owner) => owner.locator('.vilda-patient-lab-section');
const okno = (owner) => owner.locator('#vildaLoadChoiceModal');

// Dwie drogi otwarcia karty, obie z produkcji:
// - powłoka: karta bez listy pacjentów (chip, wyszukiwarka, Terminarz) — nie ma przycisku „Wczytaj tego pacjenta”,
//   zakładka wczytuje przez applyLoadedData strony;
// - strona samodzielna: karta z listy pacjentów, z jej funkcją wczytania (jak przycisk „Baza pacjentów”).
async function otworzKarte(page, owner, shell, patientId) {
  if (shell) await page.evaluate((pid) => window.VildaShell.openPatientCardInStart(pid, { activeTab: 'lab' }), patientId);
  else {
    await owner.evaluate((pid) => window.VildaAuthUI.showPatientCard(pid, (record) => {
      if (record) window.applyLoadedData(record);
      window.VildaChrome?.refreshPatientChip?.();
    }, null, { activeTab: 'lab' }), patientId);
    await expect(owner.getByRole('button', { name: 'Wczytaj tego pacjenta' })).toBeVisible();
  }
  await expect(sekcjaBadan(owner).locator('.vilda-lab-hist-heading')).toBeVisible();
}

// Wybór wizyty tak, jak robi to człowiek: po narysowaniu okna i przyjęciu wieku z zapisu (jak loadPatient w fixture).
async function wybierzWizyte(owner, choice) {
  await expect(okno(owner)).toBeVisible();
  await owner.waitForFunction(() => !window.VildaDobAge?.restorePending?.());
  await owner.evaluate(() => new Promise(resolve => { requestAnimationFrame(() => { requestAnimationFrame(resolve); }); }));
  await owner.locator(choice === 'new' ? '#vildaLcmNew' : '#vildaLcmRestore').click();
  await expect(okno(owner)).toHaveCount(0);
}

// Odczyt z przelicznika; na stronie samodzielnej tuż po przejściu dokument może się jeszcze ładować.
const pacjentPrzelicznika = (lab) => lab.evaluate(() => ({
  id: sessionStorage.getItem('vildaCurrentPatientId'),
  wybor: sessionStorage.getItem('vildaLoadChoiceV1'),
  pacjent: window.VildaSession?.getPatient?.() ?? null,
})).catch(() => null);

for (const shell of [true, false]) {
  for (const choice of ['restore', 'new']) {
    test(`${shell ? 'powłoka' : 'samodzielnie'}, ${choice}: karta innego pacjenta → wczytanie → wybór wizyty → przelicznik z tym pacjentem i wiekiem`, async ({ page }) => {
      const fixture = await createFictionalVault(page, { shell });
      const start = fixture.frame;
      // W formularzu jest pacjent A; karta dotyczy pacjentki B.
      await loadPatient(start, fixture.ids.a, 'restore');
      await otworzKarte(page, start, shell, fixture.ids.b);
      const badania = sekcjaBadan(start);
      await expect(badania.locator('.vilda-lab-hist-actions > *')).toHaveText(['Wczytaj pacjenta i dodaj wyniki →']);
      await expect(badania.locator('a.vilda-lab-hist-check, a.vilda-lab-hist-package, .vilda-lab-hist-add')).toHaveCount(0);
      await expect(badania.locator('.vilda-lab-hist-empty')).toContainText('Wyniki dodasz w Jednostkach lab. po wczytaniu tego pacjenta.');

      await badania.getByRole('button', { name: 'Wczytaj pacjenta i dodaj wyniki →' }).click();
      // Przed wyborem wizyty aplikacja zostaje na formularzu: przelicznik bez wizyty nie ma czego oceniać.
      await expect(okno(start)).toBeVisible();
      await expect(page).toHaveURL(shell ? /\/app\.html#\/start/ : /\/index\.html/);
      await expect(start.locator('.vilda-auth-patient-card')).toHaveCount(0);
      await wybierzWizyte(start, choice);

      await expect(page).toHaveURL(shell ? /\/app\.html#\/lab/ : /\/przelicznik-jednostek\.html$/, { timeout: 20_000 });
      const lab = shell ? await shellFrame(page, 'Jednostki laboratoryjne') : page;
      await lab.waitForLoadState('load');
      // Odtworzony zapis: wiek wizyty (12 l); nowy pomiar: wiek z daty urodzenia na dziś — w obu przypadkach z wiekiem.
      await expect.poll(() => pacjentPrzelicznika(lab)).toMatchObject({
        id: fixture.ids.b, wybor: choice, pacjent: { name: 'Fikcyjny Beata', sex: 'F', age: 12 },
      });
      const wiek = (await pacjentPrzelicznika(lab)).pacjent.ageMonths;
      // Fikcyjna data urodzenia to 17.06.2014: zapis wizyty ma 12 l 0 m, a nowy pomiar liczy miesiące na dziś.
      if (choice === 'restore') expect(wiek).toBe(0);
      else expect(wiek).toBe(await page.evaluate(() => { const d = new Date(); return (d.getMonth() - 5 + (d.getDate() < 17 ? -1 : 0) + 12) % 12; }));
      await expect(lab.locator('#labPatientText')).toContainText(/Kobieta · 12(\.\d)? lat/);
      if (shell) {
        // Przejście niczego nie zmienia w danych pacjenta: wskaźnik zapisu zostaje „zapisane”.
        expect(await start.evaluate(() => window.VildaSaveStatusIndicator.getState())).toBe('saved');
      }
    });
  }
}

test('powłoka: odnośnik przy wykresie w karcie pacjenta niewczytanego wczytuje go i otwiera przelicznik z tym badaniem', async ({ page }) => {
  const fixture = await createFictionalVault(page, { shell: true });
  const start = fixture.frame;
  await start.evaluate(async (pid) => {
    await window.VildaVault.savePatientNote({
      patientId: pid, title: 'TSH (tyreotropina): 2,1 mIU/L', body: '', category: 'wynik-badania', clinicalDateISO: '2026-06-02',
      labResult: { test: 'TSH (tyreotropina)', testKey: 'tsh', value: '2,1 mIU/L', valueNum: 2.1, unit: 'mIU/L' },
    });
  }, fixture.ids.b);
  await otworzKarte(page, start, true, fixture.ids.b);
  const badania = sekcjaBadan(start);
  await badania.getByRole('button', { name: 'Wykresy', exact: true }).click();
  // Przycisk, nie odnośnik: w ramce powłoki kliknięcie <a> do strony aplikacji przełącza trasę od razu (vilda_chrome.js).
  await expect(badania.locator('.vilda-lab-hist-card[data-series="tsh"] a.vilda-lab-hist-card-check')).toHaveCount(0);
  const odnosnik = badania.locator('.vilda-lab-hist-card[data-series="tsh"] button.vilda-lab-hist-card-check');
  await expect(odnosnik).toHaveText('Wczytaj i dodaj TSH →');
  await odnosnik.click();
  await wybierzWizyte(start, 'restore');
  await expect(page).toHaveURL(/\/app\.html#\/lab/, { timeout: 20_000 });
  const lab = await shellFrame(page, 'Jednostki laboratoryjne');
  await lab.waitForLoadState('load');
  await expect(lab.locator('#labSubstance')).toHaveValue('TSH (tyreotropina)');
  await expect.poll(() => pacjentPrzelicznika(lab)).toMatchObject({ id: fixture.ids.b, pacjent: { name: 'Fikcyjny Beata', age: 12 } });

  // Karta tej samej pacjentki, już wczytanej: zwykłe odnośniki, bez ponownego wczytywania.
  await page.evaluate((pid) => window.VildaShell.openPatientCardInStart(pid, { activeTab: 'lab' }), fixture.ids.b);
  await expect(page).toHaveURL(/\/app\.html#\/start/);
  await expect(badania.locator('.vilda-lab-hist-actions > *')).toHaveText(['Wpisz pakiet: Tarczyca →', 'Dodaj wyniki →']);
  await expect(badania.locator('.vilda-lab-hist-card[data-series="tsh"] a.vilda-lab-hist-card-check')).toHaveText('Nowy wynik TSH →');
  await badania.locator('a.vilda-lab-hist-check').click();
  await expect(page).toHaveURL(/\/app\.html#\/lab/);
  await expect(okno(start)).toHaveCount(0);
});

test('powłoka: okno wyboru wizyty zamknięte bez wyboru kończy zamiar — przelicznik się nie otwiera, także po późniejszym „Odtwórz zapisany stan”', async ({ page }) => {
  const fixture = await createFictionalVault(page, { shell: true });
  const start = fixture.frame;
  await otworzKarte(page, start, true, fixture.ids.b);
  await sekcjaBadan(start).getByRole('button', { name: 'Wczytaj pacjenta i dodaj wyniki →' }).click();
  await expect(okno(start)).toBeVisible();
  await start.locator('body').press('Escape');
  await expect(okno(start)).toHaveCount(0);
  // Pacjentka jest wczytana (to zrobiło okno listy), ale wizyta nie została wybrana.
  await expect.poll(() => start.evaluate(() => sessionStorage.getItem('vildaCurrentPatientId'))).toBe(fixture.ids.b);
  await page.waitForTimeout(1500);
  await expect(page).toHaveURL(/\/app\.html#\/start/);
  // Ręczne odtworzenie zapisu po czasie nie wznawia wygasłego zamiaru.
  await start.locator('#restoreStateBtn').click();
  await page.waitForTimeout(4500);
  await expect(page).toHaveURL(/\/app\.html#\/start/);
});

test('samodzielnie: niezapisane zmiany innego pacjenta — strażnik pyta przed wczytaniem; „Anuluj” zostawia kartę i formularz', async ({ page }) => {
  const fixture = await createFictionalVault(page, { shell: false });
  await loadPatient(page, fixture.ids.a, 'restore');
  // Rzeczywista edycja dopiero po zakończonym wczytaniu: wskaźnik ma bazę zapisu, a autozapis nie jest wstrzymany.
  await expect.poll(() => page.evaluate(() => {
    const decyzja = window.VildaSaveStatusIndicator.getCurrentDecision();
    return decyzja.ready === true && decyzja.state === 'saved' && !window.VildaDataImportExport.getPatientLoadPresentation()
      && !window.VildaDataImportExport.isMainSessionAutosavePaused() && !window.VildaPersistence.isAutosaveSuppressed();
  }), { timeout: 15_000 }).toBe(true);
  await page.locator('#weight').fill('47');
  await page.locator('#weight').blur();
  await expect.poll(() => page.evaluate(() => window.VildaSaveStatusIndicator.getState()), { timeout: 15_000 }).toBe('dirty');
  await otworzKarte(page, page, false, fixture.ids.b);
  await sekcjaBadan(page).getByRole('button', { name: 'Wczytaj pacjenta i dodaj wyniki →' }).click();
  const straznik = page.getByRole('dialog', { name: /^Zapisać (wpisane dane|zmiany) przed wczytaniem\?$/ });
  await expect(straznik).toBeVisible();
  await expect(okno(page)).toHaveCount(0);
  await straznik.getByRole('button', { name: 'Anuluj' }).click();
  await expect(straznik).toHaveCount(0);
  // Nic się nie wczytało: w formularzu nadal pacjent A z niezapisaną zmianą, karta B otwarta, bez przejścia.
  expect(await page.evaluate(() => sessionStorage.getItem('vildaCurrentPatientId'))).toBe(fixture.ids.a);
  await expect(page.locator('#weight')).toHaveValue('47');
  await expect(sekcjaBadan(page).getByRole('button', { name: 'Wczytaj pacjenta i dodaj wyniki →' })).toBeVisible();
  await expect(page).toHaveURL(/\/index\.html/);

  // Świadome odrzucenie zmian: wczytanie, wybór wizyty i przelicznik z pacjentką B.
  await sekcjaBadan(page).getByRole('button', { name: 'Wczytaj pacjenta i dodaj wyniki →' }).click();
  await straznik.getByRole('button', { name: /^Odrzuć (dane|zmiany) i wczytaj$/ }).click();
  await wybierzWizyte(page, 'restore');
  await expect(page).toHaveURL(/\/przelicznik-jednostek\.html$/, { timeout: 20_000 });
  await expect.poll(() => pacjentPrzelicznika(page)).toMatchObject({ id: fixture.ids.b, pacjent: { name: 'Fikcyjny Beata', age: 12 } });
});
