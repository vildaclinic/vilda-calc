import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const require = createRequire(import.meta.url);
const presentation = require('../../vilda_lab_result_presentation.js');
const PATIENT = 'fictional-compact-clcr-history';
const DATE = '2026-10-25';
function environment(files = [], extra = {}) {
  const browser = { ...extra };
  for (const file of [...files, 'clcr_saved_results.js']) loadBrowserScript(file, browser);
  return { browser, api: browser.ClcrSavedResults };
}
function legacy(api, outputId, id, patch = {}) {
  const parameter = api.getParam(outputId);
  const note = { id, patientId: PATIENT, rev: 1, category: 'wynik-klirens', clinicalDateISO: DATE,
    title: parameter.label, body: `Kalkulator klirensu · ${parameter.testKey}`,
    labResult: { test: parameter.label, value: '45', valueNum: 45, unit: parameter.unit } };
  return { ...note, ...patch, labResult: { ...note.labResult, ...patch.labResult } };
}
function projection(context, notes) { return context.api.projectPatientNotes(notes, { patientId: PATIENT }); }
function acr(context, raw = '45', id = 'fictional-acr') {
  const saved = context.browser.VildaClcrAcr.evaluate({ mode: 'direct', reportedValue: raw,
    reportedUnit: 'mg/g', ageYears: 10, sampleType: 'random' },
  context.browser.VildaClcrAcrReferenceData.getProfile('KDIGO_ACR_2024')).snapshot;
  const point = { ...context.api.getParam('ACR'), valueNum: saved.rawValue, unit: saved.unit,
    displayValue: saved.display.text, acrSnapshot: saved, outOfRange: saved.status === 'unassessed' ? null : saved.status === 'above',
    norm: saved.referenceAvailable ? `${saved.reference.limit} ${saved.unit}` : '' };
  return { ...context.api.buildPatientNotePayload(point, { patientId: PATIENT, clinicalDateISO: DATE }), id, rev: 1 };
}
function recordedCapture(capture) {
  const forbidden = vi.fn(() => { throw new Error('No historical recalculation'); });
  const context = environment([], { ClcrSavedCalculation: { hasSaved: () => true,
    readSaved: () => ({ valid: true, kind: 'exact', snapshot: { schema: 'fictional-owner-validated' },
      rawValue: 97, valueNum: 97, displayValue: '97', unit: 'mL/min/1,73 m²', comparator: '',
      category: 'G1', assessment: 'within', tone: 'success', norm: '≥90 mL/min/1,73 m²',
      reference: { bounds: { low: 90, high: null, lowInclusive: true, highInclusive: false } }, ...capture }),
    recalculate: forbidden } });
  const note = legacy(context.api, 'ckid_u25', 'fictional-recorded', { labResult: { value: '97', valueNum: 97 } });
  return { ...context, projected: projection(context, [note]), forbidden };
}
function oxDzmContext() {
  return environment(['clcr_ox_dzm_reference_data.js', 'clcr_ox_dzm.js',
    'clcr_ox_dzm_persistence.js', 'clcr_saved_calculation.js']);
}
function oxDzmRecord(context, patch = {}, id = 'fictional-ox-daily') {
  const browser = context.browser;
  const values = { OXDZM_inputMode: 'reported', OXDZM_reportedValue: '0.3',
    OXDZM_reportedUnit: 'mmol/24h', OXDZM_collectionHours: '24', age: '40', ...patch };
  const model = browser.VildaClcrOxDzm.evaluate(browser.VildaClcrOxDzm.inputFromValues(values),
    browser.ClcrOxDzmReferenceData.DEFAULT_POLICY);
  expect(model.valid).toBe(true);
  const point = { ...context.api.getParam('Ox_total24') };
  expect(browser.ClcrOxDzmPersistence.augmentDatapoint({ getAttribute: () => JSON.stringify(model) }, point)).toBe(true);
  const note = { ...context.api.buildPatientNotePayload(point, { patientId: PATIENT, clinicalDateISO: DATE }), id, rev: 1 };
  const capture = { values, fields: Object.keys(values).map(id => ({ id, label: id, type: 'text' })) };
  const snapshot = browser.ClcrSavedCalculation.createSnapshot(point, { capture, clinicalDateISO: DATE });
  expect(snapshot).not.toBeNull();
  note.body += '\n\n' + browser.ClcrSavedCalculation.serializeSnapshot(snapshot, note);
  return { note, model };
}


