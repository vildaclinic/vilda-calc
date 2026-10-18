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
const data = runtime.patientPointData;
const read = name => JSON.parse(readFileSync(new URL(
  `../../docs/clinical/hormone-lifespan/${name}`, import.meta.url), 'utf8'));
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const context = (ageYears, extra = {}) => ({ analyte: 'amh', sex: 'female', ageYears,
  measurement: { value: .45, unit: 'ng/mL' }, ...extra });
const evaluate = (ageYears, extra) => engine.evaluate(data, context(ageYears, extra));
const unavailable = reason => ({ status: 'unavailable', reason });
// Independent transcription of FDA K170524, PDF page 14 (internal page 10):
// serum medians, not the plasma values used in the illustrative lifespan line.
const groups = [
  { age: 18, end: 26, median: 25.7, sourceNgMl: 3.60, n: 120,
    id: 'fda2017-female-amh-age-18-under26', label: '18–25 lat' },
  { age: 26, end: 31, median: 27.27, sourceNgMl: 3.82, n: 131,
    id: 'fda2017-female-amh-age-26-under31', label: '26–30 lat' },
  { age: 31, end: 36, median: 17.64, sourceNgMl: 2.47, n: 120,
    id: 'fda2017-female-amh-age-31-under36', label: '31–35 lat' },
  { age: 36, end: 41, median: 12.21, sourceNgMl: 1.71, n: 123,
    id: 'fda2017-female-amh-age-36-under41', label: '36–40 lat' },
  { age: 41, end: 46, median: 3.86, sourceNgMl: .54, n: 126,
    id: 'fda2017-female-amh-age-41-under46', label: '41–45 lat' },
];
const addedIds = groups.map(group => group.id);
const excludedPhases = ['pregnancy_t1', 'pregnancy_t2', 'pregnancy_t3', 'postmenopause'];

