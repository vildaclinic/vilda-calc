import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
for (const file of ['clcr_clinical_safety.js', 'clcr_pcr_reference_data.js', 'clcr_pcr.js']) loadBrowserScript(file, browser);
const data = browser.VildaClcrPcrReferenceData;
const engine = browser.VildaClcrPcr;
const profile = data.getProfile('KDIGO_PCR_2024_2025');
const example = { mode: 'concentration', proteinValue: 300, proteinUnit: 'mg/L', creatinineValue: 100, creatinineUnit: 'mg/dl', ageYears: 10 };
const calculate = (patch = {}, selected = profile) => engine.evaluate({ ...example, ...patch }, selected);
const reported = (reportedValue, reportedUnit = 'mg/g', patch = {}, selected = profile) => engine.evaluate({ mode: 'direct', reportedValue, reportedUnit, ageYears: 10, ...patch }, selected);

describe('PCR — jawny profil KDIGO i jego rzeczywiste pokrycie', () => {
  it('trzyma progi i granice wieku w niezależnych zamrożonych danych źródłowych', () => {
    expect(data.getProfile('unknown')).toBeNull();
    expect(data.listProfiles()).toEqual([profile]);
    expect(Object.isFrozen(profile.bands[0].normalUpperExclusive)).toBe(true);
    expect(profile.bands.map(row => [row.minimumAgeYearsInclusive, row.maximumAgeYearsExclusive, row.normalUpperExclusive])).toEqual([
      [0.5, 2, { 'mg/g': 500, 'mg/mmol': 50 }],
      [2, 18, { 'mg/g': 200, 'mg/mmol': 20 }],
      [18, null, { 'mg/g': 150, 'mg/mmol': 15 }],
    ]);
    expect(profile.pediatricNephrotic).toMatchObject({ minimumAgeYearsInclusive: 1, maximumAgeYearsExclusive: 18, lowerInclusive: { 'mg/g': 2000, 'mg/mmol': 200 } });
    expect(profile.sources.pediatric.section).toContain('S193');
    expect(profile.sources.adult.section).toContain('S250');
    expect(profile.sources.nephrotic.section).toContain('Figure 1');
    expect(profile.bands[1].agePolicy).toContain('by 2 years');
    expect(profile.restrictions).toMatchObject({ singleResultDiagnosesNephroticSyndrome: false, remissionAssessmentAvailable: false, adultNephroticClassificationAvailable: false, unknownFactorsAreConfirmedAbsent: false });
  });

  it('nie podstawia domyślnego źródła przy braku lub wadliwym profilu', () => {
    expect(engine.evaluate(example)).toMatchObject({ valid: true, reasonCode: 'missing-profile', reference: null, tone: 'neutral' });
    for (const broken of [
      { ...profile, quantity: 'albumin' },
      { ...profile, bands: [] },
      { ...profile, bands: [{ ...profile.bands[1], normalUpperExclusive: { 'mg/g': -1, 'mg/mmol': 20 } }] },
      { ...profile, pediatricNephrotic: { ...profile.pediatricNephrotic, maximumAgeYearsExclusive: Infinity } },
      { ...profile, pediatricNephrotic: { ...profile.pediatricNephrotic, lowerInclusive: { 'mg/g': 100, 'mg/mmol': 10 } } },
      { ...profile, notes: null },
    ]) expect(calculate({}, broken)).toMatchObject({ valid: true, reasonCode: 'invalid-profile', reference: null, category: null });
  });

  it('przyjmuje inną populację i progi bez mutacji ani fallbacku KDIGO', () => {
    const selected = structuredClone(profile);
    selected.id = 'SYNTHETIC_PCR_TEST_PROFILE';
    selected.population.label = 'Fikcyjna populacja testowa';
    selected.bands[1].populationLabel = 'Fikcyjne dzieci testowe';
    selected.bands[1].normalUpperExclusive = { 'mg/g': 350, 'mg/mmol': 35 };
    const original = structuredClone(selected);
    const result = calculate({}, selected);
    expect(result).toMatchObject({ category: 'normal', profileId: selected.id, population: { label: 'Fikcyjne dzieci testowe' }, reference: { limit: '<350' } });
    expect(selected).toEqual(original);
    expect(Object.isFrozen(selected)).toBe(false);
    expect(calculate().category).toBe('raised');
  });

  it('nie skleja luki ani nakładających się grup wieku w jedną normę', () => {
    expect(calculate({}, { ...profile, bands: profile.bands.filter(band => band.id !== profile.bands[1].id) })).toMatchObject({ valid: true, reasonCode: 'no-age-band', referenceAvailable: false });
    expect(calculate({}, { ...profile, bands: [...profile.bands, profile.bands[1]] })).toMatchObject({ valid: true, reasonCode: 'ambiguous-age-band', referenceAvailable: false });
  });
});