function citDzmContext() {
  return environment(['clcr_cit_dzm_reference_data.js', 'clcr_cit_dzm.js',
    'clcr_cit_dzm_persistence.js', 'clcr_saved_calculation.js']);
}
function citDzmRecord(context, patch = {}, id = 'fictional-cit-daily') {
  const browser = context.browser;
  const values = { CITDZM_inputMode: 'reported', CITDZM_reportedValue: '1.7',
    CITDZM_reportedUnit: 'mmol/24h', CITDZM_collectionHours: '24', age: '40', sex: 'M', ...patch };
  const model = browser.VildaClcrCitDzm.evaluate(browser.VildaClcrCitDzm.inputFromValues(values),
    browser.ClcrCitDzmReferenceData.DEFAULT_POLICY);
  expect(model.valid).toBe(true);
  const point = { ...context.api.getParam('Cit_total24') };
  expect(browser.ClcrCitDzmPersistence.augmentDatapoint({ getAttribute: () => JSON.stringify(model) }, point)).toBe(true);
  const note = { ...context.api.buildPatientNotePayload(point, { patientId: PATIENT, clinicalDateISO: DATE }), id, rev: 1 };
  const capture = { values, fields: Object.keys(values).map(id => ({ id, label: id, type: 'text' })) };
  const snapshot = browser.ClcrSavedCalculation.createSnapshot(point, { capture, clinicalDateISO: DATE });
  expect(snapshot).not.toBeNull();
  note.body += '\n\n' + browser.ClcrSavedCalculation.serializeSnapshot(snapshot, note);
  return { note, model };
}

