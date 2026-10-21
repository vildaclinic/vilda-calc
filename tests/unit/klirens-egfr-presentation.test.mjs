import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = loadBrowserScript('clcr_clinical_safety.js');
const safety = browser.ClcrClinicalSafety;

function present(value, overrides = {}) {
  return safety.egfrPresentation({
    value,
    age: 50,
    assay: 'enzymatic_idms',
    markerPolicy: safety.creatininePolicy('stable', false),
    ...overrides,
  });
}

describe('Klirens — prezentacja eGFR z kreatyniny', () => {
  it('opisuje rzeczywiste wyniki CKD-EPI i U25 bez zmiany wartości obliczenia', () => {
    const adultNormal = safety.computeCkdEpi2021Cr({
      sex: 'M', ageYears: 50, creatinineMgDl: 1,
    });
    const adultLow = safety.computeCkdEpi2021Cr({
      sex: 'M', ageYears: 50, creatinineMgDl: 3,
    });
    const childLow = safety.computeCkidU25Creatinine({
      sex: 'F', ageYears: 10, heightCm: 140, creatinineMgDl: 0.6,
    });

    expect(adultNormal).toBeCloseTo(91.6914786098, 9);
    expect(adultLow).toBeCloseTo(24.5348535798, 9);
    expect(childLow).toBeCloseTo(82.9016019988, 9);
    expect(present(adultNormal)).toMatchObject({
      state: 'classified', valueVisible: true,
      label: 'Nieobniżony', tone: 'success', category: { code: 'G1' },
    });
    expect(present(adultLow)).toMatchObject({
      state: 'classified', valueVisible: true,
      label: 'Znacznie zmniejszony', tone: 'danger', category: { code: 'G4' },
    });
    expect(present(childLow, { age: 10 })).toMatchObject({
      state: 'classified', valueVisible: true,
      label: 'Obniżony dla wieku', tone: 'warning', category: { code: 'G2' },
    });
  });

  it.each([
    [90, 'G1', 'success'],
    [89.8, 'G2', 'warning'],
    [60, 'G2', 'warning'],
    [59.8, 'G3a', 'warning'],
    [45, 'G3a', 'warning'],
    [44.8, 'G3b', 'danger'],
    [30, 'G3b', 'danger'],
    [29.8, 'G4', 'danger'],
    [15, 'G4', 'danger'],
    [14.8, 'G5', 'danger'],
    [0, 'G5', 'danger'],
  ])('wartość surowa %s zachowuje kategorię %s i ton %s', (value, code, tone) => {
    const result = present(value);
    expect(result).toMatchObject({
      state: 'classified', valueVisible: true, category: { code }, tone,
    });
    expect(result.category).toEqual(safety.kdigoGCategory(value));
  });

  it.each([
    [59.8, '60', '<60', 'G3a'],
    [89.8, '90', '<90', 'G2'],
  ])('zaokrąglenie %s nie podnosi kategorii prezentera', (value, rounded, raw, code) => {
    const display = safety.formatGfrForDisplay(value);
    const result = present(value);
    expect(display).toMatchObject({ rounded, raw, crossesCategoryBoundary: true });
    expect(result.category.code).toBe(code);
    expect(result.category).toEqual(display.category);
    expect(result.tone).toBe('warning');
  });

  it.each([1, 1.5, 1.999])('nie stosuje progu 90 ani kategorii G przy wieku %s', age => {
    expect(present(83, { age })).toMatchObject({
      state: 'age-specific', valueVisible: true,
      tone: 'neutral', category: null,
    });
    expect(present(83, { age }).label).not.toContain('Obniżony');
  });

  it.each([2, 10, 17.999])('przy wieku %s nazywa wynik <90 obniżonym dla wieku', age => {
    expect(present(89.8, { age })).toMatchObject({
      state: 'classified', label: 'Obniżony dla wieku',
      tone: 'warning', category: { code: 'G2' },
    });
    expect(present(90, { age })).toMatchObject({
      state: 'classified', label: 'Nieobniżony',
      tone: 'success', category: { code: 'G1' },
    });
  });

  it('od 18 lat używa opisu dorosłego zamiast pediatrycznej flagi', () => {
    expect(present(83, { age: 18 })).toMatchObject({
      state: 'classified', label: 'Łagodnie zmniejszony',
      tone: 'warning', category: { code: 'G2' },
    });
  });

  it.each(['', 'not_idms'])('nie koloruje klinicznie wyniku przy niepotwierdzonym IDMS (%s)', assay => {
    const result = present(25, { assay });
    expect(result).toMatchObject({
      state: 'limited', valueVisible: true,
      label: 'Interpretacja ograniczona', tone: 'neutral', category: null,
    });
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(JSON.stringify(result.reasons)).toMatch(/IDMS/i);
  });

  it('akceptuje potwierdzoną kalibrację IDMS metody Jaffego', () => {
    expect(present(25, { assay: 'jaffe_idms' })).toMatchObject({
      state: 'classified', tone: 'danger', category: { code: 'G4' },
    });
  });

  it('przy nieznanej stabilności zachowuje liczbę bez kategorii i oceny prawidłowości', () => {
    const result = present(25, {
      markerPolicy: safety.creatininePolicy('unknown', false),
    });
    expect(result).toMatchObject({
      state: 'limited', valueVisible: true,
      label: 'Interpretacja ograniczona', tone: 'neutral', category: null,
    });
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it.each([
    ['rapidlyChanging', false],
    ['stable', true],
    ['unknown', true],
  ])('blokada markerów (%s, AKI=%s) usuwa również uprzednio obliczoną liczbę', (state, aki) => {
    expect(present(25, {
      markerPolicy: safety.creatininePolicy(state, aki),
    })).toMatchObject({
      state: 'blocked', valueVisible: false, category: null,
    });
  });

  it.each([null, undefined, NaN, Infinity, -1])('nie interpretuje brakującego lub nieprawidłowego wyniku %s', value => {
    expect(present(value)).toMatchObject({
      state: 'missing', valueVisible: false, category: null,
    });
  });

  it('kolektor historii używa jawnej liczby z nowej karty zamiast 1,73 z jednostki', () => {
    const global = loadBrowserScript('clcr_ui_workflow.js');
    function element(series, raw, text, displayed) {
      return {
        textContent: text,
        getAttribute(name) {
          if (name === 'data-clcr-series') return series;
          if (name === 'data-clcr-value') return String(raw);
          if (name === 'data-clcr-display-value') return displayed;
          return null;
        },
        getClientRects: () => [{ width: 100, height: 100 }],
      };
    }
    const root = {
      querySelectorAll: () => [
        element('egfr', 1.8, 'Zakres niewydolności nerek G5 2 ml/min/1,73 m²', '2'),
        element('ckid_u25', 83.1, 'CKiD U25: 83 ml/min/1,73 m²', null),
      ],
    };
    const points = global.ClcrVisitSave.collectActiveDatapoints(root);
    expect(points).toHaveLength(2);
    expect(points[0]).toMatchObject({
      sourceFormulaId: 'egfr', valueNum: 2, unit: 'mL/min/1,73 m²',
    });
    expect(points[1]).toMatchObject({
      sourceFormulaId: 'ckid_u25', valueNum: 83, unit: 'mL/min/1,73 m²',
    });
  });
});