describe('PCR — rzeczywisty iloraz stężeń i dokładna arytmetyka jednostek', () => {
  it.each([
    ['mg/L', '300', 'mg/dl', '100'], ['mg/dL', '30', 'mg/dL', '100'], ['g/L', '0.3', 'mg/dl', '100'],
    ['mg/L', '300', 'umol', '8840'], ['mg/L', '300', 'µmol/L', '8840'], ['mg/L', '300', 'mmol/L', '8.84'],
  ])('%s %s białka i %s %s Cr dają 300 mg/g', (proteinUnit, proteinValue, creatinineUnit, creatinineValue) => {
    const result = calculate({ proteinUnit, proteinValue, creatinineUnit, creatinineValue });
    expect(result).toMatchObject({ valid: true, rawValue: 300, unit: 'mg/g', category: 'raised', tone: 'warning', status: 'above', context: { sameSpecimen: 'assumed', sampleType: '' } });
    expect(result.convertedValue).toBeCloseTo(33.93665158371041, 12);
    expect(result.input).toEqual({ proteinUnit, proteinValue, creatinineUnit, creatinineValue });
  });

  it.each([
    ['mg/L', '500', 'mg/dl', '100'], ['mg/dL', '50', 'mg/dl', '100'], ['g/L', '0.5', 'mg/dl', '100'],
    ['mg/L', '500', 'umol', '8840'], ['g/L', '0.5', 'mmol/L', '8.84'],
  ])('dokładne 500 w równoważnych jednostkach pozostaje umiarkowane u dorosłego', (proteinUnit, proteinValue, creatinineUnit, creatinineValue) => {
    expect(calculate({ proteinUnit, proteinValue, creatinineUnit, creatinineValue, ageYears: 40 })).toMatchObject({ rawValue: 500, category: 'raised', tone: 'warning', boundary: '' });
  });

  it('nie przesuwa rzeczywistego przekroczenia 500 arbitralnym epsilonem', () => {
    expect(calculate({ ageYears: 40, proteinValue: '500.0000000000001' })).toMatchObject({ category: 'marked', tone: 'danger', boundary: '>500' });
    expect(calculate({ ageYears: 40, proteinValue: '499.9999999999999' })).toMatchObject({ category: 'raised', tone: 'warning', boundary: '' });
  });

  it('zero białka jest wynikiem, a przecinek zachowuje oryginalny zapis', () => {
    expect(calculate({ proteinValue: 0 })).toMatchObject({ valid: true, rawValue: 0, category: 'normal', display: { value: '0.0' } });
    expect(calculate({ proteinValue: '0,3', proteinUnit: 'g/L', creatinineValue: '8,84', creatinineUnit: 'mmol/L' })).toMatchObject({ valid: true, rawValue: 300, input: { proteinValue: '0,3', creatinineValue: '8,84' } });
  });

  it.each([
    [{ proteinValue: '' }, 'missing-protein'], [{ proteinValue: null }, 'missing-protein'],
    ...[-1, NaN, Infinity, true, '<300', '300 mg/L'].map(proteinValue => [{ proteinValue }, 'invalid-protein']),
    [{ creatinineValue: '' }, 'missing-creatinine'],
    ...[0, -1, NaN, Infinity, true, '<100'].map(creatinineValue => [{ creatinineValue }, 'invalid-creatinine']),
    [{ proteinUnit: '' }, 'invalid-protein-unit'], [{ proteinUnit: 'unsupported' }, 'invalid-protein-unit'],
    [{ creatinineUnit: '' }, 'invalid-creatinine-unit'], [{ creatinineUnit: 'unsupported' }, 'invalid-creatinine-unit'],
    [{ mode: '' }, 'invalid-mode'], [{ mode: 'invalid' }, 'invalid-mode'],
    [{ sameSpecimen: 'different' }, 'different-specimens'],
    [{ proteinValue: Number.MAX_VALUE, proteinUnit: 'g/L' }, 'invalid-conversion'],
  ])('odrzuca %j i podaje rzeczywisty powód', (patch, reasonCode) => {
    const result = calculate(patch);
    expect(result).toMatchObject({ valid: false, reasonCode, rawValue: null, snapshot: null });
    expect(result.message).not.toBe('');
    expect(result.statusText).toBe(result.message);
  });

  it.each([[199.96, '<200', 'normal'], [1999.96, '<2000', 'raised'], [2000, '', 'nephrotic']])('chroni granicę %s → %s', (proteinValue, boundary, category) => {
    expect(calculate({ proteinValue })).toMatchObject({ rawValue: proteinValue, category, boundary, display: { value: proteinValue.toFixed(1), boundary } });
  });

  it('chroni granicę 500 przed ukończeniem 2 lat', () => {
    expect(calculate({ ageYears: 1.5, proteinValue: 499.96 })).toMatchObject({ rawValue: 499.96, category: 'normal', boundary: '<500', display: { value: '500.0' } });
  });
});

