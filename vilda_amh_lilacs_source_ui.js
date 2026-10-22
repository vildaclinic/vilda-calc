/* Published cohort information only. No patient comparison or reference range. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VildaAmhLilacsSourceUI = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
  function unavailable(reason) { return { status: 'unavailable', reason: reason }; }
  function copy(value) {
    if (Array.isArray(value)) return value.map(copy);
    if (!value || typeof value !== 'object') return value;
    var result = {};
    Object.keys(value).forEach(function (key) { result[key] = copy(value[key]); });
    return result;
  }
  function validData(data) {
    var domain = data && data.ageDomain, median = data && data.median;
    var source = data && data.source, policy = data && data.policy;
    return !!(data && data.kind === 'published-cohort-information' && data.analyte === 'amh' && data.sex === 'male' &&
      domain && finite(domain.minYears) && finite(domain.maxYears) && domain.minYears >= 0 && domain.maxYears > domain.minYears &&
      median && finite(median.value) && median.value >= 0 && median.unit === 'pmol/L' &&
      finite(median.approxNgMl) && median.approxNgMl >= 0 &&
      source && typeof source.id === 'string' && source.id && typeof source.citation === 'string' &&
      typeof source.ageLabel === 'string' && Number.isInteger(source.participants) && source.participants > 0 &&
      policy && policy.notClinicalReference === true && policy.noPatientComparison === true &&
      policy.fullAgeIntervalRequired === true && policy.ordinaryOnly === true &&
      Array.isArray(policy.measurementUnits) && policy.measurementUnits.length > 0);
  }
  function usableMeasurement(data, measurement) {
    if (!measurement || measurement.status && measurement.status !== 'valid' ||
        data.policy.measurementUnits.indexOf(measurement.unit) < 0) return false;
    var operator = measurement.operator || '=';
    if (['=', '<', '>', '≤', '≥', '<=', '>='].indexOf(operator) < 0) return false;
    if (measurement.value === null) {
      return ['<', '≤', '<='].indexOf(operator) >= 0 && ['LOD', 'LOQ'].indexOf(measurement.censoring) >= 0;
    }
    return finite(measurement.value) && measurement.value >= 0 && !(operator === '<' && measurement.value === 0);
  }
  function evaluate(data, context) {
    var c = context || {};
    if (c.sourceStatus !== 'ready') return unavailable('patient-context-unavailable');
    if (!validData(data)) return unavailable('source-unavailable');
    if (c.analyte !== data.analyte) return unavailable('unsupported-analyte');
    if (c.sex !== data.sex) return unavailable('unsupported-sex');
    if (c.compare !== undefined && c.compare !== false || c.view !== undefined && c.view !== 'life') {
      return unavailable('unsupported-view');
    }
    if (c.selected !== undefined && (!Array.isArray(c.selected) || c.selected.indexOf('amh') < 0)) {
      return unavailable('unselected-analyte');
    }
    if (c.sampleDateISO || [undefined, null, '', 'current-patient'].indexOf(c.contextBasis) < 0) {
      return unavailable('historical-context');
    }
    if (!finite(c.ageYears) || c.ageYears < 0) return unavailable('missing-age');
    var upper = c.ageUpperYears == null ? c.ageYears : c.ageUpperYears;
    if (!finite(upper) || upper < c.ageYears) return unavailable('ambiguous-age');
    if (c.ageYears < data.ageDomain.minYears || c.ageYears > data.ageDomain.maxYears) return unavailable('unsupported-age');
    if (upper > data.ageDomain.maxYears) return unavailable('ambiguous-age');
    if (!usableMeasurement(data, c.measurement)) return unavailable('invalid-measurement');
    // These are study facts, independent of the patient's result, treatment,
    // specimen or assay. This model deliberately carries no patient value.
    return { status: 'ready', source: copy(data.source), median: copy(data.median), ageDomain: copy(data.ageDomain) };
  }

  function mount(options) {
    var opts = options || {}, host = opts.host;
    if (!host || !host.ownerDocument) return null;
    var data = Object.prototype.hasOwnProperty.call(opts, 'data') ? opts.data
      : root.VildaHormoneLifespanData && root.VildaHormoneLifespanData.amhLilacsSourceData;
    var doc = host.ownerDocument, identity = null;
    host.innerHTML = '<section class="vilda-amh-lilacs-source" aria-label="Dane z badania LiLACS">' +
      '<div class="vals-heading"><h3>Dane z badania LiLACS</h3><span class="vals-source-label" data-amh-lilacs="label"></span></div>' +
      '<p class="vals-cohort" data-amh-lilacs="cohort"></p>' +
      '<div class="vals-median-block"><span>Mediana całej badanej grupy</span><p>' +
      '<strong data-amh-lilacs="median"></strong><span data-amh-lilacs="equivalent"></span></p></div>' +
      '<p class="vals-limit">Dane historyczne; nie jest to norma ani mediana dokładnego wieku.</p>' +
      '<details class="vals-details"><summary>Źródło i ograniczenia<span aria-hidden="true">+</span></summary>' +
      '<div class="vals-source-copy" data-amh-lilacs="sources"></div></details></section>';
    var panel = host.firstElementChild, details = panel.querySelector('details');
    function node(name) { return panel.querySelector('[data-amh-lilacs="' + name + '"]'); }
    function format(value) {
      return new Intl.NumberFormat('pl-PL', { maximumSignificantDigits: 3, useGrouping: false }).format(value);
    }
    function paragraph(label, value) {
      var p = doc.createElement('p');
      if (label) { var strong = doc.createElement('strong'); strong.textContent = label + ' '; p.append(strong); }
      p.append(doc.createTextNode(value));
      return p;
    }
    function clear() {
      host.hidden = true;
      ['label', 'cohort', 'median', 'equivalent', 'sources'].forEach(function (name) { node(name).replaceChildren(); });
      panel.removeAttribute('data-source-id');
      node('median').removeAttribute('data-source-value');
      node('median').removeAttribute('data-source-unit');
      details.open = false;
      identity = null;
    }
    function update(context) {
      var next = context || {}, result = evaluate(data, next);
      if (result.status !== 'ready') { clear(); return false; }
      if (identity !== next.identityKey) details.open = false;
      identity = next.identityKey;
      var source = result.source;
      panel.setAttribute('data-source-id', source.id);
      node('label').textContent = source.label || source.cohort || 'LiLACS NZ';
      node('cohort').textContent = source.participants + ' mężczyzn · ' + source.ageLabel;
      node('median').textContent = format(result.median.value) + ' ';
      var unit = doc.createElement('small'); unit.textContent = result.median.unit;
      node('median').append(unit);
      node('median').setAttribute('data-source-value', String(result.median.value));
      node('median').setAttribute('data-source-unit', result.median.unit);
      node('equivalent').textContent = '≈' + format(result.median.approxNgMl) + ' ng/mL';
      var paragraphs = [paragraph('Populacja.', source.population || ''),
        paragraph('Metody.', (source.specimen === 'serum' ? 'Materiał: surowica. ' : '') + (source.method || ''))];
      (Array.isArray(source.limitations) ? source.limitations : []).forEach(function (limitation) {
        paragraphs.push(paragraph('', limitation));
      });
      var citation = paragraph('', source.citation);
      if (typeof source.url === 'string' && /^https:\/\//.test(source.url)) {
        var link = doc.createElement('a'); link.href = source.url; link.textContent = ' Publikacja źródłowa';
        link.target = '_blank'; link.rel = 'noopener noreferrer'; citation.append(link);
      }
      paragraphs.push(citation);
      node('sources').replaceChildren.apply(node('sources'), paragraphs);
      host.hidden = false;
      return true;
    }
    clear();
    return { update: update, clear: clear };
  }
  return { evaluate: evaluate, mount: mount };
});
