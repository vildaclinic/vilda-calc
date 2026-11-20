import fs from 'node:fs';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const root = path.resolve(process.argv[2]);
const require = createRequire(path.join(root, 'package.json'));
const acorn = require('acorn');
const out = path.resolve(process.argv[3]);
if (acorn.version !== '8.17.0') throw new Error('Pinned AST parser version changed');
const sourcePath = path.join(root, 'vilda_data_import_export.js');
const clonePath = `${out}/observer.js`;
const proofPath = `${out}/proof.json`;
const hash = input => crypto.createHash('sha256').update(input).digest('hex');
const expectedSourceHash = '0e805e7f0a95103176e3d46d30a3f747a6f16eef9fb7d81ee4893c6d60667c0c';
const expectedAstHash = '78e8ac32a235245dae0089439c2b992755fc79d6a414192c6cd381c5dd9ad33b';
const syntax = spawnSync(process.execPath, ['--check', clonePath], { encoding: 'utf8' });
if (syntax.status !== 0) throw new Error(`Clone syntax check failed: ${syntax.stderr || syntax.stdout}`);
const nativeBytes = fs.readFileSync(sourcePath);
if (hash(nativeBytes) !== expectedSourceHash) throw new Error('Native hash mismatch');
const nativeText = nativeBytes.toString('utf8');
const cloneText = fs.readFileSync(clonePath, 'utf8');
const parse = text => acorn.parse(text, { ecmaVersion: 'latest', sourceType: 'script', locations: true });
const originalAst = parse(nativeText);
const cloneAst = parse(cloneText);
const helpers = new Set(['ghWriterObservation', 'ghWriterObservationScope', 'ghWriterObservationCarry']);
const observerCall = node => node?.type === 'CallExpression'
  && node.callee?.type === 'Identifier' && node.callee.name === 'ghWriterObservation';
const observerStatement = node => node?.type === 'ExpressionStatement' && observerCall(node.expression);
const observerOnlyElse = node => node?.type === 'BlockStatement'
  && node.body.length === 1 && observerStatement(node.body[0]);
let removedElseCount = 0;
function normalize(value, clone = false) {
  if (Array.isArray(value)) return value.filter(node => !observerStatement(node)
    && !(node?.type === 'FunctionDeclaration' && helpers.has(node.id?.name))).map(node => normalize(node, clone));
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const key of Object.keys(value).sort()) {
    if (['start', 'end', 'loc', 'range', 'raw'].includes(key)) continue;
    if (key === 'alternate' && value.type === 'IfStatement' && observerOnlyElse(value.alternate)) {
      if (clone) removedElseCount += 1;
      result[key] = null;
    } else result[key] = normalize(value[key], clone);
  }
  if (result.type === 'IfStatement') {
    for (const key of ['consequent', 'alternate']) {
      const node = result[key];
      if (node?.type === 'BlockStatement' && node.body.length === 1 && node.body[0].type === 'ReturnStatement')
        result[key] = node.body[0];
    }
  }
  return result;
}
const first = JSON.stringify(normalize(originalAst));
const second = JSON.stringify(normalize(cloneAst, true));
if (hash(first) !== expectedAstHash) throw new Error('Original canonical AST hash mismatch');
if (first !== second) throw new Error('Native AST differs after narrow observer removal');
if (removedElseCount !== 1) throw new Error('Expected exactly one observer-only ELSE');

// Independent exact byte reversal from the proposal's declared transform manifest.
const manifest = JSON.parse(fs.readFileSync(`${out}/reversal-manifest.json`, 'utf8'));
let reversed = cloneText;
for (const change of [...manifest].reverse()) {
  const count = reversed.split(change.new).length - 1;
  if (count !== change.count) throw new Error(`Unexpected reversal occurrence count: ${change.label}`);
  reversed = reversed.split(change.new).join(change.old);
}
if (!Buffer.from(reversed).equals(nativeBytes)) throw new Error('Exact source reversal failed');

// Classify every observation site structurally. No native function is evaluated.
const alwaysFalse = node => node?.type === 'Literal' && node.value === false
  || node?.type === 'UnaryExpression' && node.operator === '!' && node.argument?.type === 'Literal' && node.argument.value === 1
  || node?.type === 'ConditionalExpression' && alwaysFalse(node.consequent) && alwaysFalse(node.alternate)
  || node?.type === 'SequenceExpression' && alwaysFalse(node.expressions.at(-1));
