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

describe('current destructive-action save decision is synchronous and read-only', () => {
  it('protects an edit before the400ms cached indicator debounce without flushing or publishing anything', () => {
    const h = environment(); expect(h.api.getState()).toBe('hidden'); h.setForm(patient()); h.edit(); vi.advanceTimersByTime(227);
    const raw = [...h.storage], session = h.session(), timers = vi.getTimerCount(), reference = h.api.getReferenceFingerprint();
    const decision = h.api.getCurrentDecision(); expect(decision).toMatchObject({ ready: true, state: 'new_patient' });
    expect(h.api.getState()).toBe('hidden'); expect(h.api.getReferenceFingerprint()).toBe(reference); expect([...h.storage]).toEqual(raw); expect(h.session()).toEqual(session); expect(vi.getTimerCount()).toBe(timers);
    expect(h.persist).not.toHaveBeenCalled(); expect(h.collect).not.toHaveBeenCalled(); expect(h.writes).not.toHaveBeenCalled(); expect(h.pure).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['onsetAgeYears', 11], ['menarcheAgeYears', 12.5], ['heightAtMenarcheCm', 152.5], ['boneAgeAtMenarcheYears', 12], ['gnrhaStartAgeYears', 9], ['gnrhaStopAgeYears', 11], ['gnrhaStatus', 'brak'], ['cdgpDeclared', 'nie'],
  ])('protects puberty-only %s without anthropometry or a patient name', (field, value) => {
    const h = environment(), valueOnly = blank(); valueOnly.puberty = { [field]: value }; h.setForm(valueOnly);
    expect(h.api.getCurrentDecision()).toMatchObject({ ready: true, state: 'new_patient' }); expect(h.writes).not.toHaveBeenCalled();
  });
  it('protects a legacy Tanner-only value while ignoring its blank default', () => {
    const h = environment(); expect(h.api.getCurrentDecision()).toMatchObject({ ready: true, state: 'hidden' });
    const value = blank(); value.user.tannerStage = '1'; h.setForm(value); expect(h.api.getCurrentDecision().state).toBe('new_patient');
  });
  it.each(['G', 'Th', 'P'])('protects a detailed %s-only observation without anthropometry', axis => {
    const h = environment(), value = blank(); value.user.pubertyAssessment = { version: 1, sex: axis === 'Th' ? 'F' : 'M', observations: { [axis]: { stage: 2, observedAtISO: null, ageMonths: null, source: 'clinician-entry' } } }; h.setForm(value);
    expect(h.api.getCurrentDecision()).toMatchObject({ ready: true, state: 'new_patient' });
  });
  it('keeps empty/default controls hidden and a saved default-only refresh saved', () => {
    const defaults = { adultVitals: { guideline: 'ESC' }, bp: { population: 'healthy' }, respiratory: { population: 'healthy', state: 'awake' }, plan: { palFactor: 1.4, palWybrany: false, dietLevel: 'normal', dietaWybrana: false } };
    const empty = environment(); empty.setForm({ ...blank(), ...defaults }); expect(empty.api.getCurrentDecision().state).toBe('hidden');
    // A real full saved collector already includes the automatic PAL section.
    const h = environment({ loaded: true, initial: { ...patient(), plan: { palFactor: 1.4, palWybrany: false, dietaWybrana: false } } }); h.setForm({ ...patient(), ...defaults }); expect(h.api.getCurrentDecision()).toMatchObject({ ready: true, state: 'saved' }); expect(h.writes).not.toHaveBeenCalled();
  });
  it('compares live fields against the reference while the persisted session remains unchanged', () => {
    const h = environment({ loaded: true }), value = patient(); value.user.weight = 41; h.setForm(value);
    expect(h.api.getState()).toBe('saved'); expect(h.api.getCurrentDecision().state).toBe('dirty'); expect(h.session().user.weight).toBe(40);
    h.setForm(patient()); expect(h.api.getCurrentDecision().state).toBe('saved'); h.setForm(blank()); expect(h.api.getCurrentDecision().state).toBe('dirty'); expect(h.persist).not.toHaveBeenCalled();
  });
  it.each(['docpro', 'klirens'])('uses the actual owned-field collector on %s without inventing edits in unowned saved sections', page => {
    const h = environment({ loaded: true }), fields = new Map();
    const put = (id, value) => fields.set(id, { id, value, checked: false, style: {}, dataset: {}, getAttribute: () => null, addEventListener() {} });
    for (const [id, value] of Object.entries({ name: patient().name, age: '12', ageMonths: '0', sex: 'M', height: '150', weight: '40', tannerStage: '2', intakePal: '1.8', palFactor: '1.4', dietLevel: 'normal', pubertyOnsetAge: '9' })) put(id, value);
    h.useActualPure(fields); const renal = { version: 2, inputs: { Scr: '1.25' } }; h.setClcr(renal);
    const saved = h.win.VildaDataImportExport.captureCurrentUserDataReadOnly({ base: { ...patient(), clcr: renal, intake: { pal: '1.8', history: [{ ageMonths: 130, height: 140 }], estKcalPerDay: 2000 }, foods: { snacks: [{ key: 'fictional', qty: 1 }], meals: [] }, extension: { preserved: true } } });
    h.setSession(saved); h.api._onPatientLoaded({ patientId: 'fictional-current-patient', applySequence: 1 }); vi.advanceTimersByTime(150);
    for (const id of ['intakePal', 'palFactor', 'dietLevel']) fields.delete(id);
    if (page === 'klirens') { fields.delete('tannerStage'); fields.delete('pubertyOnsetAge'); put('clcrForm', ''); h.win.VildaClcrSessionRuntime = { captureCurrentSessionReadOnly: () => clone(renal), saveNow: h.persist }; }
    h.collect.mockClear(); h.persist.mockClear(); h.writes.mockClear(); const previous = h.session();
    expect(h.api.getCurrentDecision()).toMatchObject({ ready: true, state: 'saved' }); fields.get('weight').value = ''; expect(h.api.getCurrentDecision().state).toBe('dirty'); fields.get('weight').value = '40'; expect(h.api.getCurrentDecision().state).toBe('saved');
    expect(h.session()).toEqual(previous); expect(h.writes).not.toHaveBeenCalled(); expect(h.persist).not.toHaveBeenCalled(); expect(h.collect).not.toHaveBeenCalled();
  });
  it('uses the canonical separate renal session when Start does not own a renal form and its nested draft is null', () => {
    const h = environment({ loaded: true, initial: { ...patient(), clcr: null } }), renal = { version: 2, inputs: { Scr: '1.25' } };
    h.setClcr(renal); h.api._onPatientLoaded({ patientId: 'fictional-current-patient', applySequence: 1 }); vi.advanceTimersByTime(150); h.writes.mockClear(); h.collect.mockClear(); h.persist.mockClear();
    const reference = h.api.getReferenceFingerprint(); expect(JSON.parse(reference).clcr.inputs.Scr).toBe('1.25'); expect(h.api.getCurrentDecision()).toMatchObject({ ready: true, state: 'saved' }); expect(h.writes).not.toHaveBeenCalled(); expect(h.collect).not.toHaveBeenCalled(); expect(h.persist).not.toHaveBeenCalled();
  });
  it('protects the actual legacy puberty-only DOM capture immediately without calling the flushing collector', () => {
    const h = environment(), fields = new Map([['pubertyOnsetAge', { id: 'pubertyOnsetAge', value: '11', getAttribute: () => null }]]); h.useActualPure(fields);
    const before = h.session(); expect(h.api.getCurrentDecision()).toMatchObject({ ready: true, state: 'new_patient' }); expect(h.session()).toEqual(before); expect(h.collect).not.toHaveBeenCalled(); expect(h.persist).not.toHaveBeenCalled(); expect(h.writes).not.toHaveBeenCalled();
  });
  it('does not let a cached ERROR hide actual unsaved data or pending SAVE appear ready', () => {
    const h = environment({ loaded: true }), value = patient(); value.user.weight = 44; h.setForm(value); h.api.notifySaveFailed('Fikcyjny błąd zapisu.');
    expect(h.api.getState()).toBe('error'); expect(h.api.getCurrentDecision()).toMatchObject({ ready: true, state: 'dirty' }); h.api._onSaveClicked(); expect(h.api.getCurrentDecision().ready).toBe(false);
  });
  it('stops a real pending main-save operation even before the cached header has entered SAVING', () => {
    const h = environment(); h.setForm(patient()); h.win.VildaDataImportExport.isSaveUserDataPending = () => true;
    expect(h.api.getState()).toBe('hidden'); expect(h.api.getCurrentDecision().ready).toBe(false); expect(h.pure).not.toHaveBeenCalled(); expect(h.writes).not.toHaveBeenCalled();
  });
  it('ignores an empty detailed-assessment wrapper and does not mutate a frozen live candidate', () => {
    const h = environment(), value = blank(); value.user.pubertyAssessment = { version: 1, sex: 'M', observations: { G: null, Th: null, P: null } }; value.user.pubertyAssessmentVisit = { version: 1, currentAxes: [], ownerPatientId: null };
    Object.freeze(value.user.pubertyAssessment); Object.freeze(value.user); Object.freeze(value); h.pure.mockReturnValue(value);
    expect(h.api.getCurrentDecision()).toMatchObject({ ready: true, state: 'hidden' }); expect(value.user.pubertyAssessment.observations.G).toBeNull(); expect(h.writes).not.toHaveBeenCalled();
  });
  it.each(['patient', 'sequence', 'account', 'lock', 'generation', 'edit'])('%s invalidates an earlier exact content decision', boundary => {
    const h = environment({ loaded: true }), decision = h.api.getCurrentDecision(); expect(h.api.isCurrentDecision(decision.scope)).toBe(true);
    if (boundary === 'patient') h.patientId('fictional-other-patient'); if (boundary === 'sequence') h.sequence(); if (boundary === 'account') h.account(); if (boundary === 'lock') h.lock(); if (boundary === 'generation') h.api._onStateRestored(); if (boundary === 'edit') { const value = patient(); value.user.weight = 42; h.setForm(value); }
    expect(h.api.isCurrentDecision(decision.scope)).toBe(false);
  });
  it('uses the existing readonly vault session ticket to reject a same-account adapter or key change', () => {
    const h = environment({ loaded: true }); let revision = 1;
    h.win.VildaVault.captureSyncOperationSession = () => Object.freeze({ revision }); h.win.VildaVault.assertSyncOperationSession = token => { if (token.revision !== revision) throw Object.assign(new Error('Fikcyjna zmiana adaptera/klucza'), { code: 'SESSION_CHANGED' }); };
    const decision = h.api.getCurrentDecision(); expect(h.api.isCurrentDecision(decision.scope)).toBe(true); revision++;
    expect(h.api.isCurrentDecision(decision.scope)).toBe(false); expect(h.api.isCurrentDecisionAfterSave(decision.scope, { patientId: 'fictional-current-patient' })).toBe(false); expect(h.writes).not.toHaveBeenCalled(); expect(h.persist).not.toHaveBeenCalled();
  });
  it.each(['restore', 'publication', 'stale', 'collector'])('%s gives a non-ready decision without publishing a new reference', boundary => {
    const h = environment({ loaded: true }), raw = [...h.storage];
    if (boundary === 'restore') h.win.__vildaPersistRestoring = true; if (boundary === 'publication') h.api._onStateRestored(); if (boundary === 'stale') h.stale(); if (boundary === 'collector') h.pure.mockImplementation(() => { throw new Error('Fikcyjny brak bieżącego odczytu.'); });
    const before = [...h.storage]; expect(h.api.getCurrentDecision().ready).toBe(false); expect([...h.storage]).toEqual(before); expect(raw).toEqual(before);
  });
  it.each([{ guest: true }, { unlocked: false }])('retains the established anonymous hidden passthrough (%j)', options => {
    const h = environment(options); h.setForm(patient()); expect(h.api.getCurrentDecision()).toMatchObject({ ready: true, state: 'hidden' }); expect(h.pure).not.toHaveBeenCalled();
  });
  it('keeps a same-owner failed-save callback current without accepting it as saved or weakening the content fence', () => {
    const h = environment({ loaded: true }), value = patient(); value.user.weight = 41; h.setForm(value); h.api._forceTransition('dirty'); const decision = h.api.getCurrentDecision(); h.api._onSaveClicked(); h.api.notifySaveFailed('Fikcyjny brak zapisu.');
    expect(h.api.isCurrentDecision(decision.scope)).toBe(false); expect(h.api.isCurrentDecisionOwner(decision.scope)).toBe(true); expect(h.api.isCurrentDecisionAfterSave(decision.scope, { patientId: 'fictional-current-patient' })).toBe(false);
    h.account(); expect(h.api.isCurrentDecisionOwner(decision.scope)).toBe(false);
  });
  it('accepts its unchanged successful save after indicator generation/reference publication changed', () => {
    const h = environment({ loaded: true }), value = patient(); value.user.weight = 41; h.setForm(value); const decision = h.api.getCurrentDecision(); h.api._onSaveClicked(); h.saved(undefined, { announce: true });
    expect(h.api.isCurrentDecision(decision.scope)).toBe(false); expect(h.api.isCurrentDecisionAfterSave(decision.scope, { patientId: 'fictional-current-patient' })).toBe(true);
    value.user.weight = 42; h.setForm(value); expect(h.api.isCurrentDecisionAfterSave(decision.scope, { patientId: 'fictional-current-patient' })).toBe(false);
  });
  it('accepts the actual per-call successful receipt with new PID while its own source-save publication is still queued', async () => {
    const h = environment(); h.setSequence(0); h.setForm(patient());
    h.win.VildaVault.captureSyncOperationSession = () => ({}); h.win.VildaVault.assertSyncOperationSession = () => true;
    h.win.document.addEventListener('vilda:patient-loaded', event => { if (event.detail.source === 'save') h.patientId(event.detail.patientId); });
    h.win.VildaVault.savePatient = async value => { h.setSession(value); const result = { patientId: 'fictional-real-pipeline-new', snapshotId: 'fictional-real-pipeline-snapshot', header: { name: value.name } }; h.notifySaved(result); return result; };
    const captured = h.api.getCurrentDecision(); const receipt = await h.win.VildaDataImportExport.saveUserDataWithReceipt({ collectUserData: h.form });
    expect(receipt).toMatchObject({ saved: true, patientId: 'fictional-real-pipeline-new' }); expect(h.api.getCurrentDecision().ready).toBe(false);
    expect(h.api.isCurrentDecisionAfterSave(captured.scope, receipt)).toBe(true); expect(h.api.isCurrentDecisionOwner(captured.scope)).toBe(false);
  });
  it('allows only the explicitly confirmed new-patient ID after a successful own save', () => {
    const h = environment(); h.setForm(patient()); const decision = h.api.getCurrentDecision(); h.saved('fictional-created-by-own-save', { announce: true });
    expect(h.api.isCurrentDecisionAfterSave(decision.scope, { patientId: 'fictional-unrelated-ack' })).toBe(false); expect(h.api.isCurrentDecisionAfterSave(decision.scope, { patientId: 'fictional-created-by-own-save' })).toBe(true);
    h.lock(); h.unlock(); expect(h.api.isCurrentDecisionAfterSave(decision.scope, { patientId: 'fictional-created-by-own-save' })).toBe(false);
  });

  it('does not treat a foreign vault save as proof that an anonymous live draft was saved', () => {
    const h = environment(); h.setForm(patient()); h.setSession(patient());
    h.notifySaved({ patientId: 'fictional-unrelated-vault-save', header: { name: 'Fikcyjny obcy pacjent' } });
    expect(h.storage.has('vildaCurrentPatientId')).toBe(false); expect(h.api.getState()).toBe('saved');
    expect(h.api.getCurrentDecision()).toMatchObject({ ready: true, state: 'new_patient' });
  });
  it('retains the captured decision through real ordinary puberty anchoring and300/400ms callbacks', () => {
    const initial=patient();initial.user.ageMonths=0;initial.user.pubertyAssessment={version:1,sex:'M',observations:{G:{stage:2,ageMonths:144,observedAtISO:null,source:'clinician-entry'},Th:null,P:null}};
    initial.user.pubertyAssessmentVisit={version:1,visitId:'fictional-catchup-visit',currentAxes:['G'],ownerPatientId:'fictional-current-patient',reference:{sex:'M',ageMonths:144,measuredAtISO:null}};
    const h=environment({loaded:true,initial}),fields=new Map();
    for(const[id,value]of Object.entries({name:initial.name,age:'12',ageMonths:'0',sex:'M',height:'150',weight:'40'}))fields.set(id,{id,value,checked:false,dataset:{},style:{},getAttribute:()=>null,addEventListener(){}});
    h.useActualPure(fields);h.win.crypto=crypto;h.win.VildaAuthUI={isBootReady:()=>true};h.win.VildaDobAge={readMeasuredAtISO:()=>null};
    h.win.VildaPersistence.getStorage=()=>h.win.sessionStorage;const write=vi.fn(value=>{h.setSession(value);return true});h.win.VildaPersistence.writeMainSession=write;
    h.setSession(null);h.win.VildaDataImportExport.restoreMainSessionIfAny();h.setSession(initial);
    loadBrowserScript('vilda_puberty_assessment.js',h.win);loadBrowserScript('vilda_puberty_assessment_state.js',h.win);
    const carrier=h.win.VildaPubertyAssessmentState;carrier.load(initial,{restore:true});expect(carrier.editObservation('P',3)).toEqual({ok:true});
    fields.get('age').value='13';h.win.document.dispatchEvent({type:'input',target:fields.get('age'),isTrusted:true});
    function rawAge(){h.win.__vildaPersistRestoring=true;const raw=carrier.capture().raw;h.win.__vildaPersistRestoring=false;return raw.observations.G.ageMonths}
    expect(rawAge()).toBe(144);const decision=h.api.getCurrentDecision();expect(decision).toMatchObject({ready:true,state:'dirty'});expect(rawAge()).toBe(144);
    vi.advanceTimersByTime(400);expect(write).toHaveBeenCalled();expect(rawAge()).toBe(156);expect(h.session().user.pubertyAssessment.observations.G.ageMonths).toBe(156);expect(h.api.isCurrentDecision(decision.scope)).toBe(true);
    expect(carrier.editObservation('P',4)).toEqual({ok:true});expect(h.api.isCurrentDecision(decision.scope)).toBe(false);
  });
  it('accepts unchanged actual detailed puberty after its real own save pipeline', async () => {
    const h=environment(),fields=new Map();h.setSequence(0);
    for(const[id,value]of Object.entries({name:'Fikcyjna Alicja',firstName:'Alicja',lastName:'Fikcyjna',age:'12',ageMonths:'0',sex:'F',height:'150',weight:'40',pubertyMenarcheAge:'11.5'}))fields.set(id,{id,value,checked:false,dataset:{},style:{},getAttribute:()=>null,addEventListener(){}});
    h.useActualPure(fields);h.win.crypto=crypto;h.win.VildaAuthUI={isBootReady:()=>true};h.win.VildaDobAge={readMeasuredAtISO:()=>null};
    h.win.VildaPersistence.getStorage=()=>h.win.sessionStorage;h.win.VildaPersistence.writeMainSession=value=>{h.setSession(value);return true};
    h.setSession(null);h.win.VildaDataImportExport.restoreMainSessionIfAny();
    loadBrowserScript('vilda_puberty_assessment.js',h.win);loadBrowserScript('vilda_puberty_assessment_state.js',h.win);
    const carrier=h.win.VildaPubertyAssessmentState;carrier.load({user:{sex:'F'}},{restore:true});expect(carrier.editObservation('Th',3)).toEqual({ok:true});
    h.win.VildaVault.captureSyncOperationSession=()=>({});h.win.VildaVault.assertSyncOperationSession=()=>true;
    h.win.document.addEventListener('vilda:patient-loaded',event=>{if(event.detail.source==='save')h.patientId(event.detail.patientId)});
    h.win.VildaVault.savePatient=async value=>{h.setSession(value);const result={patientId:'fictional-real-detailed-new',snapshotId:'fictional-detailed-snapshot',header:{name:value.name}};h.notifySaved(result);return result};
    const captured=h.api.getCurrentDecision();expect(captured).toMatchObject({ready:true,state:'new_patient'});
    const receipt=await h.win.VildaDataImportExport.saveUserDataWithReceipt();expect(receipt.saved).toBe(true);
    const actual=h.api.isCurrentDecisionAfterSave(captured.scope,receipt);
    expect(actual).toBe(true);
  });
  it.each(['other-visit','foreign-owner','clinical-edit','unconfirmed-receipt'])('rejects %s while considering the explicit new-patient visit-owner handoff', boundary => {
    const h=environment(),value=patient();value.user.pubertyAssessment={version:1,sex:'M',observations:{G:{stage:2,ageMonths:144,source:'clinician-entry'}}};
    value.user.pubertyAssessmentVisit={version:1,visitId:'fictional-own-save-visit',currentAxes:['G'],ownerPatientId:null,reference:{sex:'M',ageMonths:144}};
    h.setForm(value);const captured=h.api.getCurrentDecision();h.saved('fictional-own-created',{announce:true});
    value.user.pubertyAssessmentVisit.ownerPatientId='fictional-own-created';
    if(boundary==='other-visit')value.user.pubertyAssessmentVisit.visitId='fictional-other-visit';
    if(boundary==='foreign-owner')value.user.pubertyAssessmentVisit.ownerPatientId='fictional-foreign-owner';
    if(boundary==='clinical-edit')value.user.pubertyAssessment.observations.G.stage=3;
    h.setForm(value);const before=h.form(),reference=h.api.getReferenceFingerprint();
    const receipt={saved:boundary!=='unconfirmed-receipt',patientId:'fictional-own-created',snapshotId:'fictional-own-snapshot'};
    expect(h.api.isCurrentDecisionAfterSave(captured.scope,receipt)).toBe(false);
    expect(h.form()).toEqual(before);expect(h.api.getReferenceFingerprint()).toBe(reference);
  });
});
