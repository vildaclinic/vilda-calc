/* Only newly authored treatment documents acquire the open visit. An added
 * nested follow-up carries its own witness; the episode's original visit and
 * every previously recorded follow-up remain independent and immutable here. */
function TreatmentDocumentationInvalid() {
  const error = new Error('Nie można potwierdzić nowego wpisu leczenia. Otwórz formularz ponownie.');
  error.code = 'TREATMENT_DOCUMENT_INVALID'; return error;
}
function TreatmentDocumentationWitness(options) {
  if (!options || !Object.prototype.hasOwnProperty.call(options, 'newTreatmentFollowup')) return null;
  const value = options.newTreatmentFollowup;
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 2
      || typeof value.id !== 'string' || !/^[A-Za-z0-9_.-]{1,160}$/.test(value.id)
      || !Object.prototype.hasOwnProperty.call(value, 'visitContext')) throw TreatmentDocumentationInvalid();
  let origin;
  try { origin = EncounterNoteFields({ visitContext: value.visitContext }).visitContext; }
  catch (_) { throw TreatmentDocumentationInvalid(); }
  return { id: value.id, visitContext: origin };
}
function TreatmentDocumentationCreateOptions(binding, isCurrent) {
  return binding ? { isCurrent: isCurrent, requireActiveVisit: true } : { isCurrent: isCurrent };
}
function TreatmentDocumentationUpdateOptions(binding, isCurrent, followup) {
  const options = { isCurrent: isCurrent };
  if (binding && followup) options.newTreatmentFollowup = TreatmentDocumentationWitness({ newTreatmentFollowup: followup });
  return options;
}
function TreatmentDocumentationLock(note, options, remove, action) {
  const witness = TreatmentDocumentationWitness(options);
  if (!witness) return action();
  if (remove) throw TreatmentDocumentationInvalid();
  // Enter only from the established actor after its workspace lease, and take
  // the same patient lease as whole-visit Trash before entering the note lock.
  return Bzw_podBlokada(note.patientId, action, options);
}
async function TreatmentDocumentationCheckFollowup(next, previous, options, assertCurrent) {
  const witness = TreatmentDocumentationWitness(options);
  if (!witness) return;
  let before, after;
  try {
    const model = v.VildaPatientTreatmentModel;
    before = model.normalize(previous.treatmentContext); after = model.normalize(next.treatmentContext);
    if (before.kind !== 'therapy' || after.kind !== 'therapy' || previous.category !== 'treatment' || next.category !== 'treatment') throw TreatmentDocumentationInvalid();
    const original = before.followups, added = after.followups[original.length];
    if (after.followups.length !== original.length + 1 || !added || added.id !== witness.id
        || original.some(function (entry) { return entry.id === witness.id; })
        || Bnp_kanon(after.followups.slice(0, original.length)) !== Bnp_kanon(original)
        || Bnp_kanon(added.visitContext) !== Bnp_kanon(witness.visitContext)) throw TreatmentDocumentationInvalid();
    delete before.followups; delete after.followups;
    if (Bnp_kanon(before) !== Bnp_kanon(after)) throw TreatmentDocumentationInvalid();
  } catch (_) { throw TreatmentDocumentationInvalid(); }
  assertCurrent();
  await VisitDocumentCheckActive({ patientId: next.patientId, visitContext: witness.visitContext }, { requireActiveVisit: true }, assertCurrent);
  assertCurrent();
}
function TreatmentDocumentationInstall(api) {
  const update = api.updateExistingPatientNote;
  api.updateExistingPatientNote = function (payload, options) {
    if (!options || !Object.prototype.hasOwnProperty.call(options, 'newTreatmentFollowup')) return update.apply(this, arguments);
    try {
      // Snapshot both the owner callback and the separate nested origin before
      // the native workspace queue can yield to another pane or caller edit.
      const captured = Object.assign({}, options, { newTreatmentFollowup: TreatmentDocumentationWitness(options) });
      return update.call(this, payload, captured);
    } catch (error) { return Promise.reject(error); }
  };
}
