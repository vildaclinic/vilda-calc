import { describe, expect, it } from 'vitest';
import { appSrc, funkcjaZ, oknoZSilnikiem, zrodlo } from '../support/silnik-bmi.mjs';

function setup() {
  const win = oknoZSilnikiem();
  new Function('window', 'globalThis', zrodlo('vilda_sds_wzrostu.js'))(win, win);
  win.VildaSdsWzrostu.ustawDane({
    LMS_HEIGHT_DS_INFANT_BOYS: win.VildaDsLMS.NIEMOWLE.HT.M,
    LMS_HEIGHT_DS_INFANT_GIRLS: win.VildaDsLMS.NIEMOWLE.HT.F,
    LMS_HEIGHT_DS_BOYS: win.VildaDsLMS.DZIECKO.HT.M,
    LMS_HEIGHT_DS_GIRLS: win.VildaDsLMS.DZIECKO.HT.F,
  });
  const code = funkcjaZ(appSrc, 'vildaDsTablica') + funkcjaZ(appSrc, 'vildaDsWiersz')
    + funkcjaZ(zrodlo('inline_index_03.js'), 'getCentilePercentileStatsForSource')
    + ';return { stats: getCentilePercentileStatsForSource, row: vildaDsWiersz };';
  return { win, ...new Function('window', code)(win) };
}

describe('DS chart readouts use the existing clinical reference', () => {
  for (const sex of ['M', 'F']) {
    it(`${sex}: weight agrees with native LMS at infant/child boundary and through20years`, () => {
      const { win, stats, row } = setup();
      for (const age of [0, 1, 23.9, 24, 30, 36, 144, 215.99, 240]) {
        for (const sd of [-2, 0, 2]) {
          const lms = row('WT', sex, age), value = win.VildaBmi.xLms(sd, lms);
          const actual = stats(value, sex, age, 'WT', 'DS');
          expect(actual.siatka).toBe('DS');
          expect(actual.fallback).toBe(false);
          expect(actual.sd).toBe(win.VildaBmi.zLms(value, lms));
          expect(actual.percentile).toBe(win.VildaBmi.centylZSds(actual.sd));
          expect(stats(value, sex, age, 'WT', 'OLAF', { population: 'DS' })).toEqual(actual);
        }
      }
    });

    it(`${sex}: explicit DS height needs no mutable active-patient state`, () => {
      const { win, stats } = setup();
      for (const age of [1, 23.9, 24, 144, 216, 240]) {
        const expected = win.VildaSdsWzrostu.policz({ wzrost: 140, plec: sex, wiekMies: age, zrodlo: 'DS', populacja: 'DS' });
        const actual = stats(140, sex, age, 'HT', 'DS');
        expect(actual.siatka).toBe('DS');
        expect(actual.sd).toBe(expected.sds);
        expect(actual.percentile).toBe(expected.centyl);
      }
    });
  }

  it('Zemel 2015 published-reference medians give the50thcentile at12years', () => {
    const { stats } = setup();
    for (const [sex, height, weight] of [['M', 137.688, 39.001], ['F', 137.855, 39.053]]) {
      expect(stats(height, sex, 144, 'HT', 'DS').percentile).toBeCloseTo(50, 6);
      expect(stats(weight, sex, 144, 'WT', 'DS').percentile).toBeCloseTo(50, 6);
    }
  });

  it('rejects unsupported DS measurements and missing references without a population fallback', () => {
    const { win, stats } = setup();
    for (const age of [-1, 240.01, NaN]) expect(stats(40, 'F', age, 'WT', 'DS')).toBeNull();
    for (const value of [0, -5, NaN]) expect(stats(value, 'F', 144, 'WT', 'DS')).toBeNull();
    win.VildaDsLMS = null;
    expect(stats(40, 'F', 144, 'WT', 'DS')).toBeNull();
  });
});
