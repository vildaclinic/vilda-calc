import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const PATIENT = 'fictional-klirens-search-summary-patient';
const DATE = '2026-10-28';

function environment() {
  // Deliberately no document: generating an index/preview is a pure read.
  const win = {};
  for (const file of ['clcr_clinical_safety.js', 'clcr_ca_dzm_reference_data.js', 'clcr_ca_dzm.js', 'clcr_ca_dzm_persistence.js',
    'clcr_acr_reference_data.js', 'clcr_acr.js', 'clcr_saved_calculation.js', 'clcr_saved_results.js', 'clcr_notes_view.js']) loadBrowserScript(file, win);
  return { win, api: win.ClcrNotesView };
}

function persist(env, point, values, comment = '') {
  const note = { id: 'fictional-search-summary-' + point.id, rev: 1,
    ...env.win.ClcrSavedResults.buildPatientNotePayload(point, { patientId: PATIENT, clinicalDateISO: DATE, comment }) };
  const capture = { formulaId: point.sourceFormulaId, values, ageYears: Number(values.age),
    fields: Object.keys(values).map(id => ({ id, label: id, type: 'text', required: false })) };
  const saved = env.win.ClcrSavedCalculation.createSnapshot(point, { capture, clinicalDateISO: DATE });
  note.body += '\n\n' + env.win.ClcrSavedCalculation.serializeSnapshot(saved, note);
  expect(env.win.ClcrSavedCalculation.readSaved(note).valid).toBe(true);
  return note;
}

function calcium(env, { comment = '', values: overrides = {}, caution = '' } = {}) {
  const values = { CA_inputMode: 'concentration', CA_concentration: '1.5', CA_concentrationUnit: 'mmol/L', CA_volume: '1430',
    CA_volumeUnit: 'mL', CA_collectionHours: '24', CA_clinicalMode: 'general', weight: '31', age: '10', ageMonths: '0', sex: 'M', ...overrides };
  const calculated = env.win.VildaClcrCaDzm.evaluate(env.win.VildaClcrCaDzm.inputFromValues(values), env.win.ClcrCaDzmReferenceData.DEFAULT_POLICY);
  // A recorded caution is transported by the same real persistence envelope.
  const snapshot = caution ? { ...calculated, cautions: [caution] } : calculated;
  return persist(env, { id: 'Ca_mgkg', testKey: 'clcr:Ca_mgkg', sourceFormulaId: 'Ca_mgkg', label: 'Wydalanie wapnia (DZM)',
    valueNum: snapshot.rawValue, rawValue: snapshot.rawValue, displayValue: snapshot.display.text, unit: snapshot.unit,
    norm: env.win.ClcrCaDzmPersistence.normText(snapshot), outOfRange: snapshot.outOfRange, tone: snapshot.tone === 'normal' ? 'success' : snapshot.tone,
    assessment: ({ low: 'below', high: 'above', boundary: 'above', 'criterion-met': 'above', within: 'within' })[snapshot.status] || 'unassessed',
    caDzmSnapshot: snapshot, interpretation: snapshot.interpretation }, values, comment);
}

function acr(env, raw = '45', comment = '') {
  const values = { age: '10', ageMonths: '0', ACR_entry_mode: 'direct', ACR_reportedValue: raw, ACR_reportedUnit: 'mg/g' };
  const result = env.win.VildaClcrAcr.evaluate({ mode: 'direct', ageYears: 10, reportedValue: raw, reportedUnit: 'mg/g' }, env.win.VildaClcrAcrReferenceData.getProfile('KDIGO_ACR_2024'));
  return persist(env, { id: 'ACR', testKey: 'clcr:ACR', label: 'Albumina/kreatynina — ACR', sourceFormulaId: 'ACR', valueNum: result.rawValue,
    displayValue: result.display.text, unit: result.unit, norm: '<30 mg/g', category: result.category, tone: result.tone,
    assessment: result.status, outOfRange: result.status === 'above', acrSnapshot: result.snapshot }, values, comment);
}

