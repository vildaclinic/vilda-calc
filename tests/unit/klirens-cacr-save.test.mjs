import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const units = ['mg/mg', 'mg/g', 'g/g', 'mol/mol', 'mmol/mmol', 'mmol/mol', 'mg/mmol'];
function harness() {
  const captured = [];
  const browser = { VildaVault: { isUnlocked: () => true, savePatientNote: async note => { captured.push(note); } } };
  for (const file of ['clcr_cacr_reference_data.js', 'clcr_cacr.js', 'clcr_ui_workflow.js']) loadBrowserScript(file, browser);
  const realVault = {};
  loadBrowserScript('vilda_vault.js', realVault);
  // A saved clinical result belongs to the selected persisted synthetic record.
  browser.VildaVault.getPatient = async id => id === 'fictional-cacr-only' ? { id, patientId: id, name: 'Fikcyjny pacjent' } : null;
  browser.ClcrVisitSave._setPatientId('fictional-cacr-only');
  return { browser, captured, sanitizer: realVault.VildaVault };
}
function evaluate(browser, input = {}) {
  return browser.VildaClcrCacr.evaluate({ mode: 'direct', reportedValue: '0.3', reportedUnit: 'mg/mg', ageYears: 5, ...input },
    browser.VildaClcrCacrReferenceData.getProfile('MAYO_CACR3_RANDOM_2026_10')).snapshot;
}
function card(snapshot, overrides = {}) {
  const attrs = { 'data-clcr-series': 'CaCr_spot', 'data-clcr-value': String(snapshot.rawValue),
    'data-clcr-display-value': snapshot.display.value, 'data-clcr-cacr-snapshot': JSON.stringify(snapshot), ...overrides };
  return { getAttribute: key => attrs[key] ?? null, getClientRects: () => [{ width: 400, height: 200 }],
    classList: { contains: key => key === 'out-of-range' && ['below', 'above'].includes(snapshot.status) }, querySelector: () => null };
}
async function save(context, snapshot, date = '2026-10-23') {
  const { browser, captured, sanitizer } = context;
  expect(snapshot).not.toBeNull();
  const points = browser.ClcrVisitSave.collectActiveDatapoints({ querySelectorAll: () => [card(snapshot)] }, { formulaId: 'CaCr_spot' });
  expect(points).toHaveLength(1);
  expect(await browser.ClcrVisitSave.saveActiveResultToCard({ patientId: 'fictional-cacr-only', clinicalDateISO: date, datapoints: points }))
    .toMatchObject({ ok: true, saved: 1 });
  const note = captured.at(-1);
  const sanitized = { ...note, body: sanitizer.sanitizeNoteText(note.body), labResult: sanitizer.sanitizeLabResult(note.labResult) };
  expect(sanitized).toEqual(note);
  expect(sanitizer.isUnlocked()).toBe(false);
  expect(note.labResult).not.toHaveProperty('cacrSnapshot');
  expect(note.body).not.toContain('"schema"');
  return { point: points[0], note: sanitized };
}
function history(browser, notes) {
  browser.VildaClcrCacr = { evaluate() { throw new Error('History must not re-evaluate'); } };
  browser.VildaClcrCacrReferenceData = { getProfile() { throw new Error('History must not change reference'); } };
  return browser.ClcrVisitSave.buildSeriesFromNotes(notes, { formulaId: 'CaCr_spot' });
}

