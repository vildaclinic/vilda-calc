import { expect, test } from '../support/test-czas.mjs';
import { czekajNaBadania, sekcjaBadan } from '../support/karta-czekanie.mjs';
import { kartaPakietu, otworzPakiet, tekst, wczytajPacjenta, wynikiBadan } from '../support/lab-pakiet-dane.mjs';

// LAB-PAKIETY PR2: „Normy z wydruku” w pakiecie na prawdziwym, fikcyjnym sejfie (tests/support/lab-pakiet-dane.mjs;
// zegar stron 17.06.2026). Decyzje właściciela: wpisana norma laboratorium zastępuje normę aplikacji dla tego wyniku
// i zapisuje się razem z nim (makieta, 2026-11-12); podpowiedź normy pochodzi wyłącznie z poprzedniego wyniku tego
// samego badania u tego samego pacjenta, a pacjent bez wcześniejszego wyniku nie dostaje żadnej (2026-11-13).
// Dane wyłącznie fikcyjne.
test.use({ serviceWorkers: 'block' });

const pola = (page) => page.evaluate(() => ['tsh', 'ft4', 'ft3'].map((id) => [
  document.getElementById(`labPkgUnit-${id}`).value,
  document.getElementById(`labPkgNormLow-${id}`).value,
  document.getElementById(`labPkgNormHigh-${id}`).value,
  document.getElementById(`labPkgNormLow-${id}`).classList.contains('is-prefilled'),
]));
const karty = (karta, id) => karta.locator(`.lab-pkg-card[data-analyte="${id}"]`);
async function wpiszNorme(page, id, od, doGranicy) {
  await page.locator(`#labPkgNormLow-${id}`).fill(od);
  await page.locator(`#labPkgNormHigh-${id}`).fill(doGranicy);
}

