import { expect, test } from '@playwright/test';
import { orientacja, otworzStrone, palczewskaPro, wygenerujPdf } from '../support/siatka-poziomo.mjs';

// P-PAL-POZIOM na telefonie (projekt mobile-chromium): przełącznik „Układ PDF” mieści się
// pod przyciskiem siatki bez poziomego przewijania i działa tak samo jak na desktopie. Dane FIKCYJNE.
test.use({ serviceWorkers: 'block' });

test('telefon: przełącznik „Układ PDF” bez poziomego przewijania, wybór poziomu daje jedną stronę A4 poziomo', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzStrone(page);
  await palczewskaPro(page);
  const przelacznik = page.locator('#palPdfLayoutPicker');
  await przelacznik.scrollIntoViewIfNeeded();
  await expect(przelacznik).toBeVisible();
  const uklad = await page.evaluate(() => {
    const box = document.getElementById('palPdfLayoutPicker').getBoundingClientRect();
    return {
      przewijanie: document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth,
      lewo: box.left,
      prawo: window.innerWidth - box.right,
    };
  });
  expect(uklad.przewijanie, 'brak poziomego przewijania').toBeLessThanOrEqual(0);
  expect(uklad.lewo).toBeGreaterThanOrEqual(0);
  expect(uklad.prawo).toBeGreaterThanOrEqual(0);
  await page.locator('label:has(#palPdfLayoutLandscape)').click();
  await expect(page.locator('#palPdfLayoutLandscape')).toBeChecked();
  const strony = await wygenerujPdf(page);
  expect(strony.map(orientacja)).toEqual(['poziom']);
});
