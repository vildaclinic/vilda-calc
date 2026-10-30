import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Execute the actual deployed pre-lineage client, not a copy of its parser.
// CI fetches this immutable ancestor during setup; this test never uses network.
const LEGACY_COMMIT = 'b461364002cbd3f652728b7db38dce0f1f0d9264';
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const historicalSources = new Map();
function historicalSource(file) {
  if (!historicalSources.has(file)) {
    try {
      historicalSources.set(file, execFileSync('git', ['show', LEGACY_COMMIT + ':' + file], {
        cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
      }));
    } catch (cause) {
      throw new Error('Missing required historical care-plan client ' + LEGACY_COMMIT
        + '. Fetch this exact commit before running the compatibility test.', { cause });
    }
  }
  return historicalSources.get(file);
}

let serial = 0;
const operationId = () => 'fictional-legacy-roundtrip-' + ++serial;
function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key), key: index => [...values.keys()][index] ?? null,
    get length() { return values.size; } };
}
async function device(devices, legacy = false) {
  const win = { crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: storage(), sessionStorage: storage(), setTimeout, clearTimeout,
    addEventListener() {}, removeEventListener() {}, document: { addEventListener() {}, removeEventListener() {}, hidden: false } };
  win.window = win; win.self = win; win.top = win;
  for (const file of ['vilda_crypto.js', 'vilda_vault.js']) {
    if (legacy) new Function('window', 'globalThis', historicalSource(file))(win, win);
    else loadBrowserScript(file, win);
  }
  const vault = win.VildaVault;
  vault.setStorageAdapter(vault.createInMemoryAdapter());
  await vault.createUser('Fikcyjny#Legacy!' + ++serial, { iterations: 10000, label: 'Fikcyjny test starego klienta' });
  const result = { vault }; devices.push(result); return result;
}
async function mutate(d, planId, patientId, action, extra = {}) {
  const current = planId && await d.vault.getCarePlan(planId);
  const result = await d.vault.mutateCarePlan({ operationId: operationId(), patientId, action,
    ...(current ? { planId, baseRev: current.rev } : {}), ...extra });
  expect(result.saved).toBe(true); return result;
}
const noteIds = payload => payload.patientNotes.map(note => note.id).sort();
const parentNote = (payload, planId) => payload.patientNotes.find(note => note.id === planId);
const recordFields = note => Object.fromEntries(['id', 'patientId', 'title', 'body', 'category', 'dueDateISO', 'dueTime',
  'completedAtISO', 'noShowAtISO', 'clinicalDateISO', 'careContext'].map(key => [key, note[key]]));

async function branch(d, planId, patientId, stepId, label, dates) {
  await mutate(d, planId, patientId, 'editStep', { stepId, step: { detachEvent: true } });
  const scheduled = await mutate(d, planId, patientId, 'editStep', { stepId, step: {
    title: 'Fikcyjne badanie ' + label, kind: 'Badanie', state: 'pending',
    reminderDateISO: dates.reminder, reminderTime: dates.reminderTime,
    eventDateISO: dates.event, eventTime: dates.eventTime,
    description: 'Fikcyjne ustalenia przed badaniem ' + label + '.',
  } });
  const calendarId = scheduled.plan.steps.find(step => step.id === stepId).calendarNoteId;
  const calendar = await d.vault.getPatientNote(calendarId);
  expect(await d.vault.updateExistingPatientNote({ id: calendarId, patientId, baseRev: calendar.rev,
    body: 'Fikcyjny oryginalny opis rezerwacji ' + label + '.' })).toMatchObject({ updated: true });
  // A long, wholly fictional narrative catches truncation by the older log
  // serializer as well as loss of the alternative's short labels and dates.
  const text = 'Fikcyjna pełna treść wyniku ' + label + '.\n'
    + ('Fikcyjny opis ' + label + ' bez interpretacji. ').repeat(450) + 'Fikcyjny koniec wyniku ' + label + '.';
  const completed = await mutate(d, planId, patientId, 'result', {
    stepId, text, dateISO: dates.received, continuation: 'later', decisionDateISO: dates.received,
  });
  const step = completed.plan.steps.find(item => item.id === stepId);
  return { step, calendar: recordFields(await d.vault.getPatientNote(step.calendarNoteId)),
    result: recordFields(await d.vault.getPatientNote(step.resultNoteId)) };
}
function assertReadableVersion(context, profile) {
  const step = profile.step;
  const entry = context.log.find(item => item.text.includes(step.description));
  expect(entry, 'complete readable alternative for ' + step.title).toBeDefined();
  expect(entry.text).toContain('Krok: ' + step.title);
  expect(entry.text).toContain('Stan: zakończony');
  expect(entry.text).toContain('Przypomnienie: ' + step.reminderDateISO + ', godzina ' + step.reminderTime);
  expect(entry.text).toContain('Termin wydarzenia: ' + step.eventDateISO + ', godzina ' + step.eventTime);
  expect(entry.text).toContain('Data zakończenia: ' + step.completedDateISO);
  expect(entry.text).toContain('Pochodzenie zakończenia: zapis otrzymanego wyniku');
  expect(entry.noteId).toBe(step.resultNoteId);
  expect(context.log).toContainEqual(expect.objectContaining({ noteId: step.calendarNoteId }));
}
function assertLegacyProjection(context) {
  expect(context.causality).toBeUndefined();
  for (const entry of context.log) {
    expect(entry.resolution).toBeUndefined();
    expect(entry.syncOrigin).toBeUndefined();
    expect(entry.reviewFallbackFor).toBeUndefined();
  }
}
async function assertOriginals(d, profiles, detachedOriginal) {
  for (const profile of profiles) {
    expect(recordFields(await d.vault.getPatientNote(profile.step.resultNoteId))).toEqual(profile.result);
    expect(recordFields(await d.vault.getPatientNote(profile.step.calendarNoteId))).toEqual(profile.calendar);
  }
  expect(recordFields(await d.vault.getPatientNote(detachedOriginal.id))).toEqual(detachedOriginal);
}

