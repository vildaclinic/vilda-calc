import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { beforeAmhPregnancyPolicy, beforeFshCaliperBundle, beforeFshCaliperRuntime } from '../support/prior-female-gonadotropin-bundle.mjs';

const require = createRequire(import.meta.url);
const runtime = require('../../vilda_hormone_lifespan_data.js');
const engine = require('../../vilda_hormone_lifespan_reference.js');
const ageEngine = require('../../vilda_lab_puberty.js');
const data = runtime.patientPointData;
const id = 'madsen2022-female-e2-age-6-18';
const profile = data.profiles.find(item => item.id === id);
const read = name => JSON.parse(readFileSync(new URL(
  `../../docs/clinical/hormone-lifespan/${name}`, import.meta.url), 'utf8'));
const policy = read('female-estradiol-reference-policy.json');
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const evaluate = (ageYears = 12, extra = {}) => engine.evaluate(data, {
  analyte: 'e2', sex: 'female', ageYears,
  measurement: { value: 50, unit: 'pmol/L', operator: '=' }, ...extra
});
const unavailable = reason => ({ status: 'unavailable', reason });
// Independent re-read of official Supplemental Table 1 v1, LCMSMS hormones,
// AA3:AD15. Preserve the original exp(M)/1e6 values, not an RI midpoint,
// rounded display value or an interpolation sampled from the illustrative line.
const medians = [
  1.257681951881138, 2.334596749158609, 4.347915883102421,
  8.208451767006299, 15.701446074188619, 29.609571335302167,
  52.46318409704675, 83.43910795094158, 116.47597538264219,
  144.25402291999035, 163.40488572245636, 175.78271306105336,
  185.45583618764735
];

