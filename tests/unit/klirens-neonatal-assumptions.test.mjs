import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
for (const file of ['clcr_calculation_assumptions.js', 'clcr_clinical_safety.js']) {
  loadBrowserScript(file, browser);
}
const assumptions = browser.VildaClcrCalculationAssumptions;
const safety = browser.ClcrClinicalSafety;
const formulaId = 'neonatal_egfr';
const approvedCopy = 'Założenia obliczenia: brak podejrzenia AKI i kreatynina standaryzowana do IDMS.';

function resolveAndCompute(context = {}, population = {}, days = 14) {
  const resolved = assumptions.resolve(formulaId, context);
  const effective = resolved.calculationContext;
  const clinical = { termStatus: 'term', bodyWeightKg: 3.5, scrAssay: effective.scrAssay, creatinineStandardization: effective.creatinineStandardization, ...population };
  const eligibility = safety.formulaSafety(formulaId, safety.parseAge(0, 0, days), effective.markerPolicy, clinical);
  const value = resolved.allowed && eligibility.eligible ? safety.computeNeonatalEgfr({
    termBorn: clinical.termStatus === 'term', bodyWeightKg: clinical.bodyWeightKg,
    daysOfLife: days, heightCm: 50, creatinineMgDl: 0.5,
  }) : null;
  return { resolved, eligibility, value };
}

