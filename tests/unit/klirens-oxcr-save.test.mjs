import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

function harness() {
  const captured = [];
  const browser = { VildaVault: { isUnlocked: () => true, savePatientNote: async note => { captured.push(note); } } };
  for (const file of ['clcr_oxcr_reference_data.js', 'clcr_oxcr.js', 'clcr_oxcr_persistence.js', 'clcr_ui_workflow.js']) loadBrowserScript(file, browser);
  const realVault = {};
  loadBrowserScript('vilda_vault.js', realVault);
  // A saved clinical result belongs to the selected persisted synthetic record.
  browser.VildaVault.getPatient = async id => id === 'fictional-oxcr-only' ? { id, patientId: id, name: 'Fikcyjny pacjent' } : null;
  browser.ClcrVisitSave._setPatientId('fictional-oxcr-only');
  return { browser, captured, sanitizer: realVault.VildaVault };
}
function evaluate(browser, input = {}) {
  return browser.VildaClcrOxcr.evaluate({ mode: 'direct', reportedValue: '60', reportedUnit: 'umol/mmol', ageYears: 8, ...input },
    browser.VildaClcrOxcrReferenceData.DEFAULT_POLICY).snapshot;
}
function card(snapshot, overrides = {}) {
  const attrs = { 'data-clcr-series': 'OxCr_spot', 'data-clcr-value': String(snapshot.rawValue),
    'data-clcr-display-value': snapshot.display.value, 'data-clcr-oxcr-snapshot': JSON.stringify(snapshot), ...overrides };
  return { getAttribute: key => attrs[key] ?? null, getClientRects: () => [{ width: 400, height: 200 }],
    classList: { contains: key => key === 'out-of-range' && ['below', 'above'].includes(snapshot.status) }, querySelector: () => null };
}
async function save(context, snapshot, date = '2026-10-24') {
  const { browser, captured, sanitizer } = context;
  expect(snapshot).not.toBeNull();
  const points = browser.ClcrVisitSave.collectActiveDatapoints({ querySelectorAll: () => [card(snapshot)] }, { formulaId: 'OxCr_spot' });
  expect(points).toHaveLength(1);
  expect(await browser.ClcrVisitSave.saveActiveResultToCard({ patientId: 'fictional-oxcr-only', clinicalDateISO: date, datapoints: points }))
    .toMatchObject({ ok: true, saved: 1 });
  const note = captured.at(-1);
  const sanitized = { ...note, body: sanitizer.sanitizeNoteText(note.body), labResult: sanitizer.sanitizeLabResult(note.labResult) };
  expect(sanitized).toEqual(note);
  expect(sanitizer.isUnlocked()).toBe(false);
  expect(note.labResult).not.toHaveProperty('oxcrSnapshot');
  expect(note.body).not.toContain('"schema"');
  return { point: points[0], note: sanitized };
}
function history(browser, notes) {
  browser.VildaClcrOxcr = { evaluate() { throw new Error('History must not re-evaluate'); } };
  browser.VildaClcrOxcrReferenceData = { getPolicy() { throw new Error('History must not change source'); } };
  return browser.ClcrVisitSave.buildSeriesFromNotes(notes, { formulaId: 'OxCr_spot' });
}

// Run the actual readable vault series adapter with an in-memory note source.
// No real vault is unlocked and no encrypted storage is opened or written.
async function genericVaultSeries(notes, sanitizer) {
  const source = readFileSync(new URL('../../vilda_vault.js', import.meta.url), 'utf8');
  const adapter = source.slice(source.indexOf('async function Po(t) {'), source.indexOf('async function Ao(t)'));
  const parser = source.slice(source.indexOf('function vo(t){'), source.indexOf('function Cr(t)'));
  const create = new Function('T', 'I', 'Ft', 'kt', 'LhHasAssessment', 'HrHasReference', 'RrHasRange', 'b', 'v', 'Ur', 'Cr', 'ye', `${parser} ${adapter}; return Po;`);
  const read = create(() => true, () => ({ listPatientNotesForUser: async () => notes }), async note => note,
    sanitizer.sanitizeLabResult, () => false, () => false, () => false, 'fictional-test-actor', {},
    () => { throw new Error('Every new Ox/Cr result must have an explicit series key'); }, note => note.clinicalDateISO, () => null);
  return read('fictional-oxcr-only');
}

