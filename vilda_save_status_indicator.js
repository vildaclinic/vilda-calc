(function(n){"use strict";var i={HIDDEN:"hidden",NEW_PATIENT:"new_patient",SAVED:"saved",DIRTY:"dirty",SAVING:"saving",ERROR:"error"},oe=["vilda-save-state--hidden","vilda-save-state--new_patient","vilda-save-state--saved","vilda-save-state--dirty","vilda-save-state--saving","vilda-save-state--error"],s=i.HIDDEN,f=null,p=!1,l=null,d=null,v=null,S=null,h=null,z=null,o=null,D=!1;
// P-IMPORT-STATUS: a queued notification belongs to one applyLoadedData operation.
// Confirmed loads and clears invalidate it regardless of renderer speed.
var confirmedApplySequence=0,statusGeneration=0,statusPublicationScope=null,statusReadOnly=n.__vildaSaveStatusReadOnly===!0;
// P-KREATOR-ZAPIS-PAUZA: tylko edycja po opublikowaniu bazy może czekać
// na koniec pauzy. Kolejka nie ustanawia nowej bazy i nie przeżywa operacji.
var readyStatusScope=null,pausedStatusEdit=null,pausedStatusTimer=null,sharedStatusTimer=null;
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
function reconcileFromSharedReference(){
  if(!isReadyForSharedReference()||s===i.SAVING||s===i.ERROR)return s;
  adoptSharedStatusReference();
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
    else if(id!==publication.observedPatientId)invalidateStatusPublication();
  }
  if(readyStatusScope&&readyStatusScope.patientId!==id)invalidateStatusPublication();
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
function publishStatusLater(callback,expectedPatientId){
  var generation=statusGeneration,sequence=currentApplySequence();
  var publication={generation:generation,sequence:sequence,patientId:expectedPatientId,observedPatientId:statusPatientId()};
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
  invalidateStatusPublication();confirmApplySequence(detail);h=null;
  if(o){clearTimeout(o);o=null}
  // Wybranie wizyty zakończyło już synchroniczną synchronizację. Ustal bazę
  // teraz, zanim lekarz zacznie wpisywać pierwszy pomiar.
  C();f=E();p=!1;I();markStatusReferenceReady();c(i.SAVED);
}
// P-CHIP-KLIRENS: rendering all renal calculators materializes their empty
// control defaults. These are equivalent to an absent calculator in the save
// comparison only; the actual form, session, export and provenance stay intact.
function normalizeClcrStatusInputs(session){
  var inputs=session&&session.inputs;
  if(!inputs||typeof inputs!=="object"||Array.isArray(inputs))return;
  var defaults={
    ACR_entry_mode:"concentration",PCR_entry_mode:"concentration",
    CaCr_entry_mode:"concentration",OxCr_entry_mode:"concentration",CitCr_entry_mode:"concentration",
    CitCr_reported_basis:"unknown",citrateSpotReportingEntity:"unknown",creatinineState:"unknown",
    CA_inputMode:"concentration",CA_clinicalMode:"general",MG_inputMode:"concentration",UA_inputMode:"concentration"
  };
  Object.keys(defaults).forEach(function(key){if(inputs[key]===defaults[key])delete inputs[key]});
  [["Cl24DurationHours","Cl24DurationSource"],["CA_collectionHours","CA_collectionSource"],
    ["MG_collectionHours","MG_collectionSource"],["UA_collectionHours","UA_collectionSource"]].forEach(function(pair){
    var value=inputs[pair[0]],source=inputs[pair[1]],present=value!==null&&value!==undefined&&String(value).trim()!=="";
    // This is the existing durationFields migration: an entered historical
    // duration without a provenance field is manual, including an explicit 24.
    if(present&&(source===undefined||source===null||source===""))inputs[pair[1]]="hours";
    if(present&&source==="assumed-24h"&&/^[+]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?$/i.test(String(value).trim())&&Number(String(value).trim().replace(",","."))===24){
      delete inputs[pair[0]];delete inputs[pair[1]];
    }
  });
}
function Q(){if(typeof n.collectUserData!="function")return null;try{var e=n.collectUserData({source:"save-status-indicator"});return e?(delete e.timestampISO,JSON.stringify(e)):null}catch{return null}}function P(e){if(!e||typeof e!="object")return e;var t;try{t=JSON.parse(JSON.stringify(e))}catch{return e}return delete t.timestampISO,delete t.timestamp,delete t.version,delete t.savedAtISO,t}function X(e){if(!e||typeof e!="object")return e;try{["savedAtISO","source","version","legacyVersion","currentVersion","selectedFormula","preserveAcrossVersions","preservedInputs","summary"].forEach(function(t){try{delete e[t]}catch{}}),e.inputs&&typeof e.inputs=="object"&&(["fullName","age","ageMonths","sex","weight","height","formulaSearch","formulaPicker","samePatientMode","currentVersion","version","selectedFormula"].forEach(function(t){try{delete e.inputs[t]}catch{}}),Object.keys(e.inputs).forEach(function(t){if(/unit$/i.test(t))try{delete e.inputs[t]}catch{}}))}catch{}normalizeClcrStatusInputs(e);return e}function b(e){if(!e||typeof e!="object")return e;try{delete e.doctor}catch{}try{delete e.zscore}catch{}try{delete e.bpDataToggle}catch{}try{delete e.bisphos}catch{}return e}function ee(e){try{["advanced","growthBasic"].forEach(function(t){e&&e[t]&&e[t].data&&typeof e[t].data=="object"&&(e[t].data={measurements:e[t].data.measurements})})}catch{}return e}function M(e){if(e!=null){if(Array.isArray(e)){for(var t=[],r=0;r<e.length;r++){var a=M(e[r]);a!==void 0&&t.push(a)}return t.length?t:void 0}if(typeof e=="object"){for(var u=Object.create(null),m=Object.keys(e).sort(),y=0;y<m.length;y++){var T=M(e[m[y]]);T!==void 0&&(u[m[y]]=T)}return Object.keys(u).length?u:void 0}return typeof e=="string"?e.trim()===""?void 0:e:typeof e=="boolean"&&e===!1?void 0:e}}function te(e){try{normalizeStatusInputs(e);normalizeStatusUiDefaults(e);normalizeStatusVaultMetadata(e);normalizeStatusEmptyBoneAge(e);normalizeStatusAutomaticDiet(e);normalizeStatusMeasurementUi(e);e&&e.clcr&&X(e.clcr);e&&e.core&&ee(e.core);var t=M(e);return t===void 0?{}:t}catch{return e}}function ne(){var e=n.VildaPersistence;try{if(e&&typeof e.readClcrSession=="function")return e.readClcrSession()}catch{}return null}function re(){if(typeof n.collectUserData!="function"||typeof n.hasMeaningfulMainSessionData!="function")return!1;try{var e=n.collectUserData({source:"save-status-fullform-check"});return!!(e&&n.hasMeaningfulMainSessionData(e))}catch{return!1}}function C(){if(statusReadOnly)return;if(typeof n.saveMainSessionNow=="function"&&re())try{n.saveMainSessionNow({force:!0})}catch{}}function ie(){var e=n.VildaPersistence;try{if(e&&typeof e.readMainSession=="function"){var t=e.readMainSession();if(t&&typeof t=="object")return P(t)}}catch{}if(typeof n.collectUserData=="function")try{var r=n.collectUserData({source:"save-status-canonical-fallback"});return typeof n.hasMeaningfulMainSessionData=="function"?r&&n.hasMeaningfulMainSessionData(r)?P(r):null:r?P(r):null}catch{}return null}function E(){var e=ie();if(e==null)return null;if(e&&typeof e=="object"&&e.clcr!==void 0)try{delete e.clcr}catch{}b(e);var t=ne(),r=t?X(P(t)):null,a={core:e,clcr:r};a=te(a);try{return JSON.stringify(a)}catch{return null}}var O="vilda-save-ref-v1",L=null;function k(){try{var e=n.sessionStorage;if(!e)return L;var t=e.getItem(O),r=t?JSON.parse(t):null;if(r&&typeof r.fp==="string")try{r.fp=JSON.stringify(te(JSON.parse(r.fp)))}catch{}return r}catch{return L}}function U(e){L=e||null;if(statusReadOnly)return;try{var t=n.sessionStorage;if(!t)return;e?t.setItem(O,JSON.stringify(e)):t.removeItem(O)}catch{}}function I(){U(f?{fp:f,dirty:!!p,savedAtISO:l||null,snapshotCount:d||null,patientName:v||null}:null)}function N(){f=null,p=!1,U(null)}function ae(e){if(!e||typeof n.hasMeaningfulMainSessionData!="function"||!n.hasMeaningfulMainSessionData(e))return!1;var t;try{t=JSON.parse(JSON.stringify(e))}catch{return!0}return delete t.doctor,delete t.zscore,delete t.bpDataToggle,delete t.bisphos,delete t.clcr,delete t.steroid,n.hasMeaningfulMainSessionData(t)}function statusSharedSessionHasPatient(value){
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
  if(_()){c(i.HIDDEN);return}
  if(f===null){c(i.NEW_PATIENT);return}
  c(p?i.DIRTY:i.SAVED);
}
function V(){invalidateStatusPublication(),D=!0,j()}function Y(){invalidateStatusPublication(),confirmApplySequence(),D=!1,N(),l=null,d=null,v=null,S=null,h=null,c(i.HIDDEN)}function W(e){
  if(statusReadOnly){scheduleSharedStatusReconcile();return}
  var savedPatient=e&&typeof e.patientId==="string"&&e.patientId?e.patientId:null,currentPatient=statusPatientId();
  // Powiadomienie sejfu obejmuje też zmianę innej karty pacjenta.
  // Nie potwierdza ono danych formularza ani nieaktualnego panelu.
  if(savedPatient&&currentPatient&&savedPatient!==currentPatient)return;
  try{var panel=n.VildaPanelPacjent;if(panel&&typeof panel.nieaktualny==="function"&&panel.nieaktualny())return}catch{return}
  invalidateStatusPublication(),confirmApplySequence(e,!0),l=e&&e.savedAtISO||null,d=e&&e.snapshotCount||null,v=e&&e.header&&e.header.name||v,h=null,C(),f=E(),p=!1,I(),markStatusReferenceReady(),c(i.SAVED)}function G(e){
  if(statusReadOnly){scheduleSharedStatusReconcile();return}
  var sequence=e&&e.applySequence,latest=currentApplySequence();
  // A save confirms the form captured when that save began, not a newer import.
  if(e&&e.source==="save"&&(!Number.isSafeInteger(sequence)||sequence<0))return;
  if(Number.isSafeInteger(sequence)&&sequence!==latest)return;
  invalidateStatusPublication(),confirmApplySequence(e,!!(e&&e.source==="save"));
  l=e&&e.savedAtISO||null,d=e&&e.snapshotCount||null,v=e&&e.name||null,h=null;
  o&&(clearTimeout(o),o=null);
  var target=e&&typeof e.patientId==="string"?e.patientId:statusPatientId();
  publishStatusLater(function(){C(),f=E(),p=!1,I(),markStatusReferenceReady(),c(i.SAVED)},target);
}function x(e){
  if(statusReadOnly){scheduleSharedStatusReconcile();return}
  if(obsoleteImport(e))return;
  invalidateStatusPublication(),l=null,d=null,v=e&&e.name||null,h=null,N();
  o&&(clearTimeout(o),o=null);
  publishStatusLater(function(){if(_()){c(i.HIDDEN);return}c(i.NEW_PATIENT)},statusPatientId());
}function Z(){if(statusReadOnly){scheduleSharedStatusReconcile();return}invalidateStatusPublication(),confirmApplySequence(),h=null,o&&(clearTimeout(o),o=null),publishStatusLater(function(){C(),f=E(),p=!1,I(),markStatusReferenceReady(),c(i.SAVED)},statusPatientId())}function K(){invalidateStatusPublication(),confirmApplySequence(),N(),l=null,d=null,v=null,S=null,h=null,o&&(clearTimeout(o),o=null),c(i.HIDDEN),setTimeout(function(){s!==i.HIDDEN&&_()&&c(i.HIDDEN)},300)}function F(){if(statusReadOnly)return;(s===i.DIRTY||s===i.NEW_PATIENT||s===i.ERROR)&&(invalidateStatusPublication(),c(i.SAVING))}function g(){try{n.__vildaSaveStatusState={state:s,lastSavedAtISO:l,lastSnapshotCount:d,lastPatientName:v,dirtyStartedAt:S,lastError:h,relativeTimeStr:l?R(l):null}}catch{}if(!(typeof n.document>"u")){var e=n.document.getElementById("vildaPatientChip");if(e){for(var t=(e.className||"").split(/\s+/),r=[],a=0;a<t.length;a++){var u=t[a];u&&u.indexOf("vilda-save-state--")!==0&&r.push(u)}s&&r.push("vilda-save-state--"+s);var m=r.join(" ");e.className!==m&&(e.className=m);var y=H(s);y?e.getAttribute("title")!==y&&e.setAttribute("title",y):e.hasAttribute("title")&&e.removeAttribute("title")}}}function $(){var e=n.VildaVault;e&&(typeof e.onUnlock=="function"&&e.onUnlock(function(){V()}),typeof e.onLock=="function"&&e.onLock(function(){Y()}),typeof e.onPatientSaved=="function"&&e.onPatientSaved(function(t){W(t)}))}function se(){if(!(typeof n.document>"u")){n.document.addEventListener("input",w,!0),n.document.addEventListener("change",w,!0),["saveDataBtnSidebar"].forEach(function(r){var a=n.document.getElementById(r);a&&a.addEventListener("click",F)}),n.document.addEventListener("vilda:patient-loaded",function(r){try{G(r&&r.detail||{})}catch{}}),/* P-PRZEJECIE-MODULY (2026-10-06): panel powloki przejmuje pacjenta wczytanego w innej ramce (vildaPersistRestoreAll, P-POWLOKA-ID) bez vilda:patient-loaded; wskaznik zostawal przy nazwie, numerze zapisu i odcisku formularza poprzedniego pacjenta. Po zmianie pacjenta sesji karty wskaznik zapomina wlasny punkt odniesienia i bierze wspolny (vilda-save-ref-v1), zapisany przez ramke, ktora pacjenta wczytala - jak przy starcie strony. */n.document.addEventListener("vilda:persist-restored",function(){
  // Także zapis tego samego pacjenta w innej ramce zmienia bazę/metadane.
  // Samo odtworzenie nigdy nie usuwa wspólnej referencji.
  try{scheduleSharedStatusReconcile()}catch{}
}),n.document.addEventListener("vilda:main-session-restored",function(){
  try{scheduleSharedStatusReconcile()}catch{}
}),n.document.addEventListener("vilda:session-changed",function(){
  if(typeof n.collectUserData!=="function")try{scheduleSharedStatusReconcile()}catch{}
}),typeof n.addEventListener==="function"&&n.addEventListener("storage",sharedStatusStorageChanged),n.document.addEventListener("vilda:json-imported",function(r){try{x(r&&r.detail||{})}catch{}}),n.document.addEventListener("vilda:state-restored",function(r){try{Z(r&&r.detail||{})}catch{}}),n.document.addEventListener("vilda:load-choice-applied",function(r){try{statusLoadChoiceApplied(r&&r.detail)}catch{}}),/* P-POKWITANIE-WIZYTA (2026-10-15): przyciski G/Th/P nie generuja input/change, wiec chip zostawal „zapisane" po zmianie stadium, a straznik niezapisanych zmian (czyta ten stan) nie pytal o zapis. Swiadoma edycja oceny przelicza odcisk ta sama droga, co pole formularza. */n.document.addEventListener("vilda:puberty-assessment-changed",function(r){try{r&&r.detail&&r.detail.reason==="edit"&&w({isTrusted:!0})}catch{}}),typeof n.addEventListener=="function"&&n.addEventListener("vilda:user-state-cleared",function(){try{K()}catch{}});var e=0,t=setInterval(function(){var r=!1;["saveDataBtnSidebar"].forEach(function(a){var u=n.document.getElementById(a);u&&!u.__vildaSSIBound&&(u.addEventListener("click",F),u.__vildaSSIBound=!0,r=!0)}),e++,(r||e>50)&&clearInterval(t)},100)}}function ce(){z||(z=setInterval(function(){(s===i.SAVED||s===i.DIRTY)&&g()},3e4))}function q(){if(typeof n.document>"u"){$();return}if(n.document.readyState==="loading"){n.document.addEventListener("DOMContentLoaded",q,{once:!0});return}$(),se(),ce();var e=n.VildaVault;e&&typeof e.isUnlocked=="function"&&e.isUnlocked()&&V(),typeof n.addEventListener=="function"&&n.addEventListener("load",function(){try{var t=n.VildaVault;t&&typeof t.isUnlocked=="function"&&t.isUnlocked()&&!D?V():g()}catch{}},{once:!0})}n.VildaSaveStatusIndicator={STATES:i,reconcileFromSharedReference:reconcileFromSharedReference,isReadyForSharedReference:isReadyForSharedReference,notifySaveFailed:function(e){h=e?String(e):null;c(i.ERROR)},getState:function(){return s},getReferenceFingerprint:function(){return f},getLastSavedAtISO:function(){return l},getLastSnapshotCount:function(){return d},getLastPatientName:function(){return v},notifyExternalChange:function(t){try{if(n.__vildaPersistRestoring===!0)return}catch{}o&&clearTimeout(o),o=setTimeout(ue,400)},_onFormChange:J,_debouncedOnFormChange:w,_onUnlock:V,_onLock:Y,_onPatientSaved:W,_onPatientLoaded:G,_onJsonImported:x,_onStateRestored:Z,_onUserStateCleared:K,_onSaveClicked:F,_computeFormFingerprint:Q,_computeCanonicalFingerprint:E,_reconcileState:j,_readPersistedRef:k,_writePersistedRef:U,_clearPersistedRef:N,_setReferenceFingerprint:function(e){f=e},_forceTransition:function(e){c(e)},_relativeTime:R,_buildTitleAttr:H,_setLastSavedAtISO:function(e){l=e},_setLastSnapshotCount:function(e){d=e},_setLastPatientName:function(e){v=e},_setDirtyStartedAt:function(e){S=e},_setLastError:function(e){h=e}},typeof n<"u"&&(n.__vildaSaveStatusDebug=function(){var e=n.VildaVault,t=n.document&&n.document.getElementById("vildaPatientChip"),r={state:s,vaultUnlocked:!!(e&&typeof e.isUnlocked=="function"&&e.isUnlocked()),myVaultUnlockedFlag:D,referenceFingerprint:f?"["+f.length+" znak\xF3w]":null,lastSavedAtISO:l,lastSnapshotCount:d,lastPatientName:v,chipExists:!!t,chipClasses:t?t.className:null,chipTitle:t?t.getAttribute("title"):null,collectUserDataExists:typeof n.collectUserData,formMostlyEmpty:null};try{if(typeof n.collectUserData=="function"){var a=n.collectUserData({source:"debug"});r.formData=a?{name:a.name,user:a.user}:null,r.formMostlyEmpty=_()}}catch(u){r.formDataError=String(u)}return console.table(r),r}),q()})(typeof window<"u"?window:globalThis);
