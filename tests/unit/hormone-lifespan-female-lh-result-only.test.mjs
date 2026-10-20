import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const require = createRequire(import.meta.url);
const runtime = require('../../vilda_hormone_lifespan_data.js');
const engine = require('../../vilda_hormone_lifespan_reference.js');
const ageEngine = require('../../vilda_lab_puberty.js');
const agePolicy = require('../../vilda_lab_puberty_data.js');
const data = runtime.patientPointData;
const policy = JSON.parse(readFileSync(new URL(
  '../../docs/clinical/hormone-lifespan/female-lh-result-only-policy.json', import.meta.url), 'utf8'));
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const context = (ageYears = 17, extra = {}) => ({ analyte: 'lh', sex: 'female', ageYears,
  measurement: { value: 5, unit: 'IU/L', operator: '=' }, ...extra });
const resultOnly = (ageYears, extra) => engine.evaluateResultOnly(runtime, context(ageYears, extra));
const unavailable = reason => ({ status: 'unavailable', reason });

describe('LH dziewcząt >16–<18 — rzeczywisty wynik bez mediany', () => {
  it('dodaje oddzielną politykę bez zmiany któregokolwiek z 82 profili, konwersji i pozostałych danych', () => {
    expect(data.profiles).toHaveLength(82);
    expect(digest(data)).toBe('11905045ada04596a294491dce3d9986cd027b4882aa50f3bc5697b43d61da4f');
    const { resultOnlyPolicies, ...previous } = runtime;
    expect(digest(previous)).toBe('67fcbb04efec26eb5332527a70197a38c04344c8c2768cd72527eced7af173c5');
    expect(resultOnlyPolicies).toEqual([policy]);
    expect(policy).toMatchObject({ kind: 'educational-result-only', version: '2026-10-20.1',
      ordinaryOnly: true, minAge: 16, minAgeExclusive: true, maxAge: 18, maxAgeExclusive: true });
    expect(policy.sources).toHaveLength(3);
    for (const key of ['referenceValue', 'points', 'statistic']) expect(policy).not.toHaveProperty(key);
    expect(data).not.toHaveProperty('resultOnlyPolicies');
  });

  it('produkcyjny silnik zwraca wyłącznie wynik, jednostkę i politykę, bez liczbowego odniesienia lub werdyktu', () => {
    for (const age of [16.000001, 16 + 1 / 12, 17, 17 + 11 / 12, 17.999999]) {
      for (const value of [0, .001, 5, 70, 1000, 1e308]) {
        const result = resultOnly(age, { measurement: { value, unit: 'IU/L' } });
        expect(result).toEqual({ status: 'result-only', policy, value, unit: 'IU/L' });
        for (const key of ['profile', 'referenceValue', 'statistic', 'classification', 'percentile', 'sds']) {
          expect(result).not.toHaveProperty(key);
        }
        expect(engine.evaluate(data, context(age, { measurement: { value, unit: 'IU/L' } })))
          .toEqual(unavailable('unsupported-age'));
      }
    }
    const browser = loadBrowserScript('vilda_hormone_lifespan_reference.js');
    expect(browser.VildaHormoneLifespanReference.evaluateResultOnly(runtime, context()))
      .toEqual(engine.evaluateResultOnly(runtime, context()));
  });

  it('zachowuje dokładny węzeł Madsen 16 i nie wypełnia innych grup lub analitów', () => {
    expect(engine.evaluate(data, context(16))).toMatchObject({ status: 'ready',
      referenceValue: 5.64856591188875, profile: { id: 'madsen2022-female-lh-age-6-16' } });
    expect(resultOnly(16)).toEqual(unavailable('reference-available'));
    for (const age of [0, 1, 5, 18, 18.001, 19, 40]) expect(resultOnly(age).status).toBe('unavailable');
    for (const analyte of ['fsh', 'amh', 'inhb', 'e2', 'insl3', 'unknown']) {
      expect(resultOnly(17, { analyte }).status).toBe('unavailable');
    }
    expect(resultOnly(17, { sex: 'male' })).toEqual(unavailable('reference-available'));
    expect(resultOnly(17, { sex: 'unknown' })).toEqual(unavailable('unsupported-sex'));
  });

  it('kwalifikuje cały przedział rzeczywistego resolvera wieku, bez fikcyjnej daty urodzin', () => {
    for (const reported of [
      { years: 16, months: 1, precision: 'month' },
      { years: 17, months: 0, precision: 'month' },
      { years: 17, months: 11, precision: 'month' },
      { years: 17, precision: 'year' },
    ]) {
      const age = ageEngine.resolveAge({ age: reported });
      expect(age.status).toBe('known');
      expect(resultOnly(age.lowerYears, { ageUpperYears: age.upperYears, ageUpperInclusive: age.upperInclusive }).status)
        .toBe('result-only');
    }
    for (const reported of [
      { years: 16, months: 0, precision: 'month' }, { years: 16, precision: 'year' },
      { years: 18, months: 0, precision: 'month' },
    ]) {
      const age = ageEngine.resolveAge({ age: reported });
      expect(resultOnly(age.lowerYears, { ageUpperYears: age.upperYears, ageUpperInclusive: age.upperInclusive }).status)
        .toBe('unavailable');
    }
    expect(resultOnly(17, { ageUpperYears: 18, ageUpperInclusive: false }).status).toBe('result-only');
    for (const extra of [{ ageUpperYears: 18 }, { ageUpperYears: 18, ageUpperInclusive: true },
      { ageUpperYears: 18.01, ageUpperInclusive: false }, { ageUpperYears: 16 }, { ageUpperYears: NaN }]) {
      expect(resultOnly(17, extra)).toEqual(unavailable('ambiguous-age'));
    }
    for (const age of [null, NaN, Infinity, -1]) expect(resultOnly(age)).toEqual(unavailable('missing-age'));
  });

  it('przelicza te same obsługiwane jednostki i nie interpretuje znanej metody jako zgodności z medianą', () => {
    for (const unit of ['IU/L', 'mIU/mL']) {
      expect(resultOnly(17, { measurement: { value: 2.125, unit } }).value).toBe(2.125);
    }
    for (const assayMethodId of [undefined, null, '', 'unknown', 'mindray-cl-6000i', 'roche-e170', 'fictional-assay']) {
      expect(resultOnly(17, { assayMethodId })).toEqual({ status: 'result-only', policy, value: 5, unit: 'IU/L' });
    }
    for (const specimen of [undefined, null, '', 'unknown', 'serum', 'surowica', ' SERUM ']) {
      expect(resultOnly(17, { specimen }).status).toBe('result-only');
    }
    for (const specimen of ['plasma', 'saliva', 'urine']) {
      expect(resultOnly(17, { specimen })).toEqual(unavailable('incompatible-specimen'));
    }
    for (const unit of ['ng/mL', 'IU', 'µIU/mL', 'mg/dL', 'toString']) {
      expect(resultOnly(17, { measurement: { value: 5, unit } })).toEqual(unavailable('unsupported-unit'));
    }
    const broken = { ...runtime, patientPointData: { ...data,
      unitConversions: { ...data.unitConversions, lh: { unit: 'IU/L', factors: { 'IU/L': 1e308 } } } } };
    expect(engine.evaluateResultOnly(broken, context())).toEqual(unavailable('invalid-value'));
  });

  it('odrzuca cenzurowane i błędne pomiary, znane wyłączenia oraz nieobecną lub niejednoznaczną politykę', () => {
    for (const operator of ['<', '>', '<=', '>=', '≤', '≥', '<LOD']) {
      expect(resultOnly(17, { measurement: { value: 5, unit: 'IU/L', operator } }))
        .toEqual(unavailable('censored-result'));
    }
    for (const value of [-1, Infinity, NaN, '5', null]) {
      expect(resultOnly(17, { measurement: { value, unit: 'IU/L' } })).toEqual(unavailable('invalid-value'));
    }
    expect(resultOnly(17, { measurement: null })).toEqual(unavailable('invalid-value'));
    expect(resultOnly(17, { contraindicated: true })).toEqual(unavailable('contraindicated'));
    for (const cyclePhase of policy.excludedCyclePhases) {
      expect(resultOnly(17, { cyclePhase })).toEqual(unavailable('incompatible-reproductive-context'));
    }
    for (const cyclePhase of [undefined, 'unknown', 'follicular', 'ovulatory', 'luteal']) {
      expect(resultOnly(17, { cyclePhase }).status).toBe('result-only');
    }
    expect(engine.evaluateResultOnly(data, context())).toEqual(unavailable('unsupported-age'));
    expect(engine.evaluateResultOnly({ ...runtime, resultOnlyPolicies: [] }, context()))
      .toEqual(unavailable('unsupported-age'));
    expect(engine.evaluateResultOnly({ ...runtime, resultOnlyPolicies: [policy, policy] }, context()))
      .toEqual(unavailable('ambiguous-policy'));
  });

  it('nie obchodzi odmowy dostępnego profilu z powodu metody, materiału lub niepewnego wieku', () => {
    expect(resultOnly(15, { assayMethodId: 'mindray-cl-6000i' })).toEqual(unavailable('incompatible-assay'));
    expect(resultOnly(15, { specimen: 'plasma' })).toEqual(unavailable('incompatible-specimen'));
    expect(resultOnly(16, { ageUpperYears: 16 + 1 / 12, ageUpperInclusive: false }))
      .toEqual(unavailable('ambiguous-age'));
    const current = data.profiles.find(item => item.id === 'madsen2022-female-lh-age-6-16');
    const future = { ...runtime, patientPointData: { ...data, profiles: [...data.profiles,
      { ...current, minAge: 16.5, maxAge: 17.5 }] } };
    expect(engine.evaluateResultOnly(future, context())).toEqual(unavailable('reference-available'));
    expect(engine.evaluateResultOnly(future, context(17, { assayMethodId: 'different' })))
      .toEqual(unavailable('incompatible-assay'));
  });
});

