(function(o){"use strict";
/* The vault owns clinical format selection. A public receipt or the independent
 * template-library channel never authorizes a clinical transport. The absent
 * method is only compatibility with old bundles/test doubles; a present method
 * returning anything other than the explicit legacy descriptor fails closed.
 * The ordinary inactive path is synchronous and does no identity/storage I/O. */
// Clinical sync dispatch only. Existing template transport and every legacy
// HTTP/payload/identity guard remain byte-for-byte in the generated runtime.
var WorkspaceSyncFlight = null, WorkspaceSyncLastAck = null, WorkspaceSyncGeneration = 0, WorkspaceSyncBoundVaults = [];

function WorkspaceSyncOwner(vault) {
  var user = vault && typeof vault.getCurrentUser === 'function' ? vault.getCurrentUser() : null;
  return user && typeof user.userId === 'string' ? user.userId : null;
}
function WorkspaceSyncBind(vault) {
  if (!vault || WorkspaceSyncBoundVaults.indexOf(vault) >= 0 || typeof vault.onLock !== 'function') return;
  WorkspaceSyncBoundVaults.push(vault);
  vault.onLock(function () {
    WorkspaceSyncGeneration++;
    if (WorkspaceSyncFlight && WorkspaceSyncFlight.vault === vault) WorkspaceSyncFlight = null;
    if (WorkspaceSyncLastAck && WorkspaceSyncLastAck.vault === vault) WorkspaceSyncLastAck = null;
  });
}
function WorkspaceSyncCheck(vault, owner, generation) {
  if (o.VildaVault !== vault || !vault || typeof vault.isUnlocked !== 'function' || !vault.isUnlocked()
    || WorkspaceSyncOwner(vault) !== owner || generation !== WorkspaceSyncGeneration) throw u('Sesja synchronizacji została zmieniona.', 'SESSION_CHANGED');
}
function WorkspaceSyncStatusShape(value) {
  if (!value || typeof value !== 'object' || !Number.isSafeInteger(value.revision) || value.revision < 1
    || !Number.isSafeInteger(value.pendingCount) || value.pendingCount < 0
    || !Number.isSafeInteger(value.conflictCount) || value.conflictCount < 0
    || !Number.isSafeInteger(value.remoteHeadSeq) || value.remoteHeadSeq < 0
    || typeof value.bootstrapRequired !== 'boolean' || typeof value.localWriteAvailable !== 'boolean'
    || !['synced', 'pending', 'conflict', 'bootstrap-required', 'not-admitted'].includes(value.status))
    throw u('Nie można potwierdzić stanu synchronizacji danych pacjentów.', 'CLINICAL_WORKSPACE_STATUS_INVALID');
  return { status: value.status, revision: value.revision, pendingCount: value.pendingCount,
    conflictCount: value.conflictCount, remoteHeadSeq: value.remoteHeadSeq,
    bootstrapRequired: value.bootstrapRequired, localWriteAvailable: value.localWriteAvailable };
}
async function WorkspaceSyncPrepared(operation) {
  var vault = I(), owner = WorkspaceSyncOwner(vault);
  WorkspaceSyncBind(vault); var generation = WorkspaceSyncGeneration;
  if (typeof vault.preparePatientClinicalRoute !== 'function') return { vault: vault, owner: owner, generation: generation, mode: 'legacy' };
  var selection = await vault.preparePatientClinicalRoute();
  WorkspaceSyncCheck(vault, owner, generation);
  if (selection && selection.mode === 'legacy') return { vault: vault, owner: owner, generation: generation, mode: 'legacy' };
  if (!selection || selection.mode !== 'protected-workspace' || typeof vault.syncPatientWorkspace !== 'function'
    || typeof vault.getPatientWorkspaceStatus !== 'function') {
    var error = PatientClinicalRouteFailure(operation) || u('Dane pacjentów nie są jeszcze gotowe do synchronizacji.', 'CLINICAL_WORKSPACE_NOT_READY');
    throw error;
  }
  return { vault: vault, owner: owner, generation: generation, mode: 'protected-workspace' };
}
function WorkspaceSyncUnsent(status) {
  var code = status.conflictCount || status.status === 'conflict' ? 'CLINICAL_WORKSPACE_CONFLICT'
    : status.pendingCount || status.status === 'pending' ? 'CLINICAL_WORKSPACE_PENDING' : 'CLINICAL_WORKSPACE_NOT_READY';
  var message = code === 'CLINICAL_WORKSPACE_CONFLICT' ? 'Zachowano obie wersje zmian. Uzgodnij je przed dalszą synchronizacją.'
    : code === 'CLINICAL_WORKSPACE_PENDING' ? 'Zmiany zapisano na tym urządzeniu i oczekują na synchronizację.'
      : 'Najpierw zakończ przygotowanie danych pacjentów.';
  return u(message, code, { patientWorkspace: true, workspaceStatus: status });
}
function WorkspaceSyncNative(context, operation, refresh) {
  var vault = context.vault, owner = context.owner, generation = context.generation, current = WorkspaceSyncFlight;
  if (current && current.vault === vault && current.owner === owner && current.generation === generation) {
    if (refresh && !current.refresh) return current.promise.then(function () {
      WorkspaceSyncCheck(vault, owner, generation); return WorkspaceSyncNative(context, operation, true);
    });
    return current.promise;
  }
  var flight = { vault: vault, owner: owner, generation: generation, refresh: refresh, promise: null };
  flight.promise = Promise.resolve().then(async function () {
    WorkspaceSyncCheck(vault, owner, generation);
    y(L, { operation: operation, patientWorkspace: true });
    var before = WorkspaceSyncStatusShape(await vault.getPatientWorkspaceStatus());
    WorkspaceSyncCheck(vault, owner, generation);
    if (o.navigator && o.navigator.onLine === false) throw u('Brak połączenia. Zmiany pozostają zapisane na tym urządzeniu.',
      'CLINICAL_WORKSPACE_OFFLINE', { patientWorkspace: true, workspaceStatus: before });
    var status = WorkspaceSyncStatusShape(await vault.syncPatientWorkspace({ refresh: refresh }));
    WorkspaceSyncCheck(vault, owner, generation);
    if (status.status !== 'synced' || status.pendingCount || status.conflictCount || status.bootstrapRequired
      || status.remoteHeadSeq < 1) throw WorkspaceSyncUnsent(status);
    WorkspaceSyncLastAck = { vault: vault, owner: owner, at: new Date().toISOString(), revision: status.revision };
    var result = { action: 'workspace-synced', patientWorkspace: true, updated: status.revision !== before.revision, status: status };
    y(p, { operation: operation, patientWorkspace: true, result: result });
    return result;
  }).catch(function (error) {
    try { WorkspaceSyncCheck(vault, owner, generation); } catch (changed) { error = changed; }
    if (error && error.code !== 'SESSION_CHANGED') y(k, { operation: operation, patientWorkspace: true, error: error });
    throw error;
  });
  WorkspaceSyncFlight = flight;
  function WorkspaceSyncFinish() { if (WorkspaceSyncFlight === flight) WorkspaceSyncFlight = null; }
  flight.promise.then(WorkspaceSyncFinish, WorkspaceSyncFinish);
  return flight.promise;
}
function WorkspaceSyncDispatch(operation, refresh, legacy) {
  // An old vault bundle has no protected-route selector. Keep its original
  // promise and microtask ordering: wrapping that promise can start a second
  // full upload before the existing keepalive queue has joined its callers.
  var vault = o.VildaVault;
  if (vault && typeof vault.preparePatientClinicalRoute !== 'function') return legacy();
  return WorkspaceSyncPrepared('sync-' + operation).then(function (context) {
    if (context.mode === 'legacy') return legacy();
    return WorkspaceSyncNative(context, operation, refresh);
  }, function (error) {
    if (error && error.code !== 'SESSION_CHANGED') y(k, { operation: operation, patientWorkspace: true, error: error });
    throw error;
  });
}
async function WorkspaceSyncReadStatus(legacy) {
  var context = await WorkspaceSyncPrepared('sync-status');
  if (context.mode === 'legacy') return legacy();
  var status = WorkspaceSyncStatusShape(await context.vault.getPatientWorkspaceStatus());
  WorkspaceSyncCheck(context.vault, context.owner, context.generation);
  var ack = WorkspaceSyncLastAck;
  return { registered: status.remoteHeadSeq > 0, localEtag: null,
    lastSyncAt: ack && ack.vault === context.vault && ack.owner === context.owner && ack.revision === status.revision ? ack.at : null,
    patientWorkspace: true, status: status.status, revision: status.revision, pendingCount: status.pendingCount,
    conflictCount: status.conflictCount, remoteHeadSeq: status.remoteHeadSeq, bootstrapRequired: status.bootstrapRequired };
}
function PatientClinicalRouteFailure(operation) {
  var vault = o && o.VildaVault;
  if (!vault) return null;
  var code = "PATIENT_AUTHORITY_UNAVAILABLE";
  try {
    var select = vault.selectPatientClinicalRoute;
    if (select === undefined) return null;
    var selection = typeof select === "function" ? select.call(vault, operation) : null;
    if (selection && selection.mode === "legacy" && selection.writeAvailable === false) return null;
    if (selection && typeof selection.code === "string" && selection.code) code = selection.code;
  } catch (cause) {
    if (cause && cause.code === "SESSION_CHANGED") code = "SESSION_CHANGED";
  }
  var error = new Error("Ta operacja wymaga zgodnego formatu danych pacjentów.");
  error.code = code;
  error.patientClinicalUnavailable = true;
  error.operation = operation;
  return error;
}
function PatientClinicalRequireLegacy(operation) {
  var error = PatientClinicalRouteFailure(operation);
  if (error) throw error;
}
function PatientClinicalRejected(operation) {
  var error = PatientClinicalRouteFailure(operation);
  return error ? Promise.reject(error) : null;
}
function PatientClinicalLoadState(slotId) {
  PatientClinicalRequireLegacy("sync-state-read");
  return m(slotId);
}
function PatientClinicalSaveState(slotId, state) {
  PatientClinicalRequireLegacy("sync-state-write");
  return T(slotId, state);
}
function PatientClinicalClearState(slotId) {
  PatientClinicalRequireLegacy("sync-state-clear");
  return C(slotId);
}
var Ct="vilda-sync-state-v1",jt="https://vilda-sync.maciej-4b9.workers.dev",N=3,Mt=3e4,ct=15e3,st=1e3,Ot=16384,L=[],p=[],k=[];async function G(t,e){var a=crypto.getRandomValues(new Uint8Array(12)),r=await crypto.subtle.encrypt({name:"AES-GCM",iv:a},e,t),n=new Uint8Array(12+r.byteLength);return n.set(a,0),n.set(new Uint8Array(r),12),n.buffer}async function ut(t,e){var a=new Uint8Array(t);if(a.length<28)throw new Error("VildaSync: nieprawid\u0142owy format bloba (za kr\xF3tki: "+a.length+" bajt\xF3w).");var r=a.slice(0,12),n=a.slice(12);return crypto.subtle.decrypt({name:"AES-GCM",iv:r},e,n)}/* P-SYNC-MOST (decyzja wlasciciela 2026-10-07; most przed synchronizacja przyrostowa, docs/SYNC_PRZYROSTOWA_PLAN.md etap 0). Pelna wysylka sejfu ~21-24 MB nie miescila sie w 30 s (iPhone: TIMEOUT) ani nie przechodzila przez serwer (komputer: Failed to fetch). (1) Bajty JSON ladunku od Bgz_PROG wzwyz sa kompresowane gzipem PRZED szyfrowaniem (CompressionStream). Brak API albo wylacznik localStorage vilda-sync-gzip-v1=0 -> wysylka bez kompresji, jak dotad. Format na drucie bez zmian: IV(12)||AES-GCM(syncEncKey). (2) Czytelnik po odszyfrowaniu rozpoznaje gzip po bajtach 1F 8B (JSON.stringify obiektu zaczyna sie od 7B "{"); inne dane czyta jak dotad. (3) Zadanie z cialem bloba ma limit czasu 30 s + 1 s na kazde 100 kB, najwyzej Bgz_SUFIT. */var Bgz_PROG=4194304,Bgz_SUFIT=18e4;function Bgz_czas(t){var e=t&&typeof t.byteLength=="number"?t.byteLength:0;return Math.min(Bgz_SUFIT,Mt+Math.ceil(e/100))}function Bgz_prog(){var t=o.VILDA_SYNC_GZIP_MIN_BYTES;return typeof t=="number"&&t>=0?t:Bgz_PROG}function Bgz_zapis(){try{if(o.localStorage&&o.localStorage.getItem("vilda-sync-gzip-v1")==="0")return!1}catch{}return typeof CompressionStream=="function"}async function Bgz_strumien(t,e){var a=e.writable.getWriter();a.write(t).catch(function(){});a.close().catch(function(){});return new Uint8Array(await new Response(e.readable).arrayBuffer())}async function Bgz_pakuj(t){if(!t||t.length<Bgz_prog()||!Bgz_zapis())return t;try{var a=await Bgz_strumien(t,new CompressionStream("gzip"));/* P-SYNC-MOST-STOPKA: przyjmuj tylko kompletny gzip. Safari/iOS 16.4-16.5 (WebKit przed 263997@main, poprawka w Safari 16.6) ucina koniec strumienia przy flush, gdy ostatni blok ze stopka przekracza 16 KiB; ucinek trafilby do chmury i zablokowal pobieranie na pozostalych urzadzeniach (DECOMPRESS_FAILED). Stopka gzip konczy sie ISIZE = dlugosc wejscia mod 2^32 (RFC 1952). Inaczej: wysylka jawna, jak przed P-SYNC-MOST. */var Bgn=a.length;return Bgn>=18&&Bgn<t.length&&a[0]===31&&a[1]===139&&(a[Bgn-4]|a[Bgn-3]<<8|a[Bgn-2]<<16|a[Bgn-1]<<24)>>>0===t.length>>>0?a:t}catch{return t}}async function Bgz_rozpakuj(t){var e=new Uint8Array(t);if(e.length<2||e[0]!==31||e[1]!==139)return e;if(typeof DecompressionStream!="function")throw u("VildaSync: dane w chmurze s\u0105 skompresowane, a ta przegl\u0105darka nie umie ich rozpakowa\u0107. Zaktualizuj system lub przegl\u0105dark\u0119.","GZIP_UNSUPPORTED");try{return await Bgz_strumien(e,new DecompressionStream("gzip"))}catch{throw u("VildaSync: uszkodzone dane sync (nieudane rozpakowanie gzip).","DECOMPRESS_FAILED")}}/* G17 (D13): werdykt o rozjezdzie zegarow jedzie ta sama droga, co ostrzezenie o nieaktualnym
   urzadzeniu - jedno rozgloszenie na scalenie, bez wlasnego kanalu i bez stanu. */
function Qcs(t){try{if(!t||typeof t!="object"||t.warn!==!0)return;typeof o.document<"u"&&o.document.dispatchEvent&&o.document.dispatchEvent(new CustomEvent("vilda:sync-clock-skew",{detail:t,bubbles:!1}))}catch{}}
/* P-SYNC-LIMIT-ODCZYTU (2026-11-11, decyzja 2 wlasciciela z 2026-11-11): limit f() konczy sie z naglowkami odpowiedzi, a
   tresc czytana potem przez json() nie miala zadnego limitu. Gdy serwer przyslal naglowki i zamilkl, zawieszony odczyt
   trzymal pobranie (znacznik trwajacego pobrania w integracji) albo drenaz zmian (jeden naraz w dokumencie) do
   przeladowania strony. Teraz f() z czwartym argumentem (ms) zapamietuje swoj AbortController przy odpowiedzi,
   a Btr_json() czyta tresc najwyzej tyle: po czasie przerywa zadanie i konczy sie bledem TIMEOUT (jak limit naglowkow),
   a nastepne pobranie probuje od nowa. Tylko odczyty sciezki pobierania: GET /v1/health, GET /status w pobraniu,
   GET /changes (stronami i legacy) i GET /deltas. Wysylka, rejestracja i blob bez zmian (blob ma wlasny limit porcji,
   Bnd_krok). Bez czwartego argumentu Btr_json() to zwykle json(). */
var Btr_LIMIT_STRONY_MS=6e4,Btr_odp=new WeakMap();
function Btr_json(t){var e=t&&typeof t=="object"?Btr_odp.get(t):null;if(!e)return t.json();return new Promise(function(a,r){var n=!1,i=setTimeout(function(){if(n)return;n=!0;try{e.k.abort()}catch{}var c=new Error("VildaSync: timeout odczytu odpowiedzi serwera ("+e.ms+" ms).");c.code="TIMEOUT",r(c)},e.ms);Promise.resolve().then(function(){return t.json()}).then(function(c){n||(n=!0,clearTimeout(i),a(c))},function(c){n||(n=!0,clearTimeout(i),r(c))})})}
function Nv(t){try{if(!t||typeof t!="object")return;typeof o.document<"u"&&o.document.dispatchEvent&&o.document.dispatchEvent(new CustomEvent("vilda:sync-stale-device",{detail:t,bubbles:!1}))}catch{}}function $(t){return Ct+":"+t}function q(){try{var t=o.VildaVault,e=!!(t&&typeof t.isCloudOnlyMode=="function"&&t.isCloudOnlyMode()),a=o.VildaPersistence,r=!1;try{r=!!(a&&typeof a.isEphemeralMode=="function"&&a.isEphemeralMode()),!r&&t&&typeof t.isEphemeralMode=="function"&&t.isEphemeralMode()&&(r=!0),!r&&o.sessionStorage&&o.sessionStorage.getItem("vilda-ephemeral-session-v1")==="1"&&(r=!0)}catch{}if(e||r){if(a&&typeof a.getStorage=="function"){var n=a.getStorage("local");if(n)return n}return o.sessionStorage||null}if(a&&typeof a.getStorage=="function"){var i=a.getStorage("local-persistent");if(i)return i}}catch{}return o.localStorage||null}function m(t){PatientClinicalRequireLegacy("sync-state-read");try{var e=q(),a=e&&e.getItem($(t));if(!a)return{registered:!1,localEtag:null,lastSyncAt:null};var r=JSON.parse(a);return r&&typeof r=="object"?r:{registered:!1,localEtag:null,lastSyncAt:null}}catch{return{registered:!1,localEtag:null,lastSyncAt:null}}}function T(t,e){PatientClinicalRequireLegacy("sync-state-write");try{var a=q();a&&a.setItem($(t),JSON.stringify(e))}catch{}}/* P-SYNC-ROTACJA-KART (2026-10-08): po rotacji tozsamosci (revokeAllDevices) slot poprzedniej tozsamosci dostaje znacznik we wspolnym localStorage (vilda-sync-revoked-v1:<slotId>), takze w trybie chmurowym, gdzie stan slotu jest w pamieci karty. Inna karta tego profilu trzyma poprzednia tozsamosc w pamieci do odswiezenia strony. Synchronizacja nie rejestruje, nie wysyla, nie pobiera i nie przywraca slotu ze znacznikiem: konczy sie SYNC_IDENTITY_CHANGED. Odswiezenie strony wczytuje biezaca tozsamosc. */var Brv="vilda-sync-revoked-v1:";function Brv_oznacz(t){PatientClinicalRequireLegacy("sync-identity-marker");try{o.localStorage&&o.localStorage.setItem(Brv+t,new Date().toISOString())}catch{}}function Brv_jest(t){try{return!!(t&&o.localStorage&&o.localStorage.getItem(Brv+t))}catch{return!1}}function Brv_stop(t){if(Brv_jest(t))throw u("VildaSync: ten slot synchronizacji zosta\u0142 zast\u0105piony nowym (wylogowanie wszystkich urz\u0105dze\u0144). Je\u015Bli b\u0142\u0105d si\u0119 powtarza, od\u015Bwie\u017C stron\u0119.","SYNC_IDENTITY_CHANGED")}function C(t){PatientClinicalRequireLegacy("sync-state-clear");try{var e=q();e&&e.removeItem($(t))}catch{}}function j(){return(o.VILDA_SYNC_WORKER_URL||jt).replace(/\/$/,"")}async function f(t,e,a,Btr){PatientClinicalRequireLegacy("sync-http");var r=new AbortController,n=typeof a=="number"&&a>0?a:Mt,i=setTimeout(function(){r.abort()},n);try{var PatientClinicalResponse=await fetch(t,Object.assign({cache:"no-store"},e,{signal:r.signal}));PatientClinicalRequireLegacy("sync-http");typeof Btr=="number"&&Btr>0&&PatientClinicalResponse&&typeof PatientClinicalResponse=="object"&&Btr_odp.set(PatientClinicalResponse,{k:r,ms:Btr});return PatientClinicalResponse}catch(l){if(l.name==="AbortError"){var Bgb=e&&e.body&&typeof e.body.byteLength=="number"?e.body.byteLength:0,c=new Error("VildaSync: timeout \u017C\u0105dania do serwera ("+n+" ms"+(Bgb?", "+(Bgb>=1048576?(Bgb/1048576).toFixed(1)+" MB":Math.ceil(Bgb/1024)+" kB"):"")+").");throw c.code="TIMEOUT",Bgb&&(c.bytes=Bgb),c}throw l}finally{clearTimeout(i)}}function lt(t){return new Promise(function(e){setTimeout(e,t)})}/* P-SYNC-KURSOR (plan synchronizacji przyrostowej, etap 0): odstep przed ponownym pobraniem po 412 (If-Match nie pasuje, bo inne urzadzenie wlasnie wyslalo). Proba 1: 1 s, proba 2: 3 s (3^(proba-1) s), z rozrzutem x0,5-1,5. Dotad ponowienie szlo od razu, wiec dwa urzadzenia, ktore zderzyly sie na If-Match, startowaly znow w tej samej chwili; pobranie po odstepie widzi tez kolejne wysylki drugiego urzadzenia. */function Bod(t){return Math.round(1e3*Math.pow(3,t-1)*(.5+Math.random()))}function yt(t){var e=t.headers.get("Retry-After");if(!e)return st;var a=parseInt(e,10);return isFinite(a)&&a>0?a*1e3:st}function Lt(t){return t?t.trim().replace(/^"(.*)"$/,"$1"):null}function u(t,e,a){var r=new Error(t);return r.code=e||"SYNC_ERROR",a&&Object.assign(r,a),r}function I(){var t=o.VildaVault;if(!t||!t.isUnlocked())throw u("VildaSync: vault nie jest odblokowany. Zaloguj si\u0119 przed synchronizacj\u0105.","VAULT_LOCKED");return t}async function Vt(){try{var t=o.VildaVault;if(!t||typeof t.listPatients!="function")return!1;var e=await t.listPatients();return Array.isArray(e)&&e.length===0}catch{return!1}}var M=null,b="vilda-cloud-etag-v1:",Nt=(function(){try{return o.self===o.top}catch{return!1}})();function dt(t){try{return!!(Nt&&t&&typeof t.isPersistentCloudCacheEnabled=="function"&&t.isPersistentCloudCacheEnabled())}catch{return!1}}function Pt(t,e){try{return!dt(e)||typeof o.localStorage>"u"||!o.localStorage?null:o.localStorage.getItem(b+t)||null}catch{return null}}function ft(t,e,a){PatientClinicalRequireLegacy("cloud-etag-write");try{if(!dt(a)||typeof o.localStorage>"u"||!o.localStorage)return;e?o.localStorage.setItem(b+t,e):o.localStorage.removeItem(b+t)}catch{}}function vt(t){try{o.localStorage&&o.localStorage.removeItem(b+t)}catch{}}var Z=!1,Q="vilda-sync-pulled-v1";function P(){Z=!0;try{o.sessionStorage&&o.sessionStorage.setItem(Q,"1")}catch{}}function Ft(){if(Z)return!0;try{if(o.sessionStorage&&o.sessionStorage.getItem(Q)==="1")return!0}catch{}return!1}function Ut(){Z=!1;try{o.sessionStorage&&o.sessionStorage.removeItem(Q)}catch{}}function K(){try{var t=o.VildaVault;return!!(t&&typeof t.isCloudOnlyMode=="function"&&t.isCloudOnlyMode())}catch{return!1}}function y(t,e){for(var a=0;a<t.length;a++)try{t[a](e)}catch{}}function R(t){try{return t&&Array.isArray(t.patients)?t.patients.length:0}catch{return 0}}/* P-SYNC-MOST-STOPKA (przeglad adwersarza, soczewka czas): naraz trwa najwyzej jedna pelna wysylka. Z limitem do 180 s planowane wysylki integracji (I(), M(), V(), sejf w trybie chmurowym, syncFull) potrafily nakladac sie na trwajaca i dzielic lacze, az wszystkie konczyly sie TIMEOUT. Wywolania w trakcie scalaja sie w jedna wysylke w kolejce, ktora eksportuje najswiezszy stan i rusza po zakonczeniu biezacej, takze po jej bledzie. */var Bpf=null,Bpq=null,Bpk=!1;function ht(t){var PatientClinicalRejection=PatientClinicalRejected("sync-push");if(PatientClinicalRejection)return PatientClinicalRejection;t&&t.keepalive&&Bns_najpierwZdarzenia();/* P-SYNC-KURSOR (przeglad adwersarza): nowa wysylka rusza tylko, gdy nie trwa zadna i nie czeka kolejka. Wywolanie w chwili miedzy koncem wysylki (Bpf=null) a startem kolejki dolacza do kolejki, zamiast wysylac osobno bez keepalive. */if(!Bpf&&!Bpq){Bpf=Bht0(t);var x=function(){Bpf=null};Bpf.then(x,x);return Bpf}/* P-SYNC-KURSOR (uwaga Codex P2 do #574): wywolanie z keepalive (chowanie karty, M() integracji) moglo trafic do kolejki zalozonej wczesniej przez zwykle wywolanie. Kolejka brala opcje pierwszego wywolania, wiec flaga ginela. Teraz keepalive sumuje sie dla wszystkich wywolan scalonych w kolejce (PUT dostaje keepalive tylko do 60 000 B, jak dotad). */t&&t.keepalive&&(Bpk=!0);if(!Bpq){Bpq=Bpf.then(null,function(){}).then(function(){var Bkk=Bpk;Bpq=null,Bpk=!1;return ht(Bkk?{keepalive:!0}:t)})}return Bpq}async function Bht0(t){PatientClinicalRequireLegacy("sync-push");var e=I();y(L,{operation:"push"});var a=!!(t&&t.keepalive),r;try{r=await e.getSyncMaterial()}catch(O){throw y(k,{operation:"push",error:O}),O}var n=r.slotId,i=r.authToken,c=r.authTokenHash,l=r.syncEncKey,d=j(),s=m(n),Bss=!1;try{Brv_stop(n);for(var w=await e.exportSyncPayload(),S=new TextEncoder().encode(JSON.stringify(w)),h=await G(await Bgz_pakuj(S),l),D=R(w),_=S.length,g=1;g<=N;g++){/* P-SYNC-KURSOR: wysylka czyta tozsamosc synchronizacji raz, na starcie, a revokeAllDevices nie czeka na trwajaca wysylke (odstep po 412 wydluzyl jej czas). Przed kazda ponowna proba (po 412 albo 429) wysylka sprawdza, czy tozsamosc jest ta sama; po zmianie konczy sie SYNC_IDENTITY_CHANGED i nie wraca do starego slotu. Nastepna wysylka idzie na nowy slot. */if(g>1){var Bim=await e.getSyncMaterial();if(!Bim||Bim.slotId!==n)throw u("VildaSync: wysy\u0142ka przerwana \u2014 to\u017Csamo\u015B\u0107 synchronizacji zmieni\u0142a si\u0119 w trakcie (wylogowanie wszystkich urz\u0105dze\u0144). Nast\u0119pna wysy\u0142ka idzie ju\u017C na nowy slot.","SYNC_IDENTITY_CHANGED")}if(!s.registered){Brv_stop(n);var v=await f(d+"/v1/slots/"+n+"/register",{method:"POST",headers:{"Content-Type":"application/octet-stream","X-Auth-Token-Hash":c},body:h},Bgz_czas(h));if(v.status===201){var A=await v.json();PatientClinicalRequireLegacy("sync-push");/* P-SYNC-ROTACJA-KART: znacznik pojawil sie w trakcie rejestracji - slot jest kasowany jak w revokeAllDevices. */if(Brv_jest(n)){await _t(n,i).catch(function(){});C(n);Brv_stop(n)}s.registered=!0,s.localEtag=A.etag,s.rawSize=_,s.rawEtag=A.etag,s.lastSyncAt=new Date().toISOString(),T(n,s);var F={action:"registered",etag:A.etag,bytes:h.byteLength};return y(p,{operation:"push",result:F}),F}if(v.status===409){/* P-SYNC-STRAZNIK (decyzja wlasciciela 2026-10-05). Slot juz istnieje, a to urzadzenie nie ma jego stanu (nowe urzadzenie albo „Zresetuj stan synchronizacji”). Dotad wysylka brala ETag z /status, a scalenie bloba szlo w catch{}: blad scalania (MERGE_BUSY, siec, odszyfrowanie) nie przerywal wysylki i PUT z tym ETagiem nadpisywal chmure stanem, w ktorym nic z niej nie scalono. Teraz pelne pobranie (Y: status, blob, scalenie, ETag scalonej tresci) — jego blad przerywa wysylke. */await Y(),Bss=!0;var E=await e.exportSyncPayload(),rt=new TextEncoder().encode(JSON.stringify(E));h=await G(await Bgz_pakuj(rt),l),D=R(E),_=rt.length,s=m(n)}else if(v.status===429){if(g<N){await lt(yt(v));continue}throw u("VildaSync: zbyt wiele \u017C\u0105da\u0144 rejestracji. Spr\xF3buj za chwil\u0119.","RATE_LIMITED")}else if(!v.ok){var gt=await v.json().catch(function(){return{}});throw u("VildaSync: b\u0142\u0105d rejestracji slotu ("+v.status+"): "+(gt.error&&gt.error.message||""),"REGISTER_FAILED",{httpStatus:v.status})}}/* P-SYNC-STRAZNIK: ETag z /status bez scalenia to nadpisanie chmury. Strazniki ponizej (STALE_DEVICE_GUARD: pobranie w tej SESJI, nie tego ETagu) tego nie lapaly. Bez ETagu wysylka najpierw pobiera i scala w tej samej operacji; ETag z /status zostaje tylko po udanym pobraniu, ktore go nie dalo (brak bloba). */if(!s.localEtag&&!Bss){await Y(),Bss=!0;var Bse=await e.exportSyncPayload(),Bsr=new TextEncoder().encode(JSON.stringify(Bse));h=await G(await Bgz_pakuj(Bsr),l),D=R(Bse),_=Bsr.length,s=m(n)}if(!s.localEtag){var nt=await f(d+"/v1/slots/"+n+"/status",{method:"GET",headers:{Authorization:"Bearer "+i}});if(nt.status===401)throw C(n),u("VildaSync: b\u0142\u0105d uwierzytelnienia. Dane sync mog\u0142y zosta\u0107 usuni\u0119te.","AUTH_FAILED");if(nt.ok){var ta=await nt.json();PatientClinicalRequireLegacy("sync-push");s.localEtag=ta.etag||null,T(n,s)}}if(!Ft()&&s.registered&&s.localEtag)throw u("VildaSync: wstrzymano wysy\u0142k\u0119 \u2014 najpierw pobierz \u015Bwie\u017Cy stan z chmury (to urz\u0105dzenie nie wykona\u0142o jeszcze synchronizacji w tej sesji).","STALE_DEVICE_GUARD");if(D===0&&s.registered&&s.localEtag){var At=await f(d+"/v1/slots/"+n+"/status",{method:"GET",headers:{Authorization:"Bearer "+i}});if(At.ok){var it=await At.json().catch(function(){return{}}),X=it&&typeof it.size=="number"?it.size:0;/* P-SYNC-MOST-STOPKA (uwaga Codex P1 do #573): size z /status to rozmiar bloba po kompresji, a _ to surowe bajty JSON. Gdy urzadzenie zna surowy rozmiar tego samego bloba (rawSize/rawEtag z ostatniego scalenia, wysylki albo rejestracji przy tym samym ETagu), straznik porownuje surowe z surowym, jak przed kompresja. */it&&s.rawEtag&&it.etag===s.rawEtag&&typeof s.rawSize=="number"&&s.rawSize>X&&(X=s.rawSize);if(X>=Ot&&_<X/4)throw u("VildaSync: zablokowano wysy\u0142k\u0119 stanu bez pacjent\xF3w \u2014 serwer ma "+X+" B danych (lokalnie tylko "+_+" B). Najpierw wykonaj pe\u0142ne pobranie (pull).","WIPE_GUARD",{serverSize:X,localBytes:_})}}var Tt={"Content-Type":"application/octet-stream",Authorization:"Bearer "+i};s.localEtag&&(Tt["If-Match"]='"'+s.localEtag+'"');Brv_stop(n);var mt={method:"PUT",headers:Tt,body:h};try{a&&h&&h.byteLength<=6e4&&(mt.keepalive=!0)}catch{}mt.keepalive&&await Bns_poZdarzeniach();var z=await f(d+"/v1/slots/"+n+"/blob",mt,Bgz_czas(h));if(z.status===200){var ot=await z.json();PatientClinicalRequireLegacy("sync-push");s.localEtag=ot.etag,s.rawSize=_,s.rawEtag=ot.etag,K()&&ft(n,ot.etag,e),s.lastSyncAt=new Date().toISOString(),T(n,s);var It={action:"uploaded",etag:ot.etag,bytes:h.byteLength};return y(p,{operation:"push",result:It}),It}if(z.status===412){if(g<N){await lt(Bod(g)),await Y(),Bss=!0;var Dt=await e.exportSyncPayload(),zt=new TextEncoder().encode(JSON.stringify(Dt));h=await G(await Bgz_pakuj(zt),l),D=R(Dt),_=zt.length,s=m(n);continue}throw u("VildaSync: konflikt danych po "+N+" pr\xF3bach scalenia. Spr\xF3buj ponownie za chwil\u0119.","CONFLICT")}if(z.status===429){if(g<N){await lt(yt(z));continue}throw u("VildaSync: zbyt wiele \u017C\u0105da\u0144 uploadu. Spr\xF3buj za chwil\u0119.","RATE_LIMITED")}if(z.status===401)throw C(n),u("VildaSync: b\u0142\u0105d uwierzytelnienia przy upload.","AUTH_FAILED");var kt=await z.json().catch(function(){return{}});throw u("VildaSync: upload nieudany ("+z.status+"): "+(kt.error&&kt.error.message||""),"UPLOAD_FAILED",{httpStatus:z.status})}throw u("VildaSync: przekroczono limit pr\xF3b push.","MAX_RETRIES_EXCEEDED")}catch(O){throw y(k,{operation:"push",error:O}),O}}function Gt(){try{if(typeof o.VILDA_INCR_SYNC=="boolean")return o.VILDA_INCR_SYNC;if(o.localStorage){var t=o.localStorage.getItem("vilda-incr-sync-v1");if(t==="1")return!0;if(t==="0")return!1}}catch(e){}return!0}var tt="vilda-sync-cursor-v1:";function bt(t){try{if(!o.localStorage)return 0;var e=parseInt(o.localStorage.getItem(tt+t),10);return isFinite(e)&&e>=0?e:0}catch{return 0}}function Kt(t,e){PatientClinicalRequireLegacy("sync-cursor-write");try{o.localStorage&&typeof e=="number"&&isFinite(e)&&e>=0&&o.localStorage.setItem(tt+t,String(e))}catch(a){}}function St(t){try{o.localStorage&&o.localStorage.removeItem(tt+t)}catch(e){}}/* P-SYNC-STRAZNIK (uwaga Codex P1 do #518): delta, ktorej scalenie konczy sie MERGE_BUSY (blokada pacjenta zajeta dluzej niz limit), nie moze zostac potwierdzona. Dotad catch{} ja polykal, a Yt i tak przesuwal kursor na headSeq — zmiany z tej delty nie bylo, dopoki nadawca nie wyslal pelnego stanu. Teraz MERGE_BUSY konczy partie (bez 30 s na kazda kolejna delte), Bsp=prawda, a Yt nie przesuwa kursora: nastepne pobranie stosuje partie od nowa (scalanie jest odporne na powtorzenie). Inne bledy jak dotad: zla delta nie blokuje kolejki. */var Bsp=!1;async function wt(t,e){PatientClinicalRequireLegacy("apply-sync-delta");Bsp=!1;/* P-SYNC-KURSOR (przeglad adwersarza; plan: kursor := max zastosowanego): zablokowany sejf nie stosuje delt (applyEncryptedDelta oddaje null albo zwykly blad), a drenaz idzie w tle po pobraniu. Gdy sejf zablokuje sie w trakcie partii, partia konczy sie jak przy MERGE_BUSY i kursor stoi; po odblokowaniu nastepne pobranie stosuje ja od nowa. */var Bul=function(){return typeof e.isUnlocked=="function"&&!e.isUnlocked()};for(var a=!1,r=0;r<t.length;r++){if(Bul()){Bsp=!0;break}var n=t[r];if(!(!n||!n.payload))try{PatientClinicalRequireLegacy("apply-sync-delta");var i=await e.applyEncryptedDelta(n.payload);PatientClinicalRequireLegacy("apply-sync-delta");i&&((i.addedPatientCount||0)>0||(i.deletedPatientCount||0)>0||(i.addedPatientNoteCount||0)>0||(i.updatedPatientNoteCount||0)>0||(i.deletedPatientNoteCount||0)>0||(i.mergedPatientCount||0)>0||(i.addedNoteCount||0)>0||(i.updatedNoteCount||0)>0||(i.deletedNoteCount||0)>0||(i.addedSnapshotCount||0)>0||(i.updatedSnapshotCount||0)>0||(i.trashedSnapshotCount||0)>0||(i.prunedSnapshotCount||0)>0||(i.addedPatientListCount||0)>0||(i.updatedPatientListCount||0)>0||(i.deletedPatientListCount||0)>0||(i.updatedPreferenceCount||0)>0||(i.addedPasskeyCount||0)>0||(i.removedPasskeyCount||0)>0)&&(a=!0)}catch(Bsd){if(Bsd&&Bsd.patientClinicalUnavailable){Bsp=!0;throw Bsd}if(Bsd&&Bsd.vildaMergeBusy){Bsp=!0;if(typeof Bsd.code=="string"&&(Bsd.code.indexOf("CARE_LINEAGE_")===0||Bsd.code.indexOf("CARE_FORMAT_")===0)&&!Bul())y(k,{operation:"pull",error:Bsd});break}}}!Bsp&&Bul()&&(Bsp=!0);return a}function Et(t){try{typeof o.document<"u"&&o.document.dispatchEvent&&o.document.dispatchEvent(new CustomEvent("vilda:sync-merged",{detail:{source:t},bubbles:!1}))}catch{}}var at=!1;async function B(t,e,a,r){if(!at){at=!0;try{if(!r||typeof r.applyEncryptedDelta!="function")return;Gt()?await Yt(t,e,a,r):await Bt(t,e,a,r)}catch{}finally{at=!1}}}async function Bt(t,e,a,r){var n=await f(a+"/v1/slots/"+t+"/deltas",{method:"GET",headers:{Authorization:"Bearer "+e}},ct,Btr_LIMIT_STRONY_MS);if(!(!n||!n.ok)){var i=await Btr_json(n),c=i&&Array.isArray(i.deltas)?i.deltas:[];c.length&&await wt(c,r)&&Et("delta-drain")}}async function Yt(t,e,a,r){Bsp=!1;var n=bt(t),i=await f(a+"/v1/slots/"+t+"/changes?since="+n,{method:"GET",headers:{Authorization:"Bearer "+e}},ct,Btr_LIMIT_STRONY_MS);if(!(!i||!i.ok)){var c=await Btr_json(i),l=c&&Array.isArray(c.deltas)?c.deltas:[],s=l.length?await wt(l,r):!1;/* P-SYNC-KURSOR (plan synchronizacji przyrostowej, etap 0): kursor idzie na najwyzszy numer delty, ktora ta partia naprawde zwrocila, a nie na headSeq. Worker v36 nadaje numer w SlotHub przed zapisem delty do R2 (zapis po odpowiedzi, w waitUntil), a blad listy R2 daje pusta liste z biezacym headSeq. Dotad kursor przeskakiwal wtedy na headSeq i delt, ktorych jeszcze nie bylo w dzienniku, nikt juz nie pobieral. Teraz nastepne pobranie pyta od ostatniej zwroconej. Luka u dolu (dziennik przyciety: 200 delt, 3 dni) nie zatrzymuje kursora; tresc takiej delty przychodzi z pelna wysylka nadawcy, ktora Y() pobiera po zmianie ETagu. MERGE_BUSY jak dotad: kursor stoi. */for(var Bkm=n,Bki=0;Bki<l.length;Bki++){var Bks=l[Bki]&&l[Bki].seq;typeof Bks=="number"&&isFinite(Bks)&&Bks>Bkm&&(Bkm=Bks)}PatientClinicalRequireLegacy("sync-cursor");Bkm>n&&!Bsp&&Kt(t,Bkm),s&&Et("changes-drain")}}/* P-NOWE-URZADZENIE (decyzja wlasciciela 2026-10-12, etap 2): postep pierwszego pobrania na nowym urzadzeniu. Blob czytany strumieniem (body.getReader) zamiast arrayBuffer(): zdarzenie vilda:sync-download-progress {phase:"download",loaded,total} co najmniej co 100 ms i na koniec, potem {phase:"decrypt"} przed odszyfrowaniem; postep scalania pacjentow idzie jak dotad (vilda:vault-merge-progress). total: Content-Length odpowiedzi, a bez niego size z /status. Limit czasu f() konczy sie z naglowkami odpowiedzi, wiec samo cialo bloba nie mialo dotad zadnego limitu - zerwane polaczenie potrafilo wisiec bez konca, a ekran pobierania blokuje aplikacje. Teraz brak kolejnej porcji przez Mt (30 s) przerywa czytanie bledem TIMEOUT (z loaded i total). Bez strumieni: arrayBuffer() jak dotad i jedno zdarzenie po pobraniu. Bajty, odszyfrowanie, rozpakowanie i scalanie bez zmian. */function Bnd_zglos(t){try{typeof o.document<"u"&&o.document.dispatchEvent&&o.document.dispatchEvent(new CustomEvent("vilda:sync-download-progress",{detail:t,bubbles:!1}))}catch{}}function Bnd_mb(t){return t>=1048576?(t/1048576).toFixed(1)+" MB":Math.ceil(t/1024)+" kB"}function Bnd_krok(t,e,a){return new Promise(function(r,n){var i=setTimeout(function(){try{t.cancel().catch(function(){})}catch{}var c=new Error("VildaSync: timeout pobierania danych — brak postępu przez "+Math.round(Mt/1e3)+" s (pobrano "+Bnd_mb(e)+(a>0?" z "+Bnd_mb(a):"")+").");c.code="TIMEOUT",c.loaded=e,c.total=a,n(c)},Mt);t.read().then(function(c){clearTimeout(i),r(c)},function(c){clearTimeout(i),n(c)})})}async function Bnd_czytaj(t,e){var a;try{a=parseInt(t.headers.get("Content-Length"),10)||0}catch{a=0}a>0||(a=typeof e=="number"&&e>0?e:0);var r;try{r=t.body&&typeof t.body.getReader=="function"?t.body.getReader():null}catch{r=null}if(!r){var n=await t.arrayBuffer();return Bnd_zglos({phase:"download",loaded:n.byteLength,total:a>n.byteLength?a:n.byteLength}),n}var i=[],c=0,l=0;Bnd_zglos({phase:"download",loaded:0,total:a});for(;;){var d=await Bnd_krok(r,c,a);if(d.done)break;var S=d.value;if(!S||!S.byteLength)continue;i.push(S),c+=S.byteLength;var w=Date.now();w-l>=100&&(l=w,Bnd_zglos({phase:"download",loaded:c,total:a>c?a:c}))}Bnd_zglos({phase:"download",loaded:c,total:a>c?a:c});var h=new Uint8Array(c),D=0;for(var _=0;_<i.length;_++)h.set(i[_],D),D+=i[_].byteLength;return h.buffer}/* P-NOWE-URZADZENIE (etap 2, czerwony E2E odlamek 1/3 w CI #652): pierwsze pobranie danych na nowe urzadzenie ma wylacznosc. Wlacza ono synchronizacje od razu, wiec w trakcie (przy duzym blobie - minuty) inne wywolania pobieraly ten sam blob rownolegle: arkusz przypomnien 3 s po odblokowaniu (vilda_auth_ui.js wola syncPull z pominieciem flagi integracji) i panele powloki ladowane w tle (Start, Terminarz - pullNow w swojej ramce). Zmierzone w e2e: cztery rownolegle pobrania tego samego bloba, a zdarzenia postepu dwoch pobran w jednym dokumencie przeplataly sie na pasku okna. Teraz syncPull({pierwszePobranie:true}) (pullForNewDevice w vilda_sync_integration.js) trzyma blokade Web Locks w trybie wylacznym, a kazde inne pobranie (takze w syncFull, w wysylce i w restorePrevBlob) najpierw bierze i od razu zwalnia blokade wspoldzielona - czeka wiec tylko na trwajace pierwsze pobranie, we wszystkich ramkach i kartach tego profilu. Po nim widzi zapisany ETag i konczy sie "up-to-date" bez bloba. Zwykle pobrania nie czekaja na siebie nawzajem, jak dotad. Bez Web Locks (starsze przegladarki) albo przy bledzie blokady wylacznosc obejmuje sam dokument. */var Bpw_N="vilda-sync-pierwsze-pobranie-v1",Bpw_w=null;function Bpw_lk(){try{var t=o.navigator&&o.navigator.locks;return t&&typeof t.request=="function"?t:null}catch{return null}}function Bpw_wylacznie(t){var e=Bpw_lk(),a=!1,r=function(){return a=!0,t()},n=e?Promise.resolve().then(function(){return e.request(Bpw_N,{mode:"exclusive"},r)}).catch(function(l){if(a)throw l;return t()}):r(),i=Promise.resolve(n);Bpw_w=i;var c=function(){Bpw_w===i&&(Bpw_w=null)};return i.then(c,c),i}function Bpw_bariera(t){var e=Bpw_w?Bpw_w.then(function(){},function(){}):Promise.resolve();return t?e.then(function(){return t.request(Bpw_N,{mode:"shared"},function(){})}).then(function(){},function(){}):e}/* Care-plan records written by a client predating careContext can share the
 * current cloud ETag while lacking the encrypted workflow. Replay that blob
 * once per account/ETag when the vault detects a gap. Keep failures retryable
 * and share an in-flight repair in this document; ordinary pulls stay cheap. */
var CareSyncReplays = new Map();
var CareSyncNoGaps = new Map(), CareSyncObserved = new WeakSet(), CareSyncScanGeneration = 0;
function CareSyncObserve(vault) {
  if (CareSyncObserved.has(vault)) return;
  CareSyncObserved.add(vault);
  const changed = function () { CareSyncNoGaps.clear(); CareSyncScanGeneration += 1; };
  ['onPatientNoteChanged', 'onLock', 'onUnlock'].forEach(function (method) {
    if (typeof vault[method] === 'function') vault[method](changed);
  });
}
async function CareSyncReplay(vault, slotId, etag) {
  if (!etag || typeof vault.needsCarePlanSyncRepair !== 'function' || typeof vault.getCurrentUser !== 'function') return null;
  const user = vault.getCurrentUser();
  if (!user || !user.userId) return null;
  const assertCurrent = function () {
    const current = vault.getCurrentUser();
    if (!vault.isUnlocked() || !current || current.userId !== user.userId) throw u('VildaSync: konto zmieniło się podczas sprawdzania planów.', 'VAULT_LOCKED');
  };
  const key = JSON.stringify([user.userId, slotId]);
  CareSyncObserve(vault);
  if (CareSyncNoGaps.get(key) === etag) return null;
  const prior = CareSyncReplays.get(key);
  if (prior && prior.etag === etag) {
    const succeeded = prior.pending ? await prior.pending : true;
    assertCurrent();
    if (!succeeded) return CareSyncReplay(vault, slotId, etag);
    return null;
  }
  const scanGeneration = CareSyncScanGeneration;
  const needsRepair = await vault.needsCarePlanSyncRepair();
  assertCurrent();
  if (!needsRepair) {
    if (scanGeneration === CareSyncScanGeneration) CareSyncNoGaps.set(key, etag);
    return null;
  }
  const raced = CareSyncReplays.get(key);
  if (raced && raced.etag === etag) {
    const succeeded = raced.pending ? await raced.pending : true;
    assertCurrent();
    if (!succeeded) return CareSyncReplay(vault, slotId, etag);
    return null;
  }
  let finish;
  const pending = new Promise(function (resolve) { finish = resolve; });
  const ticket = { key, etag, pending, finish };
  CareSyncReplays.set(key, ticket);
  return ticket;
}
function CareSyncReplayDone(ticket, succeeded) {
  if (!ticket) return;
  if (!succeeded && CareSyncReplays.get(ticket.key) === ticket) CareSyncReplays.delete(ticket.key);
  ticket.pending = null;
  ticket.finish(succeeded);
}
function Y(t){var PatientClinicalRejection=PatientClinicalRejected("sync-pull");if(PatientClinicalRejection)return PatientClinicalRejection;if(t&&t.pierwszePobranie===!0)return Bpw_wylacznie(Bpw_pull);var e=Bpw_lk();return!Bpw_w&&!e?Bpw_pull():Bpw_bariera(e).then(Bpw_pull)}
/* P-SESJA-ZAPISU: pelne pobranie konczy sie w sesji konta, ktorego materialem pobrano blob (liczy sie konto, nie klucz).
   Konto sprawdzane po odpowiedzi /status (przed zapisem stanu slotu i przed GET /blob), po sprawdzeniu pustej bazy (Vt),
   po odpowiedzi GET /blob (takze 304 i 404) i przed scaleniem: inne konto albo sejf zablokowany — SESSION_CHANGED, stan
   slotu bez zmian.
   Drenaz delt slotu tylko w sesji tego konta: rusza tylko przy tym samym koncie, a drenaz dostaje sejf, ktory przy
   zalogowanym innym koncie zachowuje sie jak zablokowany (Bpw_sejfKonta) — wt konczy partie przed kazda delta i po
   ostatniej, Yt nie przesuwa kursora slotu (jak przy blokadzie w trakcie partii, np. w czasie /changes). Sejf bez
   getCurrentUser (atrapy) — bez sprawdzenia. */
function Bpw_konto(t){if(!t||typeof t.getCurrentUser!="function")return void 0;try{var k=t.getCurrentUser();return k&&k.userId||null}catch(x){return null}}
function Bpw_inneKonto(t,kto){return Bpw_konto(t)!==kto}
function Bpw_przerwane(){return u("VildaSync: pobieranie przerwane \u2014 w trakcie zablokowano sejf albo prze\u0142\u0105czono konto. Nic nie scalono.","SESSION_CHANGED")}
function Bpw_sejfKonta(t,kto){if(!t||typeof t.applyEncryptedDelta!="function")return t;return{isUnlocked:function(){return!(typeof t.isUnlocked=="function"&&!t.isUnlocked())&&!Bpw_inneKonto(t,kto)},applyEncryptedDelta:function(x){return t.applyEncryptedDelta(x)},zdarzenia:t._eventLog||null}}
function Bpw_dren(a,r,i,t,kto,Bdz_w){if(Bpw_inneKonto(t,kto))return;var Bdz_s=Bpw_sejfKonta(t,kto),Bdz_p=Bdz_wlaczone()?Bze_isEventLogEnabled()?Bns_cykl(a,r,i,Bdz_s):Bdz_B(a,r,i,Bdz_s):B(a,r,i,Bdz_s).catch(function(){});Bdz_w&&typeof Bdz_w=="object"&&Bdz_wyniki.set(Bdz_w,Bdz_p)}
/* P-SYNC-ZDARZENIA (E2-PR4b; plan docs/SYNC_PRZYROSTOWA_PLAN.md 3.2 "Petla wysylki", wiersz 8b): wysylka zdarzen
   dziennika (POST /v1/slots/<slot>/events) i wlacznik dziennika. USPIONE: kod produkcyjny nie wola pushEvents (nadawca
   dochodzi w E2-PR4d), a wlacznik jest otwarty tylko przy "events" w health i fladze vilda-event-log-v1 = "1".
   isEventLogEnabled(): najpierw ostatni wynik GET /v1/health tej strony w pamieci (Bdz_api, bez magazynu): bez "events"
   koniec bez zadnego odczytu; dopiero potem flaga (dokladnie "1") i Bdz_wlaczone() (pobieranie stronami, "Komputer
   prywatny", nie chmurowy, nie jednorazowy; korzysta z Bdz_ nizej). Sejf czyta ten wlacznik w bramce kolejki.
   pushEvents(events): partia 1-200 zdarzen {eid (UUID v4 malymi literami), iv, data}, cialo do 1 MiB; na serwer idzie
   dokladnie {eid, iv, data} (bez z i aad, plan 3.1). Nigdy nie rzuca: wynik {ok:true, accepted, rejected, headSeq, ts}
   albo {ok:false, powod, kod?, http?, retryAfterMs?}. Bez zadania: zle wejscie ('argument'), wylaczony dziennik
   ('wylaczone'), trwajace wysylanie w tym dokumencie ('w-locie'), pauza po 429 ze wspolnego klucza
   vilda-sync-rl-until-v1 ('pauza', RATE_LIMITED), zablokowany sejf ('zablokowany'), slot niezarejestrowany
   ('niezarejestrowany'), trasa formatu klinicznego inna niz legacy ('format', przed tozsamoscia i zadaniem, jak inne
   operacje synchronizacji). Limit 30 s takze na tresc odpowiedzi (Btr_json). Zmiana sesji (blokada albo inne konto) przed
   wyslaniem albo w trakcie: 'sesja' bez skutkow ubocznych. Odpowiedzi: 200 (ksztalt sprawdzony, inaczej 'odpowiedz');
   429 - odstep z Retry-After albo retryAfterSeconds (1-300 s, jak Bdz_odstep429) do vilda-sync-rl-until-v1 (najdalszy
   termin wygrywa; ten sam klucz pauzy co pelna wysylka); 401 - stan slotu wyczyszczony jak przy innych 401
   (AUTH_FAILED); 404 - zdarzenia wylaczone na serwerze: "events" zdjete z pamieci health tej strony (wlacznik zamkniety
   do nastepnego health); 413, 415, 400 (kod z ciala), 507 log_full, 5xx; siec i TIMEOUT; odmowa formatu klinicznego
   'format'; nieoczekiwany wyjatek 'blad'. ts z odpowiedzi 200 rozni sie od Date.now() o wiecej niz 60 s: vilda:sync-clock-skew (Qcs) ze zrodlem
   'server'. Bez onSyncStart/Complete/Error i bez sladow: zdecyduje nadawca (E2-PR4d), on tez sprawdza wlaczona
   synchronizacje. Tabela: ALGORITHMS P-SYNC-ZDARZENIA. */
var Bze_KLUCZ = 'vilda-event-log-v1', Bze_RL_KLUCZ = 'vilda-sync-rl-until-v1';
var Bze_LIMIT_MS = 3e4, Bze_ZEGAR_MS = 6e4, Bze_MAX_ZDARZEN = 200, Bze_MAX_BAJTOW = 1048576;
var Bze_EID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
var Bze_wLocie = !1; // trwajace pushEvents w tym dokumencie (jedno zadanie w locie)
function Bze_isEventLogEnabled() {
  try {
    if (!Bns_gora()) { // P-SYNC-NADAWCA: ramka — wlacznik okna nadrzednego (ta sama domena), bez wlasnego health
      var g = o.top && o.top.VildaSync;
      return !!g && g !== o.VildaSync && typeof g.isEventLogEnabled == 'function' && g.isEventLogEnabled() === true;
    }
    if (!Bdz_ma(Bdz_api[j()], 'events')) return false;
    if (!(o.localStorage && o.localStorage.getItem(Bze_KLUCZ) === '1')) return false;
    return Bdz_wlaczone();
  } catch (x) { return false; }
}
function Bze_odmowa(powod, kod, x) {
  var w = { ok: false, powod: powod };
  if (kod) w.kod = kod;
  return x ? Object.assign(w, x) : w;
}
/* Partia na serwer albo null (zle wejscie): tylko eid, iv i data; rozmiar ciala w bajtach UTF-8. */
function Bze_partia(events) {
  if (!Array.isArray(events) || events.length < 1 || events.length > Bze_MAX_ZDARZEN) return null;
  var out = [], eidy = Object.create(null);
  for (var i = 0; i < events.length; i++) {
    var e = events[i];
    if (!e || typeof e != 'object' || typeof e.eid != 'string' || !Bze_EID.test(e.eid) || eidy[e.eid]) return null;
    if (typeof e.iv != 'string' || e.iv.length < 1 || e.iv.length > 64 || typeof e.data != 'string') return null;
    eidy[e.eid] = !0;
    out.push({ eid: e.eid, iv: e.iv, data: e.data });
  }
  var cialo = JSON.stringify({ events: out });
  if (new TextEncoder().encode(cialo).byteLength > Bze_MAX_BAJTOW) return null;
  return { cialo: cialo, eidy: eidy };
}
function Bze_pauzaMs() {
  try {
    var t = Number(o.localStorage && o.localStorage.getItem(Bze_RL_KLUCZ)) || 0, r = t - Date.now();
    return r > 0 ? r : 0;
  } catch (x) { return 0; }
}
function Bze_ustawPauze(ms) {
  try {
    var t = Date.now() + ms, b = Number(o.localStorage && o.localStorage.getItem(Bze_RL_KLUCZ)) || 0;
    o.localStorage && t > b && o.localStorage.setItem(Bze_RL_KLUCZ, String(t));
  } catch (x) {}
}
function Bze_bezZdarzen(url) {
  var a = Bdz_api[url];
  if (a && Array.isArray(a.features)) a.features = a.features.filter(function (x) { return x !== 'events'; });
}
/* Odpowiedz 200: accepted [{eid, seq, dup}] i rejected [{eid, code}] tylko z eid tej partii, headSeq, ts; inaczej null. */
function Bze_odpowiedz(c, eidy) {
  if (!c || typeof c != 'object' || !Array.isArray(c.accepted) || !Array.isArray(c.rejected)) return null;
  if (!Number.isSafeInteger(c.headSeq) || c.headSeq < 0 || typeof c.ts != 'number' || !isFinite(c.ts)) return null;
  var acc = [], rej = [];
  for (var i = 0; i < c.accepted.length; i++) {
    var a = c.accepted[i];
    if (!a || typeof a.eid != 'string' || !eidy[a.eid] || !Number.isSafeInteger(a.seq) || a.seq < 1 || typeof a.dup != 'boolean') return null;
    acc.push({ eid: a.eid, seq: a.seq, dup: a.dup });
  }
  for (var k = 0; k < c.rejected.length; k++) {
    var r = c.rejected[k];
    if (!r || typeof r.eid != 'string' || !eidy[r.eid] || typeof r.code != 'string' || !r.code) return null;
    rej.push({ eid: r.eid, code: r.code });
  }
  return { ok: true, accepted: acc, rejected: rej, headSeq: c.headSeq, ts: c.ts };
}
function Bze_zegar(ts) {
  var d = ts - Date.now();
  if (Math.abs(d) > Bze_ZEGAR_MS) {
    Qcs({ offsetMs: d, thresholdMs: Bze_ZEGAR_MS, warn: !0, source: 'server', serverTsISO: new Date(ts).toISOString() });
  }
}
async function Bze_pushEvents(events) {
  var p = Bze_partia(events);
  if (!p) return Bze_odmowa('argument');
  if (!Bze_isEventLogEnabled()) return Bze_odmowa('wylaczone');
  if (Bze_wLocie) return Bze_odmowa('w-locie');
  var pz = Bze_pauzaMs();
  if (pz > 0) return Bze_odmowa('pauza', 'RATE_LIMITED', { retryAfterMs: pz });
  if (PatientClinicalRouteFailure('sync-events')) return Bze_odmowa('format');
  Bze_wLocie = !0;
  try {
    var t, kto, mat;
    try { t = I(); kto = Bpw_konto(t); mat = await t.getSyncMaterial(); } catch (x) { return Bze_odmowa('zablokowany'); }
    if (Bpw_inneKonto(t, kto) || !t.isUnlocked()) return Bze_odmowa('sesja');
    var slot = mat && mat.slotId, url = j();
    if (typeof slot != 'string' || !slot || !m(slot).registered) return Bze_odmowa('niezarejestrowany');
    var odp;
    try {
      odp = await f(url + '/v1/slots/' + slot + '/events', { method: 'POST',
        headers: { Authorization: 'Bearer ' + mat.authToken, 'Content-Type': 'application/json' }, body: p.cialo }, Bze_LIMIT_MS, Bze_LIMIT_MS);
    } catch (x) {
      if (Bpw_inneKonto(t, kto) || !t.isUnlocked()) return Bze_odmowa('sesja');
      if (x && x.patientClinicalUnavailable) return Bze_odmowa('format');
      return Bze_odmowa('siec', x && x.code === 'TIMEOUT' ? 'TIMEOUT' : 'NETWORK');
    }
    var c = null, cx = null;
    try { c = await Btr_json(odp); } catch (x) { cx = x; }
    if (Bpw_inneKonto(t, kto) || !t.isUnlocked()) return Bze_odmowa('sesja');
    var s = odp.status;
    if (s === 200) {
      if (cx && cx.name === 'SyntaxError') return Bze_odmowa('odpowiedz', 'INVALID_RESPONSE', { http: s });
      if (cx) return Bze_odmowa('siec', cx.code === 'TIMEOUT' ? 'TIMEOUT' : 'NETWORK', { http: s });
      var w = Bze_odpowiedz(c, p.eidy);
      if (!w) return Bze_odmowa('odpowiedz', 'INVALID_RESPONSE', { http: s });
      Bze_zegar(w.ts);
      Bzd_wlasneDopisz(slot, w.accepted);
      return w;
    }
    if (s === 429) {
      var ms = Bdz_odstep429(odp, c);
      Bze_ustawPauze(ms);
      return Bze_odmowa('odmowa', 'RATE_LIMITED', { http: s, retryAfterMs: ms });
    }
    if (s === 401) { C(slot); return Bze_odmowa('odmowa', 'AUTH_FAILED', { http: s }); }
    if (s === 404) { Bze_bezZdarzen(url); return Bze_odmowa('odmowa', 'EVENTS_DISABLED', { http: s }); }
    if (s === 413) return Bze_odmowa('odmowa', 'PAYLOAD_TOO_LARGE', { http: s });
    if (s === 415) return Bze_odmowa('odmowa', 'UNSUPPORTED_MEDIA_TYPE', { http: s });
    if (s === 400) {
      var k400 = c && c.error && typeof c.error.code == 'string' ? c.error.code : null;
      return Bze_odmowa('odmowa', 'INVALID_EVENTS', k400 ? { http: s, code: k400 } : { http: s });
    }
    if (s === 507) return Bze_odmowa('odmowa', 'LOG_FULL', { http: s });
    if (s >= 500) return Bze_odmowa('odmowa', 'SERVER', { http: s });
    return Bze_odmowa('odmowa', 'HTTP', { http: s });
  } catch (x) {
    return Bze_odmowa(x && x.patientClinicalUnavailable ? 'format' : 'blad');
  } finally { Bze_wLocie = !1; }
}
/* P-SYNC-DRENAZ-ZDARZEN (E2-PR4c; plan docs/SYNC_PRZYROSTOWA_PLAN.md 3.3 "drainChanges" kroki 2-5, wiersz 8c; decyzje
   wlasciciela 2026-11-11 nr 5 i 6): drenaz zdarzen dziennika z kwarantanna. USPIONE: wylacznie przy wlaczonym dzienniku
   (Bze_isEventLogEnabled() === true na starcie drenazu stronami); bez dziennika Bdz_drenaz, Bdz_B, Bpw_pull i pushEvents
   jak dotad, bez zadnego odczytu i zapisu z tego bloku poza odczytem wlacznika.
   Wiersz z trescia: eid z pierscienia wlasnych zdarzen (ostatnie 500 przyjete przez pushEvents w tym slocie,
   vilda-sync-own-eids-v1:<slot>) — pominiety bez scalenia, kursor idzie. Inny — applyEncryptedEvent sejfu przez opakowanie
   konta (straznik formatu klinicznego jak w Bdz_zastosuj): applied — zastosowane; unreadable — quarantinePut (wiersz
   /changes: seq, eid, payload; appVersion z SW_VERSION — wiadomosc VILDA_WERSJA przez MessageChannel, raz na dokument,
   2 s, jak P-WERSJA-APLIKACJI; bez odpowiedzi null), kursor idzie; nieudany zapis — stop 'kwarantanna', kursor przed
   wierszem; locked i session-changed — stop 'blokada'; busy — stop 'busy' (kody CARE_* — onSyncError jak w wt);
   apply-error — stop 'zastosowanie', kursor przed wierszem, licznik prob w pamieci dokumentu (decyzja 6 z 2026-10-29).
   Kod SYNC_DB_SCHEMA z dowolnej operacji magazynu: do konca przebiegu bez operacji na bazie kolejki.
   Ponowienie kwarantanny (raz na dokument i slot, przed pierwszym drenazem): wiersz wlasnego eid — usuniety; wiersz
   innego slotu (po rotacji tozsamosci) — jedna proba, potem usuniety; wiersz biezacego slotu z wersja inna niz biezaca
   (znana) — proba rosnaco po seq: applied — usuniety, drenaz rusza od jego numeru (sufiks; kursor tylko w gore), nadal
   nieczytelny — quarantinePut z nowa wersja; inny wynik konczy ponowienia (nastepny drenaz od nowa).
   requiresBase: kursor oldestSeq - 1 i drenaz dalej; cursorAhead: kursor headSeq; dziura: przy pierwszym wykryciu tej
   dziury — kazde z nich zapamietuje wymuszone pelne pobranie (tylko pamiec): nastepne Bpw_pull pobiera GET /blob bez
   If-None-Match, znacznik zdjety po scaleniu albo 404 (decyzja 6 z 2026-11-11; przeskok dziury przy trzecim drenazu
   zostaje). Na koncu drenazu przy otwartym sejfie: appliedUpTo := kursor albo min(kwarantanna slotu) - 1
   (vilda-sync-applied-v1:<slot>, zapis tylko przy zmianie); stop 'head' — markSyncCaughtUp sejfu.
   Jeden drenaz po trwajacym: drugie pobranie tego samego slotu w trakcie drenazu dostaje obietnice jednego drenazu po
   biezacym (kolejne prosby dolaczaja), wiec czekajNaDrenaz siega headSeq z chwili wywolania.
   Slady P-SYNC-SLAD (VildaAuditLog przy odblokowanym sejfie) wylacznie z resultSummary albo liczb: sync.event.unreadable
   (nowy wpis kwarantanny), sync.event.error (pierwsza proba bledu zastosowania), sync.quarantine.failed (powod i kod;
   raz na wiersz i kod), sync.gap (od, do, proby). Operacje kolejki i kwarantanny sprawdzaja sesje tak jak zapis karty
   (P-SESJA-ZAPISU): zmiana sesji w trakcie konczy operacje bez zapisu. Tabela: ALGORITHMS P-SYNC-DRENAZ-ZDARZEN. */
var Bzd_K_WLASNE = 'vilda-sync-own-eids-v1:', Bzd_K_APPLIED = 'vilda-sync-applied-v1:', Bzd_WLASNE_MAX = 500;
var Bzd_WERSJA_MS = 2000, Bzd_WERSJA_WZOR = /^[0-9A-Za-z.+-]{1,32}$/;
var Bzd_wersja = null;                       // obietnica wersji SW (raz na dokument)
var Bzd_sprawdzone = Object.create(null);    // slot -> ponowienie kwarantanny wykonane w tym dokumencie
var Bzd_wymus = Object.create(null);         // slot -> powod wymuszonego pelnego pobrania ('base', 'ahead', 'dziura')
var Bzd_proby = Object.create(null);         // slot -> { seq, proby } bledu zastosowania
var Bzd_ostBlad = Object.create(null);       // slot -> 'seq:kod' ostatniego sladu nieudanego zapisu kwarantanny
var Bzd_stan = new WeakMap();                // wynik drenazu -> { wlasne: Set, bezBazy }
var Bzd_nastepny = null, Bzd_nastepnySlot = null, Bzd_nastepnyArg = null; // jeden drenaz po trwajacym
function Bzd_wlasneCzytaj(t) {
  try {
    var s = o.localStorage && o.localStorage.getItem(Bzd_K_WLASNE + t), l = s ? JSON.parse(s) : [];
    return new Set(Array.isArray(l) ? l.filter(function (x) { return typeof x == 'string' && Bze_EID.test(x); }) : []);
  } catch (x) { return new Set(); }
}
/* pushEvents przy 200 (tylko z dziennikiem): eid przyjetych (takze dup) na koniec pierscienia, bez powtorzen, 500 ostatnich. */
function Bzd_wlasneDopisz(t, przyjete) {
  try {
    if (!o.localStorage || typeof t != 'string' || !t) return;
    var s = o.localStorage.getItem(Bzd_K_WLASNE + t), l = [];
    try { l = s ? JSON.parse(s) : []; } catch (x) { l = []; }
    if (!Array.isArray(l)) l = [];
    var jest = new Set(l);
    for (var i = 0; i < przyjete.length; i++) {
      var e = przyjete[i] && przyjete[i].eid;
      if (typeof e == 'string' && Bze_EID.test(e) && !jest.has(e)) { l.push(e); jest.add(e); }
    }
    if (l.length > Bzd_WLASNE_MAX) l = l.slice(l.length - Bzd_WLASNE_MAX);
    o.localStorage.setItem(Bzd_K_WLASNE + t, JSON.stringify(l));
  } catch (x) { /* bez pierscienia: wlasne zdarzenia scalane jak cudze (scalanie idempotentne) */ }
}
function Bzd_zapytajWersje() {
  if (Bzd_wersja) return Bzd_wersja;
  Bzd_wersja = new Promise(function (gotowe) {
    var kanal = null, zegar = null, koniec = !1;
    function zakoncz(v) {
      if (koniec) return;
      koniec = !0;
      if (zegar !== null) try { o.clearTimeout(zegar); } catch (x) {}
      try { kanal.port1.onmessage = null; kanal.port1.close(); } catch (x) {}
      gotowe(v);
    }
    try {
      var n = o.navigator, sw = n && n.serviceWorker && n.serviceWorker.controller;
      if (!sw || typeof sw.postMessage != 'function' || typeof o.MessageChannel != 'function') { zakoncz(null); return; }
      kanal = new o.MessageChannel();
      kanal.port1.onmessage = function (ev) {
        var d = ev && ev.data;
        zakoncz(d && d.type === 'VILDA_WERSJA' && typeof d.wersja == 'string' && Bzd_WERSJA_WZOR.test(d.wersja) ? d.wersja : null);
      };
      zegar = o.setTimeout(function () { zakoncz(null); }, Bzd_WERSJA_MS);
      sw.postMessage({ type: 'VILDA_WERSJA' }, [kanal.port2]);
    } catch (x) { zakoncz(null); }
  });
  return Bzd_wersja;
}
function Bzd_slad(typ, dane) {
  try {
    var v = o.VildaVault, a = o.VildaAuditLog;
    if (!v || typeof v.isUnlocked != 'function' || !v.isUnlocked() || !a || typeof a.log != 'function') return;
    Promise.resolve(a.log(typ, dane)).then(null, function () {});
  } catch (x) {}
}
function Bzd_skrot(r, wynik) {
  try { return r.zdarzenia.resultSummary(wynik); } catch (x) { return { status: 'unknown' }; }
}
/* Wynik operacji magazynu: SYNC_DB_SCHEMA — do konca przebiegu bez operacji na bazie. */
function Bzd_baza(w, x) {
  var st = Bzd_stan.get(w);
  if (st && x && x.ok === false && x.code === 'SYNC_DB_SCHEMA') st.bezBazy = !0;
  return !!(x && x.ok === !0);
}
function Bzd_bezBazy(w) { var st = Bzd_stan.get(w); return !!(st && st.bezBazy); }
function Bzd_wymusPobranie(t, w, powod) { Bzd_wymus[t] = powod; w.wymus = powod; }
function Bzd_wymusCzytaj(t) { return typeof t == 'string' && Bzd_wymus[t] ? Bzd_wymus[t] : null; }
function Bzd_wymusZdejmij(t) { if (typeof t == 'string') delete Bzd_wymus[t]; }
function Bzd_czyWlasny(w, d) { var st = Bzd_stan.get(w); return !!(st && typeof d.eid == 'string' && st.wlasne.has(d.eid)); }
/* Zastosowanie wiersza z trescia przy dzienniku: 'zmiana' | 'ok' | 'nieczytelne' | 'kwarantanna' | 'zastosowanie' |
   'busy' | 'blokada'. Straznik formatu klinicznego przed i po wywolaniu (jego blad leci dalej: stop 'format'). */
async function Bzd_zastosuj(t, d, r, w) {
  if (!Bdz_otwarty(r)) return 'blokada';
  var L = r.zdarzenia, x;
  if (!L || typeof L.applyEncryptedEvent != 'function') return 'blokada';
  PatientClinicalRequireLegacy('apply-sync-delta');
  x = await L.applyEncryptedEvent(d.payload);
  PatientClinicalRequireLegacy('apply-sync-delta');
  if (!Bdz_otwarty(r)) return 'blokada';
  var st = x && x.status, pr = Bzd_proby[t];
  if (st !== 'apply-error' && pr && pr.seq === d.seq) delete Bzd_proby[t];
  if (st === 'applied') return Bdz_czyZmiana(x.result) ? 'zmiana' : 'ok';
  if (st === 'unreadable') return await Bzd_doKwarantanny(t, d, x, r, w) ? 'nieczytelne' : 'kwarantanna';
  if (st === 'busy') {
    var kod = typeof x.code == 'string' ? x.code : '';
    if (kod.indexOf('CARE_LINEAGE_') === 0 || kod.indexOf('CARE_FORMAT_') === 0) y(k, { operation: 'pull', error: u('VildaSync: scalenie zdarzenia odrzucone (' + kod + ').', kod) });
    return 'busy';
  }
  if (st === 'apply-error') {
    var n = pr && pr.seq === d.seq ? pr.proby + 1 : 1;
    Bzd_proby[t] = { seq: d.seq, proby: n };
    w.proby = n;
    w.kod = typeof x.code == 'string' ? x.code : null;
    if (n === 1) Bzd_slad('sync.event.error', Bzd_skrot(r, x));
    return 'zastosowanie';
  }
  return 'blokada'; // locked, session-changed i nieznany status: bez zapisu kursora z tej strony
}
async function Bzd_doKwarantanny(t, d, x, r, w) {
  var q;
  if (Bzd_bezBazy(w)) q = { ok: !1, powod: 'blad', code: 'SYNC_DB_SCHEMA' };
  else {
    var wersja = await Bzd_zapytajWersje();
    if (!Bdz_otwarty(r)) return !1;
    q = await r.zdarzenia.quarantinePut({ seq: d.seq, eid: d.eid, payload: d.payload }, x, { slotId: t, appVersion: wersja });
    Bzd_baza(w, q);
  }
  if (!Bdz_otwarty(r)) return !1;
  if (q && q.ok === !0) {
    delete Bzd_ostBlad[t];
    if (q.nowy === !0) { w.kwarantanna += 1; Bzd_slad('sync.event.unreadable', Bzd_skrot(r, x)); }
    return !0;
  }
  var powod = q && typeof q.powod == 'string' ? q.powod : 'blad', code = q && typeof q.code == 'string' ? q.code : null;
  w.kod = code;
  var klucz = d.seq + ':' + powod + ':' + code;
  if (Bzd_ostBlad[t] !== klucz) { Bzd_ostBlad[t] = klucz; Bzd_slad('sync.quarantine.failed', code ? { powod: powod, code: code } : { powod: powod }); }
  return !1;
}
function Bzd_koperta(q) {
  var env = { iv: q.iv, data: q.data };
  if (q.z !== undefined) env.z = q.z;
  if (q.aad !== undefined) env.aad = q.aad;
  return env;
}
/* Ponowienie kwarantanny (raz na dokument i slot). Wynik: najmniejszy seq biezacego slotu po udanym ponowieniu
   (start sufiksu) albo null. */
async function Bzd_ponow(t, r, w) {
  if (Bzd_sprawdzone[t]) return null;
  var L = r.zdarzenia, st = Bzd_stan.get(w);
  var lista = await L.quarantineList();
  if (!Bdz_otwarty(r) || !Bzd_baza(w, lista)) return null;
  var wiersze = (Array.isArray(lista.wiersze) ? lista.wiersze : []).filter(function (q) {
    return q && typeof q.slotId == 'string' && Number.isSafeInteger(q.seq);
  }).sort(function (a, b) { return a.slotId < b.slotId ? -1 : a.slotId > b.slotId ? 1 : a.seq - b.seq; });
  var wersja = wiersze.length ? await Bzd_zapytajWersje() : null, od = null;
  if (!Bdz_otwarty(r)) return null;
  for (var i = 0; i < wiersze.length; i++) {
    var q = wiersze[i], biez = q.slotId === t;
    if (typeof q.eid == 'string' && st.wlasne.has(q.eid)) {
      if (!Bzd_baza(w, await L.quarantineRelease([q.seq], { slotId: q.slotId })) || !Bdz_otwarty(r)) return od;
      w.wlasneWKwarantannie += 1;
      continue;
    }
    if (biez && (wersja === null || q.appVersion === wersja)) continue;
    var env = Bzd_koperta(q);
    PatientClinicalRequireLegacy('apply-sync-delta');
    var x = await L.applyEncryptedEvent(env);
    PatientClinicalRequireLegacy('apply-sync-delta');
    if (!Bdz_otwarty(r)) return od;
    var s = x && x.status;
    if (s === 'applied' && Bdz_czyZmiana(x.result)) w.zmiana = !0;
    if (!biez) {
      if (s !== 'applied' && s !== 'unreadable' && s !== 'apply-error') return od;
      if (!Bzd_baza(w, await L.quarantineRelease([q.seq], { slotId: q.slotId })) || !Bdz_otwarty(r)) return od;
      w.innySlot += 1;
      continue;
    }
    if (s === 'applied') {
      if (!Bzd_baza(w, await L.quarantineRelease([q.seq], { slotId: t })) || !Bdz_otwarty(r)) return od;
      w.ponowione += 1;
      if (od === null || q.seq < od) od = q.seq;
      continue;
    }
    if (s !== 'unreadable') return od;
    if (!Bzd_baza(w, await L.quarantinePut({ seq: q.seq, eid: q.eid, payload: env }, x, { slotId: t, appVersion: wersja })) || !Bdz_otwarty(r)) return od;
  }
  Bzd_sprawdzone[t] = !0;
  return od;
}
/* Koniec drenazu przy otwartym sejfie: appliedUpTo, a przy stop 'head' — markSyncCaughtUp. */
async function Bzd_poDrenazu(t, r, w) {
  if (!Bdz_otwarty(r) || w.stop === 'format') return;
  var L = r.zdarzenia, v = bt(t);
  if (!Bzd_bezBazy(w)) {
    var mn = await L.quarantineMinSeq({ slotId: t });
    if (!Bdz_otwarty(r)) return;
    if (Bzd_baza(w, mn)) {
      if (Number.isSafeInteger(mn.seq) && mn.seq - 1 < v) v = mn.seq - 1;
      w.appliedUpTo = v;
      try {
        if (o.localStorage && o.localStorage.getItem(Bzd_K_APPLIED + t) !== String(v)) o.localStorage.setItem(Bzd_K_APPLIED + t, String(v));
      } catch (x) {}
    }
  }
  if (w.stop === 'head' && typeof L.markSyncCaughtUp == 'function') await L.markSyncCaughtUp(); // metadane konta, nie baza kolejki
}
/* Drenaz stronami przy dzienniku: pola wyniku, pierscien, ponowienie kwarantanny (sufiks), Bdz_drenaz, koniec. */
async function Bzd_drenaz(t, e, a, r, n, w) {
  w.dziennik = !0;
  w.wlasne = 0; w.kwarantanna = 0; w.ponowione = 0; w.innySlot = 0; w.wlasneWKwarantannie = 0;
  w.wymus = null; w.proby = null; w.appliedUpTo = null;
  Bzd_stan.set(w, { wlasne: Bzd_wlasneCzytaj(t), bezBazy: !1 });
  if (!r.zdarzenia) { w.stop = 'blokada'; return; }
  var od = await Bzd_ponow(t, r, w);
  if (!Bdz_otwarty(r)) { w.stop = 'blokada'; return; }
  await Bdz_drenaz(t, e, a, r, od !== null && od < n ? od : n, w);
  await Bzd_poDrenazu(t, r, w);
}
/* Drugie pobranie tego samego slotu w trakcie drenazu (dziennik): jeden drenaz po biezacym, z argumentami ostatniej prosby. */
function Bzd_poTrwajacym(t, e, a, r) {
  Bzd_nastepnyArg = [t, e, a, r];
  if (Bzd_nastepny && Bzd_nastepnySlot === t) return Bzd_nastepny;
  var p = Bdz_trwa.then(function () {
    var g = Bzd_nastepnyArg;
    if (Bzd_nastepny === p) { Bzd_nastepny = null; Bzd_nastepnySlot = null; Bzd_nastepnyArg = null; }
    return g ? Bdz_B(g[0], g[1], g[2], g[3]) : null;
  });
  Bzd_nastepny = p;
  Bzd_nastepnySlot = t;
  return p;
}
/* P-SYNC-NADAWCA (E2-PR4d; plan docs/SYNC_PRZYROSTOWA_PLAN.md 3.2 "Nadawca", "Petla wysylki", "Chowanie", wiersz 8d;
   decyzje wlasciciela 2026-11-11 nr 3 i 5): nadawca kolejki zdarzen. USPIONE: nic nie rusza bez wlaczonego dziennika
   (Bze_isEventLogEnabled); sluchacze, zegar bicia serca i kanal powstaja dopiero przy pierwszym uzyciu z dziennikiem
   (Bns_aktywuj). Bez dziennika flushOutbox, scheduleFlush i flushKeepalive oddaja { ok: false, powod: 'wylaczone' }.
   Jeden nadawca na konto w przegladarce: tylko dokument najwyzszego poziomu; ramka tylko dopisuje (wlacznik z okna
   nadrzednego) i pinguje {type:'outbox'} przez kanal vilda-sync-data. Rola: bicie serca
   vilda-outbox-heartbeat-v1:<userId> = {d: dokument, t: ms} co 20 s; bicie innego dokumentu mlodsze niz 90 s = inny
   nadawca; starsze — przejecie (Web Lock ze steal). Web Lock vilda-outbox-sender:<userId> na kazda partie (ifAvailable;
   kolejnosc blokad: nadawca, potem wspoldzielona blokada bazy w operacjach kolejki; nigdy wylaczna bazy pod nadawca).
   flushOutbox: warunki (dziennik, synchronizacja wlaczona, sejf odblokowany, tryb konta z wpisu rejestru = lokalny,
   brak zatrzymania po 401 do odblokowania, brak odstepu po bledzie, budzet 20 zadan /events na 60 s, rola), potem
   partie: outboxTake (200, 1 MiB; czekaNaWLocie bez wlasnego zadania — outboxRequeueStale i drugi odczyt),
   pushEvents, wynik: 200 — outboxAccept, outboxReject partia, wiersze bez odpowiedzi z powrotem (bez proby), slad
   sync.push.ok {rows, bytes, seq}, nastepna partia tylko po pelnej; 429 — bez proby, wysylka po koncu pauzy; 401 — bez
   proby, zatrzymanie do odblokowania; blad sieci, limit czasu, 5xx, 507 i bledy kontraktu — proba + 1 i odstep 2, 4,
   8, 16, 30, 60 s (potem przy biciu serca); sesja, blokada, brak rejestracji, wylaczony dziennik, format — bez proby,
   koniec. Blad magazynu kolejki — slad sync.queue.failed {op, code}. scheduleFlush: 1,5 s. flushKeepalive (hidden,
   pagehide, freeze, blur; nadawca, ktory juz wysylal w tym dokumencie, bez trwajacej wysylki, w budzecie): pierwsze
   wpisy do 60 000 B przez fetch keepalive (Bearer, JSON), przy wyjatku albo odrzuceniu fetch sendBeacon text/plain
   {token, events}; najwyzej 65 536 B w locie na dokument. Wznowienie (pageshow, visible): outboxRequeueStale
   (wiersze w locie ponad 60 s) i scheduleFlush. Cykl w pobraniu z dziennikiem: emissionsSettled (czeka takze na
   przeglad przy odblokowaniu), jedna partia wysylki (reszta przez scheduleFlush; trwajaca wysylka nie wstrzymuje
   drenazu), drenaz; drenaz, ktory cos scalil — sweepOutbox i scheduleFlush. Bicie serca: przeglad co 24 h. Operacje
   kolejki i kwarantanny sprawdzaja sesje tak jak zapis karty (P-SESJA-ZAPISU): zmiana sesji w trakcie konczy
   operacje bez zapisu.
   Tabela: ALGORITHMS P-SYNC-NADAWCA. */
var Bns_K_BICIE = 'vilda-outbox-heartbeat-v1:', Bns_BLOKADA = 'vilda-outbox-sender:', Bns_KANAL = 'vilda-sync-data';
var Bns_BICIE_MS = 20000, Bns_MARTWY_MS = 90000, Bns_ZWLOKA_MS = 1500, Bns_DOBA_MS = 864e5;
var Bns_ODSTEPY_S = [2, 4, 8, 16, 30, 60], Bns_BUDZET = 20, Bns_OKNO_MS = 60000;
var Bns_KEEPALIVE_B = 60000, Bns_KEEPALIVE_LIMIT_B = 65536, Bns_ZAPAS_B = 263168; // zapas: zdarzenie do 256 KiB + JSON
var Bns_dok = null;                          // identyfikator tego dokumentu (bicie serca)
var Bns_aktywny = !1, Bns_trwa = null, Bns_zadanie = !1;
var Bns_zegarBicia = null, Bns_zegarPlanu = null, Bns_zegarPowrotu = null;
var Bns_zadania = [];                        // chwile zadan /events z tego dokumentu (budzet 20 na 60 s)
var Bns_odstep = { n: 0, do: 0 };            // odstep po bledzie sieci albo serwera
var Bns_stop401 = !1;                        // po 401: do nastepnego odblokowania
var Bns_material = null;                     // { uid, slotId, authToken } z ostatniej wysylki (keepalive)
var Bns_keepaliveB = 0;
var Bns_przegladAt = 0;                      // chwila ostatniego przegladu 24 h z tego dokumentu
var Bns_kanalObj = null;
function Bns_gora() { try { return o.self === o.top; } catch (x) { return !1; } }
function Bns_id() {
  if (Bns_dok) return Bns_dok;
  try { Bns_dok = o.crypto && typeof o.crypto.randomUUID == 'function' ? o.crypto.randomUUID() : null; } catch (x) { Bns_dok = null; }
  if (!Bns_dok) Bns_dok = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  return Bns_dok;
}
function Bns_sejf() { var v = o.VildaVault; return v && typeof v.isUnlocked == 'function' && v.isUnlocked() ? v : null; }
function Bns_konto(v) { try { var k = v && v.getCurrentUser(); return k && typeof k.userId == 'string' ? k.userId : null; } catch (x) { return null; } }
// Zdarzenia sejfu przez to samo opakowanie konta co drenaz (Bpw_sejfKonta, pole zdarzenia).
function Bns_dziennik(v) { try { var s = v && Bpw_sejfKonta(v, Bns_konto(v)); return (s && s.zdarzenia) || null; } catch (x) { return null; } }
function Bns_syncWlaczona() {
  try {
    var i = o.VildaSyncIntegration;
    if (i && typeof i.isSyncEnabled == 'function') return i.isSyncEnabled() === !0;
    return !!(o.localStorage && o.localStorage.getItem('vilda-sync-enabled-v1') === 'true');
  } catch (x) { return !1; }
}
function Bns_bicieCzytaj(uid) {
  try {
    var s = o.localStorage && o.localStorage.getItem(Bns_K_BICIE + uid), b = s ? JSON.parse(s) : null;
    return b && typeof b.d == 'string' && Number.isSafeInteger(b.t) ? b : null;
  } catch (x) { return null; }
}
function Bns_bicieZapisz(uid) {
  try { if (o.localStorage) o.localStorage.setItem(Bns_K_BICIE + uid, JSON.stringify({ d: Bns_id(), t: Date.now() })); } catch (x) {}
}
/* 'wlasna' (brak bicia albo wlasne), 'przejecie' (cudze starsze niz 90 s albo z chwila w przyszlosci) albo 'inny'. */
function Bns_rola(uid) {
  // P-SYNC-NADAWCA-WPIECIA: dokument z poprzednia tozsamoscia (slot zastapiony rotacja w innej karcie, znacznik
  // P-SYNC-ROTACJA-KART) oddaje role: bez wysylki na stary slot i bez bicia serca; po 90 s przejmuje inny dokument.
  if (Bns_material && Bns_material.uid === uid && Brv_jest(Bns_material.slotId)) return 'inny';
  var b = Bns_bicieCzytaj(uid);
  if (!b || b.d === Bns_id()) return 'wlasna';
  var wiek = Date.now() - b.t;
  return wiek > Bns_MARTWY_MS || wiek < -Bns_MARTWY_MS ? 'przejecie' : 'inny';
}
function Bns_wynik(powod, w, dod) {
  var r = Object.assign({ ok: powod === null, powod: powod }, w || {});
  if (dod) Object.assign(r, dod);
  return r;
}
function Bns_wBudzecie() {
  var t = Date.now();
  Bns_zadania = Bns_zadania.filter(function (x) { return t - x < Bns_OKNO_MS && t >= x; });
  return Bns_zadania.length < Bns_BUDZET;
}
function Bns_planujZa(ms) {
  try {
    if (Bns_zegarPowrotu !== null) o.clearTimeout(Bns_zegarPowrotu);
    Bns_zegarPowrotu = o.setTimeout(function () { Bns_zegarPowrotu = null; Bns_planuj(); }, Math.max(0, ms));
  } catch (x) {}
}
function Bns_blad(w, op, x) {
  var code = x && typeof x.code == 'string' ? x.code : null, powod = x && typeof x.powod == 'string' ? x.powod : 'blad';
  if (code && code.indexOf('SYNC_DB_') === 0) Bzd_slad('sync.queue.failed', { op: op, code: code });
  w.kod = code;
  return powod;
}
/* Wiersze partii bez rozstrzygniecia serwera wracaja do pending (bezProby) albo z proba (proba = true). */
async function Bns_zwroc(L, eidy, code, proba) {
  if (!eidy.length) return;
  try { await L.outboxFail(eidy, { code: code, bezProby: !proba }); } catch (x) {}
}
function Bns_doBudzetu() {
  var t = Date.now(), n = Bns_zadania.length ? Math.min.apply(null, Bns_zadania) : t;
  return Math.max(0, n + Bns_OKNO_MS - t);
}
/* Jedna partia pod blokada nadawcy: 'dalej' (pelna partia wyslana, moze byc nastepna), 'koniec' (pusto albo partia
   niepelna) albo powod stopu. W pauzie 429 i poza budzetem — bez pobrania wierszy, wysylka zaplanowana na koniec. */
async function Bns_partia(v, L, uid, w) {
  Bns_bicieZapisz(uid);
  var pz = Bze_pauzaMs();
  if (pz > 0) { w.kod = 'RATE_LIMITED'; w.ponowZaMs = pz; Bns_planujZa(pz); return 'pauza'; }
  if (!Bns_wBudzecie()) { w.ponowZaMs = Bns_doBudzetu(); Bns_planujZa(w.ponowZaMs); return 'budzet'; }
  var t = await L.outboxTake();
  if (!Bns_sejf() || Bns_konto(v) !== uid) return 'sesja';
  if (!t || t.ok === !1) return Bns_blad(w, 'outboxTake', t);
  if (t.czekaNaWLocie === !0 && !t.wiersze.length && !Bns_zadanie) {
    var z = await L.outboxRequeueStale();
    if (z && z.ok === !1) return Bns_blad(w, 'outboxRequeueStale', z);
    t = await L.outboxTake();
    if (!Bns_sejf() || Bns_konto(v) !== uid) return 'sesja';
    if (!t || t.ok === !1) return Bns_blad(w, 'outboxTake', t);
  }
  if (!t.wiersze.length) return t.czekaNaWLocie === !0 ? 'w-locie' : 'koniec';
  var eidy = t.wiersze.map(function (r) { return r.eid; });
  Bns_zadania.push(Date.now());
  Bns_zadanie = !0;
  var p;
  try {
    p = await Bze_pushEvents(t.wiersze.map(function (r) { return { eid: r.eid, iv: r.env.iv, data: r.env.data }; }));
  } finally { Bns_zadanie = !1; }
  if (p && p.ok === !0) {
    var przyjete = p.accepted.map(function (a) { return a.eid; }), odrz = p.rejected.map(function (a) { return { eid: a.eid, code: a.code }; });
    var znane = new Set(przyjete.concat(odrz.map(function (a) { return a.eid; })));
    var acc = await L.outboxAccept(przyjete);
    if (acc && acc.ok === !1) Bns_blad(w, 'outboxAccept', acc);
    if (odrz.length) {
      var rej = await L.outboxReject(odrz);
      if (rej && rej.ok === !1) Bns_blad(w, 'outboxReject', rej);
    }
    await Bns_zwroc(L, eidy.filter(function (e) { return !znane.has(e); }), 'NO_RESULT', !1);
    Bns_odstep = { n: 0, do: 0 };
    w.partie += 1;
    w.wyslane += przyjete.length;
    w.odrzucone += odrz.length;
    Bzd_slad('sync.push.ok', { rows: przyjete.length, bytes: t.bodyBytes, seq: p.headSeq });
    if (odrz.length) {
      var ov = odrz.filter(function (a) { return a.code === 'oversize'; }).length;
      Bzd_slad('sync.push.rejected', { oversize: ov, invalid: odrz.length - ov });
    }
    // Dalej tylko po pelnej partii (200 wierszy albo cialo blisko 1 MiB — nastepny wiersz moglby sie nie zmiescic).
    return t.wiersze.length >= Bze_MAX_ZDARZEN || t.bodyBytes > Bze_MAX_BAJTOW - Bns_ZAPAS_B ? 'dalej' : 'koniec';
  }
  var kod = p && typeof p.kod == 'string' ? p.kod : null, powod = p && typeof p.powod == 'string' ? p.powod : 'blad';
  w.kod = kod;
  if (powod === 'pauza' || kod === 'RATE_LIMITED') {
    await Bns_zwroc(L, eidy, 'RATE_LIMITED', !1);
    var ms = p && typeof p.retryAfterMs == 'number' ? p.retryAfterMs : Bns_ODSTEPY_S[0] * 1000;
    w.ponowZaMs = ms;
    Bns_planujZa(ms);
    return 'pauza';
  }
  if (kod === 'AUTH_FAILED') { await Bns_zwroc(L, eidy, kod, !1); Bns_stop401 = !0; return 'zatrzymany'; }
  if (kod === 'EVENTS_DISABLED') { await Bns_zwroc(L, eidy, kod, !1); return 'wylaczone'; }
  if (powod === 'siec' || powod === 'odpowiedz' || powod === 'odmowa' || powod === 'blad') {
    await Bns_zwroc(L, eidy, kod || 'ERROR', !0);
    var n = Math.min(Bns_odstep.n, Bns_ODSTEPY_S.length - 1), krok = Bns_ODSTEPY_S[n] * 1000;
    Bns_odstep = { n: Bns_odstep.n + 1, do: Date.now() + krok };
    w.ponowZaMs = krok;
    if (Bns_odstep.n <= Bns_ODSTEPY_S.length) Bns_planujZa(krok); // po ostatnim kroku — przy biciu serca
    return 'odstep';
  }
  await Bns_zwroc(L, eidy, kod || powod.toUpperCase(), !1); // sesja, zablokowany, niezarejestrowany, wylaczone, format, w-locie
  return powod;
}
async function Bns_flushJeden(maks) {
  var w = { partie: 0, wyslane: 0, odrzucone: 0, kod: null };
  if (!Bns_gora()) return Bns_wynik('ramka', w);
  if (!Bze_isEventLogEnabled()) return Bns_wynik('wylaczone', w);
  Bns_aktywuj();
  if (!Bns_syncWlaczona()) return Bns_wynik('synchronizacja-wylaczona', w);
  var v = Bns_sejf(), L = Bns_dziennik(v);
  if (!v || !L) return Bns_wynik('zablokowany', w);
  var uid = Bns_konto(v);
  if (!uid) return Bns_wynik('zablokowany', w);
  if (Bns_stop401) return Bns_wynik('zatrzymany', w);
  if (Date.now() < Bns_odstep.do) return Bns_wynik('odstep', w, { ponowZaMs: Bns_odstep.do - Date.now() });
  var tryb;
  try { tryb = await v.getStorageMode(uid); } catch (x) { tryb = null; }
  if (!Bns_sejf() || Bns_konto(v) !== uid) return Bns_wynik('sesja', w);
  if (tryb !== v.STORAGE_MODE_LOCAL) return Bns_wynik('tryb', w);
  try {
    var mat = await v.getSyncMaterial();
    if (Bns_konto(v) === uid && mat) Bns_material = { uid: uid, slotId: mat.slotId, authToken: mat.authToken };
  } catch (x) {}
  var rola = Bns_rola(uid);
  if (rola === 'inny') return Bns_wynik('inny-nadawca', w);
  for (;;) {
    var r = await Bns_podBlokada(uid, rola === 'przejecie', function () { return Bns_partia(v, L, uid, w); });
    rola = 'wlasna';
    if (r === 'zajeta') return Bns_wynik('inny-nadawca', w);
    if (r === 'koniec') return Bns_wynik(null, w);
    if (r !== 'dalej') return Bns_wynik(r, w);
    if (maks && w.partie >= maks) { Bns_planuj(); return Bns_wynik(null, w, { dalej: !0 }); }
  }
}
async function Bns_podBlokada(uid, steal, fn) {
  var nl;
  try { nl = o.navigator && o.navigator.locks; } catch (x) { nl = null; }
  if (!nl || typeof nl.request != 'function') return fn();
  var op = steal ? { mode: 'exclusive', steal: !0 } : { mode: 'exclusive', ifAvailable: !0 };
  return nl.request(Bns_BLOKADA + uid, op, function (lock) { return lock ? fn() : 'zajeta'; });
}
/* flushOutbox(): jedna wysylka naraz w dokumencie (partie, dopoki sa i pozwala budzet); nigdy nie rzuca. maks — najwyzej
   tyle partii, reszta przez scheduleFlush (cykl w pobraniu: jedna). */
function Bns_flush(maks) {
  if (Bns_trwa) return Bns_trwa;
  var p = Bns_flushJeden(typeof maks == 'number' && maks > 0 ? maks : 0).then(null, function (x) {
    return Bns_wynik(x && x.patientClinicalUnavailable ? 'format' : 'blad', { partie: 0, wyslane: 0, odrzucone: 0, kod: null });
  }).then(function (r) { if (Bns_trwa === p) Bns_trwa = null; return r; });
  Bns_trwa = p;
  return p;
}
/* scheduleFlush(): w dokumencie najwyzszego poziomu wysylka po 1,5 s (kolejne wywolania w tym czasie dolaczaja);
   w ramce ping do okna nadrzednego. */
function Bns_planuj() {
  try {
    if (!Bze_isEventLogEnabled()) return { ok: !1, powod: 'wylaczone' };
    Bns_aktywuj();
    if (!Bns_gora()) {
      if (Bns_kanalObj) Bns_kanalObj.postMessage({ type: 'outbox' });
      return { ok: !0, powod: 'ramka' };
    }
    if (Bns_zegarPlanu === null) {
      Bns_zegarPlanu = o.setTimeout(function () { Bns_zegarPlanu = null; Bns_flush(); }, Bns_ZWLOKA_MS);
    }
    return { ok: !0, powod: null };
  } catch (x) { return { ok: !1, powod: 'blad' }; }
}
function Bns_beacon(url, mat, ev) {
  try {
    var n = o.navigator, tresc = JSON.stringify({ token: mat.authToken, events: ev });
    return !!(n && typeof n.sendBeacon == 'function' && n.sendBeacon(url, new o.Blob([tresc], { type: 'text/plain' })));
  } catch (x) { return !1; }
}
/* flushKeepalive(): przy chowaniu strony; najwyzej jedna partia do 60 000 B, w locie najwyzej 65 536 B na dokument. */
async function Bns_keepalive() {
  try {
    if (!Bns_gora() || !Bze_isEventLogEnabled()) return { ok: !1, powod: 'wylaczone' };
    var v = Bns_sejf(), L = Bns_dziennik(v), uid = Bns_konto(v), mat = Bns_material;
    if (!L || !uid || !mat || mat.uid !== uid || Bns_trwa || Bns_zadanie || Bns_stop401) return { ok: !1, powod: 'pomin' };
    if (PatientClinicalRouteFailure('sync-events')) return { ok: !1, powod: 'format' };
    if (!Bns_syncWlaczona() || Bns_rola(uid) === 'inny' || !m(mat.slotId).registered) return { ok: !1, powod: 'pomin' };
    if (Bze_pauzaMs() > 0) return { ok: !1, powod: 'pauza' };
    if (!Bns_wBudzecie()) return { ok: !1, powod: 'budzet' };
    var extra = JSON.stringify(mat.authToken).length + 9; // ,"token": w ciele text/plain
    var t = await L.outboxTake({ maxBytes: Bns_KEEPALIVE_B, extraBytes: extra });
    if (!t || t.ok === !1) return { ok: !1, powod: Bns_blad({}, 'outboxTake', t) };
    if (!t.wiersze.length) return { ok: !1, powod: t.czekaNaWLocie ? 'w-locie' : 'pusto' };
    var ev = t.wiersze.map(function (r) { return { eid: r.eid, iv: r.env.iv, data: r.env.data }; });
    var eidy = t.wiersze.map(function (r) { return r.eid; }), pt = Bze_partia(ev), bajty = t.bodyBytes;
    if (!pt) { await Bns_zwroc(L, eidy, 'ARGUMENT', !1); return { ok: !1, powod: 'argument' }; }
    var cialo = pt.cialo;
    if (Bns_keepaliveB + bajty > Bns_KEEPALIVE_LIMIT_B) { await Bns_zwroc(L, eidy, 'KEEPALIVE_LIMIT', !1); return { ok: !1, powod: 'limit' }; }
    var url = j() + '/v1/slots/' + mat.slotId + '/events', sposob = 'fetch', odp = null;
    var zwolnij = function () { Bns_keepaliveB = Math.max(0, Bns_keepaliveB - bajty); };
    Bns_keepaliveB += bajty;
    Bns_zadania.push(Date.now());
    try {
      odp = fetch(url, { method: 'POST', keepalive: !0, cache: 'no-store',
        headers: { Authorization: 'Bearer ' + mat.authToken, 'Content-Type': 'application/json' }, body: cialo });
    } catch (x) { odp = null; }
    if (!odp) {
      sposob = 'beacon';
      var ok = Bns_beacon(url, mat, ev);
      zwolnij();
      if (!ok) { await Bns_zwroc(L, eidy, 'BEACON_FAILED', !1); return { ok: !1, powod: 'beacon' }; }
    } else {
      // Odpowiedz, gdy dojdzie (strona zyje dalej): jak w partii; bez rozstrzygniecia (blad HTTP, zly ksztalt) — wiersze
      // z powrotem do pending bez proby. fetch odrzucony (limit keepalive przegladarki albo siec) — zapasowo sendBeacon;
      // jego odpowiedz jest niewidoczna, wiec wiersze zostaja w locie i wracaja przy wznowieniu (60 s; serwer odrzuca
      // powtorke po eid). Strona zamknieta: wiersze w locie wracaja przy nastepnym starcie.
      Promise.resolve(odp).then(function (r) {
        return r && r.ok ? Btr_json(r).then(null, function () { return null; }) : null;
      }, function () { return Bns_beacon(url, mat, ev) ? 'beacon' : null; }).then(function (c) {
        if (c === 'beacon' || Bns_konto(Bns_sejf()) !== uid) return null;
        var a = c ? Bze_odpowiedz(c, pt.eidy) : null;
        if (!a) return Bns_zwroc(L, eidy, 'KEEPALIVE', !1);
        var znane = new Set(a.accepted.concat(a.rejected).map(function (x) { return x.eid; }));
        Bzd_wlasneDopisz(mat.slotId, a.accepted); // pierscien wlasnych zdarzen jak w pushEvents (przed drenazem)
        return Promise.resolve(L.outboxAccept(a.accepted.map(function (x) { return x.eid; }))).then(function () {
          return a.rejected.length ? L.outboxReject(a.rejected.map(function (x) { return { eid: x.eid, code: x.code }; })) : null;
        }).then(function () { return Bns_zwroc(L, eidy.filter(function (e) { return !znane.has(e); }), 'NO_RESULT', !1); });
      }).then(null, function () {}).then(zwolnij);
    }
    return { ok: !0, powod: null, sposob: sposob, wiersze: eidy.length, bytes: bajty };
  } catch (x) { return { ok: !1, powod: 'blad' }; }
}
/* Wznowienie strony: wpisy w locie starsze niz 60 s wracaja do pending, potem wysylka. */
function Bns_wznow() {
  try {
    var v = Bns_sejf(), L = Bns_dziennik(v);
    if (!L || !Bns_gora() || !Bze_isEventLogEnabled()) return;
    Promise.resolve(L.outboxRequeueStale()).then(function () { Bns_planuj(); }, function () {});
  } catch (x) {}
}
/* Bicie serca co 20 s (dokument najwyzszego poziomu): rola, wpis bicia (tylko wlasna rola; przejecie zapisuje dopiero
   partia pod blokada ze steal), przeglad co 24 h, wysylka po wyczerpanych odstepach. Bez dziennika albo przy
   zablokowanym sejfie zegar dalej tyka, nic nie robi. */
function Bns_tik() {
  Bns_zegarBicia = null;
  try {
    var v = Bns_sejf(), uid = Bns_konto(v), rola = uid ? Bns_rola(uid) : 'inny';
    if (v && uid && Bze_isEventLogEnabled() && Bns_syncWlaczona() && rola !== 'inny') {
      if (rola === 'wlasna') Bns_bicieZapisz(uid);
      var L = Bns_dziennik(v), t = Date.now();
      if (L && t - Bns_przegladAt >= Bns_DOBA_MS) {
        Bns_przegladAt = t;
        Promise.resolve(L.sweepOutbox()).then(function () { Bns_planuj(); }, function () {});
      } else if (t >= Bns_odstep.do) Bns_planuj();
    }
  } catch (x) {}
  try { Bns_zegarBicia = o.setTimeout(Bns_tik, Bns_BICIE_MS); } catch (x) {}
}
/* Aktywacja przy pierwszym uzyciu z dziennikiem: sluchacze i zegar; raz na dokument. */
function Bns_aktywuj() {
  if (Bns_aktywny) return;
  Bns_aktywny = !0;
  Bns_przegladAt = Date.now();
  try {
    if (typeof o.BroadcastChannel == 'function') {
      Bns_kanalObj = new o.BroadcastChannel(Bns_KANAL);
      if (Bns_gora()) Bns_kanalObj.addEventListener('message', function (e) { if (e && e.data && e.data.type === 'outbox') Bns_planuj(); });
    }
  } catch (x) { Bns_kanalObj = null; }
  try {
    var v = o.VildaVault, L = Bns_dziennik(v);
    if (L && typeof L.onBulkChange == 'function') L.onBulkChange(function () { Bns_planuj(); });
    if (v && typeof v.onUnlock == 'function') v.onUnlock(function () { Bns_stop401 = !1; Bns_odstep = { n: 0, do: 0 }; });
  } catch (x) {}
  if (!Bns_gora()) return;
  try {
    var d = o.document;
    if (d && typeof d.addEventListener == 'function') {
      d.addEventListener('visibilitychange', function () { if (d.visibilityState === 'hidden' || d.hidden === !0) Bns_keepalive(); else Bns_wznow(); });
      d.addEventListener('freeze', function () { Bns_keepalive(); });
    }
    if (typeof o.addEventListener == 'function') {
      o.addEventListener('pagehide', function () { Bns_keepalive(); });
      o.addEventListener('blur', function () { Bns_keepalive(); });
      o.addEventListener('pageshow', function () { Bns_wznow(); });
      // E2-PR4e1 (plan 3.2, p. 5): po odzyskaniu sieci bez czekania na koniec odstepu.
      o.addEventListener('online', function () { Bns_odstep = { n: 0, do: 0 }; Bns_planuj(); });
    }
  } catch (x) {}
  try { Bns_zegarBicia = o.setTimeout(Bns_tik, Bns_BICIE_MS); } catch (x) {}
}
/* Cykl pobrania z dziennikiem (Bpw_dren): emisje domkniete, jedna partia wysylki (bez czekania na trwajaca wysylke),
   drenaz; drenaz ze zmiana — przeglad i scheduleFlush. */
function Bns_przeglad(L, r) {
  return L && typeof L.sweepOutbox == 'function' && Bdz_otwarty(r) ? Promise.resolve(L.sweepOutbox()).then(null, function () { return null; }) : Promise.resolve(null);
}
function Bns_cykl(t, e, a, r) {
  Bns_aktywuj();
  var L = r && r.zdarzenia;
  return Promise.resolve().then(function () {
    return L && typeof L.emissionsSettled == 'function' ? L.emissionsSettled() : null;
  }).then(function () { return Bns_trwa ? null : Bns_flush(1); }).then(null, function () { return null; }).then(function () {
    return Bdz_B(t, e, a, r);
  }).then(function (w) {
    if (!w || w.zmiana !== !0) return w;
    return Bns_przeglad(L, r).then(function () { Bns_planuj(); return w; });
  });
}
/* P-SYNC-NADAWCA-WPIECIA (E2-PR4e1; plan docs/SYNC_PRZYROSTOWA_PLAN.md 3.2 "Chowanie", "Rotacja tozsamosci", 3.3
   "Realtime", wiersz 8e): wpiecia nadawcy, USPIONE jak nadawca (bez dziennika nic nie rusza).
   - Chowanie strony: pelna wysylka z keepalive (ht) najpierw oddaje kolejke zdarzen do flushKeepalive, a PUT z keepalive
     rusza, gdy zadanie zdarzen juz wyszlo (najwyzej 500 ms) — limit keepalive przegladarki (64 KiB w locie) jest
     wspolny, a zdarzenia sa mniejsze i wazniejsze.
   - Rotacja tozsamosci (revokeAllDevices): przed rotateSyncIdentity wysylka kolejki na stary slot, najwyzej 30 s;
     w ramce przez okno nadrzedne. Wiersze kolejki nie sa zwiazane ze slotem, wiec reszta wyjdzie na nowy. Zaraz po
     rotacji nadawca zapomina material starego slotu (keepalive) i zatrzymanie po 401, i zeruje odstep. Dokument
     z poprzednia tozsamoscia (rotacja w innej karcie) oddaje role nadawcy (Bns_rola).
   - Ramka WebSocket {type:'delta', payload, seq, eid, stored} (applyRealtimeFrame, wola integracja): wlasny eid
     (pierscien slotu) — bez scalenia; inaczej applyEncryptedEvent sejfu (opakowanie konta, sesja jak drenaz);
     applied i seq calkowite rowne kursor + 1 — kursor (tylko w gore) i appliedUpTo o jeden, gdy appliedUpTo rownal
     sie kursorowi (pusta kwarantanna); kazde inne seq, ramka bez seq (stored:false) i inny status — kursor bez zmian,
     drenaz dojdzie do zdarzenia (nieczytelne trafi wtedy do kwarantanny). Bez dziennika { ok: false, powod:
     'wylaczone' } — integracja stosuje delte jak dotad. Nigdy nie rzuca.
   Tabela: ALGORITHMS P-SYNC-NADAWCA-WPIECIA. */
var Bns_ROTACJA_MS = 30000, Bns_KA_CZEKAJ_MS = 500, Bns_kaPrzed = null;
function Bns_najpierwZdarzenia() {
  try {
    if (Bns_gora() && Bze_isEventLogEnabled()) Bns_kaPrzed = Promise.resolve(Bns_keepalive()).then(null, function () { return null; });
  } catch (x) {}
}
function Bns_poZdarzeniach() {
  var p = Bns_kaPrzed;
  Bns_kaPrzed = null;
  if (!p) return Promise.resolve();
  return new Promise(function (ok) {
    var z = null;
    try { z = o.setTimeout(ok, Bns_KA_CZEKAJ_MS); } catch (x) { z = null; }
    p.then(function () { try { if (z !== null) o.clearTimeout(z); } catch (x) {} ok(); });
  });
}
function Bns_poRotacji() {
  Bns_material = null;
  Bns_stop401 = !1;
  Bns_odstep = { n: 0, do: 0 };
}
function Bns_przedRotacja() {
  try {
    if (!Bze_isEventLogEnabled()) return Promise.resolve(null);
    var g = Bns_gora() ? null : o.top && o.top.VildaSync;
    if (!Bns_gora() && !(g && g !== o.VildaSync && typeof g.flushOutbox == 'function')) return Promise.resolve(null);
    var p = Bns_gora() ? Bns_flush() : Promise.resolve(g.flushOutbox());
    return new Promise(function (ok) {
      var z = null;
      try { z = o.setTimeout(function () { ok({ ok: !1, powod: 'limit' }); }, Bns_ROTACJA_MS); } catch (x) { z = null; }
      p.then(function (w) { try { if (z !== null) o.clearTimeout(z); } catch (x) {} ok(w); }, function () { ok(null); });
    });
  } catch (x) { return Promise.resolve(null); }
}
async function Bpr_ramka(fr) {
  try {
    if (!Bze_isEventLogEnabled()) return { ok: !1, powod: 'wylaczone' };
    if (!fr || typeof fr != 'object' || !fr.payload || typeof fr.payload != 'object') return { ok: !1, powod: 'argument' };
    if (PatientClinicalRouteFailure('apply-sync-delta')) return { ok: !1, powod: 'format' };
    var v = Bns_sejf(), uid = Bns_konto(v), L = Bns_dziennik(v);
    if (!v || !uid || !L || typeof L.applyEncryptedEvent != 'function') return { ok: !1, powod: 'zablokowany' };
    var mat = await v.getSyncMaterial();
    if (!Bns_sejf() || Bns_konto(v) !== uid || !mat || typeof mat.slotId != 'string') return { ok: !1, powod: 'sesja' };
    var slot = mat.slotId, eid = typeof fr.eid == 'string' ? fr.eid : null;
    if (eid && Bzd_wlasneCzytaj(slot).has(eid)) return { ok: !0, powod: null, status: 'wlasne', kursor: !1, zmiana: !1 };
    var kursor = bt(slot);
    PatientClinicalRequireLegacy('apply-sync-delta');
    var x = await L.applyEncryptedEvent(fr.payload);
    PatientClinicalRequireLegacy('apply-sync-delta');
    var st = x && typeof x.status == 'string' ? x.status : 'blad';
    if (!Bns_sejf() || Bns_konto(v) !== uid) return { ok: !1, powod: 'sesja', status: st };
    if (st !== 'applied') return { ok: !0, powod: null, status: st, kursor: !1, zmiana: !1 };
    var zm = Bdz_czyZmiana(x.result), nast = Number.isInteger(fr.seq) && fr.seq === kursor + 1;
    if (nast) {
      Bdz_kursorWGore(slot, fr.seq);
      try {
        if (o.localStorage && o.localStorage.getItem(Bzd_K_APPLIED + slot) === String(kursor)) o.localStorage.setItem(Bzd_K_APPLIED + slot, String(fr.seq));
      } catch (y2) {}
    }
    return { ok: !0, powod: null, status: st, kursor: nast, zmiana: zm };
  } catch (x) {
    return { ok: !1, powod: x && x.patientClinicalUnavailable ? 'format' : 'blad' };
  }
}
/* P-SYNC-STRONY (E2-PR1; plan docs/SYNC_PRZYROSTOWA_PLAN.md 3.3 "drainChanges"; decyzje wlasciciela 2026-10-29 nr 1 i 2):
   dziennik zmian stronami (/changes?since=N&limit=200, petla po truncated, ciaglosc seq) zamiast jednej strony legacy
   na pobranie. Od E2-PR1b (P-SYNC-STRONY-DOMYSLNIE) DOMYSLNIE WLACZONE: wylacza tylko vilda-sync-paged-v1 = "0"
   (dokladnie ten tekst) albo window.VILDA_SYNC_PAGED === false; VILDA_SYNC_PAGED === true wlacza mimo "0". Dalej tylko
   przy wlaczonym /changes (Gt), w trybie "Komputer prywatny" (nie chmurowym, nie jednorazowym) i gdy GET /v1/health
   (bez tokenu, wynik tylko w pamieci tej strony) podaje features z "changes-paged". Flaga "0", tryb w pracy albo
   jednorazowy: B, Yt, Bpw_pull i syncPull dzialaja jak przed E2-PR1 (zapis bazowy legacy
   tests/unit/sync-zadania-bazowe.test.mjs). Worker bez changes-paged: jedno zadanie legacy poprzedzone GET /v1/health
   (raz na 10 min), os jak w zapisie bazowym DOMYSLNIE v36. Cofniecie dla wszystkich: rewert E2-PR1b (decyzja 2).
   Kursor jak P-SYNC-KURSOR: najwyzszy wiersz o rozstrzygnietym wyniku, zapis tylko w gore. Drenaz konczy sie w sesji
   konta, ktorym ruszyl (P-SESJA-ZAPISU): przed kazdym zadaniem, po odpowiedzi, przed i po kazdym wierszu i przed zapisem
   kursora sejf musi byc odblokowany na tym samym koncie (Bpw_sejfKonta); inaczej koniec bez zapisu kursora z tej strony
   i bez vilda:sync-merged. onSyncComplete zostaje w dzisiejszym miejscu; na koniec drenazu czeka tylko
   syncPull({czekajNaDrenaz:true}), po zwolnieniu blokady pierwszego pobrania.
   Format kliniczny jak w wt i Yt (PatientClinicalRequireLegacy; o trasie decyduje sejf): "apply-sync-delta" na
   poczatku strony z wierszami oraz przed i po kazdym applyEncryptedDelta, "sync-cursor" przed kazdym zapisem kursora.
   Odmowa (albo blad scalenia z patientClinicalUnavailable) konczy drenaz stopem 'format': bez zapisu kursora z tej
   strony, bez onSyncError i bez vilda:sync-merged za te strone — jak dzis, gdy wt albo Yt rzuca, a B to polyka.
   Tabela stopow: ALGORITHMS P-SYNC-STRONY. */
var Bdz_KLUCZ = 'vilda-sync-paged-v1', Bdz_LIMIT = 200, Bdz_MAX_STRON = 10, Bdz_BUDZET_MS = 20000;
var Bdz_TTL_MS = 600000, Bdz_TTL_BRAK_MS = 15000, Bdz_HEALTH_MS = 5000;
var Bdz_429_DOMYSLNIE_S = 30, Bdz_429_SUFIT_S = 300;
var Bdz_KLUCZ_DZIURY = 'vilda-sync-dziura-v1:', Bdz_DZIURA_PROBY = 3;
var Bdz_api = Object.create(null);        // url -> wynik health (tylko pamiec, TTL)
var Bdz_wykrywanie = Object.create(null); // url -> obietnica trwajacego GET /v1/health (jedno naraz)
var Bdz_przerwaDo = Object.create(null);  // slot -> ms: przerwa po 429 (tylko pamiec)
var Bdz_status = Object.create(null);     // slot -> ostatni wynik drenazu (getDrainStatus)
var Bdz_trwa = null, Bdz_trwaSlot = null; // obietnica trwajacego drenazu stronami w tym dokumencie i jego slot
var Bdz_wyniki = new WeakMap();           // obiekt wyniku pobrania -> obietnica jego drenazu (czekajNaDrenaz)
/* Tryb jednorazowy: te same trzy sygnaly co q(); wyjatek = jednorazowy (bezpiecznie: bez stronicowania). */
function Bdz_jednorazowy() {
  try {
    var p = o.VildaPersistence, v = o.VildaVault;
    if (p && typeof p.isEphemeralMode == 'function' && p.isEphemeralMode()) return true;
    if (v && typeof v.isEphemeralMode == 'function' && v.isEphemeralMode()) return true;
    return !!(o.sessionStorage && o.sessionStorage.getItem('vilda-ephemeral-session-v1') === '1');
  } catch (x) { return true; }
}
/* Tylko odczyty (klucz flagi, VILDA_SYNC_PAGED, potem Gt, K i tryb jednorazowy); przy "0" nic poza kluczem flagi
   i VILDA_SYNC_PAGED. Brak klucza i kazda wartosc inna niz "0" = wlaczone (E2-PR1b); blad odczytu = wylaczone. */
function Bdz_wlaczone() {
  try {
    var g = o.VILDA_SYNC_PAGED;
    var wl = typeof g == 'boolean' ? g : !(o.localStorage && o.localStorage.getItem(Bdz_KLUCZ) === '0');
    return wl && Gt() && !K() && !Bdz_jednorazowy();
  } catch (x) { return false; }
}
function Bdz_ma(api, nazwa) { return !!api && Array.isArray(api.features) && api.features.indexOf(nazwa) !== -1; }
/* GET /v1/health bez Authorization (proste zadanie CORS). v36 nie ma pola api; nie-OK, siec, limit czasu i zly JSON
   daja features [] (legacy). Wynik z changes-paged wazny 10 min. Poprawna odpowiedz bez changes-paged (v36 bez pola api,
   v37a z sqlite true/false) tez 10 min: od E2-PR1b (pobieranie stronami domyslnie) zegar pobiera co ~20 s, a przy 15 s
   kazde pobranie na takim workerze wysylaloby health (stary izolat zaraz po wdrozeniu v37a odpowiada jak v36: legacy
   do 10 min). Przejsciowe (sqlite null = DO na starym kodzie albo nieudana sonda, nie-OK, siec, limit czasu, zly JSON)
   15 s. Odmowa formatu klinicznego (straznik "sync-http" w f) tez daje legacy, ale bez pamieci (nastepny drenaz pyta
   od nowa). */
async function Bdz_zapytajHealth(url) {
  var w = { api: null, sqlite: null, features: [], wersja: null, at: Date.now(), waznyDo: 0 }, odmowa = false, pewny = false;
  try {
    var odp = await f(url + '/v1/health', { method: 'GET' }, Bdz_HEALTH_MS, Bdz_HEALTH_MS);
    if (odp && odp.ok) {
      var c = await Btr_json(odp);
      if (c && typeof c == 'object') {
        w.wersja = typeof c.version == 'string' ? c.version : null;
        pewny = true; // v36: poprawna odpowiedz bez pola api
        if (Number.isSafeInteger(c.api)) {
          w.api = c.api;
          w.sqlite = typeof c.sqlite == 'boolean' ? c.sqlite : null;
          w.features = Array.isArray(c.features) ? c.features.filter(function (x) { return typeof x == 'string'; }) : [];
          pewny = w.sqlite !== null;
        }
      }
    }
  } catch (x) { odmowa = !!(x && x.patientClinicalUnavailable); } // legacy
  w.waznyDo = odmowa ? w.at : w.at + (pewny || Bdz_ma(w, 'changes-paged') ? Bdz_TTL_MS : Bdz_TTL_BRAK_MS);
  return w;
}
function Bdz_wykryj(url) {
  var m = Bdz_api[url];
  if (m && Date.now() < m.waznyDo) return Promise.resolve(m);
  if (!Bdz_wykrywanie[url]) {
    Bdz_wykrywanie[url] = Bdz_zapytajHealth(url).then(function (w) {
      Bdz_api[url] = w;
      delete Bdz_wykrywanie[url];
      return w;
    });
  }
  return Bdz_wykrywanie[url];
}
function Bdz_kopiaApi(a) {
  if (!a) return null;
  return { api: a.api, sqlite: a.sqlite, features: a.features.slice(), wersja: a.wersja, at: a.at, waznyDo: a.waznyDo };
}
/* Stop po wyjatku: odmowa formatu klinicznego (straznik w f, wt, Yt albo Bdz_*) = 'format'; kazdy inny = 'siec'.
   Jak dzis rzut z wt/Yt, ktory B polyka: bez onSyncError. */
function Bdz_stopWyjatku(w, x) {
  w.stop = x && x.patientClinicalUnavailable ? 'format' : 'siec';
  w.kod = (x && x.code) || null;
}
/* r = opakowanie Bpw_sejfKonta: zablokowany sejf albo inne konto = zamkniety. */
function Bdz_otwarty(r) { return !(typeof r.isUnlocked == 'function' && !r.isUnlocked()); }
/* Te same 19 licznikow co wt (straznik rownosci w tests/unit/sync-dziennik-drenaz.test.mjs D37). P-SYNC-LIMIT-ODCZYTU
   (2026-11-11, decyzja 2): doszly wersje (dodane, zmienione, w Koszu, przyciete), listy pacjentow, preferencje i klucze
   logowania — vilda:sync-merged po kazdym rodzaju zmiany, ktory zwraca scalanie. */
function Bdz_czyZmiana(i) {
  return !!i && ((i.addedPatientCount || 0) > 0 || (i.deletedPatientCount || 0) > 0 || (i.addedPatientNoteCount || 0) > 0
    || (i.updatedPatientNoteCount || 0) > 0 || (i.deletedPatientNoteCount || 0) > 0 || (i.mergedPatientCount || 0) > 0
    || (i.addedNoteCount || 0) > 0 || (i.updatedNoteCount || 0) > 0 || (i.deletedNoteCount || 0) > 0
    || (i.addedSnapshotCount || 0) > 0 || (i.updatedSnapshotCount || 0) > 0 || (i.trashedSnapshotCount || 0) > 0
    || (i.prunedSnapshotCount || 0) > 0 || (i.addedPatientListCount || 0) > 0 || (i.updatedPatientListCount || 0) > 0
    || (i.deletedPatientListCount || 0) > 0 || (i.updatedPreferenceCount || 0) > 0 || (i.addedPasskeyCount || 0) > 0
    || (i.removedPasskeyCount || 0) > 0);
}
/* Wynik jednego wiersza z trescia. Zastosowanie (ps) oddaje null takze przy zablokowanym sejfie, wiec "nieczytelne"
   tylko, gdy sejf byl otwarty przed i po wywolaniu. vildaMergeBusy: MERGE_BUSY albo SESSION_CHANGED tego samego konta.
   Jak wt: straznik formatu klinicznego przed i po wywolaniu, a jego blad (takze ze scalenia) leci dalej przed
   sprawdzeniem blokady (stop 'format' w Bdz_wykonaj); busy z kodem CARE_LINEAGE_* albo CARE_FORMAT_* przy otwartym
   sejfie zglasza ten sam onSyncError co wt. */
async function Bdz_zastosuj(d, r) {
  if (!Bdz_otwarty(r)) return 'blokada';
  var i;
  try {
    PatientClinicalRequireLegacy('apply-sync-delta');
    i = await r.applyEncryptedDelta(d.payload);
    PatientClinicalRequireLegacy('apply-sync-delta');
  } catch (x) {
    if (x && x.patientClinicalUnavailable) throw x;
    if (!Bdz_otwarty(r)) return 'blokada';
    if (!(x && x.vildaMergeBusy)) return 'blad';
    var kod = typeof x.code == 'string' ? x.code : '';
    if (kod.indexOf('CARE_LINEAGE_') === 0 || kod.indexOf('CARE_FORMAT_') === 0) y(k, { operation: 'pull', error: x });
    return 'busy';
  }
  if (!Bdz_otwarty(r)) return 'blokada';
  if (i == null) return 'nieczytelne';
  return Bdz_czyZmiana(i) ? 'zmiana' : 'ok';
}
/* Kazdy zapis kursora z drenazu: najpierw straznik "sync-cursor" jak w Yt (blad leci dalej: stop 'format'). */
function Bdz_kursorWGore(t, v) { PatientClinicalRequireLegacy('sync-cursor'); if (v > bt(t)) Kt(t, v); }
/* Licznik dziury w localStorage (przezywa przejscia miedzy stronami i restart aplikacji); tylko przy pobieraniu stronami. */
function Bdz_dziuraCzytaj(t) {
  try {
    var s = o.localStorage && o.localStorage.getItem(Bdz_KLUCZ_DZIURY + t);
    if (!s) return null;
    var d = JSON.parse(s);
    return d && Number.isSafeInteger(d.od) && Number.isSafeInteger(d.do) && Number.isSafeInteger(d.proby) ? d : null;
  } catch (x) { return null; }
}
function Bdz_dziuraZapisz(t, d) {
  try {
    if (!o.localStorage) return;
    if (d) o.localStorage.setItem(Bdz_KLUCZ_DZIURY + t, JSON.stringify(d));
    else if (o.localStorage.getItem(Bdz_KLUCZ_DZIURY + t) != null) o.localStorage.removeItem(Bdz_KLUCZ_DZIURY + t);
  } catch (x) { /* bez licznika: kazdy drenaz liczy sie jako pierwszy */ }
}
/* Odstep po 429: Retry-After (naglowek wystawiony przez CORS v37a), inaczej error.retryAfterSeconds, inaczej 30 s;
   1-300 s. Tylko w pamieci tej strony (bez wspolnego klucza odstepu integracji "rl-until"). */
function Bdz_odstep429(odp, cb) {
  var s;
  try { s = parseInt(odp.headers.get('Retry-After'), 10); } catch (x) { s = NaN; }
  if (!isFinite(s) && cb && cb.error && typeof cb.error.retryAfterSeconds == 'number') s = cb.error.retryAfterSeconds;
  if (!isFinite(s)) s = Bdz_429_DOMYSLNIE_S;
  return Math.min(Bdz_429_SUFIT_S, Math.max(1, Math.ceil(s))) * 1000;
}
function Bdz_wynik(tryb, n) {
  return {
    tryb: tryb, stop: null, http: null, kod: null, od: n, do: n, headSeq: null,
    stron: 0, wierszy: 0, zastosowane: 0, zaslepki: 0, nieczytelne: 0, bledy: 0, zmiana: tryb === 'legacy' ? null : false,
    dziura: null, przeskok: null, przerwaDoISO: null, startISO: new Date().toISOString(), ms: 0
  };
}
/* Odpowiedz w ksztalcie legacy na zadanie z limit (cofniety v36 ignoruje limit): regula Yt — wt, straznik "sync-cursor",
   kursor := max seq, gdy partia nie przerwana (Bsp); zmiana dopiero po zapisie kursora (jak w Yt: Kt przed Et). */
async function Bdz_legacyStrona(t, n, l, r, w) {
  w.wierszy += l.length;
  var zm = await wt(l, r);
  PatientClinicalRequireLegacy('sync-cursor');
  for (var m = n, k = 0; k < l.length; k++) {
    var q = l[k] && l[k].seq;
    if (typeof q == 'number' && isFinite(q) && q > m) m = q;
  }
  if (m > n && !Bsp) Bdz_kursorWGore(t, m);
  if (zm) w.zmiana = true;
}
async function Bdz_drenaz(t, e, a, r, n, w) {
  var t0 = Date.now();
  for (;;) {
    if (w.stron >= Bdz_MAX_STRON || Date.now() - t0 >= Bdz_BUDZET_MS) { w.stop = 'budzet'; return; }
    if (!Bdz_otwarty(r)) { w.stop = 'blokada'; return; } // bez zadania po zmianie sesji
    var odp;
    try {
      odp = await f(a + '/v1/slots/' + t + '/changes?since=' + n + '&limit=' + Bdz_LIMIT,
        { method: 'GET', headers: { Authorization: 'Bearer ' + e } }, ct, Btr_LIMIT_STRONY_MS);
    } catch (x) { Bdz_stopWyjatku(w, x); return; }
    w.stron += 1;
    if (!Bdz_otwarty(r)) { w.stop = 'blokada'; return; }
    if (!odp.ok) {
      var cb;
      try { cb = await Btr_json(odp); } catch (x) { cb = null; } if (!Bdz_otwarty(r)) { w.stop = 'blokada'; return; } // P-SESJA-ZAPISU: takze po tresci 401/429/503
      w.http = odp.status;
      w.kod = cb && cb.error && typeof cb.error.code == 'string' ? cb.error.code : null;
      if (odp.status === 401) w.stop = 'http-401'; // bez C() i bez onSyncError: pelna obsluga w nastepnym /status
      else if (odp.status === 429) {
        Bdz_przerwaDo[t] = Date.now() + Bdz_odstep429(odp, cb);
        w.przerwaDoISO = new Date(Bdz_przerwaDo[t]).toISOString();
        w.stop = 'http-429';
      } else if (odp.status === 503) {
        if (w.kod === 'hub_not_sqlite') delete Bdz_api[a];
        w.stop = 'http-503';
      } else w.stop = 'http-inny';
      return;
    }
    var c;
    try { c = await Btr_json(odp); }
    catch (x) {
      if (x && x.name === 'SyntaxError') { delete Bdz_api[a]; w.stop = 'ksztalt'; } else { w.stop = 'siec'; w.kod = (x && x.code) || null; }
      return;
    }
    if (!Bdz_otwarty(r)) { w.stop = 'blokada'; return; }
    if (!c || typeof c != 'object' || !Array.isArray(c.deltas) || !Number.isSafeInteger(c.nextSince)
      || !Number.isSafeInteger(c.headSeq) || typeof c.truncated != 'boolean') {
      delete Bdz_api[a]; // np. cofniety v36 ignoruje limit: nastepne pobranie wykrywa od nowa
      w.stop = 'ksztalt';
      if (c && Array.isArray(c.deltas) && c.deltas.length) await Bdz_legacyStrona(t, n, c.deltas, r, w);
      return;
    }
    w.headSeq = c.headSeq;
    // ahead i base: Bdz_otwarty sprawdzone po json(), bez await po drodze
    if (c.cursorAhead === true) {
      // tylko w dol: cursorAhead przy headSeq >= since jest poza kontraktem (v37a: since > headSeq) i podnioslby kursor
      // nad wiersze, ktorych nikt juz nie pobierze
      if (c.headSeq >= n) { delete Bdz_api[a]; w.stop = 'ksztalt'; return; }
      PatientClinicalRequireLegacy('sync-cursor');
      Kt(t, c.headSeq);
      w.stop = 'ahead';
      if (w.dziennik === true) Bzd_wymusPobranie(t, w, 'ahead');
      return;
    }
    if (c.requiresBase === true) {
      if (!Number.isSafeInteger(c.oldestSeq) || c.oldestSeq - 1 <= n) { delete Bdz_api[a]; w.stop = 'ksztalt'; return; }
      Bdz_kursorWGore(t, c.oldestSeq - 1); // nigdy z nextSince: pusta strona po /wipe ma nextSince = since
      if (w.dziennik !== true) { w.stop = 'base'; return; }
      Bzd_wymusPobranie(t, w, 'base'); // P-SYNC-DRENAZ-ZDARZEN: drenaz dalej od oldestSeq - 1
      n = c.oldestSeq - 1;
      continue;
    }
    // zm: zmiana z wierszy tej strony; do w.zmiana dopiero po zapisie kursora (albo przy blokadzie, jak dotad), wiec
    // stop 'format' nie wysyla vilda:sync-merged za te strone (jak Yt, gdy wt albo straznik kursora rzuca)
    var ost = n, oczek = n + 1, sw = null, zm = false;
    if (c.deltas.length) PatientClinicalRequireLegacy('apply-sync-delta'); // jak poczatek wt
    for (var k = 0; k < c.deltas.length; k++) {
      var d = c.deltas[k], s = d && d.seq;
      if (!Number.isSafeInteger(s) || s < oczek) { sw = 'ksztalt'; break; }
      if (s > oczek) { // dziura: numery oczek..s-1 nie istnieja (w v37a seq jest ciagly)
        var dz = Bdz_dziuraCzytaj(t), ta = !!dz && dz.od === oczek, proby = ta ? dz.proby + 1 : 1;
        Bdz_dziuraZapisz(t, { od: oczek, do: s - 1, proby: proby, pierwszaISO: ta && dz.pierwszaISO ? dz.pierwszaISO : new Date().toISOString() });
        w.dziura = { od: oczek, do: s - 1, proby: proby };
        if (w.dziennik === true) { Bzd_slad('sync.gap', { od: oczek, do: s - 1, proby: proby }); if (proby === 1) Bzd_wymusPobranie(t, w, 'dziura'); }
        if (proby < Bdz_DZIURA_PROBY) { sw = 'dziura'; break; }
        w.przeskok = { od: oczek, do: s - 1 }; // trzeci drenaz z ta sama dziura: kursor nad brakujacymi numerami
        ost = s - 1; // przy busy na tym wierszu kursor stanie nad dziura (blokada i 'format': bez zapisu z tej strony)
      }
      w.wierszy += 1;
      if (!d.payload || d.gap === true) { w.zaslepki += 1; ost = s; oczek = s + 1; continue; } // jak wt: bez scalenia
      if (w.dziennik === true && Bzd_czyWlasny(w, d)) { w.wlasne += 1; ost = s; oczek = s + 1; continue; } // P-SYNC-DRENAZ-ZDARZEN
      var z = w.dziennik === true ? await Bzd_zastosuj(t, d, r, w) : await Bdz_zastosuj(d, r);
      if (z === 'busy' || z === 'blokada' || z === 'kwarantanna' || z === 'zastosowanie') { sw = z; break; }
      if (z === 'zmiana') zm = true;
      if (z === 'zmiana' || z === 'ok') w.zastosowane += 1;
      else if (z === 'nieczytelne') w.nieczytelne += 1;
      else w.bledy += 1; // jak dzis w wt: kursor idzie (pelny blob niesie tresc, decyzja 7)
      ost = s;
      oczek = s + 1;
    }
    // blokada: bez zapisu kursora z tej strony (zmiana jak dotad; vilda:sync-merged tylko przy sejfie otwartym)
    if (sw === 'blokada' || !Bdz_otwarty(r)) { if (zm) w.zmiana = true; w.stop = 'blokada'; return; }
    if (ost > n) { Bdz_kursorWGore(t, ost); n = ost; }
    if (zm) w.zmiana = true;
    if (sw) { if (sw === 'ksztalt') delete Bdz_api[a]; w.stop = sw; return; }
    if (c.deltas.length && c.nextSince !== ost) { delete Bdz_api[a]; w.stop = 'ksztalt'; return; }
    if (!c.truncated) { w.stop = 'head'; return; }
    if (!c.deltas.length) { delete Bdz_api[a]; w.stop = 'ksztalt'; return; } // truncated bez postepu
  }
}
/* Start drenazu przy wlaczonym pobieraniu stronami (Bdz_wlaczone); nigdy nie odrzuca. Kursor 0: jedno zadanie legacy
   przez Yt (okno E1-5), bez health. Przerwa po 429: bez zadan i bez health. */
async function Bdz_wykonaj(t, e, a, r) {
  if (!r || typeof r.applyEncryptedDelta != 'function') return null; // jak B
  var n = bt(t), w = null, t0 = Date.now();
  try {
    if (Bdz_przerwaDo[t] && t0 < Bdz_przerwaDo[t]) {
      w = Bdz_wynik('pauza', n);
      w.stop = 'http-429';
      w.http = 429;
      w.przerwaDoISO = new Date(Bdz_przerwaDo[t]).toISOString();
    } else if (n === 0) {
      w = Bdz_wynik('legacy', 0);
      w.stop = 'since0-legacy';
      await Yt(t, e, a, r);
    } else {
      var api = await Bdz_wykryj(a);
      if (!Bdz_ma(api, 'changes-paged')) {
        w = Bdz_wynik('legacy', n);
        // P-SESJA-ZAPISU: health czeka do 5 s na naglowki, na tresc bez limitu; blokada albo inne konto w tym czasie = bez /changes ze starym tokenem
        if (!Bdz_otwarty(r)) w.stop = 'blokada';
        else { w.stop = 'legacy'; await Yt(t, e, a, r); }
      } else {
        w = Bdz_wynik('strony', n);
        if (Bze_isEventLogEnabled()) await Bzd_drenaz(t, e, a, r, n, w); // P-SYNC-DRENAZ-ZDARZEN (uspione)
        else await Bdz_drenaz(t, e, a, r, n, w); // sesja sprawdzana na poczatku petli, przed pierwszym zadaniem
      }
    }
  } catch (x) {
    w = w || Bdz_wynik('strony', n);
    Bdz_stopWyjatku(w, x);
  }
  w.do = bt(t);
  w.ms = Date.now() - t0;
  var dz = Bdz_dziuraCzytaj(t);
  if (dz && w.do >= dz.od) Bdz_dziuraZapisz(t, null); // dziura minieta albo przeskoczona
  Bdz_status[t] = w;
  return w;
}
/* Jeden drenaz naraz w dokumencie. Drugie pobranie tego samego slotu w trakcie dostaje te sama obietnice (bez drugiego
   /changes) i nie zleca drenazu po biezacym: wiersz dopisany po odpowiedzi ostatniej strony czeka na nastepne pobranie
   (jak dotad; E2-PR4). Pobranie innego slotu (inne konto w tym dokumencie) w trakcie — bez drenazu, wynik null, jak dotad
   przy at. at jest wspolne z B, wiec drenaz legacy i stronami wykluczaja sie takze przy przelaczeniu flagi w trakcie.
   vilda:sync-merged po zapisie statusu i zwolnieniu znacznikow (sluchacz widzi getDrainStatus z trwa:false), raz na
   drenaz i nie w nowej sesji; w trybie legacy wysyla je Yt, przed zapisem statusu, jak dotad. */
function Bdz_B(t, e, a, r) {
  if (Bdz_trwa) return Bdz_trwaSlot !== t ? Promise.resolve(null) : Bze_isEventLogEnabled() ? Bzd_poTrwajacym(t, e, a, r) : Bdz_trwa;
  if (at) return Promise.resolve(null);
  at = !0;
  var p = Bdz_wykonaj(t, e, a, r).then(null, function () { return null; }).then(function (w) {
    at = !1;
    if (Bdz_trwa === p) { Bdz_trwa = null; Bdz_trwaSlot = null; }
    if (w && w.zmiana === true && Bdz_otwarty(r)) Et('changes-drain');
    return w;
  });
  Bdz_trwa = p;
  Bdz_trwaSlot = t;
  return p;
}
/* Eksport syncPull. Bez opcji ta sama obietnica co Y. czekajNaDrenaz: po Y (blokada pierwszego pobrania zwolniona,
   CareSyncReplayDone wykonane) czeka na drenaz tego pobrania; kopia wyniku z polem drain (wynik legacy albo brak: null). */
function Bdz_syncPull(t) {
  var p = Y(t);
  if (!(t && t.czekajNaDrenaz === !0)) return p;
  return p.then(function (w) {
    var d = w && typeof w == 'object' ? Bdz_wyniki.get(w) : null;
    return d ? d.then(function (x) { return Object.assign({}, w, { drain: x || null }); }) : Object.assign({}, w, { drain: null });
  });
}
function Bdz_detectApi(u) {
  var url = typeof u == 'string' && u ? u.replace(/\/$/, '') : j();
  return Bdz_wykryj(url).then(Bdz_kopiaApi);
}
function Bdz_getDrainStatus(t) {
  var w = typeof t == 'string' ? Bdz_status[t] : null, trwa = !!Bdz_trwa && Bdz_trwaSlot === t;
  if (!w) return null;
  var c = JSON.parse(JSON.stringify(w));
  c.trwa = trwa;
  return c;
}
function Bdz_getChangesCursor(t) { return typeof t == 'string' && t ? bt(t) : null; }
/* P-SYNC-ODPYTYWANIE-WS (E2-PR1b): czy ten dokument pobiera stronami. Tylko odczyt, bez zadan i zapisow:
   Bdz_wlaczone() i ostatni wynik GET /v1/health w pamieci (bez TTL) z "changes-paged". Integracja zwalnia odpytywanie
   z zegara do 60 s tylko przy true; brak wyniku health (np. kursor 0), flaga "0", tryb w pracy albo jednorazowy = false. */
function Bdz_isPagedActive() {
  try { return Bdz_wlaczone() && Bdz_ma(Bdz_api[j()], 'changes-paged'); } catch (x) { return false; }
}
/* P-SYNC-ODPYTYWANIE-WS (E2-PR1b, W1 z przegladu): po rotacji tozsamosci w tym dokumencie (revokeAllDevices, $t) gniazdo
   na zywo zostaje przy poprzedniej tozsamosci i moze dalej uchodzic za zywe (pong); integracja odpytywalaby wtedy
   nowy slot co 60 s, bez ramek z nowego slotu. Tylko "Komputer prywatny" (decyzja 1; te same sygnaly trybu co
   Bdz_wlaczone: K i Bdz_jednorazowy, wyjatek = jednorazowy): "Komputer w pracy" i "Zaloguj jednorazowo" - gniazdo jak
   dotad (tam odpytywanie i tak idzie co ~20 s). Flaga "0" nie ma tu znaczenia (zachowanie gniazda zalezy tylko od
   trybu, jak Brt_prywatny). Gniazdo otwarte albo w trakcie laczenia: rozlacz i polacz od nowa (connect bierze biezaca
   tozsamosc z sejfu; gniazdo nie jest zywe do pierwszego pong nowego polaczenia). W 1,5 s od poprzedniej proby
   polaczenia connect nie laczy, a po disconnect realtime nie stawia zegara; wtedy jedna ponowna proba connect po 1,6 s
   (connect nic nie robi przy gniezdzie otwartym albo w trakcie laczenia, a sama proba sprawdza ramke, wlaczona
   synchronizacje, odblokowany sejf i siec, wiec po blokadzie albo wylaczeniu synchronizacji nic sie nie laczy).
   Gniazdo zamkniete (np. w odstepie ponownego laczenia) przy nastepnej probie samo wezmie nowa tozsamosc.
   Brak VildaRealtime (strona bez gniazda, ramka powloki: tam gniazda nie ma) albo wyjatek = bez zmian. Wolane po udanej
   rotacji i po bledzie dalszych krokow (rejestracja nowego slotu, kasowanie starego), nie po odmowie samej rotacji. */
function Bws_poRotacji() {
  try {
    if (K() || Bdz_jednorazowy()) return;
    var R = o.VildaRealtime, s = R && typeof R.status == 'function' ? R.status() : null;
    if ((s === 'open' || s === 'connecting') && typeof R.disconnect == 'function' && typeof R.connect == 'function') {
      R.disconnect();
      R.connect();
      if (R.status() === 'closed') o.setTimeout(function () { try { R.connect(); } catch (x) {} }, 1600);
    }
  } catch (x) {}
}
async function Bpw_pull(){PatientClinicalRequireLegacy("sync-pull");var CareReplay=null,CareReplayed=false;var t=I(),Bpw_kto=Bpw_konto(t);y(L,{operation:"pull"});var e;try{e=await t.getSyncMaterial()}catch(E){throw y(k,{operation:"pull",error:E}),E}PatientClinicalRequireLegacy("sync-pull");var a=e.slotId,r=e.authToken,n=e.syncEncKey,i=j(),c=m(a);K()&&M==null&&(M=Pt(a,t));try{Brv_stop(a);if(c.registered){var S=await f(i+"/v1/slots/"+a+"/status",{method:"GET",headers:{Authorization:"Bearer "+r}},Mt,Mt);if(Bpw_inneKonto(t,Bpw_kto))throw Bpw_przerwane();PatientClinicalRequireLegacy("sync-pull");if(S.status===401)throw C(a),u("VildaSync: b\u0142\u0105d uwierzytelnienia przy pull. Slot m\xF3g\u0142 zosta\u0107 usuni\u0119ty.","AUTH_FAILED");if(!S.ok)throw u("VildaSync: b\u0142\u0105d odczytu statusu ("+S.status+").","STATUS_FAILED",{httpStatus:S.status});var w=await Btr_json(S);if(Bpw_inneKonto(t,Bpw_kto))throw Bpw_przerwane();PatientClinicalRequireLegacy("sync-pull")}else{var l=await f(i+"/v1/slots/"+a+"/status",{method:"GET",headers:{Authorization:"Bearer "+r}},Mt,Mt);if(Bpw_inneKonto(t,Bpw_kto))throw Bpw_przerwane();PatientClinicalRequireLegacy("sync-pull");if(!l.ok){P();var d={action:"not-registered",httpStatus:l.status};return y(p,{operation:"pull",result:d}),d}var s=await Btr_json(l);if(Bpw_inneKonto(t,Bpw_kto))throw Bpw_przerwane();PatientClinicalRequireLegacy("sync-pull");c.registered=!0,c.localEtag=null,M=null,vt(a),St(a),T(a,c);var w=s}var Bzd_w=Bzd_wymusCzytaj(a),h=Bzd_w?null:K()?M:c.localEtag;CareReplay=h&&h===w.etag?await CareSyncReplay(t,a,w.etag):null;PatientClinicalRequireLegacy("sync-pull");if(h&&h===w.etag&&!CareReplay){var D=await Vt();if(Bpw_inneKonto(t,Bpw_kto))throw Bpw_przerwane();PatientClinicalRequireLegacy("sync-pull");if(D)c.localEtag=null,M=null,vt(a),St(a);else{P();var _={action:"up-to-date",etag:w.etag};return Bpw_dren(a,r,i,t,Bpw_kto,_),y(p,{operation:"pull",result:_}),_}}var g={Authorization:"Bearer "+r},v=CareReplay||Bzd_w?null:K()?M:c.localEtag;v&&(g["If-None-Match"]='"'+v+'"');var A=await f(i+"/v1/slots/"+a+"/blob",{method:"GET",headers:g},Bgz_czas({byteLength:w&&typeof w.size=="number"?w.size:0}));if(Bpw_inneKonto(t,Bpw_kto))throw Bpw_przerwane();PatientClinicalRequireLegacy("sync-pull");if(A.status===304){P();var F={action:"up-to-date",etag:v};return Bpw_dren(a,r,i,t,Bpw_kto,F),y(p,{operation:"pull",result:F}),F}if(A.status===401)throw u("VildaSync: b\u0142\u0105d uwierzytelnienia przy pobieraniu bloba.","AUTH_FAILED");if(A.status===404){P();Bzd_wymusZdejmij(a);var H={action:"no-remote-blob"};return Bpw_dren(a,r,i,t,Bpw_kto,H),y(p,{operation:"pull",result:H}),H}if(!A.ok)throw u("VildaSync: b\u0142\u0105d pobierania danych ("+A.status+").","DOWNLOAD_FAILED",{httpStatus:A.status});var x=await Bnd_czytaj(A,w&&typeof w.size=="number"?w.size:0),W;PatientClinicalRequireLegacy("sync-pull");Bnd_zglos({phase:"decrypt"});try{W=await ut(x,n)}catch{throw u("VildaSync: b\u0142\u0105d odszyfrowania danych. Mo\u017Cliwa zmiana masterKey lub uszkodzenie danych.","DECRYPT_FAILED")}W=await Bgz_rozpakuj(W);var U;try{U=JSON.parse(new TextDecoder().decode(W))}catch{throw u("VildaSync: uszkodzone dane sync (nieprawid\u0142owy format JSON).","PARSE_FAILED")}if(Bpw_inneKonto(t,Bpw_kto))throw Bpw_przerwane();PatientClinicalRequireLegacy("sync-pull");PatientClinicalRequireLegacy("apply-sync-payload");var et=await t.mergeSyncPayload(U,{onProgress:function(E){try{typeof o.document<"u"&&o.document.dispatchEvent&&o.document.dispatchEvent(new CustomEvent("vilda:vault-merge-progress",{detail:E,bubbles:!1}))}catch{}}});PatientClinicalRequireLegacy("apply-sync-payload");var V=Lt(A.headers.get("ETag"))||w.etag;CareReplayed=true;c.localEtag=V,c.rawSize=W.byteLength,c.rawEtag=V,c.lastSyncAt=new Date().toISOString(),M=V,ft(a,V,t),T(a,c),P(),Bzd_wymusZdejmij(a);var J={action:"merged",etag:V,mergeResult:et,staleDevice:et&&et.staleDevice||null};return Nv(J.staleDevice),Qcs(et&&et.clockSkew||null),Bpw_dren(a,r,i,t,Bpw_kto,J),y(p,{operation:"pull",result:J}),J}catch(E){/* P-SESJA-ZAPISU (przeglad 4, ADW4-3): blad pobrania po zalogowaniu innego konta albo blokadzie (np. /status 500, siec, limit czasu) — SESSION_CHANGED: nalezy do poprzedniej sesji. */var Bpw_e=Bpw_inneKonto(t,Bpw_kto)?Bpw_przerwane():E;throw y(k,{operation:"pull",error:Bpw_e}),Bpw_e}finally{CareSyncReplayDone(CareReplay,CareReplayed)}}async function Ht(){PatientClinicalRequireLegacy("sync-full");I(),y(L,{operation:"full"});try{var t=await Y(),e=await ht(),a={pull:t,push:e};PatientClinicalRequireLegacy("sync-full");return y(p,{operation:"full",result:a}),a}catch(r){throw y(k,{operation:"full",error:r}),r}}async function xt(){return WorkspaceSyncReadStatus(async function () {PatientClinicalRequireLegacy("sync-status");var t=I(),e=await t.getSyncMaterial();PatientClinicalRequireLegacy("sync-status");return m(e.slotId)});}async function Wt(){PatientClinicalRequireLegacy("sync-state-clear");var t=I(),e=await t.getSyncMaterial();PatientClinicalRequireLegacy("sync-state-clear");C(e.slotId)}async function Jt(){PatientClinicalRequireLegacy("delete-sync-slot");
  var ticket=TLibOperationContext(),vault=I(),material=await vault.getSyncMaterial();
  PatientClinicalRequireLegacy("delete-sync-slot");TLibFence(ticket.ctx,ticket.token);
  var assertCurrent=await TLibGuardLegacyDelete(material.slotId,material.authToken,ticket);
  PatientClinicalRequireLegacy("delete-sync-slot");assertCurrent();
  var state=m(material.slotId);
  if(!state.registered)return{action:"not-registered"};
  var response=await f(j()+"/v1/slots/"+material.slotId,{method:"DELETE",headers:{Authorization:"Bearer "+material.authToken}});
  PatientClinicalRequireLegacy("delete-sync-slot");assertCurrent();
  if(response.status===204||response.status===401)return C(material.slotId),{action:"deleted"};
  throw u("VildaSync: błąd usuwania slotu ("+response.status+").","DELETE_FAILED",{httpStatus:response.status});
}/* P-NOWE-URZADZENIE (decyzja wlasciciela 2026-10-12, etap 1): sonda bez rozstrzygniecia oddaje inconclusive:true - sejf zablokowany, brak tozsamosci synchronizacji, blad sieci, timeout, zadanie przerwane (np. przeladowanie karty w trakcie sondy) albo odpowiedz /status inna niz 200 i 404. Pewne "nie" zostaje bez tego pola: urzadzenie zna slot (albo slot obrocono w innej karcie) lub serwer nie ma slotu (404). Integracja odhacza sonde w karcie (vilda-probe-done-v1) tylko po pewnym "nie". Dotad kazdy blad dawal to samo "nie", a przeladowanie w trakcie sondy gubilo pytanie o pobranie danych. */async function Xt(){PatientClinicalRequireLegacy("probe-new-device");var Pn0={isNewDevice:!1,lastModified:null,inconclusive:!0},t;try{t=I()}catch{return Pn0}var e;try{e=await t.getSyncMaterial()}catch{return Pn0}PatientClinicalRequireLegacy("probe-new-device");var a=e.slotId,r=m(a);if(r.registered||Brv_jest(a))return{isNewDevice:!1,lastModified:null};try{var n=await f(j()+"/v1/slots/"+a+"/status",{method:"GET",headers:{Authorization:"Bearer "+e.authToken}});if(n.status===404)return{isNewDevice:!1,lastModified:null};if(!n.ok)return Pn0;var i=await n.json();PatientClinicalRequireLegacy("probe-new-device");return{isNewDevice:!0,lastModified:i.lastModified||i.updatedAt||null}}catch(error){if(error&&error.patientClinicalUnavailable)throw error;return Pn0}}async function pt(t,e,a,r){PatientClinicalRequireLegacy("upload-to-slot");Brv_stop(t);var n=j(),i=await f(n+"/v1/slots/"+t+"/register",{method:"POST",headers:{"Content-Type":"application/octet-stream","X-Auth-Token-Hash":a},body:r},Bgz_czas(r));if(i.status===201){var c=await i.json().catch(function(){return{}});PatientClinicalRequireLegacy("upload-to-slot");return{action:"registered",etag:c.etag||null}}if(i.status===409){var l=await f(n+"/v1/slots/"+t+"/blob",{method:"PUT",headers:{"Content-Type":"application/octet-stream",Authorization:"Bearer "+e},body:r},Bgz_czas(r));if(l.status===200){var d=await l.json().catch(function(){return{}});PatientClinicalRequireLegacy("upload-to-slot");return{action:"uploaded",etag:d.etag||null}}throw u("VildaSync.uploadToSlot: b\u0142\u0105d uploadu na istniej\u0105cy slot ("+l.status+").","UPLOAD_FAILED",{httpStatus:l.status})}throw u("VildaSync.uploadToSlot: b\u0142\u0105d rejestracji slotu ("+i.status+").","REGISTER_FAILED",{httpStatus:i.status})}async function _t(t,e){PatientClinicalRequireLegacy("delete-slot-with-material");
  var assertCurrent=await TLibGuardLegacyDelete(t,e);
  PatientClinicalRequireLegacy("delete-slot-with-material");assertCurrent();
  var a=await f(j()+"/v1/slots/"+t,{method:"DELETE",headers:{Authorization:"Bearer "+e}});
  PatientClinicalRequireLegacy("delete-slot-with-material");assertCurrent();
  if(a.status===204)return{action:"deleted"};
  if(a.status===401||a.status===404)return{action:"absent"};
  throw u("VildaSync.deleteSlotWithMaterial: błąd kasacji slotu ("+a.status+").","DELETE_FAILED",{httpStatus:a.status});
}async function $t(t){var Bws_obrot=!1;PatientClinicalRequireLegacy("revoke-all-devices");var e=I();if(typeof e.rotateSyncIdentity!="function")throw u("VildaSync.revokeAllDevices: vault nie wspiera rotacji to\u017Csamo\u015Bci.","NOT_SUPPORTED");y(L,{operation:"revoke"});try{var a=await e.getSyncMaterial();PatientClinicalRequireLegacy("revoke-all-devices");var r=a.slotId,n=a.authToken;/* P-SYNC-ROTACJA-KART: karta z poprzednia tozsamoscia nie obraca jej drugi raz (odswiezenie strony wczytuje biezaca). Znacznik zaraz po rotacji, przed rejestracja nowego slotu i kasowaniem starego, wiec obowiazuje takze, gdy ktorys z tych krokow sie nie uda. */Brv_stop(r);await Bns_przedRotacja();Brv_stop(r);var i=await e.rotateSyncIdentity(t);Bws_obrot=!0;Bns_poRotacji();PatientClinicalRequireLegacy("revoke-all-devices");var c=await e.getSyncMaterial();PatientClinicalRequireLegacy("revoke-all-devices");var l=c.slotId;l!==r&&Brv_oznacz(r);var d=await e.exportSyncPayload(),s=new TextEncoder().encode(JSON.stringify(d)),w=await G(await Bgz_pakuj(s),c.syncEncKey),S=await pt(l,c.authToken,c.authTokenHash,w);PatientClinicalRequireLegacy("revoke-all-devices");var h=m(l)||{};h.registered=!0,h.localEtag=S.etag||null,h.lastSyncAt=new Date().toISOString(),T(l,h);var D=!1;try{var _=await _t(r,n);D=_.action==="deleted"||_.action==="absent"}catch{D=!1}PatientClinicalRequireLegacy("revoke-all-devices");C(r);var g={recoveryKey:i.recoveryKey,oldSlotId:r,newSlotId:l,oldSlotRevoked:D};Bws_poRotacji();return y(p,{operation:"revoke",result:g}),g}catch(v){Bws_obrot&&Bws_poRotacji();throw y(k,{operation:"revoke",error:v}),v}}async function qt(){PatientClinicalRequireLegacy("restore-prev-blob");var t=I();y(L,{operation:"restore-prev"});try{var e=await t.getSyncMaterial(),a=e.slotId,r=e.authToken;Brv_stop(a);var n=j(),i=await f(n+"/v1/slots/"+a+"/blob/restore-prev",{method:"POST",headers:{Authorization:"Bearer "+r}});if(i.status===404)throw u("VildaSync: brak zarchiwizowanej poprzedniej wersji na serwerze.","NO_ARCHIVE");if(i.status===401)throw u("VildaSync: b\u0142\u0105d uwierzytelnienia przy przywracaniu.","AUTH_FAILED");if(!i.ok){var c=await i.json().catch(function(){return{}});throw u("VildaSync: przywracanie nieudane ("+i.status+"): "+(c.error&&c.error.message||""),"RESTORE_FAILED",{httpStatus:i.status})}var l=await i.json();PatientClinicalRequireLegacy("restore-prev-blob");var d=m(a);d.localEtag=null,T(a,d);var s=await Y(),w={restored:l,pull:s};return y(p,{operation:"restore-prev",result:w}),w}catch(S){throw y(k,{operation:"restore-prev",error:S}),S}}function Zt(t){typeof t=="function"&&L.push(t)}function Qt(t){typeof t=="function"&&p.push(t)}function Rt(t){typeof t=="function"&&k.push(t)}/* Care-template relay: explicit opt-in, one coalesced phase beside the existing
 * public sync cycle. Patient transport and its exact returned promise stay intact.
 * Pending operations and their once-encrypted wire identity belong to the library DB. */
var TLibActive = null , TLibFlight = null , TLibGeneration = 0 , TLibObserved = new WeakSet ( ) , TLibStatus = {
  state : "inactive"
}
;
function TLibCurrent ( ctx ) {
  return ! ! ( ctx && ctx === TLibActive && o . VildaVault === ctx . vault && ctx . vault . isUnlocked ( ) && Bpw_konto ( ctx . vault ) === ctx . userId )
}
function TLibAuthorityCurrent(ctx) {
  return !!(ctx && ctx.authorityOnly === true && o.VildaVault === ctx.vault &&
    ctx.vault.isUnlocked() && Bpw_konto(ctx.vault) === ctx.userId);
}
function TLibError ( code , status ) {
  return u ( "Nie udało się zsynchronizować biblioteki szablonów." , code , status ? {
    httpStatus : status
  }
  : null )
}
function TLibPublish ( ctx , value ) {
  if ( ! TLibCurrent ( ctx ) ) return ;
  TLibStatus = Object . assign ( {
    state : "idle"
  }
  , value ) ;
  try {
    var E = o . CustomEvent || ( typeof CustomEvent === "function" ? CustomEvent : null ) ;
    E && o . document && o . document . dispatchEvent && o . document . dispatchEvent ( new E ( "vilda:template-library-sync-status" , {
      detail : TLibGetStatus ( ) , bubbles : false
    }
    ) )
  }
  catch {
  }
}
function TLibGetStatus ( ) {
  if ( ! TLibCurrent ( TLibActive ) ) return {
    state : "inactive"
  }
  ;
  var result = Object . assign ( {
  }
  , TLibStatus ) ;
  result . error && ( result . error = Object . assign ( {
  }
  , result . error ) ) ;
  return result
}
function TLibEnabled ( ) {
  try {
    var integration = o . VildaSyncIntegration ;
    return integration && typeof integration . isSyncEnabled === "function" ? integration . isSyncEnabled ( ) : ! ! ( o . localStorage && o . localStorage . getItem ( "vilda-sync-enabled-v1" ) === "true" )
  }
  catch {
    return false
  }
}
/* Readable template-library scheduling: client/template-device-sync/runtime-sync.fragment.txt */
var TLibAutomaticDelay = 15000;
function TLibCancelScheduled(ctx) {
  if (ctx && ctx.scheduledTimer != null) clearTimeout(ctx.scheduledTimer);
  if (ctx) { ctx.scheduledTimer = null; ctx.scheduledAt = null; ctx.scheduledUrgent = false; }
}
function TLibSchedule(ctx, at, urgent) {
  if (!TLibCurrent(ctx) || !TLibEnabled()) return;
  var due = Math.max(at, ctx.retryAt || 0), wasUrgent = ctx.scheduledUrgent === true;
  if (ctx.scheduledTimer != null && ctx.scheduledAt <= due) {
    ctx.scheduledUrgent = wasUrgent || urgent;
    return;
  }
  TLibCancelScheduled(ctx);
  ctx.scheduledAt = due;
  ctx.scheduledUrgent = wasUrgent || urgent;
  ctx.scheduledTimer = setTimeout(function () {
    var immediate = ctx.scheduledUrgent;
    TLibCancelScheduled(ctx);
    if (!TLibCurrent(ctx) || !TLibEnabled()) return;
    if (o.navigator && o.navigator.onLine === false) {
      if (ctx.pending) TLibSchedule(ctx, Date.now() + TLibAutomaticDelay, immediate);
      return;
    }
    TLibStart(!immediate).catch(function () {});
  }, Math.min(2147483647, Math.max(0, due - Date.now())));
}
function TLibRetryDelay(response) {
  var value = response.headers && response.headers.get("Retry-After");
  if (value && /^\d+$/.test(value.trim())) {
    var seconds = Number(value);
    var milliseconds = seconds * 1000;
    if (Number.isSafeInteger(milliseconds) && Number.isSafeInteger(Date.now() + milliseconds)) return Math.max(1000, milliseconds);
  }
  if (value) {
    var until = Date.parse(value);
    if (Number.isFinite(until) && until > Date.now()) return until - Date.now();
  }
  return st;
}
function TLibDeactivate() {
  var ctx = TLibActive;
  TLibCancelScheduled(ctx);
  TLibActive = null;
  TLibStatus = { state: "inactive" };
  if (ctx && ctx.unsubscribe) try { ctx.unsubscribe(); } catch {}
}
function TLibWake() {
  var ctx = TLibActive;
  if (!TLibCurrent(ctx) || !TLibEnabled()) return;
  ctx.localWakeVersion = (ctx.localWakeVersion || 0) + 1;
  TLibStart().catch(function () {});
}
function TLibActivate ( ) {
  var vault = I ( ) , uid = Bpw_konto ( vault ) ;
  if ( ! uid || typeof vault . captureCareTemplateSession !== "function" ) throw TLibError ( "CARE_TEMPLATE_API_UNAVAILABLE" ) ;
  if ( TLibCurrent ( TLibActive ) ) return TLibGetStatus ( ) ;
  TLibDeactivate ( ) ;
  var ctx = {
    vault : vault , userId : uid , generation : ++ TLibGeneration , unsubscribe : null , pending : null
  }
  ;
  TLibActive = ctx ;
  TLibStatus = {
    state : "idle"
  }
  ;
  if ( ! TLibObserved . has ( vault ) && typeof vault . onLock === "function" ) {
    TLibObserved . add ( vault ) ;
    vault . onLock ( function ( ) {
      TLibActive && TLibActive . vault === vault && TLibDeactivate ( )
    }
    )
  }
  if ( typeof vault . onCarePlanTemplateChanged === "function" ) ctx . unsubscribe = vault . onCarePlanTemplateChanged ( function ( event ) {
    if ( event && event . source === "local" && TLibCurrent ( ctx ) ) {
      ctx . pending = true ;
      TLibWake ( )
    }
  }
  ) ;
  return TLibGetStatus ( )
}
function TLibFence ( ctx , token ) {
  if (ctx && ctx.operationOnly === true) {
    if (o.VildaVault !== ctx.vault) throw TLibError("SESSION_CHANGED");
    ctx.vault.assertSyncOperationSession(token);
    return;
  }
  if ( ! ( ctx && ctx.authorityOnly === true ? TLibAuthorityCurrent(ctx) : TLibCurrent(ctx) ) ) throw TLibError ( "SESSION_CHANGED" ) ;
  TLibMaterial(token);
  ctx . vault . assertCareTemplateSession ( token ) ;
  Brv_stop ( token . slotId )
}
function TLibMaterial(material) {
  if (!material || !/^[a-f0-9]{64}$/.test(material.slotId || "") ||
      typeof material.authToken !== "string" || !material.authToken) throw TLibError("CARE_TEMPLATE_IDENTITY_INVALID");
}
function TLibInteger ( value , min ) {
  return Number . isSafeInteger ( value ) && value >= min
}
function TLibReceipt ( value , token ) {
  if ( ! value || value . ok !== true || value . namespace !== "care-template-library" || value . protocol !== 1 || value . slotId !== token . slotId || typeof value . initialized !== "boolean" || ! TLibInteger ( value . epoch , value . initialized ? 1 : 0 ) || ! TLibInteger ( value . headSeq , 0 ) || ! TLibInteger ( value . floorSeq , 0 ) || value . floorSeq > value . headSeq || ( ! value . initialized && ( value . epoch !== 0 || value . headSeq !== 0 || value . floorSeq !== 0 ) ) ) throw TLibError ( "CARE_TEMPLATE_PROTOCOL_UNSUPPORTED" ) ;
  return value
}
async function TLibHash ( text ) {
  var bytes = new Uint8Array ( await o . crypto . subtle . digest ( "SHA-256" , new TextEncoder ( ) . encode ( text ) ) ) ;
  return Array . prototype . map . call ( bytes , function ( b ) {
    return b . toString ( 16 ) . padStart ( 2 , "0" )
  }
  ) . join ( "" )
}
/* One request deadline includes headers and body. This is not a scheduler:
 * it uses the existing HTTP budget and never changes the patient request helper. */
async function TLibHTTP(ctx, token, url, options) {
  TLibFence(ctx, token);
  var controller=new AbortController(), timer=null, expired=false, reader=null;
  var maxBytes=1048576+65536;
  function current() {
    TLibFence(ctx, token);
    if (expired) throw TLibError("CARE_TEMPLATE_TIMEOUT");
  }
  var deadline=new Promise(function(resolve,reject) {
    timer=setTimeout(function() {
      expired=true;
      controller.abort();
      var error=TLibError("CARE_TEMPLATE_TIMEOUT");
      try { TLibFence(ctx,token); } catch(changed) { error=changed; }
      reject(error);
    },Mt);
  });
  var work=Promise.resolve().then(async function() {
    var response=await fetch(url,Object.assign({cache:"no-store",credentials:"omit"},options,{signal:controller.signal}));
    current();
    var declared=Number(response.headers&&response.headers.get("Content-Length"));
    if (Number.isFinite(declared)&&declared>maxBytes) throw TLibError("CARE_TEMPLATE_RESPONSE_TOO_LARGE");
    var bytes;
    if (response.body&&typeof response.body.getReader==="function") {
      reader=response.body.getReader();
      var parts=[],size=0;
      for (;;) {
        var part=await reader.read();
        current();
        if (part.done) break;
        var chunk=new Uint8Array(part.value);
        size+=chunk.byteLength;
        if (size>maxBytes) throw TLibError("CARE_TEMPLATE_RESPONSE_TOO_LARGE");
        parts.push(chunk);
      }
      bytes=new Uint8Array(size);
      for (var index=0,offset=0;index<parts.length;index++) { bytes.set(parts[index],offset); offset+=parts[index].length; }
    } else {
      bytes=new Uint8Array(await response.arrayBuffer());
      current();
      if (bytes.byteLength>maxBytes) throw TLibError("CARE_TEMPLATE_RESPONSE_TOO_LARGE");
    }
    current();
    var value;
    try { value=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes)); }
    catch { throw TLibError("CARE_TEMPLATE_PROTOCOL_UNSUPPORTED",response.status); }
    current();
    return {response:response,value:value};
  });
  try { return await Promise.race([work,deadline]); }
  finally {
    clearTimeout(timer);
    controller.abort();
    if (reader) {
      try { Promise.resolve(reader.cancel()).catch(function(){}); } catch {}
      try { reader.releaseLock(); } catch {}
    }
  }
}
async function TLibRequest(ctx, token, path, body, target) {
  TLibFence(ctx, token);
  var material = target || token;
  TLibMaterial(material);
  var options = { method: body === undefined ? "GET" : "POST", headers: { Authorization: "Bearer " + material.authToken } };
  if (body !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  var packet = await TLibHTTP(ctx, token, j() + "/v1/slots/" + material.slotId + "/template-library/" + path, options);
  TLibFence(ctx, token);
  var response = packet.response, value = packet.value;
  if (!response.ok) {
    if (response.status === 429) ctx.retryAt = Date.now() + TLibRetryDelay(response);
    var typed = value && value.namespace === "care-template-library" && value.protocol === 1 && value.slotId === material.slotId;
    var code = typed && value.error && typeof value.error.code === "string" ? value.error.code : "unsupported";
    var error = TLibError(code === "epoch_mismatch" ? "CARE_TEMPLATE_EPOCH_CHANGED" : code === "identity_required" ? "CARE_TEMPLATE_IDENTITY_REQUIRED" : code === "unsupported" ? "CARE_TEMPLATE_PROTOCOL_UNSUPPORTED" : "CARE_TEMPLATE_REMOTE_" + code.toUpperCase().replace(/[^A-Z0-9_]/g, "").slice(0, 48), response.status);
    if (typed && code === "identity_required" && response.status === 409 && value.initialized === false && value.epoch === 0) error.identityRequired = true;
    throw error;
  }
  return TLibReceipt(value, material);
}
async function TLibIdentity(ctx, token) {
  TLibFence(ctx, token);
  var hash = await TLibHash(token.authToken);
  TLibFence(ctx, token);
  var packet = await TLibHTTP(ctx, token, j() + "/v1/slots/" + token.slotId + "/register-identity", {
    method: "POST", headers: { "X-Auth-Token-Hash": hash }
  });
  TLibFence(ctx, token);
  var response = packet.response, receipt = packet.value;
  if (response.status === 429) ctx.retryAt = Date.now() + TLibRetryDelay(response);
  if (response.status !== 200 && response.status !== 201) throw TLibError("CARE_TEMPLATE_IDENTITY_REGISTER_FAILED", response.status);
  if (!receipt || receipt.ok !== true || receipt.slotId !== token.slotId) throw TLibError("CARE_TEMPLATE_PROTOCOL_UNSUPPORTED", response.status);
}
function TLibWire ( event ) {
  return event && typeof event . eid === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/ . test ( event . eid ) && event . body && typeof event . body . iv === "string" && typeof event . body . data === "string"
}
async function TLibPull(ctx, token, remote, local) {
  var cursor = local.cursor, observedHead = remote.headSeq;
  if (!TLibInteger(cursor, remote.floorSeq) || cursor > observedHead) throw TLibError("CARE_TEMPLATE_INVALID_PAGE");
  TLibFence(ctx, token);
  // TLibRun has already validated the receipt, epoch and any bootstrap binding.
  // A caught-up state needs no empty changes request and no empty local commit.
  if (cursor === observedHead) return cursor;
  for (var pages = 0; pages <= 16384; pages++) {
    var page = await TLibRequest(ctx, token, "changes?epoch=" + remote.epoch + "&since=" + cursor + "&limit=64");
    if (page.epoch !== remote.epoch) throw TLibError("CARE_TEMPLATE_EPOCH_CHANGED");
    if (page.floorSeq !== remote.floorSeq || page.headSeq < observedHead) throw TLibError("CARE_TEMPLATE_INVALID_PAGE");
    observedHead = page.headSeq;
    if (!Array.isArray(page.events) || page.events.length > 200 || typeof page.hasMore !== "boolean" || !TLibInteger(page.cursor, 0) || page.cursor < cursor || page.cursor > page.headSeq) throw TLibError("CARE_TEMPLATE_INVALID_PAGE");
    var previous = Math.max(cursor, page.floorSeq), ids = Object.create(null);
    for (var index = 0; index < page.events.length; index++) {
      var event = page.events[index];
      if (!TLibWire(event) || !TLibInteger(event.seq, 1) || event.seq !== previous + 1 || ids[event.eid] || !/^[a-f0-9]{64}$/.test(event.digest || "")) throw TLibError("CARE_TEMPLATE_INVALID_PAGE");
      ids[event.eid] = true;
      previous = event.seq;
    }
    if (page.cursor !== previous || (!page.events.length && page.headSeq > previous) || page.hasMore !== (page.cursor < page.headSeq)) throw TLibError("CARE_TEMPLATE_INVALID_PAGE");
    TLibFence(ctx, token);
    await ctx.vault.applyCareTemplateEvents(token, { epoch: remote.epoch, expectedCursor: cursor, cursor: page.cursor, events: page.events });
    TLibFence(ctx, token);
    cursor = page.cursor;
    if (!page.hasMore) return cursor;
  }
  throw TLibError("CARE_TEMPLATE_PAGE_LIMIT");
}
async function TLibPush ( ctx , token , remote ) {
  var limits = remote . limits ;
  if ( ! limits || ! TLibInteger ( limits . maxBodyBytes , 1024 ) || ! TLibInteger ( limits . maxBatchEvents , 1 ) ) throw TLibError ( "CARE_TEMPLATE_PROTOCOL_UNSUPPORTED" ) ;
  var maxBytes = Math . min ( 1048576 , limits . maxBodyBytes ) , limit = Math . min ( 64 , 200 , limits . maxBatchEvents ) ;
  for ( var batches = 0 ;
  batches <= 16384 ;
  batches ++ ) {
    TLibFence ( ctx , token ) ;
    var pending = await ctx . vault . prepareCareTemplatePending ( token , {
      epoch : remote . epoch , maxWireBytes : maxBytes - 512 , limit : limit
    }
    ) ;
    TLibFence ( ctx , token ) ;
    if ( ! pending || pending . epoch !== remote . epoch || ! Array . isArray ( pending . events ) || pending . events . length > limit || ! pending . events . every ( TLibWire ) ) throw TLibError ( "CARE_TEMPLATE_INVALID_PENDING" ) ;
    if ( ! pending . events . length ) return ;
    var sent = pending . events , body = {
      namespace : "care-template-library" , protocol : 1 , epoch : remote . epoch , events : sent
    }
    ;
    if ( new TextEncoder ( ) . encode ( JSON . stringify ( body ) ) . byteLength > maxBytes ) throw TLibError ( "CARE_TEMPLATE_PAYLOAD_TOO_LARGE" ) ;
    var receipt = await TLibRequest ( ctx , token , "events" , body ) ;
    if ( receipt . epoch !== remote . epoch ) throw TLibError ( "CARE_TEMPLATE_EPOCH_CHANGED" ) ;
    if ( receipt . stored !== true || ! Array . isArray ( receipt . accepted ) || receipt . accepted . length !== sent . length ) throw TLibError ( "CARE_TEMPLATE_INVALID_ACK" ) ;
    var accepted = Object . create ( null ) ;
    for ( var i = 0 ;
    i < receipt . accepted . length ;
    i ++ ) {
      var ack = receipt . accepted [ i ] ;
      if ( ! ack || typeof ack . eid !== "string" || accepted [ ack . eid ] || ! TLibInteger ( ack . seq , 1 ) || ack . seq > receipt . headSeq || typeof ack . dup !== "boolean" || ! /^[a-f0-9]{64}$/ . test ( ack . digest || "" ) ) throw TLibError ( "CARE_TEMPLATE_INVALID_ACK" ) ;
      accepted [ ack . eid ] = ack
    }
    for ( var k = 0 ;
    k < sent . length ;
    k ++ ) {
      var item = sent [ k ] , match = accepted [ item . eid ] , digest = await TLibHash ( JSON . stringify ( {
        iv : item . body . iv , data : item . body . data
      }
      ) ) ;
      TLibFence ( ctx , token ) ;
      if ( ! match || match . digest !== digest ) throw TLibError ( "CARE_TEMPLATE_INVALID_ACK" )
    }
    await ctx . vault . ackCareTemplateEvents ( token , {
      epoch : remote . epoch , sent : sent , accepted : receipt . accepted
    }
    ) ;
    TLibFence ( ctx , token )
  }
  throw TLibError ( "CARE_TEMPLATE_BATCH_LIMIT" )
}
async function TLibRun ( ctx ) {
  var token = await ctx . vault . captureCareTemplateSession ( ) ;
  TLibFence ( ctx , token ) ;
  var local = await ctx . vault . getCareTemplateSyncState ( token ) ;
  TLibFence ( ctx , token ) ;
  ctx . pending = !! local . dirty ;
  TLibPublish ( ctx , {
    state : "syncing" , epoch : local . epoch , cursor : local . cursor , pending : ! ! local . dirty
  }
  ) ;
  var remote ;
  try {
    remote = await TLibRequest ( ctx , token , "state" )
  }
  catch ( error ) {
    if ( ! error . identityRequired || ! local . initializeIntent || local . epoch !== null ) throw error ;
    await TLibIdentity ( ctx , token ) ;
    remote = await TLibRequest ( ctx , token , "state" )
  }
  if ( ! remote . initialized ) {
    if ( local . epoch !== null ) throw TLibError ( "CARE_TEMPLATE_EPOCH_CHANGED" ) ;
    if ( ! local . initializeIntent ) {
      var empty = {
        state : "ready" , epoch : null , cursor : 0 , pending : false
      }
      ;
      TLibPublish ( ctx , empty ) ;
      return empty
    }
    remote = await TLibRequest ( ctx , token , "initialize" , {
      namespace : "care-template-library" , protocol : 1
    }
    ) ;
    if ( ! remote . initialized ) throw TLibError ( "CARE_TEMPLATE_PROTOCOL_UNSUPPORTED" )
  }
  if ( local . epoch !== null && local . epoch !== remote . epoch ) throw TLibError ( "CARE_TEMPLATE_EPOCH_CHANGED" ) ;
  if ( local . epoch === null || local . needsBootstrap === true ) {
    await ctx . vault . bindCareTemplateEpoch ( token , {
      epoch : remote . epoch , floorSeq : remote . floorSeq , slotId : token . slotId
    }
    ) ;
    TLibFence ( ctx , token ) ;
    local = await ctx . vault . getCareTemplateSyncState ( token ) ;
    TLibFence ( ctx , token )
  }
  await TLibPull ( ctx , token , remote , local ) ;
  await TLibPush ( ctx , token , remote ) ;
  TLibFence ( ctx , token ) ;
  var final = await ctx . vault . getCareTemplateSyncState ( token ) ;
  TLibFence ( ctx , token ) ;
  ctx . pending = !! final . dirty ;
  var result = {
    state : final . dirty ? "pending" : "ready" , epoch : final . epoch , cursor : final . cursor , pending : ! ! final . dirty
  }
  ;
  TLibPublish ( ctx , result ) ;
  return result
}
function TLibStart() {
  // Automatic lifecycle triggers share one clock. Explicit UI calls and local
  // writes bypass that clock, but every caller respects the server's pause.
  var automatic = arguments[0] === true, ctx = TLibActive;
  if (!TLibCurrent(ctx)) return Promise.reject(TLibError("SESSION_CHANGED"));
  if (!TLibEnabled()) {
    TLibCancelScheduled(ctx);
    var disabled = { state: "disabled", pending: ctx.pending };
    TLibPublish(ctx, disabled);
    return Promise.resolve(disabled);
  }
  if (TLibFlight && TLibFlight.ctx === ctx) return TLibFlight.promise;
  var now = Date.now();
  if (ctx.retryAt && now < ctx.retryAt) {
    TLibSchedule(ctx, ctx.retryAt, !automatic);
    return Promise.reject(TLibError("CARE_TEMPLATE_RATE_LIMITED", 429));
  }
  if (automatic && ctx.nextAutomaticAt && now < ctx.nextAutomaticAt) {
    TLibSchedule(ctx, ctx.nextAutomaticAt, false);
    return Promise.resolve(TLibGetStatus());
  }
  TLibCancelScheduled(ctx);
  ctx.nextAutomaticAt = now + TLibAutomaticDelay;
  var flight = { ctx: ctx, promise: null, wakeVersion: ctx.localWakeVersion || 0 };
  flight.promise = Promise.resolve().then(function () { return TLibRun(ctx); }).catch(function (error) {
    TLibPublish(ctx, {
      state: error && error.code === "CARE_TEMPLATE_EPOCH_CHANGED" ? "blocked" : "error",
      pending: ctx.pending,
      error: { code: error && error.code || "CARE_TEMPLATE_SYNC_FAILED", httpStatus: error && error.httpStatus || null }
    });
    throw error;
  });
  TLibFlight = flight;
  function finish(error) {
    if (TLibFlight === flight) TLibFlight = null;
    if (!TLibCurrent(ctx) || !TLibEnabled()) return;
    if (error) {
      // A failed request must not turn an urgent local wake into a retry loop.
      // Pending ciphertext remains untouched until a later genuine ACK.
      if (ctx.retryAt > Date.now()) TLibSchedule(ctx, ctx.retryAt, true);
      else if (ctx.pending && error.code !== "CARE_TEMPLATE_EPOCH_CHANGED" && error.code !== "SESSION_CHANGED")
        TLibSchedule(ctx, Date.now() + TLibAutomaticDelay, true);
    } else if (ctx.pending || (ctx.localWakeVersion || 0) !== flight.wakeVersion) {
      // A local event can arrive after the last pending read of this flight.
      // Preserve that wake even if its caller received the existing promise.
      TLibSchedule(ctx, Date.now(), true);
    }
  }
  flight.promise.then(function () { finish(null); }, finish);
  return flight.promise;
}
/* A read-only session fence does not authorize deletion: the exact target
 * credentials must independently obtain a verified protected-state receipt. */
function TLibOperationContext() {
  var vault=o.VildaVault;
  if (!vault || typeof vault.captureSyncOperationSession!=="function" ||
      typeof vault.assertSyncOperationSession!=="function") throw TLibError("CARE_TEMPLATE_AUTHORITY_UNAVAILABLE");
  var ticket={ctx:{vault:vault,operationOnly:true},token:vault.captureSyncOperationSession()};
  TLibFence(ticket.ctx,ticket.token);
  return ticket;
}
async function TLibReadAuthority(ctx,token,target) {
  TLibFence(ctx,token);
  TLibMaterial(target);
  var state;
  try { state=await TLibRequest(ctx,token,"state",undefined,target); }
  catch(error) {
    TLibFence(ctx,token);
    if (!error.identityRequired) throw error;
    return {initialized:false,epoch:0,eventsStored:0,bytesStored:0,slotId:target.slotId};
  }
  TLibFence(ctx,token);
  if (!TLibInteger(state.eventsStored,0) || !TLibInteger(state.bytesStored,0) ||
      state.eventsStored!==state.headSeq-state.floorSeq ||
      (state.eventsStored===0)!==(state.bytesStored===0)) throw TLibError("CARE_TEMPLATE_PROTOCOL_UNSUPPORTED");
  return {initialized:state.initialized,epoch:state.epoch,eventsStored:state.eventsStored,
    bytesStored:state.bytesStored,slotId:target.slotId};
}
async function TLibGuardLegacyDelete(slotId,authToken,ticket) {
  var target={slotId:slotId,authToken:authToken}, operation=ticket||TLibOperationContext();
  TLibFence(operation.ctx,operation.token);
  var authority=await TLibReadAuthority(operation.ctx,operation.token,target);
  TLibFence(operation.ctx,operation.token);
  if (authority.initialized) throw u("Nie usunięto danych synchronizacji: konto ma chronioną bibliotekę szablonów.",
    "CARE_TEMPLATE_CLOUD_DELETE_BLOCKED");
  return function() { TLibFence(operation.ctx,operation.token); };
}
/* Explicit lifecycle guards need fresh authority even on a new device. This
 * probe neither opts into authoring nor reads or initializes the library DB. */
async function TLibInspectAuthority() {
  var vault=I(), userId=Bpw_konto(vault), ctx={vault:vault,userId:userId,authorityOnly:true};
  if (!userId || !TLibAuthorityCurrent(ctx)) throw TLibError("SESSION_CHANGED");
  if (!o.VildaCareTemplateModel || !o.VildaCareTemplateStore) {
    var plans=o.VildaCarePlans;
    if (!plans || typeof plans.ensureTemplateLibrary!=="function") throw TLibError("CARE_TEMPLATE_API_UNAVAILABLE");
    try { await plans.ensureTemplateLibrary({ui:false}); }
    catch {
      if (!TLibAuthorityCurrent(ctx)) throw TLibError("SESSION_CHANGED");
      throw TLibError("CARE_TEMPLATE_API_UNAVAILABLE");
    }
    if (!TLibAuthorityCurrent(ctx)) throw TLibError("SESSION_CHANGED");
  }
  if (!o.VildaCareTemplateModel || !o.VildaCareTemplateStore ||
      typeof vault.captureCareTemplateSession!=="function" || typeof vault.assertCareTemplateSession!=="function") {
    throw TLibError("CARE_TEMPLATE_API_UNAVAILABLE");
  }
  var token=await vault.captureCareTemplateSession();
  TLibFence(ctx,token);
  return TLibReadAuthority(ctx,token,token);
}
function TLibExplicit ( ) {
  if ( ! TLibCurrent ( TLibActive ) ) TLibActivate ( ) ;
  return TLibStart ( )
}
function TLibAutomatic() {
  if (TLibCurrent(TLibActive)) TLibStart(true).catch(function () {});
}
function TLibPullCycle ( options ) {TLibAutomatic(); return WorkspaceSyncDispatch("pull", true, function () { return Bdz_syncPull(options); });}
function TLibPushCycle ( options ) {TLibAutomatic(); return WorkspaceSyncDispatch("push", false, function () { return ht(options); });}
function TLibFullCycle ( ) {TLibAutomatic(); return WorkspaceSyncDispatch("full", true, function () { return Ht(); });}
o.VildaSync={syncPush:TLibPushCycle,syncPull:TLibPullCycle,syncFull:TLibFullCycle,activateTemplateLibrarySync:TLibActivate,deactivateTemplateLibrarySync:TLibDeactivate,syncTemplateLibrary:TLibExplicit,getTemplateLibrarySyncStatus:TLibGetStatus,continueTemplateLibrarySync:TLibAutomatic,inspectTemplateLibraryAuthority:TLibInspectAuthority,resetSessionPullGuard:Ut,getSyncStatus:xt,clearSyncState:Wt,deleteSyncSlot:Jt,onSyncStart:Zt,onSyncComplete:Qt,onSyncError:Rt,probeNewDevice:Xt,restorePrevBlob:qt,revokeAllDevices:$t,uploadToSlot:pt,deleteSlotWithMaterial:_t,_loadSyncState:PatientClinicalLoadState,_saveSyncState:PatientClinicalSaveState,_clearSyncStateForSlot:PatientClinicalClearState,detectApi:Bdz_detectApi,getDrainStatus:Bdz_getDrainStatus,getChangesCursor:Bdz_getChangesCursor,isPagedActive:Bdz_isPagedActive,isEventLogEnabled:Bze_isEventLogEnabled,pushEvents:Bze_pushEvents,flushOutbox:Bns_flush,scheduleFlush:Bns_planuj,flushKeepalive:Bns_keepalive,applyRealtimeFrame:Bpr_ramka}})(typeof window<"u"?window:typeof globalThis<"u"?globalThis:null);
