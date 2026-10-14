import { expect, test } from '../support/test-czas.mjs';
import { kartaGlownaPiateUrodziny, otworzZKontem } from '../support/granica-urodzin.mjs';

// P-GRANICA-URODZIN na telefonie (projekt mobile-chromium): karta główna w dniu 5. urodzin pokazuje
// „otyłość olbrzymią”, bo bramkę 60 mies. rozstrzygają pełne miesiące, a nie 59,99 mies. z dób.
// Opis i kontrola — tests/support/granica-urodzin.mjs. Dane FIKCYJNE.
test.use({ serviceWorkers: 'block' });

test('telefon: karta główna w dniu 5. urodzin — „Otyłość olbrzymia” i ostrzeżenie, bez poziomego przewijania', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzZKontem(page, 'E2e#GranicaUrodzinM!26');
  await kartaGlownaPiateUrodziny(page);
  await expect(page.locator('#bmiResult')).toBeVisible();
  const przewijanie = await page.evaluate(() => document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth);
  expect(przewijanie, 'brak poziomego przewijania').toBeLessThanOrEqual(0);
});