describe('PCR — źródłowe granice wieku i natywne osie', () => {
  it.each([
    [0.5, 499.99, 'normal', 500], [0.5, 500, 'raised', 500], [0.5, 3000, 'raised', 500],
    [1, 2000, 'nephrotic', 500], [1.999999, 499.99, 'normal', 500],
    [2, 199.99, 'normal', 200], [2, 200, 'raised', 200], [17.999999, 2000, 'nephrotic', 200],
    [18, 149.99, 'normal', 150], [18, 150, 'raised', 150], [70, 500, 'raised', 150], [70, 500.01, 'marked', 150],
  ])('wiek %s, PCR %s → %s i norma <%s', (ageYears, value, category, normalUpperExclusive) => {
    expect(reported(value, 'mg/g', { ageYears })).toMatchObject({ valid: true, category, referenceAvailable: true, reference: { normalUpperExclusive, limit: `<${normalUpperExclusive}` } });
  });

  it.each([
    [0.5, 50, 'raised', 50], [1, 200, 'nephrotic', 50], [2, 20, 'raised', 20], [10, 200, 'nephrotic', 20],
    [18, 15, 'raised', 15], [40, 50, 'raised', 15], [40, 50.0001, 'marked', 15],
  ])('wiek %s, natywne SI %s → %s, bez przeklasyfikowania przeliczenia', (ageYears, value, category, normalUpperExclusive) => {
    const result = reported(value, 'mg/mmol', { ageYears });
    expect(result).toMatchObject({ rawValue: value, unit: 'mg/mmol', classificationUnit: 'mg/mmol', category, reference: { normalUpperExclusive, unit: 'mg/mmol' } });
    expect(result.convertedValue).toBeCloseTo(value * 8.84, 10);
  });

  it.each(['mg/mg', 'g/g'])('zachowuje raport %s i stosuje dokładne skalowanie ×1000', unit => {
    expect(reported('0.19996', unit)).toMatchObject({ rawValue: 0.19996, unit, category: 'normal', classificationValue: 199.96, classificationUnit: 'mg/g', display: { value: '0.19996', text: '0.19996', rounded: false }, reference: { limit: '<0,2', unit, normalUpperExclusive: 0.2 } });
    expect(reported('0.2', unit)).toMatchObject({ category: 'raised', classificationValue: 200 });
    expect(reported('2', unit)).toMatchObject({ category: 'nephrotic', reference: { nephroticThreshold: 2 } });
    expect(reported('0.5', unit, { ageYears: 40 })).toMatchObject({ category: 'raised', classificationValue: 500 });
    expect(reported('0.5000000000000001', unit, { ageYears: 40 })).toMatchObject({ category: 'marked' });
  });

  it.each([0, 0.25, 0.499999, null, undefined, '', -1, NaN, Infinity, '10'])('dla wieku %s zachowuje liczbę bez zastępczej normy dorosłych', ageYears => {
    const result = reported('300', 'mg/g', { ageYears });
    expect(result).toMatchObject({ valid: true, rawValue: 300, referenceAvailable: false, reference: null, category: null, tone: 'neutral', status: 'unassessed' });
    expect(result.qualification.note).toMatch(/wiek|pediatryczne/);
  });

  it('nigdy nie nadaje kategorii albuminurii ani dorosłego zakresu nerczycowego', () => {
    for (const ageYears of [0.5, 18, 90]) {
      const result = reported('10000', 'mg/g', { ageYears });
      expect(result.category).not.toMatch(/^A[123]$/);
      expect(result.reference.nephroticThreshold).toBeNull();
      expect(result.reference.categories.map(row => row.code)).not.toContain('nephrotic');
    }
  });
});

