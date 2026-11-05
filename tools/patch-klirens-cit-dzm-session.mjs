import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Citrate owns its new raw operands. This additive boundary does not rewrite
// legacy mg/kg measurements or copy another formula's urine while switching.
export const citDzmSessionSource = String.raw`/* KLIRENS-CIT-DZM-SESSION: source tools/patch-klirens-cit-dzm-session.mjs */
(function installCitDzmSessionAdapter() {
  "use strict";
  const DEFAULTS = Object.freeze({ CITDZM_inputMode: "concentration", CITDZM_concentration: "", CITDZM_concentrationUnit: "mmol/L",
    CITDZM_volume: "", CITDZM_volumeUnit: "mL", CITDZM_reportedValue: "", CITDZM_reportedUnit: "mmol/24h",
    CITDZM_collectionHours: "24", CITDZM_collectionSource: "assumed-24h", CITDZM_durationNeedsConfirmation: false,
    CITDZM_reportingEntity: "unknown", CITDZM_unitConversions: "" });
  const CONTEXT_IDS = Object.freeze(["age", "ageMonths", "ageDays", "sex", "weight", "height", "newbornContext"]);
  const PROTOCOL_IDS = Object.freeze(["collectionStartVoidDiscarded", "collectionFinalVoidIncluded", "collectionNoMissedVoids",
    "collectionNoSpillage", "collectionNoExtraVoids", "collectionStorageFollowed"]);
  const SPECIMEN_IDS = Object.freeze(["Cl24CollectionProblem", "collectionStartAt", "collectionEndAt",
    ...PROTOCOL_IDS.flatMap(id => [id, "ui_" + id + "_answer"])]);
  const originals = new WeakMap();
  const object = value => value && typeof value === "object" && !Array.isArray(value);
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
  const absent = value => value == null || typeof value === "string" && !value.trim();
  const confirmed = value => value === true || value === "true";
  const primitive = value => value == null ? "" : ["string", "number", "boolean"].includes(typeof value) ? String(value) : "";
  const incoming = session => ({ ...(object(session.preservedInputs) ? session.preservedInputs : {}), ...(object(session.inputs) ? session.inputs : {}) });
  const selected = (session, values) => session.selectedFormula || values.formulaPicker || "";
  const metadata = value => {
    if (typeof value === "string") return value;
    if (!object(value)) return "";
    try { return JSON.stringify(value); } catch { return ""; }
  };
  const enteredHours = value => {
    if (typeof window.ClcrCollectionDuration?.parseHours === "function") return window.ClcrCollectionDuration.parseHours(value);
    if (!["number", "string"].includes(typeof value) || !/^[+]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?$/i.test(String(value).trim())) return null;
    const number = Number(String(value).trim().replace(",", "."));
    return Number.isFinite(number) && number > 0 && Number.isFinite(number * 60) ? number : null;
  };
  function setControls(fields) {
    for (const [id, value] of Object.entries(fields)) {
      const control = document.getElementById(id);
      if (control) { if (control.type === "checkbox") control.checked = confirmed(value); else control.value = primitive(value); }
    }
  }
  function sourceContexts(session, values) {
    return [values, session.citDzmSnapshot?.input, session.context?.citDzm, session.sourceContext?.citDzm,
      session.context, session.sourceContext, session.collection, session.collectionAnalysis].filter(object)
      .flatMap(context => [context, context.collection, context.collectionAnalysis, context.inputs, context.referenceContext].filter(object));
  }
  function capturedDuration(session, values) {
    for (const context of sourceContexts(session, values)) {
      for (const key of ["collectionHours", "durationHours", "recordedDurationHours"]) {
        if (own(context, key) && !absent(context[key])) return { hours: primitive(context[key]) || "invalid", source: context.durationSource === "invalid" ? "invalid" : "captured" };
      }
      for (const key of ["durationMinutes", "collectionMinutes", "recordedDurationMinutes", "collectionDurationMinutes"]) {
        if (!own(context, key) || absent(context[key])) continue;
        const text = primitive(context[key]).trim().replace(",", ".");
        const minutes = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text) ? Number(text) : null;
        return { hours: minutes !== null && Number.isFinite(minutes) ? String(minutes / 60) : text || "invalid", source: context.durationSource === "invalid" ? "invalid" : "captured" };
      }
    }
    if (!absent(values.Cl24DurationHours) && (!own(values, "Cl24DurationSource") || ["hours", "captured", "legacy-dates", "invalid"].includes(values.Cl24DurationSource))) {
      return { hours: primitive(values.Cl24DurationHours) || "invalid", source: values.Cl24DurationSource === "invalid" ? "invalid" : "captured" };
    }
    return null;
  }
  function restoreCapturedFacts(session, values, next) {
    for (const context of sourceContexts(session, values)) {
      const facts = object(context.knownFacts) ? context.knownFacts : {};
      if (facts.Cl24CollectionProblem === true || context.collectionProblem === true) next.Cl24CollectionProblem = true;
      for (const id of PROTOCOL_IDS) {
        const answerId = "ui_" + id + "_answer";
        if (values[answerId] === "no") continue;
        if (facts[id] === false || facts[answerId] === "no") { next[id] = false; next[answerId] = "no"; }
      }
      for (const id of ["collectionStartAt", "collectionEndAt"]) if (absent(values[id]) && typeof context[id] === "string" && !absent(context[id])) next[id] = context[id];
    }
  }
  function durationFields(session, values, active, legacyMeasurement) {
    const raw = values.CITDZM_collectionHours, hasValue = own(values, "CITDZM_collectionHours");
    const unresolved = values.CITDZM_collectionSource === "historical-missing" || confirmed(values.CITDZM_durationNeedsConfirmation);
    if (values.CITDZM_collectionSource === "invalid") return { CITDZM_collectionHours: primitive(raw), CITDZM_collectionSource: "invalid", CITDZM_durationNeedsConfirmation: false };
    if (unresolved && enteredHours(raw) === null) return { CITDZM_collectionHours: primitive(raw), CITDZM_collectionSource: "historical-missing", CITDZM_durationNeedsConfirmation: true };
    if (hasValue && !absent(raw)) {
      const valid = enteredHours(raw);
      const source = valid !== null && ["assumed-24h", "hours", "captured", "legacy-dates"].includes(values.CITDZM_collectionSource) && !(values.CITDZM_collectionSource === "assumed-24h" && valid !== 24) ? values.CITDZM_collectionSource : "hours";
      return { CITDZM_collectionHours: primitive(raw) || "invalid", CITDZM_collectionSource: source, CITDZM_durationNeedsConfirmation: false };
    }
    if (hasValue && absent(raw) && values.CITDZM_collectionSource === "assumed-24h") return { CITDZM_collectionHours: "24", CITDZM_collectionSource: "assumed-24h", CITDZM_durationNeedsConfirmation: false };
    if (!hasValue || absent(raw)) {
      const captured = !hasValue && active ? capturedDuration(session, values) : null;
      if (captured) return { CITDZM_collectionHours: captured.hours, CITDZM_collectionSource: captured.source, CITDZM_durationNeedsConfirmation: false };
      if (legacyMeasurement || !absent(values.CITDZM_concentration) || !absent(values.CITDZM_reportedValue) || active && (!absent(values.collectionStartAt) || !absent(values.collectionEndAt) || confirmed(values.durationNeedsConfirmation)) || hasValue && values.CITDZM_collectionSource !== "assumed-24h") {
        return { CITDZM_collectionHours: "", CITDZM_collectionSource: "historical-missing", CITDZM_durationNeedsConfirmation: true };
      }
    }
    return { CITDZM_collectionHours: "24", CITDZM_collectionSource: "assumed-24h", CITDZM_durationNeedsConfirmation: false };
  }
  function normalizeCitDzm(session) {
    const values = originals.get(session) || incoming(session), formula = selected(session, values), active = formula === "Cit_mgkg";
    window.ClcrCitDzmUi?.ensureControls?.(document);
    const fields = Object.fromEntries(Object.entries(DEFAULTS).map(([id, fallback]) => [id, own(values, id) ? id === "CITDZM_unitConversions" ? metadata(values[id]) : id === "CITDZM_durationNeedsConfirmation" ? confirmed(values[id]) : primitive(values[id]) : fallback]));
    const legacyMeasurement = active && !Object.keys(values).some(id => id.startsWith("CITDZM_")) && (!absent(values.U_Cit) || !absent(values.V24));
    if (legacyMeasurement) {
      // The shipped U_Cit control explicitly labels citric acid in mg/dL.
      // Preserve that historical convention without touching the shared control.
      fields.CITDZM_concentration = primitive(values.U_Cit);
      fields.CITDZM_concentrationUnit = "mg/dL";
      fields.CITDZM_volume = primitive(values.V24);
      fields.CITDZM_reportingEntity = "citric_acid";
    }
    Object.assign(fields, durationFields(session, values, active, legacyMeasurement));
    setControls(fields);
    const applicable = Object.fromEntries(Object.entries(fields).filter(([id]) => active || own(values, id) || document.getElementById(id) || id === "CITDZM_durationNeedsConfirmation" && document.getElementById("CITDZM_collectionHours")));
    const next = { ...(object(session.inputs) ? session.inputs : {}), ...applicable };
    for (const id of [...CONTEXT_IDS, ...SPECIMEN_IDS]) if (own(values, id)) next[id] = values[id];
    if (active) {
      session.selectedFormula = formula;
      // An explicit historical measurement with missing patient data must not
      // acquire the preceding patient's age or BSA during rehydration.
      for (const id of CONTEXT_IDS) if (!own(values, id)) next[id] = "";
      restoreCapturedFacts(session, values, next);
    }
    if (legacyMeasurement) for (const id of ["U_Cit", "V24", "Cl24DurationHours", "Cl24DurationSource", "durationNeedsConfirmation"]) if (own(values, id)) next[id] = values[id];
    session.inputs = next;
  }
  function clearCitDzm() {
    window.ClcrCitDzmUi?.ensureControls?.(document);
    setControls(DEFAULTS);
  }
  function restoreClearedCitDzm(event) {
    clearCitDzm();
    if (event?.clcrClearedFormula !== "Cit_mgkg") return;
    const saved = event.clcrPreservedCitDzmContext;
    const fields = Object.fromEntries(CONTEXT_IDS.filter(id => own(saved, id) &&
      (typeof saved[id] === "string" || typeof saved[id] === "boolean" || typeof saved[id] === "number" && Number.isFinite(saved[id])))
      .map(id => [id, saved[id]]));
    Object.assign(fields, DEFAULTS, { Cl24CollectionProblem: false, collectionStartAt: "", collectionEndAt: "" });
    for (const id of PROTOCOL_IDS) { fields[id] = false; fields["ui_" + id + "_answer"] = ""; }
    setControls(fields);
    const vault = object(window.__vildaClcrVersionValueVault) ? window.__vildaClcrVersionValueVault : (window.__vildaClcrVersionValueVault = {});
    Object.assign(vault, fields);
    setTimeout(() => { try { window.ClcrUiWorkflow?.refresh?.(); window.clcrUpdate?.(); } catch {} }, 0);
  }
  function readContext(doc = document) {
    const ageContext = window.ClcrClinicalSafety?.readAgeFromDocument?.(doc) || null;
    const text = id => doc.getElementById(id)?.value ?? "";
    const years = text("age"), months = text("ageMonths"), days = text("ageDays");
    const knownFacts = {};
    const problem = doc.getElementById("Cl24CollectionProblem");
    if (problem?.checked === true) knownFacts.Cl24CollectionProblem = true;
    for (const id of PROTOCOL_IDS) {
      const answer = doc.getElementById("ui_" + id + "_answer")?.value;
      if (answer === "no") { knownFacts[id] = false; knownFacts["ui_" + id + "_answer"] = "no"; }
    }
    const flag = doc.getElementById("CITDZM_durationNeedsConfirmation");
    return { ageYears: ageContext?.valid === true && Number.isFinite(ageContext.exactYears) ? ageContext.exactYears : null,
      ageContext, agePrecision: /^\d+$/.test(String(years).trim()) && absent(months) && absent(days) ? "completed-years" : "exact",
      age: years, ageMonths: months, ageDays: days, sex: text("sex"), weightKg: text("weight"), heightCm: text("height"),
      collectionHours: text("CITDZM_collectionHours"), durationSource: text("CITDZM_collectionSource"),
      durationNeedsConfirmation: flag?.type === "checkbox" ? flag.checked === true : confirmed(flag?.value), knownFacts };
  }
  window.ClcrCitDzmSession = Object.freeze({ DEFAULTS, CONTEXT_IDS, readContext, clear: clearCitDzm });
  window.ClcrCitDzmUi?.ensureControls?.(document);
  const replaceBinding = (name, implementation) => {
    if (!Reflect.set(globalThis, name, implementation)) throw new Error("Nie można zainstalować adaptera sesji: " + name);
  };
  const priorPrepareUa = prepareUaSession;
  replaceBinding("prepareUaSession", function prepareCitDzmSession(session) {
    const prepared = priorPrepareUa(session);
    if (!object(prepared) || selected(prepared, incoming(prepared)) !== "Cit_mgkg") return prepared;
    const copy = { ...prepared, selectedFormula: "Cit_mgkg", inputs: object(prepared.inputs) ? { ...prepared.inputs } : {}, preservedInputs: object(prepared.preservedInputs) ? { ...prepared.preservedInputs } : prepared.preservedInputs };
    restoreCapturedFacts(copy, incoming(copy), copy.inputs);
    return copy;
  });
  const priorNormalizeCl24 = normalizeCl24SessionInputs;
  replaceBinding("normalizeCl24SessionInputs", function captureCitDzmBeforeNormalization(session) { originals.set(session, incoming(session)); priorNormalizeCl24(session); });
  const priorNormalizeCa = normalizeCaDzmSessionInputs;
  replaceBinding("normalizeCaDzmSessionInputs", function normalizeCitDzmAfterCa(session) { priorNormalizeCa(session); normalizeCitDzm(session); });
  const priorClearCa = clearCaDzmInputContext;
  replaceBinding("clearCaDzmInputContext", function clearCitDzmAfterCa() { priorClearCa(); clearCitDzm(); });
  const priorRestoreCa = restoreClearedCaDzmContext;
  replaceBinding("restoreClearedCaDzmContext", function restoreCitDzmAfterCa(event) { priorRestoreCa(event); restoreClearedCitDzm(event); });
})();
`;

