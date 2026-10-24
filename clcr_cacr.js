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
    "invalid-calcium-unit": "Wybierz jednostkę wapnia w moczu: mg/dL, mg/L lub mmol/L.",
    "invalid-creatinine-unit": "Wybierz jednostkę kreatyniny w moczu: mg/dL, µmol/L lub mmol/L.",
    "invalid-conversion": "Nie można obliczyć Ca/Cr z podanych wartości. Sprawdź stężenia i jednostki.",
  });
  const UNITS = Object.freeze(["mg/mg", "mg/g", "g/g", "mol/mol", "mmol/mmol", "mmol/mol", "mg/mmol"]);

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
  function numberOf(value) {
    const numerator = Number(value.n);
    const denominator = Number(value.d);
    if (Number.isFinite(numerator) && Number.isFinite(denominator)) return numerator / denominator;
    const n = value.n.toString();
    const d = value.d.toString();
    const nm = Number(n.slice(0, 16)) / 10 ** (Math.min(n.length, 16) - 1);
    const dm = Number(d.slice(0, 16)) / 10 ** (Math.min(d.length, 16) - 1);
    return Number(`${nm / dm}e${n.length - d.length}`);
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
    return profile && typeof profile.id === "string" && profile.id !== "" &&
      profile.quantity === "urine-calcium-creatinine-ratio" && profile.nativeUnit === "mg/mg" &&
      profile.population && typeof profile.population.label === "string" &&
      profile.source && typeof profile.source.label === "string" &&
      profile.conversionConstants && positive(Number(profile.conversionConstants.calciumMgPerMmol)) &&
      positive(Number(profile.conversionConstants.creatinineMgPerMmol)) &&
      decimalFraction(profile.conversionConstants.calciumMgPerMmol) && decimalFraction(profile.conversionConstants.creatinineMgPerMmol) &&
      Array.isArray(profile.bands) && profile.bands.length > 0 && profile.bands.every(band =>
        band && nonnegative(band.minimumAgeMonthsInclusive) && positive(band.maximumAgeMonths) &&
        band.maximumAgeMonths > band.minimumAgeMonthsInclusive && typeof band.maximumAgeInclusive === "boolean" &&
        nonnegative(band.lower) && positive(band.upper) && band.upper > band.lower && typeof band.label === "string") &&
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
    if (analyte === "creatinine" && ["umol", "umol/L", "µmol/L", "μmol/L"].includes(unit)) return multiply(mass, 1n, 1000n);
    return null;
  }
  function inBand(age, band) {
    return age >= band.minimumAgeMonthsInclusive / 12 &&
      (age < band.maximumAgeMonths / 12 || band.maximumAgeInclusive && age === band.maximumAgeMonths / 12);
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
  function displayNumber(value, digits = 12, fixed = false) { return Number(value).toLocaleString("pl-PL", { minimumFractionDigits: fixed ? digits : 0, maximumFractionDigits: digits, useGrouping: false }); }
  function referenceFor(profile, band, unit, constants) {
    const factor = unitFactor(unit, constants);
    const converted = !["mg/mg", "mg/g", "g/g"].includes(unit);
    const lower = numberOf(divide(decimalFraction(String(band.lower)), factor));
    const upper = numberOf(divide(decimalFraction(String(band.upper)), factor));
    const digits = ["mol/mol", "mmol/mmol"].includes(unit) ? 4 : unit === "mg/mmol" ? 3 : 2;
    const fixed = ["mg/mg", "g/g"].includes(unit);
    const lowText = displayNumber(lower, digits, fixed), highText = displayNumber(upper, digits, fixed);
    const range = `${converted ? "≈" : ""}${lowText}–${highText}`;
    return {
      label: "Norma dla wieku", nativeLow: band.lower, nativeHigh: band.upper, nativeUnit: "mg/mg",
      lower, upper, lowerInclusive: true, upperInclusive: true, range, limit: range, unit, converted,
      display: { lower: lowText, upper: highText, range, unit, approximate: converted },
      band: copy(band), table: profile.bands.map(row => ({ ...copy(row), nativeLow: row.lower, nativeHigh: row.upper, lowerInclusive: true, upperInclusive: true, unit: "mg/mg", range: `${displayNumber(row.lower, 2, true)}–${displayNumber(row.upper, 2, true)}`, selected: row.id === band.id })),
      source: copy(profile.source), population: { ...copy(profile.population), ageBand: band.label },
      profileId: profile.id, profileVersion: profile.version ?? null,
    };
  }
  function preservedFacts(value) {
    if (Array.isArray(value)) return value.filter(item => typeof item === "string" || typeof item === "boolean").map(copy);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, item]) => typeof item === "string" || typeof item === "boolean" || item === null));
    return [];
  }
  function evaluate(input, profile) {
    const request = input && typeof input === "object" ? input : {};
    const mode = request.mode == null ? "concentration" : request.mode;
    const age = nonnegative(request.ageYears) ? request.ageYears : null;
    const original = value => typeof value === "string" || nonnegative(value) ? value : null;
    const factors = Array.isArray(request.confounders) ? [...new Set(request.confounders.filter(key => typeof key === "string" && key.trim()))] : [];
    const profileValid = validProfile(profile);
    const constants = profileValid ? profile.conversionConstants : APPLICATION_CONVERSION;
    const base = {
      valid: false, reasonCode: "", message: "", mode, rawValue: null, unit: "", comparator: "", exact: false,
      classificationValue: null, classificationUnit: "mg/mg", category: null, categoryDescription: "", comparison: null,
      status: "unassessed", tone: "neutral", statusText: "Ca/Cr — wynik liczbowy", referenceAvailable: false, reference: null,
      qualification: { reasonCode: "", note: "", requiresConfirmation: false }, display: null, boundary: "",
      context: { ageYears: age, sameSpecimen: mode === "direct" ? "not-applicable" : ["confirmed", "different"].includes(request.sameSpecimen) ? request.sameSpecimen : "assumed",
        sampleType: ["firstMorning", "secondMorning", "random", "timed"].includes(request.sampleType) ? request.sampleType : "", confounders: factors, knownFacts: preservedFacts(request.knownFacts),
        population: typeof request.population?.currentPreterm === "boolean" ? { currentPreterm: request.population.currentPreterm } : {} },
      input: mode === "direct" ? { reportedValue: original(request.reportedValue), reportedUnit: typeof request.reportedUnit === "string" ? request.reportedUnit : "" }
        : { calciumValue: original(request.calciumValue), calciumUnit: typeof request.calciumUnit === "string" ? request.calciumUnit : "", creatinineValue: original(request.creatinineValue), creatinineUnit: typeof request.creatinineUnit === "string" ? request.creatinineUnit : "" },
      profileId: null, profileVersion: null, source: null, population: null, restrictions: null, notes: null,
    };
    function finish(reasonCode = "") {
      const result = { ...base, reasonCode };
      if (!result.valid) { result.message = INPUT_MESSAGES[reasonCode] || "Sprawdź dane potrzebne do obliczenia Ca/Cr."; result.statusText = result.message; }
      return freeze({ ...result, snapshot: result.valid ? { schema: "clcr-cacr", version: 1, ...copy(result) } : null });
    }
    if (!["concentration", "direct"].includes(mode)) return finish("invalid-mode");
    let value, reported, unit, comparator = "";
    if (mode === "direct") {
      reported = parsedValue(request.reportedValue);
      if (!reported) return finish(absent(request.reportedValue) ? "missing-reported-value" : "invalid-reported-value");
      if (!UNITS.includes(request.reportedUnit)) return finish("invalid-reported-unit");
      value = reported.fraction; unit = request.reportedUnit; comparator = reported.comparator;
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
    const displayed = mode === "direct" ? reported.text : rawValue.toFixed(3);
    Object.assign(base, { valid: true, rawValue, unit, comparator, exact: comparator === "", classificationValue,
      display: { value: displayed, text: comparator + displayed, unit, comparator, boundary: "", rounded: mode === "concentration" && Number(displayed) !== rawValue } });
    if (!profileValid) {
      const reason = profile ? "invalid-profile" : "missing-profile";
      base.qualification = { reasonCode: reason, note: "Nie dobrano źródła normy Ca/Cr.", requiresConfirmation: false };
      return finish(reason);
    }
    Object.assign(base, { profileId: profile.id, profileVersion: profile.version ?? null, source: copy(profile.source), population: copy(profile.population), restrictions: copy(profile.restrictions || {}), notes: copy(profile.notes) });
    // Only an explicit current-population fact qualifies this exception. A
    // neonatal term-status control or a remote history must never infer it.
    if (request.population?.currentPreterm === true) {
      base.qualification = { reasonCode: "unsupported-population", note: profile.notes.currentPreterm || "Nie opracowano zakresu dla bieżącego kontekstu wcześniaczego.", requiresConfirmation: false };
      return finish("unsupported-population");
    }
    const matches = age === null ? [] : profile.bands.filter(band => inBand(age, band));
    if (matches.length !== 1) {
      const minimumAge = Math.min(...profile.bands.map(band => band.minimumAgeMonthsInclusive / 12));
      const maximumAge = Math.max(...profile.bands.map(band => band.maximumAgeMonths / 12));
      const reason = age === null ? absent(request.ageYears) ? "missing-age" : "invalid-age" : age < minimumAge ? "under-age" : age > maximumAge ? "over-age" : matches.length ? "ambiguous-age-band" : "no-age-band";
      const note = age === null ? profile.notes.missingAge : age < minimumAge ? profile.notes.underAge : age > maximumAge ? profile.notes.overAge : "Nie dobrano jednoznacznego zakresu Ca/Cr dla tego wieku.";
      base.qualification = { reasonCode: reason, note, requiresConfirmation: false };
      return finish(reason);
    }
    const band = matches[0], category = classify(mass, comparator, band);
    base.reference = referenceFor(profile, band, unit, constants); base.referenceAvailable = true;
    base.population = copy(base.reference.population); base.category = category; base.comparison = category || "ambiguous";
    base.status = category || "unassessed"; base.categoryDescription = category ? profile.categories[category].label : "";
    base.tone = category ? profile.categories[category].tone : "neutral";
    base.statusText = category ? profile.categories[category].label : "Przedział nie rozstrzyga oceny";
    const reason = category ? "" : "censored-multiple-categories";
    base.qualification = { reasonCode: reason, note: category ? `${profile.notes.universal} ${profile.notes[category]}` : profile.notes.censored, requiresConfirmation: category === "above" };
    if (mode === "concentration" && category) {
      const rounded = decimalFraction(displayed);
      if (rounded && classify(rounded, "", band) !== category) {
        const threshold = category === "below" || category === "within" && compare(rounded, mass) < 0 ? band.lower : band.upper;
        const sign = category === "below" ? "<" : category === "above" ? ">" : compare(rounded, mass) < 0 ? "≥" : "≤";
        base.boundary = `${sign}${displayNumber(threshold)}`; base.display.boundary = base.boundary;
      }
    }
    return finish(reason);
  }

  function readInputFromDocument(documentRef, options = {}) {
    const doc = documentRef || (typeof document !== "undefined" ? document : null);
    const control = id => doc?.getElementById(id);
    const value = (id, fallback = "") => control(id) ? control(id).value : fallback;
    const clinical = doc?.defaultView?.ClcrClinicalSafety || root?.ClcrClinicalSafety;
    const age = clinical?.readAgeFromDocument?.(doc);
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
      ageYears: age?.valid ? age.exactYears : null,
      sameSpecimen: specimen === "different" ? "different" : specimen === "confirmed" ? "confirmed" : legacy === "no" ? "different" : legacy === "unknown" ? "assumed" : legacy === "yes" || control("spotSameSpecimen")?.checked ? "confirmed" : "assumed",
      sampleType: value("spotSampleKind"),
      confounders: factorFields.filter(([id]) => fact(id) === true).map(([, key]) => key),
      knownFacts: Object.fromEntries(knownFields.filter(([id]) => fact(id) !== undefined).map(([id, key]) => [key, fact(id)])),
    };
  }
  return Object.freeze({ evaluate, parseReportedValue, readInputFromDocument });
});
