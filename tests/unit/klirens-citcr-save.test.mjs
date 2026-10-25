import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

function harness() {
  const captured = [];
  const browser = { VildaVault: { isUnlocked: () => true, savePatientNote: async note => { captured.push(note); } } };
  for (const file of ['clcr_citcr_reference_data.js', 'clcr_citcr.js', 'clcr_citcr_persistence.js', 'clcr_ui_workflow.js']) loadBrowserScript(file, browser);
  const realVault = {};
  loadBrowserScript('vilda_vault.js', realVault);
  return { browser, captured, sanitizer: realVault.VildaVault };
}
function evaluate(browser, input = {}) {
  return browser.VildaClcrCitcr.evaluate({ mode: 'direct', reportedValue: '120', reportedUnit: 'umol/mmol', ageYears: 8, sex: 'M', ...input },
    browser.VildaClcrCitcrReferenceData.DEFAULT_POLICY).snapshot;
}
function card(snapshot, overrides = {}) {
  const attrs = { 'data-clcr-series': 'CitCr_spot', 'data-clcr-value': String(snapshot.rawValue),
    'data-clcr-display-value': snapshot.display.value, 'data-clcr-citcr-snapshot': JSON.stringify(snapshot), ...overrides };
  return { getAttribute: key => attrs[key] ?? null, getClientRects: () => [{ width: 400, height: 200 }],
    classList: { contains: key => key === 'out-of-range' && ['below', 'above'].includes(snapshot.status) }, querySelector: () => null };
}
async function save(context, snapshot, date = '2026-10-24') {
  const { browser, captured, sanitizer } = context;
  expect(snapshot).not.toBeNull();
  const points = browser.ClcrVisitSave.collectActiveDatapoints({ querySelectorAll: () => [card(snapshot)] }, { formulaId: 'CitCr_spot' });
  expect(points).toHaveLength(1);
  expect(await browser.ClcrVisitSave.saveActiveResultToCard({ patientId: 'fictional-citcr-only', clinicalDateISO: date, datapoints: points }))
    .toMatchObject({ ok: true, saved: 1 });
  const note = captured.at(-1);
  const sanitized = { ...note, body: sanitizer.sanitizeNoteText(note.body), labResult: sanitizer.sanitizeLabResult(note.labResult) };
  expect(sanitized).toEqual(note);
  expect(sanitizer.isUnlocked()).toBe(false);
  expect(note.labResult).not.toHaveProperty('citcrSnapshot');
  expect(note.body).not.toContain('"schema"');
  return { point: points[0], note: sanitized };
}
function history(browser, notes) {
  browser.VildaClcrCitcr = { evaluate() { throw new Error('History must not re-evaluate'); } };
  browser.VildaClcrCitcrReferenceData = { getPolicy() { throw new Error('History must not change source'); } };
  return browser.ClcrVisitSave.buildSeriesFromNotes(notes, { formulaId: 'CitCr_spot' });
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
    () => { throw new Error('Every new Cit/Cr result must have an explicit series key'); }, note => note.clinicalDateISO, () => null);
  return read('fictional-citcr-only');
}

