import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { funkcjaZ, tablica, zrodlo } from '../support/silnik-bmi.mjs';

// Real reference tables and real summary functions. Only the surrounding DOM
// and prediction-method fixture are synthetic; no medical equation is copied.
function setup() {
  const win = { addEventListener() {}, location: { pathname: '/' }, navigator: {}, source: 'PALCZEWSKA' };
  for (const name of ['LMS_INFANT_HEIGHT_BOYS', 'LMS_INFANT_HEIGHT_GIRLS', 'LMS_HEIGHT_WHO_BOYS', 'LMS_HEIGHT_WHO_GIRLS', 'LMS_HEIGHT_BOYS', 'LMS_HEIGHT_GIRLS']) win[name] = tablica(name);
  for (const file of ['centile_data.js', 'vilda_centile_interpolation.js', 'vilda_sds_wzrostu.js', 'hv_donald_data.js', 'vilda_height_velocity.js', 'vilda_tempo_wzrastania.js', 'vilda_trajectory_analysis.js', 'vilda_growth_prediction_lines.js', 'vilda_professional_summary_rules.js', 'vilda_centile_live_colors.js', 'vilda_professional_summary.js']) loadBrowserScript(file, win);
  win.VildaSdsWzrostu.ustawDane({ palCentyl: (sex, months, centile) => win.VildaCentileInterp.palCentileValue(sex, months, centile, 'HT') });
  win.advHistoryResolveMetric = (metric, value, sex, ageYears, source) => {
    if (metric !== 'HT') return null;
    const actual = win.VildaSdsWzrostu.policz({ wzrost: value, plec: sex, wiekMies: ageYears * 12, zrodlo: source });
    return actual ? { result: { percentile: actual.centyl, sd: actual.sds }, source: actual.siatka } : null;
  };
  return win;
}
function row(win, key, lines, assessmentData, isChild = true) {
  return win.VildaProfessionalSummary.build(lines, { isChild, assessmentData }).main.find(item => item.key === key);
}
function context({ sex = 'F', source = 'PALCZEWSKA', population = 'OGOLNA', cm = 156.17044746319655, line = 'Prognoza wzrostu ostatecznego (konsensus 4 metod i MPH): 156,2 cm ±4,4 cm' } = {}) {
  return { sex, source, population, predictions: [{ cm, line, method: 'consensus' }] };
}
const sdsCases = [
  [-1.5000001, 'danger'], [-1.5, 'warn'], [-0.5000001, 'warn'], [-0.5, 'normal'],
  [0, 'normal'], [1, 'normal'], [1.0000001, 'warn'], [null, 'unknown'], [undefined, 'unknown'], [NaN, 'unknown'], [Infinity, 'unknown'], ['0.8', 'unknown'],
];

