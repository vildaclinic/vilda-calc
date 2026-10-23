import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { readFileSync } from 'node:fs';

function harness() {
  const captured = [];
  const browser = { VildaVault: {
    // Capture-only adapter; the real vault is never unlocked or written.
    isUnlocked: () => true,
    savePatientNote: async note => { captured.push(note); },
  } };
  for (const file of ['clcr_pcr_reference_data.js', 'clcr_pcr.js', 'clcr_ui_workflow.js']) loadBrowserScript(file, browser);
  const realVault = {};
  loadBrowserScript('vilda_vault.js', realVault);
  return { browser, captured, sanitizer: realVault.VildaVault };
}

function evaluate(browser, input = {}) {
  return browser.VildaClcrPcr.evaluate({ mode: 'direct', reportedValue: '300', reportedUnit: 'mg/g', ageYears: 10, ...input },
    browser.VildaClcrPcrReferenceData.getProfile('KDIGO_PCR_2024_2025')).snapshot;
}

function card(snapshot, overrides = {}) {
  const attrs = { 'data-clcr-series': 'PCR', 'data-clcr-value': String(snapshot.rawValue),
    'data-clcr-display-value': snapshot.display.value, 'data-clcr-pcr-snapshot': JSON.stringify(snapshot), ...overrides };
  return {
    getAttribute: key => attrs[key] ?? null,
    getClientRects: () => [{ width: 400, height: 200 }],
    classList: { contains: key => key === 'out-of-range' && snapshot.status === 'above' },
    querySelector: () => null,
  };
}

async function save(context, snapshot, date = '2026-10-23') {
  const { browser, captured, sanitizer } = context;
  expect(snapshot).not.toBeNull();
  const points = browser.ClcrVisitSave.collectActiveDatapoints({ querySelectorAll: () => [card(snapshot)] }, { formulaId: 'PCR' });
  expect(points).toHaveLength(1);
  expect(await browser.ClcrVisitSave.saveActiveResultToCard({ patientId: 'fictional-pcr-only', clinicalDateISO: date, datapoints: points }))
    .toMatchObject({ ok: true, saved: 1 });
  const note = captured[captured.length - 1];
  const normalized = { ...note, body: sanitizer.sanitizeNoteText(note.body), labResult: sanitizer.sanitizeLabResult(note.labResult) };
  expect(normalized).toEqual(note);
  expect(normalized.labResult).not.toHaveProperty('pcrSnapshot');
  expect(sanitizer.isUnlocked()).toBe(false);
  return { point: points[0], note: normalized };
}

function history(browser, notes) {
  // Restoring saved results must not consult today's age, profile or engine.
  browser.VildaClcrPcr = { evaluate() { throw new Error('History must not re-evaluate'); } };
  browser.VildaClcrPcrReferenceData = { getProfile() { throw new Error('History must not change reference source'); } };
  return browser.ClcrVisitSave.buildSeriesFromNotes(notes, { formulaId: 'PCR' });
}

