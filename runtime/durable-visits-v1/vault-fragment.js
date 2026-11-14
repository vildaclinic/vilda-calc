/* BEGIN VILDA DURABLE VISITS V1 */
/* P-TRWALE-WIZYTY: identity lives only in the encrypted clinical payload. A snapshot
 * is a technical revision; several snapshots may belong to one visit. Legacy day
 * grouping is explicitly inferred, never presented as a confirmed encounter. */
function Bvisit_date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value + 'T00:00:00Z'), parts = value.split('-').map(Number);
  return Number.isFinite(date.getTime()) && date.getUTCFullYear() === parts[0]
    && date.getUTCMonth() + 1 === parts[1] && date.getUTCDate() === parts[2] ? value : null;
}
function Bvisit_valid(value) {
  return !!(value && value.version === 1 && typeof value.visitId === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.visitId)
    && (Bvisit_date(value.clinicalDateISO) || value.clinicalDateISO === null)
    && typeof value.createdAtISO === 'string' && Number.isFinite(Date.parse(value.createdAtISO))
    && (value.origin === 'explicit' || value.origin === 'legacy-inferred'));
}
function Bvisit_timestampDay(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  const part = function (type) { return parts.find(function (item) { return item.type === type; }).value; };
  return part('year') + '-' + part('month') + '-' + part('day');
}
function Bvisit_withMetadata(original, metadata) {
  const next = Object.assign({}, original, { visit: metadata });
  if (original && original._pinnedState && typeof original._pinnedState.h === 'string'
    && original._pinnedState.h === Bgw_odcisk(original)) {
    next._pinnedState = Object.assign({}, original._pinnedState, { h: Bgw_odcisk(next) });
  }
  return next;
}
function Bvisit_owner(payload, patientId) {
  return Bvisit_valid(payload && payload.visit) ? Bvisit_withMetadata(payload, Object.assign({}, payload.visit, { patientId: patientId })) : payload;
}
function Bvisit_source(payload, snapshot) {
  const measured = Bvisit_date(payload && payload.user && payload.user.measuredAtISO);
  if (measured) return { date: measured, source: 'measuredAt' };
  const saved = Bvisit_timestampDay(snapshot && snapshot.savedAtISO);
  if (saved) return { date: saved, source: 'savedAt' };
  const timestamp = Bvisit_timestampDay(payload && payload.timestampISO);
  return { date: timestamp, source: timestamp ? 'timestamp' : 'unknown' };
}
async function Bvisit_legacy(patientId, payload, snapshot) {
  const source = Bvisit_source(payload, snapshot);
  const key = 'vilda-legacy-visit-v1\0' + patientId + '\0' + (source.date || 'unknown:' + snapshot.snapshotId);
  const bytes = new Uint8Array(await v.crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))).slice(0, 16);
  bytes[6] = (bytes[6] & 15) | 128; bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, function (byte) { return byte.toString(16).padStart(2, '0'); }).join('');
  return { version: 1, visitId: hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16)
    + '-' + hex.slice(16, 20) + '-' + hex.slice(20), patientId: patientId,
    clinicalDateISO: source.date, createdAtISO: source.date ? source.date + 'T00:00:00.000Z' : '1970-01-01T00:00:00.000Z',
    origin: 'legacy-inferred', dateSource: source.source };
}
async function Bvisit_read(payload, patientId, snapshot) {
  if (!payload || typeof payload !== 'object') return payload;
  if (payload.visit != null && !Bvisit_valid(payload.visit)) {
    const error = new Error('Nieobsługiwana lub uszkodzona tożsamość wizyty. Dane nie zostały zmienione.');
    error.code = 'INVALID_VISIT_IDENTITY'; throw error;
  }
  const visit = Bvisit_valid(payload.visit) ? Object.assign({}, payload.visit, { patientId: patientId })
    : await Bvisit_legacy(patientId, payload, snapshot);
  return Bvisit_withMetadata(payload, visit);
}
async function Bvisit_save(payload, patientId, latest, savedAtISO) {
  if (payload.visit != null && !Bvisit_valid(payload.visit)) {
    const error = new Error('Nieprawidłowa tożsamość wizyty. Wczytaj ponownie dane pacjenta.');
    error.code = 'INVALID_VISIT_IDENTITY'; throw error;
  }
  if (Bvisit_valid(payload.visit)) return Bvisit_read(payload, patientId, { savedAtISO: savedAtISO });
  const previous = latest && latest.payload && latest.payload.visit;
  const date = Bvisit_source(payload, { savedAtISO: savedAtISO }).date;
  // Older writers have no explicit intent. Only the same clinical day can be
  // inferred as another revision; a different day is a separate inferred visit.
  if (Bvisit_valid(previous) && previous.clinicalDateISO === date) {
    return Bvisit_withMetadata(payload, Object.assign({}, previous, { patientId: patientId }));
  }
  return Bvisit_read(payload, patientId, { savedAtISO: savedAtISO });
}
// Same head order as the existing version history: editing or pinning an old
// technical revision does not replace a newer saved revision of that visit.
function Bvisit_compare(a, c) { return yr(a, c); }
function Bvisit_groups(snapshots, patientId) {
  const groups = new Map();
  (snapshots || []).slice().sort(Bvisit_compare).forEach(function (snapshot) {
    const visit = snapshot.payload && snapshot.payload.visit;
    if (!Bvisit_valid(visit)) return;
    let group = groups.get(visit.visitId);
    if (!group) {
      group = Object.assign({}, visit, { patientId: patientId, snapshotId: snapshot.snapshotId,
        savedAtISO: snapshot.savedAtISO, updatedAtISO: snapshot.updatedAtISO || snapshot.savedAtISO,
        revision: mt(snapshot), rev: mt(snapshot), seq: snapshot.seq, payload: snapshot.payload, sourceSnapshotIds: [], revisionCount: 0 });
      groups.set(visit.visitId, group);
    }
    group.sourceSnapshotIds.push(snapshot.snapshotId); group.revisionCount += 1;
  });
  return Array.from(groups.values()).sort(function (a, c) {
    const ad = a.clinicalDateISO || '', cd = c.clinicalDateISO || '';
    return ad === cd ? Bvisit_compare(a, c) : ad > cd ? -1 : 1;
  });
}
async function Bvisit_list(patientId) {
  const session = Bses_opcje(null);
  const patient = await ct(patientId);
  Bses_pilnuj(session);
  return patient ? Bvisit_groups(patient.snapshots, patientId) : [];
}
async function Bvisit_inplace(payload, record, patientId) {
  if (payload.visit != null && !Bvisit_valid(payload.visit)) {
    const error = new Error('Nieprawidłowa tożsamość wizyty. Dane nie zostały zmienione.');
    error.code = 'INVALID_VISIT_IDENTITY'; throw error;
  }
  const session = Bses_opcje(null);
  const original = await G(record.payloadCipher.iv, record.payloadCipher.data);
  Bses_pilnuj(session);
  const old = await Bvisit_read(original, patientId, record);
  if (Bvisit_valid(payload.visit) && payload.visit.visitId !== old.visit.visitId) {
    const error = new Error('Nie można zmienić identyfikatora istniejącej wizyty.');
    error.code = 'VISIT_IDENTITY_CONFLICT'; throw error;
  }
  return Bvisit_withMetadata(payload, Object.assign({}, Bvisit_valid(payload.visit) ? payload.visit : old.visit, { patientId: patientId }));
}
async function Bvisit_sync(payload, record, patientId) {
  if (payload && payload.visit != null && !Bvisit_valid(payload.visit)) {
    const error = new Error('Nieprawidłowa tożsamość wizyty. Synchronizacja została zatrzymana.');
    error.code = 'INVALID_VISIT_IDENTITY'; throw error;
  }
  const session = Bses_opcje(null);
  let original;
  try { original = await G(record.payloadCipher.iv, record.payloadCipher.data); }
  catch (error) {
    Bses_pilnuj(session); PatientClinicalRethrow(error);
    if (error && ['OperationError', 'InvalidCharacterError', 'SyntaxError'].indexOf(error.name) >= 0) return Bvisit_read(payload, patientId, record);
    throw error;
  }
  Bses_pilnuj(session);
  if (original && original.visit != null && !Bvisit_valid(original.visit)) {
    const error = new Error('Nieobsługiwana tożsamość zapisanej wizyty. Synchronizacja została zatrzymana.');
    error.code = 'INVALID_VISIT_IDENTITY'; throw error;
  }
  const known = Bvisit_valid(original && original.visit);
  if (known && Bvisit_valid(payload && payload.visit) && original.visit.visitId !== payload.visit.visitId) {
    const error = new Error('Sprzeczne identyfikatory tej samej wersji wizyty. Synchronizacja została zatrzymana.');
    error.code = 'VISIT_IDENTITY_CONFLICT'; throw error;
  }
  if (known && !Bvisit_valid(payload && payload.visit)) return Bvisit_withMetadata(payload, Object.assign({}, original.visit, { patientId: patientId }));
  return Bvisit_read(payload, patientId, record);
}
async function Bvisit_moved(record, patientId) {
  const session = Bses_opcje(null);
  let original;
  try { original = await G(record.payloadCipher.iv, record.payloadCipher.data); }
  catch (error) {
    Bses_pilnuj(session); PatientClinicalRethrow(error);
    if (error && ['OperationError', 'InvalidCharacterError', 'SyntaxError'].indexOf(error.name) >= 0) return record;
    throw error;
  }
  Bses_pilnuj(session);
  const payload = await Bvisit_read(original, record.patientId, record);
  Bses_pilnuj(session);
  const cipher = await V(Bvisit_owner(payload, patientId));
  Bses_pilnuj(session);
  return Object.assign({}, record, { payloadCipher: cipher });
}
// The deletion marker retains only the UUID (encrypted at rest). Clinical trash
// still expires after 30 days; this identity expires with its 365-day tombstone.
function Bvisit_identityValid(value) {
  return !!(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 2
    && Object.keys(value).every(function (key) { return key === 'version' || key === 'visitId'; })
    && value.version === 1 && typeof value.visitId === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.visitId));
}
async function Bvisit_identityFromPayload(payload, patientId, snapshot) {
  const session = Bses_opcje(null);
  const normalized = await Bvisit_read(payload, patientId, snapshot);
  Bses_pilnuj(session);
  return normalized && normalized.visit ? { version: 1, visitId: normalized.visit.visitId } : null;
}
async function Bvisit_incomingDeletion(incoming, context) {
  const session = Bses_opcje(null);
  function invalid() {
    const error = new Error('Nieprawidłowa tożsamość usuniętej wizyty.');
    error.code = 'INVALID_VISIT_IDENTITY'; throw error;
  }
  function conflict() {
    const error = new Error('Sprzeczne identyfikatory usuniętej wizyty.');
    error.code = 'VISIT_IDENTITY_CONFLICT'; throw error;
  }
  if (incoming.visitIdentity != null && !Bvisit_identityValid(incoming.visitIdentity)) invalid();
  const bodyVisit = incoming.payload && incoming.payload.visit;
  if (bodyVisit != null && !Bvisit_valid(bodyVisit)) invalid();
  const marker = incoming.visitIdentity;
  if (marker && bodyVisit && marker.visitId !== bodyVisit.visitId) conflict();
  const declaredId = marker ? marker.visitId : bodyVisit ? bodyVisit.visitId : null;
  const previous = context.mapa.get(incoming.snapshotId);
  let known = previous ? await Bvisit_deletedIdentity(previous) : null;
  Bses_pilnuj(session);
  let local = null;
  // An existing validated marker already binds this snapshot's identity. Only a
  // newly seen identity (or an old writer omitting body metadata) needs a keyed
  // live-record read. Cache within this read-only preflight, never across writes.
  if ((!known && declaredId) || (incoming.payload && !bodyVisit)) {
    const cache = context.BvisitLiveIdentities || (context.BvisitLiveIdentities = new Map());
    if (cache.has(incoming.snapshotId)) local = cache.get(incoming.snapshotId);
    else {
      const record = await Bsw_wersjaLokalna(context, incoming.snapshotId);
      Bses_pilnuj(session);
      let payload = null;
      if (record) {
        try { payload = await G(record.payloadCipher.iv, record.payloadCipher.data); }
        catch (error) {
          Bses_pilnuj(session); PatientClinicalRethrow(error);
          if (!error || ['OperationError', 'InvalidCharacterError', 'SyntaxError'].indexOf(error.name) < 0) throw error;
        }
        Bses_pilnuj(session);
        if (payload && payload.visit != null && !Bvisit_valid(payload.visit)) invalid();
      }
      local = { record: record, payload: payload };
      cache.set(incoming.snapshotId, local);
    }
    const liveVisit = local && local.payload && local.payload.visit;
    if (Bvisit_valid(liveVisit)) {
      if (known && known.visitId !== liveVisit.visitId) conflict();
      known = { version: 1, visitId: liveVisit.visitId };
    }
  }
  if (known && declaredId && known.visitId !== declaredId) conflict();
  if (!incoming.payload || bodyVisit) return incoming;
  let payload;
  const liveVisit = local && local.payload && local.payload.visit;
  if (Bvisit_valid(liveVisit)) payload = Bvisit_withMetadata(incoming.payload, Object.assign({}, liveVisit, { patientId: incoming.patientId }));
  else {
    payload = await Bvisit_read(incoming.payload, incoming.patientId, incoming);
    if (known || marker) payload = Bvisit_withMetadata(payload, Object.assign({}, payload.visit, { visitId: known ? known.visitId : marker.visitId }));
  }
  Bses_pilnuj(session);
  return Object.assign({}, incoming, { payload: payload, visitIdentity: { version: 1, visitId: payload.visit.visitId } });
}
async function Bvisit_deletedIdentity(entry) {
  const session = Bses_opcje(null);
  if (entry.visitCipher) {
    let identity;
    try { identity = await G(entry.visitCipher.iv, entry.visitCipher.data); }
    catch (cause) {
      Bses_pilnuj(session); PatientClinicalRethrow(cause);
      const error = new Error('Nie można odczytać tożsamości usuniętej wizyty. Eksport został przerwany.');
      error.code = 'INVALID_VISIT_IDENTITY'; throw error;
    }
    Bses_pilnuj(session);
    if (!Bvisit_identityValid(identity)) {
      const error = new Error('Nieprawidłowa tożsamość usuniętej wizyty.');
      error.code = 'INVALID_VISIT_IDENTITY'; throw error;
    }
    return { version: 1, visitId: identity.visitId };
  }
  if (entry.payload) return Bvisit_identityFromPayload(entry.payload, entry.patientId, entry);
  if (entry.payloadCipher) {
    let payload;
    try { payload = await G(entry.payloadCipher.iv, entry.payloadCipher.data); }
    catch (error) { Bses_pilnuj(session); PatientClinicalRethrow(error); return null; }
    Bses_pilnuj(session);
    return Bvisit_identityFromPayload(payload, entry.patientId, entry);
  }
  return null;
}
async function Bvisit_applyDeletedHeads(groups, protectedIds, context) {
  if (context && context.mapa) {
    const cache = context.BvisitDeletedIdentities || (context.BvisitDeletedIdentities = new Map());
    for (const entry of context.mapa.values()) {
      const deletedAt = Bkz_chwilaKosza(entry);
      if (!deletedAt || deletedAt < Bkz_znanaZmiana(entry)) continue;
      const key = entry.snapshotId + '|' + (entry.visitCipher && entry.visitCipher.iv || entry.payloadCipher && entry.payloadCipher.iv || '');
      let identity = cache.get(key);
      if (!cache.has(key)) { identity = await Bvisit_deletedIdentity(entry); cache.set(key, identity); }
      if (!identity) continue;
      const group = groups.find(function (item) { return item.visitId === identity.visitId; });
      if (!group || Bgw_stan(group, group.payload).cz > deletedAt) continue;
      if (yr(entry, group) <= 0) protectedIds.delete(group.snapshotId);
    }
  }
}
async function Bvisit_protected(patientId, records, remote, context) {
  if (context && context.mapa && !Array.from(context.mapa.values()).some(function (entry) { return !!Bkz_chwilaRetencji(entry); })) return new Set();
  const rows = new Map();
  for (const record of records || []) {
    try {
      const payload = await Bvisit_read(await G(record.payloadCipher.iv, record.payloadCipher.data), patientId, record);
      rows.set(record.snapshotId, Object.assign({}, record, { payload: payload }));
    } catch (error) { PatientClinicalRethrow(error); rows.set(record.snapshotId, record); }
  }
  for (const record of remote || []) {
    const old = rows.get(record.snapshotId);
    if (!old || Bvisit_compare(record, old) < 0) rows.set(record.snapshotId, Object.assign({}, record, {
      payload: await Bvisit_read(record.payload, patientId, record) }));
  }
  const values = Array.from(rows.values());
  const groups = Bvisit_groups(values, patientId);
  const protectedIds = new Set(groups.map(function (group) { return group.snapshotId; }));
  await Bvisit_applyDeletedHeads(groups, protectedIds, context);
  values.forEach(function (row) { if (!row.payload) protectedIds.add(row.snapshotId); });
  return protectedIds;
}
async function Bvisit_surviveRetention(ctx, patientId, snapshot, entry, options) {
  Bses_pilnuj(options);
  let payload;
  try { payload = await G(snapshot.payloadCipher.iv, snapshot.payloadCipher.data); }
  catch (error) { Bses_pilnuj(options); throw error; }
  Bses_pilnuj(options);
  const state = Bgw_stan(snapshot, payload);
  const extended = Bpk_zWersja(entry, Bpk_zWersji(snapshot, null, state));
  const merged = await Bgw_zloz(ctx, patientId, snapshot, payload, extended, options);
  Bses_pilnuj(options);
  ctx.mapa.set(entry.snapshotId, merged ? Bpk_zWersja(extended, Bpk_zWersji(merged.rekord, null, merged.st)) : extended);
  const revision = Math.max(mt(entry), ctx.Bkz_revPom && ctx.Bkz_revPom.get(entry.snapshotId) || 0);
  if (!merged && revision > mt(snapshot)) {
    await I().putSnapshotForUser(b, PatientClinicalWriteValue(b, Object.assign(Bm1(snapshot), snapshot, { rev: revision })));
    ctx.dotknieci.add(patientId);
  }
}
function Bvisit_keepRetention(ctx, entry, snapshot) {
  return !!(entry && snapshot && !(Bkz_chwilaKosza(entry) && Bkz_chwilaKosza(entry) >= Bkz_zmiana(snapshot))
    && Bkz_chwilaRetencji(entry) && ctx.BvisitProtected && ctx.BvisitProtected.has(snapshot.snapshotId));
}
/* END VILDA DURABLE VISITS V1 */
