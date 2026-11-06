import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const w = {};
for (const file of [
  'clcr_uag_reference_data.js', 'clcr_uag.js',
  'clcr_serum_anion_gap_data.js', 'clcr_serum_anion_gap.js', 'clcr_serum_anion_gap_persistence.js',
  'clcr_tmp_gfr_reference_data.js', 'clcr_tmp_gfr.js', 'clcr_tmp_gfr_persistence.js',
  'clcr_ph_reference_data.js', 'clcr_ph.js', 'clcr_ph_persistence.js',
  'clcr_ua_reference_data.js', 'clcr_ua.js', 'clcr_ua_persistence.js',
  'clcr_ca_dzm_reference_data.js', 'clcr_ca_dzm.js', 'clcr_ca_dzm_persistence.js',
  'clcr_clinical_safety.js', 'clcr_extended_egfr.js', 'clcr_calculation_assumptions.js',
  'clcr_result_reference_data.js', 'clcr_result_presentation.js',
  'clcr_measured_clearance_reference_data.js', 'clcr_measured_clearance_reference.js',
  'clcr_stone_safety.js', 'clcr_dialysis_safety.js', 'clcr_saved_results.js',
  'clcr_saved_legacy_calculator.js',
]) loadBrowserScript(file, w);
const engine = w.ClcrSavedLegacyCalculator;
const protocol = Object.fromEntries([
  'collectionStartVoidDiscarded', 'collectionFinalVoidIncluded', 'collectionNoMissedVoids',
  'collectionNoSpillage', 'collectionNoExtraVoids', 'collectionStorageFollowed',
].map(key => [key, true]));
const timed = {
  age: '45', sex: 'M', weight: '50', height: '150', Scr: '1', ScrUnit: 'mg/dl',
  collectionStartAt: '2026-10-20T08:00', collectionEndAt: '2026-10-21T08:00',
  V24: '1500', Ucr: '100', U_UA: '20', U_Ca: '2', U_Mg: '20', U_PO4: '10',
  U_Ox: '0.2', U_Cit: '5', U_Na: '60', U_K: '40', U_Prot: '300', ...protocol,
};
const calculate = (id, patch = {}, output = id, context = {}) => engine.recalculate(id, { ...timed, ...patch }, output, context);