describe('SUMMARY-B: raw numeric assessments and unchanged result lines', () => {
  const win = setup();
  it.each(sdsCases)('raw SDS %s has owner-selected tone %s', (sds, tone) => {
    expect(win.VildaProfessionalSummary.velocitySdsTone(sds)).toBe(tone);
  });

  it('uses the raw SDS although the displayed rounded value is exactly on a boundary', () => {
    const line = 'SDS tempa: −0,5 (31 centyl) — wg Duran i wsp., J Pediatr Endocrinol Metab 2025';
    const result = row(win, 'velocity-sds', [line], { velocity: { text: line, sds: -0.500001 } });
    expect(result).toMatchObject({ tone: 'warn', assessment: 'abnormal', original: line, text: 'SDS tempa: −0,5 (31 centyl)' });
    expect(row(win, 'velocity-sds', [line], { velocity: { text: line, sds: -0.5 } }).tone).toBe('normal');
  });

  it('does not take the SDS from an unrelated line, missing value, or adult record', () => {
    const line = 'SDS tempa: +0,8 (80 centyl) — wg Duran i wsp., J Pediatr Endocrinol Metab 2025';
    for (const data of [{ velocity: { text: 'SDS tempa: −2,4 (<1 centyl)', sds: -2.4 } }, { velocity: { text: line, sds: null } }, null]) {
      expect(row(win, 'velocity-sds', [line], data).assessment).toBe('unassessed');
    }
    expect(row(win, 'velocity-sds', [line], { velocity: { text: line, sds: .8 } }, false).assessment).toBe('unassessed');
  });

  it.each(['OLAF', 'PALCZEWSKA'])('native 18-year reference respects source and sex: %s', source => {
    for (const [sex, cm, tone] of [['F', 156.17044746319655, 'warn'], ['M', 156.17044746319655, 'danger'], ['F', 168.7, 'normal'], ['M', 168.7, 'warn'], ['M', 195, 'warn']]) {
      const data = context({ sex, source, cm });
      const line = data.predictions[0].line;
      const result = row(win, 'prediction', [line], data);
      const actual = win.VildaSdsWzrostu.policz({ wzrost: cm, plec: sex, wiekMies: 216, zrodlo: source });
      expect(result, `${source} ${sex} ${cm}`).toMatchObject({ tone, original: line, text: line,
        reference: { ageMonths: 216, percentile: actual.centyl, source, sex } });
      if (sex === 'F' && cm < 157) expect(result.reference.percentile).toBeCloseTo(source === 'OLAF' ? 6.6247 : 6.2374, 3);
    }
  });

  it('reference is for the central estimate, not either edge of the uncertainty interval', () => {
    const data = context();
    const first = row(win, 'prediction', [data.predictions[0].line], data);
    data.predictions[0].line = data.predictions[0].line.replace('±4,4', '±20,0');
    const wide = row(win, 'prediction', [data.predictions[0].line], data);
    expect(wide.tone).toBe(first.tone);
    expect(wide.reference.percentile).toBe(first.reference.percentile);
    expect(wide.text).toContain('±20,0');
  });

  it('selects the numeric result of the displayed method instead of an unrelated consensus', () => {
    const line = 'Prognoza wzrostu ostatecznego (metoda Khamis-Roche): 168,7 cm (±4,3 cm)';
    const data = context();
    data.predictions.push({ line, cm: 168.66036173077993, method: 'khamis' });
    const result = row(win, 'prediction', [line], data);
    expect(result.tone).toBe('normal');
    expect(result.reference.percentile).toBeGreaterThan(60);
    data.predictions.pop();
    expect(row(win, 'prediction', [line], data).assessment).toBe('unassessed');
  });

  it('requires matching lines, available reference engines, source, population and sex', () => {
    const line = context().predictions[0].line;
    for (const opts of [{ sex: '' }, { source: 'WHO' }, { source: 'DS' }, { population: 'DS' }, { cm: null }, { cm: 0 }, { cm: NaN }, { line: 'Inna linia' }]) {
      const result = row(win, 'prediction', [line], context(opts));
      expect(result.assessment, JSON.stringify(opts)).toBe('unassessed');
      expect(result.reference).toBeUndefined();
    }
    const isolated = setup();
    isolated.LMS_HEIGHT_GIRLS = undefined;
    isolated.VildaSdsWzrostu.ustawDane({ LMS_HEIGHT_GIRLS: null });
    const fallback = isolated.VildaSdsWzrostu.policz({ wzrost: 156.17, plec: 'F', wiekMies: 216, zrodlo: 'OLAF' });
    expect(fallback.fallback).toBe(true);
    expect(row(isolated, 'prediction', [line], context({ source: 'OLAF' })).assessment).toBe('unassessed');
    delete isolated.VildaCentileLiveColors;
    expect(row(isolated, 'prediction', [line], context()).assessment).toBe('unassessed');
  });

  it('distinguishes missing values from available unassessed descriptive values', () => {
    const model = win.VildaProfessionalSummary.build(['Pow. ciała: 1,37 m²', 'SDS tempa: nie policzono — odstęp poza zakresem normy'], { assessmentData: null });
    expect(model.main.find(item => item.key === 'bsa')).toMatchObject({ availability: 'available', assessment: 'unassessed' });
    expect(model.main.find(item => item.key === 'velocity-sds')).toMatchObject({ availability: 'missing', assessment: 'unassessed' });
    expect(model.main.find(item => item.key === 'height')).toMatchObject({ availability: 'missing', assessment: 'unassessed' });
  });

  it('a new render cannot retain prediction centile or SDS from a previous patient', () => {
    const data = context();
    const line = data.predictions[0].line;
    expect(row(win, 'prediction', [line], data).reference).toBeDefined();
    expect(row(win, 'prediction', [line], null).reference).toBeUndefined();
    expect(row(win, 'prediction', [], null)).toMatchObject({ availability: 'missing', assessment: 'unassessed' });
  });

  it('typed HV summary and legacy text share the exact existing measurement selection', () => {
    const input = { sex: 'F', cmPerYear: 90 / 11, gapM: 11, currentAgeMonths: 144, currentHeight: 135, currentWeight: 24,
      measurements: [{ ageMonths: 108, height: 113 }, { ageMonths: 120, height: 120 }, { ageMonths: 133, height: 127.5 }], source: 'PALCZEWSKA' };
    const original = structuredClone(input);
    const numeric = win.VildaTrajectoryAnalysis.hvSdsDlaPodsumowania(input);
    expect(numeric.sds).toBeCloseTo(.8260551293926642, 10);
    expect(numeric.text).toBe(win.VildaTrajectoryAnalysis.hvSdsPodsumowanie(input));
    expect(numeric.text).toMatch(/\+0,8 \(80 centyl\)/);
    expect(input).toEqual(original);
    const fallbackInput = { ...input, cmPerYear: null, gapM: null };
    const fallback = win.VildaTrajectoryAnalysis.hvSdsDlaPodsumowania(fallbackInput);
    expect(fallback.sds).toBeCloseTo(numeric.sds, 10);
    expect(fallback.text).toBe(win.VildaTrajectoryAnalysis.hvSdsPodsumowanie(fallbackInput));
    const unavailable = win.VildaTrajectoryAnalysis.hvSdsDlaPodsumowania({ ...input, gapM: 30 });
    expect(unavailable.sds).toBeNull();
    expect(unavailable.text).toContain('nie policzono');
  });
});

