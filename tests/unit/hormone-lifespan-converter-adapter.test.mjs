import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const require = createRequire(import.meta.url);
const puberty = require('../../vilda_lab_puberty.js');
const inhibin = require('../../vilda_lab_inhibin_b.js');
const inhibinData = require('../../vilda_lab_inhibin_b_data.js');
const policy = require('../../vilda_lab_puberty_data.js');
const testosterone = require('../../vilda_lab_testosterone.js');
const testosteroneData = require('../../vilda_lab_testosterone_data.js');
const lifespanReference = require('../../vilda_hormone_lifespan_reference.js');
const lifespanData = require('../../vilda_hormone_lifespan_data.js').patientPointData;
const html = readFileSync(new URL('../../przelicznik-jednostek.html', import.meta.url), 'utf8');
// Execute the actual converter adapter, including identity invalidation and the
// shared age resolver. The fixtures below are fictional, not clinical ranges.
const source = html.slice(html.indexOf('    function currentPatientIdentity()'), html.indexOf('    // ID substancji,'));
const patientReader = html.slice(html.indexOf('    function readPubertyPatientContext()'), html.indexOf('    var pubertyUI ='));

function adapter(extra = {}) {
  const updates = [];
  const context = {
    window: { VildaLabPuberty: puberty, VildaLabPubertyData: policy },
    sessionStorage: { getItem: () => context.identity },
    identity: '', localOverrideIdentity: '', lifespanVault: null, lifespanCurrentSex: null,
    testosteroneMeasurementContext: {},
    localOverride: { sex: null, age: null, tanner: null, cycle_phase: null },
    overrideSexEl: { value: '' }, overrideAgeEl: { value: '' }, overrideAgeMonthsEl: { value: '' },
    overrideCycleEl: { value: '' }, overrideTannerEl: { value: '' },
    valueEl: { value: '40' }, unitEl: { value: 'ng/dL' }, currentSubstance: { id: 'testosterone_total' },
    sourcePatient: { identityKey: '', sourceStatus: 'ready', sex: 'M', ageYears: 12, ageMonths: 0 },
    effectivePatient: { sex: 'M', age: 12 },
    lifespanUI: { update: (value) => updates.push(value), clear: () => updates.push(null) },
    amhAgeReferenceUI: null,
    showError: () => {},
    readPubertyPatientContext: () => context.sourcePatient,
    getEffectivePatient: () => context.effectivePatient,
    isPubertySubstance: (s) => !!s && ['lh', 'fsh', 'inhibin_b'].includes(s.id),
    ...extra,
  };
  // Existing legacy-adapter cases remain explicit; the TT-specific tests below
  // supply the dedicated evaluation route rather than a legacy conversion.
  context.isPubertyReferenceSubstance ||= s => context.isPubertySubstance(s);
  vm.createContext(context);
  vm.runInContext(source, context);
  return { context, updates, update: (...args) => context.updateLifespan(...args), last: () => updates.at(-1) };
}

function evaluated(raw, unit = 'IU/L', input = {}) {
  const data = { sex: 'M', preterm: 'no', age: { years: 0, months: 3, precision: 'month' }, ...input };
  const parse = ['pg/mL', 'ng/L'].includes(unit) ? inhibin.parseMeasurement : puberty.parseMeasurement;
  return { input: data, ageAtSample: puberty.resolveAge(data), measurement: parse(raw, unit) };
}

// Run both production adapters and the real cache reader, including its identity,
// form, visit-mode and freshness checks. The cache contains derived days, no DOB.
function infantAdapter() {
  const id = 'fictional-amh-infant';
  const storage = new Map([['vildaCurrentPatientId', id]]);
  const shared = { sex: 'F', age: '0', ageMonths: '3', weight: '5.5', height: '60' };
  const cached = { version: 1, identityKey: id, mode: ':', form: { ...shared }, liveDay: null,
    minipubertyOnly: true, postnatalDays: { lower: 119, upper: 120, source: 'main-calendar-dates' } };
  const record = { patientId: id, status: 'ready', sourceSex: 'F',
    neonatalAge: { gestationalDays: { lower: 280, upper: 280, source: 'record-gestational-days' } } };
  const persistence = { readShared: () => shared, readJSON: () => cached };
  const app = adapter({
    identity: id, localOverrideIdentity: id, persistence,
    sessionStorage: { getItem: key => storage.get(key) || '' },
    currentSubstance: { id: 'amh' }, effectivePatient: { sex: 'F', age: .25 },
    unitEl: { value: 'ng/mL' }, extractTannerFromAny: () => null,
  });
  Object.assign(app.context.window, {
    sessionStorage: app.context.sessionStorage, VildaPersistence: persistence,
    VildaSession: { getPatient: () => app.context.effectivePatient },
    VildaPubertySource: { kontekstPacjenta: () => record },
    VildaVault: { isUnlocked: () => true },
  });
  loadBrowserScript('vilda_lab_neonatal_context.js', app.context.window);
  vm.runInContext(patientReader, app.context);
  return { ...app, storage, shared, cached, record,
    calculate: () => app.update({ id: 'amh' }, null, { ok: true, siValue: .45, siUnit: 'ng/mL' }) };
}

