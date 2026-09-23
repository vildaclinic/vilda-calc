import { afterAll, describe, expect, it } from 'vitest';
import { oknoZSilnikiem, wczytajDoOkna } from '../support/silnik-bmi.mjs';

// P-DIETA rata U (decyzje właściciela 2026-09-23, po raporcie „3 000 kcal u 15-latka z otyłością”):
//  1. korekta REE × 0,9 wraca — tylko przy otyłości (≥ 97c) od 10 lat; to poprawka błędu równania
//     (Hofsteenge 2010 doi:10.3945/ajcn.2009.28330; Molnár 1995; White 2019), niezależna od PAL;
//  2. podstawa diety = zapotrzebowanie dla MASY DOCELOWEJ (85. centyl BMI) × PAL − 200/350/500 kcal
//     (Mazur 2022 doi:10.3390/nu14183806: „ideal body weight for the height … reduced by 200–500 kcal”),
//     nie więcej niż zapotrzebowanie aktualne (skorygowane) − ten sam deficyt; tempo nie szybsze niż
//     1/1,5/2 kg/mies. (sufit); podłoga = max(1200, REE skorygowane);
//  4. u 12–18 lat z otyłością dieta domyślna „umiarkowana”.
// P-DIETA rata V (2026-09-23) zastąpiła punkt 1: zamiast REE Henry'ego × 0,9 u otyłości od 10 lat liczy się
// równanie Molnára 1995 z podziałem na płeć (doi:10.1016/s0022-3476(95)70114-1) — oczekiwania poniżej są już
// liczbami raty V; punkty 2 i 4 raty U obowiązują bez zmian.
// PRAWDZIWY silnik (vilda_diet_plan_ui.js + vilda_bmi.js na tablicach OLAF). Dane FIKCYJNE.

const zapisane = {};
function ustawGlobal(k, v) { if (!(k in zapisane)) zapisane[k] = globalThis[k]; globalThis[k] = v; }
afterAll(() => { for (const k of Object.keys(zapisane)) { if (zapisane[k] === undefined) delete globalThis[k]; else globalThis[k] = zapisane[k]; } });
ustawGlobal('KCAL_PER_KG', 7700);
ustawGlobal('CHILD_AGE_MIN', 0.25);
ustawGlobal('vildaAppSetTrustedHtml', (el, html) => { el.innerHTML = html; });
ustawGlobal('vildaAppClearHtml', (el) => { el.innerHTML = ''; });
const win = wczytajDoOkna(oknoZSilnikiem(), 'vilda_diet_plan_ui.js');

const henryBoy10_17 = (w, hM) => 15.6 * w + 266 * hM + 299;
// wyrocznia z tabeli V Molnára 1995 (kJ/24 h → kcal), niezależna od pliku danych silnika
const molnar = (sex, w, hCm, age) => (sex === 'F' ? 51.2 * w + 24.5 * hCm - 207.5 * age + 1629.8 : 50.9 * w + 25.3 * hCm - 50.3 * age + 26.9) / 4.184;
const plan = (o) => win.energyBuildPlanReductionState({ ageMonthsOpt: 0, palInput: null, ...o });
const defFor = (kg) => Math.round(kg * 7700 / 30.4375); // 1 → 253; 1,5 → 379; 2 → 506
const r100 = (x) => Math.round(x / 100) * 100;

