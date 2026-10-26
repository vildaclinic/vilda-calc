import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { beforeFemaleE2ChildhoodBundle, beforeInhibinPost47Bundle, beforeInfantLhTailBundle } from '../support/prior-female-gonadotropin-bundle.mjs';

const require = createRequire(import.meta.url);
const runtime = require('../../vilda_hormone_lifespan_data.js');
const engine = require('../../vilda_hormone_lifespan_reference.js');
const ageEngine = require('../../vilda_lab_puberty.js');
const data = runtime.patientPointData;
const profileId = 'borelli2025-female-inhb-age-5p6-47p75';
// Exact archival profile from audyt 3b6a5302, before this extension. It is
// independent historical test evidence, never a second runtime source.
const prior = JSON.parse(readFileSync(new URL(
  '../fixtures/hormone-lifespan-prior-female-inhibin-profile.json', import.meta.url), 'utf8'));
const profile = data.profiles.find(item => item.id === profileId);
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const evaluate = (ageYears, extra = {}) => engine.evaluate(data, {
  analyte: 'inhb', sex: 'female', ageYears,
  measurement: { value: 33, unit: 'pg/mL' }, ...extra,
});
const unavailable = reason => ({ status: 'unavailable', reason });
const addedNodes = [[47.25, 10], [47.5, 8], [47.75, 7]];

