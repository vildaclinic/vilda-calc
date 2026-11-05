import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
for (const file of ['clcr_clinical_safety.js', 'clcr_ca_cit_reference_data.js', 'clcr_ca_cit.js']) loadBrowserScript(file, browser);
const data = browser.ClcrCaCitReferenceData, engine = browser.VildaClcrCaCit;
const profile = data.getProfile(data.DEFAULT_PROFILE_ID);
const example = { mode: 'concentration', calciumValue: '2', calciumUnit: 'mmol/L', citrateValue: '40', citrateUnit: 'mg/dL', ageYears: 5, sex: 'M' };
const calculate = (patch = {}, source = profile) => engine.evaluate({ ...example, ...patch }, source);
const reported = (reportedValue, patch = {}, source = profile) => engine.evaluate({ mode: 'reported', reportedValue, reportedUnit: 'mg/mg', ageYears: 5, sex: 'M', ...patch }, source);

describe('Ca/Cit — osobne, źródłowe dane i wstrzyknięta populacja', () => {
  it('zamraża pełne źródło, trzy grupy obu płci i ograniczenie podstawy masowej', () => {
    expect(data).toBe(browser.VildaClcrCaCitReferenceData);
    expect(data.listProfiles()).toEqual([profile]); expect(data.getProfile('unknown')).toBeNull();
    expect(Object.isFrozen(profile.bands[0].bySex)).toBe(true);
    expect(profile.source).toMatchObject({ pmcid: 'PMC4147207', fullDocumentRead: true, accessedAt: '2026-11-05', citrateMassBasis: 'unknown' });
    expect(profile.population).toMatchObject({ minimumAgeYearsInclusive: 2, maximumAgeYearsExclusive: 18, sexSpecific: true, collectionHours: 24 });
    expect(profile.bands.map(b => [b.minimumAgeYearsInclusive, b.maximumAgeYearsExclusive, b.bySex.M.lowerP5, b.bySex.M.upper, b.bySex.F.lowerP5, b.bySex.F.upper])).toEqual([
      [2, 7, .05, .48, .03, .42], [7, 13, .05, .60, .04, .47], [13, 18, .06, .80, .05, .60],
    ]);
    expect(profile.restrictions).toMatchObject({ allowMolarConversion: false, upperInclusive: true, lowerP5IsAlarm: false, normalizeTo24Hours: false });
  });

  it('bez źródła i przy wadliwym źródle zachowuje wyłącznie poprawną liczbę', () => {
    expect(engine.evaluate(example)).toMatchObject({ valid: true, rawValue: .20039, reasonCode: 'missing-profile', category: null, reference: null, tone: 'neutral' });
    for (const broken of [{ ...profile, nativeUnit: 'mmol/mmol' }, { ...profile, quantity: 'albumin' }, { ...profile, bands: [] }, { ...profile, restrictions: {} }, { ...profile, restrictions: { ...profile.restrictions, allowMolarConversion: true } }, { ...profile, notes: null }]) {
      expect(calculate({}, broken)).toMatchObject({ valid: true, rawValue: .20039, reasonCode: 'invalid-profile', category: null, reference: null });
    }
  });

  it('przyjmuje inną populację jako dane, bez mutacji lub ukrytego fallbacku', () => {
    const synthetic = structuredClone(profile); synthetic.id = 'FICTIONAL_TEST'; synthetic.population.label = 'Fikcyjna populacja testowa'; synthetic.bands[0].bySex.M.upper = .2;
    const before = structuredClone(synthetic), result = calculate({}, synthetic);
    expect(result).toMatchObject({ profileId: 'FICTIONAL_TEST', category: 'above', reference: { upper: .2 }, population: { label: 'Fikcyjna populacja testowa' } });
    expect(synthetic).toEqual(before); expect(Object.isFrozen(synthetic)).toBe(false);
    expect(calculate({}, { ...profile, bands: [profile.bands[1]] })).toMatchObject({ referenceAvailable: false, reasonCode: 'under-age' });
    expect(calculate({}, { ...profile, bands: [...profile.bands, profile.bands[0]] })).toMatchObject({ referenceAvailable: false, reasonCode: 'ambiguous-age-band' });
  });
});

