import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const exporterSource=fs.readFileSync(path.join(root,'vilda_data_import_export.js'),'utf8');
const consumerSource=fs.readFileSync(path.join(root,'gh_therapy_monitor.js'),'utf8');
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const X={version:1,name:'Fikcyjny Start',user:{age:8,ageMonths:0,sex:'M',height:126,weight:25}};
const Y={version:1,name:'Fikcyjny Cel',user:{age:11,ageMonths:0,sex:'F',height:141,weight:36}};
const ID_X='fictional-source-patient',ID_Y='fictional-target-patient',ID_Z='fictional-newer-patient';
function events(target={}){const map=new Map();return Object.assign(target,{
 addEventListener(type,fn){if(!map.has(type))map.set(type,[]);map.get(type).push(fn)},
 removeEventListener(type,fn){map.set(type,(map.get(type)||[]).filter(x=>x!==fn))},
 dispatchEvent(event){for(const fn of [...(map.get(event.type)||[])])fn(event);return true},
})}
function storage(){const map=new Map();return {getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,String(value)),removeItem:key=>map.delete(key),key:i=>[...map.keys()][i]??null,get length(){return map.size}}}
async function flush(){for(let i=0;i<12;i++)await Promise.resolve()}
function environment({session=X,sourcePatient=ID_X,initialPid=null}={}){
 const observers=new Set(),body={},frames=[],appReady=[],ss=storage(),ls=storage();let modal=null,current=clone(session),epoch=1,user='fictional-account',unlocked=true,authReady=true,frameHidden=false;
 const doc=events({readyState:'complete',hidden:false,body,documentElement:{classList:{contains:()=>false,add(){},remove(){}}},getElementById:()=>null,querySelector:s=>s==='.vug-backdrop'?modal:null,querySelectorAll:()=>[]});
 const host=events({document:{},history:{state:{shellNavId:7,shellView:'docpro'}},location:{hash:'#/docpro'}});
 function mutate(target,attribute){for(const o of observers)if(o.target===target&&(!attribute||!o.options.attributeFilter||o.options.attributeFilter.includes(attribute)))Promise.resolve().then(()=>{if(observers.has(o))o.callback([{type:attribute?'attributes':'childList',attributeName:attribute}])})}
 const frame={};Object.defineProperty(frame,'hidden',{get:()=>frameHidden,set:value=>{if(frameHidden!==value){frameHidden=value;mutate(frame,'hidden')}}});
 class Observer{constructor(callback){this.callback=callback}observe(target,options){this.target=target;this.options=options;observers.add(this)}disconnect(){observers.delete(this)}}
 const win=events({document:doc,sessionStorage:ss,localStorage:ls,parent:host,frameElement:frame,location:{href:'http://localhost/docpro.html?embedded=1',pathname:'/docpro.html'},
 setTimeout,clearTimeout,setInterval,clearInterval,Promise,MutationObserver:Observer,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail}},
 requestAnimationFrame:fn=>{frames.push(fn);return frames.length},cancelAnimationFrame(){},VildaGuestMode:false,_vildaCurrentPatientId:initialPid,
 });win.window=win;win.self=win;
 if(sourcePatient!==null)ss.setItem('vildaCurrentPatientId',sourcePatient);
 const vault={isUnlocked:()=>unlocked,getCurrentUser:()=>unlocked?{userId:user}:null,captureSyncOperationSession:()=>{if(!unlocked)throw new Error('locked');return {epoch,user}},assertSyncOperationSession:ticket=>{if(!unlocked||ticket.epoch!==epoch||ticket.user!==user)throw new Error('stale')},
 onUnlock(fn){this.unlockListeners.push(fn)},onLock(fn){this.lockListeners.push(fn)},unlockListeners:[],lockListeners:[],
 getPatient:vi.fn(async id=>({patientId:id,snapshotCount:1,snapshots:[{savedAtISO:'2026-10-31T12:00:00Z',payload:clone(Y)}]})),savePatient:vi.fn(async()=>({patientId:ID_X,snapshotId:'fictional-snapshot'}))};
 win.VildaVault=vault;win.VildaAuthUI={isBootReady:()=>authReady};
 const persistence={getStorage:()=>ss,readMainSession:vi.fn(()=>clone(current)),writeMainSession:vi.fn(value=>{current=clone(value);return true}),clearMainSession:vi.fn(()=>{current=null;return true}),readClcrSession:()=>null};win.VildaPersistence=persistence;
 new Function('window','globalThis',exporterSource)(win,win);const api=win.VildaDataImportExport;
 const initialApply=vi.fn(()=>{win._vildaCurrentPatientId=sourcePatient;return true});
 const options={persistence,collectUserData:()=>clone(current||X),anyDataEntered:()=>false,applyLoadedData:initialApply,vildaAppOnReady:(_name,fn)=>appReady.push(fn)};
 const applied=vi.fn(()=>true),highlight=vi.fn();win.applyLoadedData=applied;
 const start=consumerSource.indexOf('// A GH navigation intent waits for the FIRST restore'),end=consumerSource.indexOf('function X(){',start);
 if(start<0||end<0)throw new Error('Actual consumer source missing');
 const N=new Function('window','document','pe','setTimeout',consumerSource.slice(start,end)+';return N;')(win,doc,highlight,setTimeout);
 const calls=[];let guardMode='cancel';
 win.VildaUnsavedGuard={run:vi.fn(opt=>{calls.push(opt);if(guardMode==='cancel')opt.onCancel();else if(guardMode==='proceed')opt.onProceed();else showModal()})};
 function showModal(){modal={isConnected:true,parentNode:body};mutate(body);return modal}
 function removeModal(){const m=modal;if(m){m.isConnected=false;m.parentNode=null;modal=null;mutate(body)}}
 function intent(id=ID_Y,point='fictional-point'){const raw=JSON.stringify({patientId:id,ghPointId:point,ts:Date.now()});ss.setItem('vilda:gh-jump',raw);return raw}
 async function finishBoot(){api.initMainSessionPersistence(options);for(const fn of appReady.splice(0))fn();while(frames.length){frames.shift()();await flush()}vi.advanceTimersByTime(0);await flush()}
 return {win,doc,host,frame,ss,vault,persistence,api,options,initialApply,applied,highlight,N,calls,frames,appReady,
 intent,showModal,removeModal,finishBoot,guardMode:value=>{guardMode=value},runFrame:()=>{const fn=frames.shift();if(!fn)throw new Error('No queued frame');fn()},
 setSession:value=>{current=clone(value)},switchAccount:()=>{user='fictional-other-account';epoch++},lock:()=>{unlocked=false;epoch++},setAuth:(a,b)=>{authReady=a;unlocked=b},
 notifyUnlock:()=>{for(const fn of vault.unlockListeners)fn({userId:user,trigger:'restore'})},observerCount:()=>observers.size,
 };
}
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-31T12:00:00Z'))});
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers()});

