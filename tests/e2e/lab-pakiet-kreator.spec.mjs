import { expect, test } from '../support/test-czas.mjs';
import { kartaPakietu, opcjeListy, otworzPakiet, pakietyKonta, pakietyUrzadzenia, tekst, utworzPakiet, wczytajPacjenta, wynikiBadan } from '../support/lab-pakiet-dane.mjs';
import { kliknij, odznacz, zaznacz } from '../support/uklad-czekanie.mjs';

// LAB-PAKIETY PR4 (kreator, decyzje właściciela i makieta z 2026-11-13): lekarz składa własny pakiet z badań
// przelicznika. Prawdziwy, fikcyjny sejf (tests/support/lab-pakiet-dane.mjs; zegar stron 17.06.2026).
// Pakiety należą do konta. LAB-PAKIETY PR6 (2026-11-13): LH, FSH, inhibinę B i testosteron całkowity pakiet
// ocenia silnikiem pojedynczego badania (osie wieku i stadium, ta sama koperta oceny w zapisie); AMH zostaje
// w pakiecie bez oceny — zapisuje się wartość, ocenę daje norma z wydruku albo pojedyncze badanie.
// Dane wyłącznie fikcyjne.
test.use({ serviceWorkers: 'block' });

const bezCzasu = (lab) => JSON.parse(JSON.stringify(lab, (klucz, wartosc) => (klucz === 'capturedAtISO' ? '(chwila zapisu)' : wartosc)));
const wybrane = (page) => page.locator('#labPkgCreatorList li').evaluateAll((wiersze) => wiersze.map((li) => [
  li.querySelector('.lab-pkg-creator-item-num').textContent, li.querySelector('.lab-pkg-creator-item-name').textContent, li.querySelector('.lab-pkg-creator-item-kind').textContent,
]));
test('kreator: pakiet „Dojrzewanie” — utworzenie, zapis na koncie, ocena, przejście do pojedynczego badania i zapis do Badań', async ({ page }) => {
  const { patientId } = await otworzPakiet(page);
  const karta = kartaPakietu(page);
  expect(await opcjeListy(page)).toEqual([['Wbudowane', ['Tarczyca']]]);
  expect(await pakietyKonta(page)).toBeNull();

  await page.locator('#labPkgNew').click();
  await expect(page.locator('#labPkgCreator')).toBeVisible();
  await expect(karta.locator('.lab-pkg-body')).toBeHidden();
  await expect(page.locator('#labPkgCreatorTitle')).toHaveText('Nowy pakiet');
  await expect(page.locator('#labPkgCreatorName')).toBeFocused();
  await expect(page.locator('#labPkgCreatorName')).toHaveAttribute('maxlength', '30');
  // Pusty kreator: zapis nieczynny, podpowiedź mówi, czego brakuje; bez czerwonych błędów przed pierwszą próbą.
  await expect(page.locator('#labPkgCreatorSave')).toBeDisabled();
  await expect(page.locator('#labPkgCreatorHint')).toHaveText('Podaj nazwę pakietu. Dodaj co najmniej jedno badanie.');
  await expect(page.locator('#labPkgCreatorNameError')).toBeHidden();
  await expect(page.locator('#labPkgCreatorCount')).toHaveText('0 z 10');
  // Katalog: 34 badania przelicznika w jego 12 grupach; otwarta jest pierwsza.
  await expect(page.locator('#labPkgCreatorGroups details')).toHaveCount(12);
  await expect(page.locator('#labPkgCreatorGroups input[type="checkbox"]')).toHaveCount(34);
  expect(await page.locator('#labPkgCreatorGroups details').evaluateAll((g) => g.map((el) => el.open))).toEqual([true, ...Array(11).fill(false)]);
  expect(await tekst(page.locator('#labPkgCreator .lab-pkg-creator-legend'))).toBe('pokwit. — ocena według wieku i stadium pokwitania, jak w pojedynczym badaniu. poj. badanie — pełna ocena tylko w pojedynczym badaniu. Pozostałe badania pakiet ocenia normą dla wieku, płci i stadium z karty pacjenta.');

  await page.locator('#labPkgCreatorName').fill('Dojrzewanie');
  // Wyszukiwanie odsłania badanie w zwiniętej grupie (bez znaków diakrytycznych).
  await page.locator('#labPkgCreatorSearch').fill('luteinizujacy');
  await expect(page.locator('#labPkgCreatorGroups .lab-pkg-creator-option:visible')).toHaveCount(1);
  await zaznacz(page.locator('#labPkgCreatorOpt-lh'));
  await page.locator('#labPkgCreatorSearch').fill('nie ma takiego badania');
  await expect(page.locator('#labPkgCreator .lab-pkg-creator-nomatch')).toBeVisible();
  // Po wyczyszczeniu wyszukiwania otwarta zostaje grupa z zaznaczonym badaniem.
  await page.locator('#labPkgCreatorSearch').fill('');
  await expect(page.locator('#labPkgCreator .lab-pkg-creator-nomatch')).toBeHidden();
  await expect(page.locator('#labPkgCreatorOpt-fsh')).toBeVisible();
  expect(await tekst(page.locator('label.lab-pkg-creator-option', { has: page.locator('#labPkgCreatorOpt-fsh') }))).toBe('FSH (hormon folikulotropowy) · pokwit.');
  expect(await tekst(page.locator('label.lab-pkg-creator-option', { has: page.locator('#labPkgCreatorOpt-amh') }))).toBe('AMH (hormon antymüllerowski) · poj. badanie');
  await zaznacz(page.locator('#labPkgCreatorOpt-fsh'));
  await kliknij(page.locator('#labPkgCreatorGroups summary', { hasText: 'Estrogeny / progesteron' }));
  await zaznacz(page.locator('#labPkgCreatorOpt-estradiol'));

  await expect(page.locator('#labPkgCreatorCount')).toHaveText('3 z 10');
  expect(await wybrane(page)).toEqual([
    ['1.', 'LH (hormon luteinizujący)', 'ocena według wieku i pokwitania'],
    ['2.', 'FSH (hormon folikulotropowy)', 'ocena według wieku i pokwitania'],
    ['3.', 'Estradiol (E2)', 'ocena w pakiecie'],
  ]);
  await expect(page.locator('#labPkgCreatorOwnNote')).toHaveText('LH, FSH — pakiet ocenia jak pojedyncze badanie: według wieku i stadium pokwitania z karty pacjenta.');
  await expect(page.locator('#labPkgCreatorHint')).toBeHidden();
  await expect(page.locator('#labPkgCreatorDelete')).toBeHidden();
  await expect(page.locator('#labPkgCreatorSave')).toHaveText('Zapisz pakiet');
  await kliknij(page.locator('#labPkgCreatorSave'));

  // Po zapisie: formularz nowego pakietu, lista z grupą „Twoje pakiety”, pakiet na koncie.
  await expect(page.locator('#labPkgCreator')).toBeHidden();
  await expect(page.locator('#labToast')).toHaveText('✓ Zapisano pakiet: Dojrzewanie');
  expect(await opcjeListy(page)).toEqual([['Wbudowane', ['Tarczyca']], ['Twoje pakiety', ['Dojrzewanie']]]);
  await expect(page.locator('#labPkgSelect option:checked')).toHaveText('Dojrzewanie');
  await expect(page.locator('#labPkgContents')).toHaveText('LH · FSH · Estradiol');
  await expect(page.locator('#labPkgEdit')).toBeVisible();
  await expect(karta.locator('.lab-pkg-row-label')).toHaveText(['LH', 'FSH', 'Estradiol']);
  await expect(karta.locator('.lab-pkg-norm-label')).toHaveText(['LH', 'FSH', 'Estradiol']);
  await expect.poll(() => pakietyKonta(page)).toEqual([['Dojrzewanie', ['lh', 'fsh', 'estradiol']]]);
  expect(await pakietyUrzadzenia(page)).toEqual([['Dojrzewanie', ['lh', 'fsh', 'estradiol']]]);

  // Wyniki: LH i FSH ocenia silnik pokwitaniowy (PR6), estradiol — katalog, jak w pojedynczym badaniu.
  await page.locator('#labPkgValue-lh').fill('2,1');
  await page.locator('#labPkgValue-fsh').fill('4,5');
  await page.locator('#labPkgValue-estradiol').fill('60');
  const lh = karta.locator('.lab-pkg-card[data-analyte="lh"]'), fsh = karta.locator('.lab-pkg-card[data-analyte="fsh"]'), e2 = karta.locator('.lab-pkg-card[data-analyte="estradiol"]');
  // Pacjentka 12 l 3 m bez oceny Th: LH i FSH mają oś wieku ze wspólnego widoku oceny, bez jednej etykiety w nagłówku.
  await expect(lh).toHaveClass(/is-assessed/);
  await expect(lh.locator('.lab-range-status')).toHaveCount(0);
  await expect(lh.locator('svg.lab-pkg-bar')).toHaveCount(0);
  await expect(lh.locator('.vilda-lab-assessment [data-comparison="age"]')).toHaveCount(1);
  await expect(lh.locator('.vilda-lab-assessment [data-comparison="stage"]')).toHaveCount(0);
  expect(await tekst(lh)).toMatch(/^LH 2,1 IU\/L .*Dla wieku .* IU\/L .*Szczegóły i źródła Wykres w pojedynczym badaniu →$/);
  const ocenaLhPakietu = await page.evaluate(() => window.VildaLabConverterRuntime.packagePuberty.assess('lh', '2,1', 'IU/L'));
  expect(ocenaLhPakietu.status).toBe('recorded');
  expect(ocenaLhPakietu.evaluation.input).toMatchObject({ analyte: 'lh', sex: 'F', contextBasis: 'current-patient', sampleDateISO: null,
    age: { years: 12, months: 3 }, referenceSelection: 'automatic', puberty: { kind: 'unspecified', stage: null } });
  const silnik = await page.evaluate(() => {
    const patient = window.VildaLabConverterRuntime.getPackagePatient('estradiol').patient;
    const ocena = window.LabUnitConverter.evaluate('estradiol', { value: '60', unit: 'pmol/L', patient });
    return { status: ocena.status, zakres: window.LabUnitConverter.selectRange(window.LabUnitConverter.find('estradiol'), patient).id, wiek: [patient.age, patient.ageUpperYears] };
  });
  expect(silnik.status).toBe('within');
  // Nośnik wieku estradiolu to przedział z danych pacjentki (12 l 3 m), nie pojedyncza liczba.
  expect(silnik.wiek[0]).toBeCloseTo(12.25, 6);
  expect(silnik.wiek[1]).toBeGreaterThan(silnik.wiek[0]);
  expect(await tekst(e2)).toMatch(/^Estradiol 60 pmol\/L w zakresie normy Norma · .+: 0–312 pmol\/L$/);
  await expect(e2.locator('.lab-range-status')).toHaveClass(/is-normal/);
  // Norma z wydruku zastępuje ocenę aplikacji dla tego wyniku (decyzja właściciela 2026-11-13): karta jak dla
  // każdego badania z normą laboratorium, bez osi silnika pokwitaniowego.
  await expect(fsh).toHaveClass(/is-assessed/);
  await page.locator('#labPkgNormLow-fsh').fill('0,3');
  await page.locator('#labPkgNormHigh-fsh').fill('4');
  expect(await tekst(fsh)).toBe('FSH 4,5 IU/L powyżej normy z wydruku Norma z wydruku: 0,3–4 IU/L laboratorium Ocena aplikacji dla wieku i stadium wraca po usunięciu normy z wydruku. Oceń FSH w pojedynczym badaniu →');
  await expect(fsh.locator('.lab-range-status')).toHaveClass(/is-above/);
  await expect(fsh).not.toHaveClass(/is-assessed/);
  await expect(fsh.locator('.vilda-lab-assessment')).toHaveCount(0);
  // Źródła norm dotyczą tylko badania ocenianego przez pakiet.
  await expect(page.locator('#labPkgSources')).toHaveText(/^Źródła norm: .*Estradiol/);

  // „Wykres w pojedynczym badaniu” otwiera pojedyncze badanie z wybranym LH; pakiet zachowuje wpisane wartości.
  await lh.getByRole('button', { name: 'Wykres w pojedynczym badaniu →' }).click();
  await expect(page.locator('#labFormPane')).toBeVisible();
  await expect(page.locator('#labModeSingle')).toHaveAttribute('aria-selected', 'true');
  expect(await page.evaluate(() => window.VildaLabConverterRuntime.getSubstanceId())).toBe('lh');
  // Ta sama wartość w pojedynczym badaniu daje TĘ SAMĄ ocenę (wejście silnika i wynik), którą pakiet zapisze.
  await page.locator('#labUnit').selectOption('IU/L');
  await page.locator('#labValue').fill('2,1');
  const ocenaLhPojedyncza = await page.evaluate(() => window.VildaLabPubertyRuntime.getAssessment());
  expect(ocenaLhPojedyncza.evaluation).toEqual(ocenaLhPakietu.evaluation);
  await page.locator('#labModePackage').click();
  await expect(page.locator('#labPkgSelect option:checked')).toHaveText('Dojrzewanie');
  await expect(page.locator('#labPkgValue-lh')).toHaveValue('2,1');

  await expect(page.locator('#labPkgSave')).toHaveText('Zapisz 3 wyniki do karty');
  await kliknij(page.locator('#labPkgSave'));
  await expect(page.locator('#labPkgDone')).toBeVisible();
  const notatki = await wynikiBadan(page, patientId);
  expect(notatki.map((n) => [n.labResult.testKey, n.title, n.body])).toEqual([
    ['estradiol', 'Estradiol (E2): 60 pmol/L (SI)', '= 60 pmol/L'],
    ['fsh', 'FSH (hormon folikulotropowy): 4,5 IU/L (SI)', '= 4,5 IU/L\nNorma: 0,3–4 IU/L'],
    ['lh', 'LH (hormon luteinizujący): 2,1 IU/L (SI)', '= 2,1 IU/L'],
  ]);
  const [zE2, zFsh, zLh] = notatki.map((n) => n.labResult);
  // LH: koperta oceny pokwitaniowej w postaci „Przypnij do wizyty” (pole wartości = sam zapis wyniku, ocena
  // związana z wynikiem i datą badania) — bez zakresu katalogu i bez normy; FSH: norma z wydruku zamiast oceny;
  // estradiol: zrzut normy aplikacji.
  expect(Object.keys(zLh).sort()).toEqual(['assessment', 'test', 'testKey', 'unit', 'value', 'valueNum']);
  expect(zLh).toMatchObject({ test: 'LH (hormon luteinizujący)', value: '2,1', testKey: 'lh', valueNum: 2.1, unit: 'IU/L' });
  expect(zLh.assessment.status).toBe('recorded');
  expect(zLh.assessment.reasonCodes).toEqual([]);
  expect(zLh.assessment.evaluation).toEqual(ocenaLhPakietu.evaluation);
  expect(zLh.assessment.binding).toMatchObject({ testKey: 'lh', value: '2,1', valueNum: 2.1, unit: 'IU/L', clinicalDateISO: '2026-06-17' });
  expect(zFsh).toEqual({ test: 'FSH (hormon folikulotropowy)', value: '4,5 IU/L (SI) = 4,5 IU/L', testKey: 'fsh', valueNum: 4.5, unit: 'IU/L', norm: '0,3–4 IU/L' });
  expect(zE2.range).toMatchObject({ status: 'recorded', classification: 'within' });
  expect(zE2.range.range.id).toBe(silnik.zakres);
  // Po zapisie jednostki i wybór pakietu zostają; pola są puste.
  await expect(page.locator('#labPkgValue-lh')).toHaveValue('');
  await expect(page.locator('#labPkgSelect option:checked')).toHaveText('Dojrzewanie');
});

