/* Explicit provenance for newly authored reminder and legacy care outcomes.
 * Existing parents, facts, dates, receipts and compound transactions retain
 * their native contracts. Entered inside the original workspace actor. */
function DocumentOutcomeCapture(binding) {
  if (!binding || binding.blocked === true || typeof binding.isCurrent !== 'function'
      || typeof binding.ensureRecorded !== 'function' || binding.isCurrent() !== true) {
    throw VisitDocumentFailure('STALE', 'Zmieniono wizytę. Otwórz formularz ponownie.');
  }
  const origin = VisitDocumentOrigin({ visitContext: binding.visitContext });
  const current = binding.isCurrent.bind(binding), record = binding.ensureRecorded.bind(binding);
  return Object.freeze({ visitContext: Object.freeze(Object.assign({}, origin)),
    isCurrent: current, ensureRecorded: record });
}
function DocumentOutcomePatientLock(request, binding, action) {
  const session = Bses_opcje(null); Bpz_pilnuj(session);
  // The native workspace / portable-plan lease is already held. Patient
  // precedes reminder/plan-note locks and remains held through durable commit.
  return Bzw_podBlokada(request.patientId, function () {
    Bpz_pilnuj(session); EncounterPlanCheck(binding, request.patientId);
    return action();
  }, binding);
}
function DocumentOutcomeCareOrigin(request, existing, payload) {
  if (existing.stored || !request.visitContext || !payload.careContext
      || ['step', 'calendar', 'note', 'result'].indexOf(payload.careContext.role) < 0) return null;
  return EncounterNoteFields(request);
}
async function DocumentOutcomeCheck(request, assertCurrent) {
  if (!request.visitContext) return;
  await VisitDocumentCheckActive({ patientId: request.patientId, visitContext: request.visitContext },
    { requireActiveVisit: true }, assertCurrent);
  assertCurrent();
}
function DocumentOutcomesInstall(api) {
  ['saveReminderOutcome', 'mutateCarePlan'].forEach(function (name) {
    const original = api[name];
    api[name] = function (input, binding) {
      if (!binding) return original.apply(this, arguments);
      let request, captured;
      try { request = JSON.parse(JSON.stringify(input)); captured = DocumentOutcomeCapture(binding); }
      catch (error) { return Promise.reject(error); }
      // Recording is a public operation and must finish BEFORE the native
      // workspace queue/shared lease. The inner actor takes patient→note and
      // validates the canonical visit without re-entering public actors.
      return EncounterPlanRun(request, captured, function () { return original.call(api, request, captured); });
    };
  });
}
