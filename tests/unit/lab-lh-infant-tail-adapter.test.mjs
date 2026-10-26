import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const require = createRequire(import.meta.url);
const puberty = require('../../vilda_lab_puberty.js');
const pubertyData = require('../../vilda_lab_puberty_data.js');
const lifespanData = require('../../vilda_hormone_lifespan_data.js');
const html = readFileSync(new URL('../../przelicznik-jednostek.html', import.meta.url), 'utf8');
const productionAdapter = html.slice(html.indexOf('    function currentPatientIdentity()'),
  html.indexOf('    // ID substancji,'));
const productionPatientReader = html.slice(html.indexOf('    function readPubertyPatientContext()'),
  html.indexOf('    var pubertyUI ='));
if (!productionAdapter) throw new Error('Missing actual converter adapter');

// This executes the real converter adapter and real age/measurement resolver.
// Only its DOM, persistence and current-person carriers are synthetic fixtures.
function harness() {
  const state = { identity: 'fictional-infant-lh-a', restoring: false, clearing: false, unlocked: true };
  const updates = [];
  let resolvedAge = null;
  const persistence = { isRestoring: () => state.restoring, isClearInProgress: () => state.clearing };
  const source = { identityKey: state.identity, sourceStatus: 'ready', sex: 'M', ageYears: 0, ageMonths: 9 };
  const context = {
    window: { VildaLabPuberty: puberty, VildaLabPubertyData: pubertyData, VildaHormoneLifespanData: lifespanData,
      VildaVault: { isUnlocked: () => state.unlocked } },
    sessionStorage: { getItem: () => state.identity },
    persistence, localOverrideIdentity: state.identity, lifespanVault: null, lifespanCurrentSex: null,
    localOverride: { sex: null, age: null, tanner: null, cycle_phase: null },
    testosteroneMeasurementContext: {}, overrideSexEl: { value: '' }, overrideAgeEl: { value: '' },
    overrideAgeMonthsEl: { value: '' }, overrideCycleEl: { value: '' }, overrideTannerEl: { value: '' },
    unitEl: { value: 'IU/L' }, valueEl: { value: '0.4' }, currentSubstance: { id: 'lh' },
    lifespanUI: { update: value => updates.push(value), clear: () => updates.push(null) },
    amhAgeReferenceUI: null, e2PhaseSourceUI: null,
    readPubertyPatientContext: () => source,
    getEffectivePatient: () => ({ sex: 'M', age: .75 }),
    isPubertySubstance: substance => ['lh', 'fsh', 'inhibin_b'].includes(substance?.id),
    isPubertyReferenceSubstance: substance => ['lh', 'fsh', 'inhibin_b'].includes(substance?.id),
    showError() {},
  };
  vm.createContext(context);
  vm.runInContext(productionAdapter, context);
  function update({ day = 300, raw = '0.4', input: extraInput = {}, analyte = 'lh' } = {}) {
    const input = { analyte, sex: 'M', preterm: 'no', contextBasis: 'current-patient',
      neonatalAge: { postnatalDays: { lower: day, upper: day, source: 'fictional-calendar-days' } },
      ...extraInput };
    const evaluation = { input, ageAtSample: puberty.resolveAge(input),
      measurement: puberty.parseMeasurement(raw, 'IU/L') };
    resolvedAge = evaluation.ageAtSample;
    const before = structuredClone(evaluation);
    context.updateLifespan({ id: analyte }, evaluation);
    expect(evaluation).toEqual(before);
    return updates.at(-1);
  }
  return { state, source, context, updates, update, age: () => resolvedAge };
}

