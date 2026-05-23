/* lab_unit_converter.js
 * --------------------------------------------------------------------------
 *  Moduł logiki przelicznika jednostek laboratoryjnych.
 *
 *  Zależy od:  LabUnitsData (globalny obiekt z lab_units_data.js)
 *
 *  Eksportuje globalny obiekt window.LabUnitConverter z metodami:
 *
 *    list()                 → tablica { id, label, group } posortowana po grupie
 *    groups()               → tablica nazw grup (kolejność jak w danych)
 *    find(id)               → pełny rekord substancji (lub null)
 *    search(query)          → fuzzy-filtr po label_pl/en/aliases/synonimy
 *    units(id)              → tablica jednostek danej substancji
 *    parseNumber(text)      → liczba z tolerancją PL (przecinek), notacji
 *                             naukowej i białych znaków (lub NaN)
 *    convert({substanceId, value, fromUnit, toUnit})
 *                            → { ok, value, formatted, ...meta } | { ok:false, error }
 *    convertAll({substanceId, value, fromUnit})
 *                            → tablica { unit, value, formatted } dla wszystkich
 *                               JEDNOSTEK INNYCH niż fromUnit
 *    formatNumber(value, precision)
 *                            → string sformatowany w stylu PL (przecinek dziesiętny,
 *                               spacja jako separator tysięcy dla wartości ≥ 10 000)
 *
 *  Reguła konwersji:
 *      value_in_SI = value_in_unit × unit.factor_to_si
 *      value_in_unit_B = value_in_SI / unitB.factor_to_si
 *  Czyli A → B  ⇒  value × (factor_A / factor_B)
 *
 *  Konwencja błędów: każda funkcja, która może się nie powieść, zwraca obiekt
 *  z polem `ok:false` i polem `error` opisującym przyczynę (do wyświetlenia w UI).
 * --------------------------------------------------------------------------
 */

