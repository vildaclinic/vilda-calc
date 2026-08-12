/*
 * Droga do normy 2.0 — interaktywny panel „dieta + ruch" karty „Droga do normy BMI".
 * Prezentacja wg makiety zatwierdzonej 2026-08-12: wyśrodkowany nagłówek celu,
 * przełącznik „Połącz z planem diety", chipy diet (z produkcyjnego silnika
 * Planu odchudzania) i dawek ruchu (MET × masa), tabela wkładów budowana
 * z wyboru, przewidywany termin osiągnięcia normy (miesiące zaokrąglane do 0,5)
 * i oś czasu „sama dieta / dieta + ruch". Dotyczy trybu redukcyjnego ≥ 5 lat;
 * młodsze dzieci obsługuje vilda_update_prep.js (etap 1 przeglądu).
 */
(function (w, d) {
  'use strict';
  if (!w || w.VildaBmiJourney) return;

  var VERSION = '1.1.0';
  var STORAGE_KEY = 'vildaBmiJourneyState';
  var KCAL_PER_KG_FALLBACK = 7700;

  // Tygodniowe dawki ruchu: klucz z biblioteki MET (vilda_food_data.js) + minuty/tydzień.
  var MOVES = [
    { id: 'walk', minWeek: 210, chip: '🚶 spacer 30 min/d', row: '🚶 Spacer 30 min/d' },
    { id: 'bike', minWeek: 90, chip: '🚴 rower 2×45 min', row: '🚴 Rower 2×45 min' },
    { id: 'swim', minWeek: 45, chip: '🏊 basen 1×45 min', row: '🏊 Basen 1×45 min' },
    { id: 'dance', minWeek: 60, chip: '💃 taniec 1×60 min', row: '💃 Taniec 1×60 min' },
    { id: 'run', minWeek: 90, chip: '🏃 bieganie 3×30 min', row: '🏃 Bieganie 3×30 min' }
  ];
  var MONTHS_LOC = ['w styczniu', 'w lutym', 'w marcu', 'w kwietniu', 'w maju', 'w czerwcu',
    'w lipcu', 'w sierpniu', 'we wrześniu', 'w październiku', 'w listopadzie', 'w grudniu'];

  var state = loadState();
  var lastCtx = null;

  function kcalPerKg() {
    return typeof w.KCAL_PER_KG === 'number' && isFinite(w.KCAL_PER_KG) && w.KCAL_PER_KG > 0
      ? w.KCAL_PER_KG : KCAL_PER_KG_FALLBACK;
  }
  function esc(v) {
    return w.VildaHtml && typeof w.VildaHtml.escapeHtml === 'function'
      ? w.VildaHtml.escapeHtml(v)
      : String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function setHtml(el, html, context) {
    if (!el) return false;
    if (w.VildaHtml && typeof w.VildaHtml.setTrustedHtml === 'function') {
      return w.VildaHtml.setTrustedHtml(el, html, { context: context || 'bmi-journey' });
    }
    el.innerHTML = html;
    return true;
  }
  function fin(v) { return typeof v === 'number' && isFinite(v); }
  function fmt(v, dec) { return Number(v).toFixed(dec).replace('.', ','); }
  function fmtInt(v) {
    var n = Math.round(Number(v) || 0);
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }
  function weeksToMonthsHalf(weeks) { return Math.round((weeks * 12 / 52) * 2) / 2; }
  function monthsWord(m) {
    if (m % 1 !== 0) return fmt(m, 1) + ' miesiąca';
    if (m === 1) return '1 miesiąc';
    var r = m % 10, c = m % 100;
    return (r >= 2 && r <= 4 && (c < 12 || c > 14)) ? m + ' miesiące' : m + ' miesięcy';
  }
  function monthsShort(m) { return (m % 1 !== 0 ? fmt(m, 1) : String(m)) + ' mies.'; }
  function dateAfterWeeks(weeks) {
    var dt = new Date();
    dt.setDate(dt.getDate() + Math.round(weeks * 7));
    return MONTHS_LOC[dt.getMonth()] + ' ' + dt.getFullYear();
  }

  function loadState() {
    var fallback = { dietOn: true, dietKey: null, moves: { walk: true } };
    try {
      var raw = w.localStorage && w.localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return fallback;
      return {
        dietOn: parsed.dietOn !== false,
        dietKey: typeof parsed.dietKey === 'string' ? parsed.dietKey : null,
        moves: parsed.moves && typeof parsed.moves === 'object' ? parsed.moves : { walk: true }
      };
    } catch (err) { return fallback; }
  }
  function saveState() {
    try { w.localStorage && w.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (err) { /* prywatny tryb — stan tylko w pamięci */ }
  }

  // Diety z produkcyjnego silnika Planu odchudzania (deficyty, minima kaloryczne, dziecko/dorosły).
  function resolveDiets(ctx) {
    if (typeof w.energyBuildPlanReductionState !== 'function') return [];
    try {
      var palEl = d.getElementById('palFactor');
      var st = w.energyBuildPlanReductionState({
        ageYears: ctx.ageYears,
        ageMonthsOpt: 0,
        sex: ctx.sex,
        weightKg: ctx.weightKg,
        heightCm: ctx.heightCm,
        palInput: palEl ? palEl.value : null
      });
      return st && Array.isArray(st.diets) ? st.diets : [];
    } catch (err) { return []; }
  }
  function moveKcalWeek(moveId, weightKg) {
    if (typeof w.activityGetDefinition !== 'function' || typeof w.activityBurnPerMinuteKcal !== 'function') return 0;
    var def = w.activityGetDefinition(moveId);
    if (!def) return 0;
    var move = null;
    for (var i = 0; i < MOVES.length; i += 1) if (MOVES[i].id === moveId) move = MOVES[i];
    if (!move) return 0;
    return w.activityBurnPerMinuteKcal(def.MET, weightKg) * move.minWeek;
  }
  function yearlyBadge(ctx) {
    if (!state.moves.walk || typeof w.activityGetDefinition !== 'function') return '';
    var def = w.activityGetDefinition('walk');
    if (!def || !fin(def.speedKmh)) return '';
    var km = (210 * 52 / 60) * def.speedKmh;
    var route = typeof w.activityFindRouteExample === 'function' ? w.activityFindRouteExample(km) : null;
    var routeTxt = route ? ' — porównywalny z trasą ' + esc(route.miasta) + ' (' + fmtInt(route.km) + ' km)' : '';
    return '<div class="bmi-journey-badge">🏅 Rok spacerów 30 min dziennie to ok. ' + fmtInt(km) + ' km' + routeTxt + '.</div>';
  }

  function computeModel(ctx) {
    var diets = resolveDiets(ctx);
    var dietAvailable = diets.length > 0;
    var dietKey = state.dietKey;
    var found = null;
    for (var i = 0; i < diets.length; i += 1) if (diets[i].key === dietKey) found = diets[i];
    if (!found) {
      var preferred = ctx.isChild ? 'light' : 'moderate';
      for (var j = 0; j < diets.length; j += 1) if (diets[j].key === preferred) found = diets[j];
      if (!found && diets.length) found = diets[0];
      dietKey = found ? found.key : null;
    }
    var dietOn = state.dietOn && dietAvailable;
    var deficitDay = dietOn && found ? found.deficit : 0;
    var rows = [];
    if (dietOn && found) {
      rows.push({ name: '🍽 Dieta ' + found.name, kcalWeek: deficitDay * 7 });
    }
    var moveWeek = 0;
    for (var k = 0; k < MOVES.length; k += 1) {
      if (state.moves[MOVES[k].id]) {
        var kcal = moveKcalWeek(MOVES[k].id, ctx.weightKg);
        if (kcal > 0) {
          moveWeek += kcal;
          rows.push({ name: MOVES[k].row, kcalWeek: kcal });
        }
      }
    }
    var totalWeek = deficitDay * 7 + moveWeek;
    var kk = kcalPerKg();
    var weeksCombo = totalWeek > 0 ? Math.ceil(ctx.kgToLose * kk / totalWeek) : null;
    var weeksDiet = dietOn && deficitDay > 0 ? Math.ceil(ctx.kgToLose * kk / (deficitDay * 7)) : null;
    return {
      diets: diets, dietAvailable: dietAvailable, dietOn: dietOn, dietKey: dietKey,
      rows: rows, moveWeek: moveWeek, totalWeek: totalWeek,
      weeksCombo: weeksCombo, weeksDiet: weeksDiet
    };
  }

  function renderRows(model) {
    if (!model.rows.length) {
      return '<tr class="bmi-journey-placeholder"><td colspan="3">Zaznacz dietę lub aktywność, żeby zobaczyć wkład w cel.</td></tr>';
    }
    var kk = kcalPerKg();
    var html = '';
    for (var i = 0; i < model.rows.length; i += 1) {
      var r = model.rows[i];
      html += '<tr><td>' + esc(r.name) + '</td><td>≈ ' + fmtInt(r.kcalWeek) + '</td><td>−'
        + fmt(r.kcalWeek * 52 / 12 / kk, 2) + '</td></tr>';
    }
    html += '<tr class="bmi-journey-sum"><td>Razem</td><td>≈ ' + fmtInt(model.totalWeek) + '</td><td>−'
      + fmt(model.totalWeek * 52 / 12 / kk, 2) + '</td></tr>';
    return html;
  }

  function renderResult(model) {
    var mc = model.weeksCombo != null ? weeksToMonthsHalf(model.weeksCombo) : null;
    var md = model.weeksDiet != null ? weeksToMonthsHalf(model.weeksDiet) : null;
    var html = '';
    if (model.weeksCombo != null) {
      html += '<p class="bmi-journey-when">Przy tym planie osiągniesz normę BMI <b>'
        + esc(dateAfterWeeks(model.weeksCombo)) + '</b> (za ok. ' + esc(monthsWord(mc)) + ').</p>';
    }
    var gain = '';
    if (model.weeksDiet != null && model.weeksCombo != null && model.weeksDiet > model.weeksCombo) {
      var diff = Math.round((md - mc) * 2) / 2;
      gain = diff >= 0.5
        ? 'Dzięki ruchowi o ' + monthsWord(diff) + ' szybciej niż na samej diecie'
        : 'Dzięki ruchowi nieznacznie szybciej niż na samej diecie';
    } else if (model.weeksCombo != null && model.dietOn && model.moveWeek === 0) {
      gain = 'Dołóż ruch, żeby osiągnąć normę szybciej';
    } else if (model.weeksCombo != null && !model.dietOn) {
      gain = model.dietAvailable ? 'Włącz plan diety — sam ruch to długa droga' : '';
    } else if (model.weeksCombo == null) {
      gain = 'Zaznacz dietę lub ruch, żeby zobaczyć przewidywany termin';
    }
    if (gain) html += '<div class="bmi-journey-gain"><span>' + esc(gain) + '</span></div>';
    // Oś czasu: znaczniki w miesiącach (0,5), wypełnienie proporcjonalne.
    if (model.weeksCombo != null) {
      var showDiet = model.weeksDiet != null && model.moveWeek > 0 && model.weeksDiet > model.weeksCombo;
      var maxW = Math.max(model.weeksCombo, showDiet ? model.weeksDiet : model.weeksCombo, 1);
      var pC = Math.max(4, model.weeksCombo / maxW * 84);
      var comboLabel = model.dietOn ? (model.moveWeek > 0 ? 'dieta + ruch' : 'sama dieta') : 'sam ruch';
      html += '<div class="bmi-journey-timeline"><div class="bmi-journey-track">'
        + '<div class="bmi-journey-fill" style="width:' + pC.toFixed(1) + '%"></div></div>'
        + '<div class="bmi-journey-marks">'
        + '<span class="bmi-journey-mark" style="left:' + pC.toFixed(1) + '%"><b>' + esc(monthsShort(mc)) + '</b>' + esc(comboLabel) + '</span>'
        + (showDiet
          ? '<span class="bmi-journey-mark" style="left:' + (model.weeksDiet / maxW * 84).toFixed(1) + '%"><b>' + esc(monthsShort(md)) + '</b>sama dieta</span>'
          : '')
        + '</div></div>';
    }
    return html;
  }

  function renderPanel(ctx) {
    var model = computeModel(ctx);
    var goalKg = ctx.weightKg - ctx.kgToLose;
    var targetLabel = ctx.isChild
      ? 'do górnej granicy normy BMI (85. centyl dla wieku)'
      : 'do górnej granicy normy BMI (' + fmt(ctx.targetBmi, 1) + ')';
    var dietChips = '';
    if (model.dietAvailable) {
      dietChips += '<div class="bmi-journey-switchrow" data-journey="toggle" role="switch" aria-checked="'
        + (model.dietOn ? 'true' : 'false') + '" tabindex="0"><span class="bmi-journey-switch"></span>'
        + '<b>Połącz z planem diety</b></div>';
      if (model.dietOn) {
        dietChips += '<div class="bmi-journey-chips"><span class="bmi-journey-lbl">Dieta (jak w planie odchudzania)</span>';
        for (var i = 0; i < model.diets.length; i += 1) {
          var di = model.diets[i];
          dietChips += '<button type="button" class="bmi-journey-chip" data-journey="diet" data-key="' + esc(di.key) + '"'
            + ' aria-pressed="' + (di.key === model.dietKey ? 'true' : 'false') + '">'
            + esc(di.name) + ' −' + fmtInt(di.deficit) + ' kcal/d</button>';
        }
        dietChips += '</div>';
      }
    }
    var moveChips = '<div class="bmi-journey-chips"><span class="bmi-journey-lbl">Ruch — dodaj, ile realnie dasz radę</span>';
    for (var m = 0; m < MOVES.length; m += 1) {
      moveChips += '<button type="button" class="bmi-journey-chip" data-journey="move" data-key="' + esc(MOVES[m].id) + '"'
        + ' aria-pressed="' + (state.moves[MOVES[m].id] ? 'true' : 'false') + '">' + esc(MOVES[m].chip) + '</button>';
    }
    moveChips += '</div>';
    return '<div class="bmi-journey-goal"><span>Twój cel:</span><span class="bmi-journey-n">−' + fmt(ctx.kgToLose, 1)
      + ' kg</span><small>' + targetLabel + '</small></div>'
      + '<div class="bmi-journey-startcel">Start: ' + fmt(ctx.weightKg, 1) + ' kg · Cel: ' + fmt(goalKg, 1) + ' kg</div>'
      + dietChips + moveChips
      + '<table class="bmi-journey-table" aria-live="polite"><thead><tr><th>Twój wybór</th><th>kcal/tydz.</th><th>kg/mies.</th></tr></thead>'
      + '<tbody>' + renderRows(model) + '</tbody></table>'
      + '<div class="bmi-journey-result">' + renderResult(model) + '</div>'
      + yearlyBadge(ctx);
  }

  function ensureStyles() {
    if (d.getElementById('bmiJourneyStyles')) return;
    var css = '#bmiJourneyMount{--bj-muted:#5b6f6f;--bj-line:rgba(91,111,111,.35);--bj-teal:var(--primary,#00838d);--bj-green:#2e8f57;--bj-num:#00727b;--bj-chipbg:rgba(255,255,255,.55)}'
      /* liquid glass: ciemniejsze warianty dla kontrastu na jasnym szkle */
      + '.liquid-ios26 #bmiJourneyMount{--bj-muted:#28494b;--bj-line:rgba(10,50,54,.28);--bj-teal:#0b6d76;--bj-green:#1e6f43;--bj-num:#0a5a62;--bj-chipbg:rgba(255,255,255,.5)}'
      + '.bmi-journey-goal{text-align:center}'
      + '.bmi-journey-goal .bmi-journey-n{display:block;font-size:1.55rem;font-weight:750;color:var(--bj-num);line-height:1.15;font-variant-numeric:tabular-nums}'
      + '.bmi-journey-goal small{display:block;color:var(--bj-muted);font-size:.8rem;margin-top:.1rem}'
      + '.bmi-journey-startcel{color:var(--bj-muted);font-size:.82rem;text-align:center;margin:.15rem 0 .5rem;font-variant-numeric:tabular-nums}'
      + '.bmi-journey-switchrow{display:flex;align-items:center;justify-content:center;gap:.5rem;margin:.7rem 0 .45rem;cursor:pointer;user-select:none;font-size:.92rem}'
      + '.bmi-journey-switch{width:38px;height:21px;border-radius:999px;background:#9fb4b2;position:relative;flex:none;transition:background .2s}'
      + '.bmi-journey-switch::after{content:"";position:absolute;top:3px;left:3px;width:15px;height:15px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.3);transition:left .2s}'
      + '.bmi-journey-switchrow[aria-checked="true"] .bmi-journey-switch{background:var(--bj-green)}'
      + '.bmi-journey-switchrow[aria-checked="true"] .bmi-journey-switch::after{left:20px}'
      + '.bmi-journey-chips{display:flex;gap:.35rem;flex-wrap:wrap;justify-content:center;margin:.25rem 0 .45rem}'
      + '.bmi-journey-lbl{flex-basis:100%;font-size:.68rem;text-transform:uppercase;letter-spacing:.07em;color:var(--bj-muted);text-align:center}'
      /* chipy: komplet jawnych wartości + !important — specyficzność #id wygrywa z `.liquid-ios26 button{...}!important` */
      + '#bmiJourneyMount .bmi-journey-chip{font:inherit!important;font-size:.78rem!important;line-height:1.25!important;border:1px solid var(--bj-line)!important;background:var(--bj-chipbg)!important;color:inherit!important;border-radius:999px!important;padding:.22rem .6rem!important;cursor:pointer!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;box-shadow:none!important;margin:0!important;width:auto!important;transform:none!important}'
      + '#bmiJourneyMount .bmi-journey-chip[aria-pressed="true"]{background:var(--bj-teal)!important;border-color:var(--bj-teal)!important;color:#fff!important;font-weight:600!important}'
      + '#bmiJourneyMount .bmi-journey-chip:focus-visible{outline:2px solid var(--bj-teal)!important;outline-offset:2px!important}'
      /* tabela: jawne tła i kolory + !important — wygrywa z globalnym `th{background:var(--secondary);color:#fff}` */
      + '#bmiJourneyMount .bmi-journey-table{border-collapse:collapse!important;width:100%!important;margin:.45rem 0 0!important;font-variant-numeric:tabular-nums}'
      + '#bmiJourneyMount .bmi-journey-table th{background:transparent!important;color:var(--bj-muted)!important;text-align:left!important;font-size:.66rem!important;font-weight:600!important;text-transform:uppercase!important;letter-spacing:.05em!important;border:0!important;border-bottom:1px solid var(--bj-line)!important;padding:.24rem .25rem!important;width:auto!important;margin:0!important;border-radius:0!important}'
      + '#bmiJourneyMount .bmi-journey-table th:nth-child(2),#bmiJourneyMount .bmi-journey-table th:nth-child(3),#bmiJourneyMount .bmi-journey-table td:nth-child(2),#bmiJourneyMount .bmi-journey-table td:nth-child(3){text-align:right!important}'
      + '#bmiJourneyMount .bmi-journey-table td{background:transparent!important;color:inherit!important;border:0!important;border-bottom:1px solid var(--bj-line)!important;padding:.3rem .25rem!important;font-size:.84rem!important}'
      + '#bmiJourneyMount .bmi-journey-sum td{border-bottom:0!important;border-top:2px solid var(--bj-line)!important;font-weight:700!important}'
      + '#bmiJourneyMount .bmi-journey-sum td:first-child{color:var(--bj-green)!important}'
      + '#bmiJourneyMount .bmi-journey-placeholder td{color:var(--bj-muted)!important;font-style:italic;border-bottom:0!important}'
      + '.bmi-journey-when{text-align:center;margin:.7rem 0 0;font-size:.9rem}'
      + '.bmi-journey-when b{color:var(--bj-num)}'
      + '.bmi-journey-gain{display:block;text-align:center;margin:.35rem auto 0;font-size:.8rem}'
      + '.bmi-journey-gain span{display:inline-block;background:rgba(46,143,87,.14);color:var(--bj-green);font-weight:650;border-radius:999px;padding:.2rem .65rem}'
      + '.liquid-ios26 #bmiJourneyMount .bmi-journey-gain span{background:rgba(255,255,255,.5)}'
      + '.bmi-journey-timeline{margin-top:.75rem}'
      + '.bmi-journey-track{position:relative;height:10px;border-radius:6px;background:rgba(127,127,127,.22)}'
      + '.bmi-journey-fill{position:absolute;top:0;bottom:0;left:0;border-radius:6px;background:linear-gradient(90deg,var(--bj-green),var(--bj-teal))}'
      + '.bmi-journey-marks{position:relative;height:2.9rem;font-size:.7rem}'
      + '.bmi-journey-mark{position:absolute;top:.3rem;transform:translateX(-50%);text-align:center;white-space:nowrap;color:var(--bj-muted)}'
      + '.bmi-journey-mark::before{content:"";display:block;width:2px;height:8px;background:var(--bj-muted);margin:-11px auto 3px}'
      + '.bmi-journey-mark b{display:block;color:inherit;font-size:.78rem;color:var(--bj-num)}'
      + '.bmi-journey-badge{background:rgba(176,116,31,.13);color:#8a5c17;border-radius:8px;padding:.42rem .6rem;font-size:.76rem;margin-top:.6rem}'
      + '.liquid-ios26 #bmiJourneyMount .bmi-journey-badge{background:rgba(255,244,214,.55);color:#6d4a12}'
      + '@media (prefers-reduced-motion: no-preference){.bmi-journey-fill{transition:width .4s ease}}';
    var style = d.createElement('style');
    style.id = 'bmiJourneyStyles';
    style.textContent = css;
    (d.head || d.documentElement).appendChild(style);
  }

  function rerender() {
    var host = d.getElementById('bmiJourneyMount');
    if (!host || !lastCtx) return;
    setHtml(host, renderPanel(lastCtx), 'bmi-journey:panel');
  }

  function onClick(ev) {
    var el = ev.target && ev.target.closest ? ev.target.closest('[data-journey]') : null;
    if (!el) return;
    var kind = el.getAttribute('data-journey');
    if (kind === 'toggle') {
      state.dietOn = el.getAttribute('aria-checked') !== 'true';
    } else if (kind === 'diet') {
      state.dietOn = true;
      state.dietKey = el.getAttribute('data-key');
    } else if (kind === 'move') {
      var key = el.getAttribute('data-key');
      state.moves[key] = !state.moves[key];
    } else {
      return;
    }
    saveState();
    rerender();
  }
  function onKeydown(ev) {
    if (ev.key !== ' ' && ev.key !== 'Enter') return;
    var el = ev.target && ev.target.closest ? ev.target.closest('[data-journey="toggle"]') : null;
    if (!el) return;
    ev.preventDefault();
    state.dietOn = el.getAttribute('aria-checked') !== 'true';
    saveState();
    rerender();
  }

  function mount(ctx) {
    var host = d.getElementById('bmiJourneyMount');
    if (!host || !ctx || !fin(ctx.kgToLose) || !(ctx.kgToLose > 0) || !fin(ctx.weightKg)) return false;
    ensureStyles();
    lastCtx = {
      kgToLose: Number(ctx.kgToLose),
      weightKg: Number(ctx.weightKg),
      heightCm: Number(ctx.heightCm),
      ageYears: Number(ctx.ageYears),
      sex: ctx.sex === 'F' ? 'F' : 'M',
      isChild: !!ctx.isChild,
      targetBmi: fin(ctx.targetBmi) ? Number(ctx.targetBmi) : 25,
      metTableHtml: typeof ctx.metTableHtml === 'string' ? ctx.metTableHtml : ''
    };
    if (!host.dataset.journeyWired) {
      host.addEventListener('click', onClick);
      host.addEventListener('keydown', onKeydown);
      host.dataset.journeyWired = '1';
    }
    setHtml(host, renderPanel(lastCtx), 'bmi-journey:panel');
    return true;
  }

  // Wersja tekstowa panelu dla raportu PDF (jsPDF, font standardowy):
  // bez emoji i znaków spoza U+0020–U+02FF, minus/≈ zapisane ASCII.
  function pdfText(txt) {
    var t = String(txt), out = '';
    for (var i = 0; i < t.length; i += 1) {
      var c = t.charCodeAt(i);
      if (c >= 0x20 && c <= 0x2ff) out += t.charAt(i);
    }
    return out.replace(/\s+/g, ' ').trim();
  }
  function getPdfModel() {
    if (!lastCtx || !d.getElementById('bmiJourneyMount')) return { available: false };
    var model = computeModel(lastCtx);
    if (!model.rows.length || model.weeksCombo == null) return { available: false };
    var kk = kcalPerKg();
    var mc = weeksToMonthsHalf(model.weeksCombo);
    var rows = [];
    for (var i = 0; i < model.rows.length; i += 1) {
      var r = model.rows[i];
      rows.push([pdfText(r.name), 'ok. ' + fmtInt(r.kcalWeek), '-' + fmt(r.kcalWeek * 52 / 12 / kk, 2)]);
    }
    var gainText = '';
    if (model.weeksDiet != null && model.weeksDiet > model.weeksCombo) {
      var diff = Math.round((weeksToMonthsHalf(model.weeksDiet) - mc) * 2) / 2;
      gainText = diff >= 0.5
        ? 'Dzięki ruchowi o ' + monthsWord(diff) + ' szybciej niż na samej diecie.'
        : 'Dzięki ruchowi nieznacznie szybciej niż na samej diecie.';
    }
    return {
      available: true,
      goalMain: 'Twój cel: -' + fmt(lastCtx.kgToLose, 1) + ' kg',
      goalSub: lastCtx.isChild
        ? 'do górnej granicy normy BMI (85. centyl dla wieku)'
        : 'do górnej granicy normy BMI (' + fmt(lastCtx.targetBmi, 1) + ')',
      startCel: 'Start: ' + fmt(lastCtx.weightKg, 1) + ' kg · Cel: ' + fmt(lastCtx.weightKg - lastCtx.kgToLose, 1) + ' kg',
      rows: rows,
      totalRow: ['Razem', 'ok. ' + fmtInt(model.totalWeek), '-' + fmt(model.totalWeek * 52 / 12 / kk, 2)],
      whenText: 'Przy tym planie osiągniesz normę BMI ' + dateAfterWeeks(model.weeksCombo)
        + ' (za ok. ' + monthsWord(mc) + ').',
      gainText: gainText
    };
  }

  function getSnapshot() {
    return {
      version: VERSION,
      state: { dietOn: state.dietOn, dietKey: state.dietKey, moves: Object.assign({}, state.moves) },
      mounted: !!(d.getElementById('bmiJourneyMount') && lastCtx)
    };
  }

  w.VildaBmiJourney = {
    VERSION: VERSION,
    mount: mount,
    getPdfModel: getPdfModel,
    getSnapshot: getSnapshot
  };
})(typeof window !== 'undefined' ? window : globalThis, typeof document !== 'undefined' ? document : null);
