import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const puberty = require('../../vilda_lab_puberty.js');
const pubertyData = require('../../vilda_lab_puberty_data.js');
const testosterone = require('../../vilda_lab_testosterone.js');
const testosteroneData = require('../../vilda_lab_testosterone_data.js');
const femaleAge = require('../../vilda_female_tt_age.js');
const bundle = require('../../vilda_hormone_lifespan_data.js');
const html = readFileSync(new URL('../../przelicznik-jednostek.html', import.meta.url), 'utf8');
// Execute the converter's actual adapter, including its identity reset, rather
// than rebuilding context from the source engine's expected input by hand.
const start = html.indexOf('    function currentPatientIdentity()');
const end = html.indexOf('    // ID substancji,');
const source = html.slice(start, end);
const substance = { id: 'testosterone_total' };

function adapter(extra = {}) {
  const events = [], generic = [], host = { hidden: false };
  const context = {
    window: { VildaLabPuberty: puberty, VildaLabPubertyData: pubertyData, VildaLabTestosteroneData: testosteroneData },
    document: { getElementById: id => id === 'labHormoneLifespan' ? host : null },
    sessionStorage: { getItem: () => context.identity },
    identity: 'fictional-tt-girl-a', localOverrideIdentity: 'fictional-tt-girl-a',
    lifespanVault: null, lifespanCurrentSex: null, testosteroneMeasurementContext: {},
    localOverride: { sex: null, age: null, tanner: null, cycle_phase: null },
    overrideSexEl: { value: '' }, overrideAgeEl: { value: '' }, overrideAgeMonthsEl: { value: '' },
    overrideCycleEl: { value: '' }, overrideTannerEl: { value: '' },
    valueEl: { value: '0.65' }, unitEl: { value: 'nmol/L' }, unitTargetEl: { value: 'nmol/L' },
    currentSubstance: substance,
    sourcePatient: { identityKey: 'fictional-tt-girl-a', sourceStatus: 'ready', sex: 'F', ageYears: 12, ageMonths: 0 },
    effectivePatient: { sex: 'F', age: 12 },
    lifespanUI: { update: value => generic.push(value), clear: () => generic.push(null) },
    femaleTtAgeUI: {
      update: value => events.push({ context: value, result: femaleAge.evaluate(bundle.femaleTtAgeData, bundle.femaleTtAgePolicy, value) }),
      clear: () => events.push(null),
    },
    amhAgeReferenceUI: null, e2PhaseSourceUI: null,
    showError: () => {},
    readPubertyPatientContext: () => context.sourcePatient,
    getEffectivePatient: () => context.effectivePatient,
    isPubertySubstance: () => false,
    isPubertyReferenceSubstance: value => value?.id === 'testosterone_total',
    ...extra,
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { context, events, generic, host, update: evaluation => context.updateLifespan(substance, evaluation),
    last: () => events.at(-1), clear: () => context.updateLifespan(null, null) };
}

function evaluate(extra = {}) {
  return testosterone.evaluate({ analyte: substance.id, sex: 'F', value: '.65', unit: 'nmol/L',
    age: { years: 12, months: 0, precision: 'month' }, contextBasis: 'current-patient', ...extra }, testosteroneData);
}

describe('Female TT age — actual converter context adapter and real source reader', () => {
  it('routes the normalized production result into the new source card without changing Mayo', () => {
    const app = adapter(), result = evaluate(), before = structuredClone(result);
    expect(result.referencePreview.byAge.status).toBe('within');
    app.update(result);
    expect(app.host.hidden).toBe(true);
    expect(app.generic.at(-1)).toBeNull();
    expect(app.last().context).toMatchObject({ analyte: 'testosterone_total', sex: 'female',
      contextBasis: 'current-patient', sourceStatus: 'ready', identityKey: app.context.identity,
      ageYears: 12, ageUpperYears: 12 + 1 / 12, ageUpperInclusive: false,
      measurement: result.measurement, treatment: result.input.treatment,
      pregnancy: 'unknown', reproductiveContext: 'unknown', measurementKind: 'unknown' });
    expect(app.last().result).toMatchObject({ status: 'ready', visible: true,
      median: { sourceValue: .42502815745885664 },
      comparison: { status: 'ready', patientPoint: { sourceValue: .65 } } });
    expect(result).toEqual(before);
  });

  it('forwards a detached real Mayo preview without changing canonical bounds or the assessment', () => {
    const app = adapter(), result = evaluate({ value: '1.50', age: { years: 3, months: 0, precision: 'year' } });
    const before = structuredClone(result);
    app.update(result);
    expect(app.last().context.referencePreview).toEqual(result.referencePreview);
    expect(app.last().context.referencePreview.byAge.status).toBe('above');
    expect(app.last().context.referencePreview.byAge.range.bounds.upper.value).toBe(.6934);
    app.last().context.referencePreview.byAge.range.bounds.upper.value = 999;
    expect(result).toEqual(before);
    app.update(result);
    expect(app.last().context.referencePreview.byAge.range.bounds.upper.value).toBe(.6934);
  });

  it('withholds a source context that belongs to a different current person', () => {
    const app = adapter();
    app.update(evaluate());
    app.context.sourcePatient.identityKey = 'fictional-abandoned-tt-person';
    app.update(evaluate());
    expect(app.last()).toBeNull();
  });

  it('forwards normalized postmenopause even when the unchanged Mayo preview remains within', () => {
    const app = adapter(), baseline = evaluate();
    app.update(baseline);
    expect(app.last().result.median).not.toBeNull();
    const result = evaluate({ reproductiveContext: 'postmenopause' }), before = structuredClone(result);
    expect(result.input.reproductiveContext).toBe('postmenopause');
    expect(result.referencePreview.byAge.status).toBe('within');
    app.update(result);
    expect(app.last().context.reproductiveContext).toBe('postmenopause');
    expect(app.last().context.contraindicated).toBe(false);
    expect(app.last().result).toMatchObject({ status: 'unavailable', visible: true,
      reason: 'incompatible-reproductive-context', median: null, curve: [],
      comparison: { patientPoint: null } });
    expect(result).toEqual(before);
  });

  it.each([{ pregnancy: 'yes' }, { reproductiveContext: 'pregnancy' },
    { treatment: { cocp: 'yes' } }, { treatment: { gnrha: 'yes' } },
    { treatment: { sexSteroids: 'yes' } }, { treatment: { exogenousTestosterone: 'yes' } }])(
    'preserves actual normalized pregnancy/therapy exclusions through both engines: %j', extra => {
      const app = adapter(), result = evaluate(extra), before = structuredClone(result);
      expect(result.referenceSelection.status).toBe('unavailable');
      app.update(result);
      expect(app.last().context.treatment).toEqual(result.input.treatment);
      expect(app.last().context.pregnancy).toEqual(result.input.pregnancy);
      expect(app.last().context.reproductiveContext).toEqual(result.input.reproductiveContext);
      expect(app.last().result).toMatchObject({ status: 'unavailable', visible: true, reason: 'contraindicated',
        median: null, curve: [], comparison: { patientPoint: null } });
      expect(result).toEqual(before);
    });

  it('uses a known current main-form GnRHa exclusion without creating a source median', () => {
    const app = adapter();
    app.context.sourcePatient.gnrhaStatus = 'w-trakcie';
    app.update(evaluate());
    expect(app.last().context.contraindicated).toBe(true);
    expect(app.last().result).toMatchObject({ status: 'unavailable', reason: 'contraindicated', median: null });
  });

  it('keeps the target-unit display separate from canonical TT and unchanged laboratory assessment', () => {
    const app = adapter(), result = evaluate({ unit: 'ng/dL', value: '18.74819728872224' });
    const before = structuredClone(result);
    app.context.unitEl.value = 'ng/dL';
    app.context.unitTargetEl.value = 'pg/mL';
    app.update(result);
    expect(app.last().context.displayUnit).toBe('pg/mL');
    expect(app.last().context.measurement).toEqual(result.measurement);
    expect(app.last().result).toMatchObject({ unit: 'pg/mL', median: { sourceUnit: 'nmol/L' },
      comparison: { patientPoint: { sourceUnit: 'nmol/L' } } });
    expect(app.last().result.comparison.patientPoint.sourceValue).toBeCloseTo(.65, 12);
    expect(app.last().result.comparison.patientPoint.value)
      .toBeCloseTo(testosterone.convertMeasurement('.65', 'nmol/L', 'pg/mL').value, 10);
    expect(result).toEqual(before);
    expect(result.referencePreview.byAge.status).toBe('within');
  });

  it('passes the real reported month/day precision, including the final source boundary', () => {
    const app = adapter();
    const month = evaluate({ age: { years: 12, months: 6, precision: 'month' } });
    app.update(month);
    expect(app.last().context).toMatchObject({ ageYears: 12.5, ageUpperYears: 12.5 + 1 / 12, ageUpperInclusive: false });
    expect(app.last().result.median.sourceValue).toBe(.4874143269614546);
    app.update(evaluate({ age: { years: 18, months: 0, precision: 'year' } }));
    expect(app.last().context).toMatchObject({ ageYears: 18, ageUpperYears: 19, ageUpperInclusive: false });
    expect(app.last().result).toMatchObject({ status: 'unavailable', reason: 'unsupported-source-age', median: null });
    app.update(evaluate({ age: { years: 18, months: 0, days: 0, precision: 'day' } }));
    expect(app.last().context).toMatchObject({ ageYears: 18, ageUpperYears: 18, ageUpperInclusive: true });
    expect(app.last().result.median.sourceValue).toBe(.869047786256784);
  });

  it.each([
    { days: 183, lower: 5 / 12, upper: 7 / 12, reason: 'unsupported-source-age' },
    { days: 184, lower: 6 / 12, upper: 7 / 12, groupId: 'female-tt-age-group-1' },
    { days: 364, lower: 11 / 12, upper: 12 / 12, groupId: 'female-tt-age-group-1' },
    { days: 365, lower: 11 / 12, upper: 13 / 12, reason: 'ambiguous-age-group' },
    { days: 366, lower: 12 / 12, upper: 13 / 12, groupId: 'female-tt-age-group-2' },
  ])('keeps the actual calendar-month envelope for female TT reported as $days days', ({ days, lower, upper, groupId, reason }) => {
    const app = adapter();
    const result = testosterone.evaluate({ analyte: substance.id, sex: 'F', value: '.3', unit: 'nmol/L',
      contextBasis: 'current-patient', neonatalAge: {
        postnatalDays: { lower: days, upper: days, source: 'reported-days' },
      } }, testosteroneData);
    const before = structuredClone(result);
    expect(result.ageAtSample).toMatchObject({ status: 'known', source: 'neonatal-days',
      lowerYears: lower, upperYears: upper, upperInclusive: false });
    app.update(result);
    expect(app.last().context).toMatchObject({ ageYears: lower, ageUpperYears: upper, ageUpperInclusive: false });
    // Use the production group reader on the actual adapter context. Neither
    // the generic day/year plotting coordinate nor an invented DOB may choose
    // a calendar-age group when this envelope crosses its boundary.
    const grouped = femaleAge.evaluate(bundle.femaleTtUnder6Data, bundle.femaleTtUnder6Policy, app.last().context);
    if (groupId) {
      expect(grouped).toMatchObject({ status: 'ready', renderMode: 'age-groups', median: { groupId } });
    } else {
      expect(grouped).toMatchObject({ status: 'unavailable', reason, median: null });
    }
    expect(result).toEqual(before);
  });

  it('keeps the existing male infant plotting coordinate separate from the clinical calendar envelope', () => {
    const app = adapter();
    app.context.sourcePatient.sex = 'M';
    const result = testosterone.evaluate({ analyte: substance.id, sex: 'M', value: '.3', unit: 'nmol/L',
      contextBasis: 'current-patient', neonatalAge: {
        postnatalDays: { lower: 183, upper: 183, source: 'reported-days' },
      } }, testosteroneData);
    const before = structuredClone(result), chronological = puberty.resolveAge(result.input);
    expect(result.ageAtSample.lowerYears).not.toBe(chronological.lowerYears);
    app.update(result);
    expect(app.last()).toBeNull();
    expect(app.generic.at(-1)).toMatchObject({ sex: 'male', ageYears: chronological.lowerYears,
      ageUpperYears: chronological.upperYears, ageUpperInclusive: chronological.upperInclusive });
    expect(result).toEqual(before);
  });

  it('preserves censoring and clearing through the production parser and actual adapter', () => {
    const app = adapter();
    app.update(evaluate());
    for (const value of ['<0.1', '>0.1', '<LOD', '<LOQ']) {
      const result = evaluate({ value });
      app.update(result);
      expect(app.last().context.measurement).toEqual(result.measurement);
      expect(app.last().result.median.sourceValue).toBe(.42502815745885664);
      expect(app.last().result.comparison.patientPoint).toBeNull();
    }
    app.clear();
    expect(app.last()).toBeNull();
    expect(app.host.hidden).toBe(false);
  });

  it('clears a stale result before accepting a new identity, then uses only the fresh evaluation', () => {
    const app = adapter(), previous = evaluate();
    app.update(previous);
    expect(app.last().result.status).toBe('ready');
    app.context.identity = 'fictional-tt-girl-b';
    app.context.sourcePatient.identityKey = 'fictional-tt-girl-b';
    app.update(previous);
    expect(app.last()).toBeNull();
    expect(app.context.valueEl.value).toBe('');
    expect(app.host.hidden).toBe(false);
    app.update(evaluate({ age: { years: 13, months: 0, precision: 'month' }, value: '.8' }));
    expect(app.last().result).toMatchObject({ status: 'ready', identityKey: 'fictional-tt-girl-b',
      median: { sourceValue: .5490752992652548 }, comparison: { patientPoint: { sourceValue: .8 } } });
  });

  it('clears the female card on unavailable source, vault lock, historical or male context', () => {
    for (const apply of [
      app => { app.context.sourcePatient.sourceStatus = 'pending'; return evaluate(); },
      app => { app.context.window.VildaVault = { isUnlocked: () => false }; return evaluate(); },
      () => evaluate({ contextBasis: 'sample', sampleDateISO: '2026-01-01' }),
      () => evaluate({ sex: 'M' }),
    ]) {
      const app = adapter();
      app.update(evaluate());
      expect(app.last().result.status).toBe('ready');
      app.update(apply(app));
      expect(app.last()).toBeNull();
      expect(app.host.hidden).toBe(false);
    }
  });
});
