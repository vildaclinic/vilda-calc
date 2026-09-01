/*
 * vitalSigns.js — silnik centyli tętna (HR) i liczby oddechów (RR) dla dzieci 0–18 lat.
 *
 * Wersja 2.1.0 — naprawa po audycie modułu „Liczba oddechów” (2026-09, etapy 1–2).
 *
 * Dane referencyjne (wartości przepisane 1:1 z publikacji):
 *  - Fleming S. i wsp., „Normal ranges of heart rate and respiratory rate in children
 *    from birth to 18 years of age: a systematic review of observational studies”,
 *    Lancet 2011;377(9770):1011–1018 (dzieci zdrowe; centyle 1., 10., 25., 50., 75., 90., 99.).
 *  - Bonafide C.P. i wsp., „Development of heart and respiratory rate percentile curves
 *    for hospitalized children”, Pediatrics 2013;131(4):e1150–e1157
 *    (dzieci hospitalizowane; centyle 10., 50., 90.).
 *  - Herbert A., Pearn J., Wilson S., „Normal Percentiles for Respiratory Rate in Children —
 *    Reference Ranges Determined from an Optical Sensor”, Children 2020;7(10):160 —
 *    Tabela 4 (sen spokojny, metoda dwóch okresów 30 s): średnia, SD i mediana RR
 *    w 7 pasmach wieku 0–4,5 roku. Publikacja NIE zawiera liczbowych tabel centylowych
 *    (krzywe są tylko na wykresach), dlatego ocena snu jest liczona względem
 *    opublikowanej średniej ±SD przy założeniu rozkładu normalnego (decyzja właściciela,
 *    2026-09). Powyżej 4,5 roku brak norm snu — silnik zgłasza to flagą zamiast
 *    ekstrapolować.
 *
 * Korekty:
 *  - temperatura RR: +2,2 oddechu/min na 1 °C względem 37 °C (Nijman i wsp., BMJ 2012),
 *  - temperatura HR: +10 uderzeń/min na 1 °C względem 37 °C (Daymont i wsp. 2015),
 *  - sen RR (od etapu 2): ocena bezpośrednio względem referencji snu Herbert 2020
 *    zamiast dawnego odejmowania poprawki od tabel Fleminga; źródło szpitalne (Bonafide)
 *    nie rozróżnia snu i czuwania, więc tryb snu nie modyfikuje norm szpitalnych.
 *
 * Metoda (etap 1 naprawy — zamiast dawnego trójpunktowego odwzorowania odcinkowego):
 *  1. Wartości referencyjne pasma są interpolowane liniowo między ŚRODKAMI pasm wiekowych,
 *     dzięki czemu wynik zmienia się w sposób ciągły z wiekiem (bez skoku na granicy pasma).
 *     Poniżej środka pierwszego i powyżej środka ostatniego pasma wartości są stałe (clamp).
 *  2. Centyl jest liczony ze WSZYSTKICH punktów centylowych pasma: każdemu znanemu centylowi
 *     odpowiada wartość Z rozkładu normalnego; między sąsiednimi punktami wartość pomiaru
 *     jest przeliczana na Z interpolacją liniową, poza skrajnymi punktami — ekstrapolacją
 *     nachyleniem skrajnego odcinka. Centyl = Phi(Z) × 100 (aproksymacja Zelena–Severo).
 *     To ten sam wzorzec, którego używa circumference_module.js.
 *
 * Publiczne API (window.vitalSigns / module.exports) — sygnatury zgodne z wersją 1:
 *   getHrValues(ageYears, {population, temperature, hrOffset})  -> {p10, median, p90}
 *   getRrValues(ageYears, {population, temperature, state, rrOffset}) -> {p10, median, p90}
 *   getHrPercentile(ageYears, value, opts) -> liczba (0–100) lub NaN
 *   getRrPercentile(ageYears, value, opts) -> liczba (0–100) lub NaN
 *   getHrAssessment / getRrAssessment -> {percentile, z, p10, median, p90} (nowe, dla trybu PRO)
 */
