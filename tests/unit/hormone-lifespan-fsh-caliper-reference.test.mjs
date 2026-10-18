import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { beforeFshCaliperBundle, beforeFshCaliperRuntime, beforeMaleAmhYoungAdultBundle } from '../support/prior-female-gonadotropin-bundle.mjs';

const require = createRequire(import.meta.url);
const runtime = require('../../vilda_hormone_lifespan_data.js');
const engine = require('../../vilda_hormone_lifespan_reference.js');
const display = require('../../vilda_hormone_lifespan_display.js');
const ageEngine = require('../../vilda_lab_puberty.js');
const data = runtime.patientPointData;
const read = name => JSON.parse(readFileSync(new URL(
  `../../docs/clinical/hormone-lifespan/${name}`, import.meta.url), 'utf8'));
const source = read('evidence/patient-point/wilson2023-caliper-fsh-lms.json');
const policy = read('fsh-caliper-reference-policy.json');
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const ids = { male: 'wilson2023-male-fsh-age-16-18', female: 'wilson2023-female-fsh-age-16-19' };
const profile = sex => data.profiles.find(item => item.id === ids[sex]);
const evaluate = (sex, ageYears = 17, extra = {}) => engine.evaluate(data, {
  analyte: 'fsh', sex, ageYears, measurement: { value: 2, unit: 'IU/L', operator: '=' }, ...extra
});
const unavailable = reason => ({ status: 'unavailable', reason });

// Independently checked qBCCG(.5) of the original FSH_M/FSH_F rows of
// Supplementary Table 3. These are native IU/L, not exp(M), nominal z=0,
// a reference-interval midpoint or a digitization of the educational line.
const checks = {
  male: [[16, 2.4066234448145565], [17, 2.518038228916774], [18, 2.607443576372793]],
  female: [[16, 3.961224607974412], [17, 4.1790950116741366], [18, 4.399647684355955]],
};

