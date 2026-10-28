import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const storage = () => { const data = new Map(); return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key), key: index => [...data.keys()][index] ?? null, get length() { return data.size; } }; };
let serial = 0;
async function device() {
  const win = { crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: storage(), sessionStorage: storage(), setTimeout, clearTimeout, addEventListener() {}, removeEventListener() {}, document: { addEventListener() {}, removeEventListener() {}, hidden: false } };
  win.window = win; win.self = win; win.top = win;
  for (const file of ['vilda_crypto.js', 'vilda_vault.js']) loadBrowserScript(file, win);
  const vault = win.VildaVault, adapter = vault.createInMemoryAdapter(); vault.setStorageAdapter(adapter);
  const password = 'Fikcyjny#B22!' + ++serial;
  await vault.createUser(password, { iterations: 10000, label: 'Fikcyjny sejf B22' });
  const patient = await vault.savePatient({ name: 'Fikcyjna Zofia B22', user: { sex: 'F', age: 9, height: 130, weight: 28 } });
  const saved = await vault.savePatientNote({ patientId: patient.patientId, title: 'Umówić MR', body: 'Pierwotne ustalenia.', category: 'followup', dueDateISO: '2026-10-25', linkedAgeMonths: 108 });
  return { win, vault, adapter, password, patientId: patient.patientId, note: await vault.getPatientNote(saved.id) };
}
const request = (d, extra = {}) => ({ id: d.note.id, patientId: d.patientId, baseRev: d.note.rev, operationId: 'fictional-op-' + ++serial, action: 'complete', dateISO: '2026-10-28', text: 'Umówiłem MR na 02.02.2027 r.', ...extra });