(function () {
  'use strict';

  // Wartości Z standardowego rozkładu normalnego dla centyli występujących w tabelach.
  var Z_FOR_PERCENTILE = {
    1: -2.326348,
    10: -1.281552,
    25: -0.67449,
    50: 0,
    75: 0.67449,
    90: 1.281552,
    99: 2.326348
  };

  // ---------------------------------------------------------------------------
  // Dane: Fleming 2011 (dzieci zdrowe). Pasma wieku w miesiącach [min, max).
  // ---------------------------------------------------------------------------
  var FLEMING_RR = [
    { range: '0–3 m', minMonths: 0, maxMonths: 3, values: { 1: 25, 10: 34, 25: 40, 50: 43, 75: 52, 90: 57, 99: 66 } },
    { range: '3–6 m', minMonths: 3, maxMonths: 6, values: { 1: 24, 10: 33, 25: 38, 50: 41, 75: 49, 90: 55, 99: 64 } },
    { range: '6–9 m', minMonths: 6, maxMonths: 9, values: { 1: 23, 10: 31, 25: 36, 50: 39, 75: 47, 90: 52, 99: 61 } },
    { range: '9–12 m', minMonths: 9, maxMonths: 12, values: { 1: 22, 10: 30, 25: 35, 50: 37, 75: 45, 90: 50, 99: 58 } },
    { range: '12–18 m', minMonths: 12, maxMonths: 18, values: { 1: 21, 10: 28, 25: 32, 50: 35, 75: 42, 90: 46, 99: 53 } },
    { range: '18–24 m', minMonths: 18, maxMonths: 24, values: { 1: 19, 10: 25, 25: 29, 50: 31, 75: 36, 90: 40, 99: 46 } },
    { range: '2–3 y', minMonths: 24, maxMonths: 36, values: { 1: 18, 10: 22, 25: 25, 50: 28, 75: 31, 90: 34, 99: 38 } },
    { range: '3–4 y', minMonths: 36, maxMonths: 48, values: { 1: 17, 10: 21, 25: 23, 50: 25, 75: 27, 90: 29, 99: 33 } },
    { range: '4–6 y', minMonths: 48, maxMonths: 72, values: { 1: 17, 10: 20, 25: 21, 50: 23, 75: 25, 90: 27, 99: 29 } },
    { range: '6–8 y', minMonths: 72, maxMonths: 96, values: { 1: 16, 10: 18, 25: 20, 50: 21, 75: 23, 90: 24, 99: 27 } },
    { range: '8–12 y', minMonths: 96, maxMonths: 144, values: { 1: 14, 10: 16, 25: 18, 50: 19, 75: 21, 90: 22, 99: 25 } },
    { range: '12–15 y', minMonths: 144, maxMonths: 180, values: { 1: 12, 10: 15, 25: 16, 50: 18, 75: 19, 90: 21, 99: 23 } },
    { range: '15–18 y', minMonths: 180, maxMonths: 216, values: { 1: 11, 10: 13, 25: 15, 50: 16, 75: 18, 90: 19, 99: 22 } }
  ];

  var FLEMING_HR = [
    { range: 'Birth', minMonths: 0, maxMonths: 0, values: { 1: 90, 10: 107, 25: 116, 50: 127, 75: 138, 90: 148, 99: 164 } },
    { range: '0–3 m', minMonths: 0, maxMonths: 3, values: { 1: 107, 10: 123, 25: 133, 50: 143, 75: 154, 90: 164, 99: 181 } },
    { range: '3–6 m', minMonths: 3, maxMonths: 6, values: { 1: 104, 10: 120, 25: 129, 50: 140, 75: 150, 90: 159, 99: 175 } },
    { range: '6–9 m', minMonths: 6, maxMonths: 9, values: { 1: 98, 10: 114, 25: 123, 50: 134, 75: 143, 90: 152, 99: 168 } },
    { range: '9–12 m', minMonths: 9, maxMonths: 12, values: { 1: 93, 10: 109, 25: 118, 50: 128, 75: 137, 90: 145, 99: 161 } },
    { range: '12–18 m', minMonths: 12, maxMonths: 18, values: { 1: 88, 10: 103, 25: 112, 50: 123, 75: 132, 90: 140, 99: 156 } },
    { range: '18–24 m', minMonths: 18, maxMonths: 24, values: { 1: 82, 10: 98, 25: 106, 50: 116, 75: 126, 90: 135, 99: 149 } },
    { range: '2–3 y', minMonths: 24, maxMonths: 36, values: { 1: 76, 10: 92, 25: 100, 50: 110, 75: 119, 90: 128, 99: 142 } },
    { range: '3–4 y', minMonths: 36, maxMonths: 48, values: { 1: 70, 10: 86, 25: 94, 50: 104, 75: 113, 90: 123, 99: 136 } },
    { range: '4–6 y', minMonths: 48, maxMonths: 72, values: { 1: 65, 10: 81, 25: 89, 50: 98, 75: 108, 90: 117, 99: 131 } },
    { range: '6–8 y', minMonths: 72, maxMonths: 96, values: { 1: 59, 10: 74, 25: 82, 50: 91, 75: 101, 90: 111, 99: 123 } },
    { range: '8–12 y', minMonths: 96, maxMonths: 144, values: { 1: 52, 10: 67, 25: 75, 50: 84, 75: 93, 90: 103, 99: 115 } },
    { range: '12–15 y', minMonths: 144, maxMonths: 180, values: { 1: 47, 10: 62, 25: 69, 50: 78, 75: 87, 90: 96, 99: 108 } },
    { range: '15–18 y', minMonths: 180, maxMonths: 216, values: { 1: 43, 10: 58, 25: 65, 50: 73, 75: 83, 90: 92, 99: 104 } }
  ];

  // ---------------------------------------------------------------------------
  // Dane: Bonafide 2013 (dzieci hospitalizowane). Pasma wieku w latach [min, max).
  // ---------------------------------------------------------------------------
  var BONAFIDE = [
    { minYears: 0, maxYears: 0.25, hr: { 10: 119, 50: 140, 90: 164 }, rr: { 10: 30, 50: 41, 90: 56 } },
    { minYears: 0.25, maxYears: 0.5, hr: { 10: 114, 50: 135, 90: 159 }, rr: { 10: 28, 50: 38, 90: 52 } },
    { minYears: 0.5, maxYears: 0.75, hr: { 10: 110, 50: 131, 90: 156 }, rr: { 10: 26, 50: 35, 90: 49 } },
    { minYears: 0.75, maxYears: 1, hr: { 10: 107, 50: 128, 90: 153 }, rr: { 10: 24, 50: 33, 90: 46 } },
    { minYears: 1, maxYears: 1.5, hr: { 10: 103, 50: 124, 90: 149 }, rr: { 10: 23, 50: 31, 90: 43 } },
    { minYears: 1.5, maxYears: 2, hr: { 10: 98, 50: 120, 90: 146 }, rr: { 10: 21, 50: 29, 90: 40 } },
    { minYears: 2, maxYears: 3, hr: { 10: 93, 50: 115, 90: 142 }, rr: { 10: 20, 50: 27, 90: 37 } },
    { minYears: 3, maxYears: 4, hr: { 10: 88, 50: 111, 90: 138 }, rr: { 10: 19, 50: 25, 90: 35 } },
    { minYears: 4, maxYears: 6, hr: { 10: 83, 50: 106, 90: 134 }, rr: { 10: 18, 50: 24, 90: 33 } },
    { minYears: 6, maxYears: 8, hr: { 10: 77, 50: 100, 90: 128 }, rr: { 10: 17, 50: 23, 90: 31 } },
    { minYears: 8, maxYears: 12, hr: { 10: 72, 50: 94, 90: 120 }, rr: { 10: 16, 50: 21, 90: 28 } },
    { minYears: 12, maxYears: 15, hr: { 10: 66, 50: 87, 90: 112 }, rr: { 10: 15, 50: 19, 90: 25 } },
    { minYears: 15, maxYears: 18, hr: { 10: 62, 50: 82, 90: 107 }, rr: { 10: 14, 50: 18, 90: 23 } }
  ];

  // ---------------------------------------------------------------------------
  // Dane: Herbert 2020, Tabela 4 (dzieci zdrowe, sen spokojny; metoda 2 × 30 s).
  // Pasma wieku w miesiącach [min, max); 1 tydzień = 7/30,4375 ≈ 0,23 miesiąca.
  // ---------------------------------------------------------------------------
  var HERBERT_SLEEP_RR = [
    { range: '0–1 tydz.', minMonths: 0, maxMonths: 0.23, mean: 41.4, sd: 4.1, median: 41.0 },
    { range: '1 tydz.–1 mies.', minMonths: 0.23, maxMonths: 1, mean: 41.5, sd: 5.4, median: 40.5 },
    { range: '1–6 mies.', minMonths: 1, maxMonths: 6, mean: 35.4, sd: 7.2, median: 34.0 },
    { range: '6 mies.–1 rok', minMonths: 6, maxMonths: 12, mean: 24.1, sd: 2.8, median: 23.5 },
    { range: '1–2 lata', minMonths: 12, maxMonths: 24, mean: 22.1, sd: 3.5, median: 21.0 },
    { range: '2–3 lata', minMonths: 24, maxMonths: 36, mean: 19.5, sd: 2.7, median: 19.0 },
    { range: '3–4,5 roku', minMonths: 36, maxMonths: 54, mean: 19.3, sd: 2.7, median: 18.5 }
  ];
  var HERBERT_SLEEP_MAX_MONTHS = 54;

  // Współczynniki korekt (patrz nagłówek pliku).
  var HR_TEMP_COEF = 10; // ud./min na 1 °C
  var RR_TEMP_COEF = 2.2; // odd./min na 1 °C

  // Aproksymacja Zelena–Severo dystrybuanty standardowego rozkładu normalnego —
  // ta sama, której używają pozostałe moduły centylowe aplikacji.
  function normalCdf(z) {
    if (!isFinite(z)) return NaN;
    var b1 = 0.31938153;
    var b2 = -0.356563782;
    var b3 = 1.781477937;
    var b4 = -1.821255978;
    var b5 = 1.330274429;
    var t = 1 / (1 + 0.2316419 * Math.abs(z));
    var poly = ((((b5 * t + b4) * t + b3) * t + b2) * t + b1) * t;
    var p = 1 - Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI) * poly;
    return z >= 0 ? p : 1 - p;
  }

  // Pojedyncza tabela do interpolacji: [{ midMonths, values }] posortowane po wieku.
  function buildCurve(bands, pickValues) {
    var curve = [];
    for (var i = 0; i < bands.length; i++) {
      var b = bands[i];
      var min = typeof b.minMonths === 'number' ? b.minMonths : b.minYears * 12;
      var max = typeof b.maxMonths === 'number' ? b.maxMonths : b.maxYears * 12;
      curve.push({ midMonths: (min + max) / 2, values: pickValues(b) });
    }
    return curve;
  }

  var CURVES = {
    healthyHr: buildCurve(FLEMING_HR, function (b) { return b.values; }),
    healthyRr: buildCurve(FLEMING_RR, function (b) { return b.values; }),
    hospitalHr: buildCurve(BONAFIDE, function (b) { return b.hr; }),
    hospitalRr: buildCurve(BONAFIDE, function (b) { return b.rr; }),
    sleepRr: buildCurve(HERBERT_SLEEP_RR, function (b) { return { mean: b.mean, sd: b.sd }; })
  };

  // Wartości centylowe dla danego wieku: interpolacja liniowa między środkami pasm,
  // stałe poniżej pierwszego i powyżej ostatniego środka pasma.
  function valuesForAge(curve, ageYears) {
    var months = (Number.isFinite(ageYears) ? Math.max(0, ageYears) : 0) * 12;
    var first = curve[0];
    var last = curve[curve.length - 1];
    if (months <= first.midMonths) return copyValues(first.values);
    if (months >= last.midMonths) return copyValues(last.values);
    for (var i = 0; i < curve.length - 1; i++) {
      var a = curve[i];
      var b = curve[i + 1];
      if (months >= a.midMonths && months <= b.midMonths) {
        var f = (months - a.midMonths) / (b.midMonths - a.midMonths);
        var out = {};
        for (var key in a.values) {
          if (Object.prototype.hasOwnProperty.call(a.values, key)) {
            out[key] = a.values[key] + (b.values[key] - a.values[key]) * f;
          }
        }
        return out;
      }
    }
    return copyValues(last.values);
  }

  function copyValues(values) {
    var out = {};
    for (var key in values) {
      if (Object.prototype.hasOwnProperty.call(values, key)) out[key] = values[key];
    }
    return out;
  }

  // Z-score pomiaru względem pełnego zestawu punktów centylowych pasma:
  // interpolacja liniowa wartość->Z między sąsiednimi punktami, poza skrajnymi
  // punktami ekstrapolacja nachyleniem skrajnego odcinka.
  function zFromValues(values, x) {
    if (!Number.isFinite(x)) return NaN;
    var pts = [];
    var keys = Object.keys(values)
      .map(Number)
      .filter(function (k) { return Object.prototype.hasOwnProperty.call(Z_FOR_PERCENTILE, k); })
      .sort(function (a, b) { return a - b; });
    for (var i = 0; i < keys.length; i++) {
      var v = values[keys[i]];
      if (!Number.isFinite(v)) return NaN;
      var z = Z_FOR_PERCENTILE[keys[i]];
      // Korekta snu potrafi przyciąć kilka dolnych wartości do tej samej liczby (clamp 0);
      // dla zduplikowanej wartości zachowujemy wyższy Z, aby ciąg pozostał ściśle rosnący.
      if (pts.length > 0 && v <= pts[pts.length - 1].v) {
        if (v === pts[pts.length - 1].v) pts[pts.length - 1].z = z;
        continue;
      }
      pts.push({ v: v, z: z });
    }
    if (pts.length < 2) return NaN;

    var lo = pts[0];
    var hi = pts[pts.length - 1];
    if (x <= lo.v) {
      var slopeLo = (pts[1].z - pts[0].z) / (pts[1].v - pts[0].v);
      return lo.z + (x - lo.v) * slopeLo;
    }
    if (x >= hi.v) {
      var slopeHi = (pts[pts.length - 1].z - pts[pts.length - 2].z) / (pts[pts.length - 1].v - pts[pts.length - 2].v);
      return hi.z + (x - hi.v) * slopeHi;
    }
    for (var j = 0; j < pts.length - 1; j++) {
      var a = pts[j];
      var b = pts[j + 1];
      if (x >= a.v && x <= b.v) {
        return a.z + (x - a.v) * (b.z - a.z) / (b.v - a.v);
      }
    }
    return NaN;
  }

  function isSleepState(state) {
    var s = String(state || 'awake').toLowerCase();
    return s === 'sleep' || s === 'asleep' || s === 'sleeping';
  }

  function shiftValues(values, delta) {
    if (!delta) return values;
    for (var key in values) {
      if (Object.prototype.hasOwnProperty.call(values, key)) values[key] += delta;
    }
    return values;
  }

  // Pełny (skorygowany) zestaw wartości centylowych dla wieku i opcji.
  function correctedHrValues(ageYears, opts) {
    var o = opts || {};
    var population = String(o.population || 'healthy').toLowerCase();
    var curve = population === 'hospital' ? CURVES.hospitalHr : CURVES.healthyHr;
    var values = valuesForAge(curve, ageYears);
    if (typeof o.hrOffset === 'number' && o.hrOffset !== 0) shiftValues(values, o.hrOffset);
    if (o.temperature != null && Number.isFinite(o.temperature)) {
      shiftValues(values, HR_TEMP_COEF * (o.temperature - 37));
    }
    return values;
  }

  // Referencja RR dla wieku i opcji. Trzy warianty:
  //  - kind 'points'  — pełny zestaw punktów centylowych (Fleming lub Bonafide),
  //  - kind 'meansd'  — średnia ±SD snu spokojnego (Herbert 2020, sen + źródło zdrowe),
  //  - kind 'none'    — sen poza pokryciem wiekowym norm Herberta (flaga zamiast ekstrapolacji).
  // Źródło szpitalne (Bonafide) nie rozróżnia snu i czuwania — tryb snu go nie modyfikuje
  // (flaga sleepIgnoredForHospital dla warstwy prezentacji).
  function rrReference(ageYears, opts) {
    var o = opts || {};
    var population = String(o.population || 'healthy').toLowerCase();
    var asleep = isSleepState(o.state);
    var offset = typeof o.rrOffset === 'number' && o.rrOffset !== 0 ? o.rrOffset : 0;
    var tempShift = o.temperature != null && Number.isFinite(o.temperature)
      ? RR_TEMP_COEF * (o.temperature - 37)
      : 0;

    if (asleep && population !== 'hospital') {
      var months = (Number.isFinite(ageYears) ? Math.max(0, ageYears) : 0) * 12;
      if (months > HERBERT_SLEEP_MAX_MONTHS) {
        return { kind: 'none', source: 'herbert-sleep', sleepBeyondCoverage: true };
      }
      var ref = valuesForAge(CURVES.sleepRr, ageYears);
      return {
        kind: 'meansd',
        source: 'herbert-sleep',
        mean: ref.mean + offset + tempShift,
        sd: ref.sd
      };
    }

    var curve = population === 'hospital' ? CURVES.hospitalRr : CURVES.healthyRr;
    var values = valuesForAge(curve, ageYears);
    if (offset) shiftValues(values, offset);
    if (tempShift) shiftValues(values, tempShift);
    var out = {
      kind: 'points',
      source: population === 'hospital' ? 'bonafide' : 'fleming',
      values: values
    };
    if (asleep && population === 'hospital') out.sleepIgnoredForHospital = true;
    return out;
  }

  function summary(values) {
    return { p10: values[10], median: values[50], p90: values[90] };
  }

  // ------------------------------- Publiczne API -------------------------------

  function getHrValues(ageYears, opts) {
    return summary(correctedHrValues(ageYears, opts));
  }

  function getRrValues(ageYears, opts) {
    var ref = rrReference(ageYears, opts);
    if (ref.kind === 'points') return summary(ref.values);
    if (ref.kind === 'meansd') {
      return {
        p10: ref.mean + Z_FOR_PERCENTILE[10] * ref.sd,
        median: ref.mean,
        p90: ref.mean + Z_FOR_PERCENTILE[90] * ref.sd
      };
    }
    return { p10: NaN, median: NaN, p90: NaN };
  }

  function getHrAssessment(ageYears, value, opts) {
    var values = correctedHrValues(ageYears, opts);
    var z = zFromValues(values, Number(value));
    var s = summary(values);
    return { percentile: Number.isFinite(z) ? normalCdf(z) * 100 : NaN, z: z, p10: s.p10, median: s.median, p90: s.p90 };
  }

  function getRrAssessment(ageYears, value, opts) {
    var ref = rrReference(ageYears, opts);
    var x = Number(value);
    var out = {
      percentile: NaN,
      z: NaN,
      p10: NaN,
      median: NaN,
      p90: NaN,
      source: ref.source
    };
    if (ref.sleepBeyondCoverage) out.sleepBeyondCoverage = true;
    if (ref.sleepIgnoredForHospital) out.sleepIgnoredForHospital = true;
    if (ref.kind === 'points') {
      var z = zFromValues(ref.values, x);
      var s = summary(ref.values);
      out.z = z;
      out.percentile = Number.isFinite(z) ? normalCdf(z) * 100 : NaN;
      out.p10 = s.p10;
      out.median = s.median;
      out.p90 = s.p90;
    } else if (ref.kind === 'meansd' && ref.sd > 0) {
      var zs = Number.isFinite(x) ? (x - ref.mean) / ref.sd : NaN;
      out.z = zs;
      out.percentile = Number.isFinite(zs) ? normalCdf(zs) * 100 : NaN;
      out.p10 = ref.mean + Z_FOR_PERCENTILE[10] * ref.sd;
      out.median = ref.mean;
      out.p90 = ref.mean + Z_FOR_PERCENTILE[90] * ref.sd;
    }
    return out;
  }

  function getHrPercentile(ageYears, value, opts) {
    return getHrAssessment(ageYears, value, opts).percentile;
  }

  function getRrPercentile(ageYears, value, opts) {
    return getRrAssessment(ageYears, value, opts).percentile;
  }

  var api = {
    getHrValues: getHrValues,
    getRrValues: getRrValues,
    getHrPercentile: getHrPercentile,
    getRrPercentile: getRrPercentile,
    getHrAssessment: getHrAssessment,
    getRrAssessment: getRrAssessment,
    _getHealthyHrValues: function (ageYears) { return summary(valuesForAge(CURVES.healthyHr, ageYears)); },
    _getHealthyRrValues: function (ageYears) { return summary(valuesForAge(CURVES.healthyRr, ageYears)); },
    _getHospitalHrValues: function (ageYears) { return summary(valuesForAge(CURVES.hospitalHr, ageYears)); },
    _getHospitalRrValues: function (ageYears) { return summary(valuesForAge(CURVES.hospitalRr, ageYears)); },
    _rrReference: rrReference,
    _zFromValues: zFromValues,
    _normalCdf: normalCdf,
    _tables: { FLEMING_RR: FLEMING_RR, FLEMING_HR: FLEMING_HR, BONAFIDE: BONAFIDE, HERBERT_SLEEP_RR: HERBERT_SLEEP_RR }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.vitalSigns = api;
})();
