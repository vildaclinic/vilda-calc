import { describe, expect, it, vi } from 'vitest';
import { authProductionSource, authProductionFunction, authReturnEnvironment, authDeferred } from '../support/search-return-auth-harness.mjs';
import { applyPatientProfileAuthHooks, reversePatientProfileAuthHooks } from '../../tools/patient-profile-auth-hooks.mjs';
import { gabinetAuthLayers } from '../../tools/home-gabinet-auth-hooks.mjs';

const source = authProductionSource();
const helpers = ['HomeProfileCopy','HomeProfileBegin','HomeProfileRead','HomeProfilePayload','HomeProfileData',
  'HomeProfileHistory','HomeProfileConflictChoices','HomeProfileResolve','HomeProfileUnavailable','HomeProfileSave'].map(name => authProductionFunction(source,name)).join('\n');
const control = value => ({value:value == null ? '' : String(value),focus:vi.fn()});
const fixturePayload = () => ({name:'Fikcyjny Jan',user:{firstName:'Jan',lastName:'Fikcyjny',dobISO:'2013-11-03',sex:'M',
  age:12,ageMonths:3,height:151,weight:41,measuredAtISO:'2026-02-03'},
  advanced:{motherHeight:166,fatherHeight:180,data:{measurements:[{ageMonths:120,height:140,weight:30}]}},
  guardian:{name:'Fikcyjny opiekun',relation:'inny'},
  perinatal:{gestationalWeeks:34,gestationalDays:2,birthWeightG:1900,birthWeightSds:-1.3,birthLengthSds:-0.8,
    sdsSourceLabel:'Fikcyjne źródło',catchUp:false},
  puberty:{cdgpDeclared:'nie'},clinical:{downSyndrome:true},
  birth:{assessment:{fictional:'unchanged'}},visit:{visitId:'fictional-history-visit',patientId:'fictional-patient'}});
function environment({integrated=true}={}) {
  const payload=fixturePayload();
  const profile={status:'ready',editable:true,revisionId:'prf-fictional-1',heads:['prf-fictional-1'],history:[],data:{
    user:{firstName:'Jan',lastName:'Fikcyjny',dobISO:'2013-11-03',sex:'M'},
    advanced:{motherHeight:166,fatherHeight:180},guardian:{name:'Fikcyjny opiekun',relation:'inny'},
    perinatal:structuredClone(payload.perinatal),puberty:{cdgpDeclared:'nie'},clinical:{downSyndrome:true}}};
  const error={textContent:'',children:[],appendChild(node){this.children.push(node);}}, finished=vi.fn();
  const legacySave=vi.fn(), calculate=vi.fn(), busy=vi.fn(), event=vi.fn();
  const ctxBindings={Kt:busy,Bzw_czekaj:()=>vi.fn(),Bzw_koniec:vi.fn(),Bzw_usunieta:()=>false,
    Bzw_zablokuj:vi.fn(),Bzw_blad:(_error,_button,message)=>message,
    Gr4:value=>value,e:(tag,attrs,children)=>({tag,...attrs,children}),
    L:error,t:'fictional-patient',a:null,n:null,c:payload,d:{snapshotId:'fictional-snapshot'},
    bn:()=>({screen:'edit'}),$n:finished,se:vi.fn(),fi:vi.fn(),
    Bpz:payload.puberty,DsZ:payload.clinical,it:payload.perinatal,tt:'inny',Ds0:{checked:true},
    z:control('Fikcyjny'),I:control('Jan'),T:control('03-11-2013'),N:control(12),Z:control(3),H:control('M'),
    V:control(151),ut:control(41),wt:control(166),bt:control(180),
    ot:control('Fikcyjny opiekun'),gt:control(''),yt:control(''),
    ht:control(34),_:control(2),Q:control(1900),mt:control(''),f:control(''),K:control(''),P:control(''),
    Bp0:control(''),Bp1:control(''),Bp1h:control(''),Bp1k:control(''),Bpg0:control(''),Bpg1:control(''),Bpg2:control(''),
  };
  const env=authReturnEnvironment(helpers+'\n'+authProductionFunction(source,'A','fi')+'\n'+authProductionFunction(source,'rt','fi'),ctxBindings,source);
  const {context,vault,win}=env;let session=1;
  vault.captureSyncOperationSession=()=>({id:session});
  vault.assertSyncOperationSession=token=>{if(token.id!==session)throw Error('FICTIONAL_SESSION_STALE');};
  vault.parseDobFromDisplay=value=>value==='03-11-2013'?'2013-11-03':null;
  vault.savePatient=legacySave;
  vault.getPatient=vi.fn(async()=>({snapshots:[{snapshotId:'fictional-snapshot',payload}]}));
  vault.savePatientProfile=vi.fn(async(command,options)=>{
    if(!options.isCurrent())throw Error('FICTIONAL_OWNER_LOST');
    return {...profile,revisionId:'prf-fictional-2',data:structuredClone(command.data)};
  });
  win.__VILDA_HOME_GABINET_PREVIEW__=integrated;
  let selected='fictional-patient';
  win.sessionStorage={getItem:()=>selected};win._vildaCurrentPatientId='fictional-patient';
  win.CustomEvent=CustomEvent;win.calculateGrowthAdvanced=calculate;
  env.document.addEventListener('vilda:patient-profile-changed',event);
  const surface={isConnected:true};
  context.o=vault;context.Ppf=context.HomeProfileBegin(vault,'fictional-patient');
  if(context.Ppf){context.Ppf.watch(surface);context.HomeProfileRead(context.Ppf,{profile});
    context.c=context.HomeProfilePayload(payload,profile);}
  return {...env,profile,payload,error,finished,legacySave,calculate,busy,event,surface,
    loseSession(){session+=1;},changePatient(){selected='fictional-other-patient';}};
}

