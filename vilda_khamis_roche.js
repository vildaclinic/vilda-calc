/* vilda_khamis_roche.js — silnik prognozy wzrostu ostatecznego metodą Khamisa-Roche’a (KR).
 *
 * ŹRÓDŁO WSPÓŁCZYNNIKÓW (medycznie krytyczne):
 *   Khamis HJ, Roche AF. „Predicting Adult Stature Without Using Skeletal Age: The Khamis-Roche
 *   Method.” Pediatrics 1994;94(4):504–507 — Z ERRATĄ: Pediatrics 1995;95(3):457.
 *   ⚠ Errata poprawia WYŁĄCZNIE kolumnę „masa” (jest 10× większa niż w druku 1994). Tu użyto
 *   wartości Z ERRATY. Kolumny β0 / wzrost / midparent są identyczne w 1994 i erracie.
 *   Zweryfikowane: przypadki kontrolne trafiają w oczekiwany wzrost śreniorodzicielski
 *   (chłopiec 10,0 l 138/32 rodzice 163/178 → 177,2 cm; dziewczynka 12,0 l 150/42 rodzice
 *   165/179 → 165,4 cm).
 *
 * METODA:
 *   wzrost_ostateczny[in] = β0 + β_wzrost·wzrost[in] + β_masa·masa[lb] + β_midparent·midparent[in]
 *   • Tablice w CALACH/FUNTACH — silnik konwertuje wejście cm/kg i wynik z powrotem na cm.
 *   • midparent = (wzrost matki + wzrost ojca) / 2  (średnia rodziców, ta sama dla obu płci).
 *   • Zakres 4,0–17,5 r.ż. Poza zakresem → reason:"out-of-range" (BEZ ekstrapolacji).
 *   • Wiek między wierszami (co pół roku): INTERPOLACJA LINIOWA współczynników — spójnie z RWT
 *     (rwtInterpolateAgeWeights: trafienie w wiersz → wiersz; między → interpolacja; poza → out-of-range).
 *
 * KONTRAKT (jak inne silniki: calculateRWTPrediction), wejście:
 *   { sex:'M'|'F', chronologicalAgeYears, chronologicalAgeMonths, currentHeightCm,
 *     currentWeightKg, motherHeightCm, fatherHeightCm }
 *   Wiek: chronologicalAgeMonths = ŁĄCZNE miesiące (ma pierwszeństwo); chronologicalAgeYears =
 *   fallback, gdy miesięcy brak. NIE sumuje się lat i miesięcy — to redundantne jednostki tego
 *   samego wieku (spójnie z BP/RWT). {ageMonths:120, ageYears:10} → 10 lat.
 * Wyjście: { available:true, predictedAdultHeightCm, method:'khamis-roche', ageYears, sex, midparentCm }
 *          lub { available:false, reason:'missing-sex'|'missing-chronological-age'|'missing-input'|'out-of-range' }
 *   (kształt zgodny z BP/RWT: available + predictedAdultHeightCm / available:false + reason)
 *
 * OGRANICZENIE OD DOŁU AKTUALNYM WZROSTEM (decyzja kliniczna właściciela 2026-08-13):
 *   Równanie KR to czysta regresja — przy górnej granicy wieku (chłopcy ~17–17,5 l) potrafi
 *   zwrócić wynik NIŻSZY niż już zmierzony wzrost (fizycznie niemożliwe; artefakt wewnątrz
 *   błędu metody ±2,1/±1,7 cala). Wtedy predictedAdultHeightCm = aktualny wzrost, a surowy
 *   wynik równania pozostaje w predictedAdultHeightCmRaw z flagą clampedToCurrentHeight:true.
 *   Górna granica przedziału błędu ZAWSZE liczy się od wartości SUROWEJ (raw + półszerokość) —
 *   clamp obcina przedział od dołu, nie przesuwa go w górę; gdy cały przedział leży poniżej
 *   aktualnego wzrostu, zapada się do pojedynczej wartości (odpowiedzialność konsumentów).
 *   predictedAdultHeightCmRaw i clampedToCurrentHeight zwracane są w każdym dostępnym wyniku.
 */