describe('Saved Klirens: existing timed-urine production arithmetic', () => {
  it.each([
    ['Ox_mgkg', 0.06, 'mg/kg/24 h'], ['Cit_mgkg', 1.5, 'mg/kg/24 h'],
    ['KM_Cr', 0.2, 'mg/mg'], ['Ca_Cr', 0.080156, 'mg/mg'], ['Mg_Ca', 5000 / 20039, 'mg/mg'],
    ['PO4_Cr', 0.1, 'mg/mg'], ['B_Cr', 0.2, 'mg/mg'], ['Ca_Cit', 1.60312, 'mg/mg'],
    ['K_frac', 40, '%'],
  ])('%s uses its own documented production conversion and source units', (id, expected, unit) => {
    const result = calculate(id);
    expect(result.valueNum).toBeCloseTo(expected, 12);
    expect(result.unit).toBe(unit);
    if (id === 'Ca_Cr') expect(result).toMatchObject({ sourceFormulaId: id, comparator: '', tone: 'success', norm: '0,02–0,24 mg/mg', outOfRange: false, category: 'within' });
    else if (id === 'B_Cr') expect(result).toMatchObject({ sourceFormulaId: id, comparator: '', tone: 'warning', norm: '<0,15 mg/mg', outOfRange: true, category: 'Umiarkowanie zwiększony', assessment: 'above', proteinCreatinineSnapshot: { mode: 'legacy', input: { legacyProteinMassMg: '300', legacyVolumeMl: '1500', legacyCreatinineMgDl: '100' } } });
    else if (id === 'PO4_Cr') expect(result).toMatchObject({ sourceFormulaId: id, comparator: '', tone: 'success', norm: '<0,75 mg/mg', outOfRange: false, category: null, assessment: 'within',
      phosphorusCreatinineSnapshot: { context: { ageYears: 45, sex: 'male' }, input: { phosphorusValue: '10', phosphorusUnit: 'mg P/dL', creatinineValue: '100', creatinineUnit: 'mg/dL' }, reference: { sourceLabel: 'Mayo', high: .75, low: null, upperInclusive: false } } });
    else expect(result).toMatchObject({ sourceFormulaId: id, comparator: '', tone: 'neutral', norm: '', outOfRange: null, category: null });
  });

  it.each([{ sex: 'F' }, { age: '' }])('explicit P/Cr recalculation keeps the number neutral without an applicable reference: %o', patch => {
    expect(calculate('PO4_Cr', patch)).toMatchObject({ valueNum: .1, rawValue: .1, unit: 'mg/mg', norm: '',
      tone: 'neutral', outOfRange: null, category: null, assessment: 'unassessed',
      phosphorusCreatinineSnapshot: { reference: null, referenceAvailable: false, status: 'unassessed' } });
  });

  it('potassium retains the broad concentration quantity with an explicit clock and its selected laboratory reference', () => {
    expect(calculate('K_mmol_d', { Cl24DurationHours: '24', Cl24DurationSource: 'hours' })).toMatchObject({
      valueNum: 60, rawValue: 60, unit: 'mmol/24 h', norm: '20–116 mmol/24 h', outOfRange: false,
      assessment: 'within', tone: 'success', potassiumDzmSnapshot: { dailyMmol: 60, input: { hours: '24' } },
    });
    expect(() => calculate('K_mmol_d')).toThrow(/czas/i);
  });

  it('sodium retains the legacy concentration quantity with an explicit clock and uses its typed reference', () => {
    const result = calculate('Na_mmol_d', { Cl24DurationHours: '24', Cl24DurationSource: 'hours' });
    expect(result).toMatchObject({ sourceFormulaId: 'Na_mmol_d', valueNum: 90, rawValue: 90,
      testKey: 'clcr:Na_mmol_d', unit: 'mmol/24 h', tone: 'success', norm: '58–337 mmol/24 h',
      outOfRange: false, category: null, sodiumDzmSnapshot: { dailyMmol: 90, status: 'within', input: { hours: '24' } } });
    // Local historic dates do not prove elapsed collection hours across time zones/DST.
    expect(() => calculate('Na_mmol_d')).toThrow(/czas/i);
  });

  it('phosphorus keeps its original P mass and uses the age/sex reference only with captured numeric hours', () => {
    const result = calculate('PO4_mgkg', { PO4_collectionHours: '24' });
    expect(result).toMatchObject({ valueNum: 150, unit: 'mg P/24 h', norm: '390–1425 mg P/24 h', outOfRange: true,
      po4DzmSnapshot: { dailyMg: 150, status: 'low', input: { hours: '24' } } });
    expect(() => calculate('PO4_mgkg')).toThrow(/czas/i);
  });

  it('magnesium uses its audited daily unit and frozen reference; legacy dates alone do not supply hours', () => {
    const result = calculate('Mg_mgkg', { MG_collectionHours: '24' });
    expect(result).toMatchObject({ valueNum: 30, unit: 'mg/24 h', norm: '51–269 mg/24 h', outOfRange: true,
      mgDzmSnapshot: { dailyMg: 30, perKg: 0.6, status: 'low', input: { hours: '24' } } });
    expect(() => calculate('Mg_mgkg')).toThrow(/czas/i);
  });

  it('calcium uses the audited converter and source-native adult daily unit', () => {
    expect(calculate('Ca_mgkg', { CA_collectionHours: '24' })).toMatchObject({ valueNum: 120.234, unit: 'mg/24 h', outOfRange: false, caDzmSnapshot: { perKg: 2.40468, referenceText: '<250' } });
    expect(() => calculate('Ca_mgkg')).toThrow(/czas/i);
  });

  it('normalizes the recorded collection duration, without using a current day', () => {
    expect(calculate('Ca_mgkg', { CA_collectionHours: '12', collectionEndAt: '2026-10-20T20:00' }).valueNum).toBe(240.468);
    expect(calculate('Ca_Cr', { collectionEndAt: '' }).valueNum).toBe(0.080156);
    expect(() => calculate('Ca_mgkg', { collectionEndAt: '' })).toThrow();
    expect(() => calculate('Ca_mgkg', { CA_collectionHours: '24', collectionNoMissedVoids: false, ui_collectionNoMissedVoids_answer: 'no' })).toThrow();
  });

  it('updates only the requested one of the three protein outputs', () => {
    const before = structuredClone(timed);
    expect(calculate('Prot_mgkg', {}, 'Prot_mg24').valueNum).toBe(300);
    expect(calculate('Prot_mgkg', {}, 'Prot_g24')).toMatchObject({ valueNum: 0.3, unit: 'g/24 h' });
    const indexed = calculate('Prot_mgkg', { age: '10' }, 'Prot_bsa');
    const surface = w.ClcrExtendedEgfr.computeHaycockBsa({ ageYears: 10, heightValue: 150, heightUnit: 'cm', weightValue: 50, weightUnit: 'kg' }).value;
    expect(indexed.unit).toBe('mg/m²/24 h');
    expect(indexed.valueNum * surface).toBeCloseTo(300, 10);
    expect(() => calculate('Prot_mgkg', {}, 'Prot_bsa')).toThrow(/pediatrycznej/);
    expect(timed).toEqual(before);
  });

  it('uses the existing phosphorus producer for an exact zero, without changing zero rules of other formulas', () => {
    expect(calculate('PO4_mgkg', { U_PO4: '0', PO4_collectionHours: '24' }).valueNum).toBe(0);
    expect(() => calculate('PO4_mgkg', { U_PO4: '-1', PO4_collectionHours: '24' })).toThrow();
    expect(() => calculate('Ca_mgkg', { U_Ca: '0' })).toThrow();
  });

  it('preserves negative UAG and contradictory specimen information', () => {
    const values = { spotSameSpecimen: true, U_Na_spot: 20, U_K_spot: 10, U_Cl_spot: 45 };
    expect(calculate('AGu_spot', values)).toMatchObject({ valueNum: -15, displayValue: '-15', comparator: '', norm: '', outOfRange: null });
    expect(calculate('AGu_spot', { ...values, spotSameSpecimen: false, spotPairedChemistry: true }).valueNum).toBe(-15);
    expect(() => calculate('AGu_spot', { ...values, ui_spotSameSpecimen_answer: 'no' })).toThrow(/próbki/);
    expect(calculate('AGu_spot', { ...values, spotSameSpecimen: false, ui_spotSameSpecimen_answer: 'unknown' }).valueNum).toBe(-15);
    expect(calculate('AGs', { S_Na: 140, S_Cl: 105, S_HCO3: 25 }).valueNum).toBe(10);
  });

  it.each([
    [4.4999, 'below', true, 'warning'], [4.5, 'within', false, 'success'],
    [6.1, 'within', false, 'success'], [8, 'within', false, 'success'],
    [8.0001, 'above', true, 'warning'],
  ])('compares a single pH %s with the approved general reference while preserving exact value', (value, assessment, outOfRange, tone) => {
    const result = calculate('pH_spot', { U_pH: value });
    expect(result).toMatchObject({ valueNum: value, rawValue: value, unit: '—', norm: '4,5–8,0', assessment, outOfRange, tone });
    expect(result.phSnapshot).toMatchObject({ valid: true, reference: { lower: 4.5, upper: 8, lowerInclusive: true, upperInclusive: true } });
    expect(result.phSnapshot.policy).toEqual({ id: w.VildaClcrPhReferenceData.DEFAULT_POLICY.id, version: w.VildaClcrPhReferenceData.DEFAULT_POLICY.version });
  });

  it('uses the approved general DZM interval without grading therapy and retains a number for an unsuitable collection', () => {
    const ph = calculate('pH24', { age: '30', pH24: 7.8, stoneKnownCystinuria: true, stonePhPersistent: true, stoneCollectionPlausibilityReviewed: true, stoneTwoCollectionsConfirmed: true });
    expect(ph).toMatchObject({ valueNum: 7.8, rawValue: 7.8, tone: 'success', assessment: 'within', category: null, norm: '4,5–8,0' });
    expect(ph.phDzmSnapshot.reference).toMatchObject({ kind: 'interval', lower: 4.5, upper: 8, sourceIds: ['MAYO_UPH24'] });
    expect(ph.phDzmSnapshot.restrictions.treatmentEfficacyAssessment).toBe(false);
    expect(ph.phDzmSnapshot.knownFacts).not.toHaveProperty('stoneKnownCystinuria');
    expect(calculate('pH24', { pH24: 6.1, collectionNoSpillage: false })).toMatchObject({ valueNum: 6.1, assessment: 'within' });
    const unsuitable = calculate('pH24', { pH24: 6.1, collectionNoSpillage: false, ui_collectionNoSpillage_answer: 'no' });
    expect(unsuitable).toMatchObject({ valueNum: 6.1, rawValue: 6.1, norm: '', tone: 'neutral', outOfRange: null, assessment: 'unassessed' });
    expect(unsuitable.phDzmSnapshot.collection).toMatchObject({ complete: false, knownProblems: ['collectionNoSpillage'] });
  });

  it('uses the actual TmP/GFR producer without saving TRP as a second output', () => {
    const fields = { age: '10', U_PO4_spot: '20', U_PO4_spot_unit: 'mg/dl', S_PO4_spot: '4', S_PO4_spot_unit: 'mg/dl', Scr_spot: '0.6', Scr_spot_unit: 'mg/dl', Ucr_spot: '100', Ucr_spot_unit: 'mg/dl', spotSampleKind: 'secondMorning', tmpPairedSameTime: true, tmpOvernightFasting: true };
    const result = calculate('TMP_GFR', fields);
    expect(result.valueNum).toBeGreaterThan(0);
    expect(result).toMatchObject({ id: 'TMP_GFR', unit: 'mmol/L', category: null });
    expect(result.tmpGfrSnapshot).toMatchObject({ valid: true, method: 'Brodehl' });
    expect(result.norm).toContain('0,97');
    expect(result.rawValue).toBeCloseTo((4 - 20 * 0.6 / 100) / 3.097, 12);
    expect(calculate('TMP_GFR', { ...fields, tmpPairedSameTime: false }).tmpGfrSnapshot.sample.pairedSameTime).toBe('assumed');
    expect(() => calculate('TMP_GFR', { ...fields, FENa_sample_status: 'different-time' })).toThrow();
  });
});

