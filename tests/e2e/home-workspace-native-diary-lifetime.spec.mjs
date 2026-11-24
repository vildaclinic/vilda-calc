import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createFictionalVault, fictionalPatient, loadPatient } from '../support/centile-live-fixture.mjs';
import assert from 'node:assert/strict';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(180_000);
const nativeSource = readFileSync(new URL('../../vilda_cykle_leczenia.js', import.meta.url), 'utf8');
const oldNativeSource = readFileSync(new URL('../fixtures/home-b1-before-diary-lifetime.js.txt', import.meta.url), 'utf8');
const points = [
  { id:'fictional-start', type:'start', dateISO:'2026-04-14', ageYears:13, ageMonths:0, weight:80, height:160, drug:'Wegovy (semaglutyd) – s.c. 1×/tydz.', dose:'0,25 mg / tydz.' },
  { id:'fictional-control', type:'continue', dateISO:'2026-10-13', ageYears:13, ageMonths:6, weight:75.2, height:162.9, drug:'Wegovy (semaglutyd) – s.c. 1×/tydz.', dose:'2,4 mg / tydz.' },
];
async function setup(page, { guarded = true, pending = false, scenario = null } = {}) {
  page.setDefaultTimeout(10_000);
  await page.setContent('<button id="opener">Fikcyjna karta A</button><main id="owner"></main><button id="replacement">Fikcyjna karta B</button>');
  await page.evaluate(({points,pending}) => {
    const state = window.probe = { current:true, changes:0, dialogs:[], writes:[], notes:[], pending,
      closeNotifications:0, reads:0 };
    window.VildaVault = {
      listPatientNotesForPatient: async id => {state.reads++;return state.notes.filter(note=>note.patientId===id);},
      savePatientNoteOnce: async payload => {
        state.writes.push(JSON.parse(JSON.stringify(payload)));
        if (state.pending) {state.pending=false;await new Promise(resolve=>{state.release=resolve;});}
        state.notes.push({...payload,createdAtISO:'2026-11-19T12:00:00.000Z'});
        return {saved:true,id:payload.id};
      },
    };
    state.points=points;
    state.context={actorLifetimeVersion:1,isCurrent:()=>state.current,onDialog:(panel,metadata)=>{
      const actor={panel,metadata};state.dialogs.push(actor);
      const cleanup=()=>{state.closeNotifications++;};cleanup.actorLifetimeVersion=1;return cleanup;
    }};
  },{points,pending});
  await page.addScriptTag({content:nativeSource});
  await page.evaluate(async ({guarded,scenario,pending})=>{
    const p=window.probe;
    if(scenario){
      p.pending=false;
      const D=VildaDziennikOtylosci, pid='fictional-A';
      const data={type:'continue',dateISO:'2026-11-10',ageYears:13,ageMonths:6,weight:74.6,weightSource:'pacjent',drug:'Wegovy (semaglutyd) – s.c. 1×/tydz.',dose:'2,4 mg / tydz.'};
      const plan=D.planNowego(D.zloz([],p.points),pid,data);await D.zapisz(pid,plan.wersje);
      let base=D.zloz(p.notes,p.points);
      if(scenario==='deleted')await D.zapisz(pid,D.planUsuniecia(base,pid,plan.entryId).wersje);
      if(scenario==='conflict'){
        const a=D.planPoprawki(base,pid,plan.entryId,{...data,weight:74.3},{urzadzenie:'telefon'});
        const b=D.planPoprawki(base,pid,plan.entryId,{...data,weight:74.1},{urzadzenie:'komputer'});
        await D.zapisz(pid,a.wersje);await D.zapisz(pid,b.wersje);
      }
      p.writes=[];p.pending=pending;
    }
    const options={patientId:'fictional-A',stan:VildaDziennikOtylosci.zloz(p.notes,p.points),migawka:p.points,
      urodzenieISO:'2013-04-11',nazwa:'Fikcyjna Pacjentka A',onZmiana:()=>{p.changes++;}};
    if(guarded)options.homeContext=p.context;
    options.onRysuj=()=>document.querySelector('#owner').replaceChildren(VildaDziennikOtylosciUI.sekcja(options));
    document.querySelector('#owner').append(VildaDziennikOtylosciUI.sekcja(options));
    document.querySelector('#opener').focus();
  },{guarded,scenario,pending});
  return page;
}
async function openForm(page){
  await page.locator('.vdo-add').click();
  await page.locator('#vdoDate').fill('2026-11-10');
  await page.locator('#vdoW').fill('74.6');
  await page.evaluate(()=>{probe.form=document.querySelector('.vdo-dialog form');});
}
async function submit(page){await page.evaluate(()=>probe.form.dispatchEvent(new Event('submit',{cancelable:true,bubbles:true})));}
async function summary(page){return page.evaluate(()=>({writes:probe.writes.map(n=>({patientId:n.patientId,id:n.id,category:n.category})),changes:probe.changes,
  dialogs:document.querySelectorAll('.vdo-backdrop').length,registered:probe.dialogs.length,closed:probe.closeNotifications,active:document.activeElement.id,reads:probe.reads}));}
