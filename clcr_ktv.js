/* Independent selected IHD index; this module never writes patient inputs. */
(function (root, factory) {
  const api = factory(root);
  if (root) root.VildaClcrKtv = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";
  const ENGINE_VERSION = 1;
  const VARIANTS = Object.freeze(["spktv", "ektv", "urr"]);
  const FIELD_MAP = Object.freeze({ ktvVariant: "variant", UreaPre: "preUrea", UreaPost: "postUrea", ktvDurationMinutes: "durationMinutes", ktvUF: "netUfLiters", ktvW: "postWeightKg", ktvSessionsPerWeek: "sessionsPerWeek", ktvPidiDays: "pidiDays", ktvAccessType: "accessType", age: "ageYears", ageMonths: "ageMonths" });
  const FIELD_IDS = Object.freeze(Object.keys(FIELD_MAP).filter(id => !["age", "ageMonths"].includes(id)));
  const SAMPLE_BOOLEAN_IDS = Object.freeze(["ktvSameSession", "ktvPreBeforeDialysis", "ktvPreNoDilution"]);
  const CONTEXT_FIELD_IDS = Object.freeze(["age", "ageMonths", "ktvModality", "ktvUreaAnalyte", "ktvUreaUnit", "ktvPreAnalyte", "ktvPostAnalyte", "ktvPreUnit", "ktvPostUnit", ...SAMPLE_BOOLEAN_IDS, "ktvPostMethod", "ktvKru", "ktvKruMeasuredAt", "ktvTreatmentsDelivered", ...SAMPLE_BOOLEAN_IDS.map(id => `ui_${id}_answer`), "ktvKnownFacts"]);
  const FACT_FIELD_IDS = Object.freeze(CONTEXT_FIELD_IDS.filter(id => !["age", "ageMonths", "ktvKnownFacts"].includes(id)));
  const FACT_ALIASES = Object.freeze({ modality: "ktvModality", ureaAnalyte: "ktvUreaAnalyte", ureaUnit: "ktvUreaUnit", preAnalyte: "ktvPreAnalyte", postAnalyte: "ktvPostAnalyte", preUnit: "ktvPreUnit", postUnit: "ktvPostUnit", sameSession: "ktvSameSession", preBeforeDialysis: "ktvPreBeforeDialysis", preNoSalineHeparinDilution: "ktvPreNoDilution", postMethod: "ktvPostMethod" });
  const PARAMETER_KEYS = Object.freeze({ spktv: "KTV_spktv", ektv: "KTV_ektv", urr: "KTV_urr" });
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
  const object = value => Boolean(value && typeof value === "object" && !Array.isArray(value));
  const absent = value => value == null || typeof value === "string" && !value.trim();
  const finite = value => typeof value === "number" && Number.isFinite(value);
  function freeze(value) { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  const copy = value => Array.isArray(value) ? value.map(copy) : object(value) ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)])) : value;
  const primitive = value => value == null ? null : typeof value === "string" ? value.length <= 512 ? value : "[invalid value]" : typeof value === "number" ? finite(value) ? value : String(value) : typeof value === "boolean" ? value : "[invalid value]";
  const token = value => typeof value === "string" ? value.trim().toLowerCase().replace(/\s+/g, "") : "";
  function gcd(a, b) { a = a < 0n ? -a : a; while (b) { const x = a % b; a = b; b = x; } return a || 1n; }
  function fraction(n, d = 1n) { if (d < 0n) { n = -n; d = -d; } const g = gcd(n, d); return { n: n / g, d: d / g }; }
  const add = (a, b) => fraction(a.n * b.d + b.n * a.d, a.d * b.d);
  const subtract = (a, b) => fraction(a.n * b.d - b.n * a.d, a.d * b.d);
  const multiply = (a, b) => fraction(a.n * b.n, a.d * b.d);
  const divide = (a, b) => fraction(a.n * b.d, a.d * b.n);
  const numberOf = value => Number(value.n) / Number(value.d);
  const compare = (a, b) => a.n * b.d < b.n * a.d ? -1 : a.n * b.d > b.n * a.d ? 1 : 0;
  const exactOf = value => ({ numerator: String(value.n), denominator: String(value.d) });
  function decimal(value) {
    if (!["number", "string"].includes(typeof value)) return null;
    const text = String(value).trim().replace(",", ".");
    if (!text || text.length > 128) return null;
    const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text);
    if (!match || !(match[2] || match[3])) return null;
    const exponent = Number(match[4] || 0) - (match[3] || "").length;
    if (!Number.isInteger(exponent) || Math.abs(exponent) > 512) return null;
    const digits = BigInt((match[2] || "0") + (match[3] || "")), n = match[1] === "-" ? -digits : digits;
    return exponent >= 0 ? fraction(n * 10n ** BigInt(exponent)) : fraction(n, 10n ** BigInt(-exponent));
  }
  function parsed(value) {
    if (absent(value)) return { missing: true, valid: false, value: null, errorCode: "missing-number" };
    const exact = decimal(value), number = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim().replace(",", ".")) : NaN;
    if (!exact || !finite(number)) return { missing: false, valid: false, value: null, errorCode: "invalid-number" };
    const roundtrip = decimal(String(Object.is(number, -0) ? 0 : number));
    if (!roundtrip || exact.n * roundtrip.d !== roundtrip.n * exact.d) return { missing: false, valid: false, value: null, errorCode: "numeric-precision" };
    return { missing: false, valid: true, value: Object.is(number, -0) ? 0 : number, exact, errorCode: "" };
  }
  function parseNumber(value) { const p = parsed(value); return { missing: p.missing, valid: p.valid, value: p.value, errorCode: p.errorCode, exactValue: p.exact ? exactOf(p.exact) : null }; }
  function normalizeVariant(value) { if (absent(value)) return "spktv"; if (typeof value !== "string") return "invalid"; const v = token(value); return v === "sp" ? "spktv" : v === "e" ? "ektv" : v; }
  function normalizeAccess(value) { if (absent(value)) return "UNKNOWN"; if (typeof value !== "string") return "INVALID"; const v = token(value).replace(/[-/]/g, "_"); return ["av", "avf", "avg", "avf_avg", "avfavg"].includes(v) ? "AVF_AVG" : ["cvc", "catheter", "cewnik"].includes(v) ? "CVC" : ["unknown", "nieznany"].includes(v) ? "UNKNOWN" : "INVALID"; }
  function safeFacts(source) {
    const result = {};
    if (!object(source)) return result;
    for (const [key, value] of Object.entries(source)) {
      const id = FACT_ALIASES[key] || key;
      if (FACT_FIELD_IDS.includes(id) && (value === null || typeof value === "boolean" || finite(value) || typeof value === "string" && value.length <= 128)) result[id] = value;
    }
    return result;
  }
  function metadataFacts(value) { if (typeof value !== "string" || value.length > 8192) return {}; try { return safeFacts(JSON.parse(value)); } catch (_) { return {}; } }
  function inputData(input) {
    const source = object(input) ? input : {}, data = {};
    for (const key of Object.values(FIELD_MAP)) data[key] = primitive(own(source, key) ? source[key] : null);
    data.variant = normalizeVariant(data.variant);
    data.accessType = absent(data.accessType) ? "" : typeof data.accessType === "string" ? data.accessType : primitive(data.accessType);
    data.evaluationDate = typeof source.evaluationDate === "string" ? source.evaluationDate.slice(0, 32) : null;
    data.knownFacts = { ...safeFacts(source.knownFacts), ...safeFacts(source.sampling) };
    for (const [key, id] of Object.entries(FACT_ALIASES)) if (own(source, key)) data.knownFacts[id] = primitive(source[key]);
    return data;
  }
  function inputFromValues(values, context) {
    const source = object(values) ? values : {}, supplied = object(context) ? context : {}, input = {};
    for (const [id, key] of Object.entries(FIELD_MAP)) input[key] = own(source, id) ? source[id] : own(supplied, key) ? supplied[key] : null;
    const direct = safeFacts(source);
    for (const [id, value] of Object.entries(direct)) if (absent(value) || ["unknown", "unconfirmed"].includes(token(value)) || [...SAMPLE_BOOLEAN_IDS, "ktvTreatmentsDelivered"].includes(id) && (value === false || value === "false")) delete direct[id];
    input.knownFacts = { ...safeFacts(supplied.knownFacts), ...safeFacts(source.knownFacts), ...metadataFacts(source.ktvKnownFacts) };
    for (const [id, value] of Object.entries(direct)) if (absent(input.knownFacts[id]) || ["unknown", "unconfirmed"].includes(token(input.knownFacts[id])) || id.startsWith("ui_") && ["yes", "no"].includes(token(value))) input.knownFacts[id] = value;
    SAMPLE_BOOLEAN_IDS.forEach(id => { if (direct[`ui_${id}_answer`] === "yes") input.knownFacts[id] = true; });
    if (object(supplied.sampling)) Object.assign(input.knownFacts, safeFacts(supplied.sampling));
    input.evaluationDate = supplied.clinicalDateISO || supplied.evaluationDate || source.evaluationDate || null;
    return inputData(input);
  }
  function readInputFromDocument(documentRef, context) {
    const doc = documentRef || root?.document, vault = doc?.defaultView?.__vildaClcrVersionValueVault || root?.__vildaClcrVersionValueVault || {}, values = {};
    for (const id of [...FIELD_IDS, ...CONTEXT_FIELD_IDS]) {
      const control = doc?.getElementById?.(id);
      if (control) values[id] = control.type === "checkbox" || control.type === "radio" ? control.checked === true : control.value;
      else if (own(vault, id)) values[id] = vault[id];
    }
    const session = doc?.defaultView?.ClcrKtvSession || root?.ClcrKtvSession;
    let sessionContext = {};
    try { if (typeof session?.readContext === "function") sessionContext = session.readContext(doc) || {}; } catch (_) { /* Malformed optional session metadata cannot manufacture confirmed facts. */ }
    const supplied = { ...sessionContext, ...(object(context) ? context : {}), knownFacts: { ...safeFacts(sessionContext.knownFacts), ...safeFacts(context?.knownFacts) } };
    if (!supplied.clinicalDateISO && !supplied.evaluationDate) supplied.evaluationDate = doc?.getElementById?.("clcrVisitDate")?.value || null;
    return inputFromValues(values, supplied);
  }
  function requiredFieldIds(variant) { const v = normalizeVariant(variant); return ["UreaPre", "UreaPost", ...(v === "urr" ? [] : ["ktvDurationMinutes", "ktvUF", "ktvW", "ktvSessionsPerWeek", "ktvPidiDays"]), ...(v === "ektv" ? ["ktvAccessType"] : [])]; }
  function allowedPidiDays(frequency, policy) { const p = parsed(frequency); return p.valid && Number.isInteger(p.value) && object(policy?.gfac?.[p.value]) ? Object.keys(policy.gfac[p.value]).map(Number).filter(Number.isFinite) : []; }
  function validPolicy(policy) {
    if (!(object(policy) && policy.quantity === "maintenance-ihd-session-dose" && typeof policy.id === "string" && Number.isInteger(policy.version) && policy.version > 0 && object(policy.gfac) && object(policy.calculation) && object(policy.calculation.reboundMinutes) && object(policy.guards) && object(policy.sampling) && object(policy.notes))) return false;
    const c = policy.calculation;
    if (!["minimumModelAgeYears", "minimumAdultEstimateAgeYears", "maximumKnownAgeYears", "maximumDurationMinutes", "maximumNetUfLiters", "maximumPostWeightKg", "volumeCoefficient", "ratioVolumeCoefficient"].every(k => finite(c[k]) && c[k] > 0) || !["AVF_AVG", "CVC"].every(k => finite(c.reboundMinutes[k]) && c.reboundMinutes[k] > 0)) return false;
    if (!["highUrrExclusive", "longSessionMinutesExclusive", "longSessionHighUrrExclusive", "frequentSessionsAtLeast", "frequentSessionsAtMost", "frequentLongMinutesExclusive"].every(k => finite(policy.guards[k]) && policy.guards[k] > 0)) return false;
    if (!["supportedModalities", "supportedAnalytes", "postMethods", "unknownPostMethods", "equilibratedPostMethods", "pediatricUnsupportedMethods"].every(k => Array.isArray(policy.sampling[k]) && policy.sampling[k].every(v => typeof v === "string"))) return false;
    return Array.isArray(policy.profiles) && policy.profiles.every(p => p && VARIANTS.includes(p.variant) && finite(p.minimumAgeYears) && (p.maximumAgeYearsExclusive === null || finite(p.maximumAgeYearsExclusive) && p.maximumAgeYearsExclusive > p.minimumAgeYears) && finite(p.sessionsPerWeek) && (p.pidiDays === null || finite(p.pidiDays)) && (p.maximumDurationMinutesExclusive === null || finite(p.maximumDurationMinutesExclusive)) && finite(p.minimum) && (p.target === null || finite(p.target) && p.target >= p.minimum) && Array.isArray(p.sourceIds)) && Array.isArray(policy.sources) && policy.sources.every(s => s && ["id", "label", "url"].every(k => typeof s[k] === "string"));
  }
  function patientAge(input, policy) {
    let years = parsed(input.ageYears);
    const months = absent(input.ageMonths) ? { valid: true, value: 0 } : parsed(input.ageMonths);
    if (years.missing && absent(input.ageMonths)) return { known: false, invalid: false, years: null };
    if (years.missing && months.valid && months.value > 0 && months.value < 12 && Number.isInteger(months.value)) years = { valid: true, value: 0 };
    if (years.missing && months.valid && months.value === 0) return { known: false, invalid: false, years: null };
    if (!years.valid || !months.valid || years.value < 0 || months.value < 0 || months.value >= 12 || !Number.isInteger(months.value)) return { known: false, invalid: true, years: null };
    const exact = years.value + months.value / 12;
    return policy && exact > policy.calculation.maximumKnownAgeYears ? { known: false, invalid: true, years: null } : { known: true, invalid: false, years: exact };
  }
  function samplingGuard(input, policy, age) {
    const facts = input.knownFacts, sampling = policy?.sampling, notes = policy?.notes || {};
    const bad = id => facts[id] === false || ["false", "no"].includes(token(facts[id])) || token(facts[`ui_${id}_answer`]) === "no";
    const guard = (code, message, tone = "warning") => ({ code, kind: "sample", message: message || "Znane dane próbek nie są zgodne z warunkami tego obliczenia. Sprawdź parę stężeń i sposób pobrania.", tone });
    if (bad("ktvSameSession")) return guard("different-sessions", notes.differentSessions, "danger");
    if (bad("ktvPreBeforeDialysis") || bad("ktvPreNoDilution")) return guard("invalid-sampling", notes.samplingProblem);
    const modality = token(facts.ktvModality);
    if (modality && !["unknown", "unconfirmed"].includes(modality) && !(sampling?.supportedModalities || ["ihd"]).includes(modality)) return guard("unsupported-modality", notes.modalityGuard);
    const knownToken = value => ["unknown", "unconfirmed"].includes(token(value)) ? "" : token(value);
    const unit = value => knownToken(value).replace(/μ/g, "µ");
    const analyte = value => ["urea", "mocznik"].includes(knownToken(value)) ? "urea" : ["bun", "ureanitrogen", "azotmocznika"].includes(knownToken(value)) ? "bun" : knownToken(value);
    const preUnit = unit(facts.ktvPreUnit || facts.ktvUreaUnit), postUnit = unit(facts.ktvPostUnit || facts.ktvUreaUnit);
    const preAnalyte = analyte(facts.ktvPreAnalyte || facts.ktvUreaAnalyte), postAnalyte = analyte(facts.ktvPostAnalyte || facts.ktvUreaAnalyte);
    if (preUnit && postUnit && preUnit !== postUnit || preAnalyte && postAnalyte && preAnalyte !== postAnalyte) return guard("mismatched-concentrations", notes.mismatch, "danger");
    if ([preAnalyte, postAnalyte].some(value => value && !(sampling?.supportedAnalytes || ["urea", "bun"]).includes(value))) return guard("unsupported-analyte", notes.mismatch, "danger");
    if (!sampling) return null;
    const method = token(facts.ktvPostMethod);
    if (sampling.equilibratedPostMethods.includes(method)) return input.variant === "urr" ? null : guard("already-equilibrated", notes.equilibratedGuard);
    if (!sampling.unknownPostMethods.includes(method) && !sampling.postMethods.includes(method)) return guard("invalid-post-sampling", notes.samplingProblem);
    if (age.known && age.years < policy.calculation.minimumAdultEstimateAgeYears && sampling.pediatricUnsupportedMethods.includes(method)) return guard("pediatric-post-sampling-unsupported", notes.samplingProblem);
    return null;
  }
  function chooseReference(input, policy, age, parsedFields, values) {
    const notes = policy.notes, variant = input.variant;
    if (policy.sampling.equilibratedPostMethods.includes(token(input.knownFacts.ktvPostMethod))) return { reference: null, reason: notes.equilibratedUrr };
    if (values.ratio >= 1) return { reference: null, reason: notes.nonReducing };
    if (!age.known) return { reference: null, reason: age.invalid ? notes.invalidAge : variant === "ektv" ? notes.unknownAgeE : notes.unknownAge };
    const frequency = parsedFields.sessionsPerWeek?.valid ? parsedFields.sessionsPerWeek.value : null;
    const duration = parsedFields.durationMinutes?.valid ? parsedFields.durationMinutes.value : null;
    const pidi = parsedFields.pidiDays?.valid ? parsedFields.pidiDays.value : null;
    if (variant === "urr" && age.years < policy.calculation.minimumAdultEstimateAgeYears) return { reference: null, reason: notes.pediatricUrr };
    const profile = policy.profiles.find(p => p.variant === variant && age.years >= p.minimumAgeYears && (p.maximumAgeYearsExclusive === null || age.years < p.maximumAgeYearsExclusive) && frequency === p.sessionsPerWeek && (p.pidiDays === null || pidi === p.pidiDays) && (p.maximumDurationMinutesExclusive === null || duration !== null && duration > 0 && duration < p.maximumDurationMinutesExclusive));
    if (profile) return { reference: { kind: "threshold", profileId: profile.id, minimum: profile.minimum, target: profile.target, lower: profile.target ?? profile.minimum, lowerInclusive: true, upper: null, unit: profile.unit, label: profile.label, text: profile.text, minimumText: profile.minimumText, detail: profile.detail, population: profile.population, sourceIds: copy(profile.sourceIds), sourceLabel: profile.sourceLabel }, reason: "" };
    if (variant === "urr") return { reference: null, reason: frequency === null ? notes.urrMissingSchedule : !policy.profiles.some(p => p.variant === variant && p.sessionsPerWeek === frequency) ? notes.otherSchedule : duration === null || duration <= 0 ? notes.urrMissingDuration : notes.urrLong };
    return { reference: null, reason: age.years < policy.calculation.minimumAdultEstimateAgeYears ? notes.childOtherScheme : notes.otherSchedule };
  }
  function formatValue(value, variant = "spktv", reference = null, exact = null) {
    if (!finite(value)) return { text: "", boundary: "" };
    const digits = variant === "urr" ? 1 : 2, rounded = Number(value.toFixed(digits));
    const boundaries = reference ? [reference.minimum, reference.target].filter(finite) : [];
    const crossed = boundaries.find(boundary => (exact ? compare(exact, decimal(boundary)) < 0 : value < boundary) && rounded >= boundary);
    if (crossed !== undefined) return { text: `<${crossed.toFixed(digits).replace(".", ",")}`, boundary: `<${String(crossed).replace(".", ",")}` };
    if (value !== 0 && (Math.abs(value) < 10 ** -digits || Math.abs(value) >= 1000000)) return { text: `≈${value.toPrecision(6).replace(".", ",")}`, boundary: "" };
    return { text: value.toFixed(digits).replace(".", ","), boundary: "" };
  }
  function evaluate(input, suppliedPolicy) {
    const data = inputData(input), hasPolicy = validPolicy(suppliedPolicy), policy = hasPolicy ? suppliedPolicy : null, notes = policy?.notes || {};
    const variant = data.variant, requiredFields = requiredFieldIds(variant), missingIds = [], invalidIds = [], fields = {};
    const values = { ratio: null, urrPct: null, gfac: null, logarithmArgument: null, spKtV: null, eKtV: null };
    const age = patientAge(data, policy), facts = copy(data.knownFacts);
    let selectedValue = null, selectedExact = null, urrExact = null, exactValue = null, reference = null, reason = "", guard = null, errorCode = "", error = "", status = "unassessed", tone = "neutral", outOfRange = null, interpretation = "";
    const finish = () => freeze({ schema: "clcr-ktv", version: 1, engineVersion: ENGINE_VERSION, variant, parameterKey: PARAMETER_KEYS[variant] || null, valid: finite(selectedValue), ok: finite(selectedValue), valueReady: finite(selectedValue), rawValue: selectedValue, value: selectedValue, unit: variant === "urr" ? "%" : "", exactValue, input: copy(data), knownFacts: facts, age: copy(age), evaluationDate: data.evaluationDate, values: copy(values), display: formatValue(selectedValue, variant, reference, selectedExact), status, statusText: finite(selectedValue) ? status === "unassessed" ? notes.unassessedTitle || "Wynik bez automatycznej oceny" : status === "below-minimum" ? notes.belowMinimumTitle : status === "below-target" ? notes.belowTargetTitle : reference?.target === null ? notes.minimumMetTitle : notes.withinTitle : guard ? guard.kind === "model" ? notes.modelLimitTitle : "Sprawdź próbki" : "Uzupełnij potrzebne dane", tone: guard?.tone || tone, outOfRange, category: null, referenceAvailable: Boolean(reference), referenceActive: Boolean(reference && finite(selectedValue)), reference, references: reference ? [copy(reference)] : [], referenceLabel: reference?.label || "Cel dla tego schematu", referenceText: reference?.text || "Brak porównania", referenceHint: reference?.detail || "", referenceReason: reason, interpretation: interpretation || guard?.message || reason, requiredFields, missingIds, invalidIds, errorCode, error, guard, policy: policy ? { id: policy.id, version: policy.version } : null, population: { ...(copy(policy?.population || { label: "Pojedyncza sesja IHD" })), ageYears: age.years, ageKnown: age.known }, sources: copy(policy?.sources || []), notes: copy(notes), restrictions: copy(policy?.restrictions || {}), assumptions: { sampling: "assumed-compatible-unless-known-contrary", samplingConfirmed: false, sameAnalyteAndUnits: "assumed-unless-known-mismatch", renalContribution: "not-added", residualKidneyFunction: "unknown-unless-recorded", schedule: "entered-not-defaulted" } });
    if (!VARIANTS.includes(variant)) { invalidIds.push("ktvVariant"); errorCode = "invalid-variant"; error = "Wybierz spKt/V, eKt/V albo URR."; return finish(); }
    for (const [id, key] of Object.entries(FIELD_MAP)) if (key !== "variant" && key !== "accessType" && key !== "ageYears" && key !== "ageMonths") fields[key] = parsed(data[key]);
    for (const id of requiredFields) {
      const key = FIELD_MAP[id];
      if (key === "accessType") { const access = normalizeAccess(data.accessType); if (access === "UNKNOWN") missingIds.push(id); else if (access === "INVALID") invalidIds.push(id); continue; }
      const field = fields[key];
      if (field.missing) missingIds.push(id);
      else if (!field.valid) invalidIds.push(id);
    }
    if (fields.preUrea.valid && fields.preUrea.value <= 0) invalidIds.push("UreaPre");
    if (fields.postUrea.valid && fields.postUrea.value < 0) invalidIds.push("UreaPost");
    if (fields.preUrea.valid && fields.preUrea.value > 0 && fields.postUrea.valid && fields.postUrea.value >= 0) {
      const ratio = divide(fields.postUrea.exact, fields.preUrea.exact), urr = multiply(subtract(fraction(1n), ratio), fraction(100n));
      values.ratio = numberOf(ratio); values.urrPct = numberOf(urr); urrExact = urr;
      if (variant === "urr") { exactValue = exactOf(urr); selectedExact = urr; }
    }
    if (variant !== "urr") {
      if (!hasPolicy) { errorCode = "policy-unavailable"; error = "Nie wczytano danych używanego modelu Kt/V. Odśwież aplikację."; return finish(); }
      const c = policy.calculation;
      for (const [key, maximum, zeroAllowed] of [["durationMinutes", c.maximumDurationMinutes, false], ["netUfLiters", c.maximumNetUfLiters, true], ["postWeightKg", c.maximumPostWeightKg, false]]) if (fields[key].valid && (fields[key].value > maximum || (zeroAllowed ? fields[key].value < 0 : fields[key].value <= 0))) invalidIds.push(Object.keys(FIELD_MAP).find(id => FIELD_MAP[id] === key));
      for (const key of ["sessionsPerWeek", "pidiDays"]) if (fields[key].valid && !Number.isInteger(fields[key].value)) invalidIds.push(Object.keys(FIELD_MAP).find(id => FIELD_MAP[id] === key));
    }
    if (invalidIds.length || missingIds.length) { errorCode = invalidIds.length ? "invalid-input" : "missing-input"; error = invalidIds.length ? "Sprawdź liczby, jednostki i zakresy danych wybranego wariantu." : "Uzupełnij brakujące pola wybranego wariantu."; return finish(); }
    if (!finite(values.ratio) || !finite(values.urrPct)) { errorCode = "numeric-range"; error = "Nie można przedstawić skończonego wyniku. Sprawdź stężenia."; return finish(); }
    guard = samplingGuard(data, policy, age);
    if (guard) { errorCode = guard.code; error = guard.message; return finish(); }
    if (variant === "urr") selectedValue = values.urrPct;
    else {
      const block = (code, message) => { guard = { code, kind: "model", message, tone: "warning" }; errorCode = code; error = message; return finish(); };
      const c = policy.calculation, g = policy.guards;
      const yearsAlone = parsed(data.ageYears), scopeAge = age.known ? age.years : yearsAlone.valid && yearsAlone.value >= 0 ? yearsAlone.value : null;
      if (!(values.ratio > 0 && values.ratio < 1)) { errorCode = "invalid-urea-ratio"; error = "Model Kt/V wymaga dodatnich stężeń i niższej wartości po dializie niż przed. URR można odczytać osobno."; invalidIds.push("UreaPost"); return finish(); }
      if (scopeAge !== null && scopeAge < c.minimumModelAgeYears) return block("age-model-unsupported", notes.infantGuard);
      if (variant === "ektv" && scopeAge !== null && scopeAge < c.minimumAdultEstimateAgeYears) return block("pediatric-rebound-unsupported", notes.pediatricEGuard);
      if (compare(urrExact, decimal(g.highUrrExclusive)) > 0 || fields.durationMinutes.value > g.longSessionMinutesExclusive && compare(urrExact, decimal(g.longSessionHighUrrExclusive)) > 0) return block("high-urr-model-unreliable", notes.highUrrGuard);
      if (fields.sessionsPerWeek.value >= g.frequentSessionsAtLeast && fields.sessionsPerWeek.value <= g.frequentSessionsAtMost && fields.durationMinutes.value > g.frequentLongMinutesExclusive) return block("frequent-long-model-unsupported", notes.frequentLongGuard);
      const factor = policy.gfac[fields.sessionsPerWeek.value]?.[fields.pidiDays.value];
      if (!finite(factor) || factor <= 0) { invalidIds.push("ktvSessionsPerWeek", "ktvPidiDays"); errorCode = "gfac-unavailable"; error = "Wybrany odstęp nie pasuje do obsługiwanej pary częstości i PIDI. Nie podstawiamy domyślnego GFAC."; return finish(); }
      values.gfac = factor;
      const ratio = divide(fields.postUrea.exact, fields.preUrea.exact), hours = divide(fields.durationMinutes.exact, fraction(60n));
      const argument = subtract(ratio, multiply(decimal(factor), hours));
      if (argument.n <= 0n) { errorCode = "daugirdas-domain"; error = "Ta kombinacja stężeń, czasu i schematu wykracza poza dziedzinę wzoru. Sprawdź dane i metodę oceny dawki."; return finish(); }
      values.logarithmArgument = numberOf(argument);
      const volumeTerm = multiply(subtract(decimal(c.volumeCoefficient), multiply(decimal(c.ratioVolumeCoefficient), ratio)), divide(fields.netUfLiters.exact, fields.postWeightKg.exact));
      values.spKtV = -Math.log(values.logarithmArgument) + numberOf(volumeTerm);
      if (!finite(values.spKtV)) { errorCode = "numeric-range"; error = "Nie można przedstawić skończonego wyniku Kt/V."; return finish(); }
      if (variant === "ektv") { const rebound = c.reboundMinutes[normalizeAccess(data.accessType)]; values.eKtV = values.spKtV * fields.durationMinutes.value / (fields.durationMinutes.value + rebound); selectedValue = values.eKtV; }
      else selectedValue = values.spKtV;
    }
    if (hasPolicy) {
      const choice = chooseReference(data, policy, age, fields, values); reference = choice.reference; reason = choice.reason;
      if (reference) {
        const below = boundary => selectedExact ? compare(selectedExact, decimal(boundary)) < 0 : selectedValue < boundary;
        status = below(reference.minimum) ? "below-minimum" : reference.target !== null && below(reference.target) ? "below-target" : "within";
        tone = status === "below-minimum" ? "danger" : status === "below-target" ? "warning" : "normal"; outOfRange = status !== "within";
        interpretation = status === "below-minimum" ? notes.belowMinimum : status === "below-target" ? notes.belowTarget : variant === "urr" ? notes.withinUrr : age.years < policy.calculation.minimumAdultEstimateAgeYears ? notes.withinChild : notes.within;
      }
    } else reason = "Nie dobrano celu do tego wyniku. Procent redukcji pozostaje dostępny.";
    return finish();
  }
  return Object.freeze({ ENGINE_VERSION, VARIANTS, FIELD_MAP, FIELD_IDS, CONTEXT_FIELD_IDS, FACT_FIELD_IDS, SAMPLE_BOOLEAN_IDS, PARAMETER_KEYS, evaluate, compute: evaluate, inputFromValues, readInputFromDocument, requiredFieldIds, allowedPidiDays, normalizeVariant, normalizeAccess, parseNumber, formatValue });
});
