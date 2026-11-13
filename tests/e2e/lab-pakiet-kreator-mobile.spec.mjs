import { expect, test } from '../support/test-czas.mjs';
import { kartaPakietu, otworzPakiet, tekst, wynikiBadan } from '../support/lab-pakiet-dane.mjs';

// LAB-PAKIETY PR4 na telefonie: kreator własnego pakietu i formularz pakietu z dłuższymi nazwami badań mieszczą
// się w szerokości ekranu, cele dotyku mają co najmniej 44 px, a zapis działa jak na komputerze.
// Dane wyłącznie fikcyjne (tests/support/lab-pakiet-dane.mjs).
test.use({ serviceWorkers: 'block' });

// Pomiar do 0,01 px: przy ułamkowym położeniu na stronie prostokąt pola 44 px ma wysokość 43,99994 px.
const uklad = (page, selektorCelow) => page.evaluate((selektor) => {
  const strona = document.documentElement, karta = document.getElementById('labPackageCard');
  const prostokat = (el) => el.getBoundingClientRect();
  const cele = [...document.querySelectorAll(selektor)].filter((el) => el.offsetParent !== null);
  return {
    stronaBezPoziomego: strona.scrollWidth <= strona.clientWidth + 1,
    kartaBezPoziomego: karta.scrollWidth <= karta.clientWidth + 1,
    liczbaCelow: cele.length,
    najmniejszyCel: Math.min(...cele.map((el) => Math.round(prostokat(el).height * 100) / 100)),
    najwezszyCel: Math.min(...cele.map((el) => Math.round(prostokat(el).width * 100) / 100)),
  };
}, selektorCelow);