describe('B2.2 real vault outcome transaction', () => {
  it('retains original text, dates, age and title, and saves the description in the existing patient note', async () => {
    const d = await device(); expect((await d.vault.saveReminderOutcome(request(d))).saved).toBe(true);
    const note = await d.vault.getPatientNote(d.note.id);
    expect(note).toMatchObject({ title: 'Umówić MR', dueDateISO: d.note.dueDateISO, createdAtISO: d.note.createdAtISO, linkedAgeMonths: 108 });
    expect(note.body).toContain('Pierwotne ustalenia.'); expect(note.body).toContain('Umówiłem MR na 02.02.2027 r.'); expect(note.completedAtISO).toBeTruthy();
    expect(await d.vault.listPatientNotesDueByDate()).toEqual([]);
    const timeline = await d.vault.listPatientTimelineEvents(d.patientId);
    expect(timeline.find(item => item.noteId === note.id).body).toContain('02.02.2027');
  });
  it('commits completion and the next step together and links both directions', async () => {
    const d = await device(), result = await d.vault.saveReminderOutcome(request(d, { next: { title: 'Sprawdzić wykonanie MR', dateISO: '2027-02-02', dueTime: '09:30' } }));
    const parent = await d.vault.getPatientNote(d.note.id), next = await d.vault.getPatientNote(result.nextId);
    expect(parent.reminderContext.nextId).toBe(next.id); expect(next.reminderContext.parentId).toBe(parent.id);
    expect(next).toMatchObject({ patientId: d.patientId, title: 'Sprawdzić wykonanie MR', dueTime: '09:30', completedAtISO: null });
    expect(next.dueDateISO).toContain('2027-02-02'); expect(parent.body).toContain('Kolejny krok:');
  });
  it('a failed atomic commit leaves the original open and creates neither result nor next step', async () => {
    const d = await device(); d.adapter.commitReminderForUser = async () => { throw Error('FICTIONAL_DISK_FAILURE'); };
    await expect(d.vault.saveReminderOutcome(request(d, { action: 'result', text: 'Opis biopsji', next: { title: 'Omówić wynik', dateISO: '2026-11-01' } }))).rejects.toThrow('FICTIONAL_DISK_FAILURE');
    expect(await d.vault.getPatientNote(d.note.id)).toEqual(d.note); expect(await d.vault.listPatientNotesForPatient(d.patientId)).toHaveLength(1);
  });
  it('retrying the same operation after a lost acknowledgement is read-only and does not duplicate children', async () => {
    const d = await device(), input = request(d, { next: { title: 'MR', dateISO: '2027-02-02' } });
    const first = await d.vault.saveReminderOutcome(input), note = await d.vault.getPatientNote(d.note.id);
    const second = await d.vault.saveReminderOutcome(input);
    expect(second).toMatchObject({ saved: true, reused: true, nextId: first.nextId }); expect(await d.vault.getPatientNote(d.note.id)).toEqual(note);
    expect(await d.vault.listPatientNotesForPatient(d.patientId)).toHaveLength(2);
  });
  it('a stale editor does not overwrite a newer description or create a next step', async () => {
    const d = await device(); await d.vault.savePatientNote({ id: d.note.id, patientId: d.patientId, body: 'Nowsze ustalenia z innej karty.' });
    const result = await d.vault.saveReminderOutcome(request(d, { next: { title: 'MR', dateISO: '2027-02-02' } }));
    expect(result).toMatchObject({ saved: false, conflict: true }); expect((await d.vault.getPatientNote(d.note.id)).body).toBe('Nowsze ustalenia z innej karty.');
    expect(await d.vault.listPatientNotesForPatient(d.patientId)).toHaveLength(1);
  });
  it('checks revision again inside the transaction after encryption', async () => {
    const d = await device(), commit = d.adapter.commitReminderForUser;
    d.adapter.commitReminderForUser = async (user, change) => {
      const stored = await d.adapter.getPatientNoteForUser(user, d.note.id); await d.adapter.putPatientNoteForUser(user, { ...stored, rev: stored.rev + 1 });
      return commit(user, change);
    };
    expect(await d.vault.saveReminderOutcome(request(d, { next: { title: 'MR', dateISO: '2027-02-02' } }))).toMatchObject({ saved: false, conflict: true });
    expect((await d.vault.getPatientNote(d.note.id)).completedAtISO).toBeNull(); expect(await d.vault.listPatientNotesForPatient(d.patientId)).toHaveLength(1);
  });
  it('a deletion during preparation is not resurrected by the transaction', async () => {
    const d = await device(), commit = d.adapter.commitReminderForUser;
    d.adapter.commitReminderForUser = async (user, change) => { await d.adapter.putPatientNoteTombstoneForUser(user, { id: d.note.id, deletedAtISO: new Date().toISOString(), rev: 2 }); return commit(user, change); };
    expect(await d.vault.saveReminderOutcome(request(d))).toMatchObject({ saved: false, reason: 'deleted' });
    expect((await d.vault.getPatientNote(d.note.id)).completedAtISO).toBeNull();
  });
  it('stores full narrative results without pretending the receipt date is the sampling date or plotting a number', async () => {
    const d = await device(), text = 'Fikcyjny opis biopsji. '.repeat(30);
    const result = await d.vault.saveReminderOutcome(request(d, { action: 'result', text }));
    const note = await d.vault.getPatientNote(result.resultNoteId);
    expect(note.body).toContain(text.trim()); expect(note.clinicalDateISO).toBeNull(); expect(note.dueDateISO).toBeNull();
    expect(note.labResult.value).toBe('Wynik opisowy — pełna treść w notatce'); expect(await d.vault.listPatientLabSeries(d.patientId)).toEqual([]);
    const stored = await d.adapter.getPatientNoteForUser(d.vault.getCurrentUser().userId, note.id);
    expect(JSON.stringify(stored)).not.toContain('Fikcyjny opis biopsji'); expect(JSON.stringify(stored)).not.toContain('reminderContext');
  });
  it('preserves metadata through legacy status changes and body edits', async () => {
    const d = await device(); await d.vault.saveReminderOutcome(request(d)); const before = await d.vault.getPatientNote(d.note.id);
    await d.vault.uncompletePatientNote(d.note.id); await d.vault.savePatientNote({ id: d.note.id, patientId: d.patientId, body: before.body + '\nDopisek.' });
    expect((await d.vault.getPatientNote(d.note.id)).reminderContext).toEqual(before.reminderContext);
  });
  it('rescheduling retains original text and does not complete the task', async () => {
    const d = await device(); await d.vault.saveReminderOutcome(request(d, { action: 'reschedule', dateISO: '2026-11-10', text: 'Nowy termin ustalony z rodzicem.' }));
    const note = await d.vault.getPatientNote(d.note.id); expect(note.completedAtISO).toBeNull(); expect(note.dueDateISO).toContain('2026-11-10'); expect(note.body).toContain('25.10.2026 → 10.11.2026');
  });
  it.each([{ action: 'result', text: '' }, { dateISO: '2026-02-31' }, { next: { title: '', dateISO: '2027-02-02' } }])('invalid input does not mutate storage (%j)', async invalid => {
    const d = await device(); await expect(d.vault.saveReminderOutcome(request(d, invalid))).rejects.toThrow(); expect(await d.vault.getPatientNote(d.note.id)).toEqual(d.note);
  });
  it('sync roundtrip preserves the shared links and description', async () => {
    const a = await device(), result = await a.vault.saveReminderOutcome(request(a, { next: { title: 'Kontrola MR', dateISO: '2027-02-02' } })), b = await device();
    await b.vault.mergeSyncPayload(await a.vault.exportSyncPayload());
    const parent = await b.vault.getPatientNote(a.note.id), next = await b.vault.getPatientNote(result.nextId);
    expect(parent.reminderContext.nextId).toBe(next.id); expect(next.reminderContext.parentId).toBe(parent.id); expect(parent.body).toContain('02.02.2027');
  });
  it('the same operation ID with different content is a conflict, never a false acknowledgement', async () => {
    const d = await device(), input = request(d); await d.vault.saveReminderOutcome(input);
    expect(await d.vault.saveReminderOutcome({ ...input, text: 'Inne ustalenia.' })).toMatchObject({ saved: false, conflict: true, reason: 'operation-mismatch' });
    expect((await d.vault.getPatientNote(d.note.id)).body).not.toContain('Inne ustalenia.');
  });
  it('locking before the atomic commit creates no records in either account', async () => {
    const d = await device(), userId = d.vault.getCurrentUser().userId, before = await d.adapter.getPatientNoteForUser(userId, d.note.id), commit = d.adapter.commitReminderForUser;
    d.adapter.commitReminderForUser = async (user, change) => { d.vault.lock('manual'); return commit(user, change); };
    await expect(d.vault.saveReminderOutcome(request(d, { next: { title: 'MR', dateISO: '2027-02-02' } }))).rejects.toThrow(/Sesja/);
    expect(await d.adapter.getPatientNoteForUser(userId, d.note.id)).toEqual(before); expect(await d.adapter.listPatientNotesForUser(userId)).toHaveLength(1);
  });
  it('a ciphertext read failure cannot overwrite the original record with a fallback error message', async () => {
    const d = await device(), userId = d.vault.getCurrentUser().userId, raw = await d.adapter.getPatientNoteForUser(userId, d.note.id);
    const corrupt = { ...raw, bodyCipher: { ...raw.bodyCipher, data: 'AA==' } }; await d.adapter.putPatientNoteForUser(userId, corrupt);
    await expect(d.vault.saveReminderOutcome(request(d))).rejects.toThrow();
    expect(await d.adapter.getPatientNoteForUser(userId, d.note.id)).toEqual(corrupt); expect(await d.adapter.listPatientNotesForUser(userId)).toHaveLength(1);
  });
  it('the generic reminder idempotency check includes its date and time', async () => {
    const d = await device(), draft = { id: 'fictional-once-b22', patientId: d.patientId, title: 'Kontakt z rodzicem', body: 'Fikcyjne ustalenia.', category: 'reminder-contact', dueDateISO: '2026-10-28', dueTime: '14:30', reminderContext: { version: 1, kind: 'reminder' } };
    expect(await d.vault.savePatientNoteOnce(draft)).toMatchObject({ saved: true, reused: false });
    expect(await d.vault.savePatientNoteOnce(draft)).toMatchObject({ saved: true, reused: true });
    expect(await d.vault.savePatientNoteOnce({ ...draft, dueTime: '15:00' })).toMatchObject({ saved: false, conflict: true });
    expect((await d.vault.getPatientNote(draft.id)).dueTime).toBe('14:30');
  });
  it('a patient export/import retains the original description and both directions of the next-step link', async () => {
    const a = await device(), result = await a.vault.saveReminderOutcome(request(a, { next: { title: 'Fikcyjna kontrola MR', dateISO: '2027-02-02' } }));
    const envelope = await a.vault.exportPatientEnvelope(a.patientId), b = await device();
    const imported = await b.vault.importPatientFromEnvelope(envelope, a.password);
    const notes = await b.vault.listPatientNotesForPatient(imported.patientId), parent = notes.find(n => n.id === a.note.id), next = notes.find(n => n.id === result.nextId);
    expect(parent.body).toContain('02.02.2027'); expect(parent.reminderContext.nextId).toBe(next.id); expect(next.reminderContext.parentId).toBe(parent.id);
  });
  it('a later sync from a client omitting context retains the known relationship', async () => {
    const d = await device(); await d.vault.saveReminderOutcome(request(d, { next: { title: 'MR', dateISO: '2027-02-02' } }));
    const parent = await d.vault.getPatientNote(d.note.id), payload = await d.vault.exportSyncPayload(), incoming = payload.patientNotes.find(n => n.id === d.note.id);
    delete incoming.reminderContext; incoming.rev += 1; incoming.body += '\nDopisek innego klienta.';
    await d.vault.mergeSyncPayload(payload);
    const changed = await d.vault.getPatientNote(d.note.id); expect(changed.body).toContain('Dopisek innego klienta.'); expect(changed.reminderContext).toEqual(parent.reminderContext);
  });
});
