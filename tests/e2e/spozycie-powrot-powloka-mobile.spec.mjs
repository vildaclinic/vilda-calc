import { expect, test } from '../support/test-czas.mjs';
import { otworzPowloke, pacjentNaStart } from '../support/powloka-przewiniecie.mjs';
import { karta, powrotZeSpozyciem } from '../support/spozycie-powrot.mjs';

// P-SPOZYCIE-POWROT na widoku telefonu (projekt mobile-chromium). Zmierzone przed zmianą: pierwsza klatka po
// Start → DocPro → Start bez wiersza historii, #intakeMeasurements 487 → 235 px (−252 px), treść pod kartą
// podskakiwała. Desktop: spozycie-powrot-powloka.spec.mjs. Dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#SpozyciePowrotMobile!26';

test('telefon: powrót na Start — karta szacowanego spożycia ma wiersz historii w każdej widocznej klatce, od pierwszej', async ({ page }) => {
  test.setTimeout(150_000);
  const start = await otworzPowloke(page, HASLO);
  await pacjentNaStart(start);
  const { przed } = await powrotZeSpozyciem(page, start, 'telefon');
  expect(await karta(start), 'karta po powrocie jak przed wyjściem').toEqual(przed);
  await expect(page.locator('#mobileBottomDock')).toBeVisible();
  expect(await start.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'bez poziomego przewijania').toBe(true);
});
