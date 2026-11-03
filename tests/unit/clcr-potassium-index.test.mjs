import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
for (const file of ['clcr_potassium_index_data.js', 'clcr_potassium_index.js']) loadBrowserScript(file, browser);
const engine = browser.VildaClcrPotassiumIndex;
const data = browser.VildaClcrPotassiumIndexData;
const profile = data.getProfile('KFR_2026_11');
const calculate = (patch = {}, policy = profile) => engine.evaluate({ potassiumValue: '40', sodiumValue: '60', ...patch }, policy);

describe('K/(K+Na) — source policy stays separate from arithmetic', () => {
  it('defines no healthy reference interval or automatic threshold classification', () => {
    expect(profile).toMatchObject({ id: 'KFR_2026_11', version: 1, formulaId: 'K_frac', nativeUnit: '%', referenceKind: 'none', referenceAvailable: false,
      restrictions: { healthyReferenceInterval: false, automaticClassification: false, diagnosesHypovolaemia: false, thresholdsFromOtherSpecimensApplied: false, compositionAxisIsReferenceInterval: false },
      clinicalContext: { sourceId: 'ISPN_2021', population: 'Dzieci z zespołem nerczycowym', specimen: 'spot', potassiumIndexPercent: { operator: '>', value: 60 }, fractionalSodiumExcretionPercent: { operator: '<', value: 0.5 }, automaticClassification: false } });
    expect(profile.sources.find(source => source.id === 'ISPN_2021')).toMatchObject({ fullDocumentRead: true, role: 'clinical-context', section: '6 i 6.1 — ocena hipowolemii' });
    expect(profile.sources.find(source => source.id === 'DONCKERWOLCKE_2003').fullDocumentRead).toBe(false);
    expect(profile.sources.find(source => source.id === 'KEENSWIJK_2018').fullDocumentRead).toBe(false);
    expect(profile.sources.find(source => source.id === 'SINGH_2026').limitation).toContain('odwrócony wzór FENa');
    expect(profile.notes.interference).toContain('Diuretyki i dożylne płyny');
    expect(data.listProfiles()).toEqual([profile]);
    expect(data.getProfile('unknown')).toBeNull();
    expect(Object.isFrozen(profile.notes)).toBe(true);
  });

  it.each([null, {}, { ...profile, referenceKind: 'healthy-interval' }, { ...profile, restrictions: { automaticClassification: true } }])('missing/malformed policy %j never prevents a valid numerical result or invents a norm', policy => {
    expect(calculate({}, policy)).toMatchObject({ valid: true, rawValue: 40, assessment: 'unassessed', tone: 'neutral', outOfRange: null, reference: null, referenceAvailable: false, policy: null, profileId: null });
  });

  it.each([0, 30, 59.9999, 60, 60.0001, 75, 100])('%s percent remains neutral with no age/sex category', potassiumValue => {
    const result = calculate({ potassiumValue, sodiumValue: 100 - potassiumValue, ageYears: 8, sex: 'female', fena: 0.3, nephroticSyndrome: true });
    expect(result).toMatchObject({ valid: true, assessment: 'unassessed', state: 'unassessed', status: 'unassessed', tone: 'neutral', outOfRange: null, reference: null, referenceAvailable: false, category: null, referenceLabel: 'Brak uniwersalnej normy' });
    expect(result.context).not.toHaveProperty('ageYears');
  });
});

