import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';

const PATIENT = 'fictional-klirens-notes-view-only';
function environment() {
  const doc = atrapaDokumentu();
  doc.querySelector = selector => doc.documentElement.querySelector(selector);
  const w = { document: doc };
  for (const file of ['clcr_clinical_safety.js', 'clcr_ca_dzm_reference_data.js', 'clcr_ca_dzm.js', 'clcr_ca_dzm_persistence.js',
    'clcr_acr_reference_data.js', 'clcr_acr.js', 'clcr_saved_calculation.js', 'clcr_saved_results.js', 'clcr_notes_view.js']) loadBrowserScript(file, w);
  return { w, doc, api: w.ClcrNotesView };
}
function capture(values, formulaId) {
  return { formulaId, values, ageYears: Number(values.age) + Number(values.ageMonths || 0) / 12, fields: Object.keys(values).map(id => ({ id, label: id, type: 'text', required: ['CA_concentration', 'CA_volume', 'U_Alb', 'Ucr_spot'].includes(id) })) };
}
function persist(env, dp, values, comment = '') {
  const note = { id: 'fictional-note-view-' + dp.id, rev: 1, ...env.w.ClcrSavedResults.buildPatientNotePayload(dp,
    { patientId: PATIENT, clinicalDateISO: '2026-10-28', comment }) };
  const saved = env.w.ClcrSavedCalculation.createSnapshot(dp, { capture: capture(values, dp.sourceFormulaId), clinicalDateISO: note.clinicalDateISO });
  note.body += '\n\n' + env.w.ClcrSavedCalculation.serializeSnapshot(saved, note);
  expect(env.w.ClcrSavedCalculation.readSaved(note).valid).toBe(true);
  return note;
}
function calcium(env, comment = '', overrides = {}) {
  const values = { CA_inputMode: 'concentration', CA_concentration: '1.5', CA_concentrationUnit: 'mmol/L', CA_volume: '1430', CA_volumeUnit: 'mL', CA_collectionHours: '24', CA_clinicalMode: 'general', weight: '31', age: '10', ageMonths: '0', sex: 'M', ...overrides };
  const input = env.w.VildaClcrCaDzm.inputFromValues(values);
  const snapshot = env.w.VildaClcrCaDzm.evaluate(input, env.w.ClcrCaDzmReferenceData.DEFAULT_POLICY);
  return persist(env, { id: 'Ca_mgkg', testKey: 'clcr:Ca_mgkg', sourceFormulaId: 'Ca_mgkg', label: 'Wydalanie wapnia (DZM)',
    valueNum: snapshot.rawValue, rawValue: snapshot.rawValue, displayValue: snapshot.display.text, unit: snapshot.unit,
    norm: env.w.ClcrCaDzmPersistence.normText(snapshot), outOfRange: snapshot.outOfRange, tone: snapshot.tone === 'normal' ? 'success' : snapshot.tone,
    assessment: ({ low: 'below', high: 'above', boundary: 'above', 'criterion-met': 'above', within: 'within' })[snapshot.status] || 'unassessed',
    caDzmSnapshot: snapshot, interpretation: snapshot.interpretation }, values, comment);
}
function acr(env) {
  const values = { age: '10', ageMonths: '0', U_Alb: '45', U_Alb_unit: 'mg/L', Ucr_spot: '100', Ucr_spot_unit: 'mg/dl', ACR_entry_mode: 'concentration' };
  const result = env.w.VildaClcrAcr.evaluate({ ageYears: 10, albuminValue: '45', albuminUnit: 'mg/L', creatinineValue: '100', creatinineUnit: 'mg/dl' }, env.w.VildaClcrAcrReferenceData.getProfile('KDIGO_ACR_2024'));
  return persist(env, { id: 'ACR', testKey: 'clcr:ACR', label: 'Albumina/kreatynina — ACR', sourceFormulaId: 'ACR', valueNum: result.rawValue,
    displayValue: result.display.value, unit: result.unit, norm: '<30 mg/g', category: result.category, tone: result.tone, assessment: result.status, outOfRange: true, acrSnapshot: result.snapshot }, values);
}
function host(env) { const node = env.doc.createElement('article'); node.className = 'vilda-patient-note-card'; env.doc.body.appendChild(node); return node; }

