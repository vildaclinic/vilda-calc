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
    age: { years: 16, months: 0, precision: 'month' },
    specimen: 'serum', measurementKind: 'basal',
    assay: {
      profileId: 'mayo-lh-pediatric', methodId: 'anshlite-lh-clia',
      profileVersion: data.profiles.find((profile) => profile.id === 'mayo-lh-pediatric').version,
      confirmation: 'configured',
    },
    puberty: { kind: 'G', stage: 3, appliesToCurrentContext: true, source: 'current-patient' },
    treatment: { context: 'none', gnrha: 'no', sexSteroids: 'no' },
    ...overrides,
  };
}

function evaluate(overrides = {}, reference = data) {
  return engine.evaluate(input(overrides), reference);
}

describe('LH/FSH — zapisany profil oznaczenia', () => {
  it('ocenia zgodny aktywny profil i zachowuje odrębne pochodzenie konfiguracji', () => {
    const result = evaluate();
    expect(result.biochemical.byAge.status).toBe('within');
    expect(result.biochemical.byStage.status).toBe('within');
    expect(result.input.assay).toEqual(input().assay);
    expect(result.summary.status).toBe('compared');
    expect(result.engineVersion).toBe('1.5.0');
  });

  it.each(['', undefined, '2026-01-01.1'])('odrzuca niezgodną lub brakującą wersję %s', (profileVersion) => {
    const result = evaluate({ assay: { ...input().assay, profileVersion } });
    expect(result.biochemical.primary).toBeNull();
    expect(result.biochemical.reasonCodes).toContain('configured_profile_version_mismatch');
  });

  it.each([
    { methodId: 'roche-elecsys-fsh-eclia' },
    { profileId: 'mayo-fsh-pediatric' },
    { profileId: 'missing-profile' },
    { confirmation: 'unknown' },
  ])('nie przenosi konfiguracji na inną metodę/profil: %j', (assay) => {
    const result = evaluate({ assay: { ...input().assay, ...assay } });
    expect(result.biochemical.primary).toBeNull();
  });

  it('sprawdza aktywność profilu także po zapisaniu konfiguracji', () => {
    const reference = structuredClone(data);
    reference.profiles.find((profile) => profile.id === input().assay.profileId).active = false;
    const result = evaluate({}, reference);
    expect(result.biochemical.reasonCodes).toContain('profile_not_active');
    expect(result.biochemical.primary).toBeNull();
  });

  it('dopuszcza historyczne reported bez dodawania obowiązkowej wersji konfiguracji', () => {
    const assay = { ...input().assay, confirmation: 'reported' };
    delete assay.profileVersion;
    const result = evaluate({ assay });
    expect(result.biochemical.byAge.status).toBe('within');
    expect(result.input.assay).not.toHaveProperty('profileVersion');
  });

  it('FSH wymaga własnego profilu i metody', () => {
    const profile = data.profiles.find((candidate) => candidate.id === 'mayo-fsh-pediatric');
    const result = evaluate({ analyte: 'fsh', assay: { profileId: profile.id, profileVersion: profile.version, methodId: profile.method.id, confirmation: 'configured' } });
    expect(result.biochemical.byAge.status).toBe('within');
    expect(result.biochemical.byAge.range.profileId).toBe('mayo-fsh-pediatric');
  });
});

