import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { beforeEach, describe, expect, it } from 'vitest';

// Real production projection models. Only the encrypted read boundary is
// supplied with fictional records; clinical evaluation and range selection
// deliberately throw, so a preview cannot silently reassess saved results.
const source = file => readFileSync(new URL('../../' + file, import.meta.url), 'utf8');
const pid = 'fictional-home-patient';
const nativeSources = [
  'lab_units_data.js', 'lab_unit_converter.js', 'vilda_lab_snapshot.js',
  'vilda_lab_range_snapshot.js', 'vilda_lab_assessment_ui.js',
  'vilda_lab_history.js', 'vilda_lab_result_presentation.js',
  'vilda_care_plan_model.js', 'vilda_care_plans.js',
  'runtime/patient-treatment-v1/model.js',
];
const production = new Map(nativeSources.map(file => [file, source(file)]));
const auth = source('vilda_auth_ui.js');
const parseSource = auth.slice(auth.indexOf('function Dl('), auth.indexOf('function Ol('));
const nativeParseNorm = new Function(parseSource + ';return Dl;')();
let w, baseNotes, plan, patient;

beforeEach(() => {
  w = { document: {}, console, Date, setTimeout, clearTimeout }; w.window = w;
  const context = vm.createContext(w);
  for (const [file, text] of production) vm.runInContext(text, context, { filename: file });
  w.__vildaLabTrend = { parseNorm: nativeParseNorm };
  const converter = w.LabUnitConverter;
  w.LabUnitConverter = { ...converter,
    evaluate() { throw Error('Saved-result preview must not evaluate'); },
    selectRange() { throw Error('Saved-result preview must not select a current reference'); },
  };
  vm.runInContext(source('vilda_home_patient_data.js'), context);
  baseNotes = [
    { id: 'general', patientId: pid, title: 'Fikcyjna notatka ogólna', body: '<script>literal plaintext</script>', category: 'observation', updatedAtISO: '2026-11-03T12:00:00Z' },
    { id: 'clinical', patientId: pid, title: 'Fikcyjna notatka kliniczna', body: 'Kontrola', category: 'observation', clinicalDateISO: '2026-10-01', linkedAgeMonths: 120, updatedAtISO: '2026-10-02T12:00:00Z' },
    { id: 'lab', patientId: pid, title: 'Fikcyjne TSH', category: 'wynik-badania', clinicalDateISO: '2026-11-02', labResult: { testKey: 'tsh', test: 'TSH (tyreotropina)', value: '2,1', valueNum: 2.1, unit: 'mIU/L', norm: '1–3 mIU/L' } },
    { id: 'gh', patientId: pid, ghPointId: 'point', category: 'observation', title: 'Fikcyjna kontrola GH' },
    { id: 'order', patientId: pid, category: 'wynik-badania', title: 'Wynik: TSH (tyreotropina)', dueDateISO: '2026-12-01', updatedAtISO: '2026-11-01T12:00:00Z' },
    { id: 'plan', patientId: pid, category: 'care-plan', title: 'Fikcyjny plan', careContext: { version: 1, role: 'plan', status: 'active', steps: [{ id: 's1' }], log: [] } },
  ];
  plan = { id: 'plan', patientId: pid, title: 'Fikcyjny plan', status: 'active', steps: [{ id: 's1', state: 'pending' }], log: [], goal: 'Fikcyjny cel', updatedAtISO: '2026-11-01T12:00:00Z' };
  patient = { patientId: pid, header: { name: 'Fikcyjny pacjent' }, snapshots: [{ snapshotId: 'snapshot', savedAtISO: '2026-11-03T12:00:00Z', payload: { name: 'Fikcyjny pacjent', user: { age: 10, sex: 'M' }, visit: { visitId: 'exact-original-visit' } } }] };
});
function fixture(overrides = {}) {
  const vault = {
    isUnlocked: () => true, getCurrentUser: () => ({ userId: 'fictional-home-owner' }),
    getPatient: async () => patient, listPatientNotesForPatient: async () => baseNotes,
    listPatientLabSeries: async () => [{ testKey: 'tsh', test: 'TSH (tyreotropina)', points: [{ noteId: 'lab', dateISO: '2026-11-02', valueNum: 2.1, unit: 'mIU/L' }] }],
    listPatientTreatmentPeriods: async () => [], listCarePlans: async () => [plan], ...overrides,
  };
  w.VildaVault = vault; return vault;
}
const read = (vault, isCurrent = () => true) => w.VildaHomePatientData.read({ vault, patientId: pid, isCurrent });

