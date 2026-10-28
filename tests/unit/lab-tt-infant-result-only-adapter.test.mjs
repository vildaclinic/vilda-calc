import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const require = createRequire(import.meta.url);
const puberty = require('../../vilda_lab_puberty.js');
const pubertyData = require('../../vilda_lab_puberty_data.js');
const testosterone = require('../../vilda_lab_testosterone.js');
const testosteroneData = require('../../vilda_lab_testosterone_data.js');
const lifespanData = require('../../vilda_hormone_lifespan_data.js');
const html = readFileSync(new URL('../../przelicznik-jednostek.html', import.meta.url), 'utf8');
const adapter = html.slice(html.indexOf('    function currentPatientIdentity()'), html.indexOf('    // ID substancji,'));
const reader = html.slice(html.indexOf('    function readPubertyPatientContext()'), html.indexOf('    var pubertyUI ='));
const opt = { includeMinipuberty: true, includeInfantTtTail: true };
const cacheKey = 'session:vildaLabNeonatalAgeV1';
function daysBefore(days) {
  const date = new Date(); date.setDate(date.getDate() - days);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

// Run the actual main DOB resolver, isolated calendar publisher/reader,
// converter adapter and clinical TT evaluator. Only form/persistence/vault/UI
// carriers are fictional. No copied age formula or reference engine is used.
function harness(days = 300) {
  const fields = {}, storage = new Map(), cache = new Map(), updates = [];
  const guards = { unlocked: true, restoring: false, clearing: false, stale: false };
  for (const id of ['dobInput', 'dobNote', 'dobError', 'dobClear', 'age', 'ageMonths', 'ageWeeks',
    'ageWeeksRow', 'ageWeeksNote', 'ageWeeksError', 'weight', 'height']) {
    fields[id] = { id, value: '', readOnly: false, hidden: false, dataset: {}, textContent: '',
      classList: { toggle() {} }, addEventListener() {}, dispatchEvent() {}, focus() {} };
  }
  const shared = { sex: 'M', age: '', ageMonths: '', weight: '', height: '',
    _vildaPersist: { updatedAtISO: 'fictional-unchanged-source-version' } };
  const persistence = { readShared: () => shared, writeShared: vi.fn(),
    readJSON: (scope, key) => structuredClone(cache.get(scope + ':' + key) ?? null),
    writeJSON: vi.fn((scope, key, value) => { cache.set(scope + ':' + key, structuredClone(value)); return true; }),
    removeKey: (scope, key) => cache.delete(scope + ':' + key),
    isRestoring: () => guards.restoring, isClearInProgress: () => guards.clearing };
  storage.set('vildaCurrentPatientId', 'fictional-infant-tt-a');
  const record = { patientId: 'fictional-infant-tt-a', status: 'ready', sourceSex: 'M',
    neonatalAge: { gestationalDays: { lower: 280, upper: 280, source: 'fictional-record-gestation' } } };
  const w = { document: { readyState: 'loading', getElementById: id => fields[id] || null, addEventListener() {} },
    _vildaCurrentPatientId: 'fictional-infant-tt-a', hasUserModifiedAfterLoad: false,
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    VildaPanelPacjent: { nieaktualny: () => guards.stale }, VildaPersistence: persistence,
    VildaVault: { isUnlocked: () => guards.unlocked }, VildaPubertySource: { kontekstPacjenta: () => record },
    VildaSession: { getPatient: () => ({ sex: shared.sex, age: Number(shared.age), ageMonths: Number(shared.ageMonths) }) },
    VildaLabPuberty: puberty, VildaLabPubertyData: pubertyData, VildaLabTestosteroneData: testosteroneData,
    VildaHormoneLifespanData: lifespanData, addEventListener() {}, setTimeout };
  loadBrowserScript('vilda_dob_age.js', w);
  loadBrowserScript('vilda_lab_neonatal_context.js', w);
  const ctx = { window: w, document: w.document, persistence, sessionStorage: w.sessionStorage,
    localOverrideIdentity: 'fictional-infant-tt-a', lifespanVault: null, lifespanCurrentSex: null,
    localOverride: { sex: null, age: null, tanner: null, cycle_phase: null },
    testosteroneMeasurementContext: {}, overrideSexEl: { value: '' }, overrideAgeEl: { value: '' },
    overrideAgeMonthsEl: { value: '' }, overrideCycleEl: { value: '' }, overrideTannerEl: { value: '' },
    unitEl: { value: 'nmol/L' }, valueEl: { value: '0.4' }, currentSubstance: { id: 'testosterone_total' },
    lifespanUI: { update: value => updates.push(value), clear: () => updates.push(null) },
    amhAgeReferenceUI: null, e2PhaseSourceUI: null, extractTannerFromAny: () => null,
    getEffectivePatient: () => w.VildaSession.getPatient(),
    isPubertySubstance: substance => ['lh', 'fsh', 'inhibin_b', 'testosterone_total'].includes(substance?.id),
    isPubertyReferenceSubstance: substance => ['lh', 'fsh', 'inhibin_b', 'testosterone_total'].includes(substance?.id), showError() {} };
  vm.createContext(ctx); vm.runInContext(adapter, ctx); vm.runInContext(reader, ctx);
  const sync = () => { for (const key of ['age', 'ageMonths', 'weight', 'height']) shared[key] = fields[key].value; };
  const dob = value => { w.VildaDobAge.setFromSession(value, {}); sync(); };
  dob(daysBefore(days));
  const read = () => ctx.readPubertyPatientContext();
  function calculate(extra = {}, raw = '0.4') {
    const source = read();
    const evaluation = testosterone.evaluate({ analyte: 'testosterone_total', value: raw, unit: 'nmol/L',
      sex: source.sex, age: { years: Number(source.ageYears), months: source.ageMonths == null ? null : Number(source.ageMonths),
        precision: source.ageMonths == null ? 'year' : 'month' },
      preterm: source.preterm, neonatalAge: source.neonatalAge, contextBasis: 'current-patient', ...extra }, testosteroneData);
    const before = JSON.stringify(evaluation);
    ctx.updateLifespan({ id: 'testosterone_total' }, evaluation);
    expect(JSON.stringify(evaluation)).toBe(before);
    return { source, evaluation, graph: updates.at(-1) };
  }
  return { w, ctx, fields, shared, guards, storage, cache, record, updates, persistence, sync, dob, read, calculate,
    api: w.VildaLabNeonatalContext };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 26, 12)); });
