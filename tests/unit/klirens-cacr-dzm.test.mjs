import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
for (const file of ['clcr_clinical_safety.js', 'clcr_cacr_reference_data.js', 'clcr_cacr.js']) loadBrowserScript(file, browser);
const engine = browser.VildaClcrCacr;
const data = browser.VildaClcrCacrReferenceData;
const arup = data.getProfile('ARUP_CACR_DZM_2026_11');
const mayo = data.getProfile('MAYO_CACR3_RANDOM_2026_10');
const base = { mode: 'concentration', calciumValue: '5', calciumUnit: 'mmol/L', creatinineValue: '100', creatinineUnit: 'mg/dL', ageYears: 40, sex: 'M', sampleType: 'timed' };
const calculate = (patch = {}, profile = arup) => engine.evaluate({ ...base, ...patch }, profile);
const reported = (value, unit = 'mg/mg', patch = {}, profile = arup) => calculate({ mode: 'direct', reportedValue: value, reportedUnit: unit, ...patch }, profile);

// Independently transcribed from the full ARUP 0020472 catalog, not imported
// from the production data array. Native source unit is mg/g.
const rows = [
  [0, 1, [30, 810], [30, 810]], [1, 2, [30, 560], [30, 560]],
  [2, 3, [20, 500], [20, 500]], [3, 5, [20, 410], [20, 410]],
  [5, 7, [10, 300], [10, 300]], [7, 10, [6, 431], [11, 457]],
  [10, 13, [8, 300], [12, 309]], [13, 16, [6, 293], [8, 313]],
  [16, 18, [10, 264], [20, 271]], [18, null, [20, 240], [20, 300]],
];
const sourceCases = rows.flatMap(([ageYears, , male, female]) => [['M', male], ['F', female]].flatMap(([sex, [lo, hi]]) => [
  [ageYears, sex, String(lo), 'within', lo, hi], [ageYears, sex, String(hi), 'within', lo, hi],
  [ageYears, sex, `${lo - 1}.999999999999999999`, 'below', lo, hi],
  [ageYears, sex, `${hi}.000000000000000001`, 'above', lo, hi],
]));

