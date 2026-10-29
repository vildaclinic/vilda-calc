import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Additive wrappers preserve every preceding audited patch byte-for-byte.
// Session restoration owns provenance; it never parses old wall-clock dates.
export const mgDzmSessionSource = String.raw`/* KLIRENS-MG-DZM-SESSION: source tools/patch-klirens-mg-dzm-session.mjs */
(function installMgDzmSessionAdapter() {
  "use strict";
  const DEFAULTS = Object.freeze({ MG_inputMode: "concentration", MG_concentration: "", MG_concentrationUnit: "mg/L",
    MG_volume: "", MG_volumeUnit: "mL", MG_reportedValue: "", MG_reportedUnit: "mg/24h", MG_collectionHours: "24", MG_collectionSource: "assumed-24h" });
  const PROTOCOL_IDS = Object.freeze(["collectionStartVoidDiscarded", "collectionFinalVoidIncluded", "collectionNoMissedVoids",
    "collectionNoSpillage", "collectionNoExtraVoids", "collectionStorageFollowed"]);
  const CONTEXT_IDS = Object.freeze(["age", "ageMonths", "ageDays", "sex", "weight", "height", "newbornContext", "Cl24CollectionProblem",
    ...PROTOCOL_IDS.flatMap(id => [id, "ui_" + id + "_answer"])]);
  const TIMED = new Set(["cl24", "Ca_mgkg", "UA_mgkg", "Mg_mgkg", "PO4_mgkg", "Prot_mgkg", "Na_mmol_d", "K_mmol_d", "Ox_mgkg", "Cit_mgkg", "pH24"]);
  const originals = new WeakMap();
  const object = value => value && typeof value === "object" && !Array.isArray(value);
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
  const absent = value => value == null || typeof value === "string" && !value.trim();
  const primitive = value => value == null ? "" : ["string", "number", "boolean"].includes(typeof value) ? String(value) : "";
  const incoming = session => ({ ...(object(session.preservedInputs) ? session.preservedInputs : {}), ...(object(session.inputs) ? session.inputs : {}) });
  const original = session => originals.get(session) || incoming(session);
  const selected = (session, values) => session.selectedFormula || values.formulaPicker || "";
  const numeric = value => {
    if (!["number", "string"].includes(typeof value) || !/^[+]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?$/i.test(String(value).trim())) return null;
    const number = Number(String(value).trim().replace(",", "."));
    return Number.isFinite(number) && number > 0 && Number.isFinite(number * 60) ? number : null;
  };
  const enteredHours = value => typeof window.ClcrCollectionDuration?.parseHours === "function"
    ? window.ClcrCollectionDuration.parseHours(value)
    : numeric(value);
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
        // Explicit invalid captured evidence must remain invalid, never become
        // a new assumed complete day simply because its value is nonpositive.
        return minutes !== null && Number.isFinite(minutes) ? String(minutes / 60) : primitive(context[key]);
      }
    }
    // A numeric duration already resolved by the prior device is safe. An
    // assumed default inserted for another formula is not captured evidence.
    if (!absent(values.Cl24DurationHours) && (!own(values, "Cl24DurationSource") || ["hours", "captured", "legacy-dates", "invalid"].includes(values.Cl24DurationSource))) return primitive(values.Cl24DurationHours);
    return null;
  }
  function durationFields(session, values, fieldId, sourceId, applicable) {
    const confirmationId = fieldId === "Cl24DurationHours" ? "durationNeedsConfirmation" : fieldId.split("_")[0] + "_durationNeedsConfirmation";
    const raw = values[fieldId], hasValue = own(values, fieldId);
    const unresolved = values[sourceId] === "historical-missing" || (values[confirmationId] === true || values[confirmationId] === "true");
    // A historical gap is resolved only by a valid positive duration. Typing
    // zero, a negative value, or text must not turn its next blank into 24 h.
    if (unresolved && enteredHours(raw) === null) return { [fieldId]: primitive(raw), [sourceId]: "historical-missing", [confirmationId]: true };
    if (hasValue && !absent(raw)) {
      const text = primitive(raw) || "invalid";
      return { [fieldId]: text, [sourceId]: enteredHours(raw) !== null && ["assumed-24h", "hours", "captured", "legacy-dates"].includes(values[sourceId]) && !(values[sourceId] === "assumed-24h" && enteredHours(raw) !== 24) ? values[sourceId] : "hours", [confirmationId]: false };
    }
    if (!hasValue && applicable) {
      const hours = capturedDuration(session, values);
      if (hours !== null) return { [fieldId]: hours, [sourceId]: "captured", [confirmationId]: false };
      if (!absent(values.collectionStartAt) || !absent(values.collectionEndAt)) return { [fieldId]: "", [sourceId]: "historical-missing", [confirmationId]: true };
    }
    return { [fieldId]: "24", [sourceId]: "assumed-24h", [confirmationId]: false };
  }
  function applicableDuration(session, values, fieldId, sourceId, active) {
    const confirmationId = fieldId === "Cl24DurationHours" ? "durationNeedsConfirmation" : fieldId.split("_")[0] + "_durationNeedsConfirmation";
    // A minimal/older DOM may never have rendered unrelated calculators. Do
    // not add their defaults to a round trip; the real UI materializes them.
    return active || window.ClcrCollectionDuration && document.getElementById(fieldId) || !absent(values[fieldId]) || values[sourceId] === "historical-missing" || (values[confirmationId] === true || values[confirmationId] === "true");
  }
  function normalizeMg(session) {
    const values = original(session), formula = selected(session, values), isMg = formula === "Mg_mgkg";
    window.ClcrMgDzmUi?.ensureControls?.(document);
    const hasMg = Object.keys(DEFAULTS).some(id => own(values, id));
    const fields = Object.fromEntries(Object.entries(DEFAULTS).map(([id, fallback]) => [id, own(values, id) ? primitive(values[id]) : fallback]));
    if (isMg && !hasMg) {
      if (own(values, "U_Mg")) fields.MG_concentration = primitive(values.U_Mg);
      if (own(values, "V24")) fields.MG_volume = primitive(values.V24);
    }
    Object.assign(fields, durationFields(session, values, "MG_collectionHours", "MG_collectionSource", isMg));
    setControls(fields);
    const applicable = Object.fromEntries(Object.entries(fields).filter(([id]) => isMg || own(values, id) || document.getElementById(id) || id === "MG_durationNeedsConfirmation" && document.getElementById("MG_collectionHours")));
    const next = { ...(object(session.inputs) ? session.inputs : {}), ...applicable };
    if (isMg) session.selectedFormula = formula;
    // Explicit preserved blanks and known contradictions belong to this
    // incoming patient; old values must never leak from the previous card.
    for (const id of [...CONTEXT_IDS, "collectionStartAt", "collectionEndAt"]) if (own(values, id)) next[id] = values[id];
    session.inputs = next;
  }
  function normalizeDurations(session) {
    const values = original(session), formula = selected(session, values), fields = {};
    for (const [fieldId, sourceId, formulaId] of [["Cl24DurationHours", "Cl24DurationSource", null], ["CA_collectionHours", "CA_collectionSource", "Ca_mgkg"], ["UA_collectionHours", "UA_collectionSource", "UA_mgkg"]]) {
      const active = formulaId ? formula === formulaId : TIMED.has(formula);
      if (applicableDuration(session, values, fieldId, sourceId, active)) Object.assign(fields, durationFields(session, values, fieldId, sourceId, active));
    }
    setControls(fields);
    session.inputs = { ...session.inputs, ...fields };
  }
  function clearMg() {
    window.ClcrMgDzmUi?.ensureControls?.(document);
    setControls({ ...DEFAULTS, MG_durationNeedsConfirmation: false });
  }
  function clearDurations() {
    const fields = { Cl24DurationHours: "24", Cl24DurationSource: "assumed-24h", durationNeedsConfirmation: false };
    for (const prefix of ["CA", "UA", "MG"]) Object.assign(fields, { [prefix + "_collectionHours"]: "24", [prefix + "_collectionSource"]: "assumed-24h", [prefix + "_durationNeedsConfirmation"]: false });
    setControls(fields);
    window.ClcrCollectionDuration?.ensureDefaults?.(document);
  }
  function restoreClearedMg(event) {
    clearMg();
    clearDurations();
    if (event?.clcrClearedFormula !== "Mg_mgkg") return;
    const saved = event.clcrPreservedMgDzmContext;
    if (!object(saved)) return;
    const fields = Object.fromEntries(CONTEXT_IDS.filter(id => own(saved, id) &&
      (typeof saved[id] === "string" || typeof saved[id] === "boolean" || typeof saved[id] === "number" && Number.isFinite(saved[id])))
      .map(id => [id, saved[id]]));
    Object.assign(fields, DEFAULTS, { MG_durationNeedsConfirmation: false });
    setControls(fields);
    const vault = object(window.__vildaClcrVersionValueVault) ? window.__vildaClcrVersionValueVault : (window.__vildaClcrVersionValueVault = {});
    Object.assign(vault, fields);
    setTimeout(() => { try { window.ClcrUiWorkflow?.refresh?.(); window.clcrUpdate?.(); } catch {} }, 0);
  }
  window.ClcrMgDzmSession = Object.freeze({ DEFAULTS, CONTEXT_IDS });
  window.ClcrMgDzmUi?.ensureControls?.(document);
  const priorPrepareUa = prepareUaSession;
  const replaceBinding = (name, implementation) => {
    if (!Reflect.set(globalThis, name, implementation)) throw new Error("Nie można zainstalować adaptera sesji: " + name);
  };
  replaceBinding("prepareUaSession", function prepareMgDzmSession(session) {
    const prepared = priorPrepareUa(session);
    if (!object(prepared)) return prepared;
    const values = incoming(prepared);
    if (selected(prepared, values) !== "Mg_mgkg") return prepared;
    return { ...prepared, selectedFormula: "Mg_mgkg", inputs: object(prepared.inputs) ? prepared.inputs : {}, preservedInputs: object(prepared.preservedInputs) ? { ...prepared.preservedInputs } : prepared.preservedInputs };
  });
  // The old cl24 adapter reparsed local dates. Replace the binding with a
  // numeric-only reader while retaining its independent protocol migration.
  replaceBinding("normalizeCl24SessionInputs", function normalizeNumericCollectionSession(session) {
    const values = incoming(session);
    originals.set(session, values);
    const active = TIMED.has(selected(session, values));
    const fields = applicableDuration(session, values, "Cl24DurationHours", "Cl24DurationSource", active)
      ? durationFields(session, values, "Cl24DurationHours", "Cl24DurationSource", active)
      : { Cl24DurationHours: own(values, "Cl24DurationHours") ? values.Cl24DurationHours : "", Cl24DurationSource: own(values, "Cl24DurationSource") ? values.Cl24DurationSource : "" };
    fields.Cl24CollectionProblem = values.Cl24CollectionProblem === true;
    for (const id of PROTOCOL_IDS) {
      const key = "ui_" + id + "_answer";
      if (own(values, key)) fields[key] = values[key];
      else if (values[id] === true) fields[key] = "yes";
    }
    session.inputs = { ...session.inputs, ...fields };
  });
  const priorNormalizeUa = normalizeUaSessionInputs;
  replaceBinding("normalizeUaSessionInputs", function normalizeMgAfterUa(session) { priorNormalizeUa(session); normalizeMg(session); });
  const priorNormalizeCa = normalizeCaDzmSessionInputs;
  replaceBinding("normalizeCaDzmSessionInputs", function normalizeDurationAfterCa(session) { priorNormalizeCa(session); normalizeDurations(session); });
  const priorClearCa = clearCaDzmInputContext;
  replaceBinding("clearCaDzmInputContext", function clearMgAfterCa() { priorClearCa(); clearMg(); clearDurations(); });
  const priorRestoreCa = restoreClearedCaDzmContext;
  replaceBinding("restoreClearedCaDzmContext", function restoreMgAfterCa(event) { priorRestoreCa(event); restoreClearedMg(event); });
})();
`;

const marker = '(function(){const b="vildaClcrSessionV1";';
const captureAnchor = 'function h(){try{window.ClcrUaUi?.ensureControls?.(document)}catch{}const e=document.getElementById("clcrForm");';
const capturePatched = captureAnchor + 'try{window.ClcrMgDzmUi?.ensureControls?.(document)}catch{}';
export function patchMgDzmSessionHooks(source) {
  let result = source;
  if (!result.includes('/* KLIRENS-MG-DZM-SESSION:')) {
    if (result.split(marker).length !== 2 || result.split(captureAnchor).length !== 2) throw new Error('Ambiguous magnesium session integration anchor');
    result = result.replace(marker, mgDzmSessionSource + marker).replace(captureAnchor, capturePatched);
  }
  if (result.split(mgDzmSessionSource).length !== 2) throw new Error('Magnesium session source differs from the reproducible patch');
  if (result.split(capturePatched).length !== 2) throw new Error('Missing or duplicate magnesium session capture hook');
  return result;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = resolve(process.argv[2] || 'inline_kalkulator_klirens_07.js');
  const source = readFileSync(target, 'utf8'), next = patchMgDzmSessionHooks(source);
  if (next !== source) writeFileSync(target, next);
}
