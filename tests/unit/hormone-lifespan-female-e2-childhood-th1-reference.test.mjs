import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { beforeE2PhaseSourceRuntime, beforeFemaleE2ChildhoodBundle, beforeInhibinPost47Bundle } from '../support/prior-female-gonadotropin-bundle.mjs';

const require = createRequire(import.meta.url);
const runtime = require('../../vilda_hormone_lifespan_data.js');
const engine = require('../../vilda_hormone_lifespan_reference.js');
const ageEngine = require('../../vilda_lab_puberty.js');
const data = runtime.patientPointData;
const id = 'kulle2024-female-e2-th1-age-over1-under6';
const profile = data.profiles.find(item => item.id === id);
const source = JSON.parse(readFileSync(new URL(
  '../../docs/clinical/hormone-lifespan/evidence/patient-point/kulle2024-female-e2-th1-group-median.json',
  import.meta.url), 'utf8'));
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const context = (ageYears = 2, extra = {}) => ({
  analyte: 'e2', sex: 'female', ageYears, preterm: 'no',
  puberty: { kind: 'Th', stage: 1 }, measurement: { value: 20, unit: 'pmol/L', operator: '=' }, ...extra,
});
const evaluate = (ageYears, extra) => engine.evaluate(data, context(ageYears, extra));
const unavailable = reason => ({ status: 'unavailable', reason });

