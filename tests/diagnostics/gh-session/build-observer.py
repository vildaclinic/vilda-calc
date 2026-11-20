from pathlib import Path
import hashlib,json,difflib
import sys
root=Path(sys.argv[1]).resolve();output=Path(sys.argv[2]).resolve();output.mkdir(parents=True,exist_ok=True)
p=root/'vilda_data_import_export.js';original=p.read_text();source=original;changes=[]
assert hashlib.sha256(p.read_bytes()).hexdigest()=='0e805e7f0a95103176e3d46d30a3f747a6f16eef9fb7d81ee4893c6d60667c0c','Original native source drift'

hook='''// EXTERNAL DIAGNOSTIC PROPOSAL ONLY. Never ship or use with real patients.
// Logging is opt-in, bounded, RAM-only, and does not call an authority guard.
function ghWriterObservation(stage,detail){
  try{
    if(r.__vildaGhWriterObservationEnabled!==true)return;
    const list=r.__vildaGhWriterObservationEntries||(r.__vildaGhWriterObservationEntries=[]);
    if(list.length>=200)return;
    list.push({stage:stage,at:Date.now(),detail:JSON.parse(JSON.stringify(detail))});
  }catch(_){}
}
function ghWriterObservationScope(scope){
  return scope?{ownerId:scope.ownerId,patientId:scope.patientId,applySequence:scope.applySequence,generation:scope.generation}:null;
}
function ghWriterObservationCarry(witness){
  return witness?{kind:witness.kind,payloadJSON:witness.payloadJSON,appliedPayloadJSON:witness.appliedPayloadJSON,
    scope:ghWriterObservationScope(witness.scope),authority:witness.authority?{sequence:witness.authority.sequence,
      generation:witness.authority.generation,scoped:witness.authority.scoped}:null}:null;
}
'''
assert 'ghWriterObservation' not in original
anchor='function prepareNativeSaveCarry(current,scope,mainWriteFence){';assert source.count(anchor)==1;source=source.replace(anchor,hook+anchor);changes.append({'label':'insert-diagnostic-only-helpers','old':anchor,'new':hook+anchor})
def replace(label,old,new,count=1):
 global source
 assert source.count(old)==count,(label,source.count(old))
 source=source.replace(old,new)
 changes.append({'label':label,'old':old,'new':new,'count':count})
