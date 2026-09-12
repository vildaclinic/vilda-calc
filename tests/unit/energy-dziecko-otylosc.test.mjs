import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// ENERGY-CHILD-OBESITY (decyzja właściciela 2026-09-12): plan redukcji u dziecka 2–18 lat z BMI ≥ 85c
// liczy się od zapotrzebowania dla MASY NALEŻNEJ (mediana BMI dla wieku × wzrost²), bez mnożnika
// wzrastania ×1,01, ze stałym deficytem 200/350/500 kcal (PTP/PTOD/PTEiDD/KLRwP/PTBO 2022), minimum
// 1000 kcal (<10 lat) / 1200 kcal (≥10 lat) i etapami wieku wg Barlow 2007 (2–5: stabilizacja; 6–11 przy
// BMI < 99c: ubytek do 0,5 kg/mies. ≈ 130 kcal/d; 12–18: 200–500 kcal). PAL domyślny planu 10–18 lat: 1,4.
// Dorośli i dzieci z BMI < 85c: bez zmian merytorycznych (deficyt procentowy / brak planu).
// Dane FIKCYJNE; LMS BMI to uproszczone stałe testowe (nie tabele OLAF/WHO).

const LMS = {
  'M-36': [-1.2, 15.9, 0.08],
  'M-96': [-2.0, 16.0, 0.13],
  'M-120': [-1.9, 16.9, 0.13],
  'M-168': [-1.8, 19.2, 0.13],
  'F-84': [-1.9, 15.6, 0.12],
  'F-144': [-1.9, 18.0, 0.13],
};

// Ładowanie synchroniczne na poziomie modułu: describe() korzysta ze stanu silnika już przy zbieraniu testów.
globalThis.KCAL_PER_KG = 7700;
globalThis.CHILD_AGE_MIN = 0.25;
globalThis.getLMS = (sex, months) => LMS[`${sex}-${months}`] || null;
globalThis.vildaAppSetTrustedHtml = (el, html) => { el.innerHTML = html; };
globalThis.vildaAppClearHtml = (el) => { el.innerHTML = ''; };
const win = loadBrowserScript('vilda_diet_plan_ui.js', {});

const henryBoy10_17 = (w, hM) => 15.6 * w + 266 * hM + 299;
const henryBoy3_9 = (w, hM) => (0.0632 * w + 1.31 * hM + 1.28) * 239;
const henryGirl3_9 = (w, hM) => 15.9 * w + 210 * hM + 349;
const plan = (o) => win.energyBuildPlanReductionState({ ageMonthsOpt: 0, palInput: null, ...o });

describe('Klasa BMI i masa należna (mediana BMI × wzrost²)', () => {
  it('chłopiec 14 l, 165 cm, 85 kg → z ≥ 1,036 (nadwaga), ≥ 1,8808 (otyłość), ≥ 2,3263 (≥99c); masa należna 52,3 kg', () => {
    const c = win.energyChildBmiClass({ sex: 'M', ageYears: 14, weightKg: 85, heightCm: 165 });
    const bmi = 85 / 1.65 ** 2;
    const [L, M, S] = LMS['M-168'];
    expect(c.bmi).toBeCloseTo(bmi, 6);
    expect(c.z).toBeCloseTo(((bmi / M) ** L - 1) / (L * S), 6);
    expect(c.overweight).toBe(true);
    expect(c.obese).toBe(true);
    expect(c.severe).toBe(true);
    expect(c.neededWeightKg).toBeCloseTo(19.2 * 1.65 ** 2, 6);
  });
  it('chłopiec 10 l, 140 cm, 33 kg → BMI poniżej mediany: nie nadwaga', () => {
    const c = win.energyChildBmiClass({ sex: 'M', ageYears: 10, weightKg: 33, heightCm: 140 });
    expect(c.z).toBeLessThan(0);
    expect(c.overweight).toBe(false);
  });
  it('brak LMS dla wieku → null (silnik wraca do starej ścieżki)', () => {
    expect(win.energyChildBmiClass({ sex: 'M', ageYears: 11, weightKg: 50, heightCm: 150 })).toBeNull();
  });
});