describe('LH/FSH — bieżący kontekst nie udaje daty pobrania', () => {
  it('używa jawnego wieku i obserwacji bez wytwarzania dat lub appliesToSample', () => {
    const result = evaluate();
    expect(result.ageAtSample).toMatchObject({ status: 'known', source: 'reported-age', precision: 'month', lowerYears: 16, upperInclusive: false });
    expect(result.input).toMatchObject({ contextBasis: 'current-patient', birthDateISO: null, sampleDateISO: null });
    expect(result.input.puberty).toMatchObject({ assessedAtISO: null, appliesToCurrentContext: true, appliesToSample: false });
    expect(result.clinical.code).toBe('timing_not_abnormal');
  });

  it.each([
    ['current-patient', 'Brak wiarygodnego wieku w bieżącym kontekście pacjenta.'],
    ['sample', 'Brak wiarygodnego wieku w dniu pobrania.'],
    [undefined, 'Brak wiarygodnego wieku w dniu pobrania.'],
  ])('opisuje brak wieku zgodnie z rzeczywistą podstawą kontekstu %s', (contextBasis, expected) => {
    const result = evaluate({ contextBasis, age: null });
    expect(result.clinical).toMatchObject({ code: 'missing_age', text: expected });
  });

  it.each([
    ['current-patient', 'względem wieku w bieżącym kontekście pacjenta.'],
    ['sample', 'względem dnia pobrania.'],
    [undefined, 'względem dnia pobrania.'],
  ])('nie przypisuje niepewnego początku fikcyjnej dacie pobrania w trybie %s', (contextBasis, expected) => {
    const result = evaluate({ contextBasis, onset: { kind: 'G', age: { years: 16, precision: 'year' } } });
    expect(result.clinical.code).toBe('onset_context_uncertain');
    expect(result.clinical.text).toContain(expected);
  });

  it.each([undefined, 'sample', 'invalid'])('sama flaga bieżącego kontekstu nie działa w trybie %s', (contextBasis) => {
    const result = evaluate({ contextBasis });
    expect(result.biochemical.byAge.status).toBe('within');
    expect(result.biochemical.byStage.status).toBe('unavailable');
    expect(result.clinical.code).toBe('missing_puberty_assessment');
  });

  it.each(['2025-10-04', 'invalid-date'])('flaga bieżącego kontekstu nie wiąże obserwacji z datą %s', (sampleDateISO) => {
    const result = evaluate({ sampleDateISO });
    expect(result.biochemical.byStage.status).toBe('unavailable');
    expect(result.input.puberty.appliesToSample).toBe(false);
  });

  it('historyczna próbka potrzebuje własnej obserwacji i liczy wiek z dat', () => {
    const result = evaluate({
      contextBasis: 'sample', birthDateISO: '2010-10-04', sampleDateISO: '2025-10-04',
      puberty: { kind: 'G', stage: 2, assessedAtISO: '2025-10-04' },
    });
    expect(result.ageAtSample).toMatchObject({ source: 'dates', lowerYears: 15, upperYears: 15 });
    expect(result.biochemical.byStage.status).not.toBe('unavailable');
    expect(result.input.puberty).not.toHaveProperty('appliesToCurrentContext');
  });

  it('nie wyprowadza rodzaju cechy ze stadium ani płci', () => {
    const result = evaluate({ puberty: { kind: 'unspecified', stage: 3, appliesToCurrentContext: true } });
    expect(result.biochemical.byStage.status).toBe('unavailable');
    expect(result.clinical.code).toBe('ambiguous_puberty_kind');
    expect(result.input.puberty.kind).toBe('unspecified');
  });

  it('wczesne G4 pozostaje ostrzeżeniem niezależnie od zgodnego RI stadium', () => {
    const result = evaluate({ age: { years: 6, precision: 'year' }, puberty: { kind: 'G', stage: 4, appliesToCurrentContext: true } });
    expect(result.biochemical.byStage.status).toBe('within');
    expect(result.clinical.code).toBe('early_development');
    expect(result.summary).toMatchObject({ status: 'attention', code: 'early_development' });
  });

  it('aktualny pomiar Pradera pozwala ocenić obecność początku, ale nie wytwarza stadium', () => {
    const result = evaluate({ puberty: {}, testicularVolume: { value: 4, unit: 'mL', method: 'Prader', appliesToCurrentContext: true } });
    expect(result.clinical.code).toBe('timing_not_abnormal');
    expect(result.input.puberty.stage).toBeNull();
    expect(result.biochemical.byStage.status).toBe('unavailable');
    expect(result.input.testicularVolume).toMatchObject({ appliesToCurrentContext: true, appliesToSample: false, assessedAtISO: null });
  });

  it('niemowlęcy pomiar z bieżącego kontekstu zachowuje komunikat o braku kryterium objętości', () => {
    const result = evaluate({ age: { years: 0, months: 3, precision: 'month' }, puberty: {}, testicularVolume: { value: 8, unit: 'mL', method: 'Prader', appliesToCurrentContext: true } });
    expect(result.clinical.reasonCodes).toContain('infant_testicular_volume_not_validated');
    expect(result.clinical.text).toContain('8 mL');
    expect(result.summary.status).toBe('attention');
  });

  it('bez nowych pól zachowuje dawny kształt wejścia i nie dopisuje nowego zakresu', () => {
    const source = input();
    delete source.contextBasis;
    delete source.assay.profileVersion;
    source.assay.confirmation = 'reported';
    source.puberty = { kind: 'G', stage: 3, appliesToSample: true };
    delete source.treatment.context;
    const result = engine.evaluate(source, data);
    expect(result.input).not.toHaveProperty('contextBasis');
    expect(result.input.puberty).not.toHaveProperty('appliesToCurrentContext');
    expect(result.input.testicularVolume).not.toHaveProperty('appliesToCurrentContext');
    expect(result.input.treatment).toEqual({ gnrha: 'no', sexSteroids: 'no' });
    expect(result.input).not.toHaveProperty('reportedRange');
    expect(result).not.toHaveProperty('reportedRange');
    expect(result.biochemical.byStage.status).toBe('within');
  });
});

