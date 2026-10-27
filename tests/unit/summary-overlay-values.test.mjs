import { describe, expect, it } from 'vitest';
import { funkcjaZ, zrodlo } from '../support/silnik-bmi.mjs';

function overlay(nativeLines, rows) {
  const document = { querySelectorAll: selector => selector === '.current-summary-card' ? [] : rows };
  const fn = new Function('window', 'document', 'getFormattedProfessionalSummaryLines',
    funkcjaZ(zrodlo('inline_index_04.js'), 'getCentileSummaryOverlayLines') + '\nreturn getCentileSummaryOverlayLines;');
  return fn({}, document, () => nativeLines)();
}

describe('SUMMARY-B: chart export reads values, without presentation descriptions', () => {
  it('keeps native summary lines authoritative even when the visible card has extra descriptions', () => {
    expect(overlay(['Waga: 44 kg, 57 centyl'], [{ innerText: 'Waga: 999 kg' }]))
      .toEqual([{ text: 'Waga: 44 kg, 57 centyl', bullet: true }]);
  });

  it('when the native summary is unavailable, exports only the original value from the new card', () => {
    const row = {
      innerText: 'Wzrost: 139 cm, 2 centyl Ocena: Niski wzrost.',
      querySelector: selector => selector === '.professional-summary-value' ? { textContent: 'Wzrost: 139 cm, 2 centyl' } : null,
    };
    expect(overlay([], [row])).toEqual([{ text: 'Wzrost: 139 cm, 2 centyl', bullet: true }]);
  });

  it('preserves legacy row fallback and excludes non-overlay parameters', () => {
    expect(overlay([], [{ textContent: 'BMI: 18,3 kg/m²', querySelector: () => null }, { textContent: 'Pow. ciała: 1,37 m²' }]))
      .toEqual([{ text: 'BMI: 18,3 kg/m²', bullet: true }]);
  });
});
