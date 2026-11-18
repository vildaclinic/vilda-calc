// Exact optional encrypted-note extension. Existing clinical calculations and
// the private workspace fragment remain byte-identical to the input image.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = '175fb1ab57b47cf4b58d19369536722edc1177c1c3d7f83311e63727298bff9b';
const START = '/* BEGIN VILDA PATIENT TREATMENT V1 */\n';
const END = '/* END VILDA PATIENT TREATMENT V1 */\n';
const TOKEN = '{{PATIENT_TREATMENT_FRAGMENT}}';
const digest = value => createHash('sha256').update(value).digest('hex');
function fail(message) { throw new Error('Patient treatment boundary: ' + message); }
function definition(repository) {
  const manifest = JSON.parse(readFileSync(resolve(repository, 'runtime/patient-treatment-v1/manifest.json'), 'utf8'));
  if (manifest.namespace !== 'vilda-patient-treatment-vault' || manifest.version !== 1 || manifest.baseVaultSHA256 !== BASE
    || !Array.isArray(manifest.sources) || manifest.sources.length !== 3 || !Array.isArray(manifest.hooks) || !manifest.hooks.length) fail('manifest');
  const expected = ['model.js', 'store.js', 'vault-fragment.js'];
  const parts = manifest.sources.map((entry, index) => {
    if (entry.path !== 'runtime/patient-treatment-v1/' + expected[index]) fail('source path');
    const source = readFileSync(resolve(repository, entry.path), 'utf8');
    if (digest(source) !== entry.sha256) fail('readable source changed: ' + entry.path);
    return source;
  });
  const fragment = START + parts.join('\n') + END;
  if (digest(fragment) !== manifest.fragmentSHA256) fail('composed fragment changed');
  let fragments = 0;
  const hooks = manifest.hooks.map(hook => {
    if (!hook || typeof hook.name !== 'string' || !hook.name || typeof hook.before !== 'string' || !hook.before
      || typeof hook.after !== 'string' || !hook.after || digest(hook.before) !== hook.beforeSHA256 || digest(hook.after) !== hook.afterSHA256) fail('hook definition');
    const count = hook.after.split(TOKEN).length - 1; fragments += count;
    if (count > 1 || hook.before.includes(TOKEN)) fail('fragment marker');
    return { name: hook.name, before: hook.before, after: hook.after.replace(TOKEN, fragment) };
  });
  if (fragments !== 1 || new Set(hooks.map(hook => hook.name)).size !== hooks.length) fail('ambiguous hook list');
  return { manifest, hooks };
}
function replaceOnce(source, from, to, name) {
  if (source.split(from).length !== 2) fail('missing or ambiguous hook: ' + name);
  return source.replace(from, () => to);
}
export function applyPatientTreatmentDelta(source, repository = ROOT) {
  const { manifest, hooks } = definition(repository);
  if (digest(source) !== BASE) fail('unexpected input image');
  for (const hook of hooks) source = replaceOnce(source, hook.before, hook.after, hook.name);
  if (digest(source) !== manifest.integratedVaultSHA256) fail('generated image changed');
  return source;
}
export function restorePatientTreatmentBaseline(source, repository = ROOT) {
  if (!source.includes(START)) return source;
  const { manifest, hooks } = definition(repository);
  if (digest(source) !== manifest.integratedVaultSHA256) fail('unexpected generated image');
  for (const hook of hooks.slice().reverse()) source = replaceOnce(source, hook.after, hook.before, hook.name);
  if (digest(source) !== BASE) fail('unrelated vault change');
  return source;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (!args.length) {
    const source = readFileSync(resolve(ROOT, 'vilda_vault.js'), 'utf8');
    if (applyPatientTreatmentDelta(restorePatientTreatmentBaseline(source)) !== source) fail('round trip differs');
    process.stdout.write('Patient treatment: readable model, scoped actors and exact vault delta verified.\n');
  } else if (args.length === 3 && args[0] === '--rebuild') {
    writeFileSync(resolve(args[2]), applyPatientTreatmentDelta(readFileSync(resolve(args[1]), 'utf8')));
  } else fail('usage: node tools/patient-treatment-vault-delta.mjs [--rebuild BASE_FILE OUTPUT_FILE]');
}
