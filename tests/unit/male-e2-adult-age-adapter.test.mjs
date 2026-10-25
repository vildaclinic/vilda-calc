import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const read = file => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const html = read('przelicznik-jednostek.html');
const adapterStart = html.indexOf('    function currentPatientIdentity()');
const adapterEnd = html.indexOf('    // ID substancji,');
const parserStart = html.indexOf('    function parseE2Measurement(substance)');
const parserEnd = html.indexOf('    function renderCensoredSourceResult(substance)');
const readerStart = html.indexOf('    function readPubertyPatientContext()');
const readerEnd = html.indexOf('    var pubertyUI =', readerStart);
const tannerStart = html.indexOf('    function extractTannerFromAny(obj)');
const tannerEnd = html.indexOf('    /* P-POKWITANIE-KONSUMENCI', tannerStart);
if ([adapterStart, adapterEnd, parserStart, parserEnd, readerStart, readerEnd, tannerStart, tannerEnd].some(index => index < 0)) {
  throw new Error('Actual converter adapter/parser boundaries were not found');
}
// Execute production page functions, E2 lexer/converter, age resolver and
// selector. Isolated cases stub the patient reader/renderer; the seam cases
// also load the actual session bridge and actual page patient reader below.
const pageAdapter = html.slice(adapterStart, adapterEnd) + html.slice(parserStart, parserEnd);
const pagePatientReader = html.slice(readerStart, readerEnd) + html.slice(tannerStart, tannerEnd);
const scripts = ['lab_units_data.js', 'lab_unit_converter.js', 'vilda_lab_puberty_data.js',
  'vilda_lab_puberty.js', 'vilda_amh_age_reference.js', 'vilda_hormone_lifespan_reference.js',
  'vilda_hormone_lifespan_data.js', 'vilda_male_e2_age.js', 'vilda_lab_range_snapshot.js'];
const units = ['pmol/L', 'nmol/L', 'pg/mL', 'ng/L', 'ng/dL'];

function adapter(extra = {}) {
  const events = [], generic = [], writes = [], host = { hidden: false };
  const context = {
    document: { getElementById: id => id === 'labHormoneLifespan' ? host : null },
    sessionStorage: { getItem: () => context.identity },
    identity: 'fictional-adult-e2-a', localOverrideIdentity: 'fictional-adult-e2-a',
    lifespanVault: null, lifespanCurrentSex: null, testosteroneMeasurementContext: {},
    localOverride: { sex: null, age: null, tanner: null, cycle_phase: null },
    overrideSexEl: { value: '' }, overrideAgeEl: { value: '' }, overrideAgeMonthsEl: { value: '' },
    overrideCycleEl: { value: '' }, overrideTannerEl: { value: '' },
    valueEl: { value: '125' }, unitEl: { value: 'pmol/L' }, unitTargetEl: { value: 'pmol/L' },
    sourcePatient: { identityKey: 'fictional-adult-e2-a', sourceStatus: 'ready', sex: 'M', ageYears: 40, ageMonths: null },
    effectivePatient: { sex: 'M', age: 40, life_stage: 'adult' },
    lifespanUI: { update: value => generic.push(value), clear: () => generic.push(null) },
    amhAgeReferenceUI: null, e2PhaseSourceUI: null,
    persistence: { readShared: () => ({}), writeShared: (...args) => writes.push(args) },
    showError: () => {}, readPubertyPatientContext: () => context.sourcePatient,
    getEffectivePatient: () => context.effectivePatient,
    isPubertySubstance: () => false, isPubertyReferenceSubstance: () => false,
    ...extra,
  };
  context.window = context;
  vm.createContext(context);
  scripts.forEach(file => vm.runInContext(read(file), context, { filename: file }));
  const bundle = context.VildaHormoneLifespanData;
  const sources = [
    { data: bundle.maleE2AgeData, policy: bundle.maleE2AgePolicy },
    { data: bundle.maleE2AdultAgeData, policy: bundle.maleE2AdultAgePolicy },
  ];
  const converter = context.LabUnitConverter;
  context.Conv = converter;
  const substance = converter.find('estradiol');
  context.currentSubstance = substance;
  context.maleE2AgeUI = {
    update: value => events.push({ context: value,
      result: context.VildaMaleE2Age.evaluateSources(sources, value) }),
    clear: () => events.push(null),
  };
  vm.runInContext(pageAdapter, context, { filename: 'actual-male-E2-page-adapter.js' });
  function update() {
    const conversion = converter.convert({ substanceId: 'estradiol', value: context.valueEl.value,
      fromUnit: context.unitEl.value, toUnit: substance.canonical_si });
    const before = structuredClone(conversion);
    context.updateLifespan(context.currentSubstance, null, conversion);
    expect(conversion).toEqual(before);
    return conversion;
  }
  function age(years, months = null) {
    context.sourcePatient.ageYears = years;
    context.sourcePatient.ageMonths = months;
    context.effectivePatient.age = years == null ? null : years + (months || 0) / 12;
    context.effectivePatient.life_stage = years >= 18 ? 'adult' : 'pediatric';
  }
  const lab = () => converter.evaluate('estradiol', { value: context.valueEl.value,
    unit: context.unitEl.value, patient: context.effectivePatient });
  const captureRange = () => context.captureLabRange({ testKey: 'estradiol',
    raw: context.valueEl.value, unit: context.unitEl.value });
  return { context, events, generic, writes, host, bundle, converter, substance,
    update, age, lab, captureRange, last: () => events.at(-1), clear: () => context.updateLifespan(null, null) };
}

