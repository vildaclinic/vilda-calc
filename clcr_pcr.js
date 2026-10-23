(function (root, factory) {
  const api = factory(root);
  if (root) root.VildaClcrPcr = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";

  const INPUT_MESSAGES = Object.freeze({
    "invalid-mode": "Wybierz sposób wprowadzenia PCR.",
    "missing-reported-value": "Wpisz wynik PCR z laboratorium.",
    "invalid-reported-value": "Wpisz nieujemny wynik PCR. Zachowaj znak <, ≤, > lub ≥, jeśli występuje na wydruku.",
    "invalid-reported-unit": "Wybierz jednostkę wyniku PCR: mg/g, mg/mmol, mg/mg lub g/g.",
    "different-specimens": "Nie można obliczyć PCR z oznaczeń z różnych próbek. Użyj białka i kreatyniny z tej samej próbki moczu albo gotowego wyniku PCR z laboratorium.",
    "missing-protein": "Wpisz stężenie białka całkowitego w moczu.",
    "invalid-protein": "Stężenie białka w moczu musi być liczbą nieujemną.",
    "missing-creatinine": "Wpisz stężenie kreatyniny w moczu.",
    "invalid-creatinine": "Stężenie kreatyniny w moczu musi być liczbą większą od zera.",
    "invalid-protein-unit": "Wybierz jednostkę białka w moczu: mg/L, mg/dL lub g/L.",
    "invalid-creatinine-unit": "Wybierz jednostkę kreatyniny w moczu: mg/dL, µmol/L lub mmol/L.",
    "invalid-conversion": "Nie można obliczyć PCR z podanych wartości. Sprawdź stężenia i jednostki.",
  });
  const UNITS = Object.freeze(["mg/g", "mg/mmol", "mg/mg", "g/g"]);

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
  // exactly while comparing thresholds. No epsilon moves a truly exceeded
  // value back into a different range, and 0.5 g/L / 8.84 mmol/L does not become
  // falsely >500 mg/g through intermediate IEEE-754 conversions.
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
  function validAxis(value) { return value && positive(value["mg/g"]) && positive(value["mg/mmol"]); }
  function validProfile(profile) {
    return profile && typeof profile.id === "string" && profile.id !== "" &&
      profile.quantity === "urine-total-protein-creatinine-ratio" && profile.sources &&
      profile.population && typeof profile.population.label === "string" &&
      nonnegative(profile.population.minimumAgeYearsInclusive) &&
      Array.isArray(profile.bands) && profile.bands.length > 0 && profile.bands.every(band =>
        band && nonnegative(band.minimumAgeYearsInclusive) &&
        (band.maximumAgeYearsExclusive === null || positive(band.maximumAgeYearsExclusive) && band.maximumAgeYearsExclusive > band.minimumAgeYearsInclusive) &&
        validAxis(band.normalUpperExclusive) && typeof band.populationLabel === "string" &&
        typeof profile.sources[band.sourceKey]?.label === "string" &&
        (!band.markedLowerExclusive || validAxis(band.markedLowerExclusive) &&
          ["mg/g", "mg/mmol"].every(unit => band.markedLowerExclusive[unit] > band.normalUpperExclusive[unit]))) &&
      profile.pediatricNephrotic && validAxis(profile.pediatricNephrotic.lowerInclusive) &&
      nonnegative(profile.pediatricNephrotic.minimumAgeYearsInclusive) &&
      positive(profile.pediatricNephrotic.maximumAgeYearsExclusive) &&
      profile.pediatricNephrotic.maximumAgeYearsExclusive > profile.pediatricNephrotic.minimumAgeYearsInclusive &&
      typeof profile.sources[profile.pediatricNephrotic.sourceKey]?.label === "string" &&
      profile.bands.every(band => band.minimumAgeYearsInclusive >= profile.pediatricNephrotic.maximumAgeYearsExclusive ||
        band.maximumAgeYearsExclusive !== null && band.maximumAgeYearsExclusive <= profile.pediatricNephrotic.minimumAgeYearsInclusive ||
        ["mg/g", "mg/mmol"].every(unit => profile.pediatricNephrotic.lowerInclusive[unit] > band.normalUpperExclusive[unit])) &&
      profile.categories && ["normal", "raised", "marked", "nephrotic"].every(code =>
        profile.categories[code]?.code === code && typeof profile.categories[code].label === "string" &&
        ["success", "warning", "danger", "neutral"].includes(profile.categories[code].tone)) &&
      profile.notes && ["normal", "confirmation", "missingAge", "underAge", "censored"].every(key => typeof profile.notes[key] === "string");
  }
  function axisFor(unit) { return unit === "mg/mmol" ? "mg/mmol" : "mg/g"; }
  function divisorFor(unit) { return unit === "mg/mg" || unit === "g/g" ? 1000 : 1; }
  function displayNumber(value) { return String(value).replace(".", ","); }
  function inBand(age, band) { return age >= band.minimumAgeYearsInclusive && (band.maximumAgeYearsExclusive === null || age < band.maximumAgeYearsExclusive); }
  function makeRows(profile, band, axis, nephrotic) {
    const normal = band.normalUpperExclusive[axis];
    const second = nephrotic ? profile.pediatricNephrotic.lowerInclusive[axis] : band.markedLowerExclusive?.[axis] ?? null;
    const rows = [
      { ...copy(profile.categories.normal), label: band.normalLabel || profile.categories.normal.label, lower: 0, lowerInclusive: true, upper: normal, upperInclusive: false },
      { ...copy(profile.categories.raised), label: band.raisedLabel || profile.categories.raised.label, lower: normal, lowerInclusive: true, upper: second, upperInclusive: second !== null && !nephrotic },
    ];
    if (second !== null) rows.push({ ...copy(profile.categories[nephrotic ? "nephrotic" : "marked"]), lower: second, lowerInclusive: nephrotic, upper: null, upperInclusive: false });
    return rows;
  }
  function referenceFor(profile, band, unit, age) {
    const axis = axisFor(unit);
    const divisor = divisorFor(unit);
    const nephrotic = inBand(age, profile.pediatricNephrotic);
    const rows = makeRows(profile, band, axis, nephrotic);
    const source = profile.sources[band.sourceKey];
    return {
      label: "Norma dla wieku", limit: `<${displayNumber(band.normalUpperExclusive[axis] / divisor)}`, unit, axis,
      normalUpperExclusive: band.normalUpperExclusive[axis] / divisor,
      lowerThreshold: band.normalUpperExclusive[axis] / divisor,
      upperThreshold: rows[2]?.lower != null ? rows[2].lower / divisor : null,
      nephroticThreshold: nephrotic ? profile.pediatricNephrotic.lowerInclusive[axis] / divisor : null,
      categories: rows.map(row => {
        const lower = row.lower / divisor;
        const upper = row.upper === null ? null : row.upper / divisor;
        const range = row.code === "normal" ? `<${displayNumber(upper)}`
          : upper === null ? `${row.lowerInclusive ? "≥" : ">"}${displayNumber(lower)}`
            : `${displayNumber(lower)}–${row.upperInclusive ? "" : "<"}${displayNumber(upper)}`;
        return { ...row, lower, upper, range };
      }),
      band: { id: band.id, minimumAgeYearsInclusive: band.minimumAgeYearsInclusive, maximumAgeYearsExclusive: band.maximumAgeYearsExclusive, populationLabel: band.populationLabel, agePolicy: band.agePolicy || "" },
      source: copy(source),
      nephroticSource: nephrotic ? copy(profile.sources[profile.pediatricNephrotic.sourceKey]) : null,
      population: { ...copy(profile.population), label: band.populationLabel },
      profileId: profile.id, profileVersion: profile.version ?? null,
    };
  }
  function inputInterval(value, comparator) {
    const zero = fraction(0n);
    if (comparator === "<" || comparator === "≤") return { lower: zero, lowerInclusive: true, upper: value, upperInclusive: comparator === "≤" };
    if (comparator === ">" || comparator === "≥") return { lower: value, lowerInclusive: comparator === "≥", upper: null, upperInclusive: false };
    return { lower: value, lowerInclusive: true, upper: value, upperInclusive: true };
  }
  function intersects(interval, row) {
    const rowLower = decimalFraction(String(row.lower));
    const rowUpper = row.upper === null ? null : decimalFraction(String(row.upper));
    const lowerOrder = compare(interval.lower, rowLower);
    const lower = lowerOrder > 0 ? interval.lower : rowLower;
    const lowerInclusive = lowerOrder > 0 ? interval.lowerInclusive : lowerOrder < 0 ? row.lowerInclusive : interval.lowerInclusive && row.lowerInclusive;
    let upper = interval.upper;
    let upperInclusive = interval.upperInclusive;
    if (rowUpper !== null) {
      if (upper === null || compare(rowUpper, upper) < 0) { upper = rowUpper; upperInclusive = row.upperInclusive; }
      else if (compare(rowUpper, upper) === 0) upperInclusive = upperInclusive && row.upperInclusive;
    }
    return upper === null || compare(lower, upper) < 0 || compare(lower, upper) === 0 && lowerInclusive && upperInclusive;
  }

  function evaluate(input, profile) {
    const request = input && typeof input === "object" ? input : {};
    const mode = request.mode == null ? "concentration" : request.mode;
    const age = nonnegative(request.ageYears) ? request.ageYears : null;
    const factors = Array.isArray(request.confounders) ? [...new Set(request.confounders.filter(key => typeof key === "string" && key.trim()))] : [];
    const original = value => typeof value === "string" || nonnegative(value) ? value : null;
    const base = {
      valid: false, reasonCode: "", message: "", mode, rawValue: null, unit: "", comparator: "", exact: false,
      classificationValue: null, classificationUnit: "", convertedValue: null, convertedUnit: "",
      category: null, categoryDescription: "", possibleCategories: [], comparison: null,
      status: "unassessed", tone: "neutral", statusText: "PCR — wynik liczbowy",
      referenceAvailable: false, reference: null,
      qualification: { reasonCode: "", note: "", requiresConfirmation: false },
      display: null, boundary: "",
      context: { ageYears: age, sameSpecimen: mode === "direct" ? "not-applicable" : ["confirmed", "different"].includes(request.sameSpecimen) ? request.sameSpecimen : "assumed",
        sampleType: ["firstMorning", "secondMorning", "random", "timed"].includes(request.sampleType) ? request.sampleType : "", confounders: factors },
      input: mode === "direct" ? { reportedValue: original(request.reportedValue), reportedUnit: typeof request.reportedUnit === "string" ? request.reportedUnit : "" }
        : { proteinValue: original(request.proteinValue), proteinUnit: typeof request.proteinUnit === "string" ? request.proteinUnit : "", creatinineValue: original(request.creatinineValue), creatinineUnit: typeof request.creatinineUnit === "string" ? request.creatinineUnit : "" },
      profileId: null, profileVersion: null, source: null, sources: [], population: null, restrictions: null, notes: null,
    };
    function finish(reasonCode = "") {
      const result = { ...base, reasonCode };
      if (!result.valid) { result.message = INPUT_MESSAGES[reasonCode] || "Sprawdź dane potrzebne do obliczenia PCR."; result.statusText = result.message; }
      return freeze({ ...result, snapshot: result.valid ? { schema: "clcr-pcr", version: 1, ...copy(result) } : null });
    }
    if (!["concentration", "direct"].includes(mode)) return finish("invalid-mode");
    let value;
    let reported;
    let unit;
    let comparator = "";
    if (mode === "direct") {
      reported = parsedValue(request.reportedValue);
      if (!reported) return finish(absent(request.reportedValue) ? "missing-reported-value" : "invalid-reported-value");
      if (!UNITS.includes(request.reportedUnit)) return finish("invalid-reported-unit");
      value = reported.fraction; unit = request.reportedUnit; comparator = reported.comparator;
    } else {
      if (base.context.sameSpecimen === "different") return finish("different-specimens");
      const protein = parsedValue(request.proteinValue);
      const creatinine = parsedValue(request.creatinineValue);
      if (!protein || protein.comparator) return finish(absent(request.proteinValue) ? "missing-protein" : "invalid-protein");
      if (!creatinine || creatinine.comparator || creatinine.value <= 0) return finish(absent(request.creatinineValue) ? "missing-creatinine" : "invalid-creatinine");
      const proteinScales = { "mg/L": 1n, "mg/dL": 10n, "mg/dl": 10n, "g/L": 1000n };
      if (!Object.prototype.hasOwnProperty.call(proteinScales, request.proteinUnit)) return finish("invalid-protein-unit");
      const proteinMgL = multiply(protein.fraction, proteinScales[request.proteinUnit]);
      let creatinineGL;
      if (["mg/dl", "mg/dL"].includes(request.creatinineUnit)) creatinineGL = multiply(creatinine.fraction, 1n, 100n);
      else if (["umol", "µmol/L", "μmol/L"].includes(request.creatinineUnit)) creatinineGL = multiply(creatinine.fraction, 1n, 8840n);
      else if (request.creatinineUnit === "mmol/L") creatinineGL = multiply(creatinine.fraction, 25n, 221n);
      else return finish("invalid-creatinine-unit");
      value = divide(proteinMgL, creatinineGL); unit = "mg/g";
    }
    const rawValue = mode === "direct" ? reported.value : numberOf(value);
    if (!nonnegative(rawValue)) return finish("invalid-conversion");
    const classification = divisorFor(unit) === 1000 ? multiply(value, 1000n) : value;
    const classificationValue = numberOf(classification);
    if (!nonnegative(classificationValue)) return finish("invalid-conversion");
    const converted = axisFor(unit) === "mg/mmol" ? multiply(value, 221n, 25n) : multiply(classification, 25n, 221n);
    const convertedValue = numberOf(converted);
    if (!nonnegative(convertedValue)) return finish("invalid-conversion");
    const displayed = mode === "direct" ? reported.text : rawValue.toFixed(1);
    Object.assign(base, { valid: true, rawValue, unit, comparator, exact: comparator === "",
      classificationValue, classificationUnit: axisFor(unit), convertedValue, convertedUnit: axisFor(unit) === "mg/mmol" ? "mg/g" : "mg/mmol",
      display: { value: displayed, text: comparator + displayed, unit, comparator, boundary: "", rounded: mode === "concentration" && Number(displayed) !== rawValue } });
    if (!profile || !validProfile(profile)) {
      base.qualification = { reasonCode: profile ? "invalid-profile" : "missing-profile", note: "Nie dobrano źródła normy PCR.", requiresConfirmation: false };
      return finish(base.qualification.reasonCode);
    }
    Object.assign(base, { profileId: profile.id, profileVersion: profile.version ?? null, sources: copy(Object.values(profile.sources)),
      population: copy(profile.population), restrictions: copy(profile.restrictions || {}), notes: copy(profile.notes) });
    if (age === null || age < profile.population.minimumAgeYearsInclusive) {
      const reason = age === null ? absent(request.ageYears) ? "missing-age" : "invalid-age" : "under-age";
      base.qualification = { reasonCode: reason, note: age === null ? profile.notes.missingAge : profile.notes.underAge, requiresConfirmation: false };
      return finish(reason);
    }
    const matches = profile.bands.filter(band => inBand(age, band));
    if (matches.length !== 1) {
      const reason = matches.length ? "ambiguous-age-band" : "no-age-band";
      base.qualification = { reasonCode: reason, note: "Nie zastosowano automatycznej normy PCR dla tego wieku.", requiresConfirmation: false };
      return finish(reason);
    }
    const band = matches[0];
    base.reference = referenceFor(profile, band, unit, age); base.referenceAvailable = true;
    base.source = copy(base.reference.source); base.population = copy(base.reference.population);
    const rows = makeRows(profile, band, axisFor(unit), inBand(age, profile.pediatricNephrotic));
    const possible = rows.filter(row => intersects(inputInterval(classification, comparator), row));
    base.possibleCategories = possible.map(row => row.code);
    const row = possible.length === 1 ? possible[0] : null;
    base.category = row?.code || null; base.categoryDescription = row?.label || "";
    base.comparison = possible.every(item => item.code === "normal") ? "below" : possible.every(item => item.code !== "normal") ? "above" : "ambiguous";
    const above = base.comparison === "above";
    const below = base.comparison === "below";
    base.status = above ? "above" : below && !factors.length ? "within" : "unassessed";
    base.tone = above ? row?.tone || "warning" : below && !factors.length ? row?.tone || "success" : "neutral";
    const factorNames = [...new Set(factors.map(key => profile.factorLabels?.[key] || "czynnika przejściowego"))].join(", ");
    base.statusText = below && factors.length ? `Poniżej progu; możliwy wpływ ${factorNames}` : row ? row.label
      : above ? "Podwyższony PCR — zakres wymaga potwierdzenia" : "Przedział nie określa jednego zakresu PCR";
    if (below && factors.length) {
      base.categoryDescription = profile.categories.normal.label;
      base.reference.categories = base.reference.categories.map(category => category.code === "normal"
        ? { ...category, label: profile.categories.normal.label, tone: "neutral" } : category);
    }
    let reason = row ? "" : above ? "censored-multiple-levels" : "censored-multiple-categories";
    let note = row ? above ? profile.notes.confirmation : profile.notes.normal : profile.notes.censored;
    if (above && !row) note = `${profile.notes.censored} ${profile.notes.confirmation}`;
    if (factors.length) { reason = "confounded-sample"; note = `Możliwy wpływ ${factorNames}. Potwierdź wynik po ustąpieniu czynnika, w pierwszej porannej próbce.`; }
    base.qualification = { reasonCode: reason, note, requiresConfirmation: above || factors.length > 0 };
    if (mode === "concentration" && row) {
      const rounded = decimalFraction(displayed);
      const displayedRow = rows.find(candidate => intersects(inputInterval(rounded, ""), candidate));
      if (displayedRow?.code !== row.code) {
        const crossedUp = compare(rounded, classification) > 0;
        const threshold = crossedUp ? row.upper : row.lower;
        if (threshold !== null) base.boundary = `${crossedUp ? row.upperInclusive ? "≤" : "<" : row.lowerInclusive ? "≥" : ">"}${displayNumber(threshold)}`;
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
    const specimen = value("PCR_same_specimen");
    const legacy = value("ui_spotSameSpecimen_answer");
    return {
      mode: options.concentrationOnly ? "concentration" : value("PCR_entry_mode", "concentration"),
      proteinValue: value("U_Prot_spot"), proteinUnit: value("U_Prot_spot_unit", "mg/L"),
      creatinineValue: value("Ucr_spot"), creatinineUnit: value("Ucr_spot_unit", "mg/dl"),
      reportedValue: value("PCR_reported"), reportedUnit: value("PCR_reported_unit", "mg/g"),
      ageYears: age?.valid ? age.exactYears : null,
      sameSpecimen: specimen === "different" ? "different" : specimen === "confirmed" ? "confirmed" :
        legacy === "no" ? "different" : legacy === "unknown" ? "assumed" : legacy === "yes" || control("spotSameSpecimen")?.checked ? "confirmed" : "assumed",
      sampleType: value("spotSampleKind"),
      confounders: [["spotMenstruation", "menstruation"], ["spotHematuria", "hematuria"], ["spotInfection", "infection"], ["spotExercise", "exercise"], ["spotAcuteIllness", "acuteIllness"]]
        .filter(([id]) => !!control(id)?.checked).map(([, key]) => key),
    };
  }

  return Object.freeze({ evaluate, parseReportedValue, readInputFromDocument });
});
