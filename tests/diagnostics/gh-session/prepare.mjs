// Dedicated branch diagnosis only. This file is not a release or clinical test gate.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ownDirectory = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(ownDirectory, 'safety-manifest.json'), 'utf8'));
const mode = process.argv[2];
const root = path.resolve(process.argv[3] || process.cwd());
const output = path.resolve(process.argv[4] || path.join(process.env.RUNNER_TEMP || '', 'gh-session-diagnostic'));
const target = path.join(root, 'tests/e2e/home-workspace-growth.spec.mjs');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const check = (condition, message) => { if (!condition) throw Error(message); };
const write = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + '\n');
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
const relativeOutput = path.relative(root, output);
check(relativeOutput.startsWith('..' + path.sep) || path.isAbsolute(relativeOutput), 'Diagnostic output must stay outside the checkout');

function snapshot() {
  const names = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  return Object.fromEntries(names.map(name => {
    const file = path.join(root, name), stat = fs.lstatSync(file);
    const bytes = stat.isSymbolicLink() ? Buffer.from(fs.readlinkSync(file)) : fs.readFileSync(file);
    return [name, { mode: stat.mode & 0o777, kind: stat.isSymbolicLink() ? 'symlink' : 'file', sha256: sha(bytes) }];
  }));
}

function verifyOriginals() {
  for (const [name, expected] of Object.entries(manifest.originalFiles)) {
    check(sha(fs.readFileSync(path.join(root, name))) === expected, 'Frozen source drift: ' + name);
  }
}

function observerAST() {
  const require = createRequire(path.join(root, 'package.json'));
  const acorn = require('acorn');
  check(acorn.version === '8.17.0', 'Pinned AST parser version changed');
  const helpers = new Set(['ghWriterObservation', 'ghWriterObservationScope', 'ghWriterObservationCarry']);
  let helperCount = 0, observationCount = 0;
  function observation(node) {
    return node?.type === 'ExpressionStatement' && node.expression?.type === 'CallExpression'
      && node.expression.callee?.type === 'Identifier' && node.expression.callee.name === 'ghWriterObservation';
  }
  function normalize(value, count) {
    if (Array.isArray(value)) return value.filter(node => {
      if (observation(node)) { if (count) observationCount++; return false; }
      if (node?.type === 'FunctionDeclaration' && helpers.has(node.id?.name)) { if (count) helperCount++; return false; }
      return true;
    }).map(node => normalize(node, count));
    if (!value || typeof value !== 'object') return value;
    const result = {};
    for (const key of Object.keys(value).sort()) {
      if (['start', 'end', 'loc', 'range', 'raw'].includes(key)) continue;
      result[key] = normalize(value[key], count);
    }
    if (result.type === 'IfStatement') for (const name of ['consequent', 'alternate']) {
      const node = result[name];
      if (node?.type === 'BlockStatement' && node.body.length === 1 && node.body[0].type === 'ReturnStatement') result[name] = node.body[0];
    }
    return result;
  }
  const parse = file => acorn.parse(fs.readFileSync(file, 'utf8'), { ecmaVersion: 'latest', sourceType: 'script' });
  const original = JSON.stringify(normalize(parse(path.join(root, 'vilda_data_import_export.js')), false));
  const instrumented = JSON.stringify(normalize(parse(path.join(output, 'observer.js')), true));
  check(original === instrumented && sha(original) === manifest.canonicalNativeAST, 'Native semantics changed after removing observer-only nodes');
  check(helperCount === 3 && observationCount === 23, 'Observer node scope changed');
  return { parser: acorn.version, helperCount, observationCount, canonicalNativeAST: sha(original), originalNativeASTEqualsObserverStrippedAST: true };
}