describe('Ca/Cr DZM — jeden pełny profil laboratoryjny ARUP', () => {
  it('utrwala materiał, źródło, brak kohorty i nieograniczony źródłowo ostatni wiek', () => {
    expect(data.listProfiles()).toEqual([mayo, arup]);
    expect(arup).toMatchObject({ formulaId: 'Ca_Cr', source: { id: 'ARUP_0020472', accessedAt: '2026-11-02', nativeReportedUnit: 'mg/g', fullDocumentRead: true, cohortPublished: false, publicationDate: null },
      population: { maximumAgeYearsInclusive: null }, restrictions: { applicableSampleTypes: ['timed'], sourceSampleTypes: ['timed', 'random'], normalizeTo24Hours: false } });
    expect(arup.bands).toHaveLength(10);
    expect(arup.bands.at(-1).maximumAgeMonths).toBeNull();
    expect(Object.isFrozen(arup.bands[5].bySex.F)).toBe(true);
  });

  it.each(sourceCases)('wiek %s / %s / %s mg/g → %s; zakres %s–%s', (ageYears, sex, value, category, lower, upper) => {
    const result = reported(value, 'mg/g', { ageYears, sex });
    expect(result).toMatchObject({ valid: true, sourceFormula: 'Ca_Cr', category, status: category, referenceAvailable: true,
      reference: { nativeLow: lower / 1000, nativeHigh: upper / 1000, lower, upper, unit: 'mg/g', lowerInclusive: true, upperInclusive: true, source: { id: 'ARUP_0020472' } } });
  });

  it.each(rows.slice(1).flatMap(([age], i) => ['M', 'F'].map((sex, column) => [String(age), sex, rows[i][column + 2], rows[i + 1][column + 2]])))('nie zaokrągla wieku tuż przed/po %s lat (%s)', (age, sex, before, after) => {
    const low = calculate({ ageYears: `${Number(age) - 1}.999999999999999999`, sex });
    const high = calculate({ ageYears: `${age}.000000000000000001`, sex });
    expect(low.reference).toMatchObject({ nativeLow: before[0] / 1000, nativeHigh: before[1] / 1000 });
    expect(high.reference).toMatchObject({ nativeLow: after[0] / 1000, nativeHigh: after[1] / 1000 });
    expect(low.snapshot.context.ageYearsRaw).toBe(`${Number(age) - 1}.999999999999999999`);
  });

  it.each([0, 1, 2, 3, 5, '6.999999999999999999'])('wiek %s nie wymaga płci dla wspólnego zakresu', ageYears => {
    expect(calculate({ ageYears, sex: '' })).toMatchObject({ valid: true, category: 'within', referenceAvailable: true, reference: { band: { sharedSexRange: true } } });
  });
  it.each([7, 8, 10, 13, 16, 18, 40])('wiek %s bez płci zachowuje liczbę i całą tabelę, bez normy', ageYears => {
    expect(calculate({ ageYears, sex: '' })).toMatchObject({ valid: true, rawValue: 0.20039, category: null, reference: null, reasonCode: 'missing-sex', referenceAvailable: false, tone: 'neutral' });
    expect(calculate({ ageYears, sex: '' }).referenceTable).toHaveLength(10);
  });
  it.each([84, 120])('DZM w wieku %s nie dziedziczy limitu 83 lat Mayo', ageYears => expect(calculate({ ageYears }).referenceAvailable).toBe(true));
  it.each([121, '120.000000000000000001', '', null, -1, Infinity])('nieważny kontekst wieku %s nie usuwa liczby ani nie tworzy normy', ageYears => {
    expect(calculate({ ageYears })).toMatchObject({ valid: true, rawValue: 0.20039, referenceAvailable: false, category: null, tone: 'neutral' });
  });
});

