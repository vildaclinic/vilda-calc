import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const puberty = require('../../vilda_lab_puberty.js');
const tt = require('../../vilda_lab_testosterone.js');
const ttData = require('../../vilda_lab_testosterone_data.js');
const adapter = require('../../vilda_female_tt_infant_context.js');
const upper = require('../../vilda_female_tt_infant_upper.js');
const read = name => JSON.parse(readFileSync(new URL(`../../docs/clinical/hormone-lifespan/${name}.json`, import.meta.url), 'utf8'));
const data = read('female-tt-infant-upper-data');
const policy = read('female-tt-infant-upper-policy');
const person = 'fictional-female-infant-calendar';
const pna = { lower: 101, upper: 102, source: 'main-calendar-dates' };
const ga = { lower: 280, upper: 280, source: 'patient-record' };
const age = months => ({ years: 0, months, precision: 'month' });
const clone = value => structuredClone(value);

function attachCalendar(source, birthDateISO = '2026-06-01') {
  const postnatalDays = source.neonatalAge.postnatalDays;
  if (!postnatalDays || postnatalDays.source !== 'main-calendar-dates') return;
  const birth = Date.parse(birthDateISO + 'T00:00:00Z');
  const at = days => puberty.resolveAge({ birthDateISO,
    sampleDateISO: new Date(birth + days * 86400000).toISOString().slice(0, 10) });
  source.neonatalAge.femaleTtCalendarAge = { lowerYears: at(postnatalDays.lower).lowerYears,
    upperYears: at(postnatalDays.upper).upperYears, upperInclusive: true, postnatalDays: clone(postnatalDays) };
}

function fixture(extra = {}) {
  const evaluation = tt.evaluate({ analyte: 'testosterone_total', sex: 'F', age: age(3),
    value: '.18', unit: 'nmol/L', contextBasis: 'current-patient', specimen: 'serum',
    assay: { methodId: 'lc-ms/ms', confirmation: 'reported' },
    neonatalAge: { postnatalDays: pna, gestationalDays: ga }, ...extra }, ttData);
  const resolved = evaluation.ageAtSample;
  const source = { sourceStatus: 'ready', identityKey: person, sex: 'F',
    neonatalAge: clone(evaluation.input.neonatalAge || {}) };
  attachCalendar(source);
  const context = { analyte: 'testosterone_total', sex: 'female', sourceStatus: 'ready',
    contextBasis: evaluation.input.contextBasis, sampleDateISO: evaluation.input.sampleDateISO,
    identityKey: person, currentIdentityKey: person,
    ageYears: resolved.lowerYears, ageUpperYears: resolved.upperYears, ageUpperInclusive: resolved.upperInclusive,
    measurement: evaluation.measurement, specimen: evaluation.input.specimen,
    assayMethodId: evaluation.input.assay.methodId, displayUnit: 'nmol/L' };
  return { evaluation, source, context };
}

const adapt = ({ context, source, evaluation }) => adapter.adapt(context, source, evaluation);
const compare = value => upper.evaluate(data, policy, value);
afterEach(() => vi.useRealTimers());

