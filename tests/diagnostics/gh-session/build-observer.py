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

# Portable CI-V4: change only the two existing approved5db false-detail callbacks.
base_clone = clone_path.read_bytes()
assert hashlib.sha256(base_clone).hexdigest() == '5db9849ab73111e236de1b37f83b14a4a636a59316f84356e93b78a0230cd674'
base_changes = list(changes)
v4_changes = [{'label': 'existing-carry-candidate-refused-detail-only', 'old': 'function(){return {current:current,projected:projected,candidate:candidate,candidateKind:candidate===base?"main-session":"last-loaded",scope:ghWriterObservationScope(scope),witness:ghWriterObservationCarry(witness)};}', 'new': 'function(){\n      const detail={current:current,projected:projected,candidate:candidate,candidateKind:candidate===base?"main-session":"last-loaded",scope:ghWriterObservationScope(scope),witness:ghWriterObservationCarry(witness)};\n      const previousScope=witness&&witness.scope;\n      const projectedPreviousScope=detail.witness&&detail.witness.scope;\n      const scopePair=!!(detail.scope&&projectedPreviousScope);\n      detail.postFalseComparisons={\n        witnessPresent:!!witness,scopePresent:!!scope,witnessScopePresent:!!previousScope,\n        adapterReferenceMatchesWitness:witness?adapter===witness.adapter:null,\n        scopeReferenceMatchesWitness:scope&&previousScope?scope===previousScope:null,\n        vaultReferenceMatchesWitness:scope&&previousScope?scope.vault===previousScope.vault:null,\n        ownerIdMatchesWitness:scopePair?detail.scope.ownerId===projectedPreviousScope.ownerId:null,\n        patientIdMatchesWitness:scopePair?detail.scope.patientId===projectedPreviousScope.patientId:null,\n        applySequenceMatchesWitness:scopePair?detail.scope.applySequence===projectedPreviousScope.applySequence:null,\n        generationMatchesWitness:scopePair?detail.scope.generation===projectedPreviousScope.generation:null,\n        authorityProjectionUnavailable:"Current oe authority is not in this native helper\'s lexical scope; it is compared only by the existing outer oe false callback.",\n        opaqueTokenValidityObserved:false\n      };\n      return detail;\n    }', 'count': 1}, {'label': 'existing-oe-native-carry-refused-detail-only', 'old': 'function(){return {payload:n,scope:ghWriterObservationScope(saveScope),witness:ghWriterObservationCarry(nativeSaveCarryWitness)};}', 'new': 'function(){\n      let previousWitness;\n      const detail={payload:n,scope:ghWriterObservationScope(saveScope),witness:ghWriterObservationCarry(previousWitness=nativeSaveCarryWitness)};\n      const previousScope=previousWitness&&previousWitness.scope;\n      const projectedPreviousScope=detail.witness&&detail.witness.scope;\n      const previousAuthority=previousWitness&&previousWitness.authority;\n      const projectedPreviousAuthority=detail.witness&&detail.witness.authority;\n      const currentSequence=authority&&authority.sequence,currentGeneration=authority&&authority.generation,currentScoped=authority&&authority.scoped;\n      const authorityPair=!!(authority&&projectedPreviousAuthority);\n      const scopePair=!!(detail.scope&&projectedPreviousScope);\n      const comparisons={\n        projectionContext:"Closed original fictional GH390 on pinned native factory callsites; no runtime producer brand is asserted.",\n        scheduledAuthorityProvided:scheduledAuthority!==undefined,\n        witnessPresent:!!previousWitness,scopePresent:!!saveScope,witnessScopePresent:!!previousScope,\n        adapterReferenceMatchesWitness:previousWitness?i===previousWitness.adapter:null,\n        scopeReferenceMatchesWitness:saveScope&&previousScope?saveScope===previousScope:null,\n        vaultReferenceMatchesWitness:saveScope&&previousScope?saveScope.vault===previousScope.vault:null,\n        ownerIdMatchesWitness:scopePair?detail.scope.ownerId===projectedPreviousScope.ownerId:null,\n        patientIdMatchesWitness:scopePair?detail.scope.patientId===projectedPreviousScope.patientId:null,\n        applySequenceMatchesWitness:scopePair?detail.scope.applySequence===projectedPreviousScope.applySequence:null,\n        generationMatchesWitness:scopePair?detail.scope.generation===projectedPreviousScope.generation:null,\n        authorityReferenceMatchesWitness:previousWitness?authority===previousAuthority:null,\n        authoritySequenceMatchesWitness:authorityPair?currentSequence===projectedPreviousAuthority.sequence:null,\n        authorityGenerationMatchesWitness:authorityPair?currentGeneration===projectedPreviousAuthority.generation:null,\n        authorityScopedMatchesWitness:authorityPair?currentScoped===projectedPreviousAuthority.scoped:null,\n        ticketProjectionAvailable:false,projectionUnavailable:null,opaqueTokenValidityObserved:false\n      };\n      if(authorityPair&&currentScoped===true&&projectedPreviousAuthority.scoped===true&&previousAuthority){\n        const currentTicket=authority.ticket,previousTicket=previousAuthority.ticket;\n        if(currentTicket&&previousTicket){\n          const currentAccount=currentTicket.account,previousAccount=previousTicket.account;\n          comparisons.panelReferenceMatchesWitness=authority.panel===previousAuthority.panel;\n          comparisons.ticketReferenceMatchesWitness=currentTicket===previousTicket;\n          comparisons.ticketGenerationMatchesWitness=currentTicket.generation===previousTicket.generation;\n          comparisons.ticketSequenceMatchesWitness=currentTicket.sequence===previousTicket.sequence;\n          comparisons.ticketShellReferenceMatchesWitness=currentTicket.shell===previousTicket.shell;\n          comparisons.ticketPatientIdMatchesWitness=currentTicket.patientId===previousTicket.patientId;\n          if(currentAccount&&previousAccount){\n            comparisons.accountVaultReferenceMatchesWitness=currentAccount.vault===previousAccount.vault;\n            comparisons.accountUserIdMatchesWitness=currentAccount.userId===previousAccount.userId;\n            comparisons.accountUnlockedMatchesWitness=currentAccount.unlocked===previousAccount.unlocked;\n            comparisons.accountGuestMatchesWitness=currentAccount.guest===previousAccount.guest;\n            comparisons.ticketProjectionAvailable=true;\n          }else comparisons.projectionUnavailable="A native captured account field is unavailable; no getter/API fallback or token projection is attempted.";\n        }else comparisons.projectionUnavailable="A native captured ticket is unavailable; no getter/API fallback is attempted.";\n      }else comparisons.projectionUnavailable="Scoped native authority projection is unavailable; no getter/API fallback or opaque projection is attempted.";\n      detail.postFalseComparisons=comparisons;\n      return detail;\n    }', 'count': 1}]
source_v4 = base_clone.decode('utf-8')
for item in v4_changes:
    assert source_v4.count(item['old']) == item['count'] == 1, item['label']
    source_v4 = source_v4.replace(item['old'], item['new'], 1)
