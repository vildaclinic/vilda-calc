import { afterAll, describe, expect, it } from 'vitest';
import { oknoZSilnikiem, wczytajDoOkna } from '../support/silnik-bmi.mjs';

// ENERGY-REC-2 (decyzja właściciela 2026-09-12): jedna prognoza wzrastania (energyChildGrowthOutlook),
// jeden resolver strategii (energyResolveStrategy), symulacja przy tempie 0 (stabilizacja) i opisy diet
// wg klasy BMI. Brak medianHeightForAgeMonths (jak w izolowanym module) → tabela wiekowa wg płci.
// P-DIETA-SILNIK: klasa BMI (także przy źródle Palczewskiej) pochodzi z PRAWDZIWEGO silnika
// vilda_bmi.js na PRAWDZIWYCH tablicach — koniec atrap getLMS / bmiPercentileChildPal / getPalCentile.
// Dane FIKCYJNE.

const zapisane = {};
function ustawGlobal(k, v) { if (!(k in zapisane)) zapisane[k] = globalThis[k]; globalThis[k] = v; }
afterAll(() => {
  for (const k of Object.keys(zapisane)) {
    if (zapisane[k] === undefined) delete globalThis[k]; else globalThis[k] = zapisane[k];
  }
});

/** Źródło siatek tylko na czas jednego wywołania — moduł czyta globalne `bmiSource` jak w przeglądarce. */
function zZrodlem(zr, fn) {
  const bylo = 'bmiSource' in globalThis, poprzednie = globalThis.bmiSource;
  globalThis.bmiSource = zr;
  try { return fn(); } finally { if (bylo) globalThis.bmiSource = poprzednie; else delete globalThis.bmiSource; }
}

ustawGlobal('KCAL_PER_KG', 7700);
ustawGlobal('CHILD_AGE_MIN', 0.25);
// cel BMI stały (22) zamiast app.js — ten plik pyta o RÓŻNICĘ „z wzrastaniem vs bez", nie o wartość
// celu; cel z siatek sprawdza tests/unit/energy-dziecko-otylosc.test.mjs wprost na silniku.
ustawGlobal('toNormalBMITarget', () => 22);
const win = wczytajDoOkna(oknoZSilnikiem(), 'vilda_diet_plan_ui.js');
const T = win.VildaBmi;

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
  const st = (stage, severe = false, obese = severe) => ({ childObesityPlan: true, childPlanStage: stage, bmiClass: { severe, obese } });
  it('dorosły / wzrost zakończony → redukcja niezależnie od wyboru', () => {
    expect(win.energyResolveStrategy({ state: st('age_12_18'), ageYears: 25, stabChecked: true })).toBe('reduction');
    expect(win.energyResolveStrategy({ state: st('age_12_18'), ageYears: 14, growthEnded: true, stabChecked: true })).toBe('reduction');
  });
  it('jawny wybór użytkownika wygrywa; stabilizacja tylko gdy nie zablokowana', () => {
    expect(win.energyResolveStrategy({ state: st('age_6_11'), ageYears: 8, reduceChecked: true })).toBe('reduction');
    expect(win.energyResolveStrategy({ state: st('age_12_18'), ageYears: 14, stabChecked: true })).toBe('stabilization');
    expect(win.energyResolveStrategy({ state: st('age_12_18'), ageYears: 14, stabChecked: true, stabDisabled: true })).toBe('reduction');
  });
  // P-DIETA rata N2 (2026-09-24): 12–18 lat — sama nadwaga domyślnie stabilizacja, otyłość redukcja
  it('domyślnie: 2–5 stabilizacja (nawet przy blokadzie), 6–11 < 99c stabilizacja, ≥ 99c redukcja; 12–18: nadwaga stabilizacja, otyłość redukcja; praktycznie zakończone wzrastanie → redukcja', () => {
    expect(win.energyResolveStrategy({ state: st('age_2_5'), ageYears: 4, stabDisabled: true })).toBe('stabilization');
    expect(win.energyResolveStrategy({ state: st('age_6_11'), ageYears: 8 })).toBe('stabilization');
    expect(win.energyResolveStrategy({ state: st('age_6_11', true), ageYears: 8 })).toBe('reduction');
    expect(win.energyResolveStrategy({ state: st('age_12_18', false, true), ageYears: 14 })).toBe('reduction');
    expect(win.energyResolveStrategy({ state: st('age_12_18'), ageYears: 14 })).toBe('stabilization');
    expect(win.energyResolveStrategy({ state: st('age_12_18'), ageYears: 14, growthEnded: true })).toBe('reduction');
    expect(win.energyResolveStrategy({ state: st('age_12_18'), ageYears: 16, outlook: { practicallyEnded: true } })).toBe('reduction');
    expect(win.energyResolveStrategy({ state: st('age_12_18'), ageYears: 14, stabDisabled: true })).toBe('reduction');
    expect(win.energyResolveStrategy({ state: st('age_12_18'), ageYears: 14, reduceChecked: true })).toBe('reduction');
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
    expect(T.ocen({ bmi: 45 / 1.3 ** 2, plec: 'M', wiekMies: 96, zrodlo: 'OLAF' }).centyl).toBeGreaterThanOrEqual(99);
    expect(severe.bmiClass.severe).toBe(true);
    expect(win.energyDietBulletsExtra('light', severe)[0]).toContain('etap wstępny');
    const adult = win.energyBuildPlanReductionState({ ageYears: 35, ageMonthsOpt: 0, sex: 'M', weightKg: 105, heightCm: 175, palInput: 1.4 });
    expect(win.energyDietBulletsExtra('light', adult)[0]).toContain('etap wstępny');
    const ow = win.energyBuildPlanReductionState({ ageYears: 40, ageMonthsOpt: 0, sex: 'M', weightKg: 85, heightCm: 178, palInput: 1.4 });
    expect(win.energyDietBulletsExtra('light', ow)[0]).toContain('niewielką nadwagą');
    // rata U: u dziecka z planem otyłości ogon „umiarkowanej” mówi o tempie z wiersza diety (6–11 lat ≥ 99c: 1 kg/mies.), nie o procentach TEE dorosłych
    const um = win.energyDietBulletsExtra('moderate', severe);
    expect(um[0]).toContain('nie szybciej niż ok.\u202F1\u202Fkg/mies.');
    expect(um[0]).not.toContain('WHO i CDC');
    expect(um[1]).toBe(win.DIET_BULLETS.moderate[3]);
    expect(win.energyDietBulletsExtra('moderate', adult)).toEqual(win.DIET_BULLETS.moderate.slice(2)); // dorosły bez zmian
  });
});

