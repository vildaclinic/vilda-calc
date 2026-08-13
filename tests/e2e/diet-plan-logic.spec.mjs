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
  // (95 − 78,87) / 0,5345 = 30,2 → 31 tyg. Dotąd: „– tyg.".
  expect(out.text).toMatch(/osiągniesz górną granicę normy BMI w czasie: 31 tyg\./);
  expect(out.text).not.toContain('– tyg.');
});

test('PLAN-S1-ADULT-LABEL: druga karta u dorosłego mówi o środku normy (BMI 22), nie o 50. centylu', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  const out = await renderPlan(page, { age: 40, months: 0, sex: 'M', weight: 95, height: 178 });
  expect(out.text).toContain('środka normy (BMI 22)');
  expect(out.text).not.toContain('50. centyl');
  expect(out.text).toMatch(/BMI 22\) za: \d+ tyg\./);
});

test('PLAN-S1-CHILD-LABEL: u dziecka druga karta zostaje przy 50. centylu BMI', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  const out = await renderPlan(page, { age: 8, months: 0, sex: 'M', weight: 45, height: 130 });
  expect(out.visible).toBe(true);
  expect(out.text).toContain('50. centyl BMI');
  expect(out.text).not.toContain('BMI 22');
  expect(out.text).toMatch(/osiągniesz górną granicę normy BMI w czasie: \d+ tyg\./);
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