describe('Care plan conflict history through the actual pre-lineage client', () => {
  it('retains readable versions, dates, hours and original records before and after review when vault237 strips new metadata', async () => {
    const devices = [];
    try {
      const a = await device(devices), b = await device(devices);
      const patientId = (await a.vault.savePatient({ name: 'Fikcyjna Alicja Starszy Klient',
        user: { sex: 'F', age: 12, height: 150, weight: 40 } })).patientId;
      const created = await mutate(a, null, patientId, 'create', { title: 'Fikcyjny plan zgodności historycznej' });
      const added = await mutate(a, created.planId, patientId, 'addStep', { step: {
        title: 'Fikcyjne wspólne badanie', kind: 'Badanie', state: 'pending',
        reminderDateISO: '2027-01-10', reminderTime: '08:00', eventDateISO: '2027-01-11', eventTime: '10:00',
      } });
      const planId = created.planId, stepId = added.stepId, detachedCalendarId = added.plan.steps[0].calendarNoteId;
      await b.vault.mergeSyncPayload(await a.vault.exportSyncPayload());
      const profiles = [
        await branch(a, planId, patientId, stepId, 'A', { reminder: '2027-03-13', reminderTime: '07:35',
          event: '2027-03-14', eventTime: '11:25', received: '2026-10-27' }),
        await branch(b, planId, patientId, stepId, 'B', { reminder: '2027-04-14', reminderTime: '09:50',
          event: '2027-04-15', eventTime: '16:45', received: '2026-10-28' }),
      ];
      await a.vault.mergeSyncPayload(await b.vault.exportSyncPayload());
      const detachedOriginal = recordFields(await a.vault.getPatientNote(detachedCalendarId));
      expect(detachedOriginal.careContext).toBeNull();
      const review = await a.vault.getCarePlan(planId);
      expect(review).toMatchObject({ syncNeedsReview: true, syncLineageUnknown: false });
      expect(review.syncReview.components.find(item => item.key === 'step').variants).toHaveLength(2);
      const before = await a.vault.exportSyncPayload(), ids = noteIds(before);

      const legacy = await device(devices, true);
      await legacy.vault.mergeSyncPayload(before);
      const legacyBefore = await legacy.vault.exportSyncPayload(), legacyContext = parentNote(legacyBefore, planId).careContext;
      assertLegacyProjection(legacyContext);
      expect(noteIds(legacyBefore)).toEqual(ids);
      for (const profile of profiles) assertReadableVersion(legacyContext, profile);
      await assertOriginals(legacy, profiles, detachedOriginal);
      const restoredBefore = await device(devices);
      await restoredBefore.vault.mergeSyncPayload(legacyBefore);
      for (const profile of profiles) assertReadableVersion((await restoredBefore.vault.getPatientNote(planId)).careContext, profile);
      await assertOriginals(restoredBefore, profiles, detachedOriginal);
      expect(noteIds(await restoredBefore.vault.exportSyncPayload())).toEqual(ids);

      await mutate(a, planId, patientId, 'acknowledgeMerge');
      const after = await a.vault.exportSyncPayload();
      expect(noteIds(after)).toEqual(ids); // Fallbacks are history entries, never duplicate patient notes.
      expect(parentNote(after, planId).careContext.log.some(entry => entry.resolution)).toBe(true);
      await legacy.vault.mergeSyncPayload(after);
      const legacyAfter = await legacy.vault.exportSyncPayload(), archived = parentNote(legacyAfter, planId).careContext;
      assertLegacyProjection(archived);
      expect(archived.syncNeedsReview).toBe(false);
      for (const profile of profiles) assertReadableVersion(archived, profile);
      expect(noteIds(legacyAfter)).toEqual(ids);
      await assertOriginals(legacy, profiles, detachedOriginal);
      const restoredAfter = await device(devices);
      await restoredAfter.vault.mergeSyncPayload(legacyAfter);
      const restoredContext = (await restoredAfter.vault.getPatientNote(planId)).careContext;
      for (const profile of profiles) assertReadableVersion(restoredContext, profile);
      expect(noteIds(await restoredAfter.vault.exportSyncPayload())).toEqual(ids);
      await assertOriginals(restoredAfter, profiles, detachedOriginal);
    } finally {
      for (const d of devices) d.vault.lock('manual');
    }
  }, 30000);
});