function provider() {
  const win = setup();
  const fields = { sex: 'F', height: '155', weight: '44', age: '12', ageMonths: '0' };
  const doc = { addEventListener() {}, getElementById: id => fields[id] === undefined ? null : { value: fields[id] }, querySelectorAll: () => [] };
  win.advancedGrowthData = { sex: 'F', currentHeight: 155, currentWeight: 44, currentAgeMonths: 144, growthVelocity: 8.2, growthVelocityGapM: 11,
    khamis: { available: true, predictedAdultHeightCm: 168.66036173077993, errorBoundHalfWidthCm: 4.3 } };
  win.VildaAdvancedGrowth = { advGrowthPredictionsMatchCurrentInput: () => true };
  new Function('window', 'globalThis', 'document', 'patientReportGetPreferredSource', zrodlo('vilda_summary_cards.js'))(win, win, doc, () => win.source);
  return { win, fields, doc, get: () => win.VildaSummaryCards.getAssessmentData() };
}

describe('SUMMARY-B: fresh authoritative numeric context', () => {
  it('returns exact KR numeric estimate and the unchanged production formatter text', () => {
    const { get } = provider();
    expect(get()).toMatchObject({ sex: 'F', source: 'PALCZEWSKA', population: 'OGOLNA' });
    expect(get().predictions).toEqual([{ method: 'khamis', cm: 168.66036173077993, line: 'Prognoza wzrostu ostatecznego (metoda Khamis-Roche): 168,7 cm (±4,3 cm)' }]);
    expect(get().velocity.sds).toBeGreaterThan(.8);
  });
  it('native freshness fingerprint permits velocity without parents and rejects edited measurements', () => {
    const { win, fields, doc, get } = provider();
    const source = zrodlo('vilda_advanced_growth.js');
    const native = new Function('window', 'document', 'i', 'getAgeDecimal', 'collectAdvancedMeasurements',
      funkcjaZ(source, 'Fp') + '\n' + funkcjaZ(source, 'Ap') + '\nreturn { fingerprint: Fp, fresh: Ap };')(
      win, doc, win, () => 12, () => [],
    );
    win.VildaAdvancedGrowth.advGrowthPredictionsMatchCurrentInput = native.fresh;
    delete win.advancedGrowthData.khamis;
    win.advancedGrowthData.calculationFingerprint = native.fingerprint();
    expect(native.fresh()).toBe(true);
    expect(get().velocity.sds).toBeGreaterThan(.8);
    expect(get().predictions).toEqual([]);
    fields.height = '156';
    expect(native.fresh()).toBe(false);
    expect(get()).toMatchObject({ velocity: null, predictions: [] });
  });
  it('a temporarily unavailable numeric context cannot break the visible summary', () => {
    const win = setup();
    win.VildaSummaryCards = { getAssessmentData() { throw new Error('reference unavailable'); } };
    const line = 'SDS tempa: +0,8 (80 centyl)';
    const result = win.VildaProfessionalSummary.build([line]).main.find(item => item.key === 'velocity-sds');
    expect(result).toMatchObject({ text: line, assessment: 'unassessed' });
  });
  it('keeps numeric metadata away from a stale same-sex model or a changed sex', () => {
    const { win, fields, get } = provider();
    expect(get().predictions).toHaveLength(1);
    win.VildaAdvancedGrowth.advGrowthPredictionsMatchCurrentInput = () => false;
    expect(get()).toMatchObject({ velocity: null, predictions: [] });
    win.VildaAdvancedGrowth.advGrowthPredictionsMatchCurrentInput = () => true;
    fields.sex = 'M';
    expect(get()).toMatchObject({ sex: 'M', velocity: null, predictions: [] });
    fields.sex = 'F';
    delete win.VildaAdvancedGrowth.advGrowthPredictionsMatchCurrentInput;
    expect(get()).toMatchObject({ velocity: null, predictions: [] });
    delete win.VildaAdvancedGrowth;
    expect(get()).toMatchObject({ velocity: null, predictions: [] });
    win.advancedGrowthData = null;
    expect(get()).toMatchObject({ velocity: null, predictions: [] });
  });
});

