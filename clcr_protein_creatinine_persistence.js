/* Frozen B/Cr DZM measurements. Reading verifies the captured arithmetic;
 * it never selects a current clinical policy or recalculates historical inputs. */
(function (root, factory) {
  const api = factory();
  if (root) root.ClcrProteinCreatininePersistence = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  const FORMULA = "B_Cr", LABEL = "Białko/kreatynina (DZM)";
  const UNIT_OPTIONS = Object.freeze(["mg/mg", "mg/g", "mg/mmol"]);
  const PROTEIN_UNITS = Object.freeze(["mg/L", "mg/dL", "g/L"]);
  const CREATININE_UNITS = Object.freeze(["mg/dL", "mg/L", "mmol/L", "µmol/L"]);
  const FIELD_MAP = Object.freeze({ BCR_inputMode: "mode", BCR_protein: "proteinValue", BCR_proteinUnit: "proteinUnit", BCR_creatinine: "creatinineValue", BCR_creatinineUnit: "creatinineUnit", BCR_reportedValue: "reportedValue", BCR_reportedUnit: "reportedUnit", U_Prot: "legacyProteinMassMg", V24: "legacyVolumeMl", Ucr: "legacyCreatinineMgDl" });
  const CONTEXT_MAP = Object.freeze({ BCR_sameSpecimen: "sameSpecimen", BCR_collectionProblem: "collectionProblem", BCR_collectionHours: "collectionHours", BCR_durationKnown: "durationKnown" });
  const DEFAULTS = Object.freeze({ BCR_inputMode: "concentration", BCR_protein: "", BCR_proteinUnit: "mg/L", BCR_creatinine: "", BCR_creatinineUnit: "mg/dL", BCR_reportedValue: "", BCR_reportedUnit: "mg/mg", BCR_sameSpecimen: "assumed" });
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
  const object = value => Boolean(value && typeof value === "object" && !Array.isArray(value));
  const finite = value => typeof value === "number" && Number.isFinite(value);
  const normalized = value => String(value ?? "").replace(/\s+/g, "").replace(/−/g, "-").replace(/,/g, ".");
  const canonicalUnit = value => ({ "g/g": "mg/mg" })[value] || value;
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
    if (unit === "mg/mmol") return divide(fraction("1"), fraction(constants.creatinineMgPerMmol));
    return null;
  }
  function concentration(unit, mass) {
    if (["mg/dL", "mg/dl"].includes(unit)) return fraction("10");
    if (unit === "mg/L") return fraction("1");
    if (unit === "g/L" && !mass) return fraction("1000");
    if (unit === "mmol/L" && mass) return fraction(mass);
    if (mass && ["µmol/L", "μmol/L", "umol/L", "umol"].includes(unit)) return multiply(fraction(mass), fraction("0.001"));
    return null;
  }
  // Version 1 verifies the policy frozen in the record. Deliberately do not
  // call the current calculator or current reference data when reading history.
  function validPolicy(profile) {
    if (!profile || typeof profile.id !== "string" || !profile.id || !Number.isInteger(profile.version) || profile.version < 1 ||
      profile.formulaId !== "B_Cr" || profile.quantity !== "urine-protein-creatinine-ratio" || profile.nativeUnit !== "mg/mg" ||
      profile.referenceKind !== "age-selected-comparison" || !Array.isArray(profile.bands) || !profile.bands.length ||
      !profile.source || typeof profile.source.label !== "string" || !Array.isArray(profile.sources) || !profile.sources.length ||
      profile.conversionConstants?.creatinineMgPerMmol !== "113.12" ||
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
    for (const row of profile.referenceTable) for (const sex of ["male", "female"]) {
      const band = profile.bands.find(item => item.ageMinYears === row.minAge && item.ageMaxYears === row.maxAge && item.sex === sex);
      if (!band || !object(row[sex]) || row[sex].low !== band.sourceLow || row[sex].high !== band.high) return false;
      const endpoints = typeof row[sex].display === "string" ? row[sex].display.split("–") : [];
      if (endpoints.length !== 2 || !equal(fraction(endpoints[0]), fraction(String(band.sourceLow))) || !equal(fraction(endpoints[1]), fraction(String(band.high)))) return false;
    }
    const restriction = profile.restrictions;
    return restriction.sampleType === "timed" && restriction.collectionTimeCancels === true && restriction.collectionVolumeCancels === true && restriction.directReportIndependentOfConcentrationSpecimen === true && restriction.collectionProblemWithholdsAssessment === true && restriction.unknownFactsAreConfirmedAbsent === false && restriction.thresholdsFromOtherSpecimensApplied === false && restriction.diagnosesDisease === false && restriction.lowerReferenceLimitAssessed === false;
  }
  function selectedReference(profile, context) {
    if (!profile || context.ageYears === null || context.agePrecision === "uncertain") return null;
    const band = profile.bands.find(row => (row.sex === "any" || row.sex === context.sex) && context.ageYears >= row.ageMinYears && (row.ageMaxYears === null || context.ageYears < row.ageMaxYears));
    if (!band) return null;
    if (context.agePrecision === "completed-years" && band.ageMaxYears !== null && context.ageYears + 1 > band.ageMaxYears) return null;
    const source = profile.sources.find(item => item.id === band.sourceId), local = value => String(value).replace(".", ",");
    return { ...band, unit: "mg/mg", display: (band.upperInclusive ? "≤" : "<") + local(band.high),
      fullDisplay: band.sourceLow == null ? null : local(band.sourceLow) + "–" + local(band.sourceHigh),
      sourceLabel: source.shortLabel || source.label, sourceUrl: source.url, population: source.population,
      categories: band.kind === "clinical-comparison" ? profile.adultCategories : [] };
  }
  function collectionProblem(context) { return [true, "true", "yes"].includes(context.collectionProblem) || [true, "true", "yes"].includes(context.knownFacts?.collectionProblem); }
  function validRecordedPresentation(snapshot, status) {
    // Capture-schema v1 wording. History does not import today's renderer.
    const messages = {
      normal: "", high: "Podwyższenie może towarzyszyć chorobom nerek, ale bywa też przejściowe, np. podczas infekcji lub po wysiłku.",
      "censored-result": "Zachowano znak z raportu; nie wyznaczamy dokładnego punktu na osi.",
      "zero-result": "Sprawdź, czy laboratorium podało zero, czy wynik poniżej granicy oznaczalności.",
      "collection-problem": "Odnotowano problem ze zbiórką moczu; wynik wymaga oceny z uwzględnieniem tej informacji.",
      "missing-profile": "Brak zweryfikowanej konfiguracji norm — wynik bez porównania.",
      "invalid-profile": "Brak zweryfikowanej konfiguracji norm — wynik bez porównania.",
      "missing-age": "Brak wieku pacjenta — wynik bez porównania z normą.",
      "uncertain-age": "Nieprecyzyjny wiek nie pozwala wybrać jednej normy.",
      "age-outside-reference": "Brak przyjętej normy dla DZM w tym wieku.",
      "missing-sex": "Brak płci w danych pacjenta — wynik bez dobranej normy dla wieku i płci.",
      "no-applicable-reference": "Brak jednego zweryfikowanego zakresu dla wieku i płci pacjenta.",
    };
    const context = snapshot.context;
    const reason = collectionProblem(context) ? "collection-problem" : snapshot.comparator ? "censored-result" : snapshot.zero ? "zero-result" : status !== "unassessed" ? status : !snapshot.policy ? snapshot.reasonCode : context.ageYears === null ? "missing-age" : context.agePrecision === "uncertain" ? "uncertain-age" : context.ageYears < 7 ? "age-outside-reference" : context.ageYears < 18 && !context.sex ? "missing-sex" : "no-applicable-reference";
    if (!snapshot.policy && !snapshot.comparator && !snapshot.zero && !collectionProblem(context) && !["missing-profile", "invalid-profile"].includes(reason)) return false;
    const statusText = reason === "normal" ? snapshot.reference.normalStatusText : ({ high: "Podwyższony B/Cr", "censored-result": "Wynik podany z nierównością", "zero-result": "B/Cr równy zero" })[reason] || "B/Cr — bez oceny normy";
    return snapshot.reasonCode === reason && snapshot.statusText === statusText && snapshot.message === messages[reason];
  }
  function selectedCategory(categories, exact) {
    return categories.find(row => {
      const low = compare(exact, fraction(String(row.min))), high = row.max === null ? null : compare(exact, fraction(String(row.max)));
      return (low > 0 || low === 0 && row.lowerInclusive) && (high === null || high < 0 || high === 0 && row.upperInclusive);
    }) || null;
  }
  function validAssessment(snapshot) {
    const context = snapshot.context;
    if (!object(context) || context.ageYears !== null && (!finite(context.ageYears) || context.ageYears < 0) || !["exact", "completed-years", "uncertain"].includes(context.agePrecision) || ![null, "male", "female"].includes(context.sex) || context.knownFacts !== undefined && !object(context.knownFacts)) return false;
    if (["collectionProblem", "durationKnown"].some(key => own(context, key) && typeof context[key] !== "boolean")) return false;
    if (snapshot.profileId === null) {
      if (snapshot.profileVersion !== null || snapshot.policy !== null || snapshot.source !== null || snapshot.restrictions !== null || snapshot.notes !== null || !Array.isArray(snapshot.sources) || snapshot.sources.length || !Array.isArray(snapshot.referenceTable) || snapshot.referenceTable.length || !Array.isArray(snapshot.adultCategories) || snapshot.adultCategories.length) return false;
    } else {
      if (!validPolicy(snapshot.policy) || snapshot.policy.id !== snapshot.profileId || snapshot.policy.version !== snapshot.profileVersion || ["source", "sources", "notes", "restrictions", "conversionConstants", "referenceTable", "adultCategories"].some(key => stable(snapshot[key]) !== stable(snapshot.policy[key]))) return false;
    }
    const reference = selectedReference(snapshot.policy, context), exact = wire(snapshot.exactValue);
    if (!exact || stable(snapshot.reference) !== stable(reference) || snapshot.referenceAvailable !== Boolean(reference)) return false;
    let status = "unassessed";
    if (reference && !snapshot.comparator && exact.n && !collectionProblem(context)) {
      const high = compare(exact, fraction(String(reference.high)));
      status = high > 0 || high === 0 && !reference.upperInclusive ? "high" : "normal";
    }
    const tone = status === "unassessed" ? "neutral" : status === "normal" ? "normal" : "warning";
    const category = status !== "unassessed" && reference?.kind === "clinical-comparison" ? selectedCategory(reference.categories, exact) : null;
    if (stable(snapshot.category) !== stable(category)) return false;
    return snapshot.status === status && snapshot.assessment === status && snapshot.state === status && snapshot.tone === tone && snapshot.outOfRange === (status === "unassessed" ? null : status !== "normal") && validRecordedPresentation(snapshot, status);
  }
  function validFrozen(snapshot) {
    if (!safe(snapshot) || !object(snapshot) || snapshot.schema !== "clcr-protein-creatinine" || snapshot.version !== 1 || snapshot.valid !== true || snapshot.sourceFormula !== FORMULA) return false;
    if (!finite(snapshot.rawValue) || snapshot.rawValue < 0 || !["", "<", "≤", ">", "≥"].includes(snapshot.comparator) || snapshot.operator !== snapshot.comparator || snapshot.exact !== (snapshot.comparator === "") || snapshot.pointValue !== (snapshot.comparator ? null : snapshot.rawValue) || snapshot.zero !== (snapshot.rawValue === 0)) return false;
    if (!validAssessment(snapshot)) return false;
    const constants = snapshot.conversionConstants;
    if (!object(constants) || constants.creatinineMgPerMmol !== "113.12") return false;
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
      if ([input.proteinValue, input.creatinineValue].some(value => String(value ?? "").trim().length > 512)) return false;
      const protein = fraction(input.proteinValue), creatinine = fraction(input.creatinineValue);
      const proteinScale = concentration(input.proteinUnit), creatinineScale = concentration(input.creatinineUnit, constants.creatinineMgPerMmol);
      if (!protein || !creatinine?.n || !proteinScale || !creatinineScale || contextValue(context, "sameSpecimen") === "different" || context.sameSpecimen !== contextValue(context, "sameSpecimen") || snapshot.comparator || snapshot.unit !== "mg/mg" || !equal(divide(multiply(protein, proteinScale), multiply(creatinine, creatinineScale)), main)) return false;
      const proteinNumber = numberOf(protein), creatinineNumber = numberOf(creatinine);
      if (!finite(proteinNumber) || protein.n && proteinNumber === 0 || !finite(creatinineNumber) || creatinineNumber <= 0) return false;
    } else if (snapshot.mode === "legacy") {
      const protein = fraction(input.legacyProteinMassMg), creatinine = fraction(input.legacyCreatinineMgDl), volume = fraction(input.legacyVolumeMl);
      if (!protein || !creatinine?.n || !volume?.n || snapshot.comparator || contextValue(context, "sameSpecimen") === "different" || !equal(divide(multiply(protein, fraction("100")), multiply(creatinine, volume)), main)) return false;
      if ([protein, creatinine, volume].some(value => !finite(numberOf(value)) || value.n && !numberOf(value))) return false;
    } else return false;
    if (!object(snapshot.display) || typeof snapshot.display.value !== "string" || typeof snapshot.display.text !== "string" || snapshot.display.unit !== snapshot.unit) return false;
    if (!validShown(snapshot.display.value, main, snapshot.display.approximate) || normalized(snapshot.display.text) !== snapshot.comparator + (snapshot.display.approximate ? "≈" : "") + normalized(snapshot.display.value) || snapshot.display.rounded !== snapshot.display.approximate || !validFullText(snapshot.display, main, snapshot.comparator)) return false;
    const alternateUnit = "mg/mmol";
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
    return Boolean(dp && snapshot && dp.sourceFormulaId === FORMULA && dp.label === LABEL && dp.valueNum === snapshot.rawValue && dp.rawValue === snapshot.rawValue && dp.unit === snapshot.unit && normalized(dp.displayValue) === normalized(displayText(snapshot)) && normalized(dp.norm) === normalized(normText(snapshot)) && dp.outOfRange === outOfRange(snapshot) && dp.assessment === assessment(snapshot) && dp.category === (snapshot.category?.label || null) && dp.tone === (snapshot.tone === "normal" ? "success" : snapshot.tone) && stable(dp.reference) === stable(snapshot.reference) && dp.referenceAvailable === snapshot.referenceAvailable && stable(dp.source) === stable(snapshot.source) && dp.referenceProfileId === (snapshot.profileId || "") && dp.referenceProfileVersion === snapshot.profileVersion && String(dp.comparator || "") === snapshot.comparator && dp.interpretation === (snapshot.message || snapshot.statusText) && dp.assumptions === (snapshot.context.sameSpecimen === "assumed" ? String(snapshot.notes?.assumption || "") : "") && dp.boundary === "");
  }
  function augmentDatapoint(element, dp) {
    const snapshot = readSnapshot(element?.getAttribute?.("data-clcr-protein-creatinine-snapshot"));
    if (!snapshot || dp?.sourceFormulaId !== FORMULA) return false;
    Object.assign(dp, { proteinCreatinineSnapshot: snapshot, label: LABEL, valueNum: snapshot.rawValue, rawValue: snapshot.rawValue, unit: snapshot.unit, comparator: snapshot.comparator, displayValue: displayText(snapshot), norm: normText(snapshot), outOfRange: outOfRange(snapshot), assessment: assessment(snapshot), category: snapshot.category?.label || null, tone: snapshot.tone === "normal" ? "success" : snapshot.tone, reference: snapshot.reference, referenceAvailable: snapshot.referenceAvailable, source: snapshot.source, interpretation: snapshot.message || snapshot.statusText || "Brak zweryfikowanej normy B/Cr dla tej grupy pacjentów.", assumptions: snapshot.context.sameSpecimen === "assumed" ? String(snapshot.notes?.assumption || "") : "", boundary: "", referenceProfileId: snapshot.profileId || "", referenceProfileVersion: snapshot.profileVersion ?? null });
    return true;
  }
  function prepareValues(values, context = {}, snapshot) {
    const result = { ...(values || {}) }, frozen = snapshot && readSnapshot(JSON.stringify(snapshot));
    if (frozen) {
      for (const id of Object.keys(result)) if (id.startsWith("BCR_")) delete result[id];
      for (const [id, key] of Object.entries(fieldMap(frozen))) result[id] = inputValue(frozen, key) ?? DEFAULTS[id] ?? "";
      for (const [id, key] of Object.entries(CONTEXT_MAP)) if (hasContextField(frozen.context, key)) result[id] = contextValue(frozen.context, key);
      // The edit selector offers three supported reporting units. The unchanged alias
      // remains in the frozen input and is retained by explicit recalculation.
      if (own(result, "BCR_reportedUnit")) result.BCR_reportedUnit = canonicalUnit(result.BCR_reportedUnit);
    } else {
      // Only an explicit edit migrates the active historical pair. Dedicated
      // values captured from another calculator cannot replace these operands.
      for (const id of Object.keys(result)) if (id.startsWith("BCR_")) delete result[id];
      Object.assign(result, DEFAULTS, { BCR_inputMode: "legacy", U_Prot: values?.U_Prot ?? "", V24: values?.V24 ?? "", Ucr: values?.Ucr ?? "" });
      for (const id of Object.keys(CONTEXT_MAP)) if (own(values, id)) result[id] = values[id];
      for (const [id, key] of Object.entries(CONTEXT_MAP)) if (!own(values, id) && hasContextField(context, key)) result[id] = contextValue(context, key);
      // This migration is called only for an identified historical B_Cr capture.
      // Its recorded DZM problem is evidence; unrelated spot flags are not.
      if (!own(result, "BCR_collectionProblem") && [true, "true", "yes"].includes(values?.Cl24CollectionProblem)) result.BCR_collectionProblem = true;
    }
    return result;
  }
  function fieldMap(snapshot) {
    return Object.fromEntries(Object.entries(FIELD_MAP).filter(([id]) => snapshot?.mode === "legacy" ? ["BCR_inputMode", "U_Prot", "V24", "Ucr"].includes(id) : !["U_Prot", "V24", "Ucr"].includes(id)));
  }
  function editableFields(values) {
    if (values?.BCR_inputMode === "legacy") return [
      { id: "U_Prot", label: "Białko całkowite w całej zbiórce (mg)", type: "text", required: true, options: [] },
      { id: "Ucr", label: "Kreatynina w moczu (mg/dL)", type: "text", required: true, options: [] },
      { id: "V24", label: "Objętość całej zbiórki (mL)", type: "text", required: true, options: [] },
    ];
    const direct = values?.BCR_inputMode === "direct";
    const select = (id, label, options) => ({ id, label, type: "select", required: true, options: options.map(value => ({ value, label: value })) });
    const fields = [select("BCR_inputMode", "Sposób wpisania", ["concentration", "direct"])];
    fields[0].options = [{ value: "concentration", label: "Oblicz ze stężeń" }, { value: "direct", label: "Gotowy wynik B/Cr" }];
    if (direct) fields.push({ id: "BCR_reportedValue", label: "B/Cr z wyniku badania", type: "text", required: true, unitFieldId: "BCR_reportedUnit", options: [] }, select("BCR_reportedUnit", "Jednostka wyniku", UNIT_OPTIONS));
    else fields.push({ id: "BCR_protein", label: "Białko całkowite w moczu", type: "text", required: true, unitFieldId: "BCR_proteinUnit", options: [] }, select("BCR_proteinUnit", "Jednostka białka", PROTEIN_UNITS), { id: "BCR_creatinine", label: "Kreatynina w moczu", type: "text", required: true, unitFieldId: "BCR_creatinineUnit", options: [] }, select("BCR_creatinineUnit", "Jednostka kreatyniny", CREATININE_UNITS));
    return fields;
  }
  function captureFields(values, fields = []) {
    const generated = editableFields(values), ids = new Set(generated.map(field => field.id));
    const retained = fields.filter(field => own(values, field.id) && !field.id.startsWith("BCR_") && !["U_Prot", "Ucr", "V24"].includes(field.id));
    for (const id of [...Object.keys(fieldMap({ mode: values?.BCR_inputMode })), ...Object.keys(CONTEXT_MAP)]) if (own(values, id) && !ids.has(id)) generated.push({ id, label: id, type: "text", required: false, historicalContext: true, unitFieldId: "", options: [] });
    return [...generated, ...retained];
  }
  return Object.freeze({ FORMULA, LABEL, FIELD_MAP, fieldMap, CONTEXT_MAP, DEFAULTS, readSnapshot, validFrozen, augmentDatapoint, prepareValues, editableFields, captureFields, displayText, normText, outOfRange, matchesDatapoint, normalized, canonicalUnit, hasContextField, contextValue, inputValue });
});
