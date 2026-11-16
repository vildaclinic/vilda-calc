import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sgaBirthEnvironment } from '../support/sga-birth-runtime.mjs';
import { buildSgaResultStyles } from '../../tools/build-sga-result-styles.mjs';

const baseline = JSON.parse(readFileSync(new URL('../fixtures/sga-native-presentation.json', import.meta.url), 'utf8'));
describe('shared SGA presentation retains pre-extraction native outputs', () => {
  it.each(baseline.cases)('$name: actual controller keeps the complete assessment, messages and HTML', ({ input, expected }) => {
    const h = sgaBirthEnvironment();
    h.api.restoreState(input);
    h.document.getElementById('computeSgaBirth').click();
    const birth = JSON.parse(JSON.stringify(h.api.captureStateReadOnly()));
    if (birth.assessment) delete birth.assessment.computedAtISO;
    expect({ birth, html: h.document.getElementById('sgaBirthResults').textContent,
      message: h.document.getElementById('sgaBirthMessage').textContent }).toEqual(expected);
  });
  it.each(baseline.cases)('$name: draft evaluation is pure and shares the original result', ({ input, expected }) => {
    const h = sgaBirthEnvironment();
    const before = h.api.captureStateReadOnly();
    const view = h.window.VildaSgaBirth.evaluatePresentation(input);
    expect(h.api.captureStateReadOnly()).toEqual(before);
    if (expected.message) expect(view.error).toBe(expected.message);
    else {
      expect(view.error).toBeNull();
      expect(view.html).toBe(expected.html);
      const state = { ...input, hasComputed: true };
      const saved = h.window.VildaBirthAssessment.create(state, view.models, '2026-11-16T00:00:00.000Z', view.notes);
      if (saved) { const value = JSON.parse(JSON.stringify(saved)); delete value.computedAtISO; expect(value).toEqual(expected.birth.assessment); }
      else expect(expected.birth.assessment).toBeUndefined();
    }
  });
  it('keeps generated result styles identical to the authoritative DocPro subset', () => {
    expect(readFileSync(new URL('../../vilda_sga_birth_results.css', import.meta.url), 'utf8')).toBe(buildSgaResultStyles());
  });
});
