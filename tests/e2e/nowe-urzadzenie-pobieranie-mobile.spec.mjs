import { expect, test } from '@playwright/test';
import {
  atrapaSynchronizacji,
  czekajNaOdtworzenieSesji,
  odrzucZgodeAnalityki,
  zaakceptujRegulamin,
  zalozKonto,
  zaszyfrowanyBlob,
} from '../support/atrapa-synchronizacji.mjs';

// P-NOWE-URZADZENIE, etap 2 na telefonie (makieta zaakceptowana 2026-10-13): w powłoce app.html (adres startowy
// zainstalowanej PWA) okno pierwszego pobrania zakrywa cały ekran, kroki i przyciski mieszczą się w szerokości,
// a przypomnienie po „Pobierz później” stoi nad dolnym paskiem nawigacji i go nie zasłania. Strona nie przewija się
// w poziomie. Serwer synchronizacji to atrapa; konto i dane fikcyjne.

const okno = (page) => page.locator('#vilda-restore-overlay');
const przypomnienie = (page) => page.locator('#vilda-restore-reminder');
const poziomo = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

test('telefon, powłoka PWA: pobieranie i błąd na całym ekranie, przypomnienie nad dockiem, bez przewijania w poziomie', async ({ page, context }) => {
  await zaakceptujRegulamin(context);
  let zwolnij;
  const wstrzymany = new Promise((r) => { zwolnij = r; });
  const opcje = { slotNaSerwerze: false, wstrzymajBlob: () => wstrzymany, statusBloba: 503 };
  await atrapaSynchronizacji(context, opcje);
  await page.goto('/app.html#/start', { waitUntil: 'domcontentloaded' });
  await zalozKonto(page);
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('vilda-probe-done-v1'))).toBe('1');
  opcje.blob = await zaszyfrowanyBlob(page, { pacjenci: 2, notatki: 1 });
  opcje.slotNaSerwerze = true;
  await page.evaluate(() => sessionStorage.removeItem('vilda-probe-done-v1'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await czekajNaOdtworzenieSesji(page);

  const ekran = page.viewportSize();
  await expect(okno(page).getByRole('heading', { name: 'Pobieranie Twoich danych z serwera' })).toBeVisible({ timeout: 15_000 });
  expect(await okno(page).boundingBox()).toMatchObject({ x: 0, y: 0, width: ekran.width, height: ekran.height });
  for (const krok of await okno(page).locator('.vilda-restore-krok').all()) await expect(krok).toBeInViewport({ ratio: 1 });
  expect(await poziomo(page), 'pobieranie: brak przewijania w poziomie').toBeLessThanOrEqual(0);

  zwolnij();
  await expect(okno(page).getByRole('heading', { name: 'Nie udało się pobrać danych' })).toBeVisible({ timeout: 15_000 });
  for (const nazwa of ['Spróbuj ponownie', 'Pobierz później']) {
    await expect(okno(page).getByRole('button', { name: nazwa })).toBeInViewport({ ratio: 1 });
  }
  expect(await poziomo(page), 'błąd: brak przewijania w poziomie').toBeLessThanOrEqual(0);

  await okno(page).getByRole('button', { name: 'Pobierz później' }).click();
  await expect(przypomnienie(page)).toBeVisible();
  await odrzucZgodeAnalityki(page);
  const dock = page.locator('#mobileBottomDock');
  await expect(dock).toBeVisible();
  const ramkaDocka = await dock.boundingBox();
  const ramka = await przypomnienie(page).boundingBox();
  expect(ramka.x, 'mieści się w szerokości ekranu').toBeGreaterThanOrEqual(0);
  expect(ramka.x + ramka.width).toBeLessThanOrEqual(ekran.width);
  expect(ramka.y + ramka.height, 'nad dockiem, bez zasłaniania go').toBeLessThanOrEqual(ramkaDocka.y);
  await expect(przypomnienie(page).getByRole('button', { name: 'Pobierz teraz' })).toBeInViewport({ ratio: 1 });
  expect(await poziomo(page), 'przypomnienie: brak przewijania w poziomie').toBeLessThanOrEqual(0);

  opcje.statusBloba = null;
  await przypomnienie(page).getByRole('button', { name: 'Pobierz teraz' }).click();
  await expect(okno(page).getByRole('heading', { name: 'Gotowe — dane są na tym urządzeniu' })).toBeVisible({ timeout: 20_000 });
  await expect(okno(page).getByRole('button', { name: 'Przejdź do aplikacji' })).toBeInViewport({ ratio: 1 });
  expect(await poziomo(page), 'gotowe: brak przewijania w poziomie').toBeLessThanOrEqual(0);
});
