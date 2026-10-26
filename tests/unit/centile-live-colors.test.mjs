import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { funkcjaZ, zrodlo } from '../support/silnik-bmi.mjs';

function setup() {
  const win = { document: { getElementById: () => null }, getAgeDecimal: () => 12 };
  win.window = win;
  loadBrowserScript('vilda_masa.js', win);
  loadBrowserScript('vilda_centile_live_colors.js', win);
  const context = vm.createContext(win);
  vm.runInContext(funkcjaZ(zrodlo('vilda_patient_report.js'), 'getProfessionalSummaryLineTone'), context);
  return win;
}

describe('centile patient presentation agrees with existing summary interpretation', () => {
  it.each(['height', 'weight'])('%s keeps every existing boundary, including unequal rules exactly at 3 and 97', metric => {
    const win = setup();
    const label = metric === 'height' ? 'Wzrost' : 'Waga';
    for (const percentile of [0, 2.9999, 3, 3.0001, 9.9999, 10, 50, 89.9999, 90, 90.0001, 96.9999, 97, 97.0001, 100]) {
      win.lastHeightPercentile = percentile;
      win.lastWeightPercentile = percentile;
      const summaryTone = win.getProfessionalSummaryLineTone(`${label}: 100, ${percentile} centyl`);
      expect(win.VildaCentileLiveColors.tone(metric, percentile)).toBe(summaryTone === 'normal' ? 'neutral' : summaryTone);
    }
  });

  it('does not turn absent or unsupported assessment into a normal point', () => {
    const api = setup().VildaCentileLiveColors;
    for (const percentile of [null, undefined, NaN, Infinity, '50']) {
      expect(api.tone('height', percentile)).toBe('unknown');
      expect(api.tone('weight', percentile)).toBe('unknown');
    }
    expect(api.tone('bmi', 50)).toBe('unknown');
    expect(api.color('unknown')).toBe('#7c8b90');
  });

  it('interpolates only the endpoint colors and never changes the clinical point data', () => {
    const api = setup().VildaCentileLiveColors;
    const points = [{ ageMonths: 96, value: 125, percentile: 22 }, { ageMonths: 120, value: 132, percentile: 9 }, { ageMonths: 144, value: 139, percentile: 2 }];
    const before = JSON.stringify(points);
    expect(api.colorAt('height', points, 96)).toBe('#087c80');
    expect(api.colorAt('height', points, 108)).toBe('rgb(97, 121, 77)');
    expect(api.colorAt('height', points, 120)).toBe('#b97519');
    expect(api.colorAt('height', points, 132)).toBe('rgb(187, 96, 53)');
    expect(api.colorAt('height', points, 144)).toBe('#bd4b50');
    expect(JSON.stringify(points)).toBe(before);
  });
});
