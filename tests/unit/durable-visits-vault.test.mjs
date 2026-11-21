import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
const PASSWORD = 'Fictional#Visits!2026Aa';
const copy = value => JSON.parse(JSON.stringify(value));
function storage() { const data = new Map(); return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key), key: index => [...data.keys()][index] ?? null, get length() { return data.size; } }; }
async function device() {
  const win = { crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: storage(), sessionStorage: storage(), setTimeout, clearTimeout, addEventListener() {}, removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {}, hidden: false } };
  win.window = win; win.self = win; win.top = win; win.localStorage.setItem('vildaRetention', '0');
  loadBrowserScript('vilda_crypto.js', win); loadBrowserScript('vilda_retention.js', win); loadBrowserScript('vilda_vault.js', win);
  const vault = win.VildaVault, adapter = vault.createInMemoryAdapter(); vault.setStorageAdapter(adapter);
  await vault.createUser(PASSWORD, { label: 'Fictional visit tests', iterations: 10000 });
  return { vault, adapter, win };
}
function clock(iso = '2026-01-01T10:00:00.000Z') { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(iso)); }
function next(iso) { vi.setSystemTime(new Date(iso)); }
function visit(day = '2026-01-01') { return { version: 1, visitId: globalThis.crypto.randomUUID(), patientId: null, clinicalDateISO: day, createdAtISO: new Date().toISOString(), origin: 'explicit' }; }
function payload(metadata, height = 130) { return { name: 'Fikcyjny Pacjent Wizyt', user: { firstName: 'Fikcyjny', lastName: 'Pacjent Wizyt', sex: 'M', dobISO: '2016-01-01', age: 10, ageMonths: 0, height, weight: 30, measuredAtISO: metadata?.clinicalDateISO || '2026-01-01' }, ...(metadata ? { visit: metadata } : {}) }; }
async function save(vault, metadata, patientId, height = 130) { return vault.savePatient(payload(metadata, height), { dedup: false, ...(patientId ? { patientId } : {}) }); }
async function stripMetadata(vault, adapter, patientId) {
  const userId = vault.getCurrentUser().userId;
  for (const row of await adapter.listSnapshotsForUser(userId, patientId)) {
    const plain = await vault.decryptPayloadForCurrentUser(row.payloadCipher.iv, row.payloadCipher.data); delete plain.visit;
    await adapter.putSnapshotForUser(userId, { ...row, payloadCipher: await vault.encryptPayloadForCurrentUser(plain) });
  }
}
afterEach(() => vi.useRealTimers());

