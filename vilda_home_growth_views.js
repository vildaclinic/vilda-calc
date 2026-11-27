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
    var box = el('div', 'vhome-a2-heading'); box.append(el('h3', '', title));
    if (note) box.appendChild(el('p', '', note)); return box;
  }
  function details(label, content) {
    var box = el('details', 'vhome-a2-details'); box.append(el('summary', '', label), content); return box;
  }
  function trajectoryModel(node) {
    try { return JSON.parse(node.getAttribute('data-vhome-trajectory')); } catch (_) { return null; }
  }
  function pointLabel(point, unit) {
    return fmt(point.ageMonths / 12) + ' lat · ' + fmt(point.value) + (unit ? ' ' + unit : '');
  }
  function drawRawChart(host, points, unit) {
    host.replaceChildren();
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
      var pos = xy(p), point = svgNode('circle', { cx: pos[0], cy: pos[1], r: p.highlighted ? 5 : 3.5,
        class: 'vhome-a2-dot' + (p.highlighted ? ' vhome-a2-current-dot' : ''), tabindex: '0', 'aria-label': p.label });
      var title = svgNode('title'); title.textContent = point.getAttribute('aria-label'); point.appendChild(title); svg.appendChild(point);
    }); host.appendChild(svg);
  }
  function earlierWarning(card, metric) {
    var worst = metric?.worst, verdict = worst?.verdict;
    if (!verdict || (verdict.t !== 'bad' && verdict.t !== 'warn') || metric.segments.length < 2 ||
        !(worst.b.ageMonths < metric.last.ageMonths)) return null;
    // patientMetricCardHtml appends its most serious segment after all phase
    // and treatment lines. Reuse its age range, signed ΔSDS and full verdict.
    var line = card.querySelector(':scope > .vtap-seg:last-child');
    if (line) line.classList.add(verdict.t === 'bad' ? 'vt-b' : 'vt-w');
    return line;
  }
  function compactMetricCard(options, source, metric) {
    // Keep the native headline and a warning from an earlier interval.
    // Full phase, treatment and segment details remain in the native card.
    var card = options.copy(source), top = card.querySelector('.top'), value = card.querySelector('.big');
    if (!top || !value) return card;
    var delta = value.querySelector('.d'), raw = card.querySelector('.sub'), verdict = card.querySelector('.vdt');
    if (delta) delta.remove();
    Array.from(value.childNodes).forEach(function (node) {
      if (node.nodeType !== 3 || !/c$/.test(node.textContent)) return;
      var suffix = el('small', '', 'c');
      node.replaceWith(d.createTextNode(node.textContent.slice(0, -1)), suffix);
    });
    if (raw) {
      // This separator is emitted by patientMetricCardHtml. Preserve its exact
      // raw values/units; the full native SDS line stays in the details.
      var separator = raw.textContent.indexOf(' · SDS ');
      if (separator !== -1) raw.textContent = raw.textContent.slice(0, separator);
    }
    var bottom = el('div', 'vhome-a2-metric-bottom');
    if (delta) { delta.classList.add('vhome-a2-metric-delta'); bottom.appendChild(delta); }
    var warning = earlierWarning(card, metric);
    if (verdict) bottom.appendChild(verdict);
    if (warning) bottom.appendChild(warning);
    card.classList.add('vhome-a2-metric-card'); card.replaceChildren(top, value);
    if (raw) card.appendChild(raw);
    if (bottom.children.length) card.appendChild(bottom);
    return card;
  }
  function text(node) { return node?.textContent.replace(/\s+/g, ' ').trim() || ''; }

  function contextRow(list, label, value, notes) {
    var details = (notes || []).filter(Boolean);
    if (!value && !details.length) return;
    var row = el('div', 'vhome-a2-context-row');
    row.appendChild(el('dt', '', label));
    if (value) row.appendChild(el('dd', 'vhome-a2-context-value', value));
    details.forEach(function (note) {
      var item = el('dd', 'vhome-a2-context-note');
      if (typeof note === 'string') item.textContent = note;
      else item.appendChild(note.cloneNode(true));
      row.appendChild(item);
    });
    list.appendChild(row);
  }

  function buildAnalysisContext(options, native, delta, periodsTitle, periodsTable) {
    var context = el('section', 'vhome-a2-panel vhome-a2-context');
    var slots = el('div', 'vhome-a2-context-slots');
    var stats = text(options.native?.querySelector('.vgcc-stats .vu'));
    var statsParts = stats.match(/^(.+?) \(([^()]*)\)$/);
    var recent = statsParts?.[1] || stats, period = statsParts?.[2] || '';
    var tempo = native.querySelector('.vtap-tempo'), sds = native.querySelector('.vtap-hvc');
    var tempoValue = text(tempo?.querySelector('.v')), tempoPeriod = text(tempo?.querySelector('.mut'));
    var verdict = tempo?.querySelector('.vtap-chip'), qualification = text(tempo?.querySelector('.note'));
    var pace = el('dl', 'vhome-a2-context-rows');
    if (recent && recent === tempoValue && (!period || !tempoPeriod || period === tempoPeriod)) {
      contextRow(pace, 'Ostatni okres', recent, [period || tempoPeriod, verdict, qualification]);
    } else {
      contextRow(pace, 'Ostatni okres', recent, [period]);
      contextRow(pace, 'Ocena tempa', tempoValue, [tempoPeriod, verdict, qualification]);
    }
    var sdsResult = sds?.querySelector('.big');
    contextRow(pace, 'SDS tempa', [text(sdsResult?.firstChild), text(sdsResult?.querySelector('.d'))].filter(Boolean).join(' · '), [
      text(sds?.querySelector('.sub')), text(sds?.querySelector('.vtap-hv-src')), text(sds?.querySelector('.vdt')),
    ]);
    if (pace.children.length) {
      var paceSection = el('section', 'vhome-a2-growth-tempo');
      paceSection.append(el(options.native ? 'h5' : 'h4', '', 'Tempo wzrastania'), pace);
      slots.appendChild(paceSection);
    }

    if (options.native) {
      var family = el('section', 'vhome-a2-growth-family'), familyRows = el('dl', 'vhome-a2-context-rows');
      var mph = options.native.querySelector('.vgcc-mph');
      contextRow(familyRows, 'Potencjał genetyczny (MPH)', text(mph?.querySelector('b')), [text(mph?.querySelector('.vgcc-mph-cent'))]);
      if (delta) contextRow(familyRows, 'hSDS − mpSDS', text(delta).slice(text(delta.querySelector('strong')).length).trim());
      var boneAge = options.data.boneAgeMonths;
      contextRow(familyRows, 'Wiek kostny', finite(boneAge) ? fmt(boneAge / 12) + ' lat' : '—');
      family.append(el('h5', '', 'Potencjał rodzinny i wiek kostny'), familyRows);
      var target = options.native.querySelector('.vgcc-target');
      if (target) family.appendChild(options.copy(target));
      slots.appendChild(family);
    }
    if (periodsTitle && periodsTable) {
      var label = text(periodsTitle);
      var periods = el('section', 'vhome-a2-growth-periods'), table = options.copy(periodsTable);
      table.setAttribute('aria-label', label);
      periods.append(el('h5', '', label), table);
      slots.appendChild(periods);
    }

    if (!slots.children.length) return null;
    if (options.native) context.appendChild(el('h4', '', 'Tempo i potencjał rodzinny'));
    context.appendChild(slots);
    if (options.onData) {
      var dataLink = el('button', 'vhome-a2-link', 'Przejdź do danych i pomiarów');
      dataLink.type = 'button';
      dataLink.addEventListener('click', options.onData);
      context.appendChild(dataLink);
    }
    return context;
  }

  function analysisIntervals(options, native, cards, displayedWarnings) {
    var body = el('div', 'vtap vhome-a2-intervals');
    var segmentDetails = native.querySelector('.vtap-det');
    var sourceTable = segmentDetails?.querySelector('.vtap-tb');
    if (sourceTable) {
      var table = options.copy(sourceTable), label = text(segmentDetails.querySelector('summary'));
      table.tabIndex = 0;
      table.setAttribute('role', 'region');
      table.setAttribute('aria-label', label);
      body.append(el('h5', '', label), table);
    } else if (segmentDetails) {
      body.appendChild(options.copy(segmentDetails));
    }

    var notes = el('div', 'vhome-a2-segment-notes');
    cards.forEach(function (card, index) {
      var endpoints = text(card.querySelector('.sub')).split(' · SDS ')[1];
      var qualifiers = Array.from(card.querySelectorAll('.vtap-pac-l, .vtap-seg')).filter(function (note) {
        return displayedWarnings.get(index) !== text(note);
      });
      if (!endpoints && !qualifiers.length) return;
      var item = el('section');
      item.appendChild(el('h5', '', text(card.querySelector('.nm'))));
      if (endpoints) item.appendChild(el('p', '', 'SDS w całym okresie · ' + endpoints));
      qualifiers.forEach(function (note) { item.appendChild(options.copy(note)); });
      notes.appendChild(item);
    });
    if (notes.children.length) body.appendChild(notes);
    Array.from(native.children).forEach(function (node) {
      if (node.matches('summary, .vtap-meta, .vtap-cards, .vtap-tempo, .vtap-det, .vtap-flag, .vtap-row:has(.vtap-chip.vw)')) return;
      body.appendChild(options.copy(node));
    });
    return body.children.length ? details('Odcinki i warunki oceny', body) : null;
  }

  function analysis(options) {
    var source = options.saved || options.native?.querySelector('.adv-growth-result-block--trajectory');
    var model = source && trajectoryModel(source);
    if (!model || !Array.isArray(model.metrics)) return false;
    var native = source.querySelector('.vtap-main');
    if (!native) return false;
    var root = el('div', 'vhome-a2 vhome-a2-analysis');
    root.appendChild(heading('Analiza trajektorii'));
    var meta = native.querySelector('.vtap-meta');
    if (meta) {
      var metaCopy = options.copy(meta);
      metaCopy.querySelectorAll('.vtap-mchip .k').forEach(function (label) {
        label.textContent = label.textContent.replace(/^(?:🧬|💉|⬇️?)\s*/u, '');
      });
      root.appendChild(metaCopy);
    }
    native.querySelectorAll(':scope > .vtap-flag, :scope > .vtap-row:has(.vtap-chip.vw)').forEach(function (node) {
      var warning = options.copy(node);
      warning.classList.add('vhome-a2-warning');
      root.appendChild(warning);
    });
    var extras = el('div', 'vhome-a2-native-extras'), delta, periodsTitle, periodsTable;
    Array.from(options.native?.children || []).forEach(function (node) {
      if (node.matches('.vgcc, .adv-growth-result-block--trajectory')) return;
      if (node.matches('.velocity-periods-title')) periodsTitle = node;
      else if (node.matches('.velocity-periods-table')) periodsTable = node;
      else if (/^hSDS\s*[-−]\s*mpSDS:$/i.test(text(node.querySelector(':scope > strong')))) delta = node;
      else if (node.matches('[style*="--danger"]') || node.querySelector('a')) root.appendChild(options.copy(node));
      else extras.appendChild(options.copy(node));
    });

    var dashboard = el('div', 'vhome-a2-dashboard'), plot = el('section', 'vhome-a2-panel vhome-a2-plot');
    var plotTitle = el('h4', 'vhome-a2-plot-heading');
    var reading = el('p', 'vhome-a2-reading'), currentReading = el('span');
    var readingLabel = options.saved ? 'Ostatni zapisany pomiar' : 'Bieżąca wizyta';
    reading.append(el('strong', '', readingLabel), currentReading);
    var host = el('div', 'vhome-a2-chart');
    host.id = 'vhomeGrowthAnalysisChart';
    var pointList = el('ol', 'vhome-a2-point-list');
    pointList.tabIndex = 0;
    var pointDetails = el('details', 'vhome-a2-point-values');
    pointDetails.append(el('summary', '', 'Wartości punktów'), pointList);
    plot.append(plotTitle, reading, host, el('p', 'vhome-a2-plot-caption', 'Wykres wartości pomiarów. Siatki centylowe są dostępne osobno.'), pointDetails);
    var cards = el('div', 'vhome-a2-metrics');
    cards.setAttribute('role', 'group');
    cards.setAttribute('aria-label', 'Parametr na wykresie');
    var nativeCards = Array.from(native.querySelectorAll('.vtap-cards > .vtap-card:not(.vtap-hvc)'));
    var metricIndices = new Map(model.metrics.map(function (item, index) { return [item.metric, index]; }));
    var buttons = new Map(), displayedWarnings = new Map();
    var selected = options.metric || 'height', renderedWidth;
    function draw() {
      if (!root.isConnected) return;
      renderedWidth = host.clientWidth;
      var series = model.metrics[metricIndices.get(selected)];
      var unit = series ? series.unit || series.title : selected === 'height' ? 'cm' : selected === 'weight' ? 'kg' : 'BMI';
      var points = (model.points || []).filter(function (point) { return finite(point.ageMonths) && finite(point[selected]); })
        .map(function (point) { return { ageMonths: point.ageMonths, value: point[selected], isCurrent: point.isCurrent }; });
      var currentPoint = options.saved ? points[points.length - 1] : points.find(function (point) { return point.isCurrent; });
      points.forEach(function (point) {
        point.highlighted = point === currentPoint;
        point.label = (point.highlighted ? readingLabel + ' · ' : '') + pointLabel(point, unit);
      });
      drawRawChart(host, points, unit);
      currentReading.textContent = currentPoint ? pointLabel(currentPoint, unit) : 'Brak pomiaru w tej serii';
      pointDetails.hidden = !points.length;
      pointList.replaceChildren(...points.map(function (point) { return el('li', '', point.label); }));
    }
    [['height', 'Wzrost'], ['weight', 'Masa'], ['bmi', 'BMI']].forEach(function (item) {
      var index = metricIndices.get(item[0]), cardSource = nativeCards[index];
      var card = cardSource ? compactMetricCard(options, cardSource, model.metrics[index]) : el('div', 'vtap-card vhome-a2-metric-card');
      if (!cardSource) card.append(el('span', 'nm', item[1]), el('p', 'sub', 'Brak podsumowania dla tego parametru'));
      var name = text(card.querySelector('.nm')) || item[1];
      var earlier = card.querySelector('.vtap-seg');
      if (earlier) displayedWarnings.set(index, text(earlier));
      var button = el('button', 'vhome-a2-metric-trigger');
      button.type = 'button';
      button.dataset.growthMetric = item[0];
      button.setAttribute('aria-controls', host.id);
      button.setAttribute('aria-label', name);
      var active = selected === item[0];
      button.setAttribute('aria-pressed', String(active));
      if (active) plotTitle.textContent = 'Przebieg pomiarów · ' + name;
      button.addEventListener('click', function () {
        if (selected === item[0]) return;
        selected = item[0];
        options.onMetric(selected);
        buttons.forEach(function (control, key) { control.setAttribute('aria-pressed', String(key === selected)); });
        plotTitle.textContent = 'Przebieg pomiarów · ' + name;
        draw();
      });
      buttons.set(item[0], button);
      card.appendChild(button);
      cards.appendChild(card);
    });
    dashboard.append(el('h4', '', 'Wyniki pomiarów'), cards, plot);
    root.appendChild(dashboard);
    var intervals = analysisIntervals(options, native, nativeCards, displayedWarnings);
    if (intervals) root.appendChild(intervals);
    var context = buildAnalysisContext(options, native, delta, periodsTitle, periodsTable);
    if (context) root.appendChild(context);
    if (extras.children.length) root.appendChild(extras);
    options.panel.appendChild(root);
    var observer = new w.ResizeObserver(function () { if (host.clientWidth !== renderedWidth) draw(); });
    observer.observe(host);
    draw();
    return { dispose: function () { observer.disconnect(); } };
  }
  function normalized(text) { return String(text || '').replace(/[–—−]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase(); }
  function rangeData(prediction) {
    return (prediction?.methods || []).filter(function (method) { return finite(method.publikacjaCm) || finite(method.cm); }).map(function (method) {
      var value = finite(method.publikacjaCm) ? method.publikacjaCm : method.cm;
      // The native row below decides whether its publication interval is
      // symmetric. The consensus clamp flag can differ from the publication.
      var error = finite(method.errorHalfWidthCm) ? method.errorHalfWidthCm : null;
      return { method: method, value: value, low: error == null ? value : value - error, high: error == null ? value : value + error, error: error };
    });
  }
  function forecastContextRow(rows, label, result, note) {
    if (!result) return;
    var row = el('div', 'vhome-a2-forecast-row');
    var detail = el('dd');
    detail.appendChild(el('strong', '', result));
    if (note) detail.appendChild(el('span', '', note));
    row.append(el('dt', '', label), detail); rows.appendChild(row);
  }
  function forecastContext(card, data) {
    var context = el('aside', 'vhome-a2-forecast-context');
    var rows = el('dl', 'vhome-a2-forecast-rows');
    var mph = card.querySelector('.vgcc-mph');
    if (mph) {
      forecastContextRow(rows, 'Potencjał genetyczny wzrostu (MPH)', mph.querySelector('b')?.textContent,
        mph.querySelector('.vgcc-mph-cent')?.textContent);
      mph.remove();
    }
    var tempo = card.querySelector('.vgcc-stats');
    if (tempo) {
      var text = tempo.querySelector('.vu')?.textContent.trim() || '';
      var parts = text.match(/^(.+?)\s*\(([^)]+)\)$/);
      forecastContextRow(rows, 'Tempo wzrastania', parts ? parts[1] : text, parts?.[2]);
      tempo.remove();
    }
    context.appendChild(el('h4', '', 'Kontekst prognozy'));
    if (rows.childElementCount) context.appendChild(rows);
    var target = card.querySelector('.vgcc-target');
    if (target) context.appendChild(target);
    var age = finite(data.currentAgeMonths) ? fmt(data.currentAgeMonths / 12) : '—';
    var bone = finite(data.boneAgeMonths) ? fmt(data.boneAgeMonths / 12) : '—';
    context.appendChild(el('p', 'vhome-a2-bone', 'Wiek metrykalny / kostny: ' + age + ' / ' + bone + ' lat'));
    return context;
  }
  function forecasts(options) {
    var source = options.native.querySelector('.vgcc'); if (!source) return false;
    var root = el('div', 'vhome-a2 vhome-a2-forecasts'); root.appendChild(heading('Prognozy wzrostu ostatecznego'));
    var card = options.copy(source), hero = card.querySelector('.vgcc-hero'), methods = card.querySelector('.vgcc-methods');
    if (hero) {
      var top = el('div', 'vhome-a2-forecast-top');
      card.insertBefore(top, hero); top.append(hero, forecastContext(card, options.data));
      var conditions = card.querySelectorAll(':scope > .vgcc-hint, :scope > .vgcc-det');
      if (conditions.length) {
        var interpretation = el('section', 'vhome-a2-forecast-conditions');
        interpretation.append(el('h4', '', 'Warunki interpretacji'), ...conditions);
        top.after(interpretation);
      }
    }
    var prediction = options.data.finalHeightPrediction, ranges = rangeData(prediction);
    if (methods) {
      var label = el('h4', 'vhome-a2-methods-title', 'Porównanie prognoz'); methods.before(label);
      var bars = Array.from(methods.querySelectorAll('.vgcc-row')).map(function (row) {
        var name = row.querySelector('.vgcc-nm');
        if (!name) return null;
        var item = ranges.find(function (range) { return normalized(name.textContent).includes(normalized(range.method.label)); });
        if (row.lastElementChild !== name) row.lastElementChild.classList.add('vhome-a2-method-value');
        var status = row.classList.contains('is-excl') ? 'Poza konsensusem' : row.classList.contains('is-pref') ? 'Preferowana' : '';
        if (status && !name.querySelector('.vgcc-tag')) {
          var label = el('div'); name.replaceWith(label);
          label.append(name, el('span', 'vhome-a2-method-status', status));
        }
        if (item && !row.querySelector('.vgcc-pm')?.textContent.includes('±'))
          item = Object.assign({}, item, { error: null, low: item.value, high: item.value });
        return { row: row, item: item };
      }).filter(function (entry) { return entry?.item; });
      var min = bars.length ? Math.floor(Math.min.apply(null, bars.map(function (b) { return b.item.low; })) / 5) * 5 : null;
      var max = bars.length ? Math.ceil(Math.max.apply(null, bars.map(function (b) { return b.item.high; })) / 5) * 5 : null;
      if (prediction?.source === 'consensus' && finite(prediction.cm) && finite(min) && finite(max)) {
        min = Math.min(min, Math.floor(prediction.cm / 5) * 5); max = Math.max(max, Math.ceil(prediction.cm / 5) * 5);
      }
      if (finite(min) && finite(max) && max > min) {
        methods.classList.add('vhome-a2-ranges');
        bars.forEach(function (entry) {
          var item = entry.item, x = function (value) { return (value - min) / (max - min) * 100; };
          var graphic = svgNode('svg', { class: 'vhome-a2-range', width: '100%', height: 44, role: 'img',
            'aria-label': item.method.label + ' · ' + fmt(item.value) + ' cm' });
          function line(cls, from, to, y1, y2) {
            graphic.appendChild(svgNode('line', { class: cls, x1: x(from) + '%', x2: x(to) + '%', y1: y1, y2: y2 }));
          }
          line('vhome-a2-range-grid', min, max, 22, 22);
          if (prediction.source === 'consensus' && finite(prediction.cm)) line('vhome-a2-consensus', prediction.cm, prediction.cm, 0, 44);
          if (item.error != null) {
            line('vhome-a2-error', item.low, item.high, 22, 22);
            line('vhome-a2-error-cap', item.low, item.low, 15, 29); line('vhome-a2-error-cap', item.high, item.high, 15, 29);
          }
          graphic.appendChild(svgNode('circle', { class: 'vhome-a2-range-dot', cx: x(item.value) + '%', cy: 22, r: 5 }));
          entry.row.insertBefore(graphic, entry.row.lastElementChild);
        });
        var axis = el('div', 'vhome-a2-range-axis'); [min, (min + max) / 2, max].forEach(function (value) { axis.appendChild(el('span', '', fmt(value, 0) + ' cm')); });
        var axisRow = el('div', 'vhome-a2-axis-row'); axisRow.append(el('span'), axis, el('span')); methods.appendChild(axisRow);
        methods.after(el('p', 'vhome-a2-caption', 'Odcinki przedstawiają przybliżone błędy poszczególnych metod, nie przedział ufności konsensusu. Opis ograniczeń i wartości obciętych pozostaje przy wyniku.'));
      }
    }
    root.appendChild(card); options.panel.appendChild(root); return { dispose: function () {} };
  }
  w.VildaHomeGrowthViews = Object.freeze({ render: function (options) { return options.tab === 'analysis' ? analysis(options) : forecasts(options); } });
})(typeof window !== 'undefined' ? window : globalThis);
