import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The deployed vault is a historical minified artifact. Keep this narrow
// addition readable and reproducible without reformatting unrelated code.
// Internal bindings: Ac = per-note lock; Ad = writer; Eb = tombstone remover;
// I/b/ot = storage/current user/master-key session; T = unlocked; Ft = decode.
export const existingNoteUpdateSource = `
/* KLIRENS-ISTNIEJACY-WYNIK: conditional mutations never create/resurrect an ID.
 * Default savePatientNote/removePatientNote retain their existing behaviour.
 * Every note writer/remover/merge uses Ac(id), including this guard and write.
 */
const VildaExistingNoteUpdateToken = {};
async function VildaChangeExistingPatientNote(payload, remove) {
  if (!T()) throw new Error("Zaloguj się, by zmienić notatkę pacjenta.");
  if (!payload || typeof payload !== "object" ||
      typeof payload.id !== "string" || !payload.id ||
      typeof payload.patientId !== "string" || !payload.patientId ||
      !Number.isSafeInteger(payload.baseRev) || payload.baseRev < 0) {
    throw new Error("existingPatientNote: wymagane id, patientId i baseRev.");
  }
  // Capture the original target and complete result before waiting for Ac.
  const next = JSON.parse(JSON.stringify(payload)), account = b, sessionKey = ot;
  function assertSession() {
    if (!T() || b !== account || ot !== sessionKey) {
      throw new Error("Sesja sejfu zmieniła się. Otwórz wynik ponownie.");
    }
  }
  return Ac(next.id, async function () {
    assertSession();
    const adapter = I();
    if (typeof adapter.listPatientNoteTombstonesForUser !== "function" ||
        remove && typeof adapter.putPatientNoteTombstoneForUser !== "function") {
      throw new Error("existingPatientNote: magazyn nie obsługuje bezpiecznej zmiany.");
    }
    const stored = await adapter.getPatientNoteForUser(account, next.id);
    const tombstones = await adapter.listPatientNoteTombstonesForUser(account);
    assertSession();
    const result = remove ? { id: next.id, removed: false }
      : { id: next.id, isNew: false, updated: false };
    if (tombstones.some(function (entry) { return entry && entry.id === next.id; })) {
      return Object.assign(result, { reason: "deleted" });
    }
    if (!stored) return Object.assign(result, { reason: "missing" });
    if (stored.patientId !== next.patientId) {
      return Object.assign(result, { reason: "patient-mismatch" });
    }
    const revision = Number.isSafeInteger(stored.rev) && stored.rev >= 0 ? stored.rev : 0;
    if (revision !== next.baseRev) {
      const current = await Ft(stored);
      assertSession();
      return Object.assign(result, { reason: "conflict", conflict: true, rev: revision, current });
    }
    // Dispatch plan-owned records only after acquiring this note's original
    // lock and checking its patient, tombstone and exact captured revision.
    const careNote = await Ft(stored); assertSession();
    if (careNote.careContext && ['step', 'calendar'].indexOf(careNote.careContext.role) >= 0) {
      if (remove) {
        const handled = await CareMvpLegacyDelete(next.id, next.baseRev); assertSession();
        if (handled !== null) return handled ? { id: next.id, removed: true } : Object.assign(result, { conflict: true, reason: 'conflict' });
      } else {
        const handled = await CareMvpLegacyWrite(next); assertSession();
        if (handled) return handled;
      }
    }
    const guard = { token: VildaExistingNoteUpdateToken, beforeCommit: assertSession, account, adapter };
    if (remove) {
      // Invoke the existing remover directly, retaining its tombstone policy.
      const removed = await Eb(next.id, undefined, undefined, guard);
      return { id: next.id, removed: removed === true };
    }
    // Calling public savePatientNote here would re-enter Ac. The clinical
    // caller supplies a complete regenerated body/labResult/date payload.
    const saved = await Ad(next, guard);
    if (saved.conflict) return Object.assign(result, saved, { reason: "conflict" });
    return Object.assign({}, saved, { isNew: false, updated: true });
  });
}
function VildaUpdateExistingPatientNote(payload) {
  return VildaChangeExistingPatientNote(payload, false);
}
function VildaRemoveExistingPatientNote(payload) {
  return VildaChangeExistingPatientNote(payload, true);
}
// Compare persisted clinical fields, never raw unsanitized request objects.
// In particular Z normalizes whitespace and kt drops unsupported valueNum < 0.
function VildaOnceClinicalPayload(note) {
  return JSON.stringify([
    note.patientId, Un(note.category), Z(note.title).trim(), Z(note.body),
    Ct(note.clinicalDateISO), ye(note.linkedAgeMonths), kt(note.labResult),
    ...(note.reminderContext && note.reminderContext.kind === 'reminder' ? [Cn(note.dueDateISO), note.dueTime || null] : [])
  ]);
}
async function VildaSavePatientNoteOnce(payload) {
  if (!T()) throw new Error("Zaloguj się, by zapisać wynik pacjenta.");
  if (!payload || typeof payload !== "object" ||
      typeof payload.id !== "string" || !payload.id ||
      typeof payload.patientId !== "string" || !payload.patientId) {
    throw new Error("savePatientNoteOnce: wymagane id i patientId.");
  }
  const next = JSON.parse(JSON.stringify(payload)), account = b, sessionKey = ot;
  function assertSession() {
    if (!T() || b !== account || ot !== sessionKey) {
      throw new Error("Sesja sejfu zmieniła się. Ponów zapis po odblokowaniu.");
    }
  }
  return Ac(next.id, async function () {
    assertSession();
    const adapter = I();
    if (typeof adapter.listPatientNoteTombstonesForUser !== "function") {
      throw new Error("savePatientNoteOnce: magazyn nie obsługuje bezpiecznego zapisu.");
    }
    const stored = await adapter.getPatientNoteForUser(account, next.id);
    const tombstones = await adapter.listPatientNoteTombstonesForUser(account);
    assertSession();
    if (tombstones.some(function (entry) { return entry && entry.id === next.id; })) {
      return { id: next.id, saved: false, reason: "deleted" };
    }
    if (stored) {
      if (stored.patientId !== next.patientId) {
        return { id: next.id, saved: false, reason: "conflict", conflict: true };
      }
      const current = await Ft(stored);
      assertSession();
      if (VildaOnceClinicalPayload(current) !== VildaOnceClinicalPayload(next)) {
        return { id: next.id, saved: false, reason: "conflict", conflict: true };
      }
      // An earlier request committed but its acknowledgement was lost. This
      // is a read-only acknowledgement, not an upsert of the old calculation.
      return { id: next.id, saved: true, reused: true };
    }
    const saved = await Ad(next, { token: VildaExistingNoteUpdateToken, beforeCommit: assertSession, account, adapter });
    return Object.assign({}, saved, { saved: true, reused: false });
  });
}
`;

