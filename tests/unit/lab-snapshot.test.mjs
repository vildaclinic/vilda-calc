import { beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

let snapshot;
let engine;
let data;
beforeAll(() => {
  const browser = {};
  loadBrowserScript('vilda_lab_snapshot.js', browser);
  snapshot = browser.VildaLabSnapshot;
  loadBrowserScript('vilda_lab_puberty.js', browser);
  loadBrowserScript('vilda_lab_puberty_data.js', browser);
  engine = browser.VildaLabPuberty;
  data = browser.VildaLabPubertyData;
});
const DATE = '2026-10-03';
function evaluate(overrides = {}, referenceData = data) {
  return engine.evaluate({
    analyte: 'lh', value: '2', unit: 'IU/L', sex: 'M',
    birthDateISO: '2020-10-03', sampleDateISO: DATE,
    specimen: 'serum', measurementKind: 'basal',
    assay: { profileId: 'mayo-lh-pediatric', methodId: 'anshlite-lh-clia', confirmation: 'reported' },
    puberty: { kind: 'G', stage: 4, assessedAtISO: DATE, appliesToSample: true, source: 'fictional-examination' },
    treatment: { gnrha: 'no', sexSteroids: 'no' }, preterm: 'no',
    ...overrides,
  }, referenceData);
}
function lab(overrides = {}, evaluation = evaluate()) {
  return {
    test: 'LH', testKey: 'lh', value: '2', valueNum: 2, unit: 'IU/L', norm: '1,3–9,8',
    assessment: snapshot.create(evaluation), ...overrides,
  };
}
function boundLab(overrides = {}, evaluation = evaluate()) {
  return snapshot.reconcile(null, lab(overrides, evaluation), null, DATE);
}

describe('VildaLabSnapshot — explicit versioned assessment', () => {
  it('exports independently in Node and a browser without engine/data/DOM', () => {
    const require = createRequire(import.meta.url);
    const standalone = require('../../vilda_lab_snapshot.js');
    expect(standalone.version).toBe(snapshot.version);
    expect(standalone.normalize({ schemaVersion: 99 }).status).toBe('unavailable');
    expect(standalone.forSeries({ valueNum: 2 }, DATE)).toEqual({});
  });

  it('preserves the entire real engine output, range operators and historical provenance', () => {
    const evaluation = evaluate();
    const result = snapshot.create(evaluation);
    expect(result).toEqual({ schemaVersion: 1, status: 'recorded', reasonCodes: [], evaluation });
    expect(result.evaluation.biochemical.byAge.range.bounds.censoredLower).toEqual({ operator: '<', value: 0.02 });
    expect(result.evaluation.biochemical.byStage.range.method.analyticalSensitivity.value).toBe(0.02);
    expect(result.evaluation.biochemical.byStage.range.population.statistics.coveragePercent).toBeNull();
    expect(result.evaluation.biochemical.byAge.status).toBe('above');
    expect(result.evaluation.biochemical.byStage.status).toBe('within');
    expect(result.evaluation.clinical.code).toBe('early_development');
    expect(snapshot.normalize(JSON.parse(JSON.stringify(result)))).toEqual(result);
  });

  it('detaches every nested reference from input and reference-data versions', () => {
    const referenceData = JSON.parse(JSON.stringify(data));
    const evaluation = evaluate({}, referenceData);
    const created = snapshot.create(evaluation);
    const read = snapshot.normalize(created);
    evaluation.input.puberty.stage = 1;
    evaluation.biochemical.byStage.range.bounds.upper.value = 999;
    referenceData.profiles[0].method.name = 'changed';
    created.evaluation.input.birthDateISO = '2010-01-01';
    created.evaluation.provenance.sourceIds.push('changed');
    expect(read.evaluation.input.puberty.stage).toBe(4);
    expect(read.evaluation.input.birthDateISO).toBe('2020-10-03');
    expect(read.evaluation.biochemical.byStage.range.bounds.upper.value).toBe(9.8);
    expect(read.evaluation.biochemical.byStage.range.method.name).toBe('AnshLite LH CLIA');
    expect(read.evaluation.provenance.sourceIds).not.toContain('changed');
  });

  it('preserves the local source, method, population and inequality without needing its catalog', () => {
    const localReference = {
      id: 'fictional-lab', version: 'fictional-1', analyte: 'lh', material: 'serum', unit: 'IU/L',
      methodId: 'anshlite-lh-clia', applicabilityConfirmed: true,
      source: { id: 'fictional-source', label: 'Fictional laboratory', version: '1', url: 'https://example.invalid/reference' },
      population: { label: 'Fictional pediatric population' },
      range: { lower: null, upper: { operator: '<', value: 3 }, censoredLower: null, sourceText: '<3 IU/L' },
    };
    const result = snapshot.create(evaluate({ localReference }));
    expect(result.status).toBe('recorded');
    expect(result.evaluation.input.localReference).toEqual(localReference);
    expect(result.evaluation.biochemical.local.range.bounds.upper).toEqual({ operator: '<', value: 3 });
    expect(result.evaluation.biochemical.primary).toBe('local');
  });

  it('whitelists at every depth and never traverses unknown cyclic/DOM/patient fields', () => {
    const evaluation = evaluate();
    const forbidden = { patientId: 'fictional-sensitive-id', html: '<p>ignored</p>' };
    forbidden.self = forbidden;
    evaluation.patientId = forbidden.patientId;
    evaluation.input.dom = forbidden;
    evaluation.input.puberty.patientId = forbidden.patientId;
    evaluation.biochemical.byAge.range.source.html = forbidden.html;
    evaluation.biochemical.byStage.range.population.extra = forbidden;
    evaluation.measurement.unknown = forbidden;
    Object.defineProperty(evaluation, 'unusedGetter', { get() { throw new Error('must not execute'); } });
    const result = snapshot.create(evaluation);
    expect(result.status).toBe('recorded');
    expect(JSON.stringify(result)).not.toMatch(/patientId|fictional-sensitive-id|ignored|"unknown":|unusedGetter/);
  });

  it.each([null, {}, { schemaVersion: 2, status: 'recorded', evaluation: {} }, { schemaVersion: 1, status: 'recorded', reasonCodes: [], evaluation: {} }])(
    'retains an explicit unavailable sentinel for malformed/unsupported %j', (value) => {
      const result = snapshot.normalize(value);
      expect(result).toMatchObject({ schemaVersion: 1, status: 'unavailable', evaluation: null });
      expect(result.reasonCodes.length).toBeGreaterThan(0);
      expect(snapshot.normalize(result)).toEqual(result);
      expect(snapshot.forSeries({ valueNum: 2, assessment: value }, DATE)).toMatchObject({ valueNum: null, plotValue: null, assessment: { status: 'unavailable' } });
    },
  );

  it('does not execute accessors or store HTML inside known fields', () => {
    const evaluation = evaluate();
    evaluation.clinical.text = '<script>fictional()</script>';
    expect(snapshot.create(evaluation).status).toBe('unavailable');
    Object.defineProperty(evaluation, 'measurement', { get() { throw new Error('must not execute'); } });
    expect(snapshot.create(evaluation).status).toBe('unavailable');
  });

  it('retains invalid and unavailable engine evaluations as recorded historical evaluations', () => {
    expect(snapshot.create(evaluate({ value: 'not-a-result' })).evaluation.measurement.status).toBe('invalid');
    const noMethod = snapshot.create(evaluate({ assay: {} }));
    expect(noMethod.status).toBe('recorded');
    expect(noMethod.evaluation.biochemical.status).toBe('unavailable');
  });
});

describe('VildaLabSnapshot — updates and compatibility', () => {
  it('keeps legacy data without adding assessment, age, stage, method or a date', () => {
    const legacy = { test: 'LH', value: '2', valueNum: 2, unit: 'IU/L' };
    expect(snapshot.reconcile(legacy, { ...legacy, value: '3' }, null, DATE)).toEqual({ ...legacy, value: '3' });
    expect(snapshot.forSeries(legacy, DATE)).toEqual({});
  });

  it('preserves historical context when the caller changes only the note body', () => {
    const previous = boundLab();
    const updated = snapshot.reconcile(previous, { ...previous }, DATE, DATE);
    expect(updated).toEqual(previous);
    expect(updated.assessment).not.toBe(previous.assessment);
    const missingFromForm = { ...previous };
    delete missingFromForm.assessment;
    expect(snapshot.reconcile(previous, missingFromForm, DATE, DATE)).toEqual(previous);
  });

  it.each([
    ['test', 'FSH'], ['testKey', 'fsh'], ['value', '3'], ['valueNum', 3], ['unit', 'mIU/mL'], ['norm', 'fictional-other-range'],
  ])('invalidates a retained assessment after changing %s', (field, value) => {
    const previous = boundLab();
    const updated = snapshot.reconcile(previous, { ...previous, [field]: value }, DATE, DATE);
    expect(updated.assessment.status).toBe('invalidated');
    expect(updated.assessment.reasonCodes).toContain('result_or_clinical_date_changed');
    expect(updated.assessment.evaluation).toEqual(previous.assessment.evaluation);
    expect(previous.assessment.status).toBe('recorded');
  });

  it('rejects a first save against a different clinical date without rewriting sample context', () => {
    const assessmentAtEarlierSample = lab({}, evaluate({ sampleDateISO: '2026-10-01' }));
    const mismatch = snapshot.reconcile(null, assessmentAtEarlierSample, null, DATE);
    expect(mismatch.assessment.status).toBe('invalidated');
    expect(mismatch.assessment.reasonCodes).toContain('assessment_sample_date_mismatch');
    expect(mismatch.assessment.evaluation.input.sampleDateISO).toBe('2026-10-01');
    const previous = snapshot.reconcile(null, assessmentAtEarlierSample, null, '2026-10-01');
    expect(previous.assessment.status).toBe('recorded');
    expect(previous.assessment.evaluation.input.sampleDateISO).toBe('2026-10-01');
    const updated = snapshot.reconcile(previous, previous, '2026-10-01', '2026-10-04');
    expect(updated.assessment.status).toBe('invalidated');
    expect(updated.assessment.evaluation.input.sampleDateISO).toBe('2026-10-01');
  });

  it('does not fill a missing clinical date from a known sample date', () => {
    const result = snapshot.reconcile(null, lab(), null, null);
    expect(result.assessment.status).toBe('invalidated');
    expect(result.assessment.reasonCodes).toContain('assessment_sample_date_mismatch');
    expect(result.assessment).not.toHaveProperty('binding');
  });

  it('accepts a fresh complete assessment matching an edited result and context/profile', () => {
    const previous = boundLab();
    const fresh = lab({ value: '3', valueNum: 3 }, evaluate({ value: '3', puberty: { kind: 'G', stage: 1, assessedAtISO: DATE } }));
    const updated = snapshot.reconcile(previous, fresh, DATE, DATE);
    expect(updated.assessment.status).toBe('recorded');
    expect(updated.assessment.evaluation.input.puberty.stage).toBe(1);
    const changedProfile = lab({}, evaluate({ assay: {} }));
    expect(snapshot.reconcile(previous, changedProfile, DATE, DATE).assessment.evaluation.biochemical.status).toBe('unavailable');
  });

  it('rejects a fresh assessment that belongs to a different result or stored anchor', () => {
    const previous = boundLab();
    const fresh = lab({ value: '3', valueNum: 3 }, evaluate({ value: '4' }));
    expect(snapshot.reconcile(previous, fresh, DATE, DATE).assessment.status).toBe('invalidated');
    expect(snapshot.forSeries(previous, '2026-10-04').assessment.status).toBe('invalidated');
  });

  it('does not revive invalidated or explicitly unavailable assessments during a later read', () => {
    const previous = boundLab();
    const edited = snapshot.reconcile(previous, { ...previous, value: '3', valueNum: 3 }, DATE, DATE);
    expect(snapshot.forSeries(edited, DATE)).toMatchObject({ valueNum: null, assessment: { status: 'invalidated' } });
    const unavailable = snapshot.reconcile(previous, { ...previous, assessment: null }, DATE, DATE);
    expect(snapshot.forSeries(unavailable, DATE)).toMatchObject({ valueNum: null, assessment: { status: 'unavailable' } });
  });

  it('does not revive an invalidated assessment by replaying its original unbound envelope', () => {
    const unbound = lab();
    const previous = snapshot.reconcile(null, unbound, null, DATE);
    const edited = snapshot.reconcile(previous, previous, DATE, '2026-10-04');
    const replay = snapshot.reconcile(edited, unbound, '2026-10-04', '2026-10-04');
    expect(replay.assessment.status).toBe('invalidated');
    expect(replay.assessment.reasonCodes).toContain('assessment_requires_recalculation');
    expect(replay.assessment.reasonCodes).toContain('result_or_clinical_date_changed');
    // Reverting the displayed result/date also cannot certify the old evaluation.
    expect(snapshot.reconcile(replay, unbound, '2026-10-04', DATE).assessment.status).toBe('invalidated');
  });

  it('blocks context replay even when the result and clinical date match', () => {
    const unbound = lab();
    const previous = snapshot.reconcile(null, unbound, null, DATE);
    const invalidated = { ...previous, assessment: { ...previous.assessment, status: 'invalidated', reasonCodes: ['context_changed'] } };
    expect(snapshot.reconcile(invalidated, unbound, DATE, DATE).assessment).toMatchObject({
      status: 'invalidated', reasonCodes: ['context_changed', 'assessment_requires_recalculation'],
    });
    const recomputed = lab({}, evaluate({ assay: {} }));
    expect(snapshot.reconcile(invalidated, recomputed, DATE, DATE).assessment.status).toBe('recorded');
  });
});

describe('VildaLabSnapshot — plot values', () => {
  it('keeps an exact canonical value for numeric history', () => {
    expect(snapshot.forSeries(boundLab(), DATE)).toMatchObject({ valueNum: 2, plotValue: 2, assessment: { status: 'recorded' } });
  });

  it('keeps an exact measurement numeric when the recorded biochemical assessment is unavailable', () => {
    const result = boundLab({}, evaluate({ assay: {} }));
    expect(snapshot.forSeries(result, DATE)).toMatchObject({
      valueNum: 2, plotValue: 2, assessment: { status: 'recorded', evaluation: { biochemical: { status: 'unavailable' } } },
    });
  });

  it.each(['<0.02', '≤0,02', '>0.5', '≥0,5', '<LOD', '<LOQ'])('never plots %s as a measured boundary', (value) => {
    const evaluation = evaluate({ value });
    const result = boundLab({ value, valueNum: evaluation.measurement.value }, evaluation);
    expect(result.assessment.status).toBe('recorded');
    const point = snapshot.forSeries(result, DATE);
    expect(point.valueNum).toBeNull();
    expect(point.plotValue).toBeNull();
    expect(point.assessment.evaluation.measurement.raw).toBe(value);
    expect(point.assessment.evaluation.measurement.operator).toBe(evaluation.measurement.operator);
  });

  it('does not trust an inconsistent numeric projection in an imported assessment', () => {
    const evaluation = evaluate({ value: '<0.02' });
    evaluation.measurement.plotValue = 0.02;
    const result = snapshot.create(evaluation);
    expect(result.status).toBe('unavailable');
    expect(snapshot.forSeries({ value: '<0.02', valueNum: 0.02, assessment: result }, DATE).valueNum).toBeNull();
  });

  it('does not plot a censored raw result whose imported metadata claims it is exact', () => {
    const evaluation = evaluate({ value: '<0.02' });
    Object.assign(evaluation.measurement, { operator: '=', isExact: true, plotValue: 0.02 });
    expect(snapshot.create(evaluation).status).toBe('unavailable');
  });

  it.each([
    (value) => { value.input.puberty = null; },
    (value) => { value.measurement.reasonCodes = null; },
    (value) => { value.biochemical.byStage.range.bounds.upper = {}; },
    (value) => { value.biochemical.byAge.range.source = null; },
    (value) => { value.biochemical.primary = 'local'; },
    (value) => { value.input.value = '3'; },
  ])('keeps a damaged nested clinical assessment explicitly unavailable', (damage) => {
    const evaluation = evaluate();
    damage(evaluation);
    expect(snapshot.create(evaluation).status).toBe('unavailable');
  });

  it.each(['<0.02', '≤0,02', '>0.5', '≥0,5'])('rejects a corrupted numeric boundary that disagrees with %s', (value) => {
    const evaluation = evaluate({ value });
    Object.assign(evaluation.measurement, { value: 2, sourceValue: 2 });
    expect(snapshot.create(evaluation).status).toBe('unavailable');
  });

  it.each([
    { value: { operator: '≤', value: 0.02 } },
    { value: { operator: '>', value: 0.5 } },
    { value: { operator: '=', value: 2 } },
    { birthDateISO: null, age: { years: 6, months: 2, days: 3, precision: 'day' } },
    { analyte: 'fsh', assay: { profileId: 'mayo-fsh-pediatric', methodId: 'roche-elecsys-fsh-eclia', confirmation: 'reported' } },
  ])('roundtrips the complete real engine output for typed values, manual day age and FSH', (overrides) => {
    const evaluation = evaluate(overrides);
    const created = snapshot.create(evaluation);
    expect(created.status).toBe('recorded');
    expect(snapshot.normalize(JSON.parse(JSON.stringify(created))).evaluation).toEqual(evaluation);
  });
});
