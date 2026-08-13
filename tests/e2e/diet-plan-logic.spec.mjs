import { expect, test } from '@playwright/test';

// Testy regresyjne etapu 1 naprawy karty „Plan odchudzania":
//  - dorośli dostają liczbowy czas do górnej granicy normy BMI (cel z
//    toNormalBMITarget → 24,9, spójnie z kartą „Droga do normy BMI");
//    dotąd cel czytano z nieistniejącego ADULT_BMI.NORMAL_MAX i każdy
//    dorosły widział „– tyg. (≈ – lat)",
//  - druga karta wyniku u dorosłych mówi o „środku normy (BMI 22)"
//    zamiast pediatrycznego „50. centyla BMI" (ten zostaje u dzieci),
//  - fillDietSelect nie wybucha przy braku #dietChoiceWrap,
//  - martwy legacy export proposeDiets (BMR×PAL bez korekty wzrastania,
//    zero wywołań w repo) jest usunięty; proposeDietsFromTEE zostaje.
// Testy uruchamiają PRAWDZIWĄ ścieżkę produkcyjną window.update() na
// index.html i czytają wyrenderowaną kartę (AGENTS.md §3.5). Dane FIKCYJNE.

async function renderPlan(page, { age, months, sex, weight, height }) {
  return page.evaluate(({ age, months, sex, weight, height }) => {
    const set = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.value = String(v);
    };
    set('age', age);
    set('ageMonths', months);
    set('sex', sex);
    set('weight', weight);
    set('height', height);
    window.update();
    const card = document.getElementById('planCard');
    const results = document.getElementById('planResults');
    return {
      visible: !!card && card.style.display !== 'none',
      text: results ? results.textContent.replace(/\s+/g, ' ').trim() : '',
    };
  }, { age, months, sex, weight, height });
}

async function openIndex(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function');
}

test('PLAN-S1-ADULT-TARGET: dorosły dostaje liczbowy czas do granicy normy (cel 24,9 jak w Drodze do normy)', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  const out = await renderPlan(page, { age: 40, months: 0, sex: 'M', weight: 95, height: 178 });
  expect(out.visible).toBe(true);
  // PAL 1,4, dieta umiarkowana (−588 kcal → 0,5345 kg/tydz.), cel 24,9 → 78,87 kg:
  // 16,13 kg / 2,32 kg/mies. → 7 mies. (siatka 0,5). Dotąd: „– tyg.".
  expect(out.text).toMatch(/osiągniesz górną granicę normy BMI w czasie: 7 mies\./);
  expect(out.text).toMatch(/7 mies\. \(w \S+ \d{4}\)/u);
  expect(out.text).not.toContain('– mies.');
  expect(out.text).not.toContain('tyg.');
});

test('PLAN-S1-ADULT-LABEL: druga karta u dorosłego mówi o środku normy (BMI 22), nie o 50. centylu', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  const out = await renderPlan(page, { age: 40, months: 0, sex: 'M', weight: 95, height: 178 });
  expect(out.text).toContain('środka normy (BMI 22)');
  expect(out.text).not.toContain('50. centyl');
  expect(out.text).toMatch(/BMI 22\) za: \d+(,5)? mies\./);
});

test('PLAN-S1-CHILD-LABEL: u dziecka druga karta zostaje przy 50. centylu BMI', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  const out = await renderPlan(page, { age: 8, months: 0, sex: 'M', weight: 45, height: 130 });
  expect(out.visible).toBe(true);
  expect(out.text).toContain('50. centyl BMI');
  expect(out.text).not.toContain('BMI 22');
  expect(out.text).toMatch(/osiągniesz górną granicę normy BMI w czasie: \d+(,5)? mies\./);
});

test('PLAN-S1-GUARDS: fillDietSelect bez #dietChoiceWrap nie rzuca; martwy proposeDiets usunięty', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  const out = await page.evaluate(() => {
    const w = document.getElementById('dietChoiceWrap');
    const parent = w.parentNode;
    const next = w.nextSibling;
    parent.removeChild(w);
    let guardOk = true;
    try {
      window.fillDietSelect([]);
      window.fillDietSelect([{ key: 'light', name: 'lekka', deficit: 300, intake: 1500, weeklyLoss: 0.3 }]);
    } catch (err) {
      guardOk = 'THROW: ' + err.message;
    }
    parent.insertBefore(w, next);
    return {
      guardOk,
      deadExport: typeof window.proposeDiets,
      liveExport: typeof window.proposeDietsFromTEE,
      moduleExport: typeof window.VildaDietPlanUI.proposeDietsFromTEE,
    };
  });
  expect(out.guardOk).toBe(true);
  expect(out.deadExport).toBe('undefined');
  expect(out.liveExport).toBe('function');
  expect(out.moduleExport).toBe('function');
});

