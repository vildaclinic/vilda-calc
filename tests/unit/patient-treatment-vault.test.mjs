import { afterEach, describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Production note actors, real WebCrypto and fictional records. The tests never
// encode a second treatment model or write directly into an encrypted adapter.
const devices = [];
const DAY = '2026-11-03';
const PATIENT = { name: 'Fikcyjny Pacjent Leczenie B1', user: { sex: 'M', age: 10, height: 139, weight: 30.2 } };
const diagnosis = (extra = {}) => ({ name: 'Fikcyjne rozpoznanie B1', code: 'I10', status: 'active', dateISO: DAY, ...extra });
const episode = (extra = {}) => ({ title: 'Fikcyjny epizod leczenia B1', method: 'pharmacological', status: 'active',
  startDateISO: DAY, medication: 'Fikcyjny preparat PX-731', dose: 'Fikcyjna dawka DX-842', ...extra });
const clone = (value) => JSON.parse(JSON.stringify(value));
const later = (stamp) => new Date(Date.parse(stamp) + 1000).toISOString();
let serial = 0;

function storage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key), key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size; } };
}
async function device({ account = true, seed = true } = {}) {
  const win = { crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa, atob,
    localStorage: storage(), sessionStorage: storage(), setTimeout, clearTimeout,
    addEventListener() {}, removeEventListener() {},
    document: { hidden: false, addEventListener() {}, removeEventListener() {} } };
  win.window = win; win.self = win; win.top = win;
  for (const file of ['vilda_crypto.js', 'vilda_vault.js']) loadBrowserScript(file, win);
  const vault = win.VildaVault, adapter = vault.createInMemoryAdapter();
  vault.setEphemeralMode(true); vault.setStorageAdapter(adapter); devices.push(vault);
  const password = 'Fictional#TreatmentVault!' + ++serial;
  if (account) await vault.createUser(password, { iterations: 1000, label: 'Fikcyjny sejf leczenia B1', deferServerContact: true });
  const patientId = account && seed ? (await vault.savePatient(PATIENT)).patientId : null;
  return { win, vault, adapter, password, patientId, userId: vault.getCurrentUser()?.userId || null };
}
afterEach(() => devices.splice(0).forEach((vault) => vault.lock('fictional-treatment-test-complete')));

function scope(dev, patientId = dev.patientId, isCurrent = () => true) {
  return dev.win.VildaPatientTreatmentStore.createScope({ vault: dev.vault, patientId, isCurrent });
}
async function contextRows(dev, patientId = dev.patientId) {
  return (await dev.vault.listPatientNotesForPatient(patientId)).filter((note) => Object.hasOwn(note, 'treatmentContext'));
}
async function fixtures(dev) {
  const current = scope(dev), problem = await current.createDiagnosis(diagnosis());
  const treatment = await current.createEpisode(episode({ diagnosisIds: [problem.id] }));
  return { current, problem, treatment };
}
async function projected(dev, patientId = dev.patientId) {
  return scope(dev, patientId).read();
}
function payload(dev, id, context) {
  return { id, patientId: dev.patientId, ...dev.win.VildaPatientTreatmentModel.describe(context),
    linkedAgeMonths: null, treatmentContext: context };
}
function pauseNextEncrypt(win) {
  let release, entered, armed = true;
  const held = new Promise((resolve) => { release = resolve; });
  const reached = new Promise((resolve) => { entered = resolve; });
  const original = win.crypto;
  const subtle = new Proxy(original.subtle, { get(target, key) {
    const value = Reflect.get(target, key, target);
    if (typeof value !== 'function') return value;
    return async function (...args) {
      if (key === 'encrypt' && armed) { armed = false; entered(); await held; }
      return Reflect.apply(value, target, args);
    };
  } });
  win.crypto = { subtle, getRandomValues: original.getRandomValues.bind(original), randomUUID: original.randomUUID.bind(original) };
  return { reached, release, restore() { release(); win.crypto = original; } };
}

