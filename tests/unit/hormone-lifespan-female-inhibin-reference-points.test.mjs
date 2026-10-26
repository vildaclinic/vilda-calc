import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { priorFemaleGonadotropinBundle, withoutFemaleGonadotropinReferencePolicy } from '../support/prior-female-gonadotropin-bundle.mjs';

const require = createRequire(import.meta.url);
const laterChildhoodIds = ['zhou2025-female-inhb-age-over1-under5', 'zhou2025-female-inhb-age-5-under5p6'];
const runtime = require('../../vilda_hormone_lifespan_data.js');
const engine = require('../../vilda_hormone_lifespan_reference.js');
const ageEngine = require('../../vilda_lab_puberty.js');
const display = require('../../vilda_hormone_lifespan_display.js');
const data = runtime.patientPointData;
const read = name => JSON.parse(readFileSync(new URL(
  `../../docs/clinical/hormone-lifespan/${name}`, import.meta.url), 'utf8'));
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const policy = read('female-inhibin-reference-policy.json');
const profileId = 'borelli2025-female-inhb-age-5p6-47p75';
const priorProfileId = 'borelli2025-female-inhb-age-5p6-47';
const context = (ageYears, extra = {}) => ({ analyte: 'inhb', sex: 'female', ageYears,
  measurement: { value: 33, unit: 'pg/mL' }, ...extra });
const evaluate = (ageYears, extra) => engine.evaluate(data, context(ageYears, extra));
const unavailable = reason => ({ status: 'unavailable', reason });
const excludedPhases = ['pregnancy_t1', 'pregnancy_t2', 'pregnancy_t3', 'postmenopause'];
// Independent readings retained from Borelli-Kjær Figure 1, central GAMLSS line.
// They are approximate model medians, not phase-specific medians or clinical cutoffs.
const adultNodes = [[20, 34], [25, 32], [30, 30], [35, 29], [40, 28],
  [42, 26], [44, 23], [45, 20], [46, 17], [47, 11]];

