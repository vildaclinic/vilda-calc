// Exact outer layer: explicit source-visit Trash atomically retains an
// independent encrypted chart root. Older layers stay byte-for-byte replayable.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import { restoreDocumentOutcomesBaseline } from './document-outcomes-vault-delta.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = '004a86e996b2e4aaf50f40bdb96e6396e815b37bdd7dde0449b517d301033ee9';
const PATH = 'runtime/profile-trash-v1/manifest.json';
const SOURCES = ['runtime/profile-trash-v1/model.js', 'runtime/profile-trash-v1/vault-fragment.js'];
const START = '/* BEGIN VILDA PROFILE TRASH V1 */\n';
const END = '/* END VILDA PROFILE TRASH V1 */\n';
const digest = value => createHash('sha256').update(value).digest('hex');
const cache = new Map();
function fail(message) { throw new Error('Profile trash boundary: ' + message); }
function once(source, before, after, name) {
  if (source.split(before).length !== 2) fail('missing or ambiguous hook: ' + name);
  return source.replace(before, () => after);
}
function readable(root) {
  const files = SOURCES.map(path => ({path, source: readFileSync(resolve(root, path), 'utf8')}));
  return { sources: files.map(file => ({path:file.path, sha256:digest(file.source)})),
    fragment: START + files.map(file => file.source).join('\n') + END };
}
function declared(base, fragment) {
  if (digest(base) !== BASE) fail('unexpected reviewed base');
  const key = digest(fragment); if (cache.has(key)) return cache.get(key);
  const pairs = [
    ['preserve-only-removed-legacy-source', '        if (!live.length || live[0].snapshotId !== options.snapshotId || mt(live[0]) !== options.revision) throw VisitTrashConflict();',
      '        if (!live.length || live[0].snapshotId !== options.snapshotId || mt(live[0]) !== options.revision) throw VisitTrashConflict();\n        if (ProfileEnabled()) { change.profile = await ProfileTrashPrepare(patientId, visitId, rows, original, uid, adapter, guard); guard(); }'],
    ['native-profile-stores-in-same-transaction', "    const tx = PatientClinicalWriteValue(user, db).transaction(stagePatient ? [le] : [le, bt, It, xt], 'readwrite');",
      "    const stores = stagePatient ? [le] : [le, bt, It, xt];\n    if (change.profile && !stagePatient) stores.push(vt, Kt);\n    const tx = PatientClinicalWriteValue(user, db).transaction(stores, 'readwrite');"],
    ['native-profile-cas-reads', '    tx.oncomplete = function () { if (applyStaged) applyStaged(); resolve(true); };',
      "    let profileReads;\n    if (change.profile && snapshots) {\n      const notes = tx.objectStore(vt);\n      profileReads = [notes.index('byPatient').getAll(IDBKeyRange.only(change.patientId)), notes.get(change.profile.note.id), tx.objectStore(Kt).get(change.profile.note.id)];\n      reads.push(...profileReads);\n    }\n    tx.oncomplete = function () { if (applyStaged) applyStaged(); resolve(true); };"],
    ['native-profile-cas-before-trash', '          VisitTrashReadChange(change, reads[1].result, reads[2].result, reads.slice(4).map(read => read.result), reads[3].result);',
      '          VisitTrashReadChange(change, reads[1].result, reads[2].result, reads.slice(4, 4 + change.writes.length).map(read => read.result), reads[3].result);\n          if (profileReads) ProfileTrashAssert(change, profileReads[0].result, profileReads[1].result, profileReads[2].result);'],
    ['native-profile-write-before-transaction-completes', '          tx.objectStore(bt).put(change.patient);',
      '          tx.objectStore(bt).put(change.patient);\n          if (change.profile) tx.objectStore(vt).put(change.profile.note);'],
    ['memory-profile-cas-before-staging', '    store.tombstones.get(change.patientId));\n  return function (meta) {',
      '    store.tombstones.get(change.patientId));\n  if (change.profile) ProfileTrashAssert(change, Array.from(store.patientNotes.values()), store.patientNotes.get(change.profile.note.id), store.patientNoteTombstones.get(change.profile.note.id));\n  return function (meta) {'],
    ['memory-profile-in-same-staged-publish', '    store.patients.set(change.patientId, change.patient);\n    if (meta) store.meta = meta;',
      '    store.patients.set(change.patientId, change.patient);\n    if (change.profile) store.patientNotes.set(change.profile.note.id, change.profile.note);\n    if (meta) store.meta = meta;'],
    ['profile-notification-only-after-trash-commit', "      Vn({patientId, visitId, visitTrashAction: restore ? 'restore' : 'trash'});",
      "      Vn({patientId, visitId, visitTrashAction: restore ? 'restore' : 'trash'});\n      ProfileTrashNotify(change);"],
    ['preserved-baseline-is-not-a-user-data-replacement', '  const context = ProfileModel().normalize(note.profileContext), current = await ProfileRead(note.patientId); check();',
      '  const context = ProfileModel().normalize(note.profileContext), current = await ProfileRead(note.patientId); check();\n  ProfileTrashAuthorizeBaseline(context, current);'],
    ['readable-model-and-transaction-source', '/* END VILDA PATIENT PROFILE V1 */\n', '/* END VILDA PATIENT PROFILE V1 */\n' + fragment],
  ];
  const hooks = [];
  for (const [name,before,after] of pairs) {
    base = once(base,before,after,name);
    hooks.push({name,before,after,beforeSHA256:digest(before),afterSHA256:digest(after)});
  }
  parse(base,{ecmaVersion:'latest'});
  const result = {source:base,hooks}; cache.set(key,result); return result;
}
function definition(root) {
  const manifest = JSON.parse(readFileSync(resolve(root,PATH),'utf8')), source = readable(root);
  if (manifest.namespace !== 'vilda-profile-trash-vault' || manifest.version !== 1 || manifest.baseVaultSHA256 !== BASE
    || JSON.stringify(manifest.sources) !== JSON.stringify(source.sources) || manifest.fragmentSHA256 !== digest(source.fragment)
    || !Array.isArray(manifest.hooks) || manifest.hooks.length !== 10) fail('manifest or readable source');
  for (const hook of manifest.hooks) if (!hook || typeof hook.before !== 'string' || !hook.before || typeof hook.after !== 'string' || !hook.after
    || digest(hook.before) !== hook.beforeSHA256 || digest(hook.after) !== hook.afterSHA256) fail('hook checksum');
  return {manifest,...source};
}
export function applyProfileTrashDelta(base, root=ROOT) {
  const {manifest,fragment}=definition(root), built=declared(base,fragment);
  if (JSON.stringify(built.hooks) !== JSON.stringify(manifest.hooks) || digest(built.source) !== manifest.integratedVaultSHA256) fail('undeclared integration');
  return built.source;
}
export function restoreProfileTrashBaseline(source, root=ROOT) {
  source = restoreDocumentOutcomesBaseline(source, root);
  if (!source.includes(START)) return source;
  const {manifest,fragment}=definition(root), integrated=source;
  if (digest(source) !== manifest.integratedVaultSHA256) fail('unexpected integrated image');
  for (const hook of manifest.hooks.slice().reverse()) source=once(source,hook.after,hook.before,hook.name);
  if (digest(source) !== BASE) fail('unrelated Vault change');
  const built=declared(source,fragment);
  if (built.source !== integrated || JSON.stringify(built.hooks) !== JSON.stringify(manifest.hooks)) fail('undeclared reversal');
  return source;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2);
  if (args.length===3 && args[0]==='--build') {
    const base=readFileSync(resolve(args[1]),'utf8'), source=readable(ROOT), built=declared(base,source.fragment);
    writeFileSync(resolve(ROOT,PATH),JSON.stringify({namespace:'vilda-profile-trash-vault',version:1,baseVaultSHA256:BASE,
      sources:source.sources,fragmentSHA256:digest(source.fragment),integratedVaultSHA256:digest(built.source),hooks:built.hooks},null,2)+'\n');
    writeFileSync(resolve(args[2]),built.source); process.stdout.write('Built exact atomic legacy-profile retention.\n');
  } else if (!args.length) {
    const source=restoreDocumentOutcomesBaseline(readFileSync(resolve(ROOT,'vilda_vault.js'),'utf8'));
    if (applyProfileTrashDelta(restoreProfileTrashBaseline(source)) !== source) fail('round trip differs');
    process.stdout.write('Atomic profile Trash: exact outer Vault layer verified.\n');
  } else fail('usage: node tools/profile-trash-vault-delta.mjs [--build BASE_FILE OUTPUT_FILE]');
}
