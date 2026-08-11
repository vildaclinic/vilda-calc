/*
 * vilda_centile_interpolation.js
 *
 * Wspólny interpolator krzywych centylowych Palczewskiej (window.centileData).
 * Metoda: monotoniczny sześcienny spline Hermite'a (PCHIP, wariant
 * Fritscha–Carlsona/Butlanda). Własności istotne klinicznie:
 *   - krzywa przechodzi DOKŁADNIE przez każdą opublikowaną wartość referencyjną
 *     (zero odchyłki na węzłach — w przeciwieństwie do wcześniejszego
 *     wygładzania uśrednianiem, które przesuwało krzywe o dziesiąte części
 *     kg/cm w obszarach dużej krzywizny);
 *   - między węzłami interpolacja jest monotoniczna (brak przestrzeleń
 *     i oscylacji), więc sąsiednie linie centylowe nie mogą się sztucznie
 *     przeciąć ani zafalować;
 *   - wartość użyta do rysowania krzywej i wartość użyta do obliczeń
 *     centyla pochodzą z tej samej funkcji.
 *
 * Zachowanie na brzegach zakresu danych celowo powiela dotychczasową
 * produkcyjną funkcję getPalReferenceCentileInterpolated (app.js):
 *   - wiek <= pierwszy węzeł: ekstrapolacja liniowa z dwóch pierwszych węzłów
 *     (używana przez siatkę 0–3 dla miesiąca 0);
 *   - wiek >= ostatni węzeł: wartość ostatniego węzła.
 *
 * Konsumenci (delegacja z zachowaniem starego kodu jako fallbacku):
 *   - app.js: getPalReferenceCentileInterpolated (→ getPLWeightCentile /
 *     getPLHeightCentile, calcPercentileStatsPL);
 *   - inline_index_07.js: siatka Palczewskiej 1–18 lat;
 *   - inline_index_03.js / inline_index_04.js: siatki 0–3 lat.
 * Gdy ten plik nie jest załadowany (np. docpro.html do czasu konsolidacji),
 * konsumenci działają po staremu.
 */
