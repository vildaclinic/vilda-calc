(function (root, factory) {
  const api = factory(root);
  if (root) root.VildaClcrCacr = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";

  const INPUT_MESSAGES = Object.freeze({
    "invalid-mode": "Wybierz sposób wprowadzenia Ca/Cr.",
    "missing-reported-value": "Wpisz wynik Ca/Cr z laboratorium.",
    "invalid-reported-value": "Wpisz nieujemny wynik Ca/Cr. Zachowaj znak <, ≤, > lub ≥ z wydruku.",
    "invalid-reported-unit": "Wybierz jednostkę wyniku Ca/Cr.",
    "different-specimens": "Nie można obliczyć Ca/Cr z oznaczeń z różnych próbek. Użyj wapnia i kreatyniny z tej samej próbki moczu albo gotowego wyniku Ca/Cr.",
    "missing-calcium": "Wpisz stężenie wapnia w moczu.",
    "invalid-calcium": "Stężenie wapnia w moczu musi być liczbą nieujemną.",
    "missing-creatinine": "Wpisz stężenie kreatyniny w moczu.",
    "invalid-creatinine": "Stężenie kreatyniny w moczu musi być liczbą większą od zera.",
    "invalid-calcium-unit": "Wybierz jednostkę wapnia w moczu: mg/dL, mg/L, mmol/L lub µmol/L.",
    "invalid-creatinine-unit": "Wybierz jednostkę kreatyniny w moczu: mg/dL, mg/L, mmol/L lub µmol/L.",
    "invalid-conversion": "Nie można obliczyć Ca/Cr z podanych wartości. Sprawdź stężenia i jednostki.",
  });
  const UNITS = Object.freeze(["mg/mg", "mg/g", "g/g", "mol/mol", "mmol/mmol", "mmol/mol", "mg/mmol"]);
  const DZM_DEFAULTS = Object.freeze({
    CACR_DZM_inputMode: "concentration", CACR_DZM_calcium: "", CACR_DZM_calciumUnit: "mmol/L",
    CACR_DZM_creatinine: "", CACR_DZM_creatinineUnit: "mg/dL", CACR_DZM_reportedValue: "", CACR_DZM_reportedUnit: "mg/mg",
    CACR_DZM_sameSpecimen: "assumed", CACR_DZM_collectionProblem: "", CACR_DZM_collectionHours: "", CACR_DZM_durationKnown: "", CACR_DZM_currentPreterm: "",
  });
  const DZM_FIELD_IDS = Object.freeze(Object.keys(DZM_DEFAULTS).slice(0, 7));
  const DZM_CONTEXT_FIELD_IDS = Object.freeze(Object.keys(DZM_DEFAULTS).slice(7));

  function freeze(value) {
    if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  }
  function copy(value) {
    if (Array.isArray(value)) return value.map(copy);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]));
    return value;
  }
  function absent(value) { return value == null || (typeof value === "string" && value.trim() === ""); }
  function nonnegative(value) { return typeof value === "number" && Number.isFinite(value) && value >= 0; }
  function positive(value) { return nonnegative(value) && value > 0; }

  // Decimal fractions preserve the input and declared conversion constants
  // exactly while comparing the two closed source endpoints. No epsilon moves
  // a truly exceeded endpoint back into the reference interval, and equivalent
  // concentration units share one canonical mass ratio.
  function fraction(numerator, denominator = 1n) {
    if (numerator === 0n) return { n: 0n, d: 1n };
    let a = numerator;
    let b = denominator;
    while (b !== 0n) { const remainder = a % b; a = b; b = remainder; }
    return { n: numerator / a, d: denominator / a };
  }
  function decimalFraction(text) {
    const match = String(text).replace(",", ".").toLowerCase().match(/^(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/);
    if (!match || !(match[1] || match[2])) return null;
    const numerator = BigInt((match[1] || "0") + (match[2] || ""));
    if (numerator === 0n) return fraction(0n);
    const exponent = Number(match[3] || 0);
    // Input text is at most 256 characters. Exponents beyond this bound cannot
    // encode a nonzero finite Number and are rejected before allocating powers.
    if (!Number.isInteger(exponent) || Math.abs(exponent) > 1000) return null;
    const scale = (match[2] || "").length - exponent;
    return scale >= 0 ? fraction(numerator, 10n ** BigInt(scale)) : fraction(numerator * 10n ** BigInt(-scale));
  }
  function multiply(value, numerator, denominator = 1n) { return fraction(value.n * numerator, value.d * denominator); }
  function divide(a, b) { return b.n === 0n ? null : fraction(a.n * b.d, a.d * b.n); }
  function compare(a, b) { const diff = a.n * b.d - b.n * a.d; return diff < 0n ? -1 : diff > 0n ? 1 : 0; }
  function roundedQuotient(n, d) {
    const quotient = n / d, remainder = n % d;
    return quotient + (remainder * 2n > d || remainder * 2n === d && quotient % 2n === 1n ? 1n : 0n);
  }
  // Round the complete rational once to IEEE754, including subnormals. This
  // avoids Infinity/Infinity intermediates and a truncated-mantissa fallback.
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
  function wire(value) { return { numerator: String(value.n), denominator: String(value.d) }; }
  function fromWire(value) {
    if (!value || !/^\d{1,4096}$/.test(value.numerator || "") || !/^[1-9]\d{0,4095}$/.test(value.denominator || "")) return null;
    return fraction(BigInt(value.numerator), BigInt(value.denominator));
  }
  function parsedValue(input) {
    if (typeof input !== "string" && !nonnegative(input)) return null;
    const text = String(input).trim();
    if (text.length > 256) return null;
    const match = text.match(/^([<>]=?|[≤≥])?\s*((?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?)$/);
    if (!match) return null;
    const value = Number(match[2].replace(",", "."));
    if (!nonnegative(value)) return null;
    const exactFraction = decimalFraction(match[2]);
    if (!exactFraction || (value === 0 && exactFraction.n !== 0n)) return null;
    const comparator = ({ "<=": "≤", ">=": "≥" })[match[1]] || match[1] || "";
    if (comparator === "<" && value === 0) return null;
    return { value, comparator, text: match[2].replace(",", "."), fraction: exactFraction };
  }
  function parseReportedValue(input) {
    const parsed = parsedValue(input);
    return parsed ? Object.freeze({ value: parsed.value, comparator: parsed.comparator, text: parsed.text }) : null;
  }
  function validProfile(profile) {
    const validRange = range => range && nonnegative(range.lower) && positive(range.upper) && range.upper > range.lower;
    return profile && typeof profile.id === "string" && profile.id !== "" &&
      profile.quantity === "urine-calcium-creatinine-ratio" && profile.nativeUnit === "mg/mg" &&
      profile.population && typeof profile.population.label === "string" &&
      profile.source && typeof profile.source.label === "string" &&
      profile.conversionConstants && positive(Number(profile.conversionConstants.calciumMgPerMmol)) &&
      positive(Number(profile.conversionConstants.creatinineMgPerMmol)) &&
      decimalFraction(profile.conversionConstants.calciumMgPerMmol) && decimalFraction(profile.conversionConstants.creatinineMgPerMmol) &&
      Array.isArray(profile.bands) && profile.bands.length > 0 && profile.bands.every(band =>
        band && nonnegative(band.minimumAgeMonthsInclusive) &&
        (band.maximumAgeMonths === null || positive(band.maximumAgeMonths) && band.maximumAgeMonths > band.minimumAgeMonthsInclusive) &&
        typeof band.maximumAgeInclusive === "boolean" && typeof band.label === "string" &&
        (band.bySex ? validRange(band.bySex.M) && validRange(band.bySex.F) : validRange(band))) &&
      profile.categories && ["below", "within", "above"].every(code => profile.categories[code]?.code === code &&
        typeof profile.categories[code].label === "string" && ["success", "warning", "danger", "neutral"].includes(profile.categories[code].tone)) &&
      profile.notes && ["universal", "below", "within", "above", "missingAge", "underAge", "overAge", "censored"].every(key => typeof profile.notes[key] === "string");
  }
  // Conversion constants are separate from the normative bands and are needed
  // even if the caller deliberately supplies no normative profile.
  const APPLICATION_CONVERSION = Object.freeze({ calciumMgPerMmol: "40.078", creatinineMgPerMmol: "113.12" });
  function unitFactor(unit, constants) {
    const ca = decimalFraction(constants.calciumMgPerMmol);
    const cr = decimalFraction(constants.creatinineMgPerMmol);
    if (unit === "mg/mg" || unit === "g/g") return fraction(1n);
    if (unit === "mg/g") return fraction(1n, 1000n);
    if (unit === "mol/mol" || unit === "mmol/mmol") return divide(ca, cr);
    if (unit === "mmol/mol") return multiply(divide(ca, cr), 1n, 1000n);
    if (unit === "mg/mmol") return divide(fraction(1n), cr);
    return null;
  }
  function concentrationFactor(unit, analyte, constants) {
    if (["mg/dL", "mg/dl"].includes(unit)) return fraction(10n);
    if (unit === "mg/L") return fraction(1n);
    const mass = decimalFraction(analyte === "calcium" ? constants.calciumMgPerMmol : constants.creatinineMgPerMmol);
    if (unit === "mmol/L") return mass;
    if (["umol", "umol/L", "µmol/L", "μmol/L"].includes(unit)) return multiply(mass, 1n, 1000n);
    return null;
  }
  function inBand(age, band) {
    const lower = multiply(decimalFraction(String(band.minimumAgeMonthsInclusive)), 1n, 12n);
    const upper = band.maximumAgeMonths === null ? null : multiply(decimalFraction(String(band.maximumAgeMonths)), 1n, 12n);
    return compare(age, lower) >= 0 && (!upper || compare(age, upper) < 0 || band.maximumAgeInclusive && compare(age, upper) === 0);
  }
  function normalizedSex(value) {
    return ["M", "m", "male"].includes(value) ? "M" : ["F", "f", "female"].includes(value) ? "F" : "";
  }
  function rangeForSex(band, sex) {
    if (!band.bySex) return band;
    const shared = band.bySex.M.lower === band.bySex.F.lower && band.bySex.M.upper === band.bySex.F.upper;
    const range = band.bySex[sex] || (shared ? band.bySex.M : null);
    return range ? { ...band, ...range, sex: sex || "", sharedSexRange: shared } : null;
  }
  function ageFromInput(request) {
    const explicit = Object.prototype.hasOwnProperty.call(request, "ageYearsRaw") ? request.ageYearsRaw : request.ageYears;
    let exact = fromWire(request.ageExact);
    const parsed = parsedValue(explicit);
    if (!exact && parsed && !parsed.comparator) exact = parsed.fraction;
    // Numeric callers historically represent complete months with /12. Their
    // already-rounded Number cannot carry extra decimal evidence. Raw strings
    // and DOM ageExact always keep their full value instead of rounding a bin.
    if (!request.ageExact && !Object.prototype.hasOwnProperty.call(request, "ageYearsRaw") && nonnegative(request.ageYears) && Number.isInteger(request.ageYears * 12)) exact = fraction(BigInt(request.ageYears * 12), 12n);
    let interval = null;
    if (request.agePrecision === "completed-years") {
      const low = request.ageInterval?.minimumAgeYearsInclusive, high = request.ageInterval?.maximumAgeYearsExclusive;
      if (nonnegative(low) && Number.isInteger(low) && high === low + 1 && exact && compare(exact, fraction(BigInt(low))) === 0)
        interval = { minimumAgeYearsInclusive: low, maximumAgeYearsExclusive: high };
      else exact = null;
    }
    const valid = exact && compare(exact, fraction(120n)) <= 0;
    return { exact: valid ? exact : null, value: valid ? numberOf(exact) : null, raw: absent(explicit) ? null : String(explicit), interval: valid ? interval : null };
  }
  function decimalText(value, places = 1100) {
    let remainder = value.n % value.d, digits = "";
    for (let index = 0; remainder && index < places; index += 1) { remainder *= 10n; digits += String(remainder / value.d); remainder %= value.d; }
    return { text: String(value.n / value.d) + (digits ? "." + digits : ""), complete: remainder === 0n };
  }
  function compactFraction(value) {
    const full = decimalText(value, 6), numeric = numberOf(value);
    if (full.complete && full.text.length <= 8) return { text: full.text, approximate: false };
    let text;
    if (numeric < 0.001 || numeric >= 100000) {
      const power = exponent => exponent >= 0 ? fraction(10n ** BigInt(exponent)) : fraction(1n, 10n ** BigInt(-exponent));
      let exponent = value.n.toString().length - value.d.toString().length;
      if (compare(value, power(exponent)) < 0) exponent -= 1;
      const scaled = divide(value, power(exponent));
      let coefficient = roundedQuotient(scaled.n * 1000n, scaled.d);
      if (coefficient >= 10000n) { coefficient /= 10n; exponent += 1; }
      const digits = String(coefficient).padStart(4, "0"), decimal = digits.slice(1).replace(/0+$/, "");
      text = digits[0] + (decimal ? "." + decimal : "") + "e" + (exponent >= 0 ? "+" : "") + exponent;
    } else {
      const coefficient = roundedQuotient(value.n * 10000n, value.d), decimal = String(coefficient % 10000n).padStart(4, "0").replace(/0+$/, "");
      text = String(coefficient / 10000n) + (decimal ? "." + decimal : "");
    }
    return { text, approximate: compare(decimalFraction(text), value) !== 0 };
  }
  function classify(value, comparator, band) {
    if (!band) return null;
    const low = compare(value, decimalFraction(String(band.lower)));
    const high = compare(value, decimalFraction(String(band.upper)));
    if (!comparator) return low < 0 ? "below" : high > 0 ? "above" : "within";
    // A bound is a whole possible nonnegative interval. Equality at a closed
    // reference endpoint cannot be called abnormal when that endpoint remains
    // part of the possible result. A <bound is wholly within only if low=0.
    if (comparator === "<") return low <= 0 ? "below" : band.lower === 0 && high <= 0 ? "within" : null;
    if (comparator === "≤") return low < 0 ? "below" : band.lower === 0 && high <= 0 ? "within" : null;
    if (comparator === ">") return high >= 0 ? "above" : null;
    return high > 0 ? "above" : null;
  }
  function convertedRange(range, unit, constants) {
    const factor = unitFactor(unit, constants);
    const lowExact = divide(decimalFraction(String(range.lower)), factor), highExact = divide(decimalFraction(String(range.upper)), factor);
    const low = compactFraction(lowExact), high = compactFraction(highExact);
    const lowText = (low.approximate ? "≈" : "") + low.text.replace(".", ","), highText = (high.approximate ? "≈" : "") + high.text.replace(".", ",");
    const text = lowText + "–" + highText;
    return { nativeLow: range.lower, nativeHigh: range.upper, lower: numberOf(lowExact), upper: numberOf(highExact),
      lowerInclusive: true, upperInclusive: true, exactLower: wire(lowExact), exactUpper: wire(highExact), range: text, limit: text, unit,
      display: { lower: lowText, upper: highText, range: text, unit, approximate: low.approximate || high.approximate } };
  }
  function referenceRows(profile, unit, constants, selectedId) {
    return profile.bands.map(row => {
      const shared = { ...copy(row), selected: row.id === selectedId, unit };
      return row.bySex ? { ...shared, bySex: Object.fromEntries(["M", "F"].map(sex => [sex, convertedRange(row.bySex[sex], unit, constants)])) }
        : { ...shared, ...convertedRange(row, unit, constants) };
    });
  }
  function referenceFor(profile, band, unit, constants) {
    const converted = !["mg/mg", "mg/g", "g/g"].includes(unit);
    const range = convertedRange(band, unit, constants);
    return {
      label: "Norma dla wieku" + (profile.formulaId === "Ca_Cr" ? " · ARUP" : ""), nativeUnit: "mg/mg", ...range, converted,
      band: copy(band), table: referenceRows(profile, unit, constants, band.id),
      source: copy(profile.source), population: { ...copy(profile.population), ageBand: band.label },
      profileId: profile.id, profileVersion: profile.version ?? null,
    };
  }
  function preservedFacts(value) {
    if (Array.isArray(value)) return value.filter(item => typeof item === "string" || typeof item === "boolean").map(copy);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, item]) => typeof item === "string" || typeof item === "boolean" || item === null));
    return [];
  }
  function booleanFact(value) {
    return value === true || value === "true" || value === "yes" ? true : value === false || value === "false" || value === "no" ? false : undefined;
  }
  function sameSpecimenFact(value) {
    return value === "different" || booleanFact(value) === false ? "different" : value === "confirmed" || booleanFact(value) === true ? "confirmed" : "assumed";
  }
  function evaluate(input, profile) {
    const request = input && typeof input === "object" ? input : {};
    const mode = request.mode == null ? "concentration" : request.mode;
    const age = ageFromInput(request);
    const original = value => typeof value === "string" || nonnegative(value) ? value : null;
    const factors = Array.isArray(request.confounders) ? [...new Set(request.confounders.filter(key => typeof key === "string" && key.trim()))] : [];
    const profileValid = validProfile(profile);
    const constants = profileValid ? profile.conversionConstants : APPLICATION_CONVERSION;
    const concentrationSpecimen = sameSpecimenFact(request.concentrationSameSpecimen ?? request.sameSpecimen);
    const base = {
      valid: false, reasonCode: "", message: "", mode, rawValue: null, unit: "", comparator: "", exact: false, exactValue: null, exactMass: null, zero: false,
      classificationValue: null, classificationUnit: "mg/mg", category: null, categoryDescription: "", comparison: null,
      status: "unassessed", tone: "neutral", statusText: "Ca/Cr — wynik liczbowy", referenceAvailable: false, reference: null,
      qualification: { reasonCode: "", note: "", requiresConfirmation: false }, display: null, boundary: "", referenceTable: [],
      sourceFormula: profileValid && profile.formulaId || (request.sampleType === "timed" ? "Ca_Cr" : "CaCr_spot"),
      conversionConstants: copy(constants),
      context: { ageYears: age.value, ageYearsRaw: age.raw, ageExact: age.exact && !age.interval ? wire(age.exact) : null,
        ...(age.interval ? { agePrecision: "completed-years", ageInterval: copy(age.interval) } : {}), sex: normalizedSex(request.sex),
        sameSpecimen: mode === "direct" ? "not-applicable" : concentrationSpecimen, concentrationSameSpecimen: concentrationSpecimen,
        sampleType: typeof request.sampleType === "string" ? request.sampleType : "", confounders: factors, knownFacts: preservedFacts(request.knownFacts),
        population: typeof (request.population?.currentPreterm ?? request.currentPreterm) === "boolean" ? { currentPreterm: request.population?.currentPreterm ?? request.currentPreterm } : {},
        ...(request.sampleAssumption === "assumed-random" ? { sampleAssumption: "assumed-random" } : {}),
        ...(Object.prototype.hasOwnProperty.call(request, "collectionHours") ? { collectionHours: original(request.collectionHours) } : {}),
        ...(typeof request.durationKnown === "boolean" ? { durationKnown: request.durationKnown } : {}),
        ...(typeof request.collectionProblem === "boolean" ? { collectionProblem: request.collectionProblem } : {}) },
      input: mode === "direct" ? { reportedValue: original(request.reportedValue), reportedUnit: typeof request.reportedUnit === "string" ? request.reportedUnit : "" }
        : { calciumValue: original(request.calciumValue), calciumUnit: typeof request.calciumUnit === "string" ? request.calciumUnit : "", creatinineValue: original(request.creatinineValue), creatinineUnit: typeof request.creatinineUnit === "string" ? request.creatinineUnit : "" },
      profileId: null, profileVersion: null, source: null, population: null, restrictions: null, notes: null,
    };
    function finish(reasonCode = "") {
      const result = { ...base, reasonCode };
      if (!result.valid) { result.message = INPUT_MESSAGES[reasonCode] || "Sprawdź dane potrzebne do obliczenia Ca/Cr."; result.statusText = result.message; }
      return freeze({ ...result, snapshot: result.valid ? { schema: "clcr-cacr", version: 2, ...copy(result) } : null });
    }
    if (!["concentration", "direct"].includes(mode)) return finish("invalid-mode");
    let value, reported, unit, comparator = "";
    if (mode === "direct") {
      reported = parsedValue(request.reportedValue);
      if (!reported) return finish(absent(request.reportedValue) ? "missing-reported-value" : "invalid-reported-value");
      if (!UNITS.includes(request.reportedUnit)) return finish("invalid-reported-unit");
      value = reported.fraction; unit = ({ "g/g": "mg/mg", "mol/mol": "mmol/mmol" })[request.reportedUnit] || request.reportedUnit; comparator = reported.comparator;
    } else {
      if (base.context.sameSpecimen === "different") return finish("different-specimens");
      const calcium = parsedValue(request.calciumValue), creatinine = parsedValue(request.creatinineValue);
      if (!calcium || calcium.comparator) return finish(absent(request.calciumValue) ? "missing-calcium" : "invalid-calcium");
      if (!creatinine || creatinine.comparator || creatinine.value <= 0) return finish(absent(request.creatinineValue) ? "missing-creatinine" : "invalid-creatinine");
      const calciumScale = concentrationFactor(request.calciumUnit, "calcium", constants), creatinineScale = concentrationFactor(request.creatinineUnit, "creatinine", constants);
      if (!calciumScale) return finish("invalid-calcium-unit");
      if (!creatinineScale) return finish("invalid-creatinine-unit");
      value = divide(multiply(calcium.fraction, calciumScale.n, calciumScale.d), multiply(creatinine.fraction, creatinineScale.n, creatinineScale.d));
      unit = "mg/mg";
    }
    const mass = multiply(value, unitFactor(unit, constants).n, unitFactor(unit, constants).d);
    const rawValue = mode === "direct" ? reported.value : numberOf(value), classificationValue = numberOf(mass);
    if (!nonnegative(rawValue) || !nonnegative(classificationValue) || value.n !== 0n && (rawValue === 0 || classificationValue === 0)) return finish("invalid-conversion");
    const compact = mode === "direct" && reported.text.length <= 8 ? { text: reported.text, approximate: false } : compactFraction(value);
    const displayed = compact.text, full = decimalText(value);
    Object.assign(base, { valid: true, rawValue, unit, comparator, exact: comparator === "", classificationValue,
      exactValue: wire(value), exactMass: wire(mass), zero: mass.n === 0n && (!comparator || comparator === "≤"),
      display: { value: displayed, text: comparator + (compact.approximate ? "≈" : "") + displayed, unit, comparator, boundary: "", rounded: compact.approximate, approximate: compact.approximate,
        fullValueText: full.text, fullValueComplete: full.complete } });
    if (base.zero) base.statusText = "Wartość zerowa — sprawdź raport";
    if (!profileValid) {
      const reason = profile ? "invalid-profile" : "missing-profile";
      base.qualification = { reasonCode: reason, note: "Nie dobrano źródła normy Ca/Cr.", requiresConfirmation: false };
      return finish(reason);
    }
    Object.assign(base, { profileId: profile.id, profileVersion: profile.version ?? null, source: copy(profile.source), population: copy(profile.population), restrictions: copy(profile.restrictions || {}), notes: copy(profile.notes), referenceTable: referenceRows(profile, unit, constants, null) });
    function unassessed(reason, note) {
      base.qualification = { reasonCode: reason, note, requiresConfirmation: false };
      if (base.zero) base.statusText = "Wartość zerowa — sprawdź raport";
      return finish(reason);
    }
    const sample = base.context.sampleType, applicable = profile.restrictions?.applicableSampleTypes;
    if (applicable && !applicable.includes(sample)) {
      if (sample === "" && profile.restrictions.missingSamplePolicy === "assumed-random") base.context.sampleAssumption = "assumed-random";
      else return unassessed("unsupported-specimen", "Rodzaj próbki nie kwalifikuje do wybranego profilu. Zachowujemy wynik liczbowy bez normy innego materiału.");
    }
    if (sample === "timed" && profile.restrictions?.knownCollectionProblemWithholdsComparison && request.collectionProblem === true)
      return unassessed("collection-problem", profile.notes.collectionProblem);
    if (sample === "timed" && !absent(request.collectionHours)) {
      const hours = parsedValue(request.collectionHours);
      if (!hours || hours.comparator || hours.fraction.n === 0n) return unassessed("invalid-duration", profile.notes.invalidDuration || "Nieprawidłowy zapis czasu zbiórki ogranicza ocenę.");
      base.contextNote = "Zapisany czas zbiórki: " + hours.text.replace(".", ",") + " h. Samego Ca/Cr nie przeskalowujemy do 24 h. Porównanie z ogólnym profilem ARUP nie potwierdza kompletności dobowej zbiórki.";
    } else if (sample === "timed" && request.durationKnown === false) base.contextNote = "Historyczny czas zbiórki jest nieznany. Nie przypisujemy mu 24 h; porównanie z ogólnym profilem ARUP nie potwierdza kompletności zbiórki.";
    // Only an explicit current-population fact qualifies this exception. A
    // neonatal term-status control or a remote history must never infer it.
    if (base.context.population.currentPreterm === true) {
      return unassessed("unsupported-population", profile.notes.currentPreterm || "Nie opracowano zakresu dla bieżącego kontekstu wcześniaczego.");
    }
    const matches = age.exact === null ? [] : profile.bands.filter(band => inBand(age.exact, band) && (!age.interval || band.maximumAgeMonths === null ||
      compare(fraction(BigInt(age.interval.maximumAgeYearsExclusive)), multiply(decimalFraction(String(band.maximumAgeMonths)), 1n, 12n)) <= 0));
    if (matches.length !== 1) {
      const minimumAge = Math.min(...profile.bands.map(band => band.minimumAgeMonthsInclusive / 12));
      const maximumAge = profile.bands.some(band => band.maximumAgeMonths === null) ? Infinity : Math.max(...profile.bands.map(band => band.maximumAgeMonths / 12));
      const under = age.exact && compare(age.exact, multiply(decimalFraction(String(Math.min(...profile.bands.map(band => band.minimumAgeMonthsInclusive)))), 1n, 12n)) < 0;
      const over = age.exact && Number.isFinite(maximumAge) && compare(age.exact, decimalFraction(String(maximumAge))) > 0;
      const reason = age.exact === null ? age.raw === null ? "missing-age" : "invalid-age" : under ? "under-age" : over ? "over-age" : matches.length ? "ambiguous-age-band" : "no-age-band";
      const note = age.exact === null ? profile.notes.missingAge : age.value < minimumAge || under ? profile.notes.underAge : over ? profile.notes.overAge : "Nie dobrano jednoznacznego zakresu Ca/Cr dla tego wieku.";
      return unassessed(reason, note);
    }
    const band = rangeForSex(matches[0], base.context.sex);
    if (!band) return unassessed("missing-sex", profile.notes.missingSex || "Brak płci nie pozwala wybrać źródłowego zakresu. Wynik liczbowy pozostaje dostępny.");
    const category = base.zero ? null : classify(mass, comparator, band);
    base.reference = referenceFor(profile, band, unit, constants); base.referenceAvailable = true;
    base.referenceTable = copy(base.reference.table);
    base.population = copy(base.reference.population); base.category = category; base.comparison = category || (base.zero ? null : "ambiguous");
    base.status = category || "unassessed"; base.categoryDescription = category ? profile.categories[category].label : "";
    base.tone = category ? profile.categories[category].tone : "neutral";
    base.statusText = base.zero ? "Wartość zerowa — sprawdź raport" : category ? profile.categories[category].label : "Przedział nie rozstrzyga oceny";
    const reason = base.zero ? "zero-result" : category ? "" : "censored-multiple-categories";
    base.qualification = { reasonCode: reason, note: base.zero ? "Sprawdź granicę oznaczalności laboratorium. Wynik „<…” nie oznacza dokładnego zera." : category ? `${profile.notes.universal} ${profile.notes[category]}` : profile.notes.censored, requiresConfirmation: category === "above" };
    if (category && compact.approximate) {
      const rounded = decimalFraction(displayed);
      const factor = unitFactor(unit, constants), roundedMass = rounded ? multiply(rounded, factor.n, factor.d) : null;
      if (roundedMass && classify(roundedMass, comparator, band) !== category) {
        const threshold = category === "below" || category === "within" && compare(roundedMass, mass) < 0 ? band.lower : band.upper;
        const sign = category === "below" ? "<" : category === "above" ? ">" : compare(roundedMass, mass) < 0 ? "≥" : "≤";
        const shownThreshold = compactFraction(divide(decimalFraction(String(threshold)), factor));
        base.boundary = sign + (shownThreshold.approximate ? "≈" : "") + shownThreshold.text.replace(".", ","); base.display.boundary = base.boundary;
      }
    }
    return finish(reason);
  }

  function patientContextFromDocument(doc, context = {}) {
    const result = copy(context && typeof context === "object" ? context : {});
    if (!["ageYears", "ageYearsRaw", "ageExact"].some(key => Object.prototype.hasOwnProperty.call(result, key))) {
      const clinical = doc?.defaultView?.ClcrClinicalSafety || root?.ClcrClinicalSafety;
      const age = clinical?.readAgeFromDocument?.(doc);
      result.ageYears = age?.valid ? age.exactYears : null;
      result.ageYearsRaw = age?.valid ? String(age.exactYears) : null;
      if (age?.valid) {
        let exact = fraction(BigInt(age.totalMonths), 12n);
        if (age.daysOfLife != null) {
          const days = divide(fraction(BigInt(age.daysOfLife)), decimalFraction("365.2425"));
          exact = fraction(exact.n * days.d + days.n * exact.d, exact.d * days.d);
        }
        result.ageExact = wire(exact);
      }
    }
    if (!Object.prototype.hasOwnProperty.call(result, "sex")) result.sex = doc?.getElementById("sex")?.value || "";
    if (typeof result.currentPreterm === "boolean") result.population = { ...result.population, currentPreterm: result.currentPreterm };
    return result;
  }
  function inputFromDzmValues(values, context = {}) {
    const source = values && typeof values === "object" ? values : {};
    const value = id => Object.prototype.hasOwnProperty.call(source, id) ? source[id] : DZM_DEFAULTS[id];
    const input = {
      mode: value("CACR_DZM_inputMode") === "reported" ? "direct" : value("CACR_DZM_inputMode"),
      calciumValue: value("CACR_DZM_calcium"), calciumUnit: value("CACR_DZM_calciumUnit"),
      creatinineValue: value("CACR_DZM_creatinine"), creatinineUnit: value("CACR_DZM_creatinineUnit"),
      reportedValue: value("CACR_DZM_reportedValue"), reportedUnit: value("CACR_DZM_reportedUnit"),
      sampleType: "timed", sameSpecimen: sameSpecimenFact(value("CACR_DZM_sameSpecimen")),
    };
    for (const key of ["ageYears", "ageYearsRaw", "ageExact", "agePrecision", "ageInterval", "sex", "population", "knownFacts", "confounders"]) {
      if (Object.prototype.hasOwnProperty.call(context, key)) input[key] = copy(context[key]);
    }
    if (typeof context.currentPreterm === "boolean") input.population = { ...input.population, currentPreterm: context.currentPreterm };
    const currentPreterm = booleanFact(value("CACR_DZM_currentPreterm"));
    if (currentPreterm !== undefined) input.population = { ...input.population, currentPreterm };
    else if (value("CACR_DZM_currentPreterm") === "unknown" && input.population) delete input.population.currentPreterm;
    if (Object.prototype.hasOwnProperty.call(source, "CACR_DZM_collectionHours")) input.collectionHours = value("CACR_DZM_collectionHours");
    for (const key of ["collectionProblem", "durationKnown"]) {
      const fact = booleanFact(value("CACR_DZM_" + key));
      if (fact !== undefined) input[key] = fact;
    }
    return input;
  }
  function readDzmInputFromDocument(documentRef, context = {}) {
    const doc = documentRef || (typeof document !== "undefined" ? document : null), values = {};
    for (const id of [...DZM_FIELD_IDS, ...DZM_CONTEXT_FIELD_IDS]) {
      const control = doc?.getElementById(id);
      if (control) values[id] = control.type === "checkbox" ? control.checked : control.value;
    }
    const patient = patientContextFromDocument(doc, context);
    const explicitAgeContext = ["ageYears", "ageYearsRaw", "ageExact", "agePrecision", "ageInterval"].some(key => Object.prototype.hasOwnProperty.call(context, key));
    const yearsRaw = doc?.getElementById("age")?.value, monthsRaw = doc?.getElementById("ageMonths")?.value, daysRaw = doc?.getElementById("ageDays")?.value;
    const years = parsedValue(yearsRaw);
    // Unlike Mayo's first-month cutoff, the complete ARUP infant interval has
    // the same limits throughout [0,1). Completed zero years suffice; no birth
    // date or zero-month precision is invented. Explicit invalid months/days
    // never enter this fallback, and ClinicalSafety/other calculators stay as-is.
    if (!explicitAgeContext && patient.ageYears === null && years && !years.comparator && years.fraction.n === 0n && absent(monthsRaw) && absent(daysRaw)) {
      Object.assign(patient, { ageYears: 0, ageYearsRaw: String(yearsRaw), ageExact: null, agePrecision: "completed-years",
        ageInterval: { minimumAgeYearsInclusive: 0, maximumAgeYearsExclusive: 1 } });
    }
    return inputFromDzmValues(values, patient);
  }
  function readInputFromDocument(documentRef, options = {}) {
    const doc = documentRef || (typeof document !== "undefined" ? document : null);
    const control = id => doc?.getElementById(id);
    const value = (id, fallback = "") => control(id) ? control(id).value : fallback;
    const patient = patientContextFromDocument(doc);
    const specimen = value("CaCr_same_specimen"), legacy = value("ui_spotSameSpecimen_answer");
    const factorFields = [["spotMenstruation", "menstruation"], ["spotHematuria", "hematuria"], ["spotInfection", "infection"], ["spotExercise", "exercise"], ["spotAcuteIllness", "acuteIllness"]];
    const knownFields = [...factorFields, ["spotDiureticUse", "diureticUse"], ["spotKnownCKD", "knownCKD"]];
    const fact = id => {
      const answer = value(`ui_${id}_answer`);
      if (answer === "yes") return true;
      if (answer === "no") return false;
      if (answer === "unknown") return null;
      return control(id)?.checked ? true : undefined;
    };
    return {
      mode: options.concentrationOnly ? "concentration" : value("CaCr_entry_mode", "concentration"),
      calciumValue: value("Ca_spot"), calciumUnit: value("Ca_spot_unit", "mg/dl"),
      creatinineValue: value("Ucr_spot"), creatinineUnit: value("Ucr_spot_unit", "mg/dl"),
      reportedValue: value("CaCr_reported"), reportedUnit: value("CaCr_reported_unit", "mg/mg"),
      ...patient,
      sameSpecimen: specimen === "different" ? "different" : specimen === "confirmed" ? "confirmed" : legacy === "no" ? "different" : legacy === "unknown" ? "assumed" : legacy === "yes" || control("spotSameSpecimen")?.checked ? "confirmed" : "assumed",
      sampleType: value("spotSampleKind") || "random",
      ...(value("spotSampleKind") ? {} : { sampleAssumption: "assumed-random" }),
      confounders: factorFields.filter(([id]) => fact(id) === true).map(([, key]) => key),
      knownFacts: Object.fromEntries(knownFields.filter(([id]) => fact(id) !== undefined).map(([id, key]) => [key, fact(id)])),
    };
  }
  return Object.freeze({ evaluate, parseReportedValue, readInputFromDocument, DZM_DEFAULTS, DZM_FIELD_IDS, DZM_CONTEXT_FIELD_IDS, inputFromDzmValues, readDzmInputFromDocument });
});
