import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// ENERGY-REC-1 (decyzja właściciela 2026-09-12, audyt zaleceń energetycznych, błędy krytyczne):
//  K1 — dorosły z BMI < 25 nie dostaje diet redukcyjnych z silnika planu (reductionNotIndicated),
//  K3 — symulacja czasu do celu BMI zna flagę „wzrost zakończony" (tempo wzrastania 0, growthAware false),
//       więc termin liczy się jak dla dorosłego (liniowo), a nie z domyślnym tempem wzrastania.
// Dane FIKCYJNE; LMS BMI to uproszczone stałe testowe.

const LMS = { 'M-168': [-1.8, 19.2, 0.13] };
globalThis.KCAL_PER_KG = 7700;
globalThis.CHILD_AGE_MIN = 0.25;
globalThis.getLMS = (sex, months) => LMS[`${sex}-${months}`] || null;
// cel BMI stały (22) — izoluje test od tabel centylowych; liczy się różnica: z wzrastaniem vs bez
globalThis.toNormalBMITarget = () => 22;
const win = loadBrowserScript('vilda_diet_plan_ui.js', {});

describe('K1 — dorosły z BMI w normie bez diet redukcyjnych', () => {
  it('28 l, 165 cm, 62 kg (BMI 22,8) → diets [], reductionNotIndicated; 35 l, 175 cm, 105 kg → trzy diety jak dotąd', () => {
    const normal = win.energyBuildPlanReductionState({ ageYears: 28, ageMonthsOpt: 0, sex: 'F', weightKg: 62, heightCm: 165, palInput: 1.4 });
    expect(normal.isChild).toBe(false);
    expect(normal.diets).toEqual([]);
    expect(normal.reductionNotIndicated).toBe(true);
    expect(normal.teeBaselineKcal).toBeGreaterThan(1500);
    const obese = win.energyBuildPlanReductionState({ ageYears: 35, ageMonthsOpt: 0, sex: 'M', weightKg: 105, heightCm: 175, palInput: 1.4 });
    expect(obese.diets.map((d) => d.key)).toEqual(['light', 'moderate', 'intense']);
    expect(obese.reductionNotIndicated).toBe(false);
  });
  it('granica: BMI 24,9 → bez diet; BMI 25,1 → diety', () => {
    const h = 170;
    const w249 = 24.9 * 1.7 * 1.7;
    const w251 = 25.1 * 1.7 * 1.7;
    expect(win.energyBuildPlanReductionState({ ageYears: 40, ageMonthsOpt: 0, sex: 'M', weightKg: w249, heightCm: h, palInput: 1.4 }).diets).toEqual([]);
    expect(win.energyBuildPlanReductionState({ ageYears: 40, ageMonthsOpt: 0, sex: 'M', weightKg: w251, heightCm: h, palInput: 1.4 }).diets.length).toBeGreaterThanOrEqual(2);
  });
});

describe('K3 — symulacja czasu do celu BMI z flagą „wzrost zakończony"', () => {
  const base = { ageYears: 14, ageMonthsOpt: 0, sex: 'M', weightKg: 85, heightCm: 165, weeklyLossKg: 200 * 7 / 7700, target: 'norm' };
  it('bez flagi: wzrastanie domyślne (growthAware, tempo > 0); z flagą: growthAware false, tempo 0', () => {
    const grow = win.energySimulateMonthsToBmiTarget(base);
    const ended = win.energySimulateMonthsToBmiTarget({ ...base, growthEnded: true });
    expect(grow.growthAware).toBe(true);
    expect(grow.annualGrowthCm).toBeGreaterThan(0);
    expect(ended.growthAware).toBe(false);
    expect(ended.annualGrowthCm).toBe(0);
    expect(ended.months).toBeGreaterThan(grow.months);
  });
  it('z flagą termin równa się matematyce liniowej: (masa − cel·h²) / tempo miesięczne, krok 0,5 mies.', () => {
    const ended = win.energySimulateMonthsToBmiTarget({ ...base, growthEnded: true });
    const kg = 85 - 22 * 1.65 * 1.65;
    const monthly = base.weeklyLossKg * (52 / 12);
    const expected = Math.ceil((kg / monthly) * 2) / 2;
    expect(ended.months).toBeCloseTo(expected, 5);
  });
  it('dorosły: flaga nie zmienia wyniku (wzrost i tak stały)', () => {
    const a = { ...base, ageYears: 30 };
    expect(win.energySimulateMonthsToBmiTarget(a).months).toBe(win.energySimulateMonthsToBmiTarget({ ...a, growthEnded: true }).months);
  });
});