test('telefon: kreator pakietu i pakiet z dłuższymi nazwami — bez przewijania w poziomie, cele dotyku, zapis', async ({ page }) => {
  const { patientId } = await otworzPakiet(page);
  const karta = kartaPakietu(page);
  await expect(page.locator('#labPkgSelect')).toBeVisible();
  // Lista wyboru zajmuje całą szerokość kroku; strzałka ma odstęp od prawej krawędzi (własna, 14 px od brzegu).
  const lista = await page.locator('#labPkgSelect').evaluate((el) => {
    const styl = getComputedStyle(el);
    return { strzalka: styl.backgroundPositionX, natywna: styl.appearance, odstep: parseFloat(styl.paddingRight), wysokosc: el.getBoundingClientRect().height };
  });
  expect(lista.natywna).toBe('none');
  expect(lista.strzalka).toBe('calc(100% - 14px)');
  expect(lista.odstep).toBeGreaterThanOrEqual(36);
  expect(lista.wysokosc).toBeGreaterThanOrEqual(44);

  await page.locator('#labPkgNew').click();
  await page.locator('#labPkgCreatorName').fill('Dojrzewanie i nadnercza');
  await page.locator('#labPkgCreatorSearch').fill('lh');
  await page.locator('#labPkgCreatorOpt-lh').check();
  await page.locator('#labPkgCreatorSearch').fill('');
  await page.locator('#labPkgCreatorOpt-fsh').check();
  await page.locator('#labPkgCreatorGroups details').evaluateAll((grupy) => grupy.forEach((g) => { g.open = true; }));
  for (const id of ['estradiol', 'testosterone_total', 'oh17_progesterone']) await page.locator(`#labPkgCreatorOpt-${id}`).check();
  await expect(page.locator('#labPkgCreatorCount')).toHaveText('5 z 10');

  // Kreator: pola, przyciski kolejności, nagłówki grup i wiersze wyboru badania to cele dotyku ≥ 44 px.
  const kreator = await uklad(page, '#labPkgCreator input:not([type="checkbox"]), #labPkgCreator button, #labPkgCreator summary, #labPkgCreator label.lab-pkg-creator-option');
  expect(kreator).toMatchObject({ stronaBezPoziomego: true, kartaBezPoziomego: true });
  expect(kreator.liczbaCelow).toBeGreaterThan(60);
  expect(kreator.najmniejszyCel).toBeGreaterThanOrEqual(44);
  expect(kreator.najwezszyCel).toBeGreaterThanOrEqual(44);
  // Nazwa badania stoi w całej szerokości pozycji, przyciski kolejności pod nią, przy prawej krawędzi.
  const pozycja = await page.locator('#labPkgCreatorList li[data-analyte="testosterone_total"]').evaluate((li) => {
    const p = (el) => el.getBoundingClientRect();
    const nazwa = li.querySelector('.lab-pkg-creator-item-name'), akcje = li.querySelector('.lab-pkg-creator-item-actions'), przyciski = [...akcje.querySelectorAll('button')];
    return {
      nazwa: nazwa.textContent, jednaLinia: p(nazwa).height < 30,
      akcjePodNazwa: p(akcje).top >= p(nazwa).bottom,
      przyPrawej: Math.abs(p(przyciski[2]).right - (p(li).right - parseFloat(getComputedStyle(li).paddingRight) - parseFloat(getComputedStyle(li).borderRightWidth))) <= 1,
      wPozycji: przyciski.every((b) => p(b).left >= p(li).left && p(b).right <= p(li).right),
    };
  });
  expect(pozycja).toEqual({ nazwa: 'Testosteron całkowity', jednaLinia: true, akcjePodNazwa: true, przyPrawej: true, wPozycji: true });
  await page.locator('#labPkgCreatorSave').click();
  await expect(page.locator('#labPkgCreator')).toBeHidden();

  // Formularz: przy dłuższych nazwach etykieta stoi nad polem; pole i jednostka w jednym wierszu, bez ucinania.
  await expect(karta.locator('.lab-pkg-row-label')).toHaveText(['LH', 'FSH', 'Estradiol', 'Testosteron całkowity', '17-OH-progesteron']);
  await page.locator('#labPkgValue-lh').fill('2,1');
  await page.locator('#labPkgValue-estradiol').fill('60');
  await page.locator('#labPkgUnit-testosterone_total').selectOption('ng/dL');
  await page.locator('#labPkgValue-testosterone_total').fill('25');
  await page.locator('#labPkgValue-oh17_progesterone').fill('3');
  await page.locator('#labPkgNormLow-lh').fill('0,3');
  await page.locator('#labPkgNormHigh-lh').fill('4');
  const formularz = await uklad(page, '#labPackageCard input, #labPackageCard select, #labPackageCard button');
  expect(formularz).toMatchObject({ stronaBezPoziomego: true, kartaBezPoziomego: true });
  expect(formularz.najmniejszyCel).toBeGreaterThanOrEqual(44);
  const wiersze = await page.evaluate(() => {
    const p = (el) => el.getBoundingClientRect(), karta = document.getElementById('labPackageCard');
    const wynik = [...karta.querySelectorAll('.lab-pkg-row')].map((wiersz) => {
      const etykieta = wiersz.querySelector('.lab-pkg-row-label'), pole = wiersz.querySelector('.lab-pkg-value'), jednostka = wiersz.querySelector('.lab-pkg-unit');
      return p(etykieta).bottom <= p(pole).top && Math.abs(p(pole).top - p(jednostka).top) <= 1 && p(pole).right <= p(jednostka).left
        && p(etykieta).height < 30 && jednostka.scrollWidth <= jednostka.clientWidth + 1 && p(pole).width >= 120;
    });
    const normy = [...karta.querySelectorAll('.lab-pkg-norm-row')].map((wiersz) => {
      const etykieta = wiersz.querySelector('.lab-pkg-norm-label'), pola = [...wiersz.querySelectorAll('.lab-pkg-norm')], jednostka = wiersz.querySelector('.lab-pkg-norm-unit');
      return p(etykieta).bottom <= p(pola[0].closest('input')).top && Math.abs(p(pola[0]).top - p(pola[1]).top) <= 1
        && Math.abs(p(pola[0]).width - p(pola[1]).width) <= 1 && p(pola[1]).right <= p(jednostka).left + 1 && p(jednostka).right <= p(wiersz).right + 1;
    });
    // Kolumny pól i jednostek są równe we wszystkich wierszach.
    const lewe = [...karta.querySelectorAll('.lab-pkg-unit')].map((el) => Math.round(p(el).left));
    return { wiersze: wynik, normy, rowneKolumny: new Set(lewe).size === 1,
      wKarcie: [...karta.querySelectorAll('.lab-pkg-card, .lab-pkg-save, .lab-pkg-row, .lab-pkg-norm-row, .lab-pkg-contents')].every((el) => p(el).right <= p(karta).right + 1 && p(el).left >= p(karta).left - 1) };
  });
  expect(wiersze).toEqual({ wiersze: Array(5).fill(true), normy: Array(5).fill(true), rowneKolumny: true, wKarcie: true });

  // Karty oceny: testosteron bez oceny w pakiecie z łączem (cel dotyku), 17-OHP oceniony normą dla metody immunochemicznej.
  const testosteron = karta.locator('.lab-pkg-card[data-analyte="testosterone_total"]');
  expect(await tekst(testosteron)).toBe('Testosteron całkowity 25 ng/dL bez oceny w pakiecie = 0,867 nmol/L Ocena pokwitaniowa w pojedynczym badaniu albo z normy z wydruku. Oceń Testosteron całkowity w pojedynczym badaniu →');
  expect(await tekst(karta.locator('.lab-pkg-card[data-analyte="lh"]'))).toBe('LH 2,1 IU/L w normie z wydruku Norma z wydruku: 0,3–4 IU/L laboratorium Oceń LH w pojedynczym badaniu →');
  await expect(karta.locator('.lab-pkg-card[data-analyte="oh17_progesterone"] .lab-range-status')).toHaveClass(/is-(normal|below|above|uwaga-low|uwaga-high)/);

  await page.locator('#labPkgSave').click();
  await expect(page.locator('#labPkgDone')).toBeVisible();
  expect((await wynikiBadan(page, patientId)).map((n) => [n.labResult.testKey, n.labResult.valueNum, n.labResult.unit, Object.keys(n.labResult).filter((k) => ['range', 'norm', 'assessment'].includes(k))])).toEqual([
    ['estradiol', 60, 'pmol/L', ['range']], ['lh', 2.1, 'IU/L', ['norm']], ['oh17_progesterone', 3, 'nmol/L', ['range']], ['testosterone_total', 25, 'ng/dL', []],
  ]);
});
