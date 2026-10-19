import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Rzeczywiste API przelicznika i zapisu zakresu; wyłącznie fikcyjne konteksty pacjentów.
function fixture(editDescriptor) {
  const win = {};
  loadBrowserScript('lab_units_data.js', win);
  if (editDescriptor) {
    const data = win.LabUnitsData;
    const descriptor = structuredClone(data.find('estradiol'));
    editDescriptor(descriptor);
    win.LabUnitsData = { ...data, find: (id) => id === 'estradiol' ? descriptor : data.find(id) };
  }
  loadBrowserScript('lab_unit_converter.js', win);
  loadBrowserScript('vilda_lab_range_snapshot.js', win);
  return { win, converter: win.LabUnitConverter, snapshot: win.VildaLabRangeSnapshot };
}

const MISSING_CONTEXT = [
  ['chłopiec 3 miesiące bez stadium', { sex: 'M', age: 0.25, life_stage: 'pediatric' }],
  ['dziewczynka w dniu urodzenia bez stadium', { sex: 'F', age: 0, life_stage: 'pediatric' }],
  ['dziecko bez płci', { sex: null, age: 8, life_stage: 'pediatric' }],
  ['pediatryczny kontekst poza ostatnim przedziałem wieku', { sex: 'F', age: 18, life_stage: 'pediatric' }],
  ['brak kontekstu', {}],
];
const NO_REFERENCE = 'Brak zakresu referencyjnego estradiolu dla tego kontekstu pacjenta. Przeliczenie jednostek pozostaje dostępne.';

function expectUnavailable(converter, descriptor, patient) {
  const selected = converter.selectRange(descriptor, patient);
  expect(selected).toMatchObject({
    id: 'estradiol-matched-reference-only', low: null, high: null,
    no_interpretation: true, reference_unavailable: true,
    matched: false, is_default: false, source_ids: [], context_pl: NO_REFERENCE,
  });
  const evaluated = converter.evaluate('estradiol', { value: '5', unit: 'pg/mL', patient });
  expect(evaluated).toMatchObject({
    ok: true, value: 5, unit: 'pg/mL', siUnit: 'pmol/L', status: 'no_interpretation',
    low: null, high: null, lowInUnit: null, highInUnit: null,
    context_pl: NO_REFERENCE, source_ids: [], matched: false, is_default: false,
  });
  expect(evaluated.siValue).toBeCloseTo(18.355, 12);
}

describe('Estradiol — tylko zakres dopasowany do kontekstu', () => {
  it.each(MISSING_CONTEXT)('%s: przelicza wynik bez zakresu dorosłych i bez alarmu', (_label, patient) => {
    const { converter } = fixture();
    expectUnavailable(converter, converter.find('estradiol'), patient);
  });

  it.each(['default-row', 'default-range-si'])('polityka blokuje osobno ścieżkę %s', (path) => {
    const { converter } = fixture((descriptor) => {
      // Kopia produkcyjnego deskryptora izoluje obie istniejące ścieżki awaryjne.
      descriptor.reference_ranges_si = path === 'default-row'
        ? descriptor.reference_ranges_si.filter((row) => row.default === true) : [];
      if (path === 'default-row') delete descriptor.default_range_si;
    });
    expectUnavailable(converter, converter.find('estradiol'), MISSING_CONTEXT[0][1]);
  });

  it('szuka dopasowania także za wierszem default, zanim zastosuje politykę braku zakresu', () => {
    const { converter } = fixture((descriptor) => {
      descriptor.reference_ranges_si = [
        descriptor.reference_ranges_si.find((row) => row.default === true),
        descriptor.reference_ranges_si.find((row) => row.id === 'e2_F_mini_puberty'),
      ];
    });
    const patient = { sex: 'F', age: 0.25, life_stage: 'pediatric' };
    expect(converter.selectRange(converter.find('estradiol'), patient)).toMatchObject({
      id: 'e2_F_mini_puberty', matched: true, is_default: false, low: 0, high: 183,
    });
    expect(converter.evaluate('estradiol', { value: '5', unit: 'pg/mL', patient }).status).toBe('within');
  });

  it('nie zmienia domyślnego zakresu innego analitu', () => {
    const { converter } = fixture();
    expect(converter.selectRange(converter.find('tsh'), {})).toMatchObject({
      id: 'tsh_default', low: 0.3, high: 4.2, matched: false, is_default: true,
      no_interpretation: false, source_ids: ['mayo_test_tsh'],
    });
    expect(converter.evaluate('tsh', { value: '2', unit: 'mIU/L', patient: {} })).toMatchObject({
      ok: true, status: 'within', low: 0.3, high: 4.2,
    });
    const cortisol = structuredClone(converter.find('cortisol'));
    cortisol.reference_ranges_si = [];
    expect(converter.selectRange(cortisol, {})).toMatchObject({
      low: 138, high: 690, matched: false, is_default: true,
    });
  });
});

