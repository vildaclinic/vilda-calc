import { expect, test } from '../support/test-czas.mjs';
import { kartaPakietu, otworzPakiet, tekst, utworzPakiet, wczytajPacjenta, wynikiBadan } from '../support/lab-pakiet-dane.mjs';
import { quickSelect, closePatientEditor } from '../support/lab-puberty-quick.mjs';
import { kliknij } from '../support/uklad-czekanie.mjs';

// LAB-PAKIETY PR6 (makieta i decyzje właściciela z 2026-11-13): pakiet badań ocenia LH, FSH, inhibinę B
// i testosteron całkowity silnikiem pojedynczego badania. Testy pilnują czterech rzeczy:
//  (1) ZGODNOŚĆ — dla tego samego pacjenta, wyniku i stadium pakiet oddaje dokładnie tę samą ocenę (wejście
//      silnika i wynik), którą pojedyncze badanie pokazuje i przypina do wizyty; pakiet nie ma własnych norm;
//  (2) jedno stadium („Zmień ocenę”) i jeden wybór „Cykl / menopauza” dla całego pakietu, bez zmiany karty
//      pacjenta i pojedynczego badania;
//  (3) zapis: ta sama koperta oceny co „Przypnij do wizyty”, także dla wyniku z operatorem („<0,1”); norma
//      z wydruku zastępuje ocenę; inna data pobrania unieważnia ocenę tak jak zmiana daty w oknie przypięcia;
//  (4) widok: osie wieku i stadium w karcie, komunikat wspólny dla kilku badań raz nad kartami.
// Prawdziwy, fikcyjny sejf (tests/support/lab-pakiet-dane.mjs); zegar stron 17.06.2026. Dane wyłącznie fikcyjne.
test.use({ serviceWorkers: 'block' });

const DZIEWCZYNKA_7 = { name: 'Fikcyjna Wczesna', sex: 'F', age: 7, ageMonths: 2 };
const CHLOPIEC_12 = { name: 'Fikcyjny Dojrzewający', sex: 'M', age: 12, ageMonths: 3 };
const KOBIETA_30 = { name: 'Fikcyjna Dorosła', sex: 'F', age: 30, ageMonths: 0 };
const DZIS = '2026-06-17';

const kartaBadania = (page, id) => kartaPakietu(page).locator(`.lab-pkg-card[data-analyte="${id}"]`);
const porownania = (page, id) => kartaBadania(page, id).locator('.vilda-lab-assessment [data-comparison]').evaluateAll((wiersze) => wiersze.map((w) => [
  w.getAttribute('data-comparison'), w.getAttribute('data-status'), w.querySelector('h4, span')?.textContent || '',
]));
const ocenaPakietu = (page, id, wartosc, jednostka) => page.evaluate(([analit, raw, unit]) => window.VildaLabConverterRuntime.packagePuberty.assess(analit, raw, unit), [id, wartosc, jednostka]);

// Stadium w pakiecie: ten sam edytor co w pojedynczym badaniu, zamontowany w kroku „Pacjent” pakietu.
async function stadiumPakietu(page, os, stadium) {
  if (!await page.locator('#labPkgStageEditor').isVisible()) await kliknij(page.locator('#labPkgStageEdit'));
  await kliknij(page.locator(`#labPkgStageEditor .vpa-segments [data-puberty-axis="${os}"][data-puberty-stage="${stadium}"]`));
  await kliknij(page.locator('#labPkgStageEdit'));
  await expect(page.locator('#labPkgStageEditor')).toBeHidden();
}

// Ocena tego samego wyniku w pojedynczym badaniu (stan domyślny; opcjonalnie stadium albo faza cyklu).
async function ocenaPojedyncza(page, { id, szukaj, wartosc, jednostka, stadium = null, cykl = null }) {
  await page.locator('#labModeSingle').click();
  await expect(page.locator('#labFormPane')).toBeVisible();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.locator('#labSubstance').fill(szukaj);
  await page.locator(`#labSubstanceDropdown .lab-substance-option[data-id="${id}"]`).click();
  await page.locator('#labUnit').selectOption(jednostka);
  await page.locator('#labValue').fill(wartosc);
  if (stadium) {
    await quickSelect(page, 'Kind', stadium[0]);
    await quickSelect(page, 'Stage', stadium[1]);
    await closePatientEditor(page);
  }
  if (cykl) await page.locator('#labPubertyReproductiveContext').selectOption(cykl);
  const ocena = await page.evaluate(() => window.VildaLabPubertyRuntime.getAssessment());
  await page.locator('#labModePackage').click();
  await expect(page.locator('#labPkgSelect')).toBeVisible();
  return ocena;
}

async function schowek(page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: (t) => { window.__schowek = t; return Promise.resolve(); } }, configurable: true });
  });
}

