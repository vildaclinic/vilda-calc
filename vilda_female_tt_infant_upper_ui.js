/* Source upper-percentile card for current infant female TT. The pure engine
 * owns eligibility and comparison; this module only presents its result. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VildaFemaleTTInfantUpperUI = api;
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
  function defaultPrecision(unit) { return unit === 'ng/mL' ? 3 : 2; }
  function format(value, unit, precision) {
    var digits = Number.isInteger(precision) ? precision : defaultPrecision(unit);
    if (!finite(value)) return '';
    return new Intl.NumberFormat('pl-PL', { minimumFractionDigits: digits, maximumFractionDigits: digits,
      useGrouping: false, notation: value !== 0 && Math.abs(value) < .5 * Math.pow(10, -digits)
        || Math.abs(value) >= 1e6 ? 'scientific' : 'standard' }).format(value);
  }
  function measurementText(measurement, unit, precision) {
    if (!measurement) return '';
    var operator = { '=': '', '<=': '≤', '>=': '≥' }[measurement.operator];
    if (operator === undefined) operator = measurement.operator || '';
    return operator + (finite(measurement.value) ? format(measurement.value, unit, precision)
      : measurement.limitKind === 'LOD' || measurement.limitKind === 'LOQ' ? measurement.limitKind : '');
  }
  function presentation(result, policy) {
    if (!result || !result.visible) return null;
    var comparison = result.comparison || {}, measurement = comparison.measurement;
    var displayPolicy = policy && policy.display || {}, byUnit = displayPolicy.fractionDigitsByUnit || {};
    var precision = Number.isInteger(byUnit[result.unit]) ? byUnit[result.unit]
      : Number.isInteger(displayPolicy.defaultFractionDigits) ? displayPolicy.defaultFractionDigits : defaultPrecision(result.unit);
    var ordinary = precision, maximum = Number.isInteger(displayPolicy.maximumFractionDigits) ? displayPolicy.maximumFractionDigits : 10;
    // Display only: make a known ordering visible without rounding the clinical comparison.
    if (result.status === 'ready' && comparison.status === 'above-upper' && measurement &&
      measurement.isExact === true && finite(measurement.value) && result.upper && finite(result.upper.value)) {
      while (precision < maximum && measurement.value.toFixed(precision) === result.upper.value.toFixed(precision)) precision++;
    }
    var labels = { 'not-above-upper': displayPolicy.notAboveLabel || 'Nie przekracza górnej wartości odniesienia',
      'above-upper': displayPolicy.aboveLabel || 'Powyżej górnej wartości odniesienia', indeterminate: 'Porównanie niejednoznaczne',
      'source-info': 'Odniesienie źródłowe' };
    return { status: comparison.status, statusLabel: result.status === 'split' ? 'Dwie grupy odniesienia'
      : result.status === 'source-info' ? labels['source-info'] : labels[comparison.status] || labels.indeterminate,
    displayValue: measurementText(measurement, result.unit, precision), displayUnit: result.unit,
    displayPrecision: precision, precisionNote: precision > ordinary
      ? 'Dokładniejszy zapis przy górnej wartości odniesienia.' : '',
    hasResult: !!measurement, overrideStatus: true };
  }

  function mount(options) {
    var opts = options || {}, host = opts.host;
    if (!host || !host.ownerDocument) return null;
    var doc = host.ownerDocument, view = doc.defaultView || root;
    var bundle = root.VildaHormoneLifespanData || {};
    var data = Object.prototype.hasOwnProperty.call(opts, 'data') ? opts.data : bundle.femaleTtInfantUpperData;
    var policy = Object.prototype.hasOwnProperty.call(opts, 'policy') ? opts.policy : bundle.femaleTtInfantUpperPolicy;
    var engine = opts.engine || root.VildaFemaleTTInfantUpper;
    var rendered = null, displayed = null, identity = null, destroyed = false, observer = null;
    var id = 'vildaFemaleTtInfantUpper-' + (++nextId);
    host.innerHTML = '<section class="vilda-female-tt-infant-upper" aria-labelledby="' + id + '-heading">' +
      '<div class="vftiu-heading"><h3 id="' + id + '-heading" data-female-tt-infant="heading">Górna wartość odniesienia</h3>' +
      '<span class="vftiu-age" data-female-tt-infant="age"></span></div>' +
      '<div class="vftiu-rows" data-female-tt-infant="rows"></div>' +
      '<div class="vftiu-gauge" data-female-tt-infant="gauge-wrap" hidden>' +
      '<div class="vftiu-legend"><span data-female-tt-infant="patient-key"><i class="vftiu-patient-key" aria-hidden="true"></i>Wynik pacjentki</span>' +
      '<span><i class="vftiu-source-key" aria-hidden="true"></i>Górna wartość</span></div>' +
      '<svg data-female-tt-infant="gauge" role="img" height="108" width="100%"></svg>' +
      '<p class="vftiu-overflow" data-female-tt-infant="overflow" hidden></p></div>' +
      '<p class="vftiu-note" data-female-tt-infant="note" hidden></p>' +
      '<p class="vftiu-precision" data-female-tt-infant="precision" hidden></p>' +
      '<a class="vftiu-link" data-female-tt-infant="source-link" target="_blank" rel="noopener noreferrer"></a>' +
      '<p class="vftiu-method" data-female-tt-infant="source-method"></p>' +
      '<details class="vftiu-sources" data-female-tt-infant="sources"><summary>Szczegóły i źródło<span aria-hidden="true">⌄</span></summary>' +
      '<div class="vftiu-source-copy" data-female-tt-infant="source-copy"></div></details></section>';
    var panel = host.firstElementChild;
    function node(name) { return panel.querySelector('[data-female-tt-infant="' + name + '"]'); }
    var svg = node('gauge'), details = node('sources');
    function element(tag, attrs, text) {
      var item = doc.createElementNS(NS, tag);
      Object.keys(attrs || {}).forEach(function (key) { item.setAttribute(key, String(attrs[key])); });
      if (text != null) item.textContent = String(text);
      return item;
    }
    function emit() {
      if (typeof opts.onResult === 'function') opts.onResult(copy(rendered), copy(displayed));
    }
    function notify(event) {
      if (event && event.isTrusted && typeof opts.onActivity === 'function') opts.onActivity(event, view);
    }
    function clear() {
      host.hidden = true; details.open = false; identity = null; rendered = null; displayed = null;
      node('rows').replaceChildren(); node('source-copy').replaceChildren(); svg.replaceChildren();
      ['age', 'note', 'precision', 'overflow', 'source-method', 'source-link'].forEach(function (name) {
        node(name).textContent = '';
      });
      node('source-link').removeAttribute('href'); node('gauge-wrap').hidden = true;
      node('overflow').hidden = true; node('precision').hidden = true; node('note').hidden = true;
      panel.removeAttribute('data-status'); panel.removeAttribute('data-mode');
      svg.removeAttribute('aria-label'); emit();
    }
    function draw() {
      svg.replaceChildren(); node('overflow').hidden = true; node('overflow').textContent = '';
      if (!rendered || rendered.status !== 'ready' || !rendered.upper || !rendered.plot) return;
      var plot = rendered.plot, min = plot.valueMin, max = plot.valueMax;
      if (!finite(min) || !finite(max) || max <= min || !Array.isArray(plot.valueTicks)) return;
      var width = typeof svg.getBoundingClientRect === 'function' ? svg.getBoundingClientRect().width : 0;
      var w = Math.max(230, Math.round(width || host.clientWidth || 480)), left = 18, right = w - 18, top = 49;
      function x(value) { return left + (right - left) * (Math.min(max, Math.max(min, value)) - min) / (max - min); }
      svg.setAttribute('viewBox', '0 0 ' + w + ' 108');
      svg.setAttribute('aria-label', 'Oś stężenia. Górna wartość odniesienia ' +
        format(rendered.upper.value, rendered.unit, displayed.displayPrecision) + ' ' + rendered.unit +
        (rendered.comparison.patientPoint ? ', wynik ' + displayed.displayValue + ' ' + rendered.unit : '') +
        '. Oś nie oznacza pełnego zakresu normy.');
      svg.appendChild(element('line', { x1: left, y1: top, x2: right, y2: top,
        'class': 'vftiu-track', 'data-female-tt-infant-marker': 'track' }));
      svg.appendChild(element('line', { x1: x(rendered.upper.value), y1: top - 21,
        x2: x(rendered.upper.value), y2: top + 21, 'class': 'vftiu-upper',
        'data-female-tt-infant-marker': 'upper', 'data-source-value': rendered.upper.sourceUpper }));
      plot.valueTicks.forEach(function (value) {
        if (!finite(value) || value < min || value > max) return;
        svg.appendChild(element('line', { x1: x(value), y1: top + 24, x2: x(value), y2: top + 29, 'class': 'vftiu-tick' }));
        svg.appendChild(element('text', { x: x(value), y: top + 47,
          'text-anchor': value === min ? 'start' : value === max ? 'end' : 'middle', 'class': 'vftiu-axis' },
        format(value, rendered.unit)));
      });
      var point = rendered.comparison.patientPoint;
      if (!point || !finite(point.value)) return;
      var overflow = point.value > max || point.value < min;
      var attrs = { 'class': 'vftiu-patient', 'data-female-tt-infant-marker': overflow ? 'overflow' : 'patient',
        'data-source-value': point.sourceValue, 'data-value': point.value };
      if (overflow) {
        var edge = point.value > max ? right : left, direction = point.value > max ? -1 : 1;
        attrs.d = 'M ' + (edge + direction * 12) + ' ' + (top - 8) + ' L ' + edge + ' ' + top +
          ' L ' + (edge + direction * 12) + ' ' + (top + 8);
        svg.appendChild(element('path', attrs));
        node('overflow').textContent = 'Wynik ' + displayed.displayValue + ' ' + rendered.unit + ' jest poza skalą wykresu.';
        node('overflow').hidden = false;
      } else {
        attrs.cx = x(point.value); attrs.cy = top; attrs.r = 7;
        svg.appendChild(element('circle', attrs));
      }
    }
    function renderRows(result) {
      var rows = node('rows'); rows.replaceChildren(); rows.setAttribute('data-two-rows', result.rows.length > 1 ? 'true' : 'false');
      node('heading').textContent = result.rows.length > 1 ? 'Górne wartości odniesienia' : 'Górna wartość odniesienia';
      node('age').hidden = result.rows.length !== 1;
      node('age').textContent = result.rows.length === 1 ? result.rows[0].label || result.rows[0].sourceAgeLabel : '';
      result.rows.forEach(function (row) {
        var item = doc.createElement('div'); item.setAttribute('class', 'vftiu-row');
        item.setAttribute('data-female-tt-infant-row', row.id);
        if (result.rows.length > 1) {
          var label = doc.createElement('p'); label.textContent = row.label || row.sourceAgeLabel; item.appendChild(label);
        }
        var number = doc.createElement('div'); number.setAttribute('class', 'vftiu-number');
        var strong = doc.createElement('strong'); strong.textContent = format(row.value, result.unit, displayed.displayPrecision);
        strong.setAttribute('data-source-value', row.sourceUpper); strong.setAttribute('data-source-unit', result.sourceUnit);
        var unit = doc.createElement('span'); unit.textContent = result.unit;
        number.append(strong, unit); item.appendChild(number); rows.appendChild(item);
      });
    }
    function renderSource(result) {
      var source = result.source || {}, display = source.display || {}, container = node('source-copy');
      var citation = display.citationLabel || source.shortCitation || 'Johannsen i wsp. 2018';
      var link = node('source-link'); link.textContent = citation;
      var href = source.url || (source.doi ? 'https://doi.org/' + String(source.doi).replace(/^https?:\/\/doi\.org\//, '') : '');
      if (/^https:\/\//.test(href)) { link.setAttribute('href', href); link.hidden = false; } else link.hidden = true;
      node('source-method').textContent = display.sourceMethodLabel || '';
      container.replaceChildren();
      (Array.isArray(display.details) ? display.details : []).forEach(function (text) {
        if (typeof text !== 'string') return;
        var p = doc.createElement('p'); p.textContent = text; container.appendChild(p);
      });
    }
    function renderNote(result) {
      var note = '', comparison = result.comparison || {};
      if (result.status === 'split') note = 'Podany wiek obejmuje dwie grupy źródłowe. Pokazano je oddzielnie.';
      else if (result.status === 'source-info') note = result.source && result.source.display && result.source.display.sourceInfoNote ||
        'Źródło opisuje zdrowe donoszone dziewczynki, surowicę i oznaczenie LC-MS/MS.';
      else if (comparison.status === 'indeterminate') note = comparison.measurement && comparison.measurement.limitKind
        ? 'Zapis wyniku nie podaje liczbowej granicy. Granica oznaczenia z publikacji nie zastępuje danych laboratorium.'
        : 'Podany zapis nie rozstrzyga, czy przekroczono górną wartość.';
      node('note').textContent = note; node('note').hidden = !note;
    }
    function update(context) {
      if (destroyed) return null;
      var result = engine && typeof engine.evaluate === 'function' ? engine.evaluate(data, policy, context) : null;
      if (!result || result.visible !== true || !Array.isArray(result.rows) || !result.rows.length) { clear(); return result; }
      var key = context && context.identityKey || null;
      if (key !== identity) details.open = false;
      identity = key; rendered = copy(result); displayed = presentation(rendered, policy);
      host.hidden = false; panel.setAttribute('data-mode', rendered.status);
      panel.setAttribute('data-status', rendered.comparison && rendered.comparison.status || 'source-info');
      renderRows(rendered); renderSource(rendered); renderNote(rendered);
      node('precision').textContent = displayed.precisionNote; node('precision').hidden = !displayed.precisionNote;
      node('gauge-wrap').hidden = rendered.status !== 'ready' || !rendered.plot;
      node('patient-key').hidden = !rendered.comparison || !rendered.comparison.patientPoint;
      draw(); emit(); return copy(rendered);
    }
    details.addEventListener('toggle', notify);
    if (view && typeof view.ResizeObserver === 'function') {
      observer = new view.ResizeObserver(draw); observer.observe(host);
    } else if (view && typeof view.addEventListener === 'function') view.addEventListener('resize', draw);
    clear();
    return { update: update, clear: clear,
      getState: function () { return copy(rendered); }, getPresentation: function () { return copy(displayed); },
      destroy: function () {
        if (destroyed) return;
        clear(); destroyed = true;
        details.removeEventListener('toggle', notify);
        if (observer) observer.disconnect();
        else if (view && typeof view.removeEventListener === 'function') view.removeEventListener('resize', draw);
        host.replaceChildren();
      } };
  }
  return Object.freeze({ mount: mount });
});
