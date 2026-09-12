import { expect, test } from '@playwright/test';

// ENERGY-REC-2 — strategia i wzrastanie w jednym miejscu (decyzja właściciela 2026-09-12), łańcuch przez
// PRAWDZIWY przycisk „Generuj zalecenia energetyczne", kartę planu i „Drogę do normy" na index.html:
//  • 8-latka (BMI 97–99c): domyślna stabilizacja → karta i panel w trybie utrzymania masy, ta sama kaloryczność
//    i ten sam termin co w narracji; klik „Redukcja masy" (świadomy wybór) → dieta lekka −130 wszędzie;
//  • 18-latka: tempo wzrastania 0 → bez „Wzrastanie nadal trwa", bez dopisku o wzrastaniu, domyślna redukcja;
//  • 16-latka z jawną stabilizacją przy praktycznie zakończonym wzrastaniu → komunikat w narracji i na karcie;
//  • niemowlę → wynik z powodem zamiast pustej listy.
// Dane FIKCYJNE.

async function openAll(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && typeof window.energyResolveStrategyFromDom === 'function');
  await page.addScriptTag({ url: '/vilda_diet_recommendations.js' });
  await page.waitForFunction(() => typeof window.generateDietRecommendations === 'function');
  await page.addScriptTag({ url: '/vilda_patient_report.js' });
  await page.waitForFunction(() => typeof window.patientReportFormatIssueList === 'function');
}

function run(page, { age, months = 0, sex, w, h, click = null }) {
  return page.evaluate(async ({ age, months, sex, w, h, click }) => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = String(v); };
    const tgl = document.getElementById('resultsModeToggle');
    if (tgl && !tgl.checked) { tgl.checked = true; tgl.dispatchEvent(new Event('change', { bubbles: true })); }
    window.professionalMode = true;
    window.__vildaPlanPalTouched = false;
    window.__vildaDietStrategyTouched = false;
    set('age', age); set('ageMonths', months); set('sex', sex); set('weight', w); set('height', h);
    window.ensureDietRecommendationsElements();
    const flag = (id, on) => { const el = document.getElementById(id); if (el) el.checked = on; };
    flag('reduceToggle', false); flag('stabilizationToggle', false); flag('growthEndedFlag', false);
    flag('nutritionNormsFlag', true); flag('journeyFlag', true); flag('vitDSuppFlag', false); flag('hydrationFlag', false); flag('patientFacingToggle', false);
    if (click) { const bt = document.querySelector(`[data-diet-strategy-choice="${click}"]`); if (bt) bt.click(); }
    window.update();
    const tab = document.querySelector('[data-diet-mode="energy"]');
    if (tab && !tab.classList.contains('is-active')) tab.click();
    document.getElementById('generateEnergyDietBtn').click();
    await new Promise((res) => { setTimeout(res, 150); });
    window.update();
    const norm = (s) => (s || '').replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ').trim();
    const res = document.getElementById('dietEnergyResult');
    const text = norm(res.innerHTML.replace(/<\/(li|p|div|h3)>/g, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' '));
    const st = window.energyBuildPlanReductionState({ ageYears: age + months / 12, ageMonthsOpt: months, sex, weightKg: w, heightCm: h, palInput: parseFloat(document.getElementById('palFactor').value) });
    const stab = window.energySimulateMonthsToBmiTarget({ ageYears: age, ageMonthsOpt: months, sex, weightKg: w, heightCm: h, weeklyLossKg: 0, target: 'norm' });
    const outlook = window.energyChildGrowthOutlook({ ageYears: age + months / 12, sex, heightCm: h });
    return {
      text,
      touched: window.__vildaDietStrategyTouched === true,
      active: document.querySelector('[data-diet-strategy-choice].is-active')?.getAttribute('data-diet-strategy-choice') || null,
      maint: st.maintenanceKcal, diets: st.diets.map((d) => [d.key, d.intake, d.deficit]),
      stabMonths: stab.months, outlook,
      plan: norm(document.getElementById('planResults')?.textContent),
      journey: norm(document.getElementById('bmiJourneyMount')?.textContent),
      pdf: window.VildaBmiJourney && typeof window.VildaBmiJourney.getPdfModel === 'function' ? window.VildaBmiJourney.getPdfModel() : null,
    };
  }, { age, months, sex, w, h, click });
}

