import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
for (const file of ['clcr_acr_reference_data.js', 'clcr_acr.js']) loadBrowserScript(file, browser);
const data = browser.VildaClcrAcrReferenceData;
const engine = browser.VildaClcrAcr;
const profile = data.getProfile('KDIGO_ACR_2024');
const concentration = {
  mode: 'concentration', ageYears: 8,
  albuminValue: 45, albuminUnit: 'mg/L',
  creatinineValue: 100, creatinineUnit: 'mg/dL',
};
const calculate = (patch = {}, selected = profile) => engine.evaluate({ ...concentration, ...patch }, selected);
const reported = (value, unit = 'mg/g', patch = {}, selected = profile) => engine.evaluate({
  mode: 'direct', ageYears: 8, reportedValue: value, reportedUnit: unit, ...patch,
}, selected);

describe('ACR — jawne dane norm, populacji i ograniczeń', () => {
  it('zwraca zamrożony profil z dokładnymi progami KDIGO i jawną polityką wieku', () => {
    expect(data.getProfile('nieznany')).toBeNull();
    expect(data.listProfiles()).toEqual([profile]);
    expect(Object.isFrozen(profile.axes['mg/g'])).toBe(true);
    expect(profile.axes).toEqual({
      'mg/g': { lowerThreshold: 30, upperThreshold: 300 },
      'mg/mmol': { lowerThreshold: 3, upperThreshold: 30 },
    });
    expect(profile.source).toMatchObject({ version: '2024', accessedAt: '2026-10-23' });
    expect(profile.source.section).toContain('S137');
    expect(profile.population).toMatchObject({ minimumAgeYearsInclusive: 2, infantReferenceAvailable: false, sexSpecific: false });
    expect(profile.population.agePolicy).toContain('over 2 years');
    expect(profile.restrictions).toMatchObject({ randomSampleAllowed: true, singleResultDiagnosesCkd: false, convertedValueReclassified: false });
  });

  it('nie dobiera normy domyślnie, nawet gdy rejestr jest załadowany', () => {
    const result = engine.evaluate(concentration);
    expect(result).toMatchObject({ valid: true, rawValue: 45, reasonCode: 'missing-profile', category: null, reference: null, source: null, tone: 'neutral' });
  });

  it.each([
    { ...profile, quantity: 'protein' },
    { ...profile, axes: { ...profile.axes, 'mg/g': { lowerThreshold: 30, upperThreshold: 20 } } },
    { ...profile, population: { label: 'test', minimumAgeYearsInclusive: -1 } },
    { ...profile, notes: null },
  ])('nie używa uszkodzonego profilu jako normy', selected => {
    expect(calculate({}, selected)).toMatchObject({ valid: true, reasonCode: 'invalid-profile', category: null, tone: 'neutral' });
  });

  it('przyjmuje inną populację jako argument bez mutowania danych i bez powrotu do KDIGO', () => {
    const selected = structuredClone(profile);
    selected.id = 'SYNTHETIC_ACR_TEST_PROFILE';
    selected.population.label = 'Fikcyjna populacja testowa';
    selected.axes['mg/g'] = { lowerThreshold: 50, upperThreshold: 500 };
    const before = structuredClone(selected);
    const result = calculate({}, selected);
    expect(result).toMatchObject({ category: 'A1', profileId: selected.id, population: { label: selected.population.label }, reference: { limit: '<50' } });
    expect(selected).toEqual(before);
    expect(Object.isFrozen(selected)).toBe(false);
    expect(calculate().category).toBe('A2');
  });
});