describe('LH/FSH — jedna odpowiedź o leczeniu bez zgadywania konkretnej terapii', () => {
  it.each([
    { context: 'hormonal' },
    { context: 'hormonal', gnrha: 'no', sexSteroids: 'no' },
    { context: 'none', gnrha: 'yes', sexSteroids: 'no' },
  ])('leczenie %j blokuje RI bazalne również przy sprzecznym braku leczenia', (treatment) => {
    const result = evaluate({ treatment });
    expect(result.biochemical.primary).toBeNull();
    expect(result.biochemical.reasonCodes).toContain('treatment_requires_separate_profile');
    expect(result.clinical.code).toBe('treatment_context');
    expect(result.input.treatment.gnrha).toBe(treatment.gnrha || 'unknown');
  });

  it.each([
    { context: 'none' },
    { context: 'unknown' },
    { context: 'unknown', gnrha: 'no', sexSteroids: 'no' },
    { context: 'invalid', gnrha: 'no', sexSteroids: 'no' },
    { gnrha: 'no' },
  ])('nie domyśla braku steroidów ani nie wykorzystuje sprzecznego starego no/no: %j', (treatment) => {
    const result = evaluate({ treatment });
    expect(result.biochemical.primary).toBeNull();
    expect(result.biochemical.reasonCodes).toContain('treatment_context_unknown');
  });

  it('ogólne leczenie zachowuje nieznane poszczególne leki w zapisie', () => {
    expect(evaluate({ treatment: { context: 'hormonal' } }).input.treatment).toEqual({ context: 'hormonal', gnrha: 'unknown', sexSteroids: 'unknown' });
  });

  it('po stymulacji nie stosuje bazalnego RI mimo skonfigurowanej metody', () => {
    const result = evaluate({ measurementKind: 'stimulated' });
    expect(result.biochemical.reasonCodes).toContain('non_basal_or_unknown_measurement');
    expect(result.biochemical.primary).toBeNull();
  });
});

