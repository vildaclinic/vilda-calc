/* One reported pH from a 24-hour urine collection. No daily extrapolation. */
(function (root, factory) {
  const api = factory(root);
  if (root) root.VildaClcrPhDzm = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";
  const ENGINE_VERSION = 1, FIELD_IDS = Object.freeze(["pH24"]);
  const PROTOCOL_IDS = Object.freeze(["collectionStartVoidDiscarded", "collectionFinalVoidIncluded", "collectionNoMissedVoids", "collectionNoSpillage", "collectionNoExtraVoids", "collectionStorageFollowed"]);
  const PROTOCOL_KEYS = Object.freeze(["startVoidDiscarded", "finalVoidIncluded", "noMissedVoids", "noSpillage", "noExtraVoids", "storageFollowed"]);
  const CONTEXT_FIELD_IDS = Object.freeze(["Cl24DurationHours", "Cl24DurationSource", "durationNeedsConfirmation", "Cl24CollectionProblem", "PH24_sampleType", "PH24_sampleSource", "PH24_preservative", "PH24_infection", ...PROTOCOL_IDS, ...PROTOCOL_IDS.map(id => `ui_${id}_answer`)]);
  const TECHNICAL_RANGE = Object.freeze({ lower: 0, upper: 14 });
  const ERRORS = Object.freeze({ "missing-ph": "Wpisz pH z raportu dobowej zbiórki moczu.", "invalid-ph": "Wpisz jedną liczbę, np. 6,5.", "numeric-range": "Sprawdź zapis wyniku. pH musi mieścić się w skali od 0 do 14.", "numeric-precision": "Sprawdź dokładność wpisu pH. Tej wartości nie można zapisać bez zmiany jej cyfr." });
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
  const object = value => Boolean(value && typeof value === "object" && !Array.isArray(value));
  const absent = value => value == null || typeof value === "string" && !value.trim();
  const confirmed = value => value === true || value === "true";
  function freeze(value) { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  function copy(value) { if (Array.isArray(value)) return value.map(copy); if (object(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)])); return value; }
  function primitive(value) { if (value == null) return null; if (typeof value === "number") return Number.isFinite(value) ? value : String(value); if (typeof value === "string") return value.length <= 512 ? value : "[invalid measurement]"; return typeof value === "boolean" ? value : "[invalid measurement]"; }
  function safeFacts(source) {
    const facts = {};
    for (const id of CONTEXT_FIELD_IDS) if (own(source, id)) {
      const value = source[id];
      if (value == null || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value) || typeof value === "string" && value.length <= 128) facts[id] = value ?? null;
    }
    return facts;
  }
  function ordinary(text) {
    const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(text);
    if (!match || !(match[2] || match[3])) return null;
    const exponent = Number(match[4] || 0);
    if (!Number.isInteger(exponent) || Math.abs(exponent) > 512) return null;
    const digits = (match[2] || "0") + (match[3] || ""), point = (match[2] || "0").length + exponent;
    const expanded = point <= 0 ? "0." + "0".repeat(-point) + digits : point >= digits.length ? digits + "0".repeat(point - digits.length) : digits.slice(0, point) + "." + digits.slice(point);
    return (match[1] === "-" && /[1-9]/.test(digits) ? "-" : "") + expanded.replace(/^0+(?=\d)/, "").replace(/\.$/, "");
  }
  function canonical(text) { return text.includes(".") ? text.replace(/0+$/, "").replace(/\.$/, "") : text; }
  function parseValue(value) {
    if (typeof value !== "string" && typeof value !== "number") return null;
    const text = String(value).trim().replace(",", ".");
    if (!text || text.length > 512) return null;
    const normalized = ordinary(text), number = Number(text);
    if (normalized === null || !Number.isFinite(number)) return null;
    const numericText = ordinary(String(number));
    const display = (normalized.length <= 64 ? normalized : String(Object.is(number, -0) ? 0 : number)).replace(".", ",");
    return { value: Object.is(number, -0) ? 0 : number, text: normalized, display, lossless: canonical(normalized) === canonical(numericText) };
  }
  function formatValue(value, originalValue) {
    const parsed = parseValue(originalValue == null ? value : originalValue);
    return parsed && parsed.lossless && parsed.value === value ? parsed.display : "";
  }
  function inputData(input) {
    const data = object(input) ? input : {};
    const sampleSource = typeof data.sampleSource === "string" && data.sampleSource.trim() ? data.sampleSource.slice(0, 128) : "assumed-current";
    const sampleType = typeof data.sampleType === "string" && data.sampleType.trim() ? data.sampleType.slice(0, 128) : /^(?:historical|legacy|unknown)/.test(sampleSource) ? "unknown" : "timed";
    return {
      urinePh: primitive(own(data, "urinePh") ? data.urinePh : own(data, "pH24") ? data.pH24 : ""),
      collectionHours: primitive(own(data, "collectionHours") ? data.collectionHours : null), durationSource: typeof data.durationSource === "string" ? data.durationSource.slice(0, 128) : "",
      durationNeedsConfirmation: confirmed(data.durationNeedsConfirmation), collectionProblem: confirmed(data.collectionProblem),
      sampleType, sampleSource,
      preservative: typeof data.preservative === "string" ? data.preservative.slice(0, 128) : "", infection: typeof data.infection === "boolean" ? data.infection : null,
      knownFacts: safeFacts(data.knownFacts || data),
    };
  }
  function inputFromValues(values, context) {
    const data = object(values) ? values : {}, supplied = object(context) ? context : {};
    const directFacts = safeFacts(data);
    // The shared DOM has legacy unchecked confirmation boxes. They are not
    // explicit negative findings; stored knownFacts retain that distinction.
    PROTOCOL_IDS.forEach(id => { if (directFacts[id] === false) delete directFacts[id]; });
    const knownFacts = { ...safeFacts(supplied.knownFacts), ...safeFacts(data.knownFacts), ...directFacts };
    if (supplied.knownFacts?.Cl24CollectionProblem === true || data.knownFacts?.Cl24CollectionProblem === true) knownFacts.Cl24CollectionProblem = true;
    const take = (id, key, fallback) => own(data, id) ? data[id] : own(supplied, key) ? supplied[key] : own(knownFacts, id) ? knownFacts[id] : fallback;
    if (object(supplied.protocol)) PROTOCOL_IDS.forEach((id, index) => { if (supplied.protocol[PROTOCOL_KEYS[index]] === false) knownFacts[`ui_${id}_answer`] = "no"; });
    return inputData({ urinePh: own(data, "pH24") ? data.pH24 : "", collectionHours: take("Cl24DurationHours", "collectionHours", own(supplied, "durationHours") ? supplied.durationHours : null),
      durationSource: take("Cl24DurationSource", "durationSource", ""), durationNeedsConfirmation: supplied.durationHistorical === true || supplied.durationNeedsConfirmation === true || confirmed(take("durationNeedsConfirmation", "durationNeedsConfirmation", false)),
      collectionProblem: supplied.collectionProblem === true || knownFacts.Cl24CollectionProblem === true || confirmed(take("Cl24CollectionProblem", "collectionProblem", false)),
      sampleType: take("PH24_sampleType", "sampleType", "timed"), sampleSource: take("PH24_sampleSource", "sampleSource", "assumed-current"),
      preservative: take("PH24_preservative", "preservative", ""), infection: confirmed(take("PH24_infection", "infection", null)) ? true : take("PH24_infection", "infection", null) === false || take("PH24_infection", "infection", null) === "false" ? false : null, knownFacts });
  }
  function readInputFromDocument(documentRef, context) {
    const doc = documentRef || root?.document, values = {}, vault = doc?.defaultView?.__vildaClcrVersionValueVault || root?.__vildaClcrVersionValueVault || {};
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
    if (!parsed.lossless) return fail("numeric-precision");
    return freeze({ ok: true, valid: true, rawValue: parsed.value, value: parsed.value, unit: "", display: { text: parsed.display, boundary: "" }, input: data, errorCode: "", error: "" });
  }
  function collectionFromInput(data) {
    const historical = data.durationNeedsConfirmation || data.durationSource === "historical-missing";
    const absentHours = absent(data.collectionHours), parsed = absentHours ? null : parseValue(data.collectionHours);
    const explicitInvalid = data.durationSource === "invalid";
    const hours = !explicitInvalid && absentHours && !historical ? 24 : !explicitInvalid && parsed?.lossless && parsed.value > 0 ? parsed.value : null;
    const source = hours === null ? explicitInvalid || !absentHours ? "invalid" : "historical-missing" : absentHours || data.durationSource === "assumed-24h" && hours === 24 ? "assumed-24h" : ["captured", "legacy-dates", "hours"].includes(data.durationSource) ? data.durationSource : "hours";
    const knownProblems = [];
    PROTOCOL_IDS.forEach(id => { if (data.knownFacts[`ui_${id}_answer`] === "no" || data.knownFacts[id] === false) knownProblems.push(id); });
    // DOM checkboxes may be unchecked because no confirmation was requested.
    // Only explicit answers and already recorded facts constitute adversity.
    if (data.collectionProblem || data.knownFacts.Cl24CollectionProblem === true) knownProblems.push("Cl24CollectionProblem");
    return { hours, source, assumed: source === "assumed-24h", complete: knownProblems.length === 0, knownProblems };
  }
  function validPolicy(policy) {
    const profile = policy?.profiles?.[0], sampling = policy?.sampling;
    return policy?.quantity === "urine-ph-dzm" && policy.unit === "" && policy.referenceKind === "interval" && typeof policy.id === "string" && Number.isInteger(policy.version) && policy.version > 0 && Array.isArray(policy.profiles) && policy.profiles.length === 1 &&
      profile && typeof profile.id === "string" && Number.isFinite(profile.lower) && Number.isFinite(profile.upper) && profile.lower >= TECHNICAL_RANGE.lower && profile.upper <= TECHNICAL_RANGE.upper && profile.lower < profile.upper && typeof profile.lowerInclusive === "boolean" && typeof profile.upperInclusive === "boolean" && profile.unit === "" && ["label", "text", "sourceId", "sourceLabel"].every(key => typeof profile[key] === "string") &&
      policy.population && typeof policy.population.label === "string" && Array.isArray(policy.sources) && policy.sources.length > 0 && policy.sources.every(source => source && ["id", "label", "url"].every(key => typeof source[key] === "string")) && policy.sources.some(source => source.id === profile.sourceId) &&
      sampling && Number.isFinite(sampling.collectionHours) && sampling.collectionHours > 0 && Array.isArray(sampling.sampleTypes) && sampling.sampleTypes.every(value => typeof value === "string") && Array.isArray(sampling.incompatiblePreservatives) && sampling.incompatiblePreservatives.every(value => typeof value === "string") &&
      Array.isArray(policy.explanations) && policy.explanations.length > 0 && policy.explanations.every(rule => rule && typeof rule.id === "string" && (rule.upper === null || Number.isFinite(rule.upper)) && typeof rule.upperInclusive === "boolean" && typeof rule.text === "string") && policy.explanations.at(-1).upper === null &&
      policy.notes && ["referenceLabel", "referenceHint", "lowTitle", "withinTitle", "highTitle", "lowInterpretation", "highInterpretation", "noPolicy", "incompatiblePreservative", "incompatibleSample", "incompleteCollection", "durationMissing", "durationInvalid", "non24h", "knownInfection"].every(key => typeof policy.notes[key] === "string");
  }
  function evaluate(input, policy) {
    const result = compute(input), data = result.input, hasPolicy = validPolicy(policy), notes = hasPolicy ? policy.notes : {};
    const collection = collectionFromInput(data), sample = { type: data.sampleType, source: data.sampleSource, preservative: data.preservative }, reasons = [];
    const canonicalKind = value => value.trim().toLowerCase().replace(/[_ ]+/g, "-");
    if (hasPolicy) {
      if (!policy.sampling.sampleTypes.includes(canonicalKind(sample.type))) reasons.push("incompatible-sample");
      if (policy.sampling.incompatiblePreservatives.includes(canonicalKind(sample.preservative))) reasons.push("incompatible-preservative");
      if (!collection.complete) reasons.push("incomplete-collection");
      if (collection.hours === null) reasons.push(collection.source === "invalid" ? "invalid-duration" : "missing-duration");
      else if (collection.hours !== policy.sampling.collectionHours) reasons.push("non-24h");
    }
    const eligible = hasPolicy && reasons.length === 0;
    const profile = eligible ? policy.profiles[0] : null;
    const reference = profile ? { kind: "interval", profileId: profile.id, lower: profile.lower, upper: profile.upper, lowerInclusive: profile.lowerInclusive, upperInclusive: profile.upperInclusive, unit: "", label: profile.label, text: profile.text, sourceIds: [profile.sourceId], sourceLabel: profile.sourceLabel, method: profile.method || "", sample: profile.sample || "" } : null;
    const status = !result.valid || !reference ? "unassessed" : result.rawValue < reference.lower || result.rawValue === reference.lower && !reference.lowerInclusive ? "low" : result.rawValue > reference.upper || result.rawValue === reference.upper && !reference.upperInclusive ? "high" : "within";
    const outside = status === "low" || status === "high";
    const explanation = hasPolicy && result.valid ? policy.explanations.find(rule => rule.upper === null || result.rawValue < rule.upper || result.rawValue === rule.upper && rule.upperInclusive) : null;
    const reasonNote = { "incompatible-sample": notes.incompatibleSample, "incompatible-preservative": notes.incompatiblePreservative, "incomplete-collection": notes.incompleteCollection, "missing-duration": notes.durationMissing, "invalid-duration": notes.durationInvalid, "non-24h": notes.non24h };
    const interpretation = !result.valid ? "" : !hasPolicy ? "Nie dobrano zakresu referencyjnego. Podana wartość pH pozostaje dostępna bez automatycznej oceny." : reasons.length ? reasonNote[reasons[0]] : data.infection === true ? notes.knownInfection : status === "low" ? notes.lowInterpretation : status === "high" ? notes.highInterpretation : explanation?.text || "";
    return freeze({
      schema: "clcr-ph-dzm", version: 1, engineVersion: ENGINE_VERSION, valid: result.valid, rawValue: result.rawValue, value: result.rawValue, unit: "", input: copy(data), display: result.display || { text: "", boundary: "" },
      status, statusText: !result.valid ? "" : status === "unassessed" ? "Wynik z raportu · bez porównania" : notes[`${status}Title`], tone: outside ? "warning" : status === "within" ? "normal" : "neutral", outOfRange: status === "unassessed" ? null : outside, category: null,
      interpretation, explanationId: status === "within" && data.infection !== true ? explanation?.id || null : null, knownFacts: copy(data.knownFacts), cautions: [],
      collection, sample, eligibility: { eligible, reasons }, referenceAvailable: hasPolicy, referenceActive: Boolean(reference && result.valid), reference, references: reference ? [copy(reference)] : [], referenceLabel: hasPolicy ? notes.referenceLabel : "Norma ogólna", referenceText: reference ? reference.text : "Brak porównania", referenceHint: hasPolicy ? notes.referenceHint : "",
      policy: hasPolicy ? { id: policy.id, version: policy.version } : null, population: hasPolicy ? copy(policy.population) : null, sources: hasPolicy ? copy(policy.sources) : [], educationalReferences: hasPolicy ? copy(policy.educationalReferences || []) : [], restrictions: hasPolicy ? copy(policy.restrictions || {}) : {}, notes: hasPolicy ? copy(notes) : {},
      errorCode: result.errorCode, error: result.error,
    });
  }
  return Object.freeze({ ENGINE_VERSION, FIELD_IDS, CONTEXT_FIELD_IDS, PROTOCOL_IDS, TECHNICAL_RANGE, ERRORS, compute, evaluate, formatValue, parseValue, inputFromValues, readInputFromDocument });
});
