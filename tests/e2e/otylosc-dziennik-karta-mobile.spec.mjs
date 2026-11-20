import { expect, test } from '../support/test-czas.mjs';

// P-OTYLOSC-DZIENNIK na telefonie (projekt mobile-chromium): sekcja „Wpisy leczenia” i okno „+ Kontynuacja” mieszczą się
// na ekranie bez przewijania w bok, cele dotyku mają co najmniej 44 px, a wpis z masą od pacjenta zapisuje się z telefonu.
// Dane wyłącznie FIKCYJNE; sejf zakładany na potrzeby testu.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce', chwila: '2026-11-18T12:00:00Z' });
test.setTimeout(150_000);

const HASLO = 'E2e#DziennikMobile!26';
const WEGOVY = 'Wegovy (semaglutyd) – s.c. 1×/tydz.';
const P = (id, type, dateISO, mies, weight, height, dose = '2,4 mg / tydz.') => ({
  id, type, dateISO, ageYears: 13, ageMonths: mies, weight, height, drug: WEGOVY, substance: '', dose,
});
const bezPrzewijaniaWBok = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const wEkranie = (locator) => locator.evaluate((el) => {
  const b = el.getBoundingClientRect();
  return b.left >= -1 && b.right <= document.documentElement.clientWidth + 1;
});
const wysokosc = (locator) => locator.evaluate((el) => Math.round(el.getBoundingClientRect().height));

test('telefon: „Wpisy leczenia” i okno „+ Kontynuacja” bez przewijania w bok; zapis wpisu od pacjenta', async ({ page }) => {
  await page.addInitScript(() => {
    try { window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() })); } catch (_) { /* brak */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked() && Boolean(window.VildaDziennikOtylosciUI));
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  const pid = await page.evaluate(async (pts) => (await window.VildaVault.savePatient({
    name: 'Testowa Zuzanna',
    user: { lastName: 'Testowa', firstName: 'Zuzanna', sex: 'F', age: 13, ageMonths: 6, height: 162.9, weight: 75.2, dobISO: '2013-04-11' },
    obesityTherapyPoints: pts,
  }, { dedup: false })).patientId, [P('a', 'start', '2026-04-14', 0, 80, 160, '0,25 mg / tydz.'), P('b', 'continue', '2026-10-13', 6, 75.2, 162.9)]);
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id), pid);
  // P-KARTA-LECZENIE (etap 1): bloki leczenia stoją w zakładce „Leczenie” (druga, po „Status”).
  await page.locator('.vilda-patient-tab[data-tab="leczenie"]').click();
  const sekcja = page.locator('.vdo');
  await sekcja.scrollIntoViewIfNeeded();
  await expect(sekcja).toBeVisible();
  expect(await wEkranie(sekcja)).toBe(true);
  const dodaj = page.getByRole('button', { name: 'Kontynuacja' });
  expect(await wysokosc(dodaj)).toBeGreaterThanOrEqual(44);
  expect(await bezPrzewijaniaWBok(page)).toBe(true);

  await dodaj.click();
  const okno = page.locator('.vdo-dialog');
  await expect(okno).toBeVisible();
  expect(await wEkranie(okno)).toBe(true);
  await okno.locator('#vdoDate').fill('2026-11-10');
  await okno.locator('#vdoW').fill('74,6');
  const pacjent = okno.getByRole('radiogroup', { name: 'Kto zmierzył masę' }).getByRole('radio', { name: 'Pacjent' });
  expect(await wysokosc(pacjent)).toBeGreaterThanOrEqual(44);
  await expect(pacjent).toHaveAttribute('aria-checked', 'true');
  await expect(okno.locator('#vdoHInfo')).toBeVisible();
  expect(await wEkranie(okno.locator('#vdoHInfo'))).toBe(true);
  expect(await bezPrzewijaniaWBok(page)).toBe(true);
  const zapisz = okno.getByRole('button', { name: 'Zapisz wpis' });
  await zapisz.scrollIntoViewIfNeeded();
  expect(await wysokosc(zapisz)).toBeGreaterThanOrEqual(44);
  await zapisz.click();
  await expect(okno).toBeHidden();
  await expect(page.locator('.vdo-list:not(.vdo-list-deleted) > .vdo-item').first()).toContainText('74,6 kg');
  expect(await bezPrzewijaniaWBok(page)).toBe(true);
});
