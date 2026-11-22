import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { urzadzenie, sprzatnij } from './sesja-zapisu-uprzaz.mjs';
import { drugieOkno, oknoMagazynu, przechwycZadaniaWTle } from '../support/okno-magazynu.mjs';

const DAY = 86400000;
const firstDay = '2025-11-03';
const laterDay = '2025-11-15';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-02-02T12:00:00Z'));
});
afterEach(async () => {
  await sprzatnij();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function advance(ms = 60000) {
  vi.setSystemTime(Date.now() + ms);
}
function appointment(day) {
  return { version: 1, visitId: globalThis.crypto.randomUUID(), patientId: null,
    createdAtISO: day + 'T12:00:00Z', clinicalDateISO: day, origin: 'explicit' };
}
async function save(vault, visit, patientId, weight) {
  advance();
  return vault.savePatient({ name: 'Próbna Ewa', visit, user: {
    firstName: 'Ewa', lastName: 'Próbna', sex: 'F', dobISO: '1990-03-01', measuredAtISO: visit.clinicalDateISO, weight
  } }, { dedup: false, patientId });
}
function move(vault, row, overrides = {}) {
  return vault.moveVisitToTrash(row.patientId, row.visitId, {
    snapshotId: row.snapshotId, revision: row.rev, isCurrent: () => true, ...overrides
  });
}
function restore(vault, group, overrides = {}) {
  return vault.restoreTrashedVisit(group.patientId, group.visitId, {
    trashId: group.trashId, isCurrent: () => true, ...overrides
  });
}
function active(vault, patientId) {
  return vault.getPatientVisits(patientId);
}
async function history(vault, patientId) {
  return (await vault.getPatient(patientId)).snapshots.map(s => ({
    id: s.snapshotId, day: s.payload.visit?.clinicalDateISO, saved: s.savedAtISO,
    measured: s.payload.user?.measuredAtISO, weight: s.payload.user?.weight, pinned: s.pinned === true
  }));
}

describe('whole-visit trash in the encrypted vault', () => {
  it('moves all revisions of precisely one visit and restores their IDs, clinical dates, values and pins', async () => {
    const d = await urzadzenie(), v = d.v;
    const target = appointment(firstDay), other = appointment(firstDay);
    const first = await save(v, target, null, 70);
    const pid = first.patientId;
    await save(v, other, pid, 65);
    const last = await save(v, target, pid, 69);
    await v.setSnapshotPinned(pid, first.snapshotId, true);
    const row = (await active(v, pid)).find(r => r.visitId === target.visitId);
    const before = await history(v, pid);
    advance();
    const moved = await move(v, row);
    expect(moved).toMatchObject({ patientId: pid, visitId: target.visitId, revisionCount: 2, snapshotId: last.snapshotId });
    expect((await active(v, pid)).map(r => r.visitId)).toEqual([other.visitId]);
    const groups = await v.listTrashedVisits(pid);
    expect(groups).toHaveLength(1);
    const [group] = groups;
    expect(group).toMatchObject({ trashId: moved.trashId, visitId: target.visitId, snapshotId: last.snapshotId,
      revisionCount: 2, clinicalDateISO: firstDay });
    expect(Date.parse(group.expiresAtISO) - Date.parse(group.deletedAtISO)).toBe(30 * DAY);

    const raw = await d.baza.getUserMeta(d.A.userId);
    expect(JSON.stringify(raw)).not.toContain(target.visitId);
    expect(JSON.stringify(raw)).not.toContain('Próbna');
    expect(JSON.stringify(raw)).not.toContain(firstDay);
    await expect(v.restoreTrashedSnapshot(pid, first.snapshotId)).rejects.toThrow();
    expect(await v.listTrashedVisits(pid)).toEqual(groups);

    advance();
    await restore(v, group);
    expect(await history(v, pid)).toEqual(before);
    expect((await active(v, pid)).find(r => r.visitId === target.visitId)).toMatchObject({
      snapshotId: last.snapshotId, revisionCount: 2, clinicalDateISO: firstDay
    });
    expect(await v.listTrashedVisits(pid)).toEqual([]);
  });

  it('requires restoring the visit before a separately trashed older revision can rejoin it', async () => {
    const { v } = await urzadzenie(), id = appointment(firstDay);
    const first = await save(v, id, null, 63), pid = first.patientId;
    const second = await save(v, id, pid, 64), other = appointment(laterDay);
    await save(v, other, pid, 65);
    const before = await history(v, pid);
    advance();
    await v.moveSnapshotToTrash(pid, first.snapshotId);
    const target = (await active(v, pid)).find(row => row.visitId === id.visitId);
    expect(target).toMatchObject({ snapshotId: second.snapshotId, revisionCount: 1 });
    advance();
    const group = await move(v, target);
    await expect(v.restoreTrashedSnapshot(pid, first.snapshotId)).rejects.toMatchObject({ code: 'VISIT_TRASH_GROUP' });
    expect((await active(v, pid)).map(row => row.visitId)).toEqual([other.visitId]);
    expect(await v.listTrashedVisits(pid)).toMatchObject([{ trashId: group.trashId, revisionCount: 1 }]);

    advance();
    await restore(v, group);
    expect((await active(v, pid)).find(row => row.visitId === id.visitId).sourceSnapshotIds).toEqual([second.snapshotId]);
    advance();
    await v.restoreTrashedSnapshot(pid, first.snapshotId);
    expect(await history(v, pid)).toEqual(before);
    const recovered = (await active(v, pid)).find(row => row.visitId === id.visitId);
    expect(recovered.sourceSnapshotIds.sort()).toEqual([first.snapshotId, second.snapshotId].sort());
  });

  it('keeps the last patient chart searchable, makes a distinct new visit and can still restore the first one', async () => {
    const { v } = await urzadzenie(), visit = appointment(firstDay);
    const first = await save(v, visit, null, 69), pid = first.patientId;
    await save(v, visit, pid, 68);
    const initial = await history(v, pid);
    const [row] = await active(v, pid);
    advance();
    const group = await move(v, row);
    expect(await active(v, pid)).toEqual([]);
    expect((await v.getPatient(pid)).header.name).toBe('Próbna Ewa');
    expect((await v.getPatient(pid)).snapshots).toEqual([]);
    const latest = await v.getLatestSnapshot(pid);
    expect(latest.payload.user).toMatchObject({ firstName: 'Ewa', lastName: 'Próbna', dobISO: '1990-03-01' });
    expect(latest.payload.user.weight).toBeUndefined();
    expect(latest.payload.user.measuredAtISO).toBeUndefined();
    expect(latest.payload.visit).toBeUndefined();
    async function checkDirectory(expectedCount) {
      const both = await Promise.all([v.listPatients({strict: true}), v.listPatientDirectory()]);
      for (const rows of both) {
        const chart = rows.find(r => r.patientId === pid);
        expect(chart).toMatchObject({ snapshotCount: expectedCount, header: { name: 'Próbna Ewa', dobISO: '1990-03-01' } });
        expect(chart.header.weight).toBeUndefined();
        expect(chart.header.measuredAtISO).toBeUndefined();
      }
    }
    await checkDirectory(0);

    const next = appointment(laterDay);
    await save(v, next, pid, 61);
    expect((await active(v, pid)).map(r => r.visitId)).toEqual([next.visitId]);
    await checkDirectory(1);
    advance();
    await restore(v, group);
    expect((await active(v, pid)).map(r => r.visitId)).toEqual([next.visitId, visit.visitId]);
    await checkDirectory(3);
    const restored = (await history(v, pid)).filter(r => initial.some(old => old.id === r.id));
    expect(restored).toEqual(initial);
  });

  it('refuses stale revisions, stale selection and a restore request from an earlier trash cycle', async () => {
    const { v } = await urzadzenie(), identity = appointment(firstDay);
    const first = await save(v, identity, null, 75), pid = first.patientId;
    await save(v, appointment(laterDay), pid, 73);
    const [other, older] = await active(v, pid);
    const corrected = JSON.parse(JSON.stringify(older.payload));
    corrected.user.weight = 74;
    advance();
    await v.updateSnapshotPayload(pid, first.snapshotId, corrected, { expectedVisit: {
      visitId: older.visitId, revision: older.rev, isCurrent: () => true
    } });
    const before = await history(v, pid);
    await expect(move(v, older)).rejects.toThrow();
    const newest = (await active(v, pid)).find(r => r.visitId === identity.visitId);
    await expect(move(v, newest, { isCurrent: () => false })).rejects.toThrow();
    await expect(move(v, newest, { snapshotId: other.snapshotId })).rejects.toThrow();
    expect(await history(v, pid)).toEqual(before);
    expect(await v.listTrashedVisits(pid)).toEqual([]);

    advance();
    const archived = await move(v, newest);
    advance();
    await restore(v, archived);
    advance();
    const again = await move(v, (await active(v, pid)).find(r => r.visitId === identity.visitId));
    expect(again.trashId).not.toBe(archived.trashId);
    await expect(restore(v, archived)).rejects.toThrow();
    expect((await v.listTrashedVisits(pid)).map(r => r.trashId)).toEqual([again.trashId]);
  });

  it('synchronizes deletion and restoration of the last visit without an older peer resurrecting any revision', async () => {
    const { v: a } = await urzadzenie(), { v: b } = await urzadzenie(), identity = appointment(firstDay);
    const first = await save(a, identity, null, 48), pid = first.patientId;
    const last = await save(a, identity, pid, 49);
    const oldCopy = await a.exportSyncPayload();
    await b.mergeSyncPayload(oldCopy);
    advance();
    const moved = await move(a, (await active(a, pid))[0]);
    const deletion = await a.exportSyncPayload();
    await a.mergeSyncPayload(oldCopy);
    await b.mergeSyncPayload(deletion);
    for (const v of [a, b]) {
      expect(await active(v, pid)).toEqual([]);
      expect(await v.listTrashedVisits(pid)).toMatchObject([{ trashId: moved.trashId, revisionCount: 2 }]);
    }
    advance();
    await restore(b, (await b.listTrashedVisits(pid))[0]);
    await a.mergeSyncPayload(await b.exportSyncPayload());
    await b.mergeSyncPayload(deletion);
    for (const v of [a, b]) {
      const [live] = await active(v, pid);
      expect(live).toMatchObject({ visitId: identity.visitId, snapshotId: last.snapshotId, clinicalDateISO: firstDay });
      expect(live.sourceSnapshotIds.sort()).toEqual([first.snapshotId, last.snapshotId].sort());
      expect(await v.listTrashedVisits(pid)).toEqual([]);
    }
  });

  it('can restore a group received in parts only after the last member arrives', async () => {
    const { v: author } = await urzadzenie(), { v: peer } = await urzadzenie();
    const id = appointment(firstDay), first = await save(author, id, null, 65);
    const pid = first.patientId, last = await save(author, id, pid, 66);
    await save(author, appointment(laterDay), pid, 67);
    await peer.mergeSyncPayload(await author.exportSyncPayload());
    const before = await history(peer, pid);
    advance();
    const entry = await move(author, (await active(author, pid)).find(row => row.visitId === id.visitId));
    const deletion = await author.exportSyncPayload();
    expect(deletion.snapshotTombstones.map(t => t.snapshotId).sort()).toEqual([first.snapshotId, last.snapshotId].sort());
    await peer.mergeSyncPayload({ ...deletion, snapshotTombstones: deletion.snapshotTombstones.slice(0, 1) });
    expect(await peer.listTrashedVisits(pid)).toEqual([]);
    expect(await peer.listTrashedSnapshots()).toEqual([]);
    await expect(restore(peer, entry)).rejects.toThrow();
    await expect(peer.restoreTrashedSnapshot(pid, deletion.snapshotTombstones[0].snapshotId)).rejects.toThrow();
    await peer.mergeSyncPayload({ ...deletion, snapshotTombstones: deletion.snapshotTombstones.slice(1) });
    expect(await peer.listTrashedVisits(pid)).toMatchObject([{ trashId: entry.trashId, revisionCount: 2 }]);
    advance();
    await restore(peer, entry);
    expect(await history(peer, pid)).toEqual(before);
  });

  it('treats legacy revisions inferred from the same measurement day as one reversible visit', async () => {
    const d = await urzadzenie(), v = d.v;
    const day = appointment(firstDay), newer = appointment(laterDay);
    const a = await save(v, day, null, 65), pid = a.patientId;
    const b = await save(v, day, pid, 66);
    await save(v, newer, pid, 67);
    // Simulate rows actually written by a release which predates explicit visit IDs.
    for (const row of await d.baza.listSnapshotsForUser(d.A.userId, pid)) {
      if (![a.snapshotId, b.snapshotId].includes(row.snapshotId)) continue;
      const original = await v.decryptPayloadForCurrentUser(row.payloadCipher.iv, row.payloadCipher.data);
      delete original.visit;
      await d.baza.putSnapshotForUser(d.A.userId, { ...row, payloadCipher: await v.encryptPayloadForCurrentUser(original) });
    }
    const [, legacy] = await active(v, pid);
    expect(legacy).toMatchObject({ origin: 'legacy-inferred', clinicalDateISO: firstDay, revisionCount: 2 });
    advance();
    const entry = await move(v, legacy);
    expect((await active(v, pid)).map(r => r.visitId)).toEqual([newer.visitId]);
    advance();
    await restore(v, entry);
    const [, recovered] = await active(v, pid);
    expect(recovered).toMatchObject({ visitId: legacy.visitId, origin: 'legacy-inferred', clinicalDateISO: firstDay,
      sourceSnapshotIds: expect.arrayContaining([a.snapshotId, b.snapshotId]), revisionCount: 2 });
  });

  it('does not let a restore from a stale trash view replace a later correction made on another device', async () => {
    const { v: a } = await urzadzenie(), { v: b } = await urzadzenie(), id = appointment(firstDay);
    const initial = await save(a, id, null, 53), pid = initial.patientId;
    const last = await save(a, id, pid, 54);
    await save(a, appointment(laterDay), pid, 55);
    await b.mergeSyncPayload(await a.exportSyncPayload());
    const [, onB] = await active(b, pid);
    advance();
    const entry = await move(a, (await active(a, pid)).find(r => r.visitId === id.visitId));
    advance();
    const corrected = JSON.parse(JSON.stringify(onB.payload));
    corrected.user.weight = 57;
    await b.updateSnapshotPayload(pid, last.snapshotId, corrected, { expectedVisit: {
      visitId: id.visitId, revision: onB.rev, isCurrent: () => true
    } });
    await a.mergeSyncPayload(await b.exportSyncPayload());
    await expect(restore(a, entry)).rejects.toThrow();
    const current = (await active(a, pid)).find(r => r.visitId === id.visitId);
    expect(current).toMatchObject({ snapshotId: last.snapshotId, payload: { user: { weight: 57 } } });
  });

  it('expires the grouped trash contents without resurrecting a consultation from a pre-deletion export', async () => {
    const { v } = await urzadzenie(), identity = appointment(firstDay);
    const first = await save(v, identity, null, 48), pid = first.patientId;
    await save(v, appointment(laterDay), pid, 50);
    const old = await v.exportSyncPayload();
    advance();
    const group = await move(v, (await active(v, pid)).find(r => r.visitId === identity.visitId));
    advance(31 * DAY);
    expect(await v.listTrashedVisits(pid)).toEqual([]);
    await expect(restore(v, group)).rejects.toThrow();
    await v.mergeSyncPayload(old);
    expect((await active(v, pid)).map(r => r.visitId)).not.toContain(identity.visitId);
  });
});

describe('whole-visit write boundary', () => {
  it('ends a pending delete in its original session if the account changes', async () => {
    const d = await urzadzenie(), v = d.v, id = appointment(firstDay);
    const first = await save(v, id, null, 63);
    const pid = first.patientId;
    await save(v, id, pid, 62);
    const historyBefore = await history(v, pid);
    const [row] = await active(v, pid);
    const gate = d.krypto.wstrzymaj('encrypt');
    const request = move(v, row);
    const failure = expect(request).rejects.toThrow();
    await gate.osiagnieta;
    try {
      await d.przelacz('B');
    } finally {
      gate.zwolnij();
    }
    await failure;
    expect(await v.listTrashedVisits(pid)).toEqual([]);
    await d.zaloguj('A');
    expect(await history(v, pid)).toEqual(historyBefore);
    expect(await v.listTrashedVisits(pid)).toEqual([]);
  });

  it('enqueues every removed and restored revision for incremental sync', async () => {
    przechwycZadaniaWTle();
    const device = await oknoMagazynu({ konta: 'A', emisja: true, bramka: false });
    const v = device.v, id = appointment(firstDay);
    const first = await save(v, id, null, 63), pid = first.patientId;
    const second = await save(v, id, pid, 64);
    await save(v, appointment(laterDay), pid, 68);
    const [, older] = await active(v, pid);
    device.win.VILDA_EVENT_LOG = true;
    const entries = async kind => {
      await device.ev.emissionsSettled();
      await device.cisza();
      return device.kolejka('A').filter(row => row.kind === kind).map(row => row.entityKey).sort();
    };
    advance();
    const entry = await move(v, older);
    const ids = [first.snapshotId, second.snapshotId].sort();
    expect(await entries('stomb')).toEqual(ids);
    advance();
    await restore(v, entry);
    expect(await entries('snap')).toEqual(ids.map(sid => pid + '/' + sid));
  });

  it.each([
    { mode: 'private', chmura: [], store: 'snapshots' },
    { mode: 'cloud-only', chmura: ['A'], store: 'meta' }
  ])('rolls back a failed $mode IndexedDB write and allows a clean retry', async ({ chmura, store }) => {
    przechwycZadaniaWTle();
    const device = await oknoMagazynu({ konta: 'A', bramka: false, chmura });
    const v = device.v, id = appointment(firstDay);
    const first = await save(v, id, null, 83), pid = first.patientId;
    await save(v, id, pid, 82);
    const historyBefore = await history(v, pid);
    const [row] = await active(v, pid);
    const abortNextGroupWrite = () => device.idb.__atrapa.usterka({
      przy: 'commit', baza: 'vilda_user_' + device.A.userId, sklep: store, tryb: 'readwrite', blad: 'QuotaExceededError'
    });

    const deleteFailure = abortNextGroupWrite();
    await expect(move(v, row)).rejects.toThrow();
    expect(deleteFailure.uzyta).toBe(1);
    expect(await history(v, pid)).toEqual(historyBefore);
    expect(await v.listTrashedVisits(pid)).toEqual([]);

    const entry = await move(v, row);
    expect(await active(v, pid)).toEqual([]);
    expect((await v.listPatients({strict: true})).find(r => r.patientId === pid)?.snapshotCount).toBe(0);
    const restoreFailure = abortNextGroupWrite();
    await expect(restore(v, entry)).rejects.toThrow();
    expect(restoreFailure.uzyta).toBe(1);
    expect(await active(v, pid)).toEqual([]);
    expect((await v.listTrashedVisits(pid)).map(g => g.trashId)).toEqual([entry.trashId]);

    advance();
    await restore(v, entry);
    expect(await history(v, pid)).toEqual(historyBefore);
    expect((await v.listPatientDirectory()).find(r => r.patientId === pid)?.snapshotCount).toBe(historyBefore.length);
  });

  it('serializes simultaneous moves and restores of one visit from two IndexedDB tabs', async () => {
    przechwycZadaniaWTle();
    const device = await oknoMagazynu({ konta: 'A', bramka: false });
    const v = device.v, id = appointment(firstDay);
    const { patientId: pid } = await save(v, id, null, 54);
    await save(v, id, pid, 53);
    await save(v, appointment(laterDay), pid, 52);
    const before = await history(v, pid), [, row] = await active(v, pid);
    const secondTab = await drugieOkno(device, { konta: 'A', bramka: false, zaloguj: 'A' });
    const [, secondRow] = await active(secondTab.v, pid);
    advance();
    const movers = await Promise.allSettled([move(v, row), move(secondTab.v, secondRow)]);
    expect(movers.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(await active(v, pid)).toHaveLength(1);
    const [entry] = await v.listTrashedVisits(pid);
    expect(entry.revisionCount).toBe(2);
    advance();
    const [secondEntry] = await secondTab.v.listTrashedVisits(pid);
    const restorers = await Promise.allSettled([restore(v, entry), restore(secondTab.v, secondEntry)]);
    expect(restorers.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(await history(v, pid)).toEqual(before);
    expect(await v.listTrashedVisits(pid)).toEqual([]);
  });
});
