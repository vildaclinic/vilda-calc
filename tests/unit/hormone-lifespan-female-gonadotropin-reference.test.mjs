import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { beforeAmhPregnancyPolicy, beforeFshCaliperBundle, priorFemaleGonadotropinBundle } from '../support/prior-female-gonadotropin-bundle.mjs';

const require = createRequire(import.meta.url);
const runtime = require('../../vilda_hormone_lifespan_data.js');
const engine = require('../../vilda_hormone_lifespan_reference.js');
const ageEngine = require('../../vilda_lab_puberty.js');
const data = runtime.patientPointData;
const read = name => JSON.parse(readFileSync(new URL(
  `../../docs/clinical/hormone-lifespan/${name}`, import.meta.url), 'utf8'));
const source = JSON.parse(readFileSync(new URL(
  '../fixtures/hormone-lifespan-gonadotropin-source-medians.json', import.meta.url), 'utf8'));
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const policy = read('female-gonadotropin-reference-policy.json');
const newIds = ['madsen2022-female-lh-age-6-16', 'madsen2022-female-fsh-age-6-16'];
const changedIds = [...newIds, 'zec2012-female-fsh-age-4-8', 'zec2012-female-fsh-age-8-11'];
const context = (analyte, ageYears, extra = {}) => ({ analyte, ageYears, sex: 'female',
  measurement: { value: 2, unit: 'IU/L', operator: '=' }, ...extra });
const evaluate = (analyte, ageYears, extra) => engine.evaluate(data, context(analyte, ageYears, extra));
const unavailable = reason => ({ status: 'unavailable', reason });

