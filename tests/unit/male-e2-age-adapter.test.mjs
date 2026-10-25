import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const read = name => readFileSync(new URL(`../../${name}`, import.meta.url), 'utf8');
const html = read('przelicznik-jednostek.html');
const adapterStart = html.indexOf('    function currentPatientIdentity()');
const adapterEnd = html.indexOf('    // ID substancji,');
const parserStart = html.indexOf('    function parseE2Measurement(substance)');
const parserEnd = html.indexOf('    function renderCensoredSourceResult(substance)');
if ([adapterStart, adapterEnd, parserStart, parserEnd].some(index => index < 0)) {
  throw new Error('Production E2 adapter/parser boundaries were not found');
}
// Execute the actual page adapter and actual E2 parser, not a reconstructed
// context mapper. Patient reading and UI rendering are the only fake boundaries.
const productionAdapter = html.slice(adapterStart, adapterEnd) + html.slice(parserStart, parserEnd);
const scripts = ['lab_units_data.js', 'lab_unit_converter.js', 'vilda_lab_puberty_data.js',
  'vilda_lab_puberty.js', 'vilda_amh_age_reference.js', 'vilda_hormone_lifespan_reference.js',
  'vilda_hormone_lifespan_data.js', 'vilda_male_e2_age.js'];

function adapter(extra = {}) {
  const events = [], generic = [], host = { hidden: false };
  const context = {
    document: { getElementById: id => id === 'labHormoneLifespan' ? host : null },
    sessionStorage: { getItem: () => context.identity },
    identity: 'fictional-e2-boy-a', localOverrideIdentity: 'fictional-e2-boy-a',
    lifespanVault: null, lifespanCurrentSex: null, testosteroneMeasurementContext: {},
    localOverride: { sex: null, age: null, tanner: null, cycle_phase: null },
    overrideSexEl: { value: '' }, overrideAgeEl: { value: '' }, overrideAgeMonthsEl: { value: '' },
    overrideCycleEl: { value: '' }, overrideTannerEl: { value: '' },
    valueEl: { value: '20' }, unitEl: { value: 'pmol/L' }, unitTargetEl: { value: 'pmol/L' },
    sourcePatient: { identityKey: 'fictional-e2-boy-a', sourceStatus: 'ready', sex: 'M', ageYears: 12, ageMonths: 0 },
    effectivePatient: { sex: 'M', age: 12, life_stage: 'pediatric' },
    lifespanUI: { update: value => generic.push(value), clear: () => generic.push(null) },
    amhAgeReferenceUI: null, e2PhaseSourceUI: null, persistence: null,
    showError: () => {},
    readPubertyPatientContext: () => context.sourcePatient,
    getEffectivePatient: () => context.effectivePatient,
    isPubertySubstance: () => false,
    isPubertyReferenceSubstance: () => false,
    ...extra,
  };
  context.window = context;
  vm.createContext(context);
  scripts.forEach(file => vm.runInContext(read(file), context, { filename: file }));
  const converter = context.LabUnitConverter;
  const substance = converter.find('estradiol');
  context.currentSubstance = substance;
  context.maleE2AgeUI = {
    update: value => events.push({ context: value, result: context.VildaMaleE2Age.evaluate(
      context.VildaHormoneLifespanData.maleE2AgeData, context.VildaHormoneLifespanData.maleE2AgePolicy, value) }),
    clear: () => events.push(null),
  };
  vm.runInContext(productionAdapter, context, { filename: 'actual-E2-converter-adapter.js' });
  function update() {
    const converted = converter.convert({ substanceId: 'estradiol', value: context.valueEl.value,
      fromUnit: context.unitEl.value, toUnit: substance.canonical_si });
    const before = structuredClone(converted);
    context.updateLifespan(context.currentSubstance, null, converted);
    expect(converted).toEqual(before);
    return converted;
  }
  const lab = () => converter.evaluate('estradiol', { value: context.valueEl.value,
    unit: context.unitEl.value, patient: context.effectivePatient });
  return { context, events, generic, host, converter, substance, update, lab,
    last: () => events.at(-1), clear: () => context.updateLifespan(null, null) };
}

