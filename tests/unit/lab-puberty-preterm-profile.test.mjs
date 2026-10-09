import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const require = createRequire(import.meta.url);
const data = require('../../vilda_lab_puberty_data.js');
const engine = require('../../vilda_lab_puberty.js');
const preferences = require('../../vilda_lab_profile_preferences.js');
const snapshot = require('../../vilda_lab_snapshot.js');
const candidateId = (analyte) => `greaves-preterm-${analyte}-candidate`;
const profile = (id) => data.profiles.find((entry) => entry.id === id);

function assay(id) {
  const selected = profile(id);
  return { profileId: id, profileVersion: selected.version, methodId: selected.method.id, confirmation: 'configured' };
}

function input(analyte = 'lh', overrides = {}) {
  return {
    analyte, value: '2', unit: 'IU/L', sex: 'M',
    contextBasis: 'current-patient', age: { years: 0, months: 0, precision: 'month' },
    specimen: 'serum', measurementKind: 'basal',
    assay: assay(candidateId(analyte)), preterm: 'yes', gestationalAgeWeeks: 28,
    treatment: { context: 'none', gnrha: 'no', sexSteroids: 'no' },
    ...overrides,
  };
}

function expectNoReference(result) {
  expect(result.biochemical).toMatchObject({
    status: 'unavailable', primary: null,
    byAge: { status: 'unavailable', range: null },
    byStage: { status: 'unavailable', range: null },
  });
  expect(result).not.toHaveProperty('referencePreview');
}

describe('Greaves 2015 — aktywny profil wymaga jawnej kwalifikacji wieku', () => {
  it.each([
    ['lh', 'M', 0.1, 9.2, 111], ['lh', 'F', 0.2, 133.9, 108],
    ['fsh', 'M', 0.2, 3.6, 111], ['fsh', 'F', 2.6, 181.1, 108],
  ])('zachowuje raportowany przedział %s/%s wraz z polityką kwalifikacji', (analyte, sex, lower, upper, sampleSize) => {
    const candidate = profile(candidateId(analyte));
    expect(candidate).toMatchObject({
      active: true, analyte, sourceId: 'greaves-preterm-2015', version: '2026-10-09.3',
      method: { id: `roche-cobas-e601-${analyte}-greaves-2015` }, material: 'serum', unit: 'IU/L',
    });
    expect(candidate.scope).toMatchObject({ age: { axis: 'postmenstrualDays' }, policyId: 'greaves-preterm-applicability', policyVersion: '2026-10-09.3' });
    expect(candidate.rows.find((row) => row.sex === sex).range).toMatchObject({ lower: { operator: '>=', value: lower }, upper: { operator: '<=', value: upper } });
    expect(candidate.reportedIntervals.filter((interval) => interval.sex === sex)).toEqual([
      expect.objectContaining({ sex, lower, upper, sampleSize }),
    ]);
    expect(data.sources[candidate.sourceId]).toMatchObject({ pmid: '25562509', doi: '10.1210/jc.2014-3681' });
  });

  it('wiąże zweryfikowane przedziały z tabelą 4 pełnego artykułu i konkretnym PDF, nie posterem', () => {
    const source = data.sources['greaves-preterm-2015'];
    expect(source).toMatchObject({
      evidenceSha256: '96c1875105cab6dcc301a7494efa47f3a9bf39161dbd3adcf06847c1fa2bc251',
      intervalEvidence: { kind: 'journal-table', page: 1102 },
      methodEvidence: { assayIdentityResolved: true, transferableToCurrentMayoProfiles: false },
    });
    expect(source.readScope).toMatch(/full/i);
    expect(source.readScope).toMatch(/1098/);
    expect(source.readScope).toMatch(/Table 4/);
    expect(source.recruitment.postnatalAgeDays).toBeNull();
    // The journal table supersedes three numbers previously transcribed from
    // the author poster; do not silently keep its precision or platform ID.
    expect(profile(candidateId('fsh')).reportedIntervals.find((row) => row.sex === 'M').lower).not.toBe(0.16);
    expect(profile(candidateId('fsh')).reportedIntervals.find((row) => row.sex === 'F').upper).not.toBe(181);
    expect(profile(candidateId('lh')).reportedIntervals.find((row) => row.sex === 'F').upper).not.toBe(134);
  });

  const contexts = ['lh', 'fsh'].flatMap((analyte) => ['yes', 'no', 'unknown'].flatMap((preterm) =>
    ['basal', 'unknown'].map((measurementKind) => ({ analyte, preterm, measurementKind }))));

  it.each(contexts)('brak PNA nie daje RI ani podglądu: $analyte, wcześniactwo $preterm, badanie $measurementKind', ({ analyte, preterm, measurementKind }) => {
    const result = engine.evaluate(input(analyte, {
      preterm, gestationalAgeWeeks: null, measurementKind,
      treatment: measurementKind === 'basal'
        ? { context: 'none', gnrha: 'no', sexSteroids: 'no' }
        : { context: 'unknown', gnrha: 'unknown', sexSteroids: 'unknown' },
    }), data);
    expectNoReference(result);
    expect(result.biochemical.reasonCodes).toContain('neonatal_postnatal_age_missing');
    expect(result.provenance.profileId).toBe(candidateId(analyte));
    expect(result.measurement).toMatchObject({ status: 'valid', value: 2, unit: 'IU/L' });
    expect(result.clinical.code).toBe('infant_context');
  });

  it.each(['lh', 'fsh'])('same daty, wiek skorygowany ani starszy pacjent nie zastępują kwalifikacji %s', (analyte) => {
    for (const ageContext of [
      { birthDateISO: '2026-10-09', sampleDateISO: '2026-10-09' },
      { birthDateISO: '2026-08-27', sampleDateISO: '2026-10-09' },
      { age: { years: 0, months: 3, precision: 'month' }, correctedAge: { years: 0, months: 1, precision: 'month' } },
      { age: { years: 2, months: 9, precision: 'month' } },
    ]) {
      const result = engine.evaluate(input(analyte, { ...ageContext, preterm: 'no', gestationalAgeWeeks: null }), data);
      expectNoReference(result);
      expect(result.biochemical.reasonCodes).toContain('neonatal_gestational_age_missing');
    }
  });

  it.each(['lh', 'fsh'])('sam opis wieku z dat bez jawnego przedziału dni nie wystarcza dla %s', (analyte) => {
    for (const birthDateISO of ['2026-09-18', '2026-08-14']) {
      // Synthetic PNA 21 days and PNA 56 days (GA 28 weeks -> PMA 36 weeks).
      // Calendar dates without explicit conservative completed-day intervals
      // do not silently establish the new neonatal eligibility contract.
      const result = engine.evaluate(input(analyte, {
        contextBasis: 'sample', age: null,
        birthDateISO, sampleDateISO: '2026-10-09', gestationalAgeWeeks: 28,
      }), data);
      expectNoReference(result);
      expect(result.ageAtSample.status).toBe('known');
      expect(result.biochemical.reasonCodes).toContain('neonatal_postnatal_age_missing');
    }
  });

  it.each(['lh', 'fsh'])('zapisuje aktywny profil %s, lecz nie odtwarza starej wersji kandydata', (analyte) => {
    const configured = preferences.configure(null, analyte, candidateId(analyte), data);
    expect(configured.profiles[analyte].profileVersion).toBe('2026-10-09.3');
    const selected = profile(candidateId(analyte));
    const injected = { schemaVersion: 1, profiles: { [analyte]: {
      profileId: selected.id, profileVersion: '2026-10-09.2', methodId: selected.method.id, material: selected.material,
    } } };
    expect(preferences.normalize(injected, data).profiles[analyte]).toBeNull();
    expect(preferences.resolve(injected, analyte, data)).toBeNull();
  });

  it.each(['lh', 'fsh'])('dodanie kandydata %s nie pozwala użyć normy Mayo u wcześniaka', (analyte) => {
    for (const measurementKind of ['basal', 'unknown']) {
      const result = engine.evaluate(input(analyte, { assay: assay(`mayo-${analyte}-pediatric`), measurementKind }), data);
      expectNoReference(result);
      expect(result.biochemical.reasonCodes).toContain('preterm_reference_not_established');
      expect(result.provenance.profileId).toBe(`mayo-${analyte}-pediatric`);
      expect(result.provenance.sourceIds).not.toContain('greaves-preterm-2015');
    }
  });
});