function run(name, fn) { test(name, async ({ page }) => fn(page)); }
run('real native continuation plans migration + new version for A',async(page)=>{
  const p=await setup(page);try{await openForm(p);await submit(p);await p.waitForFunction(()=>probe.writes.length===3);await p.waitForFunction(()=>!document.querySelector('.vdo-backdrop'));
    const s=await summary(p);assert.equal(s.changes,1);assert.ok(s.writes.every(n=>n.patientId==='fictional-A'&&n.category==='leczenie-otylosci'));assert.equal(s.registered,1);return s;}finally{await p.close();}});
run('retained closed form cannot start new native batch',async(page)=>{
  const p=await setup(page);try{await openForm(p);await p.locator('.vdo-x').click();await submit(p);await p.waitForTimeout(80);
    const s=await summary(p);assert.equal(s.writes.length,0);assert.equal(s.changes,0);return s;}finally{await p.close();}});
run('owner A invalidated before submit refuses native writes',async(page)=>{
  const p=await setup(page);try{await openForm(p);await p.evaluate(()=>{probe.current=false;document.querySelector('#owner').remove();document.querySelector('#replacement').focus();});await submit(p);await p.waitForTimeout(80);
    const s=await summary(p);assert.equal(s.writes.length,0);assert.equal(s.changes,0);return s;}finally{await p.close();}});
run('owner invalidation after first write finishes original A batch and suppresses callbacks',async(page)=>{
  const p=await setup(page,{pending:true});try{await openForm(p);await submit(p);await p.waitForFunction(()=>probe.writes.length===1);await p.evaluate(()=>{probe.current=false;document.querySelector('#owner').remove();document.querySelector('#replacement').focus();probe.release();});await p.waitForFunction(()=>probe.writes.length===3);await p.waitForTimeout(80);
    const s=await summary(p);assert.equal(s.changes,0);assert.ok(s.writes.every(n=>n.patientId==='fictional-A'));assert.equal(s.active,'replacement');return s;}finally{await p.close();}});
run('legacy caller without optional context retains native save behavior',async(page)=>{
  const p=await setup(page,{guarded:false});try{await openForm(p);await p.evaluate(()=>{probe.current=false;});await submit(p);await p.waitForFunction(()=>probe.writes.length===3);
    const s=await summary(p);assert.equal(s.changes,1);assert.equal(s.registered,0);return s;}finally{await p.close();}});


