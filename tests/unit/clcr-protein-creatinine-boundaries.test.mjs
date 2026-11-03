import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
const browser = {};
for (const file of ['clcr_protein_creatinine_data.js', 'clcr_protein_creatinine.js']) loadBrowserScript(file, browser);
const engine = browser.VildaClcrProteinCreatinine;
const profile = browser.VildaClcrProteinCreatinineData.getProfile('BCR_DZM_2026_11');
const direct = (reportedValue, reportedUnit = 'mg/mg', context = {}) => engine.evaluate({ mode: 'direct', reportedValue, reportedUnit, ...context }, profile);

// Source cutoffs are transcribed independently from ARUP 0020479. Decimal
// operands ±10^-18 and the three equivalent unit forms were computed with
// Python decimal.Decimal, not the production conversion/classification code.
const boundaryCases = [
  {
    "age": 7,
    "sex": "male",
    "upper": 0.22,
    "low": 0.061,
    "value": "0.219999999999999999",
    "unit": "mg/mg",
    "expected": "normal"
  },
  {
    "age": 7,
    "sex": "male",
    "upper": 0.22,
    "low": 0.061,
    "value": "219.999999999999999000",
    "unit": "mg/g",
    "expected": "normal"
  },
  {
    "age": 7,
    "sex": "male",
    "upper": 0.22,
    "low": 0.061,
    "value": "24.88639999999999988688",
    "unit": "mg/mmol",
    "expected": "normal"
  },
  {
    "age": 7,
    "sex": "male",
    "upper": 0.22,
    "low": 0.061,
    "value": "0.220",
    "unit": "mg/mg",
    "expected": "normal"
  },
  {
    "age": 7,
    "sex": "male",
    "upper": 0.22,
    "low": 0.061,
    "value": "220.000",
    "unit": "mg/g",
    "expected": "normal"
  },
  {
    "age": 7,
    "sex": "male",
    "upper": 0.22,
    "low": 0.061,
    "value": "24.88640",
    "unit": "mg/mmol",
    "expected": "normal"
  },
  {
    "age": 7,
    "sex": "male",
    "upper": 0.22,
    "low": 0.061,
    "value": "0.220000000000000001",
    "unit": "mg/mg",
    "expected": "high"
  },
  {
    "age": 7,
    "sex": "male",
    "upper": 0.22,
    "low": 0.061,
    "value": "220.000000000000001000",
    "unit": "mg/g",
    "expected": "high"
  },
  {
    "age": 7,
    "sex": "male",
    "upper": 0.22,
    "low": 0.061,
    "value": "24.88640000000000011312",
    "unit": "mg/mmol",
    "expected": "high"
  },
  {
    "age": 7,
    "sex": "female",
    "upper": 0.548,
    "low": 0.07,
    "value": "0.547999999999999999",
    "unit": "mg/mg",
    "expected": "normal"
  },
  {
    "age": 7,
    "sex": "female",
    "upper": 0.548,
    "low": 0.07,
    "value": "547.999999999999999000",
    "unit": "mg/g",
    "expected": "normal"
  },
  {
    "age": 7,
    "sex": "female",
    "upper": 0.548,
    "low": 0.07,
    "value": "61.98975999999999988688",
    "unit": "mg/mmol",
    "expected": "normal"
  },
  {
    "age": 7,
    "sex": "female",
    "upper": 0.548,
    "low": 0.07,
    "value": "0.548",
    "unit": "mg/mg",
    "expected": "normal"
  },
  {
    "age": 7,
    "sex": "female",
    "upper": 0.548,
    "low": 0.07,
    "value": "548.000",
    "unit": "mg/g",
    "expected": "normal"
  },
  {
    "age": 7,
    "sex": "female",
    "upper": 0.548,
    "low": 0.07,
    "value": "61.98976",
    "unit": "mg/mmol",
    "expected": "normal"
  },
  {
    "age": 7,
    "sex": "female",
    "upper": 0.548,
    "low": 0.07,
    "value": "0.548000000000000001",
    "unit": "mg/mg",
    "expected": "high"
  },
  {
    "age": 7,
    "sex": "female",
    "upper": 0.548,
    "low": 0.07,
    "value": "548.000000000000001000",
    "unit": "mg/g",
    "expected": "high"
  },
  {
    "age": 7,
    "sex": "female",
    "upper": 0.548,
    "low": 0.07,
    "value": "61.98976000000000011312",
    "unit": "mg/mmol",
    "expected": "high"
  },
  {
    "age": 10,
    "sex": "male",
    "upper": 0.22,
    "low": 0.059,
    "value": "0.219999999999999999",
    "unit": "mg/mg",
    "expected": "normal"
  },
  {
    "age": 10,
    "sex": "male",
    "upper": 0.22,
    "low": 0.059,
    "value": "219.999999999999999000",
    "unit": "mg/g",
    "expected": "normal"
  },
  {
    "age": 10,
    "sex": "male",
    "upper": 0.22,
    "low": 0.059,
    "value": "24.88639999999999988688",
    "unit": "mg/mmol",
    "expected": "normal"
  },
  {
    "age": 10,
    "sex": "male",
    "upper": 0.22,
    "low": 0.059,
    "value": "0.220",
    "unit": "mg/mg",
    "expected": "normal"
  },
  {
    "age": 10,
    "sex": "male",
    "upper": 0.22,
    "low": 0.059,
    "value": "220.000",
    "unit": "mg/g",
    "expected": "normal"
  },
  {
    "age": 10,
    "sex": "male",
    "upper": 0.22,
    "low": 0.059,
    "value": "24.88640",
    "unit": "mg/mmol",
    "expected": "normal"
  },
  {
    "age": 10,
    "sex": "male",
    "upper": 0.22,
    "low": 0.059,
    "value": "0.220000000000000001",
    "unit": "mg/mg",
    "expected": "high"
  },
  {
    "age": 10,
    "sex": "male",
    "upper": 0.22,
    "low": 0.059,
    "value": "220.000000000000001000",
    "unit": "mg/g",
    "expected": "high"
  },
  {
    "age": 10,
    "sex": "male",
    "upper": 0.22,
    "low": 0.059,
    "value": "24.88640000000000011312",
    "unit": "mg/mmol",
    "expected": "high"
  },
  {
    "age": 10,
    "sex": "female",
    "upper": 0.334,
    "low": 0.057,
    "value": "0.333999999999999999",
    "unit": "mg/mg",
    "expected": "normal"
  },
  {
    "age": 10,
    "sex": "female",
    "upper": 0.334,
    "low": 0.057,
    "value": "333.999999999999999000",
    "unit": "mg/g",
    "expected": "normal"
  },
  {
    "age": 10,
    "sex": "female",
    "upper": 0.334,
    "low": 0.057,
    "value": "37.78207999999999988688",
    "unit": "mg/mmol",
    "expected": "normal"
  },
  {
    "age": 10,
    "sex": "female",
    "upper": 0.334,
    "low": 0.057,
    "value": "0.334",
    "unit": "mg/mg",
    "expected": "normal"
  },
  {
    "age": 10,
    "sex": "female",
    "upper": 0.334,
    "low": 0.057,
    "value": "334.000",
    "unit": "mg/g",
    "expected": "normal"
  },
  {
    "age": 10,
    "sex": "female",
    "upper": 0.334,
    "low": 0.057,
    "value": "37.78208",
    "unit": "mg/mmol",
    "expected": "normal"
  },
  {
    "age": 10,
    "sex": "female",
    "upper": 0.334,
    "low": 0.057,
    "value": "0.334000000000000001",
    "unit": "mg/mg",
    "expected": "high"
  },
  {
    "age": 10,
    "sex": "female",
    "upper": 0.334,
    "low": 0.057,
    "value": "334.000000000000001000",
    "unit": "mg/g",
    "expected": "high"
  },
  {
    "age": 10,
    "sex": "female",
    "upper": 0.334,
    "low": 0.057,
    "value": "37.78208000000000011312",
    "unit": "mg/mmol",
    "expected": "high"
  },
  {
    "age": 13,
    "sex": "male",
    "upper": 0.371,
    "low": 0.041,
    "value": "0.370999999999999999",
    "unit": "mg/mg",
    "expected": "normal"
  },
  {
    "age": 13,
    "sex": "male",
    "upper": 0.371,
    "low": 0.041,
    "value": "370.999999999999999000",
    "unit": "mg/g",
    "expected": "normal"
  },
  {
    "age": 13,
    "sex": "male",
    "upper": 0.371,
    "low": 0.041,
    "value": "41.96751999999999988688",
    "unit": "mg/mmol",
    "expected": "normal"
  },
  {
    "age": 13,
    "sex": "male",
    "upper": 0.371,
    "low": 0.041,
    "value": "0.371",
    "unit": "mg/mg",
    "expected": "normal"
  },
  {
    "age": 13,
    "sex": "male",
    "upper": 0.371,
    "low": 0.041,
    "value": "371.000",
    "unit": "mg/g",
    "expected": "normal"
  },
  {
    "age": 13,
    "sex": "male",
    "upper": 0.371,
    "low": 0.041,
    "value": "41.96752",
    "unit": "mg/mmol",
    "expected": "normal"
  },
  {
    "age": 13,
    "sex": "male",
    "upper": 0.371,
    "low": 0.041,
    "value": "0.371000000000000001",
    "unit": "mg/mg",
    "expected": "high"
  },
  {
    "age": 13,
    "sex": "male",
    "upper": 0.371,
    "low": 0.041,
    "value": "371.000000000000001000",
    "unit": "mg/g",
    "expected": "high"
  },
  {
    "age": 13,
    "sex": "male",
    "upper": 0.371,
    "low": 0.041,
    "value": "41.96752000000000011312",
    "unit": "mg/mmol",
    "expected": "high"
  },
  {
    "age": 13,
    "sex": "female",
    "upper": 0.307,
    "low": 0.033,
    "value": "0.306999999999999999",
    "unit": "mg/mg",
    "expected": "normal"
  },
  {
    "age": 13,
    "sex": "female",
    "upper": 0.307,
    "low": 0.033,
    "value": "306.999999999999999000",
    "unit": "mg/g",
    "expected": "normal"
  },
  {
    "age": 13,
    "sex": "female",
    "upper": 0.307,
    "low": 0.033,
    "value": "34.72783999999999988688",
    "unit": "mg/mmol",
    "expected": "normal"
  },
  {
    "age": 13,
    "sex": "female",
    "upper": 0.307,
    "low": 0.033,
    "value": "0.307",
    "unit": "mg/mg",
    "expected": "normal"
  },
  {
    "age": 13,
    "sex": "female",
    "upper": 0.307,
    "low": 0.033,
    "value": "307.000",
    "unit": "mg/g",
    "expected": "normal"
  },
  {
    "age": 13,
    "sex": "female",
    "upper": 0.307,
    "low": 0.033,
    "value": "34.72784",
    "unit": "mg/mmol",
    "expected": "normal"
  },
  {
    "age": 13,
    "sex": "female",
    "upper": 0.307,
    "low": 0.033,
    "value": "0.307000000000000001",
    "unit": "mg/mg",
    "expected": "high"
  },
  {
    "age": 13,
    "sex": "female",
    "upper": 0.307,
    "low": 0.033,
    "value": "307.000000000000001000",
    "unit": "mg/g",
    "expected": "high"
  },
  {
    "age": 13,
    "sex": "female",
    "upper": 0.307,
    "low": 0.033,
    "value": "34.72784000000000011312",
    "unit": "mg/mmol",
    "expected": "high"
  },
  {
    "age": 16,
    "sex": "male",
    "upper": 0.242,
    "low": 0.031,
    "value": "0.241999999999999999",
    "unit": "mg/mg",
    "expected": "normal"
  },
  {
    "age": 16,
    "sex": "male",
    "upper": 0.242,
    "low": 0.031,
    "value": "241.999999999999999000",
    "unit": "mg/g",
    "expected": "normal"
  },
  {
    "age": 16,
    "sex": "male",
    "upper": 0.242,
    "low": 0.031,
    "value": "27.37503999999999988688",
    "unit": "mg/mmol",
    "expected": "normal"
  },
  {
    "age": 16,
    "sex": "male",
    "upper": 0.242,
    "low": 0.031,
    "value": "0.242",
    "unit": "mg/mg",
    "expected": "normal"
  },
  {
    "age": 16,
    "sex": "male",
    "upper": 0.242,
    "low": 0.031,
    "value": "242.000",
    "unit": "mg/g",
    "expected": "normal"
  },
  {
    "age": 16,
    "sex": "male",
    "upper": 0.242,
    "low": 0.031,
    "value": "27.37504",
    "unit": "mg/mmol",
    "expected": "normal"
  },
  {
    "age": 16,
    "sex": "male",
    "upper": 0.242,
    "low": 0.031,
    "value": "0.242000000000000001",
    "unit": "mg/mg",
    "expected": "high"
  },
  {
    "age": 16,
    "sex": "male",
    "upper": 0.242,
    "low": 0.031,
    "value": "242.000000000000001000",
    "unit": "mg/g",
    "expected": "high"
  },
  {
    "age": 16,
    "sex": "male",
    "upper": 0.242,
    "low": 0.031,
    "value": "27.37504000000000011312",
    "unit": "mg/mmol",
    "expected": "high"
  },
  {
    "age": 16,
    "sex": "female",
    "upper": 0.329,
    "low": 0.036,
    "value": "0.328999999999999999",
    "unit": "mg/mg",
    "expected": "normal"
  },
  {
    "age": 16,
    "sex": "female",
    "upper": 0.329,
    "low": 0.036,
    "value": "328.999999999999999000",
    "unit": "mg/g",
    "expected": "normal"
  },
  {
    "age": 16,
    "sex": "female",
    "upper": 0.329,
    "low": 0.036,
    "value": "37.21647999999999988688",
    "unit": "mg/mmol",
    "expected": "normal"
  },
  {
    "age": 16,
    "sex": "female",
    "upper": 0.329,
    "low": 0.036,
    "value": "0.329",
    "unit": "mg/mg",
    "expected": "normal"
  },
  {
    "age": 16,
    "sex": "female",
    "upper": 0.329,
    "low": 0.036,
    "value": "329.000",
    "unit": "mg/g",
    "expected": "normal"
  },
  {
    "age": 16,
    "sex": "female",
    "upper": 0.329,
    "low": 0.036,
    "value": "37.21648",
    "unit": "mg/mmol",
    "expected": "normal"
  },
  {
    "age": 16,
    "sex": "female",
    "upper": 0.329,
    "low": 0.036,
    "value": "0.329000000000000001",
    "unit": "mg/mg",
    "expected": "high"
  },
  {
    "age": 16,
    "sex": "female",
    "upper": 0.329,
    "low": 0.036,
    "value": "329.000000000000001000",
    "unit": "mg/g",
    "expected": "high"
  },
  {
    "age": 16,
    "sex": "female",
    "upper": 0.329,
    "low": 0.036,
    "value": "37.21648000000000011312",
    "unit": "mg/mmol",
    "expected": "high"
  }
];

