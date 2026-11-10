import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';

const DATE = '2026-11-06', PATIENT = 'fictional-ktv-persistence';
function harness() {
  const w = {};
  for (const file of ['clcr_ktv_reference_data.js', 'clcr_ktv.js', 'clcr_ktv_persistence.js', 'clcr_saved_calculation.js', 'clcr_saved_results.js', 'clcr_saved_legacy_calculator.js', 'clcr_notes_view.js', 'clcr_saved_results_view.js']) loadBrowserScript(file, w);
  const vault = {}; loadBrowserScript('vilda_vault.js', vault);
  return { w, sanitizer: vault.VildaVault };
}
function values(variant = 'spktv', extra = {}) {
  return { ktvVariant: variant, UreaPre: '120', UreaPost: '36', ktvDurationMinutes: '240', ktvUF: '2', ktvW: '70', ktvSessionsPerWeek: '3', ktvPidiDays: '2', ktvAccessType: 'avf', age: '50', ageMonths: '0', ...extra };
}
function save(h, input, date = DATE) {
  const key = h.w.ClcrKtvPersistence.METRICS[input.ktvVariant].id;
  const dp = h.w.ClcrSavedLegacyCalculator.recalculate('KTV', input, key, { clinicalDateISO: date });
  const capture = { formulaId: 'KTV', values: input, fields: h.w.ClcrKtvPersistence.captureFields(input), clinicalDateISO: date, ageYears: 50 };
  const payload = h.w.ClcrSavedResults.buildPatientNotePayload(dp, { patientId: PATIENT, clinicalDateISO: date });
  const snapshot = h.w.ClcrSavedCalculation.createSnapshot(dp, { capture, clinicalDateISO: date });
  expect(snapshot).not.toBeNull();
  payload.body += '\n\n' + h.w.ClcrSavedCalculation.serializeSnapshot(snapshot, payload);
  const note = { id: 'fictional-' + key, rev: 1, ...payload, labResult: h.sanitizer.sanitizeLabResult(payload.labResult), body: h.sanitizer.sanitizeNoteText(payload.body) };
  expect(note.body).toBe(payload.body);
  expect(h.sanitizer.isUnlocked()).toBe(false);
  return { dp, note };
}

