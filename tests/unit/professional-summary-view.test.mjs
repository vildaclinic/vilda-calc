import { describe, expect, it } from 'vitest';
import { funkcjaZ, oknoZSilnikiem, wczytajDoOkna, zrodlo } from '../support/silnik-bmi.mjs';

function setup({ weight = 44, height = 155, source = 'PALCZEWSKA', weightCentile = 57, heightCentile = 61 } = {}) {
  const win = oknoZSilnikiem();
  wczytajDoOkna(win, 'vilda_masa.js');
  wczytajDoOkna(win, 'vilda_growth_prediction_lines.js');
  wczytajDoOkna(win, 'vilda_professional_summary.js');
  const values = { weight, height, age: 12, ageMonths: 0, sex: 'F' };
  const doc = { getElementById: id => values[id] === undefined ? null : { value: String(values[id]) } };
  const bmi = win.VildaBmi.ocen({ bmi: weight / (height / 100) ** 2, plec: 'F', wiekMies: 144, zrodlo: source });
  const cole = win.VildaBmi.cole({ bmi: bmi.bmi, plec: 'F', wiekMies: 144, zrodlo: source });
  win.lastBmiKategoria = bmi.kategoria;
  win.colePercentValue = cole.cole;
  win.lastWeightPercentile = weightCentile;
  win.lastHeightPercentile = heightCentile;
  const tone = new Function('window', 'document', 'getAgeDecimal', 'BMI', 'CHILD_AGE_MIN', 'CHILD_AGE_MAX', 'bmiKategoriaChild',
    funkcjaZ(zrodlo('vilda_patient_report.js'), 'getProfessionalSummaryLineTone') + '\nreturn getProfessionalSummaryLineTone;')(
    win, doc, () => 12, (kg, cm) => kg / (cm / 100) ** 2, 0, 18, () => bmi.kategoria,
  );
  const lines = [
    `Waga: ${weight} kg, ${weightCentile} centyl (wSDS +0,17)`,
    `Wzrost: ${height} cm, ${heightCentile} centyl (hSDS +0,28)`,
    `BMI: ${bmi.bmi.toFixed(1)} kg/m² – ${bmi.centyl.toFixed(1)} centyl (bmiSDS +0,11)`,
    'Pow. ciała: 1,37 m²',
    `Wskaźnik Cole’a: ${cole.cole.toFixed(1)} %`,
    'Proporcja masy do wysokości: 38 centyl (Z-score = -0,32)',
    'Tempo wzrastania: 7,8 cm/rok (z 17 mies., poza oknem oceny normy)',
    'SDS tempa: +0,6 (73 centyl) — wg Duran i wsp., J Pediatr Endocrinol Metab 2025',
    'MPH: 165,5 cm – centyl: 49, mpSDS −0,03',
    'hSDS - mpSDS: +0,30',
    'Prognoza wzrostu ostatecznego (metoda Khamis-Roche): 168,1 cm (±4,3 cm)',
  ];
  return { win, lines, tone, bmi, cole, build: input => win.VildaProfessionalSummary.build(input || lines, { isChild: true, tone }) };
}

