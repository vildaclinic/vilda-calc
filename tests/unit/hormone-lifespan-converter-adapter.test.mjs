import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const require = createRequire(import.meta.url);
const puberty = require('../../vilda_lab_puberty.js');
const inhibin = require('../../vilda_lab_inhibin_b.js');
const policy = require('../../vilda_lab_puberty_data.js');
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
    identity: '', localOverrideIdentity: '', lifespanVault: null,
    localOverride: { sex: null, age: null, tanner: null, cycle_phase: null },
    overrideSexEl: { value: '' }, overrideAgeEl: { value: '' }, overrideAgeMonthsEl: { value: '' },
    overrideCycleEl: { value: '' }, overrideTannerEl: { value: '' },
    valueEl: { value: '40' }, unitEl: { value: 'ng/dL' }, currentSubstance: { id: 'testosterone_total' },
    sourcePatient: { identityKey: '', sourceStatus: 'ready', sex: 'M', ageYears: 12, ageMonths: 0 },
    effectivePatient: { sex: 'M', age: 12 },
    lifespanUI: { update: (value) => updates.push(value), clear: () => updates.push(null) },
    showError: () => {},
    readPubertyPatientContext: () => context.sourcePatient,
    getEffectivePatient: () => context.effectivePatient,
    isPubertySubstance: (s) => !!s && ['lh', 'fsh', 'inhibin_b'].includes(s.id),
    ...extra,
  };
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

  it('uses already known calendar days for infant AMH without narrowing their uncertainty or changing other analytes', () => {
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
    for (const id of ['testosterone_total', 'estradiol', 'inhibin_b']) {
      app.context.currentSubstance = { id };
      expect(app.context.readPubertyPatientContext().neonatalAge.postnatalDays).toBeNull();
    }
    for (const id of ['testosterone_total', 'estradiol']) {
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
});
