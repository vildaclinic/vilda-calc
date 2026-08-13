/*
 * Droga do normy 3.0 — karta scalona (fuzja „Drogi do normy BMI" i „Planu
 * odchudzania", wariant C1 makiety zatwierdzonej 2026-08-13): hero z terminem,
 * pigułka zysku z ruchu, wyeksponowany cel (−kg / granica normy / Start→Cel),
 * kaloryczność diety na zielonym tle, segmenty PAL i diety (sterują ukrytymi
 * selectami #palFactor/#dietLevel — jedno źródło prawdy), chipy ruchu,
 * zwijane „Szczegóły planu" (deficyt/tempo, tabela wkładów, opis diety,
 * odznaka roczna) i ostrzeżenia kliniczne. Dotyczy trybu redukcyjnego ≥ 5 lat;
 * młodsze dzieci i tryb profesjonalny 2–5 lat obsługuje vilda_update_prep.js.
 */
(function (w, d) {
  'use strict';
  if (!w || w.VildaBmiJourney) return;

  var VERSION = '2.0.0';
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
  var lastEngineState = null;

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
  // Etap 3: dzieci dostają czas z wspólnej symulacji wzrastania (silnik energii);
  // dorośli — dotychczasowa matematyka liniowa (symulacja dałaby ten sam wynik).
  function timeToNorm(ctx, weeklyLossKg) {
    if (!(weeklyLossKg > 0) || !(ctx.kgToLose > 0)) return null;
    if (ctx.isChild && typeof w.energySimulateMonthsToBmiTarget === 'function') {
      try {
        var sim = w.energySimulateMonthsToBmiTarget({
          ageYears: ctx.ageYears, ageMonthsOpt: 0, sex: ctx.sex,
          weightKg: ctx.weightKg, heightCm: ctx.heightCm,
          weeklyLossKg: weeklyLossKg, target: 'norm'
        });
        if (sim && sim.months != null) {
          return { months: sim.months, growthAware: !!sim.growthAware, annualGrowthCm: sim.annualGrowthCm };
        }
      } catch (err) { /* fallback liniowy poniżej */ }
    }
    return { months: weeksToMonthsHalf(Math.ceil(ctx.kgToLose / weeklyLossKg)), growthAware: false, annualGrowthCm: null };
  }
  function monthsWord(m) {
    if (m % 1 !== 0) return fmt(m, 1) + ' miesiąca';
    if (m === 1) return '1 miesiąc';
    var r = m % 10, c = m % 100;
    return (r >= 2 && r <= 4 && (c < 12 || c > 14)) ? m + ' miesiące' : m + ' miesięcy';
  }
  function monthsShort(m) { return (m % 1 !== 0 ? fmt(m, 1) : String(m)) + ' mies.'; }
  function dateAfterMonths(months) {
    var dt = new Date();
    dt.setDate(dt.getDate() + Math.round(months * 30.44));
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
      lastEngineState = st || null;
      return st && Array.isArray(st.diets) ? st.diets : [];
    } catch (err) { lastEngineState = null; return []; }
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
    // Fuzja kart, etap 1: jeden wybór diety w aplikacji — źródłem prawdy jest
    // select #dietLevel karty „Plan odchudzania"; localStorage tylko jako
    // fallback, gdy selectu nie ma na stronie.
    var dietSel = d.getElementById('dietLevel');
    var dietKey = dietSel && dietSel.value ? dietSel.value : state.dietKey;
    var found = null;
    for (var i = 0; i < diets.length; i += 1) if (diets[i].key === dietKey) found = diets[i];
    if (!found) {
      var preferred = ctx.isChild ? 'light' : 'moderate';
      for (var j = 0; j < diets.length; j += 1) if (diets[j].key === preferred) found = diets[j];
      if (!found && diets.length) found = diets[0];
      dietKey = found ? found.key : null;
    }
    var dietOn = dietAvailable;
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
    var comboT = totalWeek > 0 ? timeToNorm(ctx, totalWeek / kk) : null;
    var dietT = dietOn && deficitDay > 0 ? timeToNorm(ctx, deficitDay * 7 / kk) : null;
    return {
      diets: diets, dietAvailable: dietAvailable, dietOn: dietOn, dietKey: dietKey,
      found: found,
      rows: rows, moveWeek: moveWeek, totalWeek: totalWeek,
      monthsCombo: comboT ? comboT.months : null,
      monthsDiet: dietT ? dietT.months : null,
      growthAware: !!(comboT && comboT.growthAware),
      annualGrowthCm: comboT ? comboT.annualGrowthCm : null
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

  function gainPill(model) {
    var mc = model.monthsCombo, md = model.monthsDiet;
    var gain = '';
    if (md != null && mc != null && md > mc) {
      var diff = Math.round((md - mc) * 2) / 2;
      gain = diff >= 0.5
        ? 'Dzięki ruchowi o ' + monthsWord(diff) + ' szybciej'
        : 'Dzięki ruchowi nieznacznie szybciej';
    } else if (mc != null && model.moveWeek === 0) {
      gain = 'Dołóż ruch, żeby osiągnąć normę szybciej';
    } else if (mc == null) {
      gain = 'Zaznacz dietę lub ruch, żeby zobaczyć przewidywany termin';
    }
    return gain ? '<div class="bmi-journey-gain"><span>' + esc(gain) + '</span></div>' : '';
  }

  // Segment PAL budowany z opcji ukrytego selecta #palFactor (żywe źródło prawdy).
  function palSegment() {
    var sel = d.getElementById('palFactor');
    if (!sel || !sel.options || !sel.options.length) return '';
    var html = '<span class="bmi-journey-lbl">Aktywność (PAL)</span><div class="bmi-journey-seg" role="group" aria-label="Poziom aktywności PAL">';
    for (var i = 0; i < sel.options.length; i += 1) {
      var o = sel.options[i];
      var clin = /klinicz|poza Normami/i.test(o.textContent || '');
      html += '<button type="button" data-journey="pal" data-key="' + esc(o.value) + '"'
        + ' aria-pressed="' + (o.value === sel.value ? 'true' : 'false') + '"'
        + ' title="' + esc(o.textContent || '') + '">'
        + esc(String(o.value).replace('.', ',')) + (clin ? '\u202F*' : '') + '</button>';
    }
    return html + '</div>';
  }

  // Segment diety: wszystkie poziomy z konfiguracji silnika; poziom wycięty
  // przez minimum kaloryczne jest wyszarzony z podpisem „niedostępna".
  function dietSegment(model) {
    var cfg = w.DIET_LEVELS && typeof w.DIET_LEVELS === 'object' ? w.DIET_LEVELS : null;
    if (!cfg) return '';
    var html = '<span class="bmi-journey-lbl">Dieta</span><div class="bmi-journey-seg" role="group" aria-label="Rodzaj diety">';
    Object.keys(cfg).forEach(function (key) {
      var av = null;
      for (var i = 0; i < model.diets.length; i += 1) if (model.diets[i].key === key) av = model.diets[i];
      html += '<button type="button" data-journey="diet" data-key="' + esc(key) + '"'
        + ' aria-pressed="' + (key === model.dietKey ? 'true' : 'false') + '"'
        + (av ? '' : ' disabled title="poniżej minimum kalorycznego dla tego pacjenta"') + '>'
        + esc(cfg[key].label)
        + '<span class="bmi-journey-sub">' + (av ? '\u2212' + fmtInt(av.deficit) + '\u202Fkcal/d' : 'niedostępna') + '</span></button>';
    });
    return html + '</div>';
  }

  function detailsSection(ctx, model) {
    var html = '<details class="bmi-journey-det"><summary>Szczegóły planu</summary>';
    if (model.found) {
      html += '<p class="bmi-journey-recepta">deficyt <b>\u2212' + fmtInt(model.found.deficit)
        + '\u202Fkcal/dzień</b> · tempo ok. <b>' + fmt(model.found.weeklyLoss, 1) + '\u202Fkg/tydz.</b></p>';
    }
    html += '<table class="bmi-journey-table" aria-live="polite"><thead><tr><th>Twój wybór</th><th>kcal/tydz.</th><th>kg/mies.</th></tr></thead>'
      + '<tbody>' + renderRows(model) + '</tbody></table>';
    if (model.found && w.DIET_BULLETS && w.DIET_BULLETS[model.dietKey] && w.DIET_LEVELS && w.DIET_LEVELS[model.dietKey]) {
      var extra = w.DIET_BULLETS[model.dietKey].slice(2);
      var items = ['deficyt ok.\u202F' + Math.round(w.DIET_LEVELS[model.dietKey].deficitPct * 100)
        + '\u202F% całkowitego wydatku energetycznego'].concat(extra);
      html += '<ul class="bmi-journey-bullets">' + items.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';
    }
    html += yearlyBadge(ctx) + '</details>';
    return html;
  }

  function warningsSection(ctx, model) {
    var html = '';
    if (ctx.ageYears >= 5 && ctx.ageYears < 10) {
      html += '<div class="bmi-journey-warn">\u26A0\u00A0Dieta u dzieci w wieku 5\u20139\u00A0lat wymaga nadzoru dietetyka lub lekarza.</div>';
    }
    if (model.dietKey === 'intense') {
      html += '<div class="bmi-journey-warn">\u26A0\u00A0Intensywna dieta wymaga nadzoru specjalisty i nie powinna być stosowana dłużej niż kilka tygodni.</div>';
    }
    return html;
  }

  function renderPanel(ctx) {
    var model = computeModel(ctx);
    var goalKg = ctx.weightKg - ctx.kgToLose;
    var targetLabel = ctx.isChild
      ? 'do górnej granicy normy BMI (85. centyl dla wieku)'
      : 'do górnej granicy normy BMI (' + fmt(ctx.targetBmi, 1) + ')';
    var mc = model.monthsCombo;
    var badge = lastEngineState && lastEngineState.modeBadge && typeof w.energyRenderModeBadgeHtml === 'function'
      ? '<div class="energy-mode-badge-row energy-mode-badge-row--results">' + w.energyRenderModeBadgeHtml(lastEngineState.modeBadge) + '</div>'
      : '';
    var hero = mc != null
      ? '<div class="bmi-journey-hero"><span class="bmi-journey-heron">' + esc(monthsShort(mc)) + '</span>'
        + '<div class="bmi-journey-herocap"><b>' + esc(dateAfterMonths(mc)) + '</b> · '
        + (model.moveWeek > 0 ? 'dieta + ruch' : 'sama dieta') + '</div></div>'
      : '<div class="bmi-journey-hero"><span class="bmi-journey-heron">\u2013</span>'
        + '<div class="bmi-journey-herocap">zaznacz dietę lub ruch</div></div>';
    var growth = mc != null && model.growthAware && fin(model.annualGrowthCm)
      ? '<p class="bmi-journey-growth">uwzględnia dalsze wzrastanie (ok. ' + esc(fmt(model.annualGrowthCm, 1)) + ' cm/rok)</p>'
      : '';
    var horizon = mc != null && mc > 18
      ? '<p class="bmi-journey-growth">szacunek orientacyjny — tempo warto weryfikować co 3\u20136 miesięcy</p>'
      : '';
    var goalbox = '<div class="bmi-journey-goalbox">'
      + '<div class="bmi-journey-g1">Cel: <b>\u2212' + fmt(ctx.kgToLose, 1) + '\u202Fkg</b></div>'
      + '<div class="bmi-journey-g2">' + targetLabel + '</div>'
      + '<div class="bmi-journey-g3">Start: <b>' + fmt(ctx.weightKg, 1) + '\u202Fkg</b> \u2192 Cel: <b>' + fmt(goalKg, 1) + '\u202Fkg</b></div>'
      + '</div>';
    var kcal = model.found
      ? '<div class="bmi-journey-kcal"><span class="bmi-journey-kcaln">' + fmtInt(Math.round(model.found.intake / 100) * 100)
        + '</span> <span class="bmi-journey-kcalu">kcal/dzień</span>'
        + '<div class="bmi-journey-kcalcap">' + ((ctx.isChild ? 'light' : 'moderate') === model.dietKey ? 'zalecana kaloryczność diety' : 'kaloryczność wybranej diety') + '</div></div>'
      : '';
    var moveChips = '<span class="bmi-journey-lbl">Ruch — przyspiesz osiągnięcie celu</span><div class="bmi-journey-chips">';
    for (var m = 0; m < MOVES.length; m += 1) {
      moveChips += '<button type="button" class="bmi-journey-chip" data-journey="move" data-key="' + esc(MOVES[m].id) + '"'
        + ' aria-pressed="' + (state.moves[MOVES[m].id] ? 'true' : 'false') + '">' + esc(MOVES[m].chip) + '</button>';
    }
    moveChips += '</div>';
    return badge + hero + growth + horizon + gainPill(model) + goalbox + kcal
      + palSegment() + dietSegment(model) + moveChips
      + detailsSection(ctx, model) + warningsSection(ctx, model);
  }

  function ensureStyles() {
    if (d.getElementById('bmiJourneyStyles')) return;
    var css = '#bmiJourneyMount{--bj-muted:#5b6f6f;--bj-line:rgba(91,111,111,.35);--bj-teal:var(--primary,#00838d);--bj-green:#2e8f57;--bj-num:#00727b;--bj-chipbg:rgba(255,255,255,.55);--bj-warnbg:#fdf3e0;--bj-warnink:#7a5a19;--bj-kcalbg:rgba(46,143,87,.14)}'
      /* liquid glass: ciemniejsze tusze dla kontrastu, ale zielone akcenty C1 (tło kcal, pigułka zysku) zostają */
      + '.liquid-ios26 #bmiJourneyMount{--bj-muted:#28494b;--bj-line:rgba(10,50,54,.28);--bj-teal:#0b6d76;--bj-green:#1e6f43;--bj-num:#0a5a62;--bj-chipbg:rgba(255,255,255,.5);--bj-warnbg:rgba(255,244,214,.6);--bj-warnink:#6d4a12;--bj-kcalbg:rgba(46,143,87,.16)}'
      /* baza 1rem: neutralizuje odziedziczone .result-box{font-size:1.75rem} (rozdymało odstępy międzyznakowe) */
      + '#bmiJourneyMount{font-variant-numeric:tabular-nums;font-size:1rem}'
      + '.bmi-journey-hero{text-align:center;margin:.25rem 0 0}'
      + '.bmi-journey-heron{font-size:1.9rem;font-weight:750;color:var(--bj-num);line-height:1.1}'
      + '.bmi-journey-herocap{font-size:.76rem;color:var(--bj-muted);margin-top:.05rem}'
      + '.bmi-journey-herocap b{color:var(--bj-num)}'
      + '.bmi-journey-growth{text-align:center;margin:.2rem 0 0;font-size:.72rem;color:var(--bj-muted)}'
      + '.bmi-journey-gain{display:block;text-align:center;margin:.3rem auto 0;font-size:.78rem}'
      + '.bmi-journey-gain span{display:inline-block;background:rgba(46,143,87,.14);color:var(--bj-green);font-weight:650;border-radius:999px;padding:.16rem .6rem}'
      + '.liquid-ios26 #bmiJourneyMount .bmi-journey-gain span{background:rgba(46,143,87,.16)}'
      + '.bmi-journey-goalbox{text-align:center;margin:.75rem 0 .1rem;padding:.5rem .35rem .55rem;border-top:1px solid var(--bj-line);border-bottom:1px solid var(--bj-line)}'
      + '.bmi-journey-g1{font-size:1.02rem}'
      + '.bmi-journey-g1 b{font-size:1.4rem;font-weight:750;color:var(--bj-num)}'
      + '.bmi-journey-g2{font-size:.78rem;color:var(--bj-muted);margin-top:.08rem}'
      + '.bmi-journey-g3{font-size:.85rem;margin-top:.28rem}'
      + '.bmi-journey-g3 b{color:var(--bj-num)}'
      /* kaloryczność — hero na zielonym tle (wariant C1 makiety) */
      + '.bmi-journey-kcal{text-align:center;margin:.75rem .3rem .1rem;padding:.5rem .4rem .55rem;background:var(--bj-kcalbg);border-radius:12px}'
      + '.bmi-journey-kcaln{font-size:1.9rem;font-weight:750;color:var(--bj-green);line-height:1.1}'
      + '.bmi-journey-kcalu{font-size:.82rem;color:var(--bj-muted)}'
      + '.bmi-journey-kcalcap{font-size:.72rem;color:var(--bj-green);margin-top:.05rem}'
      + '.bmi-journey-lbl{display:block;font-size:.66rem;text-transform:uppercase;letter-spacing:.07em;color:var(--bj-muted);text-align:center;margin:.7rem 0 .25rem}'
      /* segmenty PAL/diety: komplet jawnych wartości + !important — #id wygrywa z `.liquid-ios26 button{...}!important` */
      + '#bmiJourneyMount .bmi-journey-seg{display:flex;border:1px solid var(--bj-line);border-radius:10px;overflow:hidden;margin:0}'
      + '#bmiJourneyMount .bmi-journey-seg button{font:inherit!important;font-size:.74rem!important;line-height:1.3!important;padding:.32rem .15rem!important;border:0!important;border-left:1px solid var(--bj-line)!important;border-radius:0!important;background:transparent!important;color:inherit!important;margin:0!important;flex:1 1 0!important;width:auto!important;min-width:0!important;cursor:pointer!important;box-shadow:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;transform:none!important}'
      + '#bmiJourneyMount .bmi-journey-seg button:first-child{border-left:0!important}'
      + '#bmiJourneyMount .bmi-journey-seg button[aria-pressed="true"]{background:var(--bj-teal)!important;color:#fff!important;font-weight:600!important}'
      + '#bmiJourneyMount .bmi-journey-seg button:disabled{opacity:.45!important;cursor:not-allowed!important}'
      + '#bmiJourneyMount .bmi-journey-seg button:focus-visible{outline:2px solid var(--bj-teal)!important;outline-offset:-2px!important}'
      + '#bmiJourneyMount .bmi-journey-sub{display:block;font-size:.64rem;opacity:.78}'
      + '.bmi-journey-chips{display:flex;gap:.35rem;flex-wrap:wrap;justify-content:center;margin:.25rem 0 .45rem}'
      /* chipy ruchu: jawne wartości + !important (odporność na motywy) */
      + '#bmiJourneyMount .bmi-journey-chip{font:inherit!important;font-size:.78rem!important;line-height:1.25!important;border:1px solid var(--bj-line)!important;background:var(--bj-chipbg)!important;color:inherit!important;border-radius:999px!important;padding:.22rem .6rem!important;cursor:pointer!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;box-shadow:none!important;margin:0!important;width:auto!important;transform:none!important}'
      + '#bmiJourneyMount .bmi-journey-chip[aria-pressed="true"]{background:var(--bj-teal)!important;border-color:var(--bj-teal)!important;color:#fff!important;font-weight:600!important}'
      + '#bmiJourneyMount .bmi-journey-chip:focus-visible{outline:2px solid var(--bj-teal)!important;outline-offset:2px!important}'
      /* szczegóły planu */
      + '#bmiJourneyMount .bmi-journey-det{margin-top:.7rem;font-size:.8rem}'
      + '#bmiJourneyMount .bmi-journey-det summary{cursor:pointer;color:var(--bj-num);font-weight:600;text-align:center;list-style:none}'
      + '#bmiJourneyMount .bmi-journey-det summary::after{content:" \u25BE"}'
      + '#bmiJourneyMount .bmi-journey-det[open] summary::after{content:" \u25B4"}'
      + '#bmiJourneyMount .bmi-journey-recepta{text-align:center;margin:.45rem 0 .1rem;font-size:.8rem}'
      + '#bmiJourneyMount .bmi-journey-recepta b{color:var(--bj-num)}'
      /* tabela: jawne tła i kolory + !important — wygrywa z globalnym `th{background:var(--secondary);color:#fff}` */
      + '#bmiJourneyMount .bmi-journey-table{border-collapse:collapse!important;width:100%!important;margin:.45rem 0 0!important;font-variant-numeric:tabular-nums}'
      + '#bmiJourneyMount .bmi-journey-table th{background:transparent!important;color:var(--bj-muted)!important;text-align:left!important;font-size:.66rem!important;font-weight:600!important;text-transform:uppercase!important;letter-spacing:.05em!important;border:0!important;border-bottom:1px solid var(--bj-line)!important;padding:.24rem .25rem!important;width:auto!important;margin:0!important;border-radius:0!important}'
      + '#bmiJourneyMount .bmi-journey-table th:nth-child(2),#bmiJourneyMount .bmi-journey-table th:nth-child(3),#bmiJourneyMount .bmi-journey-table td:nth-child(2),#bmiJourneyMount .bmi-journey-table td:nth-child(3){text-align:right!important}'
      + '#bmiJourneyMount .bmi-journey-table td{background:transparent!important;color:inherit!important;border:0!important;border-bottom:1px solid var(--bj-line)!important;padding:.3rem .25rem!important;font-size:.84rem!important}'
      + '#bmiJourneyMount .bmi-journey-sum td{border-bottom:0!important;border-top:2px solid var(--bj-line)!important;font-weight:700!important}'
      + '#bmiJourneyMount .bmi-journey-sum td:first-child{color:var(--bj-green)!important}'
      + '#bmiJourneyMount .bmi-journey-placeholder td{color:var(--bj-muted)!important;font-style:italic;border-bottom:0!important}'
      /* text-align:left — odziedziczone .result-box{text-align:center} środkowało łamane wiersze */
      + '#bmiJourneyMount .bmi-journey-bullets{margin:.5rem 0 0;padding-left:1.1rem;font-size:.78rem;color:inherit;text-align:left}'
      + '#bmiJourneyMount .bmi-journey-bullets li{margin:.15rem 0}'
      + '.bmi-journey-warn{background:var(--bj-warnbg);color:var(--bj-warnink);border-radius:8px;font-size:.75rem;padding:.42rem .58rem;margin-top:.6rem;text-align:left}'
      + '.bmi-journey-badge{background:rgba(176,116,31,.13);color:#8a5c17;border-radius:8px;padding:.42rem .6rem;font-size:.76rem;margin-top:.6rem;text-align:left}'
      + '.liquid-ios26 #bmiJourneyMount .bmi-journey-badge{background:rgba(255,244,214,.55);color:#6d4a12}';
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
    if (!el || el.disabled) return;
    var kind = el.getAttribute('data-journey');
    if (kind === 'pal') {
      var palSel = d.getElementById('palFactor');
      if (palSel) {
        palSel.value = el.getAttribute('data-key');
        if (typeof w.updatePalDescription === 'function') { try { w.updatePalDescription(palSel.value); } catch (err) { /* opis PAL opcjonalny */ } }
        if (typeof w.debouncedUpdate === 'function') w.debouncedUpdate();
        else if (typeof w.update === 'function') w.update();
      }
      return;
    }
    if (kind === 'diet') {
      state.dietKey = el.getAttribute('data-key');
      var dietSel = d.getElementById('dietLevel');
      if (dietSel && dietSel.value !== state.dietKey) {
        dietSel.value = state.dietKey;
        if (typeof w.updatePlanFromDiet === 'function') {
          try { w.updatePlanFromDiet(); } catch (err) { /* plan przeliczy się przy następnym update() */ }
        }
      }
    } else if (kind === 'move') {
      var key = el.getAttribute('data-key');
      state.moves[key] = !state.moves[key];
    } else {
      return;
    }
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
    if (!model.rows.length || model.monthsCombo == null) return { available: false };
    var kk = kcalPerKg();
    var mc = model.monthsCombo;
    var rows = [];
    for (var i = 0; i < model.rows.length; i += 1) {
      var r = model.rows[i];
      rows.push([pdfText(r.name), 'ok. ' + fmtInt(r.kcalWeek), '-' + fmt(r.kcalWeek * 52 / 12 / kk, 2)]);
    }
    var gainText = '';
    if (model.monthsDiet != null && model.monthsDiet > model.monthsCombo) {
      var diff = Math.round((model.monthsDiet - mc) * 2) / 2;
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
      whenText: 'Przy tym planie osiągniesz normę BMI ' + dateAfterMonths(mc)
        + ' (za ok. ' + monthsWord(mc)
        + (model.growthAware && fin(model.annualGrowthCm)
          ? '; uwzględnia dalsze wzrastanie ok. ' + fmt(model.annualGrowthCm, 1) + ' cm/rok'
          : '')
        + ').',
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
    refresh: rerender,
    getPdfModel: getPdfModel,
    getSnapshot: getSnapshot
  };
})(typeof window !== 'undefined' ? window : globalThis, typeof document !== 'undefined' ? document : null);
