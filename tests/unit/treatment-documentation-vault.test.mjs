import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sprzatnij, urzadzenie, wytnijFunkcje, zrodlo } from './sesja-zapisu-uprzaz.mjs';
import { drugieOkno, oknoMagazynu, przechwycZadaniaWTle } from '../support/okno-magazynu.mjs';

// Real production Vault, treatment actors, WebCrypto and two shared IndexedDB
// tabs. HomeEncounter functions are extracted unchanged to provide a loaded
// editor's real binding without constructing unrelated accepted-load UI.
const DAY = '2026-11-03', CURRENT_DAY = '2026-11-13', windows = [];
const homeFunctions = ['selected', 'current', 'active', 'canSave', 'captureBinding', 'verified', 'ensureRecorded']
  .map(name => wytnijFunkcje(zrodlo('vilda_home_encounter.js'), name)).join('\n');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-23T12:00:00Z'));
});
afterEach(async () => {
  for (const window of windows.splice(0)) {
    window.krypto.rozbroj(); window.timery.wyczysc(); await window.locks?.zwolnijWszystkie();
  }
  await sprzatnij(); vi.restoreAllMocks(); vi.useRealTimers();
});
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
function appointment(day = DAY) {
  return { version: 1, patientId: null, visitId: globalThis.crypto.randomUUID(),
    clinicalDateISO: day, createdAtISO: day + 'T12:00:00Z', origin: 'explicit' };
}
async function recordedVisit(vault, { patientId, visit = appointment() } = {}) {
  vi.setSystemTime(Date.now() + 60000);
  const receipt = await vault.savePatient({ name: 'Fikcyjny Pacjent Dokumentacji Leczenia', visit,
    user: { firstName: 'Fikcyjny', lastName: 'Dokumentacja Leczenia', sex: 'M', dobISO: '2014-03-01',
      height: 151, weight: 42, measuredAtISO: visit.clinicalDateISO } }, { dedup: false, patientId });
  return (await vault.getPatientVisits(receipt.patientId)).find(row => row.visitId === visit.visitId);
}
async function twoTabs() {
  przechwycZadaniaWTle();
  const first = await oknoMagazynu({ konta: 'A', bramka: false }); windows.push(first);
  const row = await recordedVisit(first.v);
  const second = await drugieOkno(first, { konta: 'A', bramka: false, zaloguj: 'A' }); windows.push(second);
  return { first, second, row };
}
function actor(device, patientId) {
  return device.win.VildaPatientTreatmentStore.createScope({ vault: device.win.VildaVault, patientId, isCurrent: () => true });
}
function productionBinding(device, row) {
  const vault = device.win.VildaVault;
  device.win.sessionStorage.setItem('vildaCurrentPatientId', row.patientId);
  device.win.VildaVisitContext = { capture: () => ({ patientId: row.patientId, visitId: row.visitId, clinicalDateISO: row.clinicalDateISO }) };
  const working = { vault, patientId: row.patientId, userId: vault.getCurrentUser().userId,
    token: vault.captureSyncOperationSession(), mode: 'edit', visitId: row.visitId, date: row.clinicalDateISO,
    snapshotId: row.snapshotId, revision: row.rev };
  const encounter = new Function('w', 'working', 'let loading=null,saving=null,recording=null,trashChange=null;\n'
    + homeFunctions + '\nreturn {captureBinding,ensureRecorded};')(device.win, working);
  device.win.VildaHomeEncounter = encounter;
  return encounter.captureBinding(row.patientId);
}
function trash(vault, row) {
  return vault.moveVisitToTrash(row.patientId, row.visitId,
    { snapshotId: row.snapshotId, revision: row.rev, isCurrent: () => true });
}
const diagnosis = () => ({ name: 'Fikcyjne rozpoznanie dokumentacyjne', code: 'I10', status: 'active', dateISO: DAY });
const episode = (changes = {}) => ({ title: 'Fikcyjny epizod dokumentacyjny', method: 'other', status: 'active', startDateISO: DAY, ...changes });
const followup = (changes = {}) => ({ dateISO: CURRENT_DAY, kind: 'Kontrola', body: 'Fikcyjna dokumentacja nowej kontroli.', ...changes });
async function treatmentNotes(vault, patientId) {
  return (await vault.listPatientNotesForPatient(patientId)).filter(note => Object.hasOwn(note, 'treatmentContext'));
}
function encryptions(device, from) {
  return device.krypto.log.slice(from).filter(entry => entry.metoda === 'encrypt');
}
function followupRequest(device, dto, origin, { entries, contextChanges = {} } = {}) {
  const added = { ...followup(), id: 'fictional-followup-' + globalThis.crypto.randomUUID(), visitContext: origin };
  const model = device.win.VildaPatientTreatmentModel;
  const context = model.normalize({ ...dto.context, ...contextChanges,
    followups: entries ? entries(dto.context.followups, added) : [...dto.context.followups, added] });
  const readable = model.describe(context);
  const payload = { id: dto.id, patientId: dto.patientId, title: readable.title, body: readable.body,
    category: readable.category, linkedAgeMonths: null, clinicalDateISO: readable.clinicalDateISO || null,
    treatmentContext: context, baseRev: dto.rev, baseUpdatedAtISO: dto.updatedAtISO, baseNote: dto.baseNote };
  return { payload, witness: { id: added.id, visitContext: origin }, added };
}

