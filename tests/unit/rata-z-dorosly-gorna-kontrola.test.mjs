import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { bezKomentarzy, oknoZSilnikiem, wczytajDoOkna } from '../support/silnik-bmi.mjs';

// P-DIETA rata Z (decyzje właściciela 2026-09-23): u DOROSŁEGO w redukcji (dieta lekka/umiarkowana/intensywna)
// i przy celu własnym kaloryczność to GÓRNA GRANICA dnia (w dół do 50 kcal, nie poniżej podłogi K 1200 / M 1600),
// a plan ma kontrolę za 6 tygodni (spodziewana masa przy samej diecie, próg = połowa ubytku, obniżka 100–200 kcal
// nie poniżej podłogi) — ta sama reguła co u dziecka bez wzrastania (rata V). Deficyt i tempo bez zmian.
// Tło: Lichtman 1992 doi:10.1056/NEJM199212313272701; Unick 2015 doi:10.1002/oby.21112;
// AHA/ACC/TOS 2013 doi:10.1161/01.cir.0000437739.71477.ee. Parametry kontroli to decyzja właściciela.
// Testy wołają PRAWDZIWE funkcje silnika. Dane FIKCYJNE.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const czytaj = (p) => fs.readFileSync(path.join(korzen, p), 'utf8');
const zapisane = {};
function ustawGlobal(k, v) { if (!(k in zapisane)) zapisane[k] = globalThis[k]; globalThis[k] = v; }
afterAll(() => { for (const k of Object.keys(zapisane)) { if (zapisane[k] === undefined) delete globalThis[k]; else globalThis[k] = zapisane[k]; } });
ustawGlobal('KCAL_PER_KG', 7700);
ustawGlobal('CHILD_AGE_MIN', 0.25);
ustawGlobal('vildaAppSetTrustedHtml', (el, html) => { el.innerHTML = html; });
ustawGlobal('vildaAppClearHtml', (el) => { el.innerHTML = ''; });

const win = wczytajDoOkna(oknoZSilnikiem(), 'vilda_diet_plan_ui.js');
const plan = (o) => win.energyBuildPlanReductionState({ ageMonthsOpt: 0, palInput: null, customGoalKg: null, ...o });
const DZIS = new Date(2026, 8, 23);
const K62 = { sex: 'F', ageYears: 62, weightKg: 78, heightCm: 158 };
const M47 = { sex: 'M', ageYears: 47, weightKg: 112, heightCm: 167 };

describe('rata Z: górna granica dnia u dorosłego', () => {
  it('K 62 l., 78 kg / 158 cm (BMI 31,2): 1 595 / 1 464 / 1 314 → ≤ 1 550 / ≤ 1 450 / ≤ 1 300 (dawniej umiarkowana „1 500”)', () => {
    const st = plan(K62);
    expect(st.isChild).toBe(false);
    expect(st.diets.map((d) => [d.key, d.intake, d.gornaKcal, d.gornaGranica, d.floorKcal])).toEqual([
      ['light', 1595, 1550, true, 1200], ['moderate', 1464, 1450, true, 1200], ['intense', 1314, 1300, true, 1200],
    ]);
    // deficyt i tempo liczone od podaży silnika — bez zmian
    const um = st.diets.find((d) => d.key === 'moderate');
    expect(um.deficit).toBe(413);
    // tempo z niezaokrąglonego deficytu silnika (412,8 kcal) — ok. 0,38 kg/tydz.
    expect(Math.abs(um.weeklyLoss * 7700 / 7 - um.deficit)).toBeLessThan(0.5);
    expect(um.weeklyLoss).toBeCloseTo(0.375, 3);
  });
  it('M 47 l., 112 kg / 167 cm (BMI 40,2): ≤ 2 400 / ≤ 2 200 / ≤ 2 000; podłoga 1 600', () => {
    const st = plan(M47);
    expect(st.diets.map((d) => [d.intake, d.gornaKcal, d.floorKcal])).toEqual([[2431, 2400, 1600], [2231, 2200, 1600], [2002, 2000, 1600]]);
  });
  it('w dół do 50 kcal i nigdy poniżej podłogi', () => {
    expect(win.energyGornaGranicaKcal(1649, 1600)).toBe(1600);
    expect(win.energyGornaGranicaKcal(1210, 1200)).toBe(1200);
    for (const o of [K62, M47, { sex: 'F', ageYears: 75, weightKg: 70, heightCm: 150 }, { sex: 'M', ageYears: 70, weightKg: 92, heightCm: 170 }]) {
      for (const d of plan(o).diets) {
        expect(d.gornaKcal).toBe(Math.floor(d.intake / 50) * 50);
        expect(d.gornaKcal).toBeGreaterThanOrEqual(d.floorKcal);
        expect(d.gornaKcal).toBeLessThanOrEqual(d.intake);
      }
    }
  });
  it('cel własny dorosłego (K 40 l., 66 kg / 165 cm, BMI 24,2, cel 62 kg): dieta lekka z górną granicą', () => {
    const st = plan({ sex: 'F', ageYears: 40, weightKg: 66, heightCm: 165, customGoalKg: 62 });
    expect(st.customGoal && st.customGoal.active).toBe(true);
    expect(st.diets).toHaveLength(1);
    const d = st.diets[0];
    expect(d).toMatchObject({ key: 'light', customGoal: true, gornaGranica: true, floorKcal: 1200 });
    expect(d.gornaKcal).toBe(Math.floor(d.intake / 50) * 50);
  });
  it('dziecko bez zmian: 17-latek z nadwagą ma wiersze planu dziecka, nie dorosłego', () => {
    const st = plan({ sex: 'M', ageYears: 17, weightKg: 85, heightCm: 178 });
    expect(st.isChild).toBe(true);
  });
});