function expectNoNumbers(result) {
  expect(result).toMatchObject({ status: 'unavailable', median: null, curve: [], knots: [],
    comparison: { patientPoint: null } });
}

function adapterWithActualReader(options = {}) {
  const shared = { name: 'Fikcyjny Dorosły E2', sex: 'M', age: 40, ageMonths: '', ...options.shared };
  const identity = options.identity === undefined ? 'fictional-adult-e2-a' : options.identity;
  const app = adapter({ identity, localOverrideIdentity: identity });
  const sourceCalls = [], assessmentCalls = [];
  const originalGetElement = app.context.document.getElementById;
  const form = options.form || {};
  app.context.document.readyState = 'loading';
  // The actual session bridge is loaded, but this VM does not run auth UI
  // lifecycle or visit a real form. Absent form fields select its shared path.
  app.context.document.addEventListener = () => {};
  app.context.document.getElementById = id => Object.hasOwn(form, id)
    ? { value: form[id] } : originalGetElement(id);
  app.context.persistence.readShared = () => shared;
  app.context.VildaPersistence = app.context.persistence;
  app.context.VildaPubertySource = { kontekstPacjenta: id => {
    sourceCalls.push(id);
    return options.source || { patientId: id, status: 'ready', sourceSex: 'M', puberty: {}, state: {} };
  } };
  if (options.active) app.context.VildaPubertyAssessmentContext = { readActiveContext: input => {
    assessmentCalls.push(input);
    return options.active;
  } };
  vm.runInContext(read('vilda_session_bridge.js'), app.context, { filename: 'actual-vilda-session-bridge.js' });
  vm.runInContext(pagePatientReader, app.context, { filename: 'actual-page-patient-reader.js' });
  return { ...app, shared, sourceCalls, assessmentCalls,
    readPatient: () => app.context.readPubertyPatientContext() };
}

