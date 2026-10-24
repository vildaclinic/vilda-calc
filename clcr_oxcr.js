(function (root, factory) {
  const api = factory(root);
  if (root) root.VildaClcrOxcr = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";

  const INPUT_MESSAGES = Object.freeze({
    "invalid-mode": "Wybierz sposób wprowadzenia Ox/Cr.",
    "missing-reported-value": "Wpisz wynik Ox/Cr z laboratorium.",
    "invalid-reported-value": "Wpisz nieujemny wynik Ox/Cr. Zachowaj znak <, ≤, > lub ≥ z wydruku.",
    "invalid-reported-unit": "Wybierz jednostkę wyniku Ox/Cr.",
    "different-specimens": "Nie można obliczyć Ox/Cr z oznaczeń z różnych próbek. Użyj szczawianów i kreatyniny z tej samej próbki moczu albo gotowego wyniku Ox/Cr.",
    "missing-oxalate": "Wpisz stężenie szczawianów w moczu.",
    "invalid-oxalate": "Stężenie szczawianów w moczu musi być liczbą nieujemną.",
    "missing-creatinine": "Wpisz stężenie kreatyniny w moczu.",
    "invalid-creatinine": "Stężenie kreatyniny w moczu musi być liczbą większą od zera.",
    "invalid-oxalate-unit": "Wybierz jednostkę szczawianów w moczu: µmol/L, mmol/L, mg/L lub mg/dL. Dla jednostki masowej zachowaj postać z raportu.",
    "invalid-creatinine-unit": "Wybierz jednostkę kreatyniny w moczu: mg/dL, µmol/L lub mmol/L.",
    "invalid-conversion": "Nie można obliczyć Ox/Cr z podanych wartości. Sprawdź stężenia i jednostki.",
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
  // Physical conversion is available without a normative profile. No normal
  // limit or population policy is built into this engine.
  const CONVERSION_CONSTANTS = Object.freeze({ oxalateIonMgPerMmol: "88.019", oxalicAcidMgPerMmol: "90.0349", creatinineMgPerMmol: "113.12" });
  function constantsValid(value) {
    return value && ["oxalateIonMgPerMmol", "oxalicAcidMgPerMmol", "creatinineMgPerMmol"].every(key => positive(Number(value[key])) && decimalFraction(value[key]));
  }
  function profileValid(profile) {
    return profile && typeof profile.id === "string" && profile.id !== "" && profile.quantity === "urine-oxalate-creatinine-ratio" && profile.nativeUnit === "µmol/mmol" &&
      profile.population && typeof profile.population.label === "string" && profile.source && typeof profile.source.label === "string" &&
      ["upper-percentile-95", "two-sided-laboratory-reference-interval"].includes(profile.referenceKind) &&
      Array.isArray(profile.bands) && profile.bands.length > 0 && profile.bands.every(band => band && typeof band.id === "string" && typeof band.label === "string" &&
        nonnegative(band.minimumAgeMonths) && typeof band.minimumAgeInclusive === "boolean" &&
        (band.maximumAgeMonths === null || positive(band.maximumAgeMonths) && band.maximumAgeMonths > band.minimumAgeMonths) && typeof band.maximumAgeInclusive === "boolean" &&
        positive(band.upper) && (profile.referenceKind === "upper-percentile-95" ? band.lower === null : nonnegative(band.lower) && band.lower < band.upper)) &&
      profile.categories && (profile.referenceKind === "upper-percentile-95" ? ["within", "above"] : ["below", "within", "above"]).every(code =>
        profile.categories[code]?.code === code && typeof profile.categories[code].label === "string" && ["success", "warning", "danger", "neutral"].includes(profile.categories[code].tone)) &&
      profile.notes && ["within", "above", "source", "methods"].every(key => typeof profile.notes[key] === "string");
  }
  function policyValid(policy) {
    return policy && typeof policy.id === "string" && policy.id !== "" && policy.quantity === "urine-oxalate-creatinine-ratio" && policy.nativeUnit === "µmol/mmol" &&
      constantsValid(policy.conversionConstants) && Array.isArray(policy.profiles) && policy.profiles.length > 0 && policy.profiles.every(profileValid) &&
      policy.notes && ["universal", "missingAge", "underAge", "currentPreterm", "censored", "unknownBasis"].every(key => typeof policy.notes[key] === "string");
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
    const mass = decimalFraction(info.basis === "ion" ? constants.oxalateIonMgPerMmol : constants.oxalicAcidMgPerMmol);
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
  function classify(value, comparator, band) {
    const high = compare(value, decimalFraction(String(band.upper)));
    if (band.lower === null) {
      if (!comparator) return high <= 0 ? "within" : "above";
      if (comparator === "<" || comparator === "≤") return high <= 0 ? "within" : null;
      return comparator === ">" ? high >= 0 ? "above" : null : high > 0 ? "above" : null;
    }
    const low = compare(value, decimalFraction(String(band.lower)));
    if (!comparator) return low < 0 ? "below" : high > 0 ? "above" : "within";
    if (comparator === "<") return low <= 0 ? "below" : band.lower === 0 && high <= 0 ? "within" : null;
    if (comparator === "≤") return low < 0 ? "below" : band.lower === 0 && high <= 0 ? "within" : null;
    return comparator === ">" ? high >= 0 ? "above" : null : high > 0 ? "above" : null;
  }
  function displayNumber(value, digits = 12) { return Number(value).toLocaleString("pl-PL", { maximumFractionDigits: digits, useGrouping: false }); }
  function resultNumber(value) {
    if (value === 0) return "0.000";
    if (value < 1e-10 || value >= 1e12) return value.toExponential(4);
    const digits = value < 0.001 ? Math.min(12, Math.max(3, 3 - Math.floor(Math.log10(value)))) : 6;
    return value.toLocaleString("en-US", { minimumFractionDigits: value < 1000 && value >= 0.001 ? 3 : 0, maximumFractionDigits: digits, useGrouping: false });
  }
  function tableFor(policy, selectedProfile, selectedBand) {
    return policy.profiles.flatMap(profile => profile.bands.map(band => ({
      ...copy(band), profileId: profile.id, sourceLabel: profile.source.label, source: copy(profile.source), referenceKind: profile.referenceKind,
      nativeLow: band.lower, nativeHigh: band.upper, lowerInclusive: band.lower === null ? null : true, upperInclusive: true,
      unit: "µmol/mmol", range: band.lower === null ? `≤${displayNumber(band.upper)}` : `${displayNumber(band.lower)}–${displayNumber(band.upper)}`,
      selected: profile.id === selectedProfile?.id && band.id === selectedBand?.id,
    })));
  }
  function referenceFor(policy, profile, band, info, constants) {
    const factor = ratioFactor(info, constants);
    const lower = band.lower === null ? null : numberOf(divide(decimalFraction(String(band.lower)), factor));
    const upper = numberOf(divide(decimalFraction(String(band.upper)), factor));
    const converted = info.unit.startsWith("mg/");
    const digits = info.unit === "mg/mg" ? 4 : info.unit === "mg/g" ? 2 : info.unit === "mg/mmol" ? 3 : ["mmol/mmol", "mol/mol"].includes(info.unit) ? 3 : 0;
    const lowText = lower === null ? null : displayNumber(lower, digits), highText = displayNumber(upper, digits);
    const range = lower === null ? `≤${converted ? "≈" : ""}${highText}` : `${converted ? "≈" : ""}${lowText}–${highText}`;
    return {
      label: "Norma dla wieku", nativeLow: band.lower, nativeHigh: band.upper, nativeUnit: "µmol/mmol", lower, upper,
      lowerInclusive: lower === null ? null : true, upperInclusive: true, range, limit: range, unit: info.label, converted,
      display: { lower: lowText, upper: highText, range, unit: info.label, approximate: converted },
      band: copy(band), table: tableFor(policy, profile, band), source: copy(profile.source), population: { ...copy(profile.population), ageBand: band.label },
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
    const original = value => typeof value === "string" || nonnegative(value) ? value : null;
    const validPolicy = policyValid(policy), constants = validPolicy ? policy.conversionConstants : CONVERSION_CONSTANTS;
    const base = {
      valid: false, reasonCode: "", message: "", mode, rawValue: null, unit: "", originalUnit: "", basis: "", comparator: "", exact: false,
      classificationValue: null, nativeSI: null, classificationUnit: "µmol/mmol", category: null, categoryDescription: "", comparison: null,
      status: "unassessed", tone: "neutral", statusText: "Ox/Cr — wynik", referenceAvailable: false, reference: null, referenceTable: validPolicy ? tableFor(policy) : [],
      qualification: { reasonCode: "", note: "", requiresConfirmation: false }, display: null, boundary: "",
      context: { ageYears: age, sameSpecimen: mode === "direct" ? "not-applicable" : ["confirmed", "different"].includes(request.sameSpecimen) ? request.sameSpecimen : "assumed",
        sampleType: ["firstMorning", "secondMorning", "random", "timed"].includes(request.sampleType) ? request.sampleType : "",
        confounders: Array.isArray(request.confounders) ? [...new Set(request.confounders.filter(key => typeof key === "string" && key.trim()))] : [],
        knownFacts: preservedFacts(request.knownFacts), population: typeof request.population?.currentPreterm === "boolean" ? { currentPreterm: request.population.currentPreterm } : {} },
      input: mode === "direct" ? { reportedValue: original(request.reportedValue), reportedUnit: typeof request.reportedUnit === "string" ? request.reportedUnit : "" }
        : { oxalateValue: original(request.oxalateValue), oxalateUnit: typeof request.oxalateUnit === "string" ? request.oxalateUnit : "", creatinineValue: original(request.creatinineValue), creatinineUnit: typeof request.creatinineUnit === "string" ? request.creatinineUnit : "" },
      policyId: validPolicy ? policy.id : null, policyVersion: validPolicy ? policy.version ?? null : null,
      conversion: { version: 1, constants: copy(constants) },
      profileId: null, profileVersion: null, source: null, population: null, restrictions: validPolicy ? copy(policy.restrictions || {}) : null, notes: validPolicy ? copy(policy.notes) : null,
    };
    function finish(reasonCode = "") {
      const result = { ...base, reasonCode };
      if (!result.valid) { result.message = INPUT_MESSAGES[reasonCode] || "Sprawdź dane potrzebne do obliczenia Ox/Cr."; result.statusText = result.message; }
      return freeze({ ...result, snapshot: result.valid ? { schema: "clcr-oxcr", version: 1, ...copy(result) } : null });
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
      const ox = parsedValue(request.oxalateValue), cr = parsedValue(request.creatinineValue);
      if (!ox || ox.comparator) return finish(absent(request.oxalateValue) ? "missing-oxalate" : "invalid-oxalate");
      if (!cr || cr.comparator || cr.value <= 0) return finish(absent(request.creatinineValue) ? "missing-creatinine" : "invalid-creatinine");
      const oxInfo = unitInfo(request.oxalateUnit);
      if (!oxInfo || !["umol/L", "mmol/L", "mg/L", "mg/dL"].includes(oxInfo.unit)) return finish("invalid-oxalate-unit");
      const crMmol = creatinineMmol(cr, request.creatinineUnit, constants);
      if (!crMmol) return finish("invalid-creatinine-unit");
      if (["umol/L", "mmol/L"].includes(oxInfo.unit)) {
        native = divide(multiply(ox.fraction, oxInfo.unit === "mmol/L" ? 1000n : 1n), crMmol);
        ratio = native; info = unitInfo("umol/mmol");
      } else {
        const oxMg = multiply(ox.fraction, oxInfo.unit === "mg/dL" ? 10n : 1n);
        const crMass = decimalFraction(constants.creatinineMgPerMmol);
        ratio = divide(oxMg, multiply(crMmol, crMass.n, crMass.d)); info = unitInfo(`mg/mg:${oxInfo.basis}`);
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
      base.qualification = { reasonCode: reason, note: "Nie dobrano źródła normy Ox/Cr.", requiresConfirmation: false };
      return finish(reason);
    }
    if (!native) {
      base.qualification = { reasonCode: "unknown-mass-basis", note: policy.notes.unknownBasis, requiresConfirmation: false };
      return finish("unknown-mass-basis");
    }
    if (request.population?.currentPreterm === true) {
      base.qualification = { reasonCode: "unsupported-population", note: policy.notes.currentPreterm, requiresConfirmation: false };
      return finish("unsupported-population");
    }
    if (Array.isArray(policy.restrictions?.restrictedSampleTypes) && policy.restrictions.restrictedSampleTypes.includes(base.context.sampleType)) {
      base.qualification = { reasonCode: "unsupported-sample-type", note: policy.notes.unsupportedSampleType || "Wybrane normy dotyczą próbki punktowej, a znana próbka pochodzi ze zbiórki moczu.", requiresConfirmation: false };
      return finish("unsupported-sample-type");
    }
    const matches = age === null ? [] : policy.profiles.flatMap(profile => profile.bands.filter(band => inBand(age, band)).map(band => ({ profile, band })));
    if (matches.length !== 1) {
      const minimumAge = Math.min(...policy.profiles.flatMap(profile => profile.bands.map(band => band.minimumAgeMonths / 12)));
      const reason = age === null ? absent(request.ageYears) ? "missing-age" : "invalid-age" : age < minimumAge ? "under-age" : matches.length ? "ambiguous-age-band" : "no-age-band";
      const note = age === null ? policy.notes.missingAge : age < minimumAge ? policy.notes.underAge : "Nie dobrano jednoznacznego zakresu Ox/Cr dla tego wieku.";
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
    base.qualification = { reasonCode: reason, note: category ? profile.notes[category] || policy.notes.universal : policy.notes.censored, requiresConfirmation: category === "above" };
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
    const doc = documentRef || (typeof document !== "undefined" ? document : null);
    const control = id => doc?.getElementById(id);
    const value = (id, fallback = "") => control(id) ? control(id).value : fallback;
    const clinical = doc?.defaultView?.ClcrClinicalSafety || root?.ClcrClinicalSafety;
    const age = clinical?.readAgeFromDocument?.(doc);
    const specimen = value("OxCr_same_specimen"), legacy = value("ui_spotSameSpecimen_answer");
    const factorFields = [["spotMenstruation", "menstruation"], ["spotHematuria", "hematuria"], ["spotInfection", "infection"], ["spotExercise", "exercise"], ["spotAcuteIllness", "acuteIllness"]];
    const knownFields = [...factorFields, ["spotDiureticUse", "diureticUse"], ["spotKnownCKD", "knownCKD"]];
    const fact = id => {
      const answer = value(`ui_${id}_answer`);
      if (answer === "yes") return true;
      if (answer === "no") return false;
      if (answer === "unknown") return null;
      return control(id)?.checked ? true : undefined;
    };
    const legacyEntity = value("oxalateSpotReportingEntity");
    const oldUnit = `mg/dL:${legacyEntity === "oxalic_acid" ? "acid" : legacyEntity === "oxalate_ion" ? "ion" : "unknown"}`;
    return {
      mode: options.concentrationOnly ? "concentration" : value("OxCr_entry_mode", "concentration"),
      oxalateValue: value("Ox_Cr_spot"), oxalateUnit: value("Ox_Cr_spot_unit", oldUnit),
      creatinineValue: value("Ucr_spot"), creatinineUnit: value("Ucr_spot_unit", "mg/dl"),
      reportedValue: value("OxCr_reported"), reportedUnit: value("OxCr_reported_unit", "umol/mmol"),
      ageYears: age?.valid ? age.exactYears : null,
      sameSpecimen: specimen === "different" ? "different" : specimen === "confirmed" ? "confirmed" : legacy === "no" ? "different" : legacy === "unknown" ? "assumed" : legacy === "yes" || control("spotSameSpecimen")?.checked ? "confirmed" : "assumed",
      sampleType: value("spotSampleKind"), confounders: factorFields.filter(([id]) => fact(id) === true).map(([, key]) => key),
      knownFacts: Object.fromEntries(knownFields.filter(([id]) => fact(id) !== undefined).map(([id, key]) => [key, fact(id)])),
    };
  }
  return Object.freeze({ evaluate, parseReportedValue, readInputFromDocument, CONVERSION_CONSTANTS });
});
