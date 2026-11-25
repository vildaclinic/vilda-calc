/* Treatment documents on a device that met them before it knew them.
 *
 * An application version without this record type stores a synchronized
 * diagnosis as a readable note and drops its encrypted treatment context. The
 * same version of that note is never "newer" again, so after the application
 * update the document would stay a plain note on that device.
 *
 * When a sync payload carries exactly the stored version of the same note
 * (id, patient, revision, write time and every readable field) and only the
 * stored copy lacks the context, the stored copy adopts it. Nothing else
 * changes: no new revision and no new write time. A copy that already has a
 * context, a different version or different readable content is left to the
 * ordinary merge rules. Same shape as the care-plan hydration next to it. */
function TreatmentSyncHydrationCandidate(stored, incoming) {
  return !!(stored && incoming && stored.id === incoming.id && stored.patientId === incoming.patientId
    && Number.isSafeInteger(incoming.rev) && incoming.rev >= 0 && (stored.rev || 0) === incoming.rev
    && typeof incoming.updatedAtISO === 'string' && stored.updatedAtISO === incoming.updatedAtISO
    && Object.prototype.hasOwnProperty.call(incoming, 'treatmentContext')
    && incoming.treatmentContext && typeof incoming.treatmentContext === 'object' && !Array.isArray(incoming.treatmentContext));
}
async function TreatmentHydrateSyncRecord(stored, incoming, assertSession) {
  if (!TreatmentSyncHydrationCandidate(stored, incoming)) return null;
  let plain;
  try { plain = await G(stored.bodyCipher.iv, stored.bodyCipher.data); } catch { assertSession(); return null; }
  assertSession();
  if (!plain || typeof plain !== 'object' || Array.isArray(plain)
      || Object.prototype.hasOwnProperty.call(plain, 'treatmentContext')) return null;
  const decoded = await Ft(stored); assertSession();
  const keys = Array.from(new Set(Object.keys(decoded).concat(Object.keys(incoming))));
  // Content-time and state-time fields are not content (as in the care-plan hydration).
  if (!keys.every(function (key) { return key === 'treatmentContext' || Bnp_POLA_CHWIL.indexOf(key) >= 0 || CareMvpSyncEqual(decoded[key], incoming[key]); })) return null;
  const bodyCipher = await V(Object.assign({}, plain, TreatmentContextField(TreatmentContextState(incoming)))); assertSession();
  return Object.assign({}, stored, { bodyCipher });
}