function harness(original) {
  let value = original;
  const changes = [];
  function replace(old, next, label) {
    check(value.split(old).length - 1 === 1, 'Harness anchor changed: ' + label);
    value = value.replace(old, next); changes.push({ old, next, label });
  }
  const header = "import { isTarget as __ghDiagTarget, install as __ghDiagInstall, harvest as __ghDiagHarvest, finish as __ghDiagFinish } from '../diagnostics/gh-session/diagnostic-hooks.mjs';\n";
  value = header + value;
  replace("  await page.addInitScript(() => { window.__VILDA_HOME_WORKSPACE_PREVIEW__ = true; });",
    "  await page.addInitScript(({ diagnostic }) => {\n    window.__VILDA_HOME_WORKSPACE_PREVIEW__ = true;\n    if (diagnostic) window.__vildaGhWriterDiagnosticTarget = true;\n  }, { diagnostic: __ghDiagTarget(test.info()) });", 'existing-initial-init-script-observer-only-marker');
  const genericRoute = "  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());";
  replace(genericRoute, genericRoute + "\n  if (__ghDiagTarget(test.info())) await __ghDiagInstall(page, test.info());", 'target-only-preload-resource-route');
  replace("      window.__ghSessionAtPortalReturn = null;",
    "      if (window.__vildaGhWriterDiagnosticTarget === true) {\n        window.__vildaGhWriterObservationEntries = [];\n        window.__vildaGhWriterObservationEnabled = true;\n      }\n      window.__ghSessionAtPortalReturn = null;", 'late-observer-ram-inside-original-evaluate-no-extra-await');
  const beforeF5 = "    await expect.poll(() => frame.evaluate(patient => VildaVault.getPatient(patient).then(row => row.snapshots[0].payload.ghTherapyPoints), id)).toEqual(points);\n    await page.reload({ waitUntil: 'load' }); const restored = await shellFrame(page); await readyForPatient(restored);";
  replace(beforeF5, beforeF5.replace('\n    await page.reload', "\n    if (__ghDiagTarget(test.info())) await __ghDiagHarvest(frame, 'before-original-F5', test.info());\n    await page.reload"), 'post-acknowledgement-target-only-harvest-before-original-F5');
  const footer = "\ntest.afterEach(async ({ page }, info) => {\n  if (__ghDiagTarget(info)) await __ghDiagFinish(page, info);\n});\n";
  value += footer;
  let reversed = value.slice(header.length, -footer.length);
  for (const change of [...changes].reverse()) {
    check(reversed.split(change.next).length - 1 === 1, 'Harness reverse anchor drift');
    reversed = reversed.replace(change.next, change.old);
  }
  check(reversed === original, 'Original test bytes cannot be recovered');
  const originalSegment = original.slice(original.indexOf('    await frame.evaluate(() => {\n      window.__ghSessionAtPortalReturn'), original.indexOf('    await expectGhPortalReturned(frame, dialog);'));
  const generatedSegment = value.slice(value.indexOf('    await frame.evaluate(() => {\n      if (window.__vildaGhWriterDiagnosticTarget'), value.indexOf('    await expectGhPortalReturned(frame, dialog);'));
  const hook = "      if (window.__vildaGhWriterDiagnosticTarget === true) {\n        window.__vildaGhWriterObservationEntries = [];\n        window.__vildaGhWriterObservationEnabled = true;\n      }\n";
  check(generatedSegment.replace(hook, '') === originalSegment, 'Critical pre-save segment changed beyond observer RAM');
  return { body: value, proof: { reverseOriginalTestByteExact: true, changeLabels: changes.map(x => x.label),
    criticalOriginalPreclickRoundTrips: 1, criticalDiagnosticPreclickRoundTrips: 1, noExtraAwaitBeforeRealPointSave: true,
    originalSHA256: sha(original), diagnosticSHA256: sha(value), target: manifest.target,
    bounds: 'Other cases get no diagnostic resource route, enable/reset, harvest or native-state reads. They do encounter inert target checks and an inert afterEach hook; module load/diagnostic setup overhead means this is not unchanged runtime.' } };
}

function collection(name) {
  const body = execFileSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.lab-chart-webkit.config.mjs', '--list', '--reporter=json'],
    { cwd: root, encoding: 'utf8', env: process.env, maxBuffer: 64 * 1024 * 1024 });
  fs.writeFileSync(path.join(output, name + '.json'), body);
  const report = JSON.parse(body), rows = [];
  function walk(suites, parents = []) {
    for (const suite of suites || []) {
      const titles = [...parents, suite.title];
      for (const spec of suite.specs || []) for (const test of spec.tests || []) rows.push({ file: spec.file, titles: [...titles, spec.title], project: test.projectName });
      walk(suite.suites, titles);
    }
  }
  walk(report.suites);
  check(rows.length === 88, 'Full original WebKit selection is not 88');
  return rows;
}

