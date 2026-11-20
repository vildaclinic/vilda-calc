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
