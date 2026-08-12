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

  var VERSION = '1.0.0';
  var STORAGE_KEY = 'vildaBmiJourneyState';
  var KCAL_PER_KG_FALLBACK = 7700;

  // Tygodniowe dawki ruchu: klucz z biblioteki MET (vilda_food_data.js) + minuty/tydzień.
  var MOVES = [
    { id: 'walk', minWeek: 210, chip: '🚶 spacer 30 min/d', row: '🚶 Spacer 30 min dziennie' },
    { id: 'bike', minWeek: 90, chip: '🚴 rower 2×45 min', row: '🚴 Rower 2 × 45 min' },
    { id: 'swim', minWeek: 45, chip: '🏊 basen 1×45 min', row: '🏊 Basen 1 × 45 min' },
    { id: 'dance', minWeek: 60, chip: '💃 taniec 1×60 min', row: '💃 Taniec 1 × 60 min' },
    { id: 'run', minWeek: 90, chip: '🏃 bieganie 3×30 min', row: '🏃 Bieganie 3 × 30 min' }
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
      html += '<tr><td>' + esc(r.name) + '</td><td>≈ ' + fmtInt(r.kcalWeek) + ' kcal</td><td>−'
        + fmt(r.kcalWeek * 52 / 12 / kk, 2) + ' kg / mies.</td></tr>';
    }
    html += '<tr class="bmi-journey-sum"><td>Razem</td><td>≈ ' + fmtInt(model.totalWeek) + ' kcal</td><td>−'
      + fmt(model.totalWeek * 52 / 12 / kk, 2) + ' kg / mies.</td></tr>';
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
      + '<table class="bmi-journey-table" aria-live="polite"><thead><tr><th>Twój wybór</th><th>Tygodniowo</th><th>Wkład w cel</th></tr></thead>'
      + '<tbody>' + renderRows(model) + '</tbody></table>'
      + '<div class="bmi-journey-result">' + renderResult(model) + '</div>'
      + yearlyBadge(ctx)
      + (ctx.metTableHtml
        ? '<details class="bmi-journey-details"><summary>Pełna tabela aktywności (dystanse i czasy)</summary>' + ctx.metTableHtml + '</details>'
        : '');
  }

  function ensureStyles() {
    if (d.getElementById('bmiJourneyStyles')) return;
    var css = '.bmi-journey-goal{text-align:center}'
      + '.bmi-journey-goal .bmi-journey-n{display:block;font-size:1.9rem;font-weight:700;color:var(--primary,#00838d);line-height:1.15}'
      + '.bmi-journey-goal small{display:block;color:var(--muted,#5b6f6f)}'
      + '.bmi-journey-startcel{color:var(--muted,#5b6f6f);font-size:.9rem;text-align:center;margin-bottom:.4rem}'
      + '.bmi-journey-switchrow{display:flex;align-items:center;justify-content:center;gap:.55rem;margin:.9rem 0 .5rem;cursor:pointer;user-select:none}'
      + '.bmi-journey-switch{width:40px;height:22px;border-radius:999px;background:#c9d6d4;position:relative;flex:none;transition:background .2s}'
      + '.bmi-journey-switch::after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:left .2s}'
      + '.bmi-journey-switchrow[aria-checked="true"] .bmi-journey-switch{background:#2e8f57}'
      + '.bmi-journey-switchrow[aria-checked="true"] .bmi-journey-switch::after{left:21px}'
      + '.bmi-journey-chips{display:flex;gap:.4rem;flex-wrap:wrap;justify-content:center;margin:.3rem 0 .5rem}'
      + '.bmi-journey-lbl{flex-basis:100%;font-size:.72rem;text-transform:uppercase;letter-spacing:.07em;color:var(--muted,#5b6f6f);text-align:center}'
      + '.bmi-journey-chip{font:inherit;font-size:.85rem;border:1px solid var(--border,#c9d6d4);background:transparent;color:inherit;border-radius:999px;padding:.28rem .75rem;cursor:pointer}'
      + '.bmi-journey-chip[aria-pressed="true"]{background:var(--primary,#00838d);border-color:var(--primary,#00838d);color:#fff;font-weight:600}'
      + '.bmi-journey-table{border-collapse:collapse;width:100%;margin-top:.6rem}'
      + '.bmi-journey-table th{text-align:left;font-size:.72rem;text-transform:uppercase;letter-spacing:.05em;color:var(--muted,#5b6f6f);border-bottom:1px solid var(--border,#c9d6d4);padding:.3rem .35rem}'
      + '.bmi-journey-table th:nth-child(2),.bmi-journey-table th:nth-child(3),.bmi-journey-table td:nth-child(2),.bmi-journey-table td:nth-child(3){text-align:right}'
      + '.bmi-journey-table td{padding:.4rem .35rem;border-bottom:1px solid var(--border,#e0e8e6);font-size:.93rem}'
      + '.bmi-journey-sum td{border-bottom:0;border-top:2px solid var(--border,#c9d6d4);font-weight:700}'
      + '.bmi-journey-sum td:first-child{color:#2e8f57}'
      + '.bmi-journey-placeholder td{color:var(--muted,#5b6f6f);font-style:italic;border-bottom:0}'
      + '.bmi-journey-when{text-align:center;margin:.85rem 0 0;font-size:1rem}'
      + '.bmi-journey-when b{color:var(--primary,#00838d)}'
      + '.bmi-journey-gain{display:block;text-align:center;margin:.4rem auto 0;font-size:.88rem}'
      + '.bmi-journey-gain span{display:inline-block;background:rgba(46,143,87,.13);color:#2e8f57;font-weight:650;border-radius:999px;padding:.22rem .75rem}'
      + '.bmi-journey-timeline{margin-top:.9rem}'
      + '.bmi-journey-track{position:relative;height:12px;border-radius:7px;background:rgba(127,127,127,.18)}'
      + '.bmi-journey-fill{position:absolute;top:0;bottom:0;left:0;border-radius:7px;background:linear-gradient(90deg,#2e8f57,var(--primary,#00838d))}'
      + '.bmi-journey-marks{position:relative;height:3.2rem;font-size:.78rem}'
      + '.bmi-journey-mark{position:absolute;top:.35rem;transform:translateX(-50%);text-align:center;white-space:nowrap}'
      + '.bmi-journey-mark::before{content:"";display:block;width:2px;height:9px;background:var(--muted,#5b6f6f);margin:-13px auto 4px}'
      + '.bmi-journey-mark b{display:block}'
      + '.bmi-journey-badge{background:rgba(176,116,31,.12);color:#8a5c17;border-radius:8px;padding:.5rem .75rem;font-size:.86rem;margin-top:.7rem}'
      + '.bmi-journey-details{margin-top:.6rem}'
      + '.bmi-journey-details summary{cursor:pointer;color:var(--primary,#00838d);font-size:.88rem}'
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
    getSnapshot: getSnapshot
  };
})(typeof window !== 'undefined' ? window : globalThis, typeof document !== 'undefined' ? document : null);