describe('patient treatment through the real encrypted vault', () => {
  it('creates stable distinct records, detaches supplied data and keeps ICD, medication and dose encrypted', async () => {
    const d = await device(), current = scope(d), values = diagnosis();
    const pending = current.createDiagnosis(values); values.name = 'Mutacja obiektu po wywołaniu';
    const problem = await pending;
    const first = await current.createEpisode(episode({ diagnosisIds: [problem.id] }));
    const second = await current.createEpisode(episode({ method: 'nonpharmacological', diagnosisIds: [problem.id], medication: '', dose: '' }));
    expect(new Set([problem.id, first.id, second.id]).size).toBe(3);
    for (const id of [problem.id, first.id, second.id]) expect(id).toMatch(/^tmt-[A-Za-z0-9-]+$/);
    expect(problem.context.name).toBe('Fikcyjne rozpoznanie B1');
    const view = await current.read(); expect(view.diagnoses).toHaveLength(1); expect(view.episodes).toHaveLength(2);
    expect(view.episodes.map((entry) => entry.context.diagnosisIds)).toEqual([[problem.id], [problem.id]]);
    expect(first.context).toMatchObject({ medication: 'Fikcyjny preparat PX-731', dose: 'Fikcyjna dawka DX-842' });
    for (const id of [problem.id, first.id]) {
      const raw = await d.adapter.getPatientNoteForUser(d.userId, id), serialized = JSON.stringify(raw);
      expect(raw.bodyCipher).toBeTruthy(); expect(raw).not.toHaveProperty('treatmentContext');
      expect(raw.bodyCipher.data).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
      const { bodyCipher: _cipher, ...metadata } = raw;
      // A short ICD code can occur by chance in random base64 ciphertext.
      // Inspect plaintext columns independently, then reject readable content
      // markers (spaces or hyphens cannot occur in this cipher's base64).
      for (const secret of ['I10', 'Fikcyjne rozpoznanie B1', 'PX-731', 'DX-842']) expect(JSON.stringify(metadata)).not.toContain(secret);
      for (const secret of ['Fikcyjne rozpoznanie B1', 'PX-731', 'DX-842']) expect(serialized).not.toContain(secret);
    }
  });

  it('preserves known treatment context through legacy comment and completion actions', async () => {
    const d = await device(), { treatment } = await fixtures(d), before = clone(treatment.context);
    await d.vault.savePatientNote({ id: treatment.id, patientId: d.patientId, body: 'Fikcyjny komentarz starszego klienta.' });
    await d.vault.completePatientNote(treatment.id);
    await d.vault.uncompletePatientNote(treatment.id);
    const read = await d.vault.getPatientNote(treatment.id);
    expect(read.treatmentContext).toEqual(before); expect(read.body).toBe('Fikcyjny komentarz starszego klienta.');
  });

  it('keeps a diagnosis unchanged when an episode ends and records historical followups without losing IDs', async () => {
    const d = await device(), { current, problem, treatment } = await fixtures(d);
    const before = await d.vault.getPatientNote(problem.id);
    const updated = await current.addFollowup(treatment, { dateISO: '2026-11-02', kind: 'Kontrola', body: 'Fikcyjna późniejsza kontrola.' });
    const older = await current.addFollowup(updated, { dateISO: '2026-09-15', kind: 'Kontrola', body: 'Fikcyjna starsza kontrola.' });
    const firstId = older.context.followups[0].id;
    const corrected = await current.updateFollowup(older, firstId, { body: 'Fikcyjna skorygowana kontrola.' });
    expect(corrected.context.followups.map((entry) => entry.id)).toEqual(older.context.followups.map((entry) => entry.id));
    expect(corrected.context.followups[0].body).toBe('Fikcyjna skorygowana kontrola.');
    const closed = await current.updateEpisode(corrected, { status: 'closed', endDateISO: '2026-11-18' });
    expect(closed.context.status).toBe('closed'); expect(closed.context.diagnosisIds).toEqual([problem.id]);
    expect(await d.vault.getPatientNote(problem.id)).toEqual(before);
  });

  it('treats a context-only concurrent change as content and refuses stale or deleted-document edits', async () => {
    const d = await device(), { current, problem } = await fixtures(d);
    const before = await d.vault.getPatientNote(problem.id);
    await d.vault.savePatientNote({ id: problem.id, patientId: d.patientId, treatmentContext: { ...problem.context, code: 'FIKCYJNY-ICD-QA' } });
    const changed = await d.vault.getPatientNote(problem.id);
    expect(changed.title).toBe(before.title); expect(changed.body).toBe(before.body);
    expect(changed.contentAtISO || changed.updatedAtISO).not.toBe(before.contentAtISO || before.updatedAtISO);
    await expect(current.updateDiagnosis(problem, { name: 'Nie wolno nadpisać nowszego kontekstu' })).rejects.toMatchObject({ code: 'TREATMENT_CONFLICT' });
    expect((await d.vault.getPatientNote(problem.id)).treatmentContext.code).toBe('FIKCYJNY-ICD-QA');
    const fresh = (await current.read()).diagnoses[0];
    await d.vault.removePatientNote(problem.id);
    await expect(current.updateDiagnosis(fresh, { status: 'closed' })).rejects.toMatchObject({ code: 'TREATMENT_CONFLICT' });
    expect(await d.vault.getPatientNote(problem.id)).toBeNull();
  });

  it('does not deduplicate a reused operation ID with different treatment context', async () => {
    const d = await device(), normalized = d.win.VildaPatientTreatmentModel.normalize({ ...diagnosis(), schemaVersion: 1, kind: 'diagnosis' });
    const request = payload(d, 'fictional-treatment-once', normalized);
    expect(await d.vault.savePatientNoteOnce(request)).toMatchObject({ saved: true, reused: false });
    expect(await d.vault.savePatientNoteOnce(clone(request))).toMatchObject({ saved: true, reused: true });
    const conflict = await d.vault.savePatientNoteOnce({ ...request, treatmentContext: { ...normalized, code: 'FIKCYJNY-ICD-INNY' } });
    expect(conflict).toMatchObject({ saved: false, reason: 'conflict', conflict: true });
    expect((await d.vault.getPatientNote(request.id)).treatmentContext).toEqual(normalized);
  });

  it('preserves unavailable diagnosis links and rejects foreign or silently removed references', async () => {
    const d = await device(), { current, problem, treatment } = await fixtures(d);
    const otherPatient = (await d.vault.savePatient({ ...PATIENT, name: 'Fikcyjny Inny Pacjent B1' })).patientId;
    const other = await scope(d, otherPatient).createDiagnosis(diagnosis({ name: 'Fikcyjne obce rozpoznanie' }));
    await expect(current.createEpisode(episode({ diagnosisIds: [other.id] }))).rejects.toMatchObject({ code: 'TREATMENT_LINK_INVALID' });
    await d.vault.removePatientNote(problem.id);
    const maintained = await current.updateEpisode(treatment, { notes: 'Powiązanie nie jest dostępne, ale nie znika.' });
    expect(maintained.context.diagnosisIds).toEqual([problem.id]);
    await expect(current.updateEpisode(maintained, { diagnosisIds: [] })).rejects.toMatchObject({ code: 'TREATMENT_CONFLICT' });
    expect((await d.vault.getPatientNote(treatment.id)).treatmentContext.diagnosisIds).toEqual([problem.id]);
  });

  it('round-trips diagnosis, therapy and followup IDs through sync, patient envelope, backup restore and backup merge', async () => {
    const source = await device(), { current, problem, treatment } = await fixtures(source);
    const recorded = await current.addFollowup(treatment, { dateISO: DAY, kind: 'Ustalenia', body: 'Fikcyjna dokumentacja do przeniesienia.' });
    const expected = new Map((await contextRows(source)).map((note) => [note.id, clone(note.treatmentContext)]));
    const synced = await device({ seed: false }), imported = await device({ seed: false });
    const restored = await device({ account: false, seed: false }), merged = await device({ seed: false });
    await synced.vault.mergeSyncPayload(await source.vault.exportSyncPayload());
    const result = await imported.vault.importPatientFromEnvelope(await source.vault.exportPatientEnvelope(source.patientId), source.password);
    const backup = await source.vault.exportVaultBackup();
    await restored.vault.restoreVaultBackup(backup, source.password, { label: 'Fikcyjny odtworzony sejf leczenia' });
    await merged.vault.mergeVaultBackup(backup, source.password);
    for (const [dev, patientId] of [[synced, source.patientId], [imported, result.patientId], [restored, source.patientId], [merged, source.patientId]]) {
      const read = await projected(dev, patientId);
      expect(read.diagnoses.map((entry) => entry.id)).toEqual([problem.id]); expect(read.episodes.map((entry) => entry.id)).toEqual([treatment.id]);
      expect(read.episodes[0].context.diagnosisIds).toEqual([problem.id]);
      expect(read.episodes[0].context.followups).toEqual(recorded.context.followups);
      for (const note of await contextRows(dev, patientId)) expect(note.treatmentContext).toEqual(expected.get(note.id));
    }
    const targetScope = scope(synced, source.patientId), entry = (await targetScope.read()).episodes[0];
    await targetScope.updateEpisode(entry, { notes: 'Fikcyjna zmiana z drugiego urządzenia.' });
    await source.vault.mergeSyncPayload(await synced.vault.exportSyncPayload());
    expect((await source.vault.getPatientNote(treatment.id)).treatmentContext.notes).toBe('Fikcyjna zmiana z drugiego urządzenia.');
  });

  it('retains current context when a newer legacy sync payload omits the optional field', async () => {
    const source = await device(), target = await device({ seed: false }), { treatment } = await fixtures(source);
    await target.vault.mergeSyncPayload(await source.vault.exportSyncPayload());
    const incoming = await source.vault.exportSyncPayload(), note = incoming.patientNotes.find((entry) => entry.id === treatment.id);
    delete note.treatmentContext; note.body = 'Fikcyjny komentarz z klienta bez pola leczenia.';
    note.updatedAtISO = later(note.updatedAtISO); note.rev += 1;
    await target.vault.mergeSyncPayload(incoming);
    const read = await target.vault.getPatientNote(treatment.id);
    expect(read.body).toBe(note.body); expect(read.treatmentContext).toEqual(treatment.context);
  });

  it('keeps an unknown imported schema opaque and refuses legacy writes to that document', async () => {
    const source = await device(), target = await device({ seed: false }), { problem } = await fixtures(source);
    const incoming = await source.vault.exportSyncPayload(), note = incoming.patientNotes.find((entry) => entry.id === problem.id);
    const opaque = { schemaVersion: 700, kind: 'future-diagnosis', payload: { code: 'FIKCYJNY-ICD-FUTURE', extra: ['future-version'] } };
    note.treatmentContext = clone(opaque); note.updatedAtISO = later(note.updatedAtISO); note.rev += 1;
    await target.vault.mergeSyncPayload(incoming);
    const view = await projected(target, source.patientId);
    expect(view.diagnoses).toEqual([]); expect(view.unsupported.map((entry) => entry.id)).toContain(problem.id);
    expect((await target.vault.getPatientNote(problem.id)).treatmentContext).toEqual(opaque);
    await expect(target.vault.savePatientNote({ id: problem.id, patientId: source.patientId, body: 'Nie nadpisuj przyszłego formatu.' })).rejects.toMatchObject({ code: 'TREATMENT_UNSUPPORTED' });
    expect((await target.vault.getPatientNote(problem.id)).treatmentContext).toEqual(opaque);
  });

  it('moves stable note and diagnosis references with a whole-patient merge', async () => {
    const d = await device(), { problem, treatment } = await fixtures(d);
    const targetId = (await d.vault.savePatient({ ...PATIENT, name: 'Fikcyjna Docelowa Karta B1' })).patientId;
    const before = new Map((await contextRows(d)).map((note) => [note.id, clone(note.treatmentContext)]));
    await d.vault.mergePatients(d.patientId, targetId);
    const read = await projected(d, targetId);
    expect(read.diagnoses.map((entry) => entry.id)).toEqual([problem.id]); expect(read.episodes.map((entry) => entry.id)).toEqual([treatment.id]);
    for (const note of await contextRows(d, targetId)) expect(note.treatmentContext).toEqual(before.get(note.id));
    expect(read.episodes[0].context.diagnosisIds).toEqual([problem.id]);
  });

  it.each(['create', 'update'])('does not commit a %s after the selected patient changes during real encryption', async (operation) => {
    const d = await device(); let selected = true;
    const current = scope(d, d.patientId, () => selected);
    const existing = operation === 'update' ? await current.createDiagnosis(diagnosis()) : null;
    const before = await contextRows(d), barrier = pauseNextEncrypt(d.win);
    const pending = (operation === 'create' ? current.createDiagnosis(diagnosis()) : current.updateDiagnosis(existing, { code: 'FIKCYJNY-ICD-NIE-ZAPISUJ' }))
      .then((value) => ({ value }), (error) => ({ error }));
    try {
      await Promise.race([barrier.reached, pending.then((result) => { throw result.error || new Error('Write completed before the encryption barrier.'); })]);
      selected = false; barrier.release();
      expect((await pending).error).toMatchObject({ code: 'TREATMENT_STALE' });
      expect(await contextRows(d)).toEqual(before);
    } finally { barrier.restore(); await pending; }
  });

  it('rejects a disposed scope and a same-account relock/unlock without changing records', async () => {
    const d = await device(), current = scope(d), problem = await current.createDiagnosis(diagnosis());
    const disposed = scope(d); disposed.dispose();
    await expect(disposed.createDiagnosis(diagnosis())).rejects.toMatchObject({ code: 'TREATMENT_STALE' });
    d.vault.lock('fictional-treatment-relock'); d.vault.setEphemeralMode(true); d.vault.setStorageAdapter(d.adapter);
    await d.vault.unlockUser(d.userId, d.password);
    await expect(current.updateDiagnosis(problem, { status: 'closed' })).rejects.toMatchObject({ code: 'TREATMENT_STALE' });
    expect((await scope(d).read()).diagnoses[0].context.status).toBe('active');
  });
});