test('norma z wydruku zastępuje normę aplikacji w ocenie i zapisuje się z wynikiem; „Badania” pokazują zakres z wpisu', async ({ page }) => {
  const { patientId } = await otworzPakiet(page);
  const karta = kartaPakietu(page);
  await expect(page.locator('#labPkgValue-tsh')).toBeVisible();
  // Krok norm stoi między wynikami a datą pobrania.
  await expect(karta.locator('.lab-pkg-step .lab-step-label')).toHaveText([/^Pakiet/, /^Wyniki z wydruku/, /^Normy z wydruku\s*— opcjonalnie$/, /^Data pobrania i komentarz/, /^Pacjent/]);
  await expect(karta.locator('.lab-pkg-step .lab-step-num')).toHaveText(['✓', '2', '3', '4', '5']);
  await expect(karta.locator('.lab-pkg-norm-label')).toHaveText(['TSH', 'fT4', 'fT3']);
  // Pacjentka bez wcześniejszych wyników: pola normy puste, żadnej podpowiedzi.
  expect(await pola(page)).toEqual([['mIU/L', '', '', false], ['pmol/L', '', '', false], ['pmol/L', '', '', false]]);
  await expect(page.locator('#labPkgPrefillHint')).toBeHidden();
  await expect(page.locator('#labPkgUnitNotice')).toBeHidden();
  await expect(karta.locator('.lab-pkg-norm-unit')).toHaveText(['mIU/L', 'pmol/L', 'pmol/L']);

  // TSH 4,25: w normie aplikacji dla wieku (0,5–4,3), powyżej normy laboratorium z wydruku (0,27–4,2).
  await page.locator('#labPkgValue-tsh').fill('4,25');
  expect(await tekst(karty(karta, 'tsh'))).toBe('TSH 4,25 mIU/L w zakresie normy Norma · Młodzież 11–19 lat: 0,5–4,3 mIU/L');
  await wpiszNorme(page, 'tsh', '0,27', '4,2');
  expect(await tekst(karty(karta, 'tsh'))).toBe('TSH 4,25 mIU/L powyżej normy z wydruku Norma z wydruku: 0,27–4,2 mIU/L laboratorium Norma aplikacji · Młodzież 11–19 lat: 0,5–4,3 mIU/L');
  await expect(karty(karta, 'tsh').locator('.lab-range-status')).toHaveClass(/is-above/);
  await expect(karty(karta, 'tsh').locator('svg.lab-pkg-bar')).toHaveAttribute('aria-label', /^TSH 4,25 mIU\/L powyżej normy z wydruku; zakres 0,27–4,2 mIU\/L$/);
  // Norma jest w jednostce wyniku: napis przy polach idzie za wybraną jednostką.
  await page.locator('#labPkgUnit-ft4').selectOption('ng/dL');
  await expect(karta.locator('.lab-pkg-norm-unit')).toHaveText(['mIU/L', 'ng/dL', 'pmol/L']);
  await page.locator('#labPkgValue-ft4').fill('1,1');
  await wpiszNorme(page, 'ft4', '0,93', '1,7');
  expect(await tekst(karty(karta, 'ft4'))).toBe('fT4 1,1 ng/dL w normie z wydruku = 14,2 pmol/L Norma z wydruku: 0,93–1,7 ng/dL laboratorium Norma aplikacji · Młodzież 11–19 lat: 1–1,6 ng/dL');
  await expect(karty(karta, 'ft4').locator('.lab-range-status')).toHaveClass(/is-normal/);
  // fT3 bez normy z wydruku: ocena normą aplikacji, jak dotąd.
  await page.locator('#labPkgValue-ft3').fill('5,1');
  expect(await tekst(karty(karta, 'ft3'))).toBe('fT3 5,1 pmol/L w zakresie normy Norma · Dzieci 1–14 lat: 4,61–7,83 pmol/L');
  await expect(page.locator('#labPkgSources')).toHaveText('Źródła norm: Mayo Test 8939 — TSH · Mayo Test 8725 — fT4 · Mayo Test 621321 — fT3');

  await page.locator('#labPkgDate').fill('2026-06-15');
  await page.locator('#labPkgComment').fill('kontrola');
  await expect(page.locator('#labPkgSave')).toHaveText('Zapisz 3 wyniki do karty');
  await page.locator('#labPkgSave').click();
  await expect(page.locator('#labPkgDone')).toBeVisible();

  const notatki = await wynikiBadan(page, patientId);
  expect(notatki.map((n) => [n.title, n.body, n.clinicalDateISO])).toEqual([
    ['fT3 (wolna trójjodotyronina): 5,1 pmol/L (SI)', '= 5,1 pmol/L\nkontrola', '2026-06-15'],
    ['fT4 (wolna tyroksyna): 1,1 ng/dL', '= 14,2 pmol/L\nkontrola\nNorma: 0,93–1,7 ng/dL', '2026-06-15'],
    ['TSH (tyreotropina): 4,25 mIU/L (SI)', '= 4,25 mIU/L\nkontrola\nNorma: 0,27–4,2 mIU/L', '2026-06-15'],
  ]);
  const [ft3, ft4, tsh] = notatki.map((n) => n.labResult);
  // Wynik niesie jedną normę: z wydruku (bez zrzutu normy aplikacji) albo — gdy jej nie wpisano — normę aplikacji.
  expect([tsh.valueNum, tsh.unit, tsh.norm, 'range' in tsh]).toEqual([4.25, 'mIU/L', '0,27–4,2 mIU/L', false]);
  expect([ft4.valueNum, ft4.unit, ft4.norm, 'range' in ft4]).toEqual([1.1, 'ng/dL', '0,93–1,7 ng/dL', false]);
  expect([ft3.valueNum, ft3.unit, 'norm' in ft3, ft3.range.classification]).toEqual([5.1, 'pmol/L', false, 'within']);

  await page.evaluate((pid) => window.VildaAuthUI.showPatientCard(pid, null, null, { activeTab: 'lab' }), patientId);
  await czekajNaBadania(page);
  const wiersze = sekcjaBadan(page).locator('.vilda-lab-hist-result-row');
  await expect(wiersze).toHaveCount(3);
  // „Badania”: strzałka i zakres z normy z wydruku (TSH ↑ mimo normy aplikacji 0,5–4,3), fT3 z normą aplikacji.
  expect(await Promise.all([0, 1, 2].map((i) => tekst(wiersze.nth(i))))).toEqual([
    'TSH 4,25 mIU/L ↑ 0,27–4,2 mIU/L ›', 'fT4 1,1 ng/dL 0,93–1,7 ng/dL ›', 'fT3 5,1 pmol/L 4,61–7,83 pmol/L ›',
  ]);
});

