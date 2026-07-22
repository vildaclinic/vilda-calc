import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

function loadConverter() {
  const browserGlobal = {};
  loadBrowserScript('lab_units_data.js', browserGlobal);
  loadBrowserScript('lab_unit_converter.js', browserGlobal);
  return browserGlobal.LabUnitConverter;
}

describe('LabUnitConverter', () => {
  it('przelicza testosteron całkowity z ng/dL na nmol/L', () => {
    const result = loadConverter().convert({
      substanceId: 'testosterone_total',
      value: 300,
      fromUnit: 'ng/dL',
      toUnit: 'nmol/L'
    });

    expect(result.ok).toBe(true);
    expect(result.value).toBeCloseTo(10.401, 6);
    expect(result.siUnit).toBe('nmol/L');
  });

  it('przelicza 25-OH-D z ng/mL na nmol/L', () => {
    const result = loadConverter().convert({
      substanceId: 'vit_d_25oh',
      value: 20,
      fromUnit: 'ng/mL',
      toUnit: 'nmol/L'
    });

    expect(result.ok).toBe(true);
    expect(result.value).toBeCloseTo(49.92, 6);
  });

  it('zachowuje równoważność jednostek TSH', () => {
    const result = loadConverter().convert({
      substanceId: 'tsh',
      value: '2,5',
      fromUnit: 'mIU/L',
      toUnit: 'μIU/mL'
    });

    expect(result.ok).toBe(true);
    expect(result.value).toBe(2.5);
  });

  it('odrzuca wartości ujemne i nieznane jednostki', () => {
    const converter = loadConverter();

    expect(converter.convert({
      substanceId: 'cortisol',
      value: -1,
      fromUnit: 'nmol/L',
      toUnit: 'ng/mL'
    }).ok).toBe(false);
    expect(converter.convert({
      substanceId: 'cortisol',
      value: 100,
      fromUnit: 'nieznana',
      toUnit: 'nmol/L'
    }).ok).toBe(false);
  });
});
