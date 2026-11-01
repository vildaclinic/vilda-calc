(function(a){"use strict";var o=a.document,d={terminarz:{src:"terminarz.html?embedded=1",dockPath:"terminarz.html",title:"Terminarz",noScrollTopBtn:!0},lab:{src:"przelicznik-jednostek.html?embedded=1",dockPath:"przelicznik-jednostek.html",title:"Jednostki laboratoryjne"},klirens:{src:"kalkulator-klirens.html?embedded=1",dockPath:"kalkulator-klirens.html",title:"Kalkulator klirensu"},docpro:{src:"docpro.html?embedded=1",dockPath:"docpro.html",title:"DocPro"},start:{src:"index.html?embedded=1",dockPath:"index.html",title:"Start"},homa:{src:"homa-ir.html?embedded=1",dockPath:"homa-ir.html",title:"HOMA-IR"},steroidy:{src:"steroidy.html?embedded=1",dockPath:"steroidy.html",title:"Steroidy"},notatki:{src:"notatki.html?embedded=1",dockPath:"notatki.html",title:"Notatki"},ustawienia:{src:"ustawienia.html?embedded=1",dockPath:"ustawienia.html",title:"Ustawienia"},edu:{src:"materialy-edukacyjne.html?embedded=1",dockPath:"materialy-edukacyjne.html",title:"Materia\u0142y edukacyjne"},cukrzyca:{src:"cukrzyca.html?embedded=1",dockPath:"cukrzyca.html",title:"Cukrzyca"}},Et=8e3,l=Object.create(null),c=null,b=null;function y(t){
  // Publiczna nazwa trasy zawsze staje sie jednym ze stalych kluczy ramki.
  // Nie przepuszczamy obiektu z wlasna konwersja klucza do dalszych operacji.
  switch(t){
    case "terminarz":return "terminarz";
    case "lab":return "lab";
    case "klirens":return "klirens";
    case "docpro":return "docpro";
    case "start":return "start";
    case "homa":return "homa";
    case "steroidy":return "steroidy";
    case "notatki":return "notatki";
    case "ustawienia":return "ustawienia";
    case "edu":return "edu";
    case "cukrzyca":return "cukrzyca";
    default:return "terminarz";
  }
}
/* P-PWA-PATIENT-SESSION: only the active document owns the final pre-reload
   flush. Quarantine all old frames afterwards so their unload handlers cannot
   replace it with an older same-patient form. The flag belongs to this host. */
var Su_updateReloadPending=false,Su_updateReloadPreparing=false;
function Su_canFlushForAppUpdate(){
  var entry=c&&l[c],frame=entry&&entry.frame;
  if(!entry||!entry.loaded||entry.stale||!frame||frame.hidden||frame.isConnected===false)return false;
  try{
    var win=frame.contentWindow,doc=frame.contentDocument;
    if(!win||!doc||win.document!==doc||win.__vildaPersistRestoring||Gp5_obcy(win))return false;
    if(win.VildaDobAge&&typeof win.VildaDobAge.restorePending==="function"&&win.VildaDobAge.restorePending())return false;
    if(win.VildaDataImportExport&&typeof win.VildaDataImportExport.isMainSessionRestorePending==="function"&&win.VildaDataImportExport.isMainSessionRestorePending())return false;
    var vault=win.VildaVault;
    return !(vault&&typeof vault.isUnlocked==="function"&&vault.isUnlocked()===false);
  }catch{return false}
}
function Su_prepareForAppReload(){
  if(Su_updateReloadPending||Su_updateReloadPreparing)return true;
  Su_updateReloadPreparing=true;
  try{
    if(Su_canFlushForAppUpdate())Gp_f(c);
    Su_updateReloadPending=true;
    return true;
  }finally{Su_updateReloadPreparing=false}
}
function Su_reloadForAppUpdate(){
  if(Su_updateReloadPending||Su_updateReloadPreparing)return true;
  try{
    Su_prepareForAppReload();
    a.location.reload();
    return true;
  }catch{
    Su_updateReloadPending=false;
    return false;
  }
}
function Su_isAppUpdateReloadPending(){return Su_updateReloadPending}
// pagehide cannot be cancelled and runs before iframe pagehide handlers.
// beforeunload remains unblocked so cancelling navigation keeps the form live.
a.addEventListener("pagehide",Su_prepareForAppReload,true);
a.addEventListener("pageshow",function(event){
  if(event&&event.persisted){Su_updateReloadPending=false;Su_updateReloadPreparing=false}
},true);
function W(){var t=String(a.location.hash||"").match(/^#\/([a-z]+)/);return y(t&&t[1])}function O(t){return t=String(t||""),/#\/terminarz/.test(t)||/(^|\/)terminarz\.html(\?|#|$)/.test(t)?"terminarz":/#\/lab/.test(t)||/przelicznik-jednostek\.html(\?|#|$)/.test(t)?"lab":/#\/klirens/.test(t)||/kalkulator-klirens\.html(\?|#|$)/.test(t)?"klirens":/#\/docpro/.test(t)||/(^|\/)docpro\.html(\?|#|$)/.test(t)?"docpro":/#\/start/.test(t)||/(^|\/)index\.html(\?|#|$)/.test(t)?"start":/#\/homa/.test(t)||/(^|\/)homa-ir\.html(\?|#|$)/.test(t)?"homa":/#\/steroidy/.test(t)||/(^|\/)steroidy\.html(\?|#|$)/.test(t)?"steroidy":/#\/notatki/.test(t)||/(^|\/)notatki\.html(\?|#|$)/.test(t)?"notatki":/#\/ustawienia/.test(t)||/(^|\/)ustawienia\.html(\?|#|$)/.test(t)?"ustawienia":/#\/edu/.test(t)||/(^|\/)materialy-edukacyjne\.html(\?|#|$)/.test(t)?"edu":/#\/cukrzyca/.test(t)||/(^|\/)cukrzyca\.html(\?|#|$)/.test(t)?"cukrzyca":null}function F(viewHeight){try{var t=o.getElementById("mobileBottomDock");if(!t)return 0;var e=t.getBoundingClientRect();if(!e||!e.height)return 0;var r=viewHeight>0?viewHeight:a.visualViewport&&a.visualViewport.height||a.innerHeight||0;if(!r)return 0;var n=Math.round(r-e.top);return n>0&&n<r?n:0}catch{return 0}}function U(){try{var t=l[c],e=t&&t.frame&&t.frame.contentDocument,r=e&&e.activeElement;if(!r)return!1;var n=r.tagName;if(n==="TEXTAREA"||n==="SELECT"||r.isContentEditable)return!0;if(n==="INPUT"){var i=(r.getAttribute("type")||"text").toLowerCase();return!/^(checkbox|radio|button|submit|reset|image|range|color|file|hidden)$/.test(i)}return!1}catch{return!1}}function q(t){var e=(t>0?t:0)+"px";/* P-DYMKI: dol zajety w powloce = dock + wiekszy z jej przyciskow (#appShellTermFab 54px, #appShellScrollTop 44px; oba stoja na dock+14px) + 4px luzu. Rezerwujemy zawsze, gdy dock ma wysokosc — z tego samego powodu, co w ios26-ui.js: stabilna pozycja zamiast skakania. */var Dw=t>0?Math.round(t)+14+54+4:0;Object.keys(l).forEach(function(r){try{var n=l[r],i=n.frame.contentDocument;if(!i||!i.body)return;var u=i.getElementById("vilda-shell-dock-spacer");u||(u=i.createElement("div"),u.id="vilda-shell-dock-spacer",u.setAttribute("aria-hidden","true"),u.style.cssText="width:100%;flex:0 0 auto;pointer-events:none;background:transparent;",i.body.appendChild(u),n._dockSpacerH=null),n._dockSpacerH!==e&&(u.style.height=e,i.documentElement&&(i.documentElement.style.setProperty("--vilda-shell-dock-h",e),Dw>0?i.documentElement.style.setProperty("--vilda-dol-wolny",Dw+"px"):i.documentElement.style.removeProperty("--vilda-dol-wolny")),n._dockSpacerH=e)}catch{}});/* P-DYMKI: ta sama zmienna na korzeniu powloki — baner synchronizacji (vilda_chrome.js) zyje w dokumencie nadrzednym, nie w ramce. */try{Dw>0?o.documentElement.style.setProperty("--vilda-dol-wolny",Dw+"px"):o.documentElement.style.removeProperty("--vilda-dol-wolny")}catch{}}var $=-1,V=-1,K=-1;
/* P-OBROT-TELEFONU: viewport, tryb telefonu i geometria chrome zmieniają się
   w niezależnych zdarzeniach. Czytamy ich bieżący stan raz przed malowaniem,
   zamiast dodawać ponowny pomiar 200 ms po obrocie. ResizeObserver dotyczy
   nagłówka, Docka i content-box body, nigdy wysokości panelu, którą zapisujemy. */
var Sl_frame=0,Sl_recover=false,Sl_allowFocusedResize=false,Sl_lastLandscape=null;
var Sl_observer=null,Sl_header=null,Sl_dock=null,Sl_body=null,Sl_focusedViewport=0,Sl_rotationViewport=null,Sl_lastViewport=null;
function Sl_isPhone(){
  return !!(o.documentElement&&o.documentElement.classList.contains("vilda-phone"));
}
function Sl_noteMode(){
  var landscape=!!(o.documentElement&&o.documentElement.classList.contains("vilda-phone-landscape"));
  if(Sl_isPhone()&&Sl_lastLandscape!==null&&landscape!==Sl_lastLandscape){
    Sl_allowFocusedResize=true;
    var viewport=a.visualViewport;
    // Chronimy tylko pomiar, który nadal jest taki sam jak odczytany
    // przed zmianą trybu. Już świeży VV (paski Safari / zoom) ma pierwszeństwo.
    Sl_rotationViewport=viewport&&Sl_lastViewport&&viewport.height===Sl_lastViewport.height&&(viewport.scale||1)===Sl_lastViewport.scale?{height:viewport.height,scale:viewport.scale||1}:null;
  }
  if(!Sl_isPhone())Sl_rotationViewport=null;
  Sl_lastLandscape=landscape;
}
function Sl_watchGeometry(){
  if(typeof a.ResizeObserver!=="function")return;
  if(!Sl_observer)Sl_observer=new a.ResizeObserver(function(){if(Sl_isPhone())Sl_syncGeometry(false)});
  var header=o.querySelector("header"),dock=o.getElementById("mobileBottomDock");
  // Body ma stałą wysokość i border-box. Jego content-box reaguje także na
  // późny safe-area padding, który przesuwa header bez zmiany jego rozmiaru.
  if(o.body!==Sl_body){
    if(Sl_body)Sl_observer.unobserve(Sl_body);
    Sl_body=o.body;if(Sl_body)Sl_observer.observe(Sl_body);
  }
  if(header!==Sl_header){
    if(Sl_header)Sl_observer.unobserve(Sl_header);
    Sl_header=header;if(header)Sl_observer.observe(header);
  }
  if(dock!==Sl_dock){
    if(Sl_dock)Sl_observer.unobserve(Sl_dock);
    Sl_dock=dock;if(dock)Sl_observer.observe(dock);
  }
}
function Sl_flush(){
  Sl_frame=0;Sl_watchGeometry();v();
  if(Sl_recover){Sl_recover=false;J()}
}
function Sl_schedule(recover){
  Sl_noteMode();if(recover===true)Sl_recover=true;
  if(Sl_frame)return;
  if(typeof a.requestAnimationFrame==="function")Sl_frame=a.requestAnimationFrame(Sl_flush);
  else Sl_flush();
}
function Sl_resize(){if(Sl_isPhone())Sl_schedule(true);else v()}
function Sl_viewportResize(){
  // Opóźnione odtworzenie po klawiaturze zostaje. Zwykły obrót telefonu
  // wyrównuje tylko ewentualnie przesuniętą powłokę, bez scrollowania iframe.
  if(!Sl_isPhone()){j(160);v();return}
  var focused=U();if(focused)j(160);
  Sl_schedule(!focused);
}
function Sl_orientation(){if(Sl_isPhone())Sl_schedule(true);else a.setTimeout(v,200)}
function Sl_syncGeometry(recover){
  // Mode-change jest po klasach wszystkich iframe, a ResizeObserver przed
  // malowaniem. Oba muszą uzgodnić panel w tej samej klatce, nie dopiero
  // w kolejnym rAF. Zapis panelu nie zmienia rozmiaru obserwowanych elementów.
  Sl_noteMode();
  if(Sl_frame&&typeof a.cancelAnimationFrame==="function")a.cancelAnimationFrame(Sl_frame);
  if(recover)Sl_recover=true;
  Sl_flush();
}
function Sl_phoneLayout(){Sl_syncGeometry(true)}
function Sl_focusOut(){if(Sl_isPhone())Sl_schedule(false)}
function v(){var t=o.querySelector(".app-shell-main");if(t){var e=0;try{e=a.visualViewport&&a.visualViewport.height||a.innerHeight||0}catch{e=a.innerHeight||0}
// Nie oddajemy panelu starej wysokości VV po uzgodnieniu nowego trybu.
// Pierwszy świeży pomiar (także zoom) kończy tę ochronę bez timera.
var viewport=a.visualViewport;
if(Sl_rotationViewport&&(!Sl_isPhone()||!viewport||viewport.height!==Sl_rotationViewport.height||(viewport.scale||1)!==Sl_rotationViewport.scale))Sl_rotationViewport=null;
// Odczyt zapisujemy także gdy wysokość panelu pozostaje bez zmian lub pole ma fokus.
Sl_lastViewport=viewport&&viewport.height>0?{height:viewport.height,scale:viewport.scale||1}:null;
var focused=U();if(!focused)Sl_focusedViewport=0;
if(e&&(!focused||Sl_allowFocusedResize||Sl_isPhone()&&Sl_focusedViewport>0)){
  // Tylko rzeczywista zmiana trybu telefonu unieważnia wysokość zamrożoną
  // podczas edycji. Layout viewport chroni tu przed pomiarem samego pasa
  // nad klawiaturą; dalsze resize samej klawiatury znowu zachowują wysokość.
  if(!focused&&Sl_rotationViewport)e=o.documentElement&&o.documentElement.clientHeight||a.innerHeight||e;
  if(focused){
    if(Sl_allowFocusedResize){
      // visualViewport może jeszcze opisywać poprzednią orientację.
      // Najpierw aktualny layout viewport; VV wyłącznie jako fallback.
      Sl_focusedViewport=o.documentElement&&o.documentElement.clientHeight||a.innerHeight||e;
      // Nowa szerokość ma własną bazę klawiatury, nie wysokość starego pionu.
      Kb_szer=a.innerWidth||0;Kb_wys=Sl_focusedViewport;
    }
    // Późny rozmiar chrome/safe-area może skorygować panel. Wysokość bazowa
    // pozostaje zamrożona aż do blur lub następnego rzeczywistego obrotu.
    e=Sl_focusedViewport;
  }
  Sl_allowFocusedResize=false;var r=0;try{var n=o.querySelector("header");/* P-KLAWIATURA: dolna krawedz naglowka liczona od gory dokumentu (offsetTop + wysokosc), nie sama wysokosc — body ma padding-top: env(safe-area-inset-top), wiec na iPhonie z wycieciem panel wystawal 59 px pod ekran, a cala powloka dawala sie przesunac. offsetTop nie zalezy od przewiniecia ani od transformacji naglowka. */n&&(r=Math.round((n.offsetTop||0)+n.getBoundingClientRect().height)||0)}catch{r=0}var i=F(e),u=Math.round(Math.max(e-r,240)),s=tt();if(!(u===$&&i===V&&s===K)){$=u,V=i,K=s,t.style.height=u+"px",q(i);try{o.documentElement.style.setProperty("--vilda-shell-dock-h",i+"px")}catch{}}}}}function Y(){var t=o.getElementById("mobileBottomDock");if(!(!t||t.hidden)&&!(t.classList.contains("is-hidden")||t.classList.contains("is-keyboard-hidden")))try{t.style.transform="translateZ(0)",a.requestAnimationFrame(function(){a.requestAnimationFrame(function(){t.style.transform=""})})}catch{}}var M=[".desktop-layout",".main-content",".app-shell-main","#appPanes"];/* P-KLAWIATURA-2: klawiatura liczona od najwiekszej wysokosci okna widzianej przy tej szerokosci (Kb_podstawa), nie od biezacego innerHeight. Gdyby iOS w PWA skracal przy klawiaturze takze innerHeight, St() uznawalby ja za schowana, a J() cofalby przesuniecie powloki, ktorym iOS odslonil pole — pole wracaloby pod klawiature. visualViewport podnosi podstawe tylko bez aktywnego pola; obrot ekranu (zmiana szerokosci o >4 px) liczy ja od nowa. Ten sam wzorzec co w vilda_klawiatura.js (nowaPodstawa) i ios26-ui.js. */var Kb_szer=-1,Kb_wys=0;function Kb_podstawa(t){var e=a.innerHeight||o.documentElement&&o.documentElement.clientHeight||0,r=a.innerWidth||0;Math.abs(r-Kb_szer)>4&&(Kb_szer=r,Kb_wys=0);Kb_wys=Math.max(Kb_wys,e,!U()&&t&&t.height||0);return Kb_wys}function St(){var t=null;try{t=a.visualViewport,Kb_podstawa(t)}catch{}if(!U())return!1;try{if(!t||!t.height)return!0;var e=Kb_podstawa(t);return e>0&&e-t.height>100}catch{return!0}}function wt(){var t=[0];try{t.push(a.scrollY||a.pageYOffset||0)}catch{}try{t.push(o.scrollingElement&&o.scrollingElement.scrollTop||0)}catch{}try{t.push(o.documentElement&&o.documentElement.scrollTop||0)}catch{}try{t.push(o.body&&o.body.scrollTop||0)}catch{}for(var e=0;e<M.length;e+=1)try{var r=o.querySelector(M[e]);r&&t.push(r.scrollTop||0,r.scrollLeft||0)}catch{}return Math.max.apply(null,t)}var G=0;function J(){if(!St()&&!(wt()<=0)){try{a.scrollTo({top:0,left:0,behavior:"instant"})}catch{try{a.scrollTo(0,0)}catch{}}[o.scrollingElement,o.documentElement,o.body].forEach(function(t){if(t)try{t.scrollTop&&(t.scrollTop=0),t.scrollLeft&&(t.scrollLeft=0)}catch{}}),M.forEach(function(t){try{var e=o.querySelector(t);e&&(e.scrollTop&&(e.scrollTop=0),e.scrollLeft&&(e.scrollLeft=0))}catch{}}),v()}}function j(t){a.clearTimeout(G),G=a.setTimeout(J,t||80)}function N(){return o.getElementById("appShellSkeleton")}function X(){var t=N();t&&(t.hidden=!0)}function z(){var t=N();t&&(t.hidden=!1,t.className="app-shell-skeleton",t.textContent="\u0141adowanie\u2026")}function Lt(t){var e=N();if(e){e.hidden=!1,e.className="app-shell-skeleton is-error",e.innerHTML='<div class="app-shell-error"><p class="app-shell-error__msg">Nie uda\u0142o si\u0119 za\u0142adowa\u0107 panelu. Najpewniej trwa aktualizacja aplikacji.</p><div class="app-shell-error__btns"><button type="button" id="appShellRetry">Spr\xF3buj ponownie</button><button type="button" id="appShellOpen">Otw\xF3rz bezpo\u015Brednio</button></div></div>';var r=o.getElementById("appShellRetry"),n=o.getElementById("appShellOpen");r&&r.addEventListener("click",function(){B(c)}),n&&n.addEventListener("click",function(){try{a.location.href=d[y(c)].dockPath}catch{}})}}function g(t){var e=l[t];e&&(e.timer&&a.clearTimeout(e.timer),e.timer=a.setTimeout(function(){c===t&&!e.loaded&&Lt(t)},Et))}function bt(t){try{var e=t.contentDocument;return!e||!e.documentElement?!1:e.documentElement.classList.contains("vilda-embedded")}catch{return!1}}var Z=!1;function kt(){if(!Z){Z=!0;var t=a.navigator;if(!(!t||!t.serviceWorker||!t.serviceWorker.getRegistration)){var e=function(r){if(r&&typeof r.postMessage=="function")try{r.postMessage({type:"SKIP_WAITING"})}catch{}};try{t.serviceWorker.getRegistration().then(function(r){if(r){r.waiting&&e(r.waiting);try{r.update&&r.update()}catch{}typeof r.addEventListener=="function"&&r.addEventListener("updatefound",function(){var n=r.installing;!n||typeof n.addEventListener!="function"||n.addEventListener("statechange",function(){n.state==="installed"&&t.serviceWorker.controller&&e(r.waiting||n)})})}}).catch(function(){})}catch{}}}}function Tt(t,e){if(Sn_focusTarget&&Sn_focusTarget.route===t)Sn_cancelPaneFocus();if(t===c||t==="start")Sn_cancelRequest();Sn_quietClose(t);e.navigationGeneration+=1;e.loaded=!1,kt(),c===t&&(z(),e.retried||(e.retried=!0,a.setTimeout(function(){c===t&&!e.loaded&&B(t)},1500)),g(t))}function _(t){if(t=y(t),l[t])return l[t];var e=o.getElementById("appPanes");if(!e)return null;var r=o.createElement("iframe");r.className="app-pane",r.title=d[t].title,r.setAttribute("loading","eager"),r.setAttribute("referrerpolicy","same-origin"),r.hidden=!0;var n={frame:r,loaded:!1,timer:0,retried:!1,navigationGeneration:0};return r.addEventListener("load",function(){n.przewiniecie=null;if(!bt(r)){Tt(t,n);return}n.loaded=!0,n.navigationGeneration+=1,c===t&&Dpd_invalidate(),n.sessionStamp=Gp_s(),n.retried=!1,n.timer&&(a.clearTimeout(n.timer),n.timer=0),n._dockSpacerH=null,q(V>=0?V:F());try{r.contentDocument.addEventListener("focusout",Sl_focusOut)}catch{}c===t&&(X(),v(),at(),ut(),dt(),vt()),Sn_tryFocusPane(),Sn_deliverTarget(),Pt()}),r.src=d[t].src,e.appendChild(r),l[t]=n,n}var At=3,Q=!1;function tt(){return Object.keys(l).length}function Pt(){Ss_refresh(true);Q||(Q=!0,a.setTimeout(function(){Object.keys(d).forEach(function(t){tt()>=At||l[t]||_(t)})},1200))}function B(t){t=y(t);if(t===c)Dpd_invalidate();if(Sn_focusTarget&&Sn_focusTarget.route===t)Sn_cancelPaneFocus();if(t===c||t==="start"){Sn_cancelRequest();b=null}var Sn_reloadOwned=Sn_auth&&Sn_auth.route===t&&Sn_isAuthHistoryCurrent(Sn_auth.win);Sn_quietClose(t);if(Sn_reloadOwned&&!Sn_pendingBack){Sn_pendingBack={navigation:null};try{a.history.back()}catch{Sn_pendingBack=null}}if(Sn_target&&Sn_target.route===t)Sn_target.delivered=false;var e=l[t];if(!e){_(t),z(),g(t);return}e.loaded=!1;e.navigationGeneration+=1;Dpd_mirror();var r=d[t].src.indexOf("?")>=0?"&":"?";e.frame.src=d[t].src+r+"_r="+Date.now(),z(),g(t)}/* P-POWLOKA-PANELE (zgloszenie wlasciciela 2026-09-28): przelaczenie paneli nie wywoluje pagehide, wiec panel docelowy startowal albo budzil sie bez aktualnej sesji glownej (pusty formularz DocPro po szybkim przejsciu ze Start, albo tylko szesc pol z lustra bez daty urodzenia). Teraz: przed przelaczeniem panel zrodlowy zapisuje wspolny stan i sesje glowna z force (Gp_f), a panel docelowy - jesli sesja glowna zmienila sie od jego ostatniego odtworzenia (odcisk Gp_s bez pola timestampISO) - odtwarza wspolny stan i sesje glowna ponownie (Gp_p); panel tworzony dopiero teraz startuje juz po zapisie. Po kazdym przelaczeniu panel docelowy odswieza karte Podsumowanie wynikow po dwu klatkach (Gp_u): przeliczenie glownego formularza idzie przez requestAnimationFrame, ktore w ukrytym panelu moze czekac na widocznosc, a karta byla renderowana przed nim i nic jej potem nie odswiezalo (czerwony E2E odlamek 2/3 w CI: komplet pol, ale podsumowanie bez BMI). Rejestr: docs/clinical/ALGORITHMS.md, P-POWLOKA-PANELE. */function Gp_w(t){var e=t?l[t]:null;if(!e||!e.frame)return null;try{return e.frame.contentWindow||null}catch{return null}}function Gp_s(){try{var t=Gp_w(c)||Gp_w("start"),e=t&&t.VildaPersistence;if(!e||typeof e.readMainSession!="function")return"";var r=e.readMainSession();if(!r||typeof r!="object")return"";var n=Object.assign({},r);delete n.timestampISO;var i=JSON.stringify(n),u=0,s;for(s=0;s<i.length;s+=1)u=u*31+i.charCodeAt(s)|0;return i.length+":"+u}catch{return""}}function Gp_f(t){var e=Gp_w(t);if(!e)return;try{typeof e.vildaPersistFlushNow=="function"&&e.vildaPersistFlushNow({force:!0})}catch{}try{e.vildaSession&&typeof e.vildaSession.saveNow=="function"&&e.vildaSession.saveNow({force:!0})}catch{}}function Gp_u(n){try{if(!n||typeof n.requestAnimationFrame!="function")return;n.requestAnimationFrame(function(){n.requestAnimationFrame(function(){try{typeof n.updateProfessionalSummaryCard=="function"&&n.updateProfessionalSummaryCard()}catch{}})})}catch{}}/* P-POWLOKA-OBCY (2026-10-06): panel, w ktorym INNA ramka wczytala INNEGO pacjenta (vilda_panel_pacjent.js: dokument nieaktualny), nie przejmuje samego identyfikatora (P-POWLOKA-ID) ani nie naklada migawki sesji na formularz poprzedniego pacjenta. W tle jest bezczynny: odswiezanie paneli (It) go pomija, a jego zapisy odrzuca adapter. Przy pokazaniu (Gp_p) powloka przeladowuje ramke przez location.reload() - bez wpisu w historii, bez anulowania zadan trasy, z nakladka "Ladowanie" - i swiezy dokument startuje ze stanu karty jak panel otwierany pierwszy raz; niedoreczony cel trasy (Sn_target) idzie do niego po load. protokolPanelu w VildaShell mowi ramce, ze powloka to robi (starsza powloka - modul w ramce nieczynny). Rejestr: docs/clinical/ALGORITHMS.md, P-POWLOKA-OBCY. */function Gp5_obcy(n){try{var e=n&&n.VildaPanelPacjent;return!!(e&&typeof e.nieaktualny=="function"&&e.nieaktualny())}catch{return!1}}function Gp5_przeladuj(t,e,n){if(t===c)Dpd_invalidate();try{n.VildaPanelPacjent.utrwal()}catch{}if(Sn_target&&Sn_target.route===t)Sn_target.delivered=!1;e.loaded=!1;e.navigationGeneration+=1;e.sessionStamp=null;Dpd_mirror();z();g(t);try{n.location.reload()}catch{B(t)}}function Gp_p(t,e){if(!e||!e.loaded)return;var n=Gp_w(t);if(!n)return;if(Gp5_obcy(n)){Gp5_przeladuj(t,e,n);return}var r=Gp_s();if(r!==e.sessionStamp){e.sessionStamp=r;try{typeof n.vildaPersistRestoreAll=="function"&&n.vildaPersistRestoreAll()}catch{}try{n.vildaSession&&typeof n.vildaSession.restore=="function"&&n.vildaSession.restore()}catch{}}/* P-SPOZYCIE-POWROT (polecenie właściciela 2026-10-13): pokazywany panel kończy od razu, a nie w setTimeout(0), końcowy krok odtworzenia stanu (parowanie wierszy, przeliczenie; vilda_persist_runtime.js) — także zaległy po odświeżeniu w tle (It). Kolejność jak dotąd: stan wspólny, sesja, krok końcowy. Bez tego pierwsza klatka Start pokazywała kartę „Szacowane spożycie energii” bez wiersza historii, a treść pod nią skakała. */try{typeof n.vildaPersistRestoreFinishNow=="function"&&n.vildaPersistRestoreFinishNow()}catch{}Gp_u(n)}function It(){try{Object.keys(l).forEach(function(t){if(t!=="start"){var e=l[t];if(!(!e||!e.loaded||!e.frame)){var r=null;try{r=e.frame.contentWindow}catch{r=null}if(r){if(Gp5_obcy(r))return;try{if(typeof r.vildaPersistRestoreAll=="function"){r.vildaPersistRestoreAll();try{typeof r.__vildaClcrRehydrate=="function"&&r.__vildaClcrRehydrate()}catch{}return}}catch{}try{if(typeof r.__vildaHomaRehydrate=="function"){r.__vildaHomaRehydrate();return}}catch{}}}}})}catch{}}function et(t){var e=o.getElementById("mobileBottomDock");if(e)for(var r=e.querySelectorAll(".mobile-bottom-dock__item"),n=0;n<r.length;n+=1){var i=r[n],u=O(i.getAttribute("href")),s=u===t;i.classList.toggle("is-active",!!s),s?i.setAttribute("aria-current","page"):i.removeAttribute("aria-current")}}var Ot=160,E=null,m=null;function S(){var t=l[c];if(!t||!t.frame)return null;try{return{w:t.frame.contentWindow,d:t.frame.contentDocument}}catch{return null}}function rt(){var t=S();if(!t||!t.d)return null;try{var e=t.d.querySelector(".vilda-auth-root");if(!e)return null;var r=t.w.getComputedStyle(e).display;return r!=="none"?e:null}catch{return null}}function Vt(){var t=S();if(!t)return 0;var e=rt();if(e)try{return e.scrollTop||0}catch{return 0}var r=[0];try{r.push(t.w.scrollY||0)}catch{}try{r.push(t.d.scrollingElement&&t.d.scrollingElement.scrollTop||0)}catch{}try{r.push(t.d.documentElement&&t.d.documentElement.scrollTop||0)}catch{}try{r.push(t.d.body&&t.d.body.scrollTop||0)}catch{}return Math.max.apply(null,r)}function nt(){if(E){var t=d[c];if(t&&t.noScrollTopBtn){E.classList.remove("is-visible");return}E.classList.toggle("is-visible",Vt()>Ot)}}function zt(){var t=S();if(t){var e=rt();if(e){try{e.scrollTo?e.scrollTo({top:0,behavior:"smooth"}):e.scrollTop=0}catch{try{e.scrollTop=0}catch{}}return}try{t.w&&t.w.scrollTo&&t.w.scrollTo({top:0,behavior:"smooth"})}catch{try{t.w.scrollTo(0,0)}catch{}}[t.d&&t.d.scrollingElement,t.d&&t.d.documentElement,t.d&&t.d.body].forEach(function(r){if(r)try{r.scrollTo?r.scrollTo({top:0,behavior:"smooth"}):r.scrollTop=0}catch{try{r.scrollTop=0}catch{}}})}}function at(){if(m){try{m.doc&&m.doc.removeEventListener("scroll",m.handler,!0)}catch{}try{m.win&&m.win.removeEventListener("scroll",m.handler)}catch{}m=null}var t=o.getElementById("mobileBottomDock");t&&t.classList.remove("is-hidden");var e=S();if(e&&e.d&&e.w){var r=function(){nt()};try{e.d.addEventListener("scroll",r,!0)}catch{}try{e.w.addEventListener("scroll",r,{passive:!0})}catch{}m={win:e.w,doc:e.d,handler:r}}nt()}var x=null,H=0;function gt(){if(x||!o.body)return x;var t=o.createElement("button");return t.type="button",t.id="appShellTermFab",t.setAttribute("aria-label","Nowy termin"),t.textContent="+",t.addEventListener("click",function(){var e=S(),r=e&&e.d?e.d.querySelector("#tzFab, .tz-fab"):null;if(r)try{r.click()}catch{}}),o.body.appendChild(t),x=t,t}function it(){var t=gt();if(t){var e=!1;if(c==="terminarz")try{var r=S(),n=r&&r.d,i=n&&n.querySelector("#tzFab, .tz-fab"),u=!!(n&&n.getElementById("tzNewTermOverlay")),s=n&&n.querySelector(".vilda-auth-root"),f=!!(s&&a.getComputedStyle&&r.w.getComputedStyle(s).display!=="none");e=!!(i&&!u&&!f)}catch{e=!1}t.classList.toggle("is-visible",e)}}function Bt(){a.clearInterval(H),H=0,it(),c==="terminarz"&&(H=a.setInterval(it,600))}function Rt(){if(E||!o.body)return E;var t=o.createElement("button");return t.type="button",t.id="appShellScrollTop",t.setAttribute("aria-label","Przewi\u0144 na g\xF3r\u0119"),t.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5"/><path d="M6 11l6-6 6 6"/></svg>',t.addEventListener("click",zt),o.body.appendChild(t),E=t,t}function Ct(t){try{for(var e=o.querySelectorAll(".sidebar-nav a[href], .chrome-drawer-nav a[href]"),r=0;r<e.length;r+=1){var n=e[r],i=O(n.getAttribute("href"))===t;n.classList.toggle("is-active",!!i),i?n.setAttribute("aria-current","page"):n.removeAttribute("aria-current")}}catch{}}function ot(t){try{if(!a.__vildaGaReady)return;var e=a.gtag;if(typeof e!="function")return;e("event","page_view",{page_title:d[t]&&d[t].title?d[t].title+" \u2013 Waga i wzrost":o.title,page_path:"/"+t,page_location:String(a.location.href)})}catch{}}/* P-CHIP-POWLOKA: nagłówek korzysta z gotowego właściciela danych pacjenta.
   Trasy bez formularza nie mają własnego wskaźnika; ukryte ramki nigdy nie
   dostają wymuszonego stanu. Ich referencję odświeża wyłącznie protokół SSI. */
var Ss_routes=["start","docpro","klirens"],Ss_source=null,Ss_cache=null,Ss_patient=null,Ss_bound=Object.create(null),Ss_hostBound=false;
function Ss_patientId(){try{return a.sessionStorage&&a.sessionStorage.getItem("vildaCurrentPatientId")||null}catch{return null}}
function Ss_sessionAvailable(){
  try{var session=a.VildaSession;
    return !(session&&typeof session.hasSessionKey==="function"&&!session.hasSessionKey())&&
      !(session&&typeof session.isGuestMode==="function"&&session.isGuestMode());
  }catch{return false}
}
function Ss_clearMirror(){
  var chip=o.getElementById("vildaPatientChip");if(!chip)return;
  var classes=(chip.className||"").split(/\s+/).filter(function(value){return value&&value.indexOf("vilda-save-state--")!==0});
  chip.className=classes.join(" ");chip.removeAttribute("title");
}
function Ss_invalidate(){Ss_source=null;Ss_cache=null;Ss_clearMirror()}
function Ss_syncPatient(){var patient=Ss_patientId();if(patient!==Ss_patient){Ss_patient=patient;Ss_invalidate()}}
function Ss_owner(route){
  if(Ss_routes.indexOf(route)===-1)return null;
  var entry=l[route],frame=entry&&entry.frame;
  if(!entry||!entry.loaded||entry.stale||!frame||frame.isConnected===false)return null;
  try{
    var win=frame.contentWindow,doc=frame.contentDocument,api=win&&win.VildaSaveStatusIndicator;
    if(!win||!doc||win.document!==doc||!api||Gp5_obcy(win)||
      typeof api.isReadyForSharedReference!=="function"||!api.isReadyForSharedReference())return null;
    return {route:route,entry:entry,win:win,doc:doc,api:api};
  }catch{return null}
}
function Ss_select(){
  var active=Ss_owner(c);if(active)return active;
  var previous=Ss_source&&Ss_owner(Ss_source.route);
  if(previous&&previous.doc===Ss_source.doc)return previous;
  for(var index=0;index<Ss_routes.length;index++){var owner=Ss_owner(Ss_routes[index]);if(owner)return owner}
  return null;
}
function Ss_view(owner){
  try{
    var api=owner.api,state=typeof api.getState==="function"?api.getState():"hidden";
    if(["hidden","new_patient","saved","dirty","saving","error"].indexOf(state)===-1)state="hidden";
    var chip=owner.doc.getElementById("vildaPatientChip"),title=typeof api._buildTitleAttr==="function"?api._buildTitleAttr(state):chip&&chip.getAttribute("title")||"";
    var snapshot={getState:function(){return state}};
    ["getLastSavedAtISO","getLastSnapshotCount","getLastPatientName","getReferenceFingerprint"].forEach(function(method){
      if(typeof api[method]!=="function")return;var value=api[method]();snapshot[method]=function(){return value};
    });
    if(typeof api._relativeTime==="function")snapshot._relativeTime=api._relativeTime.bind(api);
    snapshot._buildTitleAttr=function(){return title};
    return {state:state,title:title,api:snapshot};
  }catch{return null}
}
function Ss_mirror(view){
  var chip=o.getElementById("vildaPatientChip");if(!chip||!view)return;
  var classes=(chip.className||"").split(/\s+/).filter(function(value){return value&&value.indexOf("vilda-save-state--")!==0});
  classes.push("vilda-save-state--"+view.state);var next=classes.join(" ");
  if(chip.className!==next)chip.className=next;
  if(view.title){if(chip.getAttribute("title")!==view.title)chip.setAttribute("title",view.title)}else chip.removeAttribute("title");
}
function Ss_bind(){
  if(!Ss_hostBound&&typeof a.addEventListener==="function"){
    Ss_hostBound=true;
    a.addEventListener("storage",function(event){
      if(event&&["vildaCurrentPatientId","vilda-save-ref-v1","vilda-vault-session-v2"].indexOf(event.key)!==-1)Ss_refresh(true);
    });
  }
  Ss_routes.forEach(function(route){
    var entry=l[route],frame=entry&&entry.frame;if(!frame||!entry.loaded)return;
    try{
      var win=frame.contentWindow,doc=frame.contentDocument,previous=Ss_bound[route];
      if(!win||!doc||win.document!==doc||previous&&previous.doc===doc)return;
      if(previous){if(previous.observer)previous.observer.disconnect();previous.cleanup.forEach(function(remove){remove()})}
      var binding={doc:doc,observer:null,cleanup:[]};Ss_bound[route]=binding;
      function listen(target,type,callback){
        if(!target||typeof target.addEventListener!=="function")return;
        target.addEventListener(type,callback);binding.cleanup.push(function(){target.removeEventListener(type,callback)});
      }
      var refresh=function(){Ss_refresh(true)},clear=function(){Ss_invalidate()};
      ["vilda:patient-loaded","vilda:persist-restored","vilda:main-session-restored","vilda:auth-boot-settled","vilda:dob-restored"].forEach(function(type){listen(doc,type,refresh)});
      listen(win,"vilda:user-state-cleared",clear);listen(doc,"vilda:user-state-cleared",clear);
      var chip=doc.getElementById("vildaPatientChip");
      if(chip&&typeof a.MutationObserver==="function"){
        binding.observer=new a.MutationObserver(function(){Ss_refresh(false)});
        binding.observer.observe(chip,{attributes:true,attributeFilter:["class","title"]});
      }
    }catch{}
  });
}
function Ss_refresh(reconcile){
  Ss_syncPatient();Ss_bind();
  if(!Ss_sessionAvailable()){Ss_invalidate();return}
  var owner=Ss_select();
  if(owner){
    if(reconcile&&typeof owner.api.reconcileFromSharedReference==="function")owner.api.reconcileFromSharedReference();
    if(!Ss_owner(owner.route))return;
    var view=Ss_view(owner);if(!view)return;
    Ss_source=owner;Ss_cache={patientId:Ss_patient,view:view};Ss_mirror(view);return;
  }
  // Odtwarzanie tego samego pacjenta chwilowo blokuje wszystkie źródła.
  // Zachowaj wyłącznie ostatni odczyt, bez wywoływania metod niegotowej ramki.
  if(Ss_cache&&Ss_cache.patientId===Ss_patient)Ss_mirror(Ss_cache.view);
}
function Dt(){
  Ss_syncPatient();if(!Ss_sessionAvailable()){Ss_invalidate();return null}
  var owner=Ss_select();return owner?owner.api:Ss_cache&&Ss_cache.patientId===Ss_patient?Ss_cache.view.api:null;
}
function ct(){Ss_refresh(false)}function ut(){Ss_refresh(true)}/* P-DOKUMENTY-PACJENTA: the menu owns no patient snapshot. Only the active,
   ready Start/DocPro controller may open a document dialog in the shell. */
var Dpd_epoch=0,Dpd_document=null;
function Dpd_source(){
  if(c!=="start"&&c!=="docpro")return null;
  var entry=l[c],frame=entry&&entry.frame;
  if(!entry||!entry.loaded||entry.stale||!frame||frame.hidden||frame.isConnected===false)return null;
  try{
    var win=frame.contentWindow,doc=frame.contentDocument;
    if(!win||!doc||win.document!==doc||Gp5_obcy(win))return null;
    var expected=new a.URL(d[c].src,a.location.href).pathname;
    if(win.location.pathname!==expected)return null;
    return {route:c,entry:entry,frame:frame,win:win,doc:doc,generation:entry.navigationGeneration,epoch:Dpd_epoch};
  }catch{return null}
}
function Dpd_current(owner){
  var current=Dpd_source();
  return !!(owner&&current&&owner.route===current.route&&owner.entry===current.entry&&
    owner.frame===current.frame&&owner.win===current.win&&owner.doc===current.doc&&
    owner.generation===current.generation&&owner.epoch===current.epoch);
}
function Dpd_isSourceCurrent(win){var current=Dpd_source();return !!(current&&current.win===win)}
function Dpd_state(owner){
  if(c!=="start"&&c!=="docpro")return {disabled:true,reason:"Dokumenty pacjenta są dostępne na stronie Start i DocPro.",busy:false};
  var api=owner&&owner.win.VildaPatientDocuments;
  if(api&&typeof api.getState==="function")try{return api.getState()}catch{}
  return {disabled:true,reason:"Trwa przygotowywanie dokumentów pacjenta.",busy:false};
}
function Dpd_mirror(){
  var button=o.getElementById("patientDocumentsBtnSidebar");if(!button)return;
  var state=Dpd_state(Dpd_source()),disabled=!!(state.disabled||state.busy);
  if(disabled)button.setAttribute("aria-disabled","true");else button.removeAttribute("aria-disabled");
  button.removeAttribute("disabled");
  if(state.busy)button.setAttribute("aria-busy","true");else button.removeAttribute("aria-busy");
  if(disabled&&state.reason){button.setAttribute("data-tip",state.reason);button.setAttribute("title",state.reason)}
  else{button.removeAttribute("data-tip");button.removeAttribute("title")}
  if(a.VildaChrome&&typeof a.VildaChrome.refreshPatientDocumentsAction==="function")a.VildaChrome.refreshPatientDocumentsAction();
}
function Dpd_tip(button,reason){
  try{if(a.VildaChrome&&typeof a.VildaChrome.showTip==="function")a.VildaChrome.showTip(button,reason)}catch{}
}
function Dpd_open(button){
  var opener=button._vildaDocumentsOpener||button,owner=Dpd_source(),state=Dpd_state(owner);
  Dpd_mirror();
  if(!owner||state.disabled||state.busy){Dpd_tip(opener,state.reason||"Dokumenty pacjenta są teraz niedostępne.");return}
  var api=owner.win.VildaPatientDocuments;if(!api||typeof api.open!=="function")return;
  var isCurrent=function(){return Dpd_current(owner)};
  try{Promise.resolve(api.open({opener:opener,hostDocument:o,isCurrent:isCurrent})).catch(function(){
    if(isCurrent())Dpd_tip(opener,"Nie udało się otworzyć dokumentów pacjenta. Spróbuj ponownie.");
  }).finally(Dpd_mirror)}catch{if(isCurrent())Dpd_tip(opener,"Nie udało się otworzyć dokumentów pacjenta. Spróbuj ponownie.")}
}
function Dpd_connect(){
  if(Dpd_document)Dpd_document.removeEventListener("vilda:patient-documents-state",Dpd_mirror);
  var owner=Dpd_source();Dpd_document=owner&&owner.doc;
  if(Dpd_document)Dpd_document.addEventListener("vilda:patient-documents-state",Dpd_mirror);
  Dpd_mirror();
}
function Dpd_invalidate(){
  Dpd_epoch+=1;
  try{o.dispatchEvent(new a.CustomEvent("vilda:patient-documents-owner-change"))}catch{}
}
var T=null,R=["saveDataBtnSidebar","addVisitNoteBtnSidebar","patientDocumentsBtnSidebar"];
function st(){Dpd_mirror();try{var t=c&&l[c],e=null;try{e=t&&t.frame?t.frame.contentDocument:null}catch{return}if(!e)return;R.forEach(function(r){if(r==="patientDocumentsBtnSidebar")return;var n=e.getElementById(r),i=o.getElementById(r);if(!(!n||!i)){n.getAttribute("aria-disabled")==="true"?i.setAttribute("aria-disabled","true"):i.removeAttribute("aria-disabled"),n.hasAttribute("disabled")?i.setAttribute("disabled",""):i.removeAttribute("disabled");var u=n.getAttribute("data-tip");u?i.setAttribute("data-tip",u):i.removeAttribute("data-tip");var s=n.getAttribute("title");s?i.setAttribute("title",s):i.removeAttribute("title")}})}catch{}}var lt=!1;function Mt(){if(!lt){var t=0;R.forEach(function(e){var r=o.getElementById(e);r&&(t+=1,r._cfBound=!0,r.addEventListener("click",function(n){try{n.preventDefault();if(e==="patientDocumentsBtnSidebar"){Dpd_open(r);return}/* P-NOTATKI-2 (G19): powloka lustruje aria-disabled/data-tip (st()), ale klik i tak leciat do ramki,
   gdzie dymek odmowy rodzil sie w dokumencie ramki, przy (8px, safe-top). Wylaczony przycisk
   odpowiada teraz dymkiem w powloce, przy samym przycisku. */
if(r.getAttribute("aria-disabled")==="true"||r.hasAttribute("disabled")){try{a.VildaChrome&&typeof a.VildaChrome.showTip=="function"&&a.VildaChrome.showTip(r,r.getAttribute("data-tip")||"Ta opcja jest teraz niedost\u0119pna.")}catch{}return}var i=c&&l[c],u=i&&i.frame?i.frame.contentDocument:null;if(!u)return;var s=u.getElementById(e);s&&s.click()}catch{}}))}),t===R.length&&(lt=!0)}}function dt(){Dpd_connect();try{Mt(),T&&(T.disconnect(),T=null),st();var t=c&&l[c],e=null;try{e=t&&t.frame?t.frame.contentDocument:null}catch{e=null}if(!e||typeof a.MutationObserver!="function")return;T=new a.MutationObserver(st),R.forEach(function(r){var n=e.getElementById(r);n&&T.observe(n,{attributes:!0,attributeFilter:["aria-disabled","disabled","data-tip","title"]})})}catch{}}function ft(){try{var t=a.VildaSyncIntegration;t&&typeof t.pullNow=="function"&&t.pullNow()}catch{}var e=c&&l[c],r=e&&e.frame?e.frame.contentWindow:null;function n(){try{r&&typeof r.__vildaSyncRefresh=="function"&&r.__vildaSyncRefresh()}catch{}}n();try{a.setTimeout(n,1200),a.setTimeout(n,3e3)}catch{}}
/* P-PANEL-POWROT (zgłoszenie właściciela 2026-10-12): przy zmianie panelu karta „Centyle i BMI”
   i przyciski „Podsumowanie wyników” / „Zalecenia dietetyczne” na Start skakały. Ukryty panel ma
   display:none, więc przeglądarka zdejmuje jego układ, a po ponownym pokazaniu od nowa uruchamia
   jednorazowe animacje CSS elementów, które odzyskują ramkę (wjazd .animate-in i ._enter, błysk
   .--pulse). Do tego odtworzenie sesji (Gp_p) przelicza wyniki: nowe kafelki wjeżdżają, a liczby
   odliczają się od zera. Na czas uspokojenia panel dostaje klasę vilda-panel-powrot, ZANIM ramka
   stanie się widoczna: style.css startuje w nim animacje wejścia i jednorazowe błyski jako już
   zakończone (zapętlone, np. pulsowanie ostrzeżeń, biegną dalej), a app.js nie odlicza liczb. Po oknie klasa znika, a
   jednorazowe animacje CSS, które jeszcze trwają, są kończone od razu — samo zdjęcie klasy
   przywróciłoby im opóźnienie i część z nich ruszyłaby od nowa. Dotyczy tylko wczytanego panelu
   pokazywanego zamiast innego; pierwsze otwarcie i przeładowanie panelu animują jak dotąd. */
var Pw_KLASA="vilda-panel-powrot",Pw_MS=2000;
function Pw_koniec(d){
  try{
    if(!d||!d.documentElement)return;
    d.documentElement.classList.remove(Pw_KLASA);
    if(typeof d.getAnimations!=="function")return;
    d.getAnimations().forEach(function(n){
      try{
        // Tylko biegnące animacje CSS na osi czasu dokumentu: wstrzymanych i sterowanych przewijaniem nie ruszamy.
        if(typeof n.animationName!=="string"||n.playState!=="running"||n.timeline!==d.timeline)return;
        var k=n.effect&&typeof n.effect.getComputedTiming==="function"?n.effect.getComputedTiming():null;
        if(k&&isFinite(k.endTime))n.finish();
      }catch{}
    });
  }catch{}
}
function Pw_start(e){
  try{
    var d=e&&e.loaded&&e.frame?e.frame.contentDocument:null;
    if(!d||!d.documentElement)return;
    d.documentElement.classList.add(Pw_KLASA);
    e.powrotTimer&&a.clearTimeout(e.powrotTimer);
    e.powrotTimer=a.setTimeout(function(){e.powrotTimer=0;try{e.frame.contentDocument===d&&Pw_koniec(d)}catch{}},Pw_MS);
  }catch{}
}
/* P-PANEL-PRZEWINIECIE (decyzja właściciela 2026-10-12): panel wraca tam, gdzie go zostawiono. Ukrycie ramki
   (display:none, jak wyżej) zdejmuje jej układ i zeruje przewinięcie dokumentu — zmierzone w Chromium na Start:
   scrollY 679 → 0 (1440×1000) i 513 → 0 (telefon), a tuż po hidden=true scrollY czyta już 0. Dlatego Pp_zapisz
   czyta przewinięcie okna panelu PRZED ukryciem, a Pp_odtworz ustawia je zaraz po pokazaniu, w tym samym zadaniu
   (przed pierwszym malowaniem), z behavior:"instant" (html ma scroll-behavior:smooth). Kolejność w w() ma znaczenie:
   po klasie trasy powłoki (ramka ma już szerokość tej trasy), a PRZED odtworzeniem sesji (Gp_p) i odświeżeniem
   podsumowania, które przebudowują część treści — np. wiersz historii w karcie szacowanego spożycia znika na jedno
   zadanie. Przewinięcie ustawione wcześniej przeglądarka trzyma przy treści (zakotwiczenie przewinięcia); ustawione
   później trafiało w skrócony dokument i widok tuż pod kartą stał 252 px dalej (telefon). Bez odtwarzania:
   nawigacja z celem (np. sekcja konta w Ustawieniach — cel ma pierwszeństwo; P() i Sn_historyEvent wpisują go do
   historii przed w(), a Sn_setTarget doręcza po w()) oraz nowy dokument w ramce (B, Gp5_przeladuj, stale — startuje
   od góry; load porzuca zapamiętaną pozycję). Lista i karta pacjenta otwierane z innego panelu (Sn_openPatient) mają
   własne przewijanie (.vilda-auth-root), a Start pod nimi wraca tam, gdzie go zostawiono, jak przy otwarciu listy
   na samym Start. Przewinięcie elementów wewnątrz ramki przeglądarka zachowuje sama. */
function Pp_zapisz(e){
  try{
    e.przewiniecie=null;
    var d=e.loaded&&!e.frame.hidden?e.frame.contentDocument:null,n=d&&e.frame.contentWindow;
    if(!n)return;
    var s=d.scrollingElement,y=Math.max(n.scrollY||n.pageYOffset||0,s&&s.scrollTop||0);
    if(y>0)e.przewiniecie={doc:d,y:y};
  }catch{}
}
function Pp_odtworz(t,e){
  var s=e.przewiniecie;
  e.przewiniecie=null;
  try{
    if(!s||!e.loaded||e.frame.contentDocument!==s.doc)return;
    var h=a.history.state;
    if(h&&h.shellView===t&&Sn_href(t,h.shellHref))return;
    var n=e.frame.contentWindow;
    try{n.scrollTo({top:s.y,behavior:"instant"})}catch{n.scrollTo(0,s.y)}
  }catch{}
}
function w(t,Sn_keepRequest){t=y(t);if(Sn_focusTarget&&Sn_focusTarget.route!==t)Sn_cancelPaneFocus();var Gp_c=c;if(c&&c!==t)Dpd_invalidate();if(c&&c!==t){Sn_cancelRequest(Sn_keepRequest);Sn_target=null;Sn_quietClose(c);b=null}c&&c!==t&&Gp_f(c);var e=_(t);if(e){e.stale&&(e.stale=!1,B(t)),c&&c!==t&&l[c]&&(Pp_zapisz(l[c]),l[c].frame.hidden=!0),c&&c!==t&&Pw_start(e),Sn_closeFormulaSearch(t,"shell-route-entry"),e.frame.hidden=!1,c=t;try{var r=o.documentElement;r.className=r.className.replace(/\bvilda-route-[a-z]+\b/g,"").replace(/\s{2,}/g," ").trim(),r.classList.add("vilda-route-"+t)}catch{}Gp_c&&Gp_c!==t&&Pp_odtworz(t,e);try{var n=l.start,i=n&&n.frame?n.frame.contentWindow:null;i&&typeof i.__vildaShellSummaryRefresh=="function"&&i.__vildaShellSummaryRefresh()}catch{}if(t==="start")try{var u=e.frame?e.frame.contentWindow:null;u&&typeof u.__vildaRemindersResync=="function"&&u.__vildaRemindersResync()}catch{}v(),e.loaded?X():(z(),g(t));Gp_c!==t&&Gp_p(t,e);try{o.title=d[t].title+" \u2013 Waga i wzrost"}catch{}et(t),Ct(t),ot(t),at(),ut(),dt(),vt(),Bt(),Y(),ft();try{a.performance&&a.performance.mark&&a.performance.mark("vilda-shell-show-"+t)}catch{}Sn_tryFocusPane()}}function jt(){try{return/iPhone|iPad|iPod/i.test(a.navigator.userAgent||"")?!!(a.matchMedia&&a.matchMedia("(display-mode: standalone)").matches||a.navigator.standalone===!0):!1}catch{return!1}}var A=null;/* P-MODALE (2026-09-17): modal otwarty WEWNATRZ iframe'a nie moze zaslonic docka ani przyciskow powloki — to elementy dokumentu-rodzica, zaden z-index w iframie ich nie przebije. Zmierzone na iPhonie: stopka epikryzy („Anuluj / Dalej") i dol paneli „Jak chronimy dane?" / „Sila szyfrowania" ladowaly pod dockiem. Rozwiazanie w JEDNYM miejscu: powloka patrzy na aktywny panel i gdy widoczna nakladka position:fixed (>=90% szerokosci, >=60% wysokosci okna) siega PONIZEJ gornej krawedzi docka, dodaje sobie klase vilda-pane-modal-open (CSS: dock, FAB i strzalka visibility:hidden — pudelko docka zostaje, wiec pomiary --vilda-shell-dock-h / --vilda-dol-wolny sie nie zmieniaja i nic nie skacze). Arkusze terminarza i ekrany auth koncza sie DOKLADNIE na krawedzi docka (same go mierza), wiec warunek ich nie lapie — ich dock zostaje widoczny, jak dotad. */var Mo=null,Mr=0;function Mw(){var n=!1;try{var t=c&&l[c],e=t&&t.frame?t.frame.contentDocument:null,w=t&&t.frame?t.frame.contentWindow:null,d=o.getElementById("mobileBottomDock");if(e&&e.body&&w&&d){var dr=d.getBoundingClientRect(),fr=t.frame.getBoundingClientRect();if(dr.height>0&&dr.top<fr.bottom){var W=w.innerWidth||0,H=w.innerHeight||0,els=e.querySelectorAll("body > *, body > * > *");for(var i=0;i<els.length&&!n;i++){var el=els[i],cs=w.getComputedStyle(el);if(cs.position==="fixed"&&cs.display!=="none"&&cs.visibility!=="hidden"&&Number(cs.opacity)!==0){var r=el.getBoundingClientRect();r.width>=W*.9&&r.height>=H*.6&&fr.top+r.bottom>dr.top+1&&(n=!0)}}}}}catch{n=!1}try{o.documentElement.classList.toggle("vilda-pane-modal-open",n)}catch{}}function Mz(){Mr||(Mr=a.requestAnimationFrame(function(){Mr=0,Mw()}))}function vt(){try{A&&(A.disconnect(),A=null),Mo&&(Mo.disconnect(),Mo=null);var t=c&&l[c],e=null;try{e=t&&t.frame?t.frame.contentDocument:null}catch{e=null}var r=function(){var n=!1;try{n=!!(e&&e.body&&(e.body.classList.contains("vilda-auth-embedded-open")||e.body.classList.contains("vilda-reminders-open")))}catch{n=!1}try{o.documentElement.classList.toggle("vilda-pane-auth-open",n)}catch{}};if(!e||!e.body||typeof a.MutationObserver!="function"){r(),Mw();return}A=new a.MutationObserver(r),A.observe(e.body,{attributes:!0,attributeFilter:["class"]}),r(),Mo=new a.MutationObserver(Mz),Mo.observe(e.body,{childList:!0,subtree:!0,attributes:!0,attributeFilter:["class","style","hidden"]}),Mw()}catch{}}/* Historia osadzonych ekranów należy do powłoki. Żądania karty/listy
   i jawnego linku obowiązują tylko do następnej intencji nawigacji. */
var Sn_request=null,Sn_requestSerial=0,Sn_target=null,Sn_entry=null,Sn_navSerial=0;
var Sn_auth=null,Sn_authSerial=0,Sn_pendingBack=null;
/* Fokus po menu należy do jednej intencji, także gdy nawigacja czeka na Back
   lub load. Nowszy wybór użytkownika unieważnia również odroczoną intencję. */
var Sn_focusTarget=null,Sn_focusGeneration=0;
function Sn_cancelPaneFocus(){Sn_focusTarget=null;Sn_focusGeneration+=1}
function Sn_tryFocusPane(){
  var target=Sn_focusTarget,pane=target&&l[target.route];
  if(!target||target.route!==c||!pane||!pane.loaded||pane.frame.hidden)return;
  if(o.body&&o.body.classList.contains("chrome-drawer-open")){Sn_cancelPaneFocus();return}
  Sn_focusTarget=null;
  try{pane.frame.focus({preventScroll:true})}catch{}
}
function Sn_plainClick(event,anchor){
  var chrome=a.VildaChrome;
  if(chrome&&typeof chrome.isPlainNavigationClick==="function")return chrome.isPlainNavigationClick(event,anchor);
  var target=String(anchor.getAttribute("target")||"").toLowerCase();
  return !event.defaultPrevented&&(event.button==null||event.button===0)&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey&&!anchor.hasAttribute("download")&&(!target||target==="_self");
}
function Sn_cancelRequest(keep){
  if(!Sn_request||Sn_request===keep)return;
  if(Sn_request.timer)a.clearTimeout(Sn_request.timer);
  Sn_request=null;
}
function Sn_closeFormulaSearch(route,reason){
  try{var pane=l[route],win=pane&&pane.frame.contentWindow;
    if(win&&win.ClcrUiWorkflow&&typeof win.ClcrUiWorkflow.closeSearch==="function")win.ClcrUiWorkflow.closeSearch(reason);
  }catch{}
}
function Sn_quietClose(route){
  Sn_closeFormulaSearch(route,"shell-route-departure");
  // The expanded reminders workspace and cards opened from it live in top,
  // independently of the outgoing route's iframe.
  try{if(a.VildaAuthUI&&typeof a.VildaAuthUI.closeSearchNavigation==="function")a.VildaAuthUI.closeSearchNavigation()}catch{}
  try{var pane=l[route],win=pane&&pane.frame.contentWindow;
    if(win&&win.VildaAuthUI&&typeof win.VildaAuthUI.hide==="function")win.VildaAuthUI.hide({shellNavigation:true});
  }catch{}
}
function Sn_href(route,href){
  if(!href)return null;
  try{var url=new a.URL(String(href),a.location.href);
    if(url.origin!==a.location.origin||O(url.pathname+url.search+url.hash)!==route||(!url.search&&!url.hash))return null;
    return url.pathname+url.search+url.hash;
  }catch{return null}
}
function Sn_deliverTarget(){
  var target=Sn_target,pane=target&&l[target.route];
  if(!target||target.delivered||target.route!==c||!pane||!pane.loaded||pane.frame.hidden)return;
  try{var win=pane.frame.contentWindow;
    target.delivered=true;
    win.dispatchEvent(new (win.CustomEvent||a.CustomEvent)("vilda:shell-navigate-target",{detail:{href:target.href}}));
  }catch{target.delivered=false}
}
function Sn_setTarget(route,state,force){
  var key=state?String(state.shellNavId)+"|"+route+"|"+(state.shellHref||""):null;
  if(key===Sn_entry&&!force)return;
  Sn_entry=key;
  var href=state&&state.shellView===route?Sn_href(route,state.shellHref):null;
  Sn_target=href?{route:route,href:href,delivered:false}:null;
  Sn_deliverTarget();
}
function Sn_entryState(route){
  var state={};
  try{state=Object.assign({},a.history.state||{});
    if(state.shellView!==route||!state.shellNavId){state.shellView=route;state.shellNavId=++Sn_navSerial;a.history.replaceState(state,"",a.location.href)}
    Sn_navSerial=Math.max(Sn_navSerial,Number(state.shellNavId)||0);
  }catch{}
  return state;
}
function Sn_owner(win){
  var pane=c&&l[c];
  try{if(pane&&pane.loaded&&!pane.frame.hidden&&pane.frame.contentWindow===win)return{route:c,pane:pane,doc:pane.frame.contentDocument}}catch{}
  return null;
}
function Sn_validAuth(auth){
  var owner=auth&&Sn_owner(auth.win);
  return !!(owner&&owner.route===auth.route&&owner.doc===auth.doc&&owner.pane.navigationGeneration===auth.generation);
}
function Sn_isAuthHistoryCurrent(win){
  return !!(Sn_auth&&Sn_auth.win===win&&Sn_validAuth(Sn_auth)&&a.history.state&&a.history.state.shellAuthId===Sn_auth.id);
}
function Sn_ensureAuthHistory(win,onBack,doc){
  var owner=Sn_owner(win);
  if(!owner||owner.doc!==doc||typeof onBack!=="function")return false;
  if(Sn_isAuthHistoryCurrent(win)){Sn_auth.onBack=onBack;return true}
  var auth={id:"auth-"+Date.now()+"-"+(++Sn_authSerial),route:owner.route,win:win,doc:doc,generation:owner.pane.navigationGeneration,onBack:onBack};
  try{var state=Object.assign({},a.history.state||{});
    state.shellView=owner.route;state.shellAuthId=auth.id;state.shellAuthOwner=owner.route;
    a.history.pushState(state,"",a.location.href);Sn_auth=auth;return true;
  }catch{return false}
}
function Sn_releaseAuthHistory(win,options){
  var auth=Sn_auth;
  if(!auth||auth.win!==win)return;
  Sn_auth=null;
  var current=a.history.state&&a.history.state.shellAuthId===auth.id;
  if(!current)return;
  if(options&&options.quiet){
    try{var state=Object.assign({},a.history.state);delete state.shellAuthId;delete state.shellAuthOwner;a.history.replaceState(state,"",a.location.href)}catch{}
    return;
  }
  Sn_pendingBack={navigation:null};
  try{a.history.back()}catch{Sn_pendingBack=null}
}
function Sn_historyEvent(){
  var route=W(),state=Sn_entryState(route),auth=Sn_auth,pending=Sn_pendingBack;
  Sn_pendingBack=null;
  var left=auth&&state.shellAuthId!==auth.id;
  w(route);
  Sn_setTarget(route,state);
  if(!pending&&left&&Sn_auth===auth&&Sn_validAuth(auth)){
    Sn_auth=null;
    try{auth.onBack()}catch{}
    if(!Sn_auth){Sn_cancelRequest();b=null}
  }
  if(pending&&pending.navigation){
    var next=pending.navigation,focus=next.options&&next.options.focusPane&&next.options.focusGeneration===Sn_focusGeneration;
    P(next.route,next.push,next.href,next.request,{focusPane:!!focus});
  }else if(pending){Sn_cancelRequest();b=null}
  var current=a.history.state;
  if(current&&current.shellAuthId&&(!Sn_auth||!Sn_isAuthHistoryCurrent(Sn_auth.win))){
    try{var clean=Object.assign({},current);delete clean.shellAuthId;delete clean.shellAuthOwner;a.history.replaceState(clean,"",a.location.href)}catch{}
  }
}
function Sn_openPatient(kind,id,onTimeout,tab){
  var origin=c&&c!=="start"?c:Sn_request?Sn_request.origin:null;
  Sn_cancelRequest();
  var request={id:++Sn_requestSerial,origin:origin,timer:0,elapsed:0,started:false,activationReady:false};
  Sn_request=request;
  P("start",c!=="start",null,request);
  function retry(){
    if(Sn_request!==request)return;
    request.timer=0;
    var win=request.activationReady&&!Sn_pendingBack&&c==="start"?mt():null;
    if(win)try{
      // P-POWLOKA-KARTA-ZAKLADKA (LAB-HISTORIA PR3): karta otwierana od razu na wskazanej zakładce
      // (pasek „Poprzednie wyniki” → „Badania”); bez zakładki wywołanie bez zmian (testy porównują argumenty).
      if(kind==="card"&&typeof win.VildaAuthUI.showPatientCard==="function")tab?win.VildaAuthUI.showPatientCard(String(id),null,null,{activeTab:tab}):win.VildaAuthUI.showPatientCard(String(id));
      else if(kind==="list"){var document=win.document;win.VildaAuthUI.showPatientsList(function(data){
        if(Sn_request!==request||c!=="start"||!l.start||l.start.frame.contentWindow!==win||l.start.frame.contentDocument!==document)return;
        if(data)try{win.applyLoadedData(data)}catch{}
        try{win.VildaChrome&&typeof win.VildaChrome.refreshPatientChip==="function"&&win.VildaChrome.refreshPatientChip()}catch{}
        a.setTimeout(function(){try{a.VildaChrome&&typeof a.VildaChrome.refreshPatientChip==="function"&&a.VildaChrome.refreshPatientChip()}catch{}},250);
      })}
      else throw new Error("patient API not ready");
      request.started=true;return;
    }catch{}
    request.elapsed+=C;
    if(request.elapsed>=ht){Sn_request=null;if(typeof onTimeout==="function")try{onTimeout()}catch{}return}
    request.timer=a.setTimeout(retry,C);
  }
  retry();
}

function Nt(t){Sn_quietClose(y(t))}
function P(t,e,href,request,options){
  t=y(t);Sn_cancelRequest(request);Sn_cancelPaneFocus();
  var focusPane=!!(options&&options.focusPane);
  var next={route:t,push:e,href:href,request:request,options:{focusPane:focusPane,focusGeneration:Sn_focusGeneration}};
  if(Sn_pendingBack){Sn_pendingBack.navigation=next;return}
  var owned=Sn_auth&&Sn_isAuthHistoryCurrent(Sn_auth.win),same=c===t;
  if(owned&&same){
    Sn_quietClose(c);
    Sn_pendingBack={navigation:next};
    try{a.history.back();return}catch{Sn_pendingBack=null}
  }
  if(c&&c!==t)Sn_quietClose(c);
  Nt(t);b=null;
  var state=same?Object.assign({},a.history.state||{}):{};
  state.shellView=t;
  state.shellNavId=same&&state.shellNavId?state.shellNavId:++Sn_navSerial;
  delete state.shellHref;delete state.shellAuthId;delete state.shellAuthOwner;
  var target=Sn_href(t,href);if(target)state.shellHref=target;
  try{e===false||same||owned||jt()?a.history.replaceState(state,"","#/"+t):a.history.pushState(state,"","#/"+t)}catch{}
  if(focusPane)Sn_focusTarget={route:t};
  w(t,request);
  if(request&&Sn_request===request){request.activationReady=true;b=request.origin}
  Sn_setTarget(t,state,!!target);
}
var ht=12e3,C=150;function mt(){try{var t=l.start;if(!t||!t.loaded||!t.frame)return null;var e=t.frame.contentWindow;if(!e)return null;var r=e.VildaAuthUI&&(typeof e.VildaAuthUI.isBootReady!=="function"||e.VildaAuthUI.isBootReady())&&typeof e.VildaAuthUI.showPatientsList=="function"&&typeof e.applyLoadedData=="function"&&e.VildaVault&&typeof e.VildaVault.isUnlocked=="function"&&e.VildaVault.isUnlocked();return r?e:null}catch{return null}}function xt(t){Sn_openPatient("list",null,t)}
function Ht(t,opts){if(t)Sn_openPatient("card",t,null,opts&&typeof opts.activeTab==="string"&&opts.activeTab?opts.activeTab:null)}
function Wt(t){
  var e=t.target,r=e&&e.closest?e.closest("#mobileBottomDock .mobile-bottom-dock__item[href], .sidebar-nav a[href], .chrome-drawer-nav a[href]"):null;
  if(!r||!Sn_plainClick(t,r))return;
  var n=O(r.getAttribute("href"));if(!n)return;
  t.preventDefault();t.stopPropagation();
  var chrome=a.VildaChrome,wasOpen=false,drawer=!!r.closest(".chrome-drawer-nav");
  if(chrome&&typeof chrome.closeDrawer==="function")wasOpen=chrome.closeDrawer({reason:"navigation"});
  P(n,true,r.getAttribute("href"),null,{focusPane:drawer&&wasOpen});
}function pt(){o.documentElement.classList.add("vilda-shell-host");try{a.history&&"scrollRestoration"in a.history&&(a.history.scrollRestoration="manual")}catch{}J(),o.addEventListener("scroll",function(){j(80)},{passive:!0,capture:!0}),a.addEventListener("pageshow",function(){j(40)});try{o.body&&o.body.classList.remove("js-loading")}catch{}Rt();var t=/^#\//.test(String(a.location.hash||"")),e=t?W():"start";if(!t)try{a.history.replaceState({shellView:e},"","#/"+e)}catch{}w(e),Sn_setTarget(e,Sn_entryState(e)),v();Sl_noteMode();Sl_watchGeometry();o.addEventListener("vilda:phone-layout-changed",Sl_phoneLayout);try{e!=="start"&&a.setTimeout(function(){try{_("start")}catch{}},1200)}catch{}a.addEventListener("pointerdown",Sn_cancelPaneFocus,!0),a.addEventListener("keydown",Sn_cancelPaneFocus,!0),o.addEventListener("click",Wt,!0),a.addEventListener("popstate",Sn_historyEvent),a.addEventListener("hashchange",function(){var i=String(a.location.hash||"").match(/^#\/([a-z]+)/);i&&Object.prototype.hasOwnProperty.call(d,i[1])&&Sn_historyEvent()}),a.addEventListener("vilda:ga-ready",function(){c&&ot(c)});try{typeof a.Proxy=="function"&&!a.VildaSaveStatusIndicator&&(a.VildaSaveStatusIndicator=new a.Proxy({},{get:function(i,u){var s=Dt();if(s!=null){var f=s[u];return typeof f=="function"?f.bind(s):f}if(u==="getState")return function(){return"hidden"}}}))}catch{}a.addEventListener("resize",Sl_resize),a.addEventListener("resize",Mz),a.addEventListener("orientationchange",Sl_orientation),a.visualViewport&&a.visualViewport.addEventListener&&a.visualViewport.addEventListener("resize",Sl_viewportResize),a.addEventListener("pageshow",function(){v(),c&&w(c)}),o.addEventListener("visibilitychange",function(){o.hidden||(v(),Y(),ft())}),a.addEventListener("storage",function(i){try{if(!i||i.key!=="vilda:sharedLoadSeq")return;var u=String(i.newValue||""),s=u.lastIndexOf(":");if(s<=0)return;var f=u.slice(0,s),h="";try{var L=a.VildaPersistence;L&&typeof L.getTabId=="function"&&(h=L.getTabId()),!h&&a.sessionStorage&&(h=a.sessionStorage.getItem("vildaTabIdV1")||"")}catch{h=""}if(!h||f!==h)return;It()}catch{}});var r=0,n=a.setInterval(function(){et(c),Sl_watchGeometry(),v(),r+=1,r>12&&a.clearInterval(n)},150)}o.readyState==="loading"?o.addEventListener("DOMContentLoaded",pt):pt();function Ft(t){var e=b;if(b=null,e&&e!=="start"&&Object.prototype.hasOwnProperty.call(d,e))return P(e,!0),!0;if(typeof t=="function")try{t()}catch{}return!1}function Ut(){return b||null}a.VildaShell={navigate:P,reloadForAppUpdate:Su_reloadForAppUpdate,isAppUpdateReloadPending:Su_isAppUpdateReloadPending,isPatientDocumentsSourceCurrent:Dpd_isSourceCurrent,protokolPanelu:1,cancelPendingPaneFocus:Sn_cancelPaneFocus,show:w,reload:B,routes:d,openPatientsInStart:xt,openPatientCardInStart:Ht,keyForHref:O,returnFromPatientCard:Ft,peekPatientReturnRoute:Ut,ensureAuthHistory:Sn_ensureAuthHistory,releaseAuthHistory:Sn_releaseAuthHistory,isAuthHistoryCurrent:Sn_isAuthHistoryCurrent}})(window);
