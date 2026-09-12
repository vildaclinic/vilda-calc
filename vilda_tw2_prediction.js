/* vilda_tw2_prediction.js — silnik prognozy wzrostu ostatecznego TW Mark II (Tanner 1983) dla
 * dziewcząt i chłopców oraz pseudometoda „wzrost przy menarche / 0,955" (Singleton 1975, korekta Cho 2026).
 *
 * ŹRÓDŁA (współczynniki w tw2_data.js):
 *   Tanner JM i wsp. Arch Dis Child 1983;58:767–776, DOI 10.1136/adc.58.10.767 — równania „1"
 *   (3 zmienne) dla dziewcząt: 3.1a przed menarche, 3.1b po menarche (wiek menarche nieznany),
 *   3.1c po menarche (wiek menarche znany); dla chłopców: 2.1 (6,0–18,5 l; bez przyrostu wzrostu —
 *   tab. 2.2 z przyrostem nie jest używana), powyżej 18,5 l ostatni wiersz (s. 775).
 *   Singleton A i wsp. Arch Fr Pediatr 1975;32:859–869 (PMID 175755): odsetek wzrostu ostatecznego
 *   osiągnięty przy menarche 95,5 ± 1,2 %, przyrost po menarche 7,3 ± 2 cm, większy przy niższym
 *   wieku kostnym przy menarche.
 *   Cho JH, Shim KS. Medicine 2026;105:e47998, DOI 10.1097/MD.0000000000047998: przyrost po
 *   menarche 6,6 ± 3,9 cm (bez GnRHa), ujemnie zależny od wieku kostnego przed menarche
 *   (β = −3,13 cm na rok, SE 0,48; wielowymiarowo).
 *
 * KONTRAKT (jak calculateRWTPrediction / calculateKhamisRochePrediction):
 *   calculateTW2Prediction({ sex:'F'|'M', chronologicalAgeYears, chronologicalAgeMonths, currentHeightCm,
 *     boneAgeYears, boneAgeSource:'GP'|'TW2RUS', postmenarcheal:true|false|null, menarcheAgeYears })
 *   → { available:true, method:'tw2', table:'3.1a'|'3.1b'|'3.1c'|'2.1', rowAge, predictedAdultHeightCm,
 *       predictedAdultHeightCmRaw, clampedToCurrentHeight, errorBoundHalfWidthCm (= 1,645·SD),
 *       residualSdCm, r, extrapolatedBelowTable, extrapolatedAboveTable, variants:{exactCa, clampedCa}|null,
 *       boneAgeSource, boneAgeProxyNote, menarcheStatusUnknown, notes[] }
 *     lub { available:false, reason:'missing-sex'|'missing-chronological-age'|'missing-input'|
 *           'missing-bone-age'|'missing-dataset'|'out-of-range'|'menarche-status-unknown' }
 *   • Chłopcy: jedna tablica (2.1), status menarche nieistotny; poniżej 6,0 l poza zakresem; powyżej
 *     18,5 l ostatni wiersz z flagą extrapolatedAboveTable (do 20 l).
 *   • Wiek: chronologicalAgeMonths (łączne miesiące) ma pierwszeństwo; lata to fallback.
 *   • Wiersz = najbliższy półroczny punkt wieku; w równaniu wiek DOKŁADNY (praca, s. 768).
 *   • Wiek kostny GP jest tylko PRZYBLIŻENIEM RUS — flaga boneAgeSource + nota; 3.1c ma mały
 *     współczynnik RUS, więc zamiana kosztuje ≤ 0,9 cm; 3.1b do ok. 2 cm na rok różnicy.
 *   • Po menarche przed 11,5 r.ż. (przedwczesne dojrzewanie): wiersz 11,5 (praca, s. 775), liczony
 *     w dwóch wariantach — wiek dokładny i wiek (oraz wiek menarche) obcięty do 11,5; wynik = środek,
 *     przedział = pół rozstępu wariantów + 1,645·SD; flaga extrapolatedBelowTable.
 *   • Clamp do obecnego wzrostu jak w RWT/KR (GROWTH-PRED-CLAMP): raw w predictedAdultHeightCmRaw.
 *
 *   calculateMenarcheFractionPrediction({ heightAtMenarcheCm, boneAgeAtMenarcheYears, menarcheAgeYears,
 *     currentHeightCm })
 *   → { available:true, method:'menarche-fraction', predictedAdultHeightCm, predictedAdultHeightCmRaw,
 *       clampedToCurrentHeight, errorBoundHalfWidthCm, baseCm, boneAgeAdjustmentCm, sigmaCm, notes[] }
 *     lub { available:false, reason:'missing-height-at-menarche' }
 *   • baza = wzrost przy menarche / 0,955; SD bazy = wzrost · 0,012 / 0,955² (≈ 1,3 % wzrostu);
 *   • korekta wieku kostnego przy menarche: +3,1 cm na każdy rok poniżej 13 lat (Cho 2026),
 *     obcięta do [−3, +6] cm; niepewność korekty 0,5 cm na rok (SE β); 1,645·σ jako ± (90 %).
 *   PARAMETRY KLINICZNE — do strojenia przez właściciela.
 */
