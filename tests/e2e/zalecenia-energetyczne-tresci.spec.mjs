import { expect, test } from '@playwright/test';

// ENERGY-REC-3 — treści zaleceń energetycznych (PR 3 audytu, 2026-09-12), przez PRAWDZIWY przycisk
// „Generuj zalecenia energetyczne" na index.html, w obu rejestrach (standardowy / „Dla pacjenta"):
//  • witamina D wg wieku (1–3 / 4–10 / 11–18 lat), dawka podwojona TYLKO przy otyłości, UL 2000/4000 IU;
//  • płyny wg norm polskich (pasma 10–12 / 13–15 / 16–18 wg płci), bez „30 ml/kg wg WHO";
//  • kcal sesji ruchu netto (MET − 1), zaokrąglone do 10;
//  • aktywność 2–4 lata (≥ 180 min/dzień, ekran ≤ 1 h) zamiast „60 minut … gry zespołowe";
//  • trener personalny tylko od 12 lat; „wymaga konsultacji dietetyka lub endokrynologa dziecięcego";
//  • zdanie otwierające z BMI, centylem, z-score i klasą; uzasadnienie limitu tempa 6–11 lat.
// Dane FIKCYJNE.

async function openAll(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && typeof window.energyBuildPlanReductionState === 'function');
  await page.addScriptTag({ url: '/vilda_diet_recommendations.js' });
  await page.waitForFunction(() => typeof window.generateDietRecommendations === 'function' && typeof window.dietZToPercentile === 'function');
  await page.addScriptTag({ url: '/vilda_patient_report.js' });
  await page.waitForFunction(() => typeof window.patientReportFormatIssueList === 'function');
}

function run(page, { age, months = 0, sex, w, h, click = null, pf = false }) {
  return page.evaluate(async ({ age, months, sex, w, h, click, pf }) => {
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
    flag('nutritionNormsFlag', false); flag('journeyFlag', true); flag('vitDSuppFlag', true); flag('hydrationFlag', true); flag('patientFacingToggle', !!pf);
    if (click) { const bt = document.querySelector(`[data-diet-strategy-choice="${click}"]`); if (bt) bt.click(); }
    window.update();
    const tab = document.querySelector('[data-diet-mode="energy"]');
    if (tab && !tab.classList.contains('is-active')) tab.click();
    document.getElementById('generateEnergyDietBtn').click();
    await new Promise((res) => { setTimeout(res, 150); });
    const norm = (s) => (s || '').replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ').trim();
    const res = document.getElementById('dietEnergyResult');
    const text = norm(res.innerHTML.replace(/<\/(li|p|div|h3)>/g, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' '));
    const cls = window.energyChildBmiClass({ sex, ageYears: age + months / 12, ageMonthsOpt: months, weightKg: w, heightCm: h });
    const z = cls ? cls.z : null;
    return {
      text,
      cls,
      zS: z == null ? null : (z < 0 ? '−' : '+') + Math.abs(z).toFixed(2).replace('.', ','),
      pct: z == null ? null : window.dietZToPercentile(z),
      active: document.querySelector('[data-diet-strategy-choice].is-active')?.getAttribute('data-diet-strategy-choice') || null,
    };
  }, { age, months, sex, w, h, click, pf });
}

test('3-latka z otyłością: aktywność ≥ 180 min i ekran ≤ 1 h, witamina D 600 → 1200 IU (UL 2000), płyny 1,25 l, zdanie z BMI i klasą', async ({ page }) => {
  test.setTimeout(120_000);
  await openAll(page);
  const r = await run(page, { age: 3, sex: 'F', w: 22, h: 100 });
  expect(r.cls.severe).toBe(true);
  expect(r.text).toContain('co najmniej 180 minut dziennie');
  expect(r.text).toContain('czasu przed ekranem do 1 godziny dziennie');
  expect(r.text).not.toContain('gry zespołowe');
  expect(r.text).toContain('w wieku 1–3 lat 600 IU dziennie, przy otyłości dawka podwojona – 1200 IU dziennie');
  expect(r.text).toContain('Dawki powyżej 2000 IU dziennie');
  expect(r.text).not.toContain('4000 IU');
  expect(r.text).toContain('około 1,25 l dziennie (łącznie z wodą zawartą w pożywieniu)');
  expect(r.text).not.toContain('30 ml');
  expect(r.text).toContain('wymaga konsultacji dietetyka lub endokrynologa dziecięcego');
  expect(r.text).not.toContain('powinno skonsultować się');
  expect(r.text).toContain(`BMI 22,0 kg/m², powyżej 99. centyla dla wieku i płci, z-score ${r.zS} – otyłość (≥ 99. centyla).`);

  const p = await run(page, { age: 3, sex: 'F', w: 22, h: 100, pf: true });
  expect(p.text).toContain('Proszę zadbać, aby dziecko było aktywne przez co najmniej 180 minut dziennie');
  expect(p.text).toContain('W wieku 1–3 lat standardowa dawka to 600 IU dziennie, a przy otyłości zaleca się dawkę podwojoną: 1200 IU dziennie');
  expect(p.text).toContain(`BMI dziecka wynosi 22,0 kg/m² i przekracza 99. centyl dla wieku i płci (z-score ${p.zS}), co oznacza otyłość.`);
  expect(p.text).toContain('około 1,25 l płynów dziennie');
});

