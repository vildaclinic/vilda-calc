import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const DAY = '2026-10-29';
let serial = 0;
const operation = () => 'fictional-care-' + ++serial;
const storage = () => {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key), key: index => [...data.keys()][index] ?? null,
    get length() { return data.size; } };
};
async function device() {
  const win = { crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: storage(), sessionStorage: storage(), setTimeout, clearTimeout,
    addEventListener() {}, removeEventListener() {}, document: { addEventListener() {}, removeEventListener() {}, hidden: false } };
  win.window = win; win.self = win; win.top = win;
  for (const file of ['vilda_crypto.js', 'vilda_vault.js']) loadBrowserScript(file, win);
  const vault = win.VildaVault, adapter = vault.createInMemoryAdapter(); vault.setStorageAdapter(adapter);
  const password = 'Fikcyjny#Care!' + ++serial;
  await vault.createUser(password, { iterations: 10000, label: 'Fikcyjny sejf Planów opieki' });
  const saved = await vault.savePatient({ name: 'Fikcyjna Zofia Plany', user: { sex: 'F', age: 12, height: 155, weight: 44 } });
  return { win, vault, adapter, password, patientId: saved.patientId, userId: vault.getCurrentUser().userId };
}
async function create(d, extra = {}) {
  const result = await d.vault.mutateCarePlan({ patientId: d.patientId, operationId: operation(), action: 'create',
    title: 'Fikcyjna diagnostyka biopsji', goal: 'Odebrać wynik i ustalić dalsze postępowanie.', ...extra });
  expect(result.saved).toBe(true);
  return result.plan || d.vault.getCarePlan(result.planId);
}
const mutate = (d, plan, action, extra = {}) => d.vault.mutateCarePlan({ planId: plan.id, patientId: plan.patientId,
  baseRev: plan.rev, operationId: operation(), action, ...extra });
async function add(d, plan, extra = {}) {
  const result = await mutate(d, plan, 'addStep', { step: { title: 'Fikcyjna biopsja', kind: 'Badanie', state: 'pending',
    reminderDateISO: DAY, description: 'Fikcyjne ustalenia lekarza.', ...extra } });
  expect(result.saved).toBe(true);
  return { plan: result.plan || await d.vault.getCarePlan(plan.id), stepId: result.stepId };
}
async function fork() {
  const a = await device(), added = await add(a, await create(a), { title: 'Fikcyjny bazowy krok', reminderDateISO: '2026-11-03' });
  const b = await device(); await b.vault.mergeSyncPayload(await a.vault.exportSyncPayload());
  return { a, b, plan: added.plan, stepId: added.stepId, other: await b.vault.getCarePlan(added.plan.id) };
}
const rawNotes = d => d.adapter.listPatientNotesForUser(d.userId);
const dueNotes = async (d, day = DAY) => (await d.vault.listPatientNotesDueByDate(day + 'T23:59:59.999Z')).flatMap(group => group.notes);
async function rejected(write) {
  try { expect((await write).saved).toBe(false); }
  catch (error) { if (error && error.name === 'AssertionError') throw error; expect(error).toBeInstanceOf(Error); }
}
async function withCareClock(instant, timezone, run) {
  const RealDate = globalThis.Date, previousTimezone = process.env.TZ;
  if (timezone) process.env.TZ = timezone;
  globalThis.Date = class FixedCareDate extends RealDate {
    constructor(...args) { super(...(args.length ? args : [instant])); }
    static now() { return RealDate.parse(instant); }
  };
  try { return await run(); }
  finally { globalThis.Date = RealDate; process.env.TZ = previousTimezone; }
}

