import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
for (const file of ['clcr_clinical_safety.js', 'clcr_cacr_reference_data.js', 'clcr_cacr.js']) loadBrowserScript(file, browser);
const data = browser.VildaClcrCacrReferenceData;
const engine = browser.VildaClcrCacr;
const profile = data.getProfile('MAYO_CACR3_RANDOM_2026_10');
const example = { mode: 'concentration', calciumValue: '30', calciumUnit: 'mg/dL', creatinineValue: '100', creatinineUnit: 'mg/dL', ageYears: 5 };
const calculate = (patch = {}, selected = profile) => engine.evaluate({ ...example, ...patch }, selected);
const reported = (reportedValue, reportedUnit = 'mg/mg', patch = {}, selected = profile) => engine.evaluate({ mode: 'direct', reportedValue, reportedUnit, ageYears: 5, ...patch }, selected);

describe('Ca/Cr — osobny profil Mayo, jedna zamknięta oś masowa', () => {
  it('przechowuje pełne pokrycie, metody i ograniczenia w zamrożonych danych', () => {
    expect(data.getProfile('unknown')).toBeNull();
    expect(data.listProfiles()).toEqual([profile]);
    expect(Object.isFrozen(profile.source.methods)).toBe(true);
    expect(profile.bands.map(row => [row.minimumAgeMonthsInclusive, row.maximumAgeMonths, row.maximumAgeInclusive, row.lower, row.upper])).toEqual([
      [1, 12, false, 0.03, 0.81], [12, 24, false, 0.03, 0.56], [24, 36, false, 0.02, 0.50],
      [36, 60, false, 0.02, 0.41], [60, 84, false, 0.01, 0.30], [84, 120, false, 0.01, 0.25],
      [120, 216, false, 0.01, 0.24], [216, 996, true, 0.05, 0.27],
    ]);
    expect(profile.source).toMatchObject({ id: 'MAYO_CACR3', accessedAt: '2026-10-23', fullDocumentRead: true, manufacturerInsertsIndependentlyRead: false });
    expect(profile.source.methods.creatinine).toContain('enzymatyczna');
    expect(profile.restrictions).toMatchObject({ comparisonMode: 'orientational', firstMorningRequired: false, patientLaboratoryMatched: false, singleResultDiagnosesHypercalciuria: false });
  });

  it('bez profilu pozostawia poprawną liczbę, bez domyślnego odniesienia', () => {
    expect(engine.evaluate(example)).toMatchObject({ valid: true, rawValue: 0.3, reasonCode: 'missing-profile', referenceAvailable: false, tone: 'neutral' });
    for (const broken of [{ ...profile, quantity: 'albumin' }, { ...profile, bands: [] }, { ...profile, notes: null },
      { ...profile, bands: [{ ...profile.bands[4], lower: 0.5, upper: 0.3 }] }, { ...profile, conversionConstants: { calciumMgPerMmol: '-40', creatinineMgPerMmol: '113.12' } },
    ]) expect(calculate({}, broken)).toMatchObject({ valid: true, rawValue: 0.3, reasonCode: 'invalid-profile', reference: null, category: null });
  });

  it('przyjmuje inną populację bez mutowania danych i bez fallbacku Mayo', () => {
    const other = structuredClone(profile);
    other.id = 'SYNTHETIC_CACR_TEST'; other.population.label = 'Fikcyjna populacja'; other.bands[4].upper = 0.2;
    const before = structuredClone(other);
    expect(calculate({}, other)).toMatchObject({ category: 'above', profileId: other.id, population: { label: 'Fikcyjna populacja' }, reference: { nativeHigh: 0.2 } });
    expect(other).toEqual(before);
    expect(Object.isFrozen(other)).toBe(false);
    expect(calculate().category).toBe('within');
    expect(calculate({}, { ...profile, bands: profile.bands.filter(row => row.id !== profile.bands[4].id) })).toMatchObject({ reasonCode: 'no-age-band', reference: null });
    expect(calculate({}, { ...profile, bands: [...profile.bands, profile.bands[4]] })).toMatchObject({ reasonCode: 'ambiguous-age-band', reference: null });
  });
});

