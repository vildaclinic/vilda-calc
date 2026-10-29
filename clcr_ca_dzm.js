/* Calcium excretion: exact decimal arithmetic and source-injected references. */
(function (root, factory) {
  const api = factory(root);
  if (root) root.VildaClcrCaDzm = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";
  const ENGINE_VERSION = 1, MOLAR_MASS = 40.078;
  const FIELD_IDS = Object.freeze(["CA_inputMode", "CA_concentration", "CA_concentrationUnit", "CA_volume", "CA_volumeUnit", "CA_reportedValue", "CA_reportedUnit", "CA_collectionHours", "CA_collectionSource", "CA_clinicalMode"]);
  const COLLECTION_FIELDS = Object.freeze(["collectionStartVoidDiscarded", "collectionFinalVoidIncluded", "collectionNoMissedVoids", "collectionNoSpillage", "collectionNoExtraVoids", "collectionStorageFollowed"]);
  const CONTEXT_FIELD_IDS = Object.freeze(["weight", "age", "ageMonths", "ageDays", "sex", ...COLLECTION_FIELDS, ...COLLECTION_FIELDS.map(id => "ui_" + id + "_answer"), "collectionStartAt", "collectionEndAt", "Cl24CollectionProblem"]);
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
  const object = value => Boolean(value && typeof value === "object" && !Array.isArray(value));
  const absent = value => value == null || typeof value === "string" && value.trim() === "";
  const finite = value => typeof value === "number" && Number.isFinite(value);
  const copy = value => Array.isArray(value) ? value.map(copy) : object(value) ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)])) : value;
  function freeze(value) { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  function primitive(value) { return value == null ? "" : typeof value === "string" ? value.length <= 512 ? value : "[invalid value]" : typeof value === "number" ? finite(value) ? value : String(value) : "[invalid value]"; }
  function gcd(a, b) { a = a < 0n ? -a : a; while (b) { const r = a % b; a = b; b = r; } return a || 1n; }
  function reduced(n, d) { const g = gcd(n, d); return { n: n / g, d: d / g }; }
  function fraction(text) {
    const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(String(text).replace(",", ".").replace(/−/g, "-"));
    if (!match || !(match[2] || match[3])) return null;
    const exponent = Number(match[4] || 0) - (match[3] || "").length;
    if (!Number.isInteger(exponent) || Math.abs(exponent) > 1024) return null;
    let n = BigInt((match[1] === "-" ? "-" : "") + ((match[2] || "0") + (match[3] || ""))), d = 1n;
    if (exponent >= 0) n *= 10n ** BigInt(exponent); else d = 10n ** BigInt(-exponent);
    return reduced(n, d);
  }
  const mul = (a, b) => reduced(a.n * b.n, a.d * b.d);
  const div = (a, b) => reduced(a.n * b.d, a.d * b.n);
  const cmp = (a, b) => a.n * b.d < b.n * a.d ? -1 : a.n * b.d > b.n * a.d ? 1 : 0;
  const exact = a => a === null ? null : { numerator: String(a.n), denominator: String(a.d) };
  function fromExact(value) {
    if (!object(value) || !/^-?\d{1,4096}$/.test(value.numerator || "") || !/^\d{1,4096}$/.test(value.denominator || "") || BigInt(value.denominator) <= 0n) return null;
    return reduced(BigInt(value.numerator), BigInt(value.denominator));
  }
  function roundedQuotient(n, d) {
    const q = n / d, r = n % d;
    return q + (r * 2n > d || r * 2n === d && q % 2n === 1n ? 1n : 0n);
  }
  function numberOf(value) {
    if (value.n === 0n) return 0;
    const negative = value.n < 0n, n = negative ? -value.n : value.n, d = value.d;
    let exponent = n.toString(2).length - d.toString(2).length;
    if (exponent >= 0 ? n < d * 2n ** BigInt(exponent) : n * 2n ** BigInt(-exponent) < d) exponent -= 1;
    if (exponent > 1023) return negative ? -Infinity : Infinity;
    if (exponent < -1075) return negative ? -0 : 0;
    const scale = exponent < -1022 ? 1074 : 52 - exponent;
    const coefficient = scale >= 0 ? roundedQuotient(n * 2n ** BigInt(scale), d) : roundedQuotient(n, d * 2n ** BigInt(-scale));
    const result = Number(coefficient) * 2 ** -scale;
    return negative ? -result : result;
  }
  function parseValue(value) {
    if (!["string", "number"].includes(typeof value)) return null;
    const text = String(value).trim().replace(",", ".");
    if (!text || text.length > 512) return null;
    const rational = fraction(text), number = Number(text);
    if (!rational || !finite(number) || number === 0 && rational.n !== 0n) return null;
    const represented = fraction(String(number));
    return { value: Object.is(number, -0) ? 0 : number, text, exact: exact(rational), lossless: Boolean(represented && cmp(rational, represented) === 0) };
  }
  function decimal(value, places) {
    const negative = value.n < 0n, n = negative ? -value.n : value.n;
    let r = n % value.d, result = String(n / value.d), digits = "";
    for (let i = 0; i < places && r; i += 1) { r *= 10n; digits += String(r / value.d); r %= value.d; }
    if (digits) result += "." + digits.replace(/0+$/, "");
    return (negative ? "-" : "") + result.replace(/\.$/, "");
  }
  function short(value, digits = 12) {
    if (!finite(value)) return "";
    return (value !== 0 && (Math.abs(value) < 1e-7 || Math.abs(value) >= 1e12) ? String(value) : value.toLocaleString("pl-PL", { useGrouping: false, maximumFractionDigits: digits })).replace(".", ",");
  }
  function formatValue(value, exactValue, bounds = []) {
    if (!finite(value)) return "";
    const rational = fromExact(exactValue) || fraction(String(value));
    if (numberOf(rational) !== value) return "";
    const comparisons = [fraction("0"), ...bounds.map(item => fromExact(item)).filter(Boolean)];
    const correct = text => { const shown = fraction(text); return shown && comparisons.every(bound => { const side = cmp(rational, bound); return side === 0 || cmp(shown, bound) === side; }); };
    const candidate = short(value, 2);
    if (candidate.length <= 120 && correct(candidate)) return candidate;
    for (const places of [16, 24, 32, 48, 64, 96, 120]) { const text = decimal(rational, places).replace(".", ","); if (text.length <= 120 && correct(text)) return text; }
    return "";
  }
  function facts(input) {
    const result = {};
    for (const id of COLLECTION_FIELDS) {
      const answer = input["ui_" + id + "_answer"];
      if (answer === "yes" || answer === "no") { result[id] = answer === "yes"; result["ui_" + id + "_answer"] = answer; }
      else if (input[id] === true) result[id] = true;
    }
    if (input.Cl24CollectionProblem === true) result.Cl24CollectionProblem = true;
    for (const [key, value] of Object.entries(object(input.knownFacts) ? input.knownFacts : {})) {
      if (!CONTEXT_FIELD_IDS.includes(key)) continue;
      if (value == null || typeof value === "boolean" || finite(value) || typeof value === "string" && value.length <= 512) result[key] = value;
    }
    return result;
  }
  function inputData(input) {
    const data = object(input) ? input : {};
    const rawHours = own(data, "hours") ? primitive(data.hours) : "";
    const durationNeedsConfirmation = absent(rawHours) && (data.durationNeedsConfirmation === true || data.durationSource === "historical-missing");
    const hours = !durationNeedsConfirmation && absent(rawHours) ? "24" : rawHours;
    const durationSource = durationNeedsConfirmation ? "historical-missing" : absent(rawHours) || data.durationSource === "assumed-24h" && Number(String(hours).replace(",", ".")) === 24 ? "assumed-24h" : ["hours", "captured", "legacy-dates"].includes(data.durationSource) ? data.durationSource : "hours";
    return { clinicalContext: own(data, "clinicalContext") ? primitive(data.clinicalContext) : "general", mode: own(data, "mode") ? primitive(data.mode) : "concentration", concentration: primitive(data.concentration), concentrationUnit: own(data, "concentrationUnit") ? primitive(data.concentrationUnit) : "mmol/L", volume: primitive(data.volume), volumeUnit: own(data, "volumeUnit") ? primitive(data.volumeUnit) : "mL", reportedValue: primitive(data.reportedValue), reportedUnit: own(data, "reportedUnit") ? primitive(data.reportedUnit) : "mg/24h", hours, durationSource, durationNeedsConfirmation, weightKg: primitive(data.weightKg), ageYears: absent(data.ageYears) ? null : primitive(data.ageYears), sex: typeof data.sex === "string" && ["M", "F"].includes(data.sex.toUpperCase()) ? data.sex.toUpperCase() : null, agePrecision: data.agePrecision === "completed-years" ? "completed-years" : "exact", knownFacts: facts(data) };
  }
  function ageFrom(values, context) {
    if (own(values, "age")) {
      if (absent(values.age)) return null;
      const years = parseValue(values.age), months = absent(values.ageMonths) ? { value: 0, lossless: true } : parseValue(values.ageMonths);
      if (!years?.lossless || !months?.lossless || years.value < 0 || months.value < 0 || months.value >= 12) return null;
      if (years.value === 0 && months.value === 0 && !absent(values.ageDays)) { const days = parseValue(values.ageDays); if (!days?.lossless || days.value < 0) return null; return days.value / 365.25; }
      return years.value + months.value / 12;
    }
    return context.ageYears ?? context.ageContext?.exactYears ?? null;
  }
  function inputFromValues(values, context) {
    const data = object(values) ? values : {}, supplied = object(context) ? context : {};
    let hours = own(data, "CA_collectionHours") ? data.CA_collectionHours : own(supplied, "collectionHours") ? supplied.collectionHours : finite(supplied.durationMinutes) ? supplied.durationMinutes / 60 : finite(supplied.collectionAnalysis?.durationMinutes) ? supplied.collectionAnalysis.durationMinutes / 60 : "24";
    const historicalDuration = data.CA_durationNeedsConfirmation === true || data.CA_collectionSource === "historical-missing" || (!own(data, "CA_collectionSource") && absent(hours) && (!absent(data.collectionStartAt) || !absent(data.collectionEndAt)));
    if (!own(data, "CA_collectionHours") && !own(supplied, "collectionHours") && !finite(supplied.durationMinutes) && !finite(supplied.collectionAnalysis?.durationMinutes) && (!absent(data.collectionStartAt) || !absent(data.collectionEndAt))) { hours = ""; }
    const durationNeedsConfirmation = historicalDuration || (absent(hours) && !own(data, "CA_collectionSource") && (!absent(data.collectionStartAt) || !absent(data.collectionEndAt)));
    const knownFacts = { ...facts(supplied), ...facts(data) };
    for (const id of ["age", "ageMonths", "ageDays", "collectionStartAt", "collectionEndAt"]) if (own(data, id)) knownFacts[id] = primitive(data[id]);
    return inputData({ clinicalContext: own(data, "CA_clinicalMode") ? data.CA_clinicalMode : "general", mode: own(data, "CA_inputMode") ? data.CA_inputMode : "concentration", concentration: own(data, "CA_concentration") ? data.CA_concentration : data.U_Ca ?? "", concentrationUnit: own(data, "CA_concentrationUnit") ? data.CA_concentrationUnit : "mmol/L", volume: own(data, "CA_volume") ? data.CA_volume : data.V24 ?? "", volumeUnit: own(data, "CA_volumeUnit") ? data.CA_volumeUnit : "mL", reportedValue: data.CA_reportedValue ?? "", reportedUnit: own(data, "CA_reportedUnit") ? data.CA_reportedUnit : "mg/24h", hours, durationSource: data.CA_collectionSource || supplied.durationSource, durationNeedsConfirmation, weightKg: data.weight ?? supplied.weightKg ?? "", ageYears: ageFrom(data, supplied), agePrecision: own(data, "age") && Number.isInteger(parseValue(data.age)?.value) && absent(data.ageMonths) && absent(data.ageDays) ? "completed-years" : supplied.agePrecision, sex: own(data, "sex") ? data.sex : supplied.sex, knownFacts });
  }
  function readInputFromDocument(documentRef, context) {
    const doc = documentRef || root?.document, vault = doc?.defaultView?.__vildaClcrVersionValueVault || root?.__vildaClcrVersionValueVault || {}, values = {};
    for (const id of [...FIELD_IDS, ...CONTEXT_FIELD_IDS, "U_Ca", "V24"]) {
      const control = doc?.getElementById(id);
      if (control) values[id] = control.type === "checkbox" || control.type === "radio" ? control.checked === true : control.value;
      else if (own(vault, id)) values[id] = vault[id];
    }
    return inputFromValues(values, context);
  }
  const INPUT_LABELS = Object.freeze({ concentration: "stężenie wapnia", volume: "objętość zbiórki", weightKg: "masa ciała", hours: "czas zbiórki", reportedValue: "gotowe wydalanie" });
  const INPUT_IDS = Object.freeze({ concentration: "CA_concentration", volume: "CA_volume", weightKg: "weight", hours: "CA_collectionHours", reportedValue: "CA_reportedValue" });
  function compute(input, policy) {
    const data = inputData(input), missingIds = [], invalidIds = [], problems = [];
    const fail = (code, message, blocked = false) => freeze({ ok: false, valid: false, rawValue: null, value: null, dailyMg: null, perKg: null, unit: "", display: { text: "", boundary: "" }, input: data, missingIds, invalidIds, errorCode: code, error: message, blocked });
    const contradictions = COLLECTION_FIELDS.filter(id => data.knownFacts[id] === false || data.knownFacts["ui_" + id + "_answer"] === "no");
    if (data.knownFacts.Cl24CollectionProblem === true) contradictions.push("Cl24CollectionProblem");
    if (contradictions.length) { invalidIds.push(...contradictions); return fail("collection-conflict", "Podano problem kompletności lub protokołu zbiórki. Nie można traktować danych jako prawidłowej pełnej zbiórki dobowej.", true); }
    if (!["general", "hypo", "phpt"].includes(data.clinicalContext)) { invalidIds.push("CA_clinicalMode"); return fail("invalid-clinical-context", "Wybierz dostępny kontekst interpretacji."); }
    if (!["concentration", "reported"].includes(data.mode)) { invalidIds.push("CA_inputMode"); return fail("invalid-mode", "Wybierz sposób podania wyniku."); }
    function parseField(key, positive, required) {
      if (absent(data[key])) { if (required) { missingIds.push(INPUT_IDS[key]); problems.push({ code: "missing-" + (key === "weightKg" ? "weight" : key), message: "Uzupełnij pole: " + INPUT_LABELS[key] + ".", missing: true }); } return null; }
      const parsed = parseValue(data[key]);
      if (!parsed || parsed.value < 0 || positive && parsed.value === 0) { invalidIds.push(INPUT_IDS[key]); problems.push({ code: "invalid-" + (key === "weightKg" ? "weight" : key), message: "Sprawdź pole: " + INPUT_LABELS[key] + (positive ? ". Wartość musi być większa od 0." : ". Wpisz nieujemną liczbę.") }); return null; }
      if (!parsed.lossless) { invalidIds.push(INPUT_IDS[key]); problems.push({ code: "numeric-precision", message: "Sprawdź dokładność wpisu. Tej wartości nie można zapisać bez zmiany jej cyfr." }); return null; }
      return fromExact(parsed.exact);
    }
    const age = parseValue(data.ageYears), adultAge = finite(policy?.adultAgeMinimum) && policy.adultAgeMinimum >= 0 ? fraction(String(policy.adultAgeMinimum)) : null;
    const isChild = age?.lossless && age.value >= 0 && adultAge && cmp(fromExact(age.exact), adultAge) < 0;

    const needsWeight = false;
    const weight = parseField("weightKg", true, needsWeight);
    let daily = null, perKg = null, hours = fraction("24");
    if (data.mode === "concentration") {
      const concentration = parseField("concentration", false, true), volume = parseField("volume", true, true); hours = parseField("hours", true, true);
      const concentrationUnit = String(data.concentrationUnit).replace(/[µμ]/g, "u");
      const molar = fraction(String(MOLAR_MASS)), factors = { "mg/dL": fraction("10"), "mg/L": fraction("1"), "mmol/L": molar };
      if (!own(factors, concentrationUnit)) { invalidIds.push("CA_concentrationUnit"); problems.push({ code: "invalid-concentration-unit", message: "Wybierz obsługiwaną jednostkę stężenia." }); }
      if (!["mL", "L"].includes(data.volumeUnit)) { invalidIds.push("CA_volumeUnit"); problems.push({ code: "invalid-volume-unit", message: "Wybierz objętość w mL lub L." }); }
      if (!problems.length) { daily = div(mul(mul(mul(concentration, factors[concentrationUnit]), data.volumeUnit === "L" ? volume : div(volume, fraction("1000"))), fraction("24")), hours); perKg = weight ? div(daily, weight) : null; }
    } else {
      const reported = parseField("reportedValue", false, true), unit = String(data.reportedUnit).replace(/\s/g, "");
      if (!["mg/24h", "mmol/24h", "mg/kg/24h"].includes(unit)) { invalidIds.push("CA_reportedUnit"); problems.push({ code: "invalid-reported-unit", message: "Wybierz obsługiwaną jednostkę gotowego wydalania." }); }
      if (!problems.length) { if (unit === "mg/kg/24h") { perKg = reported; daily = weight ? mul(reported, weight) : null; } else { daily = unit === "mmol/24h" ? mul(reported, fraction(String(MOLAR_MASS))) : reported; perKg = weight ? div(daily, weight) : null; } }
    }
    if (problems.length) { const first = problems.find(problem => !problem.missing) || problems[0]; return fail(first.code, first.message); }
    const main = isChild && perKg || daily || perKg, rawValue = numberOf(main), dailyMg = daily ? numberOf(daily) : null, perKgValue = perKg ? numberOf(perKg) : null;
    if (!finite(rawValue) || rawValue === 0 && main.n !== 0n || daily && (!finite(dailyMg) || dailyMg === 0 && daily.n !== 0n) || perKg && (!finite(perKgValue) || perKgValue === 0 && perKg.n !== 0n)) return fail("numeric-range", "Wynik jest poza zakresem obliczeń. Sprawdź wartości i jednostki.");
    const shown = formatValue(rawValue, exact(main));
    if (!shown) return fail("numeric-precision", "Wyniku nie można pokazać z wymaganą dokładnością. Sprawdź liczbę cyfr wejścia.");
    return freeze({ ok: true, valid: true, rawValue, value: rawValue, dailyMg, perKg: perKgValue, unit: main === perKg ? "mg/kg/24 h" : "mg/24 h", exactMain: exact(main), exactDailyMg: exact(daily), exactPerKg: exact(perKg), display: { text: shown, boundary: "" }, hours: numberOf(hours), input: data, missingIds, invalidIds, errorCode: "", error: "", blocked: false });
  }
  function safeData(value, seen = new Set(), depth = 0) {
    if (value === null || typeof value === "boolean" || finite(value) || typeof value === "string" && value.length <= 10000) return true;
    if (!value || typeof value !== "object" || depth > 12 || seen.has(value)) return false;
    seen.add(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const valid = Object.values(descriptors).every(property => !property.get && !property.set && safeData(property.value, seen, depth + 1));
    seen.delete(value); return valid;
  }
  function validPolicy(policy) {
    if (!safeData(policy) || !object(policy) || policy.quantity !== "calcium-excretion" || typeof policy.id !== "string" || !policy.id || !Number.isInteger(policy.version) || policy.version < 1 || !finite(policy.adultAgeMinimum) || policy.adultAgeMinimum <= 0 || !object(policy.population) || typeof policy.population.label !== "string" || !Array.isArray(policy.profiles) || !policy.profiles.length || !Array.isArray(policy.sources) || !policy.sources.length || !object(policy.notes) || !object(policy.contexts)) return false;
    if (!policy.sources.every(source => object(source) && ["id", "label", "url"].every(key => typeof source[key] === "string" && source[key]))) return false;
    if (!["general", "hypo", "phpt"].every(context => object(policy.contexts[context]) && ["child", "adult"].every(role => object(policy.contexts[context][role]) && typeof policy.contexts[context][role].label === "string"))) return false;
    const ids = new Set();
    return policy.profiles.every(profile => {
      if (!object(profile) || ids.has(profile.id) || !["child", "adult"].includes(profile.role) || ![null, "general", "hypo", "phpt"].includes(profile.context) || !["upper", "criterion"].includes(profile.kind) || !finite(profile.ageLower) || profile.ageLower < 0 || profile.ageUpper !== null && (!finite(profile.ageUpper) || profile.ageUpper <= profile.ageLower) || !["ageLowerInclusive", "ageUpperInclusive", "lowerInclusive", "upperInclusive"].every(key => typeof profile[key] === "boolean") || ![null, "M", "F"].includes(profile.sex) || !["mg/kg/24 h", "mg/24 h"].includes(profile.unit) || profile.lower !== null || !finite(profile.upper) || profile.upper <= 0 || !["id", "label", "population", "text", "sourceId", "sourceLabel"].every(key => typeof profile[key] === "string" && profile[key]) || !policy.sources.some(source => source.id === profile.sourceId)) return false;
      ids.add(profile.id); return true;
    });
  }
  function profileFor(policy, age, sex, context) {
    if (!age?.lossless || age.value < 0) return null;
    const a = fromExact(age.exact);
    const matches = policy.profiles.filter(p => { const lo = cmp(a, fraction(String(p.ageLower))), hi = p.ageUpper === null ? -1 : cmp(a, fraction(String(p.ageUpper))); return (p.context === null || p.context === context) && (lo > 0 || lo === 0 && p.ageLowerInclusive) && (p.ageUpper === null || hi < 0 || hi === 0 && p.ageUpperInclusive) && (p.sex === null || p.sex === sex); });
    return matches.length === 1 ? matches[0] : null;
  }
  function evaluate(input, policy) {
    const hasPolicy = validPolicy(policy), result = compute(input, hasPolicy ? policy : undefined), data = result.input;
    const notes = hasPolicy ? copy(policy.notes) : {}, age = parseValue(data.ageYears);
    const populationCategory = hasPolicy && age?.lossless && age.value >= 0 ? age.value >= policy.adultAgeMinimum ? "adult" : "child" : null;
    const possibleProfiles = hasPolicy && age?.lossless && data.agePrecision === "completed-years" ? policy.profiles.filter(p => p.role === "child" && p.ageLower < age.value + 1 && (p.ageUpper === null || p.ageUpper > age.value)) : [];
    const ambiguousAge = new Set(possibleProfiles.map(p => p.unit + ":" + p.text)).size > 1;
    const profile = hasPolicy && result.valid && result.hours === 24 && !ambiguousAge ? profileFor(policy, age, data.sex, data.clinicalContext) : null;
    const clinical = hasPolicy && populationCategory ? policy.contexts[data.clinicalContext]?.[populationCategory] : null;
    let status = "unassessed", tone = "neutral", outOfRange = null, reference = null, active = false, bounds = [];
    let interpretation = notes.noPolicy || "Nie dobrano właściwego punktu odniesienia. Dostępny wynik liczbowy pozostaje bez automatycznej oceny.", statusText = notes.noPolicyTitle || "Wynik bez dobranego odniesienia";
    if (result.valid && profile) {
      const upper = fraction(String(profile.upper));
      const compared = fromExact(profile.unit === "mg/24 h" ? result.exactDailyMg : result.exactPerKg);
      if (compared && profile.unit === result.unit) {
        const side = cmp(compared, upper);
        status = profile.kind === "criterion" ? side > 0 ? "criterion-met" : "criterion-not-met" : side > 0 ? "high" : side === 0 && !profile.upperInclusive ? "boundary" : "within";
        tone = status === "criterion-not-met" ? "neutral" : status === "within" ? "normal" : "warning";
        outOfRange = status === "criterion-not-met" ? null : status !== "within";
        active = true;
        reference = { kind: profile.kind, profileId: profile.id, lower: null, upper: profile.upper, min: null, max: profile.upper, lowerInclusive: false, upperInclusive: profile.upperInclusive, unit: result.unit, label: profile.label, text: profile.text, hint: profile.population, note: profile.population, sourceIds: [profile.sourceId], sourceLabel: profile.sourceLabel, method: profile.method || "", sample: profile.sample || "", sourceUnit: profile.unit, sourceText: profile.text, sourceLower: null, sourceUpper: profile.upper, exactLower: null, exactUpper: exact(upper), lowerText: "", upperText: short(profile.upper) };
        bounds = [exact(upper)];
        const key = status === "criterion-met" ? "met" : status === "criterion-not-met" ? "notMet" : status;
        statusText = clinical?.titles?.[key] || notes.childTitles?.[key] || statusText;
        interpretation = clinical?.copy?.[key] || interpretation;
        if (populationCategory === "child" && data.clinicalContext === "general" && status === "within") interpretation = (side === 0 ? notes.childAtUpper : notes.childBelowUpper) + " " + notes.childWithin;
      }
    }
    if (result.valid && result.hours !== 24) { statusText = notes.non24Title; interpretation = notes.non24; }
    else if (result.valid && ambiguousAge) { statusText = notes.ambiguousAgeTitle; interpretation = notes.ambiguousAge; notes.agePrecision = possibleProfiles.map(p => p.population + ": " + p.text + " " + p.unit).join("; "); }
    else if (result.valid && !populationCategory) { statusText = notes.noAgeTitle; interpretation = notes.noAge; }
    else if (result.valid && populationCategory === "child" && result.perKg === null) { statusText = notes.noPolicyTitle; interpretation = notes.childNoMass; }
    else if (result.valid && populationCategory === "adult" && !data.sex) { statusText = notes.noSexTitle; interpretation = notes.noSex; }
    else if (result.valid && populationCategory === "adult" && result.dailyMg === null) { statusText = notes.noPolicyTitle; interpretation = notes.adultNoMass; }
    if (result.valid && result.rawValue === 0) { status = "zero"; tone = "neutral"; outOfRange = null; active = false; reference = null; bounds = []; statusText = notes.zeroTitle; interpretation = notes.zero; }
    const shown = result.valid ? formatValue(result.rawValue, result.exactMain, bounds) : "";
    if (result.valid && !shown) return freeze({ ...copy(result), schema: "clcr-ca-dzm", version: 1, engineVersion: ENGINE_VERSION, valid: false, rawValue: null, value: null, errorCode: "numeric-precision", error: "Wyniku nie można pokazać z wymaganą dokładnością.", status: "unassessed", tone: "neutral", outOfRange: null, reference: null, references: [], referenceAvailable: false, referenceActive: false });
    const referenceRows = hasPolicy ? policy.profiles.map(p => ({ profileId: p.id, population: p.population, label: p.label, text: p.text, unit: p.unit, sourceId: p.sourceId, sourceLabel: p.sourceLabel, active: reference?.profileId === p.id })) : [];
    const model = { ...copy(result), schema: "clcr-ca-dzm", version: 1, engineVersion: ENGINE_VERSION, display: { text: shown, boundary: "" }, status, statusText: result.valid ? statusText || "Wydalanie wapnia" : "", tone, outOfRange, category: null, interpretation: result.valid ? interpretation || "" : "", contextLabel: clinical?.label || "Ocena wydalania wapnia", reference, references: reference ? [copy(reference)] : [], referenceAvailable: Boolean(reference), referenceActive: active, referenceLabel: reference?.label || "Odniesienie", referenceText: reference?.text || "Bez porównania", referenceHint: reference?.sourceLabel || "", referenceRows, policy: hasPolicy ? { id: policy.id, version: policy.version } : null, population: hasPolicy ? copy(policy.population) : null, populationCategory, dailyDisplay: result.valid && result.dailyMg !== null ? formatValue(result.dailyMg, result.exactDailyMg) : "", perKgDisplay: result.valid && result.perKg !== null ? formatValue(result.perKg, result.exactPerKg) : "", sources: hasPolicy ? copy(policy.sources) : [], educationalReferences: hasPolicy ? copy(policy.educationalReferences || []) : [], notes, cautions: [] };
    model.notes.sourceSummary = reference ? reference.sourceLabel + " · pełna zbiórka 24 h" : "";
    if (clinical?.explanation) model.notes.contextExplanation = clinical.explanation;
    return freeze(model);
  }
  return Object.freeze({ ENGINE_VERSION, MOLAR_MASS, FIELD_IDS, CONTEXT_FIELD_IDS, COLLECTION_FIELDS, parseValue, formatValue, inputFromValues, readInputFromDocument, compute, evaluate, validPolicy });
});