describe('Professional summary presentation uses existing results without changing the copy lines', () => {
  it('orders all ten main rows and retains all other conditional content', () => {
    const { build, lines } = setup();
    const extra = ['RR skurczowe: 110 mmHg, 54 centyl', 'Tętno: 80/min, 50 centyl', 'Normy żywieniowe: przykładowa linia', 'Obwód głowy: 50 cm, 40 centyl'];
    const before = [...lines, ...extra];
    const model = build(before);
    expect(model.main.map(row => row.key)).toEqual(['weight', 'height', 'bmi', 'cole', 'velocity', 'velocity-sds', 'mph', 'delta', 'prediction', 'bsa']);
    expect(model.extra.map(row => row.original)).toEqual([lines[5], ...extra]);
    expect(model.main.find(row => row.key === 'velocity-sds').text).toBe('SDS tempa: +0,6 (73 centyl)');
    expect(before).toEqual([...lines, ...extra]);
    expect(before[7]).toContain('Duran');
  });

  it('normal BMI and Cole have the same explicit assessment; descriptive results do not', () => {
    const { build, bmi, cole } = setup();
    expect(bmi.kategoria.klucz).toBe('prawidlowe');
    expect(cole.kategoria.klucz).toBe('norma');
    const rows = Object.fromEntries(build().main.map(row => [row.key, row]));
    for (const key of ['weight', 'height', 'bmi', 'cole', 'mph', 'delta']) {
      expect(rows[key].tone, key).toBe('normal');
      expect(rows[key].assessment, key).toBe('normal');
    }
    for (const key of ['velocity', 'velocity-sds', 'prediction', 'bsa']) expect(rows[key].assessment, key).toBe('unassessed');
  });

  it.each(['OLAF', 'PALCZEWSKA'])('native overweight BMI and obesity Cole keep their separate classifications (%s)', source => {
    const { build, bmi, cole } = setup({ source, weight: 58, weightCentile: 94 });
    const rows = Object.fromEntries(build().main.map(row => [row.key, row]));
    expect(bmi.kategoria.klucz).toBe('nadwaga');
    expect(cole.kategoria.klucz).toBe('otylosc');
    expect(rows.bmi).toMatchObject({ tone: 'warn', assessment: 'abnormal', badge: 'Nadwaga wg BMI' });
    expect(rows.cole).toMatchObject({ tone: 'danger', assessment: 'abnormal', badge: 'Otyłość wg Cole’a' });
    expect(rows.weight.badge).toBe('Wysoka masa dla wieku');
    expect(rows.weight.badge).not.toMatch(/nadwaga|otyłość/i);
    expect(Object.values(rows).some(row => row.badge.includes('!'))).toBe(false);
  });

  it('missing results remain ten gray placeholders, never fabricated values or a normal interpretation', () => {
    const { build } = setup();
    const model = build([]);
    expect(model.main).toHaveLength(10);
    expect(model.main.every(row => row.assessment === 'unassessed' && row.tone === 'normal' && row.badge === '')).toBe(true);
    expect(model.main.find(row => row.key === 'velocity').text).toContain('Brak wcześniejszego pomiaru');
  });

  it('missing native categories cannot turn a line green just because it has no alert', () => {
    const { win, build } = setup();
    win.lastBmiKategoria = null;
    win.colePercentValue = null;
    win.lastWeightPercentile = null;
    win.lastHeightPercentile = null;
    const rows = Object.fromEntries(build().main.map(row => [row.key, row]));
    for (const key of ['weight', 'height', 'bmi', 'cole']) expect(rows[key].assessment, key).toBe('unassessed');
  });

  it('preserves selected consensus and all remaining methods, including the explanatory note', () => {
    const { win, build, lines } = setup();
    const consensus = 'Prognoza wzrostu ostatecznego (konsensus metod): 165,0 cm ±4,3 cm';
    win.advancedGrowthData = { finalHeightPrediction: {}, motherHeight: 165, fatherHeight: 182 };
    win.VildaAdvancedGrowth = { advGrowthBuildConsensusSummaryLines: () => [consensus] };
    const model = build([...lines, consensus]);
    expect(model.main.find(row => row.key === 'prediction').text).toBe(consensus);
    expect(model.extra.map(row => row.text)).toContain(lines.at(-1));
    expect(model.extra.map(row => row.text)).toContain('Wzrost mamy: 165 cm');
    expect(model.extra.map(row => row.text)).toContain('Wzrost taty: 182 cm');
    expect(model.predictionNote).toBe(true);
  });

  it('long velocity shows its verdict compactly while keeping exact context in the disclosure', () => {
    const { build } = setup();
    const original = 'Tempo wzrastania: 2,0 cm/rok (z 12 mies.) — do oceny, norma ≥4 cm/rok w trakcie pokwitania (Tanner II)';
    const model = build([original]);
    const velocity = model.main.find(row => row.key === 'velocity');
    expect(velocity).toMatchObject({ text: 'Tempo wzrastania: 2,0 cm/rok (z 12 mies.)', tone: 'warn', badge: 'Do oceny', original });
    expect(model.extra[0]).toMatchObject({ key: 'velocity-context', text: original, assessment: 'unassessed' });
  });
});