describe('Zwięzłe Badania: projekcja zapisów Klirensu bez ponownego obliczania', () => {
  it('zachowuje wszystkie 47 tożsamości, w tym osobne dobowe szczawiany i cytryniany, i ich dokładne neutralne punkty', () => {
    const c = environment();
    expect(c.api.PARAM_DICTIONARY).toHaveLength(47);
    expect(c.api.getParam('Ox_total24')).toMatchObject({ id: 'Ox_total24', sourceFormulaId: 'Ox_mgkg' });
    expect(c.api.getParam('Cit_total24')).toMatchObject({ id: 'Cit_total24', sourceFormulaId: 'Cit_mgkg', unit: 'mmol/24 h' });
    expect(c.api.getParam('Cit_mgkg')).toMatchObject({ id: 'Cit_mgkg', unit: 'mg/kg/24 h' });
    const notes = c.api.PARAM_DICTIONARY.map((parameter, index) => legacy(c.api, parameter.id, `fictional-all-${index}`,
      { labResult: { value: String(index + 1), valueNum: index + 1 } }));
    const report = projection(c, notes), before = JSON.stringify(report);
    const series = presentation.clcrSeries(report);
    expect(series).toHaveLength(47);
    expect(series.flatMap(group => group.entries)).toHaveLength(47);
    expect(series.flatMap(group => group.chart.points)).toHaveLength(47);
    expect(series.flatMap(group => group.entries).every(entry => presentation.describe(entry).tone === 'neutral')).toBe(true);
    expect(series.flatMap(group => group.entries).map(entry => entry.noteId).sort()).toEqual(notes.map(note => note.id).sort());
    expect(JSON.stringify(report)).toBe(before);
  });

  it('nie łączy historycznych cytrynianów mg/kg z nowym typowanym wynikiem dobowym', () => {
    const c = citDzmContext(), { note } = citDzmRecord(c);
    const old = legacy(c.api, 'Cit_mgkg', 'fictional-cit-mgkg');
    const report = projection(c, [old, note]), series = presentation.clcrSeries(report);
    expect(series).toHaveLength(2);
    const previous = series.find(item => item.parameterKey === 'clcr:Cit_mgkg');
    const current = series.find(item => item.parameterKey === 'clcr:Cit_total24');
    expect(previous).toMatchObject({ unit: 'mg/kg/24 h', sourceFormulaId: 'Cit_mgkg' });
    expect(current).toMatchObject({ unit: 'mmol/24 h', sourceFormulaId: 'Cit_mgkg', basis: 'citrate-amount' });
    expect(previous.entries[0]).toMatchObject({ kind: 'legacy', recordedValue: 45, recordedUnit: 'mg/kg/24 h' });
    expect(current.entries[0]).toMatchObject({ kind: 'exact', recordedValue: 1.7, recordedUnit: 'mmol/24 h' });
    expect(previous.chart.points.map(point => point.v)).toEqual([45]);
    expect(current.chart.points.map(point => point.v)).toEqual([1.7]);
    expect(previous.key).not.toBe(current.key);
    expect(presentation.describe(previous.entries[0])).toMatchObject({ tone: 'neutral', norms: [], normText: '—' });
  });

  it('nazywa molowe cytryniany, jon i kwas po polsku oraz zachowuje trzy oddzielne serie', () => {
    const c = citDzmContext();
    const cases = [
      [{}, 'citrate-amount', 'Ilość molowa cytrynianów'],
      [{ CITDZM_reportedValue: '321.4683', CITDZM_reportedUnit: 'mg/24h', CITDZM_reportingEntity: 'citrate_ion' }, 'citrate-ion', 'Jon cytrynianowy'],
      [{ CITDZM_reportedValue: '326.60995', CITDZM_reportedUnit: 'mg/24h', CITDZM_reportingEntity: 'citric_acid' }, 'citric-acid', 'Kwas cytrynowy bezwodny'],
    ];
    const saved = cases.map(([patch], index) => citDzmRecord(c, patch, `fictional-cit-basis-${index}`));
    const report = projection(c, saved.map(item => item.note)), original = JSON.stringify(report);
    const series = presentation.clcrSeries(report);
    expect(series).toHaveLength(3);
    for (const [index, [, basis, basisLabel]] of cases.entries()) {
      const record = report.measurements.find(item => item.noteId === saved[index].note.id);
      const group = series.find(item => item.basis === basis);
      expect(group).toMatchObject({ key: 'clcr:' + record.seriesKey, basis, basisLabel, parameterKey: 'clcr:Cit_total24' });
      expect(group.entries[0].clcrRecord).toBe(record);
      expect(group.chart.points[0].v).toBe(saved[index].model.rawValue);
      expect(record.reference.bounds).toMatchObject({ low: saved[index].model.reference.lower, high: null, lowInclusive: true });
      expect(presentation.describeClcr(record)).toMatchObject({ tone: 'within', symbol: '', norms: [{ low: saved[index].model.reference.lower, high: null }] });
    }
    expect(JSON.stringify(report)).toBe(original);
  });

  it.each([
    ['poniżej normy', { CITDZM_reportedValue: '1.2' }, 'below', '↓', true],
    ['dorosły na włączonej granicy', {}, 'within', '', true],
    ['dziecko na wyłączonej granicy', { age: '10', weight: '100', height: '107.7444', CITDZM_reportedValue: '1.9' }, 'below', '↓', false],
  ])('odtwarza dolną normę i zamrożoną ocenę Cit: %s', (_label, patch, tone, symbol, inclusive) => {
    const c = citDzmContext(), { note, model } = citDzmRecord(c, patch), original = JSON.stringify(note);
    const forbidden = vi.fn(() => { throw new Error('Do not re-evaluate frozen citrate history'); });
    c.browser.VildaClcrCitDzm = { evaluate: forbidden, inputFromValues: forbidden };
    c.browser.ClcrCitDzmReferenceData = { get DEFAULT_POLICY() { return forbidden(); } };
    const [record] = projection(c, [note]).measurements;
    expect(record).toMatchObject({ status: 'recorded', interpretation: model.interpretation,
      reference: { bounds: { low: model.reference.lower, high: null, lowInclusive: inclusive } } });
    expect(presentation.describeClcr(record)).toMatchObject({ value: model.rawValue, tone, symbol,
      normText: model.presentation.referenceText,
      norms: [{ low: model.reference.lower, high: null, eligible: true, conditional: false, tone }] });
    expect(forbidden).not.toHaveBeenCalled();
    expect(JSON.stringify(note)).toBe(original);
  });

  it.each([
    ['zero z zachowaną normą', { CITDZM_reportedValue: '0' }, true],
    ['zbiórka 12 godzin', { CITDZM_collectionHours: '12', CITDZM_collectionSource: 'hours' }, false],
    ['historycznie nieznany czas', { CITDZM_collectionHours: '', CITDZM_collectionSource: 'historical-missing', CITDZM_durationNeedsConfirmation: true }, false],
    ['brak płci', { sex: '' }, false],
    ['niemowlę', { age: '0', ageMonths: '6', weight: '7', height: '65' }, false],
    ['nieznana postać masowa', { CITDZM_reportedValue: '400', CITDZM_reportedUnit: 'mg/24h' }, false],
  ])('zachowuje neutralny zapisany komentarz Cit: %s, bez ponownego obliczenia', (_label, patch, hasReference) => {
    const c = citDzmContext(), { note, model } = citDzmRecord(c, patch), original = JSON.stringify(note);
    const forbidden = vi.fn(() => { throw new Error('Do not re-evaluate frozen citrate history'); });
    c.browser.VildaClcrCitDzm = { evaluate: forbidden, inputFromValues: forbidden };
    c.browser.ClcrCitDzmReferenceData = { get DEFAULT_POLICY() { return forbidden(); } };
    const [record] = projection(c, [note]).measurements;
    expect(record).toMatchObject({ status: 'recorded', tone: 'neutral', assessment: 'unassessed', interpretation: model.interpretation });
    expect(model.interpretation).not.toBe('');
    const shown = presentation.describeClcr(record);
    expect(shown).toMatchObject({ value: model.rawValue, tone: 'neutral', symbol: '',
      warning: model.interpretation, warningKind: 'reference', normText: hasReference ? model.presentation.referenceText : '—' });
    expect(shown.norms).toHaveLength(hasReference ? 1 : 0);
    if (hasReference) expect(shown.norms[0]).toMatchObject({ conditional: true, tone: 'neutral', low: model.reference.lower, high: null });
    expect(presentation.clcrSeries({ measurements: [record] })[0].chart.points[0].v).toBe(model.rawValue);
    expect(forbidden).not.toHaveBeenCalled();
    expect(JSON.stringify(note)).toBe(original);
  });

  it('nazywa trzy postacie dobowych szczawianów po polsku bez zmiany zapisanych kluczy serii', () => {
    const c = oxDzmContext();
    const cases = [
      [{}, 'oxalate-amount', 'Ilość molowa szczawianów'],
      [{ OXDZM_reportedValue: '30', OXDZM_reportedUnit: 'mg/24h', OXDZM_reportingEntity: 'oxalate_ion' }, 'oxalate-ion', 'Jon szczawianowy'],
      [{ OXDZM_reportedValue: '30', OXDZM_reportedUnit: 'mg/24h', OXDZM_reportingEntity: 'oxalic_acid' }, 'oxalic-acid', 'Kwas szczawiowy bezwodny'],
    ];
    const notes = cases.map(([patch], index) => oxDzmRecord(c, patch, `fictional-ox-basis-${index}`).note);
    const report = projection(c, notes), original = JSON.stringify(report);
    const series = presentation.clcrSeries(report);
    expect(series).toHaveLength(3);
    for (const [index, [, basis, basisLabel]] of cases.entries()) {
      const record = report.measurements.find(item => item.noteId === notes[index].id);
      const group = series.find(item => item.basis === basis);
      expect(group).toMatchObject({ key: 'clcr:' + record.seriesKey, basis, basisLabel, parameterKey: 'clcr:Ox_total24' });
      expect(group.entries[0].clcrRecord).toBe(record);
      expect(group.chart.points[0].v).toBe(record.valueNum);
    }
    expect(JSON.stringify(report)).toBe(original);
  });

  it.each([
    ['niskie eGFR', { egfr: '25' }, true],
    ['zbiórka 12 godzin', { OXDZM_collectionHours: '12', OXDZM_collectionSource: 'hours' }, false],
    ['niepełna zbiórka', { Cl24CollectionProblem: true }, false],
    ['historycznie nieznany czas', { OXDZM_collectionHours: '', OXDZM_collectionSource: 'historical-missing', OXDZM_durationNeedsConfirmation: true }, false],
    ['brak wieku', { age: '' }, false],
    ['brak BSA dziecka', { age: '10' }, false],
    ['nieznana postać masowa', { OXDZM_reportedValue: '30', OXDZM_reportedUnit: 'mg/24h' }, false],
  ])('zachowuje neutralny zapisany komentarz Ox: %s, bez ponownego obliczenia', (_label, patch, hasReference) => {
    const c = oxDzmContext(), { note, model } = oxDzmRecord(c, patch);
    const original = JSON.stringify(note);
    const forbidden = vi.fn(() => { throw new Error('Do not re-evaluate a frozen Ox result'); });
    c.browser.VildaClcrOxDzm = { evaluate: forbidden, inputFromValues: forbidden };
    c.browser.ClcrOxDzmReferenceData = { get DEFAULT_POLICY() { return forbidden(); } };
    const [record] = projection(c, [note]).measurements;
    expect(record).toMatchObject({ status: 'recorded', tone: 'neutral', assessment: 'unassessed' });
    expect(model.interpretation).not.toBe('');
    const result = presentation.describeClcr(record);
    expect(result).toMatchObject({ value: model.rawValue, tone: 'neutral', symbol: '',
      warning: model.interpretation, warningKind: 'reference', normText: hasReference ? record.norm : '—' });
    expect(result.norms).toHaveLength(hasReference ? 1 : 0);
    if (hasReference) expect(result.norms[0]).toMatchObject({ conditional: true, tone: 'neutral', high: model.reference.upper });
    expect(presentation.clcrSeries({ measurements: [record] })[0].chart.points[0].v).toBe(model.rawValue);
    expect(forbidden).not.toHaveBeenCalled();
    expect(JSON.stringify(note)).toBe(original);
  });

  it('nie rozszerza komentarzy neutralnych na inne anality ani nie zmienia ostrzeżenia EAU', () => {
    const c = oxDzmContext(), { note, model } = oxDzmRecord(c, { OXDZM_reportedValue: '0.44' });
    const [record] = projection(c, [note]).measurements;
    expect(presentation.describeClcr(record)).toMatchObject({ value: .44, tone: 'neutral', symbol: '',
      warning: model.interpretation, warningKind: 'clinical', normText: '<0,46 mmol/24 h' });
    const other = recordedCapture({ tone: 'neutral', assessment: 'unassessed', interpretation: 'Zapisany komentarz innego analitu.' });
    expect(presentation.describeClcr(other.projected.measurements[0])).toMatchObject({ tone: 'neutral', warning: '', warningKind: '' });
  });

  it('ujemny legacy UAG i dokładne zero zachowują liczbę oraz zapis właściciela projekcji', () => {
    const c = environment();
    const report = projection(c, [-15, 0, -0].map((value, index) => legacy(c.api, 'AGu_spot', `fictional-uag-${index}`,
      { labResult: { value: Object.is(value, -0) ? '-0' : String(value), valueNum: value } })));
    const [series] = presentation.clcrSeries(report);
    expect(series.chart.points.map(point => point.v)).toEqual([-15, 0, -0]);
    // The existing owner localizes a recorded negative zero as "0". The new
    // presentation keeps that display and does not change the projected number.
    expect(series.entries.map(entry => entry.display)).toEqual(['-15\u00a0mmol/L', '0\u00a0mmol/L', '0\u00a0mmol/L']);
    for (const entry of series.entries) expect(presentation.describe(entry)).toMatchObject({ tone: 'neutral', symbol: '', norms: [], normText: '—' });
  });

  it('nie zmienia operatorów, nie imputuje tekstu ani nie dopisuje brakującej daty', () => {
    const c = environment();
    const notes = [
      legacy(c.api, 'ACR', 'fictional-censored', { labResult: { value: '<18', valueNum: undefined } }),
      legacy(c.api, 'ACR', 'fictional-text', { labResult: { value: 'Nie oznaczono.', valueNum: undefined } }),
      legacy(c.api, 'ACR', 'fictional-no-date', { clinicalDateISO: '' }),
      legacy(c.api, 'ACR', 'fictional-no-unit', { labResult: { unit: 'unknown-native-unit' } }),
    ];
    const report = projection(c, notes), series = presentation.clcrSeries(report);
    const entries = series.flatMap(group => group.entries), entriesById = Object.fromEntries(entries.map(entry => [entry.noteId, entry]));
    expect(entries).toHaveLength(4);
    expect(entriesById['fictional-censored'].display).toContain('<18');
    expect(entriesById['fictional-text'].display).toContain('Nie oznaczono.');
    expect(entriesById['fictional-no-date'].dateISO).toBeNull();
    expect(entriesById['fictional-no-unit'].unit).toBe('unknown-native-unit');
    expect(series.flatMap(group => group.chart.points).map(point => point.noteId)).toEqual(['fictional-no-unit']);
    expect(series.flatMap(group => group.chart.gaps).map(gap => gap.noteId).sort()).toEqual(['fictional-censored', 'fictional-text']);
  });

  it.each([['15', 'within', ''], ['45', 'above', '↑']])('odtwarza rzeczywisty zapis ACR %s z jego oceną i operatorem normy', (raw, tone, symbol) => {
    const c = environment(['clcr_acr_reference_data.js', 'clcr_acr.js']);
    const note = acr(c, raw), original = JSON.stringify(note);
    const forbidden = vi.fn(() => { throw new Error('Do not re-evaluate'); });
    c.browser.VildaClcrAcr = { evaluate: forbidden };
    c.browser.VildaClcrAcrReferenceData = { getProfile: forbidden };
    const [record] = projection(c, [note]).measurements;
    expect(record.status).toBe('recorded');
    expect(presentation.describeClcr(record)).toMatchObject({ value: Number(raw), tone, symbol,
      normText: '<30 mg/g', norms: [{ low: null, high: 30, unit: 'mg/g', eligible: true, tone }] });
    expect(forbidden).not.toHaveBeenCalled();
    expect(JSON.stringify(note)).toBe(original);
  });

  it('zachowuje zapisany limit ACR <30 bez dokładnego punktu i zielonego werdyktu', () => {
    const c = environment(['clcr_acr_reference_data.js', 'clcr_acr.js']);
    const report = projection(c, [acr(c, '<30')]);
    expect(presentation.describeClcr(report.measurements[0])).toMatchObject({ value: null, tone: 'neutral', symbol: '', normText: '<30 mg/g' });
    expect(presentation.clcrSeries(report)[0].chart.points).toHaveLength(0);
  });

  it('przybliżona zapisana norma Ox/Cr zachowuje autorytatywny kierunek, ale nie tworzy dokładnej linii', () => {
    const c = environment(['clcr_oxcr_reference_data.js', 'clcr_oxcr.js', 'clcr_oxcr_persistence.js']);
    const saved = c.browser.VildaClcrOxcr.evaluate({ mode: 'direct', reportedValue: '60.00100', reportedUnit: 'mg/mg:acid',
      ageYears: 8, sex: 'M' }, c.browser.VildaClcrOxcrReferenceData.DEFAULT_POLICY).snapshot;
    const point = { ...c.api.getParam('OxCr_spot'), valueNum: saved.rawValue };
    c.browser.ClcrOxcrPersistence.augmentDatapoint({ getAttribute: () => JSON.stringify(saved) }, point);
    const note = { ...c.api.buildPatientNotePayload(point, { patientId: PATIENT, clinicalDateISO: DATE }), id: 'fictional-approximate-oxcr' };
    const [record] = projection(c, [note]).measurements;
    expect(record).toMatchObject({ status: 'recorded', assessment: 'above', norm: '≤≈0,0478 mg/mg', reference: { bounds: null } });
    expect(presentation.describeClcr(record)).toMatchObject({ tone: 'above', symbol: '↑', normText: record.norm,
      norms: [{ low: null, high: null, eligible: false, tone: 'above' }] });
  });

  it('prawdziwa zapisana FENa i udział K/(K+Na) nie otrzymują wymyślonej normy', () => {
    const c = environment(['clcr_fena_reference_data.js', 'clcr_fena.js', 'clcr_fena_persistence.js',
      'clcr_potassium_index_data.js', 'clcr_potassium_index.js', 'clcr_potassium_index_persistence.js', 'clcr_saved_calculation.js']);
    const fena = c.browser.VildaClcrFena.evaluate({ urineSodium: '1.4', serumSodium: '140', urineCreatinine: '100',
      urineCreatinineUnit: 'mg/dL', serumCreatinine: '1', serumCreatinineUnit: 'mg/dL', ageYears: 8 }, c.browser.VildaClcrFenaReferenceData.DEFAULT_POLICY);
    const potassium = c.browser.VildaClcrPotassiumIndex.evaluate({ potassiumValue: '60', sodiumValue: '20' }, c.browser.VildaClcrPotassiumIndexData.getProfile('KFR_2026_11'));
    const notes = [['FENa_spot', fena, 'ClcrFenaPersistence'], ['K_frac', potassium, 'ClcrPotassiumIndexPersistence']].map(([formula, result, helper]) => {
      const point = { ...c.api.getParam(formula), valueNum: result.rawValue };
      c.browser[helper].augmentDatapoint({ getAttribute: () => JSON.stringify(result.snapshot || result) }, point);
      const payload = c.api.buildPatientNotePayload(point, { patientId: PATIENT, clinicalDateISO: DATE });
      if (formula === 'K_frac') {
        const values = { U_K: '60', U_Na: '20' };
        const capture = { values, fields: Object.keys(values).map(id => ({ id, label: id, type: 'text', required: true })) };
        const saved = c.browser.ClcrSavedCalculation.createSnapshot(point, { capture });
        expect(saved).not.toBeNull();
        payload.body += '\n\n' + c.browser.ClcrSavedCalculation.serializeSnapshot(saved, payload);
      }
      return { ...payload, id: `fictional-no-norm-${formula}` };
    });
    const report = projection(c, notes);
    expect(report.measurements).toHaveLength(2);
    for (const record of report.measurements) {
      expect(record).toMatchObject({ status: 'recorded', assessment: 'unassessed', norm: '' });
      expect(presentation.describeClcr(record)).toMatchObject({ value: record.valueNum, tone: 'neutral', symbol: '', normText: '—', norms: [] });
    }
  });

  it('nie wskrzesza nieaktualnej oceny lub punktu po zmianie wartości', () => {
    const c = environment(['clcr_acr_reference_data.js', 'clcr_acr.js']);
    const saved = acr(c), edited = { ...saved, labResult: { ...saved.labResult, value: '15', valueNum: 15 } };
    const report = projection(c, [edited]);
    expect(report.measurements[0].status).toBe('invalidated');
    expect(presentation.describeClcr(report.measurements[0])).toMatchObject({ value: null, tone: 'neutral', symbol: '', norms: [], warningKind: 'invalidated' });
    expect(presentation.clcrSeries(report)[0].chart.points).toHaveLength(0);
  });

  it('nieczytelna ocena nie usuwa zachowanej dokładnej liczby ani nie przywraca normy', () => {
    const c = environment(['clcr_acr_reference_data.js', 'clcr_acr.js'], {
      ClcrSavedCalculation: { hasSaved: () => true, readSaved: () => ({ valid: false, invalidated: false }) } });
    const report = projection(c, [acr(c)]);
    expect(report.measurements[0]).toMatchObject({ status: 'unavailable', kind: 'exact', valueNum: 45 });
    expect(presentation.describeClcr(report.measurements[0])).toMatchObject({ value: 45, tone: 'neutral', norms: [], warningKind: 'unavailable' });
    expect(presentation.clcrSeries(report)[0].chart.points[0].v).toBe(45);
  });

  it.each([
    ['warning', 'unassessed'], ['danger', 'unassessed'], ['warning', 'within'], ['danger', 'within'],
  ])('nie zamienia klinicznego %s/%s w liczbowe wysokie odchylenie ani zielony wynik', (tone, assessment) => {
    const c = recordedCapture({ tone, assessment, interpretation: 'Fikcyjne ostrzeżenie zapisanej oceny' });
    expect(presentation.describeClcr(c.projected.measurements[0])).toMatchObject({ value: 97, tone: 'neutral', symbol: '',
      warning: 'Fikcyjne ostrzeżenie zapisanej oceny', warningKind: 'clinical' });
    expect(c.forbidden).not.toHaveBeenCalled();
  });

  it('kryterium kliniczne nie staje się normą, pasmem ani strzałką poza zakresem', () => {
    const c = recordedCapture({ tone: 'warning', assessment: 'above', norm: 'Fikcyjne kryterium <1%',
      reference: { kind: 'recorded-criterion', bounds: { low: null, high: 1 } }, interpretation: 'Spełnione zapisane kryterium' });
    expect(presentation.describeClcr(c.projected.measurements[0])).toMatchObject({ value: 97, tone: 'neutral', symbol: '',
      normText: '—', norms: [], warningKind: 'clinical' });
  });

  it('nie parsuje granic z tekstu, nie konwertuje normy do innej jednostki i nie ocenia z obecnej wartości', () => {
    const absentBounds = recordedCapture({ norm: '≥90 mL/min/1,73 m²', reference: { bounds: null } });
    // The projection owner may parse a saved textual range; the presentation
    // still only receives its output. Remove its coordinates to test that this
    // reader never grows a second, more permissive parser.
    const record = { ...absentBounds.projected.measurements[0], reference: { text: '≥90', bounds: null } };
    expect(presentation.describeClcr(record)).toMatchObject({ tone: 'within', norms: [{ low: null, high: null, eligible: false }] });
    const mismatch = { ...record, reference: { text: '≥90', unit: 'mg/dL', bounds: { low: 90, high: null } } };
    expect(presentation.describeClcr(mismatch)).toMatchObject({ tone: 'neutral', norms: [{ eligible: false }] });
  });

  it('zachowuje klucze metody, jednostki, podstawy i profilu oraz stabilną kolejność', () => {
    const c = environment();
    const report = projection(c, [legacy(c.api, 'ACR', 'fictional-base')]);
    const base = report.measurements[0];
    const variants = ['direct|mg/g|acid|profile1', 'methodB|mg/g|acid|profile1', 'direct|mmol/mol|acid|profile1',
      'direct|mg/g|ion|profile1', 'direct|mg/g|acid|profile2'].map((seriesKey, index) => ({ ...base, seriesKey, noteId: `fictional-group-${index}` }));
    expect(presentation.clcrSeries({ measurements: variants })).toHaveLength(5);
    const dates = [
      { ...base, noteId: 'fictional-late', dateISO: '2026-10-30' },
      { ...base, noteId: 'fictional-early-a', dateISO: '2026-10-01' },
      { ...base, noteId: 'fictional-early-b', dateISO: '2026-10-01' },
      { ...base, noteId: 'fictional-undated', dateISO: '' },
      { ...base, noteId: 'fictional-bad-date', dateISO: '2026-02-30' },
    ];
    const [series] = presentation.clcrSeries({ measurements: dates.concat(dates[0]) });
    expect(series.entries.map(entry => entry.noteId)).toEqual(['fictional-early-a', 'fictional-early-b', 'fictional-late', 'fictional-undated', 'fictional-bad-date']);
    expect(series.last.noteId).toBe('fictional-late');
    expect(series.previous.noteId).toBe('fictional-early-b');
    expect(series.entries[0].clcrRecord).toBe(dates[1]);
    expect(series.chart.points.map(point => point.noteId)).toEqual(['fictional-early-a', 'fictional-early-b', 'fictional-late']);
  });
});
