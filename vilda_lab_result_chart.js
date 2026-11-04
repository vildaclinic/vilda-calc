/* Historia badań: wykres wyłącznie zapisanych wyników i zapisanych zakresów.
 * Nie dobiera norm, nie ocenia pacjenta i nie zmienia danych modelu historii.
 * Każdy odcinek odniesienia należy do daty konkretnego zapisu; nie interpoluje
 * norm między badaniami i nie rozciąga ostatniej normy na wcześniejsze wyniki.
 */
(function (root) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var COLORS = { within: '#1D9E75', below: '#d8632a', above: '#b91c1c', neutral: '#087f89' };
  var SAMPLES = ['badanie', 'kontrola'];
  var chooserId = 0;

  function finite(value) { return typeof value === 'number' && isFinite(value); }
  function unit(value) { return String(value || '').trim().replace(/\s+/g, ' ').replace(/µ/g, 'μ'); }
  function day(iso) {
    var parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!parts) return null;
    var stamp = Date.parse(iso + 'T12:00:00Z');
    if (!isFinite(stamp)) return null;
    // Parse the recorded calendar day in explicit UTC, without formatting a
    // current/local day or accepting Date.parse's rollover of e.g. 30 February.
    var parsed = new Date(stamp);
    return parsed.getUTCFullYear() === Number(parts[1]) && parsed.getUTCMonth() + 1 === Number(parts[2])
      && parsed.getUTCDate() === Number(parts[3]) ? stamp : null;
  }
  function defaultNumber(value) { return value.toLocaleString('pl-PL', { maximumSignificantDigits: 4 }); }
  function defaultDate(iso) { return iso.split('-').reverse().join('.'); }
  function node(doc, tag, className, content, svg) {
    var element = svg ? doc.createElementNS(NS, tag) : doc.createElement(tag);
    if (className) element.setAttribute('class', className);
    if (content != null) element.textContent = String(content);
    return element;
  }
  function attr(element, attributes) {
    Object.keys(attributes).forEach(function (key) { element.setAttribute(key, String(attributes[key])); });
    return element;
  }
  function coordinate(value) { return value.toFixed(4); }
  function usableNorms(description, displayUnit) {
    return (Array.isArray(description.norms) ? description.norms : []).filter(function (norm) {
      return norm && norm.eligible === true && unit(norm.unit) === displayUnit
        && (finite(norm.low) || finite(norm.high))
        && (!finite(norm.low) || !finite(norm.high) || norm.low <= norm.high);
    });
  }
  function normSignature(norms) {
    return JSON.stringify(norms.map(function (norm) {
      return [finite(norm.low) ? norm.low : null, finite(norm.high) ? norm.high : null,
        unit(norm.unit), norm.label || '', norm.conditional === true];
    }));
  }

  function render(doc, view, options) {
    options = options || {};
    if (!doc || typeof doc.createElementNS !== 'function' || !view || !view.chart || typeof options.describe !== 'function') return null;
    var displayUnit = unit(view.unit || view.chart.unit);
    if (!displayUnit) return null;
    var formatNumber = typeof options.formatNumber === 'function' ? options.formatNumber : defaultNumber;
    var formatDate = typeof options.formatDate === 'function' ? options.formatDate : defaultDate;
    var sourceEntries = Array.isArray(view.entries) ? view.entries : [];
    var entries = sourceEntries.map(function (entry, order) {
      var stamp = day(entry.dateISO), description;
      if (stamp == null || SAMPLES.indexOf(entry.dateSource) === -1) return null;
      try { description = options.describe(entry); } catch (_) { return null; }
      if (!description || unit(description.unit) !== displayUnit) return null;
      return { entry: entry, order: order, stamp: stamp, description: description,
        norms: usableNorms(description, displayUnit) };
    }).filter(Boolean).sort(function (a, b) { return a.stamp - b.stamp || a.order - b.order; });
    var points = (Array.isArray(view.chart.points) ? view.chart.points : []).map(function (point, order) {
      if (!point || !finite(point.v) || day(point.dateISO) == null) return null;
      var saved = entries.filter(function (item) { return item.entry.noteId === point.noteId && item.entry.dateISO === point.dateISO; })[0];
      // The history model supplies exact, comparable points. The presentation must
      // independently agree that this entry still has an exact value.
      if (!saved || !finite(saved.description.value) || saved.description.value !== point.v) return null;
      return { point: point, saved: saved, stamp: saved.stamp, order: order };
    }).filter(Boolean).sort(function (a, b) { return a.stamp - b.stamp || a.order - b.order; });
    if (!points.length) return null;

    var timeline = [];
    entries.forEach(function (item) {
      var sameDate = timeline[timeline.length - 1];
      if (!sameDate || sameDate.stamp !== item.stamp) timeline.push({ stamp: item.stamp, date: item.entry.dateISO, records: [item] });
      else sameDate.records.push(item);
    });
    timeline.forEach(function (date) {
      var first = date.records[0], signature = normSignature(first.norms);
      // Different ranges on the same date cannot become one shared green band.
      date.norms = date.records.every(function (item) { return normSignature(item.norms) === signature; }) ? first.norms : [];
    });
    var values = points.map(function (point) { return point.point.v; });
    timeline.forEach(function (date) {
      date.norms.forEach(function (norm) {
        if (finite(norm.low)) values.push(norm.low);
        if (finite(norm.high)) values.push(norm.high);
      });
    });
    var smallest = Math.min.apply(Math, values), largest = Math.max.apply(Math, values);
    var low = Math.min(0, smallest), high = Math.max(0, largest);
    var span = high - low;
    if (!finite(span)) return null;
    if (span === 0) { high = low + 1; span = 1; }
    var padding = span * 0.12;
    if (low < 0 && finite(low - padding)) low -= padding;
    if (finite(high + padding)) high += padding;
    span = high - low;
    if (!finite(span) || span <= 0) return null;
    var firstStamp = timeline[0].stamp, lastStamp = timeline[timeline.length - 1].stamp;
    var x = function (stamp) { return firstStamp === lastStamp ? 50 : 8 + (stamp - firstStamp) / (lastStamp - firstStamp) * 84; };
    var y = function (value) { return 92 - (value - low) / span * 84; };

    var host = node(doc, 'div', 'vilda-lab-result-chart');
    var area = host.appendChild(node(doc, 'div', 'vilda-lab-result-chart-area'));
    var ticks = area.appendChild(node(doc, 'div', 'vilda-lab-result-chart-y'));
    ticks.setAttribute('aria-hidden', 'true');
    [high, (high + low) / 2, low].forEach(function (value) {
      ticks.appendChild(node(doc, 'span', '', formatNumber(value)));
    });
    var plot = area.appendChild(node(doc, 'div', 'vilda-lab-result-chart-plot'));
    var svg = plot.appendChild(node(doc, 'svg', 'vilda-lab-result-chart-svg', null, true));
    attr(svg, { viewBox: '0 0 100 100', preserveAspectRatio: 'none', role: 'img',
      'aria-label': (view.label || view.test || '') + '. ' + points.length + ' dokładnych wyników. Jednostka: ' + displayUnit + '. Zakresy odniesienia z poszczególnych zapisów.' });
    var grid = svg.appendChild(node(doc, 'g', 'vilda-lab-result-chart-grid', null, true));
    [high, (high + low) / 2, low].forEach(function (value) {
      attr(grid.appendChild(node(doc, 'line', '', null, true)), { x1: 0, x2: 100, y1: coordinate(y(value)), y2: coordinate(y(value)), stroke: '#dce7e9', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' });
    });
    var references = svg.appendChild(node(doc, 'g', 'vilda-lab-result-chart-references', null, true));
    timeline.forEach(function (date, index) {
      var left = index === 0 ? 0 : (x(date.stamp) + x(timeline[index - 1].stamp)) / 2;
      var right = index === timeline.length - 1 ? 100 : (x(date.stamp) + x(timeline[index + 1].stamp)) / 2;
      date.norms.forEach(function (norm) {
        var label = formatDate(date.date) + ': ' + (norm.label ? norm.label + ' · ' : '') + norm.text;
        var bounds = { 'data-date': date.date, 'data-norm': norm.text || '', 'data-low': finite(norm.low) ? norm.low : '', 'data-high': finite(norm.high) ? norm.high : '' };
        var colorable = date.norms.length === 1 && norm.conditional !== true && ['within', 'below', 'above'].indexOf(norm.tone) !== -1;
        if (colorable && finite(norm.low) && finite(norm.high)) {
          var band = references.appendChild(node(doc, 'rect', 'vilda-lab-result-chart-band', null, true));
          attr(band, Object.assign({ x: coordinate(left), width: coordinate(right - left), y: coordinate(y(norm.high)), height: coordinate(Math.max(0, y(norm.low) - y(norm.high))), fill: COLORS.within, 'fill-opacity': 0.12 }, bounds));
          band.appendChild(node(doc, 'title', '', label, true));
        }
        [norm.low, norm.high].filter(finite).forEach(function (bound) {
          var line = references.appendChild(node(doc, 'line', 'vilda-lab-result-chart-bound', null, true));
          attr(line, Object.assign({ x1: coordinate(left), x2: coordinate(right), y1: coordinate(y(bound)), y2: coordinate(y(bound)), stroke: colorable ? '#659c88' : '#779aa2', 'stroke-dasharray': '3 3', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }, bounds));
          line.appendChild(node(doc, 'title', '', label, true));
        });
      });
    });

    var gaps = (Array.isArray(view.chart.gaps) ? view.chart.gaps : []).map(function (gap) { return day(gap.dateISO); }).filter(function (stamp) { return stamp != null; });
    var counts = {};
    points.forEach(function (point) { counts[point.stamp] = (counts[point.stamp] || 0) + 1; });
    var previous = null;
    points.forEach(function (point) {
      var disconnected = previous && (counts[previous.stamp] > 1 || counts[point.stamp] > 1 || gaps.some(function (gap) { return gap >= previous.stamp && gap <= point.stamp; }));
      if (previous && !disconnected) {
        attr(svg.appendChild(node(doc, 'line', 'vilda-lab-result-chart-line', null, true)), { x1: coordinate(x(previous.stamp)), x2: coordinate(x(point.stamp)), y1: coordinate(y(previous.point.v)), y2: coordinate(y(point.point.v)), stroke: COLORS.neutral, 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke' });
      }
      previous = point;
    });
    function pointTone(point) {
      var tone = point.saved.description.tone;
      return Object.prototype.hasOwnProperty.call(COLORS, tone) ? tone : 'neutral';
    }
    function shownValue(point) {
      return point.saved.entry.display || point.saved.entry.raw || formatNumber(point.point.v) + ' ' + displayUnit;
    }
    function pointTitle(point) {
      return (view.label || view.test || '') + ': ' + shownValue(point) + ' · ' + formatDate(point.saved.entry.dateISO)
        + ' · Norma: ' + (point.saved.description.normText || '—');
    }
    // Two records with the same date and exact value share the same real
    // coordinate. One control opens a choice instead of covering an older
    // record with a second button or inventing a different result position.
    var groups = [], groupByPosition = Object.create(null);
    points.forEach(function (point) {
      var key = point.stamp + '|' + point.point.v;
      if (!groupByPosition[key]) {
        groupByPosition[key] = [];
        groups.push(groupByPosition[key]);
      }
      groupByPosition[key].push(point);
    });
    // This unscaled SVG uses percentages for each real coordinate and actual
    // CSS pixels for each 44 px target. It never scales button text or hit areas
    // with the data viewBox and needs no generated inline CSS.
    var pointLayer = plot.appendChild(node(doc, 'svg', 'vilda-lab-result-chart-point-layer', null, true));
    attr(pointLayer, { width: '100%', height: '100%', role: 'group', 'aria-label': 'Otwórz zapisany wynik' });
    groups.forEach(function (group) {
      var point = group[0], entry = point.saved.entry;
      var tone = pointTone(point);
      if (!group.every(function (item) { return pointTone(item) === tone; })) tone = 'neutral';
      var title = pointTitle(point);
      var target = pointLayer.appendChild(node(doc, 'foreignObject', 'vilda-lab-result-chart-target', null, true));
      attr(target, { x: coordinate(x(point.stamp)) + '%', y: coordinate(y(point.point.v)) + '%', width: 44, height: 44, transform: 'translate(-22 -22)' });
      var control = target.appendChild(node(doc, 'button', 'vilda-lab-result-chart-point'));
      attr(control, { type: 'button', 'data-value': point.point.v, 'data-tone': tone,
        'aria-label': title + '. Otwórz wynik', title: title });
      control.appendChild(node(doc, 'span', 'vilda-lab-result-chart-dot'));
      if (group.length === 1) {
        control.setAttribute('data-note-id', entry.noteId || '');
        if (typeof options.openNote === 'function' && entry.noteId) control.addEventListener('click', function () { options.openNote(entry.noteId); });
        return;
      }
      var chooser = host.appendChild(node(doc, 'div', 'vilda-lab-result-chart-chooser'));
      chooser.hidden = true;
      attr(chooser, { id: 'vilda-lab-chart-choice-' + (++chooserId), role: 'group', 'aria-label': 'Wybierz wynik z tego punktu' });
      attr(control, { 'data-count': group.length, 'aria-expanded': 'false', 'aria-controls': chooser.id,
        'aria-label': (view.label || view.test || '') + ': ' + shownValue(point) + ' · ' + formatDate(entry.dateISO) + '. Wyniki w tym punkcie: ' + group.length + '. Wybierz wynik.',
        title: 'Wyniki w tym punkcie: ' + group.length + ' · ' + formatDate(entry.dateISO) });
      control.appendChild(node(doc, 'span', 'vilda-lab-result-chart-count', group.length)).setAttribute('aria-hidden', 'true');
      chooser.appendChild(node(doc, 'p', 'vilda-lab-result-chart-chooser-title', 'Wyniki z ' + formatDate(entry.dateISO)));
      var choices = group.map(function (item) {
        var row = item.saved.entry, choice = chooser.appendChild(node(doc, 'button', 'vilda-lab-result-chart-choice'));
        attr(choice, { type: 'button', 'data-note-id': row.noteId || '', 'data-tone': pointTone(item), 'aria-label': pointTitle(item) + '. Otwórz wynik' });
        choice.appendChild(node(doc, 'span', 'vilda-lab-result-chart-choice-value', shownValue(item)));
        choice.appendChild(node(doc, 'time', 'vilda-lab-result-chart-choice-date', formatDate(row.dateISO))).setAttribute('datetime', row.dateISO);
        choice.appendChild(node(doc, 'span', 'vilda-lab-result-chart-choice-norm', 'Norma: ' + (item.saved.description.normText || '—')));
        if (typeof options.openNote === 'function' && row.noteId) choice.addEventListener('click', function () {
          chooser.hidden = true;
          control.setAttribute('aria-expanded', 'false');
          control.focus();
          options.openNote(row.noteId);
        });
        return choice;
      });
      control.addEventListener('click', function () {
        chooser.hidden = !chooser.hidden;
        control.setAttribute('aria-expanded', String(!chooser.hidden));
        if (!chooser.hidden && choices.length) choices[0].focus();
      });
      chooser.addEventListener('keydown', function (event) {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        chooser.hidden = true;
        control.setAttribute('aria-expanded', 'false');
        control.focus();
      });
    });
    var dates = area.appendChild(node(doc, 'div', 'vilda-lab-result-chart-x'));
    dates.setAttribute('aria-hidden', 'true');
    dates.appendChild(node(doc, 'span', '', formatDate(timeline[0].date)));
    if (firstStamp !== lastStamp) dates.appendChild(node(doc, 'span', '', formatDate(timeline[timeline.length - 1].date)));
    return host;
  }

  root.VildaLabResultChart = Object.freeze({ version: '1.0.0', render: render });
})(typeof window !== 'undefined' ? window : globalThis);
