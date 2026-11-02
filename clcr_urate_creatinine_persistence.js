/* Frozen KM/Cr records. History uses captured arithmetic and policy only. */
(function (root, factory) {
  const api = factory();
  if (root) root.ClcrUrateCreatininePersistence = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  const NOTE_HEADER = "KM/Cr — ocena w chwili zapisu (wersja 1):";
  const TEST_KEY = "clcr:KM_Cr";
  const LABEL = "Kwas moczowy/kreatynina — KM/Cr";
  const TREE_HEADER = "Utrwalone dane stosunku kwasu moczowego do kreatyniny:";
  const TREE_END = "Koniec utrwalonych danych stosunku kwasu moczowego do kreatyniny.";
  const FIELD_MAP = Object.freeze({ URCR_inputMode: "mode", URCR_uricAcid: "uricAcid", URCR_uricAcidUnit: "uricAcidUnit", URCR_creatinine: "creatinine", URCR_creatinineUnit: "creatinineUnit", URCR_reportedValue: "reportedValue", URCR_reportedUnit: "reportedUnit", URCR_specimen: "specimen", URCR_outputUnit: "outputUnit" });
  const AGE_FIELDS = Object.freeze(["age", "ageMonths", "ageDays"]);
  const LABELS = Object.freeze({
    schema:"Schemat oceny", version:"Wersja schematu", engineVersion:"Wersja obliczenia", valid:"Poprawny pomiar", ok:"Dane poprawne", rawValue:"Wynik przed zaokrągleniem", value:"Wartość liczbowa", unit:"Jednostka wyniku", outputUnit:"Stała jednostka prezentacji", input:"Dane wejściowe", mode:"Sposób wprowadzania", uricAcid:"Kwas moczowy w moczu", uricAcidUnit:"Jednostka kwasu moczowego", creatinine:"Kreatynina w moczu", creatinineUnit:"Jednostka kreatyniny", reportedValue:"Wynik z laboratorium", reportedUnit:"Jednostka wyniku z laboratorium", specimen:"Rodzaj próbki", ageYears:"Wiek w dniu badania", agePrecision:"Dokładność wieku", knownFacts:"Znane informacje", sameUrineSample:"Stężenia z tej samej próbki", exactMain:"Dokładny stosunek", numerator:"Licznik", denominator:"Mianownik", referencePolicy:"Utrwalona polityka źródłowa", policy:"Wersja polityki", population:"Populacja odniesienia", reference:"Norma pacjenta", references:"Normy pacjenta", sources:"Źródła medyczne", referenceRows:"Tabela norm", status:"Ocena porównania", statusText:"Opis oceny", tone:"Kolor oceny", assessment:"Zapisany status", outOfRange:"Poza zakresem", referenceAvailable:"Dostępna norma", referenceActive:"Aktywne porównanie", interpretation:"Interpretacja wyniku", presentation:"Utrwalona prezentacja", valueText:"Pokazana liczba", unitText:"Pokazana jednostka", referenceValue:"Pokazany przedział", referenceText:"Pełny tekst normy", referenceLabel:"Etykieta normy", referenceHint:"Podpis źródła", fullValueText:"Pełny zapis wartości", fullValueComplete:"Zakończone rozwinięcie", approximate:"Prezentacja przybliżona", exactLower:"Dokładna dolna granica", exactUpper:"Dokładna górna granica", lower:"Dolna granica", upper:"Górna granica", lowerInclusive:"Dolna granica włączona", upperInclusive:"Górna granica włączona", profileId:"Profil normy", sourceId:"Identyfikator źródła", sourceLabel:"Nazwa źródła", sourceAgeLabel:"Źródłowy przedział wieku", precisionNote:"Objaśnienie dokładności", notes:"Uwagi", cautions:"Uwagi do oceny", category:"Kategoria porównania"
  });
  const REVERSE = Object.fromEntries(Object.entries(LABELS).map(([key, label]) => [label, key]));
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
  const isObject = value => Boolean(value && typeof value === "object" && !Array.isArray(value));
  const clean = value => Array.from(String(value ?? "").replace(/[\r\n]+/g, " ").replace(/[\u00a0\u202f]/g, " ")).filter(char => char.codePointAt(0) >= 32 && char.codePointAt(0) !== 127).join("").trim();
  const normalized = value => String(value ?? "").replace(/\s+/g, "").replace(/,/g, ".");
  /* Frozen version-1 KM/Cr wire-format validator. No clinical engine or current
   * reference-data module is consulted. All reference values come from the record. */
  const validateFrozen = (function () {
    "use strict";
    const UNIT = "mmol/mmol";
    const INPUT_UNITS = ["mg/dL", "mg/L", "mmol/L", "µmol/L"];
    const REPORTED_UNITS = [UNIT, "mg/mg", "mg/g"];
    const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
    const object = value => Boolean(value && typeof value === "object" && !Array.isArray(value));
    const finite = value => typeof value === "number" && Number.isFinite(value);
    const absent = value => value == null || typeof value === "string" && !value.trim();
    const copy = value => Array.isArray(value) ? value.map(copy) : object(value) ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)])) : value;
    function freeze(value) { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
    function safeData(value, finiteOnly = true, seen = new Set(), depth = 0) {
      if (value === null || value === undefined && !finiteOnly || typeof value === "boolean" || typeof value === "number" && (!finiteOnly || finite(value)) || typeof value === "string" && value.length <= 20000) return true;
      if (!value || typeof value !== "object" || depth > 14 || seen.has(value)) return false;
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== null && prototype !== (Array.isArray(value) ? Array.prototype : Object.prototype)) return false;
      seen.add(value);
      const entries = Object.entries(Object.getOwnPropertyDescriptors(value));
      const valid = entries.length <= 2000 && entries.every(([key, property]) => !["__proto__", "constructor", "prototype"].includes(key) && !property.get && !property.set && safeData(property.value, finiteOnly, seen, depth + 1));
      seen.delete(value); return valid;
    }
    function gcd(a, b) { a = a < 0n ? -a : a; while (b) { const remainder = a % b; a = b; b = remainder; } return a || 1n; }
    function reduced(n, d) { const divisor = gcd(n, d); return { n: n / divisor, d: d / divisor }; }
    function fraction(value) {
      const text = String(value).trim().replace(",", ".").replace(/−/g, "-");
      if (text.length > 4096) return null;
      const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(text);
      if (!match || !(match[2] || match[3])) return null;
      const digits = (match[2] || "0") + (match[3] || "");
      // Zero does not need an arbitrarily large power of ten.
      if (!/[1-9]/.test(digits)) return { n: 0n, d: 1n };
      const exponent = Number(match[4] || 0) - (match[3] || "").length;
      if (!Number.isInteger(exponent) || Math.abs(exponent) > 4096) return null;
      let n = BigInt((match[1] === "-" ? "-" : "") + digits), d = 1n;
      if (exponent >= 0) n *= 10n ** BigInt(exponent); else d = 10n ** BigInt(-exponent);
      return reduced(n, d);
    }
    const multiply = (a, b) => reduced(a.n * b.n, a.d * b.d);
    const divide = (a, b) => reduced(a.n * b.d, a.d * b.n);
    const compare = (a, b) => a.n * b.d < b.n * a.d ? -1 : a.n * b.d > b.n * a.d ? 1 : 0;
    const exact = value => value ? { numerator: String(value.n), denominator: String(value.d) } : null;
    function fromExact(value) {
      if (!object(value) || !/^-?\d{1,4096}$/.test(value.numerator || "") || !/^\d{1,4096}$/.test(value.denominator || "") || BigInt(value.denominator) <= 0n) return null;
      return reduced(BigInt(value.numerator), BigInt(value.denominator));
    }
    function roundedQuotient(n, d) { const quotient = n / d, remainder = n % d; return quotient + (remainder * 2n > d || remainder * 2n === d && quotient % 2n === 1n ? 1n : 0n); }
    function numberOf(value) {
      if (value.n === 0n) return 0;
      const negative = value.n < 0n, n = negative ? -value.n : value.n, d = value.d;
      let exponent = n.toString(2).length - d.toString(2).length;
      if (exponent >= 0 ? n < d * 2n ** BigInt(exponent) : n * 2n ** BigInt(-exponent) < d) exponent -= 1;
      if (exponent > 1023) return negative ? -Infinity : Infinity;
      if (exponent < -1075) return negative ? -0 : 0;
      const scale = exponent < -1022 ? 1074 : 52 - exponent;
      const coefficient = scale >= 0 ? roundedQuotient(n * 2n ** BigInt(scale), d) : roundedQuotient(n, d * 2n ** BigInt(-scale));
      const number = Number(coefficient) * 2 ** -scale;
      return negative ? -number : number;
    }
    function parseValue(value) {
      if (!["string", "number"].includes(typeof value)) return null;
      const text = String(value).trim().replace(",", ".").replace(/−/g, "-");
      if (!text || text.length > 512) return null;
      const quantity = fraction(text);
      if (!quantity) return null;
      const number = numberOf(quantity), represented = finite(number) ? fraction(String(number)) : null;
      return { text, value: Object.is(number, -0) ? 0 : number, exact: exact(quantity), representable: finite(number) && (number !== 0 || quantity.n === 0n), lossless: Boolean(represented && compare(quantity, represented) === 0) };
    }
    function decimalText(value, places = 1100) {
      const negative = value.n < 0n, n = negative ? -value.n : value.n;
      let remainder = n % value.d, text = (negative ? "-" : "") + String(n / value.d), digits = "";
      for (let i = 0; i < places && remainder; i += 1) { remainder *= 10n; digits += String(remainder / value.d); remainder %= value.d; }
      if (digits) text += "," + digits;
      return { text, complete: remainder === 0n };
    }
    function compactQuantity(quantity) {
      const value = numberOf(quantity);
      if (!finite(value) || value === 0 && quantity.n !== 0n) return null;
      let text;
      if (value === 0) text = "0";
      else if (compare(quantity, fraction("0.001")) < 0 || compare(quantity, fraction("100000")) >= 0) {
        const power = exponent => exponent >= 0 ? reduced(10n ** BigInt(exponent), 1n) : reduced(1n, 10n ** BigInt(-exponent));
        let exponent = quantity.n.toString().length - quantity.d.toString().length;
        if (compare(quantity, power(exponent)) < 0) exponent -= 1;
        const scaled = divide(quantity, power(exponent));
        let coefficient = roundedQuotient(scaled.n * 1000n, scaled.d);
        if (coefficient >= 10000n) { coefficient /= 10n; exponent += 1; }
        const digits = String(coefficient).padStart(4, "0"), decimals = digits.slice(1).replace(/0+$/, "");
        text = digits[0] + (decimals ? "." + decimals : "") + "e" + (exponent >= 0 ? "+" : "") + exponent;
      } else {
        const coefficient = roundedQuotient(quantity.n * 1000n, quantity.d), whole = coefficient / 1000n, decimals = String(coefficient % 1000n).padStart(3, "0").replace(/0+$/, "");
        text = String(whole) + (decimals ? "." + decimals : "");
      }
      const shown = fraction(text), approximate = !shown || compare(shown, quantity) !== 0, full = decimalText(quantity);
      return { value, text: (approximate ? "≈" : "") + text.replace(".", ","), approximate, fullValueText: full.text + (full.complete ? "" : "…"), fullValueComplete: full.complete };
    }
    function validPolicy(policy) {
      if (!safeData(policy) || !object(policy) || policy.quantity !== "urinary-urate-creatinine-ratio" || policy.specimen !== "random" || policy.unit !== UNIT || typeof policy.id !== "string" || !policy.id || !Number.isInteger(policy.version) || policy.version < 1 || !finite(policy.minimumAge) || policy.minimumAge < 0 || !object(policy.population) || typeof policy.population.label !== "string" || !policy.population.label || !Array.isArray(policy.sources) || !policy.sources.length || !Array.isArray(policy.profiles) || !policy.profiles.length || !object(policy.notes)) return false;
      if (!policy.sources.every(source => object(source) && ["id", "label", "url"].every(key => typeof source[key] === "string" && source[key]) && /^https?:\/\/[^\s<>"']+$/.test(source.url))) return false;
      if (!["noPolicyTitle", "noPolicy", "noAge", "noProfile", "timedTitle", "timed", "unknownSpecimen", "zeroTitle", "zero", "precision"].every(key => typeof policy.notes[key] === "string" && policy.notes[key])) return false;
      const ids = new Set();
      if (!policy.profiles.every(profile => {
        if (!object(profile) || ids.has(profile.id) || profile.kind !== "interval" || profile.specimen !== "random" || profile.unit !== UNIT || !finite(profile.ageLower) || profile.ageLower < 0 || profile.ageUpper !== null && (!finite(profile.ageUpper) || profile.ageUpper <= profile.ageLower) || !finite(profile.lower) || profile.lower < 0 || !finite(profile.upper) || profile.upper <= profile.lower || !["ageLowerInclusive", "ageUpperInclusive", "lowerInclusive", "upperInclusive"].every(key => typeof profile[key] === "boolean") || !["id", "label", "text", "sourceId", "sourceLabel", "sourceAgeLabel", "population", "sample", "method", "explanation"].every(key => typeof profile[key] === "string" && profile[key]) || !policy.sources.some(source => source.id === profile.sourceId) || !object(profile.titles) || !object(profile.copy) || !["low", "within", "high"].every(key => typeof profile.titles[key] === "string" && profile.titles[key] && typeof profile.copy[key] === "string" && profile.copy[key])) return false;
        if (profile.sourceIds && (!Array.isArray(profile.sourceIds) || !profile.sourceIds.length || profile.sourceIds.some(id => !policy.sources.some(source => source.id === id)))) return false;
        ids.add(profile.id); return true;
      })) return false;
      for (let i = 0; i < policy.profiles.length; i += 1) for (let j = i + 1; j < policy.profiles.length; j += 1) {
        const a = policy.profiles[i], b = policy.profiles[j], lower = Math.max(a.ageLower, b.ageLower), upper = Math.min(a.ageUpper ?? Infinity, b.ageUpper ?? Infinity);
        if (lower < upper || lower === upper && (a.ageLower === lower ? a.ageLowerInclusive : a.ageUpperInclusive) && (b.ageLower === lower ? b.ageLowerInclusive : b.ageUpperInclusive)) return false;
      }
      return true;
    }
    function selectedProfile(policy, age, precision) {
      if (!age?.lossless || age.value < 0 || precision === "completed-years" && !Number.isInteger(age.value)) return null;
      const value = fromExact(age.exact);
      const matches = policy.profiles.filter(profile => {
        const lower = compare(value, fraction(profile.ageLower)), upper = profile.ageUpper === null ? -1 : compare(value, fraction(profile.ageUpper));
        return (lower > 0 || lower === 0 && profile.ageLowerInclusive) && (upper < 0 || upper === 0 && profile.ageUpperInclusive) && (precision !== "completed-years" || profile.ageUpper === null || profile.ageUpper >= age.value + 1);
      });
      return matches.length === 1 ? matches[0] : null;
    }
    function stable(value) {
      if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
      if (object(value)) return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + stable(value[key])).join(",") + "}";
      return JSON.stringify(value);
    }

    const same = (a, b) => stable(a) === stable(b);
    const equal = (a, b) => Boolean(a && b && compare(a, b) === 0);
    const localized = value => String(value).replace(".", ",");
    const isAbsent = value => value == null || typeof value === "string" && !value.trim();
    function representedOperand(value, positive = false) {
      const parsed = parseValue(value);
      return parsed?.representable && (positive ? parsed.value > 0 : parsed.value >= 0) ? fromExact(parsed.exact) : null;
    }
    function molarAmount(amount, unit, mass) {
      if (unit === "mmol/L") return amount;
      if (unit === "µmol/L") return divide(amount, fraction("1000"));
      return divide(unit === "mg/dL" ? multiply(amount, fraction("10")) : amount, fraction(mass));
    }
    function capturedArithmetic(value, main) {
      const input = value.input, masses = value.conversionPolicy;
      if (!same(masses, { id: "urate-creatinine-molar-masses", version: 1, uricAcid: "168.11", creatinine: "113.12" })) return false;
      let amount;
      if (input.mode === "concentration") {
        if (!INPUT_UNITS.includes(input.uricAcidUnit) || !INPUT_UNITS.includes(input.creatinineUnit)) return false;
        const uric = representedOperand(input.uricAcid), creatinine = representedOperand(input.creatinine, true);
        if (!uric || !creatinine) return false;
        amount = divide(molarAmount(uric, input.uricAcidUnit, masses.uricAcid), molarAmount(creatinine, input.creatinineUnit, masses.creatinine));
      } else {
        if (!REPORTED_UNITS.includes(input.reportedUnit)) return false;
        amount = representedOperand(input.reportedValue);
        if (!amount) return false;
        if (input.reportedUnit === "mg/g") amount = divide(amount, fraction("1000"));
        if (input.reportedUnit !== UNIT) amount = multiply(amount, divide(fraction(masses.creatinine), fraction(masses.uricAcid)));
      }
      return equal(amount, main);
    }
    function capturedAge(input) {
      const facts = input.knownFacts;
      if (!own(facts, "age")) return true;
      let expected = null;
      if (!isAbsent(facts.age)) {
        const years = parseValue(facts.age), months = isAbsent(facts.ageMonths) ? { value: 0, lossless: true } : parseValue(facts.ageMonths);
        if (years?.lossless && months?.lossless && Number.isInteger(years.value) && Number.isInteger(months.value) && years.value >= 0 && years.value <= 120 && months.value >= 0 && months.value <= 11 && years.value * 12 + months.value <= 1440) {
          expected = years.value + months.value / 12;
          if (years.value === 0 && months.value === 0 && !isAbsent(facts.ageDays)) {
            const days = parseValue(facts.ageDays);
            expected = days?.lossless && Number.isInteger(days.value) && days.value >= 0 && days.value <= 28 ? days.value / 365.2425 : null;
          }
        }
      }
      const recorded = parseValue(input.ageYears);
      return expected === null ? input.ageYears === null : recorded?.lossless && recorded.value === expected;
    }
    function frozenReference(profile, policy) {
      const lower = fraction(profile.lower), upper = fraction(profile.upper);
      return {
        kind: "interval", profileId: profile.id, ruleId: policy.id + ":v" + policy.version, lower: profile.lower, upper: profile.upper, min: profile.lower, max: profile.upper,
        lowerInclusive: profile.lowerInclusive, upperInclusive: profile.upperInclusive, unit: UNIT, label: "Norma dla wieku", ageLabel: profile.label,
        text: localized(profile.lower) + "–" + localized(profile.upper), lowerText: localized(profile.lower), upperText: localized(profile.upper), exactLower: exact(lower), exactUpper: exact(upper),
        sourceId: profile.sourceId, sourceIds: profile.sourceIds || [profile.sourceId], sourceLabel: profile.sourceLabel, sourceAgeLabel: profile.sourceAgeLabel,
        population: profile.population, hint: profile.population, note: profile.population, method: profile.method, sample: profile.sample, specimen: profile.specimen, explanation: profile.explanation,
        sourceUnit: profile.unit, sourceText: profile.text, sourceLower: profile.lower, sourceUpper: profile.upper,
        ageLower: profile.ageLower, ageUpper: profile.ageUpper, ageLowerInclusive: profile.ageLowerInclusive, ageUpperInclusive: profile.ageUpperInclusive,
        agePolicy: policy.agePolicy || "", endpointPolicy: policy.endpointPolicy || ""
      };
    }
    function validate(record) {
      try {
        if (!safeData(record) || !object(record) || record.schema !== "clcr-urate-creatinine" || record.version !== 1 || record.engineVersion !== 1 || record.valid !== true || record.ok !== true || record.unit !== UNIT || record.outputUnit !== UNIT) return null;
        const input = record.input, main = fromExact(record.exactMain);
        if (!object(input) || !main || main.n < 0n || !finite(record.rawValue) || record.rawValue < 0 || numberOf(main) !== record.rawValue || record.rawValue === 0 && main.n !== 0n || record.value !== record.rawValue) return null;
        if (!["concentration", "reported"].includes(input.mode) || !["random", "timed", "unknown"].includes(input.specimen) || input.outputUnit !== UNIT || !["exact", "completed-years"].includes(input.agePrecision) || !object(input.knownFacts) || ![null, true].includes(input.sameUrineSample)) return null;
        if ([false, "false"].includes(input.knownFacts.sameUrineSample) || [false, "false"].includes(input.knownFacts.URCR_sameUrineSample) || !capturedAge(input) || !capturedArithmetic(record, main)) return null;
        const inputKeys = ["mode", "uricAcid", "uricAcidUnit", "creatinine", "creatinineUnit", "reportedValue", "reportedUnit", "specimen", "outputUnit", "ageYears", "agePrecision", "sameUrineSample", "knownFacts"];
        if (!inputKeys.every(key => own(input, key))) return null;
        for (const key of ["uricAcid", "uricAcidUnit", "creatinine", "creatinineUnit", "reportedValue", "reportedUnit"]) if (!["number", "string"].includes(typeof input[key])) return null;
        const required = input.mode === "reported" ? ["URCR_reportedValue"] : ["URCR_uricAcid", "URCR_creatinine"];
        if (!same(record.requiredIds, required) || !same(record.missingIds, []) || !same(record.invalidIds, []) || record.blocked !== false || record.errorCode !== "" || record.error !== "" || !same(record.cautions, [])) return null;
        const policy = record.referencePolicy;
        if (policy !== null && !validPolicy(policy)) return null;
        if (!same(record.policy, policy ? { id: policy.id, version: policy.version } : null) || !same(record.population, policy?.population || null) || !same(record.sources, policy?.sources || []) || !same(record.educationalReferences, policy?.educationalReferences || [])) return null;
        const age = parseValue(input.ageYears), ageKnown = Boolean(age?.lossless && age.value >= 0), eligible = policy ? selectedProfile(policy, age, input.agePrecision) : null;
        const profile = input.specimen === "random" ? eligible : null, reference = profile ? frozenReference(profile, policy) : null;
        if (!same(record.reference, reference) || !same(record.references, reference ? [reference] : []) || record.referenceAvailable !== Boolean(reference) || record.referenceActive !== Boolean(reference && main.n !== 0n) || record.referencePreview !== Boolean(reference) || record.biochemical !== false || record.comparisonKind !== "orientational") return null;
        const notes = policy ? copy(policy.notes) : {};
        let status = "unassessed", tone = "neutral", outOfRange = null;
        let title = notes.noPolicyTitle || "Obliczony KM/Cr", description = notes.noPolicy || "Nie dobrano właściwego zakresu laboratoryjnego. Wynik liczbowy pozostaje dostępny.";
        if (profile) {
          const lo = compare(main, fraction(reference.lower)), hi = compare(main, fraction(reference.upper));
          status = lo < 0 || lo === 0 && !reference.lowerInclusive ? "low" : hi > 0 || hi === 0 && !reference.upperInclusive ? "high" : "within";
          tone = status === "within" ? "normal" : "warning"; outOfRange = status !== "within";
          title = profile.titles[status]; description = profile.copy[status];
        } else if (input.specimen === "timed") description = notes.timed || "Wynik ze zbiórki dobowej pozostaje bez automatycznej normy dla próbki jednorazowej.";
        else if (input.specimen === "unknown") description = notes.unknownSpecimen || "Rodzaj próbki nie jest ustalony. Wynik pozostaje bez automatycznej normy dla próbki jednorazowej.";
        else if (!ageKnown) description = notes.noAge || "Brak danych o wieku do dobrania normy. Wynik liczbowy pozostaje dostępny.";
        else if (policy && !eligible) description = notes.noProfile || description;
        if (main.n === 0n) { status = "zero"; tone = "neutral"; outOfRange = null; title = notes.zeroTitle || "Wartość zerowa — sprawdź raport"; description = notes.zero || "Sprawdź granicę oznaczalności laboratorium. Wynik „<…” nie oznacza dokładnego zera."; }
        if (record.status !== status || record.statusText !== title || record.tone !== tone || record.outOfRange !== outOfRange || record.assessment !== (({ low: "below", high: "above", within: "within" })[status] || "unassessed") || record.category !== null || record.interpretation !== description || record.contextLabel !== "Kwas moczowy/kreatynina — KM/Cr") return null;
        if (record.referenceLabel !== "Norma dla wieku" || record.referenceHint !== (reference?.sourceLabel || "") || record.referenceText !== (reference?.text || "Brak normy do porównania") || record.populationCategory !== (ageKnown ? age.value >= 18 ? "adult" : "child" : null)) return null;
        const shown = compactQuantity(main);
        if (!shown) return null;
        const referenceValue = reference ? localized(reference.lower) + "–" + localized(reference.upper) : input.specimen === "timed" ? notes.timedTitle || "Brak normy DZM w aplikacji" : "Brak normy do porównania";
        const precisionNote = shown.approximate ? notes.precision || "Znak ≈ oznacza skrócony zapis. Ocenę oparto na pełnej wartości." : "";
        const layout = {
          ok: true, outputUnit: UNIT, valueText: shown.text, unitText: UNIT, rawValue: shown.value,
          referenceValue, referenceText: reference ? referenceValue + " " + UNIT : referenceValue,
          referenceLabel: reference ? "Norma dla wieku · " + reference.sourceLabel : "Norma dla wieku", referenceHint: reference?.sourceLabel || "",
          lower: reference?.lower ?? null, upper: reference?.upper ?? null, exactValue: exact(main), exactLower: reference?.exactLower ?? null, exactUpper: reference?.exactUpper ?? null,
          lowerInclusive: reference?.lowerInclusive ?? null, upperInclusive: reference?.upperInclusive ?? null,
          approximate: shown.approximate, roundedDisplay: shown.approximate, fullValueText: shown.fullValueText, unroundedValueText: shown.fullValueText, fullValueComplete: shown.fullValueComplete,
          precision: 3, referenceApproximate: false, precisionNote, statusText: title, interpretation: description
        };
        if (!same(record.presentation, layout) || !same(record.display, { text: shown.text, boundary: precisionNote })) return null;
        const rows = policy ? policy.profiles.map(item => ({ profileId: item.id, label: item.label, text: localized(item.lower) + "–" + localized(item.upper), unit: UNIT, sourceId: item.sourceId, sourceLabel: item.sourceLabel, sourceAgeLabel: item.sourceAgeLabel, population: item.population, ageLower: item.ageLower, ageUpper: item.ageUpper, active: reference?.profileId === item.id })) : [];
        if (!same(record.referenceRows, rows) || !same(record.referenceTable, rows)) return null;
        notes.sourceSummary = reference ? reference.sourceLabel + " · próbka jednorazowa" : "";
        notes.contextExplanation = profile?.explanation || description;
        notes.fullValueText = shown.fullValueText;
        notes.precisionNote = precisionNote;
        notes.formula = notes.formula || "KM/Cr = stężenie kwasu moczowego / stężenie kreatyniny po przeliczeniu obu stężeń na mmol/L.";
        notes.conversion = notes.conversion || "Masy molowe: kwas moczowy 168,11 g/mol; kreatynina 113,12 g/mol. mg/mg × 113,12/168,11 = mmol/mmol; mg/g dodatkowo dzielimy przez 1000.";
        notes.specimen = notes.specimen || "Norma kwalifikuje rodzaj próbki niezależnie od tego, że sam iloraz nie potrzebuje czasu ani objętości.";
        notes.limitations = notes.limitations || "Bez właściwego zakresu wynik pozostaje liczbowy, bez automatycznej oceny.";
        if (!same(record.notes, notes)) return null;
        return freeze(copy(record));
      } catch (_) { return null; }
    }
    return validate;
  })();
  function validSnapshot(value) { return Boolean(validateFrozen(value)); }
  function readSnapshot(encoded) {
    if (typeof encoded !== "string" || encoded.length > 150000) return null;
    try { return validateFrozen(JSON.parse(encoded)); } catch (_) { return null; }
  }
  function valueNum(snapshot) { return snapshot?.presentation?.rawValue ?? snapshot?.rawValue; }
  function unitText(snapshot) { return snapshot?.presentation?.unitText || snapshot?.unit || ""; }
  function displayText(snapshot) { return clean(snapshot?.presentation?.valueText); }
  function normText(snapshot) { return snapshot?.referenceAvailable === true ? clean(snapshot.presentation?.referenceText || `${snapshot.presentation?.referenceValue || ""} ${unitText(snapshot)}`) : ""; }
  function boundaryText(snapshot) {
    if (snapshot?.presentation?.approximate !== true) return "";
    const full = clean(snapshot.presentation.fullValueText);
    if (snapshot.presentation.fullValueComplete === true && full.length <= 512) return full;
    const quantity = snapshot.exactMain;
    return quantity && /^\d+$/.test(quantity.numerator || "") && /^\d+$/.test(quantity.denominator || "") ? quantity.numerator + "/" + quantity.denominator : "";
  }
  function assessment(snapshot) { return ({ low:"below", high:"above", within:"within" })[snapshot?.status] || "unassessed"; }
  function augmentDatapoint(card, datapoint) {
    if (datapoint?.sourceFormulaId !== "KM_Cr") return datapoint;
    delete datapoint.urateCreatinineSnapshot;
    Object.assign(datapoint, { outOfRange:null, norm:"", assessment:"unassessed", tone:"neutral", boundary:"" });
    const snapshot = readSnapshot(card?.getAttribute?.("data-clcr-urate-creatinine-snapshot"));
    if (snapshot) Object.assign(datapoint, { urateCreatinineSnapshot:snapshot, label:LABEL, testKey:TEST_KEY, rawValue:valueNum(snapshot), valueNum:valueNum(snapshot), unit:unitText(snapshot), displayValue:displayText(snapshot), norm:normText(snapshot), outOfRange:snapshot.outOfRange, assessment:assessment(snapshot), tone:snapshot.tone === "normal" ? "success" : snapshot.tone, interpretation:snapshot.interpretation, boundary:boundaryText(snapshot), calculationMethod:({random:"Próbka jednorazowa",timed:"DZM",unknown:"Typ próbki nieutrwalony"})[snapshot.input.specimen] });
    return datapoint;
  }
  function applyLabResult(datapoint, labResult) {
    const snapshot = datapoint?.urateCreatinineSnapshot;
    if (datapoint?.sourceFormulaId !== "KM_Cr" || !validSnapshot(snapshot) || !labResult) return labResult;
    Object.assign(labResult, { test:LABEL, value:displayText(snapshot), valueNum:valueNum(snapshot), unit:unitText(snapshot), testKey:TEST_KEY });
    const norm=normText(snapshot); if (norm) labResult.norm=norm; else delete labResult.norm;
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
    const snapshot=datapoint?.urateCreatinineSnapshot;
    if (datapoint?.sourceFormulaId !== "KM_Cr" || !validSnapshot(snapshot)) return "";
    const norm=normText(snapshot), rows=[NOTE_HEADER, `KM/Cr: ${displayText(snapshot)} ${unitText(snapshot)}.`, `Opis wyniku: ${clean(snapshot.interpretation)}`, norm ? `Norma użyta przy zapisie: ${norm}.` : "Brak zapisanej normy.", TREE_HEADER];
    try { rows.push(...treeRows(snapshot)); } catch (_) { return ""; }
    rows.push(TREE_END); return rows.join("\n");
  }
  function hasSavedAssessment(note) { return typeof note?.body === "string" && note.body.includes(NOTE_HEADER); }
  function savedAssessment(note) {
    const body=typeof note?.body === "string" ? note.body : "";
    if (body.length>200000 || !hasSavedAssessment(note)) return null;
    const rows=body.slice(body.indexOf(NOTE_HEADER)).split("\n"), from=rows.indexOf(TREE_HEADER), to=rows.indexOf(TREE_END);
    if (from<0 || to<=from || rows.lastIndexOf(TREE_HEADER)!==from || rows.lastIndexOf(TREE_END)!==to) return null;
    const snapshot=readTree(rows.slice(from+1,to)); if (!validSnapshot(snapshot)) return null;
    const lab=note.labResult || {}, display=displayText(snapshot), norm=normText(snapshot);
    if (lab.test!==LABEL || lab.unit!==unitText(snapshot) || lab.testKey!=null && lab.testKey!==TEST_KEY || normalized(lab.value)!==normalized(display) || lab.valueNum!==valueNum(snapshot) || clean(lab.norm || "")!==norm) return null;
    if (!rows.includes(`KM/Cr: ${display} ${unitText(snapshot)}.`) || !rows.includes(`Opis wyniku: ${clean(snapshot.interpretation)}`) || !(norm ? rows.includes(`Norma użyta przy zapisie: ${norm}.`) : rows.includes("Brak zapisanej normy."))) return null;
    return { ...snapshot, displayValue:display, comparator:"", norm };
  }
  // Edit migration is explicit. A saved timed label or absent provenance must
  // never acquire the new-form default of a random specimen on history reads.
  function prepareValues(values={}, context={}, prior=null) {
    const result={...values}, input=prior?.input || {}, typed=Boolean(prior);
    for (const [id,key] of Object.entries(FIELD_MAP)) if (!own(result,id)) result[id]=input[key] ?? (id==="URCR_inputMode"?"concentration":id==="URCR_uricAcid"?result.U_UA??"":id==="URCR_creatinine"?result.Ucr??"":id.endsWith("Unit") ? id==="URCR_reportedUnit"||id==="URCR_outputUnit"?"mmol/mmol":"mg/dL":id==="URCR_specimen"?"unknown":"");
    if (!typed) {
      // Dedicated controls from an unrelated dormant form are not evidence
      // about this historical ratio. Legacy input IDs are its captured source.
      if (own(values,"U_UA")) result.URCR_uricAcid=values.U_UA;
      if (own(values,"Ucr")) result.URCR_creatinine=values.Ucr;
      result.URCR_inputMode="concentration";
      result.URCR_uricAcidUnit="mg/dL"; result.URCR_creatinineUnit="mg/dL";
      const recorded=[context.specimen,context.sampleType].find(value=>["random","timed"].includes(value)) || (["timed","unknown"].includes(values.URCR_specimen)?values.URCR_specimen:null);
      result.URCR_specimen=recorded||"unknown";
    }
    if (typed) for (const [id,key] of Object.entries(FIELD_MAP)) result[id]=input[key]??result[id];
    result.URCR_outputUnit="mmol/mmol";
    for (const id of AGE_FIELDS) if (own(input.knownFacts || {},id)) result[id]=input.knownFacts[id];
    if (own(input.knownFacts || {},"URCR_sameUrineSample")) result.URCR_sameUrineSample=input.knownFacts.URCR_sameUrineSample;
    return result;
  }
  function editableFields(values={}) {
    const field=(id,label,required=false,unitFieldId="",options=[])=>({id,label,required,unitFieldId,historicalContext:false,type:options.length?"select":"number",options:options.map(value=>isObject(value)?value:({value,label:value}))});
    const concentration=["mg/dL","mg/L","mmol/L","µmol/L"];
    return [field("URCR_inputMode","Sposób wprowadzania",false,"",[{value:"concentration",label:"Oblicz ze stężeń"},{value:"reported",label:"Gotowy wynik KM/Cr"}]),
      ...(values.URCR_inputMode==="reported"?[field("URCR_reportedValue","KM/Cr z wyniku badania",true,"URCR_reportedUnit"),field("URCR_reportedUnit","Jednostka gotowego wyniku",false,"",["mmol/mmol","mg/mg","mg/g"])]:[field("URCR_uricAcid","Kwas moczowy w moczu",true,"URCR_uricAcidUnit"),field("URCR_uricAcidUnit","Jednostka kwasu moczowego",false,"",concentration),field("URCR_creatinine","Kreatynina w moczu",true,"URCR_creatinineUnit"),field("URCR_creatinineUnit","Jednostka kreatyniny",false,"",concentration)]),
      field("URCR_specimen","Rodzaj próbki",false,"",[{value:"unknown",label:"Typ próbki nieznany — dawny zapis"},{value:"random",label:"Próbka jednorazowa"},{value:"timed",label:"Dobowa zbiórka moczu (DZM)"}])];
  }
  function captureFields(values,previous=[]) { return [...editableFields(values),...previous.filter(field=>AGE_FIELDS.includes(field.id)).map(field=>({...field,required:false,historicalContext:true}))]; }
  return Object.freeze({ NOTE_HEADER,TEST_KEY,LABEL,FIELD_MAP,AGE_FIELDS,assessment,readSnapshot,validSnapshot,displayText,boundaryText,valueNum,unitText,augmentDatapoint,applyLabResult,referenceNote,savedAssessment,hasSavedAssessment,normText,prepareValues,editableFields,captureFields });
});