const insertionAnchor = 'async function ie(t,e){';
// B2.2 follows this block in the current artifact. Reapplying the older
// conditional-note patch must keep that source order, including its shared token.
const remindersInsertionAnchor = '/* P-PRZYPOMNIENIA-B22: encrypted note context;';
const careInsertionAnchor = '/* PLANY-OPIEKI MVP.';
export const existingNoteExportAnchor = 'savePatientNote:ie,getPatientNote:Fe';
export const existingNoteExportReplacement = 'savePatientNote:ie,savePatientNoteOnce:VildaSavePatientNoteOnce,updateExistingPatientNote:VildaUpdateExistingPatientNote,getPatientNote:Fe';
export const existingNoteRemoveExportAnchor = 'removePatientNote:$o,onPatientNoteChanged:ms';
export const existingNoteRemoveExportReplacement = 'removePatientNote:$o,removeExistingPatientNote:VildaRemoveExistingPatientNote,onPatientNoteChanged:ms';
export const existingNoteCommitAnchor = 'await I().putPatientNoteForUser(b,nt);';
export const existingNoteCommitReplacement = 'if(e&&e.token===VildaExistingNoteUpdateToken){e.beforeCommit();if(e.prepareOnly)return nt;}' + existingNoteCommitAnchor;
// The format guard belongs to the current base remover, not to this conditional
// note addition. Retain it in the reconstructed prior source and in the result.
// These explicit source anchors deliberately do not read the deployed artifact
// to derive their own expected text.
const existingNoteDeleteFormatGuard = 'const CareMvpDeleteAccount=b,CareMvpDeleteSession=ot,CareMvpDeleteAdapter=I(),CareMvpDeleteGuard=function(){if(!T()||b!==CareMvpDeleteAccount||ot!==CareMvpDeleteSession||I()!==CareMvpDeleteAdapter)throw Bses_blad();};';
export const existingNoteDeleteAnchor = 'async function Eb(t,Qwp,Qwm){' + existingNoteDeleteFormatGuard;
export const existingNoteDeleteReplacement = 'async function Eb(t,Qwp,Qwm,Qwf){' + existingNoteDeleteFormatGuard + 'const Qwg=Qwf&&Qwf.token===VildaExistingNoteUpdateToken?Qwf:null;';

