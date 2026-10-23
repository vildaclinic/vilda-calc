/* Educational reading of a published INSL3 age curve, separate from laboratory
 * reference profiles, patient concentrations and the lifespan illustration.
 * Source values and eligibility are supplied as data; no persistence or fit. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VildaInsl3AgeSource = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
  function nonempty(value) { return typeof value === 'string' && value.trim().length > 0; }
  function copy(value) {
    if (Array.isArray(value)) return value.map(copy);
    if (!value || typeof value !== 'object') return value;
    var result = {};
    Object.keys(value).forEach(function (key) { result[key] = copy(value[key]); });
    return result;
  }
  function validSource(data, policy) {
    var source = data && data.source, limits = source && source.limits;
    if (!data || data.kind !== 'digitized-age-source-data' || data.clinicalActivation !== false ||
        !nonempty(data.id) || !nonempty(data.version) || !nonempty(data.sex) ||
        !source || source.id !== data.id || !nonempty(source.label) || !nonempty(source.citation) ||
        !nonempty(source.population) || !nonempty(source.statistic) || !nonempty(source.unit) ||
        !limits || limits.unit !== source.unit || !finite(limits.lod) || limits.lod < 0 ||
        !finite(limits.loq) || limits.loq <= limits.lod ||
        !policy || policy.kind !== 'educational-age-source-reading' || !nonempty(policy.id) ||
        !nonempty(policy.version) || policy.sourceId !== data.id || policy.sex !== data.sex ||
        policy.contextBasis !== 'current-form' || policy.clinicalActivation !== false ||
        policy.notClinicalReference !== true || policy.noPatientComparison !== true ||
        policy.onlyDirectVisibleStroke !== true || policy.bridgesAllowed !== false ||
        policy.ageIntervalMustBeWhollyCovered !== true || policy.loqCrossingBlocksModeledMedian !== false ||
        policy.rangeRounding !== 'outward' || !Number.isInteger(policy.displayDecimalPlaces) ||
        policy.displayDecimalPlaces < 0 || policy.displayDecimalPlaces > 6 ||
        !Array.isArray(policy.allowedAgeDomains) || !policy.allowedAgeDomains.length ||
        !Array.isArray(data.segments) || !data.segments.length) return false;
    var previousDomainEnd = -1;
    if (!policy.allowedAgeDomains.every(function (domain) {
      if (!Array.isArray(domain) || domain.length !== 2 || !finite(domain[0]) || !finite(domain[1]) ||
          domain[0] < 0 || domain[1] < domain[0] || domain[0] <= previousDomainEnd) return false;
      previousDomainEnd = domain[1];
      return true;
    })) return false;
    var previousAge = -1, previousX = -1;
    return data.segments.every(function (segment) {
      if (!segment || !finite(segment.ageMin) || !finite(segment.ageMax) ||
          !Array.isArray(segment.points) || !segment.points.length ||
          !Array.isArray(segment.points[0]) || !Array.isArray(segment.points[segment.points.length - 1]) ||
          segment.ageMin !== segment.points[0][0] || segment.ageMax !== segment.points[segment.points.length - 1][0] ||
          segment.ageMin <= previousAge) return false;
      var pointAge = -1, pointX = -1;
      var valid = segment.points.every(function (point, index) {
        if (!Array.isArray(point) || point.length !== 4 || !finite(point[0]) || point[0] < 0 ||
            !finite(point[1]) || point[1] < 0 || !Number.isInteger(point[2]) || point[2] < 0 ||
            !finite(point[3]) || point[3] < 0 || point[0] <= pointAge ||
            index > 0 && point[2] !== pointX + 1 || index === 0 && point[2] <= previousX) return false;
        pointAge = point[0]; pointX = point[2];
        return true;
      });
      previousAge = segment.ageMax; previousX = pointX;
      return valid;
    });
  }

  function read(data, policy, context) {
    function unavailable(reason) {
      return { status: 'unavailable', reason: reason, kind: 'educational-age-source-reading', clinicalActivation: false };
    }
    if (!validSource(data, policy)) return unavailable('invalid-source');
    if (!context || context.sourceStatus !== 'ready') return unavailable('context-not-ready');
    if (context.sex !== policy.sex) return unavailable('sex-not-covered');
    var lower = context.ageYears, upper = context.ageUpperYears;
    if (!finite(lower) || lower < 0) return unavailable('age-unknown');
    if (typeof context.ageUpperInclusive !== 'boolean' || !finite(upper) || upper < lower ||
        upper === lower && context.ageUpperInclusive === false) return unavailable('age-precision-unknown');
    if (context.contextBasis !== policy.contextBasis || context.sampleDateISO) return unavailable('context-basis-not-supported');
    var domains = policy.allowedAgeDomains;
    var matchingDomain = domains.find(function (domain) { return lower >= domain[0] && upper <= domain[1]; });
    if (!matchingDomain) {
      if (lower < domains[0][0] || upper > domains[domains.length - 1][1]) return unavailable('outside-proposed-age-domain');
      return unavailable('age-domain-documentation-conflict');
    }
    var segment = data.segments.find(function (item) { return lower >= item.ageMin && upper <= item.ageMax; });
    if (!segment) {
      if (upper < data.segments[0].ageMin) return unavailable('unresolved-low-stroke');
      return unavailable(upper === lower ? 'stroke-occluded' : 'age-interval-not-fully-readable');
    }
    var points = segment.points;
    function at(age) {
      var index = points.findIndex(function (point) { return point[0] >= age; });
      var right = points[index], left = age === right[0] || index === 0 ? right : points[index - 1];
      // Membership of one validated segment permits only adjacent native columns.
      var fraction = right[0] === left[0] ? 0 : (age - left[0]) / (right[0] - left[0]);
      return { value: left[1] + fraction * (right[1] - left[1]), allowance: Math.max(left[3], right[3]) };
    }
    var samples = [at(lower), at(upper)];
    points.forEach(function (point) {
      if (point[0] > lower && point[0] < upper) samples.push({ value: point[1], allowance: point[3] });
    });
    var minimum = Math.min.apply(null, samples.map(function (sample) { return sample.value; }));
    var maximum = Math.max.apply(null, samples.map(function (sample) { return sample.value; }));
    var graphicLower = Math.min.apply(null, samples.map(function (sample) { return sample.value - sample.allowance; }));
    var graphicUpper = Math.max.apply(null, samples.map(function (sample) { return sample.value + sample.allowance; }));
    // A larger endpoint allowance applies throughout its native bracket. Include
    // both ends of every intersected edge so a whole-age envelope contains all
    // its individual-age readings, also across the allowance change near age20.
    if (upper > lower) {
      for (var i = 1; i < points.length; i += 1) {
        var left = points[i - 1], right = points[i];
        var from = Math.max(lower, left[0]), to = Math.min(upper, right[0]);
        if (from >= to) continue;
        var allowance = Math.max(left[3], right[3]);
        [from, to].forEach(function (age) {
          var value = left[1] + (age - left[0]) / (right[0] - left[0]) * (right[1] - left[1]);
          graphicLower = Math.min(graphicLower, value - allowance);
          graphicUpper = Math.max(graphicUpper, value + allowance);
        });
      }
    }
    var decimals = policy.displayDecimalPlaces, factor = Math.pow(10, decimals);
    var roundedMin = Number(minimum.toFixed(decimals)), roundedMax = Number(maximum.toFixed(decimals));
    var single = roundedMin === roundedMax;
    var limits = data.source.limits;
    return {
      status: 'ready', kind: policy.kind, valueKind: single ? 'approximate-value' : 'approximate-median-range',
      sourceId: data.id, sourceVersion: data.version, policyVersion: policy.version,
      source: copy(data.source), population: data.source.population, statistic: data.source.statistic,
      unit: data.source.unit, ageLower: lower, ageUpper: upper, ageUpperInclusive: context.ageUpperInclusive,
      valueMin: single ? roundedMin : Math.floor(minimum * factor) / factor,
      valueMax: single ? roundedMax : Math.ceil(maximum * factor) / factor,
      graphicalLower: Math.floor(graphicLower * factor) / factor,
      graphicalUpper: Math.ceil(graphicUpper * factor) / factor,
      sourceLoqCrossing: graphicLower < limits.loq && graphicUpper >= limits.loq,
      sourceLodCrossing: graphicLower < limits.lod && graphicUpper >= limits.lod,
      clinicalActivation: false, directOnly: true
    };
  }
  return Object.freeze({ read: read });
});
