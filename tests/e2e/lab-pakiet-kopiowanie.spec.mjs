import { expect, test } from '../support/test-czas.mjs';
import { kartaPakietu, otworzPakiet, wczytajPacjenta, wynikiBadan } from '../support/lab-pakiet-dane.mjs';

// LAB-PAKIETY PR3 (propozycja właściciela 2026-11-13): wyniki pakietu kopiuje przycisk „Kopiuj wyniki” przy samym
// pakiecie — nie karta „Podsumowanie wyników” na stronie głównej. Tekst niesie tę samą ocenę i normę, które
// pokazuje karta wyniku (norma z wydruku, gdy ją wpisano, inaczej norma aplikacji). Prawdziwy, fikcyjny sejf
// (tests/support/lab-pakiet-dane.mjs; zegar stron 17.06.2026). Dane wyłącznie fikcyjne.
test.use({ serviceWorkers: 'block' });

// Schowek pod kontrolą testu (jak w bmi-jedna-liczba): zapis ląduje w window.__schowek.
async function zeSchowkiem(page) {
  await page.addInitScript(() => {
    window.__schowek = null;
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: (t) => { window.__schowek = t; return Promise.resolve(); } }, configurable: true });
  });
}
const schowek = (page) => page.evaluate(() => window.__schowek);
const przycisk = (page) => page.locator('#labPkgCopy');

test('„Kopiuj wyniki” kładzie w schowku wpisane wyniki z oceną i normą z ekranu — także bez zapisu do karty', async ({ page }) => {
  await zeSchowkiem(page);
  const { patientId } = await otworzPakiet(page);
  const karta = kartaPakietu(page);
  await expect(page.locator('#labPkgValue-tsh')).toBeVisible();
  // Przycisk zamyka kolumnę oceny; bez wyników jest nieczynny.
  await expect(przycisk(page)).toHaveText('Kopiuj wyniki');
  await expect(przycisk(page)).toBeDisabled();
  expect(await page.evaluate(() => {
    const kolumna = document.querySelector('.lab-pkg-results');
    return kolumna.lastElementChild === document.getElementById('labPkgCopy');
  })).toBe(true);

  // Fikcyjna pacjentka 12 l 3 m: TSH powyżej normy aplikacji, fT4 w normie z wydruku, fT3 w normie aplikacji.
  await page.locator('#labPkgValue-tsh').fill('6,8');
  await page.locator('#labPkgValue-ft4').fill('14,2');
  await page.locator('#labPkgNormLow-ft4').fill('12,0');
  await page.locator('#labPkgNormHigh-ft4').fill('22,0');
  await page.locator('#labPkgValue-ft3').fill('6,1');
  await page.locator('#labPkgDate').fill('2026-06-15');
  await expect(przycisk(page)).toBeEnabled();
  await przycisk(page).click();
  await expect(page.locator('#labToast')).toHaveText('✓ Skopiowano wyniki: TSH, fT4, fT3');
  expect(await schowek(page)).toBe([
    'Badania (pobranie 15.06.2026):',
    'TSH: 6,8 mIU/L — powyżej normy (norma 0,5–4,3)',
    'fT4: 14,2 pmol/L (norma z wydruku 12–22)',
    'fT3: 6,1 pmol/L (norma 4,61–7,83)',
  ].join('\n'));
  // Tekst mówi to samo co karty oceny na ekranie.
  await expect(karta.locator('.lab-pkg-card[data-analyte="tsh"] .lab-range-status')).toHaveText('powyżej normy');
  await expect(karta.locator('.lab-pkg-card[data-analyte="ft4"] .lab-range-status')).toHaveText('w normie z wydruku');
  // Kopiowanie niczego nie zapisuje i nie czyści formularza.
  expect(await wynikiBadan(page, patientId)).toEqual([]);
  await expect(page.locator('#labPkgValue-tsh')).toHaveValue('6,8');
  await expect(page.locator('#labPkgSave')).toBeEnabled();

  // Norma z wydruku zmienia ocenę w tekście tak jak na karcie; jednostka spoza Windows-1250 (μ) idzie jako „µ”.
  await page.locator('#labPkgUnit-tsh').selectOption('μIU/mL');
  await page.locator('#labPkgNormLow-tsh').fill('0,27');
  await page.locator('#labPkgNormHigh-tsh').fill('7');
  await page.locator('#labPkgValue-ft4').fill('');
  await page.locator('#labPkgValue-ft3').fill('2');
  await przycisk(page).click();
  await expect(page.locator('#labToast')).toHaveText('✓ Skopiowano wyniki: TSH, fT3');
  expect(await schowek(page)).toBe([
    'Badania (pobranie 15.06.2026):',
    'TSH: 6,8 µIU/mL (norma z wydruku 0,27–7)',
    'fT3: 2 pmol/L — znacznie poniżej normy (norma 4,61–7,83)',
  ].join('\n'));
});