test('kolejny pakiet: jednostka i norma z poprzedniego wyniku pacjenta; pacjent bez wyników nie dostaje żadnej podpowiedzi', async ({ page }) => {
  const { patientId } = await otworzPakiet(page);
  const karta = kartaPakietu(page);
  await page.locator('#labPkgValue-tsh').fill('2,5');
  await wpiszNorme(page, 'tsh', '0,27', '4,2');
  await page.locator('#labPkgUnit-ft4').selectOption('ng/dL');
  await page.locator('#labPkgValue-ft4').fill('1,1');
  await wpiszNorme(page, 'ft4', '0,93', '1,7');
  await page.locator('#labPkgValue-ft3').fill('5,1');
  await page.locator('#labPkgDate').fill('2026-06-15');
  await page.locator('#labPkgSave').click();
  await expect(page.locator('#labPkgDone')).toBeVisible();

  // Zaraz po zapisie formularz jest gotowy na następny wydruk: normy z właśnie zapisanych wyników, fT3 bez normy.
  const podpowiedz = [['mIU/L', '0,27', '4,2', true], ['ng/dL', '0,93', '1,7', true], ['pmol/L', '', '', false]];
  await expect.poll(() => pola(page)).toEqual(podpowiedz);
  await expect(page.locator('#labPkgPrefillHint')).toHaveText('Podpowiedź z poprzedniego wyniku pacjenta (15.06.2026): TSH, fT4. Sprawdź z wydrukiem.');
  // Podpowiedziana norma bez wyniku niczego nie zapisuje.
  await expect(page.locator('#labPkgSave')).toBeDisabled();
  await expect(karta.locator('.lab-pkg-card.is-empty')).toHaveCount(3);

  // Podpowiedź czyta sejf, nie pamięć strony: po ponownym otwarciu jest ta sama.
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked());
  await page.locator('#labModePackage').click();
  await expect.poll(() => pola(page)).toEqual(podpowiedz);
  await expect(page.locator('#labPkgPrefillHint')).toBeVisible();

  // Inny pacjent bez wyników: jednostka zapamiętana na urządzeniu zostaje, ale norm i podpowiedzi nie ma.
  const drugi = await page.evaluate(async () => (await window.VildaVault.savePatient({
    name: 'Fikcyjny Drugi', user: { name: 'Fikcyjny Drugi', sex: 'M', age: 40, ageMonths: 0, height: 180, weight: 80 },
  }, { dedup: false })).patientId);
  await wczytajPacjenta(page, drugi, { name: 'Fikcyjny Drugi', sex: 'M', age: 40, ageMonths: 0 });
  await expect(karta.locator('.lab-pkg-save-ctx')).toHaveText('Fikcyjny Drugi · wizyta: 40 l');
  await expect.poll(() => pola(page)).toEqual([['mIU/L', '', '', false], ['ng/dL', '', '', false], ['pmol/L', '', '', false]]);
  await expect(page.locator('#labPkgPrefillHint')).toBeHidden();
  // Bez normy z wydruku dorosły jest oceniany normą aplikacji.
  await page.locator('#labPkgValue-tsh').fill('2,5');
  expect(await tekst(karty(karta, 'tsh'))).toBe('TSH 2,5 mIU/L w zakresie normy Norma · Dorośli (≥ 20 lat): 0,3–4,2 mIU/L');
  await expect.poll(() => pola(page)).toEqual([['mIU/L', '', '', false], ['ng/dL', '', '', false], ['pmol/L', '', '', false]]);

  // Powrót do pierwszej pacjentki: jej normy wracają.
  await wczytajPacjenta(page, patientId);
  await expect.poll(() => pola(page)).toEqual(podpowiedz);

  // Poprawiona ręcznie norma przestaje być podpowiedzią.
  await page.locator('#labPkgNormHigh-tsh').fill('4,0');
  await expect(page.locator('#labPkgNormLow-tsh')).not.toHaveClass(/is-prefilled/);
  await expect(page.locator('#labPkgPrefillHint')).toHaveText('Podpowiedź z poprzedniego wyniku pacjenta (15.06.2026): fT4. Sprawdź z wydrukiem.');

  // Zmiana jednostki czyści normę (była w poprzedniej jednostce); powrót do jednostki poprzedniego wyniku ją przywraca.
  await page.locator('#labPkgUnit-ft4').selectOption('pmol/L');
  expect((await pola(page))[1]).toEqual(['pmol/L', '', '', false]);
  await expect(page.locator('#labPkgUnitNotice')).toHaveText('Zmieniono jednostkę: fT4 — norma z wydruku została wyczyszczona, bo była podana w poprzedniej jednostce.');
  await expect(page.locator('#labPkgPrefillHint')).toBeHidden();
  await page.locator('#labPkgUnit-ft4').selectOption('ng/dL');
  expect((await pola(page))[1]).toEqual(['ng/dL', '0,93', '1,7', true]);
  await expect(page.locator('#labPkgUnitNotice')).toBeHidden();

  // Drugi wynik z podpowiedzianą normą zapisuje się z tą normą; z poprawioną — z poprawioną.
  await page.locator('#labPkgValue-tsh').fill('4,1');
  await page.locator('#labPkgValue-ft4').fill('1,8');
  expect(await tekst(karty(karta, 'tsh'))).toContain('powyżej normy z wydruku Norma z wydruku: 0,27–4 mIU/L laboratorium');
  expect(await tekst(karty(karta, 'ft4'))).toContain('powyżej normy z wydruku = 23,2 pmol/L Norma z wydruku: 0,93–1,7 ng/dL laboratorium');
  await page.locator('#labPkgSave').click();
  await expect(page.locator('#labPkgDone')).toBeVisible();
  const zapisane = (await wynikiBadan(page, patientId)).map((n) => [n.labResult.testKey, n.clinicalDateISO, n.labResult.valueNum, n.labResult.norm ?? null])
    .sort((a, b) => `${a[0]} ${a[1]}`.localeCompare(`${b[0]} ${b[1]}`));
  expect(zapisane).toEqual([
    ['ft3', '2026-06-15', 5.1, null],
    ['ft4', '2026-06-15', 1.1, '0,93–1,7 ng/dL'], ['ft4', '2026-06-17', 1.8, '0,93–1,7 ng/dL'],
    ['tsh', '2026-06-15', 2.5, '0,27–4,2 mIU/L'], ['tsh', '2026-06-17', 4.1, '0,27–4 mIU/L'],
  ]);
  // Następna podpowiedź pochodzi z ostatniego wyniku (17.06), nie z pierwszego.
  await expect.poll(() => pola(page)).toEqual([['mIU/L', '0,27', '4', true], ['ng/dL', '0,93', '1,7', true], ['pmol/L', '', '', false]]);
  await expect(page.locator('#labPkgPrefillHint')).toHaveText('Podpowiedź z poprzedniego wyniku pacjenta (17.06.2026): TSH, fT4. Sprawdź z wydrukiem.');

  // „Wyczyść pakiet” wraca do stanu początkowego dla pacjentki — razem z podpowiedzią.
  await page.locator('#labPkgNormLow-tsh').fill('9');
  await page.locator('#labPkgClear').click();
  await expect.poll(() => pola(page)).toEqual([['mIU/L', '0,27', '4', true], ['ng/dL', '0,93', '1,7', true], ['pmol/L', '', '', false]]);
});

