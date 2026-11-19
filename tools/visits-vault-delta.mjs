// Exact, reversible integration of durable visit identity into the published
// vault artifact. The original native-workspace hashes remain unchanged.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = '417ac2f4df8debc5dcaa7b4cec452397a161f0803f9d4fdaf852ebf48d26115e';
const START = '/* BEGIN VILDA DURABLE VISITS V1 */\n';
const END = '/* END VILDA DURABLE VISITS V1 */\n';
const TOKEN = '{{VILDA_DURABLE_VISITS_FRAGMENT}}';
const digest = value => createHash('sha256').update(value).digest('hex');
function fail(message) { throw new Error('Durable visits boundary: ' + message); }

function definition(repository) {
  const manifest = JSON.parse(readFileSync(resolve(repository, 'runtime/durable-visits-v1/manifest.json'), 'utf8'));
  const fragment = readFileSync(resolve(repository, 'runtime/durable-visits-v1/vault-fragment.js'), 'utf8');
  if (manifest.namespace !== 'vilda-durable-visits-vault' || manifest.version !== 1
    || manifest.sourceRef !== '40d742d38f4d2924d3ba85a50d746790d0de6644'
    || manifest.baseVaultSHA256 !== BASE || digest(fragment) !== manifest.fragmentSHA256
    || !fragment.startsWith(START) || !fragment.endsWith(END)
    || !Array.isArray(manifest.hooks) || !manifest.hooks.length
    || !/^[a-f0-9]{64}$/.test(manifest.integratedVaultSHA256)) fail('unexpected manifest or readable source');
  let fragments = 0;
  const hooks = manifest.hooks.map(hook => {
    if (!hook || typeof hook.name !== 'string' || !hook.name
      || typeof hook.before !== 'string' || !hook.before
      || typeof hook.after !== 'string' || !hook.after
      || digest(hook.before) !== hook.beforeSHA256 || digest(hook.after) !== hook.afterSHA256)
      fail('invalid hook definition');
    const count = hook.after.split(TOKEN).length - 1;
    fragments += count;
    if (count > 1 || hook.before.includes(TOKEN)) fail('unexpected source placeholder');
    return { name: hook.name, before: hook.before, after: hook.after.replace(TOKEN, fragment) };
  });
  if (fragments !== 1 || new Set(hooks.map(hook => hook.name)).size !== hooks.length) fail('ambiguous hook list');
  return { manifest, hooks };
}

function replaceOnce(source, from, to, name) {
  if (source.split(from).length !== 2) fail('hook is missing or ambiguous: ' + name);
  return source.replace(from, () => to);
}

export function applyDurableVisitsDelta(source, repository = ROOT) {
  const { manifest, hooks } = definition(repository);
  if (digest(source) !== BASE) fail('unexpected input artifact');
  for (const hook of hooks) source = replaceOnce(source, hook.before, hook.after, hook.name);
  if (digest(source) !== manifest.integratedVaultSHA256) fail('generated artifact differs');
  return source;
}

export function restoreDurableVisitsBaseline(source, repository = ROOT) {
  // Unmodified historical artifacts still pass through the original proof.
  // A partially removed integration cannot pass its pinned native hash.
  if (!source.includes(START)) return source;
  const { manifest, hooks } = definition(repository);
  if (digest(source) !== manifest.integratedVaultSHA256) fail('unrecognized generated artifact');
  for (const hook of hooks.slice().reverse()) source = replaceOnce(source, hook.after, hook.before, hook.name);
  if (digest(source) !== BASE) fail('unrelated vault change');
  return source;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (!args.length) {
    const source = readFileSync(resolve(ROOT, 'vilda_vault.js'), 'utf8');
    if (applyDurableVisitsDelta(restoreDurableVisitsBaseline(source)) !== source) fail('round trip differs');
    process.stdout.write('Durable visits: exact vault delta and readable source verified.\n');
  } else if (args.length === 3 && args[0] === '--rebuild') {
    writeFileSync(resolve(args[2]), applyDurableVisitsDelta(readFileSync(resolve(args[1]), 'utf8')));
  } else fail('usage: node tools/visits-vault-delta.mjs [--rebuild BASE_FILE OUTPUT_FILE]');
}