describe('Adult E2 — actual session → patient reader → legacy age seam', () => {
  it.each(['fictional-adult-e2-a', ''])(
    'retains whole age40 when shared months are empty and the real session bridge returns NaN (identity %s)', identity => {
      const app = adapterWithActualReader({ identity });
      const session = app.context.VildaSession.getPatient();
      expect(session).toMatchObject({ age: 40, source: 'shared' });
      expect(session.ageMonths).toBeNaN();
      const patient = app.readPatient();
      expect(patient).toMatchObject({ sourceStatus: 'ready', sex: 'M', ageYears: 40, ageMonths: null });
      app.update();
      expect(app.last().context).toMatchObject({ ageYears: 40, ageUpperYears: 41, ageUpperInclusive: false });
      expect(app.last().result).toMatchObject({ status: 'ready', median: { sourceValue: 88.16623312463493 } });
    });

  it('preserves a valid live-form session month when the shared month field is blank', () => {
    const app = adapterWithActualReader({ form: {
      name: 'Fikcyjny Dorosły E2', age: '40', ageMonths: '5', sex: 'M',
    } });
    expect(app.context.VildaSession.getPatient()).toMatchObject({ age: 40, ageMonths: 5, source: 'form' });
    expect(app.readPatient()).toMatchObject({ ageYears: 40, ageMonths: 5 });
    app.update();
    expect(app.last().context.ageYears).toBeCloseTo(40 + 5 / 12, 12);
    expect(app.last().context.ageUpperYears).toBeCloseTo(40 + 6 / 12, 12);
    expect(app.last().context.ageUpperInclusive).toBe(false);
    expect(app.last().result.status).toBe('ready');
  });

  it.each(['abc', 12, -1, '1.5', 'NaN', Number.NaN])(
    'does not reinterpret an explicitly invalid shared month %s as an omitted month', months => {
      const app = adapterWithActualReader({ shared: { ageMonths: months }, form: {
        name: 'Fikcyjny Dorosły E2', age: '40', ageMonths: '5', sex: 'M',
      } });
      expect(app.context.VildaSession.getPatient().ageMonths).toBe(5);
      if (Number.isNaN(months)) expect(app.readPatient().ageMonths).toBeNaN();
      else expect(app.readPatient().ageMonths).toBe(months);
      app.update();
      expect(app.last().context.ageYears).toBeNull();
      expectNoNumbers(app.last().result);
    });

  it('retains current active-assessment month precision over a blank shared mirror', () => {
    const app = adapterWithActualReader({ active: { available: true, sex: 'M',
      demographics: { sex: 'M', ageYears: 40, ageMonths: 5, birthDateISO: null }, puberty: {} } });
    expect(app.context.VildaSession.getPatient().ageMonths).toBeNaN();
    expect(app.readPatient()).toMatchObject({ ageYears: 40, ageMonths: 5 });
    app.update();
    expect(app.last().context.ageYears).toBeCloseTo(40 + 5 / 12, 12);
    expect(app.last().context.ageUpperYears).toBeCloseTo(40 + 6 / 12, 12);
    expect(app.last().result.status).toBe('ready');
    expect(app.assessmentCalls.at(-1)).toEqual({ patientId: app.context.identity });
  });

  it('does not erase an explicitly invalid active-assessment month after handling a blank mirror', () => {
    const app = adapterWithActualReader({ active: { available: true, sex: 'M',
      demographics: { sex: 'M', ageYears: 40, ageMonths: Number.NaN, birthDateISO: null }, puberty: {} } });
    expect(app.readPatient().ageMonths).toBeNaN();
    app.update();
    expectNoNumbers(app.last().result);
  });

  it('still rejects mismatched identity and loading source while an assessment is preparing', () => {
    for (const source of [
      { patientId: 'fictional-stale-person', status: 'ready', sourceSex: 'M', puberty: {}, state: {} },
      { patientId: 'fictional-adult-e2-a', status: 'loading' },
    ]) {
      const app = adapterWithActualReader({ shared: { ageMonths: 0 }, source,
        active: { available: false, preparing: true } });
      const patient = app.readPatient();
      expect(patient.sourceStatus).not.toBe('ready');
      app.update();
      expect(app.last()).toBeNull();
      expect(app.sourceCalls.at(-1)).toBe(app.context.identity);
    }
  });
});

