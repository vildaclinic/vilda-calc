/* Optional encrypted patient treatment context. These helpers are composed
 * into the deployed vault from readable sources; no store or metadata schema
 * is added. Unknown imported versions remain opaque and read-only. */
function TreatmentContextState(plain) {
  return plain && Object.prototype.hasOwnProperty.call(plain, 'treatmentContext')
    ? { present: true, value: JSON.parse(JSON.stringify(plain.treatmentContext)) }
    : { present: false };
}
function TreatmentContextField(state) {
  return state && state.present ? { treatmentContext: JSON.parse(JSON.stringify(state.value)) } : {};
}
function TreatmentContextWrite(payload, previous, options) {
  const model = v.VildaPatientTreatmentModel;
  if (!model) throw new Error('Brak modułu zapisu leczenia. Otwórz kartę ponownie.');
  let old = { kind: 'none' };
  if (previous.present) try { old = model.normalize(previous.value); } catch (_) { old = { kind: 'unsupported' }; }
  if (old.kind === 'unsupported') {
    // Moving a whole patient is not editing this unknown document. Existing
    // native migration keeps the note ID and its opaque content intact.
    if (options && options.Bnp_przen === true && !Object.prototype.hasOwnProperty.call(payload, 'treatmentContext')) return previous;
    const error = new Error('Ten zapis leczenia ma nieobsługiwany format i pozostaje tylko do odczytu.');
    error.code = 'TREATMENT_UNSUPPORTED'; throw error;
  }
  if (!Object.prototype.hasOwnProperty.call(payload, 'treatmentContext')) return previous;
  const incoming = TreatmentContextState(payload);
  if (previous.present && Bnp_kanon(previous.value) === Bnp_kanon(incoming.value)) return previous;
  const normalized = model.normalize(incoming.value);
  if (old.kind !== 'none' && old.kind !== normalized.kind) {
    const error = new Error('Nie można zmienić rozpoznania w epizod leczenia ani odwrotnie.');
    error.code = 'TREATMENT_INVALID'; throw error;
  }
  return { present: true, value: normalized };
}
function TreatmentOperationCurrent(options) {
  return options && typeof options.isCurrent === 'function' ? options.isCurrent : null;
}
function TreatmentOperationAssert(current) {
  if (current && current() !== true) {
    const error = new Error('Kontekst pacjenta się zmienił. Otwórz kartę ponownie.');
    error.code = 'TREATMENT_STALE'; throw error;
  }
}
function TreatmentContextMerge(previous, incoming, incomingWins) {
  // Legacy editors may omit an optional field they do not understand. Keep
  // that opaque context with the existing document; do not combine diagnoses
  // or individual therapy fields from concurrent versions.
  if (!incomingWins) return previous;
  return Object.prototype.hasOwnProperty.call(incoming, 'treatmentContext') ? TreatmentContextState(incoming) : previous;
}