describe('Klirens neonatal — pięć danych i jawne założenie IDMS', () => {
  it.each(['', 'unknown', 'not_idms', 'not_standardized', 'other', 'idms'])('metoda %j pozwala obliczyć31 bez zamiany źródłowej techniki na enzymatyczną', scrAssay => {
    const source = { scrAssay, creatinineState: 'unknown', suspectedAKI: false };
    const before = structuredClone(source);
    const { resolved, eligibility, value } = resolveAndCompute(source);
    expect(value).toBe(31);
    expect(eligibility.eligible).toBe(true);
    expect(resolved).toMatchObject({
      allowed: true, blockers: [], assumptionsText: approvedCopy,
      calculationContext: {
        scrAssay, presentationAssay: 'idms', creatinineStandardization: 'IDMS',
        creatinineState: 'unknown', suspectedAKI: false,
        markerPolicy: { calculationAllowed: true, categoryAllowed: false, status: 'unknown' },
      },
      provenance: { creatinineState: 'not_applicable', suspectedAKI: 'assumed', creatinineStandardization: 'assumed' },
    });
    expect(resolved.assumptions.map(entry => entry.id)).toEqual(['noSuspectedAKI', 'idms']);
    expect(source).toEqual(before);
    expect(Object.isFrozen(source)).toBe(false);
  });

  it('zachowuje podany enzymatic_idms i stabilność jako fakty, bez deklaracji stałego neonatalnego GFR', () => {
    const source = { scrAssay: 'enzymatic_idms', creatinineState: 'stable' };
    const { resolved, value } = resolveAndCompute(source);
    expect(value).toBe(31);
    expect(resolved.calculationContext).toMatchObject({ scrAssay: 'enzymatic_idms', presentationAssay: 'enzymatic_idms', creatinineState: 'stable', markerPolicy: { status: 'stable', categoryAllowed: false } });
    expect(resolved.provenance).toMatchObject({ creatinineState: 'provided', creatinineStandardization: 'provided' });
    expect(resolved.assumptions.map(entry => entry.id)).toEqual(['noSuspectedAKI']);
    expect(resolved.assumptionsText).toBe(approvedCopy);
    expect(resolved.assumptionsText).not.toContain('stabilna');
    expect(source).toEqual({ scrAssay: 'enzymatic_idms', creatinineState: 'stable' });
  });

  it('rozpoznaje podany standard IDMS bez dopisywania techniki', () => {
    const source = { scrAssay: '', creatinineStandardization: 'IDMS' };
    const { resolved, value } = resolveAndCompute(source);
    expect(value).toBe(31);
    expect(resolved.provenance.creatinineStandardization).toBe('provided');
    expect(resolved.calculationContext).toMatchObject({ scrAssay: '', presentationAssay: 'idms' });
    expect(source).toEqual({ scrAssay: '', creatinineStandardization: 'IDMS' });
  });

  it.each(['jaffe', 'jaffe_idms', 'JAFFE-IDMS', 'jaffe_non_idms'])('zapisany Jaffe %s pozostaje blokadą mimo założenia IDMS', scrAssay => {
    const source = { scrAssay, creatinineState: 'unknown' };
    const { resolved, eligibility, value } = resolveAndCompute(source);
    expect(value).toBeNull();
    expect(resolved.allowed).toBe(false);
    expect(resolved.assumptionsText).toBe('');
    expect(resolved.blockers.map(entry => entry.code)).toContain('NEONATAL_CREATININE_METHOD_UNSUPPORTED');
    expect(eligibility.eligible).toBe(false);
    expect(safety.formulaSafety(formulaId, safety.parseAge(0, 0, 14), safety.creatininePolicy('stable', false), { termStatus: 'term', bodyWeightKg: 3.5, scrAssay }).eligible).toBe(false);
    expect(source).toEqual({ scrAssay, creatinineState: 'unknown' });
  });

  it.each([
    { scrAssay: 'non_idms' }, { scrAssay: 'non-IDMS' },
    { scrAssay: 'enzymatic_non_idms' }, { scrAssay: 'jaffe_non_idms' },
    { scrAssay: '', creatinineStandardization: 'non_idms' },
    { scrAssay: 'enzymatic_idms', creatinineStandardization: 'not_standardized_to_idms' },
  ])('jawnie niezgodny standard %j ma pierwszeństwo nad założeniem i potwierdzeniem', context => {
    const source = { ...context, crCysStandardizationConfirmed: true };
    const before = structuredClone(source);
    const { resolved, value } = resolveAndCompute(source);
    expect(value).toBeNull();
    expect(resolved.allowed).toBe(false);
    expect(resolved.blockers.map(entry => entry.code)).toContain('CREATININE_STANDARDIZATION_INCOMPATIBLE');
    expect(resolved.provenance.creatinineStandardization).toBe('provided');
    expect(resolved.assumptionsText).toBe('');
    expect(source).toEqual(before);
    const directSafety = safety.formulaSafety(formulaId, safety.parseAge(0, 0, 14), safety.creatininePolicy('stable', false), { termStatus: 'term', bodyWeightKg: 3.5, ...context });
    expect(directSafety.eligible).toBe(false);
  });

  it.each([
    { suspectedAKI: true }, { creatinineState: 'rapidlyChanging' },
    { markerPolicy: { calculationAllowed: false, status: 'blocked', message: 'Znana blokada.' } },
  ])('znana blokada kliniczna %j nie ginie wskutek noworodkowego provenance not_applicable', context => {
    const source = { creatinineState: 'unknown', scrAssay: '', ...context };
    const before = structuredClone(source);
    const { resolved, eligibility, value } = resolveAndCompute(source);
    expect(value).toBeNull();
    expect(resolved.allowed).toBe(false);
    expect(eligibility.eligible).toBe(false);
    expect(resolved.blockers.map(entry => entry.code)).toContain('MARKER_STATE_CONTRADICTS_ASSUMPTIONS');
    expect(resolved.calculationContext.markerPolicy).toMatchObject({ calculationAllowed: false, categoryAllowed: false, status: 'blocked' });
    expect(resolved.assumptionsText).toBe('');
    expect(resolved.assumptions.map(entry => entry.id)).not.toContain('noSuspectedAKI');
    expect(source).toEqual(before);
  });

  it('założenie IDMS nie usuwa bramek donoszenia, bieżącej masy i dni', () => {
    expect(resolveAndCompute({}, { termStatus: '' }).value).toBeNull();
    expect(resolveAndCompute({}, { termStatus: 'preterm' }).value).toBeNull();
    expect(resolveAndCompute({}, { bodyWeightKg: '' }).value).toBeNull();
    expect(resolveAndCompute({}, { bodyWeightKg: 2.5 }).value).toBeNull();
    expect(resolveAndCompute({}, { bodyWeightKg: 2.5001 }).value).toBe(31);
    expect(resolveAndCompute({}, {}, 0).value).toBe(31);
    expect(resolveAndCompute({}, {}, 28).value).toBe(31);
    expect(resolveAndCompute({}, {}, 29).value).toBeNull();
    expect(resolveAndCompute({}, {}, 1.5).value).toBeNull();
    expect(safety.computeNeonatalEgfr({ termBorn: true, bodyWeightKg: 3.5, daysOfLife: 14, heightCm: 45, creatinineMgDl: 0.5 })).toBe(27.9);
  });

  it('nie zeruje niezgodnego zapisanego wieku, a jawne dni wystarczają przy pustych latach i miesiącach', () => {
    for (const values of [{ age: '', ageMonths: '' }, { age: '1', ageMonths: '' }, { age: '', ageMonths: '1' }]) {
      const fields = { formulaPicker: { value: formulaId }, ageDays: { value: '14' }, ...Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value }])) };
      const before = structuredClone(fields);
      const age = safety.readAgeFromDocument({ getElementById: id => fields[id] || null });
      expect(safety.formulaEligibility(formulaId, age).eligible).toBe(values.age === '' && values.ageMonths === '');
      expect(fields).toEqual(before);
    }
  });

  it('nie zmienia polityki innych formuł, ich danych ani rzeczywistych wyników', () => {
    const source = { creatinineState: 'unknown', scrAssay: 'jaffe_idms' };
    const adult = assumptions.resolve('egfr', source);
    expect(adult.allowed).toBe(true);
    expect(adult.calculationContext.markerPolicy).toMatchObject({ categoryAllowed: true, status: 'stable' });
    expect(adult.assumptionsText).toBe('Założenia: stabilna czynność nerek, brak podejrzenia AKI oraz kreatynina standaryzowana do IDMS.');
    expect(safety.computeCkdEpi2021Cr({ sex: 'M', ageYears: 50, creatinineMgDl: 1 })).toBeCloseTo(91.6914786098, 9);
    const cg = assumptions.resolve('cg', { ...source, scrAssay: '' });
    expect(cg.calculationContext.creatinineStandardization).toBe('');
    expect(cg.calculationContext.markerPolicy.categoryAllowed).toBe(true);
    expect(assumptions.resolve('ckid_u25_cys', source).allowed).toBe(true);
    expect(source).toEqual({ creatinineState: 'unknown', scrAssay: 'jaffe_idms' });
  });
});
