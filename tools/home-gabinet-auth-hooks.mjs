import { applyEncounterNoteAuthHooks, reverseEncounterNoteAuthHooks } from './home-encounter-note-auth-hooks.mjs';
import { applyInlinePatientHooks, reverseInlinePatientHooks } from './home-inline-patient-auth-hooks.mjs';
import { applyOverviewRemindersHooks, reverseOverviewRemindersHooks } from './home-overview-reminders-auth-hooks.mjs';
import { applyPatientNavigationHooks, reversePatientNavigationHooks } from './home-patient-navigation-auth-hooks.mjs';

import { applyRegistrationAuthHooks, reverseRegistrationAuthHooks } from './home-registration-auth-hooks.mjs';

function applyOverviewHooks(source) {
  return applyEncounterNoteAuthHooks(applyInlinePatientHooks(applyOverviewRemindersHooks(source)));
}

export function applyGabinetAuthHooks(source) {
  return applyRegistrationAuthHooks(applyPatientNavigationHooks(applyOverviewHooks(source)));
}

// The older reproducers also accept their historical inputs. Reapply exactly
// the layers found on entry when replaying a change or writing their output.
export function gabinetAuthLayers(source) {
  if (!source.includes('/* BEGIN HOME PATIENT INLINE ADAPTER */') && !source.includes('i.VildaHomeRemindersRuntime?.ownsOverviewHost(host)')) {
    return { base: source, replay: value => value };
  }
  const hasRegistration = source.includes('function showGabinetNewPatient(');
  const navigation = hasRegistration ? reverseRegistrationAuthHooks(source) : source;
  const hasNavigation = navigation.includes('function openPatientInHome(');
  const overview = hasNavigation ? reversePatientNavigationHooks(navigation) : navigation;
  const base = reverseOverviewRemindersHooks(reverseInlinePatientHooks(reverseEncounterNoteAuthHooks(overview)));
  const replay = hasRegistration ? applyGabinetAuthHooks
    : hasNavigation ? value => applyPatientNavigationHooks(applyOverviewHooks(value)) : applyOverviewHooks;
  if (replay(base) !== source) throw new Error('Gabinet AuthUI layers do not reproduce the current artifact.');
  return { base, replay };
}
