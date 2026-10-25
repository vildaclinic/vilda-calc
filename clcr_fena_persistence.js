(function (root, factory) {
  const api = factory();
  if (root) root.ClcrFenaPersistence = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  // The vault intentionally stores only its existing labResult schema. Keep
  // the original assessment in versioned, readable note lines and restore it
  // without invoking the current engine, patient context or reference policy.
  const NOTE_HEADER = "FENa — ocena w chwili zapisu (wersja 1):";
  const TEST_KEY = "clcr-fena-percent";
  const LABEL = "Frakcja wydalania sodu (FENa)";
  const SAMPLE_STATES = ["assumed", "confirmed", "different"];
  const SAMPLE_LABELS = Object.freeze({ assumed: "założono", confirmed: "potwierdzono", different: "niezgodne próbki" });
  const FACT_LABELS = Object.freeze({ diureticUse: "leczenie diuretykiem", knownCKD: "przewlekła choroba nerek" });
  const INPUT_LABELS = Object.freeze({ urineSodium: "Sód w moczu", serumSodium: "Sód w surowicy", urineCreatinine: "Kreatynina w moczu", serumCreatinine: "Kreatynina w surowicy" });
  const SOURCE_LABELS = Object.freeze({ id: "Identyfikator", label: "Nazwa", url: "Adres", locator: "Miejsce w źródle", version: "Wersja", population: "Populacja", doi: "DOI" });
  const RESTRICTIONS = Object.freeze({ universalNormalRangeAvailable: "Uniwersalna norma", diagnosesAKI: "Samodzielne rozpoznanie AKI", diagnosesEtiology: "Samodzielne rozpoznanie przyczyny", supportsTreatmentDecisionAlone: "Samodzielna decyzja terapeutyczna", unknownFactsAreConfirmedAbsent: "Nieznany fakt uznany za nieobecny", stableKidneyFunctionAssumed: "Założono stabilną czynność nerek", noAKIAssumed: "Założono brak AKI", assayStandardizationRequired: "Wymagane potwierdzenie standaryzacji", sameUrineSpecimenRequired: "Wymagana ta sama próbka moczu", contemporaneousBloodRequired: "Wymagana równoczesna próbka krwi", intermediateBandPolicy: "Polityka przedziału pośredniego", agePolicy: "Polityka wieku" });
  const NOTES = Object.freeze({ referenceLabel: "Etykieta progów", educationalReferenceLabel: "Etykieta progów edukacyjnych", low: "Komentarz poniżej progu", middle: "Komentarz między progami", high: "Komentarz powyżej progu", child: "Komentarz dla dziecka", unknown: "Komentarz bez wieku", diuretic: "Ograniczenie przy diuretyku", ckd: "Ograniczenie przy PChN", both: "Ograniczenie przy diuretyku i PChN", sample: "Założenie o próbkach", diagnosis: "Ograniczenie diagnostyczne", scope: "Zakres zastosowania progów", conversion: "Opis przeliczenia", noPolicy: "Komentarz bez polityki" });
  const clean = value => typeof value === "string" ? Array.from(value.replace(/[\r\n]+/g, " ").replace(/[\u00a0\u202f]/g, " ")).filter(char => char.codePointAt(0) >= 32).join("").trim() : "";
  const number = value => Number.isFinite(value) ? String(value).replace(".", ",") : "";
  const normalized = value => String(value ?? "").replace(/\s+/g, "").replace(/,/g, ".");
  const factText = value => value === true ? "tak" : value === false ? "nie" : "nie wiadomo";
  const factValue = text => text === "tak" ? true : text === "nie" ? false : null;
  const supportedUnit = unit => typeof unit === "string" && ["mg/dl", "mg/l", "umol/l", "mmol/l", "umol", "mmol"].includes(unit.replace(/[µμ]/g, "u").toLowerCase());
  const isObject = value => value && typeof value === "object" && !Array.isArray(value);
  function displayText(snapshot) { return clean(snapshot?.display?.text) || number(snapshot?.rawValue); }
  function validSnapshot(snapshot) {
    if (!isObject(snapshot) || snapshot.schema !== "clcr-fena" || snapshot.version !== 1 || snapshot.valid !== true) return false;
    if (!Number.isFinite(snapshot.rawValue) || snapshot.rawValue < 0 || snapshot.unit !== "%" || snapshot.status !== "unassessed" || snapshot.tone !== "neutral") return false;
    if (!["adult", "child", "unknown", "confounders"].includes(snapshot.context) || ![null, "low", "middle", "high"].includes(snapshot.helperBand)) return false;
    const exact = snapshot.exactValue;
    if (!isObject(exact) || typeof exact.numerator !== "string" || typeof exact.denominator !== "string" || exact.numerator.length > 6000 || exact.denominator.length > 6000 || !/^\d+$/.test(exact.numerator) || !/^[1-9]\d*$/.test(exact.denominator)) return false;
    if ((snapshot.rawValue === 0) !== /^0+$/.test(exact.numerator)) return false;
    if (!isObject(snapshot.input) || !isObject(snapshot.sample) || !isObject(snapshot.knownFacts)) return false;
    for (const key of Object.keys(INPUT_LABELS)) {
      const value = snapshot.input[key];
      if (!["string", "number"].includes(typeof value) || !String(value).trim() || String(value).length > 256) return false;
    }
    if (!supportedUnit(snapshot.input.urineCreatinineUnit) || !supportedUnit(snapshot.input.serumCreatinineUnit)) return false;
    if (snapshot.input.ageYears !== null && (!Number.isFinite(snapshot.input.ageYears) || snapshot.input.ageYears < 0)) return false;
    if (!SAMPLE_STATES.includes(snapshot.sample.sameUrineSpecimen) || !SAMPLE_STATES.includes(snapshot.sample.pairedSameTime) || Object.values(snapshot.sample).includes("different")) return false;
    for (const key of Object.keys(FACT_LABELS)) if (snapshot.knownFacts[key] !== null && typeof snapshot.knownFacts[key] !== "boolean") return false;
    if (!Array.isArray(snapshot.sources) || snapshot.sources.length > 20 || snapshot.sources.some(source => !isObject(source) || !["id", "label", "url"].every(key => typeof source[key] === "string"))) return false;
    if (snapshot.policy !== null && (!isObject(snapshot.policy) || typeof snapshot.policy.id !== "string" || !Number.isInteger(snapshot.policy.version))) return false;
    if (snapshot.referenceAvailable && (!isObject(snapshot.reference) || snapshot.reference.kind !== "conditional-aki-helper" || !Number.isFinite(snapshot.reference.low) || !Number.isFinite(snapshot.reference.high) || typeof snapshot.reference.active !== "boolean" || !Array.isArray(snapshot.reference.sourceIds) || snapshot.reference.sourceIds.some(id => typeof id !== "string"))) return false;
    if (snapshot.helperBand && (snapshot.context !== "adult" || snapshot.reference?.active !== true)) return false;
    return Boolean(displayText(snapshot));
  }
  function readSnapshot(encoded) {
    if (typeof encoded !== "string" || encoded.length > 60000) return null;
    try { const snapshot = JSON.parse(encoded); return validSnapshot(snapshot) ? snapshot : null; } catch (_) { return null; }
  }
  function augmentDatapoint(card, datapoint) {
    if (datapoint?.sourceFormulaId !== "FENa_spot") return datapoint;
    // FENa has no universal healthy range, including legacy numeric cards.
    datapoint.outOfRange = null;
    datapoint.norm = "";
    const snapshot = readSnapshot(card?.getAttribute?.("data-clcr-fena-snapshot"));
    if (!snapshot) return datapoint;
    Object.assign(datapoint, { fenaSnapshot: snapshot, valueNum: snapshot.rawValue, unit: "%", displayValue: displayText(snapshot) });
    return datapoint;
  }
  function applyLabResult(datapoint, labResult) {
    const snapshot = datapoint?.fenaSnapshot;
    if (datapoint?.sourceFormulaId !== "FENa_spot" || !validSnapshot(snapshot) || !labResult) return labResult;
    Object.assign(labResult, { test: LABEL, value: displayText(snapshot), valueNum: snapshot.rawValue, unit: "%", testKey: TEST_KEY });
    delete labResult.norm;
    return labResult;
  }
  function referenceNote(datapoint) {
    const snapshot = datapoint?.fenaSnapshot;
    if (datapoint?.sourceFormulaId !== "FENa_spot" || !validSnapshot(snapshot)) return "";
    const lines = [NOTE_HEADER,
      `Wynik przed zaokrągleniem: ${number(snapshot.rawValue)} %.`,
      `Wynik zapisany: ${displayText(snapshot)} %.`, `Klucz serii: ${TEST_KEY}.`,
      "Ocena: bez uniwersalnej normy; wynik neutralny.",
      `Kontekst oceny: ${snapshot.context}.`, `Przedział pomocniczy: ${snapshot.helperBand || "nie nadano"}.`,
      `Opis wyniku: ${clean(snapshot.interpretation)}`,
      `Dokładny iloraz wyniku: ${snapshot.exactValue.numerator}/${snapshot.exactValue.denominator}.`,
      `Wiek użyty przy ocenie: ${snapshot.input.ageYears === null ? "nieznany" : number(snapshot.input.ageYears) + " lat"}.`,
      `Próbka moczu: ${SAMPLE_LABELS[snapshot.sample.sameUrineSpecimen]}.`,
      `Równoczesna próbka krwi: ${SAMPLE_LABELS[snapshot.sample.pairedSameTime]}.`,
    ];
    for (const [key, label] of Object.entries(INPUT_LABELS)) {
      const unit = key === "urineCreatinine" ? snapshot.input.urineCreatinineUnit : key === "serumCreatinine" ? snapshot.input.serumCreatinineUnit : "mmol/L";
      lines.push(`${label}: ${clean(String(snapshot.input[key]))} ${clean(unit)}.`);
    }
    for (const [key, label] of Object.entries(FACT_LABELS)) lines.push(`Podana informacja — ${label}: ${factText(snapshot.knownFacts[key])}.`);
    if (snapshot.display?.boundary) lines.push(`Uwaga o precyzji: ${clean(snapshot.display.boundary)}`);
    if (Number.isInteger(snapshot.engineVersion)) lines.push(`Wersja obliczenia: ${snapshot.engineVersion}.`);
    if (snapshot.policy) lines.push(`Polityka interpretacji: ${clean(snapshot.policy.id)}; wersja ${snapshot.policy.version}.`);
    if (snapshot.population) {
      lines.push(`Populacja progów: ${clean(snapshot.population.label)}`);
      if (Number.isFinite(snapshot.population.minimumAgeYears)) lines.push(`Minimalny wiek polityki progów: ${number(snapshot.population.minimumAgeYears)} lat.`);
    }
    if (snapshot.conversion) {
      lines.push(`Stała kreatyniny: ${clean(String(snapshot.conversion.creatinineUmolPerMgDl))} µmol/L na mg/dL.`);
      if (Number.isInteger(snapshot.conversion.version)) lines.push(`Wersja przeliczeń: ${snapshot.conversion.version}.`);
    }
    if (snapshot.educationalThresholds) {
      const thresholds = snapshot.educationalThresholds;
      lines.push(`Edukacyjny dolny próg AKI: ${number(thresholds.low)} %; ${thresholds.lowInclusive ? "włączony" : "wyłączony"}.`,
        `Edukacyjny górny próg AKI: ${number(thresholds.high)} %; ${thresholds.highInclusive ? "włączony" : "wyłączony"}.`);
    }
    if (snapshot.referenceAvailable && snapshot.reference) {
      const ref = snapshot.reference;
      lines.push(`Etykieta porównania: ${clean(ref.label)}`, `Progi pokazane przy wyniku: ${clean(ref.text)}`,
        `Dolny próg pomocniczy: ${number(ref.low)} %; ${ref.lowInclusive ? "włączony" : "wyłączony"}.`,
        `Górny próg pomocniczy: ${number(ref.high)} %; ${ref.highInclusive ? "włączony" : "wyłączony"}.`,
        `Aktywne porównanie progów: ${factText(ref.active)}.`,
        `Identyfikatory źródeł progów: ${(ref.sourceIds || []).map(clean).join(", ")}.`);
    }
    for (const [key, label] of Object.entries(RESTRICTIONS)) {
      const value = snapshot.restrictions?.[key];
      if (typeof value === "boolean") lines.push(`Ograniczenie — ${label}: ${factText(value)}.`);
      else if (typeof value === "string") lines.push(`Ograniczenie — ${label}: ${clean(value)}`);
    }
    for (const [key, label] of Object.entries(NOTES)) if (typeof snapshot.notes?.[key] === "string") lines.push(`Zastosowanie — ${label}: ${clean(snapshot.notes[key])}`);
    (snapshot.sources || []).forEach((source, index) => {
      for (const [key, label] of Object.entries(SOURCE_LABELS)) if (typeof source?.[key] === "string") lines.push(`Źródło ${index + 1} — ${label}: ${clean(source[key])}`);
    });
    return lines.join("\n");
  }
  function legacyPoint(note) {
    const lab = note?.labResult;
    if (!lab || lab.unit && lab.unit !== "%") return null;
    const text = typeof lab.value === "string" ? lab.value.trim() : "";
    const signed = /^([<>]=?|[≤≥])\s*\+?((?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?)$/.exec(text);
    const match = /^\+?((?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?)$/.exec(text);
    const rawValue = signed ? Number(signed[2].replace(",", ".")) : typeof lab.valueNum === "number" && Number.isFinite(lab.valueNum) ? lab.valueNum
      : match ? Number(match[1].replace(",", ".")) : NaN;
    if (!Number.isFinite(rawValue) || rawValue < 0) return null;
    return { rawValue, valueNum: signed ? null : rawValue, displayValue: signed || match ? text : number(rawValue),
      comparator: signed ? ({ "<=": "≤", ">=": "≥" })[signed[1]] || signed[1] : "", unit: "%", outOfRange: null, norm: "" };
  }
  function hasSavedAssessment(note) { return typeof note?.body === "string" && note.body.includes(NOTE_HEADER); }
  function savedAssessment(note) {
    const body = typeof note?.body === "string" ? note.body : "";
    const start = body.indexOf(NOTE_HEADER);
    if (start < 0 || body.length > 80000) return null;
    const rows = body.slice(start).split("\n");
    const get = label => rows.find(row => row.startsWith(label + ": "))?.slice(label.length + 2) || "";
    const numeric = text => Number(text.replace(",", "."));
    const raw = /^([\d.,eE+-]+) %\.$/.exec(get("Wynik przed zaokrągleniem"));
    const shown = /^(.*?) %\.$/.exec(get("Wynik zapisany"));
    const exact = /^(\d+)\/([1-9]\d*)\.$/.exec(get("Dokładny iloraz wyniku"));
    if (!raw || !shown || !exact) return null;
    const rawValue = numeric(raw[1]), displayValue = shown[1], lab = note.labResult || {};
    if (lab.test !== LABEL || lab.unit !== "%" || lab.testKey !== TEST_KEY || lab.valueNum !== rawValue || normalized(lab.value) !== normalized(displayValue) || clean(lab.norm || "")) return null;
    if (get("Klucz serii") !== TEST_KEY + "." || get("Ocena") !== "bez uniwersalnej normy; wynik neutralny.") return null;
    if (get("Wiek użyty przy ocenie") !== "nieznany." && !/^[\d.,eE+-]+ lat\.$/.test(get("Wiek użyty przy ocenie"))) return null;
    for (const label of Object.values(FACT_LABELS)) if (!["tak.", "nie.", "nie wiadomo."].includes(get(`Podana informacja — ${label}`))) return null;
    const ageMatch = /^([\d.,eE+-]+) lat\.$/.exec(get("Wiek użyty przy ocenie"));
    const ageYears = ageMatch ? numeric(ageMatch[1]) : null;
    const sampleState = text => Object.keys(SAMPLE_LABELS).find(key => text === SAMPLE_LABELS[key] + ".");
    const sample = { sameUrineSpecimen: sampleState(get("Próbka moczu")), pairedSameTime: sampleState(get("Równoczesna próbka krwi")) };
    const knownFacts = Object.fromEntries(Object.entries(FACT_LABELS).map(([key, label]) => [key, factValue(get(`Podana informacja — ${label}`).replace(/\.$/, ""))]));
    const input = { ageYears, ...sample, ...knownFacts };
    for (const [key, label] of Object.entries(INPUT_LABELS)) {
      const match = /^(.*?) (\S+)\.$/.exec(get(label));
      if (!match) return null;
      input[key] = match[1];
      if (key.endsWith("Creatinine")) input[key + "Unit"] = match[2];
      else if (match[2] !== "mmol/L") return null;
    }
    const policyMatch = /^([^;\n]+); wersja (\d+)\.$/.exec(get("Polityka interpretacji"));
    const policy = policyMatch ? { id: policyMatch[1], version: Number(policyMatch[2]) } : null;
    const minAge = /^([\d.,eE+-]+) lat\.$/.exec(get("Minimalny wiek polityki progów"));
    const population = get("Populacja progów") ? { label: get("Populacja progów"), minimumAgeYears: minAge ? numeric(minAge[1]) : null } : null;
    const readLimit = label => {
      const match = /^([\d.,eE+-]+) %; (włączony|wyłączony)\.$/.exec(get(label));
      return match ? { value: numeric(match[1]), inclusive: match[2] === "włączony" } : null;
    };
    const lower = readLimit("Dolny próg pomocniczy"), upper = readLimit("Górny próg pomocniczy");
    const reference = lower && upper ? { kind: "conditional-aki-helper", label: get("Etykieta porównania"), text: get("Progi pokazane przy wyniku"),
      low: lower.value, high: upper.value, lowInclusive: lower.inclusive, highInclusive: upper.inclusive,
      active: get("Aktywne porównanie progów") === "tak.", sourceIds: get("Identyfikatory źródeł progów").replace(/\.$/, "").split(", ").filter(Boolean), population } : null;
    const educationalLower = readLimit("Edukacyjny dolny próg AKI"), educationalUpper = readLimit("Edukacyjny górny próg AKI");
    const educationalThresholds = educationalLower && educationalUpper ? { low: educationalLower.value, high: educationalUpper.value,
      lowInclusive: educationalLower.inclusive, highInclusive: educationalUpper.inclusive } : null;
    const restrictions = {};
    for (const [key, label] of Object.entries(RESTRICTIONS)) {
      const value = get(`Ograniczenie — ${label}`);
      if (value) restrictions[key] = value === "tak." ? true : value === "nie." ? false : value;
    }
    const notes = {};
    for (const [key, label] of Object.entries(NOTES)) if (get(`Zastosowanie — ${label}`)) notes[key] = get(`Zastosowanie — ${label}`);
    const sources = [];
    for (let index = 1; index <= 20; index += 1) {
      if (!get(`Źródło ${index} — Identyfikator`)) break;
      sources.push(Object.fromEntries(Object.entries(SOURCE_LABELS).filter(([, label]) => get(`Źródło ${index} — ${label}`)).map(([key, label]) => [key, get(`Źródło ${index} — ${label}`)])));
    }
    const conversion = /^([\d.]+) µmol\/L na mg\/dL\.$/.exec(get("Stała kreatyniny"));
    const engineVersion = /^(\d+)\.$/.exec(get("Wersja obliczenia"));
    const conversionVersion = /^(\d+)\.$/.exec(get("Wersja przeliczeń"));
    const band = get("Przedział pomocniczy").replace(/\.$/, "");
    const snapshot = { schema: "clcr-fena", version: 1, engineVersion: engineVersion ? Number(engineVersion[1]) : null,
      valid: true, rawValue, unit: "%", exactValue: { numerator: exact[1], denominator: exact[2] }, input,
      display: { text: displayValue, boundary: get("Uwaga o precyzji") }, displayValue,
      status: "unassessed", tone: "neutral", category: null, helperBand: band === "nie nadano" ? null : band,
      context: get("Kontekst oceny").replace(/\.$/, ""), label: "FENa", referenceAvailable: Boolean(reference), reference, educationalThresholds,
      errorCode: "", error: "", interpretation: get("Opis wyniku"), sample, knownFacts, policy, population, sources,
      conversion: conversion ? { creatinineUmolPerMgDl: conversion[1], version: conversionVersion ? Number(conversionVersion[1]) : null } : null,
      restrictions, notes, ageYears, norm: "", outOfRange: null };
    return validSnapshot(snapshot) ? snapshot : null;
  }
  return Object.freeze({ NOTE_HEADER, TEST_KEY, readSnapshot, displayText, augmentDatapoint, applyLabResult, referenceNote, savedAssessment, hasSavedAssessment, legacyPoint });
});
