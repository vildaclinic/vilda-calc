import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// ENERGY-CHILD-MID1 (decyzja właściciela 2026-09-12, po przeglądzie „diety zbyt rygorystyczne"):
// plan i stabilizacja u dziecka 2–18 lat z BMI ≥ 85c liczą się od zapotrzebowania dla MASY AKTUALNEJ
// z korektą −10 % REE na otyłość (Hofsteenge 2010), bez mnożnika wzrastania ×1,01. Deficyt wynika
// z BEZPIECZNEGO TEMPA, nie ze stałej: 12–18 lat 1 / 1,5 / 2 kg/mies. (Mazur 2022: do 1–2 kg/mies.),
// 6–11 lat ≥ 99c 0,5 / 1 / 1,5, 6–11 lat < 99c tylko 0,5 (Barlow 2007), 2–5 lat brak diet.
// Podłoga = max(minimum wieku 1000/1200 kcal, REE po korekcie) — żaden plan nie schodzi poniżej
// spoczynkowej przemiany materii. Masa należna (mediana BMI) zostaje CELEM, nie podstawą energii.
// PAL domyślny planu 10–18 lat: 1,4; silnik bez podanego PAL używa tej samej wartości co formularz.
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
const REE_ADJ = 0.9;                       // Hofsteenge 2010: równania na masie aktualnej zawyżają REE o ~10 %
const defFor = (kgPerMonth) => Math.round(kgPerMonth * 7700 / 30.4375); // 0,5→126; 1→253; 1,5→379; 2→506

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

describe('Plan 12–18 lat: REE Henry’ego dla MASY AKTUALNEJ × 0,9 × PAL, bez ×1,01; deficyt z tempa 1/1,5/2 kg/mies.', () => {
  const st = plan({ sex: 'M', ageYears: 14, weightKg: 85, heightCm: 165, palInput: 1.4 });
  const needed = 19.2 * 1.65 ** 2;
  const reeAct = henryBoy10_17(85, 1.65);
  const base = reeAct * REE_ADJ * 1.4;
  it('stan: childObesityPlan, etap 12–18, kontekst na masie aktualnej z mnożnikiem 1; masa należna zostaje celem', () => {
    expect(st.childObesityPlan).toBe(true);
    expect(st.childPlanStage).toBe('age_12_18');
    expect(st.context.anthropometry.source).toBe('actual');
    expect(st.context.anthropometry.weightUsedKg).toBe(85);
    expect(st.context.energy.growthMultiplier).toBe(1);
    expect(st.reeKcal).toBeCloseTo(reeAct, 3);
    expect(st.reeAdjustedKcal).toBe(Math.round(reeAct * REE_ADJ));
    expect(st.neededWeightKg).toBeCloseTo(needed, 6);
    expect(st.maintenanceKcal).toBe(Math.round(base));
  });
  it('stabilizacja nie jest ukrytym deficytem: baza ≥ REE po korekcie i wyżej niż dawna baza od masy należnej', () => {
    expect(st.maintenanceKcal).toBeGreaterThan(Math.round(reeAct * REE_ADJ));
    expect(st.maintenanceKcal).toBeGreaterThan(Math.round(henryBoy10_17(needed, 1.65) * 1.4)); // dawne 2175 kcal
  });
  it('trzy diety: deficyt 253/379/506 kcal = 1 / 1,5 / 2 kg/mies., tempo zgodne z deklaracją', () => {
    expect(st.diets.map((d) => d.key)).toEqual(['light', 'moderate', 'intense']);
    expect(st.diets.map((d) => d.monthlyLossKg)).toEqual([1, 1.5, 2]);
    expect(st.diets.map((d) => d.deficit)).toEqual([1, 1.5, 2].map(defFor));
    expect(st.diets.map((d) => d.intake)).toEqual([1, 1.5, 2].map((r) => Math.round(base - defFor(r))));
    expect(st.diets[2].weeklyLoss).toBeCloseTo(defFor(2) * 7 / 7700, 6);
    expect(st.diets.every((d) => d.rateBased && !d.rateCapped)).toBe(true);
  });
  it('podłoga to max(1200 kcal, REE po korekcie) — żadna dieta nie schodzi poniżej spoczynkowej przemiany materii', () => {
    expect(st.floorKcal).toBe(Math.round(reeAct * REE_ADJ));
    expect(st.floorAbsoluteKcal ?? 1200).toBe(1200);
    expect(st.floorReeKcal).toBe(Math.round(reeAct * REE_ADJ));
    expect(Math.min(...st.diets.map((d) => d.intake))).toBeGreaterThanOrEqual(st.floorKcal);
  });
  it('preset nutrition_actual (normy) zachowuje ×1,01 i masę aktualną — zmiana dotyczy tylko planu', () => {
    const ctx = win.energyBuildContext({ preset: 'nutrition_actual', ageYears: 14, ageMonthsOpt: 0, sex: 'M', weightKg: 85, heightCm: 165, palInput: 1.6 });
    expect(ctx.energy.growthMultiplier).toBe(1.01);
    expect(ctx.anthropometry.weightUsedKg).toBe(85);
  });
  it('ENERGY-CHILD-MID1: chłopiec 14 l bez podanego PAL → silnik bierze tę samą wartość co formularz (1,4), koniec rozjazdu 14 %', () => {
    const s2 = plan({ sex: 'M', ageYears: 14, weightKg: 85, heightCm: 165, palInput: null });
    expect(s2.palUsed).toBe(win.energyDefaultPlanPal(14, 0));
    expect(s2.palUsed).toBe(1.4);
    // u dziecka bez nadwagi fallback pozostaje normatywny (stara ścieżka)
    expect(plan({ sex: 'M', ageYears: 10, weightKg: 33, heightCm: 140, palInput: null }).palUsed).toBe(1.6);
  });
});

