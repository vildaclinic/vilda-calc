import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Reproducible additions to the legacy session runtime. Incoming sessions are
// replacements: an older patient cannot supply phosphate or treatment timing.
// Existing shared FE normalizers continue to own creatinine and specimen facts.
export const tmpGfrSessionSource = `/* KLIRENS-TMP-GFR-SESSION: source tools/patch-klirens-tmp-session.mjs */
function prepareTmpGfrSession(session) {
  const preserved = session.preservedInputs;
  if (!preserved || typeof preserved !== "object" || Array.isArray(preserved)) return session;
  const formula = session.selectedFormula || session.inputs?.formulaPicker || preserved.formulaPicker;
  if (formula !== "TMP_GFR") return session;
  return { ...session, selectedFormula: formula, inputs: session.inputs && typeof session.inputs === "object" ? session.inputs : {} };
}
function normalizeTmpGfrSessionInputs(session) {
  const input = { ...(session.preservedInputs || {}), ...session.inputs };
  const has = key => Object.prototype.hasOwnProperty.call(input, key);
  const fields = {
    U_PO4_spot: input.U_PO4_spot ?? "",
    S_PO4_spot: input.S_PO4_spot ?? "",
    tmpBurosumab: input.tmpBurosumab === true,
    tmpDaysSinceDose: typeof input.tmpDaysSinceDose === "string" || typeof input.tmpDaysSinceDose === "number" ? input.tmpDaysSinceDose : "",
  };
  for (const id of ["U_PO4_spot_unit", "S_PO4_spot_unit"]) {
    const unit = typeof input[id] === "string" ? input[id].trim().toLowerCase() : "";
    fields[id] = !has(id) ? "mg/dl" : unit === "mg/dl" ? "mg/dl" : unit === "mmol/l" ? "mmol/L" : "";
  }
  // These fields remain historical facts, not mandatory new questions.
  for (const id of ["tmpPairedSameTime", "tmpOvernightFasting"]) {
    const key = "ui_" + id + "_answer";
    fields[id] = input[id] === true;
    fields[key] = ["yes", "no", "unknown"].includes(input[key]) ? input[key] : "";
    if (["yes", "no", "unknown"].includes(input[key])) { fields[id] = fields[key] === "yes"; }
  }
  if ((session.selectedFormula || input.formulaPicker) === "TMP_GFR") {
    for (const id of ["Ucr_spot_unit", "Scr_spot_unit"]) {
      if (!has(id)) continue;
      const unit = typeof input[id] === "string" ? input[id].trim().replace(/[µμ]/g, "u").toLowerCase() : "";
      fields[id] = unit === "mg/dl" ? "mg/dl" : ["umol", "umol/l"].includes(unit) ? "umol" : ["mmol", "mmol/l"].includes(unit) ? "mmol/L" : "";
    }
  }
  // Preserved-only sessions carry their historical patient context too.
  for (const id of ["age", "ageMonths", "ageDays", "sex"]) if (has(id)) fields[id] = input[id];
  const applicable = Object.fromEntries(Object.entries(fields).filter(([id]) => has(id) || document.getElementById(id)));
  for (const [id, value] of Object.entries(applicable)) {
    const control = document.getElementById(id);
    if (control) { if (control.type === "checkbox") control.checked = value; else control.value = value; }
  }
  session.inputs = { ...session.inputs, ...applicable };
}
function clearTmpGfrInputContext() {
  const defaults = { U_PO4_spot: "", S_PO4_spot: "", U_PO4_spot_unit: "mg/dl", S_PO4_spot_unit: "mg/dl", tmpBurosumab: false, tmpDaysSinceDose: "",
    tmpPairedSameTime: false, ui_tmpPairedSameTime_answer: "", tmpOvernightFasting: false, ui_tmpOvernightFasting_answer: "" };
  for (const [id, value] of Object.entries(defaults)) {
    const control = document.getElementById(id);
    if (control) { if (control.type === "checkbox") control.checked = value; else control.value = value; }
  }
}
function restoreClearedTmpGfrContext(event) {
  const saved = event?.clcrPreservedTmpGfrContext;
  if (event?.clcrClearedFormula !== "TMP_GFR" || !saved || typeof saved !== "object" || Array.isArray(saved)) return;
  const keys = ["age", "ageMonths", "ageDays", "sex", "Ucr_spot_unit", "Scr_spot_unit", "U_PO4_spot_unit", "S_PO4_spot_unit", "creatinineState", "tmpBurosumab"];
  for (const id of ["spotDiureticUse", "spotKnownCKD", "suspectedAKI", "spotBicarbonateLoad"]) keys.push(id, "ui_" + id + "_answer");
  const values = Object.fromEntries(keys.filter(id => Object.prototype.hasOwnProperty.call(saved, id) && ["string", "boolean", "number"].includes(typeof saved[id])).map(id => [id, saved[id]]));
  // Clear starts a new paired blood/urine sample. Neither old confirmations
  // nor known mismatches or the prior dose interval describe the new sample.
  Object.assign(values, { U_PO4_spot: "", S_PO4_spot: "", Ucr_spot: "", Scr_spot: "", tmpDaysSinceDose: "",
    FENa_sample_status: "", spotSampleKind: "", spotSameSpecimen: false, ui_spotSameSpecimen_answer: "",
    spotPairedChemistry: false, ui_spotPairedChemistry_answer: "", tmpPairedSameTime: false, ui_tmpPairedSameTime_answer: "",
    tmpOvernightFasting: false, ui_tmpOvernightFasting_answer: "" });
  const vault = window.__vildaClcrVersionValueVault && typeof window.__vildaClcrVersionValueVault === "object" ? window.__vildaClcrVersionValueVault : (window.__vildaClcrVersionValueVault = {});
  for (const [id, value] of Object.entries(values)) {
    const control = document.getElementById(id);
    if (control) { if (control.type === "checkbox") control.checked = value === true; else control.value = String(value); }
    vault[id] = value;
  }
}
`;

