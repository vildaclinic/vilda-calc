import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const blank = () => ({ version: 1, name: '', user: { age: null, ageMonths: 0, sex: 'M', height: null, weight: null, tannerStage: null } });
const patient = () => ({ version: 1, name: 'Fikcyjny Pacjent Bieżącego Formularza', user: { sex: 'M', age: 12, height: 150, weight: 40 } });

function environment({ loaded = false, initial, guest = false, unlocked = true } = {}) {
  const listeners = {}, windowListeners = {}, storage = new Map(), savedListeners = [];
  let form = clone(initial || (loaded ? patient() : blank())), session = clone(form), clcr = null, sequence = 1, active = unlocked, stale = false, userId = 'fictional-current-user';
  if (loaded) storage.set('vildaCurrentPatientId', 'fictional-current-patient');
  const writes = vi.fn(), persist = vi.fn(), collect = vi.fn(() => { throw new Error('Zwykły kolektor może zapisywać Klirens — nie jest odczytem.'); });
  const pure = vi.fn(() => clone(form));
  const win = {
    setTimeout, clearTimeout, setInterval, clearInterval, console: { debug() {} }, VildaGuestMode: guest,
    addEventListener(type, fn) { (windowListeners[type] ||= []).push(fn); },
    document: { readyState: 'complete', getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
      addEventListener(type, fn) { (listeners[type] ||= []).push(fn); }, removeEventListener() {}, dispatchEvent(event) { (listeners[event.type] || []).forEach(fn => fn(event)); return true; } },
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem(key, value) { writes(key, value); storage.set(key, String(value)); }, removeItem(key) { writes(key, null); storage.delete(key); } },
    localStorage: { getItem: () => null, setItem: writes, removeItem: writes },
    VildaVault: { isUnlocked: () => active, getCurrentUser: () => active ? { userId } : null, onPatientSaved(fn) { savedListeners.push(fn); } },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    VildaPanelPacjent: { nieaktualny: () => stale },
    VildaPersistence: { readMainSession: () => clone(session), readClcrSession: () => clone(clcr), isClearInProgress: () => false },
    collectUserData: collect, saveMainSessionNow: persist,
  };
  loadBrowserScript('vilda_data_import_export.js', win);
  const actualPure = win.VildaDataImportExport.captureCurrentUserDataReadOnly;
  win.VildaDataImportExport.captureCurrentUserDataReadOnly = pure;
  win.VildaDataImportExport.getApplyLoadedDataSequence = () => sequence;
  loadBrowserScript('vilda_save_status_indicator.js', win);
  const api = win.VildaSaveStatusIndicator;
  if (loaded) { api._onPatientLoaded({ patientId: 'fictional-current-patient', applySequence: 1 }); vi.advanceTimersByTime(150); }
  writes.mockClear(); persist.mockClear(); collect.mockClear(); pure.mockClear();
  return { api, win, writes, persist, collect, pure, storage,
    form: () => clone(form), session: () => clone(session), setSession(value) { session = clone(value); }, setClcr(value) { clcr = clone(value); },
    useActualPure(fields) { win.document.getElementById = id => fields.get(id) || null; win.VildaDataImportExport.captureCurrentUserDataReadOnly = actualPure; },
    setForm(value) { form = clone(value); },
    edit() { api._debouncedOnFormChange({ isTrusted: true }); },
    patientId(value) { value == null ? storage.delete('vildaCurrentPatientId') : storage.set('vildaCurrentPatientId', value); },
    sequence() { sequence++; }, setSequence(value) { sequence = value; }, notifySaved(value) { savedListeners.forEach(fn => fn(value)); }, account() { userId = 'fictional-other-user'; }, stale() { stale = true; },
    lock() { active = false; api._onLock(); }, unlock() { active = true; api._onUnlock(); },
    saved(id = 'fictional-current-patient', { announce = false } = {}) {
      session = clone(form); storage.set('vildaCurrentPatientId', id); api._onPatientSaved({ patientId: id, snapshotCount: 2 });
      if (announce) api._onPatientLoaded({ patientId: id, applySequence: sequence, source: 'save' });
    },
  };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-31T12:00:00Z')); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });


