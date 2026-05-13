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
    parseNumber: parseNumber,
    formatNumber: formatNumber,
    version: '1.0.0'
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.LabUnitConverter = api;
})(typeof window !== 'undefined' ? window : this);
