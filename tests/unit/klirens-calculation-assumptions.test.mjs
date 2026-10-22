import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
for (const file of [
  'clcr_calculation_assumptions.js',
  'clcr_clinical_safety.js',
  'clcr_extended_egfr.js',
  'clcr_result_reference_data.js',
]) loadBrowserScript(file, browser);

const assumptions = browser.VildaClcrCalculationAssumptions;
const safety = browser.ClcrClinicalSafety;
const extended = browser.ClcrExtendedEgfr;
const markerIds = ['egfr', 'ckid_u25', 'egfr_cr_cys', 'ckid_u25_cys', 'ckid_u25_cr_cys', 'neonatal_egfr', 'sch_idms', 'cg', 'cg_norm', 'cl24', 'TMP_GFR'];
const idmsIds = ['egfr', 'ckid_u25', 'egfr_cr_cys', 'ckid_u25_cr_cys', 'sch_idms'];
const ifccIds = ['egfr_cr_cys', 'ckid_u25_cys', 'ckid_u25_cr_cys'];

describe('Klirens — jawne założenia obliczenia, odrębne od faktów', () => {
  it('udostępnia zamrożony profil zgodny z 11 aktywnymi formułami markerowymi', () => {
    expect([...assumptions.POLICY.markerFormulaIds].sort()).toEqual([...markerIds].sort());
    expect([...assumptions.POLICY.markerFormulaIds].sort()).toEqual([...browser.ClcrResultReferenceData.PROFILE.markerSensitiveFormulaIds].sort());
    expect([...assumptions.POLICY.idmsFormulaIds]).toEqual(idmsIds);
    expect([...assumptions.POLICY.ifccFormulaIds]).toEqual(ifccIds);
    expect(Object.isFrozen(assumptions.POLICY)).toBe(true);
    expect(Object.isFrozen(assumptions.POLICY.markerFormulaIds)).toBe(true);
  });

  it.each(markerIds)('%s przyjmuje domyślne założenia bez mutowania nieznanego kontekstu', formulaId => {
    const context = {
      creatinineState: 'unknown', suspectedAKI: false, scrAssay: '',
      cystatinCStandardization: '', crCysStandardizationConfirmed: false,
      markerPolicy: safety.creatininePolicy('unknown', false),
    };
    const before = structuredClone(context);
    const result = assumptions.resolve(formulaId, context);
    expect(result).toMatchObject({
      formulaId, allowed: true, blockers: [],
      calculationContext: {
        creatinineState: 'stable', suspectedAKI: false, scrAssay: '',
        markerPolicy: { calculationAllowed: true, categoryAllowed: true, status: 'stable' },
      },
      provenance: { creatinineState: 'assumed', suspectedAKI: 'assumed' },
    });
    expect(result.assumptions.map(item => item.id)).toContain('stableKidneyFunction');
    expect(result.assumptions.map(item => item.id)).toContain('noSuspectedAKI');
    expect(context).toEqual(before);
    expect(result.calculationContext.markerPolicy).not.toBe(context.markerPolicy);
  });

  it.each(ifccIds)('%s dostaje IFCC bez zapisywania potwierdzenia laboratoryjnego', formulaId => {
    const context = { cystatinCStandardization: '', crCysStandardizationConfirmed: false };
    const result = assumptions.resolve(formulaId, context);
    expect(result.calculationContext.cystatinCStandardization).toBe('ERM-DA471/IFCC');
    expect(result.provenance.cystatinCStandardization).toBe('assumed');
    expect(result.assumptions).toContainEqual({ id: 'ifcc', text: 'oznaczenie cystatyny C standaryzowane do IFCC', provenance: 'assumed' });
    expect(context).toEqual({ cystatinCStandardization: '', crCysStandardizationConfirmed: false });
    expect(result.calculationContext).not.toHaveProperty('crCysStandardizationConfirmed');
  });

  it.each(idmsIds)('%s dostaje IDMS jako standard, bez fikcyjnej techniki oznaczenia', formulaId => {
    const result = assumptions.resolve(formulaId, { scrAssay: '' });
    expect(result.calculationContext).toMatchObject({
      scrAssay: '', presentationAssay: 'idms', creatinineStandardization: 'IDMS',
    });
    expect(result.provenance.creatinineStandardization).toBe('assumed');
    expect(result.calculationContext.presentationAssay).not.toMatch(/enzymatic|jaffe/);
  });

  it('z trzema danymi U25cys zachowuje rzeczywiste 79,2646 i pokazuje dokładny zatwierdzony komentarz', () => {
    const result = assumptions.resolve('ckid_u25_cys', {});
    const number = extended.computeCkidU25Cys({
      ageYears: 10, sex: 'F', cystatinCValue: 1, cystatinCUnit: 'mg/L',
      cystatinCStandardization: result.calculationContext.cystatinCStandardization,
    });
    expect(number.ok).toBe(true);
    expect(number.value).toBeCloseTo(79.26461484738338, 12);
    expect(safety.kdigoGCategory(number.value).code).toBe('G2');
    expect(result.assumptionsText).toBe('Założenia: stabilna czynność nerek, brak podejrzenia AKI oraz oznaczenie cystatyny C standaryzowane do IFCC.');
    expect(result.calculationContext.creatinineStandardization).toBe('');
    expect(result.provenance.creatinineStandardization).toBe('not_applicable');
  });

  it('nie rozluźnia czystego API cystatyny ani nie dopisuje wieku/wzrostu/masy', () => {
    expect(extended.computeCkidU25Cys({ ageYears: 10, sex: 'F', cystatinCValue: 1, cystatinCUnit: 'mg/L' }).code).toBe('CYSTATIN_C_STANDARDIZATION_REQUIRED');
    const result = assumptions.resolve('ckid_u25_cys', {});
    expect(extended.computeCkidU25Cys({
      ageYears: 26, sex: 'F', cystatinCValue: 1, cystatinCUnit: 'mg/L',
      cystatinCStandardization: result.calculationContext.cystatinCStandardization,
    }).code).toBe('AGE_OUT_OF_RANGE');
    expect(result.calculationContext).not.toHaveProperty('ageYears');
    expect(result.calculationContext).not.toHaveProperty('height');
    expect(result.calculationContext).not.toHaveProperty('weight');
  });

  it.each(markerIds)('%s zachowuje blokadę znanego AKI i szybkich zmian', formulaId => {
    for (const context of [{ suspectedAKI: true, creatinineState: 'stable' }, { creatinineState: 'rapidlyChanging', suspectedAKI: false }]) {
      const before = structuredClone(context);
      const result = assumptions.resolve(formulaId, context);
      expect(result).toMatchObject({
        allowed: false, assumptionsText: '',
        calculationContext: { ...context, markerPolicy: { calculationAllowed: false, categoryAllowed: false, status: 'blocked' } },
      });
      expect(result.blockers[0].code).toBe('MARKER_STATE_CONTRADICTS_ASSUMPTIONS');
      expect(result.assumptions.map(item => item.id)).not.toContain('noSuspectedAKI');
      expect(context).toEqual(before);
    }
  });

  it('zachowuje istniejącą blokadę markerPolicy także przy sprzecznym statusie pola', () => {
    const context = { creatinineState: 'unknown', markerPolicy: { calculationAllowed: false, status: 'blocked', message: 'Zapisana blokada kliniczna.' } };
    const before = structuredClone(context);
    const result = assumptions.resolve('ckid_u25_cys', context);
    expect(result.allowed).toBe(false);
    expect(result.calculationContext.markerPolicy.message).toBe('Zapisana blokada kliniczna.');
    expect(context).toEqual(before);
    expect(Object.isFrozen(context.markerPolicy)).toBe(false);
  });

  it.each([
    ['egfr', { scrAssay: 'not_idms' }, 'creatinineStandardization', 'IDMS'],
    ['egfr', { creatinineStandardization: 'not_idms' }, 'creatinineStandardization', 'IDMS'],
    ['ckid_u25_cys', { cystatinCStandardization: 'not_ifcc' }, 'cystatinCStandardization', 'ERM-DA471/IFCC'],
    ['ckid_u25_cys', { cystatinCStandardization: 'unknown' }, 'cystatinCStandardization', 'ERM-DA471/IFCC'],
  ])('niejednoznaczne metadane %s / %j pozostają oryginalne, założenie nie jest potwierdzeniem', (formulaId, context, field, effective) => {
    const before = structuredClone(context);
    const result = assumptions.resolve(formulaId, context);
    expect(result.allowed).toBe(true);
    expect(result.calculationContext[field]).toBe(effective);
    expect(result.provenance[field]).toBe('assumed');
    if (context.scrAssay) expect(result.calculationContext.scrAssay).toBe(context.scrAssay);
    expect(context).toEqual(before);
  });

  it.each([
    ['egfr', { scrAssay: 'non_idms' }, 'CREATININE_STANDARDIZATION_INCOMPATIBLE'],
    ['ckid_u25', { scrAssay: 'enzymatic_non_idms' }, 'CREATININE_STANDARDIZATION_INCOMPATIBLE'],
    ['egfr_cr_cys', { creatinineStandardization: 'non_idms', crCysStandardizationConfirmed: true }, 'CREATININE_STANDARDIZATION_INCOMPATIBLE'],
    ['ckid_u25_cys', { cystatinCStandardization: 'non_ifcc' }, 'CYSTATIN_C_STANDARDIZATION_INCOMPATIBLE'],
    ['egfr_cr_cys', { cystatinCStandardization: 'non_ifcc', crCysStandardizationConfirmed: true }, 'CYSTATIN_C_STANDARDIZATION_INCOMPATIBLE'],
  ])('jawnie niezgodne metadane %s / %j mają pierwszeństwo przed założeniem', (formulaId, context, code) => {
    const before = structuredClone(context);
    const result = assumptions.resolve(formulaId, context);
    expect(result.allowed).toBe(false);
    expect(result.blockers.map(item => item.code)).toContain(code);
    expect(result.calculationContext.markerPolicy).toMatchObject({ calculationAllowed: false, categoryAllowed: false, status: 'blocked' });
    expect(result.assumptionsText).toBe('');
    expect(context).toEqual(before);
  });

  it.each(['enzymatic_idms', 'jaffe_idms'])('potwierdzona technika %s pozostaje prawdziwą metodą, a nie założeniem', scrAssay => {
    const result = assumptions.resolve('ckid_u25', { scrAssay });
    expect(result.calculationContext).toMatchObject({ scrAssay, presentationAssay: scrAssay, creatinineStandardization: 'IDMS' });
    expect(result.provenance.creatinineStandardization).toBe('provided');
    expect(result.assumptions.map(item => item.id)).not.toContain('idms');
  });

  it.each(['ERM-DA471/IFCC', 'ERM-DA471_IFCC'])('rozpoznaje istniejący rzeczywisty standard %s', cystatinCStandardization => {
    const result = assumptions.resolve('ckid_u25_cys', { cystatinCStandardization });
    expect(result.calculationContext.cystatinCStandardization).toBe('ERM-DA471/IFCC');
    expect(result.provenance.cystatinCStandardization).toBe('provided');
  });

  it.each([true, false])('nie modyfikuje zapisanego zbiorczego potwierdzenia %s', confirmed => {
    const context = { crCysStandardizationConfirmed: confirmed, scrAssay: '', cystatinCStandardization: '' };
    const result = assumptions.resolve('egfr_cr_cys', context);
    expect(result.allowed).toBe(true);
    expect(result.provenance.creatinineStandardization).toBe(confirmed ? 'provided' : 'assumed');
    expect(result.provenance.cystatinCStandardization).toBe(confirmed ? 'provided' : 'assumed');
    expect(context).toEqual({ crCysStandardizationConfirmed: confirmed, scrAssay: '', cystatinCStandardization: '' });
  });

  it.each(['cg', 'cg_norm', 'cl24', 'TMP_GFR'])('%s nie dostaje nowego wymogu IFCC/IDMS', formulaId => {
    const result = assumptions.resolve(formulaId, {});
    expect(result.calculationContext).toMatchObject({ creatinineStandardization: '', cystatinCStandardization: '', presentationAssay: '' });
    expect(result.provenance).toMatchObject({ creatinineStandardization: 'not_applicable', cystatinCStandardization: 'not_applicable' });
    expect(result.assumptions.map(item => item.id).sort()).toEqual(['noSuspectedAKI', 'stableKidneyFunction']);
  });

  it('nie przenosi niezgodnej kreatyniny na wzór czysto cystatynowy ani Cockcrofta', () => {
    const context = { scrAssay: 'non_idms', cystatinCStandardization: '', creatinineState: 'unknown' };
    expect(assumptions.resolve('egfr', context).allowed).toBe(false);
    expect(assumptions.resolve('ckid_u25_cys', context).allowed).toBe(true);
    expect(assumptions.resolve('cg', context).allowed).toBe(true);
    expect(context.scrAssay).toBe('non_idms');
  });

  it('nie przenosi niezgodnej cystatyny na równanie oparte wyłącznie na kreatyninie', () => {
    const context = { cystatinCStandardization: 'non_ifcc', creatinineState: 'unknown' };
    expect(assumptions.resolve('ckid_u25_cys', context).allowed).toBe(false);
    expect(assumptions.resolve('egfr', context).allowed).toBe(true);
    expect(assumptions.resolve('ckid_u25', context).allowed).toBe(true);
    expect(context.cystatinCStandardization).toBe('non_ifcc');
  });

  it.each(['FENa_spot', 'FEK_spot', 'FECl_spot', 'FEHCO3_spot', 'KTV', 'ACR', 'AGs'])('%s nie dostaje sprzecznego założenia o braku AKI ani nowej blokady', formulaId => {
    const context = { creatinineState: 'rapidlyChanging', suspectedAKI: true, creatinineStandardization: 'non_idms', cystatinCStandardization: 'non_ifcc' };
    const result = assumptions.resolve(formulaId, context);
    expect(result).toMatchObject({ allowed: true, assumptions: [], assumptionsText: '', blockers: [] });
    expect(result.calculationContext).toMatchObject({
      ...context, markerPolicy: { calculationAllowed: true, categoryAllowed: false, status: 'not_applicable' },
    });
    expect(result.provenance.creatinineState).toBe('not_applicable');
  });

  it('założenie IDMS nie zastępuje rzeczywistej metody enzymatycznej noworodka', () => {
    const age = safety.parseAge(0, 0, 7);
    for (const scrAssay of ['', 'not_idms', 'jaffe_idms', 'enzymatic_idms']) {
      const result = assumptions.resolve('neonatal_egfr', { scrAssay });
      expect(result.calculationContext.scrAssay).toBe(scrAssay);
      expect(result.provenance.creatinineStandardization).toBe('not_applicable');
      const eligibility = safety.formulaSafety('neonatal_egfr', age, result.calculationContext.markerPolicy, { termStatus: 'term', bodyWeightKg: 3, scrAssay: result.calculationContext.scrAssay });
      expect(eligibility.eligible).toBe(scrAssay === 'enzymatic_idms');
    }
  });

  it('nie reaktywuje historycznego Schwartz ani nie omija jego gate', () => {
    const result = assumptions.resolve('sch_var', {});
    expect(result.assumptions).toEqual([]);
    expect(safety.formulaSafety('sch_var', safety.parseAge(10, 0), result.calculationContext.markerPolicy, {}).eligible).toBe(false);
  });

  it('zamraża tylko nowy wynik, bez zamrażania obiektów kanonicznego kontekstu', () => {
    const context = { markerPolicy: { calculationAllowed: true, categoryAllowed: false, status: 'unknown' }, audit: { historical: ['unchanged'] } };
    const before = structuredClone(context);
    const result = assumptions.resolve('egfr', context);
    expect(context).toEqual(before);
    expect(Object.isFrozen(context)).toBe(false);
    expect(Object.isFrozen(context.markerPolicy)).toBe(false);
    expect(Object.isFrozen(context.audit.historical)).toBe(false);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.calculationContext.markerPolicy)).toBe(true);
    expect(Object.isFrozen(result.assumptions)).toBe(true);
    expect(Object.isFrozen(result.assumptions[0])).toBe(true);
  });
});