describe('Ca/Cr — kwalifikacja dwóch odrębnych materiałów', () => {
  it('ten sam zgłoszony wynik 300 mg/g u 8-latka ma źródłowo różne oceny', () => {
    expect(reported('300', 'mg/g', { ageYears: 8 })).toMatchObject({ sourceFormula: 'Ca_Cr', category: 'within', reference: { lower: 6, upper: 431 } });
    expect(reported('300', 'mg/g', { ageYears: 8, sampleType: 'random' }, mayo)).toMatchObject({ sourceFormula: 'CaCr_spot', category: 'above', reference: { lower: 10, upper: 250 } });
  });
  it.each(['timed', 'unknown', 'other'])('Mayo nie interpretuje materiału %s', sampleType => {
    expect(calculate({ sampleType, ageYears: 8 }, mayo)).toMatchObject({ valid: true, rawValue: 0.20039, reference: null, reasonCode: 'unsupported-specimen', tone: 'neutral' });
  });
  it.each(['random', 'unknown', '', 'other'])('DZM nie interpretuje materiału %s', sampleType => {
    expect(calculate({ sampleType })).toMatchObject({ valid: true, rawValue: 0.20039, reference: null, reasonCode: 'unsupported-specimen' });
  });
  it('Mayo zachowuje jawne założenie dla niepodanego domyślnego materiału spot', () => {
    expect(calculate({ sampleType: '', ageYears: 8 }, mayo)).toMatchObject({ category: 'within', context: { sampleAssumption: 'assumed-random' } });
    expect(calculate({ sampleType: 'random', ageYears: 84 }, mayo)).toMatchObject({ valid: true, category: null, reference: null, reasonCode: 'over-age' });
  });
  it('Mayo zachowuje dokładny miesiąc zarówno w numeric API, jak i we własnym DOM readerze', () => {
    expect(calculate({ sampleType: 'random', ageYears: 1 / 12 }, mayo)).toMatchObject({ referenceAvailable: true, reference: { nativeLow: 0.03, nativeHigh: 0.81 } });
    const doc = documentWith({ age: '0', ageMonths: '1', Ca_spot: '5', Ca_spot_unit: 'mmol/L', Ucr_spot: '100', Ucr_spot_unit: 'mg/dL' });
    const input = engine.readInputFromDocument(doc);
    expect(input).toMatchObject({ sampleType: 'random', sampleAssumption: 'assumed-random', ageExact: { numerator: '1', denominator: '12' } });
    expect(engine.evaluate(input, mayo)).toMatchObject({ referenceAvailable: true, category: 'within' });
    expect(calculate({ sampleType: 'random', ageYears: '0.08333333333333333' }, mayo).referenceAvailable).toBe(false);
  });
  it.each([undefined, '12', '21.9999999999999999', '24', '24.5', '24,5', '25', '26.0000000000000001', '48'])('własny dodatni czas %s nie skaluje ratio i nie tworzy wymyślonego okna', collectionHours => {
    const result = calculate({ collectionHours });
    expect(result).toMatchObject({ rawValue: 0.20039, category: 'within', referenceAvailable: true });
    if (collectionHours !== undefined) expect(result.snapshot.context.collectionHours).toBe(collectionHours);
  });
  it('nieznany czas dawnej DZM nie staje się potwierdzonym 24 h', () => {
    const result = calculate({ durationKnown: false });
    expect(result).toMatchObject({ category: 'within', context: { durationKnown: false }, contextNote: expect.stringContaining('nieznany') });
    expect(result.context).not.toHaveProperty('collectionHours');
  });
  it('znany problem zbiórki ma pierwszeństwo przed poprawnym czasem', () => {
    expect(calculate({ collectionHours: '24', collectionProblem: true })).toMatchObject({ valid: true, rawValue: 0.20039, reference: null, qualification: { note: expect.stringMatching(/problem|niepełna/i) }, reasonCode: 'collection-problem' });
  });
  it.each(['0', '-1', 'abc', 'Infinity'])('nieprawidłowy własny czas %s zachowuje liczbę bez oceny', collectionHours => expect(calculate({ collectionHours })).toMatchObject({ valid: true, reference: null, reasonCode: 'invalid-duration' }));
  it.each(['timed', 'random'])('znany bieżący kontekst wcześniaczy wyłącza normę %s bez korekcji wieku', sampleType => {
    expect(calculate({ sampleType, ageYears: 0.5, population: { currentPreterm: true } }, sampleType === 'timed' ? arup : mayo)).toMatchObject({ valid: true, referenceAvailable: false, reasonCode: 'unsupported-population' });
  });
});

