import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const reader = require('../../vilda_insl3_age_source.js');
const runtime = require('../../vilda_hormone_lifespan_data.js');
const json = name => JSON.parse(readFileSync(new URL(
  `../../docs/clinical/hormone-lifespan/${name}`, import.meta.url), 'utf8'));
const data = json('insl3-age-source-data.json');
const policy = json('insl3-age-source-policy.json');
const sourceCode = readFileSync(new URL('../../vilda_insl3_age_source.js', import.meta.url), 'utf8');
const context = (ageYears, extra = {}) => ({ sourceStatus: 'ready', sex: 'male', ageYears,
  ageUpperYears: ageYears, ageUpperInclusive: true, contextBasis: 'current-form', ...extra });
const read = (ageYears, extra = {}) => reader.read(data, policy, context(ageYears, extra));
const insideDomain = age => policy.allowedAgeDomains.some(([low, high]) => age >= low && age <= high);
const freeze = value => {
  if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); }
  return value;
};

describe('INSL3 — direct educational age-source reading, without clinical activation', () => {
  it('exports the same actual read function through CommonJS and window', () => {
    const sandbox = { window: {}, module: { exports: {} } };
    vm.runInNewContext(sourceCode, sandbox);
    expect(typeof reader.read).toBe('function');
    expect(sandbox.window.VildaInsl3AgeSource).toBe(sandbox.module.exports);
    expect(sandbox.window.VildaInsl3AgeSource.read(data, policy, context(25))).toEqual(read(25));
  });

  it('packages all approved 732 native points and 17 fragments verbatim', () => {
    expect(runtime.insl3AgeSourceData).toBeDefined();
    expect(runtime.insl3AgeSourcePolicy).toBeDefined();
    expect(runtime.insl3AgeSourceData).toEqual(data);
    expect(runtime.insl3AgeSourcePolicy).toEqual(policy);
    expect(data.segments).toHaveLength(17);
    expect(data.segments.reduce((n, segment) => n + segment.points.length, 0)).toBe(732);
    // Canonical arrays fingerprinted from the approved proposal before implementation;
    // the test has no dependency on workspace attachments or a particular JSON layout.
    const canonical = data.segments.map(segment => [segment.ageMin, segment.ageMax, segment.points]);
    expect(createHash('sha256').update(JSON.stringify(canonical)).digest('hex'))
      .toBe('afd5578032bb483bc24ac4847fefe35df81800705b59ed903a4f4f473a433860');
  });

  it('keeps the source and conservative routing policy separate and nonclinical', () => {
    expect(data).toMatchObject({ kind: 'digitized-age-source-data', clinicalActivation: false,
      source: { id: data.id, unit: 'ng/mL', limits: { lod: .03, loq: .15, unit: 'ng/mL' } } });
    expect(policy).toMatchObject({ kind: 'educational-age-source-reading', sourceId: data.id,
      clinicalActivation: false, sex: 'male', contextBasis: 'current-form',
      allowedAgeDomains: [[10, 27.6], [31.4, 60.9]], onlyDirectVisibleStroke: true,
      bridgesAllowed: false, loqCrossingBlocksModeledMedian: false,
      ageIntervalMustBeWhollyCovered: true, displayDecimalPlaces: 2 });
  });

  it('leaves every preceding runtime field identical to the approved audyt base', () => {
    const preceding = Object.fromEntries(Object.entries(runtime).filter(([key]) =>
      !['insl3AgeSourceData', 'insl3AgeSourcePolicy'].includes(key)));
    expect(createHash('sha256').update(JSON.stringify(preceding)).digest('hex'))
      .toBe('07f049f7661bda7997001cc3c7b595f5a9bde3baaf02cc4807ba46a4a54e2d87');
  });

  it('returns the source, population, statistic and versions with an age reading', () => {
    const result = read(40);
    expect(result).toMatchObject({ status: 'ready', kind: 'educational-age-source-reading',
      valueKind: 'approximate-value', sourceId: data.id, sourceVersion: data.version,
      policyVersion: policy.version, source: data.source, population: data.source.population,
      statistic: data.source.statistic, unit: 'ng/mL', ageLower: 40, ageUpper: 40,
      ageUpperInclusive: true, directOnly: true, clinicalActivation: false });
  });

  it('reads age12 as approximately0.18 and annotates LOQ crossing without blocking', () => {
    expect(read(12)).toMatchObject({ status: 'ready', valueKind: 'approximate-value',
      valueMin: .18, valueMax: .18, sourceLoqCrossing: true,
      sourceLodCrossing: false, clinicalActivation: false });
  });

  it.each([[25, 1.27], [40, 1.25]])('reads source age%s as approximately%s ng/mL', (age, value) => {
    expect(read(age)).toMatchObject({ status: 'ready', valueMin: value, valueMax: value });
  });

  it('keeps childhood, obscured puberty, documentation conflicts and old age unavailable', () => {
    for (const age of [10, 12.5, 18, 19, 30, 75]) expect(read(age).status).toBe('unavailable');
    expect(read(30).reason).toBe('age-domain-documentation-conflict');
    expect(read(75).reason).toBe('outside-proposed-age-domain');
  });

  it('preserves both closed policy domains without extrapolation at their ends', () => {
    for (const age of [27.6, 31.4, 60.9]) expect(read(age).status).toBe('ready');
    for (const age of [9.999999, 27.600001, 31.399999, 60.900001])
      expect(read(age).status).toBe('unavailable');
    expect(read(27.5, { ageUpperYears: 27.6, ageUpperInclusive: false }).status).toBe('ready');
    expect(read(27.5, { ageUpperYears: 31.4 }).status).toBe('unavailable');
    expect(read(60.9, { ageUpperYears: 61, ageUpperInclusive: false }).status).toBe('unavailable');
    // An interval crossing an outer domain edge is not the paper's internal
    // age-description discrepancy between the young and older cohorts.
    for (const [age, upper] of [[9, 11], [60, 61]])
      expect(read(age, { ageUpperYears: upper, ageUpperInclusive: false }).reason)
        .toBe('outside-proposed-age-domain');
  });

  it('uses every readable fragment, including exact source endpoints, within policy', () => {
    for (const segment of data.segments) {
      for (const point of [segment.points[0], segment.points.at(-1)]) {
        const result = read(point[0]);
        expect(result.status).toBe(insideDomain(point[0]) ? 'ready' : 'unavailable');
        if (result.status === 'ready') {
          expect(result.valueMin).toBe(Number(point[1].toFixed(2)));
          expect(result.valueMax).toBe(Number(point[1].toFixed(2)));
        }
      }
      const domain = policy.allowedAgeDomains.find(([low, high]) => low <= segment.ageMax && high >= segment.ageMin);
      const lower = Math.max(segment.ageMin, domain[0]), upper = Math.min(segment.ageMax, domain[1]);
      expect(read((lower + upper) / 2).status).toBe('ready');
      for (const age of [segment.ageMin - 1e-8, segment.ageMax + 1e-8])
        expect(read(age).status).toBe('unavailable');
    }
  });

  it('never bridges any source gap for either an exact or uncertain age', () => {
    for (let i = 1; i < data.segments.length; i++) {
      const left = data.segments[i - 1], right = data.segments[i];
      expect(read((left.ageMax + right.ageMin) / 2).status).toBe('unavailable');
      expect(read(left.ageMax, { ageUpperYears: right.ageMin }).status).toBe('unavailable');
    }
  });

  it('requires a finite ordered age interval and an explicit inclusive boolean', () => {
    for (const extra of [{ ageYears: undefined }, { ageYears: '40' }, { ageYears: Number.NaN },
      { ageUpperYears: undefined }, { ageUpperYears: Number.POSITIVE_INFINITY },
      { ageUpperYears: 39 }, { ageUpperInclusive: undefined }, { ageUpperInclusive: null },
      { ageUpperInclusive: 'true' }, { ageUpperInclusive: 1 }, { ageUpperInclusive: false }])
      expect(read(40, extra).status).toBe('unavailable');
    expect(read(-1).status).toBe('unavailable');
  });

  it('requires the ready male current-form context', () => {
    for (const extra of [{ sourceStatus: undefined }, { sourceStatus: 'pending' },
      { sex: 'female' }, { sex: undefined }, { contextBasis: undefined }, { contextBasis: 'visit-history' }])
      expect(read(40, extra).status).toBe('unavailable');
    expect(reader.read(data, policy, null).status).toBe('unavailable');
  });

  it('does not apply current age to a historical sample date', () => {
    expect(read(40, { sampleDateISO: '2020-01-02' }).status).toBe('unavailable');
    expect(read(40, { contextBasis: 'sample-date' }).status).toBe('unavailable');
  });

  it('keeps age40–<41 as one approximate1.25 when all rounded centres agree', () => {
    expect(read(40, { ageUpperYears: 41, ageUpperInclusive: false })).toMatchObject({
      status: 'ready', valueKind: 'approximate-value', valueMin: 1.25, valueMax: 1.25,
      ageLower: 40, ageUpper: 41, ageUpperInclusive: false });
  });

  it('requires the entire uncertain interval, including age17–<18, to be readable', () => {
    expect(read(17, { ageUpperYears: 18, ageUpperInclusive: false })).toMatchObject({
      status: 'unavailable', reason: 'age-interval-not-fully-readable' });
    expect(read(12, { ageUpperYears: 12.5, ageUpperInclusive: false }).status).toBe('unavailable');
  });

  it('rounds a varying uncertain source range outward instead of understating it', () => {
    expect(read(13.4, { ageUpperYears: 14, ageUpperInclusive: false })).toMatchObject({
      status: 'ready', valueKind: 'approximate-median-range', valueMin: .57, valueMax: .72 });
    expect(read(13.4)).toMatchObject({ valueKind: 'approximate-value', valueMin: .58, valueMax: .58 });
  });

  it('includes the internal source minimum rather than reading only interval endpoints', () => {
    expect(read(12.04)).toMatchObject({ valueMin: .19, valueMax: .19 });
    expect(read(12.15)).toMatchObject({ valueMin: .19, valueMax: .19 });
    expect(read(12.04, { ageUpperYears: 12.15, ageUpperInclusive: false })).toMatchObject({
      status: 'ready', valueKind: 'approximate-median-range', valueMin: .18, valueMax: .19 });
  });

  it('keeps the interval graphical envelope at least as wide as an included exact age', () => {
    const interval = read(19.92, { ageUpperYears: 20.8, ageUpperInclusive: false });
    const exact = read(20);
    expect(interval.status).toBe('ready');
    expect(interval.graphicalLower).toBeLessThanOrEqual(exact.graphicalLower);
    expect(interval.graphicalUpper).toBeGreaterThanOrEqual(exact.graphicalUpper);
  });

  it('fails closed for absent, activated, incompatible or gap-containing source/policy data', () => {
    for (const [source, routing] of [[null, policy], [data, null],
      [{ ...data, clinicalActivation: true }, policy], [data, { ...policy, clinicalActivation: true }],
      [data, { ...policy, sourceId: 'another-source' }], [data, { ...policy, bridgesAllowed: true }]])
      expect(reader.read(source, routing, context(40)).status).toBe('unavailable');
    const broken = structuredClone(data);
    broken.segments[0].points.splice(3, 1);
    expect(reader.read(broken, policy, context(12)).status).toBe('unavailable');
  });

  it('reads frozen inputs without mutation and returns detached source metadata', () => {
    const frozenData = freeze(structuredClone(data)), frozenPolicy = freeze(structuredClone(policy));
    const current = freeze(context(40)), before = JSON.stringify([frozenData, frozenPolicy, current]);
    const result = reader.read(frozenData, frozenPolicy, current);
    expect(result.status).toBe('ready');
    expect(JSON.stringify([frozenData, frozenPolicy, current])).toBe(before);
    expect(result.source).toEqual(data.source);
    expect(result.source).not.toBe(frozenData.source);
    expect(result.source.limits).not.toBe(frozenData.source.limits);
  });

  it('does not turn a patient result or Tanner stage into a point, norm or verdict', () => {
    const baseline = read(40);
    for (const extra of [{ measurement: { value: 0, unit: 'ng/mL' } },
      { measurement: { value: 1e100, unit: 'ng/mL' }, puberty: { kind: 'G', stage: 5 } }])
      expect(read(40, extra)).toEqual(baseline);
    for (const key of ['referenceValue', 'profile', 'patientPoint', 'point', 'classification',
      'percentile', 'sds', 'zScore', 'ratio', 'verdict', 'normalRange', 'assessment'])
      expect(baseline).not.toHaveProperty(key);
  });

  it('reads without touching browser storage, network, DOM or patient events', () => {
    const touched = [];
    const deny = name => { touched.push(name); throw new Error(`Unexpected side effect: ${name}`); };
    const window = {};
    for (const name of ['localStorage', 'sessionStorage', 'indexedDB', 'document'])
      Object.defineProperty(window, name, { get: () => deny(name) });
    window.dispatchEvent = () => deny('dispatchEvent');
    window.fetch = () => deny('fetch');
    const sandbox = { window, module: { exports: {} }, fetch: window.fetch };
    vm.runInNewContext(sourceCode, sandbox);
    expect(sandbox.window.VildaInsl3AgeSource.read(data, policy, context(40)).status).toBe('ready');
    expect(sandbox.window.VildaInsl3AgeSource.read(data, policy, context(18)).status).toBe('unavailable');
    expect(touched).toEqual([]);
  });
});
