import { expect, test } from '@playwright/test';

// ENERGY-REC-4: narracja powyżej 52 tygodni podaje tylko miesiące („około 18,5 miesiąca” / „około 20 miesięcy”).
const czasNarracji = (months) => {
  const weeks = Math.max(1, Math.round(months * 4.345));
  const a = months.toFixed(1).replace('.', ',');
  const mies = /,0$/.test(a) ? (a.slice(0, -2) === '1' ? '1 miesiąca' : `${a.slice(0, -2)} miesięcy`) : `${a} miesiąca`;
  return weeks > 52 ? `około ${mies}` : `około ${weeks} tygodni (ok. ${mies})`;
};

// ENERGY-CHILD-OBESITY (decyzja właściciela 2026-09-12) — łańcuch przez PRAWDZIWE window.update(),
// kartę „Plan odchudzania", panel „Droga do normy" i generator zaleceń na index.html:
//  • ENERGY-CHILD-MID1: plan dziecka 2–18 lat z BMI ≥ 85c liczy się od zapotrzebowania dla MASY AKTUALNEJ
//    z korektą −10 % REE (Hofsteenge 2010), bez ×1,01; deficyt z bezpiecznego tempa (12–18: 1/1,5/2 kg/mies.),
//    podłoga = max(minimum wieku, REE po korekcie); masa należna zostaje celem;
//  • PAL domyślny planu 10–18 lat = 1,4 bez oznaczenia „poza Normami 2024" (plakietka informacyjna);
//  • etapy wieku: 2–5 stabilizacja (bez diet, energia utrzymania), 6–11 przy BMI < 99c tylko lekka
//    −130 kcal (0,5 kg/mies.) i domyślna strategia stabilizacji, 12–18 redukcja 200–500 kcal;
//  • narracja: przy stabilizacji zdanie o energii dla obecnej masy ciała bez deficytu, czas do normy z tej
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
      state: { ob: st.childObesityPlan, stage: st.childPlanStage, needed: st.neededWeightKg, target: st.targetWeightKg, base: st.maintenanceKcal, diets: st.diets.map((d) => [d.key, d.intake, d.deficit]), gm: st.context.energy.growthMultiplier, src: st.context.anthropometry.source },
    };
  }, { age, sex, w, h, pro });
}

function recommend(page, { strategy = null, diet = 'light', norms = true }) {
  return page.evaluate(({ strategy, diet, norms }) => {
    window.ensureDietRecommendationsElements();
    const flag = (id, on) => { const el = document.getElementById(id); if (el) el.checked = on; };
    flag('reduceToggle', strategy === 'reduction'); flag('stabilizationToggle', strategy === 'stabilization');
    flag('growthEndedFlag', false); flag('journeyFlag', true); flag('nutritionNormsFlag', norms);
    flag('vitDSuppFlag', false); flag('hydrationFlag', false);
    const dl = document.getElementById('dietLevel'); if (dl) dl.value = diet;
    const r = window.generateDietRecommendations();
    return r && r.textOutput ? r.textOutput : '';
  }, { strategy, diet, norms });
}

test('12–18 lat z otyłością: PAL domyślnie 1,4 (MID3), plan od masy aktualnej z korektą (−253/−379/−506 z tempa), hero z zaokrągloną kalorycznością', async ({ page }) => {
  test.setTimeout(120_000);
  await openAll(page);
  const r = await fill(page, { age: 14, sex: 'M', w: 85, h: 165 });
  // ENERGY-CHILD-MID3: 10–18 lat dostaje 1,6 przy nadwadze, ale 1,4 przy otyłości (ten pacjent: z ≈ 2,26);
  // 1,4 jest na liście z etykietą o niskiej aktywności, bez „poza Normami".
  expect(r.pal).toBe('1.4');
  expect(r.palOptions[0]).toContain('częsta przy otyłości');
  expect(r.palOptions[0]).not.toContain('poza Normami');
  expect(r.state.ob).toBe(true);
  expect(r.state.stage).toBe('age_12_18');
  expect(r.state.src).toBe('actual');
  expect(r.state.gm).toBe(1);
  // masa należna ≈ mediana BMI (OLAF, 14 l) × 1,65² — wyraźnie poniżej masy aktualnej 85 kg
  expect(r.state.needed).toBeGreaterThan(45);
  expect(r.state.needed).toBeLessThan(60);
  // ENERGY-CHILD-MID2: celem leczenia jest 85. centyl BMI — wyżej niż masa należna, wciąż poniżej 85 kg
  expect(r.state.target).toBeGreaterThan(r.state.needed);
  expect(r.state.target).toBeLessThan(85);
  expect(r.state.diets.map((d) => d[2])).toEqual([253, 379, 506]); // 1 / 1,5 / 2 kg/mies.
  expect(r.state.diets[0][1]).toBe(r.state.base - 253);
  expect(r.diet).toBe('moderate'); // rata U (decyzja 4): u 12–18 lat z otyłością domyślna dieta umiarkowana
  expect(r.plan).toContain('PAL 1,4 – niska aktywność');
  expect(r.plan).not.toContain('Tryb kliniczny');
  expect(r.plan).toContain(`${Math.round((r.state.base - 379) / 100) * 100} kcal/dzień`);
  // rata U: podstawa od masy docelowej (Mazur 2022), zapotrzebowanie aktualne z korektą −10 % REE (Hofsteenge — nazwisko zostaje w silniku)
  expect(r.plan).toContain('dieta liczona od zapotrzebowania dla masy docelowej ok.');
  expect(r.plan).toContain('(z korektą −10 % REE na otyłość)');
  expect(r.plan).not.toContain('Hofsteenge');
  expect(r.plan).toContain('85. centyl BMI');
  expect(r.plan).toContain('a tempo ograniczono do ok. 1,5 kg/mies.; deficyt ok. 379 kcal dziennie względem zapotrzebowania przy obecnej masie ciała (tempo ok. 1,5 kg/mies.');
  expect(r.plan).not.toMatch(/deficyt ok\. \d+ % całkowitego wydatku/u);
  expect(r.journey).toContain('deficyt ok. 379 kcal/dzień względem zapotrzebowania przy obecnej masie ciała (tempo ok. 1,5 kg/mies.)');
  expect(r.journey).toContain('−379 kcal/d');
});

