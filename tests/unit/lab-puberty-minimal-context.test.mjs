import { beforeAll, describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

let engine;
let data;
beforeAll(() => {
  const browser = {};
  loadBrowserScript('vilda_lab_puberty_data.js', browser);
  loadBrowserScript('vilda_lab_puberty.js', browser);
  engine = browser.VildaLabPuberty;
  data = browser.VildaLabPubertyData;
});

function input(overrides = {}) {
  return {
    analyte: 'lh', value: '2', unit: 'IU/L', sex: 'M',
    contextBasis: 'current-patient', birthDateISO: null, sampleDateISO: null,
    age: { years: 2, months: 9, days: null, precision: 'month' },
    specimen: 'serum', measurementKind: 'unknown',
    assay: { profileId: 'mayo-lh-pediatric', profileVersion: '2026-10-03.1', methodId: 'anshlite-lh-clia', confirmation: 'configured' },
    puberty: { kind: 'G', stage: 3, appliesToCurrentContext: true, source: 'current-patient' },
    treatment: { context: 'unknown', gnrha: 'unknown', sexSteroids: 'unknown' },
    ...overrides,
  };
}

const untreated = { context: 'none', gnrha: 'no', sexSteroids: 'no' };
function evaluate(overrides = {}, reference = data) {
  return engine.evaluate(input(overrides), reference);
}

describe('LH/FSH — minimalne dane i jawnie warunkowe porównanie', () => {
  it('M2 lata 9 miesięcy/G3/LH2: pokazuje obie relacje bez dopisywania bazalnego badania lub braku leczenia', () => {
    const source = input();
    const before = structuredClone(source);
    const result = engine.evaluate(source, data);
    expect(source).toEqual(before);
    expect(result.engineVersion).toBe('1.3.0');
    expect(result.input).toMatchObject(before);
    expect(result.ageAtSample).toMatchObject({ lowerYears: 2.75, source: 'reported-age', precision: 'month' });
    expect(result.input.puberty.appliesToSample).toBe(false);
    expect(result.biochemical).toMatchObject({ status: 'unavailable', primary: null, byAge: { status: 'unavailable' }, byStage: { status: 'unavailable' } });
    expect(result.referencePreview).toMatchObject({
      kind: 'conditional-basal-untreated',
      reasonCodes: ['non_basal_or_unknown_measurement', 'treatment_context_unknown'],
      byAge: { status: 'above', range: { id: 'lh-m-age1-8', bounds: { lower: null, upper: { operator: '<=', value: 0.5 }, censoredLower: { operator: '<', value: 0.02 } } } },
      byStage: { status: 'within', range: { id: 'lh-m-g3', bounds: { lower: { operator: '>=', value: 0.09 }, upper: { operator: '<=', value: 4.2 } } } },
    });
    expect(result.referencePreview.reasonCodes).not.toContain('profile_measurement_kind_mismatch');
    expect(result.limitations).toContain('conditional_reference_comparison');
    expect(result.provenance.sourceIds).toContain('mayo-lhped-62999');
    expect(result.summary).toMatchObject({ status: 'attention', code: 'early_development' });
  });

  it('jawne bazalne bez leczenia wykorzystuje identyczne zakresy w pełnym porównaniu', () => {
    const conditional = evaluate();
    const explicit = evaluate({ measurementKind: 'basal', treatment: untreated });
    expect(explicit).not.toHaveProperty('referencePreview');
    expect(explicit.limitations).not.toContain('conditional_reference_comparison');
    expect(explicit.biochemical.byAge).toEqual(conditional.referencePreview.byAge);
    expect(explicit.biochemical.byStage).toEqual(conditional.referencePreview.byStage);
    expect(explicit.summary).toEqual(conditional.summary);
  });

  it.each([undefined, null, '', 'unknown'])('brak rodzaju oznaczenia %s nie ustala bazalnego, nawet gdy brak leczenia jest znany', (measurementKind) => {
    const result = evaluate({ measurementKind, treatment: untreated });
    expect(result.referencePreview.reasonCodes).toEqual(['non_basal_or_unknown_measurement']);
    expect(result.input.measurementKind).toBe('unknown');
    expect(result.input.treatment).toEqual(untreated);
  });

  it.each([
    undefined, null, {}, { gnrha: 'no' }, { sexSteroids: false },
    { context: 'unknown', gnrha: 'no', sexSteroids: 'no' },
    { context: 'none', gnrha: 'unknown', sexSteroids: 'no' },
  ])('bazalne z niepełnym kontekstem leczenia %j daje tylko warunkowy podgląd', (treatment) => {
    const result = evaluate({ measurementKind: 'basal', treatment });
    expect(result.referencePreview.reasonCodes).toEqual(['treatment_context_unknown']);
    expect(result.biochemical.primary).toBeNull();
  });

  it.each([
    {}, { kind: 'unspecified', stage: 3, appliesToCurrentContext: true },
    { kind: 'P', stage: 3, appliesToCurrentContext: true },
    { kind: 'Th', stage: 3, appliesToCurrentContext: true },
    { kind: 'G', stage: 3, appliesToCurrentContext: false },
  ])('wiek jest użyteczny bez właściwego stadium %j', (puberty) => {
    const result = evaluate({ puberty });
    expect(result.referencePreview.byAge.status).toBe('above');
    expect(result.referencePreview.byStage.status).toBe('unavailable');
    expect(result.biochemical.status).toBe('unavailable');
  });

  it('nie przypisuje dzisiejszego stadium wcześniejszej próbce', () => {
    const result = evaluate({ contextBasis: 'sample', birthDateISO: '2021-01-04', sampleDateISO: '2023-10-04' });
    expect(result.referencePreview.byAge.status).toBe('above');
    expect(result.referencePreview.byStage.status).toBe('unavailable');
    expect(result.input.puberty.appliesToSample).toBe(false);
  });

  it('FSH używa własnego profilu i nie wymaga stadium do relacji względem wieku', () => {
    const profile = data.profiles.find((candidate) => candidate.id === 'mayo-fsh-pediatric');
    const result = evaluate({ analyte: 'fsh', puberty: {}, assay: { profileId: profile.id, profileVersion: profile.version, methodId: profile.method.id, confirmation: 'configured' } });
    expect(result.referencePreview.byAge.range.profileId).toBe(profile.id);
    expect(result.referencePreview.byAge.status).not.toBe('unavailable');
    expect(result.referencePreview.byStage.status).toBe('unavailable');
    expect(result.input.treatment).toEqual(input().treatment);
  });
});

describe('Warunkowe porównanie — leczenie i protokół pozostają twardymi ograniczeniami', () => {
  it.each(['stimulated', 'random', 'basal ', 'UNKNOWN', 0, false, {}, []])('nie akceptuje stymulacji ani nieprawidłowego rodzaju %j', (measurementKind) => {
    const result = evaluate({ measurementKind });
    expect(result).not.toHaveProperty('referencePreview');
    expect(result.biochemical.status).toBe('unavailable');
  });

  it.each([
    { context: 'hormonal' },
    { context: 'hormonal', gnrha: 'no', sexSteroids: 'no' },
    { context: 'none', gnrha: 'yes', sexSteroids: 'no' },
    { gnrha: true }, { sexSteroids: 'yes' }, { sexSteroids: true },
    { context: 'unknown', gnrha: 'no', sexSteroids: 'yes' },
    { context: 'typo' }, { context: false },
    { gnrha: 'false' }, { sexSteroids: 0 }, { gnrha: {} },
    'unknown', false, 0, [], new Date('2026-01-01'), new Map(),
  ])('dodatnie lub wadliwe leczenie %j nie staje się brakiem danych', (treatment) => {
    const result = evaluate({ treatment });
    expect(result).not.toHaveProperty('referencePreview');
    expect(result.biochemical.status).toBe('unavailable');
    expect(result.input.treatment).not.toEqual(untreated);
  });
});

describe('Warunkowe porównanie — pozostałe bramki nie są omijane', () => {
  it.each([
    { analyte: 'tsh' }, { value: 'n/a' }, { value: '-1' }, { unit: 'ng/mL' },
    { age: null }, { age: { years: 2, precision: 'invalid' } },
    { age: { years: 18, months: 0, precision: 'month' } },
    { sex: null }, { sex: 'unknown' }, { specimen: 'plasma' }, { specimen: 'unknown' },
    { birthDateISO: '2021-01-01' }, { sampleDateISO: 'invalid' },
    { age: { years: 0, months: 3, precision: 'month' } },
    { age: { years: 0, months: 3, precision: 'month' }, preterm: 'yes' },
    { age: { years: 0, months: 3, precision: 'month' }, preterm: 'no', gestationalAgeWeeks: 35 },
  ])('nie pokazuje podglądu przy dodatkowej przeszkodzie %j', (overrides) => {
    const result = evaluate(overrides);
    expect(result).not.toHaveProperty('referencePreview');
    expect(result.biochemical.status).toBe('unavailable');
  });

  it.each([
    { profileId: 'missing' }, { profileId: 'mayo-fsh-pediatric' },
    { methodId: 'other' }, { confirmation: 'unknown' }, { profileVersion: 'old' },
  ])('wymaga właściwej i aktualnej metody %j', (assay) => {
    expect(evaluate({ assay: { ...input().assay, ...assay } })).not.toHaveProperty('referencePreview');
  });

  it.each([
    ['active', false], ['examinationType', 'stimulated'], ['examinationType', undefined],
    ['material', 'plasma'], ['unit', 'ng/mL'], ['sourceId', 'missing'],
    ['population', {}], ['scope', {}], ['rows', null],
  ])('nie osłabia walidacji profilu: %s=%j', (key, value) => {
    const reference = structuredClone(data);
    reference.profiles.find((profile) => profile.id === 'mayo-lh-pediatric')[key] = value;
    expect(evaluate({}, reference)).not.toHaveProperty('referencePreview');
  });

  it('bez polityki niemowlęcej nie omija walidacji biochemicznej', () => {
    expect(evaluate({}, { ...data, biochemicalPolicy: null })).not.toHaveProperty('referencePreview');
  });

  it('nie emituje pustego podglądu, gdy brak obu wierszy', () => {
    const reference = structuredClone(data);
    reference.profiles.find((profile) => profile.id === 'mayo-lh-pediatric').rows = [];
    expect(evaluate({}, reference)).not.toHaveProperty('referencePreview');
  });

  it('przy właściwym kontekście niemowlęcym zachowuje zakres wieku i jego ograniczenie', () => {
    const result = evaluate({ age: { years: 0, months: 3, precision: 'month' }, preterm: 'no' });
    expect(result.referencePreview.byAge.range.id).toBe('lh-m-age-under1');
    expect(result.referencePreview.byStage.status).toBe('unavailable');
    expect(result.limitations).toContain('broad_infant_reference_not_full_minipuberty_assessment');
    expect(result.summary).toMatchObject({ status: 'attention', code: 'early_development' });
  });
});

describe('Warunkowe porównanie — cenzorowanie i uczciwe podsumowanie', () => {
  it.each([
    ['<LOD', 'indeterminate', 'indeterminate'],
    ['<0,02', 'within', 'below'],
    ['<2', 'indeterminate', 'indeterminate'],
    ['>2', 'above', 'indeterminate'],
  ])('%s zachowuje relacje przedziałów zamiast punktu', (value, ageStatus, stageStatus) => {
    const result = evaluate({ value });
    expect(result.measurement.isExact).toBe(false);
    expect(result.measurement.plotValue).toBeNull();
    expect(result.input.value).toBe(value);
    expect(result.referencePreview.byAge.status).toBe(ageStatus);
    expect(result.referencePreview.byStage.status).toBe(stageStatus);
    expect(result.summary.code).toBe('early_development');
  });

  it.each(['2', '20'])('sam podgląd dla LH%s nie potwierdza stosowalności ani prawidłowości', (value) => {
    const result = evaluate({ age: { years: 16, months: 0, precision: 'month' }, value });
    expect(result.summary).toMatchObject({ status: 'limited', code: 'conditional_reference_comparison' });
    expect(result.biochemical.primary).toBeNull();
  });

  it('kliniczny alert OUN ma pierwszeństwo także w podglądzie', () => {
    const result = evaluate({ age: { years: 16, months: 0, precision: 'month' }, history: { cnsSymptoms: 'yes' } });
    expect(result.summary).toMatchObject({ status: 'attention', code: 'reported_cns_symptoms' });
    expect(result.referencePreview.byStage.status).toBe('within');
  });

  it('rozbieżność z wpisanym zakresem wymaga uzgodnienia liczbowego bez przyznania RI stosowalności', () => {
    const result = evaluate({ age: { years: 16, months: 0, precision: 'month' }, value: '15', reportedRange: { text: '0–20', unit: 'IU/L' } });
    expect(result.reportedRange.status).toBe('within');
    expect(result.referencePreview.byAge.status).toBe('above');
    expect(result.summary).toEqual({ status: 'attention', code: 'reported_range_reference_disagreement', title: 'Porównania liczbowe zakresów wymagają uzgodnienia' });
    expect(result.limitations).toContain('reported_range_reference_disagreement');
    expect(result.biochemical.status).toBe('unavailable');
  });

  it('zgodny zakres z wydruku nie usuwa warunkowości', () => {
    const result = evaluate({ age: { years: 16, months: 0, precision: 'month' }, reportedRange: { text: '0–20', unit: 'IU/L' } });
    expect(result.summary).toMatchObject({ status: 'limited', code: 'conditional_reference_comparison' });
    expect(result.limitations).not.toContain('reported_range_reference_disagreement');
  });

  it('rozbieżność liczbowa nie usuwa ostrzeżenia wczesnego rozwoju', () => {
    const result = evaluate({ reportedRange: { text: '0–20', unit: 'IU/L' } });
    expect(result.limitations).toContain('reported_range_reference_disagreement');
    expect(result.summary).toMatchObject({ status: 'attention', code: 'early_development' });
  });
});