const MATCHED = [
  ['e2_F_mini_puberty', { sex: 'F', age: 0.25, life_stage: 'pediatric' }, 0, 183, 'within'],
  ['e2_M_prepubertal_age', { sex: 'M', age: 0.5, life_stage: 'pediatric' }, 0, 47.79, 'within'],
  ['e2_M_peripubertal_age', { sex: 'M', age: 10, life_stage: 'pediatric' }, 0, 139.69, 'within'],
  ['e2_M_latepubertal_age', { sex: 'M', age: 16, life_stage: 'pediatric' }, 36.76, 147.04, 'far_below'],
  ['e2_F_prepubertal_age', { sex: 'F', age: 8, life_stage: 'pediatric' }, 0, 73.52, 'within'],
  ['e2_F_peripubertal_age', { sex: 'F', age: 10, life_stage: 'pediatric' }, 0, 312.46, 'within'],
  ['e2_F_latepubertal_age', { sex: 'F', age: 16, life_stage: 'pediatric' }, 0, 290, 'within'],
  ['e2_M_tanner1', { sex: 'M', age: 12, life_stage: 'pediatric', tanner: 1 }, 0, 47.79, 'within'],
  ['e2_M_tanner2', { sex: 'M', age: 12, life_stage: 'pediatric', tanner: 2 }, 0, 58.82, 'within'],
  ['e2_M_tanner3', { sex: 'M', age: 12, life_stage: 'pediatric', tanner: 3 }, 0, 95.58, 'within'],
  ['e2_M_tanner4', { sex: 'M', age: 12, life_stage: 'pediatric', tanner: 4 }, 0, 139.69, 'within'],
  ['e2_M_tanner5', { sex: 'M', age: 12, life_stage: 'pediatric', tanner: 5 }, 36.76, 147.04, 'far_below'],
  ['e2_F_tanner1', { sex: 'F', age: 12, life_stage: 'pediatric', tanner: 1 }, 0, 73.52, 'within'],
  ['e2_F_tanner2', { sex: 'F', age: 12, life_stage: 'pediatric', tanner: 2 }, 0, 88.22, 'within'],
  ['e2_F_tanner3', { sex: 'F', age: 12, life_stage: 'pediatric', tanner: 3 }, 0, 220.56, 'within'],
  ['e2_F_tanner4', { sex: 'F', age: 12, life_stage: 'pediatric', tanner: 4 }, 55.14, 312.46, 'far_below'],
  ['e2_F_tanner5', { sex: 'F', age: 12, life_stage: 'pediatric', tanner: 5 }, 0, 290, 'within'],
  ['e2_male_adult', { sex: 'M', age: 30, life_stage: 'adult' }, 40, 160, 'far_below'],
  ['e2_female_follicular', { sex: 'F', age: 30, life_stage: 'adult', cycle_phase: 'follicular' }, 70, 290, 'far_below'],
  ['e2_female_ovulation', { sex: 'F', age: 30, life_stage: 'adult', cycle_phase: 'ovulation' }, 380, 1460, 'far_below'],
  ['e2_female_luteal', { sex: 'F', age: 30, life_stage: 'adult', cycle_phase: 'luteal' }, 200, 770, 'far_below'],
  ['e2_female_postmeno', { sex: 'F', age: 65, life_stage: 'adult', cycle_phase: 'postmenopause' }, 0, 110, 'within'],
];