const html = readFileSync(new URL('../../przelicznik-jednostek.html', import.meta.url), 'utf8');
const adapterSource = html.slice(html.indexOf('    function currentPatientIdentity()'), html.indexOf('    // ID substancji,'));
function currentForm() {
  const updates = [];
  const ctx = {
    window: { VildaLabPuberty: ageEngine, VildaLabPubertyData: agePolicy },
    identity: 'fictional-lh-result-only', localOverrideIdentity: 'fictional-lh-result-only',
    lifespanVault: null, lifespanCurrentSex: null, testosteroneMeasurementContext: {},
    localOverride: { sex: null, age: null, tanner: null, cycle_phase: null },
    overrideSexEl: { value: '' }, overrideAgeEl: { value: '' }, overrideAgeMonthsEl: { value: '' },
    overrideCycleEl: { value: '' }, overrideTannerEl: { value: '' },
    valueEl: { value: '5' }, unitEl: { value: 'IU/L' }, currentSubstance: { id: 'lh' },
    sourcePatient: { identityKey: 'fictional-lh-result-only', sourceStatus: 'ready', sex: 'F', ageYears: 17, ageMonths: 0 },
    effectivePatient: { sex: 'F', age: 17 },
    lifespanUI: { update: value => updates.push(value), clear: () => updates.push(null) },
    amhAgeReferenceUI: null, showError: () => {}, isPubertyReferenceSubstance: substance => substance.id === 'lh',
  };
  ctx.sessionStorage = { getItem: () => ctx.identity };
  ctx.readPubertyPatientContext = () => ctx.sourcePatient;
  ctx.getEffectivePatient = () => ctx.effectivePatient;
  vm.createContext(ctx);
  vm.runInContext(adapterSource, ctx);
  return { ctx, calculate(extra = {}, raw = '5') {
    const evaluation = ageEngine.evaluate({ analyte: 'lh', sex: 'F', age: { years: 17, months: 0, precision: 'month' },
      contextBasis: 'current-patient', value: raw, unit: 'IU/L', ...extra }, agePolicy);
    ctx.updateLifespan({ id: 'lh' }, evaluation);
    return { evaluation, result: engine.evaluateResultOnly(runtime, updates.at(-1)) };
  } };
}