test('14-latek z nadwagą (bez otyłości): witamina D 1000–2000 IU bez podwojenia, UL 4000, płyny 2,35 l, kcal sesji netto 300, trener od 12 lat, BMI z centylem 1 miejsce po przecinku', async ({ page }) => {
  test.setTimeout(120_000);
  await openAll(page);
  const r = await run(page, { age: 14, sex: 'M', w: 75, h: 165 });
  expect(r.cls.overweight).toBe(true);
  expect(r.cls.obese).toBe(false);
  expect(r.pct).toBeGreaterThan(95);
  const pctS = r.pct.toFixed(1).replace('.', ',');
  expect(r.text).toContain('w wieku 11–18 lat 1000–2000 IU dziennie (polskie wytyczne 2023)');
  expect(r.text).not.toContain('dawka podwojona');
  expect(r.text).toContain('Dawki powyżej 4000 IU dziennie');
  expect(r.text).toContain('około 2,35 l dziennie (łącznie z wodą zawartą w pożywieniu)');
  expect(r.text).toContain('(ok. 300 kcal każda)');
  expect(r.text).toContain('wsparcie trenera personalnego');
  expect(r.text).toContain(`BMI 27,5 kg/m², centyl ok. ${pctS} dla wieku i płci, z-score ${r.zS} – nadwaga (85.–97. centyl).`);

  const p = await run(page, { age: 14, sex: 'M', w: 75, h: 165, pf: true });
  expect(p.text).toContain(`Twoje BMI wynosi 27,5 kg/m² i odpowiada centylowi ok. ${pctS} dla wieku i płci (z-score ${p.zS}), co oznacza nadwagę.`);
  expect(p.text).toContain('W wieku 11–18 lat standardowa dawka to 1000–2000 IU dziennie. Dawki powyżej 4000 IU dziennie');
  expect(p.text).toContain('około 2,35 l płynów dziennie');
  expect(p.text).toContain('(ok. 300 kcal każda)');
});

test('11-latek z otyłością (Cole ≥ 120 %): zdanie o konsultacji bez trenera personalnego, płyny 2,1 l, dawka podwojona 2000–4000 IU', async ({ page }) => {
  test.setTimeout(120_000);
  await openAll(page);
  const r = await run(page, { age: 11, sex: 'M', w: 70, h: 150 });
  expect(r.cls.obese).toBe(true);
  expect(r.text).toContain('konsultacja z dietetykiem lub psychologiem dziecięcym.');
  expect(r.text).not.toContain('trener');
  expect(r.text).toContain('około 2,1 l dziennie');
  expect(r.text).toContain('przy otyłości dawka podwojona – 2000–4000 IU dziennie');
  expect(r.text).toContain('przy otyłości zasadne jest oznaczenie 25(OH)D przed rozpoczęciem suplementacji');

  const r12 = await run(page, { age: 12, sex: 'M', w: 70, h: 150 });
  expect(r12.text).toContain('a w razie potrzeby także wsparcie trenera personalnego.');
});

test('8-latka 97–99c z jawną redukcją: uzasadnienie limitu tempa (0,5 kg/mies., deficyt 130 kcal) w obu rejestrach, kcal sesji netto 160, płyny 1,75 l', async ({ page }) => {
  test.setTimeout(120_000);
  await openAll(page);
  const r = await run(page, { age: 8, sex: 'F', w: 40, h: 130, click: 'reduction' });
  expect(r.active).toBe('reduction');
  expect(r.text).toContain('W wieku 6–11 lat przy BMI poniżej 99. centyla tempo ubytku masy ograniczono do ok. 0,5 kg/mies. (deficyt ok. 130 kcal/dzień)');
  expect(r.text).toContain('(ok. 160 kcal każda)');
  expect(r.text).toContain('około 1,75 l dziennie');
  expect(r.text).toContain('w wieku 4–10 lat 600–1000 IU dziennie, przy otyłości dawka podwojona – 1200–2000 IU dziennie');

  const p = await run(page, { age: 8, sex: 'F', w: 40, h: 130, click: 'reduction', pf: true });
  expect(p.text).toContain('Tempo odchudzania jest u dziecka w wieku 6–11 lat celowo ograniczone do ok. 0,5 kg miesięcznie, aby nie zaburzyć wzrastania – dlatego deficyt planu wynosi ok. 130 kcal dziennie.');
  expect(p.text).toContain('U dziecka poniżej 10. roku życia taki plan należy traktować wyłącznie orientacyjnie');
});
