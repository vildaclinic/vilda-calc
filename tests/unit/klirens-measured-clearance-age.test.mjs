import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const source = readFileSync(new URL('../../inline_kalkulator_klirens_04.js', import.meta.url), 'utf8');
const adapterSource = source.slice(source.indexOf('function readCl24CalculationInput()'), source.indexOf('function clcrMeasuredClearanceDetails('));
const ageSource = source.slice(source.indexOf('function readClcrFormulaAge('), source.indexOf('function clcrCgNormalizedDetails('));
const bsaSource = source.slice(source.indexOf('function BSA_DuBois('), source.indexOf('function clCrCG('));

function runtime(overrides = {}) {
  const browser = {};
  for (const file of [
    'clcr_clinical_safety.js', 'clcr_extended_egfr.js',
    'clcr_measured_clearance_reference_data.js', 'clcr_measured_clearance_reference.js',
  ]) loadBrowserScript(file, browser);
  const values = {
    formulaPicker: 'cl24', age: '', ageMonths: '', ageDays: '', sex: '',
    weight: '7', height: '65', Scr: '1', ScrUnit: 'mg/dl', Ucr: '100', V24: '1440',
    Cl24DurationHours: '24', ...overrides,
  };
  const controls = Object.fromEntries(Object.entries(values).map(([id, value]) => [id, { value }]));
  const document = { getElementById: id => controls[id] || null };
  const context = { window: browser, document, $: document.getElementById };
  vm.createContext(context);
  vm.runInContext(bsaSource + ageSource + adapterSource, context);
  return {
    controls, safety: browser.ClcrClinicalSafety,
    read() {
      const input = context.readCl24CalculationInput();
      const calculation = browser.ClcrClinicalSafety.computeTimedCreatinineClearance(input);
      return { input, calculation, reference: context.clcrMeasuredReferenceContext(input, calculation) };
    },
  };
}

describe('CL24 — jawny wiek 0 i brak wieku mają różne znaczenie', () => {
  it('brak wieku pozostaje brakiem danych i nie staje się zerem', () => {
    const app = runtime();
    const { input, calculation, reference } = app.read();
    expect(input).toMatchObject({ ageYears: null, ageEligibilityOnly: false, bsaM2: null });
    expect(calculation).toMatchObject({ ok: true, absoluteMlMin: 100 });
    expect(reference).toMatchObject({ reasonCode: 'missing-age', available: false });
    expect(reference.missingFieldIds).toContain('age');
  });

  it('0 pełnych lat bez miesięcy wystarcza do komunikatu poniżej zakresu wieku źródła', () => {
    const app = runtime({ age: '0' });
    const { input, calculation, reference } = app.read();
    expect(input).toMatchObject({ ageYears: 0, ageEligibilityOnly: true, bsaM2: null, bsaMethod: '' });
    expect(calculation).toMatchObject({ ok: true, absoluteMlMin: 100, indexedMlMin173: null });
    expect(reference).toMatchObject({ reasonCode: 'out-of-age', available: false, missingFields: [], missingFieldIds: [] });
    expect(app.controls.ageMonths.value).toBe('');
    expect(app.safety.parseAge('0', '').valid).toBe(false);
  });

  it.each([['0', 0], ['6', 0.5], ['11', 11 / 12]])('jawne %s miesięcy zachowuje rzeczywisty wiek bez fallbacku', (months, expectedAge) => {
    const app = runtime({ age: '0', ageMonths: months });
    const { input, reference } = app.read();
    expect(input.ageYears).toBe(expectedAge);
    expect(input.ageEligibilityOnly).toBe(false);
    expect(input.bsaM2).toBeGreaterThan(0);
    expect(reference).toMatchObject({ reasonCode: 'out-of-age', missingFields: [] });
    expect(app.controls.ageMonths.value).toBe(months);
  });

  it.each(['-1', '12', 'x'])('nie zastępuje sprzecznych miesięcy %s zerem', (months) => {
    const { input, reference } = runtime({ age: '0', ageMonths: months }).read();
    expect(input).toMatchObject({ ageYears: null, ageEligibilityOnly: false, bsaM2: null });
    expect(reference.available).toBe(false);
    expect(reference.missingFields).toContain('ageYears');
  });

  it('przejście od pacjenta 0 lat do pacjenta bez wieku nie dziedziczy komunikatu pediatrycznego', () => {
    const app = runtime({ age: '0' });
    expect(app.read().reference.reasonCode).toBe('out-of-age');
    app.controls.age.value = '';
    const { input, calculation, reference } = app.read();
    expect(input).toMatchObject({ ageYears: null, ageEligibilityOnly: false });
    expect(calculation.absoluteMlMin).toBe(100);
    expect(reference.reasonCode).toBe('missing-age');
    expect(reference.missingFieldIds).toContain('age');
  });

  it('ukończenie 3 lat uruchamia źródłowe porównanie, bez pytań o płeć ani miesiące', () => {
    const app = runtime({ age: '3', weight: '15', height: '95' });
    const { input, reference } = app.read();
    expect(input).toMatchObject({ ageYears: 3, ageEligibilityOnly: false, bsaMethod: 'Haycock' });
    expect(reference).toMatchObject({ available: true, missingFields: [], selectedBand: { minimumAgeInclusive: 3, maximumAgeExclusive: 19, sexRequired: false } });
    expect(app.controls.ageMonths.value).toBe('');
  });
});
