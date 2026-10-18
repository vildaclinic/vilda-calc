import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

function api() {
  const view = {};
  loadBrowserScript('vilda_puberty_assessment.js', view);
  return view.VildaPubertyAssessment;
}
const observation = (stage = 3, extra = {}) => ({ stage, observedAtISO: '2026-10-15',
  ageMonths: 144, source: 'clinician-entry', ...extra });
function user(extra = {}) {
  return { sex: 'M', pubertyAssessment: { version: 1, sex: 'M', observations: {
    G: observation(), Th: null, P: observation(2)
  } }, ...extra };
}
const options = (extra = {}) => ({ sex: 'M', currentAgeMonths: 144, measuredAtISO: '2026-10-15', ...extra });
const marker = (extra = {}) => ({ version: 1, visitId: 'synthetic-visit', ownerPatientId: null,
  currentAxes: ['G', 'P'], reference: { sex: 'M', ageMonths: 144, measuredAtISO: '2026-10-15' }, ...extra });

describe('one clinical qualification of separate puberty observations', () => {
  it('a date, matching age and clinician source alone do not confirm the active visit', () => {
    const result = api().gonadalContext(user(), options());
    expect(result).toMatchObject({ kind: 'G', stage: null, current: false, usableForGrowth: true, reason: 'historical' });
  });
  it('an explicit matching visit marker qualifies G and preserves the P observation separately', () => {
    const data = user({ pubertyAssessmentVisit: marker() });
    expect(api().gonadalContext(data, options())).toMatchObject({ kind: 'G', stage: 3, current: true });
    expect(api().resolveAxis(data, 'P', options())).toMatchObject({ kind: 'P', stage: 2, current: true });
  });
  it('editing P membership cannot confirm a previous G observation', () => {
    const data = user({ pubertyAssessmentVisit: marker({ currentAxes: ['P'] }) });
    expect(api().gonadalContext(data, options()).stage).toBeNull();
    expect(api().resolveAxis(data, 'P', options()).stage).toBe(2);
  });
  it.each([{}, { pubertyAssessment: null }, { pubertyAssessment: { version: 2 } }])(
    'legacy or unknown schema %j never provides a gonadal stage', extra => {
      const data = { sex: 'M', tannerStage: 5, ...extra };
      expect(api().gonadalContext(data, options({ scope: 'growth' })).stage).toBeNull();
    });
  it('P5 alone does not create G or Th', () => {
    const data = user();
    data.pubertyAssessment.observations.G = null;
    data.pubertyAssessment.observations.P.stage = 5;
    expect(api().gonadalContext(data, options({ scope: 'growth' })).stage).toBeNull();
  });
  it.each([[12, 3], [12.001, null]])('preserves the inclusive 12-month growth policy (%s months)', (elapsed, expected) => {
    const data = user();
    data.pubertyAssessment.observations.G.observedAtISO = null;
    expect(api().gonadalContext(data, options({ currentAgeMonths: 144 + elapsed, scope: 'growth' })).stage).toBe(expected);
  });
  it.each([{ ageMonths: 145 }, { observedAtISO: '2026-10-16' }])('future observation %j is not usable despite a marker', extra => {
    const data = user({ pubertyAssessmentVisit: marker() });
    Object.assign(data.pubertyAssessment.observations.G, extra);
    expect(api().gonadalContext(data, options({ scope: 'growth' }))).toMatchObject({ stage: null, reason: 'future' });
  });
  it('an old date cannot be made fresh by matching reported ages', () => {
    const data = user({ pubertyAssessmentVisit: marker() });
    data.pubertyAssessment.observations.G.observedAtISO = '2024-10-15';
    expect(api().gonadalContext(data, options({ scope: 'growth' }))).toMatchObject({ stage: null, reason: 'stale' });
  });
  it('a historical observation without time cannot establish freshness', () => {
    const data = user();
    Object.assign(data.pubertyAssessment.observations.G, { ageMonths: null, observedAtISO: null });
    expect(api().gonadalContext(data, options({ scope: 'growth' }))).toMatchObject({ stage: null, reason: 'unknown-time' });
  });
  it('an explicit same-visit choice works without invented age or date', () => {
    const data = user({ pubertyAssessmentVisit: marker({ reference: { sex: 'M', ageMonths: null, measuredAtISO: null } }) });
    Object.assign(data.pubertyAssessment.observations.G, { ageMonths: null, observedAtISO: null });
    expect(api().gonadalContext(data, options({ currentAgeMonths: null, measuredAtISO: null })))
      .toMatchObject({ stage: 3, current: true, ageMonths: null, observedAtISO: null });
  });
  it('filling a previously unknown date does not invent a different visit or redate the observation', () => {
    const data = user({ pubertyAssessmentVisit: marker({ reference: { sex: 'M', ageMonths: 144, measuredAtISO: null } }) });
    data.pubertyAssessment.observations.G.observedAtISO = null;
    expect(api().gonadalContext(data, options())).toMatchObject({ stage: 3, current: true, observedAtISO: null });
  });
  it.each([[144.07, true], [144.999, true], [145, false], [146.5, false]])(
    'an exact age of %s months against 144 completed months is the same visit: %s (P-POKWITANIE-WIZYTA)', (age, current) => {
      const data = user({ pubertyAssessmentVisit: marker() });
      expect(api().gonadalContext(data, options({ currentAgeMonths: age }))).toMatchObject({ current, stage: current ? 3 : null });
    });
  it('known changed visit coordinates and patient owner reject current membership', () => {
    const data = user({ pubertyAssessmentVisit: marker() });
    expect(api().gonadalContext(data, options({ currentAgeMonths: 145 })).stage).toBeNull();
    expect(api().gonadalContext(data, options({ measuredAtISO: '2026-10-16' })).stage).toBeNull();
    expect(api().gonadalContext(data, options({ patientId: 'synthetic-other-patient' })).stage).toBeNull();
  });
  it('source sex per axis survives a later edit for another sex', () => {
    const data = user({ sex: 'F', pubertyAssessmentVisit: marker({ currentAxes: ['Th'],
      reference: { sex: 'F', ageMonths: 144, measuredAtISO: '2026-10-15' } }) });
    data.pubertyAssessment.sex = 'F';
    data.pubertyAssessment.observations.G.sex = 'M';
    data.pubertyAssessment.observations.P.sex = 'M';
    data.pubertyAssessment.observations.Th = observation(2, { sex: 'F' });
    expect(api().gonadalContext(data, options({ sex: 'F' }))).toMatchObject({ kind: 'Th', stage: 2 });
    expect(api().resolveAxis(data, 'P', options({ sex: 'F' }))).toMatchObject({ stage: null, reason: 'sex-mismatch' });
    expect(api().readUser(data).assessment.observations.G.sex).toBe('M');
  });
  it('qualification leaves the raw assessment and visit metadata untouched', () => {
    const data = user({ pubertyAssessmentVisit: marker() }), before = JSON.stringify(data);
    const result = api().gonadalContext(data, options());
    result.observation.stage = 5;
    expect(JSON.stringify(data)).toBe(before);
  });
});
