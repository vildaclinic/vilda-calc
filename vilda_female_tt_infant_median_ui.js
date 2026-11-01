/* Infant female TT group-median presentation. Eligibility, source values,
 * conversions and comparisons belong to the supplied production evaluator. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VildaFemaleTTInfantMedianUI = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  var nextId = 0, NS = 'http://www.w3.org/2000/svg';
  function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
  function copy(value) {
    if (Array.isArray(value)) return value.map(copy);
    if (!value || typeof value !== 'object') return value;
    var output = {};
    Object.keys(value).forEach(function (key) { output[key] = copy(value[key]); });
    return output;
  }
  function precision(unit, policy) {
    var display = policy && policy.display || {}, units = display.fractionDigitsByUnit || {};
    return Number.isInteger(units[unit]) ? units[unit]
      : Number.isInteger(display.defaultFractionDigits) ? display.defaultFractionDigits : unit === 'ng/mL' ? 3 : 2;
  }
  function format(value, unit, policy) {
    if (!finite(value)) return '';
    var digits = precision(unit, policy);
    return new Intl.NumberFormat('pl-PL', { minimumFractionDigits: digits, maximumFractionDigits: digits,
      useGrouping: false, notation: value !== 0 && Math.abs(value) < .5 * Math.pow(10, -digits)
        || Math.abs(value) >= 1e6 ? 'scientific' : 'standard' }).format(value);
  }
  function mount(options) {
    var opts = options || {}, host = opts.host;
    if (!host || !host.ownerDocument) return null;
    var doc = host.ownerDocument, view = doc.defaultView || root, bundle = root.VildaHormoneLifespanData || {};
    var data = Object.prototype.hasOwnProperty.call(opts, 'data') ? opts.data : bundle.femaleTtInfantMedianData;
    var policy = Object.prototype.hasOwnProperty.call(opts, 'policy') ? opts.policy : bundle.femaleTtInfantMedianPolicy;
    var engine = opts.engine || root.VildaFemaleTTInfantMedian;
    var rendered = null, identity = null, destroyed = false, observer = null;
    var id = 'vildaFemaleTtInfantMedian-' + (++nextId);
    host.innerHTML = '<section class="vilda-female-tt-infant-median" aria-labelledby="' + id + '-heading">' +
      '<div class="vftim-heading"><h3 id="' + id + '-heading" data-female-tt-infant-median="heading">Mediana grupy wieku</h3>' +
      '<span class="vftim-age" data-female-tt-infant-median="age"></span></div>' +
      '<div class="vftim-rows" data-female-tt-infant-median="rows"></div>' +
      '<p class="vftim-context">Mediana opublikowana dla grupy wieku.</p>' +
      '<div class="vftim-gauge" data-female-tt-infant-median="gauge-wrap" hidden>' +
      '<div class="vftim-legend"><span><i class="vftim-patient-key" aria-hidden="true"></i>Wynik pacjentki</span>' +
      '<span><i class="vftim-source-key" aria-hidden="true"></i>Mediana grupy wieku</span></div>' +
      '<svg data-female-tt-infant-median="gauge" role="img" height="120" width="100%"></svg>' +
      '<p class="vftim-overflow" data-female-tt-infant-median="overflow" hidden></p>' +
      '<p class="vftim-comparison" data-female-tt-infant-median="comparison" hidden></p></div>' +
      '<p class="vftim-note" data-female-tt-infant-median="note" hidden></p>' +
      '<p class="vftim-footnote">Mediana nie wyznacza granicy normy.</p>' +
      '<a class="vftim-link" data-female-tt-infant-median="source-link" target="_blank" rel="noopener noreferrer"></a>' +
      '<p class="vftim-method" data-female-tt-infant-median="source-method"></p>' +
      '<details class="vftim-sources" data-female-tt-infant-median="sources"><summary>Szczegóły i źródło<span aria-hidden="true">⌄</span></summary>' +
      '<div class="vftim-source-copy" data-female-tt-infant-median="source-copy"></div></details></section>';
    var panel = host.firstElementChild;
    function node(name) { return panel.querySelector('[data-female-tt-infant-median="' + name + '"]'); }
    var svg = node('gauge'), details = node('sources'), summary = details.querySelector('summary');
    function element(tag, attrs, text) {
      var item = doc.createElementNS(NS, tag);
      Object.keys(attrs || {}).forEach(function (key) { item.setAttribute(key, String(attrs[key])); });
      if (text != null) item.textContent = String(text);
      return item;
    }
    function notify(event) {
      if (!destroyed && event && event.isTrusted && (event.type !== 'keydown' || event.key === 'Enter' || event.key === ' ') &&
        typeof opts.onActivity === 'function') opts.onActivity(event, view);
    }
    function clear() {
      host.hidden = true; details.open = false; identity = null; rendered = null;
      node('rows').replaceChildren(); node('source-copy').replaceChildren(); svg.replaceChildren();
      ['age', 'comparison', 'overflow', 'note', 'source-method', 'source-link'].forEach(function (name) {
        node(name).textContent = '';
      });
      ['gauge-wrap', 'comparison', 'overflow', 'note'].forEach(function (name) { node(name).hidden = true; });
      node('source-link').removeAttribute('href');
      svg.removeAttribute('aria-label'); panel.removeAttribute('data-mode'); panel.removeAttribute('data-status');
    }
    function draw() {
      if (destroyed) return;
      svg.replaceChildren(); node('overflow').hidden = true; node('overflow').textContent = '';
      var result = rendered, comparison = result && result.comparison || {}, point = comparison.patientPoint;
      if (!result || result.status !== 'ready' || !result.median || !result.plot || !point ||
        !comparison.measurement || comparison.measurement.isExact !== true) return;
      var plot = result.plot, min = plot.valueMin, max = plot.valueMax, median = result.median.value;
      if (!finite(min) || !finite(max) || max <= min || !finite(median) || !finite(point.value)) return;
      var measuredWidth = typeof svg.getBoundingClientRect === 'function' ? svg.getBoundingClientRect().width : 0;
      var width = Math.max(230, Math.round(measuredWidth || host.clientWidth || 480));
      var left = 18, right = width - 18, y = 55;
      function x(value) { return left + (right - left) * (Math.min(max, Math.max(min, value)) - min) / (max - min); }
      var medX = x(median), valX = x(point.value), overflow = comparison.overflow === true;
      var valueText = format(point.value, result.unit, policy), medianText = format(median, result.unit, policy);
      svg.setAttribute('viewBox', '0 0 ' + width + ' 120');
      svg.setAttribute('aria-label', 'Wynik ' + valueText + ' ' + result.unit + '; mediana grupy wieku ' +
        medianText + ' ' + result.unit + (overflow ? '. Wynik ponad skalą.' : '.') +
        ' Mediana nie wyznacza granicy normy.');
      svg.appendChild(element('line', { x1: left, y1: y, x2: right, y2: y,
        'class': 'vftim-track', 'data-female-tt-infant-median-marker': 'track' }));
      svg.appendChild(element('line', { x1: medX, y1: y - 20, x2: medX, y2: y + 17,
        'class': 'vftim-median', 'data-female-tt-infant-median-marker': 'median',
        'data-source-value': result.median.sourceMedian, 'data-value': median }));
      svg.appendChild(element('text', { x: medX, y: 25, 'text-anchor': 'middle', 'class': 'vftim-source-label' },
        'Mediana ' + medianText));
      var attrs = { 'class': 'vftim-patient', 'data-female-tt-infant-median-marker': overflow ? 'overflow' : 'patient',
        'data-source-value': point.sourceValue, 'data-value': point.value };
      if (overflow) {
        attrs.d = 'M ' + (right - 11) + ' ' + (y - 7) + ' L ' + (right + 1) + ' ' + y +
          ' L ' + (right - 11) + ' ' + (y + 7);
        svg.appendChild(element('path', attrs));
        node('overflow').textContent = 'Wynik ' + valueText + ' ' + result.unit + ' · ponad skalą →';
        node('overflow').hidden = false;
      } else {
        svg.appendChild(element('circle', { cx: valX, cy: y, r: 13, 'class': 'vftim-patient-halo', 'aria-hidden': 'true' }));
        attrs.cx = valX; attrs.cy = y; attrs.r = 6; svg.appendChild(element('circle', attrs));
      }
      svg.appendChild(element('text', { x: valX, y: Math.abs(valX - medX) < 115 ? 87 : 25,
        'text-anchor': valX > right - 65 ? 'end' : valX < left + 65 ? 'start' : 'middle',
        'class': 'vftim-patient-label' }, 'Wynik ' + valueText));
      (Array.isArray(plot.valueTicks) ? plot.valueTicks : []).forEach(function (value) {
        if (!finite(value) || value < min || value > max) return;
        svg.appendChild(element('line', { x1: x(value), x2: x(value), y1: y + 24, y2: y + 28, 'class': 'vftim-tick' }));
      });
      svg.appendChild(element('text', { x: left, y: 113, 'text-anchor': 'start', 'class': 'vftim-axis' },
        min === 0 ? '0' : format(min, result.unit, policy)));
      svg.appendChild(element('text', { x: right, y: 113, 'text-anchor': 'end', 'class': 'vftim-axis' },
        format(max, result.unit, policy) + ' ' + result.unit));
    }
    function renderRows(result) {
      var rows = node('rows'); rows.replaceChildren(); rows.setAttribute('data-multiple-rows', String(result.rows.length > 1));
      node('heading').textContent = result.rows.length > 1 ? 'Mediany grup wieku' : 'Mediana grupy wieku';
      node('age').hidden = result.rows.length !== 1;
      node('age').textContent = result.rows.length === 1 ? result.rows[0].label || result.rows[0].sourceAgeLabel : '';
      result.rows.forEach(function (row) {
        var item = doc.createElement('div'); item.setAttribute('class', 'vftim-row');
        item.setAttribute('data-female-tt-infant-median-row', row.id);
        if (result.rows.length > 1) {
          var label = doc.createElement('p'); label.textContent = row.label || row.sourceAgeLabel; item.appendChild(label);
        }
        var number = doc.createElement('div'); number.setAttribute('class', 'vftim-number');
        var strong = doc.createElement('strong'); strong.textContent = format(row.value, result.unit, policy);
        strong.setAttribute('data-source-value', row.sourceMedian); strong.setAttribute('data-source-unit', result.sourceUnit);
        var unit = doc.createElement('span'); unit.textContent = result.unit;
        number.append(strong, unit); item.appendChild(number); rows.appendChild(item);
      });
    }
    function renderSource(result) {
      var source = result.source || {}, display = source.display || {}, container = node('source-copy');
      var link = node('source-link'), href = source.url || (source.doi ? 'https://doi.org/' +
        String(source.doi).replace(/^https?:\/\/doi\.org\//, '') : '');
      link.textContent = display.citationLabel || source.shortCitation || 'Źródło mediany';
      if (/^https:\/\//.test(href)) { link.setAttribute('href', href); link.hidden = false; }
      else { link.hidden = true; link.removeAttribute('href'); }
      node('source-method').textContent = display.sourceMethodLabel || '';
      container.replaceChildren();
      var paragraphs = [source.citation, source.sourceLocation].concat(Array.isArray(display.details) ? display.details : []);
      paragraphs.forEach(function (text, index) {
        if (typeof text !== 'string' || !text || paragraphs.indexOf(text) !== index) return;
        var p = doc.createElement('p'); p.textContent = text; container.appendChild(p);
      });
    }
    function update(context) {
      if (destroyed) return null;
      var result = engine && typeof engine.evaluate === 'function' ? engine.evaluate(data, policy, context) : null;
      if (!result || result.visible !== true || !Array.isArray(result.rows) || !result.rows.length) { clear(); return result; }
      var key = context && context.identityKey || null;
      if (key !== identity) details.open = false;
      identity = key; rendered = copy(result);
      host.hidden = false; panel.setAttribute('data-mode', rendered.status);
      panel.setAttribute('data-status', rendered.comparison && rendered.comparison.status || 'source-info');
      renderRows(rendered); renderSource(rendered);
      var comparison = rendered.comparison || {}, point = comparison.patientPoint;
      node('gauge-wrap').hidden = rendered.status !== 'ready' || !rendered.plot || !point;
      node('comparison').textContent = finite(comparison.ratio) && point
        ? format(comparison.ratio, 'ratio', policy) + ' × mediana grupy wieku' : '';
      node('comparison').hidden = !node('comparison').textContent;
      var note = rendered.status === 'split' ? 'Podany wiek obejmuje dwie grupy źródłowe. Brak pojedynczego porównania.'
        : rendered.status === 'ready' && comparison.measurement && comparison.measurement.isExact !== true
          ? 'Ten zapis nie wskazuje dokładnego stężenia, dlatego nie zaznaczamy go pojedynczą kropką.' : '';
      node('note').textContent = note; node('note').hidden = !note;
      draw(); return copy(rendered);
    }
    summary.addEventListener('click', notify); summary.addEventListener('keydown', notify);
    if (view && typeof view.ResizeObserver === 'function') {
      observer = new view.ResizeObserver(draw); observer.observe(host);
    } else if (view && typeof view.addEventListener === 'function') view.addEventListener('resize', draw);
    clear();
    return { update: update, clear: clear, getState: function () { return copy(rendered); },
      destroy: function () {
        if (destroyed) return;
        clear(); destroyed = true;
        summary.removeEventListener('click', notify); summary.removeEventListener('keydown', notify);
        if (observer) observer.disconnect();
        else if (view && typeof view.removeEventListener === 'function') view.removeEventListener('resize', draw);
        host.replaceChildren();
      } };
  }
  return Object.freeze({ mount: mount });
});
