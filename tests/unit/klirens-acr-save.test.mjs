import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

function harness() {
  const captured = [];
  const browser = { VildaVault: {
    // Capture-only adapter; the real vault remains locked throughout the test.
    isUnlocked: () => true,
    savePatientNote: async note => { captured.push(note); },
  } };
  for (const file of ['clcr_acr_reference_data.js', 'clcr_acr.js', 'clcr_ui_workflow.js']) loadBrowserScript(file, browser);
  const actualVault = {};
  loadBrowserScript('vilda_vault.js', actualVault);
  return { browser, captured, sanitizer: actualVault.VildaVault };
}

function card(snapshot, overrides = {}) {
  const attrs = {
    'data-clcr-series': 'ACR',
    'data-clcr-value': String(snapshot.rawValue),
    'data-clcr-display-value': snapshot.display.value,
    'data-clcr-acr-snapshot': JSON.stringify(snapshot),
    ...overrides,
  };
  return {
    getAttribute: key => attrs[key] ?? null,
    getClientRects: () => [{ width: 400, height: 200 }],
    classList: { contains: key => key === 'out-of-range' && snapshot.status === 'above' },
    querySelector: () => null,
  };
}

function evaluate(browser, input) {
  return browser.VildaClcrAcr.evaluate({ mode: 'direct', reportedValue: '45', reportedUnit: 'mg/g', ageYears: 8, ...input },
    browser.VildaClcrAcrReferenceData.getProfile('KDIGO_ACR_2024')).snapshot;
}

async function save(browser, captured, sanitizer, snapshot, date = '2026-10-23') {
  const points = browser.ClcrVisitSave.collectActiveDatapoints({ querySelectorAll: () => [card(snapshot)] }, { formulaId: 'ACR' });
  expect(points).toHaveLength(1);
  const saved = await browser.ClcrVisitSave.saveActiveResultToCard({ patientId: 'fictional-acr-only', clinicalDateISO: date, datapoints: points });
  expect(saved).toMatchObject({ ok: true, saved: 1 });
  const note = captured[captured.length - 1];
  const normalized = { ...note, body: sanitizer.sanitizeNoteText(note.body), labResult: sanitizer.sanitizeLabResult(note.labResult) };
  expect(normalized).toEqual(note);
  expect(sanitizer.isUnlocked()).toBe(false);
  return { point: points[0], note: normalized };
}

