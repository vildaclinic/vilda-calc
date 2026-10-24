import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
for (const file of ['clcr_clinical_safety.js', 'clcr_oxcr_reference_data.js', 'clcr_oxcr.js']) loadBrowserScript(file, browser);
const engine = browser.VildaClcrOxcr;
const data = browser.VildaClcrOxcrReferenceData;
const policy = data.DEFAULT_POLICY;
const example = { mode: 'concentration', oxalateValue: '1', oxalateUnit: 'mg/dL:acid', creatinineValue: '10', creatinineUnit: 'mg/dL', ageYears: 8 };
const calculate = (patch = {}, selected = policy) => engine.evaluate({ ...example, ...patch }, selected);
const reported = (reportedValue, reportedUnit = 'umol/mmol', patch = {}, selected = policy) => engine.evaluate({ mode: 'direct', reportedValue, reportedUnit, ageYears: 8, ...patch }, selected);

describe('Ox/Cr — jawna polityka dwóch źródeł i odrębna oś molowa', () => {
  it('przechowuje P95 bez dolnej granicy, osobny zakres starszych i pełne ograniczenia dowodu', () => {
    expect(data.getPolicy(policy.id)).toBe(policy);
    expect(data.getPolicy('missing')).toBeNull();
    expect(data.getProfile('missing')).toBeNull();
    expect(data.listProfiles()).toEqual(policy.profiles);
    const [child, older] = policy.profiles;
    expect(Object.isFrozen(child.source.underlyingStudy)).toBe(true);
    expect(child.bands.map(b => [b.minimumAgeMonths, b.maximumAgeMonths, b.maximumAgeInclusive, b.lower, b.upper])).toEqual([
      [1, 6, false, null, 220], [6, 12, false, null, 170], [12, 24, false, null, 130],
      [24, 36, false, null, 100], [36, 60, false, null, 80], [60, 84, false, null, 70], [84, 204, true, null, 60],
    ]);
    expect(child.source).toMatchObject({ version: '2.1, 6.03.2025', fullDocumentRead: true, method: 'HPLC', underlyingStudy: { abstractRead: true, fullPaperRead: false } });
    expect(older.bands[0]).toMatchObject({ minimumAgeMonths: 204, minimumAgeInclusive: false, maximumAgeMonths: null, lower: 2, upper: 83, sourceAge: '>12 years', sourceUnit: 'mmol/mmol' });
    expect(older.restrictions.endpointPolicy).toContain('konwencją aplikacji');
    expect(child.restrictions.minimumAgePolicy).toContain('abstrakcie');
    expect(data.CONVERSION_CONSTANTS.provenance.ion).toContain('approximation');
  });

  it('nie wbudowuje normy ani źródła awaryjnego w silnik', () => {
    expect(engine.evaluate(example)).toMatchObject({ valid: true, rawValue: 0.1, reasonCode: 'missing-profile', reference: null, category: null, tone: 'neutral' });
    for (const broken of [{ ...policy, quantity: 'calcium' }, { ...policy, profiles: [] }, { ...policy, notes: null },
      { ...policy, conversionConstants: { ...policy.conversionConstants, oxalateIonMgPerMmol: '-88' } },
      { ...policy, profiles: [{ ...policy.profiles[0], bands: [{ ...policy.profiles[0].bands[0], lower: 0 }] }] },
    ]) expect(calculate({}, broken)).toMatchObject({ valid: true, reasonCode: 'invalid-profile', rawValue: 0.1, reference: null, category: null });
  });

  it('przyjmuje inną populację i nie mutuje danych ani nie wybiera korzystniejszego źródła', () => {
    const other = structuredClone(policy);
    other.id = 'SYNTHETIC_OXCR_POLICY'; other.profiles[0].id = 'SYNTHETIC_OXCR_CHILD';
    other.profiles[0].population.label = 'Fikcyjna populacja'; other.profiles[0].bands[6].upper = 200;
    const before = structuredClone(other);
    expect(calculate({}, other)).toMatchObject({ category: 'within', profileId: 'SYNTHETIC_OXCR_CHILD', population: { label: 'Fikcyjna populacja' }, reference: { nativeHigh: 200 } });
    expect(other).toEqual(before); expect(Object.isFrozen(other)).toBe(false);
    expect(calculate().category).toBe('above');
    other.profiles[0].bands = other.profiles[0].bands.filter(b => b.id !== 'fimlab-7');
    expect(calculate({}, other)).toMatchObject({ reasonCode: 'no-age-band', reference: null });
    other.profiles[0].bands.push(before.profiles[0].bands[6], before.profiles[0].bands[6]);
    expect(calculate({}, other)).toMatchObject({ reasonCode: 'ambiguous-age-band', reference: null });
  });
});