describe('Kt/V: exact selected metric and frozen clinical assessment', () => {
  it.each(['spktv', 'ektv', 'urr'])('saves only %s in its original series and reads without an engine', variant => {
    const h = harness(), { w } = h, { dp, note } = save(h, values(variant));
    expect(dp.id).toBe(w.ClcrKtvPersistence.METRICS[variant].id);
    expect(dp.ktvSnapshot).toMatchObject({ schema: 'clcr-ktv', version: 1, valid: true, input: { variant, evaluationDate: DATE } });
    expect(note.labResult).toMatchObject({ valueNum: dp.rawValue, unit: variant === 'urr' ? '%' : '—' });
    const frozen = w.ClcrKtvPersistence.savedAssessment(note);
    expect(frozen.rawValue).toBe(dp.rawValue);
    expect(frozen.reference).toEqual(dp.ktvSnapshot.reference);
    w.VildaClcrKtv = { evaluate() { throw new Error('Reading must not recalculate'); } };
    const saved = w.ClcrSavedCalculation.readSaved(note);
    expect(saved).toMatchObject({ valid: true, valueNum: dp.rawValue, rawValue: dp.rawValue, outOfRange: dp.outOfRange });
    const view = w.ClcrSavedResults.projectPatientNotes([note], { patientId: PATIENT });
    expect(view.measurements).toHaveLength(1);
    expect(view.measurements[0]).toMatchObject({ valueNum: dp.rawValue, outOfRange: dp.outOfRange });
  });
  it.each([
    ['35.001', 64.999, 'below-minimum', true, 'danger'], ['35', 65, 'below-target', true, 'warning'],
    ['30.001', 69.999, 'below-target', true, 'warning'], ['30', 70, 'within', false, 'normal'],
  ])('keeps the raw URR boundary for post=%s through note and charts', (post, raw, status, out, tone) => {
    const h = harness(), { dp, note } = save(h, values('urr', { UreaPre: '100', UreaPost: post }));
    expect(dp.rawValue).toBe(raw);
    expect(dp.ktvSnapshot).toMatchObject({ status, outOfRange: out, tone });
    expect(note.labResult.valueNum).toBe(raw);
    expect(note.labResult.value).not.toMatch(/^[<>≤≥]/);
    const saved = h.w.ClcrSavedCalculation.readSaved(note);
    expect(saved).toMatchObject({ valid: true, valueNum: raw, outOfRange: out });
    const view = h.w.ClcrSavedResults.projectPatientNotes([note], { patientId: PATIENT });
    expect(view.measurements[0]).toMatchObject({ valueNum: raw, comparator: '', outOfRange: out, tone: tone === 'normal' ? 'success' : tone });
  });
  it('does not derive saved assessment from the colour of an outer container', () => {
    const h = harness(), { w } = h;
    const result = w.VildaClcrKtv.evaluate(w.VildaClcrKtv.inputFromValues(values('spktv', { UreaPre: '20', UreaPost: '9' }), { clinicalDateISO: DATE }), w.VildaClcrKtvReferenceData.DEFAULT_POLICY);
    const dp = { ...w.ClcrSavedResults.getParam('KTV_spktv'), valueNum: 0.94, outOfRange: false };
    w.ClcrKtvPersistence.augmentDatapoint({ getAttribute: id => id === 'data-clcr-ktv-snapshot' ? JSON.stringify(result) : null }, dp);
    expect(dp).toMatchObject({ valueNum: result.rawValue, rawValue: result.rawValue, outOfRange: true, tone: 'danger', assessment: 'below' });
  });
  it('retains numerical URR without an invented target when age and schedule are unknown', () => {
    const h = harness(), { dp, note } = save(h, values('urr', { age: '', ageMonths: '', ktvSessionsPerWeek: '', ktvPidiDays: '', ktvDurationMinutes: '', ktvUF: '', ktvW: '' }));
    expect(dp).toMatchObject({ valueNum: 70, outOfRange: null, assessment: 'unassessed', tone: 'neutral', norm: '' });
    expect(note.labResult).not.toHaveProperty('norm');
    expect(h.w.ClcrSavedCalculation.readSaved(note)).toMatchObject({ valid: true, outOfRange: null, norm: '' });
  });
  it('edits using the original session date, age and selected metric without old Kru gating', () => {
    const h = harness(), { w } = h, input = values('spktv', { ktvKru: '-1', ktvKruMeasuredAt: '2020-01-01' });
    const { dp, note } = save(h, input, '2026-07-28');
    const saved = w.ClcrSavedCalculation.readSaved(note);
    const edited = w.ClcrSavedCalculation.recalculate(saved, { values: { UreaPost: '40' } });
    expect(edited.id).toBe('KTV_spktv');
    expect(edited.ktvSnapshot.input).toMatchObject({ evaluationDate: '2026-07-28', ageYears: dp.ktvSnapshot.input.ageYears, variant: 'spktv' });
    const live = w.VildaClcrKtv.evaluate(w.VildaClcrKtv.inputFromValues({ ...w.ClcrKtvPersistence.prepareValues({}, {}, dp.ktvSnapshot), UreaPost: '40' }, { clinicalDateISO: '2026-07-28' }), w.VildaClcrKtvReferenceData.DEFAULT_POLICY);
    expect(edited.ktvSnapshot).toEqual(live);
    expect(w.ClcrSavedCalculation.describe(saved).fields.some(field => /Kru/.test(field.id))).toBe(false);
  });
  it('does not change a typed record on an edit with no numerical or context change', () => {
    const h = harness(), { dp, note } = save(h, values('ektv'));
    const edited = h.w.ClcrSavedCalculation.recalculate(h.w.ClcrSavedCalculation.readSaved(note), {});
    expect(edited.ktvSnapshot).toEqual(dp.ktvSnapshot);
  });
  it.each([{ valueNum: 99 }, { norm: '≥0,5' }, { test: 'eKt/V (mocznik, równoważony)' }, { testKey: 'other' }, { unit: 'mg/dL' }])('fails closed when bound laboratory data changes: %o', patch => {
    const h = harness(), { note } = save(h, values());
    note.labResult = { ...note.labResult, ...patch };
    expect(h.w.ClcrKtvPersistence.savedAssessment(note)).toBeNull();
    expect(h.w.ClcrSavedCalculation.readSaved(note).valid).toBe(false);
    const point = h.w.ClcrSavedResults.projectPatientNotes([note], { patientId: PATIENT }).measurements[0];
    expect(point).toMatchObject({ outOfRange: null, tone: 'neutral', norm: '' });
  });
  it('rejects a copied sibling metric, corrupted category or changed capture input', () => {
    const h = harness(), { w } = h, { dp, note } = save(h, values());
    expect(w.ClcrKtvPersistence.matchesDatapoint({ ...dp, id: 'KTV_ektv' }, dp.ktvSnapshot)).toBe(false);
    expect(w.ClcrKtvPersistence.readSnapshot(JSON.stringify({ ...dp.ktvSnapshot, tone: 'danger', outOfRange: true }))).toBeNull();
    const saved = w.ClcrSavedCalculation.readSaved(note);
    saved.snapshot.values.UreaPre = '200';
    note.body = w.ClcrSavedCalculation.stripSnapshot(note.body) + '\n\n' + w.ClcrSavedCalculation.serializeSnapshot(saved.snapshot, note);
    expect(w.ClcrSavedCalculation.readSaved(note).valid).toBe(false);
  });
  it('rejects a stale rendered result for another measurement date', () => {
    const h = harness(), { dp } = save(h, values());
    expect(() => h.w.ClcrSavedResults.buildPatientNotePayload(dp, { patientId: PATIENT, clinicalDateISO: '2026-07-28' })).toThrow(/dnia badania/);
  });
});