test('12–18 lat, narracja redukcyjna: kaloryczność od masy aktualnej z korektą, czas z symulacji wzrastania, normy z kalorycznością planu', async ({ page }) => {
  test.setTimeout(120_000);
  await openAll(page);
  const r = await fill(page, { age: 14, sex: 'M', w: 85, h: 165 });
  const text = await recommend(page, { strategy: null, diet: 'moderate' });
  const kcal = Math.round((r.state.base - 379) / 100) * 100;
  // ENERGY-REC-KROTKO (2026-09-13, decyzja właściciela): zdanie o kaloryczności bez nawiasu
  // z metodologią — sama liczba; podstawa i cel zostają w karcie planu.
  expect(text).toContain(`dostarcza około ${kcal} kcal dziennie`);
  expect(text).not.toContain('pomniejszone o deficyt dobrany do bezpiecznego tempa');
  expect(text).not.toMatch(/kcal dziennie \(zapotrzebowanie/u);
  expect(text).toContain('wynosi około 379 kcal');
  expect(text).toContain(`Przy planie żywieniowym zakładającym około ${kcal} kcal dziennie`);
  // ENERGY-REC-KROTKO2: zdanie o normach bez nawiasu z podstawą (podstawę podaje karta planu)
  expect(text).toContain(`Przy planie żywieniowym zakładającym około ${kcal} kcal dziennie zalecane ilości składników to:`);
  expect(text).not.toContain('z korektą na otyłość');
  expect(text).not.toContain('Przeliczenie wykonano');
  // czas do granicy normy = wspólna symulacja wzrastania (jak karta planu), nie liniowe kg/tempo
  const sim = await page.evaluate(() => window.energySimulateMonthsToBmiTarget({ ageYears: 14, ageMonthsOpt: 0, sex: 'M', weightKg: 85, heightCm: 165, weeklyLossKg: 379 * 7 / 7700, target: 'norm' }));
  expect(text).toContain(`można szacować na ${czasNarracji(sim.months)}`);
  expect(text).not.toContain('stabilizacji');
});

test('6–11 lat przy BMI < 99c: tylko lekka −126 kcal (0,5 kg/mies.), ostrzeżenie o tempie, domyślna strategia = stabilizacja bez deficytu', async ({ page }) => {
  test.setTimeout(120_000);
  await openAll(page);
  const r = await fill(page, { age: 10, sex: 'M', w: 55, h: 145 });
  expect(r.state.stage).toBe('age_6_11');
  expect(r.state.diets).toEqual([['light', r.state.base - 126, 126]]);
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
  expect(redPlan).toContain('−126 kcal/dzień');
  await page.evaluate(() => { const bt = document.querySelector('[data-diet-strategy-choice="stabilization"]'); if (bt) bt.click(); window.__vildaDietStrategyTouched = false; });
  const text = await recommend(page, { strategy: null, diet: 'light' });
  const kcal = Math.round(r.state.base / 100) * 100;
  expect(text).toContain('W strategii stabilizacji nie planuje się dodatkowego deficytu');
  // ENERGY-REC-KROTKO2: zdanie stabilizacji bez PAL, źródła i powtórzonego celu
  expect(text).toContain(`tj. około ${kcal} kcal dziennie.`);
  expect(text).not.toMatch(/przy PAL \d/u);
  expect(text).not.toContain('Hofsteenge');
  expect(text).toContain(`Przy planie żywieniowym zakładającym około ${kcal} kcal dziennie`);
  expect(text).not.toContain('z korektą na otyłość');
  expect(text).not.toMatch(/Taki plan daje deficyt|wynosi około \d+ kcal, co przekłada/u);
  // jawna redukcja: dieta lekka −130 kcal, 0,1 kg/tydz.
  const red = await recommend(page, { strategy: 'reduction', diet: 'light' });
  expect(red).toContain('wynosi około 126 kcal');
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
  const text = await recommend(page, { strategy: 'reduction', diet: 'light' });
  expect(text).toContain('W strategii stabilizacji nie planuje się dodatkowego deficytu');
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
  // rata K: brzmienie bez skrótów; „zapotrzebowanie” zamiast „planu”
  expect(text).toMatch(/Przy zapotrzebowaniu około \d+ kcal dziennie zalecane ilości składników to:/u);
  expect(text).not.toContain('planie żywieniowym zakładającym');
});