describe('female infant TT — source-only chronological calendar adapter', () => {
  it('refines the actual DOB/PNA interval while preserving every canonical TT and history field', () => {
    const f = fixture(), before = clone(f);
    expect(f.evaluation.ageAtSample).toMatchObject({ source: 'reported-age',
      lowerYears: 3 / 12, upperYears: 4 / 12, upperInclusive: false });
    expect(f.evaluation.referenceSelection.status).toBe('unavailable');
    expect(f.evaluation.referencePreview).toBeUndefined();
    const result = adapt(f);
    // 1 June + [101,102] days = 10–11 September, not a date chosen today.
    expect(result.ageYears).toBeCloseTo((3 + 9 / 30) / 12, 14);
    expect(result.ageUpperYears).toBeCloseTo((3 + 10 / 30) / 12, 14);
    expect(result.ageUpperInclusive).toBe(true);
    expect(result.ageUpperYears).toBeGreaterThan(result.ageYears);
    expect(result).toMatchObject({ gestationalAgeDays: 280, gestationalAgeUpperDays: 280,
      gestationalAgeUpperInclusive: true, sampleDateISO: null });
    expect(compare(result)).toMatchObject({ status: 'ready', upper: { sourceUpper: .21 },
      median: null, lowerLimit: null, comparison: { status: 'not-above-upper' } });
    expect(f).toEqual(before);
    expect(f.evaluation.biochemical).toMatchObject({ status: 'unavailable', primary: null });
    expect(JSON.stringify(f.source)).not.toContain('2026-06-01');
    expect(tt.evaluate(f.evaluation.input, ttData)).toEqual(f.evaluation);
  });

  it('retains the original visit anchor when the system day changes years later', () => {
    const f = fixture(), before = clone(f);
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-11T12:00:00Z'));
    const original = adapt(f);
    vi.setSystemTime(new Date('2035-12-31T23:59:59Z'));
    expect(adapt(f)).toEqual(original);
    expect(f).toEqual(before);
    expect(original.sampleDateISO).toBeNull();
    expect(f.evaluation.input.birthDateISO).toBeNull();
  });

  it('uses the existing calendar-anniversary clamp for a month-end birth', () => {
    const f = fixture({ age: age(2), neonatalAge: {
      postnatalDays: { lower: 59, upper: 60, source: 'main-calendar-dates' }, gestationalDays: ga,
    } });
    attachCalendar(f.source, '2024-01-31');
    const result = adapt(f);
    // Leap-year DOB + 59/60 days is 30/31 March. February anniversary is clamped.
    expect(result.ageYears).toBeCloseTo((1 + 30 / 31) / 12, 14);
    expect(result.ageUpperYears).toBe(2 / 12);
    expect(result.ageUpperInclusive).toBe(true);
  });

  it('keeps the full day uncertainty when its inclusive end reaches the 3.5-month boundary', () => {
    const f = fixture({ neonatalAge: {
      postnatalDays: { lower: 106, upper: 107, source: 'main-calendar-dates' }, gestationalDays: ga,
    } });
    const adapted = adapt(f), result = compare(adapted);
    expect(adapted.ageYears).toBeLessThan(3.5 / 12);
    expect(adapted.ageUpperYears).toBe(3.5 / 12);
    expect(result).toMatchObject({ status: 'split', upper: null,
      comparison: { status: 'indeterminate', patientPoint: null } });
    expect(result.rows.map(row => row.sourceUpper)).toEqual([.21, .17]);
  });

  it('keeps a manually overridden three-month age coarse after its inherited PNA was cleared', () => {
    const f = fixture({ neonatalAge: { gestationalDays: ga } });
    // The guarded main cache can still exist; it must not replace local input.
    f.source.neonatalAge.postnatalDays = clone(pna);
    const result = adapt(f);
    expect(result).toMatchObject({ ageYears: 3 / 12, ageUpperYears: 4 / 12, ageUpperInclusive: false });
    expect(compare(result)).toMatchObject({ status: 'split', upper: null,
      comparison: { status: 'indeterminate', patientPoint: null } });
  });

  it.each([
    [183, 'unavailable'], [184, 'selected'],
  ])('preserves the canonical six-month protection for %s reported days', (dayCount, referenceStatus) => {
    const f = fixture({ age: null, assay: {}, neonatalAge: { postnatalDays: {
      lower: dayCount, upper: dayCount, source: 'reported-days',
    }, gestationalDays: ga } });
    const before = clone(f), result = adapt(f);
    expect(f.evaluation.referenceSelection.status).toBe(referenceStatus);
    expect(result.ageYears).toBe((dayCount === 183 ? 5 : 6) / 12);
    expect(result.ageUpperYears).toBe(7 / 12);
    expect(result.ageUpperInclusive).toBe(false);
    expect(compare(result)).toMatchObject({ status: 'unavailable', reason: 'unsupported-source-age' });
    expect(f).toEqual(before);
  });

  it('leaves an established six-calendar-month Mayo preview intact and does not activate the infant source', () => {
    const f = fixture({ age: age(6), assay: {}, neonatalAge: {
      postnatalDays: { lower: 180, upper: 181, source: 'main-calendar-dates' }, gestationalDays: ga,
    } });
    attachCalendar(f.source, '2026-02-01');
    const before = clone(f.evaluation), result = adapt(f);
    expect(f.evaluation.referencePreview.byAge.range.id).toBe('mayo-ttst-f-6m-9y');
    expect(f.evaluation.ageAtSample).toMatchObject({ lowerYears: .5, upperInclusive: false });
    expect(compare(result)).toMatchObject({ status: 'unavailable', reason: 'unsupported-source-age' });
    expect(f.evaluation).toEqual(before);
  });

  it.each([
    f => { f.context.currentIdentityKey = 'fictional-other-current'; },
    f => { f.source.identityKey = 'fictional-other-source'; },
    f => { f.source.sourceStatus = 'loading'; },
    f => { f.context.sourceStatus = 'unavailable'; },
    f => { f.source.sex = 'M'; },
    f => { f.context.contextBasis = 'sample'; },
    f => { f.context.sampleDateISO = '2026-09-11'; },
  ])('does not refine or forward GA across an unavailable/mismatched current context %#', change => {
    const f = fixture(); change(f);
    const before = clone(f);
    expect(adapt(f)).toEqual(f.context);
    expect(f).toEqual(before);
  });

  it.each([
    f => { f.source.neonatalAge.postnatalDays.upper += 1; },
    f => { f.source.neonatalAge.postnatalDays.source = 'main-completed-weeks'; },
    f => { delete f.source.neonatalAge.postnatalDays; },
    f => { f.source.neonatalAge.femaleTtCalendarAge.postnatalDays.upper += 1; },
    f => { f.source.neonatalAge.femaleTtCalendarAge.lowerYears = NaN; },
    f => { f.source.neonatalAge.femaleTtCalendarAge.upperYears = 0; },
    f => { f.source.neonatalAge.femaleTtCalendarAge.upperInclusive = false; },
    f => { delete f.source.neonatalAge.femaleTtCalendarAge; },
  ])('retains the canonical age when source PNA or derived calendar metadata cannot verify the interval %#', change => {
    const f = fixture(); change(f);
    const before = clone(f), result = adapt(f);
    expect(result).toMatchObject({ ageYears: f.context.ageYears, ageUpperYears: f.context.ageUpperYears,
      ageUpperInclusive: f.context.ageUpperInclusive });
    expect(f).toEqual(before);
  });

  it.each([
    [259, 265, 'ready'], [287, 293, 'ready'], [287, 294, 'unavailable'],
  ])('forwards the whole normalized GA %s–%s instead of selecting its favorable edge', (lower, high, status) => {
    const f = fixture({ neonatalAge: { postnatalDays: pna,
      gestationalDays: { lower, upper: high, source: 'patient-record' } } });
    const result = adapt(f);
    expect(result).toMatchObject({ gestationalAgeDays: lower, gestationalAgeUpperDays: high,
      gestationalAgeUpperInclusive: true });
    expect(compare(result).status).toBe(status);
    if (status === 'unavailable') expect(compare(result).reason).toBe('outside-source-gestational-age');
  });

  it('does not turn invalid/missing normalized GA into confirmed term gestation', () => {
    const f = fixture({ neonatalAge: { postnatalDays: pna,
      gestationalDays: { lower: 280, upper: 279, source: 'patient-record' } } });
    expect(f.evaluation.input.neonatalAge.gestationalDays).toBeNull();
    const result = adapt(f);
    expect(result).not.toHaveProperty('gestationalAgeDays');
    expect(compare(result)).toMatchObject({ status: 'source-info', missingSourceFacts: ['gestational-age'],
      comparison: { status: 'source-info', patientPoint: null } });
  });
});
