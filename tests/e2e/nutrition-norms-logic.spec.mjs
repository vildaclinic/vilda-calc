import { expect, test } from '@playwright/test';

// Testy regresyjne zmiany U1 w karcie „Normy żywieniowe" (nutrition_norms.js):
// nagłówkowa norma białka w g/d liczona jest od masy należnej przy BMI 22
// (dorośli) lub masy typowej dla wieku i płci (dzieci 1–18) — zgodnie z
// definicją EAR/RDA w Normach żywienia dla populacji Polski (NIZP PZH–PIB,
// 2024). Masa aktualna pozostaje w linii porównania. Testy wołają PRAWDZIWĄ
// funkcję produkcyjną window.nutritionNormsBuildCardModel oraz produkcyjny
// renderer na stronie index.html (AGENTS.md §3.5). Dane wyłącznie FIKCYJNE.
//
// Przypadki syntetyczne (wejście → oczekiwany wynik):
//  NORM-PROT-U1-ADULT-OBESE: kobieta 40 lat, 110 kg, 165 cm → RDA g/d od masy
//    należnej 22×1,65² = 59,9 kg → 49,7 g/d (nie 91,3 g/d od masy aktualnej);
//    porównanie „masa aktualna" widoczne.
//  NORM-PROT-U1-CHILD-OBESE: chłopiec 9 lat, 55 kg, 135 cm → RDA od masy
//    typowej dla wieku (tabela referencyjna), porównanie z masą aktualną
//    widoczne.
//  NORM-PROT-U1-NEAR-EQUAL: mężczyzna 19 lat, 70 kg, 178 cm → masa aktualna
//    ≈ należna (69,7 kg), porównanie ukryte (różnica < 1 g).
//  NORM-PROT-U1-NO-WEIGHT: dorosły bez masy, ze wzrostem → norma białka
//    dostępna z masy należnej (przed U1 była niedostępna).
//  NORM-PROT-U1-INFANT: niemowlę 8 mies., 8 kg → bez zmian, podstawa masa
//    aktualna.
//  NORM-PROT-U1-RENDER: karta w DOM pokazuje podstawę przy „Norma białka"
//    i poprawną gramatycznie linię porównania „dla masy aktualnej".
//
// Zmiana U2 (niemowlęta 6–11 mies.) — wartości POTWIERDZONE w pierwotnym
// źródle (PDF „Normy spożycia dla populacji Polski", w repo): tłuszcz
// 30–45%E (Tabela 1 i 2 rozdziału o tłuszczach), węglowodany RI 45–55%E
// (Tabela 8 rozdziału o węglowodanach, wg PTGHiŻD 2014). Pierwsza wersja
// U2 (40%E referencyjnie, AI 95 g/d) opierała się na błędnych omówieniach
// wtórnych i została wycofana po weryfikacji z PDF-em.
//  NORM-U2-INFANT-MACROS: tłuszcz [30,45]%E i węglowodany [45,55]%E,
//    gramy przeliczone z TEE, planningReference 10/37,5/52,5%E.
//  NORM-U2-INFANT-RENDER: kafle karty pokazują „30–45% energii"
//    i „45–55% energii" — bez „około 40%", bez „95 g/d", bez not AI.
//  NORM-U2-REPORT: karta raportu pacjenta i linie podsumowania pokazują
//    przedziały; formatery raportu zwijają zdegenerowane pary (robustność).
//  NORM-U2-RANGES-INTACT: dzieci ≥1 r.ż. i dorośli — przedziały bez regresji.

async function openIndex(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.nutritionNormsBuildCardModel === 'function');
}

function buildModel(page, input, ui) {
  return page.evaluate(
    ({ input, ui }) => window.nutritionNormsBuildCardModel(input, ui || {}),
    { input, ui },
  );
}

