// Insert the staged-plan factories outside the sealed native workspace fragment.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'c50d9f4359adb8c94ce38194d2b6633cb3ca43d7698dcffda2a9c7d58a3e10da';
const SOURCE = 'runtime/staged-documentation-v1/vault-fragment.js';
const MANIFEST = 'runtime/staged-documentation-v1/manifest.json';
const START = '/* BEGIN VILDA STAGED DOCUMENTATION V1 */\n';
const END = '/* END VILDA STAGED DOCUMENTATION V1 */\n';
const INSTALL = 'function EncounterInstallCare(api) {';
const hash = value => createHash('sha256').update(value).digest('hex');

function fail(reason) { throw new Error('Staged documentation boundary: ' + reason); }
function once(source, before, after) {
  if (source.split(before).length !== 2) fail('missing or ambiguous install hook');
  return source.replace(before, () => after);
}
function hook(root) {
  const fragment = readFileSync(resolve(root, SOURCE), 'utf8');
  // Only the assembled Vault contains the original function declaration.
  const assignment = '  PatientWorkspaceModules = async function () {';
  const generated = once(fragment, assignment,
    '  // eslint-disable-next-line no-func-assign -- Wrap the sealed lazy loader once, preserving its import and retry behavior.\n' + assignment);
  return { fragment, installed: START + generated + END + INSTALL + '\n  StagedDocumentInstall();' };
}
function build(base, root) {
  if (hash(base) !== BASE) fail('unexpected reviewed base');
  const { fragment, installed } = hook(root), source = once(base, INSTALL, installed);
  parse(source, { ecmaVersion: 'latest' });
  const manifest = { namespace: 'vilda-staged-documentation-vault', version: 1,
    baseVaultSHA256: BASE, source: SOURCE, sourceSHA256: hash(fragment), integratedVaultSHA256: hash(source) };
  return { source, manifest };
}
function verify(manifest, root) {
  const recorded = JSON.parse(readFileSync(resolve(root, MANIFEST), 'utf8'));
  if (Object.keys(manifest).length !== Object.keys(recorded).length ||
      Object.entries(manifest).some(([key, value]) => recorded[key] !== value)) fail('unexpected integrated image or manifest');
}
export function applyStagedDocumentationDelta(base, root = ROOT) {
  const built = build(base, root);
  verify(built.manifest, root);
  return built.source;
}
export function restoreStagedDocumentationBaseline(source, root = ROOT) {
  if (!source.includes(START)) return source;
  const restored = once(source, hook(root).installed, INSTALL);
  // The reviewed base plus the single exact hook uniquely determines the image.
  if (hash(restored) !== BASE) fail('unexpected integrated image');
  const { fragment } = hook(root);
  verify({ namespace: 'vilda-staged-documentation-vault', version: 1, baseVaultSHA256: BASE,
    source: SOURCE, sourceSHA256: hash(fragment), integratedVaultSHA256: hash(source) }, root);
  return restored;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, basePath, outputPath] = process.argv.slice(2);
  if (command === '--build' && basePath && outputPath && process.argv.length === 5) {
    const built = build(readFileSync(resolve(basePath), 'utf8'), ROOT);
    writeFileSync(resolve(ROOT, MANIFEST), JSON.stringify(built.manifest, null, 2) + '\n');
    writeFileSync(resolve(outputPath), built.source);
  } else if (command === undefined) {
    const source = readFileSync(resolve(ROOT, 'vilda_vault.js'), 'utf8');
    if (applyStagedDocumentationDelta(restoreStagedDocumentationBaseline(source)) !== source) fail('round trip differs');
    process.stdout.write('Staged documentation: exact outer Vault layer verified.\n');
  } else fail('usage: node tools/staged-documentation-vault-delta.mjs [--build BASE_FILE OUTPUT_FILE]');
}
