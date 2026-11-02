import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// An additive session boundary for KM/Cr. Only an actual restored KM/Cr
// calculation may migrate the former shared concentration fields. Selecting
// the new formula never turns another urine sample into this measurement.
export const urateCreatinineSessionSource = String.raw`/* KLIRENS-URATE-CREATININE-SESSION: source tools/patch-klirens-urate-creatinine-session.mjs */
(function installUrateCreatinineSessionAdapter() {
  "use strict";
  const DEFAULTS = Object.freeze({ URCR_inputMode: "concentration", URCR_uricAcid: "", URCR_uricAcidUnit: "mg/dL",
    URCR_creatinine: "", URCR_creatinineUnit: "mg/dL", URCR_reportedValue: "", URCR_reportedUnit: "mmol/mmol",
    URCR_specimen: "random", URCR_outputUnit: "mmol/mmol" });
  const CONTEXT_IDS = Object.freeze(["age", "ageMonths", "ageDays", "sex", "weight", "height", "newbornContext"]);
  const originals = new WeakMap();
  let restoredAliases = {};
  const object = value => value && typeof value === "object" && !Array.isArray(value);
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
  const absent = value => value == null || typeof value === "string" && !value.trim();
  const primitive = value => value == null ? "" : ["string", "number", "boolean"].includes(typeof value) ? String(value) : "";
  const incoming = session => ({ ...(object(session.preservedInputs) ? session.preservedInputs : {}), ...(object(session.inputs) ? session.inputs : {}) });
  const selected = (session, values) => session.selectedFormula || values.formulaPicker || "";
  function aliasValues(raw) {
    let value = raw;
    if (typeof value === "string") { try { value = JSON.parse(value); } catch { return null; } }
    if (!object(value) || !Object.keys(value).length || Object.keys(value).some(key => !["U_UA", "Ucr"].includes(key))) return null;
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      if (!["string", "number"].includes(typeof item) || typeof item === "number" && !Number.isFinite(item)) return null;
      const text = primitive(item);
      if (!text.trim() || text.length > 512) return null;
      result[key] = text;
    }
    return result;
  }
  function metadataText(value) {
    if (typeof value === "string") return value;
    try { return JSON.stringify(value); } catch { return "[invalid metadata]"; }
  }
  function legacyAliasValues(doc = document) {
    if (doc.getElementById("formulaPicker")?.value !== "KM_Cr") return {};
    const vault = window.__vildaClcrVersionValueVault;
    const captured = object(vault) && own(vault, "URCR_legacyAliases") ? aliasValues(vault.URCR_legacyAliases) : restoredAliases;
    return Object.freeze({ ...(captured || {}) });
  }
  function setControls(fields) {
    for (const [id, value] of Object.entries(fields)) {
      const control = document.getElementById(id);
      if (control) {
        if (control.type === "checkbox") control.checked = value === true || value === "true";
        else control.value = primitive(value);
      }
    }
  }
  function sourceContexts(session, active) {
    const typed = [session.urateCreatinineSnapshot?.input, session.context?.urateCreatinine,
      session.sourceContext?.urateCreatinine, session.context?.urateCreatinineSnapshot?.input].filter(object);
    return active ? [...typed, session.context, session.sourceContext].filter(object) : typed;
  }
  function specimenValue(value) {
    const text = primitive(value).trim().toLowerCase();
    if (["random", "spot", "single", "random-urine"].includes(text)) return "random";
    if (["timed", "24h", "24-hour", "24h-urine", "dzm"].includes(text)) return "timed";
    return "unknown";
  }
  function specimenFor(session, values, active, measured) {
    if (own(values, "URCR_specimen")) return specimenValue(values.URCR_specimen);
    for (const context of sourceContexts(session, active)) {
      for (const key of ["specimen", "specimenType", "sampleType", "urineSpecimenType"]) {
        if (own(context, key)) return specimenValue(context[key]);
      }
    }
    // Old measurements have no evidence of a random sample. Only a genuinely
    // blank new form gets the new default; an old numeric result stays unknown.
    return measured ? "unknown" : "random";
  }
  function capturedSameSample(session, values, active) {
    let answer = own(values, "URCR_sameUrineSample") ? values.URCR_sameUrineSample : undefined;
    for (const context of sourceContexts(session, active)) {
      const facts = object(context.knownFacts) ? context.knownFacts : {};
      if (context.sameUrineSample === false || facts.sameUrineSample === false) return false;
      if (answer === undefined && (context.sameUrineSample === true || facts.sameUrineSample === true)) answer = true;
    }
    return answer;
  }
  function normalizeUrateCreatinine(session) {
    const values = originals.get(session) || incoming(session), formula = selected(session, values), active = formula === "KM_Cr";
    window.ClcrUrateCreatinineUi?.ensureControls?.(document);
    const fields = Object.fromEntries(Object.entries(DEFAULTS).map(([id, fallback]) => [id, own(values, id) ? primitive(values[id]) : fallback]));
    const hasDedicated = Object.keys(DEFAULTS).some(id => own(values, id));
    const legacy = active && !hasDedicated && (!absent(values.U_UA) || !absent(values.Ucr));
    if (legacy) {
      if (own(values, "U_UA")) fields.URCR_uricAcid = primitive(values.U_UA);
      if (own(values, "Ucr")) fields.URCR_creatinine = primitive(values.Ucr);
    }
    const measured = legacy || ["URCR_uricAcid", "URCR_creatinine", "URCR_reportedValue"].some(id => !absent(values[id]));
    fields.URCR_specimen = specimenFor(session, values, active, measured);
    setControls(fields);
    const applicable = Object.fromEntries(Object.entries(fields).filter(([id]) => active || own(values, id) || document.getElementById(id)));
    const next = { ...(object(session.inputs) ? session.inputs : {}), ...applicable };
    for (const id of CONTEXT_IDS) if (own(values, id)) next[id] = values[id];
    const matched = capturedSameSample(session, values, active);
    if (matched !== undefined && ["boolean", "string"].includes(typeof matched)) next.URCR_sameUrineSample = matched;
    else delete next.URCR_sameUrineSample;
    if (active) { session.selectedFormula = "KM_Cr"; session.currentVersion = "spot"; next.currentVersion = "spot"; }
    // The legacy fields remain source evidence for undo/export. They never
    // seed this form merely because the doctor changes the selected formula.
    if (legacy) for (const id of ["U_UA", "Ucr"]) if (own(values, id)) next[id] = values[id];
    const aliases = legacy ? Object.fromEntries(["U_UA", "Ucr"].filter(id => own(values, id) && !absent(values[id])).map(id => [id, primitive(values[id])])) : null;
    const encodedAliases = aliases && Object.keys(aliases).length ? JSON.stringify(aliases)
      : own(values, "URCR_legacyAliases") ? metadataText(values.URCR_legacyAliases) : undefined;
    restoredAliases = aliasValues(encodedAliases) || {};
    if (encodedAliases !== undefined) next.URCR_legacyAliases = encodedAliases;
    else delete next.URCR_legacyAliases;
    session.inputs = next;
  }
  function clearUrateCreatinine() {
    window.ClcrUrateCreatinineUi?.ensureControls?.(document);
    setControls(DEFAULTS);
    const vault = window.__vildaClcrVersionValueVault;
    restoredAliases = {};
    if (object(vault)) { delete vault.URCR_sameUrineSample; delete vault.URCR_legacyAliases; }
  }
  function restoreClearedUrateCreatinine(event) {
    clearUrateCreatinine();
    if (event?.clcrClearedFormula !== "KM_Cr") return;
    const saved = event.clcrPreservedUrateCreatinineContext;
    if (!object(saved)) return;
    const fields = Object.fromEntries(CONTEXT_IDS.filter(id => own(saved, id) &&
      (typeof saved[id] === "string" || typeof saved[id] === "boolean" || typeof saved[id] === "number" && Number.isFinite(saved[id])))
      .map(id => [id, saved[id]]));
    Object.assign(fields, DEFAULTS);
    setControls(fields);
    const vault = object(window.__vildaClcrVersionValueVault) ? window.__vildaClcrVersionValueVault : (window.__vildaClcrVersionValueVault = {});
    Object.assign(vault, fields);
    setTimeout(() => { try { window.ClcrUiWorkflow?.refresh?.(); window.clcrUpdate?.(); } catch {} }, 0);
  }
  window.ClcrUrateCreatinineSession = Object.freeze({ DEFAULTS, CONTEXT_IDS, legacyAliasValues });
  window.ClcrUrateCreatinineUi?.ensureControls?.(document);
  const replaceBinding = (name, implementation) => {
    if (!Reflect.set(globalThis, name, implementation)) throw new Error("Nie można zainstalować adaptera sesji: " + name);
  };
  const priorPrepareUa = prepareUaSession;
  replaceBinding("prepareUaSession", function prepareUrateCreatinineSession(session) {
    const prepared = priorPrepareUa(session);
    if (!object(prepared)) return prepared;
    if (selected(prepared, incoming(prepared)) !== "KM_Cr") return prepared;
    return { ...prepared, currentVersion: "spot", selectedFormula: "KM_Cr",
      inputs: { ...(object(prepared.inputs) ? prepared.inputs : {}), currentVersion: "spot" },
      preservedInputs: object(prepared.preservedInputs) ? { ...prepared.preservedInputs } : prepared.preservedInputs };
  });
  const priorNormalizeCl24 = normalizeCl24SessionInputs;
  replaceBinding("normalizeCl24SessionInputs", function captureUrateCreatinineBeforeNormalization(session) { originals.set(session, incoming(session)); priorNormalizeCl24(session); });
  const priorNormalizeCa = normalizeCaDzmSessionInputs;
  replaceBinding("normalizeCaDzmSessionInputs", function normalizeUrateCreatinineAfterCa(session) { priorNormalizeCa(session); normalizeUrateCreatinine(session); });
  const priorClearCa = clearCaDzmInputContext;
  replaceBinding("clearCaDzmInputContext", function clearUrateCreatinineAfterCa() { priorClearCa(); clearUrateCreatinine(); });
  const priorRestoreCa = restoreClearedCaDzmContext;
  replaceBinding("restoreClearedCaDzmContext", function restoreUrateCreatinineAfterCa(event) { priorRestoreCa(event); restoreClearedUrateCreatinine(event); });
})();
`;

