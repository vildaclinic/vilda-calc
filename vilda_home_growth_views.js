/* Accepted A2 presentation. Reads the already-rendered native trajectory model
 * and native forecast DOM. Only SVG coordinates and labels are produced here;
 * there is no second calculation, qualification or patient-store write path. */
(function (w) {
  'use strict';
  if (!w || w.__VILDA_HOME_WORKSPACE_PREVIEW__ !== true) return;
  var d = w.document;
  function el(tag, cls, text) {
    var node = d.createElement(tag); if (cls) node.className = cls;
    if (text != null) node.textContent = text; return node;
  }
  function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
  function fmt(value, digits) { return finite(value) ? value.toLocaleString('pl-PL', { maximumFractionDigits: digits == null ? 1 : digits }) : '—'; }
  function svgNode(tag, attrs) {
    var node = d.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach(function (name) { node.setAttribute(name, attrs[name]); }); return node;
  }
  function heading(title, note) {
    var box = el('header', 'vhome-a2-heading'); box.append(el('h3', '', title));
    if (note) box.appendChild(el('p', '', note)); return box;
  }
  function details(label, content) {
    var box = el('details', 'vhome-a2-details'); box.append(el('summary', '', label), content); return box;
  }
  function trajectoryModel(node) {
    try { return JSON.parse(node.getAttribute('data-vhome-trajectory')); } catch (_) { return null; }
  }
  function drawRawChart(host, series, unit) {
    host.replaceChildren();
    var points = series.filter(function (p) { return finite(p.ageMonths) && finite(p.value); });
    if (!points.length) { host.appendChild(el('p', 'vhome-growth-empty', 'Brak wpisanych pomiarów dla tej serii.')); return; }
    var width = Math.max(235, host.clientWidth || 500), height = 220, left = 46, right = width - 16, top = 24, bottom = 178;
    var values = points.map(function (p) { return p.value; }), ages = points.map(function (p) { return p.ageMonths; });
    var low = Math.min.apply(null, values), high = Math.max.apply(null, values), padding = Math.max((high - low) * .2, .3);
    low -= padding; high += padding;
    var minAge = Math.min.apply(null, ages), span = Math.max.apply(null, ages) - minAge || 12;
    function xy(p) { return [left + (p.ageMonths - minAge) / span * (right - left), bottom - (p.value - low) / (high - low) * (bottom - top)]; }
    var svg = svgNode('svg', { viewBox: '0 0 ' + width + ' ' + height, role: 'img', 'aria-label': 'Przebieg wpisanych pomiarów' + (unit ? ' · ' + unit : '') });
    [0, .5, 1].forEach(function (part) {
      var y = bottom - part * (bottom - top);
      svg.appendChild(svgNode('path', { d: 'M' + left + ' ' + y + 'H' + right, class: 'vhome-a2-gridline' }));
      var text = svgNode('text', { x: left - 9, y: y + 5, 'text-anchor': 'end' }); text.textContent = fmt(low + part * (high - low)); svg.appendChild(text);
      text = svgNode('text', { x: left + part * (right - left), y: 205, 'text-anchor': part === 0 ? 'start' : part === 1 ? 'end' : 'middle' });
      text.textContent = fmt((minAge + part * span) / 12) + ' lat'; svg.appendChild(text);
    });
    var label = svgNode('text', { x: left, y: 13 }); label.textContent = unit; svg.appendChild(label);
    svg.appendChild(svgNode('path', { d: 'M' + left + ' ' + top + 'V' + bottom + 'H' + right, class: 'vhome-a2-axis' }));
    var line = points.map(function (p, i) { var pos = xy(p); return (i ? 'L' : 'M') + pos[0] + ' ' + pos[1]; }).join(' ');
    svg.appendChild(svgNode('path', { d: line + ' L' + right + ' ' + bottom + ' L' + left + ' ' + bottom + ' Z', class: 'vhome-a2-area' }));
    svg.appendChild(svgNode('path', { d: line, class: 'vhome-a2-line' }));
    points.forEach(function (p) {
      var pos = xy(p), point = svgNode('circle', { cx: pos[0], cy: pos[1], r: p.isCurrent ? 5 : 3.5, class: 'vhome-a2-dot', tabindex: '0',
        'aria-label': fmt(p.ageMonths / 12) + ' lat · ' + fmt(p.value) + (unit ? ' ' + unit : '') });
      var title = svgNode('title'); title.textContent = point.getAttribute('aria-label'); point.appendChild(title); svg.appendChild(point);
    }); host.appendChild(svg);
  }
  function analysis(options) {
    var source = options.native.querySelector('.adv-growth-result-block--trajectory'), model = source && trajectoryModel(source);
    if (!model || !Array.isArray(model.metrics)) return false;
    var root = el('div', 'vhome-a2 vhome-a2-analysis');
    root.appendChild(heading('Analiza trajektorii'));
    var meta = source.querySelector('.vtap-meta'); if (meta) root.appendChild(options.copy(meta));
    var dashboard = el('div', 'vhome-a2-dashboard'), plot = el('section', 'vhome-a2-panel vhome-a2-plot');
    var plotHeader = el('div', 'vhome-a2-plot-heading'), titles = el('div'); titles.append(el('h4', '', 'Przebieg pomiarów'), el('p', '', 'Wartości pomiarów w czasie')); plotHeader.appendChild(titles);
    var switches = el('div', 'vhome-a2-metric-switch'); switches.setAttribute('role', 'group'); switches.setAttribute('aria-label', 'Pomiar na wykresie');
    var host = el('div', 'vhome-a2-chart');
    var selected = options.metric || 'height';
    function draw() {
      if (!root.isConnected) return;
      var series = model.metrics.find(function (item) { return item.metric === selected; });
      var raw = (model.points || []).map(function (point) { return { ageMonths: point.ageMonths, value: point[selected], isCurrent: point.isCurrent }; });
      drawRawChart(host, raw, series ? series.unit || series.title : selected === 'height' ? 'cm' : selected === 'weight' ? 'kg' : 'BMI');
    }
    [['height', 'Wzrost'], ['weight', 'Masa'], ['bmi', 'BMI']].forEach(function (item) {
      var button = el('button', '', item[1]); button.type = 'button'; button.dataset.growthMetric = item[0];
      button.setAttribute('aria-pressed', String(selected === item[0]));
      button.addEventListener('click', function () {
        selected = item[0]; options.onMetric(selected);
        switches.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.growthMetric === selected)); }); draw();
      }); switches.appendChild(button);
    }); plotHeader.appendChild(switches); plot.append(plotHeader, host, el('p', 'vhome-a2-caption', 'Wyróżniony punkt: bieżąca wizyta. Wykres wartości nie jest siatką centylową.'));
    var cards = el('div', 'vhome-a2-metrics');
    var nativeCards = Array.from(source.querySelectorAll('.vtap-cards > .vtap-card'));
    nativeCards.filter(function (node) { return !node.classList.contains('vtap-hvc'); }).forEach(function (node) { cards.appendChild(options.copy(node)); });
    dashboard.append(plot, cards); root.appendChild(dashboard);
    var context = el('section', 'vhome-a2-panel vhome-a2-context'); context.appendChild(el('h4', '', 'Tempo i potencjał rodzinny'));
    var slots = el('div', 'vhome-a2-context-slots');
    ['.vgcc-stats', '.vgcc-mph', '.vgcc-target'].forEach(function (selector) { var node = options.native.querySelector(selector); if (node) slots.appendChild(options.copy(node)); });
    var bone = el('div', 'vhome-a2-bone'); bone.append(el('span', '', 'Wiek kostny'), el('strong', '', finite(options.data.boneAgeMonths) ? fmt(options.data.boneAgeMonths / 12) + ' lat' : '—')); slots.appendChild(bone);
    nativeCards.filter(function (node) { return node.classList.contains('vtap-hvc'); }).forEach(function (node) { slots.appendChild(options.copy(node)); });
    context.appendChild(slots); var dataLink = el('button', 'vhome-a2-link', 'Przejdź do danych i pomiarów ↗'); dataLink.type = 'button'; dataLink.addEventListener('click', options.onData); context.appendChild(dataLink); root.appendChild(context);
    var nativeDetails = options.copy(source); root.appendChild(details('Szczegóły odcinków i warunki oceny', nativeDetails));
    var extras = el('div', 'vhome-a2-native-extras');
    Array.from(options.native.children).forEach(function (node) {
      if (node.matches('.vgcc, .adv-growth-result-block--trajectory')) return;
      var copy = options.copy(node);
      // Preserve native alerts, consultation actions and qualifiers visibly.
      if (node.matches('[style*="--danger"]') || node.querySelector('a')) root.insertBefore(copy, dashboard);
      else extras.appendChild(copy);
    }); if (extras.children.length) root.appendChild(extras);
    options.panel.appendChild(root);
    if (w.VildaTrajectoryAnalysis) w.VildaTrajectoryAnalysis.wirePanelToggle(nativeDetails);
    var observer = new w.ResizeObserver(draw); observer.observe(plot); w.requestAnimationFrame(draw);
    return { dispose: function () { observer.disconnect(); } };
  }
  function normalized(text) { return String(text || '').replace(/[–—−]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase(); }
  function rangeData(prediction) {
    return (prediction?.methods || []).filter(function (method) { return finite(method.publikacjaCm) || finite(method.cm); }).map(function (method) {
      var value = finite(method.publikacjaCm) ? method.publikacjaCm : method.cm;
      // The renderer already clips an out-of-range publication interval. Never
      // invent a symmetric band in that case; keep its original text instead.
      var error = !method.clamped && finite(method.errorHalfWidthCm) ? method.errorHalfWidthCm : null;
      return { method: method, value: value, low: error == null ? value : value - error, high: error == null ? value : value + error, error: error };
    });
  }
  function forecasts(options) {
    var source = options.native.querySelector('.vgcc'); if (!source) return false;
    var root = el('div', 'vhome-a2 vhome-a2-forecasts'); root.appendChild(heading('Prognozy wzrostu ostatecznego', 'Konsensus, porównanie metod i warunki wiarygodności'));
    var card = options.copy(source), hero = card.querySelector('.vgcc-hero'), methods = card.querySelector('.vgcc-methods');
    if (hero) {
      var top = el('div', 'vhome-a2-forecast-top'), context = el('aside', 'vhome-a2-panel vhome-a2-forecast-context'); context.appendChild(el('h4', '', 'Kontekst prognozy'));
      card.insertBefore(top, hero); top.append(hero, context);
      ['.vgcc-mph', '.vgcc-target', '.vgcc-stats'].forEach(function (selector) { var node = card.querySelector(selector); if (node) context.appendChild(node); });
      var age = el('p', 'vhome-a2-bone', 'Wiek metrykalny / kostny: ' + fmt(options.data.currentAgeMonths / 12) + ' / ' + (finite(options.data.boneAgeMonths) ? fmt(options.data.boneAgeMonths / 12) : '—') + ' lat'); context.appendChild(age);
    }
    var prediction = options.data.finalHeightPrediction, ranges = rangeData(prediction);
    if (methods) {
      var label = el('h4', 'vhome-a2-methods-title', 'Porównanie prognoz'); methods.before(label);
      var bars = Array.from(methods.querySelectorAll('.vgcc-row')).map(function (row) {
        var name = row.querySelector('.vgcc-nm');
        var item = ranges.find(function (range) { return name && normalized(name.textContent).includes(normalized(range.method.label)); });
        return { row: row, item: item };
      }).filter(function (item) { return item.item; });
      var min = bars.length ? Math.floor(Math.min.apply(null, bars.map(function (b) { return b.item.low; })) / 5) * 5 : null;
      var max = bars.length ? Math.ceil(Math.max.apply(null, bars.map(function (b) { return b.item.high; })) / 5) * 5 : null;
      if (prediction?.source === 'consensus' && finite(prediction.cm) && finite(min) && finite(max)) {
        min = Math.min(min, Math.floor(prediction.cm / 5) * 5); max = Math.max(max, Math.ceil(prediction.cm / 5) * 5);
      }
      if (finite(min) && finite(max) && max > min) {
        methods.classList.add('vhome-a2-ranges');
        bars.forEach(function (entry) {
          var item = entry.item, x = function (value) { return (value - min) / (max - min) * 100; };
          var graphic = el('div', 'vhome-a2-range'); graphic.setAttribute('role', 'img');
          graphic.setAttribute('aria-label', item.method.label + ' · ' + fmt(item.value) + ' cm');
          function mark(cls, left, width) {
            var node = el('span', cls); node.style.left = x(left) + '%';
            if (width != null) node.style.width = width / (max - min) * 100 + '%';
            graphic.appendChild(node);
          }
          if (prediction.source === 'consensus' && finite(prediction.cm)) mark('vhome-a2-consensus', prediction.cm);
          if (item.error != null) mark('vhome-a2-error', item.low, item.high - item.low);
          mark('vhome-a2-range-dot', item.value);
          entry.row.insertBefore(graphic, entry.row.lastElementChild);
        });
        var axis = el('div', 'vhome-a2-range-axis'); [min, (min + max) / 2, max].forEach(function (value) { axis.appendChild(el('span', '', fmt(value, 0) + ' cm')); }); methods.after(axis);
      }
      var note = el('p', 'vhome-a2-caption', 'Odcinki przedstawiają przybliżone błędy poszczególnych metod, nie przedział ufności konsensusu. Opis ograniczeń i wartości obciętych pozostaje przy wyniku.'); (methods.nextElementSibling?.classList.contains('vhome-a2-range-axis') ? methods.nextElementSibling : methods).after(note);
    }
    root.appendChild(card); options.panel.appendChild(root); return { dispose: function () {} };
  }
  w.VildaHomeGrowthViews = Object.freeze({ render: function (options) { return options.tab === 'analysis' ? analysis(options) : forecasts(options); } });
})(typeof window !== 'undefined' ? window : globalThis);