const CYCLE_PHASES = [
  ['follicular', 'e2_female_follicular', 70, 290, 'below', 'within'],
  ['ovulation', 'e2_female_ovulation', 380, 1460, 'far_below', 'far_below'],
  ['luteal', 'e2_female_luteal', 200, 770, 'far_below', 'below'],
  ['postmenopause', 'e2_female_postmeno', 0, 110, 'within', 'above'],
];
const UNKNOWN_CYCLE = [undefined, null, '', 'unknown', 'nieznana', 'nieznany', 'nieustalona', 'nieustalony'];
const UNSUPPORTED_CYCLE = ['bogus', '!!!', '—', '???', 'pregnancy_t1', 'pregnancy_t2', 'pregnancy_t3'];

function expectCycleAlternatives(converter, patient) {
  const descriptor = converter.find('estradiol');
  const range = converter.selectRange(descriptor, patient);
  expect(range).toMatchObject({
    low: null, high: null, no_interpretation: true, reference_unavailable: true,
    reference_context_required: true, matched: false, is_default: false, source_ids: [],
  });
  expect(range.reference_variants).toHaveLength(CYCLE_PHASES.length);
  for (const [cycle_phase, id, low, high] of CYCLE_PHASES) {
    const original = descriptor.reference_ranges_si.find((row) => row.id === id);
    const declared = descriptor.reference_selection_policy.adult_female_context.variants.find((entry) => entry.row_id === id);
    expect(range.reference_variants.find((variant) => variant.cycle_phase === cycle_phase)).toMatchObject({
      id, cycle_phase, low, high, label: declared.label, context_pl: original.context_pl, source_ids: original.source_ids,
    });
  }
  return range;
}

