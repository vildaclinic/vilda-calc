import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {urzadzenie,sprzatnij} from './sesja-zapisu-uprzaz.mjs';
import {oknoMagazynu,drugieOkno,przechwycZadaniaWTle} from '../support/okno-magazynu.mjs';

const windows=[];
beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-11-23T12:00:00Z'));});
afterEach(async()=>{for(const d of windows.splice(0)){d.krypto.rozbroj();d.timery.wyczysc();await d.locks?.zwolnijWszystkie();}await sprzatnij();vi.restoreAllMocks();vi.useRealTimers();});
const uuid=()=>globalThis.crypto.randomUUID();
async function visit(v,patientId){
  vi.setSystemTime(Date.now()+60000);
  const id=uuid(),saved=await v.savePatient({name:'Fikcyjna Ewa Wynikowa',
    user:{firstName:'Ewa',lastName:'Fikcyjna Wynikowa',sex:'F',age:10,height:135,weight:30},
    visit:{version:1,visitId:id,patientId:patientId||null,createdAtISO:'2026-11-03T12:00:00Z',clinicalDateISO:'2026-11-03',origin:'explicit'}},{patientId,dedup:false});
  return(await v.getPatientVisits(saved.patientId)).find(row=>row.visitId===id);
}
function bind(d,row,current=()=>true){
  const binding=Object.freeze({visitContext:Object.freeze({version:1,visitId:row.visitId,clinicalDateISO:row.clinicalDateISO}),
    isCurrent:current,ensureRecorded:vi.fn(async()=>true)});
  d.win.VildaHomeEncounter={captureBinding:id=>id===row.patientId?binding:null};return binding;
}
async function reminder(d,old){
  const saved=await d.v.savePatientNote({patientId:old.patientId,title:'Fikcyjne starsze zlecenie',body:'Pierwotna treść.',
    dueDateISO:'2026-11-12',category:'followup',visitContext:{version:1,visitId:old.visitId,clinicalDateISO:old.clinicalDateISO}});
  return d.v.getPatientNote(saved.id);
}
function outcome(note,changes={}){return{id:note.id,patientId:note.patientId,baseRev:note.rev,baseUpdatedAtISO:note.updatedAtISO,baseNote:note,
  operationId:uuid(),action:'result',text:'Fikcyjny wynik opisowy.',dateISO:'2026-11-22',...changes};}
async function fixture(options={}){const d=await urzadzenie(options),old=await visit(d.v),note=await reminder(d,old),row=await visit(d.v,old.patientId);return{d,old,note,row,binding:bind(d,row)};}
function trash(d,row){return d.v.moveVisitToTrash(row.patientId,row.visitId,{snapshotId:row.snapshotId,revision:row.rev,isCurrent:()=>true});}
async function plan(d,row){const saved=await d.v.mutateCarePlan({patientId:row.patientId,operationId:uuid(),action:'create',title:'Fikcyjny stary plan',goal:'Fikcyjna obserwacja.'},bind(d,row));return d.v.getCarePlan(saved.planId);}
const command=(p,action,extra={})=>({patientId:p.patientId,planId:p.id,baseRev:p.rev,operationId:uuid(),action,...extra});