describe('Klirens notes use the shared frozen reader', () => {
  it('shows the recorded rounded result and same-unit reference without dumping typed trees', () => {
    const env = environment(), note = calcium(env, 'Omówiono zbiórkę.\nKontrola według planu.'), original = JSON.stringify(note), node = host(env);
    expect(note.body).toContain('exactMain');
    env.w.VildaClcrCaDzm = { evaluate() { throw new Error('Reading notes must not recalculate'); } };
    env.w.ClcrCaDzmReferenceData = { get DEFAULT_POLICY() { throw new Error('Reading notes must not use current policy'); } };
    const rendered = env.api.render(node, { note, patientId: PATIENT });
    expect(rendered.record).toMatchObject({ display: '2,77', unit: 'mg/kg/24 h', norm: '<4 mg/kg/24 h', outOfRange: false, status: 'W zakresie', comment: 'Omówiono zbiórkę.\nKontrola według planu.' });
    expect(node.querySelector('.clcr-note-reference').textContent).toBe('<4');
    expect(node.querySelectorAll('.clcr-note-unit').map(n => n.textContent)).toEqual(['mg/kg/24 h', 'mg/kg/24 h']);
    for (const key of ['exactMain', 'numerator', 'VILDA_CLCR', 'engineVersion', '[tekst]']) expect(node.textContent).not.toContain(key);
    expect(env.api.title(note)).toBe('Wydalanie wapnia (DZM): 2,77 mg/kg/24 h');
    expect(JSON.stringify(note)).toBe(original);
  });

  it('shows the same recorded ACR category and warning as Badania', () => {
    const env = environment(), note = acr(env), point = env.w.ClcrSavedResults.projectPatientNotes([note], { patientId: PATIENT }).measurements[0];
    const model = env.api.model(note, { patientId: PATIENT });
    expect(model).toMatchObject({ display: point.displayValue.replace('.', ','), category: 'A2', outOfRange: true, tone: 'warning', norm: '<30 mg/g' });
    expect(model.interpretation).toBe(point.interpretation);
    expect(model.dateLabel).toBe('28.10.2026');
  });

  it('retains the recorded rounding boundary and curated caution without evaluating new thresholds', () => {
    const env = environment(), note = calcium(env), original = env.w.ClcrSavedResults.projectPatientNotes;
    env.w.ClcrSavedResults = { projectPatientNotes: (...args) => {
      const result = original(...args);
      result.measurements[0].boundary = '<4';
      result.measurements[0].comment = 'Zapisane zastrzeżenie dotyczące zbiórki.';
      return result;
    } };
    const node = host(env); env.api.render(node, { note });
    expect(node.querySelector('.clcr-note-boundary').textContent).toBe('Granica przed zaokrągleniem: <4.');
    expect(node.querySelector('.clcr-note-caution').textContent).toBe('Zapisane zastrzeżenie dotyczące zbiórki.');
  });

  it('labels a recorded clinical criterion as a threshold rather than a healthy population norm', () => {
    const env = environment(), note = calcium(env, '', { age: '35', weight: '80', CA_clinicalMode: 'phpt', CA_concentration: '8' });
    const point = env.w.ClcrSavedResults.projectPatientNotes([note], { patientId: PATIENT }).measurements[0];
    expect(point.reference.kind).toBe('recorded-criterion');
    const record = env.api.model(note);
    expect(record.referenceLabel).toBe('Próg przy zapisie');
    expect(record.status).toBe('Ocena kryterium');
    expect(record.interpretation).toBe(point.interpretation);
  });

  it.each(['raw-value', 'date', 'corrupt-envelope'])('does not revive a stale norm after %s changed', kind => {
    const env = environment(), note = calcium(env);
    if (kind === 'raw-value') note.labResult.valueNum = 12;
    if (kind === 'date') note.clinicalDateISO = '2020-01-01';
    if (kind === 'corrupt-envelope') note.body = '[VILDA_CLCR_CALCULATION_V1]\n{broken\n[/VILDA_CLCR_CALCULATION_V1]';
    const record = env.api.model(note, { patientId: PATIENT });
    expect(record).toMatchObject({ norm: '', tone: 'neutral', outOfRange: null, category: '', status: 'Bez zapisanej oceny' });
    expect(record.interpretation).toContain('niedostępna');
    expect(record.comment).toBe('');
  });

  it('retains manually authored legacy text and escapes it through DOM text nodes', () => {
    const env = environment(), note = { id: 'fictional-legacy', patientId: PATIENT, category: 'wynik-klirens', title: 'Badanie',
      body: '<img src=x onerror=alert(1)>\nKomentarz spoza generatora.', labResult: { test: 'Albumina/kreatynina — ACR', value: '13.6', valueNum: 13.6, unit: 'mg/g' } };
    const node = host(env); env.api.render(node, { note, patientId: PATIENT });
    expect(node.querySelector('.clcr-note-comment').textContent).toContain(note.body);
    expect(node.querySelectorAll('img')).toHaveLength(0);
    expect(env.api.model(note).display).toBe('13,6');
  });

  it('keeps explicit doctor comments but hides generated metadata and future envelopes', () => {
    const env = environment();
    expect(env.api.humanBody({ body: 'Kalkulator klirensu · clcr:ACR\n\nKomentarz lekarza:\nKontrola < 30 dni.\n\n[VILDA_CLCR_CALCULATION_V2]\nsecret\n[/VILDA_CLCR_CALCULATION_V2]' })).toBe('Kontrola < 30 dni.');
    expect(env.api.humanBody({ body: 'Kalkulator klirensu · clcr:ACR\nUtrwalone dane oceny:\nexactMain [dane]:' })).toBe('');
  });

  it('limits this renderer to canonical Klirens notes and the expected patient', () => {
    const env = environment(), note = calcium(env);
    expect(env.api.model({ ...note, category: 'observation' })).toBeNull();
    expect(env.api.model(note, { patientId: 'fictional-other' })).toBeNull();
  });

  it('opens Badania by the provided navigation callback without a duplicate saved measurement', () => {
    const env = environment(), note = calcium(env), node = host(env), openBadania = vi.fn();
    env.api.render(node, { note, openBadania }); node.querySelector('.clcr-note-link').click();
    expect(openBadania).toHaveBeenCalledTimes(1);
    expect(node.querySelectorAll('.clcr-note-button')).toHaveLength(1);
    expect(node.textContent).not.toContain('Edytuj');
  });
});