for(const action of ['edit','delete','restore','conflict'])test('real journal retained '+action+' action cannot write after owner expiry',async({page})=>{
 await setup(page,{scenario:action==='restore'?'deleted':action==='conflict'?'conflict':'journal'});
 let target;
 if(action==='restore'){
   await page.getByRole('button',{name:/^Usunięte wpisy/}).click();
   target=await page.getByRole('button',{name:'Przywróć',exact:true}).elementHandle();
 }else if(action==='conflict'){
   await page.getByRole('button',{name:'Wybierz wersję',exact:true}).click();
   target=await page.getByRole('button',{name:'Zostaw tę wersję',exact:true}).first().elementHandle();
 }else if(action==='edit'){
   await page.getByRole('button',{name:/Popraw wpis z 10.11.2026/}).click();
   await page.locator('#vdoW').fill('74.2');
   target=await page.locator('.vdo-dialog form').elementHandle();
 }else target=await page.getByRole('button',{name:/Usuń wpis z 10.11.2026/}).elementHandle();
 await page.evaluate(()=>{probe.current=false;document.querySelector('#owner').remove();});
 await target.evaluate((n,action)=>n.dispatchEvent(new Event(action==='edit'?'submit':'click',{cancelable:true,bubbles:true})),action);
 await expect.poll(()=>page.evaluate(()=>probe.writes.length)).toBe(0);
 expect((await summary(page)).changes).toBe(0);
});
test('real journal closed conflict dialog cannot be reactivated through a retained version button',async({page})=>{
 await setup(page,{scenario:'conflict'});await page.getByRole('button',{name:'Wybierz wersję',exact:true}).click();
 const button=await page.getByRole('button',{name:'Zostaw tę wersję',exact:true}).first().elementHandle();
 await page.locator('.vdo-x').click();await button.evaluate(n=>n.dispatchEvent(new Event('click',{bubbles:true})));
 expect((await summary(page)).writes).toEqual([]);
});
test('real journal edit migration already submitted completes A batch without starting correction after owner expiry',async({page})=>{
 await setup(page,{pending:true});await page.getByRole('button',{name:/Popraw wpis z 13.10.2026/}).click();
 await page.locator('#vdoW').fill('74.9');
 await page.evaluate(()=>{probe.form=document.querySelector('.vdo-dialog form');});await submit(page);
 await page.waitForFunction(()=>probe.writes.length===1);
 await page.evaluate(()=>{probe.current=false;probe.release();});
 await page.waitForFunction(()=>probe.writes.length===2);await page.waitForTimeout(80);
 const s=await summary(page);expect(s.changes).toBe(0);expect(s.reads).toBe(0);expect(s.writes).toHaveLength(2);
 expect(s.writes.every(n=>n.patientId==='fictional-A')).toBe(true);
});

