/* Frozen Pᵢ/Cr DZM measurements. Reading verifies the captured arithmetic;
 * it never selects a current clinical policy or recalculates historical inputs. */
(function (root, factory) {
  const api = factory();
  if (root) root.ClcrPhosphorusCreatininePersistence = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  const FORMULA = "PO4_Cr", LABEL = "Fosforany/kreatynina (Pi, DZM)";
  const UNIT_OPTIONS = Object.freeze(["mg/mg", "mg/g", "mmol/mmol"]);
  const PHOSPHORUS_UNITS = Object.freeze(["mmol/L", "µmol/L", "mg P/L", "mg P/dL"]);
  const CREATININE_UNITS = Object.freeze(["mmol/L", "µmol/L", "mg/L", "mg/dL"]);
  const FIELD_MAP = Object.freeze({ PICR_inputMode: "mode", PICR_phosphorus: "phosphorusValue", PICR_phosphorusUnit: "phosphorusUnit", PICR_creatinine: "creatinineValue", PICR_creatinineUnit: "creatinineUnit", PICR_reportedValue: "reportedValue", PICR_reportedUnit: "reportedUnit" });
  const CONTEXT_MAP = Object.freeze({ PICR_sameSpecimen: "sameSpecimen", PICR_collectionProblem: "collectionProblem", PICR_collectionHours: "collectionHours", PICR_durationKnown: "durationKnown" });
  const DEFAULTS = Object.freeze({ PICR_inputMode: "concentration", PICR_phosphorus: "", PICR_phosphorusUnit: "mmol/L", PICR_creatinine: "", PICR_creatinineUnit: "mmol/L", PICR_reportedValue: "", PICR_reportedUnit: "mg/mg", PICR_sameSpecimen: "assumed" });
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
  const object = value => Boolean(value && typeof value === "object" && !Array.isArray(value));
  const finite = value => typeof value === "number" && Number.isFinite(value);
  const normalized = value => String(value ?? "").replace(/\s+/g, "").replace(/−/g, "-").replace(/,/g, ".");
  const canonicalUnit = value => ({ "g/g": "mg/mg", "mol/mol": "mmol/mmol" })[value] || value;
  const hasContextField = (context, key) => key === "sameSpecimen" ? own(context, "concentrationSameSpecimen") || own(context, key) : own(context, key);
  const contextValue = (context, key) => key === "sameSpecimen" ? context?.concentrationSameSpecimen ?? (context?.sameSpecimen === "not-applicable" ? "assumed" : context?.sameSpecimen) : context?.[key];
  const inputValue = (snapshot, key) => key === "mode" ? snapshot?.mode : snapshot?.input?.[key];
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
  function factor(unit, constants) {
    if (["mg/mg", "g/g"].includes(unit)) return fraction("1");
    if (unit === "mg/g") return fraction("0.001");
    if (["mmol/mmol", "mol/mol"].includes(unit)) return divide(fraction(constants.phosphorusMgPerMmol), fraction(constants.creatinineMgPerMmol));
    return null;
  }
  function concentration(unit, mass) {
    if (["mg/dL", "mg/dl", "mg P/dL"].includes(unit)) return fraction("10");
    if (["mg/L", "mg P/L"].includes(unit)) return fraction("1");
    if (unit === "mmol/L") return fraction(mass);
    if (["µmol/L", "μmol/L", "umol/L", "umol"].includes(unit)) return multiply(fraction(mass), fraction("0.001"));
    return null;
  }
  // Version 1 verifies the policy frozen in the record. Deliberately do not
  // call the current calculator or current reference data when reading history.
  function validPolicy(policy) {
    if (!object(policy) || typeof policy.id !== "string" || !policy.id || !Number.isInteger(policy.version) || policy.version < 1 || policy.formulaId !== FORMULA || policy.quantity !== "urine-phosphorus-creatinine-ratio" || policy.nativeUnit !== "mg/mg" || policy.referenceKind !== "laboratory-interval" || !object(policy.source) || typeof policy.source.label !== "string" || !Array.isArray(policy.sources) || !policy.sources.length || !Array.isArray(policy.bands) || !policy.bands.length || !Array.isArray(policy.referenceTable) || !object(policy.notes) || !object(policy.restrictions)) return false;
    const ids = new Set();
    for (const source of policy.sources) {
      if (!object(source) || typeof source.id !== "string" || !source.id || ids.has(source.id) || typeof source.label !== "string" || !/^https:\/\//.test(source.url || "")) return false;
      ids.add(source.id);
    }
    const bandIds = new Set();
    for (const band of policy.bands) {
      if (!object(band) || typeof band.id !== "string" || !band.id || bandIds.has(band.id) || !["male", "female"].includes(band.sex) || !finite(band.ageMinYears) || band.ageMinYears < 0 || band.ageMaxYears !== null && (!finite(band.ageMaxYears) || band.ageMaxYears <= band.ageMinYears) || !finite(band.high) || band.high <= 0 || band.low !== null && (!finite(band.low) || band.low < 0 || band.low >= band.high) || (band.low === null ? band.lowerInclusive !== null : typeof band.lowerInclusive !== "boolean") || typeof band.upperInclusive !== "boolean" || typeof band.group !== "string" || !ids.has(band.sourceId)) return false;
      bandIds.add(band.id);
    }
    for (let i = 0; i < policy.bands.length; i += 1) for (let j = i + 1; j < policy.bands.length; j += 1) {
      const a = policy.bands[i], b = policy.bands[j];
      if (a.sex === b.sex && Math.max(a.ageMinYears, b.ageMinYears) < Math.min(a.ageMaxYears ?? Infinity, b.ageMaxYears ?? Infinity)) return false;
    }
    for (const row of policy.referenceTable) for (const sex of ["male", "female"]) {
      const band = policy.bands.find(item => item.ageMinYears === row.minAge && item.ageMaxYears === row.maxAge && item.sex === sex);
      if (!band || !object(row[sex]) || row[sex].low !== band.low || row[sex].high !== band.high || row[sex].display !== String(band.low).replace(".", ",") + "–" + String(band.high).replace(".", ",")) return false;
    }
    const restriction = policy.restrictions;
    return restriction.sampleType === "timed" && restriction.collectionTimeCancels === true && restriction.collectionVolumeCancels === true && restriction.directReportIndependentOfConcentrationSpecimen === true && restriction.collectionProblemWithholdsAssessment === true && restriction.unknownFactsAreConfirmedAbsent === false && restriction.thresholdsFromOtherSpecimensApplied === false && restriction.diagnosesDisease === false && restriction.assessesBurosumabEfficacy === false;
  }
  function selectedReference(policy, context) {
    if (!policy || context.ageYears === null || context.agePrecision === "uncertain") return null;
    const row = policy.bands.find(item => item.sex === context.sex && context.ageYears >= item.ageMinYears && (item.ageMaxYears === null || context.ageYears < item.ageMaxYears));
    if (!row || context.agePrecision === "completed-years" && row.ageMaxYears !== null && context.ageYears + 1 > row.ageMaxYears) return null;
    const source = policy.sources.find(item => item.id === row.sourceId), local = value => String(value).replace(".", ",");
    return { ...row, unit: "mg/mg", display: row.low === null ? (row.upperInclusive ? "≤" : "<") + local(row.high) : local(row.low) + "–" + local(row.high), label: "Norma dla wieku", sourceLabel: source.shortLabel || source.label, sourceUrl: source.url };
  }
  function validRecordedPresentation(snapshot, status) {
    // These strings belong to capture schema v1, not today's UI translation.
    const messages = {
      normal: "Pᵢ/Cr mieści się w zakresie laboratoryjnym dla wieku i płci.",
      low: "Mniejsza ilość fosforu w stosunku do kreatyniny niż w zakresie laboratoryjnym. Sam wskaźnik nie określa przyczyny.",
      high: "Większa ilość fosforu w stosunku do kreatyniny niż w zakresie laboratoryjnym. Sam wskaźnik nie określa przyczyny.",
      "censored-result": "Zachowano znak z raportu. Nie wyznaczamy dokładnej wartości ani punktu na osi.",
      "zero-result": "Sprawdź, czy laboratorium podało zero, czy wynik poniżej granicy oznaczalności. Zero pozostaje bez automatycznej oceny.",
      "collection-problem": "Zgłoszono problem ze zbiórką. Zachowano wynik liczbowy bez automatycznej oceny normy.",
      "missing-profile": "Brak zweryfikowanej konfiguracji norm — wynik bez porównania.",
      "invalid-profile": "Brak zweryfikowanej konfiguracji norm — wynik bez porównania.",
      "missing-age": "Brak wieku pacjenta — wynik bez porównania z normą.",
      "uncertain-age": "Nieprecyzyjny wiek nie pozwala wybrać jednego zakresu laboratoryjnego.",
      "age-outside-reference": "W źródle ARUP nie określono normy Pᵢ/Cr dla dzieci poniżej 7 lat.",
      "missing-sex": "Brak płci pacjenta — zakres laboratoryjny zależy od wieku i płci.",
      "no-verified-female-reference": "Brak zweryfikowanego zakresu Pᵢ/Cr w DZM dla dorosłych kobiet.",
      "no-applicable-reference": "Brak jednego zweryfikowanego zakresu dla wieku i płci pacjenta.",
    };
    const context = snapshot.context;
    const reason = snapshot.comparator ? "censored-result" : snapshot.zero ? "zero-result" : context.collectionProblem === true || context.knownFacts?.collectionProblem === true ? "collection-problem" : status !== "unassessed" ? status : !snapshot.policy ? snapshot.reasonCode : context.ageYears === null ? "missing-age" : context.agePrecision === "uncertain" ? "uncertain-age" : context.ageYears < 7 ? "age-outside-reference" : !context.sex ? "missing-sex" : context.ageYears >= 18 && context.sex === "female" ? "no-verified-female-reference" : "no-applicable-reference";
    if (!snapshot.policy && !snapshot.comparator && !snapshot.zero && context.collectionProblem !== true && context.knownFacts?.collectionProblem !== true && !["missing-profile", "invalid-profile"].includes(reason)) return false;
    const statusText = ({ normal: "W zakresie laboratoryjnym", low: "Obniżony Pᵢ/Cr", high: "Podwyższony Pᵢ/Cr", "censored-result": "Wynik podany z nierównością", "zero-result": "Pᵢ/Cr równy zero" })[reason] || "Pᵢ/Cr — wynik bez oceny zakresu";
    return snapshot.reasonCode === reason && snapshot.statusText === statusText && snapshot.message === messages[reason];
  }
  function validAssessment(snapshot) {
    const context = snapshot.context;
    if (!object(context) || context.ageYears !== null && (!finite(context.ageYears) || context.ageYears < 0) || !["exact", "completed-years", "uncertain"].includes(context.agePrecision) || ![null, "male", "female"].includes(context.sex) || context.knownFacts !== undefined && !object(context.knownFacts)) return false;
    if (["collectionProblem", "durationKnown"].some(key => own(context, key) && typeof context[key] !== "boolean")) return false;
    if (snapshot.profileId === null) {
      if (snapshot.profileVersion !== null || snapshot.policy !== null || snapshot.source !== null || snapshot.restrictions !== null || snapshot.notes !== null || !Array.isArray(snapshot.sources) || snapshot.sources.length || !Array.isArray(snapshot.referenceTable) || snapshot.referenceTable.length) return false;
    } else {
      if (!validPolicy(snapshot.policy) || snapshot.policy.id !== snapshot.profileId || snapshot.policy.version !== snapshot.profileVersion || ["source", "sources", "notes", "restrictions", "conversionConstants", "referenceTable"].some(key => stable(snapshot[key]) !== stable(snapshot.policy[key]))) return false;
    }
    const reference = selectedReference(snapshot.policy, context), exact = wire(snapshot.exactValue);
    if (!exact || stable(snapshot.reference) !== stable(reference) || snapshot.referenceAvailable !== Boolean(reference) || snapshot.category !== null) return false;
    let status = "unassessed";
    if (reference && !snapshot.comparator && exact.n && context.collectionProblem !== true && context.knownFacts?.collectionProblem !== true) {
      const low = reference.low === null ? null : compare(exact, fraction(String(reference.low))), high = compare(exact, fraction(String(reference.high)));
      status = low !== null && (low < 0 || low === 0 && !reference.lowerInclusive) ? "low" : high > 0 || high === 0 && !reference.upperInclusive ? "high" : "normal";
    }
    const tone = status === "unassessed" ? "neutral" : status === "normal" ? "normal" : "warning";
    return snapshot.status === status && snapshot.assessment === status && snapshot.state === status && snapshot.tone === tone && snapshot.outOfRange === (status === "unassessed" ? null : status !== "normal") && validRecordedPresentation(snapshot, status);
  }
  function validFrozen(snapshot) {
    if (!safe(snapshot) || !object(snapshot) || snapshot.schema !== "clcr-phosphorus-creatinine" || snapshot.version !== 1 || snapshot.valid !== true || snapshot.sourceFormula !== FORMULA) return false;
    if (!finite(snapshot.rawValue) || snapshot.rawValue < 0 || !["", "<", "≤", ">", "≥"].includes(snapshot.comparator) || snapshot.operator !== snapshot.comparator || snapshot.exact !== (snapshot.comparator === "") || snapshot.pointValue !== (snapshot.comparator ? null : snapshot.rawValue) || snapshot.zero !== (snapshot.rawValue === 0)) return false;
    if (!validAssessment(snapshot)) return false;
    const constants = snapshot.conversionConstants;
    if (!object(constants) || constants.phosphorusMgPerMmol !== "30.973761998" || constants.creatinineMgPerMmol !== "113.12") return false;
    const main = wire(snapshot.exactValue), mass = wire(snapshot.exactMass), unit = factor(snapshot.unit, constants);
    if (snapshot.unit !== "mg/mg" || !main || !mass || !unit || !equal(multiply(main, unit), mass) || numberOf(main) !== snapshot.rawValue || main.n && !snapshot.rawValue) return false;
    const input = snapshot.input, context = snapshot.context;
    if (!object(input) || !object(context) || context.sampleType !== "timed" || !["assumed", "confirmed", "different"].includes(contextValue(context, "sameSpecimen"))) return false;
    if (snapshot.mode === "direct") {
      if (String(input.reportedValue ?? "").trim().length > 512) return false;
      const match = /^([<>]=?|[≤≥])?\s*(.+)$/.exec(String(input.reportedValue ?? "").trim());
      const comparator = match && ({ "<=": "≤", ">=": "≥" })[match[1]] || match?.[1] || "";
      const reported = match && fraction(match[2]), reportedNumber = reported && numberOf(reported);
      if (!match || !reported || !finite(reportedNumber) || reported.n && !reportedNumber || comparator !== snapshot.comparator || !factor(input.reportedUnit, constants) || !equal(multiply(reported, factor(input.reportedUnit, constants)), main) || snapshot.comparator === "<" && !main.n || context.sameSpecimen !== "not-applicable") return false;
      if (own(input, "reportedUnitOriginal") && (typeof input.reportedUnitOriginal !== "string" || input.reportedUnitOriginal === input.reportedUnit || canonicalUnit(input.reportedUnitOriginal) !== canonicalUnit(input.reportedUnit))) return false;
    } else if (snapshot.mode === "concentration") {
      if (["mg P/L", "mg P/dL"].includes(input.creatinineUnit)) return false;
      if ([input.phosphorusValue, input.creatinineValue].some(value => String(value ?? "").trim().length > 512)) return false;
      const phosphorus = fraction(input.phosphorusValue), creatinine = fraction(input.creatinineValue);
      const phosphorusScale = concentration(input.phosphorusUnit, constants.phosphorusMgPerMmol), creatinineScale = concentration(input.creatinineUnit, constants.creatinineMgPerMmol);
      if (!phosphorus || !creatinine?.n || !phosphorusScale || !creatinineScale || contextValue(context, "sameSpecimen") === "different" || context.sameSpecimen !== contextValue(context, "sameSpecimen") || snapshot.comparator || snapshot.unit !== "mg/mg" || !equal(divide(multiply(phosphorus, phosphorusScale), multiply(creatinine, creatinineScale)), main)) return false;
      const phosphorusNumber = numberOf(phosphorus), creatinineNumber = numberOf(creatinine);
      if (!finite(phosphorusNumber) || phosphorus.n && phosphorusNumber === 0 || !finite(creatinineNumber) || creatinineNumber <= 0) return false;
    } else return false;
    if (!object(snapshot.display) || typeof snapshot.display.value !== "string" || typeof snapshot.display.text !== "string" || snapshot.display.unit !== snapshot.unit) return false;
    if (!validShown(snapshot.display.value, main, snapshot.display.approximate) || normalized(snapshot.display.text) !== snapshot.comparator + (snapshot.display.approximate ? "≈" : "") + normalized(snapshot.display.value) || snapshot.display.rounded !== snapshot.display.approximate || !validFullText(snapshot.display, main, snapshot.comparator)) return false;
    const alternateUnit = snapshot.unit === "mg/mg" ? "mmol/mmol" : "mg/mg";
    const exactAlternate = divide(mass, factor(alternateUnit, constants));
    const alternateNumber = numberOf(exactAlternate), available = finite(alternateNumber) && (!exactAlternate.n || alternateNumber > 0);
    if (snapshot.alternateUnit !== alternateUnit || snapshot.alternateAvailable !== available || !equal(wire(snapshot.exactAlternate), exactAlternate)) return false;
    if (available && snapshot.alternateValue !== alternateNumber || !available && snapshot.alternateValue !== null) return false;
    if (!object(snapshot.alternate) || snapshot.alternate.available !== available || snapshot.alternate.comparator !== snapshot.comparator || snapshot.alternate.unit !== alternateUnit || snapshot.alternate.value !== snapshot.alternateValue) return false;
    if (available) {
      const display = snapshot.alternate.display;
      if (!object(display) || display.unit !== alternateUnit || !validShown(display.value, exactAlternate, display.approximate) || normalized(display.text) !== snapshot.comparator + (display.approximate ? "≈" : "") + normalized(display.value) || display.rounded !== display.approximate || !validFullText(display, exactAlternate, snapshot.comparator)) return false;
    }
    return true;
  }
  function readSnapshot(encoded) {
    if (typeof encoded !== "string" || encoded.length > 60000) return null;
    try { const value = JSON.parse(encoded); return validFrozen(value) ? value : null; } catch (_) { return null; }
  }
  function displayText(snapshot) { return String(snapshot?.display?.text ?? "").replace(/\./g, ","); }
  function normText(snapshot) { return snapshot?.reference ? `${snapshot.reference.display} ${snapshot.reference.unit}` : ""; }
  function outOfRange(snapshot) { return snapshot?.outOfRange ?? null; }
  function assessment(snapshot) { return ({normal:"within",low:"below",high:"above"})[snapshot?.status] || "unassessed"; }
  function matchesDatapoint(dp, snapshot) {
    return Boolean(dp && snapshot && dp.sourceFormulaId === FORMULA && dp.label === LABEL && dp.valueNum === snapshot.rawValue && dp.rawValue === snapshot.rawValue && dp.unit === snapshot.unit && normalized(dp.displayValue) === normalized(displayText(snapshot)) && normalized(dp.norm) === normalized(normText(snapshot)) && dp.outOfRange === outOfRange(snapshot) && dp.assessment === assessment(snapshot) && dp.category === snapshot.category && dp.tone === (snapshot.tone === "normal" ? "success" : snapshot.tone) && stable(dp.reference) === stable(snapshot.reference) && dp.referenceAvailable === snapshot.referenceAvailable && stable(dp.source) === stable(snapshot.source) && dp.referenceProfileId === (snapshot.profileId || "") && dp.referenceProfileVersion === snapshot.profileVersion && String(dp.comparator || "") === snapshot.comparator && dp.interpretation === (snapshot.message || snapshot.statusText) && dp.assumptions === (snapshot.context.sameSpecimen === "assumed" ? String(snapshot.notes?.assumption || "") : "") && dp.boundary === "");
  }
  function augmentDatapoint(element, dp) {
    const snapshot = readSnapshot(element?.getAttribute?.("data-clcr-phosphorus-creatinine-snapshot"));
    if (!snapshot || dp?.sourceFormulaId !== FORMULA) return false;
    Object.assign(dp, { phosphorusCreatinineSnapshot: snapshot, label: LABEL, valueNum: snapshot.rawValue, rawValue: snapshot.rawValue, unit: snapshot.unit, comparator: snapshot.comparator, displayValue: displayText(snapshot), norm: normText(snapshot), outOfRange: outOfRange(snapshot), assessment: assessment(snapshot), category: snapshot.category, tone: snapshot.tone === "normal" ? "success" : snapshot.tone, reference: snapshot.reference, referenceAvailable: snapshot.referenceAvailable, source: snapshot.source, interpretation: snapshot.message || snapshot.statusText || "Brak zweryfikowanej normy Pᵢ/Cr dla tej grupy pacjentów.", assumptions: snapshot.context.sameSpecimen === "assumed" ? String(snapshot.notes?.assumption || "") : "", boundary: "", referenceProfileId: snapshot.profileId || "", referenceProfileVersion: snapshot.profileVersion ?? null });
    return true;
  }
  function prepareValues(values, context = {}, snapshot) {
    const result = { ...(values || {}) }, frozen = snapshot && readSnapshot(JSON.stringify(snapshot));
    if (frozen) {
      for (const id of Object.keys(result)) if (id.startsWith("PICR_")) delete result[id];
      for (const [id, key] of Object.entries(FIELD_MAP)) result[id] = inputValue(frozen, key) ?? DEFAULTS[id] ?? "";
      for (const [id, key] of Object.entries(CONTEXT_MAP)) if (hasContextField(frozen.context, key)) result[id] = contextValue(frozen.context, key);
      // The edit selector offers three supported reporting units. The unchanged alias
      // remains in the frozen input and is retained by explicit recalculation.
      result.PICR_reportedUnit = canonicalUnit(result.PICR_reportedUnit);
    } else {
      // Only an explicit edit migrates the active historical pair. Dedicated
      // values captured from another calculator cannot replace these operands.
      for (const id of Object.keys(result)) if (id.startsWith("PICR_")) delete result[id];
      Object.assign(result, DEFAULTS, { PICR_phosphorus: values?.U_PO4 ?? "", PICR_phosphorusUnit: "mg P/dL", PICR_creatinine: values?.Ucr ?? "", PICR_creatinineUnit: "mg/dL" });
      for (const id of Object.keys(CONTEXT_MAP)) if (own(values, id)) result[id] = values[id];
      for (const [id, key] of Object.entries(CONTEXT_MAP)) if (!own(values, id) && hasContextField(context, key)) result[id] = contextValue(context, key);
    }
    return result;
  }
  function editableFields(values) {
    const direct = values?.PICR_inputMode === "direct";
    const select = (id, label, options) => ({ id, label, type: "select", required: true, options: options.map(value => ({ value, label: value })) });
    const fields = [select("PICR_inputMode", "Sposób wpisania", ["concentration", "direct"])];
    fields[0].options = [{ value: "concentration", label: "Oblicz ze stężeń" }, { value: "direct", label: "Gotowy wynik Pᵢ/Cr" }];
    if (direct) fields.push({ id: "PICR_reportedValue", label: "Pᵢ/Cr z wyniku badania", type: "text", required: true, unitFieldId: "PICR_reportedUnit", options: [] }, select("PICR_reportedUnit", "Jednostka wyniku", UNIT_OPTIONS));
    else fields.push({ id: "PICR_phosphorus", label: "Fosfor nieorganiczny w moczu", type: "text", required: true, unitFieldId: "PICR_phosphorusUnit", options: [] }, select("PICR_phosphorusUnit", "Jednostka fosforu", PHOSPHORUS_UNITS), { id: "PICR_creatinine", label: "Kreatynina w moczu", type: "text", required: true, unitFieldId: "PICR_creatinineUnit", options: [] }, select("PICR_creatinineUnit", "Jednostka kreatyniny", CREATININE_UNITS));
    return fields;
  }
  function captureFields(values, fields = []) {
    const generated = editableFields(values), ids = new Set(generated.map(field => field.id));
    const retained = fields.filter(field => own(values, field.id) && !field.id.startsWith("PICR_") && !["U_PO4", "Ucr"].includes(field.id));
    for (const id of [...Object.keys(FIELD_MAP), ...Object.keys(CONTEXT_MAP)]) if (own(values, id) && !ids.has(id)) generated.push({ id, label: id, type: "text", required: false, historicalContext: true, unitFieldId: "", options: [] });
    return [...generated, ...retained];
  }
  return Object.freeze({ FORMULA, LABEL, FIELD_MAP, CONTEXT_MAP, DEFAULTS, readSnapshot, validFrozen, augmentDatapoint, prepareValues, editableFields, captureFields, displayText, normText, outOfRange, matchesDatapoint, normalized, canonicalUnit, hasContextField, contextValue, inputValue });
});