describe('producer startup settlement from actual Kt/Fe/Mt',()=>{
 it('includes app-ready, both queued frames, restore and finalizer before resolving',async()=>{
  const h=environment(),done=vi.fn();h.api.whenInitialMainSessionRestoreSettled().then(done);await flush();expect(done).not.toHaveBeenCalled();
  h.api.initMainSessionPersistence(h.options);await flush();expect(done).not.toHaveBeenCalled();h.appReady.shift()();
  h.runFrame();await flush();expect(h.initialApply).not.toHaveBeenCalled();expect(done).not.toHaveBeenCalled();
  h.runFrame();await flush();expect(h.initialApply).toHaveBeenCalledTimes(1);expect(h.win.__vildaPersistRestoring).toBe(true);expect(done).not.toHaveBeenCalled();
  h.runFrame();expect(done).not.toHaveBeenCalled();vi.runOnlyPendingTimers();await flush();expect(h.win.__vildaPersistRestoring).toBe(false);expect(done).toHaveBeenCalledWith({ready:true,reason:'restored',waited:true});
  expect(await h.api.whenInitialMainSessionRestoreSettled()).toEqual({ready:true,reason:'restored',waited:false});
 });
 it('settles a genuinely absent session without needing Mt',async()=>{const h=environment({session:null});const p=h.api.whenInitialMainSessionRestoreSettled();await h.finishBoot();expect(await p).toEqual({ready:true,reason:'empty',waited:true});expect(h.initialApply).not.toHaveBeenCalled()});
 it('settles a deliberate anonymous-form skip and preserves the form',async()=>{const h=environment({sourcePatient:null});h.options.anyDataEntered=()=>true;const p=h.api.whenInitialMainSessionRestoreSettled();await h.finishBoot();expect(await p).toEqual({ready:true,reason:'kept-form',waited:true});expect(h.initialApply).not.toHaveBeenCalled()});
 it.each(['reader','storage','throw','missing-apply'])('does not grant readiness after %s failure',async kind=>{const h=environment();if(kind==='reader')delete h.persistence.readMainSession;if(kind==='storage')h.persistence.getStorage=()=>null;if(kind==='throw')h.persistence.readMainSession.mockImplementation(()=>{throw new Error('fictional read failure')});if(kind==='missing-apply'){h.options.applyLoadedData=null;delete h.win.applyLoadedData;}const p=h.api.whenInitialMainSessionRestoreSettled();await h.finishBoot();expect((await p).ready).toBe(false)});
 it('settles explicit false apply only after actual finalizer cleanup',async()=>{const h=environment();h.initialApply.mockReturnValue(false);const p=h.api.whenInitialMainSessionRestoreSettled();await h.finishBoot();expect(await p).toEqual({ready:false,reason:'apply-refused',waited:true});expect(h.win.__vildaPersistRestoring).toBe(false)});
 it('waits for the actual auth resume before its restore attempt',async()=>{const h=environment();h.setAuth(false,false);const p=h.api.whenInitialMainSessionRestoreSettled(),done=vi.fn();p.then(done);h.api.restoreMainSessionIfAny(h.options);await flush();expect(done).not.toHaveBeenCalled();h.setAuth(true,true);h.notifyUnlock();while(h.frames.length){h.runFrame();await flush()}vi.runOnlyPendingTimers();await flush();expect(await p).toMatchObject({ready:true,reason:'restored',waited:true})});
 it('marks real successful own save as supersession for old waiters only',async()=>{const h=environment();const p=h.api.whenInitialMainSessionRestoreSettled();expect((await h.api.saveUserDataWithReceipt({collectUserData:()=>clone(X)})).saved).toBe(true);expect(await p).toEqual({ready:true,reason:'superseded-save',waited:true});expect(await h.api.whenInitialMainSessionRestoreSettled()).toEqual({ready:true,reason:'superseded-save',waited:false})});
 it('settles actual full Clear and does not reopen after a later restore attempt',async()=>{const h=environment();const p=h.api.whenInitialMainSessionRestoreSettled();expect(h.api.clearAllData()).toBe(true);expect(await p).toEqual({ready:true,reason:'superseded-clear',waited:true});await h.finishBoot();expect(await h.api.whenInitialMainSessionRestoreSettled()).toEqual({ready:true,reason:'superseded-clear',waited:false})});
 it('settles scheduling failure instead of leaving the consumer waiting',async()=>{const h=environment();h.win.requestAnimationFrame=()=>{throw new Error('fictional scheduling failure')};const p=h.api.whenInitialMainSessionRestoreSettled();h.api.initMainSessionPersistence(h.options);expect(()=>h.appReady.shift()()).toThrow('fictional scheduling failure');expect(await p).toEqual({ready:false,reason:'schedule-failed',waited:true})});
});

