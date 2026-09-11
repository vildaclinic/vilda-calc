import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Silnik Blum/ISS (vilda_blum_iss.js) — Blum i wsp., J Endocr Soc 2022;6(7):bvac074,
// DOI 10.1210/jendso/bvac074 (PMC9155597). To NIE jest strażnik regresji (silnik jest nowy), tylko
// kontrola poprawności przepisania współczynników: przykład liczbowy Z PRACY musi się zgadzać
// co do 0,1 cm dla czterech równań (M2, M5, M8, M10), a bramki stosowalności muszą odmawiać
// dokładnie tam, gdzie autorzy zastrzegli (dzieci nie-niskie, brak modelu bez rodziców i BA).

function load() {
  const win = {};
  loadBrowserScript('vilda_blum_iss.js', win);
  return win;
}
// Przykład z pracy: chłopiec 10,0 l, 123,0 cm, matka 167,5, ojciec 180,5 (TH 174,0), BA 8,0 → BA/CA 0,80.
const PRZYKLAD = { sex: 'M', chronologicalAgeYears: 10.0, currentHeightCm: 123.0, heightSds: -2.3, boneAgeYears: 8.0 };

describe('Blum/ISS — przykład liczbowy z pracy (tabela 2 + „Calculation of Predicted Adult Height”)', () => {
  const win = load();
  const f = win.calculateBlumIssPrediction;
  it('M2 (oboje rodzice, BA): 165,9 cm', () => {
    const r = f({ ...PRZYKLAD, motherHeightCm: 167.5, fatherHeightCm: 180.5 });
    expect(r.available).toBe(true);
    expect(r.modelId).toBe(2);
    expect(r.predictedAdultHeightCm).toBeCloseTo(165.9, 1);
    expect(r.targetHeightCm).toBeCloseTo(174.0, 1); // prosta średnia rodziców — jak w przykładzie pracy
    expect(r.usedBoneAge).toBe(true);
    expect(r.errorBoundHalfWidthCm).toBeCloseTo(3.30 * 1.645, 1);
  });
  it('M5 (tylko matka, BA): 166,8 cm', () => {
    const r = f({ ...PRZYKLAD, motherHeightCm: 167.5 });
    expect(r.modelId).toBe(5);
    expect(r.predictedAdultHeightCm).toBeCloseTo(166.8, 1);
  });
  it('M8 (tylko ojciec, BA): 168,6 cm', () => {
    const r = f({ ...PRZYKLAD, fatherHeightCm: 180.5 });
    expect(r.modelId).toBe(8);
    expect(r.predictedAdultHeightCm).toBeCloseTo(168.6, 1);
  });
  it('M10 (bez rodziców, BA): 165,2 cm', () => {
    const r = f({ ...PRZYKLAD });
    expect(r.modelId).toBe(10);
    expect(r.predictedAdultHeightCm).toBeCloseTo(165.2, 1);
  });
  it('M1 z masą urodzeniową i M3/M6/M9 bez wieku kostnego dobierają się automatycznie', () => {
    expect(f({ ...PRZYKLAD, motherHeightCm: 167.5, fatherHeightCm: 180.5, birthWeightKg: 3.2 }).modelId).toBe(1);
    const m3 = f({ ...PRZYKLAD, boneAgeYears: null, motherHeightCm: 167.5, fatherHeightCm: 180.5 });
    expect(m3.modelId).toBe(3);
    expect(m3.usedBoneAge).toBe(false);
    expect(f({ ...PRZYKLAD, boneAgeYears: null, motherHeightCm: 167.5 }).modelId).toBe(6);
    expect(f({ ...PRZYKLAD, boneAgeYears: null, fatherHeightCm: 180.5 }).modelId).toBe(9);
  });
  it('wiek w miesiącach ma pierwszeństwo i NIE sumuje się z latami (120 mies. = 10 l)', () => {
    const a = f({ ...PRZYKLAD, chronologicalAgeMonths: 120, chronologicalAgeYears: 10, motherHeightCm: 167.5, fatherHeightCm: 180.5 });
    expect(a.predictedAdultHeightCm).toBeCloseTo(165.9, 1);
  });
});

describe('Blum/ISS — bramki stosowalności (zastrzeżenia autorów)', () => {
  const f = load().calculateBlumIssPrediction;
  it('dziecko nie-niskie (hSDS > −1,28) → niedostępne, bez ekstrapolacji', () => {
    expect(f({ ...PRZYKLAD, heightSds: -1.0, motherHeightCm: 167.5, fatherHeightCm: 180.5 })).toMatchObject({ available: false, reason: 'not-short-stature' });
    expect(f({ ...PRZYKLAD, heightSds: -1.28, motherHeightCm: 167.5, fatherHeightCm: 180.5 }).available).toBe(true);
  });
  it('brak hSDS → niedostępne (silnik nie zgaduje niskorosłości)', () => {
    expect(f({ ...PRZYKLAD, heightSds: null, motherHeightCm: 167.5, fatherHeightCm: 180.5 })).toMatchObject({ available: false, reason: 'missing-height-sds' });
  });
  it('bez rodziców i bez wieku kostnego nie ma równania', () => {
    expect(f({ ...PRZYKLAD, boneAgeYears: null })).toMatchObject({ available: false, reason: 'no-model' });
  });
  it('wiek poza 4–17 l → out-of-range', () => {
    expect(f({ ...PRZYKLAD, chronologicalAgeYears: 3.5 })).toMatchObject({ available: false, reason: 'out-of-range' });
    expect(f({ ...PRZYKLAD, chronologicalAgeYears: 17.5 })).toMatchObject({ available: false, reason: 'out-of-range' });
  });
  it('płeć koduje się 1/2: dziewczynka o tych samych danych niżej o (β_sex)', () => {
    const b = f({ ...PRZYKLAD, motherHeightCm: 167.5, fatherHeightCm: 180.5 });
    const g = f({ ...PRZYKLAD, sex: 'F', motherHeightCm: 167.5, fatherHeightCm: 180.5 });
    expect(b.predictedAdultHeightCm - g.predictedAdultHeightCm).toBeCloseTo(6.3, 1);
  });
  it('clamp do aktualnego wzrostu: wynik nie spada poniżej zmierzonego wzrostu, surowy zachowany', () => {
    const r = f({ sex: 'M', chronologicalAgeYears: 16.9, currentHeightCm: 172, heightSds: -1.5, boneAgeYears: 16.5, motherHeightCm: 150, fatherHeightCm: 160 });
    expect(r.available).toBe(true);
    expect(r.predictedAdultHeightCm).toBeGreaterThanOrEqual(172);
    if (r.clampedToCurrentHeight) expect(r.predictedAdultHeightCmRaw).toBeLessThan(172);
  });
});
