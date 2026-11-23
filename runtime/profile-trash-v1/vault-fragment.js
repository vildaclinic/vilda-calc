/* Freeze a legacy chart only when an explicit Trash operation would remove
 * its current source. The encrypted root and Trash share one storage commit;
 * reading a chart never materializes or changes its profile. */
function ProfileTrashRows(rows, patientId) {
  return rows.filter(function (row) {
    return row && row.patientId === patientId && typeof row.id === 'string' && row.id.indexOf('prf-') === 0;
  });
}
function ProfileTrashAuthorizeBaseline(context, current) {
  if (context.kind !== 'patient-profile-legacy-baseline') return;
  if (current.status !== 'legacy' || context.legacyRevisionId !== current.revisionId
      || Bnp_kanon(context.data) !== Bnp_kanon(current.data)) {
    throw ProfileFailure('CONFLICT', 'Nie można zastąpić danych kartoteki inną podstawą ze starszego zapisu.', current);
  }
}
async function ProfileTrashRevisionId(patientId, legacyRevisionId, guard) {
  // Identical automatic preservation on two offline devices is one immutable
  // root. Different legacy facts retain distinct roots and normal conflicts.
  // No wall-clock or Trash operation metadata participates in its identity.
  const input = new TextEncoder().encode(Bnp_kanon(['vilda-profile-trash-root-v1', patientId, legacyRevisionId]));
  const bytes = new Uint8Array(await v.crypto.subtle.digest('SHA-256', input)).slice(0, 16); guard();
  bytes[6] = bytes[6] & 15 | 128; bytes[8] = bytes[8] & 63 | 128;
  const hex = Array.from(bytes, function (byte) { return byte.toString(16).padStart(2, '0'); }).join('');
  return 'prf-' + [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}
async function ProfileTrashPrepare(patientId, visitId, rows, original, account, adapter, guard) {
  const visible = rows.filter(function (row) { return !VisitTrashIdentity(row); });
  const source = Bvisit_groups(visible, patientId)[0];
  if (!source || source.visitId !== visitId) return null;
  const notes = await adapter.listPatientNotesForUser(account); guard();
  if (ProfileTrashRows(notes, patientId).length) return null;
  try {
    const header = await G(original.headerCipher.iv, original.headerCipher.data); guard();
    const data = ProfileModel().legacy(source.payload, header);
    const legacyRevisionId = await ProfileLegacyToken(data); guard();
    let kind = 'patient-profile';
    try {
      if (Bnp_kanon(ProfileModel().normalizeData(data)) !== Bnp_kanon(data)) kind = 'patient-profile-legacy-baseline';
    } catch (_) { kind = 'patient-profile-legacy-baseline'; }
    const context = ProfileModel().normalize({ schemaVersion: 1, kind: kind, parents: [], legacyRevisionId: legacyRevisionId, data: data });
    const id = await ProfileTrashRevisionId(patientId, legacyRevisionId, guard); guard();
    const note = await Ad({ id: id, patientId: patientId, category: 'observation', title: 'Rewizja kartoteki pacjenta',
      body: 'Dane kartoteki zachowane przed przeniesieniem źródłowej wizyty do kosza.',
      linkedAgeMonths: null, clinicalDateISO: null, dueDateISO: null, profileContext: context },
    { token: VildaExistingNoteUpdateToken, beforeCommit: guard, account: account, adapter: adapter, prepareOnly: true });
    guard(); return { note: note };
  } catch (error) {
    guard();
    if (error && error.code) throw error;
    throw ProfileFailure('PRESERVATION_FAILED', 'Nie można bezpiecznie zachować danych starszej kartoteki. Sprawdź jej dane przed przeniesieniem wizyty do kosza.');
  }
}
function ProfileTrashAssert(change, rows, existing, tombstone) {
  change.guard();
  if (change.profile && (ProfileTrashRows(rows, change.patientId).length || existing || tombstone)) {
    throw ProfileFailure('CONFLICT', 'Kartoteka zmieniła się podczas przenoszenia wizyty do kosza. Otwórz aktualne dane.');
  }
}
function ProfileTrashNotify(change) {
  if (change.profile) qr({ id: change.profile.note.id, patientId: change.patientId, action: 'save' });
}