describe('Zwykły żeński E2 — źródłowa mediana wieku 6–18 Madsen', () => {
  it('dodaje tylko jeden profil i politykę, zachowując wszystkie 77 profili, jednostki i pozostały runtime', () => {
    expect(data.profiles).toHaveLength(81);
    expect(data.version).toBe('2026-10-18.2');
    const prior = { ...data, version: '2026-10-16.1',
      profiles: beforeFshCaliperBundle(data).profiles.filter(item => item.id !== id).map(beforeAmhPregnancyPolicy) };
    expect(prior.profiles).toHaveLength(77);
    // Frozen full-bundle hashes from audyt 96288b49 before the addition.
    expect(digest(prior.profiles)).toBe('395270be85e644ccd68ff388191fe01fea7edbef2501f15e83098cd6f4410272');
    expect(digest(prior)).toBe('0396d69dae9c6f311632dc0c4a52a47ce1a844e7befb3d95a0fc6f9329886b91');
    const otherRuntime = Object.fromEntries(Object.entries(beforeFshCaliperRuntime(runtime)).filter(([key]) =>
      key !== 'patientPointData' && key !== 'femaleEstradiolReferencePolicy'));
    expect(digest(otherRuntime)).toBe('d224cf4c6d3832723767f879241810550ced917b0313ac6ce0b8c0fd86377231');
    expect(data).toEqual(read('population-reference-data.json'));
    expect(runtime.femaleEstradiolReferencePolicy).toEqual(policy);
    expect(policy).toMatchObject({ version: '2026-10-17.1', kind: 'educational-source-selection',
      ordinaryOnly: true, id, sex: 'female', analyte: 'e2', unit: 'pmol/L' });
  });

  it('odtwarza wszystkie 13 median oryginalnych komórek i zachowuje osobne dwie granice oznaczalności', () => {
    expect(profile).toMatchObject({ id, minAge: 6, maxAge: 18, maxAgeExclusive: false,
      ordinaryOnly: true, sex: 'female', analyte: 'e2', unit: 'pmol/L',
      statistic: 'median', interpolation: 'pchip', approximate: false,
      specimen: 'serum', compatibleSpecimenIds: ['serum', 'surowica'],
      method: 'LC-MS/MS; Bergen Growth Study 2 ultrasensitive assay and Fit Futures assay',
      provenance: { doi: '10.1210/clinem/dgac155', sourceWorksheet: 'LCMSMS hormones',
        sha256: '45cd1b63284c9f53a5936abee7ab8d8e6fce13a19025d4e2cbed0e5b3468897e',
        methodDetails: { BGS2_LLOQ_pmol_L: .58, FitFutures_LLOQ_pmol_L: 13 },
        sourceRouting: { version: policy.version } } });
    expect(profile.points).toHaveLength(13);
    expect(profile.provenance.sourceCells).toEqual(medians.map((_, i) =>
      `AA${i + 3},AB${i + 3},AC${i + 3},AD${i + 3}`));
    expect(profile.patientNote).toBe('Mediana dla wieku · fazy cyklu analizowane łącznie.');
    expect(profile).not.toHaveProperty('requiredGonadalStage');
    expect(profile).not.toHaveProperty('termOnly');
    expect(profile.provenance).not.toHaveProperty('lowerLimitOfQuantification');
    for (const [index, median] of medians.entries()) {
      const age = index + 6;
      expect(profile.points[index]).toEqual({ ageYears: age, value: median });
      expect(engine.referenceAt(profile, age)).toBe(median);
      expect(evaluate(age)).toMatchObject({ status: 'ready', referenceValue: median, profile: { id } });
    }
  });

  it('w wieku 12 lat pokazuje rzeczywiste 50 wobec mediany 52,463 bez nowej normy lub klasyfikacji', () => {
    expect(evaluate()).toMatchObject({ status: 'ready', value: 50,
      referenceValue: 52.46318409704675, profile: { id } });
    for (const key of ['classification', 'percentile', 'sds', 'referenceInterval', 'tannerStage', 'clinicalCutoff']) {
      expect(evaluate()).not.toHaveProperty(key);
      expect(profile).not.toHaveProperty(key);
    }
  });

  it('nie wymaga Th ani fazy cyklu i nie przełącza mediany po ich uzupełnieniu', () => {
    for (const puberty of [null, {}, { kind: 'Th', stage: 1 }, { kind: 'Th', stage: 2 },
      { kind: 'Th', stage: 5 }, { kind: 'P', stage: 1 }]) {
      for (const cyclePhase of [null, 'unknown', 'follicular', 'ovulatory', 'luteal']) {
        expect(evaluate(12, { puberty, cyclePhase })).toMatchObject({ status: 'ready',
          referenceValue: 52.46318409704675, profile: { id } });
      }
    }
    expect(evaluate(12, { preterm: 'yes' }).status).toBe('ready');
  });

  it('obejmuje cały możliwy wiek i dokładny węzeł 18, bez ekstrapolacji lub wymyślonej precyzji', () => {
    for (const age of [6, 6.001, 12, 17.999999, 18]) {
      expect(evaluate(age).status).toBe('ready');
    }
    expect(evaluate(17, { ageUpperYears: 18, ageUpperInclusive: false }).status).toBe('ready');
    expect(evaluate(17, { ageUpperYears: 18, ageUpperInclusive: true }).status).toBe('ready');
    for (const age of [1.001, 3, 5.999999, 18.000001, 19, 25, 50]) {
      expect(evaluate(age)).toEqual(unavailable('unsupported-age'));
      expect(engine.referenceAt(profile, age)).toBeNull();
    }
    for (const [ageYears, ageUpperYears] of [[5.99, 6.01], [17.99, 18.01], [18, 18 + 1 / 12]]) {
      expect(evaluate(ageYears, { ageUpperYears, ageUpperInclusive: false }).status).toBe('unavailable');
    }
    const age = ageEngine.resolveAge({ age: { years: 18, months: 0, precision: 'month' } });
    expect(age.status).toBe('known');
    expect(evaluate(age.lowerYears, { ageUpperYears: age.upperYears,
      ageUpperInclusive: age.upperInclusive })).toEqual(unavailable('ambiguous-age'));
    expect(evaluate(undefined, { ageYears: null })).toEqual(unavailable('missing-age'));
    expect(evaluate(12, { sex: null })).toEqual(unavailable('unsupported-sex'));
    expect(evaluate(12, { sex: 'male' })).toEqual(unavailable('unsupported-age'));
  });

  it('interpoluje wyłącznie pomiędzy wszystkimi rocznymi węzłami bez dodatkowych ekstremów', () => {
    for (let i = 0; i < medians.length - 1; i++) {
      for (const part of [.125, .25, .5, .75, .875]) {
        const result = evaluate(6 + i + part);
        expect(result.status).toBe('ready');
        expect(result.referenceValue).toBeGreaterThan(medians[i]);
        expect(result.referenceValue).toBeLessThan(medians[i + 1]);
      }
    }
  });

  it('zachowuje źródłową metodę, materiał i znane wyłączenia bez zastępczego odniesienia', () => {
    for (const assayMethodId of [undefined, 'unknown', 'lc-ms/ms', 'lc-ms-ms', 'lcmsms']) {
      expect(evaluate(12, { assayMethodId }).status).toBe('ready');
    }
    for (const assayMethodId of ['immunoassay', 'roche-elecsys-estradiol-iii', 'immulite-2000-xpi']) {
      expect(evaluate(12, { assayMethodId })).toEqual(unavailable('incompatible-assay'));
    }
    for (const specimen of [undefined, 'unknown', 'serum', 'surowica']) {
      expect(evaluate(12, { specimen }).status).toBe('ready');
    }
    for (const specimen of ['plasma', 'lithium-heparin-plasma', 'saliva']) {
      expect(evaluate(12, { specimen })).toEqual(unavailable('incompatible-specimen'));
    }
    expect(evaluate(12, { contraindicated: true })).toEqual(unavailable('contraindicated'));
    expect(profile.excludedCyclePhases).toEqual(['pregnancy', 'pregnancy_t1', 'pregnancy_t2',
      'pregnancy_t3', 'postmenopause']);
    for (const cyclePhase of profile.excludedCyclePhases) {
      expect(evaluate(12, { cyclePhase })).toEqual(unavailable('incompatible-reproductive-context'));
    }
  });

  it('zachowuje jednostki, zero i niski wynik bez globalnej podłogi 13 ani imputacji nierówności', () => {
    for (const age of [6, 12, 18]) {
      for (const value of [0, .1, 1, 50, 1000, 1e6]) {
        const result = evaluate(age, { measurement: { value, unit: 'pmol/L' } });
        expect(result).toMatchObject({ status: 'ready', value, profile: { id } });
        expect(result.referenceValue).toBe(medians[age - 6]);
        expect(evaluate(age, { measurement: { value: value / 3.671, unit: 'pg/mL' } }).value)
          .toBeCloseTo(value, 9);
      }
    }
    expect(evaluate(6, { measurement: { value: 1, unit: 'pmol/L' } }).referenceValue).toBeLessThan(13);
    for (const operator of ['<', '<=', '>', '>=']) {
      expect(evaluate(6, { measurement: { value: 13, unit: 'pmol/L', operator } }))
        .toEqual(unavailable('censored-result'));
    }
    expect(evaluate(12, { measurement: { value: -1, unit: 'pmol/L' } })).toEqual(unavailable('invalid-value'));
    expect(evaluate(12, { measurement: { value: 50, unit: 'IU/L' } })).toEqual(unavailable('unsupported-unit'));
  });

  it('zachowuje dotychczasową medianę i warunek donoszenia niemowlęcia', () => {
    expect(evaluate(.25, { preterm: 'no' })).toMatchObject({ status: 'ready', referenceValue: 21.616,
      profile: { id: 'ljubicic2022-female-e2', minAge: .02, maxAge: 1, termOnly: true } });
    expect(evaluate(.25, { preterm: 'yes' })).toEqual(unavailable('preterm-context'));
    expect(evaluate(.25)).toEqual(unavailable('preterm-context'));
    expect(evaluate(.25, { preterm: 'no', contraindicated: true })).toEqual(unavailable('contraindicated'));
  });
});