describe('Hormone lifespan converter adapter — current result only', () => {
  it('passes the real TT evaluation in canonical units with its own age, current G and censoring', () => {
    const app = adapter({
      isPubertyReferenceSubstance: substance => substance?.id === 'testosterone_total',
      window: { VildaLabPuberty: puberty, VildaLabPubertyData: policy, VildaLabTestosteroneData: testosteroneData },
    });
    const input = { analyte: 'testosterone_total', sex: 'M', age: { years: 12, months: 0, precision: 'month' },
      unit: 'ng/dL', puberty: { kind: 'G', stage: 3, appliesToCurrentContext: true }, contextBasis: 'current-patient' };
    for (const [raw, operator] of [['300', '='], ['<300', '<']]) {
      const result = testosterone.evaluate({ ...input, value: raw }, testosteroneData);
      app.update({ id: 'testosterone_total' }, result);
      expect(app.last()).toMatchObject({ sex: 'male', ageYears: 12, ageUpperYears: 12 + 1 / 12,
        puberty: { kind: 'G', stage: 3 }, measurement: { value: 10.401, unit: 'nmol/L', operator } });
      const reference = lifespanReference.evaluate(lifespanData, app.last());
      if (operator === '=') expect(reference.status).toBe('ready');
      else expect(reference.status).not.toBe('ready');
    }
  });

  it('keeps the existing educational day coordinate separate from Mayo completed-month qualification', () => {
    const input = { analyte: 'testosterone_total', sex: 'M', unit: 'ng/dL', value: '100',
      neonatalAge: { postnatalDays: { lower: 183, upper: 183, source: 'fictional-completed-days' } } };
    const result = testosterone.evaluate(input, testosteroneData);
    expect(result.referenceSelection.status).toBe('unavailable');
    const before = structuredClone(result);
    const app = adapter({
      isPubertyReferenceSubstance: substance => substance?.id === 'testosterone_total',
      window: { VildaLabPuberty: puberty, VildaLabPubertyData: policy, VildaLabTestosteroneData: testosteroneData },
    });
    app.update({ id: 'testosterone_total' }, result);
    const chronological = puberty.resolveAge(input);
    expect(app.last()).toMatchObject({ ageYears: chronological.lowerYears, ageUpperYears: chronological.upperYears,
      ageLabel: '183 dni', measurement: { value: 3.467, unit: 'nmol/L', operator: '=' } });
    expect(result).toEqual(before);
  });

  it('passes real normalized LH/Inhibin measurements, including zero, without display rounding', () => {
    for (const [id, raw, unit, value, expectedUnit] of [
      ['lh', '2,125', 'mIU/mL', 2.125, 'IU/L'],
      ['inhibin_b', '80,125', 'ng/L', 80.125, 'pg/mL'],
      ['inhibin_b', '0', 'pg/mL', 0, 'pg/mL'],
    ]) {
      const app = adapter();
      app.context.unitEl.value = unit;
      app.update({ id }, evaluated(raw, unit));
      expect(app.last()).toMatchObject({ measurement: { value, unit: expectedUnit, operator: '=' },
        displayUnit: unit, ageYears: 0.25, ageUpperYears: 1 / 3, ageUpperInclusive: false,
        ageLabel: '3 mies.', preterm: 'no' });
    }
  });

  it('never replaces a censored result with an exact concentration or retains a previous value', () => {
    const app = adapter();
    app.update({ id: 'lh' }, evaluated('2'));
    for (const raw of ['<2', '>2', '≤2', '≥2']) {
      app.update({ id: 'lh' }, evaluated(raw));
      expect(app.last().measurement.value).toBe(2);
      expect(app.last().measurement.operator).not.toBe('=');
    }
    for (const raw of ['', 'bad', '<LOD', 'NaN', '-2']) {
      app.update({ id: 'lh' }, evaluated(raw));
      expect(app.last().measurement).toBeNull();
    }
  });

  it('uses existing converter SI values and refreshes after source-unit/value changes', () => {
    const win = {};
    loadBrowserScript('lab_units_data.js', win);
    loadBrowserScript('lab_unit_converter.js', win);
    const app = adapter();
    for (const [id, value, unit] of [
      ['testosterone_total', 300, 'ng/dL'], ['testosterone_total', 10, 'nmol/L'],
      ['amh', 2, 'ng/mL'], ['estradiol', 20, 'pg/mL'],
    ]) {
      const result = win.LabUnitConverter.convertAll({ substanceId: id, value, fromUnit: unit });
      expect(result.ok).toBe(true);
      app.context.unitEl.value = unit;
      app.update({ id }, null, result);
      expect(app.last().measurement).toEqual({ value: result.siValue, unit: result.siUnit, operator: '=' });
      expect(app.last().displayUnit).toBe(unit);
    }
    app.update({ id: 'amh' }, null, null);
    expect(app.last().measurement).toBeNull();
  });

  it('keeps AMH measurement in converter SI while the source-unit selector independently changes marker labels', () => {
    const win = {};
    loadBrowserScript('lab_units_data.js', win);
    loadBrowserScript('lab_unit_converter.js', win);
    const app = adapter({
      sourcePatient: { identityKey: '', sourceStatus: 'ready', sex: 'F', ageYears: 15, ageMonths: 0 },
      effectivePatient: { sex: 'F', age: 15 },
    });
    let canonicalValue;
    for (const [value, fromUnit] of [[.45, 'ng/mL'], [.45 / .1401, 'pmol/L'], [.45, 'ng/mL']]) {
      app.context.unitEl.value = fromUnit;
      const conversion = win.LabUnitConverter.convertAll({ substanceId: 'amh', value, fromUnit });
      expect(conversion.ok).toBe(true);
      app.update({ id: 'amh' }, null, conversion);
      const context = app.last();
      expect(context.displayUnit).toBe(fromUnit);
      expect(context.measurement).toEqual({ value: conversion.siValue, unit: 'ng/mL', operator: '=' });
      expect(context.measurement.value).toBeCloseTo(.45, 12);
      const reference = lifespanReference.evaluate(lifespanData, context);
      expect(reference).toMatchObject({ status: 'ready', referenceValue: 21.14,
        profile: { id: 'jopling2018-female-amh-age-15-under18' } });
      if (canonicalValue == null) canonicalValue = reference.value;
      expect(reference.value).toBeCloseTo(canonicalValue, 12);
    }
  });

  it('reuses known calendar days for infant AMH and TT without narrowing their uncertainty', () => {
    const app = infantAdapter();
    app.calculate();
    expect(app.last()).toMatchObject({ ageYears: 119 / 366, ageUpperYears: 121 / 365,
      ageUpperInclusive: false, ageLabel: '119–120 dni', preterm: 'no',
      measurement: { value: .45, unit: 'ng/mL', operator: '=' } });
    expect(lifespanReference.evaluate(lifespanData, app.last())).toMatchObject({
      status: 'ready', profile: { id: 'ljubicic2022-female-amh' },
    });
    expect(lifespanReference.evaluate(lifespanData, app.last()).referenceValue).toBeCloseTo(19.04589987344793, 10);
    expect(app.context.readPubertyPatientContext().neonatalAge.postnatalDays)
      .toEqual({ lower: 119, upper: 120, source: 'main-calendar-dates' });
    app.context.currentSubstance = { id: 'testosterone_total' };
    expect(app.context.readPubertyPatientContext().neonatalAge.postnatalDays)
      .toEqual({ lower: 119, upper: 120, source: 'main-calendar-dates' });
    for (const id of ['estradiol', 'inhibin_b']) {
      app.context.currentSubstance = { id };
      expect(app.context.readPubertyPatientContext().neonatalAge.postnatalDays).toBeNull();
    }
    for (const id of ['estradiol']) {
      app.context.currentSubstance = { id };
      app.update({ id });
      expect(app.last()).toMatchObject({ ageYears: .25, ageUpperYears: 1 / 3, ageLabel: '3 mies.' });
    }
    app.context.currentSubstance = { id: 'amh' };
    app.calculate();
    expect(app.last().ageYears).toBe(119 / 366);
  });

  it('lets a local AMH age correction supersede calendar days without changing the main patient', () => {
    const app = infantAdapter();
    app.calculate();
    app.context.localOverride.age = .5;
    app.context.overrideAgeEl.value = '0';
    app.context.overrideAgeMonthsEl.value = '6';
    app.calculate();
    expect(app.last()).toMatchObject({ ageYears: .5, ageUpperYears: 7 / 12, ageLabel: '6 mies.' });
    expect(app.shared.ageMonths).toBe('3');
    expect(app.cached.postnatalDays).toEqual({ lower: 119, upper: 120, source: 'main-calendar-dates' });
    app.context.localOverride.age = null;
    app.calculate();
    expect(app.last().ageYears).toBe(119 / 366);
  });

  it('does not use stale infant AMH days after form, identity, visit mode or cache freshness changes', () => {
    const mutations = [
      app => { app.shared.ageMonths = '4'; },
      app => { app.shared.weight = '6'; },
      app => { app.cached.identityKey = 'fictional-other-infant'; },
      app => { app.storage.set('vildaLoadChoiceV1', 'restore'); },
      app => { app.cached.liveDay = '1900-1-1'; },
      app => { app.cached.postnatalDays.source = 'unknown-source'; },
    ];
    for (const mutate of mutations) {
      const app = infantAdapter();
      app.calculate();
      expect(app.last().ageLabel).toBe('119–120 dni');
      mutate(app);
      app.calculate();
      const months = Number(app.shared.ageMonths);
      expect(app.last()).toMatchObject({ ageYears: months / 12, ageLabel: `${months} mies.` });
      expect(app.last().ageUpperYears).toBeCloseTo((months + 1) / 12, 14);
    }
    const app = infantAdapter();
    app.calculate();
    app.storage.set('vildaCurrentPatientId', 'fictional-next-infant');
    app.calculate();
    expect(app.last()).toMatchObject({ sourceStatus: 'unavailable', ageYears: null, measurement: null });
    expect(app.context.valueEl.value).toBe('');
    app.record.patientId = 'fictional-next-infant';
    app.calculate();
    expect(app.last()).toMatchObject({ sourceStatus: 'ready', ageYears: .25, ageLabel: '3 mies.' });
  });

  it('retains completed months for AMH when there is no qualified postnatal age or the source is locked/loading', () => {
    const app = infantAdapter();
    app.cached.postnatalDays = null;
    app.calculate();
    expect(app.last()).toMatchObject({ ageYears: .25, ageUpperYears: 1 / 3, ageLabel: '3 mies.' });
    expect(lifespanReference.evaluate(lifespanData, app.last()).referenceValue).toBe(16.999);
    app.cached.postnatalDays = { lower: 119, upper: 120, source: 'main-calendar-dates' };
    app.record.status = 'loading';
    app.calculate();
    expect(app.last()).toMatchObject({ sourceStatus: 'loading', ageYears: null, measurement: null });
    app.record.status = 'ready';
    app.context.window.VildaVault.isUnlocked = () => false;
    app.calculate();
    expect(app.last()).toMatchObject({ sourceStatus: 'unavailable', ageYears: null, measurement: null });
  });

  it('retains year/month/day uncertainty using the existing resolver, including local overrides', () => {
    const app = adapter();
    app.context.sourcePatient.ageMonths = null;
    app.update({ id: 'testosterone_total' });
    expect(app.last()).toMatchObject({ ageYears: 12, ageUpperYears: 13, ageLabel: '12 lat' });
    app.context.localOverride.age = 12.5;
    app.context.overrideAgeEl.value = '12';
    app.context.overrideAgeMonthsEl.value = '6';
    app.update({ id: 'testosterone_total' });
    expect(app.last()).toMatchObject({ ageYears: 12.5, ageUpperYears: 12.5 + 1 / 12, ageLabel: '12 lat i 6 mies.' });
    app.context.localOverride.age = null;
    app.context.sourcePatient.ageYears = 0;
    app.context.sourcePatient.neonatalAge = { postnatalDays: { lower: 90, upper: 90, source: 'manual-completed-days' } };
    app.update({ id: 'testosterone_total' });
    expect(app.last()).toMatchObject({ ageYears: 90 / 366, ageUpperYears: 91 / 365, ageLabel: '90 dni' });
  });

  it('does not invent an exact age for absent or malformed reported age', () => {
    const app = adapter();
    for (const ageYears of [null, -1, 'bad', 12.5]) {
      app.context.sourcePatient.ageYears = ageYears;
      app.update({ id: 'testosterone_total' });
      expect(app.last().ageYears).toBeNull();
      expect(app.last().ageUpperYears).toBeNull();
    }
  });

  it('preserves the half-open completed-month interval at the first birthday', () => {
    const app = adapter();
    app.update({ id: 'lh' }, evaluated('2', 'IU/L', { age: { years: 0, months: 11, precision: 'month' } }));
    expect(app.last()).toMatchObject({ ageYears: 11 / 12, ageUpperYears: 1, ageUpperInclusive: false });
  });

  it('keeps legacy fractional age markers without inventing precision for a concentration point', () => {
    const app = adapter();
    app.context.sourcePatient.ageYears = 12.5;
    app.context.sourcePatient.ageMonths = null;
    app.context.effectivePatient.age = 12.5;
    app.update({ id: 'testosterone_total' }, null, { ok: true, siValue: 4, siUnit: 'nmol/L' });
    expect(app.last()).toMatchObject({ ageYears: 12.5, ageUpperYears: null, measurement: null });
  });

  it('distinguishes missing context from documented treatment, stimulation and incompatible sample material', () => {
    const app = adapter();
    app.update({ id: 'lh' }, evaluated('2', 'IU/L', { treatment: { context: 'unknown', gnrha: 'unknown' } }));
    expect(app.last().contraindicated).toBe(false); // No known exclusion; not untreated confirmation.
    for (const input of [
      { treatment: { gnrha: 'yes' } }, { treatment: { sexSteroids: 'yes' } },
      { treatment: { context: 'hormonal' } }, { measurementKind: 'stimulated' }, { specimen: 'urine' },
    ]) {
      app.update({ id: 'lh' }, evaluated('2', 'IU/L', input));
      expect(app.last().contraindicated).toBe(true);
    }
    app.context.sourcePatient.gnrhaStatus = 'w-trakcie';
    app.update({ id: 'testosterone_total' });
    expect(app.last().contraindicated).toBe(true);
  });

  it('passes only an actual reported sample method, never a configured source preference', () => {
    const app = adapter();
    for (const confirmation of ['unknown', 'configured', 'reported']) {
      app.update({ id: 'lh' }, evaluated('2', 'IU/L', { assay: { methodId: 'fictional-method', confirmation } }));
      expect(app.last().assayMethodId).toBe(confirmation === 'reported' ? 'fictional-method' : null);
    }
  });

  it('forwards the current typed puberty observation to the actual FSH group selector', () => {
    const app = adapter();
    for (const [sex, kind, median, profileId] of [
      ['M', 'G', 0.48, 'zec2012-male-fsh-age-1-8'],
      ['F', 'Th', 2.57, 'zec2012-female-fsh-age-1-4']
    ]) {
      const input = { sex, contextBasis: 'current-patient',
        age: { years: 3, months: 0, precision: 'month' },
        puberty: { kind, stage: 1, appliesToCurrentContext: true } };
      const assessment = evaluated('0,48', 'mIU/mL', input);
      app.update({ id: 'fsh' }, assessment);
      expect(app.last().puberty).toEqual({ kind, stage: 1 });
      expect(app.last().puberty).not.toBe(assessment.input.puberty);
      expect(lifespanReference.evaluate(lifespanData, app.last())).toMatchObject({
        status: 'ready', referenceValue: median, profile: { id: profileId }
      });
    }
  });

  it('does not reuse a historical, unconfirmed or bare Tanner observation for the childhood dot', () => {
    const app = adapter();
    const current = { contextBasis: 'current-patient',
      age: { years: 3, months: 0, precision: 'month' },
      puberty: { kind: 'G', stage: 1, appliesToCurrentContext: true } };
    app.context.sourcePatient.tanner = 1;
    app.context.localOverride.tanner = 1;
    for (const extras of [
      { contextBasis: undefined }, { contextBasis: 'sample-date' },
      { sampleDateISO: '2020-01-01' },
      { puberty: { kind: 'G', stage: 1, appliesToCurrentContext: false } },
      { puberty: { kind: 'G', stage: 1 } }, { puberty: null }, { puberty: 1 }
    ]) {
      app.update({ id: 'fsh' }, evaluated('0.48', 'IU/L', current));
      expect(app.last().puberty).toEqual({ kind: 'G', stage: 1 });
      app.update({ id: 'fsh' }, evaluated('0.48', 'IU/L', { ...current, ...extras }));
      expect(app.last().puberty).toBeNull();
    }
  });

  it('rechecks the current stage and sex rather than retaining the previously eligible FSH group', () => {
    const app = adapter();
    const current = { contextBasis: 'current-patient',
      age: { years: 3, months: 0, precision: 'month' },
      puberty: { kind: 'G', stage: 1, appliesToCurrentContext: true } };
    app.update({ id: 'fsh' }, evaluated('0.48', 'IU/L', current));
    expect(lifespanReference.evaluate(lifespanData, app.last()).status).toBe('ready');
    for (const extras of [
      { puberty: { ...current.puberty, stage: 2 } },
      { puberty: { ...current.puberty, kind: 'P' } }, { sex: 'F' }
    ]) {
      app.update({ id: 'fsh' }, evaluated('0.48', 'IU/L', { ...current, ...extras }));
      expect(lifespanReference.evaluate(lifespanData, app.last()))
        .toEqual({ status: 'unavailable', reason: 'incompatible-puberty-stage' });
    }
    app.context.sourcePatient.sourceStatus = 'loading';
    app.update({ id: 'fsh' }, evaluated('0.48', 'IU/L', current));
    expect(app.last().puberty).toBeNull();
    expect(app.last().measurement).toBeNull();
  });

  it('retains treatment and sample method exclusions when a current Tanner 1 qualifies for Zec', () => {
    const app = adapter();
    const current = { contextBasis: 'current-patient',
      age: { years: 3, months: 0, precision: 'month' },
      puberty: { kind: 'G', stage: 1, appliesToCurrentContext: true } };
    for (const extras of [
      { treatment: { context: 'hormonal' } }, { treatment: { gnrha: 'yes' } },
      { treatment: { sexSteroids: 'yes' } }, { measurementKind: 'stimulated' }
    ]) {
      app.update({ id: 'fsh' }, evaluated('0.48', 'IU/L', { ...current, ...extras }));
      expect(lifespanReference.evaluate(lifespanData, app.last()))
        .toEqual({ status: 'unavailable', reason: 'contraindicated' });
    }
    for (const [confirmation, status] of [['configured', 'ready'], ['reported', 'unavailable']]) {
      app.update({ id: 'fsh' }, evaluated('0.48', 'IU/L', { ...current,
        assay: { methodId: 'AutoDELFIA', confirmation } }));
      const result = lifespanReference.evaluate(lifespanData, app.last());
      expect(result.status).toBe(status);
      if (status === 'unavailable') expect(result.reason).toBe('incompatible-assay');
    }
  });

  it('removes the current result when patient identity changes and suppresses unavailable/locked context', () => {
    const app = adapter();
    app.context.localOverride.age = 13;
    app.context.identity = 'fictional-next-patient';
    app.context.sourcePatient.identityKey = 'fictional-next-patient';
    app.context.syncPatientIdentity();
    expect(app.context.valueEl.value).toBe('');
    expect(app.context.localOverride.age).toBeNull();
    expect(app.updates).toEqual([null]);
    const conversion = { ok: true, siValue: 4, siUnit: 'nmol/L' };
    app.context.sourcePatient.sourceStatus = 'loading';
    app.update({ id: 'testosterone_total' }, null, conversion);
    expect(app.last()).toMatchObject({ measurement: null, ageYears: null, sourceStatus: 'loading' });
    app.context.sourcePatient.sourceStatus = 'ready';
    app.context.window.VildaVault = { isUnlocked: () => false };
    app.update({ id: 'testosterone_total' }, null, conversion);
    expect(app.last()).toMatchObject({ measurement: null, ageYears: null, sourceStatus: 'unavailable' });
  });

  it('discards a previously calculated result when an identity change reaches the adapter directly', () => {
    const app = adapter();
    app.context.identity = 'fictional-next-patient';
    app.context.sourcePatient.identityKey = 'fictional-next-patient';
    app.update({ id: 'testosterone_total' }, null, { ok: true, siValue: 4, siUnit: 'nmol/L' });
    expect(app.context.valueEl.value).toBe('');
    expect(app.last().measurement).toBeNull();
  });

  it('passes already known reproductive context to the adult female AMH source without changing basal treatment context', () => {
    const app = adapter({
      currentSubstance: { id: 'amh' }, unitEl: { value: 'ng/mL' },
      sourcePatient: { identityKey: '', sourceStatus: 'ready', sex: 'F', ageYears: 25, ageMonths: 0 },
      effectivePatient: { sex: 'F', age: 25, cycle_phase: null },
    });
    const conversion = { ok: true, siValue: .45, siUnit: 'ng/mL' };
    for (const cyclePhase of ['pregnancy_t1', 'pregnancy_t2', 'pregnancy_t3', 'postmenopause']) {
      app.context.effectivePatient.cycle_phase = cyclePhase;
      app.update({ id: 'amh' }, null, conversion);
      expect(app.last()).toMatchObject({ cyclePhase, contraindicated: false,
        sex: 'female', ageYears: 25, measurement: { value: .45, unit: 'ng/mL' } });
      expect(lifespanReference.evaluate(lifespanData, app.last()))
        .toEqual({ status: 'unavailable', reason: 'incompatible-reproductive-context' });
    }
    for (const cyclePhase of [null, 'unknown', 'follicular', 'ovulation', 'luteal']) {
      app.context.effectivePatient.cycle_phase = cyclePhase;
      app.update({ id: 'amh' }, null, conversion);
      expect(lifespanReference.evaluate(lifespanData, app.last())).toMatchObject({
        status: 'ready', referenceValue: 25.7, profile: { id: 'fda2017-female-amh-age-18-under26' },
      });
    }
    app.context.sourcePatient.gnrhaStatus = 'w-trakcie';
    app.update({ id: 'amh' }, null, conversion);
    expect(lifespanReference.evaluate(lifespanData, app.last()))
      .toEqual({ status: 'unavailable', reason: 'contraindicated' });
  });

  it('does not retain a reproductive source context when the current patient becomes unavailable', () => {
    const app = adapter({
      currentSubstance: { id: 'amh' }, unitEl: { value: 'ng/mL' },
      sourcePatient: { identityKey: '', sourceStatus: 'ready', sex: 'F', ageYears: 25, ageMonths: 0 },
      effectivePatient: { sex: 'F', age: 25, cycle_phase: 'postmenopause' },
    });
    const conversion = { ok: true, siValue: .45, siUnit: 'ng/mL' };
    app.update({ id: 'amh' }, null, conversion);
    expect(app.last().cyclePhase).toBe('postmenopause');
    app.context.sourcePatient.sourceStatus = 'loading';
    app.update({ id: 'amh' }, null, conversion);
    expect(app.last()).toMatchObject({ cyclePhase: null, measurement: null, ageYears: null });
  });
});

