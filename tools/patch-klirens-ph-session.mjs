import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Reproducible additions to the legacy session runtime. An incoming session
// owns its measured pH; a previous patient's value cannot complete it.
export const phSessionSource = `/* KLIRENS-PH-SESSION: source tools/patch-klirens-ph-session.mjs */
window.ClcrPhSession = Object.freeze({
  CONTEXT_IDS: Object.freeze([
    "age", "ageMonths", "ageDays", "sex", "weight", "height", "newbornContext",
    "creatinineState", "spotSampleKind", "FENa_sample_status", "Ucr_spot_unit", "Scr_spot_unit",
    "U_PO4_spot_unit", "S_PO4_spot_unit", "tmpBurosumab", "tmpDaysSinceDose",
    ...["spotMenstruation", "spotHematuria", "spotInfection", "spotExercise", "spotAcuteIllness",
      "spotSameSpecimen", "spotPairedChemistry", "spotDiureticUse", "spotKnownCKD", "suspectedAKI",
      "tmpPairedSameTime", "tmpOvernightFasting", "spotBicarbonateLoad", "spotNagmaContext",
      "stoneSpotFasting", "stonePhPersistent", "stoneUtiExcluded"].flatMap(id => [id, "ui_" + id + "_answer"]),
  ]),
});
function preparePhSession(session) {
  if (!session || typeof session !== "object" || Array.isArray(session)) return session;
  const preserved = session.preservedInputs;
  if (!preserved || typeof preserved !== "object" || Array.isArray(preserved)) return session;
  const formula = session.selectedFormula || session.inputs?.formulaPicker || preserved.formulaPicker;
  if (formula !== "pH_spot") return session;
  return { ...session, selectedFormula: formula, inputs: session.inputs && typeof session.inputs === "object" && !Array.isArray(session.inputs) ? session.inputs : {} };
}
function normalizePhSessionInputs(session) {
  const input = { ...(session.preservedInputs || {}), ...session.inputs };
  const control = document.getElementById("U_pH");
  const has = Object.prototype.hasOwnProperty.call(input, "U_pH");
  // Preserve zero, exact entered decimals and explicit blanks. Validation
  // belongs to the pH engine; restoring must never clamp or round a value.
  const value = input.U_pH ?? "";
  if (control) control.value = value;
  if (has || control) session.inputs = { ...session.inputs, U_pH: value };
}
function clearPhInputContext() {
  const control = document.getElementById("U_pH");
  if (control) control.value = "";
}
function restoreClearedPhContext(event) {
  const saved = event?.clcrPreservedPhContext;
  if (event?.clcrClearedFormula !== "pH_spot" || !saved || typeof saved !== "object" || Array.isArray(saved)) return;
  // Removing optional pH questions does not delete known facts from other
  // formulas. Restore only the agreed context whitelist, never arbitrary keys.
  const values = Object.fromEntries(window.ClcrPhSession.CONTEXT_IDS
    .filter(id => Object.prototype.hasOwnProperty.call(saved, id) &&
      (typeof saved[id] === "string" || typeof saved[id] === "boolean" || typeof saved[id] === "number" && Number.isFinite(saved[id])))
    .map(id => [id, saved[id]]));
  values.U_pH = "";
  const vault = window.__vildaClcrVersionValueVault && typeof window.__vildaClcrVersionValueVault === "object" && !Array.isArray(window.__vildaClcrVersionValueVault)
    ? window.__vildaClcrVersionValueVault : (window.__vildaClcrVersionValueVault = {});
  for (const [id, value] of Object.entries(values)) {
    const control = document.getElementById(id);
    if (control) { if (control.type === "checkbox") control.checked = value === true; else control.value = String(value); }
    vault[id] = value;
  }
}
`;

const replacements = [
  ['n=U(e);if(!n)return!1;normalizeCrCysConfirmation(n);', 'n=U(preparePhSession(e));if(!n)return!1;normalizePhSessionInputs(n);normalizeCrCysConfirmation(n);'],
  ['const e=x();if(U(e))return E(e,', 'const e=x();if(U(preparePhSession(e)))return E(e,'],
  ['try{clearCl24InputContext();clearAcrInputContext();', 'try{clearPhInputContext();clearCl24InputContext();clearAcrInputContext();'],
  ['if(clearCrCysConfirmation(),clearCl24InputContext(),', 'if(clearCrCysConfirmation(),clearPhInputContext(),clearCl24InputContext(),'],
  ['clearMissingCacrKnownContext();restoreClearedFeclContext(event);', 'clearMissingCacrKnownContext();restoreClearedPhContext(event);restoreClearedFeclContext(event);'],
];

export function patchPhSessionHooks(source) {
  let result = source;
  const replace = (before, after) => {
    if (result.split(before).length !== 2) throw new Error('Ambiguous pH session anchor: ' + before);
    result = result.replace(before, after);
  };
  if (!result.includes('/* KLIRENS-PH-SESSION:')) {
    replace('(function(){const b="vildaClcrSessionV1";', phSessionSource + '(function(){const b="vildaClcrSessionV1";');
    for (const [before, after] of replacements) replace(before, after);
  }
  if (result.split(phSessionSource).length !== 2) throw new Error('pH readable session source differs from the reproducible patch');
  for (const [, after] of replacements) {
    if (result.split(after).length !== 2) throw new Error('Missing or duplicate pH session hook: ' + after);
  }
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = resolve(process.argv[2] || 'inline_kalkulator_klirens_07.js');
  const source = readFileSync(target, 'utf8');
  const next = patchPhSessionHooks(source);
  if (next !== source) writeFileSync(target, next);
}
