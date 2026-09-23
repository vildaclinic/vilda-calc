import { expect, test } from '@playwright/test';

// P-PAL rata 1 (decyzje właściciela 2026-09-22): JEDNA tabela domyślnego PAL wg wieku (1–3 lata 1,4; 4–9 lat 1,6;
// 10–18 lat 1,6; dorośli 1,6), otyłość obniża o stopień tylko u 10–18 lat i dorosłych, niedowaga nigdy nie obniża,
// karta „Normy żywieniowe” przejmuje PAL planu, u dziecka z otyłością jeden rabat (PAL 1,4, bez REE × 0,9),
// raport nazywa poziom aktywności słowami i oznacza wartość domyślną. Prawdziwa strona, dane FIKCYJNE.

async function otworz(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && typeof window.patientReportBuildModel === 'function'
    && typeof window.energyDefaultPlanPal === 'function' && typeof window.nutritionNormsBuildCardModel === 'function'
    && typeof window.buildDietEnergyRecommendationResult === 'function');
}

async function stan(page, s) {
  return page.evaluate(async (s) => {
    document.documentElement.classList.remove('vilda-auth-locked');
    const set = (id, v) => { const el = document.getElementById(id); if (!el) return; el.value = v == null ? '' : String(v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    window.professionalMode = true; window.intakeHistory = null; window.lastLoadedData = null; window.hasUserModifiedAfterLoad = false;
    if (s.reset) { window.__vildaPlanPalTouched = false; window.__vildaPlanPalDefault = null; }
    set('name', 'Testowy Fikcyjny'); set('age', s.age); set('ageMonths', s.months || 0); set('sex', s.sex); set('weight', s.w); set('height', s.h);
    if (typeof window.ensureDietRecommendationsElements === 'function') window.ensureDietRecommendationsElements();
    window.update();
    if (s.pal) { const sel = document.getElementById('palFactor'); sel.value = s.pal; sel.dispatchEvent(new Event('change', { bubbles: true })); window.update(); }
    await new Promise((r) => { setTimeout(r, 400); });
    const dane = window.buildDietEnergyRecommendationResult().dane;
    const m = window.patientReportBuildModel();
    const normy = window.nutritionNormsBuildCardModel(window.nutritionNormsReadBasicsFromDom(), window.nutritionNormsGetUiState());
    const st = window.energyBuildPlanReductionState({ ageYears: s.age + (s.months || 0) / 12, ageMonthsOpt: s.months || 0, sex: s.sex, weightKg: s.w, heightCm: s.h, palInput: null, history: null, intakeKcalPerDay: null, mountId: 'anorexiaTmpMount' });
    return {
      pal: document.getElementById('palFactor').value,
      touched: window.__vildaPlanPalTouched === true,
      dane: { pal: dane && dane.energia ? dane.energia.palUzyty : null, domyslny: dane && dane.energia ? dane.energia.palDomyslny : null },
      raport: { badge: m.nutritionCard.badge, note: m.nutritionCard.note },
      normy: { uiPal: (window.nutritionNormsGetUiState() || {}).palSelector, usedPal: normy && normy.energy ? normy.energy.usedPal : null, palNote: normy && normy.energy ? normy.energy.palNote : null, opcje: normy && normy.ui ? normy.ui.palOptions : [] },
      silnik: { palUsed: st.palUsed, ree: st.reeKcal, reeAdj: st.reeAdjustedKcal, maint: st.maintenanceKcal, obesityPlan: !!st.childObesityPlan },
    };
  }, s);
}

const NOTA = 'Poziom aktywności przyjęto domyślnie dla wieku, dopóki lekarz go nie zmieni.';

test.describe('P-PAL rata 1 — jedna tabela PAL, karta norm z planu, raport z oznaczeniem wartości domyślnej', () => {
  test('PAL-1: dziecko 7 lat bez nadmiaru → 1,6 w planie, w karcie norm („Jak w planie”) i w raporcie z notą o wartości domyślnej', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const r = await stan(page, { age: 7, months: 0, sex: 'F', w: 24, h: 122, reset: true });
    expect(r.pal).toBe('1.6'); expect(r.touched).toBe(false);
    expect(r.dane.pal).toBe(1.6); expect(r.dane.domyslny).toBe(true);
    expect(r.normy.uiPal).toBe('inherit'); expect(r.normy.usedPal).toBe(1.6); expect(r.normy.palNote).toBe('z formularza / planu');
    const opcja = r.normy.opcje.find((o) => o.value === 'inherit');
    expect(opcja).toBeTruthy(); expect(opcja.selected).toBe(true); expect(opcja.label).toContain('Jak w planie');
    expect(r.raport.badge).toBe('umiarkowana aktywność'); expect(r.raport.note).toBe(NOTA);
  });

  test('PAL-2: dorosły z otyłością 1,4, dorosły z nadwagą 1,6, dorosły z niedowagą 1,6 (niedowaga nie obniża PAL)', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const ot = await stan(page, { age: 40, months: 0, sex: 'M', w: 100, h: 170, reset: true }); // BMI 34,6
    expect(ot.pal).toBe('1.4'); expect(ot.silnik.palUsed).toBe(1.4); expect(ot.raport.badge).toBe('mała aktywność'); expect(ot.raport.note).toBe(NOTA);
    const nw = await stan(page, { age: 40, months: 0, sex: 'M', w: 85, h: 170, reset: true }); // BMI 29,4
    expect(nw.pal).toBe('1.6'); expect(nw.silnik.palUsed).toBe(1.6);
    const nd = await stan(page, { age: 40, months: 0, sex: 'F', w: 50, h: 170, reset: true }); // BMI 17,3
    expect(nd.pal).toBe('1.6'); expect(nd.silnik.palUsed).toBe(1.6); expect(nd.normy.usedPal).toBe(1.6);
  });

  test('PAL-3: nastolatek z otyłością 1,4 i JEDEN rabat (REE bez ×0,9); wybór lekarza 1,8 przechodzi do karty norm i raportu bez noty', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const r = await stan(page, { age: 14, months: 0, sex: 'M', w: 85, h: 165, reset: true });
    expect(r.pal).toBe('1.4'); expect(r.silnik.obesityPlan).toBe(true);
    expect(r.silnik.reeAdj).toBe(Math.round(r.silnik.ree));
    expect(r.silnik.maint).toBe(Math.round(r.silnik.ree * 1.4));
    expect(r.normy.usedPal).toBe(1.4); expect(r.raport.note).toBe(NOTA);
    const w = await stan(page, { age: 14, months: 0, sex: 'M', w: 85, h: 165, pal: '1.8' });
    expect(w.touched).toBe(true); expect(w.pal).toBe('1.8');
    expect(w.dane.pal).toBe(1.8); expect(w.dane.domyslny).toBe(false);
    expect(w.normy.usedPal).toBe(1.8);
    expect(w.raport.badge).toBe('aktywny tryb życia'); expect(w.raport.note).toBe('');
  });

  test('PAL-4: dziecko 8 lat z otyłością zostaje przy 1,6; 2-latek 1,4', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const o8 = await stan(page, { age: 8, months: 0, sex: 'M', w: 45, h: 130, reset: true });
    expect(o8.pal).toBe('1.6'); expect(o8.silnik.palUsed).toBe(1.6); expect(o8.silnik.obesityPlan).toBe(true);
    const m2 = await stan(page, { age: 2, months: 0, sex: 'M', w: 13, h: 88, reset: true });
    expect(m2.pal).toBe('1.4'); expect(m2.silnik.palUsed).toBe(1.4);
  });
});