describe('Ox/Cr — rzeczywiste stężenia i wszystkie zgłoszone błędy liczbowe', () => {
  it('odtwarza zaakceptowany przykład i niezależnie wyliczone wartości konwersji', () => {
    const result = calculate();
    expect(result).toMatchObject({ valid: true, rawValue: 0.1, unit: 'mg/mg', originalUnit: 'mg/mg:acid', basis: 'acid', category: 'above', tone: 'warning', display: { value: '0.100' }, reference: { nativeLow: null, nativeHigh: 60, range: '≤≈0,0478' } });
    // Independent Decimal(60) goldens in the source audit, not a copy of the engine.
    expect(result.nativeSI).toBeCloseTo(Number('125.640168423577968099037151149165490270994914194384621963261'), 12);
    expect(result.reference.upper).toBeCloseTo(Number('0.0477554278642149929278642149929278642149929278642149929278642'), 15);
    expect(calculate({ oxalateUnit: 'mg/dL:ion' }).nativeSI).toBeCloseTo(Number('128.517706404299071791317783660346061645781024551517286040514'), 12);
    expect(calculate({ oxalateUnit: 'mg/L:acid' }).nativeSI).toBeCloseTo(Number('12.5640168423577968099037151149165490270994914194384621963261'), 13);
  });

  it.each([
    ['umol/L', '60', 'mmol/L', '1'], ['µmol/L', '60', 'umol/L', '1000'], ['mmol/L', '0.06', 'µmol/L', '1000'],
    ['mmol/L', '0.06', 'mg/dL', '11.312'], ['umol/L', '60', 'mg/dl', '11.312'],
  ])('daje dokładną wspólną granicę60 bez88,4: Ox%s/%s, Cr%s/%s', (oxalateUnit, oxalateValue, creatinineUnit, creatinineValue) => {
    expect(calculate({ oxalateUnit, oxalateValue, creatinineUnit, creatinineValue })).toMatchObject({ valid: true, rawValue: 60, unit: 'µmol/mmol', originalUnit: 'umol/mmol', basis: '', nativeSI: 60, category: 'within' });
  });

  it.each([
    ['mg/dL:acid', '1', 'mg/dL', '10'], ['mg/L:acid', '10', 'mg/dl', '10'],
    ['mg/L:acid', '11.312', 'mmol/L', '1'], ['mg/L:acid', '11.312', 'umol', '1000'],
  ])('zachowuje0,1mg/mg dla %s/%s i %s/%s', (oxalateUnit, oxalateValue, creatinineUnit, creatinineValue) => {
    expect(calculate({ oxalateUnit, oxalateValue, creatinineUnit, creatinineValue })).toMatchObject({ valid: true, rawValue: 0.1, category: 'above' });
  });

  it('nie ma zależnego od jednostki limitu50000 dla Cr i dopuszcza rzeczywiste zero Ox', () => {
    for (const [creatinineUnit, creatinineValue] of [['mg/dL', '678.72'], ['mmol/L', '60'], ['umol/L', '60000']]) {
      expect(calculate({ creatinineUnit, creatinineValue, oxalateValue: '6', oxalateUnit: 'umol/L' })).toMatchObject({ valid: true, rawValue: 0.1, category: 'within' });
    }
    expect(calculate({ oxalateValue: '0' })).toMatchObject({ valid: true, rawValue: 0, nativeSI: 0, category: 'within', display: { value: '0.000' } });
    expect(calculate({ oxalateValue: '0', ageYears: 40 })).toMatchObject({ valid: true, rawValue: 0, category: 'below', statusText: 'Poniżej zakresu laboratoryjnego' });
  });

  it('nie zaokrągla dodatniej wartości do zera ani nie gubi precyzji w snapshot', () => {
    const tiny = calculate({ oxalateValue: '0.00049' });
    expect(tiny).toMatchObject({ rawValue: 0.000049, display: { value: '0.000049' }, snapshot: { rawValue: 0.000049, input: { oxalateValue: '0.00049' } } });
    const small = calculate({ oxalateValue: '1e-80' });
    expect(Number(small.display.value)).toBeGreaterThan(0);
    expect(small.display.value).toContain('e-');
    expect(calculate({ oxalateValue: '0.12345' }).snapshot.rawValue).toBe(0.012345);
    expect(calculate({ oxalateValue: '0.00499' }).snapshot.rawValue).toBe(0.000499);
  });

  it('nie cofa rzeczywistego przekroczenia epsilonem ani zaokrągleniem', () => {
    const result = calculate({ oxalateValue: '60.0000000000000001', oxalateUnit: 'umol/L', creatinineValue: '1', creatinineUnit: 'mmol/L' });
    expect(result.category).toBe('above'); expect(result.boundary).toContain('przed zaokrągleniem');
    expect(result.snapshot.input.oxalateValue).toBe('60.0000000000000001');
    expect(result.snapshot.exactNativeSI).toEqual({ numerator: '600000000000000001', denominator: '10000000000000000' });
    expect(calculate({ oxalateValue: '59.9999999999999999', oxalateUnit: 'umol/L', creatinineValue: '1', creatinineUnit: 'mmol/L' }).category).toBe('within');
  });

  it.each([
    [{ oxalateValue: '' }, 'missing-oxalate'], [{ oxalateValue: null }, 'missing-oxalate'],
    ...[-1, NaN, Infinity, true, '<1', '1 mg/dL', '1e-1001'].map(oxalateValue => [{ oxalateValue }, 'invalid-oxalate']),
    [{ creatinineValue: '' }, 'missing-creatinine'], ...[0, -1, NaN, Infinity, true, '≤10'].map(creatinineValue => [{ creatinineValue }, 'invalid-creatinine']),
    [{ oxalateUnit: '' }, 'invalid-oxalate-unit'], [{ oxalateUnit: 'mmol/L:ion' }, 'invalid-oxalate-unit'], [{ oxalateUnit: 'mg/L:dihydrate' }, 'invalid-oxalate-unit'],
    [{ creatinineUnit: '' }, 'invalid-creatinine-unit'], [{ creatinineUnit: 'mg/L' }, 'invalid-creatinine-unit'], [{ creatinineUnit: 'mg/dL:acid' }, 'invalid-creatinine-unit'],
    [{ mode: 'bad' }, 'invalid-mode'], [{ sameSpecimen: 'different' }, 'different-specimens'],
    [{ oxalateValue: Number.MAX_VALUE, creatinineValue: '0.0001' }, 'invalid-conversion'],
  ])('odrzuca błędne dane %j z właściwym powodem', (patch, reasonCode) => {
    const result = calculate(patch);
    expect(result).toMatchObject({ valid: false, reasonCode, rawValue: null, snapshot: null });
    expect(result.message).not.toBe('');
  });
});