test('dziewczynka 7 l 2 m: bez stadium ocena według wieku; po „Zmień ocenę” Th2 — osie wieku i stadium, komunikat raz, estradiol według Tannera II; zapis i kopiowanie', async ({ page }) => {
  await schowek(page);
  const { patientId } = await otworzPakiet(page);
  await wczytajPacjenta(page, patientId, DZIEWCZYNKA_7);
  await utworzPakiet(page, 'Dojrzewanie', ['lh', 'fsh', 'estradiol', 'inhibin_b']);
  const karta = kartaPakietu(page);
  // Pola badań z oceną pokwitaniową przyjmują zapis z operatorem; pozostałe — liczbę, jak dotąd.
  await expect(page.locator('#labPkgValue-lh')).toHaveAttribute('inputmode', 'text');
  await expect(page.locator('#labPkgValue-inhibin_b')).toHaveAttribute('inputmode', 'text');
  await expect(page.locator('#labPkgValue-estradiol')).toHaveAttribute('inputmode', 'decimal');
  await page.locator('#labPkgValue-lh').fill('0,6');
  await page.locator('#labPkgValue-fsh').fill('3,2');
  await page.locator('#labPkgValue-estradiol').fill('60');
  await page.locator('#labPkgValue-inhibin_b').fill('60');

  // 1. W karcie nie ma oceny Th: pakiet nie zgaduje stadium — LH dostaje odniesienie przedpokwitaniowe,
  //    FSH i inhibina B oś wieku, estradiol normę przedpokwitaniową.
  await expect(page.locator('#labPkgPuberty')).toBeVisible();
  await expect(page.locator('#labPkgStageSummary')).toHaveText('Nie oceniono stadium');
  await expect(page.locator('#labPkgStageEdit')).toHaveText('Zmień ocenę');
  await expect(page.locator('#labPkgCycle')).toBeHidden();
  await expect(page.locator('#labPkgPubertyNote')).toHaveText('Stadium obowiązuje dla całego pakietu — także dla badań z normą według Tannera.');
  expect(await porownania(page, 'lh')).toEqual([['prepubertal', 'above', 'Odniesienie przedpokwitaniowe']]);
  expect(await porownania(page, 'fsh')).toEqual([['age', 'within', 'Dla wieku']]);
  expect(await porownania(page, 'inhibin_b')).toEqual([['age', 'within', 'Dla wieku']]);
  expect(await tekst(kartaBadania(page, 'estradiol'))).toMatch(/^Estradiol 60 pmol\/L w zakresie normy Norma · Dziewczynki prepubertalne .*: 0–73,5 pmol\/L$/);
  await expect(page.locator('#labPkgClinical')).toBeHidden();
  await expect(page.locator('#labPkgPatient')).toHaveText('Kobieta · 7.2 lat · wiek dziecięcy/młodzieńczy');

  // 2. „Zmień ocenę” → Th2: korekta tylko dla tego sprawdzenia, jedna dla całego pakietu.
  await kliknij(page.locator('#labPkgStageEdit'));
  await expect(page.locator('#labPkgStageEditor')).toBeVisible();
  await expect(page.locator('#labPkgStageEdit')).toHaveText('Gotowe');
  await expect(page.locator('#labPkgStageEditor .lab-puberty-hint')).toHaveText('Korekta tylko dla tego sprawdzenia. Nie zapisuje danych pacjenta.');
  await kliknij(page.locator('#labPkgStageEditor .vpa-segments [data-puberty-axis="Th"][data-puberty-stage="2"]'));
  await expect(page.locator('#labPkgStageSummary')).toHaveText('Th2');
  await kliknij(page.locator('#labPkgStageEdit'));
  await expect(page.locator('#labPkgStageEditor')).toBeHidden();
  expect(await porownania(page, 'lh')).toEqual([['age', 'above', 'Dla wieku'], ['stage', 'within', 'Dla stadium Th2']]);
  expect(await porownania(page, 'fsh')).toEqual([['age', 'within', 'Dla wieku'], ['stage', 'within', 'Dla stadium Th2']]);
  expect(await porownania(page, 'inhibin_b')).toEqual([['age', 'within', 'Dla wieku']]);
  await expect(kartaBadania(page, 'lh').locator('[data-comparison="age"] .vilda-lab-range')).toHaveText('<0,02 (dolna granica oznaczalności); ≤0,3 IU/L');
  await expect(kartaBadania(page, 'lh').locator('[data-comparison="stage"] .vilda-lab-range')).toHaveText('<0,02 (dolna granica oznaczalności); ≤4,1 IU/L');
  await expect(kartaBadania(page, 'fsh').locator('[data-comparison="stage"] .vilda-lab-range')).toHaveText('≥0,3 i ≤5,8 IU/L');
  // Estradiol (norma katalogu) idzie za tym samym stadium; opis pacjenta mówi, że to nadpisanie lokalne.
  expect(await tekst(kartaBadania(page, 'estradiol'))).toBe('Estradiol 60 pmol/L w zakresie normy Norma · Dziewczynki Tanner II: 0–88,2 pmol/L');
  await expect(page.locator('#labPkgPatient')).toHaveText('Kobieta · 7.2 lat · wiek dziecięcy/młodzieńczy · Tanner II (nadpisanie lokalne; u pacjenta: nieznany)');
  // Komunikat kliniczny wspólny dla LH i FSH stoi raz, nad kartami; w kartach jest schowany.
  await expect(page.locator('#labPkgClinical')).toBeVisible();
  expect(await tekst(page.locator('#labPkgClinical'))).toBe('ROZWÓJ PŁCIOWY Wczesny rozwój gruczołów sutkowych — ocena przebiegu Th2 przed granicą wieku wymaga oceny progresji i objawów towarzyszących. Nie jest automatycznym rozpoznaniem CPP ani wyborem obserwacji. Dotyczy: LH, FSH');
  await expect(page.locator('#labPkgClinical .vilda-lab-clinical')).toHaveCount(1);
  await expect(kartaBadania(page, 'lh').locator('.vilda-lab-clinical')).toBeHidden();
  await expect(kartaBadania(page, 'fsh').locator('.vilda-lab-clinical')).toBeHidden();
  await expect(kartaBadania(page, 'lh').getByRole('button', { name: 'Wykres w pojedynczym badaniu →' })).toBeVisible();

  // 3. Korekta nie dotyka karty pacjenta ani pojedynczego badania.
  expect(await page.evaluate(() => { const dane = window.VildaPersistence.readShared(null) || {}; return [dane.tannerStage ?? null, dane.pubertyAssessment ?? null]; })).toEqual([null, null]);

  // 4. ZGODNOŚĆ: te same wyniki z tym samym stadium w pojedynczym badaniu dają tę samą ocenę.
  const pakiet = {
    lh: await ocenaPakietu(page, 'lh', '0,6', 'IU/L'), fsh: await ocenaPakietu(page, 'fsh', '3,2', 'IU/L'),
    inhibin_b: await ocenaPakietu(page, 'inhibin_b', '60', 'pg/mL'),
  };
  expect(pakiet.lh.evaluation.input.puberty).toMatchObject({ kind: 'Th', stage: 2, appliesToCurrentContext: true, source: 'lab-local' });
  const bezStadium = await ocenaPojedyncza(page, { id: 'lh', szukaj: 'LH', wartosc: '0,6', jednostka: 'IU/L' });
  expect(bezStadium.evaluation.input.puberty).toMatchObject({ kind: 'unspecified', stage: null });
  const pojedyncze = {
    lh: await ocenaPojedyncza(page, { id: 'lh', szukaj: 'LH', wartosc: '0,6', jednostka: 'IU/L', stadium: ['Th', '2'] }),
    fsh: await ocenaPojedyncza(page, { id: 'fsh', szukaj: 'FSH', wartosc: '3,2', jednostka: 'IU/L' }),
    inhibin_b: await ocenaPojedyncza(page, { id: 'inhibin_b', szukaj: 'inhibina', wartosc: '60', jednostka: 'pg/mL' }),
  };
  for (const id of ['lh', 'fsh', 'inhibin_b']) {
    expect(pakiet[id].status, id).toBe('recorded');
    expect(pakiet[id].evaluation, id).toEqual(pojedyncze[id].evaluation);
  }
  // Pakiet zachował wpisane wyniki i swoje stadium.
  await expect(page.locator('#labPkgValue-lh')).toHaveValue('0,6');
  await expect(page.locator('#labPkgStageSummary')).toHaveText('Th2');

  // 5. Kopiowanie: każde porównanie osobno, z granicą w nawiasie. Schowek zapisuje „≤” słownie
  //    (vilda_schowek.js: systemy szpitalne nie przyjmują tego znaku).
  await kliknij(page.locator('#labPkgCopy'));
  await expect.poll(() => page.evaluate(() => window.__schowek)).toBe([
    'Badania (pobranie 17.06.2026):',
    'LH: 0,6 IU/L — dla wieku: powyżej zakresu (co najwyżej 0,3); dla stadium Th2: nie przekracza górnej granicy (co najwyżej 4,1)',
    'FSH: 3,2 IU/L — dla wieku: w zakresie (0,5–6); dla stadium Th2: w zakresie (0,3–5,8)',
    'Estradiol: 60 pmol/L (norma 0–88,2)',
    'Inhibina B: 60 pg/mL — dla wieku: nie przekracza górnej granicy (<129)',
  ].join('\n'));

  // 6. Zapis: koperta oceny jak przy „Przypnij do wizyty”, związana z wynikiem i dzisiejszą datą badania.
  const zakresE2 = await page.evaluate(() => {
    const pacjent = window.VildaLabConverterRuntime.getPackagePatient('estradiol').patient;
    const bezKorekty = Object.assign({}, pacjent, { tanner: null });
    const wybierz = (kto) => window.LabUnitConverter.selectRange(window.LabUnitConverter.find('estradiol'), kto).id;
    return { tanner: pacjent.tanner, nadpisany: pacjent._tanner_overridden, id: wybierz(pacjent), bezKorekty: wybierz(bezKorekty) };
  });
  expect(zakresE2).toMatchObject({ tanner: 2, nadpisany: true });
  expect(zakresE2.id).not.toBe(zakresE2.bezKorekty);
  await expect(page.locator('#labPkgSave')).toHaveText('Zapisz 4 wyniki do karty');
  await kliknij(page.locator('#labPkgSave'));
  await expect(page.locator('#labPkgDone')).toBeVisible();
  const notatki = await wynikiBadan(page, patientId);
  expect(notatki.map((n) => [n.labResult.testKey, n.title, n.body, n.clinicalDateISO])).toEqual([
    ['estradiol', 'Estradiol (E2): 60 pmol/L (SI)', '= 60 pmol/L', DZIS],
    ['fsh', 'FSH (hormon folikulotropowy): 3,2 IU/L (SI)', '= 3,2 IU/L', DZIS],
    ['inhibin_b', 'Inhibina B: 60 pg/mL', '= 60 pg/mL', DZIS],
    ['lh', 'LH (hormon luteinizujący): 0,6 IU/L (SI)', '= 0,6 IU/L', DZIS],
  ]);
  const [zE2, zFsh, zInhibina, zLh] = notatki.map((n) => n.labResult);
  for (const [zapis, id, wartosc, liczba, jednostka] of [[zLh, 'lh', '0,6', 0.6, 'IU/L'], [zFsh, 'fsh', '3,2', 3.2, 'IU/L'], [zInhibina, 'inhibin_b', '60', 60, 'pg/mL']]) {
    expect(Object.keys(zapis).sort(), id).toEqual(['assessment', 'test', 'testKey', 'unit', 'value', 'valueNum']);
    expect(zapis, id).toMatchObject({ value: wartosc, testKey: id, valueNum: liczba, unit: jednostka });
    expect(zapis.assessment.status, id).toBe('recorded');
    expect(zapis.assessment.evaluation, id).toEqual(pakiet[id].evaluation);
    expect(zapis.assessment.binding, id).toMatchObject({ testKey: id, value: wartosc, valueNum: liczba, unit: jednostka, clinicalDateISO: DZIS });
  }
  // Estradiol: zrzut normy katalogu dobranej dla poprawionego stadium (Tanner II), nie dla wieku.
  expect(zE2.range).toMatchObject({ status: 'recorded', classification: 'within' });
  expect(zE2.range.range.id).toBe(zakresE2.id);
});

