import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const devices = [];
const storage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key), key: index => [...values.keys()][index] ?? null, get length() { return values.size; } };
};
async function device() {
  const document = new EventTarget(); document.hidden = false;
  const win = { crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa, atob, localStorage: storage(), sessionStorage: storage(),
    setTimeout, clearTimeout, addEventListener() {}, removeEventListener() {}, document };
  win.window = win; win.self = win; win.top = win;
  for (const file of ['vilda_crypto.js', 'vilda_vault.js', 'vilda_global_search.js']) loadBrowserScript(file, win);
  const vault = win.VildaVault, adapter = vault.createInMemoryAdapter(); vault.setStorageAdapter(adapter);
  await vault.createUser('Fikcyjny#GlobalSearch!2026', { iterations: 10000, label: 'Fikcyjny sejf wyszukiwania' });
  const first = await vault.savePatient({ name: 'Fikcyjny Nowak Adam', user: { age: 9, sex: 'M', height: 130, weight: 28 } });
  const second = await vault.savePatient({ name: 'Fikcyjna Nowak Anna', user: { age: 10, sex: 'F', height: 140, weight: 35 } });
  const external = await vault.saveExternalPatient({ firstName: 'Fikcyjna Maria', lastName: 'Żółć', birthYear: 2010 });
  const result = { win, vault, adapter, first: first.patientId, second: second.patientId, external: external.patientId };
  devices.push(result); return result;
}
async function note(d, fields = {}) {
  const saved = await d.vault.savePatientNote({ patientId: d.first, title: 'Fikcyjna sprawa', body: 'Fikcyjna treść.', category: 'observation', ...fields });
  return d.vault.getPatientNote(saved.id);
}
function create(d, onInvalidate) { return d.win.VildaGlobalSearch.create({ vault: d.vault, document: d.win.document, onInvalidate }); }
afterEach(() => { vi.restoreAllMocks(); for (const d of devices.splice(0)) d.vault.lock('manual'); });

