import { readFileSync } from 'node:fs';

// Preserve the existing historical hashes while applying the explicitly tested
// 2026-10-16 ordinary female LH/FSH, 2026-10-17 E2 and the AMH pregnancy policy. These are frozen HEAD profiles,
// not regenerated norms or a second implementation of the reference engine.
const priorProfiles = JSON.parse(readFileSync(new URL(
  '../fixtures/hormone-lifespan-prior-female-fsh-profiles.json', import.meta.url), 'utf8'));
const addedIds = new Set(['madsen2022-female-lh-age-6-16', 'madsen2022-female-fsh-age-6-16',
  'madsen2022-female-e2-age-6-18']);
const fshCaliperIds = new Set(['wilson2023-male-fsh-age-16-18', 'wilson2023-female-fsh-age-16-19']);

// Reconstruct only the two explicitly superseded ordinary FSH endpoints.
// The original male key was absent; the female key was explicitly false.
// Never regenerate source points or erase other later clinical changes here.
export function beforeFshCaliperProfile(profile) {
  if (profile.id === 'madsen2022-male-fsh') {
    const { maxAgeExclusive: _exclusive, ...prior } = profile;
    return prior;
  }
  if (profile.id === 'madsen2022-female-fsh-age-6-16') return { ...profile, maxAgeExclusive: false };
  return profile;
}

export function beforeFshCaliperBundle(data) {
  return { ...data, version: '2026-10-17.2', profiles: data.profiles
    .filter(profile => !fshCaliperIds.has(profile.id)).map(beforeFshCaliperProfile) };
}

export function beforeFshCaliperRuntime(runtime) {
  const { fshCaliperReferencePolicy: _caliper, ...prior } = runtime;
  const { retainSourceEndpointProfileIds: _endpoints, ...comparison } = prior.gonadotropinComparisonPolicy;
  return { ...prior, gonadotropinComparisonPolicy: { ...comparison, version: '2026-10-12.1' } };
}

export function beforeAmhPregnancyPolicy(profile) {
  if (!profile.id.startsWith('jopling2018-female-amh-')) return profile;
  const { excludedCyclePhases: _pregnancy, ...prior } = profile;
  const { reproductiveContextPolicy: _policy, ...provenance } = prior.provenance;
  return { ...prior, provenance: { ...provenance, routingVersion: '2026-10-13.1' } };
}

export function priorFemaleGonadotropinBundle(data) {
  return { ...data, version: '2026-10-14.2', profiles: beforeFshCaliperBundle(data).profiles.flatMap(profile => {
    if (addedIds.has(profile.id)) return [];
    if (profile.id === 'zec2012-female-fsh-age-4-8') return priorProfiles;
    return [beforeAmhPregnancyPolicy(profile)];
  }) };
}

export function withoutFemaleGonadotropinReferencePolicy(runtime) {
  return Object.fromEntries(Object.entries(beforeFshCaliperRuntime(runtime)).filter(([key]) =>
    key !== 'patientPointData' && key !== 'femaleGonadotropinReferencePolicy' &&
    key !== 'femaleEstradiolReferencePolicy' && key !== 'fshCaliperReferencePolicy'));
}