test('chłopiec 12 l 3 m, G2: testosteron w ng/dL z dwiema osiami, LH znacznie powyżej zakresu, inhibina B poniżej — zgodnie z pojedynczym badaniem', async ({ page }) => {
  const { patientId } = await otworzPakiet(page);
  await wczytajPacjenta(page, patientId, CHLOPIEC_12);
  await utworzPakiet(page, 'Dojrzewanie chłopców', ['lh', 'fsh', 'testosterone_total', 'inhibin_b']);
  await page.locator('#labPkgValue-lh').fill('14');
  await page.locator('#labPkgValue-fsh').fill('4,5');
  await page.locator('#labPkgUnit-testosterone_total').selectOption('ng/dL');
  await page.locator('#labPkgValue-testosterone_total').fill('25');
  await page.locator('#labPkgValue-inhibin_b').fill('60');
  await stadiumPakietu(page, 'G', '2');
  await expect(page.locator('#labPkgStageSummary')).toHaveText('G2');

  expect(await porownania(page, 'lh')).toEqual([['age', 'above', 'Dla wieku'], ['stage', 'above', 'Dla stadium G2']]);
  expect(await porownania(page, 'fsh')).toEqual([['age', 'within', 'Dla wieku'], ['stage', 'above', 'Dla stadium G2']]);
  expect(await porownania(page, 'testosterone_total')).toEqual([['age', 'within', 'Dla wieku'], ['stage', 'within', 'Dla stadium G2']]);
  expect(await porownania(page, 'inhibin_b')).toEqual([['age', 'below', 'Dla wieku']]);
  // Znaczne odchylenie: to samo wyróżnienie co w pojedynczym badaniu (wartość i opis nad osiami).
  const lh = kartaBadania(page, 'lh');
  await expect(lh.locator('.lab-pkg-card-value')).toHaveClass(/is-uwaga-high/);
  expect(await tekst(lh.locator('.vilda-lab-severity-summary'))).toBe('Uwaga — znacznie powyżej zakresu referencyjnego Względem wieku i stadium G2 · orientacyjnie');
  await expect(lh.locator('[data-comparison="age"] .vilda-lab-range')).toHaveText('≥0,1 i ≤5,7 IU/L');
  await expect(lh.locator('[data-comparison="stage"] .vilda-lab-range')).toHaveText('≥0,03 i ≤3,7 IU/L');
  await expect(kartaBadania(page, 'fsh').locator('[data-comparison="stage"] .vilda-lab-range')).toHaveText('<3 IU/L');
  // Testosteron: zakresy w jednostce wyniku (ng/dL), przeliczenie na SI pod wartością.
  const tt = kartaBadania(page, 'testosterone_total');
  await expect(tt.locator('.lab-pkg-card-converted')).toHaveText('= 0,867 nmol/L');
  await expect(tt.locator('[data-comparison="age"] .vilda-lab-range')).toContainText('≤800 ng/dL');
  await expect(tt.locator('[data-comparison="stage"] .vilda-lab-range')).toHaveText('Zakres: 8–66 ng/dL');
  await expect(kartaBadania(page, 'inhibin_b').locator('[data-comparison="age"] .vilda-lab-range')).toHaveText('≥74 i ≤470 pg/mL');
  // Ten sam komunikat dla LH i FSH — raz, nad kartami.
  expect(await tekst(page.locator('#labPkgClinical'))).toMatch(/^ROZWÓJ PŁCIOWY .+ Dotyczy: LH, FSH$/);

  const wyniki = [['lh', 'LH', '14', 'IU/L'], ['fsh', 'FSH', '4,5', 'IU/L'], ['testosterone_total', 'testosteron całkowity', '25', 'ng/dL'], ['inhibin_b', 'inhibina', '60', 'pg/mL']];
  const pakiet = {};
  for (const [id, , wartosc, jednostka] of wyniki) pakiet[id] = await ocenaPakietu(page, id, wartosc, jednostka);
  let pierwsze = true;
  for (const [id, szukaj, wartosc, jednostka] of wyniki) {
    const pojedyncza = await ocenaPojedyncza(page, { id, szukaj, wartosc, jednostka, stadium: pierwsze ? ['G', '2'] : null });
    pierwsze = false;
    expect(pakiet[id].status, id).toBe('recorded');
    expect(pakiet[id].evaluation, id).toEqual(pojedyncza.evaluation);
  }

  await kliknij(page.locator('#labPkgSave'));
  await expect(page.locator('#labPkgDone')).toBeVisible();
  const zapis = Object.fromEntries((await wynikiBadan(page, patientId)).map((n) => [n.labResult.testKey, n.labResult]));
  expect(zapis.testosterone_total).toMatchObject({ value: '25', valueNum: 25, unit: 'ng/dL', assessment: { status: 'recorded' } });
  expect(zapis.testosterone_total.assessment.evaluation).toEqual(pakiet.testosterone_total.evaluation);
  expect(zapis.lh.assessment.evaluation).toEqual(pakiet.lh.evaluation);
});