describe('Żeńskie E2 — aktualny kontekst bez dodatkowego formularza', () => {
  function femaleE2Adapter(years = 12, months = 0) {
    const app = adapter({
      currentSubstance: { id: 'estradiol' }, unitEl: { value: 'pmol/L' },
      sourcePatient: { identityKey: '', sourceStatus: 'ready', sex: 'F',
        ageYears: years, ageMonths: months, preterm: 'no' },
    });
    app.context.getEffectivePatient = () => ({ sex: app.context.sourcePatient.sex,
      age: years + months / 12, cycle_phase: app.context.localOverride.cycle_phase });
    const calculate = () => app.update({ id: 'estradiol' }, null,
      { ok: true, siValue: 50, siUnit: 'pmol/L' });
    return { ...app, calculate, reference: () => lifespanReference.evaluate(lifespanData, app.last()) };
  }

  it('uses the known current female age and conversion without inventing a sample context or Tanner', () => {
    const app = femaleE2Adapter();
    app.calculate();
    expect(app.last()).toMatchObject({ analyte: 'estradiol', sex: 'female', ageYears: 12,
      ageUpperYears: 12 + 1 / 12, puberty: null, specimen: null, assayMethodId: null,
      measurement: { value: 50, unit: 'pmol/L', operator: '=' }, contraindicated: false });
    expect(app.reference()).toMatchObject({ status: 'ready', referenceValue: 52.46318409704675,
      profile: { id: 'madsen2022-female-e2-age-6-18' } });
  });

  it('preserves known current pregnancy and hormonal facts, including for the existing infant source', () => {
    const facts = [
      { pregnancy: 'yes' }, { pregnancy: true }, { reproductiveContext: 'pregnancy' },
      { treatment: { context: 'hormonal' } },
      ...['gnrha', 'sexSteroids', 'cocp', 'exogenousTestosterone'].flatMap(key =>
        ['yes', true].map(value => ({ treatment: { [key]: value } }))),
    ];
    for (const [years, months, median] of [[12, 0, 52.46318409704675], [0, 3, 21.616]]) {
      const app = femaleE2Adapter(years, months);
      app.calculate();
      expect(app.reference()).toMatchObject({ status: 'ready', referenceValue: median });
      for (const known of facts) {
        app.context.testosteroneMeasurementContext = known;
        const before = structuredClone(known);
        app.calculate();
        expect(app.last()).toMatchObject({ contraindicated: true,
          measurement: { value: 50, unit: 'pmol/L', operator: '=' } });
        expect(app.reference()).toEqual({ status: 'unavailable', reason: 'contraindicated' });
        expect(known).toEqual(before);
      }
    }
  });

  it('keeps unknown context unknown and does not borrow a dated result, method, material or test protocol', () => {
    for (const known of [{}, { pregnancy: 'unknown', treatment: { sexSteroids: 'unknown' } },
      { pregnancy: 'no', treatment: { cocp: 'no' } },
      { pregnancy: 'yes', contextBasis: 'sample' },
      { treatment: { sexSteroids: 'yes' }, sampleDateISO: '2020-01-01' },
      { assay: { confirmation: 'reported', methodId: 'fictional-immunoassay' },
        specimen: 'plasma', measurementKind: 'stimulated', collectionTime: 'evening' }]) {
      for (const [years, months] of [[12, 0], [0, 3]]) {
        const app = femaleE2Adapter(years, months);
        app.context.testosteroneMeasurementContext = known;
        const before = structuredClone(known);
        app.calculate();
        expect(app.last()).toMatchObject({ contraindicated: false, assayMethodId: null, specimen: null });
        expect(app.reference().status).toBe('ready');
        expect(known).toEqual(before);
      }
    }
    // A negative in another carrier must not erase an explicit current fact.
    const app = femaleE2Adapter();
    app.context.localOverride.cycle_phase = 'pregnancy_t2';
    app.context.testosteroneMeasurementContext = { pregnancy: 'no', treatment: { sexSteroids: 'no' } };
    app.calculate();
    expect(app.last().contraindicated).toBe(true);
  });

  it('reuses a normal known cycle phase and blocks explicit pregnancy and postmenopause without changing the result', () => {
    const app = femaleE2Adapter();
    for (const cycle of [null, 'follicular', 'ovulation', 'luteal']) {
      app.context.localOverride.cycle_phase = cycle;
      app.calculate();
      expect(app.reference()).toMatchObject({ status: 'ready', referenceValue: 52.46318409704675 });
    }
    for (const cycle of ['pregnancy_t1', 'pregnancy_t2', 'pregnancy_t3', 'postmenopause']) {
      app.context.localOverride.cycle_phase = cycle;
      app.calculate();
      expect(app.reference().status).toBe('unavailable');
      expect(app.last().measurement).toEqual({ value: 50, unit: 'pmol/L', operator: '=' });
    }
  });

  it('clears E2 facts and the old measurement on patient changes, including a stale conversion', () => {
    const app = femaleE2Adapter();
    app.context.testosteroneMeasurementContext = { treatment: { cocp: 'yes' } };
    app.context.localOverride.cycle_phase = 'pregnancy_t1';
    app.calculate();
    expect(app.last().contraindicated).toBe(true);
    app.context.identity = 'fictional-next-e2-patient';
    app.context.sourcePatient.identityKey = app.context.identity;
    app.calculate();
    expect(app.last().measurement).toBeNull();
    expect(app.context.valueEl.value).toBe('');
    expect(app.context.localOverride.cycle_phase).toBeNull();
    expect(app.context.testosteroneMeasurementContext).toEqual({});
    app.calculate();
    expect(app.last().contraindicated).toBe(false);
    expect(app.reference().status).toBe('ready');
  });

  it('does not revive positive facts after F→M→F and does not borrow them from an unavailable source', () => {
    const app = femaleE2Adapter();
    app.context.testosteroneMeasurementContext = { treatment: { sexSteroids: 'yes' } };
    app.context.localOverride.cycle_phase = 'pregnancy_t3';
    app.calculate();
    expect(app.last().contraindicated).toBe(true);
    app.context.sourcePatient.sex = 'M';
    app.calculate();
    expect(app.context.testosteroneMeasurementContext).toEqual({});
    expect(app.context.localOverride.cycle_phase).toBeNull();
    app.context.sourcePatient.sex = 'F';
    app.calculate();
    expect(app.reference().status).toBe('ready');
    app.context.testosteroneMeasurementContext = { pregnancy: 'yes' };
    app.context.sourcePatient.sourceStatus = 'loading';
    app.calculate();
    expect(app.last()).toMatchObject({ measurement: null, contraindicated: false });
  });

  it('drops a stale legacy cycle in the same update that detects M→F', () => {
    const app = femaleE2Adapter();
    app.context.lifespanCurrentSex = 'M';
    app.context.localOverride.cycle_phase = 'pregnancy_t1';
    app.context.testosteroneMeasurementContext = { pregnancy: 'yes' };
    app.calculate();
    expect(app.context.localOverride.cycle_phase).toBeNull();
    expect(app.context.testosteroneMeasurementContext).toEqual({});
    expect(app.last()).toMatchObject({ contraindicated: false, cyclePhase: null });
    expect(app.reference().status).toBe('ready');
  });
});

