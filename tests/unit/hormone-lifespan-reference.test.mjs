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
    expect(data.profiles).toHaveLength(36);
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
    for (const [age, expected] of [[3, 0.3764139001167295], [12, 1.4977255724595988],
      [40, 13.049603876520182], [88, 13.222919801641392]]) {
      expect(evaluate('t', age).referenceValue).toBeCloseTo(expected, 11);
    }
    expect(evaluate('inhb', .25, { sex: 'female' }).referenceValue).toBe(49.684);
  });

  it('AMH u chłopców używa wyłącznie zgodnych median rocznych grup Wang, bez interpolacji między grupami', () => {
    // Independently transcribed from the matching Table 1 / Table 2 entries,
    // journal page 156. These are group medians, not exact-age predictions.
    const groups = [
      [1, 160.42, 123], [2, 155.57, 129], [3, 118.33, 147], [4, 115.23, 142],
      [5, 99.18, 134], [6, 83.05, 144], [7, 69.61, 131], [8, 62.75, 147],
      [9, 58.96, 135], [10, 54.18, 138], [11, 20.70, 126],
      [13, 9.64, 132], [14, 8.23, 129]
    ];
    expect(data.profiles.filter(item => item.id.startsWith('wang2020-'))).toHaveLength(groups.length);
    for (const [age, median, n] of groups) {
      for (const offset of [0, .25, .5, .99]) {
        const result = evaluate('amh', age + offset);
        expect(result.status).toBe('ready');
        expect(result.referenceValue).toBeCloseTo(median / 0.1401, 10);
        expect(result.profile).toMatchObject({
          id: `wang2020-male-amh-age-${age}`, statistic: 'group-median',
          interpolation: 'constant', minAge: age, maxAge: age + 1,
          maxAgeExclusive: true,
          ageGroup: { labelYears: age, minAge: age, maxAge: age + 1, n,
            sourceUnit: 'ng/mL', sourceMedian: median }
        });
      }
      expect(engine.referenceAt(profile(`wang2020-male-amh-age-${age}`), age + 1)).toBeNull();
    }
  });

  it('AMH zachowuje lukę 12 lat, dane minipuberty i dorosłych oraz nie przenosi grup chłopców na dziewczęta', () => {
    for (const age of [12, 12.5, 12.999, 15, 19.99]) {
      expect(evaluate('amh', age)).toEqual(unavailable('unsupported-age'));
    }
    expect(profile('wang2020-male-amh-age-0')).toBeUndefined();
    expect(profile('wang2020-male-amh-age-12')).toBeUndefined();
    const infant = evaluate('amh', 90 / 365.25);
    expect(infant).toMatchObject({
      status: 'ready', referenceValue: 1154.040945,
      profile: { id: 'busch2022-male-amh' }
    });
    expect(evaluate('amh', 40).referenceValue).toBe(6.12 / 0.1401);
    expect(evaluate('amh', 70).status).toBe('ready');
    expect(evaluate('amh', 1, { sex: 'female' })).toMatchObject({
      status: 'ready', profile: { id: 'ljubicic2022-female-amh' }
    });
    for (const age of [1.01, 5, 11, 13, 14]) {
      expect(evaluate('amh', age, { sex: 'female' })).toEqual(unavailable('unsupported-age'));
    }
  });

  it('odrzuca sprzeczne wartości w profilu stałej mediany zamiast wybierać jeden węzeł', () => {
    const original = profile('wang2020-male-amh-age-5');
    const broken = { ...original, points: original.points.map((point, index) => ({
      ...point, value: point.value + index
    })) };
    expect(engine.referenceAt(broken, 5)).toBeNull();
    expect(engine.referenceAt(broken, 5.5)).toBeNull();
    expect(engine.sampleProfile(broken, 20)).toEqual([]);
    const corruptedData = { ...data, profiles: data.profiles.map(item => item.id === broken.id ? broken : item) };
    expect(engine.evaluate(corruptedData, context('amh', 5))).toEqual(unavailable('reference-unavailable'));
  });

  it('AMH w pełnych latach i miesiącach dobiera jedną grupę, a wiek obejmujący dwie grupy nie tworzy pozornej mediany', () => {
    const openEnd = { ageUpperYears: 6, ageUpperInclusive: false };
    expect(evaluate('amh', 5, openEnd)).toMatchObject({
      status: 'ready', profile: { id: 'wang2020-male-amh-age-5' }
    });
    expect(evaluate('amh', 5 + 11 / 12, openEnd).referenceValue).toBeCloseTo(99.18 / 0.1401, 10);
    expect(evaluate('amh', 5, { ageUpperYears: 6 })).toEqual(unavailable('ambiguous-age'));
    expect(evaluate('amh', 5, { ...openEnd, ageUpperInclusive: true })).toEqual(unavailable('ambiguous-age'));
    expect(evaluate('amh', 5.5, { ageUpperYears: 6.01, ageUpperInclusive: false }))
      .toEqual(unavailable('ambiguous-age'));
    expect(evaluate('amh', 11, { ageUpperYears: 12, ageUpperInclusive: false }).status).toBe('ready');
    expect(evaluate('amh', 11, { ageUpperYears: 12 })).toEqual(unavailable('ambiguous-age'));
    expect(evaluate('amh', 14, { ageUpperYears: 15, ageUpperInclusive: false }).status).toBe('ready');
  });

  it('AMH Wang zachowuje jednostki i znaną metodę zamiast traktować automatyczny wybór źródła jako zgodność oznaczenia', () => {
    const ng = evaluate('amh', 5, { measurement: { value: 100, unit: 'ng/mL' } });
    const pmol = evaluate('amh', 5, { measurement: { value: 100 / 0.1401, unit: 'pmol/L' } });
    expect(ng.status).toBe('ready');
    expect(ng.value).toBeCloseTo(pmol.value, 10);
    expect(ng.referenceValue).toBe(pmol.referenceValue);
    expect(evaluate('amh', 5, { assayMethodId: 'Access-2', specimen: 'serum' }).status).toBe('ready');
    expect(evaluate('amh', 5, { assayMethodId: 'beckman-access-2' }).status).toBe('ready');
    expect(evaluate('amh', 5, { assayMethodId: 'roche-elecsys' })).toEqual(unavailable('incompatible-assay'));
    expect(evaluate('amh', 5, { assayMethodId: 'unknown' }).status).toBe('ready');
    expect(evaluate('amh', 5, { assayMethodId: 'unknown' })).not.toHaveProperty('methodConfirmed');
    expect(evaluate('amh', 5, { specimen: 'plasma' })).toEqual(unavailable('incompatible-specimen'));
    expect(evaluate('amh', 5, { contraindicated: true })).toEqual(unavailable('contraindicated'));
    expect(evaluate('amh', 5, { preterm: 'unknown' }).status).toBe('ready');
  });

  it('oba profile Kelsey zachowują całą funkcję źródłową, niezależnie od przedziału doboru', () => {
    const childhood = profile('kelsey2014-male-t-childhood');
    const adult = profile('kelsey2014-male-t');
    expect(childhood).toMatchObject({ minAge: 3, maxAge: 6, maxAgeExclusive: true });
    expect(adult).toMatchObject({ minAge: 18, maxAge: 88 });
    expect(adult.maxAgeExclusive).not.toBe(true);
    expect(childhood.points).toEqual(adult.points);
    expect(childhood.formula).toEqual(adult.formula);
    for (const source of [childhood, adult]) {
      expect(source.points).toHaveLength(851);
      expect(source.points[0]).toMatchObject({ ageYears: 3, value: 0.3764139001167295 });
      expect(source.points.at(-1)).toMatchObject({ ageYears: 88, value: 13.222919801641392 });
    }
  });

  it('interpolacja gęstych węzłów testosteronu nie zmienia istotnie opublikowanej funkcji', () => {
    for (const id of ['kelsey2014-male-t-childhood', 'kelsey2014-male-t']) {
      // Test the complete original model even though routing now restricts its
      // application. Truncating source nodes would change endpoint tangents.
      const source = { ...profile(id), minAge: 3, maxAge: 88, maxAgeExclusive: false };
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
    }
  });

  it('Madsen zachowuje wszystkie 13 źródłowych p50, także węzeł 18 lat poza swoim przedziałem doboru', () => {
    // Independently checked against Supplemental Table 1, LCMSMS hormones,
    // AF19:AI31: p50 = exp(M) / 1e6. M is not concentration in nmol/L.
    const annualP50 = [
      0.02393726986868612, 0.04428894486069003, 0.08270416444893601,
      0.15935758946374518, 0.32336362859591733, 0.6902963832084651,
      1.4977255724595988, 3.1059898625687334, 5.796253989141138,
      9.338280616859034, 12.96588173768215, 15.939466800893923,
      18.051151264084126
    ];
    const routed = profile('madsen2022-male-t');
    expect(routed).toMatchObject({ minAge: 6, maxAge: 18, maxAgeExclusive: true,
      statistic: 'model-central', unit: 'nmol/L', interpolation: 'pchip' });
    expect(routed.points).toHaveLength(13);
    const fullSource = { ...routed, maxAgeExclusive: false };
    const sourceOnlyData = { ...data, profiles: [fullSource] };
    for (const [index, expected] of annualP50.entries()) {
      const age = index + 6;
      expect(routed.points[index]).toMatchObject({ ageYears: age, value: expected });
      expect(engine.referenceAt(fullSource, age)).toBe(expected);
      expect(engine.evaluate(sourceOnlyData, context('t', age)))
        .toMatchObject({ status: 'ready', referenceValue: expected });
      if (age < 18) expect(evaluate('t', age)).toMatchObject({ status: 'ready',
        referenceValue: expected, profile: { id: 'madsen2022-male-t' } });
    }
    expect(engine.referenceAt(routed, 18)).toBeNull();
    const adult = evaluate('t', 18);
    expect(adult).toMatchObject({ status: 'ready', profile: { id: 'kelsey2014-male-t' } });
    expect(adult.referenceValue).toBeCloseTo(15.16389257035198, 12);
  });

  it('Madsen między rocznymi węzłami stosuje PCHIP stężenia, bez zmiany algorytmu na interpolację logarytmiczną', () => {
    // Independent SciPy PCHIP check of the original annual source values;
    // these are application interpolations, not additional published p50.
    const halfYearP50 = [
      0.03220218326839272, 0.060424854613936686, 0.11436893124034544,
      0.22608394961671463, 0.47209533201743, 1.022694006396458,
      2.184609711432908, 4.3205152310892085, 7.501471968931469,
      11.191594750064453, 14.55249945088127, 17.09391640504546
    ];
    for (const [index, expected] of halfYearP50.entries()) {
      const result = evaluate('t', index + 6.5);
      expect(result.status).toBe('ready');
      expect(result.profile.id).toBe('madsen2022-male-t');
      expect(result.referenceValue).toBeCloseTo(expected, 12);
    }
  });

  it('testosteron przełącza źródła dokładnie w 6. i 18. urodziny, bez nakładających się profili', () => {
    for (const [age, id] of [
      [3, 'kelsey2014-male-t-childhood'], [5.999999, 'kelsey2014-male-t-childhood'],
      [6, 'madsen2022-male-t'], [6.000001, 'madsen2022-male-t'],
      [17.999999, 'madsen2022-male-t'], [18, 'kelsey2014-male-t'],
      [18.000001, 'kelsey2014-male-t'], [88, 'kelsey2014-male-t']
    ]) {
      expect(engine.selectProfile(data, context('t', age)))
        .toMatchObject({ status: 'ready', profile: { id } });
      expect(evaluate('t', age)).toMatchObject({ status: 'ready', profile: { id } });
    }
    expect(engine.referenceAt(profile('kelsey2014-male-t-childhood'), 6)).toBeNull();
    expect(engine.referenceAt(profile('madsen2022-male-t'), 5.999999)).toBeNull();
    expect(engine.referenceAt(profile('kelsey2014-male-t'), 17.999999)).toBeNull();
    expect(evaluate('t', 2.999999)).toEqual(unavailable('unsupported-age'));
    expect(evaluate('t', 88.000001)).toEqual(unavailable('unsupported-age'));
  });

  it('przedział wieku testosteronu nie łączy źródeł na granicach 6 i 18 lat', () => {
    for (const [boundary, earlierId, laterId] of [
      [6, 'kelsey2014-male-t-childhood', 'madsen2022-male-t'],
      [18, 'madsen2022-male-t', 'kelsey2014-male-t']
    ]) {
      const age = boundary - .5;
      expect(evaluate('t', age, { ageUpperYears: boundary, ageUpperInclusive: false }))
        .toMatchObject({ status: 'ready', profile: { id: earlierId } });
      for (const inclusive of [undefined, true]) {
        expect(evaluate('t', age, { ageUpperYears: boundary, ageUpperInclusive: inclusive }))
          .toEqual(unavailable('ambiguous-age'));
      }
      for (const inclusive of [false, true]) {
        expect(evaluate('t', age, { ageUpperYears: boundary + .01, ageUpperInclusive: inclusive }))
          .toEqual(unavailable('ambiguous-age'));
      }
      expect(evaluate('t', boundary, { ageUpperYears: boundary + .5 }))
        .toMatchObject({ status: 'ready', profile: { id: laterId } });
    }
  });

  it('źródło testosteronu według wieku nie wymaga stadium, godziny pobrania ani informacji o wcześniactwie po niemowlęctwie', () => {
    for (const age of [6, 12, 17.99, 18, 40]) {
      const baseline = evaluate('t', age);
      expect(baseline.status).toBe('ready');
      expect(baseline.profile.requiredGonadalStage).toBeUndefined();
      expect(baseline.profile.termOnly).not.toBe(true);
      for (const preterm of ['unknown', 'yes', 'no', null, undefined]) {
        for (const puberty of [null, { kind: 'G', stage: 1 }, { kind: 'G', stage: 5 }]) {
          const result = evaluate('t', age, { preterm, puberty });
          expect(result.status).toBe('ready');
          expect(result.referenceValue).toBe(baseline.referenceValue);
          expect(result.profile.id).toBe(baseline.profile.id);
        }
      }
    }
  });

  it('nowe przedziały testosteronu zachowują konwersje jednostek i blokady znanych niezgodności', () => {
    const conversion = converterData.find('testosterone_total').units
      .find(item => item.symbol === 'ng/dL').factor_to_si;
    for (const age of [3, 6, 6.5, 12, 18, 40]) {
      const ng = evaluate('t', age, { measurement: { value: 100, unit: 'ng/dL' } });
      const nmol = evaluate('t', age, { measurement: { value: 100 * conversion, unit: 'nmol/L' } });
      expect(ng.status).toBe('ready');
      expect(ng.value).toBe(nmol.value);
      expect(ng.referenceValue).toBe(nmol.referenceValue);
      expect(ng.profile.id).toBe(nmol.profile.id);
      for (const assayMethodId of ['lc-ms/ms', 'lc-ms-ms', 'lcmsms', 'LC-MS/MS', 'unknown']) {
        expect(evaluate('t', age, { assayMethodId, specimen: 'serum' }).status).toBe('ready');
      }
      expect(evaluate('t', age, { assayMethodId: 'unknown' })).not.toHaveProperty('methodConfirmed');
      expect(evaluate('t', age, { assayMethodId: 'roche-elecsys' })).toEqual(unavailable('incompatible-assay'));
      expect(evaluate('t', age, { specimen: 'plasma' })).toEqual(unavailable('incompatible-specimen'));
      // The patient adapter maps known treatment/stimulation to this exclusion.
      expect(evaluate('t', age, { contraindicated: true })).toEqual(unavailable('contraindicated'));
    }
  });

  it('wybiera źródło z wieku i płci, bez dopasowywania go do wartości wyniku', () => {
    for (const value of [0, 1, 1000]) {
      expect(evaluate('t', 12, { measurement: { value, unit: 'nmol/L' } }).profile.id)
        .toBe('madsen2022-male-t');
    }
    expect(engine.selectProfile(data, { ...context(), measurement: null }).status).toBe('ready');
    expect(evaluate('inhb', 6.099).profile.id).toBe('kelsey2016-male-inhb');
    expect(evaluate('inhb', 6.1).profile.id).toBe('borelli2025-male-inhb');
    expect(engine.referenceAt(profile('kelsey2016-male-inhb'), 6.1)).toBeNull();
    expect(evaluate('inhb', 1).profile.id).toBe('kelsey2016-male-inhb');
  });

  it('44-letni mężczyzna zachowuje medianę Borelli bez dopasowywania do wyniku ani wygładzania rysunku', () => {
    for (const value of [0, 88, 400, 100000000]) {
      for (const preterm of ['unknown', 'yes', 'no']) {
        const result = evaluate('inhb', 44, { preterm,
          measurement: { value, unit: 'pg/mL' } });
        expect(result).toMatchObject({ status: 'ready', value,
          profile: { id: 'borelli2025-male-inhb' } });
        expect(result.referenceValue).toBeCloseTo(162.08470588235292, 10);
      }
    }
    expect(evaluate('inhb', 44, { measurement: { value: 88, unit: 'pg/mL', operator: '<' } }))
      .toEqual(unavailable('censored-result'));
    expect(evaluate('inhb', 44, { measurement: null })).toEqual(unavailable('invalid-value'));
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
        if (age < source.minAge || age > source.maxAge || (source.maxAgeExclusive && age === source.maxAge)) continue;
        const value = engine.referenceAt(source, age);
        expect(value).toBeGreaterThanOrEqual(Math.min(left.value, right.value) - 1e-9);
        expect(value).toBeLessThanOrEqual(Math.max(left.value, right.value) + 1e-9);
      }
    }
    expect(engine.referenceAt(profile('busch2022-male-amh'), 90 / 365.25)).toBeGreaterThan(1000);
    expect(JSON.stringify(data)).toBe(before);
  });
});
