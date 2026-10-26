import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { appSrc, funkcjaZ, tablica, zrodlo } from '../support/silnik-bmi.mjs';

// Real modelOnly producers and real reference/clinical helpers. The preview
// must work without a document canvas, a Creator, or active-patient globals.
function setup() {
  const document = {
    addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; },
    getElementById() { return null; }, createElement: vi.fn(() => { throw Error('Preview created DOM/canvas'); }),
  };
  const win = {
    document, professionalMode: true, publicationCharts: false, addEventListener() {}, console,
    isGrowthResultsProfessionalMode() { return true; },
    getCentileChartHeaderNameState() { return { isBasicGrowth: false }; },
    buildCentileChartNameLabel() { return null; },
    PALCZEWSKA_INFANT_MIN_MONTHS: 0, PALCZEWSKA_INFANT_MAX_MONTHS: 35, PALCZEWSKA_EXTENDED_MAX_MONTHS: 216,
    OLAF_DATA_MIN_AGE: 3,
  };
  win.window = win; win.globalThis = win;
  for (const name of ['LMS_WEIGHT_BOYS', 'LMS_WEIGHT_GIRLS', 'LMS_HEIGHT_BOYS', 'LMS_HEIGHT_GIRLS',
    'LMS_INFANT_HEIGHT_BOYS', 'LMS_INFANT_HEIGHT_GIRLS', 'LMS_HEIGHT_WHO_BOYS', 'LMS_HEIGHT_WHO_GIRLS',
    'LMS_INFANT_WEIGHT_BOYS', 'LMS_INFANT_WEIGHT_GIRLS']) win[name] = tablica(name);
  const context = vm.createContext(win);
  for (const file of ['centile_data.js', 'ds_lms.js', 'vilda_centile_interpolation.js', 'vilda_sds_wzrostu.js',
    'vilda_centile_charts.js', 'inline_index_03.js', 'inline_index_04.js', 'inline_index_07.js', 'vilda_centile_live_render.js']) {
    vm.runInContext(zrodlo(file), context, { filename: file });
  }
  win.VildaSdsWzrostu.ustawDane({ palCentyl: (sex, age, p) => win.VildaCentileInterp.palCentileValue(sex, age, p, 'HT'),
    LMS_HEIGHT_DS_INFANT_BOYS: win.VildaDsLMS.NIEMOWLE.HT.M, LMS_HEIGHT_DS_INFANT_GIRLS: win.VildaDsLMS.NIEMOWLE.HT.F,
    LMS_HEIGHT_DS_BOYS: win.VildaDsLMS.DZIECKO.HT.M, LMS_HEIGHT_DS_GIRLS: win.VildaDsLMS.DZIECKO.HT.F });
  for (const name of ['erf', 'normalCDF', 'normInv', 'getPalReferenceCentileInterpolated', 'getPalCentile',
    'calcPercentileStatsPal', 'getPLWeightCentile', 'getPLHeightCentile']) {
    vm.runInContext(funkcjaZ(appSrc, name), context, { filename: `app.js:${name}` });
  }
  for (const name of ['advancedGrowthData', 'basicGrowthData', 'chartCreatorData', 'VildaPublicationCreator']) {
    Object.defineProperty(win, name, { configurable: true,
      get() { throw Error(`Preview read ${name}`); }, set() { throw Error(`Preview changed ${name}`); } });
  }
  return win;
}

const fictional = {
  sex: 'F', source: 'OLAF', ageMonths: 144, exactAgeMonths: 144.3,
  currentHeight: 155, currentWeight: 44, professionalMode: true,
  measurements: [
    { ageMonths: 96, height: 126, weight: 25 },
    { ageMonths: 108, height: 132, weight: 29 },
    { ageMonths: 127, height: 144, weight: 35 },
    { ageMonths: 144, height: 155, weight: 44 },
  ],
};