describe('actual GH N handles one intent before its first guard',()=>{
 it('does not fetch or capture a guard during queued or active bootstrap',async()=>{const h=environment();h.intent();const n=h.N();await flush();expect(h.vault.getPatient).not.toHaveBeenCalled();expect(h.calls).toHaveLength(0);await h.finishBoot();await n;expect(h.calls).toHaveLength(1);expect(h.vault.getPatient).toHaveBeenCalledTimes(1);expect(h.win.__vildaPersistRestoring).toBe(false);expect(h.ss.getItem('vilda:gh-jump')).toBeNull()});
 it('coalesces repeated 350/700 triggers for the same exact intent',async()=>{const h=environment();h.intent();const p=h.N(),q=h.N();await h.finishBoot();await Promise.all([p,q]);expect(h.vault.getPatient).toHaveBeenCalledTimes(1);expect(h.calls).toHaveLength(1)});
 it('does not consume a replacement from an old waiter',async()=>{const h=environment();h.intent(ID_Y);const p=h.N();const newer=h.intent(ID_Z,'fictional-new-point');const q=h.N();expect(h.ss.getItem('vilda:gh-jump')).toBe(newer);await h.finishBoot();await Promise.all([p,q]);expect(h.vault.getPatient).toHaveBeenCalledTimes(1);expect(h.vault.getPatient).toHaveBeenCalledWith(ID_Z);expect(h.calls).toHaveLength(1)});
 it.each(['account','patient','away-back'])('cancels a waiting intent after %s changes',async kind=>{const h=environment();h.intent();const p=h.N();if(kind==='account')h.switchAccount();if(kind==='patient')h.ss.setItem('vildaCurrentPatientId',ID_Z);if(kind==='away-back'){h.frame.hidden=true;h.frame.hidden=false;await flush()}await h.finishBoot();await p;expect(h.vault.getPatient).not.toHaveBeenCalled();expect(h.calls).toHaveLength(0);expect(h.ss.getItem('vilda:gh-jump')).toBeNull()});
 it('waits before its first guard while an unrelated real backdrop exists',async()=>{const h=environment({initialPid:ID_X});await h.finishBoot();h.showModal();const raw=h.intent(),p=h.N();await flush();expect(h.calls).toHaveLength(0);expect(h.vault.getPatient).not.toHaveBeenCalled();expect(h.ss.getItem('vilda:gh-jump')).toBe(raw);h.removeModal();await flush();await p;expect(h.calls).toHaveLength(1)});
 it('never applies an old attempt when a distinct new intent waits for its modal',async()=>{const h=environment({initialPid:ID_X});await h.finishBoot();h.guardMode('hold');h.intent(ID_Y);await h.N();const old=h.calls[0];h.intent(ID_Z,'fictional-new-point');const next=h.N();await flush();expect(h.calls).toHaveLength(1);old.onProceed();expect(h.applied).not.toHaveBeenCalled();h.guardMode('cancel');h.removeModal();await flush();await next;expect(h.calls).toHaveLength(2);expect(h.vault.getPatient).toHaveBeenLastCalledWith(ID_Z)});
 it('invalid Save removal without callbacks cannot strand the next intent',async()=>{const h=environment({initialPid:ID_X});await h.finishBoot();h.guardMode('hold');h.intent();await h.N();const old=h.calls[0];h.removeModal();await flush();h.guardMode('cancel');h.intent();await h.N();expect(h.calls).toHaveLength(2);old.onProceed();expect(h.applied).not.toHaveBeenCalled()});
 it('uses the existing 60s only before the first guard',async()=>{const h=environment();h.intent();const p=h.N();vi.advanceTimersByTime(60001);await h.finishBoot();await p;expect(h.calls).toHaveLength(0);expect(h.vault.getPatient).not.toHaveBeenCalled()});
 it('keeps a valid shown guard usable after that initial TTL',async()=>{const h=environment({initialPid:ID_X});await h.finishBoot();h.guardMode('hold');h.intent();await h.N();vi.advanceTimersByTime(61000);h.removeModal();h.calls[0].onProceed();expect(h.applied).toHaveBeenCalledTimes(1);expect(h.win._vildaCurrentPatientId).toBe(ID_Y)});
 it('leaves a guard-authorized own-save PID handoff to that guard',async()=>{const h=environment({sourcePatient:null});await h.finishBoot();h.guardMode('hold');h.intent();await h.N();h.ss.setItem('vildaCurrentPatientId','fictional-own-new-patient');h.win._vildaCurrentPatientId='fictional-own-new-patient';h.removeModal();h.calls[0].onProceed();expect(h.applied).toHaveBeenCalledTimes(1);expect(h.win._vildaCurrentPatientId).toBe(ID_Y)});
 it('rejects a late onProceed after the actual session ticket changed',async()=>{const h=environment({initialPid:ID_X});await h.finishBoot();h.guardMode('hold');h.intent();await h.N();h.lock();h.removeModal();h.calls[0].onProceed();expect(h.applied).not.toHaveBeenCalled()});
 it('fails closed when the guard module is absent',async()=>{const h=environment({initialPid:ID_X});await h.finishBoot();delete h.win.VildaUnsavedGuard;h.intent();await h.N();expect(h.applied).not.toHaveBeenCalled();expect(h.ss.getItem('vilda:gh-jump')).toBeNull()});
});


