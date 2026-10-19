import { expect, test } from '../support/test-czas.mjs';

// Warsztat przelicznika (decyzja właściciela 2026-10-19) na telefonie: układ zostaje jednokolumnowy, w kolejności
// formularz → wynik → wykres; jedyna zmiana to „Wyczyść wszystkie pola” na końcu formularza, przed wynikiem.
// Pacjent fikcyjny; test sprawdza tylko geometrię.
test.use({ serviceWorkers: 'block' });

test('telefon: jedna kolumna, „Wyczyść” przed wynikiem, bez poziomego przewijania', async ({ page }) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || /^(data|blob):$/.test(url.protocol) ? route.continue() : route.abort();
  });
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    const d = new Date();
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    localStorage.setItem('vilda-reminders-shown-v1', `${iso}|${Date.now()}`);
    localStorage.setItem('vilda-reminders-closed-v1', `${iso}|${Date.now()}`);
  });
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaLabPubertyRuntime && window.VildaLabInhibinB && window.VildaPersistence));
  const zgoda = page.locator('#consent-decline');
  if (await zgoda.isVisible()) await zgoda.click();
  await page.evaluate(() => {
    if (!window.VildaPersistence.writeShared({ name: 'Fikcyjny pacjent układu', sex: 'M', age: 9, ageMonths: 0 }, { force: true })) {
      throw new Error('Nie zapisano fikcyjnego pacjenta');
    }
  });
  await page.locator('#labSubstance').fill('Inhibina B');
  await page.locator('#labSubstanceDropdown [data-id="inhibin_b"]').click();
  await page.locator('#labUnit').selectOption('pg/mL');
  await page.locator('#labValue').fill('100');
  await expect(page.locator('#labHormoneLifespan > .vilda-hormone-lifespan')).toBeVisible();

  const u = await page.evaluate(() => {
    const r = (id) => { const b = document.getElementById(id).getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; };
    return {
      formularz: r('labFormPane'), wyczysc: r('labClearBtn'), wynik: r('labResultSection'), wykres: r('labChartPane'),
      poziomePrzewijanie: document.documentElement.scrollWidth > window.innerWidth,
      pozycja: getComputedStyle(document.getElementById('labFormPane')).position,
    };
  });
  expect(u.poziomePrzewijanie).toBe(false);
  expect(u.pozycja).not.toBe('sticky');
  expect(u.wyczysc.b).toBeLessThanOrEqual(u.wynik.t);
  expect(u.wynik.t).toBeGreaterThanOrEqual(u.formularz.b - 1);
  // Wykres pod wynikiem, w tej samej kolumnie (sekcja wyniku ma ujemny dolny margines, więc bez porównania krawędzi).
  expect(u.wykres.t).toBeGreaterThan(u.wynik.t);
  expect(Math.abs(u.wykres.l - u.formularz.l)).toBeLessThanOrEqual(1);
});