const marker = '/* KLIRENS-POTASSIUM-DZM-SESSION: source tools/patch-klirens-potassium-dzm-session.mjs */';
const adapterAnchor = '(function(){const b="vildaClcrSessionV1";';
const captureAnchor = 'try{window.ClcrPotassiumDzmUi?.ensureControls?.(document)}catch{}';
const capturePatched = captureAnchor + 'try{window.ClcrUrateCreatinineUi?.ensureControls?.(document)}catch{}';
export function patchUrateCreatinineSessionHooks(source) {
  let result = source;
  if (!result.includes('/* KLIRENS-URATE-CREATININE-SESSION:')) {
    if (result.split(marker).length !== 2 || result.split(adapterAnchor).length !== 2 || result.split(captureAnchor).length !== 2) throw new Error('Ambiguous urate/creatinine session integration anchor');
    result = result.replace(adapterAnchor, urateCreatinineSessionSource + adapterAnchor).replace(captureAnchor, capturePatched);
  }
  if (result.split(urateCreatinineSessionSource).length !== 2) throw new Error('Urate/creatinine session source differs from the reproducible patch');
  if (result.split(capturePatched).length !== 2) throw new Error('Missing or duplicate urate/creatinine session capture hook');
  return result;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = resolve(process.argv[2] || 'inline_kalkulator_klirens_07.js');
  const source = readFileSync(target, 'utf8'), next = patchUrateCreatinineSessionHooks(source);
  if (next !== source) writeFileSync(target, next);
}
