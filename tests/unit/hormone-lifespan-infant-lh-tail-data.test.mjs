import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { beforeInfantLhTailBundle, beforeInfantLhTailRuntime, beforeInfantTtResultOnlyRuntime } from '../support/prior-female-gonadotropin-bundle.mjs';

const require = createRequire(import.meta.url);
const runtime = require('../../vilda_hormone_lifespan_data.js');
const engine = require('../../vilda_hormone_lifespan_reference.js');
const read = file => JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'));
const policy = read('../../docs/clinical/hormone-lifespan/male-lh-infant-tail-policy.json');
const archiveUrl = new URL('../../docs/clinical/hormone-lifespan/evidence/patient-point/busch2022-figure3-vector-medians.json', import.meta.url);
const archiveBytes = readFileSync(archiveUrl);
const archive = JSON.parse(archiveBytes);
const priorProfile = read('../fixtures/hormone-lifespan-prior-male-infant-lh-profile.json');
const data = runtime.patientPointData;
const profile = data.profiles.find(item => item.id === 'busch2022-male-lh');
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

describe('LH niemowląt — jawna kwalifikacja istniejących liczb i zachowanie pozostałych źródeł', () => {
  it('pakuje czytelną politykę i nową wersję danych, z tym samym eksportem CommonJS i przeglądarkowym', () => {
    expect(runtime.infantLhTailPolicy).toEqual(policy);
    expect(profile.numericReferencePolicy).toEqual(policy.numericReference);
    expect(data.version).toBe('2026-10-26.1');
    expect(data).toEqual(read('../../docs/clinical/hormone-lifespan/population-reference-data.json'));
    expect(loadBrowserScript('vilda_hormone_lifespan_data.js').VildaHormoneLifespanData).toEqual(runtime);
    expect(policy).toMatchObject({ version: '2026-10-26.1', kind: 'educational-infant-lh-tail-display',
      profileId: 'busch2022-male-lh', notClinicalReference: true, ordinaryOnly: true });
    expect(policy.source.sourceAssayLimit).toEqual({ kind: 'LOD', value: .05, unit: 'IU/L', notPatientAssayLimit: true });
  });

  it('zachowuje cały historyczny ekstrakt i wszystkie 360 stężeń — zmienia dokładnie 83 flagi dni 244–326', () => {
    expect(createHash('sha256').update(archiveBytes).digest('hex'))
      .toBe('b320f037978c1fa2bf2fc55dd4e3aa0708dea55f9b1cb69302c127e13352d795');
    expect(archive.hormones.lh.daily).toHaveLength(394);
    expect(profile.points).toHaveLength(360);
    expect(profile.points.map(({ ageYears, value }) => ({ ageYears, value })))
      .toEqual(priorProfile.points.map(({ ageYears, value }) => ({ ageYears, value })));
    const changed = profile.points.flatMap((point, index) => point.eligible === priorProfile.points[index].eligible
      ? [] : [{ day: archive.hormones.lh.daily[index][0], before: priorProfile.points[index].eligible, after: point.eligible }]);
    expect(changed).toEqual(Array.from({ length: 83 }, (_, index) => ({ day: index + 244, before: false, after: true })));
    const { points: _points, numericReferencePolicy: _newPolicy, ...metadata } = profile;
    const { points: _priorPoints, ...priorMetadata } = priorProfile;
    expect(metadata).toEqual(priorMetadata);
    expect(archive.hormones.lh.daily.find(row => row[0] === 244)[4]).toBe(false);
    expect(profile.points.find(point => point.ageYears === 244 / 365.25).eligible).toBe(true);
  });

  it('zachowuje dosłownie 84 inne profile i wszystkie 40 wcześniejszych pól poza pakietem punktów', () => {
    expect(data.profiles).toHaveLength(85);
    // Independently frozen from audyt c3fd6882; no new baseline is generated.
    expect(digest(data.profiles.filter(item => item.id !== profile.id)))
      .toBe('684c1e9d27b8c52d3f8d4e7ecf402712d8b08dddf953016d6297b83c00242ffc');
    const earlier = Object.fromEntries(Object.entries(beforeInfantTtResultOnlyRuntime(runtime))
      .filter(([key]) => key !== 'patientPointData' && key !== 'infantLhTailPolicy'));
    expect(Object.keys(earlier)).toHaveLength(40);
    expect(digest(earlier)).toBe('dadcccd107f7a0908566b9f6595c024d653b5cb074aae37a1fb7c87f1417b4df');
    expect(digest(priorProfile)).toBe('53676fe91c0f13dc0074b32a1c0882ab1d16d6fcc9d5dd5e20f9049c35747e10');
    expect(digest(beforeInfantLhTailBundle(data)))
      .toBe('28730dd407d52ef41afe8f2f5af5ab56ce541398e1c25d4dce5be5324a5ddcc9');
    const { childhoodLhResultOnlyPolicies: _childhood, ...beforeChildhood } = beforeInfantLhTailRuntime(runtime);
    expect(digest(beforeChildhood)).toBe('10c7276f91bcd0a12464a21769ea6bd434dd4a986688b6f34766052604f46784');
  });

  it('rzeczywista funkcja źródłowa zachowuje odczyty i nie podnosi późnej mediany do LOD lub LOD/2', () => {
    for (const [day, value] of [[243, .173137], [244, .170118], [300, .069879],
      [326, .050415], [327, .049857], [365, .035144]]) {
      expect(engine.referenceAt(profile, day / 365.25)).toBe(value);
    }
    expect(engine.referenceAt(profile, 365.25 / 365.25)).toBeNull();
    expect(profile.points.find(point => point.ageYears === 327 / 365.25).eligible).toBe(false);
    expect(profile.points.find(point => point.ageYears === 365 / 365.25).eligible).toBe(false);
  });

  it('dane rozdzielają przybliżone odniesienie i sam wynik bez tworzenia normy lub sztucznej mediany', () => {
    const numeric = policy.numericReference;
    expect(numeric).toMatchObject({ minAge: 243 / 365.25, minAgeExclusive: true,
      maxAge: 326 / 365.25, maxAgeExclusive: false, fullAgeIntervalRequired: true,
      currentPatientOnly: true, contextAvailabilityKey: 'infantLhContextAvailable', ordinaryOnly: true,
      allowedViews: ['life', 'mini'], label: 'Przybliżona mediana modelu Busch 2022', significantDigits: 2 });
    const resultOnly = policy.resultOnlyPolicy;
    expect(resultOnly).toMatchObject({ kind: 'educational-result-only', ordinaryOnly: true,
      sourceProfileId: profile.id, minAge: 326 / 365.25, minAgeExclusive: true, maxAge: 1,
      maxAgeExclusive: true, fullAgeIntervalRequired: true, currentPatientOnly: true,
      contextAvailabilityKey: 'infantLhContextAvailable', allowedViews: ['life', 'mini'] });
    for (const key of ['points', 'referenceValue', 'median', 'statistic', 'range', 'classification', 'ratio']) {
      expect(resultOnly).not.toHaveProperty(key);
    }
    expect(data).not.toHaveProperty('infantLhTailPolicy');
    expect(policy.source.participantsPostnatal).toBe(119);
    expect(policy.source.notAnalyteOrAgeSpecificCounts).toBe(true);
  });
});