describe('Ca/Cr DZM — rzeczywista arytmetyka, precyzja i jednostki', () => {
  it.each([
    ['mg/mg', '.20039', 'mg/mg', 0.20039, 0.02, 0.24], ['mg/g', '200.39', 'mg/g', 0.20039, 20, 240],
    ['mmol/mmol', '1', 'mmol/mmol', 20039 / 56560, 5656 / 100195, 67872 / 100195],
    ['mg/mmol', '10', 'mg/mmol', 125 / 1414, 2.2624, 27.1488],
    ['mmol/mol', '100', 'mmol/mol', 20039 / 565600, 1131200 / 20039, 13574400 / 20039],
    ['g/g', '.2', 'mg/mg', 0.2, 0.02, 0.24], ['mol/mol', '1', 'mmol/mmol', 20039 / 56560, 5656 / 100195, 67872 / 100195],
  ])('raport %s zachowuje jednostkę i przelicza normę z tej samej osi', (inputUnit, value, unit, mass, lower, upper) => {
    const result = reported(value, inputUnit);
    expect(result).toMatchObject({ valid: true, unit, classificationValue: mass, input: { reportedUnit: inputUnit }, reference: { unit, lower, upper } });
    for (const row of result.reference.table) for (const range of Object.values(row.bySex)) expect(range.unit).toBe(unit);
  });
  it.each(['mmol/L', 'µmol/L', 'mg/L', 'mg/dL'].flatMap((calciumUnit, index) => ['mmol/L', 'µmol/L', 'mg/L', 'mg/dL'].map((creatinineUnit, j) => [calciumUnit, ['1', '1000', '40.078', '4.0078'][index], creatinineUnit, ['1', '1000', '113.12', '11.312'][j]])))('jednakowy iloraz dla pary %s/%s i %s/%s', (calciumUnit, calciumValue, creatinineUnit, creatinineValue) => {
    const result = calculate({ calciumUnit, calciumValue, creatinineUnit, creatinineValue });
    expect(result.classificationValue).toBe(20039 / 56560);
    expect(result.exactMass).toEqual({ numerator: '20039', denominator: '56560' });
  });
  it('nie ucina zaakceptowanych wartości 0.20039 i 0.320624', () => {
    expect(calculate()).toMatchObject({ rawValue: 0.20039, display: { value: '0.20039', text: '0.20039', rounded: false } });
    expect(calculate({ calciumValue: '8' })).toMatchObject({ rawValue: 0.320624, category: 'above', display: { value: '0.320624', rounded: false } });
  });
  it('przy skróconym direct nie sugeruje, że zamknięta granica jest nieprawidłowa', () => {
    expect(reported('≥0.2400000000001')).toMatchObject({ category: 'above', comparator: '≥', boundary: '>0,24', display: { text: '≥≈0.24', boundary: '>0,24' }, input: { reportedValue: '≥0.2400000000001' } });
    const converted = reported('≥27.1488000000001', 'mg/mmol');
    expect(converted).toMatchObject({ category: 'above', comparator: '≥', unit: 'mg/mmol', boundary: '>27,1488', display: { text: '≥≈27.1488', boundary: '>27,1488' }, input: { reportedValue: '≥27.1488000000001', reportedUnit: 'mg/mmol' } });
    expect(converted.reference.exactUpper).toEqual({ numerator: '16968', denominator: '625' });
  });
  it('oddziela precyzyjną liczbę z zaokrąglonych składowych raportu od zgłoszonego 140', () => {
    expect(calculate({ calciumValue: '6.0', calciumUnit: 'mg/dL', creatinineValue: '43', sex: 'F' }).exactMass).toEqual({ numerator: '6', denominator: '43' });
    expect(reported('140', 'mg/g', { sex: 'F' })).toMatchObject({ rawValue: 140, category: 'within', exactMass: { numerator: '7', denominator: '50' } });
    expect(reported('18', 'mg/g', { sex: 'F', collectionHours: '25' })).toMatchObject({ category: 'below', reference: { lower: 20, upper: 300 } });
  });
  it.each(['0', '≤0'])('dokładne zero/%s pozostaje neutralne z dostępną normą', value => {
    expect(reported(value)).toMatchObject({ valid: true, rawValue: 0, zero: true, category: null, comparison: null, status: 'unassessed', tone: 'neutral', referenceAvailable: true });
  });
  it('małe dodatnie wyniki nie stają się zerem ani w widoku, ani w snapshot', () => {
    const result = calculate({ calciumValue: '0.000004', calciumUnit: 'mg/dL' });
    expect(result).toMatchObject({ rawValue: 4e-8, category: 'below', exactMass: { numerator: '1', denominator: '25000000' }, display: { text: '4e-8' } });
    expect(result.snapshot.rawValue).toBeGreaterThan(0);
  });
  it.each([
    ['<.020', 'below'], ['≤.020', null], ['>.240', 'above'], ['≥.240', null], ['<.240', null],
  ])('nierówność %s oznacza cały możliwy przedział → %s', (value, category) => {
    expect(reported(value)).toMatchObject({ valid: true, category, exact: false, referenceAvailable: true });
  });
  it.each([
    { calciumValue: '-5' }, { creatinineValue: '-100' }, { calciumValue: '-5', creatinineValue: '-100' }, { creatinineValue: '0' },
    { calciumValue: 'Infinity' }, { calciumValue: '1e309' }, { calciumValue: '1e-400' },
    { calciumValue: '5e-324', creatinineValue: '1e308' }, { calciumValue: '1e308', creatinineValue: '5e-324' },
    { calciumValue: '<5' }, { calciumUnit: 'g/L' }, { sameSpecimen: 'different' },
  ])('waliduje osobno każdy operand i jego zakres %j', patch => expect(calculate(patch).valid).toBe(false));
  it('nie przepełnia się pośrednio, jeżeli końcowy iloraz jest poprawny', () => {
    expect(calculate({ calciumValue: '1e308', creatinineValue: '1e308' })).toMatchObject({ valid: true, rawValue: 4.0078 });
    expect(calculate({ calciumValue: '5e-324', calciumUnit: 'mg/dL', creatinineValue: '5e-324', creatinineUnit: 'mg/dL' })).toMatchObject({ valid: true, rawValue: 1 });
  });
  it('snapshot v2 jest zamrożonym samodzielnym JSON-em, bez live tabel', () => {
    const input = { ...base, ageYears: '7.000000000000000001' }, result = engine.evaluate(input, arup), saved = result.snapshot;
    expect(saved).toMatchObject({ schema: 'clcr-cacr', version: 2, sourceFormula: 'Ca_Cr', exactValue: { numerator: '20039', denominator: '100000' }, exactMass: { numerator: '20039', denominator: '100000' },
      conversionConstants: { calciumMgPerMmol: '40.078', creatinineMgPerMmol: '113.12' }, context: { sex: 'M', sampleType: 'timed', ageYearsRaw: '7.000000000000000001' }, reference: { band: { sex: 'M' } } });
    expect(JSON.parse(JSON.stringify(saved))).toEqual(saved); expect(Object.isFrozen(saved.reference.table[0].bySex.F)).toBe(true);
    expect(saved.reference.source).not.toBe(arup.source); input.sex = 'F'; expect(saved.context.sex).toBe('M');
  });
});

