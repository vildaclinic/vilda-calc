import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { priorFemaleGonadotropinBundle, withoutFemaleGonadotropinReferencePolicy } from '../support/prior-female-gonadotropin-bundle.mjs';

const require = createRequire(import.meta.url);
const laterChildhoodIds = ['zhou2025-female-inhb-age-over1-under5', 'zhou2025-female-inhb-age-5-under5p6'];
const runtime = require('../../vilda_hormone_lifespan_data.js');
const engine = require('../../vilda_hormone_lifespan_reference.js');
const display = require('../../vilda_hormone_lifespan_display.js');
const read = name => JSON.parse(readFileSync(new URL(
  `../../docs/clinical/hormone-lifespan/${name}`, import.meta.url), 'utf8'));
const policy = read('male-amh-reference-policy.json');
const data = runtime.patientPointData;
const newIds = policy.profiles.map(p => p.id);
const laterFemaleIds = read('female-adult-amh-reference-policy.json').profiles.map(p => p.id);
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const context = (ageYears, extra = {}) => ({ analyte: 'amh', sex: 'male', ageYears,
  measurement: { value: 5, unit: 'ng/mL' }, ...extra });
const evaluate = (ageYears, extra) => engine.evaluate(data, context(ageYears, extra));
const unavailable = reason => ({ status: 'unavailable', reason });
// Independent transcription of Table 1, not expectations read from policy/data.
const groups = [
  { age: 12, end: 13, median: 64.66, ngMl: 9.058866, n: 36,
    id: 'jopling2018-male-amh-age-12-under13', label: '12–14,9 lat', sourceEnd: 14.9 },
  { age: 15, end: 18, median: 55.61, ngMl: 7.790961, n: 48,
    id: 'jopling2018-male-amh-age-15-under18', label: '15–18,9 lat', sourceEnd: 18.9 },
  { age: 20, end: 30, median: 43.8, ngMl: 6.13638, n: null,
    id: 'benderradji2022-male-amh-age-20-under30', label: '20–39 lat', sourceEnd: 39 }
];

