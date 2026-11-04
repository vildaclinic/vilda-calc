import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Oxalate owns its new raw operands. This additive boundary does not rewrite
// legacy mg/kg measurements or copy another formula's urine while switching.
export const oxDzmSessionSource = String.raw`/* KLIRENS-OX-DZM-SESSION: source tools/patch-klirens-ox-dzm-session.mjs */
(function installOxDzmSessionAdapter() {
  "use strict";
  const DEFAULTS = Object.freeze({ OXDZM_inputMode: "concentration", OXDZM_concentration: "", OXDZM_concentrationUnit: "µmol/L",
    OXDZM_volume: "", OXDZM_volumeUnit: "mL", OXDZM_reportedValue: "", OXDZM_reportedUnit: "mmol/24h",
    OXDZM_collectionHours: "24", OXDZM_collectionSource: "assumed-24h", OXDZM_durationNeedsConfirmation: false,
    OXDZM_reportingEntity: "unknown", OXDZM_unitConversions: "" });
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
    return [values, session.oxDzmSnapshot?.input, session.context?.oxDzm, session.sourceContext?.oxDzm,
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
    const raw = values.OXDZM_collectionHours, hasValue = own(values, "OXDZM_collectionHours");
    const unresolved = values.OXDZM_collectionSource === "historical-missing" || confirmed(values.OXDZM_durationNeedsConfirmation);
    if (values.OXDZM_collectionSource === "invalid") return { OXDZM_collectionHours: primitive(raw), OXDZM_collectionSource: "invalid", OXDZM_durationNeedsConfirmation: false };
    if (unresolved && enteredHours(raw) === null) return { OXDZM_collectionHours: primitive(raw), OXDZM_collectionSource: "historical-missing", OXDZM_durationNeedsConfirmation: true };
    if (hasValue && !absent(raw)) {
      const valid = enteredHours(raw);
      const source = valid !== null && ["assumed-24h", "hours", "captured", "legacy-dates"].includes(values.OXDZM_collectionSource) && !(values.OXDZM_collectionSource === "assumed-24h" && valid !== 24) ? values.OXDZM_collectionSource : "hours";
      return { OXDZM_collectionHours: primitive(raw) || "invalid", OXDZM_collectionSource: source, OXDZM_durationNeedsConfirmation: false };
    }
    if (hasValue && absent(raw) && values.OXDZM_collectionSource === "assumed-24h") return { OXDZM_collectionHours: "24", OXDZM_collectionSource: "assumed-24h", OXDZM_durationNeedsConfirmation: false };
    if (!hasValue || absent(raw)) {
      const captured = !hasValue && active ? capturedDuration(session, values) : null;
      if (captured) return { OXDZM_collectionHours: captured.hours, OXDZM_collectionSource: captured.source, OXDZM_durationNeedsConfirmation: false };
      if (legacyMeasurement || !absent(values.OXDZM_concentration) || !absent(values.OXDZM_reportedValue) || active && (!absent(values.collectionStartAt) || !absent(values.collectionEndAt) || confirmed(values.durationNeedsConfirmation)) || hasValue && values.OXDZM_collectionSource !== "assumed-24h") {
        return { OXDZM_collectionHours: "", OXDZM_collectionSource: "historical-missing", OXDZM_durationNeedsConfirmation: true };
      }
    }
    return { OXDZM_collectionHours: "24", OXDZM_collectionSource: "assumed-24h", OXDZM_durationNeedsConfirmation: false };
  }
  function normalizeOxDzm(session) {
    const values = originals.get(session) || incoming(session), formula = selected(session, values), active = formula === "Ox_mgkg";
    window.ClcrOxDzmUi?.ensureControls?.(document);
    const fields = Object.fromEntries(Object.entries(DEFAULTS).map(([id, fallback]) => [id, own(values, id) ? id === "OXDZM_unitConversions" ? metadata(values[id]) : id === "OXDZM_durationNeedsConfirmation" ? confirmed(values[id]) : primitive(values[id]) : fallback]));
    const legacyMeasurement = active && !Object.keys(values).some(id => id.startsWith("OXDZM_")) && (!absent(values.U_Ox) || !absent(values.V24));
    if (legacyMeasurement) {
      // The shipped U_Ox operand is a concentration in mg/dL. Keep it as a raw
      // concentration; neither divide by body weight nor fabricate molar form.
      fields.OXDZM_concentration = primitive(values.U_Ox);
      fields.OXDZM_concentrationUnit = "mg/dL";
      fields.OXDZM_volume = primitive(values.V24);
      fields.OXDZM_reportingEntity = ["oxalate_ion", "oxalic_acid"].includes(values.oxalateReportingEntity) ? values.oxalateReportingEntity : "unknown";
    }
    Object.assign(fields, durationFields(session, values, active, legacyMeasurement));
    setControls(fields);
    const applicable = Object.fromEntries(Object.entries(fields).filter(([id]) => active || own(values, id) || document.getElementById(id) || id === "OXDZM_durationNeedsConfirmation" && document.getElementById("OXDZM_collectionHours")));
    const next = { ...(object(session.inputs) ? session.inputs : {}), ...applicable };
    for (const id of [...CONTEXT_IDS, ...SPECIMEN_IDS]) if (own(values, id)) next[id] = values[id];
    if (active) {
      session.selectedFormula = formula;
      // An explicit historical measurement with missing patient data must not
      // acquire the preceding patient's age or BSA during rehydration.
      for (const id of CONTEXT_IDS) if (!own(values, id)) next[id] = "";
      restoreCapturedFacts(session, values, next);
    }
    if (legacyMeasurement) for (const id of ["U_Ox", "V24", "oxalateReportingEntity", "Cl24DurationHours", "Cl24DurationSource", "durationNeedsConfirmation"]) if (own(values, id)) next[id] = values[id];
    session.inputs = next;
  }
  function clearOxDzm() {
    window.ClcrOxDzmUi?.ensureControls?.(document);
    setControls(DEFAULTS);
  }
  function restoreClearedOxDzm(event) {
    clearOxDzm();
    if (event?.clcrClearedFormula !== "Ox_mgkg") return;
    const saved = event.clcrPreservedOxDzmContext;
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
    const flag = doc.getElementById("OXDZM_durationNeedsConfirmation");
    return { ageYears: ageContext?.valid === true && Number.isFinite(ageContext.exactYears) ? ageContext.exactYears : null,
      ageContext, agePrecision: /^\d+$/.test(String(years).trim()) && absent(months) && absent(days) ? "completed-years" : "exact",
      age: years, ageMonths: months, ageDays: days, weightKg: text("weight"), heightCm: text("height"),
      collectionHours: text("OXDZM_collectionHours"), durationSource: text("OXDZM_collectionSource"),
      durationNeedsConfirmation: flag?.type === "checkbox" ? flag.checked === true : confirmed(flag?.value), knownFacts };
  }
  window.ClcrOxDzmSession = Object.freeze({ DEFAULTS, CONTEXT_IDS, readContext, clear: clearOxDzm });
  window.ClcrOxDzmUi?.ensureControls?.(document);
  const replaceBinding = (name, implementation) => {
    if (!Reflect.set(globalThis, name, implementation)) throw new Error("Nie można zainstalować adaptera sesji: " + name);
  };
  const priorPrepareUa = prepareUaSession;
  replaceBinding("prepareUaSession", function prepareOxDzmSession(session) {
    const prepared = priorPrepareUa(session);
    if (!object(prepared) || selected(prepared, incoming(prepared)) !== "Ox_mgkg") return prepared;
    const copy = { ...prepared, selectedFormula: "Ox_mgkg", inputs: object(prepared.inputs) ? { ...prepared.inputs } : {}, preservedInputs: object(prepared.preservedInputs) ? { ...prepared.preservedInputs } : prepared.preservedInputs };
    restoreCapturedFacts(copy, incoming(copy), copy.inputs);
    return copy;
  });
  const priorNormalizeCl24 = normalizeCl24SessionInputs;
  replaceBinding("normalizeCl24SessionInputs", function captureOxDzmBeforeNormalization(session) { originals.set(session, incoming(session)); priorNormalizeCl24(session); });
  const priorNormalizeCa = normalizeCaDzmSessionInputs;
  replaceBinding("normalizeCaDzmSessionInputs", function normalizeOxDzmAfterCa(session) { priorNormalizeCa(session); normalizeOxDzm(session); });
  const priorClearCa = clearCaDzmInputContext;
  replaceBinding("clearCaDzmInputContext", function clearOxDzmAfterCa() { priorClearCa(); clearOxDzm(); });
  const priorRestoreCa = restoreClearedCaDzmContext;
  replaceBinding("restoreClearedCaDzmContext", function restoreOxDzmAfterCa(event) { priorRestoreCa(event); restoreClearedOxDzm(event); });
})();
`;