describe('ACR — rzeczywiste obliczenie stężeń i źródłowe jednostki', () => {
  it.each([
    ['mg/L', 45, 'mg/dL', 100],
    ['mg/dL', 4.5, 'mg/dL', 100],
    ['mg/L', 45, 'µmol/L', 8840],
    ['mg/L', 45, 'mmol/L', 8.84],
    ['mg/L', 45, 'mg/dl', 100],
    ['mg/L', 45, 'umol', 8840],
  ])('albumina %s %s i Cr %s %s dają 45 mg/g', (albuminUnit, albuminValue, creatinineUnit, creatinineValue) => {
    const result = calculate({ albuminUnit, albuminValue, creatinineUnit, creatinineValue });
    expect(result).toMatchObject({ valid: true, rawValue: 45, unit: 'mg/g', exact: true, category: 'A2', tone: 'warning', status: 'above' });
    expect(result.convertedValue).toBeCloseTo(5.090497737556561, 14);
    expect(result.convertedUnit).toBe('mg/mmol');
    expect(result.input).toEqual({ albuminUnit, albuminValue, creatinineUnit, creatinineValue });
    expect(result.context.sameSpecimen).toBe('assumed');
    expect(result.qualification.requiresConfirmation).toBe(true);
  });

  it('koncentracje są trybem domyślnym, a zero albuminy nie jest brakującą wartością', () => {
    const result = calculate({ mode: undefined, albuminValue: '0' });
    expect(result).toMatchObject({ valid: true, mode: 'concentration', rawValue: 0, category: 'A1', display: { value: '0.0', text: '0.0' } });
  });

  it('przyjmuje przecinek dziesiętny bez zmiany danych źródłowych', () => {
    expect(calculate({ albuminValue: '4,5', albuminUnit: 'mg/dL', creatinineValue: '100,0' })).toMatchObject({
      valid: true, rawValue: 45, input: { albuminValue: '4,5', creatinineValue: '100,0' },
    });
  });

  it.each([
    [{ albuminValue: '' }, 'missing-albumin'],
    [{ albuminValue: null }, 'missing-albumin'],
    ...[-1, NaN, Infinity, '45 mg/L', '<45', true].map(albuminValue => [{ albuminValue }, 'invalid-albumin']),
    [{ creatinineValue: '' }, 'missing-creatinine'],
    ...[0, -1, NaN, Infinity, '>100', true].map(creatinineValue => [{ creatinineValue }, 'invalid-creatinine']),
    [{ albuminUnit: 'g/L' }, 'invalid-albumin-unit'],
    [{ creatinineUnit: 'g/L' }, 'invalid-creatinine-unit'],
    [{ mode: 'unknown' }, 'invalid-mode'],
    [{ sameSpecimen: 'different' }, 'different-specimens'],
    [{ albuminValue: Number.MAX_VALUE, albuminUnit: 'mg/dL' }, 'invalid-conversion'],
    [{ creatinineValue: Number.MIN_VALUE }, 'invalid-conversion'],
  ])('odrzuca %j bez produkowania wyniku klinicznego', (patch, reasonCode) => {
    const result = calculate(patch);
    expect(result).toMatchObject({ valid: false, reasonCode, snapshot: null, rawValue: null, category: null });
    expect(result.message.length).toBeGreaterThan(0);
    expect(result.statusText).toBe(result.message);
  });

  it('wyjaśnia blokadę różnych próbek bez wymagania kolejnych danych klinicznych', () => {
    const result = calculate({ sameSpecimen: 'different' });
    expect(result.message).toBe('Nie można obliczyć ACR z oznaczeń z różnych próbek. Wpisz albuminę i kreatyninę z tej samej próbki moczu albo gotowy wynik ACR z laboratorium.');
    expect(result.snapshot).toBeNull();
  });

  it('obliczenie ze stężeń zachowuje oś mg/g mimo przeliczenia przez próg SI', () => {
    const result = calculate({ albuminValue: 28 });
    expect(result.category).toBe('A1');
    expect(result.convertedValue).toBeGreaterThan(3);
    expect(result.reference).toMatchObject({ unit: 'mg/g', limit: '<30' });
  });

  it.each([
    ['mg/dL', 100], ['µmol/L', 8840], ['mmol/L', 8.84],
  ])('równoważna Cr %s %s zachowuje dokładne granice A2 po konwersji', (creatinineUnit, creatinineValue) => {
    for (const albuminValue of [30, 300]) {
      expect(calculate({ albuminValue, creatinineUnit, creatinineValue })).toMatchObject({
        valid: true, rawValue: albuminValue, category: 'A2', boundary: '',
      });
    }
  });
});

