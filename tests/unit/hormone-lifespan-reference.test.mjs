import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const require = createRequire(import.meta.url);
const engine = require('../../vilda_hormone_lifespan_reference.js');
const runtime = require('../../vilda_hormone_lifespan_data.js');
const data = runtime.patientPointData;
const converterData = require('../../lab_units_data.js');
const profile = id => data.profiles.find(item => item.id === id);
const context = (analyte = 'lh', ageYears = 90 / 365.25, extras = {}) => ({
  analyte, sex: 'male', ageYears, preterm: 'no',
  measurement: { value: 2, unit: data.unitConversions[analyte].unit }, ...extras
});
const evaluate = (...args) => engine.evaluate(data, context(...args));
const unavailable = reason => ({ status: 'unavailable', reason });

describe('Punkt pacjenta — produkcyjny silnik i ilościowe dane źródłowe', () => {
  it('przeglądarka i CommonJS korzystają z tego samego niezależnego zbioru danych', () => {
    const browser = loadBrowserScript('vilda_hormone_lifespan_reference.js');
    expect(browser.VildaHormoneLifespanReference.evaluate(runtime, context()))
      .toEqual(engine.evaluate(data, context()));
    expect(data).toEqual(JSON.parse(readFileSync(new URL(
      '../../docs/clinical/hormone-lifespan/population-reference-data.json', import.meta.url), 'utf8')));
    expect(data.notClinicalReference).toBe(true);
    expect(data.profiles).toHaveLength(17);
    expect(data.profiles.every(item => item.sourceLabel && item.url && item.method && item.population)).toBe(true);
  });

  it('90. dzień u chłopca zachowuje odczytane mediany ryciny 3, a nie średnie ryciny 2', () => {
    for (const [analyte, expected] of Object.entries({
      lh: 2.05589, fsh: 1.127305, t: 4.360537, inhb: 294.293798,
      amh: 1154.040945, insl3: 0.035509
    })) {
      const result = evaluate(analyte);
      expect(result.status).toBe('ready');
      expect(result.referenceValue).toBe(expected);
      expect(result.profile).toMatchObject({
        id: `busch2022-male-${analyte}`, approximate: true, statistic: 'median'
      });
      expect(result.profile.provenance).toMatchObject({ figure: 3, participants: 119, postnatalSerumSamples: 338 });
    }
  });

  it('zachowuje źródłowe punkty p50 w pokwitaniu i dorosłości', () => {
    expect(evaluate('lh', 12).referenceValue).toBe(0.6775625214085037);
    expect(evaluate('fsh', 12).referenceValue).toBe(2.01486005633355);
    expect(evaluate('inhb', 12).referenceValue).toBe(146);
    expect(evaluate('amh', 40).referenceValue).toBe(6.12 / 0.1401);
    for (const [age, expected] of [[3, 0.3764139001167295], [12, 1.6927166288128852],
      [40, 13.049603876520182], [88, 13.222919801641392]]) {
      expect(evaluate('t', age).referenceValue).toBeCloseTo(expected, 11);
    }
    expect(evaluate('inhb', .25, { sex: 'female' }).referenceValue).toBe(49.684);
  });

  it('interpolacja gęstych węzłów testosteronu nie zmienia istotnie opublikowanej funkcji', () => {
    const source = profile('kelsey2014-male-t');
    const c = source.formula.coefficients;
    let maximumError = 0;
    // Independent comparison to the full-precision source equation, including
    // between-node ages around the rapid pubertal rise; calls the real engine.
    for (let index = 600; index <= 17600; index++) {
      const age = index / 200;
      const exact = 10 ** ((c.a + c.c * age + c.e * age ** 2 + c.g * age ** 3) /
        (1 + c.b * age + c.d * age ** 2 + c.f * age ** 3)) - 1;
      maximumError = Math.max(maximumError, Math.abs(engine.referenceAt(source, age) - exact));
    }
    expect(maximumError).toBeLessThan(0.00013);
  });

  it('wybiera źródło z wieku i płci, bez dopasowywania go do wartości wyniku', () => {
    for (const value of [0, 1, 1000]) {
      expect(evaluate('t', 12, { measurement: { value, unit: 'nmol/L' } }).profile.id)
        .toBe('kelsey2014-male-t');
    }
    expect(engine.selectProfile(data, { ...context(), measurement: null }).status).toBe('ready');
    expect(evaluate('inhb', 6.099).profile.id).toBe('kelsey2016-male-inhb');
    expect(evaluate('inhb', 6.1).profile.id).toBe('borelli2025-male-inhb');
    expect(engine.referenceAt(profile('kelsey2016-male-inhb'), 6.1)).toBeNull();
    expect(evaluate('inhb', 1).profile.id).toBe('kelsey2016-male-inhb');
  });

  it('nie uzupełnia luk dowodowych ani nie ekstrapoluje poza wiek źródła', () => {
    for (const [analyte, age] of [['lh', 6 / 365.25], ['lh', 1], ['lh', 5.99],
      ['lh', 16.01], ['fsh', 40], ['t', 2.99], ['t', 88.01], ['amh', 20],
      ['amh', 70.01], ['inhb', 80.01], ['insl3', 12]]) {
      expect(evaluate(analyte, age)).toEqual(unavailable('unsupported-age'));
    }
    expect(evaluate('lh', 7 / 365.25).status).toBe('ready');
    expect(evaluate('lh', 6).status).toBe('ready');
    expect(evaluate('lh', 16).status).toBe('ready');
    expect(evaluate('inhb', 12, { sex: 'female' })).toEqual(unavailable('unsupported-age'));
    expect(evaluate('lh', .019, { sex: 'female' })).toEqual(unavailable('unsupported-age'));
    expect(evaluate('lh', .02, { sex: 'female' }).status).toBe('ready');
  });

  it('niemowlęcy profil wymaga znanej donoszonej ciąży i nie przenosi tej reguły na dorosłych', () => {
    for (const sex of ['male', 'female']) {
      for (const preterm of [true, 'yes', 'unknown', undefined, null]) {
        expect(evaluate('lh', .25, { sex, preterm })).toEqual(unavailable('preterm-context'));
      }
      expect(evaluate('lh', .25, { sex, preterm: false }).status).toBe('ready');
    }
    expect(evaluate('t', 40, { preterm: 'unknown' }).status).toBe('ready');
  });

  it('uwzględnia otwartą górną granicę pełnych miesięcy i odmawia przy mieszanych źródłach', () => {
    const elevenMonths = { ageUpperYears: 1, ageUpperInclusive: false,
      measurement: { value: 80, unit: 'pg/mL' } };
    expect(evaluate('inhb', 11 / 12, elevenMonths)).toMatchObject({
      status: 'ready', value: 80, profile: { id: 'busch2022-male-inhb' }
    });
    expect(evaluate('inhb', 11 / 12, { ...elevenMonths, ageUpperInclusive: true }))
      .toEqual(unavailable('ambiguous-age'));
    expect(evaluate('inhb', 11 / 12, { ageUpperYears: 1 })).toEqual(unavailable('ambiguous-age'));
    expect(evaluate('inhb', 6, { ageUpperYears: 6.1, ageUpperInclusive: false }).status).toBe('ready');
    expect(evaluate('inhb', 6, { ageUpperYears: 6.1 })).toEqual(unavailable('ambiguous-age'));
    expect(evaluate('lh', 12, { ageUpperYears: 13 }).status).toBe('ready');
    for (const upper of [11, NaN, Infinity, '13']) {
      expect(evaluate('lh', 12, { ageUpperYears: upper })).toEqual(unavailable('ambiguous-age'));
    }
  });

  it('nie rysuje punktu względem mediany zbyt bliskiej granicy oznaczalności i dokładności ryciny', () => {
    for (const [analyte, lastDay] of [['lh', 243], ['t', 212], ['insl3', 95]]) {
      expect(evaluate(analyte, lastDay / 365.25).status).toBe('ready');
      expect(evaluate(analyte, (lastDay + 1) / 365.25)).toEqual(unavailable('reference-unavailable'));
      expect(evaluate(analyte, lastDay / 365.25, { ageUpperYears: (lastDay + 1) / 365.25 }))
        .toEqual(unavailable('reference-unavailable'));
      // Source curve can remain visible beyond dot eligibility; this is not a
      // fabricated quantifiable patient-to-reference ratio below the floor.
      expect(engine.referenceAt(profile(`busch2022-male-${analyte}`), (lastDay + 1) / 365.25))
        .toBeGreaterThan(0);
    }
  });

  it('odrzuca cenzurowane i nieprawidłowe wartości zamiast zamieniać je na dokładny punkt', () => {
    for (const value of [null, undefined, '', '2', true, NaN, Infinity, -Infinity, -1]) {
      expect(evaluate('lh', .25, { measurement: { value, unit: 'IU/L' } })).toEqual(unavailable('invalid-value'));
    }
    for (const operator of ['<', '>', '<=', '>=', '≤', '≥', '~', 'invalid']) {
      expect(evaluate('lh', .25, { measurement: { value: 2, unit: 'IU/L', operator } }))
        .toEqual(unavailable('censored-result'));
    }
    for (const operator of [null, undefined, '', '=']) {
      expect(evaluate('lh', .25, { measurement: { value: 0, unit: 'IU/L', operator } }).value).toBe(0);
    }
    expect(evaluate('amh', 40, { measurement: { value: Number.MAX_VALUE, unit: 'ng/mL' } }))
      .toEqual(unavailable('invalid-value'));
    for (const unit of ['', 'ng/dL', 'toString', '__proto__', null]) {
      expect(evaluate('lh', .25, { measurement: { value: 2, unit } })).toEqual(unavailable('unsupported-unit'));
    }
  });

  it('przelicza jednostki zgodnie z istniejącym przelicznikiem, zachowując wspólne współrzędne', () => {
    expect(evaluate('lh', .25, { measurement: { value: 2, unit: 'mIU/mL' } }).value).toBe(2);
    expect(evaluate('inhb', .25, { measurement: { value: 100, unit: 'ng/L' } }).value).toBe(100);
    const factor = (id, unit) => converterData.find(id).units.find(item => item.symbol === unit).factor_to_si;
    expect(evaluate('t', 40, { measurement: { value: 100, unit: 'ng/dL' } }).value)
      .toBe(100 * factor('testosterone_total', 'ng/dL'));
    expect(evaluate('e2', .25, { sex: 'female', measurement: { value: 10, unit: 'pg/mL' } }).value)
      .toBe(10 * factor('estradiol', 'pg/mL'));
    expect(evaluate('amh', 40, { measurement: { value: 6.12, unit: 'ng/mL' } }).value)
      .toBeCloseTo(6.12 / factor('amh', 'pmol/L'), 12);
  });

  it('blokuje znane niezgodności, ale brak metody nie staje się potwierdzeniem metody źródła', () => {
    expect(evaluate('lh', .25, { contraindicated: true })).toEqual(unavailable('contraindicated'));
    expect(evaluate('lh', .25, { specimen: 'plasma' })).toEqual(unavailable('incompatible-specimen'));
    expect(evaluate('lh', .25, { assayMethodId: 'anshlite-lh' })).toEqual(unavailable('incompatible-assay'));
    expect(evaluate('lh', .25, { assayMethodId: 'AutoDELFIA', specimen: 'serum' }).status).toBe('ready');
    expect(evaluate('lh', .25, { assayMethodId: 'unknown' }).status).toBe('ready');
    expect(evaluate('lh', .25, { assayMethodId: 'unknown' })).not.toHaveProperty('methodConfirmed');
    expect(engine.evaluate(data, { ...context(), analyte: '__proto__' })).toEqual(unavailable('unsupported-analyte'));
    expect(evaluate('lh', .25, { sex: 'unknown' })).toEqual(unavailable('unsupported-sex'));
  });

  it('PCHIP zachowuje węzły i ich lokalne granice stężeń, bez przycinania do osi względnej', () => {
    const before = JSON.stringify(data);
    for (const source of data.profiles) {
      const sampled = engine.sampleProfile(source, 80);
      expect(sampled).toHaveLength(80);
      expect(sampled[0].ageYears).toBe(source.minAge);
      expect(sampled.at(-1).ageYears).toBeLessThanOrEqual(source.maxAge);
      if (source.maxAgeExclusive) expect(sampled.at(-1).ageYears).toBeLessThan(source.maxAge);
      expect(engine.referenceAt(source, source.minAge - 1e-6)).toBeNull();
      expect(engine.referenceAt(source, source.maxAge + 1e-6)).toBeNull();
      for (let index = 1; index < source.points.length; index++) {
        const left = source.points[index - 1], right = source.points[index];
        const age = (left.ageYears + right.ageYears) / 2;
        if (age > source.maxAge || (source.maxAgeExclusive && age === source.maxAge)) continue;
        const value = engine.referenceAt(source, age);
        expect(value).toBeGreaterThanOrEqual(Math.min(left.value, right.value) - 1e-9);
        expect(value).toBeLessThanOrEqual(Math.max(left.value, right.value) + 1e-9);
      }
    }
    expect(engine.referenceAt(profile('busch2022-male-amh'), 90 / 365.25)).toBeGreaterThan(1000);
    expect(JSON.stringify(data)).toBe(before);
  });
});