describe('Plany opieki — real encrypted vault and shared patient records', () => {
  it('keeps several independent plans for one patient and filters by the owning patient', async () => {
    const d = await device(), first = await create(d), second = await create(d, { title: 'Fikcyjna kontrola odrębnej sprawy' });
    const other = await d.vault.savePatient({ name: 'Fikcyjny Adam Inny', user: { sex: 'M', age: 9, height: 130, weight: 29 } });
    const third = await create(d, { patientId: other.patientId, title: 'Fikcyjny plan Adama' });
    expect(first.id).not.toBe(second.id); expect(second.id).not.toBe(third.id);
    expect((await d.vault.listCarePlans({ patientId: d.patientId })).map(plan => plan.id).sort()).toEqual([first.id, second.id].sort());
    expect((await d.vault.listCarePlans({ patientId: other.patientId })).map(plan => plan.id)).toEqual([third.id]);
  });

  it('completes only the selected parallel step and keeps the remaining work in the same active plan', async () => {
    const d = await device(); let plan = await create(d, { title: 'Fikcyjny indywidualny plan dokumentacji GH' });
    const first = await add(d, plan, { title: 'Pierwsza hospitalizacja' }); plan = first.plan;
    plan = (await add(d, plan, { title: 'Druga hospitalizacja', reminderDateISO: '2026-11-09' })).plan;
    plan = (await add(d, plan, { title: 'Konsultacja okulistyczna', reminderDateISO: '2026-11-03' })).plan;
    const completed = await mutate(d, plan, 'complete', { stepId: first.stepId, dateISO: DAY,
      text: 'Fikcyjna dokumentacja hospitalizacji otrzymana.', continuation: 'existing' });
    expect(completed.saved).toBe(true); plan = await d.vault.getCarePlan(plan.id);
    expect(plan.status).toBe('active'); expect(plan.needsDecision).toBe(false);
    expect(plan.steps).toHaveLength(3); expect(plan.steps.filter(step => step.state === 'done')).toHaveLength(1);
    expect(plan.steps.filter(step => step.state === 'pending')).toHaveLength(2);
  });

  it('keeps the real event date separate from the check date, without duplicate calendar or reminder entries', async () => {
    const d = await device(), created = await create(d), { plan } = await add(d, created,
      { reminderDateISO: '2026-10-27', eventDateISO: '2026-11-03', eventTime: '10:30' });
    const step = plan.steps[0];
    expect(step.reminderDateISO).toBe('2026-10-27'); expect(step.eventDateISO).toBe('2026-11-03');
    expect(step.reminderNoteId).toBeTruthy(); expect(step.calendarNoteId).toBeTruthy(); expect(step.reminderNoteId).not.toBe(step.calendarNoteId);
    const due = await dueNotes(d);
    expect(due.map(note => note.id)).toContain(step.reminderNoteId); expect(due.map(note => note.id)).not.toContain(step.calendarNoteId);
    const calendar = await d.vault.listPatientNotesInRange('2026-10-01', '2026-11-30T23:59:59.999Z');
    expect(calendar.map(note => note.id)).toContain(step.calendarNoteId); expect(calendar.map(note => note.id)).not.toContain(step.reminderNoteId);
    expect((await d.vault.getPatientNote(step.calendarNoteId)).dueDateISO).toContain('2026-11-03');
  });

  it('keeps an undated step in its plan without inventing a reminder or a calendar appointment', async () => {
    const d = await device(), { plan } = await add(d, await create(d), { reminderDateISO: null, eventDateISO: null });
    expect(plan.steps).toHaveLength(1); expect(plan.steps[0].reminderDateISO).toBeNull(); expect(plan.steps[0].calendarNoteId).toBeFalsy();
    expect(await dueNotes(d, '2027-12-31')).toEqual([]);
    expect(await d.vault.listPatientNotesInRange('2026-01-01', '2027-12-31T23:59:59.999Z')).toEqual([]);
  });

  it('derives eligible care reminders from the canonical plan despite stale helper dates and completion flags without writing repairs', async () => {
    const d = await device(); let { plan } = await add(d, await create(d), { reminderDateISO: '2026-10-27' });
    plan = (await add(d, plan, { title: 'Fikcyjny oczekiwany opis', kind: 'Oczekujący wynik', state: 'waiting', reminderDateISO: '2026-10-28' })).plan;
    const first = await d.adapter.getPatientNoteForUser(d.userId, plan.steps[0].reminderNoteId);
    const second = await d.adapter.getPatientNoteForUser(d.userId, plan.steps[1].reminderNoteId);
    await d.adapter.putPatientNoteForUser(d.userId, { ...first, dueDateISO: '2035-01-01T00:00:00.000Z', completedAtISO: '2026-10-26T12:00:00.000Z' });
    await d.adapter.putPatientNoteForUser(d.userId, { ...second, dueDateISO: null, noShowAtISO: '2026-10-26T12:00:00.000Z' });
    const before = await rawNotes(d), due = await dueNotes(d);
    expect(due.find(note => note.id === first.id)).toMatchObject({ dueDateISO: '2026-10-27T00:00:00.000Z', completedAtISO: null, noShowAtISO: null, category: 'reminder-task' });
    expect(due.find(note => note.id === second.id)).toMatchObject({ dueDateISO: '2026-10-28T00:00:00.000Z', completedAtISO: null, noShowAtISO: null, category: 'wynik-badania' });
    expect(await rawNotes(d)).toEqual(before); expect(await d.vault.getCarePlan(plan.id)).toEqual(plan);
  });

  it('retains a reminder hour through add, edit and native reminder changes without changing the event hour', async () => {
    const d = await device(), { plan, stepId } = await add(d, await create(d),
      { reminderTime: '10:15', eventDateISO: '2026-11-03', eventTime: '09:00' });
    const noteId = plan.steps[0].reminderNoteId;
    expect(plan.steps[0].reminderTime).toBe('10:15'); expect((await d.vault.getPatientNote(noteId)).dueTime).toBe('10:15');
    expect((await mutate(d, plan, 'editStep', { stepId, step: { title: plan.steps[0].title, kind: 'Badanie', state: 'pending',
      reminderDateISO: DAY, reminderTime: '14:30', eventDateISO: '2026-11-03', eventTime: '09:00' } })).saved).toBe(true);
    const edited = await d.vault.getCarePlan(plan.id);
    expect(edited.steps[0].reminderTime).toBe('14:30'); expect((await d.vault.getPatientNote(noteId)).dueTime).toBe('14:30');
    await d.vault.savePatientNote({ id: noteId, patientId: d.patientId, dueTime: '16:45' });
    const changed = await d.vault.getCarePlan(plan.id);
    expect(changed.steps[0].reminderTime).toBe('16:45'); expect((await d.vault.getPatientNote(noteId)).dueTime).toBe('16:45');
    expect(changed.steps[0].eventTime).toBe('09:00'); expect((await d.vault.getPatientNote(changed.steps[0].calendarNoteId)).dueTime).toBe('09:00');
  });

  it('saves a narrative result to the patient record and leaves a visible later decision instead of closing care', async () => {
    const d = await device(), { plan, stepId } = await add(d, await create(d), { state: 'waiting', kind: 'Oczekujący wynik' });
    const text = 'Fikcyjny opis biopsji — bez wartości liczbowej. Omówiono dokumentację z rodzicem.';
    const result = await mutate(d, plan, 'result', { stepId, dateISO: DAY, text, continuation: 'later', decisionDateISO: '2026-10-30' });
    expect(result.saved).toBe(true);
    const changed = await d.vault.getCarePlan(plan.id), note = await d.vault.getPatientNote(result.resultNoteId);
    expect(changed).toMatchObject({ status: 'active', needsDecision: true, decisionDueDateISO: '2026-10-30' });
    expect(changed.steps[0]).toMatchObject({ state: 'done', completedDateISO: DAY, resultNoteId: result.resultNoteId });
    expect(note.body).toContain(text); expect(note.patientId).toBe(d.patientId); expect(note.category).toBe('wynik-badania');
    expect(note.dueDateISO).toBeNull(); expect(note.clinicalDateISO).toBeNull();
    expect(note.labResult?.valueNum).toBeUndefined(); expect(await d.vault.listPatientLabSeries(d.patientId)).toEqual([]);
    expect((await dueNotes(d, '2026-10-30')).some(note => note.careContext?.planId === plan.id)).toBe(true);
  });

  it('adds an explicitly chosen future follow-up while preserving the result and current reminder eligibility', async () => {
    const d = await device(), { plan, stepId } = await add(d, await create(d), { state: 'waiting', kind: 'Oczekujący wynik' });
    const result = await mutate(d, plan, 'result', { stepId, dateISO: DAY, text: 'Fikcyjny wynik opisowy.', continuation: 'next',
      next: { title: 'Fikcyjna kontrola za sześć miesięcy', kind: 'Kontrola', state: 'pending', reminderDateISO: '2027-04-29', eventDateISO: '2027-04-29' } });
    expect(result.saved).toBe(true); const changed = await d.vault.getCarePlan(plan.id);
    expect(changed).toMatchObject({ status: 'active', needsDecision: false });
    expect(changed.steps).toHaveLength(2); expect(changed.steps.filter(step => step.state === 'pending')).toHaveLength(1);
    expect(changed.steps.find(step => step.state === 'pending').reminderDateISO).toBe('2027-04-29');
    expect(await dueNotes(d)).toEqual([]); expect((await d.vault.getPatientNote(result.resultNoteId)).body).toContain('Fikcyjny wynik opisowy.');
  });

  it('records an examination as performed and creates a separately dated waiting-for-result step', async () => {
    const d = await device(), { plan, stepId } = await add(d, await create(d), { eventDateISO: '2026-10-28' });
    const result = await mutate(d, plan, 'wait', { stepId, dateISO: DAY, text: 'Fikcyjne badanie wykonano.', checkDateISO: '2026-11-05' });
    expect(result.saved).toBe(true); const changed = await d.vault.getCarePlan(plan.id);
    expect(changed.steps.find(step => step.id === stepId).state).toBe('done');
    const waiting = changed.steps.find(step => step.state === 'waiting');
    expect(waiting).toBeTruthy(); expect(waiting.id).not.toBe(stepId); expect(waiting.reminderDateISO).toBe('2026-11-05');
    expect(changed.status).toBe('active'); expect(changed.needsDecision).toBe(false);
  });

  it('keeps a direct native reminder completion coherent with its plan instead of bypassing care state', async () => {
    const d = await device(), { plan, stepId } = await add(d, await create(d));
    const reminder = await d.vault.getPatientNote(plan.steps[0].reminderNoteId);
    const result = await d.vault.saveReminderOutcome({ id: reminder.id, patientId: d.patientId, baseRev: reminder.rev,
      operationId: operation(), action: 'complete', dateISO: DAY, text: 'Fikcyjny opis wykonania z natywnego API.' });
    expect(result).toMatchObject({ saved: true, id: reminder.id });
    const changed = await d.vault.getCarePlan(plan.id);
    expect(changed).toMatchObject({ status: 'active', needsDecision: true });
    expect(changed.steps.find(step => step.id === stepId)).toMatchObject({ state: 'done', completedDateISO: DAY });
    expect((await d.vault.getPatientNote(reminder.id)).completedAtISO).toBeTruthy();
    expect(changed.log.some(entry => entry.text.includes('Zapisano wykonanie'))).toBe(true);
  });

  it('maps a native result and next reminder into the same plan and retries without duplicate records', async () => {
    const d = await device(), { plan, stepId } = await add(d, await create(d), { state: 'waiting', kind: 'Oczekujący wynik' });
    const reminder = await d.vault.getPatientNote(plan.steps[0].reminderNoteId);
    const input = { id: reminder.id, patientId: d.patientId, baseRev: reminder.rev, operationId: operation(), action: 'result',
      dateISO: DAY, text: 'Fikcyjny wynik zapisany przez dotychczasowe API przypomnień.',
      next: { title: 'Fikcyjna kontrola po wyniku', dateISO: '2027-04-29', dueTime: '09:30' } };
    const first = await d.vault.saveReminderOutcome(input);
    expect(first).toMatchObject({ saved: true, id: reminder.id }); expect(first.resultNoteId).toBeTruthy(); expect(first.nextId).toBeTruthy();
    const changed = await d.vault.getCarePlan(plan.id), original = changed.steps.find(step => step.id === stepId);
    expect(original).toMatchObject({ state: 'done', resultNoteId: first.resultNoteId }); expect(changed.steps).toHaveLength(2);
    expect(changed.steps.find(step => step.id !== stepId)).toMatchObject({ state: 'pending', reminderNoteId: first.nextId,
      reminderDateISO: '2027-04-29', reminderTime: '09:30' });
    expect((await d.vault.getPatientNote(first.resultNoteId)).body).toContain(input.text);
    const before = await rawNotes(d), second = await d.vault.saveReminderOutcome(input);
    expect(second).toMatchObject({ saved: true, reused: true, id: reminder.id, nextId: first.nextId, resultNoteId: first.resultNoteId });
    expect(await rawNotes(d)).toEqual(before);
  });

  it('rejects an empty result through the native reminder API without inventing a result narrative', async () => {
    const d = await device(), { plan } = await add(d, await create(d), { state: 'waiting', kind: 'Oczekujący wynik' });
    const reminder = await d.vault.getPatientNote(plan.steps[0].reminderNoteId), before = await rawNotes(d);
    await rejected(d.vault.saveReminderOutcome({ id: reminder.id, patientId: d.patientId, baseRev: reminder.rev,
      operationId: operation(), action: 'result', dateISO: DAY, text: '' }));
    expect(await rawNotes(d)).toEqual(before); expect((await d.vault.getCarePlan(plan.id)).steps[0].state).toBe('waiting');
  });

  it('does not silently close unresolved steps, and explicit closure distinguishes cancellation from performance', async () => {
    const d = await device(), { plan } = await add(d, await create(d), { eventDateISO: '2026-11-12' });
    const before = await rawNotes(d);
    await rejected(mutate(d, plan, 'close', { reason: 'Przekazano opiekę', text: 'Fikcyjne skierowanie do poradni.' }));
    expect(await rawNotes(d)).toEqual(before);
    expect((await mutate(d, plan, 'close', { reason: 'Przekazano opiekę', text: 'Fikcyjne skierowanie do poradni.', cancelOpen: true })).saved).toBe(true);
    const closed = await d.vault.getCarePlan(plan.id);
    expect(closed.status).toBe('closed'); expect(closed.closeReason).toBe('Przekazano opiekę'); expect(closed.closeText).toContain('Fikcyjne skierowanie');
    expect(closed.steps[0].state).toBe('cancelled'); expect(closed.steps.filter(step => step.state === 'done')).toEqual([]);
    expect(closed.steps[0].reminderDateISO).toBe(DAY);
    expect(await d.vault.getPatientNote(closed.steps[0].reminderNoteId)).toMatchObject({ dueDateISO: null, completedAtISO: null,
      noShowAtISO: null, careContext: { state: 'cancelled' } });
    const calendar = await d.vault.getPatientNote(closed.steps[0].calendarNoteId);
    expect(calendar.completedAtISO).toBeNull(); expect(calendar.noShowAtISO).toBeNull(); expect(calendar.dueDateISO).toContain('2026-11-12');
    expect(await dueNotes(d, '2027-12-31')).toEqual([]);
  });

  it('reopens a closed plan without erasing its closure history or marking cancelled work as performed', async () => {
    const d = await device(), { plan } = await add(d, await create(d));
    await mutate(d, plan, 'close', { reason: 'Przekazano opiekę', text: 'Fikcyjny opis przekazania.', cancelOpen: true });
    const closed = await d.vault.getCarePlan(plan.id), before = closed.log;
    expect((await mutate(d, closed, 'reopen')).saved).toBe(true);
    const reopened = await d.vault.getCarePlan(plan.id);
    expect(reopened.status).toBe('active'); expect(reopened.steps[0].state).toBe('cancelled');
    expect(reopened.log.length).toBeGreaterThan(before.length); expect(reopened.log.slice(0, before.length)).toEqual(before);
  });

  it('stores the physician description of reopening both in the plan log and patient documentation', async () => {
    const d = await device(), plan = await create(d);
    await mutate(d, plan, 'close', { reason: 'Przekazano opiekę', text: 'Fikcyjne wcześniejsze podsumowanie.' });
    const closed = await d.vault.getCarePlan(plan.id), text = 'Fikcyjne wznowienie monitorowania po konsultacji chirurgicznej.';
    expect((await mutate(d, closed, 'reopen', { text })).saved).toBe(true);
    const reopened = await d.vault.getCarePlan(plan.id), entry = reopened.log.find(item => item.text.includes(text));
    expect(entry).toBeTruthy(); expect(entry.noteId).toBeTruthy();
    const note = await d.vault.getPatientNote(entry.noteId);
    expect(note.patientId).toBe(d.patientId); expect(note.body).toContain(text); expect(note.careContext.planId).toBe(plan.id);
  });

  it('links the existing calendar record once and rejects linking it to a second plan', async () => {
    const d = await device(), plan = await create(d);
    const saved = await d.vault.savePatientNote({ patientId: d.patientId, title: 'Fikcyjna konsultacja chirurgiczna', body: 'Termin ustalony.',
      category: 'followup', dueDateISO: '2026-11-12', dueTime: '12:00' });
    expect((await mutate(d, plan, 'linkEvent', { noteId: saved.id, reminderDateISO: '2026-11-10' })).saved).toBe(true);
    const changed = await d.vault.getCarePlan(plan.id); expect(changed.steps[0].calendarNoteId).toBe(saved.id);
    const calendar = await d.vault.listPatientNotesInRange('2026-11-01', '2026-11-30T23:59:59.999Z');
    expect(calendar.filter(note => note.title === 'Fikcyjna konsultacja chirurgiczna')).toHaveLength(1);
    expect(calendar[0].id).toBe(saved.id); expect(calendar[0].dueTime).toBe('12:00');
    const another = await create(d, { title: 'Fikcyjny odrębny plan' }), before = await rawNotes(d);
    await rejected(mutate(d, another, 'linkEvent', { noteId: saved.id, reminderDateISO: DAY }));
    expect(await rawNotes(d)).toEqual(before);
  });

  it('does not add new work to a closed plan', async () => {
    const d = await device(), plan = await create(d);
    await mutate(d, plan, 'close', { reason: 'Cel osiągnięty', text: 'Fikcyjne podsumowanie.' });
    const closed = await d.vault.getCarePlan(plan.id), before = await rawNotes(d);
    await rejected(mutate(d, closed, 'addStep', { step: { title: 'Nie wolno dopisać do zamkniętego', kind: 'Badanie', state: 'pending', reminderDateISO: DAY } }));
    expect(await rawNotes(d)).toEqual(before);
  });

  it('reflects a calendar reschedule without moving the separate reminder date', async () => {
    const d = await device(), { plan } = await add(d, await create(d), { eventDateISO: '2026-11-03', reminderDateISO: '2026-11-01' });
    const step = plan.steps[0], calendar = await d.vault.getPatientNote(step.calendarNoteId);
    await d.vault.savePatientNote({ id: calendar.id, patientId: d.patientId, title: calendar.title, body: calendar.body,
      category: calendar.category, dueDateISO: '2026-11-08', dueTime: '09:30' });
    const changed = await d.vault.getCarePlan(plan.id);
    expect(changed.steps[0].eventDateISO).toBe('2026-11-08'); expect(changed.steps[0].eventTime).toBe('09:30');
    expect(changed.steps[0].reminderDateISO).toBe('2026-11-01');
  });

  it('keeps completion from the calendar coherent with the plan and its reminder', async () => {
    const d = await device(), { plan } = await add(d, await create(d), { eventDateISO: DAY });
    await d.vault.completePatientNote(plan.steps[0].calendarNoteId);
    const changed = await d.vault.getCarePlan(plan.id);
    expect(changed.status).toBe('active'); expect(changed.steps[0].state).toBe('done'); expect(changed.needsDecision).toBe(true);
    expect((await d.vault.getPatientNote(plan.steps[0].reminderNoteId)).completedAtISO).toBeTruthy();
    expect((await dueNotes(d)).map(note => note.id)).not.toContain(plan.steps[0].reminderNoteId);
  });

  it('rejects a stale generic calendar editor without overwriting the newer date or plan', async () => {
    const d = await device(), { plan } = await add(d, await create(d), { eventDateISO: '2026-11-03', eventTime: '10:30' });
    const calendar = await d.vault.getPatientNote(plan.steps[0].calendarNoteId);
    await d.vault.savePatientNote({ id: calendar.id, patientId: d.patientId, body: 'Fikcyjne nowsze ustalenia.', dueDateISO: '2026-11-08', baseRev: calendar.rev });
    const before = await rawNotes(d), current = await d.vault.getCarePlan(plan.id);
    expect(await d.vault.savePatientNote({ id: calendar.id, patientId: d.patientId, body: 'Fikcyjny nieaktualny opis.',
      dueDateISO: '2026-11-01', baseRev: calendar.rev })).toMatchObject({ conflict: true });
    expect(await rawNotes(d)).toEqual(before); expect(await d.vault.getCarePlan(plan.id)).toEqual(current);
    expect((await d.vault.getPatientNote(calendar.id)).dueDateISO).toContain('2026-11-08');
  });

  it('updates the plan atomically through the guarded existing-note calendar editor', async () => {
    const d = await device(), { plan } = await add(d, await create(d), { eventDateISO: '2026-11-03' });
    const calendar = await d.vault.getPatientNote(plan.steps[0].calendarNoteId);
    expect(await d.vault.updateExistingPatientNote({ id: calendar.id, patientId: d.patientId, baseRev: calendar.rev,
      dueDateISO: '2026-11-08', dueTime: '12:30', body: 'Fikcyjna poprawka przez edytor istniejącej notatki.' })).toMatchObject({ updated: true });
    const changed = await d.vault.getCarePlan(plan.id);
    expect(changed.steps[0]).toMatchObject({ eventDateISO: '2026-11-08', eventTime: '12:30', reminderDateISO: DAY });
    expect((await d.vault.getPatientNote(calendar.id)).body).toContain('Fikcyjna poprawka przez edytor istniejącej notatki.');
  });

  it('unlinks a guarded calendar deletion and rejects a later stale request', async () => {
    const d = await device(), { plan } = await add(d, await create(d), { eventDateISO: '2026-11-03' });
    const calendar = await d.vault.getPatientNote(plan.steps[0].calendarNoteId);
    expect(await d.vault.removeExistingPatientNote({ id: calendar.id, patientId: d.patientId, baseRev: calendar.rev })).toMatchObject({ removed: true });
    const changed = await d.vault.getCarePlan(plan.id);
    expect(changed.steps[0]).toMatchObject({ state: 'pending', reminderNoteId: plan.steps[0].reminderNoteId, calendarNoteId: null, eventDateISO: null });
    expect(await d.vault.getPatientNote(calendar.id)).toBeNull(); const before = await rawNotes(d);
    expect(await d.vault.removeExistingPatientNote({ id: calendar.id, patientId: d.patientId, baseRev: calendar.rev })).toMatchObject({ removed: false });
    expect(await rawNotes(d)).toEqual(before);
  });

  it('does not delete a calendar record changed between the existing-note guard and care deletion', async () => {
    const d = await device(), { plan } = await add(d, await create(d), { eventDateISO: '2026-11-03' });
    const calendar = await d.vault.getPatientNote(plan.steps[0].calendarNoteId), get = d.adapter.getPatientNoteForUser;
    let injected = false;
    d.adapter.getPatientNoteForUser = async (user, noteId) => {
      const stored = await get(user, noteId);
      if (!injected && noteId === calendar.id) { injected = true; await d.adapter.putPatientNoteForUser(user, { ...stored, rev: stored.rev + 1 }); }
      return stored;
    };
    let result = null;
    try { result = await d.vault.removeExistingPatientNote({ id: calendar.id, patientId: d.patientId, baseRev: calendar.rev }); }
    catch (error) { expect(error).toBeInstanceOf(Error); }
    if (result) expect(result.removed).not.toBe(true);
    expect(await d.vault.getPatientNote(calendar.id)).not.toBeNull();
    expect((await d.vault.getCarePlan(plan.id)).steps[0].calendarNoteId).toBe(calendar.id);
  });

  it('unlinks a removed calendar event atomically while retaining the open step and separate reminder', async () => {
    const d = await device(), { plan } = await add(d, await create(d), { eventDateISO: '2026-11-03' });
    const step = plan.steps[0];
    await d.vault.removePatientNote(step.calendarNoteId);
    const changed = await d.vault.getCarePlan(plan.id), currentStep = changed.steps.find(item => item.id === step.id);
    expect(currentStep).toMatchObject({ state: 'pending', reminderDateISO: DAY, reminderNoteId: step.reminderNoteId,
      calendarNoteId: null, eventDateISO: null });
    expect(changed.log.length).toBeGreaterThan(plan.log.length); expect(await d.vault.getPatientNote(step.calendarNoteId)).toBeNull();
    expect((await dueNotes(d)).map(note => note.id)).toContain(step.reminderNoteId);
    expect((await d.vault.listPatientNotesInRange('2026-11-01', '2026-11-30T23:59:59.999Z')).map(note => note.id)).not.toContain(step.calendarNoteId);
  });

  it('retains the calendar event, reminder and plan when atomic calendar removal fails', async () => {
    const d = await device(), { plan } = await add(d, await create(d), { eventDateISO: '2026-11-03' });
    const before = await rawNotes(d);
    d.adapter.commitCarePlanForUser = async () => { throw Error('FICTIONAL_REMOVE_EVENT_FAILURE'); };
    await expect(d.vault.removePatientNote(plan.steps[0].calendarNoteId)).rejects.toThrow('FICTIONAL_REMOVE_EVENT_FAILURE');
    expect(await rawNotes(d)).toEqual(before); expect(await d.vault.getCarePlan(plan.id)).toEqual(plan);
  });

  it('preserves encrypted linkage through an ordinary body edit without duplicating an event', async () => {
    const d = await device(), { plan } = await add(d, await create(d), { eventDateISO: '2026-11-03' });
    const before = await d.vault.getPatientNote(plan.steps[0].calendarNoteId);
    await d.vault.savePatientNote({ id: before.id, patientId: d.patientId, body: before.body + '\nFikcyjny dopisek z Terminarza.' });
    const after = await d.vault.getPatientNote(before.id);
    expect(after.careContext).toMatchObject({ planId: plan.id, role: 'calendar' }); expect(after.body).toContain('Fikcyjny dopisek z Terminarza.');
    expect((await d.vault.getCarePlan(plan.id)).steps).toHaveLength(1);
  });

  it('rejects a stale plan editor without overwriting newer work or creating children', async () => {
    const d = await device(), plan = await create(d);
    await add(d, plan, { title: 'Nowszy fikcyjny krok' }); const before = await rawNotes(d);
    const result = await mutate(d, plan, 'addStep', { step: { title: 'Przestarzały krok', kind: 'Badanie', state: 'pending', reminderDateISO: DAY } });
    expect(result).toMatchObject({ saved: false, conflict: true }); expect(await rawNotes(d)).toEqual(before);
  });

  it('rolls back parent, result and next step when the atomic commit fails', async () => {
    const d = await device(), { plan, stepId } = await add(d, await create(d), { state: 'waiting', kind: 'Oczekujący wynik' });
    const before = await rawNotes(d); d.adapter.commitCarePlanForUser = async () => { throw Error('FICTIONAL_CARE_DISK_FAILURE'); };
    await expect(mutate(d, plan, 'result', { stepId, dateISO: DAY, text: 'Fikcyjny wynik.', continuation: 'next',
      next: { title: 'Fikcyjna kontrola', kind: 'Kontrola', state: 'pending', reminderDateISO: '2027-04-29', eventDateISO: '2027-04-29' } })).rejects.toThrow('FICTIONAL_CARE_DISK_FAILURE');
    expect(await rawNotes(d)).toEqual(before);
  });

  it('rechecks the parent revision inside the atomic transaction after preparation', async () => {
    const d = await device(), plan = await create(d), count = (await rawNotes(d)).length, commit = d.adapter.commitCarePlanForUser;
    d.adapter.commitCarePlanForUser = async (user, change) => {
      const stored = await d.adapter.getPatientNoteForUser(user, plan.id);
      await d.adapter.putPatientNoteForUser(user, { ...stored, rev: stored.rev + 1 }); return commit(user, change);
    };
    const result = await mutate(d, plan, 'addNote', { text: 'Fikcyjna utracona edycja', dateISO: DAY });
    expect(result).toMatchObject({ saved: false, conflict: true });
    expect(await rawNotes(d)).toHaveLength(count);
    expect((await d.vault.getCarePlan(plan.id)).log).toEqual(plan.log);
  });

  it('rechecks a linked calendar revision instead of overwriting a concurrent calendar edit', async () => {
    const d = await device(), { plan, stepId } = await add(d, await create(d), { eventDateISO: DAY });
    const eventId = plan.steps[0].calendarNoteId, commit = d.adapter.commitCarePlanForUser;
    d.adapter.commitCarePlanForUser = async (user, change) => {
      const raw = await d.adapter.getPatientNoteForUser(user, eventId);
      await d.adapter.putPatientNoteForUser(user, { ...raw, rev: raw.rev + 1 }); return commit(user, change);
    };
    const result = await mutate(d, plan, 'complete', { stepId, dateISO: DAY, text: 'Fikcyjne wykonanie.', continuation: 'later', decisionDateISO: DAY });
    expect(result).toMatchObject({ saved: false, conflict: true });
    expect((await d.vault.getPatientNote(plan.steps[0].reminderNoteId)).completedAtISO).toBeNull();
    expect((await d.vault.getCarePlan(plan.id)).steps[0].state).toBe('pending');
  });

  it('does not resurrect a plan deleted after encryption but before commit', async () => {
    const d = await device(), plan = await create(d), before = await rawNotes(d), commit = d.adapter.commitCarePlanForUser;
    d.adapter.commitCarePlanForUser = async (user, change) => {
      await d.adapter.putPatientNoteTombstoneForUser(user, { id: plan.id, deletedAtISO: new Date().toISOString(), rev: plan.rev + 1 }); return commit(user, change);
    };
    expect(await mutate(d, plan, 'addNote', { text: 'Fikcyjny wpis po usunięciu', dateISO: DAY })).toMatchObject({ saved: false });
    expect(await rawNotes(d)).toEqual(before);
  });

  it('does not create orphan notes when the patient is deleted before the atomic commit', async () => {
    const d = await device(), plan = await create(d), before = await rawNotes(d), commit = d.adapter.commitCarePlanForUser;
    d.adapter.commitCarePlanForUser = async (user, change) => {
      await d.adapter.putTombstoneForUser(user, { patientId: d.patientId, deletedAtISO: new Date().toISOString() }); return commit(user, change);
    };
    expect(await mutate(d, plan, 'addNote', { text: 'Fikcyjny wpis po usunięciu pacjenta', dateISO: DAY })).toMatchObject({ saved: false });
    expect(await rawNotes(d)).toEqual(before);
  });

  it('revalidates the session inside commit so a lock creates no partial data', async () => {
    const d = await device(), plan = await create(d), before = await rawNotes(d), commit = d.adapter.commitCarePlanForUser;
    d.adapter.commitCarePlanForUser = async (user, change) => { d.vault.lock('manual'); return commit(user, change); };
    await expect(mutate(d, plan, 'addNote', { text: 'Fikcyjna zmiana przy blokadzie.', dateISO: DAY })).rejects.toThrow();
    expect(await rawNotes(d)).toEqual(before);
  });

  it.each(['write', 'delete', 'native-outcome'])('rejects a session lock during the linked %s plan read without partial changes', async action => {
    const d = await device(), { plan } = await add(d, await create(d), { eventDateISO: '2026-11-03' });
    const reminder = await d.vault.getPatientNote(plan.steps[0].reminderNoteId), before = await rawNotes(d), get = d.adapter.getPatientNoteForUser;
    let injected = false;
    d.adapter.getPatientNoteForUser = async (user, noteId) => {
      const stored = await get(user, noteId);
      if (!injected && noteId === plan.id) { injected = true; d.vault.lock('manual'); }
      return stored;
    };
    const write = action === 'write'
      ? d.vault.savePatientNote({ id: plan.steps[0].calendarNoteId, patientId: d.patientId, dueDateISO: '2026-11-08' })
      : action === 'delete' ? d.vault.removePatientNote(plan.steps[0].calendarNoteId)
        : d.vault.saveReminderOutcome({ id: reminder.id, patientId: d.patientId, baseRev: reminder.rev,
          operationId: operation(), action: 'complete', dateISO: DAY, text: 'Fikcyjny zapis w przerwanej sesji.' });
    await expect(write).rejects.toThrow(); expect(injected).toBe(true); expect(d.vault.isUnlocked()).toBe(false);
    expect(await rawNotes(d)).toEqual(before);
  });

  it('acknowledges an identical retry without changing revisions or duplicating records, but rejects changed content', async () => {
    const d = await device(), plan = await create(d), input = { planId: plan.id, patientId: d.patientId, baseRev: plan.rev,
      operationId: operation(), action: 'addStep', step: { title: 'Fikcyjna kontrola', kind: 'Kontrola', state: 'pending', reminderDateISO: '2027-04-29' } };
    const first = await d.vault.mutateCarePlan(input), before = await rawNotes(d);
    expect(first.saved).toBe(true);
    expect(await d.vault.mutateCarePlan(input)).toMatchObject({ saved: true, reused: true }); expect(await rawNotes(d)).toEqual(before);
    expect(await d.vault.mutateCarePlan({ ...input, step: { ...input.step, title: 'Fikcyjna inna treść' } })).toMatchObject({ saved: false, conflict: true });
    expect(await rawNotes(d)).toEqual(before);
  });

  it('makes plan creation itself idempotent after a lost acknowledgement', async () => {
    const d = await device(), input = { patientId: d.patientId, operationId: operation(), action: 'create', title: 'Fikcyjny plan bez duplikatu', goal: '' };
    const first = await d.vault.mutateCarePlan(input), before = await rawNotes(d), second = await d.vault.mutateCarePlan(input);
    expect(first.saved).toBe(true); expect(second).toMatchObject({ saved: true, reused: true, planId: first.planId });
    expect(await rawNotes(d)).toEqual(before); expect(await d.vault.listCarePlans({ patientId: d.patientId })).toHaveLength(1);
  });

  it('keeps plan content, step references and results encrypted at rest', async () => {
    const d = await device(), { plan, stepId } = await add(d, await create(d), { state: 'waiting', kind: 'Oczekujący wynik' });
    await mutate(d, plan, 'result', { stepId, dateISO: DAY, text: 'Tajny fikcyjny opis biopsji do testu szyfrowania.', continuation: 'later', decisionDateISO: DAY });
    const serialized = JSON.stringify(await rawNotes(d));
    for (const content of ['Tajny fikcyjny opis', 'Fikcyjna diagnostyka biopsji', 'Fikcyjne ustalenia lekarza.', 'careContext', 'needsDecision', 'reminderNoteId']) expect(serialized).not.toContain(content);
  });

  it('round-trips plans and linked records through synchronization without losing parallel work', async () => {
    const a = await device(); let { plan } = await add(a, await create(a), { eventDateISO: '2026-11-03' });
    plan = (await add(a, plan, { title: 'Fikcyjny drugi równoległy krok', reminderDateISO: '2026-11-09' })).plan;
    const b = await device(); await b.vault.mergeSyncPayload(await a.vault.exportSyncPayload());
    const imported = await b.vault.getCarePlan(plan.id);
    expect(imported).toMatchObject({ id: plan.id, patientId: a.patientId, title: plan.title, status: 'active', steps: plan.steps });
    expect((await b.vault.getPatientNote(plan.steps[0].calendarNoteId)).careContext.planId).toBe(plan.id);
  });

  it('retains both offline parallel additions and their logs on two devices, and repeated sync creates no extra revisions', async () => {
    const { a, b, plan, other } = await fork();
    const left = await add(a, plan, { title: 'Fikcyjna hospitalizacja dodana offline na A', reminderDateISO: '2026-11-09' });
    const right = await add(b, other, { title: 'Fikcyjny MR dodany offline na B', reminderDateISO: '2026-11-12' });
    const payloadA = await a.vault.exportSyncPayload(), payloadB = await b.vault.exportSyncPayload();
    await a.vault.mergeSyncPayload(payloadB); await b.vault.mergeSyncPayload(payloadA);
    const expected = [plan.steps[0].id, left.stepId, right.stepId].sort();
    for (const d of [a, b]) {
      const merged = await d.vault.getCarePlan(plan.id);
      expect(merged.steps.map(step => step.id).sort()).toEqual(expected); expect(merged.syncNeedsReview).toBe(true);
      expect(merged.log.some(entry => entry.text.includes('hospitalizacja dodana offline na A'))).toBe(true);
      expect(merged.log.some(entry => entry.text.includes('MR dodany offline na B'))).toBe(true);
    }
    const before = await a.vault.getCarePlan(plan.id);
    await a.vault.mergeSyncPayload(payloadB);
    expect(await a.vault.getCarePlan(plan.id)).toEqual(before);
    await b.vault.mergeSyncPayload(await a.vault.exportSyncPayload());
    const convergedB = await b.vault.getCarePlan(plan.id);
    await b.vault.mergeSyncPayload(await a.vault.exportSyncPayload());
    expect(await b.vault.getCarePlan(plan.id)).toEqual(convergedB);
    expect(convergedB.steps.map(step => step.id).sort()).toEqual(expected);
  });

  it('does not request conflict review for an identical plan or a normal descendant update', async () => {
    const { a, b, plan } = await fork();
    expect((await b.vault.getCarePlan(plan.id)).syncNeedsReview).toBe(false);
    const initial = await b.vault.getCarePlan(plan.id); await b.vault.mergeSyncPayload(await a.vault.exportSyncPayload());
    expect(await b.vault.getCarePlan(plan.id)).toEqual(initial);
    const next = await add(a, plan, { title: 'Fikcyjny kolejny krok jednej gałęzi', reminderDateISO: '2026-11-16' });
    await b.vault.mergeSyncPayload(await a.vault.exportSyncPayload());
    const imported = await b.vault.getCarePlan(plan.id);
    expect(imported.syncNeedsReview).toBe(false); expect(imported.steps.map(step => step.id).sort()).toEqual(next.plan.steps.map(step => step.id).sort());
    expect(imported.log).toEqual(next.plan.log);
  });

  it('shows a merged decision whose stale helper has no date and clears it after review only when open steps remain', async () => {
    const { a, b, plan, other } = await fork();
    await add(a, plan, { title: 'Fikcyjny przyszły krok A', reminderDateISO: '2026-11-09' });
    await add(b, other, { title: 'Fikcyjny przyszły krok B', reminderDateISO: '2026-11-12' });
    await a.vault.mergeSyncPayload(await b.vault.exportSyncPayload());
    let parent = await a.vault.getPatientNote(plan.id); parent.careContext.decisionDueDateISO = DAY;
    await a.vault.savePatientNote({ id: plan.id, patientId: plan.patientId, careContext: parent.careContext });
    const decisionId = 'care-decision-' + plan.id, stale = await a.adapter.getPatientNoteForUser(a.userId, decisionId);
    await a.adapter.putPatientNoteForUser(a.userId, { ...stale, dueDateISO: null, completedAtISO: '2026-10-28T12:00:00.000Z' });
    const before = await rawNotes(a), decisions = (await dueNotes(a)).filter(note => note.careContext?.role === 'decision');
    expect(decisions).toHaveLength(1); expect(decisions[0]).toMatchObject({ id: decisionId, dueDateISO: DAY + 'T00:00:00.000Z', completedAtISO: null });
    expect(await rawNotes(a)).toEqual(before);
    expect((await mutate(a, await a.vault.getCarePlan(plan.id), 'acknowledgeMerge', { text: 'Fikcyjny przegląd przyszłych kroków.' })).saved).toBe(true);
    expect((await a.vault.getCarePlan(plan.id)).needsDecision).toBe(false);
    expect((await dueNotes(a)).filter(note => note.careContext?.role === 'decision')).toEqual([]);

    const resolved = await fork();
    await mutate(resolved.a, resolved.plan, 'complete', { stepId: resolved.stepId, dateISO: DAY, text: 'Fikcyjne wykonanie A.', continuation: 'later', decisionDateISO: DAY });
    await mutate(resolved.b, resolved.other, 'complete', { stepId: resolved.stepId, dateISO: DAY, text: 'Fikcyjne wykonanie B.', continuation: 'later', decisionDateISO: DAY });
    await resolved.a.vault.mergeSyncPayload(await resolved.b.vault.exportSyncPayload());
    const completePlan = await resolved.a.vault.getCarePlan(resolved.plan.id); expect(completePlan.syncNeedsReview).toBe(true);
    expect((await mutate(resolved.a, completePlan, 'acknowledgeMerge', { text: 'Fikcyjny przegląd zakończonych kroków.' })).saved).toBe(true);
    expect((await resolved.a.vault.getCarePlan(resolved.plan.id)).needsDecision).toBe(true);
    expect((await dueNotes(resolved.a, '9999-12-31')).some(note => note.careContext?.role === 'decision')).toBe(true);
  });

  it('retains both conflicting plan titles and goals and preserves a one-sided metadata edit alongside an unrelated new step', async () => {
    const { a, b, plan, other } = await fork();
    const titleA = 'Fikcyjna zmieniona nazwa planu A', titleB = 'Fikcyjna zmieniona nazwa planu B';
    const goalA = 'Fikcyjny pełny cel ustalony offline na urządzeniu A.', goalB = 'Fikcyjny inny pełny cel ustalony offline na urządzeniu B.';
    await mutate(a, plan, 'edit', { title: titleA, goal: goalA }); await mutate(b, other, 'edit', { title: titleB, goal: goalB });
    const payloadA = await a.vault.exportSyncPayload(), payloadB = await b.vault.exportSyncPayload();
    await a.vault.mergeSyncPayload(payloadB); await b.vault.mergeSyncPayload(payloadA);
    for (const d of [a, b]) {
      const merged = await d.vault.getCarePlan(plan.id), text = JSON.stringify(merged);
      expect(merged.syncNeedsReview).toBe(true);
      for (const value of [titleA, titleB, goalA, goalB]) expect(text).toContain(value);
    }
    const independent = await fork();
    await mutate(independent.a, independent.plan, 'edit', { title: titleA, goal: goalA });
    const added = await add(independent.b, independent.other, { title: 'Fikcyjny niezależny dodatkowy krok', reminderDateISO: '2026-11-16' });
    const editPayload = await independent.a.vault.exportSyncPayload(), stepPayload = await independent.b.vault.exportSyncPayload();
    await independent.a.vault.mergeSyncPayload(stepPayload); await independent.b.vault.mergeSyncPayload(editPayload);
    for (const d of [independent.a, independent.b]) {
      const merged = await d.vault.getCarePlan(independent.plan.id);
      expect(merged).toMatchObject({ title: titleA, goal: goalA, syncNeedsReview: true });
      expect(merged.steps.some(step => step.id === added.stepId)).toBe(true);
    }
  });

  it('retains completion documentation and the competing edit of the same step for explicit sync review', async () => {
    const { a, b, plan, other, stepId } = await fork();
    const completion = 'Fikcyjne potwierdzenie wykonania zapisane offline na A.';
    const edit = 'Fikcyjne zmienione ustalenia zapisane offline na B.';
    expect((await mutate(a, plan, 'complete', { stepId, text: completion, dateISO: DAY,
      continuation: 'later', decisionDateISO: '2026-11-04' })).saved).toBe(true);
    expect((await mutate(b, other, 'editStep', { stepId, step: { title: 'Fikcyjny zmieniony bazowy krok', kind: 'Badanie',
      state: 'pending', reminderDateISO: '2026-11-07', description: edit } })).saved).toBe(true);
    const payloadA = await a.vault.exportSyncPayload(), payloadB = await b.vault.exportSyncPayload();
    await a.vault.mergeSyncPayload(payloadB); await b.vault.mergeSyncPayload(payloadA);
    for (const d of [a, b]) {
      const merged = await d.vault.getCarePlan(plan.id), notes = await d.vault.listPatientNotesForPatient(plan.patientId);
      expect(merged.syncNeedsReview).toBe(true); expect(merged.status).toBe('active');
      expect(merged.steps.filter(step => step.id === stepId)).toHaveLength(1);
      expect(merged.log.some(entry => entry.text.includes('Zapisano wykonanie'))).toBe(true);
      expect(merged.log.some(entry => entry.text.includes('Zmieniono krok'))).toBe(true);
      expect(notes.some(note => note.body.includes(completion))).toBe(true);
      expect(JSON.stringify(merged).includes(edit) || notes.some(note => note.body.includes(edit))).toBe(true);
    }
  });

  it('converges exact-clock conflicting workflow snapshots and reconciles calendar and helpers after explicit review', async () => {
    const { a, b, plan } = await fork();
    const base = (await add(a, plan, { title: 'Fikcyjny wspólny krok z terminem', eventDateISO: '2026-11-03', eventTime: '09:00' })).plan;
    await b.vault.mergeSyncPayload(await a.vault.exportSyncPayload());
    const other = await b.vault.getCarePlan(base.id), step = base.steps[base.steps.length - 1];
    const completeText = 'Fikcyjne potwierdzenie wykonania na urządzeniu A.';
    const editText = 'Fikcyjna alternatywna zmiana na urządzeniu B.';
    await mutate(a, base, 'complete', { stepId: step.id, text: completeText, dateISO: DAY,
      continuation: 'later', decisionDateISO: '2026-11-05' });
    await mutate(b, other, 'editStep', { stepId: step.id, step: { title: 'Fikcyjny zmieniony krok B',
      kind: 'Badanie', state: 'pending', reminderDateISO: '2026-11-08', eventDateISO: '2026-11-09',
      eventTime: '11:15', description: editText } });
    const instant = '2026-10-29T13:00:00.000Z', RealDate = globalThis.Date;
    for (const d of [a, b]) {
      const record = await d.adapter.getPatientNoteForUser(d.userId, base.id);
      await d.adapter.putPatientNoteForUser(d.userId, { ...record, updatedAtISO: instant });
    }
    globalThis.Date = class FixedCareDate extends RealDate {
      constructor(...args) { super(...(args.length ? args : [instant])); }
      static now() { return RealDate.parse(instant); }
    };
    try {
      for (let round = 0; round < 3; round += 1) {
        const payloadA = await a.vault.exportSyncPayload(), payloadB = await b.vault.exportSyncPayload();
        await a.vault.mergeSyncPayload(payloadB); await b.vault.mergeSyncPayload(payloadA);
        const currentA = await a.vault.getCarePlan(base.id), currentB = await b.vault.getCarePlan(base.id);
        expect(currentA.syncNeedsReview).toBe(true); expect(currentB.syncNeedsReview).toBe(true);
        expect(currentA.steps).toEqual(currentB.steps); expect(currentA.log).toEqual(currentB.log);
        expect(JSON.stringify(currentA)).toContain(completeText); expect(JSON.stringify(currentA)).toContain(editText);
        expect(currentA.rev).toBe(currentB.rev); expect(currentA.updatedAtISO).toBe(currentB.updatedAtISO);
      }
      const before = await a.vault.getCarePlan(base.id);
      const reviewed = await mutate(a, before, 'acknowledgeMerge', { text: 'Fikcyjny świadomy przegląd obu wersji.' });
      expect(reviewed.saved).toBe(true); expect(reviewed.plan.syncNeedsReview).toBe(false);
      await b.vault.mergeSyncPayload(await a.vault.exportSyncPayload());
      await a.vault.mergeSyncPayload(await b.vault.exportSyncPayload());
      const canonical = await a.vault.getCarePlan(base.id), target = canonical.steps.find(item => item.id === step.id);
      expect((await b.vault.getCarePlan(base.id)).steps).toEqual(canonical.steps);
      for (const d of [a, b]) {
        const calendar = await d.vault.getPatientNote(target.calendarNoteId);
        const reminder = await d.vault.getPatientNote(target.reminderNoteId);
        expect(calendar.dueDateISO.slice(0, 10)).toBe(target.eventDateISO); expect(calendar.dueTime).toBe(target.eventTime);
        expect(calendar.completedAtISO ? 'done' : 'pending').toBe(target.state);
        expect(reminder.title).toBe(target.title); expect(reminder.careContext.state).toBe(target.state);
        expect(reminder.dueDateISO.slice(0, 10)).toBe(target.reminderDateISO);
        expect(reminder.completedAtISO ? 'done' : 'pending').toBe(target.state);
      }
    } finally { globalThis.Date = RealDate; }
  });

  it('reopens a concurrently closed plan with new offline work and requires acknowledgement before closure', async () => {
    const { a, b, plan, other } = await fork();
    expect((await mutate(a, plan, 'close', { reason: 'Przekazano opiekę', text: 'Fikcyjne zamknięcie offline na A.', cancelOpen: true })).saved).toBe(true);
    const addition = await add(b, other, { title: 'Fikcyjny nowy krok offline na B', reminderDateISO: '2026-11-16' });
    const payloadA = await a.vault.exportSyncPayload(), payloadB = await b.vault.exportSyncPayload();
    await a.vault.mergeSyncPayload(payloadB); await b.vault.mergeSyncPayload(payloadA);
    for (const d of [a, b]) {
      const merged = await d.vault.getCarePlan(plan.id);
      expect(merged).toMatchObject({ status: 'active', needsDecision: true, syncNeedsReview: true });
      expect(merged.steps.some(step => step.id === addition.stepId && step.state === 'pending')).toBe(true);
      expect(merged.log.some(entry => entry.text.includes('Zamknięto plan'))).toBe(true);
    }
    const merged = await a.vault.getCarePlan(plan.id), before = await rawNotes(a);
    await rejected(mutate(a, merged, 'close', { reason: 'Cel osiągnięty', text: 'Fikcyjna próba przed przeglądem.', cancelOpen: true }));
    expect(await rawNotes(a)).toEqual(before);
    const text = 'Fikcyjna adnotacja lekarza po przejrzeniu scalonych zmian.';
    expect((await mutate(a, merged, 'acknowledgeMerge', { text })).saved).toBe(true);
    const reviewed = await a.vault.getCarePlan(plan.id);
    expect(reviewed.syncNeedsReview).toBe(false); expect(reviewed.log.some(entry => entry.text.includes(text))).toBe(true);
    expect((await a.vault.listPatientNotesForPatient(plan.patientId)).some(note => note.body.includes(text))).toBe(true);
    expect((await mutate(a, reviewed, 'close', { reason: 'Cel osiągnięty', text: 'Fikcyjne zamknięcie po przeglądzie.', cancelOpen: true })).saved).toBe(true);
    expect((await a.vault.getCarePlan(plan.id)).status).toBe('closed');
  });

  it('round-trips a patient export/import with stable plan and step references', async () => {
    const a = await device(), { plan, stepId } = await add(a, await create(a), { state: 'waiting', kind: 'Oczekujący wynik' });
    await mutate(a, plan, 'result', { stepId, dateISO: DAY, text: 'Fikcyjny opis do eksportu.', continuation: 'next',
      next: { title: 'Fikcyjna kontrola po imporcie', kind: 'Kontrola', state: 'pending', reminderDateISO: '2027-04-29', eventDateISO: '2027-04-29' } });
    const before = await a.vault.getCarePlan(plan.id), envelope = await a.vault.exportPatientEnvelope(a.patientId), b = await device();
    const imported = await b.vault.importPatientFromEnvelope(envelope, a.password), after = await b.vault.getCarePlan(plan.id);
    expect(after.patientId).toBe(imported.patientId); expect(after.steps).toEqual(before.steps); expect(after.log).toEqual(before.log);
    expect((await b.vault.getPatientNote(after.steps[0].resultNoteId)).body).toContain('Fikcyjny opis do eksportu.');
  });

  it('restores the same encrypted plan and its calendar links from a whole-account backup', async () => {
    const a = await device(), { plan } = await add(a, await create(a), { eventDateISO: '2026-11-03', eventTime: '10:30' });
    const before = await a.vault.getCarePlan(plan.id), envelope = await a.vault.exportVaultBackup(), b = await device();
    const restored = await b.vault.restoreVaultBackup(envelope, a.password, { label: 'Fikcyjna odtworzona kopia Planów' });
    expect(restored.patientCount).toBeGreaterThan(0);
    const after = await b.vault.getCarePlan(plan.id);
    expect(after.steps).toEqual(before.steps); expect(after.log).toEqual(before.log); expect(after.patientId).toBe(a.patientId);
    expect((await b.vault.getPatientNote(after.steps[0].calendarNoteId)).careContext).toMatchObject({ planId: plan.id, role: 'calendar' });
  });

  it('does not permit a request for another patient to mutate or relink an existing plan', async () => {
    const d = await device(), plan = await create(d);
    const other = await d.vault.savePatient({ name: 'Fikcyjny inny pacjent', user: { sex: 'M', age: 10, height: 138, weight: 34 } });
    const before = await rawNotes(d);
    await rejected(mutate(d, plan, 'addNote', { patientId: other.patientId, text: 'Fikcyjny wpis do niewłaściwej karty.', dateISO: DAY }));
    expect(await rawNotes(d)).toEqual(before); expect((await d.vault.getCarePlan(plan.id)).patientId).toBe(d.patientId);
  });

  it('rejects an invalid calendar date before creating a reminder, event or changed aggregate', async () => {
    const d = await device(), plan = await create(d), before = await rawNotes(d);
    await rejected(mutate(d, plan, 'addStep', { step: { title: 'Fikcyjny niepoprawny termin', kind: 'Badanie', state: 'pending',
      reminderDateISO: DAY, eventDateISO: '2026-02-31' } }));
    expect(await rawNotes(d)).toEqual(before);
  });

  it('rejects an invalid edited reminder date instead of silently removing the previous reminder', async () => {
    const d = await device(), { plan, stepId } = await add(d, await create(d)), before = await rawNotes(d);
    await rejected(mutate(d, plan, 'editStep', { stepId, step: { title: plan.steps[0].title, kind: 'Badanie', state: 'pending',
      reminderDateISO: '2026-02-31', description: plan.steps[0].description } }));
    expect(await rawNotes(d)).toEqual(before); expect((await d.vault.getCarePlan(plan.id)).steps[0].reminderDateISO).toBe(DAY);
  });

  it('rejects an oversized step description instead of silently truncating a clinical narrative', async () => {
    const d = await device(), plan = await create(d), before = await rawNotes(d);
    await rejected(mutate(d, plan, 'addStep', { step: { title: 'Fikcyjny krok', kind: 'Badanie', state: 'pending',
      reminderDateISO: DAY, description: 'x'.repeat(20001) } }));
    expect(await rawNotes(d)).toEqual(before);
  });

  it('rejects an oversized written result without completing the step or creating a truncated result', async () => {
    const d = await device(), { plan, stepId } = await add(d, await create(d), { state: 'waiting', kind: 'Oczekujący wynik' });
    const before = await rawNotes(d);
    await rejected(mutate(d, plan, 'result', { stepId, text: 'x'.repeat(20001), dateISO: DAY,
      continuation: 'later', decisionDateISO: DAY }));
    expect(await rawNotes(d)).toEqual(before); expect((await d.vault.getCarePlan(plan.id)).steps[0].state).toBe('waiting');
  });

  it('rejects completion plus a new step at the step limit without leaving a result or orphan child', async () => {
    const d = await device(), { plan, stepId } = await add(d, await create(d), { state: 'waiting', kind: 'Oczekujący wynik' });
    const record = await d.vault.getPatientNote(plan.id), context = record.careContext;
    context.steps = context.steps.concat(Array.from({ length: 499 }, (_, index) => ({ id: 'fictional-limit-' + index,
      title: 'Fikcyjny zakończony krok ' + index, kind: 'Badanie', state: 'done', completedDateISO: DAY,
      reminderDateISO: null, eventDateISO: null })));
    await d.vault.savePatientNote({ id: plan.id, patientId: d.patientId, careContext: context });
    const full = await d.vault.getCarePlan(plan.id), before = await rawNotes(d); expect(full.steps).toHaveLength(500);
    await rejected(mutate(d, full, 'result', { stepId, dateISO: DAY, text: 'Fikcyjny wynik przy limicie.', continuation: 'next',
      next: { title: 'Fikcyjny następny krok', kind: 'Kontrola', state: 'pending', reminderDateISO: '2027-04-29' } }));
    expect(await rawNotes(d)).toEqual(before); expect((await d.vault.getCarePlan(plan.id)).steps[0].state).toBe('waiting');
  });

  it('allows explicit closure near the history limit and preserves the existing log', async () => {
    const d = await device(), { plan } = await add(d, await create(d));
    const record = await d.vault.getPatientNote(plan.id), context = record.careContext;
    context.log = Array.from({ length: 1990 }, (_, index) => ({ dateISO: DAY, text: 'Fikcyjny wpis historii ' + index }));
    await d.vault.savePatientNote({ id: plan.id, patientId: d.patientId, careContext: context });
    const full = await d.vault.getCarePlan(plan.id); expect(full.log).toHaveLength(1990);
    expect((await mutate(d, full, 'close', { reason: 'Cel osiągnięty', text: 'Fikcyjne podsumowanie przed rozpoczęciem kolejnego planu.', cancelOpen: true })).saved).toBe(true);
    const closed = await d.vault.getCarePlan(plan.id);
    expect(closed.status).toBe('closed'); expect(closed.log.length).toBeGreaterThan(1990);
    expect(closed.log.slice(0, 1990)).toEqual(full.log);
  });

  it('removes plans with their owning patient instead of leaving active orphan work', async () => {
    const d = await device(), { plan } = await add(d, await create(d), { eventDateISO: '2026-11-03' });
    await d.vault.removePatient(d.patientId);
    expect(await d.vault.listCarePlans({ patientId: d.patientId })).toEqual([]); expect(await d.vault.getCarePlan(plan.id)).toBeNull();
    expect((await rawNotes(d)).filter(note => note.patientId === d.patientId)).toEqual([]); expect(await dueNotes(d, '2027-12-31')).toEqual([]);
  });

  it('preserves known care metadata when a newer legacy sync record omits the extension', async () => {
    const d = await device(), { plan } = await add(d, await create(d), { eventDateISO: '2026-11-03' });
    const before = await d.vault.getPatientNote(plan.id), payload = await d.vault.exportSyncPayload();
    const incoming = payload.patientNotes.find(note => note.id === plan.id); delete incoming.careContext; incoming.rev += 1; incoming.body += '\nFikcyjny dopisek starego klienta.';
    await d.vault.mergeSyncPayload(payload);
    const changed = await d.vault.getPatientNote(plan.id); expect(changed.careContext).toEqual(before.careContext);
    expect(changed.body).toContain('Fikcyjny dopisek starego klienta.');
    expect((await d.vault.getCarePlan(plan.id)).steps).toEqual(plan.steps);
  });

  it('cannot replace a corrupt aggregate ciphertext with an empty fallback plan', async () => {
    const d = await device(), plan = await create(d), raw = await d.adapter.getPatientNoteForUser(d.userId, plan.id);
    const corrupt = { ...raw, bodyCipher: { ...raw.bodyCipher, data: 'AA==' } }; await d.adapter.putPatientNoteForUser(d.userId, corrupt);
    await rejected(mutate(d, plan, 'addNote', { text: 'Fikcyjny zapis po błędzie odczytu', dateISO: DAY }));
    expect(await d.adapter.getPatientNoteForUser(d.userId, plan.id)).toEqual(corrupt);
  });
});