test('8-latka (97–99c): domyślna stabilizacja — karta i Droga w trybie utrzymania masy, spójne z narracją; klik „Redukcja" → −130 wszędzie', async ({ page }) => {
  test.setTimeout(150_000);
  await openAll(page);
  const r = await run(page, { age: 8, sex: 'F', w: 40, h: 130 });
  expect(r.active).toBe('stabilization');
  expect(r.touched).toBe(false);
  const kcal = Math.round(r.maint / 100) * 100;
  expect(r.text).toContain(`tj. około ${kcal} kcal dziennie`);
  expect(r.plan).toContain('energia utrzymania (stabilizacja masy ciała)');
  expect(r.plan).toContain(`${kcal} kcal/dzień`);
  expect(r.plan).toContain('Utrzymując obecną masę ciała osiągniesz górną granicę normy BMI dzięki dalszemu wzrastaniu');
  expect(r.plan).toContain(`${String(r.stabMonths).replace('.', ',')} mies.`);
  expect(r.plan).toContain('bez deficytu · utrzymanie masy ciała');
  expect(r.plan).not.toContain('−130 kcal/dzień · ok.');
  expect(r.journey).toContain('utrzymanie masy + wzrastanie');
  expect(r.journey).toContain('Cel: utrzymanie masy ok. 40,0 kg');
  expect(r.journey).not.toContain('Cel: −');
  expect(r.journey).toContain(`${String(kcal).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} kcal/dzień`);
  expect(r.pdf && r.pdf.available).toBe(false);

  const red = await run(page, { age: 8, sex: 'F', w: 40, h: 130, click: 'reduction' });
  expect(red.touched).toBe(true);
  expect(red.active).toBe('reduction');
  expect(red.diets).toEqual([['light', red.maint - 130, 130]]);
  expect(red.text).toContain('wynosi około 130 kcal');
  expect(red.plan).toContain('−130 kcal/dzień · ok. 0,1 kg/tydz.');
  expect(red.plan).toContain('zalecana kaloryczność diety');
  expect(red.journey).toContain('Cel: −8,4 kg');
  expect(red.journey).toContain('−130 kcal/d');
});

test('18-latka: tempo wzrastania 0 → bez „Wzrastanie nadal trwa" i bez dopisku o wzrastaniu; domyślnie redukcja', async ({ page }) => {
  test.setTimeout(120_000);
  await openAll(page);
  const r = await run(page, { age: 18, sex: 'F', w: 80, h: 165 });
  expect(r.outlook.annualGrowthCm).toBe(0);
  expect(r.outlook.practicallyEnded).toBe(true);
  expect(r.active).toBe('reduction');
  expect(r.text).not.toContain('Wzrastanie nadal trwa');
  expect(r.text).toContain('Wzrost prawie się zakończył');
  expect(r.plan).not.toContain('uwzględnia dalsze wzrastanie');
  expect(r.journey).not.toContain('uwzględnia dalsze wzrastanie');
});

test('16-latka, jawna stabilizacja przy praktycznie zakończonym wzrastaniu → komunikat w narracji i na karcie', async ({ page }) => {
  test.setTimeout(120_000);
  await openAll(page);
  const r = await run(page, { age: 16, sex: 'F', w: 90, h: 163, click: 'stabilization' });
  expect(r.outlook.practicallyEnded).toBe(true);
  expect(r.active).toBe('stabilization');
  expect(r.text).toContain('W strategii stabilizacji nie planuje się dodatkowego deficytu');
  expect(r.text).toContain('samo utrzymanie masy ciała nie doprowadzi do normy BMI');
  expect(r.plan).toContain('Przy praktycznie zakończonym wzrastaniu samo utrzymanie masy ciała nie doprowadzi do normy BMI');
  expect(r.journey).toContain('samo utrzymanie masy nie doprowadzi do normy BMI');
});

test('niemowlę 6 mies.: wynik z powodem zamiast pustej listy', async ({ page }) => {
  test.setTimeout(120_000);
  await openAll(page);
  const r = await run(page, { age: 0, months: 6, sex: 'M', w: 9, h: 68 });
  expect(r.text).toContain('Zalecenia energetyczne nie są dostępne dla niemowląt');
});
