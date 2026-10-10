/* Published inhibin B group observations, separate from age-dependent curves.
 * This view never creates reference intervals or interpolated patient values.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VildaHormoneLifespanObservations = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var SVG = 'http://www.w3.org/2000/svg';
  var INK = '#365b66';
  var GREEN = '#287750';
  var COLORS = { male: '#246782', female: '#a54173' };

  function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
  function inhibin(value) { return value === 'inhb' || value === 'inhibin_b'; }
  function unavailable(reason) { return { status: 'unavailable', reason: reason }; }
  function number(value) {
    return value >= 10000 ? value.toExponential(2).replace('.', ',')
      : value.toLocaleString('pl-PL', { maximumFractionDigits: 1 });
  }
  function patientNumber(value) {
    if (value !== 0 && (value < .001 || value >= 10000)) {
      return value.toExponential(5).replace(/\.?0+e/, 'e').replace('.', ',');
    }
    return value.toLocaleString('pl-PL', { maximumSignificantDigits: 6 });
  }
  function axisMaximum(value) {
    var step = value <= 100 ? 25 : 50;
    var result = Math.ceil(value * 1.1 / step) * step;
    return Number.isFinite(result) ? result : value;
  }

  function evaluateSenior(evidence, context) {
    var c = context || {};
    var sourceData = evidence && evidence.senior;
    if (!inhibin(c.analyte)) return unavailable('unsupported-analyte');
    if (c.sex !== 'male') return unavailable('unsupported-sex');
    if (c.contraindicated === true) return unavailable('contraindicated');
    if (!finite(c.ageYears) || c.ageYears < 0) return unavailable('missing-age');
    var upper = c.ageUpperYears == null ? c.ageYears : c.ageUpperYears;
    if (!finite(upper) || upper < c.ageYears) return unavailable('ambiguous-age');
    if (!sourceData || !Array.isArray(sourceData.groups)) return unavailable('unsupported-age');
    var groups = sourceData.groups.filter(function (group) {
      return group.active === true && c.ageYears >= group.minAge &&
        (group.applicationMaxAgeExclusive ? c.ageYears < group.maxAge : c.ageYears <= group.maxAge);
    });
    if (groups.length !== 1) return unavailable('unsupported-age');
    var group = groups[0];
    var exclusiveUpper = c.ageUpperInclusive === false && upper > c.ageYears;
    if (upper > group.maxAge || (upper === group.maxAge && group.applicationMaxAgeExclusive && !exclusiveUpper)) {
      return unavailable('ambiguous-age');
    }
    var specimen = typeof c.specimen === 'string' ? c.specimen.trim().toLowerCase() : '';
    if (specimen && specimen !== 'unknown' && specimen !== 'serum' && specimen !== 'surowica') {
      return unavailable('incompatible-specimen');
    }
    var source = sourceData.source;
    var method = typeof c.assayMethodId === 'string' ? c.assayMethodId.trim().toLowerCase() : '';
    if (method && method !== 'unknown' && (!Array.isArray(source.compatibleAssayMethodIds) ||
        source.compatibleAssayMethodIds.indexOf(method) < 0)) return unavailable('incompatible-assay');
    var measurement = c.measurement;
    if (!measurement || !finite(measurement.value) || measurement.value < 0) return unavailable('invalid-value');
    if (measurement.operator != null && measurement.operator !== '' && measurement.operator !== '=') {
      return unavailable('censored-result');
    }
    if (measurement.unit !== 'pg/mL' && measurement.unit !== 'ng/L') return unavailable('unsupported-unit');
    if (!finite(group.mean) || group.mean <= 0) return unavailable('unsupported-age');
    return { status: 'ready', source: source, group: group, value: measurement.value,
      referenceValue: group.mean, statistic: 'group-mean', unit: 'pg/mL' };
  }

  function node(document, name, attrs, content) {
    var result = document.createElementNS(SVG, name);
    Object.keys(attrs || {}).forEach(function (key) { result.setAttribute(key, attrs[key]); });
    if (content != null) result.textContent = content;
    return result;
  }

  function text(document, svg, x, y, value, attrs) {
    var result = node(document, 'text', Object.assign({ x: x, y: y, fill: INK,
      'font-family': 'system-ui, sans-serif', 'font-size': 11 }, attrs || {}), value);
    svg.append(result);
    return result;
  }

  function paragraph(document, host, message, className) {
    var p = document.createElement('p');
    p.className = className || 'vhl-observations-note';
    p.textContent = message;
    host.append(p);
    return p;
  }

  function chart(host, kind, label, height) {
    var document = host.ownerDocument;
    var width = Math.max(160, host.clientWidth || 520);
    var svg = node(document, 'svg', { viewBox: '0 0 ' + width + ' ' + height,
      width: '100%', height: height, role: 'img', 'aria-label': label,
      class: 'vhl-observations-chart', 'data-inhibin-observation': kind });
    host.append(svg);
    return { svg: svg, width: width, document: document };
  }

  function drawAxes(plot, maximum, height) {
    var top = 27, bottom = height - 30;
    var left = 35, right = plot.width - 24;
    var y = function (value) { return bottom - value / maximum * (bottom - top); };
    [0, .5, 1].forEach(function (part) {
      var yy = y(maximum * part);
      plot.svg.append(node(plot.document, 'line', { x1: left, x2: right, y1: yy, y2: yy,
        stroke: '#cbdcde', 'stroke-width': .8, 'stroke-dasharray': part ? '3 4' : 'none' }));
      text(plot.document, plot.svg, left - 6, yy + 4, number(maximum * part),
        { 'text-anchor': 'end', 'font-size': 10 });
    });
    text(plot.document, plot.svg, 0, 13, 'pg/mL', { 'font-size': 10 });
    return { left: left, right: right, top: top, bottom: bottom, y: y };
  }

  function cohortLabel(cohort, compare) {
    var birth = cohort.birthGroup === 'preterm'
      ? (cohort.sex === 'male' ? 'Wcześniacy' : 'Wcześniaczki')
      : (cohort.sex === 'male' ? 'Donoszeni' : 'Donoszone');
    return compare ? (cohort.sex === 'male' ? 'Chłopcy · ' : 'Dziewczynki · ') + birth.toLowerCase() : birth;
  }

  function renderMini(host, evidence, context) {
    var data = evidence.mini;
    if (!data || !Array.isArray(data.cohorts) || !Array.isArray(data.visits)) return null;
    var cohorts = data.cohorts.filter(function (cohort) { return context.compare || cohort.sex === context.sex; });
    if (!cohorts.length) return null;
    paragraph(host.ownerDocument, host, 'Minipuberty · mediany grup', 'vhl-observations-title');
    var detail = cohorts.map(function (cohort) {
      return cohortLabel(cohort, true) + ': ' + cohort.points.map(function (point) {
        var visit = data.visits.find(function (item) { return item.id === point.visitId; });
        return visit.label + ' ' + number(point.median) + ' pg/mL';
      }).join(', ');
    }).join('. ');
    var plot = chart(host, 'mini', 'Inhibina B: mediany w dwóch terminach. ' + detail, 202);
    var maximum = axisMaximum(Math.max.apply(null, cohorts.flatMap(function (cohort) {
      return cohort.points.map(function (point) { return point.median; });
    })));
    var axis = drawAxes(plot, maximum, 202);
    var x = function (index) { return axis.left + 5 + index * (axis.right - axis.left - 10); };
    data.visits.forEach(function (visit, index) {
      text(plot.document, plot.svg, x(index), 196,
        plot.width < 220 && index === 1 ? '3. mies.' : visit.label,
        { 'text-anchor': 'middle', 'font-weight': 600 });
    });
    var knownBirth = context.preterm === 'yes' ? 'preterm' : context.preterm === 'no' ? 'term' : null;
    var legend = plot.document.createElement('div');
    legend.className = 'vhl-observations-legend';
    cohorts.forEach(function (cohort) {
      var highlighted = knownBirth !== null && cohort.birthGroup === knownBirth && cohort.sex === context.sex;
      var color = COLORS[cohort.sex];
      var group = node(plot.document, 'g', { 'data-observation-series': cohort.id,
        'data-observation-highlight': highlighted, opacity: knownBirth && !highlighted ? .7 : 1 });
      var points = cohort.points.map(function (point) {
        return { point: point, index: data.visits.findIndex(function (visit) { return visit.id === point.visitId; }) };
      });
      group.append(node(plot.document, 'path', {
        d: points.map(function (entry, index) {
          return (index ? 'L' : 'M') + x(entry.index) + ',' + axis.y(entry.point.median);
        }).join(' '), fill: 'none', stroke: color, 'stroke-width': highlighted ? 3 : 2,
        'stroke-dasharray': cohort.birthGroup === 'preterm' ? '6 4' : 'none',
        'data-observation-connector': 'illustrative'
      }));
      points.forEach(function (entry) {
        var circle = node(plot.document, 'circle', { cx: x(entry.index), cy: axis.y(entry.point.median),
          r: highlighted ? 5 : 4, fill: '#fff', stroke: color, 'stroke-width': 2,
          'data-observation-point': entry.point.visitId, 'data-value': entry.point.median });
        circle.append(node(plot.document, 'title', {}, cohortLabel(cohort, true) + ': ' + number(entry.point.median) + ' pg/mL'));
        group.append(circle);
        if (cohorts.length === 2) text(plot.document, group, x(entry.index) + (entry.index ? -8 : 8),
          axis.y(entry.point.median) - 9, number(entry.point.median),
          { fill: color, 'text-anchor': entry.index ? 'end' : 'start', 'font-weight': 650,
            stroke: '#f1f7f7', 'stroke-width': 3, 'paint-order': 'stroke', 'stroke-linejoin': 'round' });
      });
      plot.svg.append(group);
      var item = plot.document.createElement('span');
      var swatch = plot.document.createElement('i');
      swatch.className = 'vhl-observations-swatch';
      swatch.dataset.sex = cohort.sex;
      swatch.dataset.birthGroup = cohort.birthGroup;
      swatch.setAttribute('aria-hidden', 'true');
      item.append(swatch, plot.document.createTextNode(cohortLabel(cohort, context.compare)));
      legend.append(item);
    });
    host.append(legend);
    paragraph(plot.document, host, 'Wiek chronologiczny. Łączniki są poglądowe; mediany nie wyznaczają normy.');
    return { kind: 'mini', source: data.source, patientPoint: null };
  }

  function renderTanner(host, evidence, context) {
    var data = evidence.tanner;
    if (!data || !Array.isArray(data.points) || (!context.compare && context.sex !== 'male')) return null;
    paragraph(host.ownerDocument, host, 'Chłopcy · mediany według stadium G', 'vhl-observations-title');
    var plot = chart(host, 'tanner', 'Inhibina B u chłopców według stadium genitalnego. ' +
      data.points.map(function (point) { return point.label + ': ' + point.median + ' pg/mL'; }).join('. '), 184);
    var axis = drawAxes(plot, axisMaximum(Math.max.apply(null, data.points.map(function (point) { return point.median; }))), 184);
    var ages = data.source.sourceAgeYears;
    var upper = context.ageUpperYears == null ? context.ageYears : context.ageUpperYears;
    var canHighlight = context.sex === 'male' && context.puberty && context.puberty.kind === 'G' &&
      Array.isArray(ages) && finite(context.ageYears) && finite(upper) && upper >= context.ageYears &&
      context.ageYears >= ages[0] && upper <= ages[1];
    data.points.forEach(function (point, index) {
      var x = axis.left + (index + .5) * (axis.right - axis.left) / data.points.length;
      var selected = canHighlight && context.puberty.stage === point.stage;
      var group = node(plot.document, 'g', { 'data-observation-stage': point.stage,
        'data-observation-highlight': Boolean(selected) });
      if (selected) group.append(node(plot.document, 'rect', { x: x - 12, y: axis.top - 7,
        width: 24, height: axis.bottom - axis.top + 30, rx: 10, fill: '#d4e9df' }));
      group.append(node(plot.document, 'circle', { cx: x, cy: axis.y(point.median), r: selected ? 5.5 : 4.5,
        fill: selected ? GREEN : '#fff', stroke: GREEN, 'stroke-width': 2,
        'data-observation-point': point.label, 'data-value': point.median }));
      text(plot.document, group, x, axis.y(point.median) - 12, number(point.median),
        { 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 650 });
      text(plot.document, group, x, 178, point.label, { 'text-anchor': 'middle', 'font-weight': selected ? 750 : 550 });
      plot.svg.append(group);
    });
    paragraph(plot.document, host, 'Stadium, nie wiek. Mediany grup nie są granicami normy.');
    return { kind: 'tanner', source: data.source, patientPoint: null };
  }

  function renderSenior(host, evidence, context) {
    var data = evidence.senior;
    if (!data || !Array.isArray(data.groups) || context.sex !== 'male' || context.compare) return null;
    var evaluated = evaluateSenior(evidence, context);
    var result = evaluated.status === 'ready' ? evaluated : null;
    paragraph(host.ownerDocument, host, 'Mężczyźni · średnie grup wieku', 'vhl-observations-title');
    var plot = chart(host, 'senior', 'Inhibina B: średnie arytmetyczne grup wieku. ' +
      data.groups.map(function (group) { return group.ageLabel + ': ' + group.mean + ' pg/mL'; }).join('. ') +
      (result ? '. Wynik pacjenta: ' + patientNumber(result.value) + ' pg/mL. Średnia grupy: ' + result.referenceValue + ' pg/mL.' : ''), 230);
    var maximum = axisMaximum(Math.max.apply(null, data.groups.map(function (group) { return group.mean; }).concat(result ? result.value : 0)));
    var left = Math.min(75, plot.width * .35), right = plot.width - 14;
    var x = function (value) { return left + value / maximum / 1.15 * (right - left); };
    [0, .5, 1].forEach(function (fraction) {
      var xx = x(maximum * fraction);
      plot.svg.append(node(plot.document, 'line', { x1: xx, x2: xx, y1: 22, y2: 198,
        stroke: '#cbdcde', 'stroke-width': .8, 'stroke-dasharray': '3 4' }));
      text(plot.document, plot.svg, xx, 216, number(maximum * fraction), { 'text-anchor': 'middle', 'font-size': 10 });
    });
    text(plot.document, plot.svg, right, 13, 'pg/mL', { 'text-anchor': 'end', 'font-size': 10 });
    data.groups.forEach(function (group, index) {
      var y = 37 + index * 35;
      var xx = x(group.mean);
      text(plot.document, plot.svg, left - 8, y + 4, group.minAge + '–' + group.maxAge,
        { 'text-anchor': 'end', 'font-size': 11, 'font-weight': 600 });
      plot.svg.append(node(plot.document, 'line', { x1: left, x2: right, y1: y, y2: y,
        stroke: '#dbe6e7', 'stroke-width': .7 }));
      plot.svg.append(node(plot.document, 'circle', { cx: xx, cy: y, r: 4.5,
        fill: '#fff', stroke: GREEN, 'stroke-width': 2, 'data-observation-point': group.ageLabel,
        'data-value': group.mean, 'data-senior-reference': group.mean }));
      text(plot.document, plot.svg, Math.max(left + 10, xx), y - 10, number(group.mean),
        { 'text-anchor': 'middle', 'font-weight': 650, 'font-size': 10 });
      if (result && result.group === group) {
        plot.svg.append(node(plot.document, 'line', { x1: xx, x2: x(result.value), y1: y, y2: y,
          stroke: '#a2b6bc', 'stroke-dasharray': '3 3', 'stroke-width': 1.3 }));
        var dot = node(plot.document, 'circle', { cx: x(result.value), cy: y, r: 6,
          fill: '#d52d43', stroke: '#fff', 'stroke-width': 2, 'data-senior-result': '',
          'data-value': result.value, 'data-reference-value': result.referenceValue });
        dot.append(node(plot.document, 'title', {}, 'Wynik pacjenta: ' + patientNumber(result.value) + ' pg/mL. Średnia grupy: ' + result.referenceValue + ' pg/mL.'));
        plot.svg.append(dot);
      }
    });
    text(plot.document, plot.svg, 0, 13, 'Wiek · lata', { 'font-size': 10 });
    paragraph(plot.document, host, result
      ? 'Czerwona kropka: wynik ' + patientNumber(result.value) + ' pg/mL. Średnia grupy: ' + result.referenceValue + ' pg/mL; nie granica normy.'
      : 'Każdy punkt to średnia całej grupy wieku, nie granica normy.');
    return { kind: 'senior', source: data.source, patientPoint: result };
  }

  function clear(host) {
    if (!host) return;
    host.replaceChildren();
    host.hidden = true;
  }

  function render(host, evidence, context) {
    if (!host || !host.ownerDocument) return null;
    clear(host);
    var c = context || {};
    var selected = c.compare ? c.compareHormone === 'inhb'
      : Array.isArray(c.selected) && c.selected.indexOf('inhb') >= 0;
    if (!evidence || !selected || (c.sex !== 'male' && c.sex !== 'female')) return null;
    var kind = c.view === 'mini' ? 'mini' : c.view === 'puberty' ? 'tanner'
      : c.view === 'life' ? (c.activeStageKind === 'puberty' ? 'tanner' : c.activeStageKind) : null;
    host.classList.add('vhl-observations');
    host.hidden = false;
    var result = kind === 'mini' ? renderMini(host, evidence, c)
      : kind === 'tanner' ? renderTanner(host, evidence, c)
      : kind === 'senior' ? renderSenior(host, evidence, c) : null;
    if (!result) clear(host);
    return result;
  }

  return { render: render, clear: clear, evaluateSenior: evaluateSenior };
});
