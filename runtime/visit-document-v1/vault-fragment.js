/* Opt-in durability of newly authored visit documents. No origin is inferred,
 * reassigned or migrated. Existing receipts and historical documents retain
 * their original contracts. The native workspace fragment stays unchanged. */
function VisitDocumentFailure(code, message) {
  const error = new Error(message); error.code = 'VISIT_DOCUMENT_' + code; return error;
}
function VisitDocumentRequired(note, options) {
  return !!(options && options.requireActiveVisit === true && !ProfileIsNote(note));
}
function VisitDocumentOrigin(note) {
  let origin;
  try { origin = EncounterNoteFields(note).visitContext; }
  catch (_) { throw VisitDocumentFailure('INVALID', 'Nieprawidłowe powiązanie dokumentu z wizytą. Otwórz formularz ponownie.'); }
  if (!origin) throw VisitDocumentFailure('INVALID', 'Dokument wymaga wskazania otwartej wizyty.');
  return origin;
}
function VisitDocumentCreateLock(note, options, action) {
  if (!VisitDocumentRequired(note, options)) return ProfileCreateLock(note, options, action);
  VisitDocumentOrigin(note);
  // Called inside the established native actor: workspace → patient → note.
  // The same patient lock is held by whole-visit trash through its commit.
  return Bzw_podBlokada(note.patientId, action, options);
}
async function VisitDocumentCheckActive(note, options, assertCurrent) {
  if (!VisitDocumentRequired(note, options)) return;
  const origin = VisitDocumentOrigin(note), session = Bses_opcje(null);
  assertCurrent(); Bpz_pilnuj(session);
  const visits = await Bvisit_list(note.patientId);
  assertCurrent(); Bpz_pilnuj(session);
  if (!visits.some(function (visit) {
    return visit.patientId === note.patientId && visit.visitId === origin.visitId
      && visit.clinicalDateISO === origin.clinicalDateISO;
  })) {
    throw VisitDocumentFailure('STALE', 'Wybrana wizyta została usunięta lub zmieniła się. Otwórz ją ponownie przed zapisem dokumentu.');
  }
}
function VisitDocumentCareLock(request, binding, action) {
  if (request.action !== 'addStep') return action();
  const session = Bses_opcje(null); Bpz_pilnuj(session);
  // The legacy actor already holds the workspace lease; take the patient
  // lease before its plan-note lock, matching whole-visit trash ordering.
  return Bzw_podBlokada(request.patientId, function () {
    Bpz_pilnuj(session); EncounterPlanCheck(binding, request.patientId);
    return action();
  }, binding);
}
function VisitDocumentCareOrigin(request, existing, payload) {
  if (request.action !== 'addStep' || existing.stored || !request.visitContext
      || !payload.careContext || ['step', 'calendar'].indexOf(payload.careContext.role) < 0) return null;
  return EncounterNoteFields(request);
}
function VisitDocumentCareCurrent(patientId) {
  const local = v.VildaHomeEncounter;
  if (local && typeof local.captureBinding === 'function') return local.captureBinding(patientId);
  const shell = v.VildaShell;
  return shell && typeof shell.captureActiveHomeDocumentationBinding === 'function'
    ? shell.captureActiveHomeDocumentationBinding(patientId) : null;
}
function VisitDocumentInstall(api) {
  const save = api.savePatientNoteOnce;
  api.savePatientNoteOnce = function (payload, options) {
    if (!options || options.requireActiveVisit !== true) return save.apply(this, arguments);
    // Capture the opt-in synchronously before the existing native wrapper
    // waits for its workspace lease. Later caller mutations cannot remove it.
    const captured = Object.assign({}, options, { requireActiveVisit: true });
    return save.call(this, payload, captured);
  };
}
