import { expect, test } from '../support/test-czas.mjs';
import { kartaPakietu, otworzPakiet, tekst, wynikiBadan } from '../support/lab-pakiet-dane.mjs';

// LAB-PAKIETY PR1 na telefonie: karta pakietu mieści się w szerokości ekranu, pola i przyciski mają cel dotyku
// co najmniej 44 px, a zapis działa jak na desktopie. Dane wyłącznie fikcyjne (tests/support/lab-pakiet-dane.mjs).
test.use({ serviceWorkers: 'block' });

test('telefon: zakładki trybu, pakiet bez przewijania w poziomie, cele dotyku i zapis', async ({ page }) => {
  const { patientId } = await otworzPakiet(page);
  const karta = kartaPakietu(page);
  await expect(page.locator('#labPkgValue-tsh')).toBeVisible();
  await page.locator('#labPkgValue-tsh').fill('6,8');
  await page.locator('#labPkgUnit-ft4').selectOption('ng/dL');
  await page.locator('#labPkgValue-ft4').fill('1,1');
  await page.locator('#labPkgUnit-ft3').selectOption('pg/mL');
  await page.locator('#labPkgValue-ft3').fill('3,2');
  await expect(karta.locator('.lab-pkg-card svg.lab-pkg-bar')).toHaveCount(3);

  const uklad = await page.evaluate(() => {
    const strona = document.documentElement, karta = document.getElementById('labPackageCard');
    const prostokat = (el) => el.getBoundingClientRect();
    const cele = [...document.querySelectorAll('#labModeBar button, #labPackageCard input, #labPackageCard select, #labPackageCard button')]
      .filter((el) => el.offsetParent !== null);
    const przyciski = [...document.querySelectorAll('#labModeBar button')].map(prostokat);
    return {
      stronaBezPoziomego: strona.scrollWidth <= strona.clientWidth + 1,
      kartaBezPoziomego: karta.scrollWidth <= karta.clientWidth + 1,
      // Pomiar do 0,01 px: przy ułamkowym położeniu na stronie prostokąt pola 44 px ma wysokość 43,99994 px
      // (precyzja liczb zmiennoprzecinkowych, nie rozmiar pola).
      najmniejszyCel: Math.min(...cele.map((el) => Math.round(prostokat(el).height * 100) / 100)),
      // Jednostka mieści najdłuższy symbol bez ucinania.
      jednostkiMieszczaSie: [...karta.querySelectorAll('select.lab-pkg-unit')].every((el) => el.scrollWidth <= el.clientWidth + 1),
      // Dwie zakładki trybu obok siebie, równej szerokości, w karcie przelicznika pod jej tytułem.
      trybObokSiebie: Math.abs(przyciski[0].top - przyciski[1].top) <= 1 && Math.abs(przyciski[0].width - przyciski[1].width) <= 2,
      zakladkiWKarcie: document.getElementById('labResultsCard').contains(document.getElementById('labModeBar'))
        && prostokat(document.querySelector('#labResultsCard h1')).bottom <= przyciski[0].top && przyciski[0].bottom <= prostokat(karta).top,
      // Karty oceny i wiersz zapisu nie wychodzą poza kartę.
      wKarcie: [...karta.querySelectorAll('.lab-pkg-card, .lab-pkg-save, .lab-pkg-row')].every((el) => prostokat(el).right <= prostokat(karta).right + 1 && prostokat(el).left >= prostokat(karta).left - 1),
    };
  });
  expect(uklad).toMatchObject({ stronaBezPoziomego: true, kartaBezPoziomego: true, jednostkiMieszczaSie: true, trybObokSiebie: true, zakladkiWKarcie: true, wKarcie: true });
  expect(uklad.najmniejszyCel).toBeGreaterThanOrEqual(44);

  expect(await tekst(karta.locator('.lab-pkg-card[data-analyte="ft3"]'))).toBe('fT3 3,2 pg/mL w zakresie normy = 4,92 pmol/L Norma · Dzieci 1–14 lat: 3–5,1 pg/mL');
  await page.locator('#labPkgSave').click();
  await expect(page.locator('#labPkgDone')).toBeVisible();
  expect((await wynikiBadan(page, patientId)).map((n) => [n.labResult.testKey, n.labResult.valueNum, n.labResult.unit, n.labResult.range.classification])).toEqual([
    ['ft3', 3.2, 'pg/mL', 'within'], ['ft4', 1.1, 'ng/dL', 'within'], ['tsh', 6.8, 'mIU/L', 'above'],
  ]);
});
