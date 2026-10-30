/* Version-1 frozen sodium excretion records. Historical reads use captured data only. */
(function (root, factory) {
  const api = factory();
  if (root) root.ClcrSodiumDzmPersistence = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  const NOTE_HEADER = "Wydalanie sodu — ocena w chwili zapisu (wersja 1):";
  const TEST_KEY = "clcr:Na_mmol_d";
  const LABEL = "Wydalanie sodu (DZM)";
  const TREE_HEADER = "Utrwalone dane oceny wydalania sodu:";
  const TREE_END = "Koniec utrwalonych danych wydalania sodu.";
  const COLLECTION_FIELDS = Object.freeze(["collectionStartVoidDiscarded", "collectionFinalVoidIncluded", "collectionNoMissedVoids", "collectionNoSpillage", "collectionNoExtraVoids", "collectionStorageFollowed"]);
  const UNITS = new Set(["mmol/24 h", "g Na/24 h"]);
  const LABELS = Object.freeze({
    schema: "Schemat oceny", version: "Wersja schematu", engineVersion: "Wersja obliczenia", valid: "Poprawny pomiar", ok: "Dane poprawne",
    rawValue: "Wynik przed zaokrągleniem", value: "Wartość", unit: "Jednostka wyniku", input: "Dane wejściowe", mode: "Sposób wprowadzania", concentration: "Stężenie sodu w moczu", concentrationUnit: "Jednostka stężenia", volume: "Objętość zbiórki", volumeUnit: "Jednostka objętości", hours: "Czas zbiórki w godzinach", reportedValue: "Wynik z laboratorium", reportedUnit: "Jednostka wyniku z laboratorium", dailyMmol: "Dobowe wydalanie sodu w mmol", ageYears: "Wiek w dniu badania", agePrecision: "Dokładność wieku", sex: "Płeć w dniu badania",
    unitConversions: "Zachowane przeliczenia jednostek", originalValue: "Pierwotna wartość", originalUnit: "Pierwotna jednostka", convertedValue: "Przeliczona wartość pola", convertedUnit: "Przeliczona jednostka pola", outputUnit: "Wybrana jednostka prezentacji", exactValue: "Dokładna pokazana wartość", referencePolicy: "Utrwalona polityka źródłowa", presentation: "Utrwalona prezentacja", valueText: "Pokazana liczba", unitText: "Pokazana jednostka", precision: "Dokładność prezentacji", referenceValue: "Pokazany przedział", exactMain: "Dokładna wartość główna", exactDailyMmol: "Dokładne dobowe wydalanie sodu", exactLower: "Dokładna dolna granica", exactUpper: "Dokładna górna granica", numerator: "Licznik", denominator: "Mianownik", durationNeedsConfirmation: "Czas wymaga potwierdzenia", durationSource: "Pochodzenie czasu zbiórki",
    knownFacts: "Znane informacje", display: "Prezentacja wyniku", text: "Pokazany tekst", boundary: "Opis dokładności", status: "Ocena porównania", statusText: "Opis oceny", tone: "Kolor oceny", outOfRange: "Poza zakresem", category: "Kategoria porównania", referenceAvailable: "Dostępna norma", referenceActive: "Aktywne porównanie", reference: "Norma pacjenta", references: "Normy pacjenta", referenceLabel: "Etykieta normy", referenceText: "Tekst normy", referenceHint: "Źródło normy", referenceRows: "Dostępne profile normy", kind: "Rodzaj normy", lower: "Dolna granica", upper: "Górna granica", min: "Minimum", max: "Maksimum", lowerInclusive: "Dolna granica włączona", upperInclusive: "Górna granica włączona", label: "Nazwa", profileId: "Profil normy", sourceId: "Identyfikator źródła", sourceIds: "Identyfikatory źródeł", sourceLabel: "Nazwa źródła normy", population: "Populacja normy", cautions: "Uwagi do oceny", interpretation: "Interpretacja wyniku", sources: "Źródła medyczne", id: "Identyfikator", url: "Adres źródła", doi: "DOI", locator: "Miejsce w źródle", policy: "Polityka interpretacji", restrictions: "Ograniczenia interpretacji", notes: "Zasady zastosowania", educationalReferences: "Informacje w Szczegółach", approximate: "Przybliżona prezentacja", roundedDisplay: "Wynik pokazany po zaokrągleniu", fullValueText: "Pełny zapis wartości", unroundedValueText: "Wartość bez zaokrąglenia", precisionNote: "Komentarz do dokładności", errorCode: "Kod błędu", error: "Opis błędu",
  });
  const REVERSE = Object.fromEntries(Object.entries(LABELS).map(([key, label]) => [label, key]));
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const isObject = value => Boolean(value && typeof value === "object" && !Array.isArray(value));
  const clean = value => Array.from(String(value ?? "").replace(/[\r\n]+/g, " ").replace(/[\u00a0\u202f]/g, " ")).filter(char => char.codePointAt(0) >= 32 && char.codePointAt(0) !== 127).join("").trim();
  const normalized = value => String(value ?? "").replace(/\s+/g, "").replace(/,/g, ".");
  function fraction(text) {
    if (!["string", "number"].includes(typeof text) || String(text).length > 4096) return null;
    const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(String(text).trim().replace(",", ".").replace(/−/g, "-"));
    if (!match || !(match[2] || match[3])) return null;
    const exponent = Number(match[4] || 0) - (match[3] || "").length;
    if (!Number.isInteger(exponent) || Math.abs(exponent) > 4096) return null;
    let n = BigInt((match[1] === "-" ? "-" : "") + ((match[2] || "0") + (match[3] || ""))), d = 1n;
    if (exponent >= 0) n *= 10n ** BigInt(exponent); else d = 10n ** BigInt(-exponent);
    return { n, d };
  }
  const compare = (a, b) => a.n * b.d < b.n * a.d ? -1 : a.n * b.d > b.n * a.d ? 1 : 0;
  const product = (a, b) => ({ n: a.n * b.n, d: a.d * b.d });
  const quotient = (a, b) => b.n === 0n ? null : ({ n: a.n * b.d, d: a.d * b.n });
  const equal = (a, b) => Boolean(a && b && compare(a, b) === 0);
  function exact(value) {
    if (!isObject(value) || !/^\d{1,4096}$/.test(value.numerator || "") || !/^\d{1,4096}$/.test(value.denominator || "") || BigInt(value.denominator) <= 0n) return null;
    return { n: BigInt(value.numerator), d: BigInt(value.denominator) };
  }
  function represented(value) {
    if (value.n === 0n) return 0;
    if (value.n < 0n) return -represented({ n: -value.n, d: value.d });
    const rounded = (n, d) => { const q = n / d, r = n % d; return q + (r * 2n > d || r * 2n === d && q % 2n === 1n ? 1n : 0n); };
    let exponent = value.n.toString(2).length - value.d.toString(2).length;
    if (exponent >= 0 ? value.n < value.d * 2n ** BigInt(exponent) : value.n * 2n ** BigInt(-exponent) < value.d) exponent -= 1;
    if (exponent > 1023) return Infinity;
    if (exponent < -1075) return 0;
    const scale = exponent < -1022 ? 1074 : 52 - exponent;
    const coefficient = scale >= 0 ? rounded(value.n * 2n ** BigInt(scale), value.d) : rounded(value.n, value.d * 2n ** BigInt(-scale));
    return Number(coefficient) * 2 ** -scale;
  }
  const numeric = value => { const amount = fraction(value); return amount ? represented(amount) : NaN; };
  const SODIUM_MASS = fraction("22.98976928");
  const SELECTED_MASS = fraction("0.02298976928");
  function selectedExact(snapshot, value) { return snapshot.outputUnit === "gNa/24h" ? product(value, SELECTED_MASS) : value; }
  function decimalText(value, places = 1100) {
    const negative = value.n < 0n, n = negative ? -value.n : value.n;
    let remainder = n % value.d, text = (negative ? "-" : "") + String(n / value.d), digits = "";
    for (let i = 0; i < places && remainder; i += 1) { remainder *= 10n; digits += String(remainder / value.d); remainder %= value.d; }
    if (digits) text += "," + digits;
    return { text, complete: remainder === 0n };
  }
  function conversionText(quantity) {
    const full = decimalText(quantity), value = represented(quantity);
    if (full.complete && full.text.length <= 64) return full.text;
    if (Number.isFinite(value) && value !== 0) return String(value).replace(".", ",");
    if (quantity.n === 0n) return "0";
    let exponent = quantity.n.toString().length - quantity.d.toString().length;
    if (compare(quantity, fraction("1e" + exponent)) < 0) exponent -= 1;
    const scaled = exponent >= 0 ? quotient(quantity, fraction("1e" + exponent)) : product(quantity, fraction("1e" + -exponent));
    return decimalText(scaled, 17).text + "e" + exponent;
  }
  function compactQuantity(quantity, precision = 6) {
    const value = represented(quantity);
    if (!Number.isFinite(value) || value === 0 && quantity.n !== 0n) return null;
    let text = short(value, Math.max(precision, Math.min(15, Math.max(0, 3 - Math.floor(Math.log10(Math.abs(value) || 1))))));
    const displayed = fraction(text), full = decimalText(quantity, 1100);
    // The main card stays compact; the fraction and full expansion are retained
    // for Details/history. A literal rounded onto a bound is visibly approximate.
    const approximate = !displayed || compare(displayed, quantity) !== 0;
    if (approximate && full.complete && full.text.length <= 9) text = full.text;
    let finalApproximate = !fraction(text) || compare(fraction(text), quantity) !== 0;
    if (text.length > 9) {
      text = short(value, Math.max(4, Math.min(15, Math.max(0, 3 - Math.floor(Math.log10(Math.abs(value) || 1))))));
      if (text.length > 12) text = value.toExponential(5).replace(".", ",");
      finalApproximate = true;
    }
    return { text: (finalApproximate ? "≈" : "") + text, value, approximate: finalApproximate, fullText: full.text + (full.complete ? "" : "…"), fullValueComplete: full.complete };
  }
  function valueNum(snapshot) { return snapshot?.presentation?.rawValue ?? snapshot?.rawValue; }
  function unitText(snapshot) { return snapshot?.presentation?.unitText || snapshot?.unit || ""; }
  function displayText(snapshot) { return clean(snapshot?.presentation?.valueText || snapshot?.display?.text) || (Number.isFinite(valueNum(snapshot)) ? String(valueNum(snapshot)).replace(".", ",") : ""); }
  function normText(snapshot) { return snapshot?.referenceAvailable === true ? clean(snapshot.presentation?.referenceText || `${snapshot.presentation?.referenceValue || snapshot.referenceText} ${unitText(snapshot)}`) : ""; }
  function assessment(snapshot) { return ({ low: "below", high: "above", within: "within" })[snapshot?.status] || "unassessed"; }
  function safeRecord(value, depth = 0, seen = new Set()) {
    if (value === null || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value) || typeof value === "string" && value.length <= 20000) return true;
    if (!value || typeof value !== "object" || depth > 12 || seen.has(value)) return false;
    seen.add(value);
    const ok = Object.entries(Object.getOwnPropertyDescriptors(value)).every(([key, property]) => !["__proto__", "constructor", "prototype"].includes(key) && !property.get && !property.set && safeRecord(property.value, depth + 1, seen));
    seen.delete(value);return ok;
  }
  function capturedArithmetic(snapshot, main) {
    const input = snapshot.input, conversions = input.unitConversions || {};
    if (!isObject(conversions) || Object.keys(conversions).some(key => !["volume", "reportedValue"].includes(key))) return false;
    const units = { concentration: "concentrationUnit", volume: "volumeUnit", reportedValue: "reportedUnit" };
    const factors = { concentration: { "mmol/L": fraction("1") }, volume: { mL: fraction("0.001"), L: fraction("1") }, reportedValue: { "mmol/24h": fraction("1"), "mgNa/24h": quotient(fraction("1"), SODIUM_MASS), "gNa/24h": quotient(fraction("1000"), SODIUM_MASS) } };
    const effective = key => {
      const entry = conversions[key], unitKey = units[key];
      if (!entry) { const amount = fraction(input[key]), factor = factors[key][input[unitKey]]; return amount && factor && amount.n >= 0n && (key !== "volume" || amount.n > 0n) ? product(amount, factor) : null; }
      if (!isObject(entry) || Object.keys(entry).length !== 4 || !["originalValue", "originalUnit", "convertedValue", "convertedUnit"].every(key => own(entry, key)) || String(entry.convertedValue) !== String(input[key]) || entry.convertedUnit !== input[unitKey]) return null;
      const original = fraction(entry.originalValue), converted = fraction(entry.convertedValue), from = factors[key][entry.originalUnit], to = factors[key][entry.convertedUnit];
      if (!original || !converted || !from || !to || original.n < 0n || key === "volume" && original.n === 0n || !equal(fraction(conversionText(quotient(product(original, from), to))), converted)) return null;
      return product(original, from);
    };
    if (Object.keys(conversions).some(key => !effective(key))) return false;
    let daily;
    if (input.mode === "reported") daily = effective("reportedValue");
    else { const concentration = effective("concentration"), volume = effective("volume"), hours = fraction(input.hours); if (!concentration || !volume || !hours || hours.n <= 0n || input.durationNeedsConfirmation) return false; daily = quotient(product(product(concentration, volume), fraction("24")), hours); }
    return equal(daily, main);
  }
  const short = (number, digits = 6) => (number !== 0 && (Math.abs(number) < 1e-6 || Math.abs(number) >= 1e10) ? String(number) : number.toLocaleString("pl-PL", { useGrouping: false, maximumFractionDigits: digits })).replace(".", ",");
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function frozenLayout(snapshot) {
    const main = selectedExact(snapshot, exact(snapshot.exactMain)), shown = compactQuantity(main);
    if (!shown) return null;
    const ref = snapshot.reference, lower = ref ? selectedExact(snapshot, exact(ref.exactLower)) : null, upper = ref ? selectedExact(snapshot, exact(ref.exactUpper)) : null;
    const unit = snapshot.outputUnit === "gNa/24h" ? "g Na/24 h" : "mmol/24 h";
    const range = lower ? (snapshot.outputUnit === "gNa/24h" ? "≈" : "") + short(represented(lower), 4) + "–" + short(represented(upper), 4) : "Brak normy do porównania";
    return { ok: true, outputUnit: snapshot.outputUnit, valueText: shown.text, referenceValue: range, referenceText: lower ? range + " " + unit : range, unitText: unit, precision: 6, rawValue: shown.value, lower: lower ? represented(lower) : null, upper: upper ? represented(upper) : null, lowerInclusive: ref?.lowerInclusive ?? null, upperInclusive: ref?.upperInclusive ?? null, approximate: shown.approximate, roundedDisplay: shown.approximate, fullValueText: shown.fullText, unroundedValueText: shown.fullText, fullValueComplete: shown.fullValueComplete, referenceApproximate: Boolean(lower && snapshot.outputUnit === "gNa/24h"), precisionNote: shown.approximate ? snapshot.notes?.precision || "Znak ≈ oznacza skrócony zapis. Ocenę oparto na pełnej wartości." : "", exactValue: main, exactLower: lower, exactUpper: upper };
  }
  function storedPolicy(policy) {
    if (!isObject(policy) || typeof policy.id !== "string" || !Number.isInteger(policy.version) || policy.version < 1 || policy.quantity !== "sodium-excretion" || !Number.isFinite(policy.minimumAge) || !isObject(policy.population) || !isObject(policy.notes) || !Array.isArray(policy.sources) || !Array.isArray(policy.profiles) || policy.profiles.length > 100) return false;
    if (!policy.sources.every(source => isObject(source) && ["id", "label", "url"].every(key => typeof source[key] === "string"))) return false;
    const ids = new Set();
    return policy.profiles.every(profile => {
      if (!isObject(profile) || ids.has(profile.id) || profile.kind !== "interval" || ![null, "M", "F"].includes(profile.sex) || !Number.isFinite(profile.ageLower) || profile.ageLower < 0 || profile.ageUpper !== null && (!Number.isFinite(profile.ageUpper) || profile.ageUpper <= profile.ageLower) || !["ageLowerInclusive", "ageUpperInclusive", "lowerInclusive", "upperInclusive"].every(key => typeof profile[key] === "boolean") || profile.unit !== "mmol/24 h" || !Number.isFinite(profile.lower) || profile.lower < 0 || !Number.isFinite(profile.upper) || profile.upper <= profile.lower || !["id", "label", "population", "text", "sourceId", "sourceLabel", "method", "sample", "explanation"].every(key => typeof profile[key] === "string" && profile[key]) || !policy.sources.some(source => source.id === profile.sourceId) || !isObject(profile.titles) || !isObject(profile.copy) || !["low", "within", "high"].every(key => typeof profile.titles[key] === "string" && typeof profile.copy[key] === "string")) return false;
      if (profile.sourceIds && (!Array.isArray(profile.sourceIds) || !profile.sourceIds.length || profile.sourceIds.some(id => !policy.sources.some(source => source.id === id)))) return false;
      ids.add(profile.id); return true;
    });
  }
  function ageProfiles(policy, input) {
    const age = fraction(input.ageYears), number = age ? represented(age) : NaN;
    if (!age || age.n < 0n || !Number.isFinite(number) || !equal(age, fraction(String(number))) || input.agePrecision === "completed-years" && !Number.isInteger(number)) return [];
    return policy.profiles.filter(profile => {
      const lo = compare(age, fraction(profile.ageLower)), hi = profile.ageUpper === null ? -1 : compare(age, fraction(profile.ageUpper));
      return (lo > 0 || lo === 0 && profile.ageLowerInclusive) && (hi < 0 || hi === 0 && profile.ageUpperInclusive) && (input.agePrecision !== "completed-years" || profile.ageUpper === null || profile.ageUpper >= number + 1);
    });
  }
  function capturedAge(input) {
    const facts = input.knownFacts;
    if (!own(facts, "age")) return true;
    const number = key => { const value = fraction(facts[key]), result = value ? represented(value) : NaN; return value && Number.isFinite(result) && equal(value, fraction(String(result))) ? result : NaN; };
    const absent = value => value == null || String(value).trim() === "";
    let age = null;
    if (!absent(facts.age)) {
      const years = number("age"), months = absent(facts.ageMonths) ? 0 : number("ageMonths");
      if (years >= 0 && months >= 0 && months < 12) {
        age = years + months / 12;
        if (years === 0 && months === 0 && !absent(facts.ageDays)) { const days = number("ageDays"); age = days >= 0 ? days / 365.2425 : null; }
      }
    }
    return age === null ? input.ageYears === null : numeric(input.ageYears) === age;
  }
  function frozenReference(profile, policy) {
    return { kind: "interval", profileId: profile.id, ruleId: profile.ruleId || policy.id + ":v" + policy.version, lower: profile.lower, upper: profile.upper, min: profile.lower, max: profile.upper, lowerInclusive: profile.lowerInclusive, upperInclusive: profile.upperInclusive, unit: "mmol/24 h", label: profile.label, text: profile.text, hint: profile.population, note: profile.population, population: profile.population, sourceIds: profile.sourceIds || [profile.sourceId], sourceId: profile.sourceId, sourceLabel: profile.sourceLabel, method: profile.method, sample: profile.sample, explanation: profile.explanation, sourceUnit: profile.unit, sourceText: profile.text, sourceLower: profile.lower, sourceUpper: profile.upper, lowerText: short(profile.lower), upperText: short(profile.upper), ageLower: profile.ageLower, ageUpper: profile.ageUpper, ageLowerInclusive: profile.ageLowerInclusive, ageUpperInclusive: profile.ageUpperInclusive, sex: profile.sex, agePolicy: policy.agePolicy || "" };
  }
  function validateFrozen(value) {
    if (!safeRecord(value) || !isObject(value) || value.schema !== "clcr-sodium-dzm" || value.version !== 1 || value.engineVersion !== 1 || value.valid !== true || value.ok !== true || value.unit !== "mmol/24 h") return false;
    const main = exact(value.exactMain), daily = exact(value.exactDailyMmol), input = value.input;
    if (!main || !daily || !equal(main, daily) || !Number.isFinite(value.rawValue) || value.rawValue < 0 || represented(main) !== value.rawValue || value.rawValue === 0 && main.n !== 0n || value.value !== value.rawValue || value.dailyMmol !== value.rawValue) return false;
    if (!isObject(input) || !["concentration", "reported"].includes(input.mode) || !isObject(input.knownFacts) || input.concentrationUnit !== "mmol/L" || !["mL", "L"].includes(input.volumeUnit) || !["mmol/24h", "mgNa/24h", "gNa/24h"].includes(input.reportedUnit) || !["mmol/24h", "gNa/24h"].includes(value.outputUnit) || input.outputUnit !== value.outputUnit || !["exact", "completed-years"].includes(input.agePrecision) || ![null, "M", "F"].includes(input.sex) || !capturedAge(input)) return false;
    if (!capturedArithmetic(value, main) || input.knownFacts.Cl24CollectionProblem === true || COLLECTION_FIELDS.some(id => input.knownFacts[id] === false || input.knownFacts[`ui_${id}_answer`] === "no")) return false;
    const units = value.unitPolicy;
    if (!isObject(units) || units.id !== "SODIUM_CHEMICAL_UNITS_2026_10_30" || units.version !== 1 || units.sodiumMgPerMmol !== "22.98976928" || units.sodiumChlorideGPerMmol !== "0.05844" || units.sourceId !== "CIAAW_SODIUM") return false;
    const unknownHours = input.hours === null || String(input.hours ?? "").trim() === "", hours = unknownHours ? null : fraction(input.hours);
    if (unknownHours ? input.mode !== "reported" || value.hours !== null || value.exactHours !== null || input.durationNeedsConfirmation !== true || input.durationSource !== "historical-missing" : !hours || hours.n <= 0n || !Number.isFinite(represented(hours)) || represented(hours) <= 0 || value.hours !== represented(hours) || !equal(exact(value.exactHours), hours) || input.durationNeedsConfirmation !== false || !["captured", "hours", "assumed-24h", "legacy-dates"].includes(input.durationSource) || input.durationSource === "assumed-24h" && !equal(hours, fraction("24"))) return false;
    const full24 = Boolean(hours && equal(hours, fraction("24")));
    if (value.full24Hours !== full24 || !Array.isArray(value.cautions) || value.cautions.some(text => typeof text !== "string") || !Array.isArray(value.references) || typeof value.interpretation !== "string" || typeof value.statusText !== "string") return false;
    if (input.mode === "reported") { if (value.exactVolumeLitres !== null) return false; }
    else {
      const entry = input.unitConversions?.volume, amount = fraction(entry?.originalValue ?? input.volume), factor = (entry?.originalUnit ?? input.volumeUnit) === "mL" ? fraction("0.001") : fraction("1");
      if (!equal(exact(value.exactVolumeLitres), product(amount, factor))) return false;
    }
    const policy = value.referencePolicy;
    if (policy === null ? value.policy !== null || value.population !== null || !same(value.sources, []) : !storedPolicy(policy) || !same(value.policy, { id: policy.id, version: policy.version }) || !same(value.sources, policy.sources) || !same(value.population, policy.population)) return false;
    const profiles = policy ? ageProfiles(policy, input) : [], matches = profiles.filter(profile => profile.sex === null || profile.sex === input.sex), eligible = matches.length === 1 ? matches[0] : null;
    const profile = full24 ? eligible : null, reference = value.reference;
    if (Boolean(profile) !== Boolean(reference) || value.referenceAvailable !== Boolean(reference) || value.referenceActive !== Boolean(reference && main.n !== 0n) || value.references.length !== (reference ? 1 : 0)) return false;
    let status = "unassessed", tone = "neutral", outOfRange = null;
    if (profile) {
      const expected = frozenReference(profile, policy), lower = fraction(profile.lower), upper = fraction(profile.upper);
      if (!isObject(reference) || Object.entries(expected).some(([key, item]) => !same(reference[key], item)) || !equal(exact(reference.exactLower), lower) || !equal(exact(reference.exactUpper), upper) || !same(value.references[0], reference)) return false;
      const lo = compare(main, lower), hi = compare(main, upper);
      status = lo < 0 || lo === 0 && !profile.lowerInclusive ? "low" : hi > 0 || hi === 0 && !profile.upperInclusive ? "high" : "within";
      tone = status === "within" ? "normal" : "warning";outOfRange = status !== "within";
    }
    if (main.n === 0n) { status = "zero"; tone = "neutral"; outOfRange = null; }
    if (value.status !== status || value.tone !== tone || value.outOfRange !== outOfRange || value.referenceLabel !== "Norma dla wieku" || value.referenceText !== (reference?.text || "Brak normy do porównania") || value.referenceHint !== (reference?.sourceLabel || "") || value.contextLabel !== (profile?.contextLabel || "Dobowe wydalanie sodu")) return false;
    const p = value.presentation, layout = frozenLayout(value);
    if (!layout || !isObject(p) || Object.entries(layout).some(([key, item]) => key.startsWith("exact") ? item === null ? p[key] !== null : !equal(exact(p[key]), item) : p[key] !== item)) return false;
    if (!isObject(value.display) || value.display.text !== compactQuantity(main).text || value.display.boundary !== "" || value.dailyDisplay !== value.display.text) return false;
    return validateAnnotations(value, policy, profile, profiles, eligible, main);
  }
  function validateAnnotations(value, policy, profile, profiles, eligible, main) {
    const input = value.input, notes = policy ? { ...policy.notes } : {}, age = fraction(input.ageYears), ageNumber = age ? represented(age) : NaN;
    const ageKnown = age && age.n >= 0n && Number.isFinite(ageNumber) && equal(age, fraction(String(ageNumber)));
    let title = notes.noPolicyTitle || "Wynik bez porównania z normą", description = notes.noPolicy || "Nie dobrano właściwego zakresu referencyjnego. Wynik pozostaje bez automatycznej oceny.";
    if (profile) {
      const status = compare(main, fraction(profile.lower)) < 0 || equal(main, fraction(profile.lower)) && !profile.lowerInclusive ? "low" : compare(main, fraction(profile.upper)) > 0 || equal(main, fraction(profile.upper)) && !profile.upperInclusive ? "high" : "within";
      title = profile.titles[status];description = profile.copy[status];
    }
    if (!value.full24Hours) { title = input.mode === "reported" ? notes.reportedNon24Title || "Gotowy wynik dobowy" : notes.non24Title || "Oszacowanie na 24 h";description = input.mode === "reported" ? value.hours === null ? notes.reportedUnknown : notes.reportedNon24 : notes.non24; }
    else if (!ageKnown) description = notes.noAge || description;
    else if (policy && !eligible) {
      if (ageNumber < policy.minimumAge) description = notes.belowAge;
      else if (profiles.length && !input.sex) description = notes.noSex;
      else description = notes.noProfile;
      if (profiles.length === 1 && profiles[0].sex === "F") description = !input.sex ? notes.noChildSex || notes.noSex : notes.noChildMale || notes.noProfile;
    }
    if (main.n === 0n) { title = notes.zeroTitle || "Wynik 0 — sprawdź zapis laboratorium";description = (!value.full24Hours && description ? description + " " : "") + (notes.zero || "Sprawdź granicę oznaczalności. Zapis „<” nie jest dokładnym zerem."); }
    if (value.statusText !== title || value.interpretation !== (description || "") || value.category !== null || value.populationCategory !== (ageKnown ? ageNumber >= 18 ? "adult" : "child" : null)) return false;
    const salt = product(main, fraction("0.05844")), shownSalt = compactQuantity(salt, 4);
    const saltEquivalent = shownSalt ? { rawValue: shownSalt.value, unit: "g NaCl/24 h", valueText: "≈" + shownSalt.text.replace(/^≈/, ""), text: "≈" + shownSalt.text.replace(/^≈/, "") + " g NaCl/24 h", explanation: notes.saltEquivalent || "Przybliżony odpowiednik chemiczny, a nie pomiar spożycia soli." } : null;
    if (saltEquivalent ? !isObject(value.saltEquivalent) || Object.entries(saltEquivalent).some(([key, item]) => value.saltEquivalent[key] !== item) || !equal(exact(value.saltEquivalent.exactValue), salt) : value.saltEquivalent !== null) return false;
    notes.sourceSummary = value.reference ? value.reference.sourceLabel + " · pełna zbiórka 24 h" : "";
    notes.contextExplanation = profile?.explanation || description || "";
    const mass = product(main, SELECTED_MASS), shownMass = compactQuantity(mass);
    const massEquivalent = shownMass ? { rawValue: shownMass.value, unit: "g Na/24 h", valueText: shownMass.text, text: shownMass.text + " g Na/24 h" } : null;
    if (massEquivalent ? !isObject(value.massEquivalent) || Object.entries(massEquivalent).some(([key, item]) => value.massEquivalent[key] !== item) || !equal(exact(value.massEquivalent.exactValue), mass) : value.massEquivalent !== null) return false;
    notes.massEquivalentText = massEquivalent?.text || "";
    notes.saltEquivalentText = saltEquivalent?.text || "";
    notes.fullValueText = value.presentation.fullValueText;
    notes.precisionNote = value.presentation.precisionNote;
    if (!same(value.notes, notes) || !same(value.educationalReferences, policy?.educationalReferences || [])) return false;
    const rangeText = item => item ? (value.outputUnit === "gNa/24h" ? "≈" : "") + short(represented(selectedExact(value, fraction(item.lower))), 4) + "–" + short(represented(selectedExact(value, fraction(item.upper))), 4) : "Nie ustalono";
    const rows = policy ? policy.profiles.map(item => ({ profileId: item.id, population: item.population, label: item.label, text: rangeText(item), unit: value.presentation.unitText, sourceId: item.sourceId, sourceLabel: item.sourceLabel, ageLower: item.ageLower, ageUpper: item.ageUpper, sex: item.sex, active: value.reference?.profileId === item.id })) : [];
    const table = policy ? (policy.referenceGroups || []).map(group => ({ id: group.id, label: group.label, male: { text: rangeText(policy.profiles.find(item => item.id === group.maleProfile)), active: Boolean(value.reference && value.reference.profileId === group.maleProfile) }, female: { text: rangeText(policy.profiles.find(item => item.id === group.femaleProfile)), active: Boolean(value.reference && value.reference.profileId === group.femaleProfile) } })) : [];
    return same(value.referenceRows, rows) && same(value.referenceTable, table) && same(value.cautions, []) && same(value.missingIds, []) && same(value.invalidIds, []) && value.errorCode === "" && value.error === "" && value.blocked === false;
  }
  // Version 1 validates frozen arithmetic and frozen reference data. It never
  // selects a current policy or calls a live calculator while reading history.
  function validSnapshot(value) {
    try { return validateFrozen(value); } catch (_) { return false; }
  }
  function readSnapshot(encoded) {
    if (typeof encoded !== "string" || encoded.length > 150000) return null;
    try { const value = JSON.parse(encoded); return validSnapshot(value) ? value : null; } catch (_) { return null; }
  }
  function augmentDatapoint(card, datapoint) {
    if (datapoint?.sourceFormulaId !== "Na_mmol_d") return datapoint;
    delete datapoint.sodiumDzmSnapshot;
    Object.assign(datapoint, { outOfRange: null, norm: "", assessment: "unassessed", tone: "neutral" });
    const snapshot = readSnapshot(card?.getAttribute?.("data-clcr-sodium-dzm-snapshot"));
    const selected = card?.getAttribute?.("data-clcr-sodium-dzm-output-unit");
    if (snapshot && (!selected || selected === snapshot.outputUnit)) Object.assign(datapoint, { sodiumDzmSnapshot: snapshot, testKey: TEST_KEY, rawValue: valueNum(snapshot), valueNum: valueNum(snapshot), unit: unitText(snapshot), displayValue: displayText(snapshot), norm: normText(snapshot), outOfRange: snapshot.outOfRange, assessment: assessment(snapshot), tone: snapshot.tone === "normal" ? "success" : snapshot.tone, interpretation: snapshot.interpretation });
    return datapoint;
  }
  function applyLabResult(datapoint, labResult) {
    const snapshot = datapoint?.sodiumDzmSnapshot;
    if (datapoint?.sourceFormulaId !== "Na_mmol_d" || !validSnapshot(snapshot) || !labResult) return labResult;
    Object.assign(labResult, { test: LABEL, value: displayText(snapshot), valueNum: valueNum(snapshot), unit: unitText(snapshot), testKey: TEST_KEY });
    const norm = normText(snapshot);
    if (norm) labResult.norm = norm; else delete labResult.norm;
    return labResult;
  }
  function treeRows(value, path = [], rows = []) {
    if (path.length > 12 || rows.length > 2000) throw new Error("Assessment is too large");
    const label = path.map(part => typeof part === "number" ? `pozycja ${part + 1}` : LABELS[part] || part).join(" › ");
    if (Array.isArray(value) || isObject(value)) {
      if (path.length) rows.push(`${label} [${Array.isArray(value) ? "lista" : "dane"}]:`);
      Object.entries(value).forEach(([key, item]) => {
        if (["__proto__", "constructor", "prototype"].includes(key) || /[\r\n›]/.test(key)) throw new Error("Invalid assessment key");
        treeRows(item, [...path, Array.isArray(value) ? Number(key) : key], rows);
      });
    } else if (typeof value === "string") {
      // The vault normalizes a few Unicode spaces in note bodies. Escape only
      // those characters inside a leaf, retaining the original entered string
      // and source text after parsing, without an opaque assessment payload.
      const encoded = JSON.stringify(value).replace(/[\u00a0\u202f\u2000-\u200d\u205f\u2060\u3000\ufeff]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
      rows.push(`${label} [tekst]: ${encoded}`);
    }
    else if (typeof value === "number" && Number.isFinite(value)) rows.push(`${label} [liczba]: ${String(value)}`);
    else if (typeof value === "boolean") rows.push(`${label} [odpowiedź]: ${value ? "tak" : "nie"}`);
    else if (value === null) rows.push(`${label} [brak]: nie podano`);
    else throw new Error("Unsupported assessment data");
    return rows;
  }
  function readTree(rows) {
    const result = {};
    if (rows.length > 2000) return null;
    for (const row of rows) {
      const match = /^(.*?) \[(dane|lista|tekst|liczba|odpowiedź|brak)\]:(?: (.*))?$/.exec(row);
      if (!match) return null;
      const path = match[1].split(" › ").map(part => /^pozycja [1-9][0-9]*$/.test(part) ? Number(part.slice(8)) - 1 : REVERSE[part] || part);
      if (!path.length || path.length > 12 || path.some(part => typeof part === "number" ? part < 0 || part > 2000 : !part || ["__proto__", "constructor", "prototype"].includes(part))) return null;
      let parent = result;
      for (const part of path.slice(0, -1)) { if (!own(parent, part) || (!isObject(parent[part]) && !Array.isArray(parent[part]))) return null; parent = parent[part]; }
      const key = path.at(-1), type = match[2], raw = match[3] || "";
      if (own(parent, key)) return null;
      let value;
      if (type === "dane") value = {};
      else if (type === "lista") value = [];
      else if (type === "brak") { if (raw !== "nie podano") return null; value = null; }
      else if (type === "odpowiedź") { if (!["tak", "nie"].includes(raw)) return null; value = raw === "tak"; }
      else if (type === "liczba") { value = Number(raw); if (!raw || !Number.isFinite(value)) return null; }
      else { try { value = JSON.parse(raw); } catch (_) { return null; } if (typeof value !== "string") return null; }
      parent[key] = value;
    }
    return result;
  }
  function referenceNote(datapoint) {
    const snapshot = datapoint?.sodiumDzmSnapshot;
    if (datapoint?.sourceFormulaId !== "Na_mmol_d" || !validSnapshot(snapshot)) return "";
    const range = normText(snapshot);
    const rows = [NOTE_HEADER, `Wydalanie sodu: ${displayText(snapshot)} ${unitText(snapshot)}.`, `Opis wyniku: ${clean(snapshot.interpretation)}`, range ? `Norma użyta przy zapisie: ${range}.` : "Brak zapisanej normy.", ...(snapshot.cautions || []).map(text => `Uwaga do interpretacji: ${clean(text)}`), TREE_HEADER];
    try { rows.push(...treeRows(snapshot)); } catch (_) { return ""; }
    rows.push(TREE_END);
    return rows.join("\n");
  }
  function hasSavedAssessment(note) { return typeof note?.body === "string" && note.body.includes(NOTE_HEADER); }
  function savedAssessment(note) {
    const body = typeof note?.body === "string" ? note.body : "";
    if (body.length > 200000 || !hasSavedAssessment(note)) return null;
    const rows = body.slice(body.indexOf(NOTE_HEADER)).split("\n");
    const from = rows.indexOf(TREE_HEADER), to = rows.indexOf(TREE_END);
    if (from < 0 || to <= from || rows.lastIndexOf(TREE_HEADER) !== from || rows.lastIndexOf(TREE_END) !== to) return null;
    const snapshot = readTree(rows.slice(from + 1, to));
    if (!validSnapshot(snapshot)) return null;
    const lab = note.labResult || {}, display = displayText(snapshot), norm = normText(snapshot);
    if (lab.test !== LABEL || lab.unit !== unitText(snapshot) || (lab.testKey != null && lab.testKey !== TEST_KEY) || normalized(lab.value) !== normalized(display) || lab.valueNum !== valueNum(snapshot) || clean(lab.norm || "") !== norm) return null;
    if (!rows.includes(`Wydalanie sodu: ${display} ${unitText(snapshot)}.`) || !rows.includes(`Opis wyniku: ${clean(snapshot.interpretation)}`)) return null;
    if (norm ? !rows.includes(`Norma użyta przy zapisie: ${norm}.`) : !rows.includes("Brak zapisanej normy.")) return null;
    return { ...snapshot, displayValue: display, comparator: "", norm, outOfRange: snapshot.outOfRange };
  }
  function legacyPoint(note) {
    const lab = note?.labResult;
    if (!lab || lab.unit && !UNITS.has(lab.unit)) return null;
    const parsed = numeric(lab.value);
    const rawValue = typeof lab.valueNum === "number" && Number.isFinite(lab.valueNum) ? lab.valueNum : parsed;
    if (!Number.isFinite(rawValue) || rawValue < 0) return null;
    // History preserves the recorded quantity and assessment. A raw input in
    // an old calculation envelope can only be recovered by an explicit edit.
    return { rawValue, valueNum: rawValue, displayValue: Number.isFinite(parsed) ? clean(lab.value) : String(rawValue).replace(".", ","), comparator: "", unit: lab.unit || "mmol/24 h", outOfRange: null, norm: clean(lab.norm || ""), assessment: "unassessed", tone: "neutral" };
  }
  function prepareValues(values = {}, context = {}, prior = null) {
    const result = { ...values }, input = prior?.input || {};
    result.Na_inputMode ??= input.mode || "concentration";
    result.Na_concentration ??= input.concentration ?? result.U_Na ?? "";
    result.Na_volume ??= input.volume ?? result.V24 ?? "";
    result.Na_volumeUnit ||= input.volumeUnit || "mL";
    result.Na_reportedValue ??= input.reportedValue ?? "";
    result.Na_reportedUnit ||= input.reportedUnit || "mmol/24h";
    result.Na_outputUnit ||= prior?.outputUnit || input.outputUnit || "mmol/24h";
    result.Na_unitConversions ??= JSON.stringify(input.unitConversions || {});
    if (!own(result, "Na_collectionHours")) {
      if (own(result, "Cl24DurationHours")) result.Na_collectionHours = result.Cl24DurationHours;
      else if (own(input, "hours")) result.Na_collectionHours = input.hours ?? "";
      else {
        const hours = [context.collectionHours, context.durationHours].find(value => value !== null && value !== undefined && String(value).trim() !== "");
        const minutes = [context.durationMinutes, context.collectionMinutes, context.collection?.durationMinutes, context.inputs?.durationMinutes, context.referenceContext?.durationMinutes, context.recordedDurationMinutes, context.collectionAnalysis?.durationMinutes].find(value => value !== null && value !== undefined && String(value).trim() !== "");
        result.Na_collectionHours = hours ?? (minutes !== undefined ? Number.isFinite(numeric(minutes)) ? String(numeric(minutes) / 60) : String(minutes) : "");
      }
    }
    result.Na_collectionSource ??= input.durationSource ?? result.Cl24DurationSource ?? context.durationSource ?? context.collectionSource ?? context.collectionAnalysis?.source ?? (numeric(result.Na_collectionHours) > 0 ? "captured" : "historical-missing");
    for (const id of ["Cl24CollectionProblem", ...COLLECTION_FIELDS, ...COLLECTION_FIELDS.map(id => `ui_${id}_answer`)]) {
      if (!own(result, id) && own(input.knownFacts || {}, id)) result[id] = input.knownFacts[id];
      else if (!own(result, id) && own(context.knownFacts || {}, id)) result[id] = context.knownFacts[id];
      else if (!own(result, id) && own(context, id)) result[id] = context[id];
    }
    result.Na_durationNeedsConfirmation = String(result.Na_collectionHours ?? "").trim() === "" || input.durationNeedsConfirmation === true && numeric(result.Na_collectionHours) === numeric(input.hours);
    // Captured demographics are a historical context, never refreshed from
    // the currently active patient during an edit.
    if (!own(result, "age") && input.ageYears !== null && input.ageYears !== undefined) { result.age = String(input.ageYears); result.ageMonths = "0"; result.ageDays = "0"; }
    if (!own(result, "sex") && input.sex !== undefined) result.sex = input.sex ?? "";
    return result;
  }
  function editableFields(values = {}) {
    const field = (id, label, required = false, unitFieldId = "", options = []) => ({ id, label, required, unitFieldId, historicalContext: false, type: options.length ? "select" : "number", options: options.map(value => isObject(value) ? value : ({ value, label: value })) });
    return [
      field("Na_inputMode", "Sposób wprowadzania", false, "", [{ value: "concentration", label: "Oblicz ze stężenia" }, { value: "reported", label: "Gotowy wynik" }]),
      ...(values.Na_inputMode === "reported" ? [field("Na_reportedValue", "Gotowy wynik dobowy", true, "Na_reportedUnit"), field("Na_reportedUnit", "Jednostka wyniku", false, "", [{ value: "mmol/24h", label: "mmol/24 h" }, { value: "mgNa/24h", label: "mg Na/24 h" }, { value: "gNa/24h", label: "g Na/24 h" }])] : [
        field("Na_concentration", "Sód w moczu · mmol/L", true), field("Na_volume", "Objętość zbiórki", true, "Na_volumeUnit"), field("Na_volumeUnit", "Jednostka objętości", false, "", ["mL", "L"]),
      ]),
      field("Na_collectionHours", "Czas zbiórki · godziny (wpisz, jeśli nie został zapisany)", values.Na_inputMode !== "reported"),
      field("Na_outputUnit", "Jednostka prezentacji", false, "", [{ value: "mmol/24h", label: "mmol/24 h" }, { value: "gNa/24h", label: "g Na/24 h" }]),
    ];
  }
  function captureFields(values, previous = []) {
    const demographicIds = ["age", "ageMonths", "ageDays", "sex"];
    return [...editableFields(values), ...previous.filter(field => demographicIds.includes(field.id)).map(field => ({ ...field, required: false, historicalContext: true }))];
  }
  return Object.freeze({ NOTE_HEADER, TEST_KEY, assessment, readSnapshot, validSnapshot, displayText, valueNum, unitText, augmentDatapoint, applyLabResult, referenceNote, savedAssessment, hasSavedAssessment, legacyPoint, normText, prepareValues, editableFields, captureFields });
});
