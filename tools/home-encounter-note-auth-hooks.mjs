// A note retains its independent sample/event date and immutable source visit.
// Other native editors keep their existing timeline choices.
const pairs = [
  ['const n=!!(t&&t.note&&t.note.id),r=t&&t.note||{};',
   `const n=!!(t&&t.note&&t.note.id),r=t&&t.note||{};
const EncounterEditor = i.__VILDA_HOME_GABINET_PREVIEW__ === true && i.VildaHomePatient?.isInlineOpen?.();
const EncounterBinding = EncounterEditor && !n && t?.patientId ? i.VildaHomeEncounter?.captureBinding(t.patientId) : null;
if(EncounterEditor && !n && !EncounterBinding && i.VildaHomeEncounter?.state(t?.patientId).mode !== 'browse'){
  i.alert("Poczekaj na zakończenie operacji wizyty i ponownie otwórz formularz.");return;
}
const EncounterOrigin = EncounterEditor && (n ? r.visitContext : EncounterBinding?.visitContext);
let EncounterNoteId = null;
function EncounterEditorCurrent() {
  return !!(EncounterBinding && EncounterBinding.isCurrent() && d.isConnected && (!t.isCurrent || t.isCurrent()));
}
`],
  ['Ee(),c.appendChild(pt);const Ie=',
   `Ee(),c.appendChild(pt);
if(EncounterOrigin) {
  var encounterCaption=e("div",{text:"Wizyta z "+EncounterOrigin.clinicalDateISO.split("-").reverse().join(".")});
  var encounterDate=e("label",{},["Data badania lub zdarzenia (opcjonalnie)",ce]);
  pt.replaceChildren(encounterCaption,encounterDate);
  ce.style.display="block";
}
const Ie=`],
  ['if(Xt.checked&&!(ce.value||"").trim())', 'if(!EncounterOrigin&&Xt.checked&&!(ce.value||"").trim())'],
  ['if(Xt.checked&&ce.max&&(ce.value||"")>ce.max)', 'if((EncounterOrigin||Xt.checked)&&ce.max&&(ce.value||"")>ce.max)'],
  ['var Gc3=await a.savePatientNote(Vt);',
   `var Gc3;
if(EncounterOrigin){
  Vt.linkedAgeMonths=n ? r.linkedAgeMonths : null;
  Vt.clinicalDateISO=ce.value||null;
}
if(EncounterBinding){
  if(!EncounterEditorCurrent() || !await EncounterBinding.ensureRecorded() || !EncounterEditorCurrent()){
    Gd3("Nie udało się potwierdzić wizyty. Wpis nie został zapisany.");return;
  }
  EncounterNoteId ||= "visit-note-"+Array.from(i.crypto.getRandomValues(new Uint8Array(16)),byte=>byte.toString(16).padStart(2,"0")).join("");
  Vt.id=EncounterNoteId;Vt.visitContext=EncounterBinding.visitContext;
  Gc3=await a.savePatientNoteOnce(Vt,{isCurrent:EncounterEditorCurrent});
  if(!Gc3?.saved){Gd3("Nie zapisano wpisu do wizyty. Sprawdź stan kartoteki i spróbuj ponownie.");return;}
}else Gc3=await a.savePatientNote(Vt);`]
];
const listPairs = [
  ['function s(S){return S.linkedAgeMonths==null&&!S.clinicalDateISO}', 'function s(S){return S.linkedAgeMonths==null&&!S.clinicalDateISO&&!S.visitContext}'],
  ['var M=S.clinicalDateISO||S.updatedAtISO||"",b=D.clinicalDateISO||D.updatedAtISO||"";', 'var M=S.clinicalDateISO||S.visitContext?.clinicalDateISO||S.updatedAtISO||"",b=D.clinicalDateISO||D.visitContext?.clinicalDateISO||D.updatedAtISO||"";']
];
function transform(source, reverse, pairs) {
  for (const [before, after] of reverse ? pairs.slice().reverse() : pairs) {
    const from = reverse ? after : before;
    if (source.split(from).length !== 2) throw new Error('Missing or ambiguous native encounter editor hook: ' + before.slice(0, 50));
    source = source.replace(from, () => reverse ? before : after);
  }
  return source;
}
export const applyEncounterNoteEditorHooks = source => transform(source,false,pairs);
export const reverseEncounterNoteEditorHooks = source => transform(source,true,pairs);
export const applyEncounterNoteAuthHooks = source => transform(applyEncounterNoteEditorHooks(source),false,listPairs);
export const reverseEncounterNoteAuthHooks = source => reverseEncounterNoteEditorHooks(transform(source,true,listPairs));
