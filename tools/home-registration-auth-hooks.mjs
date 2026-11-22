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
// Build the inline view from the native registration controls. Their listeners,
// vault operations and session ownership stay with ss, including the duplicate choice.
const inlineOpener = `function homeRegistrationForm(home, controls) {
  const {last, first, male, female, base, external, dob, dobError, year, guardian,
    phone, guardianNote, contact, mother, father, cancel, submit, error} = controls;
  function field(title, input, wide) {
    if (input !== dob && input !== year) input.removeAttribute('placeholder');
    return e('label',{class:'gb-registration-field' + (wide ? ' gb-registration-wide' : '')},[
      e('span',{text:title}),input
    ]);
  }
  function choice(title, buttons, wide) {
    return e('fieldset',{class:'gb-registration-choice' + (wide ? ' gb-registration-wide' : '')},[
      e('legend',{class:'gb-registration-label',text:title}),e('div',{class:'gb-registration-options'},buttons)
    ]);
  }
  function card(title, optional, content, className) {
    const heading = e('h2',{text:title});
    if (optional) heading.appendChild(e('small',{text:'opcjonalnie'}));
    return e('section',{class:'gb-registration-card' + (className ? ' ' + className : '')},[heading,...content]);
  }
  const fields = nodes => e('div',{class:'gb-registration-fields'},nodes);
  const hint = text => e('p',{class:'gb-registration-hint',text});
  const typeHint = hint('');
  const dobHint = hint('Potrzebna do wyliczenia wieku w dniu pomiaru.');
  dobHint.id = 'gb-registration-dob-hint';
  dobError.id = 'gb-registration-dob-error';
  dobError.className = error.className = 'gb-registration-error';
  dobError.setAttribute('aria-live','polite');
  error.setAttribute('role','alert');
  error.removeAttribute('style');
  dob.setAttribute('aria-required','true');
  dob.setAttribute('aria-describedby',dobHint.id + ' ' + dobError.id);
  year.placeholder = 'RRRR';
  phone.type = 'tel';
  contact.maxLength = 200;
  guardianNote.maxLength = 2000;
  guardianNote.rows = contact.rows = 2;
  male.textContent = 'Męska';
  female.textContent = 'Żeńska';
  submit.textContent = 'Dodaj pacjenta';
  submit.className = 'gb-registration-primary';
  cancel.className = '';
  const dobGroup = e('div',{},[field('Pełna data urodzenia',dob),dobHint,dobError]);
  const yearGroup = field('Rok urodzenia · opcjonalnie',year);
  const guardians = fields([field('Imię i nazwisko opiekuna',guardian),field('Telefon',phone),
    field('Notatka opiekuna',guardianNote,true)]);
  const outsideContact = field('Kontakt / uwaga',contact);
  const family = card('Wzrost rodziców',true,[fields([field('Wzrost mamy (cm)',mother),field('Wzrost taty (cm)',father)]),
    hint('Do oceny potencjału genetycznego wzrostu (MPH).')]);
  const form = e('form',{class:'gb-registration-form','aria-label':'Formularz dodawania pacjenta',autocomplete:'off'},[
    e('div',{class:'gb-registration-type-line'},[choice('Rodzaj kartoteki',[base,external]),typeHint]),
    e('div',{class:'gb-registration-grid'},[
      card('Tożsamość',false,[fields([field('Nazwisko',last),field('Imię',first),choice('Płeć',[male,female],true)])]),
      card('Data urodzenia',false,[dobGroup,yearGroup]),
      card('Kontakt / opiekun',true,[guardians,outsideContact],'gb-registration-contact'),family
    ]),error,e('div',{class:'gb-registration-actions'},[cancel,submit])
  ]);
  // A real submit button keeps Enter and assistive-technology submit actions
  // on the same native click path as the pointer.
  submit.type = 'submit';
  submit.addEventListener('click',event => {
    event.preventDefault();
    if (submit.disabled) form.inert = true;
  });
  const busy = new MutationObserver(() => { form.inert = submit.disabled; });
  busy.observe(submit,{attributeFilter:['disabled']});
  home.disconnect = () => busy.disconnect();
  function clearNameError() {
    if (last.hasAttribute('aria-invalid') && (last.value.trim() || first.value.trim())) {
      last.removeAttribute('aria-invalid');
      error.textContent = '';
    }
  }
  first.addEventListener('input',clearNameError);
  last.addEventListener('input',clearNameError);
  form.addEventListener('submit',event => {
    event.preventDefault();
    if (home.current() && !submit.disabled) submit.click();
  });
  home.sync = function(type, sex) {
    const outside = type === 'ext';
    form.dataset.external = String(outside);
    base.setAttribute('aria-pressed',String(!outside));
    external.setAttribute('aria-pressed',String(outside));
    male.setAttribute('aria-pressed',String(sex === 'M'));
    female.setAttribute('aria-pressed',String(sex === 'K'));
    typeHint.textContent = outside ? 'Osoba do umawiania wizyt w Terminarzu.' : 'Pełna kartoteka z pomiarami i siatkami centylowymi.';
    dobGroup.hidden = guardians.hidden = family.hidden = outside;
    yearGroup.hidden = outsideContact.hidden = !outside;
    for (const control of [dob,guardian,phone,guardianNote,mother,father]) control.disabled = outside;
    year.disabled = contact.disabled = !outside;
    dob.setAttribute('aria-invalid',String(!outside && !!dobError.textContent));
  };
  home.host.replaceChildren(form);
  return form;
}
function showGabinetNewPatient(options) {
  const vault = jt(), host = options?.host;
  if (!host?.isConnected || i.__VILDA_HOME_GABINET_PREVIEW__ !== true || i.__VILDA_HOME_WORKSPACE_PREVIEW__ !== true ||
      !isAuthBootReady() || !i.VildaProAccess?.hasAccess() || !vault?.isUnlocked() || !vault.getCurrentUser()?.userId) return false;
  const owner = remReadOwner();
  let root = null, active = true;
  function current() {
    return active && root?.isConnected && remReadCurrent(owner) && i.VildaProAccess?.hasAccess() && (!options.isCurrent || options.isCurrent());
  }
  function finish(id) {
    if (!current()) return;
    if (id) options.onPatient?.(id);
    else options.onReturn?.();
  }
  const home = {current,finish,host};
  root = ss({homeRegistration:home},null,'base');
  if (!root) return false;
  function cleanup() {
    if (!active) return;
    active = false;
    home.disconnect?.();
    home.closeDuplicate?.();
    root.remove();
  }
  cleanup.closeDuplicate = () => !!home.closeDuplicate?.();
  root.querySelector('input')?.focus({preventScroll:true});
  return cleanup;
}
`;
const inlinePairs = [
  [opener, inlineOpener],
  ['H.disabled=!st,W.textContent=', 'if(!home)H.disabled=!st;W.textContent='],
  ['}else H.disabled=!1;N()}function L(st)', '}else if(!home)H.disabled=!1;N()}function L(st)'],
  ['H.addEventListener("click",function(){var st=(u.value', 'H.addEventListener("click",function(){if(home&&(!home.current()||home.closeDuplicate))return;var st=(u.value'],
  ['if(!st&&!rt){Z.textContent="Podaj nazwisko.",u.focus();return}',
   'if(!st&&!rt){if(home)u.setAttribute("aria-invalid","true");Z.textContent=home?"Wpisz nazwisko lub imię pacjenta.":"Podaj nazwisko.";u.focus();return}'],
  ['if(!vt){W.textContent=', 'if(!vt){if(home)w.setAttribute("aria-invalid","true");W.textContent='],
  ['C.textContent=dt.join(" \\xB7 ")}[u,h]', 'C.textContent=dt.join(" \\xB7 ");if(home?.sync)home.sync(l,v)}[u,h]'],
  ['function dt(){if(stopHomeBack)', 'function dt(){if(home)home.closeDuplicate=null;if(stopHomeBack)'],
  ['if(home){stopHomeBack=gr(function(){dt();H.disabled=!1;H.focus()});i.document.addEventListener("vilda:auth-hidden",dt)}',
   'if(home){vt.setAttribute("role","dialog");vt.setAttribute("aria-modal","true");vt.setAttribute("aria-label","Ten pacjent może już być w bazie");home.closeDuplicate=function(){dt();H.disabled=false;if(home.current()){H.form.inert=false;H.focus()}return true};vt.querySelector("button:last-child")?.focus()}'],
  ['function q(et){et.key==="Escape"&&(dt(),H.disabled=!1)}vt.addEventListener',
   `function q(et){
  if(et.key==="Escape"){if(home){et.preventDefault();et.stopImmediatePropagation();home.closeDuplicate?.()}else{dt();H.disabled=!1}}
  else if(home&&et.key==="Tab"){
    const buttons=vt.querySelectorAll("button:enabled");
    const first=buttons[0],last=buttons[buttons.length-1],focus=i.document.activeElement;
    if(!vt.contains(focus)||et.shiftKey&&focus===first||!et.shiftKey&&focus===last){
      et.preventDefault();(et.shiftKey?last:first)?.focus();
    }
  }
}vt.addEventListener`],
  ['et.target===vt&&(dt(),H.disabled=!1)', 'if(et.target===vt){if(home)home.closeDuplicate?.();else{dt();H.disabled=!1}}'],
  ['text:"Anuluj",style:"flex:0 0 auto;",onclick:function(){dt(),H.disabled=!1}', 'text:"Anuluj",style:"flex:0 0 auto;",onclick:function(){if(home)home.closeDuplicate?.();else{dt();H.disabled=!1}}'],
  ['});const formRoot=e("div",{class:"vilda-auth-screen vilda-edit2"}',
   '});if(home){const inline=homeRegistrationForm(home,{last:u,first:h,male:m,female:y,base:ut,external:wt,dob:w,dobError:W,year:F,guardian:D,phone:M,guardianNote:S,contact:b,mother:z,father:I,cancel:V,submit:H,error:Z});L(l);return inline}const formRoot=e("div",{class:"vilda-auth-screen vilda-edit2"}'],
];
function changeInline(source, reverse) {
  const end = source.indexOf(formEnd);
  const start = source.indexOf(reverse ? inlineOpener : opener);
  if (start < 0 || end < start) throw new Error('Inline registration hook boundaries missing.');
  let part = source.slice(start, end);
  for (const [before, after] of reverse ? [...inlinePairs].reverse() : inlinePairs) {
    part = replaceExactly(part, reverse ? after : before, reverse ? before : after);
  }
  return source.slice(0, start) + part + source.slice(end);
}
export function applyRegistrationAuthHooks(source, inline = true) {
  const native = change(source, false);
  return inline ? changeInline(native, false) : native;
}
export function reverseRegistrationAuthHooks(source) {
  return change(source.includes('function homeRegistrationForm(') ? changeInline(source, true) : source, true);
}