describe('treatment documentation at the shared active-visit boundary', () => {
  it.each(['diagnosis', 'episode', 'followup'])('rejects %s after other-tab Trash completes between confirmation and native write', async kind => {
    const { first, second, row } = await twoTabs(), scope = actor(first, row.patientId);
    const existing = kind === 'followup' ? await scope.createEpisode(episode()) : null;
    const before = await treatmentNotes(first.v, row.patientId), source = productionBinding(first, row);
    const confirmed = deferred(), release = deferred();
    const binding = Object.freeze({ visitContext: source.visitContext, isCurrent: source.isCurrent,
      ensureRecorded: async () => {
        const recorded = await source.ensureRecorded(); expect(recorded).toBe(true); confirmed.resolve();
        await release.promise; return recorded;
      } });
    const request = kind === 'diagnosis' ? scope.createDiagnosis(diagnosis(), binding)
      : kind === 'episode' ? scope.createEpisode(episode(), binding) : scope.addFollowup(existing, followup(), binding);
    const rejected = expect(request).rejects.toMatchObject({ code: 'VISIT_DOCUMENT_STALE' });
    try {
      await confirmed.promise;
      const [otherRow] = await second.v.getPatientVisits(row.patientId);
      await trash(second.v, otherRow);
      expect(source.isCurrent()).toBe(true);
      expect(await first.v.getPatientVisits(row.patientId)).toEqual([]);
    } finally { release.resolve(); }
    await rejected;
    for (const tab of [first, second]) {
      expect(await treatmentNotes(tab.v, row.patientId)).toEqual(before);
      expect(await tab.v.getPatientVisits(row.patientId)).toEqual([]);
    }
    expect(await source.ensureRecorded()).toBe(false);
  });

  it('allows a new current-visit followup while the episode and older followup retain their trashed source visit', async () => {
    const device = await urzadzenie(), older = await recordedVisit(device.v), scope = actor(device, older.patientId);
    const oldBinding = productionBinding(device, older);
    const created = await scope.createEpisode(episode(), oldBinding);
    const previous = await scope.addFollowup(created, followup({ dateISO: DAY, body: 'Fikcyjna wcześniejsza kontrola.' }), oldBinding);
    const original = await device.v.getPatientNote(previous.id), oldEntry = original.treatmentContext.followups[0];
    await trash(device.v, older);
    const current = await recordedVisit(device.v, { patientId: older.patientId, visit: appointment(CURRENT_DAY) });
    const binding = productionBinding(device, current);
    const appended = await scope.addFollowup(previous, followup(), binding);
    const saved = await device.v.getPatientNote(appended.id);
    expect(saved.visitContext).toEqual(oldBinding.visitContext);
    expect(saved.treatmentContext.followups[0]).toEqual(oldEntry);
    expect(saved.treatmentContext.followups[1]).toMatchObject({ ...followup(), visitContext: binding.visitContext });
    expect((await device.v.getPatientVisits(older.patientId)).map(row => row.visitId)).toEqual([current.visitId]);
    expect((await device.v.listTrashedVisits(older.patientId)).map(row => row.visitId)).toEqual([older.visitId]);
  });

  it('keeps ordinary episode/followup edits and null-binding creation patient-wide after their source visit is trashed', async () => {
    const device = await urzadzenie(), row = await recordedVisit(device.v), scope = actor(device, row.patientId);
    const binding = productionBinding(device, row);
    const created = await scope.createEpisode(episode(), binding);
    const withEntry = await scope.addFollowup(created, followup(), binding);
    const original = await device.v.getPatientNote(withEntry.id);
    await trash(device.v, row);
    const edited = await scope.updateEpisode(withEntry, { notes: 'Fikcyjna poprawka opisu epizodu.' });
    const corrected = await scope.updateFollowup(edited, edited.context.followups[0].id, { body: 'Fikcyjna korekta istniejącej kontroli.' });
    const saved = await device.v.getPatientNote(corrected.id);
    expect(saved.visitContext).toEqual(original.visitContext);
    expect(saved.treatmentContext.followups[0].visitContext).toEqual(original.treatmentContext.followups[0].visitContext);
    expect(saved.treatmentContext.followups[0].body).toBe('Fikcyjna korekta istniejącej kontroli.');
    const generalDiagnosis = await scope.createDiagnosis(diagnosis(), null);
    const generalEpisode = await scope.createEpisode(episode(), null);
    const generalFollowup = await scope.addFollowup(generalEpisode, followup(), null);
    expect(await device.v.getPatientNote(generalDiagnosis.id)).not.toHaveProperty('visitContext');
    const general = await device.v.getPatientNote(generalFollowup.id);
    expect(general).not.toHaveProperty('visitContext');
    expect(general.treatmentContext.followups[0]).not.toHaveProperty('visitContext');
  });

  it('holds the shared patient lock through followup encryption so queued Trash runs after the committed append', async () => {
    const { first, second, row } = await twoTabs(), scope = actor(first, row.patientId);
    const existing = await scope.createEpisode(episode()), binding = productionBinding(first, row);
    const before = await first.v.getPatientNote(existing.id), [otherRow] = await second.v.getPatientVisits(row.patientId);
    const gate = first.krypto.wstrzymaj({ metoda: 'encrypt', gdy: (_method, args) =>
      new TextDecoder().decode(args[2]).includes(followup().body) }), order = [];
    first.v.onPatientNoteChanged(event => { if (event.id === existing.id) order.push('followup'); });
    const append = scope.addFollowup(existing, followup(), binding);
    let removal, removalFinished = false;
    try {
      await gate.osiagnieta;
      const lockStart = first.locks.zadania.length;
      removal = trash(second.v, otherRow).then(receipt => { removalFinished = true; order.push('trash'); return receipt; });
      const queued = await first.locks.czekajNaZadanie(entry => entry.wynik === 'w-kolejce', { od: lockStart });
      expect(queued.nazwa).toBe('vilda-save-pat:' + row.patientId);
      expect(removalFinished).toBe(false);
      expect(await second.v.getPatientNote(existing.id)).toEqual(before);
    } finally { gate.zwolnij(); }
    const appended = await append;
    expect(appended.context.followups).toHaveLength(1);
    expect(await removal).toMatchObject({ patientId: row.patientId, visitId: row.visitId });
    expect(order).toEqual(['followup', 'trash']);
    for (const tab of [first, second]) {
      const saved = await tab.v.getPatientNote(existing.id);
      expect(saved.rev).toBe(before.rev + 1);
      expect(saved.treatmentContext.followups[0]).toMatchObject({ ...followup(), visitContext: binding.visitContext });
      expect(await tab.v.getPatientVisits(row.patientId)).toEqual([]);
    }
  });

  it('rejects malformed followup witnesses before any encryption or note update', async () => {
    const device = await urzadzenie(), row = await recordedVisit(device.v), scope = actor(device, row.patientId);
    const dto = await scope.createEpisode(episode()), binding = productionBinding(device, row);
    const { payload, witness } = followupRequest(device, dto, binding.visitContext);
    const before = await device.v.getPatientNote(dto.id);
    const invalid = [null, {}, { ...witness, id: '' }, { id: witness.id },
      { ...witness, extra: true }, { ...witness, visitContext: { ...witness.visitContext, clinicalDateISO: '2026-02-30' } }];
    for (const newTreatmentFollowup of invalid) {
      const start = device.krypto.log.length;
      await expect(device.v.updateExistingPatientNote(payload, { newTreatmentFollowup, isCurrent: () => true }))
        .rejects.toMatchObject({ code: 'TREATMENT_DOCUMENT_INVALID' });
      expect(encryptions(device, start)).toEqual([]);
      expect(await device.v.getPatientNote(dto.id)).toEqual(before);
    }
  });

  it.each(['different witness ID', 'two new entries', 'changed old entry', 'changed episode fields'])('rejects a new-followup witness with %s', async scenario => {
    const device = await urzadzenie(), row = await recordedVisit(device.v), scope = actor(device, row.patientId);
    const created = await scope.createEpisode(episode());
    const dto = await scope.addFollowup(created, followup({ dateISO: DAY, body: 'Fikcyjny istniejący wpis.' }));
    const binding = productionBinding(device, row), options = {};
    if (scenario === 'two new entries') options.entries = (old, added) => [...old, added, { ...added, id: added.id + '-extra' }];
    if (scenario === 'changed old entry') options.entries = (old, added) => [{ ...old[0], body: 'Fikcyjna podmieniona stara treść.' }, added];
    if (scenario === 'changed episode fields') options.contextChanges = { title: 'Fikcyjny podmieniony tytuł epizodu' };
    const { payload, witness } = followupRequest(device, dto, binding.visitContext, options);
    if (scenario === 'different witness ID') witness.id += '-different';
    const before = await device.v.getPatientNote(dto.id), start = device.krypto.log.length;
    await expect(device.v.updateExistingPatientNote(payload, { newTreatmentFollowup: witness, isCurrent: () => true }))
      .rejects.toMatchObject({ code: 'TREATMENT_DOCUMENT_INVALID' });
    expect(encryptions(device, start)).toEqual([]);
    expect(await device.v.getPatientNote(dto.id)).toEqual(before);
  });

  it('snapshots the followup witness before waiting for the native patient lock', async () => {
    const device = await urzadzenie(), row = await recordedVisit(device.v), scope = actor(device, row.patientId);
    const dto = await scope.createEpisode(episode()), binding = productionBinding(device, row);
    const { payload, witness, added } = followupRequest(device, dto, binding.visitContext);
    const mutable = { id: witness.id, visitContext: { ...witness.visitContext } };
    const options = { newTreatmentFollowup: mutable, isCurrent: () => true };
    const lockName = 'vilda-save-pat:' + row.patientId, held = await device.locks.trzymaj(lockName);
    const lockStart = device.locks.zadania.length;
    const request = device.v.updateExistingPatientNote(payload, options);
    try {
      const queued = await device.locks.czekajNaZadanie(entry => entry.wynik === 'w-kolejce', { od: lockStart });
      expect(queued.nazwa).toBe(lockName);
      mutable.id = 'fictional-mutated-witness';
      mutable.visitContext.visitId = globalThis.crypto.randomUUID();
      options.newTreatmentFollowup = null;
    } finally { await held.zwolnij(); }
    expect(await request).toMatchObject({ updated: true });
    const saved = await device.v.getPatientNote(dto.id);
    expect(saved.treatmentContext.followups).toEqual([added]);
  });
});