describe('Male E2 age — actual current converter adapter and production source reader', () => {
  it('routes the current result and complete month interval into its own source card, preserving Mayo', () => {
    const app = adapter(), before = structuredClone(app.lab());
    expect(before).toMatchObject({ status: 'within', low: 0, high: 139.69, source_ids: ['mayo_test_estradiol'] });
    app.update();
    expect(app.host.hidden).toBe(true);
    expect(app.generic.at(-1)).toBeNull();
    expect(app.last().context).toMatchObject({ analyte: 'estradiol', sex: 'male',
      contextBasis: 'current-patient', sourceStatus: 'ready', identityKey: app.context.identity,
      ageYears: 12, ageUpperYears: 12 + 1 / 12, ageUpperInclusive: false,
      displayUnit: 'pmol/L', measurement: { raw: '20', value: 20, unit: 'pmol/L', operator: '=', censoring: null } });
    expect(app.last().result).toMatchObject({ status: 'ready', visible: true,
      median: { sourceValue: 6.129050070456699 }, comparison: { patientPoint: { sourceValue: 20, value: 20 } } });
    expect(app.lab()).toEqual(before);
  });

  it('retains a real low result beneath the publication LLOQ and never treats P50 as a norm', () => {
    const app = adapter();
    app.context.sourcePatient.ageYears = 6;
    app.context.effectivePatient.age = 6;
    app.context.valueEl.value = '0,4';
    const before = structuredClone(app.lab());
    expect(before).toMatchObject({ low: 0, high: 47.79, status: 'within' });
    app.update();
    expect(app.last().result).toMatchObject({ status: 'ready',
      median: { sourceValue: .24701013272002922, belowSourceLloq: true },
      comparison: { patientPoint: { sourceValue: .4, value: .4 } } });
    expect(app.lab()).toEqual(before);
    expect(app.last().result).not.toHaveProperty('biochemical');
  });

  it.each(['pmol/L', 'nmol/L', 'pg/mL', 'ng/L', 'ng/dL'])(
    'keeps the original %s measurement, canonical value and separate selected target unit', unit => {
      const app = adapter();
      const value = app.converter.convert({ substanceId: 'estradiol', value: 20, fromUnit: 'pmol/L', toUnit: unit }).value;
      app.context.valueEl.value = String(value);
      app.context.unitEl.value = unit;
      app.context.unitTargetEl.value = unit === 'pg/mL' ? 'pmol/L' : 'pg/mL';
      const before = structuredClone(app.lab());
      app.update();
      expect(app.last().context.measurement).toMatchObject({ value, unit, operator: '=' });
      expect(app.last().context.displayUnit).toBe(app.context.unitTargetEl.value);
      expect(app.last().result.comparison.patientPoint.sourceValue).toBeCloseTo(20, 12);
      expect(app.last().result.comparison.patientPoint.value).toBeCloseTo(app.converter.convert({
        substanceId: 'estradiol', value: 20, fromUnit: 'pmol/L', toUnit: app.context.unitTargetEl.value }).value, 12);
      expect(app.last().result.median.sourceValue).toBe(6.129050070456699);
      expect(app.lab()).toEqual(before);
    });

  it.each(['<5', '<=5', '>5', '>=5', '<LOD', '<LOQ'])(
    'keeps literal censored result %s without creating an exact concentration point', raw => {
      const app = adapter();
      app.update();
      app.context.valueEl.value = raw;
      app.update();
      expect(app.last().context.measurement).toEqual(app.context.parseE2Measurement(app.substance));
      expect(app.last().result.median.sourceValue).toBe(6.129050070456699);
      expect(app.last().result.comparison.patientPoint).toBeNull();
    });

  it.each(['+20', '2 000'])('uses only the fresh valid legacy conversion for exact syntax %s outside the lexer', raw => {
    const app = adapter();
    app.context.valueEl.value = raw;
    expect(app.context.parseE2Measurement(app.substance).status).toBe('invalid');
    const conversion = app.update();
    expect(conversion.ok).toBe(true);
    expect(app.last().context.measurement).toEqual({ value: conversion.siValue, unit: conversion.siUnit, operator: '=' });
    expect(app.last().result.comparison.patientPoint.sourceValue).toBe(conversion.siValue);
  });

  it('passes real reported month/year precision, including the final whole-year boundary', () => {
    const app = adapter();
    app.context.sourcePatient.ageMonths = 6;
    app.context.effectivePatient.age = 12.5;
    app.update();
    expect(app.last().context).toMatchObject({ ageYears: 12.5, ageUpperYears: 12.5 + 1 / 12, ageUpperInclusive: false });
    expect(app.last().result.median.sourceValue).toBe(8.699139831867987);
    app.context.sourcePatient.ageYears = 17;
    app.context.sourcePatient.ageMonths = null;
    app.context.effectivePatient.age = 17;
    app.update();
    expect(app.last().context).toMatchObject({ ageYears: 17, ageUpperYears: 18, ageUpperInclusive: false });
    expect(app.last().result.status).toBe('ready');
    app.context.sourcePatient.ageYears = 18;
    app.context.effectivePatient = { sex: 'M', age: 18, life_stage: 'adult' };
    const adultLab = structuredClone(app.lab());
    app.update();
    expect(app.last().context).toMatchObject({ ageYears: 18, ageUpperYears: 19, ageUpperInclusive: false });
    expect(app.last().result).toMatchObject({ status: 'unavailable', median: null,
      reason: 'unsupported-source-age', comparison: { patientPoint: null } });
    expect(app.lab()).toEqual(adultLab);
    expect(adultLab).toMatchObject({ low: 40, high: 160, source_ids: ['tietz_2018'] });
  });

  it('uses the main-form source GnRHa fact while preserving the separate legacy laboratory evaluation', () => {
    const app = adapter(), before = structuredClone(app.lab());
    app.context.sourcePatient.gnrhaStatus = 'w-trakcie';
    app.update();
    expect(app.last().context.contraindicated).toBe(true);
    expect(app.last().result).toMatchObject({ status: 'unavailable', median: null,
      reason: 'contraindicated', comparison: { patientPoint: null } });
    expect(app.lab()).toEqual(before);
  });

  it('withholds anonymous main-form GnRHa even without an active Tanner visit', () => {
    const app = adapter({ identity: '', localOverrideIdentity: '',
      sourcePatient: { identityKey: '', sourceStatus: 'ready', sex: 'M', ageYears: 12, ageMonths: 0 },
      persistence: { readShared: () => ({ _vildaPersist: { byId: { pubertyGnrhaStatus: 'w-trakcie' } } }) } });
    app.update();
    expect(app.last().context.contraindicated).toBe(true);
    expect(app.last().result.median).toBeNull();
  });

  it('does not borrow the anonymous mirror for an identified person or override an active current assessment', () => {
    const persistence = { readShared: () => ({ _vildaPersist: { byId: { pubertyGnrhaStatus: 'w-trakcie' } } }) };
    const identified = adapter({ persistence });
    identified.update();
    expect(identified.last().result.status).toBe('ready');
    const anonymous = adapter({ identity: '', localOverrideIdentity: '', persistence,
      sourcePatient: { identityKey: '', sourceStatus: 'ready', sex: 'M', ageYears: 12, ageMonths: 0,
        pubertyAssessmentContext: { available: true, preparing: false } } });
    anonymous.update();
    expect(anonymous.last().result.status).toBe('ready');
  });

  it.each(['preparing', 'isClearInProgress', 'isRestoring'])(
    'withholds an anonymous context while its source is %s instead of reviving a number', flag => {
      const sourcePatient = { identityKey: '', sourceStatus: 'ready', sex: 'M', ageYears: 12, ageMonths: 0 };
      const persistence = { readShared: () => ({}) };
      if (flag === 'preparing') sourcePatient.pubertyAssessmentContext = { preparing: true };
      else persistence[flag] = () => true;
      const app = adapter({ identity: '', localOverrideIdentity: '', sourcePatient, persistence });
      app.update();
      expect(app.last().context.contraindicated).toBe(true);
      expect(app.last().result).toMatchObject({ status: 'unavailable', median: null, comparison: { patientPoint: null } });
    });

  it.each(['gnrha', 'sexSteroids', 'cocp', 'exogenousTestosterone'])(
    'reuses only a positive current-person %s treatment fact, without changing RI', field => {
      const app = adapter(), before = structuredClone(app.lab());
      app.context.testosteroneMeasurementContext = { contextBasis: 'current-patient', treatment: { [field]: 'yes' } };
      app.update();
      expect(app.last().context.contraindicated).toBe(true);
      expect(app.last().result.median).toBeNull();
      expect(app.lab()).toEqual(before);
    });

  it('does not transfer dated treatment or another analyte’s assay/specimen/protocol into current E2', () => {
    const app = adapter();
    app.context.testosteroneMeasurementContext = { contextBasis: 'sample', sampleDateISO: '2025-01-01',
      treatment: { gnrha: 'yes' }, specimen: 'plasma', assay: { methodId: 'immunoassay', confirmation: 'reported' },
      measurementKind: 'stimulated', collectionTime: 'morning' };
    app.update();
    expect(app.last().context).toMatchObject({ treatment: null, measurementKind: null,
      specimen: null, assayMethodId: null, contraindicated: false, contextBasis: 'current-patient', sampleDateISO: null });
    expect(app.last().result.status).toBe('ready');
    app.context.testosteroneMeasurementContext = { contextBasis: 'current-patient', specimen: 'plasma',
      assay: { methodId: 'immunoassay', confirmation: 'reported' }, measurementKind: 'stimulated' };
    app.update();
    expect(app.last().result.status).toBe('ready');
  });

  it.each([{ method: 'immunoassay' }, { test_protocol: 'stimulated' }, { treatment: { context: 'hormonal' } }])(
    'retains a genuinely current E2 exclusion %j without changing the existing RI', extra => {
      const app = adapter();
      Object.assign(app.context.effectivePatient, extra);
      const before = structuredClone(app.lab());
      app.update();
      expect(app.last().result).toMatchObject({ status: 'unavailable', median: null, comparison: { patientPoint: null } });
      expect(app.lab()).toEqual(before);
    });

  it('clears before reusing a new identity and never accepts a mismatched source identity', () => {
    const app = adapter();
    app.update();
    expect(app.last().result.status).toBe('ready');
    const beforeSwitch = app.events.length;
    app.context.identity = 'fictional-e2-boy-b';
    app.context.sourcePatient.identityKey = 'fictional-e2-boy-b';
    app.context.sourcePatient.ageYears = 13;
    app.context.effectivePatient.age = 13;
    app.update();
    expect(app.events.slice(beforeSwitch)).toContain(null);
    expect(app.context.valueEl.value).toBe('');
    // A fresh ready demographic source may show its new median immediately;
    // the discarded old person's concentration must never accompany it.
    expect(app.last().result).toMatchObject({ status: 'ready', identityKey: 'fictional-e2-boy-b',
      median: { ageYears: 13, sourceValue: 12.181153681006554 }, comparison: { patientPoint: null } });
    app.context.valueEl.value = '25';
    app.update();
    expect(app.last().result).toMatchObject({ status: 'ready', identityKey: 'fictional-e2-boy-b',
      comparison: { patientPoint: { sourceValue: 25 } } });
    app.context.sourcePatient.identityKey = 'fictional-stale-source';
    app.update();
    expect(app.last()).toBeNull();
  });

  it('clears on unavailable source, vault lock, female context, another analyte and explicit clear', () => {
    for (const apply of [
      app => { app.context.sourcePatient.sourceStatus = 'pending'; },
      app => { app.context.VildaVault = { isUnlocked: () => false }; },
      app => { app.context.effectivePatient.sex = 'F'; app.context.sourcePatient.sex = 'F'; },
      app => { app.context.currentSubstance = app.converter.find('tsh'); },
    ]) {
      const app = adapter();
      app.update();
      expect(app.last().result.status).toBe('ready');
      apply(app);
      app.update();
      expect(app.last()).toBeNull();
      expect(app.host.hidden).toBe(false);
    }
    const app = adapter();
    app.update();
    app.clear();
    expect(app.last()).toBeNull();
  });

  it('clears immediately through the actual vault onLock subscription', () => {
    const app = adapter();
    let onLock;
    app.context.VildaVault = { isUnlocked: () => true, onLock: listener => { onLock = listener; } };
    app.update();
    expect(app.last().result.status).toBe('ready');
    expect(onLock).toBeTypeOf('function');
    onLock();
    expect(app.last()).toBeNull();
    expect(app.host.hidden).toBe(false);
  });
});