describe('Etap 6–11 lat: < 99c tylko 0,5 kg/mies.; ≥ 99c 0,5 / 1 / 1,5 kg/mies.', () => {
  it('chłopiec 10 l, 145 cm, 55 kg (z < 2,33) → tylko lekka z tempem 0,5 kg/mies. (126 kcal), reszta z powodem', () => {
    const st = plan({ sex: 'M', ageYears: 10, weightKg: 55, heightCm: 145, palInput: 1.4 });
    const base = henryBoy10_17(55, 1.45) * REE_ADJ * 1.4;
    expect(st.childPlanStage).toBe('age_6_11');
    expect(st.bmiClass.overweight).toBe(true);
    expect(st.bmiClass.severe).toBe(false);
    expect(st.diets.map((d) => d.key)).toEqual(['light']);
    expect(st.diets[0].deficit).toBe(defFor(0.5));
    expect(st.diets[0].monthlyLossKg).toBe(0.5);
    expect(st.diets[0].intake).toBe(Math.round(base - defFor(0.5)));
    expect(st.diets[0].rateCapped).toBe(true);
    expect(st.dietUnavailable.moderate).toContain('0,5 kg/mies.');
    expect(st.dietUnavailable.intense).toContain('6–11 lat');
  });
  it('chłopiec 8 l, 130 cm, 45 kg (z ≥ 2,33) → trzy diety 0,5 / 1 / 1,5 kg/mies., podłoga z REE (> 1000 kcal)', () => {
    const st = plan({ sex: 'M', ageYears: 8, weightKg: 45, heightCm: 130, palInput: 1.4 });
    const ree = henryBoy3_9(45, 1.3);
    const base = ree * REE_ADJ * 1.4;
    expect(st.bmiClass.severe).toBe(true);
    expect(st.diets.map((d) => d.monthlyLossKg)).toEqual([0.5, 1, 1.5]);
    expect(st.diets.map((d) => d.deficit)).toEqual([0.5, 1, 1.5].map(defFor));
    expect(st.diets.map((d) => d.intake)).toEqual([0.5, 1, 1.5].map((r) => Math.round(base - defFor(r))));
    expect(st.floorKcal).toBe(Math.round(ree * REE_ADJ));
    expect(st.floorKcal).toBeGreaterThan(1000);
    expect(st.diets.every((d) => d.rateCapped === false)).toBe(true);
  });
  it('dziewczynka 7 l, 118 cm, 35 kg (z ≥ 2,33): trzy diety, każda powyżej REE po korekcie', () => {
    const st = plan({ sex: 'F', ageYears: 7, weightKg: 35, heightCm: 118, palInput: 1.4 });
    const ree = henryGirl3_9(35, 1.18);
    expect(st.bmiClass.severe).toBe(true);
    expect(st.diets.map((d) => d.key)).toEqual(['light', 'moderate', 'intense']);
    expect(st.floorKcal).toBe(Math.max(1000, Math.round(ree * REE_ADJ)));
    expect(Math.min(...st.diets.map((d) => d.intake))).toBeGreaterThanOrEqual(st.floorKcal);
  });
  it('dieta poniżej REE jest niedostępna z nazwanym powodem; poniżej minimum wieku — z powodem o minimum', () => {
    // wprost na silniku doboru diet: baza 1600 kcal, REE po korekcie 1400 → intensywna (−506) odpada przez REE
    const przezRee = win.proposeChildDietsFromBase(1700, 14, { severe: true }, 'age_12_18', 1400);
    expect(przezRee.floorKcal).toBe(1400);
    expect(przezRee.floorReeKcal).toBe(1400);
    expect(przezRee.diets.map((d) => d.key)).toEqual(['light']);
    expect(przezRee.unavailable.moderate).toContain('spoczynkowej przemiany materii');
    expect(przezRee.unavailable.intense).toContain('spoczynkowej przemiany materii');
    // bez REE (np. brak wzrostu) zostaje samo minimum wieku
    const przezMinimum = win.proposeChildDietsFromBase(1500, 14, { severe: true }, 'age_12_18', null);
    expect(przezMinimum.floorKcal).toBe(1200);
    expect(przezMinimum.unavailable.moderate).toContain('minimum 1200 kcal');
  });
});

describe('Etap 2–5 lat: bez diet (stabilizacja) i energia utrzymania dla masy aktualnej', () => {
  it('chłopiec 3 l, 98 cm, 20 kg → diets [], powody „2–5 lat", maintenanceKcal = REE(masa aktualna) × 0,9 × PAL, nie mniej niż 1000', () => {
    const st = plan({ sex: 'M', ageYears: 3, weightKg: 20, heightCm: 98, palInput: 1.4 });
    const base = henryBoy3_9(20, 0.98) * REE_ADJ * 1.4;
    expect(st.childObesityPlan).toBe(true);
    expect(st.childPlanStage).toBe('age_2_5');
    expect(st.diets).toEqual([]);
    expect(st.dietUnavailable.light).toContain('2–5 lat');
    expect(st.maintenanceKcal).toBe(Math.max(1000, Math.round(base)));
    expect(st.floorKcal).toBe(1000);
    expect(st.maintenanceKcal).toBeGreaterThanOrEqual(st.floorKcal); // podłoga działa też w gałęzi 2–5 lat
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
