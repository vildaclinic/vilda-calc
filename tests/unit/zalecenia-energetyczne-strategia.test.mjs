import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// ENERGY-REC-2 (decyzja właściciela 2026-09-12): jedna prognoza wzrastania (energyChildGrowthOutlook),
// jeden resolver strategii (energyResolveStrategy), symulacja przy tempie 0 (stabilizacja) i opisy diet
// wg klasy BMI. Dane FIKCYJNE; LMS BMI to uproszczone stałe testowe; brak medianHeightForAgeMonths
// (jak w izolowanym module) → tabela wiekowa wg płci.

const LMS = { 'M-168': [-1.8, 19.2, 0.13], 'F-216': [-1.9, 21.3, 0.13], 'M-96': [-2.0, 16.0, 0.13], 'F-96': [-2.0, 15.9, 0.13] };
globalThis.KCAL_PER_KG = 7700;
globalThis.CHILD_AGE_MIN = 0.25;
globalThis.getLMS = (sex, months) => LMS[`${sex}-${months}`] || null;
globalThis.toNormalBMITarget = () => 22;
const win = loadBrowserScript('vilda_diet_plan_ui.js', {});

describe('Prognoza wzrastania (fallback tabelaryczny wg płci i wieku)', () => {
  it('dziewczynka 16 l → 3,5 cm/rok; 17 l → 0 (praktycznie zakończone); chłopiec 17 l → 2; 18 l → 0', () => {
    expect(win.energyChildGrowthOutlook({ ageYears: 16, sex: 'F', heightCm: 163 }).annualGrowthCm).toBe(3.5);
    const g17 = win.energyChildGrowthOutlook({ ageYears: 17, sex: 'F', heightCm: 165 });
    expect(g17.annualGrowthCm).toBe(0);
    expect(g17.practicallyEnded).toBe(true);
    expect(win.energyChildGrowthOutlook({ ageYears: 17, sex: 'M', heightCm: 175 }).annualGrowthCm).toBe(2);
    expect(win.energyChildGrowthOutlook({ ageYears: 18, sex: 'M', heightCm: 178 }).annualGrowthCm).toBe(0);
  });
  it('obserwowane tempo z karty zaawansowanej ma pierwszeństwo; pozostały wzrost ≤ 3 cm → praktycznie zakończone', () => {
    win.advancedGrowthData = { growthVelocity: 4.2, finalHeightPrediction: { cm: 167 } };
    const o = win.energyChildGrowthOutlook({ ageYears: 14, sex: 'M', heightCm: 165 });
    expect(o.annualGrowthCm).toBe(4.2);
    expect(o.observedGrowth).toBe(true);
    expect(o.remainingCm).toBeCloseTo(2, 6);
    expect(o.practicallyEnded).toBe(true);
    win.advancedGrowthData = { finalHeightPrediction: { cm: 178 } };
    const o2 = win.energyChildGrowthOutlook({ ageYears: 14, sex: 'M', heightCm: 165 });
    expect(o2.capCm).toBe(178);
    expect(o2.practicallyEnded).toBe(false);
    delete win.advancedGrowthData;
  });
});

describe('Resolver strategii — kolejność reguł', () => {
  const st = (stage, severe = false) => ({ childObesityPlan: true, childPlanStage: stage, bmiClass: { severe } });
  it('dorosły / wzrost zakończony → redukcja niezależnie od wyboru', () => {
    expect(win.energyResolveStrategy({ state: st('age_12_18'), ageYears: 25, stabChecked: true })).toBe('reduction');
    expect(win.energyResolveStrategy({ state: st('age_12_18'), ageYears: 14, growthEnded: true, stabChecked: true })).toBe('reduction');
  });
  it('jawny wybór użytkownika wygrywa; stabilizacja tylko gdy nie zablokowana', () => {
    expect(win.energyResolveStrategy({ state: st('age_6_11'), ageYears: 8, reduceChecked: true })).toBe('reduction');
    expect(win.energyResolveStrategy({ state: st('age_12_18'), ageYears: 14, stabChecked: true })).toBe('stabilization');
    expect(win.energyResolveStrategy({ state: st('age_12_18'), ageYears: 14, stabChecked: true, stabDisabled: true })).toBe('reduction');
  });
  it('domyślnie: 2–5 stabilizacja (nawet przy blokadzie), 6–11 < 99c stabilizacja, ≥ 99c i 12–18 redukcja, praktycznie zakończone wzrastanie → redukcja', () => {
    expect(win.energyResolveStrategy({ state: st('age_2_5'), ageYears: 4, stabDisabled: true })).toBe('stabilization');
    expect(win.energyResolveStrategy({ state: st('age_6_11'), ageYears: 8 })).toBe('stabilization');
    expect(win.energyResolveStrategy({ state: st('age_6_11', true), ageYears: 8 })).toBe('reduction');
    expect(win.energyResolveStrategy({ state: st('age_12_18'), ageYears: 14 })).toBe('reduction');
    expect(win.energyResolveStrategy({ state: st('age_6_11'), ageYears: 8, outlook: { practicallyEnded: true } })).toBe('reduction');
    expect(win.energyResolveStrategy({ state: st('age_6_11'), ageYears: 8, stabDisabled: true })).toBe('reduction');
    expect(win.energyResolveStrategy({ state: { childObesityPlan: false }, ageYears: 8 })).toBe('reduction');
  });
});