(function (global) {
  'use strict';

  var DATA_API = global.LabUnitsData;
  if (!DATA_API) {
    // Awaryjny stub – pozwala załadować plik nawet bez danych, ale wszystkie
    // wywołania zwrócą informację o braku bazy.
    DATA_API = { list: function () { return []; }, find: function () { return null; }, groups: function () { return []; } };
  }

  // ────────────────────────────────────────────────────────────────
  //  Wewnętrzne helpery
  // ────────────────────────────────────────────────────────────────

  function stripDiacritics(str) {
    if (str == null) return '';
    try {
      return String(str).normalize('NFD').replace(/[̀-ͯ]/g, '');
    } catch (_) {
      return String(str);
    }
  }

  function norm(str) {
    var base = stripDiacritics(String(str || '')).toLowerCase();
    // Zamień wszystkie znaki niealfanumeryczne (kropki, myślniki, nawiasy, μ→u itd.)
    // na pojedynczą spację – dzięki temu "wit. D", "25-OH" i "1,25(OH)2D" są
    // dopasowywane do tego samego rdzenia ("wit d", "25 oh", "1 25 oh 2 d").
    return base.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function findUnit(substance, symbol) {
    if (!substance || !symbol) return null;
    for (var i = 0; i < substance.units.length; i++) {
      if (substance.units[i].symbol === symbol) return substance.units[i];
    }
    return null;
  }

  // Inteligentne zaokrąglenie do N cyfr znaczących; wartość 0 zostaje zerem.
  function roundToSigFigs(value, sig) {
    if (!isFinite(value)) return value;
    if (value === 0) return 0;
    var s = Math.max(1, sig | 0);
    var d = Math.ceil(Math.log10(Math.abs(value)));
    var power = s - d;
    var mag = Math.pow(10, power);
    return Math.round(value * mag) / mag;
  }

  // Domyślna precyzja, gdy substancja nie definiuje własnej.
  var DEFAULT_PRECISION = 3;

  // ────────────────────────────────────────────────────────────────
  //  Format liczby (locale PL)
  // ────────────────────────────────────────────────────────────────

  function formatNumber(value, precision) {
    if (!isFinite(value)) return '—';
    var p = (precision == null) ? DEFAULT_PRECISION : (precision | 0);
    var rounded = roundToSigFigs(value, p);

    // Bardzo małe wartości – notacja naukowa
    if (rounded !== 0 && Math.abs(rounded) < 0.0001) {
      var exp = rounded.toExponential(p - 1);
      return exp.replace('.', ',');
    }

    // Liczba miejsc po przecinku zależy od rzędu wielkości i precyzji
    var abs = Math.abs(rounded);
    var decimals;
    if (abs >= 100)       decimals = Math.max(0, p - 3);
    else if (abs >= 10)   decimals = Math.max(0, p - 2);
    else if (abs >= 1)    decimals = Math.max(1, p - 1);
    else if (abs >= 0.1)  decimals = Math.max(2, p);
    else if (abs >= 0.01) decimals = Math.max(3, p + 1);
    else                  decimals = Math.max(4, p + 2);

    var fixed = rounded.toFixed(decimals);
    // Usuń niepotrzebne zera końcowe, ale zostaw co najmniej jedno miejsce po przecinku,
    // jeśli liczba ma część ułamkową.
    if (fixed.indexOf('.') !== -1) {
      fixed = fixed.replace(/0+$/, '').replace(/\.$/, '');
    }

    // Separator tysięcy (spacja) dla |val| >= 10 000.
    var parts = fixed.split('.');
    if (Math.abs(parseInt(parts[0], 10)) >= 10000) {
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    }
    return parts.join(',');
  }

  function parseNumber(text) {
    if (text == null) return NaN;
    if (typeof text === 'number') return text;
    var s = String(text).trim();
    if (!s) return NaN;
    // Usuń spacje (także non-breaking) – separatory tysięcy.
    s = s.replace(/[\s ]/g, '');
    // Przecinek dziesiętny → kropka.
    s = s.replace(',', '.');
    var n = Number(s);
    return isFinite(n) ? n : NaN;
  }

  // ────────────────────────────────────────────────────────────────
  //  Publiczny API
  // ────────────────────────────────────────────────────────────────

  function list() {
    var raw = DATA_API.list();
    return raw.map(function (s) {
      return { id: s.id, label: s.label_pl, group: s.group };
    });
  }

  function groups() {
    return DATA_API.groups();
  }

  function find(id) {
    return DATA_API.find(id);
  }

  function units(id) {
    var s = DATA_API.find(id);
    return s ? s.units.slice() : [];
  }

  /**
   * Zwraca tablicę unikalnych identyfikatorów wskazań klinicznych
   * (clinical_indications) zebraną ze wszystkich substancji.
   * Kolejność: pierwszego wystąpienia w bazie (stabilna).
   */
  function listIndications() {
    var raw = DATA_API.list();
    var seen = {};
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var inds = Array.isArray(raw[i].clinical_indications) ? raw[i].clinical_indications : [];
      for (var j = 0; j < inds.length; j++) {
        var key = inds[j];
        if (!key || seen[key]) continue;
        seen[key] = true;
        out.push(key);
      }
    }
    return out;
  }

  /**
   * Zwraca listę substancji oznaczonych danym wskazaniem klinicznym.
   * Format jak `list()` — { id, label, group } w kolejności źródłowej (po grupach).
   */
  function findByIndication(indicationId) {
    if (!indicationId) return [];
    var raw = DATA_API.list();
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var inds = Array.isArray(raw[i].clinical_indications) ? raw[i].clinical_indications : [];
      if (inds.indexOf(indicationId) === -1) continue;
      out.push({ id: raw[i].id, label: raw[i].label_pl, group: raw[i].group });
    }
    return out;
  }

  // ────────────────────────────────────────────────────────────────
  //  Dobór zakresu referencyjnego do kontekstu pacjenta
  // ────────────────────────────────────────────────────────────────

  /**
   * Sprawdza, czy predykat `when` zakresu pasuje do kontekstu pacjenta.
   *
   * Reguła: każde POLE w `when` musi pasować do `patient`. Pole patient
   * o wartości `undefined`/`null` jest traktowane jak "nieznane" i NIE
   * pasuje do warunku, który wymaga konkretnej wartości (rygorystycznie),
   * z wyjątkiem zakresów z `default: true`, które są fallbackiem.
   *
   * Obsługiwane klucze w `when`:
   *   sex           – 'M'|'F'
   *   life_stage    – 'adult'|'pediatric'|'newborn' (na razie używamy 'adult')
   *   cycle_phase   – 'follicular'|'ovulation'|'luteal'|'postmenopause'|'pregnancy_t1..3'
   *   age_min       – wiek pacjenta >= age_min
   *   age_max       – wiek pacjenta < age_max (przedział lewo-domknięty)
   *   tanner        – etap Tannera (1..5)
   *   time_of_day   – 'morning'|'evening'|'midnight' — pora pobrania krwi
   *   test_protocol – 'basal'|'post_dst'|'post_acth' — kontekst pomiaru
   *   method        – 'lcms'|'immunoassay_pl' — metoda oznaczenia laboratoryjnego
   *                   (np. 17-OH-progesteron: LC-MS/MS vs immunoassay PL).
   *                   Strict: jeśli `when.method` jest zdefiniowane, `patient.method`
   *                   musi się zgadzać — w przeciwnym razie wpadnie do default.
   */
  function matchesWhen(when, patient) {
    if (!when) return true;
    var p = patient || {};
    if (when.sex && p.sex !== when.sex) return false;
    if (when.life_stage && p.life_stage !== when.life_stage) return false;
    if (when.cycle_phase && p.cycle_phase !== when.cycle_phase) return false;
    if (when.tanner && String(p.tanner) !== String(when.tanner)) return false;
    if (when.time_of_day && p.time_of_day !== when.time_of_day) return false;
    if (when.test_protocol && p.test_protocol !== when.test_protocol) return false;
    if (when.method && p.method !== when.method) return false;
    if (typeof when.age_min === 'number') {
      if (typeof p.age !== 'number' || !isFinite(p.age)) return false;
      if (p.age < when.age_min) return false;
    }
    if (typeof when.age_max === 'number') {
      if (typeof p.age !== 'number' || !isFinite(p.age)) return false;
      if (p.age >= when.age_max) return false;
    }
    return true;
  }

  /**
   * Wybiera najlepszy zakres referencyjny dla danej substancji i kontekstu
   * pacjenta. Strategia:
   *   1. Iteruj `reference_ranges_si` w kolejności deklaracji.
   *   2. Pomijaj zakresy z `default: true` w pierwszym przebiegu.
   *   3. Pierwszy zakres, którego `when` pasuje (matchesWhen) — wygrywa.
   *   4. Jeśli nic nie pasuje, użyj zakresu oznaczonego `default: true`.
   *   5. Jeśli substancja nie ma `reference_ranges_si`, użyj starego
   *      `default_range_si` (wsteczna kompatybilność) lub `null`.
   *
   * Zwraca obiekt:
   *   { low, high, context_pl, source_ids, id, matched: true|false }
   *   lub null, gdy substancja w ogóle nie ma zakresu (np. wit. D₃).
   */
  function selectRange(substance, patient) {
    if (!substance) return null;
    var ranges = Array.isArray(substance.reference_ranges_si) ? substance.reference_ranges_si : null;

    if (ranges && ranges.length) {
      // 1. Najpierw poszukaj prawdziwego matcha (pomijając default).
      for (var i = 0; i < ranges.length; i++) {
        var r = ranges[i];
        if (r.default) continue;
        if (matchesWhen(r.when, patient)) {
          return {
            id: r.id || null,
            low: r.low, high: r.high,
            context_pl: r.context_pl || '',
            source_ids: Array.isArray(r.source_ids) ? r.source_ids.slice() : [],
            no_interpretation: !!r.no_interpretation,
            matched: true,
            is_default: false
          };
        }
      }
      // 2. Fallback do default.
      for (var j = 0; j < ranges.length; j++) {
        var d = ranges[j];
        if (d.default) {
          return {
            id: d.id || null,
            low: d.low, high: d.high,
            context_pl: d.context_pl || '',
            source_ids: Array.isArray(d.source_ids) ? d.source_ids.slice() : [],
            no_interpretation: !!d.no_interpretation,
            matched: false,
            is_default: true
          };
        }
      }
    }

    // 3. Wsteczna kompatybilność: stare default_range_si.
    if (substance.default_range_si) {
      var legacy = substance.default_range_si;
      return {
        id: null,
        low: legacy.low, high: legacy.high,
        context_pl: legacy.context_pl || '',
        source_ids: [],
        matched: false,
        is_default: true
      };
    }
    return null;
  }

  /**
   * Lista wszystkich zakresów referencyjnych substancji (do listy override
   * w UI). Filtruje wpisy z `default: true`, żeby nie pokazywać "fallbacku"
   * jako wyboru klinicznego — chyba że jest to JEDYNY wpis dla substancji
   * (wtedy zwracamy go też, żeby UI miało co pokazać).
   */
  function rangesForOverride(substance) {
    if (!substance) return [];
    var ranges = Array.isArray(substance.reference_ranges_si) ? substance.reference_ranges_si : [];
    var realOnes = [];
    var defaults = [];
    for (var i = 0; i < ranges.length; i++) {
      if (ranges[i].default) defaults.push(ranges[i]);
      else realOnes.push(ranges[i]);
    }
    return realOnes.length ? realOnes : defaults;
  }

  function search(query) {
    var q = norm(query);
    if (!q) return list();
    // Tokenizacja: pojedyncze słowo, ale też wersja "scalona" (bez spacji),
    // dzięki czemu "17OHP" odnajdzie "17-OH-progesteron (17-OHP)".
    var tokens = q.split(' ').filter(Boolean);
    var raw = DATA_API.list();
    var scored = [];
    for (var i = 0; i < raw.length; i++) {
      var s = raw[i];
      var fields = [s.label_pl, s.label_en, s.id, s.group]
        .concat(Array.isArray(s.aliases) ? s.aliases : []);
      var hayParts = [];
      for (var k = 0; k < fields.length; k++) {
        var h = norm(fields[k]);
        if (h) hayParts.push(h);
      }
      var haystack = hayParts.join(' | ');
      var haystackNoSpace = haystack.replace(/\s+/g, '');

      // Wszystkie tokeny muszą wystąpić w haystack lub w wersji bez spacji.
      var allMatch = true;
      var anyExact = false;
      var anyStart = false;
      for (var t = 0; t < tokens.length; t++) {
        var tok = tokens[t];
        var inHaystack = haystack.indexOf(tok) !== -1;
        var inNoSpace  = !inHaystack && haystackNoSpace.indexOf(tok) !== -1;
        if (!inHaystack && !inNoSpace) { allMatch = false; break; }
        // Boost za dopasowanie na początku któregokolwiek pola
        for (var p = 0; p < hayParts.length; p++) {
          if (hayParts[p] === tok) { anyExact = true; break; }
          if (hayParts[p].indexOf(tok) === 0) { anyStart = true; }
        }
      }
      if (!allMatch) continue;
      var score = 10 + (anyStart ? 40 : 0) + (anyExact ? 50 : 0);
      scored.push({ s: s, score: score, idx: i });
    }
    scored.sort(function (a, b) {
      if (a.score !== b.score) return b.score - a.score;
      return a.idx - b.idx;
    });
    return scored.map(function (it) {
      return { id: it.s.id, label: it.s.label_pl, group: it.s.group };
    });
  }

  function convert(args) {
    args = args || {};
    var s = DATA_API.find(args.substanceId);
    if (!s) return { ok: false, error: 'Nie znaleziono substancji.' };

    var v = (typeof args.value === 'number') ? args.value : parseNumber(args.value);
    if (!isFinite(v))         return { ok: false, error: 'Wartość nie jest liczbą.' };
    if (v < 0)                return { ok: false, error: 'Wartość nie może być ujemna.' };

    var from = findUnit(s, args.fromUnit);
    var to   = findUnit(s, args.toUnit);
    if (!from) return { ok: false, error: 'Nieznana jednostka źródłowa: ' + args.fromUnit };
    if (!to)   return { ok: false, error: 'Nieznana jednostka docelowa: ' + args.toUnit };

    var si = v * from.factor_to_si;
    var out = si / to.factor_to_si;
    var precision = s.precision || DEFAULT_PRECISION;
    return {
      ok: true,
      value: out,
      formatted: formatNumber(out, precision) + ' ' + to.symbol,
      siValue: si,
      siUnit: s.canonical_si,
      fromUnit: from.symbol,
      toUnit: to.symbol,
      precision: precision
    };
  }

  function convertAll(args) {
    args = args || {};
    var s = DATA_API.find(args.substanceId);
    if (!s) return { ok: false, error: 'Nie znaleziono substancji.' };

    var v = (typeof args.value === 'number') ? args.value : parseNumber(args.value);
    if (!isFinite(v)) return { ok: false, error: 'Wartość nie jest liczbą.' };
    if (v < 0)        return { ok: false, error: 'Wartość nie może być ujemna.' };

    var from = findUnit(s, args.fromUnit);
    if (!from) return { ok: false, error: 'Nieznana jednostka źródłowa.' };

    var siValue = v * from.factor_to_si;
    var precision = s.precision || DEFAULT_PRECISION;
    var results = [];
    for (var i = 0; i < s.units.length; i++) {
      var u = s.units[i];
      if (u.symbol === from.symbol) continue;
      var outVal = siValue / u.factor_to_si;
      results.push({
        unit: u.symbol,
        label: u.label,
        kind: u.kind,
        value: outVal,
        formatted: formatNumber(outVal, precision)
      });
    }
    return {
      ok: true,
      substanceId: s.id,
      label: s.label_pl,
      fromUnit: from.symbol,
      value: v,
      siValue: siValue,
      siUnit: s.canonical_si,
      precision: precision,
      results: results
    };
  }

  /**
   * Ocenia pojedynczy wynik laboratoryjny względem zakresu referencyjnego
   * dobranego do kontekstu pacjenta. Bez DOM — do użycia np. w epikryzie.
   * Klasyfikacja jest odtworzeniem 1:1 logiki z UI przelicznika (5 stanów
   * + obsługa no_interpretation).
   *
   * @param {string} substanceId    np. 'igf1'
   * @param {Object} args
   *   {number|string} args.value     wartość wyniku
   *   {string}        args.unit      jednostka wartości (musi istnieć w units[])
   *   {Object}        [args.patient] { sex:'M'|'F', age:<lata>, tanner:1..5,
   *                                    life_stage:'pediatric'|'adult', ... }
   * @returns {Object}
   *   { ok:false, error }  albo
   *   { ok:true, substanceId, label, value, unit, siValue, siUnit, precision,
   *     status: 'far_below'|'below'|'within'|'above'|'far_above'|'no_interpretation'|'no_range',
   *     low, high,            // granice w SI (nmol/L itd.)
   *     lowInUnit, highInUnit,// granice w jednostce wejściowej
   *     context_pl, source_ids, matched, is_default }
   */
  function evaluate(substanceId, args) {
    args = args || {};
    var s = DATA_API.find(substanceId);
    if (!s) return { ok: false, error: 'Nie znaleziono substancji.' };

    var v = (typeof args.value === 'number') ? args.value : parseNumber(args.value);
    if (!isFinite(v)) return { ok: false, error: 'Wartość nie jest liczbą.' };
    if (v < 0)        return { ok: false, error: 'Wartość nie może być ujemna.' };

    var from = findUnit(s, args.unit);
    if (!from) return { ok: false, error: 'Nieznana jednostka: ' + args.unit };

    var siValue = v * from.factor_to_si;
    var precision = s.precision || DEFAULT_PRECISION;
    var range = selectRange(s, args.patient || {});

    var out = {
      ok: true,
      substanceId: s.id,
      label: s.label_pl,
      value: v,
      unit: from.symbol,
      siValue: siValue,
      siUnit: s.canonical_si,
      precision: precision,
      low: null, high: null,
      lowInUnit: null, highInUnit: null,
      context_pl: '',
      source_ids: [],
      matched: false,
      is_default: false,
      status: 'no_range'
    };

    if (!range) return out;

    out.context_pl = range.context_pl || '';
    out.source_ids = Array.isArray(range.source_ids) ? range.source_ids.slice() : [];
    out.matched = !!range.matched;
    out.is_default = !!range.is_default;

    if (range.no_interpretation) {
      out.status = 'no_interpretation';
      return out;
    }
    if (range.low == null || range.high == null) {
      out.status = 'no_range';
      return out;
    }

    out.low = range.low;
    out.high = range.high;
    out.lowInUnit = range.low / from.factor_to_si;
    out.highInUnit = range.high / from.factor_to_si;

    if (siValue > range.high * 2) {
      out.status = 'far_above';
    } else if (range.low > 0 && siValue < range.low * 0.5) {
      out.status = 'far_below';
    } else if (siValue < range.low) {
      out.status = 'below';
    } else if (siValue > range.high) {
      out.status = 'above';
    } else {
      out.status = 'within';
    }
    return out;
  }

  // ────────────────────────────────────────────────────────────────
  //  Eksport
  // ────────────────────────────────────────────────────────────────

  var api = {
    list: list,
    groups: groups,
    find: find,
    units: units,
    search: search,
    convert: convert,
    convertAll: convertAll,
    evaluate: evaluate,
    parseNumber: parseNumber,
    formatNumber: formatNumber,
    selectRange: selectRange,
    rangesForOverride: rangesForOverride,
    matchesWhen: matchesWhen,
    listIndications: listIndications,
    findByIndication: findByIndication,
    findSource: function (id) {
      return (DATA_API && typeof DATA_API.findSource === 'function') ? DATA_API.findSource(id) : null;
    },
    version: '2.0.0'
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.LabUnitConverter = api;
})(typeof window !== 'undefined' ? window : this);
