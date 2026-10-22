import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const engine = require('../../vilda_e2_phase_source.js');
const runtime = require('../../vilda_hormone_lifespan_data.js');
const data = JSON.parse(readFileSync(new URL('../../docs/clinical/hormone-lifespan/e2-phase-source-data.json', import.meta.url), 'utf8'));
const context = (extra = {}) => ({ sourceStatus: 'ready', analyte: 'estradiol', sex: 'female',
  identityKey: 'fictional-e2-phase-person-a', ageYears: 30, ageUpperYears: 30 + 1 / 12,
  ageUpperInclusive: false, cyclePhase: 'follicular',
  measurement: { value: 240, unit: 'pmol/L', operator: '=' },
  view: 'life', compare: false, selected: ['e2'], ...extra });
const evaluate = extra => engine.evaluate(data, context(extra));

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

describe('E2 phase-group information — Anckaert 2021, Table 1 and supplementary S3', () => {
  it('adds only the separate source block and preserves every prior profile, curve, scale and policy', () => {
    const { e2PhaseSourceData, ...priorRuntime } = runtime;
    expect(e2PhaseSourceData).toEqual(data);
    expect(createHash('sha256').update(JSON.stringify(priorRuntime)).digest('hex'))
      .toBe('59440bf9bea232989d835355fc18aedaea5a7be1ef7ee92475e8f331b28f4850');
    expect(runtime.patientPointData.profiles).toHaveLength(85);
  });
  it.each([
    ['follicular', 198, 85, 53.9],
    ['ovulation', 757, 81, 206],
    ['luteal', 412, 85, 112],
  ])('returns the source group for %s without a patient comparison or normality decision', (cyclePhase, value, participants, approxPgMl) => {
    const result = evaluate({ cyclePhase });
    expect(result).toMatchObject({ status: 'ready', version: data.version,
      source: { id: 'anckaert2021-female-e2-phase-medians', specimen: 'serum', doi: '10.1016/j.plabm.2021.e00211' },
      phase: { id: cyclePhase, participants }, median: { value, unit: 'pmol/L', approxPgMl },
      ageDomain: { minYears: 18, maxYears: 37 },
      policy: { notClinicalReference: true, noPatientComparison: true, knownPhaseRequired: true } });
    expect(result.phase.median).toBeUndefined();
    for (const forbidden of ['patient', 'measurement', 'point', 'reference', 'comparison', 'ratio', 'sds', 'percentile', 'normal', 'verdict']) {
      expect(result).not.toHaveProperty(forbidden);
    }
    expect(result.source.statistic).toContain('każdej uczestniczki');
    expect(result.source.statistic).toContain('nie centyl pojedynczego pobrania');
  });

  it('uses an entire possible-age interval inside the conservative study domain', () => {
    for (const extra of [
      { ageYears: 18, ageUpperYears: 18 },
      { ageYears: 18, ageUpperYears: 19, ageUpperInclusive: false },
      { ageYears: 36, ageUpperYears: 37, ageUpperInclusive: false },
      { ageYears: 36.9, ageUpperYears: 37, ageUpperInclusive: true },
      { ageYears: 37, ageUpperYears: 37, ageUpperInclusive: true },
    ]) expect(evaluate(extra).status).toBe('ready');
    for (const extra of [
      { ageYears: 17.99999, ageUpperYears: 18.05 },
      { ageYears: 37, ageUpperYears: 38, ageUpperInclusive: false },
      { ageYears: 36.99, ageUpperYears: 37.01 },
      { ageYears: 40, ageUpperYears: 40 },
      { ageYears: null }, { ageYears: NaN }, { ageYears: Infinity }, { ageYears: -1 },
      { ageUpperYears: 29 }, { ageUpperYears: NaN }, { ageUpperYears: Infinity },
    ]) expect(evaluate(extra).status).toBe('unavailable');
    expect(evaluate({ ageYears: 30, ageUpperYears: null }).status).toBe('ready');
  });

  it('requires the actual E2 phase and never infers a phase or menopause from age or result', () => {
    for (const cyclePhase of [null, undefined, '', 'unknown', 'postmenopause', 'menopause',
      'pregnancy', 'pregnancy_t1', 'pregnancy_t2', 'pregnancy_t3', 'day3', 'early_follicular', {}, []]) {
      for (const value of [0, 198, 757, 100000]) {
        expect(evaluate({ cyclePhase, measurement: { value, unit: 'pmol/L' } }).status).toBe('unavailable');
      }
    }
    expect(evaluate({ cyclePhase: ' Follicular ' }).median.value).toBe(198);
    expect(evaluate({ cyclePhase: '', reproductiveContext: 'follicular' })).toEqual({ status: 'unavailable', reason: 'unknown-cycle-phase' });
  });

  it('clears the model for a missing patient, other analyte/sex, other chart view or dated sample', () => {
    for (const extra of [
      { sourceStatus: 'loading' }, { sourceStatus: 'unavailable' }, { sourceStatus: undefined },
      { analyte: 'fsh' }, { analyte: 'amh' }, { analyte: undefined },
      { sex: 'male' }, { sex: null },
      { view: 'mini' }, { view: 'puberty' }, { compare: true },
      { selected: [] }, { selected: ['fsh'] }, { selected: 'e2' },
      { contextBasis: 'sample' }, { contextBasis: 'unknown' },
      { sampleDateISO: '2025-01-05' },
    ]) expect(evaluate(extra).status).toBe('unavailable');
    expect(evaluate({ contextBasis: 'current-patient' }).status).toBe('ready');
    expect(evaluate({ selected: ['lh', 'e2'] }).status).toBe('ready');
  });

  it('keeps every known exclusion meaningful while unknown history stays unknown', () => {
    for (const extra of [
      { contraindicated: true }, { pregnancy: true }, { pregnancy: 'yes' }, { lactation: true },
      { treatment: { context: 'hormonal' } }, { treatment: { gnrha: 'yes' } },
      { treatment: { sexSteroids: true } }, { treatment: { cocp: 'yes' } },
      { treatment: { exogenousTestosterone: true } }, { measurementKind: 'gnrh-stimulation' },
    ]) expect(evaluate(extra)).toEqual({ status: 'unavailable', reason: 'contraindicated' });
    for (const extra of [{}, { contraindicated: false }, { pregnancy: 'unknown', lactation: 'unknown' },
      { treatment: { context: 'unknown', cocp: 'unknown' } }, { measurementKind: 'basal' }]) {
      const result = evaluate(extra);
      expect(result.status).toBe('ready');
      expect(result).not.toHaveProperty('confirmedNoTreatment');
      expect(result.source.limitations.join(' ')).toContain('Brak wywiadu pacjentki nie potwierdza');
    }
  });

  it('uses only explicit source assay and specimen aliases, without equating all Roche methods or matrices', () => {
    for (const assayMethodId of data.policy.allowedAssayMethodIds) {
      expect(evaluate({ assayMethodId }).status).toBe('ready');
    }
    for (const assayMethodId of ['lc-ms-ms', 'roche-cobas-e411-estradiol', 'roche-elecsys-estradiol-ii', 'eclia', 'roche', {}]) {
      expect(evaluate({ assayMethodId })).toEqual({ status: 'unavailable', reason: 'incompatible-assay' });
    }
    for (const specimen of ['serum', 'surowica', ' Serum ']) expect(evaluate({ specimen }).status).toBe('ready');
    for (const specimen of ['plasma', 'edta-plasma', 'saliva', {}]) {
      expect(evaluate({ specimen })).toEqual({ status: 'unavailable', reason: 'incompatible-specimen' });
    }
    for (const value of [undefined, null, '', 'unknown']) {
      expect(evaluate({ specimen: value, assayMethodId: value }).status).toBe('ready');
    }
  });

  it('allows cohort information for a valid inequality without turning its boundary into a point', () => {
    for (const unit of data.policy.measurementUnits) {
      for (const operator of ['=', '<', '>', '≤', '≥', '<=', '>=']) {
        const measurement = freeze({ value: 5, unit, operator });
        const before = JSON.stringify(measurement);
        const result = evaluate({ measurement });
        expect(result.status).toBe('ready');
        expect(result.median.value).toBe(198);
        expect(result).not.toHaveProperty('patient');
        expect(JSON.stringify(measurement)).toBe(before);
      }
    }
    for (const censoring of ['LOD', 'LOQ']) {
      const result = evaluate({ measurement: { value: null, unit: 'pg/mL', operator: '<', censoring } });
      expect(result.status).toBe('ready');
      expect(result).not.toHaveProperty('point');
    }
    expect(evaluate({ measurement: { value: 0, unit: 'pmol/L' } }).status).toBe('ready');
    for (const measurement of [null, {}, { status: 'invalid', value: 5, unit: 'pmol/L' },
      { value: -1, unit: 'pmol/L' }, { value: NaN, unit: 'pmol/L' }, { value: Infinity, unit: 'pmol/L' },
      { value: 0, unit: 'pmol/L', operator: '<' }, { value: 5, unit: 'IU/L' },
      { value: 5, unit: 'pmol/L', operator: '~' }, { value: null, unit: 'pg/mL', operator: '<' },
      { value: null, unit: 'pg/mL', operator: '>', censoring: 'LOD' }]) {
      expect(evaluate({ measurement })).toEqual({ status: 'unavailable', reason: 'invalid-measurement' });
    }
  });

  it('takes values and qualification from supplied data and returns detached source facts', () => {
    const supplied = structuredClone(data);
    supplied.ageDomain = { ...supplied.ageDomain, minYears: 40, maxYears: 50 };
    supplied.phases.follicular.median = { value: 250, unit: 'pmol/L', approxPgMl: 68.1 };
    supplied.source.population = 'Fikcyjna populacja testowa';
    supplied.policy.allowedAssayMethodIds = ['fictional-e2-test-assay'];
    supplied.policy.allowedSpecimens = ['fictional-test-specimen'];
    supplied.policy.excludedTreatmentFlags.push('fictionalKnownExclusion');
    const input = freeze(context({ ageYears: 45, ageUpperYears: 46,
      assayMethodId: 'fictional-e2-test-assay', specimen: 'fictional-test-specimen' }));
    freeze(supplied);
    const before = JSON.stringify({ supplied, input });
    const result = engine.evaluate(supplied, input);
    expect(result).toMatchObject({ status: 'ready', median: { value: 250 },
      source: { population: 'Fikcyjna populacja testowa' }, ageDomain: { minYears: 40, maxYears: 50 } });
    result.median.value = 99;
    result.phase.participants = 1;
    result.source.limitations.push('Fikcyjna zmiana testowa');
    result.policy.allowedSpecimens.push('new');
    expect(JSON.stringify({ supplied, input })).toBe(before);
    expect(engine.evaluate(supplied, { ...input, treatment: { fictionalKnownExclusion: true } }).status).toBe('unavailable');
    expect(engine.evaluate(supplied, context()).status).toBe('unavailable');
  });

  it('fails closed for incomplete source data and exposes the same browser production function', () => {
    for (const supplied of [null, {}, { ...data, phases: null }, { ...data, phases: [] },
      { ...data, phases: { follicular: { ...data.phases.follicular, median: { value: NaN, unit: 'pmol/L', approxPgMl: 0 } } } },
      { ...data, ageDomain: { minYears: 37, maxYears: 18 } },
      { ...data, policy: { ...data.policy, noPatientComparison: false } }]) {
      expect(engine.evaluate(supplied, context())).toEqual({ status: 'unavailable', reason: 'source-unavailable' });
    }
    const window = {};
    vm.runInNewContext(readFileSync(new URL('../../vilda_e2_phase_source.js', import.meta.url), 'utf8'), { window });
    expect(window.VildaE2PhaseSource.evaluate(data, context())).toMatchObject({ status: 'ready', median: { value: 198 } });
    expect(Object.keys(window.VildaE2PhaseSource)).toEqual(['evaluate']);
  });
});