describe('LH bez mediany — rzeczywisty adapter i niezależna ocena laboratoryjna', () => {
  it('wykorzystuje obecny wiek i wynik, a dodatkowy odczyt nie zmienia oceny laboratoryjnej', () => {
    const form = currentForm();
    const { evaluation, result } = form.calculate();
    const before = JSON.stringify(evaluation);
    expect(result.status).toBe('result-only');
    expect(JSON.stringify(evaluation)).toBe(before);
    expect(evaluation.measurement).toMatchObject({ status: 'valid', value: 5, unit: 'IU/L' });
    expect(form.calculate({}, '<5').result).toEqual(unavailable('censored-result'));
  });

  it('zachowuje znane leczenie, GnRHa, ciążę i stymulację zamiast omijać adapter', () => {
    for (const extra of [{ treatment: { context: 'hormonal' } }, { treatment: { gnrha: 'yes' } },
      { treatment: { sexSteroids: 'yes' } },
      { reproductiveContext: 'pregnancy' }, { measurementKind: 'stimulated' },
      { specimen: 'plasma' }]) {
      expect(currentForm().calculate(extra).result, JSON.stringify(extra)).toEqual(unavailable('contraindicated'));
    }
    const form = currentForm();
    form.ctx.sourcePatient.gnrhaStatus = 'w-trakcie';
    expect(form.calculate().result).toEqual(unavailable('contraindicated'));
    const pregnancy = currentForm();
    pregnancy.ctx.effectivePatient.pregnancy = 'yes';
    expect(pregnancy.calculate().result).toEqual(unavailable('contraindicated'));
    const cocp = currentForm();
    cocp.ctx.testosteroneMeasurementContext = { treatment: { cocp: 'yes' } };
    expect(cocp.calculate().result).toEqual(unavailable('contraindicated'));
    const switched = currentForm();
    switched.ctx.identity = 'fictional-new-person';
    expect(switched.calculate().result.status).toBe('unavailable');
  });
});
