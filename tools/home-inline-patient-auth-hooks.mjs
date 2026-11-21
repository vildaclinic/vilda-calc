// Embed the existing AuthUI patient card in the visit workspace. Keep the
// published artifact reproducible, including its original modal-only path.
const begin = 'async function se(t,a,n,r){';
const end = 'function jn()';
const prelude = `/* BEGIN HOME PATIENT INLINE ADAPTER */
var HomeInline=HomePatientRequested&&n.homePatientInline||null;
var HomeInlineFocus=HomeInline&&r&&r.focusNoteId||null;
if(HomeInline){
  if(!i.VildaHomePatient.ownsInline(HomeInline,t))return;
  if(r&&r.activeTab&&!r._homeInlineRender)HomeInline.selected=r.activeTab;
  if(HomeInline.openedEdit&&!(r&&r._homeInlineRender)){
    HomeInline.openedEdit=false;
    if(bn()&&bn().screen==="edit"&&bn().patientId===t)$t();
  }
}
function HomeMayDisplay(ticket){return HomeInline?i.VildaHomePatient.ownsInline(HomeInline,t)&&HomeInline.readSeq===ticket&&!i.VildaHomePatientNative.deferRefresh():GdMoznaWyswietlic(ticket,HomePatientRequested&&GdTlo)}
function HomeEndRead(ticket){if(!HomeInline)GdZakonczOdczyt(ticket)}
function HomeTab(route){if(!HomeInline)ia(route)}
/* END HOME PATIENT INLINE ADAPTER */
`;
const bodyHooks = [
  ['function HomePatientOpenNote(options)', prelude + 'function HomePatientOpenNote(options)'],
  ['var SearchReturnToken=remSearchPatientReturn(', 'var SearchReturnToken=!HomeInline&&remSearchPatientReturn('],
  ['var GdTlo=!!(r&&r._syncRefresh', 'var GdTlo=!HomeInline&&!!(r&&r._syncRefresh'],
  ['if(!GdTlo)', 'if(!GdTlo&&!HomeInline)', 2],
  ['GdBilet=GdZacznijOdczyt()', 'GdBilet=HomeInline?(HomeInline.readSeq=(HomeInline.readSeq||0)+1):GdZacznijOdczyt()'],
  ['GdMoznaWyswietlic(GdBilet,HomePatientRequested&&GdTlo)', 'HomeMayDisplay(GdBilet)', 4],
  ['GdZakonczOdczyt(GdBilet)', 'HomeEndRead(GdBilet)', 3],
  ['GdOdcisk=GdOdciskKarty(l,GdNotatki);', 'if(HomeInlineFocus)HomeInline.selected=r.activeTab||"notes";GdOdcisk=GdOdciskKarty(l,GdNotatki);'],
  ['var d=l&&Array.isArray(l.snapshots)?l.snapshots:[],c=d.length?d[0]:null;',
   'var d=l&&Array.isArray(l.snapshots)?l.snapshots:[];if(HomeInline&&HomeInline.snapshotId)d=HomeInline.historicalSnapshots(d);var c=d.length?d[0]:null;'],
  ['if(!c||!c.payload){HomeEndRead(GdBilet);Zt(', 'if(!c||!c.payload){HomeEndRead(GdBilet);if(HomeInline){HomeInline.showError();return}Zt('],
  ['if(Ia(),le.onPick=a,le.listOptions=n,!(r&&r._navRestore))','if(!HomeInline){if(Ia(),le.onPick=a,le.listOptions=n,!(r&&r._navRestore))'],
  ['}Xn=t;var Vt=null;', '}Xn=t;}var Vt=null;'],
  ['ia({screen:"card",patientId:t,tab:', 'HomeTab({screen:"card",patientId:t,tab:', 7],
  ['onclick:function(){fi(t,a,n)}','onclick:function(){if(HomeInline)HomeInline.openedEdit=true;fi(t,a,n)}'],
  ['module.mount(CarePatientHost,{full:true,patientId:t,vault:o,','module.mount(CarePatientHost,{full:true,patientId:t,vault:o,captureVisitBinding:HomeInline&&HomeInline.captureVisitBinding,'],
  ['registerBack:gr,','registerBack:HomeInline?HomeInline.registerBack:gr,',2],
  ['backgroundRefresh:GdTlo,activeTab:r&&r.activeTab||"antro"', 'inline:HomeInline,backgroundRefresh:GdTlo||!!HomeInline,activeTab:HomeInline?HomeInline.selected:r&&r.activeTab||"antro"'],
  ['resumeRefresh:Gd7,','resumeRefresh:HomeInline?i.VildaHomePatient.refresh:Gd7,'],
  ['isCurrent:function(){return remReadCurrent(CareReadOwner)&&Eo.isConnected}', 'isCurrent:function(){return (!HomeInline||i.VildaHomePatient.ownsInline(HomeInline,t))&&remReadCurrent(CareReadOwner)&&Eo.isConnected}'],
  ['close:function(){$t()},','close:function(){if(HomeInline)HomeInline.onClose();else $t()},'],
  ['HomeEndRead(GdBilet);Zt(Eo,{noLogo:!0})', `HomeEndRead(GdBilet);if(HomeInline){
  if(!HomePatientPresentation){HomeInline.showError();return}
  HomeInline.shell.replaceChildren(Eo);
  HomePatientPresentation.mounted();
  // A deep link may choose a different tab while the vault read is pending.
  if(HomeInline.selected!==(r&&r.activeTab))i.VildaHomePatientNative.selectInline(HomeInline.selected);
}else {Zt(Eo,{noLogo:!0})`],
  ['ua(ct||"antro")}};\nif(r&&r.focusNoteId)', 'ua(ct||"antro")}};}\nif(r&&r.focusNoteId)']
];
const apiHooks = [
  ['showPatientCard:remSearchNewNavigation(se),describePatientTreatmentSummary:',
   `showPatientCard:remSearchNewNavigation(se),renderHomePatientInline:function(scope){
if(!scope||!i.VildaHomePatient||!i.VildaHomePatient.ownsInline(scope,scope.patientId))return;
var request={_homeInlineRender:true,activeTab:scope.selected,focusNoteId:scope.focusNoteId||null};
scope.focusNoteId=null;return se(scope.patientId,null,{homePatientPresentation:true,homePatientInline:scope},request);
},describePatientTreatmentSummary:`]
];
function replace(source, hooks, reverse) {
  for (const [before, after, count = 1] of reverse ? [...hooks].reverse() : hooks) {
    const from = reverse ? after : before;
    const parts = source.split(from);
    if (parts.length !== count + 1) throw new Error('Unexpected native patient boundary: ' + from.slice(0, 90));
    source = parts.join(reverse ? before : after);
  }
  return source;
}
function transform(source, reverse) {
  const start = source.indexOf(begin), finish = source.indexOf(end, start);
  if (start === -1 || finish === -1) throw new Error('Native patient builder unavailable');
  const body = replace(source.slice(start, finish), bodyHooks, reverse);
  return replace(source.slice(0, start) + body + source.slice(finish), apiHooks, reverse);
}
export function applyInlinePatientHooks(source) { return transform(source, false); }
export function reverseInlinePatientHooks(source) { return transform(source, true); }
