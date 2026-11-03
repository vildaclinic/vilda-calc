(function (root, factory) {
  const api = factory();
  if (root) root.VildaClcrMagnesiumCalcium = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const DEFAULTS = Object.freeze({
    MGCA_inputMode: "concentration", MGCA_magnesium: "", MGCA_magnesiumUnit: "mg/L", MGCA_calcium: "", MGCA_calciumUnit: "mmol/L",
    MGCA_reportedValue: "", MGCA_reportedUnit: "mg/mg",
    MGCA_sameSpecimen: "assumed", MGCA_collectionProblem: "", MGCA_collectionHours: "", MGCA_durationKnown: "",
  });
  const FIELD_IDS = Object.freeze(Object.keys(DEFAULTS).slice(0, 7));
  const CONTEXT_FIELD_IDS = Object.freeze(Object.keys(DEFAULTS).slice(7));
  const APPLICATION_CONVERSION = Object.freeze({ magnesiumMgPerMmol: "24.305", calciumMgPerMmol: "40.078" });
  const INPUT_MESSAGES = Object.freeze({
    "invalid-mode": "Wybierz sposób wprowadzenia Mg/Ca.",
    "missing-magnesium": "Wpisz stężenie magnezu w moczu.",
    "invalid-magnesium": "Stężenie magnezu w moczu musi być skończoną liczbą nieujemną.",
    "missing-calcium": "Wpisz stężenie wapnia w moczu.",
    "invalid-calcium": "Stężenie wapnia w moczu musi być skończoną liczbą większą od zera.",
    "invalid-magnesium-unit": "Wybierz jednostkę magnezu: mg/L, mg/dL, mmol/L lub µmol/L.",
    "invalid-calcium-unit": "Wybierz jednostkę wapnia: mg/L, mg/dL, mmol/L lub µmol/L.",
    "different-specimens": "Nie można obliczyć Mg/Ca z oznaczeń z różnych próbek. Użyj magnezu i wapnia z tej samej zbiórki albo gotowego wyniku Mg/Ca.",
    "missing-reported-value": "Wpisz wynik Mg/Ca z laboratorium.",
    "invalid-reported-value": "Wpisz skończony, nieujemny wynik Mg/Ca. Zachowaj znak <, ≤, > lub ≥ z wydruku.",
    "invalid-reported-unit": "Wybierz jednostkę wyniku Mg/Ca: mg/mg lub mmol/mmol.",
    "invalid-conversion": "Nie można przedstawić wyniku Mg/Ca z podanych wartości. Sprawdź stężenia i jednostki.",
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
    const numerator = BigInt((match[2] || "0") + (match[3] || "")) * (match[1] === "-" ? -1n : 1n);
    if (numerator === 0n) return fraction(0n);
    const exponent = Number(match[4] || 0);
    // Bound allocation, not physiology. With at most 512 input characters,
    // larger exponents cannot describe a nonzero finite IEEE754 operand.
    if (!Number.isInteger(exponent) || Math.abs(exponent) > 4096) return null;
    const scale = (match[3] || "").length - exponent;
    return scale >= 0 ? fraction(numerator, 10n ** BigInt(scale)) : fraction(numerator * 10n ** BigInt(-scale));
  }
  function multiply(a, b) { return fraction(a.n * b.n, a.d * b.d); }
  function divide(a, b) { return b.n === 0n ? null : fraction(a.n * b.d, a.d * b.n); }
  function compare(a, b) { const value = a.n * b.d - b.n * a.d; return value < 0n ? -1 : value > 0n ? 1 : 0; }
  function roundedQuotient(n, d) {
    const quotient = n / d, remainder = n % d;
    return quotient + (remainder * 2n > d || remainder * 2n === d && quotient % 2n === 1n ? 1n : 0n);
  }
  // Round the complete rational once to IEEE754, including subnormals. Unit
  // conversions may exceed Number's range while their final ratio is finite.
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
  function parsedValue(input, allowComparator = false) {
    if (typeof input !== "string" && !(typeof input === "number" && Number.isFinite(input))) return null;
    const text = String(input).trim().replace(/−/g, "-");
    if (text.length > 512) return null;
    const match = text.match(/^([<>]=?|[≤≥])?\s*([+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?)$/);
    if (!match || match[1] && !allowComparator) return null;
    const exact = decimalFraction(match[2]), value = exact && numberOf(exact);
    if (!exact || !representable(exact, value)) return null;
    const comparator = ({ "<=": "≤", ">=": "≥" })[match[1]] || match[1] || "";
    if (comparator === "<" && value === 0) return null;
    return { exact, value, comparator, text: match[2].replace(",", ".") };
  }
  function concentrationUnit(unit) {
    return ({ "mg/dl": "mg/dL", "umol": "µmol/L", "umol/L": "µmol/L", "μmol/L": "µmol/L" })[unit] || unit;
  }
  function reportedUnit(unit) { return ({ "g/g": "mg/mg", "mol/mol": "mmol/mmol" })[unit] || unit; }
  function concentrationFactor(unit, mass) {
    switch (concentrationUnit(unit)) {
      case "mg/L": return fraction(1n);
      case "mg/dL": return fraction(10n);
      case "mmol/L": return decimalFraction(mass);
      case "µmol/L": return multiply(decimalFraction(mass), fraction(1n, 1000n));
      default: return null;
    }
  }
  function massFactor(unit, constants) {
    if (unit === "mg/mg") return fraction(1n);
    if (unit === "mmol/mmol") return divide(decimalFraction(constants.magnesiumMgPerMmol), decimalFraction(constants.calciumMgPerMmol));
    return null;
  }
  function validProfile(profile) {
    return profile && typeof profile.id === "string" && profile.id !== "" && Number.isInteger(profile.version) && profile.version > 0 &&
      profile.formulaId === "Mg_Ca" && profile.quantity === "urine-magnesium-calcium-ratio" && profile.nativeUnit === "mg/mg" &&
      profile.referenceKind === "no-verified-reference" && profile.referenceAvailable === false &&
      (!own(profile, "bands") || Array.isArray(profile.bands) && profile.bands.length === 0) &&
      profile.source && typeof profile.source.label === "string" && Array.isArray(profile.sources) && profile.sources.length > 0 &&
      profile.conversionConstants?.magnesiumMgPerMmol === APPLICATION_CONVERSION.magnesiumMgPerMmol &&
      profile.conversionConstants?.calciumMgPerMmol === APPLICATION_CONVERSION.calciumMgPerMmol &&
      profile.notes && typeof profile.notes.reference === "string" && profile.restrictions && typeof profile.restrictions === "object";
  }
  function decimalText(value, places = 24) {
    let remainder = value.n % value.d, digits = "";
    for (let index = 0; remainder && index < places; index += 1) { remainder *= 10n; digits += String(remainder / value.d); remainder %= value.d; }
    return { text: String(value.n / value.d) + (digits ? "." + digits : ""), complete: remainder === 0n };
  }
  function scientificText(value, significantDigits = 24) {
    const power = exponent => exponent >= 0 ? fraction(10n ** BigInt(exponent)) : fraction(1n, 10n ** BigInt(-exponent));
    let exponent = value.n.toString().length - value.d.toString().length;
    if (compare(value, power(exponent)) < 0) exponent -= 1;
    const scaled = divide(value, power(exponent)), numerator = scaled.n * 10n ** BigInt(significantDigits - 1);
    const digits = String(numerator / scaled.d).padStart(significantDigits, "0"), decimal = digits.slice(1).replace(/0+$/, "");
    return { text: digits[0] + (decimal ? "." + decimal : "") + "e" + (exponent >= 0 ? "+" : "") + exponent, complete: numerator % scaled.d === 0n };
  }
  function compactFraction(value, literal = "") {
    if (literal && literal.length <= 10) return { text: literal, approximate: false };
    const full = decimalText(value, 10);
    if (full.complete && full.text.length <= 10) return { text: full.text, approximate: false };
    if (value.n === 0n) return { text: "0", approximate: false };
    const power = exponent => exponent >= 0 ? fraction(10n ** BigInt(exponent)) : fraction(1n, 10n ** BigInt(-exponent));
    let exponent = value.n.toString().length - value.d.toString().length;
    if (compare(value, power(exponent)) < 0) exponent -= 1;
    const scaled = divide(value, power(exponent));
    let coefficient = roundedQuotient(scaled.n * 1000n, scaled.d);
    if (coefficient >= 10000n) { coefficient /= 10n; exponent += 1; }
    const digits = String(coefficient).padStart(4, "0");
    let text;
    if (exponent < -4 || exponent >= 6) {
      const decimal = digits.slice(1).replace(/0+$/, "");
      text = digits[0] + (decimal ? "." + decimal : "") + "e" + (exponent >= 0 ? "+" : "") + exponent;
    } else {
      const place = exponent + 1;
      text = place <= 0 ? "0." + "0".repeat(-place) + digits : place >= digits.length ? digits + "0".repeat(place - digits.length) : digits.slice(0, place) + "." + digits.slice(place);
      if (text.includes(".")) text = text.replace(/0+$/, "").replace(/\.$/, "");
    }
    // A shortened coefficient must not turn a finite boundary into Infinity
    // or a positive subnormal into zero when a consumer reads the text.
    if (!representable(decimalFraction(text), numberOf(decimalFraction(text)))) text = String(numberOf(value));
    return { text, approximate: compare(decimalFraction(text), value) !== 0 };
  }
  function presentation(value, unit, comparator = "", literal = "") {
    const compact = compactFraction(value, literal);
    let full = literal ? { text: literal, complete: true } : decimalText(value);
    // Extremely small values need their significant digits, not 24 zero
    // decimal places. The rational wire remains the exact calculation record.
    if (!literal && full.text === "0." + "0".repeat(24) && value.n !== 0n) full = scientificText(value);
    const local = text => text.replace(".", ",");
    return {
      value: compact.text, unit, text: comparator + (compact.approximate ? "≈" : "") + local(compact.text),
      fullValueText: comparator + local(full.text) + (full.complete ? "" : "…"), fullValueComplete: full.complete,
      rounded: compact.approximate, approximate: compact.approximate,
    };
  }
  function booleanFact(value) { return value === true || value === "true" || value === "yes" ? true : value === false || value === "false" || value === "no" ? false : undefined; }
  function sameSpecimenFact(value) { return value === "different" || booleanFact(value) === false ? "different" : value === "confirmed" || booleanFact(value) === true ? "confirmed" : "assumed"; }
  function knownFacts(value) {
    if (Array.isArray(value)) return value.filter(item => typeof item === "string" || typeof item === "boolean");
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, item]) => typeof item === "string" || typeof item === "boolean" || item === null));
    return {};
  }
  function evaluate(input, profile) {
    const request = input && typeof input === "object" ? input : {};
    const mode = request.mode == null ? "concentration" : request.mode;
    const profileValid = validProfile(profile), constants = APPLICATION_CONVERSION;
    const concentrationSameSpecimen = sameSpecimenFact(request.concentrationSameSpecimen ?? request.sameSpecimen);
    const context = {
      sameSpecimen: mode === "direct" ? "not-applicable" : concentrationSameSpecimen, concentrationSameSpecimen,
      sampleType: "timed", knownFacts: knownFacts(request.knownFacts),
    };
    if (own(request, "collectionHours")) context.collectionHours = original(request.collectionHours);
    for (const key of ["collectionProblem", "durationKnown"]) {
      const fact = booleanFact(request[key]);
      if (fact !== undefined) context[key] = fact;
    }
    const base = {
      valid: false, reasonCode: "", message: "", mode, sourceFormula: "Mg_Ca", rawValue: null, pointValue: null, unit: "", comparator: "", operator: "",
      exact: false, exactValue: null, exactMass: null, zero: false, display: null,
      alternateValue: null, alternateUnit: "", alternateAvailable: false, exactAlternate: null, alternate: null,
      status: "unassessed", assessment: "unassessed", category: null, tone: "neutral", statusText: "Mg/Ca — wynik bez oceny zakresu",
      reference: null, referenceAvailable: false, outOfRange: null, referenceTable: [],
      conversionConstants: copy(constants), context,
      input: mode === "direct" ? { reportedValue: original(request.reportedValue), reportedUnit: typeof request.reportedUnit === "string" ? request.reportedUnit : "" }
        : { magnesiumValue: original(request.magnesiumValue), magnesiumUnit: typeof request.magnesiumUnit === "string" ? request.magnesiumUnit : "", calciumValue: original(request.calciumValue), calciumUnit: typeof request.calciumUnit === "string" ? request.calciumUnit : "" },
      profileId: profileValid ? profile.id : null, profileVersion: profileValid ? profile.version : null,
      policy: profileValid ? { id: profile.id, version: profile.version, referenceKind: profile.referenceKind, referenceAvailable: false,
        source: copy(profile.source), sources: copy(profile.sources), notes: copy(profile.notes), restrictions: copy(profile.restrictions), conversionConstants: copy(constants) } : null,
      source: profileValid ? copy(profile.source) : null, sources: profileValid ? copy(profile.sources) : [],
      restrictions: profileValid ? copy(profile.restrictions) : null, notes: profileValid ? copy(profile.notes) : null,
    };
    function invalid(reason) { base.reasonCode = reason; base.message = INPUT_MESSAGES[reason]; base.statusText = base.message; return freeze({ ...base, snapshot: null }); }
    if (!["concentration", "direct"].includes(mode)) return invalid("invalid-mode");
    let exact, mass, unit = "mg/mg", comparator = "", literal = "";
    if (mode === "direct") {
      if (absent(request.reportedValue)) return invalid("missing-reported-value");
      const parsed = parsedValue(request.reportedValue, true);
      if (!parsed || parsed.exact.n < 0n) return invalid("invalid-reported-value");
      unit = reportedUnit(request.reportedUnit);
      const factor = massFactor(unit, constants);
      if (!factor) return invalid("invalid-reported-unit");
      exact = parsed.exact; mass = multiply(exact, factor); comparator = parsed.comparator; literal = parsed.text;
    } else {
      if (absent(request.magnesiumValue)) return invalid("missing-magnesium");
      const magnesium = parsedValue(request.magnesiumValue);
      if (!magnesium || magnesium.exact.n < 0n) return invalid("invalid-magnesium");
      if (absent(request.calciumValue)) return invalid("missing-calcium");
      const calcium = parsedValue(request.calciumValue);
      if (!calcium || calcium.exact.n <= 0n) return invalid("invalid-calcium");
      const magnesiumFactor = concentrationFactor(request.magnesiumUnit, constants.magnesiumMgPerMmol);
      if (!magnesiumFactor) return invalid("invalid-magnesium-unit");
      const calciumFactor = concentrationFactor(request.calciumUnit, constants.calciumMgPerMmol);
      if (!calciumFactor) return invalid("invalid-calcium-unit");
      if (concentrationSameSpecimen === "different") return invalid("different-specimens");
      exact = divide(multiply(magnesium.exact, magnesiumFactor), multiply(calcium.exact, calciumFactor)); mass = exact;
    }
    const rawValue = numberOf(exact);
    if (!representable(exact, rawValue)) return invalid("invalid-conversion");
    const alternateUnit = unit === "mg/mg" ? "mmol/mmol" : "mg/mg";
    const alternateExact = divide(mass, massFactor(alternateUnit, constants));
    const alternateValue = numberOf(alternateExact), alternateAvailable = representable(alternateExact, alternateValue);
    Object.assign(base, {
      valid: true, rawValue, pointValue: comparator ? null : rawValue, unit, comparator, operator: comparator, exact: !comparator,
      exactValue: wire(exact), exactMass: wire(mass), zero: rawValue === 0,
      display: presentation(exact, unit, comparator, literal),
      alternateValue: alternateAvailable ? alternateValue : null, alternateUnit, alternateAvailable, exactAlternate: wire(alternateExact),
      alternate: { value: alternateAvailable ? alternateValue : null, unit: alternateUnit, available: alternateAvailable, comparator,
        display: alternateAvailable ? presentation(alternateExact, alternateUnit, comparator) : null },
      reasonCode: profileValid ? "no-verified-reference" : profile == null ? "missing-profile" : "invalid-profile",
    });
    return freeze({ ...base, snapshot: { schema: "clcr-magnesium-calcium", version: 1, ...copy(base) } });
  }
  function inputFromValues(values, context = {}) {
    const source = values && typeof values === "object" ? values : {}, facts = context && typeof context === "object" ? context : {};
    const value = id => own(source, id) ? source[id] : DEFAULTS[id];
    const input = {
      mode: value("MGCA_inputMode") === "reported" ? "direct" : value("MGCA_inputMode"),
      magnesiumValue: value("MGCA_magnesium"), magnesiumUnit: value("MGCA_magnesiumUnit"),
      calciumValue: value("MGCA_calcium"), calciumUnit: value("MGCA_calciumUnit"),
      reportedValue: value("MGCA_reportedValue"), reportedUnit: value("MGCA_reportedUnit"),
      sameSpecimen: sameSpecimenFact(own(source, "MGCA_sameSpecimen") ? source.MGCA_sameSpecimen : facts.concentrationSameSpecimen ?? facts.sameSpecimen ?? DEFAULTS.MGCA_sameSpecimen),
      sampleType: "timed",
    };
    if (own(facts, "knownFacts")) input.knownFacts = knownFacts(facts.knownFacts);
    if (own(source, "MGCA_collectionHours")) input.collectionHours = original(value("MGCA_collectionHours"));
    else if (own(facts, "collectionHours")) input.collectionHours = original(facts.collectionHours);
    for (const key of ["collectionProblem", "durationKnown"]) {
      const fact = booleanFact(own(source, "MGCA_" + key) ? value("MGCA_" + key) : facts[key]);
      if (fact !== undefined) input[key] = fact;
    }
    return input;
  }
  function readInputFromDocument(documentRef, options = {}) {
    const doc = documentRef || (typeof document !== "undefined" ? document : null), values = {};
    for (const id of [...FIELD_IDS, ...CONTEXT_FIELD_IDS]) {
      const control = doc?.getElementById(id);
      if (control) values[id] = control.type === "checkbox" ? control.checked : control.value;
    }
    return inputFromValues(values, options?.context || options);
  }
  return Object.freeze({ evaluate, readInputFromDocument, inputFromValues, DEFAULTS, FIELD_IDS, CONTEXT_FIELD_IDS });
});
