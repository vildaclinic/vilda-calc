// Scoped additions over the existing native reminders presentation.
const PAIRS = [
  ["    && host.closest && host.closest('#vhomeMainCards')", `    && (host.closest && host.closest('#vhomeMainCards') || i.__VILDA_HOME_GABINET_PREVIEW__ === true
      && i.VildaHomeRemindersRuntime?.ownsOverviewHost(host) === true)`],
  ["state.historyLimit : rows.length : 2;", "state.historyLimit : rows.length : HomeRemindersPresentation.overview ? rows.length : 2;"],
  ["HomeRemindersPresentation && !full ? 2 :", "HomeRemindersPresentation && !full && !HomeRemindersPresentation.overview ? 2 :"],
  ["  function HomeRemindersOwnNote(note) { return !HomeRemindersContext || !!(note && note.patientId === HomeRemindersContext.patientId && !note.isActivity && !note.isExternal); }",
    `  function HomeRemindersOwnNote(note) {
    if (!HomeRemindersContext) return true;
    if (!note || note.patientId !== HomeRemindersContext.patientId || note.isActivity || note.isExternal) return false;
    var encounter = HomeRemindersContext.source && HomeRemindersContext.source.encounter;
    if (!encounter || encounter.mode !== 'edit' || !note.id) return true;
    if (note.visitContext?.visitId) return note.visitContext.visitId === encounter.visitId
      || !!note.visitContext.clinicalDateISO && note.visitContext.clinicalDateISO < encounter.date;
    return !!note.createdAtISO && note.createdAtISO.slice(0, 10) <= encounter.date;
  }`],
  ["var result = await vault.savePatientNoteOnce({ reminderContext: { version: 1, kind: 'reminder' }, id: noteId,",
    `var visit = HomeRemindersContext && HomeRemindersContext.source && HomeRemindersContext.source.visitContext;
        if (visit) {
          var recorded = await HomeRemindersContext.source.ensureRecorded();
          if (!alive() || !HomeRemindersCurrent()) return;
          if (!recorded) throw new Error('Nie udało się zapisać wizyty. Spróbuj ponownie.');
        }
        var result = await vault.savePatientNoteOnce({ reminderContext: { version: 1, kind: 'reminder' },
          ...(visit ? { visitContext: visit, clinicalDateISO: visit.clinicalDateISO } : {}), id: noteId,`],
  ["+ body.value });\n        if (!alive()) return; if (!result.saved)", "+ body.value }, HomeRemindersContext ? { isCurrent: HomeRemindersCurrent, requireActiveVisit: !!visit } : undefined);\n        if (!alive()) return; if (!result.saved)"],
  ["eventTime: !eventFields.hidden && eventTime.value || null } });\n          if (!alive()) return;",
    "eventTime: !eventFields.hidden && eventTime.value || null } }, HomeRemindersContext && HomeRemindersContext.source && (HomeRemindersContext.source.blocked || HomeRemindersContext.source.visitContext) ? HomeRemindersContext.source : undefined);\n          if (!alive()) return;"],
  ["showCreateButton: false, remindersLayout: true,\n        isCurrent: alive,",
    `showCreateButton: false, remindersLayout: true,
        captureVisitBinding: HomeRemindersContext ? function (patientId) {
          if (patientId !== HomeRemindersContext.patientId) return null;
          if (!HomeRemindersCurrent()) return {blocked:true};
          var source = HomeRemindersContext.source;
          if (source && source.blocked) return source;
          return source && source.visitContext ? source : source && source.encounter ? {blocked:true} : null;
        } : undefined,
        isCurrent: alive,`]
];

function replaceOnce(source, before, after) {
  const index = source.indexOf(before);
  if (index < 0 || source.indexOf(before, index + before.length) >= 0) throw new Error('Missing or repeated native overview reminder boundary.');
  return source.slice(0, index) + after + source.slice(index + before.length);
}
export function applyOverviewRemindersHooks(source) {
  for (const [before, after] of PAIRS) source = replaceOnce(source, before, after);
  return source;
}
export function reverseOverviewRemindersHooks(source) {
  if (!source.includes(PAIRS[0][1])) return source;
  for (const [before, after] of PAIRS.slice().reverse()) source = replaceOnce(source, after, before);
  return source;
}
