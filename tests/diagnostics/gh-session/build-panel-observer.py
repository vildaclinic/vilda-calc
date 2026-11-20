from pathlib import Path
import hashlib,json,difflib,sys
assert len(sys.argv)==3, 'Use build-panel-observer.py <checkout-root> <outside-output>'
checkout=Path(sys.argv[1]).resolve()
out=Path(sys.argv[2]).resolve()
assert out != checkout and checkout not in out.parents, 'Panel diagnostic output must stay outside checkout'
out.mkdir(parents=True,exist_ok=True)
source=checkout/'vilda_panel_pacjent.js'
native=source.read_text();sha=lambda b:hashlib.sha256(b).hexdigest()
assert sha(source.read_bytes())=='703c0fed15df985a3fd0716af17b5abb15527f82f080c1cbb2926ce4118e1f9f'
a=native.index('  function isWriteAuthorityCurrent(ticket) {');b=native.index('\n  // DIX calls this',a)
old=native[a:b]
helper='''  // EXTERNAL GH DIAGNOSTIC ONLY. No clinical or opaque authority data.
  // The observer is called only after an original refusal/exception.
  function ghPanelAuthorityObservation(operand, threw) {
    try {
      if (w.__vildaGhWriterObservationEnabled !== true) return;
      var entries = w.__vildaGhWriterObservationEntries || (w.__vildaGhWriterObservationEntries = []);
      if (entries.length >= 200) return;
      entries.push({ stage: 'panel.write-authority-refused', at: Date.now(), detail: { operand: operand, threw: threw } });
    } catch (_) {}
  }

'''
new='''  function isWriteAuthorityCurrent(ticket) {
    var __ghPanelOperand = 'entry';
    try {
      if ((__ghPanelOperand = 'no-ticket', !ticket) ||
          (__ghPanelOperand = 'ticket-not-known', !writeTickets.has(ticket)) ||
          (__ghPanelOperand = 'stale-panel', ocen()) ||
          (__ghPanelOperand = 'panel-generation', ticket.generation !== writeGeneration) ||
          (__ghPanelOperand = 'apply-sequence', ticket.sequence !== applySequence()) ||
          (__ghPanelOperand = 'shell-object', ticket.shell !== writeShell()) ||
          (__ghPanelOperand = 'account-scope', !accountCurrent(ticket.account))) {
        ghPanelAuthorityObservation(__ghPanelOperand, false);
        return false;
      }
      if ((__ghPanelOperand = 'shell-present', ticket.shell) &&
          (__ghPanelOperand = 'shell-activation', !ticket.shell.isSessionWriterCurrent(ticket.source, w))) {
        ghPanelAuthorityObservation(__ghPanelOperand, false);
        return false;
      }
      var id = (__ghPanelOperand = 'patient-id-read', pacjentKarty());
      if ((__ghPanelOperand = 'same-patient', ticket.patientId === id)) return true;
      // Existing null -> PID adoption is valid only for this same visit and
      // the same identity as the newly saved shared snapshot.
      var __ghPanelAllowed = (__ghPanelOperand = 'null-origin', ticket.patientId === null) &&
        (__ghPanelOperand = 'new-patient-present', !!id) &&
        (__ghPanelOperand = 'known-new-patient', stan.znany === id) &&
        ((__ghPanelOperand = 'same-patient-snapshot', tenSamPacjentCoMigawka()) ||
          !!((__ghPanelOperand = 'continuation-present', ownSaveContinuation) &&
            (__ghPanelOperand = 'continuation-generation', ownSaveContinuation.generation === ticket.generation) &&
            (__ghPanelOperand = 'continuation-patient', ownSaveContinuation.patientId === id)));
      if (!__ghPanelAllowed) ghPanelAuthorityObservation(__ghPanelOperand, false);
      return __ghPanelAllowed;
    } catch (_) { ghPanelAuthorityObservation(__ghPanelOperand, true); return false; }
  }
'''
assert native.count(old)==1
assert 'ghPanelAuthorityObservation' not in native and '__ghPanelOperand' not in native and '__ghPanelAllowed' not in native
clone=native[:a]+helper+new+native[b:]
assert clone.count(helper)==1 and clone.count(new)==1
reverse=clone.replace(new,old,1).replace(helper,'',1)
assert reverse==native
file=out/'panel-observer.js';file.write_text(clone)
manifest={'source':str(source),'sourceSHA256':sha(native.encode()),'clone':str(file),'cloneSHA256':sha(clone.encode()),'resource':'/vilda_panel_pacjent.js?v=5','publicMethod':'VildaPanelPacjent.isWriteAuthorityCurrent','changes':[{'label':'local-refusal-only-observer-helper','old':'','new':helper},{'label':'first-original-refusing-panel-operand','old':old,'new':new}],'reverseOrder':['first-original-refusing-panel-operand','local-refusal-only-observer-helper'],'exactReverseSourceBytes':True}
(out/'panel-reversal-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
(out/'panel-observer.diff').write_text(''.join(difflib.unified_diff(native.splitlines(True),clone.splitlines(True),fromfile='native/vilda_panel_pacjent.js',tofile='external/vilda_panel_pacjent.refusal-v3.proposed.js')))
print(json.dumps({k:v for k,v in manifest.items() if k not in ['changes']}))
