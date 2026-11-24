// Exact reversible diagnosis-removal boundary above the patient-treatment image.
//
// EDITION WITHOUT VISIT DOCUMENTS. The complete layer lives under these same
// paths on the new-home-page line of the application (general and visit-owned
// diagnoses, edits and removal). This edition carries only what this
// application can use: removal of a general diagnosis through the same scoped
// actor, the same native checks and the same atomic record-and-tombstone commit.
// Hooks named like their counterparts do the same job; those marked "same text"
// below are byte-identical to the complete layer. When the two lines are
// merged, take the complete layer's files and rebuild the Vault image with it.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = '4f625ec47639daac9527b320416853d264d9e1969b9e92db35ac7d0fff7d7caf';
const SOURCE = 'runtime/diagnosis-mutation-v1/vault-fragment.js';
const MANIFEST = 'runtime/diagnosis-mutation-v1/manifest.json';
const START = '/* BEGIN VILDA DIAGNOSIS MUTATION V1 */\n';
const END = '/* END VILDA DIAGNOSIS MUTATION V1 */\n';
const hash = value => createHash('sha256').update(value).digest('hex');
function fail(message) { throw new Error('Diagnosis mutation boundary: ' + message); }
function once(source, before, after, name) {
  if (source.split(before).length !== 2) fail('missing or ambiguous hook: ' + name);
  return source.replace(before, () => after);
}
function hooks(root) {
  const fragment = START + readFileSync(resolve(root, SOURCE), 'utf8') + END;
  return [
    // The scoped actor. No visit binding exists here: the witness always names
    // a general diagnosis and the owner check is the scope's own check().
    ['diagnosis-remove-scope', '    async function followup(dto, id, values) {',
      "    async function removeDiagnosis(dto, binding) {\n      check(); var original = captured(dto, 'diagnosis');\n      DiagnosisMutationBinding(original, binding, check);\n      var request = { id: original.id, patientId: patientId, baseRev: original.rev, baseUpdatedAtISO: original.updatedAtISO, baseNote: original.baseNote };\n      var result = await guarded(function () { return vault.removeExistingPatientNote(request, DiagnosisMutationOptions(original, function () { check(); return true; })); });\n      if (!result || result.removed !== true) throw failure('TREATMENT_CONFLICT', 'Rozpoznanie zmieniło się lub zostało usunięte. Otwórz je ponownie.');\n      return result;\n    }\n    async function followup(dto, id, values) {"],
    ['diagnosis-public-scope', "      updateDiagnosis: function (dto, values) { return update('diagnosis', dto, values); },",
      "      updateDiagnosis: function (dto, values) { return update('diagnosis', dto, values); },\n      removeDiagnosis: removeDiagnosis,"],
    // Same text as the complete layer.
    ['diagnosis-native-check', '    const careNote = await Ft(stored); assertSession();',
      '    const careNote = await Ft(stored); assertSession();\n    if (DiagnosisMutationWitness(treatmentOptions)) {\n      await DiagnosisMutationCheckExisting(next, careNote, treatmentOptions, assertSession, remove); assertSession();\n    }'],
    // Same text as the complete layer.
    ['diagnosis-atomic-removal', '      // Invoke the existing remover directly, retaining its tombstone policy.\n      const removed = await Eb(next.id, undefined, undefined, guard);',
      '      if (DiagnosisMutationWitness(treatmentOptions)) return DiagnosisMutationRemove(stored, adapter, account, assertSession);\n      // Invoke the existing remover directly, retaining its tombstone policy.\n      const removed = await Eb(next.id, undefined, undefined, guard);'],
    // Same text as the complete layer.
    ['diagnosis-remove-owner-options', 'function VildaRemoveExistingPatientNote(payload) {\n  return VildaChangeExistingPatientNote(payload, true);',
      'function VildaRemoveExistingPatientNote(payload, treatmentOptions) {\n  return VildaChangeExistingPatientNote(payload, true, treatmentOptions);'],
    // Same inserted method as the complete layer, beside this image's own
    // atomic note commit of each storage adapter.
    ['diagnosis-idb-commit', 'async commitCarePlanForUser(user, change) {PatientClinicalGuard(user);\n  const db = await r(user);',
      'commitDiagnosisDeleteForUser(user, change) { return DiagnosisMutationDatabase(user, change, r); },\nasync commitCarePlanForUser(user, change) {PatientClinicalGuard(user);\n  const db = await r(user);'],
    ['diagnosis-memory-commit', 'async commitCarePlanForUser(user, change) {PatientClinicalGuard(user);\n  const store = s(user), existing',
      'async commitDiagnosisDeleteForUser(user, change) { return DiagnosisMutationMemory(user, change, s(user), d); },\nasync commitCarePlanForUser(user, change) {PatientClinicalGuard(user);\n  const store = s(user), existing'],
    // Same text as the complete layer.
    ['diagnosis-hybrid-commit', 'function ba(t,e){const Bpc_h=Bpc_hybryda(t,e);return{',
      'function ba(t,e){const Bpc_h=Bpc_hybryda(t,e);return{commitDiagnosisDeleteForUser(user,change){return e.commitDiagnosisDeleteForUser(user,change);},'],
    // Outermost wrapper: the witness is captured when the caller invokes the
    // actor, before the workspace wrapper can queue the call.
    ['diagnosis-capture-before-queue', ';PatientWorkspaceInstall($s);v.VildaVault=$s',
      ';PatientWorkspaceInstall($s);DiagnosisMutationInstall($s);v.VildaVault=$s'],
    ['diagnosis-readable-source', '/* END VILDA PATIENT TREATMENT V1 */\n',
      '/* END VILDA PATIENT TREATMENT V1 */\n' + fragment],
  ];
}
function build(base, root) {
  if (hash(base) !== BASE) fail('unexpected reviewed base');
  const declared = hooks(root);
  for (const [name,before,after] of declared) base = once(base,before,after,name);
  parse(base, { ecmaVersion: 'latest' });
  return { source: base, manifest: { namespace: 'vilda-diagnosis-mutation-vault', version: 1, baseVaultSHA256: BASE,
    source: SOURCE, sourceSHA256: hash(readFileSync(resolve(root,SOURCE),'utf8')), integratedVaultSHA256: hash(base),
    hooks: declared.map(([name,before,after]) => ({ name, before, after, beforeSHA256: hash(before), afterSHA256: hash(after) })) } };
}
function verify(recorded, expected) {
  if (JSON.stringify(recorded) !== JSON.stringify(expected)) fail('source, manifest or integrated image');
}
export function applyDiagnosisMutationDelta(base, root = ROOT) {
  const built = build(base, root);
  verify(JSON.parse(readFileSync(resolve(root,MANIFEST),'utf8')), built.manifest); return built.source;
}
export function restoreDiagnosisMutationBaseline(source, root = ROOT) {
  if (!source.includes(START)) return source;
  if (hash(source) !== JSON.parse(readFileSync(resolve(root,MANIFEST),'utf8')).integratedVaultSHA256) fail('unexpected integrated image');
  const integrated = source;
  for (const [name,before,after] of hooks(root).reverse()) source = once(source,after,before,name);
  const built = build(source,root);
  verify(JSON.parse(readFileSync(resolve(root,MANIFEST),'utf8')),built.manifest);
  if (built.source !== integrated) fail('round trip differs'); return source;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, input, output] = process.argv.slice(2);
  if (command === '--build' && input && output && process.argv.length === 5) {
    const built = build(readFileSync(resolve(input),'utf8'),ROOT);
    writeFileSync(resolve(ROOT,MANIFEST),JSON.stringify(built.manifest,null,2)+'\n');
    writeFileSync(resolve(output),built.source);
  } else if (command === undefined) {
    const source = readFileSync(resolve(ROOT,'vilda_vault.js'),'utf8');
    if (applyDiagnosisMutationDelta(restoreDiagnosisMutationBaseline(source)) !== source) fail('round trip differs');
    process.stdout.write('Diagnosis mutation: exact outer Vault layer verified.\n');
  } else fail('usage: node tools/diagnosis-mutation-vault-delta.mjs [--build BASE_FILE OUTPUT_FILE]');
}