describe('Inhibin B current reproductive context — existing form only', () => {
  function currentEvaluation(extra = {}) {
    return inhibin.evaluate({ analyte: 'inhibin_b', sex: 'F', value: 33, unit: 'pg/mL',
      age: { years: 30, months: 0, precision: 'month' }, contextBasis: 'current-patient',
      reproductiveContext: 'unknown', ...extra }, inhibinData);
  }

  function femaleAdapter() {
    return adapter({
      currentSubstance: { id: 'inhibin_b' }, unitEl: { value: 'pg/mL' },
      sourcePatient: { identityKey: '', sourceStatus: 'ready', sex: 'F', ageYears: 30, ageMonths: 0 },
      effectivePatient: { sex: 'F', age: 30, cycle_phase: null },
    });
  }

  it('transports normalized current postmenopause and clears it on the next unknown evaluation', () => {
    const app = femaleAdapter();
    const assessment = currentEvaluation({ reproductiveContext: 'postmenopause' });
    expect(assessment.input).toMatchObject({ reproductiveContext: 'postmenopause' });
    expect(assessment.input.cycle_phase).toBeUndefined();
    const snapshot = JSON.stringify(assessment);
    app.update({ id: 'inhibin_b' }, assessment);
    expect(app.last()).toMatchObject({ cyclePhase: 'postmenopause', contraindicated: false,
      measurement: { value: 33, unit: 'pg/mL' } });
    expect(lifespanReference.evaluate(lifespanData, app.last()))
      .toEqual({ status: 'unavailable', reason: 'incompatible-reproductive-context' });
    expect(JSON.stringify(assessment)).toBe(snapshot);
    app.update({ id: 'inhibin_b' }, currentEvaluation());
    expect(app.last().cyclePhase).toBeNull();
    expect(lifespanReference.evaluate(lifespanData, app.last()))
      .toMatchObject({ status: 'ready', referenceValue: 30 });
  });

  it('reuses a known current estradiol context when inhibin context is missing or unknown', () => {
    const app = femaleAdapter();
    for (const cyclePhase of ['pregnancy_t1', 'pregnancy_t2', 'pregnancy_t3', 'postmenopause']) {
      app.context.effectivePatient.cycle_phase = cyclePhase;
      for (const reproductiveContext of [undefined, null, '', 'unknown']) {
        app.update({ id: 'inhibin_b' }, currentEvaluation({ reproductiveContext }));
        expect(app.last()).toMatchObject({ cyclePhase, contraindicated: false });
        expect(lifespanReference.evaluate(lifespanData, app.last()))
          .toEqual({ status: 'unavailable', reason: 'incompatible-reproductive-context' });
      }
    }
    for (const cyclePhase of [null, 'unknown', 'follicular', 'ovulation', 'luteal']) {
      app.context.effectivePatient.cycle_phase = cyclePhase;
      app.update({ id: 'inhibin_b' }, currentEvaluation());
      expect(lifespanReference.evaluate(lifespanData, app.last()))
        .toMatchObject({ status: 'ready', referenceValue: 30 });
    }
  });

  it('prefers an explicit current inhibin selection to a previous selection for another analyte', () => {
    const app = femaleAdapter();
    app.context.effectivePatient.cycle_phase = 'follicular';
    app.update({ id: 'inhibin_b' }, currentEvaluation({ reproductiveContext: 'postmenopause' }));
    expect(app.last().cyclePhase).toBe('postmenopause');
    app.context.effectivePatient.cycle_phase = 'postmenopause';
    for (const reproductiveContext of ['follicular', 'early_follicular', 'late_follicular', 'ovulation', 'luteal', 'mid_luteal', 'late_luteal']) {
      app.update({ id: 'inhibin_b' }, currentEvaluation({ reproductiveContext }));
      expect(app.last().cyclePhase).toBe(reproductiveContext);
      expect(lifespanReference.evaluate(lifespanData, app.last())).toMatchObject({ status: 'ready' });
    }
  });

  it('does not import current or historical reproductive context into a dated or unspecified sample', () => {
    const app = femaleAdapter();
    app.context.effectivePatient.cycle_phase = 'pregnancy_t1';
    for (const input of [
      { contextBasis: 'sample' }, { sampleDateISO: '2020-01-01' },
    ]) {
      app.update({ id: 'inhibin_b' }, currentEvaluation({ reproductiveContext: 'postmenopause', ...input }));
      expect(app.last().cyclePhase).toBeNull();
    }
    const legacy = currentEvaluation({ reproductiveContext: 'postmenopause' });
    delete legacy.input.contextBasis;
    app.update({ id: 'inhibin_b' }, legacy);
    expect(app.last().cyclePhase).toBeNull();
  });

  it('clears local context at an identity change and does not use an unavailable or opposite-sex source', () => {
    const app = femaleAdapter();
    app.context.getEffectivePatient = () => ({ sex: 'F', age: 30,
      cycle_phase: app.context.localOverride.cycle_phase });
    app.context.localOverride.cycle_phase = 'pregnancy_t2';
    app.update({ id: 'inhibin_b' }, currentEvaluation());
    expect(app.last().cyclePhase).toBe('pregnancy_t2');
    app.context.identity = 'fictional-next-inhibin-patient';
    app.context.sourcePatient.identityKey = app.context.identity;
    app.update({ id: 'inhibin_b' }, currentEvaluation({ reproductiveContext: 'postmenopause' }));
    expect(app.context.localOverride.cycle_phase).toBeNull();
    expect(app.last()).toMatchObject({ cyclePhase: null, measurement: null });
    app.update({ id: 'inhibin_b' }, currentEvaluation());
    expect(app.last().cyclePhase).toBeNull();
    expect(lifespanReference.evaluate(lifespanData, app.last())).toMatchObject({ status: 'ready' });
    app.context.sourcePatient.sourceStatus = 'loading';
    app.update({ id: 'inhibin_b' }, currentEvaluation({ reproductiveContext: 'postmenopause' }));
    expect(app.last()).toMatchObject({ cyclePhase: null, measurement: null, ageYears: null });
    app.context.sourcePatient.sourceStatus = 'ready';
    app.context.getEffectivePatient = () => ({ sex: 'M', age: 30, cycle_phase: 'postmenopause' });
    app.update({ id: 'inhibin_b' }, currentEvaluation());
    expect(app.last().cyclePhase).toBeNull();
    app.update({ id: 'inhibin_b' }, currentEvaluation({ sex: 'M', reproductiveContext: 'postmenopause' }));
    expect(app.last().cyclePhase).toBeNull();
    expect(lifespanReference.evaluate(lifespanData, app.last())).toMatchObject({ status: 'ready',
      profile: { id: 'borelli2025-male-inhb' } });
  });

});

