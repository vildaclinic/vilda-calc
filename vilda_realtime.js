(function(t){"use strict";if(!t||t.VildaRealtime&&t.VildaRealtime.__vildaRealtime)return;
/* A socket opened in the legacy lane must not deliver or send frames after the
 * vault selects an unavailable protected clinical format. Reuse its existing
 * disconnect/lifecycle machinery; the inactive route adds no network or timer. */
var PatientClinicalDisconnecting = false, PatientClinicalConnectionGeneration = 0;
function PatientClinicalRouteFailure(operation) {
  var vault = t && t.VildaVault;
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
  return error;
}
function PatientClinicalStopBlocked(operation) {
  var error = PatientClinicalRouteFailure(operation);
  if (!error) return false;
  if (!PatientClinicalDisconnecting) {
    PatientClinicalDisconnecting = true;
    try { M(); m = error.code; }
    finally { PatientClinicalDisconnecting = false; }
  }
  return true;
}
var G="https://vilda-sync.maciej-4b9.workers.dev",p=2e3,I=3e4,W=25e3,F=1e4,P=3e3,A=1500,e=null,i="closed",_=null,r=null,c=null,f=p,h=!1,L=0,C=0,T=0,m=null;function d(){try{return t.self===t.top}catch{return!1}}function B(){var n=String(t.VILDA_SYNC_WORKER_URL||G).replace(/\/$/,"");return n.replace(/^http/i,"ws")}function O(){var n=t.VildaSyncIntegration;return!!(n&&typeof n.isSyncEnabled=="function"&&n.isSyncEnabled())}function D(){try{return t.navigator?t.navigator.onLine!==!1:!0}catch{return!0}}function E(){var n=t.VildaVault;return!!(n&&typeof n.isUnlocked=="function"&&n.isUnlocked())}function k(){if(_){try{t.clearInterval(_)}catch{}_=null}if(r){try{t.clearTimeout(r)}catch{}r=null}}function J(){k(),_=t.setInterval(function(){if(PatientClinicalStopBlocked("realtime-send"))return;if(!(!e||e.readyState!==1)){try{e.send(JSON.stringify({type:"ping",ts:Date.now()}))}catch{}if(r)try{t.clearTimeout(r)}catch{}r=t.setTimeout(function(){try{e&&e.close()}catch{}},F)}},W)}function w(){if(!(h||c)){var n=f;f=Math.min(f*2,I),c=t.setTimeout(function(){c=null,V()},n)}}function V(){if(PatientClinicalStopBlocked("realtime-connect"))return;if(!(!d()||!O()||!E()||!D())&&!(i==="open"||i==="connecting")&&typeof t.WebSocket=="function"){var n=t.VildaVault;if(!(!n||typeof n.getSyncMaterial!="function")){var y=Date.now();if(y-L<A){!c&&!h&&(c=t.setTimeout(function(){c=null,V()},A));return}L=y,h=!1,i="connecting";var PatientClinicalAttempt=++PatientClinicalConnectionGeneration;Promise.resolve(n.getSyncMaterial()).then(function(v){if(PatientClinicalAttempt!==PatientClinicalConnectionGeneration)return;if(PatientClinicalStopBlocked("realtime-connect"))return;if(!v||!v.slotId||!v.authToken){i="closed",w();return}if(!E()||!d()){i="closed";return}var H=B()+"/v1/slots/"+v.slotId+"/socket",u;try{u=new t.WebSocket(H,["vilda-auth",v.authToken])}catch{i="closed",w();return}e=u,u.onopen=function(){if(e!==u)return;if(PatientClinicalStopBlocked("realtime-open"))return;i="open",f=p,C++,m=null,J();try{var Z=t.VildaSyncIntegration;Z&&typeof Z.pullNow=="function"&&Z.pullNow()}catch{}},u.onmessage=function(o){if(e!==u)return;if(PatientClinicalStopBlocked("realtime-receive"))return;var a=null;try{a=JSON.parse(o.data)}catch{a=null}if(a){if(a.type==="changed"){T=Date.now();try{var R=t.VildaSyncIntegration;R&&typeof R.pullNow=="function"&&R.pullNow()}catch{}}else if(a.type==="delta"){T=Date.now();try{var s=t.VildaSyncIntegration;s&&typeof s.applyDelta=="function"?s.applyDelta(a.payload):s&&typeof s.pullNow=="function"&&s.pullNow()}catch{}}else if(a.type==="pong"&&r){try{t.clearTimeout(r)}catch{}r=null}}},u.onclose=function(o){if(e!==u)return;if(PatientClinicalStopBlocked("realtime-close"))return;e===u&&(e=null),i="closed",m=o&&o.code?"close:"+o.code:"close",k(),w()},u.onerror=function(){if(e!==u)return;if(PatientClinicalStopBlocked("realtime-error"))return;m="error";try{u.close()}catch{}}}).catch(function(){if(PatientClinicalAttempt!==PatientClinicalConnectionGeneration)return;if(PatientClinicalStopBlocked("realtime-connect"))return;i="closed",w()})}}}function M(){PatientClinicalConnectionGeneration++;if(h=!0,c){try{t.clearTimeout(c)}catch{}c=null}if(k(),e){try{e.close()}catch{}e=null}i="closed",f=p}function l(){if(PatientClinicalStopBlocked("realtime-connect"))return;if(!(i==="open"||i==="connecting")){if(f=p,c){try{t.clearTimeout(c)}catch{}c=null}V()}}function K(){if(PatientClinicalStopBlocked("realtime-send"))return;if(!(!d()||!O()||!E()||!D())){if(i!=="open"||!e||e.readyState!==1){l();return}try{e.send(JSON.stringify({type:"ping",ts:Date.now()}))}catch{try{e.close()}catch{}return}if(r)try{t.clearTimeout(r)}catch{}r=t.setTimeout(function(){try{e&&e.close()}catch{}},P)}}var U=!1;function S(){if(U)return!0;var n=t.VildaVault;if(!n)return!1;U=!0;try{typeof n.onUnlock=="function"&&n.onUnlock(function(){t.setTimeout(l,500)})}catch{}try{typeof n.onLock=="function"&&n.onLock(function(){M()})}catch{}return!0}if(!S()){t.document&&t.document.addEventListener("vilda:auth-loaded",S);var Y=0,j=t.setInterval(function(){(S()||++Y>40)&&t.clearInterval(j)},250)}t.addEventListener&&(t.addEventListener("online",l),t.addEventListener("offline",function(){}),t.addEventListener("focus",K)),t.document&&t.document.addEventListener&&t.document.addEventListener("visibilitychange",function(){t.document.hidden||K()}),d()&&t.setTimeout(l,1200),t.VildaRealtime={__vildaRealtime:!0,connect:l,disconnect:M,status:function(){return i},info:function(){return{status:i,opens:C,lastChangeAt:T,lastError:m,supported:typeof t.WebSocket=="function",leader:d()}}}})(typeof window<"u"?window:this);
