// Dedicated finite diagnostic branch only. Never a release gate or application module.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildHarness } from './build-harness.mjs';

const ownDirectory = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(ownDirectory, 'safety-manifest.json'), 'utf8'));
const command = process.argv[2];
const mode = process.argv[3];
const root = path.resolve(process.argv[4] || process.cwd());
const output = path.resolve(process.argv[5] || path.join(process.env.RUNNER_TEMP || '', 'gh-session-diagnostic-' + mode));
const relativeTarget = 'tests/e2e/home-workspace-growth.spec.mjs';
const target = path.join(root, relativeTarget);
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const check = (condition, message) => { if (!condition) throw Error(message); };
const write = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
const outside = path.relative(root, output);
check(outside.startsWith('..' + path.sep) || path.isAbsolute(outside), 'Diagnostic output must stay outside checkout');
check(['native', 'refusal'].includes(mode), 'Use diagnostic mode native or refusal');

function sourceHashes() {
  const result = {};
  for (const [name, expected] of Object.entries(manifest.originalFiles)) {
    const actual = sha(fs.readFileSync(path.join(root, name)));
    check(actual === expected, 'Frozen source drift: ' + name);
    result[name] = actual;
  }
  return result;
}
function diagnosticHashes() {
  const ownRoot = path.resolve(ownDirectory, '../../..');
  for (const [name, expected] of Object.entries(manifest.diagnosticFiles))
    check(sha(fs.readFileSync(path.join(ownRoot, name))) === expected, 'Diagnostic helper drift: ' + name);
}
function snapshot() {
  const names = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  return Object.fromEntries(names.map(name => {
    const file = path.join(root, name), stat = fs.lstatSync(file);
    const bytes = stat.isSymbolicLink() ? Buffer.from(fs.readlinkSync(file)) : fs.readFileSync(file);
    return [name, { mode: stat.mode & 0o777, kind: stat.isSymbolicLink() ? 'symlink' : 'file', sha256: sha(bytes) }];
  }));
}
function validateBranch() {
  check(process.env.CI === 'true' && process.env.GITHUB_EVENT_NAME === 'push'
    && process.env.GITHUB_REF === 'refs/heads/' + manifest.branch, 'Dedicated push-only diagnostic environment required');
  check(git(['status', '--porcelain']) === '', 'Diagnostic checkout must start clean');
  git(['merge-base', '--is-ancestor', manifest.baseCommit, 'HEAD']);
  const changed = git(['diff', '--name-status', manifest.baseCommit, 'HEAD']).split('\n').filter(Boolean).map(line => line.split('\t'));
  check(changed.length === manifest.addedFiles.length
    && changed.every(([kind, name]) => kind === 'A' && manifest.addedFiles.includes(name)), 'Only approved diagnostic ADD files may differ from be8');
}
function rowsFromReport(report) {
  const rows = [];
  function walk(suites, parents = []) {
    for (const suite of suites || []) {
      const titles = [...parents, suite.title];
      for (const spec of suite.specs || []) for (const item of spec.tests || [])
        rows.push({ file: spec.file, titles: [...titles, spec.title], project: item.projectName });
      walk(suite.suites, titles);
    }
  }
  walk(report.suites);
  return rows;
}
function collection(name, kind) {
  const args = ['node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.lab-chart-webkit.config.mjs', '--list', '--reporter=json'];
  if (kind !== 'full') args.push('--project', manifest.target.project, '--grep', manifest.target.title, '--repeat-each', kind === 'stress' ? '10' : '1', '--retries', '0');
  // --list does not launch browsers, the static server or fixture setup.
  const body = execFileSync(process.execPath, args, { cwd: root, encoding: 'utf8', env: { ...process.env, CI: 'true' }, maxBuffer: 64 * 1024 * 1024 });
  fs.writeFileSync(path.join(output, name + '.json'), body, { mode: 0o600 });
  const report = JSON.parse(body), rows = rowsFromReport(report);
  check(!report.errors?.length, 'Playwright collection reported an error');
  check(rows.length === (kind === 'full' ? 88 : kind === 'stress' ? 10 : 1), 'Unexpected original case/repetition count');
  if (kind !== 'full') check(rows.every(item => item.file === 'home-workspace-growth.spec.mjs'
    && item.project === manifest.target.project && item.titles.at(-1) === manifest.target.title), 'Target title/project changed or grep matched another case');
  else check(sha(JSON.stringify(rows)) === manifest.original88SelectionSHA256, 'Original full88 selection/order drift');
  return rows;
}
function build(preview) {
  check(!fs.existsSync(output), 'Use a new diagnostic output directory');
  fs.mkdirSync(output, { recursive: true, mode: 0o700 });
  diagnosticHashes();
  const sourcesBefore = sourceHashes();
  if (!preview) { check(mode === 'refusal', 'Full88 native cohort belongs to unchanged standard CI; no duplicate diagnostic native job'); validateBranch(); }
  const before = preview ? null : snapshot();
  write('source-pins-before.json', sourcesBefore);
  if (before) write('source-before.json', before);
  const original = fs.readFileSync(target, 'utf8');
  const generated = buildHarness(original, mode, manifest.target);
  check(generated.proof.generatedSHA256 === manifest.harnessSHA256[mode], 'Frozen diagnostic harness drift');
  fs.writeFileSync(path.join(output, 'original-growth.spec.mjs'), original, { mode: 0o600 });
  fs.writeFileSync(path.join(output, 'instrumented-growth.spec.mjs'), generated.body, { mode: 0o600 });
  write('harness-proof.json', generated.proof);
  if (mode === 'refusal') {
    execFileSync('python3', [path.join(ownDirectory, 'build-observer.py'), root, output], { stdio: 'inherit' });
    check(sha(fs.readFileSync(path.join(output, 'observer.js'))) === manifest.observerSHA256, 'Refusal-only observer byte identity failed');
    execFileSync(process.execPath, [path.join(ownDirectory, 'verify-observer.mjs'), root, output], { stdio: 'inherit' });
  }
  const originalFull = collection('original-full88-selection', 'full');
  const originalSingle = collection('original-target-selection', 'single');
  const originalStress = collection('original-stress10-selection', 'stress');
  if (preview) {
    check(JSON.stringify(sourceHashes()) === JSON.stringify(sourcesBefore), 'Pinned source changed during external preview');
    write('preview.json', { previewOnly: true, repositoryModified: false, gitCommands: 0, browserRuns: 0,
      originalFullCases: originalFull.length, originalUniqueTargetCases: originalSingle.length, originalStressRepetitions: originalStress.length,
      generatedHarnessCollection: 'Not run in source checkout. Actual prepare must compare generated selection after reversible ephemeral patch.',
      mode, nativeFull88Cohort: 'Separate unchanged standard CI on d54; not duplicated by this workflow.' });
    return;
  }
  write('prepare-state.json', { mode, originalSHA256: sha(original), instrumentedSHA256: sha(generated.body), head: git(['rev-parse', 'HEAD']) });
  fs.writeFileSync(target, generated.body);
  const observedFull = collection('diagnostic-full88-selection', 'full');
  const observedSingle = collection('diagnostic-target-selection', 'single');
  const observedStress = collection('diagnostic-stress10-selection', 'stress');
  check(JSON.stringify(originalFull) === JSON.stringify(observedFull), 'Original full88 selection/order changed');
  check(JSON.stringify(originalSingle) === JSON.stringify(observedSingle), 'Original unique target selection changed');
  check(JSON.stringify(originalStress) === JSON.stringify(observedStress), 'Original repeated target selection/order changed');
  write('selection-proof.json', { exactOriginalFull88SelectionAndOrder: true, fullCases: originalFull.length,
    uniqueTargetCases: originalSingle.length, repetitions: originalStress.length, retries: 0, workers: 1,
    grep: manifest.target.title, regexAnchorsAdded: false, newTestDefinitions: 0,
    originalPerCaseTimeoutMs: 240000, originalConfigTimeoutMs: 120000,
    note: 'JSON --list omits repeatEachIndex; actual per-repetition evidence uses test.info().repeatEachIndex plus retry.' });
}
function restore() {
  const statePath = path.join(output, 'prepare-state.json');
  if (!fs.existsSync(statePath)) { console.log('No ephemeral harness state was created'); return; }
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  check(state.mode === mode && mode === 'refusal', 'Ephemeral restore mode drift');
  const before = JSON.parse(fs.readFileSync(path.join(output, 'source-before.json'), 'utf8'));
  const current = snapshot();
  check(JSON.stringify(Object.keys(current)) === JSON.stringify(Object.keys(before)), 'Tracked file list changed');
  for (const name of Object.keys(before)) if (name !== relativeTarget)
    check(JSON.stringify(current[name]) === JSON.stringify(before[name]), 'Unexpected source mutation: ' + name);
  const actual = sha(fs.readFileSync(target));
  check(actual === state.instrumentedSHA256 || actual === state.originalSHA256, 'Unexpected ephemeral harness mutation');
  const original = fs.readFileSync(path.join(output, 'original-growth.spec.mjs'));
  check(sha(original) === state.originalSHA256, 'Harness backup drift');
  fs.writeFileSync(target, original);
  check(JSON.stringify(snapshot()) === JSON.stringify(before), 'Tracked file modes/types/contents do not match original checkout');
  check(git(['status', '--porcelain']) === '', 'Diagnostic checkout not clean after restoration');
  sourceHashes();
  write('restoration-proof.json', { restoredExactOriginalTrackedFiles: true, trackedPaths: Object.keys(before).length,
    head: git(['rev-parse', 'HEAD']), nativeArtifactNeverModified: true,
    nativeSHA256: sha(fs.readFileSync(path.join(root, 'vilda_data_import_export.js'))), diagnosticOnlyNotReleaseGate: true });
}
try {
  if (command === 'preview') build(true);
  else if (command === 'prepare') build(false);
  else if (command === 'restore') restore();
  else throw Error('Use preview|prepare|restore native|refusal [source-root] [external-output]');
} catch (error) {
  console.error('Diagnostic preparation failed: ' + String(error.message || error).slice(0, 500));
  process.exitCode = 1;
}