describe('K/(K+Na) — exact production arithmetic and presentation', () => {
  it.each([
    ['40', '60', 40, '40', '40', '1'],
    ['0', '60', 0, '0', '0', '1'],
    ['40', '0', 100, '100', '100', '1'],
    ['1', '2', 100 / 3, '≈33,3333', '100', '3'],
    ['40,5', '60', 40.298507462686565, '≈40,2985', '2700', '67'],
    ['.5', '1.5', 25, '25', '25', '1'],
    ['+4e1', '6e1', 40, '40', '40', '1'],
    ['−0', '20', 0, '0', '0', '1'],
  ])('K %s and Na %s give the expected mathematical percentage', (potassiumValue, sodiumValue, rawValue, text, numerator, denominator) => {
    expect(calculate({ potassiumValue, sodiumValue })).toMatchObject({ valid: true, rawValue, pointValue: rawValue, canonicalNumber: rawValue, unit: '%', exact: true, exactValue: { numerator, denominator }, display: { text }, snapshot: { rawValue, exactValue: { numerator, denominator } } });
  });

  it('keeps the exact repeating ratio while marking the displayed truncation', () => {
    const result = calculate({ potassiumValue: '1', sodiumValue: '2' });
    expect(result.display).toMatchObject({ value: '33.3333', approximate: true, fullValueComplete: false, fullValueText: '33,333333333333333333333333333333…' });
    expect(result.sodiumDisplay.text).toBe('≈66,6667');
    expect(result.exactSodium).toEqual({ numerator: '200', denominator: '3' });
  });

  it.each(['1e308', String(Number.MAX_VALUE), '5e-324'])('keeps equal operands %s finite without adding overflowing or underflowing Numbers', value => {
    expect(calculate({ potassiumValue: value, sodiumValue: value })).toMatchObject({ valid: true, rawValue: 50, exactValue: { numerator: '50', denominator: '1' }, sodiumValue: 50, display: { text: '50', approximate: false } });
  });

  it('does not round a tiny positive measurement into a false zero', () => {
    const result = calculate({ potassiumValue: '0.000001', sodiumValue: '100' });
    expect(result.valid).toBe(true);
    expect(result.rawValue).toBe(0.0000009999999900000001);
    expect(result.rawValue).toBeGreaterThan(0);
    expect(result.display).toMatchObject({ text: '≈1e-6', approximate: true });
    expect(result.exactValue).toEqual({ numerator: '100', denominator: '100000001' });
    expect(result.snapshot.rawValue).toBe(result.rawValue);
    expect(result.zero).toBe(false);
  });

  it('retains a representable subnormal result but rejects final positive underflow', () => {
    const result = calculate({ potassiumValue: '5e-324', sodiumValue: '100' });
    expect(result).toMatchObject({ valid: true, rawValue: Number.MIN_VALUE, zero: false });
    expect(result.display.text).toBe('≈5e-324');
    expect(result.display.fullValueText).toContain('e-324');
    const underflow = calculate({ potassiumValue: '1e-300', sodiumValue: '1e308' });
    expect(underflow).toMatchObject({ valid: false, rawValue: null, snapshot: null, reasonCode: 'invalid-conversion', invalidIds: ['U_K', 'U_Na'] });
    expect(underflow.message).toContain('nie zastępuj wyniku zerem');
  });

  it('derives the tiny sodium complement exactly rather than subtracting a rounded 100', () => {
    const result = calculate({ potassiumValue: '1e308', sodiumValue: '1e-300' });
    expect(result).toMatchObject({ valid: true, rawValue: 100, display: { text: '≈100', approximate: true }, sodiumValue: null, sodiumDisplay: { text: '≈1e-606', approximate: true } });
    expect(BigInt(result.exactSodium.numerator)).toBeGreaterThan(0n);
  });

  it('marks rounding toward an endpoint as approximate without altering exact composition', () => {
    const result = calculate({ potassiumValue: '99.999999', sodiumValue: '.000001' });
    expect(result.display.text).toBe('≈100');
    expect(result.rawValue).toBeLessThan(100);
    expect(result.sodiumDisplay).toMatchObject({ text: '1e-6', approximate: false });
    expect(result.sodiumValue).toBe(1e-6);
  });
});