describe('PCR — precyzja i oryginalna ocena w rzeczywistym adapterze sejfu', () => {
  it.each([
    ['199.96', 10, 'normal', 'within', '<200', '<200 mg/g'],
    ['200', 10, 'raised', 'above', '', '<200 mg/g'],
    ['499.96', 1.5, 'normal', 'within', '<500', '<500 mg/g'],
    ['1999.96', 10, 'raised', 'above', '<2000', '<200 mg/g'],
    ['2000', 10, 'nephrotic', 'above', '', '<200 mg/g'],
  ])('surowe %s zachowuje poziom %s przed zaokrągleniem', async (value, ageYears, category, status, boundary, norm) => {
    const context = harness();
    const snapshot = evaluate(context.browser, { mode: 'concentration', proteinValue: value, proteinUnit: 'mg/L',
      creatinineValue: '100', creatinineUnit: 'mg/dL', ageYears, sampleType: 'random' });
    const original = JSON.stringify(snapshot);
    const { point, note } = await save(context, snapshot);
    expect(point).toMatchObject({ valueNum: Number(value), unit: 'mg/g', norm, outOfRange: status === 'above' });
    expect(point.pcrSnapshot).toEqual(snapshot);
    expect(note.labResult).toMatchObject({ valueNum: Number(value), unit: 'mg/g', value: snapshot.display.text.replace('.', ','), norm });
    expect(note.body).toContain(`Wynik przed zaokrągleniem: ${value.replace('.', ',')} mg/g.`);
    if (boundary) expect(note.body).toContain(`Granica przed zaokrągleniem: ${boundary}.`);
    for (const text of ['KDIGO', '2026-10-23', 'KDIGO_PCR_2024_2025; wersja 1', 'próbka losowa', `Wiek użyty przy ocenie: ${String(ageYears).replace('.', ',')} lat.`]) {
      expect(note.body).toContain(text);
    }
    if (category === 'nephrotic') {
      expect(note.body).toContain('Źródło progu nerczycowego: KDIGO 2025');
      expect(note.body).toContain('pdf#page=23');
    }
    const pointInHistory = history(context.browser, [note])[0].points[0];
    expect(pointInHistory).toMatchObject({ valueNum: Number(value), category, assessment: status,
      displayValue: snapshot.display.text.replace('.', ','), outOfRange: status === 'above' });
    expect(pointInHistory.pcrAssessment).toMatchObject({ profileId: 'KDIGO_PCR_2024_2025', profileVersion: '1', ageYears });
    expect(JSON.stringify(snapshot)).toBe(original);
  });

  it('norma pediatryczna nie przechodzi ze starszego PCR do najnowszego wyniku bez wieku', async () => {
    const context = harness();
    const first = await save(context, evaluate(context.browser), '2026-10-22');
    const latest = await save(context, evaluate(context.browser, { ageYears: null }));
    expect(first.note.labResult.norm).toBe('<200 mg/g');
    expect(latest.note.labResult).not.toHaveProperty('norm');
    expect(latest.point.outOfRange).toBeNull();
    const series = history(context.browser, [latest.note, first.note])[0];
    expect(series.norm).toBe('');
    expect(series.points[1]).toMatchObject({ norm: '', assessment: 'unassessed', outOfRange: null });
    context.browser.VildaVault.listPatientNotesForPatient = async () => [latest.note];
    const flowsheet = await context.browser.ClcrVisitSave.readPatientFlowsheet('fictional-only');
    expect(flowsheet.parameters[0].byDate['2026-10-23'].outOfRange).toBeNull();
  });

  it.each([
    [null, 'nieznany'], [0.25, '0,25 lat'],
  ])('brak porównania dla wieku %s jest zachowany jako brak oceny', async (ageYears, ageText) => {
    const context = harness();
    const { note, point } = await save(context, evaluate(context.browser, { ageYears }));
    expect(point.outOfRange).toBeNull();
    expect(note.labResult).not.toHaveProperty('norm');
    expect(note.body).toContain('Ocena: nie oceniono.');
    expect(note.body).toContain(ageText);
    expect(history(context.browser, [note])[0].points[0]).toMatchObject({ assessment: 'unassessed', outOfRange: null, category: null });
  });

  it.each([
    ['100', 'normal', 'unassessed', 'below', null],
    ['300', 'raised', 'above', 'above', true],
    ['2000', 'nephrotic', 'above', 'above', true],
  ])('wpływ infekcji dla %s pozostawia oryginalny sygnał i zastrzeżenie', async (value, category, status, comparison, outOfRange) => {
    const context = harness();
    const snapshot = evaluate(context.browser, { reportedValue: value, confounders: ['infection'], sampleType: 'firstMorning' });
    const { note, point } = await save(context, snapshot);
    expect(point.outOfRange).toBe(outOfRange);
    expect(note.body).toContain('Zgłoszone czynniki wpływające na ocenę: infekcja.');
    expect(note.body).toContain(snapshot.qualification.note);
    const saved = history(context.browser, [note])[0].points[0];
    expect(saved).toMatchObject({ category, assessment: status, comparison, outOfRange });
    if (status === 'unassessed') expect(note.body).toContain('Ocena: nie oceniono.');
  });

  it('natywne mg/mmol, mg/g, mg/mg i g/g zachowują odrębne osie i serie', async () => {
    const context = harness();
    const cases = [['mg/mmol', '20'], ['mg/g', '176.8'], ['mg/mg', '0.2'], ['g/g', '0.2']];
    const snapshots = cases.map(([reportedUnit, reportedValue]) => evaluate(context.browser, { reportedUnit, reportedValue }));
    expect(snapshots.map(snapshot => snapshot.category)).toEqual(['raised', 'normal', 'raised', 'raised']);
    const notes = [];
    for (let index = 0; index < snapshots.length; index += 1) notes.push((await save(context, snapshots[index], `2026-10-${20 + index}`)).note);
    expect(notes[0].labResult).toMatchObject({ valueNum: 20, unit: 'mg/mmol', norm: '<20 mg/mmol' });
    expect(notes[2].labResult).toMatchObject({ valueNum: 0.2, unit: 'mg/mg', norm: '<0,2 mg/mg' });
    const series = history(context.browser, notes);
    expect(series).toHaveLength(4);
    expect(series.map(value => value.unit)).toEqual(cases.map(value => value[0]));
    expect(series.every(value => value.points.length === 1)).toBe(true);
  });

  it.each(['<200', '>200', '>2000', '≤200', '≥2000'])(
    'zapis wyniku %s zachowuje znak, bez dokładnego punktu dla ogólnych wykresów sejfu', async reportedValue => {
      const context = harness();
      const snapshot = evaluate(context.browser, { reportedValue });
      const { note, point } = await save(context, snapshot);
      expect(point.comparator).toBe(snapshot.comparator);
      expect(note.labResult.value).toBe(snapshot.display.text.replace('.', ','));
      expect(note.labResult).not.toHaveProperty('valueNum');
      expect(note.body).toContain(`Wynik przed zaokrągleniem: ${reportedValue} mg/g.`);
      const saved = history(context.browser, [note])[0].points[0];
      expect(saved).toMatchObject({ valueNum: snapshot.rawValue, comparator: snapshot.comparator, displayValue: reportedValue });
      if (reportedValue === '>200') expect(saved).toMatchObject({ category: null, assessment: 'above', comparison: 'above', outOfRange: true });
      expect(context.browser.ClcrVisitSave.seriesTrend([{ valueNum: 100 }, saved])).toBeNull();
      expect(context.browser.ClcrVisitSave.seriesTrend([saved, { valueNum: 400 }])).toBeNull();
    },
  );

  it.each(['g/L', 'mg/dL'])(
    'zapis obliczenia zachowuje oryginalne stężenie białka w %s i jawne założenie próbki', async proteinUnit => {
      const context = harness();
      const proteinValue = proteinUnit === 'g/L' ? '0.3' : '30';
      const snapshot = evaluate(context.browser, { mode: 'concentration', proteinValue, proteinUnit,
        creatinineValue: '8.84', creatinineUnit: 'mmol/L', sameSpecimen: 'assumed' });
      const { note } = await save(context, snapshot);
      expect(note.body).toContain(`Białko całkowite w moczu: ${proteinValue.replace('.', ',')} ${proteinUnit}.`);
      expect(note.body).toContain('Kreatynina w moczu: 8,84 mmol/L.');
      expect(note.body).toContain('Założono, że oznaczenia pochodzą z tej samej próbki moczu.');
      expect(note.body).not.toContain('Potwierdzono');
    },
  );

  it.each([
    { value: '100', valueNum: 100 }, { unit: 'mg/mmol' }, { value: '300,00' },
  ])('edycja zapisanego badania %j nie przywraca starej wartości ani kategorii', async patch => {
    const context = harness();
    const { note } = await save(context, evaluate(context.browser));
    const edited = { ...note, labResult: { ...note.labResult, ...patch } };
    const saved = history(context.browser, [edited])[0].points[0];
    expect(saved.valueNum).toBe(edited.labResult.valueNum);
    expect(saved.outOfRange).toBeNull();
    expect(saved).not.toHaveProperty('category');
    expect(saved).not.toHaveProperty('pcrAssessment');
  });

  it('starsze notatki nie otrzymują nowego wieku, normy ani kwalifikacji próbki', () => {
    const { browser } = harness();
    const label = browser.ClcrVisitSave.mapDatapoint('PCR', 300).label;
    const notes = [{ category: 'wynik-klirens', clinicalDateISO: '2026-01-01',
      body: 'Kalkulator klirensu · clcr:PCR', labResult: { test: label, valueNum: 300, value: '300', unit: 'mg/g' } }];
    const original = JSON.stringify(notes);
    const saved = history(browser, notes)[0].points[0];
    expect(saved).toMatchObject({ valueNum: 300, norm: '', outOfRange: false });
    expect(saved).not.toHaveProperty('pcrAssessment');
    expect(saved).not.toHaveProperty('category');
    expect(JSON.stringify(notes)).toBe(original);
  });

  it('zmiana samej normy w rzeczywistym edytorze unieważnia dawną ocenę PCR w historii', async () => {
    const context = harness();
    const { note } = await save(context, evaluate(context.browser));
    const source = readFileSync(new URL('../../vilda_auth_ui.js', import.meta.url), 'utf8');
    const between = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
    // Execute the same readable edit helpers used by the laboratory note UI.
    const editor = new Function(`${between('function HrHasReference(', 'function HrSavedReference(')}
      ${between('function HrPreserveNormEdit(', 'function Lh3ResultText(')}
      ${between('function Lh3LabEditState(', 'function Lh3EditorContextState(')}
      return { state:Lh3LabEditState, preserve:Lh3PreserveLabAfterEdit };`)();
    const lab = note.labResult;
    const initial = editor.state(lab.test, lab.value, lab.unit, lab.norm);
    const replacement = { ...lab, norm: '<500 mg/g' };
    const editedLab = editor.preserve(lab, replacement, initial,
      editor.state(lab.test, lab.value, lab.unit, replacement.norm), true);
    expect(editedLab).toEqual(replacement);
    const edited = { ...note, labResult: context.sanitizer.sanitizeLabResult(editedLab) };
    const originalPoint = history(context.browser, [note])[0].points[0];
    expect(originalPoint).toMatchObject({ category: 'raised', assessment: 'above', outOfRange: true });
    const editedPoint = history(context.browser, [edited])[0].points[0];
    expect(editedPoint).toMatchObject({ valueNum: lab.valueNum, norm: '<500 mg/g', outOfRange: null });
    expect(editedPoint).not.toHaveProperty('category');
    expect(editedPoint).not.toHaveProperty('pcrAssessment');
    expect(edited.body).toBe(note.body);
  });

  it('ostatni starszy PCR bez normy nie dziedziczy pediatrycznej normy z poprzedniej wizyty', () => {
    const { browser } = harness();
    const test = browser.ClcrVisitSave.mapDatapoint('PCR', 300).label;
    const notes = [
      { category: 'wynik-klirens', clinicalDateISO: '2026-10-21', labResult: { test, valueNum: 300, unit: 'mg/g', norm: '<200 mg/g' } },
      { category: 'wynik-klirens', clinicalDateISO: '2026-10-22', labResult: { test, valueNum: 300, unit: 'mg/g' } },
    ];
    const series = history(browser, notes)[0];
    expect(series.norm).toBe('');
    expect(series.points[0].norm).toBe('<200 mg/g');
    expect(series.points[1].norm).toBe('');
  });

  it('zapis dorosłego zachowuje wybrany próg i źródło zamiast pediatrycznej normy', async () => {
    const context = harness();
    const { note } = await save(context, evaluate(context.browser, { ageYears: 18, reportedValue: '150' }));
    expect(note.labResult.norm).toBe('<150 mg/g');
    expect(note.body).toContain('KDIGO 2025');
    const saved = history(context.browser, [note])[0].points[0];
    expect(saved).toMatchObject({ norm: '<150 mg/g', category: 'raised', assessment: 'above' });
    expect(saved.pcrAssessment.ageYears).toBe(18);
  });

  it('wadliwe metadane nie usuwają liczby ani nie zmieniają zapisu innych formuł', () => {
    const { browser } = harness();
    const snapshot = evaluate(browser, { reportedValue: '199.96' });
    for (const encoded of ['{', 'null', '[]', JSON.stringify({ ...snapshot, unit: 'unsupported' }), JSON.stringify({ ...snapshot, status: 'unknown' })]) {
      const points = browser.ClcrVisitSave.collectActiveDatapoints({ querySelectorAll: () => [card(snapshot, { 'data-clcr-pcr-snapshot': encoded })] }, { formulaId: 'PCR' });
      expect(points[0]).toMatchObject({ valueNum: 199.96 });
      expect(points[0]).not.toHaveProperty('pcrSnapshot');
    }
    const other = card(snapshot, { 'data-clcr-series': 'egfr', 'data-clcr-display-value': '200' });
    const points = browser.ClcrVisitSave.collectActiveDatapoints({ querySelectorAll: () => [other] }, { formulaId: 'egfr' });
    expect(points[0].valueNum).toBe(200);
    expect(points[0]).not.toHaveProperty('pcrSnapshot');
  });
});