describe('SUMMARY-B: changing the source refreshes the existing calculation lifecycle', () => {
  function sourceControls(advancedAvailable = true) {
    const src = zrodlo('app.js');
    const start = src.indexOf('window.vildaAppOnReady("app:growth-data-source-toggle"');
    const end = src.indexOf(',window.vildaAppOnReady(', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const registration = src.slice(start, end);
    const calls = [];
    const radios = ['PALCZEWSKA', 'OLAF', 'WHO'].map(value => ({ value, events: {}, addEventListener(type, handler) { this.events[type] = handler; } }));
    const doc = { getElementById: id => id === 'dataToggleContainer' ? { querySelectorAll: () => radios } : null };
    let currentSource;
    const read = new Function('window', 'document', 'rememberManualGrowthDataSource', 'update', 'calculateGrowthAdvanced',
      'let bmiSource = "PALCZEWSKA"; ' + registration + '; return () => bmiSource;')(
      { vildaAppOnReady: (_id, callback) => callback() }, doc, source => { calls.push(['source', source]); return source; },
      () => calls.push(['main-update', currentSource()]),
      advancedAvailable ? () => calls.push(['advanced-calculate', currentSource()]) : undefined,
    );
    currentSource = read;
    return { calls, radios };
  }
  it('uses fresh source on every PALCZEWSKA → OLAF → PALCZEWSKA change, after the main update', () => {
    const { calls, radios } = sourceControls();
    for (const source of ['PALCZEWSKA', 'OLAF', 'PALCZEWSKA']) radios.find(radio => radio.value === source).events.change();
    expect(calls).toEqual(['PALCZEWSKA', 'OLAF', 'PALCZEWSKA'].flatMap(source => [
      ['source', source], ['main-update', source], ['advanced-calculate', source],
    ]));
  });
  it('keeps the main source update available when the advanced module has not loaded', () => {
    const { calls, radios } = sourceControls(false);
    expect(() => radios[1].events.change()).not.toThrow();
    expect(calls).toEqual([['source', 'OLAF'], ['main-update', 'OLAF']]);
  });
});