test('poprzedni wynik pacjenta wpisany w karcie: jego jednostka wygrywa z jednostką urządzenia, norma bez jednostki też jest podpowiedzią', async ({ page }) => {
  const { patientId } = await otworzPakiet(page);
  const karta = kartaPakietu(page);
  // Urządzenie pamięta ng/dL dla fT4 (jak po wcześniejszym pakiecie innego pacjenta).
  expect(await page.evaluate(() => window.VildaLabPackages.rememberUnits(window.VildaPersistence, { ft4: 'ng/dL', ft3: 'pg/mL' }))).toBe(true);
  // Wyniki tej pacjentki wpisane wcześniej w karcie (edytor wyniku): norma jednym zakresem, bez jednostki; TSH bez normy;
  // starszy wynik fT4 z inną normą nie jest „poprzednim wynikiem”.
  await page.evaluate(async (pid) => {
    const wynik = (testKey, test, valueNum, unit, dateISO, norm) => window.VildaVault.savePatientNote({
      patientId: pid, title: `Wynik: ${test}`, body: norm ? `Norma: ${norm}` : '', category: 'wynik-badania', clinicalDateISO: dateISO,
      labResult: { test, value: String(valueNum).replace('.', ','), testKey, valueNum, unit, ...(norm ? { norm } : {}) },
    });
    await wynik('ft4', 'fT4 (wolna tyroksyna)', 15.2, 'pmol/L', '2026-02-10', '10-20');
    await wynik('ft4', 'fT4 (wolna tyroksyna)', 16.4, 'pmol/L', '2026-05-04', '12-22');
    await wynik('tsh', 'TSH (tyreotropina)', 2.1, 'μIU/mL', '2026-05-04', '');
    await wynik('ft3', 'fT3 (wolna trójjodotyronina)', 3.4, 'pg/mL', '2026-05-04', '1-14 lat: 3,0-5,1');
  }, patientId);
  // Ponowne otwarcie strony: jednostki urządzenia, potem wyniki pacjentki z sejfu.
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked());
  await page.locator('#labModePackage').click();
  await expect.poll(() => pola(page)).toEqual([['μIU/mL', '', '', false], ['pmol/L', '12', '22', true], ['pg/mL', '', '', false]]);
  await expect(page.locator('#labPkgPrefillHint')).toHaveText('Podpowiedź z poprzedniego wyniku pacjenta (04.05.2026): fT4. Sprawdź z wydrukiem.');
  await expect(karta.locator('.lab-pkg-hint', { hasText: 'Jednostki jak w poprzednim wyniku pacjenta; pozostałe zapamiętane z poprzedniego wpisu na tym urządzeniu.' })).toBeVisible();
  await page.locator('#labPkgValue-ft4').fill('23');
  expect(await tekst(karty(karta, 'ft4'))).toBe('fT4 23 pmol/L powyżej normy z wydruku Norma z wydruku: 12–22 pmol/L laboratorium Norma aplikacji · Młodzież 11–19 lat: 12,9–20,6 pmol/L');

  // Wynik dopisany poza pakietem (np. w karcie albo przypięty w pojedynczym badaniu): wejście w pakiet czyta wyniki
  // od nowa, a nietknięta podpowiedź ustępuje nowszej. Wpisany wynik zostaje.
  await page.evaluate((pid) => window.VildaVault.savePatientNote({
    patientId: pid, title: 'Wynik: fT4', body: 'Norma: 11,5-21 pmol/L', category: 'wynik-badania', clinicalDateISO: '2026-06-01',
    labResult: { test: 'fT4 (wolna tyroksyna)', value: '17', testKey: 'ft4', valueNum: 17, unit: 'pmol/L', norm: '11,5-21 pmol/L' },
  }), patientId);
  await page.locator('#labModeSingle').click();
  await page.locator('#labModePackage').click();
  await expect.poll(() => pola(page)).toEqual([['μIU/mL', '', '', false], ['pmol/L', '11,5', '21', true], ['pg/mL', '', '', false]]);
  await expect(page.locator('#labPkgValue-ft4')).toHaveValue('23');
  await expect(page.locator('#labPkgPrefillHint')).toHaveText('Podpowiedź z poprzedniego wyniku pacjenta (01.06.2026): fT4. Sprawdź z wydrukiem.');
  expect(await tekst(karty(karta, 'ft4'))).toContain('powyżej normy z wydruku Norma z wydruku: 11,5–21 pmol/L laboratorium');
});

