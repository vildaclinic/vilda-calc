import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const display = require('../../vilda_hormone_lifespan_display.js');
const engine = require('../../vilda_hormone_lifespan_reference.js');
const data = require('../../vilda_hormone_lifespan_data.js');
const freeze = value => {
  if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); }
  return value;
};
const patient = (ageYears, value = 1) => ({ analyte: 'insl3', sex: 'male', ageYears,
  preterm: 'no', measurement: { value, unit: 'ng/mL' } });

describe('Approved male INSL3 illustration — no numerical patient reference', () => {
  it('packages the readable unitless policy and exposes no clinical reference', () => {
    expect(data.insl3DisplayPolicy).toEqual(JSON.parse(readFileSync(
      new URL('../../docs/clinical/hormone-lifespan/insl3-display-policy.json', import.meta.url), 'utf8')));
    const result = display.buildMaleInsl3(data);
    expect(result).toMatchObject({ id: 'insl3', kind: 'educational-display-only', unit: null,
      divisor: 1, ceiling: 1, profiles: [], sourceIds: [] });
    expect(result.policy.patientPointAvailable).toBe(false);
    expect(result.policy.numericTooltipsAvailable).toBe(false);
    expect(result.policy.presentation.hormoneCopy).toContain('pierwszych tygodniach');
    for (const key of ['referenceValue', 'classification', 'percentile']) expect(result).not.toHaveProperty(key);
    // This constructor has no dependency on the numerical source engine.
    expect(display.buildMaleInsl3({ insl3DisplayPolicy: data.insl3DisplayPolicy, maleStages: data.maleStages }))
      .toEqual(result);
  });

  it('reproduces all approved mockup coordinates, not a newly fitted curve', () => {
    const result = display.buildMaleInsl3(data);
    expect(result.points).toHaveLength(5186);
    const digest = createHash('sha256').update(JSON.stringify(result.points.map(p => [p.ageYears, p.value]))).digest('hex');
    // Golden fingerprint from the owner-approved corrected preview, before
    // implementation. Its provenance is recorded separately in the policy.
    expect(digest).toBe('a58271a9052705e13ddac54fa1aed95fe76a4beeed0d4ef842b60586f187ea6e');
  });

  it('preserves a small infant wave at day27 with a higher birth level than the old drawing', () => {
    const points = display.buildMaleInsl3(data).points.filter(p => p.ageYears >= 0 && p.ageYears <= 1);
    const peak = points.reduce((best, point) => point.value > best.value ? point : best);
    expect(peak.ageYears * 365.25).toBeCloseTo(27, 12);
    expect(peak.value).toBe(.14);
    expect(points[0]).toEqual({ ageYears: 0, value: .109158 });
    const rising = points.filter(p => p.ageYears <= peak.ageYears);
    const falling = points.filter(p => p.ageYears >= peak.ageYears);
    expect(rising.every((point, i) => !i || point.value >= rising[i - 1].value - 1e-12)).toBe(true);
    expect(falling.every((point, i) => !i || point.value <= falling[i - 1].value + 1e-12)).toBe(true);
    expect(points.at(-1).value).toBeCloseTo(.012, 8);
  });

  it('keeps a chronological nonnegative line, adult decline and purely illustrative senior tail', () => {
    const points = display.buildMaleInsl3(data).points;
    expect(points[0].ageYears).toBe(-.75);
    expect(points.at(-1).ageYears).toBeCloseTo(90, 12);
    expect(points.every((point, index) => Number.isFinite(point.ageYears) && Number.isFinite(point.value) &&
      point.value >= 0 && point.value <= 1 && (!index || point.ageYears > points[index - 1].ageYears))).toBe(true);
    const adult = points.filter(p => p.ageYears >= 25 - 1e-12);
    expect(adult[0].value).toBe(.87);
    expect(adult.every((point, i) => !i || point.value <= adult[i - 1].value + 1e-12)).toBe(true);
    expect(points.filter(p => p.ageYears >= 80).every(p => p.value === .455)).toBe(true);
    expect(display.buildMaleInsl3(data).illustrativeIntervals)
      .toContainEqual({ minAge: 80, maxAge: 90, kind: 'older-age-tail' });
  });

  it('does not alter the curve or scale for a patient, view or extreme result', () => {
    const baseline = display.buildMaleInsl3(data);
    for (const context of [patient(27 / 365.25, .1), patient(1), patient(44, 1e300), patient(90, 0)]) {
      for (const view of ['life', 'mini', 'puberty'])
        expect(display.buildMaleInsl3({ ...data, patientContext: context, view })).toEqual(baseline);
    }
  });

  it('preserves existing numerical source behavior without turning the illustration into new coverage', () => {
    const sourceBefore = JSON.stringify(data.patientPointData);
    const results = [27 / 365.25, .25, 1, 12, 44, 80].map(age => engine.evaluate(data, patient(age)));
    display.buildMaleInsl3(data);
    expect(JSON.stringify(data.patientPointData)).toBe(sourceBefore);
    expect([27 / 365.25, .25, 1, 12, 44, 80].map(age => engine.evaluate(data, patient(age)))).toEqual(results);
    expect(data.patientPointData.profiles.filter(profile => profile.analyte === 'insl3')).toHaveLength(1);
    expect(results[0].profile.id).toBe('busch2022-male-insl3');
    for (const result of results.slice(2)) expect(result.status).toBe('unavailable');
  });

  it('reads frozen data and leaves other hormone illustrations unchanged', () => {
    const frozen = freeze(structuredClone(data)), before = JSON.stringify(frozen);
    const builders = ['buildMaleInhibin', 'buildMaleTestosterone', 'buildMaleAmh', 'buildMaleGonadotropins'];
    const otherModels = builders.map(name => display[name](frozen, engine));
    expect(display.buildMaleInsl3(frozen)).not.toBeNull();
    expect(JSON.stringify(frozen)).toBe(before);
    expect(builders.map(name => display[name](frozen, engine))).toEqual(otherModels);
  });

  it('fails closed for absent, unsafe or malformed optional drawing data', () => {
    expect(display.buildMaleInsl3(null)).toBeNull();
    expect(display.buildMaleInsl3({ ...data, insl3DisplayPolicy: null })).toBeNull();
    for (const modify of [
      d => { d.insl3DisplayPolicy.unit = 'ng/mL'; },
      d => { delete d.insl3DisplayPolicy.presentation; },
      d => { d.insl3DisplayPolicy.presentation.hormoneCopy = ''; },
      d => { d.insl3DisplayPolicy.patientPointAvailable = true; },
      d => { d.insl3DisplayPolicy.scale.divisor = 2; },
      d => { d.insl3DisplayPolicy.sourceProfileIds.push('invented-reference'); },
      d => { d.insl3DisplayPolicy.infancy.anchors[2].ageYears = 0; },
      d => { d.insl3DisplayPolicy.infancy.anchors[3].relative = -.1; },
      d => { d.insl3DisplayPolicy.infancy.sampleCount = 1e9; },
      d => { d.insl3DisplayPolicy.infancy.tangentOverrides[0].slope = 1e9; },
      d => { d.insl3DisplayPolicy.adult.x[1] = d.insl3DisplayPolicy.adult.x[3]; },
      d => { d.insl3DisplayPolicy.olderAge.relative = Number.NaN; },
      d => { d.maleStages[1].width = 0; }
    ]) {
      const invalid = structuredClone(data); modify(invalid);
      expect(display.buildMaleInsl3(invalid)).toBeNull();
    }
  });
});
