/* Ca/Cit keeps the laboratory's native citrate dimension. Exact decimal
 * fractions prevent unit-dependent rounding and preserve source endpoints. */
(function (root, factory) {
  const api = factory(root);
  if (root) root.VildaClcrCaCit = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";
  const ENGINE_VERSION = 1, SCHEMA = "clcr-ca-cit";
  const DEFAULTS = Object.freeze({ CACIT_inputMode: "concentration", CACIT_calcium: "", CACIT_calciumUnit: "mmol/L", CACIT_citrate: "", CACIT_citrateUnit: "mg/dL", CACIT_reportedValue: "", CACIT_reportedUnit: "mg/mg",
    CACIT_sameSpecimen: "assumed", CACIT_collectionProblem: "", CACIT_collectionHours: "", CACIT_durationKnown: "", CACIT_sampleType: "timed", CACIT_sampleSource: "assumed-current", CACIT_durationSource: "" });
  const FIELD_IDS = Object.freeze(Object.keys(DEFAULTS).slice(0, 7)), CONTEXT_FIELD_IDS = Object.freeze(Object.keys(DEFAULTS).slice(7));
  const METADATA_FIELD_IDS = Object.freeze(["CACIT_reportedUnitOriginal"]);
  const INPUT_UNITS = Object.freeze(["µmol/L", "mmol/L", "mg/L", "mg/dL"]), REPORTED_UNITS = Object.freeze(["mg/mg", "mmol/mmol"]);
  const CONVERSION_CONSTANTS = Object.freeze({ calciumMgPerMmol: "40.078" });
  const MESSAGES = Object.freeze({
    "invalid-input": "Sprawdź dane potrzebne do obliczenia Ca/Cit.", "invalid-mode": "Wybierz sposób wprowadzenia Ca/Cit.",
    "missing-calcium": "Wpisz stężenie wapnia w moczu.", "invalid-calcium": "Stężenie wapnia musi być liczbą nieujemną.",
    "missing-citrate": "Wpisz stężenie cytrynianów w moczu.", "invalid-citrate": "Stężenie cytrynianów musi być liczbą większą od zera.",
    "invalid-calcium-unit": "Wybierz jednostkę wapnia w moczu.", "invalid-citrate-unit": "Wybierz jednostkę cytrynianów w moczu.",
    "missing-reported-value": "Wpisz gotowy wynik Ca/Cit.", "invalid-reported-value": "Wpisz nieujemny wynik Ca/Cit. Zachowaj znak <, ≤, > lub ≥ z wydruku.",
    "invalid-reported-unit": "Wybierz jednostkę wyniku Ca/Cit: mg/mg lub mmol/mmol.",
    "different-specimens": "Nie można obliczyć Ca/Cit z oznaczeń z różnych próbek. Użyj obu stężeń z tej samej próbki moczu albo gotowego wyniku Ca/Cit.",
    "invalid-conversion": "Nie można przedstawić Ca/Cit z podanych wartości. Sprawdź stężenia i jednostki.",
  });
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
  const object = value => Boolean(value && typeof value === "object" && !Array.isArray(value));
  const finite = value => typeof value === "number" && Number.isFinite(value);
  const absent = value => value == null || typeof value === "string" && !value.trim();
  const copy = value => Array.isArray(value) ? value.map(copy) : object(value) ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)])) : value;
  const jsonFacts = value => value == null || typeof value === "number" && !finite(value) ? null : Array.isArray(value) ? value.map(jsonFacts) : object(value) ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonFacts(item)])) : value;
  const finiteData = value => typeof value === "number" ? finite(value) : Array.isArray(value) ? value.every(finiteData) : object(value) ? Object.values(value).every(finiteData) : true;
  function freeze(value) { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  function safeData(value, seen = new Set(), depth = 0) {
    if (value == null || ["string", "boolean", "number"].includes(typeof value)) return typeof value !== "string" || value.length <= 20000;
    if (!value || typeof value !== "object" || depth > 14 || seen.has(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== null && prototype !== (Array.isArray(value) ? Array.prototype : Object.prototype)) return false;
    seen.add(value);
    const entries = Object.entries(Object.getOwnPropertyDescriptors(value));
    const valid = entries.length <= 2000 && entries.every(([key, descriptor]) => !["__proto__", "constructor", "prototype"].includes(key) && !descriptor.get && !descriptor.set && safeData(descriptor.value, seen, depth + 1));
    seen.delete(value); return valid;
  }
  const primitive = value => typeof value === "string" ? value.length <= 512 ? value : "[invalid value]" : finite(value) ? value : value == null ? "" : "[invalid value]";
  function fraction(n, d = 1n) {
    if (n === 0n) return { n: 0n, d: 1n };
    let a = n < 0n ? -n : n, b = d;
    while (b) { const remainder = a % b; a = b; b = remainder; }
    return { n: n / a, d: d / a };
  }
  function decimal(value) {
    const text = String(value).trim().replace(",", ".");
    const match = /^(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(text);
    if (!match || !(match[1] || match[2]) || text.length > 512) return null;
    const n = BigInt((match[1] || "0") + (match[2] || ""));
    if (n === 0n) return fraction(0n);
    const scale = (match[2] || "").length - Number(match[3] || 0);
    // This resource bound is on decimal encoding, never on a clinical value or
    // unit. No intermediate conversion is coerced through a floating Number.
    if (!Number.isInteger(scale) || Math.abs(scale) > 4096) return null;
    return scale >= 0 ? fraction(n, 10n ** BigInt(scale)) : fraction(n * 10n ** BigInt(-scale));
  }
  const multiply = (a, b) => fraction(a.n * b.n, a.d * b.d);
  const divide = (a, b) => b.n === 0n ? null : fraction(a.n * b.d, a.d * b.n);
  const compare = (a, b) => a.n * b.d < b.n * a.d ? -1 : a.n * b.d > b.n * a.d ? 1 : 0;
  const exact = value => value ? { numerator: String(value.n), denominator: String(value.d) } : null;
  function fromExact(value) {
    if (!object(value) || !/^\d{1,8192}$/.test(value.numerator || "") || !/^[1-9]\d{0,8191}$/.test(value.denominator || "")) return null;
    return fraction(BigInt(value.numerator), BigInt(value.denominator));
  }
  function roundedQuotient(n, d) { const q = n / d, r = n % d; return q + (r * 2n > d || r * 2n === d && q % 2n === 1n ? 1n : 0n); }
  function numberOf(value) {
    if (value.n === 0n) return 0;
    let exponent = value.n.toString(2).length - value.d.toString(2).length;
    if (exponent >= 0 ? value.n < value.d * 2n ** BigInt(exponent) : value.n * 2n ** BigInt(-exponent) < value.d) exponent -= 1;
    if (exponent > 1023) return Infinity;
    if (exponent < -1075) return 0;
    const scale = exponent < -1022 ? 1074 : 52 - exponent;
    const coefficient = scale >= 0 ? roundedQuotient(value.n * 2n ** BigInt(scale), value.d) : roundedQuotient(value.n, value.d * 2n ** BigInt(-scale));
    return Number(coefficient) * 2 ** -scale;
  }
  function parsed(value, allowComparator = false) {
    if (typeof value !== "string" && !finite(value)) return null;
    const text = String(value).trim();
    if (!text || text.length > 512) return null;
    const match = /^([<>]=?|[≤≥])?\s*((?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?)$/.exec(text);
    if (!match || match[1] && !allowComparator) return null;
    const valueExact = decimal(match[2]);
    if (!valueExact) return null;
    const comparator = ({ "<=": "≤", ">=": "≥" })[match[1]] || match[1] || "";
    if (comparator === "<" && valueExact.n === 0n) return null;
    return { text: match[2].replace(",", "."), value: numberOf(valueExact), fraction: valueExact, comparator };
  }
  function parseValue(value) {
    const result = parsed(value, true);
    return result ? freeze({ text: result.text, value: result.value, comparator: result.comparator, exact: exact(result.fraction), representable: finite(result.value) && (result.value !== 0 || result.fraction.n === 0n) }) : null;
  }
  function decimalText(value, places = 1100) {
    let remainder = value.n % value.d, digits = "";
    for (let i = 0; remainder && i < places; i += 1) { remainder *= 10n; digits += String(remainder / value.d); remainder %= value.d; }
    return { text: String(value.n / value.d) + (digits ? "." + digits : ""), complete: remainder === 0n };
  }
  function compact(value, exactUpper) {
    const short = decimalText(value, 12);
    if (short.complete && short.text.length <= 16) return { text: short.text, approximate: false };
    const full = decimalText(value);
    // Preserve readable exact input when rounding would disguise a genuinely
    // exceeded source boundary, even when its Number equals that boundary.
    if (exactUpper && full.complete && full.text.length <= 80 && compare(value, exactUpper) > 0) return { text: full.text, approximate: false };
    const numeric = numberOf(value);
    let text;
    if (numeric < 0.000001 || numeric >= 1000000) {
      const power = exponent => exponent >= 0 ? fraction(10n ** BigInt(exponent)) : fraction(1n, 10n ** BigInt(-exponent));
      let exponent = value.n.toString().length - value.d.toString().length;
      if (compare(value, power(exponent)) < 0) exponent -= 1;
      const scaled = divide(value, power(exponent));
      let coefficient = roundedQuotient(scaled.n * 100000n, scaled.d);
      if (coefficient >= 1000000n) { coefficient /= 10n; exponent += 1; }
      const digits = String(coefficient).padStart(6, "0"), tail = digits.slice(1).replace(/0+$/, "");
      text = digits[0] + (tail ? "." + tail : "") + "e" + (exponent >= 0 ? "+" : "") + exponent;
    } else {
      const coefficient = roundedQuotient(value.n * 1000000n, value.d), tail = String(coefficient % 1000000n).padStart(6, "0").replace(/0+$/, "");
      text = String(coefficient / 1000000n) + (tail ? "." + tail : "");
    }
    return { text, approximate: compare(decimal(text), value) !== 0 };
  }
  function formatValue(value, exactValue) {
    const quantity = fromExact(exactValue) || finite(value) && value >= 0 && decimal(String(value));
    if (!quantity || !finite(value) || value < 0 || numberOf(quantity) !== value || value === 0 && quantity.n !== 0n) return "";
    const result = compact(quantity); return (result.approximate ? "≈" : "") + result.text.replace(".", ",");
  }
  function fullValueText(value, exactValue) {
    const quantity = fromExact(exactValue) || finite(value) && value >= 0 && decimal(String(value));
    if (!quantity || !finite(value) || numberOf(quantity) !== value) return "";
    const full = decimalText(quantity); return full.complete ? full.text.replace(".", ",") : String(quantity.n) + "/" + String(quantity.d);
  }
  function normalizedUnit(value) {
    const text = String(value ?? "").replace(/\s/g, "").replace(/μ/g, "µ").toLowerCase();
    return ({ "µmol/l": "µmol/L", "umol/l": "µmol/L", "umol": "µmol/L", "mmol/l": "mmol/L", "mg/l": "mg/L", "mg/dl": "mg/dL", "mg/mg": "mg/mg", "mmol/mmol": "mmol/mmol", "mol/mol": "mmol/mmol" })[text] || String(value ?? "");
  }
  function reportedOriginal(value, unit) {
    if (typeof value !== "string" || value.length > 512) return null;
    const key = value.replace(/\s/g, "").toLowerCase(), canonical = ({ "g/g": "mg/mg", "mol/mol": "mmol/mmol" })[key];
    return canonical && canonical === normalizedUnit(unit) ? value : null;
  }
  function calciumFactor(unit, dimension) {
    const ca = decimal(CONVERSION_CONSTANTS.calciumMgPerMmol);
    if (dimension === "mass") return unit === "mg/L" ? fraction(1n) : unit === "mg/dL" ? fraction(10n) : unit === "mmol/L" ? ca : unit === "µmol/L" ? divide(ca, fraction(1000n)) : null;
    return unit === "mmol/L" ? fraction(1n) : unit === "µmol/L" ? fraction(1n, 1000n) : unit === "mg/L" ? divide(fraction(1n), ca) : unit === "mg/dL" ? divide(fraction(10n), ca) : null;
  }
  function validProfile(profile) {
    const positive = value => finite(value) && value > 0;
    return object(profile) && typeof profile.id === "string" && profile.id !== "" && profile.quantity === "urine-calcium-citrate-ratio" && profile.nativeUnit === "mg/mg" &&
      typeof profile.population?.label === "string" && typeof profile.source?.label === "string" && profile.referenceKind === "source-population-upper-P95" &&
      Array.isArray(profile.bands) && profile.bands.length > 0 && profile.bands.every(band => band && finite(band.minimumAgeYearsInclusive) && band.minimumAgeYearsInclusive >= 0 && positive(band.maximumAgeYearsExclusive) && band.maximumAgeYearsExclusive > band.minimumAgeYearsInclusive && typeof band.label === "string" && ["M", "F"].every(sex => positive(band.bySex?.[sex]?.upper) && finite(band.bySex[sex].lowerP5) && band.bySex[sex].lowerP5 >= 0 && band.bySex[sex].lowerP5 < band.bySex[sex].upper)) &&
      ["within", "above"].every(code => profile.categories?.[code]?.code === code && typeof profile.categories[code].label === "string" && ["success", "warning", "neutral"].includes(profile.categories[code].tone)) &&
      Array.isArray(profile.restrictions?.applicableSampleTypes) && profile.restrictions.applicableSampleTypes.includes("timed") && positive(profile.restrictions.requiredCollectionHours) && profile.restrictions.upperInclusive === true && profile.restrictions.allowMolarConversion === false && profile.restrictions.lowerP5IsAlarm === false &&
      ["within", "above", "zero", "molar", "missingAge", "missingSex", "underAge", "adult", "sample", "unsupportedSample", "historicalSample", "collectionProblem", "differentSpecimens", "otherDuration", "invalidDuration", "censored"].every(key => typeof profile.notes?.[key] === "string");
  }
  function normalizedSex(value) { return ["M", "m", "male"].includes(value) ? "M" : ["F", "f", "female"].includes(value) ? "F" : ""; }
  function booleanFact(value) { return [true, "true", "yes"].includes(value) ? true : [false, "false", "no"].includes(value) ? false : undefined; }
  function sameSpecimen(value) { return value === "different" || booleanFact(value) === false ? "different" : value === "confirmed" || booleanFact(value) === true ? "confirmed" : "assumed"; }
  function ageFromInput(input) {
    const raw = own(input, "ageYearsRaw") ? input.ageYearsRaw : input.ageYears;
    let quantity = fromExact(input.ageExact), interval = null;
    if (!quantity) quantity = parsed(raw)?.fraction || null;
    if (input.agePrecision === "completed-years") {
      const low = input.ageInterval?.minimumAgeYearsInclusive, high = input.ageInterval?.maximumAgeYearsExclusive;
      if (Number.isInteger(low) && low >= 0 && high === low + 1 && quantity && compare(quantity, decimal(low)) === 0) interval = copy(input.ageInterval);
      else quantity = null;
    }
    if (quantity && (!finite(numberOf(quantity)) || compare(quantity, fraction(120n)) > 0)) quantity = null;
    return { raw: absent(raw) ? null : primitive(raw), exact: quantity, value: quantity ? numberOf(quantity) : null, interval };
  }
  function tableFor(profile, selectedId = "", selectedSex = "") {
    return profile.bands.map(band => ({ ...copy(band), selected: band.id === selectedId, selectedSex: band.id === selectedId ? selectedSex : "", unit: "mg/mg",
      bySex: Object.fromEntries(["M", "F"].map(sex => [sex, { ...copy(band.bySex[sex]), limit: "≤" + String(band.bySex[sex].upper).replace(".", ","), unit: "mg/mg" }])) }));
  }
  function classify(value, comparator, upper) {
    const relation = compare(value, upper);
    if (!comparator) return relation > 0 ? "above" : "within";
    if (comparator === "<" || comparator === "≤") return relation <= 0 ? "within" : null;
    if (comparator === ">") return relation >= 0 ? "above" : null;
    return relation > 0 ? "above" : null;
  }
  function validationFields(request, mode) {
    const missingIds = [], invalidIds = [];
    const check = (key, id, valid) => {
      if (absent(request[key])) missingIds.push(id);
      else if (!valid(request[key])) invalidIds.push(id);
    };
    if (mode === "reported") {
      check("reportedValue", "CACIT_reportedValue", value => Boolean(parsed(value, true)));
      check("reportedUnit", "CACIT_reportedUnit", value => REPORTED_UNITS.includes(normalizedUnit(value)));
    } else if (mode === "concentration") {
      check("calciumValue", "CACIT_calcium", value => Boolean(parsed(value)));
      check("calciumUnit", "CACIT_calciumUnit", value => INPUT_UNITS.includes(normalizedUnit(value)));
      check("citrateValue", "CACIT_citrate", value => { const result = parsed(value); return Boolean(result && result.fraction.n !== 0n); });
      check("citrateUnit", "CACIT_citrateUnit", value => INPUT_UNITS.includes(normalizedUnit(value)));
    } else invalidIds.push("CACIT_inputMode");
    return { missingIds, invalidIds };
  }
  function evaluate(input, profile) {
    const request = safeData(input) && object(input) ? input : {}, validInput = input == null || safeData(input) && object(input);
    const mode = ["reported", "direct", "ready"].includes(request.mode) ? "reported" : request.mode ?? "concentration";
    const age = ageFromInput(request), sourceValid = safeData(profile) && finiteData(profile) && validProfile(profile), paired = sameSpecimen(request.concentrationSameSpecimen ?? request.sameSpecimen);
    const context = { ageYears: age.value, ageYearsRaw: age.raw, ageExact: age.exact && !age.interval ? exact(age.exact) : null,
      ...(age.interval ? { agePrecision: "completed-years", ageInterval: age.interval } : {}), sex: normalizedSex(request.sex), sameSpecimen: mode === "reported" ? "not-applicable" : paired, concentrationSameSpecimen: paired,
      ...(own(request, "reportedSameSpecimen") ? { reportedSameSpecimen: sameSpecimen(request.reportedSameSpecimen) } : {}),
      sampleType: typeof request.sampleType === "string" ? request.sampleType : "timed", sampleSource: typeof request.sampleSource === "string" ? request.sampleSource : "assumed-current",
      collectionHours: primitive(request.collectionHours), durationSource: typeof request.durationSource === "string" ? request.durationSource : "",
      ...(booleanFact(request.durationKnown) !== undefined ? { durationKnown: booleanFact(request.durationKnown) } : {}),
      ...(booleanFact(request.collectionProblem) !== undefined ? { collectionProblem: booleanFact(request.collectionProblem) } : {}),
      knownFacts: object(request.knownFacts) || Array.isArray(request.knownFacts) ? jsonFacts(request.knownFacts) : {}, confounders: Array.isArray(request.confounders) ? jsonFacts(request.confounders) : [] };
    if (request.knownIncomplete === true) context.knownFacts = { ...(object(context.knownFacts) ? context.knownFacts : {}), knownIncomplete: true };
    const fieldValidation = validInput ? validationFields(request, mode) : { missingIds: [], invalidIds: [] };
    const base = { valid: false, reasonCode: "", message: "", mode, sourceFormula: "Ca_Cit", rawValue: null, unit: "", comparator: "", exact: false, exactValue: null, zero: false,
      missingIds: fieldValidation.missingIds, invalidIds: fieldValidation.invalidIds,
      classificationValue: null, classificationUnit: "mg/mg", category: null, categoryDescription: "", comparison: null, status: "unassessed", tone: "neutral", outOfRange: null, statusText: "Ca/Cit — wynik liczbowy", comment: "", boundary: "", display: null,
      referenceAvailable: false, reference: null, referenceTable: [], source: null, population: null, profileId: null, profileVersion: null, policy: null, referencePolicy: null, restrictions: null, notes: null, conversionConstants: copy(CONVERSION_CONSTANTS),
      qualification: { reasonCode: "", note: "", requiresConfirmation: false }, context,
      canonicalConcentrations: null,
      input: mode === "reported" ? { mode, reportedValue: primitive(request.reportedValue), reportedUnit: primitive(request.reportedUnit), ...(reportedOriginal(request.reportedUnitOriginal, request.reportedUnit) ? { reportedUnitOriginal: request.reportedUnitOriginal } : {}) } : { mode, calciumValue: primitive(request.calciumValue), calciumUnit: primitive(request.calciumUnit), citrateValue: primitive(request.citrateValue), citrateUnit: primitive(request.citrateUnit) } };
    if (sourceValid) Object.assign(base, { profileId: profile.id, profileVersion: profile.version ?? null, policy: { id: profile.id, version: profile.version ?? null }, referencePolicy: copy(profile), source: copy(profile.source), population: copy(profile.population), notes: copy(profile.notes), restrictions: copy(profile.restrictions), referenceTable: tableFor(profile) });
    function finish(reasonCode = "") {
      if (reasonCode === "invalid-conversion") base.invalidIds = mode === "reported" ? ["CACIT_reportedValue"] : ["CACIT_calcium", "CACIT_citrate"];
      const result = { ...base, reasonCode };
      if (!result.valid) { result.message = MESSAGES[reasonCode] || MESSAGES["invalid-input"]; result.statusText = result.message; }
      return freeze({ ...result, snapshot: result.valid ? { schema: SCHEMA, version: ENGINE_VERSION, ...copy(result) } : null });
    }
    if (!validInput) return finish("invalid-input");
    if (!["concentration", "reported"].includes(mode)) return finish("invalid-mode");
    let value, unit, comparator = "", reported;
    if (mode === "reported") {
      reported = parsed(request.reportedValue, true);
      if (!reported) return finish(absent(request.reportedValue) ? "missing-reported-value" : "invalid-reported-value");
      unit = normalizedUnit(request.reportedUnit);
      if (!REPORTED_UNITS.includes(unit)) return finish("invalid-reported-unit");
      value = reported.fraction; comparator = reported.comparator;
    } else {
      if (paired === "different") return finish("different-specimens");
      const calcium = parsed(request.calciumValue), citrate = parsed(request.citrateValue);
      if (!calcium) return finish(absent(request.calciumValue) ? "missing-calcium" : "invalid-calcium");
      if (!citrate || citrate.fraction.n === 0n) return finish(absent(request.citrateValue) ? "missing-citrate" : "invalid-citrate");
      const calciumUnit = normalizedUnit(request.calciumUnit), citrateUnit = normalizedUnit(request.citrateUnit), mass = citrateUnit === "mg/dL" || citrateUnit === "mg/L";
      if (!INPUT_UNITS.includes(calciumUnit)) return finish("invalid-calcium-unit");
      if (!INPUT_UNITS.includes(citrateUnit)) return finish("invalid-citrate-unit");
      const calciumScale = calciumFactor(calciumUnit, mass ? "mass" : "molar"), citrateScale = citrateUnit === "mg/dL" ? fraction(10n) : citrateUnit === "µmol/L" ? fraction(1n, 1000n) : fraction(1n);
      const canonicalCalcium = multiply(calcium.fraction, calciumScale), canonicalCitrate = multiply(citrate.fraction, citrateScale);
      const canonicalText = quantity => { const shown = compact(quantity); return (shown.approximate ? "≈" : "") + shown.text; };
      base.canonicalConcentrations = { calcium: canonicalText(canonicalCalcium), citrate: canonicalText(canonicalCitrate), unit: mass ? "mg/L" : "mmol/L", exactCalcium: exact(canonicalCalcium), exactCitrate: exact(canonicalCitrate) };
      value = divide(canonicalCalcium, canonicalCitrate); unit = mass ? "mg/mg" : "mmol/mmol";
    }
    const rawValue = numberOf(value);
    if (!finite(rawValue) || rawValue === 0 && value.n !== 0n) return finish("invalid-conversion");
    const full = decimalText(value), shown = mode === "reported" && reported.text.length <= 16 ? { text: reported.text, approximate: false } : compact(value);
    Object.assign(base, { valid: true, rawValue, unit, comparator, exact: comparator === "", exactValue: exact(value), zero: value.n === 0n && (!comparator || comparator === "≤"), classificationValue: unit === "mg/mg" ? rawValue : null,
      display: { value: shown.text, text: comparator + (shown.approximate ? "≈" : "") + shown.text, unit, comparator, boundary: "", rounded: shown.approximate, approximate: shown.approximate, fullValueText: full.text, fullValueComplete: full.complete } });
    function unassessed(reason, note) { base.comment = note; base.qualification = { reasonCode: reason, note, requiresConfirmation: false }; if (base.zero) base.statusText = "Wartość zerowa — sprawdź raport"; return finish(reason); }
    if (!sourceValid) return unassessed(profile ? "invalid-profile" : "missing-profile", "Nie dobrano źródła normy Ca/Cit. Wynik liczbowy pozostaje dostępny.");
    if (unit !== profile.nativeUnit) return unassessed("molar-no-reference", profile.notes.molar);
    if (mode === "reported" && paired === "different" && context.reportedSameSpecimen !== "confirmed") return unassessed("different-specimens-reported", profile.notes.differentSpecimens);
    const facts = context.knownFacts, factsIncomplete = object(facts) && (facts.Cl24CollectionProblem === true || facts.knownIncomplete === true || ["collectionNoMissedVoids", "collectionNoSpillage", "collectionNoExtraVoids", "collectionStartVoidDiscarded", "collectionFinalVoidIncluded", "collectionStorageFollowed"].some(key => facts[key] === false));
    if (context.collectionProblem === true || request.knownIncomplete === true || factsIncomplete) return unassessed("collection-problem", profile.notes.collectionProblem);
    if (["historical-missing", "historical-unknown", "unknown"].includes(context.sampleSource) || ["historical-missing", "historical-unknown"].includes(context.durationSource) || context.durationKnown === false) return unassessed("historical-unknown-sample", profile.notes.historicalSample);
    if (!profile.restrictions.applicableSampleTypes?.includes(context.sampleType)) return unassessed("unsupported-specimen", profile.notes.unsupportedSample);
    if (!absent(request.collectionHours)) {
      const hours = parsed(request.collectionHours);
      if (!hours || hours.fraction.n === 0n) return unassessed("invalid-duration", profile.notes.invalidDuration);
      if (compare(hours.fraction, decimal(profile.restrictions.requiredCollectionHours)) !== 0) return unassessed("non-24h-collection", profile.notes.otherDuration);
    }
    if (!age.exact) return unassessed(age.raw === null ? "missing-age" : "invalid-age", profile.notes.missingAge);
    const matches = profile.bands.filter(band => compare(age.exact, decimal(band.minimumAgeYearsInclusive)) >= 0 && compare(age.exact, decimal(band.maximumAgeYearsExclusive)) < 0 && (!age.interval || age.interval.maximumAgeYearsExclusive <= band.maximumAgeYearsExclusive));
    if (matches.length !== 1) {
      const minimum = Math.min(...profile.bands.map(band => band.minimumAgeYearsInclusive)), maximum = Math.max(...profile.bands.map(band => band.maximumAgeYearsExclusive));
      return unassessed(age.value < minimum ? "under-age" : age.value >= maximum ? "adult-no-reference" : matches.length ? "ambiguous-age-band" : "no-age-band", age.value < minimum ? profile.notes.underAge : age.value >= maximum ? profile.notes.adult : "Nie dobrano jednoznacznej normy Ca/Cit dla tego wieku.");
    }
    if (!context.sex) return unassessed("missing-sex", profile.notes.missingSex);
    const band = { ...copy(matches[0]), ...copy(matches[0].bySex[context.sex]), sex: context.sex }, upper = decimal(band.upper), limit = "≤" + String(band.upper).replace(".", ",");
    const table = tableFor(profile, band.id, context.sex);
    base.reference = { label: "Norma dla wieku", unit: "mg/mg", nativeUnit: "mg/mg", upper: band.upper, nativeHigh: band.upper, upperInclusive: true, exactUpper: exact(upper), limit, range: limit,
      display: { upper: String(band.upper).replace(".", ","), limit, unit: "mg/mg" }, band, table, source: copy(profile.source), population: { ...copy(profile.population), ageBand: band.label, sex: context.sex },
      profileId: profile.id, profileVersion: profile.version ?? null, comparisonMode: profile.comparisonMode, referenceKind: profile.referenceKind };
    base.referenceAvailable = true; base.referenceTable = table; base.population = copy(base.reference.population);
    if (base.zero) return unassessed("zero-result", profile.notes.zero);
    const category = classify(value, comparator, upper);
    base.category = category; base.comparison = category || "ambiguous"; base.status = category || "unassessed"; base.tone = category ? profile.categories[category].tone : "neutral";
    base.outOfRange = category ? category === "above" : null;
    base.statusText = category ? profile.categories[category].label : "Nierówność nie rozstrzyga oceny";
    base.categoryDescription = category ? profile.categories[category].label : ""; base.comment = category ? profile.notes[category] : profile.notes.censored;
    base.qualification = { reasonCode: category ? "" : "censored-multiple-categories", note: base.comment, requiresConfirmation: category === "above" };
    const precise = compact(value, upper), displayed = mode === "reported" && reported.text.length <= 16 ? shown : precise;
    base.display.value = displayed.text; base.display.text = comparator + (displayed.approximate ? "≈" : "") + displayed.text; base.display.rounded = displayed.approximate; base.display.approximate = displayed.approximate;
    if (category && displayed.approximate && classify(decimal(displayed.text), comparator, upper) !== category) {
      base.boundary = (category === "above" ? ">" : "≤") + String(band.upper).replace(".", ","); base.display.boundary = base.boundary;
    }
    return finish(category ? "" : "censored-multiple-categories");
  }
  function captureFields(source) {
    const data = {}, doc = source?.getElementById ? source : !source ? root?.document : null;
    const vault = doc?.defaultView?.__vildaClcrVersionValueVault || root?.__vildaClcrVersionValueVault || {};
    for (const id of [...FIELD_IDS, ...CONTEXT_FIELD_IDS, ...METADATA_FIELD_IDS]) {
      const control = doc?.getElementById(id);
      if (control) data[id] = ["checkbox", "radio"].includes(control.type) ? control.checked === true : primitive(control.value);
      else if (doc && own(vault, id)) data[id] = typeof vault[id] === "boolean" ? vault[id] : primitive(vault[id]);
      else if (!doc && object(source) && own(source, id)) data[id] = typeof source[id] === "boolean" ? source[id] : primitive(source[id]);
    }
    return data;
  }
  function inputFromValues(values, context = {}) {
    const data = safeData(values) && object(values) ? values : {}, patient = safeData(context) && object(context) ? copy(context) : {};
    const value = id => own(data, id) ? data[id] : DEFAULTS[id];
    const input = { ...patient, mode: value("CACIT_inputMode"), calciumValue: value("CACIT_calcium"), calciumUnit: value("CACIT_calciumUnit"), citrateValue: value("CACIT_citrate"), citrateUnit: value("CACIT_citrateUnit"), reportedValue: value("CACIT_reportedValue"), reportedUnit: value("CACIT_reportedUnit") };
    if (own(data, "CACIT_reportedUnitOriginal")) input.reportedUnitOriginal = data.CACIT_reportedUnitOriginal;
    for (const key of ["sameSpecimen", "sampleType", "sampleSource", "collectionHours", "durationSource"]) {
      const candidate = value("CACIT_" + key);
      if (!own(data, "CACIT_" + key) && own(patient, key)) continue;
      // Hidden controls initialized for a fresh form encode assumptions, not
      // evidence capable of erasing a known historical or contrary fact.
      if (own(patient, key) && (absent(candidate) && !absent(patient[key]) || key === "sameSpecimen" && candidate === "assumed" && ["different", "confirmed"].includes(patient[key]) || key === "sampleSource" && candidate === "assumed-current" && !absent(patient[key]) || key === "sampleType" && candidate === "timed" && value("CACIT_sampleSource") === "assumed-current" && !absent(patient[key]) && patient[key] !== "timed")) continue;
      input[key] = candidate;
    }
    for (const key of ["collectionProblem", "durationKnown"]) {
      const fact = booleanFact(value("CACIT_" + key));
      if (fact !== undefined && !(key === "collectionProblem" && patient[key] === true || key === "durationKnown" && patient[key] === false)) input[key] = fact;
    }
    return input;
  }
  function patientFromDocument(doc, context = {}) {
    const patient = safeData(context) && object(context) ? copy(context) : {};
    if (!["ageYears", "ageYearsRaw", "ageExact"].some(key => own(patient, key))) {
      const clinical = doc?.defaultView?.ClcrClinicalSafety || root?.ClcrClinicalSafety, age = clinical?.readAgeFromDocument?.(doc);
      patient.ageYears = age?.valid ? age.exactYears : null; patient.ageYearsRaw = age?.valid ? String(age.exactYears) : null;
      if (age?.valid) {
        let quantity = fraction(BigInt(age.totalMonths), 12n);
        if (age.daysOfLife != null) { const days = divide(fraction(BigInt(age.daysOfLife)), decimal("365.2425")); quantity = fraction(quantity.n * days.d + days.n * quantity.d, quantity.d * days.d); }
        patient.ageExact = exact(quantity);
      }
    }
    if (!own(patient, "sex")) patient.sex = doc?.getElementById("sex")?.value || "";
    const facts = object(patient.knownFacts) ? copy(patient.knownFacts) : {};
    for (const id of ["Cl24CollectionProblem", "collectionStartVoidDiscarded", "collectionFinalVoidIncluded", "collectionNoMissedVoids", "collectionNoSpillage", "collectionNoExtraVoids", "collectionStorageFollowed"]) {
      if (id === "Cl24CollectionProblem" ? facts[id] === true : facts[id] === false) continue;
      const answer = doc?.getElementById("ui_" + id + "_answer")?.value, control = doc?.getElementById(id);
      if (answer === "yes" || answer === "no") facts[id] = answer === "yes";
      else if (answer === "unknown") facts[id] = null;
      else if (control?.checked === true) facts[id] = true;
    }
    patient.knownFacts = facts; return patient;
  }
  function readInputFromDocument(documentRef, context = {}) { const doc = documentRef || root?.document; return inputFromValues(captureFields(doc), patientFromDocument(doc, context)); }
  function evaluateFromDocument(documentRef, profile, context = {}) { return evaluate(readInputFromDocument(documentRef, context), profile); }
  function normalizeInput(input, context) { return safeData(input) && object(input) ? FIELD_IDS.some(id => own(input, id)) ? inputFromValues(input, context) : copy(input) : { mode: "invalid-input" }; }
  return Object.freeze({ ENGINE_VERSION, SCHEMA, DEFAULTS, FIELD_IDS, CONTEXT_FIELD_IDS, METADATA_FIELD_IDS, INPUT_UNITS, REPORTED_UNITS, CONVERSION_CONSTANTS,
    evaluate, parseValue, parseReportedValue: parseValue, formatValue, fullValueText, normalizedUnit, captureFields, inputFromValues, normalizeInput, readInputFromDocument, evaluateFromDocument });
});
