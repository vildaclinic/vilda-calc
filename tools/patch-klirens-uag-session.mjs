import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Reproducible, narrow additions to the historical minified session runtime.
// Shared Na/K/Cl and clinical facts already have replacement semantics in
// the FE normalizers. UAG adds the independent NAGMA fact, never a default.
export const uagSessionSource = `/* KLIRENS-UAG-SESSION: source tools/patch-klirens-uag-session.mjs */
function normalizeUagSessionInputs(session) {
  const input = { ...(session.preservedInputs || {}), ...session.inputs };
  const has = key => Object.prototype.hasOwnProperty.call(input, key);
  const flag = "spotNagmaContext", answer = "ui_spotNagmaContext_answer";
  const fields = {
    [flag]: input[flag] === true,
    [answer]: ["yes", "no", "unknown"].includes(input[answer]) ? input[answer] : "",
  };
  if (["yes", "no", "unknown"].includes(input[answer])) fields[flag] = fields[answer] === "yes";
  // This path replaces a session, including another formula followed by UAG.
  // A preceding patient's NAGMA must never complete that incoming sample.
  for (const [id, value] of Object.entries(fields)) {
    const control = document.getElementById(id);
    if (control) { if (control.type === "checkbox") control.checked = value; else control.value = value; }
  }
  session.inputs = { ...session.inputs, ...Object.fromEntries(Object.entries(fields).filter(([id]) => has(id) || document.getElementById(id))) };
}
function clearUagInputContext() {
  const defaults = { U_Na_spot: "", U_K_spot: "", U_Cl_spot: "", spotNagmaContext: false, ui_spotNagmaContext_answer: "" };
  for (const [id, value] of Object.entries(defaults)) {
    const control = document.getElementById(id);
    if (control) { if (control.type === "checkbox") control.checked = value; else control.value = value; }
  }
}
function restoreClearedUagContext(event) {
  const saved = event?.clcrPreservedUagContext;
  if (event?.clcrClearedFormula !== "AGu_spot" || !saved || typeof saved !== "object" || Array.isArray(saved)) return;
  const keys = ["age", "ageMonths", "ageDays", "Ucr_spot_unit", "Scr_spot_unit", "creatinineState"];
  for (const id of ["spotDiureticUse", "spotKnownCKD", "suspectedAKI", "spotNagmaContext", "tmpOvernightFasting", "spotBicarbonateLoad"]) keys.push(id, "ui_" + id + "_answer");
  const values = Object.fromEntries(keys.filter(id => Object.prototype.hasOwnProperty.call(saved, id) && ["string", "boolean", "number"].includes(typeof saved[id])).map(id => [id, saved[id]]));
  // Clear starts a new urine sample. Neither old mismatches nor confirmations
  // describe it. A known blood timing problem remains independent evidence:
  // it does not block urine-only UAG, but still matters after switching to FE.
  const bloodProblem = saved.FENa_sample_status === "different-time" || saved.ui_spotPairedChemistry_answer === "no" && saved.FENa_sample_status !== "different-urine";
  Object.assign(values, {
    U_Na_spot: "", U_K_spot: "", U_Cl_spot: "", spotSampleKind: "",
    spotSameSpecimen: false, ui_spotSameSpecimen_answer: "",
    spotPairedChemistry: false, ui_spotPairedChemistry_answer: bloodProblem ? "no" : "",
    FENa_sample_status: bloodProblem ? "different-time" : "",
    tmpPairedSameTime: false,
    ui_tmpPairedSameTime_answer: saved.ui_tmpPairedSameTime_answer === "no" ? "no" : saved.ui_tmpPairedSameTime_answer === "unknown" ? "unknown" : "",
  });
  const vault = window.__vildaClcrVersionValueVault && typeof window.__vildaClcrVersionValueVault === "object" ? window.__vildaClcrVersionValueVault : (window.__vildaClcrVersionValueVault = {});
  for (const [id, value] of Object.entries(values)) {
    const control = document.getElementById(id);
    if (control) { if (control.type === "checkbox") control.checked = value === true; else control.value = String(value); }
    vault[id] = value;
  }
}
`;

const replacements = [
  // Blank tri-state widgets are not newer clinical evidence. In particular,
  // they must not erase a legacy true pairing, CKD, AKI or loading answer.
  ['if (has(key)) fields[id] = fields[key] === "yes";', 'if (["yes", "no", "unknown"].includes(input[key])) fields[id] = fields[key] === "yes";'],
  ['if (has(answer)) fields.suspectedAKI = fields[answer] === "yes";', 'if (["yes", "no", "unknown"].includes(input[answer])) fields.suspectedAKI = fields[answer] === "yes";'],
  ['if (has(loadAnswer)) fields.spotBicarbonateLoad = fields[loadAnswer] === "yes";', 'if (["yes", "no", "unknown"].includes(input[loadAnswer])) fields.spotBicarbonateLoad = fields[loadAnswer] === "yes";'],
  ['normalizeFekSessionInputs(n);const o=', 'normalizeFekSessionInputs(n);normalizeUagSessionInputs(n);const o='],
  ['e.selectedFormula==="FEHCO3_spot"||e.preservedInputs.formulaPicker==="FEHCO3_spot"||', 'e.selectedFormula==="FEHCO3_spot"||e.preservedInputs.formulaPicker==="FEHCO3_spot"||e.selectedFormula==="AGu_spot"||e.preservedInputs.formulaPicker==="AGu_spot"||'],
  ['["FENa_spot","FEK_spot","FECl_spot","FEHCO3_spot"].includes((e.preservedInputs||{}).formulaPicker)', '["FENa_spot","FEK_spot","FECl_spot","FEHCO3_spot","AGu_spot"].includes((e.preservedInputs||{}).formulaPicker)'],
  ['clearFehco3InputContext();clearMissingAcrSampleContext();', 'clearFehco3InputContext();clearUagInputContext();clearMissingAcrSampleContext();'],
  ['clearFehco3InputContext(),clearMissingAcrSampleContext(),', 'clearFehco3InputContext(),clearUagInputContext(),clearMissingAcrSampleContext(),'],
  ['restoreClearedFehco3Context(event)}catch{}', 'restoreClearedFehco3Context(event);restoreClearedUagContext(event)}catch{}'],
];

export function patchUagSessionHooks(source) {
  let result = source;
  const replace = (before, after) => {
    if (result.split(before).length !== 2) throw new Error('Ambiguous UAG session anchor: ' + before);
    result = result.replace(before, after);
  };
  if (!result.includes('/* KLIRENS-UAG-SESSION:')) {
    replace('(function(){const b="vildaClcrSessionV1";', uagSessionSource + '(function(){const b="vildaClcrSessionV1";');
    for (const [before, after] of replacements) replace(before, after);
  }
  // Idempotence must also verify that all hooks remain present. A partially
  // patched file or an independently edited helper needs explicit review.
  if (result.split(uagSessionSource).length !== 2) throw new Error('UAG readable session source differs from the reproducible patch');
  for (const [, after] of replacements) {
    if (result.split(after).length !== 2) throw new Error('Missing or duplicate UAG session hook: ' + after);
  }
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = resolve(process.argv[2] || 'inline_kalkulator_klirens_07.js');
  const source = readFileSync(target, 'utf8');
  const next = patchUagSessionHooks(source);
  if (next !== source) writeFileSync(target, next);
}
