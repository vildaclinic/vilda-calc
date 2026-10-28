import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Readable, reproducible adapter around the legacy session runtime. Dedicated
// UA controls must not inherit values from another patient or reinterpret local
// date strings in the timezone of the device that opens a historical record.
export const uaSessionSource = `/* KLIRENS-UA-SESSION: source tools/patch-klirens-ua-session.mjs */
window.ClcrUaSession = Object.freeze({
  DEFAULTS: Object.freeze({ UA_inputMode: "concentration", UA_concentration: "", UA_concentrationUnit: "mg/dL",
    UA_volume: "", UA_volumeUnit: "mL", UA_reportedValue: "", UA_reportedUnit: "mg/24h", UA_collectionHours: "24" }),
  CONTEXT_IDS: Object.freeze(["age", "ageMonths", "ageDays", "sex", "weight", "height", "newbornContext", "Cl24CollectionProblem",
    ...["collectionStartVoidDiscarded", "collectionFinalVoidIncluded", "collectionNoMissedVoids", "collectionNoSpillage",
      "collectionNoExtraVoids", "collectionStorageFollowed"].flatMap(id => [id, "ui_" + id + "_answer"])]),
});
function prepareUaSession(session) {
  if (!session || typeof session !== "object" || Array.isArray(session)) return session;
  const preserved = session.preservedInputs;
  if (!preserved || typeof preserved !== "object" || Array.isArray(preserved)) return session;
  const formula = session.selectedFormula || session.inputs?.formulaPicker || preserved.formulaPicker;
  if (formula !== "UA_mgkg") return session;
  return { ...session, selectedFormula: formula, preservedInputs: { ...preserved },
    inputs: session.inputs && typeof session.inputs === "object" && !Array.isArray(session.inputs) ? session.inputs : {} };
}
function normalizeUaSessionInputs(session) {
  const isRecord = value => value && typeof value === "object" && !Array.isArray(value);
  const originalInputs = isRecord(session.inputs) ? session.inputs : {};
  const preserved = isRecord(session.preservedInputs) ? session.preservedInputs : {};
  const incoming = { ...preserved, ...originalInputs };
  const has = id => Object.prototype.hasOwnProperty.call(incoming, id);
  const formula = session.selectedFormula || incoming.formulaPicker;
  const selected = formula === "UA_mgkg";
  const ids = Object.keys(window.ClcrUaSession.DEFAULTS);
  const hasUa = ids.some(has);
  window.ClcrUaUi?.ensureControls?.(document);
  const primitive = value => value == null ? "" : typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : "";
  const fields = Object.fromEntries(ids.map(id => [id, has(id) ? primitive(incoming[id]) : window.ClcrUaSession.DEFAULTS[id]]));
  // Legacy values are canonically mg/dL and mL. They seed the new controls only
  // for an explicitly restored UA calculation; other formulas keep their data.
  if (selected && !hasUa) {
    if (has("U_UA")) fields.UA_concentration = primitive(incoming.U_UA);
    if (has("V24")) fields.UA_volume = primitive(incoming.V24);
    const contexts = [incoming, session.context, session.sourceContext, session.collection, session.collectionAnalysis].filter(isRecord)
      .flatMap(context => [context, context.collection, context.collectionAnalysis, context.inputs, context.referenceContext].filter(isRecord));
    let minutes = null;
    for (const context of contexts) {
      for (const key of ["durationMinutes", "collectionMinutes", "recordedDurationMinutes"]) {
        const raw = context[key];
        if (typeof raw !== "number" && typeof raw !== "string") continue;
        const text = String(raw).trim().replace(",", ".");
        if (!/^[+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[+-]?\\d+)?$/i.test(text)) continue;
        const candidate = Number(text);
        if (Number.isFinite(candidate) && candidate > 0) { minutes = candidate; break; }
      }
      if (minutes !== null) break;
    }
    if (minutes !== null) fields.UA_collectionHours = String(minutes / 60);
    else if (has("collectionStartAt") && String(incoming.collectionStartAt ?? "").trim() || has("collectionEndAt") && String(incoming.collectionEndAt ?? "").trim()) {
      // No timezone or resolved duration was captured in the old format. The
      // historical result stays frozen; editing requests an explicit duration.
      fields.UA_collectionHours = "";
    }
  }
  for (const [id, value] of Object.entries(fields)) {
    const control = document.getElementById(id);
    if (control) control.value = value;
  }
  // Protocol facts and dates belong to the incoming collection. Missing facts
  // are unknown, never an old patient's known error or a positive confirmation.
  for (const id of [...window.ClcrUaSession.CONTEXT_IDS.filter(key => !["age", "ageMonths", "ageDays", "sex", "weight", "height", "newbornContext"].includes(key)), "collectionStartAt", "collectionEndAt"]) {
    const control = document.getElementById(id);
    if (!control) continue;
    if (has(id)) {
      if (control.type === "checkbox") control.checked = incoming[id] === true;
      else control.value = primitive(incoming[id]);
    } else if (control.type === "checkbox") control.checked = false;
    else control.value = "";
  }
  const applicable = Object.fromEntries(Object.entries(fields).filter(([id]) => selected || has(id) || document.getElementById(id)));
  const inputs = { ...originalInputs, ...applicable };
  // Preserved-only sessions also restore their own patient and collection
  // context. Existing explicit input values, including blanks, take priority.
  for (const id of [...window.ClcrUaSession.CONTEXT_IDS, "collectionStartAt", "collectionEndAt"]) if (has(id)) inputs[id] = incoming[id];
  session.inputs = inputs;
}
function clearUaInputContext() {
  for (const [id, value] of Object.entries(window.ClcrUaSession.DEFAULTS)) {
    const control = document.getElementById(id);
    if (control) control.value = value;
  }
}
function restoreClearedUaContext(event) {
  if (event?.clcrClearedFormula !== "UA_mgkg") return;
  clearUaInputContext();
  const saved = event?.clcrPreservedUaContext;
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return;
  const values = Object.fromEntries(window.ClcrUaSession.CONTEXT_IDS
    .filter(id => Object.prototype.hasOwnProperty.call(saved, id) &&
      (typeof saved[id] === "string" || typeof saved[id] === "boolean" || typeof saved[id] === "number" && Number.isFinite(saved[id])))
    .map(id => [id, saved[id]]));
  Object.assign(values, window.ClcrUaSession.DEFAULTS);
  const vault = window.__vildaClcrVersionValueVault && typeof window.__vildaClcrVersionValueVault === "object" && !Array.isArray(window.__vildaClcrVersionValueVault)
    ? window.__vildaClcrVersionValueVault : (window.__vildaClcrVersionValueVault = {});
  for (const [id, value] of Object.entries(values)) {
    const control = document.getElementById(id);
    if (control) { if (control.type === "checkbox") control.checked = value === true; else control.value = String(value); }
    vault[id] = value;
  }
  // resetApp rendered before the session listener restored the known mass.
  // Refresh once after every clear listener has finished, so the summary and
  // readiness describe the restored patient context and the empty new sample.
  setTimeout(() => {
    try { window.ClcrUiWorkflow?.refresh?.(); window.clcrUpdate?.(); } catch {}
  }, 0);
}
`;