describe('Ox/Cr — actual collector, serializers, vault sanitizers and saved history', () => {
  it.each([
    ['1.2345', 0.012345], ['0.0499', 0.000499], ['0.0049', 0.000049], ['4.996', 0.04996], ['0', 0],
  ])('Ox %s / Cr 100 preserves the unrounded mass result %s', async (oxalateValue, raw) => {
    const context = harness();
    const snapshot = evaluate(context.browser, { mode: 'concentration', oxalateValue, oxalateUnit: 'mg/dL:acid',
      creatinineValue: '100', creatinineUnit: 'mg/dl', sameSpecimen: 'confirmed', sampleType: 'random' });
    const original = JSON.stringify(snapshot);
    const { point, note } = await save(context, snapshot);
    expect(point).toMatchObject({ valueNum: raw, unit: 'mg/mg', basis: 'acid', oxcrSnapshot: snapshot });
    expect(note.labResult).toMatchObject({ valueNum: raw, value: snapshot.display.text.replace('.', ','), unit: 'mg/mg', testKey: 'clcr-oxcr-acid-mgmg' });
    expect(note.body).toContain(`Wynik przed zaokrągleniem: ${String(raw).replace('.', ',')} mg/mg.`);
    expect(note.body).toContain('Postać analitu: kwas szczawiowy bezwodny.');
    expect(note.body).toContain('Szczawiany w moczu: ' + oxalateValue + ' mg/dL:acid.');
    expect(note.body).toContain('Kreatynina w moczu: 100 mg/dl.');
    const saved = history(context.browser, [note])[0].points[0];
    expect(saved).toMatchObject({ valueNum: raw, assessment: snapshot.status, basis: 'acid', oxcrAssessment: { ageYears: 8,
      profileId: 'FIMLAB_OXCR_P95_2025', profileVersion: '1', source: { method: 'HPLC' },
      reference: { nativeLow: null, nativeHigh: 60, upperInclusive: true },
      input: { oxalateValue, oxalateUnit: 'mg/dL:acid', creatinineValue: '100', creatinineUnit: 'mg/dl' } } });
    expect(saved.oxcrAssessment.conversion).toEqual(snapshot.conversion);
    expect(saved.oxcrAssessment.exactValue).toEqual(snapshot.exactValue);
    expect(saved.oxcrAssessment.exactNativeSI).toEqual(snapshot.exactNativeSI);
    expect(JSON.stringify(snapshot)).toBe(original);
    if (raw > 0) expect(Number(note.labResult.value.replace(',', '.'))).toBeGreaterThan(0);
  });

  it.each([null, 0, 1 / 24])('age %s without an eligible profile remains unassessed', async ageYears => {
    const context = harness();
    const { point, note } = await save(context, evaluate(context.browser, { ageYears }));
    expect(point.outOfRange).toBeNull();
    expect(note.labResult).not.toHaveProperty('norm');
    const saved = history(context.browser, [note])[0].points[0];
    expect(saved).toMatchObject({ outOfRange: null, assessment: 'unassessed', oxcrAssessment: { ageYears } });
    context.browser.VildaVault.listPatientNotesForPatient = async () => [note];
    expect((await context.browser.ClcrVisitSave.readPatientFlowsheet('fictional-oxcr-only')).parameters[0].byDate['2026-10-24'].outOfRange).toBeNull();
  });

  it.each(['mg/mg', 'mg/g', 'mg/mmol'])('unknown mass basis in %s keeps its number without inventing SI or normality', async unit => {
    const context = harness();
    const snapshot = evaluate(context.browser, { reportedUnit: unit + ':unknown', reportedValue: '0,01234500' });
    const { point, note } = await save(context, snapshot);
    expect(point).toMatchObject({ valueNum: 0.012345, outOfRange: null, basis: 'unknown' });
    expect(note.labResult).toMatchObject({ value: '0,01234500', valueNum: 0.012345, unit });
    const saved = history(context.browser, [note])[0].points[0];
    expect(saved).toMatchObject({ valueNum: 0.012345, outOfRange: null, assessment: 'unassessed', basis: 'unknown' });
    expect(saved.oxcrAssessment.reference).toBeNull();
  });

  it('both history adapters use native unit and mass basis in the series identity', async () => {
    const context = harness();
    const notes = [];
    const units = ['umol/mmol', 'mmol/mol', 'mmol/mmol', 'mol/mol', 'mg/mg:acid', 'mg/mg:ion', 'mg/mg:unknown', 'mg/g:acid', 'mg/mmol:ion'];
    for (const reportedUnit of units) notes.push((await save(context, evaluate(context.browser, { reportedUnit, reportedValue: '0,3000100' }))).note);
    const series = history(context.browser, notes);
    expect(series).toHaveLength(units.length);
    const generic = await genericVaultSeries(notes, context.sanitizer);
    expect(generic).toHaveLength(units.length);
    expect(generic.map(series => series.testKey)).toEqual(notes.map(note => note.labResult.testKey));
    expect(new Set(notes.map(note => note.labResult.testKey)).size).toBe(units.length);
    expect(notes[4].labResult.test).toContain('kwas szczawiowy bezwodny');
    expect(notes[5].labResult.test).toContain('jon szczawianowy');
    expect(notes[6].labResult.test).toContain('postać masowa niepodana');
    expect(series.map(value => value.unit)).toEqual(['µmol/mmol', 'mmol/mol', 'mmol/mmol', 'mol/mol', 'mg/mg', 'mg/mg', 'mg/mg', 'mg/g', 'mg/mmol']);
    for (const note of notes) expect(note.labResult).toMatchObject({ value: '0,3000100', valueNum: 0.30001 });
  });

  it.each([
    ['≤60', 8, 'within'], ['>60', 8, 'above'], ['≥60', 8, 'unassessed'],
    ['<2', 18, 'below'], ['≤2', 18, 'unassessed'], ['>83', 18, 'above'], ['≥83', 18, 'unassessed'],
  ])('signed report %s at age %s retains the original interval and %s assessment', async (reportedValue, ageYears, status) => {
    const context = harness();
    const snapshot = evaluate(context.browser, { reportedValue, ageYears });
    expect(snapshot.status).toBe(status);
    const { point, note } = await save(context, snapshot);
    expect(point.comparator).toBe(reportedValue[0]);
    expect(note.labResult.value).toBe(reportedValue);
    expect(note.labResult).not.toHaveProperty('valueNum');
    expect(await genericVaultSeries([note], context.sanitizer)).toEqual([]);
    const saved = history(context.browser, [note])[0].points[0];
    expect(saved).toMatchObject({ valueNum: null, comparator: reportedValue[0], displayValue: reportedValue, assessment: status });
    expect(saved.oxcrAssessment.rawValue).toBe(Number(reportedValue.slice(1)));
  });

  it.each(['<=60', '> 60', '≥ 60'])('the original signed laboratory notation %s survives alongside its canonical comparator', async reportedValue => {
    const context = harness();
    const snapshot = evaluate(context.browser, { reportedValue });
    const { note } = await save(context, snapshot);
    const saved = history(context.browser, [note])[0].points[0].oxcrAssessment;
    expect(saved.mode).toBe('direct');
    expect(saved.input).toEqual({ reportedValue, reportedUnit: 'umol/mmol' });
    expect(saved.comparator).toBe(snapshot.comparator);
    expect(saved.context.sameSpecimen).toBe('not-applicable');
  });

  it('old assessments retain their original source across the 17-year policy boundary', async () => {
    const context = harness();
    const older = (await save(context, evaluate(context.browser, { reportedValue: '70', ageYears: 17 }), '2025-10-24')).note;
    const newer = (await save(context, evaluate(context.browser, { reportedValue: '70', ageYears: 17.01 }))).note;
    const series = history(context.browser, [older, newer])[0];
    expect(series.points.map(point => point.assessment)).toEqual(['above', 'within']);
    expect(series.points.map(point => point.oxcrAssessment.profileId)).toEqual(['FIMLAB_OXCR_P95_2025', 'NEWCASTLE_OXCR_RANDOM_2024']);
    expect(series.points[1].oxcrAssessment.reference).toMatchObject({ nativeLow: 2, nativeHigh: 83, lowerInclusive: true, upperInclusive: true });
    expect(series.points[0].oxcrAssessment.contextNote).toContain('Rodzaj odniesienia: upper-percentile-95.');
    expect(series.points[1].oxcrAssessment.contextNote).toContain('Rodzaj odniesienia: two-sided-laboratory-reference-interval.');
  });

  it('absence of a new reference never borrows an older norm', async () => {
    const context = harness();
    const older = (await save(context, evaluate(context.browser), '2025-10-24')).note;
    const newer = (await save(context, evaluate(context.browser, { ageYears: null }))).note;
    const series = history(context.browser, [older, newer])[0];
    expect(series.norm).toBe('');
    expect(series.points[0].norm).not.toBe('');
    expect(series.points[1]).toMatchObject({ norm: '', outOfRange: null });
  });

  it('known sample facts remain facts, while missing answers are not converted to negatives', async () => {
    const context = harness();
    const snapshot = evaluate(context.browser, { mode: 'concentration', oxalateValue: '1', oxalateUnit: 'mg/dL:ion',
      creatinineValue: '100', creatinineUnit: 'mg/dl', sameSpecimen: 'assumed', sampleType: 'secondMorning',
      confounders: ['infection'], knownFacts: { infection: true, diureticUse: false, knownCKD: null } });
    const { note } = await save(context, snapshot);
    expect(note.body).toContain('Rodzaj próbki: drugi poranny mocz.');
    expect(note.body).toContain('Podana informacja — infekcja: tak.');
    expect(note.body).toContain('Podana informacja — leczenie diuretykiem: nie.');
    expect(note.body).toContain('Podana informacja — przewlekła choroba nerek: nie wiadomo.');
    expect(history(context.browser, [note])[0].points[0].oxcrAssessment.context).toMatchObject({ sameSpecimen: 'assumed', sampleType: 'secondMorning',
      knownFacts: { infection: true, diureticUse: false, knownCKD: null } });
    const clean = harness();
    const unspecified = await save(clean, evaluate(clean.browser));
    expect(unspecified.note.body).not.toContain('Podana informacja');
  });

  it.each([{ valueNum: 0.2, value: '0,2' }, { value: '59' }, { unit: 'mg/g' }, { norm: '0–100 µmol/mmol' }, { testKey: 'clcr-oxcr-acid-mgmg' }])(
    'editing %j invalidates saved classification without restoring the old value', async patch => {
      const context = harness();
      const { note } = await save(context, evaluate(context.browser, { reportedValue: '60.0001' }));
      const edited = { ...note, labResult: context.sanitizer.sanitizeLabResult({ ...note.labResult, ...patch }) };
      const saved = history(context.browser, [edited])[0].points[0];
      expect(saved.valueNum).toBe(edited.labResult.valueNum);
      expect(saved.outOfRange).toBeNull();
      expect(saved).not.toHaveProperty('oxcrAssessment');
      expect(saved).not.toHaveProperty('category');
    });

  it('editing a signed result retains current inequality without an exact chart point or stale norm', async () => {
    const context = harness();
    const { note } = await save(context, evaluate(context.browser, { reportedValue: '>60' }));
    for (const patch of [{ value: '≤60' }, { norm: '0–100 µmol/mmol' }, { unit: 'mg/g' }]) {
      const edited = { ...note, labResult: context.sanitizer.sanitizeLabResult({ ...note.labResult, ...patch }) };
      const saved = history(context.browser, [edited])[0].points[0];
      expect(saved).toMatchObject({ valueNum: null, comparator: edited.labResult.value[0], displayValue: edited.labResult.value, outOfRange: null });
      expect(saved).not.toHaveProperty('oxcrAssessment');
    }
  });

  it('editing a mass reference invalidates the assessment while retaining the declared analyte identity', async () => {
    const context = harness();
    const { note } = await save(context, evaluate(context.browser, { reportedUnit: 'mg/mg:acid', reportedValue: '0.10001' }));
    const edited = { ...note, labResult: context.sanitizer.sanitizeLabResult({ ...note.labResult, norm: '<0.2 mg/mg' }) };
    const series = history(context.browser, [edited])[0];
    expect(series.displayLabel).toContain('kwas szczawiowy bezwodny');
    expect(series.points[0]).toMatchObject({ valueNum: 0.10001, outOfRange: null });
    expect(series.points[0]).not.toHaveProperty('oxcrAssessment');
    expect((await genericVaultSeries([edited], context.sanitizer))[0].test).toContain('kwas szczawiowy bezwodny');
  });

  it('legacy measurements never acquire a guessed analyte basis, age or modern norm', () => {
    const { browser } = harness();
    const label = browser.ClcrVisitSave.mapDatapoint('OxCr_spot', 0.012).label;
    const notes = [{ category: 'wynik-klirens', clinicalDateISO: '2026-01-01', body: 'Kalkulator klirensu · clcr:OxCr_spot · wynik poza zakresem',
      labResult: { test: label, valueNum: 0.012, value: '0,01', unit: 'mg/mg', norm: '<0,1 mg/mg' } },
    { category: 'wynik-klirens', clinicalDateISO: '2026-01-02', body: 'Kalkulator klirensu · clcr:OxCr_spot',
      labResult: { test: label, valueNum: 0.4, value: '0,4', unit: 'mg/mg' } }];
    const original = JSON.stringify(notes);
    const series = history(browser, notes)[0];
    expect(series.norm).toBe('');
    expect(series.points[0]).toMatchObject({ valueNum: 0.012, outOfRange: true });
    expect(series.points[0]).not.toHaveProperty('oxcrAssessment');
    expect(series.points[1]).not.toHaveProperty('category');
    expect(JSON.stringify(notes)).toBe(original);
  });

  it('malformed metadata is ignored and leaves other formulas untouched', () => {
    const { browser } = harness();
    const snapshot = evaluate(browser);
    for (const encoded of ['{', '[]', 'null', JSON.stringify({ ...snapshot, basis: 'acid' }), JSON.stringify({ ...snapshot, status: 'unknown' })]) {
      const points = browser.ClcrVisitSave.collectActiveDatapoints({ querySelectorAll: () => [card(snapshot, { 'data-clcr-oxcr-snapshot': encoded })] }, { formulaId: 'OxCr_spot' });
      expect(points[0]).not.toHaveProperty('oxcrSnapshot');
      expect(points[0].valueNum).toBe(60);
    }
    const other = card(snapshot, { 'data-clcr-series': 'egfr', 'data-clcr-value': '29.96', 'data-clcr-display-value': '30.0' });
    expect(browser.ClcrVisitSave.collectActiveDatapoints({ querySelectorAll: () => [other] }, { formulaId: 'egfr' })[0].valueNum).toBe(30);
  });
});
