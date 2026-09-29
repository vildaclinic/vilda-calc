import { afterAll, describe, expect, it } from 'vitest';
import { oknoZSilnikiem, wczytajDoOkna } from '../support/silnik-bmi.mjs';

// P-DIETA-AUDYT2 rata 1 (audyt 2026-09-29) — punkty sprawdzane na PRAWDZIWYM silniku planu (vilda_diet_plan_ui.js). Dane FIKCYJNE.
const zapisane = {};
function ustawGlobal(k, v) { if (!(k in zapisane)) zapisane[k] = globalThis[k]; globalThis[k] = v; }
afterAll(() => { for (const k of Object.keys(zapisane)) { if (zapisane[k] === undefined) delete globalThis[k]; else globalThis[k] = zapisane[k]; } });
ustawGlobal('KCAL_PER_KG', 7700);
ustawGlobal('CHILD_AGE_MIN', 0.25);
ustawGlobal('vildaAppSetTrustedHtml', (el, html) => { el.innerHTML = html; });
ustawGlobal('vildaAppClearHtml', (el) => { el.innerHTML = ''; });
ustawGlobal('bmiSource', 'OLAF');
const win = wczytajDoOkna(oknoZSilnikiem(), 'vilda_diet_plan_ui.js');

describe('A8: dziecko bez klasy BMI nie dostaje diet dorosłego', () => {
  it('silnik BMI niedostępny: 14-latka 38 kg / 160 cm — brak planu (dotąd lekka/umiarkowana/intensywna jak u dorosłego)', () => {
    const bak = win.VildaBmi;
    try {
      win.VildaBmi = undefined;
      const st = win.energyBuildPlanReductionState({ ageYears: 14, ageMonthsOpt: 0, sex: 'F', weightKg: 38, heightCm: 160, palInput: null });
      expect(st.bmiClass).toBeNull();
      expect(st.diets).toEqual([]);
      expect(st.reductionNotIndicated).toBe(true);
    } finally { win.VildaBmi = bak; }
  });
});

describe('A2: symulacja liczy wiek raz (wiek dziesiętny + pole miesięcy)', () => {
  it('13 l. 6 mies. podane jako 13,5 + 6 mies. = 13,5 + 0 mies.', () => {
    const a = win.energySimulateMonthsToBmiTarget({ ageYears: 13.5, ageMonthsOpt: 6, sex: 'M', weightKg: 76, heightCm: 168, weeklyLossKg: 0.1145, target: 'norm' });
    const b = win.energySimulateMonthsToBmiTarget({ ageYears: 13.5, ageMonthsOpt: 0, sex: 'M', weightKg: 76, heightCm: 168, weeklyLossKg: 0.1145, target: 'norm' });
    expect(a.months).toBe(b.months);
  });
  it('stabilizacja: masa w symulacji przybywa ze wzrastaniem (przyrostMasyKg > 0), trajektoria na życzenie', () => {
    const r = win.energySimulateMonthsToBmiTarget({ ageYears: 8, ageMonthsOpt: 0, sex: 'M', weightKg: 33, heightCm: 130, weeklyLossKg: 0, target: 'norm', trajektoria: true });
    expect(r.months).toBeGreaterThan(0);
    expect(r.przyrostMasyKg).toBeGreaterThan(0);
    const ost = r.trajektoria[r.trajektoria.length - 1];
    expect(ost.miesiac).toBe(r.months);
    expect(ost.masaKg).toBeGreaterThan(33);
  });
});

describe('A6: plan dziecka od 2 lat; górna granica stabilizacji nie wyższa od zapotrzebowania', () => {
  it('1 r. 3 mies. z nadwagą — brak planu', () => {
    const st = win.energyBuildPlanReductionState({ ageYears: 1.25, ageMonthsOpt: 3, sex: 'M', weightKg: 11.5, heightCm: 75, palInput: null });
    expect(st.bmiClass.overweight).toBe(true);
    expect(st.childObesityPlan).toBe(false);
    expect(st.maintenanceKcal).toBeNull();
  });
  it('2–5 lat: maintenanceGornaKcal ≤ maintenanceKcal (także poniżej minimum 1000 kcal)', () => {
    let ponizej = 0;
    for (const [sex, y, h, w] of [['F', 2, 80, 12.2], ['F', 2, 82, 13], ['M', 2, 84, 14], ['M', 3, 92, 17], ['F', 4, 100, 20], ['M', 5, 108, 24]]) {
      const st = win.energyBuildPlanReductionState({ ageYears: y, ageMonthsOpt: 0, sex, weightKg: w, heightCm: h, palInput: null });
      if (!st.childObesityPlan) continue;
      expect(st.maintenanceGornaKcal, `${sex} ${y} l. ${w} kg`).toBeLessThanOrEqual(st.maintenanceKcal);
      if (st.maintenanceKcal < st.floorKcal) ponizej += 1;
    }
    expect(ponizej).toBeGreaterThan(0);
  });
});