describe('Ca/Cr — rzeczywiste przeliczenia stężeń', () => {
  it.each([
    ['mg/dL', '40', 'mg/dL', '100'], ['mg/dl', '40', 'mg/dl', '100'], ['mg/L', '400', 'mg/L', '1000'],
    ['mmol/L', '10', 'mmol/L', '10'], ['mmol/L', '10', 'µmol/L', '10000'], ['mmol/L', '10', 'umol', '10000'],
  ])('spójne jednostki: Ca %s %s / Cr %s %s', (calciumUnit, calciumValue, creatinineUnit, creatinineValue) => {
    const result = calculate({ calciumUnit, calciumValue, creatinineUnit, creatinineValue });
    expect(result).toMatchObject({ valid: true, unit: 'mg/mg', status: 'above', tone: 'warning', classificationUnit: 'mg/mg', context: { sameSpecimen: 'assumed' } });
    expect(result.rawValue).toBeCloseTo(calciumUnit === 'mmol/L' ? 40.078 / 113.12 : 0.4, 14);
    expect(result.input).toEqual({ calciumUnit, calciumValue, creatinineUnit, creatinineValue });
  });

  it('nie miesza wcześniejszego współczynnika Cr113,1179 ani88,4 z nową osią', () => {
    const result = calculate({ ageYears: 8, calciumValue: '0.6', calciumUnit: 'mmol/L', creatinineValue: '1000', creatinineUnit: 'umol' });
    expect(result).toMatchObject({ rawValue: 0.21257779349363506, category: 'within', reference: { nativeHigh: 0.25 } });
  });

  it.each([
    ['mg/dL', '30', 'mg/dL', '100'], ['mg/L', '300', 'mg/L', '1000'], ['mg/L', '339.36', 'mmol/L', '10'],
    ['mg/L', '339.36', 'µmol/L', '10000'], ['mg/L', '339.36', 'umol/L', '10000'],
  ])('dokładne0,30 nie przekracza zamkniętej normy: %s/%s', (calciumUnit, calciumValue, creatinineUnit, creatinineValue) => {
    expect(calculate({ calciumUnit, calciumValue, creatinineUnit, creatinineValue })).toMatchObject({ rawValue: 0.3, category: 'within', boundary: '' });
  });

  it('nie cofa rzeczywistego przekroczenia arbitralnym epsilonem', () => {
    expect(calculate({ calciumValue: '30.00000000000001' })).toMatchObject({ category: 'above', boundary: '>0,3' });
    expect(calculate({ calciumValue: '29.99999999999999' })).toMatchObject({ category: 'within' });
    expect(calculate({ calciumValue: '0.9999999999999999' })).toMatchObject({ category: 'below', boundary: '<0,01' });
  });

  it('dopuszcza zero wapnia, odróżnia brak i chroni granicę przed zaokrągleniem', () => {
    expect(calculate({ calciumValue: '0' })).toMatchObject({ valid: true, rawValue: 0, category: 'below', display: { value: '0.000' } });
    expect(calculate({ calciumValue: '0,999' })).toMatchObject({ rawValue: 0.00999, category: 'below', boundary: '<0,01', display: { value: '0.010' } });
    expect(calculate({ calciumValue: '30.001' })).toMatchObject({ rawValue: 0.30001, category: 'above', boundary: '>0,3', display: { value: '0.300' } });
  });

  it.each([
    [{ calciumValue: '' }, 'missing-calcium'], [{ calciumValue: null }, 'missing-calcium'],
    ...[-1, NaN, Infinity, true, '<30', '30 mg/dL'].map(calciumValue => [{ calciumValue }, 'invalid-calcium']),
    [{ creatinineValue: '' }, 'missing-creatinine'], ...[0, -1, NaN, Infinity, true, '<100'].map(creatinineValue => [{ creatinineValue }, 'invalid-creatinine']),
    [{ calciumUnit: '' }, 'invalid-calcium-unit'], [{ calciumUnit: 'g/L' }, 'invalid-calcium-unit'], [{ creatinineUnit: '' }, 'invalid-creatinine-unit'],
    [{ mode: 'bad' }, 'invalid-mode'], [{ sameSpecimen: 'different' }, 'different-specimens'],
    [{ calciumValue: Number.MAX_VALUE, creatinineValue: '0.0001' }, 'invalid-conversion'],
  ])('odrzuca błędne dane %j z właściwym powodem', (patch, reasonCode) => {
    const result = calculate(patch);
    expect(result).toMatchObject({ valid: false, reasonCode, rawValue: null, snapshot: null });
    expect(result.message).not.toBe(''); expect(result.statusText).toBe(result.message);
  });
});