replace('carry-read-existing-locals','    const base=adapter&&typeof adapter.readMainSession==="function"?adapter.readMainSession():null;\n    if(currentBeforeRead', '    const base=adapter&&typeof adapter.readMainSession==="function"?adapter.readMainSession():null;\n    ghWriterObservation("carry.read",{current:current,base:base,currentBeforeRead:currentBeforeRead,sameAdapter:!!witness&&witness.adapter===adapter,scope:ghWriterObservationScope(scope),witness:ghWriterObservationCarry(witness)});\n    if(currentBeforeRead')
replace('carry-fast-witness-refusal','      if(!nativeSaveCarryCurrent(witness,scope,adapter))return false;','      if(!nativeSaveCarryCurrent(witness,scope,adapter)){ghWriterObservation("carry.fast-witness-refused",{current:current,projected:projected});return false;}',2)
replace('carry-fast-base-change','      if(JSON.stringify(adapter.readMainSession())!==witness.payloadJSON)return false;','      if(JSON.stringify(adapter.readMainSession())!==witness.payloadJSON){ghWriterObservation("carry.fast-base-changed",{current:current,projected:projected,witness:ghWriterObservationCarry(witness)});return false;}')
replace('carry-fast-accepted','      Object.keys(current).forEach(function(key){delete current[key]});','      ghWriterObservation("carry.fast-accepted",{current:current,projected:projected});\n      Object.keys(current).forEach(function(key){delete current[key]});')
replace('carry-candidate-refusal','      if(JSON.stringify(projected)!==JSON.stringify(current))return false;','      if(JSON.stringify(projected)!==JSON.stringify(current)){ghWriterObservation("carry.candidate-refused",{current:current,projected:projected,candidate:candidate,candidateKind:candidate===base?"main-session":"last-loaded"});return false;}')
replace('carry-scope-result','    const currentScope=saveReceiptScopeCurrent(scope);\n    if(currentScope&&mainWriteFence)','    const currentScope=saveReceiptScopeCurrent(scope);\n    ghWriterObservation("carry.fallback-scope",{currentScope:currentScope,scope:ghWriterObservationScope(scope)});\n    if(currentScope&&mainWriteFence)')
replace('carry-catch','  }catch(_){return false}\n}\nfunction nativeMainCarryFenceCurrent','  }catch(_){ghWriterObservation("carry.exception",{});return false}\n}\nfunction nativeMainCarryFenceCurrent')
replace('fence-scope-refusal','    if(fence.adapter!==adapter||Z()!==adapter||!saveReceiptScopeCurrent(scope)||fence.witness&&!nativeSaveCarryCurrent(fence.witness,scope,adapter))return false;','    if(fence.adapter!==adapter||Z()!==adapter||!saveReceiptScopeCurrent(scope)||fence.witness&&!nativeSaveCarryCurrent(fence.witness,scope,adapter)){ghWriterObservation("fence.scope-refused",{scope:ghWriterObservationScope(scope),witness:ghWriterObservationCarry(fence.witness)});return false;}')
replace('fence-unchanged-observation','    const unchanged=JSON.stringify(adapter.readMainSession())===fence.payloadJSON;','    const unchanged=JSON.stringify(adapter.readMainSession())===fence.payloadJSON;\n    ghWriterObservation("fence.base",{unchanged:unchanged,expectedJSON:fence.payloadJSON,scope:ghWriterObservationScope(scope)});')
# oe is isolated before replacing repeated generic guard text.
a=source.index('function oe(e,scheduledAuthority,origin,acceptedOperation){');b=source.index('/* P-SESJA-OBCA',a);oldoe=source[a:b];oe=oldoe;oechanges=[]
def oe_replace(label,old,new,count=1):
 global oe
 assert oe.count(old)==count,(label,oe.count(old));oe=oe.replace(old,new);oechanges.append({'label':label,'old':old,'new':new,'count':count})
