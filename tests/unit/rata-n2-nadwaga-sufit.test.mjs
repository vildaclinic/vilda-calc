import { afterAll, describe, expect, it } from 'vitest';
import { oknoZSilnikiem, wczytajDoOkna } from '../support/silnik-bmi.mjs';

// P-DIETA rata N2 (decyzja właściciela 2026-09-24): przy SAMEJ NADWADZE (85.–97. centyl) u nastolatka 12–18 lat
//  • domyślna strategia: stabilizacja masy, póki dziecko rośnie (Mazur 2022, Nutrients 14:3806, doi:10.3390/nu14183806:
//    „Maintenance of a stable weight for more than 1 year might be an appropriate goal for those children with
//    overweight and mild obesity, because BMI will decrease as children gain height”);
//  • redukcja do wyboru z sufitem 0,5 / 1 / 1,5 kg/mies. (dawniej 1 / 1,5 / 2 jak przy otyłości), także po zakończeniu
//    wzrastania. Otyłość 12–18 lat i etap 6–11 lat bez zmian. Testy wołają PRAWDZIWY silnik. Dane FIKCYJNE.

const zapisane = {};
function ustawGlobal(k, v) { if (!(k in zapisane)) zapisane[k] = globalThis[k]; globalThis[k] = v; }
afterAll(() => { for (const k of Object.keys(zapisane)) { if (zapisane[k] === undefined) delete globalThis[k]; else globalThis[k] = zapisane[k]; } });
ustawGlobal('KCAL_PER_KG', 7700);
ustawGlobal('CHILD_AGE_MIN', 0.25);
ustawGlobal('vildaAppSetTrustedHtml', (el, html) => { el.innerHTML = html; });
ustawGlobal('vildaAppClearHtml', (el) => { el.innerHTML = ''; });

const win = wczytajDoOkna(oknoZSilnikiem(), 'vilda_diet_plan_ui.js');
const plan = (sex, ageYears, heightCm, weightKg) => win.energyBuildPlanReductionState({ sex, ageYears, ageMonthsOpt: 0, heightCm, weightKg, palInput: null });
const gorne = (st) => st.diets.map((d) => d.gornaKcal);
const tempo = (st) => st.diets.map((d) => d.monthlyLossKg);

describe('rata N2: sufit tempa przy samej nadwadze 12–18 lat', () => {
  it('stałe: nowy wiersz 0,5 / 1 / 1,5 kg/mies.; otyłość 12–18 i 6–11 bez zmian', () => {
    const R = win.DIET_RATE_CHILD_KG_MONTH;
    expect(R.age_12_18_nadwaga).toEqual({ light: 0.5, moderate: 1, intense: 1.5 });
    expect(R.age_12_18).toEqual({ light: 1, moderate: 1.5, intense: 2 });
    expect(R.age_6_11).toEqual({ light: 0.5 });
    expect(R.age_6_11_severe).toEqual({ light: 0.5, moderate: 1, intense: 1.5 });
  });

  it('przypadki z propozycji (górna granica dnia, kcal; tempo kg/mies.)', () => {
    const P = [
      [['M', 13, 155, 55], [2350, 2250, 2100]],
      [['M', 13, 155, 60], [2500, 2350, 2250]],
      [['F', 12, 152, 52], [2000, 1850, 1700]],
      [['F', 15, 162, 66], [2250, 2100, 1950]],
      [['M', 17, 178, 80], [3100, 2950, 2850]],
    ];
    for (const [p, oczek] of P) {
      const st = plan(...p);
      expect(st.bmiClass.overweight, p.join(' ')).toBe(true);
      expect(st.bmiClass.obese, p.join(' ')).toBe(false);
      expect(gorne(st), p.join(' ')).toEqual(oczek);
      expect(tempo(st), p.join(' ')).toEqual([0.5, 1, 1.5]);
      expect(st.diets.every((d) => d.tempoNadwagi === true && d.tempoSufit === true), p.join(' ')).toBe(true);
      expect(st.diets.map((d) => d.zalecana), p.join(' ')).toEqual([true, false, false]);
    }
  });

  it('otyłość 12–18 lat bez zmian (chłopiec z raportu raty U: ≤ 2 800 / 2 600 / 2 500, tempo 1 / 1,5 / 2, domyślna umiarkowana)', () => {
    const st = win.energyBuildPlanReductionState({ sex: 'M', ageYears: 15 + 3 / 12, ageMonthsOpt: 3, heightCm: 186.7, weightKg: 102.5, palInput: null });
    expect(st.bmiClass.obese).toBe(true);
    expect(tempo(st)).toEqual([1, 1.5, 2]);
    expect(st.diets.every((d) => d.tempoNadwagi === false)).toBe(true);
    expect(st.diets.map((d) => d.zalecana)).toEqual([false, true, false]);
  });

  it('nadwaga 6–11 lat bez zmian: tylko lekka 0,5 kg/mies.', () => {
    const st = plan('M', 10, 145, 50);
    expect(st.childPlanStage).toBe('age_6_11');
    expect(st.diets.map((d) => d.key)).toEqual(['light']);
    expect(tempo(st)).toEqual([0.5]);
    expect(st.diets[0].tempoNadwagi).toBe(false);
  });

  it('strategia domyślna: nadwaga 12–18 → stabilizacja; po „Wzrost zakończony”, przy praktycznie zakończonym wzrastaniu albo gdy dziecko nie zdąży wyrosnąć → redukcja; otyłość → redukcja', () => {
    const st = plan('M', 13, 155, 60);
    const ob = win.energyBuildPlanReductionState({ sex: 'M', ageYears: 15, ageMonthsOpt: 0, heightCm: 175, weightKg: 95, palInput: null });
    expect(win.energyResolveStrategy({ state: st, ageYears: 13 })).toBe('stabilization');
    expect(win.energyResolveStrategy({ state: st, ageYears: 13, growthEnded: true })).toBe('reduction');
    expect(win.energyResolveStrategy({ state: st, ageYears: 13, outlook: { practicallyEnded: true } })).toBe('reduction');
    expect(win.energyResolveStrategy({ state: st, ageYears: 13, stabDisabled: true })).toBe('reduction');
    expect(win.energyResolveStrategy({ state: ob, ageYears: 15 })).toBe('reduction');
  });

  it('opisy diet mówią o nadwadze, nie o „domyślnej przy otyłości”', () => {
    const st = plan('M', 13, 155, 60);
    const umiark = win.energyDietBulletsExtra('moderate', st).join(' ');
    const intens = win.energyDietBulletsExtra('intense', st).join(' ');
    expect(umiark).toContain('przy nadwadze');
    expect(umiark).toMatch(/1\u202Fkg\/mies\./);
    expect(umiark).not.toContain('z otyłością');
    expect(intens).toContain('górna granica tempa przy nadwadze');
    expect(intens).toMatch(/1,5\u202Fkg\/mies\./);
    const ob = win.energyBuildPlanReductionState({ sex: 'M', ageYears: 15, ageMonthsOpt: 0, heightCm: 175, weightKg: 95, palInput: null });
    expect(win.energyDietBulletsExtra('moderate', ob).join(' ')).toContain('dieta domyślna u nastolatka 12–18 lat z otyłością');
  });
});