const NATIVE='.vhome-native-patient-card';
async function setupB1(page,width,{shell=false,oldNative=false}={}){
  const context=page.context();
  await page.setViewportSize({width,height:1000});page.setDefaultTimeout(30_000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.__VILDA_HOME_WORKSPACE_PREVIEW__=true;});
  await page.route('**/*',r=>{const u=new URL(r.request().url());if(oldNative&&u.pathname==='/vilda_home_patient_native.js')return r.fulfill({contentType:'text/javascript',body:oldNativeSource});return u.hostname==='127.0.0.1'||/^(blob|data):/.test(r.request().url())?r.continue():r.abort();});
  const fixture=await createFictionalVault(page,{shell,waitForAccountReadyBeforeReload:true});
  const frame=fixture.frame;
  const payload=fictionalPatient({firstName:'Dziennik-A',sex:'F',age:13,height:162.9,weight:75.2});
  payload.obesityTherapyPoints=points;
  Object.assign(payload.user,{ageMonths:6,dobISO:'2013-04-11',measuredAtISO:'2026-10-13'});
  const id=await frame.evaluate(async p=>(await VildaVault.savePatient(p,{dedup:false})).patientId,payload);
  await loadPatient(frame,id,'restore');
  await frame.waitForFunction(()=>VildaHomePatient&&!window.__vildaPersistRestoring&&!window.__vildaLustroWpis&&!VildaDobAge.restorePending());
  await frame.locator('#vhomePatientCard').getByRole('button',{name:'Powiększ kartę pacjenta',exact:true}).click();
  await expect(frame.locator(NATIVE)).toBeVisible();
  return{page,frame,context,id,bId:fixture.ids.b,errors};
}
async function section(page,key){
  const select=page.locator(NATIVE+' .vhome-b1-mobile-select');
  if(await select.isVisible())await select.selectOption(key);
  else await page.locator(NATIVE+' .vhome-b1-nav [data-tab="'+key+'"]').click();
  const panel=page.locator(NATIVE+' .vilda-patient-tab-content[data-tab="'+key+'"]');
  await expect(panel).toBeVisible();return panel;
}
async function openJournalEntries(page, homeCard) {
  const card = page.locator(homeCard ? NATIVE : '.vilda-auth-patient-card:not(.vhome-native-patient-card)');
  if (homeCard) await section(page, 'treatment');
  else await card.locator('button[data-tab="leczenie"]').click();
  const entries = card.locator('.vilda-ko-seg [data-widok="wpisy"]');
  await entries.click();
  await expect(entries).toHaveAttribute('aria-selected', 'true');
  await expect(card.locator('.vdo')).toBeVisible();
}
async function openFormB1(page){
  await section(page,'treatment');
  await page.locator('.vdo-add').click();
  const dialog=page.locator('.vdo-dialog');await expect(dialog).toBeVisible();
  await dialog.locator('#vdoDate').fill('2026-11-10');await dialog.locator('#vdoW').fill('74.6');
  await dialog.getByRole('radiogroup',{name:'Kto zmierzył masę'}).getByRole('radio',{name:'Pacjent'}).click();
  return dialog;
}
async function snapshot(page,id){return page.evaluate(async id=>({patient:await VildaVault.getPatient(id),notes:await VildaVault.listPatientNotesForPatient(id)}),id);}
for(const width of [1440,390])test('actual B1 '+width+'px continuation, Notes route, compact exclusion, Back',async({page})=>{
  const{context,id,errors}=await setupB1(page,width);try{
    const before=await snapshot(page,id);
    let dialog=await openFormB1(page);
    assert.equal(await dialog.evaluate(n=>n.tagName),'DIV');
    assert.equal(await dialog.getAttribute('class').then(c=>c.includes('vhome-b1-child-dialog')),true);
    const rect=await dialog.boundingBox();assert.ok(rect.x>=-1&&rect.x+rect.width<=width+1&&rect.y>=-1&&rect.y+rect.height<=1001);
    await dialog.getByRole('button',{name:'Zapisz wpis',exact:true}).click();
    await expect(page.locator('.vdo-backdrop')).toHaveCount(0);
    await expect(page.locator('.vdo-list:not(.vdo-list-deleted)>.vdo-item')).toHaveCount(3);
    const after=await snapshot(page,id);assert.equal(after.patient.snapshots.length,before.patient.snapshots.length);
    assert.equal(after.notes.filter(n=>n.category==='leczenie-otylosci').length,3);
    const notes=await section(page,'notes');await expect(notes.locator('.vilda-ob-dz-notes-link')).toBeVisible();
    await notes.locator('.vilda-ob-dz-notes-link button').click();
    await expect(page.locator(NATIVE+' [data-tab="treatment"]')).toHaveCount(2);
    await expect(page.locator('.vdo')).toBeVisible();
    const selected=await page.locator(NATIVE+' button[data-tab="treatment"]').getAttribute('aria-selected');assert.equal(selected,'true');
    await page.evaluate(()=>VildaHomePatient.refresh());
    await expect(page.locator('#vhomePatientPanel-notes')).toContainText('Brak zapisanych notatek.');
    dialog=await openFormB1(page);await page.goBack();await expect(page.locator('.vdo-backdrop')).toHaveCount(0);
    await expect(page.locator(NATIVE)).toBeVisible();
    const noExtra=await snapshot(page,id);assert.equal(noExtra.notes.length,after.notes.length);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);assert.ok(overflow<=1);
    expect(errors).toEqual([]);
    return{width,dialog:rect,notes:after.notes.length,patientSnapshots:after.patient.snapshots.length,overflow,errors};
  }finally{await context.close();}
});

for (const transition of ['PRO', 'visit', 'load', 'vault', 'account', 'selected patient']) test('actual B1 rejects a retained diary submit after immediate '+transition+' transition', async ({page}) => {
  const {id}=await setupB1(page,1440);
  await openFormB1(page);
  const writes=await page.evaluate(async transition => {
    const originalVault=window.VildaVault, original=originalVault.savePatientNoteOnce, writes=[];
    originalVault.savePatientNoteOnce=function(payload){writes.push({patientId:payload.patientId,id:payload.id});return Reflect.apply(original,this,arguments);};
    const form=document.querySelector('.vdo-dialog form');
    if(transition==='PRO') VildaProAccess.setPlan('free');
    else if(transition==='visit') VildaVisitContext.beginNew({patientId:sessionStorage.getItem('vildaCurrentPatientId')});
    else if(transition==='load') applyLoadedData(VildaDataImportExport.captureCurrentUserDataReadOnly());
    else if(transition==='account'){const user=originalVault.getCurrentUser();originalVault.getCurrentUser=()=>({...user,userId:'fictional-replacement-account'});}
    else if(transition==='selected patient')sessionStorage.setItem('vildaCurrentPatientId','fictional-replacement-patient');
    else window.VildaVault={...originalVault};
    form.dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}));
    await new Promise(resolve=>{setTimeout(resolve,80);});
    return writes;
  },transition);
  expect(writes).toEqual([]);
});