describe('FSH CALIPER — źródłowe p50 późnej adolescencji, bez nowej normy laboratoryjnej', () => {
  it('dodaje dokładnie dwa profile i zmienia wyłącznie wyłączność dwóch zwykłych końców Madsen', () => {
    expect(data.version).toBe('2026-10-18.3');
    expect(data.profiles).toHaveLength(82);
    expect(data).toEqual(read('population-reference-data.json'));
    expect(runtime.fshCaliperReferencePolicy).toEqual(policy);
    expect(policy.profiles.map(item => item.id)).toEqual(Object.values(ids));
    const madsenIds = ['madsen2022-male-fsh', 'madsen2022-female-fsh-age-6-16'];
    for (const id of madsenIds) {
      expect(data.profiles.find(item => item.id === id)).toMatchObject({ maxAge: 16, maxAgeExclusive: true });
    }
    // Frozen audyt 24eb6a90 patientPointData: no source, gate, conversion or
    // unrelated profile may disappear behind the historical test adapter.
    expect(digest(beforeFshCaliperBundle(data)))
      .toBe('2eaff037ac45e7d38e56fc71e2ae29fb289c39f138663e44ffe7b441c2b1b1a8');
    const unchanged = beforeMaleAmhYoungAdultBundle(data).profiles
      .filter(item => !Object.values(ids).includes(item.id) && !madsenIds.includes(item.id));
    expect(unchanged).toHaveLength(76);
    expect(digest(unchanged)).toBe('ae81a49a305d1b966f6e45a21edc609ef590ef22d2715e448134179641281659');
  });

  it.each(['male', 'female'])('%s zachowuje wszystkie 181 węzłów i pochodzenie oryginalnych komórek', sex => {
    const current = profile(sex), series = source.series[sex];
    expect(current).toMatchObject({ id: ids[sex], sex, analyte: 'fsh', minAge: 16,
      maxAge: sex === 'male' ? 18 : 19, maxAgeExclusive: true,
      ordinaryOnly: true, statistic: 'median', unit: 'IU/L', interpolation: 'pchip', approximate: false,
      specimen: 'serum', compatibleSpecimenIds: ['serum', 'surowica'],
      compatibleAssayMethodIds: ['abbott-architect-ci2000-fsh'],
      provenance: { doi: '10.1515/cclm-2022-1077', pmid: '36639844',
        sourceWorksheet: sex === 'male' ? 'FSH_M' : 'FSH_F',
        sourceSha256: '997f4998e14dd38fb73a0ac9f14f01bbe5e1f40f3100bc4e2714e4764bfeda9b',
        sourceModel: { family: 'GAMLSS BCCG', responseScale: 'native FSH IU/L; no logarithmic back-transform' },
        sourceRouting: { version: policy.version } } });
    expect(current.points).toHaveLength(181);
    expect(current.points).toEqual(series.points.map(row => ({ ageYears: row.ageYears, value: row.centralConcentration })));
    expect(current.provenance.sourceCells).toEqual(series.points.map(row => row.sourceCells));
    expect(current.points[0].ageYears).toBe(1);
    expect(current.points.at(-1).ageYears).toBe(19);
    // Check all 362 source nodes with the production source evaluator. This
    // source-domain clone does not qualify patients outside the routed window.
    const fullSource = { ...current, minAge: 1, maxAge: 19, maxAgeExclusive: false };
    for (const row of series.points) {
      expect(engine.referenceAt(fullSource, row.ageYears)).toBe(row.centralConcentration);
      if (row.ageYears >= 16 && row.ageYears < current.maxAge) {
        expect(evaluate(sex, row.ageYears)).toMatchObject({ status: 'ready', referenceValue: row.centralConcentration,
          profile: { id: ids[sex] } });
      }
    }
    expect(current.provenance).not.toHaveProperty('lowerLimitOfQuantification');
    expect(source.assay.lowerLimitOfQuantification).toBeNull();
    expect(current).not.toHaveProperty('requiredGonadalStage');
  });

  it.each(['male', 'female'])('%s odtwarza niezależne wartości 16/17/18 i nie myli M z dokładnym p50', sex => {
    for (const [age, median] of checks[sex]) {
      const fullSource = { ...profile(sex), maxAge: 19, maxAgeExclusive: false };
      expect(engine.referenceAt(fullSource, age)).toBeCloseTo(median, 12);
      if (age < profile(sex).maxAge) expect(evaluate(sex, age).referenceValue).toBeCloseTo(median, 12);
    }
    if (sex === 'female') {
      const row = source.series.female.points.find(item => item.ageYears === 18);
      expect(row).toMatchObject({ M: 4.31597753250857, L: .91284698240628, S: .569223653183357 });
      expect(evaluate(sex, 18).referenceValue - row.M).toBeCloseTo(.083670151847385, 12);
    }
  });

  it.each(['male', 'female'])('%s interpoluje pomiędzy wszystkimi węzłami, bez obcinania siatki i ekstrapolacji', sex => {
    const current = profile(sex);
    for (let i = 150; i < (sex === 'male' ? 170 : 180); i++) {
      const left = current.points[i], right = current.points[i + 1];
      for (const part of [.125, .5, .875]) {
        const age = left.ageYears + (right.ageYears - left.ageYears) * part;
        const result = evaluate(sex, age);
        expect(result).toMatchObject({ status: 'ready', profile: { id: ids[sex] } });
        expect(result.referenceValue).toBeGreaterThan(Math.min(left.value, right.value));
        expect(result.referenceValue).toBeLessThan(Math.max(left.value, right.value));
      }
    }
    for (const age of [0, 1, 15.999999, current.maxAge, current.maxAge + .001, 20]) {
      expect(engine.referenceAt(current, age)).toBeNull();
    }
  });

  it('przełącza zwykłe źródło dokładnie w wieku 16, zachowuje dorosłych mężczyzn od 18 i nie rozszerza kobiet do 19', () => {
    for (const sex of ['male', 'female']) {
      expect(evaluate(sex, 15.999999).profile.id).toBe(sex === 'male' ? 'madsen2022-male-fsh' : 'madsen2022-female-fsh-age-6-16');
      expect(evaluate(sex, 16).profile.id).toBe(ids[sex]);
      expect(evaluate(sex, 17.999999).profile.id).toBe(ids[sex]);
    }
    expect(evaluate('male', 18)).toMatchObject({ status: 'ready', referenceValue: 3,
      profile: { id: 'laurentino2020-male-fsh-18-under25', statistic: 'group-mean' } });
    expect(evaluate('female', 18.999999).profile.id).toBe(ids.female);
    expect(evaluate('female', 19)).toEqual(unavailable('unsupported-age'));
    expect(evaluate('male', 16.001, { analyte: 'lh' })).toMatchObject({ status: 'ready',
      profile: { id: 'wilson2023-male-lh-age-over16-under18' } });
    expect(evaluate('female', 16.001, { analyte: 'lh' })).toEqual(unavailable('unsupported-age'));
  });

  it.each(['male', 'female'])('%s respektuje cały niepewny wiek oraz półotwarte granice źródeł', sex => {
    const end = profile(sex).maxAge;
    expect(evaluate(sex, 15, { ageUpperYears: 16, ageUpperInclusive: false }).status).toBe('ready');
    expect(evaluate(sex, 15, { ageUpperYears: 16, ageUpperInclusive: true })).toEqual(unavailable('ambiguous-age'));
    expect(evaluate(sex, 15.999, { ageUpperYears: 16.001, ageUpperInclusive: false })).toEqual(unavailable('ambiguous-age'));
    expect(evaluate(sex, end - 1, { ageUpperYears: end, ageUpperInclusive: false }).profile.id).toBe(ids[sex]);
    expect(evaluate(sex, end - 1, { ageUpperYears: end, ageUpperInclusive: true })).toEqual(unavailable('ambiguous-age'));
    expect(evaluate(sex, end - .001, { ageUpperYears: end + .001, ageUpperInclusive: false })).toEqual(unavailable('ambiguous-age'));
    const age = ageEngine.resolveAge({ age: { years: 16, months: 0, precision: 'month' } });
    expect(age.status).toBe('known');
    expect(evaluate(sex, age.lowerYears, { ageUpperYears: age.upperYears,
      ageUpperInclusive: age.upperInclusive })).toMatchObject({ status: 'ready', profile: { id: ids[sex] } });
  });

  it.each(['male', 'female'])('%s akceptuje tylko jawną zgodną metodę, nieznaną pozostawia nieznaną i nie stosuje fallbacku', sex => {
    for (const assayMethodId of [undefined, '', 'unknown', 'abbott-architect-ci2000-fsh']) {
      expect(evaluate(sex, 17, { assayMethodId }).status).toBe('ready');
    }
    for (const assayMethodId of ['abbott-architect-i1000', 'architect', 'abbott-architect-ci2000',
      'immulite-2000-xpi', 'roche-cobas-e411-fsh', 'autodelfia-fsh']) {
      expect(evaluate(sex, 17, { assayMethodId })).toEqual(unavailable('incompatible-assay'));
    }
    for (const specimen of [undefined, '', 'unknown', 'serum', 'surowica']) {
      expect(evaluate(sex, 17, { specimen }).status).toBe('ready');
    }
    for (const specimen of ['plasma', 'lithium-heparin-plasma', 'saliva']) {
      expect(evaluate(sex, 17, { specimen })).toEqual(unavailable('incompatible-specimen'));
    }
    // The matching CALIPER assay cannot leak into the neighboring source.
    expect(evaluate(sex, 15, { assayMethodId: 'abbott-architect-ci2000-fsh' })).toEqual(unavailable('incompatible-assay'));
    expect(evaluate('male', 18, { assayMethodId: 'abbott-architect-ci2000-fsh' })).toEqual(unavailable('incompatible-assay'));
  });

  it.each(['male', 'female'])('%s zachowuje wyłączenia i nie wymaga nowego Tannera ani fazy cyklu', sex => {
    const baseline = evaluate(sex, 17);
    for (const puberty of [undefined, null, {}, { kind: sex === 'male' ? 'G' : 'Th', stage: 1 },
      { kind: sex === 'male' ? 'G' : 'Th', stage: 5 }]) {
      for (const cyclePhase of [undefined, '', 'unknown', 'follicular', 'ovulation', 'luteal']) {
        expect(evaluate(sex, 17, { puberty, cyclePhase }).referenceValue).toBe(baseline.referenceValue);
      }
    }
    expect(evaluate(sex, 17, { contraindicated: true })).toEqual(unavailable('contraindicated'));
    for (const cyclePhase of ['pregnancy', 'pregnancy_t1', 'pregnancy_t2', 'pregnancy_t3']) {
      expect(evaluate(sex, 17, { cyclePhase })).toEqual(unavailable('incompatible-reproductive-context'));
    }
    for (const key of ['classification', 'percentile', 'sds', 'referenceInterval', 'tannerStage', 'clinicalCutoff']) {
      expect(baseline).not.toHaveProperty(key);
      expect(baseline.profile).not.toHaveProperty(key);
    }
  });

  it.each(['male', 'female'])('%s zachowuje wynik, jednostkę i medianę niezależnie od wysokości, bez imputacji nierówności', sex => {
    const expected = checks[sex][1][1];
    for (const value of [0, .001, 2, 1000]) {
      for (const unit of ['IU/L', 'mIU/mL']) {
        expect(evaluate(sex, 17, { measurement: { value, unit } })).toMatchObject({ status: 'ready', value,
          referenceValue: expected, profile: { id: ids[sex] } });
      }
    }
    for (const operator of ['<', '<=', '>', '>=']) {
      expect(evaluate(sex, 17, { measurement: { value: 2, unit: 'IU/L', operator } })).toEqual(unavailable('censored-result'));
    }
    expect(evaluate(sex, 17, { measurement: { value: 2, unit: 'pg/mL' } })).toEqual(unavailable('unsupported-unit'));
  });

  it('zachowuje osobne Madsen przy dokładnym 16 w porównaniu płci i nie zmienia geometrii ani skali', () => {
    const prior = { ...beforeFshCaliperRuntime(runtime), patientPointData: beforeFshCaliperBundle(data) };
    const comparison = display.buildGonadotropinComparison(runtime, engine, 'puberty', 'fsh');
    const oldComparison = display.buildGonadotropinComparison(prior, engine, 'puberty', 'fsh');
    expect(runtime.gonadotropinComparisonPolicy.retainSourceEndpointProfileIds).toEqual(['madsen2022-male-fsh']);
    expect(comparison.curves).toEqual(oldComparison.curves);
    expect(comparison.scale).toEqual(oldComparison.scale);
    expect(comparison.domain).toEqual(oldComparison.domain);
    for (const sex of ['male', 'female']) {
      const id = comparison.profileIds[sex];
      const current = engine.evaluate(comparison.referenceData, { analyte: 'fsh', sex, ageYears: 16,
        measurement: { value: 2, unit: 'IU/L' } });
      const previous = engine.evaluate(oldComparison.referenceData, { analyte: 'fsh', sex, ageYears: 16,
        measurement: { value: 2, unit: 'IU/L' } });
      expect(current).toMatchObject({ status: 'ready', referenceValue: previous.referenceValue, profile: { id } });
      expect(current.referenceValue).not.toBe(evaluate(sex, 16).referenceValue);
    }
    const male = display.buildMaleFsh(runtime, engine), oldMale = display.buildMaleFsh(prior, engine);
    for (const key of ['points', 'divisor', 'ceiling', 'transitions', 'tangentOverrides', 'illustrativeIntervals']) {
      expect(male[key]).toEqual(oldMale[key]);
    }
    expect(JSON.stringify(display.buildFemaleGonadotropins(runtime)))
      .toBe(JSON.stringify(display.buildFemaleGonadotropins(prior)));
  });

  it('domyślnie dopuszcza brak polityki zachowania końca, lecz odrzuca jej błędny typ lub identyfikatory', () => {
    // Old bundles with inclusive source endpoints remain supported without
    // the new optional field. Missing policy never relaxes a source boundary.
    const prior = { ...beforeFshCaliperRuntime(runtime), patientPointData: beforeFshCaliperBundle(data) };
    expect(prior.gonadotropinComparisonPolicy).not.toHaveProperty('retainSourceEndpointProfileIds');
    expect(display.buildGonadotropinComparison(prior, engine, 'puberty', 'fsh')).not.toBeNull();
    const omitted = { ...runtime, gonadotropinComparisonPolicy: { ...runtime.gonadotropinComparisonPolicy,
      retainSourceEndpointProfileIds: undefined } };
    expect(display.buildGonadotropinComparison(omitted, engine, 'puberty', 'lh')).not.toBeNull();
    expect(display.buildGonadotropinComparison(omitted, engine, 'puberty', 'fsh')).toBeNull();
    for (const retained of [false, 0, '', null, 'madsen2022-male-fsh',
      ['unknown-profile'], ['wilson2023-male-fsh-age-16-18'],
      ['madsen2022-male-fsh', 'madsen2022-male-fsh']]) {
      const invalid = { ...runtime, gonadotropinComparisonPolicy: { ...runtime.gonadotropinComparisonPolicy,
        retainSourceEndpointProfileIds: retained } };
      expect(display.buildGonadotropinComparison(invalid, engine, 'puberty', 'fsh')).toBeNull();
      expect(display.buildGonadotropinComparison(invalid, engine, 'puberty', 'lh')).toBeNull();
    }
  });

  it('zachowanie końca porównania wymaga opublikowanego węzła przy dokładnej granicy, bez ekstrapolacji', () => {
    for (const change of [
      original => ({ ...original, points: original.points.filter(point => point.ageYears !== 16) }),
      original => ({ ...original, maxAge: 15.9 }),
      original => ({ ...original, maxAge: 16.1 }),
    ]) {
      const invalid = { ...runtime, patientPointData: { ...data,
        profiles: data.profiles.map(original => original.id === 'madsen2022-male-fsh' ? change(original) : original) } };
      expect(display.buildGonadotropinComparison(invalid, engine, 'puberty', 'fsh')).toBeNull();
    }
    expect(data.profiles.find(original => original.id === 'madsen2022-male-fsh'))
      .toMatchObject({ maxAge: 16, maxAgeExclusive: true });
  });
});