afterEach(() => vi.useRealTimers());

describe('TT infant result-only — explicit main-DOB calendar transport', () => {
  it.each([213, 244, 300, 326, 364])('reads the complete calendar age %s days only with the TT opt-in', days => {
    const h = harness(days);
    expect(h.api.readForm()).toBeNull();
    expect(h.api.readForm(opt)).toMatchObject({ minipubertyOnly: true, infantTtTailOnly: true,
      postnatalDays: { lower: days - 1, upper: days, source: 'main-calendar-dates' } });
    expect(h.api.readForm(opt)).not.toHaveProperty('infantLhTailOnly');
    h.api.publish();
    expect(h.api.read(h.shared, h.record.patientId, h.record)).toMatchObject({ postnatalDays: null });
    expect(h.api.read(h.shared, h.record.patientId, h.record, { includeMinipuberty: true }).postnatalDays).toBeNull();
    expect(h.api.read(h.shared, h.record.patientId, h.record, { includeInfantTtTail: true }).postnatalDays).toBeNull();
    expect(h.api.read(h.shared, h.record.patientId, h.record, opt).postnatalDays)
      .toEqual({ lower: days - 1, upper: days, source: 'main-calendar-dates' });
    expect(h.api.readCache()).toMatchObject({ infantLhTailOnly: true, infantTtTailOnly: true });
    expect(JSON.stringify(h.api.readCache())).not.toContain(daysBefore(days));
    expect(h.persistence.writeShared).not.toHaveBeenCalled();
    expect(h.shared._vildaPersist.updatedAtISO).toBe('fictional-unchanged-source-version');
  });

  it('preserves the six-month clinical default and stops before the first birthday', () => {
    const h = harness(); h.dob('2026-04-27');
    expect(h.api.readForm()).toMatchObject({ minipubertyOnly: true });
    expect(h.api.readForm()).not.toHaveProperty('infantTtTailOnly');
    h.dob('2026-04-26'); expect(h.api.readForm()).toBeNull();
    expect(h.api.readForm(opt)).toMatchObject({ infantTtTailOnly: true });
    h.dob('2025-10-27'); expect(h.api.readForm(opt)).toMatchObject({ infantTtTailOnly: true });
    h.dob('2025-10-26'); expect(h.api.readForm(opt)).toBeNull();
    h.api.publish(); expect(h.api.readCache()).toBeNull();
  });

  it('requires the TT marker and calendar provenance rather than borrowing the LH opt-in', () => {
    const h = harness(); h.api.publish(); const original = h.api.readCache();
    for (const marker of [undefined, null, false, 'true', 1]) {
      h.cache.set(cacheKey, { ...original, infantTtTailOnly: marker });
      expect(h.api.read(h.shared, h.record.patientId, h.record, opt).postnatalDays).toBeNull();
    }
    h.cache.set(cacheKey, { ...original, postnatalDays: { lower: 294, upper: 300, source: 'main-completed-weeks' } });
    expect(h.api.read(h.shared, h.record.patientId, h.record, opt).postnatalDays).toBeNull();
    for (const invalid of ['', '31-02-2026']) {
      h.fields.dobInput.value = invalid; h.fields.ageWeeks.value = '43';
      expect(h.api.readForm(opt)).toBeNull();
    }
  });
});

