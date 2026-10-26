import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
for (const file of [
  'clcr_clinical_safety.js',
  'clcr_extended_egfr.js',
  'clcr_measured_clearance_reference_data.js',
  'clcr_measured_clearance_reference.js',
]) loadBrowserScript(file, browser);
const data = browser.ClcrMeasuredClearanceReferenceData;
const engine = browser.ClcrMeasuredClearanceReference;
const profile = data.PROFILES.PATHWEST_CCL_2026_03_20;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const inline = fs.readFileSync(path.join(root, 'inline_kalkulator_klirens_04.js'), 'utf8');
const pureEnd = inline.indexOf('const refRanges =');
if (pureEnd < 0) throw new Error('Brak granicy produkcyjnych funkcji obliczeniowych Klirensu.');
loadBrowserScript('clcr_saved_legacy_calculator.js', browser);
const production = new Function('window', `${inline.slice(0, pureEnd)}\nreturn { BSA_DuBois };`)(browser);

const validInput = {
  value: 100, unit: 'mL/min', ageYears: 45, sex: 'M',
  bsa: 1.8481430181213463, bsaMethod: 'Du Bois', durationHours: 24,
};
const evaluate = (patch = {}, selected = profile) => engine.evaluate({ ...validInput, ...patch }, selected);
const protocol = Object.fromEntries([
  'startVoidDiscarded', 'finalVoidIncluded', 'noMissedVoids', 'noSpillage',
  'noExtraVoids', 'storageFollowed', 'serumSampleDuringCollection',
].map(key => [key, true]));

