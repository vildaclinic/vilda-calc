(function (root, factory) {
  const api = factory(root);
  if (root) root.VildaClcrPh = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";
  const ENGINE_VERSION = 1;
  const FIELD_IDS = Object.freeze(["U_pH"]);
  const CONTEXT_FIELD_IDS = Object.freeze(["spotSampleKind", "spotMenstruation", "spotHematuria", "spotInfection", "spotExercise", "spotAcuteIllness", "ui_spotMenstruation_answer", "ui_spotHematuria_answer", "ui_spotInfection_answer", "ui_spotExercise_answer", "ui_spotAcuteIllness_answer", "newbornContext", "age", "ageMonths", "ageDays"]);
  // Input validity only: this is not a physiological reference interval.
  const TECHNICAL_RANGE = Object.freeze({ lower: 0, upper: 14 });
  const ERRORS = Object.freeze({
    "missing-ph": "Wpisz pH moczu z wyniku badania.",
    "invalid-ph": "Wpisz jedną liczbę, np. 6,5.",
    "numeric-range": "Sprawdź zapis wyniku. pH musi mieścić się w skali od 0 do 14.",
    "numeric-precision": "Sprawdź dokładność wpisu pH. Tej wartości nie można zapisać bez zmiany jej cyfr.",
  });
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
  const object = value => Boolean(value && typeof value === "object" && !Array.isArray(value));
  const absent = value => value == null || typeof value === "string" && value.trim() === "";
  const fact = value => typeof value === "boolean" ? value : null;
  function freeze(value) { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  function copy(value) { if (Array.isArray(value)) return value.map(copy); if (object(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)])); return value; }
  function ordinary(text) {
    const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(text);
    if (!match || !(match[2] || match[3])) return null;
    const exponent = Number(match[4] || 0);
    if (!Number.isInteger(exponent) || Math.abs(exponent) > 512) return null;
    const digits = (match[2] || "0") + (match[3] || ""), point = (match[2] || "0").length + exponent;
    const expanded = point <= 0 ? "0." + "0".repeat(-point) + digits : point >= digits.length ? digits + "0".repeat(point - digits.length) : digits.slice(0, point) + "." + digits.slice(point);
    const normalized = expanded.replace(/^0+(?=\d)/, "").replace(/\.$/, "");
    return (match[1] === "-" && /[1-9]/.test(digits) ? "-" : "") + normalized;
  }
  function canonical(text) { return text.includes(".") ? text.replace(/0+$/, "").replace(/\.$/, "") : text; }
  function parseValue(value) {
    if (typeof value !== "string" && typeof value !== "number") return null;
    const text = String(value).trim().replace(",", ".");
    if (!text || text.length > 512) return null;
    const normalized = ordinary(text), number = Number(text);
    if (normalized === null || !Number.isFinite(number)) return null;
    const numericText = ordinary(String(number));
    // The vault stores at most 120 display characters. Preserve unusually
    // long entered precision in input, while showing an equivalent short
    // notation instead of letting that storage boundary truncate the value.
    const display = (normalized.length <= 64 ? normalized : String(Object.is(number, -0) ? 0 : number)).replace(".", ",");
    return { value: Object.is(number, -0) ? 0 : number, text: normalized, display, lossless: canonical(normalized) === canonical(numericText) };
  }
  function formatValue(value, originalValue) {
    const parsed = parseValue(originalValue == null ? value : originalValue);
    return parsed && parsed.lossless && parsed.value === value ? parsed.display : "";
  }
  function safeFacts(source) {
    const facts = {};
    for (const id of CONTEXT_FIELD_IDS) if (id !== "newbornContext" && own(source, id)) {
      const value = source[id];
      if (value == null || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value) || typeof value === "string" && value.length <= 128) facts[id] = value ?? null;
    }
    return facts;
  }
  function primitive(value) {
    if (value == null) return value ?? null;
    if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
    if (typeof value === "string") return value.length <= 512 ? value : "[invalid measurement]";
    return typeof value === "boolean" ? value : "[invalid measurement]";
  }
  function inputData(input) {
    const data = object(input) ? input : {};
    return {
      urinePh: primitive(own(data, "urinePh") ? data.urinePh : own(data, "U_pH") ? data.U_pH : ""),
      newbornContext: fact(data.newbornContext), knownFacts: safeFacts(data.knownFacts || data),
    };
  }
  function explicitNeonatalContext(values) {
    // The application already has an explicitly labelled neonatal days field
    // with a technical domain 0–28. Its documented use supplies context only:
    // it never selects Labcorp's interval or defines a new reference-age cutoff.
    const entries = ["age", "ageMonths", "ageDays"].map(id => own(values, id) && !absent(values[id]) ? parseValue(values[id]) : null);
    if (entries.some(value => !value || !value.lossless)) return null;
    const [years, months, days] = entries.map(value => value.value);
    return years === 0 && months === 0 && Number.isInteger(days) && days >= 0 && days <= 28 ? true : null;
  }
  function inputFromValues(values, context) {
    const data = object(values) ? values : {}, supplied = object(context) ? context : {};
    const knownFacts = { ...safeFacts(supplied.knownFacts), ...safeFacts(data) };
    const newbornContext = own(data, "newbornContext") ? data.newbornContext : own(supplied, "newbornContext") ? supplied.newbornContext : explicitNeonatalContext(knownFacts);
    return inputData({ urinePh: own(data, "U_pH") ? data.U_pH : "", newbornContext, knownFacts });
  }
  function readInputFromDocument(documentRef, context) {
    const doc = documentRef || root?.document;
    const vault = doc?.defaultView?.__vildaClcrVersionValueVault || root?.__vildaClcrVersionValueVault || {};
    const values = {};
    for (const id of [...FIELD_IDS, ...CONTEXT_FIELD_IDS]) {
      const control = doc?.getElementById(id);
      if (control) values[id] = control.type === "checkbox" || control.type === "radio" ? control.checked === true : control.value;
      else if (own(vault, id)) values[id] = vault[id];
    }
    return inputFromValues(values, context);
  }
  function compute(input) {
    const data = inputData(input);
    const fail = code => freeze({ ok: false, valid: false, rawValue: null, value: null, unit: "", errorCode: code, error: ERRORS[code], input: data });
    if (absent(data.urinePh)) return fail("missing-ph");
    const parsed = parseValue(data.urinePh);
    if (!parsed) return fail("invalid-ph");
    if (parsed.value < TECHNICAL_RANGE.lower || parsed.value > TECHNICAL_RANGE.upper) return fail("numeric-range");
    // Do not classify text just below/above a boundary as the rounded Number
    // on that boundary. Persisted numeric and displayed values must agree.
    if (!parsed.lossless) return fail("numeric-precision");
    return freeze({ ok: true, valid: true, rawValue: parsed.value, value: parsed.value, unit: "", display: { text: parsed.display, boundary: "" }, input: data, errorCode: "", error: "" });
  }
  function validPolicy(policy) {
    const profile = policy?.profiles?.[0];
    return policy?.quantity === "urine-ph" && policy.unit === "" && policy.referenceKind === "interval" && typeof policy.id === "string" && Number.isInteger(policy.version) && policy.version > 0 && Array.isArray(policy.profiles) && policy.profiles.length === 1 &&
      profile && typeof profile.id === "string" && Number.isFinite(profile.lower) && Number.isFinite(profile.upper) && profile.lower >= TECHNICAL_RANGE.lower && profile.upper <= TECHNICAL_RANGE.upper && profile.lower < profile.upper && typeof profile.lowerInclusive === "boolean" && typeof profile.upperInclusive === "boolean" && profile.unit === "" && ["label", "text", "sourceId", "sourceLabel"].every(key => typeof profile[key] === "string") &&
      policy.population && typeof policy.population.label === "string" && Array.isArray(policy.sources) && policy.sources.length > 0 && policy.sources.every(source => source && ["id", "label", "url"].every(key => typeof source[key] === "string")) && policy.sources.some(source => source.id === profile.sourceId) &&
      Array.isArray(policy.explanations) && policy.explanations.length > 0 && policy.explanations.every(rule => rule && typeof rule.id === "string" && (rule.upper === null || Number.isFinite(rule.upper)) && typeof rule.upperInclusive === "boolean" && typeof rule.text === "string") && policy.explanations.at(-1).upper === null &&
      policy.notes && ["referenceLabel", "referenceHint", "lowTitle", "withinTitle", "highTitle", "lowInterpretation", "highInterpretation", "newborn", "noPolicy"].every(key => typeof policy.notes[key] === "string");
  }
  function evaluate(input, policy) {
    const result = compute(input), data = result.input, hasPolicy = validPolicy(policy), notes = hasPolicy ? policy.notes : {};
    const profile = hasPolicy ? policy.profiles[0] : null;
    const reference = profile ? { kind: "interval", profileId: profile.id, lower: profile.lower, upper: profile.upper, lowerInclusive: profile.lowerInclusive, upperInclusive: profile.upperInclusive, unit: "", label: profile.label, text: profile.text, sourceIds: [profile.sourceId], sourceLabel: profile.sourceLabel, method: profile.method || "", sample: profile.sample || "" } : null;
    const status = !result.valid || !reference ? "unassessed" : result.rawValue < reference.lower || result.rawValue === reference.lower && !reference.lowerInclusive ? "low" : result.rawValue > reference.upper || result.rawValue === reference.upper && !reference.upperInclusive ? "high" : "within";
    const outside = status === "low" || status === "high";
    const explanation = hasPolicy && result.valid ? policy.explanations.find(rule => rule.upper === null || result.rawValue < rule.upper || result.rawValue === rule.upper && rule.upperInclusive) : null;
    const interpretation = !result.valid ? "" : !hasPolicy ? "Nie dobrano zakresu referencyjnego. Podana wartość pH pozostaje dostępna bez automatycznej oceny." : status === "low" ? notes.lowInterpretation : status === "high" ? notes.highInterpretation : explanation?.text || "";
    return freeze({
      schema: "clcr-ph", version: 1, engineVersion: ENGINE_VERSION, valid: result.valid, rawValue: result.rawValue, value: result.rawValue, unit: "", input: copy(data), display: result.display || { text: "", boundary: "" },
      status, statusText: !result.valid ? "" : hasPolicy ? notes[`${status}Title`] : "pH moczu", tone: outside ? "warning" : status === "within" ? "normal" : "neutral", outOfRange: status === "unassessed" ? null : outside, category: null,
      interpretation, explanationId: status === "within" ? explanation?.id || null : null, newbornContext: data.newbornContext, knownFacts: copy(data.knownFacts), cautions: hasPolicy && data.newbornContext === true ? [notes.newborn] : [],
      referenceAvailable: Boolean(reference), referenceActive: Boolean(reference && result.valid), reference, references: reference ? [copy(reference)] : [], referenceLabel: hasPolicy ? notes.referenceLabel : "Norma ogólna", referenceText: reference ? reference.text : "Brak dobranego zakresu", referenceHint: hasPolicy ? notes.referenceHint : "",
      policy: hasPolicy ? { id: policy.id, version: policy.version } : null, population: hasPolicy ? copy(policy.population) : null, sources: hasPolicy ? copy(policy.sources) : [], educationalReferences: hasPolicy ? copy(policy.educationalReferences || []) : [], restrictions: hasPolicy ? copy(policy.restrictions || {}) : {}, notes: hasPolicy ? copy(notes) : {},
      errorCode: result.errorCode, error: result.error,
    });
  }
  return Object.freeze({ ENGINE_VERSION, FIELD_IDS, CONTEXT_FIELD_IDS, TECHNICAL_RANGE, ERRORS, compute, evaluate, formatValue, parseValue, inputFromValues, readInputFromDocument });
});