describe('legacy dialysis-dose records', () => {
  it('retains old numerical evidence and literal reference, then upgrades only on deliberate edit', () => {
    const h = harness(), { w } = h;
    const input = values(); delete input.ktvVariant;
    const dp = { ...w.ClcrSavedResults.getParam('KTV_spktv'), valueNum: 1.4, rawValue: 1.39999, displayValue: '<1.40', norm: '≥1,4', outOfRange: false };
    const note = { id: 'fictional-legacy-ktv', patientId: PATIENT, category: 'wynik-klirens', clinicalDateISO: '2020-01-01', labResult: { test: dp.label, value: '1,4', valueNum: 1.4, unit: '—', norm: '≥1,4' } };
    const snapshot = w.ClcrSavedCalculation.createSnapshot(dp, { capture: { formulaId: 'KTV', values: input, fields: Object.keys(input).map(id => ({ id, label: id, type: 'text' })), clinicalDateISO: note.clinicalDateISO, ageYears: 50 } });
    note.body = w.ClcrSavedCalculation.serializeSnapshot(snapshot, note);
    const saved = w.ClcrSavedCalculation.readSaved(note);
    expect(saved).toMatchObject({ valid: true, valueNum: 1.39999, norm: '≥1,4', assessment: 'unassessed', outOfRange: null });
    const described = w.ClcrSavedCalculation.describe(saved);
    expect(described.values.ktvVariant).toBe('spktv');
    const edited = w.ClcrSavedCalculation.recalculate(saved, { values: { UreaPost: '40' } });
    expect(edited.ktvSnapshot).toMatchObject({ schema: 'clcr-ktv', input: { variant: 'spktv', evaluationDate: '2020-01-01' } });
  });
});

