// Reproduce the opted-in patient navigation on the published native AuthUI artifact.
const pairs = [
  [`return saved.state; } };
}
function patientsDatabaseGe`,
   `return saved.state; } };
}
// A background reread remounts the list while keeping the directory open.
let homeDirectorySession = null;
function patientsDatabaseGe`],
  [`bled) {
  if (!Rt) return;
  Rt.classList.toggle('vild`,
   `bled) {
  if (!Rt) return;
  if (!enabled) homeDirectorySession = null;
  else if (!homeDirectorySession) homeDirectorySession = {};
  Rt.classList.toggle('vild`],
  [`d: state.selected });
    close(); setTimeout(function () { se(row.g.patientId, null, `,
   `d: state.selected });
    const owner = remReadOwner();
    close(); setTimeout(function () {
      if (!remReadCurrent(owner)) return;
      if (row.g.isExternal) ln(row.g.patientId, { focusNoteId: noteId || row.n.id });
      else se(row.g.patientId, null, `],
  [`eId: noteId || row.n.id }); }, 0);
  }
  function clos`,
   `eId: noteId || row.n.id });
    }, 0);
  }
  function clos`],
  ["cRefresh||r._navRestore)));if(SearchReturnToken&&!ee.s",
   `cRefresh||r._navRestore)));// A return ticket belongs to its search results and exact document. Native
// rerenders and explicit record editors keep their binding to the original card.
if (!HomePatientRequested && !SearchReturnToken && !(r && (r._syncRefresh || r._navRestore || r.carePlanId || r.treatmentFocusNoteId))) {
  const focusNoteId = r?.focusNoteId || n?.focusNoteId || null;
  const section = r?.activeTab || (focusNoteId ? 'notes' : 'antro');
  const navigation = openPatientInHome(t, 'browse', section, focusNoteId);
  if (navigation) return navigation;
}
if(SearchReturnToken&&!ee.s`],
  ["-pill\",type:\"button\",title:\"Dodaj nowy pomiar (waga, wzrost)\",\"aria-label\":\"Dodaj nowy pomiar\",oncli",
   "-pill\",type:\"button\",title:homePatientRoute()?\"Rozpocznij nową wizytę\":\"Dodaj nowy pomiar (waga, wzrost)\",\"aria-label\":homePatientRoute()?\"Rozpocznij nową wizytę\":\"Dodaj nowy pomiar\",oncli"],
  ["ass:\"vilda-pill-label\",text:\"Nowy pomiar\"})]),O=e(\"div",
   "ass:\"vilda-pill-label\",text:homePatientRoute()?\"Rozpocznij nową wizytę\":\"Nowy pomiar\"})]),O=e(\"div"],
  ["turnToList(a,n)}}),Li=null;typeof a==\"function\"&&(Li=e",
   `turnToList(a,n)}}),Li=null;
if (homePatientRoute()) {
  Li=e("button",{class:"vilda-auth-btn vilda-auth-btn-primary",type:"button",text:"Otwórz przegląd pacjenta",
    onclick:function(){return openPatientInHome(t,"browse","antro")}});
} else typeof a=="function"&&(Li=e`],
  ["Co=null,VisitHistoryButton=i.VildaVisitHistory&&typeof",
   "Co=null,VisitHistoryButton=homePatientRoute()||i.VildaVisitHistory&&typeof"],
  [" wizyt\",onclick:function(){i.VildaVisitHistory.open(t,",
   " wizyt\",onclick:function(){return openPatientInHome(t,'browse','visits')||i.VildaVisitHistory.open(t,"],
  ["ed:function(){try{se(t,a,n,r)}catch{}}})}catch{}}}):nul",
   "ed:function(){try{se(t,a,n,Object.assign({},r,{_navRestore:true}))}catch{}}})}catch{}}}):nul"],
  [`ce(2,Cs.indexOf(Ft))),
    actions:{edit:B,newMeasure:`,
   `ce(2,Cs.indexOf(Ft))),
    homeNavigation:!!homePatientRoute(),actions:{edit:B,newMeasure:`],
  ["e(\"p\",{class:\"ve-sub\",text:'Dane sta\\u0142e pacjenta. ",
   "e(\"p\",{class:\"ve-sub\",text:homePatientRoute()?\"Dane stałe pacjenta. Wybierz „Rozpocznij nową wizytę”, aby w razie potrzeby wpisać pomiary w zakładce Analiza.\":'Dane sta\\u0142e pacjenta. "],
  ["139\\uFE0F\"}),e(\"span\",{text:'Pomiary (wzrost, masa, wi",
   "139\\uFE0F\"}),e(\"span\",{text:homePatientRoute()?\"Po wybraniu „Rozpocznij nową wizytę” możesz uzupełnić pomiary w zakładce Analiza. Wcześniejszą wizytę możesz edytować w Historii wizyt. Dane okołoporodowe zasilają moduł SGA i epikryzę. Wiek początku pokwitania i menarche służą do oceny tempa wzrastania.\":'Pomiary (wzrost, masa, wi"],
  [`;
}
async function hi(t,a){a=a||{};var quickEncounter=`,
   `;
}
async function hi(t,a){
  if (!a || a.mode !== "edit") {
    const visit = openPatientInHome(t, 'new', 'antro');
    if (visit) return visit;
  }
  a=a||{};var quickEncounter=`],
  ["f(!dt){ft.appendChild(rt(A,\"Edytuj w kalkulatorze\",function(){gt(f.patientId)})),vt(),st(",
   "f(!dt){ft.appendChild(rt(A,homePatientRoute()?\"Otwórz przegląd pacjenta\":\"Edytuj w kalkulatorze\",function(){return openPatientInHome(f.patientId,'browse','antro')||gt(f.patientId)})),vt(),st("],
  [`r||!r.isUnlocked())return;
  const o=a||{
  }
  ;
  va`,
   `r||!r.isUnlocked())return;
  if (!n) homeDirectorySession = null;
  const o=a||{
  }
  ;
  va`],
  [`  }
    )
  }
function D(g){
    g.__ext?ln(g.patientId,o,t):se(g.patientId,t,o)
  }
function M(g,B){
    v`,
   `  }
    )
  }
function D(g) {
    if (g.__ext) return ln(g.patientId,o,t);
    return openPatientInHome(g.patientId, 'browse', 'antro') || se(g.patientId,t,o);
  }
function M(g,B){
    v`],
  ["I)]),e(\"div\",{class:\"ve-hint\",text:'Sta\\u0142e warto\\u015Bci d",
   "I)]),e(\"div\",{class:\"ve-hint\",text:homePatientRoute()?\"Wzrost rodziców służy do oceny potencjału genetycznego wzrostu (MPH). Po wybraniu „Rozpocznij nową wizytę” możesz uzupełnić pomiary dziecka w zakładce Analiza.\":'Sta\\u0142e warto\\u015Bci d"],
  ["35c;line-height:1.45;\",html:'\\u{1F4CF} <b>Pomiary dzie",
   "35c;line-height:1.45;\",html:homePatientRoute()?\"Po wybraniu „Rozpocznij nową wizytę” możesz wpisać <b>pomiary dziecka</b> w zakładce Analiza.\":'\\u{1F4CF} <b>Pomiary dzie"],
  ["R)]),e(\"div\",{class:\"ve-hint\",text:'Sta\\u0142e warto\\u015Bci ",
   "R)]),e(\"div\",{class:\"ve-hint\",text:homePatientRoute()?\"Wzrost rodziców służy do oceny potencjału genetycznego wzrostu (MPH). Po wybraniu „Rozpocznij nową wizytę” możesz uzupełnić pomiary dziecka w zakładce Analiza.\":'Sta\\u0142e warto\\u015Bci "],
  [`  catch(_){return false}
}
function patientLoadRun(loa`,
   `  catch(_){return false}
}
// Clinical navigation is available only in the opted-in Gabinet and its shell.
// An existing technical snapshot and an external directory contact retain their native routes.
function homePatientRoute() {
  if (i.__VILDA_HOME_GABINET_PREVIEW__ === true && typeof i.VildaHomeGabinet?.openPatient === 'function')
    return i.VildaHomeGabinet;
  try {
    const shell = i.VildaShell || (i.parent !== i && i.parent.VildaShell);
    if (shell?.hasHomePatientNavigation?.() && typeof shell.openHomePatient === 'function') return shell;
  } catch (_) { /* A standalone page cannot inspect a foreign host. */ }
  return null;
}
function openPatientInHome(patientId, intent, section, focusNoteId) {
  const route = homePatientRoute();
  if (!route) return null;
  const local = route === i.VildaHomeGabinet;
  const nativeRoot = Rt, surface = nativeRoot?.firstElementChild, sentinel = Pa;
  const directory = nativeRoot?.classList?.contains('vilda-auth-database') ? homeDirectorySession : null;
  const ownsSurface = () => !surface || nativeRoot === Rt && Pa === sentinel &&
    (directory ? directory === homeDirectorySession && !!nativeRoot.firstElementChild && nativeRoot.classList.contains('vilda-auth-database')
      : nativeRoot.firstElementChild === surface);
  const vault = jt();
  if (!vault?.isUnlocked()) return Promise.resolve(false);
  const session = vault.captureSyncOperationSession();
  const current = () => {
    try {
      if (vault !== jt() || !vault.isUnlocked()) return false;
      vault.assertSyncOperationSession(session);
      return true;
    } catch (_) { return false; }
  };
  // Cross-pane navigation retires its original overlay itself. On the same
  // page, leave it visible until the draft guard and the selected load succeed.
  let accepted = false;
  const retired = () => nativeRoot === Rt && nativeRoot?.style?.display === 'none' && !nativeRoot.firstElementChild;
  const samePane = () => !i.frameElement || !i.frameElement.hidden && i.frameElement.getAttribute('aria-hidden') !== 'true';
  const options = {
    intent, section, focusNoteId: focusNoteId || null, sourceWindow: i,
    // Applying this confirmed load can retire the native card synchronously.
    // A dismiss or replacement before that point still cancels the selection.
    isCurrent: () => current() && (!local || route === homePatientRoute() && samePane() && (ownsSurface() || accepted && retired())),
    onApply: () => { accepted = true; }
  };
  const navigation = local ? route.openPatient(patientId, options) : route.openHomePatient(patientId, options);
  return Promise.resolve(navigation).then(function (opened) {
    if (opened && surface && current() && ownsSurface()) {
      if (local && directory) {
        try { i.parent?.VildaShell?.claimHomeDirectory?.(i); } catch (_) { /* standalone */ }
      }
      $t({ shellNavigation: true });
    }
    return opened === true;
  }).catch(function (error) { Ot('Gabinet: otwarcie pacjenta', error); return false; });
}
function patientLoadRun(loa`],
];

function replaceHooks(source, reverse) {
  for (const [before, after] of reverse ? pairs.slice().reverse() : pairs) {
    const from = reverse ? after : before;
    if (source.split(from).length !== 2) throw new Error('Missing or ambiguous patient navigation hook: ' + from.slice(0, 64));
    source = source.replace(from, () => reverse ? before : after);
  }
  return source;
}
export const applyPatientNavigationHooks = source => replaceHooks(source, false);
export const reversePatientNavigationHooks = source => replaceHooks(source, true);
