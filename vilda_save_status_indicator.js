(function(n){"use strict";var i={HIDDEN:"hidden",NEW_PATIENT:"new_patient",SAVED:"saved",DIRTY:"dirty",SAVING:"saving",ERROR:"error"},oe=["vilda-save-state--hidden","vilda-save-state--new_patient","vilda-save-state--saved","vilda-save-state--dirty","vilda-save-state--saving","vilda-save-state--error"],s=i.HIDDEN,f=null,p=!1,l=null,d=null,v=null,S=null,h=null,z=null,o=null,D=!1;
// P-IMPORT-STATUS: a queued notification belongs to one applyLoadedData operation.
// Confirmed loads and clears invalidate it regardless of renderer speed.
var confirmedApplySequence=0,statusGeneration=0,statusPublicationScope=null,statusReadOnly=n.__vildaSaveStatusReadOnly===!0;
// P-KREATOR-ZAPIS-PAUZA: tylko edycja po opublikowaniu bazy może czekać
// na koniec pauzy. Kolejka nie ustanawia nowej bazy i nie przeżywa operacji.
var readyStatusScope=null,pausedStatusEdit=null,pausedStatusTimer=null,sharedStatusTimer=null;
// Destructive actions inspect the live owner once, without flushing autosave or
// publishing a new status/reference. The existing header keeps its debounce.
var decisionOwnerGeneration=0,decisionScopes=new WeakMap();
// A save is acknowledged by its committed snapshot, never by a later form flush.
// This selector contains no patient payload and is useful only in its own DIX scope.
var committedStatusSelector=null;
function decisionOwnerBoundary(){decisionOwnerGeneration+=1}
function decisionOwner(){
  var vault=n.VildaVault,unlocked=!!(vault&&typeof vault.isUnlocked==="function"&&vault.isUnlocked()),user=null;
  if(unlocked&&typeof vault.getCurrentUser==="function"){var current=vault.getCurrentUser();user=current&&current.userId||null}
  var token=vault&&typeof vault.captureSyncOperationSession==="function"&&typeof vault.assertSyncOperationSession==="function"?vault.captureSyncOperationSession():null;
  return {generation:decisionOwnerGeneration,vault:vault,userId:user,unlocked:unlocked,guest:n.VildaGuestMode===true,syncToken:token,
    patientId:statusPatientId(),applySequence:currentApplySequence()};
}
function sameDecisionOwner(a,b,expectedPatientId){
  if(a&&a.syncToken)try{a.vault.assertSyncOperationSession(a.syncToken)}catch{return false}
  return !!(a&&b&&a.generation===b.generation&&a.vault===b.vault&&a.userId===b.userId&&
    a.unlocked===b.unlocked&&a.guest===b.guest&&a.applySequence===b.applySequence&&
    (expectedPatientId===undefined?a.patientId===b.patientId:
      b.patientId===expectedPatientId&&(a.patientId===null||a.patientId===expectedPatientId)));
}
function decisionReady(owner,afterSave){
  if(owner.guest||!owner.unlocked)return true;
  // A completed synchronous clear leaves an autosave quarantine. This live
  // read performs no write and must still inspect any newly entered fields.
  if(!D||n.__vildaPersistRestoring===true||n.__vildaLustroWpis===true)return false;
  if(s===i.SAVING&&!afterSave)return false;
  if(statusPublicationScope&&!(afterSave&&statusPublicationScope.kind==="save"&&
    statusPublicationScope.patientId===owner.patientId&&statusPublicationScope.sequence===owner.applySequence))return false;
  var auth=n.VildaAuthUI,api=n.VildaDataImportExport,dob=n.VildaDobAge,panel=n.VildaPanelPacjent;
  return !(auth&&typeof auth.isBootReady==="function"&&!auth.isBootReady())&&
    !(api&&typeof api.isSaveUserDataPending==="function"&&api.isSaveUserDataPending())&&
    !(api&&typeof api.isMainSessionRestorePending==="function"&&api.isMainSessionRestorePending())&&
    !(dob&&typeof dob.restorePending==="function"&&dob.restorePending())&&
    !(panel&&typeof panel.nieaktualny==="function"&&panel.nieaktualny());
}
function decisionClone(value){return value==null?value:JSON.parse(JSON.stringify(value))}
function decisionAssessmentHasData(value){
  if(value==null||value==="")return false;
  if(typeof value!=="object")return true;
  if(value.version!==undefined&&value.version!==1)return true;
  var copy=decisionClone(value);delete copy.version;delete copy.sex;
  return M(copy)!==undefined;
}
function decisionHasData(value){
  var copy=decisionClone(value),user=copy&&copy.user||{},puberty=copy&&copy.puberty;
  var assessment=decisionAssessmentHasData(user.pubertyAssessment),legacy=user.tannerStage!=null&&String(user.tannerStage).trim()!=="";
  if(!assessment)delete user.pubertyAssessment;
  var additional=assessment||legacy||!!(puberty&&typeof puberty==="object"&&M(puberty)!==undefined);
  if(typeof n.hasMeaningfulMainSessionData==="function")return ae(copy)||additional;
  return statusSharedSessionHasPatient(copy)||additional;
}
function decisionFingerprint(value){
  var core=P(decisionClone(value)),ownsClcr=!!(n.document&&typeof n.document.getElementById==="function"&&n.document.getElementById("clcrForm"));
  // E() deliberately reads the separate renal session on other pages. A stale
  // nested main draft must not become a new renal edit merely by opening Clear.
  var clcr=ownsClcr?core&&core.clcr:ne();
  if(core&&Object.prototype.hasOwnProperty.call(core,"clcr"))delete core.clcr;
  b(core);
  return JSON.stringify(te({core:core,clcr:clcr?X(P(decisionClone(clcr))):null}));
}
function committedStatusFingerprint(value){
  var core=P(decisionClone(value)),clcr=core&&core.clcr;
  if(!core||typeof core!=="object")return null;
  delete core.clcr;b(core);
  return JSON.stringify(te({core:core,clcr:clcr?X(P(decisionClone(clcr))):null}));
}
function decisionCommittedReference(value,owner,reference,api){
  try{
    if(!committedStatusSelector||!reference||!api||typeof api.getCommittedSaveWitness!=="function")return reference;
    var witness=api.getCommittedSaveWitness(committedStatusSelector);
    if(!witness||witness.patientId!==owner.patientId||witness.sourcePatientId!==null||
      committedStatusFingerprint(witness.payload)!==reference)return reference;
    var copy=JSON.parse(reference),before=copy&&copy.core&&copy.core.user&&copy.core.user.pubertyAssessmentVisit;
    var live=value&&value.user&&value.user.pubertyAssessmentVisit;
    // Creating a patient binds the already existing examination to its new PID.
    // It does not acknowledge a different examination or any clinical edit.
    if(before&&live&&before.version===1&&live.version===1&&typeof before.visitId==="string"&&before.visitId&&
      before.visitId===live.visitId&&before.ownerPatientId==null&&live.ownerPatientId===owner.patientId){
      before.ownerPatientId=owner.patientId;
      return JSON.stringify(te(copy));
    }
  }catch{}
  return reference;
}
function decisionOwnSaveReference(value,owner,reference,api){
  // Match the complete actual committed payload before aliasing one legacy
  // fallback on detached comparison data. Stored/header references stay exact.
  try{
    if(!value.user||value.user.age!==null||!reference||!api||typeof api.getOwnSaveBlankAgeComparison!=="function")return reference;
    var witness=api.getOwnSaveBlankAgeComparison();
    if(!witness||witness.patientId!==owner.patientId)return reference;
    var savedFingerprint=committedStatusFingerprint(witness.payload);
    if(savedFingerprint!==reference){
      // The existing new-patient save handoff may bind this exact examination
      // in the normal session publisher before this detached age comparison.
      if(witness.sourcePatientId!==null)return reference;
      var saved=JSON.parse(savedFingerprint),raw=JSON.parse(reference);
      var beforeVisit=saved&&saved.core&&saved.core.user&&saved.core.user.pubertyAssessmentVisit;
      var referenceVisit=raw&&raw.core&&raw.core.user&&raw.core.user.pubertyAssessmentVisit;
      var liveVisit=value.user.pubertyAssessmentVisit;
      if(!beforeVisit||!referenceVisit||!liveVisit||beforeVisit.version!==1||referenceVisit.version!==1||liveVisit.version!==1||
        typeof beforeVisit.visitId!=="string"||!beforeVisit.visitId||beforeVisit.visitId!==referenceVisit.visitId||beforeVisit.visitId!==liveVisit.visitId||
        beforeVisit.ownerPatientId!=null||referenceVisit.ownerPatientId!==owner.patientId||liveVisit.ownerPatientId!==owner.patientId)return reference;
      beforeVisit.ownerPatientId=owner.patientId;
      if(JSON.stringify(te(saved))!==reference)return reference;
    }
    var copy=JSON.parse(reference),user=copy&&copy.core&&copy.core.user;
    if(!user||user.age!==0)return reference;
    delete user.age;
    return JSON.stringify(te(copy));
  }catch{return reference}
}
function decisionOwnSaveAutomaticPalReference(value,owner,reference,rawReference,api){
  // A page without PAL inputs can display defaults synthesized on load from
  // missing legacy fields. Only the real producer's scoped proof permits this
  // detached comparison alias; imported/manual PAL and the stored ref stay exact.
  try{
    if(!rawReference||!api||typeof api.getOwnSaveAutomaticPalComparison!=="function")return reference;
    var witness=api.getOwnSaveAutomaticPalComparison(value);
    if(!witness||witness.patientId!==owner.patientId||committedStatusFingerprint(witness.payload)!==rawReference)return reference;
    var copy=JSON.parse(reference);
    if(!copy.core)return reference;
    copy.core.plan=copy.core.plan||{};copy.core.plan.palFactor=witness.planPal;
    copy.core.intake=copy.core.intake||{};copy.core.intake.pal=witness.intakePal;
    return JSON.stringify(te(copy));
  }catch{return reference}
}
function readCurrentDecision(afterSave){
  var owner,generation=statusGeneration,state=i.HIDDEN,reference=null,fingerprint=null,ready=false;
  try{
    owner=decisionOwner();
    if(owner.guest||!owner.unlocked){ready=true}
    else if(decisionReady(owner,afterSave)){
      var persistence=n.VildaPersistence,base=persistence&&typeof persistence.readMainSession==="function"?decisionClone(persistence.readMainSession()):null;
      var api=n.VildaDataImportExport,value;
      if(api&&typeof api.captureCurrentUserDataReadOnly==="function")value=api.captureCurrentUserDataReadOnly({base:base});
      else if(statusReadOnly&&typeof n.collectUserData!=="function")value=base;
      else throw new Error("Bieżący odczyt formularza jest niedostępny.");
      if(!value||typeof value!=="object")throw new Error("Brak bieżącego odczytu formularza.");
      var ref=k();
      if(!owner.patientId||ref&&typeof ref.patientId==="string"&&ref.patientId&&ref.patientId!==owner.patientId)ref=null;
      reference=ref&&typeof ref.fp==="string"&&ref.fp?ref.fp:null;
      var rawReference=reference;
      reference=decisionCommittedReference(value,owner,reference,api);
      reference=decisionOwnSaveReference(value,owner,reference,api);
      reference=decisionOwnSaveAutomaticPalReference(value,owner,reference,rawReference,api);
      fingerprint=decisionFingerprint(value);
      state=reference!==null?(fingerprint===reference?i.SAVED:i.DIRTY):(decisionHasData(value)?i.NEW_PATIENT:i.HIDDEN);
      ready=sameDecisionOwner(owner,decisionOwner())&&generation===statusGeneration&&decisionReady(owner,afterSave);
    }
  }catch{ready=false}
  var scope=Object.freeze({});
  decisionScopes.set(scope,{owner:owner,generation:generation,reference:reference,fingerprint:fingerprint,ready:ready,state:state});
  return Object.freeze({ready:ready,state:state,scope:scope});
}
function getCurrentDecision(){return readCurrentDecision(false)}
function isCurrentDecision(scope){
  var original=decisionScopes.get(scope);
  if(!original||!original.ready)return false;
  var latest=readCurrentDecision(false),current=decisionScopes.get(latest.scope);
  return latest.ready&&sameDecisionOwner(original.owner,current.owner)&&original.generation===current.generation&&
    original.reference===current.reference&&original.fingerprint===current.fingerprint;
}
function isCurrentDecisionOwner(scope){
  var original=decisionScopes.get(scope);
  if(!original||!original.ready)return false;
  try{return sameDecisionOwner(original.owner,decisionOwner())}catch{return false}
}
function decisionContentAfterSave(original,current,receipt){
  if(original.fingerprint===current.fingerprint&&current.reference===current.fingerprint)return true;
  // The actual new-patient save binds this existing examination to its new PID.
  // Only that confirmed handoff may add its owner on detached comparisons.
  if(!receipt||receipt.saved!==true||original.owner.patientId!==null||original.state!==i.NEW_PATIENT)return false;
  try{
    var before=JSON.parse(original.fingerprint),after=JSON.parse(current.fingerprint),reference=JSON.parse(current.reference);
    function visit(value){return value&&value.core&&value.core.user&&value.core.user.pubertyAssessmentVisit}
    var a=visit(before),b=visit(after),r=visit(reference),patientId=receipt.patientId;
    if(!a||!b||!r||a.version!==1||b.version!==1||r.version!==1||
      typeof a.visitId!=="string"||!a.visitId||a.visitId!==b.visitId||a.visitId!==r.visitId||
      a.ownerPatientId!=null||b.ownerPatientId!==patientId||r.ownerPatientId!=null&&r.ownerPatientId!==patientId)return false;
    a.ownerPatientId=patientId;r.ownerPatientId=patientId;
    return JSON.stringify(te(before))===current.fingerprint&&JSON.stringify(te(reference))===current.fingerprint;
  }catch{return false}
}
function isCurrentDecisionAfterSave(scope,receipt){
  var original=decisionScopes.get(scope),patientId=receipt&&receipt.patientId;
  if(!original||!original.ready||!original.owner||!original.owner.unlocked||original.owner.guest||
    receipt&&receipt.referenceVerified===false||typeof patientId!=="string"||!patientId)return false;
  var latest=readCurrentDecision(true),current=decisionScopes.get(latest.scope);
  return latest.ready&&sameDecisionOwner(original.owner,current.owner,patientId)&&
    decisionContentAfterSave(original,current,receipt);
}
function captureStatusScope(){
  return {patientId:statusPatientId(),applySequence:currentApplySequence(),generation:statusGeneration,fingerprint:f};
}
function sameStatusScope(a,b){
  return !!(a&&b&&a.patientId===b.patientId&&a.applySequence===b.applySequence&&a.generation===b.generation);
}
function clearPausedStatusEdit(){
  if(pausedStatusTimer!==null)n.clearTimeout(pausedStatusTimer);
  pausedStatusTimer=null;pausedStatusEdit=null;
}
function markStatusReferenceReady(){
  var scope=captureStatusScope();
  readyStatusScope=f!==null&&Number.isSafeInteger(scope.applySequence)?scope:null;
}
function statusEditBlocked(){
  try{
    var vault=n.VildaVault,panel=n.VildaPanelPacjent;
    return !D||n.VildaGuestMode===!0||n.__vildaPersistRestoring===!0||n.__vildaLustroWpis===!0||
      Date.now()<Number(n.__vildaPersistClearUntil||0)||
      !!(vault&&typeof vault.isUnlocked==="function"&&!vault.isUnlocked())||
      !!(panel&&typeof panel.nieaktualny==="function"&&panel.nieaktualny());
  }catch{return !0}
}
function statusPauseRemaining(){
  try{return Math.max(0,Number(n.__vildaPersistPauseUntil||0)-Date.now())}catch{return 0}
}
function canDeferStatusEdit(scope){
  // Gotowość identyfikuje opublikowaną referencję przez pacjenta, generację i odcisk.
  // Odtworzenie sesji może zwiększyć sekwencję; pełny token samej edycji nadal musi zgadzać się z bieżącym przed i po zapisie.
  return !!(scope&&readyStatusScope&&Number.isSafeInteger(scope.applySequence)&&scope.applySequence>=0&&
    scope.patientId===readyStatusScope.patientId&&scope.generation===readyStatusScope.generation)&&
    sameStatusScope(scope,captureStatusScope())&&scope.fingerprint===f&&readyStatusScope.fingerprint===f&&!statusEditBlocked();
}
function runPausedStatusEdit(){
  var scope=pausedStatusEdit;
  pausedStatusTimer=null;
  if(!canDeferStatusEdit(scope)){clearPausedStatusEdit();return}
  var remaining=statusPauseRemaining();
  if(remaining>0){pausedStatusTimer=n.setTimeout(runPausedStatusEdit,remaining);return}
  pausedStatusEdit=null;
  // Sesja może nadal zawierać stary pomiar. Najpierw utrwalamy aktualny
  // formularz, potem porównujemy go z zachowaną bazą; f pozostaje bez zmian.
  compareStatusAfterPersist(scope);
}
function compareStatusAfterPersist(scope){
  if(!canDeferStatusEdit(scope))return;
  C();
  if(canDeferStatusEdit(scope))B();
}
function deferStatusEdit(scope){
  if(!canDeferStatusEdit(scope))return;
  clearPausedStatusEdit();
  pausedStatusEdit=scope;
  pausedStatusTimer=n.setTimeout(runPausedStatusEdit,Math.max(1,statusPauseRemaining()));
}
// P-CHIP-POWLOKA: odtworzenie i pokazanie panelu czytają wspólną bazę.
// Nie zapisują formularza ukrytej ramki ani nie uznają bieżącej sesji za zapis.
function isReadyForSharedReference(){
  if(!D||n.VildaGuestMode===!0||statusPublicationScope!==null)return false;
  try{
    var vault=n.VildaVault,auth=n.VildaAuthUI,api=n.VildaDataImportExport,dob=n.VildaDobAge,panel=n.VildaPanelPacjent;
    return !(vault&&typeof vault.isUnlocked==="function"&&!vault.isUnlocked())&&
      !(auth&&typeof auth.isBootReady==="function"&&!auth.isBootReady())&&
      n.__vildaPersistRestoring!==!0&&Date.now()>=Number(n.__vildaPersistClearUntil||0)&&
      !(api&&typeof api.isMainSessionRestorePending==="function"&&api.isMainSessionRestorePending())&&
      !(dob&&typeof dob.restorePending==="function"&&dob.restorePending())&&
      !(panel&&typeof panel.nieaktualny==="function"&&panel.nieaktualny());
  }catch{return false}
}
function adoptSharedStatusReference(){
  var ref=k(),id=statusPatientId();
  if(ref&&typeof ref.patientId==="string"&&ref.patientId&&ref.patientId!==id)ref=null;
  var next=ref&&typeof ref.fp==="string"&&ref.fp?ref.fp:null;
  if(f!==next){clearPausedStatusEdit();readyStatusScope=null}
  f=next;p=!!(next&&ref.dirty);
  l=next?ref.savedAtISO||null:null;d=next?ref.snapshotCount||null:null;v=next?ref.patientName||null:null;
  if(next)markStatusReferenceReady();
  return next!==null;
}
function statusOwnsVisibleForm(){
  if(statusReadOnly)return false;
  try{
    var parent=n.parent;
    if(!parent||parent===n)return true;
    var panes=parent.document&&parent.document.querySelectorAll("#appPanes iframe.app-pane");
    if(!panes||!panes.length)return false;
    var visible=[];
    for(var index=0;index<panes.length;index++){
      var pane=panes[index];
      if(pane.isConnected===false||pane.hidden)continue;
      var style=typeof parent.getComputedStyle==="function"?parent.getComputedStyle(pane):pane.style;
      if(style&&(style.display==="none"||style.visibility==="hidden"))continue;
      visible.push(pane);
    }
    return visible.length===1&&visible[0].contentWindow===n;
  }catch{return false}
}
function renderCurrentStatusDecision(afterSave){
  var api=n.VildaDataImportExport;
  if(!api||typeof api.captureCurrentUserDataReadOnly!=="function"||!statusOwnsVisibleForm())return false;
  var decision=readCurrentDecision(!!afterSave);
  // An unready live form must not fall through to its older persisted session.
  if(!decision.ready)return true;
  var dirty=decision.state===i.DIRTY;
  if(f!==null&&p!==dirty){p=dirty;I()}
  c(decision.state);return true;
}
function reconcileFromSharedReference(){
  if(!isReadyForSharedReference()||s===i.SAVING||s===i.ERROR)return s;
  adoptSharedStatusReference();
  if(renderCurrentStatusDecision(false))return s;
  if(_()){c(i.HIDDEN);return s}
  if(f===null){c(i.NEW_PATIENT);return s}
  var current=E();
  if(current!==null)p=current!==f;
  c(p?i.DIRTY:i.SAVED);return s;
}
function scheduleSharedStatusReconcile(){
  // Zmiana właściciela unieważnia oczekującą edycję od razu, także przy
  // szybkim A → B → A przed odczytem sesji. Identyfikator zostaje w pamięci.
  observeSharedStatusPatient(statusPatientId());
  if(sharedStatusTimer!==null)n.clearTimeout(sharedStatusTimer);
  sharedStatusTimer=n.setTimeout(function(){sharedStatusTimer=null;reconcileFromSharedReference()},200);
}
function observeSharedStatusPatient(id){
  var publication=statusPublicationScope;
  if(publication){
    // Własny loader może nadać docelowy identyfikator po zdarzeniu G.
    // Po jego przyjęciu powrót do poprzedniego właściciela jest nową zmianą.
    if(id===publication.patientId)publication.observedPatientId=id;
    else if(id!==publication.observedPatientId){decisionOwnerBoundary();invalidateStatusPublication();}
  }
  if(readyStatusScope&&readyStatusScope.patientId!==id){decisionOwnerBoundary();invalidateStatusPublication();}
}
function sharedStatusStorageChanged(event){
  var key=event&&event.key;
  // Zdarzenia storage mogą czekać w kolejce, gdy bieżący PID już wrócił.
  if(key==="vildaCurrentPatientId"&&(typeof event.newValue==="string"||event.newValue===null))observeSharedStatusPatient(event.newValue||null);
  if(key==null||["vilda-save-ref-v1","vildaMainSessionV1","vildaClcrSessionV1","vildaCurrentPatientId"].indexOf(key)!==-1)scheduleSharedStatusReconcile();
}
function currentApplySequence(){
  try{var api=n.VildaDataImportExport,value=api&&typeof api.getApplyLoadedDataSequence==="function"?api.getApplyLoadedDataSequence():null;
    return Number.isSafeInteger(value)&&value>=0?value:null;
  }catch{return null}
}
function statusPatientId(){
  try{return n.sessionStorage?n.sessionStorage.getItem("vildaCurrentPatientId")||null:n._vildaCurrentPatientId||null}catch{return null}
}
function confirmApplySequence(detail,requireExplicit){
  var sequence=detail&&detail.applySequence,latest=currentApplySequence();
  if(!Number.isSafeInteger(sequence)||sequence<0){if(requireExplicit)return;sequence=latest}
  if(sequence!==null&&sequence===latest)confirmedApplySequence=Math.max(confirmedApplySequence,sequence);
}
function obsoleteImport(detail){
  var sequence=detail&&detail.applySequence;
  return Number.isSafeInteger(sequence)&&sequence>0&&
    (sequence<=confirmedApplySequence||sequence!==currentApplySequence());
}
function invalidateStatusPublication(){statusGeneration+=1;statusPublicationScope=null;readyStatusScope=null;clearPausedStatusEdit()}
function publishStatusLater(callback,expectedPatientId,kind){
  var generation=statusGeneration,sequence=currentApplySequence();
  var publication={generation:generation,sequence:sequence,patientId:expectedPatientId,observedPatientId:statusPatientId(),kind:kind||"load"};
  statusPublicationScope=publication;
  n.setTimeout(function(){
    if(statusPublicationScope===publication)statusPublicationScope=null;
    if(generation!==statusGeneration||sequence!==currentApplySequence()||expectedPatientId!==statusPatientId())return;
    callback();
  },150);
}
// P-CHIP-NAWIGACJA: porównujemy wejścia pacjenta. Kalkulator spożycia
// po odtworzeniu dopisuje wynik i kopie pomiarów z innych kart.
function statusNumber(value){
  if(value==null||value===""||typeof value==="boolean")return null;
  var number=Number(value);
  return Number.isFinite(number)?number:null;
}
function statusMeasurementKey(row){
  if(!row||typeof row!=="object")return null;
  var months=statusNumber(row.ageMonths),height=statusNumber(row.height),weight=statusNumber(row.weight);
  if(months===null)months=statusNumber(row.months);
  if(months===null){var years=statusNumber(row.ageYears);if(years!==null)months=Math.round(years*12)}
  return months!==null&&height!==null&&weight!==null?JSON.stringify([months,height,weight]):null;
}
function normalizeStatusInputs(value){
  var core=value&&value.core,intake=core&&core.intake;
  if(!intake||typeof intake!=="object")return;
  delete intake.estKcalPerDay;
  if(!Array.isArray(intake.history))return;
  var mirrors=new Set(),user=core.user||{},years=statusNumber(user.age),months=statusNumber(user.ageMonths);
  var current=years===null?null:statusMeasurementKey({ageMonths:years*12+(months===null?0:months),height:user.height,weight:user.weight});
  if(current!==null)mirrors.add(current);
  [core.advanced,core.growthBasic].forEach(function(section){
    var rows=section&&section.data&&section.data.measurements;
    if(Array.isArray(rows))rows.forEach(function(row){var key=statusMeasurementKey(row);if(key!==null)mirrors.add(key)});
  });
  intake.history=intake.history.filter(function(row){
    var key=statusMeasurementKey(row);
    if(key===null||!mirrors.has(key))return true;
    // Dodatkowa treść wiersza pozostaje informacją do zapisania.
    return Object.keys(row).some(function(field){return ["ageMonths","ageYears","months","height","weight"].indexOf(field)===-1});
  });
}
// P-CHIP-NAWIGACJA: brak pustej karty i jej domyślne kontrolki są
// równoważne. Wyłącznie wartości z index.html; pomiary i inne wybory zostają.
// Jak Bgw_odcisk w vilda_vault.js: gwiazdka i stemple rejestru sejfu
// nie są treścią formularza. Usuwamy je tylko z klonu core porównania.
function normalizeStatusVaultMetadata(value){
  var core=value&&value.core;
  if(!core||typeof core!=="object"||Array.isArray(core))return;
  delete core._pinned;delete core._pinnedState;delete core._contentAtISO;
}
// vilda_bone_age.js empty()/normaliseContext(): pusty model nie oznacza
// badania. Żadnych obserwacji, innych wersji ani rozszerzeń nie pomijamy.
function normalizeStatusEmptyBoneAge(value){
  var advanced=value&&value.core&&value.core.advanced,context=advanced&&advanced.boneAgeContext;
  if(!context||typeof context!=="object"||Array.isArray(context)||context.version!==1)return;
  var keys=Object.keys(context);
  if(!keys.every(function(key){return key==="version"||key==="current"||key==="last"}))return;
  if(Object.prototype.hasOwnProperty.call(context,"current")&&context.current!==null)return;
  if(Object.prototype.hasOwnProperty.call(context,"last")&&context.last!==null)return;
  delete advanced.boneAgeContext;
}
// Istniejący kontrakt vildaDietaPoWczytaniu/Bsc_dane: tylko manualtrue
// oznacza wybór lekarza. Brak flagi w starszej referencji to również automat.
function normalizeStatusAutomaticDiet(value){
  var plan=value&&value.core&&value.core.plan;
  if(plan&&typeof plan==="object"&&!Array.isArray(plan)&&!(plan.dietaWybrana===true&&plan.dietLevel))delete plan.dietLevel;
}
// collectAdvancedMeasurements/basic history dokładają pozycję w DOM.
// Pomijamy wyłącznie indeks liczbowy dokładnie zgodny z pozycją w tablicy.
function normalizeStatusMeasurementUi(value){
  var core=value&&value.core;
  [core&&core.advanced,core&&core.growthBasic].forEach(function(section){
    var rows=section&&section.data&&section.data.measurements;
    if(!Array.isArray(rows))return;
    rows.forEach(function(row,index){
      if(row&&typeof row==="object"&&!Array.isArray(row)&&typeof row.domIndex==="number"&&row.domIndex===index)delete row.domIndex;
    });
  });
}
function normalizeStatusUiDefaults(value){
  var core=value&&value.core;
  if(!core||typeof core!=="object")return;
  [["adultVitals","guideline","ESC"],["bp","population","healthy"],
    ["respiratory","population","healthy"],["respiratory","state","awake"]].forEach(function(item){
    var section=core[item[0]];
    if(section&&typeof section==="object"&&!Array.isArray(section)&&section[item[1]]===item[2])delete section[item[1]];
  });
}
function statusLoadChoiceApplied(detail){
  if(statusReadOnly){scheduleSharedStatusReconcile();return}
  if(!detail||detail.choice!=="new"||typeof detail.patientId!=="string"||!detail.patientId||
    detail.patientId!==statusPatientId()||!Number.isSafeInteger(detail.applySequence)||
    detail.applySequence<0||detail.applySequence!==currentApplySequence())return;
  decisionOwnerBoundary();invalidateStatusPublication();confirmApplySequence(detail);h=null;
  if(o){clearTimeout(o);o=null}
  // Wybranie wizyty zakończyło już synchroniczną synchronizację. Ustal bazę
  // teraz, zanim lekarz zacznie wpisywać pierwszy pomiar.
  C();f=E();p=!1;I();markStatusReferenceReady();c(i.SAVED);
}
// P-CHIP-KLIRENS: rendering all renal calculators materializes their empty
// control defaults. These are equivalent to an absent calculator in the save
// comparison only; the actual form, session, export and provenance stay intact.
function normalizeSodiumStatusQuantities(session){
  var inputs=session&&session.inputs,engine=n.VildaClcrSodiumDzm;
  if(!inputs||typeof inputs!=="object"||Array.isArray(inputs)||!engine||
    typeof engine.inputFromValues!=="function"||typeof engine.convertUnitInput!=="function")return;
  var normalized;
  try{normalized=engine.inputFromValues(inputs)}catch{return}
  var provenance=normalized&&normalized.unitConversions,rawMetadata=inputs.Na_unitConversions,remaining=null;
  try{
    remaining=typeof rawMetadata==="string"&&rawMetadata.trim()?JSON.parse(rawMetadata):rawMetadata;
    if(remaining&&typeof remaining==="object"&&!Array.isArray(remaining))remaining=Object.assign(Object.create(null),remaining);else remaining=null;
  }catch{}
  [["volume","Na_volume","Na_volumeUnit","mL"],["reportedValue","Na_reportedValue","Na_reportedUnit","mmol/24h"]].forEach(function(item){
    var kind=item[0],id=item[1],unitId=item[2],raw=inputs[id],unit=inputs[unitId]||item[3];
    if(raw==null||typeof raw==="string"&&!raw.trim()||typeof raw!=="string"&&typeof raw!=="number")return;
    var entry=provenance&&provenance[kind],converted;
    try{converted=engine.convertUnitInput(entry?entry.originalValue:raw,entry?entry.originalUnit:unit,item[3],kind)}catch{return}
    var exact=converted&&converted.ok&&converted.exactCanonical;
    if(!exact||typeof exact.numerator!=="string"||typeof exact.denominator!=="string")return;
    // Exact source quantity, validated by the actual calculator. A rounded
    // display conversion and an unrepresentable Number must never become0.
    inputs[id]="sodium:"+kind+":"+exact.numerator+"/"+exact.denominator;
    if(entry&&remaining)delete remaining[kind];
  });
  if(remaining&&Object.keys(remaining).length===0)delete inputs.Na_unitConversions;
}
// Potassium exposes only a volume display conversion. Compare the validated
// exact quantity so a mL/L cycle remains presentation in the saved-patient chip.
function normalizePotassiumStatusQuantities(session){
  var inputs=session&&session.inputs,engine=n.VildaClcrPotassiumDzm;
  if(!inputs||typeof inputs!=="object"||Array.isArray(inputs)||!engine||
    typeof engine.inputFromValues!=="function"||typeof engine.convertUnitInput!=="function")return;
  var normalized;
  try{normalized=engine.inputFromValues(inputs)}catch{return}
  var provenance=normalized&&normalized.unitConversions,rawMetadata=inputs.K_unitConversions,remaining=null;
  try{
    remaining=typeof rawMetadata==="string"&&rawMetadata.trim()?JSON.parse(rawMetadata):rawMetadata;
    if(remaining&&typeof remaining==="object"&&!Array.isArray(remaining))remaining=Object.assign(Object.create(null),remaining);else remaining=null;
  }catch{}
  var raw=inputs.K_volume,unit=inputs.K_volumeUnit||"mL";
  if(raw==null||typeof raw==="string"&&!raw.trim()||typeof raw!=="string"&&typeof raw!=="number")return;
  var entry=provenance&&provenance.volume,converted;
  try{converted=engine.convertUnitInput(entry?entry.originalValue:raw,entry?entry.originalUnit:unit,"mL","volume")}catch{return}
  var exact=converted&&converted.ok&&converted.exactCanonical;
  if(!exact||typeof exact.numerator!=="string"||typeof exact.denominator!=="string")return;
  inputs.K_volume="potassium:volume:"+exact.numerator+"/"+exact.denominator;
  if(entry&&remaining)delete remaining.volume;
  if(remaining&&Object.keys(remaining).length===0)delete inputs.K_unitConversions;
}
// KM/Cr unit selectors describe the entered number; they are not display-only
// conversions. Keep that meaning before the generic Unit-suffix cleanup. The
// derived comparison keys never alter a control, session or captured record.
function normalizeUrateCreatinineStatusInputs(session){
  if(!session||typeof session!=="object"||Array.isArray(session))return;
  var original=session.inputs,preserved=session.preservedInputs;
  var values=original&&typeof original==="object"&&!Array.isArray(original)?original:null;
  var selected=session.selectedFormula||values&&values.formulaPicker||preserved&&preserved.formulaPicker;
  if(!values&&selected==="KM_Cr"&&preserved&&typeof preserved==="object"&&!Array.isArray(preserved))values=session.inputs=Object.assign({},preserved);
  if(!values)return;
  var own=function(key){return Object.prototype.hasOwnProperty.call(values,key)};
  var present=function(value){return value!==null&&value!==undefined&&!(typeof value==="string"&&!value.trim())};
  var fields=["URCR_inputMode","URCR_uricAcid","URCR_uricAcidUnit","URCR_creatinine","URCR_creatinineUnit",
    "URCR_reportedValue","URCR_reportedUnit","URCR_specimen","URCR_outputUnit"];
  if(selected==="KM_Cr"&&!fields.some(own)&&(present(values.U_UA)||present(values.Ucr))){
    values.URCR_inputMode="concentration";
    if(own("U_UA"))values.URCR_uricAcid=values.U_UA;
    if(own("Ucr"))values.URCR_creatinine=values.Ucr;
    values.URCR_uricAcidUnit="mg/dL";values.URCR_creatinineUnit="mg/dL";
    ["U_UA","Ucr"].forEach(function(key){if(typeof values[key]==="number")values[key]=String(values[key])});
    // The former menu label DZM was not evidence of the actual specimen.
    values.URCR_specimen="unknown";
  }
  if(own("URCR_legacyAliases")){
    var aliases=values.URCR_legacyAliases;
    if(typeof aliases==="string")try{aliases=JSON.parse(aliases)}catch{}
    if(aliases&&typeof aliases==="object"&&!Array.isArray(aliases)&&Object.keys(aliases).length&&
      Object.keys(aliases).every(function(key){return ["U_UA","Ucr"].indexOf(key)!==-1&&
        ["string","number"].indexOf(typeof aliases[key])!==-1&&String(aliases[key]).trim()&&String(aliases[key]).length<=512&&
        (typeof aliases[key]!=="number"||Number.isFinite(aliases[key]))}))delete values.URCR_legacyAliases;
  }
  var quantities=[["URCR_uricAcid","URCR_uricAcidUnit","uricAcid","mg/dL"],
    ["URCR_creatinine","URCR_creatinineUnit","creatinine","mg/dL"],
    ["URCR_reportedValue","URCR_reportedUnit","reportedValue","mmol/mmol"]];
  var measured=quantities.some(function(item){return present(values[item[0]])});
  if(!measured){
    fields.forEach(function(key){delete values[key]});
    delete values.URCR_unitSemantics;
  }else{
    quantities.forEach(function(item){if(typeof values[item[0]]==="number")values[item[0]]=String(values[item[0]])});
    if(!own("URCR_inputMode"))values.URCR_inputMode="concentration";
    if(!own("URCR_specimen"))values.URCR_specimen="unknown";
    var prior=values.URCR_unitSemantics,meaning={};
    quantities.forEach(function(item){
      if(!present(values[item[0]]))return;
      meaning[item[2]]=own(item[1])?values[item[1]]:prior&&typeof prior==="object"&&Object.prototype.hasOwnProperty.call(prior,item[2])?prior[item[2]]:item[3];
    });
    if(own("URCR_outputUnit")&&values.URCR_outputUnit!=="mmol/mmol")meaning.output=values.URCR_outputUnit;
    else if(prior&&typeof prior==="object"&&Object.prototype.hasOwnProperty.call(prior,"output"))meaning.output=prior.output;
    values.URCR_unitSemantics=meaning;
  }
  if(own("URCR_sameUrineSample")){
    values.URCR_sampleMatchMeaning=typeof values.URCR_sameUrineSample==="boolean"?String(values.URCR_sameUrineSample):values.URCR_sameUrineSample;
    delete values.URCR_sameUrineSample;
  }
}
// Ca/Cr DZM controls are mounted even when another calculator is selected.
// Ignore an empty form's configuration only in the patient-save comparison;
// entered operands, their declared units and explicit specimen facts remain
// meaningful. This does not change the actual session or historical record.
function normalizeCacrDzmStatusInputs(session){
  if(!session||typeof session!=="object"||Array.isArray(session))return;
  var values=session.inputs,preserved=session.preservedInputs;
  var selected=session.selectedFormula||values&&values.formulaPicker||preserved&&preserved.formulaPicker;
  if((!values||typeof values!=="object"||Array.isArray(values))&&selected==="Ca_Cr"&&preserved&&typeof preserved==="object"&&!Array.isArray(preserved))values=session.inputs=Object.assign({},preserved);
  if(!values||typeof values!=="object"||Array.isArray(values))return;
  var own=function(key){return Object.prototype.hasOwnProperty.call(values,key)};
  var present=function(value){return value!==null&&value!==undefined&&!(typeof value==="string"&&!value.trim())};
  var canonicalUnit=function(value){return ({"g/g":"mg/mg","mol/mol":"mmol/mmol","mg/dl":"mg/dL","μmol/L":"µmol/L","umol/L":"µmol/L"})[value]||value};
  // The spot session migrates these two exact aliases without changing the
  // entered ratio. Ignore only its validated derived provenance marker.
  if(own("CaCr_reported_unit_original")&&["g/g","mol/mol"].indexOf(values.CaCr_reported_unit_original)!==-1&&
    (!own("CaCr_reported_unit")||canonicalUnit(values.CaCr_reported_unit)===canonicalUnit(values.CaCr_reported_unit_original)))delete values.CaCr_reported_unit_original;
  var fields=["CACR_DZM_inputMode","CACR_DZM_calcium","CACR_DZM_calciumUnit","CACR_DZM_creatinine","CACR_DZM_creatinineUnit","CACR_DZM_reportedValue","CACR_DZM_reportedUnit"];
  if(selected==="Ca_Cr"&&!Object.keys(values).some(function(key){return key.indexOf("CACR_DZM_")===0})&&(present(values.U_Ca)||present(values.Ucr))){
    values.CACR_DZM_inputMode="concentration";
    if(own("U_Ca"))values.CACR_DZM_calcium=values.U_Ca;
    if(own("Ucr"))values.CACR_DZM_creatinine=values.Ucr;
    values.CACR_DZM_calciumUnit="mmol/L";values.CACR_DZM_creatinineUnit="mg/dL";
    ["U_Ca","Ucr"].forEach(function(key){if(typeof values[key]==="number")values[key]=String(values[key])});
  }
  if(own("CACR_DZM_legacyAliases")){
    var aliases=values.CACR_DZM_legacyAliases;
    if(typeof aliases==="string")try{aliases=JSON.parse(aliases)}catch{}
    if(aliases&&typeof aliases==="object"&&!Array.isArray(aliases)&&Object.keys(aliases).length&&Object.keys(aliases).every(function(key){
      return ["U_Ca","Ucr"].indexOf(key)!==-1&&["string","number"].indexOf(typeof aliases[key])!==-1&&String(aliases[key]).trim()&&
        String(aliases[key]).length<=512&&(typeof aliases[key]!=="number"||Number.isFinite(aliases[key]));
    }))delete values.CACR_DZM_legacyAliases;
  }
  var quantities=[["CACR_DZM_calcium","CACR_DZM_calciumUnit","calcium","mmol/L"],
    ["CACR_DZM_creatinine","CACR_DZM_creatinineUnit","creatinine","mg/dL"],
    ["CACR_DZM_reportedValue","CACR_DZM_reportedUnit","reportedValue","mg/mg"]];
  var prior=values.CACR_DZM_unitSemantics,meaning={};
  if(quantities.some(function(item){return present(values[item[0]])})){
    if(!own("CACR_DZM_inputMode"))values.CACR_DZM_inputMode="concentration";
    quantities.forEach(function(item){
      if(!present(values[item[0]]))return;
      if(typeof values[item[0]]==="number")values[item[0]]=String(values[item[0]]);
      meaning[item[2]]=canonicalUnit(own(item[1])?values[item[1]]:prior&&typeof prior==="object"&&Object.prototype.hasOwnProperty.call(prior,item[2])?prior[item[2]]:item[3]);
    });
    values.CACR_DZM_unitSemantics=meaning;
  }else{
    fields.forEach(function(key){delete values[key]});
    delete values.CACR_DZM_unitSemantics;
  }
  if(own("CACR_DZM_reportedUnitOriginal")&&["g/g","mol/mol"].indexOf(values.CACR_DZM_reportedUnitOriginal)!==-1&&
    (!present(values.CACR_DZM_reportedValue)||canonicalUnit(values.CACR_DZM_reportedUnitOriginal)===meaning.reportedValue))delete values.CACR_DZM_reportedUnitOriginal;
  var context=values.CACR_DZM_contextSemantics&&typeof values.CACR_DZM_contextSemantics==="object"&&!Array.isArray(values.CACR_DZM_contextSemantics)?Object.assign({},values.CACR_DZM_contextSemantics):{};
  ["sameSpecimen","collectionProblem","collectionHours","durationKnown","currentPreterm"].forEach(function(key){
    var id="CACR_DZM_"+key;
    if(!own(id))return;
    var raw=values[id];delete values[id];delete context[key];
    if(!present(raw)||key==="sameSpecimen"&&raw==="assumed")return;
    var text=String(raw);
    if(key==="sameSpecimen")text=["true","yes","confirmed"].indexOf(text)!==-1?"confirmed":["false","no","different"].indexOf(text)!==-1?"different":text;
    else if(key!=="collectionHours")text=["true","yes"].indexOf(text)!==-1?"true":["false","no"].indexOf(text)!==-1?"false":text;
    context[key]=text;
  });
  if(Object.keys(context).length)values.CACR_DZM_contextSemantics=context;
  else delete values.CACR_DZM_contextSemantics;
}
// Mg/Ca DZM controls are mounted even when another calculator is selected.
// Ignore an empty form's configuration only in the patient-save comparison;
// entered operands, their declared units and explicit specimen facts remain
// meaningful. This does not change the actual session or historical record.
function normalizeMagnesiumCalciumStatusInputs(session){
  if(!session||typeof session!=="object"||Array.isArray(session))return;
  var values=session.inputs,preserved=session.preservedInputs;
  var selected=session.selectedFormula||values&&values.formulaPicker||preserved&&preserved.formulaPicker;
  if((!values||typeof values!=="object"||Array.isArray(values))&&selected==="Mg_Ca"&&preserved&&typeof preserved==="object"&&!Array.isArray(preserved))values=session.inputs=Object.assign({},preserved);
  if(!values||typeof values!=="object"||Array.isArray(values))return;
  var own=function(key){return Object.prototype.hasOwnProperty.call(values,key)};
  var present=function(value){return value!==null&&value!==undefined&&!(typeof value==="string"&&!value.trim())};
  var canonicalUnit=function(value){return ({"g/g":"mg/mg","mol/mol":"mmol/mmol","mg/dl":"mg/dL","μmol/L":"µmol/L","umol/L":"µmol/L"})[value]||value};
  var fields=["MGCA_inputMode","MGCA_magnesium","MGCA_magnesiumUnit","MGCA_calcium","MGCA_calciumUnit","MGCA_reportedValue","MGCA_reportedUnit"];
  if(selected==="Mg_Ca"&&!Object.keys(values).some(function(key){return key.indexOf("MGCA_")===0})&&(present(values.U_Mg)||present(values.U_Ca))){
    values.MGCA_inputMode="concentration";
    if(own("U_Mg"))values.MGCA_magnesium=values.U_Mg;
    if(own("U_Ca"))values.MGCA_calcium=values.U_Ca;
    values.MGCA_magnesiumUnit="mg/L";values.MGCA_calciumUnit="mmol/L";
    ["U_Mg","U_Ca"].forEach(function(key){if(typeof values[key]==="number")values[key]=String(values[key])});
  }
  if(own("MGCA_legacyAliases")){
    var aliases=values.MGCA_legacyAliases;
    if(typeof aliases==="string")try{aliases=JSON.parse(aliases)}catch{}
    if(aliases&&typeof aliases==="object"&&!Array.isArray(aliases)&&Object.keys(aliases).length&&Object.keys(aliases).every(function(key){
      return ["U_Mg","U_Ca"].indexOf(key)!==-1&&["string","number"].indexOf(typeof aliases[key])!==-1&&String(aliases[key]).trim()&&
        String(aliases[key]).length<=512&&(typeof aliases[key]!=="number"||Number.isFinite(aliases[key]));
    }))delete values.MGCA_legacyAliases;
  }
  var quantities=[["MGCA_magnesium","MGCA_magnesiumUnit","magnesium","mg/L"],
    ["MGCA_calcium","MGCA_calciumUnit","calcium","mmol/L"],
    ["MGCA_reportedValue","MGCA_reportedUnit","reportedValue","mg/mg"]];
  var prior=values.MGCA_unitSemantics,meaning={};
  if(quantities.some(function(item){return present(values[item[0]])})){
    if(!own("MGCA_inputMode"))values.MGCA_inputMode="concentration";
    quantities.forEach(function(item){
      if(!present(values[item[0]]))return;
      if(typeof values[item[0]]==="number")values[item[0]]=String(values[item[0]]);
      meaning[item[2]]=canonicalUnit(own(item[1])?values[item[1]]:prior&&typeof prior==="object"&&Object.prototype.hasOwnProperty.call(prior,item[2])?prior[item[2]]:item[3]);
    });
    values.MGCA_unitSemantics=meaning;
  }else{
    fields.forEach(function(key){delete values[key]});
    delete values.MGCA_unitSemantics;
  }
  if(own("MGCA_reportedUnitOriginal")&&["g/g","mol/mol"].indexOf(values.MGCA_reportedUnitOriginal)!==-1&&
    (!present(values.MGCA_reportedValue)||canonicalUnit(values.MGCA_reportedUnitOriginal)===meaning.reportedValue))delete values.MGCA_reportedUnitOriginal;
  var context=values.MGCA_contextSemantics&&typeof values.MGCA_contextSemantics==="object"&&!Array.isArray(values.MGCA_contextSemantics)?Object.assign({},values.MGCA_contextSemantics):{};
  ["sameSpecimen","collectionProblem","collectionHours","durationKnown"].forEach(function(key){
    var id="MGCA_"+key;
    if(!own(id))return;
    var raw=values[id];delete values[id];delete context[key];
    if(!present(raw)||key==="sameSpecimen"&&raw==="assumed")return;
    var text=String(raw);
    if(key==="sameSpecimen")text=["true","yes","confirmed"].indexOf(text)!==-1?"confirmed":["false","no","different"].indexOf(text)!==-1?"different":text;
    else if(key!=="collectionHours")text=["true","yes"].indexOf(text)!==-1?"true":["false","no"].indexOf(text)!==-1?"false":text;
    context[key]=text;
  });
  if(Object.keys(context).length)values.MGCA_contextSemantics=context;
  else delete values.MGCA_contextSemantics;
}
function normalizePhosphorusCreatinineStatusInputs(session){
  if(!session||typeof session!=="object"||Array.isArray(session))return;
  var values=session.inputs,preserved=session.preservedInputs;
  var selected=session.selectedFormula||values&&values.formulaPicker||preserved&&preserved.formulaPicker;
  if((!values||typeof values!=="object"||Array.isArray(values))&&selected==="PO4_Cr"&&preserved&&typeof preserved==="object"&&!Array.isArray(preserved))values=session.inputs=Object.assign({},preserved);
  if(!values||typeof values!=="object"||Array.isArray(values))return;
  var own=function(key){return Object.prototype.hasOwnProperty.call(values,key)};
  var present=function(value){return value!==null&&value!==undefined&&!(typeof value==="string"&&!value.trim())};
  var canonicalUnit=function(value){return ({"g/g":"mg/mg","mol/mol":"mmol/mmol","mg/dl":"mg/dL","μmol/L":"µmol/L","umol/L":"µmol/L"})[value]||value};
  var fields=["PICR_inputMode","PICR_phosphorus","PICR_phosphorusUnit","PICR_creatinine","PICR_creatinineUnit","PICR_reportedValue","PICR_reportedUnit"];
  if(selected==="PO4_Cr"&&!Object.keys(values).some(function(key){return key.indexOf("PICR_")===0})&&(present(values.U_PO4)||present(values.Ucr))){
    values.PICR_inputMode="concentration";
    if(own("U_PO4"))values.PICR_phosphorus=values.U_PO4;
    if(own("Ucr"))values.PICR_creatinine=values.Ucr;
    values.PICR_phosphorusUnit="mg P/dL";values.PICR_creatinineUnit="mg/dL";
    ["U_PO4","Ucr"].forEach(function(key){if(typeof values[key]==="number")values[key]=String(values[key])});
  }
  if(own("PICR_legacyAliases")){
    var aliases=values.PICR_legacyAliases;
    if(typeof aliases==="string")try{aliases=JSON.parse(aliases)}catch{}
    if(aliases&&typeof aliases==="object"&&!Array.isArray(aliases)&&Object.keys(aliases).length&&Object.keys(aliases).every(function(key){
      return ["U_PO4","Ucr"].indexOf(key)!==-1&&["string","number"].indexOf(typeof aliases[key])!==-1&&String(aliases[key]).trim()&&
        String(aliases[key]).length<=512&&(typeof aliases[key]!=="number"||Number.isFinite(aliases[key]));
    }))delete values.PICR_legacyAliases;
  }
  var quantities=[["PICR_phosphorus","PICR_phosphorusUnit","phosphorus","mmol/L"],
    ["PICR_creatinine","PICR_creatinineUnit","creatinine","mmol/L"],
    ["PICR_reportedValue","PICR_reportedUnit","reportedValue","mg/mg"]];
  var prior=values.PICR_unitSemantics,meaning={};
  if(quantities.some(function(item){return present(values[item[0]])})){
    if(!own("PICR_inputMode"))values.PICR_inputMode="concentration";
    quantities.forEach(function(item){
      if(!present(values[item[0]]))return;
      if(typeof values[item[0]]==="number")values[item[0]]=String(values[item[0]]);
      meaning[item[2]]=canonicalUnit(own(item[1])?values[item[1]]:prior&&typeof prior==="object"&&Object.prototype.hasOwnProperty.call(prior,item[2])?prior[item[2]]:item[3]);
    });
    values.PICR_unitSemantics=meaning;
  }else{
    fields.forEach(function(key){delete values[key]});
    delete values.PICR_unitSemantics;
  }
  if(own("PICR_reportedUnitOriginal")&&["g/g","mol/mol"].indexOf(values.PICR_reportedUnitOriginal)!==-1&&
    (!present(values.PICR_reportedValue)||canonicalUnit(values.PICR_reportedUnitOriginal)===meaning.reportedValue))delete values.PICR_reportedUnitOriginal;
  var context=values.PICR_contextSemantics&&typeof values.PICR_contextSemantics==="object"&&!Array.isArray(values.PICR_contextSemantics)?Object.assign({},values.PICR_contextSemantics):{};
  ["sameSpecimen","collectionProblem","collectionHours","durationKnown"].forEach(function(key){
    var id="PICR_"+key;
    if(!own(id))return;
    var raw=values[id];delete values[id];delete context[key];
    if(!present(raw)||key==="sameSpecimen"&&raw==="assumed")return;
    var text=String(raw);
    if(key==="sameSpecimen")text=["true","yes","confirmed"].indexOf(text)!==-1?"confirmed":["false","no","different"].indexOf(text)!==-1?"different":text;
    else if(key!=="collectionHours")text=["true","yes"].indexOf(text)!==-1?"true":["false","no"].indexOf(text)!==-1?"false":text;
    context[key]=text;
  });
  if(Object.keys(context).length)values.PICR_contextSemantics=context;
  else delete values.PICR_contextSemantics;
}
function normalizeProteinCreatinineStatusInputs(session){
  if(!session||typeof session!=="object"||Array.isArray(session))return;
  var values=session.inputs,preserved=session.preservedInputs;
  var selected=session.selectedFormula||values&&values.formulaPicker||preserved&&preserved.formulaPicker;
  if((!values||typeof values!=="object"||Array.isArray(values))&&selected==="B_Cr"&&preserved&&typeof preserved==="object"&&!Array.isArray(preserved))values=session.inputs=Object.assign({},preserved);
  if(!values||typeof values!=="object"||Array.isArray(values))return;
  var own=function(key){return Object.prototype.hasOwnProperty.call(values,key)};
  var present=function(value){return value!==null&&value!==undefined&&!(typeof value==="string"&&!value.trim())};
  var canonicalUnit=function(value){return ({"g/g":"mg/mg","mg/dl":"mg/dL","μmol/L":"µmol/L","umol/L":"µmol/L"})[value]||value};
  var fields=["BCR_inputMode","BCR_protein","BCR_proteinUnit","BCR_creatinine","BCR_creatinineUnit","BCR_reportedValue","BCR_reportedUnit"];
  if(selected==="B_Cr"&&!Object.keys(values).some(function(key){return key.indexOf("BCR_")===0})&&(present(values.U_Prot)||present(values.V24)||present(values.Ucr))){
    values.BCR_inputMode="legacy";
    // A legacy ratio stores protein mass, volume and creatinine, not two
    // concentrations. Comparing defaults must not change their clinical meaning.
    ["U_Prot","V24","Ucr"].forEach(function(key){if(typeof values[key]==="number")values[key]=String(values[key])});
  }
  if(own("BCR_legacyAliases")){
    var aliases=values.BCR_legacyAliases;
    if(typeof aliases==="string")try{aliases=JSON.parse(aliases)}catch{}
    if(aliases&&typeof aliases==="object"&&!Array.isArray(aliases)&&Object.keys(aliases).length&&Object.keys(aliases).every(function(key){
      return ["U_Prot","V24","Ucr"].indexOf(key)!==-1&&["string","number"].indexOf(typeof aliases[key])!==-1&&String(aliases[key]).trim()&&
        String(aliases[key]).length<=512&&(typeof aliases[key]!=="number"||Number.isFinite(aliases[key]));
    }))delete values.BCR_legacyAliases;
  }
  var quantities=[["BCR_protein","BCR_proteinUnit","protein","mg/L"],
    ["BCR_creatinine","BCR_creatinineUnit","creatinine","mg/dL"],
    ["BCR_reportedValue","BCR_reportedUnit","reportedValue","mg/mg"]];
  var prior=values.BCR_unitSemantics,meaning={};
  if(values.BCR_inputMode==="legacy"||quantities.some(function(item){return present(values[item[0]])})){
    if(!own("BCR_inputMode"))values.BCR_inputMode="concentration";
    quantities.forEach(function(item){
      if(!present(values[item[0]]))return;
      if(typeof values[item[0]]==="number")values[item[0]]=String(values[item[0]]);
      meaning[item[2]]=canonicalUnit(own(item[1])?values[item[1]]:prior&&typeof prior==="object"&&Object.prototype.hasOwnProperty.call(prior,item[2])?prior[item[2]]:item[3]);
    });
    values.BCR_unitSemantics=meaning;
  }else{
    fields.forEach(function(key){delete values[key]});
    delete values.BCR_unitSemantics;
  }
  if(own("BCR_reportedUnitOriginal")&&["g/g"].indexOf(values.BCR_reportedUnitOriginal)!==-1&&
    (!present(values.BCR_reportedValue)||canonicalUnit(values.BCR_reportedUnitOriginal)===meaning.reportedValue))delete values.BCR_reportedUnitOriginal;
  var context=values.BCR_contextSemantics&&typeof values.BCR_contextSemantics==="object"&&!Array.isArray(values.BCR_contextSemantics)?Object.assign({},values.BCR_contextSemantics):{};
  ["sameSpecimen","collectionProblem","collectionHours","durationKnown"].forEach(function(key){
    var id="BCR_"+key;
    if(!own(id))return;
    var raw=values[id];delete values[id];delete context[key];
    if(!present(raw)||key==="sameSpecimen"&&raw==="assumed")return;
    var text=String(raw);
    if(key==="sameSpecimen")text=["true","yes","confirmed"].indexOf(text)!==-1?"confirmed":["false","no","different"].indexOf(text)!==-1?"different":text;
    else if(key!=="collectionHours")text=["true","yes"].indexOf(text)!==-1?"true":["false","no"].indexOf(text)!==-1?"false":text;
    context[key]=text;
  });
  if(Object.keys(context).length)values.BCR_contextSemantics=context;
  else delete values.BCR_contextSemantics;
}
// Ca/Cit selectors state the units actually entered on the report. Preserve
// their meaning before the generic Unit-suffix cleanup, especially because
// mass and molar citrate ratios cannot be converted without a known basis.
// Everything below operates only on detached save-comparison data.
function normalizeCalciumCitrateStatusInputs(session){
  if(!session||typeof session!=="object"||Array.isArray(session))return;
  var values=session.inputs,preserved=session.preservedInputs;
  var selected=session.selectedFormula||values&&values.formulaPicker||preserved&&preserved.formulaPicker;
  if((!values||typeof values!=="object"||Array.isArray(values))&&selected==="Ca_Cit"&&preserved&&typeof preserved==="object"&&!Array.isArray(preserved))values=session.inputs=Object.assign({},preserved);
  if(!values||typeof values!=="object"||Array.isArray(values))return;
  if(selected==="Ca_Cit"&&preserved&&typeof preserved==="object"&&!Array.isArray(preserved))values=session.inputs=Object.assign({},preserved,values);
  var own=function(key){return Object.prototype.hasOwnProperty.call(values,key)};
  var present=function(value){return value!==null&&value!==undefined&&!(typeof value==="string"&&!value.trim())};
  var canonicalUnit=function(value){return ({"g/g":"mg/mg","mol/mol":"mmol/mmol","mg/dl":"mg/dL","μmol/L":"µmol/L","umol/L":"µmol/L"})[value]||value};
  var fields=["CACIT_inputMode","CACIT_calcium","CACIT_calciumUnit","CACIT_citrate","CACIT_citrateUnit","CACIT_reportedValue","CACIT_reportedUnit"];
  var legacy=selected==="Ca_Cit"&&!Object.keys(values).some(function(key){return key.indexOf("CACIT_")===0})&&(present(values.U_Ca)||present(values.U_Cit));
  if(legacy){
    values.CACIT_inputMode="concentration";
    if(own("U_Ca"))values.CACIT_calcium=values.U_Ca;
    if(own("U_Cit"))values.CACIT_citrate=values.U_Cit;
    values.CACIT_calciumUnit="mmol/L";values.CACIT_citrateUnit="mg/dL";
    ["U_Ca","U_Cit"].forEach(function(key){if(typeof values[key]==="number")values[key]=String(values[key])});
    values.CACIT_reportingEntity="citric_acid";
  }
  var measured=legacy||["CACIT_calcium","CACIT_citrate","CACIT_reportedValue"].some(function(id){return present(values[id])});
  if(selected==="Ca_Cit"){
    var belongs=function(value){return value&&typeof value==="object"&&!Array.isArray(value)&&!["sourceFormula","sourceFormulaId","formulaId"].some(function(key){return Object.prototype.hasOwnProperty.call(value,key)&&value[key]!=="Ca_Cit"})};
    var snapshots=[session.caCitSnapshot,session.context&&session.context.caCitSnapshot,session.sourceContext&&session.sourceContext.caCitSnapshot].map(function(value){return value&&value.snapshot||value}).filter(function(value){return belongs(value)&&value.schema==="clcr-ca-cit"&&value.version===1&&value.sourceFormula==="Ca_Cit"});
    var contexts=[values].concat(snapshots.reduce(function(all,value){return all.concat(value.context,value.input)},[]),[session.context&&session.context.caCit,session.sourceContext&&session.sourceContext.caCit,session.context,session.sourceContext]).filter(belongs);
    var aliases={sameSpecimen:["concentrationSameSpecimen","sameSpecimen","sameUrineSample"],collectionProblem:["collectionProblem"],
      collectionHours:["collectionHours","durationHours","hours"],durationKnown:["durationKnown"],sampleType:["sampleType","specimen"],sampleSource:["sampleSource"],durationSource:["durationSource"]};
    Object.keys(aliases).forEach(function(key){
      var id="CACIT_"+key;
      if(own(id))return;
      contexts.some(function(context){
        return [context,context.knownFacts,context.clock].filter(belongs).some(function(source){
          var sourceKey=Object.prototype.hasOwnProperty.call(source,id)?id:aliases[key].find(function(alias){return Object.prototype.hasOwnProperty.call(source,alias)});
          if(sourceKey===undefined)return false;
          var raw=source[sourceKey];values[id]=raw==null?"":["string","number","boolean"].indexOf(typeof raw)!==-1?String(raw):"";return true;
        });
      });
    });
    var negativeProtocol=["collectionStartVoidDiscarded","collectionFinalVoidIncluded","collectionNoMissedVoids","collectionNoSpillage","collectionNoExtraVoids","collectionStorageFollowed"];
    if(!own("CACIT_collectionProblem")&&(values.Cl24CollectionProblem===true||values.Cl24CollectionProblem==="true"||negativeProtocol.some(function(id){return values["ui_"+id+"_answer"]==="no"})||contexts.some(function(context){var facts=context.knownFacts;return facts&&typeof facts==="object"&&(facts.Cl24CollectionProblem===true||facts.knownIncomplete===true||negativeProtocol.some(function(id){return facts[id]===false}))})))values.CACIT_collectionProblem="true";
    if(!own("CACIT_collectionHours")&&present(values.Cl24DurationHours)&&(!present(values.Cl24DurationSource)||["hours","captured","legacy-dates","invalid"].indexOf(values.Cl24DurationSource)!==-1)){
      values.CACIT_collectionHours=String(values.Cl24DurationHours);values.CACIT_durationKnown="true";values.CACIT_durationSource="captured";
    }
    if(measured){
      if(!own("CACIT_sampleType"))values.CACIT_sampleType="unknown";
      if(!own("CACIT_sampleSource"))values.CACIT_sampleSource="historical-missing";
      if(!own("CACIT_collectionHours")&&!own("CACIT_durationKnown"))values.CACIT_durationKnown="false";
      if(!own("CACIT_collectionHours")&&!own("CACIT_durationSource"))values.CACIT_durationSource="historical-missing";
    }
    var contextKeys=["knownFacts","confounders","concentrationSameSpecimen","sameSpecimen","sameUrineSample","reportedSameSpecimen","CACIT_reportedSameSpecimen","collectionProblem",
      "collectionHours","durationHours","hours","durationKnown","sampleType","specimen","sampleSource","durationSource"];
    var inputFacts=Object.fromEntries(contextKeys.filter(own).map(function(key){return [key,values[key]]}));
    var materialContexts=[Object.keys(inputFacts).length?inputFacts:null].concat(snapshots.map(function(value){return value.context}),[session.context,session.sourceContext]).filter(belongs);
    var carrier=values.CACIT_sourceContext,priorCarrier=carrier;
    if(typeof carrier==="string")try{carrier=carrier.trim()?JSON.parse(carrier):null}catch{}
    var sorted=function(value){if(Array.isArray(value))return value.map(sorted);if(value&&typeof value==="object")return Object.fromEntries(Object.keys(value).sort().map(function(key){return [key,sorted(value[key])]}));return value};
    if(materialContexts.length){
      var reusable=carrier&&typeof carrier==="object"&&!Array.isArray(carrier)&&carrier.version===1&&Array.isArray(carrier.contexts),seen={};
      var combined=(reusable?carrier.contexts:[]).concat(materialContexts).filter(function(value){var key=JSON.stringify(sorted(value));if(Object.prototype.hasOwnProperty.call(seen,key))return false;seen[key]=true;return true});
      carrier=Object.assign({},reusable?carrier:{version:1},{contexts:combined},!reusable&&present(priorCarrier)?{unreadableSourceContext:typeof priorCarrier==="string"?priorCarrier:JSON.stringify(priorCarrier)}:{});
    }
    if(carrier&&typeof carrier==="object"&&!Array.isArray(carrier)&&carrier.version===1&&Array.isArray(carrier.contexts)){
      var fallback=carrier.patientFallback&&typeof carrier.patientFallback==="object"&&!Array.isArray(carrier.patientFallback)?Object.assign({},carrier.patientFallback):{},sourceAge=snapshots[0]&&snapshots[0].context;
      [["age",["age","ageMonths","ageDays"]],["sex",["sex"]]].forEach(function(item){
        var group=item[0],ids=item[1],text=function(value){return value==null?"":["string","number","boolean"].indexOf(typeof value)!==-1?String(value):""};
        if(fallback[group]&&typeof fallback[group]==="object"&&ids.some(function(id){return text(values[id])!==text(fallback[group].fields&&fallback[group].fields[id])}))delete fallback[group];
        if(fallback[group]||ids.some(own)||!sourceAge||typeof sourceAge!=="object")return;
        if(group==="age"&&typeof sourceAge.ageYears==="number"&&Number.isFinite(sourceAge.ageYears))fallback.age={fields:Object.fromEntries(ids.map(function(id){return [id,""]})),context:Object.fromEntries(["ageYears","ageYearsRaw","ageExact","agePrecision","ageInterval"].filter(function(key){return Object.prototype.hasOwnProperty.call(sourceAge,key)}).map(function(key){return [key,sourceAge[key]]}))};
        else if(group==="sex"&&["M","F","male","female"].indexOf(sourceAge.sex)!==-1)fallback.sex={fields:{sex:""},context:{sex:sourceAge.sex}};
      });
      if(Object.keys(fallback).length)carrier.patientFallback=fallback;else delete carrier.patientFallback;
    }
    if(present(carrier)){
      // Keep false/null facts inside canonical JSON, before the generic empty
      // value cleanup, so reading an imported context never erases its meaning.
      values.CACIT_sourceContext=carrier&&typeof carrier==="object"?JSON.stringify(sorted(carrier)):typeof priorCarrier==="string"?priorCarrier:JSON.stringify(carrier);
    }
    if(belongs(session.context))delete session.context;
    if(belongs(session.sourceContext))delete session.sourceContext;
    var ownSnapshot=session.caCitSnapshot&&session.caCitSnapshot.snapshot||session.caCitSnapshot;
    if(snapshots.indexOf(ownSnapshot)!==-1)delete session.caCitSnapshot;
  }
  if(own("CACIT_sourceContext")&&present(values.CACIT_sourceContext)){
    var metadata=values.CACIT_sourceContext;
    if(typeof metadata==="string")try{metadata=JSON.parse(metadata)}catch{}
    if(metadata&&typeof metadata==="object"){
      var sortMetadata=function(value){if(Array.isArray(value))return value.map(sortMetadata);if(value&&typeof value==="object")return Object.fromEntries(Object.keys(value).sort().map(function(key){return [key,sortMetadata(value[key])]}));return value};
      values.CACIT_sourceContext=JSON.stringify(sortMetadata(metadata));
    }
  }
  if(own("CACIT_legacyAliases")){
    var legacyAliases=values.CACIT_legacyAliases;
    if(typeof legacyAliases==="string")try{legacyAliases=JSON.parse(legacyAliases)}catch{}
    if(legacyAliases&&typeof legacyAliases==="object"&&!Array.isArray(legacyAliases)&&Object.keys(legacyAliases).length&&Object.keys(legacyAliases).every(function(key){
      return ["U_Ca","U_Cit"].indexOf(key)!==-1&&["string","number"].indexOf(typeof legacyAliases[key])!==-1&&String(legacyAliases[key]).trim()&&
        String(legacyAliases[key]).length<=512&&(typeof legacyAliases[key]!=="number"||Number.isFinite(legacyAliases[key]));
    })){
      delete values.CACIT_legacyAliases;
      ["U_Ca","U_Cit"].forEach(function(key){if(typeof values[key]==="number")values[key]=String(values[key])});
    }
  }
  var quantities=[["CACIT_calcium","CACIT_calciumUnit","calcium","mmol/L"],
    ["CACIT_citrate","CACIT_citrateUnit","citrate","mg/dL"],
    ["CACIT_reportedValue","CACIT_reportedUnit","reportedValue","mg/mg"]];
  var prior=values.CACIT_unitSemantics,meaning={};
  if(quantities.some(function(item){return present(values[item[0]])})){
    if(!own("CACIT_inputMode"))values.CACIT_inputMode="concentration";
    if(values.CACIT_inputMode==="direct")values.CACIT_inputMode="reported";
    quantities.forEach(function(item){
      if(!present(values[item[0]]))return;
      if(typeof values[item[0]]==="number")values[item[0]]=String(values[item[0]]);
      meaning[item[2]]=canonicalUnit(own(item[1])?values[item[1]]:prior&&typeof prior==="object"&&Object.prototype.hasOwnProperty.call(prior,item[2])?prior[item[2]]:item[3]);
    });
    values.CACIT_unitSemantics=meaning;
  }else{
    fields.forEach(function(key){delete values[key]});
    delete values.CACIT_unitSemantics;
  }
  if(own("CACIT_reportedUnitOriginal")&&["g/g","mol/mol"].indexOf(values.CACIT_reportedUnitOriginal)!==-1&&
    (!present(values.CACIT_reportedValue)||canonicalUnit(values.CACIT_reportedUnitOriginal)===meaning.reportedValue))delete values.CACIT_reportedUnitOriginal;
  // The new form describes its expected DZM material as an assumption. That
  // untouched assumption is presentation, whereas confirmed or historical
  // material provenance remains part of the patient's comparison.
  if(values.CACIT_sampleType==="timed"&&values.CACIT_sampleSource==="assumed-current"){
    delete values.CACIT_sampleType;delete values.CACIT_sampleSource;
  }
  var context=values.CACIT_contextSemantics&&typeof values.CACIT_contextSemantics==="object"&&!Array.isArray(values.CACIT_contextSemantics)?Object.assign({},values.CACIT_contextSemantics):{};
  ["sameSpecimen","collectionProblem","collectionHours","durationKnown","sampleType","sampleSource","durationSource"].forEach(function(key){
    var id="CACIT_"+key;
    if(!own(id))return;
    var raw=values[id];delete values[id];delete context[key];
    if(!present(raw)||key==="sameSpecimen"&&raw==="assumed")return;
    var text=String(raw);
    if(key==="sameSpecimen")text=["true","yes","confirmed"].indexOf(text)!==-1?"confirmed":["false","no","different"].indexOf(text)!==-1?"different":text;
    else if(key==="collectionProblem"||key==="durationKnown")text=["true","yes"].indexOf(text)!==-1?"true":["false","no"].indexOf(text)!==-1?"false":text;
    context[key]=text;
  });
  if(Object.keys(context).length)values.CACIT_contextSemantics=context;
  else delete values.CACIT_contextSemantics;
}
function normalizeClcrStatusInputs(session){
  var inputs=session&&session.inputs;
  if(!inputs||typeof inputs!=="object"||Array.isArray(inputs))return;
  var defaults={
    ACR_entry_mode:"concentration",PCR_entry_mode:"concentration",
    CaCr_entry_mode:"concentration",OxCr_entry_mode:"concentration",CitCr_entry_mode:"concentration",
    CitCr_reported_basis:"unknown",citrateSpotReportingEntity:"unknown",creatinineState:"unknown",
    CA_inputMode:"concentration",CA_clinicalMode:"general",MG_inputMode:"concentration",UA_inputMode:"concentration",PO4_inputMode:"concentration",Prot_inputMode:"concentration",Na_inputMode:"concentration",K_inputMode:"concentration",
    OXDZM_inputMode:"concentration",OXDZM_reportingEntity:"unknown",
    CITDZM_inputMode:"concentration",CITDZM_reportingEntity:"unknown"
  };
  Object.keys(defaults).forEach(function(key){if(inputs[key]===defaults[key])delete inputs[key]});
  // Dedicated DZM forms use hidden text controls. Normalize only their exact
  // false defaults; a true historical-unknown marker remains clinical input.
  ["PO4_durationNeedsConfirmation","Prot_durationNeedsConfirmation","Na_durationNeedsConfirmation","K_durationNeedsConfirmation","OXDZM_durationNeedsConfirmation","CITDZM_durationNeedsConfirmation"].forEach(function(key){if(inputs[key]==="false")delete inputs[key]});
  [["Cl24DurationHours","Cl24DurationSource"],["CA_collectionHours","CA_collectionSource"],
    ["MG_collectionHours","MG_collectionSource"],["UA_collectionHours","UA_collectionSource"],
    ["PO4_collectionHours","PO4_collectionSource"],["Prot_collectionHours","Prot_collectionSource"],["Na_collectionHours","Na_collectionSource"],["K_collectionHours","K_collectionSource"],["OXDZM_collectionHours","OXDZM_collectionSource"],["CITDZM_collectionHours","CITDZM_collectionSource"]].forEach(function(pair){
    var value=inputs[pair[0]],source=inputs[pair[1]],present=value!==null&&value!==undefined&&String(value).trim()!=="";
    // Old fingerprints omitted blank reset hours but retained their assumed
    // source. Match ClcrCollectionDuration's absent/default semantics without
    // changing the session or accepting an unresolved historical collection.
    var flag=inputs[pair[0]==="Cl24DurationHours"?"durationNeedsConfirmation":pair[0].split("_")[0]+"_durationNeedsConfirmation"];
    var needsConfirmation=flag===true||flag==="true"||inputs.durationNeedsConfirmation===true||inputs.durationNeedsConfirmation==="true";
    if(source==="assumed-24h"&&(value==null||typeof value==="string"&&value.trim()==="")&&!needsConfirmation)delete inputs[pair[1]];
    // This is the existing durationFields migration: an entered historical
    // duration without a provenance field is manual, including an explicit 24.
    if(present&&(source===undefined||source===null||source===""))inputs[pair[1]]="hours";
    if(present&&source==="assumed-24h"&&/^[+]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?$/i.test(String(value).trim())&&Number(String(value).trim().replace(",","."))===24){
      delete inputs[pair[0]];delete inputs[pair[1]];
    }
  });
}
function Q(){if(typeof n.collectUserData!="function")return null;try{var e=n.collectUserData({source:"save-status-indicator"});return e?(delete e.timestampISO,JSON.stringify(e)):null}catch{return null}}function P(e){if(!e||typeof e!="object")return e;var t;try{t=JSON.parse(JSON.stringify(e))}catch{return e}return delete t.timestampISO,delete t.timestamp,delete t.version,delete t.savedAtISO,t}function X(e){if(!e||typeof e!="object")return e;normalizeSodiumStatusQuantities(e);normalizePotassiumStatusQuantities(e);normalizeUrateCreatinineStatusInputs(e);normalizeCacrDzmStatusInputs(e);normalizeMagnesiumCalciumStatusInputs(e);normalizePhosphorusCreatinineStatusInputs(e);normalizeProteinCreatinineStatusInputs(e);normalizeCalciumCitrateStatusInputs(e);try{["savedAtISO","source","version","legacyVersion","currentVersion","selectedFormula","preserveAcrossVersions","preservedInputs","summary"].forEach(function(t){try{delete e[t]}catch{}}),e.inputs&&typeof e.inputs=="object"&&(["fullName","age","ageMonths","sex","weight","height","formulaSearch","formulaPicker","samePatientMode","currentVersion","version","selectedFormula"].forEach(function(t){try{delete e.inputs[t]}catch{}}),Object.keys(e.inputs).forEach(function(t){if(/unit$/i.test(t))try{delete e.inputs[t]}catch{}}))}catch{}normalizeClcrStatusInputs(e);return e}function b(e){if(!e||typeof e!="object")return e;try{delete e.doctor}catch{}try{delete e.zscore}catch{}try{delete e.bpDataToggle}catch{}try{delete e.bisphos}catch{}return e}function ee(e){try{["advanced","growthBasic"].forEach(function(t){e&&e[t]&&e[t].data&&typeof e[t].data=="object"&&(e[t].data={measurements:e[t].data.measurements})})}catch{}return e}function M(e){if(e!=null){if(Array.isArray(e)){for(var t=[],r=0;r<e.length;r++){var a=M(e[r]);a!==void 0&&t.push(a)}return t.length?t:void 0}if(typeof e=="object"){for(var u=Object.create(null),m=Object.keys(e).sort(),y=0;y<m.length;y++){var T=M(e[m[y]]);T!==void 0&&(u[m[y]]=T)}return Object.keys(u).length?u:void 0}return typeof e=="string"?e.trim()===""?void 0:e:typeof e=="boolean"&&e===!1?void 0:e}}function te(e){try{normalizeStatusInputs(e);normalizeStatusUiDefaults(e);normalizeStatusVaultMetadata(e);normalizeStatusEmptyBoneAge(e);normalizeStatusAutomaticDiet(e);normalizeStatusMeasurementUi(e);e&&e.clcr&&X(e.clcr);e&&e.core&&ee(e.core);var t=M(e);return t===void 0?{}:t}catch{return e}}function ne(){var e=n.VildaPersistence;try{if(e&&typeof e.readClcrSession=="function")return e.readClcrSession()}catch{}return null}function re(){if(typeof n.collectUserData!="function"||typeof n.hasMeaningfulMainSessionData!="function")return!1;try{var e=n.collectUserData({source:"save-status-fullform-check"});return!!(e&&n.hasMeaningfulMainSessionData(e))}catch{return!1}}function C(){if(statusReadOnly)return;if(typeof n.saveMainSessionNow=="function"&&re())try{n.saveMainSessionNow({force:!0})}catch{}}function ie(){var e=n.VildaPersistence;try{if(e&&typeof e.readMainSession=="function"){var t=e.readMainSession();if(t&&typeof t=="object")return P(t)}}catch{}if(typeof n.collectUserData=="function")try{var r=n.collectUserData({source:"save-status-canonical-fallback"});return typeof n.hasMeaningfulMainSessionData=="function"?r&&n.hasMeaningfulMainSessionData(r)?P(r):null:r?P(r):null}catch{}return null}function E(){var e=ie();if(e==null)return null;if(e&&typeof e=="object"&&e.clcr!==void 0)try{delete e.clcr}catch{}b(e);var t=ne(),r=t?X(P(t)):null,a={core:e,clcr:r};a=te(a);try{return JSON.stringify(a)}catch{return null}}var O="vilda-save-ref-v1",L=null;function k(){try{var e=n.sessionStorage;if(!e)return L;var t=e.getItem(O),r=t?JSON.parse(t):null;if(r&&typeof r.fp==="string")try{r.fp=JSON.stringify(te(JSON.parse(r.fp)))}catch{}return r}catch{return L}}function U(e){L=e||null;if(statusReadOnly)return;try{var t=n.sessionStorage;if(!t)return;e?t.setItem(O,JSON.stringify(e)):t.removeItem(O)}catch{}}function I(){U(f?{fp:f,dirty:!!p,savedAtISO:l||null,snapshotCount:d||null,patientName:v||null}:null)}function N(){f=null,p=!1,U(null)}function ae(e){if(!e||typeof n.hasMeaningfulMainSessionData!="function"||!n.hasMeaningfulMainSessionData(e))return!1;var t;try{t=JSON.parse(JSON.stringify(e))}catch{return!0}return delete t.doctor,delete t.zscore,delete t.bpDataToggle,delete t.bisphos,delete t.clcr,delete t.steroid,n.hasMeaningfulMainSessionData(t)}function statusSharedSessionHasPatient(value){
  if(!value||typeof value!=="object")return false;
  var user=value.user||{},name=value.name&&String(value.name).trim();
  return !!(name||user.weight||user.height||user.age!=null&&user.age!=="");
}
function _(){var e=n.VildaPersistence;try{if(e&&typeof e.readMainSession==="function"){var t=e.readMainSession();if(t&&(typeof n.hasMeaningfulMainSessionData==="function"?ae(t):statusSharedSessionHasPatient(t)))return!1}}catch{}if(typeof n.collectUserData!="function")return!0;try{var r=n.collectUserData({source:"save-status-indicator-empty-check"});if(!r)return!0;var a=r.name&&String(r.name).trim(),u=r.user||{},m=!!a,y=!!(u.weight||u.height||u.age!=null&&u.age!=="");return!(m||y)}catch{return!0}}function R(e){if(!e)return"";try{var t=new Date(e).getTime();if(!isFinite(t))return"";var r=Date.now()-t,a=Math.round(r/6e4);if(a<1)return"przed chwil\u0105";if(a<60)return a+" min temu";var u=Math.round(a/60);if(u<24)return u+" godz. temu";var m=Math.round(u/24);return m<7?m+(m===1?" dzie\u0144 temu":" dni temu"):new Date(e).toLocaleDateString("pl-PL")}catch{return""}}function H(e){if(e===i.SAVED){var t=["\u2713 Dane pacjenta zapisane"];return l&&t.push(R(l)),d&&t.push("Snapshot #"+d),t.join(" \xB7 ")}if(e===i.DIRTY){var r=["\u25CF Niezapisane zmiany"];if(S){var a=R(new Date(S).toISOString()).replace(" temu","");r.push("od "+a)}return r.push('Kliknij \u201EZapisz dane" w menu po lewej'),r.join(" \xB7 ")}return e===i.SAVING?"\u27F3 Zapisywanie snapshotu\u2026":e===i.ERROR?"\u26A0 B\u0142\u0105d ostatniego zapisu"+(h?": "+h:"")+" \u2014 kliknij Zapisz, by ponowi\u0107":e===i.NEW_PATIENT?'\uFF0B Nowy pacjent \u2014 kliknij \u201EZapisz dane", aby utworzy\u0107 kart\u0119 pacjenta':""}function c(e){if(e!==s){var t=s;s=e,e===i.DIRTY&&(S=Date.now()),e===i.SAVED&&(S=null),e===i.HIDDEN&&(S=null);try{n.console&&typeof n.console.debug=="function"&&n.console.debug("[vilda-save-status] "+t+" \u2192 "+e)}catch{}}g()}function B(){
  if(statusReadOnly){reconcileFromSharedReference();return}
  if(s===i.SAVING||!isReadyForSharedReference())return;
  // Lokalny stan hidden nie świadczy o braku zapisu: późna ramka może już
  // widzieć pacjenta we wspólnej sesji. Najpierw przejmuje jego referencję.
  adoptSharedStatusReference();
  if(renderCurrentStatusDecision(false))return;
  if(f===null){c(_()?i.HIDDEN:i.NEW_PATIENT);return}
  var current=E();
  if(current!==null){
    var dirty=current!==f;
    if(p!==dirty){p=dirty;I()}
    c(dirty?i.DIRTY:i.SAVED);
  }
}
function ue(){C(),B()}function J(scope){
  if(scope&&(!sameStatusScope(scope,captureStatusScope())||statusEditBlocked()))return;
  try{if(n.__vildaPersistRestoring===!0)return}catch{}
  if(statusPauseRemaining()>0){deferStatusEdit(scope);return}
  if(canDeferStatusEdit(scope)){compareStatusAfterPersist(scope);return}
  B();
}
function w(e){
  if(e&&e.isTrusted===!1)return;
  try{if(n.__vildaPersistRestoring===!0)return}catch{}
  var scope=e&&e.isTrusted===!0?captureStatusScope():null;
  if(o){clearTimeout(o);o=null}
  if(statusPauseRemaining()>0){deferStatusEdit(scope);return}
  o=setTimeout(function(){o=null;J(scope)},400);
}function j(){
  if(n.VildaGuestMode===!0){c(i.HIDDEN);return}
  if(typeof n.collectUserData!=="function"&&isReadyForSharedReference()){reconcileFromSharedReference();return}
  adoptSharedStatusReference();
  if(renderCurrentStatusDecision(false))return;
  if(_()){c(i.HIDDEN);return}
  if(f===null){c(i.NEW_PATIENT);return}
  c(p?i.DIRTY:i.SAVED);
}
function V(){decisionOwnerBoundary();invalidateStatusPublication(),D=!0,j()}function Y(){decisionOwnerBoundary();invalidateStatusPublication(),confirmApplySequence(),D=!1,N(),l=null,d=null,v=null,S=null,h=null,c(i.HIDDEN)}function W(e){
  // A vault notification may come from another form or precede this save's
  // receipt. Only the matching committed DIX witness can establish a baseline.
  var savedPatient=e&&typeof e.patientId==="string"&&e.patientId?e.patientId:null;
  if(savedPatient&&savedPatient!==statusPatientId())return;
  scheduleSharedStatusReconcile();
}
function publishCommittedStatus(detail,witness){
  var fingerprint;
  try{fingerprint=committedStatusFingerprint(witness.payload)}catch{return}
  if(fingerprint===null)return;
  invalidateStatusPublication();confirmApplySequence(detail,true);
  committedStatusSelector={patientId:witness.patientId,snapshotId:witness.snapshotId,applySequence:witness.applySequence};
  l=detail.savedAtISO||null;d=detail.snapshotCount||null;v=detail.name||null;h=null;
  if(o){clearTimeout(o);o=null}
  f=fingerprint;p=false;I();
  var scope=captureStatusScope(),started=Date.now();
  publishStatusLater(function finish(){
    if(scope.generation!==statusGeneration||scope.applySequence!==currentApplySequence()||witness.patientId!==statusPatientId()||f!==fingerprint)return;
    var decision=readCurrentDecision(true);
    if(!decision.ready){
      if(Date.now()-started<8000){n.setTimeout(finish,100);return}
      h="Dane zapisano, ale bieżący formularz nie jest gotowy do porównania.";c(i.ERROR);return;
    }
    p=decision.state===i.DIRTY;I();markStatusReferenceReady();c(decision.state);
  },witness.patientId,"save");
}
function G(e){
  if(statusReadOnly){scheduleSharedStatusReconcile();return}
  var sequence=e&&e.applySequence,latest=currentApplySequence();
  if(e&&e.source==="save"){
    // The event carries an identifier, never authority to acknowledge the DOM.
    if(!Number.isSafeInteger(sequence)||sequence<0||sequence!==latest||e.referenceVerified===false)return;
    var api=n.VildaDataImportExport,witness=null;
    try{witness=api&&typeof api.getCommittedSaveWitness==="function"&&api.getCommittedSaveWitness({patientId:e.patientId,snapshotId:e.snapshotId,applySequence:sequence})}catch{}
    if(!witness||witness.patientId!==e.patientId||witness.snapshotId!==e.snapshotId||witness.applySequence!==sequence)return;
    publishCommittedStatus(e,witness);return;
  }
  if(Number.isSafeInteger(sequence)&&sequence!==latest)return;
  decisionOwnerBoundary();invalidateStatusPublication();confirmApplySequence(e,false);
  committedStatusSelector=null;
  l=e&&e.savedAtISO||null;d=e&&e.snapshotCount||null;v=e&&e.name||null;h=null;
  o&&(clearTimeout(o),o=null);
  var target=e&&typeof e.patientId==="string"?e.patientId:statusPatientId();
  publishStatusLater(function(){C();f=E();p=false;I();markStatusReferenceReady();c(i.SAVED);renderCurrentStatusDecision(false)},target,"load");
}function x(e){
  if(statusReadOnly){scheduleSharedStatusReconcile();return}
  if(obsoleteImport(e))return;
  decisionOwnerBoundary();invalidateStatusPublication(),l=null,d=null,v=e&&e.name||null,h=null,N();
  o&&(clearTimeout(o),o=null);
  publishStatusLater(function(){if(_()){c(i.HIDDEN);return}c(i.NEW_PATIENT)},statusPatientId());
}function Z(){decisionOwnerBoundary();if(statusReadOnly){scheduleSharedStatusReconcile();return}invalidateStatusPublication(),confirmApplySequence(),h=null,o&&(clearTimeout(o),o=null),publishStatusLater(function(){C(),f=E(),p=!1,I(),markStatusReferenceReady(),c(i.SAVED)},statusPatientId())}function K(){decisionOwnerBoundary();invalidateStatusPublication(),confirmApplySequence(),N(),l=null,d=null,v=null,S=null,h=null,o&&(clearTimeout(o),o=null),c(i.HIDDEN),setTimeout(function(){s!==i.HIDDEN&&_()&&c(i.HIDDEN)},300)}function cancelUnconfirmedSaveStatus(){
  if(s!==i.SAVING)return;
  var decision=readCurrentDecision(true);
  if(!decision.ready)return;
  p=decision.state===i.DIRTY;
  if(f!==null)I();
  markStatusReferenceReady();c(decision.state);
}
function F(){
  if(statusReadOnly)return;
  try{
    var api=n.VildaDataImportExport;
    if(api&&typeof api.getSaveReadiness==="function"&&!api.getSaveReadiness().ready)return;
    if(api&&typeof api.isSaveUserDataPending==="function"){
      if(api.isSaveUserDataPending()&&s!==i.SAVING){invalidateStatusPublication();c(i.SAVING)}
      return;
    }
  }catch{return}
  (s===i.DIRTY||s===i.NEW_PATIENT||s===i.ERROR)&&(invalidateStatusPublication(),c(i.SAVING));
}function g(){try{n.__vildaSaveStatusState={state:s,lastSavedAtISO:l,lastSnapshotCount:d,lastPatientName:v,dirtyStartedAt:S,lastError:h,relativeTimeStr:l?R(l):null}}catch{}if(!(typeof n.document>"u")){var e=n.document.getElementById("vildaPatientChip");if(e){for(var t=(e.className||"").split(/\s+/),r=[],a=0;a<t.length;a++){var u=t[a];u&&u.indexOf("vilda-save-state--")!==0&&r.push(u)}s&&r.push("vilda-save-state--"+s);var m=r.join(" ");e.className!==m&&(e.className=m);var y=H(s);y?e.getAttribute("title")!==y&&e.setAttribute("title",y):e.hasAttribute("title")&&e.removeAttribute("title")}}}function $(){var e=n.VildaVault;e&&(typeof e.onUnlock=="function"&&e.onUnlock(function(){V()}),typeof e.onLock=="function"&&e.onLock(function(){Y()}),typeof e.onPatientSaved=="function"&&e.onPatientSaved(function(t){W(t)}))}function se(){if(!(typeof n.document>"u")){n.document.addEventListener("input",w,!0),n.document.addEventListener("change",w,!0),["saveDataBtnSidebar"].forEach(function(r){var a=n.document.getElementById(r);a&&a.addEventListener("click",F)}),n.document.addEventListener("vilda:patient-loaded",function(r){try{G(r&&r.detail||{})}catch{}}),/* P-PRZEJECIE-MODULY (2026-10-06): panel powloki przejmuje pacjenta wczytanego w innej ramce (vildaPersistRestoreAll, P-POWLOKA-ID) bez vilda:patient-loaded; wskaznik zostawal przy nazwie, numerze zapisu i odcisku formularza poprzedniego pacjenta. Po zmianie pacjenta sesji karty wskaznik zapomina wlasny punkt odniesienia i bierze wspolny (vilda-save-ref-v1), zapisany przez ramke, ktora pacjenta wczytala - jak przy starcie strony. */n.document.addEventListener("vilda:persist-restored",function(){
  // Także zapis tego samego pacjenta w innej ramce zmienia bazę/metadane.
  // Samo odtworzenie nigdy nie usuwa wspólnej referencji.
  try{scheduleSharedStatusReconcile()}catch{}
}),n.document.addEventListener("vilda:main-session-restored",function(){
  try{scheduleSharedStatusReconcile()}catch{}
}),n.document.addEventListener("vilda:dob-restored",function(){
  // DOB announces only after its final restore counter reaches zero. Resume
  // the readonly comparison now; a prior unready boot render kept Hidden.
  try{reconcileFromSharedReference()}catch{}
}),n.document.addEventListener("vilda:auth-boot-settled",function(){
  // AuthUI sets its final ready flag before this event. Main/DOB restoration
  // can finish earlier, while an unlocked editable form still remains Hidden.
  try{reconcileFromSharedReference()}catch{}
}),n.document.addEventListener("vilda:session-changed",function(){
  if(typeof n.collectUserData!=="function")try{scheduleSharedStatusReconcile()}catch{}
}),typeof n.addEventListener==="function"&&n.addEventListener("storage",sharedStatusStorageChanged),n.document.addEventListener("vilda:json-imported",function(r){try{x(r&&r.detail||{})}catch{}}),n.document.addEventListener("vilda:state-restored",function(r){try{Z(r&&r.detail||{})}catch{}}),n.document.addEventListener("vilda:load-choice-applied",function(r){try{statusLoadChoiceApplied(r&&r.detail)}catch{}}),/* P-POKWITANIE-WIZYTA (2026-10-15): przyciski G/Th/P nie generuja input/change, wiec chip zostawal „zapisane" po zmianie stadium, a straznik niezapisanych zmian (czyta ten stan) nie pytal o zapis. Swiadoma edycja oceny przelicza odcisk ta sama droga, co pole formularza. */n.document.addEventListener("vilda:puberty-assessment-changed",function(r){try{r&&r.detail&&r.detail.reason==="edit"&&w({isTrusted:!0})}catch{}}),typeof n.addEventListener=="function"&&n.addEventListener("vilda:user-state-cleared",function(){try{K()}catch{}});var e=0,t=setInterval(function(){var r=!1;["saveDataBtnSidebar"].forEach(function(a){var u=n.document.getElementById(a);u&&!u.__vildaSSIBound&&(u.addEventListener("click",F),u.__vildaSSIBound=!0,r=!0)}),e++,(r||e>50)&&clearInterval(t)},100)}}function ce(){z||(z=setInterval(function(){(s===i.SAVED||s===i.DIRTY)&&g()},3e4))}function q(){if(typeof n.document>"u"){$();return}if(n.document.readyState==="loading"){n.document.addEventListener("DOMContentLoaded",q,{once:!0});return}$(),se(),ce();var e=n.VildaVault;e&&typeof e.isUnlocked=="function"&&e.isUnlocked()&&V(),typeof n.addEventListener=="function"&&n.addEventListener("load",function(){try{var t=n.VildaVault;t&&typeof t.isUnlocked=="function"&&t.isUnlocked()&&!D?V():g()}catch{}},{once:!0})}n.VildaSaveStatusIndicator={STATES:i,getCurrentDecision:getCurrentDecision,isCurrentDecision:isCurrentDecision,isCurrentDecisionOwner:isCurrentDecisionOwner,isCurrentDecisionAfterSave:isCurrentDecisionAfterSave,reconcileFromSharedReference:reconcileFromSharedReference,isReadyForSharedReference:isReadyForSharedReference,notifySaveStarted:F,notifySaveCancelled:cancelUnconfirmedSaveStatus,notifySaveFailed:function(e){h=e?String(e):null;c(i.ERROR)},getState:function(){return s},getReferenceFingerprint:function(){return f},getLastSavedAtISO:function(){return l},getLastSnapshotCount:function(){return d},getLastPatientName:function(){return v},notifyExternalChange:function(t){try{if(n.__vildaPersistRestoring===!0)return}catch{}o&&clearTimeout(o),o=setTimeout(ue,400)},_onFormChange:J,_debouncedOnFormChange:w,_onUnlock:V,_onLock:Y,_onPatientSaved:W,_onPatientLoaded:G,_onJsonImported:x,_onStateRestored:Z,_onUserStateCleared:K,_onSaveClicked:F,_computeFormFingerprint:Q,_computeCanonicalFingerprint:E,_reconcileState:j,_readPersistedRef:k,_writePersistedRef:U,_clearPersistedRef:N,_setReferenceFingerprint:function(e){f=e},_forceTransition:function(e){c(e)},_relativeTime:R,_buildTitleAttr:H,_setLastSavedAtISO:function(e){l=e},_setLastSnapshotCount:function(e){d=e},_setLastPatientName:function(e){v=e},_setDirtyStartedAt:function(e){S=e},_setLastError:function(e){h=e}},typeof n<"u"&&(n.__vildaSaveStatusDebug=function(){var e=n.VildaVault,t=n.document&&n.document.getElementById("vildaPatientChip"),r={state:s,vaultUnlocked:!!(e&&typeof e.isUnlocked=="function"&&e.isUnlocked()),myVaultUnlockedFlag:D,referenceFingerprint:f?"["+f.length+" znak\xF3w]":null,lastSavedAtISO:l,lastSnapshotCount:d,lastPatientName:v,chipExists:!!t,chipClasses:t?t.className:null,chipTitle:t?t.getAttribute("title"):null,collectUserDataExists:typeof n.collectUserData,formMostlyEmpty:null};try{if(typeof n.collectUserData=="function"){var a=n.collectUserData({source:"debug"});r.formData=a?{name:a.name,user:a.user}:null,r.formMostlyEmpty=_()}}catch(u){r.formDataError=String(u)}return console.table(r),r}),q()})(typeof window<"u"?window:globalThis);