function cachedCalendarAdapter() {
  const h = harness(), identity = h.state.identity;
  const shared = { sex: 'M', age: '0', ageMonths: '9', weight: '8.6', height: '72' };
  const cache = { version: 1, identityKey: identity, mode: ':', form: { ...shared }, liveDay: null,
    minipubertyOnly: true, infantLhTailOnly: true,
    postnatalDays: { lower: 299, upper: 300, source: 'main-calendar-dates' } };
  const record = { patientId: identity, status: 'ready', sourceSex: 'M',
    neonatalAge: { gestationalDays: { lower: 280, upper: 280, source: 'fictional-record-gestation' } } };
  Object.assign(h.context.persistence, { readShared: () => shared, readJSON: () => cache });
  h.context.sessionStorage.getItem = key => key === 'vildaCurrentPatientId' ? h.state.identity : '';
  h.context.extractTannerFromAny = () => null;
  Object.assign(h.context.window, { sessionStorage: h.context.sessionStorage,
    VildaPersistence: h.context.persistence,
    VildaSession: { getPatient: () => ({ sex: shared.sex, age: 0, ageMonths: Number(shared.ageMonths) }) },
    VildaPubertySource: { kontekstPacjenta: () => record } });
  loadBrowserScript('vilda_lab_neonatal_context.js', h.context.window);
  vm.runInContext(productionPatientReader, h.context);
  const read = () => h.context.readPubertyPatientContext();
  function calculate(extraInput = {}) {
    const source = read();
    const evaluation = puberty.evaluate({ analyte: 'lh', value: '0.4', unit: 'IU/L', sex: source.sex,
      age: { years: Number(source.ageYears), months: Number(source.ageMonths), precision: 'month' },
      preterm: source.preterm, neonatalAge: source.neonatalAge, contextBasis: 'current-patient', ...extraInput }, pubertyData);
    const before = structuredClone(evaluation);
    h.context.updateLifespan({ id: 'lh' }, evaluation);
    expect(evaluation).toEqual(before);
    return { source, evaluation, graph: h.updates.at(-1) };
  }
  return { ...h, shared, cache, record, read, calculate };
}

