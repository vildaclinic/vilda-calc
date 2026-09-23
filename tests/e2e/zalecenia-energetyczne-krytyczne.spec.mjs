import { expect, test } from '@playwright/test';

// ENERGY-REC-4: narracja powyżej 52 tygodni podaje tylko miesiące („około 18,5 miesiąca” / „około 20 miesięcy”).
const czasNarracji = (months) => {
  const weeks = Math.max(1, Math.round(months * 4.345));
  const a = months.toFixed(1).replace('.', ',');
  const mies = /,0$/.test(a) ? (a.slice(0, -2) === '1' ? '1 miesiąca' : `${a.slice(0, -2)} miesięcy`) : `${a} miesiąca`;
  return weeks > 52 ? `około ${mies}` : `około ${weeks} tygodni (ok. ${mies})`;
};

// ENERGY-REC-1 — błędy krytyczne z audytu zaleceń energetycznych (decyzja właściciela 2026-09-12),
// łańcuch przez PRAWDZIWY przycisk „Generuj zalecenia energetyczne" na index.html:
//  K1 dorosły z BMI w normie: bez planu redukcyjnego, zdanie o zapotrzebowaniu, normy „dla zapotrzebowania";
//  K2 flaga „Wzrost zakończony" poniżej 10 lat: wyłączona i ignorowana (3-latek → stabilizacja z kalorycznością);
//     dziecko z otyłością w redukcji bez dostępnej diety → zdanie z powodem i energią utrzymania;
//  K3 flaga u ≥10 lat: symulacja bez wzrastania w narracji, karcie planu i „Drodze do normy".
// Dane FIKCYJNE.

async function openAll(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && typeof window.energyBuildPlanReductionState === 'function');
  await page.addScriptTag({ url: '/vilda_diet_recommendations.js' });
  await page.waitForFunction(() => typeof window.generateDietRecommendations === 'function');
  await page.addScriptTag({ url: '/vilda_patient_report.js' });
  await page.waitForFunction(() => typeof window.patientReportFormatIssueList === 'function');
}

function generate(page, { age, sex, w, h, growthEnded = false, strategy = null, pal = null }) {
  return page.evaluate(async ({ age, sex, w, h, growthEnded, strategy, pal }) => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = String(v); };
    const tgl = document.getElementById('resultsModeToggle');
    if (tgl && !tgl.checked) { tgl.checked = true; tgl.dispatchEvent(new Event('change', { bubbles: true })); }
    window.professionalMode = true;
    window.__vildaPlanPalTouched = false;
    set('age', age); set('ageMonths', 0); set('sex', sex); set('weight', w); set('height', h);
    window.ensureDietRecommendationsElements();
    const flag = (id, on) => { const el = document.getElementById(id); if (el) { el.disabled = false; el.checked = on; } };
    flag('reduceToggle', strategy === 'reduction'); flag('stabilizationToggle', strategy === 'stabilization');
    flag('growthEndedFlag', growthEnded); flag('nutritionNormsFlag', true); flag('journeyFlag', true);
    flag('vitDSuppFlag', false); flag('hydrationFlag', false);
    window.update();
    // P-PAL rata 1: jawny wybór PAL przez lekarza (jak zmiana w UI: wartość + zdarzenie change → __vildaPlanPalTouched)
    if (pal != null) { const sel = document.getElementById('palFactor'); sel.value = String(pal); sel.dispatchEvent(new Event('change', { bubbles: true })); window.update(); }
    document.getElementById('generateEnergyDietBtn').click();
    await new Promise((res) => { setTimeout(res, 150); });
    const norm = (s) => (s || '').replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ').trim();
    const res = document.getElementById('dietEnergyResult');
    const text = norm(res.innerHTML.replace(/<\/(li|p|div|h3)>/g, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' '));
    const ge = document.getElementById('growthEndedFlag');
    const st = window.energyBuildPlanReductionState({ ageYears: age, ageMonthsOpt: 0, sex, weightKg: w, heightCm: h, palInput: parseFloat(document.getElementById('palFactor').value) });
    // rata U: narracja liczy czas dla diety wybranej w #dietLevel (u 12–18 lat z otyłością domyślnie umiarkowana, 379 kcal) — bierzemy deficyt z tego samego wyniku
    const dz = ((window.buildDietEnergyRecommendationResult() || {}).dane || {}).energia || {};
    const tydz = (Number(dz.deficytKcal) > 0 ? Number(dz.deficytKcal) : 253) * 7 / 7700;
    const simEnded = window.energySimulateMonthsToBmiTarget({ ageYears: age, ageMonthsOpt: 0, sex, weightKg: w, heightCm: h, weeklyLossKg: tydz, target: 'norm', growthEnded: true });
    const simGrow = window.energySimulateMonthsToBmiTarget({ ageYears: age, ageMonthsOpt: 0, sex, weightKg: w, heightCm: h, weeklyLossKg: tydz, target: 'norm' });
    return {
      text,
      geChecked: ge.checked, geDisabled: ge.disabled,
      diets: st.diets.map((d) => d.key), rni: st.reductionNotIndicated, tee: Math.round(st.teeBaselineKcal), maint: st.maintenanceKcal, floor: st.floorKcal,
      monthsEnded: simEnded.months, monthsGrow: simGrow.months,
      plan: norm(document.getElementById('planResults')?.textContent),
      journey: norm(document.getElementById('bmiJourneyMount')?.textContent),
    };
  }, { age, sex, w, h, growthEnded, strategy, pal });
}

