import { expect, test } from '@playwright/test';
import { createFictionalVault, loadPatient, shellFrame } from '../support/centile-live-fixture.mjs';

// P-BADANIA-WEJSCIE na telefonie (projekt mobile-chromium), w prawdziwej powłoce i na fikcyjnym sejfie: jedna akcja
// na szerokość zakładki, bez poziomego przewijania; wczytanie pacjenta, wybór wizyty i przelicznik z jego wiekiem.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(150_000);

const bezPrzewijaniaWBok = (owner) => owner.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

test('telefon: „Wczytaj pacjenta i dodaj wyniki →” na szerokość zakładki; po wyborze „Nowy pomiar” przelicznik z pacjentem i wiekiem', async ({ page }) => {
  const fixture = await createFictionalVault(page, { shell: true });
  const start = fixture.frame;
  await loadPatient(start, fixture.ids.a, 'restore');
  await page.evaluate((pid) => window.VildaShell.openPatientCardInStart(pid, { activeTab: 'lab' }), fixture.ids.b);
  const badania = start.locator('.vilda-patient-lab-section');
  const przycisk = badania.getByRole('button', { name: 'Wczytaj pacjenta i dodaj wyniki →' });
  await expect(przycisk).toBeVisible();
  const wymiary = await przycisk.evaluate((el) => {
    const b = el.getBoundingClientRect(), a = el.parentElement.getBoundingClientRect();
    return { wysokosc: b.height, szerokosc: b.width, akcje: a.width, jednaLinia: el.scrollHeight <= el.clientHeight + 1 };
  });
  expect(wymiary.wysokosc).toBeGreaterThanOrEqual(44);
  expect(Math.abs(wymiary.szerokosc - wymiary.akcje)).toBeLessThanOrEqual(1);
  expect(wymiary.jednaLinia).toBe(true);
  expect(await bezPrzewijaniaWBok(start)).toBe(true);
  expect(await bezPrzewijaniaWBok(page)).toBe(true);

  await przycisk.tap();
  const okno = start.locator('#vildaLoadChoiceModal');
  await expect(okno).toBeVisible();
  await start.waitForFunction(() => !window.VildaDobAge?.restorePending?.());
  await start.evaluate(() => new Promise(resolve => { requestAnimationFrame(() => { requestAnimationFrame(resolve); }); }));
  await start.locator('#vildaLcmNew').tap();
  await expect(page).toHaveURL(/\/app\.html#\/lab/, { timeout: 20_000 });
  const lab = await shellFrame(page, 'Jednostki laboratoryjne');
  await lab.waitForLoadState('load');
  await expect.poll(() => lab.evaluate(() => ({ id: sessionStorage.getItem('vildaCurrentPatientId'), wiek: window.VildaSession?.getPatient?.()?.age ?? null })).catch(() => null))
    .toEqual({ id: fixture.ids.b, wiek: 12 });
  await expect(lab.locator('#labPatientText')).toContainText(/Kobieta · 12(\.\d)? lat/);
  expect(await bezPrzewijaniaWBok(lab)).toBe(true);
  expect(await bezPrzewijaniaWBok(page)).toBe(true);
});