describe('Męskie AMH — źródłowe mediany w lukach wieku, niezależne od ilustracji', () => {
  it('dodaje tylko trzy rozłączne profile, zachowując 65 pozostałych wcześniejszych profili i przeliczenia', () => {
    expect(newIds).toEqual(groups.map(g => g.id));
    expect(data.profiles).toHaveLength(84);
    expect(laterFemaleIds).toHaveLength(5);
    // The later extension of the one ordinary female inhibin profile is tested separately.
    const revisedInhibinId = 'borelli2025-female-inhb-age-5p6-47';
    const original = { ...priorFemaleGonadotropinBundle(data), version: '2026-10-13.2',
      profiles: priorFemaleGonadotropinBundle(data).profiles.filter(p => !newIds.includes(p.id) && !laterFemaleIds.includes(p.id) && p.id !== revisedInhibinId && !laterChildhoodIds.includes(p.id)) };
    expect(original.profiles).toHaveLength(65);
    expect(digest(original)).toBe('455d2c037c96cad243db41d852a62348b6e12e615540ddc351a8499ae48d0f85');
    expect(data).toEqual(read('population-reference-data.json'));
    expect(policy).toMatchObject({ kind: 'educational-source-selection', ordinaryOnly: true });
    expect(priorFemaleGonadotropinBundle(data).profiles.filter(p => p.sex === 'male' && p.ordinaryOnly).map(p => p.id)).toEqual(newIds);
  });

  it('zachowuje cały pozostały runtime i dokładnie tę samą źródłową geometrię męskiego AMH', () => {
    expect(digest(withoutFemaleGonadotropinReferencePolicy(runtime)))
      .toBe('380884eb2367b1c48f52d580ee3d3898441d5b204bd979e3b7a12fe8321baa3d');
    const illustration = display.buildMaleAmh(runtime, engine);
    expect(digest(illustration)).toBe('cbd1e9d72a4d993ac52e1d3050f31573f678131c14205154ea18a34bd2e96c1c');
    expect(illustration.profiles).toHaveLength(15);
    expect(illustration.sourceIds.some(id => newIds.includes(id))).toBe(false);
    expect(illustration).toMatchObject({ divisor: 1335.592934, ceiling: 1.25 });
  });

  it.each(groups)('odtwarza medianę całej grupy $label bez interpolacji lub zmiany grupy na $age–<$end', group => {
    for (const age of [group.age, (group.age + group.end) / 2, group.end - 1e-7]) {
      const result = evaluate(age);
      expect(result).toMatchObject({ status: 'ready', referenceValue: group.median,
        profile: { id: group.id, statistic: 'group-median', interpolation: 'constant',
          approximate: false, ordinaryOnly: true, maxAgeExclusive: true,
          minAge: group.age, maxAge: group.end,
          ageGroup: { label: group.label, n: group.n, minAge: group.age,
            maxAge: group.sourceEnd, sourceMedian: group.median, sourceUnit: 'pmol/L' },
          provenance: { table: 1, sourceToCanonicalFactor: 1, groupParticipants: group.n } } });
      expect(result.referenceValue * .1401).toBeCloseTo(group.ngMl, 12);
      expect(engine.sampleProfile(result.profile, 11).every(p => p.value === group.median)).toBe(true);
      expect(engine.referenceAt(result.profile, group.age - 1e-7)).toBeNull();
      expect(engine.referenceAt(result.profile, group.end)).toBeNull();
      for (const key of ['classification', 'percentile', 'sds', 'referenceInterval', 'clinicalCutoff']) {
        expect(result).not.toHaveProperty(key);
        expect(result.profile).not.toHaveProperty(key);
      }
    }
  });

  it('nie przypisuje liczebności całego badania dorosłej grupie ani niskiej LOQ rozcieńczonym próbkom', () => {
    const adult = evaluate(25).profile;
    expect(adult.provenance).toMatchObject({ participants: 578, groupParticipants: null,
      initialSelected: 607, excludedAmhOutliers: 29,
      sourceQuantification: { loqPmolPerL: .47, lod: null } });
    expect(adult.ageGroup.n).toBeNull();
    const child = evaluate(12).profile;
    expect(child.provenance).toMatchObject({ participants: 469, groupParticipants: 36,
      sourceSpecimen: 'lithium-heparin plasma' });
    expect(child.method).toContain('1:10');
    expect(child).not.toHaveProperty('minimumPatientValue');
    expect(adult).not.toHaveProperty('minimumPatientValue');
  });

  it('wybiera źródło na granicach bez nakładania ani fallbacku metody, także po późniejszym uzupełnieniu 18–<20', () => {
    const expected = [
      [11.999, 'wang2020-male-amh-age-11'], [12, groups[0].id], [12.999, groups[0].id],
      [13, 'wang2020-male-amh-age-13'], [14.999, 'wang2020-male-amh-age-14'],
      [15, groups[1].id], [17.999, groups[1].id],
      [18, 'woloszynek2015-male-amh-age-18-20'], [18.9, 'woloszynek2015-male-amh-age-18-20'],
      [19, 'woloszynek2015-male-amh-age-18-20'], [19.999, 'woloszynek2015-male-amh-age-18-20'],
      [20, groups[2].id], [29.999, groups[2].id],
      [30, 'tehrani2017-male-amh'], [70, 'tehrani2017-male-amh']
    ];
    for (const [age, id] of expected) expect(evaluate(age)).toMatchObject({ status: 'ready', profile: { id } });
    for (const age of [0, 6 / 365.25, 70.001]) {
      expect(evaluate(age)).toEqual(unavailable('unsupported-age'));
    }
    // At age 13, do not silently replace Wang serum with overlapping Jopling plasma.
    expect(evaluate(13, { specimen: 'lithium-heparin-plasma' })).toEqual(unavailable('incompatible-specimen'));
    expect(evaluate(30, { assayMethodId: 'dxi-access-amh' })).toEqual(unavailable('incompatible-assay'));
  });

  it.each(groups)('sprawdza cały przedział wieku dla grupy $label', group => {
    expect(evaluate(group.age, { ageUpperYears: group.end, ageUpperInclusive: false }))
      .toMatchObject({ status: 'ready', referenceValue: group.median });
    expect(evaluate(group.end - 1 / 12, { ageUpperYears: group.end, ageUpperInclusive: false }))
      .toMatchObject({ status: 'ready', referenceValue: group.median });
    for (const ageUpperInclusive of [undefined, true]) {
      expect(evaluate(group.age, { ageUpperYears: group.end, ageUpperInclusive }))
        .toEqual(unavailable('ambiguous-age'));
    }
    expect(evaluate(group.age, { ageUpperYears: group.end + .001, ageUpperInclusive: false }))
      .toEqual(unavailable('ambiguous-age'));
    expect(evaluate(group.age, { ageUpperYears: group.age - 1 })).toEqual(unavailable('ambiguous-age'));
  });

  it('nie zgaduje stadium ani donoszenia u nastolatków i dorosłych; zachowuje źródła żeńskie', () => {
    for (const group of groups) {
      for (const preterm of ['unknown', 'yes', 'no', null]) {
        for (const puberty of [null, { kind: 'G', stage: 1 }, { kind: 'G', stage: 5 }]) {
          const result = evaluate(group.age, { preterm, puberty });
          expect(result).toMatchObject({ status: 'ready', referenceValue: group.median });
          expect(result.profile).not.toHaveProperty('requiredGonadalStage');
          expect(result.profile.termOnly).not.toBe(true);
        }
      }
    }
    expect(evaluate(12, { sex: 'female' }).referenceValue).toBe(17.87);
    expect(evaluate(15, { sex: 'female' }).referenceValue).toBe(21.14);
    expect(evaluate(25, { sex: 'female' })).toMatchObject({ status: 'ready', referenceValue: 25.7,
      profile: { id: 'fda2017-female-amh-age-18-under26' } });
  });

  it.each(groups)('zachowuje blokady i jednostki oraz wybór niezależny od wartości wyniku: $label', group => {
    for (const value of [0, .0001, 5, 1e12]) {
      const result = evaluate(group.age, { measurement: { value, unit: 'ng/mL' } });
      expect(result).toMatchObject({ status: 'ready', referenceValue: group.median, profile: { id: group.id } });
      for (const unit of ['ng/mL', 'μg/L', 'ug/L']) {
        expect(evaluate(group.age, { measurement: { value, unit } }).value).toBe(result.value);
      }
      expect(evaluate(group.age, { measurement: { value: value / .1401, unit: 'pmol/L' } }).value)
        .toBeCloseTo(result.value, 8);
    }
    for (const operator of ['<', '>', '<=', '>=', '≤', '≥', '~']) {
      expect(evaluate(group.age, { measurement: { value: 5, unit: 'ng/mL', operator } }))
        .toEqual(unavailable('censored-result'));
    }
    expect(evaluate(group.age, { contraindicated: true })).toEqual(unavailable('contraindicated'));
    expect(evaluate(group.age, { measurement: null })).toEqual(unavailable('invalid-value'));
    expect(evaluate(group.age, { measurement: { value: 5, unit: 'pg/mL' } })).toEqual(unavailable('unsupported-unit'));
    for (const assayMethodId of ['roche-elecsys', 'amh-gen-ii-modified', 'unmatched']) {
      expect(evaluate(group.age, { assayMethodId })).toEqual(unavailable('incompatible-assay'));
    }
    for (const unknown of [undefined, null, '', 'unknown']) {
      const result = evaluate(group.age, { specimen: unknown, assayMethodId: unknown });
      expect(result.status).toBe('ready');
      expect(result).not.toHaveProperty('methodConfirmed');
    }
    const route = policy.profiles.find(p => p.id === group.id);
    for (const specimen of route.compatibleSpecimenIds) {
      for (const assayMethodId of route.compatibleAssayMethodIds) {
        expect(evaluate(group.age, { specimen, assayMethodId }).status).toBe('ready');
      }
    }
    for (const specimen of (group.age < 18 ? ['serum', 'surowica', 'plasma', 'edta-plasma'] : ['plasma', 'lithium-heparin-plasma'])) {
      expect(evaluate(group.age, { specimen })).toEqual(unavailable('incompatible-specimen'));
    }
    if (group.age >= 20) {
      for (const assayMethodId of ['access-2', 'beckman-access-2', 'access-amh']) {
        expect(evaluate(group.age, { assayMethodId })).toEqual(unavailable('incompatible-assay'));
      }
    }
  });
});
