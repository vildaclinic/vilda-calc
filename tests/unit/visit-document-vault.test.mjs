import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sprzatnij, urzadzenie } from './sesja-zapisu-uprzaz.mjs';
import { drugieOkno, oknoMagazynu, przechwycZadaniaWTle } from '../support/okno-magazynu.mjs';

const VISIT_DAY = '2026-11-03';
const SAMPLE_DAY = '2026-10-31';
const windows = [];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-23T12:00:00Z'));
});
afterEach(async () => {
  for (const window of windows.splice(0)) {
    window.krypto.rozbroj();
    window.timery.wyczysc();
    await window.locks?.zwolnijWszystkie();
  }
  await sprzatnij();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
function appointment(day = VISIT_DAY) {
  return { version: 1, visitId: globalThis.crypto.randomUUID(), patientId: null,
    createdAtISO: day + 'T12:00:00Z', clinicalDateISO: day, origin: 'explicit' };
}
async function recordedVisit(vault, { patientId, visit = appointment() } = {}) {
  vi.setSystemTime(Date.now() + 60000);
  const receipt = await vault.savePatient({ name: 'Fikcyjna Ewa Dokumentowa ' + visit.visitId, visit,
    user: { firstName: 'Ewa', lastName: 'Fikcyjna Dokumentowa ' + visit.visitId, sex: 'F',
      dobISO: '1990-03-01', measuredAtISO: visit.clinicalDateISO, weight: 60 } },
  { dedup: false, patientId });
  return (await vault.getPatientVisits(receipt.patientId)).find(row => row.visitId === visit.visitId);
}
function documentFor(row, changes = {}) {
  return { id: 'fictional-visit-document-' + globalThis.crypto.randomUUID(), patientId: row.patientId,
    category: 'wynik-badania', title: 'Fikcyjny wynik próby', body: 'Wyłącznie fikcyjna dokumentacja testowa.',
    clinicalDateISO: SAMPLE_DAY, labResult: { test: 'Fikcyjny analit', value: '12', valueNum: 12, unit: 'mg/L' },
    visitContext: { version: 1, visitId: row.visitId, clinicalDateISO: row.clinicalDateISO }, ...changes };
}
function guarded(vault, note, options = {}) {
  return vault.savePatientNoteOnce(note, { requireActiveVisit: true, isCurrent: () => true, ...options });
}
function trash(vault, row, options = {}) {
  return vault.moveVisitToTrash(row.patientId, row.visitId, {
    snapshotId: row.snapshotId, revision: row.rev, isCurrent: () => true, ...options
  });
}
function encryptions(device, from) {
  return device.krypto.log.slice(from).filter(entry => entry.metoda === 'encrypt');
}
async function twoTabs() {
  przechwycZadaniaWTle();
  const first = await oknoMagazynu({ konta: 'A', bramka: false });
  windows.push(first);
  const row = await recordedVisit(first.v);
  const second = await drugieOkno(first, { konta: 'A', bramka: false, zaloguj: 'A' });
  windows.push(second);
  return { first, second, row };
}

describe('guarded clinical documents at the native Vault write boundary', () => {
  it('stores an encrypted document once for its canonical visit, retaining its separate sample date', async () => {
    const device = await urzadzenie(), row = await recordedVisit(device.v), note = documentFor(row);
    const changes = [];
    device.v.onPatientNoteChanged(event => { changes.push(event); });
    expect(await guarded(device.v, note)).toMatchObject({ id: note.id, saved: true, reused: false });
    const saved = await device.v.getPatientNote(note.id);
    expect(saved).toMatchObject({ patientId: row.patientId, visitContext: note.visitContext,
      clinicalDateISO: SAMPLE_DAY, rev: 1 });
    const encrypted = JSON.stringify(await device.baza.getPatientNoteForUser(device.A.userId, note.id));
    expect(encrypted).not.toContain(note.body);
    expect(encrypted).not.toContain(row.visitId);
    expect(encrypted).not.toContain(VISIT_DAY);
    expect(await guarded(device.v, note)).toEqual({ id: note.id, saved: true, reused: true });
    expect(await device.v.getPatientNote(note.id)).toEqual(saved);
    expect(changes).toHaveLength(1);
  });

  it('rejects missing or malformed visit origins before encrypting a new document', async () => {
    const device = await urzadzenie(), row = await recordedVisit(device.v);
    const invalid = [undefined, null, {}, { version: 2, visitId: row.visitId, clinicalDateISO: VISIT_DAY },
      { version: 1, visitId: 'fictional-invalid-visit', clinicalDateISO: VISIT_DAY },
      { version: 1, visitId: row.visitId, clinicalDateISO: '2026-02-30' }];
    for (const visitContext of invalid) {
      const note = documentFor(row, { visitContext }), start = device.krypto.log.length;
      await expect(guarded(device.v, note)).rejects.toMatchObject({ code: 'VISIT_DOCUMENT_INVALID' });
      expect(encryptions(device, start)).toEqual([]);
      expect(await device.v.getPatientNote(note.id)).toBeNull();
    }
  });

  it('rejects absent, differently owned, differently dated and nonactive visits without a write', async () => {
    const device = await urzadzenie(), row = await recordedVisit(device.v);
    const other = await recordedVisit(device.v);
    expect(other.patientId).not.toBe(row.patientId);
    const notes = [
      documentFor(row, { patientId: globalThis.crypto.randomUUID() }),
      documentFor(row, { patientId: other.patientId }),
      documentFor(row, { visitContext: { version: 1, visitId: row.visitId, clinicalDateISO: '2026-11-04' } }),
      documentFor(row, { visitContext: { version: 1, visitId: globalThis.crypto.randomUUID(), clinicalDateISO: VISIT_DAY } })
    ];
    for (const note of notes) {
      const start = device.krypto.log.length;
      await expect(guarded(device.v, note)).rejects.toMatchObject({ code: 'VISIT_DOCUMENT_STALE' });
      expect(encryptions(device, start)).toEqual([]);
      expect(await device.v.getPatientNote(note.id)).toBeNull();
    }
    await trash(device.v, row);
    const afterTrash = documentFor(row), start = device.krypto.log.length;
    await expect(guarded(device.v, afterTrash)).rejects.toMatchObject({ code: 'VISIT_DOCUMENT_STALE' });
    expect(encryptions(device, start)).toEqual([]);
    expect(await device.v.getPatientNote(afterTrash.id)).toBeNull();
    expect((await device.v.getPatientVisits(other.patientId)).map(visit => visit.visitId)).toContain(other.visitId);
  });

  it('acknowledges an identical saved document after visit Trash and never recreates a deleted note', async () => {
    const device = await urzadzenie(), row = await recordedVisit(device.v), note = documentFor(row);
    await guarded(device.v, note);
    const saved = await device.v.getPatientNote(note.id);
    await trash(device.v, row);
    const start = device.krypto.log.length;
    expect(await guarded(device.v, note)).toEqual({ id: note.id, saved: true, reused: true });
    expect(encryptions(device, start)).toEqual([]);
    expect(await device.v.getPatientNote(note.id)).toEqual(saved);
    await device.v.removePatientNote(note.id);
    expect(await guarded(device.v, note)).toEqual({ id: note.id, saved: false, reason: 'deleted' });
    expect(await device.v.getPatientNote(note.id)).toBeNull();
    expect(await device.v.getPatientVisits(row.patientId)).toEqual([]);
  });

  it('retains the ordinary unguarded create-once contract for imported or historical origins', async () => {
    const device = await urzadzenie(), row = await recordedVisit(device.v);
    const note = documentFor(row, { visitContext: { version: 1,
      visitId: globalThis.crypto.randomUUID(), clinicalDateISO: '2025-10-01' } });
    expect(await device.v.savePatientNoteOnce(note)).toMatchObject({ saved: true, reused: false });
    expect(await device.v.getPatientNote(note.id)).toMatchObject({ visitContext: note.visitContext });
    const general = documentFor(row);
    delete general.visitContext;
    expect(await device.v.savePatientNoteOnce(general)).toMatchObject({ saved: true, reused: false });
    expect(await device.v.getPatientNote(general.id)).not.toHaveProperty('visitContext');
  });

  it('captures requireActiveVisit before waiting, so mutating caller options cannot disable the guard', async () => {
    const device = await urzadzenie(), row = await recordedVisit(device.v), note = documentFor(row);
    await trash(device.v, row);
    const lockName = 'vilda-save-pat:' + row.patientId;
    const held = await device.locks.trzymaj(lockName), waiting = deferred();
    const options = { requireActiveVisit: true, isCurrent: () => true, onLockWait: waiting.resolve };
    const request = device.v.savePatientNoteOnce(note, options);
    const rejected = expect(request).rejects.toMatchObject({ code: 'VISIT_DOCUMENT_STALE' });
    try {
      await waiting.promise;
      options.requireActiveVisit = false;
    } finally { await held.zwolnij(); }
    await rejected;
    expect(await device.v.getPatientNote(note.id)).toBeNull();
  });

  it('retains the captured owner check when it becomes false during document encryption', async () => {
    const device = await urzadzenie(), row = await recordedVisit(device.v), note = documentFor(row);
    let current = true;
    const options = { requireActiveVisit: true, isCurrent: () => current };
    const gate = device.krypto.wstrzymaj('encrypt');
    const request = device.v.savePatientNoteOnce(note, options);
    const rejected = expect(request).rejects.toThrow();
    try {
      await gate.osiagnieta;
      current = false;
      options.isCurrent = () => true;
    } finally { gate.zwolnij(); }
    await rejected;
    expect(await device.v.getPatientNote(note.id)).toBeNull();
    expect((await device.v.getPatientVisits(row.patientId)).map(visit => visit.visitId)).toContain(row.visitId);
  });
});

describe('clinical document and visit Trash races across two IndexedDB tabs', () => {
  it('rejects a document after another tab trashes the visit between its prior read and save', async () => {
    const { first, second, row } = await twoTabs(), note = documentFor(row);
    // This is the successful earlier encounter confirmation used by a caller.
    expect(await first.v.getPatientVisits(row.patientId)).toMatchObject([{ visitId: row.visitId }]);
    const [otherRow] = await second.v.getPatientVisits(row.patientId);
    await trash(second.v, otherRow);
    const start = first.krypto.log.length;
    await expect(guarded(first.v, note)).rejects.toMatchObject({ code: 'VISIT_DOCUMENT_STALE' });
    expect(encryptions(first, start)).toEqual([]);
    for (const tab of [first, second]) {
      expect(await tab.v.getPatientNote(note.id)).toBeNull();
      expect(await tab.v.getPatientVisits(row.patientId)).toEqual([]);
      expect(await tab.v.listTrashedVisits(row.patientId)).toMatchObject([{ visitId: row.visitId }]);
    }
  });

  it('holds the shared patient lock through encryption, allowing the document to commit before queued Trash', async () => {
    const { first, second, row } = await twoTabs(), note = documentFor(row);
    const [otherRow] = await second.v.getPatientVisits(row.patientId);
    const gate = first.krypto.wstrzymaj('encrypt'), order = [];
    first.v.onPatientNoteChanged(event => { if (event.id === note.id) order.push('document'); });
    const creation = guarded(first.v, note);
    let removal, removalFinished = false;
    try {
      await gate.osiagnieta;
      const lockStart = first.locks.zadania.length;
      removal = trash(second.v, otherRow).then(receipt => {
        removalFinished = true; order.push('trash'); return receipt;
      });
      const queued = await first.locks.czekajNaZadanie(entry => entry.wynik === 'w-kolejce', { od: lockStart });
      expect(queued.nazwa).toBe('vilda-save-pat:' + row.patientId);
      expect(removalFinished).toBe(false);
      expect(await first.v.getPatientNote(note.id)).toBeNull();
    } finally { gate.zwolnij(); }
    expect(await creation).toMatchObject({ id: note.id, saved: true, reused: false });
    expect(await removal).toMatchObject({ patientId: row.patientId, visitId: row.visitId });
    expect(order).toEqual(['document', 'trash']);
    for (const tab of [first, second]) {
      expect(await tab.v.getPatientNote(note.id)).toMatchObject({ visitContext: note.visitContext, rev: 1 });
      expect(await tab.v.getPatientVisits(row.patientId)).toEqual([]);
      expect(await tab.v.listTrashedVisits(row.patientId)).toMatchObject([{ visitId: row.visitId }]);
    }
  });
});