function actualAgeFixture({ age = '', months = '0', referenceAge = null, omitAge = false, weeks = null, dob = null } = {}) {
  const h = environment(), fields = new Map();
  for (const [id,value] of Object.entries({name:'Fikcyjny Pacjent Nowego Pomiaru',age,ageMonths:months,sex:'M',height:'',weight:''})) {
    if(id==='age'&&omitAge)continue;
    fields.set(id,{id,value,checked:false,dataset:{},style:{},getAttribute:()=>null,addEventListener(){}});
  }
  h.useActualPure(fields);
  h.win.VildaDobAge={readISO:()=>dob,readWeeks:()=>weeks,readMeasuredAtISO:()=>null};
  const reference=h.win.VildaDataImportExport.collectUserData();
  reference.user.age=referenceAge;
  h.setSession(reference);h.setForm(reference);h.patientId('fictional-current-patient');
  h.api._onPatientLoaded({patientId:'fictional-current-patient',applySequence:1});vi.advanceTimersByTime(150);
  h.writes.mockClear();h.collect.mockClear();h.persist.mockClear();
  return {h,fields,reference,capture:()=>h.win.VildaDataImportExport.captureCurrentUserDataReadOnly({base:h.session()})};
}

describe('readonly owned blank age does not manufacture a newborn after New Measurement',()=>{
  it('keeps a genuinely fresh empty form hidden with blank years and the default zero-month control',()=>{
    const h=environment(),fields=new Map();
    for(const[id,value]of Object.entries({name:'',age:'',ageMonths:'0',sex:'M',height:'',weight:''}))fields.set(id,{id,value,checked:false,dataset:{},style:{},getAttribute:()=>null,addEventListener(){}});
    h.useActualPure(fields);h.setSession(null);const before=h.form();
    expect(h.api.getCurrentDecision()).toMatchObject({ready:true,state:'hidden'});
    expect(h.session()).toBeNull();expect(h.form()).toEqual(before);expect(h.writes).not.toHaveBeenCalled();expect(h.collect).not.toHaveBeenCalled();expect(h.persist).not.toHaveBeenCalled();
  });
  it('matches the actual E persisted reference with no age while default zero months and all other fields are unchanged',()=>{
    const {h,fields,reference,capture}=actualAgeFixture();
    const before=h.api.getReferenceFingerprint(),stored=h.session(),dom=Array.from(fields,([id,x])=>[id,x.value]);
    expect(JSON.parse(before).core.user).not.toHaveProperty('age');
    expect(h.api.getCurrentDecision()).toMatchObject({ready:true,state:'saved'});
    expect(capture().user.age).toBeNull();
    expect(h.api.getReferenceFingerprint()).toBe(before);expect(h.session()).toEqual(stored);expect(h.session()).toEqual(reference);
    expect(Array.from(fields,([id,x])=>[id,x.value])).toEqual(dom);expect(h.writes).not.toHaveBeenCalled();expect(h.collect).not.toHaveBeenCalled();expect(h.persist).not.toHaveBeenCalled();
    // The approved fix is comparison-only; existing ordinary save/export still
    // uses its original zero-years fallback and remains byte-compatible.
    expect(h.win.VildaDataImportExport.collectUserData().user.age).toBe(0);
  });
  it('keeps a real explicit newborn zero saved',()=>{
    const {h,capture}=actualAgeFixture({age:'0',referenceAge:0});
    expect(capture().user.age).toBe(0);expect(h.api.getCurrentDecision()).toMatchObject({ready:true,state:'saved'});
  });
  it('detects an explicit zero entered after an unknown-age reference',()=>{
    const {h,fields,capture}=actualAgeFixture();fields.get('age').value='0';
    expect(capture().user.age).toBe(0);expect(h.api.getCurrentDecision()).toMatchObject({ready:true,state:'dirty'});
  });
  it('keeps a clear of a previously saved newborn zero dirty instead of normalizing the reference from the current DOM',()=>{
    const {h,fields,capture}=actualAgeFixture({age:'0',referenceAge:0});
    expect(h.api.getCurrentDecision()).toMatchObject({ready:true,state:'saved'});
    const before=h.api.getReferenceFingerprint();fields.get('age').value='';
    expect(h.api.getCurrentDecision()).toMatchObject({ready:true,state:'dirty'});expect(capture().user.age).toBeNull();
    expect(h.api.getReferenceFingerprint()).toBe(before);expect(JSON.parse(before).core.user.age).toBe(0);expect(h.session().user.age).toBe(0);
  });
  it('preserves positive month-only infant age and detects the changed months',()=>{
    const {h,fields,capture}=actualAgeFixture();fields.get('ageMonths').value='2';
    expect(capture().user).toMatchObject({age:0,ageMonths:2});expect(h.api.getCurrentDecision()).toMatchObject({ready:true,state:'dirty'});
  });
  it.each([0,3])('preserves an authoritative weeks basis (%s)',weeks=>{
    const {h,capture}=actualAgeFixture({weeks,referenceAge:0});
    expect(capture().user).toMatchObject({age:0,ageWeeks:weeks});expect(h.api.getCurrentDecision()).toMatchObject({ready:true,state:'saved'});
  });
  it('preserves a DOB basis without changing the date or deriving a new age',()=>{
    const {h,capture}=actualAgeFixture({dob:'2026-10-31',referenceAge:0});
    expect(capture().user).toMatchObject({age:0,dobISO:'2026-10-31'});expect(h.api.getCurrentDecision()).toMatchObject({ready:true,state:'saved'});
  });
  it('carries a saved zero from an unowned age control on a partial page',()=>{
    const {h,capture}=actualAgeFixture({omitAge:true,referenceAge:0});
    expect(capture().user.age).toBe(0);expect(h.api.getCurrentDecision()).toMatchObject({ready:true,state:'saved'});
  });
  it.each(['13','0.5'])('retains a real age edit %s',age=>{
    const {h,fields,capture}=actualAgeFixture({age:'12',referenceAge:12});fields.get('age').value=age;
    expect(capture().user.age).toBe(Number(age));expect(h.api.getCurrentDecision()).toMatchObject({ready:true,state:'dirty'});
  });
  it('requires a raw blank and does not treat a nonnumeric nonblank value as the default',()=>{
    const {h,capture}=actualAgeFixture({age:'fictional-invalid'});
    expect(capture().user.age).toBe(0);expect(h.api.getCurrentDecision()).toMatchObject({ready:true,state:'dirty'});
  });

  it('accepts a real own save of blank years without changing ordinary saved age or the raw form',async()=>{
    const h=environment(),fields=new Map();h.setSequence(0);h.setSession(null);
    for(const[id,value]of Object.entries({name:'Fikcyjny Pacjent Zapisu Bez Wieku',age:'',ageMonths:'0',sex:'M',height:'150',weight:'40'}))fields.set(id,{id,value,checked:false,dataset:{},style:{},getAttribute:()=>null,addEventListener(){}});
    h.useActualPure(fields);h.win.VildaDobAge={readISO:()=>null,readWeeks:()=>null,readMeasuredAtISO:()=>null};
    h.win.VildaVault.captureSyncOperationSession=()=>({});h.win.VildaVault.assertSyncOperationSession=()=>true;
    h.win.document.addEventListener('vilda:patient-loaded',event=>{if(event.detail.source==='save')h.patientId(event.detail.patientId)});
    let savedPayload;h.win.VildaVault.savePatient=async value=>{savedPayload=clone(value);h.setSession(value);const result={patientId:'fictional-blank-age-own-save',snapshotId:'fictional-blank-age-snapshot',header:{name:value.name}};h.notifySaved(result);return result};
    const original=h.api.getCurrentDecision();expect(original).toMatchObject({ready:true,state:'new_patient'});
    const receipt=await h.win.VildaDataImportExport.saveUserDataWithReceipt();
    expect(receipt).toMatchObject({saved:true,patientId:'fictional-blank-age-own-save'});expect(savedPayload.user.age).toBe(0);expect(h.session().user.age).toBe(0);
    expect(fields.get('age').value).toBe('');expect(fields.get('ageMonths').value).toBe('0');
    const afterOwnSave=h.api.isCurrentDecisionAfterSave(original.scope,receipt);vi.advanceTimersByTime(150);const current=h.api.getCurrentDecision();
    expect({afterOwnSave,ready:current.ready,state:current.state}).toEqual({afterOwnSave:true,ready:true,state:'saved'});
  });
});

