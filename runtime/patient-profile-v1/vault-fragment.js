/* A profile revision is an immutable encrypted patient document. Revisions
 * share the established note actors, transport and recovery; they are never
 * visits or ordinary clinical notes. Concurrent edits retain separate heads. */
function ProfileFailure(code, message, current) {
  const error = new Error(message); error.code = 'PATIENT_PROFILE_' + code;
  if (current) error.current = current;
  return error;
}
function ProfileModel() {
  if (!v.VildaPatientProfileModel) throw ProfileFailure('UNSUPPORTED', 'Brak modułu kartoteki. Odśwież aplikację.');
  return v.VildaPatientProfileModel;
}
function ProfileEnabled() { return v.__VILDA_HOME_GABINET_PREVIEW__ === true; }
const ProfileRawHeaderToken = {};
function ProfileIsNote(note) { return ProfileModel().isRevision(note); }
function ProfileContextState(value) {
  return value && Object.prototype.hasOwnProperty.call(value, 'profileContext')
    ? { present: true, value: JSON.parse(JSON.stringify(value.profileContext)) } : { present: false };
}
function ProfileContextField(state) { return state && state.present ? { profileContext: JSON.parse(JSON.stringify(state.value)) } : {}; }
function ProfileContextWrite(payload, previous, options) {
  if (previous.present) {
    // Moving the complete patient retains the immutable revision ID, parents
    // and opaque body. A general note editor must never modify this document.
    if (options && options.Bnp_przen === true && !Object.prototype.hasOwnProperty.call(payload, 'profileContext')) return previous;
    throw ProfileFailure('IMMUTABLE', 'Ta rewizja kartoteki jest niezmienna. Zapisz nową rewizję w edycji pacjenta.');
  }
  if (!Object.prototype.hasOwnProperty.call(payload, 'profileContext')) {
    if (typeof payload.id === 'string' && payload.id.indexOf('prf-') === 0) throw ProfileFailure('UNSUPPORTED', 'Nie można nadpisać rewizji kartoteki zwykłą notatką.');
    return previous;
  }
  if (!options || options.token !== VildaExistingNoteUpdateToken || !ProfileModel().isRevisionId(payload.id)) {
    throw ProfileFailure('INVALID', 'Rewizję kartoteki zapisuje wyłącznie jej własny formularz.');
  }
  const allowed = ['id', 'patientId', 'category', 'title', 'body', 'profileContext', 'linkedAgeMonths', 'clinicalDateISO', 'dueDateISO'];
  if (Object.keys(payload).some(function (key) { return allowed.indexOf(key) < 0; }) || payload.category !== 'observation') {
    throw ProfileFailure('INVALID', 'Rewizja kartoteki nie może zawierać dodatkowych pól dokumentacji.');
  }
  if (payload.visitContext != null || payload.dueDateISO != null || payload.linkedAgeMonths != null
    || payload.medication != null || payload.labResult != null || payload.careContext != null || payload.treatmentContext != null
    || payload.reminderContext != null || payload.ghPointId != null || payload.obesityPointId != null || payload.seriesId != null) {
    throw ProfileFailure('INVALID', 'Kartoteka nie jest wizytą, leczeniem ani przypomnieniem.');
  }
  return { present: true, value: ProfileModel().normalize(payload.profileContext) };
}
function ProfileContextMerge(previous, incoming) {
  if (!Object.prototype.hasOwnProperty.call(incoming || {}, 'profileContext')) return previous;
  const next = ProfileContextState(incoming);
  if (!previous.present || Bnp_kanon(previous.value) === Bnp_kanon(next.value)) return next;
  // A genuine edit always has a NEW note ID. A reused ID with differing
  // contexts is a collision, not a last-writer-wins profile update. Preserve
  // both opaque values and make the projection read-only.
  const values = previous.value && previous.value.kind === 'patient-profile-collision'
    && Array.isArray(previous.value.candidates) ? previous.value.candidates.slice() : [previous.value];
  if (!values.some(function (value) { return Bnp_kanon(value) === Bnp_kanon(next.value); })) values.push(next.value);
  values.sort(function (a, z) { return Bnp_kanon(a).localeCompare(Bnp_kanon(z)); });
  return { present: true, value: { schemaVersion: 1, kind: 'patient-profile-collision', candidates: values } };
}
async function ProfilePreflightSync(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  const scope = ProfileCapture();
  for (const note of Array.isArray(payload.patientNotes) ? payload.patientNotes : []) {
    if (!ProfileIsNote(note)) continue;
    if (!ProfileModel().isRevisionId(note.id)) throw ProfileFailure('UNSUPPORTED', 'Nieobsługiwany identyfikator rewizji kartoteki. Oryginał pozostaje bez zmian.');
    if (!Object.prototype.hasOwnProperty.call(note, 'profileContext')) continue;
    const stored = await I().getPatientNoteForUser(scope.account, note.id); scope.check();
    if (!stored) continue;
    const previous = await Ft(stored); scope.check();
    if (Object.prototype.hasOwnProperty.call(previous, 'profileContext')
      && Bnp_kanon(previous.profileContext) !== Bnp_kanon(note.profileContext)) {
      throw ProfileFailure('CONFLICT', 'Dwie różne treści używają tego samego identyfikatora rewizji kartoteki. Nie nadpisano istniejącej rewizji.');
    }
  }
  // An older generic note screen may send an individual delete for a record
  // it does not understand. That delete must not roll the profile back to an
  // ancestor. Keep unrelated sync work and valid whole-patient deletion;
  // reuse the existing strict deletedWithPatient parser and ownership check.
  let filtered = false;
  const tombstones = [];
  for (const tombstone of Array.isArray(payload.patientNoteTombstones) ? payload.patientNoteTombstones : []) {
    if (tombstone && typeof tombstone.id === 'string' && tombstone.id.indexOf('prf-') === 0) {
      const origin = Bnp_pole(tombstone);
      if (!origin) { filtered = true; continue; }
      const stored = await I().getPatientNoteForUser(scope.account, tombstone.id); scope.check();
      if (stored && stored.patientId !== origin.patientId) { filtered = true; continue; }
    }
    tombstones.push(tombstone);
  }
  return filtered ? Object.assign({}, payload, { patientNoteTombstones: tombstones }) : payload;
}
function ProfileGuardDelete(record, deletedWithPatient) {
  if (!record || typeof record.id !== 'string' || record.id.indexOf('prf-') !== 0) return;
  if (deletedWithPatient && deletedWithPatient.patientId === record.patientId && typeof deletedWithPatient.deletedAtISO === 'string') return;
  throw ProfileFailure('IMMUTABLE', 'Historia kartoteki jest niezmienna. Rewizje są usuwane wyłącznie razem z całą kartą pacjenta.');
}
function ProfileCapture(options) {
  const account = b, key = ot, api = v.VildaVault;
  const current = options && typeof options.isCurrent === 'function' ? options.isCurrent : null;
  function check() {
    if (!T() || b !== account || ot !== key || v.VildaVault !== api || current && current() !== true) {
      throw ProfileFailure('STALE', 'Kontekst pacjenta lub sesja się zmieniły. Otwórz kartotekę ponownie.');
    }
    PatientClinicalGuard(account);
    return true;
  }
  check(); return { account: account, api: api, check: check };
}
async function ProfileHeaderIndex(check) {
  if (check) check();
  const account = b, key = ot, adapter = I();
  const stored = await adapter.listPatientNotesForUser(account); if (check) check();
  if (!T() || b !== account || ot !== key || I() !== adapter) throw Bses_blad();
  const index = new Map();
  for (const row of stored) {
    if (!row || typeof row.id !== 'string' || row.id.indexOf('prf-') !== 0) continue;
    if (!index.has(row.patientId)) index.set(row.patientId, []);
    index.get(row.patientId).push(row);
  }
  return index;
}
async function ProfileRawNotes(patientId, check, index) {
  index = index || await ProfileHeaderIndex(check);
  const stored = index.get(patientId) || [];
  const notes = [];
  for (const row of stored) {
    const note = await Ft(row); if (check) check();
    if (ProfileIsNote(note)) notes.push(note);
  }
  return notes;
}
async function ProfileLegacyToken(data) {
  const bytes = new TextEncoder().encode(Bnp_kanon(data));
  const hash = await v.crypto.subtle.digest('SHA-256', bytes);
  return 'legacy:' + Array.from(new Uint8Array(hash)).map(function (byte) { return byte.toString(16).padStart(2, '0'); }).join('');
}
async function ProfileRead(patientId, options, suppliedRecord) {
  const scope = ProfileCapture(options), patient = suppliedRecord || await VisitTrashPublicPatient(patientId); scope.check();
  if (!patient) throw ProfileFailure('MISSING', 'Karta pacjenta nie jest już dostępna.');
  // The public raw reader has already decrypted and removed identity-only
  // anchors. Never classify an encrypted row as a clinical snapshot.
  const visits = Bvisit_groups(patient.snapshots || [], patientId);
  const payload = visits[0] && visits[0].payload || patient.snapshots && patient.snapshots[0] && patient.snapshots[0].payload;
  const legacyData = ProfileModel().legacy(payload, patient.header), legacyToken = await ProfileLegacyToken(legacyData); scope.check();
  const notes = await ProfileRawNotes(patientId, scope.check);
  const result = ProfileModel().project(notes, { patientId: patientId, legacyData: legacyData, legacyToken: legacyToken });
  scope.check(); return result;
}
async function ProfileEffectiveHeader(patientId, header, index) {
  if (!ProfileEnabled()) return header;
  const scope = ProfileCapture(), notes = await ProfileRawNotes(patientId, scope.check, index);
  if (!notes.length) return header;
  // A directory only needs the profile log, never clinical snapshot payloads.
  const profile = ProfileModel().project(notes, { patientId: patientId });
  if (profile.status !== 'ready') return Object.assign({}, header, { profileStatus: profile.status });
  const result = Object.assign({}, header), user = profile.data.user;
  ['firstName', 'lastName', 'dobISO', 'sex'].forEach(function (key) {
    delete result[key];
    if (Object.prototype.hasOwnProperty.call(user, key) && user[key] !== null && user[key] !== '') result[key] = user[key];
  });
  result.name = [user.lastName, user.firstName].filter(Boolean).join(' ');
  result.profileStatus = profile.status;
  return result;
}
async function ProfilePublicPatient(patientId) {
  if (!ProfileEnabled()) return VisitTrashPublicPatient(patientId);
  const record = await VisitTrashPublicPatient(patientId);
  if (!record) return record;
  record.profile = await ProfileRead(patientId, null, record);
  return record;
}
async function ProfileBeforeCreate(note, check) {
  if (!Object.prototype.hasOwnProperty.call(note, 'profileContext')) return;
  const context = ProfileModel().normalize(note.profileContext), current = await ProfileRead(note.patientId); check();
  if (current.status === 'conflict' && context.parents.length > 1) {
    if (Bnp_kanon(context.parents) !== Bnp_kanon(current.heads.slice().sort())) throw ProfileFailure('CONFLICT', 'Zestaw równoległych zmian kartoteki się zmienił.', current);
    return;
  }
  if (!current.editable) throw ProfileFailure(current.status === 'conflict' ? 'CONFLICT' : current.status === 'incomplete' ? 'INCOMPLETE' : 'UNSUPPORTED',
    'Kartoteka wymaga sprawdzenia przed kolejną zmianą.', current);
  const expected = context.parents.length === 0 ? context.legacyRevisionId : context.parents.length === 1 ? context.parents[0] : null;
  if (!expected || current.revisionId !== expected) throw ProfileFailure('CONFLICT', 'Kartoteka zmieniła się podczas edycji. Otwórz aktualne dane.', current);
}
function ProfileCreateLock(note, options, action) {
  if (!Object.prototype.hasOwnProperty.call(note, 'profileContext')) return action();
  // Entered from the existing native note actor: workspace → patient → note,
  // matching patient deletion/merge and preventing an inverted outer lock.
  return Bzw_podBlokada(note.patientId, action, options);
}
function ProfileSave(request, options) { return ProfileSaveIntent(request, options, false); }
function ProfileResolve(request, options) { return ProfileSaveIntent(request, options, true); }
function ProfileSaveIntent(request, options, resolving) {
  // This function intentionally captures before entering any asynchronous
  // actor. The established save-once API copies this immutable intent again
  // before waiting for the native workspace queue.
  let input, scope;
  try {
    if (!ProfileEnabled()) throw ProfileFailure('UNSUPPORTED', 'Edycja niezależnej kartoteki jest dostępna w podglądzie.');
    input = ProfileModel().clone(request); scope = ProfileCapture(options);
  }
  catch (error) { return Promise.reject(error); }
  return (async function () {
    if (!input || typeof input.patientId !== 'string' || !input.patientId
      || !resolving && typeof input.expectedRevisionId !== 'string'
      || resolving && (!Array.isArray(input.expectedHeadIds) || input.expectedHeadIds.length < 2
        || input.expectedHeadIds.some(function (id) { return !ProfileModel().isRevisionId(id); }) || new Set(input.expectedHeadIds).size !== input.expectedHeadIds.length)) {
      throw ProfileFailure('INVALID', 'Brak bazowej rewizji kartoteki.');
    }
    const data = ProfileModel().normalizeData(input.data), record = await scope.api.getPatient(input.patientId); scope.check();
    if (!record || !record.profile) throw ProfileFailure('MISSING', 'Nie znaleziono kartoteki pacjenta.');
    const current = record.profile;
    if (resolving) {
      if (current.status !== 'conflict' || Bnp_kanon(current.heads.slice().sort()) !== Bnp_kanon(input.expectedHeadIds.slice().sort())) {
        throw ProfileFailure('CONFLICT', 'Zestaw równoległych zmian kartoteki się zmienił.', current);
      }
    } else {
      if (!current.editable) throw ProfileFailure(current.status === 'conflict' ? 'CONFLICT' : current.status === 'incomplete' ? 'INCOMPLETE' : 'UNSUPPORTED', 'Kartoteka wymaga sprawdzenia przed kolejną zmianą.', current);
      if (current.revisionId !== input.expectedRevisionId) throw ProfileFailure('CONFLICT', 'Kartoteka zmieniła się podczas edycji. Otwórz aktualne dane.', current);
      // A malformed legacy fact can be repaired. Validate only the new data;
      // an unnormalizable old projection is a change, never a write barrier.
      let same;
      try { same = Bnp_kanon(ProfileModel().normalizeData(current.data)) === Bnp_kanon(data); } catch (_) { same = false; }
      if (same) return Object.assign({}, current, { unchanged: true });
    }
    const id = 'prf-' + v.crypto.randomUUID(), context = { schemaVersion: 1, kind: 'patient-profile',
      parents: resolving ? current.heads.slice().sort() : current.status === 'legacy' ? [] : [current.revisionId], data: data };
    if (current.status === 'legacy') context.legacyRevisionId = current.revisionId;
    const note = { id: id, patientId: input.patientId, category: 'observation', title: 'Rewizja kartoteki pacjenta',
      body: 'Dane kartoteki pacjenta. Ten dokument pozostaje niezmienny; edycja tworzy kolejną rewizję.',
      linkedAgeMonths: null, clinicalDateISO: null, dueDateISO: null, profileContext: context };
    scope.check();
    const saved = await scope.api.savePatientNoteOnce(note, { isCurrent: scope.check,
      onLockWait: options && options.onLockWait }); scope.check();
    if (!saved || saved.saved !== true) throw ProfileFailure('CONFLICT', 'Nie potwierdzono zapisu kartoteki. Otwórz aktualne dane.');
    const after = await scope.api.getPatient(input.patientId); scope.check();
    if (!after || !after.profile || !after.profile.history.some(function (entry) { return entry.revisionId === id; })) throw ProfileFailure('MISSING', 'Nie potwierdzono odczytu zapisanej rewizji.');
    if (after.profile.status !== 'ready') {
      const error = ProfileFailure('CONFLICT', 'Zachowano równoległe zmiany kartoteki. Wymagają rozstrzygnięcia.', after.profile);
      error.committedRevisionId = id; throw error;
    }
    return after.profile;
  })();
}
const ProfileMergeReadToken = {};
function ProfileIncludesMerge(read) { return !!read && read.token === ProfileMergeReadToken; }
function ProfileCheckMergeRead(read) { if (ProfileIncludesMerge(read)) Bpz_pilnuj(read.operation); }
async function ProfileNotesForMerge(patientId, operation) {
  Bpz_pilnuj(operation);
  const notes = await Fn(patientId, { token: ProfileMergeReadToken, operation: operation });
  Bpz_pilnuj(operation);
  return notes;
}
function ProfileInstallPresentation(api) {
  const get = api.getPatientNote;
  // Keep the existing workspace wrapper on this public read. Ordinary list
  // readers filter at their own production return; transport/backup walk raw
  // encrypted rows directly and retain every immutable profile revision.
  api.getPatientNote = async function () { const note = await get.apply(this, arguments); return ProfileIsNote(note) ? null : note; };
}
