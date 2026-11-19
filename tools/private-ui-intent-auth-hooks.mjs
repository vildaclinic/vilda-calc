// Security-only UI metadata/identifier delta over the existing native Auth artifact.
// No clinical calculation, DTO schema, Vault writer or sync payload is changed.
import { readFileSync, writeFileSync } from 'node:fs';
import { reverseBscAuthHooks } from './account-duplicate-dismissals-auth-hooks.mjs';
import { createHash } from 'node:crypto';
export const UI_INTENT_AUTH_BASE_SHA256 = '12c87b88789bb0e0de6f5ce31fa30adfe82d6952de12ae683e54f7bb4f517a2c';
import { fileURLToPath } from 'node:url';
export const UI_INTENT_AUTH_PAIRS = [
  { label: "GH producer + verified public boundaries", before: String.raw`function Gr(t,a){remSearchDropReturn();try{i.sessionStorage.setItem("vilda:gh-jump",JSON.stringify({patientId:t,ghPointId:String(a),ts:Date.now()}))}catch{}var Qgj=!1;try{var Qgs=i.document.documentElement.classList.contains("vilda-embedded"),Qgb=Qgs&&i.parent&&i.parent!==i?i.parent.VildaShell:null;Qgb&&typeof Qgb.navigate=="function"&&(Qgb.navigate("docpro",!0),Qgj=!0)}catch{Qgj=!1}if(!Qgj)try{if(typeof i.refreshGHTherapyMonitor=="function"){var Qgh=String(i.location.hash||"");i.location.hash="#/docpro",Qgh==="#/docpro"&&typeof i.Event=="function"&&i.dispatchEvent(new i.Event("hashchange"))}else i.location.href="docpro.html"}catch{}}`, after: String.raw`/* Ciphertext handoff: commit under the source actor before native navigation. */
async function Gr(t,a){
  remSearchDropReturn();
  var transport=i.VildaUiIntents,scope=null,receipt=null;
  try{
    if(!transport||transport.version!==1)throw new Error("Moduł bezpiecznej nawigacji niedostępny. Odśwież stronę.");
    scope=transport.captureCallerScope();
    receipt=await transport.prepare("gh-jump",{patientId:t,ghPointId:String(a),ts:Date.now()},scope);
    if(!receipt.current()){receipt.discardExact();return;}
    var Qgj=!1;try{var Qgs=i.document.documentElement.classList.contains("vilda-embedded"),Qgb=Qgs&&i.parent&&i.parent!==i?i.parent.VildaShell:null;Qgb&&typeof Qgb.navigate=="function"&&(Qgb.navigate("docpro",!0),Qgj=!0)}catch{Qgj=!1}if(!Qgj)try{if(typeof i.refreshGHTherapyMonitor=="function"){var Qgh=String(i.location.hash||"");i.location.hash="#/docpro",Qgj=!0,Qgh==="#/docpro"&&typeof i.Event=="function"&&i.dispatchEvent(new i.Event("hashchange"))}else i.location.href="docpro.html",Qgj=!0}catch{}
    if(!Qgj)receipt.discardExact();
  }catch(error){if(receipt)try{receipt.discardExact()}catch{}if(!scope||scope.isCurrent())pi(error&&error.message||"Nie udało się przekazać zamiaru. Spróbuj ponownie.")}
  finally{if(scope)scope.dispose()}
}
function UiIntentBoundary(detail){try{var transport=i.VildaUiIntents;if(transport&&transport.version===1)transport.onBoundary(detail)}catch{}}
function UiIntentBindSync(){
  try{var sync=i.VildaSync;if(sync&&typeof sync.onSyncStart==="function")sync.onSyncStart(function(detail){if(detail&&detail.operation==="revoke")UiIntentBoundary("revoke")})}catch{}
  try{i.addEventListener("storage",function(event){if(event&&typeof event.key==="string"&&event.key.indexOf("vilda-sync-revoked-v1:")===0)UiIntentBoundary("revoke")})}catch{}
}
` },
  { label: "timeline pending producer", before: String.raw`function gt(f){try{$t()}catch{}function K(){var P=i.document.getElementById("toggleAdvancedGrowth"),L=i.document.getElementById("advancedGrowthSection");if(!P||!L)return!1;var A="";try{A=L.style&&L.style.display||""}catch{}if(A===""||A==="none")try{P.click()}catch{}try{L.scrollIntoView({behavior:"smooth",block:"start"})}catch{}return!0}if(!K()){try{i.sessionStorage&&(f&&i.sessionStorage.setItem("vilda:pendingPatientLoad",f),i.sessionStorage.setItem("vilda:postLoadScroll","advancedGrowth"))}catch{}try{i.location.assign("index.html")}catch{}}}`, after: String.raw`async function gt(f){try{$t()}catch{}function K(){var P=i.document.getElementById("toggleAdvancedGrowth"),L=i.document.getElementById("advancedGrowthSection");if(!P||!L)return!1;var A="";try{A=L.style&&L.style.display||""}catch{}if(A===""||A==="none")try{P.click()}catch{}try{L.scrollIntoView({behavior:"smooth",block:"start"})}catch{}return!0}if(!K()){
  var transport=i.VildaUiIntents,scope=null,receipt=null;
  try{
    if(!transport||transport.version!==1)throw new Error("Moduł bezpiecznej nawigacji niedostępny. Odśwież stronę.");
    scope=transport.captureCallerScope();
    receipt=await transport.prepare("pending-patient-load",{patientId:f},scope);
    if(!receipt.current()){receipt.discardExact();return;}
    i.sessionStorage.setItem("vilda:postLoadScroll","advancedGrowth");
    if(receipt.current())i.location.assign("index.html");else receipt.discardExact();
  }catch(error){if(receipt)try{receipt.discardExact()}catch{}if(!scope||scope.isCurrent())pi(error&&error.message||"Nie udało się przekazać zamiaru. Spróbuj ponownie.")}
  finally{if(scope)scope.dispose()}
}}` },
  { label: "shared secure identifier", before: String.raw`function operationId() { return i.crypto && i.crypto.randomUUID ? i.crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2); }`, after: String.raw`function operationId() {
    var crypto = i.crypto;
    if (crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    if (!crypto || typeof crypto.getRandomValues !== 'function') throw new Error('Bezpieczny generator identyfikatorów jest niedostępny. Odśwież stronę.');
    var bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    var hex = Array.from(bytes, function (byte) { return byte.toString(16).padStart(2, '0'); }).join('');
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
  }` },
  { label: "outcome fail closed before modal", before: String.raw`editing(true); outcomeOrigin = i.document.activeElement;
    var dialog = make('dialog', 'vb22 vb22-outcome'), uid = 'rem-outcome-' + operationId(); outcomeRoot = dialog;`, after: String.raw`editing(true);
    var uid, op;
    try { uid = 'rem-outcome-' + operationId(); op = operationId(); }
    catch (error) { editing(false); report(error, detail); return; }
    outcomeOrigin = i.document.activeElement;
    var dialog = make('dialog', 'vb22 vb22-outcome'); outcomeRoot = dialog;` },
  { label: "outcome reuse preflight operation", before: String.raw`var op = operationId(), signature = null;`, after: String.raw`var signature = null;` },
  { label: "signature secure error", before: String.raw`var sig = JSON.stringify(request); if (signature && signature !== sig) op = operationId(); signature = sig; request.operationId = op;`, after: String.raw`var sig = JSON.stringify(request);
      try { if (signature && signature !== sig) op = operationId(); }
      catch (error) { report(error, body); return; }
      signature = sig; request.operationId = op;` },
  { label: "add preflight once per form", before: String.raw`    var returnToSearch = state.tab === 'search';`, after: String.raw`    var formTitleId, pickerId, noteId;
    try { formTitleId = 'rem-add-title-' + operationId(); pickerId = 'rem-patient-' + operationId(); noteId = 'reminder-' + operationId(); }
    catch (error) { report(error, detail); return; }
    var returnToSearch = state.tab === 'search';` },
  { label: "title preflight", before: String.raw`formTitle.id = 'rem-add-title-' + operationId();`, after: String.raw`formTitle.id = formTitleId;` },
  { label: "picker preflight", before: String.raw`var pickerId = 'rem-patient-' + operationId(), patientStatus`, after: String.raw`var patientStatus` },
  { label: "note preflight", before: String.raw`    var noteId = 'reminder-' + operationId();
`, after: String.raw`    // noteId belongs to this form, including all native retries.
` },
  { label: "lock boundary", before: String.raw`Xi();Bkr_sluchaj();try{jt().onLock(function(a){`, after: String.raw`Xi();Bkr_sluchaj();UiIntentBindSync();try{jt().onLock(function(a){UiIntentBoundary("lock");` },
  { label: "fresh unlock; preserve native restore", before: String.raw`jt().onUnlock(function(a){if(dn=`, after: String.raw`jt().onUnlock(function(a){UiIntentBoundary(a);if(dn=` },
  { label: "credential boundary", before: String.raw`a.onCredentialChanged(function(n){const r=`, after: String.raw`a.onCredentialChanged(function(n){UiIntentBoundary("credential");const r=` },
  { label: "original native pick authority before publication", before: String.raw`function Il(t,a,n){`, after: String.raw`function UiIntentPickAuthority(){
  try{
    var vault=jt(),user=vault&&typeof vault.getCurrentUser==="function"&&vault.getCurrentUser();
    if(!vault||typeof vault.isUnlocked!=="function"||!vault.isUnlocked()||!user||!user.userId
      ||typeof vault.captureSyncOperationSession!=="function"||typeof vault.assertSyncOperationSession!=="function")return null;
    var userId=user.userId,ticket=vault.captureSyncOperationSession(),doc=i.document,frame=i.frameElement||null,host=frame?i.parent:i;
    var hostDoc=host.document,href=String(i.location.href),hostHref=String(host.location.href),navId=(host.history&&host.history.state||{}).shellNavId;
    function current(){
      try{
        var active=jt(),account=active&&active.getCurrentUser();
        if(active!==vault||!active.isUnlocked()||!account||account.userId!==userId||i.document!==doc||doc.hidden===true
          ||(i.frameElement||null)!==frame||host.document!==hostDoc||String(i.location.href)!==href
          ||String(host.location.href)!==hostHref||(host.history&&host.history.state||{}).shellNavId!==navId
          ||frame&&(frame.hidden||frame.isConnected===false))return false;
        vault.assertSyncOperationSession(ticket);return true;
      }catch(_){return false}
    }
    return current()?Object.freeze({isCurrent:current}):null;
  }catch(_){return null}
}
function Il(t,a,n){` },
  { label: "optional native synchronous publication registration", before: String.raw`function ct(Yt,ke,Ne){return patientLoadRun(patientLoad,Yt,function(value){return BdZastosuj(value,t)},function(operationDetail){`, after: String.raw`function ct(Yt,ke,Ne){
  // Only the explicitly opted-in UI handoff receives publication metadata.
  // Default callbacks keep their exact two arguments and return value.
  var afterPublished=null,pickAuthority=null,published=false,registrationOpen=false;
  if(BdZastosuj.uiIntentPublicationVersion===1){
    pickAuthority=UiIntentPickAuthority();if(!pickAuthority)return false;
  }
  return patientLoadRun(patientLoad,Yt,function(value){
    if(pickAuthority){
      registrationOpen=true;
      try{return BdZastosuj(value,t,Object.freeze({version:1,isCurrent:pickAuthority.isCurrent,afterPublished:function(callback){
        if(!registrationOpen||typeof callback!=="function")return false;
        afterPublished=callback;return true;
      }}))}finally{registrationOpen=false}
    }
    return BdZastosuj(value,t);
  },function(operationDetail){` },
  { label: "activate only after original-authorized native publication", before: String.raw`function(operationDetail){try{typeof i.CustomEvent=="function"&&i.document&&i.document.dispatchEvent(new i.CustomEvent("vilda:patient-loaded",{detail:Object.assign({patientId:t,savedAtISO:ke&&ke.savedAtISO||null,snapshotCount:Ne||null,name:Yt&&Yt.name||null,source:"pick"},operationDetail||{})}))}catch{}$t();if(typeof BdPo=="function")try{BdPo()}catch(BdBlad){Ot("BdWczytajPacjenta po wczytaniu",BdBlad)}})}function Lt()`, after: String.raw`function(operationDetail){try{typeof i.CustomEvent=="function"&&i.document&&(i.document.dispatchEvent(new i.CustomEvent("vilda:patient-loaded",{detail:Object.assign({patientId:t,savedAtISO:ke&&ke.savedAtISO||null,snapshotCount:Ne||null,name:Yt&&Yt.name||null,source:"pick"},operationDetail||{})})),published=true)}catch{}
  var activate=afterPublished;afterPublished=null;
  function closeNative(){ $t();if(typeof BdPo=="function")try{BdPo()}catch(BdBlad){Ot("BdWczytajPacjenta po wczytaniu",BdBlad)} }
  if(activate&&published&&pickAuthority&&pickAuthority.isCurrent()){
    // Encrypt while this exact card still owns the native modal. Quietly retire
    // only its own history sentinel once the ready receipt can navigate in the
    // same turn; an unrelated Back remains a normal caller-scope boundary.
    var pickCard=Eo,pickRoot=Rt,pickHistory=Pa,closeClaimed=false;
    var closeForNavigation=function(){
      if(closeClaimed||!pickAuthority.isCurrent()||Eo!==pickCard||!pickCard||!pickCard.isConnected
        ||Rt!==pickRoot||!pickRoot||!pickRoot.contains(pickCard)||Pa!==pickHistory||!!ye!==!!ba())return false;
      closeClaimed=true;Qn({quiet:true});closeNative();return true;
    };
    try{activate(closeForNavigation)}catch(error){Ot("patient navigation after publication",error)}
  }else closeNative();
})}function Lt()` },
]
export function applyUiIntentAuthHooks(source) {
  for (const pair of UI_INTENT_AUTH_PAIRS) {
    if (source.includes(pair.after)) continue;
    if (source.split(pair.before).length !== 2) throw new Error('Ambiguous Auth security anchor: ' + pair.label);
    source = source.replace(pair.before, pair.after);
  }
  return source;
}
export function reverseUiIntentAuthHooks(source) {
  for (const pair of [...UI_INTENT_AUTH_PAIRS].reverse()) {
    if (source.split(pair.after).length !== 2) throw new Error('Missing Auth security delta: ' + pair.label);
    source = source.replace(pair.after, pair.before);
  }
  return source;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const target = fileURLToPath(new URL('../vilda_auth_ui.js', import.meta.url));
  const source = readFileSync(target, 'utf8'), result = applyUiIntentAuthHooks(source);
  const baseline = reverseUiIntentAuthHooks(result);
  if (createHash('sha256').update(baseline.includes('/* BEGIN ACCOUNT DUPLICATE DISMISSALS V2') ? reverseBscAuthHooks(baseline) : baseline).digest('hex') !== UI_INTENT_AUTH_BASE_SHA256) throw new Error('Native/Home Auth base differs outside the explicit security delta');
  if (applyUiIntentAuthHooks(baseline) !== result) throw new Error('Auth security replay differs');
  if (process.argv.includes('--write')) writeFileSync(target, result);
  else if (source !== result) throw new Error('Auth security hooks need regeneration');
}