test('błędna norma wstrzymuje zapis i wskazuje pole; norma przy pustym wyniku niczego nie wstrzymuje', async ({ page }) => {
  const { patientId } = await otworzPakiet(page);
  const karta = kartaPakietu(page);
  await page.locator('#labPkgValue-tsh').fill('2,5');
  await page.locator('#labPkgNormLow-tsh').fill('0,27');
  await expect(page.locator('#labPkgNormError-tsh')).toHaveText('Podaj obie granice normy: od i do.');
  await expect(page.locator('#labPkgNormLow-tsh')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#labPkgNormHigh-tsh')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#labPkgSave')).toBeDisabled();
  await expect(karta.locator('.lab-pkg-save-sub')).toHaveText('popraw normę z wydruku: TSH — do tego czasu zapis jest wstrzymany');
  // Dopóki norma jest błędna, ocena zostaje przy normie aplikacji.
  expect(await tekst(karty(karta, 'tsh'))).toBe('TSH 2,5 mIU/L w zakresie normy Norma · Młodzież 11–19 lat: 0,5–4,3 mIU/L');
  await page.locator('#labPkgNormHigh-tsh').fill('0,2');
  await expect(page.locator('#labPkgNormError-tsh')).toHaveText('Górna granica normy musi być większa od dolnej.');
  await page.locator('#labPkgNormHigh-tsh').fill('x');
  await expect(page.locator('#labPkgNormError-tsh')).toHaveText('Granice normy muszą być liczbami, np. 0,6 i 4,8.');
  await expect(page.locator('#labPkgSave')).toBeDisabled();
  // Norma przy pustym wyniku fT4 nie jest błędem: pusty wiersz nie jest zapisywany.
  await page.locator('#labPkgNormLow-ft4').fill('12');
  await expect(page.locator('#labPkgNormError-ft4')).toBeHidden();

  await page.locator('#labPkgNormHigh-tsh').fill('4,2');
  await expect(page.locator('#labPkgNormError-tsh')).toBeHidden();
  await expect(page.locator('#labPkgNormLow-tsh')).toHaveAttribute('aria-invalid', 'false');
  await expect(karta.locator('.lab-pkg-save-sub')).toHaveText('1 wynik trafi do Badań w karcie pacjenta');
  await expect(page.locator('#labPkgSave')).toBeEnabled();
  await page.locator('#labPkgSave').click();
  await expect(page.locator('#labPkgDone')).toBeVisible();
  expect((await wynikiBadan(page, patientId)).map((n) => [n.labResult.testKey, n.labResult.norm])).toEqual([['tsh', '0,27–4,2 mIU/L']]);
});
