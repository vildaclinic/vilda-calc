/*
 * vilda_centile_interpolation.js (v2)
 *
 * Wspólny interpolator krzywych centylowych Palczewskiej (window.centileData).
 *
 * Potok na serię (płeć × rodzaj × centyl):
 *   1. monotoniczny sześcienny spline Hermite'a (PCHIP, wariant
 *      Fritscha–Carlsona/Butlanda) przez opublikowane węzły tabeli;
 *   2. próbkowanie co 1 miesiąc na zakresie danych;
 *   3. graduacja Whittakera–Hendersona (kara za drugą różnicę) z λ zależnym
 *      od wieku: λ(m) = LAMBDA · clamp(((m−RAMP_START)/(RAMP_FULL−RAMP_START))², EPS, 1).
 *      Rampa chroni realną, dużą krzywiznę niemowlęctwa (1.–24. mies.),
 *      a pełne λ wygładza szum zaokrągleń tabeli (0,1 kg/cm przy przyrostach
 *      0,2–0,3 między węzłami), który był źródłem „pofalowania" czystego PCHIP;
 *   4. finalny ewaluator: PCHIP przez graduowane próbki miesięczne
 *      (ciągła, gładka krzywa, brak przestrzeleń między próbkami).
 *
 * Własności (objęte testami tests/unit/centile-interpolation.test.mjs):
 *   - gładkość co najmniej taka jak dawnego wygładzania uśrednianiem
 *     (maks. druga różnica próbek miesięcznych nie większa niż w starym potoku);
 *   - odchyłka od opublikowanych wartości tabeli mniejsza niż w starym potoku
 *     (który sięgał 1,06 cm na wzroście 0–3 i 0,66 kg na wadze 1–18);
 *   - brak przecięć sąsiednich linii centylowych;
 *   - rysowanie krzywych i obliczenia numeryczne używają tej samej funkcji.
 *
 * Zachowanie na brzegach zakresu danych (jak dotychczasowa produkcyjna
 * funkcja getPalReferenceCentileInterpolated w app.js, na wartościach
 * graduowanych): wiek <= pierwszy węzeł — ekstrapolacja liniowa z dwóch
 * pierwszych próbek (miesiąc 0 siatki 0–3); wiek >= ostatni węzeł — wartość
 * ostatniej próbki.
 *
 * Konsumenci (delegacja ze starym kodem jako fallbackiem, gdy moduł nie jest
 * załadowany): app.js (getPalReferenceCentileInterpolated → getPLWeightCentile/
 * getPLHeightCentile, calcPercentileStatsPL), inline_index_03/04/07.js oraz
 * inline_docpro_01/02/05.js. Krzywe LMS (OLAF, WHO, DS) nie przechodzą przez
 * ten moduł — zachowują swój dotychczasowy potok z wygładzaniem uśrednianiem.
 */