describe('B/Cr DZM — all ARUP upper endpoints before any display rounding', () => {
  it.each(boundaryCases)('$age $sex: $value $unit => $expected', test => {
    const r = direct(test.value, test.unit, { ageYears: test.age, sex: test.sex });
    expect(r).toMatchObject({ valid: true, assessment: test.expected, outOfRange: test.expected === 'high', category: null,
      reference: { high: test.upper, low: null, sourceLow: test.low, sourceHigh: test.upper, upperInclusive: true, label: 'Górna granica normy', sublabel: 'Dla wieku i płci' } });
    expect(r.rawValue).toBeCloseTo(test.upper, 14);
  });
  it('does not create a clinical low alarm below the source lower bound', () => {
    const r = direct('.001', 'mg/mg', { ageYears: 8, sex: 'female' });
    expect(r).toMatchObject({ assessment: 'normal', statusText: 'B/Cr niepodwyższony', outOfRange: false, reference: { low: null, sourceLow: .07, high: .548 } });
  });
  it('does not assume girls always have the higher boundary', () => {
    expect(direct('.33', 'mg/mg', { ageYears: 14, sex: 'female' })).toMatchObject({ assessment: 'high', reference: { high: .307 } });
    expect(direct('.33', 'mg/mg', { ageYears: 14, sex: 'male' })).toMatchObject({ assessment: 'normal', reference: { high: .371 } });
  });
});

