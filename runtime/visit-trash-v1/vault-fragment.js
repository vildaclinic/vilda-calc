/* BEGIN VILDA WHOLE VISIT TRASH V1 */
// Group actions reuse the encrypted snapshot trash. Every member carries the
// same random operation ID inside its encrypted payload. Older accounts and
// ordinary single-snapshot trash keep their existing format.
function VisitTrashConflict() {
  return Bkz_blad('Wizyta lub jej zapis w koszu zmieniły się. Otwórz ponownie kartę pacjenta.', 'VISIT_TRASH_CONFLICT');
}
const VISIT_IDENTITY_PREFIX = 'identity-only-';
async function VisitTrashIdentityCounts(session) {
  const adapter = I(), counts = new Map();
  if (!adapter.listVisitIdentitiesForUser) return counts;
  const candidates = await adapter.listVisitIdentitiesForUser(b);
  VaultStrictReadAssert(session);
  for (const row of candidates) {
    const payload = await G(row.payloadCipher.iv, row.payloadCipher.data);
    VaultStrictReadAssert(session);
    if (VisitTrashIdentity({snapshotId: row.snapshotId, payload})) counts.set(row.patientId, (counts.get(row.patientId) || 0) + 1);
  }
  return counts;
}
function VisitTrashIdentity(row) {
  const p = row && row.payload;
  return !!(row && typeof row.snapshotId === 'string' && row.snapshotId.startsWith(VISIT_IDENTITY_PREFIX) && p && p._visitPatientIdentityOnly === true && p.user && !Array.isArray(p.user) && typeof p.user === 'object'
    && (!p.visit || Bvisit_valid(p.visit) && p.visit.origin === 'legacy-inferred')
    && Object.keys(p).every(key => ['_visitPatientIdentityOnly','name','external','contact','user','visit','_pinned','_pinnedState','_contentAtISO','timestampISO'].includes(key))
    && Object.keys(p.user).every(key => ['firstName','lastName','sex','dobISO','age','ageMonths','birthYear'].includes(key)
      && (p.user[key] == null || ['string', 'number'].includes(typeof p.user[key]))));
}
async function VisitTrashPublicPatient(patientId) {
  const patient = await ct(patientId);
  if (!patient || !patient.snapshots.some(VisitTrashIdentity)) return patient;
  const snapshots = patient.snapshots.filter(row => !VisitTrashIdentity(row));
  return Object.assign({}, patient, {snapshots, snapshotCount: snapshots.length});
}
async function VisitTrashLatest(patientId) {
  const patient = await ct(patientId);
  if (!patient || !patient.snapshots.length) return null;
  const snapshot = patient.snapshots.find(row => !VisitTrashIdentity(row));
  if (snapshot) return snapshot;
  const row = patient.snapshots[0], payload = Object.assign({}, row.payload);
  delete payload.visit;
  return Object.assign({}, row, {payload});
}
function VisitTrashIdentityPayload(header) {
  const user = {};
  ['firstName','lastName','sex','dobISO','age','ageMonths','birthYear'].forEach(key => {
    if (header[key] != null) user[key] = header[key];
  });
  const payload = {name: header.name || '', user, _visitPatientIdentityOnly: true};
  if (header.external) { payload.external = true; payload.contact = header.contact || null; }
  return payload;
}
function VisitTrashReadChange(change, patient, rows, globalWrites, removedPatient) {
  change.guard();
  if (removedPatient || !patient || patient.headerCipher.iv !== change.original.headerCipher.iv
    || patient.lastSavedAtISO !== change.original.lastSavedAtISO || rows.length !== change.expected.size) throw VisitTrashConflict();
  for (const row of rows) {
    const expected = change.expected.get(row.snapshotId);
    if (!expected || !Bkz_wersjaZgodna(row, expected) || row.payloadCipher.iv !== expected.payloadCipher.iv) throw VisitTrashConflict();
  }
  if (globalWrites.some(Boolean)) throw VisitTrashConflict();
}
function VisitTrashNextMeta(change, meta) {
  change.guard();
  if (!meta) throw VisitTrashConflict();
  const tombs = meta.snapshotTombstones || [], affected = new Map();
  tombs.forEach(entry => { if (change.expectedTombs.has(entry.snapshotId)) affected.set(entry.snapshotId, entry); });
  for (const [id, expected] of change.expectedTombs) {
    if (JSON.stringify(affected.get(id) || null) !== JSON.stringify(expected || null)) throw VisitTrashConflict();
  }
  const next = tombs.filter(entry => !change.expectedTombs.has(entry.snapshotId));
  return Object.assign({}, meta, {snapshotTombstones: next.concat(change.tombWrites)});
}
function VisitTrashGroupMarker(entry, payload) {
  const m = payload && payload._visitTrashGroup;
  if (!m || m.version !== 1 || typeof m.trashId !== 'string' || !m.trashId || typeof m.head !== 'string'
    || !m.head || !Number.isSafeInteger(m.count) || m.count < 1 || !Number.isSafeInteger(m.index)
    || m.index < 0 || m.index >= m.count || !Bvisit_valid(payload.visit)
    || m.index === 0 && m.head !== entry.snapshotId) return null;
  return m;
}
async function VisitTrashPayload(entry, guard) {
  guard();
  try {
    const payload = await G(entry.payloadCipher.iv, entry.payloadCipher.data);
    guard(); return payload;
  } catch (error) {
    guard(); PatientClinicalRethrow(error);
    if (['OperationError', 'InvalidCharacterError', 'SyntaxError'].includes(error && error.name)) return null;
    throw error;
  }
}
async function VisitTrashBlocksSingle(entry, payload, entries, guard) {
  if (payload && payload._visitTrashGroup) return true;
  // An independently discarded revision can predate deletion of its visit.
  // Restoring it first would recreate that visit and block the group restore.
  let identity;
  for (const other of entries) {
    if (other.patientId !== entry.patientId || other.snapshotId === entry.snapshotId || !other.payloadCipher) continue;
    const body = await VisitTrashPayload(other, guard);
    if (!VisitTrashGroupMarker(other, body)) continue;
    if (identity === undefined) {
      identity = Bvisit_valid(payload && payload.visit) ? payload.visit : await Bvisit_deletedIdentity(entry);
      guard();
    }
    if (identity && identity.visitId === body.visit.visitId) return true;
  }
  return false;
}
async function VisitTrashGroups(entries, patientId, guard) {
  const byId = new Map();
  for (const entry of entries) {
    if (entry.patientId !== patientId || !entry.payloadCipher) continue;
    const payload = await VisitTrashPayload(entry, guard);
    const marker = VisitTrashGroupMarker(entry, payload);
    if (!marker) continue;
    if (!byId.has(marker.trashId)) byId.set(marker.trashId, []);
    byId.get(marker.trashId).push({entry, payload, marker});
  }
  const complete = [];
  for (const group of byId.values()) {
    group.sort((first, second) => first.marker.index - second.marker.index);
    const first = group[0], tag = first.marker, visitId = first.payload.visit.visitId;
    if (tag.count === group.length && group.every((item, index) => item.marker.index === index
      && item.marker.count === tag.count && item.marker.head === tag.head && item.payload.visit.visitId === visitId
      && item.entry.deletedAtISO === first.entry.deletedAtISO)) complete.push(group);
  }
  return complete;
}
function VisitTrashSummary(group, patientId) {
  const {entry, marker, payload} = group[0], visit = payload.visit;
  return {patientId, visitId: visit.visitId, trashId: marker.trashId, snapshotId: marker.head,
    revisionCount: marker.count, clinicalDateISO: visit.clinicalDateISO, origin: visit.origin, dateSource: visit.dateSource || null,
    savedAtISO: entry.savedAtISO || null, deletedAtISO: entry.deletedAtISO,
    expiresAtISO: new Date(Date.parse(entry.deletedAtISO) + BKZ_KOSZ_MS).toISOString()};
}
async function VisitTrashList(patientId) {
  if (!T() || typeof patientId !== 'string' || !patientId) throw VisitTrashConflict();
  const session = Bses_opcje(null), guard = () => Bses_pilnuj(session);
  const groups = await VisitTrashGroups(await Bkz_czytaj(), patientId, guard);
  guard();
  return groups.map(group => VisitTrashSummary(group, patientId)).sort((a, c) => c.deletedAtISO.localeCompare(a.deletedAtISO));
}
async function VisitTrashRows(adapter, patientId, uid, guard) {
  const raw = await adapter.listSnapshotsForUser(uid, patientId);
  const rows = [];
  for (const row of raw) {
    guard();
    const decoded = await G(row.payloadCipher.iv, row.payloadCipher.data);
    if (!decoded || typeof decoded !== 'object') throw VisitTrashConflict();
    rows.push(Object.assign({}, row, {payload: await Bvisit_read(decoded, patientId, row)}));
  }
  guard(); return rows.sort(yr);
}
async function VisitTrashChange(patientId, visitId, options, restore) {
  if (!T() || !patientId || !visitId || !options ||
      (restore ? !options.trashId : !options.snapshotId || !Number.isSafeInteger(options.revision))) throw VisitTrashConflict();
  const session = Bses_opcje(null), uid = b, adapter = I();
  function guard() {
    Bses_pilnuj(session);
    if (I() !== adapter || options.isCurrent && !options.isCurrent()) throw VisitTrashConflict();
  }
  guard();
  Bem_krokStart();
  try {
    return await Ap('pat:' + patientId, async function () {
      guard();
      const original = await adapter.getPatientForUser(uid, patientId);
      if (!original) throw VisitTrashConflict();
      const rows = await VisitTrashRows(adapter, patientId, uid, guard);
      const live = rows.filter(row => !VisitTrashIdentity(row) && row.payload.visit.visitId === visitId);
      const meta = await adapter.getUserMeta(uid);
      guard();
      if (!meta || typeof adapter.commitVisitTrashForUser !== 'function') throw VisitTrashConflict();
      const originals = meta.snapshotTombstones || [], entries = Bkz_czysc(originals, Date.now()).lista;
      const change = {patientId, original, guard, expected: new Map(rows.map(row => [row.snapshotId, row])),
        expectedTombs: new Map(), writes: [], removes: [], tombWrites: []};
      const mark = id => change.expectedTombs.set(id, originals.find(entry => entry.snapshotId === id));
      let updated, result, remaining;
      if (restore) {
        const groups = await VisitTrashGroups(entries, patientId, guard);
        const group = groups.find(items => items[0].marker.trashId === options.trashId && items[0].payload.visit.visitId === visitId);
        if (!group || live.length) throw VisitTrashConflict();
        const base = Date.parse(Bpp_chwilaZmiany(group.reduce((value, item) =>
          Bkz_pozniejsza(value, Bkz_ostatnie(item.entry), Bkz_znanaZmiana(item.entry)), '')));
        const restored = [];
        for (const {entry, payload, marker} of group) {
          const stamp = new Date(base + group.length - marker.index - 1).toISOString();
          const body = Object.assign({}, payload); delete body._visitTrashGroup;
          const next = Bgw_ustaw(Bvisit_owner(body, patientId), stamp, {pin: marker.pinned === true, at: stamp});
          const record = Object.assign({snapshotId: entry.snapshotId, patientId, savedAtISO: entry.savedAtISO,
            updatedAtISO: stamp, rev: mt(entry) + 1, payloadCipher: await V(next)}, Bm1(entry));
          guard(); mark(record.snapshotId); change.writes.push(record);
          restored.push(Object.assign({}, record, {payload: next}));
        }
        updated = restored[0].updatedAtISO;
        result = VisitTrashSummary(group, patientId);
        remaining = rows.concat(restored);
      } else {
        if (!live.length || live[0].snapshotId !== options.snapshotId || mt(live[0]) !== options.revision) throw VisitTrashConflict();
        const trashId = VisitTrashId();
        const tombs = new Map(entries.map(entry => [entry.snapshotId, entry]));
        const last = live.reduce((d, row) => {
          const prior = tombs.get(row.snapshotId);
          return Bkz_pozniejsza(d, Bkz_zmiana(row), prior && Bkz_ostatnie(prior), prior && Bkz_znanaZmiana(prior));
        }, '');
        // A marked trash payload must outrank older snapshots during sync,
        // including their pin register; explicit restore re-applies the pin.
        const contentStamp = Bpp_chwilaZmiany(last);
        updated = Bpp_chwilaZmiany(contentStamp);
        const identity = await V({version: 1, visitId});
        const group = [];
        for (const [index, row] of live.entries()) {
          const marker = {version: 1, trashId, head: options.snapshotId, count: live.length, index, pinned: !!row.payload._pinned};
          const payload = Bgw_ustaw(Object.assign({}, row.payload, {_visitTrashGroup: marker}), contentStamp, {pin: false, at: contentStamp});
          const entry = Object.assign({patientId, snapshotId: row.snapshotId, savedAtISO: row.savedAtISO, rev: mt(row),
            updatedAtISO: contentStamp, deletedAtISO: updated, trescISO: contentStamp, visitCipher: identity,
            gwiazdka: {pin: false, at: contentStamp}, payloadCipher: await V(payload)}, Bm1(row));
          guard(); mark(row.snapshotId);
          const merged = new Map(); const previous = tombs.get(row.snapshotId);
          if (previous) merged.set(row.snapshotId, previous);
          Bkz_dolacz(merged, entry);
          const winner = merged.get(row.snapshotId);
          if (winner?.payloadCipher?.iv !== entry.payloadCipher.iv || winner.deletedAtISO !== updated) throw VisitTrashConflict();
          change.tombWrites.push(winner); change.removes.push(row.snapshotId);
          group.push({entry, payload, marker});
        }
        result = VisitTrashSummary(group, patientId);
        remaining = rows.filter(row => !change.expectedTombs.has(row.snapshotId));
        if (!remaining.length) {
          const header = await G(original.headerCipher.iv, original.headerCipher.data);
          guard();
          const payload = VisitTrashIdentityPayload(header);
          // Sort before any clinical measurement, including restored old imports.
          const anchor = {patientId, snapshotId: VISIT_IDENTITY_PREFIX + VisitTrashId(), savedAtISO: '1970-01-01T00:00:00.000Z',
            updatedAtISO: updated, rev: 0, payloadCipher: await V(payload)};
          guard(); change.writes.push(anchor); remaining.push(Object.assign({}, anchor, {payload}));
        }
      }
      remaining.sort(yr);
      const head = remaining.find(row => !VisitTrashIdentity(row));
      const header = head && Bng_zTresci(head.payload, head);
      change.patient = Object.assign({}, original, {snapshotCount: remaining.length, lastSavedAtISO: Bkz_pozniejsza(original.lastSavedAtISO, updated),
        headerCipher: header ? await V(header) : original.headerCipher});
      guard();
      await Bmk_blokada(() => adapter.commitVisitTrashForUser(uid, change));
      Bses_pilnuj(session);
      if (change.removes.length) Bem_zmiana('stomb', change.removes, session);
      if (change.writes.length) Bem_zmiana('snap', change.writes.map(row => ({patientId, snapshotId: row.snapshotId})), session);
      // One notification after the complete transaction; no request to rebind a
      // patient to any particular technical revision or to the identity record.
      Vn({patientId, visitId, visitTrashAction: restore ? 'restore' : 'trash'});
      return result;
    }, {timeoutMs: 30000});
  } finally { Bem_krokKoniec(); }
}
function VisitTrashId() {
  if (typeof v.crypto.randomUUID === 'function') return v.crypto.randomUUID();
  const bytes = v.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = bytes[6] & 15 | 64; bytes[8] = bytes[8] & 63 | 128;
  const hex = Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('');
  return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}

