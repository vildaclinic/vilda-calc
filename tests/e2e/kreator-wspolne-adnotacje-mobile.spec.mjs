import { expect, test } from '@playwright/test';
import {
  bezOverflow, kliknijDane, kreator, magazynWspolny, odtworzJson,
  otworzZrodlo, przygotujKreator, przesunRamke, sprawdzRamkeWDanych,
  wybierzWykres, zapiszKomentarz,
} from '../support/kreator-wspolne-adnotacje.mjs';

test.use({ serviceWorkers: 'block' });

test('telefon: komentarz masy utworzony i przeciągnięty dotykiem pozostaje na tym samym pomiarze po zmianie OLAF ↔ Palczewska', async ({ page }) => {
  test.setTimeout(150_000);
  await przygotujKreator(page);
  await otworzZrodlo(page, 'OLAF');
  await wybierzWykres(page, 'weight');
  await bezOverflow(page);
  await kliknijDane(page, 'weight', 120, 33, { touch: true });
  await zapiszKomentarz(page, 'E2E-telefon');
  await przesunRamke(page, 'olaf', 'weight', 'cur', { touch: true });
  const store = await magazynWspolny(page);
  expect(store.layout.weight.cur.frame).toEqual({ ageMonths: expect.any(Number), value: expect.any(Number) });
  await bezOverflow(page);

  await odtworzJson(page);
  await otworzZrodlo(page, 'PALCZEWSKA');
  await wybierzWykres(page, 'weight');
  await expect(kreator(page)).toContainText('E2E-telefon');
  const item = await sprawdzRamkeWDanych(page, 'palRegular', 'weight', 'cur', store.layout.weight.cur.frame);
  expect([item.ageMonths, item.value]).toEqual([120, 33]);
  expect(await magazynWspolny(page)).toEqual(store);
  await bezOverflow(page);
  await page.screenshot({ path: test.info().outputPath('wspolne-adnotacje-telefon.png') });

  await odtworzJson(page);
  await otworzZrodlo(page, 'OLAF');
  await wybierzWykres(page, 'weight');
  await sprawdzRamkeWDanych(page, 'olaf', 'weight', 'cur', store.layout.weight.cur.frame);
  await bezOverflow(page);
});