// Real producer + readonly indicator. Scheduling remains controlled by the
// existing fixture; no copied calculation, restore implementation or budget.
describe('main-session finalizer ownership across explicit Clear/load',()=>{
 function indicator(h){
  h.win.console={debug(){},table(){},log(){}};
  const source=fs.readFileSync(path.join(root,'vilda_save_status_indicator.js'),'utf8');
  new Function('window','globalThis',source)(h.win,h.win);
 }
 function begin(h){h.api.initMainSessionPersistence(h.options);h.appReady.shift()();h.runFrame();h.runFrame();expect(h.win.__vildaPersistRestoring).toBe(true)}
 async function finish(h){while(h.frames.length){h.runFrame();await flush()}vi.advanceTimersByTime(5000);await flush()}
 it.each(['before-finalizer-frame','after-finalizer-frame'])('full Clear releases only its producer at %s and never republishes its session',async phase=>{
  const h=environment();indicator(h);const restored=vi.fn();h.doc.addEventListener('vilda:main-session-restored',restored);
  const settled=h.api.whenInitialMainSessionRestoreSettled();begin(h);
  if(phase==='after-finalizer-frame')h.runFrame();
  expect(h.api.clearAllData()).toBe(true);
  expect(h.win.__vildaPersistRestoring).toBe(false);
  expect(h.win.VildaSaveStatusIndicator.getCurrentDecision().ready).toBe(true);
  expect(await settled).toEqual({ready:true,reason:'superseded-clear',waited:true});
  await finish(h);
  expect(h.win.__vildaPersistRestoring).toBe(false);
  expect(h.persistence.writeMainSession).not.toHaveBeenCalled();
  expect(restored).not.toHaveBeenCalled();
  expect(h.win.VildaSaveStatusIndicator.getCurrentDecision().ready).toBe(true);
 });
 it('preserves a surrounding restore flag when its own finalizer is cancelled',async()=>{
  const h=environment();h.win.__vildaPersistRestoring=true;begin(h);h.runFrame();
  expect(h.api.clearAllData()).toBe(true);expect(h.win.__vildaPersistRestoring).toBe(true);
  await finish(h);expect(h.win.__vildaPersistRestoring).toBe(true);expect(h.persistence.writeMainSession).not.toHaveBeenCalled();
 });
 it('an invalidated frame cannot release the newer explicit restore',async()=>{
  const h=environment(),restored=vi.fn();h.doc.addEventListener('vilda:main-session-restored',restored);begin(h);
  // cancelAnimationFrame is deliberately a no-op in this existing fixture.
  expect(h.win.vildaSession.restore()).toBe(true);
  h.runFrame();expect(h.win.__vildaPersistRestoring).toBe(true);
  await finish(h);expect(h.win.__vildaPersistRestoring).toBe(false);
  expect(h.persistence.writeMainSession).toHaveBeenCalledTimes(1);expect(restored).toHaveBeenCalledTimes(1);
 });
 it('Clear synchronously inside session apply prevents the old Fe from scheduling a finalizer',async()=>{
  const h=environment(),restored=vi.fn();h.doc.addEventListener('vilda:main-session-restored',restored);
  h.initialApply.mockImplementation(()=>{h.api.clearAllData();return true});
  h.api.initMainSessionPersistence(h.options);h.appReady.shift()();h.runFrame();h.runFrame();
  expect(h.win.__vildaPersistRestoring).toBe(false);expect(h.frames).toHaveLength(0);
  await finish(h);expect(restored).not.toHaveBeenCalled();expect(h.persistence.writeMainSession).not.toHaveBeenCalled();
  expect(await h.api.whenInitialMainSessionRestoreSettled()).toMatchObject({ready:true,reason:'superseded-clear'});
 });
 it('an older Fe cannot release a newer restore started synchronously inside its apply',async()=>{
  const h=environment(),restored=vi.fn();h.doc.addEventListener('vilda:main-session-restored',restored);
  h.initialApply.mockImplementationOnce(()=>{h.options.applyLoadedData=vi.fn(()=>true);h.win.vildaSession.restore();return true});
  begin(h);expect(h.frames).toHaveLength(1);expect(h.win.__vildaPersistRestoring).toBe(true);
  await finish(h);expect(h.win.__vildaPersistRestoring).toBe(false);expect(restored).toHaveBeenCalledTimes(1);
 });
 it('a newer ordinary apply invalidates the old finalizer before committing its own fields',async()=>{
  const h=environment(),restored=vi.fn();h.doc.addEventListener('vilda:main-session-restored',restored);begin(h);
  expect(h.api.applyLoadedData(clone(Y),{source:'fictional-newer-load'})).toBe(true);
  const writes=h.persistence.writeMainSession.mock.calls.length;
  while(h.frames.length)h.runFrame();vi.advanceTimersByTime(0);await flush();
  expect(h.win.__vildaPersistRestoring).toBe(false);expect(restored).not.toHaveBeenCalled();
  expect(h.persistence.writeMainSession).toHaveBeenCalledTimes(writes);
 });
 it('failed finalizer scheduling releases its own flags and reports failure',async()=>{
  const h=environment(),settled=h.api.whenInitialMainSessionRestoreSettled();begin(h);
  const originalTimeout=globalThis.setTimeout;
  globalThis.setTimeout=()=>{throw new Error('fictional finalizer scheduling failure')};
  try{expect(()=>h.runFrame()).toThrow('fictional finalizer scheduling failure')}
  finally{globalThis.setTimeout=originalTimeout}
  expect(h.win.__vildaPersistRestoring).toBe(false);
  expect(await settled).toMatchObject({ready:false,reason:'schedule-failed'});
  expect(h.persistence.writeMainSession).not.toHaveBeenCalled();
 });
});


