import {applyClinicalAuditAuth, hasClinicalAuditAuth, replayClinicalAuditIfBase, reverseClinicalAuditAuth} from './clinical-audit-auth-delta.mjs';
import { applyEncounterNoteAuthHooks, reverseEncounterNoteAuthHooks } from './home-encounter-note-auth-hooks.mjs';
import { applyInlinePatientHooks, reverseInlinePatientHooks } from './home-inline-patient-auth-hooks.mjs';
import { applyOverviewRemindersHooks, reverseOverviewRemindersHooks } from './home-overview-reminders-auth-hooks.mjs';
import { applyPatientNavigationHooks, reversePatientNavigationHooks } from './home-patient-navigation-auth-hooks.mjs';

import { applyRegistrationAuthHooks, reverseRegistrationAuthHooks } from './home-registration-auth-hooks.mjs';
import { applyPatientProfileAuthHooks, reversePatientProfileAuthHooks } from './patient-profile-auth-hooks.mjs';

function applyOverviewHooks(source) {
  return applyEncounterNoteAuthHooks(applyInlinePatientHooks(applyOverviewRemindersHooks(source)));
}

function applyRegistration(source, inline = true) {
  return applyRegistrationAuthHooks(applyPatientNavigationHooks(applyOverviewHooks(source)), inline);
}

// The chart knows the recorded sex even when a rapid intake left that field empty.
const previousChart = 'root:Eo,patientId:t,patientName:w,openerId:';
const chartWithReferenceSex = 'root:Eo,patientId:t,patientName:w,referenceSex:m.sex,openerId:';
function chartReferenceSex(source, reverse = false) {
  const before = reverse ? chartWithReferenceSex : previousChart;
  if (source.split(before).length !== 2) throw new Error('Missing or repeated patient chart reference sex hook.');
  return source.replace(before, reverse ? previousChart : chartWithReferenceSex);
}
export function applyGabinetAuthHooks(source, inline = true) {
  return replayClinicalAuditIfBase(applyPatientProfileAuthHooks(chartReferenceSex(applyRegistration(source, inline))));
}

// The older reproducers also accept their historical inputs. Reapply exactly
// the layers found on entry when replaying a change or writing their output.
export function gabinetAuthLayers(source) {
  if (hasClinicalAuditAuth(source)) {
    const previous = gabinetAuthLayers(reverseClinicalAuditAuth(source));
    return { base: previous.base, replay: value => applyClinicalAuditAuth(previous.replay(value)) };
  }
  const hasProfile = source.includes('/* BEGIN HOME PATIENT PROFILE EDIT */');
  const input = source;
  if (hasProfile) source = reversePatientProfileAuthHooks(source);
  if (!source.includes('/* BEGIN HOME PATIENT INLINE ADAPTER */') && !source.includes('i.VildaHomeRemindersRuntime?.ownsOverviewHost(host)')) {
    return { base: source, replay: value => value };
  }
  const hasReferenceSex = source.includes(chartWithReferenceSex);
  const registration = hasReferenceSex ? chartReferenceSex(source, true) : source;
  const hasRegistration = registration.includes('function showGabinetNewPatient(');
  const inline = registration.includes('function homeRegistrationForm(');
  const navigation = hasRegistration ? reverseRegistrationAuthHooks(registration) : registration;
  const hasNavigation = navigation.includes('function openPatientInHome(');
  const overview = hasNavigation ? reversePatientNavigationHooks(navigation) : navigation;
  const base = reverseOverviewRemindersHooks(reverseInlinePatientHooks(reverseEncounterNoteAuthHooks(overview)));
  const nativeReplay = hasReferenceSex ? value => chartReferenceSex(applyRegistration(value, inline)) : hasRegistration ? value => applyRegistration(value, inline)
    : hasNavigation ? value => applyPatientNavigationHooks(applyOverviewHooks(value)) : applyOverviewHooks;
  const replay = hasProfile ? value => applyPatientProfileAuthHooks(nativeReplay(value)) : nativeReplay;
  if (replay(base) !== input) throw new Error('Gabinet AuthUI layers do not reproduce the current artifact.');
  return { base, replay };
}