describe('LH niemowlęcy — adapter aktualnej osoby i źródła', () => {
  it('preserves the real calendar age interval and passes a separate current-context flag without new questions', () => {
    const h = harness();
    for (const day of [243, 244, 300, 326, 327, 365]) {
      const actual = h.update({ day });
      expect(actual).toMatchObject({
        analyte: 'lh', sex: 'male', ageYears: h.age().lowerYears, ageUpperYears: h.age().upperYears,
        ageUpperInclusive: h.age().upperInclusive, preterm: 'no', contextBasis: 'current-patient', sampleDateISO: null,
        sourceStatus: 'ready', infantLhContextAvailable: true, identityKey: 'fictional-infant-lh-a',
        measurement: { value: .4, unit: 'IU/L', operator: '=' },
      });
    }
  });

  it('withholds the flag during loading, wrong identity, prepare, restore, clear and lock', () => {
    const cases = [
      h => { h.source.sourceStatus = 'loading'; },
      h => { h.source.identityKey = 'fictional-other-infant'; },
      h => { h.source.pubertyAssessmentContext = { preparing: true }; },
      h => { h.source.pubertyAssessmentContext = { available: true, patientId: 'fictional-other-infant' }; },
      h => { h.state.restoring = true; },
      h => { h.state.clearing = true; },
      h => { h.state.unlocked = false; },
    ];
    for (const alter of cases) {
      const h = harness();
      expect(h.update().infantLhContextAvailable).toBe(true);
      alter(h);
      const next = h.update();
      expect(next?.infantLhContextAvailable).not.toBe(true);
    }
  });

  it('keeps known prematurity, treatment and source-method facts rather than replacing them with policy facts', () => {
    const h = harness();
    const next = h.update({ input: { preterm: 'yes', specimen: 'plasma',
      assay: { confirmation: 'reported', methodId: 'fictional-other-assay' },
      treatment: { context: 'hormonal', gnrha: 'yes', sexSteroids: 'unknown' } } });
    expect(next).toMatchObject({ preterm: 'yes', specimen: 'plasma', assayMethodId: 'fictional-other-assay',
      contraindicated: true });
    expect(next.infantLhContextAvailable).toBe(true);
  });

  it('retains each already known therapy or stimulation exclusion independently of availability', () => {
    for (const input of [{ treatment: { context: 'hormonal' } }, { treatment: { gnrha: 'yes' } },
      { treatment: { sexSteroids: true } }, { measurementKind: 'gnrh-stimulation' }]) {
      const h = harness();
      expect(h.update({ input })).toMatchObject({ infantLhContextAvailable: true, contraindicated: true });
    }
    const h = harness();
    h.source.gnrhaStatus = 'w-trakcie';
    expect(h.update()).toMatchObject({ infantLhContextAvailable: true, contraindicated: true });
  });

  it('does not give another analyte the LH-specific flag and preserves censoring and exact zero', () => {
    const h = harness();
    expect(h.update({ analyte: 'fsh' }).infantLhContextAvailable).toBe(false);
    expect(h.update({ raw: '<0.4' })).toMatchObject({ infantLhContextAvailable: true,
      measurement: { value: .4, unit: 'IU/L', operator: '<' } });
    expect(h.update({ raw: '0' })).toMatchObject({ infantLhContextAvailable: true,
      measurement: { value: 0, unit: 'IU/L', operator: '=' } });
  });

  it('reads the isolated late-calendar cache for the LH graph without changing clinical age or neonatal input', () => {
    const h = cachedCalendarAdapter();
    const { source, evaluation, graph } = h.calculate();
    expect(source.neonatalAge.postnatalDays).toBeNull();
    expect(evaluation.input.neonatalAge.postnatalDays).toBeNull();
    expect(evaluation.ageAtSample).toMatchObject({ lowerYears: .75, upperYears: 10 / 12 });
    expect(source.infantLhChronologicalAge.postnatalDays).toMatchObject({ lower: 299, upper: 300,
      source: 'main-calendar-dates' });
    expect(graph.infantLhContextAvailable).toBe(true);
    expect(graph).toMatchObject({ ageYears: 299 / 365.25, ageUpperYears: 301 / 365.25,
      ageUpperInclusive: false });
    expect(JSON.stringify(evaluation)).not.toContain('infantLhChronologicalAge');
  });

  it('does not lend cached graph precision to an edited age, another sex, dated sample or known contraindication', () => {
    for (const input of [{ age: { years: 0, months: 8, precision: 'month' } },
      { sex: 'F' }, { contextBasis: 'sample' }, { sampleDateISO: '2026-01-01' },
      { treatment: { gnrha: 'yes' } }, { specimen: 'plasma' }]) {
      const h = cachedCalendarAdapter();
      const { evaluation, graph } = h.calculate(input);
      expect(graph.ageYears).toBe(evaluation.ageAtSample.status === 'known' ? evaluation.ageAtSample.lowerYears : null);
      expect(graph.ageUpperYears).toBe(evaluation.ageAtSample.status === 'known' ? evaluation.ageAtSample.upperYears : null);
    }
    const h = cachedCalendarAdapter();
    h.context.localOverride.age = 0;
    const { evaluation, graph } = h.calculate();
    expect(graph.ageYears).toBe(evaluation.ageAtSample.lowerYears);
  });

  it('withholds the graph-only cache on stale form, restore and lock and never exposes it to FSH', () => {
    for (const alter of [h => { h.shared.weight = '9'; }, h => { h.state.restoring = true; },
      h => { h.state.clearing = true; }, h => { h.state.unlocked = false; }]) {
      const h = cachedCalendarAdapter();
      expect(h.read().infantLhChronologicalAge).toBeDefined();
      alter(h);
      expect(h.read().infantLhChronologicalAge).toBeUndefined();
    }
    const h = cachedCalendarAdapter();
    h.context.currentSubstance = { id: 'fsh' };
    expect(h.read().infantLhChronologicalAge).toBeUndefined();
    expect(h.read().neonatalAge.postnatalDays).toBeNull();
  });

  it('does not replace the existing early infant age route with the new late graph-only route', () => {
    const h = cachedCalendarAdapter();
    h.shared.ageMonths = '4'; h.cache.form.ageMonths = '4'; delete h.cache.infantLhTailOnly;
    h.cache.postnatalDays = { lower: 119, upper: 120, source: 'main-calendar-dates' };
    const source = h.read();
    expect(source.neonatalAge.postnatalDays).toMatchObject({ lower: 119, upper: 120 });
    expect(source.infantLhChronologicalAge).toBeUndefined();
  });

  it('does not promote a partial current age from an older, more precise shared mirror', () => {
    const h = cachedCalendarAdapter();
    h.context.window.VildaPubertyAssessmentContext = { readActiveContext: () => ({ available: true,
      sex: 'M', patientId: h.state.identity, demographics: { sex: 'M', ageYears: 0, ageMonths: null } }) };
    const source = h.read();
    expect(source.ageMonths).toBeNull();
    expect(source.infantLhChronologicalAge).toBeUndefined();
  });
});
