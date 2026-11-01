import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';

const PATIENT = 'fictional-potassium-patient';
const DATE = '2026-10-31';
const LABEL = 'Wydalanie potasu (DZM)';
const standard = { K_inputMode: 'concentration', K_concentration: '40', K_volume: '1500', K_volumeUnit: 'mL', K_collectionHours: '24', K_collectionSource: 'assumed-24h', K_reportedUnit: 'mmol/24h', K_outputUnit: 'mmol/24h', age: '40', sex: 'M' };
function harness() {
  const w = {};
  for (const file of ['clcr_collection_duration.js', 'clcr_potassium_dzm_data.js', 'clcr_potassium_dzm.js', 'clcr_potassium_dzm_persistence.js', 'clcr_saved_calculation.js', 'clcr_saved_results.js', 'clcr_notes_view.js']) loadBrowserScript(file, w);
  return w;
}
const capture = (values, context = {}) => ({ ...context, formulaId: 'K_mmol_d', values, fields: Object.keys(values).map(id => ({ id, label: id, type: typeof values[id] === 'boolean' ? 'checkbox' : 'text', required: ['K_concentration', 'K_volume', 'U_K', 'V24'].includes(id) })) });
function datapoint(w, values) {
  const snapshot = w.VildaClcrPotassiumDzm.evaluate(w.VildaClcrPotassiumDzm.inputFromValues(values), w.ClcrPotassiumDzmReferenceData.DEFAULT_POLICY);
  expect(snapshot.valid).toBe(true);
  const dp = { id: 'K_mmol_d', sourceFormulaId: 'K_mmol_d', label: LABEL };
  w.ClcrPotassiumDzmPersistence.augmentDatapoint({ getAttribute: name => name === 'data-clcr-potassium-dzm-snapshot' ? JSON.stringify(snapshot) : name === 'data-clcr-potassium-dzm-output-unit' ? snapshot.outputUnit : null }, dp);
  expect(dp.potassiumDzmSnapshot).toBeDefined();
  return dp;
}
function finish(w, dp, values, context = {}) {
  const note = { id: 'fictional-potassium-note', rev: 3, ...w.ClcrSavedResults.buildPatientNotePayload(dp, { patientId: PATIENT, clinicalDateISO: DATE, comment: 'Fikcyjny komentarz lekarza.' }) };
  const snapshot = w.ClcrSavedCalculation.createSnapshot(dp, { capture: capture(values, context), clinicalDateISO: DATE });
  expect(snapshot).not.toBeNull();
  note.body += '\n\n' + w.ClcrSavedCalculation.serializeSnapshot(snapshot, note);
  // These are the actual locked-vault production sanitizers. No real vault is opened.
  const locked = {}; loadBrowserScript('vilda_vault.js', locked);
  expect(locked.VildaVault.isUnlocked()).toBe(false);
  note.body = locked.VildaVault.sanitizeNoteText(note.body);
  note.labResult = locked.VildaVault.sanitizeLabResult(note.labResult);
  expect(note.labResult.valueNum).toBe(dp.valueNum);
  expect(note.labResult.value).toBe(dp.displayValue);
  return note;
}
function record(w, patch = {}) { const values = { ...standard, ...patch }, dp = datapoint(w, values); return { values, dp, note: finish(w, dp, values) }; }
function project(w, notes) { return w.ClcrSavedResults.projectPatientNotes(Array.isArray(notes) ? notes : [notes], { patientId: PATIENT }); }
function disableEvaluation(w) {
  w.VildaClcrPotassiumDzm = new Proxy({}, { get() { throw new Error('History cannot evaluate'); } });
  w.ClcrPotassiumDzmReferenceData = new Proxy({}, { get() { throw new Error('History cannot select a current policy'); } });
  w.__vildaClcrVersionValueVault = { age: '10', sex: 'F', K_reportedValue: '999' };
}
function rewriteEnvelope(w, note, change) {
  const start = note.body.indexOf(w.ClcrSavedCalculation.START) + w.ClcrSavedCalculation.START.length;
  const end = note.body.indexOf(w.ClcrSavedCalculation.END, start), value = JSON.parse(note.body.slice(start, end)); change(value);
  note.body = note.body.slice(0, start) + '\n' + JSON.stringify(value) + '\n' + note.body.slice(end);
}
function legacyNote(w, values, patch = {}) {
  const dp = { id: 'K_mmol_d', sourceFormulaId: 'K_mmol_d', label: LABEL, unit: 'mmol/24 h', valueNum: 60, rawValue: 60, displayValue: '60,0', outOfRange: false, norm: '', ...patch };
  const note = { id: 'fictional-old-potassium', rev: 4, patientId: PATIENT, category: 'wynik-klirens', clinicalDateISO: '2020-01-01', body: 'Kalkulator klirensu · dawny pomiar', labResult: { test: LABEL, value: String(dp.valueNum), valueNum: dp.valueNum, unit: dp.unit, norm: dp.norm } };
  const snapshot = w.ClcrSavedCalculation.createSnapshot(dp, { capture: capture(values) });
  note.body += '\n\n' + w.ClcrSavedCalculation.serializeSnapshot(snapshot, note);
  return note;
}