const falseReturn = node => node?.type === 'ReturnStatement' && alwaysFalse(node.argument);
const observations = [];
const helperDeclarations = [];
const helperCalls = [];
function visit(node, ancestors = []) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const entry of node) visit(entry, ancestors); return; }
  if (node.type === 'FunctionDeclaration' && helpers.has(node.id?.name)) helperDeclarations.push(node.id.name);
  if (node.type === 'CallExpression' && node.callee?.type === 'Identifier' && helpers.has(node.callee.name))
    helperCalls.push({ node, ancestors });
  if (observerStatement(node)) {
    const block = ancestors.at(-1);
    const blockParent = ancestors.at(-2);
    const fn = [...ancestors].reverse().find(entry => entry.type === 'FunctionDeclaration');
    if (block?.type !== 'BlockStatement') throw new Error('Observer call outside a statement block');
    const index = block.body.indexOf(node);
    const next = block.body[index + 1];
    let classification;
    if (blockParent?.type === 'IfStatement' && blockParent.consequent === block && falseReturn(next)
      && block.body.length === 2 && index === 0) classification = 'existing-refusal-condition-then-original-false-return';
    else if (blockParent?.type === 'IfStatement' && blockParent.alternate === block && block.body.length === 1
      && blockParent.test.type === 'Identifier' && blockParent.test.name === 'w'
      && blockParent.consequent.type === 'ExpressionStatement'
      && blockParent.consequent.expression?.callee?.name === 'rememberNativeSaveCarry')
      classification = 'observer-only-else-of-original-if-w-adapter-already-false';
    else if (blockParent?.type === 'CatchClause' && falseReturn(block.body.at(-1)))
      classification = 'existing-terminal-catch-with-original-false-return';
    else if (blockParent?.type === 'CatchClause' && fn?.id?.name === 'oe'
      && fn.body.body.at(-2) && observerStatement(fn.body.body.at(-2)) && falseReturn(fn.body.body.at(-1)))
      classification = 'existing-terminal-oe-catch-before-original-false-fallthrough';
    else if (block === fn?.body && fn?.id?.name === 'oe' && falseReturn(next)
      && index === block.body.length - 2) classification = 'terminal-oe-fallthrough-before-original-false-return';
    else throw new Error(`Unproved observer placement at line ${node.loc.start.line}`);
    const thunk = node.expression.arguments[1];
    if (thunk?.type !== 'FunctionExpression' || thunk.params.length !== 0
      || thunk.body.body.length !== 1 || thunk.body.body[0].type !== 'ReturnStatement')
      throw new Error('Diagnostic detail must be a nonexecuted zero-argument thunk');
    observations.push({ stage: node.expression.arguments[0].value, function: fn.id.name,
      line: node.loc.start.line, classification });
  }
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'start', 'end'].includes(key)) continue;
    if (value && typeof value === 'object') visit(value, [...ancestors, node]);
  }
}
visit(cloneAst);
if (observations.length !== 19) throw new Error(`Expected 19 refusal-only call sites; found ${observations.length}`);
if (helperDeclarations.length !== 3 || new Set(helperDeclarations).size !== 3)
  throw new Error('Unexpected diagnostic helper declarations');
for (const { node, ancestors } of helperCalls) {
  const inHelperDeclaration = ancestors.some(entry => entry.type === 'FunctionDeclaration' && helpers.has(entry.id?.name));
  const inObserverStatement = ancestors.some(observerStatement);
  if (!inHelperDeclaration && !inObserverStatement)
    throw new Error(`Successful-path helper call not permitted: ${node.callee.name} line ${node.loc.start.line}`);
}
const proof = JSON.parse(fs.readFileSync(proofPath, 'utf8'));
proof.syntax = { result: 'PASS', command: 'node --check ' + clonePath, appRuntimeExecuted: false };
proof.astEquivalence = {
  result: 'PASS', parser: `acorn ${acorn.version}`, canonicalNativeAstSHA256: hash(first),
  method: 'Remove only three diagnostic helper declarations, standalone observer statements, and the one observer-only ELSE; collapse single-return if wrappers on both ASTs. All original native AST nodes/conditions/calls/return expressions deeply identical.',
  observerOnlyElseRemoved: removedElseCount
};
proof.reverseByteIdentity = true;
proof.reverseRestoredSHA256 = hash(Buffer.from(reversed));
proof.sourceStillExact = hash(fs.readFileSync(sourcePath)) === expectedSourceHash;
proof.successPathStaticAudit = { result: 'PASS', method: 'Classify every observer call by its existing refusal/terminal catch/fallthrough or existing adapter-false ELSE; require every diagnostic helper call to be inside these observer statements or helper declarations. Native runtime was never executed.', sites: observations };
proof.helperDeclarationsCount = helperDeclarations.length;
proof.observationCallSiteCount = observations.length;
const writerNodes = [];
function findWriter(node) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const item of node) findWriter(item); return; }
  if (node.type === 'FunctionDeclaration' && node.id?.name === 'oe') writerNodes.push(node);
  for (const [key, value] of Object.entries(node)) if (!['start', 'end', 'loc'].includes(key)) findWriter(value);
}
findWriter(cloneAst);
if (writerNodes.length !== 1) throw new Error('Exact observer writer source unavailable');
proof.writerFunctionSourceSHA256 = hash(cloneText.slice(writerNodes[0].start, writerNodes[0].end));
fs.writeFileSync(proofPath, JSON.stringify(proof, null, 2) + '\n');
console.log(JSON.stringify({ proposalSHA256: hash(cloneText), canonicalNativeAstSHA256: hash(first), reverseByteIdentity: true, observationCallSites: observations.length, sourceStillExact: proof.sourceStillExact }));