test('pakiet ocenia estradiol, kortyzol, ACTH, wolny testosteron i 17-OHP tak samo jak domyślne pojedyncze badanie (zapis = „Przypnij do wizyty”)', async ({ page }) => {
  const { patientId } = await otworzPakiet(page);
  const BADANIA = [
    ['estradiol', 'Estradiol', '60', 'pmol/L'], ['cortisol', 'Kortyzol', '300', 'nmol/L'], ['acth', 'ACTH', '5', 'pmol/L'],
    ['testosterone_free', 'Testosteron wolny', '10', 'pmol/L'], ['oh17_progesterone', '17-OH-progesteron', '3', 'nmol/L'],
  ];
  // Pojedyncze badanie w stanie domyślnym (bez wyboru pory, protokołu i metody): każdy wynik przypięty do wizyty.
  await page.locator('#labModeSingle').click();
  for (const [id, szukaj, wartosc, jednostka] of BADANIA) {
    // Po przypięciu strona stoi przy wykresie historii; pole badania jest na górze formularza.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('#labSubstance').fill(szukaj);
    await page.locator(`#labSubstanceDropdown .lab-substance-option[data-id="${id}"]`).click();
    await page.locator('#labUnit').selectOption(jednostka);
    await page.locator('#labValue').fill(wartosc);
    await page.locator('#labPinResultBtn').click();
    await page.locator('#labPinDate').fill('2026-06-16');
    await page.locator('#labPinSave').click();
    await expect(page.locator('#labPinOverlay')).toHaveCount(0);
    await page.locator('#labValue').fill('');
  }
  const przypiete = await wynikiBadan(page, patientId);
  expect(przypiete.map((n) => n.labResult.testKey)).toEqual(['acth', 'cortisol', 'estradiol', 'oh17_progesterone', 'testosterone_free']);

  // Te same wyniki przez własny pakiet.
  await page.locator('#labModePackage').click();
  await utworzPakiet(page, 'Porównanie z pojedynczym', BADANIA.map((b) => b[0]));
  for (const [id, , wartosc, jednostka] of BADANIA) {
    await page.locator(`#labPkgUnit-${id}`).selectOption(jednostka);
    await page.locator(`#labPkgValue-${id}`).fill(wartosc);
  }
  await page.locator('#labPkgDate').fill('2026-06-16');
  await kliknij(page.locator('#labPkgSave'));
  await expect(page.locator('#labPkgDone')).toBeVisible();

  const wszystkie = await wynikiBadan(page, patientId);
  expect(wszystkie).toHaveLength(10);
  const pola = (n) => ({ title: n.title, body: n.body, category: n.category, clinicalDateISO: n.clinicalDateISO, linkedAgeMonths: n.linkedAgeMonths, labResult: bezCzasu(n.labResult) });
  const idPrzypietych = new Set(przypiete.map((n) => n.id));
  for (const [id] of BADANIA) {
    const para = wszystkie.filter((n) => n.labResult.testKey === id);
    expect(para, id).toHaveLength(2);
    const zPojedynczego = para.find((n) => idPrzypietych.has(n.id)), zPakietu = para.find((n) => !idPrzypietych.has(n.id));
    expect(pola(zPakietu), id).toEqual(pola(zPojedynczego));
  }
  // 17-OHP: metoda immunochemiczna (domyślna pojedynczego badania) jest w zapisanym zrzucie normy.
  const ohp = wszystkie.find((n) => n.labResult.testKey === 'oh17_progesterone').labResult;
  expect(await page.evaluate(() => window.VildaLabConverterRuntime.getPackagePatient('oh17_progesterone').patient.method)).toBe('immunoassay_pl');
  expect(JSON.stringify(ohp.range)).toContain('immunoassay_pl');
});