describe('Symulacja przy tempie 0 (stabilizacja) i opisy diet wg klasy BMI', () => {
  it('dziecko: tempo 0 kg/tydz. liczy termin z samego wzrastania; dorosły przy 0 → brak wyniku', () => {
    const child = win.energySimulateMonthsToBmiTarget({ ageYears: 14, ageMonthsOpt: 0, sex: 'M', weightKg: 62, heightCm: 165, weeklyLossKg: 0, target: 'norm' });
    expect(child.growthAware).toBe(true);
    expect(child.months).toBeGreaterThan(0);
    const adult = win.energySimulateMonthsToBmiTarget({ ageYears: 30, ageMonthsOpt: 0, sex: 'M', weightKg: 80, heightCm: 175, weeklyLossKg: 0, target: 'norm' });
    expect(adult.months).toBeNull();
    const ended = win.energySimulateMonthsToBmiTarget({ ageYears: 14, ageMonthsOpt: 0, sex: 'M', weightKg: 62, heightCm: 165, weeklyLossKg: 0, target: 'norm', growthEnded: true });
    expect(ended.months).toBeNull();
  });
  it('dieta lekka przy ≥ 99c (dziecko) i BMI ≥ 30 (dorosły) opisana jako etap wstępny; przy nadwadze bez zmian', () => {
    const severe = win.energyBuildPlanReductionState({ ageYears: 8, ageMonthsOpt: 0, sex: 'M', weightKg: 45, heightCm: 130, palInput: 1.4 });
    expect(severe.bmiClass.severe).toBe(true);
    expect(win.energyDietBulletsExtra('light', severe)[0]).toContain('etap wstępny');
    const adult = win.energyBuildPlanReductionState({ ageYears: 35, ageMonthsOpt: 0, sex: 'M', weightKg: 105, heightCm: 175, palInput: 1.4 });
    expect(win.energyDietBulletsExtra('light', adult)[0]).toContain('etap wstępny');
    const ow = win.energyBuildPlanReductionState({ ageYears: 40, ageMonthsOpt: 0, sex: 'M', weightKg: 85, heightCm: 178, palInput: 1.4 });
    expect(win.energyDietBulletsExtra('light', ow)[0]).toContain('niewielką nadwagą');
    expect(win.energyDietBulletsExtra('moderate', severe)).toEqual(win.DIET_BULLETS.moderate.slice(2));
  });
});

describe('Klasa BMI przy źródle Palczewskiej — z jej centyli, mediana z centyla 50', () => {
  it('pct 96 → nadwaga bez otyłości; pct 98 → otyłość; masa należna z centyla 50; po powrocie do OLAF — LMS', () => {
    globalThis.bmiSource = 'PALCZEWSKA';
    let pctStub = 96;
    globalThis.bmiPercentileChildPal = () => pctStub;
    globalThis.getPalCentile = (sex, months, p, type) => (type === 'BMI' && p === 50 ? 17.2 : null);
    const c = win.energyChildBmiClass({ sex: 'M', ageYears: 10, weightKg: 55, heightCm: 145 });
    expect(c.source).toBe('PALCZEWSKA');
    expect(c.overweight).toBe(true);
    expect(c.obese).toBe(false);
    expect(c.medianBmi).toBe(17.2);
    expect(c.neededWeightKg).toBeCloseTo(17.2 * 1.45 * 1.45, 6);
    expect(c.z).toBeGreaterThan(1.6);
    expect(c.z).toBeLessThan(1.9);
    pctStub = 98;
    expect(win.energyChildBmiClass({ sex: 'M', ageYears: 10, weightKg: 55, heightCm: 145 }).obese).toBe(true);
    const st = win.energyBuildPlanReductionState({ ageYears: 10, ageMonthsOpt: 0, sex: 'M', weightKg: 55, heightCm: 145, palInput: 1.4 });
    expect(st.neededWeightKg).toBeCloseTo(17.2 * 1.45 * 1.45, 6);
    globalThis.bmiSource = 'OLAF';
    expect(win.energyChildBmiClass({ sex: 'M', ageYears: 14, weightKg: 85, heightCm: 165 }).source).toBeUndefined();
    delete globalThis.bmiPercentileChildPal; delete globalThis.getPalCentile; delete globalThis.bmiSource;
  });
});
