// Explicit whole-workspace selection. This coordinator neither merges clinical
// facts nor grants write authority. Its client is supplied only inside the
// native runtime's authenticated, account-bound exclusive operation.
const error = code => Object.assign(new Error('Workspace comparison could not be confirmed.'), { code: 'WORKSPACE_REVIEW_' + code });
const copy = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function rows(pack, name) { return pack.stores.find(store => store.name === name).records; }
function label(entry, fallback) {
  const header = entry?.plaintext.find(part => same(part.path, ['headerCipher']))?.value;
  return typeof header?.name === 'string' && header.name.trim() ? header.name.trim() : fallback;
}
function branch(pack) {
  const patients = new Map();
  function group(id) {
    if (!patients.has(id)) patients.set(id, { patient: null, tombstone: null, records: [], measurements: 0, notes: 0, plans: 0 });
    return patients.get(id);
  }
  for (const entry of rows(pack, 'patients')) group(entry.key).patient = entry;
  for (const entry of rows(pack, 'tombstones')) group(entry.key).tombstone = entry;
  for (const name of ['snapshots', 'patientNotes', 'patientNoteTombstones']) for (const entry of rows(pack, name)) {
    if (typeof entry.value.patientId !== 'string') continue;
    const item = group(entry.value.patientId); item.records.push({ store: name, entry });
    if (name === 'snapshots') item.measurements++;
    if (name === 'patientNotes') item.notes++;
  }
  for (const entry of pack.shadows) group(entry.value.patientId).records.push({ store: 'shadows', entry });
  for (const [id, plan] of Object.entries(pack.carePlansV2)) {
    const patientId = plan.record?.patientId;
    if (typeof patientId !== 'string') continue;
    const item = group(patientId); item.plans++; item.records.push({ store: 'carePlansV2', id, plan });
  }
  return patients;
}
function description(id, value) {
  if (!value) return { patientId: id, name: id, state: 'missing', measurements: 0, notes: 0, plans: 0, savedAtISO: null, deletedAtISO: null };
  const patient = value.patient?.value, tombstone = value.tombstone?.value;
  // This is the existing native patient/tombstone visibility rule. The full
  // original records remain untouched in both retained branches.
  const removed = !!tombstone && (!patient || typeof tombstone.deletedAtISO !== 'string'
    || tombstone.deletedAtISO >= (patient.lastSavedAtISO || ''));
  return { patientId: id, name: label(value.patient, id), state: removed ? 'deleted' : patient ? 'present' : 'missing',
    measurements: value.measurements, notes: value.notes, plans: value.plans,
    savedAtISO: typeof patient?.lastSavedAtISO === 'string' ? patient.lastSavedAtISO : null,
    deletedAtISO: typeof tombstone?.deletedAtISO === 'string' ? tombstone.deletedAtISO : null };
}
function summarize(localPack, remotePack, review) {
  const local = branch(localPack), remote = branch(remotePack), patients = [];
  for (const id of [...new Set([...local.keys(), ...remote.keys()])].sort()) {
    if (same(local.get(id), remote.get(id))) continue;
    const a = local.get(id), b = remote.get(id), changedSections = [];
    if (!same(a?.patient, b?.patient)) changedSections.push('patients');
    if (!same(a?.tombstone, b?.tombstone)) changedSections.push('tombstones');
    for (const store of ['snapshots', 'patientNotes', 'patientNoteTombstones', 'shadows', 'carePlansV2']) {
      if (!same(a?.records.filter(item => item.store === store) || [], b?.records.filter(item => item.store === store) || [])) changedSections.push(store);
    }
    patients.push({ patientId: id, local: description(id, a), remote: description(id, b), changedSections });
  }
  const differences = [];
  for (const store of localPack.stores) {
    const other = rows(remotePack, store.name);
    if (!same(store.records, other)) differences.push({ store: store.name, localCount: store.records.length, remoteCount: other.length });
  }
  if (!same(localPack.clinicalMeta, remotePack.clinicalMeta)) differences.push({ store: 'clinicalMeta', localCount: null, remoteCount: null });
  if (!same(localPack.carePlansV2, remotePack.carePlansV2)) differences.push({ store: 'carePlansV2',
    localCount: Object.keys(localPack.carePlansV2).length, remoteCount: Object.keys(remotePack.carePlansV2).length });
  if (!same(localPack.shadows, remotePack.shadows)) differences.push({ store: 'shadows', localCount: localPack.shadows.length, remoteCount: remotePack.shadows.length });
  const changes = choice => patients.filter(item => item[choice].state !== item[choice === 'local' ? 'remote' : 'local'].state)
    .map(item => ({ patientId: item.patientId,
      name: item[choice].state === 'present' ? item[choice].name : item[choice === 'local' ? 'remote' : 'local'].name,
      effect: item[choice].state === 'present' ? (item[choice === 'local' ? 'remote' : 'local'].state === 'deleted' ? 'restore' : 'include') : 'exclude' }));
  return freeze({ localRevision: review.revision, remoteHeadSeq: review.remoteHeadSeq,
    localSourceRevision: review.local.sourceRevision, remoteSourceRevision: review.remote.sourceRevision,
    localPatientCount: [...local].filter(([id, item]) => description(id, item).state === 'present').length,
    remotePatientCount: [...remote].filter(([id, item]) => description(id, item).state === 'present').length,
    patients, differences, patientChanges: { local: changes('local'), remote: changes('remote') } });
}