test('NORM-PROT-U1-ADULT-OBESE: RDA od masy należnej BMI 22, masa aktualna w porównaniu', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  const m = await buildModel(
    page,
    { ageYears: 40, ageMonthsOpt: null, sex: 'F', weightKg: 110, heightCm: 165 },
    { palSelector: '1.6', bodyMode: 'actual' },
  );
  const expectedBasisKg = 22 * 1.65 * 1.65; // 59,895 kg
  expect(m.protein.basisLabel).toBe('masa należna przy BMI 22');
  expect(m.protein.main.basisWeightKg).toBeCloseTo(expectedBasisKg, 2);
  expect(m.protein.main.rdaGDay).toBeCloseTo(expectedBasisKg * 0.83, 1); // ≈49,7 g/d
  expect(m.protein.main.earGDay).toBeCloseTo(expectedBasisKg * 0.66, 1);
  expect(m.protein.comparisonLabel).toBe('masa aktualna');
  expect(m.protein.comparisonValue).toBeCloseTo(110 * 0.83, 1); // ≈91,3 g/d
  expect(m.protein.showComparison).toBe(true);
  // Energia (TEE) nadal od masy aktualnej — U1 nie zmienia energii.
  expect(m.energy.basisWeightKg).toBe(110);
});

test('NORM-PROT-U1-CHILD-OBESE: dziecko — RDA od masy typowej dla wieku, porównanie widoczne', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  const m = await buildModel(
    page,
    { ageYears: 9, ageMonthsOpt: null, sex: 'M', weightKg: 55, heightCm: 135 },
    { palSelector: '1.6', bodyMode: 'actual' },
  );
  const refKg = m.protein.targets.referenceWeightKg;
  expect(refKg).toBeGreaterThan(20);
  expect(refKg).toBeLessThan(45);
  expect(m.protein.basisLabel).toContain('wartości typowe dla wieku 9 lat');
  expect(m.protein.main.basisWeightKg).toBeCloseTo(refKg, 3);
  expect(m.protein.main.rdaGDay).toBeCloseTo(refKg * m.protein.targets.rda_g_per_kg, 1);
  expect(m.protein.comparisonLabel).toBe('masa aktualna');
  expect(m.protein.comparisonValue).toBeCloseTo(55 * m.protein.targets.rda_g_per_kg, 1);
  expect(m.protein.showComparison).toBe(true);
});

test('NORM-PROT-U1-NEAR-EQUAL: masa aktualna ≈ należna → porównanie ukryte', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  const m = await buildModel(
    page,
    { ageYears: 19, ageMonthsOpt: null, sex: 'M', weightKg: 70, heightCm: 178 },
    { palSelector: '1.6', bodyMode: 'actual' },
  );
  expect(m.protein.basisLabel).toBe('masa należna przy BMI 22');
  expect(m.protein.showComparison).toBe(false);
});

test('NORM-PROT-U1-NO-WEIGHT: dorosły bez masy — norma białka liczona ze wzrostu', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  const m = await buildModel(
    page,
    { ageYears: 30, ageMonthsOpt: null, sex: 'M', weightKg: null, heightCm: 180 },
    { palSelector: '1.6', bodyMode: 'actual' },
  );
  const expectedBasisKg = 22 * 1.8 * 1.8; // 71,28 kg
  expect(m.protein.available).toBe(true);
  expect(m.protein.main.rdaGDay).toBeCloseTo(expectedBasisKg * 0.83, 1);
  expect(m.protein.comparisonValue).toBeNull();
  expect(m.protein.showComparison).toBe(false);
});

test('NORM-PROT-U1-INFANT: niemowlę 6–11 mies. bez zmian — podstawa masa aktualna', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  const m = await buildModel(
    page,
    { ageYears: 0.67, ageMonthsOpt: 8, sex: 'M', weightKg: 8, heightCm: 70 },
    {},
  );
  expect(m.protein.basisLabel).toBe('masa aktualna');
  expect(m.protein.main.basisWeightKg).toBe(8);
  expect(m.protein.main.rdaGDay).toBeCloseTo(8 * m.protein.targets.rda_g_per_kg, 2);
  expect(m.protein.showComparison).toBe(false);
});

