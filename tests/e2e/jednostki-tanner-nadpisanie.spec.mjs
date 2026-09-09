import { expect, test } from '../support/test-czas.mjs';

// GROWTH-PUB-TWO — przelicznik jednostek laboratoryjnych CZYTA stadium Tannera z danych
// pacjenta (panel „Dane pokwitaniowe" formularza głównego jest jedynym miejscem wpisu),
// a własny wybór stadium jest jawnie NADPISANIEM LOKALNYM: obowiązuje tylko w tym
// przeliczniku i nie zapisuje się u pacjenta. Do SW 1.0.875 opcja domyślna mówiła tylko
// „(z danych)", a nadpisanie zdradzał jedynie dopisek „override lokalny" w nagłówku —
// lekarz mógł mieć Tanner I u pacjenta i Tanner III przy normach, nie widząc rozjazdu.
test.use({ serviceWorkers: 'block' });

async function otworz(page, dane) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem(
        'vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }),
      );
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaPersistence));
  // Dane pacjenta idą tą samą drogą, którą zapisuje je formularz główny (userData.js).
  await page.evaluate((d) => { window.VildaPersistence.writeShared(d, { force: true }); }, dane);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.LabUnitConverter));
  await page.locator('#labPatientToggle').click();
  await expect(page.locator('#labOverrideTanner')).toBeVisible();
}

const CHLOPIEC = { sex: 'M', age: 10, ageMonths: 0, tannerStage: '2' };

test('opcja domyślna nazywa stadium z danych pacjenta', async ({ page }) => {
  await otworz(page, CHLOPIEC);
  await expect(page.locator('#labOverrideTannerDefault')).toHaveText('(z danych: Tanner II)');
  await expect(page.locator('#labOverrideTannerNote')).toBeHidden();
  await expect(page.locator('#labPatientText')).toContainText('Tanner II');
  await expect(page.locator('#labPatientText')).not.toContainText('nadpisanie');
});

test('inny wybór jest oznaczony jako nadpisanie lokalne i nazywa stadium u pacjenta', async ({ page }) => {
  await otworz(page, CHLOPIEC);
  await page.locator('#labOverrideTanner').selectOption('4');
  const nota = page.locator('#labOverrideTannerNote');
  await expect(nota).toBeVisible();
  await expect(nota).toContainText('Nadpisanie lokalne: Tanner IV');
  await expect(nota).toContainText('nie zapisuje się u pacjenta');
  await expect(nota).toContainText('u pacjenta pozostaje Tanner II');
  await expect(page.locator('#labOverrideTannerWrap')).toHaveClass(/is-override/);
  await expect(page.locator('#labPatientText')).toContainText('Tanner IV (nadpisanie lokalne; u pacjenta: Tanner II)');
  // Nadpisanie nie wycieka do danych pacjenta.
  expect(await page.evaluate(() => window.VildaPersistence.readShared().tannerStage)).toBe('2');
});

test('„Resetuj do danych pacjenta” zdejmuje nadpisanie i notę', async ({ page }) => {
  await otworz(page, CHLOPIEC);
  await page.locator('#labOverrideTanner').selectOption('4');
  await expect(page.locator('#labOverrideTannerNote')).toBeVisible();
  await page.locator('#labOverrideReset').click();
  await expect(page.locator('#labOverrideTannerNote')).toBeHidden();
  await expect(page.locator('#labOverrideTannerWrap')).not.toHaveClass(/is-override/);
  await expect(page.locator('#labOverrideTanner')).toHaveValue('');
  await expect(page.locator('#labPatientText')).toContainText('Tanner II');
  await expect(page.locator('#labPatientText')).not.toContainText('nadpisanie');
});

test('bez stadium u pacjenta nota odsyła do panelu „Dane pokwitaniowe”', async ({ page }) => {
  await otworz(page, { sex: 'M', age: 10, ageMonths: 0 });
  await expect(page.locator('#labOverrideTannerDefault')).toHaveText('(z danych: nieznany)');
  await page.locator('#labOverrideTanner').selectOption('3');
  const nota = page.locator('#labOverrideTannerNote');
  await expect(nota).toContainText('stadium nie jest wpisane');
  await expect(nota).toContainText('Dane pokwitaniowe');
  await expect(page.locator('#labPatientText')).toContainText('Tanner III (nadpisanie lokalne; u pacjenta: nieznany)');
});
