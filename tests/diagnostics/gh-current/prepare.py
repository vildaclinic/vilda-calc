#!/usr/bin/env python3
"""External/CI only: exact e3d2 Data diagnostics. Never import in the app."""
from pathlib import Path
import sys, json, hashlib, subprocess, os, difflib
MODE, ROOT, OUT = sys.argv[1], Path(sys.argv[2]).resolve(), Path(sys.argv[3]).resolve()
assert MODE in ('preview', 'prepare', 'restore')
assert not OUT.is_relative_to(ROOT), 'Evidence must stay outside checkout'
PINS = {'vilda_data_import_export.js':'d3bf8576a73eeccc3e2d408c17ddccb9da2c02b8815bfe2262d3b98a38296f3b','tests/e2e/home-workspace-growth.spec.mjs':'f28ccb96b98333d4f599e7065c2585b60c87b964d8f1dc945aa735e3f111f9c5','vilda_panel_pacjent.js':'703c0fed15df985a3fd0716af17b5abb15527f82f080c1cbb2926ce4118e1f9f','vilda_shell.js':'ccf65a4aea81f53478f71722115db9cbbdb5efe3e1fc1c223426c2446a0798f2','playwright.lab-chart-webkit.config.mjs':'9d246f863550469727c6b69e8378259a15eeb75535960d7887bfed74d74d55a4'}
TARGETS = list(PINS)[:2]
sha=lambda b:hashlib.sha256(b).hexdigest()
def git(*args):return subprocess.check_output(['git',*args],cwd=ROOT,text=True).strip()
def store(name,value): (OUT/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
if MODE=='restore':
 state=json.loads((OUT/'state.json').read_text())
 changed=git('diff','--name-only').splitlines()
 assert set(changed)<=set(TARGETS), f'Unexpected tracked mutation: {changed}'
 for name in TARGETS:
  path=ROOT/name; item=state[name]
  assert sha(path.read_bytes()) in [item['originalSHA256'],item['instrumentedSHA256']],name
  original=(OUT/(path.name+'.original')).read_bytes()
  assert sha(original)==PINS[name];path.write_bytes(original)
 for name,expected in PINS.items():assert sha((ROOT/name).read_bytes())==expected,name
 assert git('status','--porcelain','--untracked-files=no')==''
 store('restoration-proof.json',{'exactOriginalTargetsRestored':True,'allFivePinsMatch':True,'trackedTreeClean':True})
 print('Restored exact e3d2 source/test; untouched Panel/Shell/config pins match');sys.exit()
assert not OUT.exists(), 'Use a fresh evidence directory'
OUT.mkdir(parents=True,mode=0o700)
for name,expected in PINS.items():assert sha((ROOT/name).read_bytes())==expected, name
if MODE=='prepare':
 assert os.environ.get('CI')=='true' and os.environ.get('GITHUB_REF')=='refs/heads/agent/diagnostyka-gh-zapis'
 assert os.environ.get('GITHUB_EVENT_NAME')=='push'
 assert git('status','--porcelain','--untracked-files=no')==''
 subprocess.check_call(['git','merge-base','--is-ancestor','e3d21685','HEAD'],cwd=ROOT)
data=(ROOT/TARGETS[0]).read_text(); spec=(ROOT/TARGETS[1]).read_text();originalData=data;originalSpec=spec;edits=[]
def replace(old,new,label):
 global data
 assert data.count(old)==1,(label,data.count(old))
 data=data.replace(old,new,1);edits.append({'label':label,'old':old,'new':new})
def function(name,nextname):
 a=data.index('function '+name+'(');b=data.index('function '+nextname+'(',a)
 return data[a:b]
helper='''// CI-only diagnostic: late opt-in, first failure per stage, bounded RAM, no payload/token output.
function __ghCurrentFalse(stage,leaf,threw,detail){
  try{
    if(r.__vildaGhCurrentEnabled!==true)return;
    const entries=r.__vildaGhCurrentEntries||(r.__vildaGhCurrentEntries=[]);
    if(entries.length>=16||entries.some(function(entry){return entry.stage===stage}))return;
    const frames=String(new Error().stack||"").split("\\n").slice(1,7).map(function(frame){return frame.replace(/https?:\\/\\/[^/]+/g,"<origin>")});
    entries.push({stage:stage,leaf:leaf,threw:threw,frames:frames,comparison:detail?detail():null});
  }catch(_){}
}
'''
old=function('saveReceiptScopeCurrent','rememberNativeSaveCarry')
body=old[:old.index('// A carried section')]
new='''function saveReceiptScopeCurrent(scope,result){
  let __ghLeaf="scope-present";
  try{
    if((__ghLeaf="scope-present",!scope)||(__ghLeaf="scope-generation",scope.generation!==saveScopeGeneration)||(__ghLeaf="vault-object",r.VildaVault!==scope.vault)||(__ghLeaf="vault-unlocked",!scope.vault.isUnlocked())||(__ghLeaf="apply-sequence",vildaApplyLoadedDataSequence!==scope.applySequence)||(__ghLeaf="panel-stale",mainSessionPanelIsStale())){__ghCurrentFalse("scope-current",__ghLeaf,false);return false;}
    __ghLeaf="current-user-read";const user=scope.vault.getCurrentUser();
    if((__ghLeaf="owner-present",!user)||(__ghLeaf="owner-id",user.userId!==scope.ownerId)){__ghCurrentFalse("scope-current",__ghLeaf,false);return false;}
    __ghLeaf="vault-token-assert";scope.vault.assertSyncOperationSession(scope.token);
    __ghLeaf="patient-id-read";const patientId=mainSessionPatientId();
    const __ghAllowed=(__ghLeaf="same-patient",patientId===scope.patientId)||!!((__ghLeaf="save-result-present",result)&&(__ghLeaf="saved-patient-present",result.patientId)&&(__ghLeaf="same-saved-patient",patientId===result.patientId));
    if(!__ghAllowed)__ghCurrentFalse("scope-current",__ghLeaf,false);return __ghAllowed;
  }catch(_){__ghCurrentFalse("scope-current",__ghLeaf,true);return false}
}
'''
replace(body,new,'scope-first-original-false-leaf')
old=function('nativeSaveCarryCurrent','captureOwnRejectedSaveCarry')
body=old[:old.index('// Only the actual queued')]
new='''function nativeSaveCarryCurrent(witness,scope,adapter){
  let __ghLeaf="witness-present",__ghAllowed;
  try{
    __ghAllowed=!!((__ghLeaf="witness-present",witness)&&(__ghLeaf="witness-reference",witness===nativeSaveCarryWitness)&&(__ghLeaf="adapter-reference",witness.adapter===adapter)&&(__ghLeaf="current-scope",saveReceiptScopeCurrent(scope))&&(__ghLeaf="witness-scope",saveReceiptScopeCurrent(witness.scope))&&(__ghLeaf="witness-authority",mainSessionWriteAuthorityCurrent(witness.authority)));
  }catch(error){__ghCurrentFalse("carry-current",__ghLeaf,true);throw error}
  if(!__ghAllowed)__ghCurrentFalse("carry-current",__ghLeaf,false);return __ghAllowed;
}
'''
replace(body,new,'carry-first-original-false-leaf')
old=function('mainSessionWriteAuthorityCurrent','oe')
body=old[:old.index('// Only the internal')]
new='''function mainSessionWriteAuthorityCurrent(authority){
  let __ghLeaf="authority-present";
  try{
    if((__ghLeaf="authority-present",!authority)||(__ghLeaf="apply-sequence",authority.sequence!==vildaApplyLoadedDataSequence)||(__ghLeaf="save-generation",authority.generation!==saveScopeGeneration)||(__ghLeaf="panel-stale",mainSessionPanelIsStale())){__ghCurrentFalse("authority-current",__ghLeaf,false);return false;}
    const __ghAllowed=(__ghLeaf="unscoped",!authority.scoped)||(__ghLeaf="panel-object",r.VildaPanelPacjent===authority.panel)&&(__ghLeaf="original-panel-ticket",authority.panel.isWriteAuthorityCurrent(authority.ticket));
    if(!__ghAllowed)__ghCurrentFalse("authority-current",__ghLeaf,false);return __ghAllowed;
  }catch(_){__ghCurrentFalse("authority-current",__ghLeaf,true);return false}
}
'''
replace(body,new,'authority-first-original-false-leaf')
replace('function prepareNativeSaveCarry(current,scope,mainWriteFence){',helper+'function prepareNativeSaveCarry(current,scope,mainWriteFence){','diagnostic-helper')
old='nativeMainFence={};if(!prepareNativeSaveCarry(n,saveScope,nativeMainFence))return!1;'
new='''nativeMainFence={};if(!prepareNativeSaveCarry(n,saveScope,nativeMainFence)){
__ghCurrentFalse("oe-native-carry","prepare-returned-false",false,function(){
  const witness=nativeSaveCarryWitness,previous=witness&&witness.authority,oldScope=witness&&witness.scope;
  const ticket=authority&&authority.ticket,oldTicket=previous&&previous.ticket;
  const source=ticket&&ticket.source,oldSource=oldTicket&&oldTicket.source;
  const account=ticket&&ticket.account,oldAccount=oldTicket&&oldTicket.account;
  return {witnessPresent:!!witness,scopePresent:!!saveScope,oldScopePresent:!!oldScope,
    adapterSame:witness?i===witness.adapter:null,vaultSame:saveScope&&oldScope?saveScope.vault===oldScope.vault:null,
    ownerSame:saveScope&&oldScope?saveScope.ownerId===oldScope.ownerId:null,patientSame:saveScope&&oldScope?saveScope.patientId===oldScope.patientId:null,
    applySequenceSame:saveScope&&oldScope?saveScope.applySequence===oldScope.applySequence:null,saveGenerationSame:saveScope&&oldScope?saveScope.generation===oldScope.generation:null,
    panelSame:previous?authority.panel===previous.panel:null,ticketAvailable:!!(ticket&&oldTicket),
    ticketGenerationSame:ticket&&oldTicket?ticket.generation===oldTicket.generation:null,ticketSequenceSame:ticket&&oldTicket?ticket.sequence===oldTicket.sequence:null,
    ticketPatientSame:ticket&&oldTicket?ticket.patientId===oldTicket.patientId:null,ticketShellSame:ticket&&oldTicket?ticket.shell===oldTicket.shell:null,
    accountVaultSame:account&&oldAccount?account.vault===oldAccount.vault:null,accountOwnerSame:account&&oldAccount?account.userId===oldAccount.userId:null,
    accountUnlockedSame:account&&oldAccount?account.unlocked===oldAccount.unlocked:null,accountGuestSame:account&&oldAccount?account.guest===oldAccount.guest:null,
    shellSourceAvailable:!!(source&&oldSource),shellRouteSame:source&&oldSource?source.route===oldSource.route:null,
    shellEntrySame:source&&oldSource?source.entry===oldSource.entry:null,shellFrameSame:source&&oldSource?source.frame===oldSource.frame:null,
    shellWindowSame:source&&oldSource?source.win===oldSource.win:null,shellDocumentSame:source&&oldSource?source.doc===oldSource.doc:null,
    shellGenerationSame:source&&oldSource?source.generation===oldSource.generation:null,shellEpochSame:source&&oldSource?source.epoch===oldSource.epoch:null,
    currentShellGeneration:source?source.generation:null,oldShellGeneration:oldSource?oldSource.generation:null,currentShellEpoch:source?source.epoch:null,oldShellEpoch:oldSource?oldSource.epoch:null};
});return!1;}'''
replace(old,new,'existing-oe-carry-refusal-captured-context-only')
# Preserve every original module byte after reversing the five bounded transformations.
reverse=data
for e in reversed(edits):assert reverse.count(e['new'])==1;reverse=reverse.replace(e['new'],e['old'],1)
assert reverse==originalData
header="import { writeFileSync as __ghWrite } from 'node:fs';\nimport { join as __ghJoin } from 'node:path';\nimport { createHash as __ghHash } from 'node:crypto';\n"
harvest='''
// CI-only observation after original failure or after actual durable ACK; no payload/token export.
async function __ghHarvest(page,info,phase){
  const frame=page.frames().find(frame=>{try{return new URL(frame.url()).pathname==='/index.html'}catch{return false}});
  if(!frame)return;
  const value=await frame.evaluate(()=>{
    const user=window.VildaVault?.getCurrentUser();
    if(user?.label!=='Fikcyjny sejf testu panelu siatek')return {fictionalAccount:false};
    return {fictionalAccount:true,enabled:window.__vildaGhCurrentEnabled===true,entries:window.__vildaGhCurrentEntries||[],writerSource:Function.prototype.toString.call(window.VildaDataImportExport.saveMainSessionNow)};
  });
  if(!value.fictionalAccount)throw Error('Expected fictional diagnostic account');
  const source=value.writerSource;delete value.writerSource;
  const evidence={phase,repeatEachIndex:info.repeatEachIndex,retry:info.retry,status:info.status,...value,writerSourceSHA256:__ghHash('sha256').update(source).digest('hex')};
  __ghWrite(__ghJoin(process.env.RUNNER_TEMP,'gh-current-diag','repeat'+info.repeatEachIndex+'-retry'+info.retry+'-'+phase+'.json'),JSON.stringify(evidence,null,2)+'\\n');
  await info.attach('gh-current-private-leaf-'+phase,{body:JSON.stringify(evidence),contentType:'application/json'});
}
test.afterEach(async({page},info)=>{try{await __ghHarvest(page,info,'after-each')}catch(error){__ghWrite(__ghJoin(process.env.RUNNER_TEMP,'gh-current-diag','harvest-error-'+info.repeatEachIndex+'.txt'),String(error.message||error))}});
'''
enable='''      window.__vildaGhCurrentEntries = [];
      window.__vildaGhCurrentEnabled = true;
'''
anchor='      window.__ghSessionAtPortalReturn = null;'
assert spec.count(anchor)==1
spec=spec.replace(anchor,enable+anchor,1)
anchor="    await expect.poll(() => frame.evaluate(patient => VildaVault.getPatient(patient).then(row => row.snapshots[0].payload.ghTherapyPoints), id)).toEqual(points);\n    await page.reload({ waitUntil: 'load' }); const restored = await shellFrame(page); await readyForPatient(restored);"
assert spec.count(anchor)==1
replacement=anchor.replace('\n    await page.reload',"\n    await __ghHarvest(page, test.info(), 'before-original-F5');\n    await page.reload")
spec=header+spec.replace(anchor,replacement,1)+harvest
reverse=spec[len(header):-len(harvest)].replace(replacement,anchor,1).replace(enable,'',1)
assert reverse==originalSpec
state={}
for name,original,modified in [(TARGETS[0],originalData,data),(TARGETS[1],originalSpec,spec)]:
 path=ROOT/name;state[name]={'originalSHA256':sha(original.encode()),'instrumentedSHA256':sha(modified.encode())}
 (OUT/(path.name+'.original')).write_text(original);(OUT/(path.name+'.instrumented')).write_text(modified)
 (OUT/(path.name+'.diff')).write_text(''.join(difflib.unified_diff(original.splitlines(True),modified.splitlines(True),fromfile='e3d2/'+name,tofile='CI-only/'+name)))
 if MODE=='prepare':path.write_text(modified)
store('state.json',state);store('reversal.json',edits)
store('proof.json',{'base':'e3d21685','mode':MODE,'exactWholeSourceAndTestReversal':True,'originalAssertionsAndActionsByteExactAfterRemovingOnlyDiagnosticInsertions':True,'panelShellAndWebKitConfigUntouched':True,'sourcePins':PINS,'testCriticalPreclickRoundtripsUnchanged':True,'lateGate':'__vildaGhCurrentEnabled','scope':'Fictional original GH390 only; no payload/token/account identifiers exported','guardSemantics':'Every original short-circuit operand/native API call remains once and in original order. Local labels/allowed value and post-false logger are added; carry exception is rethrown unchanged. No guard replay, newest authority capture or repair write.','bounds':'Diagnostic parse/JIT/function shape/label assignments/logging may alter timing. A pass or absent entry proves no fix. No branch/runtime/Git operation is done by preview.'})
print(json.dumps({'mode':MODE,'state':state,'output':str(OUT),'exactReverse':True}))
