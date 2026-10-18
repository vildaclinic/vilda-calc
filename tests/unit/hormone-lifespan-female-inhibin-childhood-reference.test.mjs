import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { priorFemaleGonadotropinBundle, withoutFemaleGonadotropinReferencePolicy } from '../support/prior-female-gonadotropin-bundle.mjs';

const require = createRequire(import.meta.url);
const runtime = require('../../vilda_hormone_lifespan_data.js');
const engine = require('../../vilda_hormone_lifespan_reference.js');
const ageEngine = require('../../vilda_lab_puberty.js');
const display = require('../../vilda_hormone_lifespan_display.js');
const data = runtime.patientPointData;
const read = name => JSON.parse(readFileSync(new URL(
  `../../docs/clinical/hormone-lifespan/${name}`, import.meta.url), 'utf8'));
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const policy = read('female-inhibin-childhood-reference-policy.json');
const source = read('evidence/patient-point/zhou2025-female-inhb-childhood-groups.json');
const context = (ageYears, extra = {}) => ({ analyte: 'inhb', sex: 'female', ageYears,
  measurement: { value: 33, unit: 'pg/mL' }, ...extra });
const evaluate = (ageYears, extra) => engine.evaluate(data, context(ageYears, extra));
const unavailable = reason => ({ status: 'unavailable', reason });
// Independent transcription: Zhou 2025 Table 1 N and Tables 2/3 central values.
// Complete source groups remain distinct from the narrower application domains.
const groups = [
  { id: 'zhou2025-female-inhb-age-over1-under5', minAge: 1, maxAge: 5, minAgeExclusive: true,
    sourceLabel: '1–5 lat', sourceMaxAge: 5, n: 60, median: 33, ci90: [30, 39] },
  { id: 'zhou2025-female-inhb-age-5-under5p6', minAge: 5, maxAge: 5.6, minAgeExclusive: false,
    sourceLabel: '5–10 lat', sourceMaxAge: 10, n: 77, median: 27, ci90: [24, 29] },
];
const addedIds = groups.map(group => group.id);
const methods = ['kangran-kaeser-1000-inhibin-b-clia', 'kaeser-1000-inhibin-b-clia'];

function evaluateReportedAge(input, extra) {
  const resolved = ageEngine.resolveAge({ age: input });
  expect(resolved.status).toBe('known');
  return evaluate(resolved.lowerYears, { ageUpperYears: resolved.upperYears,
    ageUpperInclusive: resolved.upperInclusive, ...extra });
}