describe('Saved Klirens: measured clearance, CG and dialysis reuse actual producers', () => {
  it('CG retains exact age while indexed CG retains completed years', () => {
    const values = { age: '60', ageMonths: '6', weight: '80', height: '175', Scr: '1.2', ScrUnit: 'mg/dl' };
    expect(calculate('cg', values).valueNum).toBeCloseTo(73.61111111111111, 11);
    expect(calculate('cg_norm', values).valueNum).toBeCloseTo(65.51340637632256, 11);
    expect(calculate('cg_norm', { ...values, ageMonths: '12' }).valueNum).toBeCloseTo(65.51340637632256, 11);
    expect(calculate('cg_norm', values).norm).toBe('');
    expect(() => calculate('cg', { ...values, age: '17' })).toThrow();
    for (const ScrUnit of ['', 'wrong-unit']) {
      expect(() => calculate('cg', { ...values, ScrUnit })).toThrow(/jednostkę/);
      expect(() => calculate('cg_norm', { ...values, ScrUnit })).toThrow(/jednostkę/);
    }
  });
  it('measured clearance retains the exact PathWest reference and own inputs', () => {
    const result = calculate('cl24', { age: '45', weight: '70', height: '175', V24: '1440', Cl24DurationHours: '24' });
    expect(result).toMatchObject({ valueNum: 100, unit: 'mL/min', tone: 'success' });
    expect(result.measuredClearanceReference).toMatchObject({ profileId: 'PATHWEST_CCL_2026_03_20', status: 'within', inputs: { volumeMl: 1440, durationMinutes: 1440 }, collectionAssumptions: { collectionCompleteness: 'assumed' } });
    expect(result.measuredClearanceReference.absoluteRange.lower).toBeCloseTo(86.53155171550813, 10);
    expect(() => calculate('cl24', { Cl24DurationHours: '24', Cl24CollectionProblem: true })).toThrow();
    expect(() => calculate('cl24', { Cl24DurationHours: '24', ui_collectionNoMissedVoids_answer: 'no' })).toThrow();
    expect(calculate('cl24', { Cl24DurationHours: '' }).measuredClearanceReference.inputs.durationMinutes).toBe(1440);
    expect(() => calculate('cl24', { Cl24DurationHours: '', Cl24DurationSource: 'historical-missing' })).toThrow(/czas/i);
  });
  it('recomputes the requested dialysis metric, preserving source sampling and target rules', () => {
    const fields = { age: '50', ageMonths: '0', ktvModality: 'IHD', ktvSessionsPerWeek: 3, ktvPidiDays: '2', UreaPre: 120, UreaPost: 36, ktvUreaAnalyte: 'BUN', ktvUreaUnit: 'mg/dL', ktvDurationMinutes: 240, ktvUF: 2, ktvW: 70, ktvAccessType: 'AVF/AVG', ktvTreatmentsDelivered: true, ktvSameSession: true, ktvPreBeforeDialysis: true, ktvPreNoDilution: true, ktvPostMethod: 'slow_flow_100ml_15s' };
    expect(calculate('KTV', fields, 'KTV_spktv').tone).toBe('neutral');
    const qualified = { ...fields, ktvKru: 1.5, ktvKruMeasuredAt: '2026-06-01' };
    const sp = calculate('KTV', qualified, 'KTV_spktv', { clinicalDateISO: '2026-07-28' });
    const eq = calculate('KTV', fields, 'KTV_ektv');
    const urr = calculate('KTV', fields, 'KTV_urr');
    expect(sp.valueNum).toBeCloseTo(1.4010540128, 9);
    expect(eq.valueNum).toBeCloseTo(1.2227380475, 9);
    expect(urr.valueNum).toBe(70);
    expect(sp.tone).toBe('success');
    expect(eq.norm).toBe('');
    expect(urr.unit).toBe('%');
    expect(() => calculate('KTV', { ...fields, ktvSameSession: false }, 'KTV_spktv')).toThrow();
    expect(fields.UreaPost).toBe(36);
  });
  it('rejects an unavailable frozen reference profile rather than using a new policy', () => {
    expect(() => calculate('PO4_mgkg', { PO4_collectionHours: '24' }, 'PO4_mgkg', { profileId: 'unknown-version' })).toThrow(/profil/);
  });
});