// The history's general context projects current records independently of the
// selected saved visit. Exercise its actual production API with the same real
// treatment model used above, without mounting an editor or a browser DOM.
function generalContext(notes = baseNotes, context = { currentRecords: true, notesStatus: 'ready' }, header = { ...patient.header, patientId: pid }) {
  if (!w.VildaHomeVisitProjection) vm.runInContext(source('vilda_home_visit_projection.js'), vm.createContext(w));
  return w.VildaHomeVisitProjection.getGeneral(header, notes, context);
}
function treatmentNote(kind, id, changes = {}, extra = {}) {
  const fields = kind === 'diagnosis'
    ? { schemaVersion: 1, kind, name: 'Fikcyjne rozpoznanie', code: '', status: 'active', dateISO: '2026-11-03' }
    : { schemaVersion: 1, kind, title: 'Fikcyjne leczenie', method: 'other', status: 'active' };
  return { id, patientId: pid, category: 'treatment', updatedAtISO: '2026-11-03T12:00:00Z',
    treatmentContext: w.VildaPatientTreatmentModel.normalize({ ...fields, ...changes }), ...extra };
}
const section = (result, title) => result.sections.find(item => item.title === title);

describe('visit history: current general documentation remains distinct from the archived visit', () => {
  it('preserves the exact legacy return shape unless the current-record presentation is requested', () => {
    const expected = { patientName: 'Fikcyjny pacjent', notes: [{ title: baseNotes[0].title, body: baseNotes[0].body, dateLabel: '03.11.2026' }] };
    expect(generalContext(baseNotes, {})).toEqual(expected);
    const legacy = w.VildaHomeVisitProjection.getGeneral({ ...patient.header, patientId: pid }, baseNotes);
    expect(legacy).toEqual(expected); expect(Object.keys(legacy)).toEqual(['patientName', 'notes']);
    expect(generalContext(baseNotes, { currentRecords: false })).toEqual(expected);
  });

  it('uses recorded active states while keeping diagnosis and treatment status independent', () => {
    const notes = [
      treatmentNote('diagnosis', 'fictional-active-diagnosis', { name: 'Fikcyjne nadciśnienie', code: 'I10' }),
      treatmentNote('diagnosis', 'fictional-closed-diagnosis', { name: 'Fikcyjne zamknięte rozpoznanie', status: 'closed' }),
      treatmentNote('therapy', 'fictional-active-therapy', { title: 'Fikcyjna aktywna terapia',
        startDateISO: '2099-01-01', endDateISO: '2099-02-01' }),
      treatmentNote('therapy', 'fictional-closed-therapy', { title: 'Fikcyjna zakończona terapia', status: 'closed' }),
    ];
    const result = generalContext(notes);
    expect(result.currentStatus).toBe('ready');
    expect(section(result, 'Aktualne rozpoznania').entries).toEqual([
      { title: 'I10 — Fikcyjne nadciśnienie', meta: 'Data rozpoznania · 03.11.2026' },
    ]);
    const therapies = section(result, 'Aktywne leczenie').entries;
    expect(therapies).toHaveLength(1); expect(therapies[0].title).toBe('Fikcyjna aktywna terapia');
    expect(therapies[0].meta).toContain('Aktywne według dokumentacji');
    // Dates do not silently infer either a different status or a missing end.
    expect(therapies[0].meta).toContain('01.01.2099');
    expect(JSON.stringify(result)).not.toContain('Fikcyjna zakończona terapia');
  });

  it('preserves literal recorded drug/dose and optional diagnosis code without inferring a prescription or ICD code', () => {
    const dose = '0,025 mg / kg / dobę (fikcyjne)', drug = 'Fikcyjny preparat 5 mg';
    const notes = [
      treatmentNote('diagnosis', 'fictional-diagnosis-without-code', { name: 'Fikcyjne rozpoznanie bez kodu' }),
      treatmentNote('therapy', 'fictional-drug', { title: 'Fikcyjne leczenie GH / IGF-1', method: 'pharmacological',
        medication: drug, dose, diagnosisIds: ['fictional-diagnosis-without-code', 'fictional-unavailable-diagnosis'] }),
      treatmentNote('therapy', 'fictional-empty-drug', { title: 'Fikcyjna farmakoterapia bez dawki', method: 'pharmacological' }),
    ];
    const result = generalContext(notes), entries = section(result, 'Aktywne leczenie').entries;
    expect(section(result, 'Aktualne rozpoznania').entries[0].title).toBe('Fikcyjne rozpoznanie bez kodu');
    const recorded = entries.find(item => item.title === 'Fikcyjne leczenie GH / IGF-1');
    expect(recorded.body).toContain('Zapisany preparat: ' + drug);
    expect(recorded.body).toContain('Zapisana dawka: ' + dose);
    expect(recorded.body).toContain('Rozpoznanie: Fikcyjne rozpoznanie bez kodu · Rozpoznanie niedostępne');
    const withoutPrescription = entries.find(item => item.title === 'Fikcyjna farmakoterapia bez dawki');
    expect(withoutPrescription.body).toBe('Farmakoterapia');
  });

  it('keeps an unsupported treatment visible as an uncertainty instead of asserting an empty current treatment history', () => {
    const notes = [{ id: 'fictional-future-treatment', patientId: pid, category: 'treatment', treatmentContext: {
      schemaVersion: 99, kind: 'therapy', status: 'active', title: 'Fikcyjny przyszły format', dose: 'FUTURE-UNVERIFIED-DOSE',
    } }];
    const result = generalContext(notes), serialized = JSON.stringify(result);
    expect(section(result, 'Pozostała dokumentacja leczenia').entries[0].body).toContain('nieobsługiwany format');
    expect(serialized).not.toContain('FUTURE-UNVERIFIED-DOSE');
    expect(section(result, 'Aktywne leczenie').entries).toEqual([]);
    expect(section(result, 'Aktywne leczenie').emptyText).not.toBe('Brak zapisanej informacji o aktywnym leczeniu.');
    expect(section(result, 'Aktualne rozpoznania').emptyText).not.toBe('Brak zapisanych aktywnych rozpoznań.');
  });

  it.each(['error', 'loading'])('keeps a %s read distinct from genuinely empty current documentation', notesStatus => {
    const notes = [treatmentNote('therapy', 'fictional-not-yet-verified', { title: 'Fikcyjny niepotwierdzony odczyt' })];
    const result = generalContext(notes, { currentRecords: true, notesStatus });
    expect(result.currentStatus).toBe(notesStatus);
    expect(section(result, 'Aktualne rozpoznania')).toBeUndefined();
    expect(section(result, 'Aktywne leczenie')).toBeUndefined();
    expect(section(result, 'Aktualne rozpoznania i leczenie').entries[0].body).toContain(notesStatus === 'error' ? 'Nie udało się' : 'Odczytywanie');
    expect(JSON.stringify(result)).not.toContain('Fikcyjny niepotwierdzony odczyt');
    expect(result.sections.every(item => !item.emptyText)).toBe(true);
    const empty = generalContext([]);
    expect(empty.currentStatus).toBe('ready');
    expect(section(empty, 'Aktywne leczenie').entries).toEqual([]);
    expect(section(empty, 'Aktywne leczenie').emptyText).toBe('Brak zapisanej informacji o aktywnym leczeniu.');
  });

  it('reports a missing model as an unavailable projection instead of inventing empty treatment data', () => {
    w.VildaPatientTreatmentModel = null;
    const result = generalContext([]);
    expect(result.currentStatus).toBe('error');
    expect(section(result, 'Aktualne rozpoznania i leczenie').entries[0].body).toContain('Nie udało się');
    expect(section(result, 'Aktywne leczenie')).toBeUndefined();
  });

  it('reads neutral monitoring only from the latest canonical visit, independent of an older selected working form', () => {
    const latest = { patientId: pid, visitId: 'fictional-latest-visit', clinicalDateISO: '2026-11-03', origin: 'explicit',
      savedAtISO: '2026-11-03T12:00:00Z', payload: { ghTherapyPoints: [
        { type: 'end', drug: 'UNVERIFIED-CANONICAL-DRUG', dose: 'UNVERIFIED-CANONICAL-DOSE' },
      ] } };
    w.lastLoadedData = { visit: { visitId: 'fictional-selected-old-visit' }, obesityTherapyPoints: [{ type: 'start', drug: 'WRONG-ARCHIVED-DRUG' }] };
    const result = generalContext([], { currentRecords: true, notesStatus: 'ready', latestVisit: latest });
    const monitor = section(result, 'Monitorowanie w ostatniej zapisanej wizycie');
    expect(monitor.entries).toEqual([{ title: 'GH / IGF-1', meta: 'Wizyta z 03.11.2026' }]);
    expect(monitor.description).toBe('Informacja z zapisanej wizyty.');
    expect(JSON.stringify(monitor)).not.toMatch(/UNVERIFIED|WRONG-ARCHIVED|aktywne|zakończone/);
    expect(section(result, 'Aktywne leczenie').entries).toEqual([]);
    w.lastLoadedData = { obesityTherapyPoints: [{ type: 'end' }], ghTherapyPoints: [] };
    expect(generalContext([], { currentRecords: true, notesStatus: 'ready', latestVisit: latest })).toEqual(result);
  });

  it('does not promote an inferred visit date, unknown point kind or a foreign patient to current monitor facts', () => {
    const row = { patientId: pid, clinicalDateISO: '2024-01-01', origin: 'legacy', savedAtISO: '2026-11-03T12:00:00Z',
      payload: { obesityTherapyPoints: [{ type: 'continue' }], ghTherapyPoints: [{ type: 'unknown-future-kind' }] } };
    const result = generalContext([], { currentRecords: true, notesStatus: 'ready', latestVisit: row });
    const monitor = section(result, 'Monitorowanie w ostatniej zapisanej wizycie');
    expect(monitor.entries).toHaveLength(1); expect(monitor.entries[0].title).toBe('Leczenie otyłości');
    expect(monitor.entries[0].meta).toContain('Data wizyty niepotwierdzona · zapis z ');
    expect(monitor.entries[0].meta).not.toContain('01.01.2024');
    expect(section(generalContext([], { currentRecords: true, notesStatus: 'ready', latestVisit: { ...row, patientId: 'fictional-foreign-patient' } }),
      'Monitorowanie w ostatniej zapisanej wizycie')).toBeUndefined();
  });

  it('filters a foreign patient and leaves every current and archived input unchanged', () => {
    const header = { patientId: pid, name: 'Fikcyjny pacjent' };
    const notes = baseNotes.concat(treatmentNote('diagnosis', 'fictional-current-diagnosis'),
      treatmentNote('therapy', 'fictional-foreign-treatment', { title: 'FOREIGN-TREATMENT-MUST-NOT-RENDER' }, { patientId: 'fictional-other-patient' }));
    const latestVisit = { patientId: pid, payload: { ghTherapyPoints: [{ type: 'continue' }] } };
    const context = { currentRecords: true, notesStatus: 'ready', latestVisit };
    const before = JSON.stringify({ header, notes, context, patient });
    const result = generalContext(notes, context, header);
    expect(JSON.stringify(result)).not.toContain('FOREIGN-TREATMENT-MUST-NOT-RENDER');
    expect(JSON.stringify({ header, notes, context, patient })).toBe(before);
  });

  it('requires a confirmed patient id before presenting typed records or ownerless legacy monitoring', () => {
    const notes = [treatmentNote('therapy', 'fictional-unowned-treatment', { title: 'UNCONFIRMED-TREATMENT' },
      { patientId: 'fictional-foreign-patient' })];
    const result = generalContext(notes, { currentRecords: true, notesStatus: 'ready',
      latestVisit: { payload: { ghTherapyPoints: [{ type: 'continue' }] } } }, {});
    expect(result.currentStatus).toBe('error'); expect(result.notes).toEqual([]);
    expect(section(result, 'Aktualne rozpoznania')).toBeUndefined();
    expect(section(result, 'Aktywne leczenie')).toBeUndefined();
    expect(section(result, 'Monitorowanie w ostatniej zapisanej wizycie')).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('UNCONFIRMED-TREATMENT');
  });
});