describe('Inhibina B kobiet — jedno źródłowe odniesienie wieku 5,6–47,75 lat', () => {
  it('rozszerza jeden profil i zachowuje dokładnie wszystkie 73 pozostałe profile oraz konwersje', () => {
    expect(data.profiles).toHaveLength(85);
    expect(data.version).toBe('2026-10-26.1');
    const unchanged = { ...priorFemaleGonadotropinBundle(data), version: '2026-10-13.4',
      profiles: priorFemaleGonadotropinBundle(data).profiles.filter(profile => profile.id !== priorProfileId && !laterChildhoodIds.includes(profile.id)) };
    expect(unchanged.profiles).toHaveLength(73);
    // Snapshot of the approved 8b84254e base excluding only the revised profile.
    expect(digest(unchanged)).toBe('f2cab3d7ea197ae8feaddcd0d0cdfea4fffcc8bba566a7101b82138865f73c5f');
    expect(digest(withoutFemaleGonadotropinReferencePolicy(runtime)))
      .toBe('380884eb2367b1c48f52d580ee3d3898441d5b204bd979e3b7a12fe8321baa3d');
    expect(data).toEqual(read('population-reference-data.json'));
    expect(data.profiles.some(profile => profile.id === 'borelli2025-female-inhb-age-5p6-20')).toBe(false);
    expect(read('female-adolescent-reference-policy.json')).not.toHaveProperty('inhb');
    expect(policy).toMatchObject({ id: profileId, ordinaryOnly: true, minAge: 5.6, maxAge: 47.75,
      maxAgeExclusive: false, excludedCyclePhases: excludedPhases });
  });

  it.each(adultNodes)('dla wieku %s zwraca przybliżoną medianę modelu %s pg/mL niezależnie od wyniku', (age, median) => {
    for (const value of [0, .01, 33, 500, 1e6]) {
      for (const unit of ['pg/mL', 'ng/L']) {
        const result = evaluate(age, { measurement: { value, unit } });
        expect(result).toMatchObject({ status: 'ready', value, referenceValue: median,
          profile: { id: profileId, minAge: 5.6, maxAge: 47.75, maxAgeExclusive: false,
            ordinaryOnly: true, statistic: 'median', approximate: true,
            interpolation: 'pchip', unit: 'pg/mL', specimen: 'serum',
            provenance: { doi: '10.1210/clinem/dgae439', figure: 1,
              digitizationTolerancePgMl: 2, routingVersion: '2026-10-21.2' } } });
        for (const key of ['classification', 'percentile', 'sds', 'referenceInterval', 'clinicalCutoff']) {
          expect(result).not.toHaveProperty(key);
          expect(result.profile).not.toHaveProperty(key);
        }
      }
    }
  });

  it('zachowuje 24 stare węzły i niezmienione źródłowe odniesienie pediatryczne, dopisując trzy odczyty', () => {
    const profile = evaluate(30).profile;
    const comparison = runtime.inhibinComparisonReferenceData.profiles[0];
    const source = read('evidence/inhb-digitized-median.json');
    expect(profile.points).toHaveLength(27);
    expect(profile.points.slice(0, 24)).toEqual(comparison.points);
    expect(profile.points.slice(0, 24)).toEqual(source.points.map(point => ({ ageYears: point.ageYears, value: point.approxMedianPgMl })));
    // The comparison keeps its eligibility but fits all 24 knots, including adulthood.
    for (let age = 8; age <= 20; age += .125) {
      expect(engine.referenceAt(profile, age)).toBe(engine.referenceAt(comparison, age));
    }
    expect(evaluate(6).referenceValue).toBe(11);
    expect(evaluate(15).referenceValue).toBe(44);
    expect(profile.provenance.cohorts).toEqual([
      { n: 648, ageMinYears: 5.6, ageMaxYears: 20.2 },
      { n: 149, ageMinYears: 20, ageMaxYears: 69 },
    ]);
    expect(profile.patientNote).toBe('Cykl i antykoncepcja mogą wpływać na porównanie.');
    expect(profile.provenance.reproductiveContextPolicy).toContain('polityka aplikacji');
    expect(profile.provenance.reproductiveContextPolicy).toContain('nie jest to opublikowane kryterium');
    expect(profile.population).toContain('149');
    expect(profile.population).toContain('niepełne');
    expect(profile).not.toHaveProperty('minimumPatientValue');
    expect(profile).not.toHaveProperty('requiredGonadalStage');
  });

  it('kwalifikuje niepewny wiek po obu stronach 20 bez sztucznego rozcięcia jednego modelu', () => {
    for (const [low, high] of [[19.9, 20.1], [20, 21], [20.1, 20.3], [25, 26], [46, 47], [46.9, 47.1]]) {
      for (const ageUpperInclusive of [true, false]) {
        expect(evaluate(low, { ageUpperYears: high, ageUpperInclusive })).toMatchObject({
          status: 'ready', referenceValue: engine.referenceAt(evaluate(low).profile, low), profile: { id: profileId },
        });
      }
    }
    for (const age of [{ years: 20, precision: 'year' }, { years: 46, precision: 'year' },
      { years: 46, months: 11, precision: 'month' }]) {
      const resolved = ageEngine.resolveAge({ age });
      expect(evaluate(resolved.lowerYears, { ageUpperYears: resolved.upperYears,
        ageUpperInclusive: resolved.upperInclusive }).status).toBe('ready');
    }
  });

  it('dopuszcza dokładny kres 47,75, lecz nie przedłuża go do wszystkich 47 ukończonych lat ani do granicy kohorty 69', () => {
    expect(evaluate(47)).toMatchObject({ status: 'ready', referenceValue: 11 });
    expect(evaluate(47.75)).toMatchObject({ status: 'ready', referenceValue: 7 });
    expect(evaluate(46.99, { ageUpperYears: 47 })).toMatchObject({ status: 'ready' });
    for (const ageUpperYears of [47.75001, 47 + 10 / 12, 48]) {
      for (const ageUpperInclusive of [true, false]) {
        expect(evaluate(47, { ageUpperYears, ageUpperInclusive })).toEqual(unavailable('ambiguous-age'));
      }
    }
    const resolved = ageEngine.resolveAge({ age: { years: 47, months: 0, precision: 'month' } });
    expect(evaluate(resolved.lowerYears, { ageUpperYears: resolved.upperYears,
      ageUpperInclusive: resolved.upperInclusive })).toMatchObject({ status: 'ready', referenceValue: 11 });
    for (const age of [47.75001, 48, 60, 69, 90]) expect(evaluate(age)).toEqual(unavailable('unsupported-age'));
    for (const [age, referenceValue] of [[1.0001, 33], [3, 33], [5.59, 27]]) {
      expect(evaluate(age)).toMatchObject({ status: 'ready', referenceValue, profile: { statistic: 'group-median' } });
    }
    expect(evaluate(5.6)).toMatchObject({ status: 'ready', referenceValue: 11 });
    expect(evaluate(5.59, { ageUpperYears: 5.61 })).toEqual(unavailable('ambiguous-age'));
  });

  it('znany stan ciąży lub menopauzy blokuje tylko ten profil; brak danych nie jest potwierdzeniem stanu rozrodczego', () => {
    for (const age of [6, 15, 20, 30, 46, 47, 47.25, 47.5, 47.75]) {
      for (const cyclePhase of excludedPhases.flatMap(phase => [phase, `  ${phase.toUpperCase()}  `])) {
        expect(evaluate(age, { cyclePhase })).toEqual(unavailable('incompatible-reproductive-context'));
      }
      for (const cyclePhase of [undefined, null, '', 'unknown', 'follicular', 'ovulation', 'luteal']) {
        expect(evaluate(age, { cyclePhase }).status).toBe('ready');
      }
    }
    // The shared engine follows profile data; this scope does not rewrite other sources.
    for (const cyclePhase of excludedPhases) {
      expect(evaluate(30, { sex: 'male', cyclePhase })).toEqual(evaluate(30, { sex: 'male' }));
      expect(evaluate(.25, { preterm: 'no', cyclePhase })).toEqual(evaluate(.25, { preterm: 'no' }));
    }
  });

  it('zachowuje bramki metody, materiału, leczenia i jednostek bez nowych obowiązkowych danych', () => {
    for (const specimen of [undefined, null, '', 'unknown', 'serum', 'surowica']) {
      for (const assayMethodId of [undefined, null, '', 'unknown', 'inhibin-b-gen-ii', 'beckman-inhibin-b-gen-ii']) {
        expect(evaluate(30, { specimen, assayMethodId }).status).toBe('ready');
      }
    }
    for (const specimen of ['plasma', 'edta-plasma', 'whole-blood']) {
      expect(evaluate(30, { specimen })).toEqual(unavailable('incompatible-specimen'));
    }
    for (const assayMethodId of ['oxford-bioinnovation', 'inhibin-b-oxford', 'access-amh']) {
      expect(evaluate(30, { assayMethodId })).toEqual(unavailable('incompatible-assay'));
    }
    expect(evaluate(30, { contraindicated: true })).toEqual(unavailable('contraindicated'));
    expect(evaluate(30, { measurement: { value: 33, unit: 'ng/mL' } })).toEqual(unavailable('unsupported-unit'));
    for (const preterm of [undefined, 'unknown', 'no', 'yes']) {
      expect(evaluate(30, { preterm }).status).toBe('ready');
    }
  });

  it('nie przypisuje punktu wynikom z LOD/operatorem ani wartościom nieprawidłowym', () => {
    for (const operator of ['<', '<=', '≤', '>', '>=', '≥', '~']) {
      expect(evaluate(30, { measurement: { value: 3, unit: 'pg/mL', operator } }))
        .toEqual(unavailable('censored-result'));
    }
    for (const operator of [undefined, null, '', '=']) {
      expect(evaluate(30, { measurement: { value: 3, unit: 'pg/mL', operator } })).toMatchObject({
        status: 'ready', value: 3, referenceValue: 30,
      });
    }
    for (const value of [-1, NaN, Infinity, '33', null]) {
      expect(evaluate(30, { measurement: { value, unit: 'pg/mL' } })).toEqual(unavailable('invalid-value'));
    }
  });

  it('utrzymuje osobne porównanie płci 8–20 i identyczny przebieg obu porównań', () => {
    const expected = { mini: 'c7682fa147fc033dec2a3319d00fccdb80909eec337ad70ccc71f8baf30e1266',
      puberty: '15665b0c11fcb75c64921ab219a69ebd3dfb56c98312268c91e2d5bf0eb5e071' };
    for (const period of ['mini', 'puberty']) {
      const model = display.buildInhibinComparison(runtime, engine, period);
      expect(digest(model.curves)).toBe(expected[period]);
    }
    const model = display.buildInhibinComparison(runtime, engine, 'puberty');
    expect(model.domain).toEqual({ minAge: 8, maxAge: 20, maxAgeExclusive: false });
    for (const age of [8, 15, 20]) expect(engine.evaluate(model.referenceData, context(age)).status).toBe('ready');
    for (const age of [6, 20.01, 25, 47]) {
      expect(engine.evaluate(model.referenceData, context(age))).toEqual(unavailable('unsupported-age'));
      expect(evaluate(age).status).toBe('ready');
    }
  });
});