function expectNoStorageText(summary) {
  for (const marker of ['VILDA_CLCR', 'exactMain', 'numerator', 'referenceRows', 'engineVersion', '[tekst]', '[liczba]', 'Kalkulator klirensu ·']) expect(summary).not.toContain(marker);
}

describe('Klirens Search summary shares the historical Notes presentation', () => {
  it('summarizes the real saved calcium value, same-unit norm and interpretation with its doctor comment', () => {
    const env = environment(), note = calcium(env, { comment: 'Omówiono zbiórkę.\nKontrola według planu.' });
    const before = JSON.stringify(note), summary = env.api.summary(note, { patientId: PATIENT });
    expect(summary).toBe('Wynik: 2,77 mg/kg/24 h\nNorma przy zapisie: <4 mg/kg/24 h\nW zakresie\n' +
      'Wynik poniżej górnej granicy normy dla wieku. Nie wyklucza kamicy; oceń wiarygodność zbiórki i pozostałe badania.\n\nKomentarz lekarza\nOmówiono zbiórkę.\nKontrola według planu.');
    expectNoStorageText(summary);
    expect(summary).not.toContain(String(note.labResult.valueNum));
    expect(JSON.stringify(note)).toBe(before);
    expect(env.api.title(note)).toBe('Wydalanie wapnia (DZM): 2,77 mg/kg/24 h');
  });

  it('retains the recorded ACR category and interpretation without the reference capture', () => {
    const env = environment(), note = acr(env), before = JSON.stringify(note);
    const summary = env.api.summary(note);
    expect(summary).toContain('Wynik: 45,0 mg/g\nNorma przy zapisie: <30 mg/g\nA2\n');
    expect(summary).toContain(env.api.model(note).interpretation);
    expectNoStorageText(summary);
    expect(summary).not.toContain('Profil odniesienia');
    expect(JSON.stringify(note)).toBe(before);
  });

  it.each([['calcium', calcium], ['ACR', acr]])('reads %s without invoking a calculator or consulting current reference policies', (_, fixture) => {
    const env = environment(), note = fixture(env), before = env.api.summary(note);
    const caEvaluate = vi.fn(() => { throw new Error('A read must not calculate calcium'); });
    const acrEvaluate = vi.fn(() => { throw new Error('A read must not calculate ACR'); });
    env.win.VildaClcrCaDzm = { evaluate: caEvaluate };
    env.win.VildaClcrAcr = { evaluate: acrEvaluate };
    env.win.ClcrCaDzmReferenceData = { get DEFAULT_POLICY() { throw new Error('A read must not use current calcium policy'); } };
    env.win.VildaClcrAcrReferenceData = { getProfile() { throw new Error('A read must not select current ACR references'); } };
    expect(env.api.summary(note)).toBe(before);
    expect(caEvaluate).not.toHaveBeenCalled();
    expect(acrEvaluate).not.toHaveBeenCalled();
  });

  for (const [name, fixture] of [['calcium', calcium], ['ACR', acr]]) {
    it.each(['raw-value', 'date', 'corrupt-envelope'])('suppresses the stale ' + name + ' assessment after %s changed', change => {
      const env = environment(), note = fixture(env), formerInterpretation = env.api.model(note).interpretation;
      if (change === 'raw-value') note.labResult.valueNum = 12;
      if (change === 'date') note.clinicalDateISO = '2020-01-01';
      if (change === 'corrupt-envelope') note.body = '[VILDA_CLCR_CALCULATION_V1]\n{broken\n[/VILDA_CLCR_CALCULATION_V1]';
      const before = JSON.stringify(note), summary = env.api.summary(note);
      expect(summary).toContain('Bez zapisanej oceny\nZapisana ocena jest niedostępna. Otwórz szczegóły pomiaru.');
      expect(summary).not.toContain('Norma przy zapisie:');
      expect(summary).not.toContain(formerInterpretation);
      expectNoStorageText(summary);
      expect(JSON.stringify(note)).toBe(before);
    });
  }

  it('keeps a clinical criterion labelled as a threshold rather than a population norm', () => {
    const env = environment(), note = calcium(env, { values: { age: '35', weight: '80', CA_clinicalMode: 'phpt', CA_concentration: '8' } });
    const summary = env.api.summary(note);
    expect(summary).toContain('Próg przy zapisie: ' + env.api.model(note).norm);
    expect(summary).toContain('Ocena kryterium');
    expect(summary).not.toContain('Norma przy zapisie:');
  });

  it('keeps the genuine recorded ACR rounding boundary next to the rounded value', () => {
    const env = environment(), note = acr(env, '29.99'), summary = env.api.summary(note);
    expect(summary).toContain('Wynik: 30,0 mg/g');
    expect(summary).toContain('A1');
    expect(summary).toContain('Granica przed zaokrągleniem: <30.');
    expectNoStorageText(summary);
  });

  it('retains recorded caution text separately from the doctor comment', () => {
    const env = environment(), caution = 'Fikcyjna zapisana uwaga o wiarygodności zbiórki.';
    const note = calcium(env, { caution, comment: 'Fikcyjna rozmowa z opiekunem.' });
    expect(env.api.summary(note)).toContain(caution + '\n\nKomentarz lekarza\nFikcyjna rozmowa z opiekunem.');
  });

  it.each(['0', '<3', '≤3', '>300', '≥300'])('preserves the recorded ACR zero or operator %s', raw => {
    const env = environment(), note = acr(env, raw), summary = env.api.summary(note);
    expect(summary.split('\n')[0]).toBe(raw === '0' ? 'Wynik: 0,0 mg/g' : 'Wynik: ' + raw + ' mg/g');
    expectNoStorageText(summary);
  });

  it('retains zero calcium without acquiring a normal assessment', () => {
    const env = environment(), note = calcium(env, { values: { CA_concentration: '0' } }), summary = env.api.summary(note);
    expect(summary.split('\n')[0]).toBe('Wynik: 0 mg/kg/24 h');
    expect(summary).not.toContain('W zakresie');
    expect(summary).not.toContain('Norma przy zapisie:');
    expect(summary).toContain(env.api.model(note).interpretation);
  });

  it('keeps authored legacy comments as literal text without exposing a generated or future envelope', () => {
    const env = environment(), note = { id: 'fictional-search-legacy', patientId: PATIENT, category: 'wynik-klirens',
      body: '<img src=x onerror=alert(1)>\nFikcyjny komentarz ręczny.', labResult: { test: 'Albumina/kreatynina — ACR', value: '13.6', valueNum: 13.6, unit: 'mg/g' } };
    expect(env.api.summary(note)).toContain('Komentarz lekarza\n' + note.body);
    note.body = 'Kalkulator klirensu · clcr:ACR\n\nKomentarz lekarza:\nFikcyjna kontrola.\n\n[VILDA_CLCR_CALCULATION_V2]\nfuture-payload\n[/VILDA_CLCR_CALCULATION_V2]';
    const summary = env.api.summary(note);
    expect(summary).toContain('Komentarz lekarza\nFikcyjna kontrola.');
    expect(summary).not.toContain('future-payload');
    expectNoStorageText(summary);
  });

  it('uses the unavailable model state when the frozen reader is absent or fails', () => {
    const env = environment(), note = calcium(env);
    env.win.ClcrSavedResults = { projectPatientNotes() { throw new Error('Unreadable fixture'); } };
    const failed = env.api.summary(note);
    env.win.ClcrSavedResults = undefined;
    expect(env.api.summary(note)).toBe(failed);
    expect(failed).toContain('Zapisana ocena jest niedostępna.');
    expect(failed).not.toContain('Norma przy zapisie:');
    expectNoStorageText(failed);
  });

  it('returns no summary for other note types or another patient', () => {
    const env = environment(), note = calcium(env);
    expect(env.api.summary(null)).toBe('');
    expect(env.api.summary({ ...note, category: 'observation' })).toBe('');
    expect(env.api.summary(note, { patientId: 'fictional-other-patient' })).toBe('');
  });
});
