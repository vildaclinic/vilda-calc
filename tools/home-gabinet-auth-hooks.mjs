import { applyEncounterNoteAuthHooks, reverseEncounterNoteAuthHooks } from './home-encounter-note-auth-hooks.mjs';
import { applyInlinePatientHooks, reverseInlinePatientHooks } from './home-inline-patient-auth-hooks.mjs';
import { applyOverviewRemindersHooks, reverseOverviewRemindersHooks } from './home-overview-reminders-auth-hooks.mjs';

export function applyGabinetAuthHooks(source) {
  return applyEncounterNoteAuthHooks(applyInlinePatientHooks(applyOverviewRemindersHooks(source)));
}

// The older reproducers also accept their historical inputs. Reapply exactly
// the layers found on entry when replaying a change or writing their output.
export function gabinetAuthLayers(source) {
  if (!source.includes('/* BEGIN HOME PATIENT INLINE ADAPTER */') && !source.includes('i.VildaHomeRemindersRuntime?.ownsOverviewHost(host)')) {
    return { base: source, replay: value => value };
  }
  const base = reverseOverviewRemindersHooks(reverseInlinePatientHooks(reverseEncounterNoteAuthHooks(source)));
  if (applyGabinetAuthHooks(base) !== source) throw new Error('Gabinet AuthUI layers do not reproduce the current artifact.');
  return { base, replay: applyGabinetAuthHooks };
}
