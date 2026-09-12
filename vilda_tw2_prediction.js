/* vilda_tw2_prediction.js — silnik prognozy wzrostu ostatecznego TW Mark II (Tanner 1983) dla
 * dziewcząt i chłopców oraz pseudometoda „wzrost przy menarche / 0,955" (Singleton 1975, korekta Cho 2026).
 *
 * ŹRÓDŁA (współczynniki w tw2_data.js):
 *   Tanner JM i wsp. Arch Dis Child 1983;58:767–776, DOI 10.1136/adc.58.10.767 — równania „1"
 *   (3 zmienne) dla dziewcząt: 3.1a przed menarche, 3.1b po menarche (wiek menarche nieznany),
 *   3.1c po menarche (wiek menarche znany); równania „2"/„3" dla dziewcząt z przyrostami z ostatniego
 *   roku: 3.2a/3.2b (+ przyrost wzrostu), 3.3a/3.3b (+ przyrost wzrostu i wieku kostnego) — drzewo
 *   doboru wg ryciny s. 775 (GROWTH-PRED-TW2D); dla chłopców: 2.1 (6,0–18,5 l, 3 zmienne) oraz 2.2
 *   (11,0–18,0 l, 4 zmienne — z przyrostem wzrostu w ostatnim roku; równanie „2", s. 770: „u chłopców
 *   od 11,0 lat, gdy przyrost jest dostępny"), powyżej ostatniego wiersza — ostatni wiersz (s. 775).
 *   Singleton A i wsp. Arch Fr Pediatr 1975;32:859–869 (PMID 175755): odsetek wzrostu ostatecznego
 *   osiągnięty przy menarche 95,5 ± 1,2 %, przyrost po menarche 7,3 ± 2 cm, większy przy niższym
 *   wieku kostnym przy menarche.
 *   Cho JH, Shim KS. Medicine 2026;105:e47998, DOI 10.1097/MD.0000000000047998: przyrost po
 *   menarche 6,6 ± 3,9 cm (bez GnRHa), ujemnie zależny od wieku kostnego przed menarche
 *   (β = −3,13 cm na rok, SE 0,48; wielowymiarowo).
 *
 * KONTRAKT (jak calculateRWTPrediction / calculateKhamisRochePrediction):
 *   calculateTW2Prediction({ sex:'F'|'M', chronologicalAgeYears, chronologicalAgeMonths, currentHeightCm,
 *     boneAgeYears, boneAgeSource:'GP'|'TW2RUS', postmenarcheal:true|false|null, menarcheAgeYears,
 *     heightIncrementCmPerYear, heightIncrementIntervalYears, heightIncrementFromAgeMonths,
 *     boneAgeIncrementYearsPerYear })
 *   → { available:true, method:'tw2', table:'3.1a'|'3.1b'|'3.1c'|'3.2a'|'3.2b'|'3.3a'|'3.3b'|'2.1'|'2.2',
 *       rowAge, predictedAdultHeightCm,
 *       predictedAdultHeightCmRaw, clampedToCurrentHeight, errorBoundHalfWidthCm (= 1,645·SD),
 *       residualSdCm, r, extrapolatedBelowTable, extrapolatedAboveTable, variants:{exactCa, clampedCa}|null,
 *       boneAgeSource, boneAgeProxyNote, menarcheStatusUnknown, notes[] }
 *     lub { available:false, reason:'missing-sex'|'missing-chronological-age'|'missing-input'|
 *           'missing-bone-age'|'missing-dataset'|'out-of-range'|'menarche-status-unknown' }
 *   • Chłopcy: status menarche nieistotny; poniżej 6,0 l poza zakresem; powyżej ostatniego wiersza
 *     (18,5 l w 2.1, 18,0 l w 2.2) ostatni wiersz z flagą extrapolatedAboveTable (do 20 l).
 *   • Chłopcy od 11 lat (najbliższe półrocze ≥ 11,0) z heightIncrementCmPerYear: tab. 2.2 (4 zmienne);
 *     wynik niesie też withoutIncrementCm (tab. 2.1) do porównania i heightIncrement{CmPerYear,
 *     IntervalYears, FromAgeMonths}. Bez przyrostu albo przed 11 l: tab. 2.1.
 *
 *   • Dziewczęta z przyrostem wzrostu (heightIncrementCmPerYear) i ew. wieku kostnego
 *     (boneAgeIncrementYearsPerYear): przed menarche 8,0–12,5 → 3.2a (13,0–14,5 → 3.1a, równanie 2
 *     gorsze); z oboma przyrostami 10,0–14,5 → 3.3a (8,0–9,5 → 3.2a); po menarche → 3.2b, a z oboma
 *     przyrostami 11,5–13,5 → 3.3b (starsze → 3.2b). Wynik niesie withoutIncrementCm (równanie 1) do
 *     porównania; po menarche przed 11,5 r.ż. — dwa warianty jak w 3.1c (bez członu wieku menarche).
 *
 *   selectTW2HeightIncrement({ measurements:[{ageMonths, height, boneAgeYears?}], currentAgeMonths,
 *     currentHeightCm, currentBoneAgeYears?, sex? })
 *   → { available:true, incrementCmPerYear, intervalYears, intervalMonths, fromAgeMonths, fromHeightCm,
 *       deltaCm, boneAgeIncrementYearsPerYear|null, fromBoneAgeYears|null }
 *     lub { available:false, reason:'missing-input'|'no-measurement-in-window' }
 *   • Okno wg przypisów: chłopcy 0,83–1,12 roku (tab. 2.2, „±5 tygodni"), dziewczęta 0,88–1,12 roku
 *     (tab. 3.2/3.3, „±6 tygodni"); wybierany pomiar najbliższy dokładnie roku; przyrosty przeliczone
 *     na tempo roczne (Δ / odstęp w latach). Przyrost wieku kostnego tylko z TEGO SAMEGO pomiaru
 *     (RTG przy tamtej wizycie) i bieżącego wieku kostnego.
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
  function evalRow(row, h, ca, rus, men, dh, drus) {
    return row.h * h + row.ca * ca + row.rus * rus + (row.men || 0) * (men || 0) + (row.dh || 0) * (dh || 0) + (row.drus || 0) * (drus || 0) + row.konst;
  }
  var INCREMENT_WINDOW_YEARS = [0.83, 1.12];       // przypis tab. 2.2 (chłopcy, „±5 tygodni")
  var INCREMENT_WINDOW_YEARS_GIRLS = [0.88, 1.12]; // przypis tab. 3.2/3.3 (dziewczęta, „±6 tygodni")

  function selectTW2HeightIncrement(input) {
    input = input || {};
    var cur = num(input.currentAgeMonths);
    var h = num(input.currentHeightCm);
    var curBa = num(input.currentBoneAgeYears);
    var win = sexKey(input.sex) === 'F' ? INCREMENT_WINDOW_YEARS_GIRLS : INCREMENT_WINDOW_YEARS;
    var list = Array.isArray(input.measurements) ? input.measurements : [];
    if (cur === null || h === null || h <= 0) return { available: false, reason: 'missing-input' };
    var best = null, bestDist = Infinity;
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (!m) continue;
      var am = num(m.ageMonths), mh = num(m.height);
      if (am === null || mh === null || mh <= 0) continue;
      var dy = (cur - am) / 12;
      if (dy < win[0] - 1e-9 || dy > win[1] + 1e-9) continue;
      var dist = Math.abs(dy - 1);
      if (dist < bestDist) { bestDist = dist; best = { am: am, mh: mh, dy: dy, ba: num(m.boneAgeYears) }; }
    }
    if (!best) return { available: false, reason: 'no-measurement-in-window', windowYears: win.slice() };
    var delta = h - best.mh;
    var dba = (curBa !== null && curBa > 0 && best.ba !== null && best.ba > 0) ? Math.round((curBa - best.ba) / best.dy * 10) / 10 : null;
    return {
      available: true,
      incrementCmPerYear: Math.round(delta / best.dy * 10) / 10,
      deltaCm: round1(delta),
      intervalYears: Math.round(best.dy * 100) / 100,
      intervalMonths: Math.round(cur - best.am),
      fromAgeMonths: best.am,
      fromHeightCm: best.mh,
      fromBoneAgeYears: best.ba !== null && best.ba > 0 ? best.ba : null,
      boneAgeIncrementYearsPerYear: dba,
      windowYears: win.slice()
    };
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
    var dh = null, dhInterval = null, dhFrom = null, withoutIncrement = null, drus = null;
    if (sk === 'M') {
      if (!d.boys || !d.boys.all) return { available: false, reason: 'missing-dataset', message: 'Brak tablicy TW Mark II dla chłopców (tw2_data.js).' };
      table = d.boys.all; tableKey = '2.1';
      if (age < table.minRowAge - 0.25) return { available: false, reason: 'out-of-range', message: 'TW Mark II: równania dla chłopców od 6. roku życia.' };
      if (age > 20) return { available: false, reason: 'out-of-range', message: 'TW Mark II: poza zakresem wieku równań.' };
      var inc = num(input.heightIncrementCmPerYear);
      var t22 = d.boys.withIncrement;
      if (inc !== null && t22 && Math.round(age * 2) / 2 >= t22.minRowAge) {
        // równanie „2" (s. 770): chłopcy od 11,0 lat z dostępnym przyrostem wzrostu w ostatnim roku
        var sel21 = nearestRow(table, age);
        withoutIncrement = sel21.row ? round1(evalRow(sel21.row, h, age, ba, null, null)) : null;
        table = t22; tableKey = '2.2';
        dh = inc; dhInterval = num(input.heightIncrementIntervalYears); dhFrom = num(input.heightIncrementFromAgeMonths);
        notes.push('równanie „2" (4 zmienne, tab. 2.2): przyrost wzrostu ' + String(round1(inc)).replace('.', ',') + ' cm/rok' +
          (dhInterval !== null ? ' z ostatnich ' + String(Math.round(dhInterval * 12)) + ' mies. (przeliczony na rok)' : '') +
          (withoutIncrement !== null ? '; bez przyrostu (tab. 2.1) byłoby ' + String(withoutIncrement).replace('.', ',') + ' cm' : ''));
      } else {
        notes.push('równanie „1" (3 zmienne, tab. 2.1) bez przyrostu wzrostu w ostatnim roku' +
          (Math.round(age * 2) / 2 >= 11 ? ' — brak pomiaru sprzed 10–13 mies. w historii (tab. 2.2 wymaga przyrostu rocznego)' : ' (tab. 2.2 od 11. roku życia)'));
      }
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
      // GROWTH-PRED-TW2D — równania „2"/„3" z przyrostami z ostatniego roku (drzewo doboru, s. 775).
      var gInc = num(input.heightIncrementCmPerYear);
      var gDba = num(input.boneAgeIncrementYearsPerYear);
      var halfAge = Math.round(age * 2) / 2;
      if (gInc !== null) {
        var t2 = post ? d.girls.postmenarchealHeightIncrement : d.girls.premenarchealHeightIncrement;
        var t3 = post ? d.girls.postmenarchealBothIncrements : d.girls.premenarchealBothIncrements;
        var pick = null, pickKey = '', useDba = false;
        if (post) {
          // po menarche: oba przyrosty 11,5–13,5 → 3.3b; poza tym (także < 11,5 z ekstrapolacją) → 3.2b
          if (gDba !== null && t3 && halfAge >= t3.minRowAge && halfAge <= t3.maxRowAge) { pick = t3; pickKey = '3.3b'; useDba = true; }
          else if (t2) { pick = t2; pickKey = '3.2b'; }
        } else {
          // przed menarche: oba przyrosty 10,0–14,5 → 3.3a; sam przyrost wzrostu 8,0–12,5 → 3.2a (rycina:
          // w 8,0–9,5 z oboma przyrostami 3.1a — silnik bierze 3.2a, bo przyrost wzrostu jest dostępny);
          // 13,0–14,5 bez przyrostu RUS → 3.1a (równanie 2 gorsze od 1, s. 774)
          if (gDba !== null && t3 && halfAge >= t3.minRowAge && halfAge <= t3.maxRowAge) { pick = t3; pickKey = '3.3a'; useDba = true; }
          else if (t2 && halfAge >= t2.minRowAge && halfAge <= t2.maxRowAge) { pick = t2; pickKey = '3.2a'; }
        }
        if (pick) {
          var sel1 = nearestRow(table, age);
          withoutIncrement = sel1.row ? round1(post && sel1.below
            ? (evalRow(sel1.row, h, age, ba, menAge) + evalRow(sel1.row, h, table.minRowAge, ba, menAge !== null ? Math.max(menAge, table.minRowAge) : null)) / 2
            : evalRow(sel1.row, h, age, ba, menAge)) : null;
          var eq1Key = tableKey;
          table = pick; tableKey = pickKey;
          dh = gInc; dhInterval = num(input.heightIncrementIntervalYears); dhFrom = num(input.heightIncrementFromAgeMonths);
          if (useDba) drus = gDba;
          notes.push('równanie „' + (useDba ? '3' : '2') + '" (' + (useDba ? '5 zmiennych' : '4 zmienne') + ', tab. ' + pickKey + '): przyrost wzrostu ' + String(round1(gInc)).replace('.', ',') + ' cm/rok' +
            (useDba ? ' i wieku kostnego ' + String(round1(gDba)).replace('.', ',') + ' roku/rok' : '') +
            (dhInterval !== null ? ' z ostatnich ' + String(Math.round(dhInterval * 12)) + ' mies. (przeliczone na rok)' : '') +
            (withoutIncrement !== null ? '; bez przyrostu (tab. ' + eq1Key + ') byłoby ' + String(withoutIncrement).replace('.', ',') + ' cm' : ''));
          if (!useDba && gDba !== null) notes.push('przyrost wieku kostnego (' + String(round1(gDba)).replace('.', ',') + ' roku/rok) pominięty — tab. 3.3 obejmuje ' + (post ? '11,5–13,5' : '10,0–14,5') + ' l');
        } else {
          notes.push('równanie „1" (tab. ' + tableKey + ') mimo dostępnego przyrostu wzrostu — ' + (halfAge > 12.5 && !post ? 'w 13–14,5 l równanie 2 przewiduje gorzej niż 1 (Tanner 1983, s. 774)' : 'poza zakresem tablic z przyrostem'));
        }
      }
    }
    var sel = nearestRow(table, age);
    if (!sel.row) return { available: false, reason: 'missing-dataset' };
    var row = sel.row;
    var raw, variants = null;
    if (post && sel.below) {
      // przedwczesne dojrzewanie: wiersz 11,5 w dwóch wariantach (praca, s. 775 — „nie jest pewne")
      var exact = evalRow(row, h, age, ba, menAge, dh, drus);
      var clampedAge = table.minRowAge;
      // wariant „obcięty": jak 11,5-latka, która właśnie miała menarche (wiek i wiek menarche = 11,5)
      var clampedMen = menAge !== null ? Math.max(menAge, clampedAge) : null;
      var clamped = evalRow(row, h, clampedAge, ba, clampedMen, dh, drus);
      raw = (exact + clamped) / 2;
      variants = { exactCa: round1(exact), clampedCa: round1(clamped) };
      notes.push('po menarche przed ' + String(table.minRowAge).replace('.', ',') + ' r.ż.: użyto wiersza ' + String(table.minRowAge).replace('.', ',') + ' (Tanner 1983, s. 775) w dwóch wariantach — wiek dokładny ' + String(variants.exactCa).replace('.', ',') + ' cm i wiek obcięty do ' + String(table.minRowAge).replace('.', ',') + ' lat ' + String(variants.clampedCa).replace('.', ',') + ' cm; wynik = środek, przedział rozszerzony; równania nie były testowane w przedwczesnym dojrzewaniu');
    } else {
      raw = evalRow(row, h, age, ba, menAge, dh, drus);
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
      heightIncrementCmPerYear: dh,
      heightIncrementIntervalYears: dhInterval,
      heightIncrementFromAgeMonths: dhFrom,
      boneAgeIncrementYearsPerYear: drus,
      withoutIncrementCm: withoutIncrement,
      coefficients: { h: row.h, ca: row.ca, rus: row.rus, men: row.men || 0, dh: row.dh || 0, drus: row.drus || 0, konst: row.konst },
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
  w.selectTW2HeightIncrement = selectTW2HeightIncrement;
  w.VildaTW2Prediction = {
    VERSION: '4',
    calculateTW2Prediction: calculateTW2Prediction,
    calculateMenarcheFractionPrediction: calculateMenarcheFractionPrediction,
    selectTW2HeightIncrement: selectTW2HeightIncrement,
    INCREMENT_WINDOW_YEARS: INCREMENT_WINDOW_YEARS,
    INCREMENT_WINDOW_YEARS_GIRLS: INCREMENT_WINDOW_YEARS_GIRLS,
    MENARCHE_FRACTION: MENARCHE_FRACTION,
    MENARCHE_FRACTION_SD: MENARCHE_FRACTION_SD,
    MENARCHE_BA_REF_YEARS: MENARCHE_BA_REF_YEARS,
    MENARCHE_BA_SLOPE_CM_PER_YEAR: MENARCHE_BA_SLOPE_CM_PER_YEAR
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