describe('PCR — wyniki cenzurowane są przedziałami, nie punktami', () => {
  it.each([
    ['<200', 'normal', 'below', 'within', 'success'],
    ['≤199.96', 'normal', 'below', 'within', 'success'],
    ['<=199,96', 'normal', 'below', 'within', 'success'],
    ['≤200', null, 'ambiguous', 'unassessed', 'neutral'],
    ['<2000', null, 'ambiguous', 'unassessed', 'neutral'],
    ['≥200', null, 'above', 'above', 'warning'],
    ['>200', null, 'above', 'above', 'warning'],
    ['≥2000', 'nephrotic', 'above', 'above', 'danger'],
    ['>2000', 'nephrotic', 'above', 'above', 'danger'],
    ['≤0', 'normal', 'below', 'within', 'success'],
  ])('%s → %s, porównanie %s bez fałszywego dokładnego punktu', (value, category, comparison, status, tone) => {
    const result = reported(value);
    expect(result).toMatchObject({ valid: true, category, comparison, status, tone, exact: false, display: { rounded: false } });
    expect(result.comparator).not.toBe('');
    expect(result.snapshot.input.reportedValue).toBe(value);
    expect(result.display.text).toBe(result.comparator + value.replace(/^([<>]=?|[≤≥])\s*/, '').replace(',', '.'));
  });

  it.each([
    ['<15', 'normal', 'below'], ['<50', null, 'ambiguous'], ['≤50', null, 'ambiguous'], ['>50', 'marked', 'above'], ['≥50', null, 'above'],
  ])('dorosły SI %s zachowuje inkluzywność 50', (text, category, comparison) => {
    expect(reported(text, 'mg/mmol', { ageYears: 40 })).toMatchObject({ category, comparison });
  });

  it('nie zaokrągla granicy oznaczalności ani precyzji dokładnego raportu', () => {
    expect(reported('<0.001')).toMatchObject({ display: { text: '<0.001', value: '0.001' } });
    expect(reported('199.9600')).toMatchObject({ display: { text: '199.9600', rounded: false } });
  });

  it.each(['', null, '<0', '-1', '1–3', '300 mg/g', 'Infinity', '1e999999999', '1e-999999999', '0'.repeat(257), true, NaN, Infinity])('odrzuca %s zamiast parsować samą liczbę', value => {
    expect(reported(value)).toMatchObject({ valid: false, snapshot: null });
  });

  it.each(['', null, 'unsupported'])('jawnie nieprawidłowa jednostka %s nie staje się mg/g', unit => {
    expect(reported('20', unit)).toMatchObject({ valid: false, reasonCode: 'invalid-reported-unit' });
  });
});