describe('Ca/Cit — produkcyjne konwersje zachowują natywny wymiar cytrynianów', () => {
  it.each([
    ['2', 'mmol/L', '40', 'mg/dL'], ['2000', 'µmol/L', '400', 'mg/L'], ['2000', 'umol/L', '400', 'mg/L'],
    ['80.156', 'mg/L', '400', 'mg/L'], ['8.0156', 'mg/dL', '40', 'mg/dL'], ['8,0156', 'mg/dl', '40', 'mg/dl'],
  ])('Ca %s %s / Cit %s %s = dokładne 0,20039 mg/mg', (calciumValue, calciumUnit, citrateValue, citrateUnit) => {
    const result = calculate({ calciumValue, calciumUnit, citrateValue, citrateUnit });
    expect(result).toMatchObject({ valid: true, rawValue: .20039, unit: 'mg/mg', exactValue: { numerator: '20039', denominator: '100000' }, category: 'within', display: { value: '0.20039', fullValueText: '0.20039', rounded: false }, canonicalConcentrations: { calcium: '80.156', citrate: '400', unit: 'mg/L' } });
    expect(result.input).toMatchObject({ calciumValue, calciumUnit, citrateValue, citrateUnit });
  });

  it.each([
    ['1', 'mmol/L', '2', 'mmol/L'], ['1000', 'µmol/L', '2000', 'µmol/L'], ['40.078', 'mg/L', '2', 'mmol/L'], ['4.0078', 'mg/dL', '2000', 'μmol/L'],
  ])('Ca %s %s / Cit %s %s = 0,5 mmol/mmol bez przeliczenia normy', (calciumValue, calciumUnit, citrateValue, citrateUnit) => {
    expect(calculate({ calciumValue, calciumUnit, citrateValue, citrateUnit })).toMatchObject({ valid: true, rawValue: .5, unit: 'mmol/mmol', reasonCode: 'molar-no-reference', tone: 'neutral', reference: null, classificationValue: null });
  });

  it('wybór jednostki interpretuje wpis z raportu, bez ukrytej konwersji mg↔mol', () => {
    expect(calculate().rawValue).toBe(.20039);
    expect(calculate({ citrateUnit: 'mmol/L' })).toMatchObject({ rawValue: .05, unit: 'mmol/mmol', referenceAvailable: false });
    expect(reported('.4', { reportedUnit: 'mol/mol' })).toMatchObject({ rawValue: .4, unit: 'mmol/mmol', reasonCode: 'molar-no-reference', input: { reportedUnit: 'mol/mol' } });
  });

  it('akceptuje aliasy trybu, zachowując kanoniczny reported', () => {
    for (const mode of ['reported', 'direct', 'ready']) expect(reported('.2', { mode })).toMatchObject({ mode: 'reported', input: { mode: 'reported' }, snapshot: { mode: 'reported' } });
  });

  it.each([['mol/mol', 'mmol/mmol'], ['g/g', 'mg/mg']])('zachowuje udokumentowaną oryginalną jednostkę %s przy kanonicznej %s', (original, unit) => {
    const input = engine.inputFromValues({ CACIT_inputMode: 'reported', CACIT_reportedValue: '0.2003900', CACIT_reportedUnit: unit, CACIT_reportedUnitOriginal: original }, { ageYears: 5, sex: 'M' });
    expect(input.reportedUnitOriginal).toBe(original);
    expect(engine.evaluate(input, profile)).toMatchObject({ unit, input: { reportedValue: '0.2003900', reportedUnit: unit, reportedUnitOriginal: original }, snapshot: { input: { reportedUnitOriginal: original } } });
    expect(reported('.2', { reportedUnit: unit, reportedUnitOriginal: 'unsupported' }).input).not.toHaveProperty('reportedUnitOriginal');
    expect(reported('.2', { reportedUnit: unit, reportedUnitOriginal: original === 'g/g' ? 'mol/mol' : 'g/g' }).input).not.toHaveProperty('reportedUnitOriginal');
  });
});