describe('Inhibina B młodszych dziewczynek — źródłowe mediany grup Zhou 2025', () => {
  it('dodaje tylko dwa profile i zachowuje wszystkie 74 wcześniejsze profile, przeliczenia oraz pozostały runtime', () => {
    expect(data.profiles).toHaveLength(82);
    expect(data.version).toBe('2026-10-18.3');
    const previous = { ...priorFemaleGonadotropinBundle(data), version: '2026-10-14.1',
      profiles: priorFemaleGonadotropinBundle(data).profiles.filter(profile => !addedIds.includes(profile.id)) };
    expect(previous.profiles).toHaveLength(74);
    // Complete patientPointData of approved c8b91078, before either addition.
    expect(digest(previous)).toBe('0da33105e49f57889794bed9bee9459169e08e950916a9ad6769ddc86ee2fca6');
    expect(digest(previous.profiles)).toBe('09ae5949ce7481965a462ce9047e6124643237c87c19dafba9684bbe79f0ae5a');
    expect(digest(withoutFemaleGonadotropinReferencePolicy(runtime)))
      .toBe('380884eb2367b1c48f52d580ee3d3898441d5b204bd979e3b7a12fe8321baa3d');
    expect(data).toEqual(read('population-reference-data.json'));
    expect(data.profiles.filter(profile => addedIds.includes(profile.id)).map(profile => profile.id)).toEqual(addedIds);
    expect(policy.profiles.map(profile => profile.id)).toEqual(addedIds);
  });

  it.each(groups)('zachowuje pełną grupę $sourceLabel i stałą medianę $median pg/mL bez modelu dokładnego wieku', group => {
    const ages = [group.minAge + .000001, (group.minAge + group.maxAge) / 2, group.maxAge - .000001];
    if (!group.minAgeExclusive) ages.push(group.minAge);
    for (const age of ages) {
      const result = evaluate(age);
      expect(result).toMatchObject({ status: 'ready', referenceValue: group.median,
        profile: { id: group.id, analyte: 'inhb', sex: 'female', minAge: group.minAge, maxAge: group.maxAge,
          minAgeExclusive: group.minAgeExclusive, maxAgeExclusive: true,
          ordinaryOnly: true, statistic: 'group-median', interpolation: 'constant', approximate: false,
          specimen: 'serum', unit: 'pg/mL', ageGroup: { label: group.sourceLabel,
            minAge: group.minAge, maxAge: group.sourceMaxAge, n: group.n,
            sourceMedian: group.median, sourceUnit: 'pg/mL', sourceMedianCi90: group.ci90 },
          provenance: { doi: '10.1038/s41598-025-85551-9', participants: 622, femaleParticipants: 302,
            groupParticipants: group.n, sourceToCanonicalFactor: 1, routingVersion: '2026-10-14.2' } } });
      expect(result.profile.patientNote).toBe(`Grupa ${group.sourceLabel} · Chiny · KAESER 1000 CLIA.`);
      expect(result.profile.ageGroup.description).toContain('nie dokładnego wieku ani stadium Tannera');
      expect(result.profile.ageGroup.description).toContain('Metoda CLIA nie została zharmonizowana z Gen II ELISA');
      expect(result.profile.provenance.ageRouting).toContain('konwencją aplikacji, nie definicją autora');
      expect(result.profile.method).toContain('Kangran');
      expect(result.profile.method).toContain('KAESER 1000');
      const samples = engine.sampleProfile(result.profile, 17);
      expect(samples).toHaveLength(17);
      expect(samples.every(sample => sample.value === group.median)).toBe(true);
      expect(engine.referenceAt(result.profile, group.maxAge)).toBeNull();
      for (const key of ['classification', 'percentile', 'sds', 'referenceInterval', 'clinicalCutoff', 'requiredGonadalStage']) {
        expect(result).not.toHaveProperty(key);
        expect(result.profile).not.toHaveProperty(key);
      }
    }
  });

  it('źródłowe CI i LOD pozostają metadanymi; nie stają się normą, imputacją lub współczynnikiem modelu', () => {
    expect(source).toMatchObject({ sex: 'female', unit: 'pg/mL', statistic: 'group-median', matrix: 'serum',
      participants: 622, femaleParticipants: 302, maleParticipants: 320 });
    expect(source.source).toMatchObject({
      sourceSha256: 'a2b6e2ffa607540673e99a61ad1ebb3bcab1e844ab8b4fde595bcbc3127d1510',
      sourceQuantification: { lodPgMl: 7, totalCvPercent: [4.34, 9.73], belowLodCountsForSelectedGroups: null },
      sourceLocator: { sampleCounts: { table: 1, pdfPage: 3 }, medians: { table: 2, pdfPage: 3 },
        medianConfidenceIntervals: { table: 3, pdfPage: 6 } },
    });
    expect(source.groups.map(row => [row.n, row.median, row.medianConfirmation.table2, row.medianConfirmation.table3]))
      .toEqual([[60, 33, 33, 33], [77, 27, 27, 27]]);
    for (const age of [3, 5.25]) {
      const profile = evaluate(age).profile;
      expect(profile).not.toHaveProperty('minimumPatientValue');
      expect(profile).not.toHaveProperty('lms');
      expect(profile).not.toHaveProperty('cubicCoefficients');
      expect(profile.provenance.sourceQuantification.belowLodHandling).toContain('not applied to patient values');
    }
  });

  it('zachowuje niemowlęcy koniec 1 roku, konwencję dokładnych 5 lat i początek Borelli 5,6 bez nakładania', () => {
    expect(evaluate(1, { preterm: 'no' })).toMatchObject({ status: 'ready',
      profile: { id: 'ljubicic2022-female-inhb' } });
    expect(evaluate(1 + 1e-8)).toMatchObject({ status: 'ready', referenceValue: 33, profile: { id: groups[0].id } });
    expect(evaluate(5 - 1e-8)).toMatchObject({ status: 'ready', referenceValue: 33, profile: { id: groups[0].id } });
    expect(evaluate(5)).toMatchObject({ status: 'ready', referenceValue: 27, profile: { id: groups[1].id } });
    expect(evaluate(5.6 - 1e-8)).toMatchObject({ status: 'ready', referenceValue: 27, profile: { id: groups[1].id } });
    expect(evaluate(5.6)).toMatchObject({ status: 'ready', referenceValue: 11,
      profile: { id: 'borelli2025-female-inhb-age-5p6-47' } });
    const first = data.profiles.find(profile => profile.id === groups[0].id);
    expect(engine.referenceAt(first, 1)).toBeNull();
    expect(engine.sampleProfile(first, 3)[0].ageYears).toBeGreaterThan(1);
    // Different methods may not silently select an alternative age source.
    expect(evaluate(5.6, { assayMethodId: methods[0] })).toEqual(unavailable('incompatible-assay'));
    expect(evaluate(5.59, { assayMethodId: 'inhibin-b-gen-ii' })).toEqual(unavailable('incompatible-assay'));
  });

  it('kwalifikuje cały przedział wieku i nie wybiera korzystniejszej mediany przy przekroczeniu granicy', () => {
    for (const [low, high, median] of [[1.01, 2, 33], [2, 3, 33], [4, 5, 33], [5, 5.6, 27]]) {
      expect(evaluate(low, { ageUpperYears: high, ageUpperInclusive: false })).toMatchObject({ status: 'ready', referenceValue: median });
    }
    for (const [low, high] of [[1, 1.01], [4, 5], [4.99, 5.01], [5, 5.6], [5.59, 5.61]]) {
      expect(evaluate(low, { ageUpperYears: high, ageUpperInclusive: true, preterm: 'no' }))
        .toEqual(unavailable('ambiguous-age'));
    }
    expect(evaluate(3, { ageUpperYears: 2 })).toEqual(unavailable('ambiguous-age'));
  });

  it('wykorzystuje rzeczywisty resolver lat i miesięcy bez udawania dokładnej daty urodzenia', () => {
    for (const years of [2, 3, 4]) {
      expect(evaluateReportedAge({ years, precision: 'year' })).toMatchObject({ status: 'ready', referenceValue: 33 });
      expect(evaluateReportedAge({ years, months: 0, precision: 'month' })).toMatchObject({ status: 'ready', referenceValue: 33 });
    }
    expect(evaluateReportedAge({ years: 1, months: 1, precision: 'month' })).toMatchObject({ status: 'ready', referenceValue: 33 });
    expect(evaluateReportedAge({ years: 5, months: 3, precision: 'month' })).toMatchObject({ status: 'ready', referenceValue: 27 });
    expect(evaluateReportedAge({ years: 5, months: 8, precision: 'month' })).toMatchObject({ status: 'ready',
      profile: { id: 'borelli2025-female-inhb-age-5p6-47' } });
    for (const input of [{ years: 1, precision: 'year' }, { years: 1, months: 0, precision: 'month' },
      { years: 5, precision: 'year' }, { years: 5, months: 7, precision: 'month' }]) {
      expect(evaluateReportedAge(input, { preterm: 'no' })).toEqual(unavailable('ambiguous-age'));
    }
  });

  it.each(groups)('materiał i metoda $sourceLabel nie są zgadywane i nie są harmonizowane z Gen II lub Oxford', group => {
    const age = (group.minAge + group.maxAge) / 2;
    for (const specimen of [undefined, null, '', 'unknown', 'serum', 'surowica', ' SERUM ']) {
      for (const assayMethodId of [undefined, null, '', 'unknown', ...methods, methods[0].toUpperCase()]) {
        const result = evaluate(age, { specimen, assayMethodId });
        expect(result.status).toBe('ready');
        expect(result).not.toHaveProperty('methodConfirmed');
      }
    }
    for (const specimen of ['plasma', 'osocze', 'lithium-heparin-plasma', 'whole-blood', 'saliva']) {
      expect(evaluate(age, { specimen })).toEqual(unavailable('incompatible-specimen'));
    }
    for (const assayMethodId of ['inhibin-b-gen-ii', 'beckman-inhibin-b-gen-ii', 'oxford-bioinnovation',
      'inhibin-b-oxford', 'clia', 'elisa', 'kaeser-1000', 'access-amh']) {
      expect(evaluate(age, { assayMethodId })).toEqual(unavailable('incompatible-assay'));
    }
  });

  it('wiek wybiera grupę niezależnie od wyniku i jednostki; nie nadaje nowej oceny normy', () => {
    for (const [age, median] of [[3, 33], [5.25, 27]]) {
      for (const value of [0, .001, 7, 33, 73, 1000, 1e12]) {
        for (const unit of ['pg/mL', 'ng/L']) {
          const result = evaluate(age, { measurement: { value, unit } });
          expect(result).toMatchObject({ status: 'ready', value, referenceValue: median });
          expect(result).not.toHaveProperty('classification');
        }
      }
      expect(evaluate(age, { measurement: { value: 33, unit: 'ng/mL' } })).toEqual(unavailable('unsupported-unit'));
    }
  });

  it('zachowuje blokady leczenia i wyniku cenzurowanego, bez imputacji LOD lub fikcyjnego zera', () => {
    for (const age of [3, 5.25]) {
      expect(evaluate(age, { contraindicated: true })).toEqual(unavailable('contraindicated'));
      for (const operator of ['<', '<=', '≤', '>', '>=', '≥', '~']) {
        expect(evaluate(age, { measurement: { value: 7, unit: 'pg/mL', operator } }))
          .toEqual(unavailable('censored-result'));
      }
      for (const operator of [undefined, null, '', '=']) {
        expect(evaluate(age, { measurement: { value: 7, unit: 'pg/mL', operator } }).value).toBe(7);
      }
      for (const value of [-1, NaN, Infinity, '33', null]) {
        expect(evaluate(age, { measurement: { value, unit: 'pg/mL' } })).toEqual(unavailable('invalid-value'));
      }
      expect(evaluate(age, { measurement: null })).toEqual(unavailable('invalid-value'));
    }
  });

  it('nie żąda stadium Tannera ani danych wcześniactwa poza zakresem źródła niemowlęcego', () => {
    for (const age of [3, 5.25]) {
      for (const preterm of [undefined, 'unknown', 'no', 'yes']) {
        for (const puberty of [undefined, { kind: 'Th', stage: 1 }, { kind: 'Th', stage: 2 }, { kind: 'Th', stage: 5 }]) {
          expect(evaluate(age, { preterm, puberty }).status).toBe('ready');
        }
      }
    }
    expect(evaluate(.25, { preterm: 'unknown' })).toEqual(unavailable('preterm-context'));
    for (const age of [undefined, null, NaN, -1]) expect(evaluate(age)).toEqual(unavailable('missing-age'));
    expect(evaluate(3, { sex: 'unknown' })).toEqual(unavailable('unsupported-sex'));
    expect(evaluate(3, { sex: 'male' })).toMatchObject({ status: 'ready', profile: { id: 'kelsey2016-male-inhb' } });
  });

  it('osobne porównania płci zachowują krzywe i profile; żaden z nowych profili nie zostaje źródłem porównania', () => {
    const curveHashes = { mini: 'c7682fa147fc033dec2a3319d00fccdb80909eec337ad70ccc71f8baf30e1266',
      puberty: '15665b0c11fcb75c64921ab219a69ebd3dfb56c98312268c91e2d5bf0eb5e071' };
    for (const period of ['mini', 'puberty']) {
      const model = display.buildInhibinComparison(runtime, engine, period);
      expect(digest(model.curves)).toBe(curveHashes[period]);
      expect(Object.values(model.profileIds).some(id => addedIds.includes(id))).toBe(false);
      expect(model.domain.minAge).toBe(period === 'mini' ? .02 : 8);
      expect(model.domain.maxAge).toBe(period === 'mini' ? 1 : 20);
    }
  });

  it('F3/33 zachowuje osobny zakres Labcorp <73 zamiast nowego progu równego medianie 33', () => {
    const lab = require('../../vilda_lab_inhibin_b.js');
    const labData = require('../../vilda_lab_inhibin_b_data.js');
    for (const [value, status] of [[33, 'within'], [50, 'within'], [80, 'above']]) {
      const labResult = lab.evaluate({ analyte: 'inhibin_b', sex: 'F', age: { years: 3, months: 0, precision: 'month' },
        value, unit: 'pg/mL', referenceSelection: 'automatic' }, labData);
      expect(labResult.referencePreview.byAge).toMatchObject({ status, range: {
        id: 'labcorp-f-under-6', profileId: 'labcorp-inhibin-b-children',
        bounds: { lower: null, upper: { operator: '<', value: 73 } },
      } });
      expect(evaluate(3, { measurement: { value, unit: 'pg/mL' } })).toMatchObject({ status: 'ready', referenceValue: 33 });
    }
  });
});
