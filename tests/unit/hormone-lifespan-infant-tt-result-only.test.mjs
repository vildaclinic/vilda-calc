import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { beforeInfantTtResultOnlyRuntime } from '../support/prior-female-gonadotropin-bundle.mjs';

const require = createRequire(import.meta.url);
const engine = require('../../vilda_hormone_lifespan_reference.js');
const runtime = require('../../vilda_hormone_lifespan_data.js');
const display = require('../../vilda_hormone_lifespan_display.js');
const puberty = require('../../vilda_lab_puberty.js');
const bundle = runtime.patientPointData;
const profile = bundle.profiles.find(item => item.id === 'busch2022-male-t');
const policy = JSON.parse(readFileSync(new URL(
  '../../docs/clinical/hormone-lifespan/male-testosterone-infant-result-only-policy.json', import.meta.url), 'utf8'));
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const unavailable = reason => ({ status: 'unavailable', reason });
const exact = (day = 300, extra = {}) => ({
  analyte: 'testosterone_total', sex: 'male', preterm: 'no',
  ageYears: day / 365.25, ageUpperYears: day / 365.25, ageUpperInclusive: true,
  contextBasis: 'current-patient', infantTtContextAvailable: true,
  measurement: { value: .4, unit: 'nmol/L', operator: '=' }, ...extra,
});
const span = (low, high, inclusive = true, extra = {}) => exact(low, {
  ageUpperYears: high / 365.25, ageUpperInclusive: inclusive, ...extra,
});
const numeric = (context = exact(), data = runtime) => engine.evaluate(data, context);
const result = (context = exact(), data = runtime) => engine.evaluateResultOnly(data, context);
const withProfile = change => {
  const altered = structuredClone(profile); change(altered);
  return { ...runtime, patientPointData: { ...bundle,
    profiles: bundle.profiles.map(item => item.id === profile.id ? altered : item) } };
};

