import { readFileSync, writeFileSync, mkdirSync, realpathSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import assert from 'node:assert/strict';

// Read-only with respect to the repository. All outputs stay beside this script.
if (!process.argv[2] || !process.argv[3]) throw new Error('Usage: node inventory.mjs <repository> <output-directory-outside-repository>');
const repo = realpathSync(path.resolve(process.argv[2]));
const output = path.resolve(process.argv[3]);
function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}
let existingAncestor = output;
while (!existsSync(existingAncestor)) existingAncestor = path.dirname(existingAncestor);
if (isInside(repo, output) || isInside(repo, realpathSync(existingAncestor))) {
  throw new Error('Output must stay outside the repository, including through symlinks');
}
const require = createRequire(path.join(repo, 'package.json'));
const runtime = require(path.join(repo, 'vilda_hormone_lifespan_data.js'));
const engine = require(path.join(repo, 'vilda_hormone_lifespan_reference.js'));
const display = require(path.join(repo, 'vilda_hormone_lifespan_display.js'));
const observations = require(path.join(repo, 'vilda_hormone_lifespan_observations.js'));
const xuData = require(path.join(repo, 'vilda_amh_age_reference_data.js'));
const xuEngine = require(path.join(repo, 'vilda_amh_age_reference.js'));
const pubertyData = require(path.join(repo, 'vilda_lab_puberty_data.js'));
const pubertyEngine = require(path.join(repo, 'vilda_lab_puberty.js'));
const testosteroneData = require(path.join(repo, 'vilda_lab_testosterone_data.js'));
const testosteroneEngine = require(path.join(repo, 'vilda_lab_testosterone.js'));
const data = runtime.patientPointData;
const maxAge = 120;
const analytes = ['lh', 'fsh', 'amh', 'inhb', 't', 'e2', 'insl3'];
const sexes = ['male', 'female'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const inputNames = ['vilda_hormone_lifespan_reference.js', 'vilda_hormone_lifespan_data.js',
  'vilda_hormone_lifespan_display.js', 'vilda_hormone_lifespan.js', 'vilda_hormone_lifespan_observations.js',
  'vilda_amh_age_reference_data.js', 'vilda_amh_age_reference.js', 'vilda_lab_puberty_data.js',
  'vilda_lab_puberty.js', 'lab_units_data.js', 'lab_unit_converter.js',
  'vilda_lab_testosterone.js', 'vilda_lab_testosterone_data.js', 'vilda_lab_testosterone_units.js',
  'docs/clinical/hormone-lifespan/population-reference-data.json',
  'vilda_fsh_source.js', 'vilda_e2_phase_source.js', 'vilda_fsh_d3.js', 'vilda_e2_d3.js',
  'vilda_amh_lilacs_source_ui.js', 'vilda_insl3_age_source.js',
  ...['fsh-source-data', 'e2-phase-source-data', 'fsh-d3-data', 'e2-d3-data',
    'amh-lilacs-source-data', 'insl3-age-source-data', 'insl3-age-source-policy'].map(name =>
    'docs/clinical/hormone-lifespan/' + name + '.json')];
const inputs = Object.fromEntries(inputNames.map(name => [name, sha(readFileSync(path.join(repo, name)))]));
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
assert.equal(data.profiles.length, 85);
assert.equal(data.version, '2026-10-22.2');
assert.equal(new Set(data.profiles.map(p => p.id)).size, 85);

// Execute the unchanged browser exports too, as existing unit harnesses do.
const browser = {};
const sandbox = { window: browser };
vm.createContext(sandbox);
for (const name of ['vilda_hormone_lifespan_data.js', 'vilda_hormone_lifespan_reference.js',
  'lab_units_data.js', 'lab_unit_converter.js']) {
  vm.runInContext(readFileSync(path.join(repo, name), 'utf8'), sandbox, { filename: name });
}
assert.equal(JSON.stringify(browser.VildaHormoneLifespanData.patientPointData), JSON.stringify(data));

let mainParityCalls = 0;
function checkedEvaluate(inputData, patientContext) {
  const result = engine.evaluate(inputData, patientContext);
  const browserResult = browser.VildaHormoneLifespanReference.evaluate(inputData, patientContext);
  assert.equal(JSON.stringify(result), JSON.stringify(browserResult));
  mainParityCalls++;
  return result;
}


const variants = {
  unknown: { preterm: 'unknown' },
  explicitlyTerm: { preterm: 'no' },
  explicitlyTermAndGonadalStage1: { preterm: 'no', stage: 1 },
};
function context(analyte, sex, ageYears, variant = 'explicitlyTermAndGonadalStage1', extra = {}) {
  const config = variants[variant];
  const result = { analyte, sex, ageYears, ageUpperYears: ageYears, ageUpperInclusive: true,
    preterm: config.preterm, measurement: { value: 1, unit: data.unitConversions[analyte].unit, operator: '=' } };
  if (config.stage) result.puberty = { kind: sex === 'male' ? 'G' : 'Th', stage: config.stage };
  return { ...result, ...extra };
}
function summarized(result) {
  return result.status === 'ready' ? { status: result.status, profileId: result.profile?.id || null,
    groupId: result.group?.id || null, referenceValue: result.referenceValue,
    statistic: result.profile?.statistic || result.statistic || null,
    unit: result.profile?.unit || result.unit || null } : { status: result.status, reason: result.reason };
}
function category(result, analyte) {
  if (result.status === 'ready') return analyte === 'insl3' ? 'latent-engine-only-ui-disabled' : 'ordinary-age-numeric-reference';
  return ({ 'unsupported-age': 'no-profile-for-age', 'reference-unavailable': 'source-node-quality-or-quantification-limit',
    'missing-puberty-stage': 'missing-required-gonadal-context', 'incompatible-puberty-stage': 'incompatible-gonadal-context',
    'preterm-context': 'unknown-or-incompatible-term-birth-context',
    'ambiguous-age': 'age-uncertainty-crosses-source-or-quality-boundary' })[result.reason] || result.reason;
}
function outcome(analyte, sex, age, variant, extra) {
  const c = context(analyte, sex, age, variant, extra);
  const r = checkedEvaluate(runtime, c);
    return { ...summarized(r), category: category(r, analyte) };
}
const profiles = data.profiles.map(p => ({ id: p.id, analyte: p.analyte, sex: p.sex,
  minAge: p.minAge, minAgeExclusive: !!p.minAgeExclusive, maxAge: p.maxAge, maxAgeExclusive: !!p.maxAgeExclusive,
  sourcePointsDomain: [p.points[0].ageYears, p.points.at(-1).ageYears], sourceNodeCount: p.points.length,
  termOnly: !!p.termOnly, requiredGonadalStage: p.requiredGonadalStage ?? null,
  compatibleAssayMethodIds: p.compatibleAssayMethodIds || [],
  compatibleSpecimenIds: p.compatibleSpecimenIds || ['serum', 'surowica'],
  excludedCyclePhases: p.excludedCyclePhases || [], statistic: p.statistic, approximate: p.approximate,
  ordinaryOnly: !!p.ordinaryOnly, unit: p.unit, interpolation: p.interpolation,
  sourceLabel: p.sourceLabel, url: p.url, limitations: p.limitations,
  ineligibleSourceNodes: p.points.filter(n => n.eligible === false).map(n => n.ageYears) }));
function stateKey(r) { return JSON.stringify([r.status, r.profileId, r.reason, r.category]); }
function mergeAtoms(atoms) {
  const merged = [];
  for (const atom of atoms) {
    const previous = merged.at(-1);
    if (previous && previous.maxAge === atom.minAge && stateKey(previous.outcome) === stateKey(atom.outcome)) {
      previous.maxAge = atom.maxAge; previous.maxAgeInclusive = atom.maxAgeInclusive;
    } else merged.push(structuredClone(atom));
  }
  return merged;
}
const rawProbes = [];
const coverage = [];
for (const analyte of analytes) for (const sex of sexes) {
  const own = data.profiles.filter(p => p.analyte === analyte && p.sex === sex);
  // Every routing endpoint and original source knot is a breakpoint, including
  // eligible:false nodes. Intervals are evaluated, never assumed from a union.
  const boundaries = [...new Set([0, maxAge, ...own.flatMap(p => [p.minAge, p.maxAge, ...p.points.map(n => n.ageYears)])])]
    .filter(age => age >= 0 && age <= maxAge).sort((a, b) => a - b);
  const probeAges = new Set(boundaries);
  for (const age of boundaries) for (const delta of [-1e-9, 1e-9]) if (age + delta >= 0 && age + delta <= maxAge) probeAges.add(age + delta);
  for (let i = 1; i < boundaries.length; i++) probeAges.add((boundaries[i - 1] + boundaries[i]) / 2);
  for (let age = 0; age <= 90; age += .25) probeAges.add(age);
  for (let age = 91; age <= maxAge; age++) probeAges.add(age);
  for (const variant of Object.keys(variants)) {
    const atoms = [];
    for (let i = 0; i < boundaries.length; i++) {
      const age = boundaries[i];
      atoms.push({ minAge: age, minAgeInclusive: true, maxAge: age, maxAgeInclusive: true,
        outcome: outcome(analyte, sex, age, variant) });
      if (i + 1 < boundaries.length) atoms.push({ minAge: age, minAgeInclusive: false,
        maxAge: boundaries[i + 1], maxAgeInclusive: false,
        outcome: outcome(analyte, sex, (age + boundaries[i + 1]) / 2, variant) });
    }
    coverage.push({ analyte, sex, contextVariant: variant, segments: mergeAtoms(atoms) });
    for (const age of [...probeAges].sort((a, b) => a - b)) rawProbes.push({ analyte, sex,
      contextVariant: variant, ageYears: age, ...outcome(analyte, sex, age, variant) });
  }
}

const gateProbes = [];
for (const profile of data.profiles) {
  const ages = [...profile.points.map(n => n.ageYears), (profile.minAge + profile.maxAge) / 2];
  const age = ages.find(a => checkedEvaluate(runtime, context(profile.analyte, profile.sex, a)).profile?.id === profile.id);
  assert.notEqual(age, undefined, `No ready production node in ${profile.id}`);
  const base = context(profile.analyte, profile.sex, age);
  const cases = { baseline: {}, zero: { measurement: { ...base.measurement, value: 0 } },
    censoredLessThan: { measurement: { ...base.measurement, operator: '<' } },
    invalidMeasurement: { measurement: null }, contraindicated: { contraindicated: true },
    incompatibleAssay: { assayMethodId: 'fictional-incompatible-assay' },
    incompatibleSpecimen: { specimen: 'fictional-incompatible-specimen' },
    explicitlyUnknownAssay: { assayMethodId: 'unknown' }, explicitlyUnknownSpecimen: { specimen: 'unknown' },
    compatibleSpecimen: { specimen: (profile.compatibleSpecimenIds || ['serum'])[0] },
    knownPregnancy: { cyclePhase: 'pregnancy_t1' }, knownPostmenopause: { cyclePhase: 'postmenopause' },
    follicularPhase: { cyclePhase: 'follicular' },
    missingStage: { puberty: null }, incompatibleStage2: { puberty: { kind: profile.sex === 'male' ? 'G' : 'Th', stage: 2 } },
    pubicHairStage1DoesNotSubstitute: { puberty: { kind: 'P', stage: 1 } },
    unknownBirth: { preterm: 'unknown' }, knownPreterm: { preterm: 'yes' } };
  for (const method of profile.compatibleAssayMethodIds || []) cases[`compatibleAssay:${method}`] = { assayMethodId: method };
  for (const [name, extra] of Object.entries(cases)) gateProbes.push({ profileId: profile.id, name,
    context: { ...base, ...extra }, result: summarized(checkedEvaluate(runtime, { ...base, ...extra })) });
}
const uncertaintyProbes = [];
for (const analyte of analytes) for (const sex of sexes) {
  const limits = new Set(data.profiles.filter(p => p.analyte === analyte && p.sex === sex).flatMap(p => [p.minAge, p.maxAge]));
  for (const boundary of limits) {
    const epsilon = Math.min(1e-7, boundary / 2 || 1e-7);
    for (const [kind, low, high, inclusive] of [['crossing', boundary - epsilon, boundary + epsilon, false],
      ['exclusive-upper', boundary - epsilon, boundary, false], ['inclusive-upper', boundary - epsilon, boundary, true],
      ['completed-month-at-boundary', boundary, boundary + 1 / 12, false]]) {
      if (low < 0) continue;
      const c = context(analyte, sex, low, undefined, { ageUpperYears: high, ageUpperInclusive: inclusive });
      uncertaintyProbes.push({ analyte, sex, boundary, kind, ageYears: low, ageUpperYears: high,
        ageUpperInclusive: inclusive, result: summarized(checkedEvaluate(runtime, c)) });
    }
  }
}

// Independent active senior inset: it is not registered among 85 age profiles.
const senior = { source: runtime.inhibinEvidence.senior.source,
  groups: runtime.inhibinEvidence.senior.groups,
  activeUi: 'life view with senior stage; renderer also recognizes patient age >90 when no fixed age stage remains',
  probes: [], gateProbes: [], ageUncertaintyProbes: [] };
for (const sex of sexes) for (const age of [0, 79.999999, 80, 80.000001, 85, 89.999999, 90, 100, 101, 101.000001, 120]) {
  const c = context('inhb', sex, age);
  senior.probes.push({ sex, ageYears: age, result: summarized(observations.evaluateSenior(runtime.inhibinEvidence, c)) });
}
for (const [name, extra] of Object.entries({ compatibleAssay: { assayMethodId: 'serotec-inhibin-b-elisa' },
  incompatibleAssay: { assayMethodId: 'gen-ii-inhibin-b-elisa' }, unknownAssay: { assayMethodId: 'unknown' },
  incompatibleSpecimen: { specimen: 'plasma' }, compatibleSpecimen: { specimen: 'serum' },
  contraindicated: { contraindicated: true }, censored: { measurement: { value: 1, unit: 'pg/mL', operator: '<' } },
  zero: { measurement: { value: 0, unit: 'pg/mL', operator: '=' } },
  equivalentUnit: { measurement: { value: 1, unit: 'ng/L', operator: '=' } } })) {
  senior.gateProbes.push({ name, result: summarized(observations.evaluateSenior(runtime.inhibinEvidence,
    context('inhb', 'male', 85, undefined, extra))) });
}
for (const boundary of [80, 90, 101]) for (const inclusive of [false, true]) {
  senior.ageUncertaintyProbes.push({ boundary, ageUpperInclusive: inclusive,
    result: summarized(observations.evaluateSenior(runtime.inhibinEvidence,
      context('inhb', 'male', boundary - .1, undefined, { ageUpperYears: boundary, ageUpperInclusive: inclusive }))) });
}

const comparisons = [];
for (const [analyte, period, factory] of [
  ['amh', 'mini', () => display.buildAmhInfantComparison(runtime, engine)],
  ['inhb', 'mini', () => display.buildInhibinComparison(runtime, engine, 'mini')],
  ['inhb', 'puberty', () => display.buildInhibinComparison(runtime, engine, 'puberty')],
  ...['lh', 'fsh'].flatMap(analyte => ['mini', 'puberty'].map(period => [analyte, period,
    () => display.buildGonadotropinComparison(runtime, engine, period, analyte)])),
]) {
  const model = factory(); assert.ok(model);
  const comparison = { analyte, period, domain: model.domain, profileIds: model.profileIds, scale: model.scale,
    note: 'Production build output; evaluate each own-sex source separately. Shared curve domain is not the full renderer patient gate: the qualified male seven-day infant point may precede the paired curves. This probe list is not a claim of DOM rendering.', probes: [] };
  for (const sex of sexes) for (const age of [7 / 365.25, .02, .25, .999999, 1, 5.999999, 6, 8, 16, 16.000001, 17, 18, 20, 20.000001]) {
    const c = context(analyte, sex, age);
    const evaluated = checkedEvaluate(model.referenceData || runtime, c);
    comparison.probes.push({ sex, ageYears: age,
      result: summarized(evaluated), sourceProfileIsComparisonTarget: evaluated.profile?.id === model.profileIds[sex],
      insideSharedCurveDomain: age >= model.domain.minAge && (model.domain.maxAgeExclusive ? age < model.domain.maxAge : age <= model.domain.maxAge) });
  }
  comparisons.push(comparison);
}

// Xu is an adjacent-anchor table, not a continuous age curve / source dot.
const xu = { id: xuData.id, source: xuData.source, points: xuData.points, ageDomain: xuData.ageDomain, probes: [] };
for (const age of [34.999999, 35, 37.5, 40, 45, 46, 47, 50, 55, 55.999999, 56]) {
  for (const phase of ['unknown', 'follicular', 'pregnancy_t1', 'postmenopause']) {
    const c = { ...context('amh', 'female', age), sourceStatus: 'ready', displayUnit: 'ng/mL', cyclePhase: phase };
    const r = xuEngine.evaluate(xuData, c);
    xu.probes.push({ ageYears: age, cyclePhase: phase, result: r.status === 'ready' ? {
      status: r.status, mode: r.mode, points: r.points, completeAgeCoverage: r.completeAgeCoverage,
      coverageReason: r.coverageReason } : r });
  }
}

const laboratoryPhaseReferences = [];
for (const analyte of ['lh', 'fsh']) for (const phase of ['unknown', 'follicular', 'ovulation', 'luteal', 'postmenopause']) {
  const r = pubertyEngine.evaluate({ analyte, sex: 'F', value: '2', unit: 'IU/L',
    birthDateISO: '1996-01-01', sampleDateISO: '2026-01-01', referenceSelection: 'automatic',
    reproductiveContext: phase, specimen: 'serum', measurementKind: 'basal',
    treatment: { gnrha: 'no', sexSteroids: 'no' }, preterm: 'no' }, pubertyData);
  laboratoryPhaseReferences.push({ analyte, ageYears: 30, phase,
    biochemical: r.biochemical, referencePreview: r.referencePreview, referenceSelection: r.referenceSelection });
}
const otherLaboratoryReferences = [];
for (const sex of ['M', 'F']) {
  otherLaboratoryReferences.push({ analyte: 'e2', sex, ageYears: 30,
    result: browser.LabUnitConverter.evaluate('estradiol', { value: '50', unit: 'pmol/L',
      patient: { sex, age: 30, life_stage: 'adult' } }) });
  for (const years of [.25, 12, 30]) {
    const stage = years === 12 ? { kind: sex === 'M' ? 'G' : 'Th', stage: 3, appliesToCurrentContext: true } : null;
    const r = testosteroneEngine.evaluate({ analyte: 'testosterone_total', sex, value: '1', unit: 'nmol/L',
      age: { years: Math.floor(years), months: years === .25 ? 3 : 0, precision: 'month' },
      contextBasis: 'current-patient', puberty: stage }, testosteroneData);
    otherLaboratoryReferences.push({ analyte: 't', sex, ageYears: years,
      biochemical: r.biochemical, referenceSelection: r.referenceSelection, referencePreview: r.referencePreview });
  }
}
for (const phase of ['unknown', 'follicular', 'ovulation', 'luteal', 'postmenopause']) {
  const patient = { sex: 'F', age: 30, life_stage: 'adult', cycle_phase: phase };
  laboratoryPhaseReferences.push({ analyte: 'e2', ageYears: 30, phase,
    result: browser.LabUnitConverter.evaluate('estradiol', { value: '50', unit: 'pmol/L', patient }) });
}

const closedGapChecks = [['fsh', 'male', 16, 'wilson2023-male-fsh-age-16-18'],
  ['fsh', 'female', 18, 'wilson2023-female-fsh-age-16-19'],
  ['amh', 'male', 18, 'woloszynek2015-male-amh-age-18-20'],
  ['amh', 'male', 19 + 11 / 12, 'woloszynek2015-male-amh-age-18-20'],
  ['lh', 'male', 16, 'madsen2022-male-lh'], ['lh', 'male', 17, 'wilson2023-male-lh-age-over16-under18'],
  ['lh', 'male', 18, 'laurentino2020-male-lh-18-under25'],
  ['t', 'male', 1.5, 'kushnir2010-male-t-1-2-group'],
  ['t', 'male', 2.5, 'kushnir2010-male-t-2-3-group'],
  ['inhb', 'female', 47.75, 'borelli2025-female-inhb-age-5p6-47p75'],
  ['e2', 'female', 2, 'kulle2024-female-e2-th1-age-over1-under6']].map(([analyte, sex, ageYears, profileId]) => {
    const result = outcome(analyte, sex, ageYears); assert.equal(result.profileId, profileId);
    return { analyte, sex, ageYears, result };
  });

const inventory = { reviewDate: '2026-10-24', schemaVersion: 1, repo, head, engineVersion: engine.version,
  runtimeVersion: runtime.version, dataVersion: data.version, profileCount: data.profiles.length, inputs,
  conventions: {
    ageDomainYears: [0, maxAge], coarseScan: '0–90 every 0.25 years plus 91–120 yearly',
    exhaustiveBreakpoints: 'Every published source knot, all profile endpoints, exact endpoints and midpoints of every adjacent open interval; endpoint neighbours ±1e-9 additionally probed.',
    qualification: 'Actual production evaluate, not an interval union. Each main-engine outcome is compared with the browser VM export.',
    conditionalContext: 'Term birth and G1/Th1 are explicitly hypothetical supplied facts. No Tanner stage, cycle phase, pregnancy, menopause, assay or specimen is inferred from age.',
    scope: 'No clinical validation, no new source data, no patient records, no browser/no changes to app or tests.',
    ordinaryUiExceptions: [
      'INSL3: engine profile exists but UI explicitly bypasses evaluation and concentration point; source engine readiness is latent only.',
      'Female LH/FSH mini view: relative longitudinal means suppress the concentration point; ordinary life view uses a different contract.',
      'ordinaryOnly profiles cannot be used by the sex-comparison renderer.',
      'Baccarelli senior inset is an active independent group-mean comparison outside the 85-profile registry.',
      'INSL3 now has a separate source-age reading, not an ordinary reference, converter or concentration point.',
      'FSH D3 and E2 D3 have separate age-source curves and optional exact D3 patient points, outside the 85 ordinary profiles.',
      'Age-profile gaps do not imply absence of existing cycle-phase laboratory RI or inset source statistics.'
    ] },
  profiles, coverage, gateProbes, uncertaintyProbes, comparisons, senior, xu,
  laboratoryPhaseReferences, otherLaboratoryReferences, closedGapChecks,
  nonAgePointEvidence: {
    kuiriHanninenMini: { source: runtime.inhibinEvidence.mini.source,
      visits: runtime.inhibinEvidence.mini.visits, displayPolicy: runtime.inhibinEvidence.mini.displayPolicy,
      patientPoint: false },
    croftonTanner: { source: runtime.inhibinEvidence.tanner.source,
      points: runtime.inhibinEvidence.tanner.points, displayPolicy: runtime.inhibinEvidence.tanner.displayPolicy,
      patientPoint: false },
    strickerCycle: runtime.femaleGonadotropinData.cycle,
    anckaertEstradiolCycle: runtime.lifespanData.cycleSchematic,
  },
  probeCounts: { ordinary: rawProbes.length, gate: gateProbes.length, ageUncertainty: uncertaintyProbes.length,
    comparisons: comparisons.reduce((n, c) => n + c.probes.length, 0), senior: senior.probes.length,
    xu: xu.probes.length, labPhase: laboratoryPhaseReferences.length,
    otherLaboratory: otherLaboratoryReferences.length },
};

// Additional merged source layers. Call production exports, never reconstruct
// interpolation, rounding, central statistics or clinical routing in this audit.
const layerSpecs = [
  ['fshD3', 'vilda_fsh_d3.js', 'VildaFshD3', runtime.fshD3Data, 'fsh', ['fsh']],
  ['e2D3', 'vilda_e2_d3.js', 'VildaE2D3', runtime.e2D3Data, 'estradiol', ['e2']],
  ['fshPhaseSource', 'vilda_fsh_source.js', 'VildaFshSource', runtime.fshSourceData, 'fsh', ['fsh']],
  ['e2PhaseSource', 'vilda_e2_phase_source.js', 'VildaE2PhaseSource', runtime.e2PhaseSourceData, 'estradiol', ['e2']],
  ['amhLilacsSource', 'vilda_amh_lilacs_source_ui.js', 'VildaAmhLilacsSourceUI', runtime.amhLilacsSourceData, 'amh', ['amh']],
];
const layers = {};
function compactSourceResult(r) {
  const keys = ['status', 'reason', 'kind', 'valueKind', 'sourceId', 'sourceVersion', 'policyVersion',
    'clinicalActivation', 'unit', 'valueMin', 'valueMax', 'ageLower', 'ageUpper', 'ageUpperInclusive',
    'sourceLoqCrossing', 'sourceLodCrossing', 'median', 'comparison', 'ageContext', 'ageDomain',
    'group', 'phase', 'policy'];
  return Object.fromEntries(keys.filter(k => r[k] !== undefined).map(k => [k, r[k]]));
}
for (const [name, filename, globalName, sourceData, analyte, selected] of layerSpecs) {
  const api = require(path.join(repo, filename));
  const separateWindow = {};
  vm.runInNewContext(readFileSync(path.join(repo, filename), 'utf8'), { window: separateWindow }, { filename });
  assert.equal(typeof separateWindow[globalName]?.evaluate, 'function', globalName);
  const isLilacs = name === 'amhLilacsSource';
  const sourceContext = extra => ({
    sourceStatus: 'ready', identityKey: 'fictional-coverage-audit-person',
    analyte, sex: isLilacs ? 'male' : 'female', selected, compare: false, view: 'life',
    contextBasis: 'current-patient', sampleDateISO: null, ageYears: isLilacs ? 85 : 30,
    ageUpperYears: isLilacs ? 85 : 31, ageUpperInclusive: isLilacs,
    cyclePhase: 'follicular', cycleDay: 'unknown',
    measurement: { status: 'valid', value: isLilacs ? 2 : 7, unit: isLilacs ? 'ng/mL' : analyte === 'fsh' ? 'IU/L' : 'pg/mL', operator: '=', isExact: true },
    ...extra,
  });
  const ageSet = new Set([0, 1, 3, 16, 17, 18, 18.000001, 19, 25, 30, 37, 40, 43, 44, 44.000001, 45, 55, 70, 79.999999, 80, 85, 90, 90.000001, 101, 120,
    ...(sourceData.knots || []).map(p => p.ageYears)]);
  const probes = [];
  function probe(name, extra) {
    const c = sourceContext(extra);
    const result = api.evaluate(sourceData, c);
    const browserResult = separateWindow[globalName].evaluate(sourceData, c);
    assert.equal(JSON.stringify(result), JSON.stringify(browserResult));
    probes.push({ name, context: c, result: compactSourceResult(result) });
  }
  for (const age of [...ageSet].sort((a,b) => a - b)) {
    probe('exact-age', { ageYears: age, ageUpperYears: age, ageUpperInclusive: true });
    probe('completed-year', { ageYears: age, ageUpperYears: age + 1, ageUpperInclusive: false });
  }
  const extras = {
    baseline: {}, day3: { cycleDay: 'day3' }, otherDay: { cycleDay: 'other' },
    unknownPhase: { cyclePhase: 'unknown' }, ovulation: { cyclePhase: 'ovulation' },
    luteal: { cyclePhase: 'luteal' }, postmenopause: { cyclePhase: 'postmenopause' },
    pregnancy: { cyclePhase: 'pregnancy_t1' }, contraindicated: { contraindicated: true },
    knownTreatment: { hormonalTreatment: true }, wrongSpecimen: { specimen: 'plasma' },
    wrongAssay: { assayMethodId: 'fictional-incompatible-assay' },
    unknownAssay: { assayMethodId: 'unknown' }, locked: { sourceStatus: 'locked' },
    historicalSample: { contextBasis: 'sample', sampleDateISO: '2020-01-02' },
    compare: { compare: true }, mini: { view: 'mini' }, wrongSex: { sex: isLilacs ? 'female' : 'male' },
    unselected: { selected: [] }, missingAge: { ageYears: null },
  };
  for (const operator of ['=', '<', '>', '<=', '>=']) {
    extras['operator:' + operator] = { cycleDay: 'day3', measurement: {
      status: 'valid', value: 7, unit: isLilacs ? 'ng/mL' : analyte === 'fsh' ? 'IU/L' : 'pg/mL',
      operator, isExact: operator === '=' } };
  }
  for (const [key, extra] of Object.entries(extras)) probe(key, extra);
  layers[name] = { version: sourceData.version, sourceId: sourceData.source?.id,
    dataKey: name === 'amhLilacsSource' ? 'amhLilacsSourceData' : name + 'Data',
    function: filename + ':evaluate', browserExport: globalName + '.evaluate', probes };
}

const insl3Reader = require(path.join(repo, 'vilda_insl3_age_source.js'));
const insl3Window = {};
vm.runInNewContext(readFileSync(path.join(repo, 'vilda_insl3_age_source.js'), 'utf8'), { window: insl3Window });
const insl3Ages = new Set([0, 3, 10, 12, 12.5, 17, 17.5, 18, 19, 20, 25, 27.6, 30, 31.4, 40, 55, 60.9, 61, 75, 120]);
for (const segment of runtime.insl3AgeSourceData.segments) {
  for (const point of segment.points) insl3Ages.add(point[0]);
  for (const boundary of [segment.ageMin, segment.ageMax]) for (const delta of [-1e-9, 0, 1e-9]) insl3Ages.add(boundary + delta);
}
for (const boundary of runtime.insl3AgeSourcePolicy.allowedAgeDomains.flat()) {
  for (const delta of [-1e-9, 0, 1e-9]) insl3Ages.add(boundary + delta);
}
const insl3 = { function: 'vilda_insl3_age_source.js:read', browserExport: 'VildaInsl3AgeSource.read',
  dataVersion: runtime.insl3AgeSourceData.version, policyVersion: runtime.insl3AgeSourcePolicy.version,
  allowedAgeDomains: runtime.insl3AgeSourcePolicy.allowedAgeDomains,
  directSegments: runtime.insl3AgeSourceData.segments.map(s => ({ minAge: s.ageMin, maxAge: s.ageMax, nodeCount: s.points.length })),
  probes: [] };
function insl3Probe(name, age, extra = {}) {
  const c = { sourceStatus: 'ready', sex: 'male', ageYears: age, ageUpperYears: age, ageUpperInclusive: true,
    contextBasis: 'current-form', ...extra };
  const r = insl3Reader.read(runtime.insl3AgeSourceData, runtime.insl3AgeSourcePolicy, c);
  const br = insl3Window.VildaInsl3AgeSource.read(runtime.insl3AgeSourceData, runtime.insl3AgeSourcePolicy, c);
  assert.equal(JSON.stringify(r), JSON.stringify(br));
  insl3.probes.push({ name, context: c, result: compactSourceResult(r) });
}
for (const age of [...insl3Ages].sort((a,b) => a - b)) {
  insl3Probe('exact-age', age);
  insl3Probe('completed-year', age, { ageUpperYears: age + 1, ageUpperInclusive: false });
}
for (const [name, extra] of Object.entries({ wrongSex: { sex: 'female' }, unknownSex: { sex: null },
  locked: { sourceStatus: 'locked' }, historicalSample: { contextBasis: 'sample', sampleDateISO: '2020-01-02' },
  missingPrecision: { ageUpperYears: undefined }, sourceLoading: { sourceStatus: 'loading' },
  domainGap: { ageUpperYears: 32, ageUpperInclusive: false } })) insl3Probe(name, 25, extra);
assert.equal(insl3.probes.find(p => p.name === 'exact-age' && p.context.ageYears === 18).result.status, 'unavailable');
for (const [age, expected] of [[25, 1.27], [40, 1.25]]) {
  assert.equal(insl3.probes.find(p => p.name === 'exact-age' && p.context.ageYears === age).result.valueMin, expected);
}

const resultOnly = { function: 'vilda_hormone_lifespan_reference.js:evaluateResultOnly', probes: [] };
for (const age of [1, 6, 16, 16.000001, 17, 17.999999, 18, 40, 120]) {
  for (const operator of ['=', '<', '>']) for (const upper of [age, age + 1]) {
    const c = context('lh', 'female', age, undefined, { ageUpperYears: upper, ageUpperInclusive: upper === age,
      measurement: { value: 5, unit: 'IU/L', operator } });
    const r = engine.evaluateResultOnly(runtime, c);
    const br = browser.VildaHormoneLifespanReference.evaluateResultOnly(browser.VildaHormoneLifespanData, c);
    assert.equal(JSON.stringify(r), JSON.stringify(br));
    resultOnly.probes.push({ context: c, result: { ...summarized(r), value: r.value, unit: r.unit } });
  }
}

inventory.sourceLayers = layers;
inventory.insl3AgeSource = insl3;
inventory.resultOnly = resultOnly;
inventory.probeCounts.sourceLayers = Object.fromEntries(Object.entries(layers).map(([k,v]) => [k,v.probes.length]));
inventory.probeCounts.insl3AgeSource = insl3.probes.length;
inventory.probeCounts.resultOnly = resultOnly.probes.length;
inventory.vmParity = { ordinaryFullResults: rawProbes.length, allMainEngineFullResults: mainParityCalls, separateSourceLayers: true,
  insl3SourceReader: true, resultOnly: true, mismatches: 0,
  note: 'Separate VM browser exports were executed; no DOM/browser rendering or PWA claim is made by this script.' };

// Compact coverage merges only identical returned readiness categories, not
// overlapping declared profile endpoints. Exact boundary points stay explicit.
const label = age => Number(age.toPrecision(13)).toString();
function interval(segment) {
  return segment.minAge === segment.maxAge ? '{' + label(segment.minAge) + '}' :
    (segment.minAgeInclusive ? '[' : '(') + label(segment.minAge) + ', ' + label(segment.maxAge) + (segment.maxAgeInclusive ? ']' : ')');
}
const rows = coverage.filter(row => row.contextVariant === 'explicitlyTermAndGonadalStage1').map(row => {
  const segments = mergeAtoms(row.segments.map(s => ({ ...s, outcome: {
    status: s.outcome.status, reason: s.outcome.reason, category: s.outcome.category } })));
  return { analyte: row.analyte, sex: row.sex, ready: segments.filter(s => s.outcome.status === 'ready').map(interval),
    unsupportedAge: segments.filter(s => s.outcome.reason === 'unsupported-age').map(interval),
    sourceQuality: segments.filter(s => s.outcome.reason === 'reference-unavailable').map(interval) };
});
inventory.compactCoverage = rows;
inventory.probeCounts.total = Object.values(inventory.probeCounts).reduce((n,v) => n + (typeof v === 'number' ? v : Object.values(v).reduce((a,b) => a+b,0)), 0);
const summary = { reviewDate: '2026-10-24', head, profileCount: data.profiles.length,
  dataVersion: data.version, engineVersion: engine.version, probeCounts: inventory.probeCounts,
  coverage: rows, inputHashes: Object.keys(inputs).length, repositoryInputsUnchanged: true,
  vmParity: inventory.vmParity, sourceLayers: Object.fromEntries(Object.entries(layers).map(([k,v]) => [k, {
    version: v.version, function: v.function, browserExport: v.browserExport,
    ready: v.probes.filter(p => p.result.status === 'ready').length,
    unavailable: v.probes.filter(p => p.result.status === 'unavailable').length,
  }])), insl3: { sourceVersion: insl3.dataVersion, policyVersion: insl3.policyVersion,
    segments: insl3.directSegments.length, nodes: insl3.directSegments.reduce((n,s) => n+s.nodeCount,0),
    ready: insl3.probes.filter(p => p.result.status === 'ready').length,
    unavailable: insl3.probes.filter(p => p.result.status === 'unavailable').length } };

const historicalFile = 'docs/clinical/hormone-lifespan/evidence/reference-coverage-audit-2026-10-18.json';
const historical = JSON.parse(readFileSync(path.join(repo, historicalFile), 'utf8'));
const historicalIds = historical.probeMethod.profileIds;
const currentIds = data.profiles.map(p => p.id);
const example = (layer, name, age) => {
  const p = layers[layer].probes.find(item => item.name === name &&
    (age === undefined || item.context.ageYears === age));
  assert.ok(p, layer + ':' + name + ':' + age);
  const result = Object.fromEntries(Object.entries(p.result).filter(([key]) => key !== 'policy'));
  return { context: p.context, result };
};
const insl3Example = (name, age) => {
  const p = insl3.probes.find(item => item.name === name && item.context.ageYears === age);
  assert.ok(p, name + ':' + age);
  return { context: p.context, result: p.result };
};
const publicEvidence = {
  schemaVersion: 1, reviewDate: '2026-10-24', baseAudyt: head,
  classification: 'Read-only technical coverage audit of already merged production behavior; no runtime, norm, clinical-reference activation, or clinical validation.',
  engineVersion: engine.version, runtimeVersion: runtime.version, dataVersion: data.version,
  profileCount: data.profiles.length, inputSha256: inputs,
  probeCounts: inventory.probeCounts,
  probeCountMeaning: 'Recorded synthetic probe cases; these are not unique patients or independent clinical observations. VM parity includes additional coverage-atom evaluations and searches for a ready age in each existing profile.',
  vmParity: inventory.vmParity,
  reproduction: {
    script: 'docs/clinical/hormone-lifespan/audit_reference_coverage.mjs',
    invocation: 'node docs/clinical/hormone-lifespan/audit_reference_coverage.mjs . <output-directory-outside-repository>',
    dependencies: 'Node built-ins and git only; no npm package or browser installation is used by this inventory.',
    writesOnlyOutsideRepository: true, confirmsProductionInputHashesUnchanged: true,
    browserUiOrPwaExecutedByThisAuditScript: false,
  },
  scope: inventory.conventions,
  profileIds: currentIds,
  changesSinceHistoricalScan: {
    historicalEvidence: historicalFile,
    historicalEvidenceSha256: sha(readFileSync(path.join(repo, historicalFile))),
    historicalBase: historical.baseAudyt, historicalDataVersion: historical.dataVersion,
    historicalProfileCount: historical.profileCount,
    addedIds: currentIds.filter(id => !historicalIds.includes(id)),
    replacedIds: historicalIds.filter(id => !currentIds.includes(id)),
    interpretation: 'Three additional profiles (two male testosterone groups and female E2/Th1); one female inhibin-B profile replaced by an extended profile. Later source-only layers are outside the 85-profile ordinary registry.',
    completedSeparateSteps: [
      'Female LH (16,18): result-only point, no median (evaluateResultOnly).',
      'Adult female E2 with unknown cycle: four neutral laboratory RI variants, no default follicular status.',
      'LiLACS male AMH, FSH/E2 phase information and FSH D3: separate source layers.',
      'PR #766: E2 D3, literal P50 age19–44 in a separate source block.',
      'PR #770: INSL3 age-source reader, direct visible segments only; no converter or patient-point activation.',
    ],
  },
  qualifiedOrdinaryCoverage: rows,
  requiredContext: {
    termBirth: 'Explicit synthetic term-birth context for profiles that require it; no preterm-to-term extrapolation.',
    fshChildhood: 'The 1–<6 part requires explicit sex-appropriate G1/Th1.',
    femaleE2Childhood: 'The (1,6) part requires explicit Th1; it is a fixed median of the complete B1 age1–8 source group, not a continuous exact-age model.',
    allPossibleAges: 'A whole supplied age interval must qualify; no inferred date, midpoint, Tanner stage or cycle phase.',
    latentInsl3: 'The male infant reference engine is ready7–95days, but UI does not activate a concentration dot. The newer age-source reader is a different source-only API.',
  },
  closedGapChecks: closedGapChecks,
  separateLayers: {
    fshD3: { version: layers.fshD3.version, function: layers.fshD3.function,
      domain: '(18,44]', notAnOrdinaryProfile: true,
      exampleWithoutDay3: example('fshD3','exact-age',30),
      exampleWithDay3: example('fshD3','day3'),
      completed44NotCovered: example('fshD3','completed-year',44) },
    e2D3: { version: layers.e2D3.version, function: layers.e2D3.function,
      domain: '[19,44]', notAnOrdinaryProfile: true, excludedSourceNode: 18,
      exampleWithoutDay3: example('e2D3','exact-age',30),
      exampleWithDay3: example('e2D3','day3'),
      exact18NotCovered: example('e2D3','exact-age',18),
      completed44NotCovered: example('e2D3','completed-year',44),
      censoredResultDoesNotBecomeExactPoint: example('e2D3','operator:<') },
    insl3AgeSource: { dataVersion: insl3.dataVersion, policyVersion: insl3.policyVersion,
      function: insl3.function, allowedAgeDomains: insl3.allowedAgeDomains,
      directSegmentCount: insl3.directSegments.length,
      directColumnCount: insl3.directSegments.reduce((n,s) => n + s.nodeCount,0),
      noPatientComparison: true, noNormsOrConverterActivation: true,
      examples: [insl3Example('exact-age',12), insl3Example('completed-year',12),
        insl3Example('exact-age',18), insl3Example('exact-age',25), insl3Example('completed-year',40),
        insl3Example('exact-age',75)],
      historicalContextDoesNotBorrowCurrentAge: insl3Example('historicalSample',25) },
    amhLilacs: { noPatientComparison: true, noOrdinaryAgeMedian: true,
      example: example('amhLilacsSource','exact-age',85),
      completed90NotCovered: example('amhLilacsSource','completed-year',90) },
    manufacturerFshPhase: { noPatientComparison: true, sourceAgeDomainUnknown: true,
      example: example('fshPhaseSource','baseline') },
    anckaertE2Phase: { noPatientComparison: true,
      example: example('e2PhaseSource','baseline') },
    xu: { ordinaryAgeProfile: false, noPatientComparison: true, continuousInterpolation: false,
      selectedExamples: xu.probes.filter(p => [40,46,55].includes(p.ageYears) && p.cyclePhase === 'unknown') },
    inhibinSenior: { ordinaryProfile: false, statistic: 'group-mean', groups: senior.groups,
      selectedExamples: senior.probes.filter(p => p.sex === 'male' && [80,85,90,101,120].includes(p.ageYears)) },
    femaleLhResultOnly: { noMedian: true,
      selectedExamples: resultOnly.probes.filter(p => [16,17,18].includes(p.context.ageYears) &&
        p.context.ageYears === p.context.ageUpperYears && p.context.measurement.operator === '=') },
    adultFemaleE2UnknownCycle: laboratoryPhaseReferences.find(p => p.analyte === 'e2' && p.phase === 'unknown'),
  },
  runtimeChanged: false, clinicalReferenceActivation: false,
  patientDataUsed: 'Only explicitly fictional synthetic contexts.',
  limitation: 'An absent ordinary profile is not proof that no publication exists; laboratory RI, group statistics, phases, source-only readers and educational geometry remain separate contracts.',
};
const markdown = `# Aktualne pokrycie odniesień — rzeczywiste funkcje produkcyjne\n\nBaza: \`${head}\`. Profile: **${data.profiles.length}**, dane **${data.version}**, silnik **${engine.version}**. To read-only audyt techniczny, nie akceptacja kliniczna. Przedziały są w latach. Donoszenie i G1/Th1 są jawnie dostarczonymi fikcyjnymi faktami, nigdy wnioskiem z wieku. **FSH 1–<6 wymaga G1/Th1, a E2 (1,6) wymaga Th1; bez wymaganego stadium nie ma tego ciągłego pokrycia.**\n\n| Analit | Płeć | Silnik gotowy | Brak zwykłego profilu | Blokada jakości źródła |\n|---|---|---|---|---|\n${rows.map(r => '| ' + [r.analyte,r.sex,r.ready.join('; ')||'—',r.unsupportedAge.join('; ')||'—',r.sourceQuality.join('; ')||'—'].join(' | ') + ' |').join('\n')}\n\n**INSL3:** gotowość niemowlęcego silnika nie oznacza aktywnego punktu w UI. Nowy odczyt wieku Albrethsen2020 jest osobną informacją źródłową z 732 kolumn w 17 fragmentach i domenami [10,27.6]∪[31.4,60.9], dodatkowo ograniczonymi czytelnością kreski i całym przedziałem wieku. Nie jest normą ani uruchomieniem konwertera/punktu wyniku.\n\n**FSH D3 i E2 D3:** osobne bloki poza 85 profilami. FSH >18–≤44; E2 19–44. Zwykła luka mediany wieku dorosłych nadal istnieje, ale nie oznacza braku osobnego odniesienia D3. Mediana źródła nie wymaga potwierdzenia dnia3; dokładny punkt wymaga jawnego bieżącego D3 i zgodnego kontekstu. Wynik < lub > pozostaje nierównością i nie tworzy dokładnego punktu.\n\n**Pozostałe warstwy:** LiLACS80–90 opisuje medianę całej grupy, Xu pięć sąsiednich kotwic, źródła fazowe FSH/E2 zależą od znanej fazy; nie stają się zwykłymi medianami wieku. InhibinaB mężczyzn ma odrębne średnie seniorów do 101 lat. Porównania płci mają własne kontrakty.\n\n**Zmiany względem18.10:** dwa profile T chłopców1–<3; grupowy E2 dziewczynek przy Th1 w(1,6); wydłużona inhibinaB do47.75; neutralne alternatywy RI dorosłego E2 przy nieznanej fazie; LH dziewcząt(16,18) pokazuje sam wynik bez mediany; źródła LiLACS, fazowe FSH/E2, D3FSH/E2 i INSL3 istnieją poza zwykłym rejestrem. Pełne gate'y, granice, niepewny wiek, cenzura i CommonJS/browserVM parity w JSON. To nie jest test DOM ani PWA.\n\nOdtworzenie: \`node inventory.mjs <repo> <katalog-wynikowy-poza-repo>\`.\n`;
mkdirSync(output, { recursive: true });
for (const [name, value] of Object.entries({ 'coverage-inventory.json': inventory,
  'raw-production-probes.json': rawProbes, 'coverage-summary.json': summary, 'reference-coverage-audit-2026-10-24.json': publicEvidence })) {
  writeFileSync(path.join(output, name), JSON.stringify(value, null, name === 'raw-production-probes.json' ? 0 : 2) + '\n');
}
writeFileSync(path.join(output, 'REPORT.md'), markdown);
for (const [name, digest] of Object.entries(inputs)) assert.equal(sha(readFileSync(path.join(repo, name))), digest);
console.log(JSON.stringify(summary, null, 2));
