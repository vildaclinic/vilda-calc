import { expect, test } from '../support/test-czas.mjs';
import { zemelPatient } from '../support/zemel-creator.mjs';
import { kreator, kliknijDane, zapiszKomentarz, magazynWspolny, bezOverflow, wybierzWykres } from '../support/kreator-wspolne-adnotacje.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(90_000);
test('Zemel na telefonie: dotykowa adnotacja, oba wykresy i brak przewijania interfejsu w bok', async ({ page }) => {
  await zemelPatient(page);
  await page.locator('#openChartCreatorBtn').click();
  await expect(kreator(page)).toHaveAttribute('aria-label', /Zemel 2015/);
  await kreator(page).getByRole('button', { name: '+ Etykieta', exact: true }).click();
  await kliknijDane(page, 'height', 144, 130, { touch: true });
  await zapiszKomentarz(page, 'E2E-MOBILE');
  expect((await magazynWspolny(page)).free.height.some(item => item.txt === 'E2E-MOBILE')).toBe(true);
  await bezOverflow(page);
  await page.screenshot({ path: test.info().outputPath('zemel-kreator-mobile-po.png') });
  await wybierzWykres(page, 'weight');
  expect(await page.evaluate(() => window.VildaPublicationCreator._geomStore.weight)).toMatchObject({ source: 'DS', ageMin: 0, ageMax: 240 });
  await bezOverflow(page);
});