describe('Cit/Cr — actual collector, serializers, vault sanitizers and saved history', () => {
  it.each([
    ['1.2345', 0.012345], ['0.0499', 0.000499], ['0.0049', 0.000049], ['4.996', 0.04996], ['0', 0],
  ])('Cit %s / Cr 100 preserves the unrounded mass result %s', async (citrateValue, raw) => {
    const context = harness();
    const snapshot = evaluate(context.browser, { mode: 'concentration', citrateValue, citrateUnit: 'mg/dL:acid',
      creatinineValue: '100', creatinineUnit: 'mg/dl', sameSpecimen: 'confirmed', sampleType: 'random' });
    const original = JSON.stringify(snapshot);
    const { point, note } = await save(context, snapshot);
    expect(point).toMatchObject({ valueNum: raw, unit: 'mg/mg', basis: 'acid', citcrSnapshot: snapshot });
    expect(note.labResult).toMatchObject({ valueNum: raw, value: snapshot.display.text.replace('.', ','), unit: 'mg/mg', testKey: 'clcr-citcr-acid-mgmg' });
    expect(note.body).toContain(`Wynik przed zaokrągleniem: ${String(raw).replace('.', ',')} mg/mg.`);
    expect(note.body).toContain('Postać analitu: kwas cytrynowy bezwodny.');
    expect(note.body).toContain('Cytryniany w moczu: ' + citrateValue + ' mg/dL:acid.');
    expect(note.body).toContain('Kreatynina w moczu: 100 mg/dl.');
    const saved = history(context.browser, [note])[0].points[0];
    expect(saved).toMatchObject({ valueNum: raw, assessment: snapshot.status, basis: 'acid', citcrAssessment: { ageYears: 8,
      profileId: 'PATHWEST_CITCR_SPOT_2025', profileVersion: '1', source: { method: 'Nie podano w katalogu' },
      reference: { nativeLow: 100, nativeHigh: null, lowerInclusive: false },
      input: { citrateValue, citrateUnit: 'mg/dL:acid', creatinineValue: '100', creatinineUnit: 'mg/dl' } } });
    expect(saved.citcrAssessment.conversion).toEqual(snapshot.conversion);
    expect(saved.citcrAssessment.exactValue).toEqual(snapshot.exactValue);
    expect(saved.citcrAssessment.exactNativeSI).toEqual(snapshot.exactNativeSI);
    expect(JSON.stringify(snapshot)).toBe(original);
    if (raw > 0) expect(Number(note.labResult.value.replace(',', '.'))).toBeGreaterThan(0);
  });

  it.each([null])('age %s without an eligible profile remains unassessed', async ageYears => {
    const context = harness();
    const { point, note } = await save(context, evaluate(context.browser, { ageYears }));
    expect(point.outOfRange).toBeNull();
    expect(note.labResult).not.toHaveProperty('norm');
    const saved = history(context.browser, [note])[0].points[0];
    expect(saved).toMatchObject({ outOfRange: null, assessment: 'unassessed', citcrAssessment: { ageYears } });
    context.browser.VildaVault.listPatientNotesForPatient = async () => [note];
    expect((await context.browser.ClcrVisitSave.readPatientFlowsheet('fictional-citcr-only')).parameters[0].byDate['2026-10-24'].outOfRange).toBeNull();
  });

  it.each(['mg/mg', 'mg/g', 'mg/mmol'])('unknown mass basis in %s keeps its number without inventing SI or normality', async unit => {
    const context = harness();
    const snapshot = evaluate(context.browser, { reportedUnit: unit + ':unknown', reportedValue: '0,01234500' });
    const { point, note } = await save(context, snapshot);
    expect(point).toMatchObject({ valueNum: 0.012345, outOfRange: null, basis: 'unknown' });
    expect(note.labResult).toMatchObject({ value: '0,01234500', valueNum: 0.012345, unit });
    const saved = history(context.browser, [note])[0].points[0];
    expect(saved).toMatchObject({ valueNum: 0.012345, outOfRange: null, assessment: 'unassessed', basis: 'unknown' });
    expect(saved.citcrAssessment.reference).toBeNull();
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
    expect(notes[4].labResult.test).toContain('kwas cytrynowy bezwodny');
    expect(notes[5].labResult.test).toContain('jon cytrynianowy');
    expect(notes[6].labResult.test).toContain('postać masowa niepodana');
    expect(series.map(value => value.unit)).toEqual(['µmol/mmol', 'mmol/mol', 'mmol/mmol', 'mol/mol', 'mg/mg', 'mg/mg', 'mg/mg', 'mg/g', 'mg/mmol']);
    for (const note of notes) expect(note.labResult).toMatchObject({ value: '0,3000100', valueNum: 0.30001 });
  });

  it.each([
    ['≤100', 8, 'below'], ['>100', 8, 'within'], ['≥100', 8, 'unassessed'],
    ['<40', 18, 'below'], ['≤40', 18, 'unassessed'], ['>330', 18, 'above'], ['≥330', 18, 'unassessed'],
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
    expect(saved.citcrAssessment.rawValue).toBe(Number(reportedValue.slice(1)));
  });

  it.each(['<=60', '> 60', '≥ 60'])('the original signed laboratory notation %s survives alongside its canonical comparator', async reportedValue => {
    const context = harness();
    const snapshot = evaluate(context.browser, { reportedValue });
    const { note } = await save(context, snapshot);
    const saved = history(context.browser, [note])[0].points[0].citcrAssessment;
    expect(saved.mode).toBe('direct');
    expect(saved.input).toEqual({ reportedValue, reportedUnit: 'umol/mmol' });
    expect(saved.comparator).toBe(snapshot.comparator);
    expect(saved.context.sameSpecimen).toBe('not-applicable');
  });

  it('old assessments retain their original source across the 18-year policy boundary', async () => {
    const context = harness();
    const older = (await save(context, evaluate(context.browser, { reportedValue: '70', ageYears: 17 }), '2025-10-24')).note;
    const newer = (await save(context, evaluate(context.browser, { reportedValue: '70', ageYears: 18 }))).note;
    const series = history(context.browser, [older, newer])[0];
    expect(series.points.map(point => point.assessment)).toEqual(['below', 'within']);
    expect(series.points.map(point => point.citcrAssessment.profileId)).toEqual(['PATHWEST_CITCR_SPOT_2025', 'NEWCASTLE_CITCR_RANDOM_2025']);
    expect(series.points[1].citcrAssessment.reference).toMatchObject({ nativeLow: 40, nativeHigh: 330, lowerInclusive: true, upperInclusive: true });
    expect(series.points[0].citcrAssessment.contextNote).toContain('Rodzaj odniesienia: lower-reference-limit.');
    expect(series.points[1].citcrAssessment.contextNote).toContain('Rodzaj odniesienia: two-sided-laboratory-reference-interval.');
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

  it('the strict pediatric lower limit survives storage with no invented upper bound', async () => {
    const context = harness();
    const snapshot = evaluate(context.browser, { reportedValue: '100' });
    expect(snapshot.status).toBe('below');
    const { note } = await save(context, snapshot);
    expect(note.body).toContain('Dolna granica źródłowa: 100 µmol/mmol; wyłączona.');
    expect(note.body).not.toContain('Górna granica źródłowa');
    expect(note.labResult.norm).toBe('>100 µmol/mmol');
    expect(history(context.browser, [note])[0].points[0].citcrAssessment.reference)
      .toMatchObject({ nativeLow: 100, nativeHigh: null, lowerInclusive: false, upperInclusive: null });
  });

  it('adult male and female references keep the sex used at their own assessment', async () => {
    const context = harness();
    const male = (await save(context, evaluate(context.browser, { reportedValue: '70', ageYears: 30, sex: 'M' }), '2025-10-24')).note;
    const female = (await save(context, evaluate(context.browser, { reportedValue: '70', ageYears: 30, sex: 'F' }))).note;
    expect(male.body).toContain('Płeć użyta przy ocenie: mężczyzna.');
    expect(female.body).toContain('Płeć użyta przy ocenie: kobieta.');
    const points = history(context.browser, [male, female])[0].points;
    expect(points.map(point => point.assessment)).toEqual(['within', 'below']);
    expect(points[0].citcrAssessment.context).toMatchObject({ ageYears: 30, sex: 'M' });
    expect(points[1].citcrAssessment.context).toMatchObject({ ageYears: 30, sex: 'F' });
    expect(points[0].citcrAssessment.reference).toMatchObject({ nativeLow: 40, nativeHigh: 330 });
    expect(points[1].citcrAssessment.reference).toMatchObject({ nativeLow: 110, nativeHigh: 550 });
  });

  it('missing adult sex remains an explicitly unassessed number through both history and flowsheet', async () => {
    const context = harness();
    const { note, point } = await save(context, evaluate(context.browser, { ageYears: 30, sex: '' }));
    expect(point.outOfRange).toBeNull();
    expect(note.labResult).not.toHaveProperty('norm');
    const saved = history(context.browser, [note])[0].points[0];
    expect(saved).toMatchObject({ assessment: 'unassessed', outOfRange: null, citcrAssessment: { context: { ageYears: 30, sex: '' }, reference: null } });
    context.browser.VildaVault.listPatientNotesForPatient = async () => [note];
    const result = await context.browser.ClcrVisitSave.readPatientFlowsheet('fictional-citcr-only');
    expect(result.parameters[0].byDate['2026-10-24'].outOfRange).toBeNull();
  });

  it('known sample facts remain facts, while missing answers are not converted to negatives', async () => {
    const context = harness();
    const snapshot = evaluate(context.browser, { mode: 'concentration', citrateValue: '1', citrateUnit: 'mg/dL:ion',
      creatinineValue: '100', creatinineUnit: 'mg/dl', sameSpecimen: 'assumed', sampleType: 'secondMorning',
      confounders: ['infection'], knownFacts: { infection: true, diureticUse: false, knownCKD: null } });
    const { note } = await save(context, snapshot);
    expect(note.body).toContain('Rodzaj próbki: drugi poranny mocz.');
    expect(note.body).toContain('Podana informacja — infekcja: tak.');
    expect(note.body).toContain('Podana informacja — leczenie diuretykiem: nie.');
    expect(note.body).toContain('Podana informacja — przewlekła choroba nerek: nie wiadomo.');
    expect(history(context.browser, [note])[0].points[0].citcrAssessment.context).toMatchObject({ sameSpecimen: 'assumed', sampleType: 'secondMorning',
      knownFacts: { infection: true, diureticUse: false, knownCKD: null } });
    const clean = harness();
    const unspecified = await save(clean, evaluate(clean.browser));
    expect(unspecified.note.body).not.toContain('Podana informacja');
  });

  it.each([{ valueNum: 0.2, value: '0,2' }, { value: '59' }, { unit: 'mg/g' }, { norm: '0–100 µmol/mmol' }, { testKey: 'clcr-citcr-acid-mgmg' }])(
    'editing %j invalidates saved classification without restoring the old value', async patch => {
      const context = harness();
      const { note } = await save(context, evaluate(context.browser, { reportedValue: '60.0001' }));
      const edited = { ...note, labResult: context.sanitizer.sanitizeLabResult({ ...note.labResult, ...patch }) };
      const saved = history(context.browser, [edited])[0].points[0];
      expect(saved.valueNum).toBe(edited.labResult.valueNum);
      expect(saved.outOfRange).toBeNull();
      expect(saved).not.toHaveProperty('citcrAssessment');
      expect(saved).not.toHaveProperty('category');
    });

  it('editing a signed result retains current inequality without an exact chart point or stale norm', async () => {
    const context = harness();
    const { note } = await save(context, evaluate(context.browser, { reportedValue: '>60' }));
    for (const patch of [{ value: '≤60' }, { norm: '0–100 µmol/mmol' }, { unit: 'mg/g' }]) {
      const edited = { ...note, labResult: context.sanitizer.sanitizeLabResult({ ...note.labResult, ...patch }) };
      const saved = history(context.browser, [edited])[0].points[0];
      expect(saved).toMatchObject({ valueNum: null, comparator: edited.labResult.value[0], displayValue: edited.labResult.value, outOfRange: null });
      expect(saved).not.toHaveProperty('citcrAssessment');
    }
  });

  it('editing a mass reference invalidates the assessment while retaining the declared analyte identity', async () => {
    const context = harness();
    const { note } = await save(context, evaluate(context.browser, { reportedUnit: 'mg/mg:acid', reportedValue: '0.10001' }));
    const edited = { ...note, labResult: context.sanitizer.sanitizeLabResult({ ...note.labResult, norm: '<0.2 mg/mg' }) };
    const series = history(context.browser, [edited])[0];
    expect(series.displayLabel).toContain('kwas cytrynowy bezwodny');
    expect(series.points[0]).toMatchObject({ valueNum: 0.10001, outOfRange: null });
    expect(series.points[0]).not.toHaveProperty('citcrAssessment');
    expect((await genericVaultSeries([edited], context.sanitizer))[0].test).toContain('kwas cytrynowy bezwodny');
  });

  it('legacy measurements never acquire a guessed analyte basis, age or modern norm', () => {
    const { browser } = harness();
    const label = browser.ClcrVisitSave.mapDatapoint('CitCr_spot', 0.012).label;
    const notes = [{ category: 'wynik-klirens', clinicalDateISO: '2026-01-01', body: 'Kalkulator klirensu · clcr:CitCr_spot · wynik poza zakresem',
      labResult: { test: label, valueNum: 0.012, value: '0,01', unit: 'mg/mg', norm: '<0,1 mg/mg' } },
    { category: 'wynik-klirens', clinicalDateISO: '2026-01-02', body: 'Kalkulator klirensu · clcr:CitCr_spot',
      labResult: { test: label, valueNum: 0.4, value: '0,4', unit: 'mg/mg' } }];
    const original = JSON.stringify(notes);
    const series = history(browser, notes)[0];
    expect(series.norm).toBe('');
    expect(series.points[0]).toMatchObject({ valueNum: 0.012, outOfRange: true });
    expect(series.points[0]).not.toHaveProperty('citcrAssessment');
    expect(series.points[1]).not.toHaveProperty('category');
    expect(JSON.stringify(notes)).toBe(original);
  });

  it('malformed metadata is ignored and leaves other formulas untouched', () => {
    const { browser } = harness();
    const snapshot = evaluate(browser);
    for (const encoded of ['{', '[]', 'null', JSON.stringify({ ...snapshot, basis: 'acid' }), JSON.stringify({ ...snapshot, status: 'unknown' })]) {
      const points = browser.ClcrVisitSave.collectActiveDatapoints({ querySelectorAll: () => [card(snapshot, { 'data-clcr-citcr-snapshot': encoded })] }, { formulaId: 'CitCr_spot' });
      expect(points[0]).not.toHaveProperty('citcrSnapshot');
      expect(points[0].valueNum).toBe(120);
    }
    const other = card(snapshot, { 'data-clcr-series': 'egfr', 'data-clcr-value': '29.96', 'data-clcr-display-value': '30.0' });
    expect(browser.ClcrVisitSave.collectActiveDatapoints({ querySelectorAll: () => [other] }, { formulaId: 'egfr' })[0].valueNum).toBe(30);
  });
});
