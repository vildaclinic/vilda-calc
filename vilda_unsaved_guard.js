(function(f){"use strict";var j="vug-css",H=8e3,R=[".vug-backdrop{position:fixed;inset:0;z-index:2147483001;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;padding:24px 14px;overflow:auto;-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px)}",'.vug{width:100%;max-width:430px;background:#fff;border-radius:16px;box-shadow:0 24px 60px rgba(0,20,24,.42);overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#1a2b30;padding:22px 22px 18px}',".vug-head{display:flex;gap:13px;align-items:flex-start;margin-bottom:12px}",".vug-ic{flex:0 0 44px;width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:22px}",".vug-ic.dirty{background:#fef3e2;color:#b45309}",".vug-ic.newp{background:#f3ecfe;color:#6d28d9}",".vug-kicker{font-size:11.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase}",".vug-kicker.dirty{color:#b45309}.vug-kicker.newp{color:#6d28d9}",".vug-ttl{font-size:17px;font-weight:700;color:#0f2b33;line-height:1.2;margin:2px 0 3px}",".vug-body{font-size:14px;color:#3f5a5c;line-height:1.55;margin:0 0 6px}",".vug-who{display:inline-flex;align-items:center;gap:7px;background:#f5fafb;border:1px solid #e2eef0;border-radius:9px;padding:6px 10px;margin:8px 0 2px;font-size:13.5px}",".vug-who b{color:#1a2b30;font-weight:700}",".vug-who .dot{width:8px;height:8px;border-radius:50%}",".vug-who .dot.dirty{background:#f59e0b}.vug-who .dot.newp{background:#a855f7}",".vug-ic.same{background:#e0f4f5;color:#00747e}",".vug-kicker.same{color:#00747e}",".vug-who .dot.same{background:#00838d}",".vug-note{color:#b45309;font-weight:600}",".vug-err{margin-top:10px;font-size:12.5px;color:#b91c1c;background:#fdecec;border:1px solid #f1c4c4;border-radius:9px;padding:8px 10px;display:none}",".vug-err.show{display:block}",".vug-actions{display:flex;flex-direction:column;gap:9px;margin-top:16px}",".vug-btn{display:flex;align-items:center;justify-content:center;gap:8px;border-radius:11px;padding:11px 14px;font-size:14px;font-weight:600;cursor:pointer;border:1.5px solid transparent;line-height:1;font-family:inherit}",".vug-btn:disabled{opacity:.6;cursor:default}",".vug-backdrop .vug-btn{border-radius:11px !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important}",".vug-backdrop .vug-btn.vug-primary{background:#00838d !important;color:#fff !important;border:1.5px solid #00838d !important;box-shadow:0 6px 16px rgba(0,131,141,.28) !important}",".vug-backdrop .vug-btn.vug-primary:hover:not(:disabled){background:#0b6e77 !important;border-color:#0b6e77 !important}",".vug-backdrop .vug-btn.vug-danger{background:#fff !important;color:#b91c1c !important;border:1.5px solid #f1c4c4 !important;box-shadow:none !important}",".vug-backdrop .vug-btn.vug-danger:hover:not(:disabled){background:#fdf4f4 !important}",".vug-backdrop .vug-btn.vug-ghost{background:#fff !important;color:#3f5a5c !important;border:1.5px solid #dbe6e8 !important;box-shadow:none !important}",".vug-backdrop .vug-btn.vug-ghost:hover:not(:disabled){background:#f5fafb !important}","@media(max-width:520px),(pointer:coarse) and (max-width:1366px){.vug-backdrop{align-items:stretch;padding:0;bottom:var(--vilda-dock-occ,calc(env(safe-area-inset-bottom,0px) + max(var(--vilda-shell-dock-h,0px),var(--mobile-dock-visible-lift,0px))))}.vug{max-width:none;min-height:100%;border-radius:0;box-shadow:none;display:flex;flex-direction:column;justify-content:center;padding-top:calc(22px + env(safe-area-inset-top,0px))}}"].join("");function p(){return f.document}function L(){return f.VildaSaveStatusIndicator||null}function _(){var e=L();try{return e&&typeof e.getState=="function"?e.getState():null}catch{return null}}function k(e){return e==="dirty"||e==="new_patient"}function S(e){return k(e)?"prompt":"proceed"}function N(e,t){var a=e==="clear",i=a?"wyczy\u015B\u0107":"wczytaj",s=a?"wyczyszczeniem":"wczytaniem";return t?{variant:"newp",kicker:"Nowy pacjent \u2014 niezapisany",title:"Zapisa\u0107 wpisane dane przed "+s+"?",body:a?"Wpisane dane nie s\u0105 jeszcze zapisane jako karta pacjenta. Wyczyszczenie p\xF3l je usunie.":"Wpisane dane nie s\u0105 jeszcze zapisane jako karta pacjenta. Wczytanie innego pacjenta je usunie.",primary:"Zapisz nowego i "+i,discard:"Odrzu\u0107 dane i "+i,cancel:"Anuluj"}:{variant:"dirty",kicker:"Niezapisane zmiany",title:"Zapisa\u0107 zmiany przed "+s+"?",body:a?"Bie\u017C\u0105cy pacjent ma zmiany, kt\xF3rych nie zapisano jako now\u0105 wersj\u0119 w karcie. Wyczyszczenie p\xF3l je usunie.":"Bie\u017C\u0105cy pacjent ma zmiany, kt\xF3rych nie zapisano jako now\u0105 wersj\u0119 w karcie. Je\u015Bli wczytasz innego pacjenta teraz, te zmiany przepadn\u0105.",primary:"Zapisz i "+i,discard:"Odrzu\u0107 zmiany i "+i,cancel:"Anuluj"}}function G(){var e=p();if(!e)return!0;for(var t=["lastName","firstName","name"],a=0;a<t.length;a++){var i=e.getElementById(t[a]);if(i&&typeof i.value=="string"&&i.value.trim()!=="")return!0}return!1}function Y(){var e=p();if(e){var t=e.getElementById("lastName")||e.getElementById("name")||e.getElementById("firstName");if(t&&typeof t.focus=="function")try{t.focus(),t.select&&t.select()}catch{}}}function J(e){if(e&&String(e).trim())return String(e).trim();var t=L();try{var a=t&&typeof t.getLastPatientName=="function"?t.getLastPatientName():"";if(a&&String(a).trim())return String(a).trim()}catch{}var i=p();if(i){var s=((i.getElementById("lastName")||{}).value||"").trim(),o=((i.getElementById("firstName")||{}).value||"").trim(),d=(s+" "+o).trim();if(d)return d}return""}var v=null,E=!1;function B(){if(!E){var e=f.VildaVault;e&&typeof e.onPatientSaved=="function"&&(e.onPatientSaved(function(){if(v){var t=v;v=null;try{clearTimeout(t.timer)}catch{}try{t.proceed()}catch{}}}),E=!0)}}function q(){var e=p();if(!e)return!1;var t=e.getElementById("saveDataBtnSidebar");if(t&&typeof t.click=="function")try{return t.click(),!0}catch{}return!1}function Q(e,t){if(B(),!E){t("Nie mo\u017Cna potwierdzi\u0107 zapisu (brak po\u0142\u0105czenia z magazynem). Zapisz r\u0119cznie i spr\xF3buj ponownie.");return}if(v){try{clearTimeout(v.timer)}catch{}v=null}var a=f.setTimeout(function(){v=null,t("Nie uda\u0142o si\u0119 potwierdzi\u0107 zapisu w wyznaczonym czasie. Sprawd\u017A dane i spr\xF3buj ponownie.")},H);if(v={proceed:e,timer:a},!q()){try{clearTimeout(a)}catch{}v=null,t("Nie znaleziono przycisku zapisu. Zapisz r\u0119cznie i spr\xF3buj ponownie.")}}function n(e,t,a){var i=p(),s=i.createElement(e);if(t){for(var o in t)if(Object.prototype.hasOwnProperty.call(t,o)){var d=t[o];o==="class"?s.className=d:o==="text"?s.textContent=d:o.slice(0,2)==="on"&&typeof d=="function"?s.addEventListener(o.slice(2).toLowerCase(),d):d!=null&&s.setAttribute(o,d)}}return a!=null&&(Array.isArray(a)?a:[a]).forEach(function(u){u!=null&&s.appendChild(typeof u=="string"?i.createTextNode(u):u)}),s}function P(){var e=p();if(!(!e||e.getElementById(j))){var t=e.createElement("style");t.id=j,t.textContent=R,e.head.appendChild(t)}}
/* KLIRENS-NIEZAPISANY-POMIAR: loading a patient replaces the specimen too.
 * Inspect only the current document and same-origin panels of this shell.
 * No clinical values or patient data leave their owning document.
 */
R += ".vug--klirens .vug-btn{min-height:48px;font-size:16px;line-height:1.4;white-space:normal}.vug--klirens .vug-btn[hidden]{display:none!important}";
function VildaKlirensGuardHasPending() {
  var root = f, windows = [f], seen = [];
  try {
    if (f.parent && f.parent !== f && f.parent.VildaShell &&
        f.parent.VildaShell.protokolPanelu >= 1) root = f.parent;
  } catch (_) { /* isolated parent: the local guard still applies */ }
  if (root !== f) windows.push(root);
  for (var index = 0; index < windows.length && index < 32; index += 1) {
    var current = windows[index];
    if (!current || seen.indexOf(current) !== -1) continue;
    seen.push(current);
    try {
      var api = current.ClcrVisitSave;
      if (api && typeof api.hasUnsavedMeasurement === "function" &&
          api.hasUnsavedMeasurement()) return true;
      if (root.VildaShell && root.VildaShell.protokolPanelu >= 1) {
        for (var child = 0; current.frames && child < current.frames.length; child += 1) {
          windows.push(current.frames[child]);
        }
      }
    } catch (_) { /* cross-origin/unloaded panel has no accessible calculation */ }
  }
  return false;
}
function VildaKlirensGuardCopy(reason, mainDirty, original) {
  var clear = reason === "clear", copy = Object.assign({}, original);
  copy.cancel = "Wróć do obliczenia";
  if (!mainDirty) {
    return {
      variant: "dirty", kicker: "Niezapisane obliczenie Klirensu",
      title: "Odrzucić obliczenie Klirensu?",
      body: clear
        ? "Wyczyszczenie formularza odrzuci niezapisane oznaczenia i wynik Klirensu. Wróć do obliczenia, aby je zachować."
        : "Wczytanie pacjenta odrzuci niezapisane oznaczenia i wynik Klirensu. Wróć do obliczenia, aby je zachować.",
      primary: "", discard: clear ? "Odrzuć obliczenie i wyczyść" : "Odrzuć obliczenie i wczytaj",
      cancel: copy.cancel
    };
  }
  copy.primary = clear ? "Zapisz dane pacjenta i wyczyść" : "Zapisz dane pacjenta i wczytaj";
  copy.discard = clear ? "Odrzuć dane i obliczenie, wyczyść" : "Odrzuć dane i obliczenie, wczytaj";
  return copy;
}
function VildaKlirensGuardNote(reason) {
  return "Zapis danych pacjenta nie zapisuje wyniku Klirensu w Badaniach. " +
    (reason === "clear" ? "Wyczyszczenie" : "Wczytanie") +
    " odrzuci obliczenie także po zapisie danych pacjenta. Wróć do obliczenia, aby je zachować.";
}

var b=!1;
/* Destructive actions inspect the current form. Reading this decision never
 * flushes autosave, publishes a new saved reference, or waits for debounce. */
function VildaGuardCurrentDecision() {
  var indicator = L();
  if (!indicator || typeof indicator.getCurrentDecision !== "function")
    return { ready: true, state: _(), legacy: true };
  try {
    var decision = indicator.getCurrentDecision();
    return { ready: !!(decision && decision.ready === true), state: decision && decision.state,
      scope: decision && decision.scope, indicator: indicator, legacy: false };
  } catch (_) { return { ready: false, legacy: false }; }
}
function VildaGuardDecisionCurrent(decision, receipt) {
  if (decision.legacy) return true;
  if (!decision.ready || L() !== decision.indicator) return false;
  try {
    return receipt
      ? typeof decision.indicator.isCurrentDecisionAfterSave === "function" &&
        decision.indicator.isCurrentDecisionAfterSave(decision.scope, receipt) === true
      : typeof decision.indicator.isCurrentDecision === "function" &&
        decision.indicator.isCurrentDecision(decision.scope) === true;
  } catch (_) { return false; }
}
function VildaGuardDecisionOwner(decision) {
  if (decision.legacy) return true;
  try {
    return decision.ready && L() === decision.indicator &&
      typeof decision.indicator.isCurrentDecisionOwner === "function" &&
      decision.indicator.isCurrentDecisionOwner(decision.scope) === true;
  } catch (_) { return false; }
}
function VildaGuardUnavailable(changed) {
  try {
    if (typeof f.alert === "function") f.alert(changed
      ? "Formularz zmienił się. Wykonaj tę czynność ponownie."
      : "Trwa przygotowanie lub zapis danych. Spróbuj ponownie za chwilę.");
  } catch (_) { /* The action remains cancelled if a notification is unavailable. */ }
}
function I(options) { return VildaGuardRunDecision(options, VildaGuardCurrentDecision()); }
function VildaGuardRunDecision(options, decision) {
  options = options || {};
  var proceed = typeof options.onProceed === "function" ? options.onProceed : function () {};
  var cancel = typeof options.onCancel === "function" ? options.onCancel : function () {};
  if (!decision.ready || !VildaGuardDecisionCurrent(decision)) {
    cancel(); VildaGuardUnavailable(decision.ready); return;
  }
  var reason = options.reason || "load", state = decision.state;
  var clcrPending = (reason === "load" || reason === "clear") && VildaKlirensGuardHasPending();
  if (S(state) === "proceed" && !clcrPending) { proceed(); return; }
  if (decision.legacy) B();
  var doc = p();
  if (!doc || !doc.body) { proceed(); return; }
  if (b) return;
  var isNew = state === "new_patient", copy = N(reason, isNew), patient = J(options.patientLabel);
  if (clcrPending) copy = VildaKlirensGuardCopy(reason, k(state), copy);
  var note = [options.extraNote, clcrPending && k(state) ? VildaKlirensGuardNote(reason) : ""].filter(Boolean).join(" ");
  P(); b = true;
  var error = n("div", { class: "vug-err", role: "alert" });
  var save = n("button", { class: "vug-btn vug-primary", type: "button", text: copy.primary });
  var discard = n("button", { class: "vug-btn vug-danger", type: "button", text: copy.discard });
  var back = n("button", { class: "vug-btn vug-ghost", type: "button", text: copy.cancel });
  var who = isNew
    ? n("div", { class: "vug-who" }, [n("span", { class: "dot newp" }), n("span", {}, [n("span", { text: "W formularzu: " }), n("b", { text: "nowy pacjent (bez karty)" })])])
    : patient ? n("div", { class: "vug-who" }, [n("span", { class: "dot dirty" }), n("span", {}, [n("span", { text: "Otwarty: " }), n("b", { text: patient })])]) : null;
  var dialog = n("div", { class: "vug" + (clcrPending ? " vug--klirens" : ""), role: "dialog", "aria-modal": "true", "aria-label": copy.title }, [
    n("div", { class: "vug-head" }, [n("div", { class: "vug-ic " + copy.variant, "aria-hidden": "true", text: isNew ? "＋" : "✎" }),
      n("div", {}, [n("div", { class: "vug-kicker " + copy.variant, text: copy.kicker }), n("div", { class: "vug-ttl", text: copy.title })])]),
    n("p", { class: "vug-body", text: copy.body }), note ? n("p", { class: "vug-body vug-note", text: String(note) }) : null,
    who, error, n("div", { class: "vug-actions" }, [save, discard, back])
  ]);
  var backdrop = n("div", { class: "vug-backdrop" }, dialog), pending = null, closed = false;
  save.hidden = !copy.primary; doc.body.appendChild(backdrop);
  function releaseRequest(request) {
    f.clearTimeout(request.timer);
    if (request.restoreListener) {
      doc.removeEventListener("vilda:dob-restored", request.restoreListener);
      request.restoreListener = null;
    }
  }
  function close() {
    if (closed) return;
    closed = true; b = false;
    if (pending) { releaseRequest(pending); pending = null; }
    try { if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop); } catch (_) {}
    try { doc.removeEventListener("keydown", escape, true); } catch (_) {}
  }
  function finish(callback) { close(); if (typeof callback === "function") try { callback(); } catch (_) {} }
  function stale() { finish(cancel); VildaGuardUnavailable(true); }
  function showError(message) { error.textContent = message; error.className = "vug-err show"; }
  function saving(value) { save.disabled = value; discard.disabled = value; back.disabled = value; save.textContent = value ? "Zapisywanie…" : copy.primary; }
  function startOwnSave() {
    var api = f.VildaDataImportExport;
    if (!api || typeof api.saveUserDataWithReceipt !== "function") {
      saving(false); showError("Nie udało się uruchomić zapisu. Odśwież aplikację i spróbuj ponownie."); return;
    }
    var request = { timer: null, receipt: null, restoreListener: null }; pending = request;
    function active() { return !closed && pending === request; }
    request.timer = f.setTimeout(function () {
      if (!settled()) return;
      if (request.receipt) { finish(cancel); VildaGuardUnavailable(false); return; }
      if (!VildaGuardDecisionOwner(decision)) { stale(); return; }
      saving(false);
      showError("Nie udało się potwierdzić zapisu w wyznaczonym czasie. Sprawdź dane i spróbuj ponownie.");
    }, H);
    function settled() {
      if (!active()) return false;
      releaseRequest(request); pending = null; return true;
    }
    function continueAfterSave() {
      if (!active()) return;
      try {
        var dob = f.VildaDobAge;
        if (dob && typeof dob.restorePending === "function" && dob.restorePending()) {
          if (!request.restoreListener) {
            request.restoreListener = continueAfterSave;
            doc.addEventListener("vilda:dob-restored", request.restoreListener);
            // The existing boundary may have settled just before registration.
            // Recheck its counter; an event alone never authorizes the replay.
            continueAfterSave();
          }
          return;
        }
      } catch (_) {
        if (settled()) { finish(cancel); VildaGuardUnavailable(false); }
        return;
      }
      if (!settled()) return;
      if (!VildaGuardDecisionCurrent(decision, request.receipt)) { stale(); return; }
      finish(proceed);
    }
    var promise;
    try { promise = api.saveUserDataWithReceipt({ showTooltip: typeof f.showTooltip === "function" ? f.showTooltip : null }); }
    catch (failure) {
      if (settled()) {
        if (!VildaGuardDecisionOwner(decision)) { stale(); return; }
        saving(false); showError(failure && failure.message || "Nie udało się zapisać danych. Spróbuj ponownie.");
      }
      return;
    }
    Promise.resolve(promise).then(function (receipt) {
      if (!active()) return;
      if (!receipt || receipt.saved !== true || typeof receipt.patientId !== "string" || !receipt.patientId) {
        if (!settled()) return;
        if (!VildaGuardDecisionOwner(decision)) { stale(); return; }
        saving(false); showError("Nie potwierdzono zapisu danych. Sprawdź formularz i spróbuj ponownie."); return;
      }
      request.receipt = receipt;
      continueAfterSave();
    }, function (failure) {
      if (settled()) {
        if (!VildaGuardDecisionOwner(decision)) { stale(); return; }
        saving(false); showError(failure && failure.message || "Nie udało się zapisać danych. Spróbuj ponownie.");
      }
    });
  }
  save.addEventListener("click", function () {
    if (save.disabled) return;
    if (!VildaGuardDecisionCurrent(decision)) { stale(); return; }
    if (isNew && !G()) { finish(null); Y(); return; }
    error.className = "vug-err"; saving(true);
    if (decision.legacy) Q(function () { finish(proceed); }, function (message) { saving(false); showError(message); });
    else startOwnSave();
  });
  discard.addEventListener("click", function () {
    if (discard.disabled) return;
    if (!VildaGuardDecisionCurrent(decision)) { stale(); return; }
    finish(proceed);
  });
  back.addEventListener("click", function () { if (!back.disabled) finish(cancel); });
  function escape(event) { if (event && event.key === "Escape") { event.stopPropagation(); if (!back.disabled) finish(cancel); } }
  doc.addEventListener("keydown", escape, true);
  backdrop.addEventListener("click", function (event) { if (event.target === backdrop && !back.disabled) finish(cancel); });
  try { (save.hidden ? discard : save).focus(); } catch (_) {}
  dialog.addEventListener("keydown", function (event) {
    if (event.key !== "Tab") return;
    var buttons = [save, discard, back].filter(function (button) { return !button.disabled && !button.hidden; });
    if (!buttons.length) return;
    var first = buttons[0], last = buttons[buttons.length - 1], active = doc.activeElement;
    if (event.shiftKey && active === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
  });
}
function X(e){e=e||{};var t=typeof e.onProceed=="function"?e.onProceed:function(){},a=typeof e.onCancel=="function"?e.onCancel:function(){},i=p();if(!i||!i.body){t();return}if(b)return;P(),b=!0;var clcrPending=VildaKlirensGuardHasPending(),s=e.patientLabel&&String(e.patientLabel).trim()||"",o=n("button",{class:"vug-btn vug-primary",type:"button",text:clcrPending?"Odrzuć obliczenie i wczytaj ponownie":"Wczytaj ponownie"}),d=n("button",{class:"vug-btn vug-ghost",type:"button",text:clcrPending?"Wróć do obliczenia":"Anuluj"}),u=n("div",{class:"vug"+(clcrPending?" vug--klirens":""),role:"dialog","aria-modal":"true","aria-label":"Ten pacjent jest ju\u017C wczytany"},[n("div",{class:"vug-head"},[n("div",{class:"vug-ic same","aria-hidden":"true",text:"\u2139"}),n("div",{},[n("div",{class:"vug-kicker same",text:"Pacjent ju\u017C wczytany"}),n("div",{class:"vug-ttl",text:"Ten pacjent jest ju\u017C wczytany"})])]),n("p",{class:"vug-body",text:"Wybrany pacjent jest ju\u017C wczytany w tej karcie. Ponowne wczytanie przywr\xF3ci ostatni zapis z karty pacjenta (np. zmiany zapisane w innej karcie)."}),clcrPending?n("p",{class:"vug-body vug-note",text:"Ponowne wczytanie odrzuci niezapisane oznaczenia i wynik Klirensu. Wróć do obliczenia, aby je zachować."}):null,s?n("div",{class:"vug-who"},[n("span",{class:"dot same"}),n("span",{},[n("span",{text:"Pacjent: "}),n("b",{text:s})])]):null,n("div",{class:"vug-actions"},[o,d])]),y=n("div",{class:"vug-backdrop"},u);i.body.appendChild(y);function m(){b=!1;try{y.parentNode&&y.parentNode.removeChild(y)}catch{}try{i.removeEventListener("keydown",g,!0)}catch{}}function l(c){if(m(),typeof c=="function")try{c()}catch{}}o.addEventListener("click",function(){l(t)}),d.addEventListener("click",function(){l(a)});function g(c){c&&c.key==="Escape"&&(c.stopPropagation(),l(a))}i.addEventListener("keydown",g,!0),y.addEventListener("click",function(c){c.target===y&&l(a)});try{d.focus()}catch{}}function $(e){var t=e&&e.target;if(!t)return null;if(typeof t.closest=="function")try{return t.closest("#clearAllDataBtn, #clearBtn")}catch{return null}var a=t.id;return a==="clearAllDataBtn"||a==="clearBtn"?t:null}function T(event) {
  try {
    var button = $(event);
    if (!button) return;
    if (button.id === "clearBtn" && p()?.getElementById?.("clcrForm")) return;
    if (button.__vugClearBypass) { button.__vugClearBypass = false; return; }
    if (event && event.isTrusted === false) return;
    var decision = VildaGuardCurrentDecision();
    if (decision.ready && !k(decision.state) && !VildaKlirensGuardHasPending()) return;
    if (typeof event.preventDefault === "function") event.preventDefault();
    if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
    if (!decision.ready) { VildaGuardUnavailable(false); return; }
    VildaGuardRunDecision({ reason: "clear", onProceed: function () {
      try { button.__vugClearBypass = true; button.click(); } catch (_) {}
    } }, decision);
  } catch (_) { /* A failed interception cannot authorize a destructive replay. */ }
}function D(e){try{/* P-POWLOKA-OBCY (2026-10-06): dokument nieaktualny (inna ramka powloki wczytala innego pacjenta) nie zapisze juz zmian, a powloka przeladowuje go przy pokazaniu - natywne okno "Opuscic strone?" zatrzymaloby panel na "Ladowanie". Rejestr: docs/clinical/ALGORITHMS.md, P-POWLOKA-OBCY. */var Gq5v=f.VildaPanelPacjent;if(Gq5v&&typeof Gq5v.nieaktualny=="function"&&Gq5v.nieaktualny())return}catch{}try{if(k(_()))return e&&typeof e.preventDefault=="function"&&e.preventDefault(),e&&(e.returnValue=""),""}catch{}}var A=!1;function C(){if(!A){var e=p();if(!(!e||typeof e.addEventListener!="function")){A=!0,e.addEventListener("click",T,!0);try{typeof f.addEventListener=="function"&&f.addEventListener("beforeunload",D)}catch{}}}}try{var z=p();z&&typeof z.addEventListener=="function"&&(z.readyState==="loading"?z.addEventListener("DOMContentLoaded",C,{once:!0}):C())}catch{}var W={run:I,confirmSamePatientReload:X,STYLE_ID:j,install:C,_decide:S,_hasPendingKlirens:VildaKlirensGuardHasPending,_hasUnsaved:k,_copy:N,_onClearCaptureClick:T,_onBeforeUnload:D};try{f&&(f.VildaUnsavedGuard=W)}catch{}typeof module<"u"&&module.exports&&(module.exports=W)})(typeof window<"u"?window:typeof globalThis<"u"?globalThis:this);