(function () {
  'use strict';

  var w = typeof window !== 'undefined' ? window : globalThis;

  /**
   * Nachylenie brzegowe PCHIP: niecentrowany wzór trójpunktowy z klamrami
   * zachowującymi kształt (Fritsch–Carlson). h0/m0 to krok i iloraz różnicowy
   * przy brzegu, h1/m1 — sąsiednie.
   */
  function pchipEndpointSlope(h0, h1, m0, m1) {
    var d = ((2 * h0 + h1) * m0 - h0 * m1) / (h0 + h1);
    if (d * m0 <= 0) return 0;
    if (m0 * m1 < 0 && Math.abs(d) > 3 * Math.abs(m0)) return 3 * m0;
    return d;
  }

  /**
   * Buduje ewaluator PCHIP dla węzłów (xs rosnące, ys skończone).
   * Zwraca funkcję f(x) określoną na [xs[0], xs[n-1]] (poza zakresem: null).
   * Zwraca null, gdy węzły są niepoprawne.
   */
  function createPchip(xs, ys) {
    if (!Array.isArray(xs) || !Array.isArray(ys) || xs.length !== ys.length) return null;
    var n = xs.length;
    if (n === 0) return null;
    for (var v = 0; v < n; v++) {
      if (!Number.isFinite(xs[v]) || !Number.isFinite(ys[v])) return null;
      if (v > 0 && !(xs[v] > xs[v - 1])) return null;
    }
    if (n === 1) {
      return function (x) { return x === xs[0] ? ys[0] : null; };
    }

    var h = new Array(n - 1);
    var m = new Array(n - 1);
    for (var i = 0; i < n - 1; i++) {
      h[i] = xs[i + 1] - xs[i];
      m[i] = (ys[i + 1] - ys[i]) / h[i];
    }

    var d = new Array(n);
    if (n === 2) {
      d[0] = m[0];
      d[1] = m[0];
    } else {
      for (var k = 1; k < n - 1; k++) {
        if (m[k - 1] * m[k] <= 0) {
          d[k] = 0;
        } else {
          // Ważona średnia harmoniczna (Fritsch–Butland) — gwarantuje
          // monotoniczność segmentów bez iteracyjnej korekty.
          var w1 = 2 * h[k] + h[k - 1];
          var w2 = h[k] + 2 * h[k - 1];
          d[k] = (w1 + w2) / (w1 / m[k - 1] + w2 / m[k]);
        }
      }
      d[0] = pchipEndpointSlope(h[0], h[1], m[0], m[1]);
      d[n - 1] = pchipEndpointSlope(h[n - 2], h[n - 3], m[n - 2], m[n - 3]);
    }

    return function evaluate(x) {
      if (!Number.isFinite(x) || x < xs[0] || x > xs[n - 1]) return null;
      // Wyszukiwanie binarne przedziału [xs[lo], xs[lo+1]] zawierającego x.
      var lo = 0;
      var hi = n - 1;
      while (hi - lo > 1) {
        var mid = (lo + hi) >> 1;
        if (xs[mid] <= x) lo = mid; else hi = mid;
      }
      if (x === xs[lo]) return ys[lo];
      if (x === xs[lo + 1]) return ys[lo + 1];
      var hh = h[lo];
      var t = (x - xs[lo]) / hh;
      var t2 = t * t;
      var t3 = t2 * t;
      var h00 = 2 * t3 - 3 * t2 + 1;
      var h10 = t3 - 2 * t2 + t;
      var h01 = -2 * t3 + 3 * t2;
      var h11 = t3 - t2;
      return h00 * ys[lo] + h10 * hh * d[lo] + h01 * ys[lo + 1] + h11 * hh * d[lo + 1];
    };
  }

  // Cache ewaluatorów per seria (płeć|rodzaj|centyl); unieważniany, gdy
  // window.centileData zostanie podmienione na inny obiekt.
  var cacheSource = null;
  var cache = new Map();

  function getCentileData() {
    var data = w.centileData;
    if (!data || typeof data !== 'object') return null;
    if (data !== cacheSource) {
      cacheSource = data;
      cache.clear();
    }
    return data;
  }

  function isReady() {
    var data = getCentileData();
    return !!(data && data.boys && data.girls);
  }

  /**
   * Odpowiednik produkcyjnej sygnatury getPalReferenceCentileInterpolated:
   * sex 'M'|'F', ageMonths, centile (3|10|25|50|75|90|97), kind 'WT'|'HT'|inne→BMI.
   * Zwraca number albo null (wtedy konsument używa dotychczasowej ścieżki).
   */
  function palCentileValue(sex, ageMonths, centile, kind) {
    var data = getCentileData();
    if (!data) return null;
    var age = Number(ageMonths);
    if (!Number.isFinite(age) || age < 0) return null;

    var sexKey = sex === 'M' ? 'boys' : 'girls';
    var kindKey = kind === 'WT' ? 'weight' : kind === 'HT' ? 'height' : 'bmi';
    var rows = data[sexKey] && data[sexKey][kindKey];
    if (!Array.isArray(rows) || !rows.length) return null;

    var cacheKey = sexKey + '|' + kindKey + '|p' + centile;
    var entry = cache.get(cacheKey);
    if (entry === undefined) {
      entry = buildSeries(rows, 'p' + centile);
      cache.set(cacheKey, entry);
    }
    if (!entry) return null;

    var xs = entry.xs;
    var ys = entry.ys;
    var n = xs.length;
    if (age <= xs[0]) {
      if (age === xs[0] || n < 2) return ys[0];
      // Ekstrapolacja liniowa z dwóch pierwszych węzłów — identycznie jak
      // dotychczasowa funkcja produkcyjna (miesiąc 0 na siatce 0–3).
      var slope = (ys[1] - ys[0]) / (xs[1] - xs[0]);
      return ys[0] + (age - xs[0]) * slope;
    }
    if (age >= xs[n - 1]) return ys[n - 1];
    var value = entry.evaluate(age);
    return Number.isFinite(value) ? value : null;
  }

  function buildSeries(rows, valueKey) {
    var xs = [];
    var ys = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (!row) continue;
      var x = row.months;
      var y = row[valueKey];
      if (!Number.isFinite(x) || typeof y !== 'number' || !Number.isFinite(y)) continue;
      xs.push(x);
      ys.push(y);
    }
    if (!xs.length) return null;
    // Dane są posortowane; sortowanie obronne na wypadek przyszłych edycji.
    var order = xs.map(function (_, idx) { return idx; }).sort(function (a, b) { return xs[a] - xs[b]; });
    var sortedXs = order.map(function (idx) { return xs[idx]; });
    var sortedYs = order.map(function (idx) { return ys[idx]; });
    var evaluate = createPchip(sortedXs, sortedYs);
    if (!evaluate) return null;
    return { xs: sortedXs, ys: sortedYs, evaluate: evaluate };
  }

  w.VildaCentileInterp = Object.freeze({
    version: 1,
    method: 'pchip-fritsch-carlson',
    isReady: isReady,
    palCentileValue: palCentileValue,
    createPchip: createPchip,
  });
})();