describe('Ca/Cr — źródłowe granice wieku i oba końce zakresu', () => {
  it.each([
    [1 / 12, '0.81', 'within', 0.03, 0.81], [1, '0.56', 'within', 0.03, 0.56], [2, '0.50', 'within', 0.02, 0.50],
    [3, '0.41', 'within', 0.02, 0.41], [5, '0.30', 'within', 0.01, 0.30], [7, '0.27', 'above', 0.01, 0.25],
    [10, '0.24', 'within', 0.01, 0.24], [18, '0.27', 'within', 0.05, 0.27], [83, '0.27', 'within', 0.05, 0.27],
    [5, '0.01', 'within', 0.01, 0.30], [5, '0.00999', 'below', 0.01, 0.30], [5, '0.30001', 'above', 0.01, 0.30],
  ])('wiek%s/wynik%s →%s', (ageYears, value, category, lower, upper) => {
    expect(reported(value, 'mg/mg', { ageYears })).toMatchObject({ valid: true, category, status: category, referenceAvailable: true, reference: { nativeLow: lower, nativeHigh: upper, lowerInclusive: true, upperInclusive: true } });
  });

  it.each([0, 0.08, 83.00000001, 83 + 1 / 12, null, undefined, '', -1, NaN, Infinity, '5'])('dla wieku%s zachowuje liczbę bez zastępczej normy', ageYears => {
    expect(reported('0.2', 'mg/mg', { ageYears })).toMatchObject({ valid: true, rawValue: 0.2, category: null, status: 'unassessed', tone: 'neutral', referenceAvailable: false, reference: null });
  });

  it.each([
    ['mg/mg', '0.30000', '0.01–0.30'], ['g/g', '0.30000', '0.01–0.30'], ['mg/g', '300.00', '10–300'], ['mg/mmol', '33.936', '≈1.131–33.936'],
  ])('zachowuje precyzję i jednostkę%s oraz nativeboundary', (unit, value, range) => {
    const result = reported(value, unit);
    expect(result).toMatchObject({ category: 'within', classificationValue: 0.3, unit, display: { value, text: value, rounded: false }, reference: { range: range.replaceAll('.', ','), unit, nativeHigh: 0.3 } });
  });

  it.each(['mol/mol', 'mmol/mmol', 'mmol/mol'])('przelicza raport%s i normę z tej samej osi mg/mg', unit => {
    const value = unit === 'mmol/mol' ? '600' : '0.6';
    const result = reported(value, unit, { ageYears: 8 });
    expect(result).toMatchObject({ category: 'within', rawValue: Number(value), unit, reference: { converted: true, nativeHigh: 0.25, display: { approximate: true } } });
    expect(result.classificationValue).toBeCloseTo(0.21257779349363506, 14);
  });
});

