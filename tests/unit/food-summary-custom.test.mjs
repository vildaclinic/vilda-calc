import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../../vilda_food_summary.js', import.meta.url), 'utf8');
const catalogue = { example: { name: 'Jogurt przykładowy', kcal: 61, foodGroup: 'dairy' } };
const catalogRow = { querySelector: selector => ({ value: selector === 'select' ? 'example' : '2' }) };
const own = { id: 'own-sample', name: ' <Przykładowa pozycja> ', grams: '150,5', kcalPer100g: '200' };
const ownRow = { food: own, querySelector: () => null };

function load(rows = []) {
  const burn = [];
  const document = { querySelectorAll: () => rows };
  const window = {
    document, VildaFoodData: { foods: catalogue },
    VildaMacroPractice: { readCustomFoodRow: row => row.food ?? null },
    macroPracticeAnalyzeFoodSelection: () => ({
      macroLine: 'Białko 8 g', nutrients: { protein_g: 8, carbs_g: 10, fat_g: 6 },
    }),
    macroPracticeBuildTotalGoalShareParts: totals => ({
      energy: `Udział energii: ${totals.energy_kcal} kcal`, macros: ['Białko 18%'],
    }),
    VildaActivityBurn: {
      activityBuildFoodBurnState(input) { burn.push(input); return { rows: [] }; },
      activityRenderTableHtml: () => '',
    },
  };
  vm.runInNewContext(source, { window, document }, { filename: 'vilda_food_summary.js' });
  return { summary: window.VildaFoodSummary, burn };
}

describe('Własne pozycje posiłku', () => {
  it('normalizuje podane wartości bez dodawania makroskładników', () => {
    const { summary } = load();
    const item = summary.normalizeCustomFood({ ...own, id: ' own-sample ', protein_g: 12 });
    expect(item).toEqual({ id: own.id, name: '<Przykładowa pozycja>', grams: 150.5, kcalPer100g: 200 });
    expect(summary.buildCustomFoodItem(item)).toMatchObject({ kcal: 301, analysis: null, kind: 'custom' });
    expect(summary.buildCustomFoodItem({ ...own, kcalPer100g: '0' }).kcal).toBe(0);
  });

  it.each([
    { id: ' ' }, { name: '' }, { grams: '0' }, { grams: '-25' },
    { grams: '25g' }, { grams: Number.POSITIVE_INFINITY }, { kcalPer100g: '' },
    { kcalPer100g: false }, { kcalPer100g: '-0.01' }, { kcalPer100g: '20,5.1' },
    { grams: 1e300, kcalPer100g: 1e300 },
  ])('odrzuca niepełne lub nieprawidłowe dane %j', fields => {
    const { summary } = load();
    expect(summary.normalizeCustomFood({ ...own, ...fields })).toBeNull();
  });

  it('sumuje energię obu typów, zachowuje zakres sumy makro i używa wspólnego wyniku dla MET', () => {
    const { summary, burn } = load([catalogRow, ownRow]);
    expect(summary.calcTotal(catalogue)).toBe(423);
    const state = summary.buildState({ nutritionGoalsForFoods: {} });
    expect(state.kcal).toBe(423);
    expect(state.itemsWithMacrosCount).toBe(1);
    expect(state.totals).toEqual({ protein_g: 8, carbs_g: 10, fat_g: 6 });
    expect(state.flags).toMatchObject({ hasCustomFoods: true, macroTotalsArePartial: true });
    expect(state.html.totalKcalHtml).toContain('Makroskładniki pozycji z katalogu');
    expect(state.html.totalKcalHtml).toContain('Udział energii: 423 kcal');
    expect(state.html.totalKcalHtml).not.toContain('Białko 18%');
    expect(state.html.tableHtml).toContain('&lt;Przykładowa pozycja&gt;');
    expect(state.html.tableHtml).toContain('brak danych o makroskładnikach');
    summary.renderBurnSummary(state, { timesDiv: {} }, { weight: 46, age: 13 });
    expect(burn).toEqual([{ kcalTarget: 423, weightKg: 46, ageYears: 13 }]);
  });

  it('dla roboczego posiłku wyłącznie z własnych produktów pokazuje brak danych makro', () => {
    const { summary } = load();
    const state = summary.buildState({ items: [summary.buildCustomFoodItem(own)] });
    expect(state.kcal).toBe(301);
    expect(state.totals).toEqual({ protein_g: null, carbs_g: null, fat_g: null });
    expect(state.html.totalKcalHtml).toContain('brak danych dla pozycji własnych');
    expect(state.html.totalKcalHtml).not.toContain('Białko 0 g');
  });

  it('zachowuje dotychczasową prezentację posiłku z katalogu', () => {
    const { summary } = load([catalogRow]);
    const state = summary.buildState();
    expect(state.kcal).toBe(122);
    expect(state.flags).toEqual({ hasCompoundMeal: false });
    expect(state.html.totalKcalHtml).toContain('Procent dziennego celu do planowania diety');
    expect(state.html.totalKcalHtml).toContain('Białko 18%');
    expect(state.html.totalKcalHtml).not.toContain('pozycji z katalogu');
    expect(state.html.tableHtml).not.toContain('Pozycja własna');
  });
});
