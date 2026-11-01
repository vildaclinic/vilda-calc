import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Additive potassium session boundary. The readable adapter does not infer a
// specimen from the shared U_K field while a doctor switches formulas.
export const potassiumDzmSessionSource = String.raw`/* KLIRENS-POTASSIUM-DZM-SESSION: source tools/patch-klirens-potassium-dzm-session.mjs */
(function installPotassiumDzmSessionAdapter() {
  "use strict";
  const DEFAULTS = Object.freeze({ K_inputMode: "concentration", K_concentration: "", K_volume: "", K_volumeUnit: "mL",
    K_reportedValue: "", K_reportedUnit: "mmol/24h", K_collectionHours: "24", K_collectionSource: "assumed-24h",
    K_outputUnit: "mmol/24h", K_unitConversions: "", K_durationNeedsConfirmation: false });
  const PROTOCOL_IDS = Object.freeze(["collectionStartVoidDiscarded", "collectionFinalVoidIncluded", "collectionNoMissedVoids",
    "collectionNoSpillage", "collectionNoExtraVoids", "collectionStorageFollowed"]);
  const CONTEXT_IDS = Object.freeze(["age", "ageMonths", "ageDays", "sex", "weight", "height", "newbornContext", "Cl24CollectionProblem",
    ...PROTOCOL_IDS.flatMap(id => [id, "ui_" + id + "_answer"])]);
  const originals = new WeakMap();
  const object = value => value && typeof value === "object" && !Array.isArray(value);
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
  const absent = value => value == null || typeof value === "string" && !value.trim();
  const confirmed = value => value === true || value === "true";
  const primitive = value => value == null ? "" : ["string", "number", "boolean"].includes(typeof value) ? String(value) : "";
  const incoming = session => ({ ...(object(session.preservedInputs) ? session.preservedInputs : {}), ...(object(session.inputs) ? session.inputs : {}) });
  const selected = (session, values) => session.selectedFormula || values.formulaPicker || "";
  const enteredHours = value => {
    if (typeof window.ClcrCollectionDuration?.parseHours === "function") return window.ClcrCollectionDuration.parseHours(value);
    if (!["number", "string"].includes(typeof value) || !/^[+]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?$/i.test(String(value).trim())) return null;
    const number = Number(String(value).trim().replace(",", "."));
    return Number.isFinite(number) && number > 0 && Number.isFinite(number * 60) ? number : null;
  };
  const metadata = value => {
    if (typeof value === "string") return value;
    if (!object(value)) return "";
    try { return JSON.stringify(value); } catch { return ""; }
  };
  function setControls(fields) {
    for (const [id, value] of Object.entries(fields)) {
      const control = document.getElementById(id);
      if (control) { if (control.type === "checkbox") control.checked = confirmed(value); else control.value = primitive(value); }
    }
  }
  // Only a captured instant with an explicit UTC offset is portable. Local
  // datetime controls are retained as text and never reparsed on this device.
  function capturedInstant(value) {
    if (typeof value !== "string") return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value.trim());
    if (!match) return null;
    const [, yearText, monthText, dayText, hourText, minuteText, secondText = "0", fraction = "", zone, sign, zoneHours = "0", zoneMinutes = "0"] = match;
    const [year, month, day, hour, minute, second] = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number);
    if (year < 100 || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59 || Number(zoneHours) > 23 || Number(zoneMinutes) > 59) return null;
    const utc = Date.UTC(year, month - 1, day, hour, minute, second, Number(fraction.padEnd(3, "0"))), date = new Date(utc);
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    const offset = zone === "Z" ? 0 : (Number(zoneHours) * 60 + Number(zoneMinutes)) * (sign === "+" ? 1 : -1);
    return utc - offset * 60000;
  }
  const sourceContexts = (session, values) => [values, session.context, session.sourceContext, session.collection, session.collectionAnalysis].filter(object)
    .flatMap(context => [context, context.collection, context.collectionAnalysis, context.inputs, context.referenceContext].filter(object));
  function capturedDuration(session, values) {
    const contexts = sourceContexts(session, values);
    for (const context of contexts) {
      for (const key of ["collectionHours", "durationHours", "recordedDurationHours"]) {
        if (own(context, key) && !absent(context[key])) return { hours: primitive(context[key]) || "invalid", source: context.durationSource === "invalid" ? "invalid" : context.durationSource === "legacy-dates" ? "legacy-dates" : "captured" };
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
    for (const context of contexts) {
      if (context.durationSource === "invalid") return { hours: "", source: "invalid" };
      const start = capturedInstant(context.collectionStartAt), end = capturedInstant(context.collectionEndAt);
      if (start !== null && end !== null) return { hours: String((end - start) / 3600000), source: "legacy-dates" };
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
  function durationFields(session, values, active, legacyAmount) {
    const raw = values.K_collectionHours, hasValue = own(values, "K_collectionHours");
    const unresolved = values.K_collectionSource === "historical-missing" || confirmed(values.K_durationNeedsConfirmation);
    if (values.K_collectionSource === "invalid") return { K_collectionHours: primitive(raw), K_collectionSource: "invalid", K_durationNeedsConfirmation: false };
    if (unresolved && enteredHours(raw) === null) return { K_collectionHours: primitive(raw), K_collectionSource: "historical-missing", K_durationNeedsConfirmation: true };
    if (hasValue && !absent(raw)) {
      const valid = enteredHours(raw);
      const source = valid !== null && ["assumed-24h", "hours", "captured", "legacy-dates"].includes(values.K_collectionSource) && !(values.K_collectionSource === "assumed-24h" && valid !== 24) ? values.K_collectionSource : "hours";
      return { K_collectionHours: primitive(raw) || "invalid", K_collectionSource: source, K_durationNeedsConfirmation: false };
    }
    // Only this explicitly new clock can be blank during editing. Shared
    // hours from another specimen must not overwrite that new-control default.
    if (hasValue && absent(raw) && values.K_collectionSource === "assumed-24h") return { K_collectionHours: "24", K_collectionSource: "assumed-24h", K_durationNeedsConfirmation: false };
    if (!hasValue || absent(raw)) {
      const captured = !hasValue && active ? capturedDuration(session, values) : null;
      if (captured) return { K_collectionHours: captured.hours, K_collectionSource: captured.source, K_durationNeedsConfirmation: false };
      // A restored measured amount is historical evidence. Unknown duration
      // limits a ready daily result and blocks a concentration calculation;
      // neither can gain a full-day reference from a new-control default.
      if (legacyAmount || !absent(values.K_concentration) || !absent(values.K_reportedValue) || active && (!absent(values.collectionStartAt) || !absent(values.collectionEndAt) || confirmed(values.durationNeedsConfirmation)) || hasValue && values.K_collectionSource !== "assumed-24h") {
        return { K_collectionHours: "", K_collectionSource: "historical-missing", K_durationNeedsConfirmation: true };
      }
    }
    return { K_collectionHours: "24", K_collectionSource: "assumed-24h", K_durationNeedsConfirmation: false };
  }
  function normalizePotassium(session) {
    const values = originals.get(session) || incoming(session), formula = selected(session, values), active = formula === "K_mmol_d";
    window.ClcrPotassiumDzmUi?.ensureControls?.(document);
    const fields = Object.fromEntries(Object.entries(DEFAULTS).map(([id, fallback]) => [id, own(values, id) ? id === "K_unitConversions" ? metadata(values[id]) : id === "K_durationNeedsConfirmation" ? confirmed(values[id]) : primitive(values[id]) : fallback]));
    const legacyAmount = active && !Object.keys(values).some(id => id.startsWith("K_")) && own(values, "U_K") && !absent(values.U_K);
    if (legacyAmount) {
      fields.K_concentration = primitive(values.U_K);
      if (own(values, "V24")) fields.K_volume = primitive(values.V24);
    }
    Object.assign(fields, durationFields(session, values, active, legacyAmount));
    setControls(fields);
    const applicable = Object.fromEntries(Object.entries(fields).filter(([id]) => active || own(values, id) || document.getElementById(id) || id === "K_durationNeedsConfirmation" && document.getElementById("K_collectionHours")));
    const next = { ...(object(session.inputs) ? session.inputs : {}), ...applicable };
    if (active) session.selectedFormula = formula;
    for (const id of [...CONTEXT_IDS, "collectionStartAt", "collectionEndAt"]) if (own(values, id)) next[id] = values[id];
    if (active) restoreCapturedFacts(session, values, next);
    // Keep the source fields for transparent export/undo, without assigning
    // another specimen's U_K to the dedicated form during formula selection.
    if (legacyAmount) for (const id of ["U_K", "V24", "Cl24DurationHours", "Cl24DurationSource", "durationNeedsConfirmation"]) if (own(values, id)) next[id] = values[id];
    session.inputs = next;
  }
  function clearPotassium() {
    window.ClcrPotassiumDzmUi?.ensureControls?.(document);
    setControls(DEFAULTS);
  }
  function restoreClearedPotassium(event) {
    clearPotassium();
    if (event?.clcrClearedFormula !== "K_mmol_d") return;
    const saved = event.clcrPreservedPotassiumDzmContext;
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
  window.ClcrPotassiumDzmSession = Object.freeze({ DEFAULTS, CONTEXT_IDS });
  window.ClcrPotassiumDzmUi?.ensureControls?.(document);
  const replaceBinding = (name, implementation) => {
    if (!Reflect.set(globalThis, name, implementation)) throw new Error("Nie można zainstalować adaptera sesji: " + name);
  };
  const priorPrepareUa = prepareUaSession;
  replaceBinding("prepareUaSession", function preparePotassiumDzmSession(session) {
    const prepared = priorPrepareUa(session);
    if (!object(prepared)) return prepared;
    if (selected(prepared, incoming(prepared)) !== "K_mmol_d") return prepared;
    const copy = { ...prepared, selectedFormula: "K_mmol_d", inputs: object(prepared.inputs) ? { ...prepared.inputs } : {}, preservedInputs: object(prepared.preservedInputs) ? { ...prepared.preservedInputs } : prepared.preservedInputs };
    // Earlier adapters also copy the common collection context. Seed only this
    // new copy before their normalization, so unknown checkbox defaults cannot
    // overwrite captured negative facts or discard portable source date text.
    restoreCapturedFacts(copy, incoming(copy), copy.inputs);
    return copy;
  });
  const priorNormalizeCl24 = normalizeCl24SessionInputs;
  replaceBinding("normalizeCl24SessionInputs", function capturePotassiumBeforeNormalization(session) { originals.set(session, incoming(session)); priorNormalizeCl24(session); });
  const priorNormalizeCa = normalizeCaDzmSessionInputs;
  replaceBinding("normalizeCaDzmSessionInputs", function normalizePotassiumAfterCa(session) { priorNormalizeCa(session); normalizePotassium(session); });
  const priorClearCa = clearCaDzmInputContext;
  replaceBinding("clearCaDzmInputContext", function clearPotassiumAfterCa() { priorClearCa(); clearPotassium(); });
  const priorRestoreCa = restoreClearedCaDzmContext;
  replaceBinding("restoreClearedCaDzmContext", function restorePotassiumAfterCa(event) { priorRestoreCa(event); restoreClearedPotassium(event); });
})();
`;

