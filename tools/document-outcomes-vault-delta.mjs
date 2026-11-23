// A separate reversible layer over the frozen profile/Trash fix. Native
// workspace sources, prior independent layers and old general writes stay exact.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import { restoreTreatmentDocumentationBaseline } from './treatment-documentation-vault-delta.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = '16c39d32d496738528142158ac57ad87e933538c17d710a4be1e290ed4fe0325';
const SOURCE = 'runtime/document-outcomes-v1/vault-fragment.js';
const MANIFEST = 'runtime/document-outcomes-v1/manifest.json';
const START = '/* BEGIN VILDA DOCUMENT OUTCOMES V1 */\n';
const END = '/* END VILDA DOCUMENT OUTCOMES V1 */\n';
const digest = value => createHash('sha256').update(value).digest('hex');
function fail(message) { throw new Error('Document outcomes boundary: ' + message); }
function replace(source, before, after, name) {
  if (source.split(before).length !== 2) fail('missing or ambiguous hook: ' + name);
  return source.replace(before, () => after);
}
export function documentOutcomeHooks(root = ROOT) {
  const fragment = START + readFileSync(resolve(root, SOURCE), 'utf8') + END;
  return [
    ['bound-reminder-actor', 'async function RemB22SaveOutcome(input) {',
      'async function RemB22SaveOutcome(input, binding) {\n  if (binding) return DocumentOutcomePatientLock(input,binding,function(){return RemB22SaveOutcome(input)});'],
    ['captured-reminder-origin', '  const request = JSON.parse(JSON.stringify(input)), account = b, key = ot;\n  const assertSession = function () {',
      '  const request = JSON.parse(JSON.stringify(input)), account = b, key = ot;\n  const visitOrigin = EncounterPlanOperation(request.operationId,request.patientId);\n  if (visitOrigin) request.visitContext=visitOrigin; else delete request.visitContext;\n  const assertSession = function () { if(visitOrigin)EncounterPlanOperation(request.operationId,request.patientId);'],
    ['origin-bound-receipt', 'JSON.stringify([request.patientId, request.action, date, comment, request.next || null, request.test || null]);',
      'JSON.stringify([request.patientId, request.action, date, comment, request.next || null, request.test || null, ...(visitOrigin ? [visitOrigin] : [])]);'],
    ['new-reminder-target-check', "    if (current.completedAtISO || current.noShowAtISO) return PatientClinicalWriteValue(PatientClinicalOperationAccount,{ saved: false, reason: 'already-closed' });\n    const children = []",
      "    if (current.completedAtISO || current.noShowAtISO) return PatientClinicalWriteValue(PatientClinicalOperationAccount,{ saved: false, reason: 'already-closed' });\n    if(visitOrigin)await DocumentOutcomeCheck(request,assertSession);\n    const children = []"],
    ['new-result-origin', "reminderContext: { version: 1, parentId: current.id, action: 'result', dateISO: date }\n      }, guard));",
      "reminderContext: { version: 1, parentId: current.id, action: 'result', dateISO: date },\n        ...EncounterNoteFields(request)\n      }, guard));"],
    ['new-next-origin', "dueTime: next.dueTime || null, reminderContext: { version: 1, parentId: current.id }\n    }, guard));",
      "dueTime: next.dueTime || null, reminderContext: { version: 1, parentId: current.id },\n      ...EncounterNoteFields(request)\n    }, guard));"],
    ['all-bound-care-lock', 'if (binding) return EncounterPlanRun(input,binding,function(){return VisitDocumentCareLock(input,binding,function(){return CareMvpMutate(input)})});',
      'if (binding) return DocumentOutcomePatientLock(input,binding,function(){return CareMvpMutate(input)});'],
    ['new-care-outcome-origin', 'const origin = VisitDocumentCareOrigin(request, existing, payload);',
      'const origin = DocumentOutcomeCareOrigin(request, existing, payload);'],
    ['new-care-target-check', "    if (!patient) return PatientClinicalWriteValue(PatientClinicalOperationAccount,{ saved: false, reason: 'deleted' });\n    if (!context) context = { version: 1, role: 'plan'",
      "    if (!patient) return PatientClinicalWriteValue(PatientClinicalOperationAccount,{ saved: false, reason: 'deleted' });\n    if(visitOrigin)await DocumentOutcomeCheck(request,assertSession);\n    if (!context) context = { version: 1, role: 'plan'"],
    ['pre-actor-binding-capture', ';VisitDocumentInstall($s);EncounterInstallCare($s)',
      ';VisitDocumentInstall($s);DocumentOutcomesInstall($s);EncounterInstallCare($s)'],
    ['readable-source', '/* BEGIN VILDA VISIT DOCUMENT V1 */\n', fragment + '/* BEGIN VILDA VISIT DOCUMENT V1 */\n'],
  ];
}
export function buildDocumentOutcomesDelta(source, root = ROOT) {
  for (const [name,before,after] of documentOutcomeHooks(root)) source=replace(source,before,after,name);
  parse(source,{ecmaVersion:'latest'}); return source;
}
function definition(root) {
  const manifest=JSON.parse(readFileSync(resolve(root,MANIFEST),'utf8'));
  if(manifest.namespace!=='vilda-document-outcomes-vault'||manifest.version!==1||manifest.baseVaultSHA256!==BASE
      ||manifest.source!==SOURCE||manifest.sourceSHA256!==digest(readFileSync(resolve(root,SOURCE),'utf8'))) fail('source or manifest');
  return manifest;
}
export function applyDocumentOutcomesDelta(source,root=ROOT) {
  const manifest=definition(root);
  if(digest(source)!==manifest.baseVaultSHA256)fail('unexpected reviewed base');
  const result=buildDocumentOutcomesDelta(source,root);
  if(digest(result)!==manifest.integratedVaultSHA256)fail('unexpected integrated image');
  return result;
}
export function restoreDocumentOutcomesBaseline(source,root=ROOT) {
  source=restoreTreatmentDocumentationBaseline(source,root);
  if(!source.includes(START))return source;
  const manifest=definition(root);
  if(digest(source)!==manifest.integratedVaultSHA256)fail('unexpected integrated image');
  for(const[name,before,after]of documentOutcomeHooks(root).reverse())source=replace(source,after,before,name);
  if(digest(source)!==manifest.baseVaultSHA256)fail('unrelated vault change');
  return source;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2);
  if(args.length===3&&args[0]==='--rebuild')writeFileSync(resolve(args[2]),applyDocumentOutcomesDelta(readFileSync(resolve(args[1]),'utf8')));
  else if(!args.length){const source=restoreTreatmentDocumentationBaseline(readFileSync(resolve(ROOT,'vilda_vault.js'),'utf8'));if(applyDocumentOutcomesDelta(restoreDocumentOutcomesBaseline(source))!==source)fail('round trip');process.stdout.write('Document outcomes: exact source and native-preserving delta verified.\n');}
  else fail('usage: node tools/document-outcomes-vault-delta.mjs [--rebuild BASE_FILE OUTPUT_FILE]');
}