describe('B/Cr DZM — adult KDIGO strict first boundary and inclusive middle upper boundary', () => {
  it.each([
    ['.149999999999999999', 'normal', 'normal-mild'], ['.15', 'high', 'moderate'], ['.150000000000000001', 'high', 'moderate'],
    ['.499999999999999999', 'high', 'moderate'], ['.5', 'high', 'moderate'], ['.500000000000000001', 'high', 'severe'],
  ])('%s mg/mg => %s / %s', (value, state, category) => {
    expect(direct(value, 'mg/mg', { ageYears: 18 })).toMatchObject({ assessment: state, category: { id: category }, reference: { high: .15, upperInclusive: false, label: 'Zakres wg KDIGO', kind: 'clinical-comparison' } });
  });
  it.each([['150', 'mg/g'], ['16.968', 'mg/mmol'], ['.15', 'mg/mg']])('exact threshold %s %s is moderate regardless of units', (value, unit) => {
    expect(direct(value, unit, { ageYears: 60 })).toMatchObject({ rawValue: .15, exactValue: { numerator: '3', denominator: '20' }, assessment: 'high', category: { id: 'moderate' } });
  });
  it('does not replace exact unit conversion by the pragmatically rounded SI column', () => {
    expect(direct('15', 'mg/mmol', { ageYears: 30 })).toMatchObject({ assessment: 'normal', category: { id: 'normal-mild' } });
    expect(direct('16.968000000000001', 'mg/mmol', { ageYears: 30 }).assessment).toBe('high');
  });
  it('normal adult phrase differs deliberately from pediatric upper-limit comparison', () => {
    expect(direct('.1', 'mg/mg', { ageYears: 18 })).toMatchObject({ statusText: 'Prawidłowy lub łagodnie zwiększony B/Cr', reference: { sex: 'any' } });
    expect(direct('.16', 'mg/mg', { ageYears: 18 })).toMatchObject({ statusText: 'Podwyższony B/Cr', tone: 'warning' });
  });
});

