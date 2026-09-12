import { expect, test } from '@playwright/test';

// ENERGY-CHILD-OBESITY (decyzja właściciela 2026-09-12) — łańcuch przez PRAWDZIWE window.update(),
// kartę „Plan odchudzania", panel „Droga do normy" i generator zaleceń na index.html:
//  • plan dziecka 2–18 lat z BMI ≥ 85c liczy się od zapotrzebowania dla masy należnej (mediana BMI
//    dla wieku × wzrost²), bez ×1,01, ze stałym deficytem 200/350/500 kcal i minimum 1000/1200 kcal;
//  • PAL domyślny planu 10–18 lat = 1,4 bez oznaczenia „poza Normami 2024" (plakietka informacyjna);
//  • etapy wieku: 2–5 stabilizacja (bez diet, energia utrzymania), 6–11 przy BMI < 99c tylko lekka
//    −130 kcal (0,5 kg/mies.) i domyślna strategia stabilizacji, 12–18 redukcja 200–500 kcal;
//  • narracja: przy stabilizacji zdanie o energii dla masy należnej bez deficytu, czas do normy z tej
//    samej symulacji wzrastania co karta planu, normy żywieniowe z kalorycznością planu/stabilizacji;
//  • dziecko z BMI < 85c: brak ukrytego planu — normy „dla zapotrzebowania", nie „dla planu".
// Dane FIKCYJNE.

async function openAll(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && typeof window.energyBuildPlanReductionState === 'function');
  await page.addScriptTag({ url: '/vilda_diet_recommendations.js' });
  await page.waitForFunction(() => typeof window.generateDietRecommendations === 'function');
  await page.addScriptTag({ url: '/vilda_patient_report.js' });
  await page.waitForFunction(() => typeof window.patientReportFormatIssueList === 'function');
}

function fill(page, { age, sex, w, h, pro = true }) {
  return page.evaluate(({ age, sex, w, h, pro }) => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = String(v); };
    window.professionalMode = pro;
    const tgl = document.getElementById('resultsModeToggle');
    if (tgl && tgl.checked !== pro) { tgl.checked = pro; tgl.dispatchEvent(new Event('change', { bubbles: true })); }
    window.__vildaPlanPalTouched = false;
    set('age', age); set('ageMonths', 0); set('sex', sex); set('weight', w); set('height', h);
    window.update();
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const st = window.energyBuildPlanReductionState({ ageYears: age, ageMonthsOpt: 0, sex, weightKg: w, heightCm: h, palInput: parseFloat(document.getElementById('palFactor').value) });
    return {
      pal: document.getElementById('palFactor').value,
      palOptions: [...document.getElementById('palFactor').options].map((o) => o.textContent),
      diet: document.getElementById('dietLevel').value,
      dietOptions: [...document.getElementById('dietLevel').options].map((o) => o.textContent),
      planVisible: (document.getElementById('planCard') || {}).style?.display !== 'none',
      plan: norm(document.getElementById('planResults')?.textContent),
      journey: norm(document.getElementById('bmiJourneyMount')?.textContent),
      state: { ob: st.childObesityPlan, stage: st.childPlanStage, needed: st.neededWeightKg, base: st.maintenanceKcal, diets: st.diets.map((d) => [d.key, d.intake, d.deficit]), gm: st.context.energy.growthMultiplier, src: st.context.anthropometry.source },
    };
  }, { age, sex, w, h, pro });
}

function recommend(page, { strategy = null, diet = 'light', pf = false, norms = true }) {
  return page.evaluate(({ strategy, diet, pf, norms }) => {
    window.ensureDietRecommendationsElements();
    const flag = (id, on) => { const el = document.getElementById(id); if (el) el.checked = on; };
    flag('reduceToggle', strategy === 'reduction'); flag('stabilizationToggle', strategy === 'stabilization');
    flag('growthEndedFlag', false); flag('journeyFlag', true); flag('nutritionNormsFlag', norms);
    flag('patientFacingToggle', pf); flag('vitDSuppFlag', false); flag('hydrationFlag', false);
    const dl = document.getElementById('dietLevel'); if (dl) dl.value = diet;
    const r = window.generateDietRecommendations();
    return r && r.textOutput ? r.textOutput : '';
  }, { strategy, diet, pf, norms });
}