describe('rata U: chłopiec 15 l 3 mies., 102,5 kg / 186,7 cm (przypadek z raportu właściciela)', () => {
  const st = plan({ sex: 'M', ageYears: 15 + 3 / 12, ageMonthsOpt: 3, weightKg: 102.5, heightCm: 186.7 });
  const ree = henryBoy10_17(102.5, 1.867);
  const mol = molnar('M', 102.5, 186.7, 15 + 3 / 12);
  it('rata V: PAL 1,4 i REE Molnára działają osobno: REE Henry 2 395 → Molnár 2 199, zapotrzebowanie 3 079 kcal', () => {
    expect(st.palUsed).toBe(1.4);
    expect(st.reeRownanie.id).toBe('MOLNAR_1995');
    expect(st.reeKcal).toBeCloseTo(ree, 3);
    expect(st.reeAdjustedKcal).toBe(Math.round(mol));
    expect(st.reeAdjustedKcal).toBe(2199); // rata U: 2 155 (Henry × 0,9)
    expect(st.maintenanceKcal).toBe(Math.round(mol * 1.4));
    expect(st.maintenanceKcal).toBe(3079); // rata U: 3 017
    expect(st.floorKcal).toBe(Math.round(mol));
  });
  it('rata V: zapotrzebowanie dla masy docelowej (82,1 kg, 85c) TYM SAMYM równaniem (Molnár) i PAL: 2 731 kcal', () => {
    expect(st.targetWeightKg).toBeCloseTo(82.12, 2);
    expect(st.targetTeeKcal).toBe(Math.round(molnar('M', st.targetWeightKg, 186.7, 15 + 3 / 12) * 1.4));
    expect(st.targetTeeKcal).toBe(2731); // rata U: 2 907 (Henry)
  });
  it('diety: 2731 − 200/350/500 dawałoby tempo szybsze niż sufit → sufit 1/1,5/2 wiąże; 2 826 / 2 700 / 2 573 → górna granica 2 800 / 2 700 / 2 550', () => {
    const base = mol * 1.4;
    expect(st.diets.map((d) => d.key)).toEqual(['light', 'moderate', 'intense']);
    expect(st.diets.map((d) => d.deficytCeluKcal)).toEqual([200, 350, 500]);
    expect(st.diets.every((d) => d.bazaCeluKcal === 2731)).toBe(true);
    expect(st.diets.map((d) => d.tempoSufit)).toEqual([true, true, true]);
    expect(st.diets.map((d) => d.deficit)).toEqual([1, 1.5, 2].map(defFor));
    expect(st.diets.map((d) => d.intake)).toEqual([1, 1.5, 2].map((r) => Math.round(base - defFor(r))));
    expect(st.diets.map((d) => d.intake)).toEqual([2826, 2700, 2573]); // rata U: 2 764 / 2 638 / 2 511
    expect(st.diets.map((d) => d.gornaKcal)).toEqual([2800, 2700, 2550]); // rata V pkt 1: w dół do 50 kcal
    expect(st.diets.map((d) => d.monthlyLossKg)).toEqual([1, 1.5, 2]);
    expect(Math.min(...st.diets.map((d) => d.intake))).toBeGreaterThanOrEqual(st.floorKcal);
  });
  it('decyzja 4: dieta domyślna umiarkowana (12–18 lat, otyłość)', () => {
    expect(st.diets.map((d) => d.zalecana)).toEqual([false, true, false]);
  });
});

describe('rata U: sama nadwaga — bez korekty, PAL 1,6; podstawa od masy docelowej wiąże tylko tuż nad celem', () => {
  it('chłopiec 13 l, 155 cm, 60 kg (BMI 25,0, nadwaga): reeFactor 1, PAL 1,6; 6 kg nad celem → sufit tempa nadal wiąże', () => {
    const st = plan({ sex: 'M', ageYears: 13, weightKg: 60, heightCm: 155 });
    const tee = henryBoy10_17(60, 1.55) * 1.6;
    expect(st.bmiClass.overweight).toBe(true);
    expect(st.bmiClass.obese).toBe(false);
    expect(st.reeFactor).toBe(1);
    expect(st.palUsed).toBe(1.6);
    expect(st.maintenanceKcal).toBe(Math.round(tee));
    const teeT = henryBoy10_17(st.targetWeightKg, 1.55) * 1.6;
    expect(st.targetTeeKcal).toBe(Math.round(teeT));
    // 2 480 − 200 = 2 280 to deficyt 356 kcal (1,4 kg/mies.) > sufit 253 → dieta z sufitu: 2 383 / 2 257 / 2 130
    expect(tee - teeT).toBeGreaterThan(defFor(1) - 200);
    expect(st.diets.map((d) => d.tempoSufit)).toEqual([true, true, true]);
    expect(st.diets.map((d) => d.intake)).toEqual([1, 1.5, 2].map((r) => Math.round(tee - defFor(r))));
    expect(st.diets.map((d) => d.zalecana)).toEqual([true, false, false]); // lekka domyślna poza otyłością 12–18
  });
  it('chłopiec 13 l, 155 cm, 55 kg (ok. 1 kg nad celem 85c): lekka z podstawy masy docelowej − 200 (deficyt < sufitu), tempo < 1 kg/mies.', () => {
    const st = plan({ sex: 'M', ageYears: 13, weightKg: 55, heightCm: 155 });
    expect(st.childObesityPlan).toBe(true);
    expect(st.bmiClass.obese).toBe(false);
    const tee = henryBoy10_17(55, 1.55) * 1.6;
    const teeT = henryBoy10_17(st.targetWeightKg, 1.55) * 1.6;
    expect(55 - st.targetWeightKg).toBeLessThan(2.2);
    const lekka = st.diets[0];
    expect(lekka.tempoSufit).toBe(false);
    expect(lekka.intake).toBe(Math.round(teeT - 200));
    expect(lekka.deficit).toBe(Math.round(tee - lekka.intake));
    expect(lekka.deficit).toBeLessThan(defFor(1));
    expect(lekka.monthlyLossKg).toBeLessThan(1);
    expect(lekka.monthlyLossKg).toBe(Math.round(lekka.deficit * 30.4375 / 7700 * 100) / 100);
  });
});

