(function (root, factory) {
  const api = factory(root);
  if (root) root.VildaClcrTmpGfr = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";
  const ENGINE_VERSION = 1;
  const CONVERSION_CONSTANTS = Object.freeze({ phosphorusMgDlPerMmolL: 3.097, creatinineUmolLPerMgDl: 88.4 });
  const FIELD_IDS = Object.freeze(["U_PO4_spot", "U_PO4_spot_unit", "S_PO4_spot", "S_PO4_spot_unit", "Scr_spot", "Scr_spot_unit", "Ucr_spot", "Ucr_spot_unit", "age", "ageMonths", "ageDays", "sex", "tmpBurosumab", "tmpDaysSinceDose", "spotSampleKind", "tmpPairedSameTime", "tmpOvernightFasting", "spotSameSpecimen", "ui_spotSameSpecimen_answer", "spotPairedChemistry", "ui_spotPairedChemistry_answer", "FENa_sample_status", "spotKnownCKD", "ui_spotKnownCKD_answer", "suspectedAKI", "ui_suspectedAKI_answer", "creatinineState", "ui_tmpPairedSameTime_answer", "ui_tmpOvernightFasting_answer"]);
  const ERRORS = Object.freeze({
    "missing-age": "Podaj wiek pacjenta, aby dobrać metodę TmP/GFR.",
    "invalid-age": "Wiek musi mieścić się w zakresie 0–120 lat.",
    "different-specimens": "Użyj sparowanych oznaczeń krwi i moczu z tego samego pobrania. Wpisane wartości pozostają w formularzu.",
    "missing-concentration": "Uzupełnij cztery stężenia oraz ich jednostki.",
    "invalid-concentration": "Sprawdź stężenia i jednostki. Fosforany w moczu mogą wynosić zero; pozostałe stężenia muszą być dodatnie.",
    "invalid-fraction": "Z tych danych wynika TRP poza zakresem 0–100%. Sprawdź stężenia, jednostki i sparowanie próbek.",
    "numeric-range": "Nie można wyznaczyć skończonego TmP/GFR z podanych wartości.",
  });
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
  const isObject = value => Boolean(value && typeof value === "object" && !Array.isArray(value));
  const absent = value => value == null || typeof value === "string" && value.trim() === "";
  const fact = value => typeof value === "boolean" ? value : null;
  function freeze(value) { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  function copy(value) { if (Array.isArray(value)) return value.map(copy); if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, copy(entry)])); return value; }
  function number(value) {
    if (!["string", "number"].includes(typeof value) || absent(value)) return null;
    const text = String(value).trim().replace(",", ".");
    if (text.length > 512 || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return null;
    const result = Number(text);
    if (result === 0 && /[1-9]/.test(text.split(/[eE]/)[0])) return null;
    return Number.isFinite(result) ? result : null;
  }
  function formatValue(value, digits = 2) {
    if (!Number.isFinite(value)) return "";
    if (value !== 0 && (Math.abs(value) < 0.5 * 10 ** -digits || Math.abs(value) >= 1e8)) return value.toExponential(2).replace(".", ",");
    return value.toLocaleString("pl-PL", { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false });
  }
  function normalizedUnit(unit) { return typeof unit === "string" ? unit.trim().replace(/µ|μ/g, "u").toLowerCase() : ""; }
  function concentration(value, unit, kind, zeroAllowed = false) {
    const parsed = number(value), u = normalizedUnit(unit);
    if (parsed === null || (zeroAllowed ? parsed < 0 : parsed <= 0)) return null;
    let factor;
    if (kind === "phosphorus") factor = u === "mmol/l" ? 1 : u === "mg/dl" ? 1 / CONVERSION_CONSTANTS.phosphorusMgDlPerMmolL : null;
    else factor = u === "mmol/l" ? 1 : ["umol/l", "umol"].includes(u) ? 0.001 : u === "mg/dl" ? CONVERSION_CONSTANTS.creatinineUmolLPerMgDl / 1000 : u === "mg/l" ? CONVERSION_CONSTANTS.creatinineUmolLPerMgDl / 10000 : null;
    if (factor === null) return null;
    const result = parsed * factor;
    return Number.isFinite(result) && (result > 0 || zeroAllowed && parsed === 0) ? result : null;
  }
  function primitive(value) { return value == null ? null : ["string", "boolean"].includes(typeof value) ? value : typeof value === "number" && Number.isFinite(value) ? value : "[invalid input]"; }
  function sampleState(value) { return [false, "no", "different", "different-urine"].includes(value) ? "different" : [true, "yes", "confirmed"].includes(value) ? "confirmed" : "assumed"; }
  function inputData(input) {
    const data = isObject(input) ? input : {};
    const rawDays = own(data, "daysSinceDoseRaw") ? data.daysSinceDoseRaw : data.daysSinceDose, parsedDays = number(rawDays);
    const daysState = absent(rawDays) ? "missing" : parsedDays === null || parsedDays < 0 ? "invalid" : "known";
    const evidence = {};
    for (const key of FIELD_IDS.slice(14)) if (own(data.sampleEvidence, key)) evidence[key] = primitive(data.sampleEvidence[key]);
    const known = key => fact(own(data, key) ? data[key] : data.knownFacts?.[key]);
    const ageContext = {};
    for (const key of ["minimumMonths", "maximumMonths", "exactYears", "totalMonths"]) if (Number.isFinite(data.ageContext?.[key])) ageContext[key] = data.ageContext[key];
    if (data.ageContext?.maximumExclusive === true) ageContext.maximumExclusive = true;
    return {
      ...Object.fromEntries(["serumPhosphate", "serumPhosphateUnit", "urinePhosphate", "urinePhosphateUnit", "serumCreatinine", "serumCreatinineUnit", "urineCreatinine", "urineCreatinineUnit"].map(key => [key, primitive(data[key])])),
      ageYears: primitive(data.ageYears), ageContext, sex: ["M", "F"].includes(data.sex) ? data.sex : null,
      burosumab: data.burosumab === true || data.monitorBurosumab === true, daysSinceDose: daysState === "known" ? parsedDays : null, daysSinceDoseState: daysState, daysSinceDoseRaw: primitive(rawDays),
      clinicalDate: typeof data.clinicalDate === "string" ? data.clinicalDate : "", patientId: typeof data.patientId === "string" ? data.patientId : "",
      pairedSameTime: sampleState(data.pairedSameTime), sameUrineSpecimen: sampleState(data.sameUrineSpecimen),
      sampleKind: typeof data.sampleKind === "string" ? data.sampleKind : "", overnightFasting: fact(data.overnightFasting), sampleEvidence: evidence,
      knownCKD: known("knownCKD"), knownAKI: known("knownAKI"), rapidlyChangingCreatinine: known("rapidlyChangingCreatinine"),
    };
  }
  function inputFromValues(values, context = {}) {
    const data = isObject(values) ? values : {}, value = id => own(data, id) ? data[id] : "";
    const known = id => value(`ui_${id}_answer`) === "yes" ? true : value(`ui_${id}_answer`) === "no" ? false : value(`ui_${id}_answer`) === "unknown" ? null : value(id) === true ? true : null;
    const years = number(value("age")), months = number(value("ageMonths")), days = number(value("ageDays"));
    let ageYears = own(data, "age") ? years === null || years < 0 || months !== null && (months < 0 || months > 11) || days !== null && (days < 0 || days > 28) ? null : years + (months || 0) / 12 + (years === 0 && !months ? (days || 0) / 365.2425 : 0) : number(context.ageYears ?? context.ageContext?.exactYears ?? context.age?.exactYears);
    let ageContext = context.ageContext || context.age || {};
    if (own(data, "age") && ageYears !== null) {
      const minimumMonths = ageYears * 12;
      const maximumMonths = days !== null && years === 0 && !months ? (days + 1) * 12 / 365.2425 : months !== null ? minimumMonths + 1 : Number.isInteger(years) ? minimumMonths + 12 : minimumMonths;
      ageContext = { exactYears: ageYears, minimumMonths, maximumMonths, maximumExclusive: maximumMonths > minimumMonths };
    }
    if (own(data, "age") && !absent(value("age")) && (years === null || years < 0 || !absent(value("ageMonths")) && (months === null || months < 0 || months > 11) || !absent(value("ageDays")) && (days === null || days < 0 || days > 28))) ageYears = -1;
    const evidence = Object.fromEntries(FIELD_IDS.slice(14).filter(id => own(data, id)).map(id => [id, primitive(data[id])]));
    const different = value("ui_spotPairedChemistry_answer") === "no" || value("ui_tmpPairedSameTime_answer") === "no" || ["different", "different-time"].includes(value("FENa_sample_status"));
    const differentUrine = value("ui_spotSameSpecimen_answer") === "no" || value("FENa_sample_status") === "different-urine";
    return inputData({
      serumPhosphate: value("S_PO4_spot"), serumPhosphateUnit: value("S_PO4_spot_unit"), urinePhosphate: value("U_PO4_spot"), urinePhosphateUnit: value("U_PO4_spot_unit"),
      serumCreatinine: value("Scr_spot"), serumCreatinineUnit: value("Scr_spot_unit"), urineCreatinine: value("Ucr_spot"), urineCreatinineUnit: value("Ucr_spot_unit"), ageYears, ageContext, sex: own(data, "sex") ? data.sex : context.sex,
      burosumab: value("tmpBurosumab") === true, daysSinceDose: value("tmpDaysSinceDose"), clinicalDate: context.clinicalDate || context.clinicalDateISO || "", patientId: context.patientId || "",
      pairedSameTime: different ? "different" : value("tmpPairedSameTime") === true || value("spotPairedChemistry") === true ? "confirmed" : "assumed",
      sameUrineSpecimen: differentUrine ? "different" : value("spotSameSpecimen") === true ? "confirmed" : "assumed", sampleKind: value("spotSampleKind"), overnightFasting: value("ui_tmpOvernightFasting_answer") === "no" ? false : value("tmpOvernightFasting") === true ? true : null, sampleEvidence: evidence,
      knownCKD: known("spotKnownCKD"), knownAKI: known("suspectedAKI"), rapidlyChangingCreatinine: value("creatinineState") === "rapidlyChanging" ? true : value("creatinineState") === "stable" ? false : null,
    });
  }
  function readInputFromDocument(documentRef, context = {}) {
    const doc = documentRef || root?.document, vault = doc?.defaultView?.__vildaClcrVersionValueVault || root?.__vildaClcrVersionValueVault || {}, values = {};
    for (const id of FIELD_IDS) { const control = doc?.getElementById(id); if (control) values[id] = ["checkbox", "radio"].includes(control.type) ? control.checked === true : control.value; else if (own(vault, id)) values[id] = vault[id]; }
    return inputFromValues(values, context);
  }
  function compute(input) {
    const data = inputData(input), fail = code => freeze({ ok: false, valid: false, rawValue: null, unit: "mmol/L", input: data, errorCode: code, error: ERRORS[code] });
    if (absent(data.ageYears)) return fail("missing-age");
    const age = number(data.ageYears);
    if (age === null || age < 0 || age > 120) return fail("invalid-age");
    if (data.pairedSameTime === "different" || data.sameUrineSpecimen === "different") return fail("different-specimens");
    const entries = ["serumPhosphate", "urinePhosphate", "serumCreatinine", "urineCreatinine"];
    if (entries.some(key => absent(data[key]) || absent(data[`${key}Unit`]))) return fail("missing-concentration");
    const serumP = concentration(data.serumPhosphate, data.serumPhosphateUnit, "phosphorus"), urineP = concentration(data.urinePhosphate, data.urinePhosphateUnit, "phosphorus", true), serumCr = concentration(data.serumCreatinine, data.serumCreatinineUnit, "creatinine"), urineCr = concentration(data.urineCreatinine, data.urineCreatinineUnit, "creatinine");
    if ([serumP, urineP, serumCr, urineCr].some(value => value === null)) return fail("invalid-concentration");
    let fePo4 = (urineP / urineCr) * (serumCr / serumP);
    if (!Number.isFinite(fePo4)) return fail("numeric-range");
    if (fePo4 < 0 || fePo4 > 1 + 8 * Number.EPSILON) return fail("invalid-fraction");
    fePo4 = Math.min(1, fePo4);
    const trp = 1 - fePo4, method = age < 19 ? "Brodehl" : "Walton–Bijvoet/Payne", branch = age < 19 ? "pediatric-direct" : trp <= 0.86 ? "linear" : "corrected";
    const rawValue = serumP * (branch === "corrected" ? 0.3 * trp / (1 - 0.8 * trp) : trp);
    if (!Number.isFinite(rawValue) || rawValue < 0) return fail("numeric-range");
    return freeze({ ok: true, valid: true, rawValue, value: rawValue, tmpGfrMmolL: rawValue, tmpGfrMgDl: rawValue * CONVERSION_CONSTANTS.phosphorusMgDlPerMmolL, trp, fePo4, method, branch, unit: "mmol/L", normalized: { serumPhosphate: serumP, urinePhosphate: urineP, serumCreatinine: serumCr, urineCreatinine: urineCr }, display: { text: formatValue(rawValue), unit: "mmol/L" }, input: data, errorCode: "", error: "" });
  }
  function validPolicy(policy) { return policy?.quantity === "tmp-gfr" && policy.unit === "mmol/L" && typeof policy.id === "string" && Number.isInteger(policy.version) && Array.isArray(policy.profiles) && Array.isArray(policy.serumProfiles) && Array.isArray(policy.sources) && isObject(policy.notes); }
  function rangeOf(profile, divisor = 1) { const lower = profile.lower / divisor, upper = profile.upper / divisor; return { ...copy(profile), sourceUnit: profile.unit, lower, upper, low: lower, high: upper, unit: "mmol/L", ageLabel: profile.label, lowerInclusive: true, upperInclusive: true }; }
  function classify(value, reference) { if (!reference || !Number.isFinite(value)) return "unassessed"; const noise = 8 * Number.EPSILON * Math.max(1, Math.abs(value), Math.abs(reference.lower), Math.abs(reference.upper)); return value < reference.lower - noise ? "below" : value > reference.upper + noise ? "above" : "within"; }
  function rangeText(reference) { return reference ? `${formatValue(reference.lower)}–${formatValue(reference.upper)}` : ""; }
  function ageMatches(profile, data) {
    const age = number(data.ageYears), minimum = Number.isFinite(data.ageContext.minimumMonths) ? data.ageContext.minimumMonths / 12 : age, maximum = Number.isFinite(data.ageContext.maximumMonths) ? data.ageContext.maximumMonths / 12 : age;
    return maximum > minimum ? profile.ageMin < maximum && profile.ageMax > minimum : (profile.ageMinExclusive ? age > profile.ageMin : age >= profile.ageMin) && age < profile.ageMax;
  }
  function ageCovered(profile, data) { const age = number(data.ageYears), minimum = Number.isFinite(data.ageContext.minimumMonths) ? data.ageContext.minimumMonths / 12 : age, maximum = Number.isFinite(data.ageContext.maximumMonths) ? data.ageContext.maximumMonths / 12 : age; return (profile.ageMinExclusive ? minimum > profile.ageMin : minimum >= profile.ageMin) && (maximum > minimum ? maximum <= profile.ageMax : maximum < profile.ageMax); }
  function renalCautions(data) { return [data.knownAKI === true ? "Znane lub podejrzewane AKI ogranicza interpretację i porównywanie odpowiedzi na leczenie." : "", data.rapidlyChangingCreatinine === true ? "Szybko zmieniająca się kreatynina ogranicza interpretację i porównywanie odpowiedzi na leczenie." : "", data.knownCKD === true ? "Znana PChN wymaga indywidualnej oceny; ten widok nie ocenia bezpieczeństwa ani skuteczności burosumabu w tym kontekście." : ""].filter(Boolean); }
  function dateValue(value) { if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null; const timestamp = Date.parse(`${value}T00:00:00Z`); return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value ? timestamp : null; }
  function compareTreatment(current, previous, policy, options = {}) {
    const data = current.input, notes = validPolicy(policy) ? policy.notes : {}, enabled = data.burosumab === true;
    const result = { enabled, comparisonAllowed: false, direction: null, comparison: null, reason: "", title: "Podczas leczenia burosumabem", message: "", trendMessage: "", cautions: [], limitations: [], tone: "neutral" };
    if (!enabled || !current.valid) return result;
    result.message = notes[current.serumPhosphate.status === "above" ? "serumAbove" : current.serumPhosphate.status === "below" ? "serumBelow" : current.serumPhosphate.status === "within" ? "serumWithin" : "noSerumReference"] || "Brak dopasowanego zakresu fosforanów do oceny celu leczenia.";
    if (current.serumPhosphate.status === "above") { result.title = "Fosforany powyżej normy"; result.tone = "danger"; }
    // General renal-context cautions already appear once in the main result.
    // This section carries only the additional treatment-specific message.
    result.cautions = [current.status === "above" ? notes.tmpAboveDuringTreatment : "", data.daysSinceDoseState === "invalid" ? "Czas od dawki musi być nieujemną liczbą. Bieżący wynik pozostaje dostępny; czas pobrania zapisujemy jako nieznany." : ""].filter(Boolean);
    result.limitations = [number(data.ageYears) < 18 ? notes.childTreatment : notes.adultTreatment, notes.trend].filter(Boolean);
    const previousInput = previous?.input || {}, currentDate = dateValue(data.clinicalDate), previousDate = dateValue(previousInput.clinicalDate || previous?.clinicalDate);
    const currentDays = number(data.daysSinceDose), previousDays = number(previousInput.daysSinceDose);
    const usablePrevious = previous?.schema === "clcr-tmp-gfr" && previous.valid === true && Number.isFinite(previous.rawValue);
    if (usablePrevious) result.comparison = { previous: { value: previous.rawValue, display: previous.display?.text || formatValue(previous.rawValue), date: previousInput.clinicalDate || previous.clinicalDate || "", daysSinceDose: previousDays }, current: { value: current.rawValue, display: current.display.text, date: data.clinicalDate, daysSinceDose: currentDays }, unit: "mmol/L", label: "Poprzedni zapis → bieżący wynik" };
    let reason = options.comparisonReason || "";
    if (!reason && !usablePrevious) reason = "no-history";
    if (!reason && data.patientId && previousInput.patientId && data.patientId !== previousInput.patientId) reason = "different-patient";
    if (!reason && (currentDate === null || previousDate === null || previousDate >= currentDate)) reason = "ambiguous-date";
    if (!reason && previous.method !== current.method) reason = "method-change";
    if (!reason && previousInput.burosumab !== true) reason = "unknown-treatment";
    if (!reason && (current.cautions.length || renalCautions(previousInput).length || [previousInput.pairedSameTime, previousInput.sameUrineSpecimen].includes("different"))) reason = "clinical-context";
    if (!reason && (currentDays === null || previousDays === null || currentDays < 0 || previousDays < 0)) reason = "missing-timing";
    if (!reason && currentDays !== previousDays) reason = "different-timing";
    const reasons = {
      "no-history": "Brak wcześniejszego wyniku z danymi pozwalającymi porównać pomiary. Ten wynik opisuje aktualny stan.",
      "no-patient": "Porównanie z historią jest dostępne po wybraniu zapisanej karty pacjenta.",
      "patient-unavailable": "Porównanie z historią jest dostępne po wybraniu zapisanej karty pacjenta.",
      "history-unavailable": "Nie można odczytać historii pacjenta. Ten widok pokazuje bieżący wynik bez porównania z historią.",
      "history-loading": "Trwa odczyt historii pacjenta. Bieżący wynik pozostaje dostępny.",
      "missing-date": "Data bieżącego pomiaru jest potrzebna do ustalenia kolejności wyników.",
      "unknown-previous-context": "Poprzedni zapis nie zawiera danych pozwalających porównać metodę i czas pobrania względem dawki.",
      "no-earlier-result": "Brak wcześniejszego wyniku z danymi pozwalającymi porównać pomiary.",
      "ambiguous-date": "Nie określono jednoznacznej kolejności pobrań. Nie oceniamy kierunku zmiany.",
      "different-patient": "Nie porównujemy wyników różnych pacjentów.",
      "method-change": "Poprzedni wynik obliczono inną metodą. Różnica nie musi oznaczać zmiany odpowiedzi na lek.",
      "unknown-treatment": "Brak potwierdzonego kontekstu leczenia w poprzednim zapisie. Nie oceniamy zmiany podczas terapii.",
      "clinical-context": "Przy zapisanych ograniczeniach nie porównujemy zmiany podczas terapii.",
      "missing-timing": "Nie znamy czasu obu pobrań względem dawki. Nie oceniamy zmiany podczas terapii.",
      "different-timing": "Pomiary wykonano w innym czasie względem dawki. Różnicy nie oceniamy jako poprawy lub pogorszenia odpowiedzi na lek.",
    };
    if (reason) { result.reason = own(reasons, reason) ? reason : "no-earlier-result"; result.trendMessage = reasons[result.reason]; return result; }
    result.comparisonAllowed = true;
    const noise = 8 * Number.EPSILON * Math.max(1, Math.abs(current.rawValue), Math.abs(previous.rawValue));
    result.direction = current.rawValue > previous.rawValue + noise ? "up" : current.rawValue < previous.rawValue - noise ? "down" : "same";
    result.trendMessage = result.direction === "same" ? "TmP/GFR ma taką samą wartość jak w poprzednim porównywalnym pomiarze." : `TmP/GFR jest ${result.direction === "up" ? "wyższy" : "niższy"} niż w poprzednim porównywalnym pomiarze.`;
    return result;
  }
  function evaluate(input, policy, options = {}) {
    const result = compute(input), data = result.input, hasPolicy = validPolicy(policy), notes = hasPolicy ? policy.notes : {};
    const candidates = result.valid && hasPolicy ? policy.profiles.filter(profile => profile.method === result.method && ageMatches(profile, data)).map(profile => rangeOf(profile)) : [];
    const reference = candidates.length === 1 && ageCovered(candidates[0], data) ? candidates[0] : null, status = classify(result.rawValue, reference), cautions = renalCautions(data);
    const serumCandidates = result.valid && hasPolicy ? policy.serumProfiles.filter(profile => (!profile.sex || !data.sex || profile.sex === data.sex) && ageMatches(profile, data)).map(profile => rangeOf(profile, CONVERSION_CONSTANTS.phosphorusMgDlPerMmolL)) : [];
    const sameSerumLimits = serumCandidates.length && serumCandidates.every(profile => ageCovered(profile, data) && profile.lower === serumCandidates[0].lower && profile.upper === serumCandidates[0].upper);
    const serumReference = sameSerumLimits ? { ...serumCandidates[0], candidateIds: serumCandidates.map(profile => profile.id), ageLabel: serumCandidates.length > 1 ? "Zakres wspólny dla podanego wieku" : serumCandidates[0].ageLabel } : null;
    const serumStatus = classify(result.normalized?.serumPhosphate, serumReference);
    const snapshot = {
      schema: "clcr-tmp-gfr", version: 1, engineVersion: ENGINE_VERSION, valid: result.valid, rawValue: result.rawValue, unit: "mmol/L", method: result.method || null, branch: result.branch || null, trp: result.trp ?? null, fePo4: result.fePo4 ?? null,
      normalized: result.normalized ? copy(result.normalized) : null, input: copy(data), display: result.display || { text: "", unit: "mmol/L" },
      status, statusText: !result.valid ? "" : status === "below" ? "Obniżony TmP/GFR" : status === "above" ? "Podwyższony TmP/GFR" : status === "within" ? "TmP/GFR w normie dla wieku" : "TmP/GFR — wynik obliczenia", tone: status === "within" ? "success" : status === "unassessed" ? "neutral" : "warning", outOfRange: status === "unassessed" ? null : status !== "within", category: null,
      interpretation: !result.valid ? "" : reference ? notes[status] || "" : candidates.length > 1 ? notes.ambiguousAge || "" : result.method === "Walton–Bijvoet/Payne" ? notes.noWaltonReference || "" : "Nie dobrano zakresu referencyjnego dla podanego wieku.",
      reference, referenceAvailable: Boolean(reference), referenceActive: Boolean(reference), referenceLabel: "Norma dla wieku", referenceText: reference ? rangeText(reference) : candidates.length > 1 ? "Różne zakresy źródłowe" : "Brak dopasowanego zakresu", referenceAlternatives: candidates.length > 1 ? candidates : [], references: candidates,
      referenceRows: hasPolicy ? policy.profiles.map(profile => ({ ...rangeOf(profile), label: profile.label, selected: reference?.id === profile.id })) : [],
      serumPhosphate: { value: result.normalized?.serumPhosphate ?? null, unit: "mmol/L", display: { text: formatValue(result.normalized?.serumPhosphate), unit: "mmol/L" }, status: serumStatus, statusText: serumStatus === "below" ? "poniżej normy" : serumStatus === "above" ? "powyżej normy" : serumStatus === "within" ? "w normie" : "bez dopasowanej normy", tone: serumStatus === "above" ? "danger" : serumStatus === "below" ? "warning" : "neutral", reference: serumReference, referenceText: serumReference ? rangeText(serumReference) : "Brak dopasowanego zakresu", referenceLabel: "Norma dla wieku", referenceAlternatives: serumReference ? [] : serumCandidates, referenceHint: serumReference ? "Porównanie orientacyjne wg Mayo" : number(data.ageYears) < 1 ? "Mayo nie podaje zakresu dla dzieci poniżej 1. roku życia." : !data.sex ? "Zakres zależy od płci zapisanej w danych pacjenta." : "Nie dobrano jednoznacznego zakresu dla podanego wieku." },
      trpResult: { value: result.valid ? result.trp * 100 : null, unit: "%", display: { text: result.valid ? formatValue(result.trp * 100, 1) : "", unit: "%" }, tone: "neutral", referenceLabel: hasPolicy ? policy.trpReference?.label || "Zakres orientacyjny" : "Punkt odniesienia", referenceText: hasPolicy && policy.trpReference ? `${formatValue(policy.trpReference.lower, 0)}–${formatValue(policy.trpReference.upper, 0)}%` : "Brak profilu", reference: hasPolicy ? copy(policy.trpReference || null) : null, interpretation: notes.trp || "" },
      knownFacts: { knownCKD: data.knownCKD, knownAKI: data.knownAKI, rapidlyChangingCreatinine: data.rapidlyChangingCreatinine }, sample: { pairedSameTime: data.pairedSameTime, sameUrineSpecimen: data.sameUrineSpecimen, evidence: copy(data.sampleEvidence) }, cautions,
      policy: hasPolicy ? { id: policy.id, version: policy.version } : null, population: hasPolicy ? copy(policy.population) : null, sources: hasPolicy ? copy(policy.sources) : [], notes: hasPolicy ? copy(notes) : {}, restrictions: hasPolicy ? copy(policy.restrictions) : {}, conversion: copy(CONVERSION_CONSTANTS), errorCode: result.errorCode, error: result.error,
    };
    snapshot.treatment = compareTreatment(snapshot, options.previous || null, policy, options);
    snapshot.therapy = copy(snapshot.treatment);
    return freeze(snapshot);
  }
  return Object.freeze({ ENGINE_VERSION, CONVERSION_CONSTANTS, FIELD_IDS, ERRORS, compute, evaluate, compareTreatment, classify, formatValue, inputFromValues, readInputFromDocument });
});
