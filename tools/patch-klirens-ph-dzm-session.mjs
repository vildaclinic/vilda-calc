import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const phDzmSessionSource = String.raw`/* KLIRENS-PH-DZM-SESSION: source tools/patch-klirens-ph-dzm-session.mjs */
(function installPhDzmSessionAdapter() {
  "use strict";
  const PROTOCOL_IDS = Object.freeze(["collectionStartVoidDiscarded", "collectionFinalVoidIncluded", "collectionNoMissedVoids", "collectionNoSpillage", "collectionNoExtraVoids", "collectionStorageFollowed"]);
  const SAMPLE_IDS = Object.freeze(["PH24_sampleType", "PH24_sampleSource", "PH24_preservative", "PH24_infection"]);
  const CONTEXT_IDS = Object.freeze(["age", "ageMonths", "ageDays", "sex", "weight", "height", "Cl24DurationHours", "Cl24DurationSource", "durationNeedsConfirmation", "Cl24CollectionProblem", ...SAMPLE_IDS, ...PROTOCOL_IDS.flatMap(id => [id, "ui_" + id + "_answer"])]);
  const originals = new WeakMap();
  const object = value => Boolean(value && typeof value === "object" && !Array.isArray(value));
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
  const primitive = value => typeof value === "string" || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value);
  const absent = value => value == null || typeof value === "string" && !value.trim();
  const incoming = session => ({ ...(object(session?.preservedInputs) ? session.preservedInputs : {}), ...(object(session?.inputs) ? session.inputs : {}) });
  function controls(fields) {
    for (const [id, value] of Object.entries(fields)) {
      const control = document.getElementById(id);
      if (control) { if (control.type === "checkbox") control.checked = value === true; else control.value = value == null ? "" : String(value); }
    }
  }
  function prepare(session) {
    if (!object(session)) return session;
    const values = incoming(session), formula = session.selectedFormula || values.formulaPicker;
    if (formula !== "pH24") return session;
    return { ...session, selectedFormula: "pH24", inputs: object(session.inputs) ? { ...session.inputs } : {}, preservedInputs: object(session.preservedInputs) ? { ...session.preservedInputs } : session.preservedInputs };
  }
  function capturedContext(session) {
    const contexts = [session.context, session.sourceContext, session.collection, session.phDzmSnapshot, session.context?.phDzmSnapshot, session.sourceContext?.phDzmSnapshot, session.context?.assessment?.phDzmSnapshot, session.sourceContext?.assessment?.phDzmSnapshot].filter(object);
    const fields = {};
    for (const source of contexts) {
      const context = object(source.input) ? source.input : source;
      const facts = object(context.knownFacts) ? context.knownFacts : {};
      for (const id of CONTEXT_IDS) if (!own(fields, id) && own(facts, id) && primitive(facts[id])) fields[id] = facts[id];
      for (const [id, key] of [["Cl24DurationHours", "collectionHours"], ["Cl24DurationSource", "durationSource"], ["durationNeedsConfirmation", "durationNeedsConfirmation"], ["Cl24CollectionProblem", "collectionProblem"], ["PH24_sampleType", "sampleType"], ["PH24_sampleSource", "sampleSource"], ["PH24_preservative", "preservative"], ["PH24_infection", "infection"]]) {
        if (!own(fields, id) && own(context, key) && primitive(context[key])) fields[id] = context[key];
      }
      if (!own(fields, "Cl24DurationHours") && object(source.collection) && primitive(source.collection.hours)) fields.Cl24DurationHours = source.collection.hours;
    }
    return fields;
  }
  function normalize(session) {
    const values = originals.get(session) || incoming(session);
    const selected = (session.selectedFormula || values.formulaPicker) === "pH24";
    const fields = { pH24: own(values, "pH24") && primitive(values.pH24) ? values.pH24 : "" };
    const captured = selected ? capturedContext(session) : {};
    for (const id of SAMPLE_IDS) fields[id] = own(values, id) && primitive(values[id]) ? values[id] : own(captured, id) ? captured[id] : "";
    if (selected) {
      for (const id of CONTEXT_IDS) {
        if (own(values, id) && primitive(values[id])) fields[id] = values[id];
        else if (own(captured, id)) fields[id] = captured[id];
      }
      // A restored report without a recorded collection duration is not a
      // fresh default-24h sample. Keep its number without inventing a fact.
      if (!own(values, "Cl24DurationHours") && !own(captured, "Cl24DurationHours")) {
        fields.Cl24DurationHours = "";
        fields.Cl24DurationSource = "historical-missing";
        fields.durationNeedsConfirmation = true;
      } else if (!own(values, "Cl24DurationSource") && !own(captured, "Cl24DurationSource")) fields.Cl24DurationSource = absent(fields.Cl24DurationHours) ? "historical-missing" : "captured";
    }
    controls(fields);
    session.inputs = { ...session.inputs, ...fields };
  }
  function clear() {
    controls({ pH24: "", ...Object.fromEntries(SAMPLE_IDS.map(id => [id, ""])) });
    const vault = window.__vildaClcrVersionValueVault;
    if (object(vault)) for (const id of ["pH24", ...SAMPLE_IDS]) delete vault[id];
  }
  function restoreClear(event) {
    clear();
    if (event?.clcrClearedFormula !== "pH24" || !object(event.clcrPreservedPhDzmContext)) return;
    const saved = event.clcrPreservedPhDzmContext;
    const fields = { ...Object.fromEntries(CONTEXT_IDS.filter(id => own(saved, id) && primitive(saved[id])).map(id => [id, saved[id]])), pH24: "" };
    controls(fields);
    const vault = object(window.__vildaClcrVersionValueVault) ? window.__vildaClcrVersionValueVault : (window.__vildaClcrVersionValueVault = {});
    Object.assign(vault, fields);
    setTimeout(() => { try { window.ClcrUiWorkflow?.refresh?.(); window.clcrUpdate?.(); } catch {} }, 0);
  }
  window.ClcrPhDzmSession = Object.freeze({ CONTEXT_IDS, SAMPLE_IDS, clear });
  const replace = (name, implementation) => { if (!Reflect.set(globalThis, name, implementation)) throw new Error("Nie można zainstalować adaptera sesji: " + name); };
  const priorPrepare = preparePhSession;
  replace("preparePhSession", function preparePhDzmBeforePh(session) { return priorPrepare(prepare(session)); });
  const priorDuration = normalizeCl24SessionInputs;
  replace("normalizeCl24SessionInputs", function capturePhDzmBeforeDuration(session) { originals.set(session, incoming(session)); priorDuration(session); });
  const priorNormalize = normalizeCaDzmSessionInputs;
  replace("normalizeCaDzmSessionInputs", function normalizePhDzmAfterCa(session) { priorNormalize(session); normalize(session); });
  const priorClear = clearCaDzmInputContext;
  replace("clearCaDzmInputContext", function clearPhDzmAfterCa() { priorClear(); clear(); });
  const priorRestore = restoreClearedCaDzmContext;
  replace("restoreClearedCaDzmContext", function restorePhDzmAfterCa(event) { priorRestore(event); restoreClear(event); });
})();
`;

export function patchPhDzmSessionHooks(source) {
  const marker = '/* KLIRENS-PH-DZM-SESSION:';
  if (source.includes(marker)) {
    if (source.split(phDzmSessionSource).length !== 2) throw new Error('pH DZM session source differs from its readable source');
    return source;
  }
  const anchor = '/* KLIRENS-CA-CIT-SESSION:';
  if (source.split(anchor).length !== 2) throw new Error('Missing or duplicate pH DZM session anchor');
  return source.replace(anchor, phDzmSessionSource + anchor);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = resolve(process.argv[2] || 'inline_kalkulator_klirens_07.js');
  const source = readFileSync(target, 'utf8'), next = patchPhDzmSessionHooks(source);
  if (source !== next) writeFileSync(target, next);
}
