/* Published FSH day-3 P50 only. Source data and eligibility are supplied;
 * no LMS/SDS, patient percentile, RI, ratio, clinical classification or storage. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VildaFshD3 = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
  function nonempty(value) { return typeof value === 'string' && value.trim().length > 0; }
  function stringList(value) { return Array.isArray(value) && value.length > 0 && value.every(nonempty); }
  function normalized(value) { return typeof value === 'string' ? value.trim().toLowerCase() : value; }
  function known(value) { return value != null && value !== '' && value !== 'unknown'; }
  function positive(value) { return value === true || value === 'yes'; }
  function unavailable(reason) { return { status: 'unavailable', reason: reason }; }
  function copy(value) {
    if (Array.isArray(value)) return value.map(copy);
    if (!value || typeof value !== 'object') return value;
    var result = {};
    Object.keys(value).forEach(function (key) { result[key] = copy(value[key]); });
    return result;
  }
  function ticks(value, min, max) {
    return Array.isArray(value) && value.length >= 2 && value[0] === min && value[value.length - 1] === max &&
      value.every(function (item, index) { return finite(item) && (index === 0 || item > value[index - 1]); });
  }
  function validData(data) {
    var domain = data && data.ageDomain, placement = data && data.placement;
    var source = data && data.source, policy = data && data.policy, plot = policy && policy.plot;
    if (!(data && data.kind === 'published-age-median-information' && nonempty(data.version) &&
      data.analyte === 'fsh' && data.sex === 'female' && data.unit === 'IU/L' &&
      domain && Number.isInteger(domain.min) && Number.isInteger(domain.max) && domain.min >= 0 &&
      domain.max > domain.min && domain.minimumInclusive === true && domain.maximumInclusive === true &&
      placement && placement.kind === 'application-adult-placement' &&
      finite(placement.minimumAgeYearsExclusive) && placement.minimumAgeYearsExclusive >= domain.min &&
      placement.minimumAgeYearsExclusive < domain.max && nonempty(placement.description) &&
      Array.isArray(data.knots) && data.knots.length === domain.max - domain.min + 1 &&
      data.knots.every(function (point, index) {
        return point && point.ageYears === domain.min + index && finite(point.median) && point.median > 0;
      }) && source && ['id', 'label', 'citation', 'population', 'method', 'specimen', 'statistic', 'url', 'limitsDescription']
        .every(function (key) { return nonempty(source[key]); }) && stringList(source.limitations) &&
      policy && policy.notClinicalReference === true && policy.noClinicalClassification === true &&
      policy.medianOnly === true && policy.fullAgeIntervalRequired === true && policy.ordinaryOnly === true &&
      policy.interpolation === 'linear-between-published-knots' && policy.ageReferenceBasis === 'entered-age-lower-bound' &&
      nonempty(policy.chartSelectionKey) &&
      ['cycleDayValues', 'comparisonCyclePhases', 'measurementUnits', 'allowedAssayMethodIds', 'allowedSpecimens',
        'excludedCyclePhases', 'excludedPositiveFlags', 'excludedTreatmentContexts', 'excludedTreatmentFlags',
        'allowedMeasurementKinds'].every(function (key) { return stringList(policy[key]); }) &&
      policy.cycleDayValues.indexOf('day3') >= 0 && policy.cycleDayValues.indexOf('unknown') >= 0 &&
      policy.cycleDayValues.indexOf('other') >= 0 &&
      plot && plot.ageMin === domain.min && plot.ageMax === domain.max && finite(plot.valueMin) &&
      finite(plot.valueMax) && plot.valueMin >= 0 && plot.valueMax > plot.valueMin && plot.unit === data.unit &&
      plot.independentOfPatient === true && ticks(plot.ageTicks, plot.ageMin, plot.ageMax) &&
      ticks(plot.valueTicks, plot.valueMin, plot.valueMax))) return false;
    return true;
  }
  function usableMeasurement(data, context) {
    if (context.measurementValid === false) return false;
    var measurement = context.measurement;
    // A parser verdict without a copied result can allow source information,
    // but can never create an exact patient point.
    if (measurement == null) return context.measurementValid === true;
    if (typeof measurement !== 'object' || Array.isArray(measurement) ||
      measurement.status && measurement.status !== 'valid' ||
      data.policy.measurementUnits.indexOf(measurement.unit) < 0) return false;
    var operator = measurement.operator == null ? '=' : measurement.operator;
    if (['=', '<', '>', '≤', '≥', '<=', '>='].indexOf(operator) < 0) return false;
    if (measurement.value === null) {
      var limit = measurement.limitKind || measurement.censoring;
      return ['<', '≤', '<='].indexOf(operator) >= 0 && ['LOD', 'LOQ'].indexOf(limit) >= 0;
    }
    return finite(measurement.value) && measurement.value >= 0 && !(operator === '<' && measurement.value === 0);
  }
  function medianAt(data, ageYears) {
    var points = data.knots;
    for (var index = 0; index < points.length; index++) {
      var point = points[index];
      if (ageYears === point.ageYears) {
        return { value: point.median, unit: data.unit, ageYears: ageYears, interpolated: false };
      }
      if (ageYears < point.ageYears && index > 0) {
        var lower = points[index - 1];
        var fraction = (ageYears - lower.ageYears) / (point.ageYears - lower.ageYears);
        return { value: lower.median + fraction * (point.median - lower.median),
          unit: data.unit, ageYears: ageYears, interpolated: true };
      }
    }
    return null;
  }
  function comparison(data, context, median) {
    var day = normalized(context.cycleDay);
    if (!known(day)) day = 'unknown';
    var reason = null;
    if (data.policy.cycleDayValues.indexOf(day) < 0) reason = 'unsupported-cycle-day';
    else if (day === 'unknown') reason = 'unknown-cycle-day';
    else if (day !== 'day3') reason = 'other-cycle-day';
    var phase = normalized(context.cyclePhase);
    if (!known(phase)) phase = 'unknown';
    if (!reason && data.policy.comparisonCyclePhases.indexOf(phase) < 0) reason = 'incompatible-cycle-phase';
    var measurement = context.measurement;
    if (!reason && (!measurement || measurement.isExact === false ||
      measurement.operator != null && measurement.operator !== '=' || !finite(measurement.value))) {
      reason = 'non-exact-measurement';
    }
    if (reason) return { status: 'unavailable', reason: reason, patientPoint: null };
    return { status: 'ready', reason: null,
      patientPoint: { ageYears: median.ageYears, value: measurement.value, unit: data.unit } };
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
    var policy = data.policy;
    if (c.selected !== undefined && (!Array.isArray(c.selected) || c.selected.indexOf(policy.chartSelectionKey) < 0)) {
      return unavailable('unselected-analyte');
    }
    if (c.sampleDateISO || [undefined, null, '', 'current-patient'].indexOf(c.contextBasis) < 0) {
      return unavailable('historical-context');
    }
    var treatment = c.treatment || {};
    if (c.contraindicated === true || policy.excludedPositiveFlags.some(function (key) { return positive(c[key]); }) ||
      policy.excludedTreatmentContexts.indexOf(normalized(treatment.context)) >= 0 ||
      policy.excludedTreatmentFlags.some(function (key) { return positive(treatment[key]); }) ||
      known(normalized(c.measurementKind)) && policy.allowedMeasurementKinds.indexOf(normalized(c.measurementKind)) < 0) {
      return unavailable('contraindicated');
    }
    if (policy.excludedCyclePhases.indexOf(normalized(c.cyclePhase)) >= 0) {
      return unavailable('incompatible-reproductive-context');
    }
    if (!finite(c.ageYears) || c.ageYears < 0) return unavailable('missing-age');
    var upper = c.ageUpperYears == null ? c.ageYears : c.ageUpperYears;
    if (!finite(upper) || upper < c.ageYears) {
      return unavailable('ambiguous-age');
    }
    if (c.ageYears <= data.placement.minimumAgeYearsExclusive) return unavailable('unsupported-placement-age');
    // Check the WHOLE declared interval before evaluating its entered lower
    // bound. An exclusive end above the last knot still crosses the domain.
    if (c.ageYears < data.ageDomain.min || upper > data.ageDomain.max) return unavailable('unsupported-source-age');
    var specimen = normalized(c.specimen);
    if (known(specimen) && policy.allowedSpecimens.indexOf(specimen) < 0) return unavailable('incompatible-specimen');
    var assay = normalized(c.assayMethodId);
    if (known(assay) && policy.allowedAssayMethodIds.indexOf(assay) < 0) return unavailable('incompatible-assay');
    if (!usableMeasurement(data, c)) return unavailable('invalid-measurement');
    var median = medianAt(data, c.ageYears);
    if (!median) return unavailable('unsupported-source-age');
    return { status: 'ready', version: data.version, source: copy(data.source), policy: copy(policy),
      placement: copy(data.placement), ageDomain: copy(data.ageDomain), knots: copy(data.knots), median: median,
      ageContext: { lowerYears: c.ageYears, upperYears: upper, upperInclusive: c.ageUpperInclusive !== false,
        basis: policy.ageReferenceBasis }, comparison: comparison(data, c, median) };
  }
  return Object.freeze({ evaluate: evaluate });
});