export function createWorkspaceConflictService({ runExclusive, assertCurrent, accountBinding, newId, codec }) {
  if (typeof runExclusive !== 'function' || typeof assertCurrent !== 'function' || typeof newId !== 'function'
    || typeof codec?.verifyWorkspaceSource !== 'function' || typeof accountBinding !== 'string') throw error('INVALID');
  let closed = false, retained = null, intent = null;
  function check() { if (closed) throw error('CLOSED'); assertCurrent(); }
  function clear() {
    retained?.review.local.bytes.fill(0); retained?.review.remote.bytes.fill(0); retained?.backup.packetBytes.fill(0);
    retained = null; intent = null;
  }
  return Object.freeze({
    async review() {
      check();
      return runExclusive(async client => {
        check();
        // A pending exact intent must first be reconciled; never silently
        // discard it in order to manufacture another choice or operation ID.
        if (intent) throw error('OUTCOME_REQUIRED');
        clear(); let review, backup;
        try {
          review = await client.inspectConflict(); check();
          const [localPack, remotePack] = await Promise.all([
            codec.verifyWorkspaceSource(review.local), codec.verifyWorkspaceSource(review.remote)]); check();
          if (localPack.accountBinding !== accountBinding || remotePack.accountBinding !== accountBinding) throw error('ACCOUNT_CHANGED');
          const summary = summarize(localPack, remotePack, review);
          backup = await client.exportRecovery(); check();
          const status = await client.readStatus(); check();
          if (status.revision !== review.revision || !status.conflictCount) throw error('STALE');
          if (!(backup.packetBytes instanceof Uint8Array) || !backup.packetBytes.length || typeof backup.recoveryCode !== 'string') throw error('UNCONFIRMED');
          retained = { review, backup, summary };
          return { summary, backup };
        } catch (failure) {
          review?.local?.bytes.fill(0); review?.remote?.bytes.fill(0); backup?.packetBytes?.fill(0); throw failure;
        }
      });
    },
    async resolve(input) {
      check();
      if (!input || Object.keys(input).sort().join(',') !== 'acceptPatientChanges,backupSaved,choice'
        || !['local', 'remote'].includes(input.choice) || input.backupSaved !== true || typeof input.acceptPatientChanges !== 'boolean') throw error('INVALID');
      if (!retained) throw error('REVIEW_REQUIRED');
      if (retained.summary.patientChanges[input.choice].length && !input.acceptPatientChanges) throw error('PATIENT_CHANGES_REQUIRED');
      if (intent && intent.choice !== input.choice) throw error('OUTCOME_REQUIRED');
      const expectedReview = retained;
      return runExclusive(async client => {
        check();
        if (!retained || retained !== expectedReview) throw error('STALE');
        if (!intent) intent = { operationId: newId(), choice: input.choice };
        const { review } = retained, source = review[intent.choice];
        let outcome = await client.readOperationOutcome({ operationId: intent.operationId }); check();
        if (outcome === null) {
          try {
            await client.prepareResolution({ operationId: intent.operationId, expectedRevision: review.revision,
              remoteHeadSeq: review.remoteHeadSeq, remoteManifestDigest: review.remoteManifestDigest, source }); check();
          } catch (failure) {
            check(); let code;
            try { code = failure?.code; } catch { /* Never expose platform exceptions. */ }
            if (code === 'WORKSPACE_CLIENT_CONFLICT') {
              // A failed final CAS is refreshable only after proving that our
              // exact operation was not retained. An unknown reply is retried.
              const saved = await client.readOperationOutcome({ operationId: intent.operationId }); check();
              if (saved === null) { clear(); throw error('STALE'); }
            }
            throw failure;
          }
          outcome = await client.readOperationOutcome({ operationId: intent.operationId }); check();
        }
        if (!outcome || outcome.sourceRevision !== source.sourceRevision || outcome.expectedHeadSeq !== review.remoteHeadSeq
          || outcome.expectedManifestDigest !== review.remoteManifestDigest || outcome.operationId !== intent.operationId) throw error('UNCONFIRMED');
        if (outcome.isCurrent !== true) { clear(); throw error('STALE'); }
        if (!['pending', 'dispatched', 'committed'].includes(outcome.status)) {
          if (outcome.status === 'conflict' || outcome.status === 'superseded') { clear(); throw error('STALE'); }
          throw error('UNCONFIRMED');
        }
        const status = await client.flush(); check();
        if (status.conflictCount) { clear(); throw error('STALE'); }
        const confirmed = await client.readOperationOutcome({ operationId: intent.operationId }); check();
        if (!confirmed || confirmed.status !== 'committed' || confirmed.isCurrent !== true
          || status.pendingCount || status.status !== 'synced') throw error('UNCONFIRMED');
        clear(); return { resolved: true, status: copy(status) };
      });
    },
    close() { closed = true; clear(); }
  });
}
