// Package transport only: the visit and home UI files keep independent,
// versioned URLs and exact original UTF-8 bytes in Cache Storage.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['vilda_ui_intents.js', 'vilda_visit_context.js', 'vilda_visit_history_ui.js', 'vilda_visit_history_ui.css',
  'vilda_home_workspace.js', 'vilda_home_workspace.css', 'vilda_home_perinatal.js', 'vilda_sga_birth_results.css', 'vilda_home_growth.js', 'vilda_home_growth_views.js', 'vilda_home_growth_views.css', 'vilda_home_growth_charts.js',
  'vilda_home_tools.css', 'vilda_home_tools.js', 'vilda_home_tools_vitals.js',
  'vilda_home_tools_anthropometry.js', 'vilda_home_tools_nutrition.js', 'vilda_home_tools_intake.js',
  'vilda_home_diet.js', 'vilda_home_diet_bmi.css', 'vilda_home_diet.css',
  'vilda_home_dialog_history.js', 'vilda_home_patient_data.js', 'vilda_home_patient_note_host.js', 'vilda_home_patient_note_host.css', 'vilda_home_patient.js', 'vilda_home_patient.css', 'vilda_home_patient_native.js', 'vilda_home_patient_native.css', 'vilda_patient_treatment_ui.js', 'vilda_patient_treatment_ui.css', 'vilda_home_patient_native_note.js',
  'vilda_icd10_pl_data.js', 'vilda_icd10_search.js', 'vilda_icd10_picker.js', 'vilda_icd10_picker.css',
  'vilda_home_reminders.js', 'vilda_home_reminders.css', 'vilda_home_reminders_runtime.js',
  'vilda_home_gabinet.css', 'vilda_home_gabinet_start.css', 'vilda_home_gabinet_quick.js',
  'vilda_home_gabinet_start.js', 'vilda_home_encounter.js', 'vilda_home_gabinet.js',
  'vilda_home_visit_scene.css', 'vilda_home_visit_detail.css', 'vilda_home_visit_projection.js',
  'vilda_home_visit_scene.js', 'vilda_home_visit_detail.js', 'vilda_home_visit_history.js',
  'vilda_home_visit_comparison_model.js', 'vilda_home_comparison_clinical.js',
  'vilda_home_visit_comparison.js', 'vilda_home_visit_comparison.css'];
const MANIFEST = 'runtime/visit-ui-precache/manifest.json';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function fail(message) { throw new Error('Visit UI precache: ' + message); }

export function buildVisitUIPrecache(repository = ROOT) {
  const worker = readFileSync(resolve(repository, 'service-worker-kalorii.js'), 'utf8');
  const files = FILES.map(path => {
    const pattern = new RegExp("['\"]/" + path.replaceAll('.', '\\.') + "\\?v=([1-9][0-9]*)['\"]", 'g');
    const versions = [...worker.matchAll(pattern)].map(match => Number(match[1]));
    if (!versions.length) fail('resource has no numeric precache version: ' + path);
    const source = readFileSync(resolve(repository, path), 'utf8');
    return { path: path + '?v=' + Math.max(...versions), sha256: hash(source), source };
  });
  const bytes = JSON.stringify({ schemaVersion: 1, files }) + '\n', sha256 = hash(bytes);
  const pack = { path: 'runtime/visit-ui-precache/precache-' + sha256.slice(0, 12) + '.json',
    sha256, byteLength: Buffer.byteLength(bytes) };
  const current = existsSync(resolve(repository, MANIFEST))
    ? JSON.parse(readFileSync(resolve(repository, MANIFEST), 'utf8')) : null;
  if (current && (current.namespace !== 'vilda-visit-ui-precache' || current.version !== 1)) fail('unexpected manifest');
  const historicalPacks = current ? (current.historicalPacks || []).slice() : [];
  if (current && current.pack.path !== pack.path && !historicalPacks.some(entry => entry.path === current.pack.path))
    historicalPacks.push(current.pack);
  for (const entry of historicalPacks) {
    const old = readFileSync(resolve(repository, entry.path));
    if (hash(old) !== entry.sha256 || old.byteLength !== entry.byteLength) fail('historical archive changed');
  }
  const manifest = { namespace: 'vilda-visit-ui-precache', version: 1,
    files: files.map(({ path, sha256 }) => ({ path, sha256 })), pack, historicalPacks };
  const config = { url: '/' + pack.path, sha256,
    files: manifest.files.map(file => ({ url: '/' + file.path, sha256: file.sha256 })) };
  const expression = /const VISIT_UI_PRECACHE_PACK = Object\.freeze\(\{[\s\S]*?\}\);/;
  if (!expression.test(worker)) fail('missing worker configuration');
  return { bytes, manifest, manifestBytes: JSON.stringify(manifest, null, 2) + '\n', config,
    worker: worker.replace(expression, 'const VISIT_UI_PRECACHE_PACK = Object.freeze(' + JSON.stringify(config, null, 2) + ');') };
}

export function verifyVisitUIPrecache(repository = ROOT) {
  const built = buildVisitUIPrecache(repository);
  if (readFileSync(resolve(repository, MANIFEST), 'utf8') !== built.manifestBytes
    || readFileSync(resolve(repository, built.manifest.pack.path), 'utf8') !== built.bytes
    || readFileSync(resolve(repository, 'service-worker-kalorii.js'), 'utf8') !== built.worker)
    fail('generated archive, manifest or configuration differs; rebuild after resource version changes');
  return built;
}

export function writeVisitUIPrecache(repository = ROOT) {
  const built = buildVisitUIPrecache(repository), path = resolve(repository, built.manifest.pack.path);
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path) && readFileSync(path, 'utf8') !== built.bytes) fail('immutable archive already exists');
  writeFileSync(path, built.bytes);
  writeFileSync(resolve(repository, MANIFEST), built.manifestBytes);
  writeFileSync(resolve(repository, 'service-worker-kalorii.js'), built.worker);
  return built;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.length && args[0] !== '--write') fail('usage: node tools/build-visit-ui-precache.mjs [--write]');
  const built = args.length ? writeVisitUIPrecache() : verifyVisitUIPrecache();
  process.stdout.write('Visit UI precache: ' + built.manifest.files.length + ' independent URLs, 1 verified request (' + built.manifest.pack.byteLength + ' bytes).\n');
}
