import { expect, test } from '../support/test-czas.mjs';
import { czekajNaBadania, otworzSejf, sekcjaBadan, wybierzBadanie, zapiszHistorie } from '../support/lab-historia-dane.mjs';

// LAB-HISTORIA PR4: nawigacja karta ↔ przelicznik w prawdziwej powłoce (app.html) na prawdziwym sejfie.
// Karta badania w zakładce „Badania” otwiera przelicznik z tym badaniem (?badanie=, decyzje 6.15 i 6.23);
// pasek „Poprzednie wyniki” w przeliczniku otwiera kartę na zakładce „Badania” (PR3, 3.4).
// Dane wyłącznie fikcyjne (tests/support/lab-historia-dane.mjs).
test.use({ serviceWorkers: 'block' });

async function ramka(page, tytul) {
  const iframe = page.locator(`iframe.app-pane[title="${tytul}"]`);
  await expect(iframe).toBeVisible();
  const frame = await (await iframe.elementHandle()).contentFrame();
  if (!frame) throw new Error(`Brak ramki ${tytul}`);
  return frame;
}

async function powlokaZKarta(page) {
  const patientId = await otworzSejf(page);
  await zapiszHistorie(page, patientId);
  await page.goto('/app.html#/start', { waitUntil: 'load' });
  const start = await ramka(page, 'Start');
  await start.waitForFunction(() => window.VildaVault?.isUnlocked() && Boolean(window.VildaAuthUI && window.VildaLabHistoryTab));
  for (const scope of [page, start]) {
    const consent = scope.locator('#consent-decline');
    if (await consent.isVisible()) await consent.click();
  }
  // Karta od razu na zakładce „Badania” (P-POWLOKA-KARTA-ZAKLADKA, PR3).
  await page.evaluate((pid) => window.VildaShell.openPatientCardInStart(pid, { activeTab: 'lab' }), patientId);
  await expect(start.locator('.vilda-patient-tab[data-tab="lab"]')).toHaveClass(/active/);
  await czekajNaBadania(start);
  return { patientId, start };
}

test('karta badania → przelicznik z tym badaniem i pustym polem wyniku; wpisany wynik nie znika po cichu', async ({ page }) => {
  const { patientId, start } = await powlokaZKarta(page);
  const tsh = sekcjaBadan(start).locator('.vilda-lab-hist-card[data-series="tsh"] a.vilda-lab-hist-card-check');
  await expect(tsh).toHaveText('Nowy wynik TSH w przeliczniku →');
  await tsh.click();
  await expect(page).toHaveURL(/\/app\.html#\/lab/);
  const lab = await ramka(page, 'Jednostki laboratoryjne');
  await expect(lab.locator('#labSubstance')).toHaveValue('TSH (tyreotropina)');
  await expect(lab.locator('#labValue')).toHaveValue('');
  expect(await lab.evaluate(() => window.VildaLabConverterRuntime.getSubstanceId())).toBe('tsh');

  // Wpisany wynik: kolejne wejście z innym badaniem nie zmienia formularza, tylko informuje.
  await lab.locator('#labValue').fill('4,2');
  // Wyjście z trasy Start zamyka kartę (zachowanie powłoki), więc otwieramy ją ponownie jak chip pacjenta.
  await page.evaluate((pid) => window.VildaShell.openPatientCardInStart(pid, { activeTab: 'lab' }), patientId);
  await expect(page).toHaveURL(/\/app\.html#\/start/);
  await czekajNaBadania(start);
  await sekcjaBadan(start).locator('.vilda-lab-hist-card[data-series="ft4"] a.vilda-lab-hist-card-check').click();
  await expect(page).toHaveURL(/\/app\.html#\/lab/);
  await expect(lab.locator('#labToast')).toHaveText('Nie zmieniono badania na fT4: pole wyniku nie jest puste.');
  await expect(lab.locator('#labSubstance')).toHaveValue('TSH (tyreotropina)');
  await expect(lab.locator('#labValue')).toHaveValue('4,2');
});

test('pasek „Poprzednie wyniki” → karta pacjenta na zakładce „Badania” przez powłokę', async ({ page }) => {
  const { patientId, start } = await powlokaZKarta(page);
  // Karta zamknięta: wracamy do formularza Start, potem przelicznik z pacjentką i wynikiem TSH.
  await start.evaluate(() => window.VildaAuthUI.hide());
  await expect(start.locator('.vilda-auth-patient-card')).toHaveCount(0);
  await page.evaluate(() => window.VildaShell.navigate('lab'));
  const lab = await ramka(page, 'Jednostki laboratoryjne');
  await lab.waitForFunction(() => window.VildaVault?.isUnlocked() && Boolean(window.VildaLabHistoryStrip));
  await lab.evaluate((pid) => {
    sessionStorage.setItem('vildaCurrentPatientId', pid);
    window.VildaPersistence.writeShared({ name: 'Fikcyjna Badaniowa', sex: 'F', age: 12, ageMonths: 3 }, { force: true });
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: pid } }));
  }, patientId);
  await wybierzBadanie(lab, 'tsh', 'TSH');
  await lab.locator('#labUnit').selectOption('mIU/L');
  await lab.locator('#labValue').fill('0,38');
  const pasek = lab.locator('#labHistoryStrip');
  await expect(pasek.locator('.lab-strip-sub')).toHaveText('Fikcyjna Badaniowa · 4 wyniki · ostatni 02.06.26');
  await pasek.locator('.lab-strip-head button.lab-strip-link').click();
  await expect(page).toHaveURL(/\/app\.html#\/start/);
  await expect(start.locator('.vilda-patient-tab[data-tab="lab"]')).toHaveClass(/active/);
  await czekajNaBadania(start);
  await expect(sekcjaBadan(start).locator('.vilda-lab-hist-summary')).toHaveText('14 wyników · 5 badań · ostatnie badanie 02.06.26');
});

test('strona samodzielna: ?badanie=ft4 wybiera fT4 przy starcie, nieznany klucz zostawia pusty formularz', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
  });
  await page.goto('/przelicznik-jednostek.html?badanie=ft4', { waitUntil: 'load' });
  await expect(page.locator('#labSubstance')).toHaveValue('fT4 (wolna tyroksyna)');
  await expect(page.locator('#labValue')).toHaveValue('');
  await page.evaluate(() => sessionStorage.clear());
  await page.goto('/przelicznik-jednostek.html?badanie=nieznane', { waitUntil: 'load' });
  await expect(page.locator('#labToast')).not.toHaveClass(/is-visible/);
  expect(await page.evaluate(() => window.VildaLabConverterRuntime.getSubstanceId())).not.toBe('nieznane');
});