describe('Klirens zmierzony — jawny profil PathWest i przeliczenie zakresu', () => {
  it('udostępnia odrębne, zamrożone dane z zakresem źródła i nieznanymi metadanymi', () => {
    expect(data.getProfile('PATHWEST_CCL_2026_03_20')).toBe(profile);
    expect(data.getProfile('nieznany')).toBeNull();
    expect(data.listProfiles()).toEqual([profile]);
    expect(Object.isFrozen(profile)).toBe(true);
    expect(Object.isFrozen(profile.bands[0].both)).toBe(true);
    expect(profile.source).toMatchObject({
      label: 'PathWest', lastUpdated: '2026-03-20',
      url: 'https://pathwesttd.health.wa.gov.au/testdirectory/testdetail.aspx?TestID=521',
      assayMethod: null, bsaEquation: null, referenceCohort: null, dataCollectionYears: null,
    });
    expect(profile.population).toMatchObject({ country: 'Australia', minimumAgeYears: 3, maximumAgeYearsExclusive: 120 });
    expect(profile.restrictions).toMatchObject({
      referenceKind: 'institutional-laboratory-interval', patientLaboratoryMatched: false,
      gCategoryApplicable: false, normalResultExcludesKidneyDisease: false,
      shortCollectionReferenceValidationPublished: false,
    });
  });

  it.each([
    { age: 45, sex: 'M', weight: 70, height: 175, ucr: 100, status: 'within', bsa: 1.8481430181213463, lower: 86.53155171550813, upper: 135.67292676382138 },
    { age: 45, sex: 'M', weight: 70, height: 175, ucr: 50, status: 'below', bsa: 1.8481430181213463, lower: 86.53155171550813, upper: 135.67292676382138 },
    { age: 45, sex: 'M', weight: 70, height: 175, ucr: 160, status: 'above', bsa: 1.8481430181213463, lower: 86.53155171550813, upper: 135.67292676382138 },
    { age: 8, sex: '', weight: 25, height: 125, ucr: 50, status: 'within', bsa: 0.9289825610909618, lower: 40.27381045192031, upper: 67.12301741986718 },
    { age: 82, sex: 'M', weight: 70, height: 175, ucr: 70, status: 'within', bsa: 1.8481430181213463, lower: 58.755991905591934, upper: 107.89736695390518 },
  ])('oblicza rzeczywisty klirens i BSA dla makiety: $age lat, Ucr $ucr → $status', fixture => {
    const bsa = fixture.age < 18
      ? browser.ClcrExtendedEgfr.computeHaycockBsa({
          ageYears: fixture.age, heightValue: fixture.height, heightUnit: 'cm',
          weightValue: fixture.weight, weightUnit: 'kg',
        }).value
      : production.BSA_DuBois(fixture.weight, fixture.height);
    const measured = browser.ClcrClinicalSafety.computeTimedCreatinineClearance({
      urineCreatinineMgDl: fixture.ucr, serumCreatinineMgDl: 1, volumeMl: 1440,
      collectionStartAt: '2026-10-20T08:00:00Z', collectionEndAt: '2026-10-21T08:00:00Z',
      serumSampleAt: '2026-10-20T12:00:00Z', bsaM2: bsa, weightKg: fixture.weight, protocol,
    });
    expect(measured.ok).toBe(true);
    expect(bsa).toBeCloseTo(fixture.bsa, 13);
    const result = evaluate({
      value: measured.absoluteMlMin, ageYears: fixture.age, sex: fixture.sex, bsa,
      bsaMethod: fixture.age < 18 ? 'Haycock' : 'Du Bois', durationHours: measured.durationHours,
    });
    expect(result).toMatchObject({
      available: true, status: fixture.status, value: fixture.ucr,
      referencePreview: true, unit: 'mL/min', reasonCode: '', missingFields: [],
      source: { label: 'PathWest' }, population: { country: 'Australia' },
      absoluteRange: { unit: 'mL/min', lowerInclusive: true, upperInclusive: true },
      indexedRange: { unit: 'mL/min/1,73 m²' },
    });
    expect(result.absoluteRange.lower).toBeCloseTo(fixture.lower, 12);
    expect(result.absoluteRange.upper).toBeCloseTo(fixture.upper, 12);
    expect(result.indexedValue).toBeCloseTo(measured.indexedMlMin173, 12);
    expect(result).not.toHaveProperty('category');
    expect(result).not.toHaveProperty('gCategory');
  });

  // Independent transcription from the official 20 March 2026 CCL table;
  // exercise selection for every published age band and both sex columns.
  it.each([
    [3, 19, [75, 125], [75, 125]],
    [19, 30, [94, 140], [72, 110]],
    [30, 40, [88, 134], [66, 104]],
    [40, 50, [81, 127], [59, 97]],
    [50, 60, [75, 121], [53, 91]],
    [60, 70, [68, 114], [46, 84]],
    [70, 80, [62, 108], [40, 78]],
    [80, 90, [55, 101], [33, 71]],
    [90, 100, [49, 95], [27, 65]],
    [100, 120, [42, 88], [20, 58]],
  ])('wybiera opublikowane normy wieku %s–<%s dla obu płci', (minimum, maximum, male, female) => {
    for (const [sex, expected] of [['M', male], ['F', female]]) {
      for (const ageYears of [minimum, maximum - 0.000001]) {
        const result = evaluate({ ageYears, sex, bsa: 1.73 });
        expect(result.available).toBe(true);
        expect(result.selectedBand).toMatchObject({ minimumAgeInclusive: minimum, maximumAgeExclusive: maximum });
        expect(result.indexedRange).toMatchObject({ lower: expected[0], upper: expected[1] });
        expect(result.absoluteRange.lower).toBeCloseTo(expected[0], 12);
        expect(result.absoluteRange.upper).toBeCloseTo(expected[1], 12);
      }
    }
  });

  it.each([3, 8, 17.999, 18, 18.999999])('nie wymaga płci w wieku %s lat', ageYears => {
    const result = evaluate({ ageYears, sex: null });
    expect(result).toMatchObject({ available: true, sex: null, selectedBand: { sexRequired: false, sex: null }, indexedRange: { lower: 75, upper: 125 } });
  });

  it.each([19, 30, 70, 119.999999])('od wieku %s potrzebuje rzeczywiście znanej płci', ageYears => {
    expect(evaluate({ ageYears, sex: '' })).toMatchObject({ available: false, status: 'unavailable', reasonCode: 'missing-sex', missingFields: ['sex'] });
  });

  it.each([0, 2.999999, 120, 121])('poza pokryciem źródła: %s lat, bez zastępczej normy ani kolejnych pytań', ageYears => {
    expect(evaluate({ ageYears, sex: '', bsa: null })).toMatchObject({
      available: false, status: 'unavailable', reasonCode: 'out-of-age', missingFields: [],
      absoluteRange: null, indexedRange: null,
    });
  });

  it('podaje tylko potrzebne brakujące dane, bez żądania płci na zapas', () => {
    expect(evaluate({ ageYears: null, sex: '', bsa: null })).toMatchObject({ reasonCode: 'missing-age', missingFields: ['ageYears', 'bsa'] });
    expect(evaluate({ ageYears: null, sex: '' })).toMatchObject({ reasonCode: 'missing-age', missingFields: ['ageYears'] });
    expect(evaluate({ ageYears: 8, sex: '', bsa: null })).toMatchObject({ reasonCode: 'missing-bsa', missingFields: ['bsa'], indexedRange: { lower: 75, upper: 125 } });
    expect(evaluate({ ageYears: 45, sex: '', bsa: null })).toMatchObject({ reasonCode: 'missing-sex', missingFields: ['sex', 'bsa'] });
  });

  it.each(['M', 'F'])('porównuje niezaokrąglone granice inkluzywnie dla płci %s', sex => {
    const { lower, upper } = evaluate({ sex }).absoluteRange;
    expect(evaluate({ sex, value: lower }).status).toBe('within');
    expect(evaluate({ sex, value: lower - 1e-8 }).status).toBe('below');
    expect(evaluate({ sex, value: upper }).status).toBe('within');
    expect(evaluate({ sex, value: upper + 1e-8 }).status).toBe('above');
    expect((lower - 1e-8).toFixed(1)).toBe(lower.toFixed(1));
    expect((upper + 1e-8).toFixed(1)).toBe(upper.toFixed(1));
  });

  it.each([0.5, 12, 23.999, 24.001, 25, 48])('dla czasu %s h zachowuje orientacyjne porównanie i jawny dobowy protokół źródła', durationHours => {
    const result = evaluate({ durationHours });
    expect(result).toMatchObject({ available: true, status: 'within', referencePreview: true, protocolContext: { nominalHours: 24 } });
    expect(result.protocolNote).toContain('zbiórki dobowej');
    expect(result.restrictions.shortCollectionReferenceValidationPublished).toBe(false);
  });

  it('także przy 24 h pozostawia referencePreview, bez dopisywania zgodności z laboratorium pacjenta', () => {
    const result = evaluate();
    expect(result.referencePreview).toBe(true);
    expect(result.protocolNote).toBe('');
    expect(result.restrictions.patientLaboratoryMatched).toBe(false);
    expect(result.source.bsaEquation).toBeNull();
    expect(result.bsaMethod).toBe('Du Bois');
  });

  it.each([
    [{ value: null }, 'missing-value', 'value'],
    ...[0, -1, NaN, Infinity, '100', true].map(value => [{ value }, 'invalid-value', 'value']),
    ...['', 'ml/min', 'mL/min/1,73 m²', 'mg/dl', null].map(unit => [{ unit }, 'invalid-unit', 'unit']),
    [{ bsa: null }, 'missing-bsa', 'bsa'],
    ...[0, -1, NaN, Infinity, '1.73'].map(bsa => [{ bsa }, 'invalid-bsa', 'bsa']),
    [{ ageYears: '' }, 'missing-age', 'ageYears'],
    ...[-1, NaN, Infinity, '45', true].map(ageYears => [{ ageYears }, 'invalid-age', 'ageYears']),
    [{ durationHours: null }, 'missing-duration', 'durationHours'],
    ...[0, -1, NaN, Infinity, '24'].map(durationHours => [{ durationHours }, 'invalid-duration', 'durationHours']),
  ])('odrzuca nieprawidłowe dane %j', (patch, reasonCode, field) => {
    expect(evaluate(patch)).toMatchObject({ available: false, status: 'unavailable', reasonCode, missingFields: [field], absoluteRange: null });
  });

  it('odrzuca przepełnienie przeliczenia zamiast raportować fałszywą normę', () => {
    expect(evaluate({ bsa: Number.MAX_VALUE })).toMatchObject({ available: false, reasonCode: 'invalid-conversion', absoluteRange: null });
    expect(evaluate({ bsa: Number.MIN_VALUE })).toMatchObject({ available: false, reasonCode: 'invalid-conversion', absoluteRange: null });
  });

  it('wymaga jawnie wybranego profilu nawet gdy rejestr jest załadowany', () => {
    expect(engine.evaluate(validInput)).toMatchObject({ available: false, reasonCode: 'missing-profile', source: null });
    expect(evaluate({}, { ...profile, unit: 'mg/dl' })).toMatchObject({ available: false, reasonCode: 'invalid-profile' });
    expect(evaluate({}, { ...profile, bands: [{ ...profile.bands[3], male: { lower: 200, upper: 100 } }] })).toMatchObject({ available: false, reasonCode: 'invalid-profile' });
  });

  it('przyjmuje inny profil jako argument i zwraca jego populację bez mutacji lub fallbacku PathWest', () => {
    const alternative = structuredClone(profile);
    alternative.id = 'SYNTHETIC_REFERENCE_FOR_TEST';
    alternative.source = { label: 'Źródło testowe', url: 'https://example.invalid/reference', assayMethod: 'test' };
    alternative.population = { label: 'Fikcyjna populacja testowa', country: 'test' };
    alternative.bands = [{ id: 'test-adults', minimumAgeInclusive: 3, maximumAgeExclusive: 120, both: { lower: 50, upper: 60 } }];
    const before = structuredClone(alternative);
    const input = { ...validInput, bsa: 1.73 };
    const result = engine.evaluate(input, alternative);
    expect(result).toMatchObject({ available: true, status: 'above', profileId: 'SYNTHETIC_REFERENCE_FOR_TEST', source: { label: 'Źródło testowe' }, population: { label: 'Fikcyjna populacja testowa' }, indexedRange: { lower: 50, upper: 60 } });
    expect(alternative).toEqual(before);
    expect(Object.isFrozen(alternative)).toBe(false);
    expect(input).toEqual({ ...validInput, bsa: 1.73 });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.source)).toBe(true);
    expect(Object.isFrozen(result.absoluteRange)).toBe(true);
    expect(evaluate({ bsa: 1.73 }).status).toBe('within');
  });

  it('nie skleja luk ani nakładających się pasm w jedną normę', () => {
    const gap = { ...profile, bands: profile.bands.filter(band => band.id !== 'age-40-50') };
    expect(evaluate({}, gap)).toMatchObject({ available: false, reasonCode: 'no-age-band' });
    const overlap = { ...profile, bands: [...profile.bands, profile.bands[3]] };
    expect(evaluate({}, overlap)).toMatchObject({ available: false, reasonCode: 'ambiguous-age-band' });
  });
});
