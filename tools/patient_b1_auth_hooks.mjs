// Reproducible presentation-only hooks over the native AuthUI artifact.
// No clinical formula, source table, rounding or native writer is replaced.
import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const target = fileURLToPath(new URL('../vilda_auth_ui.js', import.meta.url));
const compatibilityPairs = [
  ['legacyPanels:Cs.slice(2,7).filter(Boolean),legacySummary:i.VildaHomePatientNative.describeLegacy(Cs.slice(2,7)),', 'legacyPanels:Cs.slice(2,Cs.indexOf(Ft)).filter(Boolean),legacySummary:i.VildaHomePatientNative.describeLegacy(Cs.slice(2,Cs.indexOf(Ft))),']
];
const pairs = [
  ['async function se(t,a,n,r){var o=jt();', 'async function se(t,a,n,r){var HomePatientPresentation=null,HomePatientRequested=!!(n&&n.homePatientPresentation===true&&i.__VILDA_HOME_WORKSPACE_PREVIEW__===true);var o=jt();'],
  ['var o=jt();if(!o||!o.isUnlocked())return;', `var o=jt();
function HomePatientOpenNote(options){return HomePatientPresentation?HomePatientPresentation.openNote(options):ga(options)}
function HomePatientDialog(target,metadata){return HomePatientPresentation?HomePatientPresentation.onDialog(target,metadata):null}
function HomePatientIsCurrent(){return !!(HomePatientPresentation&&HomePatientPresentation.isCurrent())}
if(!o||!o.isUnlocked())return;`],
  ['Nt=e("div",{class:"vilda-patient-tab-content","data-tab":"antro"}),zt=null;var At=[];', 'Nt=e("div",{class:"vilda-patient-tab-content","data-tab":"antro"}),zt=null;var At=[],HomePatientMetrics={},HomePatientAssessments={bmi:Bo&&Bo.kategoria&&Bo.kategoria.etykieta||"",cole:Co&&Co.kategoria&&Co.kategoria.etykieta||""};'],
  ['At.push(xt("Wzrost",', 'At.push(HomePatientMetrics.height=xt("Wzrost",'],
  ['At.push(xt("Waga",', 'At.push(HomePatientMetrics.weight=xt("Waga",'],
  ['At.push(xt("BMI",', 'At.push(HomePatientMetrics.bmi=xt("BMI",'],
  ['At.push(xt("Wska\\u017Anik Cole\'a",', 'At.push(HomePatientMetrics.cole=xt("Wska\\u017Anik Cole\'a",'],
  ['function ua(ct){[Et,Bt,pt,kt,GdLabTab,CarePatientTab].forEach(function(Lt){Lt.getAttribute("data-tab")===ct?Lt.classList.add("vilda-patient-tab--active"):Lt.classList.remove("vilda-patient-tab--active")}),[Nt,Ct,sa,ca,GdLabHost,CarePatientHost].forEach(function(Lt){Lt.getAttribute("data-tab")===ct?Lt.classList.remove("vilda-patient-tab-content--hidden"):Lt.classList.add("vilda-patient-tab-content--hidden")})}', 'function ua(ct){[Et,Bt,pt,kt,GdLabTab,CarePatientTab].forEach(function(Lt){Lt.getAttribute("data-tab")===ct?Lt.classList.add("vilda-patient-tab--active"):Lt.classList.remove("vilda-patient-tab--active")}),[Nt,Ct,sa,ca,GdLabHost,CarePatientHost].forEach(function(Lt){Lt.getAttribute("data-tab")===ct?Lt.classList.remove("vilda-patient-tab-content--hidden"):Lt.classList.add("vilda-patient-tab-content--hidden")});if(HomePatientPresentation)HomePatientPresentation.select(ct)}'],
  ['r.activeTab==="timeline"||r.activeTab==="lab"||r.activeTab==="care")try{ua(r.activeTab)}', 'r.activeTab==="timeline"||r.activeTab==="lab"||r.activeTab==="care"||HomePatientRequested&&r.activeTab==="treatment")try{ua(r.activeTab)}'],
  ['GdScrollKarty=GdTlo?GdPrzewiniecieKarty():null;GdZakonczOdczyt(GdBilet);Zt(Eo,{noLogo:!0})', `GdScrollKarty=GdTlo?GdPrzewiniecieKarty():null;
/* BEGIN HOME PATIENT B1 NATIVE PRESENTATION
 * All supplied nodes were built by the unchanged native functions above.
 * The existing AuthUI modal, navigation and private read owner stay in charge.
 */
if(HomePatientRequested&&i.VildaHomePatientNative&&typeof i.VildaHomePatientNative.decorate==="function"){
  HomePatientPresentation=i.VildaHomePatientNative.decorate({
    root:Eo,patientId:t,patientName:w,openerId:n&&n.homePatientOpenerId||"",ageLabel:Wt,measuredAtISO:m.measuredAtISO||s.visit&&s.visit.clinicalDateISO||null,
    tabs:Ft,panels:{antro:Nt,traj:Ct,notes:sa,timeline:ca,lab:GdLabHost,care:CarePatientHost},
    primaryMetrics:HomePatientMetrics,metricAssessments:HomePatientAssessments,measureNodes:At,growthNodes:ce,sgaNode:SgaTile,extraPanels:[BhPanel,Ce&&Ce.panel],
    legacyPanels:Cs.slice(2,Cs.indexOf(Ft)).filter(Boolean),legacySummary:i.VildaHomePatientNative.describeLegacy(Cs.slice(2,Cs.indexOf(Ft))),
    actions:{edit:B,newMeasure:U,visits:VisitHistoryButton,versions:So,load:Li,return:zo},
    backgroundRefresh:GdTlo,activeTab:r&&r.activeTab||"antro",focusNoteId:r&&r.treatmentFocusNoteId||null,registerBack:gr,resumeRefresh:Gd7,
    openNote:function(options){return ga(options)},
    openPlan:function(destination){if(remReadCurrent(CareReadOwner)&&Eo.isConnected)se(t,a,n,{activeTab:"care",carePlanId:destination&&destination.planId,careNoteId:destination&&destination.noteId})},
    isCurrent:function(){return remReadCurrent(CareReadOwner)&&Eo.isConnected},
    close:function(){$t()},
    disposeNativeViews:function(){
      var lab=HomePatientLabView,care=CarePatientView;
      HomePatientLabView=null;CarePatientView=null;
      if(carePatientMount===care)carePatientMount=null;
      if(lab&&typeof lab.destroy==="function")try{lab.destroy()}catch(error){Ot("home patient lab destroy",error)}
      if(care&&typeof care.destroy==="function")try{care.destroy()}catch(error){Ot("home patient care destroy",error)}
    },
    onChanged:function(){ue=false;Ae=false;GdLabOnce=false},
    selectTreatment:function(){if(HomePatientPresentation&&HomePatientPresentation.isCurrent()){ua("treatment");ia({screen:"card",patientId:t,tab:"treatment"})}}
  });
}
/* END HOME PATIENT B1 NATIVE PRESENTATION */
GdZakonczOdczyt(GdBilet);Zt(Eo,{noLogo:!0})`],
  ['remSearchBindReturn(Eo,SearchReturnToken),GdOdtworzPrzewiniecie(GdScrollKarty)', 'remSearchBindReturn(Eo,SearchReturnToken),HomePatientPresentation&&HomePatientPresentation.mounted(),GdOdtworzPrzewiniecie(GdScrollKarty)']
  ,['Ob_dz(t,s,S,h,GdNotatki,m)', 'Ob_dz(t,s,S,h,GdNotatki,m,HomePatientRequested?{isCurrent:HomePatientIsCurrent,onDialog:HomePatientDialog}:null)']
  ,['Xo(sa,t,da,{focusNoteId:r&&r.focusNoteId})', 'Xo(sa,t,da,{focusNoteId:r&&r.focusNoteId,homePatientPresentation:HomePatientRequested,openEditor:HomePatientOpenNote})']
  ,['Xl(ca,t,Ue,a,n)', 'Xl(ca,t,Ue,a,n,{openEditor:HomePatientOpenNote})']
  ,['GdLabOnce=!1;function GdLabRender(){var GdModul=', 'GdLabOnce=!1,HomePatientLabView=null;function GdLabRender(){if(HomePatientRequested&&HomePatientLabView){var HomePatientPreviousLab=HomePatientLabView;HomePatientLabView=null;if(typeof HomePatientPreviousLab.destroy==="function")try{HomePatientPreviousLab.destroy()}catch(error){Ot("home patient lab destroy",error)}}var GdModul=']
  ,['GdModul.render(GdLabHost,t,{focusNoteId:WbWskazany,', 'HomePatientLabView=GdModul.render(GdLabHost,t,{onDialog:HomePatientRequested?HomePatientDialog:void 0,isCurrent:HomePatientRequested?HomePatientIsCurrent:void 0,focusNoteId:WbWskazany,']
  ,['isCurrent:function(){return remReadCurrent(CarePatientOwner)&&CarePatientHost.isConnected},', 'isCurrent:function(){return remReadCurrent(CarePatientOwner)&&CarePatientHost.isConnected&&(!HomePatientRequested||HomePatientIsCurrent())},']
  ,['module.mount(CarePatientHost,{full:true,patientId:t,vault:o,', 'module.mount(CarePatientHost,{full:true,patientId:t,vault:o,onDialog:HomePatientRequested?HomePatientDialog:void 0,']
];
const outsidePairs = [
  ['function Ob_dz(t, s, S, h, notatki, m) {', 'function Ob_dz(t, s, S, h, notatki, m, homeContext) {'],
  ['patientId: t, stan: stan, urodzenieISO: (m && m.dobISO) || "", nazwa: (s && s.name) || "", migawka: migawka,', 'patientId: t, stan: stan, urodzenieISO: (m && m.dobISO) || "", nazwa: (s && s.name) || "", migawka: migawka, homeContext: homeContext,'],
  ['function odswiez() {\n    var o = jt();', 'function odswiez() {\n    if (homeContext && !homeContext.isCurrent()) return;\n    var o = jt();'],
  ['rysuj(Dz.zloz(n, migawka));', 'if (!homeContext || homeContext.isCurrent()) rysuj(Dz.zloz(n, migawka));'],
  ["var zakladka = karta && karta.querySelector('button[data-tab=\"antro\"]');", "var zakladka = karta && karta.querySelector(i.__VILDA_HOME_WORKSPACE_PREVIEW__===true&&karta.classList.contains('vhome-native-patient-card')?'button[data-tab=\"treatment\"]':'button[data-tab=\"antro\"]');"],
  ['function GdMoznaWyswietlic(t){', 'function GdMoznaWyswietlic(t,homeBackground){'],
  ['if(GdSgaDeferRefresh()){GdZakonczOdczyt(t);return false}\n  if(i.document.querySelector', 'if(GdSgaDeferRefresh()){GdZakonczOdczyt(t);return false}\n  if(homeBackground&&i.VildaHomePatientNative&&i.VildaHomePatientNative.deferRefresh()){GdZakonczOdczyt(t);return false}\n  if(i.document.querySelector'],
  ['if(GdSgaDeferRefresh())return;if(i.document.querySelector(".vilda-auth-overlay-sheet")', 'if(GdSgaDeferRefresh())return;if(i.VildaHomePatientNative&&i.VildaHomePatientNative.deferRefresh())return;if(i.document.querySelector(".vilda-auth-overlay-sheet")'],
  ["return [Rt,Rt&&Rt.querySelector('.vilda-auth-overlay'),Rt&&Rt.querySelector('.vilda-auth-card')].map", "return [Rt,Rt&&Rt.querySelector('.vilda-auth-overlay'),Rt&&Rt.querySelector('.vilda-auth-card'),Rt&&Rt.querySelector('.vhome-b1-panels')].map"],
  ["[Rt,Rt&&Rt.querySelector('.vilda-auth-overlay'),Rt&&Rt.querySelector('.vilda-auth-card')].forEach", "[Rt,Rt&&Rt.querySelector('.vilda-auth-overlay'),Rt&&Rt.querySelector('.vilda-auth-card'),Rt&&Rt.querySelector('.vhome-b1-panels')].forEach"],
  ['ga({patientId:a,note:null,onSaved:function(){t._wbPoZapisie=t._wbStan||null;typeof n=="function"&&n()}})', '(options&&typeof options.openEditor==="function"?options.openEditor:ga)({patientId:a,note:null,onSaved:function(){t._wbPoZapisie=t._wbStan||null;typeof n=="function"&&n()}})'],
  ['ga({patientId:a,note:S,onSaved:function(){t._wbPoZapisie=t._wbStan||null;typeof n=="function"&&n()}})', '(options&&typeof options.openEditor==="function"?options.openEditor:ga)({patientId:a,note:S,onSaved:function(){t._wbPoZapisie=t._wbStan||null;typeof n=="function"&&n()}})'],
  ['async function Xl(t,a,n,r,o){', 'async function Xl(t,a,n,r,o,options){'],
  ['c=(c||[]).filter(function(S){return!(S&&S.ghPointId)||!!(options&&options.focusNoteId===S.id)});', 'c=(c||[]).filter(function(S){return!(options&&options.homePatientPresentation&&S&&Object.prototype.hasOwnProperty.call(S,"treatmentContext"))&&(!(S&&S.ghPointId)||!!(options&&options.focusNoteId===S.id))});'],
  ['ga({patientId:f.patientId,note:null,suggestLinkedAge:f.ageMonths,onSaved:function(){se(f.patientId,r,o,{activeTab:"timeline"})}})', '(options&&typeof options.openEditor==="function"?options.openEditor:ga)({patientId:f.patientId,note:null,suggestLinkedAge:f.ageMonths,onSaved:function(){se(f.patientId,r,o,{activeTab:"timeline"})}})'],
  ['showPatientCard:remSearchNewNavigation(se),', `showPatientCard:remSearchNewNavigation(se),describePatientTreatmentSummary:function(payload){
if(i.__VILDA_HOME_WORKSPACE_PREVIEW__!==true||!i.VildaHomePatientNative||!payload)return"";
try{return i.VildaHomePatientNative.describeLegacy([wl(payload.ghTherapyPoints),null,Cl(payload.obesityTherapyPoints)])}catch{return""}
},`],
  ['function ga(options) {\n  var sequence =', `function ga(options) {
  // Structured treatment records have their own typed editor. A generic
  // narrative form must never reinterpret or replace their context.
  if(i.__VILDA_HOME_WORKSPACE_PREVIEW__===true&&options&&options.note
    &&Object.prototype.hasOwnProperty.call(options.note,"treatmentContext")){
    if(!options.patientId||options.note.patientId!==options.patientId||!options.note.id
      ||options.isCurrent&&options.isCurrent()!==true)return false;
    var treatmentVault=jt();
    if(!treatmentVault||!treatmentVault.isUnlocked())return false;
    if(!i.VildaHomePatientNative||typeof i.VildaHomePatientNative.decorate!=="function"){
      try{i.alert("Dokumentację leczenia otworzysz na stronie głównej: Karta pacjenta → Leczenie.")}catch{}
      return false;
    }
    return se(options.patientId,null,{homePatientPresentation:true},{activeTab:"treatment",treatmentFocusNoteId:options.note.id});
  }
  var sequence =`]
];
let source = readFileSync(target, 'utf8');
const start = source.indexOf('async function se(t,a,n,r){');
const end = source.indexOf('function jn()', start);
if(start < 0 || end < 0) throw new Error('Native patient-card boundary unavailable.');
let card = source.slice(start, end);
function applyPairs(input,replacements){
  for(const [before,after]of replacements){
    if(input.includes(after)){if(input.split(after).length!==2)throw new Error('Repeated B1 presentation hook.');continue;}
    if(process.argv.includes('--check'))throw new Error('B1 native presentation hook missing: '+before.slice(0,70));
    if(input.split(before).length!==2)throw new Error('Native presentation anchor changed: '+before.slice(0,70));
    input=input.replace(before,after);
  }
  return input;
}
// Existing B1 exports already contain the presentation block. Adapt its old
// node boundary before checking the complete hook; fresh native input gets it
// from the block below.
for(const [before,after] of compatibilityPairs)if(card.includes(before))card=applyPairs(card,[[before,after]]);
card=applyPairs(card,pairs);
const displayGuards=card.split('GdMoznaWyswietlic(GdBilet)').length-1;
if(displayGuards){
 if(displayGuards!==4||process.argv.includes('--check'))throw new Error('Unexpected native patient display guard count.');
 card=card.replaceAll('GdMoznaWyswietlic(GdBilet)','GdMoznaWyswietlic(GdBilet,HomePatientRequested&&GdTlo)');
}
const noteCalls=card.split('ga({').length-1;
if(noteCalls){
 if(noteCalls!==4||process.argv.includes('--check'))throw new Error('Unexpected native patient note call count.');
 card=card.replaceAll('ga({','HomePatientOpenNote({');
}
source=applyPairs(source.slice(0,start)+card+source.slice(end),outsidePairs);
if(!process.argv.includes('--check'))writeFileSync(target,source);
process.stdout.write('Native patient B1 presentation hooks: complete; clinical builders preserved.\n');