test('wynik z operatorem „<0,1”: pola LH przyjmują zapis z wydruku, ocena i zapis jak w pojedynczym badaniu; inne badania — liczba', async ({ page }) => {
  await schowek(page);
  const { patientId } = await otworzPakiet(page);
  await wczytajPacjenta(page, patientId, { name: 'Fikcyjna Wczesna', sex: 'F', age: 9, ageMonths: 4 });
  await utworzPakiet(page, 'Dojrzewanie', ['lh', 'fsh', 'estradiol']);
  await stadiumPakietu(page, 'Th', '2');
  await page.locator('#labPkgValue-lh').fill('<0,1');
  await page.locator('#labPkgValue-fsh').fill('1,2');
  const lh = kartaBadania(page, 'lh');
  await expect(lh).toHaveClass(/is-assessed/);
  await expect(lh.locator('.lab-pkg-card-value')).toHaveText('<0,1');
  expect(await porownania(page, 'lh')).toEqual([['age', 'within', 'Dla wieku'], ['stage', 'within', 'Dla stadium Th2']]);
  // Wynik bez dokładnej wartości nie dostaje punktu na osi.
  await expect(lh.locator('.vilda-lab-axis-marker')).toHaveCount(0);
  await expect(lh).toContainText('Wynik nie jest dokładnym punktem liczbowym');
  await expect(page.locator('#labPkgError-lh')).toBeHidden();
  const pakiet = await ocenaPakietu(page, 'lh', '<0,1', 'IU/L');
  expect(pakiet.evaluation.measurement).toMatchObject({ status: 'valid', raw: '<0,1', isExact: false, operator: '<', sourceValue: 0.1, sourceUnit: 'IU/L' });
  const pojedyncza = await ocenaPojedyncza(page, { id: 'lh', szukaj: 'LH', wartosc: '<0,1', jednostka: 'IU/L', stadium: ['Th', '2'] });
  expect(pakiet.evaluation).toEqual(pojedyncza.evaluation);

  // Estradiol (ocena katalogu) nie przyjmuje operatora — jak dotąd; błędne pole wstrzymuje zapis.
  await page.locator('#labPkgValue-estradiol').fill('<5');
  await expect(page.locator('#labPkgError-estradiol')).toBeVisible();
  await expect(page.locator('#labPkgSave')).toBeDisabled();
  await page.locator('#labPkgValue-estradiol').fill('');

  await kliknij(page.locator('#labPkgCopy'));
  await expect.poll(() => page.evaluate(() => window.__schowek)).toBe([
    'Badania (pobranie 17.06.2026):',
    'LH: <0,1 IU/L — dla wieku: nie przekracza górnej granicy (co najwyżej 4,8); dla stadium Th2: nie przekracza górnej granicy (co najwyżej 4,1)',
    'FSH: 1,2 IU/L — dla wieku: w zakresie (0,5–6); dla stadium Th2: w zakresie (0,3–5,8)',
  ].join('\n'));

  await kliknij(page.locator('#labPkgSave'));
  await expect(page.locator('#labPkgDone')).toBeVisible();
  const zLh = (await wynikiBadan(page, patientId)).find((n) => n.labResult.testKey === 'lh');
  expect([zLh.title, zLh.body]).toEqual(['LH (hormon luteinizujący): <0,1 IU/L (SI)', '= <0,1 IU/L']);
  // Bez liczby (valueNum): zapis z operatorem zostaje w polu wartości i w kopercie oceny.
  expect(Object.keys(zLh.labResult).sort()).toEqual(['assessment', 'test', 'testKey', 'unit', 'value']);
  expect(zLh.labResult).toMatchObject({ value: '<0,1', unit: 'IU/L', assessment: { status: 'recorded' } });
  expect(zLh.labResult.assessment.evaluation).toEqual(pakiet.evaluation);
});