describe('Estradiol — dorosła pacjentka bez ustalonej fazy cyklu', () => {
  it.each(UNKNOWN_CYCLE)('faza %j: wynik pozostaje dostępny bez przyjęcia fazy folikularnej', (cycle_phase) => {
    const { converter } = fixture();
    const patient = { sex: 'F', age: 30, life_stage: 'adult', cycle_phase };
    const selected = expectCycleAlternatives(converter, patient);
    expect(converter.evaluate('estradiol', { value: 50, unit: 'pmol/L', patient })).toMatchObject({
      ok: true, value: 50, siValue: 50, unit: 'pmol/L', status: 'no_interpretation',
      low: null, high: null, lowInUnit: null, highInUnit: null,
      reference_context_required: true, reference_variants: selected.reference_variants,
      source_ids: [], matched: false, is_default: false,
    });
  });

  it.each([18, 30, 70, undefined])('wiek %j nie ustala fazy ani menopauzy', (age) => {
    const { converter } = fixture();
    expectCycleAlternatives(converter, { sex: 'F', age, life_stage: 'adult' });
  });

  it.each(UNSUPPORTED_CYCLE)('kontekst %s nie uruchamia wariantów cyklu ani zastępczej normy', (cycle_phase) => {
    const { converter } = fixture();
    const patient = { sex: 'F', age: 30, life_stage: 'adult', cycle_phase };
    const range = converter.selectRange(converter.find('estradiol'), patient);
    expect(range).toMatchObject({
      no_interpretation: true, reference_unavailable: true, low: null, high: null, reference_context_required: false,
      matched: false, is_default: false, source_ids: [],
    });
    expect(range.reference_variants || []).toEqual([]);
    const evaluated = converter.evaluate('estradiol', { value: 50, unit: 'pmol/L', patient });
    expect(evaluated).toMatchObject({
      ok: true, siValue: 50, status: 'no_interpretation', low: null, high: null, reference_context_required: false,
    });
    expect(evaluated.reference_variants || []).toEqual([]);
  });

  it.each([1, 2, 3, 4, 5])('zachowane stadium Tanner %i nie zastępuje fazy u dorosłej', (tanner) => {
    const { converter } = fixture();
    const patient = { sex: 'F', age: 30, life_stage: 'adult', tanner };
    expectCycleAlternatives(converter, patient);
    for (const [cycle_phase, id, low, high, status] of CYCLE_PHASES) {
      const known = { ...patient, cycle_phase };
      expect(converter.selectRange(converter.find('estradiol'), known)).toMatchObject({ id, low, high });
      expect(converter.evaluate('estradiol', { value: 50, unit: 'pmol/L', patient: known }).status).toBe(status);
    }
  });

  it.each(CYCLE_PHASES)('%s: znany kontekst zachowuje zakres, źródła i dotychczasowe oceny',
    (cycle_phase, id, low, high, status50, status150) => {
      const { converter } = fixture();
      const patient = { sex: 'F', age: 30, life_stage: 'adult', cycle_phase };
      const original = converter.find('estradiol').reference_ranges_si.find((row) => row.id === id);
      expect(converter.selectRange(converter.find('estradiol'), patient)).toMatchObject({
        id, low, high, matched: true, is_default: false, no_interpretation: false,
        context_pl: original.context_pl, source_ids: original.source_ids,
      });
      for (const [value, status] of [[50, status50], [150, status150]]) {
        expect(converter.evaluate('estradiol', { value, unit: 'pmol/L', patient })).toMatchObject({
          ok: true, siValue: value, low, high, status, source_ids: original.source_ids,
        });
      }
      for (const value of [low, high]) {
        expect(converter.evaluate('estradiol', { value, unit: 'pmol/L', patient }).status).toBe('within');
      }
    });

  it.each(['pmol/L', 'nmol/L', 'pg/mL', 'ng/L', 'ng/dL'])('%s: konwersja i brak ustalonej fazy pozostają niezależne', (unit) => {
    const { converter } = fixture();
    const converted = converter.convert({ substanceId: 'estradiol', value: 50, fromUnit: 'pmol/L', toUnit: unit });
    expect(converted.ok).toBe(true);
    const patient = { sex: 'F', age: 30, life_stage: 'adult' };
    expect(converter.evaluate('estradiol', { value: converted.value, unit, patient })).toMatchObject({
      ok: true, status: 'no_interpretation', low: null, high: null, reference_context_required: true,
    });
    expect(converter.evaluate('estradiol', { value: converted.value, unit, patient }).siValue).toBeCloseTo(50, 12);
    for (const [cycle_phase, , , , status] of CYCLE_PHASES) {
      const evaluated = converter.evaluate('estradiol', {
        value: converted.value, unit, patient: { ...patient, cycle_phase },
      });
      expect(evaluated.status).toBe(status);
      expect(evaluated.siValue).toBeCloseTo(50, 12);
    }
  });

  it('zachowuje granicę kontekstu pediatrycznego i zakres mężczyzny', () => {
    const { converter } = fixture();
    const pediatric = { sex: 'F', age: 17.999, life_stage: 'pediatric' };
    expect(converter.selectRange(converter.find('estradiol'), pediatric)).toMatchObject({
      id: 'e2_F_latepubertal_age', low: 0, high: 290, matched: true,
    });
    expect(converter.evaluate('estradiol', { value: 50, unit: 'pmol/L', patient: pediatric }).status).toBe('within');
    expectUnavailable(converter, converter.find('estradiol'), { ...pediatric, age: 18 });
    for (const age of [18, 30, 70]) {
      const patient = { sex: 'M', age, life_stage: 'adult' };
      expect(converter.selectRange(converter.find('estradiol'), patient)).toMatchObject({
        id: 'e2_male_adult', low: 40, high: 160, matched: true,
      });
      expect(converter.evaluate('estradiol', { value: 50, unit: 'pmol/L', patient }).status).toBe('within');
    }
  });

  it('bierze warianty i etykiety z przekazanego deskryptora, bez zmiany danych źródłowych', () => {
    const { converter } = fixture((descriptor) => {
      // Fikcyjne dane izolują kontrakt źródło–silnik; nie stanowią nowej normy E2.
      const variant = descriptor.reference_selection_policy.adult_female_context.variants[0];
      const row = descriptor.reference_ranges_si.find((entry) => entry.id === variant.row_id);
      variant.label = 'Fikcyjny wariant testowy';
      variant.row_id = 'synthetic_e2_reference';
      row.id = variant.row_id;
      row.low = 321;
      row.high = 654;
      row.context_pl = 'Fikcyjna populacja testowa';
      row.source_ids = ['synthetic_e2_source'];
    });
    const descriptor = converter.find('estradiol');
    const original = structuredClone(descriptor);
    const patient = { sex: 'F', age: 30, life_stage: 'adult' };
    const selected = converter.selectRange(descriptor, patient);
    const variant = selected.reference_variants.find((entry) => entry.id === 'synthetic_e2_reference');
    expect(variant).toEqual({
      id: 'synthetic_e2_reference', cycle_phase: 'follicular', label: 'Fikcyjny wariant testowy',
      low: 321, high: 654, context_pl: 'Fikcyjna populacja testowa', source_ids: ['synthetic_e2_source'],
    });
    variant.low = -1;
    variant.source_ids.push('synthetic_local_mutation');
    expect(descriptor).toEqual(original);
    expect(converter.selectRange(descriptor, patient).reference_variants.find((entry) => entry.id === 'synthetic_e2_reference'))
      .toMatchObject({ low: 321, source_ids: ['synthetic_e2_source'] });
  });
});