describe('Global search uses the real encrypted patients and matters', () => {
  it('finds both patients and all their dated/undated matters, future procedure labels, external patients and activities', async () => {
    const d = await device();
    const biopsy = await note(d, { title: 'Fikcyjna kwalifikacja', procedureType: 'Biopsja', category: 'procedura', dueDateISO: '2028-01-14' });
    const undated = await note(d, { title: 'Fikcyjny wywiad bez terminu', dueDateISO: null });
    const lecture = await note(d, { title: 'Fikcyjne konsylium rezonans', category: 'seminar', patientId: d.vault.ACTIVITY_PATIENT_ID,
      externalName: 'Fikcyjna sala', dueDateISO: '2028-02-03' });
    const externalNote = await note(d, { patientId: d.external, title: 'Fikcyjny rezonans zewnętrzny', dueDateISO: '2028-01-15' });
    const search = create(d);
    expect((await search.search('NOWAK')).map(row => row.id).sort()).toEqual([
      'patient:' + d.first, 'patient:' + d.second, 'note:' + biopsy.id, 'note:' + undated.id
    ].sort());
    expect((await search.search('biopsja')).map(row => row.noteId)).toEqual([biopsy.id]);
    expect((await search.search('rezonans', { time: 'future', today: '2026-10-30' })).map(row => row.noteId).sort()).toEqual([lecture.id, externalNote.id].sort());
    const externalRows = await search.search('zolc');
    expect(externalRows.map(row => row.id).sort()).toEqual(['patient:' + d.external, 'note:' + externalNote.id].sort());
    expect(externalRows.every(row => row.isExternal && row.canOpenPatient)).toBe(true);
    const activityRow = (await search.search('konsylium'))[0]; expect(activityRow.canOpenPatient).toBe(false); expect(activityRow.isActivity).toBe(true);
    expect((await search.search('Nowak wywiad')).map(row => row.noteId)).toEqual([undated.id]);
    expect(await search.search('Nowak rezonans')).toEqual([]);
    expect((await search.search('seminarium')).map(row => row.noteId)).toEqual([lecture.id]);
    search.destroy();
  });

  it('preserves explicit reminder dates, pending result status and legacy external navigation without guessing a calendar date', async () => {
    const d = await device();
    const reminder = await note(d, { title: 'Fikcyjny telefon', category: 'reminder-contact', dueDateISO: '2028-03-01',
      reminderContext: { version: 1, kind: 'reminder' } });
    const pending = await note(d, { title: 'Fikcyjny wynik oczekiwany', category: 'wynik-badania', dueDateISO: '2028-03-02' });
    const legacy = await note(d, { title: 'Fikcyjny wpis dawny', patientId: d.vault.EXTERNAL_PATIENT_ID, externalName: 'Fikcyjny Zewnętrzny Dawny' });
    const search = create(d), result = (await search.search('telefon'))[0];
    expect(result.noteId).toBe(reminder.id); expect(result.eventDateISO).toBeNull(); expect(result.reminderDateISO.slice(0, 10)).toBe('2028-03-01');
    expect(result.isReminder).toBe(true); expect(result.dates).toEqual([{ kind: 'reminder', dateISO: reminder.dueDateISO }]);
    expect((await search.search('oczekiwany', { status: 'waiting' })).map(row => row.noteId)).toEqual([pending.id]);
    expect((await search.search('oczekiwany', { status: 'open' })).map(row => row.noteId)).toEqual([pending.id]);
    const external = (await search.search('Zewnętrzny Dawny'))[0]; expect(external.noteId).toBe(legacy.id);
    expect(external.isExternal).toBe(true); expect(external.canOpenPatient).toBe(false); search.destroy();
  });

  it('searches saved lab narrative, medication and IGF-1 text without parsing a numeric result or writing anything', async () => {
    const d = await device();
    const lab = await note(d, { title: 'Fikcyjny opis', category: 'wynik-badania', labResult: { test: 'Rezonans przysadki', value: 'Fikcyjny wynik opisowy' }, clinicalDateISO: '2026-10-01' });
    const medication = await note(d, { title: 'Fikcyjna terapia', medication: { action: 'start', name: 'Fikcyjny lek Alfabeta', dose: 'Przykładowa dawka testowa' } });
    const igf = await note(d, { title: 'Fikcyjne oznaczenie', igf1: { value: 123, unit: 'ng/ml' } });
    const writes = vi.spyOn(d.adapter, 'putPatientNoteForUser'), snapshots = vi.spyOn(d.adapter, 'listSnapshotsForUser');
    const search = create(d), results = await search.search('rezonans opisowy');
    expect(results.map(row => row.noteId)).toEqual([lab.id]); expect(results[0].kind).toBe('lab');
    expect(results[0].body).toContain('Fikcyjny wynik opisowy'); expect(results[0].source.labResult.valueNum).toBeUndefined();
    expect((await search.search('Alfabeta dawka')).map(row => row.noteId)).toEqual([medication.id]);
    expect((await search.search('IGF-1 123')).map(row => row.noteId)).toEqual([igf.id]);
    expect(writes).not.toHaveBeenCalled(); expect(snapshots).not.toHaveBeenCalled(); search.destroy();
  });

  it('keeps appointment, clinical and completion dates distinct and applies status independently of past/future filters', async () => {
    const d = await device();
    const completedFuture = await note(d, { dueDateISO: '2028-02-03', completedAtISO: '2026-10-29T10:00:00Z' });
    const noShow = await note(d, { dueDateISO: '2026-10-01', noShowAtISO: '2026-10-02T10:00:00Z' });
    const undated = await note(d, { completedAtISO: '2026-10-29T10:00:00Z' });
    const today = await note(d, { dueDateISO: '2026-10-30' });
    const search = create(d), filters = { today: '2026-10-30' };
    const future = await search.search('', { ...filters, time: 'future', status: 'completed' });
    expect(future.map(row => row.noteId)).toEqual([completedFuture.id]);
    expect(future[0].eventDateISO.slice(0, 10)).toBe('2028-02-03'); expect(future[0].completedAtISO.slice(0, 10)).toBe('2026-10-29');
    expect((await search.search('', { ...filters, time: 'past', status: 'no-show' })).map(row => row.noteId)).toEqual([noShow.id]);
    expect((await search.search('', { ...filters, time: 'undated', status: 'completed' })).map(row => row.noteId)).toEqual([undated.id]);
    expect((await search.search('', { ...filters, time: 'today', status: 'open' })).map(row => row.noteId)).toEqual([today.id]); search.destroy();
  });

  it('finds canonical plan steps without duplicate technical reminders, preserving the real appointment and result', async () => {
    const d = await device();
    const plan = await d.vault.mutateCarePlan({ action: 'create', operationId: 'fictional-create-search', patientId: d.first, title: 'Fikcyjna diagnostyka', goal: 'Fikcyjny cel.' });
    let current = await d.vault.getCarePlan(plan.planId);
    const step = await d.vault.mutateCarePlan({ action: 'addStep', operationId: 'fictional-step-search', patientId: d.first, planId: current.id, baseRev: current.rev,
      step: { title: 'Fikcyjna biopsja', kind: 'Badanie', description: 'Fikcyjne szczegóły histopatologii.', reminderDateISO: '2026-11-01', eventDateISO: '2028-01-14' } });
    expect(step.saved).toBe(true); current = await d.vault.getCarePlan(plan.planId);
    const result = await note(d, { title: 'Fikcyjny wynik biopsja', category: 'wynik-badania', labResult: { test: 'Biopsja', value: 'Fikcyjny opis' },
      careContext: { version: 1, role: 'result', planId: current.id, stepId: current.steps[0].id } });
    const search = create(d), rows = await search.search('biopsja');
    expect(rows.filter(row => row.kind === 'plan').map(row => row.planId)).toEqual([plan.planId]);
    expect(rows.filter(row => row.kind === 'event').map(row => row.noteId)).toEqual([current.steps[0].calendarNoteId]);
    expect(rows.filter(row => row.kind === 'lab').map(row => row.noteId)).toEqual([result.id]);
    expect(rows.some(row => row.noteId === current.steps[0].reminderNoteId)).toBe(false);
    expect((await search.search('histopatologii')).map(row => row.planId)).toContain(plan.planId);
    const planRow = rows.find(row => row.kind === 'plan');
    expect(planRow.eventDateISO).toBe('2028-01-14'); expect(planRow.reminderDateISO).toBe('2026-11-01');
    expect(planRow.dates).toEqual(expect.arrayContaining([{ kind: 'event', dateISO: '2028-01-14' }, { kind: 'reminder', dateISO: '2026-11-01' }]));
    search.destroy();
  });

  it('builds lazily once, shares an in-flight read, invalidates on real writes/sync/deletion and retains no dead view callbacks', async () => {
    const d = await device(), changed = vi.fn(), search = create(d, changed);
    const reads = vi.spyOn(d.vault, 'listAllPatientNotes'); expect(reads).not.toHaveBeenCalled();
    await Promise.all([search.search('No'), search.search('Nowak'), search.load()]); expect(reads).toHaveBeenCalledTimes(1);
    await search.search('Nowak Adam'); expect(reads).toHaveBeenCalledTimes(1);
    const added = await note(d, { title: 'Fikcyjny świeży biopsja' }); expect(changed).toHaveBeenCalledWith('data');
    expect((await search.search('świeży biopsja')).map(row => row.noteId)).toEqual([added.id]); expect(reads).toHaveBeenCalledTimes(2);
    d.win.document.dispatchEvent(new Event('vilda:sync-merged')); expect(changed).toHaveBeenCalledWith('sync');
    await search.load(); expect(reads).toHaveBeenCalledTimes(3);
    await d.vault.removePatientNote(added.id); expect(await search.search('świeży biopsja')).toEqual([]);
    search.destroy(); changed.mockClear(); await note(d); expect(changed).not.toHaveBeenCalled();
    await expect(search.search('Nowak')).rejects.toMatchObject({ code: 'STALE_GLOBAL_SEARCH' });
  });
});