// PR7: pacjent z datą urodzenia jest oceniany dla wieku w dniu pobrania (lab-pakiet-dzien-pobrania.spec.mjs).
// Ten pacjent jej nie ma (wiek wpisany ręcznie), więc zostaje zasada z PR6 — z podpowiedzią, czego brakuje.
test('inna data pobrania u pacjenta bez daty urodzenia: ocena pokwitaniowa dotyczy dzisiejszych danych pacjenta — pakiet mówi o tym i zapisuje ją jako wymagającą ponownej oceny; norma z wydruku zastępuje ocenę', async ({ page }) => {
  const { patientId } = await otworzPakiet(page);
  await wczytajPacjenta(page, patientId, CHLOPIEC_12);
  await utworzPakiet(page, 'Dojrzewanie chłopców', ['lh', 'fsh', 'inhibin_b']);
  await stadiumPakietu(page, 'G', '2');
  await page.locator('#labPkgValue-lh').fill('2,1');
  await page.locator('#labPkgValue-fsh').fill('2');
  await page.locator('#labPkgValue-inhibin_b').fill('120');
  const lh = kartaBadania(page, 'lh'), fsh = kartaBadania(page, 'fsh');
  await expect(page.locator('#labPkgDateNote')).toBeHidden();
  await expect(lh.locator('.lab-pkg-card-day')).toHaveCount(0);

  // Norma z wydruku dla FSH: wynik niesie jedną normę — ocena aplikacji znika z ekranu i z zapisu.
  await page.locator('#labPkgNormLow-fsh').fill('0,5');
  await page.locator('#labPkgNormHigh-fsh').fill('3');
  expect(await tekst(fsh)).toBe('FSH 2 IU/L w normie z wydruku Norma z wydruku: 0,5–3 IU/L laboratorium Ocena aplikacji dla wieku i stadium wraca po usunięciu normy z wydruku. Oceń FSH w pojedynczym badaniu →');

  // Data pobrania sprzed tygodnia, bez daty urodzenia: ocena na ekranie zostaje (dotyczy dzisiejszego wieku i stadium), z jasnym opisem skutku.
  await page.locator('#labPkgDate').fill('2026-06-10');
  await expect(page.locator('#labPkgDateNote')).toHaveText('Normy dobrano do danych pacjenta widocznych teraz w przeliczniku. Badanie było w innym dniu — sprawdź, czy te przedziały pasują do wieku w dniu badania. Ocena pokwitaniowa (LH, Inhibina B) dotyczy dzisiejszego wieku i stadium: z inną datą pobrania zapisze się w karcie jako wymagająca ponownej oceny — tak jak przypięcie pojedynczego wyniku ze zmienioną datą. W danych pacjenta nie ma daty urodzenia — uzupełnij ją, aby ocenić wyniki dla wieku w dniu pobrania.');
  await expect(lh.locator('.lab-pkg-card-day')).toHaveText('Inna data pobrania: w karcie ta ocena zapisze się jako wymagająca ponownej oceny.');
  expect(await porownania(page, 'lh')).toEqual([['age', 'within', 'Dla wieku'], ['stage', 'within', 'Dla stadium G2']]);
  await expect(fsh.locator('.lab-pkg-card-day')).toHaveCount(0);
  const pakiet = await ocenaPakietu(page, 'lh', '2,1', 'IU/L');

  await kliknij(page.locator('#labPkgSave'));
  await expect(page.locator('#labPkgDone')).toBeVisible();
  const zapis = Object.fromEntries((await wynikiBadan(page, patientId)).map((n) => [n.labResult.testKey, n]));
  expect(zapis.lh.clinicalDateISO).toBe('2026-06-10');
  // Dokładnie ten sam skutek co zmiana daty w oknie „Przypnij do wizyty”: wynik zostaje, ocena jest unieważniona.
  expect(zapis.lh.labResult.assessment.status).toBe('invalidated');
  expect(zapis.lh.labResult.assessment.reasonCodes).toEqual(['result_or_clinical_date_changed']);
  expect(zapis.lh.labResult.assessment.evaluation).toEqual(pakiet.evaluation);
  expect(zapis.lh.labResult).toMatchObject({ value: '2,1', valueNum: 2.1, unit: 'IU/L' });
  expect(zapis.inhibin_b.labResult.assessment.status).toBe('invalidated');
  // FSH: norma z wydruku, bez koperty oceny.
  expect(zapis.fsh.labResult).toEqual({ test: 'FSH (hormon folikulotropowy)', value: '2 IU/L (SI) = 2 IU/L', testKey: 'fsh', valueNum: 2, unit: 'IU/L', norm: '0,5–3 IU/L' });
});