describe('Estradiol — zachowane dopasowane zakresy i przeliczenia', () => {
  it.each(MATCHED)('%s zachowuje zakres, źródła i ocenę', (id, patient, low, high, status) => {
    const { converter } = fixture();
    const descriptor = converter.find('estradiol');
    const row = descriptor.reference_ranges_si.find((entry) => entry.id === id);
    const range = converter.selectRange(descriptor, patient);
    expect(range).toMatchObject({
      id, low, high, matched: true, is_default: false, no_interpretation: false,
      context_pl: row.context_pl, source_ids: row.source_ids,
    });
    expect(range.source_ids.length).toBeGreaterThan(0);
    expect(converter.evaluate('estradiol', { value: '5', unit: 'pg/mL', patient })).toMatchObject({
      ok: true, low, high, status, source_ids: row.source_ids,
    });
  });

  it.each([
    ['pmol/L', 18.355], ['nmol/L', 0.018355], ['pg/mL', 5], ['ng/L', 5], ['ng/dL', 0.5],
  ])('%s: brak zakresu nie zmienia wartości ani przeliczenia jednostek', (unit, value) => {
    const { converter } = fixture();
    const patient = MISSING_CONTEXT[0][1];
    const evaluation = converter.evaluate('estradiol', { value, unit, patient });
    expect(evaluation).toMatchObject({ ok: true, status: 'no_interpretation', low: null, high: null });
    expect(evaluation.siValue).toBeCloseTo(18.355, 12);
    const converted = converter.convert({ substanceId: 'estradiol', value, fromUnit: unit, toUnit: 'pg/mL' });
    expect(converted.ok).toBe(true);
    expect(converted.value).toBeCloseTo(5, 12);
  });
});

function capture({ converter, snapshot, win }, patient, raw = '5', unit = 'pg/mL') {
  const descriptor = converter.find('estradiol');
  const range = converter.selectRange(descriptor, patient);
  const row = descriptor.reference_ranges_si.find((entry) => entry.id === range.id);
  return snapshot.create({
    analyte: 'estradiol', range, when: row ? row.when : null, patient,
    evaluation: converter.evaluate('estradiol', { value: raw, unit, patient }),
    factorToSi: descriptor.units.find((entry) => entry.symbol === unit).factor_to_si,
    measurement: { raw, sourceUnit: unit },
    sources: range.source_ids.map((id) => {
      const source = converter.findSource(id);
      return { id, label: source.label_short, citation: source.full_cite, url: source.url };
    }),
    versions: { engine: 'LabUnitConverter ' + converter.version, data: 'LabUnitsData ' + win.LabUnitsData.version },
    capturedAtISO: '2026-10-15T12:00:00.000Z',
  });
}

