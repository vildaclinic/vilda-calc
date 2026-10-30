import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Additive protein wrappers preserve all preceding audited session adapters.
export const proteinDzmSessionSource = String.raw`/* KLIRENS-PROTEIN-DZM-SESSION: source tools/patch-klirens-protein-dzm-session.mjs */
(function installProteinDzmSessionAdapter() {
  "use strict";
  const DEFAULTS = Object.freeze({ Prot_inputMode: "concentration", Prot_concentration: "", Prot_concentrationUnit: "mg/L",
    Prot_volume: "", Prot_volumeUnit: "mL", Prot_reportedValue: "", Prot_reportedUnit: "mg/24h", Prot_outputUnit: "mg/24h",
    Prot_collectionHours: "24", Prot_collectionSource: "assumed-24h", Prot_unitConversions: "" });
  const PROTOCOL_IDS = Object.freeze(["collectionStartVoidDiscarded", "collectionFinalVoidIncluded", "collectionNoMissedVoids",
    "collectionNoSpillage", "collectionNoExtraVoids", "collectionStorageFollowed"]);
  const CONTEXT_IDS = Object.freeze(["age", "ageMonths", "ageDays", "sex", "weight", "height", "newbornContext", "Cl24CollectionProblem",
    ...PROTOCOL_IDS.flatMap(id => [id, "ui_" + id + "_answer"])]);
  const originals = new WeakMap();
  const object = value => value && typeof value === "object" && !Array.isArray(value);
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
  const absent = value => value == null || typeof value === "string" && !value.trim();
  const primitive = value => value == null ? "" : ["string", "number", "boolean"].includes(typeof value) ? String(value) : "";
  const conversionMetadata = value => {
    if (typeof value === "string") return value;
    if (!object(value)) return "";
    try { return JSON.stringify(value); } catch { return ""; }
  };
  const incoming = session => ({ ...(object(session.preservedInputs) ? session.preservedInputs : {}), ...(object(session.inputs) ? session.inputs : {}) });
  const selected = (session, values) => session.selectedFormula || values.formulaPicker || "";
  const enteredHours = value => {
    if (typeof window.ClcrCollectionDuration?.parseHours === "function") return window.ClcrCollectionDuration.parseHours(value);
    if (!["number", "string"].includes(typeof value) || !/^[+]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?$/i.test(String(value).trim())) return null;
    const number = Number(String(value).trim().replace(",", "."));
    return Number.isFinite(number) && number > 0 && Number.isFinite(number * 60) ? number : null;
  };
  function setControls(fields) {
    for (const [id, value] of Object.entries(fields)) {
      const control = document.getElementById(id);
      if (control) { if (control.type === "checkbox") control.checked = value === true; else control.value = primitive(value); }
    }
  }
  function capturedDuration(session, values) {
    const contexts = [values, session.context, session.sourceContext, session.collection, session.collectionAnalysis].filter(object)
      .flatMap(context => [context, context.collection, context.collectionAnalysis, context.inputs, context.referenceContext].filter(object));
    for (const context of contexts) {
      for (const key of ["collectionHours", "durationHours", "recordedDurationHours"]) {
        if (own(context, key) && !absent(context[key]) && ["number", "string"].includes(typeof context[key])) return primitive(context[key]);
      }
      for (const key of ["durationMinutes", "collectionMinutes", "recordedDurationMinutes", "collectionDurationMinutes"]) {
        if (!own(context, key) || absent(context[key]) || !["number", "string"].includes(typeof context[key])) continue;
        const text = String(context[key]).trim().replace(",", ".");
        const minutes = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text) ? Number(text) : null;
        // An explicit invalid duration remains evidence of an invalid sample.
        return minutes !== null && Number.isFinite(minutes) ? String(minutes / 60) : primitive(context[key]);
      }
    }
    if (!absent(values.Cl24DurationHours) && (!own(values, "Cl24DurationSource") || ["hours", "captured", "legacy-dates", "invalid"].includes(values.Cl24DurationSource))) return primitive(values.Cl24DurationHours);
    return null;
  }
  function durationFields(session, values, active, legacyAmount) {
    const raw = values.Prot_collectionHours, hasValue = own(values, "Prot_collectionHours");
    const unresolved = values.Prot_collectionSource === "historical-missing" || values.Prot_durationNeedsConfirmation === true || values.Prot_durationNeedsConfirmation === "true";
    if (unresolved && enteredHours(raw) === null) return { Prot_collectionHours: primitive(raw), Prot_collectionSource: "historical-missing", Prot_durationNeedsConfirmation: true };
    if (hasValue && !absent(raw)) {
      const valid = enteredHours(raw);
      const source = valid !== null && ["assumed-24h", "hours", "captured", "legacy-dates"].includes(values.Prot_collectionSource) && !(values.Prot_collectionSource === "assumed-24h" && valid !== 24) ? values.Prot_collectionSource : "hours";
      return { Prot_collectionHours: primitive(raw) || "invalid", Prot_collectionSource: source, Prot_durationNeedsConfirmation: false };
    }
    if (!hasValue && active) {
      const hours = capturedDuration(session, values);
      if (hours !== null) return { Prot_collectionHours: hours, Prot_collectionSource: "captured", Prot_durationNeedsConfirmation: false };
      if (legacyAmount || !absent(values.collectionStartAt) || !absent(values.collectionEndAt)) return { Prot_collectionHours: "", Prot_collectionSource: "historical-missing", Prot_durationNeedsConfirmation: true };
    }
    return { Prot_collectionHours: "24", Prot_collectionSource: "assumed-24h", Prot_durationNeedsConfirmation: false };
  }
  function normalizeProtein(session) {
    const values = originals.get(session) || incoming(session), formula = selected(session, values), active = formula === "Prot_mgkg";
    window.ClcrProteinDzmUi?.ensureControls?.(document);
    const fields = Object.fromEntries(Object.entries(DEFAULTS).map(([id, fallback]) => [id, own(values, id) ? id === "Prot_unitConversions" ? conversionMetadata(values[id]) : primitive(values[id]) : fallback]));
    const legacyAmount = active && !Object.keys(values).some(id => id.startsWith("Prot_")) && own(values, "U_Prot") && !absent(values.U_Prot);
    Object.assign(fields, durationFields(session, values, active, legacyAmount));
    if (legacyAmount) {
      // U_Prot is the total mg IN THE COLLECTION, never a concentration.
      // Migrate only with portable numeric duration and the shipped arithmetic;
      // a ready daily result must not be rescaled a second time by the engine.
      fields.Prot_inputMode = "reported";
      fields.Prot_reportedValue = "";
      const hours = enteredHours(fields.Prot_collectionHours), text = primitive(values.U_Prot).trim().replace(",", ".");
      const amount = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text) ? Number(text) : null;
      const amountValid = amount !== null && Number.isFinite(amount) && !(amount === 0 && /[1-9]/.test(text.split(/e/i)[0]));
      const dailyAmount = window.ClcrSavedLegacyCalculator?.math?.dailyAmount;
      if (hours !== null && amountValid && typeof dailyAmount === "function") {
        const daily = dailyAmount(amount, hours * 60);
        // A finite floating-point underflow is not an exact measured zero.
        if (Number.isFinite(daily) && !(daily === 0 && amount !== 0)) fields.Prot_reportedValue = String(daily);
      } else if (hours !== null && !amountValid) fields.Prot_reportedValue = primitive(values.U_Prot);
    }
    setControls(fields);
    const applicable = Object.fromEntries(Object.entries(fields).filter(([id]) => active || own(values, id) || document.getElementById(id) || id === "Prot_durationNeedsConfirmation" && document.getElementById("Prot_collectionHours")));
    const next = { ...(object(session.inputs) ? session.inputs : {}), ...applicable };
    if (active) session.selectedFormula = formula;
    // Explicit blanks and known collection contradictions are this patient's
    // facts. Earlier adapters already reset missing protocol facts to unknown.
    for (const id of [...CONTEXT_IDS, "collectionStartAt", "collectionEndAt"]) if (own(values, id)) next[id] = values[id];
    if (legacyAmount) for (const id of ["U_Prot", "Cl24DurationHours", "Cl24DurationSource", "durationNeedsConfirmation"]) if (own(values, id)) next[id] = values[id];
    session.inputs = next;
  }
  function clearProtein() {
    window.ClcrProteinDzmUi?.ensureControls?.(document);
    setControls({ ...DEFAULTS, Prot_durationNeedsConfirmation: false });
  }
  function restoreClearedProtein(event) {
    clearProtein();
    if (event?.clcrClearedFormula !== "Prot_mgkg") return;
    const saved = event.clcrPreservedProteinDzmContext;
    if (!object(saved)) return;
    const fields = Object.fromEntries(CONTEXT_IDS.filter(id => own(saved, id) &&
      (typeof saved[id] === "string" || typeof saved[id] === "boolean" || typeof saved[id] === "number" && Number.isFinite(saved[id])))
      .map(id => [id, saved[id]]));
    Object.assign(fields, DEFAULTS, { Prot_durationNeedsConfirmation: false });
    setControls(fields);
    const vault = object(window.__vildaClcrVersionValueVault) ? window.__vildaClcrVersionValueVault : (window.__vildaClcrVersionValueVault = {});
    Object.assign(vault, fields);
    setTimeout(() => { try { window.ClcrUiWorkflow?.refresh?.(); window.clcrUpdate?.(); } catch {} }, 0);
  }
  window.ClcrProteinDzmSession = Object.freeze({ DEFAULTS, CONTEXT_IDS });
  window.ClcrProteinDzmUi?.ensureControls?.(document);
  const replaceBinding = (name, implementation) => {
    if (!Reflect.set(globalThis, name, implementation)) throw new Error("Nie można zainstalować adaptera sesji: " + name);
  };
  const priorPrepareUa = prepareUaSession;
  replaceBinding("prepareUaSession", function prepareProteinDzmSession(session) {
    const prepared = priorPrepareUa(session);
    if (!object(prepared)) return prepared;
    if (selected(prepared, incoming(prepared)) !== "Prot_mgkg") return prepared;
    return { ...prepared, selectedFormula: "Prot_mgkg", inputs: object(prepared.inputs) ? prepared.inputs : {}, preservedInputs: object(prepared.preservedInputs) ? { ...prepared.preservedInputs } : prepared.preservedInputs };
  });
  const priorNormalizeCl24 = normalizeCl24SessionInputs;
  replaceBinding("normalizeCl24SessionInputs", function captureProteinBeforeNormalization(session) { originals.set(session, incoming(session)); priorNormalizeCl24(session); });
  const priorNormalizeCa = normalizeCaDzmSessionInputs;
  replaceBinding("normalizeCaDzmSessionInputs", function normalizeProteinAfterCa(session) { priorNormalizeCa(session); normalizeProtein(session); });
  const priorClearCa = clearCaDzmInputContext;
  replaceBinding("clearCaDzmInputContext", function clearProteinAfterCa() { priorClearCa(); clearProtein(); });
  const priorRestoreCa = restoreClearedCaDzmContext;
  replaceBinding("restoreClearedCaDzmContext", function restoreProteinAfterCa(event) { priorRestoreCa(event); restoreClearedProtein(event); });
})();
`;

const marker = '(function(){const b="vildaClcrSessionV1";';
const captureAnchor = 'try{window.ClcrPo4DzmUi?.ensureControls?.(document)}catch{}';
const capturePatched = captureAnchor + 'try{window.ClcrProteinDzmUi?.ensureControls?.(document)}catch{}';
export function patchProteinDzmSessionHooks(source) {
  let result = source;
  if (!result.includes('/* KLIRENS-PROTEIN-DZM-SESSION:')) {
    if (result.split(marker).length !== 2 || result.split(captureAnchor).length !== 2) throw new Error('Ambiguous protein session integration anchor');
    result = result.replace(marker, proteinDzmSessionSource + marker).replace(captureAnchor, capturePatched);
  }
  if (result.split(proteinDzmSessionSource).length !== 2) throw new Error('Protein session source differs from the reproducible patch');
  if (result.split(capturePatched).length !== 2) throw new Error('Missing or duplicate protein session capture hook');
  return result;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = resolve(process.argv[2] || 'inline_kalkulator_klirens_07.js');
  const source = readFileSync(target, 'utf8'), next = patchProteinDzmSessionHooks(source);
  if (next !== source) writeFileSync(target, next);
}