describe('TT infant result-only — actual clinical evaluation and converter adapter', () => {
  it.each([211, 212, 213, 244, 300, 326, 364])('carries full DOB age %s without modifying the independent clinical assessment', day => {
    const h = harness(day); h.api.publish();
    const { source, evaluation, graph } = h.calculate();
    expect(source.neonatalAge.postnatalDays).toBeNull();
    expect(evaluation.input.neonatalAge.postnatalDays).toBeNull();
    expect(source.infantTtChronologicalAge.postnatalDays).toMatchObject({ lower: day - 1, upper: day });
    expect(source.infantLhChronologicalAge).toBeUndefined();
    expect(graph).toMatchObject({ analyte: 'testosterone_total', sex: 'male',
      ageYears: day === 211 ? evaluation.ageAtSample.lowerYears : (day - 1) / 365.25,
      ageUpperYears: day === 211 ? evaluation.ageAtSample.upperYears : (day + 1) / 365.25, ageUpperInclusive: false,
      infantTtContextAvailable: true, infantLhContextAvailable: false,
      identityKey: h.record.patientId, currentIdentityKey: h.record.patientId,
      measurement: { value: .4, unit: 'nmol/L', operator: '=' }, preterm: 'no' });
    expect(graph.ageLabel).toBe(day === 211 ? '6 mies.' : `${day - 1}–${day} dni`);
    expect(JSON.stringify(evaluation)).not.toContain('infantTtChronologicalAge');
    expect(evaluation.biochemical.status).toBe('unavailable');
  });

  it('keeps completed-month precision when there is no usable DOB cache, including the six-month boundary span', () => {
    for (const month of [6, 7, 9, 11]) {
      const h = harness(); h.shared.ageMonths = String(month); h.fields.ageMonths.value = String(month);
      const { source, evaluation, graph } = h.calculate();
      expect(source.infantTtChronologicalAge).toBeUndefined();
      expect(graph).toMatchObject({ ageYears: month / 12, ageUpperYears: evaluation.ageAtSample.upperYears,
        ageUpperInclusive: false, infantTtContextAvailable: true });
      expect(graph.ageUpperYears).toBeCloseTo((month + 1) / 12, 15);
      expect(graph.ageYears).toBe(evaluation.ageAtSample.lowerYears);
    }
  });

  it('keeps TT availability separate from prematurity, known assay/sample facts and positive treatment exclusions', () => {
    for (const extra of [{ preterm: 'yes' }, { preterm: 'unknown' },
      { assay: { confirmation: 'reported', methodId: 'fictional-incompatible-assay' } },
      { specimen: 'plasma' }, { treatment: { gnrha: 'yes' } }, { treatment: { sexSteroids: true } },
      { treatment: { context: 'hormonal' } }, { treatment: { exogenousTestosterone: 'yes' } },
      { treatment: { cocp: true } }, { measurementKind: 'gnrh-stimulation' }]) {
      const h = harness(); h.api.publish(); const { graph } = h.calculate(extra);
      expect(graph.infantTtContextAvailable).toBe(true);
      if (extra.preterm) expect(graph.preterm).toBe(extra.preterm);
      if (extra.assay) expect(graph.assayMethodId).toBe(extra.assay.methodId);
      if (extra.specimen) expect(graph.specimen).toBe('plasma');
      if (extra.treatment || extra.measurementKind || extra.specimen) expect(graph.contraindicated).toBe(true);
    }
    const h = harness(); h.api.publish(); h.record.puberty = { gnrhaStatus: 'w-trakcie' };
    expect(h.calculate().graph.contraindicated).toBe(true);
    expect(h.calculate({}, '<0.4').graph.measurement).toMatchObject({ value: .4, operator: '<' });
    expect(h.calculate({}, '0').graph.measurement).toMatchObject({ value: 0, operator: '=' });
    const early = harness(30); early.api.publish();
    expect(early.calculate({ treatment: { exogenousTestosterone: 'yes' } }).graph.contraindicated).toBe(false);
  });

  it('withholds the graph cache and flag while restoring, clearing, locked or preparing, and rejects stale identities', () => {
    for (const alter of [h => { h.guards.restoring = true; }, h => { h.guards.clearing = true; },
      h => { h.guards.unlocked = false; },
      h => { h.w.VildaPubertyAssessmentContext = { readActiveContext: () => ({ preparing: true }) }; },
      h => { h.record.patientId = 'fictional-infant-tt-b'; }, h => { h.record.status = 'loading'; }]) {
      const h = harness(); h.api.publish(); expect(h.read().infantTtChronologicalAge).toBeDefined();
      alter(h);
      expect(h.read().infantTtChronologicalAge).toBeUndefined();
      expect(h.calculate().graph.infantTtContextAvailable).not.toBe(true);
    }
    const h = harness(); h.api.publish(); h.storage.set('vildaCurrentPatientId', 'fictional-infant-tt-b');
    h.calculate(); expect(h.updates.at(-1)?.measurement).toBeNull();
  });

  it('does not lend main-DOB precision to local/partial/dated/contradictory ages, another sex, or another analyte', () => {
    for (const extra of [{ age: { years: 0, months: 8, precision: 'month' } }, { sex: 'F' },
      { contextBasis: 'sample' }, { sampleDateISO: '2026-01-01' },
      { treatment: { gnrha: 'yes' } }, { treatment: { exogenousTestosterone: 'yes' } }, { specimen: 'plasma' }]) {
      const h = harness(); h.api.publish(); const { evaluation, graph } = h.calculate(extra);
      expect(graph.ageYears).toBe(evaluation.ageAtSample.status === 'known' ? evaluation.ageAtSample.lowerYears : null);
      expect(graph.ageUpperYears).toBe(evaluation.ageAtSample.status === 'known' ? evaluation.ageAtSample.upperYears : null);
      if (extra.sex === 'F') expect(graph.infantTtContextAvailable).toBe(false);
    }
    const h = harness(); h.api.publish(); h.ctx.localOverride.age = 0;
    const local = h.calculate(); expect(local.graph.ageYears).toBe(local.evaluation.ageAtSample.lowerYears);
    h.ctx.localOverride.age = null;
    h.w.VildaPubertyAssessmentContext = { readActiveContext: () => ({ available: true, patientId: h.record.patientId,
      sex: 'M', demographics: { sex: 'M', ageYears: 0, ageMonths: null } }) };
    expect(h.read().infantTtChronologicalAge).toBeUndefined();
    h.w.VildaPubertyAssessmentContext = null;
    h.ctx.currentSubstance = { id: 'fsh' };
    expect(h.read().infantTtChronologicalAge).toBeUndefined();
    expect(h.read().neonatalAge.postnatalDays).toBeNull();
  });

  it('preserves early age routing, live-day invalidation and whole-form agreement', () => {
    const early = harness(120); early.api.publish();
    expect(early.read().neonatalAge.postnatalDays).toMatchObject({ lower: 119, upper: 120 });
    expect(early.read().infantTtChronologicalAge).toBeUndefined();
    const h = harness(); h.api.publish();
    h.shared.weight = 'fictional-other-form'; expect(h.read().infantTtChronologicalAge).toBeUndefined();
    h.sync(); expect(h.read().infantTtChronologicalAge).toBeDefined();
    vi.setSystemTime(new Date(2026, 9, 27, 12)); expect(h.read().infantTtChronologicalAge).toBeUndefined();
    h.w.VildaDobAge.refresh(); h.sync(); h.api.publish();
    expect(h.read().infantTtChronologicalAge.postnatalDays).toMatchObject({ lower: 300, upper: 301 });
  });

  it('does not let stale calendar days contradict the actual reported age and move the result into another profile', () => {
    const h = harness(); h.api.publish();
    h.cache.get(cacheKey).postnatalDays = { lower: 999, upper: 1000, source: 'main-calendar-dates' };
    const { evaluation, graph } = h.calculate();
    expect(graph).toMatchObject({ ageYears: evaluation.ageAtSample.lowerYears,
      ageUpperYears: evaluation.ageAtSample.upperYears, ageLabel: '9 mies.' });
  });

  it('keeps the saved-visit DOB anchor without writing DOB or graph precision into the assessment', () => {
    const h = harness(); h.storage.set('vildaLoadChoiceV1', 'restore');
    h.fields.weight.value = '8'; h.fields.height.value = '70';
    h.w.lastLoadedData = { user: { dobISO: '2025-12-30', age: 0, ageMonths: 9,
      measuredAtISO: '2026-10-26', weight: 8, height: 70 } };
    h.dob('2025-12-30'); h.api.publish();
    expect(h.api.readCache().liveDay).toBeNull();
    vi.setSystemTime(new Date(2026, 9, 27, 12));
    expect(h.read().infantTtChronologicalAge.postnatalDays).toMatchObject({ lower: 299, upper: 300 });
    const { evaluation } = h.calculate();
    expect(JSON.stringify(evaluation)).not.toContain('infantTtChronologicalAge');
    expect(JSON.stringify(h.api.readCache())).not.toContain('2025-12-30');
    expect(h.persistence.writeShared).not.toHaveBeenCalled();
  });
});