it('records the creating visit separately on diagnoses, episodes and later follow-ups', async () => {
  const dev = await device(), actor = scope(dev);
  const visit = (id, date) => ({
    visitContext: {version: 1, visitId: id, clinicalDateISO: date},
    isCurrent: () => true, ensureRecorded: async () => true
  });
  const first = visit('fceacbed-3cbb-4fca-baca-eabbfdaaabc1', '2026-10-01');
  const second = visit('fceacbed-3cbb-4fca-baca-eabbfdaaabc2', '2026-10-27');
  const problem = await actor.createDiagnosis(diagnosis(), first);
  const started = await actor.createEpisode(episode(), first);
  const checked = await actor.addFollowup(started, {dateISO: DAY, kind: 'Kontrola', body: 'Fikcyjny wpis'}, second);
  expect((await dev.vault.getPatientNote(problem.id)).visitContext).toEqual(first.visitContext);
  const saved = await dev.vault.getPatientNote(checked.id);
  expect(saved.visitContext).toEqual(first.visitContext);
  expect(saved.treatmentContext.followups[0]).toMatchObject({dateISO: DAY, visitContext: second.visitContext});
  const updated = await actor.updateFollowup(checked, checked.context.followups[0].id, {body:'Korekta opisu'});
  expect(updated.context.followups[0].visitContext).toEqual(second.visitContext);
  let current = true;
  const replaced = {...second, isCurrent: () => current, ensureRecorded: async () => { current = false; return true; }};
  await expect(actor.createDiagnosis(diagnosis(), replaced)).rejects.toThrow();
  expect(await contextRows(dev)).toHaveLength(2);
});