const marker = '/* KLIRENS-SODIUM-DZM-SESSION: source tools/patch-klirens-sodium-dzm-session.mjs */';
const adapterAnchor = '(function(){const b="vildaClcrSessionV1";';
const captureAnchor = 'try{window.ClcrSodiumDzmUi?.ensureControls?.(document)}catch{}';
const capturePatched = captureAnchor + 'try{window.ClcrPotassiumDzmUi?.ensureControls?.(document)}catch{}';
export function patchPotassiumDzmSessionHooks(source) {
  let result = source;
  if (!result.includes('/* KLIRENS-POTASSIUM-DZM-SESSION:')) {
    if (result.split(marker).length !== 2 || result.split(adapterAnchor).length !== 2 || result.split(captureAnchor).length !== 2) throw new Error('Ambiguous potassium session integration anchor');
    result = result.replace(adapterAnchor, potassiumDzmSessionSource + adapterAnchor).replace(captureAnchor, capturePatched);
  }
  if (result.split(potassiumDzmSessionSource).length !== 2) throw new Error('Potassium session source differs from the reproducible patch');
  if (result.split(capturePatched).length !== 2) throw new Error('Missing or duplicate potassium session capture hook');
  return result;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = resolve(process.argv[2] || 'inline_kalkulator_klirens_07.js');
  const source = readFileSync(target, 'utf8'), next = patchPotassiumDzmSessionHooks(source);
  if (next !== source) writeFileSync(target, next);
}