test('actual B1 lock removes the DIV actor and retained submit cannot write',async({page})=>{
 await setupB1(page,1440);await openFormB1(page);
 const result=await page.evaluate(async()=>{
   const vault=VildaVault,save=vault.savePatientNoteOnce,writes=[];
   vault.savePatientNoteOnce=function(payload){writes.push(payload.id);return Reflect.apply(save,this,arguments);};
   const form=document.querySelector('.vdo-dialog form');vault.lock();
   form.dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}));
   await new Promise(resolve=>{setTimeout(resolve,80);});
   return{writes,connected:form.isConnected,backdrops:document.querySelectorAll('.vdo-backdrop').length};
 });
 expect(result).toEqual({writes:[],connected:false,backdrops:0});
});
test('actual B1 A to B native patient load disposes the old journal actor and refuses its retained submit',async({page})=>{
 const{id,bId}=await setupB1(page,1440);await openFormB1(page);
 const beforeA=await snapshot(page,id),beforeB=await snapshot(page,bId);
 await page.evaluate(()=>{window.oldDiaryForm=document.querySelector('.vdo-dialog form');VildaHomePatient.close(true,false);});
 await loadPatient(page,bId,'restore');
 await page.evaluate(()=>oldDiaryForm.dispatchEvent(new Event('submit',{cancelable:true,bubbles:true})));
 await expect(page.locator('.vdo-backdrop')).toHaveCount(0);
 expect((await snapshot(page,id)).notes).toEqual(beforeA.notes);expect((await snapshot(page,bId)).notes).toEqual(beforeB.notes);
});

test('optional Home guard preserves every actual native note DTO byte except generated new IDs and timestamps',async({page,context})=>{
 const guarded=page,legacy=await context.newPage();
 await setup(guarded);await setup(legacy,{guarded:false});
 for(const target of [guarded,legacy]){await openForm(target);await submit(target);await target.waitForFunction(()=>probe.writes.length===3);}
 function normalize(notes){
   const ids=new Map();
   const id=value=>{if(!String(value).startsWith('otyl-'))return value;if(!ids.has(value))ids.set(value,'new-id-'+ids.size);return ids.get(value);};
   return notes.map(note=>{
     const out={...note};out.id=id(out.id);
     const lines=out.body.split('\n'),meta=JSON.parse(lines.pop());
     meta.entryId=id(meta.entryId);meta.parents=meta.parents.map(id);
     if(meta.createdAtISO)meta.createdAtISO='TIMESTAMP';
     lines.push(JSON.stringify(meta));out.body=lines.join('\n');return out;
   });
 }
 expect(normalize(await guarded.evaluate(()=>probe.writes))).toEqual(normalize(await legacy.evaluate(()=>probe.writes)));
});

for(const malformed of ['missing guard','throwing guard','missing context version','old context version','missing coordinator','throwing coordinator','old coordinator','refused registration'])test('explicit malformed Home lifecycle fails closed: '+malformed,async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));await setup(page);
 await page.evaluate(mode=>{
  const c=probe.context;
  if(mode==='missing guard')delete c.isCurrent;
  if(mode==='missing context version')delete c.actorLifetimeVersion;
  if(mode==='old context version')c.actorLifetimeVersion=0;
  if(mode==='throwing guard')c.isCurrent=()=>{throw Error('fictional expired owner');};
  if(mode==='missing coordinator')delete c.onDialog;
  if(mode==='throwing coordinator')c.onDialog=()=>{throw Error('fictional missing coordinator');};
  if(mode==='old coordinator')c.onDialog=()=>()=>{};
  if(mode==='refused registration')c.onDialog=()=>null;
 },malformed);
 await page.locator('.vdo-add').click();
 await expect(page.locator('.vdo-backdrop')).toHaveCount(0);
 expect((await summary(page)).writes).toEqual([]);expect(errors).toEqual([]);
});

