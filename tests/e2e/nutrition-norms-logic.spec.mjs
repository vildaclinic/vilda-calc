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
// Zmiana U2 (niemowlęta 6–11 mies., zapisy zgodne z normami):
//  NORM-U2-INFANT-FAT: tłuszcz to wartość referencyjna 40%E ([40,40]),
//    gramy przeliczone z TEE; nota o wartości referencyjnej.
//  NORM-U2-INFANT-CARB-AI: węglowodany to AI 95 g/d (bez %E), dostępne
//    także bez masy ciała (AI nie zależy od TEE).
//  NORM-U2-INFANT-RENDER: kafle karty pokazują „około 40% energii",
//    „95 g/d" i notę AI; brak osieroconego „—" przy udziale %E węglowodanów.
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

test('NORM-U2-INFANT-FAT: tłuszcz 6–11 mies. jako wartość referencyjna 40%E', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  const m = await buildModel(
    page,
    { ageYears: 0.67, ageMonthsOpt: 8, sex: 'M', weightKg: 8, heightCm: 70 },
    {},
  );
  expect(m.fat.percentRange).toEqual([40, 40]);
  expect(m.fat.lowActivityNote).toContain('wartość referencyjną');
  // Gramy przeliczone z energii: 40% TEE / 9 kcal na g.
  expect(m.energy.available).toBe(true);
  const tee = m.energy.mainValue;
  expect(m.fat.gramRange[0]).toBeCloseTo((tee * 0.4) / 9, 0);
  expect(m.fat.gramRange[1]).toBeCloseTo((tee * 0.4) / 9, 0);
  // Punkt odniesienia posiłków wyrównany do 10/40/50%E.
  expect(m.planningReference.percent.fat).toBe(40);
  expect(m.planningReference.percent.carbs).toBe(50);
});

test('NORM-U2-INFANT-CARB-AI: węglowodany 6–11 mies. jako AI 95 g/d, także bez masy', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  const withWeight = await buildModel(
    page,
    { ageYears: 0.67, ageMonthsOpt: 8, sex: 'F', weightKg: 8, heightCm: 70 },
    {},
  );
  expect(withWeight.carbs.percentRange).toBeNull();
  expect(withWeight.carbs.gramRange).toEqual([95, 95]);
  expect(withWeight.carbs.aiNote).toContain('spożycie wystarczające (AI)');
  // AI nie zależy od TEE — dostępne również bez masy ciała.
  const noWeight = await buildModel(
    page,
    { ageYears: 0.67, ageMonthsOpt: 8, sex: 'F', weightKg: null, heightCm: null },
    {},
  );
  expect(noWeight.carbs.gramRange).toEqual([95, 95]);
});

test('NORM-U2-INFANT-RENDER: kafle karty — „około 40% energii", „95 g/d", nota AI, bez „—"', async ({ page }) => {
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
  expect(html).toContain('około 40% energii');
  expect(html).toContain('95 g/d');
  expect(html).toContain('spożycie wystarczające (AI)');
  expect(html).toContain('wartość referencyjną');
  // Kafel węglowodanów nie pokazuje osieroconej linii „—" po udziale %E.
  expect(html).not.toContain('nutrition-norms-sub--macro-share">—<');
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
  expect(child.carbs.aiNote || '').toBe('');
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
