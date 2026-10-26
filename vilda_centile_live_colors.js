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
      if (!points.length || asset.valueLabelVisible === false) return;
      var currentIndex = points.findIndex(function (point) { return point.current; });
      if (currentIndex < 0) currentIndex = points.length - 1;
      var point = points[currentIndex], pos = mapped[currentIndex];
      var value = Number(point.value).toLocaleString('pl-PL', {maximumFractionDigits: 1}) + ' ' + (asset.units || (asset.metric === 'height' ? 'cm' : 'kg'));
      var labelWidth = (value.length * 6.5 + 16) / scale, labelHeight = 23 / scale;
      var x = Math.max(plot.x, Math.min(plot.x + plot.w - labelWidth, pos.x - labelWidth / 2));
      var y = Math.max(plot.y, Math.min(plot.y + plot.h - labelHeight,
        pos.y + (pos.y - plot.y > 34 / scale ? -34 / scale : 11 / scale)));
      labels.appendChild(node('rect', {x: x, y: y, width: labelWidth, height: labelHeight, rx: 6 / scale,
        fill: '#ffffff', stroke: '#cfdfde', 'stroke-width': 1 / scale}));
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
  w.VildaCentileLiveColors = Object.freeze({ tone: tone, color: color, colorAt: colorAt, draw: draw, fullLayer: fullLayer, palette: palette });
})(typeof window !== 'undefined' ? window : globalThis);