function quickInput() {
  return input('lh', {
    age: { years: 2, months: 9, precision: 'month' }, preterm: 'unknown', gestationalAgeWeeks: null,
    assay: assay('mayo-lh-pediatric'), measurementKind: 'unknown',
    treatment: { context: 'unknown', gnrha: 'unknown', sexSteroids: 'unknown' },
    puberty: { kind: 'G', stage: 3, appliesToCurrentContext: true, source: 'fictional-patient-record' },
  });
}

describe('Greaves 2015 — zgodność dotychczasowych ocen i historii', () => {
  it('M2 lata 9 miesięcy/G3/LH2 zachowuje oba porównania i ostrzeżenie rozwoju', () => {
    const referenceWithoutCandidates = structuredClone(data);
    referenceWithoutCandidates.profiles = referenceWithoutCandidates.profiles.filter((entry) => !entry.id.startsWith('greaves-preterm-'));
    delete referenceWithoutCandidates.sources['greaves-preterm-2015'];
    const result = engine.evaluate(quickInput(), data);
    expect(result).toEqual(engine.evaluate(quickInput(), referenceWithoutCandidates));
    expect(result.referencePreview).toMatchObject({
      byAge: { status: 'above', range: { id: 'lh-m-age1-8', bounds: { upper: { operator: '<=', value: 0.5 } } } },
      byStage: { status: 'within', range: { id: 'lh-m-g3', bounds: { lower: { operator: '>=', value: 0.09 }, upper: { operator: '<=', value: 4.2 } } } },
    });
    expect(result.clinical.code).toBe('early_development');
    expect(result.provenance.sourceIds).not.toContain('greaves-preterm-2015');
  });

  it('stary snapshot zachowuje utrwaloną wersję i zakresy bez odczytu obecnego silnika lub danych', () => {
    const oldData = structuredClone(data);
    oldData.dataVersion = '2026-10-04.1';
    oldData.profiles = oldData.profiles.filter((entry) => !entry.id.startsWith('greaves-preterm-'));
    delete oldData.sources['greaves-preterm-2015'];
    const historical = snapshot.create(engine.evaluate(quickInput(), oldData));
    expect(historical.status).toBe('recorded');
    const browser = {};
    for (const name of ['VildaLabPuberty', 'VildaLabPubertyData']) {
      Object.defineProperty(browser, name, { get() { throw new Error('Historical reading must not evaluate current data'); } });
    }
    loadBrowserScript('vilda_lab_snapshot.js', browser);
    const read = browser.VildaLabSnapshot.normalize(JSON.parse(JSON.stringify(historical)));
    expect(read).toEqual(historical);
    expect(read.evaluation.dataVersion).toBe('2026-10-04.1');
    expect(read.evaluation.referencePreview.byAge.range.dataVersion).toBe('2026-10-04.1');
    expect(read.evaluation.provenance.profileVersion).toBe('2026-10-03.1');
  });
});