describe('AMH dorosłych kobiet — pięć surowiczych median grup FDA/Access', () => {
  it('dodaje dokładnie pięć profili, zachowując 68 pozostałych wcześniejszych profili i konwersje', () => {
    expect(data.profiles).toHaveLength(81);
    expect(data.profiles.filter(profile => addedIds.includes(profile.id)).map(profile => profile.id)).toEqual(addedIds);
    const original = { ...priorFemaleGonadotropinBundle(data), version: '2026-10-13.3',
      profiles: priorFemaleGonadotropinBundle(data).profiles.filter(profile => !addedIds.includes(profile.id) &&
        profile.id !== 'borelli2025-female-inhb-age-5p6-47' && !laterChildhoodIds.includes(profile.id)) };
    expect(original.profiles).toHaveLength(68);
    // The later female inhibin extension has its own contract; preserve all other source data.
    expect(digest(original)).toBe('1255289b15e0b5fa26136fe7271300ebc75309459be70a40792df002bc32f52f');
    expect(data).toEqual(read('population-reference-data.json'));
  });

  it('nie zmienia danych krzywych, skal ani oddzielnych porównań płci', () => {
    expect(digest(withoutFemaleGonadotropinReferencePolicy(runtime)))
      .toBe('380884eb2367b1c48f52d580ee3d3898441d5b204bd979e3b7a12fe8321baa3d');
  });

  it.each(groups)('odtwarza stałą medianę całej grupy $label, niezależnie od dokładnego wieku', group => {
    for (const age of [group.age, (group.age + group.end) / 2, group.end - 1e-7]) {
      const result = evaluate(age);
      expect(result).toMatchObject({ status: 'ready', referenceValue: group.median,
        profile: { id: group.id, analyte: 'amh', sex: 'female', unit: 'pmol/L',
          statistic: 'group-median', interpolation: 'constant', ordinaryOnly: true,
          minAge: group.age, maxAge: group.end, maxAgeExclusive: true,
          specimen: 'serum', ageGroup: { label: group.label, n: group.n } } });
      expect(result.profile.excludedCyclePhases).toEqual(excludedPhases);
      expect(result.profile.url).toBe('https://www.accessdata.fda.gov/cdrh_docs/pdf17/K170524.pdf');
      expect(result.profile.method).toContain('Access');
      expect(engine.sampleProfile(result.profile, 13).every(point => point.value === group.median)).toBe(true);
      expect(engine.referenceAt(result.profile, group.age - 1e-7)).toBeNull();
      expect(engine.referenceAt(result.profile, group.end)).toBeNull();
      // Both source columns are independently rounded. The converter retains
      // its existing factor instead of fitting a new factor to each group.
      expect(result.referenceValue * .1401).toBeCloseTo(group.sourceNgMl, 2);
      for (const key of ['classification', 'percentile', 'sds', 'referenceInterval', 'clinicalCutoff']) {
        expect(result).not.toHaveProperty(key);
        expect(result.profile).not.toHaveProperty(key);
      }
    }
  });

  it('zachowuje pierwszeństwo Jopling poniżej 18 lat i nie ekstrapoluje po 45 ukończonych latach', () => {
    expect(evaluate(17.999999)).toMatchObject({ status: 'ready', referenceValue: 21.14,
      profile: { id: 'jopling2018-female-amh-age-15-under18' } });
    for (let index = 0; index < groups.length; index++) {
      const group = groups[index];
      expect(evaluate(group.age)).toMatchObject({ status: 'ready', referenceValue: group.median,
        profile: { id: group.id } });
      if (index > 0) expect(evaluate(group.age - 1e-7).profile.id).toBe(groups[index - 1].id);
    }
    for (const age of [46, 46.001, 50, 75, 120]) {
      expect(evaluate(age)).toEqual(unavailable('unsupported-age'));
    }
    // A reported incompatible specimen cannot activate a different age source.
    expect(evaluate(17, { specimen: 'serum' })).toEqual(unavailable('incompatible-specimen'));
    expect(evaluate(18, { specimen: 'lithium-heparin-plasma' })).toEqual(unavailable('incompatible-specimen'));
  });

  it.each(groups)('kwalifikuje pełny przedział niepewności wieku grupy $label', group => {
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
    expect(evaluate(group.age, { ageUpperYears: group.age - 1 }))
      .toEqual(unavailable('ambiguous-age'));
  });

  it('stosuje rzeczywisty resolver ukończonych lat i miesięcy także dla 45 lat 11 miesięcy', () => {
    for (const group of groups) {
      for (const age of [
        { years: group.age, precision: 'year' },
        { years: group.end - 1, precision: 'year' },
        { years: group.end - 1, months: 11, precision: 'month' },
      ]) {
        const resolved = ageEngine.resolveAge({ age });
        expect(resolved.status).toBe('known');
        expect(evaluate(resolved.lowerYears, { ageUpperYears: resolved.upperYears,
          ageUpperInclusive: resolved.upperInclusive })).toMatchObject({
          status: 'ready', referenceValue: group.median, profile: { id: group.id },
        });
      }
    }
    expect(evaluate(17.9, { ageUpperYears: 18.1, ageUpperInclusive: false }))
      .toEqual(unavailable('ambiguous-age'));
  });

  it.each(groups)('odrzuca znaną ciążę i menopauzę, nie zgadując kontekstu grupy $label', group => {
    for (const cyclePhase of excludedPhases.flatMap(phase => [phase, `  ${phase.toUpperCase()}  `])) {
      expect(evaluate(group.age, { cyclePhase })).toEqual(unavailable('incompatible-reproductive-context'));
    }
    for (const cyclePhase of [undefined, null, '', 'unknown', 'follicular', 'ovulation', 'luteal', 'unrecognized', false, {}]) {
      expect(evaluate(group.age, { cyclePhase })).toMatchObject({ status: 'ready', referenceValue: group.median });
    }
    expect(evaluate(group.age, { contraindicated: true, cyclePhase: 'follicular' }))
      .toEqual(unavailable('contraindicated'));
    expect(evaluate(group.age, { contraindicated: true, cyclePhase: 'pregnancy_t1' }))
      .toEqual(unavailable('contraindicated'));
  });

  it('bramka kontekstu pochodzi wyłącznie z profilu; późniejsza polityka Jopling wyłącza tylko znaną ciążę', () => {
    const priorFemale = evaluate(15);
    const priorMale = evaluate(25, { sex: 'male' });
    for (const cyclePhase of excludedPhases) {
      expect(evaluate(15, { cyclePhase })).toEqual(cyclePhase === 'postmenopause'
        ? priorFemale : unavailable('incompatible-reproductive-context'));
      expect(evaluate(25, { sex: 'male', cyclePhase })).toEqual(priorMale);
    }
    const profile = data.profiles.find(candidate => candidate.id === groups[0].id);
    // The engine contains no hardcoded list of reproductive states.
    const customData = { ...data, profiles: [{ ...profile, excludedCyclePhases: ['fictional-exclusion'] }] };
    expect(engine.evaluate(customData, context(20, { cyclePhase: 'fictional-exclusion' })))
      .toEqual(unavailable('incompatible-reproductive-context'));
    expect(engine.evaluate(customData, context(20, { cyclePhase: 'pregnancy_t1' })).status).toBe('ready');
  });

  it.each(groups)('nie utożsamia serum z osoczem ani Access z inną metodą: $label', group => {
    for (const specimen of [undefined, null, '', 'unknown', 'serum', 'surowica', ' SERUM ']) {
      for (const assayMethodId of [undefined, null, '', 'unknown', 'access-amh', 'beckman-access-amh',
        'access-2', 'beckman-access-2', ' ACCESS-2 ']) {
        const result = evaluate(group.age, { specimen, assayMethodId });
        expect(result.status).toBe('ready');
        expect(result).not.toHaveProperty('methodConfirmed');
      }
    }
    for (const specimen of ['plasma', 'lithium-heparin-plasma', 'plasma_li_heparin', 'edta-plasma', 'whole-blood']) {
      expect(evaluate(group.age, { specimen })).toEqual(unavailable('incompatible-specimen'));
    }
    for (const assayMethodId of ['roche-elecsys', 'amh-gen-ii', 'amh-gen-ii-modified', 'immulite-2000', 'unmatched']) {
      expect(evaluate(group.age, { assayMethodId })).toEqual(unavailable('incompatible-assay'));
    }
  });

  it.each(groups)('zachowuje istniejące jednostki i bramki wyniku bez wpływu na wybór grupy: $label', group => {
    for (const value of [0, .0001, .45, 5, 1e12]) {
      const result = evaluate(group.age, { measurement: { value, unit: 'ng/mL' } });
      expect(result).toMatchObject({ status: 'ready', referenceValue: group.median, profile: { id: group.id } });
      for (const unit of ['ng/mL', 'μg/L', 'ug/L']) {
        expect(evaluate(group.age, { measurement: { value, unit } }).value).toBe(result.value);
      }
      expect(evaluate(group.age, { measurement: { value: value / .1401, unit: 'pmol/L' } }).value)
        .toBeCloseTo(result.value, 8);
    }
    for (const value of [-1, NaN, Infinity, '0.45']) {
      expect(evaluate(group.age, { measurement: { value, unit: 'ng/mL' } })).toEqual(unavailable('invalid-value'));
    }
    for (const operator of ['<', '>', '<=', '>=', '≤', '≥', '~']) {
      expect(evaluate(group.age, { measurement: { value: .45, unit: 'ng/mL', operator } }))
        .toEqual(unavailable('censored-result'));
    }
    for (const operator of [undefined, null, '', '=']) {
      expect(evaluate(group.age, { measurement: { value: .45, unit: 'ng/mL', operator } }).status).toBe('ready');
    }
    expect(evaluate(group.age, { measurement: null })).toEqual(unavailable('invalid-value'));
    expect(evaluate(group.age, { measurement: { value: .45, unit: 'pg/mL' } }))
      .toEqual(unavailable('unsupported-unit'));
  });

  it('nie wymaga stadium Tannera ani danych okołoporodowych dorosłej pacjentki', () => {
    for (const group of groups) {
      for (const preterm of [undefined, 'unknown', 'no', 'yes']) {
        for (const puberty of [undefined, { kind: 'Th', stage: 1 }, { kind: 'Th', stage: 5 }]) {
          expect(evaluate(group.age, { preterm, puberty })).toMatchObject({ status: 'ready', referenceValue: group.median });
        }
      }
    }
    for (const age of [undefined, null, NaN, -1]) expect(evaluate(age)).toEqual(unavailable('missing-age'));
    expect(evaluate(25, { sex: 'unknown' })).toEqual(unavailable('unsupported-sex'));
  });
});