describe('rata Z: kontrola za 6 tygodni u dorosłego', () => {
  it('K 62 l., umiarkowana: 4 XI 2026, ok. 75,7 kg, próg 76,9 kg, po obniżce 1 250–1 350 kcal; bez wzrastania', () => {
    const st = plan(K62);
    const k = win.energyKontrolaPlanu(st.diets.find((d) => d.key === 'moderate'), { weightKg: 78, sex: 'F', ageYears: 62, heightCm: 158, dzis: DZIS });
    expect(k).toMatchObject({
      tygodnie: 6, terminISO: '2026-11-04', terminKrotki: '4 XI', masaDzisKg: 78, masaSpodziewanaKg: 75.7, progKg: 76.9,
      przyrostKg: 0, wzrastanie: false, gornaKcal: 1450, obnizkaKcal: [100, 200], obnizkaMozliwa: true, podazPoObnizceKcal: [1250, 1350],
    });
  });
  it('M 47 l., umiarkowana: ok. 108,6 kg, próg 110,3 kg, po obniżce 2 000–2 100 kcal', () => {
    const k = win.energyKontrolaPlanu(plan(M47).diets.find((d) => d.key === 'moderate'), { weightKg: 112, sex: 'M', ageYears: 47, heightCm: 167, dzis: DZIS });
    expect(k).toMatchObject({ tygodnie: 6, masaSpodziewanaKg: 108.6, progKg: 110.3, podazPoObnizceKcal: [2000, 2100], obnizkaMozliwa: true });
  });
  it('podłoga z wiersza diety (bez floorKcal w opcjach): obniżka nie schodzi poniżej 1 200 kcal, a gdy nie ma miejsca — „plan do omówienia”', () => {
    const w1 = { intake: 1320, gornaKcal: 1300, gornaGranica: true, floorKcal: 1200, weeklyLoss: 0.3 };
    expect(win.energyKontrolaPlanu(w1, { weightKg: 80, dzis: DZIS })).toMatchObject({ obnizkaMozliwa: true, podazPoObnizceKcal: [1200, 1200] });
    const w2 = { intake: 1260, gornaKcal: 1250, gornaGranica: true, floorKcal: 1200, weeklyLoss: 0.3 };
    expect(win.energyKontrolaPlanu(w2, { weightKg: 80, dzis: DZIS }).obnizkaMozliwa).toBe(false);
  });
});

describe('rata Z: strażnicy źródeł', () => {
  const gen = bezKomentarzy(czytaj('vilda_diet_recommendations.js'));
  const journey = czytaj('vilda_bmi_journey.js');
  it('dane zaleceń przepuszczają kontrolę dorosłego (bez dawnego „q.dorosly?null”)', () => {
    expect(gen).not.toContain('(q.dorosly?null:z.kontrola)');
    expect(gen).toContain('(z.kontrola)');
  });
  it('generator dorosłego: „nie więcej niż … kcal dziennie — to górna granica dnia” i kontrola z silnika', () => {
    expect(gen).toContain('let gG0,kDor;');
    expect(gen).toContain('podazZaokrKcal:gG0?Number(s.gornaKcal)');
    expect(gen).toMatch(/kDor=\(\)=>\{if\(!gG0\|\|typeof energyKontrolaPlanu!="function"\)return;const kt=energyKontrolaPlanu\(s,\{weightKg:o,floorKcal:s\.floorKcal,sex:a,ageYears:t,heightCm:d\}\)/);
  });
  it('karta drogi: górna granica i kontrola także u dorosłego (dziecko nadal tylko z planem otyłości, bez celu własnego)', () => {
    expect(journey).toContain('return ctx.isChild ? !ctx.customGoal && !!(lastEngineState && lastEngineState.childObesityPlan) : true;');
  });
});