assert hashlib.sha256(source_v4.encode()).hexdigest() == '3f19b549f4462847aa3f9b19466ebb0d1153350f2eb2365101596ed4188ac76d'
reversed_v4 = source_v4
for item in reversed(v4_changes):
    assert reversed_v4.count(item['new']) == item['count']
    reversed_v4 = reversed_v4.replace(item['new'], item['old'], 1)
assert reversed_v4.encode() == base_clone
for item in reversed(base_changes):
    assert reversed_v4.count(item['new']) == item['count']
    reversed_v4 = reversed_v4.replace(item['new'], item['old'])
assert reversed_v4.encode() == original_bytes
clone_path.write_text(source_v4, encoding='utf-8')
(OUT / 'base-reversal-manifest.json').write_text(json.dumps(base_changes, ensure_ascii=False, indent=2) + '\n')
(OUT / 'reversal-manifest.json').write_text(json.dumps(v4_changes, ensure_ascii=False, indent=2) + '\n')
full_diff = ''.join(difflib.unified_diff(original.splitlines(True), source_v4.splitlines(True), fromfile='native-0e805/vilda_data_import_export.js', tofile='EXTERNAL-CI-V4-PROPOSAL/vilda_data_import_export.js'))
(OUT / 'proposal.diff').write_text(full_diff)
proof.pop('normalSuccessPath', None)
proof.update({
    'kind': 'PORTABLE_CI_V4_TWO_EXISTING_POST_FALSE_DETAIL_CALLBACKS_NOT_FIX',
    'proposalSHA256': hashlib.sha256(source_v4.encode()).hexdigest(),
    'cloneSHA256': hashlib.sha256(source_v4.encode()).hexdigest(),
    'approved5dbBaseSHA256': hashlib.sha256(base_clone).hexdigest(),
    'diffSHA256': hashlib.sha256(full_diff.encode()).hexdigest(),
    'reverseTo5dbByteExact': True, 'reverseEntireSourceTo0e805ByteExact': True,
    'changedBodiesOnly': ['carry.candidate-refused detail thunk', 'oe.native-carry-refused detail thunk'],
    'newObserverCallSites': 0, 'newNativeGuardGetterAPICaptureCalls': 0,
    'newSuccessPathMarkersOrGlobalsOrAPIs': 0, 'panelInterceptionOrModification': False,
    'comparisonPrivacy': 'Only nullable booleans/static availability/context strings are added. Adapter/Vault/panel/ticket/shell/account references remain local to false callbacks and are never returned or serialized. No token/source/credential field is read. Original5db witness/payload projection remains intact.',
    'closedCaseProducerBoundary': {'reviewSHA256': '9c4bc1c36f38f38818faa62495896f27ed989acc143d211ab9b0bdc1f9fff528', 'nativeDataSHA256': EXPECTED_NATIVE_SHA256, 'nativePanelSHA256': '703c0fed15df985a3fd0716af17b5abb15527f82f080c1cbb2926ce4118e1f9f', 'loadedPublicWriterCallsites': 8, 'publicWriterArity': '0 or1; forwarding wrappers pass only1 options argument', 'nativeAuthorityProducers': 'captureMainSessionWriteAuthority/Pe/internal accepted restore and own save', 'notUniversalForForeignScheduledAuthority': True},
    'limitations': ['Scoped to the exact original fictional GH390 with loaded nativefactory/Pe/Gp_a/public0-or1argument callsites documented in field review, not arbitrary foreign scheduledAuthority inputs.', 'Factory authority/scope/witness objects are plain, not all frozen; the Panel ticket freeze is shallow and account is plain/mutable. Reads are observations after refusal, never an application repair/provenance API.', 'The same existing oe authority/saveScope from this attempt is compared to the saved witness; no latest authority or guard result is recaptured.', 'Reference equality does not imply token/account/shell validity. Ticket-field mismatches are observations, not a replay or proof of the private rejecting guard.', 'Missing/unscoped ticket/account shapes produce projectionUnavailable instead of getter/API fallback. No descriptors/reflection/guard rechecks are used.', 'Only the two pre-existing detail callbacks change. Before their original false branch, execution is the same as5db; source parse/JIT/function allocation size may still differ. Logging/comparison after the first false can affect subsequent retries.', 'SharedRAM200 cap/best-effort can omit callbacks; no absence of observations proves guard validity.', 'No runtime/CI/rerun/browser/Git/Panel route/app-source change is authorized by this external proposal.'],
    'sourceStillExact': NATIVE.read_bytes() == original_bytes,
    'runtimeExecuted': False, 'browserRuns': 0, 'ciRuns': 0,
    'changeLabels': [item['label'] for item in v4_changes],
})
(OUT / 'proof.json').write_text(json.dumps(proof, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'kind': 'FINAL_PORTABLE_V4', 'proposalSHA256': proof['proposalSHA256'], 'reverseEntireSource': True}))