const runtimeAnchor = '(function(){const b="vildaClcrSessionV1";';
// Keep already-shipped adapters in their rebuild order. Oxalate inserts before URCR.
const laterAdapters = ['/* KLIRENS-OX-DZM-SESSION:', '/* KLIRENS-URATE-CREATININE-SESSION:', runtimeAnchor];
const captureAnchor = 'try{window.ClcrOxDzmUi?.ensureControls?.(document)}catch{}';
const capturePatched = captureAnchor + 'try{window.ClcrCitDzmUi?.ensureControls?.(document)}catch{}';
export function patchCitDzmSessionHooks(source) {
  let result = source;
  if (!result.includes('/* KLIRENS-CIT-DZM-SESSION:')) {
    if (result.split(runtimeAnchor).length !== 2 || result.split(captureAnchor).length !== 2) throw new Error('Ambiguous citrate session integration anchor');
    const insertion = laterAdapters.filter(anchor => result.includes(anchor)).sort((a, b) => result.indexOf(a) - result.indexOf(b))[0];
    if (result.split(insertion).length !== 2) throw new Error('Ambiguous citrate session integration anchor');
    result = result.replace(insertion, citDzmSessionSource + insertion).replace(captureAnchor, capturePatched);
  }
  if (result.split(citDzmSessionSource).length !== 2) throw new Error('Citrate session source differs from the reproducible patch');
  if (result.split(capturePatched).length !== 2) throw new Error('Missing or duplicate citrate session capture hook');
  return result;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = resolve(process.argv[2] || 'inline_kalkulator_klirens_07.js');
  const source = readFileSync(target, 'utf8'), next = patchCitDzmSessionHooks(source);
  if (next !== source) writeFileSync(target, next);
}
