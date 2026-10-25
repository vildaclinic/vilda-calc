(function (root, factory) {
  const api = factory(root);
  if (root) root.VildaClcrCitcr = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";

  const INPUT_MESSAGES = Object.freeze({
    "invalid-mode": "Wybierz sposób wprowadzenia Cit/Cr.",
    "missing-reported-value": "Wpisz wynik Cit/Cr z laboratorium.",
    "invalid-reported-value": "Wpisz nieujemny wynik Cit/Cr. Zachowaj znak <, ≤, > lub ≥ z wydruku.",
    "invalid-reported-unit": "Wybierz jednostkę wyniku Cit/Cr.",
    "different-specimens": "Nie można obliczyć Cit/Cr z oznaczeń z różnych próbek. Użyj cytrynianów i kreatyniny z tej samej próbki moczu albo gotowego wyniku Cit/Cr.",
    "missing-citrate": "Wpisz stężenie cytrynianów w moczu.",
    "invalid-citrate": "Stężenie cytrynianów w moczu musi być liczbą nieujemną.",
    "missing-creatinine": "Wpisz stężenie kreatyniny w moczu.",
    "invalid-creatinine": "Stężenie kreatyniny w moczu musi być liczbą większą od zera.",
    "invalid-citrate-unit": "Wybierz jednostkę cytrynianów w moczu: µmol/L, mmol/L, mg/L lub mg/dL. Dla jednostki masowej zachowaj postać z raportu.",
    "invalid-creatinine-unit": "Wybierz jednostkę kreatyniny w moczu: mg/dL, µmol/L lub mmol/L.",
    "invalid-conversion": "Nie można obliczyć Cit/Cr z podanych wartości. Sprawdź stężenia i jednostki.",
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
  function absent(value) { return value == null || (typeof value === "string" && value.trim() === ""); }
  function nonnegative(value) { return typeof value === "number" && Number.isFinite(value) && value >= 0; }
  function positive(value) { return nonnegative(value) && value > 0; }

  // Decimal fractions preserve the input and declared conversion constants
  // exactly while comparing strict lower thresholds and closed adult endpoints. No epsilon moves
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
  // Physical conversion is available without a normative profile. No normal
  // limit or population policy is built into this engine.
  const CONVERSION_CONSTANTS = Object.freeze({ citrateIonMgPerMmol: "189.099", citricAcidMgPerMmol: "192.1235", creatinineMgPerMmol: "113.12" });
  function constantsValid(value) {
    return value && ["citrateIonMgPerMmol", "citricAcidMgPerMmol", "creatinineMgPerMmol"].every(key => positive(Number(value[key])) && decimalFraction(value[key]));
  }
  function profileValid(profile) {
    if (!(profile && typeof profile.id === "string" && profile.id !== "" && profile.quantity === "urine-citrate-creatinine-ratio" && profile.nativeUnit === "µmol/mmol" &&
      profile.population && typeof profile.population.label === "string" && profile.source && typeof profile.source.label === "string" &&
      ["lower-reference-limit", "two-sided-laboratory-reference-interval"].includes(profile.referenceKind) &&
      Array.isArray(profile.bands) && profile.bands.length > 0)) return false;
    const lowerOnly = profile.referenceKind === "lower-reference-limit";
    return profile.bands.every(band => band && typeof band.id === "string" && typeof band.label === "string" &&
      nonnegative(band.minimumAgeMonths) && typeof band.minimumAgeInclusive === "boolean" &&
      (band.maximumAgeMonths === null || positive(band.maximumAgeMonths) && band.maximumAgeMonths > band.minimumAgeMonths) && typeof band.maximumAgeInclusive === "boolean" &&
      nonnegative(band.lower) && typeof band.lowerInclusive === "boolean" &&
      (band.sex == null || ["M", "F"].includes(band.sex)) &&
      (lowerOnly ? band.upper === null && band.upperInclusive === null : positive(band.upper) && band.upper > band.lower && typeof band.upperInclusive === "boolean")) &&
      profile.categories && (lowerOnly ? ["below", "within"] : ["below", "within", "above"]).every(code =>
        profile.categories[code]?.code === code && typeof profile.categories[code].label === "string" && ["success", "warning", "danger", "neutral"].includes(profile.categories[code].tone)) &&
      profile.notes && ["below", "within", "source", "methods"].every(key => typeof profile.notes[key] === "string");
  }
  function policyValid(policy) {
    return policy && typeof policy.id === "string" && policy.id !== "" && policy.quantity === "urine-citrate-creatinine-ratio" && policy.nativeUnit === "µmol/mmol" &&
      constantsValid(policy.conversionConstants) && Array.isArray(policy.profiles) && policy.profiles.length > 0 && policy.profiles.every(profileValid) &&
      policy.notes && ["universal", "missingAge", "missingSex", "underAge", "currentPreterm", "censored", "unknownBasis"].every(key => typeof policy.notes[key] === "string");
  }
  function unitInfo(raw) {
    if (typeof raw !== "string") return null;
    const parts = raw.split(":");
    if (parts.length > 2) return null;
    const unit = ({ "µmol/L": "umol/L", "μmol/L": "umol/L", umol: "umol/L", "µmol/mmol": "umol/mmol", "μmol/mmol": "umol/mmol", "mg/dl": "mg/dL" })[parts[0]] || parts[0];
    const mass = unit.startsWith("mg/");
    const basis = mass ? parts[1] || "unknown" : "";
    if (mass && !["ion", "acid", "unknown"].includes(basis) || !mass && parts.length > 1) return null;
    return { unit, basis, label: ({ "umol/L": "µmol/L", "umol/mmol": "µmol/mmol" })[unit] || unit, canonical: mass ? `${unit}:${basis}` : unit };
  }
  function ratioFactor(info, constants) {
    if (!info) return null;
    if (["umol/mmol", "mmol/mol"].includes(info.unit)) return fraction(1n);
    if (["mmol/mmol", "mol/mol"].includes(info.unit)) return fraction(1000n);
    if (!["ion", "acid"].includes(info.basis)) return null;
    const mass = decimalFraction(info.basis === "ion" ? constants.citrateIonMgPerMmol : constants.citricAcidMgPerMmol);
    const cr = decimalFraction(constants.creatinineMgPerMmol);
    if (info.unit === "mg/mg") return multiply(divide(cr, mass), 1000n);
    if (info.unit === "mg/g") return divide(cr, mass);
    if (info.unit === "mg/mmol") return divide(fraction(1000n), mass);
    return null;
  }
  function validRatioUnit(info) { return info && ["umol/mmol", "mmol/mol", "mmol/mmol", "mol/mol", "mg/mg", "mg/g", "mg/mmol"].includes(info.unit); }
  function creatinineMmol(parsed, rawUnit, constants) {
    const info = unitInfo(rawUnit);
    if (!info || info.basis === "ion" || info.basis === "acid") return null;
    if (info.unit === "mmol/L") return parsed.fraction;
    if (info.unit === "umol/L") return multiply(parsed.fraction, 1n, 1000n);
    if (info.unit === "mg/dL" && !rawUnit.includes(":")) return divide(multiply(parsed.fraction, 10n), decimalFraction(constants.creatinineMgPerMmol));
    return null;
  }
  function inBand(age, band) {
    const minimum = band.minimumAgeMonths / 12;
    const aboveMinimum = age > minimum || band.minimumAgeInclusive && age === minimum;
    return aboveMinimum && (band.maximumAgeMonths === null || age < band.maximumAgeMonths / 12 || band.maximumAgeInclusive && age === band.maximumAgeMonths / 12);
  }
  // An inequality describes the whole nonnegative interval, never a point.
  // Return a category only if every possible value has that same category.
  function classify(value, comparator, band) {
    const low = compare(value, decimalFraction(String(band.lower)));
    const lowerClosed = band.lowerInclusive;
    if (band.upper === null) {
      if (!comparator) return low > 0 || low === 0 && lowerClosed ? "within" : "below";
      if (comparator === "<") return low <= 0 ? "below" : null;
      if (comparator === "≤") return low < 0 || low === 0 && !lowerClosed ? "below" : null;
      if (comparator === ">") return low >= 0 ? "within" : null;
      return low > 0 || low === 0 && lowerClosed ? "within" : null;
    }
    const high = compare(value, decimalFraction(String(band.upper)));
    const upperClosed = band.upperInclusive;
    if (!comparator) return low < 0 || low === 0 && !lowerClosed ? "below" : high > 0 || high === 0 && !upperClosed ? "above" : "within";
    if (comparator === "<") return low <= 0 ? "below" : band.lower === 0 && lowerClosed && high <= 0 ? "within" : null;
    if (comparator === "≤") return low < 0 || low === 0 && !lowerClosed ? "below" : band.lower === 0 && lowerClosed && (high < 0 || high === 0 && upperClosed) ? "within" : null;
    if (comparator === ">") return high >= 0 ? "above" : null;
    return high > 0 || high === 0 && !upperClosed ? "above" : null;
  }
  function displayNumber(value, digits = 12) { return Number(value).toLocaleString("pl-PL", { maximumFractionDigits: digits, useGrouping: false }); }
  function resultNumber(value) {
    if (value === 0) return "0.000";
    if (value < 1e-10 || value >= 1e12) return value.toExponential(4);
    const digits = value < 0.001 ? Math.min(12, Math.max(3, 3 - Math.floor(Math.log10(value)))) : 6;
    return value.toLocaleString("en-US", { minimumFractionDigits: value < 1000 && value >= 0.001 ? 3 : 0, maximumFractionDigits: digits, useGrouping: false });
  }
  // One formatter supplies the main card and every converted table row.
  // Source-native originals remain separate metadata, never a mixed-unit table.
  function formatReference(band, rawUnit, constants = CONVERSION_CONSTANTS) {
    const info = typeof rawUnit === "string" ? unitInfo(rawUnit) : null;
    if (!band || !nonnegative(band.lower) || !(band.upper === null || nonnegative(band.upper)) || !validRatioUnit(info) || !constantsValid(constants)) return null;
    const factor = ratioFactor(info, constants);
    if (!factor) return null;
    const lower = numberOf(divide(decimalFraction(String(band.lower)), factor));
    const upper = band.upper === null ? null : numberOf(divide(decimalFraction(String(band.upper)), factor));
    if (!nonnegative(lower) || upper !== null && !nonnegative(upper)) return null;
    const converted = info.unit.startsWith("mg/");
    const digits = info.unit === "mg/mg" ? 4 : info.unit === "mg/g" ? 2 : info.unit === "mg/mmol" ? 3 : ["mmol/mmol", "mol/mol"].includes(info.unit) ? 3 : 0;
    const lowText = displayNumber(lower, digits), highText = upper === null ? null : displayNumber(upper, digits);
    const range = upper === null ? `${band.lowerInclusive ? "≥" : ">"}${converted ? "≈" : ""}${lowText}` : `${converted ? "≈" : ""}${lowText}–${highText}`;
    return freeze({ nativeLow: band.lower, nativeHigh: band.upper, nativeUnit: "µmol/mmol", lower, upper,
      lowerInclusive: band.lowerInclusive, upperInclusive: band.upper === null ? null : band.upperInclusive, range, limit: range, unit: info.label, converted,
      display: { lower: lowText, upper: highText, range, unit: info.label, approximate: converted } });
  }
  function sourceOriginal(band) {
    const unit = band.sourceUnit || "µmol/mmol";
    const lower = band.sourceLower ?? band.lower, upper = band.sourceUpper === null ? null : band.sourceUpper ?? band.upper;
    const range = upper === null ? `${band.lowerInclusive ? "≥" : ">"}${displayNumber(lower)}` : `${displayNumber(lower)}–${displayNumber(upper)}`;
    return { lower, upper, unit, range, lowerInclusive: band.lowerInclusive, upperInclusive: band.upper === null ? null : band.upperInclusive };
  }
  function sourceTableFor(policy) {
    return policy.profiles.flatMap(profile => profile.bands.map(band => ({ ...copy(band), profileId: profile.id, sourceLabel: profile.source.label, source: copy(profile.source), referenceKind: profile.referenceKind, ...sourceOriginal(band), selected: false })));
  }
  function tableFor(policy, info, constants, selectedProfile, selectedBand) {
    if (!info || !ratioFactor(info, constants)) return [];
    return policy.profiles.flatMap(profile => profile.bands.map(band => ({
      ...copy(band), ...copy(formatReference(band, info.canonical, constants)),
      profileId: profile.id, sourceLabel: profile.source.label, source: copy(profile.source), referenceKind: profile.referenceKind,
      sourceOriginal: sourceOriginal(band), selected: profile.id === selectedProfile?.id && band.id === selectedBand?.id,
    })));
  }
  function referenceFor(policy, profile, band, info, constants) {
    return {
      label: "Norma dla wieku", ...copy(formatReference(band, info.canonical, constants)),
      band: copy(band), table: tableFor(policy, info, constants, profile, band), sourceOriginal: sourceOriginal(band),
      source: copy(profile.source), population: { ...copy(profile.population), ageBand: band.label },
      referenceKind: profile.referenceKind, comparisonMode: profile.comparisonMode, profileId: profile.id, profileVersion: profile.version ?? null,
    };
  }
  function preservedFacts(value) {
    if (Array.isArray(value)) return value.filter(item => typeof item === "string" || typeof item === "boolean").map(copy);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, item]) => typeof item === "string" || typeof item === "boolean" || item === null));
    return [];
  }
  function evaluate(input, policy) {
    const request = input && typeof input === "object" ? input : {};
    const mode = request.mode == null ? "concentration" : request.mode;
    const age = nonnegative(request.ageYears) ? request.ageYears : null;
    const sex = ["M", "F"].includes(request.sex) ? request.sex : "";
    const currentPreterm = typeof request.population?.currentPreterm === "boolean" ? request.population.currentPreterm : typeof request.currentPreterm === "boolean" ? request.currentPreterm : undefined;
    const original = value => typeof value === "string" || nonnegative(value) ? value : null;
    const validPolicy = policyValid(policy), constants = validPolicy ? policy.conversionConstants : CONVERSION_CONSTANTS;
    const base = {
      valid: false, reasonCode: "", message: "", mode, rawValue: null, unit: "", originalUnit: "", basis: "", comparator: "", exact: false,
      classificationValue: null, nativeSI: null, classificationUnit: "µmol/mmol", category: null, categoryDescription: "", comparison: null,
      status: "unassessed", tone: "neutral", statusText: "Cit/Cr — wynik", referenceAvailable: false, reference: null, referenceTable: [], sourceReferenceTable: validPolicy ? sourceTableFor(policy) : [],
      qualification: { reasonCode: "", note: "", requiresConfirmation: false }, display: null, boundary: "",
      context: { ageYears: age, sex, sameSpecimen: mode === "direct" ? "not-applicable" : ["confirmed", "different"].includes(request.sameSpecimen) ? request.sameSpecimen : "assumed",
        sampleType: ["firstMorning", "secondMorning", "random", "timed"].includes(request.sampleType) ? request.sampleType : "",
        confounders: Array.isArray(request.confounders) ? [...new Set(request.confounders.filter(key => typeof key === "string" && key.trim()))] : [],
        knownFacts: preservedFacts(request.knownFacts), population: typeof currentPreterm === "boolean" ? { currentPreterm } : {} },
      input: mode === "direct" ? { reportedValue: original(request.reportedValue), reportedUnit: typeof request.reportedUnit === "string" ? request.reportedUnit : "" }
        : { citrateValue: original(request.citrateValue), citrateUnit: typeof request.citrateUnit === "string" ? request.citrateUnit : "", creatinineValue: original(request.creatinineValue), creatinineUnit: typeof request.creatinineUnit === "string" ? request.creatinineUnit : "" },
      policyId: validPolicy ? policy.id : null, policyVersion: validPolicy ? policy.version ?? null : null,
      conversion: { version: 1, constants: copy(constants) },
      profileId: null, profileVersion: null, source: null, population: null, restrictions: validPolicy ? copy(policy.restrictions || {}) : null, notes: validPolicy ? copy(policy.notes) : null,
    };
    function finish(reasonCode = "") {
      const result = { ...base, reasonCode };
      if (!result.valid) { result.message = INPUT_MESSAGES[reasonCode] || "Sprawdź dane potrzebne do obliczenia Cit/Cr."; result.statusText = result.message; }
      return freeze({ ...result, snapshot: result.valid ? { schema: "clcr-citcr", version: 1, ...copy(result) } : null });
    }
    if (!["concentration", "direct"].includes(mode)) return finish("invalid-mode");
    let ratio, native = null, info, reported, comparator = "";
    if (mode === "direct") {
      reported = parsedValue(request.reportedValue);
      if (!reported) return finish(absent(request.reportedValue) ? "missing-reported-value" : "invalid-reported-value");
      info = unitInfo(request.reportedUnit);
      if (!validRatioUnit(info)) return finish("invalid-reported-unit");
      ratio = reported.fraction; comparator = reported.comparator;
      const factor = ratioFactor(info, constants);
      if (factor) native = multiply(ratio, factor.n, factor.d);
    } else {
      if (base.context.sameSpecimen === "different") return finish("different-specimens");
      const citrate = parsedValue(request.citrateValue), cr = parsedValue(request.creatinineValue);
      if (!citrate || citrate.comparator) return finish(absent(request.citrateValue) ? "missing-citrate" : "invalid-citrate");
      if (!cr || cr.comparator || cr.value <= 0) return finish(absent(request.creatinineValue) ? "missing-creatinine" : "invalid-creatinine");
      const citrateInfo = unitInfo(request.citrateUnit);
      if (!citrateInfo || !["umol/L", "mmol/L", "mg/L", "mg/dL"].includes(citrateInfo.unit)) return finish("invalid-citrate-unit");
      const crMmol = creatinineMmol(cr, request.creatinineUnit, constants);
      if (!crMmol) return finish("invalid-creatinine-unit");
      if (["umol/L", "mmol/L"].includes(citrateInfo.unit)) {
        native = divide(multiply(citrate.fraction, citrateInfo.unit === "mmol/L" ? 1000n : 1n), crMmol);
        ratio = native; info = unitInfo("umol/mmol");
      } else {
        const citrateMg = multiply(citrate.fraction, citrateInfo.unit === "mg/dL" ? 10n : 1n);
        const crMass = decimalFraction(constants.creatinineMgPerMmol);
        ratio = divide(citrateMg, multiply(crMmol, crMass.n, crMass.d)); info = unitInfo(`mg/mg:${citrateInfo.basis}`);
        const factor = ratioFactor(info, constants);
        if (factor) native = multiply(ratio, factor.n, factor.d);
      }
    }
    const rawValue = mode === "direct" ? reported.value : numberOf(ratio), classificationValue = native ? numberOf(native) : null;
    if (!nonnegative(rawValue) || ratio.n !== 0n && rawValue === 0 || native && (!nonnegative(classificationValue) || native.n !== 0n && classificationValue === 0)) return finish("invalid-conversion");
    const displayed = mode === "direct" ? reported.text : resultNumber(rawValue);
    Object.assign(base, { valid: true, rawValue, unit: info.label, originalUnit: info.canonical, basis: info.basis, comparator, exact: comparator === "", classificationValue, nativeSI: classificationValue,
      exactValue: { numerator: ratio.n.toString(), denominator: ratio.d.toString() }, exactNativeSI: native ? { numerator: native.n.toString(), denominator: native.d.toString() } : null,
      display: { value: displayed, text: comparator + displayed, unit: info.label, comparator, boundary: "", rounded: mode === "concentration" && Number(displayed) !== rawValue } });
    if (!validPolicy) {
      const reason = policy ? "invalid-profile" : "missing-profile";
      base.qualification = { reasonCode: reason, note: "Nie dobrano źródła normy Cit/Cr.", requiresConfirmation: false };
      return finish(reason);
    }
    base.referenceTable = tableFor(policy, info, constants);
    if (!native) {
      base.qualification = { reasonCode: "unknown-mass-basis", note: policy.notes.unknownBasis, requiresConfirmation: false };
      return finish("unknown-mass-basis");
    }
    if (currentPreterm === true) {
      base.qualification = { reasonCode: "unsupported-population", note: policy.notes.currentPreterm, requiresConfirmation: false };
      return finish("unsupported-population");
    }
    if (Array.isArray(policy.restrictions?.restrictedSampleTypes) && policy.restrictions.restrictedSampleTypes.includes(base.context.sampleType)) {
      base.qualification = { reasonCode: "unsupported-sample-type", note: policy.notes.unsupportedSampleType || "Wybrane normy dotyczą próbki punktowej, a znana próbka pochodzi ze zbiórki moczu.", requiresConfirmation: false };
      return finish("unsupported-sample-type");
    }
    const ageMatches = age === null ? [] : policy.profiles.flatMap(profile => profile.bands.filter(band => inBand(age, band)).map(band => ({ profile, band })));
    const matches = ageMatches.filter(({ band }) => !band.sex || band.sex === sex);
    if (matches.length !== 1) {
      const minimumAge = Math.min(...policy.profiles.flatMap(profile => profile.bands.map(band => band.minimumAgeMonths / 12)));
      const missingSex = sex === "" && ageMatches.length > 0 && ageMatches.every(({ band }) => Boolean(band.sex));
      const reason = age === null ? absent(request.ageYears) ? "missing-age" : "invalid-age" : age < minimumAge ? "under-age" : missingSex ? "missing-sex" : matches.length ? "ambiguous-age-band" : "no-age-band";
      const note = age === null ? policy.notes.missingAge : age < minimumAge ? policy.notes.underAge : missingSex ? policy.notes.missingSex : "Nie dobrano jednoznacznego zakresu Cit/Cr dla tego wieku i płci.";
      base.qualification = { reasonCode: reason, note, requiresConfirmation: false };
      return finish(reason);
    }
    const { profile, band } = matches[0], category = classify(native, comparator, band);
    base.reference = referenceFor(policy, profile, band, info, constants); base.referenceAvailable = true; base.referenceTable = copy(base.reference.table);
    Object.assign(base, { profileId: profile.id, profileVersion: profile.version ?? null, source: copy(profile.source), population: copy(base.reference.population),
      restrictions: { ...copy(policy.restrictions || {}), ...copy(profile.restrictions || {}) }, notes: { ...copy(policy.notes), ...copy(profile.notes) },
      category, categoryDescription: category ? profile.categories[category].label : "", comparison: category || "ambiguous", status: category || "unassessed",
      tone: category ? profile.categories[category].tone : "neutral", statusText: category ? profile.categories[category].label : "Zapis nie rozstrzyga oceny" });
    const reason = category ? "" : "censored-multiple-categories";
    base.qualification = { reasonCode: reason, note: category ? profile.notes[category] || policy.notes.universal : policy.notes.censored, requiresConfirmation: false };
    if (mode === "concentration" && category) {
      const rounded = decimalFraction(displayed), factor = ratioFactor(info, constants);
      if (rounded && classify(multiply(rounded, factor.n, factor.d), "", band) !== category) {
        base.boundary = `Ocena przed zaokrągleniem: ${base.statusText.toLocaleLowerCase("pl-PL")}.`;
        base.display.boundary = base.boundary;
      }
    }
    return finish(reason);
  }
  function readInputFromDocument(documentRef, options = {}) {
    const doc = documentRef || root?.document || (typeof document !== "undefined" ? document : null);
    const control = id => doc?.getElementById(id);
    const value = (id, fallback = "") => control(id) ? control(id).value : fallback;
    // These profiles need completed years and optional months. In particular,
    // 0 years with blank months belongs wholly to the same birth–<3 band.
    // A day-of-life retained from a different formula does not select a band.
    const yearsText = value("age"), monthsText = value("ageMonths");
    const years = Number(yearsText), months = absent(monthsText) ? 0 : Number(monthsText);
    const age = !absent(yearsText) && Number.isInteger(years) && years >= 0 && years <= 120 && Number.isInteger(months) && months >= 0 && months <= 11 && years * 12 + months <= 1440 ? years + months / 12 : null;
    const specimen = value("CitCr_same_specimen"), legacy = value("ui_spotSameSpecimen_answer");
    const factorFields = [["spotMenstruation", "menstruation"], ["spotHematuria", "hematuria"], ["spotInfection", "infection"], ["spotExercise", "exercise"], ["spotAcuteIllness", "acuteIllness"]];
    const knownFields = [...factorFields, ["spotDiureticUse", "diureticUse"], ["spotKnownCKD", "knownCKD"]];
    const fact = id => {
      const answer = value(`ui_${id}_answer`);
      if (answer === "yes") return true;
      if (answer === "no") return false;
      if (answer === "unknown") return null;
      return control(id)?.checked ? true : undefined;
    };
    const selectedUnit = (id, basisId, fallback) => {
      const unit = value(id, fallback);
      return typeof unit === "string" && unit.startsWith("mg/") && !unit.includes(":") ? `${unit}:${value(basisId, "unknown")}` : unit;
    };
    // Before this module the absent selector meant explicitly labelled
    // anhydrous citric acid in mg/dL. A present, blank selector stays invalid.
    const citrateUnit = selectedUnit("Cit_Cr_spot_unit", "citrateSpotReportingEntity", "mg/dL:acid");
    return {
      mode: options.concentrationOnly ? "concentration" : value("CitCr_entry_mode", "concentration"),
      citrateValue: value("Cit_Cr_spot"), citrateUnit,
      creatinineValue: value("Ucr_spot"), creatinineUnit: value("Ucr_spot_unit", "mg/dl"),
      reportedValue: value("CitCr_reported"), reportedUnit: selectedUnit("CitCr_reported_unit", "CitCr_reported_basis", "umol/mmol"),
      ageYears: age, sex: value("sex"),
      sameSpecimen: specimen === "different" ? "different" : specimen === "confirmed" ? "confirmed" : legacy === "no" ? "different" : legacy === "unknown" ? "assumed" : legacy === "yes" || control("spotSameSpecimen")?.checked ? "confirmed" : "assumed",
      sampleType: value("spotSampleKind"), confounders: factorFields.filter(([id]) => fact(id) === true).map(([, key]) => key),
      knownFacts: Object.fromEntries(knownFields.filter(([id]) => fact(id) !== undefined).map(([id, key]) => [key, fact(id)])),
      ...(typeof options.population?.currentPreterm === "boolean" ? { population: { currentPreterm: options.population.currentPreterm } } : {}),
    };
  }
  return Object.freeze({ evaluate, parseReportedValue, readInputFromDocument, formatReference, CONVERSION_CONSTANTS });
});