describe('Domyślny PAL planu: 1,4 także dla 10–18 lat (typowy przy otyłości)', () => {
  it('energyDefaultPlanPal: 14 l → 1,4; 8 l → 1,4; 30 l → 1,4', () => {
    expect(win.energyDefaultPlanPal(14, 0)).toBe(1.4);
    expect(win.energyDefaultPlanPal(8, 0)).toBe(1.4);
    expect(win.energyDefaultPlanPal(30, 0)).toBe(1.4);
  });
  it('etykieta opcji 1,4 w selekcie planu 10–18 lat: „częsta przy otyłości", bez „poza Normami 2024"', () => {
    const el = { value: '', innerHTML: '' };
    win.energyPopulatePlanPalSelect(el, { ageYears: 14, ageMonthsOpt: 0, value: 1.4 });
    expect(el.innerHTML).toContain('częsta przy otyłości');
    expect(el.innerHTML).not.toContain('poza Normami');
    expect(el.value).toBe('1.4');
    const adult = { value: '', innerHTML: '' };
    win.energyPopulatePlanPalSelect(adult, { ageYears: 30, ageMonthsOpt: 0, value: 1.2 });
    expect(adult.innerHTML).not.toContain('częsta przy otyłości');
  });
  it('plakietka trybu: PAL 1,4 u 10–18 lat → ton „info" (nie „Tryb kliniczny"); PAL 1,2 dorosłego → kliniczny', () => {
    const teen = plan({ sex: 'M', ageYears: 14, weightKg: 85, heightCm: 165, palInput: 1.4 });
    expect(teen.modeBadge.tone).toBe('info');
    expect(teen.modeBadge.text).toContain('PAL 1,4');
    const adult = plan({ sex: 'M', ageYears: 30, weightKg: 95, heightCm: 178, palInput: 1.2 });
    expect(adult.modeBadge.tone).toBe('clinical');
  });
});

describe('Plan redukcji 12–18 lat: REE Henry’ego dla masy należnej × PAL, bez ×1,01, deficyty 200/350/500', () => {
  const st = plan({ sex: 'M', ageYears: 14, weightKg: 85, heightCm: 165, palInput: 1.4 });
  const needed = 19.2 * 1.65 ** 2;
  const base = henryBoy10_17(needed, 1.65) * 1.4;
  it('stan: childObesityPlan, etap 12–18, masa należna, kontekst liczy z „child_median_bmi" i mnożnikiem 1', () => {
    expect(st.childObesityPlan).toBe(true);
    expect(st.childPlanStage).toBe('age_12_18');
    expect(st.neededWeightKg).toBeCloseTo(needed, 6);
    expect(st.context.anthropometry.source).toBe('child_median_bmi');
    expect(st.context.anthropometry.weightUsedKg).toBeCloseTo(needed, 6);
    expect(st.context.energy.growthMultiplier).toBe(1);
    expect(st.reeKcal).toBeCloseTo(henryBoy10_17(needed, 1.65), 3);
    expect(st.maintenanceKcal).toBe(Math.round(base));
    expect(st.floorKcal).toBe(1200);
  });
  it('trzy diety: intake = baza − 200/350/500, tempo = deficyt×7/7700 (0,18/0,32/0,45 kg/tydz.)', () => {
    expect(st.diets.map((d) => d.key)).toEqual(['light', 'moderate', 'intense']);
    expect(st.diets.map((d) => d.deficit)).toEqual([200, 350, 500]);
    expect(st.diets.map((d) => d.intake)).toEqual([200, 350, 500].map((d) => Math.round(base - d)));
    expect(st.diets[2].weeklyLoss).toBeCloseTo(500 * 7 / 7700, 6);
    expect(st.diets.every((d) => d.fixedDeficit && !d.rateCapped)).toBe(true);
  });
  it('preset nutrition_actual (normy) zachowuje ×1,01 i masę aktualną — zmiana dotyczy tylko planu', () => {
    const ctx = win.energyBuildContext({ preset: 'nutrition_actual', ageYears: 14, ageMonthsOpt: 0, sex: 'M', weightKg: 85, heightCm: 165, palInput: 1.6 });
    expect(ctx.energy.growthMultiplier).toBe(1.01);
    expect(ctx.anthropometry.weightUsedKg).toBe(85);
  });
  it('chłopiec 14 l bez podanego PAL → selektor wraca do normatywnego 1,6; domyślne 1,4 wstawia formularz przez energyDefaultPlanPal', () => {
    const s2 = plan({ sex: 'M', ageYears: 14, weightKg: 85, heightCm: 165, palInput: null });
    expect(s2.palUsed).toBe(1.6); // fallback selektora zostaje normatywny; domyślną wartość 1,4 wstawia formularz
    expect(win.energyDefaultPlanPal(14, 0)).toBe(1.4);
  });
});