test('12–18 lat: PAL 1,4 bez „poza Normami", plan od masy należnej (−200/−350/−500), hero z zaokrągloną kalorycznością', async ({ page }) => {
  test.setTimeout(120_000);
  await openAll(page);
  const r = await fill(page, { age: 14, sex: 'M', w: 85, h: 165 });
  expect(r.pal).toBe('1.4');
  expect(r.palOptions[0]).toContain('częsta przy otyłości');
  expect(r.palOptions[0]).not.toContain('poza Normami');
  expect(r.state.ob).toBe(true);
  expect(r.state.stage).toBe('age_12_18');
  expect(r.state.src).toBe('child_median_bmi');
  expect(r.state.gm).toBe(1);
  // masa należna ≈ mediana BMI (OLAF, 14 l) × 1,65² — wyraźnie poniżej masy aktualnej 85 kg
  expect(r.state.needed).toBeGreaterThan(45);
  expect(r.state.needed).toBeLessThan(60);
  expect(r.state.diets.map((d) => d[2])).toEqual([200, 350, 500]);
  expect(r.state.diets[0][1]).toBe(r.state.base - 200);
  expect(r.diet).toBe('light');
  expect(r.plan).toContain('PAL 1,4 – niska aktywność');
  expect(r.plan).not.toContain('Tryb kliniczny');
  expect(r.plan).toContain(`${Math.round((r.state.base - 200) / 100) * 100} kcal/dzień`);
  expect(r.plan).toContain('liczone dla masy należnej ok.');
  expect(r.plan).toContain('bez dodatku na wzrastanie; minimum 1200 kcal/dzień');
  expect(r.plan).toContain('stały deficyt ok. 200 kcal dziennie względem zapotrzebowania dla masy należnej');
  expect(r.plan).not.toMatch(/deficyt ok\. \d+ % całkowitego wydatku/u);
  expect(r.journey).toContain('stały deficyt ok. 200 kcal/dzień względem zapotrzebowania dla masy należnej');
  expect(r.journey).toContain('−350 kcal/d');
});

test('12–18 lat, narracja redukcyjna: kaloryczność od masy należnej, czas z symulacji wzrastania, normy z kalorycznością planu', async ({ page }) => {
  test.setTimeout(120_000);
  await openAll(page);
  const r = await fill(page, { age: 14, sex: 'M', w: 85, h: 165 });
  const text = await recommend(page, { strategy: null, diet: 'moderate' });
  const kcal = Math.round((r.state.base - 350) / 100) * 100;
  expect(text).toContain(`dostarcza około ${kcal} kcal dziennie (zapotrzebowanie dla masy należnej ok.`);
  expect(text).toContain('wynosi około 350 kcal');
  expect(text).toContain(`Normy żywieniowe dla planu około ${kcal} kcal/d`);
  expect(text).toContain('Przeliczenie wykonano dla: kaloryczności planu liczonej od zapotrzebowania dla masy należnej');
  // czas do granicy normy = wspólna symulacja wzrastania (jak karta planu), nie liniowe kg/tempo
  const sim = await page.evaluate(() => window.energySimulateMonthsToBmiTarget({ ageYears: 14, ageMonthsOpt: 0, sex: 'M', weightKg: 85, heightCm: 165, weeklyLossKg: 350 * 7 / 7700, target: 'norm' }));
  const weeks = Math.max(1, Math.round(sim.months * 4.345));
  expect(text).toContain(`można szacować na około ${weeks} tygodni`);
  expect(text).not.toContain('stabilizacji');
});