describe('Kt/V records: adverse facts, signed URR and exact rational boundary', () => {
  it.each([
    ['11', '3.3000000000000003', 70, 'below-target', '<70,0'],
    ['100000000000000000', '30000000000000004', 70, 'below-target', '<70,0'],
    ['17', '5.950000000000001', 65, 'below-minimum', '<65,0'],
  ])('preserves exact below-threshold evidence when the nearest float is the threshold', (pre, post, raw, status, display) => {
    const h = harness(), { dp, note } = save(h, values('urr', { UreaPre: pre, UreaPost: post }));
    expect(dp.ktvSnapshot).toMatchObject({ rawValue: raw, status, display: { text: display }, outOfRange: true });
    expect(h.w.ClcrKtvPersistence.savedAssessment(note).exactValue).toEqual(dp.ktvSnapshot.exactValue);
    expect(h.w.ClcrSavedCalculation.readSaved(note)).toMatchObject({ valid: true, displayValue: display, outOfRange: true });
    const changed = { ...dp.ktvSnapshot, status: 'within', tone: 'normal', outOfRange: false };
    expect(h.w.ClcrKtvPersistence.readSnapshot(JSON.stringify(changed))).toBeNull();
  });
  it('retains a negative URR through the real narrow Vault sanitizer and both history readers', () => {
    const h = harness(), { dp, note } = save(h, values('urr', { UreaPre: '100', UreaPost: '110' }));
    expect(dp).toMatchObject({ rawValue: -10, valueNum: -10, outOfRange: null, assessment: 'unassessed', tone: 'neutral' });
    expect(note.labResult).toMatchObject({ valueNum: -10, unit: '%', testKey: 'urrwskaznikredukcjimocznika' });
    expect(h.w.ClcrSavedCalculation.readSaved(note)).toMatchObject({ valid: true, valueNum: -10, outOfRange: null });
    const projection = h.w.ClcrSavedResults.projectPatientNotes([note], { patientId: PATIENT });
    expect(projection.measurements[0]).toMatchObject({ rawValue: -10, valueNum: -10, outOfRange: null, tone: 'neutral' });
    expect(h.w.ClcrSavedResults.buildSeriesFromNotes([note], { patientId: PATIENT })[0].points[0].valueNum).toBe(-10);
  });
  it.each([
    { test: 'Inne badanie' }, { unit: 'mmol/L' }, { testKey: 'urr-other' }, { testKey: undefined },
  ])('rejects negative noncanonical laboratory data: %o', patch => {
    const h = harness();
    const result = h.sanitizer.sanitizeLabResult({ test: 'URR — wskaźnik redukcji mocznika', value: '-10', valueNum: -10, unit: '%', testKey: 'urrwskaznikredukcjimocznika', ...patch });
    expect(result).not.toHaveProperty('valueNum');
    expect(h.sanitizer.sanitizeLabResult({ test: 'Luka anionowa surowicy (bez K)', value: '-2', valueNum: -2, unit: 'mmol/L' }).valueNum).toBe(-2);
  });
  it('keeps source facts exactly through editor preparation and an unchanged edit', () => {
    const h = harness(), facts = { ktvPostMethod: 'equilibrated_30_60min', ktvTreatmentsDelivered: false, ktvKru: '-1' };
    const { dp, note } = save(h, values('urr', { ktvKnownFacts: JSON.stringify(facts) }));
    expect(dp.ktvSnapshot.input.knownFacts).toEqual(facts);
    expect(dp.outOfRange).toBeNull();
    const prepared = h.w.ClcrKtvPersistence.prepareValues({}, {}, dp.ktvSnapshot);
    expect(JSON.parse(prepared.ktvKnownFacts)).toEqual(facts);
    const edited = h.w.ClcrSavedCalculation.recalculate(h.w.ClcrSavedCalculation.readSaved(note), {});
    expect(edited.ktvSnapshot).toEqual(dp.ktvSnapshot);
    expect(h.w.ClcrSavedCalculation.describe(note).fields.map(field => field.id)).not.toContain('ktvKnownFacts');
  });
  it('projects source/profile/date/age from the frozen note even without a generic editable envelope', () => {
    const h = harness(), { dp, note } = save(h, values('spktv'));
    note.body = h.w.ClcrSavedCalculation.stripSnapshot(note.body);
    h.w.VildaClcrKtv = { evaluate() { throw new Error('Read is pure'); } };
    const point = h.w.ClcrSavedResults.projectPatientNotes([note], { patientId: PATIENT }).measurements[0];
    expect(point).toMatchObject({ valueNum: dp.rawValue, context: { evaluationDate: DATE, ageYears: 50 }, reference: { profileId: dp.ktvSnapshot.reference.profileId } });
    expect(point.source.id).toBe(dp.ktvSnapshot.reference.sourceIds[0]);
  });
  it('keeps sp/e/URR histories separate with their existing identity and canonical Vault fallback keys', () => {
    const h = harness(), notes = ['spktv', 'ektv', 'urr'].map(variant => save(h, values(variant)).note);
    const series = h.w.ClcrSavedResults.buildSeriesFromNotes(notes, { patientId: PATIENT });
    expect(series.map(item => item.id).sort()).toEqual(['KTV_ektv', 'KTV_spktv', 'KTV_urr']);
    expect(notes.map(note => note.labResult.testKey)).toEqual(['spktv', 'ektv', 'urrwskaznikredukcjimocznika']);
  });
});


