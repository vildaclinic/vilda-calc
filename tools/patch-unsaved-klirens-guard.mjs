import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The deployed generic guard is a historical minified artifact. Keep this
// additive calculation warning readable and reproducible; ordinary patient
// save/discard decisions and their persistence remain the existing code.
export const pendingKlirensSource = `
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
`;

export function patchUnsavedKlirensGuard(source) {
  if (source.includes('/* KLIRENS-NIEZAPISANY-POMIAR:')) return source;
  let result = source;
  const replace = (before, after) => {
    if (result.split(before).length !== 2) throw new Error(`Ambiguous unsaved-guard anchor: ${before.slice(0, 90)}`);
    result = result.replace(before, after);
  };
  replace('var b=!1;function I(e)', `${pendingKlirensSource}\nvar b=!1;function I(e)`);
  replace('i=e.reason||"load",s=_();if(S(s)==="proceed")', 'i=e.reason||"load",s=_(),clcrPending=(i==="load"||i==="clear")&&VildaKlirensGuardHasPending();if(S(s)==="proceed"&&!clcrPending)');
  replace('u=N(i,d),y=J(e.patientLabel);P()', 'u=N(i,d),y=J(e.patientLabel);if(clcrPending)u=VildaKlirensGuardCopy(i,k(s),u);var clcrNote=[e.extraNote,clcrPending&&k(s)?VildaKlirensGuardNote(i):""].filter(Boolean).join(" ");P()');
  replace('e.extraNote?n("p",{class:"vug-body vug-note",text:String(e.extraNote)}):null', 'clcrNote?n("p",{class:"vug-body vug-note",text:String(clcrNote)}):null');
  replace('V=n("div",{class:"vug",role:"dialog","aria-modal":"true","aria-label":u.title}', 'V=n("div",{class:"vug"+(clcrPending?" vug--klirens":""),role:"dialog","aria-modal":"true","aria-label":u.title}');
  replace('o.body.appendChild(x);function ee()', 'l.hidden=!u.primary;o.body.appendChild(x);function ee()');
  replace('try{l.focus()}catch{}V.addEventListener', 'try{(l.hidden?g:l).focus()}catch{}V.addEventListener');
  replace('[l,g,c].filter(function(ne){return!ne.disabled})', '[l,g,c].filter(function(ne){return!ne.disabled&&!ne.hidden})');
  replace('var s=e.patientLabel&&String(e.patientLabel).trim()||"",o=n(', 'var clcrPending=VildaKlirensGuardHasPending(),s=e.patientLabel&&String(e.patientLabel).trim()||"",o=n(');
  replace('text:"Wczytaj ponownie"', 'text:clcrPending?"Odrzuć obliczenie i wczytaj ponownie":"Wczytaj ponownie"');
  replace('text:"Anuluj"}),u=n("div",{class:"vug",role:"dialog"', 'text:clcrPending?"Wróć do obliczenia":"Anuluj"}),u=n("div",{class:"vug",role:"dialog"');
  replace('u=n("div",{class:"vug",role:"dialog","aria-modal":"true","aria-label":"Ten pacjent', 'u=n("div",{class:"vug"+(clcrPending?" vug--klirens":""),role:"dialog","aria-modal":"true","aria-label":"Ten pacjent');
  replace('s?n("div",{class:"vug-who"},[n("span",{class:"dot same"})', 'clcrPending?n("p",{class:"vug-body vug-note",text:"Ponowne wczytanie odrzuci niezapisane oznaczenia i wynik Klirensu. Wróć do obliczenia, aby je zachować."}):null,s?n("div",{class:"vug-who"},[n("span",{class:"dot same"})');
  replace('_decide:S,_hasUnsaved:k', '_decide:S,_hasPendingKlirens:VildaKlirensGuardHasPending,_hasUnsaved:k');
  replace('if(e&&e.isTrusted===!1||!k(_()))return;', 'if(e&&e.isTrusted===!1||!k(_())&&!VildaKlirensGuardHasPending())return;');
  // Klirens did not load this guard before the patient-selection fix. Its
  // explicit clear-all action keeps its existing behaviour; patient loading
  // still goes through run(). Do not introduce another calculator question.
  replace('var t=$(e);if(!t)return;if(t.__vugClearBypass)', 'var t=$(e);if(!t)return;if(t.id==="clearBtn"&&p()?.getElementById?.("clcrForm"))return;if(t.__vugClearBypass)');
  return result;
}

export function patchKlirensRestoreReceipt(source) {
  const before = 'const T=document.getElementById("restoreStateBtn");return T&&r.hideRestoreButton&&(T.style.display="none"),!0';
  const after = 'const T=document.getElementById("restoreStateBtn");/* KLIRENS-JAWNE-ODTWORZENIE: preview is not ownership; only an applied restore rebinds the specimen. */if(r.source==="json-restore")window.ClcrVisitSave?.markRestoredPatientCalculation?.();return T&&r.hideRestoreButton&&(T.style.display="none"),!0';
  if (source.includes('/* KLIRENS-JAWNE-ODTWORZENIE:')) return source;
  if (source.split(before).length !== 2) throw new Error('Ambiguous applied Klirens restore anchor');
  return source.replace(before, after);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const target = resolve(process.argv[2] || 'vilda_unsaved_guard.js');
  const source = readFileSync(target, 'utf8');
  const next = patchUnsavedKlirensGuard(source);
  if (source !== next) writeFileSync(target, next);
  const runtime = resolve('inline_kalkulator_klirens_07.js');
  const runtimeSource = readFileSync(runtime, 'utf8');
  const runtimeNext = patchKlirensRestoreReceipt(runtimeSource);
  if (runtimeSource !== runtimeNext) writeFileSync(runtime, runtimeNext);
}
