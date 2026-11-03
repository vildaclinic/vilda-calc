(function(o){"use strict";
/* The vault owns clinical format selection. A public receipt or the independent
 * template-library channel never authorizes a clinical transport. The absent
 * method is only compatibility with old bundles/test doubles; a present method
 * returning anything other than the explicit legacy descriptor fails closed.
 * The ordinary inactive path is synchronous and does no identity/storage I/O. */
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
function Nv(t){try{if(!t||typeof t!="object")return;typeof o.document<"u"&&o.document.dispatchEvent&&o.document.dispatchEvent(new CustomEvent("vilda:sync-stale-device",{detail:t,bubbles:!1}))}catch{}}function $(t){return Ct+":"+t}function q(){try{var t=o.VildaVault,e=!!(t&&typeof t.isCloudOnlyMode=="function"&&t.isCloudOnlyMode()),a=o.VildaPersistence,r=!1;try{r=!!(a&&typeof a.isEphemeralMode=="function"&&a.isEphemeralMode()),!r&&t&&typeof t.isEphemeralMode=="function"&&t.isEphemeralMode()&&(r=!0),!r&&o.sessionStorage&&o.sessionStorage.getItem("vilda-ephemeral-session-v1")==="1"&&(r=!0)}catch{}if(e||r){if(a&&typeof a.getStorage=="function"){var n=a.getStorage("local");if(n)return n}return o.sessionStorage||null}if(a&&typeof a.getStorage=="function"){var i=a.getStorage("local-persistent");if(i)return i}}catch{}return o.localStorage||null}function m(t){PatientClinicalRequireLegacy("sync-state-read");try{var e=q(),a=e&&e.getItem($(t));if(!a)return{registered:!1,localEtag:null,lastSyncAt:null};var r=JSON.parse(a);return r&&typeof r=="object"?r:{registered:!1,localEtag:null,lastSyncAt:null}}catch{return{registered:!1,localEtag:null,lastSyncAt:null}}}function T(t,e){PatientClinicalRequireLegacy("sync-state-write");try{var a=q();a&&a.setItem($(t),JSON.stringify(e))}catch{}}/* P-SYNC-ROTACJA-KART (2026-10-08): po rotacji tozsamosci (revokeAllDevices) slot poprzedniej tozsamosci dostaje znacznik we wspolnym localStorage (vilda-sync-revoked-v1:<slotId>), takze w trybie chmurowym, gdzie stan slotu jest w pamieci karty. Inna karta tego profilu trzyma poprzednia tozsamosc w pamieci do odswiezenia strony. Synchronizacja nie rejestruje, nie wysyla, nie pobiera i nie przywraca slotu ze znacznikiem: konczy sie SYNC_IDENTITY_CHANGED. Odswiezenie strony wczytuje biezaca tozsamosc. */var Brv="vilda-sync-revoked-v1:";function Brv_oznacz(t){PatientClinicalRequireLegacy("sync-identity-marker");try{o.localStorage&&o.localStorage.setItem(Brv+t,new Date().toISOString())}catch{}}function Brv_jest(t){try{return!!(t&&o.localStorage&&o.localStorage.getItem(Brv+t))}catch{return!1}}function Brv_stop(t){if(Brv_jest(t))throw u("VildaSync: ten slot synchronizacji zosta\u0142 zast\u0105piony nowym (wylogowanie wszystkich urz\u0105dze\u0144). Je\u015Bli b\u0142\u0105d si\u0119 powtarza, od\u015Bwie\u017C stron\u0119.","SYNC_IDENTITY_CHANGED")}function C(t){PatientClinicalRequireLegacy("sync-state-clear");try{var e=q();e&&e.removeItem($(t))}catch{}}function j(){return(o.VILDA_SYNC_WORKER_URL||jt).replace(/\/$/,"")}async function f(t,e,a){PatientClinicalRequireLegacy("sync-http");var r=new AbortController,n=typeof a=="number"&&a>0?a:Mt,i=setTimeout(function(){r.abort()},n);try{var PatientClinicalResponse=await fetch(t,Object.assign({cache:"no-store"},e,{signal:r.signal}));PatientClinicalRequireLegacy("sync-http");return PatientClinicalResponse}catch(l){if(l.name==="AbortError"){var Bgb=e&&e.body&&typeof e.body.byteLength=="number"?e.body.byteLength:0,c=new Error("VildaSync: timeout \u017C\u0105dania do serwera ("+n+" ms"+(Bgb?", "+(Bgb>=1048576?(Bgb/1048576).toFixed(1)+" MB":Math.ceil(Bgb/1024)+" kB"):"")+").");throw c.code="TIMEOUT",Bgb&&(c.bytes=Bgb),c}throw l}finally{clearTimeout(i)}}function lt(t){return new Promise(function(e){setTimeout(e,t)})}/* P-SYNC-KURSOR (plan synchronizacji przyrostowej, etap 0): odstep przed ponownym pobraniem po 412 (If-Match nie pasuje, bo inne urzadzenie wlasnie wyslalo). Proba 1: 1 s, proba 2: 3 s (3^(proba-1) s), z rozrzutem x0,5-1,5. Dotad ponowienie szlo od razu, wiec dwa urzadzenia, ktore zderzyly sie na If-Match, startowaly znow w tej samej chwili; pobranie po odstepie widzi tez kolejne wysylki drugiego urzadzenia. */function Bod(t){return Math.round(1e3*Math.pow(3,t-1)*(.5+Math.random()))}function yt(t){var e=t.headers.get("Retry-After");if(!e)return st;var a=parseInt(e,10);return isFinite(a)&&a>0?a*1e3:st}function Lt(t){return t?t.trim().replace(/^"(.*)"$/,"$1"):null}function u(t,e,a){var r=new Error(t);return r.code=e||"SYNC_ERROR",a&&Object.assign(r,a),r}function I(){var t=o.VildaVault;if(!t||!t.isUnlocked())throw u("VildaSync: vault nie jest odblokowany. Zaloguj si\u0119 przed synchronizacj\u0105.","VAULT_LOCKED");return t}async function Vt(){try{var t=o.VildaVault;if(!t||typeof t.listPatients!="function")return!1;var e=await t.listPatients();return Array.isArray(e)&&e.length===0}catch{return!1}}var M=null,b="vilda-cloud-etag-v1:",Nt=(function(){try{return o.self===o.top}catch{return!1}})();function dt(t){try{return!!(Nt&&t&&typeof t.isPersistentCloudCacheEnabled=="function"&&t.isPersistentCloudCacheEnabled())}catch{return!1}}function Pt(t,e){try{return!dt(e)||typeof o.localStorage>"u"||!o.localStorage?null:o.localStorage.getItem(b+t)||null}catch{return null}}function ft(t,e,a){PatientClinicalRequireLegacy("cloud-etag-write");try{if(!dt(a)||typeof o.localStorage>"u"||!o.localStorage)return;e?o.localStorage.setItem(b+t,e):o.localStorage.removeItem(b+t)}catch{}}function vt(t){try{o.localStorage&&o.localStorage.removeItem(b+t)}catch{}}var Z=!1,Q="vilda-sync-pulled-v1";function P(){Z=!0;try{o.sessionStorage&&o.sessionStorage.setItem(Q,"1")}catch{}}function Ft(){if(Z)return!0;try{if(o.sessionStorage&&o.sessionStorage.getItem(Q)==="1")return!0}catch{}return!1}function Ut(){Z=!1;try{o.sessionStorage&&o.sessionStorage.removeItem(Q)}catch{}}function K(){try{var t=o.VildaVault;return!!(t&&typeof t.isCloudOnlyMode=="function"&&t.isCloudOnlyMode())}catch{return!1}}function y(t,e){for(var a=0;a<t.length;a++)try{t[a](e)}catch{}}function R(t){try{return t&&Array.isArray(t.patients)?t.patients.length:0}catch{return 0}}/* P-SYNC-MOST-STOPKA (przeglad adwersarza, soczewka czas): naraz trwa najwyzej jedna pelna wysylka. Z limitem do 180 s planowane wysylki integracji (I(), M(), V(), sejf w trybie chmurowym, syncFull) potrafily nakladac sie na trwajaca i dzielic lacze, az wszystkie konczyly sie TIMEOUT. Wywolania w trakcie scalaja sie w jedna wysylke w kolejce, ktora eksportuje najswiezszy stan i rusza po zakonczeniu biezacej, takze po jej bledzie. */var Bpf=null,Bpq=null,Bpk=!1;function ht(t){var PatientClinicalRejection=PatientClinicalRejected("sync-push");if(PatientClinicalRejection)return PatientClinicalRejection;/* P-SYNC-KURSOR (przeglad adwersarza): nowa wysylka rusza tylko, gdy nie trwa zadna i nie czeka kolejka. Wywolanie w chwili miedzy koncem wysylki (Bpf=null) a startem kolejki dolacza do kolejki, zamiast wysylac osobno bez keepalive. */if(!Bpf&&!Bpq){Bpf=Bht0(t);var x=function(){Bpf=null};Bpf.then(x,x);return Bpf}/* P-SYNC-KURSOR (uwaga Codex P2 do #574): wywolanie z keepalive (chowanie karty, M() integracji) moglo trafic do kolejki zalozonej wczesniej przez zwykle wywolanie. Kolejka brala opcje pierwszego wywolania, wiec flaga ginela. Teraz keepalive sumuje sie dla wszystkich wywolan scalonych w kolejce (PUT dostaje keepalive tylko do 60 000 B, jak dotad). */t&&t.keepalive&&(Bpk=!0);if(!Bpq){Bpq=Bpf.then(null,function(){}).then(function(){var Bkk=Bpk;Bpq=null,Bpk=!1;return ht(Bkk?{keepalive:!0}:t)})}return Bpq}async function Bht0(t){PatientClinicalRequireLegacy("sync-push");var e=I();y(L,{operation:"push"});var a=!!(t&&t.keepalive),r;try{r=await e.getSyncMaterial()}catch(O){throw y(k,{operation:"push",error:O}),O}var n=r.slotId,i=r.authToken,c=r.authTokenHash,l=r.syncEncKey,d=j(),s=m(n),Bss=!1;try{Brv_stop(n);for(var w=await e.exportSyncPayload(),S=new TextEncoder().encode(JSON.stringify(w)),h=await G(await Bgz_pakuj(S),l),D=R(w),_=S.length,g=1;g<=N;g++){/* P-SYNC-KURSOR: wysylka czyta tozsamosc synchronizacji raz, na starcie, a revokeAllDevices nie czeka na trwajaca wysylke (odstep po 412 wydluzyl jej czas). Przed kazda ponowna proba (po 412 albo 429) wysylka sprawdza, czy tozsamosc jest ta sama; po zmianie konczy sie SYNC_IDENTITY_CHANGED i nie wraca do starego slotu. Nastepna wysylka idzie na nowy slot. */if(g>1){var Bim=await e.getSyncMaterial();if(!Bim||Bim.slotId!==n)throw u("VildaSync: wysy\u0142ka przerwana \u2014 to\u017Csamo\u015B\u0107 synchronizacji zmieni\u0142a si\u0119 w trakcie (wylogowanie wszystkich urz\u0105dze\u0144). Nast\u0119pna wysy\u0142ka idzie ju\u017C na nowy slot.","SYNC_IDENTITY_CHANGED")}if(!s.registered){Brv_stop(n);var v=await f(d+"/v1/slots/"+n+"/register",{method:"POST",headers:{"Content-Type":"application/octet-stream","X-Auth-Token-Hash":c},body:h},Bgz_czas(h));if(v.status===201){var A=await v.json();PatientClinicalRequireLegacy("sync-push");/* P-SYNC-ROTACJA-KART: znacznik pojawil sie w trakcie rejestracji - slot jest kasowany jak w revokeAllDevices. */if(Brv_jest(n)){await _t(n,i).catch(function(){});C(n);Brv_stop(n)}s.registered=!0,s.localEtag=A.etag,s.rawSize=_,s.rawEtag=A.etag,s.lastSyncAt=new Date().toISOString(),T(n,s);var F={action:"registered",etag:A.etag,bytes:h.byteLength};return y(p,{operation:"push",result:F}),F}if(v.status===409){/* P-SYNC-STRAZNIK (decyzja wlasciciela 2026-10-05). Slot juz istnieje, a to urzadzenie nie ma jego stanu (nowe urzadzenie albo „Zresetuj stan synchronizacji”). Dotad wysylka brala ETag z /status, a scalenie bloba szlo w catch{}: blad scalania (MERGE_BUSY, siec, odszyfrowanie) nie przerywal wysylki i PUT z tym ETagiem nadpisywal chmure stanem, w ktorym nic z niej nie scalono. Teraz pelne pobranie (Y: status, blob, scalenie, ETag scalonej tresci) — jego blad przerywa wysylke. */await Y(),Bss=!0;var E=await e.exportSyncPayload(),rt=new TextEncoder().encode(JSON.stringify(E));h=await G(await Bgz_pakuj(rt),l),D=R(E),_=rt.length,s=m(n)}else if(v.status===429){if(g<N){await lt(yt(v));continue}throw u("VildaSync: zbyt wiele \u017C\u0105da\u0144 rejestracji. Spr\xF3buj za chwil\u0119.","RATE_LIMITED")}else if(!v.ok){var gt=await v.json().catch(function(){return{}});throw u("VildaSync: b\u0142\u0105d rejestracji slotu ("+v.status+"): "+(gt.error&&gt.error.message||""),"REGISTER_FAILED",{httpStatus:v.status})}}/* P-SYNC-STRAZNIK: ETag z /status bez scalenia to nadpisanie chmury. Strazniki ponizej (STALE_DEVICE_GUARD: pobranie w tej SESJI, nie tego ETagu) tego nie lapaly. Bez ETagu wysylka najpierw pobiera i scala w tej samej operacji; ETag z /status zostaje tylko po udanym pobraniu, ktore go nie dalo (brak bloba). */if(!s.localEtag&&!Bss){await Y(),Bss=!0;var Bse=await e.exportSyncPayload(),Bsr=new TextEncoder().encode(JSON.stringify(Bse));h=await G(await Bgz_pakuj(Bsr),l),D=R(Bse),_=Bsr.length,s=m(n)}if(!s.localEtag){var nt=await f(d+"/v1/slots/"+n+"/status",{method:"GET",headers:{Authorization:"Bearer "+i}});if(nt.status===401)throw C(n),u("VildaSync: b\u0142\u0105d uwierzytelnienia. Dane sync mog\u0142y zosta\u0107 usuni\u0119te.","AUTH_FAILED");if(nt.ok){var ta=await nt.json();PatientClinicalRequireLegacy("sync-push");s.localEtag=ta.etag||null,T(n,s)}}if(!Ft()&&s.registered&&s.localEtag)throw u("VildaSync: wstrzymano wysy\u0142k\u0119 \u2014 najpierw pobierz \u015Bwie\u017Cy stan z chmury (to urz\u0105dzenie nie wykona\u0142o jeszcze synchronizacji w tej sesji).","STALE_DEVICE_GUARD");if(D===0&&s.registered&&s.localEtag){var At=await f(d+"/v1/slots/"+n+"/status",{method:"GET",headers:{Authorization:"Bearer "+i}});if(At.ok){var it=await At.json().catch(function(){return{}}),X=it&&typeof it.size=="number"?it.size:0;/* P-SYNC-MOST-STOPKA (uwaga Codex P1 do #573): size z /status to rozmiar bloba po kompresji, a _ to surowe bajty JSON. Gdy urzadzenie zna surowy rozmiar tego samego bloba (rawSize/rawEtag z ostatniego scalenia, wysylki albo rejestracji przy tym samym ETagu), straznik porownuje surowe z surowym, jak przed kompresja. */it&&s.rawEtag&&it.etag===s.rawEtag&&typeof s.rawSize=="number"&&s.rawSize>X&&(X=s.rawSize);if(X>=Ot&&_<X/4)throw u("VildaSync: zablokowano wysy\u0142k\u0119 stanu bez pacjent\xF3w \u2014 serwer ma "+X+" B danych (lokalnie tylko "+_+" B). Najpierw wykonaj pe\u0142ne pobranie (pull).","WIPE_GUARD",{serverSize:X,localBytes:_})}}var Tt={"Content-Type":"application/octet-stream",Authorization:"Bearer "+i};s.localEtag&&(Tt["If-Match"]='"'+s.localEtag+'"');Brv_stop(n);var mt={method:"PUT",headers:Tt,body:h};try{a&&h&&h.byteLength<=6e4&&(mt.keepalive=!0)}catch{}var z=await f(d+"/v1/slots/"+n+"/blob",mt,Bgz_czas(h));if(z.status===200){var ot=await z.json();PatientClinicalRequireLegacy("sync-push");s.localEtag=ot.etag,s.rawSize=_,s.rawEtag=ot.etag,K()&&ft(n,ot.etag,e),s.lastSyncAt=new Date().toISOString(),T(n,s);var It={action:"uploaded",etag:ot.etag,bytes:h.byteLength};return y(p,{operation:"push",result:It}),It}if(z.status===412){if(g<N){await lt(Bod(g)),await Y(),Bss=!0;var Dt=await e.exportSyncPayload(),zt=new TextEncoder().encode(JSON.stringify(Dt));h=await G(await Bgz_pakuj(zt),l),D=R(Dt),_=zt.length,s=m(n);continue}throw u("VildaSync: konflikt danych po "+N+" pr\xF3bach scalenia. Spr\xF3buj ponownie za chwil\u0119.","CONFLICT")}if(z.status===429){if(g<N){await lt(yt(z));continue}throw u("VildaSync: zbyt wiele \u017C\u0105da\u0144 uploadu. Spr\xF3buj za chwil\u0119.","RATE_LIMITED")}if(z.status===401)throw C(n),u("VildaSync: b\u0142\u0105d uwierzytelnienia przy upload.","AUTH_FAILED");var kt=await z.json().catch(function(){return{}});throw u("VildaSync: upload nieudany ("+z.status+"): "+(kt.error&&kt.error.message||""),"UPLOAD_FAILED",{httpStatus:z.status})}throw u("VildaSync: przekroczono limit pr\xF3b push.","MAX_RETRIES_EXCEEDED")}catch(O){throw y(k,{operation:"push",error:O}),O}}function Gt(){try{if(typeof o.VILDA_INCR_SYNC=="boolean")return o.VILDA_INCR_SYNC;if(o.localStorage){var t=o.localStorage.getItem("vilda-incr-sync-v1");if(t==="1")return!0;if(t==="0")return!1}}catch(e){}return!0}var tt="vilda-sync-cursor-v1:";function bt(t){try{if(!o.localStorage)return 0;var e=parseInt(o.localStorage.getItem(tt+t),10);return isFinite(e)&&e>=0?e:0}catch{return 0}}function Kt(t,e){PatientClinicalRequireLegacy("sync-cursor-write");try{o.localStorage&&typeof e=="number"&&isFinite(e)&&e>=0&&o.localStorage.setItem(tt+t,String(e))}catch(a){}}function St(t){try{o.localStorage&&o.localStorage.removeItem(tt+t)}catch(e){}}/* P-SYNC-STRAZNIK (uwaga Codex P1 do #518): delta, ktorej scalenie konczy sie MERGE_BUSY (blokada pacjenta zajeta dluzej niz limit), nie moze zostac potwierdzona. Dotad catch{} ja polykal, a Yt i tak przesuwal kursor na headSeq — zmiany z tej delty nie bylo, dopoki nadawca nie wyslal pelnego stanu. Teraz MERGE_BUSY konczy partie (bez 30 s na kazda kolejna delte), Bsp=prawda, a Yt nie przesuwa kursora: nastepne pobranie stosuje partie od nowa (scalanie jest odporne na powtorzenie). Inne bledy jak dotad: zla delta nie blokuje kolejki. */var Bsp=!1;async function wt(t,e){PatientClinicalRequireLegacy("apply-sync-delta");Bsp=!1;/* P-SYNC-KURSOR (przeglad adwersarza; plan: kursor := max zastosowanego): zablokowany sejf nie stosuje delt (applyEncryptedDelta oddaje null albo zwykly blad), a drenaz idzie w tle po pobraniu. Gdy sejf zablokuje sie w trakcie partii, partia konczy sie jak przy MERGE_BUSY i kursor stoi; po odblokowaniu nastepne pobranie stosuje ja od nowa. */var Bul=function(){return typeof e.isUnlocked=="function"&&!e.isUnlocked()};for(var a=!1,r=0;r<t.length;r++){if(Bul()){Bsp=!0;break}var n=t[r];if(!(!n||!n.payload))try{PatientClinicalRequireLegacy("apply-sync-delta");var i=await e.applyEncryptedDelta(n.payload);PatientClinicalRequireLegacy("apply-sync-delta");i&&((i.addedPatientCount||0)>0||(i.deletedPatientCount||0)>0||(i.addedPatientNoteCount||0)>0||(i.updatedPatientNoteCount||0)>0||(i.deletedPatientNoteCount||0)>0||(i.mergedPatientCount||0)>0||(i.addedNoteCount||0)>0||(i.updatedNoteCount||0)>0||(i.deletedNoteCount||0)>0)&&(a=!0)}catch(Bsd){if(Bsd&&Bsd.patientClinicalUnavailable){Bsp=!0;throw Bsd}if(Bsd&&Bsd.vildaMergeBusy){Bsp=!0;if(typeof Bsd.code=="string"&&(Bsd.code.indexOf("CARE_LINEAGE_")===0||Bsd.code.indexOf("CARE_FORMAT_")===0)&&!Bul())y(k,{operation:"pull",error:Bsd});break}}}!Bsp&&Bul()&&(Bsp=!0);return a}function Et(t){try{typeof o.document<"u"&&o.document.dispatchEvent&&o.document.dispatchEvent(new CustomEvent("vilda:sync-merged",{detail:{source:t},bubbles:!1}))}catch{}}var at=!1;async function B(t,e,a,r){if(!at){at=!0;try{if(!r||typeof r.applyEncryptedDelta!="function")return;Gt()?await Yt(t,e,a,r):await Bt(t,e,a,r)}catch{}finally{at=!1}}}async function Bt(t,e,a,r){var n=await f(a+"/v1/slots/"+t+"/deltas",{method:"GET",headers:{Authorization:"Bearer "+e}},ct);if(!(!n||!n.ok)){var i=await n.json(),c=i&&Array.isArray(i.deltas)?i.deltas:[];c.length&&await wt(c,r)&&Et("delta-drain")}}async function Yt(t,e,a,r){Bsp=!1;var n=bt(t),i=await f(a+"/v1/slots/"+t+"/changes?since="+n,{method:"GET",headers:{Authorization:"Bearer "+e}},ct);if(!(!i||!i.ok)){var c=await i.json(),l=c&&Array.isArray(c.deltas)?c.deltas:[],s=l.length?await wt(l,r):!1;/* P-SYNC-KURSOR (plan synchronizacji przyrostowej, etap 0): kursor idzie na najwyzszy numer delty, ktora ta partia naprawde zwrocila, a nie na headSeq. Worker v36 nadaje numer w SlotHub przed zapisem delty do R2 (zapis po odpowiedzi, w waitUntil), a blad listy R2 daje pusta liste z biezacym headSeq. Dotad kursor przeskakiwal wtedy na headSeq i delt, ktorych jeszcze nie bylo w dzienniku, nikt juz nie pobieral. Teraz nastepne pobranie pyta od ostatniej zwroconej. Luka u dolu (dziennik przyciety: 200 delt, 3 dni) nie zatrzymuje kursora; tresc takiej delty przychodzi z pelna wysylka nadawcy, ktora Y() pobiera po zmianie ETagu. MERGE_BUSY jak dotad: kursor stoi. */for(var Bkm=n,Bki=0;Bki<l.length;Bki++){var Bks=l[Bki]&&l[Bki].seq;typeof Bks=="number"&&isFinite(Bks)&&Bks>Bkm&&(Bkm=Bks)}PatientClinicalRequireLegacy("sync-cursor");Bkm>n&&!Bsp&&Kt(t,Bkm),s&&Et("changes-drain")}}/* P-NOWE-URZADZENIE (decyzja wlasciciela 2026-10-12, etap 2): postep pierwszego pobrania na nowym urzadzeniu. Blob czytany strumieniem (body.getReader) zamiast arrayBuffer(): zdarzenie vilda:sync-download-progress {phase:"download",loaded,total} co najmniej co 100 ms i na koniec, potem {phase:"decrypt"} przed odszyfrowaniem; postep scalania pacjentow idzie jak dotad (vilda:vault-merge-progress). total: Content-Length odpowiedzi, a bez niego size z /status. Limit czasu f() konczy sie z naglowkami odpowiedzi, wiec samo cialo bloba nie mialo dotad zadnego limitu - zerwane polaczenie potrafilo wisiec bez konca, a ekran pobierania blokuje aplikacje. Teraz brak kolejnej porcji przez Mt (30 s) przerywa czytanie bledem TIMEOUT (z loaded i total). Bez strumieni: arrayBuffer() jak dotad i jedno zdarzenie po pobraniu. Bajty, odszyfrowanie, rozpakowanie i scalanie bez zmian. */function Bnd_zglos(t){try{typeof o.document<"u"&&o.document.dispatchEvent&&o.document.dispatchEvent(new CustomEvent("vilda:sync-download-progress",{detail:t,bubbles:!1}))}catch{}}function Bnd_mb(t){return t>=1048576?(t/1048576).toFixed(1)+" MB":Math.ceil(t/1024)+" kB"}function Bnd_krok(t,e,a){return new Promise(function(r,n){var i=setTimeout(function(){try{t.cancel().catch(function(){})}catch{}var c=new Error("VildaSync: timeout pobierania danych — brak postępu przez "+Math.round(Mt/1e3)+" s (pobrano "+Bnd_mb(e)+(a>0?" z "+Bnd_mb(a):"")+").");c.code="TIMEOUT",c.loaded=e,c.total=a,n(c)},Mt);t.read().then(function(c){clearTimeout(i),r(c)},function(c){clearTimeout(i),n(c)})})}async function Bnd_czytaj(t,e){var a;try{a=parseInt(t.headers.get("Content-Length"),10)||0}catch{a=0}a>0||(a=typeof e=="number"&&e>0?e:0);var r;try{r=t.body&&typeof t.body.getReader=="function"?t.body.getReader():null}catch{r=null}if(!r){var n=await t.arrayBuffer();return Bnd_zglos({phase:"download",loaded:n.byteLength,total:a>n.byteLength?a:n.byteLength}),n}var i=[],c=0,l=0;Bnd_zglos({phase:"download",loaded:0,total:a});for(;;){var d=await Bnd_krok(r,c,a);if(d.done)break;var S=d.value;if(!S||!S.byteLength)continue;i.push(S),c+=S.byteLength;var w=Date.now();w-l>=100&&(l=w,Bnd_zglos({phase:"download",loaded:c,total:a>c?a:c}))}Bnd_zglos({phase:"download",loaded:c,total:a>c?a:c});var h=new Uint8Array(c),D=0;for(var _=0;_<i.length;_++)h.set(i[_],D),D+=i[_].byteLength;return h.buffer}/* P-NOWE-URZADZENIE (etap 2, czerwony E2E odlamek 1/3 w CI #652): pierwsze pobranie danych na nowe urzadzenie ma wylacznosc. Wlacza ono synchronizacje od razu, wiec w trakcie (przy duzym blobie - minuty) inne wywolania pobieraly ten sam blob rownolegle: arkusz przypomnien 3 s po odblokowaniu (vilda_auth_ui.js wola syncPull z pominieciem flagi integracji) i panele powloki ladowane w tle (Start, Terminarz - pullNow w swojej ramce). Zmierzone w e2e: cztery rownolegle pobrania tego samego bloba, a zdarzenia postepu dwoch pobran w jednym dokumencie przeplataly sie na pasku okna. Teraz syncPull({pierwszePobranie:true}) (pullForNewDevice w vilda_sync_integration.js) trzyma blokade Web Locks w trybie wylacznym, a kazde inne pobranie (takze w syncFull, w wysylce i w restorePrevBlob) najpierw bierze i od razu zwalnia blokade wspoldzielona - czeka wiec tylko na trwajace pierwsze pobranie, we wszystkich ramkach i kartach tego profilu. Po nim widzi zapisany ETag i konczy sie "up-to-date" bez bloba. Zwykle pobrania nie czekaja na siebie nawzajem, jak dotad. Bez Web Locks (starsze przegladarki) albo przy bledzie blokady wylacznosc obejmuje sam dokument. */var Bpw_N="vilda-sync-pierwsze-pobranie-v1",Bpw_w=null;function Bpw_lk(){try{var t=o.navigator&&o.navigator.locks;return t&&typeof t.request=="function"?t:null}catch{return null}}function Bpw_wylacznie(t){var e=Bpw_lk(),a=!1,r=function(){return a=!0,t()},n=e?Promise.resolve().then(function(){return e.request(Bpw_N,{mode:"exclusive"},r)}).catch(function(l){if(a)throw l;return t()}):r(),i=Promise.resolve(n);Bpw_w=i;var c=function(){Bpw_w===i&&(Bpw_w=null)};return i.then(c,c),i}function Bpw_bariera(t){var e=Bpw_w?Bpw_w.then(function(){},function(){}):Promise.resolve();return t?e.then(function(){return t.request(Bpw_N,{mode:"shared"},function(){})}).then(function(){},function(){}):e}/* Care-plan records written by a client predating careContext can share the
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
function Bpw_sejfKonta(t,kto){if(!t||typeof t.applyEncryptedDelta!="function")return t;return{isUnlocked:function(){return!(typeof t.isUnlocked=="function"&&!t.isUnlocked())&&!Bpw_inneKonto(t,kto)},applyEncryptedDelta:function(x){return t.applyEncryptedDelta(x)}}}
function Bpw_dren(a,r,i,t,kto,Bdz_w){if(Bpw_inneKonto(t,kto))return;var Bdz_s=Bpw_sejfKonta(t,kto),Bdz_p=Bdz_wlaczone()?Bdz_B(a,r,i,Bdz_s):B(a,r,i,Bdz_s).catch(function(){});Bdz_w&&typeof Bdz_w=="object"&&Bdz_wyniki.set(Bdz_w,Bdz_p)}
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
    var odp = await f(url + '/v1/health', { method: 'GET' }, Bdz_HEALTH_MS);
    if (odp && odp.ok) {
      var c = await odp.json();
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
/* Te same 9 licznikow co wt (straznik rownosci w tests/unit/sync-dziennik-drenaz.test.mjs D37). */
function Bdz_czyZmiana(i) {
  return !!i && ((i.addedPatientCount || 0) > 0 || (i.deletedPatientCount || 0) > 0 || (i.addedPatientNoteCount || 0) > 0
    || (i.updatedPatientNoteCount || 0) > 0 || (i.deletedPatientNoteCount || 0) > 0 || (i.mergedPatientCount || 0) > 0
    || (i.addedNoteCount || 0) > 0 || (i.updatedNoteCount || 0) > 0 || (i.deletedNoteCount || 0) > 0);
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
        { method: 'GET', headers: { Authorization: 'Bearer ' + e } }, ct);
    } catch (x) { Bdz_stopWyjatku(w, x); return; }
    w.stron += 1;
    if (!Bdz_otwarty(r)) { w.stop = 'blokada'; return; }
    if (!odp.ok) {
      var cb;
      try { cb = await odp.json(); } catch (x) { cb = null; } if (!Bdz_otwarty(r)) { w.stop = 'blokada'; return; } // P-SESJA-ZAPISU: takze po tresci 401/429/503
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
    try { c = await odp.json(); }
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
      return;
    }
    if (c.requiresBase === true) {
      if (!Number.isSafeInteger(c.oldestSeq) || c.oldestSeq - 1 <= n) { delete Bdz_api[a]; w.stop = 'ksztalt'; return; }
      Bdz_kursorWGore(t, c.oldestSeq - 1); // nigdy z nextSince: pusta strona po /wipe ma nextSince = since
      w.stop = 'base';
      return;
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
        if (proby < Bdz_DZIURA_PROBY) { sw = 'dziura'; break; }
        w.przeskok = { od: oczek, do: s - 1 }; // trzeci drenaz z ta sama dziura: kursor nad brakujacymi numerami
        ost = s - 1; // przy busy na tym wierszu kursor stanie nad dziura (blokada i 'format': bez zapisu z tej strony)
      }
      w.wierszy += 1;
      if (!d.payload || d.gap === true) { w.zaslepki += 1; ost = s; oczek = s + 1; continue; } // jak wt: bez scalenia
      var z = await Bdz_zastosuj(d, r);
      if (z === 'busy' || z === 'blokada') { sw = z; break; }
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
        await Bdz_drenaz(t, e, a, r, n, w); // sesja sprawdzana na poczatku petli, przed pierwszym zadaniem
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
  if (Bdz_trwa) return Bdz_trwaSlot === t ? Bdz_trwa : Promise.resolve(null);
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
async function Bpw_pull(){PatientClinicalRequireLegacy("sync-pull");var CareReplay=null,CareReplayed=false;var t=I(),Bpw_kto=Bpw_konto(t);y(L,{operation:"pull"});var e;try{e=await t.getSyncMaterial()}catch(E){throw y(k,{operation:"pull",error:E}),E}PatientClinicalRequireLegacy("sync-pull");var a=e.slotId,r=e.authToken,n=e.syncEncKey,i=j(),c=m(a);K()&&M==null&&(M=Pt(a,t));try{Brv_stop(a);if(c.registered){var S=await f(i+"/v1/slots/"+a+"/status",{method:"GET",headers:{Authorization:"Bearer "+r}});if(Bpw_inneKonto(t,Bpw_kto))throw Bpw_przerwane();PatientClinicalRequireLegacy("sync-pull");if(S.status===401)throw C(a),u("VildaSync: b\u0142\u0105d uwierzytelnienia przy pull. Slot m\xF3g\u0142 zosta\u0107 usuni\u0119ty.","AUTH_FAILED");if(!S.ok)throw u("VildaSync: b\u0142\u0105d odczytu statusu ("+S.status+").","STATUS_FAILED",{httpStatus:S.status});var w=await S.json();if(Bpw_inneKonto(t,Bpw_kto))throw Bpw_przerwane();PatientClinicalRequireLegacy("sync-pull")}else{var l=await f(i+"/v1/slots/"+a+"/status",{method:"GET",headers:{Authorization:"Bearer "+r}});if(Bpw_inneKonto(t,Bpw_kto))throw Bpw_przerwane();PatientClinicalRequireLegacy("sync-pull");if(!l.ok){P();var d={action:"not-registered",httpStatus:l.status};return y(p,{operation:"pull",result:d}),d}var s=await l.json();if(Bpw_inneKonto(t,Bpw_kto))throw Bpw_przerwane();PatientClinicalRequireLegacy("sync-pull");c.registered=!0,c.localEtag=null,M=null,vt(a),St(a),T(a,c);var w=s}var h=K()?M:c.localEtag;CareReplay=h&&h===w.etag?await CareSyncReplay(t,a,w.etag):null;PatientClinicalRequireLegacy("sync-pull");if(h&&h===w.etag&&!CareReplay){var D=await Vt();if(Bpw_inneKonto(t,Bpw_kto))throw Bpw_przerwane();PatientClinicalRequireLegacy("sync-pull");if(D)c.localEtag=null,M=null,vt(a),St(a);else{P();var _={action:"up-to-date",etag:w.etag};return Bpw_dren(a,r,i,t,Bpw_kto,_),y(p,{operation:"pull",result:_}),_}}var g={Authorization:"Bearer "+r},v=CareReplay?null:K()?M:c.localEtag;v&&(g["If-None-Match"]='"'+v+'"');var A=await f(i+"/v1/slots/"+a+"/blob",{method:"GET",headers:g},Bgz_czas({byteLength:w&&typeof w.size=="number"?w.size:0}));if(Bpw_inneKonto(t,Bpw_kto))throw Bpw_przerwane();PatientClinicalRequireLegacy("sync-pull");if(A.status===304){P();var F={action:"up-to-date",etag:v};return Bpw_dren(a,r,i,t,Bpw_kto,F),y(p,{operation:"pull",result:F}),F}if(A.status===401)throw u("VildaSync: b\u0142\u0105d uwierzytelnienia przy pobieraniu bloba.","AUTH_FAILED");if(A.status===404){P();var H={action:"no-remote-blob"};return Bpw_dren(a,r,i,t,Bpw_kto,H),y(p,{operation:"pull",result:H}),H}if(!A.ok)throw u("VildaSync: b\u0142\u0105d pobierania danych ("+A.status+").","DOWNLOAD_FAILED",{httpStatus:A.status});var x=await Bnd_czytaj(A,w&&typeof w.size=="number"?w.size:0),W;PatientClinicalRequireLegacy("sync-pull");Bnd_zglos({phase:"decrypt"});try{W=await ut(x,n)}catch{throw u("VildaSync: b\u0142\u0105d odszyfrowania danych. Mo\u017Cliwa zmiana masterKey lub uszkodzenie danych.","DECRYPT_FAILED")}W=await Bgz_rozpakuj(W);var U;try{U=JSON.parse(new TextDecoder().decode(W))}catch{throw u("VildaSync: uszkodzone dane sync (nieprawid\u0142owy format JSON).","PARSE_FAILED")}if(Bpw_inneKonto(t,Bpw_kto))throw Bpw_przerwane();PatientClinicalRequireLegacy("sync-pull");PatientClinicalRequireLegacy("apply-sync-payload");var et=await t.mergeSyncPayload(U,{onProgress:function(E){try{typeof o.document<"u"&&o.document.dispatchEvent&&o.document.dispatchEvent(new CustomEvent("vilda:vault-merge-progress",{detail:E,bubbles:!1}))}catch{}}});PatientClinicalRequireLegacy("apply-sync-payload");var V=Lt(A.headers.get("ETag"))||w.etag;CareReplayed=true;c.localEtag=V,c.rawSize=W.byteLength,c.rawEtag=V,c.lastSyncAt=new Date().toISOString(),M=V,ft(a,V,t),T(a,c),P();var J={action:"merged",etag:V,mergeResult:et,staleDevice:et&&et.staleDevice||null};return Nv(J.staleDevice),Qcs(et&&et.clockSkew||null),Bpw_dren(a,r,i,t,Bpw_kto,J),y(p,{operation:"pull",result:J}),J}catch(E){/* P-SESJA-ZAPISU (przeglad 4, ADW4-3): blad pobrania po zalogowaniu innego konta albo blokadzie (np. /status 500, siec, limit czasu) — SESSION_CHANGED: nalezy do poprzedniej sesji. */var Bpw_e=Bpw_inneKonto(t,Bpw_kto)?Bpw_przerwane():E;throw y(k,{operation:"pull",error:Bpw_e}),Bpw_e}finally{CareSyncReplayDone(CareReplay,CareReplayed)}}async function Ht(){PatientClinicalRequireLegacy("sync-full");I(),y(L,{operation:"full"});try{var t=await Y(),e=await ht(),a={pull:t,push:e};PatientClinicalRequireLegacy("sync-full");return y(p,{operation:"full",result:a}),a}catch(r){throw y(k,{operation:"full",error:r}),r}}async function xt(){PatientClinicalRequireLegacy("sync-status");var t=I(),e=await t.getSyncMaterial();PatientClinicalRequireLegacy("sync-status");return m(e.slotId)}async function Wt(){PatientClinicalRequireLegacy("sync-state-clear");var t=I(),e=await t.getSyncMaterial();PatientClinicalRequireLegacy("sync-state-clear");C(e.slotId)}async function Jt(){PatientClinicalRequireLegacy("delete-sync-slot");
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
}async function $t(t){var Bws_obrot=!1;PatientClinicalRequireLegacy("revoke-all-devices");var e=I();if(typeof e.rotateSyncIdentity!="function")throw u("VildaSync.revokeAllDevices: vault nie wspiera rotacji to\u017Csamo\u015Bci.","NOT_SUPPORTED");y(L,{operation:"revoke"});try{var a=await e.getSyncMaterial();PatientClinicalRequireLegacy("revoke-all-devices");var r=a.slotId,n=a.authToken;/* P-SYNC-ROTACJA-KART: karta z poprzednia tozsamoscia nie obraca jej drugi raz (odswiezenie strony wczytuje biezaca). Znacznik zaraz po rotacji, przed rejestracja nowego slotu i kasowaniem starego, wiec obowiazuje takze, gdy ktorys z tych krokow sie nie uda. */Brv_stop(r);var i=await e.rotateSyncIdentity(t);Bws_obrot=!0;PatientClinicalRequireLegacy("revoke-all-devices");var c=await e.getSyncMaterial();PatientClinicalRequireLegacy("revoke-all-devices");var l=c.slotId;l!==r&&Brv_oznacz(r);var d=await e.exportSyncPayload(),s=new TextEncoder().encode(JSON.stringify(d)),w=await G(await Bgz_pakuj(s),c.syncEncKey),S=await pt(l,c.authToken,c.authTokenHash,w);PatientClinicalRequireLegacy("revoke-all-devices");var h=m(l)||{};h.registered=!0,h.localEtag=S.etag||null,h.lastSyncAt=new Date().toISOString(),T(l,h);var D=!1;try{var _=await _t(r,n);D=_.action==="deleted"||_.action==="absent"}catch{D=!1}PatientClinicalRequireLegacy("revoke-all-devices");C(r);var g={recoveryKey:i.recoveryKey,oldSlotId:r,newSlotId:l,oldSlotRevoked:D};Bws_poRotacji();return y(p,{operation:"revoke",result:g}),g}catch(v){Bws_obrot&&Bws_poRotacji();throw y(k,{operation:"revoke",error:v}),v}}async function qt(){PatientClinicalRequireLegacy("restore-prev-blob");var t=I();y(L,{operation:"restore-prev"});try{var e=await t.getSyncMaterial(),a=e.slotId,r=e.authToken;Brv_stop(a);var n=j(),i=await f(n+"/v1/slots/"+a+"/blob/restore-prev",{method:"POST",headers:{Authorization:"Bearer "+r}});if(i.status===404)throw u("VildaSync: brak zarchiwizowanej poprzedniej wersji na serwerze.","NO_ARCHIVE");if(i.status===401)throw u("VildaSync: b\u0142\u0105d uwierzytelnienia przy przywracaniu.","AUTH_FAILED");if(!i.ok){var c=await i.json().catch(function(){return{}});throw u("VildaSync: przywracanie nieudane ("+i.status+"): "+(c.error&&c.error.message||""),"RESTORE_FAILED",{httpStatus:i.status})}var l=await i.json();PatientClinicalRequireLegacy("restore-prev-blob");var d=m(a);d.localEtag=null,T(a,d);var s=await Y(),w={restored:l,pull:s};return y(p,{operation:"restore-prev",result:w}),w}catch(S){throw y(k,{operation:"restore-prev",error:S}),S}}function Zt(t){typeof t=="function"&&L.push(t)}function Qt(t){typeof t=="function"&&p.push(t)}function Rt(t){typeof t=="function"&&k.push(t)}/* Care-template relay: explicit opt-in, one coalesced phase beside the existing
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
function TLibPullCycle ( options ) {
  TLibAutomatic ( ) ;
  // P-SYNC-STRONY: Bdz_syncPull bez opcji czekajNaDrenaz zwraca tę samą obietnicę co Y.
  return Bdz_syncPull ( options )
}
function TLibPushCycle ( options ) {
  TLibAutomatic ( ) ;
  return ht ( options )
}
function TLibFullCycle ( ) {
  TLibAutomatic ( ) ;
  return Ht ( )
}
o.VildaSync={syncPush:TLibPushCycle,syncPull:TLibPullCycle,syncFull:TLibFullCycle,activateTemplateLibrarySync:TLibActivate,deactivateTemplateLibrarySync:TLibDeactivate,syncTemplateLibrary:TLibExplicit,getTemplateLibrarySyncStatus:TLibGetStatus,continueTemplateLibrarySync:TLibAutomatic,inspectTemplateLibraryAuthority:TLibInspectAuthority,resetSessionPullGuard:Ut,getSyncStatus:xt,clearSyncState:Wt,deleteSyncSlot:Jt,onSyncStart:Zt,onSyncComplete:Qt,onSyncError:Rt,probeNewDevice:Xt,restorePrevBlob:qt,revokeAllDevices:$t,uploadToSlot:pt,deleteSlotWithMaterial:_t,_loadSyncState:PatientClinicalLoadState,_saveSyncState:PatientClinicalSaveState,_clearSyncStateForSlot:PatientClinicalClearState,detectApi:Bdz_detectApi,getDrainStatus:Bdz_getDrainStatus,getChangesCursor:Bdz_getChangesCursor,isPagedActive:Bdz_isPagedActive}})(typeof window<"u"?window:typeof globalThis<"u"?globalThis:null);
