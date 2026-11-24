import { describe, expect, it } from 'vitest';
import vm from 'node:vm';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const win = loadBrowserScript('runtime/patient-treatment-v1/model.js', {});
const model = win.VildaPatientTreatmentModel;
const diagnosis = (extra = {}) => ({ schemaVersion: 1, kind: 'diagnosis', name: 'Fikcyjne rozpoznanie',
  status: 'active', dateISO: '2026-11-03', ...extra });
const therapy = (extra = {}) => ({ schemaVersion: 1, kind: 'therapy', title: 'Fikcyjny epizod leczenia',
  method: 'other', status: 'active', ...extra });
const note = (id, context, extra = {}) => ({ id, patientId: 'fictional-patient', rev: 3,
  updatedAtISO: '2026-11-03T10:00:00.000Z', title: 'Dokumentacja fikcyjna', body: 'Zapis lekarza',
  treatmentContext: context, ...extra });
const project = notes => model.project(notes, { patientId: 'fictional-patient' });

describe('recorded patient diagnosis and treatment model', () => {
  it('keeps diagnosis without an ICD code and never infers one from the title', () => {
    expect(model.normalize(diagnosis({ name: 'Leczenie GH / IGF-1' }))).toEqual({
      schemaVersion: 1, kind: 'diagnosis', name: 'Leczenie GH / IGF-1', code: '', codingSystem: 'ICD-10',
      status: 'active', dateISO: '2026-11-03',
    });
    expect(model.normalize(diagnosis({ code: 'I10' })).code).toBe('I10');
  });

  it('preserves recorded drug and dose as text and leaves dates and links optional', () => {
    const context = model.normalize(therapy({ method: 'pharmacological', medication: 'Fikcyjny preparat', dose: '0,25 mg / tydzień' }));
    expect(context).toMatchObject({ medication: 'Fikcyjny preparat', dose: '0,25 mg / tydzień',
      startDateISO: '', endDateISO: '', nextDateISO: '', diagnosisIds: [], followups: [] });
  });

  it('detaches every nested value without changing either the input or its order', () => {
    const input = therapy({ diagnosisIds: ['d1'], followups: [
      { id: 'f1', dateISO: '2026-10-28', kind: 'Kontrola', body: 'Fikcyjna późniejsza kontrola' },
      { id: 'f2', dateISO: '2026-09-15', kind: 'Ustalenia', body: 'Fikcyjny starszy wpis' },
    ] });
    const normalized = model.normalize(input);
    input.diagnosisIds.push('d2'); input.followups[0].body = 'Zmieniony input';
    expect(normalized.diagnosisIds).toEqual(['d1']);
    expect(normalized.followups[0].body).toBe('Fikcyjna późniejsza kontrola');
    normalized.followups[1].body = 'Zmieniony wynik';
    expect(input.followups[1].body).toBe('Fikcyjny starszy wpis');
  });

  it('closing one episode leaves its diagnosis and other methods active', () => {
    const source = [note('d1', diagnosis({ code: 'I10' })), note('t1', therapy({ diagnosisIds: ['d1'] })),
      note('t2', therapy({ diagnosisIds: ['d1'], method: 'nonpharmacological' }))];
    const before = JSON.stringify(source);
    const view = project(source);
    const ended = model.normalize({ ...view.episodes.find(entry => entry.id === 't1').context,
      status: 'closed', endDateISO: '2026-11-03' });
    expect(ended.status).toBe('closed');
    expect(view.diagnoses[0].context.status).toBe('active');
    expect(view.episodes.find(entry => entry.id === 't2').context.status).toBe('active');
    expect(JSON.stringify(source)).toBe(before);
  });

  it('validates Gregorian dates and a known end before start without requiring missing dates', () => {
    expect(model.normalize(diagnosis({ dateISO: '2000-02-29' })).dateISO).toBe('2000-02-29');
    for (const dateISO of ['1900-02-29', '2026-02-30', '2026-13-01', '2026-1-03', '0000-01-01']) {
      expect(() => model.normalize(diagnosis({ dateISO }))).toThrow();
    }
    expect(() => model.normalize(therapy({ startDateISO: '2026-11-03', endDateISO: '2026-11-02' }))).toThrow();
    expect(model.normalize(therapy({ status: 'closed' })).endDateISO).toBe('');
  });

  it('does not turn malformed or future data into no treatment', () => {
    const ordinary = { id: 'n1', patientId: 'fictional-patient', body: 'Zwykła notatka' };
    expect(model.decode(ordinary).kind).toBe('none');
    for (const context of [null, [], diagnosis({ schemaVersion: 2 }), diagnosis({ extraFutureField: 1 }),
      diagnosis({ codingSystem: 'ICD-11' }), therapy({ method: 'new-method' })]) {
      expect(model.decode(note('n2', context))).toMatchObject({ kind: 'unsupported', context: null,
        error: { code: 'TREATMENT_UNSUPPORTED' } });
    }
    expect(project([note('n2', { schemaVersion: 9, preserved: 'future record' })]).unsupported[0].baseNote.treatmentContext)
      .toEqual({ schemaVersion: 9, preserved: 'future record' });
  });

  it('rejects accessors without invoking them, including array items', () => {
    let calls = 0;
    const withGetter = diagnosis();
    Object.defineProperty(withGetter, 'name', { enumerable: true, get() { calls += 1; return 'nazwa'; } });
    expect(() => model.normalize(withGetter)).toThrow();
    const followups = [];
    Object.defineProperty(followups, '0', { enumerable: true, get() { calls += 1; return {}; } });
    expect(() => model.normalize(therapy({ followups }))).toThrow();
    expect(calls).toBe(0);
  });

  it('rejects arbitrary inherited records, array prototypes and hidden sparse values', () => {
    expect(() => model.normalize(Object.assign(Object.create({ inherited: true }), diagnosis()))).toThrow();
    const links = ['d1']; Object.setPrototypeOf(links, Object.create(Array.prototype));
    expect(() => model.normalize(therapy({ diagnosisIds: links }))).toThrow();
    expect(() => model.normalize(therapy({ diagnosisIds: Array(1) }))).toThrow();
    const symbolic = diagnosis(); symbolic[Symbol('hidden')] = true;
    expect(() => model.normalize(symbolic)).toThrow();
  });

  it('accepts ordinary host-document objects and arrays from another realm', () => {
    const foreign = vm.runInNewContext('({schemaVersion:1,kind:"therapy",title:"Fikcyjny host",method:"other",status:"active",diagnosisIds:["d1"]})');
    expect(model.normalize(foreign)).toMatchObject({ title: 'Fikcyjny host', diagnosisIds: ['d1'] });
  });

  it('enforces unique linked records and controls without assigning a missing diagnosis', () => {
    expect(() => model.normalize(therapy({ diagnosisIds: ['d1', 'd1'] }))).toThrow();
    expect(() => model.normalize(therapy({ diagnosisIds: ['bad id'] }))).toThrow();
    const followup = { id: 'f1', dateISO: '2026-11-03', kind: 'Kontrola', body: 'Fikcyjna kontrola' };
    expect(() => model.normalize(therapy({ followups: [followup, followup] }))).toThrow();
    expect(project([note('t1', therapy())]).diagnoses).toEqual([]);
    expect(project([note('t1', therapy())]).episodes[0].context.diagnosisIds).toEqual([]);
  });

  it('projects only the selected patient and retains full detached revision data', () => {
    const input = note('d1', diagnosis(), { extraRecordedField: { list: ['preserved'] } });
    const view = project([input, note('other-d1', diagnosis({ name: 'Inny fikcyjny pacjent' }), { patientId: 'other-patient' })]);
    expect(view.diagnoses).toHaveLength(1);
    expect(view.diagnoses[0]).toMatchObject({ id: 'd1', patientId: 'fictional-patient', rev: 3,
      updatedAtISO: '2026-11-03T10:00:00.000Z' });
    view.diagnoses[0].baseNote.extraRecordedField.list.push('changed');
    view.diagnoses[0].context.name = 'Zmieniony widok';
    expect(input.extraRecordedField.list).toEqual(['preserved']);
    expect(input.treatmentContext.name).toBe('Fikcyjne rozpoznanie');
  });

  it('orders clinical records by date and uses the newest control rather than insertion order', () => {
    const newer = note('d-new', diagnosis({ dateISO: '2026-11-01' }));
    const older = note('d-old', diagnosis({ dateISO: '2020-01-01' }), { updatedAtISO: '2027-01-01T00:00:00.000Z' });
    const episode = note('t1', therapy({ followups: [
      { id: 'f-new', dateISO: '2026-10-28', kind: 'Kontrola', body: 'Nowy wpis' },
      { id: 'f-old', dateISO: '2020-09-15', kind: 'Kontrola', body: 'Stary wpis' },
    ] }));
    expect(project([older, newer]).diagnoses.map(entry => entry.id)).toEqual(['d-new', 'd-old']);
    const otherEpisode = note('t2', therapy({ followups: [
      { id: 'f2', dateISO: '2026-10-20', kind: 'Kontrola', body: 'Drugi fikcyjny epizod' },
    ] }), { updatedAtISO: '2027-01-01T00:00:00.000Z' });
    expect(project([otherEpisode, episode]).episodes.map(entry => entry.id)).toEqual(['t1', 't2']);
    expect(model.describe(episode.treatmentContext).body.indexOf('2026-10-28')).toBeLessThan(model.describe(episode.treatmentContext).body.indexOf('2020-09-15'));
    expect(episode.treatmentContext.followups.map(entry => entry.id)).toEqual(['f-new', 'f-old']);
  });

  it('generates ordinary readable documentation without JSON or a new medical verdict', () => {
    const legacy = model.describe(diagnosis({ code: 'I10' }));
    expect(legacy).toMatchObject({ title: 'Rozpoznanie · Fikcyjne rozpoznanie', category: 'treatment', clinicalDateISO: '2026-11-03' });
    expect(legacy.body).toContain('ICD-10: I10');
    expect(legacy.body).not.toContain('schemaVersion');
    const method = therapy({ method: 'nonpharmacological', medication: 'Wcześniej zapisany preparat', dose: '0,25 mg' });
    expect(model.normalize(method).medication).toBe('Wcześniej zapisany preparat');
    expect(model.describe(method).body).not.toContain('0,25 mg');
    expect(model.describe(method).clinicalDateISO).toBeNull();
  });

  it('reports bounded validation errors without reflecting patient input', () => {
    try { model.normalize(diagnosis({ name: 'F'.repeat(201) })); }
    catch (error) {
      expect(error).toMatchObject({ code: 'TREATMENT_INVALID', field: 'name' });
      expect(error.message).not.toContain('FFFF');
      return;
    }
    throw new Error('Expected invalid data');
  });
});