test('kreator: walidacja nazwy i składu, kolejność badań, limit 10 badań, „Anuluj” niczego nie zapisuje', async ({ page }) => {
  await otworzPakiet(page);
  await page.locator('#labPkgNew').click();
  // Nazwa pakietu wbudowanego jest zajęta (bez względu na wielkość liter); błąd widać od razu.
  await page.locator('#labPkgCreatorName').fill('tarczyca');
  await expect(page.locator('#labPkgCreatorNameError')).toHaveText('Masz już pakiet o tej nazwie.');
  await expect(page.locator('#labPkgCreatorName')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#labPkgCreatorSave')).toBeDisabled();
  // Pusta nazwa: komunikat przy polu dopiero po wyjściu z pola.
  await page.locator('#labPkgCreatorName').fill('');
  await expect(page.locator('#labPkgCreatorNameError')).toBeHidden();
  await page.locator('#labPkgCreatorSearch').focus();
  await expect(page.locator('#labPkgCreatorNameError')).toHaveText('Podaj nazwę pakietu.');
  await page.locator('#labPkgCreatorName').fill('Nadnercza i gonady');
  await expect(page.locator('#labPkgCreatorNameError')).toBeHidden();
  await expect(page.locator('#labPkgCreatorHint')).toHaveText('Dodaj co najmniej jedno badanie.');

  await page.locator('#labPkgCreatorGroups details').evaluateAll((grupy) => grupy.forEach((g) => { g.open = true; }));
  for (const id of ['lh', 'fsh', 'estradiol']) await zaznacz(page.locator(`#labPkgCreatorOpt-${id}`));
  await expect(page.locator('#labPkgCreatorSave')).toBeEnabled();
  const kolejnosc = () => page.locator('#labPkgCreatorList li').evaluateAll((w) => w.map((li) => li.getAttribute('data-analyte')));
  const przyciski = (id) => page.locator(`#labPkgCreatorList li[data-analyte="${id}"] button`);
  // Pierwsze badanie nie idzie wyżej, ostatnie — niżej.
  await expect(przyciski('lh').nth(0)).toBeDisabled();
  await expect(przyciski('estradiol').nth(1)).toBeDisabled();
  await expect(przyciski('fsh').nth(0)).toHaveAttribute('aria-label', 'Przesuń FSH w górę');
  await expect(przyciski('fsh').nth(1)).toHaveAttribute('aria-label', 'Przesuń FSH w dół');
  await expect(przyciski('fsh').nth(2)).toHaveAttribute('aria-label', 'Usuń FSH z pakietu');
  await kliknij(przyciski('estradiol').nth(0));
  expect(await kolejnosc()).toEqual(['lh', 'estradiol', 'fsh']);
  // Fokus zostaje na przycisku przesuniętego badania — kolejne naciśnięcie przesuwa je dalej.
  await expect(przyciski('estradiol').nth(0)).toBeFocused();
  await page.keyboard.press('Enter');
  expect(await kolejnosc()).toEqual(['estradiol', 'lh', 'fsh']);
  // Na samej górze przycisk „w górę” jest nieczynny, fokus przechodzi na „w dół” tego samego badania.
  await expect(przyciski('estradiol').nth(1)).toBeFocused();
  // Usunięcie z listy odznacza badanie w katalogu.
  await kliknij(przyciski('lh').nth(2));
  expect(await kolejnosc()).toEqual(['estradiol', 'fsh']);
  await expect(page.locator('#labPkgCreatorOpt-lh')).not.toBeChecked();
  // Odznaczenie ostatniego badania pokazuje błąd składu.
  await odznacz(page.locator('#labPkgCreatorOpt-estradiol'));
  await odznacz(page.locator('#labPkgCreatorOpt-fsh'));
  await expect(page.locator('#labPkgCreatorListError')).toHaveText('Dodaj co najmniej jedno badanie.');
  await expect(page.locator('#labPkgCreatorSave')).toBeDisabled();

  // Limit 10 badań: przy dziesięciu pozostałe pola wyboru są nieczynne, zaznaczone da się odznaczyć.
  const dziesiec = ['cortisol', 'acth', 'aldosterone', 'oh17_progesterone', 'dhea_s', 'androstenedione', 'testosterone_total', 'estradiol', 'lh', 'fsh'];
  for (const id of dziesiec) await zaznacz(page.locator(`#labPkgCreatorOpt-${id}`));
  await expect(page.locator('#labPkgCreatorCount')).toHaveText('10 z 10');
  await expect(page.locator('#labPkgCreatorLimit')).toHaveText('Pakiet może mieć najwyżej 10 badań — usuń któreś, żeby dodać inne.');
  await expect(page.locator('#labPkgCreatorGroups input[type="checkbox"]:disabled')).toHaveCount(24);
  await expect(page.locator('#labPkgCreatorGroups input[type="checkbox"]:checked:disabled')).toHaveCount(0);
  await expect(page.locator('#labPkgCreatorOpt-tsh')).toBeDisabled();
  await odznacz(page.locator('#labPkgCreatorOpt-aldosterone'));
  await expect(page.locator('#labPkgCreatorLimit')).toBeHidden();
  await expect(page.locator('#labPkgCreatorOpt-tsh')).toBeEnabled();
  await expect(page.locator('#labPkgCreatorSave')).toBeEnabled();

  // „Anuluj” wraca do formularza: żadnego nowego pakietu na liście, na urządzeniu ani na koncie.
  await kliknij(page.locator('#labPkgCreatorCancel'));
  await expect(page.locator('#labPkgCreator')).toBeHidden();
  await expect(page.locator('#labPkgSelect')).toBeFocused();
  expect(await opcjeListy(page)).toEqual([['Wbudowane', ['Tarczyca']]]);
  expect(await pakietyUrzadzenia(page)).toEqual([]);
  expect(await pakietyKonta(page)).toBeNull();
  await expect(page.locator('#labPkgValue-tsh')).toBeVisible();
  // Ponowne otwarcie zaczyna od pustego kreatora.
  await page.locator('#labPkgNew').click();
  await expect(page.locator('#labPkgCreatorName')).toHaveValue('');
  await expect(page.locator('#labPkgCreatorCount')).toHaveText('0 z 10');
  await expect(page.locator('#labPkgCreatorGroups input[type="checkbox"]:checked')).toHaveCount(0);
});

test('edycja i usuwanie pakietu: nazwa i skład zmieniają się w miejscu, wpisane wartości zostają, usunięcie wymaga potwierdzenia', async ({ page }) => {
  const { patientId } = await otworzPakiet(page);
  const karta = kartaPakietu(page);
  await utworzPakiet(page, 'Dojrzewanie', ['lh', 'fsh', 'estradiol']);
  await page.locator('#labPkgValue-lh').fill('2,1');
  await page.locator('#labPkgUnit-estradiol').selectOption('pg/mL');
  await page.locator('#labPkgValue-estradiol').fill('16');
  await page.locator('#labPkgNormLow-estradiol').fill('5');
  await page.locator('#labPkgNormHigh-estradiol').fill('30');
  const idPakietu = await page.locator('#labPkgSelect').inputValue();
  expect(idPakietu).toMatch(/^u[a-z0-9]{10}$/);

  await page.locator('#labPkgEdit').click();
  await expect(page.locator('#labPkgCreatorTitle')).toHaveText('Edytuj pakiet: Dojrzewanie');
  await expect(page.locator('#labPkgCreatorName')).toHaveValue('Dojrzewanie');
  await expect(page.locator('#labPkgCreator .lab-pkg-creator-edit-note')).toHaveText('Zmiana nazwy lub składu dotyczy następnych wpisów. Wyniki zapisane wcześniej zostają w karcie pacjenta bez zmian.');
  await expect(page.locator('#labPkgCreatorSave')).toHaveText('Zapisz zmiany');
  await expect(page.locator('#labPkgCreatorSave')).toBeEnabled();
  await expect(page.locator('#labPkgCreatorGroups input[type="checkbox"]:checked')).toHaveCount(3);
  // Własna nazwa nie jest „zajęta”; nazwa innego pakietu — tak.
  await page.locator('#labPkgCreatorName').fill('Tarczyca');
  await expect(page.locator('#labPkgCreatorNameError')).toHaveText('Masz już pakiet o tej nazwie.');
  await page.locator('#labPkgCreatorName').fill('  Pokwitanie   dziewcząt ');
  await kliknij(page.locator('#labPkgCreatorList li[data-analyte="fsh"] button').nth(2));
  await zaznacz(page.locator('#labPkgCreatorOpt-inhibin_b'));
  await kliknij(page.locator('#labPkgCreatorList li[data-analyte="estradiol"] button').nth(0));
  await kliknij(page.locator('#labPkgCreatorSave'));

  await expect(page.locator('#labPkgCreator')).toBeHidden();
  await expect(page.locator('#labToast')).toHaveText('✓ Zapisano pakiet: Pokwitanie dziewcząt');
  expect(await opcjeListy(page)).toEqual([['Wbudowane', ['Tarczyca']], ['Twoje pakiety', ['Pokwitanie dziewcząt']]]);
  // Ten sam pakiet (identyfikator bez zmian) w nowym składzie i kolejności.
  await expect(page.locator('#labPkgSelect')).toHaveValue(idPakietu);
  await expect(page.locator('#labPkgContents')).toHaveText('Estradiol · LH · Inhibina B');
  await expect(karta.locator('.lab-pkg-row-label')).toHaveText(['Estradiol', 'LH', 'Inhibina B']);
  await expect.poll(() => pakietyKonta(page)).toEqual([['Pokwitanie dziewcząt', ['estradiol', 'lh', 'inhibin_b']]]);
  // Wartości, jednostka i norma badań, które zostały w pakiecie, nie znikają.
  await expect(page.locator('#labPkgValue-lh')).toHaveValue('2,1');
  await expect(page.locator('#labPkgValue-estradiol')).toHaveValue('16');
  await expect(page.locator('#labPkgUnit-estradiol')).toHaveValue('pg/mL');
  await expect(page.locator('#labPkgNormLow-estradiol')).toHaveValue('5');
  await expect(page.locator('#labPkgNormHigh-estradiol')).toHaveValue('30');
  await expect(page.locator('#labPkgValue-inhibin_b')).toHaveValue('');
  await expect(page.locator('#labPkgValue-fsh')).toHaveCount(0);
  await expect(karta.locator('.lab-pkg-card[data-analyte="estradiol"] .lab-range-status')).toHaveText('w normie z wydruku');

  // Usuwanie: najpierw pytanie; „Zostaw” niczego nie zmienia.
  await page.locator('#labPkgEdit').click();
  await expect(page.locator('#labPkgCreatorConfirm')).toBeHidden();
  await kliknij(page.locator('#labPkgCreatorDelete'));
  expect(await tekst(page.locator('#labPkgCreatorConfirm'))).toBe('Usunąć pakiet „Pokwitanie dziewcząt”? Pakiet zniknie z listy na wszystkich Twoich urządzeniach. Zapisane wyniki badań nie są usuwane. Usuń pakiet Zostaw');
  await expect(page.locator('#labPkgCreatorDeleteCancel')).toBeFocused();
  await kliknij(page.locator('#labPkgCreatorDeleteCancel'));
  await expect(page.locator('#labPkgCreatorConfirm')).toBeHidden();
  await expect(page.locator('#labPkgCreatorDelete')).toBeFocused();
  expect(await pakietyUrzadzenia(page)).toHaveLength(1);
  await kliknij(page.locator('#labPkgCreatorDelete'));
  await kliknij(page.locator('#labPkgCreatorDeleteConfirm'));

  await expect(page.locator('#labPkgCreator')).toBeHidden();
  await expect(page.locator('#labToast')).toHaveText('Usunięto pakiet: Pokwitanie dziewcząt');
  expect(await opcjeListy(page)).toEqual([['Wbudowane', ['Tarczyca']]]);
  await expect(page.locator('#labPkgSelect')).toHaveValue('thyroid');
  await expect(karta.locator('.lab-pkg-row-label')).toHaveText(['TSH', 'fT4', 'fT3']);
  await expect(page.locator('#labPkgEdit')).toBeHidden();
  // Na koncie zostaje pusta lista (usunięcie też się synchronizuje); wyniki pacjenta są nietknięte.
  await expect.poll(() => pakietyKonta(page)).toEqual([]);
  expect(await wynikiBadan(page, patientId)).toEqual([]);
});

test('bez wybranego pacjenta: pakiety da się tworzyć i wybierać, pola wyników czekają na pacjenta', async ({ page }) => {
  const { patientId } = await otworzPakiet(page, { pacjent: false });
  const karta = kartaPakietu(page);
  expect(await tekst(karta.locator('.lab-pkg-gate'))).toBe('Nie wybrano pacjenta Wpisywanie wyników wymaga pacjenta: pakiet zapisuje je w jego karcie i dobiera normy do wieku i płci. Wybierz pacjenta w Bazie pacjentów albo zapisz nowego na stronie głównej. Pakiety możesz tworzyć i zmieniać bez pacjenta — należą do konta. Wybierz pacjenta');
  await utworzPakiet(page, 'Nadnercza', ['cortisol', 'acth', 'oh17_progesterone']);
  expect(await opcjeListy(page)).toEqual([['Wbudowane', ['Tarczyca']], ['Twoje pakiety', ['Nadnercza']]]);
  await expect(page.locator('#labPkgContents')).toHaveText('Kortyzol · ACTH · 17-OH-progesteron');
  await expect.poll(() => pakietyKonta(page)).toEqual([['Nadnercza', ['cortisol', 'acth', 'oh17_progesterone']]]);
  // Bramka zostaje, pól wyników nie ma; wybór pakietu działa.
  await expect(karta.locator('.lab-pkg-gate-title')).toHaveText('Nie wybrano pacjenta');
  await expect(karta.locator('.lab-pkg-value')).toHaveCount(0);
  await expect(page.locator('#labPkgSave')).toHaveCount(0);
  await page.locator('#labPkgSelect').selectOption({ label: 'Tarczyca' });
  await expect(page.locator('#labPkgContents')).toHaveText('TSH · fT4 · fT3');
  await page.locator('#labPkgSelect').selectOption({ label: 'Nadnercza' });

  // Po wczytaniu pacjenta formularz jest formularzem wybranego pakietu.
  await wczytajPacjenta(page, patientId);
  await expect(karta.locator('.lab-pkg-gate')).toBeHidden();
  await expect(karta.locator('.lab-pkg-row-label')).toHaveText(['Kortyzol', 'ACTH', '17-OH-progesteron']);
  await page.locator('#labPkgValue-cortisol').fill('300');
  await expect(karta.locator('.lab-pkg-card[data-analyte="cortisol"] .lab-pkg-card-value')).toHaveText('300');
  await expect(page.locator('#labPkgSave')).toBeEnabled();
});

test('pakiety z innego urządzenia konta pojawiają się bez przeładowania; ostatnio wybrany pakiet pamięta urządzenie; ?pakiet=<id> otwiera własny pakiet', async ({ page }) => {
  await otworzPakiet(page);
  const karta = kartaPakietu(page);
  await utworzPakiet(page, 'Dojrzewanie', ['lh', 'fsh', 'estradiol']);
  await page.locator('#labPkgValue-lh').fill('2,1');
  // Synchronizacja konta zapisuje preferencję tak jak sejf po scaleniu danych z chmury (applyPreferenceFromCloud).
  const naUrzadzeniu = () => page.evaluate(() => window.VildaLabPackages.readCustom(window.VildaPersistence).packages);
  const zChmury = (packages) => page.evaluate((lista) => {
    window.VildaPersistence.applyPreferenceFromCloud('labCustomPackages', JSON.stringify({ schemaVersion: 1, updatedAtISO: '2026-06-17T12:00:00.000Z', packages: lista }));
    window.dispatchEvent(new Event('focus'));
  }, packages);
  const [dojrzewanie] = await naUrzadzeniu();
  // Inne urządzenie konta zmieniło skład „Dojrzewania” i dodało „Nadnercza”.
  await zChmury([{ ...dojrzewanie, analytes: ['lh', 'estradiol'] }, { id: 'uzdalny00001', name: 'Nadnercza', analytes: ['cortisol', 'acth'] }]);
  await expect.poll(() => opcjeListy(page)).toEqual([['Wbudowane', ['Tarczyca']], ['Twoje pakiety', ['Dojrzewanie', 'Nadnercza']]]);
  // Wybrany pakiet zmienił skład na innym urządzeniu: pola się przebudowały, wpisana wartość LH została.
  await expect(karta.locator('.lab-pkg-row-label')).toHaveText(['LH', 'Estradiol']);
  await expect(page.locator('#labPkgValue-lh')).toHaveValue('2,1');
  await expect(page.locator('#labPkgContents')).toHaveText('LH · Estradiol');

  // Wybór pakietu pamięta to urządzenie — po ponownym otwarciu strony wraca ten sam pakiet.
  await page.locator('#labPkgSelect').selectOption({ label: 'Nadnercza' });
  await expect(karta.locator('.lab-pkg-row-label')).toHaveText(['Kortyzol', 'ACTH']);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked());
  await page.locator('#labModePackage').click();
  await expect(page.locator('#labPkgSelect option:checked')).toHaveText('Nadnercza');
  await expect(karta.locator('.lab-pkg-row-label')).toHaveText(['Kortyzol', 'ACTH']);

  // Adres ?pakiet=<identyfikator> (np. ze skrótu) otwiera własny pakiet także z pojedynczego badania.
  await page.locator('#labModeSingle').click();
  const idDojrzewania = await page.evaluate(() => window.VildaLabPackages.readCustom(window.VildaPersistence).packages[0].id);
  await page.evaluate((id) => window.dispatchEvent(new CustomEvent('vilda:shell-navigate-target', { detail: { href: `${location.pathname}?pakiet=${id}` } })), idDojrzewania);
  await expect(page.locator('#labModePackage')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#labPkgSelect option:checked')).toHaveText('Dojrzewanie');
  await expect(page.locator('#labPkgValue-lh')).toBeFocused();

  // Wybrany pakiet usunięty na innym urządzeniu: lista wraca do pakietu wbudowanego.
  await zChmury((await naUrzadzeniu()).filter((pakiet) => pakiet.name !== 'Dojrzewanie'));
  await expect.poll(() => opcjeListy(page)).toEqual([['Wbudowane', ['Tarczyca']], ['Twoje pakiety', ['Nadnercza']]]);
  await expect(page.locator('#labPkgSelect')).toHaveValue('thyroid');
  await expect(karta.locator('.lab-pkg-row-label')).toHaveText(['TSH', 'fT4', 'fT3']);
});

test('estradiol u dorosłej kobiety: pakiet nie zgaduje fazy cyklu — wynik bez oceny i łącze do pojedynczego badania', async ({ page }) => {
  await otworzPakiet(page);
  const karta = kartaPakietu(page);
  const dorosla = await page.evaluate(async () => (await window.VildaVault.savePatient({
    name: 'Fikcyjna Dorosła', user: { name: 'Fikcyjna Dorosła', sex: 'F', age: 30, ageMonths: 0, height: 168, weight: 62 },
  }, { dedup: false })).patientId);
  await wczytajPacjenta(page, dorosla, { name: 'Fikcyjna Dorosła', sex: 'F', age: 30, ageMonths: 0 });
  await utworzPakiet(page, 'Estrogeny', ['estradiol', 'estrone']);
  await page.locator('#labPkgValue-estradiol').fill('100');
  await page.locator('#labPkgValue-estrone').fill('200');
  const e2 = karta.locator('.lab-pkg-card[data-analyte="estradiol"]');
  expect(await tekst(e2)).toBe('Estradiol 100 pmol/L bez oceny względem zakresu Ocena wymaga kontekstu badania (np. fazy cyklu) — wybierzesz go w pojedynczym badaniu. Oceń Estradiol w pojedynczym badaniu →');
  await expect(e2.locator('.lab-range-status')).toHaveClass(/is-general/);
  // Silnik pojedynczego badania mówi to samo dla tej pacjentki: bez fazy cyklu nie ma oceny.
  expect(await page.evaluate(() => {
    const patient = window.VildaLabConverterRuntime.getPackagePatient('estradiol').patient;
    const ocena = window.LabUnitConverter.evaluate('estradiol', { value: '100', unit: 'pmol/L', patient });
    return [patient.sex, patient.cycle_phase, ocena.status, ocena.reference_context_required];
  })).toEqual(['F', null, 'no_interpretation', true]);
  // Estron nie zależy tu od dodatkowego pola: zwykła ocena, bez łącza.
  await expect(karta.locator('.lab-pkg-card[data-analyte="estrone"] .lab-pkg-card-link')).toHaveCount(0);
  await e2.getByRole('button', { name: 'Oceń Estradiol w pojedynczym badaniu →' }).click();
  await expect(page.locator('#labFormPane')).toBeVisible();
  expect(await page.evaluate(() => window.VildaLabConverterRuntime.getSubstanceId())).toBe('estradiol');
});

test('limit 12 własnych pakietów: „Nowy pakiet” wyjaśnia, zamiast otwierać kreator', async ({ page }) => {
  await otworzPakiet(page);
  await page.evaluate(() => {
    const packages = Array.from({ length: 12 }, (_, i) => ({ id: `ulimit${String(i).padStart(5, '0')}`, name: `Fikcyjny pakiet ${i + 1}`, analytes: ['tsh'] }));
    window.VildaPersistence.applyPreferenceFromCloud('labCustomPackages', JSON.stringify({ schemaVersion: 1, updatedAtISO: '2026-06-17T10:00:00.000Z', packages }));
    window.dispatchEvent(new Event('focus'));
  });
  await expect(page.locator('#labPkgSelect optgroup[label="Twoje pakiety"] option')).toHaveCount(12);
  await page.locator('#labPkgNew').click();
  await expect(page.locator('#labPkgPickerNote')).toHaveText('Możesz mieć najwyżej 12 własnych pakietów. Usuń któryś, żeby dodać nowy.');
  await expect(page.locator('#labPkgCreator')).toHaveCount(0);
  // Edycja istniejącego pakietu działa mimo limitu.
  await page.locator('#labPkgSelect').selectOption({ label: 'Fikcyjny pakiet 3' });
  await expect(page.locator('#labPkgPickerNote')).toBeHidden();
  await page.locator('#labPkgEdit').click();
  await expect(page.locator('#labPkgCreatorTitle')).toHaveText('Edytuj pakiet: Fikcyjny pakiet 3');
  await expect(page.locator('#labPkgCreatorSave')).toBeEnabled();
});