describe('separate patient profile AuthUI',()=>{
  it('round-trips the exact optional layer and retains the original validated editor outside it',()=>{
    const base=reversePatientProfileAuthHooks(source);
    expect(applyPatientProfileAuthHooks(base)).toBe(source);
    expect(applyPatientProfileAuthHooks(source)).toBe(source);
    expect(gabinetAuthLayers(source).replay(gabinetAuthLayers(source).base)).toBe(source);
    // The native form validation and legacy branch survive exact reversal.
    expect(authProductionFunction(base,'rt','fi')).toContain('await o.savePatient(At,');
    expect(authProductionFunction(base,'rt','fi')).not.toContain('HomeProfileSave');
  });
  it('runs the real Save handler and writes only the profile, preserving exact historical/live data',async()=>{
    const h=environment(),before=structuredClone(h.payload);
    h.context.ot.value='Fikcyjna nowa opiekunka';h.context.wt.value='169';
    h.context.z.value='Fikcyjna';h.context.H.value='K';h.context.ht.value='35';h.context.Ds0.checked=false;
    await h.context.rt();
    expect(h.vault.savePatientProfile).toHaveBeenCalledOnce();
    const [command,options]=h.vault.savePatientProfile.mock.calls[0];
    expect(command.patientId).toBe('fictional-patient');expect(command.expectedRevisionId).toBe('prf-fictional-1');
    expect(command.data.user).toEqual({firstName:'Jan',lastName:'Fikcyjna',dobISO:'2013-11-03',sex:'F'});
    expect(command.data.guardian.name).toBe('Fikcyjna nowa opiekunka');expect(command.data.advanced.motherHeight).toBe(169);
    expect(command.data.perinatal).toEqual({...before.perinatal,gestationalWeeks:35});
    expect(command.data.birth).toBeUndefined();expect(command.data.visit).toBeUndefined();expect(command.data.clinical).toBeUndefined();
    expect(options.isCurrent()).toBe(true);expect(h.payload).toEqual(before);
    expect(h.legacySave).not.toHaveBeenCalled();expect(h.vault.getPatient).not.toHaveBeenCalled();
    expect(h.calculate).not.toHaveBeenCalled();expect(h.finished).toHaveBeenCalledOnce();
    expect(h.event).toHaveBeenCalledOnce();expect(h.event.mock.calls[0][0].detail).toEqual({patientId:'fictional-patient'});
    expect(h.busy).toHaveBeenCalledWith(false);
  });
  it('keeps original surname/DOB/puberty validation before any profile write',async()=>{
    for(const [field,value,message] of [['z','','Nazwisko'],['T','31-99-2013','data urodzenia'],
      ['Bp0','1','Wiek startu'],['Bp1','12','Menarche dotyczy']]){
      const h=environment();h.context[field].value=value;await h.context.rt();
      expect(h.error.textContent).toContain(message);expect(h.vault.savePatientProfile).not.toHaveBeenCalled();
      expect(h.legacySave).not.toHaveBeenCalled();
    }
  });
  it('leaves stale edits in place and offers explicit reload without overwriting or adopting a new revision',async()=>{
    const h=environment();h.context.ot.value='Fikcyjna niezapisana zmiana';
    h.vault.savePatientProfile.mockRejectedValue(Object.assign(Error('stale'),{code:'PATIENT_PROFILE_STALE',
      current:{...h.profile,revisionId:'prf-foreign-current'}}));
    await h.context.rt();
    expect(h.context.Ppf.profile.revisionId).toBe('prf-fictional-1');
    expect(h.context.ot.value).toBe('Fikcyjna niezapisana zmiana');expect(h.finished).not.toHaveBeenCalled();
    expect(h.error.textContent).toContain('Kartoteka zmieniła');expect(h.error.children[0].text).toBe('Wczytaj aktualną kartotekę');
    expect(h.event).not.toHaveBeenCalled();expect(h.legacySave).not.toHaveBeenCalled();
  });
  it('keeps an unchanged receipt free of metadata events and other clinical writes',async()=>{
    const h=environment();h.vault.savePatientProfile.mockResolvedValue({...h.profile,unchanged:true});
    await h.context.rt();expect(h.finished).toHaveBeenCalledOnce();expect(h.event).not.toHaveBeenCalled();
    expect(h.legacySave).not.toHaveBeenCalled();expect(h.calculate).not.toHaveBeenCalled();
  });
  it('distinguishes a preserved concurrent revision from a rejected precommit',async()=>{
    const h=environment();h.vault.savePatientProfile.mockRejectedValue(Object.assign(Error('concurrent'),{
      code:'PATIENT_PROFILE_CONFLICT',committedRevisionId:'prf-fictional-preserved'}));
    await h.context.rt();expect(h.error.textContent).toContain('została zapisana obok drugiej wersji');
    expect(h.error.textContent).not.toContain('Nie zapisano');
    expect(h.error.children[0].text).toBe('Porównaj zapisane wersje');expect(h.finished).not.toHaveBeenCalled();
    expect(h.context.Ppf.profile.revisionId).toBe('prf-fictional-1');expect(h.event).not.toHaveBeenCalled();
  });
  it('resolves only an explicitly confirmed full version against the original set of heads',async()=>{
    const h=environment(),reload=vi.fn(),chosen=structuredClone(h.profile.data),heads=['prf-left','prf-right'];
    h.context.HomeProfileRead(h.context.Ppf,{profile:{status:'conflict',editable:false,data:null,heads,history:[]}});
    h.win.confirm=vi.fn(()=>false);h.vault.resolvePatientProfile=vi.fn(async(command,options)=>{
      expect(options.isCurrent()).toBe(true);return {...h.profile,data:command.data};
    });
    expect(await h.context.HomeProfileResolve(h.context.Ppf,chosen,h.error,reload)).toBe(false);
    expect(h.vault.resolvePatientProfile).not.toHaveBeenCalled();
    h.win.confirm.mockReturnValue(true);
    expect(await h.context.HomeProfileResolve(h.context.Ppf,chosen,h.error,reload)).toBe(true);
    const [command]=h.vault.resolvePatientProfile.mock.calls[0];
    expect(command).toEqual({patientId:'fictional-patient',expectedHeadIds:heads,data:chosen});
    expect(command.expectedHeadIds).not.toBe(heads);expect(command.data).not.toBe(chosen);
    expect(reload).toHaveBeenCalledOnce();expect(h.event).toHaveBeenCalledOnce();
    expect(h.vault.savePatientProfile).not.toHaveBeenCalled();expect(h.legacySave).not.toHaveBeenCalled();
  });
  it('uses immutable revision dates and parent comparisons for the read-only history',()=>{
    const h=environment(),base=structuredClone(h.profile.data),other={...base,guardian:{name:'Fikcyjna zmiana'}};
    const node=h.context.HomeProfileHistory({revisionId:'prf-b',history:[
      {revisionId:'prf-a',parents:[],createdAtISO:'2026-11-01T12:00:00Z',data:base},
      {revisionId:'prf-b',parents:['prf-a'],createdAtISO:'2026-11-02T12:00:00Z',data:other},
    ]});
    expect(node.children[1].children[0].children[0].text).toContain('2026-11-02');
    expect(node.children[1].children[0].children[1].text).toBe(' — Opiekun / kontakt');
    expect(h.vault.savePatientProfile).not.toHaveBeenCalled();expect(h.legacySave).not.toHaveBeenCalled();
  });
  it('passes the original live owner into precommit and does not acknowledge after session/surface loss',async()=>{
    for(const retire of [h=>h.loseSession(),h=>h.lock(),h=>h.changePatient(),h=>{h.surface.isConnected=false;}]){
      const h=environment(),pending=authDeferred();
      h.vault.savePatientProfile.mockImplementation(async(_command,options)=>{
        await pending.promise;if(!options.isCurrent())throw Error('FICTIONAL_PRECOMMIT_DENIED');return h.profile;
      });
      const save=h.context.rt();retire(h);pending.resolve();await save;
      expect(h.finished).not.toHaveBeenCalled();expect(h.event).not.toHaveBeenCalled();
      expect(h.legacySave).not.toHaveBeenCalled();
    }
  });
  it('does not display stale fallback values when a current profile field was cleared',()=>{
    const h=environment(),profile={...h.profile,data:{user:{lastName:'Fikcyjny',sex:'M'}}};
    const projected=h.context.HomeProfilePayload(h.payload,profile);
    expect(projected.user.firstName).toBeUndefined();expect(projected.user.dobISO).toBeUndefined();
    expect(projected.advanced.motherHeight).toBeUndefined();expect(projected.guardian).toBeUndefined();
    expect(projected.user.height).toBe(151);expect(projected.birth).toEqual(h.payload.birth);
    expect(h.payload.guardian.name).toBe('Fikcyjny opiekun');
  });
  it('preserves the native save path outside the explicit integrated preview',async()=>{
    const h=environment({integrated:false});await h.context.rt();
    expect(h.context.Ppf).toBeNull();expect(h.vault.savePatientProfile).not.toHaveBeenCalled();
    expect(h.legacySave).toHaveBeenCalledOnce();expect(h.legacySave.mock.calls[0][0].user.height).toBe(151);
  });
});
