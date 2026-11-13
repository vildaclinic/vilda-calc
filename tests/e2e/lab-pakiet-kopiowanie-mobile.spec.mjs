import { expect, test } from '../support/test-czas.mjs';
import { otworzPakiet } from '../support/lab-pakiet-dane.mjs';

// LAB-PAKIETY PR3 na telefonie: „Kopiuj wyniki” zamyka kolumnę oceny na pełną szerokość karty, ma cel dotyku
// co najmniej 44 px i kopiuje ten sam tekst co na komputerze. Dane wyłącznie fikcyjne.
test.use({ serviceWorkers: 'block' });

test('telefon: „Kopiuj wyniki” na szerokość karty, cel dotyku, tekst w schowku i brak przewijania w poziomie', async ({ page }) => {
  await page.addInitScript(() => {
    window.__schowek = null;
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: (t) => { window.__schowek = t; return Promise.resolve(); } }, configurable: true });
  });
  await otworzPakiet(page);
  await expect(page.locator('#labPkgValue-tsh')).toBeVisible();
  await page.locator('#labPkgValue-tsh').fill('6,8');
  await page.locator('#labPkgUnit-ft3').selectOption('pg/mL');
  await page.locator('#labPkgValue-ft3').fill('3,2');

  const uklad = await page.evaluate(() => {
    const prostokat = (el) => el.getBoundingClientRect();
    const przycisk = document.getElementById('labPkgCopy'), zapis = document.querySelector('.lab-pkg-save'), karta = document.getElementById('labPackageCard');
    const p = prostokat(przycisk), z = prostokat(zapis), k = prostokat(karta);
    return {
      // Pomiar do 0,01 px (jak w lab-pakiet-tarczyca-mobile: precyzja prostokąta przy ułamkowym położeniu).
      wysokosc: Math.round(p.height * 100) / 100,
      // Pod wierszem zapisu, na jego szerokość, w karcie.
      podZapisem: p.top >= z.bottom, szerokoscZapisu: Math.abs(p.left - z.left) <= 1 && Math.abs(p.right - z.right) <= 1,
      wKarcie: p.left >= k.left - 1 && p.right <= k.right + 1,
      bezPoziomego: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    };
  });
  expect(uklad).toMatchObject({ podZapisem: true, szerokoscZapisu: true, wKarcie: true, bezPoziomego: true });
  expect(uklad.wysokosc).toBeGreaterThanOrEqual(44);

  await page.locator('#labPkgCopy').tap();
  await expect(page.locator('#labToast')).toHaveText('✓ Skopiowano wyniki: TSH, fT3');
  expect(await page.evaluate(() => window.__schowek)).toBe([
    'Badania (pobranie 17.06.2026):',
    'TSH: 6,8 mIU/L — powyżej normy (norma 0,5–4,3)',
    'fT3: 3,2 pg/mL (norma 3–5,1)',
  ].join('\n'));
});
