import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

// Static source verification only. No application script is evaluated, no
// network is used, and no file is written. The adjacent literal-delta manifest
// reconstructs the reviewed artifacts from the pinned merged V1 baseline.
const options = Object.fromEntries(process.argv.slice(2).map(argument => {
  const match = /^--(root|base-dir|manifest)=(.+)$/.exec(argument);
  if (!match) throw new Error('Use --root=PATH, --base-dir=PATH or --manifest=PATH.');
  return [match[1], match[2]];
}));
const here = dirname(fileURLToPath(import.meta.url));
// Copying this checker and its manifest to tools/ makes this default the repo.
const root = resolve(options.root || resolve(here, '..'));
const manifest = JSON.parse(readFileSync(resolve(options.manifest || resolve(here, 'clinical-transport-source-delta.json')), 'utf8'));
const BASE = '28e7ddb87ee3088fa869c47a6c61fb7a97c32be6';
if (manifest.baseline !== BASE || manifest.version !== 1) throw new Error('Unexpected pinned baseline or manifest version.');
const { parse } = createRequire(resolve(root, 'package.json'))('acorn');
const hash = value => createHash('sha256').update(value).digest('hex');
const syntax = source => parse(source, { ecmaVersion: 'latest', sourceType: 'script' });
function baseline(file) {
  if (options['base-dir']) return readFileSync(resolve(options['base-dir'], file), 'utf8');
  const result = spawnSync('git', ['show', BASE + ':' + file], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error('Cannot read the pinned baseline; use --base-dir=PATH.');
  return result.stdout;
}
function body(ast) {
  const result = ast.body[0]?.expression?.callee?.body?.body;
  if (!Array.isArray(result)) throw new Error('Expected the existing IIFE artifact.');
  return result;
}
const identifier = (node, name) => node?.type === 'Identifier' && node.name === name;
const call = (node, names) => node?.type === 'CallExpression' && node.callee.type === 'Identifier' && names.includes(node.callee.name);
const member = (node, property) => node?.type === 'MemberExpression' && !node.computed && identifier(node.property, property);
const additions = new Set(['PatientClinicalRouteFailure', 'PatientClinicalRequireLegacy', 'PatientClinicalRejected',
  'PatientClinicalLoadState', 'PatientClinicalSaveState', 'PatientClinicalClearState', 'PatientClinicalLegacyAllowed', 'PatientClinicalStopBlocked']);
function onlyReturn(node) { return node?.type === 'ReturnStatement' && node.argument === null; }
function clinicalGuardReturn(node) {
  return onlyReturn(node) || node?.type === 'ReturnStatement' && node.argument?.type === 'UnaryExpression'
    && node.argument.operator === '!' && node.argument.argument.type === 'Literal' && node.argument.argument.value === 1;
}
function guardedLocal(node) {
  return node?.type === 'VariableDeclaration' && node.declarations.length === 1 && (
    ['PatientClinicalRejection', 'PatientClinicalError', 'PatientClinicalAttempt'].includes(node.declarations[0].id.name)
    || call(node.declarations[0].init, ['PatientClinicalRouteFailure']));
}
function unavailableBranch(test) {
  return test?.type === 'LogicalExpression' && test.operator === '&&' && member(test.right, 'patientClinicalUnavailable');
}
function sequence(expressions) {
  const result = expressions.flatMap(item => item.type === 'SequenceExpression' ? item.expressions : [item]);
  return result.length === 1 ? result[0] : { type: 'SequenceExpression', expressions: result };
}
function statements(items) {
  const filtered = items.map(strip).filter(Boolean), result = [];
  for (let index = 0; index < filtered.length; index++) {
    let node = filtered[index];
    // f() keeps its original single await and Response, with a post-await guard.
    if (node.type === 'VariableDeclaration' && node.declarations.length === 1
      && identifier(node.declarations[0].id, 'PatientClinicalResponse')
      && filtered[index + 1]?.type === 'ReturnStatement'
      && identifier(filtered[index + 1].argument, 'PatientClinicalResponse')) {
      node = { type: 'ReturnStatement', argument: node.declarations[0].init }; index++;
    }
    const previous = result.at(-1);
    // Removing an additive guard rejoins only adjacent declarations/expressions,
    // in their existing order; this normalizes minifier comma-vs-semicolon form.
    if (node.type === 'VariableDeclaration' && previous?.type === node.type && previous.kind === node.kind) {
      previous.declarations.push(...node.declarations);
    } else if (node.type === 'ExpressionStatement' && previous?.type === node.type
      && !node.directive && !previous.directive) {
      previous.expression = sequence([previous.expression, node.expression]);
    } else result.push(node);
  }
  return result;
}
function strip(node) {
  if (!node || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(strip).filter(Boolean);
  if (node.type === 'FunctionDeclaration' && additions.has(node.id.name)) return null;
  if (node.type === 'VariableDeclaration' && node.declarations.every(item =>
    ['PatientClinicalDisconnecting', 'PatientClinicalConnectionGeneration'].includes(item.id.name))) return null;
  if (guardedLocal(node)) return null;
  if (node.type === 'ExpressionStatement' && call(node.expression, ['PatientClinicalRequireLegacy'])) return null;
  if (node.type === 'ExpressionStatement' && node.expression.type === 'UpdateExpression'
    && identifier(node.expression.argument, 'PatientClinicalConnectionGeneration')) return null;
  if (node.type === 'IfStatement' && !node.alternate) {
    if (clinicalGuardReturn(node.consequent) && (call(node.test, ['PatientClinicalStopBlocked'])
      || node.test.type === 'UnaryExpression' && node.test.operator === '!' && call(node.test.argument, ['PatientClinicalLegacyAllowed']))) return null;
    // The direct legacy beacon stays inside its original try/catch.
    if (call(node.test, ['PatientClinicalLegacyAllowed'])) return strip(node.consequent);
    if (['PatientClinicalRejection', 'PatientClinicalError', 'error'].some(name => identifier(node.test, name))
      && (node.consequent.type === 'ThrowStatement' || node.consequent.type === 'ReturnStatement'
        || node.consequent.type === 'BlockStatement' && node.consequent.body.at(-1)?.type === 'ReturnStatement')) return null;
    if (unavailableBranch(node.test)) return null;
    if (onlyReturn(node.consequent) && node.test.type === 'BinaryExpression' && node.test.operator === '!==') {
      if (identifier(node.test.left, 'e') && identifier(node.test.right, 'u')) return null;
      if (identifier(node.test.left, 'PatientClinicalAttempt') && identifier(node.test.right, 'PatientClinicalConnectionGeneration')) return null;
    }
  }
  const result = {};
  for (const [key, value] of Object.entries(node)) {
    if (['start', 'end', 'loc', 'raw'].includes(key)) continue;
    if (key === 'body' && ['Program', 'BlockStatement'].includes(node.type)) result[key] = statements(value);
    else result[key] = strip(value);
  }
  // Xt() rethrows typed unavailability; its remaining old catch has no binding.
  if (result.type === 'CatchClause' && identifier(result.param, 'error') && node.body.body.some(item =>
    item.type === 'IfStatement' && unavailableBranch(item.test))) result.param = null;
  if (result.type === 'Identifier') {
    const aliases = { PatientClinicalLoadState: 'm', PatientClinicalSaveState: 'T', PatientClinicalClearState: 'C' };
    if (aliases[result.name]) result.name = aliases[result.name];
  }
  return result;
}
function firstDifference(left, right, path) {
  if (JSON.stringify(left) === JSON.stringify(right)) return null;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return path;
  for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
    const found = firstDifference(left[key], right[key], path + '.' + key);
    if (found) return found;
  }
  return path;
}
const report = [];
for (const item of manifest.files) {
  if (!['vilda_sync.js', 'vilda_sync_integration.js', 'vilda_realtime.js'].includes(item.path)) throw new Error('Unexpected manifest path.');
  const before = baseline(item.path), after = readFileSync(resolve(root, item.path), 'utf8');
  if (hash(before) !== item.beforeSha256 || hash(after) !== item.afterSha256) throw new Error('Source hash differs: ' + item.path);
  let rebuilt = before, lastStart = before.length + 1;
  for (const patch of item.patches) {
    if (!Number.isInteger(patch.start) || !Number.isInteger(patch.end) || patch.start < 0 || patch.end < patch.start
      || patch.end > lastStart || before.slice(patch.start, patch.end) !== patch.before) throw new Error('Invalid literal patch: ' + item.path);
    rebuilt = rebuilt.slice(0, patch.start) + patch.after + rebuilt.slice(patch.end); lastStart = patch.start;
  }
  if (rebuilt !== after) throw new Error('Literal reconstruction differs: ' + item.path);
  const beforeAST = syntax(before), afterAST = syntax(after);
  const oldFunctions = body(beforeAST).filter(node => node.type === 'FunctionDeclaration');
  const newFunctions = body(afterAST).filter(node => node.type === 'FunctionDeclaration' && !additions.has(node.id.name));
  if (JSON.stringify(oldFunctions.map(node => node.id.name)) !== JSON.stringify(newFunctions.map(node => node.id.name))) throw new Error('Existing function order changed: ' + item.path);
  const observed = oldFunctions.filter((node, index) => before.slice(node.start, node.end) !== after.slice(newFunctions[index].start, newFunctions[index].end)).map(node => node.id.name);
  if (JSON.stringify(observed) !== JSON.stringify(item.changedFunctions)) throw new Error('Changed function inventory differs: ' + item.path);
  const difference = firstDifference(strip(beforeAST), strip(afterAST), item.path);
  if (difference) throw new Error('Existing V1 AST differs beyond the reviewed additive boundary at ' + difference);
  report.push({ path: item.path, literalReconstruction: true, baselineFunctionOrder: true,
    existingV1ASTAfterRemovingBoundary: true, changedFunctions: observed, beforeSha256: item.beforeSha256, afterSha256: item.afterSha256 });
}
if (report.length !== 3 || new Set(report.map(item => item.path)).size !== 3) throw new Error('Expected exactly three distinct artifacts.');
process.stdout.write(JSON.stringify({ baseline: BASE, noApplicationCodeExecuted: true, noFilesWritten: true, files: report }, null, 2) + '\n');