describe('new compound documents retain the explicitly opened visit',()=>{
  it.each([false,true])('binds result and next without retargeting the old parent (cloud=%s)',async chmura=>{
    const{d,old,note,row,binding}=await fixture({chmura});
    const input=outcome(note,{next:{title:'Fikcyjna kontrola',dateISO:'2026-12-02'}}),saved=await d.v.saveReminderOutcome(input,binding);
    expect(saved.saved).toBe(true);expect(binding.ensureRecorded).toHaveBeenCalledTimes(1);
    const parent=await d.v.getPatientNote(note.id),result=await d.v.getPatientNote(saved.resultNoteId),next=await d.v.getPatientNote(saved.nextId);
    expect(parent).toMatchObject({visitContext:note.visitContext,title:note.title,dueDateISO:note.dueDateISO,createdAtISO:note.createdAtISO});
    expect(parent.body).toContain('Pierwotna treść.');expect(result).toMatchObject({visitContext:binding.visitContext,clinicalDateISO:null,reminderContext:{dateISO:'2026-11-22'}});
    expect(next).toMatchObject({visitContext:binding.visitContext,dueDateISO:'2026-12-02T00:00:00.000Z'});
    expect(row.visitId).not.toBe(old.visitId);expect(result.visitContext.visitId).not.toBe(parent.visitContext.visitId);
    expect(await d.v.saveReminderOutcome(input,binding)).toMatchObject({saved:true,reused:true,resultNoteId:result.id,nextId:next.id});
    await trash(d,row);const count=d.krypto.log.length;
    expect(await d.v.saveReminderOutcome(input,binding)).toMatchObject({saved:true,reused:true});
    expect(d.krypto.log.slice(count).filter(x=>x.metoda==='encrypt')).toEqual([]);
  });
  it('keeps genuine general outcomes general and refuses caller supplied ambient origins',async()=>{
    const{d,note,binding}=await fixture();const saved=await d.v.saveReminderOutcome(outcome(note,{visitContext:binding.visitContext}));
    expect(saved.saved).toBe(true);expect(await d.v.getPatientNote(saved.resultNoteId)).not.toHaveProperty('visitContext');
    expect((await d.v.getPatientNote(note.id)).visitContext).toEqual(note.visitContext);
  });
  it('awaits canonical visit recording through a real public writer before creating compound children',async()=>{
    const{d,note,row}=await fixture(),input=outcome(note);
    const binding={visitContext:{version:1,visitId:row.visitId,clinicalDateISO:row.clinicalDateISO},isCurrent:()=>true,
      ensureRecorded:vi.fn(async()=>{
        await visit(d.v,row.patientId);
        expect(await d.v.getPatientNote('rem-result-'+input.operationId)).toBeNull();return true;
      })};
    d.win.VildaHomeEncounter={captureBinding:()=>binding};
    const saved=await d.v.saveReminderOutcome(input,binding);
    expect(saved.saved).toBe(true);expect(binding.ensureRecorded).toHaveBeenCalledTimes(1);
    expect(await d.v.getPatientNote(saved.resultNoteId)).toMatchObject({visitContext:binding.visitContext});
  });
  it('rejects unavailable or deleted visit before preparing any part of an outcome',async()=>{
    const{d,note,row,binding}=await fixture(),input=outcome(note,{next:{title:'Fikcyjna kontrola',dateISO:'2026-12-02'}});
    await expect(d.v.saveReminderOutcome(input,{blocked:true})).rejects.toMatchObject({code:'VISIT_DOCUMENT_STALE'});
    await trash(d,row);const count=d.krypto.log.length;
    await expect(d.v.saveReminderOutcome(input,binding)).rejects.toMatchObject({code:'VISIT_DOCUMENT_STALE'});
    expect(d.krypto.log.slice(count).filter(x=>x.metoda==='encrypt')).toEqual([]);expect(await d.v.getPatientNote(note.id)).toEqual(note);
    expect(await d.v.getPatientNote('rem-result-'+input.operationId)).toBeNull();
  });
  it('retains native atomic rollback when compound commit fails',async()=>{
    const{d,note,binding}=await fixture(),input=outcome(note,{next:{title:'Fikcyjna kontrola',dateISO:'2026-12-02'}});
    d.baza.commitReminderForUser=async()=>{throw Error('FICTIONAL_COMMIT_FAILURE');};
    await expect(d.v.saveReminderOutcome(input,binding)).rejects.toThrow('FICTIONAL_COMMIT_FAILURE');
    expect(await d.v.getPatientNote(note.id)).toEqual(note);expect(await d.v.getPatientNote('rem-result-'+input.operationId)).toBeNull();
    expect(await d.v.getPatientNote('rem-next-'+input.operationId)).toBeNull();
  });
  it('rejects an operation retry that would reinterpret the same outcome in another visit',async()=>{
    const{d,note,row,binding}=await fixture(),input=outcome(note),saved=await d.v.saveReminderOutcome(input,binding);
    const before=await d.v.getPatientNote(saved.resultNoteId),other=await visit(d.v,row.patientId);
    expect(await d.v.saveReminderOutcome(input,bind(d,other))).toMatchObject({saved:false,conflict:true,reason:'operation-mismatch'});
    expect(await d.v.getPatientNote(saved.resultNoteId)).toEqual(before);
  });
  it('does not enter the native writer after ownership changes during public visit recording',async()=>{
    const{d,note,row}=await fixture();let current=true,release,entered;
    const ready=new Promise(resolve=>{entered=resolve;}),wait=new Promise(resolve=>{release=resolve;});
    const binding={visitContext:{version:1,visitId:row.visitId,clinicalDateISO:row.clinicalDateISO},isCurrent:()=>current,
      ensureRecorded:async()=>{entered();return wait;}};
    d.win.VildaHomeEncounter={captureBinding:()=>binding};
    const saving=d.v.saveReminderOutcome(outcome(note),binding),rejected=expect(saving).rejects.toThrow(/Zmieniono wizytę/);
    await ready;current=false;release(true);await rejected;
    expect(await d.v.getPatientNote(note.id)).toEqual(note);
    expect((await d.v.listPatientNotesForPatient(row.patientId)).filter(x=>x.id.startsWith('rem-result-'))).toEqual([]);
  });
  it('binds a new care note and result while keeping plan and existing step provenance',async()=>{
    const d=await urzadzenie(),old=await visit(d.v),p=await plan(d,old),parent=await d.v.getPatientNote(p.id);
    const added=await d.v.mutateCarePlan(command(p,'addStep',{step:{title:'Fikcyjne badanie',kind:'Badanie',state:'pending',reminderDateISO:'2026-11-12'}}),bind(d,old));
    const before=await d.v.getCarePlan(p.id),step=before.steps.find(x=>x.id===added.stepId),oldReminder=await d.v.getPatientNote(step.reminderNoteId);
    const row=await visit(d.v,old.patientId),binding=bind(d,row);
    const noteCommand=command(before,'addNote',{text:'Fikcyjne ustalenie.',dateISO:'2026-11-21'});
    expect((await d.v.mutateCarePlan(noteCommand,binding)).saved).toBe(true);
    expect(await d.v.getPatientNote('care-note-'+noteCommand.operationId)).toMatchObject({visitContext:binding.visitContext,clinicalDateISO:'2026-11-21'});
    const current=await d.v.getCarePlan(p.id),resultCommand=command(current,'result',{stepId:step.id,text:'Fikcyjny wynik.',dateISO:'2026-11-22',continuation:'later',decisionDateISO:'2026-11-23'});
    expect((await d.v.mutateCarePlan(resultCommand,binding)).saved).toBe(true);
    expect(await d.v.getPatientNote('care-result-'+resultCommand.operationId)).toMatchObject({visitContext:binding.visitContext,clinicalDateISO:null});
    expect((await d.v.getCarePlan(p.id)).log.some(x=>x.noteId==='care-result-'+resultCommand.operationId&&x.dateISO==='2026-11-22')).toBe(true);
    expect((await d.v.getPatientNote(p.id)).visitContext).toEqual(parent.visitContext);
    expect((await d.v.getPatientNote(step.reminderNoteId)).visitContext).toEqual(oldReminder.visitContext);
  });
  it('passes the same binding through a reminder outcome owned by an existing care plan',async()=>{
    const d=await urzadzenie(),old=await visit(d.v),p=await plan(d,old),added=await d.v.mutateCarePlan(command(p,'addStep',{
      step:{title:'Fikcyjny wynik do odebrania',kind:'Badanie',state:'pending',reminderDateISO:'2026-11-12'}}),bind(d,old));
    const before=await d.v.getCarePlan(p.id),step=before.steps.find(x=>x.id===added.stepId),note=await d.v.getPatientNote(step.reminderNoteId);
    const row=await visit(d.v,old.patientId),binding=bind(d,row),input=outcome(note,{next:{title:'Fikcyjna kolejna kontrola',dateISO:'2026-12-02'}});
    const result=await d.v.saveReminderOutcome(input,binding);expect(result.saved).toBe(true);
    const saved=await d.v.getCarePlan(p.id);expect(saved.log.some(x=>x.visitContext?.visitId===row.visitId)).toBe(true);
    expect(await d.v.getPatientNote('care-result-'+input.operationId)).toMatchObject({visitContext:binding.visitContext});
    expect(await d.v.getPatientNote(result.nextId)).toMatchObject({visitContext:binding.visitContext});
    expect((await d.v.getPatientNote(note.id)).visitContext).toEqual(note.visitContext);
    expect(await d.v.saveReminderOutcome(input,binding)).toMatchObject({saved:true,reused:true});
  });
});

