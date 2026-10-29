// Reproducible narrow hook into the retained auth artifact. The presentation
// lives in readable clcr_notes_view.js; ordinary note/reminder paths are intact.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'vilda_auth_ui.js');
let source = fs.readFileSync(target, 'utf8');
const marker = '// KLIRENS-NOTES-VIEW: lazy frozen-record presentation, never raw storage text.';
const helper = `
${marker}
var ClcrNotesBootstrapPromise = null;
function ClcrNotesResources() {
  if (i.ClcrRecordResources) return Promise.resolve(i.ClcrRecordResources);
  if (ClcrNotesBootstrapPromise) return ClcrNotesBootstrapPromise;
  ClcrNotesBootstrapPromise = new Promise(function (resolve, reject) {
    var doc = i.document, finished = false, timer = null;
    var url = new URL("clcr_record_resources.js?v=6", i.location.href);
    var script = Array.from(doc.querySelectorAll("script[src]")).find(function (node) {
      try { return new URL(node.getAttribute("src"), i.location.href).href === url.href; } catch (_) { return false; }
    });
    var existing = !!script;
    if (!script) script = doc.createElement("script");
    function done(error) {
      if (finished) return; finished = true;
      if (timer) i.clearTimeout(timer);
      if (error || !i.ClcrRecordResources) {
        if (script.parentNode) script.parentNode.removeChild(script);
        reject(error || new Error("Nie można odczytać zapisanych obliczeń."));
      } else resolve(i.ClcrRecordResources);
    }
    script.addEventListener("load", function () { done(); });
    script.addEventListener("error", function () { done(new Error("Nie można odczytać zapisanych obliczeń.")); });
    timer = i.setTimeout(function () { done(new Error("Nie można odczytać zapisanych obliczeń.")); }, 15000);
    if (!existing) { script.src = url.href; (doc.head || doc.documentElement).appendChild(script); }
  });
  ClcrNotesBootstrapPromise.catch(function () { ClcrNotesBootstrapPromise = null; });
  return ClcrNotesBootstrapPromise;
}
function ClcrNotesTitle(note) {
  if (i.ClcrNotesView) return i.ClcrNotesView.title(note);
  var lab = note && note.labResult || {}, label = lab.test || note.title || "Wynik obliczenia";
  var value = lab.value == null ? "" : String(lab.value).replace(".", ",");
  return label + (value ? ": " + value + (lab.unit && !value.endsWith(lab.unit) ? " " + lab.unit : "") : "");
}
function ClcrOpenNoteResult(note, patientId, vault, onChanged, anchor) {
  var card = anchor && anchor.closest ? anchor.closest(".vilda-auth-patient-card") : null;
  function alive() {
    return (!card || card.isConnected) && (!anchor || anchor.isConnected) &&
      (!vault || typeof vault.isUnlocked !== "function" || vault.isUnlocked());
  }
  return ClcrNotesResources().then(function (resources) { return resources.ensureNotes(); }).then(function (view) {
    if (!alive()) return null;
    return view.openDetails({ note: note, patientId: patientId, vault: vault, anchor: anchor, alive: alive,
      onChanged: function () { if (alive() && typeof onChanged === "function") onChanged(); } });
  });
}
function ClcrNotesCard(note, patientId, vault, onChanged) {
  var host = e("div", { class: "vilda-patient-note-card vilda-clcr-note", "data-note-id": note.id || "",
    "data-clcr-note-state": "loading", style: "background:#fff;border:1px solid #d1e3e6;border-radius:16px;padding:18px;min-width:0;" });
  function alive() { return host.isConnected && (!vault || typeof vault.isUnlocked !== "function" || vault.isUnlocked()); }
  function load() {
    host.textContent = "Wczytywanie zapisanego wyniku…";
    ClcrNotesResources().then(function (resources) { return resources.ensureNotes(); }).then(function (view) {
      if (!alive()) return;
      host.removeAttribute("style");
      view.render(host, { note: note, patientId: patientId, vault: vault,
        onChanged: function () { if (alive() && typeof onChanged === "function") onChanged(); },
        openBadania: function () {
          var card = host.closest(".vilda-auth-patient-card"), tab = card && card.querySelector('button[data-tab="lab"]');
          if (tab) tab.click();
        } });
    }).catch(function () {
      if (!alive()) return;
      host.setAttribute("data-clcr-note-state", "unavailable");
      host.textContent = "Nie udało się odczytać zapisanego wyniku. ";
      host.appendChild(e("button", { type: "button", class: "vilda-auth-btn vilda-auth-btn-small", text: "Spróbuj ponownie", onclick: load }));
    });
  }
  load();
  return host;
}
`;

const originalTitle = 'function Jo(t){try{';
const patchedTitle = 'function Jo(t){if(t&&t.category==="wynik-klirens")return ClcrNotesTitle(t);try{';
const originalCard = 'function h(S){const D=Me[S.category]||Me.observation';
const patchedCard = 'function h(S){if(S&&S.category==="wynik-klirens")return ClcrNotesCard(S,a,r,n);const D=Me[S.category]||Me.observation';
const originalEditor = 'function ga(t){const a=jt();';
const patchedEditor = 'function ga(t){if(t&&t.note&&t.note.category==="wynik-klirens"){ClcrOpenNoteResult(t.note,t.patientId||t.note.patientId,jt(),t.onSaved,i.document.activeElement).catch(function(){try{i.alert("Nie udało się otworzyć szczegółów pomiaru. Spróbuj ponownie.")}catch{}});return}const a=jt();';

function once(before, after) {
  if (source.includes(after)) return;
  if (source.split(before).length !== 2) throw new Error('Auth source hook is ambiguous or changed: ' + before.slice(0, 70));
  source = source.replace(before, after);
}
if (!source.includes(marker)) {
  if (source.split(originalTitle).length !== 2) throw new Error('Could not locate the stable note title boundary.');
  source = source.replace(originalTitle, helper + originalTitle);
}
once(originalTitle, patchedTitle);
once(originalCard, patchedCard);
once(originalEditor, patchedEditor);
fs.writeFileSync(target, source);
