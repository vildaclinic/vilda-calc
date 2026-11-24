/* Explicit removal of a diagnosis: one atomic commit of the record and its
 * ordinary note tombstone. Therapy references never cascade on removal.
 *
 * EDITION WITHOUT VISIT DOCUMENTS. The complete layer (the same namespace and
 * paths) is kept on the new-home-page line of the application. It also binds a
 * diagnosis to the visit that recorded it. This application records no visit
 * origin, so every diagnosis here is a general, patient-wide one and a record
 * that names a visit is refused. Apart from DiagnosisMutationOrigin and the
 * absent DiagnosisMutationLock the functions below are the complete layer's
 * text. When the two lines are merged, the complete layer replaces this one. */
function DiagnosisMutationFailure(code, message) {
  const error = new Error(message); error.code = 'TREATMENT_' + code; return error;
}
function DiagnosisMutationReadonly() {
  return DiagnosisMutationFailure('VISIT_READONLY', 'To rozpoznanie pochodzi z innej wizyty. Otwórz właściwą wizytę, aby zmienić lub usunąć rozpoznanie.');
}
function DiagnosisMutationOrigin(note) {
  // No visit-origin reader exists here: a named visit cannot be verified.
  if (note && Object.prototype.hasOwnProperty.call(note, 'visitContext')) throw DiagnosisMutationReadonly();
  return null;
}
function DiagnosisMutationBinding(original, binding, assertOwner) {
  const origin = DiagnosisMutationOrigin(original.baseNote);
  if (!origin) return null;
  const current = binding && binding.isCurrent, visit = binding && binding.visitContext;
  if (typeof current !== 'function' || !visit || visit.visitId !== origin.visitId) throw DiagnosisMutationReadonly();
  const check = function () {
    assertOwner();
    if (current.call(binding) !== true) throw DiagnosisMutationReadonly();
    return true;
  };
  check();
  return Object.freeze({ visitContext: Object.freeze(Object.assign({}, origin)), isCurrent: check });
}
function DiagnosisMutationWitness(options) {
  if (!options || !Object.prototype.hasOwnProperty.call(options, 'diagnosisMutation')) return null;
  const witness = options.diagnosisMutation;
  if (!witness || typeof witness !== 'object' || Array.isArray(witness)
      || Object.keys(witness).length !== 1 || !Object.prototype.hasOwnProperty.call(witness, 'visitContext')) {
    throw DiagnosisMutationFailure('INVALID', 'Nieprawidłowy zapis rozpoznania. Otwórz formularz ponownie.');
  }
  const origin = witness.visitContext === null ? null : DiagnosisMutationOrigin(witness);
  if (witness.visitContext !== null && !origin) throw DiagnosisMutationReadonly();
  return { visitContext: origin };
}
function DiagnosisMutationOptions(original, isCurrent) {
  return { isCurrent: isCurrent, diagnosisMutation: { visitContext: DiagnosisMutationOrigin(original.baseNote) } };
}
async function DiagnosisMutationCheckExisting(next, stored, options, assertCurrent, remove) {
  const witness = DiagnosisMutationWitness(options);
  if (!witness) return;
  const decoded = v.VildaPatientTreatmentModel.decode(stored);
  if (decoded.kind !== 'diagnosis' || !remove && v.VildaPatientTreatmentModel.decode(next).kind !== 'diagnosis') {
    throw DiagnosisMutationFailure('UNSUPPORTED', 'Ten zapis nie jest obsługiwanym rozpoznaniem i pozostaje tylko do odczytu.');
  }
  const origin = DiagnosisMutationOrigin(stored);
  if (Bnp_kanon(origin) !== Bnp_kanon(witness.visitContext)) throw DiagnosisMutationReadonly();
  if (!origin) return;
  // A clinical-date correction does not reassign an existing document. Match
  // the permanent visit ID, preserving the document's original date verbatim.
  const session = Bses_opcje(null); assertCurrent(); Bpz_pilnuj(session);
  const visits = await Bvisit_list(next.patientId); assertCurrent(); Bpz_pilnuj(session);
  if (!visits.some(function (row) { return row.patientId === next.patientId && row.visitId === origin.visitId; })) throw DiagnosisMutationReadonly();
}
function DiagnosisMutationAssertDelete(change, stored, tombstone) {
  change.assertCurrent();
  if (!stored || tombstone || stored.id !== change.previous.id || stored.patientId !== change.previous.patientId
      || Bnp_kanon(stored) !== Bnp_kanon(change.previous)) {
    throw DiagnosisMutationFailure('CONFLICT', 'Rozpoznanie zmieniło się lub zostało usunięte. Otwórz je ponownie.');
  }
}
async function DiagnosisMutationDatabase(user, change, openDatabase) {
  change.assertCurrent(); PatientClinicalGuard(user);
  const db = await openDatabase(user); change.assertCurrent();
  return new Promise(function (resolve, reject) {
    let problem;
    const tx = PatientClinicalWriteValue(user, db).transaction([vt, Kt], 'readwrite');
    const notes = tx.objectStore(vt), tombstones = tx.objectStore(Kt);
    const rows = [notes.get(change.previous.id), tombstones.get(change.previous.id)];
    tx.oncomplete = function () { resolve(true); };
    tx.onabort = function () { reject(problem || tx.error || DiagnosisMutationFailure('CONFLICT', 'Nie usunięto rozpoznania.')); };
    let pending = rows.length;
    rows.forEach(function (request) { request.onsuccess = function () {
      if (--pending) return;
      try {
        DiagnosisMutationAssertDelete(change, rows[0].result, rows[1].result);
        notes.delete(change.previous.id); tombstones.put(change.tombstone);
        change.assertCurrent(); PatientClinicalGuard(user);
      } catch (error) { problem = error; tx.abort(); }
    }; });
  });
}
function DiagnosisMutationMemory(user, change, store, flush) {
  PatientClinicalGuard(user);
  DiagnosisMutationAssertDelete(change, store.patientNotes.get(change.previous.id), store.patientNoteTombstones.get(change.previous.id));
  const notes = new Map(store.patientNotes), tombstones = new Map(store.patientNoteTombstones);
  notes.delete(change.previous.id); tombstones.set(change.tombstone.id, Object.assign({}, change.tombstone));
  change.assertCurrent(); store.patientNotes = notes; store.patientNoteTombstones = tombstones; flush(); return true;
}
async function DiagnosisMutationRemove(stored, adapter, account, assertCurrent) {
  const now = new Date().toISOString(), removedAt = stored.updatedAtISO && stored.updatedAtISO > now ? stored.updatedAtISO : now;
  const tombstone = { id: stored.id, deletedAtISO: removedAt };
  if (typeof stored.rev === 'number' && Number.isFinite(stored.rev) && stored.rev > 0) tombstone.rev = stored.rev;
  const change = { previous: stored, tombstone: tombstone, assertCurrent: assertCurrent };
  assertCurrent();
  if (PatientWorkspaceAdapter() === adapter) {
    // Both changes remain in the existing native transaction until its one
    // source commit. A rejected callback discards the entire native stage.
    const existing = await adapter.getPatientNoteForUser(account, stored.id);
    const deleted = await adapter.getPatientNoteTombstoneForUser(account, stored.id);
    DiagnosisMutationAssertDelete(change, existing, deleted);
    await adapter.removePatientNoteForUser(account, stored.id); assertCurrent();
    await adapter.putPatientNoteTombstoneForUser(account, tombstone); assertCurrent();
  } else if (typeof adapter.commitDiagnosisDeleteForUser === 'function') await adapter.commitDiagnosisDeleteForUser(account, change);
  else throw DiagnosisMutationFailure('UNAVAILABLE', 'Ten magazyn nie obsługuje bezpiecznego usuwania rozpoznania.');
  qr({ id: stored.id, patientId: stored.patientId, action: 'delete', deletedAtISO: removedAt });
  try { if (yt && v.VildaSync && typeof v.VildaSync.syncPush === 'function') Promise.resolve(v.VildaSync.syncPush()).catch(function () {}); }
  catch (error) { PatientClinicalRethrow(error); }
  return { id: stored.id, removed: true };
}
function DiagnosisMutationInstall(api) {
  ['updateExistingPatientNote', 'removeExistingPatientNote'].forEach(function (name) {
    const original = api[name];
    api[name] = function (payload, options) {
      if (!options || !Object.prototype.hasOwnProperty.call(options, 'diagnosisMutation')) return original.apply(this, arguments);
      try {
        const captured = Object.assign({}, options, { diagnosisMutation: DiagnosisMutationWitness(options) });
        return original.call(this, payload, captured);
      } catch (error) { return Promise.reject(error); }
    };
  });
}