describe('Ca/Cr — nierówności, fakty i snapshot', () => {
  it.each([
    ['<0.01', 'below'], ['≤0.009', 'below'], ['≤0.01', null], ['<0.3', null], ['>0.3', 'above'], ['≥0.3', null],
    ['≥0.3000000000001', 'above'], ['>0', null], ['≤0', 'below'], ['<10', 'below', 'mg/g'], ['>33.936', 'above', 'mg/mmol'],
  ])('ocenia cały przedział%s →%s', (value, category, unit = 'mg/mg') => {
    const result = reported(value, unit);
    expect(result).toMatchObject({ category, exact: false, status: category || 'unassessed', comparison: category || 'ambiguous', tone: category ? 'warning' : 'neutral' });
    expect(result.display.text).toBe(value.replace(',', '.'));
  });

  it.each(['', '<0', '-1', 'NaN', 'Infinity', '0.3 mg/mg', true])('nie zapisuje niepoprawnego raportu%j', value => expect(reported(value).valid).toBe(false));

  it('nie zastępuje znaków ASCII lub przecinka, zachowuje oryginalny zapis w wejściu', () => {
    expect(reported('<=0,01')).toMatchObject({ comparator: '≤', category: null, input: { reportedValue: '<=0,01' }, display: { value: '0.01', text: '≤0.01' } });
  });

  it('znane informacje są adnotacją, bez tworzenia niepotwierdzonych gates', () => {
    for (const sampleType of ['', 'firstMorning', 'secondMorning', 'random']) {
      expect(calculate({ sampleType, confounders: ['infection'], knownFacts: { infection: true, hematuria: false } })).toMatchObject({ category: 'within', tone: 'success', context: { sampleType, confounders: ['infection'], knownFacts: { infection: true, hematuria: false } } });
    }
    expect(reported('0.4', 'mg/mg', { sameSpecimen: 'different' })).toMatchObject({ valid: true, category: 'above', context: { sameSpecimen: 'not-applicable' } });
  });

  it('nie zgaduje wcześniactwa, ale respektuje jawny bieżący kontekst populacji z API', () => {
    expect(calculate({ ageYears: 1 / 12, neonatalTermStatus: 'preterm', knownFacts: { remotePretermHistory: true } })).toMatchObject({ referenceAvailable: true });
    expect(calculate({ ageYears: 1 / 12, population: { currentPreterm: true } })).toMatchObject({ valid: true, rawValue: 0.3, referenceAvailable: false, reasonCode: 'unsupported-population', tone: 'neutral', context: { population: { currentPreterm: true } } });
  });

  it('snapshot utrwala surową wartość, normę, źródło i wiek jako zwykły JSON', () => {
    const input = { ...example, calciumValue: '30.001', confounders: ['infection'], knownFacts: { hematuria: false } };
    const result = engine.evaluate(input, profile);
    input.confounders.push('exercise'); input.knownFacts.hematuria = true;
    expect(result.snapshot).toMatchObject({ schema: 'clcr-cacr', version: 1, rawValue: 0.30001, boundary: '>0,3', category: 'above', context: { ageYears: 5, confounders: ['infection'], knownFacts: { hematuria: false } }, reference: { nativeLow: 0.01, nativeHigh: 0.3, band: { label: '5–<7 lat' } }, profileId: profile.id, profileVersion: 1, source: { id: 'MAYO_CACR3' } });
    expect(JSON.parse(JSON.stringify(result.snapshot))).toEqual(result.snapshot);
    expect(result.snapshot).not.toHaveProperty('snapshot'); expect(Object.isFrozen(result.snapshot.reference.table)).toBe(true); expect(Object.isFrozen(input)).toBe(false);
  });
});

function documentWith(values = {}) {
  const controls = Object.fromEntries(Object.entries({ CaCr_entry_mode: 'concentration', CaCr_reported: '', CaCr_reported_unit: 'mg/mg', CaCr_same_specimen: '', Ca_spot: '30', Ca_spot_unit: 'mg/dl', Ucr_spot: '100', Ucr_spot_unit: 'mg/dl', age: '5', ageMonths: '', ageDays: '', ...values }).map(([id, value]) => [id, typeof value === 'boolean' ? { checked: value, type: 'checkbox' } : { value }]));
  return { controls, getElementById: id => controls[id] || null };
}

