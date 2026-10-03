import { beforeAll, describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

let engine;
let data;
beforeAll(() => {
  const browserGlobal = {};
  loadBrowserScript('vilda_lab_puberty_data.js', browserGlobal);
  loadBrowserScript('vilda_lab_puberty.js', browserGlobal);
  engine = browserGlobal.VildaLabPuberty;
  data = browserGlobal.VildaLabPubertyData;
});

function assay(analyte = 'lh') {
  return {
    profileId: `mayo-${analyte}-pediatric`,
    methodId: analyte === 'lh' ? 'anshlite-lh-clia' : 'roche-elecsys-fsh-eclia',
    confirmation: 'reported',
  };
}

function input(overrides = {}) {
  const baseline = {
    analyte: 'lh', value: '2', unit: 'IU/L', sex: 'M',
    birthDateISO: '2020-10-03', sampleDateISO: '2026-10-03',
    specimen: 'serum', measurementKind: 'basal', assay: assay(),
    puberty: { kind: 'G', stage: 4, assessedAtISO: '2026-10-03', appliesToSample: true, source: 'local-confirmed' },
    history: { progression: 'unknown', growthAcceleration: 'unknown', cnsSymptoms: 'unknown', regression: 'no' },
    treatment: { gnrha: 'no', sexSteroids: 'no' }, preterm: 'no',
  };
  return { ...baseline, ...overrides };
}

function assess(overrides = {}, referenceData = data) {
  return engine.evaluate(input(overrides), referenceData);
}

function selected(result) {
  const keys = { local: 'local', stage: 'byStage', age: 'byAge' };
  return result.biochemical.primary ? result.biochemical[keys[result.biochemical.primary]] : null;
}

function boundRange(lower = 0.1, upper = 1) {
  return {
    lower: lower == null ? null : { operator: '>=', value: lower },
    upper: upper == null ? null : { operator: '<=', value: upper },
  };
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

describe('VildaLabPuberty — wynik źródłowy i cenzurowanie', () => {
  it.each(['IU/L', 'mIU/mL'])('zachowuje równoważność jednostki %s i nie gubi przecinka dziesiętnego', (unit) => {
    const result = engine.parseMeasurement('2,5', unit);
    expect(result).toMatchObject({ status: 'valid', operator: '=', value: 2.5, unit: 'IU/L', isExact: true, plotValue: 2.5 });
    expect(result.sourceUnit).toBe(unit);
    expect(result.sourceValue).toBe(2.5);
  });

  it.each([
    ['<0,02', '<', 0.02], ['≤0,02', '<=', 0.02],
    ['>0.5', '>', 0.5], ['≥0.5', '>=', 0.5],
  ])('normalizuje %s, zachowując nierówność i brak dokładnego punktu trendu', (raw, operator, value) => {
    const result = engine.parseMeasurement(raw, 'mIU/mL');
    expect(result).toMatchObject({ status: 'valid', raw, operator, value, isExact: false, plotValue: null, unit: 'IU/L', sourceUnit: 'mIU/mL' });
  });

  it.each(['LOD', 'LOQ'])('nie wymyśla wartości liczbowej dla <%s', (limitKind) => {
    const result = engine.parseMeasurement(`<${limitKind}`, 'IU/L');
    expect(result).toMatchObject({ status: 'valid', operator: '<', value: null, isExact: false, plotValue: null, limitKind });
  });

  it('obsługuje typowany wynik z nierównością bez modyfikacji wejścia', () => {
    const source = deepFreeze({ operator: '<', value: 0.02 });
    expect(engine.parseMeasurement(source, 'IU/L')).toMatchObject({ status: 'valid', operator: '<', value: 0.02, plotValue: null });
    expect(source).toEqual({ operator: '<', value: 0.02 });
  });

  it.each([-1, NaN, Infinity, '', null])('odrzuca nieprawidłową wartość %s', (value) => {
    const result = engine.parseMeasurement(value, 'IU/L');
    expect(result.status).toBe('invalid');
    expect(result.reasonCodes.length).toBeGreaterThan(0);
  });

  it('nie zgaduje nieznanej jednostki', () => {
    expect(engine.parseMeasurement(2, 'IU/ml').status).toBe('invalid');
  });
});

describe('VildaLabPuberty — porównanie rzeczywistego przedziału wyniku z RI', () => {
  it.each([
    ['0.1', 'within'], ['1', 'within'], ['0.09', 'below'], ['1.01', 'above'],
    ['<0.1', 'below'], ['≤0.1', 'indeterminate'], ['<0.2', 'indeterminate'],
    ['>1', 'above'], ['≥1', 'indeterminate'], ['>0.5', 'indeterminate'],
  ])('%s wobec domkniętego RI [0.1, 1] daje %s', (raw, status) => {
    const measurement = engine.parseMeasurement(raw, 'IU/L');
    expect(engine.compareMeasurement(measurement, boundRange()).status).toBe(status);
  });

  it('rozróżnia górną granicę < od ≤ przy równości', () => {
    const measurement = engine.parseMeasurement(1.5, 'IU/L');
    const exclusive = { lower: null, upper: { operator: '<', value: 1.5 } };
    expect(engine.compareMeasurement(measurement, exclusive).status).toBe('above');
    expect(engine.compareMeasurement(measurement, boundRange(null, 1.5)).status).toBe('within');
    expect(engine.compareMeasurement(engine.parseMeasurement('<1.5', 'IU/L'), exclusive).status).toBe('within');
  });

  it('cenzurowana dolna granica normy nie staje się progiem niskiego LH', () => {
    const range = { lower: null, upper: { operator: '<=', value: 0.5 }, censoredLower: { operator: '<', value: 0.02 } };
    expect(engine.compareMeasurement(engine.parseMeasurement(0.01, 'IU/L'), range).status).toBe('within');
    expect(engine.compareMeasurement(engine.parseMeasurement('<0.02', 'IU/L'), range).status).toBe('within');
  });

  it('nie klasyfikuje nieznanego LOD jak zera ani raportowanej liczby', () => {
    expect(engine.compareMeasurement(engine.parseMeasurement('<LOD', 'IU/L'), boundRange()).status).toBe('indeterminate');
  });
});

describe('VildaLabPuberty — wiek w dniu pobrania i jego precyzja', () => {
  it('noworodek w dniu porodu ma poprawny wiek zero', () => {
    const result = engine.resolveAge({ birthDateISO: '2026-10-03', sampleDateISO: '2026-10-03' });
    expect(result).toMatchObject({ status: 'known', lowerYears: 0, upperYears: 0, upperInclusive: true, ageDays: 0 });
  });

  it('dokładne daty mają pierwszeństwo przed aktualnym i kostnym wiekiem', () => {
    const result = engine.resolveAge({ birthDateISO: '2020-10-03', sampleDateISO: '2026-10-03', age: { years: 12, precision: 'year' }, boneAgeYears: 9 });
    expect(result).toMatchObject({ status: 'known', lowerYears: 6, upperYears: 6, upperInclusive: true });
  });

  it('nie dzieli liczby dni przez stałe 365.25 przy urodzinach 29 lutego', () => {
    const result = engine.resolveAge({ birthDateISO: '2016-02-29', sampleDateISO: '2017-02-28' });
    expect(result).toMatchObject({ status: 'known', lowerYears: 1, upperYears: 1, upperInclusive: true, ageDays: 365 });
  });

  it('ręczny wiek w pełnych latach jest przedziałem [13,14)', () => {
    expect(engine.resolveAge({ age: { years: 13, precision: 'year' } })).toMatchObject({ status: 'known', precision: 'year', lowerYears: 13, upperYears: 14, upperInclusive: false });
  });

  it('ręczny wiek miesięczny nie udaje dokładnej daty', () => {
    const result = engine.resolveAge({ age: { years: 5, months: 6, precision: 'month' } });
    expect(result).toMatchObject({ status: 'known', precision: 'month', upperInclusive: false });
    expect(result.lowerYears).toBeCloseTo(5.5, 12);
    expect(result.upperYears).toBeCloseTo(5 + 7 / 12, 12);
    expect(result.ageDays).toBeNull();
  });

  it('zerowa liczba dni przy precyzji dziennej jest uzgodnionym punktem rocznicy', () => {
    const result = engine.resolveAge({ age: { years: 13, months: 0, days: 0, precision: 'day' } });
    expect(result).toMatchObject({ status: 'known', precision: 'day', lowerYears: 13, upperYears: 13, upperInclusive: true });
  });

  it('niezerowe dni bez dat kalendarzowych zachowują niepewność długości miesiąca', () => {
    const result = engine.resolveAge({ age: { years: 13, months: 0, days: 2, precision: 'day' } });
    expect(result.status).toBe('known');
    expect(result.lowerYears).toBeCloseTo(13 + 2 / (31 * 12), 12);
    expect(result.upperYears).toBeCloseTo(13 + 2 / (28 * 12), 12);
    expect(result.upperInclusive).toBe(true);
    expect(result.reasonCodes).toContain('manual_day_age_without_calendar_dates');
  });

  it('resztowe dni 13 lat 11 miesięcy 30 dni nie przekraczają 14. urodzin', () => {
    const age = { years: 13, months: 11, days: 30, precision: 'day' };
    const result = engine.resolveAge({ age });
    expect(result.status).toBe('known');
    expect(result.lowerYears).toBeLessThan(14);
    expect(result.upperYears).toBeLessThan(14);
    expect(assess({ birthDateISO: undefined, age, puberty: { kind: 'G', stage: 1, appliesToSample: true } }).clinical.code).toBe('timing_not_abnormal');
  });

  it('nie nadaje brakującej precyzji pozornej dokładności', () => {
    const result = engine.resolveAge({ age: { years: 6 } });
    expect(result.status).not.toBe('known');
    expect(result.lowerYears).toBeNull();
    expect(result.upperYears).toBeNull();
    expect(result.reasonCodes.length).toBeGreaterThan(0);
  });

  it.each([
    ['2020-02-30', '2026-10-03'], ['2026-10-04', '2026-10-03'],
    ['2020-10-03', '2026-13-03'],
  ])('nie zastępuje błędnej chronologii %s → %s ręcznym wiekiem', (birthDateISO, sampleDateISO) => {
    const result = engine.resolveAge({ birthDateISO, sampleDateISO, age: { years: 6, precision: 'year' } });
    expect(result.status).toBe('invalid');
    expect(result.reasonCodes.length).toBeGreaterThan(0);
  });
});

describe('VildaLabPuberty — niezależna ocena stężenia i czasu dojrzewania', () => {
  it('LH chłopca 6 lat w G IV jest w normie stadium, a ostrzeżenie wieku pozostaje', () => {
    const result = assess();
    expect(result.biochemical.primary).toBe('stage');
    expect(result.biochemical.byStage.status).toBe('within');
    expect(result.biochemical.byAge.status).toBe('above');
    expect(result.biochemical.byStage.range).toBeTruthy();
    expect(result.clinical).toMatchObject({ status: 'warning', code: 'early_development' });
    expect(result.summary.status).toBe('attention');
  });

  it('FSH w normie stadium zachowuje alert kliniczny, bez fałszywej flagi wysokiego FSH', () => {
    const result = assess({ analyte: 'fsh', value: 1, assay: assay('fsh') });
    expect(result.biochemical.byStage.status).toBe('within');
    expect(result.biochemical.byAge.status).toBe('within');
    expect(result.clinical).toMatchObject({ status: 'warning', code: 'early_development' });
    expect(result.summary.status).toBe('attention');
  });

  it.each(['0.01', '<0.02', '<LOD'])('LH %s nie usuwa ostrzeżenia o zbyt wczesnych cechach', (value) => {
    const result = assess({ value });
    expect(result.measurement.plotValue).toBe(value === '0.01' ? 0.01 : null);
    expect(result.clinical).toMatchObject({ status: 'warning', code: 'early_development' });
    expect(result.summary.status).toBe('attention');
  });

  it('nieznana metoda ogranicza stężenie, ale nie usuwa alertu wynikającego z G IV i wieku', () => {
    const result = assess({ assay: { ...assay(), confirmation: 'unknown' } });
    expect(result.biochemical.byAge.status).toBe('unavailable');
    expect(result.biochemical.byStage.status).toBe('unavailable');
    expect(result.biochemical.primary).toBeNull();
    expect(result.biochemical.reasonCodes.length).toBeGreaterThan(0);
    expect(result.clinical).toMatchObject({ status: 'warning', code: 'early_development' });
    expect(result.summary.status).toBe('attention');
  });

  it('równoważne jednostki dają identyczny werdykt', () => {
    const iu = assess();
    const miu = assess({ unit: 'mIU/mL' });
    expect(miu.measurement.value).toBe(iu.measurement.value);
    expect(miu.biochemical).toEqual(iu.biochemical);
    expect(miu.clinical).toEqual(iu.clinical);
    expect(miu.summary).toEqual(iu.summary);
  });
});

describe('VildaLabPuberty — daty granic klinicznych', () => {
  const boundaryCases = [
    ['F', 'Th', 3, '2018-10-02', 'early_development'],
    ['F', 'Th', 3, '2018-10-03', 'timing_not_abnormal'],
    ['F', 'Th', 3, '2018-10-04', 'timing_not_abnormal'],
    ['M', 'G', 2, '2019-10-02', 'early_development'],
    ['M', 'G', 2, '2019-10-03', 'timing_not_abnormal'],
    ['M', 'G', 2, '2019-10-04', 'timing_not_abnormal'],
    ['F', 'Th', 1, '2023-10-02', 'timing_not_abnormal'],
    ['F', 'Th', 1, '2023-10-03', 'absent_onset'],
    ['F', 'Th', 1, '2023-10-04', 'absent_onset'],
    ['M', 'G', 1, '2024-10-02', 'timing_not_abnormal'],
    ['M', 'G', 1, '2024-10-03', 'absent_onset'],
    ['M', 'G', 1, '2024-10-04', 'absent_onset'],
  ];
  it.each(boundaryCases)('%s %s%d w dniu %s daje %s', (sex, kind, stage, sampleDateISO, code) => {
    const result = assess({ sex, birthDateISO: '2010-10-03', sampleDateISO, puberty: { kind, stage, assessedAtISO: sampleDateISO, source: 'local-confirmed' } });
    expect(result.clinical.code).toBe(code);
    expect(result.clinical.status).toBe(['early_development', 'absent_onset'].includes(code) ? 'warning' : 'no_timing_alert');
  });

  it('29 lutego kończy 14 lat 28 lutego w roku nieprzestępnym', () => {
    const puberty = { kind: 'G', stage: 1, appliesToSample: true, source: 'local-confirmed' };
    expect(assess({ birthDateISO: '2012-02-29', sampleDateISO: '2026-02-27', puberty }).clinical.code).toBe('timing_not_abnormal');
    expect(assess({ birthDateISO: '2012-02-29', sampleDateISO: '2026-02-28', puberty }).clinical.code).toBe('absent_onset');
  });

  it('starsze dziecko zachowuje wywiad przedwczesnego początku', () => {
    const result = assess({ sex: 'F', birthDateISO: '2016-10-03', puberty: { kind: 'Th', stage: 3, appliesToSample: true }, onset: { kind: 'Th', dateISO: '2023-10-02' } });
    expect(result.clinical).toMatchObject({ status: 'warning', code: 'early_onset_history' });
    expect(result.summary.status).toBe('attention');
  });

  it('znany początek na granicy 13 lat nie jest początkiem po granicy', () => {
    const result = assess({ sex: 'F', birthDateISO: '2012-10-03', puberty: { kind: 'Th', stage: 2, appliesToSample: true }, onset: { kind: 'Th', dateISO: '2025-10-03' } });
    expect(result.clinical.code).toBe('timing_not_abnormal');
  });

  it('znany początek po granicy nie znika po pojawieniu się stadium II', () => {
    const result = assess({ sex: 'F', birthDateISO: '2012-10-03', puberty: { kind: 'Th', stage: 2, appliesToSample: true }, onset: { kind: 'Th', dateISO: '2025-10-04' } });
    expect(result.clinical).toMatchObject({ status: 'warning', code: 'late_onset_history' });
    expect(result.summary.status).toBe('attention');
  });

  it('przyszła data początku jest sprzeczna także przy wieku ręcznym bez DOB', () => {
    const result = assess({ birthDateISO: undefined, age: { years: 6, months: 0, precision: 'month' }, onset: { kind: 'G', dateISO: '2027-10-03' } });
    expect(result.clinical.code).toBe('inconsistent_puberty_context');
  });

  it('przedział wieku początku zachodzący na wiek pobrania pozostaje niepewny', () => {
    const result = assess({ birthDateISO: '2016-10-03', puberty: { kind: 'G', stage: 2, appliesToSample: true }, onset: { kind: 'G', age: { years: 10, precision: 'year' } } });
    expect(result.clinical).toMatchObject({ status: 'limited', code: 'onset_context_uncertain' });
  });

  it('przedział wieku początku przecinający granicę 13 lat nie jest początkiem dokładnie na granicy', () => {
    const result = assess({ sex: 'F', birthDateISO: '2011-10-03', puberty: { kind: 'Th', stage: 2, appliesToSample: true }, onset: { kind: 'Th', age: { years: 13, precision: 'year' } } });
    expect(result.clinical).toMatchObject({ status: 'limited', code: 'onset_context_uncertain' });
    expect(result.clinical.reasonCodes).toContain('onset_precision_crosses_clinical_boundary');
  });
});

describe('VildaLabPuberty — odrębne osie i data oceny dojrzewania', () => {
  it.each(['Th', 'M', 'B'])('%s oznacza tę samą oś gruczołów sutkowych, a Th2 nie jest Th3', (kind) => {
    const result = assess({ sex: 'F', birthDateISO: '2019-04-03', puberty: { kind, stage: 2, appliesToSample: true } });
    expect(result.input.puberty.kind).toBe('Th');
    expect(result.biochemical.byStage.range.stage).toMatchObject({ kind: 'Th', value: 2 });
    expect(result.clinical).toMatchObject({ status: 'notice', code: 'early_thelarche' });
    expect(result.summary.status).toBe('attention');
  });

  it.each([
    [3, 'unknown'], [2, 'yes'],
  ])('Th%d i progresja=%s dają silniejszą ocenę niż izolowane Th2', (stage, progression) => {
    const result = assess({ sex: 'F', birthDateISO: '2019-04-03', puberty: { kind: 'Th', stage, appliesToSample: true }, history: { progression } });
    expect(result.clinical).toMatchObject({ status: 'warning', code: 'early_development' });
  });

  it.each(['P', 'PH', 'Ax'])('%s nie staje się automatycznie G ani gonadarche', (kind) => {
    const result = assess({ puberty: { kind, stage: 3, appliesToSample: true } });
    expect(result.input.puberty.kind).toBe(kind === 'PH' ? 'P' : kind);
    expect(result.biochemical.byStage).toMatchObject({ status: 'unavailable', range: null });
    expect(result.clinical).toMatchObject({ status: 'limited', code: 'missing_puberty_assessment' });
  });

  it('historyczny numer Tannera bez typu pozostaje nieokreślony', () => {
    const result = assess({ puberty: { stage: 3, appliesToSample: true } });
    expect(result.input.puberty.kind).toBe('unspecified');
    expect(result.biochemical.byStage.status).toBe('unavailable');
    expect(result.clinical.code).toBe('ambiguous_puberty_kind');
  });

  it('brak badania w wieku 14 lat nie jest G I', () => {
    const result = assess({ birthDateISO: '2012-10-03', puberty: undefined });
    expect(result.input.puberty.stage).toBeNull();
    expect(result.biochemical.byStage.status).toBe('unavailable');
    expect(result.clinical).toMatchObject({ status: 'limited', code: 'missing_puberty_assessment' });
  });

  it.each([
    { assessedAtISO: '2026-10-03', appliesToSample: true },
    { assessedAtISO: '2023-10-03', appliesToSample: false },
  ])('nie przenosi niepotwierdzonego badania z innego dnia do dawnej próbki: %j', (observation) => {
    const result = assess({ sampleDateISO: '2024-10-03', puberty: { kind: 'G', stage: 4, ...observation } });
    expect(result.biochemical.byStage.status).toBe('unavailable');
    expect(result.biochemical.byStage.reasonCodes).toContain('puberty_not_confirmed_at_sample');
    expect(result.clinical.code).toBe('missing_puberty_assessment');
  });

  it('objętość 4 ml Prader potwierdza cechy, ale nie wytwarza pełnego G II', () => {
    const result = assess({ puberty: undefined, testicularVolume: { value: 4, unit: 'mL', method: 'Prader', appliesToSample: true } });
    expect(result.clinical).toMatchObject({ status: 'warning', code: 'early_development' });
    expect(result.input.puberty.stage).toBeNull();
    expect(result.biochemical.byStage.status).toBe('unavailable');
  });

  it('G I i jądra 4 ml w tej samej ocenie wymagają uzgodnienia', () => {
    const result = assess({ puberty: { kind: 'G', stage: 1, appliesToSample: true }, testicularVolume: { value: 4, unit: 'mL', method: 'Prader', appliesToSample: true } });
    expect(result.clinical).toMatchObject({ status: 'warning', code: 'inconsistent_puberty_context' });
  });

  it('wiek początku z przyszłości nie jest prawidłowym wywiadem', () => {
    const result = assess({ onset: { kind: 'G', dateISO: '2027-10-03' } });
    expect(result.clinical.code).toBe('inconsistent_puberty_context');
  });

  it('początek owłosienia nie staje się historią początku gonadarche', () => {
    const result = assess({ birthDateISO: '2016-10-03', puberty: { kind: 'G', stage: 2, appliesToSample: true }, onset: { kind: 'P', dateISO: '2023-10-03' } });
    expect(result.input.onset.kind).toBe('P');
    expect(result.clinical.code).not.toBe('early_onset_history');
    expect(result.clinical.reasonCodes).toContain('onset_history_missing');
  });
});

describe('VildaLabPuberty — minipokwitanie i pokrycie wieku przez źródło', () => {
  const infant = { birthDateISO: '2026-07-03', sampleDateISO: '2026-10-03', puberty: undefined };

  it('noworodek korzysta z szerokiego profilu <1 roku, bez wymyślonej normy dziennej', () => {
    const result = assess({ birthDateISO: '2026-10-03', puberty: undefined });
    expect(result.ageAtSample.lowerYears).toBe(0);
    expect(result.biochemical.primary).toBe('age');
    expect(result.biochemical.byAge.range.id).toBe('lh-m-age-under1');
    expect(result.clinical.code).toBe('infant_context');
    expect(result.limitations).toContain('broad_infant_reference_not_full_minipuberty_assessment');
  });

  it('niemowlę nie dostaje nastoletniego RI nawet przy wpisanym G IV', () => {
    const result = assess({ ...infant, puberty: { kind: 'G', stage: 4, appliesToSample: true } });
    expect(result.biochemical.primary).toBe('age');
    expect(result.biochemical.byStage).toMatchObject({ status: 'unavailable', range: null });
    expect(result.biochemical.byStage.reasonCodes).toContain('stage_reference_not_for_infant');
    expect(result.clinical).toMatchObject({ status: 'warning', code: 'early_development' });
  });

  it('izolowane Th2 u niemowlęcia daje kontekst, a progresja nie jest wyciszana', () => {
    const baseline = { ...infant, sex: 'F', puberty: { kind: 'Th', stage: 2, appliesToSample: true } };
    expect(assess(baseline).clinical).toMatchObject({ status: 'notice', code: 'infant_context' });
    expect(assess({ ...baseline, history: { progression: 'yes' } }).clinical).toMatchObject({ status: 'warning', code: 'early_development' });
  });

  it('przed i w pierwsze urodziny obowiązują różne wiersze wieku', () => {
    const before = assess({ birthDateISO: '2025-10-03', sampleDateISO: '2026-10-02', puberty: undefined, value: 1 });
    const onBirthday = assess({ birthDateISO: '2025-10-03', puberty: undefined, value: 1 });
    expect(before.biochemical.byAge.range.id).toBe('lh-m-age-under1');
    expect(before.biochemical.byAge.status).toBe('within');
    expect(onBirthday.biochemical.byAge.range.id).toBe('lh-m-age1-8');
    expect(onBirthday.biochemical.byAge.status).toBe('above');
  });

  it.each(['lh', 'fsh'])('Johannsen %s pozostaje nieaktywny mimo zgodnego wskazania metody', (analyte) => {
    const result = assess({ ...infant, analyte, assay: { profileId: `johannsen-minipuberty-${analyte}-candidate`, methodId: 'autodelfia-johannsen-2018', confirmation: 'reported' } });
    expect(result.biochemical.primary).toBeNull();
    expect(result.biochemical.byAge).toMatchObject({ status: 'unavailable', range: null });
    expect(result.biochemical.byAge.reasonCodes).toContain('profile_not_active');
  });

  it('wcześniactwo blokuje automatyczny RI niemowlęcia, nie zmieniając osi wieku', () => {
    const expectedAge = engine.resolveAge(infant);
    const result = assess({ ...infant, preterm: 'yes', gestationalAgeWeeks: 32, correctedAge: { years: 0, months: 1, precision: 'month' } });
    expect(result.ageAtSample).toEqual(expectedAge);
    expect(result.biochemical.primary).toBeNull();
    expect(result.biochemical.reasonCodes).toContain('preterm_reference_not_established');
  });

  it('próg wieku ciążowego jest danymi, nie zakodowaną liczbą 37', () => {
    const context = { ...infant, gestationalAgeWeeks: 36.5, preterm: 'no' };
    expect(assess(context).biochemical.reasonCodes).toContain('preterm_reference_not_established');
    const synthetic = structuredClone(data);
    synthetic.biochemicalPolicy.pretermGestationalWeeks.value = 36;
    const changed = assess(context, deepFreeze(synthetic));
    expect(changed.biochemical.primary).toBe('age');
    expect(changed.biochemical.reasonCodes).not.toContain('preterm_reference_not_established');
  });

  it('brak profilu klinicznego nie odblokowuje katalogowego RI wcześniaka', () => {
    const result = assess({ ...infant, preterm: 'yes', gestationalAgeWeeks: 32 }, { ...data, clinicalProfile: null });
    expect(result.biochemical.primary).toBeNull();
    expect(result.biochemical.byAge).toMatchObject({ status: 'unavailable', range: null });
    expect(result.biochemical.reasonCodes).toContain('preterm_reference_not_established');
    expect(result.clinical.status).toBe('limited');
  });

  it('brak polityki biochemicznej blokuje RI, zachowując konwersję wyniku', () => {
    const result = assess({ ...infant, value: '2,5', unit: 'mIU/mL' }, { ...data, biochemicalPolicy: null });
    expect(result.biochemical.primary).toBeNull();
    expect(result.biochemical.byAge).toMatchObject({ status: 'unavailable', range: null });
    expect(result.biochemical.byStage).toMatchObject({ status: 'unavailable', range: null });
    expect(result.biochemical.reasonCodes).toContain('biochemical_policy_missing');
    expect(result.measurement).toMatchObject({ status: 'valid', value: 2.5, unit: 'IU/L' });
  });

  it('donoszone niemowlę zachowuje katalogowy RI bez profilu klinicznego przy jawnej biopolityce', () => {
    const result = assess({ ...infant, preterm: 'no', gestationalAgeWeeks: 40 }, { ...data, clinicalProfile: null });
    expect(result.biochemical.primary).toBe('age');
    expect(result.biochemical.byAge.range.id).toBe('lh-m-age-under1');
    expect(result.biochemical.byAge.status).toBe('within');
    expect(result.biochemical.reasonCodes).not.toContain('biochemical_policy_missing');
    expect(result.clinical.status).toBe('limited');
  });

  it('opis dłuższej aktywności FSH nie uznaje wartości 20 u dziewczynki 3,5 roku za fizjologię', () => {
    const result = assess({ analyte: 'fsh', assay: assay('fsh'), value: 20, sex: 'F', birthDateISO: '2023-04-03', puberty: { kind: 'Th', stage: 1, appliesToSample: true } });
    expect(result.biochemical.byAge.status).toBe('above');
    expect(result.biochemical.byStage.status).toBe('above');
    expect(result.clinical.code).not.toBe('infant_context');
    expect(result.summary.status).toBe('attention');
  });

  it('miesięczna precyzja przy granicy FSH ≤5/>5 lat nie wybiera arbitralnie wiersza', () => {
    const result = assess({ analyte: 'fsh', assay: assay('fsh'), birthDateISO: undefined, sampleDateISO: undefined, age: { years: 5, months: 0, precision: 'month' }, puberty: undefined });
    expect(result.ageAtSample.lowerYears).toBe(5);
    expect(result.biochemical.byAge.status).toBe('unavailable');
    expect(result.biochemical.byAge.reasonCodes).toContain('age_precision_crosses_reference_boundary');
  });

  it.each([
    ['2021-10-03', 'fsh-m-age1-5', 1.9],
    ['2021-10-02', 'fsh-m-age-over5-10', 2.3],
    ['2016-10-03', 'fsh-m-age-over5-10', 2.3],
    ['2016-10-02', 'fsh-m-age-over10-15', 6.9],
  ])('dosłowne granice FSH dla daty urodzenia %s wybierają %s', (birthDateISO, rangeId, upper) => {
    const result = assess({ analyte: 'fsh', assay: assay('fsh'), birthDateISO, puberty: undefined, value: 1 });
    expect(result.biochemical.byAge.range.id).toBe(rangeId);
    expect(result.biochemical.byAge.range.bounds.upper.value).toBe(upper);
  });
});

describe('VildaLabPuberty — jawne ograniczenia i brak norm zastępczych', () => {
  it.each([
    { sex: undefined },
    { birthDateISO: undefined, age: undefined },
    { assay: { ...assay(), methodId: 'inny-test' } },
    { specimen: 'urine' },
    { measurementKind: 'stimulated' },
    { measurementKind: 'unknown' },
    { treatment: { gnrha: 'yes', sexSteroids: 'no' } },
    { treatment: { gnrha: 'unknown', sexSteroids: 'no' } },
    { treatment: { gnrha: 'no', sexSteroids: 'yes' } },
  ])('nie tworzy fallbacku po ograniczeniu %j', (context) => {
    const result = assess(context);
    expect(result.measurement).toMatchObject({ status: 'valid', value: 2, unit: 'IU/L' });
    expect(result.biochemical.primary).toBeNull();
    expect(result.biochemical.byAge).toMatchObject({ status: 'unavailable', range: null });
    expect(result.biochemical.byStage).toMatchObject({ status: 'unavailable', range: null });
    expect(result.biochemical.reasonCodes.length).toBeGreaterThan(0);
  });

  it('brak profili w podanych danych nie uruchamia wbudowanych tabel', () => {
    const explicit = { ...data, profiles: [] };
    const result = assess({}, deepFreeze(explicit));
    expect(result.biochemical.primary).toBeNull();
    expect(result.biochemical.reasonCodes).toContain('no_matching_profile');
    expect(result.clinical.code).toBe('early_development');
  });

  it('brak danych klinicznych nie uruchamia progów wpisanych do silnika', () => {
    const result = assess({}, { ...data, clinicalProfile: null });
    expect(result.biochemical.byStage.status).toBe('within');
    expect(result.clinical).toMatchObject({ status: 'limited', code: 'clinical_profile_missing' });
  });

  it('kryterium wieku pochodzi z argumentu danych, a nie stałej silnika', () => {
    // Syntetyczna zmiana danych wyłącznie do sprawdzenia zależności silnika.
    const synthetic = structuredClone(data);
    synthetic.clinicalProfile.earlyAgeYears.M.value = 5;
    expect(assess().clinical.code).toBe('early_development');
    expect(assess({}, deepFreeze(synthetic)).clinical.code).toBe('timing_not_abnormal');
  });

  it('pominięcie argumentu danych nie czyta profilu z globalnego okna', () => {
    const result = engine.evaluate(input());
    expect(result.biochemical.primary).toBeNull();
    expect(result.clinical.code).toBe('clinical_profile_missing');
  });

  it.each(['yes', 'unknown'])('GnRHa=%s przy G I w wieku 14 lat nie rozpoznaje nowego braku początku', (gnrha) => {
    const result = assess({ birthDateISO: '2012-10-03', puberty: { kind: 'G', stage: 1, appliesToSample: true }, treatment: { gnrha, sexSteroids: 'no' } });
    expect(result.clinical).toMatchObject({ status: 'limited', code: 'treatment_context' });
    expect(result.biochemical.primary).toBeNull();
  });

  it('Th I po wcześniejszym początku i regresji nie jest nowym opóźnieniem', () => {
    const result = assess({ sex: 'F', birthDateISO: '2012-10-03', puberty: { kind: 'Th', stage: 1, appliesToSample: true }, onset: { kind: 'Th', dateISO: '2024-10-03' }, history: { regression: 'yes' } });
    expect(result.clinical).toMatchObject({ status: 'limited', code: 'treatment_context' });
  });

  it('domniemane zmiany minipuberty nie zapisują trwałego przedwczesnego początku', () => {
    const result = assess({ sex: 'F', birthDateISO: '2016-10-03', puberty: { kind: 'Th', stage: 2, appliesToSample: true }, onset: { kind: 'Th', dateISO: '2017-01-03' } });
    expect(result.clinical).toMatchObject({ status: 'limited', code: 'infant_context' });
    expect(result.clinical.reasonCodes).toContain('infant_onset_not_confirmed');
  });

  it('nie interpretuje innych analitów jako LH/FSH', () => {
    const result = assess({ analyte: 'tsh' });
    expect(result.clinical.status).toBe('out_of_scope');
    expect(result.summary).toMatchObject({ status: 'out_of_scope', code: 'unsupported_analyte' });
  });

  it('18. urodziny zamykają profil LHPED, ale zachowują granicę ≤18 źródła FSH', () => {
    const context = { birthDateISO: '2008-10-03', puberty: { kind: 'G', stage: 4, appliesToSample: true } };
    const lh = assess(context);
    expect(lh.biochemical.primary).toBeNull();
    expect(lh.biochemical.reasonCodes).toContain('age_outside_profile');
    const fsh = assess({ ...context, analyte: 'fsh', assay: assay('fsh') });
    expect(fsh.biochemical.byAge.range.id).toBe('fsh-m-age-over15-18');
  });

  it('dzień po granicy pediatrycznej jest poza zakresem modułu, bez normy dorosłych', () => {
    const result = assess({ birthDateISO: '2008-10-02', puberty: { kind: 'G', stage: 4, appliesToSample: true } });
    expect(result.biochemical.primary).toBeNull();
    expect(result.clinical.status).toBe('out_of_scope');
    expect(result.summary.status).toBe('out_of_scope');
  });
});

describe('VildaLabPuberty — jawny zakres lokalnego laboratorium', () => {
  function localReference(overrides = {}) {
    return {
      id: 'fikcyjne-laboratorium-lh', version: 'test-1',
      source: { id: 'fikcyjne-zrodlo-lh', label: 'Fikcyjny zakres laboratorium', url: 'https://example.invalid/lh' },
      population: { label: 'Fikcyjny zakres potwierdzony dla tego pacjenta pediatrycznego' },
      analyte: 'lh', unit: 'IU/L', material: 'serum', methodId: 'anshlite-lh-clia',
      applicabilityConfirmed: true, range: boundRange(0.1, 1), basis: 'local', ...overrides,
    };
  }

  it('prawidłowo udokumentowany lokalny RI ma pierwszeństwo, bez kasowania katalogu i alertu wieku', () => {
    const result = assess({ localReference: localReference() });
    expect(result.biochemical.primary).toBe('local');
    expect(result.biochemical.local.status).toBe('above');
    expect(result.biochemical.byStage.status).toBe('within');
    expect(result.biochemical.local.range).toMatchObject({ sourceId: 'fikcyjne-zrodlo-lh', profileVersion: 'test-1', population: { label: 'Fikcyjny zakres potwierdzony dla tego pacjenta pediatrycznego' }, bounds: boundRange(0.1, 1) });
    expect(result.clinical.code).toBe('early_development');
    expect(result.summary.status).toBe('attention');
  });

  it('lokalne within decyduje o podsumowaniu, zachowując obie rozbieżne oceny katalogowe', () => {
    const result = assess({ birthDateISO: '2014-10-03', value: 6, puberty: { kind: 'G', stage: 3, appliesToSample: true }, localReference: localReference({ range: boundRange(0.1, 8) }) });
    expect(result.biochemical.primary).toBe('local');
    expect(result.biochemical.local.status).toBe('within');
    expect(result.biochemical.byAge.status).toBe('above');
    expect(result.biochemical.byStage.status).toBe('above');
    expect(result.biochemical.reasonCodes).toContain('source_reference_disagreement');
    expect(result.limitations).toContain('source_reference_disagreement');
    expect(result.clinical.status).toBe('no_timing_alert');
    expect(result.summary.status).toBe('compared');
  });

  it('lokalne within nie znosi niezależnego ostrzeżenia o wczesnym rozwoju chłopca', () => {
    const result = assess({ localReference: localReference({ range: boundRange(0.1, 8) }) });
    expect(result.biochemical.primary).toBe('local');
    expect(result.biochemical.local.status).toBe('within');
    expect(result.biochemical.byStage.status).toBe('within');
    expect(result.biochemical.byAge.status).toBe('above');
    expect(result.biochemical.reasonCodes).toContain('source_reference_disagreement');
    expect(result.clinical).toMatchObject({ status: 'warning', code: 'early_development' });
    expect(result.summary).toMatchObject({ status: 'attention', code: 'early_development' });
  });

  it('lokalny RI nie rozszerza pediatrycznego modułu na dorosłego pacjenta', () => {
    const result = assess({ birthDateISO: '2007-10-03', localReference: localReference({ range: boundRange(0.1, 8) }) });
    expect(result.biochemical.local).toMatchObject({ status: 'unavailable', range: null });
    expect(result.biochemical.local.reasonCodes).toContain('local_reference_outside_pediatric_scope');
    expect(result.biochemical.primary).toBeNull();
    expect(result.clinical.status).toBe('out_of_scope');
    expect(result.summary.status).toBe('out_of_scope');
  });

  it('lokalny RI wymaga jawnego scope klinicznego, a katalog zachowuje własny scope', () => {
    const result = assess({ localReference: localReference({ range: boundRange(0.1, 8) }) }, { ...data, clinicalProfile: null });
    expect(result.biochemical.local).toMatchObject({ status: 'unavailable', range: null });
    expect(result.biochemical.local.reasonCodes).toContain('clinical_scope_not_established');
    expect(result.biochemical.byStage.status).toBe('within');
    expect(result.biochemical.primary).toBe('stage');
    expect(result.clinical.status).toBe('limited');
  });

  it.each([
    { source: undefined }, { applicabilityConfirmed: false }, { population: undefined },
  ])('same liczby bez pochodzenia/adekwatności %j nie stają się lokalną normą', (missing) => {
    const result = assess({ localReference: localReference(missing) });
    expect(result.biochemical.local.status).toBe('unavailable');
    expect(result.biochemical.local.reasonCodes).toContain('local_reference_provenance_or_applicability_missing');
    expect(result.biochemical.primary).toBe('stage');
  });

  it('metoda lokalnej normy musi odpowiadać metodzie rzeczywistej próbki', () => {
    const result = assess({ localReference: localReference({ methodId: 'inna-fikcyjna-metoda' }) });
    expect(result.biochemical.local.status).toBe('unavailable');
    expect(result.biochemical.local.reasonCodes).toContain('local_reference_method_not_confirmed');
    expect(result.biochemical.primary).toBe('stage');
  });
});

describe('VildaLabPuberty — dane, pochodzenie i niezależny snapshot', () => {
  it('przenosi rzeczywiście użyte granice, metodę i źródło, nie tylko ID', () => {
    const result = assess();
    expect(selected(result).range).toMatchObject({ profileId: 'mayo-lh-pediatric', dataVersion: data.dataVersion, sourceId: 'mayo-lhped-62999', material: 'serum', unit: 'IU/L', method: { id: 'anshlite-lh-clia' }, bounds: { lower: { operator: '>=', value: 1.3 }, upper: { operator: '<=', value: 9.8 } } });
    expect(selected(result).range.source.url).toBe('https://www.mayocliniclabs.com/test-catalog/Overview/62999');
    expect(selected(result).range.population.label).toBeTruthy();
    expect(result.schemaVersion).toBe(1);
    expect(result.engineVersion).toBe(engine.version);
    expect(result.dataVersion).toBe(data.dataVersion);
    expect(result.provenance.sourceIds).toContain('mayo-lhped-62999');
  });

  it('zamrożone input i dane nie są mutowane; wynik jest deterministyczny i nie dzieli ich referencji', () => {
    const sourceInput = deepFreeze(input());
    const inputCopy = structuredClone(sourceInput);
    const sourceData = deepFreeze(structuredClone(data));
    const dataCopy = structuredClone(sourceData);
    const first = engine.evaluate(sourceInput, sourceData);
    const second = engine.evaluate(sourceInput, sourceData);
    expect(first).toEqual(second);
    expect(sourceInput).toEqual(inputCopy);
    expect(sourceData).toEqual(dataCopy);
    first.input.puberty.stage = 1;
    selected(first).range.bounds.upper.value = 1000;
    expect(sourceInput.puberty.stage).toBe(4);
    expect(second.input.puberty.stage).toBe(4);
    expect(selected(second).range.bounds.upper.value).toBe(9.8);
    expect(sourceData).toEqual(dataCopy);
  });

  it('snapshot ręcznego wieku zachowuje brakujące dane jawnie i przechodzi JSON round-trip', () => {
    const result = assess({ birthDateISO: undefined, sampleDateISO: undefined, age: { years: 6, precision: 'year' }, puberty: { kind: 'G', stage: 4, appliesToSample: true }, onset: { kind: 'G', age: { years: 5, precision: 'year' } } });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
});