describe('home patient: native saved documentation projection', () => {
  it('matches native diary category exclusion for two real serialized versions and unreadable journal records', async () => {
    vm.runInContext(source('vilda_cykle_leczenia.js'), vm.createContext(w));
    const diary = w.VildaDziennikOtylosci;
    const data = { type: 'continue', dateISO: '2026-11-10', ageYears: 13, ageMonths: 7,
      weight: 74.6, weightSource: 'pacjent', height: null, drug: 'Wegovy', dose: '2,4 mg' };
    const first = diary.planNowego(diary.zloz([], []), pid, data);
    const notes = first.wersje.map(version => diary.zakoduj(pid, version));
    const corrected = diary.planPoprawki(diary.zloz(notes, []), pid, first.entryId, { ...data, weight: 74.1 });
    notes.push(...corrected.wersje.map(version => diary.zakoduj(pid, version)));
    expect(notes).toHaveLength(2);
    expect(diary.zloz(notes, []).wpisy).toHaveLength(1);
    for (const note of notes) {
      expect(note.treatmentContext).toBeUndefined();
      note.updatedAtISO = '2026-12-01T12:00:00Z';
    }
    notes.push({ id: 'fictional-unreadable-journal', patientId: pid, category: 'leczenie-otylosci',
      body: 'Fikcyjny nieczytelny wpis dziennika', updatedAtISO: '2026-12-02T12:00:00Z' });
    const ordinary = baseNotes.slice(), baseline = await read(fixture());
    baseNotes = notes.concat(ordinary);
    const before = JSON.stringify(baseNotes), result = await read(fixture());
    expect(result.currentNotes).toEqual(baseline.currentNotes);
    expect(result.counts.notes).toBe(baseline.counts.notes);
    expect(result.latestNote).toEqual(baseline.latestNote);
    expect(JSON.stringify(baseNotes)).toBe(before);
  });
  it('projects the first-open active treatment subtitle from saved documents without counting a closed episode', async () => {
    var therapy = w.VildaPatientTreatmentModel.normalize({ schemaVersion: 1, kind: 'therapy',
      title: 'Fikcyjne postępowanie aktywne', method: 'other', status: 'active', diagnosisIds: [], followups: [] });
    baseNotes.push({ id: 'fictional-active-therapy', patientId: pid, category: 'treatment', treatmentContext: therapy });
    baseNotes.push({ id: 'fictional-closed-therapy', patientId: pid, category: 'treatment',
      treatmentContext: { ...therapy, title: 'Fikcyjny zakończony epizod', status: 'closed', endDateISO: '2026-10-31' } });
    var before = JSON.stringify(baseNotes), result = await read(fixture());
    expect(result.treatmentSummary).toEqual({ status: 'ready', activeCount: 1,
      activeLabels: ['Fikcyjne postępowanie aktywne'], unsupportedCount: 0 });
    expect(result.counts.notes).toBe(3);
    expect(result.latestNote.id).toBe('general');
    expect(JSON.stringify(baseNotes)).toBe(before);
  });
  it('keeps structured treatment records out of the general-note preview without altering encrypted-note input', async () => {
    baseNotes.unshift(
      { id: 'fictional-diagnosis', patientId: pid, title: 'Rozpoznanie', body: 'Fikcyjny zapis', category: 'observation', updatedAtISO: '2026-12-01T12:00:00Z', treatmentContext: { version: 1, kind: 'diagnosis', name: 'Fikcyjne rozpoznanie', code: 'I10' } },
      { id: 'fictional-future-treatment', patientId: pid, title: 'Nowszy zapis leczenia', body: 'Fikcyjny zapis', category: 'observation', updatedAtISO: '2026-12-02T12:00:00Z', treatmentContext: { version: 99, kind: 'future' } }
    );
    var before = JSON.stringify(baseNotes);
    const result = await read(fixture());
    expect(result.counts.notes).toBe(3);
    expect(result.latestNote.id).toBe('general');
    expect(result.currentNotes.some(note => note.id === 'fictional-diagnosis' || note.id === 'fictional-future-treatment')).toBe(false);
    expect(JSON.stringify(baseNotes)).toBe(before);
  });
  it('preserves actual visit, plaintext notes, saved lab norm and flat V1 plan without reassessment', async () => {
    const result = await read(fixture());
    expect(result.areas.notes).toBe('ready'); expect(result.counts.notes).toBe(3);
    expect(result.generalNotes[0].id).toBe('general'); expect(result.clinicalNotes[0].id).toBe('clinical');
    expect(result.latestNote.body).toBe('<script>literal plaintext</script>');
    expect(result.identity.visit.visitId).toBe('exact-original-visit');
    expect(result.counts.labResults).toBe(1);
    expect(result.latestLabRows[0].presentation).toMatchObject({ tone: 'within', normText: '1–3\u00a0mIU/L' });
    expect(result.latestLabRows[0].destination.labFocusNoteId).toBe('lab');
    expect(result.latestPlanSummary.kind).toBe('legacy');
    expect(result.latestPlanSummary.view).toBeNull(); expect(result.latestPlanSummary.source).toBe(plan);
  });
  it('does not expose derived documentation for a missing saved patient', async () => {
    const result = await read(fixture({ getPatient: async () => null }));
    expect(result.areas.patient).toBe('missing'); expect(result.counts.notes).toBeNull(); expect(result.latestNote).toBeNull();
  });
  it('keeps a notes read error distinct from empty notes and dependent lab history', async () => {
    const result = await read(fixture({ listPatientNotesForPatient: async () => { throw Error('fictional read failure'); } }));
    expect(result.currentNotes).toBeNull(); expect(result.counts.notes).toBeNull();
    expect(result.labView).toBeNull(); expect(result.counts.labResults).toBeNull(); expect(result.counts.carePlans).toBe(1);
  });
  it('does not present a complete lab history after its treatment read failed', async () => {
    const result = await read(fixture({ listPatientTreatmentPeriods: async () => { throw Error('fictional read failure'); } }));
    expect(result.counts.labResults).toBeNull(); expect(result.areas.notes).toBe('ready');
  });
  it('rejects a foreign patient note instead of rendering or counting it', async () => {
    const result = await read(fixture({ listPatientNotesForPatient: async () => [{ id: 'foreign', patientId: 'another-fictional-patient' }] }));
    expect(result.sources.listPatientNotesForPatient).toBe('error'); expect(result.counts.notes).toBeNull();
  });
  it('reports the missing lazy converter rather than a fictitious zero lab count', async () => {
    w.LabUnitConverter = null;
    const result = await read(fixture());
    expect(result.areas.labs).toBe('error'); expect(result.counts.labResults).toBeNull();
    expect(result.errors).toContainEqual({ area: 'labs', code: 'HOME_PATIENT_LAB_CONVERTER_UNAVAILABLE' });
  });
  it('requires the native Clcr reader when actual Clcr history may be present', async () => {
    const result = await read(fixture({ listPatientNotesForPatient: async () => baseNotes.concat([{ id: 'clcr', patientId: pid, category: 'wynik-klirens' }]) }));
    expect(result.errors).toContainEqual({ area: 'labs', code: 'HOME_PATIENT_CLCR_READER_UNAVAILABLE' });
  });
  it('marks a split-time missing-note read as partial and leaves its count unknown', async () => {
    const result = await read(fixture({ listPatientLabSeries: async () => [{ testKey: 'tsh', points: [{ noteId: 'missing', dateISO: '2026-11-02', valueNum: 1, unit: 'mIU/L' }] }] }));
    expect(result.areas.labs).toBe('partial'); expect(result.counts.labResults).toBeNull();
  });
  it('uses actual zero counts when every native source is genuinely empty', async () => {
    const result = await read(fixture({ listPatientNotesForPatient: async () => [], listPatientLabSeries: async () => [], listCarePlans: async () => [] }));
    expect(result.counts).toEqual({ notes: 0, labResults: 0, carePlans: 0 });
  });
  it('rechecks the owner after every pending native source read', async () => {
    let active = true, currentCalls = 0;
    const pending = [], deferred = () => new Promise(resolve => { pending.push(resolve); });
    const vault = fixture({ getPatient: deferred, listPatientNotesForPatient: deferred, listPatientLabSeries: deferred, listPatientTreatmentPeriods: deferred, listCarePlans: deferred });
    const promise = read(vault, () => { currentCalls++; return active; });
    expect(pending).toHaveLength(5); active = false; pending.forEach(resolve => resolve([]));
    await expect(promise).rejects.toMatchObject({ code: 'HOME_PATIENT_STALE' });
    expect(currentCalls).toBeGreaterThanOrEqual(12);
  });
  it('does not assign an active clinical status to an unsupported future care format', async () => {
    const result = await read(fixture({ listCarePlans: async () => [{ id: 'future', patientId: pid, title: 'Fikcyjny przyszły plan', category: 'care-plan', careContext: { version: 99, role: 'plan', status: 'active' } }] }));
    expect(result.latestPlanSummary.kind).toBe('unsupported'); expect(result.latestPlanSummary.status).toBeNull();
  });
  it('excludes saved Clcr results from Notes but preserves an ordinary Clcr-category note', async () => {
    const renalNotes = baseNotes.concat([
      { id: 'plain-clcr', patientId: pid, category: 'wynik-klirens', title: 'Fikcyjna zwykła notatka Klirensu', body: 'Bez zapisanego obliczenia', updatedAtISO: '2026-11-03T15:00:00Z' },
      { id: 'saved-clcr', patientId: pid, category: 'wynik-klirens', title: 'Fikcyjny zapisany wynik Klirensu', labResult: { value: '100' }, updatedAtISO: '2026-11-03T16:00:00Z' },
    ]);
    const result = await read(fixture({ listPatientNotesForPatient: async () => renalNotes }));
    expect(result.areas.notes).toBe('ready');
    expect(result.currentNotes.some(note => note.id === 'plain-clcr')).toBe(true);
    expect(result.currentNotes.some(note => note.id === 'saved-clcr')).toBe(false); expect(result.counts.notes).toBe(4);
  });
});