describe('Female LH/FSH current known exclusions — educational point only', () => {
  function currentEvaluation(analyte, extra = {}) {
    return puberty.evaluate({ analyte, sex: 'F', value: '3', unit: 'IU/L',
      age: { years: 12, months: 0, precision: 'month' }, contextBasis: 'current-patient',
      referenceSelection: 'automatic', reproductiveContext: 'unknown', ...extra }, policy);
  }

  function femaleAdapter() {
    const app = adapter({
      currentSubstance: { id: 'lh' }, unitEl: { value: 'IU/L' },
      sourcePatient: { identityKey: '', sourceStatus: 'ready', sex: 'F', ageYears: 12, ageMonths: 0 },
    });
    app.context.getEffectivePatient = () => ({ sex: app.context.sourcePatient.sex, age: 12,
      cycle_phase: app.context.localOverride.cycle_phase });
    return app;
  }

  it('keeps explicit current pregnancy after switching from the existing estradiol control to LH/FSH', () => {
    const app = femaleAdapter();
    for (const cyclePhase of ['pregnancy_t1', 'pregnancy_t2', 'pregnancy_t3']) {
      app.context.localOverride.cycle_phase = cyclePhase;
      app.update({ id: 'estradiol' }, null, { ok: true, siValue: 100, siUnit: 'pmol/L' });
      for (const id of ['lh', 'fsh']) {
        const result = currentEvaluation(id);
        const before = structuredClone(result);
        expect(result.input.reproductiveContext).toBe('unknown');
        expect(result.input.pregnancy).toBeUndefined();
        app.update({ id }, result);
        expect(app.last()).toMatchObject({ contraindicated: true, cyclePhase: id === 'lh' ? cyclePhase : null,
          measurement: { value: 3, unit: 'IU/L', operator: '=' } });
        expect(lifespanReference.evaluate(lifespanData, app.last()))
          .toEqual({ status: 'unavailable', reason: 'contraindicated' });
        expect(result).toEqual(before); // No change to laboratory axes or a saved evaluation.
      }
    }
    app.context.localOverride.cycle_phase = null;
    for (const id of ['lh', 'fsh']) {
      app.update({ id }, currentEvaluation(id));
      expect(app.last().contraindicated).toBe(false);
      expect(lifespanReference.evaluate(lifespanData, app.last()).status).toBe('ready');
    }
  });

  it('preserves already reported positive hormonal facts without copying another assay or sample context', () => {
    const app = femaleAdapter();
    const facts = [
      { pregnancy: 'yes' }, { pregnancy: true }, { reproductiveContext: 'pregnancy' },
      { treatment: { context: 'hormonal' } },
      ...['gnrha', 'sexSteroids', 'cocp', 'exogenousTestosterone'].flatMap(key =>
        ['yes', true].map(value => ({ treatment: { [key]: value } }))),
    ];
    for (const known of facts) {
      app.context.testosteroneMeasurementContext = known;
      for (const id of ['lh', 'fsh']) {
        app.update({ id }, currentEvaluation(id));
        expect(app.last().contraindicated).toBe(true);
        expect(lifespanReference.evaluate(lifespanData, app.last()))
          .toEqual({ status: 'unavailable', reason: 'contraindicated' });
      }
    }
    for (const known of [{}, { pregnancy: 'unknown', treatment: { cocp: 'unknown' } },
      { pregnancy: 'no', treatment: { context: 'none', cocp: 'no' } },
      { collectionTime: 'evening', specimen: 'plasma', measurementKind: 'stimulated',
        assay: { confirmation: 'reported', methodId: 'fictional-other-assay' } }]) {
      app.context.testosteroneMeasurementContext = known;
      for (const id of ['lh', 'fsh']) {
        const result = currentEvaluation(id);
        const before = structuredClone(result);
        app.update({ id }, result);
        expect(app.last()).toMatchObject({ contraindicated: false, assayMethodId: null });
        expect(lifespanReference.evaluate(lifespanData, app.last()).status).toBe('ready');
        expect(result).toEqual(before);
      }
    }
  });

  it('does not import current facts into a dated, unspecified or historical sample', () => {
    const app = femaleAdapter();
    app.context.localOverride.cycle_phase = 'pregnancy_t2';
    app.context.testosteroneMeasurementContext = { treatment: { cocp: 'yes' }, pregnancy: 'yes' };
    app.context.sourcePatient.gnrhaStatus = 'w-trakcie';
    for (const id of ['lh', 'fsh']) {
      for (const input of [{ contextBasis: 'sample' }, { sampleDateISO: '2020-01-01' }]) {
        app.update({ id }, currentEvaluation(id, input));
        expect(app.last().contraindicated).toBe(false);
        expect(lifespanReference.evaluate(lifespanData, app.last()).status).toBe('ready');
      }
      const unspecified = currentEvaluation(id);
      delete unspecified.input.contextBasis;
      app.context.sourcePatient.gnrhaStatus = null;
      app.update({ id }, unspecified);
      expect(app.last().contraindicated).toBe(false);
      app.update({ id }, currentEvaluation(id, { contextBasis: 'sample', treatment: { sexSteroids: 'yes' } }));
      expect(app.last().contraindicated).toBe(true); // Explicit sample facts remain meaningful.
    }
    app.context.localOverride.cycle_phase = null;
    for (const known of [{ pregnancy: 'yes', contextBasis: 'sample' },
      { treatment: { cocp: 'yes' }, sampleDateISO: '2020-01-01' }]) {
      app.context.testosteroneMeasurementContext = known;
      app.update({ id: 'lh' }, currentEvaluation('lh'));
      expect(app.last().contraindicated).toBe(false);
    }
  });

  it('clears known local facts on patient and sex changes rather than reviving them later', () => {
    const app = femaleAdapter();
    app.context.localOverride.cycle_phase = 'pregnancy_t1';
    app.context.testosteroneMeasurementContext = { treatment: { cocp: 'yes' } };
    app.update({ id: 'lh' }, currentEvaluation('lh'));
    expect(app.last().contraindicated).toBe(true);
    app.context.sourcePatient.sex = 'M';
    app.update({ id: 'lh' }, currentEvaluation('lh', { sex: 'M' }));
    expect(app.context.localOverride.cycle_phase).toBeNull();
    expect(app.context.testosteroneMeasurementContext).toEqual({});
    expect(app.last().contraindicated).toBe(false);
    app.context.sourcePatient.sex = 'F';
    app.update({ id: 'lh' }, currentEvaluation('lh'));
    expect(app.last().contraindicated).toBe(false);
    expect(lifespanReference.evaluate(lifespanData, app.last()).status).toBe('ready');
    app.context.localOverride.cycle_phase = 'pregnancy_t3';
    app.context.testosteroneMeasurementContext = { pregnancy: 'yes' };
    app.context.identity = 'fictional-next-gonadotropin-patient';
    app.context.sourcePatient.identityKey = app.context.identity;
    app.update({ id: 'fsh' }, currentEvaluation('fsh'));
    expect(app.last().measurement).toBeNull();
    expect(app.context.localOverride.cycle_phase).toBeNull();
    expect(app.context.testosteroneMeasurementContext).toEqual({});
    app.update({ id: 'fsh' }, currentEvaluation('fsh'));
    expect(app.last().contraindicated).toBe(false);
    expect(lifespanReference.evaluate(lifespanData, app.last()).status).toBe('ready');
  });

  it('does not borrow a positive fact from an unavailable or opposite-sex current source', () => {
    const app = femaleAdapter();
    app.context.localOverride.cycle_phase = 'pregnancy_t1';
    app.context.testosteroneMeasurementContext = { treatment: { cocp: 'yes' } };
    app.context.sourcePatient.sourceStatus = 'loading';
    app.update({ id: 'lh' }, currentEvaluation('lh'));
    expect(app.last()).toMatchObject({ measurement: null, contraindicated: false });
    app.context.sourcePatient.sourceStatus = 'ready';
    app.context.sourcePatient.sex = 'M';
    app.update({ id: 'lh' }, currentEvaluation('lh'));
    expect(app.last().contraindicated).toBe(false);
  });
});