// vilda_vault.js from release #829 (5620803e) was exercised against the same
// records: it keeps their versions, text and categories but drops careContext
// on import/export. Recreate that historical wire shape without shipping a
// second, obsolete copy of the vault in this suite.
async function legacyCarePair(encrypted = false) {
  const a = await device(), added = await add(a, await create(a), { eventDateISO: '2026-11-03' });
  await mutate(a, added.plan, 'addNote', { text: 'Fikcyjny opis ustaleń w planie.', dateISO: DAY });
  const payload = await a.vault.exportSyncPayload(), legacy = structuredClone(payload), b = await device();
  if (encrypted) {
    const code = await a.vault.exportSyncCode(a.password);
    b.vault.lock('manual'); await b.vault.importSyncCode(code, a.password, { label: 'Fikcyjny telefon po aktualizacji' });
    b.userId = b.vault.getCurrentUser().userId; b.password = a.password;
  }
  legacy.patientNotes.forEach(note => { delete note.careContext; });
  await b.vault.mergeSyncPayload(legacy);
  return { a, b, payload, planId: added.plan.id };
}
const careOnly = (payload, notes) => ({ ...payload, patients: [], patientNotes: notes });

describe('care sync recovery after an older client imported notes without the extension', () => {
  it('hydrates the aggregate and every linked role at the same version without changing clinical fields or creating revisions', async () => {
    const { b, payload, planId } = await legacyCarePair();
    expect(await b.vault.listCarePlans()).toEqual([]);
    const before = await rawNotes(b), beforePlain = new Map();
    for (const note of before) {
      const plain = await b.vault.decryptPayloadForCurrentUser(note.bodyCipher.iv, note.bodyCipher.data);
      // Unknown encrypted fields must also survive; rebuilding the public DTO
      // would silently remove them during this compatibility repair.
      plain.fictionalFutureField = { noteId: note.id, values: ['Fikcyjny zapis', 0, null] };
      await b.adapter.putPatientNoteForUser(b.userId, { ...note, bodyCipher: await b.vault.encryptPayloadForCurrentUser(plain) });
      beforePlain.set(note.id, plain);
    }
    const prepared = await rawNotes(b), changed = [];
    b.vault.onPatientNoteChanged(event => changed.push(event));
    expect(await b.vault.needsCarePlanSyncRepair()).toBe(true);
    expect(await rawNotes(b)).toEqual(prepared);
    await b.vault.mergeSyncPayload(payload);
    expect((await b.vault.getCarePlan(planId)).steps).toEqual(payload.patientNotes.find(note => note.id === planId).careContext.steps);
    expect((await b.vault.listCarePlans()).map(plan => plan.id)).toEqual([planId]);
    for (const expected of payload.patientNotes) {
      const stored = await b.adapter.getPatientNoteForUser(b.userId, expected.id);
      expect({ ...stored, bodyCipher: null }).toEqual({ ...prepared.find(note => note.id === expected.id), bodyCipher: null });
      expect(await b.vault.decryptPayloadForCurrentUser(stored.bodyCipher.iv, stored.bodyCipher.data))
        .toEqual({ ...beforePlain.get(expected.id), careContext: expected.careContext });
      expect(await b.vault.getPatientNote(expected.id)).toEqual(expected);
    }
    expect(changed.map(event => event.id).sort()).toEqual(payload.patientNotes.map(note => note.id).sort());
    expect(await b.vault.needsCarePlanSyncRepair()).toBe(false);
    const recovered = await rawNotes(b), eventCount = changed.length;
    await b.vault.mergeSyncPayload(payload);
    expect(await rawNotes(b)).toEqual(recovered); expect(changed).toHaveLength(eventCount);
  });

  it('also recovers through real encrypted per-note deltas, with arbitrary delivery order and idempotent repeats', async () => {
    const { a, b, payload, planId } = await legacyCarePair(true);
    const deltas = [];
    for (const note of [...payload.patientNotes].reverse()) deltas.push(await a.vault.buildNoteDelta(note.id));
    for (const delta of deltas) await b.vault.applyEncryptedDelta(delta);
    expect((await b.vault.getCarePlan(planId)).steps).toEqual((await a.vault.getCarePlan(planId)).steps);
    for (const note of payload.patientNotes) expect(await b.vault.getPatientNote(note.id)).toEqual(note);
    const before = await rawNotes(b);
    for (const delta of deltas) await b.vault.applyEncryptedDelta(delta);
    expect(await rawNotes(b)).toEqual(before);
  });

  it.each(['rev', 'updatedAtISO', 'patientId', 'body', 'clinicalDateISO', 'completedAtISO'])(
  'does not hydrate a tied-looking record with a different %s', async (field) => {
    const { b, payload, planId } = await legacyCarePair(), raw = await b.adapter.getPatientNoteForUser(b.userId, planId);
    const incoming = structuredClone(payload.patientNotes.find(note => note.id === planId));
    if (field === 'rev') incoming.rev -= 1;
    else if (field === 'updatedAtISO') incoming.updatedAtISO = '2000-01-01T00:00:00.000Z';
    else if (field === 'patientId') incoming.patientId = b.patientId;
    else if (field === 'body') incoming.body += '\nFikcyjna inna treść kliniczna.';
    else if (field === 'clinicalDateISO') incoming.clinicalDateISO = '2026-11-03';
    else incoming.completedAtISO = '2026-11-03T12:00:00.000Z';
    await b.vault.mergeSyncPayload(careOnly(payload, [incoming]));
    expect(await b.adapter.getPatientNoteForUser(b.userId, planId)).toEqual(raw);
    expect(await b.vault.getCarePlan(planId)).toBeNull();
  });

  it('does not replace a linked context that already exists, nor accept an invalid incoming extension', async () => {
    const { b, payload } = await legacyCarePair();
    const step = payload.patientNotes.find(note => note.careContext?.role === 'step');
    const raw = await b.adapter.getPatientNoteForUser(b.userId, step.id);
    const plain = await b.vault.decryptPayloadForCurrentUser(raw.bodyCipher.iv, raw.bodyCipher.data);
    const stored = { ...raw, bodyCipher: await b.vault.encryptPayloadForCurrentUser({ ...plain, careContext: { ...step.careContext, state: 'done' } }) };
    await b.adapter.putPatientNoteForUser(b.userId, stored);
    await b.vault.mergeSyncPayload(careOnly(payload, [step]));
    expect(await b.adapter.getPatientNoteForUser(b.userId, step.id)).toEqual(stored);
    const parent = payload.patientNotes.find(note => note.careContext?.role === 'plan'), before = await b.adapter.getPatientNoteForUser(b.userId, parent.id);
    await expect(b.vault.mergeSyncPayload(careOnly(payload, [{ ...parent, careContext: { ...parent.careContext, version: 2 } }])))
      .rejects.toMatchObject({ code: 'CARE_FORMAT_UNSUPPORTED', vildaMergeBusy: true });
    expect(await b.adapter.getPatientNoteForUser(b.userId, parent.id)).toEqual(before);
  });

  it('does not resurrect a locally deleted plan from an unchanged intact cloud record', async () => {
    const { b, payload, planId } = await legacyCarePair();
    await b.vault.removePatientNote(planId);
    const before = await b.adapter.listPatientNoteTombstonesForUser(b.userId);
    await b.vault.mergeSyncPayload(payload);
    expect(await b.vault.getCarePlan(planId)).toBeNull();
    expect(await b.adapter.getPatientNoteForUser(b.userId, planId)).toBeUndefined();
    expect(await b.adapter.listPatientNoteTombstonesForUser(b.userId)).toEqual(before);
  });

  it('leaves an existing explicit null extension untouched instead of treating it as absent legacy data', async () => {
    const { b, payload, planId } = await legacyCarePair(), raw = await b.adapter.getPatientNoteForUser(b.userId, planId);
    const plain = await b.vault.decryptPayloadForCurrentUser(raw.bodyCipher.iv, raw.bodyCipher.data);
    const stored = { ...raw, bodyCipher: await b.vault.encryptPayloadForCurrentUser({ ...plain, careContext: null }) };
    await b.adapter.putPatientNoteForUser(b.userId, stored);
    await b.vault.mergeSyncPayload(payload);
    expect(await b.adapter.getPatientNoteForUser(b.userId, planId)).toEqual(stored);
  });

  it('checks only aggregate care bodies and rejects a stale session while detecting a gap', async () => {
    const d = await device();
    const note = await d.vault.savePatientNote({ patientId: d.patientId, title: 'Fikcyjna zwykła notatka', body: 'Fikcyjna treść', category: 'observation' });
    const raw = await d.adapter.getPatientNoteForUser(d.userId, note.id);
    await d.adapter.putPatientNoteForUser(d.userId, { ...raw, bodyCipher: { ...raw.bodyCipher, data: 'AA==' } });
    expect(await d.vault.needsCarePlanSyncRepair()).toBe(false);
    await create(d); expect(await d.vault.needsCarePlanSyncRepair()).toBe(false);
    const original = d.adapter.listPatientNotesForUser; let release, enter;
    const entered = new Promise(resolve => { enter = resolve; });
    d.adapter.listPatientNotesForUser = async user => { const notes = await original(user); await new Promise(resolve => { release = resolve; enter(); }); return notes; };
    const pending = d.vault.needsCarePlanSyncRepair();
    await entered;
    d.vault.lock('manual'); release();
    await expect(pending).rejects.toThrow('Sesja zmieniła się');
    expect(await d.vault.needsCarePlanSyncRepair()).toBe(false);
  });

  it('does not report another adapter’s gap after storage changes while the old read is pending', async () => {
    const { b } = await legacyCarePair();
    const original = b.adapter.listPatientNotesForUser; let release, enter;
    const entered = new Promise(resolve => { enter = resolve; });
    b.adapter.listPatientNotesForUser = async user => { const notes = await original(user); await new Promise(resolve => { release = resolve; enter(); }); return notes; };
    const pending = b.vault.needsCarePlanSyncRepair();
    await entered;
    b.vault.setStorageAdapter(b.vault.createInMemoryAdapter()); release();
    await expect(pending).rejects.toThrow('Sesja zmieniła się');
  });

  it('rejects a corrupt aggregate instead of guessing a missing extension or modifying its ciphertext', async () => {
    const d = await device(), plan = await create(d), raw = await d.adapter.getPatientNoteForUser(d.userId, plan.id);
    const corrupt = { ...raw, bodyCipher: { ...raw.bodyCipher, data: 'AA==' } };
    await d.adapter.putPatientNoteForUser(d.userId, corrupt);
    await expect(d.vault.needsCarePlanSyncRepair()).rejects.toThrow();
    expect(await d.adapter.getPatientNoteForUser(d.userId, plan.id)).toEqual(corrupt);
  });
});