describe('Ox/Cr — gotowy wynik, podstawa masowa i cały przedział z operatorem', () => {
  it.each([
    ['umol/mmol', '60'], ['µmol/mmol', '60'], ['mmol/mol', '60'], ['mmol/mmol', '0.06'], ['mol/mol', '0.06'],
    ['mg/mg:acid', '0.1'], ['mg/g:acid', '100'], ['mg/mmol:acid', '11.312'],
    ['mg/mg:ion', '0.1'], ['mg/g:ion', '100'], ['mg/mmol:ion', '11.312'],
  ])('zachowuje oryginalny gotowy wynik %s %s', (unit, value) => {
    const result = reported(value, unit);
    expect(result).toMatchObject({ valid: true, rawValue: Number(value), display: { value }, input: { reportedValue: value, reportedUnit: unit } });
    expect(result.nativeSI).toBeCloseTo(unit.includes(':acid') ? Number('125.64016842357797') : unit.includes(':ion') ? Number('128.51770640429907') : 60, 12);
  });

  it.each(['mg/mg:unknown', 'mg/g:unknown', 'mg/mmol:unknown', 'mg/mg'])('nie zgaduje postaci dla %s i nie ukrywa liczby', unit => {
    const result = reported('0.123450', unit);
    expect(result).toMatchObject({ valid: true, rawValue: 0.12345, basis: 'unknown', classificationValue: null, referenceAvailable: false, tone: 'neutral', reasonCode: 'unknown-mass-basis', display: { value: '0.123450' } });
    expect(result.qualification.note).toContain('jeśli laboratorium ją podaje');
    expect(result.referenceTable).toHaveLength(8);
    expect(result.referenceTable.every(r => r.selected === false)).toBe(true);
    expect(result.snapshot.input.reportedUnit).toBe(unit);
  });

  it('z nieznaną postacią stężenia pozostawia iloraz masowy, a nie przybliżenie SI', () => {
    expect(calculate({ oxalateUnit: 'mg/dL:unknown' })).toMatchObject({ valid: true, rawValue: 0.1, unit: 'mg/mg', basis: 'unknown', nativeSI: null, category: null, reference: null });
  });

  it.each([
    ['60', 'within'], ['60.0000000000000001', 'above'], ['<60', 'within'], ['≤60', 'within'], ['>60', 'above'], ['≥60', null], ['<61', null], ['>59', null],
  ])('dziecięce P95: %s → %s', (text, category) => {
    expect(reported(text).category).toBe(category);
    expect(reported(text).reference.nativeLow).toBeNull();
  });

  it.each([
    ['0', 'below'], ['2', 'within'], ['83', 'within'], ['83.000000000000001', 'above'], ['<2', 'below'], ['≤2', null], ['≤1.999', 'below'],
    ['>83', 'above'], ['≥83', null], ['≥83.001', 'above'], ['<83', null], ['>2', null],
  ])('zamknięty osobny przedział Newcastle: %s → %s', (text, category) => {
    const result = reported(text, 'umol/mmol', { ageYears: 40 });
    expect(result.category).toBe(category);
    expect(result.reference).toMatchObject({ nativeLow: 2, nativeHigh: 83, lowerInclusive: true, upperInclusive: true });
    if (category === 'below') expect(result.qualification.note).toContain('nie oznacza choroby ani niedoboru');
  });

  it('normalizuje znak, lecz zachowuje precyzję i tekst oryginału w kontekście zapisu', () => {
    const result = reported('<=0,012345000', 'mg/mg:acid');
    expect(result).toMatchObject({ comparator: '≤', exact: false, display: { value: '0.012345000', text: '≤0.012345000' }, snapshot: { input: { reportedValue: '<=0,012345000' }, originalUnit: 'mg/mg:acid', basis: 'acid' } });
    expect(engine.parseReportedValue('≥0,000049')).toEqual({ value: 0.000049, comparator: '≥', text: '0.000049' });
  });

  it.each(['', '-1', '<0', 'NaN', 'Infinity', '1e-400', '1e1001', '4 mmol/mmol', true, {}])('nie akceptuje niepoprawnego raportu %j', text => {
    expect(reported(text).valid).toBe(false);
    expect(engine.parseReportedValue(text)).toBeNull();
  });
  it.each(['g/g', 'mmol/L', 'mg/mg:dihydrate', 'umol/mmol:acid', 'mg/g:ion:acid', null])('nie akceptuje nieobsługiwanej jednostki %j', unit => expect(reported('1', unit).reasonCode).toBe('invalid-reported-unit'));
});

