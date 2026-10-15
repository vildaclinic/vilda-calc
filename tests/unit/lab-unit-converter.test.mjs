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
    { sex: 'M', age: 12, tanner: 3, life_stage: 'pediatric' }, { sex: 'M', age: 45, life_stage: 'adult' },
    { sex: 'F' }, { sex: 'F', age: -1, life_stage: 'adult' },
    { sex: 'F', age: 30, life_stage: 'adult' }, { sex: 'F', age: 8, life_stage: 'pediatric' },
    { sex: 'F', age: 0.5, tanner: 5, life_stage: 'pediatric' },
    { sex: 'F', age: 12, tanner: 3, life_stage: 'pediatric' },
    { sex: 'F', age: 30, life_stage: 'adult', time_of_day: 'evening' },
    { sex: 'F', age: 70, life_stage: 'adult', cycle_phase: 'postmenopause' }])(
    'dawne API TT nie przywraca norm wieku, Tanner ani domyślnej dorosłej: %j', patient => {
      const converter = loadConverter();
      expect(converter.selectRange(converter.find('testosterone_total'), patient)).toBeNull();
      expect(converter.evaluate('testosterone_total', { value: 10, unit: 'nmol/L', patient }))
        .toMatchObject({ ok: true, siValue: 10, status: 'no_range', low: null, high: null,
          source_ids: [], matched: false, is_default: false });
    }
  );

  it('nie wybiera legacy TT nawet z przekazanego dawnego deskryptora', () => {
    const converter = loadConverter();
    const staleDescriptor = {
      id: 'testosterone_total',
      reference_ranges_si: [
        { id: 'old_tanner', when: { sex: 'F', tanner: 3 }, low: 0.17, high: 1.21 },
        { id: 'old_adult', when: { sex: 'F', life_stage: 'adult' }, low: 0.3, high: 2.4 }
      ],
      default_range_si: { low: 0.3, high: 2.4 }
    };
    for (const patient of [{ sex: 'F', tanner: 3 }, { sex: 'F', life_stage: 'adult' }, {}]) {
      expect(converter.selectRange(staleDescriptor, patient)).toBeNull();
    }
  });

  it('nie udostępnia dawnych zakresów TT przez rejestr ani listę nadpisań', () => {
    const converter = loadConverter();
    const substance = converter.find('testosterone_total');
    expect(substance.reference_ranges_si).toEqual([]);
    expect(substance.default_range_si).toBeUndefined();
    expect(substance.ranges_pl).toEqual([]);
    expect(converter.rangesForOverride(substance)).toEqual([]);
  });

  it.each(['nmol/L', 'ng/dL', 'ng/mL', 'pg/mL'])(
    'zachowuje konwersję TT i brak legacy RI dla równoważnego wyniku w %s', unit => {
      const converter = loadConverter();
      const converted = converter.convert({ substanceId: 'testosterone_total', value: 100,
        fromUnit: 'ng/dL', toUnit: unit });
      expect(converted.ok).toBe(true);
      expect(converted.siValue).toBeCloseTo(3.467, 12);
      expect(converter.evaluate('testosterone_total', { value: converted.value, unit,
        patient: { sex: 'F', age: 35, life_stage: 'adult' } }))
        .toMatchObject({ ok: true, status: 'no_range', low: null, high: null });
      const roundtrip = converter.convert({ substanceId: 'testosterone_total', value: converted.value,
        fromUnit: unit, toUnit: 'ng/dL' });
      expect(roundtrip.ok).toBe(true);
      expect(roundtrip.value).toBeCloseTo(100, 12);
    }
  );

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
