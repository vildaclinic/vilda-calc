import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const require = createRequire(import.meta.url);
const runtime = require('../../vilda_hormone_lifespan_data.js');
const engine = require('../../vilda_hormone_lifespan_reference.js');
const ageEngine = require('../../vilda_lab_puberty.js');
const policies = JSON.parse(readFileSync(new URL(
  '../../docs/clinical/hormone-lifespan/childhood-lh-result-only-policy.json', import.meta.url), 'utf8'));
const oldPolicy = JSON.parse(readFileSync(new URL(
  '../../docs/clinical/hormone-lifespan/female-lh-result-only-policy.json', import.meta.url), 'utf8'));
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
const context = (sex = 'male', ageYears = 4, extra = {}) => ({
  analyte: 'lh', sex, ageYears, ageUpperYears: ageYears, ageUpperInclusive: true,
  contextBasis: 'current-patient', childhoodLhContextAvailable: true,
  measurement: { value: .2, unit: 'IU/L', operator: '=' }, ...extra,
});
const result = (sex, age, extra) => engine.evaluateResultOnly(runtime, context(sex, age, extra));
const unavailable = reason => ({ status: 'unavailable', reason });

describe('LH dzieci — rzeczywisty wynik, bez nowej mediany', () => {
  it('dodaje tylko osobną listę uprawnień i zachowuje wszystkie wcześniejsze 40 pól oraz 85 profili', () => {
    const { childhoodLhResultOnlyPolicies, ...previous } = runtime;
    expect(childhoodLhResultOnlyPolicies).toEqual(policies);
    expect(Object.keys(previous)).toHaveLength(40);
    expect(digest(previous)).toBe('10c7276f91bcd0a12464a21769ea6bd434dd4a986688b6f34766052604f46784');
    expect(runtime.patientPointData.profiles).toHaveLength(85);
    expect(digest(runtime.patientPointData)).toBe('28730dd407d52ef41afe8f2f5af5ab56ce541398e1c25d4dce5be5324a5ddcc9');
    expect(runtime.resultOnlyPolicies).toEqual([oldPolicy]);
    expect(runtime.patientPointData).not.toHaveProperty('childhoodLhResultOnlyPolicies');
    policies.forEach(policy => {
      expect(policy).toMatchObject({ version: '2026-10-25.1', kind: 'educational-result-only',
        ordinaryOnly: true, analyte: 'lh', unit: 'IU/L', fullAgeIntervalRequired: true,
        currentPatientOnly: true, contextAvailabilityKey: 'childhoodLhContextAvailable',
        wholeLifeResultNote: 'Sam wynik zobaczysz w „Całym życiu”, bez mediany.' });
      for (const key of ['points', 'statistic', 'referenceValue']) expect(policy).not.toHaveProperty(key);
    });
  });

  it.each(['male', 'female'])('%s — zachowuje rzeczywiste stężenie, również zero i wynik ponad skalą', sex => {
    for (const value of [0, .001, .03, .2, 5, 70, 1000, 1e308]) {
      const actual = result(sex, 4, { measurement: { value, unit: 'IU/L', operator: '=' } });
      expect(actual).toMatchObject({ status: 'result-only', value, unit: 'IU/L',
        policy: { id: `childhood-${sex}-lh-result-only` } });
      for (const key of ['profile', 'referenceValue', 'median', 'ratio', 'classification', 'percentile', 'sds']) {
        expect(actual).not.toHaveProperty(key);
      }
      expect(engine.evaluate(runtime.patientPointData, context(sex, 4))).toEqual(unavailable('unsupported-age'));
    }
    const browser = loadBrowserScript('vilda_hormone_lifespan_reference.js');
    expect(browser.VildaHormoneLifespanReference.evaluateResultOnly(runtime, context(sex)))
      .toEqual(result(sex, 4));
  });

  it('zachowuje odrębne brzegi M[1,6), F(1,6) oraz istniejące mediany dokładnego F1 i Madsen od 6', () => {
    expect(result('male', 1)).toMatchObject({ status: 'result-only', value: .2 });
    expect(result('female', 1, { preterm: 'no' })).toEqual(unavailable('reference-available'));
    expect(engine.evaluate(runtime.patientPointData, context('female', 1, { preterm: 'no' })))
      .toMatchObject({ status: 'ready', referenceValue: .076, profile: { id: 'ljubicic2022-female-lh' } });
    expect(result('female', 1, { preterm: 'unknown' })).toEqual(unavailable('preterm-context'));
    expect(result('female', 1 + 1e-7).status).toBe('result-only');
    for (const [sex, median] of [['male', .1193163370958486], ['female', .10494872221541938]]) {
      expect(engine.evaluate(runtime.patientPointData, context(sex, 6)))
        .toMatchObject({ status: 'ready', referenceValue: median });
      expect(result(sex, 6)).toEqual(unavailable('reference-available'));
      expect(result(sex, 5, { ageUpperYears: 6, ageUpperInclusive: false }).status).toBe('result-only');
      expect(result(sex, 5, { ageUpperYears: 6, ageUpperInclusive: true })).toEqual(unavailable('ambiguous-age'));
      expect(result(sex, 5, { ageUpperYears: 6.001, ageUpperInclusive: false })).toEqual(unavailable('ambiguous-age'));
    }
  });

  it.each(['male', 'female'])('%s — wymaga całego jawnego przedziału, korzysta z rzeczywistego resolvera', sex => {
    for (const reported of [{ years: 2, precision: 'year' }, { years: 4, months: 0, precision: 'month' },
      { years: 5, months: 11, precision: 'month' }, { years: 5, precision: 'year' }]) {
      const age = ageEngine.resolveAge({ age: reported });
      expect(age.status).toBe('known');
      expect(result(sex, age.lowerYears, { ageUpperYears: age.upperYears,
        ageUpperInclusive: age.upperInclusive }).status).toBe('result-only');
    }
    for (const extra of [{ ageUpperYears: undefined }, { ageUpperYears: null }, { ageUpperYears: NaN },
      { ageUpperYears: Infinity }, { ageUpperYears: 3 }, { ageUpperInclusive: undefined },
      { ageUpperInclusive: null }, { ageUpperInclusive: 'false' }, { ageUpperInclusive: false }]) {
      expect(result(sex, 4, extra)).toEqual(unavailable('ambiguous-age'));
    }
    for (const age of [null, NaN, Infinity, -1]) expect(result(sex, age)).toEqual(unavailable('missing-age'));
  });

  it.each(['male', 'female'])('%s — nowe uprawnienie wymaga jawnej dostępności bieżącego kontekstu', sex => {
    for (const flag of [undefined, null, false, 0, 1, 'true']) {
      const actual = result(sex, 4, { childhoodLhContextAvailable: flag });
      expect(actual).toEqual(unavailable('current-context-unavailable'));
      expect(actual).not.toHaveProperty('sourceNote');
    }
    for (const extra of [{ contextBasis: undefined }, { contextBasis: 'sample' },
      { sampleDateISO: '2025-01-01' }]) {
      expect(result(sex, 4, extra)).toEqual(unavailable('incompatible-current-context'));
    }
    expect(result(sex, 4, { contraindicated: true })).toEqual(unavailable('contraindicated'));
    for (const phase of policies[0].excludedCyclePhases) {
      expect(result(sex, 4, { cyclePhase: phase })).toEqual(unavailable('incompatible-reproductive-context'));
    }
  });

  it.each(['male', 'female'])('%s — brak fallbacku po odrzuceniu istniejącego profilu', sex => {
    expect(result(sex, 6, { assayMethodId: 'fictional-incompatible-method' })).toEqual(unavailable('incompatible-assay'));
    expect(result(sex, 6, { specimen: 'plasma' })).toEqual(unavailable('incompatible-specimen'));
    const original = runtime.patientPointData.profiles.find(p => p.analyte === 'lh' && p.sex === sex && p.minAge === 6);
    const profile = { ...original, id: 'fictional-future-source', minAge: 2, maxAge: 6,
      maxAgeExclusive: true, points: [{ ageYears: 2, value: .1 }, { ageYears: 6, value: .1 }] };
    const future = { ...runtime, patientPointData: { ...runtime.patientPointData,
      profiles: [...runtime.patientPointData.profiles, profile] } };
    const evaluate = extra => engine.evaluateResultOnly(future, context(sex, 4, extra));
    expect(evaluate()).toEqual(unavailable('reference-available'));
    expect(evaluate({ assayMethodId: 'fictional-incompatible-method' })).toEqual(unavailable('incompatible-assay'));
    expect(evaluate({ specimen: 'urine' })).toEqual(unavailable('incompatible-specimen'));
    expect(evaluate({ ageUpperYears: 7 })).toEqual(unavailable('ambiguous-age'));
  });

  it.each(['male', 'female'])('%s — jednostki, niezgodny materiał i sam wynik niezależny od metody źródła', sex => {
    for (const unit of ['IU/L', 'mIU/mL']) {
      expect(result(sex, 4, { measurement: { value: .03, unit } })).toMatchObject({ status: 'result-only', value: .03 });
    }
    for (const method of [undefined, null, '', 'unknown', 'abbott-imx', 'fictional-assay']) {
      expect(result(sex, 4, { assayMethodId: method }).status).toBe('result-only');
    }
    for (const specimen of [undefined, null, '', 'unknown', 'serum', 'surowica', ' SERUM ']) {
      expect(result(sex, 4, { specimen }).status).toBe('result-only');
    }
    for (const specimen of ['plasma', 'urine', 'saliva']) {
      expect(result(sex, 4, { specimen })).toEqual(unavailable('incompatible-specimen'));
    }
    for (const unit of ['ng/mL', 'IU', 'mg/dL', 'toString']) {
      expect(result(sex, 4, { measurement: { value: .2, unit } })).toMatchObject({ status: 'unavailable', reason: 'unsupported-unit' });
    }
  });

  it.each(['male', 'female'])('%s — cenzura i błędny zapis nie tworzą dokładnej kropki', sex => {
    for (const operator of ['<', '>', '<=', '>=', '≤', '≥', '<LOD', '<LOQ']) {
      const actual = result(sex, 4, { measurement: { value: .2, unit: 'IU/L', operator } });
      expect(actual).toMatchObject({ status: 'unavailable', reason: 'censored-result' });
      expect(actual).not.toHaveProperty('value');
      expect(actual.sourceNote).toMatchObject({ literalP50: '<0,07 U/L' });
    }
    for (const value of [-1, NaN, Infinity, '0.2', null]) {
      expect(result(sex, 4, { measurement: { value, unit: 'IU/L' } }))
        .toMatchObject({ status: 'unavailable', reason: 'invalid-value' });
    }
    const symbolic = result(sex, 4, { measurement: { value: null, operator: '<', censoring: 'LOQ', unit: 'IU/L' } });
    expect(symbolic.status).toBe('unavailable');
    expect(symbolic).not.toHaveProperty('value');
    expect(symbolic.sourceNote.displayP50).toBe('<0,07 IU/L');
  });

  it.each(['male', 'female'])('%s — źródłowa nierówność dotyczy całej grupy i tylko całego [2,6)', sex => {
    for (const age of [2, 3, 4, 5.99999]) {
      const note = result(sex, age).sourceNote;
      expect(note).toMatchObject({ id: 'wiedemann1993-table4-lh-pooled-2-11', kind: 'censored-group-median',
        literalP50: '<0,07 U/L', displayP50: '<0,07 IU/L', closedSourcesOnly: true,
        notNumericReference: true, notClinicalReference: true,
        sourceAgeGroup: { label: '2–11 lat, obie płcie razem', n: 282,
          notAgeSpecific: true, notSeparateSexCounts: true },
        source: { printedPage: 398,
          pdfSha256: 'b312c8ee0bece47100d2a179413488da282d81febb9f77bde9f0f61bf9d723d0' } });
      for (const key of ['value', 'referenceValue', 'points', 'median', 'referenceInterval', 'p975']) {
        expect(note).not.toHaveProperty(key);
      }
    }
    for (const [age, extra] of [[1.5, {}], [1.99999, {}], [1.5, { ageUpperYears: 2.5 }],
      [5, { ageUpperYears: 6, ageUpperInclusive: true }], [6, {}], [18, {}]]) {
      expect(result(sex, age, extra)).not.toHaveProperty('sourceNote');
    }
    expect(result(sex, 5, { ageUpperYears: 6, ageUpperInclusive: false }).sourceNote).toBeDefined();
  });

  it('nie wypełnia innych analitów, brakującej lub niejednoznacznej polityki', () => {
    for (const analyte of ['fsh', 'amh', 'inhb', 'e2', 'insl3', 'unknown']) {
      expect(result('male', 4, { analyte }).status).toBe('unavailable');
    }
    const base = { ...runtime, childhoodLhResultOnlyPolicies: [] };
    expect(engine.evaluateResultOnly(base, context())).toEqual(unavailable('unsupported-age'));
    expect(engine.evaluateResultOnly({ ...base, childhoodLhResultOnlyPolicies: [policies[0], policies[0]] }, context()))
      .toEqual(unavailable('ambiguous-policy'));
    expect(result('unknown', 4)).toEqual(unavailable('unsupported-sex'));
  });

  it('zachowuje dawny tryb LH dziewcząt >16–<18 wraz z jego dotychczasową kwalifikacją', () => {
    expect(oldPolicy).not.toHaveProperty('wholeLifeResultNote');
    const legacy = { analyte: 'lh', sex: 'female', ageYears: 17,
      measurement: { value: 5, unit: 'IU/L', operator: '=' } };
    expect(engine.evaluateResultOnly(runtime, legacy)).toEqual({ status: 'result-only', policy: oldPolicy, value: 5, unit: 'IU/L' });
    expect(engine.evaluateResultOnly(runtime, { ...legacy, contextBasis: 'sample', sampleDateISO: '2025-01-01' }))
      .toEqual({ status: 'result-only', policy: oldPolicy, value: 5, unit: 'IU/L' });
    expect(engine.evaluateResultOnly(runtime, { ...legacy, measurement: { value: 5, unit: 'IU/L', operator: '<' } }))
      .toEqual(unavailable('censored-result'));
  });
});