describe('K/(K+Na) — independent operand validation', () => {
  it.each(['-1', '-0.5', '−1', '0x10', '1e309', '1e-9999', '1e-400', 'Infinity', 'NaN', 'word', '<0.5', '≤0.5', '>1', '1,2.3', '1 000', true, {}, [], Infinity, NaN])('rejects potassium %j instead of using truthiness or coercion', potassiumValue => {
    expect(calculate({ potassiumValue })).toMatchObject({ valid: false, rawValue: null, snapshot: null, reasonCode: 'invalid-potassium', invalidIds: ['U_K'] });
  });
  it.each(['-1', '-0.5', '0x10', '1e309', '1e-400', 'Infinity', '<1', true, {}, [], Infinity, NaN])('rejects sodium %j independently', sodiumValue => {
    expect(calculate({ sodiumValue })).toMatchObject({ valid: false, rawValue: null, snapshot: null, reasonCode: 'invalid-sodium', invalidIds: ['U_Na'] });
  });
  it.each(['', ' ', null, undefined])('does not coerce absent potassium %j into zero', potassiumValue => {
    expect(calculate({ potassiumValue })).toMatchObject({ valid: false, reasonCode: 'missing-potassium', invalidIds: [], snapshot: null });
    expect(calculate({ sodiumValue: potassiumValue })).toMatchObject({ valid: false, reasonCode: 'missing-sodium', invalidIds: [], snapshot: null });
  });
  it('rejects zero sum and two negative operands even when the old ratio looked valid', () => {
    expect(calculate({ potassiumValue: '0', sodiumValue: '-0' })).toMatchObject({ valid: false, reasonCode: 'zero-sum', invalidIds: ['U_K', 'U_Na'], snapshot: null });
    expect(calculate({ potassiumValue: '-1', sodiumValue: '-1' })).toMatchObject({ valid: false, reasonCode: 'invalid-potassium' });
    expect(calculate({ potassiumValue: '1', sodiumValue: '-0.5' })).toMatchObject({ valid: false, reasonCode: 'invalid-sodium' });
  });
  it('bounds pathological exponent and input lengths without allocating unbounded arithmetic', () => {
    for (const potassiumValue of ['1e10000000000', '0e10000000000', '1'.repeat(513)]) expect(calculate({ potassiumValue }).valid).toBe(false);
  });
});

describe('K/(K+Na) — two existing inputs and scoped facts', () => {
  it('requires only the two existing urine concentrations', () => {
    const input = engine.inputFromValues({ U_K: '40,5', U_Na: '60', age: '', sex: '', V24: '', collectionHours: '' });
    expect(input).toMatchObject({ potassiumValue: '40,5', sodiumValue: '60', sameSpecimen: 'assumed', sampleType: 'unspecified', knownFacts: {} });
    expect(engine.evaluate(input, profile).rawValue).toBe(40.298507462686565);
    expect(engine.FIELD_IDS).toEqual(['U_K', 'U_Na']);
  });
  it('keeps zero values ready but reports a zero sum as a joint error', () => {
    expect(engine.readiness(engine.inputFromValues({ U_K: '0', U_Na: '60' }))).toMatchObject({ count: 2, total: 2, complete: true, zeroSum: false, invalidFieldIds: [] });
    expect(engine.readiness(engine.inputFromValues({ U_K: '0', U_Na: '0' }))).toMatchObject({ count: 2, total: 2, complete: true, zeroSum: true, reasonCode: 'zero-sum' });
    expect(engine.readiness(engine.inputFromValues({ U_K: '-1', U_Na: '' }))).toMatchObject({ count: 0, total: 2, complete: false, missingFieldIds: ['U_Na'], invalidFieldIds: ['U_K'] });
  });
  it.each([false, 'false', 'no', 'different'])('blocks scoped known different specimens %j without importing another formula context', sameSpecimen => {
    const values = { U_K: '40', U_Na: '60', sameSpecimen, FE_sameSpecimen: sameSpecimen, BCR_sameSpecimen: sameSpecimen };
    const generic = engine.inputFromValues(values, { sourceFormula: 'B_Cr', sameSpecimen, sampleType: 'timed', knownFacts: { sameSpecimen } });
    expect(engine.evaluate(generic, profile)).toMatchObject({ valid: true, context: { sameSpecimen: 'assumed', sampleType: 'unspecified' } });
    expect(engine.evaluate(engine.inputFromValues(values, { potassiumIndex: { sameSpecimen } }), profile)).toMatchObject({ valid: false, reasonCode: 'different-specimens' });
    expect(engine.evaluate(engine.inputFromValues(values, { sourceFormula: 'K_frac', knownFacts: { sameSpecimen } }), profile)).toMatchObject({ valid: false, reasonCode: 'different-specimens' });
    expect(engine.evaluate(engine.inputFromValues({ ...values, KFR_sameSpecimen: sameSpecimen }), profile)).toMatchObject({ valid: false, reasonCode: 'different-specimens' });
  });
  it('preserves known positive specimen facts and keeps contradictions blocking', () => {
    expect(calculate({ knownFacts: { sameSpecimen: true } }).context.sameSpecimen).toBe('confirmed');
    expect(calculate({ sameSpecimen: false, knownFacts: { sameSpecimen: true } }).valid).toBe(false);
    expect(calculate({ sameSpecimen: true, knownFacts: { sameSpecimen: false } }).valid).toBe(false);
  });
  it('recognizes scoped historical sameUrineSample aliases and gives any known contradiction priority', () => {
    const values = { U_K: '40', U_Na: '60' };
    for (const facts of [{ sameUrineSample: false }, { sameSpecimen: true, sameUrineSample: false }, { knownFacts: { sameUrineSample: false } }, { sameSpecimen: false, sameUrineSample: true }]) {
      expect(engine.evaluate(engine.inputFromValues(values, { potassiumIndex: facts }), profile)).toMatchObject({ valid: false, reasonCode: 'different-specimens' });
    }
    expect(engine.evaluate(engine.inputFromValues(values, { potassiumIndex: { sameUrineSample: true } }), profile)).toMatchObject({ valid: true, context: { sameSpecimen: 'confirmed' } });
    expect(engine.evaluate(engine.inputFromValues(values, { sourceFormula: 'B_Cr', sameUrineSample: false }), profile)).toMatchObject({ valid: true, context: { sameSpecimen: 'assumed' } });
  });
  it('retains known timed material and collection facts on an explicit edit without adding a reference', () => {
    const context = { potassiumIndex: { sampleType: 'timed', sameSpecimen: 'confirmed', collectionHours: '12', durationKnown: true, collectionProblem: true, collectionStartAt: '2026-11-03T08:00', collectionEndAt: '2026-11-03T20:00', knownFacts: { diuretic: true } } };
    const result = engine.evaluate(engine.inputFromValues({ U_K: '40', U_Na: '60' }, context), profile);
    expect(result).toMatchObject({ valid: true, rawValue: 40, context: context.potassiumIndex, outOfRange: null, reference: null });
    expect(result.snapshot.context).toEqual(context.potassiumIndex);
  });
  it('reads raw DOM strings, passes scoped restoration, and ignores patient demographics', () => {
    const values = { U_K: '0', U_Na: '60', age: '18', sex: 'male' };
    const doc = { getElementById: id => id in values ? { value: values[id] } : null };
    const input = engine.readInputFromDocument(doc, { context: { potassiumIndex: { sampleType: 'timed' } } });
    expect(input).toMatchObject({ potassiumValue: '0', sodiumValue: '60', sampleType: 'timed' });
    expect(input).not.toHaveProperty('ageYears');
  });
});