describe('B/Cr DZM — exact age mapping, sex and missing coverage', () => {
  it.each([
    [6.999999, null], [7, .548], [9.999999, .548], [10, .334], [12.999999, .334],
    [13, .307], [15.999999, .307], [16, .329], [17.999999, .329], [18, .15], [105, .15],
  ])('age %s selects upper %s without interpolation or rounding up', (ageYears, upper) => {
    const r = direct('.3', 'mg/mg', { ageYears, sex: 'female' });
    expect(r.reference?.high ?? null).toBe(upper);
    if (upper === null) expect(r).toMatchObject({ assessment: 'unassessed', outOfRange: null, reasonCode: 'age-outside-reference', message: 'Brak przyjętej normy dla DZM w tym wieku.' });
  });
  it.each(['male', 'female', null, undefined, ''])('adults do not require sex %s', sex => {
    expect(direct('.14', 'mg/mg', { ageYears: 18, sex })).toMatchObject({ assessment: 'normal', referenceAvailable: true, reference: { high: .15 } });
  });
  it('missing/invalid age or required pediatric sex keeps a numeric neutral result', () => {
    for (const ageYears of [null, '', undefined, -1, 'invalid']) expect(direct('.3', 'mg/mg', { ageYears, sex: 'female' })).toMatchObject({ valid: true, rawValue: .3, assessment: 'unassessed', reasonCode: 'missing-age', outOfRange: null });
    expect(direct('.3', 'mg/mg', { ageYears: 10 })).toMatchObject({ valid: true, reasonCode: 'missing-sex', message: 'Brak płci w danych pacjenta — wynik bez dobranej normy dla wieku i płci.' });
  });
  it('completed-year bins are exact and uncertain age cannot choose a convenient range', () => {
    expect(direct('.3', 'mg/mg', { ageYears: 17, agePrecision: 'completed-years', sex: 'female' })).toMatchObject({ assessment: 'normal', reference: { high: .329 } });
    expect(direct('.3', 'mg/mg', { ageYears: 17.5, agePrecision: 'completed-years', sex: 'female' })).toMatchObject({ assessment: 'unassessed', reference: null });
    expect(direct('.3', 'mg/mg', { ageYears: 10, agePrecision: 'uncertain', sex: 'female' })).toMatchObject({ assessment: 'unassessed', reasonCode: 'uncertain-age', outOfRange: null });
  });
});