test('NORM-PROT-U1-RENDER: karta pokazuje podstawę normy, raport — porównanie „dla masy aktualnej"', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  const out = await page.evaluate(() => {
    const set = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.value = String(value);
    };
    set('age', 40);
    set('ageMonths', 0);
    set('sex', 'F');
    set('weight', 110);
    set('height', 165);
    window.renderNutritionNormsCardFromDom();
    const mount = document.getElementById('nutritionNormsMount');
    const model = window.nutritionNormsLastModel;
    const reportCard = window.nutritionNormsBuildPatientReportCard(model);
    return { html: mount ? mount.innerHTML : '', comparisonNote: reportCard.comparisonNote || '' };
  });
  // Panel „Norma białka" na karcie jawnie podaje podstawę masy.
  expect(out.html).toContain('podstawa: masa należna przy BMI 22');
  // Zdanie porównawcze (karta raportu) — poprawna gramatyka, bez „dla masa ...".
  expect(out.comparisonNote).toContain('dla masy aktualnej');
  expect(out.comparisonNote).not.toContain('dla masa ');
});

test('NORM-U2-INFANT-MACROS: tłuszcz 30–45%E i węglowodany 45–55%E wg tabel norm', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  const m = await buildModel(
    page,
    { ageYears: 0.67, ageMonthsOpt: 8, sex: 'M', weightKg: 8, heightCm: 70 },
    {},
  );
  // Tabela 1 (tłuszcze): niemowlęta > 6–12 mies. → 30–45 % E.
  expect(m.fat.percentRange).toEqual([30, 45]);
  expect(m.fat.lowActivityNote || '').toBe('');
  // Tabela 8 (węglowodany): 6–11 mies. → RI 45–55 % E.
  expect(m.carbs.percentRange).toEqual([45, 55]);
  // Gramy przeliczone z TEE (Tabela 2 norm liczy je tak samo: %E × TEE / 9).
  expect(m.energy.available).toBe(true);
  const tee = m.energy.mainValue;
  expect(m.fat.gramRange[0]).toBeCloseTo((tee * 0.3) / 9, 0);
  expect(m.fat.gramRange[1]).toBeCloseTo((tee * 0.45) / 9, 0);
  expect(m.carbs.gramRange[0]).toBeCloseTo((tee * 0.45) / 4, 0);
  expect(m.carbs.gramRange[1]).toBeCloseTo((tee * 0.55) / 4, 0);
  // Punkt odniesienia posiłków: środki przedziałów (10/37,5/52,5 %E).
  expect(m.planningReference.percent.fat).toBe(37.5);
  expect(m.planningReference.percent.carbs).toBe(52.5);
});

test('NORM-U2-INFANT-RENDER: kafle karty pokazują przedziały, bez wartości referencyjnych i AI', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  const html = await page.evaluate(() => {
    const set = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.value = String(value);
    };
    set('age', 0);
    set('ageMonths', 8);
    set('sex', 'M');
    set('weight', 8);
    set('height', 70);
    window.renderNutritionNormsCardFromDom();
    const mount = document.getElementById('nutritionNormsMount');
    return mount ? mount.innerHTML : '';
  });
  expect(html).toContain('30–45% energii');
  expect(html).toContain('45–55% energii');
  expect(html).not.toContain('około 40% energii');
  expect(html).not.toContain('spożycie wystarczające (AI)');
  expect(html).not.toContain('95 g/d');
});