describe('Adult male E2 — actual HTML context adapter and automatic source selector', () => {
  it('routes one adult result to Frederiksen while preserving the existing normal Tietz assessment', () => {
    const app = adapter(), before = structuredClone(app.lab());
    expect(before).toMatchObject({ status: 'within', low: 40, high: 160, source_ids: ['tietz_2018'] });
    app.update();
    expect(app.host.hidden).toBe(true);
    expect(app.generic.at(-1)).toBeNull();
    expect(app.last().context).toMatchObject({ analyte: 'estradiol', sex: 'male',
      ageYears: 40, ageUpperYears: 41, ageUpperInclusive: false, identityKey: app.context.identity,
      contextBasis: 'current-patient', sourceStatus: 'ready', displayUnit: 'pmol/L',
      measurement: { value: 125, unit: 'pmol/L', operator: '=', censoring: null } });
    expect(app.last().result).toMatchObject({ status: 'ready', source: { id: app.bundle.maleE2AdultAgeData.id },
      median: { ageYears: 40, sourceValue: 88.16623312463493 },
      plot: { ageMin: 31.4, ageMax: 60.9, valueMin: 0, valueMax: 200 },
      comparison: { patientPoint: { sourceValue: 125, value: 125 } } });
    expect(app.last().result.curve).toHaveLength(296);
    expect(app.last().result.knots).toEqual([]);
    expect(app.last().result).not.toHaveProperty('biochemical');
    expect(app.lab()).toEqual(before);
    expect(app.writes).toEqual([]);
  });

  it.each(units)('retains a real %s input and an independent target display unit', unit => {
    const app = adapter();
    const input = app.converter.convert({ substanceId: 'estradiol', value: 125, fromUnit: 'pmol/L', toUnit: unit }).value;
    app.context.valueEl.value = String(input);
    app.context.unitEl.value = unit;
    app.context.unitTargetEl.value = unit === 'pg/mL' ? 'pmol/L' : 'pg/mL';
    const before = structuredClone(app.lab());
    app.update();
    const result = app.last().result;
    expect(app.last().context.measurement).toMatchObject({ value: input, unit, operator: '=' });
    expect(result.source.id).toBe(app.bundle.maleE2AdultAgeData.id);
    expect(result.comparison.patientPoint.sourceValue).toBeCloseTo(125, 12);
    expect(result.comparison.patientPoint.value).toBeCloseTo(app.converter.convert({
      substanceId: 'estradiol', value: 125, fromUnit: 'pmol/L', toUnit: app.context.unitTargetEl.value }).value, 12);
    expect(result.plot.valueMax).toBe(app.converter.convert({ substanceId: 'estradiol', value: 200,
      fromUnit: 'pmol/L', toUnit: app.context.unitTargetEl.value }).value);
    expect(result.median.sourceValue).toBe(88.16623312463493);
    expect(app.lab()).toEqual(before);
  });

  it.each([0, .4, 300])('preserves the actual %s concentration without a source LOQ floor or patient-dependent scale', value => {
    const app = adapter();
    app.context.valueEl.value = String(value);
    const before = structuredClone(app.lab());
    app.update();
    expect(app.last().result).toMatchObject({ median: { sourceValue: 88.16623312463493 },
      plot: { valueMax: 200 }, comparison: { patientPoint: { sourceValue: value, value } } });
    expect(app.lab()).toEqual(before);
  });

  it.each(['<5', '<=5', '>150', '>=150', '≤5', '≥150', '<LOD', '<LOQ'])(
    'passes literal %s through the production E2 lexer without an exact point', raw => {
      const app = adapter();
      app.update();
      app.context.valueEl.value = raw;
      app.update();
      expect(app.last().context.measurement).toEqual(app.context.parseE2Measurement(app.substance));
      expect(app.last().result).toMatchObject({ status: 'ready',
        median: { sourceValue: 88.16623312463493 }, comparison: { patientPoint: null } });
      if (raw === '<LOD' || raw === '<LOQ') {
        expect(app.last().context.measurement.value).toBeNull();
        expect(app.last().context.measurement.censoring).toBe(raw.slice(1));
      }
    });

  it.each(['+125', '2 000'])('uses only the fresh exact legacy conversion for %s outside the inequality lexer', raw => {
    const app = adapter();
    app.context.valueEl.value = raw;
    expect(app.context.parseE2Measurement(app.substance).status).toBe('invalid');
    const conversion = app.update();
    expect(conversion.ok).toBe(true);
    expect(app.last().context.measurement).toEqual({ value: conversion.siValue, unit: conversion.siUnit, operator: '=' });
    expect(app.last().result.comparison.patientPoint.sourceValue).toBe(conversion.siValue);
  });

  it.each([
    [31, null, 31, 32, false], [32, null, 32, 33, true],
    [60, null, 60, 61, false], [61, null, 61, 62, false],
    [31, 4, 31 + 4 / 12, 31 + 5 / 12, false],
    [31, 5, 31 + 5 / 12, 31 + 6 / 12, true],
    [60, 9, 60 + 9 / 12, 60 + 10 / 12, true],
    [60, 10, 60 + 10 / 12, 60 + 11 / 12, false],
  ])('resolves actual reported age %s years/%s months before source selection', (years, months, low, high, eligible) => {
    const app = adapter();
    app.age(years, months);
    const before = structuredClone(app.lab());
    app.update();
    const { context, result } = app.last();
    expect(context.ageYears).toBeCloseTo(low, 12);
    expect(context.ageUpperYears).toBeCloseTo(high, 12);
    expect(context.ageUpperInclusive).toBe(false);
    if (eligible) {
      expect(result).toMatchObject({ status: 'ready', source: { id: app.bundle.maleE2AdultAgeData.id } });
      expect(result.median.ageYears).toBe(context.ageYears);
    } else {
      expectNoNumbers(result);
      expect(result.source).toBeNull();
    }
    expect(app.lab()).toEqual(before);
  });

  it('does not manufacture exact E2 age from another context’s dates or a fractional legacy value', () => {
    const app = adapter();
    app.age(31.4);
    Object.assign(app.context.sourcePatient, { birthDateISO: '1995-06-01', sampleDateISO: '2026-10-25' });
    Object.assign(app.context.effectivePatient, { birthDateISO: '1995-06-01', sampleDateISO: '2026-10-25' });
    app.update();
    expect(app.last().context).toMatchObject({ ageYears: 31.4, ageUpperYears: null,
      ageUpperInclusive: false, contextBasis: 'current-patient', sampleDateISO: null });
    expectNoNumbers(app.last().result);
    expect(app.last().result.source).toBeNull();
    app.age(null);
    app.context.effectivePatient.age = 40;
    app.update();
    expect(app.last().context.ageYears).toBeNull();
    expectNoNumbers(app.last().result);
  });

  it('switches adult, pediatric and uncovered ages in one route without retaining an earlier source number', () => {
    const app = adapter();
    app.update();
    expect(app.last().result.source.id).toBe(app.bundle.maleE2AdultAgeData.id);
    app.age(12, 0);
    app.context.valueEl.value = '20';
    app.update();
    expect(app.last().result).toMatchObject({ status: 'ready', source: { id: app.bundle.maleE2AgeData.id },
      median: { sourceValue: 6.129050070456699 }, plot: { valueMax: 100 } });
    for (const years of [25, 75]) {
      app.age(years);
      app.context.valueEl.value = '125';
      const before = structuredClone(app.lab());
      app.update();
      expectNoNumbers(app.last().result);
      expect(app.last().result).toMatchObject({ visible: true, source: null, plot: null });
      expect(app.lab()).toEqual(before);
      expect(before).toMatchObject({ status: 'within', low: 40, high: 160 });
    }
    app.age(40);
    app.update();
    expect(app.last().result).toMatchObject({ status: 'ready', source: { id: app.bundle.maleE2AdultAgeData.id },
      median: { sourceValue: 88.16623312463493 }, comparison: { patientPoint: { sourceValue: 125 } } });
  });

  it('keeps unknown current specimen, assay and treatment facts unknown while preserving the normal RI', () => {
    const app = adapter(), before = structuredClone(app.lab());
    app.update();
    expect(app.last().context).toMatchObject({ specimen: null, assayMethodId: null, treatment: null,
      measurementKind: null, contraindicated: false });
    expect(app.last().result.status).toBe('ready');
    expect(app.lab()).toEqual(before);
    expect(app.writes).toEqual([]);
  });

  it('leaves the actual pinned range snapshot unchanged and never adds the graphical P50 to history', () => {
    const app = adapter();
    const before = app.captureRange();
    expect(before).toMatchObject({ kind: 'laboratory-reference-range', status: 'recorded', analyte: 'estradiol',
      classification: 'within', range: { low: 40, high: 160, sourceIds: ['tietz_2018'] },
      measurement: { raw: '125', sourceUnit: 'pmol/L', sourceValue: 125 } });
    app.update();
    expect(app.last().result.median.sourceValue).toBe(88.16623312463493);
    const after = app.captureRange();
    expect({ ...after, capturedAtISO: null }).toEqual({ ...before, capturedAtISO: null });
    expect(JSON.stringify(after)).not.toMatch(/Frederiksen|Madsen|male-e2|P50/);
    expect(app.writes).toEqual([]);
  });

  it.each(['gnrha', 'sexSteroids', 'cocp', 'exogenousTestosterone'])(
    'withholds the adult model for a positive current-person %s treatment fact without changing RI', field => {
      const app = adapter(), before = structuredClone(app.lab());
      app.context.testosteroneMeasurementContext = { contextBasis: 'current-patient', treatment: { [field]: 'yes' } };
      app.update();
      expect(app.last().context.contraindicated).toBe(true);
      expectNoNumbers(app.last().result);
      expect(app.last().result.reason).toBe('contraindicated');
      expect(app.lab()).toEqual(before);
    });

  it('uses a genuinely current main-form GnRHa fact for this adult', () => {
    const app = adapter(), before = structuredClone(app.lab());
    app.context.sourcePatient.gnrhaStatus = 'w-trakcie';
    app.update();
    expect(app.last().context.contraindicated).toBe(true);
    expectNoNumbers(app.last().result);
    expect(app.lab()).toEqual(before);
  });

  it('withholds anonymous main-form treatment without borrowing that mirror for an identified person', () => {
    const persistence = { readShared: () => ({ _vildaPersist: { byId: { pubertyGnrhaStatus: 'w-trakcie' } } }) };
    const anonymous = adapter({ identity: '', localOverrideIdentity: '', persistence,
      sourcePatient: { identityKey: '', sourceStatus: 'ready', sex: 'M', ageYears: 40, ageMonths: null } });
    anonymous.update();
    expect(anonymous.last().context.contraindicated).toBe(true);
    expectNoNumbers(anonymous.last().result);
    const identified = adapter({ persistence });
    identified.update();
    expect(identified.last().result.status).toBe('ready');
  });

  it.each(['preparing', 'isClearInProgress', 'isRestoring'])(
    'withholds an anonymous adult while the current source is %s', flag => {
      const sourcePatient = { identityKey: '', sourceStatus: 'ready', sex: 'M', ageYears: 40, ageMonths: null };
      const persistence = { readShared: () => ({}) };
      if (flag === 'preparing') sourcePatient.pubertyAssessmentContext = { preparing: true };
      else persistence[flag] = () => true;
      const app = adapter({ identity: '', localOverrideIdentity: '', sourcePatient, persistence });
      app.update();
      expect(app.last().context.contraindicated).toBe(true);
      expectNoNumbers(app.last().result);
    });

  it('does not transfer dated treatment or another analyte’s assay/specimen/protocol/time into E2', () => {
    const app = adapter();
    for (const known of [
      { contextBasis: 'sample', sampleDateISO: '2025-01-01', treatment: { gnrha: 'yes' },
        specimen: 'plasma', assay: { methodId: 'immunoassay', confirmation: 'reported' },
        measurementKind: 'stimulated', collectionTime: 'morning' },
      { contextBasis: 'current-patient', specimen: 'plasma', assay: { methodId: 'immunoassay', confirmation: 'reported' },
        measurementKind: 'stimulated', collectionTime: 'morning' },
    ]) {
      app.context.testosteroneMeasurementContext = known;
      app.update();
      expect(app.last().context).toMatchObject({ treatment: null, specimen: null, assayMethodId: null,
        measurementKind: null, contraindicated: false, contextBasis: 'current-patient', sampleDateISO: null });
      expect(app.last().result.status).toBe('ready');
    }
  });

  it.each([{ method: 'immunoassay' }, { test_protocol: 'stimulated' }, { treatment: { context: 'hormonal' } }])(
    'honors the current E2 exclusion %j without falling back to Madsen or changing RI', extra => {
      const app = adapter();
      Object.assign(app.context.effectivePatient, extra);
      const before = structuredClone(app.lab());
      app.update();
      expectNoNumbers(app.last().result);
      expect(app.last().result.source.id).toBe(app.bundle.maleE2AdultAgeData.id);
      expect(app.lab()).toEqual(before);
    });

  it('clears concentration and previous-person treatment before accepting a new identity and age source', () => {
    const app = adapter();
    app.context.testosteroneMeasurementContext = { treatment: { gnrha: 'yes' }, contextBasis: 'current-patient' };
    app.update();
    expectNoNumbers(app.last().result);
    const start = app.events.length;
    app.context.identity = 'fictional-adult-e2-b';
    app.context.sourcePatient.identityKey = app.context.identity;
    app.age(55);
    app.update();
    expect(app.events.slice(start)).toContain(null);
    expect(app.context.valueEl.value).toBe('');
    expect(app.context.testosteroneMeasurementContext).toEqual({});
    expect(app.last().result).toMatchObject({ status: 'ready', identityKey: 'fictional-adult-e2-b',
      median: { sourceValue: 87.38540878379439 }, comparison: { patientPoint: null } });
    app.context.valueEl.value = '125';
    app.update();
    expect(app.last().result.comparison.patientPoint.sourceValue).toBe(125);
    app.context.sourcePatient.identityKey = 'fictional-stale-source';
    app.update();
    expect(app.last()).toBeNull();
  });

  it.each([
    ['pending source', app => { app.context.sourcePatient.sourceStatus = 'pending'; }],
    ['locked vault', app => { app.context.VildaVault = { isUnlocked: () => false }; }],
    ['female context', app => { app.context.effectivePatient.sex = 'F'; app.context.sourcePatient.sex = 'F'; }],
    ['another analyte', app => { app.context.currentSubstance = app.converter.find('tsh'); }],
  ])('clears the adult reading for %s', (_label, change) => {
    const app = adapter();
    app.update();
    expect(app.last().result.status).toBe('ready');
    change(app);
    app.update();
    expect(app.last()).toBeNull();
    expect(app.host.hidden).toBe(false);
  });

  it('clears through the real lock subscription and explicit chart clear without persistence writes', () => {
    const app = adapter();
    let onLock;
    app.context.VildaVault = { isUnlocked: () => true, onLock: listener => { onLock = listener; } };
    app.update();
    expect(onLock).toBeTypeOf('function');
    onLock();
    expect(app.last()).toBeNull();
    app.update();
    expect(app.last().result.status).toBe('ready');
    app.clear();
    expect(app.last()).toBeNull();
    expect(app.writes).toEqual([]);
  });
});
