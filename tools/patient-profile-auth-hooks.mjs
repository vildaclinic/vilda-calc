// Reproducible optional AuthUI layer. The original editor owns its controls,
// layout and validation; this layer changes only its profile read/write boundary.
const start = 'async function fi(t,a,n,r){';
const end = '/* P-BLOKADA-ZAPISU-WERSJI';
const decorateBefore = 'root:Eo,patientId:t,patientName:w,referenceSex:m.sex,openerId:';
const decorateAfter = 'root:Eo,patientId:t,patientName:w,referenceSex:m.sex,patientRecord:l,openerId:';
export const PATIENT_PROFILE_AUTH_HELPERS = `/* BEGIN HOME PATIENT PROFILE EDIT */
function HomeProfileCopy(value) { return JSON.parse(JSON.stringify(value)); }
function HomeProfileBegin(vault, patientId) {
  if (i.__VILDA_HOME_GABINET_PREVIEW__ !== true) return null;
  var owner = remReadOwner(), session = null, surface = null, selected = null, livePatient = null;
  try {
    selected = i.sessionStorage.getItem('vildaCurrentPatientId');
    livePatient = i._vildaCurrentPatientId || null;
    session = vault.captureSyncOperationSession();
  } catch (_) {}
  return {
    vault: vault, patientId: patientId, profile: null, saving: false,
    watch: function (node) { surface = node; },
    current: function () {
      try {
        if (!session || !remReadCurrent(owner) || vault !== jt() ||
            i.sessionStorage.getItem('vildaCurrentPatientId') !== selected ||
            (i._vildaCurrentPatientId || null) !== livePatient ||
            surface && !surface.isConnected) return false;
        vault.assertSyncOperationSession(session);
        return true;
      } catch (_) { return false; }
    }
  };
}
function HomeProfileRead(context, record) {
  if (!context) return null;
  var profile = record && record.profile;
  context.profile = profile || {status:'incomplete',editable:false,data:null,history:[]};
  context.heads = Array.isArray(context.profile.heads) ? context.profile.heads.slice() : [];
  return context.profile;
}
function HomeProfilePayload(payload, profile) {
  // This is a detached display projection. In particular, birth/assessment,
  // measurement age and every history row remain on the original snapshot.
  var result = HomeProfileCopy(payload || {}), data = profile.data || {};
  function overlay(section, keys) {
    var target = result[section] || {}, source = data[section] || {};
    keys.forEach(function (key) {
      delete target[key];
      if (Object.prototype.hasOwnProperty.call(source,key)) target[key] = HomeProfileCopy(source[key]);
    });
    result[section] = target;
  }
  overlay('user',['firstName','lastName','dobISO','sex']);
  overlay('advanced',['motherHeight','fatherHeight']);
  ['guardian','perinatal','puberty'].forEach(function (key) {
    delete result[key];
    if (Object.prototype.hasOwnProperty.call(data,key)) result[key] = HomeProfileCopy(data[key]);
  });
  overlay('clinical',['downSyndrome']);
  result.name = [data.user && data.user.lastName,data.user && data.user.firstName].filter(Boolean).join(' ');
  return result;
}
function HomeProfileData(context, validated) {
  var result = HomeProfileCopy(context.profile.data || {});
  function patch(section, keys) {
    var target = result[section] || {}, source = validated[section] || {};
    keys.forEach(function (key) {
      delete target[key];
      if (Object.prototype.hasOwnProperty.call(source,key) && source[key] !== '' && source[key] != null)
        target[key] = HomeProfileCopy(source[key]);
    });
    if (Object.keys(target).length) result[section] = target;
    else delete result[section];
  }
  patch('user',['firstName','lastName','dobISO','sex']);
  if (result.user && result.user.sex === 'K') result.user.sex = 'F';
  patch('advanced',['motherHeight','fatherHeight']);
  patch('guardian',['name','phone','email','relation']);
  // Only editable birth fields are patched. SDS/source/catch-up metadata and
  // other supported historical metadata retain their original exact values.
  patch('perinatal',['gestationalWeeks','gestationalDays','birthWeightG','birthLengthCm','birthHeadCircCm','gravidity','parity']);
  patch('puberty',['onsetAgeYears','menarcheAgeYears','heightAtMenarcheCm','boneAgeAtMenarcheYears','gnrhaStatus','gnrhaStartAgeYears','gnrhaStopAgeYears','cdgpDeclared']);
  patch('clinical',['downSyndrome']);
  return result;
}
function HomeProfileHistory(profile) {
  var history = profile && Array.isArray(profile.history) ? profile.history : [];
  if (!history.length) return null;
  var areas = {user:'Dane podstawowe',guardian:'Opiekun / kontakt',advanced:'Wzrost rodziców',
    perinatal:'Dane okołoporodowe',puberty:'Wywiad pokwitaniowy',clinical:'Rozpoznanie'};
  function date(revision) { return revision.updatedAtISO || revision.createdAtISO || ''; }
  var rows = history.slice().sort(function (a,b) {
    return String(date(a)).localeCompare(String(date(b)));
  }).map(function (revision) {
    var label = date(revision) ? Gr4(date(revision)) : 'Data nieznana';
    if (revision.revisionId === profile.revisionId) label += ' · aktualna';
    var parents = Array.isArray(revision.parents) ? revision.parents : [];
    var parent = history.find(function (item) { return parents.indexOf(item.revisionId) >= 0; });
    var previous = parent && parent.data || null, data = revision.data || {};
    var changed = previous ? Object.keys(areas).filter(function (key) {
      return JSON.stringify(previous[key] || null) !== JSON.stringify(data[key] || null);
    }).map(function (key) { return areas[key]; }).join(', ') : parents.length ? 'Zapis kartoteki' : 'Pierwszy zapis kartoteki';
    if (parents.length > 1) changed = 'Rozstrzygnięcie rozbieżności';
    return e('li',{},[e('span',{text:label}),e('span',{text:' — '+(changed || 'Zapis kartoteki')})]);
  }).reverse();
  return e('details',{class:'ve-card','data-patient-profile-history':''},[
    e('summary',{class:'ve-coll-head',text:'Historia zmian kartoteki ('+history.length+')'}),
    e('ul',{class:'vilda-auth-conflict-list'},rows)
  ]);
}
function HomeProfileConflictChoices(context, reload) {
  var profile = context.profile, heads = context.heads;
  if (profile.status !== 'conflict' || typeof context.vault.resolvePatientProfile !== 'function' || heads.length < 2) return null;
  var versions = heads.map(function (id) { return (profile.history || []).find(function (item) { return item.revisionId === id; }); });
  if (versions.some(function (item) { return !item || !item.data; })) return null;
  var fields = {
    'user.lastName':'Nazwisko','user.firstName':'Imię','user.dobISO':'Data urodzenia','user.sex':'Płeć',
    'guardian.name':'Opiekun','guardian.relation':'Relacja opiekuna','guardian.phone':'Telefon','guardian.email':'E-mail',
    'advanced.motherHeight':'Wzrost matki (cm)','advanced.fatherHeight':'Wzrost ojca (cm)',
    'perinatal.gestationalWeeks':'Wiek ciążowy — tygodnie','perinatal.gestationalDays':'Wiek ciążowy — dni',
    'perinatal.birthWeightG':'Masa urodzeniowa (g)','perinatal.birthLengthCm':'Długość urodzeniowa (cm)',
    'perinatal.birthHeadCircCm':'Obwód głowy przy urodzeniu (cm)','perinatal.gravidity':'Która ciąża','perinatal.parity':'Który poród',
    'perinatal.birthWeightSds':'SDS masy urodzeniowej','perinatal.birthLengthSds':'SDS długości urodzeniowej',
    'perinatal.sdsSourceLabel':'Źródło SDS','perinatal.catchUp':'Catch-up',
    'puberty.onsetAgeYears':'Wiek początku dojrzewania (lata)','puberty.menarcheAgeYears':'Wiek menarche (lata)',
    'puberty.heightAtMenarcheCm':'Wzrost przy menarche (cm)','puberty.boneAgeAtMenarcheYears':'Wiek kostny przy menarche (lata)',
    'puberty.gnrhaStatus':'Leczenie GnRHa','puberty.gnrhaStartAgeYears':'Wiek rozpoczęcia GnRHa (lata)',
    'puberty.gnrhaStopAgeYears':'Wiek zakończenia GnRHa (lata)','puberty.cdgpDeclared':'Wywiad CDGP',
    'clinical.downSyndrome':'Zespół Downa'
  };
  function value(data, path) { return path.split('.').reduce(function (item,key) { return item && item[key]; },data); }
  var different = Object.keys(fields).filter(function (key) {
    return versions.some(function (item) { return JSON.stringify(value(item.data,key)) !== JSON.stringify(value(versions[0].data,key)); });
  });
  function text(data,key) {
    var result = value(data,key);
    if (result == null || result === '') return 'Nie podano';
    if (typeof result === 'boolean') return result ? 'Tak' : 'Nie';
    if (key === 'user.sex') return result === 'M' ? 'Chłopiec' : result === 'F' || result === 'K' ? 'Dziewczynka' : String(result);
    return typeof result === 'object' ? JSON.stringify(result) : String(result);
  }
  var error = e('div',{class:'vilda-auth-error',role:'status'});
  var cards = versions.map(function (revision,index) {
    var data = HomeProfileCopy(revision.data), rows = different.map(function (key) {
      return e('li',{},[e('strong',{text:fields[key]+': '}),e('span',{text:text(data,key)})]);
    });
    var label = 'Wersja '+(index+1)+(revision.createdAtISO ? ' · '+Gr4(revision.createdAtISO) : '');
    var choose = e('button',{class:'ve-btn ve-btn-ghost',type:'button',text:'Zachowaj tę wersję kartoteki',
      onclick:function () { return HomeProfileResolve(context,data,error,reload); }});
    return e('section',{class:'ve-card'},[e('h3',{text:label}),
      rows.length ? e('ul',{class:'vilda-auth-conflict-list'},rows) : e('p',{text:'Wartości pól są zgodne.'}),choose]);
  });
  return e('div',{'data-patient-profile-conflict':''},[
    e('p',{class:'ve-note',text:'Porównaj różniące się pola i wybierz pełną wersję kartoteki. Pozostałe wersje zostaną w historii. Wizyty i ich wyniki nie zmienią się.'})
  ].concat(cards,[error]));
}
async function HomeProfileResolve(context, data, errorNode, reload) {
  if (context.saving || !context.current()) return false;
  if (!i.confirm('Zachować wybraną pełną wersję kartoteki? Pozostałe wersje pozostaną w historii. Wizyty i ich wyniki nie zmienią się.') || !context.current()) return false;
  context.saving = true; errorNode.textContent = ''; Kt(true);
  try {
    var receipt = await context.vault.resolvePatientProfile({patientId:context.patientId,
      expectedHeadIds:context.heads.slice(),data:HomeProfileCopy(data)},
      {isCurrent:context.current,onLockWait:Bzw_czekaj(errorNode)});
    if (!context.current()) return false;
    Kt(false); Bzw_koniec(errorNode);
    if (typeof i.CustomEvent === 'function') i.document.dispatchEvent(new i.CustomEvent('vilda:patient-profile-changed',
      {detail:{patientId:context.patientId}}));
    if (context.current()) reload();
    return !!receipt;
  } catch (error) {
    if (!context.current()) return false;
    var committed = error && error.code === 'PATIENT_PROFILE_CONFLICT' && error.committedRevisionId;
    errorNode.textContent = committed
      ? 'Wybrana wersja została zapisana, ale pojawiła się kolejna rozbieżność. Porównaj zapisane wersje ponownie.'
      : 'Nie zapisano rozstrzygnięcia. Kartoteka mogła zmienić się w międzyczasie. Wczytaj aktualne dane i porównaj wersje ponownie.';
    errorNode.appendChild(e('button',{class:'vilda-auth-btn vilda-auth-btn-ghost',type:'button',
      text:'Wczytaj aktualną kartotekę',onclick:function () { if (context.current()) reload(); }}));
    Ot('showPatientEditScreen resolvePatientProfile',error); return false;
  } finally {
    context.saving = false;
    if (context.current()) { Kt(false); Bzw_koniec(errorNode); }
  }
}
function HomeProfileUnavailable(context, back, reload) {
  var profile = context.profile, choices = HomeProfileConflictChoices(context,reload), message = profile.status === 'conflict'
    ? choices ? 'Kartoteka zawiera rozbieżne wersje. Wybierz, która ma obowiązywać.'
      : 'Kartoteka zawiera rozbieżne wersje. Ta wersja aplikacji nie może ich rozstrzygnąć. Edycja pozostaje zablokowana.'
    : profile.status === 'unsupported'
      ? 'Ta kartoteka pochodzi z nowszej wersji aplikacji. Zaktualizuj aplikację przed edycją.'
      : 'Nie można potwierdzić kompletnej kartoteki. Odśwież dane przed edycją.';
  var root = e('div',{class:'vilda-auth-screen vilda-auth-patient-card'},[
    e('h2',{class:'vilda-auth-title',text:'Edycja pacjenta'}),
    e('p',{class:'vilda-auth-error',text:message}),choices,HomeProfileHistory(profile),
    e('button',{class:'vilda-auth-btn vilda-auth-btn-ghost',type:'button',text:'‹ Karta pacjenta',onclick:back})
  ]);
  Zt(root,{noLogo:true}); context.watch(root);
}
async function HomeProfileSave(context, validated, errorNode, reload, finish) {
  if (context.saving || !context.current()) return false;
  if (!context.profile.editable || typeof context.vault.savePatientProfile !== 'function') {
    errorNode.textContent = 'Nie można teraz zapisać kartoteki. Odśwież aplikację i dane pacjenta.';
    return false;
  }
  context.saving = true; errorNode.textContent = ''; Kt(true);
  try {
    var receipt = await context.vault.savePatientProfile({patientId:context.patientId,
      expectedRevisionId:context.profile.revisionId,data:HomeProfileData(context,validated)},
      {isCurrent:context.current,onLockWait:Bzw_czekaj(errorNode)});
    if (!context.current()) return false;
    context.profile = receipt;
    Kt(false); Bzw_koniec(errorNode);
    // Notify metadata consumers only; never load a clinical snapshot, rewrite
    // the live form, recalculate its age or simulate a patient-loaded event.
    if (!receipt.unchanged && typeof i.CustomEvent === 'function')
      i.document.dispatchEvent(new i.CustomEvent('vilda:patient-profile-changed',{detail:{patientId:context.patientId}}));
    if (context.current()) finish();
    return true;
  } catch (error) {
    if (!context.current()) return false;
    var conflict = error && (error.code === 'PATIENT_PROFILE_STALE' || error.code === 'PATIENT_PROFILE_CONFLICT');
    var committed = conflict && error.code === 'PATIENT_PROFILE_CONFLICT' && error.committedRevisionId;
    errorNode.textContent = committed
      ? 'Twoja wersja kartoteki została zapisana obok drugiej wersji. Wczytaj aktualne dane, aby wybrać obowiązującą wersję.'
      : conflict ? 'Nie zapisano. Kartoteka zmieniła się od otwarcia formularza. Wczytaj aktualną wersję i ponownie wprowadź zmiany.'
      : Bzw_blad(error,'Zapisz zmiany','Nie udało się zapisać kartoteki. Wpisane zmiany pozostają w formularzu.');
    if (conflict) errorNode.appendChild(e('button',{class:'vilda-auth-btn vilda-auth-btn-ghost',type:'button',
      text:committed?'Porównaj zapisane wersje':'Wczytaj aktualną kartotekę',onclick:function () { if (context.current()) reload(); }}));
    if (Bzw_usunieta(error)) Bzw_zablokuj(errorNode);
    Ot('showPatientEditScreen savePatientProfile',error);
    return false;
  } finally {
    context.saving = false;
    if (context.current()) { Kt(false); Bzw_koniec(errorNode); }
  }
}
/* END HOME PATIENT PROFILE EDIT */
`;

