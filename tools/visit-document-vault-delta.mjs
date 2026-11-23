// Exact opt-in guard around the existing create-once actor. No medical inputs,
// existing document origins, native workspace block or older layers change.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import { restoreProfileTrashBaseline } from './profile-trash-vault-delta.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = '0499a9e445e5463d3a694cf5675684d333bbd4dd2b01a956a56ee918245869cd';
const SOURCE = 'runtime/visit-document-v1/vault-fragment.js';
const MANIFEST = 'runtime/visit-document-v1/manifest.json';
const START = '/* BEGIN VILDA VISIT DOCUMENT V1 */\n';
const END = '/* END VILDA VISIT DOCUMENT V1 */\n';
const digest = source => createHash('sha256').update(source).digest('hex');
const declarations = new Map();
function fail(message) { throw new Error('Visit document boundary: ' + message); }
function once(source, before, after, name) {
  if (source.split(before).length !== 2) fail('missing or ambiguous hook: ' + name);
  return source.replace(before, () => after);
}
function readable(root) {
  const source = readFileSync(resolve(root, SOURCE), 'utf8');
  return { source, fragment: START + source + END };
}
function declared(base, fragment) {
  if (digest(base) !== BASE) fail('unexpected reviewed base');
  const key = digest(fragment);
  if (declarations.has(key)) return declarations.get(key);
  const pairs = [
    ['patient-lock-before-note-lock', 'return ProfileCreateLock(next, treatmentOptions, function () { return Ac(next.id, async function () {',
      'return VisitDocumentCreateLock(next, treatmentOptions, function () { return Ac(next.id, async function () {'],
    ['canonical-visit-before-new-document', '    const saved = await Ad(next, { token: VildaExistingNoteUpdateToken, beforeCommit: assertSession, account, adapter });',
      '    if(VisitDocumentRequired(next,treatmentOptions)){await VisitDocumentCheckActive(next,treatmentOptions,assertSession);assertSession();}\n    const saved = await Ad(next, { token: VildaExistingNoteUpdateToken, beforeCommit: assertSession, account, adapter });'],
    ['capture-options-before-native-queue', ';ProfileInstallPresentation($s);EncounterInstallCare($s)',
      ';ProfileInstallPresentation($s);VisitDocumentInstall($s);EncounterInstallCare($s)'],
    ['new-care-step-patient-lock', 'if (binding) return EncounterPlanRun(input,binding,function(){return CareMvpMutate(input)});',
      'if (binding) return EncounterPlanRun(input,binding,function(){return VisitDocumentCareLock(input,binding,function(){return CareMvpMutate(input)})});'],
    ['new-care-child-origin', '      prepared.set(noteId, Object.assign({}, prepared.get(noteId) || {}, payload, { id: noteId, patientId: request.patientId }));',
      '      const origin = VisitDocumentCareOrigin(request, existing, payload);\n      if (origin) {\n        await VisitDocumentCheckActive(Object.assign({ patientId: request.patientId }, origin), { requireActiveVisit: true }, assertSession);\n        payload = Object.assign({}, payload, origin);\n      }\n      prepared.set(noteId, Object.assign({}, prepared.get(noteId) || {}, payload, { id: noteId, patientId: request.patientId }));'],
    ['active-start-frame-care-owner', '  const current = v.VildaHomeEncounter && v.VildaHomeEncounter.captureBinding(patientId);\n  if (!current || !binding.isCurrent() || current.visitContext.visitId',
      '  const current = VisitDocumentCareCurrent(patientId);\n  if (!current || !current.visitContext || typeof current.isCurrent !== \'function\' || !current.isCurrent()\n      || !binding.isCurrent() || current.visitContext.visitId'],
    ['readable-source', '/* BEGIN VILDA PATIENT PROFILE V1 */\n', fragment + '/* BEGIN VILDA PATIENT PROFILE V1 */\n'],
  ];
  const hooks = [];
  for (const [name, before, after] of pairs) {
    base = once(base, before, after, name);
    hooks.push({ name, before, after, beforeSHA256: digest(before), afterSHA256: digest(after) });
  }
  parse(base, { ecmaVersion: 'latest' });
  const result = { source: base, hooks }; declarations.set(key, result); return result;
}
function definition(root) {
  const manifest = JSON.parse(readFileSync(resolve(root, MANIFEST), 'utf8')), { source, fragment } = readable(root);
  if (manifest.namespace !== 'vilda-visit-document-vault' || manifest.version !== 1 || manifest.baseVaultSHA256 !== BASE
    || manifest.source !== SOURCE || manifest.sourceSHA256 !== digest(source) || manifest.fragmentSHA256 !== digest(fragment)
    || !Array.isArray(manifest.hooks) || manifest.hooks.length !== 7) fail('manifest or readable source');
  for (const hook of manifest.hooks) {
    if (!hook || typeof hook.before !== 'string' || !hook.before || typeof hook.after !== 'string' || !hook.after
      || digest(hook.before) !== hook.beforeSHA256 || digest(hook.after) !== hook.afterSHA256) fail('hook checksum');
  }
  return { manifest, fragment };
}
export function applyVisitDocumentDelta(base, root = ROOT) {
  const { manifest, fragment } = definition(root), built = declared(base, fragment);
  if (JSON.stringify(built.hooks) !== JSON.stringify(manifest.hooks) || digest(built.source) !== manifest.integratedVaultSHA256) fail('undeclared integration');
  return built.source;
}
export function restoreVisitDocumentBaseline(source, root = ROOT) {
  source = restoreProfileTrashBaseline(source, root);
  if (!source.includes(START)) return source;
  const { manifest, fragment } = definition(root), integrated = source;
  if (digest(source) !== manifest.integratedVaultSHA256) fail('unexpected integrated image');
  for (const hook of manifest.hooks.slice().reverse()) source = once(source, hook.after, hook.before, hook.name);
  if (digest(source) !== BASE) fail('unrelated Vault change');
  const built = declared(source, fragment);
  if (built.source !== integrated || JSON.stringify(built.hooks) !== JSON.stringify(manifest.hooks)) fail('undeclared reversal');
  return source;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length === 3 && args[0] === '--build') {
    const base = readFileSync(resolve(args[1]), 'utf8'), { source, fragment } = readable(ROOT), built = declared(base, fragment);
    const manifest = { namespace: 'vilda-visit-document-vault', version: 1, baseVaultSHA256: BASE,
      source: SOURCE, sourceSHA256: digest(source), fragmentSHA256: digest(fragment), integratedVaultSHA256: digest(built.source), hooks: built.hooks };
    writeFileSync(resolve(ROOT, MANIFEST), JSON.stringify(manifest, null, 2) + '\n');
    writeFileSync(resolve(args[2]), built.source);
    process.stdout.write('Built exact active-visit document guard.\n');
  } else if (!args.length) {
    const source = restoreProfileTrashBaseline(readFileSync(resolve(ROOT, 'vilda_vault.js'), 'utf8'));
    if (applyVisitDocumentDelta(restoreVisitDocumentBaseline(source)) !== source) fail('round trip differs');
    process.stdout.write('Active-visit document guard: exact outer Vault layer verified.\n');
  } else fail('usage: node tools/visit-document-vault-delta.mjs [--build BASE_FILE OUTPUT_FILE]');
}