describe('public cancellation and explicit restore recovery outcomes',()=>{
 function begin(h){h.api.initMainSessionPersistence(h.options);h.appReady.shift()();h.runFrame();h.runFrame()}
 async function drain(h){while(h.frames.length){h.runFrame();await flush()}vi.advanceTimersByTime(5000);await flush()}
 it.each(['frame','timer'])('public session clear settles only the active cancelled producer at %s',async phase=>{
  const h=environment(),settled=h.api.whenInitialMainSessionRestoreSettled(),restored=vi.fn();h.doc.addEventListener('vilda:main-session-restored',restored);begin(h);if(phase==='timer')h.runFrame();
  expect(h.win.vildaSession.clear()).toBe(true);
  expect(await settled).toEqual({ready:true,reason:'superseded-session-clear',waited:true});
  expect(h.win.__vildaPersistRestoring).toBe(false);await drain(h);
  expect(restored).not.toHaveBeenCalled();expect(h.persistence.writeMainSession).not.toHaveBeenCalled();
 });
 it.each(['false','throw','unavailable'])('failed public session clear closes its cancelled producer: %s',async mode=>{
  const h=environment(),settled=h.api.whenInitialMainSessionRestoreSettled();begin(h);
  if(mode==='false')h.persistence.clearMainSession.mockReturnValue(false);
  if(mode==='throw')h.persistence.clearMainSession.mockImplementation(()=>{throw new Error('fictional clear failure')});
  if(mode==='unavailable')delete h.persistence.clearMainSession;
  expect(h.win.vildaSession.clear()).toBe(false);
  expect(await settled).toMatchObject({ready:false,reason:'session-clear-failed'});expect(h.win.__vildaPersistRestoring).toBe(false);await drain(h);
  expect(h.persistence.writeMainSession).not.toHaveBeenCalled();
 });
 it.each(['empty','missing-reader','reader-throw','unsupported'])('a newer public restore cancels older deferred output before %s',async mode=>{
  const h=environment(),settled=h.api.whenInitialMainSessionRestoreSettled(),restored=vi.fn();h.doc.addEventListener('vilda:main-session-restored',restored);begin(h);
  if(mode==='empty')h.setSession(null);
  if(mode==='missing-reader')delete h.persistence.readMainSession;
  if(mode==='reader-throw')h.persistence.readMainSession.mockImplementation(()=>{throw new Error('fictional read failure')});
  if(mode==='unsupported')h.setSession({version:999,name:'Fikcyjny błędny format'});
  expect(h.win.vildaSession.restore()).toBe(false);
  expect(await settled).toMatchObject({ready:mode==='empty',reason:mode==='empty'?'superseded-empty':mode==='missing-reader'?'missing-reader':mode==='reader-throw'?'restore-failed':'unsupported-session'});
  await drain(h);expect(h.win.__vildaPersistRestoring).toBe(false);expect(restored).not.toHaveBeenCalled();expect(h.persistence.writeMainSession).not.toHaveBeenCalled();
 });
 it.each([null,17,'fictional invalid payload'])('an actually refused invalid load leaves its original producer intact: %s',async payload=>{
  const h=environment(),settled=h.api.whenInitialMainSessionRestoreSettled();begin(h);
  expect(h.api.applyLoadedData(payload)).toBe(false);expect(h.win.__vildaPersistRestoring).toBe(true);
  await drain(h);expect(await settled).toMatchObject({ready:true,reason:'restored'});expect(h.persistence.writeMainSession).toHaveBeenCalledTimes(1);
 });
 it('an ordinary load that throws after cancelling its producer closes failed without old-session publication',async()=>{
  const h=environment(),settled=h.api.whenInitialMainSessionRestoreSettled();begin(h);
  const options={source:'fictional-failed-load'};
  Object.defineProperty(options,'syncSharedUserDataFromLoadedData',{get(){throw new Error('fictional load option failure')}});
  expect(()=>h.api.applyLoadedData(clone(Y),options)).toThrow('fictional load option failure');
  expect(await settled).toMatchObject({ready:false,reason:'superseded-load-failed'});await drain(h);expect(h.persistence.writeMainSession).not.toHaveBeenCalled();
 });
 it('public three-argument finalization transfers active ownership to its replacement',async()=>{
  const h=environment(),settled=h.api.whenInitialMainSessionRestoreSettled(),restored=vi.fn();h.doc.addEventListener('vilda:main-session-restored',restored);begin(h);
  h.api.finalizeMainSessionRestore(false,h.options,{ready:true,reason:'fictional-public-finalizer'});
  expect(h.win.__vildaPersistRestoring).toBe(true);expect(h.api.isMainSessionAutosavePaused()).toBe(true);
  h.runFrame();expect(h.win.__vildaPersistRestoring).toBe(true);
  await drain(h);expect(h.win.__vildaPersistRestoring).toBe(false);expect(restored).toHaveBeenCalledTimes(1);
  expect(await settled).toMatchObject({ready:true,reason:'fictional-public-finalizer'});
 });
 it('public two-argument finalization inherits the real active producer outcome',async()=>{
  const h=environment(),settled=h.api.whenInitialMainSessionRestoreSettled();begin(h);
  h.api.finalizeMainSessionRestore(false,h.options);expect(h.win.__vildaPersistRestoring).toBe(true);
  await drain(h);expect(await settled).toMatchObject({ready:true,reason:'restored'});expect(h.persistence.writeMainSession).toHaveBeenCalledTimes(1);
 });
 it('an old apply that starts a newer public restore and then throws cannot settle that newer producer',async()=>{
  const h=environment(),done=vi.fn();h.api.whenInitialMainSessionRestoreSettled().then(done);
  h.initialApply.mockImplementationOnce(()=>{h.win.vildaSession.restore();throw new Error('fictional old apply failure')});
  begin(h);await flush();expect(done).not.toHaveBeenCalled();expect(h.win.__vildaPersistRestoring).toBe(true);
  await drain(h);expect(done).toHaveBeenCalledWith({ready:true,reason:'superseded-restored',waited:true});expect(h.persistence.writeMainSession).toHaveBeenCalledTimes(1);
 });
 it('failed Mt rAF fallback scheduling releases its own producer despite the earlier successful apply',async()=>{
  const h=environment(),settled=h.api.whenInitialMainSessionRestoreSettled();
  h.api.initMainSessionPersistence(h.options);h.appReady.shift()();h.runFrame();
  h.initialApply.mockImplementationOnce(()=>{h.win.requestAnimationFrame=()=>{throw new Error('fictional finalizer frame failure')};return true});
  const originalTimeout=globalThis.setTimeout;globalThis.setTimeout=()=>{throw new Error('fictional fallback timer failure')};
  try{h.runFrame()}finally{globalThis.setTimeout=originalTimeout}
  expect(h.win.__vildaPersistRestoring).toBe(false);expect(await settled).toMatchObject({ready:false,reason:'schedule-failed'});
  expect(h.persistence.writeMainSession).not.toHaveBeenCalled();
 });
 it('explicit recovery upgrades new readiness requests while earlier failed waiters stay failed',async()=>{
  const h=environment();h.persistence.readMainSession.mockImplementationOnce(()=>{throw new Error('fictional startup read failure')});
  const old=h.api.whenInitialMainSessionRestoreSettled();begin(h);
  expect(await old).toMatchObject({ready:false,reason:'restore-failed'});
  expect(h.win.vildaSession.restore()).toBe(true);await drain(h);
  expect(await h.api.whenInitialMainSessionRestoreSettled()).toEqual({ready:true,reason:'superseded-restored',waited:false});
  expect(await old).toMatchObject({ready:false,reason:'restore-failed'});
 });

 it('public session clear also settles its sole cancelled auth-deferred producer',async()=>{
  const h=environment(),settled=h.api.whenInitialMainSessionRestoreSettled();h.setAuth(false,false);begin(h);
  expect(h.api.isMainSessionRestorePending()).toBe(true);expect(h.initialApply).not.toHaveBeenCalled();
  expect(h.win.vildaSession.clear()).toBe(true);expect(h.api.isMainSessionRestorePending()).toBe(false);
  expect(await settled).toMatchObject({ready:true,reason:'superseded-session-clear'});h.setAuth(true,true);h.notifyUnlock();await drain(h);expect(h.initialApply).not.toHaveBeenCalled();
 });
 it('a prior reader that starts a newer restore and throws cannot settle the newer producer',async()=>{
  const h=environment(),done=vi.fn();h.api.whenInitialMainSessionRestoreSettled().then(done);
  h.persistence.readMainSession.mockImplementationOnce(()=>{h.win.vildaSession.restore();throw new Error('fictional old reader failure')});
  begin(h);await flush();expect(done).not.toHaveBeenCalled();expect(h.win.__vildaPersistRestoring).toBe(true);
  await drain(h);expect(done).toHaveBeenCalledWith({ready:true,reason:'superseded-restored',waited:true});
 });
 it('public direct session apply closes a superseded sequence without stranding the first waiter',async()=>{
  const h=environment(),settled=h.api.whenInitialMainSessionRestoreSettled(),restored=vi.fn();h.doc.addEventListener('vilda:main-session-restored',restored);begin(h);
  expect(h.api.applyLoadedData(clone(Y),{isSessionRestore:true})).toBe(true);await drain(h);
  expect(await settled).toMatchObject({ready:false,reason:'superseded-restore-sequence'});expect(h.win.__vildaPersistRestoring).toBe(false);expect(restored).not.toHaveBeenCalled();expect(h.persistence.writeMainSession).not.toHaveBeenCalled();
 });
 it('auth deferral preserves explicit recovery intent for later new readiness requests',async()=>{
  const h=environment();h.persistence.readMainSession.mockImplementationOnce(()=>{throw new Error('fictional startup read failure')});
  const old=h.api.whenInitialMainSessionRestoreSettled();begin(h);expect(await old).toMatchObject({ready:false});
  h.setAuth(false,false);expect(h.win.vildaSession.restore()).toBe(false);expect(h.api.isMainSessionRestorePending()).toBe(true);
  h.setAuth(true,true);h.notifyUnlock();await drain(h);
  expect(await h.api.whenInitialMainSessionRestoreSettled()).toMatchObject({ready:true,reason:'superseded-restored',waited:false});expect(await old).toMatchObject({ready:false,reason:'restore-failed'});
 });

 it('a new explicit storage failure cancels the old auth resume before publishing that failure',async()=>{
  const h=environment(),old=h.api.whenInitialMainSessionRestoreSettled();h.setAuth(false,false);begin(h);
  expect(h.api.isMainSessionRestorePending()).toBe(true);
  const getStorage=h.persistence.getStorage;h.persistence.getStorage=()=>null;
  expect(h.win.vildaSession.restore()).toBe(false);expect(h.api.isMainSessionRestorePending()).toBe(false);
  expect(await old).toMatchObject({ready:false,reason:'storage-unavailable'});
  h.persistence.getStorage=getStorage;h.setAuth(true,true);h.notifyUnlock();await drain(h);
  expect(h.initialApply).not.toHaveBeenCalled();expect(h.persistence.writeMainSession).not.toHaveBeenCalled();
  expect(await h.api.whenInitialMainSessionRestoreSettled()).toMatchObject({ready:false,reason:'storage-unavailable'});
  expect(h.win.vildaSession.restore()).toBe(true);await drain(h);
  expect(await h.api.whenInitialMainSessionRestoreSettled()).toMatchObject({ready:true,reason:'superseded-restored'});
  expect(await old).toMatchObject({ready:false,reason:'storage-unavailable'});
 });
});


