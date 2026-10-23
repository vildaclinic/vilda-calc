/* Optional, local Day-3 context and a separate source-age chart.
 * Qualification and all source values belong to VildaFshD3 and its data.
 * This renderer does not persist, classify or amend another reference. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VildaFshD3UI = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  var nextId = 0, NS = 'http://www.w3.org/2000/svg';
  function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
  function copy(value) {
    if (Array.isArray(value)) return value.map(copy);
    if (!value || typeof value !== 'object') return value;
    var result = {};
    Object.keys(value).forEach(function (key) { result[key] = copy(value[key]); });
    return result;
  }
  function format(value) { return new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 3, useGrouping: false }).format(value); }
  // Patient values keep their actual numerical precision; the three-decimal
  // presentation convention belongs only to the source median.
  function formatPatient(value) { return String(value).replace('.', ','); }

  function mount(options) {
    var opts = options || {}, host = opts.host;
    if (!host || !host.ownerDocument) return null;
    var doc = host.ownerDocument, id = 'vildaFshD3-' + (++nextId);
    var bundle = root.VildaHormoneLifespanData;
    var data = Object.prototype.hasOwnProperty.call(opts, 'data') ? opts.data : bundle && bundle.fshD3Data;
    var engine = opts.engine || root.VildaFshD3;
    var cycleDay = 'unknown', measurementKey = null, current = null, rendered = null, sourceKey = null;
    host.innerHTML = '<section class="vilda-fsh-d3" aria-labelledby="' + id + '-heading">' +
      '<div class="vfd3-heading"><div><h3 id="' + id + '-heading">Mediana FSH według wieku</h3>' +
      '<p><span data-fsh-d3="source-label"></span> · pobranie w 3. dniu cyklu</p></div><span class="vfd3-source-tag">D3</span></div>' +
      '<div class="vfd3-median"><div><span data-fsh-d3="age-label"></span><p><strong data-fsh-d3="median"></strong>' +
      '<span data-fsh-d3="unit"></span></p></div><p class="vfd3-information" data-fsh-d3="information"></p></div>' +
      '<p class="vfd3-age-note" data-fsh-d3="age-note" hidden>Wartość pośrednia między opublikowanymi medianami wieku.</p>' +
      '<div class="vfd3-context"><label for="' + id + '-day">Dzień cyklu dla tego wyniku <small>opcjonalnie</small></label>' +
      '<select id="' + id + '-day" data-fsh-d3="day"><option value="unknown">Nie ustalono</option>' +
      '<option value="day3">3. dzień cyklu</option><option value="other">Inny dzień cyklu</option></select></div>' +
      '<p class="vfd3-state" data-fsh-d3="state" aria-live="polite"></p>' +
      '<details class="vfd3-plot" data-fsh-d3="plot"><summary><span data-fsh-d3="plot-label">Mediana według wieku</span>' +
      '<span aria-hidden="true">⌄</span></summary><div class="vfd3-plot-body">' +
      '<svg data-fsh-d3="chart" role="img" aria-labelledby="' + id + '-title ' + id + '-description"></svg>' +
      '<div class="vfd3-legend"><span><i class="vfd3-median-key" aria-hidden="true"></i>Mediana w badaniu</span>' +
      '<span data-fsh-d3="patient-legend" hidden><i class="vfd3-patient-key" aria-hidden="true"></i>Wynik pacjentki</span></div>' +
      '<div class="vfd3-comparison" data-fsh-d3="comparison" hidden><p><span>Wynik</span><strong data-fsh-d3="patient-number"></strong></p>' +
      '<p><span>Mediana w badaniu</span><strong data-fsh-d3="source-number"></strong></p></div>' +
      '<p class="vfd3-chart-note" data-fsh-d3="chart-note"></p></div></details>' +
      '<details class="vfd3-sources" data-fsh-d3="sources"><summary>Źródło i ograniczenia<span aria-hidden="true">+</span></summary>' +
      '<div class="vfd3-source-copy" data-fsh-d3="source-copy"></div></details></section>';
    var panel = host.firstElementChild;
    function node(name) { return panel.querySelector('[data-fsh-d3="' + name + '"]'); }
    var daySelect = node('day'), plot = node('plot'), sources = node('sources'), svg = node('chart');
    function element(tag, attrs, text) {
      var el = doc.createElementNS(NS, tag);
      Object.keys(attrs || {}).forEach(function (key) { el.setAttribute(key, attrs[key]); });
      if (text != null) el.textContent = String(text);
      return el;
    }
    function paragraph(label, text) {
      var p = doc.createElement('p');
      if (label) { var strong = doc.createElement('strong'); strong.textContent = label + ' '; p.append(strong); }
      p.append(doc.createTextNode(text || ''));
      return p;
    }
    function notify(kind) {
      if (typeof opts.onActivity === 'function') opts.onActivity({ kind: kind, cycleDay: cycleDay,
        patientPoint: panel.getAttribute('data-patient-point') === 'true' });
    }
    function emptyContent() {
      host.hidden = true;
      ['source-label', 'age-label', 'median', 'unit', 'information', 'state', 'patient-number',
        'source-number', 'chart-note', 'source-copy'].forEach(function (name) { node(name).replaceChildren(); });
      ['data-source-id', 'data-cycle-day', 'data-patient-point'].forEach(function (name) { panel.removeAttribute(name); });
      ['data-source-value', 'data-source-unit'].forEach(function (name) { node('median').removeAttribute(name); });
      svg.replaceChildren(); svg.removeAttribute('viewBox');
      node('age-note').hidden = true; node('patient-legend').hidden = true; node('comparison').hidden = true;
      plot.open = false; sources.open = false; daySelect.value = 'unknown';
      rendered = null; sourceKey = null;
    }
    function clear() {
      cycleDay = 'unknown'; measurementKey = null; current = null;
      emptyContent();
    }
    function keyFor(context) {
      // The adapter binds this key to the actual measurement and clinical context.
      // The fallback is conservative for standalone callers without that adapter.
      return JSON.stringify([context.identityKey || '', context.analyte, context.sex,
        context.measurementKey == null ? [context.ageYears, context.ageUpperYears, context.ageUpperInclusive,
          context.cyclePhase, context.measurement, context.specimen, context.assayMethodId, context.treatment,
          context.contraindicated, context.contextBasis, context.sampleDateISO] : context.measurementKey]);
    }
    function geometry(result) {
      var p = result && result.policy && result.policy.plot;
      if (!p || ![p.ageMin, p.ageMax, p.valueMin, p.valueMax].every(finite) ||
          p.ageMax <= p.ageMin || p.valueMax <= p.valueMin ||
          !Array.isArray(p.ageTicks) || !p.ageTicks.every(finite) ||
          !Array.isArray(p.valueTicks) || !p.valueTicks.every(finite) ||
          !Array.isArray(result.knots) || result.knots.length < 2 ||
          !result.knots.every(function (point) { return point && finite(point.ageYears) && finite(point.median); })) return null;
      return p;
    }
    function draw(result) {
      var p = geometry(result);
      if (!p) return false;
      var width = (host.clientWidth || panel.clientWidth || root.innerWidth || 640) < 640 ? 360 : 640;
      var left = 54, right = width - 20, top = 30, bottom = 230;
      function x(age) { return left + (age - p.ageMin) / (p.ageMax - p.ageMin) * (right - left); }
      function y(value) { return bottom - (value - p.valueMin) / (p.valueMax - p.valueMin) * (bottom - top); }
      var point = result.comparison && result.comparison.status === 'ready' && result.comparison.patientPoint;
      var median = result.median;
      svg.setAttribute('viewBox', '0 0 ' + width + ' 282');
      svg.replaceChildren(element('title', { id: id + '-title' }, 'Mediana FSH w 3. dniu cyklu według wieku'),
        element('desc', { id: id + '-description' }, point
          ? 'Mediany źródła i orientacyjne zestawienie wyniku pacjentki, bez klasyfikacji względem mediany.'
          : 'Mediany źródła. Nie przypisano punktu wyniku pacjentki.'));
      p.valueTicks.forEach(function (value) {
        svg.append(element('line', { x1: left, y1: y(value), x2: right, y2: y(value), class: 'vfd3-grid' }),
          element('text', { x: left - 11, y: y(value) + 4, 'text-anchor': 'end', class: 'vfd3-axis-text',
            'data-fsh-d3-axis': 'y', 'data-axis-value': value }, format(value)));
      });
      p.ageTicks.forEach(function (age) {
        svg.append(element('text', { x: x(age), y: 252, 'text-anchor': 'middle', class: 'vfd3-axis-text',
          'data-fsh-d3-axis': 'x', 'data-axis-value': age }, format(age)));
      });
      svg.append(element('text', { x: left, y: 17, class: 'vfd3-axis-title' }, 'FSH [IU/L]'),
        element('text', { x: right, y: 276, 'text-anchor': 'end', class: 'vfd3-axis-title' }, 'Wiek [lata]'),
        element('path', { d: result.knots.map(function (knot, index) {
          return (index ? 'L' : 'M') + x(knot.ageYears) + ' ' + y(knot.median);
        }).join(' '), class: 'vfd3-source-curve', 'data-fsh-d3-curve': 'source' }));
      if (median && finite(median.ageYears) && finite(median.value)) {
        svg.append(element('line', { x1: x(median.ageYears), y1: top, x2: x(median.ageYears), y2: bottom, class: 'vfd3-age-guide' }),
          element('circle', { cx: x(median.ageYears), cy: y(median.value), r: 6.5,
            class: 'vfd3-source-marker', 'data-fsh-d3-marker': 'source' }));
      }
      if (point && finite(point.ageYears) && finite(point.value)) {
        var px = x(point.ageYears);
        if (point.value > p.valueMax) {
          var leftLabel = px > (left + right) / 2;
          svg.append(element('path', { d: 'M' + (px - 6) + ' ' + (top + 9) + 'L' + px + ' ' + (top - 1) +
            'L' + (px + 6) + ' ' + (top + 9) + 'M' + px + ' ' + (top - 1) + 'V' + (top + 22),
            class: 'vfd3-overflow-marker', 'data-fsh-d3-marker': 'overflow' }),
          element('text', { x: px + (leftLabel ? -12 : 12), y: top + 8,
            'text-anchor': leftLabel ? 'end' : 'start', class: 'vfd3-overflow-text' }, formatPatient(point.value) + ' ' + point.unit));
        } else {
          if (median) svg.append(element('line', { x1: px, y1: y(median.value), x2: px, y2: y(point.value), class: 'vfd3-connector' }));
          svg.append(element('circle', { cx: px, cy: y(point.value), r: 5.5,
            class: 'vfd3-patient-marker', 'data-fsh-d3-marker': 'patient' }));
        }
      }
      return true;
    }
    function stateText(result) {
      var comparison = result.comparison || {};
      if (comparison.status === 'ready') return 'Potwierdzono 3. dzień cyklu dla tego wyniku. Zestawienie jest orientacyjne.';
      if (comparison.reason === 'incompatible-cycle-phase') return 'Wybrana faza cyklu jest niespójna z D3. Nie zestawiono wyniku z medianą.';
      if (comparison.reason === 'non-exact-measurement') return 'Potwierdzono D3. Wynik nie jest dokładną liczbą — nie przypisano mu punktu na wykresie.';
      if (cycleDay === 'other') return 'Inny dzień cyklu — mediana D3 pozostaje informacją o badaniu.';
      return 'Dzień pobrania nieustalony — bez zestawienia wyniku z medianą.';
    }
    function renderSource(source) {
      var next = JSON.stringify(source);
      if (sourceKey === next) return;
      sourceKey = next;
      var paragraphs = [paragraph('Co pokazuje mediana?', source.statistic),
        paragraph('Kogo badano?', source.population), paragraph('Metoda i materiał.', source.method + ' ' + source.specimen)];
      if (source.limitsDescription) paragraphs.push(paragraph('Granice oznaczenia.', source.limitsDescription));
      (source.limitations || []).forEach(function (limitation) { paragraphs.push(paragraph('', limitation)); });
      var citation = paragraph('', source.citation);
      if (typeof source.url === 'string' && /^https:\/\//.test(source.url)) {
        var link = doc.createElement('a'); link.href = source.url; link.textContent = ' Publikacja źródłowa';
        link.target = '_blank'; link.rel = 'noopener noreferrer'; citation.append(link);
      }
      paragraphs.push(citation);
      node('source-copy').replaceChildren.apply(node('source-copy'), paragraphs);
    }
    function render(result) {
      if (!result.source || !geometry(result)) { clear(); return false; }
      rendered = result;
      var median = result.median, point = result.comparison && result.comparison.status === 'ready' && result.comparison.patientPoint;
      panel.setAttribute('data-source-id', result.source.id);
      panel.setAttribute('data-cycle-day', cycleDay);
      panel.setAttribute('data-patient-point', point ? 'true' : 'false');
      node('source-label').textContent = result.source.label;
      node('age-label').textContent = median ? 'Mediana w badaniu · dla wpisanego wieku ' +
        (current.ageLabel || format(median.ageYears) + ' lat') : 'Mediana w badaniu';
      node('median').textContent = median ? format(median.value) : '—';
      node('unit').textContent = median ? median.unit : '';
      if (median) {
        node('median').setAttribute('data-source-value', median.value);
        node('median').setAttribute('data-source-unit', median.unit);
      } else {
        node('median').removeAttribute('data-source-value'); node('median').removeAttribute('data-source-unit');
      }
      node('age-note').hidden = !median || median.interpolated !== true;
      node('information').textContent = point ? 'Zestawienie orientacyjne' : 'Informacja o badaniu';
      daySelect.value = cycleDay;
      node('state').textContent = stateText(result);
      node('plot-label').textContent = point ? 'Wynik i mediana według wieku' : 'Mediana według wieku';
      node('patient-legend').hidden = !point; node('comparison').hidden = !point;
      node('patient-number').textContent = point ? formatPatient(point.value) + ' ' + point.unit : '';
      node('source-number').textContent = point && median ? format(median.value) + ' ' + median.unit : '';
      node('chart-note').textContent = 'Mediana w badaniu nie zastępuje zakresu referencyjnego ani oceny laboratoryjnej.';
      renderSource(result.source);
      host.hidden = false;
      draw(result);
      return true;
    }
    function update(context) {
      var next = context || {}, key = keyFor(next);
      if (measurementKey !== key) {
        cycleDay = 'unknown'; plot.open = false; sources.open = false;
      }
      measurementKey = key; current = copy(next);
      var result = engine && typeof engine.evaluate === 'function'
        ? engine.evaluate(data, Object.assign({}, current, { cycleDay: cycleDay })) : null;
      if (!result || result.status !== 'ready') {
        if (result && ['unsupported-view', 'unselected-analyte'].indexOf(result.reason) >= 0) emptyContent();
        else clear();
        return false;
      }
      return render(result);
    }
    daySelect.addEventListener('change', function () {
      if (!current || host.hidden) return;
      cycleDay = ['unknown', 'day3', 'other'].indexOf(daySelect.value) >= 0 ? daySelect.value : 'unknown';
      var result = engine && typeof engine.evaluate === 'function'
        ? engine.evaluate(data, Object.assign({}, current, { cycleDay: cycleDay })) : null;
      if (!result || result.status !== 'ready') { clear(); return; }
      if (render(result) && cycleDay === 'day3' && result.comparison && result.comparison.status === 'ready') plot.open = true;
      notify('cycle-day');
    });
    plot.addEventListener('toggle', function () { if (!host.hidden) notify('plot'); });
    sources.addEventListener('toggle', function () { if (!host.hidden) notify('sources'); });
    function resize() { if (rendered && !host.hidden) draw(rendered); }
    if (typeof root.ResizeObserver === 'function') new root.ResizeObserver(resize).observe(host);
    else if (typeof root.addEventListener === 'function') root.addEventListener('resize', resize);
    clear();
    return { update: update, clear: clear, reset: clear };
  }
  return { mount: mount };
});