const replacements = [
  ['function U(e){if(!e||typeof e!="object")return null;const t=e.inputs', 'function U(e){if(!e||typeof e!="object")return null;e=prepareTmpGfrSession(e);const t=e.inputs'],
  ['normalizeCitcrSessionInputs(n);normalizeFeclSessionInputs(n);', 'normalizeCitcrSessionInputs(n);normalizeTmpGfrSessionInputs(n);normalizeFeclSessionInputs(n);'],
  ['clearFekInputContext();clearFeclInputContext();', 'clearFekInputContext();clearTmpGfrInputContext();clearFeclInputContext();'],
  ['clearFekInputContext(),clearFeclInputContext(),', 'clearFekInputContext(),clearTmpGfrInputContext(),clearFeclInputContext(),'],
  ['restoreClearedFeclContext(event);restoreClearedFehco3Context(event);', 'restoreClearedFeclContext(event);restoreClearedTmpGfrContext(event);restoreClearedFehco3Context(event);'],
];

export function patchTmpGfrSessionHooks(source) {
  let result = source;
  const replace = (before, after) => {
    if (result.split(before).length !== 2) throw new Error('Ambiguous TmP/GFR session anchor: ' + before);
    result = result.replace(before, after);
  };
  if (!result.includes('/* KLIRENS-TMP-GFR-SESSION:')) {
    replace('(function(){const b="vildaClcrSessionV1";', tmpGfrSessionSource + '(function(){const b="vildaClcrSessionV1";');
    for (const [before, after] of replacements) replace(before, after);
  }
  if (result.split(tmpGfrSessionSource).length !== 2) throw new Error('TmP/GFR readable session source differs from the reproducible patch');
  for (const [, after] of replacements) {
    if (result.split(after).length !== 2) throw new Error('Missing or duplicate TmP/GFR session hook: ' + after);
  }
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = resolve(process.argv[2] || 'inline_kalkulator_klirens_07.js');
  const source = readFileSync(target, 'utf8');
  const next = patchTmpGfrSessionHooks(source);
  if (next !== source) writeFileSync(target, next);
}