function producerModels(win, snapshot, range) {
  const args = { sex: snapshot.sex === 'M' ? 'M' : 'F', userAgeMonths: snapshot.ageMonths,
    userHeight: snapshot.currentHeight, userWeight: snapshot.currentWeight, modelOnly: true,
    growthData: { measurements: snapshot.measurements, currentAgeMonths: snapshot.ageMonths,
      currentHeight: snapshot.currentHeight, currentWeight: snapshot.currentWeight, sex: snapshot.sex },
    legacyLayout: { standard: false, hasName: false, hasSubtitle: true } };
  if (range === 'palRegular') {
    const models = win.buildPalczewskaExtendedCanvases(args);
    return { height: models[0], weight: models[1] };
  }
  return win.buildCentilePageCanvas({ ...args, chartSource: snapshot.source,
    rangeMinX: range === 'olaf' ? 36 : 0, rangeMaxX: range === 'olaf' ? 216 : range === 'who' ? 35 : 36 });
}

describe('lightweight centile preview from production models', () => {
  it.each([
    ['OLAF', 'M', 144, 'olaf'], ['OLAF', 'F', 144, 'olaf'],
    ['PALCZEWSKA', 'M', 144, 'palRegular'], ['PALCZEWSKA', 'K', 144, 'palRegular'],
    ['PALCZEWSKA', 'F', 8, 'palInfant'], ['WHO', 'M', 8, 'who'],
  ])('keeps real %s/%s curves, scale and points at %s months', (source, sex, ageMonths, range) => {
    const win = setup();
    const snapshot = { ...fictional, source, sex, ageMonths, exactAgeMonths: ageMonths + 0.3,
      ...(ageMonths < 12 ? { currentHeight: 69, currentWeight: 8,
        measurements: [{ ageMonths: 3, height: 60, weight: 5.5 }, { ageMonths: 6, height: 65, weight: 7 }] } : {}) };
    const before = JSON.stringify(snapshot);
    const result = win.VildaCentileLiveRender.preview(snapshot);
    const expected = producerModels(win, snapshot, range);
    expect(result.status).toBe('ready');
    expect(result.activeRangeId).toBe(range);
    expect(result.height).toBe(result.ranges.find(item => item.id === range).height);
    for (const metric of ['height', 'weight']) {
      const actual = result[metric], model = expected[metric];
      expect(actual.preview).toBe(true);
      expect(actual.plot).toEqual({ x: 0, y: 0, w: 1, h: 1, ageMin: model.minX, ageMax: model.maxX, minY: model.minY, maxY: model.maxY });
      expect(Object.keys(actual.curves)).toEqual(['3', '50', '97']);
      for (const percentile of actual.percentiles) {
        expect(actual.curves[percentile]).toEqual(model.curves[percentile]);
        expect(actual.curves[percentile]).toHaveLength(model.maxX - model.minX + 1);
      }
      expect(actual.sampleStepMonths).toBe(1);
      expect(actual.points.map(point => [point.ageMonths, point.value])).toEqual(model.points.map(point => [point.ageMonths, point[metric]]));
      expect(actual.canvas).toBeUndefined();
      expect(actual.annotations).toEqual([]);
      expect(actual.mph).toBeNull();
      const current = actual.points.find(point => point.current);
      const stats = win.getCentilePercentileStatsForSource(current.value, sex === 'M' ? 'M' : 'F', snapshot.exactAgeMonths,
        metric === 'height' ? 'HT' : 'WT', source, { population: 'OGOLNA' });
      expect(current.clinicalAgeMonths).toBe(snapshot.exactAgeMonths);
      expect(current.percentile).toBe(stats.percentile);
      expect(current.sd).toBe(stats.sd);
    }
    expect(JSON.stringify(snapshot)).toBe(before);
    expect(win.document.createElement).not.toHaveBeenCalled();
  });

  it('builds only the selected source, without drawing or cross-source annotation geometry', () => {
    const win = setup();
    const pageModels = vi.spyOn(win, 'buildCentilePageCanvas');
    const palModels = vi.spyOn(win, 'buildPalczewskaExtendedCanvases');
    win.drawCentileGrid = vi.fn(() => { throw Error('Full grid drawn'); });
    win.drawCentileMeasurementSeries = vi.fn(() => { throw Error('Full patient path drawn'); });
    win.VildaCentileLiveRender.preview(fictional);
    expect(pageModels).toHaveBeenCalledTimes(1);
    expect(pageModels.mock.calls[0][0]).toMatchObject({ chartSource: 'OLAF', modelOnly: true });
    expect(palModels).not.toHaveBeenCalled();
    pageModels.mockClear();
    win.VildaCentileLiveRender.preview({ ...fictional, source: 'PALCZEWSKA' });
    expect(palModels).toHaveBeenCalledTimes(1);
    expect(pageModels).not.toHaveBeenCalled();
    expect(win.drawCentileGrid).not.toHaveBeenCalled();
    expect(win.drawCentileMeasurementSeries).not.toHaveBeenCalled();
  });

  it('retains Palczewska infant and regular history/range choices', () => {
    const win = setup();
    const infant = { ...fictional, source: 'PALCZEWSKA', ageMonths: 24, exactAgeMonths: 24.1,
      currentHeight: 88, currentWeight: 12, measurements: [{ ageMonths: 18, height: 82, weight: 10.5 }] };
    const choice = win.VildaCentileLiveRender.preview(infant);
    expect(choice.rangePlan.mode).toBe('CHOICE');
    expect(choice.ranges.map(range => range.id)).toEqual(['palInfant', 'palRegular']);
    expect(choice.activeRangeId).toBe('palInfant');
    const mixed = win.VildaCentileLiveRender.preview({ ...fictional, source: 'PALCZEWSKA',
      measurements: [{ ageMonths: 6, height: 67, weight: 7.5 }, ...fictional.measurements] });
    expect(mixed.rangePlan.mode).toBe('BOTH_REQUIRED');
    expect(mixed.ranges.map(range => range.id)).toEqual(['palInfant', 'palRegular']);
    expect(mixed.activeRangeId).toBe('palRegular');
    expect(mixed.ranges[0].height.points.map(point => point.ageMonths)).toEqual([6]);
    expect(mixed.ranges[1].height.points.map(point => point.ageMonths)).toEqual([96, 108, 127, 144]);
  });

  it('uses the existing probe and explicit population for current and interpolated readouts', () => {
    const win = setup();
    const stats = vi.spyOn(win, 'getCentilePercentileStatsForSource');
    const asset = win.VildaCentileLiveRender.preview({ ...fictional, population: 'DS' }).height;
    expect(stats.mock.calls.every(args => args[5].population === 'DS')).toBe(true);
    const midpoint = asset.probe(102);
    expect(midpoint.value).toBe(129);
    expect(midpoint.exact).toBe(false);
    expect(stats).toHaveBeenLastCalledWith(129, 'F', 102, 'HT', 'OLAF', { population: 'DS' });
    const expected = win.getCentilePercentileStatsForSource(129, 'F', 102, 'HT', 'OLAF', { population: 'DS' });
    expect(Number.isFinite(expected.percentile)).toBe(true);
    expect(Number.isFinite(expected.sd)).toBe(true);
    expect(midpoint.percentile).toBe(expected?.percentile ?? null);
    expect(midpoint.sd).toBe(expected?.sd ?? null);
    expect(asset.probe(96).exact).toBe(true);
    expect(asset.probe(95.9)).toBeNull();
    expect(asset.probe(144.1)).toBeNull();
  });

  it('retains production axis expansion for outliers without zooming to history', () => {
    const win = setup();
    const snapshot = { ...fictional, currentHeight: 215, currentWeight: 180 };
    const result = win.VildaCentileLiveRender.preview(snapshot);
    const expected = producerModels(win, snapshot, 'olaf');
    for (const metric of ['height', 'weight']) {
      expect(result[metric].plot.ageMin).toBe(36);
      expect(result[metric].plot.ageMax).toBe(216);
      expect(result[metric].plot.maxY).toBe(expected[metric].maxY);
      expect(result[metric].plot.maxY).toBeGreaterThan(expected[metric].officialMaxY);
    }
  });

  it.each([
    null, { ...fictional, sex: '' }, { ...fictional, ageMonths: NaN }, { ...fictional, ageMonths: -1 },
    { ...fictional, ageMonths: 216 }, { ...fictional, source: 'WHO' }, { ...fictional, ageMonths: 35 },
    { ...fictional, source: 'unknown' }, { ...fictional, source: 'PALCZEWSKA', professionalMode: false },
  ])('has the same availability response as the full renderer for %j', snapshot => {
    const win = setup();
    expect(win.VildaCentileLiveRender.preview(snapshot)).toEqual(win.VildaCentileLiveRender.render(snapshot));
  });
});