describe('care-plan flow repairs preserve independent calendar and clinical facts', () => {
  it('keeps waiting for a result through calendar completion, undo and no-show without receiving a result', async () => {
    const d = await device(), { plan, stepId } = await add(d, await create(d), { state: 'waiting', eventDateISO: DAY });
    const step = plan.steps[0];
    for (const action of ['completePatientNote', 'uncompletePatientNote', 'noShowPatientNote']) {
      await d.vault[action](step.calendarNoteId);
      const changed = await d.vault.getCarePlan(plan.id);
      expect(changed.steps.find(item => item.id === stepId)).toMatchObject({ state: 'waiting', completedDateISO: null, resultNoteId: null });
      expect(changed.needsDecision).toBe(false);
      expect((await dueNotes(d)).some(note => note.id === step.reminderNoteId)).toBe(true);
      expect((await d.vault.listPatientNotesForPatient(d.patientId)).filter(note => note.careContext?.role === 'result')).toHaveLength(0);
    }
  });

  it.each(['result', 'complete'])('preserves the recorded %s and its date through every calendar status toggle', async action => {
    const d = await device(), { plan, stepId } = await add(d, await create(d), { eventDateISO: DAY, description: 'Fikcyjny pierwotny opis wizyty.' });
    const completed = await mutate(d, plan, action, { stepId, dateISO: DAY, text: 'Fikcyjny zapis kliniczny, który musi pozostać.', continuation: 'later' });
    const original = completed.plan.steps[0];
    for (const change of ['completePatientNote', 'uncompletePatientNote', 'noShowPatientNote']) {
      await d.vault[change](original.calendarNoteId);
      const next = (await d.vault.getCarePlan(plan.id)).steps[0];
      expect(next).toMatchObject({ state: 'done', completedDateISO: DAY, completionSource: action === 'result' ? 'result' : 'performance', description: original.description });
      expect(next.resultNoteId).toBe(original.resultNoteId);
    }
  });

  it('still reverses a new completion that came only from the calendar', async () => {
    const d = await device(), { plan } = await add(d, await create(d), { eventDateISO: DAY });
    await d.vault.completePatientNote(plan.steps[0].calendarNoteId);
    expect((await d.vault.getCarePlan(plan.id)).steps[0]).toMatchObject({ state: 'done', completionSource: 'calendar' });
    await d.vault.uncompletePatientNote(plan.steps[0].calendarNoteId);
    const reopened = (await d.vault.getCarePlan(plan.id)).steps[0];
    expect(reopened).toMatchObject({ state: 'pending', completedDateISO: null });
    expect(reopened).not.toHaveProperty('completionSource');
  });

  it('preserves an ambiguous legacy completion after an old client strips the source marker', async () => {
    const d = await device(), { plan } = await add(d, await create(d), { eventDateISO: DAY });
    await d.vault.completePatientNote(plan.steps[0].calendarNoteId);
    const raw = await d.adapter.getPatientNoteForUser(d.userId, plan.id), plain = await d.vault.decryptPayloadForCurrentUser(raw.bodyCipher.iv, raw.bodyCipher.data);
    delete plain.careContext.steps[0].completionSource;
    await d.adapter.putPatientNoteForUser(d.userId, { ...raw, bodyCipher: await d.vault.encryptPayloadForCurrentUser(plain) });
    const before = (await d.vault.getCarePlan(plan.id)).steps[0];
    await d.vault.uncompletePatientNote(before.calendarNoteId);
    const after = (await d.vault.getCarePlan(plan.id)).steps[0];
    expect(after.state).toBe('done'); expect(after.completedDateISO).toBe(before.completedDateISO);
    expect(after).not.toHaveProperty('completionSource');
  });

  it.each(['waiting', 'done', 'closed'])('records native calendar performance separately when clinical state is %s', async state => {
    const d = await device(), added = await add(d, await create(d), { state: 'waiting', eventDateISO: DAY });
    let plan = added.plan;
    if (state === 'done') plan = (await mutate(d, plan, 'result', { stepId: added.stepId, dateISO: DAY, text: 'Fikcyjny otrzymany wynik.', continuation: 'later' })).plan;
    if (state === 'closed') plan = (await mutate(d, plan, 'close', { reason: 'Fikcyjne przekazanie opieki', text: 'Fikcyjne zamknięcie z zachowaniem rezerwacji.', cancelOpen: true })).plan;
    const before = plan.steps[0], calendar = await d.vault.getPatientNote(before.calendarNoteId);
    const saved = await d.vault.saveReminderOutcome({ id: calendar.id, patientId: d.patientId, baseRev: calendar.rev, operationId: operation(), action: 'complete', dateISO: DAY, text: 'Fikcyjne wykonanie rzeczywistej wizyty.' });
    expect(saved.saved).toBe(true);
    const after = await d.vault.getCarePlan(plan.id);
    expect(after.status).toBe(plan.status); expect(after.steps[0]).toEqual(before); expect(after.needsDecision).toBe(plan.needsDecision);
    const notes = await d.vault.listPatientNotesForPatient(d.patientId);
    const performance = notes.find(note => note.careContext?.role === 'note' && note.careContext.stepId === added.stepId && note.body.includes('Fikcyjne wykonanie rzeczywistej wizyty.'));
    expect(performance).toBeTruthy(); expect(performance.clinicalDateISO).toBe(DAY);
    expect((await d.vault.getPatientNote(calendar.id)).completedAtISO).toBe(DAY + 'T12:00:00.000Z');
    expect(after.steps).toHaveLength(1);
  });

  it('does not complete a waiting step through a direct generic complete action', async () => {
    const d = await device(), { plan, stepId } = await add(d, await create(d), { state: 'waiting' }), before = await rawNotes(d);
    await expect(mutate(d, plan, 'complete', { stepId, dateISO: DAY, text: 'Fikcyjne omyłkowe zakończenie.' })).rejects.toThrow('oczekuje na wynik');
    expect(await rawNotes(d)).toEqual(before);
  });

  it('detaches the event in one transaction while retaining all appointment fields and unknown encrypted metadata', async () => {
    const d = await device(), { plan, stepId } = await add(d, await create(d), { eventDateISO: '2026-11-03', eventTime: '10:30' });
    const id = plan.steps[0].calendarNoteId, raw = await d.adapter.getPatientNoteForUser(d.userId, id);
    const plain = await d.vault.decryptPayloadForCurrentUser(raw.bodyCipher.iv, raw.bodyCipher.data);
    plain.opaqueCalendarClinicalField = { marker: 'Fikcyjne metadane zachowane bez interpretacji' };
    const originalRaw = { ...raw, opaqueEnvelopeField: 'Fikcyjne pole koperty', bodyCipher: await d.vault.encryptPayloadForCurrentUser(plain) };
    await d.adapter.putPatientNoteForUser(d.userId, originalRaw);
    const original = await d.vault.getPatientNote(id);
    const detached = await mutate(d, plan, 'editStep', { stepId, step: { detachEvent: true, eventDateISO: null, eventTime: null } });
    expect(detached.saved).toBe(true);
    expect(detached.plan.steps[0]).toMatchObject({ calendarNoteId: null, eventDateISO: null, eventTime: null, state: 'pending', reminderDateISO: DAY });
    const event = await d.vault.getPatientNote(id);
    expect(event).toMatchObject({ ...original, careContext: null, rev: original.rev + 1, updatedAtISO: event.updatedAtISO });
    expect(event.updatedAtISO >= original.updatedAtISO).toBe(true);
    const savedRaw = await d.adapter.getPatientNoteForUser(d.userId, id), savedPlain = await d.vault.decryptPayloadForCurrentUser(savedRaw.bodyCipher.iv, savedRaw.bodyCipher.data);
    expect(savedRaw.opaqueEnvelopeField).toBe(originalRaw.opaqueEnvelopeField);
    expect(savedPlain).toEqual({ ...plain, careContext: null });
    expect((await d.vault.listPatientNotesInRange('2026-11-01', '2026-11-30T23:59:59.999Z')).filter(note => note.id === id)).toHaveLength(1);
    expect((await dueNotes(d)).some(note => note.id === plan.steps[0].reminderNoteId)).toBe(true);
  });

  it('does not treat an unspecified null event date as permission to clear the reservation time', async () => {
    const d = await device(), { plan, stepId } = await add(d, await create(d), { eventDateISO: '2026-11-03', eventTime: '10:30' });
    const result = await mutate(d, plan, 'editStep', { stepId, step: { eventDateISO: null, eventTime: null } });
    expect(result.plan.steps[0]).toMatchObject({ eventDateISO: '2026-11-03', eventTime: '10:30', calendarNoteId: plan.steps[0].calendarNoteId });
    expect((await d.vault.getPatientNote(plan.steps[0].calendarNoteId)).dueTime).toBe('10:30');
  });

  it('rolls back detachment when a concurrent calendar edit wins during preparation', async () => {
    const d = await device(), { plan, stepId } = await add(d, await create(d), { eventDateISO: '2026-11-03', eventTime: '10:30' });
    const id = plan.steps[0].calendarNoteId, commit = d.adapter.commitCarePlanForUser.bind(d.adapter);
    d.adapter.commitCarePlanForUser = async (user, change) => { const raw = await d.adapter.getPatientNoteForUser(user, id); await d.adapter.putPatientNoteForUser(user, { ...raw, rev: raw.rev + 1 }); return commit(user, change); };
    const result = await mutate(d, plan, 'editStep', { stepId, step: { detachEvent: true } });
    expect(result).toMatchObject({ saved: false, conflict: true });
    expect(await d.vault.getCarePlan(plan.id)).toEqual(plan);
    expect((await d.vault.getPatientNote(id)).careContext).toMatchObject({ role: 'calendar', planId: plan.id });
  });

  it('does not write a detached record into either adapter after storage switches during preparation', async () => {
    const d = await device(), { plan, stepId } = await add(d, await create(d), { eventDateISO: '2026-11-03' });
    const id = plan.steps[0].calendarNoteId, before = await rawNotes(d), replacement = d.vault.createInMemoryAdapter();
    const get = d.adapter.getPatientNoteForUser.bind(d.adapter);
    d.adapter.getPatientNoteForUser = async (user, noteId) => {
      const record = await get(user, noteId);
      if (noteId === id) d.vault.setStorageAdapter(replacement);
      return record;
    };
    await expect(mutate(d, plan, 'editStep', { stepId, step: { detachEvent: true } })).rejects.toThrow('Sesja zmieniła się');
    expect(await rawNotes(d)).toEqual(before);
    expect(await replacement.listPatientNotesForUser(d.userId)).toEqual([]);
  });

  it('keeps explicit detachment through full synchronization and later ordinary calendar edits', async () => {
    const a = await device(), { plan, stepId } = await add(a, await create(a), { eventDateISO: '2026-11-03', eventTime: '10:30' }), b = await device();
    await b.vault.mergeSyncPayload(await a.vault.exportSyncPayload());
    const id = plan.steps[0].calendarNoteId;
    await mutate(a, plan, 'editStep', { stepId, step: { detachEvent: true } });
    await b.vault.mergeSyncPayload(await a.vault.exportSyncPayload());
    expect((await b.vault.getPatientNote(id)).careContext).toBeNull();
    const before = await b.vault.getCarePlan(plan.id);
    await b.vault.savePatientNote({ id, patientId: a.patientId, dueTime: '11:55', body: 'Fikcyjna aktualizacja samodzielnej rezerwacji.' });
    expect(await b.vault.getCarePlan(plan.id)).toEqual(before);
    expect((await b.vault.getPatientNote(id)).careContext).toBeNull();
    await a.vault.mergeSyncPayload(await b.vault.exportSyncPayload());
    expect((await a.vault.getPatientNote(id)).careContext).toBeNull();
    expect((await a.vault.getPatientNote(id)).dueTime).toBe('11:55');
  });

  it('keeps detachment through actual encrypted deltas in either parent/event delivery order', async () => {
    const a = await device(), { plan, stepId } = await add(a, await create(a), { eventDateISO: '2026-11-03' }), b = await device();
    const code = await a.vault.exportSyncCode(a.password); b.vault.lock('manual'); await b.vault.importSyncCode(code, a.password, { label: 'Fikcyjny telefon odpięcia' }); b.userId = b.vault.getCurrentUser().userId;
    await b.vault.mergeSyncPayload(await a.vault.exportSyncPayload());
    const id = plan.steps[0].calendarNoteId;
    await mutate(a, plan, 'editStep', { stepId, step: { detachEvent: true } });
    const parentDelta = await a.vault.buildNoteDelta(plan.id), eventDelta = await a.vault.buildNoteDelta(id);
    await b.vault.applyEncryptedDelta(parentDelta);
    // The parent may arrive first while the calendar still has its stale link.
    const before = await b.vault.getCarePlan(plan.id);
    await b.vault.savePatientNote({ id, patientId: a.patientId, dueTime: '11:15' });
    expect(await b.vault.getCarePlan(plan.id)).toEqual(before);
    expect((await b.vault.getPatientNote(id)).careContext).toBeNull();
    await b.vault.applyEncryptedDelta(eventDelta);
    // The local edit has its own higher revision. Its ordinary-event treatment
    // must still leave the canonical plan unchanged.
    expect((await b.vault.getCarePlan(plan.id)).steps[0].calendarNoteId).toBeNull();
    const c = await device(); c.vault.lock('manual'); await c.vault.importSyncCode(code, a.password, { label: 'Fikcyjne drugie urządzenie odpięcia' }); c.userId = c.vault.getCurrentUser().userId;
    await c.vault.mergeSyncPayload({ ...(await a.vault.exportSyncPayload()), patientNotes: (await b.vault.exportSyncPayload()).patientNotes.filter(note => note.id !== id) });
    await c.vault.applyEncryptedDelta(eventDelta); await c.vault.applyEncryptedDelta(parentDelta);
    expect((await c.vault.getPatientNote(id)).careContext).toBeNull();
    expect((await c.vault.getCarePlan(plan.id)).steps[0].calendarNoteId).toBeNull();
  });

  it('retains detachment through patient export/import and whole-account backup', async () => {
    const a = await device(), { plan, stepId } = await add(a, await create(a), { eventDateISO: '2026-11-03' }), id = plan.steps[0].calendarNoteId;
    await mutate(a, plan, 'editStep', { stepId, step: { detachEvent: true } });
    const b = await device(); await b.vault.importPatientFromEnvelope(await a.vault.exportPatientEnvelope(a.patientId), a.password);
    expect((await b.vault.getPatientNote(id)).careContext).toBeNull();
    const c = await device(); await c.vault.restoreVaultBackup(await a.vault.exportVaultBackup(), a.password);
    expect((await c.vault.getPatientNote(id)).careContext).toBeNull();
  });

  it.each(['result', 'complete', 'wait', 'addNote'])('rejects future factual date for %s without partial records', async action => {
    const d = await device(), { plan, stepId } = await add(d, await create(d)), before = await rawNotes(d);
    await expect(mutate(d, plan, action, { stepId, dateISO: '2999-12-31', text: 'Fikcyjny przyszły fakt.', checkDateISO: '2999-12-31' })).rejects.toThrow('nie może być przyszła');
    expect(await rawNotes(d)).toEqual(before);
  });

  it('rejects a future changed calendar completion but permits an ordinary edit retaining an old incorrect future flag', async () => {
    const d = await device(), { plan } = await add(d, await create(d), { eventDateISO: '2999-12-31' }), id = plan.steps[0].calendarNoteId, before = await rawNotes(d);
    await expect(d.vault.savePatientNote({ id, patientId: d.patientId, completedAtISO: '2999-12-31T12:00:00.000Z' })).rejects.toThrow('nie może być przyszła');
    expect(await rawNotes(d)).toEqual(before);
    const raw = await d.adapter.getPatientNoteForUser(d.userId, id);
    await d.adapter.putPatientNoteForUser(d.userId, { ...raw, completedAtISO: '2999-12-31T12:00:00.000Z' });
    await d.vault.savePatientNote({ id, patientId: d.patientId, body: 'Fikcyjna zwykła edycja istniejącego wpisu.', completedAtISO: '2999-12-31T12:00:00.000Z' });
    expect((await d.vault.getPatientNote(id)).body).toContain('zwykła edycja');
  });

  it.each([
    ['Pacific/Kiritimati', '2026-10-30T00:30:00+14:00', '2026-10-30'],
    ['America/Los_Angeles', '2026-10-29T23:30:00-07:00', '2026-10-29'],
  ])('uses the local day of an actual completion instant in %s', async (timezone, instant, expected) => {
    await withCareClock(instant, timezone, async () => {
      const d = await device(), { plan } = await add(d, await create(d), { eventDateISO: '2026-11-03' });
      await d.vault.completePatientNote(plan.steps[0].calendarNoteId);
      expect((await d.vault.getCarePlan(plan.id)).steps[0]).toMatchObject({ completedDateISO: expected, completionSource: 'calendar' });
    });
  });

  it.each(['result', 'waiting'])('review does not invent or undo calendar performance for %s', async kind => {
    const d = await device(), { plan, stepId } = await add(d, await create(d), { state: 'waiting', eventDateISO: DAY });
    if (kind === 'result') await mutate(d, plan, 'result', { stepId, dateISO: DAY, text: 'Fikcyjny otrzymany opis.', continuation: 'later' });
    else await d.vault.completePatientNote(plan.steps[0].calendarNoteId);
    const raw = await d.adapter.getPatientNoteForUser(d.userId, plan.id), plain = await d.vault.decryptPayloadForCurrentUser(raw.bodyCipher.iv, raw.bodyCipher.data);
    plain.careContext.syncNeedsReview = true;
    await d.adapter.putPatientNoteForUser(d.userId, { ...raw, bodyCipher: await d.vault.encryptPayloadForCurrentUser(plain) });
    const current = await d.vault.getCarePlan(plan.id), eventBefore = await d.vault.getPatientNote(plan.steps[0].calendarNoteId);
    await mutate(d, current, 'acknowledgeMerge');
    const after = await d.vault.getPatientNote(eventBefore.id);
    expect(after.completedAtISO).toBe(eventBefore.completedAtISO); expect(after.noShowAtISO).toBe(eventBefore.noShowAtISO);
    expect((await d.vault.getCarePlan(plan.id)).steps[0].state).toBe(kind === 'result' ? 'done' : 'waiting');
  });
});
