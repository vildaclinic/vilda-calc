import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Installed synchronously after the other readable adapters have defined their
// functions, before the existing runtime can restore or capture a session.
export const ktvSessionSource = String.raw`/* KLIRENS-KTV-SESSION: source tools/patch-klirens-ktv-session.mjs */
function installKtvSessionAdapter() {
  "use strict";
  const FIELD_IDS = Object.freeze(["ktvVariant", "UreaPre", "UreaPost", "ktvDurationMinutes", "ktvUF", "ktvW", "ktvSessionsPerWeek", "ktvPidiDays", "ktvAccessType"]);
  const PROTOCOL_IDS = Object.freeze(["ktvSameSession", "ktvPreBeforeDialysis", "ktvPreNoDilution"]);
  const ANSWER_IDS = Object.freeze(PROTOCOL_IDS.map(id => "ui_" + id + "_answer"));
  const CONTEXT_IDS = Object.freeze(["ktvModality", "ktvUreaAnalyte", "ktvUreaUnit", "ktvPreAnalyte", "ktvPostAnalyte", "ktvPreUnit", "ktvPostUnit", ...PROTOCOL_IDS, "ktvPostMethod", "ktvKru", "ktvKruMeasuredAt", "ktvTreatmentsDelivered", ...ANSWER_IDS, "ktvKnownFacts"]);
  const OWN_IDS = Object.freeze([...FIELD_IDS, ...CONTEXT_IDS]);
  const FACT_IDS = new Set(CONTEXT_IDS.filter(id => id !== "ktvKnownFacts"));
  const FIELD_MAP = Object.freeze({ ktvVariant: "variant", UreaPre: "preUrea", UreaPost: "postUrea", ktvDurationMinutes: "durationMinutes", ktvUF: "netUfLiters", ktvW: "postWeightKg", ktvSessionsPerWeek: "sessionsPerWeek", ktvPidiDays: "pidiDays", ktvAccessType: "accessType", age: "ageYears", ageMonths: "ageMonths" });
  const CHECKBOX_IDS = new Set([...PROTOCOL_IDS, "ktvTreatmentsDelivered"]);
  const DEFAULTS = Object.freeze(Object.fromEntries(OWN_IDS.map(id => [id, id === "ktvVariant" ? "spktv" : CHECKBOX_IDS.has(id) ? false : ""])));
  const originals = new WeakMap();
  const object = value => Boolean(value && typeof value === "object" && !Array.isArray(value));
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
  const primitive = value => typeof value === "string" || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value);
  const incoming = session => ({ ...(object(session?.preservedInputs) ? session.preservedInputs : {}), ...(object(session?.inputs) ? session.inputs : {}) });
  const variant = value => String(value == null ? "" : value).trim().toLowerCase() || "spktv";
  function knownFacts(value) {
    if (typeof value === "string") { try { value = JSON.parse(value); } catch { return {}; } }
    return object(value) ? Object.fromEntries(Object.entries(value).filter(([id, fact]) => FACT_IDS.has(id) && (fact === null || primitive(fact)))) : {};
  }
  function readContext(doc = document) {
    const vault = doc.defaultView?.__vildaClcrVersionValueVault || window.__vildaClcrVersionValueVault;
    const value = doc.getElementById("ktvKnownFacts")?.value ?? (object(vault) ? vault.ktvKnownFacts : "");
    const facts = knownFacts(value);
    // A restored unsupported <select> value can be blank in the browser even
    // though the captured specimen fact is still present in the version vault.
    for (const id of CONTEXT_IDS) {
      if (CHECKBOX_IDS.has(id) || ANSWER_IDS.includes(id) || id === "ktvKnownFacts" || !object(vault) || !own(vault, id)) continue;
      const control = doc.getElementById(id), live = control?.value;
      if ((live == null || String(live).trim() === "") && primitive(vault[id]) && String(vault[id]).trim() !== "" && !own(facts, id)) facts[id] = vault[id];
    }
    return { knownFacts: facts };
  }
  function controls(fields) {
    for (const [id, value] of Object.entries(fields)) {
      const control = document.getElementById(id);
      if (control) { if (control.type === "checkbox") control.checked = value === true || value === "true"; else control.value = value == null ? "" : String(value); }
    }
  }
  function prepare(session) {
    if (!object(session)) return session;
    const values = incoming(session), formula = session.selectedFormula || values.formulaPicker || "";
    if (formula !== "KTV" && (formula || values.ktvToggle !== true)) return session;
    return { ...session, currentVersion: "pro", selectedFormula: "KTV", inputs: object(session.inputs) ? { ...session.inputs } : {}, preservedInputs: object(session.preservedInputs) ? { ...session.preservedInputs } : session.preservedInputs };
  }
  function capturedFields(session, values) {
    const belongs = value => object(value) && !["sourceFormula", "sourceFormulaId", "formulaId"].some(key => own(value, key) && value[key] !== "KTV");
    const snapshots = [session.ktvSnapshot, session.context?.ktvSnapshot, session.sourceContext?.ktvSnapshot].filter(value => belongs(value) && value.schema === "clcr-ktv" && value.version === 1);
    const contexts = [...snapshots.flatMap(value => [value.input, value.context]), session.context, session.sourceContext].filter(belongs);
    const fields = {};
    for (const snapshot of snapshots) for (const [id, key] of Object.entries(FIELD_MAP)) if (!own(fields, id) && own(snapshot.input, key) && primitive(snapshot.input[key])) fields[id] = snapshot.input[key];
    for (const context of contexts) for (const id of OWN_IDS) if (!own(fields, id) && own(context, id) && primitive(context[id])) fields[id] = context[id];
    // Only typed facts or an explicit answer establish a negative. An old
    // unchecked checkbox is not evidence that a sampling rule was violated.
    const facts = [...contexts.map(context => context.knownFacts), values.knownFacts, knownFacts(values.ktvKnownFacts)].filter(object).map(knownFacts);
    const combined = Object.assign({}, ...facts);
    for (const id of CONTEXT_IDS) {
      if (ANSWER_IDS.includes(id) || id === "ktvKnownFacts" || own(combined, id)) continue;
      const value = own(values, id) ? values[id] : fields[id];
      if (CHECKBOX_IDS.has(id) ? value === true : primitive(value) && String(value).trim() !== "") combined[id] = value;
    }
    for (const id of PROTOCOL_IDS) {
      const answer = values["ui_" + id + "_answer"];
      if (answer === "yes" || answer === "no") combined[id] = answer === "yes";
      else if (answer === "unknown" && combined[id] !== false) delete combined[id];
    }
    if (Object.keys(combined).length) fields.ktvKnownFacts = JSON.stringify(combined);
    for (const context of facts) for (const id of OWN_IDS) if (!own(fields, id) && own(context, id) && primitive(context[id])) fields[id] = context[id];
    for (const id of PROTOCOL_IDS) {
      const answer = "ui_" + id + "_answer";
      const fact = typeof combined[id] === "boolean" ? combined : null;
      if (fact && !own(values, answer) && !own(fields, answer)) fields[answer] = fact[id] ? "yes" : "no";
    }
    return fields;
  }
  function normalize(session) {
    const values = originals.get(session) || incoming(session);
    const selected = (session.selectedFormula || values.formulaPicker) === "KTV";
    const fields = selected ? capturedFields(session, values) : {};
    for (const id of OWN_IDS) if (own(values, id) && primitive(values[id]) && (!selected || id !== "ktvKnownFacts")) fields[id] = values[id];
    if (!selected && own(fields, "ktvKnownFacts")) fields.ktvKnownFacts = JSON.stringify(knownFacts(fields.ktvKnownFacts));
    if (selected || own(fields, "ktvVariant")) fields.ktvVariant = variant(fields.ktvVariant);
    for (const id of PROTOCOL_IDS) {
      const answer = "ui_" + id + "_answer";
      if (["yes", "no", "unknown"].includes(fields[answer])) fields[id] = fields[answer] === "yes";
    }
    controls({ ...DEFAULTS, ...fields });
    // No default keys are added to an unrelated or never-rendered calculator.
    session.inputs = { ...session.inputs, ...fields };
  }
  function clear() {
    controls(DEFAULTS);
    const vault = window.__vildaClcrVersionValueVault;
    if (object(vault)) for (const id of OWN_IDS) delete vault[id];
  }
  function restoreClear(event) {
    clear();
    const selected = variant(event?.clcrPreservedKtvVariant);
    if (event?.clcrClearedFormula !== "KTV" || !["spktv", "ektv", "urr"].includes(selected)) return;
    controls({ ktvVariant: selected });
    const vault = object(window.__vildaClcrVersionValueVault) ? window.__vildaClcrVersionValueVault : (window.__vildaClcrVersionValueVault = {});
    vault.ktvVariant = selected;
  }
  window.ClcrKtvSession = Object.freeze({ FIELD_IDS, CONTEXT_IDS, OWN_IDS, DEFAULTS, readContext, clear });
  const replace = (name, implementation) => { if (!Reflect.set(globalThis, name, implementation)) throw new Error("Nie można zainstalować adaptera sesji: " + name); };
  const priorPrepare = preparePhSession;
  replace("preparePhSession", function prepareKtvBeforePh(session) { return priorPrepare(prepare(session)); });
  const priorDuration = normalizeCl24SessionInputs;
  replace("normalizeCl24SessionInputs", function captureKtvBeforeDuration(session) { originals.set(session, incoming(session)); priorDuration(session); });
  const priorNormalize = normalizeCaDzmSessionInputs;
  replace("normalizeCaDzmSessionInputs", function normalizeKtvAfterCa(session) { priorNormalize(session); normalize(session); });
  const priorClear = clearCaDzmInputContext;
  replace("clearCaDzmInputContext", function clearKtvAfterCa() { priorClear(); clear(); });
  const priorRestore = restoreClearedCaDzmContext;
  replace("restoreClearedCaDzmContext", function resetKtvAfterNativeClear(event) { priorRestore(event); restoreClear(event); });
}
`;

export function patchKtvSessionHooks(source) {
  const marker = '/* KLIRENS-KTV-SESSION:';
  const anchor = '(function(){const b="vildaClcrSessionV1";installPhDzmSessionAdapter();';
  const hook = anchor + 'installKtvSessionAdapter();';
  if (source.includes(marker)) {
    if (source.split(ktvSessionSource).length !== 2 || source.split(hook).length !== 2) throw new Error('Kt/V session source differs from its readable source');
    return source;
  }
  if (source.split(anchor).length !== 2) throw new Error('Missing or duplicate Kt/V session anchor');
  return ktvSessionSource + source.replace(anchor, hook);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = resolve(process.argv[2] || 'inline_kalkulator_klirens_07.js');
  const source = readFileSync(target, 'utf8'), next = patchKtvSessionHooks(source);
  if (source !== next) writeFileSync(target, next);
}