describe('Ca/Cit — dokładne P95, wiek i płeć', () => {
  it.each([
    [2, 'M', '.48', .48], [2, 'F', '.42', .42], [6.999, 'M', '.48', .48], [7, 'M', '.60', .60], [7, 'F', '.47', .47],
    [12.999, 'F', '.47', .47], [13, 'M', '.80', .80], [13, 'F', '.60', .60], [17.999, 'M', '.80', .80],
  ])('wiek %s, płeć %s, wynik %s włącza dokładne P95 %s', (ageYears, sex, value, upper) => {
    const result = reported(value, { ageYears, sex });
    expect(result).toMatchObject({ category: 'within', tone: 'success', reference: { upper, upperInclusive: true, band: { sex } }, comment: 'Wynik nie przekracza górnej granicy dla wieku i płci.' });
    expect(result.reference.table.filter(row => row.selected)).toHaveLength(1);
    expect(result.reference.table.find(row => row.selected).selectedSex).toBe(sex);
  });

  it('porównuje dokładny zapis, również ponad precyzją Number, bez epsilonu', () => {
    const value = '0.4800000000000000000000001', result = reported(value);
    expect(result.rawValue).toBe(.48);
    expect(result).toMatchObject({ category: 'above', tone: 'warning', display: { value, rounded: false } });
    expect(calculate({ calciumValue: '48.00000000000000000000001', calciumUnit: 'mg/L', citrateValue: '100', citrateUnit: 'mg/L' })).toMatchObject({ category: 'above', display: { value, rounded: false } });
    expect(reported('0.47999999999999999999999')).toMatchObject({ category: 'within' });
    expect(reported('.48', { ageYearsRaw: '6.99999999999999999999999' }).reference.upper).toBe(.48);
    expect(reported('.48', { ageYearsRaw: '7.00000000000000000000001' }).reference.upper).toBe(.6);
  });

  it('także tuż ponad P95 w każdej jednostce stężeń nadanie oceny nie zależy od skali', () => {
    for (const [calciumValue, calciumUnit, citrateValue, citrateUnit] of [['48.00000001', 'mg/L', '100', 'mg/L'], ['4.800000001', 'mg/dL', '10', 'mg/dL']]) {
      expect(calculate({ calciumValue, calciumUnit, citrateValue, citrateUnit })).toMatchObject({ category: 'above', rawValue: .4800000001, display: { value: '0.4800000001' } });
    }
  });

  it.each([
    [{ ageYears: 1.999 }, 'under-age'], [{ ageYears: 18 }, 'adult-no-reference'], [{ ageYears: 85 }, 'adult-no-reference'], [{ ageYears: null }, 'missing-age'],
    [{ ageYears: '' }, 'missing-age'], [{ ageYears: NaN }, 'invalid-age'], [{ ageYears: -1 }, 'invalid-age'], [{ sex: '' }, 'missing-sex'], [{ sex: 'unknown' }, 'missing-sex'],
  ])('brak właściwego odniesienia %j → %s, bez zastępczej normy', (patch, reasonCode) => {
    expect(reported('.4', patch)).toMatchObject({ valid: true, rawValue: .4, reasonCode, category: null, reference: null, tone: 'neutral' });
  });

  it('P5 nie tworzy alarmu, a dorośli nie otrzymują globalnego progu 0,33', () => {
    expect(reported('.00001')).toMatchObject({ category: 'within', tone: 'success', reference: { band: { lowerP5: .05 } } });
    expect(reported('.9', { ageYears: 30 })).toMatchObject({ category: null, tone: 'neutral', referenceAvailable: false });
  });

  it('zachowuje dokładność wieku z ukończonych lat i nie tworzy daty', () => {
    const result = reported('.48', { ageYears: 6, agePrecision: 'completed-years', ageInterval: { minimumAgeYearsInclusive: 6, maximumAgeYearsExclusive: 7 } });
    expect(result).toMatchObject({ category: 'within', context: { ageExact: null, agePrecision: 'completed-years', ageInterval: { maximumAgeYearsExclusive: 7 } } });
    expect(reported('.48', { ageYears: 6, agePrecision: 'completed-years', ageInterval: { minimumAgeYearsInclusive: 6, maximumAgeYearsExclusive: 8 } })).toMatchObject({ referenceAvailable: false, reasonCode: 'invalid-age' });
  });
});