for(const width of [1440,390])test('actual shell B1 diary fits the visible viewport at '+width+'px and Back closes child only',async({page})=>{
 const{frame,id,errors}=await setupB1(page,width,{shell:true});
 const before=await snapshot(frame,id),dialog=await openFormB1(frame),rect=await dialog.boundingBox();
 expect(rect.x).toBeGreaterThanOrEqual(0);expect(rect.y).toBeGreaterThanOrEqual(0);
 expect(rect.x+rect.width).toBeLessThanOrEqual(width+1);expect(rect.y+rect.height).toBeLessThanOrEqual(1001);
 await page.goBack();await expect(frame.locator('.vdo-backdrop')).toHaveCount(0);await expect(frame.locator(NATIVE)).toBeVisible();
 expect((await snapshot(frame,id)).notes).toEqual(before.notes);expect(errors).toEqual([]);
});

for(const variant of ['native public B with main A','B1 B with main A','B1 B with blank main'])test('independent '+variant+' saves B journal without loading B or changing main encounter',async({page})=>{
 const{ id:mainId }=await setupB1(page,1440);
 const id=await page.evaluate(async points=>{
  return (await VildaVault.savePatient({name:'Fikcyjna Niezależna B',user:{lastName:'Fikcyjna',firstName:'Niezależna B',sex:'F',age:13,ageMonths:6,height:162.9,weight:75.2,dobISO:'2013-04-11',measuredAtISO:'2026-10-13'},obesityTherapyPoints:points},{dedup:false})).patientId;
 },points);
 await page.evaluate(()=>VildaHomePatient.close(true,false));
 if(variant.includes('blank')){
  await page.evaluate(()=>clearAllData());
  await expect.poll(()=>page.evaluate(()=>sessionStorage.getItem('vildaCurrentPatientId'))).toBe(null);
 }
 async function mainFingerprint(){return page.evaluate(()=>{
  const payload=VildaDataImportExport.captureCurrentUserDataReadOnly();delete payload.timestampISO;
  const id=sessionStorage.getItem('vildaCurrentPatientId');
  return{payload,id,visit:VildaVisitContext.capture(payload,{patientId:id,readOnly:true})};
 });}
 const beforeMain=await mainFingerprint(),beforeB=await snapshot(page,id),beforeA=await snapshot(page,mainId);
 await page.evaluate(({id,b1})=>VildaAuthUI.showPatientCard(id,null,b1?{homePatientPresentation:true}:null),{id,b1:variant.startsWith('B1')});
 await openJournalEntries(page, variant.startsWith('B1'));
 await page.locator('.vdo-add').click();
 const dialog=page.locator('.vdo-dialog');await expect(dialog).toBeVisible();
 await dialog.locator('#vdoDate').fill('2026-11-10');await dialog.locator('#vdoW').fill('74.6');
 await dialog.getByRole('button',{name:'Zapisz wpis',exact:true}).click();await expect(page.locator('.vdo-backdrop')).toHaveCount(0);
 await expect(page.locator('.vdo-list:not(.vdo-list-deleted)>.vdo-item')).toHaveCount(3);
 const afterB=await snapshot(page,id);expect(afterB.notes.filter(n=>n.category==='leczenie-otylosci')).toHaveLength(3);
 expect(afterB.patient.snapshots).toEqual(beforeB.patient.snapshots);expect((await snapshot(page,mainId)).patient.snapshots).toEqual(beforeA.patient.snapshots);expect(await mainFingerprint()).toEqual(beforeMain);
 if(!variant.includes('blank'))expect(beforeMain.id).toBe(mainId);
});

for(const invalid of [false,0,''])test('explicit primitive Home context fails closed: '+JSON.stringify(invalid),async({page})=>{
 await setup(page);
 await page.evaluate(value=>{
  const p=probe;document.querySelector('#owner').replaceChildren(VildaDziennikOtylosciUI.sekcja({patientId:'fictional-A',stan:VildaDziennikOtylosci.zloz([],p.points),migawka:p.points,homeContext:value,onZmiana:()=>{p.changes++;}}));
 },invalid);
 await page.locator('.vdo-add').click();await expect(page.locator('.vdo-backdrop')).toHaveCount(0);expect((await summary(page)).writes).toEqual([]);
});
test('explicit null Home context preserves the native legacy continuation',async({page})=>{
 await setup(page);
 await page.evaluate(()=>{
  const p=probe;document.querySelector('#owner').replaceChildren(VildaDziennikOtylosciUI.sekcja({patientId:'fictional-A',stan:VildaDziennikOtylosci.zloz([],p.points),migawka:p.points,homeContext:null,onZmiana:()=>{p.changes++;}}));p.current=false;
 });
 await openForm(page);await submit(page);await page.waitForFunction(()=>probe.writes.length===3);expect((await summary(page)).changes).toBe(1);
});