const pairs = [
  ['if(!o||!o.isUnlocked())return;Zt(', 'if(!o||!o.isUnlocked())return;var Ppf=HomeProfileBegin(o,t);Zt('],
  [']),{noLogo:!0}),Kt(!0);var l=null;try{l=await o.getPatient(t)}', ']),{noLogo:!0}),Kt(!0);if(Ppf)Ppf.watch(Rt.firstElementChild);var l=null;try{l=await o.getPatient(t)}'],
  ['if(Kt(!1),!l||!l.snapshots.length){', 'if(Ppf&&!Ppf.current())return;if(Ppf){HomeProfileRead(Ppf,l);if(!Ppf.profile.editable){Kt(!1);HomeProfileUnavailable(Ppf,function(){se(t,a,n)},function(){fi(t,a,n,!0)});return}}if(Kt(!1),!l||!l.snapshots.length&&!Ppf){'],
  ['var d=l.snapshots[0],c=d.payload||{},s=', 'var d=l.snapshots[0]||{payload:{}},c=Ppf?HomeProfilePayload(d.payload,Ppf.profile):d.payload||{},s='],
  ['var At=Ga4(c);if(!At)return;var Ga5=', 'var At=Ga4(c);if(!At)return;if(Ppf){await HomeProfileSave(Ppf,At,L,function(){fi(t,a,n,!0)},function(){var state=bn();state&&state.screen==="edit"?$n():se(t,a,n)});return}var Ga5='],
  [']),L,e("div",{class:"ve-actions ve-actions-aux"}', ']),Ppf?HomeProfileHistory(Ppf.profile):null,L,e("div",{class:"ve-actions ve-actions-aux"}'],
  ['j(),Zt(Bt,{noLogo:!0})}', 'j(),Zt(Bt,{noLogo:!0});if(Ppf)Ppf.watch(Bt)}'],
];
function once(source, before, after) {
  if (source.split(before).length !== 2) throw new Error('Patient profile AuthUI hook changed: '+before.slice(0,90));
  return source.replace(before,after);
}
function transform(source, reverse) {
  const a=source.indexOf(start), b=source.indexOf(end,a);
  if (a<0||b<0) throw new Error('Patient edit boundaries missing.');
  let form=source.slice(a,b);
  for (const [before,after] of reverse?[...pairs].reverse():pairs) form=once(form,reverse?after:before,reverse?before:after);
  let head=source.slice(0,a);
  const tail=source.slice(b);
  head=once(head,reverse?decorateAfter:decorateBefore,reverse?decorateBefore:decorateAfter);
  return (reverse?once(head,PATIENT_PROFILE_AUTH_HELPERS,''):head+PATIENT_PROFILE_AUTH_HELPERS)+form+tail;
}
export function applyPatientProfileAuthHooks(source) {
  if (source.includes('/* BEGIN HOME PATIENT PROFILE EDIT */')) {
    const base=transform(source,true);
    if (transform(base,false)!==source) throw new Error('Patient profile AuthUI layer does not round-trip.');
    return source;
  }
  return transform(source,false);
}
export function reversePatientProfileAuthHooks(source) { return transform(source,true); }
