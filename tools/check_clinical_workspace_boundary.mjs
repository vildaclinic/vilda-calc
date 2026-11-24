import { restoreKtvVaultBaseline } from './klirens-ktv-vault-delta.mjs';
import { restoreDurableVisitsBaseline } from './visits-vault-delta.mjs';
import { restoreVisitTrashBaseline } from './visit-trash-vault-delta.mjs';
import { restorePatientTreatmentBaseline } from './patient-treatment-vault-delta.mjs';
// Verify the exact generated native-workspace delta before the original V1
// authority proof runs. This reduction never strips arbitrary new functions.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Pinned base: #905 (c8d8442) vault, E2-PR3a2 (#912), P-PLAN-POTOMEK (#913, care-plan
// descendant adoption in the synchronization merge), E2-PR3a3 (import batches in the
// event-log emission), E2-PR3a4 (the event-log outbox sweep), E2-PR3b (event-log merge hooks),
// E2-PR3c1 (the patient tombstone event carries the merge target), E2-PR3c2 (the merging device takes a later
// correction or pin of a visit from the old card), E2-PR3c3 (patient note tombstone revision and earliest creation
// time in the synchronization merge), E2-PR3c4 (a patient note or care plan follows the card that exists after a
// patient merge), E2-PR3c5 (a version changed after a valid trash entry and pruned later invalidates that entry)
// E2-PR4b (the event-log gate also opens with the synchronization switch), E2-PR4c (the last merge time is
// recorded when the event drain reaches the head), E2-PR4e2 (the event-log outbox and the storage mode or account
// removal), E2-PR5c (a discarded outbox row leaves a pair in the sweep memory), E2-PR5d (an accepted outbox row
// leaves its pair at once), E3-PR0b2a (a patient note editor, reminder outcome or Klirens result change compares
// the save time of the version shown to the doctor; status buttons read the note under its lock and
// refuse a deleted or unreadable note with a message for the doctor; docs/clinical/ALGORITHMS.md), E3-PR0b2b
// (a patient note changed on two devices keeps the later content change: content time with an anchor, technical
// writes keep it, the note save stamp, the highest revision after a merge, a patient merge moves notes without
// content read before the note lock; the done, no-show and reopen mark is a separate register with its own change time,
// a record joining the content of one version with the mark of the other is saved 1 ms after both, while a later mark of
// the same value keeps only its change time; moving the date of an open entry confirms it open; the same visible
// version shown to the doctor is not a save conflict; care plans and patient lists keep the earlier rule), E3-PR0c
// (after a single change from another device is applied, a visit version the merge saved differently than it
// arrived is queued again; dormant behind a hidden switch), E3-PR0d (after a single change from another device is
// applied, a trash entry the merge saved differently than before and than it arrived is queued again; dormant behind
// the same hidden switch), E3-PR0d2 (after a single change from another device is applied successfully, a hidden
// trash entry of a deleted card is queued again when the change carried a later version of that visit under a card
// that lost to the patient tombstone here; dormant behind the same hidden switch) and E3-PR0e1 (a card emptied by the
// move phase of the synchronization merge disappears together with the patient tombstone known to that merge, from
// the payload or local, written only when no local tombstone or an earlier one exists; in effect at once) and
// P-BAZA-SZYBKIE (two read-only helpers: getNewestSnapshot decrypts only the newest version of a patient card and
// listPatientNotesByCategory decrypts only the notes of one category; docs/clinical/ALGORITHMS.md).
const BASE = '8f8d3490c8b7178f07441a83f18d9a870f0dfeaa3f1d96977086b4027b57a6cc';
const START = '/* BEGIN VILDA CLINICAL WORKSPACE NATIVE V1 */\n';
const END = '/* END VILDA CLINICAL WORKSPACE NATIVE V1 */\n';
const digest = value => createHash('sha256').update(value).digest('hex');
const EXPECTED_HOOKS = [
  ["return PatientCheckpointRemoveUser(uid, '');", "return $s.removeUser(uid, '');"],
  ['function I(){return $t||', 'function I(){const PatientWorkspaceSelectedAdapter=PatientWorkspaceAdapter();if(PatientWorkspaceSelectedAdapter)return PatientWorkspaceSelectedAdapter;return $t||'],
  ['function PatientClinicalSelectionFor(account) {\n', 'function PatientClinicalSelectionFor(account) {\n  const workspace = PatientWorkspaceSelection(account); if (workspace) return workspace;\n'],
  ["if (route.mode === 'legacy') return;", "if (route.mode === 'legacy' || route.mode === 'protected-workspace') return;"],
  ['return Object.assign(CareMvpTransportContext(e),RemB22Context(e.reminderContext)', 'return Object.assign(PatientWorkspaceReadContext(e,t),RemB22Context(e.reminderContext)'],
  [';v.VildaVault=$s}', ';PatientWorkspaceInstall($s);v.VildaVault=$s}'],
  ["CareMvpExistingContext=CareMvpContext(g&&g.careContext)", "CareMvpExistingContext=PatientPortableContext(g&&g.careContext)"],
  ["CareMvpHasContext?CareMvpContext(t.careContext):CareMvpExistingContext", "CareMvpHasContext?PatientPortableContext(t.careContext):CareMvpExistingContext"],
  ["CareMvpMergedContext=CareMvpContext(z&&z.careContext)", "CareMvpMergedContext=PatientPortableContext(z&&z.careContext)"],
  ["Object.prototype.hasOwnProperty.call(g,\"careContext\")?CareMvpContext(g.careContext):CareMvpMergedContext", "Object.prototype.hasOwnProperty.call(g,\"careContext\")?PatientPortableContext(g.careContext):CareMvpMergedContext"],
  ["return Object.assign(PatientWorkspaceReadContext(e,t),RemB22Context(e.reminderContext)", "if(PatientPortableMarked(e&&e.careContext))await PatientPortableModules();return Object.assign(PatientWorkspaceReadContext(e,t),RemB22Context(e.reminderContext)"],
  ["const context = CareMvpContext(plain && plain.careContext);\n    if (!context || context.role !== 'plan') return true;", "if (PatientPortableMarked(plain && plain.careContext)) await PatientPortableModules();\n    const context = PatientPortableContext(plain && plain.careContext);\n    if (!context || context.role !== 'plan') return true;"],
  [";CareMvpPreflightPayload(s);", ";if(PatientPortablePayload(s))await PatientPortableModules();CareMvpPreflightPayload(s);"],
  [";CareMvpPreflightPayload(p);", ";if(PatientPortablePayload(p))await PatientPortableModules();CareMvpPreflightPayload(p);"],
  [";CareMvpPreflightPayload(a);", ";if(PatientPortablePayload(a))await PatientPortableModules();CareMvpPreflightPayload(a);"],
  [";CareMvpPreflightPayload(t);", ";if(PatientPortablePayload(t))await PatientPortableModules();CareMvpPreflightPayload(t);"],
];
function fail(message) { throw new Error('Clinical workspace boundary: ' + message); }
function reverseOnce(text, before, after) {
  if (text.split(after).length !== 2) fail('native hook is not unique');
  return text.replace(after, before);
}
export function reduceClinicalWorkspaceVault(source, repository = ROOT) {
  source = restoreVisitTrashBaseline(source, repository);
  source = restorePatientTreatmentBaseline(source, repository);
  source = restoreDurableVisitsBaseline(source, repository);
  source = restoreKtvVaultBaseline(source);
  if (!source.includes(START)) return source;
  const manifest = JSON.parse(readFileSync(resolve(repository, 'runtime/clinical-workspace-v1/manifest.json'), 'utf8'));
  if (manifest.namespace !== 'vilda-clinical-workspace-runtime' || manifest.version !== 1
    || (manifest.nativeIntegrationBaseVaultSHA256 || manifest.baseVaultSHA256) !== BASE
    || manifest.integratedVaultSHA256 !== digest(source) || !Array.isArray(manifest.nativeHooks)
    || manifest.nativeHooks.length !== EXPECTED_HOOKS.length) fail('unexpected integration manifest or vault image');
  const start = source.indexOf(START), end = source.indexOf(END);
  if (end < start || source.indexOf(START, start + START.length) !== -1 || source.indexOf(END, end + END.length) !== -1) fail('fragment delimiters');
  const fragment = source.slice(start + START.length, end);
  // The builder writes exactly one separator newline after the readable file.
  if (!fragment.endsWith('\n') || digest(fragment.slice(0, -1)) !== manifest.fragmentSHA256) fail('native fragment changed');
  let reduced = source.slice(0, start) + source.slice(end + END.length);
  for (const index of EXPECTED_HOOKS.map((_, index) => index).reverse()) {
    const [before, after] = EXPECTED_HOOKS[index], hook = manifest.nativeHooks[index];
    if (hook.before !== before || hook.after !== after || hook.beforeSHA256 !== digest(before) || hook.afterSHA256 !== digest(after)) fail('native hook definition changed');
    reduced = reverseOnce(reduced, before, after);
  }
  if (digest(reduced) !== BASE) fail('non-workspace change in the native V1 artifact');
  return reduced;
}
// The immutable V1 integration still reduces to BASE. The next private build
// also needs the CURRENT public base, retaining later public Vault deltas.
// Verify these independently instead of relabelling the historical pin.
export function deriveClinicalWorkspacePublicBase(source, repository = ROOT) {
  reduceClinicalWorkspaceVault(source, repository);
  const manifest = JSON.parse(readFileSync(resolve(repository, 'runtime/clinical-workspace-v1/manifest.json'), 'utf8'));
  const marker = '{{VILDA_CURRENT_NATIVE_FRAGMENT}}';
  const start = source.indexOf(START), end = source.indexOf(END);
  if (start < 0 || end < start || source.includes(marker)) fail('current base delimiters');
  const fragment = source.slice(start, end + END.length);
  let masked = source.slice(0, start) + marker + source.slice(end + END.length);
  for (const hook of manifest.nativeHooks.slice().reverse()) masked = reverseOnce(masked, hook.before, hook.after);
  const baseSource = masked.replace(marker, '');
  let replay = masked;
  for (const hook of manifest.nativeHooks) replay = reverseOnce(replay, hook.after, hook.before);
  if (replay.replace(marker, fragment) !== source) fail('current base replay differs');
  return { baseSource, baseVaultSHA256: digest(baseSource), publicVaultSHA256: digest(source),
    nativeIntegrationBaseVaultSHA256: BASE };
}
export function verifyClinicalWorkspaceCurrentBase(source, repository = ROOT) {
  const derived = deriveClinicalWorkspacePublicBase(source, repository);
  const manifest = JSON.parse(readFileSync(resolve(repository, 'runtime/clinical-workspace-v1/manifest.json'), 'utf8'));
  if (manifest.nativeIntegrationBaseVaultSHA256 !== BASE || manifest.baseVaultSHA256 !== derived.baseVaultSHA256
    || manifest.publicVaultSHA256 !== derived.publicVaultSHA256) fail('current public base metadata differs; refresh after the final Vault delta');
  return derived;
}
export function verifyClinicalWorkspaceModules(repository = ROOT) {
  const manifest = JSON.parse(readFileSync(resolve(repository, 'runtime/clinical-workspace-v1/manifest.json'), 'utf8'));
  const prefix = 'runtime/clinical-workspace-v1/' + manifest.moduleTreeSHA256.slice(0, 12) + '/';
  const files = manifest.files.map(entry => {
    if (!entry.path.startsWith(prefix + 'client/') || entry.path.includes('..') || !entry.path.endsWith('.mjs')) fail('runtime resource path');
    const content = readFileSync(resolve(repository, entry.path), 'utf8');
    if (digest(content) !== entry.sha256) fail('runtime resource changed: ' + entry.path);
    return { name: entry.path.slice(prefix.length), sha256: entry.sha256 };
  }).sort((left, right) => left.name.localeCompare(right.name));
  if (digest(JSON.stringify(files)) !== manifest.moduleTreeSHA256) fail('runtime module tree changed');
  const historical = manifest.historicalFiles || [], seen = new Set(manifest.files.map(entry => entry.path)), trees = new Map();
  if (!Array.isArray(historical)) fail('invalid historical module list');
  for (const entry of historical) {
    if (!entry || !/^runtime\/clinical-workspace-v1\/[a-f0-9]{12}\/client\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.mjs$/.test(entry.path)
      || entry.path.startsWith(prefix) || seen.has(entry.path) || !/^[a-f0-9]{64}$/.test(entry.sha256)) fail('historical resource path or digest');
    seen.add(entry.path);
    if (digest(readFileSync(resolve(repository, entry.path))) !== entry.sha256) fail('historical module changed: ' + entry.path);
    const tree = entry.path.split('/')[2], members = trees.get(tree) || [];
    members.push({ name: entry.path.slice(entry.path.indexOf('/client/') + 1), sha256: entry.sha256 }); trees.set(tree, members);
  }
  for (const [tree, members] of trees) {
    members.sort((left, right) => left.name.localeCompare(right.name));
    if (digest(JSON.stringify(members)).slice(0, 12) !== tree) fail('historical module tree changed: ' + tree);
  }
  const pack = manifest.precachePack;
  if (!pack || pack.path !== prefix + 'precache-' + pack.sha256.slice(0, 12) + '.json') fail('precache archive path');
  const packed = readFileSync(resolve(repository, pack.path));
  if (packed.byteLength !== pack.byteLength || digest(packed) !== pack.sha256) fail('precache archive changed');
  const expected = JSON.stringify({ schemaVersion: 1, files: manifest.files.concat(historical).map(entry => ({
    path: entry.path, sha256: entry.sha256, source: readFileSync(resolve(repository, entry.path), 'utf8')
  })) }) + '\n';
  if (packed.toString('utf8') !== expected) fail('precache archive differs from original module bytes');
  return files.length;
}
export function verifyClinicalWorkspacePrecache(repository = ROOT) {
  const manifest = JSON.parse(readFileSync(resolve(repository, 'runtime/clinical-workspace-v1/manifest.json'), 'utf8'));
  const worker = readFileSync(resolve(repository, 'service-worker-kalorii.js'), 'utf8');
  const vault = readFileSync(resolve(repository, 'vilda_vault.js'), 'utf8');
  const mutation = /['"](vilda_care_plan_mutation\.js\?v=\d+)['"]/.exec(vault)?.[1];
  if (!mutation) fail('missing mutation model resource');
  const allFiles = manifest.files.concat(manifest.historicalFiles || []);
  for (const path of [...allFiles.map(entry => entry.path), mutation]) {
    if (!worker.includes("'/" + path + "'")) fail('resource is absent from production precache: ' + path);
  }
  const config = /const CLINICAL_WORKSPACE_PRECACHE_PACK = Object\.freeze\((\{[\s\S]*?\})\);/.exec(worker)?.[1];
  const expected = { url: '/' + manifest.precachePack.path, sha256: manifest.precachePack.sha256,
    files: allFiles.map(entry => ({ url: '/' + entry.path, sha256: entry.sha256 })) };
  if (!config || JSON.stringify(JSON.parse(config)) !== JSON.stringify(expected)) fail('precache archive configuration differs from release');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyClinicalWorkspaceCurrentBase(readFileSync(resolve(ROOT, 'vilda_vault.js'), 'utf8'));
  verifyClinicalWorkspacePrecache();
  process.stdout.write('Clinical workspace delta and ' + verifyClinicalWorkspaceModules() + ' immutable modules verified.\n');
}
