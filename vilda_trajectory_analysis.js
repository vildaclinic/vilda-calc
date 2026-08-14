/* vilda_trajectory_analysis.js — automatyczna analiza trajektorii na siatce centylowej (wzrost, masa, BMI).
 *
 * Czytelny modul (nie-minified) wg AGENTS.md §2: cala logika analizy i prezentacji tutaj; zminifikowany
 * vilda_advanced_growth.js jedynie WYWOLUJE window.VildaTrajectoryAnalysis.analyzeAndRenderHtml(input).
 *
 * Zakres v1: analiza WSZYSTKICH kolejnych odcinkow miedzy pomiarami (nie tylko pierwszy→ostatni),
 * dla wzrostu, masy i BMI, z werdyktami odcinkow i podsumowaniem calej trajektorii.
 *
 * ZASADA: moduł NIE wprowadza żadnych nowych progów klinicznych. Wszystkie reguły są odwzorowane 1:1
 * z istniejących, przyjętych miejsc aplikacji:
 *  - statystyka punktu (centyl/SDS): ta sama ścieżka co „Podsumowanie wyników" i panel porównania A→B
 *    (window.advHistoryResolveMetric z fallbackiem Palczewskiej — jak tabStatsAt, PR #59/v386);
 *  - werdykt pary punktów: słownik i progi ΔSDS identyczne z verdictCh panelu porównania (PR #63/v388);
 *    parytet pilnowany testem tests/unit/trajectory-analysis.test.mjs na realnym verdictCh;
 *  - opis strefy/kanału: identyczny z interpCh panelu (kanały 3/10/25/50/75/90/97);
 *  - czerwona flaga pozycyjna wzrostu: ΔhSDS ≤ −1,0 od pierwszego pomiaru z wieku ≥24 mies. (PR #64);
 *  - tempo wzrastania: window.pickPrevForLastYear / pickPrevFallback / velocityCmPerYear /
 *    getVelocityThreshold — identycznie jak karta „Zaawansowane obliczenia wzrostowe";
 *    dla wieku >10 lat hierarchia okołopokwitaniowa wg dostępnych danych (Tanner → wiek kostny →
 *    reguła generyczna) — parametry i źródła w P (akceptacja właściciela 2026-08-08).
 * Jedyny własny parametr to strażnik jakości danych SEGMENT_MIN_GAP_M (odcinki krótsze niż 3 mies.
 * są pokazywane, ale bez werdyktu — annualizacja/ocena tak krótkich odstępów jest niestabilna).
 */