for(const version of ['missing',0,2])for(const action of ['delete','restore'])test('direct journal '+action+' refuses explicit '+version+' context version without opening an actor',async({page})=>{
 await setup(page,{scenario:action==='restore'?'deleted':'journal'});
 let target;
 if(action==='restore'){
  await page.getByRole('button',{name:/^Usunięte wpisy/}).click();target=await page.getByRole('button',{name:'Przywróć',exact:true}).elementHandle();
 }else target=await page.getByRole('button',{name:/Usuń wpis z 10.11.2026/}).elementHandle();
 await page.evaluate(version=>{if(version==='missing')delete probe.context.actorLifetimeVersion;else probe.context.actorLifetimeVersion=version;window.confirm=()=>true;},version);
 await target.evaluate(n=>n.dispatchEvent(new Event('click',{bubbles:true,cancelable:true})));
 await page.waitForTimeout(50);expect((await summary(page)).writes).toEqual([]);await expect(page.locator('.vdo-backdrop')).toHaveCount(0);
});
for(const transition of ['PRO','visit'])for(const action of ['delete','restore'])test('actual old B1 coordinator with new journal refuses direct '+action+' after '+transition+' transition',async({page})=>{
 const{id}=await setupB1(page,1440,{oldNative:true});await section(page,'treatment');
 if(action==='restore'){
  await page.evaluate(async id=>{
   const D=VildaDziennikOtylosci,p=(await VildaVault.getPatient(id)).snapshots[0].payload.obesityTherapyPoints;
   const data={type:'continue',dateISO:'2026-11-10',ageYears:13,ageMonths:6,weight:74.6,weightSource:'pacjent',drug:'Wegovy (semaglutyd) – s.c. 1×/tydz.',dose:'2,4 mg / tydz.'};
   const plan=D.planNowego(await D.wczytaj(id,p),id,data);await D.zapisz(id,plan.wersje);
   await D.zapisz(id,D.planUsuniecia(await D.wczytaj(id,p),id,plan.entryId).wersje);
  },id);
  await page.evaluate(id=>VildaAuthUI.showPatientCard(id),id);
  await expect(page.locator('.vilda-auth-patient-card:not(.vhome-native-patient-card)')).toBeVisible();
  await openJournalEntries(page, false);
  await page.getByRole('button',{name:/^Usunięte wpisy/}).click();
  await expect(page.getByRole('button',{name:'Przywróć',exact:true})).toBeVisible();
  await page.evaluate(id=>VildaAuthUI.showPatientCard(id,null,{homePatientPresentation:true},{activeTab:'treatment'}),id);
  await openJournalEntries(page, true);
  await expect(page.getByRole('button',{name:'Przywróć',exact:true})).toBeVisible();
 }
 const writes=await page.evaluate(async({transition,action})=>{
  const vault=VildaVault,real=vault.savePatientNoteOnce,writes=[];
  vault.savePatientNoteOnce=function(payload){writes.push(payload.id);return Reflect.apply(real,this,arguments);};
  const button=action==='delete'?document.querySelector('.vdo-list .vdo-row-actions button[aria-label^="Usuń"]'):[...document.querySelectorAll('.vdo button')].find(b=>b.textContent==='Przywróć');
  window.confirm=()=>true;
  if(transition==='PRO')VildaProAccess.setPlan('free');else VildaVisitContext.beginNew({patientId:sessionStorage.getItem('vildaCurrentPatientId')});
  button.dispatchEvent(new Event('click',{bubbles:true,cancelable:true}));
  await new Promise(resolve=>{setTimeout(resolve,100);});return writes;
 },{transition,action});
 expect(writes).toEqual([]);
});