// P-SESJA-ZAPISU (PR-S, przegląd 3): Bpz_pilnuj(Qws) w Eb (sesja „Scal pacjentów”, 5. argument) stoi w kotwicach
// usunięcia i powiadomienia — przed sprawdzeniem tokenu i po zapisie nagrobka.
// Only the opted-in call captures its account/adapter across awaits, runs a
// final session check, and propagates read/tombstone errors. With no private
// guard token the old remover follows exactly the same expressions/catches.
// The base remover first captures its legacy metadata, then guards the already
// read encrypted row outside the legacy read catch. Conditional callers add
// their own session check to that existing closure; the format check remains.
const existingNoteDeleteAssertAnchor = 'const CareMvpDeleteAssert=function(){Bpz_pilnuj(Qws);CareMvpDeleteGuard();};';
const existingNoteDeleteAssertReplacement = 'const CareMvpDeleteAssert=function(){if(Qwg)Qwg.beforeCommit();Bpz_pilnuj(Qws);CareMvpDeleteGuard();};';
const existingNoteDeleteMutations = [
  [existingNoteDeleteAnchor, existingNoteDeleteReplacement],
  ['await I().getPatientNoteForUser(b,t)', 'await (Qwg?Qwg.adapter:I()).getPatientNoteForUser(Qwg?Qwg.account:b,t)'],
  ['}catch{}const CareMvpDeleteAssert=function(){', '}catch(Qwe){if(Qwg)throw Qwe}const CareMvpDeleteAssert=function(){'],
  [existingNoteDeleteAssertAnchor, existingNoteDeleteAssertReplacement],
  ['Bpz_pilnuj(Qws);await I().removePatientNoteForUser(b,t);', 'Bpz_pilnuj(Qws);if(Qwg)Qwg.beforeCommit();await (Qwg?Qwg.adapter:I()).removePatientNoteForUser(Qwg?Qwg.account:b,t);'],
  ['try{const r=I();r&&typeof r.putPatientNoteTombstoneForUser', 'try{const r=Qwg?Qwg.adapter:I();r&&typeof r.putPatientNoteTombstoneForUser'],
  ['r.putPatientNoteTombstoneForUser(b,', 'r.putPatientNoteTombstoneForUser(Qwg?Qwg.account:b,'],
  ['}catch{}Bpz_pilnuj(Qws);qr({id:t,patientId:e,action:"delete"',
    '}catch(Qwe){if(Qwg)throw Qwe}Bpz_pilnuj(Qws);qr({id:t,patientId:e,action:"delete"'],
];

export function patchExistingNoteDeleteWriter(block) {
  if (!block.startsWith(existingNoteDeleteAnchor)) throw new Error('Unexpected note remover.');
  let updated = block;
  for (const [anchor, replacement] of existingNoteDeleteMutations) {
    if (updated.split(anchor).length !== 2) throw new Error(`Expected one remover anchor: ${anchor}`);
    updated = updated.replace(anchor, replacement);
  }
  return updated;
}
export function unpatchExistingNoteDeleteWriter(block) {
  if (!block.startsWith(existingNoteDeleteReplacement)) throw new Error('Unexpected conditional note remover.');
  let updated = block;
  for (const [anchor, replacement] of existingNoteDeleteMutations.slice().reverse()) {
    if (updated.split(replacement).length !== 2) throw new Error(`Expected one conditional remover anchor: ${replacement}`);
    updated = updated.replace(replacement, anchor);
  }
  return updated;
}

export function patchVaultExistingNote(source) {
  const targetAnchor = source.includes(careInsertionAnchor) ? careInsertionAnchor : source.includes(remindersInsertionAnchor) ? remindersInsertionAnchor : insertionAnchor;
  const marks = [existingNoteUpdateSource, existingNoteExportReplacement, existingNoteRemoveExportReplacement, existingNoteCommitReplacement, existingNoteDeleteReplacement];
  if (marks.every(mark => source.includes(mark))) {
    for (const mark of marks) if (source.split(mark).length !== 2) throw new Error(`Expected one applied vault anchor: ${mark}`);
    return source;
  }
  if (marks.some(mark => source.includes(mark)) || source.includes('function VildaChangeExistingPatientNote(')) {
    throw new Error('Partially applied or changed existing-note mutation: review the artifact first.');
  }
  for (const anchor of [targetAnchor, existingNoteExportAnchor, existingNoteRemoveExportAnchor, existingNoteCommitAnchor, existingNoteDeleteAnchor]) {
    if (source.split(anchor).length !== 2) throw new Error(`Expected one vault anchor: ${anchor}`);
  }
  const removeStart = source.indexOf(existingNoteDeleteAnchor), removeEnd = source.indexOf('async function ts(', removeStart);
  if (removeEnd < 0) throw new Error('Missing note remover end anchor.');
  const originalRemove = source.slice(removeStart, removeEnd);
  return source.replace(targetAnchor, existingNoteUpdateSource + targetAnchor)
    .replace(existingNoteExportAnchor, existingNoteExportReplacement)
    .replace(existingNoteRemoveExportAnchor, existingNoteRemoveExportReplacement)
    .replace(existingNoteCommitAnchor, existingNoteCommitReplacement)
    .replace(originalRemove, patchExistingNoteDeleteWriter(originalRemove));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = resolve(process.argv[2] || 'vilda_vault.js');
  const source = readFileSync(target, 'utf8');
  const updated = patchVaultExistingNote(source);
  if (updated !== source) writeFileSync(target, updated);
}
