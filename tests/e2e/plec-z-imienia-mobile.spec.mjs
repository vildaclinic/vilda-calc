import { expect, test } from '@playwright/test';

// P-PLEC-IMIE na PRAWDZIWYM widoku telefonu (projekt mobile-chromium): notka pod polem płci jest
// widoczna, mieści się w szerokości ekranu i nie robi poziomego przewijania (AGENTS.md § 6).
// Dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#PlecMobile!26a';

test('telefon: nazwisko -ska i imię ustawiają „Kobieta”, notka mieści się na ekranie, bez poziomego przewijania', async ({ page }) => {
  test.setTimeout(150_000);
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.waitForFunction(() => Boolean(window.VildaPlecZImienia) && typeof window.saveUserData === 'function');
  await page.waitForTimeout(1500);

  await page.locator('#lastName').fill('Testowska');
  await page.locator('#lastName').press('Tab');
  await page.locator('#firstName').fill('Anna');
  await page.locator('#firstName').press('Tab');
  expect(await page.locator('#sex').inputValue()).toBe('F');
  const notka = page.locator('#plecZImieniaNote');
  await expect(notka).toHaveText('Płeć ustawiona na podstawie imienia i nazwiska — sprawdź.');
  await notka.scrollIntoViewIfNeeded();

  const pomiar = await page.evaluate(() => {
    const r = document.getElementById('plecZImieniaNote').getBoundingClientRect();
    return {
      lewa: r.left, prawa: r.right, szerokoscOkna: window.innerWidth,
      przewijanie: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(pomiar.lewa).toBeGreaterThanOrEqual(0);
  expect(pomiar.prawa).toBeLessThanOrEqual(pomiar.szerokoscOkna);
  expect(pomiar.przewijanie, 'brak poziomego przewijania').toBeLessThanOrEqual(0);
});
