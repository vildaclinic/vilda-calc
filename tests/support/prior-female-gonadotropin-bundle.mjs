import { readFileSync } from 'node:fs';

// Preserve the existing historical hashes while applying the explicitly tested
// 2026-10-16 ordinary female LH/FSH, 2026-10-17 E2 and the AMH pregnancy policy. These are frozen HEAD profiles,
// not regenerated norms or a second implementation of the reference engine.
const priorProfiles = JSON.parse(readFileSync(new URL(
  '../fixtures/hormone-lifespan-prior-female-fsh-profiles.json', import.meta.url), 'utf8'));
const addedIds = new Set(['madsen2022-female-lh-age-6-16', 'madsen2022-female-fsh-age-6-16',
  'madsen2022-female-e2-age-6-18']);
const fshCaliperIds = new Set(['wilson2023-male-fsh-age-16-18', 'wilson2023-female-fsh-age-16-19']);

// Freeze precisely the ordinary female inhibin B profile from 3b6a5302 before
// its 2026-10-21 extension. This is archival test data, never a runtime source.
// Preserve the earlier ID, metadata and PCHIP knots for every historical hash.
const priorInhibinProfile = JSON.parse(readFileSync(new URL(
  '../fixtures/hormone-lifespan-prior-female-inhibin-profile.json', import.meta.url), 'utf8'));
export function beforeInhibinPost47Bundle(data) {
  return { ...data, version: '2026-10-21.1', profiles: data.profiles.map(profile =>
    profile.id === 'borelli2025-female-inhb-age-5p6-47p75' ? priorInhibinProfile : profile) };
}

// The 2026-10-22 educational E2 addition has one explicitly typed Th1 group.
// Removing precisely this new profile restores the complete preceding bundle;
// no earlier source data or frozen hash expectation is regenerated.
export function beforeFemaleE2ChildhoodBundle(data) {
  return { ...data, version: '2026-10-21.1', profiles: data.profiles
    .filter(profile => profile.id !== 'kulle2024-female-e2-th1-age-over1-under6') };
}

// The 2026-10-21 addition is exactly two approximate testosterone group
// medians. Preserve every one of the 82 earlier profiles and their historical
// hashes by removing only these IDs, never by regenerating prior source data.
const testosteroneBoysIds = new Set([
  'kushnir2010-male-t-1-2-group', 'kushnir2010-male-t-2-3-group'
]);
export function beforeTestosteroneBoysBundle(data) {
  return { ...data, version: '2026-10-18.3', profiles: beforeInhibinPost47Bundle(beforeFemaleE2ChildhoodBundle(data)).profiles
    .filter(profile => !testosteroneBoysIds.has(profile.id)) };
}

// Isolate the later, ordinary-only male LH reconstruction without changing
// the earlier AMH/FSH evidence or the frozen historical hash expectations.
export function beforeMaleLhCaliperBundle(data) {
  return { ...data, version: '2026-10-18.2', profiles: beforeTestosteroneBoysBundle(data).profiles
    .filter(profile => profile.id !== 'wilson2023-male-lh-age-over16-under18') };
}

// INSL3 age reading adds exactly two independent source-information blocks.
// Remove only those blocks to preserve all earlier runtime data and hashes.
export function beforeInsl3AgeSourceRuntime(runtime) {
  const { insl3AgeSourceData: _insl3Data, insl3AgeSourcePolicy: _insl3Policy, ...prior } = runtime;
  return prior;
}

// E2 D3 adds exactly one source block. Remove only that later addition when
// checking earlier bundles; every existing field and frozen hash stays intact.
export function beforeE2D3Runtime(runtime) {
  const { e2D3Data: _e2D3, ...prior } = beforeInsl3AgeSourceRuntime(runtime);
  return prior;
}

// The later D3 block is separate from every previously frozen runtime bundle.
// Removing precisely that addition preserves all earlier evidence and hashes.
export function beforeFshD3Runtime(runtime) {
  const { fshD3Data: _fshD3, ...prior } = beforeE2D3Runtime(runtime);
  return prior;
}

// The FSH source card and its cycle-display policy add exactly two separate
// runtime blocks. Remove only those additions when checking preceding eras;
// never rewrite earlier data, versions, source knots or hash expectations.
export function beforeFshSourceRuntime(runtime) {
  const { fshSourceData: _fshSourceInfo, fshCycleDisplayPolicy: _fshCycleDisplay, ...prior } = beforeFshD3Runtime(runtime);
  return prior;
}

// The 2026-10-22 E2 phase card adds source information outside the ordinary
// profiles. Restore the preceding runtime by removing exactly its new block;
// preserve every earlier value and every frozen historical hash expectation.
export function beforeE2PhaseSourceRuntime(runtime) {
  const { e2PhaseSourceData: _e2PhaseSourceInfo, ...prior } = beforeFshSourceRuntime(runtime);
  return prior;
}

export function beforeMaleLhCaliperRuntime(runtime) {
  // Result-only display permissions add no central values. Exclude precisely
  // this later, separately frozen bundle when reproducing historical hashes.
  const { maleLhCaliperReferencePolicy: _maleLh, resultOnlyPolicies: _resultOnly,
    amhLilacsSourceData: _lilacsSourceInfo, ...prior } = beforeE2PhaseSourceRuntime(runtime);
  return prior;
}

// Isolate the later, ordinary-only young-adult AMH addition. This restores
// the complete FSH CALIPER-era bundle without rewriting any older evidence.
export function beforeMaleAmhYoungAdultBundle(data) {
  return { ...data, version: '2026-10-18.1', profiles: beforeMaleLhCaliperBundle(data).profiles
    .filter(profile => profile.id !== 'woloszynek2015-male-amh-age-18-20') };
}

export function beforeMaleAmhYoungAdultRuntime(runtime) {
  const { maleAmhYoungAdultReferencePolicy: _youngAdult, ...prior } = beforeMaleLhCaliperRuntime(runtime);
  return prior;
}

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
  return { ...data, version: '2026-10-17.2', profiles: beforeMaleAmhYoungAdultBundle(data).profiles
    .filter(profile => !fshCaliperIds.has(profile.id)).map(beforeFshCaliperProfile) };
}

export function beforeFshCaliperRuntime(runtime) {
  const { fshCaliperReferencePolicy: _caliper, ...prior } = beforeMaleAmhYoungAdultRuntime(runtime);
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