describe('ACR — zachowanie surowego wyniku i oceny w karcie pacjenta', () => {
  it.each([
    ['29.96', 'A1', 'within', '<30', false],
    ['30', 'A2', 'above', '', true],
    ['300', 'A2', 'above', '', true],
    ['300.0001', 'A3', 'above', '>300', true],
  ])('utrwala niezaokrąglone %s i oryginalną kategorię %s', async (value, category, assessment, boundary, outOfRange) => {
    const { browser, captured, sanitizer } = harness();
    const snapshot = evaluate(browser, { reportedValue: value, sampleType: 'random' });
    const original = JSON.stringify(snapshot);
    const { point, note } = await save(browser, captured, sanitizer, snapshot);
    expect(point).toMatchObject({ valueNum: Number(value), unit: 'mg/g', outOfRange, norm: '<30 mg/g' });
    expect(point.acrSnapshot).toEqual(snapshot);
    expect(note.labResult).toMatchObject({ valueNum: Number(value), value: snapshot.display.text.replace('.', ','), unit: 'mg/g', norm: '<30 mg/g' });
    expect(note.body).toContain(`Wynik przed zaokrągleniem: ${value.replace('.', ',')} mg/g.`);
    expect(note.body).toContain(`Kategoria: ${category}`);
    if (boundary) expect(note.body).toContain(`Granica przed zaokrągleniem: ${boundary}.`);
    for (const expected of ['KDIGO 2024', '2026-10-23', 'KDIGO_ACR_2024; wersja 1', 'wiek', 'próbka losowa']) {
      expect(note.body.toLowerCase()).toContain(expected.toLowerCase());
    }
    browser.VildaClcrAcr = { evaluate() { throw new Error('History must not re-evaluate'); } };
    browser.VildaClcrAcrReferenceData = { getProfile() { throw new Error('History must not replace source'); } };
    const history = browser.ClcrVisitSave.buildSeriesFromNotes([note], { formulaId: 'ACR' });
    expect(history[0].points[0]).toMatchObject({ valueNum: Number(value), displayValue: snapshot.display.text.replace('.', ','), category, assessment, outOfRange, norm: '<30 mg/g' });
    expect(history[0].points[0].acrAssessment).toMatchObject({ ageYears: 8, profileId: 'KDIGO_ACR_2024', profileVersion: '1' });
    expect(JSON.stringify(snapshot)).toBe(original);
  });

  it('przechowuje natywną jednostkę SI i nie łączy jej z mg/g w jednej serii', async () => {
    const { browser, captured, sanitizer } = harness();
    const si = evaluate(browser, { reportedValue: '3', reportedUnit: 'mg/mmol' });
    const conventional = evaluate(browser, { reportedValue: '26.52', reportedUnit: 'mg/g' });
    expect(si.category).toBe('A2');
    expect(conventional.category).toBe('A1');
    const a = await save(browser, captured, sanitizer, si, '2026-10-22');
    const b = await save(browser, captured, sanitizer, conventional);
    expect(a.note.labResult).toMatchObject({ valueNum: 3, unit: 'mg/mmol', norm: '<3 mg/mmol' });
    expect(a.note.body).toContain('Kategoria: A2');
    const history = browser.ClcrVisitSave.buildSeriesFromNotes([a.note, b.note], { formulaId: 'ACR' });
    expect(history).toHaveLength(2);
    expect(history.map(series => series.unit)).toEqual(['mg/mmol', 'mg/g']);
    expect(history.every(series => series.points.length === 1)).toBe(true);
  });

  it.each(['<30', '>300', '≤30', '≥3'])('zachowuje znak %s bez przedstawiania granicy jako dokładnego pomiaru', async reportedValue => {
    const { browser, captured, sanitizer } = harness();
    const snapshot = evaluate(browser, { reportedValue });
    const { point, note } = await save(browser, captured, sanitizer, snapshot);
    expect(point.comparator).toBe(snapshot.comparator);
    expect(note.labResult.value).toBe(snapshot.display.text.replace('.', ','));
    // Other vault charts must not see a censored endpoint as an exact valueNum.
    expect(note.labResult).not.toHaveProperty('valueNum');
    expect(note.body).toContain(`Wynik przed zaokrągleniem: ${reportedValue} mg/g.`);
    const history = browser.ClcrVisitSave.buildSeriesFromNotes([note], { formulaId: 'ACR' });
    expect(history[0].points[0]).toMatchObject({ valueNum: snapshot.rawValue, comparator: snapshot.comparator, displayValue: reportedValue });
    expect(browser.ClcrVisitSave.seriesTrend([{ valueNum: 20 }, history[0].points[0]])).toBeNull();
    expect(browser.ClcrVisitSave.seriesTrend([history[0].points[0], { valueNum: 40 }])).toBeNull();
  });

  it.each([
    [{ ageYears: null }, 'nieznany', 'Uzupełnij wiek'],
    [{ ageYears: 1 }, '1 lat', 'odniesienie pediatryczne'],
    [{ confounders: ['hematuria'], sampleType: 'secondMorning' }, '8 lat', 'krwiomocz'],
  ])('odróżnia brak oceny od normy i zachowuje jego powód %j', async (input, age, reason) => {
    const { browser, captured, sanitizer } = harness();
    const snapshot = evaluate(browser, input);
    const { point, note } = await save(browser, captured, sanitizer, snapshot);
    expect(point.outOfRange).toBeNull();
    expect(note.body).toContain('Ocena: nie oceniono.');
    expect(note.body).toContain('Kategoria: nie nadano');
    expect(note.body).toContain(age);
    expect(note.body.toLowerCase()).toContain(reason.toLowerCase());
    const history = browser.ClcrVisitSave.buildSeriesFromNotes([note], { formulaId: 'ACR' });
    expect(history[0].points[0]).toMatchObject({ outOfRange: null, assessment: 'unassessed', category: null });
  });

  it('zachowuje oryginalne stężenia, jednostki i pochodzenie założenia wspólnej próbki', async () => {
    const { browser, captured, sanitizer } = harness();
    const snapshot = evaluate(browser, { mode: 'concentration', albuminValue: '4.5', albuminUnit: 'mg/dL', creatinineValue: '8.84', creatinineUnit: 'mmol/L', sameSpecimen: 'assumed' });
    const { note } = await save(browser, captured, sanitizer, snapshot);
    expect(note.body).toContain('Tryb: obliczono ze stężeń.');
    expect(note.body).toContain('Albumina w moczu: 4,5 mg/dL.');
    expect(note.body).toContain('Kreatynina w moczu: 8,84 mmol/L.');
    expect(note.body).toContain('Założono, że oznaczenia pochodzą z tej samej próbki moczu.');
    expect(note.body).not.toContain('Potwierdzono');
  });

  it('nie uzupełnia nowej normy ze starszej wizyty i nie ocenia dawnych notatek ponownie', async () => {
    const { browser, captured, sanitizer } = harness();
    const older = await save(browser, captured, sanitizer, evaluate(browser, {}), '2026-10-22');
    const latest = await save(browser, captured, sanitizer, evaluate(browser, { ageYears: null }));
    const legacy = { category: 'wynik-klirens', clinicalDateISO: '2026-01-01', body: 'Kalkulator klirensu · clcr:ACR', labResult: { test: older.note.labResult.test, value: '45', valueNum: 45, unit: 'mg/g' } };
    const before = JSON.stringify(legacy);
    const series = browser.ClcrVisitSave.buildSeriesFromNotes([latest.note, older.note, legacy], { formulaId: 'ACR' })[0];
    expect(series.norm).toBe('');
    expect(series.points[0]).not.toHaveProperty('acrAssessment');
    expect(series.points[0]).not.toHaveProperty('category');
    expect(JSON.stringify(legacy)).toBe(before);
    browser.VildaVault.listPatientNotesForPatient = async () => [latest.note];
    const flow = await browser.ClcrVisitSave.readPatientFlowsheet('fictional-only');
    expect(flow.parameters[0].byDate['2026-10-23'].outOfRange).toBeNull();
  });

  it('odrzuca wadliwy snapshot i nie zmienia zachowania innych parametrów', () => {
    const { browser } = harness();
    const snapshot = evaluate(browser, { reportedValue: '29.96' });
    for (const value of ['{', 'null', '[]', JSON.stringify({ ...snapshot, unit: 'unsupported' }), JSON.stringify({ ...snapshot, status: 'unknown' })]) {
      const points = browser.ClcrVisitSave.collectActiveDatapoints({ querySelectorAll: () => [card(snapshot, { 'data-clcr-acr-snapshot': value })] }, { formulaId: 'ACR' });
      expect(points[0]).not.toHaveProperty('acrSnapshot');
      expect(points[0].valueNum).toBe(29.96);
    }
    const other = card(snapshot, { 'data-clcr-series': 'egfr', 'data-clcr-value': '29.96', 'data-clcr-display-value': '30.0' });
    const points = browser.ClcrVisitSave.collectActiveDatapoints({ querySelectorAll: () => [other] }, { formulaId: 'egfr' });
    expect(points[0].valueNum).toBe(30);
    expect(points[0]).not.toHaveProperty('acrSnapshot');
  });

  it('późniejsza edycja notatki nie przywraca starej liczby ani jej kategorii', async () => {
    const { browser, captured, sanitizer } = harness();
    const { note } = await save(browser, captured, sanitizer, evaluate(browser, { reportedValue: '45' }));
    const edited = { ...note, labResult: { ...note.labResult, value: '15', valueNum: 15 } };
    const series = browser.ClcrVisitSave.buildSeriesFromNotes([edited], { formulaId: 'ACR' });
    expect(series[0].points[0]).toMatchObject({ valueNum: 15, outOfRange: null });
    expect(series[0].points[0]).not.toHaveProperty('category');
    expect(series[0].points[0]).not.toHaveProperty('acrAssessment');
  });
});