describe('Ox/Cr — granice wieku, źródła i zachowane fakty', () => {
  it.each([[1 / 12, 220], [0.5 - 1e-10, 220], [0.5, 170], [1 - 1e-10, 170], [1, 130], [2, 100], [3, 80], [5, 70], [7, 60], [17, 60]])('wiek%s otrzymuje dokładną górę%s', (ageYears, upper) => {
    expect(reported('60', 'umol/mmol', { ageYears })).toMatchObject({ profileId: 'FIMLAB_OXCR_P95_2025', reference: { nativeLow: null, nativeHigh: upper } });
  });
  it.each([17.000000001, 17.5, 18, 40, 83, 100, 130])('wiek%s po17bezluki używa osobnego źródła', ageYears => {
    const result = reported('70', 'umol/mmol', { ageYears });
    expect(result).toMatchObject({ category: 'within', profileId: 'NEWCASTLE_OXCR_RANDOM_2024', reference: { nativeLow: 2, nativeHigh: 83 } });
    expect(result.notes.sourceTransition).toContain('fizjologicznego skoku');
  });
  it.each([[null, 'missing-age'], [undefined, 'missing-age'], ['', 'missing-age'], [-1, 'invalid-age'], ['8', 'invalid-age'], [NaN, 'invalid-age'], [0, 'under-age'], [1 / 12 - 1e-10, 'under-age']])('bez kwalifikującego wieku%s nie podstawia normy dorosłych', (ageYears, reasonCode) => {
    expect(reported('100', 'umol/mmol', { ageYears })).toMatchObject({ valid: true, reasonCode, rawValue: 100, reference: null, category: null, tone: 'neutral' });
  });

  it('zachowuje znane fakty, nie zamienia braków w negatywne odpowiedzi, gotowy raport jest niezależny od różnych próbek', () => {
    const known = { hematuria: true, infection: false, menstruation: null };
    const result = reported('60', 'umol/mmol', { sameSpecimen: 'different', knownFacts: known, confounders: ['hematuria', 'hematuria'], sampleType: 'random' });
    expect(result).toMatchObject({ valid: true, category: 'within', context: { sameSpecimen: 'not-applicable', knownFacts: known, confounders: ['hematuria'], sampleType: 'random' } });
    expect(calculate().context.knownFacts).toEqual([]);
    expect(calculate({ population: { currentPreterm: true } })).toMatchObject({ valid: true, reasonCode: 'unsupported-population', reference: null, context: { population: { currentPreterm: true } } });
    expect(calculate({ population: { currentPreterm: false }, knownFacts: { historyOfPrematurity: true } }).referenceAvailable).toBe(true);
  });

  it.each([8, 40])('znana zbiórka moczu w wieku%s nie otrzymuje normy próbki punktowej', ageYears => {
    for (const result of [calculate({ ageYears, sampleType: 'timed' }), reported('60', 'umol/mmol', { ageYears, sampleType: 'timed' })]) {
      expect(result).toMatchObject({ valid: true, reasonCode: 'unsupported-sample-type', referenceAvailable: false, reference: null, category: null, status: 'unassessed', tone: 'neutral', context: { sampleType: 'timed' } });
      expect(result.rawValue).toBeGreaterThan(0);
      expect(result.qualification.note).toContain('normy dotyczą próbki punktowej');
      expect(result.snapshot.qualification.reasonCode).toBe('unsupported-sample-type');
    }
  });

  it.each(['', 'random', 'firstMorning', 'secondMorning'])('brak odpowiedzi lub znana próbka%s nie usuwa dostępnego porównania', sampleType => {
    expect(calculate({ sampleType }).referenceAvailable).toBe(true);
    expect(reported('60', 'umol/mmol', { sampleType }).referenceAvailable).toBe(true);
  });

  it('ograniczenia materiału pochodzą z podanej polityki, nie z ukrytego założenia silnika', () => {
    expect(policy.restrictions.restrictedSampleTypes).toEqual(['timed']);
    const synthetic = structuredClone(policy);
    synthetic.id = 'SYNTHETIC_TIMED_POLICY';
    synthetic.restrictions.restrictedSampleTypes = [];
    expect(reported('60', 'umol/mmol', { sampleType: 'timed' }, synthetic)).toMatchObject({ valid: true, category: 'within', referenceAvailable: true });
    expect(synthetic.restrictions.restrictedSampleTypes).toEqual([]);
  });

  it('snapshot zachowuje źródło, wersję, jednostkę, dokładne dane i stałe bez późniejszych przeliczeń', () => {
    const result = calculate();
    expect(result.snapshot).toMatchObject({ schema: 'clcr-oxcr', version: 1, policyId: policy.id, policyVersion: 1, profileId: 'FIMLAB_OXCR_P95_2025', profileVersion: 1, originalUnit: 'mg/mg:acid', basis: 'acid', context: { ageYears: 8, sameSpecimen: 'assumed' }, conversion: { version: 1, constants: { oxalicAcidMgPerMmol: '90.0349', creatinineMgPerMmol: '113.12' } } });
    expect(Object.isFrozen(result.snapshot.input)).toBe(true);
    expect(result.referenceTable.filter(row => row.selected)).toHaveLength(1);
    expect(result.referenceTable).toHaveLength(8);
  });
});

