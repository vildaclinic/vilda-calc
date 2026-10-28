/* Wspólny widok zapisanych obliczeń Klirensu. Wyłącznie projekcja z
 * ClcrSavedResults: bez sejfu, silników klinicznych, bieżącego pacjenta i zegara.
 * Każdy pomiar zachowuje własną ocenę/normę. Wykres jest zbiorem punktów;
 * pozycja pozioma oznacza kolejność zapisanych pomiarów, nie upływ czasu.
 * ClcrSavedResultsView.render(host,{projection,view,onSelect}) -> {update,destroy}
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ClcrSavedResultsView = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  var SVG = 'http://www.w3.org/2000/svg';
  var finite = function (value) { return typeof value === 'number' && isFinite(value); };
  var text = function (value) { return typeof value === 'string' ? value.trim() : ''; };
  var numericToken = '[+−-]?(?:\\d+(?:[.,]\\d*)?|[.,]\\d+)(?:[eE][+-]?\\d+)?';
  var numericDisplay = new RegExp('^(?:[<>≤≥]=?|≈)?\\s*' + numericToken + '(?:\\s*[–−-]\\s*' + numericToken + ')?$');
  function dateLabel(value) {
    var date = /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value.split('-') : null;
    return date ? date[2] + '.' + date[1] + '.' + date[0].slice(2) : 'bez daty badania';
  }
  function decimal(value) { return String(value).replace('.', ','); }
  function countLabel(value) { return value + ' ' + (value === 1 ? 'pomiar' : value % 10 >= 2 && value % 10 <= 4 && (value % 100 < 12 || value % 100 > 14) ? 'pomiary' : 'pomiarów'); }
  function tone(record) {
    return ['success', 'warning', 'danger'].indexOf(record.tone) !== -1 ? record.tone : 'neutral';
  }
  function displayValue(record) {
    var value = text(record.displayValue) || text(record.rawText) || (finite(record.valueNum) ? decimal(record.valueNum) : '—');
    var unit = text(record.unit);
    if (unit && (value.slice(-unit.length - 1) === ' ' + unit || value.slice(-unit.length - 1) === '\u00a0' + unit)) value = value.slice(0, -unit.length - 1);
    // A recalculated engine may persist its decimal dot. Localize only a
    // wholly numeric display (including bounds/exponents), without parsing,
    // rounding or changing the stored value and without editing text results.
    return numericDisplay.test(value) ? value.replace(/\./g, ',') : value;
  }
  function assessmentText(record) {
    if (record.status === 'invalidated') return 'Ocena nieaktualna po zmianie zapisu';
    if (record.status === 'unavailable') return 'Zapisana ocena niedostępna';
    return text(record.interpretation) || text(record.description) || {
      within: 'W normie przy zapisie', above: 'Powyżej normy przy zapisie', below: 'Poniżej normy przy zapisie'
    }[record.assessment] || 'Brak zapisanej oceny';
  }
  function basisLabel(record) {
    if (text(record.basisLabel)) return text(record.basisLabel);
    var basis = text(record.basis);
    if (basis === 'unknown' || basis === 'legacy-unknown') return 'Postać masowa niepodana w zapisie';
    if (basis === 'ion') return record.sourceFormulaId === 'OxCr_spot' ? 'Jon szczawianowy'
      : record.sourceFormulaId === 'CitCr_spot' ? 'Jon cytrynianowy' : 'Postać jonowa — zgodnie z zapisem';
    if (basis === 'acid') return record.sourceFormulaId === 'OxCr_spot' ? 'Kwas szczawiowy bezwodny'
      : record.sourceFormulaId === 'CitCr_spot' ? 'Kwas cytrynowy bezwodny' : 'Postać kwasowa — zgodnie z zapisem';
    return basis;
  }
  function groupsFor(projection) {
    var groups = [], byKey = Object.create(null), seen = Object.create(null);
    (projection && projection.measurements || []).forEach(function (record, index) {
      if (!record || !record.noteId || seen[record.noteId]) return;
      seen[record.noteId] = true;
      // Klucz pochodzi z adaptera: pełny parametr/metoda, jednostka i podstawa.
      var key = text(record.seriesKey) || JSON.stringify([record.parameterKey, record.label, record.method, record.unit, record.basis]);
      if (!byKey[key]) {
        byKey[key] = { key: key, label: text(record.displayLabel) || text(record.label) || 'Zapisane obliczenie', method: text(record.method), unit: text(record.unit), basis: basisLabel(record), records: [] };
        groups.push(byKey[key]);
      }
      byKey[key].records.push({ record: record, index: index });
    });
    groups.forEach(function (group) {
      group.records.sort(function (left, right) {
        var a = text(left.record.dateISO), b = text(right.record.dateISO);
        return a === b ? left.index - right.index : !a ? 1 : !b ? -1 : a < b ? -1 : 1;
      });
      group.records = group.records.map(function (item) { return item.record; });
    });
    return groups;
  }
  function uniformReference(records) {
    var first = records[0] && records[0].reference;
    if (!first || !first.bounds || !text(first.text)) return null;
    var low = first.bounds.low, high = first.bounds.high;
    if ((!finite(low) && !finite(high)) || (finite(low) && finite(high) && low > high)) return null;
    var signature = JSON.stringify(first), norm = records[0].norm;
    return records.every(function (record) { return record.norm === norm && JSON.stringify(record.reference) === signature; }) ? first : null;
  }
  // Czysta geometria; żaden próg ani kierunek zmiany nie nadaje tu oceny klinicznej.
  function chartGeometry(records, reference, hostWidth) {
    var bounds = reference && reference.bounds;
    var values = records.filter(function (record) { return finite(record.valueNum) && !record.comparator; }).map(function (record) { return record.valueNum; });
    if (bounds) [bounds.low, bounds.high].forEach(function (value) { if (finite(value)) values.push(value); });
    values.push(0);
    var low = Math.min.apply(Math, values), high = Math.max.apply(Math, values), span = high - low;
    if (!(span > 0)) { low = 0; high = 1; span = 1; }
    var margin = { left: 42, right: 18, top: 38, bottom: 62 };
    // Do trzech pomiarów mieści się w rzeczywistej szerokości telefonu, bez
    // pomniejszania liter. Dłuższa historia przewija się wewnątrz wykresu.
    var width = Math.max(180, Math.round(hostWidth || 620), records.length > 3 ? records.length * 70 + margin.left + margin.right : 0), height = 280;
    var min = low < 0 ? low - span * 0.16 : 0, max = high + span * 0.2;
    var plotWidth = width - margin.left - margin.right, plotHeight = height - margin.top - margin.bottom;
    var ticks = [min, 0, max];
    if (bounds) [bounds.low, bounds.high].forEach(function (value) { if (finite(value)) ticks.push(value); });
    ticks = ticks.filter(function (value, index, list) { return list.indexOf(value) === index; }).sort(function (a, b) { return a - b; });
    return {
      width: width, height: height, margin: margin, min: min, max: max, ticks: ticks,
      x: function (index) { return margin.left + (records.length === 1 ? plotWidth / 2 : 12 + index * (plotWidth - 24) / (records.length - 1)); },
      y: function (value) { return margin.top + plotHeight * (max - value) / (max - min); }
    };
  }
  function render(host, options) {
    options = options || {};
    var doc = host.ownerDocument, projection = options.projection || { measurements: [] }, view = options.view || 'charts', destroyed = false;
    function add(parent, tag, className, content) {
      var element = doc.createElement(tag);
      if (className) element.className = className;
      if (content != null) element.textContent = String(content);
      parent.appendChild(element);
      return element;
    }
    function svgNode(parent, tag, attrs, content) {
      var node = doc.createElementNS(SVG, tag);
      Object.keys(attrs || {}).forEach(function (key) { node.setAttribute(key, attrs[key]); });
      if (content != null) node.textContent = String(content);
      parent.appendChild(node);
      return node;
    }
    function clear() { while (host.firstChild) host.removeChild(host.firstChild); }
    function select(record) { if (!destroyed && typeof options.onSelect === 'function') options.onSelect(record); }
    function detailsButton(parent, record, className, label) {
      var button = add(parent, 'button', className, label);
      button.type = 'button';
      button.setAttribute('data-note-id', record.noteId);
      button.setAttribute('aria-label', 'Szczegóły: ' + (record.displayLabel || record.label) + ', ' + displayValue(record) + ' ' + (record.unit || '') + ', ' + dateLabel(record.dateISO));
      button.addEventListener('click', function () { select(record); });
      return button;
    }
    function assessment(parent, record) {
      var badge = add(parent, 'span', 'vilda-clcr-assessment tone-' + tone(record));
      if (record.category) add(badge, 'strong', '', record.category);
      add(badge, 'span', '', assessmentText(record));
    }
    function table(parent, group) {
      var wrap = add(parent, 'div', 'vilda-clcr-table-scroll');
      var tableNode = add(wrap, 'table', 'vilda-clcr-measurements');
      add(tableNode, 'caption', 'vilda-clcr-sr-only', 'Wszystkie pomiary: ' + group.label);
      var head = add(add(tableNode, 'thead'), 'tr');
      ['Data badania', 'Wynik', 'Zapisana norma', 'Zapisana ocena', 'Szczegóły'].forEach(function (label) { add(head, 'th', '', label).setAttribute('scope', 'col'); });
      var body = add(tableNode, 'tbody');
      group.records.forEach(function (record) {
        var row = add(body, 'tr');
        row.setAttribute('data-note-id', record.noteId);
        var dateCell = add(row, 'td'); dateCell.setAttribute('data-label', 'Data badania');
        var time = add(dateCell, 'time', '', dateLabel(record.dateISO));
        if (record.dateISO) time.setAttribute('datetime', record.dateISO);
        var result = add(row, 'td'); result.setAttribute('data-label', 'Wynik');
        var value = detailsButton(result, record, 'vilda-clcr-value tone-' + tone(record), displayValue(record));
        if (record.unit) add(value, 'span', 'vilda-clcr-unit', ' ' + record.unit);
        var note = text(record.boundaryNote) || text(record.precisionNote) || (text(record.boundary) ? 'Przed zaokrągleniem: ' + decimal(record.boundary) : '');
        if (note) add(result, 'span', 'vilda-clcr-rounding-note', note);
        var norm = add(row, 'td'); norm.setAttribute('data-label', 'Zapisana norma');
        add(norm, 'span', 'vilda-clcr-row-reference', text(record.norm) || text(record.reference && record.reference.text) || 'Brak zapisanej normy');
        var status = add(row, 'td'); status.setAttribute('data-label', 'Zapisana ocena'); assessment(status, record);
        detailsButton(add(row, 'td', 'vilda-clcr-row-details'), record, 'vilda-clcr-details', 'Szczegóły →');
      });
    }
    function chart(parent, group, reference) {
      var numeric = group.records.filter(function (record) { return finite(record.valueNum) && !record.comparator; });
      if (!numeric.length) {
        add(parent, 'p', 'vilda-clcr-chart-note', 'Brak dokładnych wartości do wykresu. Wszystkie zapisane wyniki są poniżej.');
        return;
      }
      var scroll = add(parent, 'div', 'vilda-clcr-chart-scroll');
      scroll.setAttribute('tabindex', '0');
      scroll.setAttribute('role', 'region');
      scroll.setAttribute('aria-label', 'Wykres zapisanych pomiarów: ' + group.label);
      var availableWidth = scroll.clientWidth || parent.clientWidth || host.clientWidth;
      var g = chartGeometry(group.records, reference, availableWidth);
      var m = g.margin, plotWidth = g.width - m.left - m.right, bottom = g.height - m.bottom;
      var svg = svgNode(scroll, 'svg', { class: 'vilda-clcr-chart', viewBox: '0 0 ' + g.width + ' ' + g.height, width: g.width, height: g.height, role: 'group', 'aria-label': group.label + '. Dokładne pomiary: ' + numeric.length + '. Punkty nie są połączone linią.' });
      if (reference && reference.kind !== 'recorded-criterion') {
        var low = finite(reference.bounds.low) ? reference.bounds.low : g.min;
        var high = finite(reference.bounds.high) ? reference.bounds.high : g.max;
        svgNode(svg, 'rect', { class: 'vilda-clcr-norm-band', x: m.left, y: g.y(high), width: plotWidth, height: Math.max(0, g.y(low) - g.y(high)) });
      }
      g.ticks.forEach(function (value) {
        svgNode(svg, 'line', { class: 'vilda-clcr-chart-grid', x1: m.left, x2: g.width - m.right, y1: g.y(value), y2: g.y(value) });
        svgNode(svg, 'text', { class: 'vilda-clcr-chart-tick', x: m.left - 9, y: g.y(value) + 4, 'text-anchor': 'end' }, decimal(Number(value.toPrecision(4))));
      });
      if (reference) [reference.bounds.low, reference.bounds.high].forEach(function (bound) {
        if (finite(bound)) svgNode(svg, 'line', { class: 'vilda-clcr-norm-boundary', x1: m.left, x2: g.width - m.right, y1: g.y(bound), y2: g.y(bound) });
      });
      svgNode(svg, 'line', { class: 'vilda-clcr-chart-axis', x1: m.left, x2: m.left, y1: m.top, y2: bottom });
      svgNode(svg, 'line', { class: 'vilda-clcr-chart-axis', x1: m.left, x2: g.width - m.right, y1: bottom, y2: bottom });
      group.records.forEach(function (record, index) {
        var x = g.x(index);
        if (finite(record.valueNum) && !record.comparator) {
          var point = svgNode(svg, 'g', { class: 'vilda-clcr-point tone-' + tone(record), 'data-note-id': record.noteId, 'data-value': record.valueNum, role: 'button', tabindex: '0', 'aria-label': dateLabel(record.dateISO) + ', ' + displayValue(record) + ' ' + group.unit + ', ' + assessmentText(record) + '. Szczegóły obliczenia' });
          svgNode(point, 'title', {}, dateLabel(record.dateISO) + ' · ' + displayValue(record) + ' ' + group.unit + ' · ' + assessmentText(record) + ' · norma przy zapisie: ' + (record.norm || 'brak zapisanej normy'));
          svgNode(point, 'rect', { x: x - 22, y: g.y(record.valueNum) - 22, width: 44, height: 44, fill: 'transparent' });
          svgNode(point, 'circle', { class: 'vilda-clcr-point-dot', cx: x, cy: g.y(record.valueNum), r: 6 });
          svgNode(point, 'text', { class: 'vilda-clcr-point-label', x: x, y: g.y(record.valueNum) - 13, 'text-anchor': 'middle' }, displayValue(record));
          point.addEventListener('click', function () { select(record); });
          point.addEventListener('keydown', function (event) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(record); } });
        }
        var date = dateLabel(record.dateISO);
        svgNode(svg, 'text', { class: 'vilda-clcr-chart-date', x: x, y: bottom + 24, 'text-anchor': 'middle' }, record.dateISO ? date.slice(0, 5) : 'bez daty');
        if (record.dateISO) svgNode(svg, 'text', { class: 'vilda-clcr-chart-year', x: x, y: bottom + 41, 'text-anchor': 'middle' }, record.dateISO.slice(0, 4));
      });
      add(parent, 'p', 'vilda-clcr-chart-note', 'Kolejne zapisane pomiary · odstępy nie oznaczają czasu.');
      if (availableWidth && g.width > availableWidth) add(parent, 'p', 'vilda-clcr-chart-note', 'Przewiń wykres w poziomie, aby zobaczyć wszystkie pomiary.');
      var dates = Object.create(null), sameDay = group.records.some(function (record) { if (!record.dateISO) return false; if (dates[record.dateISO]) return true; dates[record.dateISO] = true; return false; });
      if (sameDay) add(parent, 'p', 'vilda-clcr-chart-note', 'Pomiary z tą samą datą nie mają podanej godziny pobrania.');
      if (numeric.length < group.records.length) add(parent, 'p', 'vilda-clcr-chart-note', 'Wyniki z „<” lub „>” i wpisy tekstowe są w tabeli; nie są punktami na wykresie.');
      var legend = add(parent, 'div', 'vilda-clcr-chart-legend');
      [['success', 'W normie przy zapisie'], ['warning', 'Poza normą przy zapisie'], ['danger', 'Znacznie poza normą przy zapisie'], ['neutral', 'Bez zapisanej oceny']].forEach(function (item) {
        if (!group.records.some(function (record) { return tone(record) === item[0]; })) return;
        var label = add(legend, 'span'); add(label, 'i', 'tone-' + item[0]); add(label, 'span', '', item[1]);
      });
      add(parent, 'p', 'vilda-clcr-chart-help', 'Dotknij punktu lub wybierz go klawiaturą, aby otworzyć szczegóły.');
    }
    function draw() {
      if (destroyed) return;
      clear(); host.classList.add('vilda-clcr-history');
      var groups = groupsFor(projection);
      if (!groups.length) { add(host, 'p', 'vilda-clcr-chart-note', 'Brak zapisanych obliczeń Klirensu.'); return; }
      groups.forEach(function (group) {
        var card = add(host, 'section', 'vilda-clcr-measurement-group');
        card.setAttribute('data-series-key', group.key);
        var header = add(card, 'div', 'vilda-clcr-group-head'), titles = add(header, 'div');
        add(titles, 'p', 'vilda-clcr-group-label', 'NERKI I MOCZ · ' + countLabel(group.records.length));
        add(titles, 'h4', 'vilda-clcr-group-title', group.label);
        var subtitle = [group.method, group.basis, group.unit].filter(Boolean).filter(function (value, index, all) { return all.indexOf(value) === index; }).join(' · ');
        if (subtitle) add(titles, 'p', 'vilda-clcr-group-subtitle', subtitle);
        add(header, 'span', 'vilda-clcr-source-badge', 'Klirens');
        var reference = uniformReference(group.records), norm = add(card, 'p', 'vilda-clcr-group-reference');
        if (reference) { norm.classList.add('has-common-reference'); add(norm, 'span', '', 'Norma przy zapisie'); add(norm, 'strong', '', reference.text); }
        else add(norm, 'span', '', 'Normy i oceny przy poszczególnych wynikach');
        if (view === 'charts') chart(card, group, reference);
        add(card, 'p', 'vilda-clcr-all-label', 'Wszystkie pomiary');
        table(card, group);
      });
    }
    draw();
    return {
      update: function (nextProjection, nextView) { if (destroyed) return; projection = nextProjection || projection; view = nextView || view; draw(); },
      destroy: function () { destroyed = true; clear(); }
    };
  }
  return Object.freeze({ version: '1.0.0', render: render, _internal: Object.freeze({ groupsFor: groupsFor, uniformReference: uniformReference, chartGeometry: chartGeometry, assessmentText: assessmentText }) });
});