describe('Kt/V concise Notes formatter', () => {
  it.each([['spktv', 'Cel przy zapisie'], ['ektv', 'Minimum przy zapisie'], ['urr', 'Cel przy zapisie']])('shows a frozen %s goal and hides technical trees', (variant, referenceLabel) => {
    const h = harness(), { dp, note } = save(h, values(variant));
    expect(note.body).toContain('Utrwalone dane oceny dawki dializy:');
    expect(note.body).toContain('VILDA_CLCR_CALCULATION');
    h.w.VildaClcrKtv = { evaluate() { throw new Error('Notes must not recalculate'); } };
    const model = h.w.ClcrNotesView.model(note, { patientId: PATIENT });
    expect(model).toMatchObject({ label: dp.label, dateLabel: '06.11.2026', referenceLabel, status: dp.ktvSnapshot.statusText, norm: dp.norm, comment: '' });
    const summary = h.w.ClcrNotesView.summary(note, { patientId: PATIENT });
    expect(summary.length).toBeLessThan(900);
    expect(summary).not.toMatch(/Utrwalone dane|VILDA_CLCR|clcr-ktv|engineVersion|\[tekst\]|\[dane\]|knownFacts/);
    expect(summary).not.toContain('Norma');
    expect(summary).toContain(referenceLabel);
  });
});


describe('Kt/V actual Notes and Badania DOM', () => {
  it.each(['spktv', 'ektv', 'urr'])('renders %s without exposing the stored clinical tree or calling targets a norm', variant => {
    const h = harness(), { dp, note } = save(h, values(variant, { UreaPost: variant === 'spktv' ? '54' : '36' }));
    const document = atrapaDokumentu(), notesHost = document.body.appendChild(document.createElement('article'));
    h.w.document = document;
    h.w.ClcrNotesView.render(notesHost, { note, patientId: PATIENT });
    expect(notesHost.textContent).toContain(dp.ktvSnapshot.statusText);
    expect(notesHost.textContent).toContain(variant === 'ektv' ? 'Minimum przy zapisie' : 'Cel przy zapisie');
    expect(notesHost.textContent).not.toMatch(/Utrwalone dane|VILDA_CLCR|clcr-ktv|engineVersion|knownFacts|Norma/);
    const chartHost = document.body.appendChild(document.createElement('div'));
    h.w.ClcrSavedResultsView.render(chartHost, { projection: h.w.ClcrSavedResults.projectPatientNotes([note], { patientId: PATIENT }), view: 'charts' });
    expect(chartHost.textContent).toContain('Zapisany cel / minimum');
    expect(chartHost.textContent).toContain(variant === 'ektv' ? 'Minimum przy zapisie' : 'Cel przy zapisie');
    expect(chartHost.textContent).not.toMatch(/[Nn]orma|poza normą/);
    expect(chartHost.querySelector('.vilda-clcr-point').getAttribute('data-value')).toBe(String(dp.rawValue));
  });
});

