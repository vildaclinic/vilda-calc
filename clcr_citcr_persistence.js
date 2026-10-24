(function (root, factory) {
  const api = factory();
  if (root) root.ClcrCitcrPersistence = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  // The existing vault schema retains clinical text and a small labResult.
  // Keep the assessment in readable, versioned note lines; never re-evaluate
  // a historical sample with the current patient's age or a newer profile.
  const NOTE_HEADER = "Cit/Cr — ocena w chwili zapisu (wersja 1):";
  const CANONICAL_LABEL = "Cytryniany/kreatynina (próbka punktowa)";
  const MASS_UNITS = ["mg/mg", "mg/g", "mg/mmol"];
  const MOLAR_UNITS = ["µmol/mmol", "umol/mmol", "mmol/mol", "mmol/mmol", "mol/mol"];
  const BASIS_LABELS = Object.freeze({ ion: "jon cytrynianowy", acid: "kwas cytrynowy bezwodny", unknown: "nie podano", "": "jednostka molowa — postać masowa nie dotyczy" });
  const ASSESSMENTS = Object.freeze({ below: "poniżej zakresu", within: "w zakresie", above: "powyżej zakresu", unassessed: "nie oceniono" });
  const COMPARISONS = Object.freeze({ below: "poniżej zakresu", within: "w zakresie", above: "powyżej zakresu", ambiguous: "przedział obejmuje różne poziomy" });
  const FACT_LABELS = Object.freeze({ menstruation: "miesiączka", hematuria: "krwiomocz", infection: "infekcja", exercise: "intensywny wysiłek", acuteIllness: "ostra choroba", diureticUse: "leczenie diuretykiem", knownCKD: "przewlekła choroba nerek" });
  const UNIT_KEYS = Object.freeze({ "µmol/mmol": "umolmmol", "umol/mmol": "umolmmol", "mmol/mol": "mmolmol", "mmol/mmol": "mmolmmol", "mol/mol": "molmol", "mg/mg": "mgmg", "mg/g": "mgg", "mg/mmol": "mgmmol" });
  const line = value => typeof value === "string" ? Array.from(value.replace(/[\r\n]+/g, " ")).filter(char => char.codePointAt(0) >= 32).join("").trim() : "";
  const number = value => Number.isFinite(value) ? String(value).replace(".", ",") : "";
  const normalized = value => String(value ?? "").replace(/\s+/g, "").replace(/,/g, ".");
  const normalizeUnit = value => value === "umol/mmol" ? "µmol/mmol" : value;
  function basisOf(snapshot) {
    return MASS_UNITS.includes(snapshot?.unit) ? ["ion", "acid", "unknown"].includes(snapshot.basis) ? snapshot.basis : "unknown" : "";
  }
  function displayLabel(label, unit, basis) {
    if (label !== CANONICAL_LABEL || !MASS_UNITS.includes(unit)) return label;
    const suffix = basis === "unknown" ? "postać masowa niepodana" : BASIS_LABELS[basis];
    return suffix ? `${label} · ${suffix}` : label;
  }
  function canonicalLabel(label) {
    if (label === CANONICAL_LABEL) return label;
    for (const basis of ["ion", "acid", "unknown"]) {
      if (label === displayLabel(CANONICAL_LABEL, "mg/mg", basis)) return CANONICAL_LABEL;
    }
    return label;
  }
  function testKeyFor(unit, basis) {
    return UNIT_KEYS[unit] ? `clcr-citcr-${basis || "si"}-${UNIT_KEYS[unit]}` : "";
  }
  function displayText(snapshot) {
    const shown = snapshot?.display?.text;
    return typeof shown === "string" && shown.trim() ? shown.replace(/\./g, ",")
      : `${snapshot?.comparator || ""}${number(snapshot?.rawValue)}`;
  }
  function readSnapshot(encoded) {
    if (typeof encoded !== "string" || encoded.length > 60000) return null;
    try {
      const snapshot = JSON.parse(encoded);
      if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) || snapshot.schema !== "clcr-citcr" || snapshot.version !== 1) return null;
      if (!Number.isFinite(snapshot.rawValue) || snapshot.rawValue < 0 || snapshot.valid === false) return null;
      if (![...MASS_UNITS, ...MOLAR_UNITS].includes(snapshot.unit)) return null;
      if (!["", "<", ">", "≤", "≥"].includes(snapshot.comparator || "")) return null;
      if (!Object.hasOwn(ASSESSMENTS, snapshot.status)) return null;
      const basis = basisOf(snapshot);
      if (MASS_UNITS.includes(snapshot.unit) && snapshot.basis !== basis) return null;
      if (!MASS_UNITS.includes(snapshot.unit) && snapshot.basis) return null;
      if (snapshot.referenceAvailable && (!snapshot.reference || snapshot.status !== "unassessed" && !snapshot.profileId)) return null;
      return snapshot;
    } catch (_) { return null; }
  }
  function augmentDatapoint(card, datapoint) {
    if (datapoint?.sourceFormulaId !== "CitCr_spot") return datapoint;
    const snapshot = readSnapshot(card?.getAttribute?.("data-clcr-citcr-snapshot"));
    if (!snapshot) return datapoint;
    Object.assign(datapoint, {
      citcrSnapshot: snapshot, valueNum: snapshot.rawValue, unit: snapshot.unit,
      originalUnit: snapshot.originalUnit, basis: basisOf(snapshot), comparator: snapshot.comparator || "",
      displayValue: displayText(snapshot),
      norm: snapshot.referenceAvailable && snapshot.reference
        ? `${String(snapshot.reference.range || snapshot.reference.limit || "").replace(/\./g, ",")} ${snapshot.unit}`.trim() : "",
      outOfRange: snapshot.status === "unassessed" ? null : ["below", "above"].includes(snapshot.status),
    });
    return datapoint;
  }
  function labValue(datapoint) {
    const snapshot = datapoint?.citcrSnapshot;
    if (!snapshot) return "";
    const display = datapoint.displayValue || displayText(snapshot);
    // The vault's existing value field holds 120 characters. The complete
    // original input remains in the note even for an unusually long decimal.
    return display.length <= 120 ? display : `${snapshot.comparator || ""}${number(snapshot.rawValue)}`;
  }
  function applyLabResult(datapoint, labResult) {
    const snapshot = datapoint?.citcrSnapshot;
    if (datapoint?.sourceFormulaId !== "CitCr_spot" || !snapshot || !labResult) return labResult;
    Object.assign(labResult, { test: displayLabel(canonicalLabel(labResult.test), snapshot.unit, basisOf(snapshot)), value: labValue(datapoint), unit: snapshot.unit,
      testKey: testKeyFor(snapshot.unit, basisOf(snapshot)), valueNum: snapshot.rawValue });
    // A censored endpoint is not an exact point in the generic vault chart.
    if (snapshot.comparator) delete labResult.valueNum;
    return labResult;
  }
  function referenceNote(datapoint) {
    const snapshot = datapoint?.citcrSnapshot;
    if (datapoint?.sourceFormulaId !== "CitCr_spot" || !snapshot) return "";
    const lines = [NOTE_HEADER,
      `Tryb: ${snapshot.mode === "direct" ? "wynik Cit/Cr z laboratorium" : "obliczono ze stężeń"}.`,
      `Wynik przed zaokrągleniem: ${snapshot.comparator || ""}${number(snapshot.rawValue)} ${snapshot.unit}.`,
      `Wynik zapisany: ${labValue(datapoint)} ${snapshot.unit}.`,
      `Postać analitu: ${BASIS_LABELS[basisOf(snapshot)]}.`,
      `Jednostka wejściowa wyniku: ${line(snapshot.originalUnit) || snapshot.unit}.`,
      `Klucz serii: ${testKeyFor(snapshot.unit, basisOf(snapshot))}.`,
      `Ocena: ${ASSESSMENTS[snapshot.status] || ASSESSMENTS.unassessed}.`,
      `Kategoria Cit/Cr: ${COMPARISONS[snapshot.category] || "nie nadano"}.`,
      `Porównanie z zakresem: ${COMPARISONS[snapshot.comparison] || "nie wykonano"}.`,
    ];
    if (datapoint.norm) lines.push(`Norma pokazana przy wyniku: ${line(datapoint.norm)}.`);
    const reference = snapshot.reference;
    if (reference) {
      const low = reference.nativeLow ?? reference.nativeLower;
      const high = reference.nativeHigh ?? reference.nativeUpper;
      if (Number.isFinite(low)) lines.push(`Dolna granica źródłowa: ${number(low)} ${reference.nativeUnit || "µmol/mmol"}; ${reference.lowerInclusive === false ? "wyłączona" : "włączona"}.`);
      if (Number.isFinite(high)) lines.push(`Górna granica źródłowa: ${number(high)} ${reference.nativeUnit || "µmol/mmol"}; ${reference.upperInclusive === false ? "wyłączona" : "włączona"}.`);
      if (Number.isFinite(reference.lower)) lines.push(`Dolna granica w jednostce wyniku: ${number(reference.lower)} ${snapshot.unit}.`);
      if (Number.isFinite(reference.upper)) lines.push(`Górna granica w jednostce wyniku: ${number(reference.upper)} ${snapshot.unit}.`);
      if (line(reference.band?.label || reference.band?.sourceAge)) lines.push(`Grupa wieku źródła: ${line(reference.band.label || reference.band.sourceAge)}.`);
      if (line(reference.kind || reference.referenceKind || snapshot.restrictions?.referenceKind)) lines.push(`Rodzaj odniesienia: ${line(reference.kind || reference.referenceKind || snapshot.restrictions.referenceKind)}.`);
    }
    for (const [label, fraction] of [["Dokładny iloraz wyniku", snapshot.exactValue], ["Dokładny iloraz na osi molowej", snapshot.exactNativeSI]]) {
      if (/^\d+$/.test(fraction?.numerator || "") && /^[1-9]\d*$/.test(fraction?.denominator || "")) lines.push(`${label}: ${fraction.numerator}/${fraction.denominator}.`);
    }
    if (snapshot.conversion?.version != null) lines.push(`Wersja przeliczeń: ${snapshot.conversion.version}.`);
    const constants = snapshot.conversion?.constants || {};
    for (const [key, label] of [["citrateIonMgPerMmol", "Stała jonu cytrynianowego"], ["citricAcidMgPerMmol", "Stała bezwodnego kwasu cytrynowego"], ["creatinineMgPerMmol", "Stała kreatyniny"]]) {
      if (line(constants[key])) lines.push(`${label}: ${line(constants[key])} mg/mmol.`);
    }
    if (constants.provenance && typeof constants.provenance === "object") for (const [key, value] of Object.entries(constants.provenance)) if (line(value)) lines.push(`Pochodzenie stałej — ${line(key)}: ${line(value)}`);
    if (line(snapshot.notes?.constants)) lines.push(`Stałe użyte do przeliczeń: ${line(snapshot.notes.constants)}`);
    if (Number.isFinite(snapshot.classificationValue)) lines.push(`Wartość na osi molowej: ${number(snapshot.classificationValue)} µmol/mmol.`);
    if (line(snapshot.statusText)) lines.push(`Opis wyniku: ${line(snapshot.statusText)}`);
    if (line(snapshot.qualification?.note)) lines.push(`Ograniczenie oceny: ${line(snapshot.qualification.note)}`);
    if (line(snapshot.qualification?.reasonCode)) lines.push(`Powód ograniczenia: ${line(snapshot.qualification.reasonCode)}.`);
    const age = snapshot.context?.ageYears;
    lines.push(Number.isFinite(age) ? `Wiek użyty przy ocenie: ${number(age)} lat.` : "Wiek użyty przy ocenie: nieznany.");
    lines.push(`Płeć użyta przy ocenie: ${{ M: "mężczyzna", F: "kobieta" }[snapshot.context?.sex] || "nie podano"}.`);
    const input = snapshot.input || {};
    if (snapshot.mode === "direct") {
      lines.push(`Wynik wpisany z laboratorium: ${line(String(input.reportedValue ?? ""))} ${line(input.reportedUnit) || snapshot.unit}.`);
    } else {
      lines.push(`Cytryniany w moczu: ${line(String(input.citrateValue ?? ""))} ${line(input.citrateUnit)}.`);
      lines.push(`Kreatynina w moczu: ${line(String(input.creatinineValue ?? ""))} ${line(input.creatinineUnit)}.`);
      lines.push(snapshot.context?.sameSpecimen === "confirmed" ? "Próbka: potwierdzono tę samą próbkę moczu." : "Próbka: założono tę samą próbkę moczu.");
    }
    const sample = { firstMorning: "pierwszy poranny mocz", secondMorning: "drugi poranny mocz", random: "próbka losowa", timed: "próbka ze zbiórki czasowej" }[snapshot.context?.sampleType];
    lines.push(`Rodzaj próbki: ${sample || "nie podano"}.`);
    const factors = Array.isArray(snapshot.context?.confounders) ? snapshot.context.confounders : [];
    if (factors.length) lines.push(`Zgłoszone czynniki: ${factors.map(key => FACT_LABELS[key] || line(key)).join(", ")}.`);
    const facts = snapshot.context?.knownFacts;
    if (facts && typeof facts === "object" && !Array.isArray(facts)) {
      for (const [key, value] of Object.entries(facts)) {
        const answer = typeof value === "boolean" ? value ? "tak" : "nie" : value === null ? "nie wiadomo" : line(value);
        if (answer) lines.push(`Podana informacja — ${FACT_LABELS[key] || line(key)}: ${answer}.`);
      }
    } else if (Array.isArray(facts)) {
      const values = facts.filter(value => typeof value === "string" && value.trim());
      if (values.length) lines.push(`Dodatkowe podane informacje: ${values.map(line).join("; ")}.`);
    }
    if (typeof snapshot.context?.population?.currentPreterm === "boolean") lines.push(`Bieżący kontekst wcześniaczy: ${snapshot.context.population.currentPreterm ? "tak" : "nie"}.`);
    const source = snapshot.source || reference?.source || {};
    for (const [label, value] of [["Nazwa źródła normy", source.label], ["Identyfikator źródła", source.id], ["Wersja źródła", source.version || source.lastUpdated], ["Data odczytu źródła", source.accessedAt], ["Adres źródła", source.url], ["Miejsce w źródle", source.section]]) {
      if (line(value)) lines.push(`${label}: ${line(value)}`);
    }
    if (snapshot.policyId) lines.push(`Polityka odniesienia: ${line(snapshot.policyId)}; wersja ${snapshot.policyVersion ?? "niepodana"}.`);
    if (snapshot.profileId) lines.push(`Profil odniesienia: ${line(snapshot.profileId)}; wersja ${snapshot.profileVersion ?? "niepodana"}.`);
    const population = typeof snapshot.population === "string" ? snapshot.population : snapshot.population?.label;
    if (line(population)) lines.push(`Populacja odniesienia: ${line(population)}`);
    if (source.method) lines.push(`Metoda źródła: ${line(source.method)}`);
    if (source.methods && typeof source.methods === "object") {
      for (const [key, value] of Object.entries(source.methods)) if (line(value)) lines.push(`Metoda źródła — ${line(key)}: ${line(value)}`);
    }
    if (line(snapshot.notes?.source)) lines.push(`Zastosowanie źródła: ${line(snapshot.notes.source)}`);
    if (line(snapshot.notes?.agePolicy)) lines.push(`Polityka wieku: ${line(snapshot.notes.agePolicy)}`);
    lines.push("Porównanie jest orientacyjne. Obniżony Cit/Cr może wskazywać na słabszą ochronę przed kamicą wapniową. Bywa związany m.in. z kwasicą metaboliczną lub hipokaliemią; sam wynik nie ustala przyczyny. Wynik nieobniżony nie wyklucza kamicy.");
    return lines.join("\n");
  }
  function hasSavedAssessment(note) { return typeof note?.body === "string" && note.body.includes(NOTE_HEADER); }
  function savedAssessment(note) {
    const body = typeof note?.body === "string" ? note.body : "";
    const start = body.indexOf(NOTE_HEADER);
    if (start < 0 || body.length > 80000) return null;
    const text = body.slice(start);
    const get = label => text.split("\n").find(row => row.startsWith(label + ": "))?.slice(label.length + 2) || "";
    const raw = /^([<>≤≥]?)([\d.,eE+-]+) (µmol\/mmol|umol\/mmol|mmol\/mol|mmol\/mmol|mol\/mol|mg\/mg|mg\/g|mg\/mmol)\.$/.exec(get("Wynik przed zaokrągleniem"));
    if (!raw) return null;
    const rawValue = Number(raw[2].replace(",", "."));
    if (!Number.isFinite(rawValue) || rawValue < 0) return null;
    const unit = raw[3];
    const basisText = get("Postać analitu").replace(/\.$/, "");
    const basis = Object.keys(BASIS_LABELS).find(key => BASIS_LABELS[key] === basisText);
    if (basis === undefined || (MASS_UNITS.includes(unit) ? basis === "" : basis !== "")) return null;
    const displayLine = get("Wynik zapisany");
    const ending = ` ${unit}.`;
    if (!displayLine.endsWith(ending)) return null;
    const displayValue = displayLine.slice(0, -ending.length);
    const lab = note.labResult || {};
    const testKey = get("Klucz serii").replace(/\.$/, "");
    if (testKey !== testKeyFor(unit, basis) || lab.testKey !== testKey) return null;
    if (lab.test !== displayLabel(CANONICAL_LABEL, unit, basis)) return null;
    if (String(lab.unit ?? "") !== unit || normalized(lab.value) !== normalized(displayValue)) return null;
    if (raw[1] ? Number.isFinite(lab.valueNum) : lab.valueNum !== rawValue) return null;
    const norm = get("Norma pokazana przy wyniku").replace(/\.$/, "");
    if (normalized(lab.norm) !== normalized(norm)) return null;
    const status = Object.keys(ASSESSMENTS).find(key => ASSESSMENTS[key] === get("Ocena").replace(/\.$/, ""));
    if (!status) return null;
    const category = Object.keys(COMPARISONS).find(key => COMPARISONS[key] === get("Kategoria Cit/Cr").replace(/\.$/, "")) || null;
    const comparison = Object.keys(COMPARISONS).find(key => COMPARISONS[key] === get("Porównanie z zakresem").replace(/\.$/, "")) || null;
    const ageMatch = /^([\d.,eE+-]+) lat\.$/.exec(get("Wiek użyty przy ocenie"));
    const age = ageMatch ? Number(ageMatch[1].replace(",", ".")) : null;
    const sex = ({ "mężczyzna": "M", "kobieta": "F" })[get("Płeć użyta przy ocenie").replace(/\.$/, "")] || "";
    const profile = /^([^;\n]+); wersja ([^\n]+)\.$/.exec(get("Profil odniesienia"));
    const readLimit = label => {
      const match = /^([\d.,eE+-]+) (.+); (włączona|wyłączona)\.$/.exec(get(label));
      return match && Number.isFinite(Number(match[1].replace(",", "."))) ? { value: Number(match[1].replace(",", ".")), unit: match[2], inclusive: match[3] === "włączona" } : null;
    };
    const lower = readLimit("Dolna granica źródłowa"), upper = readLimit("Górna granica źródłowa");
    const readInput = label => {
      const match = /^((?:[<>]=?|[≤≥])?\s*[\d.,eE+-]+) (.+)\.$/.exec(get(label));
      return match ? { value: match[1], unit: match[2] } : null;
    };
    const citrate = readInput("Cytryniany w moczu"), creatinine = readInput("Kreatynina w moczu"), reported = readInput("Wynik wpisany z laboratorium");
    const samples = { "pierwszy poranny mocz": "firstMorning", "drugi poranny mocz": "secondMorning", "próbka losowa": "random", "próbka ze zbiórki czasowej": "timed" };
    const knownFacts = {};
    for (const row of text.split("\n")) {
      const fact = /^Podana informacja — ([^:]+): (.+)\.$/.exec(row);
      if (!fact) continue;
      const key = Object.keys(FACT_LABELS).find(key => FACT_LABELS[key] === fact[1]) || fact[1];
      knownFacts[key] = ({ tak: true, nie: false, "nie wiadomo": null })[fact[2]] ?? (fact[2] === "nie wiadomo" ? null : fact[2]);
    }
    const policy = /^([^;\n]+); wersja ([^\n]+)\.$/.exec(get("Polityka odniesienia"));
    const readFraction = label => {
      const match = /^(\d+)\/([1-9]\d*)\.$/.exec(get(label));
      return match ? { numerator: match[1], denominator: match[2] } : null;
    };
    const conversionConstants = {};
    for (const [key, label] of [["citrateIonMgPerMmol", "Stała jonu cytrynianowego"], ["citricAcidMgPerMmol", "Stała bezwodnego kwasu cytrynowego"], ["creatinineMgPerMmol", "Stała kreatyniny"]]) {
      const match = /^([\d.]+) mg\/mmol\.$/.exec(get(label));
      if (match) conversionConstants[key] = match[1];
    }
    const provenance = {};
    for (const row of text.split("\n")) {
      const match = /^Pochodzenie stałej — ([^:]+): (.+)$/.exec(row);
      if (match) provenance[match[1]] = match[2];
    }
    if (Object.keys(provenance).length) conversionConstants.provenance = provenance;
    const conversionVersion = /^(\d+)\.$/.exec(get("Wersja przeliczeń"));
    return {
      rawValue, unit, originalUnit: get("Jednostka wejściowa wyniku").replace(/\.$/, ""), basis, comparator: raw[1], displayValue,
      mode: reported ? "direct" : "concentration", status, category, comparison, norm, testKey, ageYears: age !== null && Number.isFinite(age) ? age : null,
      profileId: profile?.[1] || null, profileVersion: profile?.[2] || null,
      conversion: conversionVersion ? { version: Number(conversionVersion[1]), constants: conversionConstants } : null,
      policyId: policy?.[1] || null, policyVersion: policy?.[2] || null, constantsNote: get("Stałe użyte do przeliczeń"),
      exactValue: readFraction("Dokładny iloraz wyniku"), exactNativeSI: readFraction("Dokładny iloraz na osi molowej"),
      input: reported ? { reportedValue: reported.value, reportedUnit: reported.unit } : { citrateValue: citrate?.value ?? null, citrateUnit: citrate?.unit ?? "", creatinineValue: creatinine?.value ?? null, creatinineUnit: creatinine?.unit ?? "" },
      context: { ageYears: age !== null && Number.isFinite(age) ? age : null, sex, sameSpecimen: reported ? "not-applicable" : get("Próbka").startsWith("potwierdzono") ? "confirmed" : "assumed", sampleType: samples[get("Rodzaj próbki").replace(/\.$/, "")] || "", knownFacts,
        confounders: get("Zgłoszone czynniki").replace(/\.$/, "").split(", ").filter(Boolean).map(value => Object.keys(FACT_LABELS).find(key => FACT_LABELS[key] === value) || value),
        population: get("Bieżący kontekst wcześniaczy") ? { currentPreterm: get("Bieżący kontekst wcześniaczy") === "tak." } : {} },
      source: { label: get("Nazwa źródła normy"), method: get("Metoda źródła"), id: get("Identyfikator źródła"), version: get("Wersja źródła"), accessedAt: get("Data odczytu źródła"), url: get("Adres źródła"), section: get("Miejsce w źródle") },
      reference: upper || lower ? { nativeLow: lower?.value ?? null, nativeHigh: upper?.value ?? null, nativeUnit: upper?.unit || lower?.unit || "µmol/mmol", lowerInclusive: lower?.inclusive ?? null, upperInclusive: upper?.inclusive ?? null, kind: get("Rodzaj odniesienia").replace(/\.$/, ""), band: { label: get("Grupa wieku źródła").replace(/\.$/, "") } } : null,
      population: get("Populacja odniesienia"), contextNote: text,
    };
  }
  function legacyPoint(note) {
    const value = note?.labResult?.value;
    if (typeof value !== "string" || value.length > 256) return null;
    const match = /^\s*([<>]=?|[≤≥])\s*((?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?)\s*$/.exec(value);
    if (!match) return null;
    const endpoint = Number(match[2].replace(",", "."));
    if (!Number.isFinite(endpoint) || endpoint < 0) return null;
    return { rawValue: endpoint, valueNum: null, comparator: ({ "<=": "≤", ">=": "≥" })[match[1]] || match[1], displayValue: value.trim(), outOfRange: null };
  }
  function savedBasis(note, unit) {
    const lab = note?.labResult;
    if (!lab || !MASS_UNITS.includes(unit)) return "";
    return ["ion", "acid", "unknown"].find(basis => lab.test === displayLabel(CANONICAL_LABEL, unit, basis) && lab.testKey === testKeyFor(unit, basis)) || "unknown";
  }
  function seriesKey(label, unit, assessment, note) {
    const basis = assessment?.basis ?? savedBasis(note, unit);
    // A legacy mass result has no analyte-basis evidence. It never joins an
    // acid or ion series merely because both are labelled mg/mg.
    const identity = assessment?.testKey || testKeyFor(normalizeUnit(unit), MASS_UNITS.includes(unit) ? basis : "");
    return `${label}\n${unit}\n${identity || (hasSavedAssessment(note) ? "edited-unknown-basis" : "legacy-unknown-basis")}`;
  }
  return Object.freeze({ NOTE_HEADER, BASIS_LABELS, canonicalLabel, displayLabel, readSnapshot, augmentDatapoint, labValue, applyLabResult, referenceNote, savedAssessment, hasSavedAssessment, legacyPoint, seriesKey, savedBasis, testKeyFor, displayText });
});