const replacements = [
  ['function h(){const e=document.getElementById("clcrForm");', 'function h(){try{window.ClcrUaUi?.ensureControls?.(document)}catch{}const e=document.getElementById("clcrForm");'],
  ['return e.readClcrSession();try{', 'return prepareUaSession(e.readClcrSession());try{'],
  ['return t?JSON.parse(t):null}}catch{}return null}function U(e)', 'return t?prepareUaSession(JSON.parse(t)):null}}catch{}return null}function U(e)'],
  ['function E(e,t){const r=t&&typeof t=="object"?t:{},', 'function E(e,t){e=prepareUaSession(e);const r=t&&typeof t=="object"?t:{},'],
  ['normalizeUagSessionInputs(n);const o=document.getElementById("clcrForm");', 'normalizeUagSessionInputs(n);const o=(normalizeUaSessionInputs(n),document.getElementById("clcrForm"));'],
  ['t.addEventListener("click",event=>{try{S()}', 't.addEventListener("click",event=>{clearUaInputContext();try{S()}'],
  ['restoreClearedFehco3Context(event);restoreClearedUagContext(event)}catch{}try{const r=y();', 'restoreClearedFehco3Context(event);restoreClearedUagContext(event)}catch{}restoreClearedUaContext(event);try{const r=y();'],
  ['clearMissingCacrKnownContext(),G(),typeof window.clcrUpdate', 'clearMissingCacrKnownContext(),G(),clearUaInputContext(),typeof window.clcrUpdate'],
];

export function patchUaSessionHooks(source) {
  let result = source;
  const replace = (before, after) => {
    if (result.split(before).length !== 2) throw new Error('Ambiguous UA session anchor: ' + before);
    result = result.replace(before, after);
  };
  if (!result.includes('/* KLIRENS-UA-SESSION:')) {
    replace('(function(){const b="vildaClcrSessionV1";', uaSessionSource + '(function(){const b="vildaClcrSessionV1";');
    for (const [before, after] of replacements) replace(before, after);
  }
  if (result.split(uaSessionSource).length !== 2) throw new Error('UA readable session source differs from the reproducible patch');
  for (const [, after] of replacements) {
    if (result.split(after).length !== 2) throw new Error('Missing or duplicate UA session hook: ' + after);
  }
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = resolve(process.argv[2] || 'inline_kalkulator_klirens_07.js');
  const source = readFileSync(target, 'utf8');
  const next = patchUaSessionHooks(source);
  if (next !== source) writeFileSync(target, next);
}