(function (w) {
  'use strict';

  var VERSION = '10';

  // ── Parametry (odwzorowane z istniejących progów aplikacji — patrz nagłówek) ──
  var P = {
    SEGMENT_MIN_GAP_M: 3,
    REDFLAG_DSDS: -1.0,
    REDFLAG_BASE_MIN_M: 24,
    CLINES: [3, 10, 25, 50, 75, 90, 97],
    CHN: ['<3', '3–10', '10–25', '25–50', '50–75', '75–90', '90–97', '>97'],
    // ── Ocena tempa wzrastania >10 r.ż. (PARAMETRY KLINICZNE, akceptacja właściciela 2026-08-08) ──
    // Źródła: Tanner & Whitehouse, Arch Dis Child 1976;51:170-9 (PMID 952550, doi:10.1136/adc.51.3.170)
    // — centyle tempa dla wcześnie/przeciętnie/późno dojrzewających; Tanner & Davies, J Pediatr
    // 1985;107:317-29 (PMID 3875704, doi:10.1016/s0022-3476(85)80501-1). 4 cm/rok ≈ dolna granica
    // nadiru przedpokwitaniowego u późno dojrzewających. Reguła przesiewowa, nie diagnostyczna.
    PUB_VELO_MIN: 4,            // cm/rok — próg okołopokwitaniowy (<4 alarmuje/ostrzega wg kontekstu)
    PUB_AGE_MIN_M: 120,         // od 10 lat (poniżej działa getVelocityThreshold)
    PUB_AGE_MAX_F_M: 156,       // dziewczęta: okno generyczne do 13 lat
    PUB_AGE_MAX_M_M: 180,       // chłopcy: okno generyczne do 15 lat
    BONE_AGE_FRESH_M: 18,       // wiek kostny użyty tylko, gdy oznaczony w ciągu ostatnich 18 mies.
    TANNER_FRESH_M: 12,         // etap Tannera z rekordu pacjenta użyty tylko, gdy zapisany w ciągu
                                // ostatnich 12 mies. (stadium zmienia się w czasie — strażnik jakości danych)
    // Opóźnione dojrzewanie (Palmert & Dunkel, N Engl J Med 2012;366:443-53, PMID 22296078,
    // doi:10.1056/NEJMcp1109290): brak cech pokwitania u dziewcząt >13 lat / chłopców >14 lat.
    DELAYED_PUB_F_M: 156,
    DELAYED_PUB_M_M: 168
  };

  var METRICS = [
    { key: 'height', param: 'HT', title: 'Wzrost', unit: 'cm', dec: 0 },
    { key: 'weight', param: 'WT', title: 'Waga', unit: 'kg', dec: 1 },
    { key: 'bmi', param: 'BMI', title: 'BMI', unit: '', dec: 1 }
  ];

  // ── Pomocnicze ──

  function num(x) {
    var v = typeof x === 'string' ? parseFloat(x.replace(',', '.')) : x;
    return typeof v === 'number' && isFinite(v) ? v : null;
  }

  function sexMK(s) {
    return String(s == null ? '' : s).trim().toUpperCase() === 'M' ? 'M' : 'K';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmt(v, dec) {
    return (typeof v === 'number' && isFinite(v)) ? v.toFixed(dec).replace('.', ',') : '—';
  }

  // Formaty identyczne z panelem porównania (fmtC/fmtS).
  function fmtC(c) {
    if (c == null || !isFinite(c)) return '—';
    return c <= 3 ? '<3' : c >= 97 ? '>97' : String(Math.round(c));
  }

  function fmtS(s) {
    if (typeof s !== 'number' || !isFinite(s)) return '—';
    return (s >= 0 ? '+' : '−') + Math.abs(s).toFixed(1).replace('.', ',');
  }

  function fmtAgeM(mo) {
    mo = Math.round(mo);
    var y = Math.floor(mo / 12), r = mo % 12;
    var ys = y ? y + (y === 1 ? ' rok' : (y >= 2 && y <= 4 ? ' lata' : ' lat')) : '';
    var rs = r ? r + ' mies.' : '';
    return ys && rs ? ys + ' ' + rs : (ys || rs || '0 mies.');
  }

  // Kanał centylowy — identycznie jak chan() panelu porównania.
  function chan(c) {
    var k = 0;
    for (var i = 0; i < P.CLINES.length; i++) if (c >= P.CLINES[i]) k++;
    return k;
  }

  function zoneLabel(c) {
    return (c == null || !isFinite(c)) ? '—' : P.CHN[chan(c)];
  }

  // Ton pozycji — identycznie jak toneCent() panelu porównania.
  function toneCent(met, c) {
    if (c == null || !isFinite(c)) return null;
    if (met === 'weight') return (c <= 3 || c >= 97) ? 'danger' : ((c > 3 && c < 10) || (c >= 90 && c < 97)) ? 'warn' : 'normal';
    if (met === 'height') return c <= 3 ? 'danger' : ((c > 3 && c < 10) || c > 97) ? 'warn' : 'normal';
    if (met === 'bmi') return c >= 97 ? 'danger' : ((c >= 85 && c < 97) || c < 5) ? 'warn' : 'normal';
    return (c <= 3 || c >= 97) ? 'danger' : (c <= 5 || c >= 95) ? 'warn' : 'normal';
  }

  // ── Statystyka punktu — wspólna ścieżka aplikacji (jak tabStatsAt panelu, v386) ──

  function statFor(param, value, sex, ageYears, source) {
    try {
      var v = num(value);
      if (v == null || v <= 0) return null;
      var g = sexMK(sex);
      var src = source != null && String(source).trim() !== '' ? String(source).toUpperCase() : null;
      var st = null;
      if (typeof w.advHistoryResolveMetric === 'function') {
        var r = w.advHistoryResolveMetric(param, v, g, ageYears, src || 'OLAF');
        if (r && r.result && typeof r.result.percentile === 'number' && isFinite(r.result.percentile)) st = r.result;
      }
      if (!st && src === 'PALCZEWSKA' && typeof w.calcPercentileStatsPal === 'function') {
        var q = w.calcPercentileStatsPal(v, g, ageYears, param);
        if (q && typeof q.percentile === 'number' && isFinite(q.percentile)) st = q;
      }
      if (!st) return null;
      var sd = (typeof st.sd === 'number' && isFinite(st.sd)) ? st.sd
        : (typeof w.normInv === 'function' ? w.normInv(st.percentile / 100) : null);
      if (typeof sd !== 'number' || !isFinite(sd)) return null;
      return { percentile: st.percentile, sd: sd };
    } catch (e) {
      return null;
    }
  }

  // ── Werdykt pary punktów — transkrypcja 1:1 verdictCh panelu porównania (v388) ──
  // Nie zmieniaj progów ani etykiet bez zmiany verdictCh — parytet pilnuje test jednostkowy.

  function verdictForPair(met, sa0, sb0, ca, cb) {
    if (typeof sa0 !== 'number' || typeof sb0 !== 'number' || !isFinite(sa0) || !isFinite(sb0) || ca == null || cb == null) return null;
    var d = Math.round(100 * (sb0 - sa0)) / 100, W = met === 'height', B = met === 'bmi', low = ca < 10, high = W ? ca > 90 : ca >= (B ? 85 : 90);
    var ST = W ? 'stabilny tor wzrastania' : B ? 'stabilny tor BMI' : 'stabilny tor masy ciała';
    var ND = W ? 'pogłębianie niedoboru wzrostu' : 'pogłębianie niedoboru masy ciała';
    if (low) {
      if (d >= 0.2) {
        // Start z niedoboru (<10c): etykietę różnicuje centyl końcowy (decyzja właściciela 2026-08-09).
        if (W) return { t: 'good', l: 'wyrównywanie niedoboru wzrostu (catch-up)' };
        if (cb < 10) return { t: 'good', l: 'wyrównywanie niedoboru masy ciała' };
        if (B) return cb >= 97 ? { t: 'bad', l: 'przekroczenie progu otyłości (≥97c)' }
          : cb >= 85 ? { t: 'warn', l: 'wyrównanie niedoboru z szybkim przyrostem BMI — do obserwacji' }
          : { t: 'good', l: 'wyrównanie niedoboru (BMI)' };
        return cb >= 90 ? { t: 'bad', l: 'przekroczenie 90. centyla masy ciała po wyrównaniu niedoboru' }
          : cb >= 75 ? { t: 'warn', l: 'wyrównanie niedoboru z szybkim przyrostem masy ciała — do obserwacji' }
          : { t: 'good', l: 'wyrównanie niedoboru masy ciała' };
      }
      return d <= -0.5 ? { t: 'bad', l: ND } : d <= -0.2 ? { t: 'warn', l: ND } : { t: 'stable', l: ST };
    }
    if (high) {
      if (W) return d <= -1 ? { t: 'warn', l: 'szybka deceleracja z wysokich centyli' } : d <= -0.2 ? { t: 'stable', l: 'normalizacja pozycji centylowej' } : d >= 0.5 ? { t: 'warn', l: 'dalsza akceleracja wzrastania' } : { t: 'stable', l: ST };
      if (d <= -1.5) return { t: 'warn', l: B ? 'szybki spadek BMI — wskazana ocena' : 'szybka utrata masy — wskazana ocena' };
      if (d <= -0.2) return { t: 'good', l: B ? 'redukcja BMI' : 'redukcja nadmiaru masy ciała' };
      if (d >= 0.5 || (d >= 0.2 && cb >= 97)) return { t: 'bad', l: B ? (cb >= 97 ? (ca >= 97 ? 'progresja otyłości' : 'przekroczenie progu otyłości (≥97c)') : 'szybka progresja nadwagi (BMI)') : (cb >= 97 ? (ca >= 97 ? 'progresja nadmiaru masy (>97. centyla)' : 'przekroczenie 97. centyla masy ciała') : 'nasilony przyrost masy ciała') };
      return d >= 0.2 ? { t: 'warn', l: B ? 'progresja nadwagi (BMI w paśmie 85.–97. centyla)' : 'narastanie nadmiaru masy ciała' } : B && cb >= 97 ? { t: 'warn', l: 'utrzymująca się otyłość (>97c)' } : { t: 'stable', l: ST };
    }
    if (W) return d <= -1 ? { t: 'bad', l: 'istotna deceleracja wzrastania' } : d <= -0.5 ? { t: 'warn', l: 'deceleracja toru wzrastania' } : (d >= 0.5 && cb > 97) ? { t: 'warn', l: 'akceleracja z przekroczeniem 97. centyla' } : { t: 'stable', l: ST };
    if (Math.abs(d) >= 0.5) {
      var al = B ? (cb >= 97 || cb < 5) : (cb <= 3 || cb >= 97);
      return al ? { t: 'bad', l: d > 0 ? (B ? 'przekroczenie progu otyłości (≥97c)' : 'przekroczenie 97. centyla masy ciała') : (B ? 'przekroczenie progu niedowagi (<5c)' : 'obniżenie masy ciała poniżej 3. centyla') } : { t: 'warn', l: d > 0 ? 'istotne przesunięcie centylowe w górę' : 'istotne przesunięcie centylowe w dół' };
    }
    return { t: 'stable', l: ST };
  }

  // Nakładka kontekstu klinicznego — transkrypcja 1:1 verdictCh2 panelu porównania.
  // gm: miesiące terapii GH w odcinku (ocena odpowiedzi od gm>=6); mp: SDS kanału rodzicielskiego (MPH);
  // rd: zamierzona redukcja aktywna w odcinku (panel: nakładanie >=3 mies.; nigdy przy niedoborze ca<10).
  // Parytet z realnym verdictCh2 pilnowany testem trajectory-analysis.test.mjs.
  function verdictForPairCtx(met, sa0, sb0, ca, cb, gm, mp, rd) {
    var v1 = verdictForPair(met, sa0, sb0, ca, cb);
    if (!v1) return null;
    var d = Math.round(100 * (sb0 - sa0)) / 100;
    if (met === 'height') {
      if (gm >= 6) return d >= 0.3 ? { t: 'good', l: 'dobra odpowiedź na GH' } : d < 0.1 ? { t: 'warn', l: 'słaba odpowiedź na GH — do oceny' } : { t: 'stable', l: 'odpowiedź umiarkowana (GH)' };
      if (typeof mp === 'number' && isFinite(mp)) {
        var e0 = Math.round(100 * (sa0 - mp)) / 100;
        if (e0 <= -1.5) return d >= 0.2 ? { t: 'good', l: 'nadrabia względem kanału rodzicielskiego' } : d <= -0.5 ? { t: 'bad', l: 'oddala się od kanału rodzicielskiego' } : d <= -0.2 ? { t: 'warn', l: 'oddala się od kanału rodzicielskiego' } : { t: 'stable', l: 'stabilnie (poniżej kanału rodzicielskiego)' };
        if (e0 >= 1.5) return d <= -1 ? { t: 'warn', l: 'szybka deceleracja wzrastania' } : d <= -0.2 ? { t: 'stable', l: 'normalizacja do kanału rodzicielskiego' } : d >= 0.5 ? { t: 'warn', l: 'dalsza akceleracja ponad kanał rodzicielski' } : { t: 'stable', l: 'stabilny tor wzrastania' };
        if (ca < 10) {
          if (d <= -0.5) return { t: 'bad', l: 'pogłębianie niedoboru wzrostu' };
          if (d <= -0.2) return { t: 'warn', l: 'obniżanie pozycji centylowej w dolnym paśmie normy (3.–10. centyl) — do obserwacji' };
        }
        return d <= -1 ? { t: 'bad', l: 'istotna deceleracja wzrastania' } : d <= -0.5 ? { t: 'warn', l: 'deceleracja toru wzrastania' } : (d >= 0.5 && cb > 97) ? { t: 'warn', l: 'akceleracja z przekroczeniem 97. centyla' } : { t: 'stable', l: 'w kanale rodzicielskim' };
      }
      return v1;
    }
    if (rd && ca >= 10) {
      if (d <= -1.5) return { t: 'warn', l: 'redukcja bardzo szybka — do kontroli' };
      if (d <= -0.2) return { t: 'good', l: 'redukcja w trakcie leczenia' };
      if (d >= 0.2) return { t: v1.t === 'bad' ? 'bad' : 'warn', l: 'przyrost masy mimo leczenia redukcyjnego' };
    }
    return v1;
  }

  // ── Nakładka spójności waga↔BMI — transkrypcja 1:1 verdictWtBmi panelu porównania. ──
  // „Stabilna" waga (ΔSDS ≥ +0,2, poniżej własnego progu ostrzeżenia) przy BMI warn/bad
  // w kierunku nadmiaru (ΔSDS BMI ≥ +0,2) w tym samym odcinku nie jest stabilna klinicznie:
  // masa-do-wieku maskuje nadmiar, gdy wzrost odstaje w dół (decyzja właściciela 2026-08-14).
  // Nie zmieniaj reguły bez zmiany verdictWtBmi — parytet pilnuje trajectory-analysis.test.mjs.
  function weightBmiOverlayVerdict(v, dW, vB, dB) {
    if (!v || v.t !== 'stable' || !(dW >= 0.2)) return v;
    if (!vB || (vB.t !== 'warn' && vB.t !== 'bad') || !(dB >= 0.2)) return v;
    return { t: 'warn', l: 'przyrost masy szybszy niż wzrastanie — nadmiar ujawnia się w BMI' };
  }

  // ── Nakładka pozycyjna wzrostu — transkrypcja 1:1 verdictHtPos panelu porównania. ──
  // „Stabilny" tor nie jest uspokajający, gdy pozycja tego nie uzasadnia: <3c zawsze (niedobór
  // wzrostu z definicji, poza normą populacyjną 3–97c), 3–10c tylko przy torze poniżej kanału
  // rodzicielskiego (≥1,5 SDS pod MPH). Pasmo 3–10c samo w sobie to DOLNE PASMO NORMY, nie brak
  // normy (decyzja właściciela 2026-08-14). Nie stosuje się przy aktywnej ocenie odpowiedzi na GH.
  function heightPositionOverlayVerdict(v, cb, mp, sa0, ghOn) {
    if (!v || v.t !== 'stable' || ghOn) return v;
    if (cb < 3) return { t: 'warn', l: 'tor stabilny, ale poniżej 3. centyla — niedobór wzrostu' };
    if (cb < 10 && typeof mp === 'number' && isFinite(mp) && Math.round(100 * (sa0 - mp)) / 100 <= -1.5)
      return { t: 'warn', l: 'tor stabilny w dolnym paśmie normy (3.–10. centyl), poniżej kanału rodzicielskiego — do obserwacji' };
    return v;
  }

  // Zastosowanie nakładki do gotowych metryk: odcinki wagi parowane z odcinkami BMI po wieku
  // granic; po zmianach przeliczany jest najpoważniejszy odcinek wagi (ta sama reguła co
  // w analyzeMetric). Werdykty chipu leczenia (redukcja) pozostają nietknięte — ścieżka rd
  // nie zwraca „stabilnych" werdyktów przy ΔSDS ≥ 0,2, więc warunek nakładki ich nie obejmuje.
  function applyWeightBmiConsistency(metrics) {
    var wt = null, bm = null;
    metrics.forEach(function (m) {
      if (m.metric === 'weight') wt = m;
      else if (m.metric === 'bmi') bm = m;
    });
    if (!wt || !bm) return;
    function bmiSegFor(a0, b0) {
      for (var i = 0; i < bm.segments.length; i++) {
        var s = bm.segments[i];
        if (s.a.ageMonths === a0 && s.b.ageMonths === b0) return s;
      }
      return null;
    }
    var changed = false;
    wt.segments.forEach(function (s) {
      if (!s.verdict) return;
      var bs = bmiSegFor(s.a.ageMonths, s.b.ageMonths);
      if (!bs || !bs.verdict) return;
      var nv = weightBmiOverlayVerdict(s.verdict, s.dSds, bs.verdict, bs.dSds);
      if (nv !== s.verdict) { s.verdict = nv; changed = true; }
    });
    if (wt.total && bm.total
      && wt.first.ageMonths === bm.first.ageMonths && wt.last.ageMonths === bm.last.ageMonths) {
      var dW = Math.round(100 * (wt.last.sd - wt.first.sd)) / 100;
      var dB = Math.round(100 * (bm.last.sd - bm.first.sd)) / 100;
      wt.total = weightBmiOverlayVerdict(wt.total, dW, bm.total, dB);
    }
    if (changed) {
      var sev = { bad: 2, warn: 1 }, worst = null;
      wt.segments.forEach(function (s) {
        if (!s.verdict || !sev[s.verdict.t]) return;
        if (!worst || sev[s.verdict.t] > sev[worst.verdict.t] ||
          (sev[s.verdict.t] === sev[worst.verdict.t] && Math.abs(s.dSds) > Math.abs(worst.dSds))) worst = s;
      });
      wt.worst = worst;
    }
  }

  // Nakładanie się przedziału kontekstu (w miesiącach wieku; b==null → trwa nadal) z odcinkiem [a0,b0].
  function overlapM(intv, a0, b0) {
    if (!intv || intv.a == null || !isFinite(intv.a)) return 0;
    var x0 = Math.max(a0, intv.a);
    var x1 = Math.min(b0, intv.b == null || !isFinite(intv.b) ? b0 : intv.b);
    return Math.max(0, x1 - x0);
  }

  function normalizeContext(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var mp = typeof raw.mpSds === 'number' && isFinite(raw.mpSds) ? raw.mpSds : null;
    var gh = raw.gh && raw.gh.a != null && isFinite(raw.gh.a) ? { a: raw.gh.a, b: raw.gh.b != null && isFinite(raw.gh.b) ? raw.gh.b : null } : null;
    var red = raw.red && raw.red.a != null && isFinite(raw.red.a) ? { a: raw.red.a, b: raw.red.b != null && isFinite(raw.red.b) ? raw.red.b : null, label: raw.red.label || null } : null;
    var ts = num(raw.tannerStage);
    ts = ts != null && ts >= 1 && ts <= 5 ? Math.round(ts) : null;
    var tsAt = num(raw.tannerAtAgeMonths);
    var ba = null;
    if (raw.boneAge && num(raw.boneAge.baMonths) != null && num(raw.boneAge.baMonths) > 0) {
      ba = { baMonths: num(raw.boneAge.baMonths), atAgeMonths: num(raw.boneAge.atAgeMonths) };
    }
    if (mp == null && !gh && !red && ts == null && !ba) return null;
    return { mpSds: mp, gh: gh, red: red, tannerStage: ts, tannerAtAgeMonths: tsAt, tannerStale: false, boneAge: ba };
  }

  // Opis strefy dla pary — transkrypcja interpCh panelu (zwraca sam tekst strefy).
  function zoneForPair(ca, cb, sa, sb) {
    var a = chan(ca), b = chan(cb);
    if (b !== a) return 'kanał ' + P.CHN[a] + ' → ' + P.CHN[b];
    var ext = a === 0 || a === 7;
    var ds = (typeof sa === 'number' && typeof sb === 'number') ? sb - sa : 0;
    if (ext && Math.abs(ds) >= 0.2) return 'nadal ' + P.CHN[a];
    return (ext ? 'w strefie ' : 'w kanale ') + P.CHN[a];
  }

  // ── Budowa listy punktów ──

  function buildPoints(input) {
    var raw = Array.isArray(input.measurements) ? input.measurements.slice() : [];
    var pts = [];
    raw.forEach(function (m) {
      if (!m) return;
      var am = num(m.ageMonths);
      if (am == null && num(m.ageYears) != null) am = Math.round(num(m.ageYears) * 12);
      if (am == null || am < 0) return;
      pts.push({
        ageMonths: am,
        ageYears: num(m.ageYears) != null ? num(m.ageYears) : am / 12,
        height: num(m.height),
        weight: num(m.weight),
        isCurrent: false
      });
    });
    var cam = num(input.currentAgeMonths);
    if (cam != null && (num(input.currentHeight) != null || num(input.currentWeight) != null)) {
      pts.push({
        ageMonths: cam,
        ageYears: num(input.currentAgeYears) != null ? num(input.currentAgeYears) : cam / 12,
        height: num(input.currentHeight),
        weight: num(input.currentWeight),
        isCurrent: true
      });
    }
    pts.sort(function (a, b) { return a.ageMonths - b.ageMonths; });
    // scal punkty z identycznym wiekiem (ostatni wpis wygrywa polami niepustymi)
    var out = [];
    pts.forEach(function (p) {
      var last = out[out.length - 1];
      if (last && last.ageMonths === p.ageMonths) {
        if (p.height != null) last.height = p.height;
        if (p.weight != null) last.weight = p.weight;
        last.isCurrent = last.isCurrent || p.isCurrent;
      } else {
        out.push(p);
      }
    });
    out.forEach(function (p) {
      p.bmi = (p.height != null && p.weight != null && p.height > 0) ? p.weight / Math.pow(p.height / 100, 2) : null;
    });
    return out;
  }

  // ── Analiza jednej metryki ──

  function analyzeMetric(met, pts, sex, source, ctx) {
    var series = [];
    pts.forEach(function (p) {
      var v = p[met.key];
      if (v == null) return;
      var st = statFor(met.param, v, sex, p.ageYears, source);
      if (!st) return;
      series.push({ ageMonths: p.ageMonths, ageYears: p.ageYears, value: v, c: st.percentile, sd: st.sd, isCurrent: p.isCurrent });
    });
    if (series.length < 2) return null;

    // Werdykt pary z kontekstem klinicznym (jak panel porównania): GH liczone tylko dla wzrostu,
    // redukcja tylko dla wagi/BMI przy nakładaniu >=3 mies. w danym odcinku.
    function pairVerdict(a0, b0) {
      if (!ctx) {
        var v0 = verdictForPair(met.key, a0.sd, b0.sd, a0.c, b0.c);
        if (met.key === 'height') v0 = heightPositionOverlayVerdict(v0, b0.c, null, a0.sd, false);
        return { v: v0, ghOn: false, rdOn: false };
      }
      var ghM = met.key === 'height' ? overlapM(ctx.gh, a0.ageMonths, b0.ageMonths) : 0;
      var rdOn = met.key !== 'height' && overlapM(ctx.red, a0.ageMonths, b0.ageMonths) >= 3;
      var v = verdictForPairCtx(met.key, a0.sd, b0.sd, a0.c, b0.c, ghM, ctx.mpSds, rdOn);
      if (met.key === 'height') v = heightPositionOverlayVerdict(v, b0.c, ctx.mpSds, a0.sd, ghM >= 6);
      return {
        v: v,
        ghOn: ghM >= 6,
        rdOn: rdOn && a0.c >= 10
      };
    }

    var segments = [];
    for (var i = 0; i < series.length - 1; i++) {
      var a = series[i], b = series[i + 1];
      var gapM = b.ageMonths - a.ageMonths;
      var dSds = Math.round(100 * (b.sd - a.sd)) / 100;
      var pv = gapM >= P.SEGMENT_MIN_GAP_M ? pairVerdict(a, b) : null;
      segments.push({
        a: a, b: b, gapM: gapM,
        dVal: b.value - a.value,
        dSds: dSds,
        zone: zoneForPair(a.c, b.c, a.sd, b.sd),
        verdict: pv ? pv.v : null,
        ghOn: pv ? pv.ghOn : false,
        rdOn: pv ? pv.rdOn : false
      });
    }

    var first = series[0], last = series[series.length - 1];
    var totalPv = (last.ageMonths - first.ageMonths) >= P.SEGMENT_MIN_GAP_M ? pairVerdict(first, last) : null;
    var total = totalPv ? totalPv.v : null;

    // najpoważniejszy odcinek: bad > warn, potem największe |ΔSDS|
    var sev = { bad: 2, warn: 1 };
    var worst = null;
    segments.forEach(function (s) {
      if (!s.verdict || !sev[s.verdict.t]) return;
      if (!worst || sev[s.verdict.t] > sev[worst.verdict.t] ||
        (sev[s.verdict.t] === sev[worst.verdict.t] && Math.abs(s.dSds) > Math.abs(worst.dSds))) worst = s;
    });

    // czerwona flaga pozycyjna wzrostu — reguła PR #64 (ΔhSDS ≤ −1 od pierwszego pomiaru ≥24 mies.)
    var redFlag = null;
    if (met.key === 'height') {
      var base = null;
      for (var j = 0; j < series.length; j++) {
        if (series[j].ageMonths >= P.REDFLAG_BASE_MIN_M) { base = series[j]; break; }
      }
      if (base && last.ageMonths > base.ageMonths) {
        var dh = Math.round(100 * (last.sd - base.sd)) / 100;
        if (dh <= P.REDFLAG_DSDS) redFlag = { dSds: dh, baseAgeMonths: base.ageMonths };
      }
    }

    // Chip odpowiedzi na leczenie (decyzja właściciela 2026-08-09): dla masy/BMI przy aktywnej
    // zamierzonej redukcji werdykt wiersza liczony od pomiaru na starcie leczenia do ostatniego
    // (te same progi rd co panel porównania); całość okresu pozostaje w total.
    var treatment = null;
    if (met.key !== 'height' && ctx && ctx.red && ctx.red.a != null) {
      var tb = null;
      for (var t9 = 0; t9 < series.length; t9++) { if (series[t9].ageMonths <= ctx.red.a) tb = series[t9]; }
      if (!tb) tb = series[0];
      if (tb !== last && (last.ageMonths - tb.ageMonths) >= P.SEGMENT_MIN_GAP_M
        && overlapM(ctx.red, tb.ageMonths, last.ageMonths) >= 3) {
        var tp = pairVerdict(tb, last);
        if (tp && tp.v && tp.rdOn) {
          treatment = { a: tb, b: last, dSds: Math.round(100 * (last.sd - tb.sd)) / 100, verdict: tp.v };
        }
      }
    }
    return {
      metric: met.key, title: met.title, unit: met.unit, dec: met.dec,
      series: series, segments: segments,
      first: first, last: last, total: total, worst: worst, redFlag: redFlag,
      treatment: treatment,
      tone: toneCent(met.key, last.c)
    };
  }

  // ── Tempo wzrastania — identyczna logika doboru okna i progu jak karta zaawansowana ──

  function heightVelocity(pts, currentAgeMonths, sex, ctx) {
    try {
      var hp = pts.filter(function (p) { return p.height != null; });
      if (hp.length < 2) return null;
      var cur = hp[hp.length - 1];
      var hist = hp.slice(0, hp.length - 1).map(function (p) { return { ageMonths: p.ageMonths, height: p.height }; });
      var target = num(currentAgeMonths) != null ? num(currentAgeMonths) : cur.ageMonths;
      if (typeof w.velocityCmPerYear !== 'function') return null;
      var v = null, usedLastYear = false, gapM = null;
      var prev = typeof w.pickPrevForLastYear === 'function' ? w.pickPrevForLastYear(hist, target, 6, 12, 3) : null;
      if (prev) {
        v = w.velocityCmPerYear(prev.height, prev.ageMonths, cur.height, target);
        if (v != null) { usedLastYear = true; gapM = target - prev.ageMonths; }
      }
      if (v == null && typeof w.pickPrevFallback === 'function') {
        var fb = w.pickPrevFallback(hist, target, 6);
        if (fb) {
          v = w.velocityCmPerYear(fb.height, fb.ageMonths, cur.height, target);
          if (v != null) { gapM = target - fb.ageMonths; usedLastYear = gapM >= 6 && gapM <= 8; }
        }
      }
      if (v == null || !isFinite(v)) return null;
      var out = {
        cmPerYear: v, gapM: gapM, usedLastYear: usedLastYear,
        threshold: null, slow: false, alarm: false,
        severity: null, basis: null, normLabel: null, note: null,
        aboveNormAge: false
      };
      applyVelocityNorms(out, target, sex, ctx);
      return out;
    } catch (e) {
      return null;
    }
  }

  function applyVelocityNorms(out, target, sex, ctx) {
    var v = out.cmPerYear, usedLastYear = out.usedLastYear;
    var thr = typeof w.getVelocityThreshold === 'function' ? w.getVelocityThreshold(target) : null;
    if (thr) {
      // <10 lat: dotychczasowe normy wg wieku metrykalnego (poziom alarmowy jak dotąd).
      out.threshold = thr;
      out.basis = 'age';
      out.normLabel = thr.label || null;
      out.slow = !!(usedLastYear && v < thr.threshold);
      out.severity = out.slow ? 'danger' : null;
      out.alarm = out.slow;
      return out;
    }
    if (target / 12 < 10) return out; // brak progu poniżej 1 r.ż. itp. — bez oceny
    // ── >10 lat: hierarchia wg dostępnych danych (akceptacja właściciela 2026-08-08) ──
    assessPubertalVelocity(out, target, sex, ctx);
    return out;
  }

  // Ocena już policzonej wartości tempa (np. z karty zaawansowanej) tą samą hierarchią norm,
  // której używa heightVelocity(). usedLastYear odtwarzane z odstępu pomiarów: pickPrevForLastYear
  // akceptuje odstęp 9–15 mies., pickPrevFallback liczy się jako okno roczne przy 6–8 mies.,
  // więc łącznie ocena względem normy obowiązuje dla odstępu 6–15 mies.
  function assessVelocityValue(v, gapM, ageMonths, sex, ctx) {
    var vv = num(v);
    var target = num(ageMonths);
    if (vv == null || !isFinite(vv) || target == null) return null;
    var g = num(gapM);
    var out = {
      cmPerYear: vv, gapM: g, usedLastYear: g != null && g >= 6 && g <= 15,
      threshold: null, slow: false, alarm: false,
      severity: null, basis: null, normLabel: null, note: null,
      aboveNormAge: false
    };
    applyVelocityNorms(out, target, sexMK(sex), ctx);
    return out;
  }

  // Ocena tempa >10 r.ż.: Tanner (poziom 1) → wiek kostny (poziom 2) → reguła generyczna (poziom 3).
  // Ocenia tylko przy oknie rocznym/awaryjnym (usedLastYear) — jak dotychczasowe normy.
  function assessPubertalVelocity(out, targetAgeM, sex, ctx) {
    var v = out.cmPerYear;
    var isM = sexMK(sex) === 'M';
    var genMax = isM ? P.PUB_AGE_MAX_M_M : P.PUB_AGE_MAX_F_M;
    var ts = ctx && ctx.tannerStage != null ? ctx.tannerStage : null;
    if (ts != null) {
      if (ts === 1) {
        // Badaniem wykluczono skok — obowiązuje norma przedpokwitaniowa.
        out.basis = 'tanner1';
        out.normLabel = '≥' + P.PUB_VELO_MIN + ' cm/rok przed skokiem (Tanner I)';
        out.slow = !!(out.usedLastYear && v < P.PUB_VELO_MIN);
        out.severity = out.slow ? 'danger' : null;
        out.alarm = out.slow;
        return;
      }
      if (ts === 2 || ts === 3) {
        out.basis = 'tanner23';
        out.normLabel = '≥' + P.PUB_VELO_MIN + ' cm/rok w trakcie pokwitania (Tanner ' + (ts === 2 ? 'II' : 'III') + ')';
        out.slow = !!(out.usedLastYear && v < P.PUB_VELO_MIN);
        out.severity = out.slow ? 'warn' : null;
        return;
      }
      // Tanner IV–V: fizjologiczna deceleracja po skoku — bez oceny automatycznej.
      out.basis = 'tanner45';
      out.note = 'po skoku pokwitaniowym (Tanner ' + (ts === 4 ? 'IV' : 'V') + ') — deceleracja fizjologiczna';
      return;
    }
    var ba = ctx && ctx.boneAge ? ctx.boneAge : null;
    var baFresh = ba && (ba.atAgeMonths == null || (targetAgeM - ba.atAgeMonths) <= P.BONE_AGE_FRESH_M);
    if (ba && baFresh) {
      var thrBA = typeof w.getVelocityThreshold === 'function' ? w.getVelocityThreshold(ba.baMonths) : null;
      if (thrBA) {
        // Norma dobrana wg wieku kostnego; poziom czujność (błąd oceny BA ~±1 rok).
        out.basis = 'boneAge';
        out.normLabel = (thrBA.label || '') + ' — wg wieku kostnego ' + fmtAgeM(ba.baMonths);
        out.slow = !!(out.usedLastYear && v < thrBA.threshold);
        out.severity = out.slow ? 'warn' : null;
        return;
      }
      if (ba.baMonths >= P.PUB_AGE_MIN_M && ba.baMonths <= genMax) {
        out.basis = 'boneAgeGeneric';
        out.normLabel = '≥' + P.PUB_VELO_MIN + ' cm/rok — wg wieku kostnego ' + fmtAgeM(ba.baMonths) + ' (okres okołopokwitaniowy)';
        out.slow = !!(out.usedLastYear && v < P.PUB_VELO_MIN);
        out.severity = out.slow ? 'warn' : null;
        return;
      }
      out.aboveNormAge = true; // wiek kostny powyżej okna — bez oceny
      return;
    }
    if (targetAgeM <= genMax) {
      out.basis = 'generic';
      out.normLabel = '≥' + P.PUB_VELO_MIN + ' cm/rok (okres okołopokwitaniowy — możliwy późny skok)';
      out.slow = !!(out.usedLastYear && v < P.PUB_VELO_MIN);
      out.severity = out.slow ? 'warn' : null;
      return;
    }
    out.aboveNormAge = true;
  }

  // ── Analiza całości ──

  function analyze(input) {
    if (!input || typeof input !== 'object') return null;
    var sex = sexMK(input.sex);
    var source = input.source != null ? input.source : (typeof w.bmiSource !== 'undefined' ? w.bmiSource : null);
    var ctx = normalizeContext(input.context);
    var pts = buildPoints(input);
    if (pts.length < 2) return null;
    // Świeżość etapu Tannera z rekordu pacjenta: starszy niż TANNER_FRESH_M — pomijany w ocenie
    // (pasek kontekstu pokazuje go jako nieaktualny). Tanner z bieżącego formularza (bez tannerAtAgeMonths)
    // jest zawsze traktowany jako aktualny.
    if (ctx && ctx.tannerStage != null && ctx.tannerAtAgeMonths != null) {
      var nowAgeM = pts[pts.length - 1].ageMonths;
      if (nowAgeM - ctx.tannerAtAgeMonths > P.TANNER_FRESH_M) {
        ctx.tannerStale = true;
        ctx.tannerStaleStage = ctx.tannerStage;
        ctx.tannerStage = null;
      }
    }
    var metrics = [];
    METRICS.forEach(function (met) {
      var m = analyzeMetric(met, pts, sex, source, ctx);
      if (m) metrics.push(m);
    });
    if (!metrics.length) return null;
    applyWeightBmiConsistency(metrics);
    var lastAgeM = pts[pts.length - 1].ageMonths;
    // Opóźnione dojrzewanie (Palmert & Dunkel 2012): Tanner I u dziewcząt >13 lat / chłopców >14 lat.
    var delayedPuberty = !!(ctx && ctx.tannerStage === 1
      && lastAgeM > (sex === 'M' ? P.DELAYED_PUB_M_M : P.DELAYED_PUB_F_M));
    return {
      version: VERSION,
      sex: sex,
      source: source != null ? String(source).toUpperCase() : null,
      context: ctx,
      points: pts,
      metrics: metrics,
      delayedPuberty: delayedPuberty,
      velocity: heightVelocity(pts, input.currentAgeMonths, sex, ctx)
    };
  }

  // ── Prezentacja ──

  var STYLE_ID = 'vta-style';
  var CSS = [
    '.vta{margin-top:0.6rem;font-size:0.95em}',
    '.vta .vta-title{margin:0 0 0.35rem 0}',
    '.vta p{margin:0.25rem 0}',
    '.vta .vta-lbl{font-weight:600}',
    '.vta .vta-good{color:#1b5e20;font-weight:600}',
    '.vta .vta-stable{opacity:0.85}',
    '.vta .vta-warn{color:#b26a00;font-weight:600}',
    '.vta .vta-bad{color:var(--danger,#c62828);font-weight:600}',
    '.vta .vta-red{color:var(--danger,#c62828);font-weight:600}',
    '.vta table{border-collapse:collapse;width:100%;margin:0.3rem 0}',
    '.vta th,.vta td{text-align:left;padding:3px 8px 3px 0;font-size:0.92em;border-bottom:1px solid rgba(127,127,127,0.18)}',
    '.vta details{margin-top:0.35rem}',
    '.vta summary{cursor:pointer;font-weight:600;font-size:0.93em}',
    '.vta .vta-note{opacity:0.75;font-size:0.85em;margin-top:0.45rem}'
  ].join('\n');

  function ensureStyle() {
    try {
      var d = w.document;
      if (!d || d.getElementById(STYLE_ID)) return;
      var st = d.createElement('style');
      st.id = STYLE_ID;
      st.textContent = CSS;
      (d.head || d.documentElement).appendChild(st);
    } catch (e) { /* brak DOM (test) — pomijamy */ }
  }

  function vSpan(v) {
    if (!v) return '<span class="vta-stable">—</span>';
    return '<span class="vta-' + esc(v.t) + '">' + esc(v.l) + '</span>';
  }

  // ── Czerwone banery kart wzrostowych — JEDYNE źródło treści alarmów (wariant 1, decyzja
  // właściciela 2026-08-08): karty renderują wynik tej funkcji zamiast własnych kopii komunikatów.
  // Progi bez zmian (flaga: reguła PR #64; tempo: getVelocityThreshold).

  var CARD_ALERT_LINK = ', wskazana konsultacja endokrynologiczna, <a href="https://vildaclinic.pl" target="_blank" rel="noopener noreferrer" style="color: var(--danger); text-decoration: underline;">umów wizytę</a>';

  function heightRedFlagOf(model) {
    if (!model || !model.metrics) return null;
    for (var i = 0; i < model.metrics.length; i++) {
      if (model.metrics[i].metric === 'height') return model.metrics[i].redFlag || null;
    }
    return null;
  }

  function buildCardAlertsHtml(model) {
    if (!model) return '';
    var out = '';
    var rf = heightRedFlagOf(model);
    if (rf) {
      out += '<p style="color: var(--danger); font-weight:600;">Z analizy siatki centylowej wynika istotne obniżenie pozycji centylowej wzrostu (zmiana hSDS: '
        + esc(fmtS(rf.dSds)) + ' względem pomiaru z wieku ' + esc(fmtAgeM(rf.baseAgeMonths))
        + ') — obraz deceleracji wzrastania' + CARD_ALERT_LINK + '</p>';
    }
    // Czerwony baner tempa tylko dla poziomu alarmowego (danger); poziom „czujność" (warn,
    // reguły okołopokwitaniowe) pokazują chipy bloku trajektorii i panelu — bez banera.
    if (model.velocity && model.velocity.alarm) {
      var norm = model.velocity.normLabel
        ? ' <span style="font-weight:400;">(norma: ' + esc(model.velocity.normLabel) + ')</span>' : '';
      out += '<p style="color: var(--danger); font-weight:600;">Tempo wzrastania poniżej normy dla wieku'
        + CARD_ALERT_LINK + norm + '</p>';
    }
    return out;
  }

  function metricSummaryHtml(m) {
    var line = '<p><span class="vta-lbl">' + esc(m.title) + ':</span> '
      + esc(fmt(m.first.value, m.dec) + (m.unit ? ' ' + m.unit : '') + ' → ' + fmt(m.last.value, m.dec) + (m.unit ? ' ' + m.unit : ''))
      + ' · ' + esc(fmtC(m.first.c) + 'c → ' + fmtC(m.last.c) + 'c')
      + ' (' + esc(zoneForPair(m.first.c, m.last.c, m.first.sd, m.last.sd)) + ')'
      + ' · SDS ' + esc(fmtS(m.first.sd) + ' → ' + fmtS(m.last.sd))
      + ' — ' + vSpan(m.total) + '</p>';
    if (m.redFlag) {
      line += '<p class="vta-red">⚠ Istotne obniżenie pozycji centylowej wzrostu '
        + '(ΔhSDS ' + esc(fmtS(m.redFlag.dSds)) + ' względem pomiaru z wieku ' + esc(fmtAgeM(m.redFlag.baseAgeMonths))
        + ') — obraz deceleracji wzrastania</p>';
    }
    if (m.worst && m.worst.verdict && (m.worst.verdict.t === 'bad' || m.worst.verdict.t === 'warn') && m.segments.length > 1) {
      line += '<p>↳ najpoważniejszy odcinek: ' + esc(fmtAgeM(m.worst.a.ageMonths)) + ' → ' + esc(fmtAgeM(m.worst.b.ageMonths))
        + ' (ΔSDS ' + esc(fmtS(m.worst.dSds)) + ') — ' + vSpan(m.worst.verdict) + '</p>';
    }
    return line;
  }

  // Wspólna klasyfikacja opisu tempa dla obu rendererów: {cls, text}.
  function velocityAssessment(vel) {
    if (!vel) return null;
    if (vel.slow && vel.severity === 'danger') return { cls: 'bad', text: 'poniżej normy dla wieku' + (vel.normLabel ? ' (' + vel.normLabel + ')' : '') };
    if (vel.slow) return { cls: 'warn', text: 'do oceny — ' + (vel.normLabel || 'poniżej progu przesiewowego') };
    if (vel.note) return { cls: 'stable', text: vel.note };
    if (vel.basis && vel.usedLastYear) return { cls: 'good', text: 'w normie' + (vel.normLabel ? ' (' + vel.normLabel + ')' : '') };
    if (vel.aboveNormAge) return { cls: 'stable', text: 'poza oknem automatycznej oceny normy tempa' };
    if (!vel.usedLastYear) return { cls: 'stable', text: 'odstęp pomiarów poza oknem oceny, bez porównania z normą' };
    return null;
  }

  function velocityHtml(vel) {
    if (!vel) return '';
    var ctx = vel.gapM != null ? ' (ostatnich ' + Math.round(vel.gapM) + ' mies.)' : '';
    var txt = '<span class="vta-lbl">Tempo wzrastania:</span> ' + esc(fmt(vel.cmPerYear, 1)) + ' cm/rok' + esc(ctx);
    var a = velocityAssessment(vel);
    if (a) txt += ' — <span class="vta-' + a.cls + '">' + esc(a.text) + '</span>';
    return '<p>' + txt + '</p>';
  }

  function delayedPubertyHtml(model, cls) {
    if (!model || !model.delayedPuberty) return '';
    var lim = model.sex === 'M' ? '14' : '13';
    return '<p class="' + cls + '">Tanner I w wieku powyżej ' + lim + ' lat — obraz opóźnionego dojrzewania, wskazana ocena</p>';
  }

  function segmentsTableHtml(model) {
    var rows = '';
    model.metrics.forEach(function (m) {
      m.segments.forEach(function (s) {
        rows += '<tr><td>' + esc(m.title) + '</td>'
          + '<td>' + esc(fmtAgeM(s.a.ageMonths) + ' → ' + fmtAgeM(s.b.ageMonths)) + '</td>'
          + '<td>' + esc(fmtC(s.a.c) + 'c → ' + fmtC(s.b.c) + 'c') + '</td>'
          + '<td>' + esc(fmtS(s.a.sd) + ' → ' + fmtS(s.b.sd)) + '</td>'
          + '<td>' + (s.verdict ? vSpan(s.verdict) : '<span class="vta-stable">odstęp <' + P.SEGMENT_MIN_GAP_M + ' mies. — bez werdyktu</span>') + '</td></tr>';
      });
    });
    if (!rows) return '';
    return '<details><summary>Szczegóły odcinków trajektorii</summary>'
      + '<table><thead><tr><th>Parametr</th><th>Odcinek</th><th>Centyle</th><th>SDS</th><th>Werdykt</th></tr></thead>'
      + '<tbody>' + rows + '</tbody></table></details>';
  }

  function buildHtml(model, opts) {
    if (!model || !model.metrics || !model.metrics.length) return '';
    ensureStyle();
    var hideRedFlag = !!(opts && opts.hideRedFlag); // flagę pokazuje baner karty (wariant 1) — bez powtórki
    var html = '<div class="adv-growth-result-block adv-growth-result-block--trajectory"><div class="vta">';
    html += '<p class="vta-title"><strong>Automatyczna analiza trajektorii (siatka centylowa)</strong></p>';
    model.metrics.forEach(function (m) { html += metricSummaryHtml(hideRedFlag ? withoutRedFlag(m) : m); });
    html += velocityHtml(model.velocity);
    html += delayedPubertyHtml(model, 'vta-warn');
    html += segmentsTableHtml(model);
    html += '<p class="vta-note">Analiza przesiewowa: progi i słownik werdyktów identyczne z panelem porównania A→B na siatkach oraz alarmami karty; nie zastępuje oceny klinicznej.</p>';
    html += '</div></div>';
    return html;
  }

  function withoutRedFlag(m) {
    if (!m || !m.redFlag) return m;
    var c = {};
    for (var k in m) c[k] = m[k];
    c.redFlag = null;
    return c;
  }

  function analyzeAndRenderHtml(input, opts) {
    try {
      var model = analyze(input);
      return model ? buildHtml(model, opts) : '';
    } catch (e) {
      return '';
    }
  }

  // ── Renderer dla Karty pacjenta — język wizualny panelu „Porównanie pomiarów" (.vilda-cmp-*) ──

  var PSTYLE_ID = 'vtap-style';
  var PCSS = [
    '.vtap{margin:12px 2px 2px;background:#fff;border:1px solid #e3ecec;border-radius:14px;overflow:hidden}',
    '.vtap summary{list-style:none;cursor:pointer}',
    '.vtap summary::-webkit-details-marker{display:none}',
    '.vtap .vtap-h{font-size:13px;margin:0;padding:11px 14px;background:linear-gradient(90deg,#0a6b73,#00838d);color:#fff;display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-weight:800;flex-wrap:wrap}',
    '.vtap .vtap-h .sub{font-size:11px;font-weight:500;opacity:.92}',
    '.vtap .vtap-h .tg{font-size:10.5px;font-weight:700;background:rgba(255,255,255,.16);border-radius:999px;padding:1px 9px}',
    '.vtap .vtap-h .tg::after{content:"zwiń ▾"}',
    '.vtap details:not([open])>summary .tg::after{content:"rozwiń ▸"}',
    '.vtap .vtap-ctx{padding:8px 14px;background:#f2f9f9;border-bottom:1px solid #e3ecec;font-size:11.5px;font-weight:600;color:#39555b;display:flex;gap:12px;flex-wrap:wrap}',
    '.vtap .vtap-flag{padding:9px 14px;background:#fdecea;border-bottom:1px solid #f6d4d0;font-size:12px;font-weight:700;color:#b71c1c;line-height:1.45}',
    '.vtap .vtap-row{padding:9px 14px;border-top:1px solid #eef4f4}',
    '.vtap .vtap-row:first-of-type{border-top:0}',
    '.vtap .vtap-pm{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}',
    '.vtap .vtap-pm .nm{font-size:12.5px;font-weight:800;color:#0d5a61;min-width:52px}',
    '.vtap .vtap-pm .sp{flex:0 0 92px}',
    '.vtap .vtap-ft{font-size:12.5px;margin-top:3px;color:#243b40;font-variant-numeric:tabular-nums}',
    '.vtap .vtap-ft .c{color:#5a7274;font-size:11.5px}',
    '.vtap .vtap-ft .ar{color:#9aabb0;margin:0 5px}',
    '.vtap .vtap-seg{font-size:11.5px;color:#4a6168;margin-top:4px}',
    '.vtap .vtap-chip{display:inline-flex;align-items:center;font-size:11px;font-weight:700;padding:2px 9px;border-radius:999px;white-space:normal;min-width:0;line-height:1.35;text-align:left}',
    '.vtap .vtap-chip.vg{background:#e7f6ef;color:#0f6e56}',
    '.vtap .vtap-chip.vs{background:#eef2f4;color:#3f5459}',
    '.vtap .vtap-chip.vw{background:#fdf1e5;color:#c75d00}',
    '.vtap .vtap-chip.vb{background:#fdecea;color:#c62828}',
    '.vtap .vtap-det>summary{padding:9px 14px;background:#f7fbfb;border-top:1px solid #eef4f4;font-size:11.5px;font-weight:800;color:#0a6b73}',
    '.vtap .vtap-det>summary::before{content:"▸ "}',
    '.vtap .vtap-det[open]>summary::before{content:"▾ "}',
    '.vtap .vtap-tb{padding:4px 14px 12px;overflow-x:auto}',
    '.vtap .vtap-tb table{width:100%;border-collapse:collapse;font-size:12px;min-width:430px;font-variant-numeric:tabular-nums}',
    '.vtap .vtap-tb th{font-size:10px;letter-spacing:.05em;text-transform:uppercase;background:#00b0a6;color:#fff;font-weight:800;text-align:left;padding:6px 8px}',
    '.vtap .vtap-tb th:first-child{border-radius:8px 0 0 8px}',
    '.vtap .vtap-tb th:last-child{border-radius:0 8px 8px 0}',
    '.vtap .vtap-tb td{padding:6px 8px;border-bottom:1px solid #eef4f4;white-space:nowrap}',
    '.vtap .vtap-tb td:last-child{white-space:normal;min-width:190px;line-height:1.35}',
    '.vtap .vtap-foot{padding:9px 14px;background:#f7fbfb;border-top:1px solid #eef4f4;font-size:11px;color:#5a7274;line-height:1.45}'
  ].join('\n');

  function ensurePatientStyle() {
    try {
      var d = w.document;
      if (!d || d.getElementById(PSTYLE_ID)) return;
      var st = d.createElement('style');
      st.id = PSTYLE_ID;
      st.textContent = PCSS;
      (d.head || d.documentElement).appendChild(st);
    } catch (e) { /* brak DOM (test) */ }
  }

  var CHIP_CLS = { good: 'vg', stable: 'vs', warn: 'vw', bad: 'vb' };

  // Pasek kontekstu klinicznego (jak vilda-cmp-ctx panelu porównania) + legenda znaczników odcinków.
  function contextStripHtml(ctx) {
    if (!ctx) return '';
    var items = [];
    if (typeof ctx.mpSds === 'number' && isFinite(ctx.mpSds)) items.push('🧬 kanał rodzicielski (MPH): SDS ' + esc(fmtS(ctx.mpSds)));
    if (ctx.gh) items.push('💉 terapia GH: od ' + esc(fmtAgeM(ctx.gh.a)) + (ctx.gh.b != null ? ' do ' + esc(fmtAgeM(ctx.gh.b)) : ' — nadal') + ' (odcinki: 💉)');
    if (ctx.red) items.push('⬇ zamierzona redukcja' + (ctx.red.label ? ' (' + esc(ctx.red.label) + ')' : '') + ': od ' + esc(fmtAgeM(ctx.red.a)) + (ctx.red.b != null ? ' do ' + esc(fmtAgeM(ctx.red.b)) : ' — nadal') + ' (odcinki: ⬇)');
    var TROMAN = ['I', 'II', 'III', 'IV', 'V'];
    if (ctx.tannerStage != null) items.push('Tanner ' + esc(TROMAN[ctx.tannerStage - 1] || String(ctx.tannerStage))
      + (ctx.tannerAtAgeMonths != null ? ' (z zapisu w wieku ' + esc(fmtAgeM(ctx.tannerAtAgeMonths)) + ')' : ''));
    else if (ctx.tannerStale && ctx.tannerStaleStage != null) items.push('Tanner ' + esc(TROMAN[ctx.tannerStaleStage - 1] || String(ctx.tannerStaleStage))
      + ' (z zapisu w wieku ' + esc(fmtAgeM(ctx.tannerAtAgeMonths)) + ' — nieaktualny, pominięty w ocenie)');
    if (ctx.boneAge) items.push('wiek kostny: ' + esc(fmtAgeM(ctx.boneAge.baMonths)) + (ctx.boneAge.atAgeMonths != null ? ' (oznaczony w wieku ' + esc(fmtAgeM(ctx.boneAge.atAgeMonths)) + ')' : ''));
    if (!items.length) return '';
    return '<div class="vtap-ctx"><span>' + items.join('</span><span>') + '</span></div>';
  }

  function chipHtml(v) {
    if (!v) return '';
    return '<span class="vtap-chip ' + (CHIP_CLS[v.t] || 'vs') + '">' + esc(v.l) + '</span>';
  }

  // Miniatura trendu SDS: polilinia z wyróżnioną ostatnią kropką (czysto poglądowa, bez osi).
  function sparklineSvg(series, tone) {
    if (!series || series.length < 2) return '';
    var xs = series.map(function (p) { return p.ageMonths; });
    var ys = series.map(function (p) { return p.sd; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    var xr = x1 - x0 || 1, yr = (y1 - y0) < 0.4 ? 0.4 : (y1 - y0);
    var ym = (y0 + y1) / 2;
    var pts = series.map(function (p) {
      var x = 4 + 84 * (p.ageMonths - x0) / xr;
      var y = 11 - 16 * (p.sd - ym) / yr;
      return { x: Math.round(x * 10) / 10, y: Math.round(Math.max(2, Math.min(20, y)) * 10) / 10 };
    });
    var line = tone === 'danger' ? '#d98a80' : tone === 'warn' ? '#dcb27a' : tone === 'good' ? '#8cc3ab' : '#8fb6ba';
    var dot = tone === 'danger' ? '#c62828' : tone === 'warn' ? '#c75d00' : tone === 'good' ? '#0f6e56' : '#0a6b73';
    var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + p.x + ',' + p.y; }).join(' ');
    var last = pts[pts.length - 1];
    return '<svg viewBox="0 0 92 22" width="92" height="22" aria-hidden="true">'
      + '<path d="' + d + '" fill="none" stroke="' + line + '" stroke-width="1.6"/>'
      + '<circle cx="' + last.x + '" cy="' + last.y + '" r="2.6" fill="' + dot + '"/></svg>';
  }

  // Kolor sparkline'a = werdykt wiersza (ten sam, który zasila chip) — jedno źródło prawdy
  // koloru w wierszu (decyzja właściciela 2026-08-14). Pozycja centylowa (m.tone) zostaje
  // wyłącznie jako fallback, gdy wiersz nie ma werdyktu (np. za krótki okres obserwacji).
  var VERDICT_TONE = { bad: 'danger', warn: 'warn', good: 'good', stable: 'normal' };

  function rowTone(m) {
    var v = m.treatment ? m.treatment.verdict : m.total;
    return (v && VERDICT_TONE[v.t]) || m.tone;
  }

  function patientMetricRowHtml(m) {
    var html = '<div class="vtap-row"><div class="vtap-pm">'
      + '<span class="nm">' + esc(m.title) + '</span>'
      + '<span class="sp">' + sparklineSvg(m.series, rowTone(m)) + '</span>'
      + chipHtml(m.treatment ? m.treatment.verdict : m.total) + '</div>'
      + '<div class="vtap-ft">' + esc(fmt(m.first.value, m.dec) + (m.unit ? ' ' + m.unit : ''))
      + ' <span class="c">(' + esc(fmtC(m.first.c)) + 'c)</span><span class="ar">→</span>'
      + esc(fmt(m.last.value, m.dec) + (m.unit ? ' ' + m.unit : ''))
      + ' <span class="c">(' + esc(fmtC(m.last.c)) + 'c)</span>'
      + ' <span class="c">· SDS ' + esc(fmtS(m.first.sd) + ' → ' + fmtS(m.last.sd)) + '</span></div>';
    if (m.treatment) {
      html += '<div class="vtap-seg">↳ okres leczenia (od ' + esc(fmtAgeM(m.treatment.a.ageMonths)) + '): ΔSDS '
        + esc(fmtS(m.treatment.dSds)) + ' — ' + esc(m.treatment.verdict.l) + '</div>';
    }
    if (m.worst && m.worst.verdict && (m.worst.verdict.t === 'bad' || m.worst.verdict.t === 'warn') && m.segments.length > 1) {
      html += '<div class="vtap-seg">↳ najpoważniejszy odcinek: ' + esc(fmtAgeM(m.worst.a.ageMonths)) + ' → '
        + esc(fmtAgeM(m.worst.b.ageMonths)) + ' (ΔSDS ' + esc(fmtS(m.worst.dSds)) + ') — ' + esc(m.worst.verdict.l) + '</div>';
    }
    return html + '</div>';
  }

  var CHIP_BY_CLS = { bad: 'vb', warn: 'vw', good: 'vg', stable: 'vs' };

  function patientVelocityRowHtml(vel) {
    if (!vel) return '';
    var ctx = vel.gapM != null ? ' <span class="c">(ostatnich ' + Math.round(vel.gapM) + ' mies.)</span>' : '';
    var a = velocityAssessment(vel);
    var chip = a ? '<span class="vtap-chip ' + (CHIP_BY_CLS[a.cls] || 'vs') + '">' + esc(a.text) + '</span>'
      : '<span class="vtap-chip vs">poza oknem oceny normy</span>';
    return '<div class="vtap-row"><div class="vtap-pm"><span class="nm">Tempo</span>'
      + '<span class="vtap-ft" style="margin:0;flex:1">' + esc(fmt(vel.cmPerYear, 1)) + ' cm/rok' + ctx + '</span>'
      + chip + '</div></div>';
  }

  function patientSegmentsHtml(model) {
    var rows = '', count = 0;
    model.metrics.forEach(function (m) {
      m.segments.forEach(function (s) {
        count += 1;
        var mark = s.ghOn ? ' 💉' : s.rdOn ? ' ⬇' : '';
        rows += '<tr><td>' + esc(m.title) + '</td>'
          + '<td>' + esc(fmtAgeM(s.a.ageMonths) + ' → ' + fmtAgeM(s.b.ageMonths)) + mark + '</td>'
          + '<td>' + esc(fmtC(s.a.c) + 'c → ' + fmtC(s.b.c) + 'c') + '</td>'
          + '<td>' + esc(fmtS(s.a.sd) + ' → ' + fmtS(s.b.sd)) + '</td>'
          + '<td>' + (s.verdict ? chipHtml(s.verdict) : '<span class="vtap-chip vs">odstęp &lt;' + P.SEGMENT_MIN_GAP_M + ' mies.</span>') + '</td></tr>';
      });
    });
    if (!rows) return '';
    return '<details class="vtap-det"><summary>Szczegóły odcinków trajektorii (' + count + ')</summary>'
      + '<div class="vtap-tb"><table><thead><tr><th>Parametr</th><th>Odcinek</th><th>Centyle</th><th>SDS</th><th>Werdykt</th></tr></thead>'
      + '<tbody>' + rows + '</tbody></table></div></details>';
  }

  function buildPatientHtml(model, opts) {
    if (!model || !model.metrics || !model.metrics.length) return '';
    ensurePatientStyle();
    var open = !(opts && opts.collapsed);
    var hideRedFlag = !!(opts && opts.hideRedFlag); // karty: flagę niesie baner (PR #68) — bez powtórki
    var sub = fmt(model.points[0].ageMonths / 12, 1) + ' → ' + fmt(model.points[model.points.length - 1].ageMonths / 12, 1)
      + ' r.ż. · ' + model.points.length + ' pomiar' + (model.points.length === 1 ? '' : model.points.length < 5 ? 'y' : 'ów')
      + (model.source ? ' · źródło: ' + model.source : '');
    var html = '<details class="vtap-main"' + (open ? ' open' : '') + '>'
      + '<summary class="vtap-h"><span>Analiza trajektorii</span><span class="sub">' + esc(sub) + '</span><span class="tg"></span></summary>';
    html += contextStripHtml(model.context);
    hideRedFlag || model.metrics.forEach(function (m) {
      if (m.redFlag) {
        html += '<div class="vtap-flag">⚠ Istotne obniżenie pozycji centylowej wzrostu (ΔhSDS '
          + esc(fmtS(m.redFlag.dSds)) + ' względem pomiaru z wieku ' + esc(fmtAgeM(m.redFlag.baseAgeMonths))
          + ') — obraz deceleracji wzrastania, wskazana ocena endokrynologiczna</div>';
      }
    });
    model.metrics.forEach(function (m) { html += patientMetricRowHtml(m); });
    html += patientVelocityRowHtml(model.velocity);
    if (model.delayedPuberty) {
      html += '<div class="vtap-row"><span class="vtap-chip vw">Tanner I &gt;' + (model.sex === 'M' ? '14' : '13')
        + ' lat — obraz opóźnionego dojrzewania, wskazana ocena</span></div>';
    }
    html += patientSegmentsHtml(model);
    html += '<div class="vtap-foot">Analiza przesiewowa: progi i słownik identyczne z panelem „Porównanie pomiarów" i alarmami kart wzrostowych. Nie zastępuje oceny klinicznej.</div>';
    html += '</details>';
    return html;
  }

  var COLLAPSE_KEY = 'vildaTrajectoryPanelCollapsed';

  // Stan zwijania per użytkownik (localStorage; domyślnie rozwinięty) — wspólny dla Karty pacjenta
  // i karty „Zaawansowane obliczenia wzrostowe".
  function isPanelCollapsed() {
    try { return !!(w.localStorage && w.localStorage.getItem(COLLAPSE_KEY) === '1'); } catch (e) { return false; }
  }

  // Wpina zapamiętywanie zwijania na pierwszym .vtap-main w podanym elemencie (idempotentnie).
  function wirePanelToggle(scope) {
    try {
      if (!scope || typeof scope.querySelector !== 'function') return false;
      var main = scope.querySelector('.vtap-main');
      if (!main || main._vtaWired) return false;
      main._vtaWired = true;
      main.addEventListener('toggle', function () {
        try { w.localStorage && w.localStorage.setItem(COLLAPSE_KEY, main.open ? '0' : '1'); } catch (e2) { /* prywatny tryb */ }
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  // Panel trajektorii dla karty „Zaawansowane obliczenia wzrostowe" (hybryda zaakceptowana
  // 2026-08-08): ten sam renderer co w Karcie pacjenta, opakowany w blok wynikowy karty;
  // flaga pozostaje w banerze karty (hideRedFlag), stan zwijania wspólny (domyślnie rozwinięty).
  function buildCardPanelHtml(model, opts) {
    var o = opts || {};
    var html = buildPatientHtml(model, {
      collapsed: o.collapsed != null ? o.collapsed : isPanelCollapsed(),
      hideRedFlag: o.hideRedFlag != null ? o.hideRedFlag : true
    });
    if (!html) return '';
    return '<div class="adv-growth-result-block adv-growth-result-block--trajectory"><div class="vtap">' + html + '</div></div>';
  }

  // Montuje panel w Karcie pacjenta: przed pierwszym elementem `beforeSelector` (domyślnie panel
  // porównania), z pamięcią zwinięcia per użytkownik (localStorage — nie dotyka danych pacjenta).
  function renderPatientPanel(container, input, opts) {
    try {
      if (!container || typeof container.appendChild !== 'function') return null;
      var doc = container.ownerDocument || (w.document || null);
      var old = container.querySelector ? container.querySelector('.vtap') : null;
      if (old && old.parentNode) old.parentNode.removeChild(old);
      var model = analyze(input);
      if (!model) return null;
      var html = buildPatientHtml(model, { collapsed: isPanelCollapsed() });
      if (!html || !doc) return null;
      var host = doc.createElement('div');
      host.className = 'vtap';
      host.innerHTML = html;
      var beforeSel = (opts && opts.before) || '.vilda-cmp-panel';
      var ref = null;
      try { ref = container.querySelector(beforeSel); } catch (e1) { ref = null; }
      if (ref && ref.parentNode === container) container.insertBefore(host, ref);
      else container.appendChild(host);
      wirePanelToggle(host);
      return model;
    } catch (e) {
      return null;
    }
  }

  w.VildaTrajectoryAnalysis = {
    version: VERSION,
    PARAMS: P,
    statFor: statFor,
    verdictForPair: verdictForPair,
    verdictForPairCtx: verdictForPairCtx,
    weightBmiOverlayVerdict: weightBmiOverlayVerdict,
    heightPositionOverlayVerdict: heightPositionOverlayVerdict,
    zoneForPair: zoneForPair,
    zoneLabel: zoneLabel,
    chan: chan,
    toneCent: toneCent,
    buildPoints: buildPoints,
    assessVelocityValue: assessVelocityValue,
    analyze: analyze,
    buildHtml: buildHtml,
    buildCardAlertsHtml: buildCardAlertsHtml,
    analyzeAndRenderHtml: analyzeAndRenderHtml,
    buildPatientHtml: buildPatientHtml,
    buildCardPanelHtml: buildCardPanelHtml,
    isPanelCollapsed: isPanelCollapsed,
    wirePanelToggle: wirePanelToggle,
    renderPatientPanel: renderPatientPanel
  };
})(typeof window !== 'undefined' ? window : globalThis);