function prepare(preview) {
  check(!fs.existsSync(output), 'Use a new diagnostic output directory');
  fs.mkdirSync(output, { recursive: true, mode: 0o700 });
  verifyOriginals();
  if (!preview) {
    check(process.env.CI === 'true' && process.env.GITHUB_EVENT_NAME === 'push'
      && process.env.GITHUB_REF === 'refs/heads/' + manifest.branch, 'Dedicated push-only diagnostic environment required');
    check(git(['status', '--porcelain']) === '', 'Diagnostic checkout must start clean');
    git(['merge-base', '--is-ancestor', manifest.baseCommit, 'HEAD']);
    const changed = git(['diff', '--name-status', manifest.baseCommit, 'HEAD']).split('\n').filter(Boolean).map(line => line.split('\t'));
    check(changed.length === manifest.addedFiles.length && changed.every(([kind, name]) => kind === 'A' && manifest.addedFiles.includes(name)), 'Only the approved new diagnostic files may differ from be8');
    for (const [name, expected] of Object.entries(manifest.diagnosticFiles)) check(sha(fs.readFileSync(path.join(root, name))) === expected, 'Diagnostic helper drift: ' + name);
  }
  const before = snapshot();
  write('source-before.json', before);
  execFileSync('python3', [path.join(ownDirectory, 'build-observer.py'), root, output], { stdio: 'inherit' });
  check(sha(fs.readFileSync(path.join(output, 'observer.js'))) === manifest.observerSHA256, 'Observer byte identity failed');
  const ast = observerAST(), original = fs.readFileSync(target, 'utf8'), instrumented = harness(original);
  fs.writeFileSync(path.join(output, 'original-growth.spec.mjs'), original);
  fs.writeFileSync(path.join(output, 'instrumented-growth.spec.mjs'), instrumented.body);
  write('harness-proof.json', instrumented.proof); write('native-ast-proof.json', ast);
  if (preview) { write('preview.json', { previewOnly: true, repositoryModified: false, browserRuns: 0, collectionNotExecuted: true }); return; }
  const originalCollection = collection('original-selection');
  write('prepare-state.json', { originalSHA256: sha(original), instrumentedSHA256: sha(instrumented.body), head: git(['rev-parse', 'HEAD']) });
  fs.writeFileSync(target, instrumented.body);
  const observedCollection = collection('instrumented-selection');
  check(JSON.stringify(originalCollection) === JSON.stringify(observedCollection), 'Original 88-case selection/order changed');
  write('selection-proof.json', { exactOriginalSelectionAndOrder: true, cases: originalCollection.length, noGrepNoRetryWorkerOrTimeoutOverride: true });
}

function restore() {
  const statePath = path.join(output, 'prepare-state.json');
  if (!fs.existsSync(statePath)) { console.log('No ephemeral harness state was created'); return; }
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const before = JSON.parse(fs.readFileSync(path.join(output, 'source-before.json'), 'utf8'));
  const current = snapshot(), relative = 'tests/e2e/home-workspace-growth.spec.mjs';
  for (const name of Object.keys(before)) if (name !== relative) check(JSON.stringify(current[name]) === JSON.stringify(before[name]), 'Unexpected source mutation: ' + name);
  const actual = sha(fs.readFileSync(target));
  check(actual === state.instrumentedSHA256 || actual === state.originalSHA256, 'Unexpected ephemeral harness mutation');
  const original = fs.readFileSync(path.join(output, 'original-growth.spec.mjs'));
  check(sha(original) === state.originalSHA256, 'Harness backup drift');
  fs.writeFileSync(target, original);
  check(JSON.stringify(snapshot()) === JSON.stringify(before), 'Tracked files do not match the original checkout');
  check(git(['status', '--porcelain']) === '', 'Diagnostic source is not clean after harness restoration');
  verifyOriginals();
  write('restoration-proof.json', { restoredExactOriginalTrackedFiles: true, head: git(['rev-parse', 'HEAD']), nativeArtifactNeverModified: true,
    nativeSHA256: sha(fs.readFileSync(path.join(root, 'vilda_data_import_export.js'))), diagnosticOnlyNotReleaseGate: true });
}

try {
  if (mode === 'preview') prepare(true);
  else if (mode === 'prepare') prepare(false);
  else if (mode === 'restore') restore();
  else throw Error('Use preview, prepare or restore');
} catch (error) {
  console.error('Diagnostic preparation failed: ' + String(error.message || error).slice(0, 500));
  process.exitCode = 1;
}