describe('Klasa BMI przy źródle Palczewskiej — wszystko z silnika, cel P85 po skali z', () => {
  const przyZrodle = (zr, pacjent) => zZrodlem(zr, () => win.energyChildBmiClass(pacjent));
  it('chłopiec 10 l, 145 cm: 45 kg → nadwaga bez otyłości, 55 kg → otyłość; masa należna z mediany Palczewskiej', () => {
    const lekki = { sex: 'M', ageYears: 10, weightKg: 45, heightCm: 145 };
    const c = przyZrodle('PALCZEWSKA', lekki);
    const r = T.ocen({ bmi: 45 / 1.45 ** 2, plec: 'M', wiekMies: 120, zrodlo: 'PALCZEWSKA' });
    expect(c.source).toBe('PALCZEWSKA');
    expect(c.overweight).toBe(true);
    expect(c.obese).toBe(false);
    expect(c.z).toBeCloseTo(r.sds, 9);
    expect(c.percentile).toBeCloseTo(r.centyl, 9);
    expect(c.medianBmi).toBeCloseTo(r.mediana, 9);
    expect(c.neededWeightKg).toBeCloseTo(r.mediana * 1.45 ** 2, 9);
    expect(przyZrodle('PALCZEWSKA', { ...lekki, weightKg: 55 }).obese).toBe(true);
  });
  it('cel leczenia to 85. centyl interpolowany po skali z (tablice Palczewskiej nie mają p85), nie liniowo po numerach centyli', () => {
    const c = przyZrodle('PALCZEWSKA', { sex: 'M', ageYears: 10, weightKg: 45, heightCm: 145 });
    const cel = T.celNormy({ wiekMies: 120, wzrostCm: 145, plec: 'M', zrodlo: 'PALCZEWSKA' });
    expect(cel.siatka).toBe('PALCZEWSKA');
    expect(c.targetBmi).toBeCloseTo(cel.bmiCel, 9);
    expect(c.targetWeightKg).toBeCloseTo(cel.masaCel, 9);
    const p75 = T.wartoscDlaCentyla({ centyl: 75, plec: 'M', wiekMies: 120, zrodlo: 'PALCZEWSKA' }).bmi;
    const p90 = T.wartoscDlaCentyla({ centyl: 90, plec: 'M', wiekMies: 120, zrodlo: 'PALCZEWSKA' }).bmi;
    expect(c.targetBmi).toBeGreaterThan(p75);
    expect(c.targetBmi).toBeLessThan(p90);
    expect(c.targetBmi).toBeLessThan(p75 + (p90 - p75) * (85 - 75) / (90 - 75)); // liniowo po centylach byłoby wyżej
  });
  it('powrót do OLAF zmienia siatkę i wynik — źródło nie zostaje przyklejone do modułu', () => {
    const pacjent = { sex: 'M', ageYears: 10, weightKg: 55, heightCm: 145 };
    const pal = przyZrodle('PALCZEWSKA', pacjent);
    const olaf = przyZrodle('OLAF', pacjent);
    expect(olaf.source).toBe('OLAF');
    expect(olaf.z).toBeCloseTo(T.ocen({ bmi: 55 / 1.45 ** 2, plec: 'M', wiekMies: 120, zrodlo: 'OLAF' }).sds, 9);
    expect(olaf.z).not.toBeCloseTo(pal.z, 2);
    expect(olaf.medianBmi).not.toBeCloseTo(pal.medianBmi, 3);
  });
  it('stan planu bierze tę samą masę należną, co klasa BMI (jedna mediana, nie dwie)', () => {
    zZrodlem('PALCZEWSKA', () => {
      const c = win.energyChildBmiClass({ sex: 'M', ageYears: 10, weightKg: 55, heightCm: 145 });
      const st = win.energyBuildPlanReductionState({ ageYears: 10, ageMonthsOpt: 0, sex: 'M', weightKg: 55, heightCm: 145, palInput: 1.4 });
      expect(st.neededWeightKg).toBeCloseTo(c.neededWeightKg, 9);
      expect(st.targetWeightKg).toBeCloseTo(c.targetWeightKg, 9);
    });
  });
});
