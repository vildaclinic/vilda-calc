import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The new calculator owns its operands. Legacy aliases are evidence from an
// explicitly restored Ca_Cit session, never inputs borrowed after menu changes.
export const caCitSessionSource = String.raw`/* KLIRENS-CA-CIT-SESSION: source tools/patch-klirens-ca-cit-session.mjs */
(function installCaCitSessionAdapter() {
  "use strict";
  const DEFAULTS = Object.freeze({ CACIT_inputMode: "concentration", CACIT_calcium: "", CACIT_calciumUnit: "mmol/L",
    CACIT_citrate: "", CACIT_citrateUnit: "mg/dL", CACIT_reportedValue: "", CACIT_reportedUnit: "mg/mg",
    CACIT_sameSpecimen: "assumed", CACIT_collectionProblem: "", CACIT_collectionHours: "", CACIT_durationKnown: "",
    CACIT_sampleType: "timed", CACIT_sampleSource: "assumed-current", CACIT_durationSource: "", CACIT_sourceContext: "" });
  const SAMPLE_IDS = Object.freeze(["CACIT_sameSpecimen", "CACIT_collectionProblem", "CACIT_collectionHours", "CACIT_durationKnown",
    "CACIT_sampleType", "CACIT_sampleSource", "CACIT_durationSource"]);
  const PATIENT_IDS = Object.freeze(["age", "ageMonths", "ageDays", "sex", "weight", "height", "newbornContext"]);
  const CONTEXT_IDS = Object.freeze([...PATIENT_IDS, ...SAMPLE_IDS]);
  const originals = new WeakMap();
  const patientEditBindings = new WeakSet();
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
    if (!object(value) || !Object.keys(value).length || Object.keys(value).some(key => !["U_Ca", "U_Cit"].includes(key))) return null;
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
    if (doc.getElementById("formulaPicker")?.value !== "Ca_Cit") return {};
    const vault = window.__vildaClcrVersionValueVault;
    const captured = object(vault) && own(vault, "CACIT_legacyAliases") ? aliasValues(vault.CACIT_legacyAliases) : restoredAliases;
    return Object.freeze({ ...(captured || {}) });
  }
  function setControls(fields) {
    for (const [id, value] of Object.entries(fields)) {
      const control = document.getElementById(id);
      if (control) { if (control.type === "checkbox") control.checked = value === true || value === "true"; else control.value = primitive(value); }
    }
  }
  function sourceContexts(session, active, values) {
    const belongs = context => object(context) && !["sourceFormula", "sourceFormulaId", "formulaId"].some(key => own(context, key) && context[key] !== "Ca_Cit");
    const snapshots = [session.caCitSnapshot, session.context?.caCitSnapshot, session.sourceContext?.caCitSnapshot]
      .map(item => object(item?.snapshot) ? item.snapshot : item)
      .filter(item => object(item) && item.schema === "clcr-ca-cit" && item.version === 1 && item.sourceFormula === "Ca_Cit");
    const typed = [...snapshots.flatMap(item => [item.context, item.input]), session.context?.caCit, session.sourceContext?.caCit].filter(belongs);
    return active ? [values, ...typed, session.context, session.sourceContext].filter(belongs) : typed;
  }
  function sourceMetadata(session, values, active) {
    if (!active) return own(values, "CACIT_sourceContext") ? metadataText(values.CACIT_sourceContext) : "";
    const prior = own(values, "CACIT_sourceContext") ? values.CACIT_sourceContext : "";
    const snapshots = [session.caCitSnapshot, session.context?.caCitSnapshot, session.sourceContext?.caCitSnapshot]
      .map(item => object(item?.snapshot) ? item.snapshot : item)
      .filter(item => object(item) && item.schema === "clcr-ca-cit" && item.version === 1 && item.sourceFormula === "Ca_Cit");
    const belongs = item => object(item) && !["sourceFormula", "sourceFormulaId", "formulaId"].some(key => own(item, key) && item[key] !== "Ca_Cit");
    const keys = ["knownFacts", "confounders", "concentrationSameSpecimen", "sameSpecimen", "sameUrineSample", "reportedSameSpecimen", "CACIT_reportedSameSpecimen", "collectionProblem",
      "collectionHours", "durationHours", "hours", "durationKnown", "sampleType", "specimen", "sampleSource", "durationSource"];
    const inputFacts = Object.fromEntries(keys.filter(key => own(values, key)).map(key => [key, values[key]]));
    const contexts = [Object.keys(inputFacts).length ? inputFacts : null, ...snapshots.map(item => item.context), session.context, session.sourceContext].filter(belongs);
    let previous = prior;
    if (typeof previous === "string") { try { previous = JSON.parse(previous); } catch { previous = null; } }
    if (!contexts.length && !(object(previous) && previous.version === 1 && Array.isArray(previous.contexts))) return absent(prior) ? "" : metadataText(prior);
    const reusable = object(previous) && previous.version === 1 && Array.isArray(previous.contexts), seen = new Set();
    const sorted = item => Array.isArray(item) ? item.map(sorted) : object(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, sorted(item[key])])) : item;
    const combined = [...(reusable ? previous.contexts : []), ...contexts].filter(item => {
      const key = metadataText(sorted(item)); if (seen.has(key)) return false; seen.add(key); return true;
    });
    const metadata = { ...(reusable ? previous : { version: 1 }), contexts: combined,
      ...(!reusable && !absent(prior) ? { unreadableSourceContext: metadataText(prior) } : {}) };
    const fallback = object(metadata.patientFallback) ? { ...metadata.patientFallback } : {}, source = snapshots[0]?.context;
    for (const [group, ids] of [["age", ["age", "ageMonths", "ageDays"]], ["sex", ["sex"]]]) {
      if (object(fallback[group]) && ids.some(id => primitive(values[id]) !== primitive(fallback[group].fields?.[id]))) delete fallback[group];
      if (fallback[group] || ids.some(id => own(values, id)) || !object(source)) continue;
      if (group === "age" && typeof source.ageYears === "number" && Number.isFinite(source.ageYears)) {
        fallback.age = { fields: Object.fromEntries(ids.map(id => [id, ""])),
          context: Object.fromEntries(["ageYears", "ageYearsRaw", "ageExact", "agePrecision", "ageInterval"].filter(key => own(source, key)).map(key => [key, source[key]])) };
      } else if (group === "sex" && ["M", "F", "male", "female"].includes(source.sex)) fallback.sex = { fields: { sex: "" }, context: { sex: source.sex } };
    }
    if (Object.keys(fallback).length) metadata.patientFallback = fallback; else delete metadata.patientFallback;
    return metadataText(metadata);
  }
  function readContext(doc = document) {
    const vault = window.__vildaClcrVersionValueVault;
    const raw = doc.getElementById("CACIT_sourceContext")?.value ?? (object(vault) ? vault.CACIT_sourceContext : "");
    let metadata = raw;
    if (typeof metadata === "string") { try { metadata = metadata.trim() ? JSON.parse(metadata) : null; } catch { metadata = null; } }
    const contexts = object(metadata) && metadata.version === 1 && Array.isArray(metadata.contexts) ? metadata.contexts.filter(object) : [];
    const entries = new Map(), confounders = [], result = {};
    const adverseFalse = ["collectionStartVoidDiscarded", "collectionFinalVoidIncluded", "collectionNoMissedVoids", "collectionNoSpillage", "collectionNoExtraVoids", "collectionStorageFollowed"];
    const material = contexts.flatMap(context => [context, context.caCit,
      (object(context.caCitSnapshot?.snapshot) ? context.caCitSnapshot.snapshot : context.caCitSnapshot)?.context].filter(object));
    for (const context of material) {
      if (object(context.knownFacts)) for (const [key, value] of Object.entries(context.knownFacts)) {
        if (!entries.has(key) || adverseFalse.includes(key) && value === false || ["Cl24CollectionProblem", "knownIncomplete"].includes(key) && value === true) entries.set(key, value);
      }
      if (context.collectionProblem === true || context.collectionProblem === "true") result.collectionProblem = true;
      if (context.knownIncomplete === true) entries.set("knownIncomplete", true);
      const paired = context.CACIT_reportedSameSpecimen ?? context.reportedSameSpecimen;
      if (paired !== undefined && (result.reportedSameSpecimen === undefined || [false, "false", "no", "different"].includes(paired))) result.reportedSameSpecimen = paired;
      if (Array.isArray(context.confounders)) confounders.push(...context.confounders);
    }
    if (contexts.length) entries.set("importedMaterialContext", metadata);
    else if (!absent(raw)) entries.set("unreadableMaterialContext", primitive(raw));
    if (object(metadata) && own(metadata, "unreadableSourceContext")) entries.set("unreadableMaterialContext", metadata.unreadableSourceContext);
    const basis = doc.getElementById("CACIT_reportingEntity")?.value ?? (object(vault) ? vault.CACIT_reportingEntity : "");
    if (basis === "citric_acid") entries.set("legacyCitrateReportingBasis", "citric-acid");
    const fallback = object(metadata?.patientFallback) ? metadata.patientFallback : {};
    for (const group of ["age", "sex"]) if (object(fallback[group]) && object(fallback[group].fields) && object(fallback[group].context) &&
      Object.entries(fallback[group].fields).every(([id, value]) => primitive(doc.getElementById(id)?.value) === primitive(value))) Object.assign(result, fallback[group].context);
    return { ...result, knownFacts: Object.fromEntries(entries), ...(confounders.length ? { confounders } : {}) };
  }
  function bindPatientEdits() {
    for (const id of ["age", "ageMonths", "ageDays", "sex"]) {
      const control = document.getElementById(id);
      if (!control || patientEditBindings.has(control)) continue;
      const invalidate = event => {
        if (event?.isTrusted !== true) return;
        const carrier = document.getElementById("CACIT_sourceContext"), vault = window.__vildaClcrVersionValueVault;
        const raw = carrier?.value ?? (object(vault) ? vault.CACIT_sourceContext : "");
        let metadata; try { metadata = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return; }
        if (!object(metadata?.patientFallback)) return;
        delete metadata.patientFallback[id === "sex" ? "sex" : "age"];
        if (!Object.keys(metadata.patientFallback).length) delete metadata.patientFallback;
        const text = metadataText(metadata); if (carrier) carrier.value = text; if (object(vault)) vault.CACIT_sourceContext = text;
      };
      control.addEventListener("input", invalidate); control.addEventListener("change", invalidate); patientEditBindings.add(control);
    }
  }
  function sampleFacts(session, values, active) {
    const fields = {}, aliases = {
      CACIT_sameSpecimen: ["concentrationSameSpecimen", "sameSpecimen", "sameUrineSample"],
      CACIT_collectionProblem: ["collectionProblem"], CACIT_collectionHours: ["collectionHours", "durationHours", "hours"],
      CACIT_durationKnown: ["durationKnown"], CACIT_sampleType: ["sampleType", "specimen"],
      CACIT_sampleSource: ["sampleSource"], CACIT_durationSource: ["durationSource"]
    };
    for (const id of SAMPLE_IDS) {
      // An explicit blank remains unknown rather than reviving an older fact.
      if (own(values, id)) { fields[id] = primitive(values[id]); continue; }
      for (const context of sourceContexts(session, active, values)) {
        const facts = object(context.knownFacts) ? context.knownFacts : {};
        const source = [context, facts, object(context.clock) ? context.clock : {}]
          .find(item => own(item, id) || aliases[id].some(key => own(item, key)));
        if (!source) continue;
        const key = own(source, id) ? id : aliases[id].find(key => own(source, key));
        fields[id] = primitive(source[key]); break;
      }
    }
    if (active && !own(fields, "CACIT_collectionProblem") && (values.Cl24CollectionProblem === true || values.Cl24CollectionProblem === "true" ||
      ["collectionStartVoidDiscarded", "collectionFinalVoidIncluded", "collectionNoMissedVoids", "collectionNoSpillage", "collectionNoExtraVoids", "collectionStorageFollowed"].some(id => values["ui_" + id + "_answer"] === "no"))) fields.CACIT_collectionProblem = "true";
    if (!own(fields, "CACIT_collectionProblem") && sourceContexts(session, active, values).some(context => {
      const facts = object(context.knownFacts) ? context.knownFacts : {};
      return facts.Cl24CollectionProblem === true || facts.knownIncomplete === true ||
        ["collectionStartVoidDiscarded", "collectionFinalVoidIncluded", "collectionNoMissedVoids", "collectionNoSpillage", "collectionNoExtraVoids", "collectionStorageFollowed"].some(id => facts[id] === false);
    })) fields.CACIT_collectionProblem = "true";
    if (active && !own(fields, "CACIT_collectionHours") && !absent(values.Cl24DurationHours) &&
      (absent(values.Cl24DurationSource) || ["hours", "captured", "legacy-dates", "invalid"].includes(values.Cl24DurationSource))) {
      fields.CACIT_collectionHours = primitive(values.Cl24DurationHours);
      fields.CACIT_durationKnown = "true"; fields.CACIT_durationSource = "captured";
    }
    return fields;
  }
  function normalizeCaCit(session) {
    const values = originals.get(session) || incoming(session), active = selected(session, values) === "Ca_Cit";
    window.ClcrCaCitUi?.ensureControls?.(document);
    const fields = Object.fromEntries(Object.entries(DEFAULTS).map(([id, fallback]) => [id, own(values, id) ? primitive(values[id]) : fallback]));
    const hasDedicated = Object.keys(values).some(id => id.startsWith("CACIT_"));
    const legacy = active && !hasDedicated && (!absent(values.U_Ca) || !absent(values.U_Cit));
    const historicalMeasurement = active && (legacy || !absent(values.CACIT_calcium) || !absent(values.CACIT_citrate) || !absent(values.CACIT_reportedValue));
    if (legacy) {
      if (own(values, "U_Ca")) fields.CACIT_calcium = primitive(values.U_Ca);
      if (own(values, "U_Cit")) fields.CACIT_citrate = primitive(values.U_Cit);
    }
    const facts = sampleFacts(session, values, active);
    if (historicalMeasurement) {
      // The former DZM menu location does not establish this sample or clock.
      if (!own(facts, "CACIT_sampleType")) fields.CACIT_sampleType = "unknown";
      if (!own(facts, "CACIT_sampleSource")) fields.CACIT_sampleSource = "historical-missing";
      if (!own(facts, "CACIT_collectionHours") && !own(facts, "CACIT_durationKnown")) fields.CACIT_durationKnown = "false";
      if (!own(facts, "CACIT_collectionHours") && !own(facts, "CACIT_durationSource")) fields.CACIT_durationSource = "historical-missing";
    }
    Object.assign(fields, facts);
    fields.CACIT_sourceContext = sourceMetadata(session, values, active);
    bindPatientEdits();
    if (fields.CACIT_inputMode === "direct") fields.CACIT_inputMode = "reported";
    const unitAliases = { "g/g": "mg/mg", "mol/mol": "mmol/mmol" }, originalUnit = fields.CACIT_reportedUnit;
    fields.CACIT_reportedUnit = unitAliases[originalUnit] || originalUnit;
    setControls(fields);
    const applicable = Object.fromEntries(Object.entries(fields).filter(([id]) => active || own(values, id) || document.getElementById(id)));
    const next = { ...(object(session.inputs) ? session.inputs : {}), ...applicable };
    for (const id of PATIENT_IDS) if (own(values, id)) next[id] = values[id];
    if (active) {
      session.selectedFormula = "Ca_Cit";
      for (const id of PATIENT_IDS) if (!own(values, id)) next[id] = "";
    }
    if (own(values, "CACIT_reportedUnitOriginal")) next.CACIT_reportedUnitOriginal = values.CACIT_reportedUnitOriginal;
    else if (unitAliases[originalUnit]) next.CACIT_reportedUnitOriginal = originalUnit;
    if (own(values, "CACIT_reportingEntity")) next.CACIT_reportingEntity = values.CACIT_reportingEntity;
    else if (legacy) next.CACIT_reportingEntity = "citric_acid";
    const aliases = legacy ? Object.fromEntries(["U_Ca", "U_Cit"].filter(id => own(values, id) && !absent(values[id])).map(id => [id, primitive(values[id])])) : null;
    const encoded = aliases && Object.keys(aliases).length ? JSON.stringify(aliases) : own(values, "CACIT_legacyAliases") ? metadataText(values.CACIT_legacyAliases) : undefined;
    restoredAliases = aliasValues(encoded) || {};
    if (encoded !== undefined) next.CACIT_legacyAliases = encoded; else delete next.CACIT_legacyAliases;
    if (legacy) for (const id of ["U_Ca", "U_Cit"]) if (own(values, id)) next[id] = values[id];
    session.inputs = next;
  }
  function clearCaCit() {
    window.ClcrCaCitUi?.ensureControls?.(document); setControls(DEFAULTS); restoredAliases = {};
    const vault = window.__vildaClcrVersionValueVault;
    if (object(vault)) for (const id of Object.keys(vault)) if (id.startsWith("CACIT_")) delete vault[id];
  }
  function restoreClearedCaCit(event) {
    clearCaCit();
    if (event?.clcrClearedFormula !== "Ca_Cit") return;
    const saved = event.clcrPreservedCaCitContext;
    const fields = { ...DEFAULTS, ...Object.fromEntries(PATIENT_IDS.filter(id => own(saved, id) &&
      (typeof saved[id] === "string" || typeof saved[id] === "boolean" || typeof saved[id] === "number" && Number.isFinite(saved[id])))
      .map(id => [id, saved[id]])) };
    setControls(fields);
    const vault = object(window.__vildaClcrVersionValueVault) ? window.__vildaClcrVersionValueVault : (window.__vildaClcrVersionValueVault = {});
    Object.assign(vault, fields);
    setTimeout(() => { try { window.ClcrUiWorkflow?.refresh?.(); window.clcrUpdate?.(); } catch {} }, 0);
  }
  window.ClcrCaCitSession = Object.freeze({ DEFAULTS, CONTEXT_IDS, legacyAliasValues, readContext, clear: clearCaCit });
  window.ClcrCaCitUi?.ensureControls?.(document);
  bindPatientEdits();
  const replace = (name, implementation) => { if (!Reflect.set(globalThis, name, implementation)) throw new Error("Nie można zainstalować adaptera sesji: " + name); };
  const priorPrepare = prepareUaSession;
  replace("prepareUaSession", function prepareCaCitSession(session) {
    const prepared = priorPrepare(session);
    if (!object(prepared) || selected(prepared, incoming(prepared)) !== "Ca_Cit") return prepared;
    return { ...prepared, selectedFormula: "Ca_Cit", inputs: { ...(object(prepared.inputs) ? prepared.inputs : {}) },
      preservedInputs: object(prepared.preservedInputs) ? { ...prepared.preservedInputs } : prepared.preservedInputs };
  });
  const priorNormalize = normalizeCl24SessionInputs;
  replace("normalizeCl24SessionInputs", function captureCaCitBeforeNormalization(session) { originals.set(session, incoming(session)); priorNormalize(session); });
  const priorCa = normalizeCaDzmSessionInputs;
  replace("normalizeCaDzmSessionInputs", function normalizeCaCitAfterCa(session) { priorCa(session); normalizeCaCit(session); });
  const priorClear = clearCaDzmInputContext;
  replace("clearCaDzmInputContext", function clearCaCitAfterCa() { priorClear(); clearCaCit(); });
  const priorRestore = restoreClearedCaDzmContext;
  replace("restoreClearedCaDzmContext", function restoreCaCitAfterCa(event) { priorRestore(event); restoreClearedCaCit(event); });
})();
`;

const runtimeAnchor = '(function(){const b="vildaClcrSessionV1";';
const captureAnchor = 'try{window.ClcrCitDzmUi?.ensureControls?.(document)}catch{}';
const capturePatched = captureAnchor + 'try{window.ClcrCaCitUi?.ensureControls?.(document)}catch{}';
export function patchCaCitSessionHooks(source) {
  let result = source;
  if (!result.includes('/* KLIRENS-CA-CIT-SESSION:')) {
    if (result.split(runtimeAnchor).length !== 2 || result.split(captureAnchor).length !== 2) throw new Error('Ambiguous Ca/Cit session integration anchor');
    result = result.replace(runtimeAnchor, caCitSessionSource + runtimeAnchor).replace(captureAnchor, capturePatched);
  }
  if (result.split(caCitSessionSource).length !== 2) throw new Error('Ca/Cit session source differs from the reproducible patch');
  if (result.split(capturePatched).length !== 2) throw new Error('Missing or duplicate Ca/Cit session capture hook');
  return result;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = resolve(process.argv[2] || 'inline_kalkulator_klirens_07.js');
  const source = readFileSync(target, 'utf8'), next = patchCaCitSessionHooks(source);
  if (next !== source) writeFileSync(target, next);
}
