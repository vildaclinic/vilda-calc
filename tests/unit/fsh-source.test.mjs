import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const engine = require('../../vilda_fsh_source.js');
const puberty = require('../../vilda_lab_puberty.js');
const data = JSON.parse(readFileSync(new URL('../../docs/clinical/hormone-lifespan/fsh-source-data.json', import.meta.url), 'utf8'));
const context = (extra = {}) => ({ sourceStatus: 'ready', analyte: 'fsh', sex: 'female',
  identityKey: 'fictional-fsh-source-person-a', ageYears: 30, ageUpperYears: 31,
  ageUpperInclusive: false, cyclePhase: 'follicular', view: 'life', compare: false,
  selected: ['fsh'], measurement: puberty.parseMeasurement('10', 'IU/L'), ...extra });
const evaluate = extra => engine.evaluate(data, context(extra));
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

describe('FSH manufacturer-group information — Roche 2024-06 V4.0, Expected values p3', () => {
  it.each([
    ['follicular', 'Faza folikularna', 6.9, 376],
    ['ovulation', 'Faza owulacyjna', 12.3, 56],
    ['luteal', 'Faza lutealna', 3.6, 349],
    ['postmenopause', 'Po menopauzie', 67, 181],
  ])('returns the printed group median for %s without a patient comparison', (cyclePhase, label, value, printedN) => {
    const result = evaluate({ cyclePhase });
    expect(result).toMatchObject({ status: 'ready', version: data.version,
      source: { id: 'roche-elecsys-fsh-2024-group-medians', documentId: '08932387500V4.0',
        documentVersion: '2024-06 V4.0 English', page: 3, printedUnit: 'mIU/mL', displayUnit: 'IU/L', ageDomain: null },
      group: { id: cyclePhase, label, printedN }, median: { value, unit: 'IU/L' }, ageDomain: null,
      placement: { minimumAgeYearsExclusive: 18 },
      policy: { notClinicalReference: true, noPatientComparison: true, placementOnly: true } });
    expect(result.group.median).toBeUndefined();
    for (const forbidden of ['patient', 'measurement', 'point', 'reference', 'comparison', 'ratio', 'sds', 'percentile', 'normal', 'verdict']) {
      expect(result).not.toHaveProperty(forbidden);
    }
    expect(result.source.statistic).toContain('nie potwierdza dopasowania');
    expect(result.source.population).toContain('nie sumujemy');
    expect(result.source.limitsDescription).toContain('nie odtwarzają historycznej procedury cenzury');
  });

  it('uses an adult placement boundary while leaving the manufacturer age domain unknown', () => {
    for (const extra of [
      { ageYears: 18.00001, ageUpperYears: 18.1 },
      { ageYears: 19, ageUpperYears: 20 },
      { ageYears: 37, ageUpperYears: 38 },
      { ageYears: 55, ageUpperYears: 56, cyclePhase: 'postmenopause' },
      { ageYears: 90, ageUpperYears: 91 },
      { ageYears: 30, ageUpperYears: null },
    ]) {
      const result = evaluate(extra);
      expect(result.status).toBe('ready');
      expect(result.ageDomain).toBeNull();
      expect(result.source.ageDomain).toBeNull();
      expect(result.placement.description).toContain('nie granicą wieku grup producenta');
    }
    for (const extra of [
      { ageYears: 18, ageUpperYears: 18, ageUpperInclusive: true },
      { ageYears: 18, ageUpperYears: 19, ageUpperInclusive: false },
      { ageYears: 17.99, ageUpperYears: 18.2 },
      { ageYears: null }, { ageYears: NaN }, { ageYears: Infinity }, { ageYears: -1 },
      { ageUpperYears: 29 }, { ageUpperYears: NaN }, { ageUpperYears: Infinity },
    ]) expect(evaluate(extra).status).toBe('unavailable');
  });

  it('uses only the explicit current FSH group, with no inference or borrowed E2/LH phase', () => {
    for (const cyclePhase of [null, undefined, '', 'unknown', 'menopause', 'pregnancy', 'pregnancy_t1',
      'pregnancy_t2', 'pregnancy_t3', 'day3', 'early_follicular', {}, []]) {
      for (const value of [0, 6.9, 67, 10000]) {
        expect(evaluate({ cyclePhase, measurement: { value, unit: 'IU/L' } }).status).toBe('unavailable');
      }
    }
    expect(evaluate({ cyclePhase: ' Postmenopause ' }).median.value).toBe(67);
    expect(evaluate({ cyclePhase: '', reproductiveContext: 'follicular', e2CyclePhase: 'follicular' }))
      .toEqual({ status: 'unavailable', reason: 'unknown-cycle-phase' });
    expect(evaluate({ ageYears: 55, ageUpperYears: 56, cyclePhase: 'unknown' }).status).toBe('unavailable');
  });

  it('withholds for missing/wrong current context, chart selection, view and historical samples', () => {
    for (const extra of [
      { sourceStatus: 'loading' }, { sourceStatus: 'unavailable' }, { sourceStatus: undefined },
      { analyte: 'lh' }, { analyte: 'estradiol' }, { analyte: undefined },
      { sex: 'male' }, { sex: null },
      { view: 'mini' }, { view: 'puberty' }, { compare: true }, { compare: 'false' },
      { selected: [] }, { selected: ['lh'] }, { selected: 'fsh' },
      { contextBasis: 'sample' }, { contextBasis: 'unknown' },
      { sampleDateISO: '2025-01-05' },
    ]) expect(evaluate(extra).status).toBe('unavailable');
    expect(evaluate({ contextBasis: 'current-patient' }).status).toBe('ready');
    expect(evaluate({ selected: ['lh', 'fsh', 'e2'] }).status).toBe('ready');
  });

  it('retains known conservative application exclusions without attributing unreported cohort criteria', () => {
    for (const extra of [
      { contraindicated: true }, { pregnancy: true }, { pregnancy: 'yes' }, { hormonalTreatment: true },
      { stimulation: 'yes' }, { gnrha: true },
      { treatment: { context: 'hormonal' } }, { treatment: { context: 'stimulation' } },
      { treatment: { gnrha: 'yes' } }, { treatment: { sexSteroids: true } },
      { treatment: { cocp: 'yes' } }, { treatment: { exogenousTestosterone: true } },
      { measurementKind: 'gnrh-stimulation' }, { measurementKind: 'hcg-stimulation' },
    ]) expect(evaluate(extra)).toEqual({ status: 'unavailable', reason: 'contraindicated' });
    for (const extra of [{}, { contraindicated: false }, { pregnancy: 'unknown', lactation: 'unknown' },
      { treatment: { context: 'unknown', cocp: 'unknown' } }, { measurementKind: 'basal' },
      { cyclePhase: 'postmenopause', menopause: true }]) {
      const result = evaluate(extra);
      expect(result.status).toBe('ready');
      expect(result).not.toHaveProperty('confirmedNoTreatment');
      expect(result.source.limitations.join(' ')).toContain('nie odzyskanym kryterium wyłączenia');
    }
    expect(data.policy.excludedPositiveFlags).not.toContain('lactation');
    expect(data.policy.excludedCyclePhases).not.toContain('postmenopause');
    expect(data.ageDomain).toBeNull();
  });

  it('uses only supplied current-assay/material aliases and preserves explicit mismatches', () => {
    for (const assayMethodId of data.policy.allowedAssayMethodIds) expect(evaluate({ assayMethodId }).status).toBe('ready');
    for (const assayMethodId of ['lc-ms-ms', 'abbott-architect-fsh', 'roche-elecsys-lh-eclia', 'eclia', 'roche', {}]) {
      expect(evaluate({ assayMethodId })).toEqual({ status: 'unavailable', reason: 'incompatible-assay' });
    }
    for (const specimen of data.policy.allowedSpecimens) expect(evaluate({ specimen }).status).toBe('ready');
    for (const specimen of ['plasma', 'citrate-plasma', 'saliva', 'urine', {}]) {
      expect(evaluate({ specimen })).toEqual({ status: 'unavailable', reason: 'incompatible-specimen' });
    }
    expect(evaluate({ specimen: ' Serum ' }).status).toBe('ready');
    for (const value of [undefined, null, '', 'unknown']) {
      expect(evaluate({ specimen: value, assayMethodId: value }).status).toBe('ready');
    }
  });

  it('accepts real production-parser inequalities and analytical-limit labels without making points', () => {
    for (const unit of data.policy.measurementUnits) {
      for (const raw of ['0', '10', '<5', '<1', '>20', '≤5', '≥5', '<LOD', '<LOQ']) {
        const measurement = freeze(puberty.parseMeasurement(raw, unit));
        const before = JSON.stringify(measurement);
        const result = evaluate({ measurement });
        expect(result.status).toBe('ready');
        expect(result.median).toEqual({ value: 6.9, unit: 'IU/L' });
        expect(result).not.toHaveProperty('point');
        expect(JSON.stringify(measurement)).toBe(before);
      }
    }
    expect(evaluate({ measurement: { value: null, operator: '<', unit: 'IU/L', censoring: 'LOD' } }).status).toBe('ready');
    expect(evaluate({ measurement: { value: null, operator: '<=', unit: 'IU/L', censoring: 'LOQ' } }).status).toBe('ready');
  });

  it('uses an explicit adapter-validity signal only when no measurement object is supplied', () => {
    expect(evaluate({ measurement: undefined, measurementValid: true }).status).toBe('ready');
    expect(evaluate({ measurement: null, measurementValid: true }).status).toBe('ready');
    expect(evaluate({ measurementValid: false })).toEqual({ status: 'unavailable', reason: 'invalid-measurement' });
    for (const measurement of [null, undefined, {}, [], '10',
      { status: 'invalid', value: 5, unit: 'IU/L' }, { value: -1, unit: 'IU/L' },
      { value: NaN, unit: 'IU/L' }, { value: Infinity, unit: 'IU/L' },
      { value: 0, unit: 'IU/L', operator: '<' }, { value: 5, unit: 'IU/ml' },
      { value: 5, unit: 'IU/L', operator: '~' }, { value: null, unit: 'IU/L', operator: '<' },
      { value: null, unit: 'IU/L', operator: '>', limitKind: 'LOD' }]) {
      expect(evaluate({ measurement })).toEqual({ status: 'unavailable', reason: 'invalid-measurement' });
      if (measurement != null) expect(evaluate({ measurement, measurementValid: true }).status).toBe('unavailable');
    }
  });

  it('gets values and placement from supplied data and returns detached facts only', () => {
    const supplied = structuredClone(data);
    supplied.placement.minimumAgeYearsExclusive = 40;
    supplied.groups.follicular.median.value = 8.2;
    supplied.source.population = 'Fikcyjna populacja testowa';
    supplied.policy.allowedAssayMethodIds = ['fictional-fsh-assay'];
    supplied.policy.allowedSpecimens = ['fictional-test-specimen'];
    supplied.policy.excludedTreatmentFlags.push('fictionalKnownExclusion');
    const input = freeze(context({ ageYears: 45, ageUpperYears: 46,
      assayMethodId: 'fictional-fsh-assay', specimen: 'fictional-test-specimen' }));
    freeze(supplied);
    const before = JSON.stringify({ supplied, input });
    const result = engine.evaluate(supplied, input);
    expect(result).toMatchObject({ status: 'ready', median: { value: 8.2 },
      source: { population: 'Fikcyjna populacja testowa' }, placement: { minimumAgeYearsExclusive: 40 }, ageDomain: null });
    result.median.value = 99;
    result.group.printedN = 1;
    result.source.limitations.push('Fikcyjna zmiana testowa');
    result.policy.allowedSpecimens.push('new');
    expect(JSON.stringify({ supplied, input })).toBe(before);
    expect(engine.evaluate(supplied, { ...input, treatment: { fictionalKnownExclusion: true } }).status).toBe('unavailable');
    expect(engine.evaluate(supplied, context()).status).toBe('unavailable');
  });

  it('fails closed for incomplete source facts or invented reference-cohort age limits', () => {
    for (const supplied of [null, {}, { ...data, groups: null }, { ...data, groups: [] },
      { ...data, groups: { follicular: { ...data.groups.follicular, median: { value: NaN, unit: 'IU/L' } } } },
      { ...data, groups: { follicular: { ...data.groups.follicular, median: { value: 6.9, unit: 'pmol/L' } } } },
      { ...data, ageDomain: { minYears: 18, maxYears: 37 } },
      { ...data, source: { ...data.source, ageDomain: { minYears: 18, maxYears: 37 } } },
      { ...data, placement: { ...data.placement, minimumAgeYearsExclusive: NaN } },
      { ...data, policy: { ...data.policy, noPatientComparison: false } },
      { ...data, source: { ...data.source, limitsDescription: '' } }]) {
      expect(engine.evaluate(supplied, context())).toEqual({ status: 'unavailable', reason: 'source-unavailable' });
    }
  });

  it('exposes the same pure browser production function', () => {
    const window = {};
    vm.runInNewContext(readFileSync(new URL('../../vilda_fsh_source.js', import.meta.url), 'utf8'), { window });
    expect(window.VildaFshSource.evaluate(data, context())).toMatchObject({ status: 'ready', median: { value: 6.9 } });
    expect(Object.keys(window.VildaFshSource)).toEqual(['evaluate']);
  });
});