describe('Kt/V clinical date and measurement-age integrity', () => {
  it('keeps the complete age from the day of measurement and changes the comparison only on explicit age correction', () => {
    const h = harness(), { note } = save(h, values('spktv', { age: '17', ageMonths: '11' }), '2020-01-01');
    const saved = h.w.ClcrSavedCalculation.readSaved(note);
    expect(saved.snapshot.capturedContext.ageYears).toBe(17 + 11 / 12);
    expect(saved.reference).toMatchObject({ target: null, text: '≥1,2' });
    expect(h.w.ClcrNotesView.model(note).referenceLabel).toBe('Minimum przy zapisie');
    const edited = h.w.ClcrSavedCalculation.recalculate(saved, { ageYears: 18 });
    expect(edited.ktvSnapshot).toMatchObject({ input: { ageYears: '18', ageMonths: '0', evaluationDate: '2020-01-01' }, reference: { target: 1.4 } });
  });
  it('fails closed for a mismatched age or display in a frozen snapshot', () => {
    const h = harness(), { dp } = save(h, values());
    expect(h.w.ClcrKtvPersistence.readSnapshot(JSON.stringify({ ...dp.ktvSnapshot, age: { known: true, invalid: false, years: 10 } }))).toBeNull();
    expect(h.w.ClcrKtvPersistence.readSnapshot(JSON.stringify({ ...dp.ktvSnapshot, display: { text: '9,99', boundary: '' } }))).toBeNull();
    expect(h.w.ClcrKtvPersistence.readSnapshot(JSON.stringify({ ...dp.ktvSnapshot, variant: 'urr' }))).toBeNull();
  });
  it('does not save an undated rendered calculation under a later invented date', () => {
    const h = harness(), { w } = h;
    const model = w.VildaClcrKtv.evaluate(w.VildaClcrKtv.inputFromValues(values()), w.VildaClcrKtvReferenceData.DEFAULT_POLICY);
    const dp = w.ClcrKtvPersistence.fromResult(model);
    expect(() => w.ClcrSavedResults.buildPatientNotePayload(dp, { patientId: PATIENT, clinicalDateISO: DATE })).toThrow(/dnia badania/);
  });
});


describe('Kt/V future or stale frozen data', () => {
  it('does not treat an unsupported assessment version as a legacy healthy record', () => {
    const h = harness(), { note } = save(h, values());
    note.body = h.w.ClcrSavedCalculation.stripSnapshot(note.body).replace('(wersja 1):', '(wersja 2):');
    expect(h.w.ClcrKtvPersistence.hasSavedAssessment(note)).toBe(true);
    expect(h.w.ClcrKtvPersistence.readAssessment(note)).toBeNull();
    const point = h.w.ClcrSavedResults.projectPatientNotes([note], { patientId: PATIENT }).measurements[0];
    expect(point).toMatchObject({ outOfRange: null, tone: 'neutral', norm: '', assessment: 'unassessed' });
  });
  it('keeps the same target band across adult ages when the frozen reference itself is unchanged', () => {
    const h = harness(), a = save(h, values('spktv', { age: '50' })).note, b = save(h, values('spktv', { age: '51' }), '2027-11-06').note;
    a.id = 'fictional-adult-first'; b.id = 'fictional-adult-next';
    const projection = h.w.ClcrSavedResults.projectPatientNotes([a, b], { patientId: PATIENT });
    expect(projection.measurements[0].reference).toEqual(projection.measurements[1].reference);
    expect(projection.measurements.map(point => point.context.ageYears)).toEqual([50, 51]);
  });
});