// ===== Etap 2: minimum dziecięce max(1200, REE), bramka wieku trybu
// profesjonalnego, punkty opisu diety z realnych wartości pacjenta. =====

async function setProfessionalMode(page, on) {
  await page.evaluate((on) => {
    const tgl = document.getElementById('resultsModeToggle');
    if (tgl && tgl.checked !== on) {
      tgl.checked = on;
      tgl.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, on);
}

test('PLAN-S2-FLOOR-REE: minimum dziecka = max(1200, REE) — intensywna znika przy PAL 1,4, wraca przy 1,6', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  const diets = async (pal) => page.evaluate((pal) => {
    document.getElementById('palFactor').value = pal;
    window.update();
    return [...document.getElementById('dietLevel').options].map((o) => o.textContent);
  }, pal);
  await renderPlan(page, { age: 8, months: 0, sex: 'M', weight: 45, height: 130 });
  // REE Henry'ego (chłopiec 3–9): (0,0632·45 + 1,31·1,30 + 1,28)·239 ≈ 1393 kcal.
  // PAL 1,4 → TEE ≈ 1969; intensywna −591 → 1378 < 1393 → wypada.
  const low = await diets('1.4');
  expect(low.some((t) => t.includes('lekka'))).toBe(true);
  expect(low.some((t) => t.includes('umiarkowana'))).toBe(true);
  expect(low.some((t) => t.includes('intensywna'))).toBe(false);
  // PAL 1,6 → TEE ≈ 2251; intensywna −675 → 1576 ≥ 1393 → dostępna.
  const mid = await diets('1.6');
  expect(mid.some((t) => t.includes('intensywna'))).toBe(true);
});

test('PLAN-S2-PROF-GATE: tryb profesjonalny — <2 lat plan ukryty, 2–5 lat z adnotacją kliniczną, ≥5 bez niej', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  await setProfessionalMode(page, true);
  const under2 = await renderPlan(page, { age: 1, months: 6, sex: 'M', weight: 14, height: 80 });
  expect(under2.visible).toBe(false);
  const toddler = await renderPlan(page, { age: 3, months: 0, sex: 'F', weight: 20, height: 95 });
  expect(toddler.visible).toBe(true);
  const warn3 = await page.evaluate(() => {
    const el = document.getElementById('planWarning');
    return { display: el?.style.display, text: (el?.textContent || '').trim() };
  });
  expect(warn3.display).not.toBe('none');
  // Między „5" a „lat" jest wąska spacja niełamliwa (U+202F).
  expect(warn3.text).toContain('Wiek 2–5 lat');
  expect(warn3.text).toContain('do oceny klinicznej');
  const school = await renderPlan(page, { age: 8, months: 0, sex: 'M', weight: 45, height: 130 });
  expect(school.visible).toBe(true);
  const warn8 = await page.evaluate(() => document.getElementById('planWarning')?.style.display);
  expect(warn8).toBe('none');
  // Poza trybem profesjonalnym 3-latek nadal bez planu (konsultacja).
  await setProfessionalMode(page, false);
  const control = await renderPlan(page, { age: 3, months: 0, sex: 'F', weight: 20, height: 95 });
  expect(control.visible).toBe(false);
});

test('PLAN-S2-BULLETS: opis wybranej diety podaje realny deficyt i tempo pacjenta zamiast sztywnych zakresów', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  const out = await renderPlan(page, { age: 40, months: 0, sex: 'M', weight: 95, height: 178 });
  // Dorosły, dieta umiarkowana: deficyt 22% z TEE 2676 → 588 kcal, 0,5 kg/tydz.
  expect(out.text).toContain('ok. 588 kcal dziennie');
  expect(out.text).toContain('przewidywana utrata ok. 0,5 kg tygodniowo');
  expect(out.text).not.toContain('500–750 kcal dziennie');
});