const runtimeAnchor = '(function(){const b="vildaClcrSessionV1";';
// Keep the already-shipped URCR adapter last, preserving its rebuild contract.
const laterAdapters = ['/* KLIRENS-URATE-CREATININE-SESSION:', runtimeAnchor];
const captureAnchor = 'try{window.ClcrPhosphorusCreatinineUi?.ensureControls?.(document)}catch{}';
const capturePatched = captureAnchor + 'try{window.ClcrOxDzmUi?.ensureControls?.(document)}catch{}';
export function patchOxDzmSessionHooks(source) {
  let result = source;
  if (!result.includes('/* KLIRENS-OX-DZM-SESSION:')) {
    if (result.split(runtimeAnchor).length !== 2 || result.split(captureAnchor).length !== 2) throw new Error('Ambiguous oxalate session integration anchor');
    const insertion = laterAdapters.filter(anchor => result.includes(anchor)).sort((a, b) => result.indexOf(a) - result.indexOf(b))[0];
    if (result.split(insertion).length !== 2) throw new Error('Ambiguous oxalate session integration anchor');
    result = result.replace(insertion, oxDzmSessionSource + insertion).replace(captureAnchor, capturePatched);
  }
  if (result.split(oxDzmSessionSource).length !== 2) throw new Error('Oxalate session source differs from the reproducible patch');
  if (result.split(capturePatched).length !== 2) throw new Error('Missing or duplicate oxalate session capture hook');
  return result;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = resolve(process.argv[2] || 'inline_kalkulator_klirens_07.js');
  const source = readFileSync(target, 'utf8'), next = patchOxDzmSessionHooks(source);
  if (next !== source) writeFileSync(target, next);
}