describe('Klirens note details are lazy and scope-safe', () => {
  function vault() { let unlocked = true; const listeners = []; return { api: Object.freeze({ isUnlocked: () => unlocked, onLock: fn => listeners.push(fn), getPatientNote: vi.fn(async id => ({ id })), updateExistingPatientNote: vi.fn(), removeExistingPatientNote: vi.fn() }), lock() { unlocked = false; listeners.forEach(fn => fn()); } }; }

  it('loads the editor only for an explicit details action and preserves the note ID', async () => {
    const env = environment(), note = calcium(env), node = host(env), v = vault(), destroy = vi.fn(), open = vi.fn(async () => ({ destroy })), ensureEditor = vi.fn(async () => ({ open }));
    env.w.ClcrRecordResources = { ensureEditor };
    env.api.render(node, { note, patientId: PATIENT, vault: v.api });
    expect(ensureEditor).not.toHaveBeenCalled();
    node.querySelector('.clcr-note-button').click();
    await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    expect(open.mock.calls[0][0]).toMatchObject({ noteId: note.id, patientId: PATIENT });
    const guarded = open.mock.calls[0][0].vault;
    expect(guarded).not.toBe(v.api);
    await guarded.getPatientNote(note.id);
    expect(v.api.getPatientNote).toHaveBeenCalledWith(note.id);
    v.lock();
    expect(destroy).toHaveBeenCalledTimes(1);
    await expect(guarded.getPatientNote(note.id)).rejects.toThrow('zablokowana');
  });

  it('does not open when an asynchronous resource load finishes after lock or parent removal', async () => {
    for (const kind of ['lock', 'removed']) {
      const env = environment(), note = calcium(env), node = host(env), v = vault(), open = vi.fn();
      let resolve; const resources = { ensureEditor: () => new Promise(done => { resolve = done; }) };
      const pending = env.api.openDetails({ note, patientId: PATIENT, vault: v.api, resources, anchor: node });
      if (kind === 'lock') v.lock(); else node.remove();
      resolve({ open }); await pending;
      expect(open).not.toHaveBeenCalled();
    }
  });

  it('never passes a read resolving after lock through to the dialog', async () => {
    const env = environment(), note = calcium(env), node = host(env); let unlocked = true, resolve, guarded;
    const v = { isUnlocked: () => unlocked, getPatientNote: () => new Promise(done => { resolve = done; }) };
    await env.api.openDetails({ note, vault: v, anchor: node, details: { open: async options => { guarded = options.vault; return {}; } } });
    const read = guarded.getPatientNote(note.id); unlocked = false; resolve(note);
    await expect(read).rejects.toThrow('zablokowana');
  });

  it('refreshes the record in place after edit and defers the parent list rebuild until details close', async () => {
    const env = environment(), note = calcium(env), node = host(env), v = vault();
    const onChanged = vi.fn(), onRecordChanged = vi.fn(), destroy = vi.fn(); let changed;
    const handle = await env.api.openDetails({ note, vault: v.api, anchor: node, onChanged, onRecordChanged,
      details: { open: async options => { changed = options.onChanged; return { destroy }; } } });
    const change = { action: 'updated', noteId: note.id };
    changed(change);
    expect(onRecordChanged).toHaveBeenCalledWith(change);
    expect(onChanged).not.toHaveBeenCalled();
    handle.destroy();
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledExactlyOnceWith(change);
    handle.destroy();
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('keeps resource errors readable and leaves no generic raw-body editor action', async () => {
    const env = environment(), note = calcium(env), node = host(env);
    env.w.ClcrRecordResources = { ensureEditor: async () => { throw new Error('internal stack and payload'); } };
    env.api.render(node, { note }); node.querySelector('.clcr-note-button').click();
    await vi.waitFor(() => expect(node.querySelector('.clcr-note-notice').hidden).toBe(false));
    expect(node.textContent).toContain('Nie udało się otworzyć');
    expect(node.textContent).not.toContain('internal');
    const artifact = fs.readFileSync('vilda_auth_ui.js', 'utf8');
    expect(artifact).toContain('if(S&&S.category==="wynik-klirens")return ClcrNotesCard(S,a,r,n);');
    expect(artifact).toContain('function ga(t){if(t&&t.note&&t.note.category==="wynik-klirens")');
  });
});