describe('K/(K+Na) — serializable historical snapshot', () => {
  it('freezes raw operands, exact ratio, display, source policy and neutral decision together', () => {
    const mutablePolicy = JSON.parse(JSON.stringify(profile));
    const result = calculate({ potassiumValue: '40,5', sampleType: 'timed' }, mutablePolicy);
    const snapshot = engine.toSnapshot(result), saved = JSON.parse(JSON.stringify(snapshot));
    expect(saved).toMatchObject({ schema: 'clcr-potassium-index', version: 1, sourceFormula: 'K_frac', profileId: 'KFR_2026_11', profileVersion: 1,
      input: { potassiumValue: '40,5', sodiumValue: '60', potassiumUnit: 'mmol/L', sodiumUnit: 'mmol/L' }, context: { sampleType: 'timed', sameSpecimen: 'assumed' },
      exactValue: { numerator: '2700', denominator: '67' }, rawValue: 40.298507462686565, assessment: 'unassessed', outOfRange: null, tone: 'neutral', reference: null });
    mutablePolicy.notes.meaning = 'Changed later';
    expect(snapshot.notes.meaning).toBe(profile.notes.meaning);
    expect(snapshot.policy.notes.meaning).toBe(profile.notes.meaning);
    expect(snapshot.sources).toEqual(profile.sources);
    expect(Object.isFrozen(snapshot.input)).toBe(true);
    expect(snapshot).not.toBe(result.snapshot);
    expect(snapshot).not.toHaveProperty('snapshot');
  });
  it('never serializes an invalid result as a valid saved measurement', () => {
    expect(engine.toSnapshot(calculate({ potassiumValue: '0', sodiumValue: '0' }))).toBeNull();
    expect(engine.toSnapshot(null)).toBeNull();
  });
});
