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

  it.each([{}, { sex: 'M' }, { sex: 'M', age: 0.25, tanner: 1, life_stage: 'pediatric' },
    { sex: 'M', age: 12, tanner: 3, life_stage: 'pediatric' }, { sex: 'M', age: 45, life_stage: 'adult' }])(
    'dawne API TT nie przywraca męskich norm ani domyślnego dorosłego: %j', patient => {
      const converter = loadConverter();
      expect(converter.selectRange(converter.find('testosterone_total'), patient)).toBeNull();
      expect(converter.evaluate('testosterone_total', { value: 10, unit: 'nmol/L', patient }))
        .toMatchObject({ ok: true, status: 'no_range', low: null, high: null, matched: false, is_default: false });
    }
  );

  it.each([
    [{ sex: 'F', age: 30, life_stage: 'adult' }, 0.3, 2.4],
    [{ sex: 'F', age: 8, life_stage: 'pediatric' }, 0.17, 0.45],
    [{ sex: 'F', age: 12, tanner: 3, life_stage: 'pediatric' }, 0.17, 1.21],
  ])('zachowuje dotychczasowy żeński zakres TT: %j', (patient, low, high) => {
    expect(loadConverter().evaluate('testosterone_total', { value: 1, unit: 'nmol/L', patient }))
      .toMatchObject({ ok: true, low, high, matched: true, is_default: false });
  });

  it('zachowuje dotychczasowe wyłączenie wieczornego pomiaru TT kobiet', () => {
    expect(loadConverter().evaluate('testosterone_total', { value: 1, unit: 'nmol/L',
      patient: { sex: 'F', age: 30, life_stage: 'adult', time_of_day: 'evening' } }))
      .toMatchObject({ ok: true, status: 'no_interpretation', low: null, high: null });
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

  it('przelicza inhibinę B bez zmiany wartości między pg/mL i ng/L', () => {
    const converter = loadConverter();
    for (const [fromUnit, toUnit] of [['pg/mL', 'ng/L'], ['ng/L', 'pg/mL']]) {
      const result = converter.convert({ substanceId: 'inhibin_b', value: '80,5', fromUnit, toUnit });
      expect(result.ok).toBe(true);
      expect(result.value).toBe(80.5);
    }
  });

  it.each([{}, { sex: 'M', age: 0.25 }, { sex: 'F', age: 0.25 }, { sex: 'M', age: 35 }])(
    'nie przypisuje dawnego zakresu dorosłych inhibinie bez zapisanego kontekstu oceny: %j',
    patient => {
      const result = loadConverter().evaluate('inhibin_b', { value: 80, unit: 'pg/mL', patient });
      expect(result).toMatchObject({ ok: true, status: 'no_range', low: null, high: null, matched: false });
    }
  );

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
