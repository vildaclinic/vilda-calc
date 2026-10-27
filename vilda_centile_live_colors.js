/* Presentation of already-calculated centiles, using the existing height and
 * mass-for-age boundaries from getProfessionalSummaryLineTone / VildaMasa.
 * No source data, centile calculation or interpretation thresholds change.
 * Gradients interpolate endpoint colors only, never clinical measurements.
 * The full view keeps the production reference canvas and adds screen-sized
 * SVG points, so both single and dual charts stay readable after resizing. */
(function (w) {
  'use strict';
  if (!w || w.VildaCentileLiveColors) return;
  var NS = 'http://www.w3.org/2000/svg';
  var palette = Object.freeze({ neutral: '#087c80', warn: '#b97519', danger: '#bd4b50', unknown: '#7c8b90' });
  var nextId = 0;
  function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
  function tone(metric, percentile) {
    if (!finite(percentile)) return 'unknown';
    if (metric === 'height') return percentile <= 3 ? 'danger' : percentile < 10 || percentile > 97 ? 'warn' : 'neutral';
    if (metric === 'weight') {
      var mass = w.VildaMasa && typeof w.VildaMasa.kategoria === 'function' ? w.VildaMasa.kategoria(percentile) : null;
      if (mass && mass.klucz !== 'brak') return mass.kolor === 'alert' ? 'danger' : mass.kolor === 'improve' ? 'warn' : 'neutral';
      return percentile < 3 || percentile >= 97 ? 'danger' : percentile < 10 || percentile >= 90 ? 'warn' : 'neutral';
    }
    return 'unknown';
  }
  function color(value) { return palette[value] || palette.unknown; }
  function colorAt(metric, points, age) {
    var list = (points || []).filter(function (point) { return finite(point.ageMonths) && finite(point.value); }).slice().sort(function (a, b) { return a.ageMonths - b.ageMonths; });
    if (!list.length) return color('unknown');
    var rightIndex = list.findIndex(function (point) { return point.ageMonths >= age; });
    if (rightIndex <= 0) return color(tone(metric, list[rightIndex < 0 ? list.length - 1 : 0].percentile));
    var left = list[rightIndex - 1], right = list[rightIndex];
    var fraction = Math.max(0, Math.min(1, (age - left.ageMonths) / (right.ageMonths - left.ageMonths)));
    var a = color(tone(metric, left.percentile)), b = color(tone(metric, right.percentile));
    if (fraction === 1 || a === b) return b;
    if (!fraction) return a;
    var channels = [1, 3, 5].map(function (offset) { return Math.round(parseInt(a.slice(offset, offset + 2), 16) * (1 - fraction) + parseInt(b.slice(offset, offset + 2), 16) * fraction); });
    return 'rgb(' + channels.join(', ') + ')';
  }

  // Presentation coordinates only. A value label may be omitted when there is
  // no clear space: its value remains in the chart heading. Never move a point
  // or cover a patient's trajectory merely to make room for its label.
  function placeLabel(opts) {
    var cfg = opts || {}, plot = cfg.plot, mapped = cfg.mapped || [];
    var width = cfg.width, height = cfg.height, point = mapped[cfg.pointIndex];
    if (!plot || !point || !finite(width) || !finite(height) || width <= 0 || height <= 0
      || ![plot.x, plot.y, plot.w, plot.h, point.x, point.y].every(finite)
      || plot.w <= width || plot.h <= height
      || mapped.some(function (item) { return !item || !finite(item.x) || !finite(item.y); })) return null;
    var gap = finite(cfg.gap) && cfg.gap >= 0 ? cfg.gap : 4;
    var radius = finite(cfg.pointRadius) && cfg.pointRadius >= 0 ? cfg.pointRadius : 6.8;
    var lineWidth = finite(cfg.lineWidth) && cfg.lineWidth >= 0 ? cfg.lineWidth : 6.3;
    var obstacles = cfg.obstacles || [], inset = Math.max(gap / 4, 0.000001);
    var minX = plot.x + inset, maxX = plot.x + plot.w - width - inset;
    var minY = plot.y + inset, maxY = plot.y + plot.h - height - inset;
    if (maxX < minX || maxY < minY) return null;

    function expanded(rect, margin) {
      return { x: rect.x - margin, y: rect.y - margin,
        right: rect.x + rect.width + margin, bottom: rect.y + rect.height + margin };
    }
    function contains(rect, item) {
      return item.x >= rect.x && item.x <= rect.right && item.y >= rect.y && item.y <= rect.bottom;
    }
    function crosses(rect, a, b) {
      // Slab clipping also covers vertical and zero-length segments and lines
      // with both endpoints outside the plot that cross its visible region.
      var start = 0, end = 1;
      for (var axis = 0; axis < 2; axis += 1) {
        var origin = axis ? a.y : a.x, delta = (axis ? b.y : b.x) - origin;
        var lower = axis ? rect.y : rect.x, upper = axis ? rect.bottom : rect.right;
        if (delta === 0) { if (origin < lower || origin > upper) return false; }
        else {
          var entry = (lower - origin) / delta, exit = (upper - origin) / delta;
          start = Math.max(start, Math.min(entry, exit)); end = Math.min(end, Math.max(entry, exit));
          if (start > end) return false;
        }
      }
      return true;
    }
    function clear(rect) {
      var disks = expanded(rect, radius + gap), lines = expanded(rect, lineWidth / 2 + gap);
      if (mapped.some(function (item) { return contains(disks, item); })) return false;
      for (var index = 1; index < mapped.length; index += 1) {
        if (crosses(lines, mapped[index - 1], mapped[index])) return false;
      }
      return !obstacles.some(function (item) {
        if (!item || ![item.x, item.y, item.w, item.h].every(finite) || item.w < 0 || item.h < 0) return false;
        return item.x <= lines.right && item.x + item.w >= lines.x
          && item.y <= lines.bottom && item.y + item.h >= lines.y;
      });
    }
    var reach = radius + gap + inset, seen = Object.create(null);
    // Keep labels close to their associated dot. Wider rings cover difficult
    // reversals without searching every pixel or introducing long connectors.
    for (var ring = 0; ring < 4; ring += 1) {
      var dx = reach + ring * width / 2, dy = reach + ring * height;
      var candidates = [
        [point.x + dx, point.y - height / 2],
        [point.x + dx, point.y - height - dy],
        [point.x + dx, point.y + dy],
        [point.x - width / 2, point.y - height - dy],
        [point.x - width / 2, point.y + dy],
        [point.x - width - dx, point.y - height / 2],
        [point.x - width - dx, point.y - height - dy],
        [point.x - width - dx, point.y + dy]
      ];
      for (var candidate = 0; candidate < candidates.length; candidate += 1) {
        var x = Math.max(minX, Math.min(maxX, candidates[candidate][0]));
        var y = Math.max(minY, Math.min(maxY, candidates[candidate][1]));
        var key = x + ':' + y;
        if (seen[key]) continue;
        seen[key] = true;
        var rect = { x: x, y: y, width: width, height: height };
        if (clear(rect)) return rect;
      }
    }
    return null;
  }
  function draw(doc, opts) {
    var defs = opts.defs, group = opts.group, points = opts.points || [], mapped = opts.mapped || [];
    var prefix = opts.prefix || 'vilda-centile-live-preview', idPrefix = (opts.idPrefix || prefix) + '-tone-' + (++nextId);
    var segments = [], circles = [];
    function node(tag, attrs, content) {
      var result = doc.createElementNS(NS, tag);
      Object.keys(attrs || {}).forEach(function (key) { result.setAttribute(key, String(attrs[key])); });
      if (content !== undefined) result.textContent = content;
      return result;
    }
    var path = mapped.map(function (p, i) { return (i ? 'L' : 'M') + p.x.toFixed(3) + ',' + p.y.toFixed(3); }).join(' ');
    var halo = node('path', { class: prefix + '-patient-halo', d: path, fill: 'none', stroke: '#fff', 'stroke-width': opts.haloWidth || 6.3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    if (opts.vectorEffect !== false) halo.setAttribute('vector-effect', 'non-scaling-stroke');
    group.appendChild(halo);
    for (var i = 1; i < points.length; i += 1) {
      var from = points[i - 1], to = points[i], a = mapped[i - 1], b = mapped[i];
      var fromTone = tone(opts.metric, from.percentile), toTone = tone(opts.metric, to.percentile);
      var fromColor = color(fromTone), toColor = color(toTone), stroke = fromColor;
      if (fromColor !== toColor && (a.x !== b.x || a.y !== b.y)) {
        var id = idPrefix + '-' + i;
        var gradient = node('linearGradient', { id: id, gradientUnits: 'userSpaceOnUse', x1: a.x, y1: a.y, x2: b.x, y2: b.y, 'color-interpolation': 'sRGB' });
        gradient.appendChild(node('stop', { offset: '0%', 'stop-color': fromColor }));
        gradient.appendChild(node('stop', { offset: '100%', 'stop-color': toColor }));
        defs.appendChild(gradient); stroke = 'url(#' + id + ')';
      }
      var segment = node('path', { class: prefix + '-patient-path', d: 'M' + a.x + ',' + a.y + ' L' + b.x + ',' + b.y, fill: 'none', stroke: stroke,
        'stroke-width': opts.lineWidth || 3.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        'data-age-from': from.ageMonths, 'data-age-to': to.ageMonths, 'data-tone-from': fromTone, 'data-tone-to': toTone });
      if (opts.vectorEffect !== false) segment.setAttribute('vector-effect', 'non-scaling-stroke');
      group.appendChild(segment); segments.push(segment);
    }
    points.forEach(function (point, index) {
      var pointTone = tone(opts.metric, point.percentile), last = index === points.length - 1;
      var circle = node('circle', { class: prefix + '-point', 'data-age-months': point.ageMonths, 'data-value': point.value,
        'data-percentile': finite(point.percentile) ? point.percentile : '', 'data-tone': pointTone,
        cx: mapped[index].x, cy: mapped[index].y, r: last ? opts.lastRadius || 5.8 : opts.pointRadius || 4.6,
        fill: color(pointTone), stroke: '#fff', 'stroke-width': opts.pointStrokeWidth || 2 });
      if (opts.vectorEffect !== false) circle.setAttribute('vector-effect', 'non-scaling-stroke');
      var label = (opts.metric === 'height' ? 'Wzrost' : 'Waga') + ': ' + point.value + (opts.metric === 'height' ? ' cm' : ' kg') + ' · ' + (finite(point.percentile) ? Math.round(point.percentile) + ' centyl' : 'Centyl niedostępny');
      circle.appendChild(node('title', {}, label));
      group.appendChild(circle); circles.push(circle);
    });
    return { points: circles, segments: segments };
  }

  function fullLayer(image, asset) {
    var doc = image.ownerDocument || w.document;
    var scale = 1;
    var plot = asset.plot, id = 'vilda-centile-live-full-patient-' + (++nextId);
    function node(tag, attrs, text) {
      var result = doc.createElementNS(NS, tag);
      Object.keys(attrs || {}).forEach(function (key) { result.setAttribute(key, String(attrs[key])); });
      if (text !== undefined) result.textContent = String(text);
      return result;
    }
    var wrapper = doc.createElement('div');
    wrapper.dataset.patientLayer = 'vector';
    wrapper.dataset.metric = asset.metric;
    wrapper.dataset.source = asset.source;
    var svg = node('svg', {viewBox: '0 0 ' + asset.width + ' ' + asset.height,
      width: '100%', height: '100%', 'aria-hidden': 'true',
      class: 'vilda-centile-live-full-svg', 'data-metric': asset.metric, 'data-source': asset.source});
    image.className = 'vilda-centile-live-full-background';
    image.setAttribute('aria-hidden', 'true');
    var defs = node('defs'), graph = node('g', {'clip-path': 'url(#' + id + '-clip)'}), labels = node('g');
    svg.append(defs, graph, labels); wrapper.append(image, svg);
    var points = (asset.points || []).filter(function (point) {
      return Number.isFinite(point.ageMonths) && Number.isFinite(point.value);
    }).slice().sort(function (a, b) { return a.ageMonths - b.ageMonths; });
    var mapped = points.map(function (point) { return {
      x: plot.x + (point.ageMonths - plot.ageMin) / (plot.ageMax - plot.ageMin) * plot.w,
      y: plot.y + (plot.maxY - point.value) / (plot.maxY - plot.minY) * plot.h
    }; });
    function paint() {
      defs.replaceChildren(); graph.replaceChildren(); labels.replaceChildren();
      var clip = node('clipPath', {id: id + '-clip'});
      clip.appendChild(node('rect', {x: plot.x, y: plot.y, width: plot.w, height: plot.h}));
      defs.appendChild(clip);
      draw(doc, {defs: defs, group: graph, metric: asset.metric, points: points, mapped: mapped,
        idPrefix: id, prefix: 'vilda-centile-live-full', lineWidth: 3.2,
        haloWidth: 6.3, pointRadius: 4.6 / scale, lastRadius: 5.8 / scale,
        pointStrokeWidth: 2, vectorEffect: true});
      wrapper.dataset.valueLabel = 'hidden';
      if (!points.length || asset.valueLabelVisible === false) return;
      var currentIndex = points.findIndex(function (point) { return point.current; });
      if (currentIndex < 0) currentIndex = points.length - 1;
      var point = points[currentIndex];
      var value = Number(point.value).toLocaleString('pl-PL', {maximumFractionDigits: 1}) + ' ' + (asset.units || (asset.metric === 'height' ? 'cm' : 'kg'));
      var labelWidth = (value.length * 8 + 16) / scale, labelHeight = 23 / scale;
      var rect = placeLabel({ plot: plot, mapped: mapped, pointIndex: currentIndex,
        width: labelWidth, height: labelHeight, gap: 4 / scale,
        pointRadius: 6.8 / scale, lineWidth: 6.3 / scale });
      wrapper.dataset.valueLabel = rect ? 'placed' : 'header';
      if (!rect) return;
      var x = rect.x, y = rect.y;
      labels.appendChild(node('rect', {x: x, y: y, width: labelWidth, height: labelHeight, rx: 6 / scale,
        fill: '#ffffff', stroke: '#cfdfde', 'stroke-width': 1 / scale, class: 'vilda-centile-live-full-latest-label-box'}));
      labels.appendChild(node('text', {x: x + labelWidth / 2, y: y + 16 / scale, 'text-anchor': 'middle',
        fill: color(tone(asset.metric, point.percentile)), 'font-family': 'sans-serif',
        'font-size': 12 / scale, 'font-weight': 700, class: 'vilda-centile-live-full-latest-label'}, value));
    }
    wrapper.fitPatientLayer = function (nextScale) {
      if (!(nextScale > 0) || !Number.isFinite(nextScale)) return;
      if (Math.abs(nextScale - scale) < 0.000001 && graph.children.length) return;
      scale = nextScale; paint();
    };
    // The view paints at its final screen scale, without an intermediate layer.

    return wrapper;
  }
  w.VildaCentileLiveColors = Object.freeze({ tone: tone, color: color, colorAt: colorAt,
    placeLabel: placeLabel, draw: draw, fullLayer: fullLayer, palette: palette });
})(typeof window !== 'undefined' ? window : globalThis);
