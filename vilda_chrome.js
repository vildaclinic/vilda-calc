(function(r){"use strict";if(!r||r.VildaChrome&&r.VildaChrome.__vildaChrome)return;var q="1.0.0",b=[{title:"Pacjent",hideDrawerTitle:!0,items:[{id:"saveDataBtnSidebar",label:"Zapisz dane",icon:"save",role:"button",ariaDisabled:!0,tip:"Aby zapisa\u0107 dane, wprowad\u017A imi\u0119, wiek, wzrost i wag\u0119."},{id:"addVisitNoteBtnSidebar",label:"Dodaj notatk\u0119 do wizyty",icon:"sticky-note",role:"button",authOnly:!0,ariaDisabled:!0,tip:'Aby doda\u0107 notatk\u0119 do wizyty, najpierw wczytaj pacjenta z listy \u201EPacjenci\u201D lub zapisz nowego pacjenta (\u201EZapisz dane\u201D). Notatka kotwiczy si\u0119 do konkretnej osoby w bazie.'},{id:"patientDocumentsBtnSidebar",label:"Dokumenty pacjenta",icon:"files",role:"button",ariaDisabled:!0,tip:"Dokumenty pacjenta s\u0105 dost\u0119pne na stronie Start i DocPro."},{id:"patientsListBtnSidebar",label:"Pacjenci",icon:"users",role:"button",authOnly:!0,tip:"Zaloguj si\u0119, aby przegl\u0105da\u0107 baz\u0119 pacjent\xF3w."}]},{title:"Narz\u0119dzia",items:[{href:"index.html",label:"Strona g\u0142\xF3wna",icon:"home"},{href:"docpro.html",label:"DocPro",icon:"stethoscope",cls:"pro-link"},{href:"homa-ir.html",label:"HOMA-IR",icon:"calculator"},{href:"kalkulator-klirens.html",label:"Klirens",icon:"droplets"},{href:"steroidy.html",label:"Steroidy",icon:"pill"},{href:"przelicznik-jednostek.html",label:"Jednostki lab.",icon:"flask-conical"},{href:"materialy-edukacyjne.html",label:"Wiedza",icon:"book-open"}]},{title:"Konto",items:[{href:"notatki.html",label:"Notatki",icon:"file-text",cls:"pro-link"},{href:"terminarz.html",label:"Terminarz",icon:"calendar",cls:"pro-link"},{href:"ustawienia.html",label:"Ustawienia",icon:"settings"}]}],W=["ngenla-instrukcja.html","genotropin-instrukcja.html","omnitrope-instrukcja.html","przelicznik-doposilkowy-instrukcja.html","cukrzyca.html"],o=r.document;if(!o)return;var V="vilda-vt-dir";function U(){try{var e=r.sessionStorage&&r.sessionStorage.getItem(V);if(!e)return null;var t=JSON.parse(e);return!t||t.d!=="forward"&&t.d!=="back"||typeof t.t!="number"||Date.now()-t.t>4e3?null:t.d==="forward"?"vilda-forward":"vilda-back"}catch{return null}}function z(){try{r.sessionStorage&&r.sessionStorage.removeItem(V)}catch{}}function G(e,t){try{t&&e&&e.types&&typeof e.types.add=="function"&&e.types.add(t)}catch{}}try{r.addEventListener&&(r.addEventListener("pageswap",function(e){try{if(!e||!e.viewTransition)return;if(he()){typeof e.viewTransition.skipTransition=="function"&&e.viewTransition.skipTransition();return}G(e.viewTransition,U())}catch{}}),r.addEventListener("pagereveal",function(e){try{var t=U();if(!e||!e.viewTransition){z();return}if(he()){typeof e.viewTransition.skipTransition=="function"&&e.viewTransition.skipTransition(),z();return}o.body&&o.body.classList&&o.body.classList.remove("js-loading"),G(e.viewTransition,t),z()}catch{z()}}))}catch{}var Y=!1,K=!1,Z=!1,X="";function g(e){return e==null?"":String(e).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function ge(){try{var e=r.location&&r.location.pathname||"",t=e.lastIndexOf("/"),a=t>=0?e.substring(t+1):e;return a||"index.html"}catch{return"index.html"}}function we(e){return e==="materialy-edukacyjne.html"?!0:W.indexOf(e)!==-1}function J(e){if(!e)return"?";for(var t=String(e).trim().split(/\s+/),a="",n=0;n<t.length&&a.length<2;n++)t[n].length&&(a+=t[n].charAt(0).toUpperCase());return a||"?"}var Se='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>',Fe='<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="8.5" cy="10.5" r="1.9"/><path d="M5.6 15.5c.3-1.2 1.5-2 2.9-2s2.6.8 2.9 2"/><path d="M13.5 10.5h4"/><path d="M13.5 14h4"/></svg>';function B(e){try{if(r.lucide&&typeof r.lucide.createIcons=="function")return r.lucide.createIcons({root:e||o}),!0}catch{}return!1}function We(){var e=0,t=20;function a(){B()||e++>=t||setTimeout(a,150)}o.readyState==="loading"?o.addEventListener("DOMContentLoaded",a):a(),r.addEventListener&&r.addEventListener("load",function(){B()},{once:!0})}var be="vildaChromeAuthOnlyVisible";function $(){try{return r.sessionStorage&&r.sessionStorage.getItem(be)==="1"}catch{return!1}}var ie="vildaChromeUiSnapV1";function ke(){try{var e=r.sessionStorage&&r.sessionStorage.getItem(ie);return e?JSON.parse(e):null}catch{return null}}function Q(e){try{var t=ke()||{};for(var a in e)Object.prototype.hasOwnProperty.call(e,a)&&(t[a]=e[a]);r.sessionStorage.setItem(ie,JSON.stringify(t))}catch{}}function oe(){try{r.sessionStorage.removeItem(ie)}catch{}}var D=!1,xe=null;function Ge(){xe||(xe=setTimeout(function(){D||(D=!0,_())},4e3))}function Ee(){return o.querySelector("aside[data-vilda-chrome-sidebar]")||o.querySelector("aside.sidebar")}function Ye(e){var t=[];e.id&&t.push('id="'+g(e.id)+'"'),t.push('href="'+g(e.href||"#")+'"');var a=["sidebar-link"];e.cls&&a.push(e.cls),e.authOnly&&a.push("auth-only-item"),t.push('class="'+a.join(" ")+'"'),e.role&&t.push('role="'+g(e.role)+'"'),e.ariaDisabled&&t.push('aria-disabled="true"'),e.authOnly&&t.push('data-auth-only="true"'),e.authOnly&&!$()&&t.push('style="display:none"'),e.tip&&t.push('data-tip="'+g(e.tip)+'"');var n=["<li>","  <a "+t.join(" ")+">",'    <span class="sidebar-icon" data-lucide="'+g(e.icon||"circle")+'" aria-hidden="true"></span>','    <span class="sidebar-label">'+g(e.label)+"</span>","  </a>",e.extraHTML||"","</li>"].join("");return n}/* P-HEADER-MENU-SEARCH: the header opens the existing Reminders Search.
   Drafts live only in memory, belong to one unlocked account, and follow the
   same privacy mask. Native chips remain hidden state carriers for the shell. */
var Ch_statusAnchor=null,Ch_searchDraft="",Ch_searchOwner=null,Ch_searchSequence=0,Ch_searchPending=false,Ch_searchReturn=null;
var Ch_privacyApi=null,Ch_privacyUnsubscribe=null,Ch_syncStatus="idle",Ch_bound=false,Ch_vaults=[];
function Ch_searchIcon(size){size=size===18?18:21;return '<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.8 4.8"/></svg>'}
function Ch_searchMarkup(){return '<form id="vildaHeaderSearch" class="chrome-header-search" role="search" aria-label="Szukaj we wszystkich wpisach"><input id="vildaHeaderSearchInput" type="search" name="query" placeholder="Szukaj pacjenta, wpisu lub planu\u2026" aria-label="Szukaj pacjenta, wpisu lub planu" autocomplete="off" spellcheck="false"><button type="submit" aria-label="Szukaj">'+Ch_searchIcon(18)+'</button></form>'}
function Ch_attr(node,name,value){if(node&&node.getAttribute(name)!==String(value))node.setAttribute(name,String(value))}
function Ch_sameOwner(left,right){return !!(left&&right&&left.vault===right.vault&&left.userId===right.userId)}
function Ch_resetSearch(){
  Ch_searchDraft="";Ch_searchOwner=null;Ch_searchSequence++;Ch_searchPending=false;Ch_searchReturn=null;Ch_syncStatus="idle";
  if(typeof Ch_openSearch.cancelPending==="function")Ch_openSearch.cancelPending();
  var input=o.getElementById("vildaHeaderSearchInput");if(input)input.value="";
}
function Ch_privacyHidden(){
  try{if(r.VildaRemindersPrivacy&&typeof r.VildaRemindersPrivacy.isHidden==="function")return !!r.VildaRemindersPrivacy.isHidden()}catch{}
  return !!(o.documentElement&&o.documentElement.classList.contains("vilda-reminders-private"));
}
function Ch_bindPrivacy(){
  var api=r.VildaRemindersPrivacy;if(api===Ch_privacyApi)return;
  if(typeof Ch_privacyUnsubscribe==="function")Ch_privacyUnsubscribe();Ch_privacyUnsubscribe=null;Ch_privacyApi=api;
  if(api&&typeof api.subscribe==="function")Ch_privacyUnsubscribe=api.subscribe(Ch_refreshSearch);
}
function Ch_refreshSearch(){
  var owner=Cm_menuOwner();
  if(!Ch_sameOwner(owner,Ch_searchOwner)){Ch_resetSearch();Ch_searchOwner=owner}
  var input=o.getElementById("vildaHeaderSearchInput"),masked=Ch_privacyHidden();if(!input)return;
  var value=owner&&!masked?Ch_searchDraft:"";if(input.value!==value)input.value=value;
  input.readOnly=masked||!owner;
  Ch_attr(input,"aria-readonly",input.readOnly);Ch_attr(input,"data-private",masked);
  Ch_attr(input,"placeholder",masked?"Dane ukryte \u2014 otw\u00f3rz Szukaj":"Szukaj pacjenta, wpisu lub planu\u2026");
  Ch_attr(input,"title",!owner?"Zaloguj si\u0119, aby wyszukiwa\u0107 wpisy pacjent\u00f3w.":masked?"Otw\u00f3rz Szukaj, aby zmieni\u0107 widoczno\u015b\u0107 danych.":"Szukaj we wszystkich wpisach");
}
function Ch_searchControl(){
  var input=o.getElementById("vildaHeaderSearchInput"),button=o.getElementById("vildaHeaderSearchBtn");
  return input&&input.getClientRects().length?input:button;
}
/* Native search replaces its dialog during a patient/calendar handoff. Keep
   the header origin until the final search closes; never focus through a new
   dialog or the patient card that is being opened. */
function Ch_restoreSearchFocus(){
  var origin=Ch_searchReturn;if(!origin)return;
  var restore=function(){
    if(Ch_searchReturn!==origin||!Cm_sameMenuOwner(origin.owner))return;
    if(o.documentElement.classList.contains("vilda-auth-locked")||o.body.classList.contains("chrome-drawer-open"))return;
    var overlays=o.querySelectorAll('#vilda-auth-ui-root,.vilda-logout-overlay,.ww-onboarding-overlay.is-open,[aria-modal="true"],.vilda-reminders-modal-overlay,dialog[open]');
    if(Array.prototype.some.call(overlays,Cm_visible))return;
    var control=Ch_searchControl();Ch_searchReturn=null;
    if(control&&control.isConnected)control.focus({preventScroll:true});
  };
  if(typeof r.requestAnimationFrame==="function")r.requestAnimationFrame(restore);else setTimeout(restore,0);
}
function Ch_waitSearchBoot(ui,owner,sequence,href,target){
  if(typeof ui.isBootReady!=="function"||ui.isBootReady())return Promise.resolve(true);
  return new Promise(function(resolve){
    var done=false,doc=target.document;
    function finish(ready){if(done)return;done=true;doc.removeEventListener("vilda:auth-boot-settled",check);o.removeEventListener("vilda:session-changed",check);r.removeEventListener("pagehide",cancel);if(Ch_openSearch.cancelPending===cancel)Ch_openSearch.cancelPending=null;resolve(ready)}
    function cancel(){finish(false)}
    function check(){
      if(sequence!==Ch_searchSequence||ui!==target.VildaAuthUI||!Cm_sameMenuOwner(owner)||String(r.location&&r.location.href||"")!==href){finish(false);return}
      try{if(ui.isBootReady())finish(true)}catch{finish(false)}
    }
    Ch_openSearch.cancelPending=cancel;doc.addEventListener("vilda:auth-boot-settled",check);o.addEventListener("vilda:session-changed",check);r.addEventListener("pagehide",cancel);check();
  });
}
async function Ch_openSearch(opener){
  Ch_refreshSearch();var owner=Cm_menuOwner();if(!owner){F(opener,"Zaloguj si\u0119, aby wyszukiwa\u0107 wpisy pacjent\u00f3w.");return false}
  if(Ch_searchPending)return false;
  var sequence=++Ch_searchSequence,href=String(r.location&&r.location.href||""),target=r;Ch_searchPending=true;
  try{
    try{if(r.top&&r.top.VildaAuthUI)target=r.top}catch{}
    if(!target.VildaAuthUI||typeof target.VildaAuthUI.maybeShowReminders!=="function"){
      var session=target.VildaSession;if(!session||typeof session.ensureAuthLoaded!=="function"){F(opener,Cm_unavailable);return false}
      await session.ensureAuthLoaded();
    }
    if(sequence!==Ch_searchSequence||!Cm_sameMenuOwner(owner)||String(r.location&&r.location.href||"")!==href)return false;
    var ui=target.VildaAuthUI;if(!ui||typeof ui.maybeShowReminders!=="function"){F(opener,Cm_unavailable);return false}
    if(!await Ch_waitSearchBoot(ui,owner,sequence,href,target))return false;
    if(sequence!==Ch_searchSequence||!Cm_sameMenuOwner(owner))return false;
    Ch_bindPrivacy();Ch_refreshSearch();
    var origin={owner:owner};Ch_searchReturn=origin;
    var opened=await ui.maybeShowReminders({force:true,globalSearch:{query:Ch_privacyHidden()?"":Ch_searchDraft,focus:"query"}});
    if(!opened&&Ch_searchReturn===origin)Ch_searchReturn=null;
    return !!opened;
  }catch{if(Cm_sameMenuOwner(owner))F(opener,"Nie uda\u0142o si\u0119 otworzy\u0107 wyszukiwania. Spr\u00f3buj ponownie.");return false}
  finally{if(sequence===Ch_searchSequence)Ch_searchPending=false}
}
function Ch_refreshSaveState(){
  var source=o.getElementById("vildaPatientChip"),state="hidden";
  if(source)["saved","dirty","new_patient","saving","error"].some(function(value){if(!source.classList.contains("vilda-save-state--"+value))return false;state=value==="new_patient"?"new":value;return true});
  var labels={saved:"Zapisano",dirty:"Niezapisane zmiany",new:"Nowy pacjent",saving:"Zapisywanie\u2026",error:"B\u0142\u0105d zapisu",hidden:"Brak danych"};
  var controls=o.querySelectorAll("[data-menu-save-status]");
  for(var index=0;index<controls.length;index++){
    var button=controls[index],label=button.querySelector("[data-menu-save-label]");if(label&&label.textContent!==labels[state])label.textContent=labels[state];
    Ch_attr(button,"data-save-state",state);Ch_attr(button,"aria-expanded",!!O&&button===Ch_statusAnchor);
    Ch_attr(button,"title",source&&source.getAttribute("title")||labels[state]);
  }
}
function Ch_refreshMenuPro(){
  var source=o.getElementById("vildaProBadge"),owner=Cm_menuOwner(),state=source&&source.getAttribute("data-pro-state");
  var visible=!!(owner&&source&&source.style.display!=="none"&&!source.hidden&&state);
  var controls=o.querySelectorAll("[data-menu-pro]");for(var index=0;index<controls.length;index++){
    var node=controls[index],label=state==="active"?"PRO":"Poznaj PRO";node.hidden=!visible;Ch_attr(node,"data-pro-state",state||"");
    if(node.textContent!==label)node.textContent=label;Ch_attr(node,"aria-label",state==="active"?"Aktywna subskrypcja PRO":"Poznaj subskrypcj\u0119 PRO");
  }
}
function Ch_refreshSync(){
  var source=o.getElementById("vildaSyncBtn");if(!source)return;
  var owner=Cm_menuOwner(),enabled=!!(owner&&source.classList.contains("is-enabled")),state=source.getAttribute("data-sync-state"),offline=!!(owner&&(enabled||source.getAttribute("data-cloud-only")==="true")&&r.navigator&&r.navigator.onLine===false);
  var warning=!!(owner&&(state==="error"||state==="stale"||offline));
  var effective=!owner?"disabled":offline?"offline":state==="error"||state==="stale"?state:enabled?Ch_syncStatus:"disabled";
  var labels={disabled:"Synchronizacja wy\u0142\u0105czona",idle:"Synchronizacja w\u0142\u0105czona",ok:"Zsynchronizowano",syncing:"Synchronizowanie\u2026",error:"B\u0142\u0105d synchronizacji",stale:"Sprawd\u017a synchronizacj\u0119",offline:"Brak po\u0142\u0105czenia"};
  var label=labels[effective]||labels.idle;
  Ch_attr(source,"data-header-sync-warning",warning);Ch_attr(source,"aria-hidden",!warning);Ch_attr(source,"tabindex",warning?"0":"-1");
  if(warning){Ch_attr(source,"aria-label",label+". Otw\u00f3rz ustawienia synchronizacji.");if(state!=="stale")Ch_attr(source,"title",label+". Otw\u00f3rz ustawienia synchronizacji.")}
  var controls=o.querySelectorAll("[data-menu-sync]");for(var index=0;index<controls.length;index++){
    var node=controls[index],text=node.querySelector("[data-menu-sync-label]");if(text&&text.textContent!==label)text.textContent=label;
    Ch_attr(node,"data-sync-state",effective);Ch_attr(node,"data-offline",offline);Ch_attr(node,"title",label+". Otw\u00f3rz ustawienia synchronizacji.");Ch_attr(node,"aria-label",label+". Otw\u00f3rz ustawienia synchronizacji.");
  }
}
function Ch_bindVault(){
  var vault=r.VildaVault;if(!vault||Ch_vaults.indexOf(vault)!==-1)return;Ch_vaults.push(vault);
  if(typeof vault.onLock==="function")vault.onLock(function(){Ch_resetSearch();Ch_refreshHeader()});
  if(typeof vault.onUnlock==="function")vault.onUnlock(Ch_refreshHeader);
}
function Ch_refreshHeader(){Ch_bindVault();Ch_bindPrivacy();Ch_refreshSearch();Ch_refreshSaveState();Ch_refreshMenuPro();Ch_refreshSync()}
function Ch_bindHeader(){
  if(Ch_bound){Ch_refreshHeader();return}Ch_bound=true;
  var form=o.getElementById("vildaHeaderSearch"),input=o.getElementById("vildaHeaderSearchInput"),button=o.getElementById("vildaHeaderSearchBtn");
  if(input)input.addEventListener("input",function(){var owner=Cm_menuOwner();if(!owner||Ch_privacyHidden()||!Ch_sameOwner(owner,Ch_searchOwner)){Ch_refreshSearch();return}Ch_searchDraft=input.value});
  if(form)form.addEventListener("submit",function(event){event.preventDefault();Ch_openSearch(input)});
  if(button)button.addEventListener("click",function(){Ch_openSearch(button)});
  o.addEventListener("click",function(event){
    var node=event.target&&event.target.closest?event.target.closest('#vildaRemindersBtn,[data-vilda-chrome-menu-btn],.chrome-brand,.sidebar-inner a,.sidebar-inner button,.chrome-drawer-panel a,.chrome-drawer-panel button'):null;
    if(node)Ch_searchReturn=null;
  },true);
  if(typeof r.MutationObserver==="function"){
    var patient=o.getElementById("vildaPatientChip"),pro=o.getElementById("vildaProBadge"),sync=o.getElementById("vildaSyncBtn");
    if(patient)new r.MutationObserver(Ch_refreshSaveState).observe(patient,{attributes:true,attributeFilter:["class","title","aria-expanded"]});
    if(pro)new r.MutationObserver(Ch_refreshMenuPro).observe(pro,{attributes:true,attributeFilter:["style","hidden","data-pro-state"],childList:true,characterData:true,subtree:true});
    if(sync)new r.MutationObserver(Ch_refreshSync).observe(sync,{attributes:true,attributeFilter:["class","data-sync-state","data-offline","data-cloud-only"]});
    new r.MutationObserver(Ch_refreshSearch).observe(o.documentElement,{attributes:true,attributeFilter:["class"]});
    new r.MutationObserver(function(records){
      if(!Ch_searchReturn)return;
      if(records.some(function(record){return Array.prototype.some.call(record.removedNodes,function(node){return node.nodeType===1&&node.matches(".vilda-reminders-modal-overlay")})}))Ch_restoreSearchFocus();
    }).observe(o.body,{childList:true});
  }
  ["vilda:auth-loaded","vilda:auth-state-settled","vilda:auth-boot-settled","vilda:session-changed","vilda:guest-mode-changed"].forEach(function(name){o.addEventListener(name,Ch_refreshHeader)});
  o.addEventListener("vilda:user-state-cleared",function(){Ch_resetSearch();Ch_refreshHeader()});
  o.addEventListener("vilda:sync-status-changed",function(event){Ch_syncStatus=event&&event.detail&&event.detail.state||"idle";Promise.resolve().then(Ch_refreshSync)});
  o.addEventListener("vilda:sync-stale-device",function(){Promise.resolve().then(Ch_refreshSync)});
  r.addEventListener("online",Ch_refreshSync);r.addEventListener("offline",Ch_refreshSync);r.addEventListener("pagehide",Ch_resetSearch);
  Ch_refreshHeader();
}

/* P-MENU-NAVIGATION: shared task groups; form actions keep their source IDs. */
function Cm_menuItem(key){
  for(var group=0;group<b.length;group++)for(var index=0;index<b[group].items.length;index++){
    var item=b[group].items[index];if(item.id===key||item.href===key)return item;
  }
  return null;
}
function Cm_menuRow(key,mobile,label){
  var original=Cm_menuItem(key);if(!original)return "";
  var item=Object.assign({},original);if(label)item.label=label;
  if(!mobile)return Ye(item);
  var attrs=item.role==="button"?'type="button" data-drawer-btn="'+g(item.id)+'"':'href="'+g(item.href)+'"';
  var tag=item.role==="button"?"button":"a",classes=item.role==="button"?"chrome-drawer-btn":"";
  if(item.cls)classes+=" "+item.cls;if(item.authOnly)classes+=" auth-only-item";
  if(classes)attrs+=' class="'+g(classes.trim())+'"';
  if(item.authOnly)attrs+=' data-auth-only="true"'+(!$()?' style="display:none"':"");
  return '<li><'+tag+' '+attrs+'><span class="chrome-drawer-icon" data-lucide="'+g(item.icon)+'" aria-hidden="true"></span><span class="chrome-drawer-label">'+g(item.label)+'</span></'+tag+'></li>';
}
function Cm_patientMarkup(mobile){
  return '<div class="chrome-menu-patient"><button type="button" class="chrome-menu-patient-open" data-menu-patient-card><span class="'+(mobile?'chrome-drawer-icon':'sidebar-icon')+'" aria-hidden="true">'+Fe+'</span><span class="chrome-menu-patient-copy"><strong class="chrome-menu-patient-name" data-menu-patient-name>Wybierz pacjenta</strong><small>Karta pacjenta \u2197</small></span></button><button type="button" class="chrome-menu-patient-change" data-menu-patient-change>Wybierz</button></div>';
}
function Cm_menuNavigation(mobile){
  var nav=mobile?"chrome-drawer-nav":"sidebar-nav",section=mobile?"chrome-drawer-section":"sidebar-section",title=mobile?"chrome-drawer-section-title":"sidebar-section-title";
  var controlId=mobile?"chrome-drawer-calculators":"chrome-sidebar-calculators";
  var html='<nav class="'+nav+'" aria-label="'+(mobile?'Menu mobilne':'Nawigacja boczna')+'"><div class="'+section+' chrome-menu-office"><div class="'+title+'">Gabinet</div><ul>';
  html+=Cm_menuRow("patientsListBtnSidebar",mobile,"Baza pacjent\u00f3w")+Cm_menuRow("terminarz.html",mobile)+Cm_menuRow("notatki.html",mobile,"Notatnik");
  html+='</ul></div><div class="'+section+' chrome-menu-clinical"><div class="'+title+'">Narz\u0119dzia kliniczne</div><ul>';
  html+=Cm_menuRow("index.html",mobile)+Cm_menuRow("docpro.html",mobile)+Cm_menuRow("przelicznik-jednostek.html",mobile);
  html+='<li class="chrome-menu-calculators"><button type="button" class="chrome-menu-calculators-toggle" aria-expanded="false" aria-controls="'+controlId+'"><span class="'+(mobile?'chrome-drawer-icon':'sidebar-icon')+'" data-lucide="calculator" aria-hidden="true"></span><span>Pozosta\u0142e kalkulatory</span><span data-lucide="chevron-down" aria-hidden="true"></span></button><div class="chrome-menu-calculators-items" id="'+controlId+'" hidden><ul>';
  html+=Cm_menuRow("homa-ir.html",mobile)+Cm_menuRow("kalkulator-klirens.html",mobile)+Cm_menuRow("steroidy.html",mobile);
  return html+'</ul></div></li>'+Cm_menuRow("materialy-edukacyjne.html",mobile)+'</ul></div></nav>';
}
function Cm_menuActions(mobile){
  var html='<div class="chrome-menu-actions">'+Cm_patientMarkup(mobile)+'<button type="button" class="chrome-menu-save-status" data-menu-save-status data-save-state="hidden" aria-haspopup="dialog" aria-expanded="false"><span class="chrome-menu-save-dot" aria-hidden="true"></span><span data-menu-save-label aria-live="polite">Brak danych</span></button><div class="chrome-menu-action-buttons">';
  [["saveDataBtnSidebar","Zapisz dane","save","chrome-menu-save","Zapisz dane bie\u017c\u0105cego formularza"],["patientDocumentsBtnSidebar","Dokumenty","files","chrome-menu-documents","Dokumenty pacjenta z bie\u017c\u0105cego formularza"]].forEach(function(item){
    var attrs=mobile?'type="button" data-drawer-btn="'+item[0]+'"':'id="'+item[0]+'" href="#" role="button"';
    html+='<'+(mobile?'button':'a')+' '+attrs+' class="'+item[3]+' '+(mobile?'chrome-drawer-btn':'sidebar-link')+'" aria-label="'+item[4]+'" aria-disabled="true"><span class="'+(mobile?'chrome-drawer-icon':'sidebar-icon')+'" data-lucide="'+item[2]+'" aria-hidden="true"></span><span>'+item[1]+'</span></'+(mobile?'button':'a')+'>';
  });
  return html+'</div></div>';
}
function Cm_menuFooter(){
  return '<div class="chrome-menu-footer" data-vilda-chrome-drawer-account><div class="chrome-menu-account-row"><button type="button" class="chrome-menu-account" data-menu-account aria-label="Konto"><span class="chrome-menu-avatar chrome-drawer-account-avatar" data-vilda-chrome-drawer-avatar aria-hidden="true">\u2026</span><span class="chrome-menu-account-copy"><span class="chrome-drawer-account-value" data-vilda-chrome-drawer-user-value>\u2026</span></span></button><a href="subskrypcja.html" class="chrome-menu-pro" data-menu-pro hidden aria-label="Subskrypcja PRO">PRO</a></div><div class="chrome-menu-account-tools"><a href="ustawienia.html#settings-section-sync" class="chrome-menu-sync" data-menu-sync><span data-lucide="cloud" aria-hidden="true"></span><span data-menu-sync-label>Synchronizacja</span></a><a class="chrome-menu-settings" href="ustawienia.html" aria-label="Ustawienia" title="Ustawienia"><span data-lucide="settings" aria-hidden="true"></span></a><button type="button" class="chrome-menu-logout" data-menu-logout data-vilda-chrome-drawer-user-action aria-label="Zaloguj si\u0119" title="Zaloguj si\u0119"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" data-vilda-chrome-drawer-action-icon><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><path d="m10 17 5-5-5-5M15 12H3"></path></svg><span data-vilda-chrome-drawer-action-label hidden>Zaloguj si\u0119</span></button></div></div>';
}
function Cm_menuLegacy(mobile){
  return '<div class="chrome-menu-legacy" hidden aria-hidden="true">'+Cm_menuRow("addVisitNoteBtnSidebar",mobile)+'</div>';
}

function Cm_menuOwner(){
  try{
    var vault=r.VildaVault,ui=r.VildaAuthUI,session=r.VildaSession;
    if(!vault||typeof vault.isUnlocked!=="function"||!vault.isUnlocked()||r.VildaGuestMode===true)return null;
    if(ui&&typeof ui.isGuestMode==="function"&&ui.isGuestMode())return null;
    if(ui&&typeof ui.isLoggedIn==="function"&&!ui.isLoggedIn())return null;
    if(session&&typeof session.isLoggedIn==="function"&&!session.isLoggedIn())return null;
    var user=typeof vault.getCurrentUser==="function"?vault.getCurrentUser():null;
    return {vault:vault,userId:user&&user.userId||null};
  }catch{return null}
}
function Cm_sameMenuOwner(owner){
  var current=Cm_menuOwner();return !!(owner&&current&&owner.vault===current.vault&&owner.userId===current.userId);
}
function Cm_refreshMenuPatient(){
  var owner=Cm_menuOwner(),id=owner?Ce():null,patient=null;
  try{patient=r.VildaSession&&typeof r.VildaSession.getPatient==="function"?r.VildaSession.getPatient():Ae()}catch{}
  var name=id&&patient&&patient.name?String(patient.name):id?"Wybrany pacjent":"Wybierz pacjenta";
  var controls=o.querySelectorAll(".chrome-menu-patient");
  for(var i=0;i<controls.length;i++){
    var node=controls[i],value=node.querySelector("[data-menu-patient-name]"),open=node.querySelector("[data-menu-patient-card]"),change=node.querySelector("[data-menu-patient-change]");
    // Preserve the text node and a live selection when refresh has no new name.
    if(value&&value.textContent!==name)value.textContent=name;
    if(open)open.setAttribute("aria-label",id?"Karta pacjenta \u2014 "+name:"Karta pacjenta \u2014 wybierz pacjenta");
    if(change){var changeLabel=id?"Zmie\u0144":"Wybierz";if(change.textContent!==changeLabel)change.textContent=changeLabel}
    [open,change].forEach(function(button){if(!button)return;if(owner){button.removeAttribute("aria-disabled");button.removeAttribute("data-tip")}else{button.setAttribute("aria-disabled","true");button.setAttribute("data-tip","Zaloguj si\u0119, aby przegl\u0105da\u0107 kart\u0119 i baz\u0119 pacjent\u00f3w.")}});
  }
}
function Cm_waitMenuAuthBoot(ui,owner,sequence,patientId,href){
  if(typeof ui.isBootReady!=="function"||ui.isBootReady())return Promise.resolve(true);
  return new Promise(function(resolve){
    var done=false;
    function finish(ready){
      if(done)return;done=true;
      o.removeEventListener("vilda:auth-boot-settled",check);o.removeEventListener("vilda:session-changed",check);r.removeEventListener("pagehide",cancel);
      if(Cm_openMenuPatient.cancelPending===cancel)Cm_openMenuPatient.cancelPending=null;
      resolve(ready);
    }
    function cancel(){finish(false)}
    function check(){
      if(ui!==r.VildaAuthUI||sequence!==Cm_openMenuPatient.sequence||!Cm_sameMenuOwner(owner)||Ce()!==patientId||String(r.location&&r.location.href||"")!==href){finish(false);return}
      try{if(ui.isBootReady())finish(true)}catch{finish(false)}
    }
    Cm_openMenuPatient.cancelPending=cancel;
    o.addEventListener("vilda:auth-boot-settled",check);o.addEventListener("vilda:session-changed",check);r.addEventListener("pagehide",cancel);
    check();
  });
}
async function Cm_openMenuPatient(change,opener){
  if(typeof Cm_openMenuPatient.cancelPending==="function")Cm_openMenuPatient.cancelPending();
  var owner=Cm_menuOwner(),sequence=(Cm_openMenuPatient.sequence||0)+1;Cm_openMenuPatient.sequence=sequence;
  if(!owner){F(opener,"Zaloguj si\u0119, aby przegl\u0105da\u0107 kart\u0119 i baz\u0119 pacjent\u00f3w.");return false}
  var patientId=Ce(),host=Cm_shell();
  if(change||!patientId){
    var list=o.getElementById("patientsListBtnSidebar");
    if(!list||typeof list.click!=="function"){F(opener,Cm_unavailable);return false}
    Cm_closeDrawer({reason:"handoff"});list.click();return true;
  }
  if(host&&typeof host.shell.openPatientCardInStart==="function"){
    Cm_closeDrawer({reason:"handoff"});host.shell.openPatientCardInStart(patientId);return true;
  }
  var href=String(r.location&&r.location.href||"");
  try{
    if(!r.VildaAuthUI||typeof r.VildaAuthUI.showPatientCard!=="function"){
      var session=r.VildaSession;
      if(!session||typeof session.ensureAuthLoaded!=="function"){F(opener,Cm_unavailable);return false}
      await session.ensureAuthLoaded();
    }
    if(sequence!==Cm_openMenuPatient.sequence||!Cm_sameMenuOwner(owner)||Ce()!==patientId||String(r.location&&r.location.href||"")!==href)return false;
    var ui=r.VildaAuthUI;if(!ui||typeof ui.showPatientCard!=="function"){F(opener,Cm_unavailable);return false}
    if(!await Cm_waitMenuAuthBoot(ui,owner,sequence,patientId,href))return false;
    if(!Cm_sameMenuOwner(owner)||Ce()!==patientId||sequence!==Cm_openMenuPatient.sequence||String(r.location&&r.location.href||"")!==href)return false;
    Cm_closeDrawer({reason:"handoff"});ui.showPatientCard(patientId);return true;
  }catch{if(Cm_sameMenuOwner(owner))F(opener,"Nie uda\u0142o si\u0119 otworzy\u0107 karty pacjenta. Spr\u00f3buj ponownie.");return false}
}
function Cm_refreshMenuActions(){
  Qdm(o.querySelector("[data-vilda-chrome-drawer]"));
  Ch_refreshSaveState();
}
// Account/patient names remain copyable. A drag that selected a name must not
// turn its following pointer click into navigation; keyboard and plain clicks
// still work even when an earlier selection remains in the document.
function Cm_menuNameDrag(button,event,origin){
  if(!origin||!event||!(event.detail>0))return false;
  var dx=event.clientX-origin.x,dy=event.clientY-origin.y;
  if(!(dx*dx+dy*dy>=9))return false;
  try{
    var name=button.querySelector("[data-menu-patient-name],.chrome-drawer-account-value"),selection=typeof r.getSelection==="function"&&r.getSelection();
    return !!(name&&selection&&!selection.isCollapsed&&selection.rangeCount&&(name.contains(selection.anchorNode)||name.contains(selection.focusNode)));
  }catch{return false}
}
function Cm_bindMenuControls(root){
  var controls=root.querySelectorAll("[data-menu-patient-card],[data-menu-patient-change],.chrome-menu-calculators-toggle,[data-menu-account],[data-menu-logout],[data-menu-save-status]");
  for(var i=0;i<controls.length;i++)(function(button){
    if(button._vildaMenuBound)return;button._vildaMenuBound=true;
    var namePointer=null;
    if(button.hasAttribute("data-menu-patient-card")||button.hasAttribute("data-menu-account")){
      button.addEventListener("pointerdown",function(event){
        var name=button.querySelector("[data-menu-patient-name],.chrome-drawer-account-value");
        namePointer=event.button===0&&name&&name.contains(event.target)?{x:event.clientX,y:event.clientY}:null;
      });
      button.addEventListener("pointercancel",function(){namePointer=null});
    }
    button.addEventListener("click",function(event){
      var selected=Cm_menuNameDrag(button,event,namePointer);namePointer=null;
      event.preventDefault();
      if(selected){event.stopPropagation();return}
      if(button.hasAttribute("data-menu-save-status")){event.stopPropagation();Ch_statusAnchor=button;_e();return}
      if(button.hasAttribute("data-menu-patient-card")||button.hasAttribute("data-menu-patient-change")){Cm_openMenuPatient(button.hasAttribute("data-menu-patient-change"),button);return}
      if(button.classList.contains("chrome-menu-calculators-toggle")){
        var panel=o.getElementById(button.getAttribute("aria-controls")),expanded=button.getAttribute("aria-expanded")!=="true";
        button.setAttribute("aria-expanded",String(expanded));if(panel)panel.hidden=!expanded;return;
      }
      if(button.hasAttribute("data-menu-account")&&Cm_menuOwner()){Cm_account();return}
      Cm_closeDrawer({reason:"handoff"});var account=o.getElementById("vildaUserAction");if(account&&typeof account.click==="function")account.click();
    });
  })(controls[i]);
  ["saveDataBtnSidebar","patientDocumentsBtnSidebar"].forEach(function(id){
    var action=o.getElementById(id);if(!action||action._vildaMenuObserved||typeof r.MutationObserver!=="function")return;
    action._vildaMenuObserved=true;new r.MutationObserver(Cm_refreshMenuActions).observe(action,{attributes:true,attributeFilter:["aria-disabled","disabled","aria-busy","data-tip"]});
  });
  Cm_refreshMenuActions();Cm_refreshMenuPatient();Ch_refreshMenuPro();Ch_refreshSync();Cm_bindSidebarPosition();
}
function Cm_sidebarPosition(){
  var sidebar=Ee(),header=Xe();
  if(!sidebar||!header||o.documentElement.classList.contains("vilda-embedded")||o.documentElement.classList.contains("vilda-shell-embedded")||!sidebar.getClientRects().length)return;
  var style=r.getComputedStyle&&r.getComputedStyle(sidebar);if(style&&style.display==="none")return;
  var headerStyle=r.getComputedStyle&&r.getComputedStyle(header),headerTop=header.offsetTop;
  // Sticky offsetTop follows scrolling; its inset describes the stable layout edge.
  if(headerStyle&&(headerStyle.position==="sticky"||headerStyle.position==="fixed"))headerTop=Math.max(0,parseFloat(headerStyle.top)||0);
  var left=Math.max(0,sidebar.getBoundingClientRect().left),top=Math.max(0,headerTop+header.getBoundingClientRect().height);
  [["--chrome-sidebar-left",left+"px"],["--chrome-sidebar-top",top+"px"]].forEach(function(pair){if(sidebar.style.getPropertyValue(pair[0])!==pair[1])sidebar.style.setProperty(pair[0],pair[1])});
}
function Cm_scheduleSidebarPosition(){
  if(Cm_scheduleSidebarPosition.pending)return;Cm_scheduleSidebarPosition.pending=true;
  var callback=function(){Cm_scheduleSidebarPosition.pending=false;Cm_sidebarPosition()};
  if(typeof r.requestAnimationFrame==="function")r.requestAnimationFrame(callback);else r.setTimeout(callback,0);
}
function Cm_bindSidebarPosition(){
  if(!Cm_bindSidebarPosition.bound){
    Cm_bindSidebarPosition.bound=true;r.addEventListener("resize",Cm_scheduleSidebarPosition,{passive:true});r.addEventListener("scroll",Cm_scheduleSidebarPosition,{passive:true});
    if(typeof r.ResizeObserver==="function"){
      var observer=new r.ResizeObserver(Cm_scheduleSidebarPosition),header=Xe(),sidebar=Ee();
      if(header)observer.observe(header);if(sidebar)observer.observe(sidebar);
    }
  }
  Cm_scheduleSidebarPosition();
}

function Ke(){return '<div class="sidebar-inner">'+Cm_menuActions(false)+'<div class="chrome-menu-scroll">'+Cm_menuNavigation(false)+'<div class="sidebar-extras" data-vilda-chrome-extras></div>'+Cm_menuLegacy(false)+'</div>'+Cm_menuFooter()+'</div>'}function Ze(){var e=Ee();if(!e)return!1;if(e.getAttribute("data-vilda-chrome-mounted")==="1")return se(e),Cm_bindMenuControls(e),!0;var t=[],a=e.querySelector("#miniSummary");a&&t.push(a);var n=e.querySelector(".steroid-summary:not(.mini-summary .steroid-summary)");n&&t.indexOf(n)===-1&&t.push(n),e.classList.add("sidebar","sidebar-v2"),e.innerHTML=Ke(),e.setAttribute("data-vilda-chrome-mounted","1");var s=e.querySelector("[data-vilda-chrome-extras]");return s&&t.length&&t.forEach(function(i){s.appendChild(i)}),B(e),se(e),Cm_bindMenuControls(e),!0}function se(e){var t=e||Ee();if(t){for(var a=ge(),n=t.querySelectorAll(".sidebar-nav a[href],.chrome-menu-footer a[href]"),s=0;s<n.length;s++){var i=n[s],d=i.getAttribute("href")||"",c=d.lastIndexOf("/"),u=c>=0?d.substring(c+1):d,l=u===a||u==="materialy-edukacyjne.html"&&we(a);l?(i.setAttribute("aria-current","page"),i.classList.add("is-active")):(i.removeAttribute("aria-current"),i.classList.remove("is-active"))}for(var v=o.querySelectorAll("[data-vilda-chrome-drawer] a[href]"),p=0;p<v.length;p++){var y=v[p],w=y.getAttribute("href")||"",x=w.lastIndexOf("/"),k=x>=0?w.substring(x+1):w;k===a||k==="materialy-edukacyjne.html"&&we(a)?(y.setAttribute("aria-current","page"),y.classList.add("is-active")):(y.removeAttribute("aria-current"),y.classList.remove("is-active"))}}}function Xe(){return o.querySelector("header[data-vilda-chrome-header]")||o.querySelector("header")}function Je(){
  var snapshot=ke()||{},signed=$(),pro=signed&&(snapshot.pro==="active"||snapshot.pro==="upgrade")?snapshot.pro:null,patient=!!(signed&&snapshot.hasPatient===true),label=signed&&snapshot.accountLabel?String(snapshot.accountLabel):null;
  return ['<div class="chrome-strip" data-vilda-chrome-strip>',
    '<button type="button" class="chrome-mobile-menu-btn" aria-label="Otw\u00f3rz menu" aria-haspopup="dialog" aria-expanded="false" data-vilda-chrome-menu-btn><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg></button>',
    '<a href="index.html" class="chrome-brand"><img src="logo_vilda.webp" alt="" width="38" height="38" class="chrome-brand-logo"><span class="chrome-brand-text"><span class="chrome-brand-name">wagaiwzrost.pl</span><span class="chrome-brand-tagline">Vilda Clinic</span></span></a>',
    Ch_searchMarkup(),'<div class="chrome-chips">',wt(),
    '<button type="button" id="vildaHeaderSearchBtn" class="chrome-header-search-btn" aria-label="Szukaj" aria-haspopup="dialog">'+Ch_searchIcon()+'</button>',bt(),'</div></div>',
    // These IDs remain the state/command bridge for the existing auth, PRO and save modules.
    '<div class="chrome-legacy-state" hidden aria-hidden="true" inert>',
    '<a href="subskrypcja.html" class="chrome-pro-badge" id="vildaProBadge"'+(pro?' data-pro-state="'+pro+'" style="display:inline-flex"':'')+' title="Status planu PRO" aria-label="Status planu PRO">'+(pro==="upgrade"?'\u2191 PRO':'PRO')+'</a>',
    '<div class="chrome-chip chrome-patient-chip '+(patient?'has-patient':'is-empty')+'" id="vildaPatientChip" role="button" tabindex="-1" aria-haspopup="dialog" aria-expanded="false" title="Status zapisu"><span class="chip-icon" aria-hidden="true">'+Se+'</span><span class="chip-content"><span class="chip-label">Pacjent</span><span class="chip-value" id="vildaPatientValue">'+(signed?patient?'\u2026':'Brak':'\u2014')+'</span></span><span class="chrome-chip-card" aria-hidden="true">'+Fe+'</span></div>',
    '<div class="chrome-chip chrome-user-chip '+(label?'is-logged-in':'is-loading')+'" id="vildaUserChip"><span class="chip-avatar" id="vildaUserAvatar" aria-hidden="true">'+(label?g(J(label)):'\u2026')+'</span><span class="chip-content"><span class="chip-label">Konto</span><span class="chip-value" id="vildaUserValue">'+(label?g(label):'\u2026')+'</span></span><button type="button" class="chip-action" id="vildaUserAction" title="Wyloguj si\u0119" aria-label="Wyloguj si\u0119"><span data-lucide="log-out" aria-hidden="true"></span></button></div></div>',
    '<div class="chrome-drawer" data-vilda-chrome-drawer hidden aria-hidden="true"><div class="chrome-drawer-backdrop" data-vilda-chrome-drawer-close></div><div class="chrome-drawer-panel" role="dialog" aria-label="Menu" tabindex="-1"><div class="chrome-drawer-head"><button type="button" class="chrome-drawer-close" data-vilda-chrome-drawer-close aria-label="Zamknij menu"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m18 6-12 12M6 6l12 12"/></svg></button></div><div class="chrome-drawer-body" data-vilda-chrome-drawer-body></div></div></div>'
  ].join('');
}function $e(){return Cm_menuActions(true)+'<div class="chrome-menu-scroll">'+Cm_menuNavigation(true)+Cm_menuLegacy(true)+'</div>'+Cm_menuFooter()}function Qe(){var e=Xe();if(!e)return!1;if(e.getAttribute("data-vilda-chrome-mounted")!=="1"){var t=e.querySelector(":scope > .container");t&&(t.style.display="none");var a=e.querySelector(":scope > .main-nav");a&&(a.style.display="none");var n=o.createElement("div");n.setAttribute("data-vilda-chrome-wrap",""),n.innerHTML=Je(),e.appendChild(n),e.setAttribute("data-vilda-chrome-mounted","1"),o.body.classList.add("has-vilda-chrome","vilda-header-menu");var i=n.querySelector("[data-vilda-chrome-drawer]");i&&i.parentElement!==o.body&&o.body.appendChild(i)}var s=o.querySelector("[data-vilda-chrome-drawer-body]");s&&!s.firstChild&&(s.innerHTML=$e(),et(s)),tt(e),B(e);var i=o.querySelector("[data-vilda-chrome-drawer]");return i&&B(i),Cm_bindMenuControls(o),Ch_bindHeader(),!0}/* P-NOTATKI-2 (G19): przycisk w szufladzie mobilnej wygladal na aktywny i przekazywal klik do
   ukrytego (display:none) przycisku paska bocznego. Dymek odmowy rodzil sie wtedy na prostokacie
   0x0 w lewym gornym rogu ekranu, oderwany od tego, co lekarz dotknal. Teraz szuflada lustruje
   aria-disabled/data-tip i przy wylaczonym przycisku pokazuje dymek NA SOBIE, bez zamykania. */
function Qdm(e){try{for(var t=e?e.querySelectorAll("[data-drawer-btn]"):[],a=0;a<t.length;a++){var n=t[a],s=o.getElementById(n.getAttribute("data-drawer-btn")||"");if(!s)continue;var i=s.getAttribute("aria-disabled")==="true"||s.hasAttribute("disabled");i?n.setAttribute("aria-disabled","true"):n.removeAttribute("aria-disabled");if(s.getAttribute("aria-busy")==="true")n.setAttribute("aria-busy","true");else n.removeAttribute("aria-busy");var d=s.getAttribute("data-tip");d?n.setAttribute("data-tip",d):n.removeAttribute("data-tip")}}catch{}}
function et(e){for(var t=e?e.querySelectorAll("[data-drawer-btn]"):[],a=0;a<t.length;a++)(function(n){n.addEventListener("click",function(){var s=n.getAttribute("data-drawer-btn");if(s){var d=o.getElementById(s);if(d&&(d.getAttribute("aria-disabled")==="true"||d.hasAttribute("disabled"))){F(n,d.getAttribute("data-tip")||n.getAttribute("data-tip")||Cm_unavailable);return}if(!d||typeof d.click!=="function"){F(n,Cm_unavailable);return}var i=o.querySelector("[data-vilda-chrome-drawer]");i&&ee(i,{reason:"handoff"});if(s==="patientDocumentsBtnSidebar"){d._vildaDocumentsOpener=n;try{d.click()}finally{delete d._vildaDocumentsOpener}}else d.click()}})})(t[a])}function tt(e){if(K)return;K=!0;var t=e.querySelector(".chrome-brand");t&&t.addEventListener("click",function(f){try{if(!Cm_plainClick(f,t))return;var m=null,S=null;try{r.VildaShell&&typeof r.VildaShell.navigate=="function"?(m=r,S=r.VildaShell):r.parent&&r.parent!==r&&r.parent.VildaShell?(m=r.parent,S=r.parent.VildaShell):r.top&&r.top!==r&&r.top.VildaShell&&(m=r.top,S=r.top.VildaShell)}catch{m=null,S=null}if(!S||typeof S.navigate!="function")return;f.preventDefault();var A=!1;try{A=String(m.location.hash||"")==="#/start"}catch{A=!1}S.navigate("start",!A)}catch{}});var a=e.querySelector("[data-vilda-chrome-menu-btn]"),n=o.querySelector("[data-vilda-chrome-drawer]");if(a&&n){a.setAttribute("aria-expanded","false");a.addEventListener("click",function(){var drawer=o.querySelector("[data-vilda-chrome-drawer]");drawer&&nt(drawer,a)});n.addEventListener("click",function(event){var close=event.target&&event.target.closest?event.target.closest("[data-vilda-chrome-drawer-close]"):null;if(close&&n.contains(close))ee(n,{reason:"dismiss"})})}var d=[{type:"css",href:"vilda_auth_ui.css?v=81",test:function(){return!1}},{type:"script",href:"vilda_crypto.js?v=15",test:function(){return!!r.VildaCrypto}},{type:"script",href:"vilda_lab_testosterone_units.js?v=1",test:function(){return!!r.VildaLabTestosteroneUnits}},{type:"script",href:"vilda_lab_snapshot.js?v=10",test:function(){return!!r.VildaLabSnapshot}},{type:"script",href:"vilda_hormone_reference_snapshot.js?v=1",test:function(){return!!r.VildaHormoneReferenceSnapshot}},{type:"script",href:"vilda_lab_range_snapshot.js?v=2",test:function(){return!!r.VildaLabRangeSnapshot}},{type:"css",href:"vilda_lab_assessment_ui.css?v=13",test:function(){return!1}},{type:"script",href:"vilda_lab_assessment_ui.js?v=19",test:function(){return!!r.VildaLabAssessmentUI}},{type:"script",href:"vilda_hormone_reference_ui.js?v=1",test:function(){return!!r.VildaHormoneReferenceUI}},{type:"script",href:"vilda_lab_history.js?v=5",test:function(){return!!r.VildaLabHistory}},{type:"css",href:"vilda_lab_history_tab.css?v=4",test:function(){return!1}},{type:"script",href:"vilda_lab_history_tab.js?v=23",test:function(){return!!r.VildaLabHistoryTab}},{type:"script",href:"vilda_care_plan_model.js?v=1",test:function(){return!!r.VildaCarePlanModel}},{type:"script",href:"vilda_clinical_crypto.js?v=2",test:function(){return!!r.VildaClinicalCrypto}},{type:"script",href:"vilda_patient_checkpoint_store.js?v=1",test:function(){return!!r.VildaPatientCheckpointStore}},{type:"script",href:"vilda_patient_checkpoint.js?v=1",test:function(){return!!r.VildaPatientCheckpoint}},{type:"script",href:"vilda_vault_protocol.js?v=1",test:function(){return!!r.VildaVaultProtocol}},{type:"script",href:"vilda_patient_identity_protocol.js?v=1",test:function(){return!!r.VildaPatientIdentityProtocol}},{type:"script",href:"vilda_patient_identity_transport.js?v=1",test:function(){return!!r.VildaPatientIdentityTransport}},{type:"script",href:"vilda_vault.js?v=248",test:function(){return!!r.VildaVault}},{type:"script",href:"vilda_puberty_assessment.js?v=3",test:function(){return!!r.VildaPubertyAssessment}},{type:"css",href:"vilda_care_plans.css?v=10",test:function(){return!1}},{type:"script",href:"vilda_care_plans.js?v=12",test:function(){return!!r.VildaCarePlans}},{type:"script",href:"vilda_reminders_privacy.js?v=1",test:function(){return!!r.VildaRemindersPrivacy}},{type:"css",href:"vilda_reminders.css?v=8",test:function(){return!1}},{type:"css",href:"vilda_global_search.css?v=2",test:function(){return!1}},{type:"script",href:"vilda_global_search.js?v=4",test:function(){return!!r.VildaGlobalSearch}},{type:"script",href:"vilda_global_search_view.js?v=6",test:function(){return!!r.VildaGlobalSearchView}},{type:"script",href:"vilda_search_navigation.js?v=1",test:function(){return!!r.VildaSearchNavigation}},{type:"script",href:"vilda_auth_ui.js?v=537",test:function(){return!!r.VildaAuthUI}},{type:"script",href:"vilda_pro_access.js?v=11",test:function(){return!!r.VildaProAccess}}];function c(f){return new Promise(function(m,S){try{if(f.test&&f.test()){m();return}var A=f.type==="css"?'link[rel="stylesheet"][href*="'+f.href.split("?")[0]+'"]':'script[src*="'+f.href.split("?")[0]+'"]',j=o.querySelector(A);if(j){if(f.type==="script"){if(f.test&&f.test()){m();return}j.addEventListener("load",function(){m()},{once:!0}),j.addEventListener("error",function(){S(new Error("load-error"))},{once:!0});return}m();return}var I;f.type==="css"?(I=o.createElement("link"),I.rel="stylesheet",I.href=f.href):(I=o.createElement("script"),I.src=f.href,I.async=!1),I.addEventListener("load",function(){m()},{once:!0}),I.addEventListener("error",function(){S(new Error("load-error"))},{once:!0}),o.head.appendChild(I)}catch(qt){S(qt)}})}function u(){return r.VildaLabSnapshot&&r.VildaLabTestosteroneUnits&&r.VildaLabAssessmentUI&&r.VildaHormoneReferenceSnapshot&&r.VildaLabRangeSnapshot&&r.VildaHormoneReferenceUI&&r.VildaLabHistory&&r.VildaLabHistoryTab&&r.VildaPubertyAssessment&&r.VildaCarePlans&&r.VildaRemindersPrivacy&&r.VildaGlobalSearch&&r.VildaGlobalSearchView&&r.VildaSearchNavigation&&r.VildaAuthUI&&r.VildaCarePlanModel&&r.VildaClinicalCrypto&&r.VildaPatientCheckpointStore&&r.VildaPatientCheckpoint&&r.VildaVaultProtocol&&r.VildaPatientIdentityProtocol&&r.VildaPatientIdentityTransport&&r.VildaVault?Promise.resolve():d.reduce(function(f,m){return f.then(function(){return c(m)})},Promise.resolve())}function l(){var f=r.VildaAuthUI;if(!f)return!1;try{if(typeof f.isGuestMode=="function"&&f.isGuestMode()&&typeof f.exitGuestMode=="function")return f.exitGuestMode(),!0;if(typeof f.showStartupScreen=="function")return f.showStartupScreen(),!0;if(typeof f.show=="function")return f.show(),!0;if(typeof f.setup=="function")return f.setup({force:!0}),!0}catch{}return!1}function v(){var f=r.VildaVault,m=f&&typeof f.isUnlocked=="function"&&f.isUnlocked();if(m){if(typeof f.lock=="function")try{f.lock("manual")}catch{}return}u().then(function(){var S=0;function A(){if(!l()){if(S++>=15){try{r.location.href="index.html"}catch{}return}setTimeout(A,100)}}A()}).catch(function(){try{r.location.href="index.html"}catch{}})}var p=e.querySelector("#vildaUserAction");p&&p.addEventListener("click",v);function y(){var f=r.VildaVault,m=r.VildaGuestMode===!0,S=f&&typeof f.getCurrentUser=="function"?f.getCurrentUser():null;if(S&&!m)try{Cm_account()}catch{}}var w=e.querySelector("#vildaPatientChip");w&&(w.addEventListener("click",function(f){f.stopPropagation(),_e()}),w.addEventListener("keydown",function(f){(f.key==="Enter"||f.key===" "||f.key==="Spacebar")&&(f.preventDefault(),_e())})),o.addEventListener("click",function(f){if(O&&!Cm_programmaticDownload(f)&&!(h&&h.contains(f.target))){var m=o.getElementById("vildaPatientChip");m&&m.contains(f.target)||te()}}),o.addEventListener("keydown",function(f){((f.key==="Escape"||f.key==="Esc")&&O)&&(f.preventDefault(),f.stopImmediatePropagation(),te(),Ch_statusAnchor&&Ch_statusAnchor.focus({preventScroll:true}))}),r.addEventListener("resize",function(){O&&le()}),r.addEventListener("scroll",function(){O&&le()},!0);var x=e.querySelector("#vildaUserAvatar"),k=e.querySelector("#vildaUserValue");x&&(x.addEventListener("click",y),x.addEventListener("keydown",function(f){(f.key==="Enter"||f.key===" "||f.key==="Spacebar")&&(f.preventDefault(),y())})),k&&(k.addEventListener("click",y),k.addEventListener("keydown",function(f){(f.key==="Enter"||f.key===" "||f.key==="Spacebar")&&(f.preventDefault(),y())}));Cm_bindMenuControls(o)}/* P-CHROME-MENU: jedna granica menu, klawiatury i tla. Kazdy snapshot
   wraca przy zamknieciu; nawigacja oraz nowy modal zachowuja wlasny focus. */
var Cm_drawer=null;
var Cm_accountSwap=null;
var Cm_unavailable="Ta opcja jest teraz niedost\u0119pna.";
var Cm_focusSelector='a[href],button,input,select,textarea,summary,[tabindex],[contenteditable="true"]';
var Cm_backgroundSelector=Cm_focusSelector+',iframe';
function Cm_shell(){
  try{if(r.VildaShell&&typeof r.VildaShell.navigate==="function")return {win:r,shell:r.VildaShell};
    if(r.parent&&r.parent!==r&&r.parent.VildaShell&&typeof r.parent.VildaShell.navigate==="function")return {win:r.parent,shell:r.parent.VildaShell};
  }catch{}
  return null;
}
function Cm_cancelFocus(){var host=Cm_shell();if(host&&typeof host.shell.cancelPendingPaneFocus==="function")host.shell.cancelPendingPaneFocus()}
function Cm_plainClick(event,anchor){
  if(!event||event.defaultPrevented||event.button!=null&&event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return false;
  if(!anchor||anchor.hasAttribute("download"))return false;
  var target=anchor.getAttribute("target"),doc=anchor.ownerDocument||o,win=doc.defaultView||r;
  if(target===null){var base=doc.querySelector&&doc.querySelector("base[target]");target=base&&base.getAttribute("target")||""}
  target=String(target||"");
  if(!target||target.toLowerCase()==="_self")return true;
  if(target.toLowerCase()==="_parent")return win.parent===win;
  if(target.toLowerCase()==="_top")return win.top===win;
  return !!(win.name&&target===win.name);
}
// A programmatic export click preserves the patient popup and still reaches the browser.
function Cm_programmaticDownload(event){
  var target=event&&event.target;
  return !!(event&&event.isTrusted===false&&target&&typeof target.closest==="function"&&target.closest("a[download]"));
}
function Cm_focus(el){try{el&&typeof el.focus==="function"&&el.focus({preventScroll:true})}catch{}}
function Cm_visible(el){
  if(!el||el.hidden||el.disabled||el.closest&&el.closest('[hidden],[aria-hidden="true"],[inert]'))return false;
  try{var style=r.getComputedStyle(el);if(style.display==="none"||style.visibility==="hidden")return false}catch{}
  return !!(el.getClientRects&&el.getClientRects().length);
}
function Cm_tabbables(state){
  return Array.prototype.filter.call(state.panel.querySelectorAll(Cm_focusSelector),function(el){
    var value=el.getAttribute("tabindex");
    return (value===null||Number(value)>=0)&&Cm_visible(el);
  });
}
function Cm_focusFirst(state,last){var items=Cm_tabbables(state);Cm_focus(items.length?items[last?items.length-1:0]:state.panel)}
function Cm_listen(state,target,type,fn){
  target.addEventListener(type,fn,true);
  state.listeners.push(function(){target.removeEventListener(type,fn,true)});
}
function Cm_key(event){
  var state=Cm_drawer;if(!state||event.defaultPrevented)return;
  if(event.key==="Escape"||event.key==="Esc"){event.preventDefault();event.stopPropagation();if(O){te();if(Ch_statusAnchor)Ch_statusAnchor.focus({preventScroll:true});return}ee(state.element,{reason:"dismiss"});return}
  if(event.key!=="Tab")return;
  event.preventDefault();event.stopPropagation();
  var items=Cm_tabbables(state),at=items.indexOf(o.activeElement);
  if(!items.length){Cm_focus(state.panel);return}
  var next=at<0?(event.shiftKey?items.length-1:0):(at+(event.shiftKey?-1:1)+items.length)%items.length;
  Cm_focus(items[next]);
}
function Cm_guardFocus(event){
  var state=Cm_drawer;if(!state||state.element.contains(event.target))return;
  Cm_focusFirst(state);
}
function Cm_guardPointer(event){
  var state=Cm_drawer;if(!state||state.element.contains(event.target)||Cm_programmaticDownload(event))return;
  event.preventDefault();event.stopPropagation();
}
function Cm_frame(state,frame){
  if(!state.frames.has(frame)){
    state.frames.add(frame);Cm_listen(state,frame,"load",function(){if(Cm_drawer===state)Cm_frame(state,frame)});
  }
  try{var doc=frame.contentDocument;
    if(!doc||state.docs.has(doc))return;
    state.docs.add(doc);
    Cm_listen(state,doc,"focusin",function(event){if(!state.element.contains(frame))Cm_guardFocus(event)});Cm_listen(state,doc,"keydown",Cm_key);Cm_listen(state,doc,"pointerdown",function(event){if(!state.element.contains(frame))Cm_guardPointer(event)});Cm_listen(state,doc,"click",function(event){if(!state.element.contains(frame))Cm_guardPointer(event)});
  }catch{}
}
function Cm_snapshotTab(state,el){
  if(state.tabs.has(el))return;
  state.tabs.set(el,el.getAttribute("tabindex"));el.setAttribute("tabindex","-1");
}
function Cm_block(state,node){
  if(!state.blocks.has(node)){
    state.blocks.set(node,{inert:node.getAttribute("inert"),aria:node.getAttribute("aria-hidden"),fallback:node.classList.contains("chrome-drawer-inert-fallback")});
    node.setAttribute("inert","");node.setAttribute("aria-hidden","true");
    if(!state.nativeInert)node.classList.add("chrome-drawer-inert-fallback");
  }
  if(!state.nativeInert){
    if(node.matches&&node.matches(Cm_backgroundSelector))Cm_snapshotTab(state,node);
    Array.prototype.forEach.call(node.querySelectorAll(Cm_backgroundSelector),function(el){Cm_snapshotTab(state,el)});
  }
  if(node.tagName==="IFRAME")Cm_frame(state,node);
  Array.prototype.forEach.call(node.querySelectorAll("iframe"),function(frame){Cm_frame(state,frame)});
}
function Cm_background(state){
  if(Cm_drawer!==state)return;
  state.blocks.forEach(function(saved,node){
    if(state.element.contains(node)||node.contains(state.element)){Cm_restoreBlock(saved,node);state.blocks.delete(node)}
  });
  state.tabs.forEach(function(value,node){
    if(state.element.contains(node)){Cm_attr(node,"tabindex",value);state.tabs.delete(node)}
  });
  function visit(parent){
    Array.prototype.forEach.call(parent.children,function(node){
      if(node===state.element||/^(SCRIPT|STYLE|LINK|META|TEMPLATE)$/.test(node.tagName))return;
      if(node.contains(state.element)){visit(node);return}
      Cm_block(state,node);
    });
  }
  visit(o.body);
}
function Cm_attr(el,key,value){if(value===null)el.removeAttribute(key);else el.setAttribute(key,value)}
function Cm_restoreBlock(saved,node){
  Cm_attr(node,"inert",saved.inert);Cm_attr(node,"aria-hidden",saved.aria);
  if(!saved.fallback)node.classList.remove("chrome-drawer-inert-fallback");
}
function Cm_release(state){
  if(state.observer)state.observer.disconnect();
  state.listeners.forEach(function(remove){remove()});
  state.blocks.forEach(Cm_restoreBlock);
  state.tabs.forEach(function(value,el){Cm_attr(el,"tabindex",value)});
}
function Cm_closeDrawer(options){
  var element=Cm_drawer?Cm_drawer.element:o.querySelector("[data-vilda-chrome-drawer]");
  return element?ee(element,options):false;
}
function Cm_prepareAccountSwap(href){
  // A4: skip only the HOMA source snapshot for standalone account navigation.
  // The handler expires on pageswap and a later attempt replaces a cancelled one.
  try{
    if(Cm_accountSwap){r.removeEventListener("pageswap",Cm_accountSwap);Cm_accountSwap=null}
    var base=r.location.href;
    if(!/\/homa-ir\.html$/.test(new r.URL(base).pathname))return;
    var expected=new r.URL(href,base).href;
    var listener=function(event){
      r.removeEventListener("pageswap",listener);if(Cm_accountSwap===listener)Cm_accountSwap=null;
      try{
        var target=event&&event.activation&&event.activation.entry&&event.activation.entry.url;
        if(!target||new r.URL(target,base).href!==expected)return;
        var transition=event&&event.viewTransition;
        if(transition&&typeof transition.skipTransition==="function")transition.skipTransition();
      }catch{}
    };
    r.addEventListener("pageswap",listener,{once:true});Cm_accountSwap=listener;
  }catch{}
}
function Cm_account(){
  var host=Cm_shell(),href="ustawienia.html#settings-section-account";
  if(host){var same=false;try{same=String(host.win.location.hash||"")==="#/ustawienia"}catch{}
    Cm_closeDrawer({reason:"navigation"});host.shell.navigate("ustawienia",!same,href);return;
  }
  Cm_closeDrawer({reason:"navigation"});Cm_prepareAccountSwap(href);r.location.href=href;
}
function nt(element,trigger){
  Cm_cancelFocus();
  if(Cm_drawer&&Cm_drawer.element===element){Cm_focusFirst(Cm_drawer);return}
  if(Cm_drawer)ee(Cm_drawer.element,{reason:"handoff"});
  if(element.__vildaCloseTimer){clearTimeout(element.__vildaCloseTimer);element.__vildaCloseTimer=null}
  Qdm(element);element.hidden=false;element.setAttribute("aria-hidden","false");
  o.body.classList.add("chrome-drawer-open");B(element);
  var panel=element.querySelector('[role="dialog"]')||element;
  panel.setAttribute("aria-modal","true");if(!panel.hasAttribute("tabindex"))panel.setAttribute("tabindex","-1");
  var button=trigger||o.querySelector("[data-vilda-chrome-menu-btn]");
  var state={element:element,panel:panel,trigger:trigger||o.activeElement,button:button,blocks:new Map(),tabs:new Map(),frames:new Set(),docs:new Set(),listeners:[],nativeInert:"inert" in o.createElement("div")};
  Cm_drawer=state;
  if(button)button.setAttribute("aria-expanded","true");
  Cm_listen(state,o,"keydown",Cm_key);Cm_listen(state,o,"focusin",Cm_guardFocus);Cm_listen(state,o,"pointerdown",Cm_guardPointer);Cm_listen(state,o,"click",Cm_guardPointer);
  Cm_focusFirst(state);
  Cm_background(state);
  if(typeof r.MutationObserver==="function"){
    state.observer=new r.MutationObserver(function(){Cm_background(state)});state.observer.observe(o.body,{childList:true,subtree:true});
  }
}
function ee(element,options){
  Cm_openMenuPatient.sequence=(Cm_openMenuPatient.sequence||0)+1;
  if(typeof Cm_openMenuPatient.cancelPending==="function")Cm_openMenuPatient.cancelPending();
  var reason=options&&options.reason||"dismiss",state=Cm_drawer&&Cm_drawer.element===element?Cm_drawer:null;
  var opened=!!state||element.getAttribute("aria-hidden")==="false"&&!element.hidden;
  if(reason==="handoff")Cm_cancelFocus();
  if(state){Cm_drawer=null;Cm_release(state)}
  if(O&&h&&element.contains(h))te();
  if(M&&element.contains(M)){if(typeof M.__vildaTipCleanup==="function")M.__vildaTipCleanup();M.remove();M=null}
  if(element.__vildaCloseTimer){clearTimeout(element.__vildaCloseTimer);element.__vildaCloseTimer=null}
  var active=o.activeElement;
  if(active&&element.contains(active)&&typeof active.blur==="function")active.blur();
  var panel=state&&state.panel||element.querySelector('[role="dialog"]');if(panel)panel.removeAttribute("aria-modal");
  element.setAttribute("aria-hidden","true");element.hidden=true;o.body.classList.remove("chrome-drawer-open");
  var button=state&&state.button||o.querySelector("[data-vilda-chrome-menu-btn]");if(button)button.setAttribute("aria-expanded","false");
  if(state&&reason==="dismiss"&&state.trigger&&state.trigger.isConnected)Cm_focus(state.trigger);
  return opened;
}
var de={saved:{c1:"#15803d",c2:"#22c55e",name:"Zapisano",desc:"bie\u017c\u0105cy formularz jest zgodny z zapisanym pomiarem",heroBg:"linear-gradient(135deg, rgba(34,197,94,0.14), rgba(21,128,61,0.05))",icon:'<polyline points="20 6 9 17 4 12"/>'},dirty:{c1:"#b45309",c2:"#f59e0b",name:"Niezapisane zmiany",desc:'kliknij \u201EZapisz dane", aby zapisa\u0107 snapshot',heroBg:"linear-gradient(135deg, rgba(245,158,11,0.16), rgba(180,83,9,0.05))",icon:'<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>'},new_patient:{c1:"#6d28d9",c2:"#a855f7",name:"Nowy pacjent",desc:"brak snapshotu \u2014 zapisz, aby utworzy\u0107 kart\u0119",heroBg:"linear-gradient(135deg, rgba(168,85,247,0.16), rgba(109,40,217,0.05))",icon:'<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>'},saving:{c1:"#1d4ed8",c2:"#3b82f6",name:"Zapisywanie\u2026",desc:"trwa zapis snapshotu do vault",heroBg:"linear-gradient(135deg, rgba(59,130,246,0.16), rgba(29,78,216,0.05))",icon:'<path d="M21 12a9 9 0 1 1-6.219-8.56"/>'},error:{c1:"#b91c1c",c2:"#ef4444",name:"B\u0142\u0105d zapisu",desc:'spr\xF3buj ponownie \u2014 kliknij \u201EZapisz dane"',heroBg:"linear-gradient(135deg, rgba(239,68,68,0.16), rgba(185,28,28,0.05))",icon:'<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'},hidden:{c1:"#5f7274",c2:"#9eb8bb",name:"Brak danych pacjenta",desc:"wpisz dane pacjenta, aby rozpocz\u0105\u0107",heroBg:"linear-gradient(135deg, rgba(158,184,187,0.18), rgba(95,114,116,0.05))",icon:'<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>'}},Le=["saved","dirty","new_patient","saving","error"],h=null,O=!1;function ce(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function Ce(){try{return r.sessionStorage&&r.sessionStorage.getItem("vildaCurrentPatientId")||null}catch{return null}}function rt(){var e=r.VildaSaveStatusIndicator,t=e&&typeof e.getState=="function"?e.getState():"hidden";de[t]||(t="hidden");var a=de[t],n=a.desc;if(e&&t==="saved"){var s=typeof e.getLastSavedAtISO=="function"?e.getLastSavedAtISO():null,i=typeof e.getLastSnapshotCount=="function"?e.getLastSnapshotCount():null,d=[];i&&d.push("Snapshot #"+i),s&&typeof e._relativeTime=="function"&&d.push(e._relativeTime(s)),n=d.length?d.join(" \xB7 "):"Formularz jest zgodny z zapisanym pomiarem"}for(var c='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+a.icon+"</svg>",u='<div class="vsp-hero" style="background:'+a.heroBg+'"><span class="vsp-hero-ic" style="background:linear-gradient(135deg,'+a.c1+","+a.c2+')">'+c+'</span><span class="vsp-hero-txt"><span class="vsp-hero-title" style="color:'+a.c1+'">'+ce(a.name)+'</span><span class="vsp-hero-sub">'+ce(n)+"</span></span></div>",l='<div class="vsp-legend-head">Pozosta\u0142e stany</div><div class="vsp-legend">',v=0;v<Le.length;v++){var p=Le[v];if(p!==t){var y=de[p];l+='<div class="vsp-row"><span class="vsp-dot" style="background:linear-gradient(135deg,'+y.c1+","+y.c2+')"></span><span class="vsp-name">'+ce(y.name)+"</span></div>"}}l+="</div>";var w=Ce(),x=w?'<button type="button" class="vsp-action" data-vilda-open-card><span class="vsp-action-ic"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M13 9h4M13 13h4M7 16h10"/></svg></span><span class="vsp-action-txt"><span class="vsp-action-title">Otw\xF3rz Kart\u0119 pacjenta</span><span class="vsp-action-sub">wczytany pacjent</span></span><span class="vsp-action-go" aria-hidden="true">\u203A</span></button>':"";return x+u+l}function at(){
  if(!h){h=o.createElement("div");h.className="vilda-save-popover";h.setAttribute("role","dialog");h.setAttribute("aria-label","Status zapisu danych pacjenta");h.tabIndex=-1;h.hidden=true}
  var panel=Ch_statusAnchor&&Ch_statusAnchor.closest(".chrome-drawer-panel"),parent=panel||o.body;
  if(h.parentNode!==parent)parent.appendChild(h);
}function le(){
  var anchor=Ch_statusAnchor&&Ch_statusAnchor.isConnected?Ch_statusAnchor:o.getElementById("vildaPatientChip");if(!anchor||!h)return;
  if(O&&!anchor.getClientRects().length){te();return}
  var panel=anchor.closest(".chrome-drawer-panel"),bounds=panel?panel.getBoundingClientRect():{left:0,top:0,width:r.innerWidth||360,height:r.innerHeight||600},rect=anchor.getBoundingClientRect();
  h.style.position=panel?"absolute":"fixed";h.style.maxWidth=Math.max(0,bounds.width-16)+"px";
  var width=h.offsetWidth||290,left=Math.max(8,Math.min(rect.left-bounds.left,bounds.width-width-8)),top=rect.bottom-bounds.top+8;
  h.style.left=left+"px";h.style.right="auto";h.style.top=top+"px";h.style.maxHeight=Math.max(80,bounds.height-top-8)+"px";h.style.overflowY="auto";
}function it(){
  at();if(!h)return;h.innerHTML=rt();var card=h.querySelector("[data-vilda-open-card]");
  if(card)card.addEventListener("click",function(event){event.stopPropagation();var anchor=Ch_statusAnchor;te();Cm_openMenuPatient(false,anchor||card)});
  h.hidden=false;le();if(typeof r.requestAnimationFrame==="function")r.requestAnimationFrame(function(){if(h&&!h.hidden)h.classList.add("is-visible")});else h.classList.add("is-visible");
  O=true;var carrier=o.getElementById("vildaPatientChip");if(carrier)carrier.setAttribute("aria-expanded","true");Ch_refreshSaveState();
  if(card)card.focus({preventScroll:true});else h.focus({preventScroll:true});
}function te(){
  if(!h)return;h.classList.remove("is-visible");O=false;var carrier=o.getElementById("vildaPatientChip");if(carrier)carrier.setAttribute("aria-expanded","false");Ch_refreshSaveState();
  setTimeout(function(){if(h&&!O)h.hidden=true},180);
}function _e(){O?te():it()}function _(){var e=o.getElementById("vildaUserChip");if(e){var t=o.getElementById("vildaUserValue"),a=o.getElementById("vildaUserAvatar"),n=o.getElementById("vildaUserAction");if(!(!t||!a||!n)){var s=r.VildaVault,i=r.VildaGuestMode===!0,d=s&&typeof s.getCurrentUser=="function"?s.getCurrentUser():null;if(!d&&!i&&!D&&$()){var c=!0;try{var u=r.VildaSession;u&&typeof u.hasSessionKey=="function"&&(c=!!u.hasSessionKey())}catch{}if(c){Ge();return}}(d||i)&&(D=!0),e.classList.remove("is-loading");var l;d&&!i?(e.classList.remove("is-guest"),e.classList.add("is-logged-in"),l=d.label||"U\u017Cytkownik",Q({accountLabel:l}),t.textContent=l,a.textContent=J(l),t.setAttribute("role","link"),t.setAttribute("tabindex","0"),t.setAttribute("title","Przejd\u017A do ustawie\u0144 konta"),a.removeAttribute("aria-hidden"),a.setAttribute("role","link"),a.setAttribute("tabindex","0"),a.setAttribute("aria-label",t.getAttribute("title")),n.title="Wyloguj si\u0119",n.setAttribute("aria-label","Wyloguj si\u0119"),n.innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>'):(e.classList.remove("is-logged-in"),e.classList.add("is-guest"),oe(),t.textContent=i?"Tryb go\u015Bcia":"Niezalogowany",t.removeAttribute("role"),t.removeAttribute("tabindex"),t.removeAttribute("title"),a.setAttribute("aria-hidden","true"),a.removeAttribute("role"),a.removeAttribute("tabindex"),a.removeAttribute("aria-label"),a.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="5"></circle><path d="M20 21a8 8 0 0 0-16 0"></path></svg>',n.title="Zaloguj si\u0119",n.setAttribute("aria-label","Zaloguj si\u0119"),n.innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line></svg>'),B(e),st(d,i,l);var v=!!(d&&!i);ot(v)}}}function ot(e){try{r.sessionStorage&&r.sessionStorage.setItem(be,e?"1":"0")}catch{}for(var t=o.querySelectorAll('[data-auth-only="true"]'),a=0;a<t.length;a++){var n=t[a];n.style.display=e?"":"none"}}function st(user,guest,label){
  var footers=o.querySelectorAll('.chrome-menu-footer');
  for(var index=0;index<footers.length;index++){
    var footer=footers[index],avatar=footer.querySelector('[data-vilda-chrome-drawer-avatar]'),value=footer.querySelector('[data-vilda-chrome-drawer-user-value]'),icon=footer.querySelector('[data-vilda-chrome-drawer-action-icon]'),action=footer.querySelector('[data-menu-logout]'),account=footer.querySelector('[data-menu-account]'),actionLabel=footer.querySelector('[data-vilda-chrome-drawer-action-label]');
    var logged=!!(user&&!guest),name=logged?String(label||user.label||'U\u017cytkownik'):guest?'Tryb go\u015bcia':'Niezalogowany',actionText=logged?'Wyloguj si\u0119':'Zaloguj si\u0119';
    if(logged&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(name))name='Moje konto';
    if(avatar){avatar.textContent=logged?J(name):'\u2022';avatar.classList.toggle('is-logged-in',logged);avatar.classList.toggle('is-guest',!logged)}
    if(value)value.textContent=name;if(action){action.setAttribute('aria-label',actionText);action.setAttribute('title',actionText)}if(actionLabel)actionLabel.textContent=actionText;
    if(account)account.setAttribute('aria-label',logged?'Konto \u2014 '+name:actionText);
    if(icon)icon.outerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" data-vilda-chrome-drawer-action-icon>'+ (logged?'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"></path>':'<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"></path>')+'</svg>';
  }
  Cm_refreshMenuPatient();Ch_refreshHeader();Cm_scheduleSidebarPosition();
}function Ae(){for(var e=["name","fullName","advName","basicGrowthName"],t="",a=0;a<e.length;a++){var n=o.getElementById(e[a]);if(n&&n.value&&(t=String(n.value).trim(),t))break}if(!t)return null;var s=o.getElementById("age"),i=o.getElementById("ageMonths"),d=o.getElementById("sex"),c=s&&s.value?parseInt(s.value,10):null,u=i&&i.value?parseInt(i.value,10):null,l=d&&d.value?String(d.value):"";return{name:t,age:isFinite(c)?c:null,ageMonths:isFinite(u)?u:null,sex:l||null}}function dt(e,t){return e==null&&!t?"":e!=null&&e>=1?t&&t>0?e+" l. "+t+" mies.":e+" l.":e===0&&t&&t>0?t+" mies.":e!=null?e+" l.":""}function R(){var e=Te(),t=r.VildaVault,a=t&&typeof t.isCloudOnlyMode=="function"&&typeof t.isUnlocked=="function"&&t.isUnlocked()&&!t.isCloudOnlyMode(),n=e&&!a,s=o.getElementById("vildaUserChip");if(s){var i=s.querySelector(".chrome-cloud-only-badge");i&&i.remove()}var d=o.getElementById("vildaSyncBtn");if(d){if(!n){d.removeAttribute("data-cloud-only"),d.removeAttribute("data-offline"),d.setAttribute("title","Synchronizacja mi\u0119dzy urz\u0105dzeniami"),d.setAttribute("aria-label","Status synchronizacji");return}var c=typeof navigator<"u"&&navigator&&navigator.onLine===!1;d.setAttribute("data-cloud-only","true"),c?(d.setAttribute("data-offline","true"),d.setAttribute("title","Tryb chmurowy + brak internetu. Zapisy nie trafi\u0105 do chmury, a ponowne zalogowanie nie powiedzie si\u0119 dop\xF3ki nie wr\xF3cisz online."),d.setAttribute("aria-label","Tryb chmurowy \u2014 offline")):(d.removeAttribute("data-offline"),d.setAttribute("title","Tryb chmurowy aktywny \u2014 dane pacjent\xF3w w chmurze. Otw\u00f3rz ustawienia synchronizacji."),d.setAttribute("aria-label","Tryb chmurowy aktywny"))}}var Ie=!1;function ct(){if(!Ie){Ie=!0;try{r.addEventListener&&r.addEventListener("online",R),r.addEventListener&&r.addEventListener("offline",R)}catch{}}}var T="idle",P=null;function lt(){return T}function H(){return T==="pulling"}function ut(){return new Promise(function(e,t){if(T==="complete"||T==="idle"){e("complete");return}if(T==="failed"){t(P||new Error("cloud-only sync failed"));return}function a(){s(),e("complete")}function n(i){s();var d=i&&i.detail,c=new Error(d&&d.message||"cloud-only sync failed");d&&d.code&&(c.code=d.code),t(c)}function s(){o.removeEventListener("vilda:cloud-only-sync-complete",a),o.removeEventListener("vilda:cloud-only-sync-failed",n)}o.addEventListener("vilda:cloud-only-sync-complete",a,{once:!0}),o.addEventListener("vilda:cloud-only-sync-failed",n,{once:!0})})}function ft(){if(o.getElementById("vildaCloudOnlyLoading"))return;if(!o.getElementById("vilda-cloud-only-loading-style")){var e=o.createElement("style");e.id="vilda-cloud-only-loading-style",e.textContent="@keyframes vilda-co-spin{to{transform:rotate(360deg)}}@keyframes vildaCoBannerIn{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}",(o.head||o.documentElement).appendChild(e)}var t=o.createElement("div");t.id="vildaCloudOnlyLoading",t.style.cssText='position:fixed;inset:0;z-index:2000005;display:none;align-items:center;justify-content:center;background:rgba(15,43,51,0.65);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);padding:16px;font-family:Inter,"Segoe UI",system-ui,-apple-system,sans-serif;',t.innerHTML='<div style="background:#fff;border-radius:18px;padding:28px 32px;max-width:400px;width:100%;text-align:center;box-shadow:0 18px 60px rgba(0,0,0,0.25);"><div id="vildaCloudOnlyLoadingSpinner" style="display:inline-block;width:44px;height:44px;border:4px solid #cfe8eb;border-top-color:#00838d;border-radius:50%;animation:vilda-co-spin 0.9s linear infinite;margin-bottom:16px;"></div><div id="vildaCloudOnlyLoadingTitle" style="font-weight:700;font-size:18px;color:#0f2b33;margin-bottom:6px;">Synchronizacja z chmur\u0105\u2026</div><div id="vildaCloudOnlyLoadingDesc" style="font-size:13.5px;color:#5b6672;line-height:1.5;"></div><div id="vildaCloudOnlyLoadingProgress" style="display:none;margin-top:14px;"><div style="background:#e8eff1;height:8px;border-radius:999px;overflow:hidden;margin-bottom:8px;"><div id="vildaCloudOnlyProgressBar" style="background:#00838d;height:100%;width:0%;border-radius:999px;transition:width 0.2s ease;"></div></div><div style="display:flex;justify-content:space-between;font-size:12.5px;color:#5b6672;"><span id="vildaCloudOnlyProgressCounter">Pobrano <strong style="color:#0f2b33;">0</strong> z 0</span><span id="vildaCloudOnlyProgressPercent"><strong style="color:#00838d;">0%</strong></span></div></div><div id="vildaCloudOnlyLoadingError" style="display:none;margin-top:14px;padding:10px 14px;background:#fef2f3;border:1px solid #f5b3bb;border-radius:10px;color:#9a213a;font-size:13px;text-align:left;line-height:1.45;"></div><div id="vildaCloudOnlyLoadingActions" style="display:none;margin-top:18px;gap:10px;justify-content:center;flex-wrap:wrap;"><button type="button" id="vildaCloudOnlyRetry" style="padding:8px 18px;border:1px solid #00838d;border-radius:10px;background:#00838d;color:#fff;font-weight:600;font-size:13px;cursor:pointer;">Spr\xF3buj ponownie</button><button type="button" id="vildaCloudOnlyLogout" style="padding:8px 18px;border:1px solid #d7e9ec;border-radius:10px;background:#fff;color:#5b6672;font-weight:600;font-size:13px;cursor:pointer;">Wyloguj si\u0119</button></div></div>',o.body.appendChild(t);function a(){t.querySelector("#vildaCloudOnlyLoadingSpinner").style.display="",t.querySelector("#vildaCloudOnlyLoadingTitle").textContent="Synchronizacja z chmur\u0105\u2026",t.querySelector("#vildaCloudOnlyLoadingDesc").textContent="",t.querySelector("#vildaCloudOnlyLoadingError").style.display="none",t.querySelector("#vildaCloudOnlyLoadingActions").style.display="none";var l=t.querySelector("#vildaCloudOnlyLoadingProgress");l&&(l.style.display="none");var v=t.querySelector("#vildaCloudOnlyProgressBar");v&&(v.style.width="0%"),t.style.display="flex"}function n(l){if(!(!l||typeof l!="object")){var v=typeof l.current=="number"&&l.current>=0?l.current:0,p=typeof l.total=="number"&&l.total>0?l.total:0,y=l.phase||"patients";if(!(p<=0)){if(y==="done"){var w=t.querySelector("#vildaCloudOnlyLoadingProgress");w&&(w.style.display="none");return}var x=Math.min(100,Math.max(0,Math.round(v/p*100))),k=t.querySelector("#vildaCloudOnlyLoadingProgress"),L=t.querySelector("#vildaCloudOnlyProgressBar"),f=t.querySelector("#vildaCloudOnlyProgressCounter"),m=t.querySelector("#vildaCloudOnlyProgressPercent");k&&(k.style.display="block"),L&&(L.style.width=x+"%"),f&&(f.innerHTML='Pobrano <strong style="color:#0f2b33;">'+v+"</strong> z "+p),m&&(m.innerHTML='<strong style="color:#00838d;">'+x+"%</strong>")}}}o.addEventListener("vilda:vault-merge-progress",function(l){try{n(l&&l.detail)}catch{}});function s(l){t.querySelector("#vildaCloudOnlyLoadingSpinner").style.display="none",t.querySelector("#vildaCloudOnlyLoadingTitle").textContent="Nie uda\u0142o si\u0119 pobra\u0107 danych";var v=t.querySelector("#vildaCloudOnlyLoadingDesc"),p=l&&l.code;p==="CLOUD_ONLY_NO_SYNC"?v.textContent="Tryb chmurowy wymaga aktywnej synchronizacji.":p==="CLOUD_ONLY_NO_API"?v.textContent="Modu\u0142 synchronizacji niedost\u0119pny \u2014 od\u015Bwie\u017C stron\u0119.":v.textContent="Sprawd\u017A po\u0142\u0105czenie z internetem i spr\xF3buj ponownie.";var y=t.querySelector("#vildaCloudOnlyLoadingError");y.textContent=l&&l.message||"Nieznany b\u0142\u0105d.",y.style.display="",t.querySelector("#vildaCloudOnlyLoadingActions").style.display="flex",t.style.display="flex"}function i(){t.style.display="none"}t.querySelector("#vildaCloudOnlyRetry").addEventListener("click",function(){var l=r.VildaSyncIntegration;!l||typeof l.forcePullForCloudOnly!="function"||(a(),l.forcePullForCloudOnly().then(function(){i()}).catch(function(v){s({code:v&&v.code,message:v&&v.message})}))}),t.querySelector("#vildaCloudOnlyLogout").addEventListener("click",function(){try{r.VildaVault&&typeof r.VildaVault.lock=="function"&&r.VildaVault.lock("user")}catch{}i()}),t._showLoading=a,t._showError=s,t._hide=i;var d=o.createElement("div");d.id="vildaCloudOnlySyncBanner",d.className="vilda-dol-kotwica",d.style.cssText='position:fixed;left:50%;transform:translateX(-50%);z-index:2000004;display:none;align-items:center;gap:10px;padding:10px 14px;background:#fff;border:1px solid #f5b3bb;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,0.18);font-family:Inter,"Segoe UI",system-ui,-apple-system,sans-serif;font-size:13px;color:#9a213a;max-width:480px;animation:vildaCoBannerIn 0.25s ease-out;',d.innerHTML='<span style="font-size:18px;line-height:1;">\u26A0\uFE0F</span><span id="vildaCloudOnlySyncBannerText" style="flex:1 1 auto;line-height:1.4;color:#0f2b33;">Sync z chmur\u0105 nie powi\xF3d\u0142 si\u0119.</span><button type="button" id="vildaCloudOnlySyncBannerRetry" style="padding:6px 12px;border:1px solid #00838d;border-radius:8px;background:#00838d;color:#fff;font-weight:600;font-size:12.5px;cursor:pointer;">Spr\xF3buj ponownie</button><button type="button" id="vildaCloudOnlySyncBannerDetails" style="padding:6px 12px;border:1px solid #d7e9ec;border-radius:8px;background:#fff;color:#5b6672;font-weight:500;font-size:12.5px;cursor:pointer;">Szczeg\xF3\u0142y</button><button type="button" id="vildaCloudOnlySyncBannerClose" aria-label="Zamknij" style="padding:4px 8px;border:0;background:transparent;color:#5b6672;font-size:18px;line-height:1;cursor:pointer;">\xD7</button>',o.body.appendChild(d);function c(l){var v=l&&l.message||"Sync z chmur\u0105 nie powi\xF3d\u0142 si\u0119.";d.querySelector("#vildaCloudOnlySyncBannerText").textContent=v,d.style.display="flex"}function u(){d.style.display="none"}d.querySelector("#vildaCloudOnlySyncBannerRetry").addEventListener("click",function(){var l=r.VildaSyncIntegration;!l||typeof l.forcePullForCloudOnly!="function"||(u(),l.forcePullForCloudOnly().catch(function(){}))}),d.querySelector("#vildaCloudOnlySyncBannerDetails").addEventListener("click",function(){u(),s(P||{})}),d.querySelector("#vildaCloudOnlySyncBannerClose").addEventListener("click",u),o.addEventListener("vilda:cloud-only-sync-pulling",function(){T="pulling",P=null,u()}),o.addEventListener("vilda:cloud-only-sync-complete",function(){T="complete",P=null,u(),i(),E()}),o.addEventListener("vilda:cloud-only-sync-failed",function(l){T="failed",P=l&&l.detail||{},t.style.display==="flex"?s(P):c(P),E()})}function Cm_patientChipRefresh(){var e=o.getElementById("vildaPatientChip");if(e){var t=o.getElementById("vildaPatientValue");if(t){var a=e.querySelector(".chip-label");a&&(a.style.display=r.VildaGuestMode===!0?"none":"");var n=o.querySelector("[data-vilda-chrome-drawer-patient-value]"),s=r.VildaSession,i=s&&typeof s.getPatient=="function"?s.getPatient():Ae();if(!i||!i.name){Q({hasPatient:!1}),e.classList.add("is-empty"),e.classList.remove("has-patient");var d=e.querySelector(".chip-icon");d&&(d.innerHTML=Se),t.textContent="Brak",n&&(n.textContent="\u2014"),X="";return}Q({hasPatient:!0}),e.classList.remove("is-empty"),e.classList.add("has-patient");var c=e.querySelector(".chip-icon");c&&(c.textContent=J(i.name));var u=dt(i.age,i.ageMonths),l=i.sex==="M"?"\u2642":i.sex==="F"?"\u2640":"",v=[];v.push(i.name),u&&v.push(u),l&&v.push(l);var p=v.join(" \xB7 ");t.textContent=i.name,n&&(n.textContent=p),X=v.join("|")}}}
function C(){try{Cm_patientChipRefresh()}finally{Cm_refreshMenuPatient();Cm_scheduleSidebarPosition()}}var Be=null,vt="vilda-sync-enabled-v1";function Oe(){var e=o.getElementById("vildaSyncBtn");if(e){var t=!1;try{t=!!(r.localStorage&&r.localStorage.getItem(vt)==="true")}catch{}t?e.classList.add("is-enabled"):(e.classList.remove("is-enabled"),e.removeAttribute("data-sync-state"))}}function pt(){o.addEventListener("vilda:sync-stale-device",function(e){try{var t=o.getElementById("vildaSyncBtn");if(t){var a=e&&e.detail;a&&a.warn===!0?(t.classList.add("is-enabled"),t.setAttribute("data-sync-state","stale"),t.setAttribute("title","To urz\u0105dzenie nie synchronizowa\u0142o si\u0119 ponad rok \u2014 otw\u00F3rz ustawienia synchronizacji i sprawd\u017A, czy nie wr\u00F3ci\u0142y usuni\u0119te wpisy.")):t.getAttribute("data-sync-state")==="stale"&&t.removeAttribute("data-sync-state")}}catch{}}),o.addEventListener("vilda:sync-status-changed",function(e){var t=o.getElementById("vildaSyncBtn");if(t){var a=e&&e.detail||{},n=a.state||"idle";if(n==="disabled"){t.classList.remove("is-enabled"),t.removeAttribute("data-sync-state");return}t.classList.add("is-enabled"),n==="error"?(clearTimeout(Be),t.setAttribute("data-sync-state","error")):n==="ok"&&(clearTimeout(Be),t.getAttribute("data-sync-state")!=="stale"&&t.removeAttribute("data-sync-state"))}}),Oe()}var yt="vilda-sync-enabled-v1",ht="vilda-cloud-only-session-v1";function mt(){try{return r.localStorage&&r.localStorage.getItem(yt)==="true"}catch{return!1}}function Te(){try{return!!(r.sessionStorage&&r.sessionStorage.getItem(ht))}catch{return!1}}function gt(){try{return typeof navigator<"u"&&navigator&&navigator.onLine===!1}catch{return!1}}function wt(){var e=mt(),t=Te(),a=t&&gt(),n="chrome-sync-btn";e&&(n+=" is-enabled");var s=' class="'+n+'" id="vildaSyncBtn"';t&&(s+=' data-cloud-only="true"'),a&&(s+=' data-offline="true"');var i,d;return t&&a?(i="Tryb chmurowy + brak internetu. Zapisy nie trafi\u0105 do chmury, a ponowne zalogowanie nie powiedzie si\u0119 dop\xF3ki nie wr\xF3cisz online.",d="Tryb chmurowy \u2014 offline"):t?(i="Tryb chmurowy aktywny \u2014 dane pacjent\xF3w w chmurze. Otw\u00f3rz ustawienia synchronizacji.",d="Tryb chmurowy aktywny"):(i="Synchronizacja mi\u0119dzy urz\u0105dzeniami",d="Status synchronizacji"),s+=' title="'+i+'" aria-label="'+d+'"','    <a href="ustawienia.html#settings-section-sync"'+s+'><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>    </a>'}var ze=null,ue="vilda-reminders-count-v1";function fe(){var e=new Date;return e.getFullYear()+"-"+String(e.getMonth()+1).padStart(2,"0")+"-"+String(e.getDate()).padStart(2,"0")}function St(){try{var e=r.sessionStorage&&r.sessionStorage.getItem(ue);if(!e)return null;var t=JSON.parse(e);return!t||typeof t.count!="number"||t.count<0||t.dayKey&&t.dayKey!==fe()?null:t}catch{return null}}function ve(e,t){try{if(!r.sessionStorage)return;r.sessionStorage.setItem(ue,JSON.stringify({count:e,state:t,dayKey:fe(),updatedAtISO:new Date().toISOString()}))}catch{}}function bt(){var e=St(),t=!1;try{t=typeof H=="function"&&H()}catch{}var a,n,s,i;return t?(a="loading",n=e&&e.count||0,s="",i="Wczytywanie przypomnie\u0144\u2026"):e&&e.count>0?(a=e.state||"today",n=e.count,s=n>9?"9+":String(n),i="Przypomnienia"):(a="empty",n=0,s="",i="Brak przypomnie\u0144"),'    <button type="button" class="chrome-reminders-btn" id="vildaRemindersBtn" data-count="'+n+'" data-state="'+a+'" title="Otw\u00f3rz przypomnienia" aria-label="'+i+'"><span class="chrome-reminders-inner"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg></span><span class="chrome-reminders-badge" id="vildaRemindersBadge" aria-hidden="true">'+s+"</span>    </button>"}function E() { RemBadgeSequence += 1; clearTimeout(ze); ze = setTimeout(function () { kt().catch(function () {}); }, 250); }var RemBadgeSequence = 0;
async function kt(){var RemRequest=++RemBadgeSequence;var e=o.getElementById("vildaRemindersBtn");if(e){var t=o.getElementById("vildaRemindersBadge");if(t){var a=r.VildaVault;if(!a||typeof a.isUnlocked!="function"||!a.isUnlocked()){e.hidden=!0,e.setAttribute("data-count","0"),e.setAttribute("data-state","empty"),e.setAttribute("aria-label","Brak przypomnie\u0144"),e.setAttribute("title","Otw\u00f3rz przypomnienia"),ve(0,"empty");return}if(typeof a.listPatientNotesDueByDate!="function"){e.hidden=!0;return}var n=!1;try{n=typeof H=="function"&&H()}catch{}if(n){e.hidden=!1,e.setAttribute("data-count","0"),e.setAttribute("data-state","loading"),e.setAttribute("title","Otw\u00f3rz przypomnienia"),e.setAttribute("aria-label","Wczytywanie przypomnie\u0144\u2026"),t.textContent="";return}var RemUser=typeof a.getCurrentUser==="function"?a.getCurrentUser():null,RemOwner=RemUser&&RemUser.userId||null;
function RemCurrent(){try{var user=typeof a.getCurrentUser==="function"?a.getCurrentUser():null;return RemRequest===RemBadgeSequence&&a===r.VildaVault&&a.isUnlocked()&&(user&&user.userId||null)===RemOwner}catch{return false}}
var s;try{s=await a.listPatientNotesDueByDate()}catch(error){if(RemCurrent()){e.hidden=false;e.setAttribute("data-state","error");e.setAttribute("aria-label","Nie uda\u0142o si\u0119 wczyta\u0107 przypomnie\u0144. Kliknij, aby spr\u00f3bowa\u0107 ponownie.");e.setAttribute("title","Otw\u00f3rz przypomnienia");t.textContent="?"}return}if(!RemCurrent())return;try{_t(s)}catch{}for(var d=0,c=!1,u=(function(){var L=new Date;return L.getFullYear()+"-"+String(L.getMonth()+1).padStart(2,"0")+"-"+String(L.getDate()).padStart(2,"0")})(),l=0;l<s.length;l++){var v=s[l].notes||[];d+=v.length;for(var p=0;p<v.length;p++){var y=v[p].dueDateISO||"";if(y&&y.substring(0,10)<u){c=!0;break}}}if(d===0){e.hidden=!1,e.setAttribute("data-count","0"),e.setAttribute("data-state","empty"),e.setAttribute("aria-label","Brak przypomnie\u0144"),e.setAttribute("title","Otw\u00f3rz przypomnienia"),t.textContent="",ve(0,"empty");return}e.hidden=!1;var w=c?"overdue":"today";e.setAttribute("data-count",String(d)),e.setAttribute("data-state",w),t.textContent=d>9?"9+":String(d),ve(d,w);var k=d+" "+Nq(d)+" do sprawdzenia";e.setAttribute("aria-label",k),e.setAttribute("title","Otw\u00f3rz przypomnienia")}}}function Nq(P){if(P===1)return "przypomnienie";var Q=P%10,Z=P%100;return Q>=2&&Q<=4&&(Z<10||Z>=20)?"przypomnienia":"przypomnie\u0144"}function xt(){var e=o.getElementById("vildaRemindersBtn");e&&e.addEventListener("click",function(t){t&&typeof t.preventDefault==="function"&&t.preventDefault();try{E();var a=r.VildaAuthUI;a&&typeof a.maybeShowReminders==="function"&&a.maybeShowReminders({force:!0}).catch(function(){})}catch{}})}var Pe=!1,Me=null;function pe(){try{clearTimeout(Me)}catch{}var e=new Date,t=new Date(e.getFullYear(),e.getMonth(),e.getDate()+1,0,0,5,0),a=Math.max(1e3,t.getTime()-e.getTime());Me=setTimeout(function(){E(),pe()},a)}function je(){var e=null;try{var t=r.sessionStorage&&r.sessionStorage.getItem(ue);e=t?JSON.parse(t):null}catch{e=null}(!e||e.dayKey!==fe())&&E()}function Et(){if(!Pe){Pe=!0,pe();try{o.addEventListener("visibilitychange",function(){o.visibilityState==="visible"&&(je(),De(),pe())})}catch{}try{r.addEventListener("pageshow",function(){je(),De()})}catch{}}}var Ve=null,ne=0,Lt={duty:1,clinic:1,"clinic-nfz":1};function Ct(){var e={type:"note-changed",ts:Date.now(),sender:"reminders-expiry",action:"recount"};try{if(typeof r.BroadcastChannel=="function"){var t=new r.BroadcastChannel("vilda-notes");t.postMessage(e);try{t.close()}catch{}}}catch{}try{r.localStorage&&r.localStorage.setItem("vilda-note-changed-ping-v1",JSON.stringify(e))}catch{}}function _t(e){try{clearTimeout(Ve)}catch{}if(ne=0,!(!e||!e.length)){for(var t=new Date,a=t.getFullYear(),n=t.getMonth(),s=t.getDate(),i=a+"-"+String(n+1).padStart(2,"0")+"-"+String(s).padStart(2,"0"),d=t.getTime(),c=0,u=0;u<e.length;u++)for(var l=e[u].notes||[],v=0;v<l.length;v++){var p=l[v];if(!(!p||!p.dueTime||!Lt[p.category])&&String(p.dueDateISO||"").slice(0,10)===i){var y=String(p.dueTime).split(":"),w=+y[0]*60+ +y[1]+(p.durationMin>0?p.durationMin:0),x=new Date(a,n,s,0,0,0,0);x.setMinutes(w);var k=x.getTime();k>d&&(c===0||k<c)&&(c=k)}}if(c!==0){ne=c;var L=Math.min(6*3600*1e3,Math.max(1e3,c-d+2e3));Ve=setTimeout(function(){E(),Ct()},L)}}}function De(){ne&&Date.now()>=ne&&E()}function At(){var e=!1;function t(){if(e)return!0;var i=r.VildaVault;if(!i)return!1;e=!0,typeof i.onUnlock=="function"&&(i.onUnlock(_),i.onUnlock(R),i.onUnlock(function(){E()})),typeof i.onLock=="function"&&(i.onLock(function(){D=!0,oe(),_()}),i.onLock(R),i.onLock(E)),typeof i.onPatientSaved=="function"&&i.onPatientSaved(C),typeof i.onPatientNoteChanged=="function"&&i.onPatientNoteChanged(E),xt(),_(),R(),E();try{ft()}catch{}try{ct()}catch{}return!0}o.addEventListener("vilda:guest-mode-changed",_),o.addEventListener("vilda:sync-merged",E);try{if(typeof r.BroadcastChannel=="function"){var a=new r.BroadcastChannel("vilda-notes");a.onmessage=function(i){i&&i.data&&i.data.type==="note-changed"&&E()}}}catch{}if(r.addEventListener("storage",function(i){i&&i.key==="vilda-note-changed-ping-v1"&&i.newValue&&E()}),o.addEventListener("vilda:auth-state-settled",function(){D=!0,_()}),o.addEventListener("vilda:auth-loaded",function(){t(),_();try{r.VildaAuthUI&&typeof r.VildaAuthUI.updateProBadge=="function"&&r.VildaAuthUI.updateProBadge()}catch{}}),o.addEventListener("vilda:session-changed",function(){_(),C()}),r.addEventListener("storage",function(i){if(i&&i.key==="sharedUserData")try{C()}catch{}}),Et(),!t())var n=0,s=setInterval(function(){(t()||++n>=100)&&clearInterval(s)},100)}function It(){if(!Z){Z=!0;var e=["name","age","ageMonths","sex","fullName","advName","basicGrowthName"];e.forEach(function(t){var a=o.getElementById(t);a&&(a.addEventListener("input",C),a.addEventListener("change",C))}),C(),setTimeout(C,300),setTimeout(C,1500),typeof r.setInterval=="function"&&r.setInterval(function(){var t=Ae(),a=t?[t.name,t.age,t.ageMonths,t.sex].join("|"):"";a!==X&&C()},1500)}}var M=null;
/* A drawer tooltip uses the same safe viewport as its panel. Geometry stays
   live while it is shown, including rotation with a disabled action focused. */
function Cm_positionTip(tip,trigger,drawer){
  var rect=trigger.getBoundingClientRect(),width=tip.offsetWidth||220,height=tip.offsetHeight||40;
  var left=rect.right+8,top=rect.top+(rect.height-height)/2;
  var minLeft=8,maxRight=r.innerWidth-8,minTop=4,maxBottom=r.innerHeight-4,phone=false;
  try{
    var style=r.getComputedStyle(o.documentElement);
    var safeTop=parseFloat(style.getPropertyValue("--vilda-safe-top"));
    if(isFinite(safeTop)&&safeTop>0)minTop+=safeTop;
    phone=!!(drawer&&o.documentElement.classList.contains("vilda-phone"));
    if(phone){
      var safeLeft=parseFloat(style.getPropertyValue("--vilda-safe-left"));
      var safeRight=parseFloat(style.getPropertyValue("--vilda-safe-right"));
      var safeBottom=parseFloat(style.getPropertyValue("--vilda-safe-bottom"));
      if(isFinite(safeLeft)&&safeLeft>0)minLeft+=safeLeft;
      if(isFinite(safeRight)&&safeRight>0)maxRight-=safeRight;
      if(isFinite(safeBottom)&&safeBottom>0)maxBottom-=safeBottom;
    }
  }catch{}
  if(left+width>maxRight)left=rect.left-width-8;
  if(phone)left=Math.max(minLeft,Math.min(left,maxRight-width));
  if(top<minTop)top=minTop;
  if(top+height>maxBottom)top=maxBottom-height;
  if(phone)top=Math.max(minTop,top);
  tip.style.left=Math.round(left)+"px";
  tip.style.top=Math.round(top)+"px";
}
function F(e,t){
  var menu=Cm_drawer&&Cm_drawer.element.contains(e)?Cm_drawer.element:null;
  if(!menu&&typeof r.showTooltip==="function")try{r.showTooltip(e,t);return}catch{}
  try{
    if(M){
      var previous=M;
      if(typeof previous.__vildaTipCleanup==="function")previous.__vildaTipCleanup();
      previous.classList.remove("vilda-tip--in");
      r.setTimeout(function(){previous.parentNode&&previous.remove()},200);
      M=null;
    }
    var tip=o.createElement("div");
    tip.className="vilda-tip";tip.textContent=t;tip.setAttribute("role","status");tip.setAttribute("aria-live","polite");
    (menu||o.body).appendChild(tip);M=tip;
    var reposition=function(){if(M===tip)Cm_positionTip(tip,e,menu)};
    reposition();
    r.requestAnimationFrame(function(){if(M===tip)tip.classList.add("vilda-tip--in")});
    var dismiss=function(){
      tip.__vildaTipCleanup();
      if(M===tip){
        tip.classList.remove("vilda-tip--in");
        r.setTimeout(function(){tip.parentNode&&tip.remove();if(M===tip)M=null},200);
      }
    };
    tip.__vildaTipCleanup=function(){
      o.removeEventListener("click",dismiss,true);
      if(menu){r.removeEventListener("resize",reposition);menu.removeEventListener("scroll",reposition,true)}
    };
    if(menu){r.addEventListener("resize",reposition);menu.addEventListener("scroll",reposition,true)}
    r.setTimeout(dismiss,3000);
    r.setTimeout(function(){if(M===tip)o.addEventListener("click",dismiss,true)},0);
    return;
  }catch{}
  if(typeof r.alert==="function")r.alert(t);
}
/* P-DOKUMENTY-PACJENTA: one menu action; availability belongs to the documents module.
   The app shell owns forwarding; standalone pages open the same controller directly. */
function Cm_documentsState(){
  var api=r.VildaPatientDocuments;
  if(api&&typeof api.getState==="function")try{return api.getState()}catch{}
  var file=ge();
  return {disabled:true,busy:false,reason:file==="index.html"||file==="docpro.html"?
    "Trwa przygotowywanie dokument\u00f3w pacjenta.":"Dokumenty pacjenta s\u0105 dost\u0119pne na stronie Start i DocPro."};
}
function Cm_documentsRefresh(){
  var button=o.getElementById("patientDocumentsBtnSidebar");
  if(!button)return;
  if(button._cfBound){Qdm(o.querySelector("[data-vilda-chrome-drawer]"));return}
  var state=Cm_documentsState(),disabled=!!(state.disabled||state.busy);
  if(disabled)button.setAttribute("aria-disabled","true");else button.removeAttribute("aria-disabled");
  if(state.busy)button.setAttribute("aria-busy","true");else button.removeAttribute("aria-busy");
  if(disabled&&state.reason){button.setAttribute("data-tip",state.reason);button.setAttribute("title",state.reason)}
  else{button.removeAttribute("data-tip");button.removeAttribute("title")}
  Qdm(o.querySelector("[data-vilda-chrome-drawer]"));
}
function Cm_documentsBind(){
  var button=o.getElementById("patientDocumentsBtnSidebar");
  if(!button||button._vildaDocumentsBound)return;
  button._vildaDocumentsBound=true;
  button.addEventListener("click",function(event){
    event.preventDefault();if(button._cfBound)return;
    Cm_documentsRefresh();
    var opener=button._vildaDocumentsOpener||button,state=Cm_documentsState(),api=r.VildaPatientDocuments;
    if(state.disabled||state.busy||!api||typeof api.open!=="function"){
      F(opener,state.reason||"Dokumenty pacjenta s\u0105 teraz niedost\u0119pne.");return;
    }
    try{Promise.resolve(api.open({opener:opener})).catch(function(){
      F(opener,"Nie uda\u0142o si\u0119 otworzy\u0107 dokument\u00f3w pacjenta. Spr\u00f3buj ponownie.");
    }).finally(Cm_documentsRefresh)}catch{F(opener,"Nie uda\u0142o si\u0119 otworzy\u0107 dokument\u00f3w pacjenta. Spr\u00f3buj ponownie.")}
  });
  o.addEventListener("vilda:patient-documents-state",Cm_documentsRefresh);
  Cm_documentsRefresh();
}
function Bt(){var e=o.getElementById("saveDataBtnSidebar");e&&e.addEventListener("click",function(n){if(n.preventDefault(),!e._cfBound){var s=r.VildaVault,i=!!(s&&typeof s.isUnlocked=="function"&&s.isUnlocked());F(e,i?"Zapisywanie danych jest dost\u0119pne na stronie g\u0142\xF3wnej pacjenta.":"Zapisywanie danych jest zarezerwowane dla zalogowanych u\u017Cytkownik\xF3w.")}});/* P-NOTATKI-2 (G20, decyzja wlasciciela D11): custom-fixes.js (bramka notatki) jest wpiety tylko
   na stronach z formularzem pacjenta. Na terminarzu, w ustawieniach czy w modulach wisial tam tekst
   o polach, ktorych na tej stronie nie ma. Pozycja menu zostaje, ale mowi, gdzie z niej skorzystac. */
function Qvn(){var e=r.VildaSession&&r.VildaSession.TOOLTIPS&&r.VildaSession.TOOLTIPS.visitNote||{};return o.getElementById("age")||o.getElementById("ageMonths")?e.noPatient||'Aby doda\u0107 notatk\u0119 do wizyty, najpierw wczytaj pacjenta z listy \u201EPacjenci\u201D lub zapisz nowego pacjenta (\u201EZapisz dane\u201D).':e.notOnThisPage||"Dodawanie notatki do wizyty jest dost\u0119pne na stronie Start i DocPro."}
var t=o.getElementById("addVisitNoteBtnSidebar");if(t&&!t._cfBound)try{t.setAttribute("aria-disabled","true"),t.setAttribute("data-tip",Qvn())}catch{}t&&t.addEventListener("click",function(n){if(n.preventDefault(),!t._cfBound){F(t,t.getAttribute("data-tip")||Qvn())}});var a=o.getElementById("patientsListBtnSidebar");a&&a.addEventListener("click",function(n){if(n.preventDefault(),a._cfBound)return;var s=r.VildaVault;if(!(s&&typeof s.isUnlocked=="function"&&s.isUnlocked())){F(a,"Zaloguj si\u0119, aby przegl\u0105da\u0107 baz\u0119 pacjent\xF3w.");return}function i(){var c=r.VildaAuthUI;if(!c||typeof c.showPatientsList!="function"){F(a,"Modu\u0142 pacjent\xF3w niedost\u0119pny \u2014 od\u015Bwie\u017C stron\u0119.");return}var u=typeof r.applyLoadedData=="function";c.showPatientsList(function(l,v){if(u){if(l)try{r.applyLoadedData(l)}catch{}var p=r.VildaChrome;p&&typeof p.refreshPatientChip=="function"&&p.refreshPatientChip()}else{if(v)try{r.sessionStorage.setItem("vilda:pendingPatientLoad",String(v))}catch{}try{r.location.assign("index.html")}catch{}}})}var d=r.VildaShell;if(d&&typeof d.openPatientsInStart=="function"){d.openPatientsInStart(i);return}i()})}
/* P-NOTATKI-3 (G32): pozycje menu bocznego to <a href="#" role="button">. Enter dziala natywnie
   (aktywacja odnosnika), ale spacja tylko przewija strone - a dla role=button klawiatura i czytnik
   ekranu oczekuja OBU klawiszy. Skladamy wiec spacje w click(), tym samym wzorcem, co chip pacjenta.
   Enter celowo zostaje natywny: dolozony tutaj dalby dwa klikniecia na jedno nacisniecie.
   Drugi brak: powod wylaczenia pozycji bylo widac dopiero PO kliknieciu. Teraz dymek odzywa sie takze
   przy najechaniu i przy fokusie - z tego samego tekstu, co klik, zadnych nowych napisow.
   Dla "Zapisz dane" na stronach bez bramki (custom-fixes.js jest tylko na Start i DocPro) statyczny
   data-tip z menu mowi o polach, ktorych tam nie ma - liczymy wiec ten sam tekst, co handler kliku. */
function Qg32t(k){if(!k)return"";var d=k.id||"";if(!k._cfBound){if(d==="saveDataBtnSidebar"){var v=r.VildaVault,u=!!(v&&typeof v.isUnlocked=="function"&&v.isUnlocked());return u?"Zapisywanie danych jest dost\u0119pne na stronie g\u0142\xF3wnej pacjenta.":"Zapisywanie danych jest zarezerwowane dla zalogowanych u\u017Cytkownik\xF3w."}if(d==="addVisitNoteBtnSidebar")return Qvn()}return k.getAttribute("data-tip")||""}
function Qg32h(k){if(k.getAttribute("aria-disabled")!=="true"&&!k.hasAttribute("disabled"))return;var q=Qg32t(k);q&&F(k,q)}
try{["saveDataBtnSidebar","addVisitNoteBtnSidebar","patientDocumentsBtnSidebar","patientsListBtnSidebar"].forEach(function(id){var k=o.getElementById(id);if(!k||k._g32||k.getAttribute("role")!=="button")return;k._g32=!0;k.addEventListener("keydown",function(n){n.repeat||(n.key!==" "&&n.key!=="Spacebar"||(n.preventDefault(),k.click()))});k.addEventListener("mouseenter",function(){Qg32h(k)});k.addEventListener("focus",function(){Qg32h(k)})})}catch{}/* P-SWIEZE-WCZYTANIE (2026-10-05): zamiar wczytania pacjenta z innej strony (vilda:pendingPatientLoad) wykonujemy dopiero po zakonczeniu DOMContentLoaded. Wczesniej (wolne pobranie app.js, vilda:auth-hidden przed DCL) pacjent trafial do formularza, zanim strona zarejestrowala sluchacze vilda:patient-loaded i zanim inicjalizacja przy DCL odtworzyla identyfikator pacjenta z sessionStorage - formularz pokazywal nowego pacjenta, a identyfikator zostawal po poprzednim. Proby przed DCL nie zuzywaja limitu ponowien. Rejestr: docs/clinical/ALGORITHMS.md, P-SWIEZE-WCZYTANIE. */function Gv_dclDone(){try{var e=r.performance&&typeof r.performance.getEntriesByType=="function"?r.performance.getEntriesByType("navigation")[0]:null;if(e&&typeof e.domContentLoadedEventEnd=="number")return e.domContentLoadedEventEnd>0}catch{}try{return!o||o.readyState==="complete"}catch{return!0}}var re=!1;function Ot(){if(re)return!0;if(!Gv_dclDone())return!1;var e=null;try{e=r.sessionStorage}catch{}if(!e)return re=!0,!0;var t=null;try{t=e.getItem("vilda:pendingPatientLoad")}catch{}if(!t)return re=!0,!0;if(typeof r.applyLoadedData!="function")return!1;var a=r.VildaVault;if(!a||typeof a.isUnlocked!="function"||!a.isUnlocked()||typeof a.getPatient!="function")return!1;try{e.removeItem("vilda:pendingPatientLoad")}catch{}return re=!0,a.getPatient(t).then(function(n){var s=n&&Array.isArray(n.snapshots)&&n.snapshots.length?n.snapshots[0]:null;if(!(!s||!s.payload)){try{r.applyLoadedData(s.payload)}catch{}try{typeof r.CustomEvent=="function"&&o&&o.dispatchEvent(new r.CustomEvent("vilda:patient-loaded",{detail:{patientId:t,savedAtISO:s.savedAtISO||null,snapshotCount:n&&n.snapshotCount||n.snapshots.length||null,name:s.payload&&s.payload.name||null,source:"pick"}}))}catch{}var i=r.VildaChrome;i&&typeof i.refreshPatientChip=="function"&&i.refreshPatientChip();try{var d=e.getItem("vilda:postLoadScroll");d==="advancedGrowth"&&(e.removeItem("vilda:postLoadScroll"),setTimeout(function(){var c=o.getElementById("toggleAdvancedGrowth"),u=o.getElementById("advancedGrowthSection");if(u){var l="";try{l=u.style&&u.style.display||""}catch{}if((l===""||l==="none")&&c)try{c.click()}catch{}try{u.scrollIntoView({behavior:"smooth",block:"start"})}catch{}}},300))}catch{}}}).catch(function(){}),!0}var Ne=0;function ae(){Ot()||(Gv_dclDone()&&Ne++,Ne<48&&r.setTimeout(ae,250))}o&&(o.addEventListener("vilda:auth-hidden",function(){ae()}),o.readyState==="loading"?o.addEventListener("DOMContentLoaded",function(){r.setTimeout(ae,200)},{once:!0}):r.setTimeout(ae,200));function Tt(){if(o.documentElement.classList.contains("vilda-embedded")||o.getElementById("consent-banner"))return;var e=o.createElement("div");e.id="consent-banner",e.className="cookie-banner",e.innerHTML='<p><strong>Vilda Clinic</strong> korzysta z Google Analytics (GA4) do tworzenia anonimowych statystyk odwiedzin. Adres IP jest anonimizowany. Zgoda jest dobrowolna i mo\u017Cesz j\u0105 wycofa\u0107 w dowolnym momencie w <a href="ustawienia.html">Ustawieniach</a>. Wi\u0119cej informacji w <a href="polityka-prywatnosci.html">Polityce prywatno\u015Bci</a>.</p><div class="cookie-buttons"><button id="consent-accept">Akceptuj\u0119 analityk\u0119</button><button id="consent-decline">Nie zgadzam si\u0119</button></div>',o.body.appendChild(e);function t(){try{var c=r.VildaPersistence;return c&&typeof c.readPreferenceRaw=="function"?c.readPreferenceRaw("ANALYTICS_CONSENT",null):null}catch{return null}}function a(c){try{var u=r.VildaPersistence;u&&typeof u.writePreferenceRaw=="function"&&u.writePreferenceRaw("ANALYTICS_CONSENT",c,{force:!0})}catch{}}function n(){r.dataLayer=r.dataLayer||[];function c(){r.dataLayer.push(arguments)}c("consent","update",{analytics_storage:"granted"});var u=o.createElement("script");u.src="https://www.googletagmanager.com/gtag/js?id=G-EZZTNV8W07",u.async=!0,o.head.appendChild(u),c("js",new Date);var l=!!o.getElementById("appPanes");if(c("config","G-EZZTNV8W07",l?{anonymize_ip:!0,send_page_view:!1}:{anonymize_ip:!0}),l)try{r.__vildaGaReady=!0,r.dispatchEvent(new CustomEvent("vilda:ga-ready"))}catch{}}function s(){r.dataLayer=r.dataLayer||[];function c(){r.dataLayer.push(arguments)}c("consent","update",{analytics_storage:"denied"})}function i(c){function u(){var l=r.requestIdleCallback||function(v){return setTimeout(v,1)};try{l(c,{timeout:3e3})}catch{setTimeout(c,1)}}o.readyState==="complete"?u():r.addEventListener("load",u,{once:!0})}var d=t();d?d==="granted"?i(n):s():e.style.display="block",o.getElementById("consent-accept").addEventListener("click",function(){a("granted"),e.style.display="none",n()}),o.getElementById("consent-decline").addEventListener("click",function(){a("denied"),e.style.display="none",s()})}var qe={"index.html":"start","terminarz.html":"terminarz","przelicznik-jednostek.html":"lab","kalkulator-klirens.html":"klirens","docpro.html":"docpro"};function zt(){try{return r.localStorage.getItem("vilda-spa-shell-v1")!=="off"}catch{return!0}}function Ue(e){var t=String(e||"").replace(/[?#].*$/,"").replace(/^.*\//,"");return Object.prototype.hasOwnProperty.call(qe,t)?qe[t]:null}function Pt(e){try{
  if(o.getElementById("appPanes"))return;
  var t=e.target,a=t&&t.closest?t.closest("a[href]"):null;
  if(!a||!Cm_plainClick(e,a))return;
  var drawer=a.closest("[data-vilda-chrome-drawer]"),n=a.getAttribute("href")||"";
  if(o.documentElement.classList.contains("vilda-embedded")){
    if(!n||/^(#|javascript:|mailto:|tel:|https?:\/\/)/i.test(n)||!/\.html(\?|#|$)/i.test(n))return;
    try{var s=new r.URL(n,o.location.href);if(s.hash&&s.pathname===o.location.pathname)return}catch{}
    var host=Cm_shell();if(!host)return;
    var d=typeof host.shell.keyForHref==="function"?host.shell.keyForHref(n):Ue(n);
    e.preventDefault();e.stopPropagation();
    var opened=drawer?Cm_closeDrawer({reason:"navigation"}):false;
    if(d){var same=false;try{same=String(host.win.location.hash||"")==="#/"+d}catch{}
      host.shell.navigate(d,!same,n,null,{focusPane:!!opened});
    }else try{r.top.location.href=n}catch{r.location.href=n}
    return;
  }
  var u=a.closest(".sidebar-nav, .chrome-drawer-nav, .chrome-menu-footer");if(!u)return;
  var l=Ue(n);if(!l)return;
  if(drawer)Cm_closeDrawer({reason:"navigation"});
  if(!zt())return;
  e.preventDefault();r.location.href="app.html#/"+l;
}catch{}}
function Mt(){try{o.addEventListener("click",Pt,!0)}catch{}}function jt(){try{let s=function(){try{var c=r.VildaPersistence;if(c&&typeof c.getTabId=="function")return c.getTabId()}catch{}try{return r.sessionStorage.getItem("vildaTabIdV1")||""}catch{return""}},i=function(){return o.getElementById("clearAllDataBtn")||o.getElementById("clearBtn")},d=function(c){try{if(!c||c.type!=="clear-all"||c.sender&&c.sender===a||!c.tabId||c.tabId!==s())return;var u=i();if(!u)return;n=!0;try{u.click()}finally{n=!1}}catch{}};if(!o.documentElement.classList.contains("vilda-embedded"))return;var e;try{e=new r.BroadcastChannel("vilda-shell-clear")}catch{e=null}var t="vilda-shell-clear-ping-v1",a=String(Date.now())+"-"+Math.random().toString(36).slice(2),n=!1;o.addEventListener("click",function(c){try{if(n)return;var u=c.target,l=u&&u.closest?u.closest("#clearAllDataBtn, #clearBtn"):null;if(!l)return;var v={type:"clear-all",sender:a,tabId:s(),ts:Date.now()};if(e)try{e.postMessage(v)}catch{}try{r.localStorage.setItem(t,JSON.stringify(v))}catch{}}catch{}},!1),e&&e.addEventListener("message",function(c){d(c&&c.data)}),r.addEventListener("storage",function(c){if(!(!c||c.key!==t||!c.newValue)){var u=null;try{u=JSON.parse(c.newValue)}catch{u=null}d(u)}})}catch{}}function ye(){if(!Y){Y=!0,Qe();try{var e=o.getElementById("vildaProBadge");e&&typeof MutationObserver=="function"&&new MutationObserver(function(){var t=e.getAttribute("data-pro-state"),a=e.style&&e.style.display!=="none";Q({pro:a&&(t==="active"||t==="upgrade")?t:null})}).observe(e,{attributes:!0,attributeFilter:["data-pro-state","style"]})}catch{}o.addEventListener("vilda:user-state-cleared",oe),Ze(),Bt(),Cm_documentsBind(),At(),It(),_(),C(),pt(),B(),We(),Tt(),me(),Mt(),jt()}}var N={EDGE_PX:28,MIN_RATIO:2,MAX_MS:600,MIN_FRAC:.12,MIN_PX:64};function Re(){for(var e=null,t=0;t<b.length;t++)if(b[t]&&b[t].title==="Narz\u0119dzia"){e=b[t].items;break}var a=[];if(e)for(var n=0;n<e.length;n++)e[n]&&e[n].href&&a.push(e[n].href);return a}function He(e){if(!e)return null;var t=e.dx,a=e.dy,n=e.dt,s=e.startX,i=e.viewportW||0;if(typeof t!="number"||typeof a!="number"||typeof n!="number"||!isFinite(t)||!isFinite(a)||!isFinite(n)||n>N.MAX_MS||s<N.EDGE_PX||s>i-N.EDGE_PX)return null;var d=Math.abs(t),c=Math.abs(a),u=Math.max(N.MIN_PX,i*N.MIN_FRAC);return d<u||d<c*N.MIN_RATIO?null:t<0?"next":"prev"}function Vt(e){for(var t=e,a=0;t&&t.nodeType===1&&a<40;){var n=(t.tagName||"").toLowerCase();if(n==="input"||n==="select"||n==="textarea"||n==="button"||n==="a"||n==="canvas"||n==="svg"||n==="video"||n==="iframe")return!0;try{if(t.getAttribute&&(t.getAttribute("role")==="slider"||t.getAttribute("contenteditable")==="true"||t.hasAttribute("data-no-swipe")))return!0}catch{}try{if(t.scrollWidth-t.clientWidth>4&&r.getComputedStyle){var s=r.getComputedStyle(t).overflowX||"";if(s==="auto"||s==="scroll")return!0}}catch{}t=t.parentNode,a++}return!1}function he(){try{var e=o.documentElement,t=o.body;if(e&&e.classList&&e.classList.contains("vilda-auth-locked")||t&&t.classList&&t.classList.contains("chrome-drawer-open"))return!0;var a=o.getElementById("vilda-auth-ui-root");if(a){var n="";try{n=a.style&&a.style.display||""}catch{}if(!n&&r.getComputedStyle)try{n=r.getComputedStyle(a).display||""}catch{}if(n&&n!=="none")return!0}if(o.querySelector('.vilda-logout-overlay, .ww-onboarding-overlay.is-open, [aria-modal="true"]'))return!0}catch{}return!1}function Dt(e){var t=Re();if(t.length){var a=ge(),n=t.indexOf(a);if(!(n<0)){var s=e==="next"?t[n+1]:t[n-1];if(!(!s||s===a)){try{r.sessionStorage&&r.sessionStorage.setItem(V,JSON.stringify({d:e==="next"?"forward":"back",t:Date.now()}))}catch{}try{r.location.assign(s)}catch{}}}}}function me(){if(me._bound)return;me._bound=!0;var e=0,t=0,a=0,n=!1;function s(d,c,u){if(Vt(u)||he()){n=!1;return}e=d,t=c,a=Date.now(),n=!0}function i(d,c){if(n){n=!1;var u=He({dx:d-e,dy:c-t,dt:Date.now()-a,startX:e,viewportW:r.innerWidth||o.documentElement&&o.documentElement.clientWidth||0});u&&Dt(u)}}r.PointerEvent?(o.addEventListener("pointerdown",function(d){if(d.pointerType!=="touch"||d.isPrimary===!1){n=!1;return}s(d.clientX,d.clientY,d.target)},{passive:!0}),o.addEventListener("pointerup",function(d){d.pointerType==="touch"&&i(d.clientX,d.clientY)},{passive:!0}),o.addEventListener("pointercancel",function(){n=!1},{passive:!0})):(o.addEventListener("touchstart",function(d){if(!d.touches||d.touches.length!==1){n=!1;return}var c=d.touches[0];s(c.clientX,c.clientY,d.target)},{passive:!0}),o.addEventListener("touchend",function(d){if(n){var c=d.changedTouches&&d.changedTouches[0]||null;if(!c){n=!1;return}i(c.clientX,c.clientY)}},{passive:!0}),o.addEventListener("touchcancel",function(){n=!1},{passive:!0}))}function Nt(){o.readyState==="loading"?o.addEventListener("DOMContentLoaded",ye):ye()}r.VildaChrome={__vildaChrome:!0,VERSION:q,init:ye,refreshUserChip:_,refreshPatientChip:C,refreshPatientDocumentsAction:Cm_documentsRefresh,refreshMenuActions:Cm_refreshMenuActions,refreshSyncBtn:Oe,refreshRemindersBtn:E,highlightActiveLink:function(){se()},isPlainNavigationClick:Cm_plainClick,closeDrawer:Cm_closeDrawer,showTip:F,MENU:b,decideSwipe:He,swipeOrder:Re,getCloudOnlySyncPhase:lt,isCloudOnlySyncInProgress:H,waitForCloudOnlySync:ut,showCloudOnlySyncOverlay:function(){var e=o.getElementById("vildaCloudOnlyLoading");e&&typeof e._showLoading=="function"&&e._showLoading()},hideCloudOnlySyncOverlay:function(){var e=o.getElementById("vildaCloudOnlyLoading");e&&typeof e._hide=="function"&&e._hide()}},Nt()})(typeof window<"u"?window:null),(function(r){"use strict";r.vildaScrollTo=function(q,b,W){if(q){var o=typeof W=="number"?W:100,V=b&&b.behavior?b.behavior:"smooth",U=b&&b.block?b.block:"start";setTimeout(function(){try{if(r.innerWidth>=992&&U==="start"){var z=document.querySelector("header"),G=z?z.getBoundingClientRect().height:64,Y=12,K=q.getBoundingClientRect(),Z=Math.round(K.top+r.pageYOffset-G-Y);r.scrollTo({top:Z,behavior:V})}else q.scrollIntoView({behavior:V,block:U})}catch{}},o)}}})(typeof window<"u"?window:{});

/* P-HEADER-GEOMETRY: layout reads the rendered active form, independently of
 * the save-state owner. It never changes form values, vault data or routes. */
(function (win) {
  "use strict";
  var doc=win&&win.document;
  if(!doc||win.VildaHeaderLayout||typeof win.requestAnimationFrame!=="function")return;
  var scheduled=0,sourceDoc=null,sourceFrame=null,sourceAuthRoot=null,sourceCleanup=[],trackedFrames=[],targets=[],sizeObserver=null;
  function embedded(){return doc.documentElement.classList.contains("vilda-embedded")||doc.documentElement.classList.contains("vilda-shell-embedded")}
  function compact(){return win.innerWidth<992||doc.documentElement.classList.contains("vilda-phone")}
  function formDocument(owner){
    var location=owner&&owner.defaultView&&owner.defaultView.location;
    var pathname=location&&location.pathname||"",file=pathname.slice(pathname.lastIndexOf("/")+1);
    return file==="index.html"||file==="docpro.html"||file==="kalkulator-klirens.html"||!file&&!!pathname;
  }
  function formHost(owner,frame){
    if(formDocument(owner))return true;
    var sourceLocation=owner&&owner.defaultView&&owner.defaultView.location;
    if(frame&&owner!==doc&&sourceLocation&&sourceLocation.pathname&&sourceLocation.pathname!=="blank")return false;
    var location=win.location||{};
    return /(?:^|\/)app\.html$/.test(location.pathname||"")&&(!location.hash||/^#\/(?:start|docpro|klirens)(?:[/?]|$)/.test(location.hash));
  }
  function schedule(){if(!scheduled)scheduled=win.requestAnimationFrame(update)}
  function refreshNow(){
    if(scheduled&&typeof win.cancelAnimationFrame==="function")win.cancelAnimationFrame(scheduled);
    update();
  }
  function property(name,value,owner){var html=(owner||doc).documentElement;if(html.style.getPropertyValue(name)!==value)html.style.setProperty(name,value)}
  function marker(html,name,enabled){if(html.classList.contains(name)!==enabled)html.classList.toggle(name,enabled)}
  function pixels(value){return (Math.round(value*100)/100)+"px"}
  function headerLayoutHeight(header,box){
    var style=win.getComputedStyle&&win.getComputedStyle(header),top=header.offsetTop||0;
    // A sticky header's offsetTop follows scroll; its inset is the stable
    // layout edge, as in the pinned menu's Cm_sidebarPosition measurement.
    if(style&&(style.position==="sticky"||style.position==="fixed"))top=Math.max(0,parseFloat(style.top)||0);
    return Math.max(0,top+box.height);
  }
  function rect(element){
    if(!element||!element.getBoundingClientRect||!element.getClientRects().length)return null;
    var box=element.getBoundingClientRect();return box.width>0&&box.height>0?box:null;
  }
  function firstVisible(owner,selectors){
    for(var index=0;index<selectors.length;index++){
      var node=owner.querySelector(selectors[index]);if(rect(node))return node;
    }
    return null;
  }
  function visibleBlocks(parent){
    return Array.prototype.filter.call(parent&&parent.children||[],function(node){
      return !/^(?:SCRIPT|STYLE|LINK)$/.test(node.tagName||"")&&!!rect(node);
    });
  }
  function fitForm(owner){
    var form=owner.getElementById("calcForm"),columns=visibleBlocks(form);
    // Results below the first row must not shrink it under an active pointer.
    // Extra rows inside the form (such as comparison) keep their natural flow.
    var fit=columns.length>=1&&columns.length<=2&&columns.every(function(node){return node.id==="userSection"||node.id==="doctorSection"});
    marker(owner.documentElement,"vilda-form-fit-viewport",fit);
    marker(owner.documentElement,"vilda-form-only-patient",fit&&columns.length===1&&columns[0].id==="userSection");
  }
  function listen(target,type,handler,options,cleanup){
    if(!target||!target.addEventListener)return;
    target.addEventListener(type,handler,options);
    if(cleanup)cleanup.push(function(){target.removeEventListener(type,handler,options)});
  }
  function observeSource(owner,frame,authRoot){
    if(sourceDoc===owner&&sourceFrame===frame&&sourceAuthRoot===authRoot)return;
    sourceCleanup.forEach(function(remove){remove()});sourceCleanup=[];
    sourceDoc=owner;sourceFrame=frame;sourceAuthRoot=authRoot;
    listen(owner.defaultView,"scroll",schedule,{passive:true},sourceCleanup);
    listen(owner.defaultView,"resize",schedule,null,sourceCleanup);
    listen(owner,"vilda:phone-layout-changed",schedule,null,sourceCleanup);
    if(typeof win.MutationObserver==="function"){
      var changes=new win.MutationObserver(schedule);
      var content=owner.querySelector(".main-content")||owner.body;
      if(content)changes.observe(content,{subtree:true,childList:true,attributes:true,attributeFilter:["hidden","class","style"]});
      if(owner.documentElement)changes.observe(owner.documentElement,{attributes:true,attributeFilter:["class"]});
      if(owner.body)changes.observe(owner.body,{attributes:true,attributeFilter:["class"],childList:true});
      // Patient screens live outside .main-content. Their card can be replaced
      // without changing the body's open state (tabs, edit, list and return).
      if(authRoot)changes.observe(authRoot,{subtree:true,childList:true,attributes:true,attributeFilter:["hidden","class","style"]});
      sourceCleanup.push(function(){changes.disconnect()});
    }
    if(owner.fonts&&owner.fonts.ready)owner.fonts.ready.then(schedule).catch(function(){});
  }
  function watchSizes(nodes){
    nodes=nodes.filter(Boolean);
    if(nodes.length===targets.length&&nodes.every(function(node,index){return node===targets[index]}))return;
    targets=nodes;
    if(sizeObserver)sizeObserver.disconnect();
    if(typeof win.ResizeObserver!=="function")return;
    if(!sizeObserver)sizeObserver=new win.ResizeObserver(schedule);
    nodes.forEach(function(node){sizeObserver.observe(node)});
  }
  function frames(){
    var all=Array.prototype.slice.call(doc.querySelectorAll("#appPanes>iframe.app-pane"));
    trackedFrames.slice().forEach(function(frame){
      if(all.indexOf(frame)!==-1)return;
      frame.removeEventListener("load",schedule);trackedFrames.splice(trackedFrames.indexOf(frame),1);
    });
    all.forEach(function(frame){
      if(trackedFrames.indexOf(frame)===-1){trackedFrames.push(frame);frame.addEventListener("load",schedule)}
      try{var owner=frame.contentDocument,html=owner&&owner.documentElement;
        if(html){
          var form=formDocument(owner);
          marker(html,"vilda-form-layout",form);
          marker(html,"vilda-chrome-wide-host",!compact());
          marker(html,"vilda-form-host-desktop",form&&!compact());
        }
      }catch{/* A document in navigation will be measured after its load. */}
    });
    return doc.querySelector("#appPanes>iframe.app-pane:not([hidden])");
  }
  function update(){
    scheduled=0;
    if(embedded()||!doc.body||!doc.body.classList.contains("vilda-header-menu"))return;
    var strip=doc.querySelector(".chrome-strip"),search=doc.getElementById("vildaHeaderSearch"),actions=doc.querySelector(".chrome-chips");
    if(!strip||!search)return;
    if(strip.classList.contains("chrome-header-actions-before-search"))strip.classList.remove("chrome-header-actions-before-search");
    var header=doc.querySelector("body>header"),headerBox=rect(header);
    if(headerBox)property("--chrome-layout-header-height",pixels(headerLayoutHeight(header,headerBox)));
    var frame=frames(),owner=doc,offset=0,verticalOffset=0;
    if(frame)try{
      if(frame.contentDocument&&frame.contentDocument.body)owner=frame.contentDocument;
    }catch{return}
    var form=formHost(owner,frame);
    marker(doc.documentElement,"vilda-form-layout",form);
    // Embedded form gutters belong to the host. Only compensate the active
    // form's real scrollbar; changing the warning state never changes width.
    var rootBox=rect(owner.documentElement),viewport=owner.documentElement.clientWidth;
    // A stable gutter can already shrink the root's box before the page
    // overflows, while clientWidth still reports the whole iframe width.
    if(rootBox)viewport=Math.min(viewport,rootBox.width);
    var scrollbar=frame&&form&&!compact()&&viewport>0?Math.max(0,frame.clientWidth-viewport):0;
    property("--chrome-pane-scrollbar-width",pixels(scrollbar));
    var authRoot=owner.querySelector(".vilda-auth-root"),authVisible=authRoot&&rect(authRoot);
    if(authVisible&&owner.defaultView&&typeof owner.defaultView.getComputedStyle==="function")authVisible=owner.defaultView.getComputedStyle(authRoot).visibility!=="hidden";
    var authTarget=authVisible?firstVisible(owner,[".vilda-auth-root .vilda-auth-card"]):null;
    observeSource(owner,frame,authRoot);
    fitForm(owner);
    // Route markers and the scrollbar compensation can move the iframe.
    // Read its origin only after those writes, also on synchronous navigation.
    if(frame){var frameBox=frame.getBoundingClientRect();offset=frameBox.left;verticalOffset=frameBox.top}
    var target=authTarget||firstVisible(owner,["#userSection fieldset.user-card","#clcrActivePanel","#clcrForm>.patient-card","#clcrForm","#userSection"]);
    var second=authTarget?null:firstVisible(owner,["#doctorSection","#clcrResultRail"]);
    var workspace=authTarget||firstVisible(owner,["#calcForm","#clcrWorkspace","#clcrForm"]);
    var fallback=firstVisible(owner,["#proGateBanner",".main-content>.container",".main-content","main"]);
    var footer=owner.querySelector("footer.site-footer"),footerInner=footer&&footer.querySelector(".site-footer__inner");
    watchSizes([target,second,workspace,fallback,footer,footerInner,frame,header,strip,actions]);
    var footerBox=rect(footer),innerBox=rect(footerInner);
    if(footerBox&&!compact())property("--chrome-menu-footer-height",pixels(Math.max(96,footerBox.height)));
    else property("--chrome-menu-footer-height","96px");
    // CSS variables do not cross iframe documents. The form uses the actual
    // footer including an optional mobile dock reserve, not the menu minimum.
    property("--chrome-form-footer-height",pixels(footerBox?footerBox.height:0),owner);
    // Keep the floating arrow above visible footer links instead of adding a
    // second empty band. The dock still owns its independent bottom reserve.
    var arrowBottom=innerBox?Math.max(0,win.innerHeight-(verticalOffset+innerBox.top)+10):0;
    property("--chrome-footer-arrow-bottom",pixels(Math.min(Math.max(0,win.innerHeight-64),arrowBottom)));
    if(compact())return;
    var stripBox=strip.getBoundingClientRect(),box=rect(target)||rect(fallback);
    var secondBox=rect(second),workspaceBox=rect(workspace)||rect(fallback)||box;
    var twoColumns=!!(target&&box&&secondBox&&secondBox.left>=box.right-2&&secondBox.left>box.left+1);
    var left=box?offset+box.left:stripBox.left+Math.min(300,win.innerWidth*.3);
    var right=twoColumns?offset+secondBox.right:workspaceBox?offset+workspaceBox.right:stripBox.right-16;
    // The centered patient card can start before the desktop brand at tablet
    // widths. Keep both live controls usable while the bell follows the card.
    if(authTarget){var brandBox=rect(doc.querySelector(".chrome-brand"));if(brandBox)left=Math.max(left,brandBox.right+12)}
    var width=box?box.width:Math.max(0,right-left-108);
    // Two columns match the complete first card. A genuinely full-width,
    // single-column form reserves sync44 + gap8 + bell44, then a 12px gap.
    // The slot is stable when a sync warning appears or disappears.
    if(!twoColumns)width=Math.max(0,Math.min(width,right-left-108));
    if(!target)width=Math.min(760,width);
    left=Math.max(0,left-stripBox.left);
    property("--chrome-actions-right",pixels(Math.max(0,stripBox.right-right)));
    property("--chrome-form-left",pixels(left));property("--chrome-form-width",pixels(width));
  }
  function boot(){
    if(embedded())return;
    if(typeof win.MutationObserver==="function"){
      var rootChanges=new win.MutationObserver(schedule);
      rootChanges.observe(doc.documentElement,{attributes:true,attributeFilter:["class"]});
      if(doc.body)rootChanges.observe(doc.body,{attributes:true,attributeFilter:["class"],childList:true});
      var panes=doc.getElementById("appPanes");
      if(panes)rootChanges.observe(panes,{subtree:true,childList:true,attributes:true,attributeFilter:["hidden"]});
      var header=doc.querySelector("body>header");if(header)rootChanges.observe(header,{childList:true,subtree:true});
    }
    listen(win,"resize",schedule);listen(win,"scroll",schedule,{passive:true});
    listen(win,"load",schedule);listen(doc,"vilda:phone-layout-changed",schedule);
    schedule();
  }
  // The embedded document needs its own route marker before the host's next
  // layout pass. The host controls desktop mode, even in a narrow iframe.
  marker(doc.documentElement,"vilda-form-layout",formDocument(doc));
  win.VildaHeaderLayout={refresh:schedule,refreshNow:refreshNow};
  if(doc.readyState==="loading")doc.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})(typeof window!=="undefined"?window:null);