(function (w) {
  'use strict';

  var MENARCHE_FRACTION = 0.955;           // Singleton 1975
  var MENARCHE_FRACTION_SD = 0.012;        // Singleton 1975 (±1,2 %)
  var MENARCHE_BA_REF_YEARS = 13;          // typowy wiek kostny przy menarche (Marshall 1974; Onat 1995: 13,0 ± 0,7)
  var MENARCHE_BA_SLOPE_CM_PER_YEAR = 3.1; // Cho 2026 (β = −3,13 na rok wieku kostnego)
  var MENARCHE_BA_SLOPE_SE = 0.5;          // Cho 2026 (SE 0,48)
  var MENARCHE_BA_ADJ_MIN = -3, MENARCHE_BA_ADJ_MAX = 6;
  var CI90 = 1.645;

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
    return isFinite(n) ? n : null;
  }
  function sexKey(sex) {
    var s = String(sex || '').trim().toUpperCase();
    return (s === 'F' || s === 'K') ? 'F' : (s === 'M' ? 'M' : null);
  }
  function ageYearsFrom(input) {
    var m = num(input && input.chronologicalAgeMonths);
    if (m !== null && m > 0) return m / 12;
    var y = num(input && input.chronologicalAgeYears);
    return y !== null && y > 0 ? y : null;
  }
  function data() {
    var d = w.tw2PredictionData;
    return d && d.girls ? d : null;
  }
  function nearestRow(table, age) {
    var rowAge = Math.round(age * 2) / 2;
    var below = false, above = false;
    if (rowAge < table.minRowAge) { rowAge = table.minRowAge; below = true; }
    if (rowAge > table.maxRowAge) { rowAge = table.maxRowAge; above = true; }
    var row = null;
    for (var i = 0; i < table.rows.length; i++) if (Math.abs(table.rows[i].rowAge - rowAge) < 1e-9) row = table.rows[i];
    return { row: row, rowAge: rowAge, below: below, above: above };
  }
  function evalRow(row, h, ca, rus, men) {
    return row.h * h + row.ca * ca + row.rus * rus + (row.men || 0) * (men || 0) + row.konst;
  }
  function round1(v) { return Math.round(v * 10) / 10; }

  function calculateTW2Prediction(input) {
    input = input || {};
    var d = data();
    if (!d) return { available: false, reason: 'missing-dataset', message: 'Brak danych TW Mark II (tw2_data.js).' };
    var sk = sexKey(input.sex);
    if (!sk) return { available: false, reason: 'missing-sex' };
    var age = ageYearsFrom(input);
    if (age === null) return { available: false, reason: 'missing-chronological-age' };
    var h = num(input.currentHeightCm);
    if (h === null || h <= 0) return { available: false, reason: 'missing-input' };
    var ba = num(input.boneAgeYears);
    if (ba === null || ba <= 0 || ba > 20) return { available: false, reason: 'missing-bone-age' };
    var src = String(input.boneAgeSource || 'GP').toUpperCase() === 'TW2RUS' ? 'TW2RUS' : 'GP';
    var notes = [];
    var table, tableKey;
    var post = false, menAge = null, statusUnknown = false;
    if (sk === 'M') {
      if (!d.boys || !d.boys.all) return { available: false, reason: 'missing-dataset', message: 'Brak tablicy TW Mark II dla chłopców (tw2_data.js).' };
      table = d.boys.all; tableKey = '2.1';
      if (age < table.minRowAge - 0.25) return { available: false, reason: 'out-of-range', message: 'TW Mark II: równania dla chłopców od 6. roku życia.' };
      if (age > 20) return { available: false, reason: 'out-of-range', message: 'TW Mark II: poza zakresem wieku równań.' };
      notes.push('równanie „1" (3 zmienne, tab. 2.1) bez przyrostu wzrostu w ostatnim roku — tablica 2.2 z przyrostem nie jest używana');
    } else {
      post = input.postmenarcheal === true;
      menAge = num(input.menarcheAgeYears);
      if (post && menAge !== null && menAge > age) post = false; // wiek menarche w przyszłości — sprzeczność, liczymy jak przed menarche
      statusUnknown = input.postmenarcheal !== true && input.postmenarcheal !== false;
      if (statusUnknown) return { available: false, reason: 'menarche-status-unknown', message: 'TW Mark II: podaj status menarche (wiek menarche w module dojrzewania); bez niego nie wiadomo, której tablicy użyć.' };
      if (post) {
        if (menAge !== null && menAge > 0) { table = d.girls.postmenarchealMenarcheKnown; tableKey = '3.1c'; }
        else { table = d.girls.postmenarchealMenarcheUnknown; tableKey = '3.1b'; }
      } else {
        table = d.girls.premenarcheal; tableKey = '3.1a';
        if (age < table.minRowAge - 0.25) return { available: false, reason: 'out-of-range', message: 'TW Mark II: równania dla dziewcząt od 5. roku życia.' };
      }
      if (age > 18.5) return { available: false, reason: 'out-of-range', message: 'TW Mark II: poza zakresem wieku równań.' };
    }
    var sel = nearestRow(table, age);
    if (!sel.row) return { available: false, reason: 'missing-dataset' };
    var row = sel.row;
    var raw, variants = null;
    if (post && sel.below) {
      // przedwczesne dojrzewanie: wiersz 11,5 w dwóch wariantach (praca, s. 775 — „nie jest pewne")
      var exact = evalRow(row, h, age, ba, menAge);
      var clampedAge = table.minRowAge;
      // wariant „obcięty": jak 11,5-latka, która właśnie miała menarche (wiek i wiek menarche = 11,5)
      var clampedMen = menAge !== null ? Math.max(menAge, clampedAge) : null;
      var clamped = evalRow(row, h, clampedAge, ba, clampedMen);
      raw = (exact + clamped) / 2;
      variants = { exactCa: round1(exact), clampedCa: round1(clamped) };
      notes.push('po menarche przed ' + String(table.minRowAge).replace('.', ',') + ' r.ż.: użyto wiersza ' + String(table.minRowAge).replace('.', ',') + ' (Tanner 1983, s. 775) w dwóch wariantach — wiek dokładny ' + String(variants.exactCa).replace('.', ',') + ' cm i wiek obcięty do ' + String(table.minRowAge).replace('.', ',') + ' lat ' + String(variants.clampedCa).replace('.', ',') + ' cm; wynik = środek, przedział rozszerzony; równania nie były testowane w przedwczesnym dojrzewaniu');
    } else {
      raw = evalRow(row, h, age, ba, menAge);
      if (sel.above) notes.push('wiek powyżej ostatniego wiersza tablicy ' + tableKey + ' — użyto wiersza ' + String(sel.rowAge).replace('.', ',') + ' (Tanner 1983, s. 775' + (sk === 'M' ? ': chłopcy z opóźnieniem wzrastania i niezrośniętymi nasadami' : '') + ')');
      if (!post && sel.below) notes.push('wiek poniżej pierwszego wiersza tablicy — użyto wiersza ' + String(sel.rowAge).replace('.', ','));
    }
    var sd = row.residualSdCm;
    var halfWidth = CI90 * sd;
    if (variants) halfWidth += Math.abs(variants.exactCa - variants.clampedCa) / 2;
    if (src === 'GP') notes.push('wiek kostny Greulicha–Pyle\'a przyjęto jako przybliżenie wieku kostnego TW2 RUS (współczynnik przy RUS w tej tablicy: ' + String(row.rus).replace('.', ',') + ' cm/rok)');
    var pred = raw;
    var clampedToH = false;
    if (pred < h) { pred = h; clampedToH = true; }
    return {
      available: true,
      method: 'tw2',
      sex: sk,
      table: tableKey,
      rowAge: sel.rowAge,
      ageYears: age,
      boneAgeYears: ba,
      boneAgeSource: src,
      boneAgeProxyNote: src === 'GP' ? 'GP jako przybliżenie TW2 RUS' : '',
      postmenarcheal: sk === 'F' ? post : null,
      menarcheAgeYears: post ? menAge : null,
      menarcheStatusUnknown: sk === 'F' ? statusUnknown : false,
      predictedAdultHeightCm: round1(pred),
      predictedAdultHeightCmRaw: round1(raw),
      clampedToCurrentHeight: clampedToH,
      residualSdCm: sd,
      r: row.r,
      errorBoundHalfWidthCm: round1(halfWidth),
      predictionIntervalLowerCm: round1(Math.max(raw - halfWidth, h)),
      predictionIntervalUpperCm: round1(Math.max(raw + halfWidth, pred)),
      extrapolatedBelowTable: !!(post && sel.below),
      extrapolatedAboveTable: !!sel.above,
      variants: variants,
      coefficients: { h: row.h, ca: row.ca, rus: row.rus, men: row.men || 0, konst: row.konst },
      notes: notes
    };
  }

  function calculateMenarcheFractionPrediction(input) {
    input = input || {};
    var hm = num(input.heightAtMenarcheCm);
    if (hm === null || hm <= 0) return { available: false, reason: 'missing-height-at-menarche' };
    var base = hm / MENARCHE_FRACTION;
    var sdBase = hm * MENARCHE_FRACTION_SD / (MENARCHE_FRACTION * MENARCHE_FRACTION);
    var baM = num(input.boneAgeAtMenarcheYears);
    var adj = 0, sdAdj = 0, notes = [];
    if (baM !== null && baM > 0) {
      var dy = MENARCHE_BA_REF_YEARS - baM;
      adj = Math.max(MENARCHE_BA_ADJ_MIN, Math.min(MENARCHE_BA_ADJ_MAX, MENARCHE_BA_SLOPE_CM_PER_YEAR * dy));
      sdAdj = MENARCHE_BA_SLOPE_SE * Math.abs(dy);
      if (Math.abs(adj) >= 0.05) notes.push('korekta na wiek kostny przy menarche ' + String(round1(baM)).replace('.', ',') + ' l wobec typowych 13 l: ' + (adj > 0 ? '+' : '−') + String(round1(Math.abs(adj))).replace('.', ',') + ' cm (Cho 2026: −3,1 cm na rok)');
    } else {
      notes.push('bez wieku kostnego przy menarche — bez korekty (typowo ok. 13 lat)');
    }
    var raw = base + adj;
    var sigma = Math.sqrt(sdBase * sdBase + sdAdj * sdAdj);
    var cur = num(input.currentHeightCm);
    var pred = raw, clamped = false;
    if (cur !== null && cur > 0 && pred < cur) { pred = cur; clamped = true; }
    return {
      available: true,
      method: 'menarche-fraction',
      heightAtMenarcheCm: hm,
      baseCm: round1(base),
      boneAgeAtMenarcheYears: baM,
      boneAgeAdjustmentCm: round1(adj),
      sigmaCm: round1(sigma * 10) / 10,
      predictedAdultHeightCm: round1(pred),
      predictedAdultHeightCmRaw: round1(raw),
      clampedToCurrentHeight: clamped,
      errorBoundHalfWidthCm: round1(CI90 * sigma),
      notes: notes
    };
  }

  w.calculateTW2Prediction = calculateTW2Prediction;
  w.calculateMenarcheFractionPrediction = calculateMenarcheFractionPrediction;
  w.VildaTW2Prediction = {
    VERSION: '2',
    calculateTW2Prediction: calculateTW2Prediction,
    calculateMenarcheFractionPrediction: calculateMenarcheFractionPrediction,
    MENARCHE_FRACTION: MENARCHE_FRACTION,
    MENARCHE_FRACTION_SD: MENARCHE_FRACTION_SD,
    MENARCHE_BA_REF_YEARS: MENARCHE_BA_REF_YEARS,
    MENARCHE_BA_SLOPE_CM_PER_YEAR: MENARCHE_BA_SLOPE_CM_PER_YEAR
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
