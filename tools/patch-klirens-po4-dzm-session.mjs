import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Additive wrappers preserve every preceding audited patch byte-for-byte.
// Only numeric captured duration is portable between devices and timezones.
export const po4DzmSessionSource = String.raw`/* KLIRENS-PO4-DZM-SESSION: source tools/patch-klirens-po4-dzm-session.mjs */
(function installPo4DzmSessionAdapter() {
  "use strict";
  const DEFAULTS = Object.freeze({ PO4_inputMode: "concentration", PO4_concentration: "", PO4_concentrationUnit: "mgP/dL",
    PO4_volume: "", PO4_volumeUnit: "mL", PO4_reportedValue: "", PO4_reportedUnit: "mgP/24h", PO4_outputUnit: "mgP/24h",
    PO4_collectionHours: "24", PO4_collectionSource: "assumed-24h", PO4_unitConversions: "" });
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
  function durationFields(session, values, active) {
    const raw = values.PO4_collectionHours, hasValue = own(values, "PO4_collectionHours");
    const unresolved = values.PO4_collectionSource === "historical-missing" || values.PO4_durationNeedsConfirmation === true || values.PO4_durationNeedsConfirmation === "true";
    if (unresolved && enteredHours(raw) === null) return { PO4_collectionHours: primitive(raw), PO4_collectionSource: "historical-missing", PO4_durationNeedsConfirmation: true };
    if (hasValue && !absent(raw)) {
      const valid = enteredHours(raw);
      const source = valid !== null && ["assumed-24h", "hours", "captured", "legacy-dates"].includes(values.PO4_collectionSource) && !(values.PO4_collectionSource === "assumed-24h" && valid !== 24) ? values.PO4_collectionSource : "hours";
      return { PO4_collectionHours: primitive(raw) || "invalid", PO4_collectionSource: source, PO4_durationNeedsConfirmation: false };
    }
    if (!hasValue && active) {
      const hours = capturedDuration(session, values);
      if (hours !== null) return { PO4_collectionHours: hours, PO4_collectionSource: "captured", PO4_durationNeedsConfirmation: false };
      if (!absent(values.collectionStartAt) || !absent(values.collectionEndAt)) return { PO4_collectionHours: "", PO4_collectionSource: "historical-missing", PO4_durationNeedsConfirmation: true };
    }
    return { PO4_collectionHours: "24", PO4_collectionSource: "assumed-24h", PO4_durationNeedsConfirmation: false };
  }
  function normalizePo4(session) {
    const values = originals.get(session) || incoming(session), formula = selected(session, values), active = formula === "PO4_mgkg";
    window.ClcrPo4DzmUi?.ensureControls?.(document);
    const fields = Object.fromEntries(Object.entries(DEFAULTS).map(([id, fallback]) => [id, own(values, id) ? id === "PO4_unitConversions" ? conversionMetadata(values[id]) : primitive(values[id]) : fallback]));
    // Old U_PO4 is phosphorus mass in mgP/dL, and V24 is mL. Keep the
    // original decimal text; a stored duration never rescales these inputs.
    if (active && values.PO4_inputMode !== "reported") {
      if (!own(values, "PO4_concentration") && !own(values, "PO4_concentrationUnit") && own(values, "U_PO4")) fields.PO4_concentration = primitive(values.U_PO4);
      if (!own(values, "PO4_volume") && !own(values, "PO4_volumeUnit") && own(values, "V24")) fields.PO4_volume = primitive(values.V24);
    }
    Object.assign(fields, durationFields(session, values, active));
    setControls(fields);
    const applicable = Object.fromEntries(Object.entries(fields).filter(([id]) => active || own(values, id) || document.getElementById(id) || id === "PO4_durationNeedsConfirmation" && document.getElementById("PO4_collectionHours")));
    const next = { ...(object(session.inputs) ? session.inputs : {}), ...applicable };
    if (active) session.selectedFormula = formula;
    // Explicit blanks and known collection contradictions are this patient's
    // facts. Earlier adapters already reset missing protocol facts to unknown.
    for (const id of [...CONTEXT_IDS, "collectionStartAt", "collectionEndAt"]) if (own(values, id)) next[id] = values[id];
    session.inputs = next;
  }
  function clearPo4() {
    window.ClcrPo4DzmUi?.ensureControls?.(document);
    setControls({ ...DEFAULTS, PO4_durationNeedsConfirmation: false });
  }
  function restoreClearedPo4(event) {
    clearPo4();
    if (event?.clcrClearedFormula !== "PO4_mgkg") return;
    const saved = event.clcrPreservedPo4DzmContext;
    if (!object(saved)) return;
    const fields = Object.fromEntries(CONTEXT_IDS.filter(id => own(saved, id) &&
      (typeof saved[id] === "string" || typeof saved[id] === "boolean" || typeof saved[id] === "number" && Number.isFinite(saved[id])))
      .map(id => [id, saved[id]]));
    Object.assign(fields, DEFAULTS, { PO4_durationNeedsConfirmation: false });
    setControls(fields);
    const vault = object(window.__vildaClcrVersionValueVault) ? window.__vildaClcrVersionValueVault : (window.__vildaClcrVersionValueVault = {});
    Object.assign(vault, fields);
    setTimeout(() => { try { window.ClcrUiWorkflow?.refresh?.(); window.clcrUpdate?.(); } catch {} }, 0);
  }
  window.ClcrPo4DzmSession = Object.freeze({ DEFAULTS, CONTEXT_IDS });
  window.ClcrPo4DzmUi?.ensureControls?.(document);
  const replaceBinding = (name, implementation) => {
    if (!Reflect.set(globalThis, name, implementation)) throw new Error("Nie można zainstalować adaptera sesji: " + name);
  };
  const priorPrepareUa = prepareUaSession;
  replaceBinding("prepareUaSession", function preparePo4DzmSession(session) {
    const prepared = priorPrepareUa(session);
    if (!object(prepared)) return prepared;
    if (selected(prepared, incoming(prepared)) !== "PO4_mgkg") return prepared;
    return { ...prepared, selectedFormula: "PO4_mgkg", inputs: object(prepared.inputs) ? prepared.inputs : {}, preservedInputs: object(prepared.preservedInputs) ? { ...prepared.preservedInputs } : prepared.preservedInputs };
  });
  const priorNormalizeCl24 = normalizeCl24SessionInputs;
  replaceBinding("normalizeCl24SessionInputs", function capturePo4BeforeNormalization(session) { originals.set(session, incoming(session)); priorNormalizeCl24(session); });
  const priorNormalizeCa = normalizeCaDzmSessionInputs;
  replaceBinding("normalizeCaDzmSessionInputs", function normalizePo4AfterCa(session) { priorNormalizeCa(session); normalizePo4(session); });
  const priorClearCa = clearCaDzmInputContext;
  replaceBinding("clearCaDzmInputContext", function clearPo4AfterCa() { priorClearCa(); clearPo4(); });
  const priorRestoreCa = restoreClearedCaDzmContext;
  replaceBinding("restoreClearedCaDzmContext", function restorePo4AfterCa(event) { priorRestoreCa(event); restoreClearedPo4(event); });
})();
`;

