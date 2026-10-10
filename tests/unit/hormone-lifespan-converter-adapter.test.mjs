import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const require = createRequire(import.meta.url);
const puberty = require('../../vilda_lab_puberty.js');
const inhibin = require('../../vilda_lab_inhibin_b.js');
const policy = require('../../vilda_lab_puberty_data.js');
const html = readFileSync(new URL('../../przelicznik-jednostek.html', import.meta.url), 'utf8');
// Execute the actual converter adapter, including identity invalidation and the
// shared age resolver. The fixtures below are fictional, not clinical ranges.
const source = html.slice(html.indexOf('    function currentPatientIdentity()'), html.indexOf('    // ID substancji,'));

function adapter(extra = {}) {
  const updates = [];
  const context = {
    window: { VildaLabPuberty: puberty, VildaLabPubertyData: policy },
    sessionStorage: { getItem: () => context.identity },
    identity: '', localOverrideIdentity: '', lifespanVault: null,
    localOverride: { sex: null, age: null, tanner: null, cycle_phase: null },
    overrideSexEl: { value: '' }, overrideAgeEl: { value: '' }, overrideAgeMonthsEl: { value: '' },
    overrideCycleEl: { value: '' }, overrideTannerEl: { value: '' },
    valueEl: { value: '40' }, currentSubstance: { id: 'testosterone_total' },
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

describe('Hormone lifespan converter adapter — current result only', () => {
  it('passes real normalized LH/Inhibin measurements, including zero, without display rounding', () => {
    for (const [id, raw, unit, value, expectedUnit] of [
      ['lh', '2,125', 'mIU/mL', 2.125, 'IU/L'],
      ['inhibin_b', '80,125', 'ng/L', 80.125, 'pg/mL'],
      ['inhibin_b', '0', 'pg/mL', 0, 'pg/mL'],
    ]) {
      const app = adapter();
      app.update({ id }, evaluated(raw, unit));
      expect(app.last()).toMatchObject({ measurement: { value, unit: expectedUnit, operator: '=' },
        ageYears: 0.25, ageUpperYears: 1 / 3, ageUpperInclusive: false, ageLabel: '3 mies.', preterm: 'no' });
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
      app.update({ id }, null, result);
      expect(app.last().measurement).toEqual({ value: result.siValue, unit: result.siUnit, operator: '=' });
    }
    app.update({ id: 'amh' }, null, null);
    expect(app.last().measurement).toBeNull();
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
