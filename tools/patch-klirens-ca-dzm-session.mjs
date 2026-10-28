import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Reproducible calcium session adapter. Existing audited session hooks remain byte-for-byte intact.
export const caDzmSessionSource = `/* KLIRENS-CA-DZM-SESSION: source tools/patch-klirens-ca-dzm-session.mjs */
window.ClcrCaDzmSession = Object.freeze({
  DEFAULTS: Object.freeze({ CA_inputMode: "concentration", CA_concentration: "", CA_concentrationUnit: "mmol/L",
    CA_volume: "", CA_volumeUnit: "mL", CA_reportedValue: "", CA_reportedUnit: "mg/24h", CA_collectionHours: "24", CA_clinicalMode: "general" }),
  CONTEXT_IDS: Object.freeze(["age", "ageMonths", "ageDays", "sex", "weight", "height", "newbornContext", "CA_clinicalMode", "Cl24CollectionProblem",
    ...["collectionStartVoidDiscarded", "collectionFinalVoidIncluded", "collectionNoMissedVoids", "collectionNoSpillage",
      "collectionNoExtraVoids", "collectionStorageFollowed"].flatMap(id => [id, "ui_" + id + "_answer"])]),
});
function normalizeCaDzmSessionInputs(session) {
  const isRecord = value => value && typeof value === "object" && !Array.isArray(value);
  const originalInputs = isRecord(session.inputs) ? session.inputs : {};
  const preserved = isRecord(session.preservedInputs) ? session.preservedInputs : {};
  const incoming = { ...preserved, ...originalInputs };
  const has = id => Object.prototype.hasOwnProperty.call(incoming, id);
  const formula = session.selectedFormula || incoming.formulaPicker;
  const selected = formula === "Ca_mgkg";
  if (selected) session.selectedFormula = formula;
  const ids = Object.keys(window.ClcrCaDzmSession.DEFAULTS);
  const hasCa = ids.some(has);
  window.ClcrCaDzmUi?.ensureControls?.(document);
  const primitive = value => value == null ? "" : typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : "";
  const fields = Object.fromEntries(ids.map(id => [id, has(id) ? primitive(incoming[id]) : window.ClcrCaDzmSession.DEFAULTS[id]]));
  // Legacy calcium values are canonically mmol/L and mL. They seed the new controls only
  // for an explicitly restored calcium calculation; other formulas keep their data.
  if (selected && !hasCa) {
    if (has("U_Ca")) fields.CA_concentration = primitive(incoming.U_Ca);
    if (has("V24")) fields.CA_volume = primitive(incoming.V24);
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
    if (minutes !== null) fields.CA_collectionHours = String(minutes / 60);
    else if (has("collectionStartAt") && String(incoming.collectionStartAt ?? "").trim() || has("collectionEndAt") && String(incoming.collectionEndAt ?? "").trim()) {
      // No timezone or resolved duration was captured in the old format. The
      // historical result stays frozen; editing requests an explicit duration.
      fields.CA_collectionHours = "";
    }
  }
  for (const [id, value] of Object.entries(fields)) {
    const control = document.getElementById(id);
    if (control) control.value = value;
  }
  // Protocol facts and dates belong to the incoming collection. Missing facts
  // are unknown, never an old patient's known error or a positive confirmation.
  for (const id of [...window.ClcrCaDzmSession.CONTEXT_IDS.filter(key => !["age", "ageMonths", "ageDays", "sex", "weight", "height", "newbornContext", "CA_clinicalMode"].includes(key)), "collectionStartAt", "collectionEndAt"]) {
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
  for (const id of [...window.ClcrCaDzmSession.CONTEXT_IDS, "collectionStartAt", "collectionEndAt"]) if (has(id)) inputs[id] = incoming[id];
  session.inputs = inputs;
}
function clearCaDzmInputContext() {
  for (const [id, value] of Object.entries(window.ClcrCaDzmSession.DEFAULTS)) {
    const control = document.getElementById(id);
    if (control) control.value = value;
  }
}
function restoreClearedCaDzmContext(event) {
  if (event?.clcrClearedFormula !== "Ca_mgkg") return;
  clearCaDzmInputContext();
  const saved = event?.clcrPreservedCaDzmContext;
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return;
  const values = Object.fromEntries(window.ClcrCaDzmSession.CONTEXT_IDS
    .filter(id => Object.prototype.hasOwnProperty.call(saved, id) &&
      (typeof saved[id] === "string" || typeof saved[id] === "boolean" || typeof saved[id] === "number" && Number.isFinite(saved[id])))
    .map(id => [id, saved[id]]));
  Object.assign(values, window.ClcrCaDzmSession.DEFAULTS);
  if (["general", "hypo", "phpt"].includes(saved.CA_clinicalMode)) values.CA_clinicalMode = saved.CA_clinicalMode;
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
  ['e.selectedFormula==="CitCr_spot"||e.preservedInputs.formulaPicker==="CitCr_spot"', 'e.selectedFormula==="Ca_mgkg"||e.preservedInputs.formulaPicker==="Ca_mgkg"||e.selectedFormula==="CitCr_spot"||e.preservedInputs.formulaPicker==="CitCr_spot"'],
  ['const o=(normalizeUaSessionInputs(n),document.getElementById("clcrForm"));if(!o)', 'const o=(normalizeUaSessionInputs(n),document.getElementById("clcrForm"));normalizeCaDzmSessionInputs(n);if(!o)'],
  ['restoreClearedUaContext(event);try{const r=y();', 'restoreClearedUaContext(event);try{const r=y();restoreClearedCaDzmContext(event);'],
  ['catch{}}),e}function D(){', 'catch{}}),clearCaDzmInputContext(),e}function D(){'],
];
export function patchCaDzmSessionHooks(source) {
  let result = source;
  const replace = (before, after) => {
    if (result.split(before).length !== 2) throw new Error('Ambiguous calcium session anchor: ' + before);
    result = result.replace(before, after);
  };
  if (!result.includes('/* KLIRENS-CA-DZM-SESSION:')) {
    replace('(function(){const b="vildaClcrSessionV1";', caDzmSessionSource + '(function(){const b="vildaClcrSessionV1";');
    for (const [before, after] of replacements) replace(before, after);
  }
  if (result.split(caDzmSessionSource).length !== 2) throw new Error('Calcium session source differs from the reproducible patch');
  for (const [, after] of replacements) if (result.split(after).length !== 2) throw new Error('Missing or duplicate calcium session hook: ' + after);
  return result;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = resolve(process.argv[2] || 'inline_kalkulator_klirens_07.js');
  const source = readFileSync(target, 'utf8'), next = patchCaDzmSessionHooks(source);
  if (next !== source) writeFileSync(target, next);
}
