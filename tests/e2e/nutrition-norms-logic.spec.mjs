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
  await page.addScriptTag({ url: '/vilda_patient_report.js?v=7' });
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
