import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = fs.readFileSync(path.join(repositoryRoot, 'inline_kalkulator_klirens_04.js'), 'utf8');
const pureEnd = source.indexOf('const refRanges =');
if (pureEnd < 0) throw new Error('Nie znaleziono granicy produkcyjnych funkcji obliczeniowych Klirensu.');
// Execute the actual leading production functions, before DOM event wiring.
// The test contains fixed independently audited results, never a second CG/BSA equation.
const mathWindow = {};
loadBrowserScript('clcr_saved_legacy_calculator.js', mathWindow);
const production = new Function('window', `${source.slice(0, pureEnd)}\nreturn { BSA_DuBois, clCrCG, clCrCGNormalized };`)(mathWindow);
const browser = {};
loadBrowserScript('clcr_clinical_safety.js', browser);
loadBrowserScript('clcr_calculation_assumptions.js', browser);
const ageStart = source.indexOf('function readClcrFormulaAge(');
const ageEnd = source.indexOf('function clcrCgNormalizedDetails(', ageStart);
if (ageStart < 0 || ageEnd <= ageStart) throw new Error('Nie znaleziono produkcyjnego adaptera wieku CG.');

function ageReader(fields) {
  const controls = new Map(Object.entries(fields).map(([id, value]) => [id, { value }]));
  const read = new Function('window', 'document', `${source.slice(ageStart, ageEnd)}\nreturn readClcrFormulaAge;`)(
    browser, { getElementById: id => controls.get(id) },
  );
  return { controls, read };
}

describe('Cockcroft–Gault na 1,73 m² — produkcyjny rachunek i ukończone lata', () => {
  it.each([
    { sex: 'M', age: 60, weight: 80, height: 175, scr: 1.2, bsa: 1.9560599156154188, value: 65.51340637632256, display: '66' },
    { sex: 'F', age: 60, weight: 80, height: 175, scr: 1.2, bsa: 1.9560599156154188, value: 55.68639541987418, display: '56' },
    { sex: 'M', age: 60, weight: 40, height: 175, scr: 1.2, bsa: 1.456949186404993, value: 43.9782489821599, display: '44' },
    { sex: 'M', age: 60, weight: 100, height: 175, scr: 1.2, bsa: 2.150645892536526, value: 74.48236166682872, display: '74' },
    { sex: 'M', age: 60, weight: 80, height: 150, scr: 1.2, bsa: 1.7492252226266187, value: 73.25994759881303, display: '73' },
    { sex: 'M', age: 18, weight: 80, height: 175, scr: 1.2, bsa: 1.9560599156154188, value: 99.90794472389192, display: '100' },
    { sex: 'M', age: 60, weight: 80, height: 175, scr: 0.2, bsa: 1.9560599156154188, value: 393.0804382579354, display: '393' },
  ])('odtwarza niezależny przypadek $sex/$age lat/$weight kg/$height cm/Scr $scr bez wczesnego zaokrąglania', fixture => {
    const bsa = production.BSA_DuBois(fixture.weight, fixture.height);
    expect(bsa).toBeCloseTo(fixture.bsa, 12);
    const value = production.clCrCGNormalized(fixture.sex, fixture.age, fixture.weight, fixture.scr, bsa);
    expect(value).toBeCloseTo(fixture.value, 11);
    expect(value.toFixed(0)).toBe(fixture.display);
  });

  it.each(['', '0', '6', '11'])('używa 60 ukończonych lat przy zapisanych miesiącach „%s”, zachowując źródłowy dokładny wiek', months => {
    const safety = browser.ClcrClinicalSafety;
    const age = safety.parseAge('60', months);
    expect(age.valid).toBe(true);
    const before = structuredClone(age);
    const value = production.clCrCGNormalized('M', age.exactYears, 80, 1.2, production.BSA_DuBois(80, 175));
    expect(value).toBeCloseTo(65.51340637632256, 11);
    expect(age).toEqual(before);
    if (months === '6') {
      expect(age.exactYears).toBe(60.5);
      // The original, non-indexed CG continues to accept the precise age.
      expect(production.clCrCG('M', age.exactYears, 80, 1.2)).toBeCloseTo(73.61111111111111, 11);
    }
    if (months === '11') expect(age.exactYears).toBeCloseTo(60.916666666666664, 12);
  });

  it('nie zaokrągla 60 lat i 11 miesięcy do 61 lat', () => {
    const bsa = production.BSA_DuBois(80, 175);
    const beforeBirthday = production.clCrCGNormalized('M', 60.916666666666664, 80, 1.2, bsa);
    const afterBirthday = production.clCrCGNormalized('M', 61, 80, 1.2, bsa);
    expect(beforeBirthday).toBeCloseTo(65.51340637632256, 11);
    expect(afterBirthday).not.toBeCloseTo(beforeBirthday, 8);
  });

  it.each(['6', '12', 'nieprawidłowy'])('adapter cg_norm pomija zapisane miesiące „%s”, ale nie nadpisuje wspólnej wartości', ageMonths => {
    const { read, controls } = ageReader({ formulaPicker: 'cg_norm', age: '60', ageMonths, ageDays: '' });
    expect(read('cg_norm')).toMatchObject({ valid: true, years: 60, months: 0, exactYears: 60 });
    expect(controls.get('ageMonths').value).toBe(ageMonths);
    controls.get('formulaPicker').value = 'cg';
    if (ageMonths === '6') {
      expect(read('cg')).toMatchObject({ valid: true, months: 6, exactYears: 60.5 });
    } else {
      expect(read('cg').valid).toBe(false);
    }
    expect(controls.get('ageMonths').value).toBe(ageMonths);
  });

  it.each([
    ['wiek poniżej 18', ['M', 17.999, 80, 1.2, 1.956]],
    ['brak wieku', ['M', Number.NaN, 80, 1.2, 1.956]],
    ['nieskończony wiek', ['M', Infinity, 80, 1.2, 1.956]],
    ['brak płci', ['', 60, 80, 1.2, 1.956]],
    ['nieznana płeć', ['X', 60, 80, 1.2, 1.956]],
    ['zerowa masa', ['M', 60, 0, 1.2, 1.956]],
    ['ujemna masa', ['M', 60, -80, 1.2, 1.956]],
    ['nieskończona masa', ['M', 60, Infinity, 1.2, 1.956]],
    ['zerowa kreatynina', ['M', 60, 80, 0, 1.956]],
    ['brak kreatyniny', ['M', 60, 80, Number.NaN, 1.956]],
    ['zerowa powierzchnia', ['M', 60, 80, 1.2, 0]],
    ['ujemna powierzchnia', ['M', 60, 80, 1.2, -1.956]],
    ['nieskończona powierzchnia', ['M', 60, 80, 1.2, Infinity]],
  ])('nie oblicza wyniku dla nieprawidłowych wejść: %s', (_label, input) => {
    expect(production.clCrCGNormalized(...input)).toBeNull();
  });

  it('domyślne założenia pozwalają liczyć, ale nie unieważniają znanego AKI lub szybkiej zmiany', () => {
    const assumptions = browser.VildaClcrCalculationAssumptions;
    const unknown = assumptions.resolve('cg_norm', { creatinineState: 'unknown', suspectedAKI: false });
    expect(unknown).toMatchObject({ allowed: true, provenance: { creatinineState: 'assumed', suspectedAKI: 'assumed' } });
    expect(unknown.assumptionsText).not.toMatch(/IDMS|IFCC/);
    for (const context of [{ suspectedAKI: true }, { creatinineState: 'rapidlyChanging' }]) {
      expect(assumptions.resolve('cg_norm', context).allowed).toBe(false);
    }
  });
});
