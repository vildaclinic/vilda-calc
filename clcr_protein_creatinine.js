(function (root, factory) {
  const api = factory();
  if (root) root.VildaClcrProteinCreatinine = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const DEFAULTS = Object.freeze({
    BCR_inputMode: "concentration", BCR_protein: "", BCR_proteinUnit: "mg/L", BCR_creatinine: "", BCR_creatinineUnit: "mg/dL",
    BCR_reportedValue: "", BCR_reportedUnit: "mg/mg",
    BCR_sameSpecimen: "assumed", BCR_collectionProblem: "", BCR_collectionHours: "", BCR_durationKnown: "",
  });
  const FIELD_IDS = Object.freeze(Object.keys(DEFAULTS).slice(0, 7));
  const CONTEXT_FIELD_IDS = Object.freeze(Object.keys(DEFAULTS).slice(7));
  const LEGACY_FIELD_IDS = Object.freeze(["U_Prot", "V24", "Ucr"]);
  const APPLICATION_CONVERSION = Object.freeze({ creatinineMgPerMmol: "113.12" });
  const INPUT_MESSAGES = Object.freeze({
    "invalid-mode": "Wybierz sposób wprowadzenia B/Cr.",
    "missing-protein": "Wpisz stężenie białka w moczu.",
    "invalid-protein": "Stężenie białka w moczu musi być skończoną liczbą nieujemną.",
    "missing-creatinine": "Wpisz stężenie kreatyniny w moczu.",
    "invalid-creatinine": "Stężenie kreatyniny w moczu musi być skończoną liczbą większą od zera.",
    "invalid-protein-unit": "Wybierz jednostkę białka: mg/L, mg/dL lub g/L.",
    "invalid-creatinine-unit": "Wybierz jednostkę kreatyniny: mg/L, mg/dL, mmol/L lub µmol/L.",
    "different-specimens": "Nie można obliczyć B/Cr z oznaczeń z różnych próbek. Użyj białka i kreatyniny z tej samej zbiórki albo gotowego wyniku B/Cr.",
    "missing-reported-value": "Wpisz wynik B/Cr z laboratorium.",
    "invalid-reported-value": "Wpisz skończony, nieujemny wynik B/Cr. Zachowaj znak <, ≤, > lub ≥ z wydruku.",
    "invalid-reported-unit": "Wybierz jednostkę wyniku B/Cr: mg/mg, mg/g lub mg/mmol.",
    "missing-legacy-protein": "Wpisz ilość białka w całej dawnej zbiórce (mg).",
    "invalid-legacy-protein": "Ilość białka w całej zbiórce musi być skończoną liczbą nieujemną.",
    "missing-legacy-volume": "Wpisz objętość całej dawnej zbiórki (mL).",
    "invalid-legacy-volume": "Objętość całej zbiórki musi być skończoną liczbą większą od zera.",
    "invalid-conversion": "Nie można przedstawić wyniku B/Cr z podanych wartości. Sprawdź stężenia i jednostki.",
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
  function reportedUnit(unit) { return ({ "g/g": "mg/mg" })[unit] || unit; }
  function concentrationFactor(unit, mass) {
    switch (concentrationUnit(unit)) {
      case "mg/L": return fraction(1n);
      case "mg/dL": return fraction(10n);
      case "mmol/L": return decimalFraction(mass);
      case "µmol/L": return multiply(decimalFraction(mass), fraction(1n, 1000n));
      default: return null;
    }
  }
  function proteinConcentrationFactor(unit) {
    switch (concentrationUnit(unit)) {
      case "mg/L": return fraction(1n);
      case "mg/dL": return fraction(10n);
      case "g/L": return fraction(1000n);
      default: return null;
    }
  }
  function massFactor(unit, constants) {
    if (unit === "mg/mg") return fraction(1n);
    if (unit === "mg/g") return fraction(1n, 1000n);
    if (unit === "mg/mmol") return divide(fraction(1n), decimalFraction(constants.creatinineMgPerMmol));
    return null;
  }
  function validProfile(profile) {
    if (!profile || typeof profile.id !== "string" || !profile.id || !Number.isInteger(profile.version) || profile.version < 1 ||
      profile.formulaId !== "B_Cr" || profile.quantity !== "urine-protein-creatinine-ratio" || profile.nativeUnit !== "mg/mg" ||
      profile.referenceKind !== "age-selected-comparison" || !Array.isArray(profile.bands) || !profile.bands.length ||
      !profile.source || typeof profile.source.label !== "string" || !Array.isArray(profile.sources) || !profile.sources.length ||
      profile.conversionConstants?.creatinineMgPerMmol !== APPLICATION_CONVERSION.creatinineMgPerMmol ||
      !profile.notes || !profile.restrictions || !Array.isArray(profile.referenceTable) || !Array.isArray(profile.adultCategories)) return false;
    const ids = new Set();
    for (const band of profile.bands) {
      if (!band || typeof band.id !== "string" || !band.id || ids.has(band.id) || !["male", "female", "any"].includes(band.sex) ||
        !Number.isFinite(band.ageMinYears) || band.ageMinYears < 0 || band.ageMaxYears !== null && (!Number.isFinite(band.ageMaxYears) || band.ageMaxYears <= band.ageMinYears) ||
        !Number.isFinite(band.high) || band.high <= 0 || band.low !== null || band.lowerInclusive !== null || typeof band.upperInclusive !== "boolean" ||
        !["laboratory-interval", "clinical-comparison"].includes(band.kind) || typeof band.normalStatusText !== "string" ||
        typeof band.label !== "string" || typeof band.group !== "string" || !profile.sources.some(source => source.id === band.sourceId && typeof source.label === "string" && /^https:\/\//.test(source.url))) return false;
      if (band.kind === "laboratory-interval" && (!Number.isFinite(band.sourceLow) || band.sourceLow < 0 || band.sourceLow >= band.high || band.sourceHigh !== band.high)) return false;
      ids.add(band.id);
    }
    // Source policies cannot overlap for one patient or choose the favorable row.
    for (let i = 0; i < profile.bands.length; i += 1) for (let j = i + 1; j < profile.bands.length; j += 1) {
      const a = profile.bands[i], b = profile.bands[j];
      if ((a.sex === b.sex || a.sex === "any" || b.sex === "any") && Math.max(a.ageMinYears, b.ageMinYears) < Math.min(a.ageMaxYears ?? Infinity, b.ageMaxYears ?? Infinity)) return false;
    }
    if (!profile.adultCategories.length) return false;
    for (const row of profile.adultCategories) {
      if (!row || typeof row.id !== "string" || typeof row.label !== "string" || typeof row.display !== "string" ||
        !Number.isFinite(row.min) || row.min < 0 || row.max !== null && (!Number.isFinite(row.max) || row.max <= row.min) ||
        typeof row.lowerInclusive !== "boolean" || (row.max === null ? row.upperInclusive !== null : typeof row.upperInclusive !== "boolean")) return false;
    }
    for (let i = 0; i < profile.adultCategories.length; i += 1) {
      const current = profile.adultCategories[i], previous = profile.adultCategories[i - 1];
      if (!previous && (current.min !== 0 || !current.lowerInclusive) || previous && (previous.max !== current.min || previous.upperInclusive === current.lowerInclusive)) return false;
      if (i === profile.adultCategories.length - 1 && current.max !== null) return false;
    }
    const adultBands = profile.bands.filter(row => row.kind === "clinical-comparison");
    if (adultBands.some(row => row.high !== profile.adultCategories[0].max || row.upperInclusive !== profile.adultCategories[0].upperInclusive)) return false;
    return true;
  }
  function normalizedSex(value) {
    return ["M", "m", "male", "mężczyzna", "chłopiec"].includes(value) ? "male" : ["F", "f", "K", "k", "female", "kobieta", "dziewczynka"].includes(value) ? "female" : null;
  }
  function referenceContext(request) {
    const age = absent(request.ageYears) ? null : parsedValue(request.ageYears);
    return { ageYears: age && age.value >= 0 ? age.value : null,
      agePrecision: request.agePrecision === "completed-years" ? "completed-years" : request.agePrecision === "uncertain" ? "uncertain" : "exact", sex: normalizedSex(request.sex) };
  }
  function selectedReference(profile, context) {
    if (context.ageYears === null || context.agePrecision === "uncertain") return null;
    const band = profile.bands.find(row => (row.sex === "any" || row.sex === context.sex) && context.ageYears >= row.ageMinYears && (row.ageMaxYears === null || context.ageYears < row.ageMaxYears));
    if (!band) return null;
    if (context.agePrecision === "completed-years" && band.ageMaxYears !== null && context.ageYears + 1 > band.ageMaxYears) return null;
    const source = profile.sources.find(item => item.id === band.sourceId), local = value => String(value).replace(".", ",");
    return { ...copy(band), unit: "mg/mg", display: (band.upperInclusive ? "≤" : "<") + local(band.high),
      fullDisplay: band.sourceLow == null ? null : local(band.sourceLow) + "–" + local(band.sourceHigh),
      sourceLabel: source.shortLabel || source.label, sourceUrl: source.url, population: source.population,
      categories: band.kind === "clinical-comparison" ? copy(profile.adultCategories) : [] };
  }
  function missingReference(context) {
    if (context.ageYears === null) return ["missing-age", "Brak wieku pacjenta — wynik bez porównania z normą."];
    if (context.agePrecision === "uncertain") return ["uncertain-age", "Nieprecyzyjny wiek nie pozwala wybrać jednej normy."];
    if (context.ageYears < 7) return ["age-outside-reference", "Brak przyjętej normy dla DZM w tym wieku."];
    if (context.ageYears < 18 && !context.sex) return ["missing-sex", "Brak płci w danych pacjenta — wynik bez dobranej normy dla wieku i płci."];
    return ["no-applicable-reference", "Brak jednego zweryfikowanego zakresu dla wieku i płci pacjenta."];
  }
  function selectedCategory(categories, exact) {
    return categories.find(row => {
      const low = compare(exact, decimalFraction(String(row.min)));
      const high = row.max === null ? null : compare(exact, decimalFraction(String(row.max)));
      return (low > 0 || low === 0 && row.lowerInclusive) && (high === null || high < 0 || high === 0 && row.upperInclusive);
    }) || null;
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
  function compactFraction(value) {
    if (value.n === 0n) return { text: "0", approximate: false };
    let text;
    if (compare(value, fraction(1n, 1000n)) >= 0 && compare(value, fraction(10000n)) < 0) {
      const rounded = roundedQuotient(value.n * 1000n, value.d);
      text = decimalText(fraction(rounded, 1000n), 3).text;
    } else {
      const power = exponent => exponent >= 0 ? fraction(10n ** BigInt(exponent)) : fraction(1n, 10n ** BigInt(-exponent));
      let exponent = value.n.toString().length - value.d.toString().length;
      if (compare(value, power(exponent)) < 0) exponent -= 1;
      const scaled = divide(value, power(exponent));
      let coefficient = roundedQuotient(scaled.n * 100n, scaled.d);
      if (coefficient >= 1000n) { coefficient /= 10n; exponent += 1; }
      const digits = String(coefficient).padStart(3, "0"), tail = digits.slice(1).replace(/0+$/, "");
      text = digits[0] + (tail ? "." + tail : "") + "e" + (exponent >= 0 ? "+" : "") + exponent;
    }
    const rounded = decimalFraction(text);
    if (!representable(rounded, numberOf(rounded))) text = String(numberOf(value));
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
    if (Array.isArray(value)) return Object.fromEntries(value.flatMap((item, index) => typeof item === "string" || typeof item === "boolean" || item === null ? [["reportedFact" + (index + 1), item]] : []));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, item]) => typeof item === "string" || typeof item === "boolean" || item === null));
    return {};
  }
  function evaluate(input, profile) {
    const request = input && typeof input === "object" ? input : {};
    const mode = request.mode == null ? "concentration" : request.mode;
    const profileValid = validProfile(profile), constants = APPLICATION_CONVERSION;
    const concentrationSameSpecimen = sameSpecimenFact(request.knownFacts?.sameSpecimen) === "different" ? "different" : sameSpecimenFact(request.concentrationSameSpecimen ?? request.sameSpecimen);
    const context = {
      sameSpecimen: mode === "direct" ? "not-applicable" : concentrationSameSpecimen, concentrationSameSpecimen,
      sampleType: "timed", knownFacts: knownFacts(request.knownFacts), ...referenceContext(request),
    };
    if (own(request, "collectionHours")) context.collectionHours = original(request.collectionHours);
    for (const key of ["collectionProblem", "durationKnown"]) {
      const fact = booleanFact(request[key]);
      if (fact !== undefined) context[key] = fact;
    }
    const base = {
      valid: false, reasonCode: "", message: "", mode, sourceFormula: "B_Cr", rawValue: null, pointValue: null, unit: "", comparator: "", operator: "",
      exact: false, exactValue: null, exactMass: null, zero: false, display: null,
      alternateValue: null, alternateUnit: "", alternateAvailable: false, exactAlternate: null, alternate: null,
      status: "unassessed", assessment: "unassessed", state: "unassessed", category: null, tone: "neutral", statusText: "B/Cr — bez oceny normy",
      reference: null, referenceAvailable: false, outOfRange: null, referenceTable: [], adultCategories: [],
      conversionConstants: copy(constants), context,
      input: mode === "direct" ? { reportedValue: original(request.reportedValue), reportedUnit: typeof request.reportedUnit === "string" ? request.reportedUnit : "" }
        : mode === "legacy" ? { legacyProteinMassMg: original(request.legacyProteinMassMg), legacyVolumeMl: original(request.legacyVolumeMl), legacyCreatinineMgDl: original(request.legacyCreatinineMgDl) }
        : { proteinValue: original(request.proteinValue), proteinUnit: typeof request.proteinUnit === "string" ? request.proteinUnit : "", creatinineValue: original(request.creatinineValue), creatinineUnit: typeof request.creatinineUnit === "string" ? request.creatinineUnit : "" },
      profileId: profileValid ? profile.id : null, profileVersion: profileValid ? profile.version : null,
      policy: profileValid ? copy(profile) : null,
      source: profileValid ? copy(profile.source) : null, sources: profileValid ? copy(profile.sources) : [],
      restrictions: profileValid ? copy(profile.restrictions) : null, notes: profileValid ? copy(profile.notes) : null,
    };
    function invalid(reason) { base.reasonCode = reason; base.message = INPUT_MESSAGES[reason]; base.statusText = base.message; return freeze({ ...base, snapshot: null }); }
    if (!["concentration", "direct", "legacy"].includes(mode)) return invalid("invalid-mode");
    let exact, mass, unit = "mg/mg", comparator = "", literal = "";
    if (mode === "direct") {
      if (absent(request.reportedValue)) return invalid("missing-reported-value");
      const parsed = parsedValue(request.reportedValue, true);
      if (!parsed || parsed.exact.n < 0n) return invalid("invalid-reported-value");
      const nativeUnit = reportedUnit(request.reportedUnit);
      const factor = massFactor(nativeUnit, constants);
      if (!factor) return invalid("invalid-reported-unit");
      exact = multiply(parsed.exact, factor); mass = exact; comparator = parsed.comparator; literal = nativeUnit === "mg/mg" ? parsed.text : "";
    } else if (mode === "legacy") {
      // Historical U_Prot is a whole-collection mass, never a concentration.
      // Keep all three original operands for an explicit edit and form the
      // rational directly, avoiding a rounded intermediate concentration.
      if (absent(request.legacyProteinMassMg)) return invalid("missing-legacy-protein");
      const protein = parsedValue(request.legacyProteinMassMg);
      if (!protein || protein.exact.n < 0n) return invalid("invalid-legacy-protein");
      if (absent(request.legacyVolumeMl)) return invalid("missing-legacy-volume");
      const volume = parsedValue(request.legacyVolumeMl);
      if (!volume || volume.exact.n <= 0n) return invalid("invalid-legacy-volume");
      if (absent(request.legacyCreatinineMgDl)) return invalid("missing-creatinine");
      const creatinine = parsedValue(request.legacyCreatinineMgDl);
      if (!creatinine || creatinine.exact.n <= 0n) return invalid("invalid-creatinine");
      if (concentrationSameSpecimen === "different") return invalid("different-specimens");
      exact = divide(protein.exact, multiply(multiply(creatinine.exact, volume.exact), fraction(1n, 100n))); mass = exact;
    } else {
      if (absent(request.proteinValue)) return invalid("missing-protein");
      const protein = parsedValue(request.proteinValue);
      if (!protein || protein.exact.n < 0n) return invalid("invalid-protein");
      if (absent(request.creatinineValue)) return invalid("missing-creatinine");
      const creatinine = parsedValue(request.creatinineValue);
      if (!creatinine || creatinine.exact.n <= 0n) return invalid("invalid-creatinine");
      const proteinFactor = proteinConcentrationFactor(request.proteinUnit);
      if (!proteinFactor) return invalid("invalid-protein-unit");
      const creatinineFactor = concentrationFactor(request.creatinineUnit, constants.creatinineMgPerMmol);
      if (!creatinineFactor) return invalid("invalid-creatinine-unit");
      if (concentrationSameSpecimen === "different") return invalid("different-specimens");
      exact = divide(multiply(protein.exact, proteinFactor), multiply(creatinine.exact, creatinineFactor)); mass = exact;
    }
    if (mode === "direct" && typeof request.reportedUnitOriginal === "string" && request.reportedUnitOriginal !== request.reportedUnit && reportedUnit(request.reportedUnitOriginal) === reportedUnit(request.reportedUnit)) base.input.reportedUnitOriginal = request.reportedUnitOriginal;
    const rawValue = numberOf(exact);
    if (!representable(exact, rawValue)) return invalid("invalid-conversion");
    const alternateUnit = "mg/mmol";
    const alternateExact = divide(mass, massFactor(alternateUnit, constants));
    const alternateValue = numberOf(alternateExact), alternateAvailable = representable(alternateExact, alternateValue);
    Object.assign(base, {
      valid: true, rawValue, pointValue: comparator ? null : rawValue, unit, comparator, operator: comparator, exact: !comparator,
      exactValue: wire(exact), exactMass: wire(mass), zero: rawValue === 0,
      display: presentation(exact, unit, comparator, literal),
      alternateValue: alternateAvailable ? alternateValue : null, alternateUnit, alternateAvailable, exactAlternate: wire(alternateExact),
      alternate: { value: alternateAvailable ? alternateValue : null, unit: alternateUnit, available: alternateAvailable, comparator,
        display: alternateAvailable ? presentation(alternateExact, alternateUnit, comparator) : null },
      reasonCode: profileValid ? "" : profile == null ? "missing-profile" : "invalid-profile",
    });
    base.referenceTable = profileValid ? copy(profile.referenceTable) : [];
    base.adultCategories = profileValid ? copy(profile.adultCategories) : [];
    base.reference = profileValid ? selectedReference(profile, context) : null;
    base.referenceAvailable = base.reference !== null;
    if (!profileValid) base.message = "Brak zweryfikowanej konfiguracji norm — wynik bez porównania.";
    else if (!base.reference) [base.reasonCode, base.message] = missingReference(context);
    if (context.collectionProblem === true || booleanFact(context.knownFacts?.collectionProblem) === true) {
      base.reasonCode = "collection-problem";
      base.message = "Odnotowano problem ze zbiórką moczu; wynik wymaga oceny z uwzględnieniem tej informacji.";
    } else if (comparator) {
      base.reasonCode = "censored-result"; base.statusText = "Wynik podany z nierównością";
      base.message = "Zachowano znak z raportu; nie wyznaczamy dokładnego punktu na osi.";
    } else if (base.zero) {
      base.reasonCode = "zero-result"; base.statusText = "B/Cr równy zero";
      base.message = "Sprawdź, czy laboratorium podało zero, czy wynik poniżej granicy oznaczalności.";
    } else if (base.reference) {
      const ref = base.reference, high = compare(exact, decimalFraction(String(ref.high)));
      const status = high > 0 || high === 0 && !ref.upperInclusive ? "high" : "normal";
      base.status = base.assessment = base.state = status; base.outOfRange = status !== "normal"; base.tone = status === "normal" ? "normal" : "warning";
      base.reasonCode = status; base.statusText = status === "high" ? "Podwyższony B/Cr" : ref.normalStatusText;
      base.message = status === "normal" ? "" : "Podwyższenie może towarzyszyć chorobom nerek, ale bywa też przejściowe, np. podczas infekcji lub po wysiłku.";
      if (ref.kind === "clinical-comparison") base.category = copy(selectedCategory(ref.categories, exact));
    }
    return freeze({ ...base, snapshot: { schema: "clcr-protein-creatinine", version: 1, ...copy(base) } });
  }
  function ageFromValues(values, context) {
    if (own(values, "age")) {
      if (absent(values.age)) return { ageYears: null, agePrecision: "exact" };
      const years = parsedValue(values.age), months = absent(values.ageMonths) ? { value: 0 } : parsedValue(values.ageMonths);
      if (!years || !months || !Number.isInteger(years.value) || years.value < 0 || !Number.isInteger(months.value) || months.value < 0 || months.value > 11) return { ageYears: null, agePrecision: "exact" };
      const precision = absent(values.ageMonths) && absent(values.ageDays) ? "completed-years" : "exact";
      if (years.value === 0 && months.value === 0 && !absent(values.ageDays)) {
        const days = parsedValue(values.ageDays);
        return { ageYears: days && Number.isInteger(days.value) && days.value >= 0 && days.value <= 28 ? days.value / 365.2425 : null, agePrecision: "exact" };
      }
      return { ageYears: years.value + months.value / 12, agePrecision: precision };
    }
    return { ageYears: context.ageContext?.valid === false ? null : context.ageYears ?? context.ageContext?.exactYears ?? values.ageYears,
      agePrecision: context.agePrecision ?? values.agePrecision };
  }
  function inputFromValues(values, context = {}) {
    const source = values && typeof values === "object" ? values : {}, facts = context && typeof context === "object" ? context : {};
    const value = id => own(source, id) ? source[id] : DEFAULTS[id];
    const input = {
      mode: value("BCR_inputMode") === "reported" ? "direct" : value("BCR_inputMode"),
      proteinValue: value("BCR_protein"), proteinUnit: value("BCR_proteinUnit"),
      creatinineValue: value("BCR_creatinine"), creatinineUnit: value("BCR_creatinineUnit"),
      reportedValue: value("BCR_reportedValue"), reportedUnit: value("BCR_reportedUnit"),
      legacyProteinMassMg: source.U_Prot, legacyVolumeMl: source.V24, legacyCreatinineMgDl: source.Ucr,
      sameSpecimen: sameSpecimenFact(own(source, "BCR_sameSpecimen") ? source.BCR_sameSpecimen : facts.concentrationSameSpecimen ?? facts.sameSpecimen ?? DEFAULTS.BCR_sameSpecimen),
      sampleType: "timed", ...referenceContext({ ...ageFromValues(source, facts), sex: own(source, "sex") ? source.sex : facts.sex }),
    };
    if (own(source, "BCR_reportedUnitOriginal")) input.reportedUnitOriginal = source.BCR_reportedUnitOriginal;
    else if (own(facts, "reportedUnitOriginal")) input.reportedUnitOriginal = facts.reportedUnitOriginal;
    if (own(facts, "knownFacts")) input.knownFacts = knownFacts(facts.knownFacts);
    if (own(source, "BCR_collectionHours")) input.collectionHours = original(value("BCR_collectionHours"));
    else if (own(facts, "collectionHours")) input.collectionHours = original(facts.collectionHours);
    for (const key of ["collectionProblem", "durationKnown"]) {
      const fact = booleanFact(own(source, "BCR_" + key) ? value("BCR_" + key) : facts[key]);
      if (fact !== undefined) input[key] = fact;
    }
    return input;
  }
  // Readiness reports only whether the numerical operands and their units
  // are valid. A known specimen conflict can block calculation even at 2/2;
  // missing age/sex never creates another required numerical question.
  function readiness(input) {
    const request = input && typeof input === "object" ? input : {}, mode = request.mode ?? "concentration";
    let fields;
    if (mode === "direct") fields = [{ id: "BCR_reportedValue", value: request.reportedValue, allowComparator: true, unitId: "BCR_reportedUnit", unitValid: Boolean(massFactor(reportedUnit(request.reportedUnit), APPLICATION_CONVERSION)) }];
    else if (mode === "legacy") fields = [
      { id: "U_Prot", value: request.legacyProteinMassMg },
      { id: "V24", value: request.legacyVolumeMl, positive: true },
      { id: "Ucr", value: request.legacyCreatinineMgDl, positive: true },
    ];
    else if (mode === "concentration") fields = [
      { id: "BCR_protein", value: request.proteinValue, unitId: "BCR_proteinUnit", unitValid: Boolean(proteinConcentrationFactor(request.proteinUnit)) },
      { id: "BCR_creatinine", value: request.creatinineValue, positive: true, unitId: "BCR_creatinineUnit", unitValid: Boolean(concentrationFactor(request.creatinineUnit, APPLICATION_CONVERSION.creatinineMgPerMmol)) },
    ];
    else return freeze({ count: 0, total: 0, complete: false, requiredFieldIds: [], validFieldIds: [], missingFieldIds: [], invalidFieldIds: ["BCR_inputMode"] });
    const validFieldIds = [], missingFieldIds = [], invalidFieldIds = [];
    for (const field of fields) {
      const missing = absent(field.value), parsed = missing ? null : parsedValue(field.value, field.allowComparator);
      const validValue = parsed && (field.positive ? parsed.exact.n > 0n : parsed.exact.n >= 0n);
      if (missing) missingFieldIds.push(field.id); else if (!validValue) invalidFieldIds.push(field.id);
      if (field.unitId && !field.unitValid) invalidFieldIds.push(field.unitId);
      if (validValue && (!field.unitId || field.unitValid)) validFieldIds.push(field.id);
    }
    return freeze({ count: validFieldIds.length, total: fields.length, complete: validFieldIds.length === fields.length,
      requiredFieldIds: fields.map(field => field.id), validFieldIds, missingFieldIds, invalidFieldIds });
  }
  function readInputFromDocument(documentRef, options = {}) {
    const doc = documentRef || (typeof document !== "undefined" ? document : null), values = {};
    for (const id of [...FIELD_IDS, ...CONTEXT_FIELD_IDS, ...LEGACY_FIELD_IDS, "age", "ageMonths", "ageDays", "sex", "BCR_reportedUnitOriginal"]) {
      const control = doc?.getElementById(id);
      if (control) values[id] = control.type === "checkbox" ? control.checked : control.value;
    }
    return inputFromValues(values, options?.context || options);
  }
  return Object.freeze({ evaluate, readiness, evaluateLegacy: (input, profile) => evaluate({ ...input, mode: "legacy" }, profile), readInputFromDocument, inputFromValues, DEFAULTS, FIELD_IDS, CONTEXT_FIELD_IDS, LEGACY_FIELD_IDS });
});