describe('rata U/V: bramka wieku równania i strażnik minimalnego deficytu', () => {
  it('rata V: otyłość 11 lat → Molnár; otyłość 9 lat → Henry bez korekty; nadwaga 14 lat → Henry bez korekty', () => {
    const o11 = plan({ sex: 'M', ageYears: 11, weightKg: 65, heightCm: 150 });
    expect(o11.bmiClass.obese).toBe(true); expect(o11.reeRownanie.id).toBe('MOLNAR_1995');
    expect(o11.reeAdjustedKcal).toBe(Math.round(molnar('M', 65, 150, 11)));
    const o9 = plan({ sex: 'M', ageYears: 9, weightKg: 52, heightCm: 138 });
    expect(o9.bmiClass.obese).toBe(true); expect(o9.reeFactor).toBe(1); expect(o9.reeRownanie.id).toBe('HENRY_2005');
    expect(o9.reeAdjustedKcal).toBe(Math.round(o9.reeKcal));
    const n14 = plan({ sex: 'M', ageYears: 14, weightKg: 66, heightCm: 165 });
    expect(n14.bmiClass.overweight).toBe(true); expect(n14.bmiClass.obese).toBe(false); expect(n14.reeFactor).toBe(1);
    expect(n14.reeRownanie.id).toBe('HENRY_2005');
  });
  it('żadna dieta nie ma deficytu mniejszego niż 200/350/500 wobec zapotrzebowania aktualnego (skorygowanego) ani szybszego niż sufit', () => {
    const przypadki = [
      { sex: 'M', ageYears: 15 + 3 / 12, ageMonthsOpt: 3, weightKg: 102.5, heightCm: 186.7 },
      { sex: 'F', ageYears: 12, weightKg: 70, heightCm: 150 },
      { sex: 'F', ageYears: 17, weightKg: 75, heightCm: 165 },
      { sex: 'M', ageYears: 12, weightKg: 58, heightCm: 150 },
      { sex: 'F', ageYears: 16, weightKg: 90, heightCm: 160 },
    ];
    for (const p of przypadki) {
      const st = plan(p);
      expect(st.diets.length).toBe(3);
      for (const d of st.diets) {
        expect(d.deficit).toBeGreaterThanOrEqual(d.deficytCeluKcal - 1);
        expect(d.deficit).toBeLessThanOrEqual(defFor(d.sufitTempaKgMies));
        expect(d.intake).toBeGreaterThanOrEqual(st.floorKcal);
        expect(Math.abs(d.intake + d.deficit - st.maintenanceKcal)).toBeLessThanOrEqual(1);
      }
    }
  });
  it('6–11 lat < 99c: nadal tylko lekka z sufitem 0,5 kg/mies. (126 kcal) — decyzja 3 bez zmian', () => {
    const st = plan({ sex: 'M', ageYears: 10, weightKg: 55, heightCm: 145, palInput: 1.4 });
    expect(st.childPlanStage).toBe('age_6_11');
    expect(st.diets.map((d) => d.key)).toEqual(['light']);
    expect(st.diets[0].deficit).toBe(defFor(0.5));
    expect(st.diets[0].tempoSufit).toBe(true);
    expect(st.diets[0].rateCapped).toBe(true);
    expect(st.diets[0].zalecana).toBe(true);
  });
});