function ownSaveFixture({age='',held=false,fail=false}={}){
  const h=environment(),fields=new Map();h.setSequence(0);h.setSession(null);
  for(const[id,value]of Object.entries({name:'Fikcyjny Pacjent Dowodu Wlasnego Zapisu',age,ageMonths:'0',sex:'M',height:'150',weight:'40'}))fields.set(id,{id,value,checked:false,dataset:{},style:{},getAttribute:()=>null,addEventListener(){},dispatchEvent(){return true}});
  h.useActualPure(fields);h.win.VildaDobAge={readISO:()=>null,readWeeks:()=>null,readMeasuredAtISO:()=>null};
  let generation=1,release;const pending=held?new Promise(done=>{release=done}):Promise.resolve();
  h.win.VildaVault.captureSyncOperationSession=()=>({generation});h.win.VildaVault.assertSyncOperationSession=token=>{if(token.generation!==generation)throw Object.assign(new Error('Fikcyjna zmiana sesji'),{code:'SESSION_CHANGED'})};
  h.win.document.addEventListener('vilda:patient-loaded',event=>{if(event.detail.source==='save')h.patientId(event.detail.patientId)});
  let savedPayload;
  h.win.VildaVault.savePatient=vi.fn(async value=>{savedPayload=clone(value);await pending;if(fail)throw new Error('Fikcyjny blad trwalego zapisu');h.setSession(value);const result={patientId:'fictional-blank-age-own-save',snapshotId:'fictional-blank-age-snapshot',header:{name:value.name}};h.notifySaved(result);return result});
  return{h,fields,api:h.win.VildaDataImportExport,saved:()=>savedPayload,release:()=>release(),invalidateToken(){generation++},settle(){vi.advanceTimersByTime(150)},save(){return h.win.VildaDataImportExport.saveUserDataWithReceipt()}};
}
describe('actual own-save blank-age comparison witness',()=>{
  it('keeps the actual stored/header reference exact while providing only a detached read comparison',async()=>{
    const x=ownSaveFixture(),original=x.h.api.getCurrentDecision();const receipt=await x.save();x.settle();
    const reference=x.h.api.getReferenceFingerprint(),stored=x.h.session(),before=Array.from(x.fields,([id,field])=>[id,field.value]);
    expect(JSON.parse(reference).core.user.age).toBe(0);expect(stored.user.age).toBe(0);
    x.h.writes.mockClear();x.h.persist.mockClear();x.h.collect.mockClear();
    const comparison=x.api.getOwnSaveBlankAgeComparison();expect(comparison).toMatchObject({patientId:receipt.patientId,payload:{user:{age:0}}});comparison.payload.user.height=1;
    expect(x.api.getOwnSaveBlankAgeComparison().payload.user.height).toBe(150);
    expect(x.h.api.getCurrentDecision()).toMatchObject({ready:true,state:'saved'});expect(x.h.api.isCurrentDecisionAfterSave(original.scope,receipt)).toBe(true);
    expect(x.h.api.getReferenceFingerprint()).toBe(reference);expect(x.h.session()).toEqual(stored);expect(Array.from(x.fields,([id,field])=>[id,field.value])).toEqual(before);
    expect(x.h.writes).not.toHaveBeenCalled();expect(x.h.persist).not.toHaveBeenCalled();expect(x.h.collect).not.toHaveBeenCalled();
  });
  it('invalidates the earlier witness after a successful explicit zero save so a later clear is dirty',async()=>{
    const x=ownSaveFixture();await x.save();x.settle();expect(x.api.getOwnSaveBlankAgeComparison()).not.toBeNull();
    x.fields.get('age').value='0';expect((await x.save()).saved).toBe(true);x.settle();x.fields.get('age').value='';
    expect(x.api.getOwnSaveBlankAgeComparison()).toBeNull();expect(x.h.api.getCurrentDecision()).toMatchObject({ready:true,state:'dirty'});
  });
  it('does not alias a held explicit-zero save when the user clears age before its ACK',async()=>{
    const x=ownSaveFixture({age:'0',held:true}),original=x.h.api.getCurrentDecision(),save=x.save();await Promise.resolve();x.fields.get('age').value='';x.release();const receipt=await save;x.settle();
    expect(receipt.saved).toBe(true);expect(x.saved().user.age).toBe(0);expect(x.api.getOwnSaveBlankAgeComparison()).toBeNull();
    expect(x.h.api.getCurrentDecision()).toMatchObject({ready:true,state:'dirty'});expect(x.h.api.isCurrentDecisionAfterSave(original.scope,receipt)).toBe(false);
  });
  it('keeps a newer clinical edit dirty while a blank-age save is held',async()=>{
    const x=ownSaveFixture({held:true}),original=x.h.api.getCurrentDecision(),save=x.save();await Promise.resolve();x.fields.get('weight').value='41';x.release();const receipt=await save;x.settle();
    expect(receipt.saved).toBe(true);expect(x.saved().user.weight).toBe(40);expect(x.h.api.getCurrentDecision()).toMatchObject({ready:true,state:'dirty'});expect(x.h.api.isCurrentDecisionAfterSave(original.scope,receipt)).toBe(false);
  });
  it('requires the same raw blank/default basis at completion',async()=>{
    const x=ownSaveFixture({held:true}),save=x.save();await Promise.resolve();x.fields.get('ageMonths').value='';x.release();expect((await save).saved).toBe(true);x.settle();
    expect(x.api.getOwnSaveBlankAgeComparison()).toBeNull();expect(x.h.api.getCurrentDecision()).toMatchObject({ready:true,state:'dirty'});
  });
  it('requires the entire committed payload to match the raw reference rather than borrowing only its zero age',async()=>{
    const x=ownSaveFixture();await x.save();x.settle();expect(x.api.getOwnSaveBlankAgeComparison()).not.toBeNull();
    x.fields.get('weight').value='41';const foreignReference=x.h.session();foreignReference.user.weight=41;x.h.setSession(foreignReference);x.h.api._onPatientSaved({patientId:'fictional-blank-age-own-save'});
    expect(JSON.parse(x.h.api.getReferenceFingerprint()).core.user).toMatchObject({age:0,weight:41});
    expect(x.h.api.getCurrentDecision()).toMatchObject({ready:true,state:'dirty'});
  });
  it.each(['account','patient','session-token','load','clear','loaded-pointer','marker-pointer'])('rejects the witness after %s changes',async change=>{
    const x=ownSaveFixture();await x.save();x.settle();expect(x.api.getOwnSaveBlankAgeComparison()).not.toBeNull();
    if(change==='account')x.h.account();if(change==='patient')x.h.patientId('fictional-other-patient');if(change==='session-token')x.invalidateToken();
    if(change==='load')x.api.applyLoadedData(clone(x.saved()),{syncSharedUserDataFromLoadedData(){}});
    if(change==='clear')x.api.clearAllData();if(change==='loaded-pointer')x.h.win.lastLoadedData=clone(x.h.win.lastLoadedData);if(change==='marker-pointer')x.h.win.__vildaOstatniWlasnyZapis={...x.h.win.__vildaOstatniWlasnyZapis};
    expect(x.api.getOwnSaveBlankAgeComparison()).toBeNull();
  });
  it('does not grant a witness for a handled failed save or arbitrary vault ACK',async()=>{
    const x=ownSaveFixture({fail:true});const receipt=await x.save();expect(receipt.saved).toBe(false);expect(x.api.getOwnSaveBlankAgeComparison()).toBeNull();
    x.h.notifySaved({patientId:'fictional-unrelated-ack'});expect(x.api.getOwnSaveBlankAgeComparison()).toBeNull();
  });
});

