import { expect, test } from '../support/test-czas.mjs';
import { kartaPakietu, otworzPakiet, tekst, wynikiBadan } from '../support/lab-pakiet-dane.mjs';

// LAB-PAKIETY PR2 na telefonie: krok „Normy z wydruku” mieści się w szerokości ekranu, pola mają cel dotyku
// co najmniej 44 px i równe kolumny we wszystkich wierszach, a zapis z normą działa jak na desktopie.
// Dane wyłącznie fikcyjne (tests/support/lab-pakiet-dane.mjs).
test.use({ serviceWorkers: 'block' });

test('telefon: normy z wydruku bez przewijania w poziomie, równe kolumny, cele dotyku i zapis z normą', async ({ page }) => {
  const { patientId } = await otworzPakiet(page);
  const karta = kartaPakietu(page);
  await expect(page.locator('#labPkgValue-tsh')).toBeVisible();
  await page.locator('#labPkgValue-tsh').fill('4,25');
  await page.locator('#labPkgNormLow-tsh').fill('0,27');
  await page.locator('#labPkgNormHigh-tsh').fill('4,2');
  // Najdłuższe symbole jednostek pakietu.
  await page.locator('#labPkgUnit-tsh').selectOption('μIU/mL');
  await page.locator('#labPkgNormLow-tsh').fill('0,27');
  await page.locator('#labPkgNormHigh-tsh').fill('4,2');
  await page.locator('#labPkgUnit-ft3').selectOption('pg/mL');
  await page.locator('#labPkgValue-ft3').fill('3,2');
  await page.locator('#labPkgNormLow-ft3').fill('2');
  // Błąd normy i uwaga o zmianie jednostki też mieszczą się w karcie.
  await expect(page.locator('#labPkgNormError-ft3')).toBeVisible();

  const uklad = await page.evaluate(() => {
    const strona = document.documentElement, karta = document.getElementById('labPackageCard');
    const prostokat = (el) => el.getBoundingClientRect();
    const wiersze = [...karta.querySelectorAll('.lab-pkg-norm-row')];
    const kolumna = (selektor) => wiersze.map((wiersz) => { const r = prostokat(wiersz.querySelector(selektor)); return [Math.round(r.left), Math.round(r.width)]; });
    const rowne = (lista) => lista.every(([lewa, szer]) => Math.abs(lewa - lista[0][0]) <= 1 && Math.abs(szer - lista[0][1]) <= 1);
    const od = kolumna('input[id^="labPkgNormLow-"]'), doGranicy = kolumna('input[id^="labPkgNormHigh-"]');
    return {
      stronaBezPoziomego: strona.scrollWidth <= strona.clientWidth + 1,
      kartaBezPoziomego: karta.scrollWidth <= karta.clientWidth + 1,
      // Pomiar do 0,01 px (jak w lab-pakiet-tarczyca-mobile: precyzja prostokąta przy ułamkowym położeniu).
      najmniejszyCel: Math.min(...[...karta.querySelectorAll('input.lab-pkg-norm')].map((el) => Math.round(prostokat(el).height * 100) / 100)),
      // Kolumny „od” i „do” są równe w każdym wierszu i tej samej szerokości.
      kolumnyRowne: rowne(od) && rowne(doGranicy) && Math.abs(od[0][1] - doGranicy[0][1]) <= 1,
      // Pole mieści normę z dwoma miejscami po przecinku.
      najwezszePole: Math.min(...od.map(([, szer]) => szer)),
      // Wiersze, jednostki, błąd i podpowiedzi nie wychodzą poza kartę.
      wKarcie: [...karta.querySelectorAll('.lab-pkg-norm-row, .lab-pkg-norm-unit, .lab-pkg-norm-error, .lab-pkg-hint')]
        .filter((el) => el.offsetParent !== null)
        .every((el) => prostokat(el).right <= prostokat(karta).right + 1 && prostokat(el).left >= prostokat(karta).left - 1),
      jednostkiNieUciete: [...karta.querySelectorAll('.lab-pkg-norm-unit')].every((el) => el.scrollWidth <= el.clientWidth + 1),
    };
  });
  expect(uklad).toMatchObject({ stronaBezPoziomego: true, kartaBezPoziomego: true, kolumnyRowne: true, wKarcie: true, jednostkiNieUciete: true });
  expect(uklad.najmniejszyCel).toBeGreaterThanOrEqual(44);
  expect(uklad.najwezszePole).toBeGreaterThanOrEqual(64);

  await page.locator('#labPkgNormHigh-ft3').fill('4,4');
  expect(await tekst(karta.locator('.lab-pkg-card[data-analyte="tsh"]'))).toBe('TSH 4,25 μIU/mL powyżej normy z wydruku = 4,25 mIU/L Norma z wydruku: 0,27–4,2 μIU/mL laboratorium Norma aplikacji · Młodzież 11–19 lat: 0,5–4,3 μIU/mL');
  await page.locator('#labPkgSave').click();
  await expect(page.locator('#labPkgDone')).toBeVisible();
  expect((await wynikiBadan(page, patientId)).map((n) => [n.labResult.testKey, n.labResult.valueNum, n.labResult.unit, n.labResult.norm])).toEqual([
    ['ft3', 3.2, 'pg/mL', '2–4,4 pg/mL'], ['tsh', 4.25, 'μIU/mL', '0,27–4,2 μIU/mL'],
  ]);
  // Podpowiedź po zapisie także na telefonie mieści się w karcie.
  await expect(page.locator('#labPkgPrefillHint')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});