test('NORM-U2-REPORT: karta raportu pacjenta pokazuje przedziały; formatery zwijają zdegenerowane pary', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  await page.addScriptTag({ url: '/vilda_patient_report.js?v=8' });
  await page.waitForFunction(() => typeof window.patientReportBuildNutritionCardFromModel === 'function');
  const out = await page.evaluate(() => {
    const model = window.nutritionNormsBuildCardModel(
      { ageYears: 0.67, ageMonthsOpt: 8, sex: 'M', weightKg: 8, heightCm: 70 },
      { includeInSummary: true },
    );
    const card = window.patientReportBuildNutritionCardFromModel(model);
    const lines = window.patientReportBuildNutritionSummaryLinesFromModel(model);
    const degeneratePercent = window.patientReportFormatNutritionNormsPercentRange
      ? window.patientReportFormatNutritionNormsPercentRange([40, 40])
      : null;
    const degenerateGrams = window.patientReportFormatNutritionNormsGramRange
      ? window.patientReportFormatNutritionNormsGramRange([95, 95], 0)
      : null;
    return { card, lines, degeneratePercent, degenerateGrams };
  });
  const fatRow = out.card.rows.find((r) => r.label === 'Tłuszcze');
  const carbRow = out.card.rows.find((r) => r.label === 'Węglowodany');
  expect(fatRow.valueText).toContain('30–45% energii');
  expect(carbRow.valueText).toContain('45–55% energii');
  const macroLine = out.lines.find((l) => l.startsWith('Makroskładniki'));
  expect(macroLine).toContain('tłuszcz 30–45% energii');
  expect(macroLine).toContain('węglowodany 45–55% energii');
  // Robustność formaterów raportu (uwaga Codex z #116): zdegenerowana para
  // nigdy nie renderuje się jako „40–40% energii" / „95–95 g/d".
  if (out.degeneratePercent !== null) expect(out.degeneratePercent).toBe('około 40% energii');
  if (out.degenerateGrams !== null) expect(out.degenerateGrams).toBe('95 g/d');
});

test('NORM-PAL14-CHILD: PAL 1,4 dla 13-latka — opcja kliniczna, TEE metodą norm, komunikat', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  const m14 = await buildModel(
    page,
    { ageYears: 13, ageMonthsOpt: null, sex: 'M', weightKg: 45, heightCm: 158 },
    { palSelector: '1.4', bodyMode: 'actual' },
  );
  const m16 = await buildModel(
    page,
    { ageYears: 13, ageMonthsOpt: null, sex: 'M', weightKg: 45, heightCm: 158 },
    { palSelector: '1.6', bodyMode: 'actual' },
  );
  expect(m14.energy.available).toBe(true);
  expect(m14.energy.usedPal).toBe(1.4);
  expect(m14.energy.clinicalPal).toBe(true);
  expect(m16.energy.clinicalPal).toBe(false);
  // Ta sama metoda norm (Henry × PAL × 1,01): TEE skaluje się liniowo z PAL.
  expect(m14.energy.mainValue).toBeCloseTo((m16.energy.mainValue * 1.4) / 1.6, 0);
  // Komunikat o wyborze poza normami.
  const note = (m14.messages || []).find((x) => String(x.text || '').includes('poza Normami 2024'));
  expect(note).toBeTruthy();
  expect(note.text).toContain('1,6–2,0');
  // Opcja w selektorze karty: 1,4 z dopiskiem, oznaczona jako kliniczna.
  const opt = m14.ui.palOptions.find((o) => o.value === '1.4');
  expect(opt).toBeTruthy();
  expect(opt.label).toContain('(poza Normami 2024)');
  expect(opt.clinical).toBe(true);
  // Karta raportu pacjenta przenosi zastrzeżenie.
  await page.addScriptTag({ url: '/vilda_patient_report.js?v=8' });
  await page.waitForFunction(() => typeof window.patientReportBuildNutritionCardFromModel === 'function');
  const reportNote = await page.evaluate((model) => window.patientReportBuildNutritionCardFromModel(model).note, m14);
  expect(reportNote).toContain('poza Normami 2024');
});