test('6–11 lat przy BMI < 99c: tylko lekka −130 kcal, ostrzeżenie o tempie, domyślna strategia = stabilizacja bez deficytu', async ({ page }) => {
  test.setTimeout(120_000);
  await openAll(page);
  const r = await fill(page, { age: 10, sex: 'M', w: 55, h: 145 });
  expect(r.state.stage).toBe('age_6_11');
  expect(r.state.diets).toEqual([['light', r.state.base - 130, 130]]);
  expect(r.dietOptions.length).toBe(1);
  // ENERGY-REC-2: domyślna strategia 6–11 lat < 99c = stabilizacja → karta w trybie utrzymania masy
  expect(r.plan).toContain('energia utrzymania (stabilizacja masy ciała)');
  expect(r.plan).toContain(`${Math.round(r.state.base / 100) * 100} kcal/dzień`);
  // jawny wybór redukcji (przycisk strategii = świadomy wybór) → dieta lekka −130 z ostrzeżeniem o tempie
  const redPlan = await page.evaluate(() => {
    const bt = document.querySelector('[data-diet-strategy-choice="reduction"]');
    if (bt) bt.click();
    window.update();
    return (document.getElementById('planResults')?.textContent || '').replace(/\s+/g, ' ').trim();
  });
  expect(redPlan).toContain('Wiek 6–11 lat przy BMI poniżej 99. centyla');
  expect(redPlan).toContain('tempo ograniczone do ok. 0,5 kg/mies.');
  expect(redPlan).toContain('−130 kcal/dzień');
  await page.evaluate(() => { const bt = document.querySelector('[data-diet-strategy-choice="stabilization"]'); if (bt) bt.click(); window.__vildaDietStrategyTouched = false; });
  const text = await recommend(page, { strategy: null, diet: 'light' });
  const kcal = Math.round(r.state.base / 100) * 100;
  expect(text).toContain('W strategii stabilizacji nie stosuje się deficytu energetycznego');
  expect(text).toContain(`tj. około ${kcal} kcal dziennie przy PAL 1,4, bez dodatku na wzrastanie`);
  expect(text).toContain(`Normy żywieniowe dla planu około ${kcal} kcal/d`);
  expect(text).toContain('kaloryczności stabilizacji liczonej od zapotrzebowania dla masy należnej');
  expect(text).not.toMatch(/Taki plan daje deficyt|wynosi około \d+ kcal, co przekłada/u);
  // jawna redukcja: dieta lekka −130 kcal, 0,1 kg/tydz.
  const red = await recommend(page, { strategy: 'reduction', diet: 'light' });
  expect(red).toContain('wynosi około 130 kcal');
  expect(red).not.toContain('stabilizacji nie stosuje się');
});

test('2–5 lat (tryb profesjonalny): karta stabilizacji z energią utrzymania; narracja stabilizacyjna nawet przy włączonej redukcji', async ({ page }) => {
  test.setTimeout(120_000);
  await openAll(page);
  const r = await fill(page, { age: 3, sex: 'M', w: 20, h: 98, pro: true });
  expect(r.state.stage).toBe('age_2_5');
  expect(r.state.diets).toEqual([]);
  expect(r.planVisible).toBe(true);
  expect(r.plan).toContain('Stabilizacja masy ciała');
  expect(r.plan).toContain('W wieku 2–5 lat nie zaleca się deficytu energetycznego');
  expect(r.plan).toContain(`${Math.round(r.state.base / 100) * 100} kcal/dzień`);
  const text = await recommend(page, { strategy: 'reduction', diet: 'light', pf: true });
  expect(text).toContain('Przy strategii stabilizacji nie planujemy deficytu energetycznego');
  expect(text).not.toMatch(/potrzebę redukcji|Deficyt kaloryczny/u);
});

test('dziecko z BMI < 85c: karta planu ukryta, brak diet, normy „dla zapotrzebowania" zamiast „dla planu"', async ({ page }) => {
  test.setTimeout(120_000);
  await openAll(page);
  const r = await fill(page, { age: 10, sex: 'M', w: 33, h: 140 });
  expect(r.state.ob).toBe(false);
  expect(r.state.diets).toEqual([]);
  expect(r.planVisible).toBe(false);
  const text = await recommend(page, { strategy: null, diet: 'light' });
  expect(text).toContain('mieści się w granicach normy');
  expect(text).toMatch(/Normy żywieniowe dla zapotrzebowania około \d+ kcal\/d/u);
  expect(text).not.toContain('dla planu około');
});