oe_replace('pending-load','if(pendingAcceptedPatientLoad&&acceptedOperation!==pendingAcceptedPatientLoad)return!1;','if(pendingAcceptedPatientLoad&&acceptedOperation!==pendingAcceptedPatientLoad){ghWriterObservation("oe.pending-load-refused",{});return!1;}')
oe_replace('authority','if(!mainSessionWriteAuthorityCurrent(authority))return!1;','if(!mainSessionWriteAuthorityCurrent(authority)){ghWriterObservation("oe.authority-refused",{authorityPresent:!!authority,authority:authority?{sequence:authority.sequence,generation:authority.generation,scoped:authority.scoped}:null,sequence:vildaApplyLoadedDataSequence,generation:saveScopeGeneration});return!1;}',2)
oe_replace('precondition','if(!ge(t)||Gp_r(t)||Gp_k(t)||!a&&Be(t))return!1;','if(!ge(t)||Gp_r(t)||Gp_k(t)||!a&&Be(t)){ghWriterObservation("oe.preconditions-refused",{restoreAttempted:Ke,restoring:ve,optionRestore:t.restoreInProgress,force:a});return!1;}')
oe_replace('collector','collectedSequence=nativeUserDataCaptureSequence;','collectedSequence=nativeUserDataCaptureSequence;ghWriterObservation("oe.collected",{payload:n,captureSequence:captureSequence,collectedSequence:collectedSequence,scope:ghWriterObservationScope(saveScope),witness:ghWriterObservationCarry(nativeSaveCarryWitness)});')
oe_replace('empty','if(!Re(n))return a?!1:(re(t),!1);','if(!Re(n)){ghWriterObservation("oe.empty",{payload:n,force:a});return a?!1:(re(t),!1);}')
oe_replace('accepted-adapter','if(acceptedWrite&&i!==acceptedOperation.adapter)return!1;','if(acceptedWrite&&i!==acceptedOperation.adapter){ghWriterObservation("oe.accepted-adapter-refused",{});return!1;}')
oe_replace('accepted-carry','if(acceptedNative&&!prepareAcceptedPatientLoadCarry(n,acceptedOperation))return!1;','if(acceptedNative&&!prepareAcceptedPatientLoadCarry(n,acceptedOperation)){ghWriterObservation("oe.accepted-carry-refused",{payload:n});return!1;}')
oe_replace('native-carry','nativeMainFence={};if(!prepareNativeSaveCarry(n,saveScope,nativeMainFence))return!1;','nativeMainFence={};if(!prepareNativeSaveCarry(n,saveScope,nativeMainFence)){ghWriterObservation("oe.native-carry-refused",{payload:n,scope:ghWriterObservationScope(saveScope)});return!1;}')
oe_replace('final-fence','if(!mainSessionWriteAuthorityCurrent(authority)||acceptedWrite&&!acceptedPatientLoadContextCurrent(acceptedOperation,true)||nativeMainFence&&!nativeMainCarryFenceCurrent(nativeMainFence,saveScope,i))return!1;','if(!mainSessionWriteAuthorityCurrent(authority)||acceptedWrite&&!acceptedPatientLoadContextCurrent(acceptedOperation,true)||nativeMainFence&&!nativeMainCarryFenceCurrent(nativeMainFence,saveScope,i)){ghWriterObservation("oe.final-fence-refused",{payload:n,scope:ghWriterObservationScope(saveScope)});return!1;}')
oe_replace('adapter-result','const w=!!i.writeMainSession(n);','const w=!!i.writeMainSession(n);ghWriterObservation("oe.adapter-result",{written:w,payload:n});')
oe_replace('catch','}catch(o){l("vilda_data_import_export:saveMainSessionNow",o)}return!1}', '}catch(o){ghWriterObservation("oe.exception",{});l("vilda_data_import_export:saveMainSessionNow",o)}ghWriterObservation("oe.fallthrough",{});return!1}')
source=source[:a]+oe+source[b:];changes.append({'label':'instrument-exact-oe','old':oldoe,'new':oe,'details':oechanges})
reversed_source=source
for c in reversed(changes):
 assert reversed_source.count(c['new'])==c.get('count',1),c['label']
 reversed_source=reversed_source.replace(c['new'],c['old'])
assert reversed_source==original
out=output/'observer.js';out.write_text(source)
assert hashlib.sha256(out.read_bytes()).hexdigest()=='6161d3c8ef3d03ca1defb209dc94be0e90f88045763c93d130d60a77d4596359','Approved observer drift'
diff=''.join(difflib.unified_diff(original.splitlines(True),source.splitlines(True),fromfile='native-be8/vilda_data_import_export.js',tofile='DIAGNOSTIC-ONLY/vilda_data_import_export.js'))
(output/'observer.diff').write_text(diff)
proof={'kind':'GENERATED_EXACT_APPROVED_OBSERVER_DIAGNOSTIC_ONLY_NOT_APP_FIX','sourceSHA256':hashlib.sha256(p.read_bytes()).hexdigest(),'observerSHA256':hashlib.sha256(out.read_bytes()).hexdigest(),'reverseByteIdentity':reversed_source==original,'addedHelpers':['ghWriterObservation','ghWriterObservationScope','ghWriterObservationCarry'],'standaloneObservationCalls':23,'browserRuns':0,'nativeFileChanged':False}
(output/'observer-generation.json').write_text(json.dumps(proof,indent=2)+'\n')
print(json.dumps(proof))