describe('compound outcome versus whole-visit Trash',()=>{
  it('holds the patient lease through encryption and commit, then lets another tab trash the visit',async()=>{
    przechwycZadaniaWTle();const first=await oknoMagazynu({konta:'A',bramka:false});windows.push(first);
    const old=await visit(first.v),note=await reminder(first,old),row=await visit(first.v,old.patientId),binding=bind(first,row);
    const second=await drugieOkno(first,{konta:'A',bramka:false,zaloguj:'A'});windows.push(second);
    const other=(await second.v.getPatientVisits(row.patientId)).find(x=>x.visitId===row.visitId),gate=first.krypto.wstrzymaj('encrypt');
    const creation=first.v.saveReminderOutcome(outcome(note),binding);let removal,finished=false;
    try{await gate.osiagnieta;const start=first.locks.zadania.length;
      removal=trash(second,other).then(value=>{finished=true;return value;});
      const queued=await first.locks.czekajNaZadanie(x=>x.wynik==='w-kolejce',{od:start});
      expect(queued.nazwa).toBe('vilda-save-pat:'+row.patientId);expect(finished).toBe(false);
    }finally{gate.zwolnij();}
    const saved=await creation;expect(saved.saved).toBe(true);await removal;
    expect(await first.v.getPatientNote(saved.resultNoteId)).toMatchObject({visitContext:binding.visitContext});
    expect((await first.v.getPatientVisits(row.patientId)).some(x=>x.visitId===row.visitId)).toBe(false);
  });
});