test('dorosła kobieta: jeden wybór „Cykl / menopauza” dla LH, FSH i inhibiny B; bez wyboru — lista zakresów bez wspólnej oceny; zgodność z pojedynczym badaniem', async ({ page }) => {
  const { patientId } = await otworzPakiet(page);
  await wczytajPacjenta(page, patientId, KOBIETA_30);
  await utworzPakiet(page, 'Oś gonadalna', ['lh', 'fsh', 'inhibin_b']);
  await page.locator('#labPkgValue-lh').fill('6');
  await page.locator('#labPkgValue-fsh').fill('6');
  await page.locator('#labPkgValue-inhibin_b').fill('60');
  // U dorosłej nie ma stadium; jest wybór fazy.
  await expect(page.locator('#labPkgPuberty')).toBeVisible();
  await expect(page.locator('#labPkgStageEdit')).toBeHidden();
  await expect(page.locator('#labPkgCycle')).toBeVisible();
  expect(await page.locator('#labPkgCycle option').allTextContents()).toEqual(['Nie ustalono', 'Faza folikularna', 'Okres okołoowulacyjny', 'Faza lutealna', 'Po menopauzie']);
  await expect(page.locator('#labPkgCycle')).toHaveValue('unknown');
  const lh = kartaBadania(page, 'lh');
  expect(await lh.locator('.vilda-lab-reference-variant').evaluateAll((w) => w.map((el) => el.textContent))).toEqual([
    'Faza folikularna1,9–14,6 IU/L', 'Okres okołoowulacyjny12,2–118 IU/L', 'Faza lutealna0,7–12,9 IU/L', 'Po menopauzie5,3–65,4 IU/L',
  ]);
  await expect(lh).toContainText('Wybierz znaną fazę lub porównaj dostępne zakresy.');
  expect(await porownania(page, 'lh')).toEqual(expect.arrayContaining([['variant', null, 'Faza folikularna']]));
  await expect(lh.locator('.vilda-lab-comparison')).toHaveCount(0);

  // Faza folikularna: jedna oś dla każdego z trzech badań, ta sama ocena co w pojedynczym badaniu.
  await page.locator('#labPkgCycle').selectOption('follicular');
  await expect(lh.locator('.vilda-lab-comparison')).toHaveCount(1);
  await expect(lh.locator('.vilda-lab-comparison .vilda-lab-range')).toContainText('1,9');
  await expect(kartaBadania(page, 'fsh').locator('.vilda-lab-comparison')).toHaveCount(1);
  // Inhibina B ma w źródle dwa zakresy fazy folikularnej (wczesną i późną) — pakiet pokazuje oba, jak pojedyncze badanie.
  expect(await kartaBadania(page, 'inhibin_b').locator('.vilda-lab-reference-variant').evaluateAll((w) => w.map((el) => el.textContent))).toEqual([
    'Wczesna faza folikularna<261 pg/mL', 'Późna faza folikularna<286 pg/mL',
  ]);
  const wyniki = [['lh', 'LH', '6', 'IU/L'], ['fsh', 'FSH', '6', 'IU/L'], ['inhibin_b', 'inhibina', '60', 'pg/mL']];
  const pakiet = {};
  for (const [id, , wartosc, jednostka] of wyniki) pakiet[id] = await ocenaPakietu(page, id, wartosc, jednostka);
  expect(pakiet.lh.evaluation.input.reproductiveContext).toBe('follicular');
  for (const [id, szukaj, wartosc, jednostka] of wyniki) {
    const pojedyncza = await ocenaPojedyncza(page, { id, szukaj, wartosc, jednostka, cykl: 'follicular' });
    expect(pakiet[id].evaluation, id).toEqual(pojedyncza.evaluation);
  }
  await expect(page.locator('#labPkgCycle')).toHaveValue('follicular');

  // Zmiana pacjenta zeruje wybór fazy i wpisane wyniki.
  const inna = await page.evaluate(async () => (await window.VildaVault.savePatient({ name: 'Fikcyjna Druga Dorosła', user: { name: 'Fikcyjna Druga Dorosła', sex: 'F', age: 41, ageMonths: 0 } }, { dedup: false })).patientId);
  expect(inna).toMatch(/\S/);
  expect(inna).not.toBe(patientId);
  await wczytajPacjenta(page, inna, { name: 'Fikcyjna Druga Dorosła', sex: 'F', age: 41, ageMonths: 0 });
  await expect(page.locator('#labPkgValue-lh')).toHaveValue('');
  await expect(page.locator('#labPkgCycle')).toHaveValue('unknown');
  await page.locator('#labPkgValue-lh').fill('6');
  await expect(lh.locator('.vilda-lab-reference-variant')).toHaveCount(4);
});

