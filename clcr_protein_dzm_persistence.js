/* Frozen protein excretion measurement/reference records. Reading does not evaluate current policies. */
(function (root, factory) {
  const api = factory(root);
  if (root) root.ClcrProteinDzmPersistence = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";
  const NOTE_HEADER = "Białko w DZM — ocena w chwili zapisu (wersja 1):";
  const TEST_KEY = "clcr-protein-dzm";
  const COLLECTION_FIELDS = Object.freeze(["collectionStartVoidDiscarded", "collectionFinalVoidIncluded", "collectionNoMissedVoids", "collectionNoSpillage", "collectionNoExtraVoids", "collectionStorageFollowed"]);
  const LABEL = "Białko całkowite w DZM";
  const UNITS = new Set(["mg/24 h", "g/24 h", "mg/m²/24 h"]);
  const TREE_HEADER = "Utrwalone dane oceny białka w DZM:";
  const TREE_END = "Koniec utrwalonych danych białka w DZM.";
  const LABELS = Object.freeze({
    ruleId: "Reguła interpretacji", sourceUpper: "Źródłowa górna granica", sourceUnit: "Jednostka źródłowa", sourceText: "Źródłowy zapis granicy", exactNephrotic: "Dokładna granica nerczycowa", nephrotic: "Granica nerczycowa", nephroticInclusive: "Granica nerczycowa włączona", uncappedUpper: "Granica po przeliczeniu BSA", adultCap: "Limit dla dorosłych", capped: "Zastosowano limit", exactIndexed: "Dokładny wynik na m²", indexedDisplay: "Pokazany wynik na m²", bsa: "Powierzchnia ciała", profileId: "Profil odniesienia", referenceRows: "Dostępne profile odniesienia", referenceCalculation: "Wyznaczenie normy",
    schema: "Schemat oceny", version: "Wersja schematu", engineVersion: "Wersja obliczenia", valid: "Poprawny pomiar",
    rawValue: "Wynik przed zaokrągleniem", value: "Wartość", unit: "Jednostka wyniku", input: "Dane wejściowe", mode: "Sposób wprowadzania", concentration: "Stężenie białka", concentrationUnit: "Jednostka stężenia", volume: "Objętość zbiórki", volumeUnit: "Jednostka objętości", hours: "Czas zbiórki w godzinach", reportedValue: "Wynik z laboratorium", reportedUnit: "Jednostka wyniku z laboratorium", dailyMg: "Wydalanie dobowe w mg", weightKg: "Masa ciała w kg", ageYears: "Wiek w dniu badania", sex: "Płeć",
    unitConversions: "Zachowane przeliczenia jednostek", originalValue: "Pierwotna wartość", originalUnit: "Pierwotna jednostka", convertedValue: "Przeliczona wartość pola", convertedUnit: "Przeliczona jednostka pola", ok: "Dane poprawne", outputUnit: "Wybrana jednostka prezentacji", exactValue: "Dokładna pokazana wartość", referencePolicy: "Utrwalona polityka źródłowa", presentation: "Utrwalona prezentacja", valueText: "Pokazana liczba", unitText: "Pokazana jednostka", precision: "Dokładność prezentacji", referenceValue: "Pokazany przedział", agePrecision: "Dokładność wieku", exactMain: "Dokładna wartość główna", exactDailyMg: "Dokładne wydalanie dobowe", exactLower: "Dokładna dolna granica", exactUpper: "Dokładna górna granica", numerator: "Licznik", denominator: "Mianownik", durationNeedsConfirmation: "Czas wymaga potwierdzenia",
    contextLabel: "Znaczenie porównania", heightCm: "Wzrost w cm", indexed: "Wydalanie na m² powierzchni ciała", bsaM2: "Powierzchnia ciała w m²", bsaMethod: "Metoda powierzchni ciała", durationSource: "Pochodzenie czasu zbiórki",
    knownFacts: "Znane informacje", menstruation: "Miesiączka", hematuria: "Krwiomocz", infection: "Zakażenie", exercise: "Wysiłek", acuteIllness: "Ostra choroba",
    display: "Prezentacja wyniku", text: "Pokazany tekst", boundary: "Opis dokładności", status: "Ocena porównania", statusText: "Opis oceny", tone: "Kolor oceny", outOfRange: "Poza zakresem", category: "Kategoria porównania",
    referenceAvailable: "Dostępny punkt odniesienia", referenceActive: "Aktywne porównanie", reference: "Punkt odniesienia", references: "Punkty odniesienia", referenceLabel: "Etykieta odniesienia", referenceText: "Tekst odniesienia", referenceHint: "Znaczenie odniesienia",
    kind: "Rodzaj odniesienia", lower: "Dolna granica", upper: "Górna granica", lowerInclusive: "Dolna granica włączona", upperInclusive: "Górna granica włączona", label: "Nazwa", sourceIds: "Identyfikatory źródeł", sourceLabel: "Nazwa źródła odniesienia", population: "Populacja odniesienia", cautions: "Uwagi do oceny", interpretation: "Interpretacja wyniku",
    sources: "Źródła medyczne", id: "Identyfikator", url: "Adres źródła", doi: "DOI", locator: "Miejsce w źródle", policy: "Polityka interpretacji", restrictions: "Ograniczenia interpretacji", notes: "Zasady zastosowania", educationalReferences: "Informacje w Szczegółach", errorCode: "Kod błędu", error: "Opis błędu",
  });
  const REVERSE = Object.fromEntries(Object.entries(LABELS).map(([key, label]) => [label, key]));
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const isObject = value => Boolean(value && typeof value === "object" && !Array.isArray(value));
  const clean = value => Array.from(String(value ?? "").replace(/[\r\n]+/g, " ").replace(/[\u00a0\u202f]/g, " ")).filter(char => char.codePointAt(0) >= 32 && char.codePointAt(0) !== 127).join("").trim();
  const normalized = value => String(value ?? "").replace(/\s+/g, "").replace(/,/g, ".");
  function decimalIdentity(text) {
    const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text);
    if (!match || !(match[2] || match[3])) return null;
    let digits = (match[2] + (match[3] || "")).replace(/^0+/, "");
    if (!digits) return "0";
    let exponent = Number(match[4] || 0) - (match[3] || "").length;
    if (!Number.isInteger(exponent) || Math.abs(exponent) > 4096) return null;
    while (digits.endsWith("0")) { digits = digits.slice(0, -1); exponent += 1; }
    return (match[1] === "-" ? "-" : "") + digits + "e" + exponent;
  }
  function numeric(value) {
    if (!["number", "string"].includes(typeof value)) return NaN;
    const text = String(value).trim().replace(/,/g, "."), number = Number(text);
    if (!text || text.length > 2048 || !Number.isFinite(number) || decimalIdentity(text) !== decimalIdentity(String(number))) return NaN;
    return number;
  }
  function valueNum(snapshot) { return snapshot?.presentation?.rawValue ?? snapshot?.rawValue; }
  function unitText(snapshot) { return snapshot?.presentation?.unitText || snapshot?.unit || ""; }
  function displayText(snapshot) { return clean(snapshot?.presentation?.valueText || snapshot?.display?.text) || (Number.isFinite(valueNum(snapshot)) ? String(valueNum(snapshot)).replace(".", ",") : ""); }
  function normText(snapshot) { return snapshot?.referenceActive === true ? `${clean(snapshot.presentation?.referenceValue || snapshot.referenceText)} ${unitText(snapshot)}`.trim() : ""; }
  function assessment(snapshot) { return ({ low: "below", high: "above", nephrotic: "above", within: "within" })[snapshot?.status] || "unassessed"; }
  // The storage-format version owns this formatter. It uses only the exact
  // numbers and boundaries frozen in this record, so future engine/policy
  // updates cannot change how a historical result is validated.
  function fraction(text) {
    const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(String(text).trim().replace(",", ".").replace(/−/g, "-"));
    if (!match || !(match[2] || match[3])) return null;
    const exponent = Number(match[4] || 0) - (match[3] || "").length;
    if (!Number.isInteger(exponent) || Math.abs(exponent) > 4096) return null;
    let n = BigInt((match[1] === "-" ? "-" : "") + ((match[2] || "0") + (match[3] || ""))), d = 1n;
    if (exponent >= 0) n *= 10n ** BigInt(exponent); else d = 10n ** BigInt(-exponent);
    return { n, d };
  }
  const compare = (a, b) => a.n * b.d < b.n * a.d ? -1 : a.n * b.d > b.n * a.d ? 1 : 0;
  function exact(value) {
    if (!isObject(value) || !/^\d{1,4096}$/.test(value.numerator || "") || !/^\d{1,4096}$/.test(value.denominator || "") || BigInt(value.denominator) <= 0n) return null;
    return { n: BigInt(value.numerator), d: BigInt(value.denominator) };
  }
  function represented(value) {
    if (value.n === 0n) return 0;
    const rounded = (n, d) => { const q = n / d, remainder = n % d; return q + (remainder * 2n > d || remainder * 2n === d && q % 2n === 1n ? 1n : 0n); };
    let exponent = value.n.toString(2).length - value.d.toString(2).length;
    if (exponent >= 0 ? value.n < value.d * 2n ** BigInt(exponent) : value.n * 2n ** BigInt(-exponent) < value.d) exponent -= 1;
    if (exponent > 1023) return Infinity;
    if (exponent < -1075) return 0;
    const scale = exponent < -1022 ? 1074 : 52 - exponent;
    const coefficient = scale >= 0 ? rounded(value.n * 2n ** BigInt(scale), value.d) : rounded(value.n, value.d * 2n ** BigInt(-scale));
    return Number(coefficient) * 2 ** -scale;
  }
  // Display validation uses the exact captured value and captured boundaries.
  // It intentionally does not consult today's formatter or reference policy.
  function coherentDisplay(text, value, bounds) {
    const shown = fraction(text);
    return typeof text === "string" && text.length <= 160 && shown && [fraction("0"), ...bounds].every(bound => compare(value, bound) === 0 ? compare(shown, bound) === 0 : compare(shown, bound) === compare(value, bound));
  }
  function selectedExact(snapshot, value) {
    return snapshot.outputUnit === "g/24h" ? { n: value.n, d: value.d * 1000n } : value;
  }
  // Version 1 owns the saved presentation algorithm. History never borrows
  // the current engine formatter, even when a later engine changes precision.
  function frozenLayout(snapshot, outputUnit) {
    const convert = value => outputUnit === "g/24h" ? { n: value.n, d: value.d * 1000n } : value;
    const values = [exact(snapshot.exactMain), exact(snapshot.reference?.exactUpper), exact(snapshot.reference?.exactNephrotic)].map(value => value ? convert(value) : null);
    if (!values[0]) return null;
    const numbers = values.map(value => value ? represented(value) : null);
    const short = (value, places) => (value !== 0 && (Math.abs(value) < 1e-7 || Math.abs(value) >= 1e12) ? String(value) : value.toLocaleString("pl-PL", { useGrouping: false, maximumFractionDigits: places })).replace(".", ",");
    const decimal = (value, places) => {
      let remainder = value.n % value.d, digits = "";
      for (let i = 0; i < places && remainder; i += 1) { remainder *= 10n; digits += String(remainder / value.d); remainder %= value.d; }
      return (String(value.n / value.d) + (digits ? "," + digits.replace(/0+$/, "") : "")).replace(/,$/, "");
    };
    const initialPrecision = numbers[0] !== 0 && Math.abs(numbers[0]) >= 1e-7 && Math.abs(numbers[0]) < 1 ? Math.max(3, 2 - Math.floor(Math.log10(Math.abs(numbers[0])))) : 3;
    for (let precision = initialPrecision; precision <= 120; precision += 1) {
      const texts = values.map((value, index) => value ? precision <= 15 ? short(numbers[index], precision) : decimal(value, precision) : null);
      if (texts.some(value => value !== null && value.length > 160)) continue;
      const shown = texts.map(value => value === null ? null : fraction(value));
      if (!shown[0] || compare(shown[0], fraction("0")) !== compare(values[0], fraction("0")) || ![1, 2].every(index => !values[index] || shown[index] && compare(shown[0], shown[index]) === compare(values[0], values[index]))) continue;
      const unitText = outputUnit === "g/24h" ? "g/24 h" : "mg/24 h", referenceValue = values[1] ? "<" + texts[1] : "Brak normy do porównania";
      return { valueText: texts[0], referenceValue, referenceText: values[1] ? `${referenceValue} ${unitText}` : referenceValue, nephroticValue: values[2] ? texts[2] : "", nephroticText: values[2] ? `≥${texts[2]} ${unitText}` : "", precision };
    }
    return null;
  }
  // This validates the frozen record, never the current clinical policy. A
  // later reference update must not reclassify an already saved measurement.
  function safeRecord(value, depth = 0, seen = new Set()) {
    if (value === null || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value) || typeof value === "string" && value.length <= 20000) return true;
    if (!value || typeof value !== "object" || depth > 12 || seen.has(value)) return false;
    seen.add(value);
    const properties = Object.getOwnPropertyDescriptors(value);
    const ok = Object.entries(properties).every(([key, property]) => !["__proto__", "constructor", "prototype"].includes(key) && !property.get && !property.set && safeRecord(property.value, depth + 1, seen));
    seen.delete(value);return ok;
  }
  function capturedArithmetic(snapshot, main) {
    const input = snapshot.input, conversions = input.unitConversions || {};
    if (!isObject(conversions) || Object.keys(conversions).some(key => !["concentration", "volume", "reportedValue"].includes(key))) return false;
    const units = { concentration: "concentrationUnit", volume: "volumeUnit", reportedValue: "reportedUnit" };
    const factors = { concentration: { "mg/dL": fraction("10"), "mg/L": fraction("1"), "g/L": fraction("1000") }, volume: { mL: fraction("0.001"), L: fraction("1") }, reportedValue: { "mg/24h": fraction("1"), "g/24h": fraction("1000") } };
    const product = (a, b) => ({ n: a.n * b.n, d: a.d * b.d });
    const quotient = (a, b) => ({ n: a.n * b.d, d: a.d * b.n });
    const effective = key => {
      const entry = conversions[key], unitKey = units[key];
      if (!entry) { const amount = fraction(input[key]), factor = factors[key][input[unitKey]]; return amount && factor ? product(amount, factor) : null; }
      if (!isObject(entry) || Object.keys(entry).length !== 4 || !["originalValue", "originalUnit", "convertedValue", "convertedUnit"].every(key => own(entry, key)) || !["string", "number"].includes(typeof entry.originalValue) || !["string", "number"].includes(typeof entry.convertedValue) || String(entry.convertedValue) !== String(input[key]) || entry.convertedUnit !== input[unitKey] || !Number.isFinite(numeric(entry.originalValue)) || !Number.isFinite(numeric(entry.convertedValue))) return null;
      const original = fraction(entry.originalValue), converted = fraction(entry.convertedValue), from = factors[key][entry.originalUnit], to = factors[key][entry.convertedUnit];
      if (!original || !converted || !from || !to || original.n < 0n || key === "volume" && original.n === 0n || represented(quotient(product(original, from), to)) !== numeric(entry.convertedValue)) return null;
      return product(original, from);
    };
    // Validate even dormant conversion provenance before it can be used later.
    if (Object.keys(conversions).some(key => !effective(key))) return false;
    const hours = fraction(input.hours);
    if (!hours || hours.n <= 0n) return false;
    let daily;
    if (input.mode === "reported") daily = effective("reportedValue");
    else { const concentration = effective("concentration"), volume = effective("volume"); if (!concentration || !volume || concentration.n < 0n || volume.n <= 0n) return false; daily = quotient(product(product(concentration, volume), fraction("24")), hours); }
    return daily && daily.n >= 0n && compare(daily, main) === 0;
  }
  function validSnapshot(value) {
    if (!safeRecord(value) || !isObject(value) || value.schema !== "clcr-protein-dzm" || value.version !== 1 || value.engineVersion !== 1 || value.valid !== true || value.unit !== "mg/24 h") return false;
    const main = exact(value.exactMain), daily = exact(value.exactDailyMg);
    if (!main || !daily || compare(main, daily) !== 0 || represented(main) !== value.rawValue || value.value !== value.rawValue || value.dailyMg !== value.rawValue || value.rawValue < 0) return false;
    const input = value.input;
    if (!isObject(input) || !["concentration", "reported"].includes(input.mode) || !isObject(input.knownFacts) || !Number.isFinite(value.hours) || value.hours <= 0 || numeric(input.hours) !== value.hours) return false;
    if (!capturedArithmetic(value, main) || input.knownFacts.Cl24CollectionProblem === true || COLLECTION_FIELDS.some(id => input.knownFacts[id] === false || input.knownFacts[`ui_${id}_answer`] === "no")) return false;
    if (!(input.ageYears === null || typeof input.ageYears === "string" || Number.isFinite(input.ageYears)) || typeof input.durationSource !== "string" || !["string", "number"].includes(typeof input.weightKg) || !["string", "number"].includes(typeof input.heightCm)) return false;
    if (typeof value.interpretation !== "string" || typeof value.statusText !== "string" || !Array.isArray(value.cautions) || value.cautions.some(item => typeof item !== "string") || !Array.isArray(value.references) || !Array.isArray(value.sources) || value.sources.length > 20 || value.sources.some(source => !isObject(source) || ["id", "label", "url"].some(key => typeof source[key] !== "string"))) return false;
    if (value.policy !== null && (!isObject(value.policy) || typeof value.policy.id !== "string" || !Number.isInteger(value.policy.version))) return false;
    if (value.policy !== null && (!isObject(value.referencePolicy) || value.referencePolicy.id !== value.policy.id || value.referencePolicy.version !== value.policy.version)) return false;
    const policy = value.referencePolicy;
    if (policy !== null && (!isObject(policy) || policy.quantity !== "total-protein-excretion" || !Array.isArray(policy.profiles) || JSON.stringify(policy.sources) !== JSON.stringify(value.sources) || JSON.stringify(policy.population) !== JSON.stringify(value.population))) return false;
    const weight = fraction(input.weightKg), height = fraction(input.heightCm), bsa = value.bsaM2 === null ? null : fraction(value.bsaM2);
    if (value.bsaM2 !== null && (!bsa || bsa.n <= 0n || !weight || weight.n <= 0n || !height || height.n <= 0n || value.bsaMethod !== "Haycock")) return false;
    if (value.indexed === null ? value.exactIndexed !== null : !bsa || !Number.isFinite(value.indexed) || value.indexed < 0 || !exact(value.exactIndexed) || represented(exact(value.exactIndexed)) !== value.indexed || compare({ n: daily.n * bsa.d, d: daily.d * bsa.n }, exact(value.exactIndexed)) !== 0) return false;
    if (value.indexed !== null && !coherentDisplay(value.indexedDisplay, exact(value.exactIndexed), [])) return false;
    const bounds = [];
    if (value.referenceActive !== true) {
      if (value.referenceActive !== false || value.referenceAvailable !== false || value.reference !== null || value.references.length !== 0 || !["zero", "unassessed"].includes(value.status) || value.status === "zero" && value.rawValue !== 0 || value.tone !== "neutral" || value.outOfRange !== null) return false;
    } else {
      const ref = value.reference, upper = exact(ref?.exactUpper), nephrotic = ref?.nephrotic === null ? null : exact(ref?.exactNephrotic);
      if (value.hours !== 24 || value.rawValue === 0 || value.referenceAvailable !== true || !isObject(ref) || ref.kind !== "upper" || ref.unit !== value.unit || ref.upperInclusive !== false || !upper || upper.n <= 0n || represented(upper) !== ref.upper || ref.lower !== null) return false;
      if (ref.nephrotic !== null && (!nephrotic || represented(nephrotic) !== ref.nephrotic || compare(nephrotic, upper) < 0)) return false;
      if (!clean(value.referenceText) || value.references.length !== 1 || JSON.stringify(value.references[0]) !== JSON.stringify(ref)) return false;
      const profile = policy?.profiles.find(item => item.id === ref.profileId), age = fraction(input.ageYears);
      if (!profile || !age || age.n < 0n || ["ruleId", "ageLower", "ageUpper", "ageLowerInclusive", "ageUpperInclusive", "sourceId", "sourceLabel", "method", "sample", "explanation"].some(key => JSON.stringify(profile[key]) !== JSON.stringify(ref[key]))) return false;
      const loAge = fraction(profile.ageLower), hiAge = profile.ageUpper === null ? null : fraction(profile.ageUpper);
      if (!loAge || compare(age, loAge) < 0 || compare(age, loAge) === 0 && profile.ageLowerInclusive !== true || hiAge && (compare(age, hiAge) > 0 || compare(age, hiAge) === 0 && profile.ageUpperInclusive !== true)) return false;
      if (input.agePrecision === "completed-years" && (!Number.isInteger(numeric(input.ageYears)) || profile.ageUpper !== null && profile.ageUpper < numeric(input.ageYears) + 1)) return false;
      const sourceUpper = fraction(profile.upper), sourceNephrotic = fraction(profile.nephrotic), minimumNephroticAge = fraction(profile.nephroticMinimumAge);
      if (!sourceUpper || sourceUpper.n <= 0n || !sourceNephrotic || !minimumNephroticAge || ref.sourceUpper !== profile.upper || ref.sex !== null || ref.upperInclusive !== profile.upperInclusive || JSON.stringify(ref.sourceIds) !== JSON.stringify(profile.sourceIds || [profile.sourceId])) return false;
      let expectedUpper = sourceUpper, expectedNephrotic = compare(age, minimumNephroticAge) >= 0 ? sourceNephrotic : null;
      if (profile.kind === "upper-bsa-capped") {
        const cap = fraction(profile.adultCap);
        if (!bsa || ref.bsa !== value.bsaM2 || ref.bsaM2 !== value.bsaM2 || ref.bsaMethod !== value.bsaMethod || !cap || cap.n <= 0n || ref.adultCap !== profile.adultCap) return false;
        const uncapped = { n: sourceUpper.n * bsa.n, d: sourceUpper.d * bsa.d };
        const capped = compare(uncapped, cap) >= 0;
        if (ref.uncappedUpper !== represented(uncapped) || ref.capped !== capped || ref.sourceUnit !== "mg/m²/24 h") return false;
        expectedUpper = capped ? cap : uncapped;
        if (expectedNephrotic) expectedNephrotic = { n: expectedNephrotic.n * bsa.n, d: expectedNephrotic.d * bsa.d };
      } else if (profile.kind !== "upper" || ref.bsa !== null || ref.bsaM2 !== null || ref.adultCap !== null || ref.capped !== false || ref.sourceUnit !== "mg/24 h") return false;
      if (compare(expectedUpper, upper) !== 0 || Boolean(expectedNephrotic) !== Boolean(nephrotic) || expectedNephrotic && compare(expectedNephrotic, nephrotic) !== 0) return false;
      bounds.push(upper);if(nephrotic)bounds.push(nephrotic);
      const status = nephrotic && compare(main, nephrotic) >= 0 ? "nephrotic" : compare(main, upper) >= 0 ? "high" : "within";
      if (value.status !== status || value.tone !== (status === "within" ? "normal" : status === "nephrotic" ? "danger" : "warning") || value.outOfRange !== (status !== "within")) return false;
    }
    const canonicalLayout = frozenLayout(value, "mg/24h");
    if (!canonicalLayout || !isObject(value.display) || typeof value.display.boundary !== "string" || value.display.text !== canonicalLayout.valueText) return false;
    const p = value.presentation;
    if (!["mg/24h", "g/24h"].includes(value.outputUnit) || input.outputUnit !== value.outputUnit || !isObject(p) || p.unitText !== (value.outputUnit === "g/24h" ? "g/24 h" : "mg/24 h") || p.rawValue !== represented(selectedExact(value, main)) || !Number.isInteger(p.precision) || p.precision < 0 || p.precision > 120) return false;
    const selectedBounds = bounds.map(bound => selectedExact(value, bound));
    if (p.ok !== true || p.outputUnit !== value.outputUnit || !exact(p.exactValue) || compare(exact(p.exactValue), selectedExact(value, main)) !== 0 || !coherentDisplay(p.valueText, selectedExact(value, main), [])) return false;
    if (bounds.length) {
      if (p.lower !== null || p.exactLower !== null || p.upper !== represented(selectedBounds[0]) || !exact(p.exactUpper) || compare(exact(p.exactUpper), selectedBounds[0]) !== 0 || p.referenceText !== `${p.referenceValue} ${p.unitText}`) return false;
      const shown = String(p.referenceValue).replace(/,/g, ".").replace(/^</, "").trim();
      if (!String(p.referenceValue).startsWith("<") || !coherentDisplay(shown, selectedBounds[0], [])) return false;
      const displayed = fraction(p.valueText), displayedUpper = fraction(shown);
      if (compare(main, bounds[0]) !== compare(displayed, displayedUpper)) return false;
      if (bounds.length > 1 && (p.nephrotic !== represented(selectedBounds[1]) || !exact(p.exactNephrotic) || compare(exact(p.exactNephrotic), selectedBounds[1]) !== 0)) return false;
    } else if (p.lower !== null || p.upper !== null || p.exactLower !== null || p.exactUpper !== null || p.referenceValue !== "Brak normy do porównania" || p.referenceText !== p.referenceValue) return false;
    const expected = frozenLayout(value, value.outputUnit);
    if (!expected || Object.entries(expected).some(([key, item]) => p[key] !== item)) return false;
    return true;
  }
  function readSnapshot(encoded) {
    if (typeof encoded !== "string" || encoded.length > 100000) return null;
    try { const value = JSON.parse(encoded); return validSnapshot(value) ? value : null; } catch (_) { return null; }
  }
  function augmentDatapoint(card, datapoint) {
    if (datapoint?.sourceFormulaId !== "Prot_mgkg") return datapoint;
    delete datapoint.proteinDzmSnapshot;
    Object.assign(datapoint, { outOfRange: null, norm: "", assessment: "unassessed", tone: "neutral" });
    let snapshot = readSnapshot(card?.getAttribute?.("data-clcr-protein-dzm-snapshot"));
    const selected = card?.getAttribute?.("data-clcr-protein-dzm-output-unit");
    if (snapshot && ["mg/24h", "g/24h"].includes(selected) && selected !== snapshot.outputUnit && root?.VildaClcrProteinDzm?.presentation) {
      snapshot = JSON.parse(JSON.stringify(snapshot));
      snapshot.outputUnit = selected;
      snapshot.input.outputUnit = selected;
      snapshot.presentation = root.VildaClcrProteinDzm.presentation(snapshot, selected);
      if (!validSnapshot(snapshot)) snapshot = null;
    }
    if (snapshot) Object.assign(datapoint, { proteinDzmSnapshot: snapshot, rawValue: valueNum(snapshot), valueNum: valueNum(snapshot), unit: unitText(snapshot), displayValue: displayText(snapshot), norm: normText(snapshot), outOfRange: snapshot.outOfRange, assessment: assessment(snapshot), tone: snapshot.tone === "normal" ? "success" : snapshot.tone, interpretation: snapshot.interpretation });
    return datapoint;
  }
  function applyLabResult(datapoint, labResult) {
    const snapshot = datapoint?.proteinDzmSnapshot;
    if (datapoint?.sourceFormulaId !== "Prot_mgkg" || !validSnapshot(snapshot) || !labResult) return labResult;
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
  function referenceNote(datapoint) {
    const snapshot = datapoint?.proteinDzmSnapshot;
    if (datapoint?.sourceFormulaId !== "Prot_mgkg" || !validSnapshot(snapshot)) return "";
    const range = normText(snapshot);
    const rows = [NOTE_HEADER, `Wynik białka w DZM: ${displayText(snapshot)} ${unitText(snapshot)}.`,
      `Opis wyniku: ${clean(snapshot.interpretation)}`, range ? `Norma użyta przy zapisie: ${range}.` : "Brak zapisanej normy.",
      ...(snapshot.cautions || []).map(text => `Uwaga do interpretacji: ${clean(text)}`), TREE_HEADER];
    try { rows.push(...treeRows(snapshot)); } catch (_) { return ""; }
    rows.push(TREE_END);
    return rows.join("\n");
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
  function hasSavedAssessment(note) { return typeof note?.body === "string" && note.body.includes(NOTE_HEADER); }
  function savedAssessment(note) {
    const body = typeof note?.body === "string" ? note.body : "";
    if (body.length > 150000 || !hasSavedAssessment(note)) return null;
    const rows = body.slice(body.indexOf(NOTE_HEADER)).split("\n");
    const from = rows.indexOf(TREE_HEADER), to = rows.indexOf(TREE_END);
    if (from < 0 || to <= from) return null;
    const snapshot = readTree(rows.slice(from + 1, to));
    if (!validSnapshot(snapshot)) return null;
    const lab = note.labResult || {}, display = displayText(snapshot), norm = normText(snapshot);
    if (lab.test !== LABEL || lab.unit !== unitText(snapshot) || lab.testKey !== TEST_KEY || normalized(lab.value) !== normalized(display) || lab.valueNum !== valueNum(snapshot) || clean(lab.norm || "") !== norm) return null;
    if (!rows.includes(`Wynik białka w DZM: ${display} ${unitText(snapshot)}.`) || !rows.includes(`Opis wyniku: ${clean(snapshot.interpretation)}`)) return null;
    if (norm ? !rows.includes(`Norma użyta przy zapisie: ${norm}.`) : !rows.includes("Brak zapisanej normy.")) return null;
    return { ...snapshot, displayValue: display, comparator: "", norm, outOfRange: snapshot.outOfRange };
  }
  function legacyPoint(note) {
    const lab = note?.labResult;
    if (!lab || lab.unit && !UNITS.has(lab.unit)) return null;
    const parsed = numeric(lab.value);
    const rawValue = typeof lab.valueNum === "number" && Number.isFinite(lab.valueNum) ? lab.valueNum : parsed;
    if (!Number.isFinite(rawValue) || rawValue < 0) return null;
    return { rawValue, valueNum: rawValue, displayValue: parsed === rawValue ? clean(lab.value) : String(rawValue).replace(".", ","), comparator: "", unit: lab.unit || "mg/24 h", outOfRange: null, norm: "", assessment: "unassessed", tone: "neutral" };
  }
  // Legacy captures stored wall-clock dates without an offset. They cannot
  // recover the elapsed duration after a device changes its time zone.
  function prepareValues(values = {}, context = {}, prior = null) {
    const result = { ...values }, input = prior?.input || {};
    result.Prot_inputMode ??= input.mode || "concentration";
    result.Prot_concentration ??= input.concentration ?? "";
    result.Prot_concentrationUnit ||= input.concentrationUnit || "mg/L";
    result.Prot_volume ??= result.V24 ?? input.volume ?? "";
    result.Prot_volumeUnit ||= input.volumeUnit || "mL";
    result.Prot_reportedValue ??= input.reportedValue ?? "";
    result.Prot_reportedUnit ||= input.reportedUnit || "mg/24h";
    result.Prot_outputUnit ||= prior?.outputUnit || input.outputUnit || "mg/24h";
    result.Prot_unitConversions ??= JSON.stringify(input.unitConversions || {});
    result.weight ??= input.weightKg ?? "";
    result.height ??= input.heightCm ?? "";
    if (!own(result, "Prot_collectionHours")) {
      if (own(result, "Cl24DurationHours")) result.Prot_collectionHours = result.Cl24DurationHours;
      else {
        const minuteCandidates = [context.durationMinutes, context.collectionMinutes, context.collection?.durationMinutes, context.inputs?.durationMinutes, context.referenceContext?.durationMinutes, context.recordedDurationMinutes, context.collectionAnalysis?.durationMinutes];
        const capturedMinutes = minuteCandidates.find(value => typeof value === "number" && Number.isFinite(value) && value > 0);
        const capturedHours = [context.collectionHours, context.durationHours].find(value => numeric(value) > 0);
        result.Prot_collectionHours = input.hours ?? capturedHours ?? (capturedMinutes ? String(capturedMinutes / 60) : "");
      }
    }
    result.Prot_collectionSource ??= input.durationSource ?? result.Cl24DurationSource ?? (numeric(result.Prot_collectionHours) > 0 ? "captured" : "historical-missing");
    result.Prot_durationNeedsConfirmation = String(result.Prot_collectionHours ?? "").trim() === "";
    return result;
  }
  function editableFields(values) {
    const field = (id, label, required = false, unitFieldId = "", options = []) => ({ id, label, required, unitFieldId, historicalContext: false, type: options.length ? "select" : "number", options: options.map(value => isObject(value) ? value : ({ value, label: value })) });
    return [
      field("Prot_inputMode", "Sposób wprowadzania", false, "", [{ value: "concentration", label: "Oblicz ze stężenia" }, { value: "reported", label: "Gotowy wynik" }]),
      ...(values.Prot_inputMode === "reported" ? [field("Prot_reportedValue", "Gotowy wynik dobowy", true, "Prot_reportedUnit"), field("Prot_reportedUnit", "Jednostka wyniku", false, "", ["mg/24h", "g/24h"])] : [
        field("Prot_concentration", "Białko całkowite w moczu", true, "Prot_concentrationUnit"), field("Prot_concentrationUnit", "Jednostka stężenia", false, "", ["mg/L", "mg/dL", "g/L"]),
        field("Prot_volume", "Objętość zbiórki", true, "Prot_volumeUnit"), field("Prot_volumeUnit", "Jednostka objętości", false, "", ["mL", "L"]),
      ]),
      field("Prot_collectionHours", "Czas zbiórki · godziny (wpisz, jeśli nie został zapisany)", true),
      field("Prot_outputUnit", "Jednostka prezentacji", false, "", ["mg/24h", "g/24h"]),
      field("weight", "Masa ciała w dniu badania · kg"),
      field("height", "Wzrost w dniu badania · cm"),
    ];
  }
  function captureFields(values, previous = []) {
    return [...editableFields(values), ...previous.filter(field => ["age", "ageMonths", "ageDays", "sex"].includes(field.id)).map(field => ({ ...field, required: false, historicalContext: true }))];
  }
  return Object.freeze({ NOTE_HEADER, TEST_KEY, assessment, readSnapshot, displayText, valueNum, unitText, augmentDatapoint, applyLabResult, referenceNote, savedAssessment, hasSavedAssessment, legacyPoint, normText, prepareValues, editableFields, captureFields });
});
