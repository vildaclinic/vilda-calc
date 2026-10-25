(function (root, factory) {
  const api = factory(root);
  if (root) root.VildaClcrFek = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";

  const ENGINE_VERSION = 1;
  // Physical conversion retained from the existing production FE calculation.
  // It is independent of the optional, injected clinical display policy.
  const CONVERSION_CONSTANTS = Object.freeze({ creatinineUmolPerMgDl: "88.4", version: 1 });
  const ERRORS = Object.freeze({
    "different-specimens": "Użyj oznaczeń z tej samej próbki moczu i równocześnie pobranej próbki krwi. Wpisane wartości pozostają w formularzu.",
    "missing-concentration": "Wpisz potas i kreatyninę w moczu oraz w surowicy. Potrzebne są cztery stężenia.",
    "invalid-concentration": "Potas w moczu może wynosić zero. Potas w surowicy oraz obie wartości kreatyniny muszą być dodatnie i skończone.",
    "invalid-unit": "Wybierz jednostkę kreatyniny: mg/dL, µmol/L lub mmol/L. Potas w obu próbkach podaj w mmol/L.",
    "numeric-range": "Tego zestawu stężeń nie można przedstawić jako skończonego wyniku. Sprawdź wartości oraz jednostki.",
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
  function absent(value) { return value == null || typeof value === "string" && value.trim() === ""; }
  function fraction(n, d = 1n) {
    if (n === 0n) return { n: 0n, d: 1n };
    let a = n, b = d;
    while (b) { const rest = a % b; a = b; b = rest; }
    return { n: n / a, d: d / a };
  }
  function decimalFraction(text) {
    const match = String(text).match(/^\+?(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i);
    if (!match || !(match[1] || match[2])) return null;
    const exponent = Number(match[3] || 0);
    if (!Number.isInteger(exponent) || Math.abs(exponent) > 1000) return null;
    const n = BigInt((match[1] || "0") + (match[2] || ""));
    const scale = (match[2] || "").length - exponent;
    return scale >= 0 ? fraction(n, 10n ** BigInt(scale)) : fraction(n * 10n ** BigInt(-scale));
  }
  function times(a, b) { return fraction(a.n * b.n, a.d * b.d); }
  function over(a, b) { return b.n === 0n ? null : fraction(a.n * b.d, a.d * b.n); }
  function compare(a, b) { const diff = a.n * b.d - b.n * a.d; return diff < 0n ? -1 : diff > 0n ? 1 : 0; }
  function numberOf(value) {
    const n = Number(value.n), d = Number(value.d);
    if (Number.isFinite(n) && Number.isFinite(d)) return n / d;
    const ns = value.n.toString(), ds = value.d.toString();
    const nm = Number(ns.slice(0, 17)) / 10 ** (Math.min(ns.length, 17) - 1);
    const dm = Number(ds.slice(0, 17)) / 10 ** (Math.min(ds.length, 17) - 1);
    // A single scientific conversion avoids overflow/underflow in 10**exponent
    // before a mathematically finite (including subnormal) result is obtained.
    return Number(`${nm / dm}e${ns.length - ds.length}`);
  }
  function parseValue(input) {
    if (typeof input !== "string" && typeof input !== "number") return null;
    const text = String(input).trim().replace(/[\s\u00a0\u202f]/g, "").replace(",", ".");
    if (text.length > 256 || text === "") return null;
    const exact = decimalFraction(text), value = Number(text);
    if (!exact || !Number.isFinite(value) || value < 0 || value === 0 && exact.n !== 0n) return null;
    return { value, text, exact };
  }
  function unitKey(unit) { return typeof unit === "string" ? unit.trim().replace(/[µμ]/g, "u").toLowerCase() : ""; }
  function creatinineFactor(unit) {
    switch (unitKey(unit)) {
      case "mg/dl": return fraction(1n);
      case "mg/l": return fraction(1n, 10n);
      case "umol":
      case "umol/l": return fraction(5n, 442n);
      case "mmol":
      case "mmol/l": return fraction(2500n, 221n);
      default: return null;
    }
  }
  function sampleState(value) {
    if (value === false || value === "no" || value === "different") return "different";
    if (value === true || value === "yes" || value === "confirmed") return "confirmed";
    return "assumed";
  }
  function fact(value) { return typeof value === "boolean" ? value : null; }
  // A direct numeric age is an explicitly supplied point. Document ages are
  // completed years/months, so their resolution is retained as an interval.
  function ageData(input) {
    const source = input.ageContext;
    const point = typeof input.ageYears === "number" && Number.isFinite(input.ageYears) && input.ageYears >= 0 && input.ageYears <= 120 ? input.ageYears : null;
    if (source && typeof source === "object" && !Array.isArray(source)) {
      const ageContext = {};
      for (const key of ["valid", "years", "months", "daysOfLife", "totalMonths", "exactYears", "precision", "minimumMonths", "maximumMonths", "maximumExclusive", "rawYears", "rawMonths", "rawDays"]) {
        const value = source[key];
        if (value === null || ["string", "number", "boolean"].includes(typeof value)) ageContext[key] = typeof value === "number" && !Number.isFinite(value) ? null : value;
      }
      if (source.valid !== true || !Number.isFinite(source.exactYears) || source.exactYears < 0 || source.exactYears > 120) return { ageYears: null, ageContext };
      const minimum = source.minimumMonths ?? source.exactYears * 12;
      const maximum = source.maximumMonths ?? minimum;
      if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum < 0 || maximum < minimum || maximum > 1452) return { ageYears: null, ageContext: { ...ageContext, valid: false } };
      return { ageYears: source.exactYears, ageContext: { ...ageContext, minimumMonths: minimum, maximumMonths: maximum, maximumExclusive: source.maximumExclusive === true } };
    }
    return { ageYears: point, ageContext: point === null ? null : { valid: true, exactYears: point, precision: "stated-point", minimumMonths: point * 12, maximumMonths: point * 12, maximumExclusive: false } };
  }
  function inputData(input) {
    input = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const known = key => fact(Object.hasOwn(input, key) ? input[key] : input.knownFacts?.[key]);
    return {
      urinePotassium: input.urinePotassium ?? input.urineAnalyte ?? "",
      serumPotassium: input.serumPotassium ?? input.serumAnalyte ?? "",
      urineCreatinine: input.urineCreatinine ?? "", urineCreatinineUnit: input.urineCreatinineUnit ?? "",
      serumCreatinine: input.serumCreatinine ?? "", serumCreatinineUnit: input.serumCreatinineUnit ?? "",
      ...ageData(input),
      sameUrineSpecimen: sampleState(input.sameUrineSpecimen), pairedSameTime: sampleState(input.pairedSameTime),
      diureticUse: known("diureticUse"), knownCKD: known("knownCKD"), knownAKI: known("knownAKI"),
      potassiumSupplementation: known("potassiumSupplementation"), rapidlyChangingCreatinine: known("rapidlyChangingCreatinine"),
    };
  }
  function exactOf(value) {
    if (!value || typeof value.numerator !== "string" || typeof value.denominator !== "string" || !/^\d+$/.test(value.numerator) || !/^[1-9]\d*$/.test(value.denominator)) return null;
    if (value.numerator.length > 6000 || value.denominator.length > 6000) return null;
    return fraction(BigInt(value.numerator), BigInt(value.denominator));
  }
  function compactDecimal(value, digits) {
    const scientific = value < 0.0001 || value >= 1000000;
    const text = scientific ? value.toExponential(digits - 1) : value.toFixed(Math.max(0, digits - 1 - Math.floor(Math.log10(value))));
    const parts = text.split("e");
    const main = parts[0].includes(".") ? parts[0].replace(/0+$/, "").replace(/\.$/, "") : parts[0];
    return parts[1] ? `${main}e${Number(parts[1])}` : main;
  }
  function formattedValue(value, exactValue, thresholds = []) {
    if (!Number.isFinite(value) || value < 0) return { text: "", boundary: "" };
    if (value === 0) return { text: "0", boundary: "" };
    const exact = exactOf(exactValue);
    const checks = thresholds.map(item => parseValue(item)).filter(Boolean).map(item => item.exact);
    let text = "";
    for (let digits = 4; digits <= 17; digits += 1) {
      text = compactDecimal(value, digits);
      const rounded = decimalFraction(text);
      if (!exact || checks.every(threshold => compare(exact, threshold) === compare(rounded, threshold))) return { text: text.replace(".", ","), boundary: "" };
    }
    // Inputs may encode a difference smaller than Number's resolution. Preserve
    // the exact relation instead of displaying a value equal to the other band.
    const rounded = decimalFraction(text);
    const crossed = checks.find(threshold => compare(exact, threshold) !== compare(rounded, threshold));
    if (crossed) {
      const limit = numberOf(crossed), relation = compare(exact, crossed) < 0 ? "<" : ">";
      return { text: `${relation}${String(limit).replace(".", ",")}`, boundary: "Dokładna relacja do progu jest zachowana; pełny iloraz wyniku pozostaje w szczegółach zapisu." };
    }
    return { text: text.replace(".", ","), boundary: "" };
  }
  function formatValue(value, exactValue, thresholds) { return formattedValue(value, exactValue, thresholds).text; }
  function compute(input) {
    const data = inputData(input);
    const fail = code => freeze({ ok: false, valid: false, valuePct: null, rawValue: null, errorCode: code, error: ERRORS[code], input: data });
    if (data.sameUrineSpecimen === "different" || data.pairedSameTime === "different") return fail("different-specimens");
    const fields = [data.urinePotassium, data.serumPotassium, data.urineCreatinine, data.serumCreatinine];
    if (fields.some(absent)) return fail("missing-concentration");
    const values = fields.map(parseValue);
    if (values.some(value => !value) || values.slice(1).some(value => value.value <= 0)) return fail("invalid-concentration");
    const urineFactor = creatinineFactor(data.urineCreatinineUnit), serumFactor = creatinineFactor(data.serumCreatinineUnit);
    if (!urineFactor || !serumFactor || input?.urinePotassiumUnit != null && !["mmol/l", "meq/l"].includes(unitKey(input.urinePotassiumUnit)) || input?.serumPotassiumUnit != null && !["mmol/l", "meq/l"].includes(unitKey(input.serumPotassiumUnit))) return fail("invalid-unit");
    const [uK, sK, uCr, sCr] = values.map(value => value.exact);
    const exact = times(fraction(100n), over(times(uK, times(sCr, serumFactor)), times(sK, times(uCr, urineFactor))));
    const valuePct = numberOf(exact);
    if (!Number.isFinite(valuePct) || valuePct < 0 || exact.n > 0n && valuePct === 0) return fail("numeric-range");
    const exactValue = { numerator: String(exact.n), denominator: String(exact.d) };
    return freeze({ ok: true, valid: true, valuePct, rawValue: valuePct, unit: "%", exactValue, display: formattedValue(valuePct, exactValue), input: data, errorCode: "", error: "" });
  }
  function validPolicy(policy) {
    const positive = value => parseValue(value)?.value > 0;
    return policy?.quantity === "fractional-excretion-potassium" && policy.unit === "%" && typeof policy.id === "string" && Number.isInteger(policy.version) &&
      Array.isArray(policy.profiles) && policy.profiles.length > 0 && policy.profiles.every(profile =>
        typeof profile.id === "string" && ["infant", "child", "adult"].includes(profile.context) && ["healthy-percentile", "observed-study-range"].includes(profile.kind) && typeof profile.ageLabel === "string" &&
        Number.isFinite(profile.minimumAgeMonthsInclusive) && profile.minimumAgeMonthsInclusive >= 0 && Number.isFinite(profile.maximumAgeMonthsInclusive) && profile.maximumAgeMonthsInclusive >= profile.minimumAgeMonthsInclusive &&
        positive(profile.lower) && positive(profile.upper) && compare(parseValue(profile.lower).exact, parseValue(profile.upper).exact) < 0 && profile.lowerInclusive === true && profile.upperInclusive === true &&
        profile.population && typeof profile.population.label === "string" && Array.isArray(profile.sourceIds) && profile.sourceIds.length > 0 &&
        (profile.kind !== "observed-study-range" || positive(profile.serumPotassium?.lower) && positive(profile.serumPotassium?.upper) && positive(profile.serumCreatinineUmolL?.lower) && positive(profile.serumCreatinineUmolL?.upper) &&
          compare(parseValue(profile.serumPotassium.lower).exact, parseValue(profile.serumPotassium.upper).exact) <= 0 &&
          compare(parseValue(profile.serumCreatinineUmolL.lower).exact, parseValue(profile.serumCreatinineUmolL.upper).exact) <= 0)) &&
      positive(policy.pediatricComparisonPotassiumWindow?.lower) && positive(policy.pediatricComparisonPotassiumWindow?.upper) && positive(policy.pediatricComparisonPotassiumWindow?.lowContextThreshold) &&
      compare(parseValue(policy.pediatricComparisonPotassiumWindow.lower).exact, parseValue(policy.pediatricComparisonPotassiumWindow.upper).exact) <= 0 &&
      Array.isArray(policy.sources) && policy.sources.length > 0 && policy.sources.every(source => typeof source.id === "string" && typeof source.label === "string" && typeof source.url === "string") &&
      policy.profiles.every(profile => profile.sourceIds.every(id => policy.sources.some(source => source.id === id))) &&
      policy.notes && ["referenceLabel", "inactiveReferenceLabel", "adultReferenceLabel", "ambiguousReferenceLabel", "within", "outside", "hypokalemia", "potassiumContext", "adult", "ambiguousAge", "noAge", "outsideAge", "neonate", "confounders", "noPolicy"].every(key => typeof policy.notes[key] === "string");
  }
  function profileIntersects(age, profile) {
    if (!age?.valid) return false;
    return profile.maximumAgeMonthsInclusive >= age.minimumMonths &&
      (age.maximumExclusive ? profile.minimumAgeMonthsInclusive < age.maximumMonths : profile.minimumAgeMonthsInclusive <= age.maximumMonths);
  }
  function intervalCovered(age, profiles) {
    if (!age?.valid || !profiles.length) return false;
    let covered = age.minimumMonths;
    for (const profile of [...profiles].sort((a, b) => a.minimumAgeMonthsInclusive - b.minimumAgeMonthsInclusive)) {
      if (profile.minimumAgeMonthsInclusive > covered) return false;
      covered = Math.max(covered, profile.maximumAgeMonthsInclusive);
      if (covered >= age.maximumMonths) return true;
    }
    return false;
  }
  function referenceFor(profile, active = false) {
    return {
      id: profile.id, kind: profile.kind, label: profile.kind === "healthy-percentile" ? "Norma dla wieku" : "Zakres w badaniu dorosłych",
      text: `${String(profile.lower).replace(".", ",")}–${String(profile.upper).replace(".", ",")}%`, lower: Number(profile.lower), upper: Number(profile.upper),
      lowerInclusive: true, upperInclusive: true, active, ageLabel: profile.ageLabel,
      population: copy(profile.population), sourceIds: copy(profile.sourceIds),
      percentiles: profile.percentiles ? copy(profile.percentiles) : null,
    };
  }
  function inWindow(exact, window) {
    return compare(exact, parseValue(window.lower).exact) >= 0 && compare(exact, parseValue(window.upper).exact) <= 0;
  }
  function evaluate(input, policy) {
    const result = compute(input), data = result.input, hasPolicy = validPolicy(policy);
    const knownFacts = Object.fromEntries(["diureticUse", "knownCKD", "knownAKI", "potassiumSupplementation", "rapidlyChangingCreatinine"].map(key => [key, data[key]]));
    const factLabels = { diureticUse: "Stosowanie diuretyków", knownCKD: "Znana przewlekła choroba nerek", knownAKI: "Podejrzenie AKI", potassiumSupplementation: "Suplementacja potasu", rapidlyChangingCreatinine: "Szybko zmieniająca się kreatynina" };
    const knownCautions = Object.entries(factLabels).filter(([key]) => knownFacts[key] === true).map(([, label]) => label);
    const snapshot = {
      schema: "clcr-fek", version: 1, engineVersion: ENGINE_VERSION, valid: result.ok, rawValue: result.valuePct, unit: "%", exactValue: result.exactValue || null,
      input: copy(data), display: result.display || { text: "", boundary: "" },
      status: "unassessed", statusText: "", tone: "neutral", outOfRange: null, category: null, context: "unknown",
      referenceAvailable: false, referenceActive: false, reference: null, references: [], educationalReferences: hasPolicy ? policy.profiles.map(profile => referenceFor(profile)) : [],
      referenceLabel: "Porównanie", referenceText: "Brak zweryfikowanej normy", referenceHint: "",
      knownFacts, cautions: [...knownCautions], interpretation: "", errorCode: result.errorCode, error: result.error,
      sample: { sameUrineSpecimen: data.sameUrineSpecimen, pairedSameTime: data.pairedSameTime },
      policy: hasPolicy ? { id: policy.id, version: policy.version } : null,
      population: hasPolicy ? copy(policy.population || null) : null, sources: hasPolicy ? copy(policy.sources) : [],
      conversion: copy(CONVERSION_CONSTANTS), restrictions: hasPolicy ? copy(policy.restrictions || {}) : {}, notes: hasPolicy ? copy(policy.notes) : {},
    };
    if (!result.ok) return freeze(snapshot);
    if (!hasPolicy) { snapshot.interpretation = "Nie dobrano polityki porównania FEK. Liczba pozostaje dostępna; oceń ją z potasem we krwi i czynnością nerek."; return freeze(snapshot); }
    const age = data.ageContext, exact = exactOf(result.exactValue);
    const pediatricProfiles = policy.profiles.filter(profile => profile.kind === "healthy-percentile");
    const pediatricMatches = pediatricProfiles.filter(profile => profileIntersects(age, profile));
    const pediatricCovered = intervalCovered(age, pediatricMatches);
    const adultMatches = policy.profiles.filter(profile => profile.kind === "observed-study-range" && profileIntersects(age, profile) && intervalCovered(age, [profile]));
    const infantProfiles = pediatricProfiles.filter(profile => profile.context === "infant");
    const minimumInfantAge = Math.min(...infantProfiles.map(profile => profile.minimumAgeMonthsInclusive));
    const neonatal = infantProfiles.length > 0 && age?.valid === true && (age.maximumMonths < minimumInfantAge || age.maximumMonths === minimumInfantAge && age.maximumExclusive);
    const serumK = parseValue(data.serumPotassium).exact;
    const serumCr = times(times(parseValue(data.serumCreatinine).exact, creatinineFactor(data.serumCreatinineUnit)), parseValue(CONVERSION_CONSTANTS.creatinineUmolPerMgDl).exact);
    const lowPotassium = !neonatal && compare(serumK, parseValue(policy.pediatricComparisonPotassiumWindow.lowContextThreshold).exact) < 0;
    const potassiumInWindow = inWindow(serumK, policy.pediatricComparisonPotassiumWindow);
    const confounded = Object.values(knownFacts).some(value => value === true);
    const referenceActive = pediatricCovered && pediatricMatches.length === 1 && potassiumInWindow && !confounded;
    const adultObserved = !confounded ? adultMatches.find(profile => inWindow(serumK, profile.serumPotassium) && inWindow(serumCr, profile.serumCreatinineUmolL)) : null;
    snapshot.context = pediatricCovered ? pediatricMatches.length > 1 ? "ambiguous-age" : pediatricMatches[0].context : neonatal ? "neonate" : adultMatches.length ? "adult" : age?.valid ? "outside-age" : "unknown";
    snapshot.interpretation = neonatal ? policy.notes.neonate : age?.valid ? policy.notes.outsideAge : policy.notes.noAge;
    if (pediatricCovered) {
      snapshot.references = pediatricMatches.map(profile => referenceFor(profile, referenceActive));
      snapshot.referenceAvailable = true;
      snapshot.referenceActive = referenceActive;
      snapshot.population = copy(snapshot.references.length === 1 ? snapshot.references[0].population : policy.population);
      snapshot.referenceLabel = pediatricMatches.length > 1 ? policy.notes.ambiguousReferenceLabel : referenceActive ? policy.notes.referenceLabel : policy.notes.inactiveReferenceLabel;
      snapshot.referenceText = pediatricMatches.length > 1 ? "Dwa zakresy dla wieku" : snapshot.references[0].text;
      snapshot.referenceHint = pediatricMatches.length > 1 ? "Granica przedziałów wieku" : "Orientacyjnie · zdrowa populacja";
      snapshot.interpretation = policy.notes.ambiguousAge;
      if (referenceActive) {
        const band = pediatricMatches[0];
        const category = compare(exact, parseValue(band.lower).exact) < 0 ? "below" : compare(exact, parseValue(band.upper).exact) > 0 ? "above" : "within";
        snapshot.status = category; snapshot.category = category; snapshot.outOfRange = category !== "within";
        snapshot.statusText = category === "below" ? "Poniżej zakresu dla wieku" : category === "above" ? "Powyżej zakresu dla wieku" : "W zakresie dla wieku";
        snapshot.tone = category === "within" ? "normal" : "warning";
        snapshot.interpretation = category === "within" ? policy.notes.within : policy.notes.outside;
      }
    } else if (adultObserved) {
      snapshot.references = [referenceFor(adultObserved)]; snapshot.referenceAvailable = true;
      snapshot.population = copy(adultObserved.population);
      snapshot.referenceLabel = policy.notes.adultReferenceLabel; snapshot.referenceText = snapshot.references[0].text; snapshot.referenceHint = `Obserwowany · ${adultObserved.ageLabel}`;
      snapshot.interpretation = policy.notes.adult;
    }
    if (lowPotassium) {
      snapshot.context = "hypokalemia"; snapshot.cautions.unshift("Obniżony potas we krwi"); snapshot.interpretation = policy.notes.hypokalemia;
      snapshot.referenceHint = pediatricCovered ? "Nie służy do oceny hipokaliemii" : "Bez automatycznej klasyfikacji FEK";
      if (!pediatricCovered) { snapshot.referenceLabel = "Porównanie"; snapshot.referenceText = "Ocena w hipokaliemii"; }
    } else if (pediatricCovered && !potassiumInWindow) {
      snapshot.context = "potassium-context"; snapshot.cautions.unshift("Potas we krwi poza zakresem porównania"); snapshot.interpretation = policy.notes.potassiumContext;
      snapshot.referenceHint = `Porównanie przy K ${String(policy.pediatricComparisonPotassiumWindow.lower).replace(".", ",")}–${String(policy.pediatricComparisonPotassiumWindow.upper).replace(".", ",")} mmol/L`;
    }
    if (confounded) {
      snapshot.context = "confounders";
      snapshot.interpretation = `${lowPotassium ? policy.notes.hypokalemia + " " : ""}${policy.notes.confounders}`;
      snapshot.references = []; snapshot.referenceAvailable = false; snapshot.referenceActive = false;
      snapshot.referenceLabel = "Porównanie"; snapshot.referenceText = "Czynność nerek i leczenie"; snapshot.referenceHint = "Bez normy zdrowej populacji";
    }
    snapshot.reference = snapshot.references[0] || null;
    snapshot.display = formattedValue(result.valuePct, result.exactValue, snapshot.references.flatMap(reference => [String(reference.lower), String(reference.upper)]));
    return freeze(snapshot);
  }
  function readInputFromDocument(documentRef) {
    const doc = documentRef || root?.document || null;
    const control = id => doc?.getElementById(id);
    const value = (id, fallback = "") => control(id) ? control(id).value : fallback;
    const clinical = doc?.defaultView?.ClcrClinicalSafety || root?.ClcrClinicalSafety;
    const rawYears = value("age"), rawMonths = value("ageMonths"), rawDays = value("ageDays");
    const parsedAge = clinical?.readAgeFromDocument?.(doc) || null;
    let ageContext = parsedAge ? copy(parsedAge) : { valid: false, exactYears: null };
    if (ageContext.valid) {
      const hasMonths = !absent(rawMonths), hasDays = !absent(rawDays) && ageContext.totalMonths === 0;
      const minimumMonths = hasDays ? ageContext.exactYears * 12 : ageContext.totalMonths;
      const maximumMonths = hasDays ? (Number(rawDays) + 1) * 12 / 365.2425 : hasMonths ? minimumMonths + 1 : minimumMonths + 12;
      ageContext = { ...ageContext, precision: hasDays ? "completed-days" : hasMonths ? "completed-months" : "completed-years", minimumMonths, maximumMonths, maximumExclusive: true };
    }
    ageContext = { ...ageContext, rawYears, rawMonths, rawDays };
    const vault = doc?.defaultView?.__vildaClcrVersionValueVault || root?.__vildaClcrVersionValueVault;
    const answerValue = id => {
      const key = `ui_${id}_answer`, answerControl = control(key);
      if (answerControl) return answerControl.value;
      return vault && Object.prototype.hasOwnProperty.call(vault, key) ? vault[key] : "";
    };
    const knownFact = id => {
      const answer = answerValue(id);
      if (answer === "yes") return true;
      if (answer === "no") return false;
      if (answer === "unknown") return null;
      const checkbox = control(id);
      return checkbox ? checkbox.checked ? true : null : vault?.[id] === true ? true : null;
    };
    const legacyPair = id => {
      const answer = answerValue(id);
      if (answer === "no") return "different";
      if (answer === "unknown") return "assumed";
      const checkbox = control(id);
      return answer === "yes" || (checkbox ? checkbox.checked : vault?.[id] === true) ? "confirmed" : "assumed";
    };
    const sampleStatus = value("FENa_sample_status", typeof vault?.FENa_sample_status === "string" ? vault.FENa_sample_status : "");
    let sameUrineSpecimen = legacyPair("spotSameSpecimen"), pairedSameTime = legacyPair("spotPairedChemistry");
    if (sampleStatus === "different-urine") sameUrineSpecimen = "different";
    if (sampleStatus === "different-time") pairedSameTime = "different";
    if (sampleStatus === "confirmed") {
      if (sameUrineSpecimen !== "different") sameUrineSpecimen = "confirmed";
      if (pairedSameTime !== "different") pairedSameTime = "confirmed";
    }
    const creatinineState = value("creatinineState", typeof vault?.creatinineState === "string" ? vault.creatinineState : "unknown");
    return {
      urinePotassium: value("U_K_spot"), serumPotassium: value("S_K_spot"),
      urineCreatinine: value("Ucr_spot"), urineCreatinineUnit: value("Ucr_spot_unit", "mg/dl"),
      serumCreatinine: value("Scr_spot"), serumCreatinineUnit: value("Scr_spot_unit", "mg/dl"),
      ageYears: ageContext.valid ? ageContext.exactYears : null, ageContext, sameUrineSpecimen, pairedSameTime,
      diureticUse: knownFact("spotDiureticUse"), knownCKD: knownFact("spotKnownCKD"), knownAKI: knownFact("suspectedAKI"),
      rapidlyChangingCreatinine: creatinineState === "rapidlyChanging" ? true : creatinineState === "stable" ? false : null,
      potassiumSupplementation: null,
    };
  }
  return Object.freeze({ ENGINE_VERSION, CONVERSION_CONSTANTS, compute, evaluate, formatValue, readInputFromDocument });
});
