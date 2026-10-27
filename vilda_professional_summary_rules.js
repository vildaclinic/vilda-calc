/* Owner-approved card presentation policy, 2026-10-26 (SUMMARY-B).
 * The SDS bands are not DONALD diagnostic cut-offs. Native DONALD data and
 * height reference data remain in their existing, separately sourced modules.
 * See docs/clinical/ALGORITHMS.md, GROWTH-SUMMARY-TABS / SUMMARY-B. */
(function (w) {
  'use strict';
  w.VildaProfessionalSummaryRules = Object.freeze({
    velocitySds: Object.freeze({ dangerBelow: -1.5, normalFrom: -0.5, normalThrough: 1 }),
    prediction: Object.freeze({ referenceAgeMonths: 216, population: 'OGOLNA', sources: Object.freeze(['OLAF', 'PALCZEWSKA']) })
  });
}(typeof window !== 'undefined' ? window : globalThis));