(function (w) {
  'use strict';

  var IN_PER_CM = 1 / 2.54; // cm → cale
  var LB_PER_KG = 1 / 0.45359237; // kg → funty
  var MIN_AGE = 4.0;
  var MAX_AGE = 17.5;

  // Współczynniki z ERRATY 1995. Wiersz: [wiek(lata), β0, β_wzrost(in), β_masa(lb), β_midparent(in)].
  var MALE_ROWS = [
    [4.0, -10.2567, 1.23812, -0.087235, 0.50286],
    [4.5, -10.7190, 1.15964, -0.074454, 0.52887],
    [5.0, -11.0213, 1.10674, -0.064778, 0.53919],
    [5.5, -11.1556, 1.07480, -0.057760, 0.53691],
    [6.0, -11.1138, 1.05923, -0.052947, 0.52513],
    [6.5, -11.0221, 1.05542, -0.049892, 0.50692],
    [7.0, -10.9984, 1.05877, -0.048144, 0.48538],
    [7.5, -11.0214, 1.06467, -0.047256, 0.46361],
    [8.0, -11.0696, 1.06853, -0.046778, 0.44469],
    [8.5, -11.1220, 1.06572, -0.046261, 0.43171],
    [9.0, -11.1571, 1.05166, -0.045254, 0.42776],
    [9.5, -11.1405, 1.02174, -0.043311, 0.43593],
    [10.0, -11.0380, 0.97135, -0.039981, 0.45932],
    [10.5, -10.8286, 0.89589, -0.034814, 0.50101],
    [11.0, -10.4917, 0.81239, -0.029050, 0.54781],
    [11.5, -10.0065, 0.74134, -0.024167, 0.58409],
    [12.0, -9.3522, 0.68325, -0.020076, 0.60927],
    [12.5, -8.6055, 0.63869, -0.016681, 0.62279],
    [13.0, -7.8632, 0.60818, -0.013895, 0.62407],
    [13.5, -7.1348, 0.59228, -0.011624, 0.61253],
    [14.0, -6.4299, 0.59151, -0.009776, 0.58762],
    [14.5, -5.7578, 0.60643, -0.008261, 0.54875],
    [15.0, -5.1282, 0.63757, -0.006988, 0.49536],
    [15.5, -4.5092, 0.68548, -0.005863, 0.42687],
    [16.0, -3.9292, 0.75069, -0.004795, 0.34271],
    [16.5, -3.4873, 0.83375, -0.003695, 0.24231],
    [17.0, -3.2830, 0.93520, -0.002470, 0.12510],
    [17.5, -3.4156, 1.05558, -0.001027, -0.00950],
  ];
  var FEMALE_ROWS = [
    [4.0, -8.13250, 1.24768, -0.19435, 0.44774],
    [4.5, -6.47656, 1.22177, -0.18519, 0.41381],
    [5.0, -5.13583, 1.19932, -0.17530, 0.38467],
    [5.5, -4.13791, 1.17880, -0.16484, 0.36039],
    [6.0, -3.51039, 1.15866, -0.15400, 0.34105],
    [6.5, -3.14322, 1.13737, -0.14294, 0.32672],
    [7.0, -2.87645, 1.11342, -0.13184, 0.31748],
    [7.5, -2.66291, 1.08525, -0.12086, 0.31340],
    [8.0, -2.45559, 1.05135, -0.11019, 0.31457],
    [8.5, -2.20728, 1.01018, -0.09999, 0.32105],
    [9.0, -1.87098, 0.96020, -0.09044, 0.33291],
    [9.5, -1.06330, 0.89989, -0.08171, 0.35025],
    [10.0, 0.33468, 0.82771, -0.07397, 0.37312],
    [10.5, 1.97366, 0.74213, -0.06739, 0.40161],
    [11.0, 3.50436, 0.67173, -0.06136, 0.42042],
    [11.5, 4.57747, 0.64150, -0.05518, 0.41686],
    [12.0, 4.84365, 0.64452, -0.04894, 0.39490],
    [12.5, 4.27869, 0.67386, -0.04272, 0.35850],
    [13.0, 3.21417, 0.72260, -0.03661, 0.31163],
    [13.5, 1.83456, 0.78383, -0.03067, 0.25826],
    [14.0, 0.32425, 0.85062, -0.02500, 0.20235],
    [14.5, -1.13224, 0.91605, -0.01967, 0.14787],
    [15.0, -2.35055, 0.97319, -0.01477, 0.09880],
    [15.5, -3.10326, 1.01514, -0.01037, 0.05909],
    [16.0, -3.17885, 1.03496, -0.00655, 0.03272],
    [16.5, -2.41657, 1.02573, -0.00340, 0.02364],
    [17.0, -0.65579, 0.98054, -0.00100, 0.03584],
    [17.5, 2.26429, 0.89246, 0.00057, 0.07327],
  ];

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // Normalizacja płci do 'M'/'F' (defensywnie; caller zwykle podaje już 'M'/'F').
  function normalizeSex(sex) {
    if (sex === 'M' || sex === 'F') return sex;
    if (typeof sex !== 'string') return null;
    var s = sex.trim().toLowerCase();
    if (!s) return null;
    if (s[0] === 'm' || s[0] === 'b' || s.indexOf('chł') === 0 || s.indexOf('chłopiec') !== -1) return 'M';
    if (s[0] === 'f' || s[0] === 'k' || s[0] === 'g' || s.indexOf('dziew') !== -1 || s.indexOf('żeń') !== -1) return 'F';
    return null;
  }

  // Wiek w latach (dziesiętnie). KONWENCJA KODU (BP/RWT w vilda_advanced_growth.js):
  //   chronologicalAgeMonths to ŁĄCZNE miesiące i ma PIERWSZEŃSTWO; chronologicalAgeYears jest
  //   fallbackiem użytym dopiero, gdy miesięcy brak. To redundantne jednostki TEGO SAMEGO wieku —
  //   NIE sumujemy lat i miesięcy. Moduł walidacji podaje {ageMonths:120, ageYears:10} = 10 lat
  //   (nie 20). Zaokrąglenie do pełnych miesięcy — spójnie z BP/RWT (Math.round(miesiące)).
  function resolveAgeYears(input) {
    var mo = num(input.chronologicalAgeMonths);
    if (mo === null) mo = num(input.ageMonths);
    if (mo === null) {
      var yr = num(input.chronologicalAgeYears);
      if (yr === null) yr = num(input.ageYears);
      if (yr === null) return null;
      mo = yr * 12;
    }
    return Math.round(mo) / 12;
  }

  // Interpolacja liniowa współczynników po wieku (mirror rwtInterpolateAgeWeights).
  function coefficientsForAge(rows, ageYears) {
    var first = rows[0];
    var last = rows[rows.length - 1];
    if (ageYears < first[0] || ageYears > last[0]) return null; // out-of-range, bez ekstrapolacji
    for (var i = 0; i < rows.length; i++) {
      if (rows[i][0] === ageYears) {
        return { beta0: rows[i][1], betaStature: rows[i][2], betaWeight: rows[i][3], betaMidparent: rows[i][4], interpolated: false };
      }
    }
    var lo = null, hi = null;
    for (var j = 0; j < rows.length - 1; j++) {
      if (ageYears > rows[j][0] && ageYears < rows[j + 1][0]) { lo = rows[j]; hi = rows[j + 1]; break; }
    }
    if (!lo || !hi) return null;
    var f = (ageYears - lo[0]) / (hi[0] - lo[0]);
    var mix = function (a, b) { return a + (b - a) * f; };
    return {
      beta0: mix(lo[1], hi[1]),
      betaStature: mix(lo[2], hi[2]),
      betaWeight: mix(lo[3], hi[3]),
      betaMidparent: mix(lo[4], hi[4]),
      interpolated: true,
    };
  }

  function calculateKhamisRochePrediction(input) {
    if (!input || typeof input !== 'object') return { available: false, reason: 'missing-input' };

    var sex = normalizeSex(input.sex);
    if (!sex) return { available: false, reason: 'missing-sex' };

    var ageYears = resolveAgeYears(input);
    if (ageYears === null) return { available: false, reason: 'missing-chronological-age' };

    var heightCm = num(input.currentHeightCm);
    var weightKg = num(input.currentWeightKg);
    var motherCm = num(input.motherHeightCm);
    var fatherCm = num(input.fatherHeightCm);
    if (heightCm === null || heightCm <= 0) return { available: false, reason: 'missing-input' };
    if (weightKg === null || weightKg <= 0) return { available: false, reason: 'missing-input' };
    if (motherCm === null || motherCm <= 0 || fatherCm === null || fatherCm <= 0) {
      return { available: false, reason: 'missing-input' };
    }

    if (ageYears < MIN_AGE || ageYears > MAX_AGE) return { available: false, reason: 'out-of-range' };

    var rows = sex === 'M' ? MALE_ROWS : FEMALE_ROWS;
    var c = coefficientsForAge(rows, ageYears);
    if (!c) return { available: false, reason: 'out-of-range' };

    var midparentCm = (motherCm + fatherCm) / 2;
    var heightIn = heightCm * IN_PER_CM;
    var weightLb = weightKg * LB_PER_KG;
    var midparentIn = midparentCm * IN_PER_CM;

    var predictedIn = c.beta0 + c.betaStature * heightIn + c.betaWeight * weightLb + c.betaMidparent * midparentIn;
    var predictedCm = predictedIn * 2.54;
    if (!Number.isFinite(predictedCm)) return { available: false, reason: 'missing-input' };

    // Wzrost ostateczny nie może być niższy niż już zmierzony (patrz nagłówek modułu).
    var clamped = predictedCm < heightCm;

    return {
      available: true,
      predictedAdultHeightCm: clamped ? heightCm : predictedCm,
      predictedAdultHeightCmRaw: predictedCm,
      clampedToCurrentHeight: clamped,
      method: 'khamis-roche',
      sex: sex,
      ageYears: ageYears,
      midparentCm: midparentCm,
      interpolated: c.interpolated,
    };
  }

  // Eksport globalny (jak inne silniki) + namespace do testów.
  try { w.calculateKhamisRochePrediction = calculateKhamisRochePrediction; } catch (_) { /* noop */ }
  w.VildaKhamisRoche = {
    version: '2',
    source: 'Khamis-Roche Pediatrics 1994;94:504-7 + erratum 1995;95:457',
    MIN_AGE: MIN_AGE,
    MAX_AGE: MAX_AGE,
    MALE_ROWS: MALE_ROWS,
    FEMALE_ROWS: FEMALE_ROWS,
    calculateKhamisRochePrediction: calculateKhamisRochePrediction,
    _coefficientsForAge: coefficientsForAge,
    _normalizeSex: normalizeSex,
    _resolveAgeYears: resolveAgeYears,
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
