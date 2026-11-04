(function (root, factory) {
  const api = factory();
  if (root) root.VildaClcrPotassiumIndex = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const DEFAULTS = Object.freeze({ U_K: "", U_Na: "" });
  const FIELD_IDS = Object.freeze(Object.keys(DEFAULTS));
  const INPUT_MESSAGES = Object.freeze({
    "missing-potassium": "Wpisz stężenie potasu w moczu.",
    "invalid-potassium": "Stężenie potasu musi być skończoną liczbą nieujemną. Wyniku z nierównością nie zastępuj zerem.",
    "missing-sodium": "Wpisz stężenie sodu w moczu.",
    "invalid-sodium": "Stężenie sodu musi być skończoną liczbą nieujemną. Wyniku z nierównością nie zastępuj zerem.",
    "zero-sum": "Suma stężeń potasu i sodu musi być większa od zera.",
    "different-specimens": "Użyj stężeń potasu i sodu z tej samej próbki moczu. Wpisane wartości pozostają w formularzu.",
    "invalid-conversion": "Wynik jest zbyt mały, aby zapisać go jako liczbę bez utraty dodatniej wartości. Sprawdź stężenia; nie zastępuj wyniku zerem.",
  });
  function freeze(value) {
    if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  }
  function copy(value) {
    if (Array.isArray(value)) return value.map(copy);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]));
    return value;
  }
  function own(value, key) { return Object.prototype.hasOwnProperty.call(value, key); }
  function absent(value) { return value == null || typeof value === "string" && value.trim() === ""; }
  function original(value) { return typeof value === "string" || typeof value === "number" && Number.isFinite(value) ? value : null; }
  // Same exact-decimal/IEEE754 primitives as the audited B/Cr engine. Its
  // private helpers are not a public dependency; no form or rounding adapter
  // may replace these operands with already rounded display values.
  function fraction(numerator, denominator = 1n) {
    if (numerator === 0n) return { n: 0n, d: 1n };
    if (denominator < 0n) { numerator = -numerator; denominator = -denominator; }
    let a = numerator < 0n ? -numerator : numerator, b = denominator;
    while (b !== 0n) { const remainder = a % b; a = b; b = remainder; }
    return { n: numerator / a, d: denominator / a };
  }
  function decimalFraction(text) {
    const match = String(text).replace(",", ".").match(/^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/);
    if (!match || !(match[2] || match[3])) return null;
    const exponent = Number(match[4] || 0);
    // Bound allocation, not physiology. Finite operands below are additionally
    // checked after exact parsing, before any clinical calculation.
    if (!Number.isInteger(exponent) || Math.abs(exponent) > 4096) return null;
    const numerator = BigInt((match[2] || "0") + (match[3] || "")) * (match[1] === "-" ? -1n : 1n);
    const scale = (match[3] || "").length - exponent;
    return scale >= 0 ? fraction(numerator, 10n ** BigInt(scale)) : fraction(numerator * 10n ** BigInt(-scale));
  }
  function compare(a, b) { const value = a.n * b.d - b.n * a.d; return value < 0n ? -1 : value > 0n ? 1 : 0; }
  function divide(a, b) { return b.n === 0n ? null : fraction(a.n * b.d, a.d * b.n); }
  function roundedQuotient(n, d) {
    const quotient = n / d, remainder = n % d;
    return quotient + (remainder * 2n > d || remainder * 2n === d && quotient % 2n === 1n ? 1n : 0n);
  }
  function numberOf(value) {
    if (value.n === 0n) return 0;
    const sign = value.n < 0n ? -1 : 1, numerator = value.n < 0n ? -value.n : value.n;
    let exponent = numerator.toString(2).length - value.d.toString(2).length;
    if (exponent >= 0 ? numerator < value.d * 2n ** BigInt(exponent) : numerator * 2n ** BigInt(-exponent) < value.d) exponent -= 1;
    if (exponent > 1023) return sign * Infinity;
    if (exponent < -1075) return sign * 0;
    const scale = exponent < -1022 ? 1074 : 52 - exponent;
    const coefficient = scale >= 0 ? roundedQuotient(numerator * 2n ** BigInt(scale), value.d) : roundedQuotient(numerator, value.d * 2n ** BigInt(-scale));
    return sign * Number(coefficient) * 2 ** -scale;
  }
  function representable(exact, value) { return Number.isFinite(value) && (exact.n === 0n || value !== 0); }
  function wire(value) { return { numerator: String(value.n), denominator: String(value.d) }; }
  function parsedValue(input) {
    if (typeof input !== "string" && !(typeof input === "number" && Number.isFinite(input))) return null;
    const text = String(input).trim().replace(/−/g, "-");
    if (text.length > 512 || !/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?$/.test(text)) return null;
    const exact = decimalFraction(text), value = exact && numberOf(exact);
    return exact && representable(exact, value) ? { exact, value } : null;
  }
  function decimalText(value, places = 30) {
    let remainder = value.n % value.d, digits = "";
    for (let index = 0; remainder && index < places; index += 1) { remainder *= 10n; digits += String(remainder / value.d); remainder %= value.d; }
    return { text: String(value.n / value.d) + (digits ? "." + digits : ""), complete: remainder === 0n };
  }
  function powerOfTen(exponent) { return exponent >= 0 ? fraction(10n ** BigInt(exponent)) : fraction(1n, 10n ** BigInt(-exponent)); }
  function decimalExponent(value) {
    let exponent = value.n.toString().length - value.d.toString().length;
    if (compare(value, powerOfTen(exponent)) < 0) exponent -= 1;
    return exponent;
  }
  function scientificText(value, significantDigits = 24) {
    const exponent = decimalExponent(value), scaled = divide(value, powerOfTen(exponent));
    const numerator = scaled.n * 10n ** BigInt(significantDigits - 1);
    const digits = String(numerator / scaled.d).padStart(significantDigits, "0"), tail = digits.slice(1).replace(/0+$/, "");
    return { text: digits[0] + (tail ? "." + tail : "") + "e" + exponent, complete: numerator % scaled.d === 0n };
  }
  function compactFraction(value) {
    if (value.n === 0n) return { text: "0", approximate: false };
    let text;
    const rounded = roundedQuotient(value.n * 10000n, value.d);
    if (rounded > 0n) text = decimalText(fraction(rounded, 10000n), 4).text;
    else {
      let exponent = decimalExponent(value);
      const scaled = divide(value, powerOfTen(exponent));
      let coefficient = roundedQuotient(scaled.n * 100000n, scaled.d);
      if (coefficient >= 1000000n) { coefficient /= 10n; exponent += 1; }
      const digits = String(coefficient).padStart(6, "0"), tail = digits.slice(1).replace(/0+$/, "");
      text = digits[0] + (tail ? "." + tail : "") + "e" + exponent;
    }
    return { text, approximate: compare(decimalFraction(text), value) !== 0 };
  }
  function presentation(value) {
    const compact = compactFraction(value);
    let full = decimalText(value);
    if (value.n !== 0n && compare(value, fraction(1n, 10n ** 24n)) < 0) full = scientificText(value);
    const local = text => text.replace(".", ",");
    return { value: compact.text, unit: "%", text: (compact.approximate ? "≈" : "") + local(compact.text),
      fullValueText: local(full.text) + (full.complete ? "" : "…"), fullValueComplete: full.complete,
      rounded: compact.approximate, approximate: compact.approximate };
  }
  function sameSpecimenFact(value) {
    return value === false || value === "false" || value === "no" || value === "different" ? "different"
      : value === true || value === "true" || value === "yes" || value === "confirmed" ? "confirmed" : "assumed";
  }
  function sampleType(value) { return value === "spot" || value === "timed" ? value : "unspecified"; }
  function knownFacts(value) {
    return value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).filter(([, item]) => typeof item === "string" || typeof item === "boolean" || item === null)) : {};
  }
  function validProfile(profile) {
    return Boolean(profile && typeof profile.id === "string" && profile.id && Number.isInteger(profile.version) && profile.version > 0 &&
      profile.formulaId === "K_frac" && profile.quantity === "urine-potassium-fraction" && profile.nativeUnit === "%" &&
      profile.referenceKind === "none" && profile.referenceAvailable === false && typeof profile.population === "string" &&
      profile.source && typeof profile.source.label === "string" && Array.isArray(profile.sources) && profile.sources.length &&
      profile.restrictions?.automaticClassification === false && profile.restrictions?.healthyReferenceInterval === false &&
      profile.notes && typeof profile.notes.referenceLabel === "string" && typeof profile.notes.meaning === "string");
  }
  function evaluate(input, profile) {
    const request = input && typeof input === "object" ? input : {}, profileValid = validProfile(profile);
    const facts = knownFacts(request.knownFacts), specimenFacts = [facts.sameSpecimen, facts.sameUrineSample, request.sameSpecimen, request.sameUrineSample].map(sameSpecimenFact);
    const context = { sameSpecimen: specimenFacts.includes("different") ? "different" : specimenFacts.includes("confirmed") ? "confirmed" : "assumed",
      sampleType: sampleType(request.sampleType), knownFacts: facts };
    // Known collection provenance survives an explicit historical edit. It is
    // never needed for this ratio and does not turn an unspecified sample into
    // a spot sample merely because its menu belongs to urine calculations.
    for (const key of ["collectionHours", "collectionStartAt", "collectionEndAt"]) if (own(request, key)) context[key] = original(request[key]);
    for (const key of ["collectionProblem", "durationKnown"]) if (typeof request[key] === "boolean") context[key] = request[key];
    const base = {
      valid: false, reasonCode: "", message: "", invalidIds: [], mode: "concentration", sourceFormula: "K_frac", rawValue: null, pointValue: null, canonicalNumber: null,
      unit: "%", comparator: "", operator: "", exact: false, exactValue: null, zero: false, display: null,
      sodiumValue: null, sodiumDisplay: null, exactSodium: null,
      status: "unassessed", assessment: "unassessed", state: "unassessed", category: null, tone: "neutral", statusText: "K/(K+Na) w moczu",
      reference: null, referenceAvailable: false, outOfRange: null, referenceLabel: profileValid ? profile.notes.referenceLabel : "Brak uniwersalnej normy",
      input: { potassiumValue: original(request.potassiumValue), sodiumValue: original(request.sodiumValue), potassiumUnit: "mmol/L", sodiumUnit: "mmol/L" }, context,
      profileId: profileValid ? profile.id : null, profileVersion: profileValid ? profile.version : null,
      population: profileValid ? profile.population : null, policy: profileValid ? copy(profile) : null,
      source: profileValid ? copy(profile.source) : null, sources: profileValid ? copy(profile.sources) : [],
      restrictions: profileValid ? copy(profile.restrictions) : null, notes: profileValid ? copy(profile.notes) : null,
    };
    function invalid(reason) {
      const invalidIds = ({ "invalid-potassium": ["U_K"], "invalid-sodium": ["U_Na"], "zero-sum": [...FIELD_IDS], "invalid-conversion": [...FIELD_IDS], "different-specimens": [...FIELD_IDS] })[reason] || [];
      return freeze({ ...base, reasonCode: reason, message: INPUT_MESSAGES[reason], statusText: INPUT_MESSAGES[reason], invalidIds, snapshot: null });
    }
    if (absent(request.potassiumValue)) return invalid("missing-potassium");
    const potassium = parsedValue(request.potassiumValue);
    if (!potassium || potassium.exact.n < 0n) return invalid("invalid-potassium");
    if (absent(request.sodiumValue)) return invalid("missing-sodium");
    const sodium = parsedValue(request.sodiumValue);
    if (!sodium || sodium.exact.n < 0n) return invalid("invalid-sodium");
    if (context.sameSpecimen === "different") return invalid("different-specimens");
    const k = potassium.exact.n * sodium.exact.d, na = sodium.exact.n * potassium.exact.d;
    if (k + na === 0n) return invalid("zero-sum");
    const exactValue = fraction(100n * k, k + na), exactSodium = fraction(100n * na, k + na);
    const rawValue = numberOf(exactValue);
    if (!representable(exactValue, rawValue)) return invalid("invalid-conversion");
    // The complementary share may itself be below Number's smallest positive
    // value. Keep its exact fraction and text; never expose a false numeric 0.
    const sodiumNumber = numberOf(exactSodium);
    Object.assign(base, { valid: true, rawValue, pointValue: rawValue, canonicalNumber: rawValue, exact: true,
      exactValue: wire(exactValue), zero: exactValue.n === 0n, display: presentation(exactValue),
      sodiumValue: representable(exactSodium, sodiumNumber) ? sodiumNumber : null, sodiumDisplay: presentation(exactSodium), exactSodium: wire(exactSodium),
      reasonCode: profileValid ? "no-universal-reference" : profile == null ? "missing-profile" : "invalid-profile",
      message: profileValid ? profile.notes.meaning : "Wynik bez zweryfikowanego opisu źródeł; nie przyjęto uniwersalnej normy." });
    return freeze({ ...base, snapshot: { schema: "clcr-potassium-index", version: 1, ...copy(base) } });
  }
  function inputFromValues(values, context = {}) {
    const source = values && typeof values === "object" ? values : {}, supplied = context && typeof context === "object" ? context : {};
    // Generic facts often belong to another calculator sharing the form.
    // Accept only this formula's scoped context or explicitly prefixed values.
    const scoped = supplied.potassiumIndex && typeof supplied.potassiumIndex === "object" ? supplied.potassiumIndex
      : supplied.sourceFormula === "K_frac" || supplied.formulaId === "K_frac" ? supplied : {};
    const input = { potassiumValue: own(source, "U_K") ? source.U_K : DEFAULTS.U_K, sodiumValue: own(source, "U_Na") ? source.U_Na : DEFAULTS.U_Na,
      sameSpecimen: sameSpecimenFact(own(source, "KFR_sameSpecimen") ? source.KFR_sameSpecimen : scoped.sameSpecimen),
      sampleType: sampleType(own(source, "KFR_sampleType") ? source.KFR_sampleType : scoped.sampleType), knownFacts: knownFacts(scoped.knownFacts) };
    if (own(scoped, "sameUrineSample")) input.sameUrineSample = scoped.sameUrineSample;
    for (const key of ["collectionHours", "collectionStartAt", "collectionEndAt", "collectionProblem", "durationKnown"]) if (own(scoped, key)) input[key] = scoped[key];
    return input;
  }
  function readiness(input) {
    const request = input && typeof input === "object" ? input : {}, validFieldIds = [], missingFieldIds = [], invalidFieldIds = [], parsed = [];
    for (const field of [{ id: "U_K", value: request.potassiumValue }, { id: "U_Na", value: request.sodiumValue }]) {
      const missing = absent(field.value), value = missing ? null : parsedValue(field.value);
      if (missing) missingFieldIds.push(field.id);
      else if (!value || value.exact.n < 0n) invalidFieldIds.push(field.id);
      else { validFieldIds.push(field.id); parsed.push(value); }
    }
    const complete = validFieldIds.length === 2, zeroSum = complete && parsed.every(value => value.exact.n === 0n);
    return freeze({ count: validFieldIds.length, total: 2, complete, zeroSum, reasonCode: zeroSum ? "zero-sum" : "", requiredFieldIds: [...FIELD_IDS], validFieldIds, missingFieldIds, invalidFieldIds });
  }
  function readInputFromDocument(documentRef, options = {}) {
    const doc = documentRef || (typeof document !== "undefined" ? document : null), values = {};
    for (const id of FIELD_IDS) { const control = doc?.getElementById(id); if (control) values[id] = control.value; }
    return inputFromValues(values, options?.context || options);
  }
  function toSnapshot(result) { return result?.valid === true && result.snapshot?.schema === "clcr-potassium-index" ? freeze(copy(result.snapshot)) : null; }
  return Object.freeze({ evaluate, inputFromValues, readiness, readInputFromDocument, toSnapshot, DEFAULTS, FIELD_IDS });
});
