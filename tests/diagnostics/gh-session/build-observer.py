from pathlib import Path
import hashlib
import json
import difflib
import sys

OUT = Path(sys.argv[2]).resolve()
NATIVE = Path(sys.argv[1]).resolve() / 'vilda_data_import_export.js'
EXPECTED_NATIVE_SHA256 = '0e805e7f0a95103176e3d46d30a3f747a6f16eef9fb7d81ee4893c6d60667c0c'
EXPECTED_NATIVE_AST_SHA256 = '78e8ac32a235245dae0089439c2b992755fc79d6a414192c6cd381c5dd9ad33b'
original_bytes = NATIVE.read_bytes()
assert hashlib.sha256(original_bytes).hexdigest() == EXPECTED_NATIVE_SHA256
original = original_bytes.decode('utf-8')
source = original
changes = []

helpers = '''// EXTERNAL REFUSAL-ONLY DIAGNOSTIC PROPOSAL. Never ship or use with real patients.
// No helper runs on a successful write. Opt-in, max 200 entries, browser RAM only.
function ghWriterObservation(stage,detail){
  try{
    if(r.__vildaGhWriterObservationEnabled!==true)return;
    const list=r.__vildaGhWriterObservationEntries||(r.__vildaGhWriterObservationEntries=[]);
    if(list.length>=200)return;
    list.push({stage:stage,at:Date.now(),detail:JSON.parse(JSON.stringify(detail()))});
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

def replace(label, old, new, count=1):
    global source
    assert source.count(old) == count, (label, source.count(old), count)
    source = source.replace(old, new)
    changes.append({'label': label, 'old': old, 'new': new, 'count': count})

def observe(stage, detail='{}'):
    # The thunk runs only inside the observer's try/catch, after opt-in/cap checks.
    return 'ghWriterObservation(' + json.dumps(stage) + ',function(){return ' + detail + ';});'

anchor = 'function prepareNativeSaveCarry(current,scope,mainWriteFence){'
replace('insert-three-diagnostic-helper-declarations', anchor, helpers + anchor)
replace('carry-fast-witness-refusal-before-second-read',
    '      if(!nativeSaveCarryCurrent(witness,scope,adapter))return false;\n      // An adapter',
    '      if(!nativeSaveCarryCurrent(witness,scope,adapter)){' + observe('carry.fast-witness-before-read-refused', '{current:current,projected:projected,base:base,scope:ghWriterObservationScope(scope),witness:ghWriterObservationCarry(witness)}') + 'return false;}\n      // An adapter')
replace('carry-fast-existing-read-comparison-refusal',
    '      if(JSON.stringify(adapter.readMainSession())!==witness.payloadJSON)return false;',
    '      if(JSON.stringify(adapter.readMainSession())!==witness.payloadJSON){' + observe('carry.fast-base-changed', '{current:current,projected:projected,baseFromEarlierRead:base,scope:ghWriterObservationScope(scope),witness:ghWriterObservationCarry(witness)}') + 'return false;}')
replace('carry-fast-witness-refusal-after-second-read',
    '      if(!nativeSaveCarryCurrent(witness,scope,adapter))return false;\n      Object.keys(current)',
    '      if(!nativeSaveCarryCurrent(witness,scope,adapter)){' + observe('carry.fast-witness-after-read-refused', '{current:current,projected:projected,baseFromEarlierRead:base,scope:ghWriterObservationScope(scope),witness:ghWriterObservationCarry(witness)}') + 'return false;}\n      Object.keys(current)')
replace('carry-candidate-refusal',
    '      if(JSON.stringify(projected)!==JSON.stringify(current))return false;',
    '      if(JSON.stringify(projected)!==JSON.stringify(current)){' + observe('carry.candidate-refused', '{current:current,projected:projected,candidate:candidate,candidateKind:candidate===base?"main-session":"last-loaded",scope:ghWriterObservationScope(scope),witness:ghWriterObservationCarry(witness)}') + 'return false;}')
replace('carry-terminal-catch',
    '  }catch(_){return false}\n}\nfunction nativeMainCarryFenceCurrent',
    '  }catch(_){' + observe('carry.exception') + 'return false}\n}\nfunction nativeMainCarryFenceCurrent')
replace('fence-initial-compound-refusal',
    '    if(fence.adapter!==adapter||Z()!==adapter||!saveReceiptScopeCurrent(scope)||fence.witness&&!nativeSaveCarryCurrent(fence.witness,scope,adapter))return false;',
    '    if(fence.adapter!==adapter||Z()!==adapter||!saveReceiptScopeCurrent(scope)||fence.witness&&!nativeSaveCarryCurrent(fence.witness,scope,adapter)){' + observe('fence.initial-group-refused', '{scope:ghWriterObservationScope(scope),expectedJSON:fence.payloadJSON,witness:ghWriterObservationCarry(fence.witness)}') + 'return false;}')
replace('fence-terminal-catch',
    '    return unchanged&&Z()===adapter&&saveReceiptScopeCurrent(scope)&&(!fence.witness||nativeSaveCarryCurrent(fence.witness,scope,adapter));\n  }catch(_){return false}',
    '    return unchanged&&Z()===adapter&&saveReceiptScopeCurrent(scope)&&(!fence.witness||nativeSaveCarryCurrent(fence.witness,scope,adapter));\n  }catch(_){' + observe('fence.exception') + 'return false}')

# Isolate the exact ordinary writer; generic guard anchors must not touch other functions.
a = source.index('function oe(e,scheduledAuthority,origin,acceptedOperation){')
b = source.index('/* P-SESJA-OBCA', a)
old_oe = source[a:b]
oe = old_oe
oe_changes = []

def oe_replace(label, old, new, count=1):
    global oe
    assert oe.count(old) == count, (label, oe.count(old), count)
    oe = oe.replace(old, new)
    oe_changes.append({'label': label, 'old': old, 'new': new, 'count': count})

authority_detail = '{authorityPresent:!!authority,authority:authority?{sequence:authority.sequence,generation:authority.generation,scoped:authority.scoped}:null,sequence:vildaApplyLoadedDataSequence,generation:saveScopeGeneration}'
oe_replace('pending-accepted-load-refusal',
    'if(pendingAcceptedPatientLoad&&acceptedOperation!==pendingAcceptedPatientLoad)return!1;',
    'if(pendingAcceptedPatientLoad&&acceptedOperation!==pendingAcceptedPatientLoad){' + observe('oe.pending-load-refused') + 'return!1;}')
oe_replace('initial-authority-refusal',
    'if(!mainSessionWriteAuthorityCurrent(authority))return!1;if(!ge(t)',
    'if(!mainSessionWriteAuthorityCurrent(authority)){' + observe('oe.initial-authority-refused', authority_detail) + 'return!1;}if(!ge(t)')
oe_replace('preconditions-compound-refusal',
    'if(!ge(t)||Gp_r(t)||Gp_k(t)||!a&&Be(t))return!1;',
    'if(!ge(t)||Gp_r(t)||Gp_k(t)||!a&&Be(t)){' + observe('oe.preconditions-group-refused', '{restoreAttempted:Ke,restoring:ve,optionRestore:t&&t.restoreInProgress,force:a}') + 'return!1;}')
oe_replace('authority-refusal-after-native-collection',
    'if(!mainSessionWriteAuthorityCurrent(authority))return!1;',
    'if(!mainSessionWriteAuthorityCurrent(authority)){' + observe('oe.collected-authority-refused', authority_detail) + 'return!1;}')
oe_replace('empty-data-refusal',
    'if(!Re(n))return a?!1:(re(t),!1);',
    'if(!Re(n)){' + observe('oe.empty-refused', '{payload:n,force:a}') + 'return a?!1:(re(t),!1);}')
oe_replace('accepted-adapter-refusal',
    'if(acceptedWrite&&i!==acceptedOperation.adapter)return!1;',
    'if(acceptedWrite&&i!==acceptedOperation.adapter){' + observe('oe.accepted-adapter-refused') + 'return!1;}')
oe_replace('accepted-carry-refusal',
    'if(acceptedNative&&!prepareAcceptedPatientLoadCarry(n,acceptedOperation))return!1;',
    'if(acceptedNative&&!prepareAcceptedPatientLoadCarry(n,acceptedOperation)){' + observe('oe.accepted-carry-refused', '{payload:n}') + 'return!1;}')
oe_replace('native-carry-refusal',
    'nativeMainFence={};if(!prepareNativeSaveCarry(n,saveScope,nativeMainFence))return!1;',
    'nativeMainFence={};if(!prepareNativeSaveCarry(n,saveScope,nativeMainFence)){' + observe('oe.native-carry-refused', '{payload:n,scope:ghWriterObservationScope(saveScope),witness:ghWriterObservationCarry(nativeSaveCarryWitness)}') + 'return!1;}')
oe_replace('final-compound-fence-refusal',
    'if(!mainSessionWriteAuthorityCurrent(authority)||acceptedWrite&&!acceptedPatientLoadContextCurrent(acceptedOperation,true)||nativeMainFence&&!nativeMainCarryFenceCurrent(nativeMainFence,saveScope,i))return!1;',
    'if(!mainSessionWriteAuthorityCurrent(authority)||acceptedWrite&&!acceptedPatientLoadContextCurrent(acceptedOperation,true)||nativeMainFence&&!nativeMainCarryFenceCurrent(nativeMainFence,saveScope,i)){' + observe('oe.final-fence-group-refused', '{payload:n,scope:ghWriterObservationScope(saveScope),fence:nativeMainFence?{expectedJSON:nativeMainFence.payloadJSON,witness:ghWriterObservationCarry(nativeMainFence.witness)}:null}') + 'return!1;}')
oe_replace('adapter-false-existing-if-else',
    'if(w)rememberNativeSaveCarry(n,i,authority,saveScope);',
    'if(w)rememberNativeSaveCarry(n,i,authority,saveScope);else{' + observe('oe.adapter-false', '{written:w,payload:n,scope:ghWriterObservationScope(saveScope)}') + '}')
oe_replace('writer-terminal-catch-and-fallthrough',
    '}catch(o){l("vilda_data_import_export:saveMainSessionNow",o)}return!1}',
    '}catch(o){' + observe('oe.exception') + 'l("vilda_data_import_export:saveMainSessionNow",o)}' + observe('oe.fallthrough-false') + 'return!1}')
source = source[:a] + oe + source[b:]
changes.append({'label': 'instrument-exact-oe-refusals-only', 'old': old_oe, 'new': oe, 'details': oe_changes, 'count': 1})

# Exact textual reversal is independent of AST normalization.
reversed_source = source
for change in reversed(changes):
    assert reversed_source.count(change['new']) == change['count'], change['label']
    reversed_source = reversed_source.replace(change['new'], change['old'])
assert reversed_source.encode('utf-8') == original_bytes
assert NATIVE.read_bytes() == original_bytes
OUT.mkdir(parents=True, exist_ok=True)
clone_path = OUT / 'observer.js'
clone_path.write_text(source, encoding='utf-8')
diff = ''.join(difflib.unified_diff(original.splitlines(True), source.splitlines(True),
    fromfile='native-0e805/vilda_data_import_export.js',
    tofile='EXTERNAL-REFUSAL-ONLY-PROPOSAL/vilda_data_import_export.js'))
(OUT / 'proposal.diff').write_text(diff, encoding='utf-8')
(OUT / 'reversal-manifest.json').write_text(json.dumps(changes, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
proof = {
    'kind': 'EXTERNAL_REFUSAL_ONLY_DIAGNOSTIC_PROPOSAL_NOT_APP_FIX',
    'source': str(NATIVE), 'sourceSHA256': EXPECTED_NATIVE_SHA256,
    'proposal': str(clone_path), 'proposalSHA256': hashlib.sha256(source.encode()).hexdigest(),
    'diffSHA256': hashlib.sha256(diff.encode()).hexdigest(),
    'expectedCanonicalNativeAstSHA256': EXPECTED_NATIVE_AST_SHA256,
    'reverseByteIdentity': True, 'sourceStillExact': True,
    'runtimeExecuted': False, 'browserRuns': 0, 'ciRuns': 0, 'deployed': False,
    'appGitBrowserCiSitesMutations': False,
    'addedHelpers': ['ghWriterObservation', 'ghWriterObservationScope', 'ghWriterObservationCarry'],
    'log': {'optIn': '__vildaGhWriterObservationEnabled===true', 'ramOnly': True, 'maxEntries': 200,
        'detailThunkInsideObserverTry': True, 'fakeDataOnly': True},
    'guards': 'Every original native condition, short-circuit operand order, native call, return expression and mutation is retained. Observations are only after an original refusal condition/catch, terminal false fallthrough, or ELSE of the existing if(w) after adapter=false.',
    'normalSuccessPath': 'No observation call, observation object/detail thunk construction, observation JSON serialization, extra native read or extra native guard call is executed on a completely successful native write path. Three helpers are declarations only at load.',
    'omitted': ['prepareNativeSaveCarry fallback scope result logging', 'nativeMainCarryFenceCurrent final short-circuit return constituent attribution', 'timer/merge/GH-module catches that can continue to successful writes', 'normal-path collection/base/current/witness/success observations'],
    'limitations': [
        'Proposal has not been run. A diagnostic pass cannot prove the intermittent CI failure fixed or authorize release.',
        'Refusal-path observation still adds timing/allocation after the first original refusal; subsequent retries may therefore be affected.',
        'Logger is best effort, capped at 200 shared entries, and can drop entries on JSON/detail errors. No entry is not proof that a guard passed.',
        'Compound refusal stages do not identify the specific short-circuit operand; no guard is re-evaluated to determine it.',
        'The second failing adapter read is deliberately not repeated or captured; baseFromEarlierRead is explicitly the earlier base.',
        'prepareNativeSaveCarry/nativeMainCarryFenceCurrent serve other native callers as well as oe; inner stage alone is not attribution to GH or a particular save call.',
        'Fallback scope false is only seen through an outer oe.native-carry-refused when invoked by oe, without a separate inner stage.',
        'No opaque token, Vault, panel, adapter, ticket or account object is serialized. Scope and authority are explicit scalar projections; payload JSON is fictional test data only.',
        'Helper declarations change source parse/load size and instrumented branches may change JIT/layout even with no successful-path calls. This reduces observer work; it does not eliminate observer effect.',
        'No native guard cause, clinical fix, forced write, authority recapture, persistence bypass, timeout/retry change, test weakening or CodeQL suppression is proposed.'
    ],
    'changeLabels': [item['label'] for item in changes],
    'astEquivalence': 'PENDING', 'syntax': 'PENDING'
}
(OUT / 'proof.json').write_text(json.dumps(proof, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'sourceSHA256': EXPECTED_NATIVE_SHA256, 'proposalSHA256': proof['proposalSHA256'], 'diffSHA256': proof['diffSHA256'], 'reverseByteIdentity': True}))

# Portable CI-v3 refinement of the exact approved 5db refusal-only base.
base_clone = clone_path.read_bytes()
assert hashlib.sha256(base_clone).hexdigest() == '5db9849ab73111e236de1b37f83b14a4a636a59316f84356e93b78a0230cd674'
base_changes = list(changes)
v3_changes = [{'label': 'narrow-inherited-helper-timing-claim', 'old': '// No helper runs on a successful write. Opt-in, max 200 entries, browser RAM only.', 'new': '// Logging starts only after an original guard/branch has already refused.\n// A later fallback may still succeed; logging then affects that successful write.\n// Opt-in, max 200 entries, browser RAM only.', 'count': 1}, {'label': 'label-original-nativeSaveCarryCurrent-short-circuit-once', 'old': 'function nativeSaveCarryCurrent(witness,scope,adapter){\n  return !!(witness&&witness===nativeSaveCarryWitness&&witness.adapter===adapter\n    &&saveReceiptScopeCurrent(scope)&&saveReceiptScopeCurrent(witness.scope)\n    &&mainSessionWriteAuthorityCurrent(witness.authority));\n}', 'new': 'function nativeSaveCarryCurrent(witness,scope,adapter){\n  let ghCarryOperand="witness.present";\n  const ghCarryResult=!!(witness\n    &&(ghCarryOperand="witness.current-identity",witness===nativeSaveCarryWitness)\n    &&(ghCarryOperand="adapter.identity",witness.adapter===adapter)\n    &&(ghCarryOperand="scope.current",saveReceiptScopeCurrent(scope))\n    &&(ghCarryOperand="witness.scope.current",saveReceiptScopeCurrent(witness.scope))\n    &&(ghCarryOperand="witness.authority.current",mainSessionWriteAuthorityCurrent(witness.authority)));\n  if(!ghCarryResult)ghWriterObservation("carry.current-first-false",function(){return {operand:ghCarryOperand};});\n  return ghCarryResult;\n}', 'count': 1}, {'label': 'label-original-mainSessionWriteAuthorityCurrent-short-circuits-once', 'old': 'function mainSessionWriteAuthorityCurrent(authority){\n  try{\n    if(!authority||authority.sequence!==vildaApplyLoadedDataSequence||authority.generation!==saveScopeGeneration||mainSessionPanelIsStale())return false;\n    return !authority.scoped||r.VildaPanelPacjent===authority.panel&&authority.panel.isWriteAuthorityCurrent(authority.ticket);\n  }catch{return false}\n}', 'new': 'function mainSessionWriteAuthorityCurrent(authority){\n  let ghAuthorityOperand="authority.initial",ghPanelIdentityResult,ghPanelAuthorityResult,ghPanelAuthorityEvaluated=false;\n  try{\n    if((ghAuthorityOperand="authority.missing",!authority)\n      ||(ghAuthorityOperand="authority.sequence",authority.sequence!==vildaApplyLoadedDataSequence)\n      ||(ghAuthorityOperand="authority.generation",authority.generation!==saveScopeGeneration)\n      ||(ghAuthorityOperand="panel.stale",mainSessionPanelIsStale())){\n      ghWriterObservation("authority.initial-refusal",function(){return {operand:ghAuthorityOperand};});\n      return false;\n    }\n    const ghAuthorityResult=(ghAuthorityOperand="authority.unscoped",!authority.scoped)\n      ||(ghAuthorityOperand="panel.identity",ghPanelIdentityResult=r.VildaPanelPacjent===authority.panel)\n        &&(ghAuthorityOperand="panel.isWriteAuthorityCurrent",ghPanelAuthorityEvaluated=true,\n          ghPanelAuthorityResult=authority.panel.isWriteAuthorityCurrent(authority.ticket));\n    if(!ghAuthorityResult)ghWriterObservation("authority.scoped-refusal",function(){return {\n      operand:ghAuthorityOperand,panelIdentityEvaluated:typeof ghPanelIdentityResult==="boolean",\n      panelIdentityResult:typeof ghPanelIdentityResult==="boolean"?ghPanelIdentityResult:null,\n      panelAuthorityEvaluated:ghPanelAuthorityEvaluated,\n      panelAuthorityResult:ghPanelAuthorityResult==null?null:typeof ghPanelAuthorityResult==="boolean"?ghPanelAuthorityResult:null,\n      panelAuthorityResultType:typeof ghPanelAuthorityResult\n    };});\n    return ghAuthorityResult;\n  }catch{\n    ghWriterObservation("authority.original-catch",function(){return {\n      operand:ghAuthorityOperand,panelIdentityEvaluated:typeof ghPanelIdentityResult==="boolean",\n      panelIdentityResult:typeof ghPanelIdentityResult==="boolean"?ghPanelIdentityResult:null,\n      panelAuthorityEvaluated:ghPanelAuthorityEvaluated\n    };});\n    return false;\n  }\n}', 'count': 1}]
source_v3 = base_clone.decode('utf-8')
for item in v3_changes:
    assert source_v3.count(item['old']) == item['count'], item['label']
    source_v3 = source_v3.replace(item['old'], item['new'])
assert hashlib.sha256(source_v3.encode()).hexdigest() == 'ebaff321f97d7da5a8e48ab2a01ee5e981e31a6aea4e95884c7ea2587a88246a'
reversed_v3 = source_v3
for item in reversed(v3_changes):
    assert reversed_v3.count(item['new']) == item['count']
    reversed_v3 = reversed_v3.replace(item['new'], item['old'])
assert reversed_v3.encode() == base_clone
for item in reversed(base_changes):
    assert reversed_v3.count(item['new']) == item['count']
    reversed_v3 = reversed_v3.replace(item['new'], item['old'])
assert reversed_v3.encode() == original_bytes
clone_path.write_text(source_v3, encoding='utf-8')
(OUT / 'base-reversal-manifest.json').write_text(json.dumps(base_changes, ensure_ascii=False, indent=2) + '\n')
(OUT / 'v3-reversal-manifest.json').write_text(json.dumps(v3_changes, ensure_ascii=False, indent=2) + '\n')
(OUT / 'reversal-manifest.json').write_text(json.dumps(base_changes + v3_changes, ensure_ascii=False, indent=2) + '\n')
full_diff = ''.join(difflib.unified_diff(original.splitlines(True), source_v3.splitlines(True), fromfile='native-0e805/vilda_data_import_export.js', tofile='EXTERNAL-CI-V3-PROPOSAL/vilda_data_import_export.js'))
(OUT / 'proposal.diff').write_text(full_diff)
proof.pop('normalSuccessPath', None)
proof.update({
    'kind': 'PORTABLE_CI_V3_FIRST_REFUSING_OPERANDS_DIAGNOSTIC_NOT_FIX',
    'proposalSHA256': hashlib.sha256(source_v3.encode()).hexdigest(),
    'cloneSHA256': hashlib.sha256(source_v3.encode()).hexdigest(),
    'approvedRefusalOnlyBaseSHA256': hashlib.sha256(base_clone).hexdigest(),
    'diffSHA256': hashlib.sha256(full_diff.encode()).hexdigest(),
    'reverseToApproved5dbByteExact': True, 'reverseEntireSourceToNative0e805ByteExact': True,
    'newFunctionsChanged': ['nativeSaveCarryCurrent', 'mainSessionWriteAuthorityCurrent'],
    'perGuardTruePath': 'A successful true-returning invocation of either newly instrumented guard adds local scalar marker/result assignments and control flow over retained results, without an observation call/detail/JSON in that invocation. A false guard can precede a later successful fallback or native write, so no entire-successful-write absence-of-logging guarantee is made.',
    'limitations': ['nativeSaveCarryCurrent does not gain a catch: original thrown exceptions still propagate.', 'mainSessionWriteAuthorityCurrent retains its original catch and exact return value, including any nonboolean guard result. Only scalar booleans/type labels can be logged; no guard is re-invoked.', 'Label and result assignments add success-path scalar work. No claim of unchanged timing or full AST byte identity for these two functions; original expression trees and evaluation order must be verified independently.', 'Existing5db19 refusal sites remain with200-entry RAM cap shared by Data observations. More detailed refusal entries can hit the cap sooner.', 'New guard-refusal logging happens after the original false operand, but can add timing/allocation before a later accepted fallback and successful writer outcome. This observer effect is explicitly permitted only for this bounded diagnostic proposal.', 'Scope currentness remains one unchanged native helper call; no private scope token is inspected or serialized.', 'No runtime test is authorized by this proposal. Root may later authorize exactly one original local GH390 after independent review.', 'A disabled RAM sink does not eliminate false-guard observer calls/detail thunk creation before opt-in.', 'No first rejecting private operand is inferred from a passing run. No guard is replayed.'],
    'sourceStillExact': NATIVE.read_bytes() == original_bytes,
    'runtimeExecuted': False, 'browserRuns': 0, 'ciRuns': 0,
    'changeLabels': [item['label'] for item in base_changes + v3_changes],
})
(OUT / 'proof.json').write_text(json.dumps(proof, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'kind': 'FINAL_PORTABLE_V3', 'proposalSHA256': proof['proposalSHA256'], 'reverseEntireSource': True}))