describe('Estradiol — zapis zakresu użytego w dniu przypięcia', () => {
  it('nowy zapis dorosłej bez fazy zachowuje pomiar bez kategorii, granic i niezastosowanych wariantów', () => {
    const producer = fixture();
    const patient = { sex: 'F', age: 30, life_stage: 'adult' };
    const saved = capture(producer, patient, '50', 'pmol/L');
    expect(saved).toMatchObject({
      analyte: 'estradiol', status: 'unavailable', reasonCodes: ['range_no_interpretation'],
      classification: null, display: null,
      context: { sex: 'F', ageYears: 30, lifeStage: 'adult', cyclePhase: null },
      measurement: { raw: '50', sourceValue: 50, sourceUnit: 'pmol/L', siValue: 50, siUnit: 'pmol/L' },
      range: { id: 'estradiol-matched-reference-only', low: null, high: null, noInterpretation: true,
        matched: false, isDefault: false, sourceIds: [], sources: [] },
    });
    expect(saved.range).not.toHaveProperty('reference_variants');
    expect(saved).not.toHaveProperty('reference_variants');
    expect(producer.snapshot.normalize(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
    expect(producer.snapshot.describe(saved)).toMatchObject({
      status: 'unavailable', classification: null, flag: null, bounds: '',
      text: 'bez oceny względem zakresu w dniu przypięcia',
    });
  });

  it('dawny zapis dorosłej z domyślną fazą folikularną pozostaje historycznym zapisem bez ponownej kwalifikacji', () => {
    const previous = fixture((descriptor) => {
      // Starszy producent miał kontekstowy wiersz kobieta + dorosła, a nie default:true.
      delete descriptor.reference_selection_policy;
    });
    const patient = { sex: 'F', age: 30, life_stage: 'adult' };
    const recorded = capture(previous, patient, '50', 'pmol/L');
    expect(recorded).toMatchObject({
      status: 'recorded', classification: 'below', context: { cyclePhase: null },
      range: { id: 'e2_female_default', low: 70, high: 290, matched: true, isDefault: false },
    });
    const current = fixture();
    const evaluate = vi.spyOn(current.converter, 'evaluate');
    const selectRange = vi.spyOn(current.converter, 'selectRange');
    const restored = current.snapshot.normalize(JSON.parse(JSON.stringify(recorded)));
    expect(restored).toEqual(recorded);
    expect(current.snapshot.describe(restored)).toMatchObject({
      status: 'recorded', classification: 'below', flag: '↓', text: 'poniżej zapisanego zakresu',
      bounds: '70–290\u00a0pmol/L',
    });
    expect(evaluate).not.toHaveBeenCalled();
    expect(selectRange).not.toHaveBeenCalled();
  });

  it('rzeczywiste select/evaluate → create → normalize: brak zakresu nie zapisuje kategorii ani granic do wyświetlenia', () => {
    const producer = fixture();
    const saved = capture(producer, MISSING_CONTEXT[0][1]);
    expect(saved).toMatchObject({
      analyte: 'estradiol', status: 'unavailable', reasonCodes: ['range_no_interpretation'],
      classification: null, display: null,
      context: { sex: 'M', ageYears: 0.25, lifeStage: 'pediatric' },
      measurement: { raw: '5', sourceValue: 5, sourceUnit: 'pg/mL', siValue: 18.355, siUnit: 'pmol/L' },
      range: { id: 'estradiol-matched-reference-only', low: null, high: null, noInterpretation: true,
        matched: false, isDefault: false, sourceIds: [], sources: [] },
    });
    expect(producer.snapshot.normalize(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
    expect(producer.snapshot.describe(saved)).toMatchObject({
      status: 'unavailable', classification: null, flag: null, bounds: '',
      text: 'bez oceny względem zakresu w dniu przypięcia',
    });
  });

  it('odczyt istniejącego zapisu domyślnego zakresu nie koryguje historycznej oceny dzisiejszym kontekstem ani polityką', () => {
    // Symulacja starszego producenta wyłącznie na kopii danych. Taki zapis już mógł trafić do sejfu.
    const previous = fixture((descriptor) => { delete descriptor.reference_selection_policy; });
    const recorded = capture(previous, MISSING_CONTEXT[0][1]);
    expect(recorded).toMatchObject({ status: 'recorded', classification: 'far_below',
      range: { id: 'e2_default', low: 70, high: 290, matched: false, isDefault: true } });
    const current = fixture();
    const evaluate = vi.spyOn(current.converter, 'evaluate');
    const selectRange = vi.spyOn(current.converter, 'selectRange');
    const restored = current.snapshot.normalize(JSON.parse(JSON.stringify(recorded)));
    expect(restored).toEqual(recorded);
    // To kontrakt przechowywania, niezależny od sposobu prezentacji dawnych
    // zakresów ogólnych w historii (osobny PR #698).
    expect(evaluate).not.toHaveBeenCalled();
    expect(selectRange).not.toHaveBeenCalled();
  });
});