describe('Ca/Cit — kontekst ogranicza normę, nie zastępuje faktów', () => {
  it.each([
    [{ collectionProblem: true }, 'collection-problem'], [{ knownFacts: { collectionNoMissedVoids: false } }, 'collection-problem'],
    [{ knownFacts: { Cl24CollectionProblem: true, unrelated: false } }, 'collection-problem'], [{ collectionHours: '12' }, 'non-24h-collection'],
    [{ collectionHours: '0' }, 'invalid-duration'], [{ collectionHours: '-24' }, 'invalid-duration'], [{ sampleType: 'random' }, 'unsupported-specimen'],
    [{ sampleType: 'spot' }, 'unsupported-specimen'], [{ sampleType: 'unknown', sampleSource: 'historical-missing' }, 'historical-unknown-sample'],
    [{ durationKnown: false, collectionHours: '24' }, 'historical-unknown-sample'], [{ durationSource: 'historical-missing', collectionHours: '' }, 'historical-unknown-sample'],
  ])('znany kontekst %j zachowuje liczbę i blokuje porównanie (%s)', (patch, reasonCode) => {
    for (const result of [calculate(patch), reported('.20039', patch)]) expect(result).toMatchObject({ valid: true, rawValue: .20039, reasonCode, referenceAvailable: false, category: null, tone: 'neutral' });
  });

  it('inne próbki blokują obliczenie pary; gotowy raport zachowuje ukrytą sprzeczność', () => {
    expect(calculate({ sameSpecimen: 'different' })).toMatchObject({ valid: false, reasonCode: 'different-specimens', snapshot: null });
    expect(reported('.2', { sameSpecimen: 'different' })).toMatchObject({ valid: true, referenceAvailable: false, reasonCode: 'different-specimens-reported', context: { sameSpecimen: 'not-applicable', concentrationSameSpecimen: 'different' } });
    expect(reported('.2', { concentrationSameSpecimen: 'different', reportedSameSpecimen: 'confirmed' })).toMatchObject({ valid: true, referenceAvailable: true, context: { concentrationSameSpecimen: 'different', reportedSameSpecimen: 'confirmed' } });
  });

  it('nie skaluje ilorazu czasem, objętością, masą ani wzrostem', () => {
    expect(calculate({ collectionHours: '24', volume: '9000', weightKg: .1, heightCm: 30 })).toMatchObject({ rawValue: .20039, category: 'within' });
    expect(calculate({ collectionHours: '48' })).toMatchObject({ rawValue: .20039, referenceAvailable: false });
  });

  it('snapshot zamraża własny kontekst, ocenę i źródło jako zwykły JSON', () => {
    const input = { ...example, knownFacts: { collectionNoSpillage: false, medication: 'fictional' } }, result = engine.evaluate(input, profile);
    input.knownFacts.collectionNoSpillage = true;
    expect(result.snapshot).toMatchObject({ schema: 'clcr-ca-cit', version: 1, rawValue: .20039, exactValue: { numerator: '20039', denominator: '100000' }, reasonCode: 'collection-problem', context: { knownFacts: { collectionNoSpillage: false } }, referencePolicy: { id: profile.id }, source: { pmcid: 'PMC4147207' } });
    expect(JSON.parse(JSON.stringify(result.snapshot))).toEqual(result.snapshot); expect(result.snapshot).not.toHaveProperty('snapshot');
    expect(Object.isFrozen(result.snapshot.referencePolicy.bands)).toBe(true); expect(Object.isFrozen(input)).toBe(false);
    const unavailableFact = calculate({ knownFacts: { eGFR: NaN, oldUnknown: undefined } });
    expect(unavailableFact.context.knownFacts).toEqual({ eGFR: null, oldUnknown: null });
    expect(JSON.parse(JSON.stringify(unavailableFact.snapshot))).toEqual(unavailableFact.snapshot);
  });

  it('utrwala przesłankę knownIncomplete z prostego API do odtwarzania oceny historii', () => {
    const result = calculate({ knownIncomplete: true, knownFacts: { collectionNoSpillage: true, knownIncomplete: false } });
    expect(result).toMatchObject({ valid: true, rawValue: .20039, reasonCode: 'collection-problem', referenceAvailable: false, context: { knownFacts: { knownIncomplete: true, collectionNoSpillage: true } }, snapshot: { context: { knownFacts: { knownIncomplete: true } } } });
    expect(JSON.parse(JSON.stringify(result.snapshot))).toEqual(result.snapshot);
  });
});