(function () {
  'use strict';

  var w = typeof window !== 'undefined' ? window : globalThis;

  // Parametry graduacji dobrane pomiarowo (patrz docs/clinical/ALGORITHMS.md):
  // gładkość ≈ dawnego rozmycia przy 2–4× mniejszej odchyłce od tabeli.
  var WH_LAMBDA = 256;
  var WH_RAMP_START_MONTHS = 3;
  var WH_RAMP_FULL_MONTHS = 24;
  var WH_RAMP_EPSILON = 0.02;

  /**
   * Nachylenie brzegowe PCHIP: niecentrowany wzór trójpunktowy z klamrami
   * zachowującymi kształt (Fritsch–Carlson).
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

  /**
   * Graduacja Whittakera–Hendersona na siatce jednostkowej: minimalizuje
   * Σ(f−y)² + Σ_j λ_j (f[j] − 2f[j+1] + f[j+2])². Układ (I + DᵀΛD) f = y jest
   * pięciodiagonalny i SPD — rozwiązywany eliminacją pasmową bez pivotingu.
   * lamRow[j] to kara wiersza drugiej różnicy zaczepionego w j (j = 0..n-3).
   */
  function whGraduate(y, lamRow) {
    var n = y.length;
    if (n < 3 || !Array.isArray(lamRow) || lamRow.length !== n - 2) return y.slice();
    var A = [];
    var i;
    for (i = 0; i < n; i++) A.push(new Float64Array(5));
    var co = [1, -2, 1];
    for (var j = 0; j <= n - 3; j++) {
      var lam = lamRow[j];
      for (var a1 = 0; a1 < 3; a1++) {
        for (var a2 = 0; a2 < 3; a2++) {
          A[j + a1][a2 - a1 + 2] += lam * co[a1] * co[a2];
        }
      }
    }
    for (i = 0; i < n; i++) A[i][2] += 1;
    var b = Float64Array.from(y);
    for (i = 0; i < n; i++) {
      for (var r = 1; r <= 2 && i + r < n; r++) {
        var f = A[i + r][2 - r] / A[i][2];
        if (f === 0) continue;
        for (var c = 0; c <= 2; c++) A[i + r][2 - r + c] -= f * A[i][2 + c];
        b[i + r] -= f * b[i];
      }
    }
    var x = new Float64Array(n);
    for (i = n - 1; i >= 0; i--) {
      var s = b[i];
      for (var c2 = 1; c2 <= 2 && i + c2 < n; c2++) s -= A[i][2 + c2] * x[i + c2];
      x[i] = s / A[i][2];
    }
    return Array.from(x);
  }

  /** Rampa wieku dla λ: chroni realną krzywiznę niemowlęctwa. */
  function whLambdaAt(months) {
    var t = (months - WH_RAMP_START_MONTHS) / (WH_RAMP_FULL_MONTHS - WH_RAMP_START_MONTHS);
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    var scaled = t * t;
    return WH_LAMBDA * (scaled < WH_RAMP_EPSILON ? WH_RAMP_EPSILON : scaled);
  }

  // Cache serii (płeć|rodzaj|centyl); unieważniany, gdy window.centileData
  // zostanie podmienione na inny obiekt.
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
      // Ekstrapolacja liniowa z dwóch pierwszych próbek — reguła przejęta
      // z dotychczasowej funkcji produkcyjnej (miesiąc 0 na siatce 0–3).
      var slope = (ys[1] - ys[0]) / (xs[1] - xs[0]);
      return ys[0] + (age - xs[0]) * slope;
    }
    if (age >= xs[n - 1]) return ys[n - 1];
    var value = entry.evaluate(age);
    return Number.isFinite(value) ? value : null;
  }

  function buildSeries(rows, valueKey) {
    var knotXs = [];
    var knotYs = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (!row) continue;
      var x = row.months;
      var y = row[valueKey];
      if (!Number.isFinite(x) || typeof y !== 'number' || !Number.isFinite(y)) continue;
      knotXs.push(x);
      knotYs.push(y);
    }
    if (!knotXs.length) return null;
    // Dane są posortowane; sortowanie obronne na wypadek przyszłych edycji.
    var order = knotXs.map(function (_, idx) { return idx; }).sort(function (a, b) { return knotXs[a] - knotXs[b]; });
    var sortedXs = order.map(function (idx) { return knotXs[idx]; });
    var sortedYs = order.map(function (idx) { return knotYs[idx]; });
    var rawEvaluate = createPchip(sortedXs, sortedYs);
    if (!rawEvaluate) return null;

    // Próbkowanie miesięczne surowego PCHIP i graduacja WH.
    var m0 = Math.round(sortedXs[0]);
    var m1 = Math.round(sortedXs[sortedXs.length - 1]);
    var xs = [];
    var raw = [];
    for (var m = m0; m <= m1; m++) {
      var value = m <= sortedXs[0] ? sortedYs[0] : rawEvaluate(Math.min(m, sortedXs[sortedXs.length - 1]));
      if (!Number.isFinite(value)) return null;
      xs.push(m);
      raw.push(value);
    }
    var lamRow = [];
    for (var j = 0; j <= xs.length - 3; j++) lamRow.push(whLambdaAt(xs[j + 1]));
    var graduated = whGraduate(raw, lamRow);
    var evaluate = createPchip(xs, graduated);
    if (!evaluate) return null;
    return { xs: xs, ys: graduated, evaluate: evaluate };
  }

  w.VildaCentileInterp = Object.freeze({
    version: 2,
    method: 'pchip-whittaker-henderson',
    isReady: isReady,
    palCentileValue: palCentileValue,
    createPchip: createPchip,
    whGraduate: whGraduate,
  });
})();
