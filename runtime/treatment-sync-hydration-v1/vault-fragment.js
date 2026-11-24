/* An older client may keep the readable fields of a treatment note while
 * dropping its treatment context, visit origin, or both. Recover only absent
 * fields from the same version of that note. Existing contexts, write time
 * and revision are preserved. Patient-profile revisions have their own
 * immutable record type and are outside this recovery. */
function TreatmentSyncHydrationCandidate(stored, incoming) {
  return !!(stored && incoming && stored.id === incoming.id && stored.patientId === incoming.patientId
    && Number.isSafeInteger(incoming.rev) && incoming.rev >= 0 && (stored.rev || 0) === incoming.rev
    && typeof incoming.updatedAtISO === 'string' && stored.updatedAtISO === incoming.updatedAtISO
    && incoming.category === 'treatment' && Object.hasOwn(incoming, 'treatmentContext')
    && incoming.treatmentContext && typeof incoming.treatmentContext === 'object' && !Array.isArray(incoming.treatmentContext)
    && !ProfileIsNote(incoming));
}
async function TreatmentHydrateSyncRecord(stored, incoming, assertSession) {
  if (!TreatmentSyncHydrationCandidate(stored, incoming)) return null;
  let plain;
  try { plain = await G(stored.bodyCipher.iv, stored.bodyCipher.data); } catch { assertSession(); return null; }
  assertSession();
  if (!plain || typeof plain !== 'object' || Array.isArray(plain)) return null;
  const additions = {};
  if (!Object.hasOwn(plain, 'treatmentContext')) {
    Object.assign(additions, TreatmentContextField(TreatmentContextState(incoming)));
  }
  if (!Object.hasOwn(plain, 'visitContext') && Object.hasOwn(incoming, 'visitContext')) {
    try { Object.assign(additions, EncounterNoteFields(incoming)); } catch { return null; }
  }
  if (!Object.keys(additions).length) return null;
  const decoded = await Ft(stored); assertSession();
  const keys = Array.from(new Set(Object.keys(decoded).concat(Object.keys(incoming))));
  // Content-time and state-time fields are not content (as in the care-plan hydration).
  if (!keys.every(function (key) { return Object.hasOwn(additions, key) || Bnp_POLA_CHWIL.includes(key) || CareMvpSyncEqual(decoded[key], incoming[key]); })) return null;
  const bodyCipher = await V(Object.assign({}, plain, additions)); assertSession();
  return Object.assign({}, stored, { bodyCipher });
}