describe('Ca/Cit — zero, ujemne dane, nierówności i granice liczbowe', () => {
  it('literalne zero jest neutralne i odróżnione od braku oraz od ilorazu przez zero', () => {
    for (const result of [calculate({ calciumValue: '0' }), reported('0'), reported('≤0')]) expect(result).toMatchObject({ valid: true, rawValue: 0, zero: true, category: null, tone: 'neutral', reasonCode: 'zero-result', display: { value: '0' } });
    expect(calculate({ calciumValue: '' })).toMatchObject({ valid: false, reasonCode: 'missing-calcium' });
    expect(calculate({ citrateValue: '0' })).toMatchObject({ valid: false, reasonCode: 'invalid-citrate' });
    expect(reported('≥0')).toMatchObject({ zero: false, category: null, reasonCode: 'censored-multiple-categories' });
  });

  it.each([
    [{ calciumValue: '-2', citrateValue: '-40' }, 'invalid-calcium'], [{ citrateValue: '-40' }, 'invalid-citrate'], [{ calciumValue: true }, 'invalid-calcium'],
    [{ calciumValue: NaN }, 'invalid-calcium'], [{ citrateValue: Infinity }, 'invalid-citrate'], [{ citrateValue: '' }, 'missing-citrate'],
    [{ calciumValue: '<2' }, 'invalid-calcium'], [{ calciumUnit: '' }, 'invalid-calcium-unit'], [{ citrateUnit: 'g/L' }, 'invalid-citrate-unit'], [{ mode: 'bad' }, 'invalid-mode'],
  ])('odrzuca osobne błędne operandy %j', (patch, reasonCode) => expect(calculate(patch)).toMatchObject({ valid: false, reasonCode, rawValue: null, snapshot: null }));

  it.each(['-1', '', '<0', 'Infinity', 'NaN', '.3 mg/mg', true])('odrzuca niepoprawny gotowy raport %j', value => expect(reported(value).valid).toBe(false));

  it.each([['<.48', 'within'], ['≤.48', 'within'], ['>.48', 'above'], ['≥.48', null], ['<.49', null], ['≥.480000000000000000001', 'above']])('ocenia cały przedział %s → %s', (value, category) => {
    expect(reported(value)).toMatchObject({ category, exact: false, tone: category === 'above' ? 'warning' : category === 'within' ? 'success' : 'neutral', input: { reportedValue: value } });
  });

  it('małe dodatnie liczby nie stają się zerem, a iloraz nie przepełnia się po drodze', () => {
    const tiny = calculate({ calciumValue: '1e-320', calciumUnit: 'mg/L', citrateValue: '1', citrateUnit: 'mg/L' });
    expect(tiny).toMatchObject({ valid: true, rawValue: 1e-320, zero: false, category: 'within', display: { value: '1e-320', rounded: false } });
    expect(engine.formatValue(tiny.rawValue, tiny.exactValue)).toBe('1e-320');
    expect(calculate({ calciumValue: '1e308', calciumUnit: 'mg/dL', citrateValue: '1e308', citrateUnit: 'mg/dL' })).toMatchObject({ valid: true, rawValue: 1 });
    expect(calculate({ calciumValue: '1e-400', calciumUnit: 'mg/L', citrateValue: '1e-400', citrateUnit: 'mg/L' })).toMatchObject({ valid: true, rawValue: 1 });
    expect(calculate({ calciumValue: '1e-320', calciumUnit: 'mg/L', citrateValue: '1e100', citrateUnit: 'mg/L' })).toMatchObject({ valid: false, reasonCode: 'invalid-conversion' });
    expect(calculate({ calciumValue: '1e308', calciumUnit: 'mg/L', citrateValue: '1e-308', citrateUnit: 'mg/L' })).toMatchObject({ valid: false, reasonCode: 'invalid-conversion' });
    expect(reported('1e-400')).toMatchObject({ valid: false, reasonCode: 'invalid-conversion' });
  });
});