const marker = '(function(){const b="vildaClcrSessionV1";';
const captureAnchor = 'function h(){try{window.ClcrUaUi?.ensureControls?.(document)}catch{}const e=document.getElementById("clcrForm");try{window.ClcrMgDzmUi?.ensureControls?.(document)}catch{}';
const capturePatched = captureAnchor + 'try{window.ClcrPo4DzmUi?.ensureControls?.(document)}catch{}';
const snapshotAnchor = 'o.inputs.currentVersion=t,o.inputs.formulaPicker=r,o}';
const snapshotPatched = 'o.inputs.currentVersion=t,o.inputs.formulaPicker=r,o.inputs=window.ClcrCollectionDuration?.normalizeCapturedInputs?.(o.inputs)||o.inputs,o}';
export function patchPo4DzmSessionHooks(source) {
  let result = source;
  if (!result.includes('/* KLIRENS-PO4-DZM-SESSION:')) {
    if (result.split(marker).length !== 2 || result.split(captureAnchor).length !== 2) throw new Error('Ambiguous phosphorus session integration anchor');
    result = result.replace(marker, po4DzmSessionSource + marker).replace(captureAnchor, capturePatched);
  }
  if (result.split(po4DzmSessionSource).length !== 2) throw new Error('Phosphorus session source differs from the reproducible patch');
  if (result.split(capturePatched).length !== 2) throw new Error('Missing or duplicate phosphorus session capture hook');
  if (!result.includes(snapshotPatched)) {
    if (result.split(snapshotAnchor).length !== 2) throw new Error('Ambiguous captured duration normalization anchor');
    result = result.replace(snapshotAnchor, snapshotPatched);
  }
  if (result.split(snapshotPatched).length !== 2) throw new Error('Missing or duplicate captured duration normalization hook');
  return result;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = resolve(process.argv[2] || 'inline_kalkulator_klirens_07.js');
  const source = readFileSync(target, 'utf8'), next = patchPo4DzmSessionHooks(source);
  if (next !== source) writeFileSync(target, next);
}