describe('Etap 6–11 lat: przy BMI < 99c tylko dieta lekka ograniczona do 0,5 kg/mies. (130 kcal); ≥99c pełne 200–500', () => {
  it('chłopiec 10 l, 145 cm, 55 kg (z między 1,04 a 2,33) → lekka −130 z rateCapped, reszta z powodem', () => {
    const st = plan({ sex: 'M', ageYears: 10, weightKg: 55, heightCm: 145, palInput: 1.4 });
    expect(st.childPlanStage).toBe('age_6_11');
    expect(st.bmiClass.overweight).toBe(true);
    expect(st.bmiClass.severe).toBe(false);
    expect(st.diets.map((d) => d.key)).toEqual(['light']);
    expect(st.diets[0].deficit).toBe(130);
    expect(st.diets[0].rateCapped).toBe(true);
    expect(st.dietUnavailable.moderate).toContain('0,5 kg/mies.');
    expect(st.dietUnavailable.intense).toContain('6–11 lat');
    expect(st.floorKcal).toBe(1200);
  });
  it('chłopiec 8 l, 130 cm, 45 kg (z ≥ 2,33) → trzy diety 200/350/500, minimum 1000 kcal', () => {
    const st = plan({ sex: 'M', ageYears: 8, weightKg: 45, heightCm: 130, palInput: 1.4 });
    const base = henryBoy3_9(16.0 * 1.3 ** 2, 1.3) * 1.4;
    expect(st.bmiClass.severe).toBe(true);
    expect(st.diets.map((d) => d.deficit)).toEqual([200, 350, 500]);
    expect(st.diets.map((d) => d.intake)).toEqual([200, 350, 500].map((d) => Math.round(base - d)));
    expect(st.floorKcal).toBe(1000);
  });
  it('dziewczynka 7 l, 118 cm, 35 kg: przy PAL 1,4 tylko lekka (reszta < 1000 kcal), przy PAL 1,8 wszystkie trzy', () => {
    const needed = 15.6 * 1.18 ** 2;
    const lo = plan({ sex: 'F', ageYears: 7, weightKg: 35, heightCm: 118, palInput: 1.4 });
    const base = henryGirl3_9(needed, 1.18) * 1.4;
    expect(Math.round(base - 350)).toBeLessThan(1000);
    expect(lo.diets.map((d) => d.key)).toEqual(['light']);
    expect(lo.dietUnavailable.moderate).toContain('minimum 1000 kcal');
    const hi = plan({ sex: 'F', ageYears: 7, weightKg: 35, heightCm: 118, palInput: 1.8 });
    expect(hi.diets.map((d) => d.key)).toEqual(['light', 'moderate', 'intense']);
  });
});

describe('Etap 2–5 lat: bez diet (stabilizacja), ale z energią utrzymania dla masy należnej', () => {
  it('chłopiec 3 l, 98 cm, 20 kg → diets [], powody „2–5 lat", maintenanceKcal = REE(masa należna) × PAL', () => {
    const st = plan({ sex: 'M', ageYears: 3, weightKg: 20, heightCm: 98, palInput: 1.4 });
    const needed = 15.9 * 0.98 ** 2;
    expect(st.childObesityPlan).toBe(true);
    expect(st.childPlanStage).toBe('age_2_5');
    expect(st.diets).toEqual([]);
    expect(st.dietUnavailable.light).toContain('2–5 lat');
    expect(st.maintenanceKcal).toBe(Math.round(henryBoy3_9(needed, 0.98) * 1.4));
    expect(st.floorKcal).toBe(1000);
  });
});

describe('Dziecko z BMI < 85c i dorosły', () => {
  it('chłopiec 10 l, 140 cm, 33 kg → brak planu (reductionNotIndicated), kontekst na masie aktualnej z ×1,01', () => {
    const st = plan({ sex: 'M', ageYears: 10, weightKg: 33, heightCm: 140, palInput: 1.4 });
    expect(st.childObesityPlan).toBe(false);
    expect(st.reductionNotIndicated).toBe(true);
    expect(st.diets).toEqual([]);
    expect(st.context.anthropometry.source).toBe('actual');
    expect(st.context.energy.growthMultiplier).toBe(1.01);
  });
  it('dorosły 40 l, 178 cm, 95 kg → bez zmian: deficyt 22 % TEE (≤ 750) dla umiarkowanej, minimum 1600 kcal (M)', () => {
    const st = plan({ sex: 'M', ageYears: 40, weightKg: 95, heightCm: 178, palInput: 1.4 });
    const tee = st.teeBaselineKcal;
    const mod = st.diets.find((d) => d.key === 'moderate');
    expect(st.childObesityPlan).toBe(false);
    expect(mod.deficit).toBe(Math.round(Math.min(0.22 * tee, 750)));
    expect(mod.fixedDeficit).toBeUndefined();
  });
});