describe('Inhibina B kobiet — źródłowe rozszerzenie po 47 do 47,75 lat', () => {
  it('zastępuje dokładnie jeden z 85 profili, zachowując 84 inne profile bieżącej bazy i historyczne hashe', () => {
    expect(data.version).toBe('2026-10-26.1');
    expect(data.profiles).toHaveLength(85);
    expect(data.profiles.some(item => item.id === prior.id)).toBe(false);
    const others = beforeInfantLhTailBundle(data).profiles.filter(item => item.id !== profileId);
    expect(others).toHaveLength(84);
    // Exact audyt ab8ead6a (including the independently merged E2/Th1 group),
    // excluding only the replaced ordinary inhibin profile.
    expect(digest(others)).toBe('3a95ad12a2ba6bc90888f92e8b0057fc98e42efc2a3aa4eacfac6080922e66b1');
    expect(digest({ ...beforeInhibinPost47Bundle(data), version: '2026-10-22.1' }))
      .toBe('51649dbd6c9f1d2d0ed4e3672003c441e001115e325cbba1098f821deab30479');
    const beforeE2 = beforeFemaleE2ChildhoodBundle(data);
    const historicalOthers = beforeE2.profiles.filter(item => item.id !== profileId);
    expect(historicalOthers).toHaveLength(83);
    // Frozen from 3b6a5302. Preserve the original assertions and literal hashes
    // as well as the newer complete-base check above.
    expect(digest(historicalOthers)).toBe('de31eadb50b114c696191cf93cfb0c84102791006d53586cc0ff5b99ffa9bf58');
    expect(digest(beforeInhibinPost47Bundle(beforeE2)))
      .toBe('805a064dd9953179e419597e8dbd56f507f136c29b60850d68aac7f3cafd7c3a');
    expect(prior).toMatchObject({ id: 'borelli2025-female-inhb-age-5p6-47', maxAge: 47,
      provenance: { routingVersion: '2026-10-14.1' } });
    expect(profile.provenance).toMatchObject({
      fullSourceKnotDomain: [5.6, 47.75], originalSourceKnotDomain: [5.6, 47],
    });
    expect(profile.points.slice(0, 24)).toEqual(prior.points);
    expect(profile.points).toHaveLength(27);
    expect(runtime.inhibinComparisonReferenceData.profiles[0].points).toEqual(prior.points);
  });

  it.each(addedNodes)('dla %s lat zwraca nowy przybliżony odczyt mediany %s pg/mL bez zależności od wyniku', (age, median) => {
    for (const value of [0, 1.5, 3, 33, 1000]) {
      for (const unit of ['pg/mL', 'ng/L']) {
        const result = evaluate(age, { measurement: { value, unit } });
        expect(result).toMatchObject({ status: 'ready', value, referenceValue: median,
          profile: { id: profileId, minAge: 5.6, maxAge: 47.75, maxAgeExclusive: false,
            ordinaryOnly: true, statistic: 'median', approximate: true, interpolation: 'pchip',
            specimen: 'serum', unit: 'pg/mL', provenance: { digitizationTolerancePgMl: 2 } } });
        for (const key of ['referenceInterval', 'classification', 'percentile', 'sds', 'clinicalCutoff']) {
          expect(result).not.toHaveProperty(key);
          expect(result.profile).not.toHaveProperty(key);
        }
        expect(result.profile).not.toHaveProperty('minimumPatientValue');
      }
    }
    expect(engine.referenceAt(profile, age)).toBe(median);
  });

  it('zachowuje stare węzły i cały przebieg do 46, jawnie uwzględniając lokalną zmianę PCHIP między 46 a 47', () => {
    for (const point of prior.points) {
      expect(engine.referenceAt(profile, point.ageYears)).toBe(point.value);
    }
    for (let age = 5.6; age <= 46; age += .125) {
      expect(engine.referenceAt(profile, age)).toBe(engine.referenceAt(prior, age));
    }
    expect(engine.referenceAt(prior, 46.5)).toBe(14.4375);
    expect(evaluate(46.5)).toMatchObject({ status: 'ready', profile: { id: profileId } });
    expect(evaluate(46.5).referenceValue).toBeCloseTo(14.076923076923077, 12);
    const deltas = Array.from({ length: 1001 }, (_, index) => {
      const age = 46 + index / 1000;
      return engine.referenceAt(profile, age) - engine.referenceAt(prior, age);
    });
    expect(Math.max(...deltas)).toBe(0);
    expect(Math.min(...deltas)).toBeCloseTo(-.4273501067307688, 12);
    expect(evaluate(47)).toMatchObject({ status: 'ready', referenceValue: 11 });
  });

  it('kwalifikuje cały możliwy wiek i zachowuje ciągłość przez dawną granicę 47', () => {
    for (const [lower, upper] of [[46.9, 47], [46.9, 47.1], [47, 47.75], [47.5, 47.75]]) {
      for (const ageUpperInclusive of [true, false]) {
        expect(evaluate(lower, { ageUpperYears: upper, ageUpperInclusive })).toMatchObject({
          status: 'ready', profile: { id: profileId },
          referenceValue: engine.referenceAt(profile, lower),
        });
      }
    }
    for (const [age, status] of [
      [{ years: 47, months: 0, precision: 'month' }, 'ready'],
      [{ years: 47, months: 8, precision: 'month' }, 'ready'],
      [{ years: 47, months: 9, precision: 'month' }, 'unavailable'],
      [{ years: 47, precision: 'year' }, 'unavailable'],
    ]) {
      const resolved = ageEngine.resolveAge({ age });
      expect(resolved.status).toBe('known');
      const result = evaluate(resolved.lowerYears, { ageUpperYears: resolved.upperYears,
        ageUpperInclusive: resolved.upperInclusive });
      expect(result.status).toBe(status);
      if (status === 'ready') expect(result.profile.id).toBe(profileId);
      else expect(result).toEqual(unavailable('ambiguous-age'));
    }
    expect(evaluate(47.75)).toMatchObject({ status: 'ready', referenceValue: 7 });
    for (const ageUpperInclusive of [true, false]) {
      expect(evaluate(47.75, { ageUpperYears: 47.750001, ageUpperInclusive }))
        .toEqual(unavailable('ambiguous-age'));
    }
    for (const age of [47.750001, 48, 69]) {
      expect(evaluate(age)).toEqual(unavailable('unsupported-age'));
      expect(engine.referenceAt(profile, age)).toBeNull();
    }
  });

  it('stosuje dotychczasowe bramki również w nowym ogonie bez dodawania pytań obowiązkowych', () => {
    expect(evaluate(47.5)).toMatchObject({ status: 'ready', referenceValue: 8 });
    expect(evaluate(47.5, { specimen: 'serum', assayMethodId: 'inhibin-b-gen-ii' }).status).toBe('ready');
    expect(evaluate(47.5, { specimen: 'unknown', assayMethodId: 'unknown', cyclePhase: 'unknown' }).status).toBe('ready');
    for (const [extra, reason] of [
      [{ specimen: 'plasma' }, 'incompatible-specimen'],
      [{ assayMethodId: 'oxford-bioinnovation' }, 'incompatible-assay'],
      [{ contraindicated: true }, 'contraindicated'],
      ...['pregnancy_t1', 'pregnancy_t2', 'pregnancy_t3', 'postmenopause']
        .map(cyclePhase => [{ cyclePhase }, 'incompatible-reproductive-context']),
    ]) expect(evaluate(47.5, extra)).toEqual(unavailable(reason));
    for (const operator of ['<', '<=', '≤', '>', '>=', '≥', '<LOD']) {
      expect(evaluate(47.5, { measurement: { value: 3, unit: 'pg/mL', operator } }))
        .toEqual(unavailable('censored-result'));
    }
  });
});