describe('Ox/Cr — produkcyjny odczyt pól, wieku i dawnych jednostek', () => {
  function documentWith(patch = {}) {
    const values = {
      formulaPicker: 'OxCr_spot', age: '8', ageMonths: '0', ageDays: '12',
      OxCr_entry_mode: 'concentration', Ox_Cr_spot: '60', Ox_Cr_spot_unit: 'umol/L',
      Ucr_spot: '1', Ucr_spot_unit: 'mmol/L', OxCr_reported: '', OxCr_reported_unit: 'umol/mmol', OxCr_same_specimen: '',
      ...patch,
    };
    const controls = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, typeof value === 'boolean' ? { checked: value } : { value }]));
    return { controls, getElementById: id => controls[id], defaultView: browser };
  }
  it('wykorzystuje istniejący wiek chronologiczny bez starego dnia życia ani nowego pytania', () => {
    const input = engine.readInputFromDocument(documentWith());
    expect(input).toMatchObject({ ageYears: 8, oxalateValue: '60', oxalateUnit: 'umol/L', creatinineUnit: 'mmol/L', sameSpecimen: 'assumed', knownFacts: {} });
    expect(engine.evaluate(input, policy)).toMatchObject({ rawValue: 60, category: 'within' });
  });
  it('nie zakłada postaci masowej z samej nazwy analitu, ale odczytuje jawny dawny wybór', () => {
    const doc = documentWith({ Ox_Cr_spot: '1', Ucr_spot: '10', Ucr_spot_unit: 'mg/dl' });
    delete doc.controls.Ox_Cr_spot_unit;
    expect(engine.readInputFromDocument(doc).oxalateUnit).toBe('mg/dL:unknown');
    doc.controls.oxalateSpotReportingEntity = { value: 'oxalate_ion' };
    expect(engine.readInputFromDocument(doc).oxalateUnit).toBe('mg/dL:ion');
    doc.controls.oxalateSpotReportingEntity.value = 'oxalic_acid';
    expect(engine.readInputFromDocument(doc).oxalateUnit).toBe('mg/dL:acid');
    doc.controls.Ox_Cr_spot_unit = { value: 'umol/L' };
    expect(engine.readInputFromDocument(doc).oxalateUnit).toBe('umol/L');
  });
  it('znana sprzeczność próbek blokuje tylko iloraz, a jawne no/unknown mają pierwszeństwo', () => {
    const doc = documentWith({ ui_spotSameSpecimen_answer: 'no', spotInfection: true, ui_spotInfection_answer: 'no', spotHematuria: true, ui_spotHematuria_answer: 'unknown', spotExercise: true });
    const input = engine.readInputFromDocument(doc);
    expect(input).toMatchObject({ sameSpecimen: 'different', confounders: ['exercise'], knownFacts: { infection: false, hematuria: null, exercise: true } });
    expect(engine.evaluate(input, policy).reasonCode).toBe('different-specimens');
    doc.controls.OxCr_entry_mode.value = 'direct'; doc.controls.OxCr_reported.value = '60';
    expect(engine.evaluate(engine.readInputFromDocument(doc), policy)).toMatchObject({ valid: true, category: 'within', context: { sameSpecimen: 'not-applicable' } });
    expect(engine.readInputFromDocument(doc, { concentrationOnly: true }).mode).toBe('concentration');
  });
  it('nie poprawia pustej jednostki ani nie uznaje historycznego wcześniactwa za obecną populację', () => {
    const doc = documentWith({ Ox_Cr_spot_unit: '', Ucr_spot_unit: '', neonatalTermStatus: 'preterm' });
    const input = engine.readInputFromDocument(doc);
    expect(input.oxalateUnit).toBe(''); expect(input.creatinineUnit).toBe('');
    expect(input).not.toHaveProperty('population.currentPreterm');
    expect(engine.evaluate(input, policy).reasonCode).toBe('invalid-oxalate-unit');
  });
});