test('korekta stadium żyje tylko w pakiecie: pojedyncze badanie jej nie widzi, a po zmianie pacjenta znika', async ({ page }) => {
  const { patientId } = await otworzPakiet(page);
  await wczytajPacjenta(page, patientId, CHLOPIEC_12);
  await utworzPakiet(page, 'Dojrzewanie chłopców', ['lh', 'testosterone_total']);
  await stadiumPakietu(page, 'G', '3');
  await page.locator('#labPkgValue-lh').fill('2,1');
  expect(await porownania(page, 'lh')).toEqual([['age', 'within', 'Dla wieku'], ['stage', 'within', 'Dla stadium G3']]);
  // Pojedyncze badanie ma własny kontekst: bez oceny G.
  const pojedyncza = await ocenaPojedyncza(page, { id: 'lh', szukaj: 'LH', wartosc: '2,1', jednostka: 'IU/L' });
  expect(pojedyncza.evaluation.input.puberty).toMatchObject({ kind: 'unspecified', stage: null });
  await expect(page.locator('#labPkgStageSummary')).toHaveText('G3');
  expect((await ocenaPakietu(page, 'lh', '2,1', 'IU/L')).evaluation.input.puberty).toMatchObject({ kind: 'G', stage: 3, source: 'lab-local' });

  // Inny pacjent: korekta poprzedniego nie przechodzi.
  const inny = await page.evaluate(async () => (await window.VildaVault.savePatient({ name: 'Fikcyjny Drugi', user: { name: 'Fikcyjny Drugi', sex: 'M', age: 13, ageMonths: 0 } }, { dedup: false })).patientId);
  expect(inny).toMatch(/\S/);
  expect(inny).not.toBe(patientId);
  await wczytajPacjenta(page, inny, { name: 'Fikcyjny Drugi', sex: 'M', age: 13, ageMonths: 0 });
  await expect(page.locator('#labPkgStageSummary')).toHaveText('Nie oceniono stadium');
  await expect(page.locator('#labPkgStageEditor')).toBeHidden();
  await page.locator('#labPkgValue-lh').fill('2,1');
  expect((await ocenaPakietu(page, 'lh', '2,1', 'IU/L')).evaluation.input.puberty).toMatchObject({ kind: 'unspecified', stage: null });
  expect((await porownania(page, 'lh')).map((p) => p[0])).not.toContain('stage');
});