describe('ACR — natywne progi, granice i cenzurowane wyniki z laboratorium', () => {
  it.each([
    ['mg/g', 29.96, 'A1', '<30'], ['mg/g', 30, 'A2', ''],
    ['mg/g', 300, 'A2', ''], ['mg/g', 300.0001, 'A3', '>300'],
    ['mg/mmol', 2.999, 'A1', '<3'], ['mg/mmol', 3, 'A2', ''],
    ['mg/mmol', 30, 'A2', ''], ['mg/mmol', 30.0001, 'A3', '>30'],
  ])('%s %s: kategoria %s liczona przed zaokrągleniem', (unit, value, category, boundary) => {
    const result = reported(value, unit);
    expect(result).toMatchObject({ valid: true, rawValue: value, unit, category, boundary, display: { boundary } });
    expect(result.context.sameSpecimen).toBe('not-applicable');
  });

  it('3 mg/mmol to A2, chociaż przeliczenie wynosi 26,52 mg/g', () => {
    const result = reported('3', 'mg/mmol', { sameSpecimen: 'different' });
    expect(result).toMatchObject({ valid: true, rawValue: 3, unit: 'mg/mmol', category: 'A2', convertedValue: 26.52, convertedUnit: 'mg/g', reference: { limit: '<3', unit: 'mg/mmol' } });
    expect(result.input).toEqual({ reportedValue: '3', reportedUnit: 'mg/mmol' });
    expect(result.input).not.toHaveProperty('albuminValue');
  });

  it.each([
    ['<30', 'mg/g', 'A1', '<', 30],
    ['≤29.96', 'mg/g', 'A1', '≤', 29.96],
    ['<=29,96', 'mg/g', 'A1', '≤', 29.96],
    ['>300', 'mg/g', 'A3', '>', 300],
    ['>=300.001', 'mg/g', 'A3', '≥', 300.001],
    ['<3', 'mg/mmol', 'A1', '<', 3],
    ['>30', 'mg/mmol', 'A3', '>', 30],
    ['≤0', 'mg/g', 'A1', '≤', 0],
    ['≤30', 'mg/g', null, '≤', 30],
    ['≥300', 'mg/g', null, '≥', 300],
    ['>30', 'mg/g', null, '>', 30],
    ['<300', 'mg/g', null, '<', 300],
  ])('zachowuje %s %s i nadaje kategorię tylko dla jednoznacznego przedziału', (text, unit, category, comparator, value) => {
    const result = reported(text, unit);
    expect(result).toMatchObject({ valid: true, rawValue: value, comparator, exact: false, category, input: { reportedValue: text } });
    expect(result.display.text).toBe(comparator + String(value));
    expect(result.display.rounded).toBe(false);
    expect(result.snapshot).toMatchObject({ comparator, exact: false, rawValue: value, category });
    if (!category) expect(result).toMatchObject({ tone: 'neutral', status: 'unassessed', reasonCode: 'censored-multiple-categories' });
  });

  it.each(['', null, '<0', '-1', '30 mg/g', '1–3', '1/3', '30abc', 'Infinity', NaN, Infinity, true])('nie traktuje %s jak dokładnego wyniku', value => {
    expect(reported(value)).toMatchObject({ valid: false, snapshot: null });
  });

  it('zachowuje dokładny zapis cenzurowanej granicy zamiast zaokrąglać przedział', () => {
    const result = reported('<29,96');
    expect(result.display).toMatchObject({ text: '<29.96', value: '29.96', comparator: '<', boundary: '' });
    expect(result.snapshot.input.reportedValue).toBe('<29,96');
  });
});

describe('ACR — kontekst wieku i próbki nie staje się wymyślonym faktem', () => {
  it.each([2, 8, 18, 45, 90])('dostępna norma w wieku %s lat bez danych o płci lub pory próbki', ageYears => {
    expect(calculate({ ageYears })).toMatchObject({ referenceAvailable: true, category: 'A2', reference: { limit: '<30' }, context: { ageYears, sameSpecimen: 'assumed', sampleType: '', confounders: [] } });
  });

  it.each([0, 0.5, 1, 1.999999])('wiek %s lat zachowuje liczbę bez normy dorosłych', ageYears => {
    expect(calculate({ ageYears })).toMatchObject({ valid: true, rawValue: 45, referenceAvailable: false, reference: null, category: null, tone: 'neutral', reasonCode: 'under-age', qualification: { note: profile.notes.underAge } });
  });

  it.each([null, undefined, '', -1, NaN, Infinity, '8'])('bez wiarygodnego wieku %s nie nadaje kategorii', ageYears => {
    expect(calculate({ ageYears })).toMatchObject({ valid: true, rawValue: 45, referenceAvailable: false, category: null, tone: 'neutral', qualification: { note: profile.notes.missingAge } });
  });

  it.each(['random', 'firstMorning', 'secondMorning', 'timed'])('próbka %s nie wymaga kolejnego pytania przed porównaniem', sampleType => {
    const result = calculate({ sampleType });
    expect(result).toMatchObject({ valid: true, category: 'A2', context: { sampleType }, qualification: { requiresConfirmation: true } });
    expect(result.notes.sample).toContain('Nie zakładamy');
  });

  it.each(['menstruation', 'hematuria', 'infection', 'exercise', 'acuteIllness', 'transient'])('znany czynnik %s zachowuje liczbę i normę informacyjną, bez prawidłowego werdyktu', factor => {
    expect(calculate({ albuminValue: 20, confounders: [factor] })).toMatchObject({
      valid: true, rawValue: 20, category: null, referenceAvailable: true, tone: 'neutral', status: 'unassessed', reasonCode: 'confounded-sample',
      context: { confounders: [factor] }, qualification: { requiresConfirmation: true, note: profile.notes.confounded },
    });
  });

  it('wynik i snapshot są niemutowalne, niezależne od wejścia i bez strat przechodzą JSON', () => {
    const input = { ...concentration, confounders: ['exercise'], sameSpecimen: 'confirmed' };
    const result = engine.evaluate(input, profile);
    input.confounders.push('infection');
    expect(result.context.confounders).toEqual(['exercise']);
    expect(result.snapshot.context.sameSpecimen).toBe('confirmed');
    expect(JSON.parse(JSON.stringify(result.snapshot))).toEqual(result.snapshot);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.snapshot.input)).toBe(true);
    expect(Object.isFrozen(result.reference.categories[0])).toBe(true);
    expect(result.snapshot).not.toHaveProperty('snapshot');
  });
});
