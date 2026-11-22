// This layer replays only the optional return path within the native registration
// form. The original patient database actions and the protected clinical editors
// must round-trip byte for byte.
const formStart = 'function ss(t,a,n){';
const formEnd = 'function ds(t,a,n){';
const opener = `// The start screen and patient database share this exact registration form.
function showGabinetNewPatient(options) {
  const vault = jt();
  if (i.__VILDA_HOME_GABINET_PREVIEW__ !== true || i.__VILDA_HOME_WORKSPACE_PREVIEW__ !== true ||
      !isAuthBootReady() || !i.VildaProAccess?.hasAccess() || !vault?.isUnlocked() || !vault.getCurrentUser()?.userId) return false;
  const owner = remReadOwner();
  const origin = i.document.activeElement;
  const trigger = origin && origin.shadowRoot ? origin.shadowRoot.activeElement : origin;
  function current() {
    return remReadCurrent(owner) && i.VildaProAccess?.hasAccess() && !!root && root.isConnected;
  }
  function finish(id) {
    if (!current()) return;
    $t();
    if (id) { if (options?.onPatient) options.onPatient(id); }
    else {
      if (options?.onReturn) options.onReturn();
      if (trigger?.isConnected) trigger.focus({preventScroll:true});
    }
  }
  const root = ss({homeRegistration:{current, finish}}, null, 'base');
  if (!root) return false;
  ia({screen:'home-add-patient'});
  gr(() => finish());
  root.querySelector('input')?.focus({preventScroll:true});
  return true;
}
`;
const exportAnchor = 'showPatientEditScreen:remSearchNewNavigation(fi)';
const exportWithOpener = 'showGabinetNewPatient:remSearchNewNavigation(showGabinetNewPatient),' + exportAnchor;
const pairs = [
  ["const o=t||{};jn();", `const o=t||{},home=o.homeRegistration;
function returnFromForm() { if (home) home.finish(); else patientsReturnToList(a,o); }
function openFromForm(id) { if (home) home.finish(id); else se(id,a,o); }
jn();`],
  ["onclick:function(){patientsReturnToList(a,o)}", "onclick:returnFromForm", 2],
  ["text:\"\\u2039 Pacjenci\",onclick:returnFromForm", "text:home?\"\\u2039 Wróć\":\"\\u2039 Pacjenci\",onclick:returnFromForm"],
  ["dt(),se(et.patientId,a,o)", "dt(),openFromForm(et.patientId)"],
  ["E&&E.patientId?se(E.patientId,a,o):patientsReturnToList(a,o)", "E&&E.patientId?openFromForm(E.patientId):returnFromForm()"],
  [".then(function(){patientsReturnToList(a,o)})", ".then(returnFromForm)"],
  ["function ft(){l===\"base\"?X():lt()}", "function ft(){if(!home||home.current())l===\"base\"?X():lt()}"],
  ["if(Gs_blok)return;", "if(Gs_blok||home&&!home.current())return;", 2],
  ["var Gs_x=null,vt=e", "var Gs_x=null,stopHomeBack=null,vt=e"],
  ["function dt(){Gs_x&&", "function dt(){if(stopHomeBack){stopHomeBack();stopHomeBack=null;i.document.removeEventListener(\"vilda:auth-hidden\",dt)}Gs_x&&"],
  ["Gs_x=Gs_przyBlokadzie(function(){dt(),H.disabled=!1})", "Gs_x=Gs_przyBlokadzie(function(){dt(),H.disabled=!1});if(home){stopHomeBack=gr(function(){dt();H.disabled=!1;H.focus()});i.document.addEventListener(\"vilda:auth-hidden\",dt)}"],
  ["}),Zt(e(\"div\",{class:\"vilda-auth-screen vilda-edit2\"},", "});const formRoot=e(\"div\",{class:\"vilda-auth-screen vilda-edit2\"},"],
  ["]),{noLogo:!0}),L(l)}", "]);Zt(formRoot,{noLogo:!0});L(l);return formRoot}"],
];

function replaceExactly(source, from, to, count = 1) {
  const parts = source.split(from);
  if (parts.length !== count + 1) throw new Error('Native registration hook changed: ' + from.slice(0, 90));
  return parts.join(to);
}
function change(source, reverse) {
  const start = source.indexOf(formStart);
  const end = source.indexOf(formEnd, start);
  if (start < 0 || end < 0) throw new Error('Native registration form boundaries missing.');
  let form = source.slice(start, end);
  for (const [before, after, count] of reverse ? [...pairs].reverse() : pairs) {
    form = replaceExactly(form, reverse ? after : before, reverse ? before : after, count);
  }
  const head = source.slice(0, start);
  const tail = source.slice(end);
  return (reverse ? replaceExactly(head, opener, '') : head + opener) + form
    + replaceExactly(tail, reverse ? exportWithOpener : exportAnchor, reverse ? exportAnchor : exportWithOpener);
}
export const applyRegistrationAuthHooks = source => change(source, false);
export const reverseRegistrationAuthHooks = source => change(source, true);