describe('LH/FSH — porównanie liczb z zakresem przepisanym z wyniku', () => {
  it.each([
    ['0,1–2', '2', 'within', { operator: '>=', value: 0.1 }, { operator: '<=', value: 2 }],
    ['0.1 - 2', '0,05', 'below', { operator: '>=', value: 0.1 }, { operator: '<=', value: 2 }],
    ['0.1—2', '3', 'above', { operator: '>=', value: 0.1 }, { operator: '<=', value: 2 }],
    ['<2', '2', 'above', null, { operator: '<', value: 2 }],
    ['≤2', '2', 'within', null, { operator: '<=', value: 2 }],
    ['<=2', '2', 'within', null, { operator: '<=', value: 2 }],
    ['>2', '2', 'below', { operator: '>', value: 2 }, null],
    ['≥2', '2', 'within', { operator: '>=', value: 2 }, null],
    ['>=2', '2', 'within', { operator: '>=', value: 2 }, null],
  ])('%s wobec wyniku %s daje %s', (text, value, status, lower, upper) => {
    const result = evaluate({ value, reportedRange: { text, unit: 'IU/L' } });
    expect(result.reportedRange).toEqual({ status, raw: text, unit: 'IU/L', lower, upper, reasonCodes: [] });
    expect(result.input.reportedRange).toEqual({ text, unit: 'IU/L' });
    expect(result.input.localReference).toBeNull();
    expect(result.biochemical.local.status).toBe('unavailable');
  });

  it.each([
    ['<1', '0,1–1', 'indeterminate'],
    ['<0,1', '0,1–1', 'below'],
    ['≤0,1', '0,1–1', 'indeterminate'],
    ['>1', '0,1–1', 'above'],
    ['≥1', '0,1–1', 'indeterminate'],
    ['<1', '<1', 'within'],
    ['<LOD', '0,1–1', 'indeterminate'],
    ['<LOQ', '≤1', 'indeterminate'],
  ])('wynik %s względem %s zachowuje ograniczenie oznaczenia: %s', (value, text, status) => {
    const result = evaluate({ value, reportedRange: { text, unit: 'mIU/mL' } });
    expect(result.reportedRange.status).toBe(status);
    expect(result.measurement.plotValue).toBeNull();
    expect(result.reportedRange.reasonCodes.length).toBe(status === 'indeterminate' ? 1 : 0);
  });

  it.each(['2–1', '-1–2', '2', 'norma', '<LOD', '1-2 mg/L', '0,1,2–3', '1e999–2'])('odrzuca zakres %s zamiast zgadywać', (text) => {
    const result = evaluate({ reportedRange: { text, unit: 'IU/L' } });
    expect(result.reportedRange.status).toBe('unavailable');
    expect(result.reportedRange.reasonCodes).toContain('invalid_reported_range');
    expect(result.limitations).toContain('invalid_reported_range');
    expect(result.summary.status).toBe('limited');
    expect(JSON.stringify(result)).not.toContain('Infinity');
  });

  it('nie konwertuje nieznanej jednostki wpisanego zakresu', () => {
    const result = evaluate({ reportedRange: { text: '0,1–2', unit: 'IU/mL' } });
    expect(result.reportedRange).toMatchObject({ status: 'unavailable', lower: null, upper: null, reasonCodes: ['unsupported_reported_range_unit'] });
  });

  it.each(['', '   '])('puste pole %j nie tworzy nowego zakresu', (text) => {
    const result = evaluate({ reportedRange: { text, unit: 'IU/L' } });
    expect(result).not.toHaveProperty('reportedRange');
    expect(result.input).not.toHaveProperty('reportedRange');
  });

  it('porównuje liczby bez tworzenia automatycznego RI lub populacji dla nieznanej metody', () => {
    const result = evaluate({ assay: {}, reportedRange: { text: '0,1–3', unit: 'IU/L' } });
    expect(result.reportedRange.status).toBe('within');
    expect(result.reportedRange).not.toHaveProperty('population');
    expect(result.biochemical.primary).toBeNull();
    expect(result.summary).toMatchObject({ status: 'compared', code: 'reported_range_comparison_available' });
  });

  it('wskazuje niezgodność zakresu przepisanej kartki z odrębnym katalogiem', () => {
    const result = evaluate({ reportedRange: { text: '0,1–1', unit: 'IU/L' } });
    expect(result.reportedRange.status).toBe('above');
    expect(result.biochemical.byAge.status).toBe('within');
    expect(result.biochemical.byStage.status).toBe('within');
    expect(result.limitations).toContain('reported_range_reference_disagreement');
    expect(result.summary).toMatchObject({ status: 'attention', code: 'reported_range_reference_disagreement' });
  });

  it('zakres wpisany jako 0–20 nie wycisza LH15 powyżej zgodnego katalogowego RI', () => {
    const result = evaluate({ value: '15', reportedRange: { text: '0–20', unit: 'IU/L' } });
    expect(result.reportedRange.status).toBe('within');
    expect(result.biochemical.byAge.status).toBe('above');
    expect(result.biochemical.byStage.status).toBe('above');
    expect(result.summary).toEqual({ status: 'attention', code: 'reported_range_reference_disagreement', title: 'Porównania zakresów wymagają uzgodnienia' });
    expect(result.limitations).toContain('reported_range_reference_disagreement');
  });

  it.each([
    ['2', '0–3', 'within', 'compared', 'reported_range_comparison_available'],
    ['15', '0–10', 'above', 'attention', 'outside_reported_range'],
  ])('zgodne porównania dla LH%s i zakresu %s nie tworzą pozornego konfliktu', (value, text, comparison, status, code) => {
    const result = evaluate({ value, reportedRange: { text, unit: 'IU/L' } });
    expect(result.reportedRange.status).toBe(comparison);
    expect(result.biochemical.byAge.status).toBe(comparison);
    expect(result.biochemical.byStage.status).toBe(comparison);
    expect(result.limitations).not.toContain('reported_range_reference_disagreement');
    expect(result.summary).toMatchObject({ status, code });
  });

  it('dodatni wywiad pozostaje nadrzędny także przy rozbieżności zakresów', () => {
    const result = evaluate({ value: '15', history: { cnsSymptoms: 'yes' }, reportedRange: { text: '0–20', unit: 'IU/L' } });
    expect(result.limitations).toContain('reported_range_reference_disagreement');
    expect(result.summary).toMatchObject({ status: 'attention', code: 'reported_cns_symptoms' });
  });

  it('zakres z wydruku nie usuwa ostrzeżenia o wczesnym rozwoju', () => {
    const result = evaluate({ age: { years: 6, precision: 'year' }, puberty: { kind: 'G', stage: 4, appliesToCurrentContext: true }, reportedRange: { text: '0–10', unit: 'IU/L' } });
    expect(result.reportedRange.status).toBe('within');
    expect(result.summary).toMatchObject({ status: 'attention', code: 'early_development' });
  });

  it.each(['cnsSymptoms', 'regression'])('zakres z wydruku nie usuwa dodatniego wywiadu %s', (field) => {
    const result = evaluate({ history: { [field]: 'yes' }, reportedRange: { text: '0–10', unit: 'IU/L' } });
    expect(result.reportedRange.status).toBe('within');
    expect(result.summary.status).toBe('attention');
    expect(result.summary.code).toBe(field === 'cnsSymptoms' ? 'reported_cns_symptoms' : 'reported_puberty_regression');
  });

  it('nie określa obrazu klinicznego przy nieznanym leczeniu mimo zgodności liczbowej', () => {
    const result = evaluate({ treatment: { context: 'unknown' }, reportedRange: { text: '0–10', unit: 'IU/L' } });
    expect(result.reportedRange.status).toBe('within');
    expect(result.biochemical.primary).toBeNull();
    expect(result.summary.status).toBe('limited');
  });

  it('nie rozstrzyga wyniku bez liczbowego oznaczenia tylko dlatego, że zakres jest poprawny', () => {
    const result = evaluate({ value: 'błąd', reportedRange: { text: '0–10', unit: 'IU/L' } });
    expect(result.reportedRange).toMatchObject({ status: 'unavailable', reasonCodes: ['invalid_measurement'] });
    expect(result.summary.status).toBe('invalid');
  });
});
