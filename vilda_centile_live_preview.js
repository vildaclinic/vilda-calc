/* Lightweight, screen-sized presentation of production centile models. This
 * module only maps supplied reference samples and patient points into SVG; it
 * does not calculate centiles, interpolate reference data, or change domains. */
(function (w) {
  'use strict';
  if (!w || w.VildaCentileLivePreview) return;
  var NS = 'http://www.w3.org/2000/svg';
  var PREFIX = 'vilda-centile-live-preview';
  var nextId = 0;

  function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
  function label(value) { return Number(value).toLocaleString('pl-PL', { maximumFractionDigits: 1 }); }
  function ticks(min, max, step) {
    var values = [];
    for (var value = Math.ceil(min / step) * step; value <= max + 0.000001; value += step) values.push(value);
    return values;
  }
  function niceStep(raw, minimum) {
    raw = Math.max(raw, minimum);
    var power = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 0.000001))));
    return [1, 2, 5, 10].map(function (factor) { return factor * power; })
      .filter(function (step) { return step >= minimum; })
      .reduce(function (best, step) { return Math.abs(step - raw) < Math.abs(best - raw) ? step : best; }, Infinity);
  }
  function path(points) {
    var started = false;
    return points.map(function (point) {
      if (!point || !finite(point.x) || !finite(point.y)) { started = false; return ''; }
      var command = started ? 'L' : 'M'; started = true;
      return command + point.x.toFixed(2) + ',' + point.y.toFixed(2);
    }).join(' ');
  }
  function draw(doc, data, width, height) {
    var domain = data.plot;
    width = Math.max(1, width); height = Math.max(1, height);
    var plot = Object.assign({}, domain, {
      x: width < 400 ? 42 : 50, y: 28,
      w: Math.max(1, width - (width < 400 ? 42 : 50) - 42), h: Math.max(1, height - 68)
    });
    function node(tag, attrs, content) {
      var result = doc.createElementNS(NS, tag);
      Object.keys(attrs || {}).forEach(function (name) { result.setAttribute(name, String(attrs[name])); });
      if (content !== undefined) result.textContent = String(content);
      return result;
    }
    function sx(age) { return plot.x + (age - plot.ageMin) / (plot.ageMax - plot.ageMin) * plot.w; }
    function sy(value) { return plot.y + (plot.maxY - value) / (plot.maxY - plot.minY) * plot.h; }
    var svg = node('svg', {
      class: PREFIX, viewBox: '0 0 ' + width + ' ' + height, width: width, height: height,
      role: 'img', 'aria-label': (data.metric === 'height' ? 'Wzrost' : 'Waga') + ': podgląd centyli 3, 50 i 97 oraz przebiegu pacjenta.',
      'data-plot-x': plot.x, 'data-plot-y': plot.y, 'data-plot-width': plot.w, 'data-plot-height': plot.h,
      'data-age-min': plot.ageMin, 'data-age-max': plot.ageMax, 'data-min-y': plot.minY, 'data-max-y': plot.maxY,
      'data-source': data.source, 'data-metric': data.metric
    });
    var clipId = PREFIX + '-clip-' + (++nextId);
    var defs = node('defs'), clip = node('clipPath', { id: clipId });
    clip.appendChild(node('rect', { x: plot.x, y: plot.y, width: plot.w, height: plot.h }));
    defs.appendChild(clip); svg.appendChild(defs);
    var graph = node('g', { 'clip-path': 'url(#' + clipId + ')' });
    svg.appendChild(graph);
    function curvePoints(centile) {
      return (data.curves[centile] || []).map(function (value, index) {
        return finite(value) ? { x: sx(domain.ageMin + index * data.sampleStepMonths), y: sy(value) } : null;
      });
    }
    var lower = curvePoints(3), upper = curvePoints(97), segment = [];
    function band() {
      if (!segment.length) return;
      var outline = segment.map(function (item) { return item.upper; })
        .concat(segment.slice().reverse().map(function (item) { return item.lower; }));
      graph.appendChild(node('path', { d: path(outline) + ' Z', fill: '#eaf3f1', class: PREFIX + '-band' }));
      segment = [];
    }
    upper.forEach(function (point, index) {
      if (point && lower[index]) segment.push({ upper: point, lower: lower[index] });
      else band();
    });
    band();
    var spanY = domain.maxY - domain.minY;
    var yStep = niceStep(spanY / Math.max(2, Math.floor(plot.h / 62)), spanY * 32 / plot.h);
    ticks(domain.minY, domain.maxY, yStep).forEach(function (value) {
      graph.appendChild(node('line', { x1: plot.x, x2: plot.x + plot.w, y1: sy(value), y2: sy(value), stroke: '#dfe8e6', 'stroke-width': 1 }));
      svg.appendChild(node('text', { x: plot.x - 9, y: sy(value) + 4, 'text-anchor': 'end', fill: '#52676b', 'font-size': 12 }, label(value)));
    });
    var infant = domain.ageMax <= 36;
    var ageStep = infant ? plot.w < 240 ? 12 : 6 : plot.w < 300 ? 48 : 24;
    var ages = ticks(domain.ageMin, domain.ageMax, ageStep).filter(function (age) {
      return sx(age) - sx(domain.ageMin) > 28 && sx(domain.ageMax) - sx(age) > 28;
    });
    ages.unshift(domain.ageMin); ages.push(domain.ageMax);
    ages.forEach(function (age) {
      svg.appendChild(node('text', { x: sx(age), y: plot.y + plot.h + 20, 'text-anchor': 'middle', fill: '#52676b', 'font-size': 12 }, label(infant ? age : age / 12)));
    });
    svg.appendChild(node('path', { d: 'M' + plot.x + ',' + plot.y + ' V' + (plot.y + plot.h) + ' H' + (plot.x + plot.w), fill: 'none', stroke: '#bac6c8', 'stroke-width': 1 }));
    svg.appendChild(node('text', { x: plot.x, y: 17, fill: '#52676b', 'font-size': 12, 'font-weight': 600 }, (data.metric === 'height' ? 'Wzrost · ' : 'Waga · ') + data.units));
    svg.appendChild(node('text', { x: plot.x + plot.w, y: height - 3, fill: '#52676b', 'text-anchor': 'end', 'font-size': 11 }, infant ? 'Wiek · miesiące' : 'Wiek · lata'));
    var labels = [];
    [3, 50, 97].forEach(function (centile) {
      var values = curvePoints(centile);
      graph.appendChild(node('path', {
        class: PREFIX + '-centile', 'data-centile': centile, d: path(values), fill: 'none',
        stroke: centile === 50 ? '#6e9291' : '#a0b9b5', 'stroke-width': 1.35,
        'stroke-dasharray': centile === 50 ? '5 4' : 'none', 'vector-effect': 'non-scaling-stroke'
      }));
      var last = values[values.length - 1];
      if (last && last.y >= plot.y - 1 && last.y <= plot.y + plot.h + 1) labels.push({ centile: centile, y: last.y });
    });
    labels.sort(function (a, b) { return a.y - b.y; });
    labels.forEach(function (item, index) { item.labelY = Math.max(item.y, index ? labels[index - 1].labelY + 16 : plot.y + 5); });
    var shift = labels.length ? Math.max(0, labels[labels.length - 1].labelY - (plot.y + plot.h - 4)) : 0;
    labels.forEach(function (item) {
      var y = item.labelY - shift;
      if (Math.abs(y - item.y) > 1) svg.appendChild(node('path', { d: 'M' + (plot.x + plot.w + 1) + ',' + item.y + ' L' + (plot.x + plot.w + 8) + ',' + y, fill: 'none', stroke: '#9db3b3', 'stroke-width': 0.8 }));
      svg.appendChild(node('text', { x: plot.x + plot.w + 11, y: y + 4, fill: '#587679', 'font-size': 12, 'font-weight': item.centile === 50 ? 650 : 450 }, item.centile));
    });
    var points = (data.points || []).filter(function (point) { return finite(point.ageMonths) && finite(point.value); });
    var mapped = points.map(function (point) { return { x: sx(point.ageMonths), y: sy(point.value) }; });
    var colors = w.VildaCentileLiveColors;
    if (!colors) throw new Error('Brak prezentacji kolorów siatki.');
    colors.draw(doc, { defs: defs, group: graph, points: points, mapped: mapped, metric: data.metric, prefix: PREFIX });
    if (points.length) {
      var currentIndex = points.findIndex(function (point) { return point.current; });
      if (currentIndex < 0) currentIndex = points.length - 1;
      var lastPoint = points[currentIndex];
      var reading = label(lastPoint.value) + ' ' + data.units;
      var chip = colors.placeLabel({ plot: plot, mapped: mapped, pointIndex: currentIndex,
        width: reading.length * 8 + 16, height: 23 });
      // Dense histories keep the reading above the preview, rather than hiding
      // any measurement or segment under an in-plot label.
      svg.setAttribute('data-value-label', chip ? 'placed' : 'header');
      if (chip) {
        svg.appendChild(node('rect', { class: PREFIX + '-latest-label-box', x: chip.x, y: chip.y,
          width: chip.width, height: chip.height, rx: 6, fill: '#fff', stroke: '#cfdfde' }));
        svg.appendChild(node('text', { class: PREFIX + '-latest-label', x: chip.x + chip.width / 2,
          y: chip.y + 16, 'text-anchor': 'middle', fill: colors.color(colors.tone(data.metric, lastPoint.percentile)),
          'font-size': 12, 'font-weight': 700 }, reading));
      }
    }
    return { element: svg, plot: plot };
  }
  w.VildaCentileLivePreview = Object.freeze({ draw: draw });
})(typeof window !== 'undefined' ? window : globalThis);