describe('Ca/Cr — kolektor, rzeczywiste sanitizery sejfu i historyczna ocena', () => {
  it.each([
    ['30.001', 0.30001, 'above', '>0,3'], ['29.999', 0.29999, 'within', ''],
    ['0.999', 0.00999, 'below', '<0,01'], ['1', 0.01, 'within', ''], ['30', 0.3, 'within', ''], ['0', 0, 'below', ''],
  ])('Ca %s / Cr 100 zachowuje pełną wartość %s i ocenę %s mimo podwójnego zaokrąglania', async (calciumValue, raw, status, boundary) => {
    const context = harness();
    const snapshot = evaluate(context.browser, { mode: 'concentration', calciumValue, calciumUnit: 'mg/dl',
      creatinineValue: '100', creatinineUnit: 'mg/dl', sameSpecimen: 'confirmed', sampleType: 'random' });
    const original = JSON.stringify(snapshot);
    const { point, note } = await save(context, snapshot);
    expect(point).toMatchObject({ valueNum: raw, unit: 'mg/mg', outOfRange: status !== 'within', norm: '0,01–0,30 mg/mg' });
    expect(point.cacrSnapshot).toEqual(snapshot);
    expect(note.labResult).toMatchObject({ valueNum: raw, value: snapshot.display.text.replace('.', ','), unit: 'mg/mg' });
    expect(note.body).toContain(`Wynik przed zaokrągleniem: ${String(raw).replace('.', ',')} mg/mg.`);
    if (boundary) expect(note.body).toContain(`Granica przed zaokrągleniem: ${boundary}.`);
    for (const text of ['Mayo Clinic Laboratories', '2026-10-23', 'MAYO_CACR3_RANDOM_2026_10; wersja 1',
      'Zakres źródłowy: 0,01–0,3 mg/mg; obie granice należą do normy.', 'Wiek użyty przy ocenie: 5 lat.',
      'Potwierdzono, że oznaczenia pochodzą z tej samej próbki', 'NM-BAPTA', 'enzymatyczna', 'Metody laboratorium pacjenta nie zostały potwierdzone.']) expect(note.body).toContain(text);
    expect(history(context.browser, [note])[0].points[0]).toMatchObject({ valueNum: raw, category: status, assessment: status,
      outOfRange: status !== 'within', displayValue: snapshot.display.text.replace('.', ','),
      cacrAssessment: { profileId: 'MAYO_CACR3_RANDOM_2026_10', profileVersion: '1', ageYears: 5 } });
    expect(JSON.stringify(snapshot)).toBe(original);
  });

  it.each([null, 0, 1 / 24, 83.000001])('wiek %s bez normy zostaje brakiem oceny, również w flowsheet', async ageYears => {
    const context = harness();
    const { point, note } = await save(context, evaluate(context.browser, { ageYears }));
    expect(point.outOfRange).toBeNull();
    expect(note.labResult).not.toHaveProperty('norm');
    expect(note.body).toContain('Ocena: nie oceniono.');
    const saved = history(context.browser, [note])[0].points[0];
    expect(saved).toMatchObject({ assessment: 'unassessed', outOfRange: null, category: null });
    context.browser.VildaVault.listPatientNotesForPatient = async () => [note];
    expect((await context.browser.ClcrVisitSave.readPatientFlowsheet('fictional-only')).parameters[0].byDate['2026-10-23'].outOfRange).toBeNull();
  });

  it('dokładne 83 lata ma własną zapisaną normę, a następny wynik bez normy jej nie dziedziczy', async () => {
    const context = harness();
    const older = await save(context, evaluate(context.browser, { ageYears: 83, reportedValue: '0.27' }), '2026-10-22');
    const latest = await save(context, evaluate(context.browser, { ageYears: null }));
    expect(older.point).toMatchObject({ norm: '0,05–0,27 mg/mg', outOfRange: false });
    const series = history(context.browser, [latest.note, older.note])[0];
    expect(series.norm).toBe('');
    expect(series.points[1]).toMatchObject({ norm: '', assessment: 'unassessed', outOfRange: null });
    expect(series.points[0].cacrAssessment.ageYears).toBe(83);
  });

  it('siedem jednostek pozostaje siedmioma seriami bez przeliczania historii', async () => {
    const context = harness();
    const notes = [];
    for (const unit of units) notes.push((await save(context, evaluate(context.browser, { reportedUnit: unit, reportedValue: '0,3000100' }))).note);
    const series = history(context.browser, notes);
    expect(series).toHaveLength(7);
    expect(series.map(value => value.unit)).toEqual(units);
    for (let index = 0; index < units.length; index += 1) {
      expect(notes[index].labResult).toMatchObject({ value: '0,3000100', valueNum: 0.30001, unit: units[index] });
      expect(series[index].points).toHaveLength(1);
      expect(series[index].points[0]).toMatchObject({ valueNum: 0.30001, unit: units[index], displayValue: '0,3000100' });
    }
  });

  it.each(['<0.01', '≤0.009', '>0.3', '≥0.31', '≤0.3', '≥0.3'])(
    'wynik %s zachowuje znak i ocenę przedziału bez dokładnego punktu lub trendu', async reportedValue => {
      const context = harness();
      const first = await save(context, evaluate(context.browser, { reportedValue: '0.2' }), '2026-10-22');
      const snapshot = evaluate(context.browser, { reportedValue });
      const { note } = await save(context, snapshot);
      expect(note.labResult.value).toBe(snapshot.display.text.replace('.', ','));
      expect(note.labResult).not.toHaveProperty('valueNum');
      const series = history(context.browser, [note, first.note])[0];
      const signed = series.points[1];
      expect(signed).toMatchObject({ valueNum: null, comparator: snapshot.comparator,
        displayValue: snapshot.display.text.replace('.', ','), assessment: snapshot.status,
        cacrAssessment: { rawValue: snapshot.rawValue, comparator: snapshot.comparator } });
      expect(context.browser.ClcrVisitSave.seriesTrend(series.points)).toBeNull();
      context.browser.VildaVault.listPatientNotesForPatient = async () => [note, first.note];
      const flow = await context.browser.ClcrVisitSave.readPatientFlowsheet('fictional-only');
      expect(flow.parameters[0].trend).toBeNull();
      expect(flow.parameters[0].byDate['2026-10-23']).toMatchObject({ valueNum: null, comparator: snapshot.comparator });
    });

  it('znane fakty i wybór próbki pozostają opisane, a nieznany wywiad nie staje się ujemnym', async () => {
    const context = harness();
    const snapshot = evaluate(context.browser, { sampleType: 'secondMorning', confounders: ['infection'],
      knownFacts: { infection: true, thiazides: false, gadolinium: null } });
    const { note } = await save(context, snapshot);
    expect(note.body).toContain('Rodzaj próbki: drugi poranny mocz.');
    expect(note.body).toContain('Zgłoszone czynniki: infekcja.');
    expect(note.body).toContain('Podana informacja — infekcja: tak.');
    expect(note.body).toContain('Podana informacja — tiazydy: nie.');
    expect(note.body).not.toContain('kontrast gadolinowy: nie.');
    expect(note.body).toContain('kontrast gadolinowy: nie wiadomo.');
    expect(history(context.browser, [note])[0].points[0].cacrAssessment.contextNote).toContain('infekcja');
    const clean = harness();
    const unspecified = await save(clean, evaluate(clean.browser));
    expect(unspecified.note.body).toContain('Rodzaj próbki: nie podano.');
    expect(unspecified.note.body).not.toContain('Podana informacja');
    expect(unspecified.note.body).not.toContain('brak infekcji');
  });

  it.each([{ valueNum: 0.2, value: '0,2' }, { value: '0,29' }, { unit: 'mg/g' }, { unit: '' }, { norm: '0–1 mg/mg' }])(
    'edycja pola %j unieważnia starą ocenę i nie przywraca starej liczby', async patch => {
      const context = harness();
      const { note } = await save(context, evaluate(context.browser, { reportedValue: '0.30001' }));
      const edited = { ...note, labResult: context.sanitizer.sanitizeLabResult({ ...note.labResult, ...patch }) };
      const saved = history(context.browser, [edited])[0].points[0];
      expect(saved.valueNum).toBe(edited.labResult.valueNum);
      expect(saved.outOfRange).toBeNull();
      expect(saved).not.toHaveProperty('category');
      expect(saved).not.toHaveProperty('cacrAssessment');
    });

  it('rzeczywisty edytor zmiany samej normy nie przypina starej oceny do nowej normy', async () => {
    const context = harness();
    const { note } = await save(context, evaluate(context.browser, { reportedValue: '0.30001' }));
    const source = readFileSync(new URL('../../vilda_auth_ui.js', import.meta.url), 'utf8');
    const between = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
    const editor = new Function(`${between('function HrHasReference(', 'function HrSavedReference(')}
      ${between('function HrPreserveNormEdit(', 'function Lh3ResultText(')}
      ${between('function Lh3LabEditState(', 'function Lh3EditorContextState(')}
      return { state:Lh3LabEditState, preserve:Lh3PreserveLabAfterEdit };`)();
    const lab = note.labResult;
    const replacement = { ...lab, norm: '0–1 mg/mg' };
    const editedLab = editor.preserve(lab, replacement, editor.state(lab.test, lab.value, lab.unit, lab.norm),
      editor.state(lab.test, lab.value, lab.unit, replacement.norm), true);
    expect(editedLab).toEqual(replacement);
    const edited = { ...note, labResult: context.sanitizer.sanitizeLabResult(editedLab) };
    const saved = history(context.browser, [edited])[0].points[0];
    expect(saved).toMatchObject({ valueNum: lab.valueNum, norm: '0–1 mg/mg', outOfRange: null });
    expect(saved).not.toHaveProperty('cacrAssessment');
    expect(edited.body).toBe(note.body);
  });

  it('edycja normy lub zapisu nierówności zachowuje aktualny tekst bez starej oceny i bez punktu', async () => {
    const context = harness();
    const { note } = await save(context, evaluate(context.browser, { reportedValue: '>0.3' }));
    for (const patch of [{ norm: '0–1 mg/mg' }, { value: '≤0,3' }, { unit: 'mol/mol' }]) {
      const edited = { ...note, labResult: context.sanitizer.sanitizeLabResult({ ...note.labResult, ...patch }) };
      const saved = history(context.browser, [edited])[0].points[0];
      expect(saved).toMatchObject({ valueNum: null, displayValue: edited.labResult.value, comparator: edited.labResult.value[0], outOfRange: null });
      expect(saved).not.toHaveProperty('cacrAssessment');
      expect(saved).not.toHaveProperty('category');
    }
  });

  it('starsze notatki zachowują dawną liczbę i ocenę bez wymyślania wieku lub nowego źródła', () => {
    const { browser } = harness();
    const label = browser.ClcrVisitSave.mapDatapoint('CaCr_spot', 0.213).label;
    const notes = [{ category: 'wynik-klirens', clinicalDateISO: '2026-01-01', body: 'Kalkulator klirensu · clcr:CaCr_spot · wynik poza zakresem',
      labResult: { test: label, valueNum: 0.213, value: '0,21', unit: 'mg/mg', norm: '<0,21258 mg/mg' } },
    { category: 'wynik-klirens', clinicalDateISO: '2026-01-02', body: 'Kalkulator klirensu · clcr:CaCr_spot',
      labResult: { test: label, valueNum: 0.4, value: '0,4', unit: 'mg/mg' } }];
    const original = JSON.stringify(notes);
    const series = history(browser, notes)[0];
    expect(series.norm).toBe('');
    expect(series.points[0]).toMatchObject({ valueNum: 0.213, outOfRange: true });
    expect(series.points[0]).not.toHaveProperty('cacrAssessment');
    expect(series.points[1]).not.toHaveProperty('category');
    expect(JSON.stringify(notes)).toBe(original);
  });

  it('wadliwe metadane nie zmieniają innych wzorów ani ich zaokrąglania', () => {
    const { browser } = harness();
    const snapshot = evaluate(browser);
    for (const encoded of ['{', '[]', 'null', JSON.stringify({ ...snapshot, unit: 'unsupported' }), JSON.stringify({ ...snapshot, status: 'unknown' })]) {
      const points = browser.ClcrVisitSave.collectActiveDatapoints({ querySelectorAll: () => [card(snapshot, { 'data-clcr-cacr-snapshot': encoded })] }, { formulaId: 'CaCr_spot' });
      expect(points[0]).not.toHaveProperty('cacrSnapshot');
      expect(points[0].valueNum).toBe(0.3);
    }
    const other = card(snapshot, { 'data-clcr-series': 'egfr', 'data-clcr-value': '29.96', 'data-clcr-display-value': '30.0' });
    expect(browser.ClcrVisitSave.collectActiveDatapoints({ querySelectorAll: () => [other] }, { formulaId: 'egfr' })[0].valueNum).toBe(30);
  });
});
