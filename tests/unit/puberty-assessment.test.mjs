import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

function model() {
  const window = {};
  loadBrowserScript('vilda_puberty_assessment.js', window);
  return window.VildaPubertyAssessment;
}

function assessment(overrides = {}) {
  return { version: 1, sex: 'M', observations: {
    G: { stage: 3, observedAtISO: '2026-10-01', ageMonths: 144, source: 'clinician-entry' },
    Th: null,
    P: { stage: 2, observedAtISO: null, ageMonths: 143.5, source: null }
  }, ...overrides };
}

describe('typed puberty assessment — production contract', () => {
  it.each(['M', 'F', null])('legacy Tanner stays unspecified for source sex %j', sex => {
    expect(model().readUser({ sex, tannerStage: '3' })).toEqual({
      status: 'absent', assessment: null, legacy: { kind: 'unspecified', stage: 3 }
    });
  });

  it('keeps independent axes, dates, age and unknown provenance without a derived Tanner', () => {
    const raw = assessment();
    const before = JSON.stringify(raw);
    const result = model().readUser({ pubertyAssessment: raw, tannerStage: '5' });
    expect(result).toEqual({ status: 'ready', assessment: raw, legacy: null });
    result.assessment.observations.P.stage = 4;
    expect(JSON.stringify(raw)).toBe(before);
    expect(result.assessment.observations.G.observedAtISO).toBe('2026-10-01');
    expect(result.assessment).not.toHaveProperty('tannerStage');
  });

  it('P alone never creates G or Th; missing slots are authoritatively unassessed', () => {
    expect(model().readUser({ pubertyAssessment: assessment({ observations: { P: { stage: 3 } } }), tannerStage: 4 }))
      .toEqual({ status: 'ready', assessment: {
        version: 1, sex: 'M', observations: { G: null, Th: null, P: {
          stage: 3, observedAtISO: null, ageMonths: null, source: null
        } }
      }, legacy: null });
  });

  it('explicitly empty assessment cannot resurrect old generic Tanner', () => {
    expect(model().readUser({ pubertyAssessment: assessment({ observations: {} }), tannerStage: '3' }))
      .toEqual({ status: 'ready', assessment: assessment({ observations: { G: null, Th: null, P: null } }), legacy: null });
  });

  it.each([null, false, '', [], {}, { version: '1' }, { version: 0 }, { version: 1 },
    assessment({ sex: 'unknown' }), assessment({ observations: [] })])('malformed presence %j never enables legacy fallback', raw => {
    expect(model().readUser({ pubertyAssessment: raw, tannerStage: 3 }))
      .toEqual({ status: 'invalid', assessment: null, legacy: null });
  });

  it('future schema remains unsupported and can be copied losslessly', () => {
    const api = model();
    const raw = { version: 2, sex: 'F', observations: { newAxis: { stage: 'unknown' } }, extra: ['preserve', null] };
    expect(api.readUser({ pubertyAssessment: raw, tannerStage: 3 }))
      .toEqual({ status: 'unsupported', assessment: null, legacy: null });
    expect(api.clone(raw)).toEqual(raw);
    expect(api.clone(raw).observations).not.toBe(raw.observations);
  });

  it.each([true, false, 0, 6, 2.5, '3', '3x', NaN, Infinity, null, undefined])('rejects non-integer stage %j without coercion', stage => {
    const raw = assessment({ observations: { G: { stage } } });
    expect(model().readUser({ pubertyAssessment: raw, tannerStage: '3' }).status).toBe('invalid');
  });

  it.each([
    { observedAtISO: '2026-02-29' }, { observedAtISO: '2026-04-31' },
    { observedAtISO: 'today' }, { observedAtISO: '2026-10-01T00:00:00Z' },
    { ageMonths: -1 }, { ageMonths: '144' }, { ageMonths: NaN },
    { source: '' }, { source: 1 }
  ])('does not manufacture valid provenance from %j', provenance => {
    expect(model().readUser({ pubertyAssessment: assessment({ observations: { G: { stage: 3, ...provenance } } }) }).status)
      .toBe('invalid');
  });

  it('accepts a real leap day and preserves source sex independently of current form sex', () => {
    const raw = assessment({ sex: 'F', observations: { Th: { stage: 2, observedAtISO: '2024-02-29' } } });
    const result = model().readUser({ sex: 'M', pubertyAssessment: raw });
    expect(result.assessment).toMatchObject({ sex: 'F', observations: {
      G: null, Th: { stage: 2, observedAtISO: '2024-02-29', ageMonths: null, source: null }, P: null
    } });
  });

  it('does not reinterpret or erase a sex-incompatible axis in the read-only view', () => {
    const raw = assessment({ sex: 'F' });
    const result = model().readUser({ pubertyAssessment: raw });
    expect(result.assessment.sex).toBe('F');
    expect(result.assessment.observations.G.stage).toBe(3);
    expect(result.assessment.observations.Th).toBeNull();
    // Applicability is the later consumer's responsibility; no clinical selector is exposed in PR1.
  });
});
