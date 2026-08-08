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
 *    dla wieku >10 lat brak progu (świadoma luka okresu pokwitania) — moduł jedynie to komunikuje.
 * Jedyny własny parametr to strażnik jakości danych SEGMENT_MIN_GAP_M (odcinki krótsze niż 3 mies.
 * są pokazywane, ale bez werdyktu — annualizacja/ocena tak krótkich odstępów jest niestabilna).
 */
(function (w) {
  'use strict';

  var VERSION = '1';

  // ── Parametry (odwzorowane z istniejących progów aplikacji — patrz nagłówek) ──
  var P = {
    SEGMENT_MIN_GAP_M: 3,
    REDFLAG_DSDS: -1.0,
    REDFLAG_BASE_MIN_M: 24,
    CLINES: [3, 10, 25, 50, 75, 90, 97],
    CHN: ['<3', '3–10', '10–25', '25–50', '50–75', '75–90', '90–97', '>97']
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
    var d = Math.round(100 * (sb0 - sa0)) / 100, W = met === 'height', low = ca < 10, high = W ? ca > 90 : ca >= (met === 'bmi' ? 85 : 90);
    if (low) return d >= 0.2 ? { t: 'good', l: 'nadrabia niedobór' } : d <= -0.5 ? { t: 'bad', l: 'pogłębia niedobór' } : d <= -0.2 ? { t: 'warn', l: 'pogłębia niedobór' } : { t: 'stable', l: 'stabilnie' };
    if (high) {
      if (W) return d <= -1 ? { t: 'warn', l: 'szybki spadek kanału' } : d <= -0.2 ? { t: 'stable', l: 'normalizacja' } : d >= 0.5 ? { t: 'warn', l: 'coraz wyżej ponad normą' } : { t: 'stable', l: 'stabilnie' };
      if (d <= -1.5) return { t: 'warn', l: 'bardzo szybki spadek' };
      if (d <= -0.2) return { t: 'good', l: 'redukcja' };
      if (d >= 0.5 || (d >= 0.2 && cb >= 97)) return { t: 'bad', l: met === 'bmi' ? (cb >= 97 ? (ca >= 97 ? 'otyłość pogłębia się' : 'wchodzi w otyłość') : 'szybko narasta nadmiar') : (cb >= 97 ? (ca >= 97 ? 'nadmiar pogłębia się (>97c)' : 'wchodzi w strefę ≥97') : 'szybko narasta nadmiar') };
      return d >= 0.2 ? { t: 'warn', l: 'narasta nadmiar' } : { t: 'stable', l: 'stabilnie' };
    }
    if (W) return d <= -1 ? { t: 'bad', l: 'łamie kanał w dół' } : d <= -0.5 ? { t: 'warn', l: 'łamie kanał w dół' } : (d >= 0.5 && cb > 97) ? { t: 'warn', l: 'ponad 97 centyl' } : { t: 'stable', l: 'stabilnie' };
    if (Math.abs(d) >= 0.5) {
      var al = met === 'bmi' ? (cb >= 97 || cb < 5) : (cb <= 3 || cb >= 97);
      return al ? { t: 'bad', l: d > 0 ? (met === 'bmi' ? 'wchodzi w otyłość' : 'wchodzi w strefę ≥97') : (met === 'bmi' ? 'wchodzi w niedowagę' : 'wchodzi w strefę <3') } : { t: 'warn', l: d > 0 ? 'szybko w górę na siatce' : 'szybko w dół na siatce' };
    }
    return { t: 'stable', l: 'stabilnie' };
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

  function analyzeMetric(met, pts, sex, source) {
    var series = [];
    pts.forEach(function (p) {
      var v = p[met.key];
      if (v == null) return;
      var st = statFor(met.param, v, sex, p.ageYears, source);
      if (!st) return;
      series.push({ ageMonths: p.ageMonths, ageYears: p.ageYears, value: v, c: st.percentile, sd: st.sd, isCurrent: p.isCurrent });
    });
    if (series.length < 2) return null;

    var segments = [];
    for (var i = 0; i < series.length - 1; i++) {
      var a = series[i], b = series[i + 1];
      var gapM = b.ageMonths - a.ageMonths;
      var dSds = Math.round(100 * (b.sd - a.sd)) / 100;
      segments.push({
        a: a, b: b, gapM: gapM,
        dVal: b.value - a.value,
        dSds: dSds,
        zone: zoneForPair(a.c, b.c, a.sd, b.sd),
        verdict: gapM >= P.SEGMENT_MIN_GAP_M ? verdictForPair(met.key, a.sd, b.sd, a.c, b.c) : null
      });
    }

    var first = series[0], last = series[series.length - 1];
    var total = (last.ageMonths - first.ageMonths) >= P.SEGMENT_MIN_GAP_M
      ? verdictForPair(met.key, first.sd, last.sd, first.c, last.c) : null;

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

    return {
      metric: met.key, title: met.title, unit: met.unit, dec: met.dec,
      series: series, segments: segments,
      first: first, last: last, total: total, worst: worst, redFlag: redFlag,
      tone: toneCent(met.key, last.c)
    };
  }

  // ── Tempo wzrastania — identyczna logika doboru okna i progu jak karta zaawansowana ──

  function heightVelocity(pts, currentAgeMonths) {
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
      var thr = typeof w.getVelocityThreshold === 'function' ? w.getVelocityThreshold(target) : null;
      var slow = !!(thr && usedLastYear && v < thr.threshold);
      return {
        cmPerYear: v, gapM: gapM, usedLastYear: usedLastYear,
        threshold: thr, slow: slow,
        aboveNormAge: !thr && target / 12 >= 10
      };
    } catch (e) {
      return null;
    }
  }

  // ── Analiza całości ──

  function analyze(input) {
    if (!input || typeof input !== 'object') return null;
    var sex = sexMK(input.sex);
    var source = input.source != null ? input.source : (typeof w.bmiSource !== 'undefined' ? w.bmiSource : null);
    var pts = buildPoints(input);
    if (pts.length < 2) return null;
    var metrics = [];
    METRICS.forEach(function (met) {
      var m = analyzeMetric(met, pts, sex, source);
      if (m) metrics.push(m);
    });
    if (!metrics.length) return null;
    return {
      version: VERSION,
      sex: sex,
      source: source != null ? String(source).toUpperCase() : null,
      points: pts,
      metrics: metrics,
      velocity: heightVelocity(pts, input.currentAgeMonths)
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

  function metricSummaryHtml(m) {
    var line = '<p><span class="vta-lbl">' + esc(m.title) + ':</span> '
      + esc(fmt(m.first.value, m.dec) + (m.unit ? ' ' + m.unit : '') + ' → ' + fmt(m.last.value, m.dec) + (m.unit ? ' ' + m.unit : ''))
      + ' · ' + esc(fmtC(m.first.c) + 'c → ' + fmtC(m.last.c) + 'c')
      + ' (' + esc(zoneForPair(m.first.c, m.last.c, m.first.sd, m.last.sd)) + ')'
      + ' · SDS ' + esc(fmtS(m.first.sd) + ' → ' + fmtS(m.last.sd))
      + ' — ' + vSpan(m.total) + '</p>';
    if (m.redFlag) {
      line += '<p class="vta-red">⚠ Wzrost: przekroczenie kanałów centylowych w dół '
        + '(ΔhSDS ' + esc(fmtS(m.redFlag.dSds)) + ' względem pomiaru z wieku ' + esc(fmtAgeM(m.redFlag.baseAgeMonths)) + ')</p>';
    }
    if (m.worst && m.worst.verdict && (m.worst.verdict.t === 'bad' || m.worst.verdict.t === 'warn') && m.segments.length > 1) {
      line += '<p>↳ najpoważniejszy odcinek: ' + esc(fmtAgeM(m.worst.a.ageMonths)) + ' → ' + esc(fmtAgeM(m.worst.b.ageMonths))
        + ' (ΔSDS ' + esc(fmtS(m.worst.dSds)) + ') — ' + vSpan(m.worst.verdict) + '</p>';
    }
    return line;
  }

  function velocityHtml(vel) {
    if (!vel) return '';
    var ctx = vel.gapM != null ? ' (ostatnich ' + Math.round(vel.gapM) + ' mies.)' : '';
    var txt = '<span class="vta-lbl">Tempo wzrastania:</span> ' + esc(fmt(vel.cmPerYear, 1)) + ' cm/rok' + esc(ctx);
    if (vel.slow) {
      txt += ' — <span class="vta-bad">poniżej normy' + (vel.threshold && vel.threshold.label ? ' (' + esc(vel.threshold.label) + ')' : '') + '</span>';
    } else if (vel.threshold && vel.usedLastYear) {
      txt += ' — <span class="vta-good">w normie' + (vel.threshold.label ? ' (' + esc(vel.threshold.label) + ')' : '') + '</span>';
    } else if (vel.aboveNormAge) {
      txt += ' <span class="vta-stable">— normy tempa dla wieku >10 lat nie są oceniane automatycznie (okres pokwitania)</span>';
    } else if (!vel.usedLastYear) {
      txt += ' <span class="vta-stable">— odstęp pomiarów poza oknem oceny, bez porównania z normą</span>';
    }
    return '<p>' + txt + '</p>';
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

  function buildHtml(model) {
    if (!model || !model.metrics || !model.metrics.length) return '';
    ensureStyle();
    var html = '<div class="adv-growth-result-block adv-growth-result-block--trajectory"><div class="vta">';
    html += '<p class="vta-title"><strong>Automatyczna analiza trajektorii (siatka centylowa)</strong></p>';
    model.metrics.forEach(function (m) { html += metricSummaryHtml(m); });
    html += velocityHtml(model.velocity);
    html += segmentsTableHtml(model);
    html += '<p class="vta-note">Analiza przesiewowa: progi i słownik werdyktów identyczne z panelem porównania A→B na siatkach oraz alarmami karty; nie zastępuje oceny klinicznej.</p>';
    html += '</div></div>';
    return html;
  }

  function analyzeAndRenderHtml(input) {
    try {
      var model = analyze(input);
      return model ? buildHtml(model) : '';
    } catch (e) {
      return '';
    }
  }

  w.VildaTrajectoryAnalysis = {
    version: VERSION,
    PARAMS: P,
    statFor: statFor,
    verdictForPair: verdictForPair,
    zoneForPair: zoneForPair,
    zoneLabel: zoneLabel,
    chan: chan,
    toneCent: toneCent,
    buildPoints: buildPoints,
    analyze: analyze,
    buildHtml: buildHtml,
    analyzeAndRenderHtml: analyzeAndRenderHtml
  };
})(typeof window !== 'undefined' ? window : globalThis);