describe('TT chłopców po 212. dniu — sam wynik, bez nowej mediany', () => {
  it('dodaje wyłącznie oddzielną politykę i zachowuje cały wcześniejszy runtime, 85 profili i geometrię', () => {
    expect(runtime.infantTtResultOnlyPolicy).toEqual(policy);
    expect(digest(beforeInfantTtResultOnlyRuntime(runtime)))
      .toBe('a727a726efcb30f8d217c7adb3380209bdec1b423e82b3bee69ee3c7564eed58');
    expect(bundle.profiles).toHaveLength(85);
    expect(digest(bundle)).toBe('9b456034383f8f09bec75856599e1d4372a8002f3ed5276cf5ade57724874ae9');
    expect(digest(profile)).toBe('09bea3464426ed1cd0c2c159d45553a41a9cc4bfdd1ec7250f9bedab3bec540f');
    expect(digest(display.buildMaleTestosterone(runtime, engine)))
      .toBe('9c95940b01b3dbd0b1657da891c1f8ca4ab03a40b12b7c587305012b37660282');
    expect(policy).toMatchObject({ kind: 'educational-infant-tt-result-only-display',
      profileId: profile.id, notClinicalReference: true, ordinaryOnly: true,
      resultOnlyPolicy: { kind: 'educational-result-only', sourceProfileId: profile.id,
        minAge: 212 / 365.25, minAgeExclusive: true, maxAge: 1, maxAgeExclusive: true,
        currentPatientOnly: true, fullAgeIntervalRequired: true,
        contextAvailabilityKey: 'infantTtContextAvailable', allowedViews: ['life', 'mini'] } });
    expect(bundle).not.toHaveProperty('infantTtResultOnlyPolicy');
    expect(profile).not.toHaveProperty('numericReferencePolicy');
    expect(policy).not.toHaveProperty('numericReference');
  });

  it.each([213, 244, 270, 300, 326, 340, 365, 365.25 - 1e-7])(
    'dzień %s pokazuje tylko prawdziwy wynik mimo nadal niedostępnej liczbowej mediany', day => {
      const c = exact(day), actual = result(c);
      expect(numeric(c)).toEqual(unavailable('reference-unavailable'));
      expect(numeric(c, bundle)).toEqual(unavailable('reference-unavailable'));
      expect(actual).toMatchObject({ status: 'result-only', value: .4, unit: 'nmol/L',
        policy: { id: 'male-tt-infant-result-only' } });
      expect(Object.keys(actual).sort()).toEqual(['policy', 'status', 'unit', 'value']);
      for (const key of ['profile', 'referenceValue', 'median', 'ratio', 'sds', 'percentile',
        'points', 'statistic', 'referenceInterval', 'referencePolicy', 'classification', 'biochemical']) {
        expect(actual).not.toHaveProperty(key);
        expect(actual.policy).not.toHaveProperty(key);
      }
      // A stored raw reading is still present, but is not activated by this permission.
      expect(engine.referenceAt(profile, day / 365.25)).toBeGreaterThan(0);
    },
  );

  it('zachowuje dotychczasowy punkt i medianę do dokładnej granicy 212 dni', () => {
    for (const day of [7, 90, 211, 212]) {
      const c = exact(day, { contextBasis: undefined, infantTtContextAvailable: undefined });
      expect(numeric(c)).toMatchObject({ status: 'ready', profile: { id: profile.id } });
      expect(numeric(c)).not.toHaveProperty('referencePolicy');
      expect(result(c)).toEqual(unavailable('reference-available'));
    }
    expect(numeric(exact(212))).toMatchObject({ referenceValue: .168563 });
    expect(result(exact(212 + 1e-8)).status).toBe('result-only');
  });

  it('wymaga całego wieku po granicy, a nie tylko wybranego środka przedziału', () => {
    for (const c of [span(211, 213), span(212, 213), span(211, 213, false)]) {
      expect(numeric(c)).toEqual(unavailable('reference-unavailable'));
      expect(result(c).status).toBe('unavailable');
    }
    expect(result(span(213, 214))).toMatchObject({ status: 'result-only', value: .4 });
    expect(result(span(300, 301, false)).status).toBe('result-only');
    const sixMonths = puberty.resolveAge({ age: { years: 0, months: 6, precision: 'month' } });
    expect(result(exact(0, { ageYears: sixMonths.lowerYears, ageUpperYears: sixMonths.upperYears,
      ageUpperInclusive: sixMonths.upperInclusive })).status).toBe('unavailable');
  });

  it.each([7, 8, 9, 10, 11])('ukończone %s miesięcy zachowuje pełny rzeczywisty przedział', month => {
    const age = puberty.resolveAge({ age: { years: 0, months: month, precision: 'month' } });
    const c = exact(0, { ageYears: age.lowerYears, ageUpperYears: age.upperYears,
      ageUpperInclusive: age.upperInclusive });
    expect(result(c)).toMatchObject({ status: 'result-only', value: .4 });
    expect(numeric(c)).toEqual(unavailable('reference-unavailable'));
    expect(age.upperInclusive).toBe(false);
  });

  it('nie przedłuża niemowlęctwa przez pierwsze urodziny i nie zmienia źródła dziecięcego', () => {
    expect(result(span(365, 365.25, false)).status).toBe('result-only');
    for (const c of [span(365, 365.25), span(365, 366, false)]) {
      expect(result(c)).toEqual(unavailable('ambiguous-age'));
    }
    for (const day of [365.25, 366, 500]) {
      expect(engine.referenceAt(profile, day / 365.25)).toBeNull();
      expect(numeric(exact(day))).toMatchObject({ status: 'ready',
        profile: { id: 'kushnir2010-male-t-1-2-group' }, referenceValue: .10401 });
      expect(result(exact(day))).toEqual(unavailable('reference-available'));
    }
  });

  it('wymaga jawnego całego wieku i zgodnego gotowego kontekstu obecnej osoby', () => {
    for (const extra of [{ ageUpperYears: undefined }, { ageUpperYears: null },
      { ageUpperYears: NaN }, { ageUpperYears: Infinity }, { ageUpperYears: 299 / 365.25 },
      { ageUpperInclusive: undefined }, { ageUpperInclusive: 'true' }, { ageUpperInclusive: false }]) {
      expect(result(exact(300, extra))).toEqual(unavailable('ambiguous-age'));
    }
    for (const flag of [undefined, null, false, 0, 1, 'true']) {
      expect(result(exact(300, { infantTtContextAvailable: flag })))
        .toEqual(unavailable('current-context-unavailable'));
    }
    for (const extra of [{ contextBasis: undefined }, { contextBasis: 'sample' },
      { sampleDateISO: '2026-01-01' }, { sampleDateISO: 0 }]) {
      expect(result(exact(300, extra))).toEqual(unavailable('incompatible-current-context'));
    }
  });

  it('nie zastępuje odrzuconej populacji, metody, materiału, leczenia ani niejednoznacznego profilu', () => {
    for (const preterm of [undefined, null, true, 'yes', 'unknown']) {
      expect(result(exact(300, { preterm }))).toEqual(unavailable('preterm-context'));
    }
    for (const specimen of ['plasma', 'urine', 'fictional-unsupported']) {
      expect(result(exact(300, { specimen }))).toEqual(unavailable('incompatible-specimen'));
    }
    expect(result(exact(300, { assayMethodId: 'immunoassay' })))
      .toEqual(unavailable('incompatible-assay'));
    expect(result(exact(300, { contraindicated: true }))).toEqual(unavailable('contraindicated'));
    for (const assayMethodId of [undefined, '', 'unknown', 'lc-ms/ms', 'lc-ms-ms', 'lcmsms']) {
      expect(result(exact(300, { assayMethodId })).status).toBe('result-only');
    }
    for (const specimen of [undefined, '', 'unknown', 'serum', 'surowica']) {
      expect(result(exact(300, { specimen })).status).toBe('result-only');
    }
    for (const phase of ['pregnancy', 'pregnancy_t1', 'menopause']) {
      expect(result(exact(300, { cyclePhase: phase })))
        .toEqual(unavailable('incompatible-reproductive-context'));
    }
    const duplicate = { ...runtime, patientPointData: { ...bundle,
      profiles: [...bundle.profiles, { ...profile, id: 'fictional-overlapping-tt-source' }] } };
    expect(result(exact(), duplicate)).toEqual(unavailable('ambiguous-profile'));
    for (const analyte of ['lh', 'fsh', 'amh', 'inhb', 'insl3', 'e2']) {
      const actual = result(exact(300, { analyte }));
      expect(actual.policy?.id).not.toBe('male-tt-infant-result-only');
    }
    expect(result(exact(300, { sex: 'female' })).policy?.id).not.toBe('male-tt-infant-result-only');
  });

  it('zachowuje zero, małe i duże wyniki oraz rzeczywiste przeliczenie obsługiwanych jednostek', () => {
    const browser = loadBrowserScript('lab_units_data.js');
    loadBrowserScript('lab_unit_converter.js', browser);
    for (const unit of ['nmol/L', 'ng/dL']) {
      for (const value of [0, .004, .4, 70, 1e308]) {
        const converted = browser.LabUnitConverter.convertAll({ substanceId: 'testosterone_total', value, fromUnit: unit });
        expect(converted.ok).toBe(true);
        const actual = result(exact(300, { measurement: { value, unit, operator: '=' } }));
        expect(actual).toMatchObject({ status: 'result-only', value: converted.siValue, unit: 'nmol/L' });
      }
    }
    for (const value of [-1, NaN, Infinity, -Infinity, null, undefined, '0']) {
      expect(result(exact(300, { measurement: { value, unit: 'nmol/L' } })))
        .toEqual(unavailable('invalid-value'));
    }
    expect(result(exact(300, { measurement: { value: .4, unit: 'IU/L' } })))
      .toEqual(unavailable('unsupported-unit'));
  });

  it('nie zamienia prawdziwych nierówności i limitów oznaczenia w dokładny punkt', () => {
    for (const raw of ['<0,1', '>0.4', '≤0,3', '≥0.4', '<LOD', '<LOQ', 'LOD', 'LOQ']) {
      const parsed = puberty.parseMeasurement(raw, 'nmol/L');
      const actual = result(exact(300, { measurement: {
        value: parsed.value, unit: 'nmol/L', operator: parsed.operator } }));
      expect(actual.status).toBe('unavailable');
      expect(actual).not.toHaveProperty('value');
    }
  });

  it('wymaga osobnej polityki i nie odzyskuje zepsutego lub liczbowo kwalifikującego się źródła', () => {
    expect(result(exact(), bundle)).toEqual(unavailable('reference-available'));
    expect(result(exact(), { ...runtime, infantTtResultOnlyPolicy: undefined }))
      .toEqual(unavailable('reference-available'));
    for (const change of [p => { p.kind = 'fictional-policy'; }, p => { p.profileId = 'fictional-source'; },
      p => { p.resultOnlyPolicy.sourceProfileId = 'fictional-source'; },
      p => { p.resultOnlyPolicy.analyte = 'lh'; }, p => { p.resultOnlyPolicy.unit = 'IU/L'; },
      p => { p.resultOnlyPolicy.currentPatientOnly = false; },
      p => { p.resultOnlyPolicy.fullAgeIntervalRequired = false; }]) {
      const altered = structuredClone(policy); change(altered);
      expect(result(exact(), { ...runtime, infantTtResultOnlyPolicy: altered }).status).toBe('unavailable');
    }
    for (const change of [p => { p.points = []; },
      p => { p.points[1].ageYears = p.points[0].ageYears; },
      p => { p.points = p.points.filter(point => point.ageYears < 299 / 365.25); },
      p => { p.points.forEach(point => { point.eligible = true; }); }]) {
      expect(result(exact(), withProfile(change)).status).toBe('unavailable');
    }
    expect(result(exact(), { ...runtime, referenceScope: 'sex-comparison' }))
      .toEqual(unavailable('reference-unavailable'));
  });

  it('zachowuje niezależną politykę LH i taki sam wynik API przeglądarkowego bez mutacji danych', () => {
    expect(result(exact(330, { analyte: 'lh', infantTtContextAvailable: false,
      infantLhContextAvailable: true, measurement: { value: .4, unit: 'IU/L', operator: '=' } })))
      .toMatchObject({ status: 'result-only', policy: { id: 'male-lh-infant-tail-result-only' } });
    const browser = loadBrowserScript('vilda_hormone_lifespan_reference.js');
    for (const c of [exact(212), exact(213), exact(), exact(365), span(211, 213),
      span(365, 365.25, false), exact(300, { contraindicated: true })]) {
      const before = JSON.stringify(c), beforeData = digest(runtime);
      expect(browser.VildaHormoneLifespanReference.evaluate(runtime, c)).toEqual(numeric(c));
      expect(browser.VildaHormoneLifespanReference.evaluateResultOnly(runtime, c)).toEqual(result(c));
      expect(JSON.stringify(c)).toBe(before);
      expect(digest(runtime)).toBe(beforeData);
    }
  });
});
