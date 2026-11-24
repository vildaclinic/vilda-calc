// Reversible opt-in treatment-document durability above the frozen outcome
// layer. All older native, profile and document layers retain their own proof.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import { restoreStagedDocumentationBaseline } from './staged-documentation-vault-delta.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const BASE = '8ab490b5c984650f33813cb27ec6e72dcc4f4013223b1d46cda382c3f01e17da';
const SOURCE='runtime/treatment-documentation-v1/vault-fragment.js';
const MANIFEST='runtime/treatment-documentation-v1/manifest.json';
const START='/* BEGIN VILDA TREATMENT DOCUMENTATION V1 */\n';
const END='/* END VILDA TREATMENT DOCUMENTATION V1 */\n';
const digest=value=>createHash('sha256').update(value).digest('hex');
const cache=new Map();
function fail(message){throw new Error('Treatment documentation boundary: '+message);}
function once(source,before,after,name){
  if(source.split(before).length!==2)fail('missing or ambiguous hook: '+name);
  return source.replace(before,()=>after);
}
function readable(root){const source=readFileSync(resolve(root,SOURCE),'utf8');return{source,fragment:START+source+END};}
function declared(base,fragment){
  if(digest(base)!==BASE)fail('unexpected reviewed base');
  const key=digest(fragment);if(cache.has(key))return cache.get(key);
  const pairs=[
    ['new-diagnosis-and-episode-canonical-option', 'vault.savePatientNoteOnce(note, { isCurrent: function () { return checkVisit(binding); } });',
      'vault.savePatientNoteOnce(note, TreatmentDocumentationCreateOptions(binding, function () { return checkVisit(binding); }));'],
    ['new-followup-separate-witness-parameter', 'async function update(kind, dto, values, binding) {',
      'async function update(kind, dto, values, binding, newFollowup) {'],
    ['new-followup-update-options', 'vault.updateExistingPatientNote(request, { isCurrent: function () { return checkVisit(binding); } });',
      'vault.updateExistingPatientNote(request, TreatmentDocumentationUpdateOptions(binding, function () { return checkVisit(binding); }, newFollowup));'],
    ['new-followup-exact-created-entry-witness', "      return update('therapy', original, { followups: entries }, binding);",
      "      return update('therapy', original, { followups: entries }, binding, !id && binding ? { id: entries[entries.length - 1].id, visitContext: entries[entries.length - 1].visitContext } : null);"],
    ['patient-lease-before-existing-note-lease', '  return Ac(next.id, async function () {',
      '  return TreatmentDocumentationLock(next, treatmentOptions, remove, function () { return Ac(next.id, async function () {'],
    ['close-patient-lease-with-native-actor', '  });\n}\nfunction VildaUpdateExistingPatientNote(payload, treatmentOptions) {',
      '  }); });\n}\nfunction VildaUpdateExistingPatientNote(payload, treatmentOptions) {'],
    ['new-followup-only-check-before-writing', '    const careNote = await Ft(stored); assertSession();',
      "    const careNote = await Ft(stored); assertSession();\n    if (treatmentOptions && Object.prototype.hasOwnProperty.call(treatmentOptions, 'newTreatmentFollowup')) {\n      await TreatmentDocumentationCheckFollowup(next, careNote, treatmentOptions, assertSession); assertSession();\n    }"],
    ['capture-followup-options-before-native-queue', ';VisitDocumentInstall($s);',
      ';VisitDocumentInstall($s);TreatmentDocumentationInstall($s);'],
    ['readable-durability-source', '/* END VILDA PROFILE TRASH V1 */\n',
      '/* END VILDA PROFILE TRASH V1 */\n'+fragment],
  ];
  const hooks=[];
  for(const[name,before,after]of pairs){base=once(base,before,after,name);hooks.push({name,before,after,beforeSHA256:digest(before),afterSHA256:digest(after)});}
  parse(base,{ecmaVersion:'latest'});const result={source:base,hooks};cache.set(key,result);return result;
}
function definition(root){
  const manifest=JSON.parse(readFileSync(resolve(root,MANIFEST),'utf8')),source=readable(root);
  if(manifest.namespace!=='vilda-treatment-documentation-vault'||manifest.version!==1||manifest.baseVaultSHA256!==BASE
    ||manifest.source!==SOURCE||manifest.sourceSHA256!==digest(source.source)||manifest.fragmentSHA256!==digest(source.fragment)
    ||!Array.isArray(manifest.hooks)||manifest.hooks.length!==9)fail('manifest or readable source');
  for(const hook of manifest.hooks)if(!hook||typeof hook.before!=='string'||!hook.before||typeof hook.after!=='string'||!hook.after
    ||digest(hook.before)!==hook.beforeSHA256||digest(hook.after)!==hook.afterSHA256)fail('hook checksum');
  return{manifest,...source};
}
export function applyTreatmentDocumentationDelta(base,root=ROOT){
  const{manifest,fragment}=definition(root),built=declared(base,fragment);
  if(JSON.stringify(built.hooks)!==JSON.stringify(manifest.hooks)||digest(built.source)!==manifest.integratedVaultSHA256)fail('undeclared integration');
  return built.source;
}
export function buildTreatmentDocumentationDelta(base,root=ROOT){
  return declared(base,readable(root).fragment).source;
}
export function restoreTreatmentDocumentationBaseline(source,root=ROOT){
  source=restoreStagedDocumentationBaseline(source,root);
  if(!source.includes(START))return source;
  const{manifest,fragment}=definition(root),integrated=source;
  if(digest(source)!==manifest.integratedVaultSHA256)fail('unexpected integrated image');
  for(const hook of manifest.hooks.slice().reverse())source=once(source,hook.after,hook.before,hook.name);
  if(digest(source)!==BASE)fail('unrelated Vault change');
  const built=declared(source,fragment);
  if(built.source!==integrated||JSON.stringify(built.hooks)!==JSON.stringify(manifest.hooks))fail('undeclared reversal');
  return source;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);
  if(args.length===3&&args[0]==='--build'){
    const base=readFileSync(resolve(args[1]),'utf8'),source=readable(ROOT),built=declared(base,source.fragment);
    writeFileSync(resolve(ROOT,MANIFEST),JSON.stringify({namespace:'vilda-treatment-documentation-vault',version:1,baseVaultSHA256:BASE,
      source:SOURCE,sourceSHA256:digest(source.source),fragmentSHA256:digest(source.fragment),integratedVaultSHA256:digest(built.source),hooks:built.hooks},null,2)+'\n');
    writeFileSync(resolve(args[2]),built.source);process.stdout.write('Built exact treatment-document durability.\n');
  }else if(!args.length){const source=restoreStagedDocumentationBaseline(readFileSync(resolve(ROOT,'vilda_vault.js'),'utf8'));
    if(applyTreatmentDocumentationDelta(restoreTreatmentDocumentationBaseline(source))!==source)fail('round trip differs');
    process.stdout.write('Treatment documentation: exact outer Vault layer verified.\n');
  }else fail('usage: node tools/treatment-documentation-vault-delta.mjs [--build BASE_FILE OUTPUT_FILE]');
}