describe('durable encrypted visit identity', () => {
  it('groups revisions but keeps two explicit visits on one day distinct; corrections do not change UUID or date', async () => {
    clock(); const { vault, adapter } = await device(); const firstVisit = visit(), secondVisit = visit();
    const first = await save(vault, firstVisit); next('2026-01-01T11:00:00Z');
    const revision = await save(vault, firstVisit, first.patientId, 131); next('2026-01-01T12:00:00Z');
    await save(vault, secondVisit, first.patientId, 132); next('2026-02-01T10:00:00Z');
    const corrected = await save(vault, firstVisit, first.patientId, 133);
    const groups = await vault.getPatientVisits(first.patientId);
    expect(groups).toHaveLength(2);
    const firstGroup = groups.find(row => row.visitId === firstVisit.visitId);
    expect(firstGroup).toMatchObject({ clinicalDateISO: '2026-01-01', snapshotId: corrected.snapshotId, revisionCount: 3 });
    expect(firstGroup.sourceSnapshotIds).toEqual(expect.arrayContaining([first.snapshotId, revision.snapshotId, corrected.snapshotId]));
    expect(firstGroup.payload.user.height).toBe(133);
    expect(vault.getCommittedSavePayload(corrected).visit).toMatchObject({ ...firstVisit, patientId: first.patientId });
    const raw = await adapter.listSnapshotsForUser(vault.getCurrentUser().userId, first.patientId);
    expect(raw.every(row => !('visit' in row) && !('visitId' in row) && !('clinicalDateISO' in row))).toBe(true);
    expect(JSON.stringify(raw)).not.toContain(firstVisit.visitId);
  });
  it('corrects only the selected visit revision, preserves the latest visit and refuses stale edits', async () => {
    clock();
    const { vault } = await device();
    const older = await save(vault, visit()); next('2026-02-01T12:00:00Z');
    const latest = await save(vault, visit('2026-02-01'), older.patientId, 141);
    const target = (await vault.getPatientVisits(older.patientId)).find(row => row.snapshotId === older.snapshotId);
    const update = copy(target.payload);
    update.user.weight = 31;
    const expectedVisit = { visitId: target.visitId, revision: target.rev, isCurrent: () => true };
    const receipt = await vault.updateSnapshotPayload(older.patientId, older.snapshotId, update, { expectedVisit });
    expect(receipt.visitRevision).toBe(target.rev + 1);
    expect(vault.getCommittedSavePayload(receipt).user.weight).toBe(31);
    expect((await vault.getPatient(older.patientId)).snapshots[0].snapshotId).toBe(latest.snapshotId);
    await expect(vault.updateSnapshotPayload(older.patientId, older.snapshotId, update, { expectedVisit }))
      .rejects.toMatchObject({ code: 'VISIT_REVISION_CHANGED' });
    const rows = await vault.getPatientVisits(older.patientId);
    expect(rows).toHaveLength(2);
    expect(rows.find(row => row.visitId === target.visitId)).toMatchObject({ snapshotId: older.snapshotId, rev: target.rev + 1 });
    const switched = { ...expectedVisit, revision: target.rev + 1, isCurrent: () => false };
    await expect(vault.updateSnapshotPayload(older.patientId, older.snapshotId, update, { expectedVisit: switched }))
      .rejects.toMatchObject({ code: 'VISIT_REVISION_CHANGED' });
  });
  it('preserves identity on restore and on an old writer in-place edit; explicit date correction keeps UUID', async () => {
    clock(); const { vault } = await device(), metadata = visit();
    const first = await save(vault, metadata); next('2026-02-01T10:00:00Z');
    await save(vault, visit('2026-02-01'), first.patientId);
    const restored = await vault.restoreSnapshotAsNew(first.patientId, first.snapshotId);
    const stored = (await vault.getPatient(first.patientId)).snapshots.find(row => row.snapshotId === restored.newSnapshotId);
    expect(stored.payload.visit).toMatchObject({ visitId: metadata.visitId, clinicalDateISO: '2026-01-01' });
    const oldWriter = copy(stored.payload); delete oldWriter.visit; oldWriter.user.height = 135;
    await vault.updateSnapshotPayload(first.patientId, restored.newSnapshotId, oldWriter, { preserveSavedAt: true });
    const edited = (await vault.getPatient(first.patientId)).snapshots.find(row => row.snapshotId === restored.newSnapshotId);
    expect(edited.payload.visit.visitId).toBe(metadata.visitId);
    edited.payload.visit.clinicalDateISO = '2025-12-31'; edited.payload.user.measuredAtISO = '2025-12-31';
    await vault.updateSnapshotPayload(first.patientId, restored.newSnapshotId, edited.payload, { preserveSavedAt: true });
    expect((await vault.getPatientVisits(first.patientId)).find(row => row.visitId === metadata.visitId).clinicalDateISO).toBe('2025-12-31');
    const wrong = copy(edited.payload); wrong.visit.visitId = globalThis.crypto.randomUUID();
    await expect(vault.updateSnapshotPayload(first.patientId, restored.newSnapshotId, wrong)).rejects.toMatchObject({ code: 'VISIT_IDENTITY_CONFLICT' });
  });
  it('infers missing-context dates conservatively instead of collapsing different clinical days', async () => {
    clock(); const { vault } = await device();
    const first = await save(vault, undefined); const second = await save(vault, undefined, first.patientId, 131);
    expect(vault.getCommittedSavePayload(first).visit.visitId).toBe(vault.getCommittedSavePayload(second).visit.visitId);
    const another = payload(); another.user.measuredAtISO = '2026-01-02';
    await vault.savePatient(another, { patientId: first.patientId, dedup: false });
    expect(await vault.getPatientVisits(first.patientId)).toHaveLength(2);
  });
  it('keeps all 45 canonical visits beyond cap and monthly retention while thinning duplicate revisions', async () => {
    clock(); const { vault } = await device(); let patientId; const expected = [];
    for (let index = 0; index < 45; index += 1) {
      const day = new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10); next(day + 'T10:00:00Z');
      const metadata = visit(day), result = await save(vault, metadata, patientId); patientId = result.patientId;
      next(day + 'T11:00:00Z'); expected.push((await save(vault, metadata, patientId, 131)).snapshotId);
    }
    next('2026-11-14T12:00:00Z'); const result = await vault.pruneSnapshotsForPatient(patientId);
    expect(result.prunedCount).toBe(45); const patient = await vault.getPatient(patientId);
    expect(patient.snapshots).toHaveLength(45); expect(new Set(patient.snapshots.map(row => row.snapshotId))).toEqual(new Set(expected));
    expect(await vault.getPatientVisits(patientId)).toHaveLength(45);
  });
  it('legacy IDs are deterministic across reads, retention, export, sync and patient merge', async () => {
    clock(); const a = await device(), b = await device();
    const first = await save(a.vault, visit()); next('2026-01-01T11:00:00Z'); await save(a.vault, visit(), first.patientId);
    await stripMetadata(a.vault, a.adapter, first.patientId);
    const legacy = await a.vault.getPatientVisits(first.patientId);
    expect(legacy).toHaveLength(1); expect(legacy[0]).toMatchObject({ origin: 'legacy-inferred', dateSource: 'measuredAt' });
    expect((await a.vault.getPatientVisits(first.patientId))[0].visitId).toBe(legacy[0].visitId);
    await b.vault.mergeSyncPayload(await a.vault.exportSyncPayload());
    expect((await b.vault.getPatientVisits(first.patientId))[0].visitId).toBe(legacy[0].visitId);
    next('2026-11-14T10:00:00Z'); await a.vault.pruneSnapshotsForPatient(first.patientId);
    expect((await a.vault.getPatientVisits(first.patientId))[0].visitId).toBe(legacy[0].visitId);
    const targetPayload = payload(visit('2026-11-14')); targetPayload.name = 'Drugi Fikcyjny'; targetPayload.user.firstName = 'Drugi'; targetPayload.user.lastName = 'Fikcyjny';
    const target = await a.vault.savePatient(targetPayload, { dedup: false });
    await a.vault.mergePatients(first.patientId, target.patientId);
    const moved = (await a.vault.getPatientVisits(target.patientId)).find(row => row.visitId === legacy[0].visitId);
    expect(moved).toBeDefined(); expect(moved.patientId).toBe(target.patientId); expect(moved.payload.visit.patientId).toBe(target.patientId);
  });
  it('Warsaw inference is stable at midnight and does not write on read', async () => {
    clock('2026-01-01T23:30:00Z'); const { vault, adapter } = await device();
    const data = payload(); delete data.user.measuredAtISO; const first = await vault.savePatient(data, { dedup: false });
    await stripMetadata(vault, adapter, first.patientId); let writes = 0;
    const put = adapter.putSnapshotForUser.bind(adapter); adapter.putSnapshotForUser = (...args) => { writes += 1; return put(...args); };
    const groups = await vault.getPatientVisits(first.patientId);
    expect(groups[0]).toMatchObject({ clinicalDateISO: '2026-01-02', dateSource: 'savedAt' }); expect(writes).toBe(0);
  });
  it('old writer sync cannot erase known visit identity and conflicting explicit identity fails visibly', async () => {
    clock(); const { vault } = await device(), metadata = visit(); const first = await save(vault, metadata);
    const oldWriter = copy(await vault.exportSyncPayload()), snapshot = oldWriter.patients[0].snapshots[0];
    delete snapshot.payload.visit; snapshot.payload.user.height = 139; snapshot.updatedAtISO = '2026-01-02T12:00:00Z'; snapshot.rev += 1;
    await vault.mergeSyncPayload(oldWriter);
    const current = (await vault.getPatientVisits(first.patientId))[0]; expect(current.visitId).toBe(metadata.visitId); expect(current.payload.user.height).toBe(139);
    const conflict = copy(await vault.exportSyncPayload()); conflict.patients[0].snapshots[0].payload.visit.visitId = globalThis.crypto.randomUUID();
    conflict.patients[0].snapshots[0].rev += 1; conflict.patients[0].snapshots[0].updatedAtISO = '2026-01-03T12:00:00Z';
    await expect(vault.mergeSyncPayload(conflict)).rejects.toMatchObject({ code: 'VISIT_IDENTITY_CONFLICT' });
  });
  it('legacy retention tombstones cannot delete incoming or local canonical visits, while intentional trash still wins', async () => {
    clock(); const a = await device(), b = await device();
    const first = await save(a.vault, visit()); next('2026-01-02T10:00:00Z'); await save(a.vault, visit('2026-01-02'), first.patientId);
    const incoming = copy(await a.vault.exportSyncPayload());
    incoming.snapshotTombstones = [{ patientId: first.patientId, snapshotId: first.snapshotId, deletedAtISO: '2026-01-10T10:00:00Z', savedAtISO: first.savedAtISO, updatedAtISO: first.savedAtISO, rev: 0, powod: 'retencja' }];
    await b.vault.mergeSyncPayload(incoming); expect(await b.vault.getPatientVisits(first.patientId)).toHaveLength(2);
    await a.vault.mergeSyncPayload({ patients: [], snapshotTombstones: incoming.snapshotTombstones });
    expect(await a.vault.getPatientVisits(first.patientId)).toHaveLength(2);
    next('2026-01-11T12:00:00Z'); await a.vault.moveSnapshotToTrash(first.patientId, first.snapshotId);
    await b.vault.mergeSyncPayload(await a.vault.exportSyncPayload());
    expect((await b.vault.getPatient(first.patientId)).snapshots.some(row => row.snapshotId === first.snapshotId)).toBe(false);
    expect((await b.vault.listTrashedSnapshots()).some(row => row.snapshotId === first.snapshotId)).toBe(true);
  });
  it('retention does not resurrect the former patient when the same visit has a newer head under the merged owner', async () => {
    clock(); const source = await device(), receiver = await device(), metadata = visit();
    const first = await save(source.vault, metadata, undefined, 120);
    next('2026-01-01T11:00:00Z'); const older = await save(source.vault, metadata, first.patientId, 125);
    next('2026-01-01T12:00:00Z'); const head = await save(source.vault, metadata, first.patientId, 130);
    const stalePatient = copy((await source.vault.exportSyncPayload()).patients.find(row => row.patientId === first.patientId));
    next('2026-01-02T10:00:00Z'); const targetData = payload(visit('2026-01-02'));
    targetData.name = 'Drugi Fikcyjny'; targetData.user.firstName = 'Drugi'; targetData.user.lastName = 'Fikcyjny';
    const target = await source.vault.savePatient(targetData, { dedup: false });
    next('2026-01-03T10:00:00Z'); await source.vault.mergePatients(first.patientId, target.patientId);
    next('2026-01-04T10:00:00Z'); await source.vault.pruneSnapshotsForPatient(target.patientId, { cap: 1, recentHours: 0, minCount: 0 });
    const exported = await source.vault.exportSyncPayload();
    expect(exported.snapshotTombstones.find(row => row.snapshotId === older.snapshotId).visitIdentity).toEqual({ version: 1, visitId: metadata.visitId });
    const meta = await source.adapter.getUserMeta(source.vault.getCurrentUser().userId);
    const marker = meta.snapshotTombstones.find(row => row.snapshotId === older.snapshotId);
    expect(marker.payloadCipher).toBeUndefined(); expect(marker.visitIdentity).toBeUndefined();
    expect(await source.vault.decryptPayloadForCurrentUser(marker.visitCipher.iv, marker.visitCipher.data)).toEqual({ version: 1, visitId: metadata.visitId });
    await receiver.vault.mergeSyncPayload(exported);
    const canonicalBefore = (await receiver.vault.getPatientVisits(target.patientId)).find(row => row.visitId === metadata.visitId);
    expect(canonicalBefore.snapshotId).toBe(head.snapshotId);
    expect(canonicalBefore.payload.user.height).toBe(130);
    const oldRevision = stalePatient.snapshots.find(row => row.snapshotId === older.snapshotId);
    oldRevision.payload.user.height = 129; oldRevision.rev += 1; oldRevision.updatedAtISO = '2026-01-03T12:00:00.000Z';
    stalePatient.snapshots = [oldRevision]; stalePatient.snapshotCount = 1; stalePatient.lastSavedAtISO = oldRevision.updatedAtISO;
    // A delayed single-card event has no target snapshots; the retention entry
    // names that existing owner and supplies the only scoped lookup needed.
    await receiver.vault.mergeSyncPayload({ patients: [stalePatient] });
    expect(await receiver.vault.getPatient(first.patientId)).toBeNull();
    const canonicalAfter = (await receiver.vault.getPatientVisits(target.patientId)).find(row => row.visitId === metadata.visitId);
    expect(canonicalAfter).toEqual(canonicalBefore);
    for (let round = 0; round < 2; round += 1) {
      await source.vault.mergeSyncPayload(await receiver.vault.exportSyncPayload());
      await receiver.vault.mergeSyncPayload(await source.vault.exportSyncPayload());
    }
    expect(await receiver.vault.getPatient(first.patientId)).toBeNull();
    expect((await receiver.vault.getPatientVisits(target.patientId)).find(row => row.visitId === metadata.visitId)).toEqual(canonicalBefore);
  });
  it('binds an old writer moved snapshot to its known deletion UUID before legacy inference', async () => {
    clock(); const a = await device(), b = await device(), metadata = visit();
    const first = await save(a.vault, metadata); next('2026-01-01T11:00:00Z');
    await save(a.vault, metadata, first.patientId, 132);
    const old = copy((await a.vault.exportSyncPayload()).patients[0].snapshots.find(row => row.snapshotId === first.snapshotId));
    delete old.payload.visit;
    next('2026-01-02T10:00:00Z'); await a.vault.moveSnapshotToTrash(first.patientId, first.snapshotId);
    const targetData = payload(visit('2026-01-02')); targetData.name = 'Drugi Fikcyjny';
    targetData.user.firstName = 'Drugi'; targetData.user.lastName = 'Fikcyjny';
    const target = await a.vault.savePatient(targetData, { dedup: false });
    const incoming = copy(await a.vault.exportSyncPayload());
    incoming.patients = incoming.patients.filter(row => row.patientId === target.patientId);
    old.rev += 1; incoming.patients[0].snapshots.push(old); incoming.patients[0].snapshotCount += 1;
    incoming.snapshotTombstones = [];
    await a.vault.mergeSyncPayload(incoming);
    const exported = await a.vault.exportSyncPayload();
    const tombstone = exported.snapshotTombstones.find(row => row.snapshotId === first.snapshotId);
    expect(tombstone.visitIdentity).toEqual({ version: 1, visitId: metadata.visitId });
    expect(tombstone.payload.visit).toEqual({ ...metadata, patientId: first.patientId });
    expect(tombstone.payload.user.height).toBe(130);
    await b.vault.mergeSyncPayload(exported);
    expect((await b.vault.exportSyncPayload()).snapshotTombstones.find(row => row.snapshotId === first.snapshotId).visitIdentity).toEqual(tombstone.visitIdentity);
    const conflict = copy(incoming); conflict.patients[0].snapshots.find(row => row.snapshotId === first.snapshotId).payload.visit = visit();
    const before = await a.vault.exportSyncPayload();
    await expect(a.vault.mergeSyncPayload(conflict)).rejects.toMatchObject({ code: 'VISIT_IDENTITY_CONFLICT' });
    expect(await a.vault.exportSyncPayload()).toEqual(before);
    const oldDeletion = copy(tombstone); delete oldDeletion.payload.visit;
    oldDeletion.payload.user.height = 131; oldDeletion.rev += 1;
    oldDeletion.updatedAtISO = '2026-01-01T12:00:00.000Z';
    await a.vault.mergeSyncPayload({ patients: [], snapshotTombstones: [oldDeletion] });
    const updatedDeletion = (await a.vault.exportSyncPayload()).snapshotTombstones.find(row => row.snapshotId === first.snapshotId);
    expect(updatedDeletion.payload.visit).toEqual({ ...metadata, patientId: first.patientId });
    expect(updatedDeletion.payload.user.height).toBe(131);
  });
  it('pinning an older revision never changes the canonical clinical payload', async () => {
    clock(); const { vault } = await device(), metadata = visit();
    const first = await save(vault, metadata, undefined, 120); next('2026-01-01T11:00:00Z');
    const latest = await save(vault, metadata, first.patientId, 125); next('2026-02-01T12:00:00Z');
    await vault.setSnapshotPinned(first.patientId, first.snapshotId, true);
    const group = (await vault.getPatientVisits(first.patientId))[0];
    expect(group.snapshotId).toBe(latest.snapshotId); expect(group.payload.user.height).toBe(125);
    await vault.pruneSnapshotsForPatient(first.patientId, { cap: 1 });
    const after = await vault.getPatient(first.patientId);
    expect(after.snapshots.map(row => row.snapshotId)).toEqual(expect.arrayContaining([first.snapshotId, latest.snapshotId]));
    expect((await vault.getPatientVisits(first.patientId))[0].payload.user.height).toBe(125);
  });
  it('rejects future or corrupt visit metadata instead of silently reassigning identity', async () => {
    clock(); const { vault, adapter } = await device(), metadata = visit(); const first = await save(vault, metadata);
    const future = payload({ ...metadata, version: 2 });
    await expect(vault.updateSnapshotPayload(first.patientId, first.snapshotId, future)).rejects.toMatchObject({ code: 'INVALID_VISIT_IDENTITY' });
    const row = (await adapter.listSnapshotsForUser(vault.getCurrentUser().userId, first.patientId))[0];
    await adapter.putSnapshotForUser(vault.getCurrentUser().userId, { ...row, payloadCipher: await vault.encryptPayloadForCurrentUser(future) });
    await expect(vault.getPatientVisits(first.patientId)).rejects.toMatchObject({ code: 'INVALID_VISIT_IDENTITY' });
    await expect(vault.exportSyncPayload()).rejects.toMatchObject({ code: 'INVALID_VISIT_IDENTITY' });
  });
  it('keeps the deployed W3 checksum compatible when legacy identity is added, without inventing a clinical edit', async () => {
    function checksum(value) {
      const raw = copy(value); delete raw._pinned; delete raw._pinnedState; delete raw._contentAtISO;
      const canonical = item => Array.isArray(item) ? '[' + item.map(canonical).join(',') + ']'
        : item && typeof item === 'object' ? '{' + Object.keys(item).sort().map(key => JSON.stringify(key) + ':' + canonical(item[key])).join(',') + '}' : JSON.stringify(item);
      const text = canonical(raw); let hash = 0x811c9dc5;
      for (let index = 0; index < text.length; index += 1) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 0x01000193) >>> 0; }
      return hash.toString(36) + '.' + text.length.toString(36);
    }
    clock(); const { vault, adapter } = await device(); const first = await save(vault, visit());
    const userId = vault.getCurrentUser().userId, row = (await adapter.listSnapshotsForUser(userId, first.patientId))[0];
    const legacy = await vault.decryptPayloadForCurrentUser(row.payloadCipher.iv, row.payloadCipher.data);
    delete legacy.visit; legacy._pinnedState.h = checksum(legacy);
    await adapter.putSnapshotForUser(userId, { ...row, payloadCipher: await vault.encryptPayloadForCurrentUser(legacy) });
    const migrated = (await vault.getPatientVisits(first.patientId))[0].payload;
    expect(migrated._pinnedState.h).toBe(checksum(migrated));
    expect(migrated._contentAtISO).toBe(legacy._contentAtISO);
    expect(migrated._pinnedState.at).toBe(legacy._pinnedState.at);
    const changedByOldWriter = copy(legacy); changedByOldWriter.user.height = 141;
    await adapter.putSnapshotForUser(userId, { ...row, updatedAtISO: '2026-01-02T10:00:00Z', payloadCipher: await vault.encryptPayloadForCurrentUser(changedByOldWriter) });
    const changed = (await vault.getPatientVisits(first.patientId))[0].payload;
    expect(changed._pinnedState.h).not.toBe(checksum(changed));
    expect(changed.user.height).toBe(141);
  });
  it('rejects a delayed history read after the vault is locked', async () => {
    clock(); const { vault, adapter } = await device(); const first = await save(vault, visit());
    let release, signal; const gate = new Promise(resolve => { release = resolve; }); const started = new Promise(resolve => { signal = resolve; });
    const get = adapter.getPatientForUser.bind(adapter);
    adapter.getPatientForUser = async (...args) => { signal(); await gate; return get(...args); };
    const reading = vault.getPatientVisits(first.patientId); const rejected = expect(reading).rejects.toBeDefined();
    await started; vault.lock(); release(); await rejected;
  });
  it('retains only encrypted deletion identity after 30 days, preventing older revision resurrection in either merge order', async () => {
    clock(); const a = await device(), b = await device(), c = await device(), metadata = visit();
    const first = await save(a.vault, metadata); next('2026-01-01T11:00:00Z');
    const head = await save(a.vault, metadata, first.patientId, 134); next('2026-01-02T11:00:00Z');
    await save(a.vault, visit('2026-01-02'), first.patientId, 140);
    const oldCopy = copy(await a.vault.exportSyncPayload());
    await b.vault.mergeSyncPayload(oldCopy); await c.vault.mergeSyncPayload(oldCopy);
    next('2026-01-03T11:00:00Z'); await a.vault.moveSnapshotToTrash(first.patientId, head.snapshotId);
    next('2026-02-15T11:00:00Z');
    const deletion = copy(await a.vault.exportSyncPayload());
    const marker = deletion.snapshotTombstones.find(row => row.snapshotId === head.snapshotId);
    expect(marker.payload).toBeUndefined(); expect(marker.visitIdentity).toEqual({ version: 1, visitId: metadata.visitId });
    expect(await a.vault.listTrashedSnapshots()).toEqual([]);
    const userId = a.vault.getCurrentUser().userId, raw = await a.adapter.getUserMeta(userId);
    const encrypted = raw.snapshotTombstones.find(row => row.snapshotId === head.snapshotId);
    expect(encrypted.visitIdentity).toBeUndefined(); expect(encrypted.visitCipher).toBeDefined();
    expect(await a.vault.decryptPayloadForCurrentUser(encrypted.visitCipher.iv, encrypted.visitCipher.data)).toEqual({ version: 1, visitId: metadata.visitId });
    const pruned = await a.vault.pruneSnapshotsForPatient(first.patientId);
    expect(pruned.prunedIds).toContain(first.snapshotId);
    const final = copy(await a.vault.exportSyncPayload());
    await b.vault.mergeSyncPayload(final); await b.vault.mergeSyncPayload(oldCopy);
    await c.vault.mergeSyncPayload(oldCopy); await c.vault.mergeSyncPayload(final);
    for (const vault of [a.vault, b.vault, c.vault]) {
      expect((await vault.getPatient(first.patientId)).snapshots.map(row => row.snapshotId)).not.toEqual(expect.arrayContaining([first.snapshotId, head.snapshotId]));
      expect((await vault.getPatientVisits(first.patientId)).some(row => row.visitId === metadata.visitId)).toBe(false);
    }
    const oldWriter = copy(final); oldWriter.snapshotTombstones.forEach(row => { delete row.visitIdentity; });
    await a.vault.mergeSyncPayload(oldWriter);
    expect((await a.vault.exportSyncPayload()).snapshotTombstones.find(row => row.snapshotId === head.snapshotId).visitIdentity).toEqual(marker.visitIdentity);
    const correction = copy(oldCopy); correction.patients[0].snapshots = correction.patients[0].snapshots.filter(row => row.snapshotId === head.snapshotId);
    const corrected = correction.patients[0].snapshots[0]; corrected.updatedAtISO = '2026-02-16T12:00:00Z'; corrected.rev += 1; corrected.payload.user.height = 136;
    next('2026-02-16T12:00:00Z'); await a.vault.mergeSyncPayload(correction);
    expect((await a.vault.getPatientVisits(first.patientId)).find(row => row.visitId === metadata.visitId).payload.user.height).toBe(136);
    next('2027-02-17T12:00:00Z');
    expect((await b.vault.exportSyncPayload()).snapshotTombstones.some(row => row.snapshotId === head.snapshotId)).toBe(false);
  });
  it('rejects deletion identity with clinical extras or unsupported schema', async () => {
    clock(); const { vault, adapter } = await device(), metadata = visit(); const first = await save(vault, metadata);
    next('2026-01-02T10:00:00Z'); await save(vault, visit('2026-01-02'), first.patientId);
    const marker = { patientId: first.patientId, snapshotId: first.snapshotId, savedAtISO: first.savedAtISO,
      updatedAtISO: first.savedAtISO, deletedAtISO: '2026-01-03T10:00:00Z', rev: 0,
      visitIdentity: { version: 1, visitId: metadata.visitId, name: 'must not persist', measurements: [123] } };
    await expect(vault.mergeSyncPayload({ patients: [], snapshotTombstones: [marker] })).rejects.toMatchObject({ code: 'INVALID_VISIT_IDENTITY' });
    marker.visitIdentity = { version: 1, visitId: metadata.visitId };
    await vault.mergeSyncPayload({ patients: [], snapshotTombstones: [marker] });
    const stored = (await adapter.getUserMeta(vault.getCurrentUser().userId)).snapshotTombstones.find(row => row.snapshotId === first.snapshotId);
    expect(await vault.decryptPayloadForCurrentUser(stored.visitCipher.iv, stored.visitCipher.data)).toEqual({ version: 1, visitId: metadata.visitId });
    marker.visitIdentity = { version: 2, visitId: metadata.visitId };
    await expect(vault.mergeSyncPayload({ patients: [], snapshotTombstones: [marker] })).rejects.toMatchObject({ code: 'INVALID_VISIT_IDENTITY' });
  });
  it('keeps a known explicit UUID when an older writer deletes that snapshot without visit metadata', async () => {
    clock(); const { vault } = await device(), metadata = visit(); const first = await save(vault, metadata);
    next('2026-01-02T10:00:00Z'); await save(vault, visit('2026-01-02'), first.patientId);
    const old = copy((await vault.exportSyncPayload()).patients[0].snapshots.find(row => row.snapshotId === first.snapshotId));
    delete old.payload.visit; old.payload.user.height = 137;
    const deletion = { patientId: first.patientId, snapshotId: first.snapshotId, savedAtISO: first.savedAtISO,
      updatedAtISO: '2026-01-03T09:00:00Z', deletedAtISO: '2026-01-03T10:00:00Z', rev: 1, payload: old.payload };
    next('2026-01-04T12:00:00Z'); await vault.mergeSyncPayload({ patients: [], snapshotTombstones: [deletion] });
    const trashed = (await vault.listTrashedSnapshots()).find(row => row.snapshotId === first.snapshotId);
    expect(trashed.payload.visit.visitId).toBe(metadata.visitId); expect(trashed.payload.user.height).toBe(137);
    next('2026-02-15T12:00:00Z');
    const marker = (await vault.exportSyncPayload()).snapshotTombstones.find(row => row.snapshotId === first.snapshotId);
    expect(marker.payload).toBeUndefined(); expect(marker.visitIdentity).toEqual({ version: 1, visitId: metadata.visitId });
  });
  it.each(['body', 'live', 'future-body'])('rejects conflicting deletion identity (%s) before writes and preserves the full account export', async kind => {
    clock(); const { vault, adapter } = await device(), metadata = visit(); const first = await save(vault, metadata);
    next('2026-01-02T10:00:00Z'); await save(vault, visit('2026-01-02'), first.patientId);
    const before = copy(await vault.exportSyncPayload());
    const original = before.patients[0].snapshots.find(row => row.snapshotId === first.snapshotId);
    const foreign = globalThis.crypto.randomUUID(), body = copy(original.payload);
    const markerId = kind === 'body' ? foreign : kind === 'live' ? foreign : metadata.visitId;
    if (kind === 'live') body.visit.visitId = foreign;
    if (kind === 'future-body') body.visit.version = 2;
    const tombstone = { patientId: first.patientId, snapshotId: first.snapshotId, savedAtISO: first.savedAtISO,
      updatedAtISO: first.savedAtISO, deletedAtISO: '2026-01-03T10:00:00Z', rev: 0,
      visitIdentity: { version: 1, visitId: markerId }, payload: body };
    let writes = 0;
    for (const name of ['putSnapshotForUser', 'removeSnapshotForUser', 'putPatientForUser', 'removePatientForUser', 'putUserMeta']) {
      const method = adapter[name].bind(adapter); adapter[name] = (...args) => { writes += 1; return method(...args); };
    }
    await expect(vault.mergeSyncPayload({ patients: [], snapshotTombstones: [tombstone] })).rejects.toMatchObject({
      code: kind === 'future-body' ? 'INVALID_VISIT_IDENTITY' : 'VISIT_IDENTITY_CONFLICT',
    });
    expect(writes).toBe(0); expect(await vault.exportSyncPayload()).toEqual(before);
    expect((await vault.getPatientVisits(first.patientId)).find(row => row.visitId === metadata.visitId)).toBeDefined();
  });
  it('patient envelope and whole-account backup roundtrip encrypted visit UUIDs', async () => {
    clock(); const a = await device(), b = await device(), c = await device(); const metadata = visit();
    const first = await save(a.vault, metadata); const envelope = await a.vault.exportPatientEnvelope(first.patientId);
    await b.vault.importPatientFromEnvelope(envelope, PASSWORD);
    expect((await b.vault.getPatientVisits(first.patientId))[0].visitId).toBe(metadata.visitId);
    const backup = await a.vault.exportVaultBackup(); await c.vault.mergeVaultBackup(backup, PASSWORD);
    expect((await c.vault.getPatientVisits(first.patientId))[0].visitId).toBe(metadata.visitId);
  });
});