describe('E2 dziewczynek — jawna mediana grupy Th1 w wieku >1–<6 lat', () => {
  it('dodaje jeden profil i zachowuje dokładnie wszystkie 84 wcześniejsze profile oraz cały pozostały runtime', () => {
    expect(data.version).toBe('2026-10-26.1');
    expect(data.profiles).toHaveLength(85);
    expect(data.profiles.filter(item => item.id === id)).toHaveLength(1);
    // Exact E2 group profile already merged in audyt ab8ead6a (PR #752).
    expect(digest(profile)).toBe('75d725418e6f1a1e5481fd1c15478b39329356307810c09e525eb8c969ac0d8e');
    const previous = beforeInhibinPost47Bundle(beforeFemaleE2ChildhoodBundle(data));
    // Independently frozen from audyt fd5bf8a3 before this clinical addition.
    // The separately tested inhibin extension is restored by its archival
    // fixture; neither historical source values nor hashes are rebaselined.
    expect(previous.profiles).toHaveLength(84);
    expect(digest(previous.profiles)).toBe('e6c193639dad2c3d33bc67b69e6f3502c6a4e512865a599077610a994564b34a');
    expect(digest(previous)).toBe('805a064dd9953179e419597e8dbd56f507f136c29b60850d68aac7f3cafd7c3a');
    // The later LiLACS source-information card is separately frozen; keep
    // every preceding runtime value and the historical hash unchanged.
    const otherRuntime = Object.fromEntries(Object.entries(beforeE2PhaseSourceRuntime(runtime)).filter(([key]) =>
      key !== 'patientPointData' && key !== 'amhLilacsSourceData'));
    expect(digest(otherRuntime)).toBe('47fda226dc893be4f94578a53c75d91d8a0c98fece580b7c6f46525a77f2def0');
    expect(data).toEqual(JSON.parse(readFileSync(new URL(
      '../../docs/clinical/hormone-lifespan/population-reference-data.json', import.meta.url), 'utf8')));
  });

  it('zachowuje opublikowane P50 całej grupy B1 1–8 lat i N=213, bez tworzenia mediany dokładnego wieku lub normy', () => {
    expect(profile).toMatchObject({ id, analyte: 'e2', sex: 'female', unit: 'pmol/L',
      minAge: 1, minAgeExclusive: true, maxAge: 6, maxAgeExclusive: true,
      ordinaryOnly: true, requiredGonadalStage: 1, statistic: 'group-median', interpolation: 'constant',
      specimen: 'serum', compatibleSpecimenIds: ['serum', 'surowica'],
      ageGroup: { label: 'Th1, 1–8 lat', minAge: 1, maxAge: 8, n: 213,
        sourceMedian: 15, sourceUnit: 'pmol/L' } });
    expect(profile.points).toEqual([{ ageYears: 1, value: 15 }, { ageYears: 6, value: 15 }]);
    expect(profile.provenance.doi).toBe('10.1093/ejendo/lvae046');
    expect(source.groups).toHaveLength(1);
    expect(source.groups[0]).toMatchObject({ sourcePrintedLabel: 'B1 1-8 years', n: 213, median: 15,
      medianConfirmation: { table: 3, nativeHtmlP50: 15, cachedOfficialTableImageP50: 15 } });
    expect(profile.provenance).toMatchObject({
      sourceSha256: '2d62bd90380dc3b00bb35e110a476ede2cf7184a1459a033357857929205f54e',
      supplementSha256: 'ba73473e1e9a407d4024299b216497678ce6dd24af89de74a48a34388a684ac8',
      sourceQuantification: { lodPmolL: 4, lloqPmolL: 11, belowLimitHandling: null,
        individualBelowLimitCountsForSelectedGroup: null } });
    expect(source.unresolvedSourceFindings).toMatchObject({ table1: { total: 1753 },
      methodsAndTable2AnnualRows: { total: 1724 }, difference: { total: 29 },
      otherRowError: { label: 'B4', p90: 3374.8, p975: 606.5 } });
    expect(profile.referenceGroupLabel).toBe('Th1, 1–8 lat');
    expect(profile.patientNote).toBe('Nie jest medianą dokładnego wieku.');
    expect(profile).not.toHaveProperty('termOnly');
    expect(profile).not.toHaveProperty('minimumPatientValue');
    for (const key of ['referenceInterval', 'classification', 'sds', 'percentile', 'clinicalCutoff']) {
      expect(profile).not.toHaveProperty(key);
      expect(evaluate()).not.toHaveProperty(key);
    }
  });

  it('F2/Th1/E2 20 pokazuje rzeczywiste 20 wobec stałej mediany 15 bez dopasowania do wyniku', () => {
    for (const age of [1.000001, 1.5, 2, 3, 5, 5.999999]) {
      for (const value of [0, 1, 4, 11, 15, 20, 1000]) {
        expect(evaluate(age, { measurement: { value, unit: 'pmol/L' } })).toMatchObject({
          status: 'ready', value, referenceValue: 15, profile: { id },
        });
      }
    }
    const browser = loadBrowserScript('vilda_hormone_lifespan_reference.js');
    expect(browser.VildaHormoneLifespanReference.evaluate(runtime, context())).toEqual(evaluate());
    expect(engine.sampleProfile(profile, 20).every(point => point.value === 15)).toBe(true);
  });

  it('zachowuje źródła przy dokładnym 1 roku i od 6 lat oraz nie rozciąga nowej grupy do 8 lat', () => {
    expect(evaluate(1)).toMatchObject({ status: 'ready', referenceValue: 5.933,
      profile: { id: 'ljubicic2022-female-e2', termOnly: true } });
    expect(evaluate(6, { puberty: null })).toMatchObject({ status: 'ready',
      referenceValue: 1.257681951881138, profile: { id: 'madsen2022-female-e2-age-6-18' } });
    for (const age of [1, 6, 7, 8]) expect(engine.referenceAt(profile, age)).toBeNull();
    for (const age of [6, 7, 8]) {
      expect(evaluate(age).profile.id).toBe('madsen2022-female-e2-age-6-18');
    }
    expect(evaluate(2, { sex: 'male' })).toEqual(unavailable('unsupported-age'));
  });

  it('wymaga typowanej Th1, nie wieku, P1 lub niesprecyzowanego numeru Tannera', () => {
    for (const puberty of [null, undefined, {}, 1, '1', { stage: 1 },
      { kind: 'Th' }, { kind: 'Th', stage: '1' }, { kind: 'unspecified', stage: 1 }]) {
      expect(evaluate(2, { puberty })).toEqual(unavailable('missing-puberty-stage'));
    }
    for (const puberty of [{ kind: 'P', stage: 1 }, { kind: 'Ax', stage: 1 },
      { kind: 'G', stage: 1 }, ...[2, 3, 4, 5].map(stage => ({ kind: 'Th', stage }))]) {
      expect(evaluate(2, { puberty })).toEqual(unavailable('incompatible-puberty-stage'));
    }
  });

  it('kwalifikuje cały możliwy wiek, zachowując otwarte granice i rzeczywistą precyzję formularza', () => {
    for (const [age, upper] of [[2, 3], [5, 6], [5.9, 6]]) {
      expect(evaluate(age, { ageUpperYears: upper, ageUpperInclusive: false }))
        .toMatchObject({ status: 'ready', referenceValue: 15, profile: { id } });
    }
    for (const [age, upper] of [[1, 1 + 1 / 12], [.99, 1.01], [5, 6], [5.99, 6.01]]) {
      expect(evaluate(age, { ageUpperYears: upper, ageUpperInclusive: true }))
        .toEqual(unavailable('ambiguous-age'));
    }
    for (const [reported, expected] of [
      [{ years: 1, months: 0, precision: 'month' }, 'ambiguous-age'],
      [{ years: 1, months: 1, precision: 'month' }, 'ready'],
      [{ years: 2, precision: 'year' }, 'ready'],
      [{ years: 5, months: 11, precision: 'month' }, 'ready'],
    ]) {
      const age = ageEngine.resolveAge({ age: reported });
      expect(age.status).toBe('known');
      const result = evaluate(age.lowerYears, { ageUpperYears: age.upperYears,
        ageUpperInclusive: age.upperInclusive });
      if (expected === 'ready') expect(result).toMatchObject({ status: 'ready', referenceValue: 15, profile: { id } });
      else expect(result).toEqual(unavailable(expected));
    }
    for (const age of [NaN, null, -1]) expect(evaluate(age)).toEqual(unavailable('missing-age'));
  });

  it('używa surowiczego kontekstu źródła bez potwierdzania nieznanej metody lub materiału pacjentki', () => {
    for (const specimen of [undefined, null, '', 'unknown', 'serum', 'surowica', ' SERUM ']) {
      expect(evaluate(2, { specimen }).status).toBe('ready');
    }
    for (const specimen of ['plasma', 'lithium-heparin-plasma', 'saliva', 'urine']) {
      expect(evaluate(2, { specimen })).toEqual(unavailable('incompatible-specimen'));
    }
    for (const assayMethodId of [undefined, null, '', 'unknown', 'lc-ms/ms', 'lc-ms-ms', 'lcmsms', ' LC-MS/MS ']) {
      expect(evaluate(2, { assayMethodId }).status).toBe('ready');
    }
    for (const assayMethodId of ['immunoassay', 'roche-elecsys-estradiol-iii', 'immulite-2000-xpi']) {
      expect(evaluate(2, { assayMethodId })).toEqual(unavailable('incompatible-assay'));
    }
  });

  it('zachowuje dotychczasowe przeciwwskazania i jawny kontekst rozrodczy bez źródła zastępczego', () => {
    expect(evaluate(2, { contraindicated: true })).toEqual(unavailable('contraindicated'));
    for (const cyclePhase of ['pregnancy', 'pregnancy_t1', 'pregnancy_t2', 'pregnancy_t3', 'postmenopause']) {
      expect(evaluate(2, { cyclePhase })).toEqual(unavailable('incompatible-reproductive-context'));
    }
    for (const cyclePhase of [null, '', 'unknown', 'follicular', 'ovulation', 'luteal']) {
      expect(evaluate(2, { cyclePhase }).referenceValue).toBe(15);
    }
  });

  it('zachowuje konwersje i zero bez podłogi LLOQ oraz odrzuca nierówności bez imputacji', () => {
    expect(evaluate(2, { measurement: { value: 1, unit: 'pg/mL' } }))
      .toMatchObject({ status: 'ready', value: 3.671, referenceValue: 15 });
    expect(evaluate(2, { measurement: { value: 15 / 3.671, unit: 'pg/mL' } }).value).toBeCloseTo(15, 12);
    expect(evaluate(2, { measurement: { value: 0, unit: 'pmol/L' } }))
      .toMatchObject({ status: 'ready', value: 0, referenceValue: 15 });
    for (const operator of ['<', '<=', '≤', '>', '>=', '≥']) {
      expect(evaluate(2, { measurement: { value: 11, unit: 'pmol/L', operator } }))
        .toEqual(unavailable('censored-result'));
    }
    expect(evaluate(2, { measurement: { value: -1, unit: 'pmol/L' } })).toEqual(unavailable('invalid-value'));
    expect(evaluate(2, { measurement: { value: 15, unit: 'IU/L' } })).toEqual(unavailable('unsupported-unit'));
  });
});