describe('Zwykłe żeńskie LH/FSH — jawna polityka wieku Madsen i Zec poniżej 6 lat', () => {
  it('zmienia wyłącznie dwa profile Zec i dodaje dwa osobne profile Madsen, zachowując 74 pozostałe', () => {
    expect(data.profiles).toHaveLength(85);
    expect(data.version).toBe('2026-10-22.1');
    const unchanged = beforeFshCaliperBundle(data).profiles.filter(p => !changedIds.includes(p.id) &&
      p.id !== 'madsen2022-female-e2-age-6-18').map(beforeAmhPregnancyPolicy);
    expect(unchanged).toHaveLength(74);
    // Independently computed from audyt 28aaa185, excluding precisely the two
    // approved Zec changes and restoring only the later, separately tested AMH policy.
    expect(digest(unchanged)).toBe('0261e122f72fead0a48e2f2ab6833a799bd24814b416fe4bac91c0a70fc897b2');
    expect(digest(priorFemaleGonadotropinBundle(data)))
      .toBe('aef4c62968a915c03f169befe253135c13b1538b307a9daa5e03f729e7932885');
    expect(runtime.femaleGonadotropinReferencePolicy).toEqual(policy);
    expect(policy).toMatchObject({ ordinaryOnly: true, kind: 'educational-source-selection',
      version: '2026-10-16.1', sex: 'female', analytes: ['lh', 'fsh'], unit: 'IU/L' });
    expect(policy.profiles.map(p => p.id)).toEqual(newIds);
    expect(data.profiles.some(p => p.id === 'zec2012-female-fsh-age-8-11')).toBe(false);
    expect(read('evidence/patient-point/zec2012-fsh-group-medians.json').rows.find(p =>
      p.sex === 'female' && p.minAge === 8)).toMatchObject({ maxAge: 11, medianIuL: 1.55, participants: 107 });
  });

  it('odtwarza wszystkie 22 niezależnie odczytane mediany i nie zmienia osobnych profili porównania płci', () => {
    const rows = source.puberty.filter(p => p.sex === 'female');
    expect(rows).toHaveLength(22);
    expect(digest(runtime.gonadotropinComparisonReferenceData))
      .toBe('2448ca0d3bb78a0601145f96cd956eb6e7fd7c7a8b39ef2c89b69b9d0d5e57e7');
    for (const analyte of ['lh', 'fsh']) {
      const id = `madsen2022-female-${analyte}-age-6-16`;
      const profile = data.profiles.find(p => p.id === id);
      const comparison = runtime.gonadotropinComparisonReferenceData.profiles.find(p => p.analyte === analyte);
      expect(profile).toMatchObject({ id, analyte, sex: 'female', minAge: 6, maxAge: 16,
        maxAgeExclusive: analyte === 'fsh', ordinaryOnly: true, unit: 'IU/L', statistic: 'median',
        interpolation: 'pchip', approximate: false,
        method: 'Siemens IMMULITE 2000 XPi',
        provenance: { sourceSha256: source.sources.madsen2022.supplementSha256,
          sourceWorksheet: 'Other biomarkers', lowerLimitOfQuantification: .1,
          sourceRouting: { version: policy.version } } });
      expect(profile).not.toHaveProperty('requiredGonadalStage');
      expect(profile.points).toEqual(comparison.points);
      expect(profile.provenance.sourceCells).toHaveLength(11);
      expect(comparison.id).not.toBe(id);
      expect(data.profiles.some(p => p.id === comparison.id)).toBe(false);
      for (const row of rows.filter(p => p.analyte === analyte)) {
        // Source endpoint 16 remains in the unchanged source table, while the
        // later ordinary FSH policy intentionally switches to CALIPER at 16.
        expect(engine.referenceAt(comparison, row.ageYears)).toBe(row.median);
        expect(engine.referenceAt(profile, row.ageYears)).toBe(analyte === 'fsh' && row.ageYears === 16 ? null : row.median);
        if (analyte !== 'fsh' || row.ageYears < 16) {
          expect(evaluate(analyte, row.ageYears)).toMatchObject({ status: 'ready',
            referenceValue: row.median, profile: { id } });
        }
      }
      for (let age = 6; age < 16; age += .0625) {
        expect(engine.referenceAt(profile, age)).toBe(engine.referenceAt(comparison, age));
      }
    }
  });

  it.each(['lh', 'fsh'])('%s nie wymaga Th ani nie zmienia mediany po uzupełnieniu cechy pokwitania', analyte => {
    for (const ageYears of [6, 8, 9, 11, 12, 16]) {
      const baseline = evaluate(analyte, ageYears);
      expect(baseline.status).toBe('ready');
      for (const puberty of [null, {}, { kind: 'Th', stage: 1 }, { kind: 'Th', stage: 2 },
        { kind: 'Th', stage: 5 }, { kind: 'P', stage: 1 }]) {
        expect(evaluate(analyte, ageYears, { puberty }).referenceValue).toBe(baseline.referenceValue);
        expect(evaluate(analyte, ageYears, { puberty }).profile.id).toBe(baseline.profile.id);
      }
    }
    for (const key of ['classification', 'percentile', 'sds', 'referenceInterval', 'tannerStage']) {
      expect(evaluate(analyte, 12)).not.toHaveProperty(key);
    }
  });

  it('zachowuje całą grupę Zec 4–<8, N156 i medianę 1,07 przy węższym zastosowaniu 4–<6', () => {
    for (const ageYears of [4, 5, 5.999999]) {
      expect(evaluate('fsh', ageYears, { puberty: { kind: 'Th', stage: 1 } }))
        .toMatchObject({ status: 'ready', referenceValue: 1.07, profile: {
          id: 'zec2012-female-fsh-age-4-8', minAge: 4, maxAge: 6, maxAgeExclusive: true,
          requiredGonadalStage: 1, statistic: 'group-median', interpolation: 'constant',
          ageGroup: { label: '4–<8 lat', minAge: 4, maxAge: 8, n: 156, sourceMedian: 1.07 } } });
      expect(evaluate('fsh', ageYears)).toEqual(unavailable('missing-puberty-stage'));
      expect(evaluate('fsh', ageYears, { puberty: { kind: 'Th', stage: 2 } }))
        .toEqual(unavailable('incompatible-puberty-stage'));
    }
    expect(evaluate('fsh', 6, { puberty: { kind: 'Th', stage: 1 } }))
      .toMatchObject({ status: 'ready', referenceValue: .9328995961019171,
        profile: { id: newIds[1] } });
    expect(evaluate('fsh', 9, { puberty: { kind: 'Th', stage: 1 } }).referenceValue)
      .toBe(1.964770298470689);
    expect(evaluate('lh', 5)).toEqual(unavailable('unsupported-age'));
  });

  it.each(['lh', 'fsh'])('%s obejmuje tylko cały dostępny wiek bez ekstrapolacji źródła Madsen', analyte => {
    expect(evaluate(analyte, 16).status).toBe('ready');
    expect(evaluate(analyte, 15, { ageUpperYears: 16, ageUpperInclusive: false }).status).toBe('ready');
    for (const ageYears of analyte === 'lh' ? [16.000001, 17, 18, 20] : [19, 20]) {
      expect(evaluate(analyte, ageYears)).toEqual(unavailable('unsupported-age'));
    }
    for (const [ageYears, ageUpperYears] of [[5.99, 6.01], [15.99, 16.01]]) {
      const result = evaluate(analyte, ageYears, { ageUpperYears,
        ageUpperInclusive: false, puberty: { kind: 'Th', stage: 1 } });
      expect(result.status).toBe('unavailable');
    }
    const age = ageEngine.resolveAge({ age: { years: 16, months: 0, precision: 'month' } });
    expect(age.status).toBe('known');
    const reported = evaluate(analyte, age.lowerYears, { ageUpperYears: age.upperYears,
      ageUpperInclusive: age.upperInclusive });
    if (analyte === 'lh') expect(reported).toEqual(unavailable('ambiguous-age'));
    else expect(reported).toMatchObject({ status: 'ready',
      profile: { id: 'wilson2023-female-fsh-age-16-19' } });
    expect(evaluate('fsh', 5, { ageUpperYears: 6, ageUpperInclusive: false,
      puberty: { kind: 'Th', stage: 1 } }).referenceValue).toBe(1.07);
    expect(evaluate('fsh', 5, { ageUpperYears: 6, ageUpperInclusive: true,
      puberty: { kind: 'Th', stage: 1 } })).toEqual(unavailable('ambiguous-age'));
  });

  it.each(['lh', 'fsh'])('%s zachowuje metodę, materiał, leczenie i brak zastępczego źródła', analyte => {
    for (const assayMethodId of [undefined, 'unknown', 'immulite-2000-xpi', 'siemens-immulite-2000-xpi']) {
      expect(evaluate(analyte, 9, { assayMethodId }).status).toBe('ready');
    }
    for (const assayMethodId of ['roche-cobas-e411-fsh', 'roche-cobas-e-411-fsh', 'autodelfia']) {
      expect(evaluate(analyte, 9, { assayMethodId, puberty: { kind: 'Th', stage: 1 } }))
        .toEqual(unavailable('incompatible-assay'));
    }
    expect(evaluate(analyte, 9, { contraindicated: true })).toEqual(unavailable('contraindicated'));
    expect(evaluate(analyte, 9, { specimen: 'plasma' })).toEqual(unavailable('incompatible-specimen'));
    expect(evaluate(analyte, 9, { specimen: 'serum' }).status).toBe('ready');
    expect(evaluate(analyte, 9, { specimen: 'unknown' }).status).toBe('ready');
    expect(evaluate(analyte, 9, { preterm: 'yes' }).status).toBe('ready');
    // Below six, incompatible IMMULITE cannot silently switch Zec to Madsen.
    expect(evaluate('fsh', 5, { assayMethodId: 'immulite-2000-xpi', puberty: { kind: 'Th', stage: 1 } }))
      .toEqual(unavailable('incompatible-assay'));
  });

  it.each(['lh', 'fsh'])('%s zachowuje rzeczywisty wynik i jednostki bez doboru źródła według wartości', analyte => {
    const median = analyte === 'lh' ? .932808521560225 : 4.151220353235434;
    for (const value of [0, .001, 2, 1000]) {
      for (const unit of ['IU/L', 'mIU/mL']) {
        expect(evaluate(analyte, 12, { measurement: { value, unit } }))
          .toMatchObject({ status: 'ready', value, referenceValue: median,
            profile: { id: `madsen2022-female-${analyte}-age-6-16` } });
      }
    }
    expect(evaluate(analyte, 12, { measurement: { value: .1, unit: 'IU/L', operator: '<' } }))
      .toEqual(unavailable('censored-result'));
    expect(evaluate(analyte, 12, { measurement: { value: 2, unit: 'pg/mL' } }))
      .toEqual(unavailable('unsupported-unit'));
  });
});
