import { expect, test } from '@playwright/test';
import { createFictionalVault, loadPatient, shellFrame } from '../support/centile-live-fixture.mjs';

// P-WIEK-NOWY-POMIAR na telefonie (projekt mobile-chromium), na fikcyjnym sejfie: po „Nowy pomiar” przelicznik
// otwarty natychmiast ma wiek pacjentki; komunikat o braku wieku mieści się na ekranie.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(150_000);

const bezPrzewijaniaWBok = (owner) => owner.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

test('telefon, powłoka: „Nowy pomiar” u drugiego pacjenta → przelicznik otwarty od razu ma wiek', async ({ page }) => {
  const fixture = await createFictionalVault(page, { shell: true });
  const start = fixture.frame;
  await loadPatient(start, fixture.ids.a, 'restore');
  await loadPatient(start, fixture.ids.b, 'new');
  await page.evaluate(() => window.VildaShell.navigate('lab'));
  const lab = await shellFrame(page, 'Jednostki laboratoryjne');
  await lab.waitForLoadState('load');
  await expect.poll(() => lab.evaluate(() => window.VildaSession?.getPatient?.()?.age ?? null).catch(() => null)).toBe(12);
  await expect(lab.locator('#labPatientText')).toContainText(/Kobieta · 12(\.\d)? lat · wiek dziecięcy\/młodzieńczy/);
  expect(await bezPrzewijaniaWBok(lab)).toBe(true);
  expect(await bezPrzewijaniaWBok(page)).toBe(true);
});

test('telefon, strona samodzielna: brak wieku z każdego źródła → „brak wieku” i komunikat na szerokość karty, bez przewijania w bok', async ({ page }) => {
  const fixture = await createFictionalVault(page, { shell: false });
  await loadPatient(page, fixture.ids.b, 'restore');
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  await expect.poll(() => page.evaluate(() => window.VildaSession?.getPatient?.()?.name ?? null).catch(() => null)).toBe('Fikcyjny Beata');
  await page.evaluate(() => {
    window.VildaPersistence.updateShared((s, p) => {
      delete s.age; delete s.ageMonths; delete s.dobISO;
      if (p && p.byId) { delete p.byId.age; delete p.byId.ageMonths; }
    }, { force: true });
    const main = window.VildaPersistence.readMainSession();
    delete main.user.age; delete main.user.ageMonths; delete main.user.dobISO;
    window.VildaPersistence.writeMainSession(main);
  });
  await page.reload({ waitUntil: 'load' });
  await expect.poll(() => page.evaluate(() => window.VildaSession?.getPatient?.()?.name ?? null).catch(() => null)).toBe('Fikcyjny Beata');
  await page.locator('#labSubstance').fill('TSH');
  await page.locator('#labSubstanceDropdown .lab-substance-option[data-id="tsh"]').tap();
  await expect(page.locator('#labPatientText')).toHaveText('Kobieta · brak wieku');
  const komunikat = page.locator('#labClinicalHint');
  await expect(komunikat).toBeVisible();
  await expect(komunikat).toContainText('Brak wieku pacjenta — zakres nie jest dobrany do wieku.');
  const wymiary = await komunikat.evaluate((el) => {
    const b = el.getBoundingClientRect();
    return { lewa: b.left, prawa: b.right, ekran: document.documentElement.clientWidth };
  });
  expect(wymiary.lewa).toBeGreaterThanOrEqual(0);
  expect(wymiary.prawa).toBeLessThanOrEqual(wymiary.ekran + 1);
  expect(await bezPrzewijaniaWBok(page)).toBe(true);
});
