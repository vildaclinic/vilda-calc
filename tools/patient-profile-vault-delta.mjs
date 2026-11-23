// Reproducible outer layer for immutable patient-profile documents. The exact
// native workspace, visit, treatment and trash layers remain independently
// reversible. No clinical calculation or reference table is changed here.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parse } from 'acorn';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = '981b7dd790d068486be0ab6b3a3346ba86550ca4e32f180f05aa0f4d8e618b9f';
const START = '/* BEGIN VILDA PATIENT PROFILE V1 */\n';
const END = '/* END VILDA PATIENT PROFILE V1 */\n';
const PATH = 'runtime/patient-profile-v1/manifest.json';
const digest = value => createHash('sha256').update(value).digest('hex');
const rangeCache = new Map(), declarationCache = new Map();
function fail(message) { throw new Error('Patient profile boundary: ' + message); }
function replaceOnce(source, before, after, name) {
  if (source.split(before).length !== 2) fail('missing or ambiguous anchor: ' + name);
  return source.replace(before, () => after);
}
function functionRange(source, name) {
  if (rangeCache.has(source)) {
    const found = rangeCache.get(source).get(name) || [];
    if (found.length !== 1) fail('function is not unique: ' + name);
    return found[0];
  }
  const ast = parse(source, { ecmaVersion: 'latest' }), ranges = new Map();
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'FunctionDeclaration' && node.id) {
      if (!ranges.has(node.id.name)) ranges.set(node.id.name, []);
      ranges.get(node.id.name).push(node);
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') walk(value);
    }
  }
  walk(ast);
  rangeCache.set(source, ranges);
  const found = ranges.get(name) || [];
  if (found.length !== 1) fail('function is not unique: ' + name);
  return found[0];
}
function declaredHooks(base, fragment) {
  if (digest(base) !== BASE) fail('unexpected reviewed base');
  const cacheKey = digest(fragment);
  if (declarationCache.has(cacheKey)) return declarationCache.get(cacheKey);
  let source = base;
  const hooks = [];
  function literal(name, before, after) {
    source = replaceOnce(source, before, after, name);
    hooks.push({ name, before, after, beforeSHA256: digest(before), afterSHA256: digest(after) });
  }
  function fn(name, replacements) {
    const node = functionRange(base, name), before = base.slice(node.start, node.end);
    let after = before;
    for (const [from, to] of replacements) after = replaceOnce(after, from, to, name);
    literal('function-' + name, before, after);
  }
  literal('visible-context-comparison', "'treatmentContext', 'visitContext'];", "'treatmentContext', 'profileContext', 'visitContext'];");
  fn('Ft', [['TreatmentContextField(TreatmentContextState(e)),EncounterNoteFields(e)', 'TreatmentContextField(TreatmentContextState(e)),ProfileContextField(ProfileContextState(e)),EncounterNoteFields(e)']]);
  fn('Fn', [
    ['async function Fn(t){', 'async function Fn(t,profileRead){'],
    ['const n=(await I().listPatientNotesForUser(b)).filter(function(o){return o&&o.patientId===t}),r=[];',
      'ProfileCheckMergeRead(profileRead);const ProfileRows=await I().listPatientNotesForUser(b);ProfileCheckMergeRead(profileRead);const n=ProfileRows.filter(function(o){return o&&o.patientId===t}),r=[];'],
    ['for(let o=0;o<n.length;o+=1)r.push(await Ft(n[o]));',
      'for(let o=0;o<n.length;o+=1){ProfileCheckMergeRead(profileRead);r.push(await Ft(n[o]));ProfileCheckMergeRead(profileRead)}'],
    ['return r.sort(Fr),r}', 'return r.sort(Fr),ProfileIncludesMerge(profileRead)?r:r.filter(function(note){return !ProfileIsNote(note)})}'],
  ]);
  fn('ht', [['VaultStrictReadAssert(session); notes.sort(Fr); return notes;', 'VaultStrictReadAssert(session); notes.sort(Fr); return notes.filter(function (note) { return !ProfileIsNote(note); });']]);
  fn('VildaOnceClinicalPayload', [['TreatmentContextState(note),', 'TreatmentContextState(note),\n    ProfileContextState(note),']]);
  fn('VildaSavePatientNoteOnce', [
    ['return Ac(next.id, async function () {', 'return ProfileCreateLock(next, treatmentOptions, function () { return Ac(next.id, async function () {'],
    ['const saved = await Ad(next, { token:', 'if(Object.prototype.hasOwnProperty.call(next,"profileContext")){await ProfileBeforeCreate(next, assertSession); assertSession();}\n    const saved = await Ad(next, { token:'],
    ['  });\n}', '  }); });\n}'],
  ]);
  fn('Ad', [
    ['let TreatmentExistingContext={present:false};', 'let TreatmentExistingContext={present:false};let ProfileExistingContext={present:false};'],
    ['TreatmentExistingContext=TreatmentContextState(g);', 'TreatmentExistingContext=TreatmentContextState(g);ProfileExistingContext=ProfileContextState(g);'],
    ['const TreatmentNextContext=TreatmentContextWrite(t,TreatmentExistingContext,e);', 'const TreatmentNextContext=TreatmentContextWrite(t,TreatmentExistingContext,e);const ProfileNextContext=ProfileContextWrite(t,ProfileExistingContext,e);'],
    ['TreatmentContextField(TreatmentNextContext),EncounterNoteOrigin(t,EncounterPrevious,i)', 'TreatmentContextField(TreatmentNextContext),ProfileContextField(ProfileNextContext),EncounterNoteOrigin(t,EncounterPrevious,i)'],
    ['RemB22NextContext||null,TreatmentNextContext])', 'RemB22NextContext||null,TreatmentNextContext,ProfileNextContext])'],
    ['RemB22ExistingContext||null,TreatmentExistingContext]);', 'RemB22ExistingContext||null,TreatmentExistingContext,ProfileExistingContext]);'],
  ]);
  fn('Eb', [['await CareMvpGuardStoredRecord(CareMvpDeleteRaw,CareMvpDeleteAssert);', 'ProfileGuardDelete(CareMvpDeleteRaw,Qwp);await CareMvpGuardStoredRecord(CareMvpDeleteRaw,CareMvpDeleteAssert);']]);
  fn('Le', [
    ['CareMvpPreflightPayload(t);', 'CareMvpPreflightPayload(t);t=await ProfilePreflightSync(t);Bses_pilnuj(e);'],
    ['let TreatmentMergedContext={present:false};', 'let TreatmentMergedContext={present:false};let ProfileMergedContext={present:false};'],
    ['TreatmentMergedContext=TreatmentContextState(z);', 'TreatmentMergedContext=TreatmentContextState(z);ProfileMergedContext=ProfileContextState(z);'],
    ['Object.assign(ze,TreatmentContextField(TreatmentContextMerge(TreatmentMergedContext,g,CareMvpIncomingWins)));', 'Object.assign(ze,TreatmentContextField(TreatmentContextMerge(TreatmentMergedContext,g,CareMvpIncomingWins)),ProfileContextField(ProfileContextMerge(ProfileMergedContext,g)));'],
  ]);
  fn('VaultPatientHeaders', [
    ['const identities = await VisitTrashIdentityCounts(session);', 'const identities = await VisitTrashIdentityCounts(session);\n  const profileIndex = ProfileEnabled()?await ProfileHeaderIndex(function () { VaultStrictReadAssert(session); }):null;'],
    ['const isExternal = !!(header && header.external);', 'if(profileIndex){header = await ProfileEffectiveHeader(patient.patientId, header, profileIndex);VaultStrictReadAssert(session);}\n    const isExternal = !!(header && header.external);'],
  ]);
  fn('Bpz_zapisWSesji', [
    ['o=await I().listPatientsForUser(b),a=[];', 'o=await I().listPatientsForUser(b),a=[],ProfileDedupIndex=ProfileEnabled()&&(n.rapidVisit||!n.patientId&&!Ha(t)&&n.dedup!==false&&!n.forceNew)?await ProfileHeaderIndex(function(){Bpz_pilnuj(Bpz_s)}):null;'],
    ['const E=o[m];let _=null;', 'Bpz_pilnuj(Bpz_s);const E=o[m];let _=null;'],
    ['_=await G(E.headerCipher.iv,E.headerCipher.data)', '_=await G(E.headerCipher.iv,E.headerCipher.data);Bpz_pilnuj(Bpz_s);if(ProfileDedupIndex){_=await ProfileEffectiveHeader(E.patientId,_,ProfileDedupIndex);Bpz_pilnuj(Bpz_s)}'],
    ['a.push(Object.assign({},E,{headerPlain:_}))', 'Bpz_pilnuj(Bpz_s);a.push(Object.assign({},E,{headerPlain:_}))'],
  ]);
  fn('ct', [['const n=await G(e.headerCipher.iv,e.headerCipher.data),r=', 'const n=ProfileEnabled()&&arguments[1]!==ProfileRawHeaderToken?await ProfileEffectiveHeader(t,await G(e.headerCipher.iv,e.headerCipher.data)):await G(e.headerCipher.iv,e.headerCipher.data),r=']]);
  fn('hr', [['await ct(t)', 'await ct(t,ProfileRawHeaderToken)']]);
  fn('Bzu_dokad', [['naglowek = await G(k.headerCipher.iv, k.headerCipher.data)', 'naglowek = ProfileEnabled()?await ProfileEffectiveHeader(k.patientId, await G(k.headerCipher.iv, k.headerCipher.data)):await G(k.headerCipher.iv, k.headerCipher.data)']]);
  fn('Bks_brakKarty', [['const naglowek = await G(cel.headerCipher.iv, cel.headerCipher.data);', 'const naglowek = ProfileEnabled()?await ProfileEffectiveHeader(cel.patientId, await G(cel.headerCipher.iv, cel.headerCipher.data)):await G(cel.headerCipher.iv, cel.headerCipher.data);']]);
  fn('CalendarReadContext', [['return { patientId: record.patientId, header: header };', 'if(!ProfileEnabled())return { patientId: record.patientId, header: header };\n        const profileIndex = await once(\'profile-index\', function () { return ProfileHeaderIndex(assertCurrent); });\n        const effective = await ProfileEffectiveHeader(patientId, header, profileIndex); assertCurrent();\n        return { patientId: record.patientId, header: effective };']]);
  fn('RemA8History', [['const header = await G(patient.headerCipher.iv, patient.headerCipher.data);', 'const header = ProfileEnabled()?await ProfileEffectiveHeader(patient.patientId, await G(patient.headerCipher.iv, patient.headerCipher.data)):await G(patient.headerCipher.iv, patient.headerCipher.data);']]);
  fn('Bsc_podBlokada', [['const Bs=await Fn(t);', 'const Bs=await ProfileNotesForMerge(t,Bsc_s);']]);
  fn('$a', [['const o=await Fn(t);', 'const o=await ProfileNotesForMerge(t,Bme_s);']]);
  fn('ns', [['const C=await G(A[N].headerCipher.iv,A[N].headerCipher.data);', 'const C=ProfileEnabled()?await ProfileEffectiveHeader(A[N].patientId,await G(A[N].headerCipher.iv,A[N].headerCipher.data)):await G(A[N].headerCipher.iv,A[N].headerCipher.data);']]);
  fn('ts', [['a=await G(r.headerCipher.iv,r.headerCipher.data),s=[];', 'a=ProfileEnabled()?await ProfileEffectiveHeader(t,await G(r.headerCipher.iv,r.headerCipher.data)):await G(r.headerCipher.iv,r.headerCipher.data),s=[];']]);
  fn('Po', [['const note = await Ft(notes[index]);', 'const note = await Ft(notes[index]);\n    if (ProfileIsNote(note)) continue;']]);
  fn('Ao', [['const s=n[a];if(!s', 'const s=n[a];if(ProfileIsNote(s))continue;if(!s']]);
  literal('public-profile-api', 'getPatient:VisitTrashPublicPatient,getPatientVisits:',
    'getPatient:ProfilePublicPatient,savePatientProfile:ProfileSave,resolvePatientProfile:ProfileResolve,getPatientVisits:');
  literal('profile-presentation-after-native-install', ';EncounterPublishVault($s);EncounterInstallCare($s)', ';EncounterPublishVault($s);ProfileInstallPresentation($s);EncounterInstallCare($s)');
  const insertion = '// Retain the canonical native install/publish sequence for the private builder.\n';
  literal('readable-profile-source', insertion, fragment + insertion);
  parse(source, { ecmaVersion: 'latest' });
  const result = { hooks, source }; declarationCache.set(cacheKey, result); return result;
}
function readable(repository) {
  const names = ['model.js', 'vault-fragment.js'];
  const sources = names.map(name => {
    const path = 'runtime/patient-profile-v1/' + name, source = readFileSync(resolve(repository, path), 'utf8');
    return { path, sha256: digest(source), source };
  });
  const fragment = START + sources.map(entry => entry.source).join('\n') + END;
  return { sources, fragment };
}
function definition(repository) {
  const manifest = JSON.parse(readFileSync(resolve(repository, PATH), 'utf8')), { sources, fragment } = readable(repository);
  if (manifest.namespace !== 'vilda-patient-profile-vault' || manifest.version !== 1 || manifest.baseVaultSHA256 !== BASE
    || manifest.fragmentSHA256 !== digest(fragment) || JSON.stringify(manifest.sources) !== JSON.stringify(sources.map(({ path, sha256 }) => ({ path, sha256 })))
    || !Array.isArray(manifest.hooks) || !manifest.hooks.length) fail('manifest or readable source');
  for (const hook of manifest.hooks) {
    if (!hook || typeof hook.before !== 'string' || !hook.before || typeof hook.after !== 'string' || !hook.after
      || digest(hook.before) !== hook.beforeSHA256 || digest(hook.after) !== hook.afterSHA256) fail('hook checksum');
  }
  return { manifest, fragment };
}
export function applyPatientProfileDelta(base, repository = ROOT) {
  const { manifest, fragment } = definition(repository), built = declaredHooks(base, fragment);
  if (JSON.stringify(manifest.hooks) !== JSON.stringify(built.hooks) || digest(built.source) !== manifest.integratedVaultSHA256) fail('declared delta differs');
  return built.source;
}
export function restorePatientProfileBaseline(source, repository = ROOT) {
  if (!source.includes(START)) return source;
  const { manifest, fragment } = definition(repository), integrated = source;
  if (digest(source) !== manifest.integratedVaultSHA256) fail('unexpected integrated image');
  for (const hook of manifest.hooks.slice().reverse()) source = replaceOnce(source, hook.after, hook.before, hook.name);
  if (digest(source) !== BASE) fail('unrelated vault change');
  const declared = declaredHooks(source, fragment);
  if (JSON.stringify(declared.hooks) !== JSON.stringify(manifest.hooks) || declared.source !== integrated) fail('undeclared integration change');
  return source;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length === 3 && args[0] === '--build') {
    const base = readFileSync(resolve(args[1]), 'utf8'), { sources, fragment } = readable(ROOT), built = declaredHooks(base, fragment);
    const manifest = { namespace: 'vilda-patient-profile-vault', version: 1, baseVaultSHA256: BASE,
      fragmentSHA256: digest(fragment), integratedVaultSHA256: digest(built.source),
      sources: sources.map(({ path, sha256 }) => ({ path, sha256 })), hooks: built.hooks };
    writeFileSync(resolve(ROOT, PATH), JSON.stringify(manifest, null, 2) + '\n');
    writeFileSync(resolve(args[2]), built.source);
    process.stdout.write('Built exact patient profile Vault delta.\n');
  } else if (!args.length) {
    const source = readFileSync(resolve(ROOT, 'vilda_vault.js'), 'utf8');
    if (applyPatientProfileDelta(restorePatientProfileBaseline(source)) !== source) fail('round trip differs');
    process.stdout.write('Patient profile: immutable encrypted revisions and exact outer Vault delta verified.\n');
  } else fail('usage: node tools/patient-profile-vault-delta.mjs [--build BASE_FILE OUTPUT_FILE]');
}