describe('Global search rejects data read across a changed or locked session', () => {
  function fixture() {
    const handlers = {}, document = new EventTarget(), user = { userId: 'fictional-account-a' }; let unlocked = true;
    const vault = { ACTIVITY_PATIENT_ID: '__activity__', EXTERNAL_PATIENT_ID: '__external__',
      isUnlocked: () => unlocked, getCurrentUser: () => unlocked ? { ...user } : null,
      listPatients: vi.fn(async () => [{ patientId: 'fictional-patient-a', header: { name: 'Fikcyjny Sekret A' } }]),
      listExternalPatients: vi.fn(async () => []), listAllPatientNotes: vi.fn(async () => []), listCarePlans: vi.fn(async () => []) };
    for (const name of ['onLock', 'onUnlock', 'onPatientSaved', 'onPatientDeleted', 'onPatientNoteChanged']) vault[name] = callback => { handlers[name] = callback; };
    const win = { VildaVault: vault, document }; win.window = win; loadBrowserScript('vilda_global_search.js', win);
    return { vault, handlers, win, user, lock: () => { unlocked = false; handlers.onLock(); }, unlock: () => { unlocked = true; handlers.onUnlock(); } };
  }
  function gate() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

  it('rejects an awaited old-account read even if an account switch emits no hook', async () => {
    const d = fixture(), wait = gate(), changed = vi.fn(), search = d.win.VildaGlobalSearch.create({ vault: d.vault, onInvalidate: changed });
    d.vault.listAllPatientNotes.mockReturnValueOnce(wait.promise);
    const result = search.search('Sekret'); d.user.userId = 'fictional-account-b'; wait.resolve([]);
    await expect(result).rejects.toMatchObject({ code: 'STALE_GLOBAL_SEARCH' });
    expect(changed).toHaveBeenCalledWith('session'); await expect(search.load()).rejects.toMatchObject({ code: 'STALE_GLOBAL_SEARCH' });
    search.destroy();
  });

  it('rejects reads in flight after lock/unlock of the same account and clears cached results on lock', async () => {
    const d = fixture(), wait = gate(), search = d.win.VildaGlobalSearch.create({ vault: d.vault });
    d.vault.listAllPatientNotes.mockReturnValueOnce(wait.promise);
    const result = search.search('Sekret'); d.lock(); d.unlock(); wait.resolve([]);
    await expect(result).rejects.toMatchObject({ code: 'STALE_GLOBAL_SEARCH' });
    expect(await search.search('Sekret')).toHaveLength(1); d.lock();
    await expect(search.search('Sekret')).rejects.toMatchObject({ code: 'GLOBAL_SEARCH_LOCKED' });
    d.unlock(); expect(await search.search('Sekret')).toHaveLength(1); expect(d.vault.listPatients).toHaveBeenCalledTimes(3); search.destroy();
  });

  it('invalidates a mid-read deletion before results can reach the caller, then retries a fresh generation', async () => {
    const d = fixture(), wait = gate(), search = d.win.VildaGlobalSearch.create({ vault: d.vault });
    d.vault.listAllPatientNotes.mockReturnValueOnce(wait.promise);
    const result = search.search('Sekret'); d.vault.listPatients.mockResolvedValue([]); d.handlers.onPatientDeleted(); wait.resolve([]);
    await expect(result).rejects.toMatchObject({ code: 'STALE_GLOBAL_SEARCH' }); expect(await search.search('Sekret')).toEqual([]); search.destroy();
  });
});