// ===== Etap 3: wspólna symulacja wzrastania i czasy w miesiącach. =====

test('PLAN-S3-SIM-API: symulacja — dziecko szybciej niż liniowo, dorosły dokładnie liniowo, cel 50c dalej niż 85c', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  const out = await page.evaluate(() => {
    const sim = (o) => window.energySimulateMonthsToBmiTarget(o);
    const childNorm = sim({ ageYears: 13, ageMonthsOpt: 0, sex: 'M', weightKg: 58, heightCm: 158, weeklyLossKg: 0.313, target: 'norm' });
    const childMedian = sim({ ageYears: 13, ageMonthsOpt: 0, sex: 'M', weightKg: 58, heightCm: 158, weeklyLossKg: 0.313, target: 'median' });
    const adultNorm = sim({ ageYears: 40, ageMonthsOpt: 0, sex: 'M', weightKg: 95, heightCm: 178, weeklyLossKg: 0.5345, target: 'norm' });
    // Liniowy odpowiednik: kg do celu 85c przy STAŁYM wieku / tempo.
    const linear = (w, hCm, age, pace) => {
      const t = window.toNormalBMITarget(w, hCm, age, 'M');
      const kg = w - t * Math.pow(hCm / 100, 2);
      return Math.round((Math.ceil(kg / pace) * 12 / 52) * 2) / 2;
    };
    // Długi horyzont (otyłość, wolne tempo) — tu wzrastanie musi realnie skracać czas.
    const obese = sim({ ageYears: 12, ageMonthsOpt: 0, sex: 'M', weightKg: 70, heightCm: 150, weeklyLossKg: 0.2, target: 'norm' });
    return {
      childNorm, childMedian, adultNorm, obese,
      linearMonths: linear(58, 158, 13, 0.313),
      obeseLinearMonths: linear(70, 150, 12, 0.2),
    };
  });
  expect(out.childNorm.months).not.toBeNull();
  expect(out.childNorm.growthAware).toBe(true);
  // Tempo wzrastania z realnych median (chłopcy 13→14 lat: 160,2→167,2 cm).
  expect(out.childNorm.annualGrowthCm).toBeGreaterThan(5);
  // Krótki horyzont: siatka 0,5 mies. może zrównać wyniki — symulacja nigdy nie jest wolniejsza.
  expect(out.childNorm.months).toBeLessThanOrEqual(out.linearMonths);
  // Długi horyzont: przewaga symulacji musi być ścisła.
  expect(out.obese.months).not.toBeNull();
  expect(out.obese.months).toBeLessThan(out.obeseLinearMonths);
  // Cel 50. centyla jest dalej niż górna granica normy.
  expect(out.childMedian.months).toBeGreaterThan(out.childNorm.months);
  // Dorosły: brak projekcji wzrostu, wynik zgodny z matematyką liniową (16,13 kg / 2,32 kg/mies. → 7).
  expect(out.adultNorm.growthAware).toBe(false);
  expect(out.adultNorm.months).toBe(7);
});

test('PLAN-S3-GROWTH-NOTE: dziecko widzi dopisek o wzrastaniu w planie i panelu, dorosły nie', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  const child = await renderPlan(page, { age: 13, months: 0, sex: 'M', weight: 58, height: 158 });
  expect(child.text).toContain('uwzględnia dalsze wzrastanie');
  const panel = await page.evaluate(() => (document.getElementById('bmiJourneyMount')?.textContent || '').replace(/\s+/g, ' '));
  expect(panel).toContain('uwzględnia dalsze wzrastanie');
  const adult = await renderPlan(page, { age: 40, months: 0, sex: 'M', weight: 95, height: 178 });
  expect(adult.text).not.toContain('uwzględnia dalsze wzrastanie');
});

test('PLAN-S3-HORIZON: przy horyzoncie > 18 mies. pojawia się zastrzeżenie orientacyjności', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  // Ciężka otyłość dorosłego + lekka dieta → długi horyzont.
  await renderPlan(page, { age: 40, months: 0, sex: 'M', weight: 135, height: 170 });
  const out = await page.evaluate(() => {
    document.getElementById('dietLevel').value = 'light';
    window.updatePlanFromDiet();
    return (document.getElementById('planResults')?.textContent || '').replace(/\s+/g, ' ').trim();
  });
  expect(out).toContain('szacunek orientacyjny');
});
