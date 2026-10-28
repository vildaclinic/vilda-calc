import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

function fixture() {
  const win = {};
  loadBrowserScript('lab_units_data.js', win);
  loadBrowserScript('lab_unit_converter.js', win);
  return win.LabUnitConverter;
}
const converter = fixture();
const evaluate = (patient, value = 50) => converter.evaluate('estradiol', { value, unit: 'pmol/L', patient });
const unavailable = patient => {
  expect(evaluate(patient)).toMatchObject({ ok: true, siValue: 50, status: 'no_interpretation',
    matched: false, is_default: false, low: null, high: null, source_ids: [] });
};
const day = n => n / 365.25;

describe('E2 — chronological age qualifies the existing source, independent of Tanner', () => {
  it.each([1, 2, 3, 4, 5])('adult male Tanner %i retains the existing adult RI and verdict', tanner => {
    expect(evaluate({ sex: 'M', age: 30, life_stage: 'adult', tanner }))
      .toMatchObject({ status: 'within', low: 40, high: 160, matched: true, source_ids: ['tietz_2018'] });
  });
  it.each([undefined, null, '', '30', Number.NaN, Infinity, -1])('invalid/missing age %j never acquires a Tanner age', age => {
    for (const sex of ['M', 'F']) for (const tanner of [null, 1, 5]) {
      unavailable({ sex, age, tanner, life_stage: tanner === 1 ? 'pediatric' : 'adult' });
    }
  });
  it.each([0, day(1), day(13), day(14)])('age %s stays outside the source neonatal window', age => {
    for (const sex of ['M', 'F']) for (const tanner of [null, 1, 2, 5]) {
      unavailable({ sex, age, tanner, life_stage: 'pediatric' });
    }
  });
  it('allows the source >14 days, and does not use mean Tanner age as a cutoff', () => {
    expect(evaluate({ sex: 'M', age: day(14) + 1e-9, tanner: 1, life_stage: 'pediatric' }))
      .toMatchObject({ low: 0, high: 47.79, status: 'above' });
    expect(evaluate({ sex: 'M', age: 12, tanner: 1, life_stage: 'pediatric' }))
      .toMatchObject({ low: 0, high: 47.79 });
  });
  it('requires the whole known age to qualify, without midpoint or extra precision', () => {
    unavailable({ sex: 'M', age: 0, ageUpperYears: 1 / 12, ageUpperInclusive: false, tanner: 1 });
    unavailable({ sex: 'M', age: 17, ageUpperYears: 19, ageUpperInclusive: false, tanner: 1 });
    unavailable({ sex: 'M', age: 8, ageUpperYears: 10, ageUpperInclusive: false });
    expect(evaluate({ sex: 'M', age: 17, ageUpperYears: 18, ageUpperInclusive: false, tanner: 1 }))
      .toMatchObject({ low: 0, high: 47.79 });
    unavailable({ sex: 'M', age: 17, ageUpperYears: 18, ageUpperInclusive: true, tanner: 1 });
    expect(evaluate({ sex: 'M', age: 18, ageUpperYears: 19, ageUpperInclusive: false, tanner: 1 }))
      .toMatchObject({ status: 'within', low: 40, high: 160 });
  });
  it.each([{ ageUpperYears: 29 }, { ageUpperYears: '31' }, { ageUpperYears: NaN },
    { ageUpperYears: 30, ageUpperInclusive: false }, { ageUpperYears: 31, ageUpperInclusive: 'false' }])(
    'invalid supplied age envelope is not discarded: %j', extra => unavailable({ sex: 'M', age: 30, ...extra }));
  it('uses chronological age over a contradictory legacy life_stage, for E2 only', () => {
    expect(evaluate({ sex: 'M', age: 30, tanner: 1, life_stage: 'pediatric' }))
      .toMatchObject({ low: 40, high: 160, status: 'within' });
    expect(evaluate({ sex: 'M', age: 12, tanner: 5, life_stage: 'adult' }))
      .toMatchObject({ low: 36.76, high: 147.04 });
    expect(converter.evaluate('tsh', { value: 2, unit: 'mIU/L', patient: {} }))
      .toMatchObject({ status: 'within', low: .3, high: 4.2 });
  });
  it('preserves adult female unknown-phase alternatives and known phases', () => {
    for (const tanner of [1, 5]) {
      const c = { sex: 'F', age: 30, life_stage: 'adult', tanner };
      expect(evaluate(c)).toMatchObject({ status: 'no_interpretation', reference_context_required: true });
      expect(evaluate(c).reference_variants).toHaveLength(4);
      expect(evaluate({ ...c, cycle_phase: 'follicular' })).toMatchObject({ low: 70, high: 290, status: 'below' });
    }
  });
  it('does not alter inputs, conversion factors or source concentrations', () => {
    const patient = { sex: 'M', age: 30, tanner: 1, life_stage: 'adult' };
    const before = structuredClone(patient);
    const expected = converter.find('estradiol').reference_ranges_si.find(r => r.id === 'e2_male_adult');
    expect(evaluate(patient)).toMatchObject({ low: expected.low, high: expected.high, source_ids: expected.source_ids });
    expect(patient).toEqual(before);
    expect(converter.convert({ substanceId: 'estradiol', value: 50, fromUnit: 'pmol/L', toUnit: 'pg/mL' }).value)
      .toBeCloseTo(50 / 3.671, 12);
  });
});

