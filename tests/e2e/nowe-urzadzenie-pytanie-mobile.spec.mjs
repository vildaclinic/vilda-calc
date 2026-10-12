import { expect, test } from '@playwright/test';
import { atrapaSynchronizacji, zaakceptujRegulamin, zalozKontoIZaloguj } from '../support/atrapa-synchronizacji.mjs';

// P-NOWE-URZADZENIE na telefonie: w powłoce app.html (adres startowy zainstalowanej PWA) okno „Pobierz dane
// z serwera” zakrywa całą aplikację, oba przyciski mieszczą się na ekranie, a strona nie przewija się w poziomie.
// Przed zmianą pytanie w powłoce nie pokazywało się wcale. Serwer synchronizacji to atrapa; dane fikcyjne.

test('telefon, powłoka PWA: okno pytania na całym ekranie, przyciski widoczne, bez przewijania w poziomie', async ({ page, context }) => {
  await zaakceptujRegulamin(context);
  await atrapaSynchronizacji(context);
  await page.goto('/app.html#/start', { waitUntil: 'domcontentloaded' });
  await zalozKontoIZaloguj(page);

  const okno = page.locator('#vilda-restore-overlay');
  await expect(okno).toBeVisible({ timeout: 15_000 });
  const ekran = page.viewportSize();
  const ramka = await okno.boundingBox();
  expect(ramka).toMatchObject({ x: 0, y: 0, width: ekran.width, height: ekran.height });

  for (const nazwa of ['Pobierz dane z serwera', 'Zacznij od nowa (nie pobieraj)']) {
    const przycisk = okno.getByRole('button', { name: nazwa });
    await expect(przycisk).toBeInViewport();
  }
  const poziomo = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(poziomo, 'brak przewijania w poziomie').toBeLessThanOrEqual(0);

  await okno.getByRole('button', { name: 'Zacznij od nowa (nie pobieraj)' }).click();
  await expect(okno).toBeHidden();
});