describe('Ca/Cr — rzeczywisty adapter formularza i jednostkowa walidacja', () => {
  it.each([
    [{}, 'assumed'], [{ spotSameSpecimen: false }, 'assumed'], [{ spotSameSpecimen: true }, 'confirmed'],
    [{ ui_spotSameSpecimen_answer: 'no' }, 'different'], [{ ui_spotSameSpecimen_answer: 'unknown', spotSameSpecimen: true }, 'assumed'],
    [{ CaCr_same_specimen: 'different', spotSameSpecimen: true }, 'different'], [{ CaCr_same_specimen: 'confirmed', ui_spotSameSpecimen_answer: 'no' }, 'confirmed'],
  ])('czyta istniejący kontekst próbki%j', (patch, sameSpecimen) => {
    const doc = documentWith(patch), before = JSON.stringify(doc.controls);
    expect(engine.readInputFromDocument(doc)).toMatchObject({ ageYears: 5, sameSpecimen });
    expect(JSON.stringify(doc.controls)).toBe(before);
  });

  it('nie wstawia jednostki przy jawnie pustej kontrolce i nie tworzy negatywnych faktów', () => {
    const doc = documentWith({ CaCr_entry_mode: 'direct', CaCr_reported: '>0.3', CaCr_reported_unit: '', Ca_spot_unit: '', spotInfection: true, spotHematuria: false });
    const input = engine.readInputFromDocument(doc);
    expect(input).toMatchObject({ mode: 'direct', reportedValue: '>0.3', reportedUnit: '', calciumUnit: '', confounders: ['infection'], knownFacts: { infection: true } });
    expect(input.knownFacts).not.toHaveProperty('hematuria');
    expect(engine.evaluate(input, profile)).toMatchObject({ valid: false, reasonCode: 'invalid-reported-unit' });
    expect(engine.readInputFromDocument(doc, { concentrationOnly: true }).mode).toBe('concentration');
  });

  it('istniejące odpowiedzi no/unknown mają pierwszeństwo nad dawnym zaznaczeniem', () => {
    const doc = documentWith({ spotInfection: true, ui_spotInfection_answer: 'no', spotHematuria: true, ui_spotHematuria_answer: 'unknown', spotDiureticUse: true, spotKnownCKD: true });
    expect(engine.readInputFromDocument(doc)).toMatchObject({ confounders: [], knownFacts: { infection: false, hematuria: null, diureticUse: true, knownCKD: true } });
  });

  it('tylko nieobecne kontrolki zachowują historyczne domyślne jednostki', () => {
    const doc = documentWith();
    for (const id of ['CaCr_entry_mode', 'CaCr_reported_unit', 'Ca_spot_unit', 'Ucr_spot_unit']) delete doc.controls[id];
    expect(engine.readInputFromDocument(doc)).toMatchObject({ mode: 'concentration', reportedUnit: 'mg/mg', calciumUnit: 'mg/dl', creatinineUnit: 'mg/dl' });
  });

  it.each([
    [{ Ca_spot: '0' }, true], [{ Ca_spot: '40' }, true], [{ Ucr_spot: '0' }, false], [{ Ca_spot_unit: '' }, false],
    [{ CaCr_same_specimen: 'different' }, false],
    [{ CaCr_entry_mode: 'direct', CaCr_reported: '>0.3', Ca_spot: '', Ucr_spot: '', CaCr_same_specimen: 'different' }, true],
  ])('rzeczywiste canComputeFormula używa własnej ścieżki Ca/Cr%j', (patch, expected) => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    const source = fs.readFileSync(path.join(root, 'inline_kalkulator_klirens_04.js'), 'utf8');
    const adapterStart = source.indexOf('function evaluateClcrCacr('), adapterEnd = source.indexOf('function clcrCgNormalizedDetails(', adapterStart);
    const doc = documentWith(patch);
    const evaluate = new Function('window', 'document', source.slice(adapterStart, adapterEnd) + '\nreturn evaluateClcrCacr;')(browser, doc);
    const start = source.indexOf('function canComputeFormula('), end = source.indexOf('function readClcrFormulaAge(', start);
    const canCompute = new Function('FORMULAS', 'evaluateClcrCacr', source.slice(start, end) + '\nreturn canComputeFormula;')([{ id: 'CaCr_spot' }], evaluate);
    expect(canCompute('CaCr_spot')).toBe(expected);
  });

  it('rzeczywisty walidator nie blokuje Ca40mg/dL, zachowuje stare limity poza Ca/Cr', () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    const source = fs.readFileSync(path.join(root, 'inline_kalkulator_klirens_04.js'), 'utf8');
    const start = source.indexOf('function validateField('), end = source.indexOf('function validateClcrAgeContext(', start);
    const controls = { formulaPicker: { value: 'CaCr_spot' } }, message = { textContent: '' };
    const validate = new Function('$', 'document', 'maxValues', source.slice(start, end) + '\nreturn validateField;')(id => controls[id], { getElementById: id => controls[id] }, { Ca_spot: 30, Ucr_spot: 50000 });
    const field = (id, value) => ({ id, value, parentNode: { querySelector: () => message }, classList: { add() {}, remove() {} } });
    expect(validate(field('Ca_spot', '40'))).toBe(true); expect(validate(field('Ca_spot', '0'))).toBe(true); expect(validate(field('Ca_spot', '-1'))).toBe(false);
    expect(validate(field('Ucr_spot', '60000'))).toBe(true);
    controls.formulaPicker.value = 'OxCr_spot';
    expect(validate(field('Ca_spot', '40'))).toBe(false); expect(validate(field('Ucr_spot', '60000'))).toBe(true);
    controls.formulaPicker.value = 'CitCr_spot';
    expect(validate(field('Ca_spot', '40'))).toBe(false); expect(validate(field('Ucr_spot', '60000'))).toBe(false);
  });
});