async function VisitTrashDatabase(user, change, stagePatient, openDatabase) {
  PatientClinicalGuard(user);
  const db = await openDatabase(user);
  return new Promise(function (resolve, reject) {
    // Cloud-only keeps clinical data in memory and the encrypted trash in
    // account metadata. Stage that memory update only on durable success.
    const tx = PatientClinicalWriteValue(user, db).transaction(stagePatient ? [le] : [le, bt, It, xt], 'readwrite');
    let applyStaged, problem;
    const meta = tx.objectStore(le), reads = [meta.get(fn)];
    const snapshots = stagePatient ? null : tx.objectStore(It);
    if (snapshots) {
      reads.push(tx.objectStore(bt).get(change.patientId), snapshots.index('byPatient').getAll(IDBKeyRange.only(change.patientId)),
        tx.objectStore(xt).get(change.patientId));
      change.writes.forEach(row => reads.push(snapshots.get(row.snapshotId)));
    }
    tx.oncomplete = function () { if (applyStaged) applyStaged(); resolve(true); };
    tx.onabort = function () { reject(problem || tx.error || new Error('Nie zapisano zmiany wizyty.')); };
    let outstanding = reads.length;
    reads.forEach(request => { request.onsuccess = function () {
      if (--outstanding) return;
      try {
        const nextMeta = VisitTrashNextMeta(change, reads[0].result);
        if (snapshots) {
          VisitTrashReadChange(change, reads[1].result, reads[2].result, reads.slice(4).map(read => read.result), reads[3].result);
          change.removes.forEach(id => snapshots.delete(id)); change.writes.forEach(row => snapshots.put(row));
          tx.objectStore(bt).put(change.patient);
        } else applyStaged = stagePatient();
        PatientClinicalGuard(user); meta.put(nextMeta);
      } catch (error) { problem = error; tx.abort(); }
    }; });
  });
}

function VisitTrashStage(user, change, store, flush) {
  PatientClinicalGuard(user);
  const rows = Array.from(store.snapshots.values()).filter(row => row.patientId === change.patientId);
  VisitTrashReadChange(change, store.patients.get(change.patientId), rows, change.writes.map(row => store.snapshots.get(row.snapshotId)),
    store.tombstones.get(change.patientId));
  return function (meta) {
    change.removes.forEach(id => store.snapshots.delete(id));
    change.writes.forEach(row => store.snapshots.set(row.snapshotId, row));
    store.patients.set(change.patientId, change.patient);
    if (meta) store.meta = meta;
    flush();
  };
}
/* END VILDA WHOLE VISIT TRASH V1 */