describe('E2 — actual form adapter reuses existing age precision', () => {
  const html = readFileSync(new URL('../../przelicznik-jednostek.html', import.meta.url), 'utf8');
  const adapter = html.slice(html.indexOf('    function getEffectivePatient()'), html.indexOf('    var RZYMSKIE'));
  function read(source, shared = {}, resolved = null) {
    const context = { syncPatientIdentity() {}, readPatientFromShared: () => shared,
      localOverride: {}, measurementCtx: {}, currentSubstance: { id: 'estradiol' },
      readPubertyPatientContext: () => source, lifespanLegacyAge: () => ({ resolved }) };
    vm.createContext(context); vm.runInContext(adapter, context);
    return context.getEffectivePatient();
  }
  it('passes the real complete age and does not manufacture a birthday', () => {
    const p = read({ sourceStatus: 'ready' }, { sex: 'M', age: 0, tanner: 1 },
      { status: 'known', lowerYears: 0, upperYears: 1 / 12, upperInclusive: false });
    expect(p).toMatchObject({ age: 0, ageUpperYears: 1 / 12, ageUpperInclusive: false });
    unavailable(p);
  });
  it('does not borrow stale shared age when the current source is unavailable', () => {
    const p = read({ sourceStatus: 'unavailable' }, { sex: 'M', age: 30, tanner: 1 });
    unavailable(p);
  });
  it.each([[14, false], [15, false], [16, true]])('calendar day %i keeps the actual resolver envelope', (days, ready) => {
    const win = loadBrowserScript('vilda_lab_puberty.js');
    const ageAdapter = html.slice(html.indexOf('    function lifespanLegacyAge(source)'),
      html.indexOf('    function lifespanContraindicated(source'));
    const source = { sourceStatus: 'ready', sex: 'M', ageYears: 0, ageMonths: 0,
      neonatalAge: { postnatalDays: { lower: days - 1, upper: days, source: 'main-calendar-dates' } } };
    const context = { window: win, syncPatientIdentity() {},
      readPatientFromShared: () => ({ sex: 'M', age: 0, tanner: 1 }),
      localOverride: {}, measurementCtx: {}, currentSubstance: { id: 'estradiol' },
      readPubertyPatientContext: () => source };
    vm.createContext(context); vm.runInContext(ageAdapter + adapter, context);
    const patient = context.getEffectivePatient();
    const resolved = win.VildaLabPuberty.resolveAge({ neonatalAge: source.neonatalAge });
    expect(patient.age).toBe(resolved.lowerYears);
    expect(patient.ageUpperYears).toBe(resolved.upperYears);
    expect(patient.ageUpperInclusive).toBe(resolved.upperInclusive);
    if (ready) expect(evaluate(patient)).toMatchObject({ low: 0, high: 47.79, matched: true });
    else unavailable(patient);
  });
});