test('błędny wynik, błędna norma i zła data wyłączają kopiowanie; po poprawie wraca', async ({ page }) => {
  await zeSchowkiem(page);
  await otworzPakiet(page);
  await page.locator('#labPkgValue-tsh').fill('2,5');
  await expect(przycisk(page)).toBeEnabled();
  await page.locator('#labPkgValue-ft4').fill('abc');
  await expect(przycisk(page)).toBeDisabled();
  await page.locator('#labPkgValue-ft4').fill('');
  await expect(przycisk(page)).toBeEnabled();
  await page.locator('#labPkgNormLow-tsh').fill('1');
  await expect(przycisk(page)).toBeDisabled();
  await page.locator('#labPkgNormHigh-tsh').fill('4');
  await expect(przycisk(page)).toBeEnabled();
  await page.locator('#labPkgDate').fill('2026-06-18');
  await expect(przycisk(page)).toBeDisabled();
  await page.locator('#labPkgDate').fill('2026-06-17');
  await expect(przycisk(page)).toBeEnabled();
  expect(await schowek(page)).toBeNull();
  await przycisk(page).click();
  expect(await schowek(page)).toBe('Badania (pobranie 17.06.2026):\nTSH: 2,5 mIU/L (norma z wydruku 1–4)');
});

test('po zapisie formularz jest pusty, a przycisk kopiuje zapisany zestaw; nowy wpis i inny pacjent go zastępują', async ({ page }) => {
  await zeSchowkiem(page);
  const { patientId } = await otworzPakiet(page);
  await page.locator('#labPkgValue-tsh').fill('6,8');
  await page.locator('#labPkgUnit-ft4').selectOption('ng/dL');
  await page.locator('#labPkgValue-ft4').fill('1,1');
  await page.locator('#labPkgNormLow-ft4').fill('0,93');
  await page.locator('#labPkgNormHigh-ft4').fill('1,7');
  await page.locator('#labPkgDate').fill('2026-06-15');
  await page.locator('#labPkgSave').click();
  await expect(page.locator('#labPkgDone')).toBeVisible();
  await expect(page.locator('#labPkgValue-tsh')).toHaveValue('');
  expect((await wynikiBadan(page, patientId)).map((n) => n.labResult.testKey)).toEqual(['ft4', 'tsh']);

  // Zapisany zestaw: tekst z datą pobrania zapisu, choć pole daty wróciło na dziś.
  await expect(page.locator('#labPkgDate')).toHaveValue('2026-06-17');
  await expect(przycisk(page)).toHaveText('Kopiuj zapisane wyniki');
  await expect(przycisk(page)).toBeEnabled();
  await przycisk(page).click();
  await expect(page.locator('#labToast')).toHaveText('✓ Skopiowano wyniki: TSH, fT4');
  expect(await schowek(page)).toBe([
    'Badania (pobranie 15.06.2026):',
    'TSH: 6,8 mIU/L — powyżej normy (norma 0,5–4,3)',
    'fT4: 1,1 ng/dL (norma z wydruku 0,93–1,7)',
  ].join('\n'));
  // Panel „Zapisano…” zostaje po skopiowaniu.
  await expect(page.locator('#labPkgDone')).toBeVisible();

  // Nowy wpis zastępuje zapisany zestaw: przycisk kopiuje to, co jest w formularzu (z podpowiedzianą normą fT4).
  await page.locator('#labPkgValue-ft4').fill('1,8');
  await expect(przycisk(page)).toHaveText('Kopiuj wyniki');
  await przycisk(page).click();
  expect(await schowek(page)).toBe('Badania (pobranie 17.06.2026):\nfT4: 1,8 ng/dL — powyżej normy (norma z wydruku 0,93–1,7)');

  // Zapisany zestaw nie przechodzi na innego pacjenta.
  await page.locator('#labPkgSave').click();
  await expect(page.locator('#labPkgDone')).toBeVisible();
  await expect(przycisk(page)).toHaveText('Kopiuj zapisane wyniki');
  const drugi = await page.evaluate(async () => (await window.VildaVault.savePatient({
    name: 'Fikcyjny Drugi', user: { name: 'Fikcyjny Drugi', sex: 'M', age: 40, ageMonths: 0, height: 180, weight: 80 },
  }, { dedup: false })).patientId);
  await wczytajPacjenta(page, drugi, { name: 'Fikcyjny Drugi', sex: 'M', age: 40, ageMonths: 0 });
  await expect(kartaPakietu(page).locator('.lab-pkg-save-ctx')).toHaveText('Fikcyjny Drugi · wizyta: 40 l');
  await expect(page.locator('#labPkgDone')).toBeHidden();
  await expect(przycisk(page)).toHaveText('Kopiuj wyniki');
  await expect(przycisk(page)).toBeDisabled();
});

test('gdy schowek odmawia, użytkownik dostaje komunikat, a formularz zostaje', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('odmowa')) }, configurable: true });
  });
  await otworzPakiet(page);
  await page.locator('#labPkgValue-tsh').fill('2,5');
  await przycisk(page).click();
  await expect(page.locator('#labToast')).toHaveText('Nie udało się skopiować — skopiuj ręcznie.');
  await expect(page.locator('#labPkgValue-tsh')).toHaveValue('2,5');
});
