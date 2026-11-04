/* Frozen K/(K+Na) records. Verify their captured arithmetic and neutral
 * presentation without consulting today's engine or clinical source profile. */
(function (root, factory) {
  const api = factory();
  if (root) root.ClcrPotassiumIndexPersistence = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  const FORMULA = "K_frac", LABEL = "Udział potasu — K/(K+Na)";
  const FIELD_MAP = Object.freeze({ U_K: "potassiumValue", U_Na: "sodiumValue" });
  const CONTEXT_MAP = Object.freeze({ KFR_sameSpecimen: "sameSpecimen", KFR_sampleType: "sampleType" });
  const DEFAULTS = Object.freeze({ U_K: "", U_Na: "" });
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
  const object = value => Boolean(value && typeof value === "object" && !Array.isArray(value));
  const finite = value => typeof value === "number" && Number.isFinite(value);
  const normalized = value => String(value ?? "").replace(/\s+/g, "").replace(/−/g, "-").replace(/,/g, ".");
  const hasContextField = (context, key) => own(context, key);
  const contextValue = (context, key) => context?.[key];
  const inputValue = (snapshot, key) => snapshot?.input?.[key];
  function safe(value, depth = 0) {
    if (value === null || typeof value === "boolean" || typeof value === "string" && value.length <= 20000 || finite(value)) return true;
    if (depth > 18 || !value || typeof value !== "object") return false;
    const entries = Object.entries(value);
    return entries.length <= 1000 && entries.every(([key, item]) => !["__proto__", "prototype", "constructor"].includes(key) && safe(item, depth + 1));
  }
  function reduced(n, d = 1n) {
    if (d <= 0n || n < 0n) return null;
    let a = n, b = d;
    while (b) { const remainder = a % b; a = b; b = remainder; }
    const divisor = a || 1n;
    return { n: n / divisor, d: d / divisor };
  }
  function fraction(value, maximumLength = 512) {
    if (!["string", "number"].includes(typeof value)) return null;
    const text = String(value).trim().replace(/−/g, "-").replace(",", ".");
    if (text.length > maximumLength) return null;
    const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(text);
    if (!match || !(match[2] || match[3])) return null;
    const exponent = Number(match[4] || 0);
    if (!Number.isInteger(exponent) || Math.abs(exponent) > 4096) return null;
    const n = BigInt((match[2] || "0") + (match[3] || ""));
    if (!n) return reduced(0n);
    if (match[1] === "-") return null;
    const scale = (match[3] || "").length - Number(match[4] || 0);
    if (!Number.isInteger(scale) || Math.abs(scale) > 4096) return null;
    return scale >= 0 ? reduced(n, 10n ** BigInt(scale)) : reduced(n * 10n ** BigInt(-scale));
  }
  function wire(value) {
    if (!object(value) || !/^\d{1,4096}$/.test(value.numerator || "") || !/^\d{1,4096}$/.test(value.denominator || "")) return null;
    return reduced(BigInt(value.numerator), BigInt(value.denominator));
  }
  const multiply = (a, b) => reduced(a.n * b.n, a.d * b.d);
  const divide = (a, b) => b.n ? reduced(a.n * b.d, a.d * b.n) : null;
  const compare = (a, b) => a.n * b.d < b.n * a.d ? -1 : a.n * b.d > b.n * a.d ? 1 : 0;
  const equal = (a, b) => Boolean(a && b && compare(a, b) === 0);
  function stable(value) {
    if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
    if (object(value)) return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + stable(value[key])).join(",") + "}";
    return JSON.stringify(value);
  }
  function validShown(text, quantity, approximate) {
    if (typeof text !== "string" || typeof approximate !== "boolean") return false;
    const shown = fraction(text);
    if (!shown || quantity.n && shown.n === 0n) return false;
    const same = equal(shown, quantity);
    if (!approximate) return same;
    if (same) return false;
    const match = /^[+-]?(\d*)(?:[.,](\d*))?(?:e([+-]?\d+))?$/i.exec(text.replace(/−/g, "-"));
    if (!match) return false;
    const exponent = Number(match[3] || 0) - (match[2] || "").length;
    const quantum = fraction("1e" + exponent);
    if (!quantum) return false;
    const difference = reduced(shown.n * quantity.d > quantity.n * shown.d ? shown.n * quantity.d - quantity.n * shown.d : quantity.n * shown.d - shown.n * quantity.d, shown.d * quantity.d);
    return compare(difference, divide(quantum, fraction("2"))) <= 0;
  }
  function validFullText(display, quantity, comparator) {
    if (typeof display.fullValueText !== "string" || typeof display.fullValueComplete !== "boolean") return false;
    const original = display.fullValueText;
    const match = /^([<>]=?|[≤≥])?\s*(.*?)(…)?$/.exec(original);
    const recordedComparator = match && ({ "<=": "≤", ">=": "≥" })[match[1]] || match?.[1] || "";
    if (!match || recordedComparator !== comparator || Boolean(match[3]) === display.fullValueComplete) return false;
    const numeric = normalized(match[2]), full = fraction(numeric, 4096);
    if (!full || quantity.n && !full.n) return false;
    if (display.fullValueComplete) return equal(full, quantity);
    const decimal = /^[+-]?(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(numeric);
    if (!decimal || compare(full, quantity) >= 0) return false;
    const gap = reduced(quantity.n * full.d - full.n * quantity.d, quantity.d * full.d);
    return compare(gap, fraction("1e" + (Number(decimal[3] || 0) - (decimal[2] || "").length))) < 0;
  }
  function roundedQuotient(n, d) { const quotient = n / d, remainder = n % d; return quotient + (remainder * 2n > d || remainder * 2n === d && quotient % 2n === 1n ? 1n : 0n); }
  function numberOf(value) {
    if (!value.n) return 0;
    const n = value.n, d = value.d;
    let exponent = n.toString(2).length - d.toString(2).length;
    if (exponent >= 0 ? n < d * 2n ** BigInt(exponent) : n * 2n ** BigInt(-exponent) < d) exponent -= 1;
    if (exponent > 1023) return Infinity;
    if (exponent < -1075) return 0;
    const scale = exponent < -1022 ? 1074 : 52 - exponent;
    const coefficient = scale >= 0 ? roundedQuotient(n * 2n ** BigInt(scale), d) : roundedQuotient(n, d * 2n ** BigInt(-scale));
    return Number(coefficient) * 2 ** -scale;
  }
  function validPolicy(profile) {
    return object(profile) && typeof profile.id === "string" && Boolean(profile.id) &&
      Number.isInteger(profile.version) && profile.version >= 1 && profile.formulaId === FORMULA && profile.quantity === "urine-potassium-fraction" && profile.nativeUnit === "%" && profile.referenceKind === "none" && profile.referenceAvailable === false &&
      profile.restrictions?.automaticClassification === false && profile.restrictions?.healthyReferenceInterval === false &&
      object(profile.source) && typeof profile.source.label === "string" &&
      Array.isArray(profile.sources) && profile.sources.length > 0 &&
      profile.sources.every(source => object(source) && typeof source.label === "string" && /^https:\/\//.test(source.url));
  }
  function validFrozen(snapshot) {
    if (!safe(snapshot) || !object(snapshot) || snapshot.schema !== "clcr-potassium-index" || snapshot.version !== 1 || snapshot.valid !== true || snapshot.sourceFormula !== FORMULA) return false;
    if (snapshot.mode !== "concentration" || snapshot.comparator !== "" || snapshot.operator !== "" || snapshot.category !== null || snapshot.canonicalNumber !== snapshot.rawValue || snapshot.zero !== (snapshot.rawValue === 0)) return false;
    if (!finite(snapshot.rawValue) || snapshot.rawValue < 0 || snapshot.rawValue > 100 || snapshot.pointValue !== snapshot.rawValue || snapshot.unit !== "%" || snapshot.exact !== true) return false;
    if (snapshot.reference !== null || snapshot.referenceAvailable !== false || snapshot.referenceLabel !== "Brak uniwersalnej normy" || snapshot.outOfRange !== null || snapshot.tone !== "neutral" || ["status", "assessment", "state"].some(key => snapshot[key] !== "unassessed")) return false;
    const input = snapshot.input, context = snapshot.context;
    if (!object(input) || !object(context) || !["assumed", "confirmed"].includes(context.sameSpecimen) || !["unspecified", "spot", "timed"].includes(context.sampleType) || context.knownFacts !== undefined && !object(context.knownFacts)) return false;
    if (input.potassiumUnit !== "mmol/L" || input.sodiumUnit !== "mmol/L" || ["sameSpecimen", "sameUrineSample"].some(key => [false, "false", "no", "different"].includes(context.knownFacts?.[key]))) return false;
    const potassium = fraction(input.potassiumValue), sodium = fraction(input.sodiumValue), exact = wire(snapshot.exactValue);
    if (!potassium || !sodium || !exact || !potassium.n && !sodium.n) return false;
    if ([potassium, sodium].some(value => !finite(numberOf(value)) || value.n && !numberOf(value))) return false;
    const total = reduced(potassium.n * sodium.d + sodium.n * potassium.d, potassium.d * sodium.d);
    const expected = divide(multiply(potassium, fraction("100")), total);
    if (!equal(exact, expected) || numberOf(exact) !== snapshot.rawValue || exact.n && !snapshot.rawValue) return false;
    const shown = snapshot.display;
    if (!object(shown) || shown.unit !== "%" || !validShown(shown.value, exact, shown.approximate) || normalized(shown.text) !== (shown.approximate ? "≈" : "") + normalized(shown.value) || !validFullText(shown, exact, "")) return false;
    const exactSodium = divide(multiply(sodium, fraction("100")), total), sodiumNumber = numberOf(exactSodium);
    if (!equal(wire(snapshot.exactSodium), exactSodium) || snapshot.sodiumValue !== (exactSodium.n && !sodiumNumber ? null : sodiumNumber)) return false;
    const sodiumShown = snapshot.sodiumDisplay;
    if (!object(sodiumShown) || sodiumShown.unit !== "%" || !validShown(sodiumShown.value, exactSodium, sodiumShown.approximate) || normalized(sodiumShown.text) !== (sodiumShown.approximate ? "≈" : "") + normalized(sodiumShown.value) || !validFullText(sodiumShown, exactSodium, "")) return false;
    if (!validPolicy(snapshot.policy) || snapshot.profileId !== snapshot.policy.id || snapshot.profileVersion !== snapshot.policy.version || ["source", "sources", "notes", "restrictions", "population"].some(key => stable(snapshot[key]) !== stable(snapshot.policy[key]))) return false;
    return snapshot.reasonCode === "no-universal-reference" && snapshot.message === snapshot.notes.meaning && snapshot.statusText === "K/(K+Na) w moczu" && snapshot.display.rounded === snapshot.display.approximate && snapshot.sodiumDisplay.rounded === snapshot.sodiumDisplay.approximate;
  }
  function readSnapshot(encoded) {
    if (typeof encoded !== "string" || encoded.length > 60000) return null;
    try { const value = JSON.parse(encoded); return validFrozen(value) ? value : null; } catch (_) { return null; }
  }
  function displayText(snapshot) { return String(snapshot?.display?.text ?? "").replace(/\./g, ","); }
  function sampleLabel(type) { return ({ spot: "Próbka jednorazowa", timed: "Zbiórka moczu", unspecified: "Typ próbki nieutrwalony" })[type] || "Typ próbki nieutrwalony"; }
  function assumptions(snapshot) { return snapshot.context.sameSpecimen === "assumed" ? String(snapshot.notes?.assumption || "") : ""; }
  function interpretation(snapshot) { return snapshot.message || snapshot.statusText || "Wynik opisuje udział potasu w sumie potasu i sodu w moczu."; }
  function matchesDatapoint(dp, snapshot) {
    return Boolean(dp && snapshot && dp.sourceFormulaId === FORMULA && dp.label === LABEL && dp.valueNum === snapshot.rawValue && dp.rawValue === snapshot.rawValue && dp.unit === "%" && normalized(dp.displayValue) === normalized(displayText(snapshot)) && dp.norm === "" && dp.outOfRange === null && dp.assessment === "unassessed" && dp.category === null && dp.tone === "neutral" && dp.reference === null && dp.referenceAvailable === false && stable(dp.source) === stable(snapshot.source) && dp.referenceProfileId === snapshot.profileId && dp.referenceProfileVersion === snapshot.profileVersion && String(dp.comparator || "") === "" && dp.interpretation === interpretation(snapshot) && dp.assumptions === assumptions(snapshot) && dp.boundary === "");
  }
  function augmentDatapoint(element, dp) {
    const snapshot = readSnapshot(element?.getAttribute?.("data-clcr-potassium-index-snapshot"));
    if (!snapshot || dp?.sourceFormulaId !== FORMULA) return false;
    Object.assign(dp, { potassiumIndexSnapshot: snapshot, label: LABEL, valueNum: snapshot.rawValue, rawValue: snapshot.rawValue, unit: "%", comparator: "", displayValue: displayText(snapshot), norm: "", outOfRange: null, assessment: "unassessed", category: null, tone: "neutral", reference: null, referenceAvailable: false, source: snapshot.source, interpretation: interpretation(snapshot), assumptions: assumptions(snapshot), boundary: "", referenceProfileId: snapshot.profileId, referenceProfileVersion: snapshot.profileVersion });
    return true;
  }
  function prepareValues(values, context = {}, snapshot) {
    const frozen = snapshot && readSnapshot(JSON.stringify(snapshot));
    const result = { U_K: frozen ? frozen.input.potassiumValue : values?.U_K ?? "", U_Na: frozen ? frozen.input.sodiumValue : values?.U_Na ?? "" };
    const scoped = frozen?.context || context.potassiumIndex || ([context.formulaId, context.sourceFormula].includes(FORMULA) ? context : {});
    for (const [id, key] of Object.entries(CONTEXT_MAP)) {
      if (frozen && own(scoped, key)) result[id] = scoped[key];
      else if (own(values, id)) result[id] = values[id];
      else if (own(scoped, key)) result[id] = scoped[key];
    }
    return result;
  }
  function editableFields() {
    return [
      { id: "U_K", label: "Potas w moczu (mmol/L)", type: "text", required: true, options: [] },
      { id: "U_Na", label: "Sód w moczu (mmol/L)", type: "text", required: true, options: [] },
    ];
  }
  function captureFields(values) {
    const fields = editableFields();
    for (const id of Object.keys(CONTEXT_MAP)) if (own(values, id)) fields.push({ id, label: id, type: "text", required: false, historicalContext: true, options: [] });
    return fields;
  }
  return Object.freeze({ FORMULA, LABEL, FIELD_MAP, CONTEXT_MAP, DEFAULTS, readSnapshot, validFrozen, augmentDatapoint, prepareValues, editableFields, captureFields, displayText, matchesDatapoint, normalized, hasContextField, contextValue, inputValue, sampleLabel });
});
