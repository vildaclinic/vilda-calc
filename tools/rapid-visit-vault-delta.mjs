// Verify the atomic rapid visit extension independently from the native workspace
// and whole-visit trash. Both complete Vault images and the readable fragment
// are pinned so an unrelated adapter change cannot pass the boundary proof.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { restorePatientProfileBaseline } from './patient-profile-vault-delta.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const BASE = '45c7ce0c61f98baf9e93a498e2f1b7d972de65c0039d289193cb021b9f1f0f67';
const RESULT = '053273d4f0b8e0e7a1519178d6ab177dc4d1824b34cf172fbeb85e6ff8f5f622';
const CORE = '9d42be28d071afc4de4bdcf1f8600826fe1a417835af138909aefe4da5665a5c';
const MARKER = '/* BEGIN VILDA RAPID VISIT COMMIT V1 */';
const digest = text => createHash('sha256').update(text).digest('hex');
function fail(reason) { throw new Error('Rapid visit Vault boundary: ' + reason); }

function replacements(repository) {
  const fragment = readFileSync(resolve(repository, 'runtime/rapid-visit-v1/vault-fragment.js'), 'utf8');
  if (digest(fragment) !== CORE) fail('readable fragment differs');
  return [
    ["commitVisitTrashForUser(user, change, stagePatient) { return VisitTrashDatabase", anchor => "commitRapidVisitForUser(user, change) { return RapidVisitDatabase(user, change, r); },\n" + anchor],
    ["stageVisitTrashForUser(user, change) { return VisitTrashStage", anchor => "commitRapidVisitForUser(user, change) { return RapidVisitMemory(user, change, s(user), d); },\n" + anchor],
    ["function ba(t,e){const Bpc_h=Bpc_hybryda(t,e);return{", anchor => anchor + "commitRapidVisitForUser(user, change){return e.commitRapidVisitForUser(user, change);},"],
    ["async function Bvisit_list(patientId) {", anchor => fragment + "\n" + anchor],
    ["function _e(t,e){return Bpz_zapis(t,e,!1)}", () => "function _e(t,e){\n  if (e?.rapidVisit) return Ap('rapid-intake', () => { e.rapidVisit.assertCurrent(); return Bpz_zapis(t,e,!1); });\n  return Bpz_zapis(t,e,!1)}"],
    ["Bpz_pilnuj(Bpz_s);let Bc1=null;", () => "Bpz_pilnuj(Bpz_s);if(n.rapidVisit)RapidVisitBase(n.rapidVisit,a,i,s,Bc0,r);let Bc1=null;"],
    ["Bpz_pilnuj(Bpz_s);await I().putSnapshotForUser(b,PatientClinicalWriteValue(b,w));", () => "Bpz_pilnuj(Bpz_s);if(!n.rapidVisit)await I().putSnapshotForUser(b,PatientClinicalWriteValue(b,w));"],
    ["Bpz_pilnuj(Bpz_s);await I().putPatientForUser(b,PatientClinicalWriteValue(b,u));", () => "Bpz_pilnuj(Bpz_s);if(n.rapidVisit){\n  const adapter=I(), previous=o.find(row=>row.patientId===s)||null;\n  if(!adapter.commitRapidVisitForUser)throw new Error('Odśwież aplikację przed zapisem wizyty.');\n  await adapter.commitRapidVisitForUser(b,PatientClinicalWriteValue(b,{previous,patient:u,snapshot:w,source:n.rapidVisit.source,assertCurrent:n.rapidVisit.assertCurrent}));\n}else await I().putPatientForUser(b,PatientClinicalWriteValue(b,u));"],
    ["typeof m.removeTombstoneForUser==\"function\"&&await m.removeTombstoneForUser(b,PatientClinicalWriteValue(b,s))", anchor => "!n.rapidVisit&&" + anchor],
  ].map(([before, insert]) => [before, insert(before)]);
}

function transform(source, repository, reverse) {
  if (digest(source) !== (reverse ? RESULT : BASE)) fail('unexpected input image');
  const hooks = replacements(repository);
  for (const pair of reverse ? hooks.reverse() : hooks) {
    const [from, to] = reverse ? [pair[1], pair[0]] : pair;
    if (source.split(from).length !== 2) fail('missing or ambiguous hook');
    source = source.replace(from, () => to);
  }
  if (digest(source) !== (reverse ? BASE : RESULT)) fail('unrelated Vault change');
  return source;
}

export function applyRapidVisitDelta(source, repository = ROOT) {
  return transform(source, repository, false);
}

export function restoreRapidVisitBaseline(source, repository = ROOT) {
  source = restorePatientProfileBaseline(source, repository);
  return source.includes(MARKER) ? transform(source, repository, true) : source;
}