function documentWith(values = {}) {
  const controls = Object.fromEntries(Object.entries({ age: '40', ageMonths: '', sex: 'M', ...values }).map(([id, value]) => [id, { value }]));
  return { getElementById: id => controls[id] || null, controls };
}
describe('Ca/Cr DZM — odrębny, czysty adapter własnych pól', () => {
  it('definiuje siedem clinical controls i pięć metadanych bez dodatkowych pytań', () => {
    expect(engine.DZM_FIELD_IDS).toEqual(['CACR_DZM_inputMode', 'CACR_DZM_calcium', 'CACR_DZM_calciumUnit', 'CACR_DZM_creatinine', 'CACR_DZM_creatinineUnit', 'CACR_DZM_reportedValue', 'CACR_DZM_reportedUnit']);
    expect(engine.DZM_CONTEXT_FIELD_IDS).toEqual(['CACR_DZM_sameSpecimen', 'CACR_DZM_collectionProblem', 'CACR_DZM_collectionHours', 'CACR_DZM_durationKnown', 'CACR_DZM_currentPreterm']);
    expect(engine.DZM_DEFAULTS).toMatchObject({ CACR_DZM_inputMode: 'concentration', CACR_DZM_calciumUnit: 'mmol/L', CACR_DZM_creatinineUnit: 'mg/dL', CACR_DZM_collectionHours: '', CACR_DZM_durationKnown: '' });
  });
  it('nie czyta stężeń, wspólnej próbki ani czasu innego kalkulatora', () => {
    const values = { U_Ca: '8', Ucr: '100', Ca_spot: '5', Ucr_spot: '100', Cl24DurationHours: '12', spotSameSpecimen: false, collectionProblem: true };
    const before = JSON.stringify(values), input = engine.inputFromDzmValues(values, { ageYears: 40, sex: 'M', collectionHours: '48' });
    expect(input).toMatchObject({ mode: 'concentration', calciumValue: '', creatinineValue: '', sampleType: 'timed', sameSpecimen: 'assumed' });
    expect(input).not.toHaveProperty('collectionHours'); expect(input).not.toHaveProperty('collectionProblem'); expect(JSON.stringify(values)).toBe(before);
  });
  it('własne pola zachowują jednostki, jawnie pustą jednostkę i wszystkie znane fakty', () => {
    const values = { CACR_DZM_calcium: '5', CACR_DZM_creatinine: '100', CACR_DZM_calciumUnit: '', CACR_DZM_sameSpecimen: 'different', CACR_DZM_collectionProblem: 'true', CACR_DZM_collectionHours: '24,5', CACR_DZM_durationKnown: 'false' };
    const input = engine.inputFromDzmValues(values, { ageYears: 8, sex: 'F' });
    expect(input).toMatchObject({ calciumUnit: '', creatinineUnit: 'mg/dL', sameSpecimen: 'different', collectionProblem: true, collectionHours: '24,5', durationKnown: false, ageYears: 8, sex: 'F' });
  });
  it('gotowy wynik jest niezależny od starej sprzeczności dla pary stężeń', () => {
    const input = engine.inputFromDzmValues({ CACR_DZM_inputMode: 'direct', CACR_DZM_reportedValue: '140', CACR_DZM_reportedUnit: 'mg/g', CACR_DZM_sameSpecimen: 'different' }, { ageYears: 40, sex: 'F' });
    expect(engine.evaluate(input, arup)).toMatchObject({ valid: true, category: 'within', context: { sameSpecimen: 'not-applicable', concentrationSameSpecimen: 'different' } });
  });
  it.each(['different', 'confirmed'])('direct → snapshot → ponowne concentration zachowuje własny fakt %s', sameSpecimen => {
    const first = engine.evaluate(engine.inputFromDzmValues({ CACR_DZM_inputMode: 'direct', CACR_DZM_reportedValue: '140', CACR_DZM_reportedUnit: 'mg/g', CACR_DZM_sameSpecimen: sameSpecimen }, { ageYears: 40, sex: 'F' }), arup);
    const saved = JSON.parse(JSON.stringify(first.snapshot));
    expect(saved.context).toMatchObject({ sameSpecimen: 'not-applicable', concentrationSameSpecimen: sameSpecimen });
    const input = engine.inputFromDzmValues({ CACR_DZM_inputMode: 'concentration', CACR_DZM_calcium: '5', CACR_DZM_creatinine: '100', CACR_DZM_sameSpecimen: saved.context.concentrationSameSpecimen }, saved.context);
    expect(engine.evaluate(input, arup)).toMatchObject(sameSpecimen === 'different' ? { valid: false, reasonCode: 'different-specimens' } : { valid: true, rawValue: 0.20039, context: { sameSpecimen: 'confirmed' } });
    const doc = documentWith({ CaCr_entry_mode: 'direct', CaCr_reported: '140', CaCr_reported_unit: 'mg/g', CaCr_same_specimen: sameSpecimen });
    expect(engine.evaluate(engine.readInputFromDocument(doc), mayo).snapshot.context).toMatchObject({ sameSpecimen: 'not-applicable', concentrationSameSpecimen: sameSpecimen });
  });
  it('ukryty własny fakt bieżącego wcześniactwa nie znika i nie pochodzi z neonatalTermStatus', () => {
    const values = { CACR_DZM_calcium: '5', CACR_DZM_creatinine: '100', CACR_DZM_currentPreterm: 'true' };
    const input = engine.inputFromDzmValues(values, { ageYears: 0.5, sex: 'M' });
    expect(engine.evaluate(input, arup)).toMatchObject({ referenceAvailable: false, reasonCode: 'unsupported-population', context: { population: { currentPreterm: true } } });
    expect(engine.evaluate(engine.inputFromDzmValues({ ...values, CACR_DZM_currentPreterm: 'unknown' }, { ageYears: 0.5, population: { currentPreterm: true } }), arup).referenceAvailable).toBe(true);
    expect(engine.evaluate(engine.inputFromDzmValues({ ...values, CACR_DZM_currentPreterm: '' }, { ageYears: 0.5, neonatalTermStatus: 'preterm', newbornContext: true }), arup).referenceAvailable).toBe(true);
  });
  it('rzeczywisty DOM reader pobiera kontekst pacjenta bez mutowania dokumentu', () => {
    const doc = documentWith({ CACR_DZM_calcium: '5', CACR_DZM_creatinine: '100', Cl24DurationHours: '12' }), before = JSON.stringify(doc.controls);
    const input = engine.readDzmInputFromDocument(doc);
    expect(input).toMatchObject({ sampleType: 'timed', ageYears: 40, sex: 'M', calciumValue: '5', creatinineValue: '100' });
    expect(input).not.toHaveProperty('collectionHours'); expect(engine.evaluate(input, arup).category).toBe('within'); expect(JSON.stringify(doc.controls)).toBe(before);
  });
  it('DZM 0 ukończonych lat bez miesięcy wystarcza dla całego wspólnego ARUP [0,1)', () => {
    const doc = documentWith({ age: '0', ageMonths: '', ageDays: '', sex: '', CACR_DZM_calcium: '5', CACR_DZM_creatinine: '100', Ca_spot: '5', Ca_spot_unit: 'mmol/L', Ucr_spot: '100', Ucr_spot_unit: 'mg/dL' });
    const before = JSON.stringify(doc.controls), input = engine.readDzmInputFromDocument(doc), result = engine.evaluate(input, arup);
    expect(input).toMatchObject({ ageYears: 0, ageYearsRaw: '0', ageExact: null, agePrecision: 'completed-years', ageInterval: { minimumAgeYearsInclusive: 0, maximumAgeYearsExclusive: 1 } });
    expect(result).toMatchObject({ valid: true, rawValue: 0.20039, category: 'within', referenceAvailable: true, reference: { nativeLow: 0.03, nativeHigh: 0.81 }, context: { agePrecision: 'completed-years', ageExact: null } });
    const restored = engine.inputFromDzmValues({ CACR_DZM_calcium: '5', CACR_DZM_creatinine: '100' }, JSON.parse(JSON.stringify(result.snapshot.context)));
    expect(engine.evaluate(restored, arup)).toMatchObject({ referenceAvailable: true, context: { agePrecision: 'completed-years', ageInterval: { minimumAgeYearsInclusive: 0, maximumAgeYearsExclusive: 1 } } });
    expect(engine.evaluate(engine.readInputFromDocument(doc), mayo)).toMatchObject({ valid: true, rawValue: 0.20039, referenceAvailable: false, context: { ageYears: null } });
    expect(JSON.stringify(doc.controls)).toBe(before);
  });
  it.each([{ ageMonths: 'abc' }, { ageMonths: '-1' }, { ageMonths: '12' }, { ageDays: 'abc' }, { ageDays: '-1' }, { ageDays: '29' }])('jawnie błędna część wieku %j nie staje się przedziałem ukończonych lat', patch => {
    const input = engine.readDzmInputFromDocument(documentWith({ age: '0', ageMonths: '', ageDays: '', CACR_DZM_calcium: '5', CACR_DZM_creatinine: '100', ...patch }));
    expect(input).not.toHaveProperty('agePrecision'); expect(engine.evaluate(input, arup)).toMatchObject({ valid: true, referenceAvailable: false });
  });
  it('przedział ukończonego wieku nie wybiera normy zawierającej tylko jego fragment', () => {
    const input = { ...base, ageYears: 0, agePrecision: 'completed-years', ageInterval: { minimumAgeYearsInclusive: 0, maximumAgeYearsExclusive: 1 } };
    const partial = structuredClone(arup); partial.bands[0].maximumAgeMonths = 6;
    expect(engine.evaluate(input, partial)).toMatchObject({ valid: true, referenceAvailable: false });
  });
});
