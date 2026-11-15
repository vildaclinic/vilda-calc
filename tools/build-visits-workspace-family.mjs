// Reproduce one bounded extension of the existing immutable runtime family.
// All 51 base modules remain byte-for-byte historical resources; only the
// readable source codec differs in the new family. This is not a bundler.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE_TREE = 'e410c87255418a499356b314d4e2da79abbba5677fadbe5649e352eac0c5a34e';
const BASE_PREFIX = 'runtime/clinical-workspace-v1/' + BASE_TREE.slice(0, 12) + '/';
const CODEC = 'client/patient-clinical-workspace-source/codec.mjs';
const MANIFEST = 'runtime/clinical-workspace-v1/manifest.json';
const digest = value => createHash('sha256').update(value).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
function fail(message) { throw new Error('Visit workspace family: ' + message); }

export function visitWorkspaceFamily(repository = ROOT) {
  const manifest = JSON.parse(readFileSync(resolve(repository, MANIFEST), 'utf8'));
  const base = manifest.files.concat(manifest.historicalFiles || [])
    .filter(entry => entry.path.startsWith(BASE_PREFIX))
    .map(entry => ({ name: entry.path.slice(BASE_PREFIX.length), sha256: entry.sha256,
      source: readFileSync(resolve(repository, entry.path), 'utf8') }))
    .sort((left, right) => left.name.localeCompare(right.name));
  if (base.length !== 51 || new Set(base.map(entry => entry.name)).size !== 51
    || base.some(entry => digest(entry.source) !== entry.sha256)
    || digest(JSON.stringify(base.map(({ name, sha256 }) => ({ name, sha256 })))) !== BASE_TREE)
    fail('the original runtime family changed');
  const codec = readFileSync(resolve(repository, 'runtime/durable-visits-v1/workspace-source-codec.mjs'), 'utf8');
  const current = base.map(entry => entry.name === CODEC
    ? { name: CODEC, source: codec, sha256: digest(codec) } : entry);
  const moduleTreeSHA256 = digest(JSON.stringify(current.map(({ name, sha256 }) => ({ name, sha256 }))));
  if (moduleTreeSHA256 === BASE_TREE) fail('missing codec extension');
  if (![BASE_TREE, moduleTreeSHA256].includes(manifest.moduleTreeSHA256)) fail('unexpected active family');
  const prefix = 'runtime/clinical-workspace-v1/' + moduleTreeSHA256.slice(0, 12) + '/';
  const files = current.map(entry => ({ path: prefix + entry.name, sha256: entry.sha256 }));
  const historicalFiles = (manifest.historicalFiles || []).slice();
  for (const entry of base) {
    const path = BASE_PREFIX + entry.name;
    if (!historicalFiles.some(previous => previous.path === path)) historicalFiles.push({ path, sha256: entry.sha256 });
  }
  const sources = new Map(current.map(entry => [prefix + entry.name, entry.source]));
  const packFiles = files.concat(historicalFiles).map(entry => ({ ...entry,
    source: sources.get(entry.path) ?? readFileSync(resolve(repository, entry.path), 'utf8') }));
  if (packFiles.some(entry => digest(entry.source) !== entry.sha256)) fail('historical member changed');
  const packBytes = JSON.stringify({ schemaVersion: 1, files: packFiles }) + '\n';
  const packSHA = digest(packBytes);
  const precachePack = { path: prefix + 'precache-' + packSHA.slice(0, 12) + '.json',
    sha256: packSHA, byteLength: Buffer.byteLength(packBytes) };
  // Native source/integration hashes continue to describe the exact original
  // boundary. Its new runtime-prefix hook is covered by the visits delta.
  const next = { ...manifest, moduleTreeSHA256, files, historicalFiles, precachePack };
  const config = { url: '/' + precachePack.path, sha256: packSHA,
    files: files.concat(historicalFiles).map(entry => ({ url: '/' + entry.path, sha256: entry.sha256 })) };
  let worker = readFileSync(resolve(repository, 'service-worker-kalorii.js'), 'utf8');
  const marker = '  // END CLINICAL WORKSPACE PRECACHE V1';
  if (worker.split(marker).length !== 2) fail('precache boundary changed');
  const missing = files.filter(entry => !worker.includes("'/" + entry.path + "'"));
  worker = worker.replace(marker, missing.map(entry => "  '/" + entry.path + "',\n").join('') + marker);
  const pattern = /const CLINICAL_WORKSPACE_PRECACHE_PACK = Object\.freeze\(\{[\s\S]*?\}\);/;
  if (!pattern.test(worker)) fail('precache configuration changed');
  worker = worker.replace(pattern, 'const CLINICAL_WORKSPACE_PRECACHE_PACK = Object.freeze(' + JSON.stringify(config, null, 2) + ');');
  return { moduleTreeSHA256, prefix, sources, manifest: next, manifestBytes: json(next),
    packBytes, precachePack, worker };
}

export function verifyVisitWorkspaceFamily(repository = ROOT, { checkVault = true } = {}) {
  const built = visitWorkspaceFamily(repository);
  for (const [path, source] of built.sources)
    if (readFileSync(resolve(repository, path), 'utf8') !== source) fail('generated module differs: ' + path);
  if (readFileSync(resolve(repository, MANIFEST), 'utf8') !== built.manifestBytes
    || readFileSync(resolve(repository, built.precachePack.path), 'utf8') !== built.packBytes
    || readFileSync(resolve(repository, 'service-worker-kalorii.js'), 'utf8') !== built.worker)
    fail('generated manifest or precache differs');
  if (checkVault) {
    const source = readFileSync(resolve(repository, 'vilda_vault.js'), 'utf8');
    if (source.includes(BASE_PREFIX) || source.split(built.prefix).length !== 2) fail('vault does not select the current family');
  }
  return built;
}

export function writeVisitWorkspaceFamily(repository = ROOT) {
  const built = visitWorkspaceFamily(repository);
  for (const [path, source] of built.sources) {
    const absolute = resolve(repository, path);
    if (existsSync(absolute) && readFileSync(absolute, 'utf8') !== source) fail('immutable destination already exists: ' + path);
    mkdirSync(dirname(absolute), { recursive: true }); writeFileSync(absolute, source);
  }
  const archive = resolve(repository, built.precachePack.path);
  if (existsSync(archive) && readFileSync(archive, 'utf8') !== built.packBytes) fail('immutable archive already exists');
  writeFileSync(archive, built.packBytes);
  writeFileSync(resolve(repository, MANIFEST), built.manifestBytes);
  writeFileSync(resolve(repository, 'service-worker-kalorii.js'), built.worker);
  return built;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.length && args[0] !== '--write') fail('usage: node tools/build-visits-workspace-family.mjs [--write]');
  const result = args.length ? writeVisitWorkspaceFamily() : verifyVisitWorkspaceFamily();
  process.stdout.write('Visit workspace family: ' + result.moduleTreeSHA256 + ' (51 modules; historical bytes retained).\n');
}