test('K1: dorosła z BMI 22,8 — bez planu redukcyjnego, zapotrzebowanie i utrzymanie masy, normy „dla zapotrzebowania"', async ({ page }) => {
  test.setTimeout(120_000);
  await openAll(page);
  const r = await generate(page, { age: 28, sex: 'F', w: 62, h: 165 });
  expect(r.diets).toEqual([]);
  expect(r.rni).toBe(true);
  const kcal = Math.round(r.tee / 100) * 100;
  expect(r.text).toContain('BMI wynosi 22,8 i mieści się w zakresie prawidłowym');
  expect(r.text).toContain(`wynosi ok. ${kcal} kcal/dzień; brak wskazań do deficytu energetycznego – celem jest utrzymanie masy ciała`);
  expect(r.text).not.toMatch(/deficytowi energetycznemu|tempu redukcji|Plan zakłada dietę/u);
  expect(r.text).toContain(`Przy zapotrzebowaniu około ${kcal} kcal dziennie zalecane ilości składników to:`);
  // dorosły z otyłością bez zmian
  const ob = await generate(page, { age: 35, sex: 'M', w: 105, h: 175 });
  expect(ob.diets.length).toBe(3);
  // P-DIETA rata Z: dorosły z otyłością — kaloryczność jako górna granica dnia, potem deficyt i tempo
  expect(ob.text).toMatch(/Plan zakłada dietę .* Dieta [a-ząćęłńóśźż]+: nie więcej niż [\d\s\u00A0\u202F]+ kcal dziennie — to górna granica dnia, nie cel do dobicia\. Deficyt energetyczny przy tej diecie wynosi ok\. \d+ kcal\/dobę, co odpowiada tempu redukcji/u);
});

test('K2: 3-latek — flaga „Wzrost zakończony" wyłączona i ignorowana, narracja stabilizacji z kalorycznością', async ({ page }) => {
  test.setTimeout(120_000);
  await openAll(page);
  const r = await generate(page, { age: 3, sex: 'M', w: 20, h: 98, growthEnded: true, strategy: 'reduction' });
  expect(r.geChecked).toBe(false);
  expect(r.geDisabled).toBe(true);
  const kcal = Math.round(r.maint / 100) * 100;
  expect(r.text).not.toMatch(/Wzrost dziecka jest już zakończony|redukcji masy ciała/u);
  expect(r.text).toContain('W strategii stabilizacji nie planuje się dodatkowego deficytu');
  expect(r.text).toContain(`tj. około ${kcal} kcal dziennie`);
  expect(r.text).toContain(`Przy planie żywieniowym zakładającym około ${kcal} kcal dziennie zalecane ilości składników to:`);
  expect(r.plan).toContain('Stabilizacja masy ciała');
});

test('K2b: dziecko z otyłością, jawna redukcja, żadna dieta nie spełnia minimum → zdanie z powodem i energią utrzymania', async ({ page }) => {
  test.setTimeout(120_000);
  await openAll(page);
  // ENERGY-CHILD-MID1: skrajny przypadek pilnujący twardego minimum wieku. P-PAL rata 1: bez korekty REE × 0,9
  // i z domyślnym PAL 1,6 żadna realna antropometria 6–9 lat nie schodzi poniżej minimum — gałąź zostaje osiągalna
  // przy jawnym wyborze PAL 1,4 przez lekarza: dziewczynka 6 l, 85 cm, 17 kg (z ≈ 2,5, ≥ 99c): REE ≈ 798,
  // baza ≈ 1117 kcal; najlżejsza dieta (−126 kcal) daje < 1000 kcal → brak diet, zostaje stabilizacja.
  const r = await generate(page, { age: 6, sex: 'F', w: 17, h: 85, strategy: 'reduction', pal: 1.4 });
  expect(r.diets).toEqual([]);
  expect(r.floor).toBe(1000);
  const kcal = Math.round(r.maint / 100) * 100;
  expect(r.text).toContain('Żadna dieta redukcyjna nie spełnia minimum kalorycznego dla wieku (1000 kcal/dzień), dlatego zalecana jest stabilizacja masy ciała.');
  expect(r.text).toContain(`tj. około ${kcal} kcal dziennie`);
  expect(r.text).toContain(`Przy planie żywieniowym zakładającym około ${kcal} kcal dziennie zalecane ilości składników to:`);
  // ENERGY-REC-KROTKO2: bez nawiasu z podstawą — narracja podaje samą kaloryczność
  expect(r.text).not.toContain('z korektą na otyłość');
  expect(r.plan).toContain('Brak diety');
});

test('K3: 14-latek z flagą „Wzrost zakończony" — termin bez wzrastania w narracji, karcie planu i Drodze do normy', async ({ page }) => {
  test.setTimeout(120_000);
  await openAll(page);
  const grow = await generate(page, { age: 14, sex: 'M', w: 85, h: 165, growthEnded: false });
  expect(grow.text).toContain(czasNarracji(grow.monthsGrow));
  expect(grow.plan).toContain('uwzględnia dalsze wzrastanie');
  expect(grow.journey).toContain('uwzględnia dalsze wzrastanie');
  const ended = await generate(page, { age: 14, sex: 'M', w: 85, h: 165, growthEnded: true });
  expect(ended.geChecked).toBe(true);
  expect(ended.geDisabled).toBe(false);
  expect(ended.monthsEnded).toBeGreaterThan(ended.monthsGrow);
  expect(ended.text).toContain('Wzrost jest już zakończony');
  expect(ended.text).toContain(czasNarracji(ended.monthsEnded));
  expect(ended.plan).not.toContain('uwzględnia dalsze wzrastanie');
  expect(ended.plan).toContain(`${String(ended.monthsEnded).replace('.', ',')} mies.`);
  expect(ended.journey).not.toContain('uwzględnia dalsze wzrastanie');
});
