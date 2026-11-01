import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

// Static verification only: no browser script is evaluated and no file is
// changed. Compare with the reviewed, merged V1 baseline. --base-dir permits
// checking exported baseline files without Git; --root supports a worktree.
const args = Object.fromEntries(process.argv.slice(2).map(argument => {
  const match = /^--(root|base|base-dir)=(.+)$/.exec(argument);
  if (!match) throw new Error('Use --root=PATH, --base=REF or --base-dir=PATH.');
  return [match[1], match[2]];
}));
const root = resolve(args.root || resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const baseline = args.base || '28e7ddb87ee3088fa869c47a6c61fb7a97c32be6';
const { parse } = createRequire(resolve(root, 'package.json'))('acorn');
if (baseline.startsWith('-') || baseline.includes(':')) throw new Error('Invalid base reference.');
function baseSource(file) {
  if (args['base-dir']) return readFileSync(resolve(args['base-dir'], file), 'utf8');
  const result = spawnSync('git', ['show', baseline + ':' + file], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error('Cannot read baseline ' + file + '; use --base-dir when Git is unavailable.');
  return result.stdout;
}
const syntax = source => parse(source, { ecmaVersion: 'latest', sourceType: 'script' });
function clean(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(clean);
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (!['start', 'end', 'loc', 'raw'].includes(key)) result[key] = clean(item);
  }
  return result;
}
const digest = node => createHash('sha256').update(JSON.stringify(clean(node))).digest('hex');
const additions = {
  "variable:PatientClinicalObservations": "3f4f2271646d5c6fb2415d0147353a0906b2e2abdb217ac8bcb5a9f94e094c1f",
  "variable:PatientClinicalRecoveryPins": "2cb5ab54146fd933414412aeec35ac5cc62851b92c01ac18aa6da78724f5fc66",
  "variable:PatientClinicalLegacy": "6e8aedb041e0f17b0f9e55b34d4d404b98769aa050ae37c56bef508e315fff5e",
  "variable:PatientClinicalMetadataOptions,PatientClinicalMetadataRecords": "800c3565212aca12c0a72da2dbee3d210033b5178178b3913e0651b113b68745",
  "function:PatientClinicalUnavailable": "bb37996b6a5dab74ac8b00963134ec574223528b1ac884c0245a57720114682c",
  "function:PatientClinicalScopeCurrent": "2b6340f2fe55006ee8b37bad73b0378b3bd4574a3598312c50d521c32bab34ea",
  "function:PatientClinicalSelectionFor": "fef10bbe9ea1e419579b065e4a78f9b3c739247945e4e975a8136a6c1900185a",
  "function:PatientClinicalSelect": "2803ee5fcb7f42f4cfbf3c150c547537dd6ab3c429c21299a09bfc0030630aa3",
  "function:PatientClinicalBeginInspection": "9f0f1132e6f7e8482f7946e921406d7b1c68ee0dd5f807f66680290324aa7ee2",
  "function:PatientClinicalAssertInspection": "fa8af5cde22df4d696e2d5844eb1b445f8bd377e50652eebec7b504d990a6351",
  "function:PatientClinicalStaleInspection": "6ca457c7ec359859ecdc73b31165f07954917ae81aa6c02b152d5dd629673b1d",
  "function:PatientClinicalInspect": "25a5666b92c37cd14ff491aac47239b77b554d58a2fe5200f64eee82d52ea8b2",
  "variable:PatientClinicalRecoveryCodes": "34367fdfb12dce0300101a92c81ae27bfedb87f43fd3c60074d1a0aa352732fc",
  "function:PatientClinicalRecoveryFailure": "4dc51cad139f60bbb61961ac661e4ffacb7838e7af5807214d32b10d6c63a257",
  "function:PatientClinicalRecoveryErrorCode": "3b92370cffc9697137a322c12b20583bbf6d41ff30bd48f4dd598f8aafb47176",
  "function:PatientClinicalRecoveryExpected": "804be44caef79d050cfc88195bad2928e5f1fb737afea0c6266fd9fde4def780",
  "function:PatientClinicalPinnedRecoveryExpected": "a60b29f42836f18f15972891269aed5f866c4d71f4c6fab11cb6d60f9f1b7c1a",
  "function:PatientClinicalPinRecovery": "0b48560953c51d0b7ea618ac0495089eddeeb872a183071315ca19bbd65e6346",
  "function:PatientClinicalInspectRecovery": "8a3f57201c4bcc1dfd3615e6971bb66802ff7498e69a9157626251cedd03010a",
  "function:PatientClinicalGuard": "b81a694a06de80c3ba8330ee7124f3ba1ec91f1f00cded38b60c28e285c69e34",
  "function:PatientClinicalWriteValue": "1223613aa11a71b00c3513ad536362f73b9f948941ae8fc0e0070aa72bd3f4f1",
  "function:PatientClinicalMetadataValue": "39888e827c7f229148c167373307acbea5119bc5d49316825e7f187fa518d922",
  "function:PatientClinicalMetadataDb": "a9308a44cfdf7a42a88f922ce61456dcacfe01a6df3410b4c12008abc5be758a",
  "function:PatientClinicalTagMetadataRecord": "8303a039acf49f4f8647fa5485f017a1ff81bf52f725e935039fa45ea047c080",
  "function:PatientClinicalRethrow": "217f72a2ff7f2582a4c533138bfe9a5bd65df42489ffc330f7ada7bdaf57b8c8",
  "function:PatientClinicalOptions": "70d44b9c59d6829f6184f285585cbbf7af140840f3a159765ac8acd9cb98b98f",
  "function:PatientClinicalPreferenceKey": "2efcca5a9cc1580e113808f9f16dea9a3f3a4d53bc5ef15104dd17786ee80dda",
  "function:PatientClinicalGuardMetadata": "23b8c0beddc4f3adc5ade1259d7f8a4668000bb95b08e51cb7408b2f232838f5",
  "function:PatientClinicalGuardMetadataRecord": "3691c12ab88731502d53e10fd6c7ef6615362fcaa3100e6e462242d3536c9b82",
  "function:PatientClinicalPreflightFormat": "d31901e0b5cc1b5dd3c57a61eab73b24814333363553ec96df36c5b21ede8abf",
  "function:PatientClinicalPreflightRejectedEnvelope": "1d8aa0c6463bb2b273bab39d6e0be481559d290d0bd0920cf39d9a6bb0cfffb9"
};
const parserPins = {
  "un": {
    "before": "6a91da836bc24a3633a33cac0178b3ab5cc498d8742fa319adbd5d298efe12b9",
    "after": "8eb1ac719526a012b5adc2f31671d618cc2ad8b7bfbb9a492651488dd530d616"
  },
  "as": {
    "before": "ee6b5f67a644a6a9f4dc5ced8eade9a111dced573f21eb1bdcf411ee0d09f472",
    "after": "69a7b396adb858e640b71bc98c8c247bd04936e6af4d32f869f16f4ea45271d3"
  }
};
// The private Ps signature/tag and its one registered publication callback are
// a bounded transformation, checked completely rather than stripped generically.
const preferencePublicationPins = {
  "Ps": {
    "before": "030ef91b551c9632e69aa0e192c546c0736c41e12f2c6bafacdc5488beeeedee",
    "after": "6992c741108d9769b583b82b991a83435e858fff2b70ed1db076f1db21c2e851"
  },
  "registration": {
    "before": "d5ab0d3d4bf9c6a6b9c9340264a8233a4819507b4ee8932a9d6e0a7cd2b0541e",
    "after": "5b1d272ede97f779d9ccc3d17c87235506a2a995dbe78446cc30c7d9c4e18128"
  }
};
// Checkpoint helpers and five existing functions are pinned separately. The
// reduction below removes only the reviewed native marker/cancellation additions;
// the original patient-authority proof still compares all remaining V1 syntax.
const checkpointAdditions = {
  "variable:PatientCheckpointNativeAdapters": "f4d9cc06fe3fe4151f7471d2b3b1f16dfb27e40f49418afc830a593662cf66e9",
  "variable:PatientCheckpointScopes": "839e2c0a9dc3c438a11ec90734f88656ab80a0dca8257d915ca29ba44b2e4271",
  "variable:PatientCheckpointHooks": "70940a0a7d3675ab5c11b02c991ac7a87f5b9e60aa902913cf8b7591db9beeaf",
  "function:PatientCheckpointError": "341bf0f7cf53d06d171c1d62365f2cbfba009844ace758470bcd5c7e7a57a96e",
  "function:PatientCheckpointCancelChanged": "8eb79c586fc94a5a6db2b9422ca677e756124f7d930f7b6f7a6840b8545d0a41",
  "function:PatientCheckpointScope": "470efed21e8c636e09447701d1b6521bb1db128aa65906b8a0d61a66eba4ca08",
  "function:PatientCheckpointModules": "4402e8864bc2649a43353749119a2cffac01a4973d331c99f274975162a3bdc7",
  "function:PatientCheckpointCreate": "014176633cc2e948b9b87019f92e797dfa5b1679db31650c6e3ae9bbd7030015",
  "function:PatientCheckpointRetained": "382bc1a68f18c3376726a72544e07154c6fc5bdddea8a9ab94cc454e9c7f3648",
  "function:PatientCheckpointRemoveUser": "8155cd8431084f065119f7e0ceca4ef889d72beb564821ded4280a05dc8c3a15"
};
const checkpointTransforms = {
  "Sa": {
    "before": "6df7c50e3903b3862942b6309c65c9b745f2732609b8e69ad88c56dc40f27c2e",
    "after": "34f86320bed2ae5d9f4db7b5e5bca3033001c18622714114afa6ffde83bf5a5a"
  },
  "te": {
    "before": "b02ecf5a563410ba33c39dc2cb5cca0ad323ffdecd76fb0c0ad9d3eaf851b1f4",
    "after": "19e3f18b7ce14d4d3620ca6e303e169e26d953990d68486d5c192bde113fce9c"
  },
  "kn": {
    "before": "1682e79139397c4b42dbf7256349727352a9a04579d648e43a200163d4e51e04",
    "after": "5e6fedbd6203b816876a8f2fa6b9abbd377f20feccf5eb9e1c9312994fc6f1f3"
  },
  "Ut": {
    "before": "532fb8ba63c7f7dbf2fae3f5fa97634035dcb2995670743bbad7b2b69d963dde",
    "after": "e89fdbd7b15790dd8b8c2926430680fe54e91ad951e54c853e9c630b28fabbcc"
  },
  "Js": {
    "before": "d830cc8d8a25efbc904d8eafcee8b8cef366da6befc4418892222f4351ca729d",
    "after": "252d1cdf90deca540d1b832762db2573d528f1514235bc6da2574139bab7576e"
  }
};
const dataImportPin = '830137c2367020f4bae67e761212e48357a21cf7ed9af4d71381d9e3d9813648';
const clinical = (node, names) => node && node.type === 'CallExpression'
  && node.callee.type === 'Identifier' && names.includes(node.callee.name);
const discardedCalls = ['PatientClinicalGuard', 'PatientClinicalGuardMetadata', 'PatientClinicalGuardMetadataRecord', 'PatientClinicalTagMetadataRecord',
  'PatientClinicalRethrow', 'PatientClinicalPreflightFormat', 'PatientClinicalPreflightRejectedEnvelope', 'preflightPatientClinicalFormat'];
let wrappers = 0, guards = 0;
function strip(node) {
  if (!node || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(strip).filter(item => item !== null);
  if (node.type === 'ExpressionStatement' && clinical(node.expression, discardedCalls)) { guards++; return null; }
  if (node.type === 'IfStatement' && node.test.type === 'BinaryExpression' && node.test.operator === '!=='
      && node.test.left.type === 'Identifier' && node.test.left.name === 'k'
      && node.test.right.type === 'Identifier' && node.test.right.name === 'BMK_KLUCZ'
      && !node.alternate && node.consequent.type === 'ExpressionStatement'
      && clinical(node.consequent.expression, ['PatientClinicalGuard'])) { guards++; return null; }

  if (node.type === 'VariableDeclaration' && node.declarations.length === 2
      && node.declarations[0].id.name === 'PatientClinicalPreferenceOptions'
      && node.declarations[0].init.type === 'ObjectExpression' && node.declarations[0].init.properties.length === 0
      && node.declarations[1].id.name === 'PatientClinicalPreferenceAccount'
      && node.declarations[1].init.type === 'Identifier' && node.declarations[1].init.name === 'b') return null;
  if (clinical(node, ['PatientClinicalPreferenceKey'])) {
    if (node.arguments.length !== 3) throw new Error('Unexpected computed clinical preference key.');
    return strip(node.arguments[0]);
  }
  if (node.type === 'VariableDeclaration' && node.declarations.length === 1
      && node.declarations[0].id.name === 'PatientClinicalOperationAccount') {
    if (node.declarations[0].init.type !== 'Identifier') throw new Error('Clinical context must only capture an existing identifier.');
    return null;
  }
  if (clinical(node, ['PatientClinicalWriteValue'])) {
    if (node.arguments.length !== 2) throw new Error('Clinical result guard must preserve one value (check comma-expression parentheses).');
    wrappers++; return strip(node.arguments[1]);
  }
  if (clinical(node, ['PatientClinicalMetadataDb'])) {
    if (node.arguments.length !== 3) throw new Error('Unexpected metadata DB guard.');
    wrappers++; return strip(node.arguments[2]);
  }
  if (clinical(node, ['PatientClinicalOptions'])) {
    if (node.arguments.length !== 2) throw new Error('Unexpected metadata context.');
    wrappers++; return strip(node.arguments[0]);
  }
  if (clinical(node, discardedCalls)) { guards++; return null; }
  if (node.type === 'ReturnStatement' && clinical(node.argument, ['PatientClinicalWriteValue'])
      && node.argument.arguments[1].type === 'Identifier' && node.argument.arguments[1].name === 'undefined') {
    return { type: 'ReturnStatement', argument: null };
  }
  if (node.type === 'SequenceExpression') {
    const expressions = node.expressions.map(strip).filter(item => item !== null);
    return expressions.length === 1 ? expressions[0] : { type: 'SequenceExpression', expressions };
  }
  const result = {};
  for (const [key, value] of Object.entries(node)) {
    if (['start', 'end', 'loc', 'raw'].includes(key)) continue;
    // Only the known clinical metadata calls had no pre-existing options.
    if (key === 'arguments' && node.type === 'CallExpression' && node.callee.type === 'Identifier'
        && node.callee.name === 'Bmk_zmien' && value.length === 3
        && value[2].type === 'Identifier' && value[2].name === 'PatientClinicalPreferenceOptions') result[key] = value.slice(0, 2).map(strip);
    else if (key === 'arguments' && node.type === 'CallExpression' && node.callee.type === 'Identifier'
        && node.callee.name === 'Bmk_zmien' && value.length === 3
        && clinical(value[2], ['PatientClinicalOptions']) && value[2].arguments[0].type === 'Literal'
        && value[2].arguments[0].value === null) result[key] = value.slice(0, 2).map(strip);
    else result[key] = strip(value);
  }
  if (result.type === 'CatchClause' && result.param && result.param.name === 'PatientClinicalCaught') result.param = null;
  return result;
}
function iifeBody(ast) {
  const expression = ast.body[0] && ast.body[0].expression;
  if (!expression || !expression.callee || !expression.callee.body) throw new Error('Expected existing IIFE artifact.');
  return expression.callee.body.body;
}
function additionKey(node) {
  if (node.type === 'FunctionDeclaration' && node.id.name.startsWith('PatientClinical')) return 'function:' + node.id.name;
  if (node.type === 'VariableDeclaration' && node.declarations.some(item => item.id.name && item.id.name.startsWith('PatientClinical'))) {
    return 'variable:' + node.declarations.map(item => item.id.name).join(',');
  }
  return null;
}
function failDifferent(before, after, file) {
  const left = strip(before), right = strip(after);
  function firstDifference(a, b, path) {
    if (JSON.stringify(a) === JSON.stringify(b)) return null;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return path + ': ' + JSON.stringify(a) + ' / ' + JSON.stringify(b);
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const difference = firstDifference(a[key], b[key], path + '.' + key);
      if (difference) return difference;
    }
    return path;
  }
  const difference = firstDifference(left, right, file);
  if (difference) throw new Error('Existing AST differs beyond reviewed boundary additions at ' + difference);
}
const vaultBefore = syntax(baseSource('vilda_vault.js'));
const vaultSource = readFileSync(resolve(root, 'vilda_vault.js'), 'utf8');
const vaultAfter = syntax(vaultSource), beforeBody = iifeBody(vaultBefore), afterBody = iifeBody(vaultAfter);
const checkpointFound = new Set();
function checkpointKey(node) {
  if (node.type === 'FunctionDeclaration' && node.id.name.startsWith('PatientCheckpoint')) return 'function:' + node.id.name;
  if (node.type === 'VariableDeclaration' && node.declarations.some(item => item.id.name && item.id.name.startsWith('PatientCheckpoint'))) return 'variable:' + node.declarations.map(item => item.id.name).join(',');
  return null;
}
afterBody.splice(0, afterBody.length, ...afterBody.filter(node => {
  const key = checkpointKey(node);
  if (!key) return true;
  if (!checkpointAdditions[key] || checkpointFound.has(key) || digest(node) !== checkpointAdditions[key]) throw new Error('Unexpected checkpoint addition: ' + key);
  checkpointFound.add(key); return false;
}));
if (checkpointFound.size !== Object.keys(checkpointAdditions).length) throw new Error('A reviewed checkpoint helper is missing.');
function removeCheckpointCancellation(node) {
  if (!node || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(removeCheckpointCancellation).filter(item => item !== null);
  if (node.type === 'ExpressionStatement' && clinical(node.expression, ['PatientCheckpointCancelChanged'])) return null;
  if (clinical(node, ['PatientCheckpointCancelChanged'])) return null;
  if (node.type === 'SequenceExpression') {
    const expressions = node.expressions.map(removeCheckpointCancellation).filter(item => item !== null);
    return expressions.length === 1 ? expressions[0] : { ...node, expressions };
  }
  return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, removeCheckpointCancellation(value)]));
}
for (const [name, pins] of Object.entries(checkpointTransforms)) {
  const index = afterBody.findIndex(node => node.type === 'FunctionDeclaration' && node.id.name === name);
  const node = afterBody[index];
  if (!node || digest(node) !== pins.after) throw new Error('Unexpected checkpoint integration: ' + name);
  if (name === 'Sa') {
    const statements = node.body.body;
    const marker = statements.findIndex(item => item.type === 'VariableDeclaration' && item.declarations.length === 1 && item.declarations[0].id.name === 'PatientCheckpointNativeAdapter');
    if (marker < 0 || statements[marker].declarations[0].init.type !== 'ObjectExpression'
      || statements[marker + 1].type !== 'ExpressionStatement' || statements[marker + 2].type !== 'ReturnStatement'
      || statements[marker + 2].argument.name !== 'PatientCheckpointNativeAdapter') throw new Error('Native adapter marker changed.');
    statements.splice(marker, 3, { type: 'ReturnStatement', argument: statements[marker].declarations[0].init });
  } else afterBody[index] = removeCheckpointCancellation(node);
  if (digest(afterBody[index]) !== pins.before) throw new Error('Existing function differs beyond checkpoint integration: ' + name);
}
const found = new Set();
afterBody.splice(0, afterBody.length, ...afterBody.filter(node => {
  const key = additionKey(node);
  if (!key) return true;
  if (!additions[key] || found.has(key) || digest(node) !== additions[key]) throw new Error('Unexpected clinical addition: ' + key);
  found.add(key); return false;
}));
if (found.size !== Object.keys(additions).length) throw new Error('A reviewed clinical helper/context is missing.');
for (const name of ['un', 'as']) {
  const old = beforeBody.find(node => node.type === 'FunctionDeclaration' && node.id.name === name);
  const index = afterBody.findIndex(node => node.type === 'FunctionDeclaration' && node.id.name === name);
  if (!old || index < 0 || digest(old) !== parserPins[name].before || digest(afterBody[index]) !== parserPins[name].after) {
    throw new Error('Unexpected protected outer-format parser change: ' + name);
  }
  // These two complete outer-format parser edits are hash pinned; all other
  // existing functions must compare exactly after removing additive guards.
  afterBody[index] = old;
}
function containsPreferenceRegistration(node) {
  if (!node || typeof node !== 'object') return false;
  if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression'
      && !node.callee.computed && node.callee.property.name === 'onPreferenceWrite') return true;
  return Object.entries(node).some(([key, value]) => !['loc', 'start', 'end'].includes(key)
    && (Array.isArray(value) ? value.some(containsPreferenceRegistration) : containsPreferenceRegistration(value)));
}
for (const name of ['Ps', 'registration']) {
  const matches = nodes => nodes.map((node, index) => ({ node, index })).filter(item => name === 'Ps'
    ? item.node.type === 'FunctionDeclaration' && item.node.id.name === 'Ps' : containsPreferenceRegistration(item.node));
  const old = matches(beforeBody), current = matches(afterBody);
  if (old.length !== 1 || current.length !== 1 || digest(old[0].node) !== preferencePublicationPins[name].before
      || digest(current[0].node) !== preferencePublicationPins[name].after) throw new Error('Unexpected clinical preference publication change: ' + name);
  afterBody[current[0].index] = old[0].node;
}
const api = afterBody.find(node => node.type === 'VariableDeclaration' && node.declarations.some(item => item.id.name === '$s'));
const apiValue = api && api.declarations.find(item => item.id.name === '$s').init;
if (!apiValue || apiValue.type !== 'ObjectExpression') throw new Error('Missing original vault API.');
const removeApi = apiValue.properties.filter(item => item.key.name === 'removeUser');
if (removeApi.length !== 1 || removeApi[0].value.name !== 'PatientCheckpointRemoveUser') throw new Error('Unexpected checkpoint removal wrapper.');
removeApi[0].value.name = 'CareTplRemoveUser';
for (const [key, value] of [['createPatientClinicalCheckpoint', 'PatientCheckpointCreate'], ['inspectPatientAuthority', 'PatientClinicalInspect'], ['inspectPatientAuthorityRecovery', 'PatientClinicalInspectRecovery'], ['selectPatientClinicalRoute', 'PatientClinicalSelect']]) {
  const matches = apiValue.properties.filter(item => item.key.name === key);
  if (matches.length !== 1 || matches[0].value.name !== value) throw new Error('Unexpected public clinical boundary: ' + key);
  apiValue.properties = apiValue.properties.filter(item => item.key.name !== key);
}
failDifferent(vaultBefore, vaultAfter, 'vilda_vault.js');
const dataBefore = syntax(baseSource('vilda_data_import_export.js'));
const dataAfter = syntax(readFileSync(resolve(root, 'vilda_data_import_export.js'), 'utf8'));
const dataBody = iifeBody(dataAfter);
const helper = dataBody.findIndex(node => node.type === 'FunctionDeclaration' && node.id.name === 'preflightPatientClinicalFormat');
if (helper < 0 || digest(dataBody[helper]) !== dataImportPin) throw new Error('Unexpected raw import format preflight.');
dataBody.splice(helper, 1);
failDifferent(dataBefore, dataAfter, 'vilda_data_import_export.js');
if (/returnPatientClinical/.test(vaultSource)) throw new Error('Minified return token adjacency changed control flow.');
for (const file of ['vilda_vault.js', 'vilda_care_plan_model.js']) {
  const source = readFileSync(resolve(root, file), 'utf8');
  if (!/available:\s*false,\s*code:\s*['"]CARE_V2_WRITER_DISABLED['"],\s*formatVersion:\s*2/.test(source)) throw new Error(file + ': dormant writer constant changed.');
}
process.stdout.write('Patient authority boundary: reviewed additions only; existing V1 AST preserved (' + wrappers + ' value/context guards, ' + guards + ' denial checks). No application code executed.\n');
