import { readFileSync } from 'node:fs';

// Preserve the existing historical hashes while applying the explicitly tested
// 2026-10-16 ordinary female LH/FSH extension. These are frozen HEAD profiles,
// not regenerated norms or a second implementation of the reference engine.
const priorProfiles = JSON.parse(readFileSync(new URL(
  '../fixtures/hormone-lifespan-prior-female-fsh-profiles.json', import.meta.url), 'utf8'));
const addedIds = new Set(['madsen2022-female-lh-age-6-16', 'madsen2022-female-fsh-age-6-16']);

export function priorFemaleGonadotropinBundle(data) {
  return { ...data, version: '2026-10-14.2', profiles: data.profiles.flatMap(profile => {
    if (addedIds.has(profile.id)) return [];
    if (profile.id === 'zec2012-female-fsh-age-4-8') return priorProfiles;
    return [profile];
  }) };
}

export function withoutFemaleGonadotropinReferencePolicy(runtime) {
  return Object.fromEntries(Object.entries(runtime).filter(([key]) =>
    key !== 'patientPointData' && key !== 'femaleGonadotropinReferencePolicy'));
}