async function actualBlankAgePubertySave({sourcePatientId=null,mergeMissingOwner=false}={}){
  const h=environment(),fields=new Map();h.setSequence(0);h.setSession(null);if(sourcePatientId)h.patientId(sourcePatientId);
  for(const[id,value]of Object.entries({name:'Fikcyjna Alicja Kompozycja',firstName:'Alicja',lastName:'Fikcyjna Kompozycja',age:'',ageMonths:'0',sex:'F',height:'150',weight:'40'}))fields.set(id,{id,value,checked:false,dataset:{},style:{},getAttribute:()=>null,addEventListener(){}});
  h.useActualPure(fields);h.win.crypto=crypto;h.win.VildaAuthUI={isBootReady:()=>true};h.win.VildaDobAge={readISO:()=>null,readWeeks:()=>null,readMeasuredAtISO:()=>null};
  const importer=h.win.VildaDataImportExport;
  h.win.VildaPersistence.getStorage=()=>h.win.sessionStorage;h.win.VildaPersistence.writeMainSession=value=>{h.setSession(value);return true};
  // The real source-save publisher C() must exercise normal autosave, not a
  // no-op mock: it publishes the actual current examination's new owner.
  h.win.collectUserData=importer.collectUserData;h.win.hasMeaningfulMainSessionData=importer.hasMeaningfulMainSessionData;h.win.saveMainSessionNow=importer.saveMainSessionNow;
  importer.restoreMainSessionIfAny();
  loadBrowserScript('vilda_puberty_assessment.js',h.win);loadBrowserScript('vilda_puberty_assessment_state.js',h.win);
  const carrier=h.win.VildaPubertyAssessmentState;carrier.load({user:{sex:'F'}},{restore:true});expect(carrier.editObservation('Th',3)).toEqual({ok:true});
  h.win.VildaVault.captureSyncOperationSession=()=>({});h.win.VildaVault.assertSyncOperationSession=()=>true;
  h.win.document.addEventListener('vilda:patient-loaded',event=>{if(event.detail.source==='save')h.patientId(event.detail.patientId)});
  let actualCommitted;h.win.VildaVault.savePatient=async value=>{if(mergeMissingOwner)value.user.pubertyAssessmentVisit.ownerPatientId=null;actualCommitted=clone(value);h.setSession(value);const result={patientId:sourcePatientId||'fictional-composed-own-save',snapshotId:'fictional-composed-snapshot',header:{name:value.name}};h.notifySaved(result);return result};
  const captured=h.api.getCurrentDecision();expect(captured).toMatchObject({ready:true,state:'new_patient'});
  const before=importer.captureCurrentUserDataReadOnly({base:h.session()});expect(before.user.age).toBeNull();expect(before.user.pubertyAssessmentVisit.ownerPatientId).toBe(sourcePatientId);
  const receipt=await importer.saveUserDataWithReceipt();expect(receipt.saved).toBe(true);
  expect(actualCommitted.user.age).toBe(0);expect(actualCommitted.user.pubertyAssessmentVisit.ownerPatientId).toBeNull();
  expect(importer.getOwnSaveBlankAgeComparison()).toMatchObject({patientId:receipt.patientId,sourcePatientId:sourcePatientId});
  return {h,fields,importer,carrier,captured,receipt,committed:()=>clone(actualCommitted)};
}
describe('blank-age comparison composes with the actual new-patient puberty visit handoff',()=>{
  it('accepts the same saved examination at receipt, normal publisher150 and carrier autosave450',async()=>{
    const x=await actualBlankAgePubertySave();expect(x.h.api.isCurrentDecisionAfterSave(x.captured.scope,x.receipt)).toBe(true);
    vi.advanceTimersByTime(150);
    const reference=x.h.api.getReferenceFingerprint(),raw=JSON.parse(reference),committed=x.committed();
    expect(raw.core.user).toMatchObject({age:0,pubertyAssessmentVisit:{ownerPatientId:x.receipt.patientId}});
    expect(committed.user.pubertyAssessmentVisit.ownerPatientId).toBeNull();
    expect(x.h.api.getCurrentDecision()).toMatchObject({ready:true,state:'saved'});expect(x.h.api.isCurrentDecisionAfterSave(x.captured.scope,x.receipt)).toBe(true);
    vi.advanceTimersByTime(300);
    expect(x.h.api.getCurrentDecision()).toMatchObject({ready:true,state:'saved'});expect(x.h.api.isCurrentDecisionAfterSave(x.captured.scope,x.receipt)).toBe(true);
    expect(x.h.api.getReferenceFingerprint()).toBe(reference);expect(x.committed()).toEqual(committed);
    expect(x.fields.get('age').value).toBe('');expect(x.h.session().user.age).toBe(0);
  });
  it.each(['foreign-owner','different-visit','clinical-edit'])('rejects %s instead of broadening the own-save comparison',async boundary=>{
    const x=await actualBlankAgePubertySave();vi.advanceTimersByTime(450);expect(x.h.api.isCurrentDecisionAfterSave(x.captured.scope,x.receipt)).toBe(true);
    if(boundary==='clinical-edit')expect(x.carrier.editObservation('Th',4)).toEqual({ok:true});
    else{
      const ref=x.h.api._readPersistedRef(),raw=JSON.parse(ref.fp);
      if(boundary==='foreign-owner')raw.core.user.pubertyAssessmentVisit.ownerPatientId='fictional-foreign-owner';
      else raw.core.user.pubertyAssessmentVisit.visitId='fictional-different-visit';
      x.h.api._writePersistedRef({...ref,fp:JSON.stringify(raw)});
    }
    const reference=x.h.api._readPersistedRef(),stored=x.h.session(),witness=x.importer.getOwnSaveBlankAgeComparison();x.h.writes.mockClear();
    expect(x.h.api.getCurrentDecision()).toMatchObject({ready:true,state:'dirty'});expect(x.h.api.isCurrentDecisionAfterSave(x.captured.scope,x.receipt)).toBe(false);
    expect(x.h.api._readPersistedRef()).toEqual(reference);expect(x.h.session()).toEqual(stored);expect(x.importer.getOwnSaveBlankAgeComparison()).toEqual(witness);expect(x.h.writes).not.toHaveBeenCalled();
  });

  it('does not treat a pre-existing patient scope as a confirmed new-patient owner handoff',async()=>{
    // The vault may merge into its submitted payload. Preserve the actual
    // committed missing owner while the existing live examination keeps its PID.
    const x=await actualBlankAgePubertySave({sourcePatientId:'fictional-existing-composed-patient',mergeMissingOwner:true});vi.advanceTimersByTime(450);
    const witness=x.importer.getOwnSaveBlankAgeComparison(),reference=x.h.api._readPersistedRef(),raw=JSON.parse(reference.fp);
    expect(witness).toMatchObject({patientId:'fictional-existing-composed-patient',sourcePatientId:'fictional-existing-composed-patient',payload:{user:{age:0,pubertyAssessmentVisit:{ownerPatientId:null}}}});
    expect(raw.core.user.pubertyAssessmentVisit.ownerPatientId).toBe('fictional-existing-composed-patient');
    expect(x.h.api.getCurrentDecision()).toMatchObject({ready:true,state:'dirty'});expect(x.h.api.isCurrentDecisionAfterSave(x.captured.scope,x.receipt)).toBe(false);
    expect(x.h.api._readPersistedRef()).toEqual(reference);expect(x.importer.getOwnSaveBlankAgeComparison()).toEqual(witness);
  });
});