describe('Ca/Cit — kanoniczne pola walidacji aktywnego trybu', () => {
  it.each([
    [{ calciumValue: '', citrateValue: '' }, ['CACIT_calcium', 'CACIT_citrate'], []],
    [{ calciumValue: '-1', citrateValue: '0' }, [], ['CACIT_calcium', 'CACIT_citrate']],
    [{ calciumValue: '', citrateValue: '-1' }, ['CACIT_calcium'], ['CACIT_citrate']],
    [{ calciumUnit: '', citrateUnit: '' }, ['CACIT_calciumUnit', 'CACIT_citrateUnit'], []],
    [{ calciumUnit: 'bad', citrateUnit: 'g/L' }, [], ['CACIT_calciumUnit', 'CACIT_citrateUnit']],
    [{ reportedValue: '-1', reportedUnit: '' }, [], []],
  ])('wszystkie aktywne braki i błędy %j', (patch, missingIds, invalidIds) => {
    const result = calculate(patch);
    expect(result.missingIds).toEqual(missingIds); expect(result.invalidIds).toEqual(invalidIds);
    expect(Object.isFrozen(result.missingIds)).toBe(true); expect(Object.isFrozen(result.invalidIds)).toBe(true);
  });

  it.each([
    ['', { reportedUnit: '' }, ['CACIT_reportedValue', 'CACIT_reportedUnit'], []],
    ['-1', { reportedUnit: 'g/L' }, [], ['CACIT_reportedValue', 'CACIT_reportedUnit']],
    ['0', { calciumValue: '-1', citrateValue: '0', calciumUnit: '', citrateUnit: 'bad' }, [], []],
    ['1e-400', {}, [], ['CACIT_reportedValue']],
  ])('gotowy raport %s obejmuje wyłącznie jego aktywne kontrolki', (value, patch, missingIds, invalidIds) => {
    const result = reported(value, patch);
    expect(result.missingIds).toEqual(missingIds); expect(result.invalidIds).toEqual(invalidIds);
  });

  it('błąd reprezentacji wskazuje aktywne stężenia, a sprzeczność próbki nie fałszuje ich walidacji', () => {
    expect(calculate({ calciumValue: '1e308', calciumUnit: 'mg/L', citrateValue: '1e-308', citrateUnit: 'mg/L' })).toMatchObject({ invalidIds: ['CACIT_calcium', 'CACIT_citrate'], missingIds: [], reasonCode: 'invalid-conversion' });
    expect(calculate({ sameSpecimen: 'different' })).toMatchObject({ invalidIds: [], missingIds: [], reasonCode: 'different-specimens' });
    expect(calculate({ calciumValue: '0' }).snapshot).toMatchObject({ missingIds: [], invalidIds: [], rawValue: 0 });
  });
});

function documentWith(values = {}) {
  const controls = Object.fromEntries(Object.entries({ ...engine.DEFAULTS, age: '5', ageMonths: '', ageDays: '', sex: 'M', CACIT_calcium: '2', CACIT_citrate: '40', ...values }).map(([id, value]) => [id, typeof value === 'boolean' ? { checked: value, type: 'checkbox' } : { value }]));
  return { controls, getElementById: id => controls[id] || null };
}