describe('potassium DZM frozen record, production sanitizers, history and explicit edit', () => {
  it.each([
    [{}, 'within'], [{ K_concentration: '1' }, 'below'], [{ K_concentration: '100' }, 'above'],
    [{ K_concentration: '0.01' }, 'below'], [{ K_concentration: '1e-12' }, 'below'],
    [{ K_concentration: '0' }, 'unassessed'], [{ age: '', sex: '' }, 'unassessed'],
    [{ age: '5' }, 'unassessed'], [{ age: '6', sex: 'F' }, 'within'],
    [{ age: '81', sex: 'F', K_concentration: '50' }, 'above'],
    [{ K_collectionHours: '12' }, 'unassessed'],
    [{ K_inputMode: 'reported', K_reportedValue: '60', K_collectionHours: '', K_collectionSource: 'historical-missing', K_durationNeedsConfirmation: true }, 'unassessed'],
    [{ K_inputMode: 'reported', K_reportedValue: '116.00000000000000000001' }, 'above'],
  ])('roundtrips %j through actual sanitizer and frozen readers', (patch, assessment) => {
    const w = harness(), { dp, note } = record(w, patch), before = structuredClone(note);
    expect(w.ClcrSavedCalculation.readSaved(note)).toMatchObject({ valid: true, valueNum: dp.valueNum, displayValue: dp.displayValue, unit: 'mmol/24 h', assessment });
    disableEvaluation(w);
    const point = project(w, note).measurements[0];
    expect(point).toMatchObject({ noteId: note.id, parameterKey: 'clcr:K_mmol_d', rawValue: dp.valueNum, valueNum: dp.valueNum, displayValue: dp.displayValue, unit: dp.unit, norm: dp.norm, assessment, outOfRange: dp.outOfRange });
    expect(w.ClcrNotesView.model(note, { patientId: PATIENT })).toMatchObject({ display: dp.displayValue, unit: dp.unit, norm: dp.norm, comment: 'Fikcyjny komentarz lekarza.' });
    if (assessment === 'unassessed') expect(w.ClcrNotesView.model(note).status).toBe('Bez zapisanej oceny');
    expect(note).toEqual(before);
  });
  it('retains exact-boundary decimal provenance despite equal binary Number and approximate display', () => {
    const w = harness(), { dp, note } = record(w, { K_inputMode: 'reported', K_reportedValue: '116.00000000000000000001' });
    expect(dp).toMatchObject({ valueNum: 116, assessment: 'above', outOfRange: true });
    expect(dp.potassiumDzmSnapshot.input.reportedValue).toBe('116.00000000000000000001');
    expect(dp.displayValue).toMatch(/^≈/);
    expect(dp.boundary).toBe('116,00000000000000000001');
    expect(w.ClcrNotesView.model(note).boundary).toBe(dp.boundary);
    const doc = atrapaDokumentu(), host = doc.createElement('article'); doc.body.appendChild(host);
    w.ClcrNotesView.render(host, { note, patientId: PATIENT });
    expect(host.querySelector('.clcr-note-boundary').textContent).toBe('Wartość przed zaokrągleniem: 116,00000000000000000001.');
    expect(w.ClcrSavedCalculation.readSaved(note).snapshot.assessment.potassiumDzmSnapshot.exactMain).toEqual(dp.potassiumDzmSnapshot.exactMain);
    const tiny = record(w, { K_concentration: '1e-12' });
    expect(tiny.note.labResult.valueNum).toBe(1.5e-12);
    expect(tiny.note.labResult.value).not.toMatch(/^0(?:[,.]0*)?$/);
  });
  it('roundtrips a recurring non24h quantity through the real sanitizer, saved reader, history and Notes', () => {
    const w = harness(), { dp, note } = record(w, { K_concentration: '100', K_volume: '1500', K_collectionHours: '7', K_collectionSource: 'hours' });
    expect(dp.potassiumDzmSnapshot).toMatchObject({ exactMain: { numerator: '3600', denominator: '7' }, full24Hours: false, referenceAvailable: false, presentation: { fullValueComplete: false } });
    expect(dp.boundary).toBe('3600/7');
    const before = structuredClone(note);
    const locked = {}; loadBrowserScript('vilda_vault.js', locked);
    expect(locked.VildaVault.sanitizeNoteText(note.body)).toBe(note.body);
    expect(locked.VildaVault.sanitizeLabResult(note.labResult)).toEqual(note.labResult);
    disableEvaluation(w);
    expect(w.ClcrSavedCalculation.readSaved(note)).toMatchObject({ valid: true, valueNum: 3600 / 7, assessment: 'unassessed', outOfRange: null, norm: '', boundary: dp.boundary });
    expect(project(w, note).measurements[0]).toMatchObject({ valueNum: 3600 / 7, assessment: 'unassessed', outOfRange: null, norm: '', boundary: dp.boundary });
    expect(w.ClcrNotesView.model(note)).toMatchObject({ status: 'Bez zapisanej oceny', norm: '', boundary: dp.boundary });
    const doc = atrapaDokumentu(), host = doc.createElement('article'); doc.body.appendChild(host);
    w.ClcrNotesView.render(host, { note, patientId: PATIENT });
    expect(host.querySelector('.clcr-note-boundary').textContent).toBe('Wartość przed zaokrągleniem: 3600/7.');
    expect(host.textContent).not.toContain(dp.potassiumDzmSnapshot.presentation.fullValueText);
    expect(note.body).toContain(dp.potassiumDzmSnapshot.presentation.fullValueText);
    expect(note).toEqual(before);
  });
  it('preserves volume conversion provenance including a subnormal converted field', () => {
    const w = harness(), converted = w.VildaClcrPotassiumDzm.convertUnitInput('5e-324', 'mL', 'L', 'volume');
    expect(converted.ok).toBe(true);
    const provenance = { volume: { originalValue: '5e-324', originalUnit: 'mL', convertedValue: converted.text, convertedUnit: 'L' } };
    const { dp, note } = record(w, { K_concentration: '1e308', K_volume: converted.text, K_volumeUnit: 'L', K_unitConversions: JSON.stringify(provenance) });
    expect(dp.valueNum).toBe(5e-19);
    expect(w.ClcrSavedCalculation.readSaved(note)).toMatchObject({ valid: true, valueNum: 5e-19 });
    expect(dp.potassiumDzmSnapshot.input.unitConversions).toEqual(provenance);
  });
  it('rejects a forged arithmetic identity whose concentration operand is not finite', () => {
    const w = harness(), { dp } = record(w), model = structuredClone(dp.potassiumDzmSnapshot);
    model.input.concentration = '1e310'; model.input.volume = '6e-306';
    model.exactVolumeLitres = { numerator: '6', denominator: '1' + '0'.repeat(309) };
    expect(w.ClcrPotassiumDzmPersistence.readSnapshot(JSON.stringify(model))).toBeNull();
  });
  it('keeps zero neutral with its available recorded norm and detection/report note', () => {
    const w = harness(), { dp, note } = record(w, { K_concentration: '0' });
    expect(dp).toMatchObject({ valueNum: 0, assessment: 'unassessed', outOfRange: null, tone: 'neutral', norm: '20–116 mmol/24 h' });
    expect(dp.potassiumDzmSnapshot).toMatchObject({ referenceAvailable: true, referenceActive: false });
    expect(dp.interpretation).toMatch(/oznaczalności|laboratorium/);
    expect(project(w, note).measurements[0]).toMatchObject({ valueNum: 0, assessment: 'unassessed', outOfRange: null });
  });
  it.each(['valueNum', 'rawValue', 'displayValue', 'unit', 'norm', 'outOfRange', 'assessment', 'tone', 'interpretation'])('rejects inconsistent %s in the actual save payload', key => {
    const w = harness(), { dp } = record(w), changes = { valueNum: -1, rawValue: 0, displayValue: '0', unit: 'g/24 h', norm: '1–2 mmol/24 h', outOfRange: true, assessment: 'below', tone: 'warning', interpretation: 'Zmieniona interpretacja' };
    expect(() => w.ClcrSavedResults.buildPatientNotePayload({ ...dp, [key]: changes[key] }, { patientId: PATIENT, clinicalDateISO: DATE })).toThrow();
  });
  it.each([
    s => { s.input.concentration = '-1'; }, s => { s.input.reportedUnit = 'mgK/24h'; },
    s => { s.presentation.valueText = '0'; }, s => { s.presentation.rawValue = 0; },
    s => { s.reference.upper = 117; }, s => { s.reference.sourceLabel = 'Inne źródło'; },
    s => { s.input.ageYears = 5; }, s => { s.input.sex = 'F'; },
    s => { s.exactMain = { numerator: '59', denominator: '1' }; },
    s => { s.interpretation = 'Nieutrwalony opis'; }, s => { s.biochemical = true; },
  ])('fails closed for changed arithmetic, demographics, reference and qualification', change => {
    const w = harness(), { dp } = record(w), snapshot = structuredClone(dp.potassiumDzmSnapshot); change(snapshot);
    expect(w.ClcrPotassiumDzmPersistence.readSnapshot(JSON.stringify(snapshot))).toBeNull();
  });
  it.each(['K_concentration', 'K_outputUnit', 'age', 'sex'])('invalidates changed captured %s without applying a new reference', key => {
    const w = harness(), { note } = record(w);
    rewriteEnvelope(w, note, s => { s.values[key] = key === 'sex' ? 'F' : '999'; });
    expect(w.ClcrSavedCalculation.readSaved(note)).toMatchObject({ valid: false, invalidated: true });
    expect(project(w, note).measurements[0]).toMatchObject({ assessment: 'unassessed', outOfRange: null, norm: '', tone: 'neutral' });
  });
  it('reads a standalone human-readable snapshot without engine or current data', () => {
    const w = harness(), { dp, note } = record(w), reader = {};
    loadBrowserScript('clcr_potassium_dzm_persistence.js', reader);
    expect(note.body).toContain('Stężenie potasu w moczu [tekst]: "40"');
    expect(reader.ClcrPotassiumDzmPersistence.savedAssessment(note)).toMatchObject({ dailyMmol: 60 });
    note.labResult.testKey = 'clcr:Na_mmol_d';
    expect(reader.ClcrPotassiumDzmPersistence.savedAssessment(note)).toBeNull();
    expect(reader.ClcrPotassiumDzmPersistence.readSnapshot(JSON.stringify(dp.potassiumDzmSnapshot))).toBeTruthy();
  });
  it('edits with the captured policy and same measurement identity', () => {
    const w = harness(), { note } = record(w), original = structuredClone(note), saved = w.ClcrSavedCalculation.readSaved(note);
    w.ClcrPotassiumDzmReferenceData = { get DEFAULT_POLICY() { throw new Error('Use captured source'); } };
    const changed = w.ClcrSavedCalculation.recalculate(saved, { values: { K_concentration: '0.01' } });
    expect(changed).toMatchObject({ id: 'K_mmol_d', valueNum: 0.015, displayValue: '0,015', unit: 'mmol/24 h', assessment: 'below' });
    expect(changed.potassiumDzmSnapshot.input).toMatchObject({ ageYears: 40, sex: 'M' });
    const replacement = { ...finish(w, changed, changed.capture.values, changed.capture), id: note.id, rev: note.rev + 1 };
    expect(project(w, replacement).measurements).toHaveLength(1);
    expect(project(w, replacement).measurements[0]).toMatchObject({ noteId: note.id, valueNum: 0.015 });
    expect(note).toEqual(original);
  });
  it('keeps an old rounded record as recorded; explicit edit recovers precision from selected broad inputs', () => {
    const w = harness(), values = { U_K: '0.01', V24: '1500', Cl24DurationHours: '24', age: '40', sex: 'M', K_inputMode: 'reported', K_reportedValue: '999', K_collectionHours: '12' };
    const note = legacyNote(w, values, { rawValue: 0.015, valueNum: 0, displayValue: '0,0' });
    expect(w.ClcrSavedCalculation.readSaved(note)).toMatchObject({ valid: true, valueNum: 0, assessment: 'unassessed', outOfRange: null });
    expect(project(w, note).measurements[0]).toMatchObject({ valueNum: 0, outOfRange: null, norm: '' });
    const corrected = w.ClcrSavedCalculation.recalculate(w.ClcrSavedCalculation.readSaved(note));
    expect(corrected).toMatchObject({ valueNum: 0.015, displayValue: '0,015' });
    expect(corrected.potassiumDzmSnapshot.input).toMatchObject({ mode: 'concentration', concentration: '0.01', volume: '1500', hours: '24' });
    expect(() => w.ClcrSavedCalculation.recalculate(w.ClcrSavedCalculation.readSaved(note), { values: { U_K: '-1' } })).toThrow();
  });
  it('preserves an exact historical decimal clock that Number would round to24h', () => {
    const w = harness(), note = legacyNote(w, { U_K: '40', V24: '1500', Cl24DurationHours: '24.00000000000000000001', age: '40', sex: 'M' });
    const changed = w.ClcrSavedCalculation.recalculate(w.ClcrSavedCalculation.readSaved(note));
    expect(changed.potassiumDzmSnapshot.input.hours).toBe('24.00000000000000000001');
    expect(changed).toMatchObject({ valueNum: 60, assessment: 'unassessed', outOfRange: null, norm: '' });
    expect(changed.potassiumDzmSnapshot.full24Hours).toBe(false);
  });
  it('never invents 24 h when editing historical unknown clocks; daily quantities remain neutral and unscaled', () => {
    const w = harness(), note = legacyNote(w, { U_K: '40', V24: '1500', age: '40', sex: 'M' });
    const desc = w.ClcrSavedCalculation.describe(note);
    expect(desc.values).toMatchObject({ K_collectionHours: '', K_collectionSource: 'historical-missing', K_durationNeedsConfirmation: true });
    expect(() => w.ClcrSavedCalculation.recalculate(desc.snapshot)).toThrow(/czas/i);
    expect(w.ClcrSavedCalculation.recalculate(desc.snapshot, { values: { K_collectionHours: '24' } })).toMatchObject({ valueNum: 60 });
    const daily = w.ClcrSavedCalculation.recalculate(desc.snapshot, { values: { K_inputMode: 'reported', K_reportedValue: '60' } });
    expect(daily).toMatchObject({ valueNum: 60, norm: '', assessment: 'unassessed', outOfRange: null });
  });
  it.each([{ U_K: '-1' }, { U_K: 'Infinity' }, { U_K: '1e-400' }, { Cl24DurationHours: '' }, { Cl24DurationHours: '-24' }, { Cl24CollectionProblem: true }, { ui_collectionNoMissedVoids_answer: 'no' }])('rejects %j in actual saved editor and broad legacy entry', patch => {
    const w = harness(); loadBrowserScript('clcr_saved_legacy_calculator.js', w);
    const values = { U_K: '40', V24: '1500', Cl24DurationHours: '24', age: '40', sex: 'M' };
    expect(() => w.ClcrSavedLegacyCalculator.recalculate('K_mmol_d', { ...values, ...patch }, 'K_mmol_d')).toThrow();
    const saved = w.ClcrSavedCalculation.readSaved(legacyNote(w, values));
    expect(() => w.ClcrSavedCalculation.recalculate(saved, { values: patch })).toThrow();
  });
  it('broad public legacy entry ignores dormant dedicated inputs and preserves exact comparison', () => {
    const w = harness(); loadBrowserScript('clcr_saved_legacy_calculator.js', w);
    const dp = w.ClcrSavedLegacyCalculator.recalculate('K_mmol_d', { U_K: '116.00000000000000000001', V24: '1000', Cl24DurationHours: '24', K_reportedValue: '1', K_inputMode: 'reported', K_collectionHours: '12', age: '40', sex: 'M' }, 'K_mmol_d');
    expect(dp).toMatchObject({ valueNum: 116, assessment: 'above', outOfRange: true });
    expect(dp.potassiumDzmSnapshot.input).toMatchObject({ mode: 'concentration', hours: '24', concentration: '116.00000000000000000001' });
  });
});