test('NORM-PAL14-RANGE-AND-GUARDS: „pełen zakres" bez 1,4; 4–9 lat normatywnie; dorosły bez 1,2', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  // „Pełen zakres aktywności" dla 13-latka pozostaje normatywny: 1,6–2,0.
  const range = await buildModel(
    page,
    { ageYears: 13, ageMonthsOpt: null, sex: 'F', weightKg: 45, heightCm: 158 },
    { palSelector: 'range', bodyMode: 'actual' },
  );
  const pals = (range.energy.items || []).map((i) => i.pal);
  expect(pals).toEqual([1.6, 1.8, 2]);
  expect(range.energy.clinicalPal).toBe(false);
  // Dziecko 4–9 lat: 1,4 to zwykła opcja normatywna, bez plakietki i komunikatu.
  const young = await buildModel(
    page,
    { ageYears: 7, ageMonthsOpt: null, sex: 'F', weightKg: 24, heightCm: 122 },
    { palSelector: '1.4', bodyMode: 'actual' },
  );
  expect(young.energy.usedPal).toBe(1.4);
  expect(young.energy.clinicalPal).toBe(false);
  expect((young.messages || []).some((x) => String(x.text || '').includes('poza Normami 2024'))).toBe(false);
  const youngOpt = young.ui.palOptions.find((o) => o.value === '1.4');
  expect(youngOpt.label).not.toContain('poza Normami');
  // Dorosły: karta norm nie oferuje i nie przyjmuje PAL 1,2 (kliniczny tylko w planie).
  const adult = await buildModel(
    page,
    { ageYears: 40, ageMonthsOpt: null, sex: 'M', weightKg: 80, heightCm: 178 },
    { palSelector: '1.2', bodyMode: 'actual' },
  );
  expect(adult.ui.palOptions.some((o) => o.value === '1.2')).toBe(false);
  expect(adult.energy.usedPal).not.toBe(1.2);
  expect(adult.energy.clinicalPal).toBe(false);
});

test('NORM-PAL14-SHARED: wspólny moduł energii — zestawy, rozwiązanie 1,4 i select planu dla 13-latka', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  const out = await page.evaluate(() => {
    const normative = Array.from(window.energyGetAllowedPals(13, 0, 'normative'));
    const clinical = Array.from(window.energyGetAllowedPals(13, 0, 'clinical'));
    const resolved = window.energyResolvePalSelection({
      ageYears: 13,
      ageMonthsOpt: 0,
      palInput: '1.4',
      palPolicy: 'clinical',
      allowRange: false,
    });
    const sel = document.createElement('select');
    window.energyPopulatePlanPalSelect(sel, { ageYears: 13, ageMonthsOpt: 0, value: '1.4' });
    const options = Array.from(sel.options).map((o) => ({ value: o.value, label: o.textContent }));
    return { normative, clinical, resolved, options, selected: sel.value };
  });
  expect(out.normative).toEqual([1.6, 1.8, 2]);
  expect(out.clinical).toEqual([1.4, 1.6, 1.8, 2]);
  expect(out.resolved.used).toBe(1.4);
  expect(out.resolved.clinicalOverride).toBe(true);
  expect(out.resolved.note || '').toBe('');
  // Select Planu odchudzania dla 13-latka zawiera 1,4 z dopiskiem i przyjmuje wybór.
  const opt14 = out.options.find((o) => o.value === '1.4');
  expect(opt14).toBeTruthy();
  expect(opt14.label).toContain('poza Normami 2024');
  expect(out.selected).toBe('1.4');
});

test('NORM-U2-RANGES-INTACT: dzieci ≥1 r.ż. i dorośli bez regresji przedziałów', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  const child = await buildModel(
    page,
    { ageYears: 9, ageMonthsOpt: null, sex: 'M', weightKg: 30, heightCm: 135 },
    { palSelector: '1.6', bodyMode: 'actual' },
  );
  expect(child.fat.percentRange).toEqual([30, 40]);
  expect(child.carbs.percentRange).toEqual([45, 65]);
  const adult = await buildModel(
    page,
    { ageYears: 40, ageMonthsOpt: null, sex: 'F', weightKg: 70, heightCm: 165 },
    { palSelector: '1.6', bodyMode: 'actual' },
  );
  expect(adult.fat.percentRange).toEqual([30, 40]);
  expect(adult.carbs.percentRange).toEqual([45, 65]);
  const toddler = await buildModel(
    page,
    { ageYears: 2, ageMonthsOpt: null, sex: 'F', weightKg: 12, heightCm: 88 },
    { palSelector: '1.6', bodyMode: 'actual' },
  );
  expect(toddler.fat.percentRange).toEqual([35, 40]);
});