describe('Ca/Cit — rzeczywisty adapter formularza', () => {
  it('czyta istniejące dane pacjenta bez dodatkowych pytań i bez mutacji kontrolek', () => {
    const doc = documentWith(), before = JSON.stringify(doc.controls), input = engine.readInputFromDocument(doc);
    expect(input).toMatchObject({ mode: 'concentration', calciumValue: '2', citrateValue: '40', ageYears: 5, sex: 'M', sampleType: 'timed' });
    expect(engine.evaluateFromDocument(doc, profile)).toMatchObject({ valid: true, rawValue: .20039, category: 'within' });
    expect(JSON.stringify(doc.controls)).toBe(before);
  });

  it('jawnie puste jednostki nie stają się domyślnymi, nieobecne mogą przyjąć domyślną jednostkę', () => {
    expect(engine.evaluateFromDocument(documentWith({ CACIT_citrateUnit: '' }), profile)).toMatchObject({ valid: false, reasonCode: 'invalid-citrate-unit', referenceTable: profile.bands.map(band => expect.objectContaining({ id: band.id })), source: { pmcid: 'PMC4147207' } });
    const doc = documentWith(); delete doc.controls.CACIT_citrateUnit;
    expect(engine.readInputFromDocument(doc).citrateUnit).toBe('mg/dL');
    expect(engine.captureFields(doc)).not.toHaveProperty('CACIT_citrateUnit');
  });

  it('zachowuje istniejące fakty o zbiórce oraz nie potwierdza nieodpowiedzianych pól', () => {
    const doc = documentWith({ Cl24CollectionProblem: true, collectionNoSpillage: false, ui_collectionNoMissedVoids_answer: 'no', ui_collectionStorageFollowed_answer: 'unknown' });
    const input = engine.readInputFromDocument(doc);
    expect(input.knownFacts).toEqual({ Cl24CollectionProblem: true, collectionNoMissedVoids: false, collectionStorageFollowed: null });
    expect(engine.evaluate(input, profile)).toMatchObject({ valid: true, reasonCode: 'collection-problem', referenceAvailable: false });
  });

  it('ukryte historyczne fakty przetrwają zmianę trybu i odczyt z wartości', () => {
    const context = { ageYears: 5, sex: 'M', sampleSource: 'historical-missing', durationKnown: false, knownFacts: { collectionNoSpillage: false } };
    const values = { CACIT_inputMode: 'reported', CACIT_reportedValue: '.2', CACIT_reportedUnit: 'mg/mg' };
    const input = engine.inputFromValues(values, context), result = engine.evaluate(input, profile);
    expect(result).toMatchObject({ valid: true, referenceAvailable: false, context: { sampleSource: 'historical-missing', durationKnown: false, knownFacts: { collectionNoSpillage: false } } });
    expect(engine.normalizeInput(values, context)).toEqual(input);
  });

  it('domyślne ukryte kontrolki nie wymazują jawnie znanych sprzeczności kontekstu', () => {
    const input = engine.inputFromValues({ ...engine.DEFAULTS, CACIT_calcium: '2', CACIT_citrate: '40', CACIT_collectionProblem: false }, { ageYears: 5, sex: 'M', sameSpecimen: 'different', sampleType: 'random', sampleSource: 'historical-missing', collectionHours: '12', durationKnown: false, collectionProblem: true });
    expect(input).toMatchObject({ sameSpecimen: 'different', sampleType: 'random', sampleSource: 'historical-missing', collectionHours: '12', durationKnown: false, collectionProblem: true });
    expect(engine.evaluate(input, profile)).toMatchObject({ valid: false, reasonCode: 'different-specimens' });
    expect(engine.evaluate({ ...input, mode: 'reported', reportedValue: '.2' }, profile)).toMatchObject({ valid: true, referenceAvailable: false, outOfRange: null });
  });

  it.each(['yes', 'unknown'])('uśpiona odpowiedź %s nie nadpisuje importowanych faktów o niepełnej zbiórce', answer => {
    const doc = documentWith({ CACIT_collectionProblem: 'false', ui_collectionNoMissedVoids_answer: answer, ui_Cl24CollectionProblem_answer: 'no' });
    const input = engine.readInputFromDocument(doc, { knownFacts: { collectionNoMissedVoids: false, Cl24CollectionProblem: true } });
    expect(input.knownFacts).toMatchObject({ collectionNoMissedVoids: false, Cl24CollectionProblem: true });
    expect(engine.evaluate(input, profile)).toMatchObject({ valid: true, reasonCode: 'collection-problem', referenceAvailable: false });
  });

  it('odczytuje oryginalną jednostkę importu z istniejącego nośnika bez dodawania pola', () => {
    const doc = documentWith({ CACIT_inputMode: 'reported', CACIT_reportedValue: '.5', CACIT_reportedUnit: 'mmol/mmol' });
    doc.defaultView = { __vildaClcrVersionValueVault: { CACIT_reportedUnitOriginal: 'mol/mol' } };
    const input = engine.readInputFromDocument(doc);
    expect(input).toMatchObject({ reportedValue: '.5', reportedUnit: 'mmol/mmol', reportedUnitOriginal: 'mol/mol' });
    expect(engine.evaluate(input, profile).snapshot.input.reportedUnitOriginal).toBe('mol/mol');
    expect(doc.getElementById('CACIT_reportedUnitOriginal')).toBeNull();
  });
});