describe('fresh public main-session finalization preserves caller flags',()=>{
 async function ready(){const h=environment();await h.finishBoot();h.persistence.writeMainSession.mockClear();return h}
 async function drain(h){while(h.frames.length){h.runFrame();await flush()}vi.advanceTimersByTime(0);await flush()}
 it.each([
  [false,false],[false,true],[true,false],[true,true],
 ])('fresh public Mt keeps caller restoring=%s until its historical callback restores e=%s',async(callerFlag,previousFlag)=>{
  const h=await ready(),restored=vi.fn();h.doc.addEventListener('vilda:main-session-restored',restored);
  h.win.__vildaPersistRestoring=callerFlag;
  expect(h.api.isMainSessionAutosavePaused()).toBe(callerFlag);
  expect(h.api.finalizeMainSessionRestore(previousFlag,h.options,{ready:true,reason:'fictional-fresh-finalizer'})).toBe(true);
  expect(h.win.__vildaPersistRestoring).toBe(callerFlag);
  expect(h.api.isMainSessionAutosavePaused()).toBe(callerFlag);
  h.runFrame();
  expect(h.win.__vildaPersistRestoring).toBe(callerFlag);
  expect(h.api.isMainSessionAutosavePaused()).toBe(callerFlag);
  vi.advanceTimersByTime(0);await flush();
  expect(h.win.__vildaPersistRestoring).toBe(previousFlag);
  expect(h.api.isMainSessionAutosavePaused()).toBe(previousFlag);
  expect(h.persistence.writeMainSession).toHaveBeenCalledTimes(previousFlag?0:1);
  expect(restored).toHaveBeenCalledTimes(1);
 });
 it.each([false,true])('replacing a fresh public finalizer preserves caller restoring=%s until the replacement callback',async callerFlag=>{
  const h=await ready(),restored=vi.fn();h.doc.addEventListener('vilda:main-session-restored',restored);
  h.win.__vildaPersistRestoring=callerFlag;
  h.api.finalizeMainSessionRestore(false,h.options,{ready:true,reason:'fictional-fresh-original'});
  h.api.finalizeMainSessionRestore(false,h.options,{ready:true,reason:'fictional-fresh-replacement'});
  expect(h.win.__vildaPersistRestoring).toBe(callerFlag);
  expect(h.api.isMainSessionAutosavePaused()).toBe(callerFlag);
  await drain(h);
  expect(h.win.__vildaPersistRestoring).toBe(false);
  expect(h.persistence.writeMainSession).toHaveBeenCalledTimes(1);
  expect(restored).toHaveBeenCalledTimes(1);
 });
 it.each([[false,true],[true,false]])('cancelling a fresh finalizer preserves caller restoring=%s without applying callback e=%s',async(callerFlag,previousFlag)=>{
  const h=await ready(),restored=vi.fn();h.doc.addEventListener('vilda:main-session-restored',restored);
  h.win.__vildaPersistRestoring=callerFlag;
  h.api.finalizeMainSessionRestore(previousFlag,h.options,{ready:true,reason:'fictional-cancelled-fresh'});
  expect(h.api.clearMainSessionStorage(h.options)).toBe(true);
  expect(h.win.__vildaPersistRestoring).toBe(callerFlag);
  expect(h.api.isMainSessionAutosavePaused()).toBe(callerFlag);
  await drain(h);
  expect(h.win.__vildaPersistRestoring).toBe(callerFlag);
  expect(h.persistence.writeMainSession).not.toHaveBeenCalled();
  expect(restored).not.toHaveBeenCalled();
 });
});
