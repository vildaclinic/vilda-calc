import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Regresja: pusty wzrost rodziców nie może dawać MPH = −6,5, MPH nie jest prognozą (referencja),
// a zakładka „Walidacja prognoz" kwalifikuje się tylko, gdy jest ≥1 realna prognoza (bez MPH).
// Dane fikcyjne; silnik KR podstawiony stubem.

function load(krValue = 162) {
  const win = {};
  win.calculateKhamisRochePrediction = (inp) =>
    inp && inp.motherHeightCm > 0 && inp.fatherHeightCm > 0 && inp.currentWeightKg > 0
      ? { available: true, predictedAdultHeightCm: krValue }
      : { available: false, reason: 'missing-input' };
  loadBrowserScript('vilda_growth_prediction_validation.js', win);
  return win.VildaGrowthPredictionValidation;
}

const HEIGHTS = [127, 127, 132.7, 136.2, 140.5, 144.7, 145.3, 147.5, 149];
const measurements = [113, 115, 121, 127, 133, 140, 146, 148, 150].map((am, i) => ({
  ageMonths: am, ageYears: am / 12, height: HEIGHTS[i], weight: 38 + i, boneAgeYears: null,
}));
const payload = (motherHeight = '', fatherHeight = '') => ({
  user: { sex: 'F' },
  advanced: { motherHeight, fatherHeight, data: { measurements } },
});

const REAL = ['bp', 'rwt', 'reinehr', 'khamis'];
const hasReal = (r) => r.points.some((p) => REAL.some((k) => typeof p.preds[k].value === 'number'));

describe('Walidacja prognoz — MPH i warunek pojawienia', () => {
  const API = load(162);

  it('brak wzrostu rodziców → MPH null (nie −6,5), MPH bez błędu i bez wartości', () => {
    const r = API.computeForPayload(payload());
    expect(r.ok).toBe(true);
    expect(r.mph).toBeNull();
    expect(r.points.every((p) => p.preds.mph.value === null && p.preds.mph.err === null)).toBe(true);
  });

  it('bez rodziców i wieku kostnego → brak realnych prognoz (→ kafel „za mało danych")', () => {
    expect(hasReal(API.computeForPayload(payload()))).toBe(false);
  });

  it('chip kwalifikuje się przy ≥2 punktach; przy <2 punktach nie', () => {
    expect(API.hasComputablePrediction(payload())).toBe(true); // 9 punktów
    const one = { user: { sex: 'F' }, advanced: { motherHeight: '', fatherHeight: '', data: { measurements: [measurements[0]] } } };
    expect(API.hasComputablePrediction(one)).toBe(false); // 1 punkt
  });

  it('wzrost rodziców podany → MPH jako referencja (bez błędu), KR liczalne (realna prognoza)', () => {
    const r = API.computeForPayload(payload(162, 176));
    expect(r.mph).toBeCloseTo(162.5, 5); // (162+176−13)/2 dla dziewczynki
    expect(hasReal(r)).toBe(true);
    expect(r.points.some((p) => typeof p.preds.khamis.value === 'number')).toBe(true);
    expect(r.points.every((p) => p.preds.mph.err === null)).toBe(true); // MPH nadal nie jest prognozą z błędem
  });
});
