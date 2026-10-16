import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { czekajNaGenerator, czekajNaOdblokowanie, orientacja, otworzStrone, palczewskaPro, wygenerujPdf } from '../support/siatka-poziomo.mjs';

// P-PAL-POZIOM (decyzja właściciela 2026-10-16): siatka Palczewskiej 1–18 lat do PDF na jednej
// stronie A4 w poziomie (wzrost po lewej, waga po prawej, wspólny nagłówek i jedna stopka).
// Domyślnie zostają 2 strony w pionie; siatki do publikacji zawsze w pionie. Dane FIKCYJNE.
test.use({ serviceWorkers: 'block' });

test.describe('siatka Palczewskiej 1–18 lat — układ PDF', () => {
  test('domyślnie: przełącznik widoczny, zaznaczone 2 strony, PDF ma 2 strony A4 w pionie', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzStrone(page);
    await palczewskaPro(page);
    await expect(page.locator('#palPdfLayoutPicker')).toBeVisible();
    await expect(page.locator('#palPdfLayoutPortrait')).toBeChecked();
    const strony = await wygenerujPdf(page);
    expect(strony.map(orientacja)).toEqual(['pion', 'pion']);
  });

  test('wybór „1 strona A4 · poziom” zapisuje się i daje jedną stronę 297 × 210 mm', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzStrone(page);
    await palczewskaPro(page);
    await page.locator('label:has(#palPdfLayoutLandscape)').click();
    await expect(page.locator('#palPdfLayoutLandscape')).toBeChecked();
    expect(await page.evaluate(() => window.VildaPersistence.readPreferenceRaw('PAL_PDF_LAYOUT', null))).toBe('landscape');
    const strony = await wygenerujPdf(page);
    expect(strony.map(orientacja)).toEqual(['poziom']);

    // Po przeładowaniu wybór zostaje.
    await page.reload({ waitUntil: 'load' });
    await czekajNaOdblokowanie(page);
    await czekajNaGenerator(page);
    await palczewskaPro(page);
    await expect(page.locator('#palPdfLayoutLandscape')).toBeChecked();
  });

  test('pomiary sprzed 1. i po 3. roku życia: strona 0–3 lata w pionie, siatka 1–18 lat w poziomie', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzStrone(page);
    await palczewskaPro(page);
    await page.locator('label:has(#palPdfLayoutLandscape)').click();
    const strony = await wygenerujPdf(page, () => {
      window.advancedGrowthData = {
        currentAgeMonths: 120, currentHeight: 141, currentWeight: 33,
        measurements: [{ ageMonths: 6, height: 67.5, weight: 7.8 }, { ageMonths: 60, height: 110.8, weight: 18.6 }],
      };
      if (window.getPalczewskaChartPlan(120, window.advancedGrowthData).mode !== 'BOTH_REQUIRED') throw new Error('plan inny niż BOTH_REQUIRED');
      return window.generatePalczewskaCentileCharts();
    });
    expect(strony.map(orientacja)).toEqual(['pion', 'poziom']);
  });

  test('tryb publikacji: siatki zostają w pionie, a przełącznik znika', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzStrone(page);
    await palczewskaPro(page);
    await page.locator('label:has(#palPdfLayoutLandscape)').click();
    await page.evaluate(() => { window.publicationCharts = true; window.updateCentileButtons(); });
    await expect(page.locator('#palPdfLayoutPicker')).toBeHidden();
    const strony = await wygenerujPdf(page);
    expect(strony.map(orientacja)).toEqual(['pion', 'pion']);
  });

  // Brak wyników PRO (state.supported === false) sprawdza test jednostkowy isToggleRelevant —
  // aplikacja sama przywraca tryb PRO, gdy dostęp jest aktywny, więc w e2e nie da się go wyłączyć wiernie.
  test('przełącznika nie ma przy OLAF ani przy samej siatce 0–3 lata', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzStrone(page);
    await palczewskaPro(page);
    await expect(page.locator('#palPdfLayoutPicker')).toBeVisible();
    await page.evaluate(() => {
      const olaf = document.getElementById('sourceOlaf');
      olaf.checked = true;
      olaf.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(page.locator('#palPdfLayoutPicker')).toBeHidden();
    await palczewskaPro(page, { lata: 0, miesiace: 8, waga: 8.2, wzrost: 70 });
    expect(await page.evaluate(() => window.getCentileChartState().palPlan.mode)).toBe('INFANT_ONLY');
    await expect(page.locator('#palPdfLayoutPicker')).toBeHidden();
    await palczewskaPro(page);
    await expect(page.locator('#palPdfLayoutPicker')).toBeVisible();
  });

  test('strona pozioma: 3508 × 2480 px, oba wykresy narysowane, ta sama na index.html i docpro.html', async ({ page }) => {
    test.setTimeout(120_000);
    const render = async (sciezka) => {
      await otworzStrone(page, sciezka, { zKontem: false });
      return page.evaluate(() => {
        const c = window.VildaCentileLandscape.buildPage({ sex: 'F', userAgeMonths: 120, userWeight: 32, userHeight: 140 });
        const ctx = c.getContext('2d');
        // Udział nie-białych pikseli w każdej z dwóch kolumn wykresów (siatka, krzywe, opisy).
        const tusz = (x) => {
          const d = ctx.getImageData(x, 300, 1600, 2000).data;
          let n = 0;
          for (let i = 0; i < d.length; i += 4) if (d[i] < 200 || d[i + 1] < 200 || d[i + 2] < 200) n++;
          return n / (d.length / 4);
        };
        return { w: c.width, h: c.height, lewa: tusz(130), prawa: tusz(1814), png: c.toDataURL('image/png') };
      });
    };
    const index = await render('/index.html');
    expect([index.w, index.h]).toEqual([3508, 2480]);
    expect(index.lewa, 'siatka wzrostu').toBeGreaterThan(0.05);
    expect(index.prawa, 'siatka wagi').toBeGreaterThan(0.05);
    const docpro = await render('/docpro.html');
    const sha = (u) => createHash('sha256').update(u).digest('hex');
    expect(sha(docpro.png)).toBe(sha(index.png));
  });
});