describe('PCR — znane fakty próbki, snapshot i rzeczywisty odczyt dokumentu', () => {
  it.each(['', 'random', 'firstMorning', 'secondMorning', 'timed'])('pora %s nie blokuje dostępnego porównania ani nie staje się poranną', sampleType => {
    expect(calculate({ sampleType })).toMatchObject({ valid: true, category: 'raised', status: 'above', tone: 'warning', context: { sampleType }, qualification: { requiresConfirmation: true } });
  });

  it.each(['menstruation', 'hematuria', 'infection', 'exercise', 'acuteIllness'])('czynnik %s nie wygasza pewnego wysokiego PCR, ale nie daje zielonego poniżej progu', factor => {
    const raised = calculate({ confounders: [factor] });
    expect(raised).toMatchObject({ category: 'raised', status: 'above', comparison: 'above', tone: 'warning', reasonCode: 'confounded-sample', context: { confounders: [factor] } });
    expect(calculate({ proteinValue: 2500, confounders: [factor] })).toMatchObject({ category: 'nephrotic', status: 'above', tone: 'danger' });
    const below = calculate({ proteinValue: 100, confounders: [factor] });
    expect(below).toMatchObject({ category: 'normal', categoryDescription: 'Poniżej progu dla wieku', comparison: 'below', status: 'unassessed', tone: 'neutral', reasonCode: 'confounded-sample' });
    expect(below.statusText).toContain('Poniżej progu; możliwy wpływ');
    expect(below.reference.categories[0]).toMatchObject({ code: 'normal', tone: 'neutral', label: 'Poniżej progu dla wieku' });
    expect(below.qualification.requiresConfirmation).toBe(true);
  });

  it('gotowy wynik nie tworzy nieistniejących stężeń ani potwierdzenia próbki', () => {
    const result = reported('300', 'mg/g', { sameSpecimen: 'different', proteinValue: 99, creatinineValue: 88 });
    expect(result).toMatchObject({ valid: true, context: { sameSpecimen: 'not-applicable' }, input: { reportedValue: '300', reportedUnit: 'mg/g' } });
    expect(result.input).not.toHaveProperty('proteinValue');
    expect(result.input).not.toHaveProperty('creatinineValue');
  });

  it('zachowuje self-contained snapshot przez JSON bez BigInt i bez modyfikacji wejścia', () => {
    const input = { ...example, confounders: ['infection'], sameSpecimen: 'confirmed' };
    const result = engine.evaluate(input, profile);
    input.confounders.push('exercise');
    expect(result.context.confounders).toEqual(['infection']);
    expect(result.snapshot).toMatchObject({ schema: 'clcr-pcr', version: 1, rawValue: 300, category: 'raised', context: { ageYears: 10 }, reference: { axis: 'mg/g', normalUpperExclusive: 200, nephroticThreshold: 2000, band: { id: 'age-24-months-to-under-18-years' } }, profileId: profile.id, profileVersion: 1, source: { label: 'KDIGO 2024' } });
    expect(JSON.parse(JSON.stringify(result.snapshot))).toEqual(result.snapshot);
    expect(result.snapshot).not.toHaveProperty('snapshot');
    expect(Object.isFrozen(result.snapshot.reference.categories[0])).toBe(true);
    expect(Object.isFrozen(input)).toBe(false);
  });

  function documentWith(values = {}) {
    const controls = Object.fromEntries(Object.entries({ PCR_entry_mode: 'concentration', PCR_reported: '', PCR_reported_unit: 'mg/g', PCR_same_specimen: '',
      U_Prot_spot: '300', U_Prot_spot_unit: 'mg/L', Ucr_spot: '100', Ucr_spot_unit: 'mg/dl', age: '10', ageMonths: '', ageDays: '', ...values }).map(([id, value]) => [id, typeof value === 'boolean' ? { checked: value, type: 'checkbox' } : { value }]));
    return { controls, getElementById: id => controls[id] || null };
  }

  it.each([
    [{}, 'assumed'], [{ spotSameSpecimen: false }, 'assumed'], [{ spotSameSpecimen: true }, 'confirmed'],
    [{ ui_spotSameSpecimen_answer: 'yes' }, 'confirmed'], [{ ui_spotSameSpecimen_answer: 'no' }, 'different'],
    [{ ui_spotSameSpecimen_answer: 'unknown', spotSameSpecimen: true }, 'assumed'],
    [{ PCR_same_specimen: 'different', spotSameSpecimen: true }, 'different'],
    [{ PCR_same_specimen: 'confirmed', ui_spotSameSpecimen_answer: 'no' }, 'confirmed'],
  ])('czyta jawne i nieznane informacje próbki %j → %s', (patch, sameSpecimen) => {
    const doc = documentWith(patch);
    const original = JSON.stringify(doc.controls);
    const input = engine.readInputFromDocument(doc);
    expect(input).toMatchObject({ sameSpecimen, ageYears: 10 });
    expect(JSON.stringify(doc.controls)).toBe(original);
  });

  it('odczyt dokumentu zachowuje czynniki, operator i jawnie puste jednostki bez fallbacku', () => {
    const doc = documentWith({ PCR_entry_mode: 'direct', PCR_reported: '≥200', PCR_reported_unit: '', U_Prot_spot_unit: '', Ucr_spot_unit: '', spotInfection: true });
    const input = engine.readInputFromDocument(doc);
    expect(input).toMatchObject({ mode: 'direct', reportedValue: '≥200', reportedUnit: '', proteinUnit: '', creatinineUnit: '', confounders: ['infection'] });
    expect(engine.evaluate(input, profile)).toMatchObject({ valid: false, reasonCode: 'invalid-reported-unit' });
    expect(engine.readInputFromDocument(doc, { concentrationOnly: true }).mode).toBe('concentration');
  });

  it('brak kontrolki jednostki wspiera wyłącznie historyczne domyślne jednostki', () => {
    const doc = documentWith();
    for (const id of ['PCR_entry_mode', 'PCR_reported_unit', 'U_Prot_spot_unit', 'Ucr_spot_unit']) delete doc.controls[id];
    expect(engine.readInputFromDocument(doc)).toMatchObject({ mode: 'concentration', reportedUnit: 'mg/g', proteinUnit: 'mg/L', creatinineUnit: 'mg/dl' });
  });

  it('rzeczywisty walidator UI zachowuje stary limit białka w mg/L po zmianie jednostki', () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    const source = fs.readFileSync(path.join(root, 'inline_kalkulator_klirens_04.js'), 'utf8');
    const start = source.indexOf('function validateField(');
    const end = source.indexOf('function validateClcrAgeContext(', start);
    const message = { textContent: '' };
    const controls = { U_Prot_spot_unit: { value: 'g/L' } };
    const validate = new Function('$', 'document', 'maxValues', source.slice(start, end) + '\nreturn validateField;')(
      id => controls[id], { getElementById: id => controls[id] }, { U_Prot_spot: 50000 });
    const field = value => ({ id: 'U_Prot_spot', value, parentNode: { querySelector: () => message }, classList: { add() {}, remove() {} } });
    expect(validate(field('50'))).toBe(true);
    expect(validate(field('50.001'))).toBe(false);
    controls.U_Prot_spot_unit.value = 'mg/dL';
    expect(validate(field('5000'))).toBe(true);
    expect(validate(field('5000.1'))).toBe(false);
  });
});
