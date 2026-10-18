/* Read-only published-age context. No interpolation, normality classification,
 * patient percentile, measurement-to-median ratio or persistence side effects.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VildaAmhAgeReference = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
  function text(value) { return typeof value === 'string' ? value.trim() : ''; }
  function key(value) { return text(value).toLowerCase(); }
  function unavailable(reason) { return { status: 'unavailable', reason: reason }; }
  function copy(value) {
    if (Array.isArray(value)) return value.map(copy);
    if (!value || typeof value !== 'object') return value;
    var result = {};
    Object.keys(value).forEach(function (name) { result[name] = copy(value[name]); });
    return result;
  }
  function includes(list, value) { return Array.isArray(list) && list.indexOf(value) >= 0; }
  function unitFactor(data, unit) {
    var factors = data && data.unitConversions;
    var factor = factors && Object.prototype.hasOwnProperty.call(factors, unit) ? factors[unit] : null;
    return finite(factor) && factor > 0 ? factor : null;
  }

  // Same numeric syntax as the existing laboratory parser, with source-provided
  // AMH units. A symbolic LOD/LOQ retains a null value; no source assay limit is
  // substituted for the unknown reporting limit of the patient's laboratory.
  function parseMeasurement(data, rawValue, unit) {
    var sourceUnit = text(unit);
    var raw = typeof rawValue === 'string' ? rawValue : finite(rawValue) ? String(rawValue) : '';
    var result = { status: 'invalid', raw: raw, operator: null, value: null,
      unit: sourceUnit, censoring: null };
    if (unitFactor(data, sourceUnit) === null) return result;
    if (rawValue == null || typeof rawValue === 'string' && text(rawValue) === '') {
      result.status = 'empty';
      return result;
    }
    var input = text(raw);
    var censored = input.match(/^(<=|<|≤)\s*(LOD|LOQ)$/i);
    var parsed = input.match(/^(<=|>=|<|>|=|≤|≥)?\s*((?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?)$/i);
    if (!censored && !parsed) return result;
    var operator = (censored || parsed)[1] || '=';
    if (operator === '<=') operator = '≤';
    if (operator === '>=') operator = '≥';
    var value = censored ? null : Number(parsed[2].replace(',', '.'));
    if (!censored && (!finite(value) || value < 0 || operator === '<' && value === 0)) return result;
    result.status = 'valid';
    result.operator = operator;
    result.value = value;
    result.censoring = censored ? censored[2].toUpperCase() : null;
    return result;
  }

  function validData(data) {
    if (!data || typeof data !== 'object' || !data.source || !data.policy ||
        !Array.isArray(data.points) || data.points.length < 2 || !data.ageDomain ||
        !finite(data.ageDomain.minYears) || !finite(data.ageDomain.maxYears) ||
        data.ageDomain.maxYears <= data.ageDomain.minYears ||
        unitFactor(data, data.canonicalUnit) !== 1) return false;
    return data.points.every(function (point, index, points) {
      return point && finite(point.ageYears) && finite(point.canonicalValue) && point.canonicalValue >= 0 &&
        point.statistic === 'P50' && (!index || point.ageYears > points[index - 1].ageYears);
    }) && data.points[0].ageYears === data.ageDomain.minYears &&
      data.points[data.points.length - 1].ageYears === data.ageDomain.maxYears;
  }

  function evaluate(data, context) {
    context = context || {};
    if (context.sourceStatus !== 'ready') return unavailable('patient-context-unavailable');
    if (!validData(data)) return unavailable('reference-unavailable');
    if (key(context.analyte) !== data.analyte) return unavailable('unsupported-analyte');
    if (context.sex !== data.sex) return unavailable('unsupported-sex');
    if (context.contraindicated === true) return unavailable('contraindicated');
    var lower = context.ageYears;
    if (!finite(lower) || lower < 0) return unavailable('missing-age');
    var upper = context.ageUpperYears == null ? lower : context.ageUpperYears;
    if (!finite(upper) || upper < lower) return unavailable('ambiguous-age');
    var domain = data.ageDomain;
    if (lower < domain.minYears || lower > domain.maxYears) return unavailable('unsupported-age');
    var terminal = lower === domain.maxYears && upper > domain.maxYears &&
      finite(domain.terminalAnchorMaxUpperYears) && upper <= domain.terminalAnchorMaxUpperYears;
    if (upper > domain.maxYears && !terminal) return unavailable('ambiguous-age');
    var policy = data.policy;
    var cycle = key(context.cyclePhase);
    if (includes(policy.excludedCyclePhases, cycle) ||
        Array.isArray(policy.excludedCyclePrefixes) && policy.excludedCyclePrefixes.some(function (prefix) {
          return cycle.indexOf(prefix) === 0;
        })) return unavailable('incompatible-reproductive-context');
    if (!includes(policy.knownCyclePhases, cycle) && policy.unknownContextPermitted !== true) {
      return unavailable('missing-reproductive-context');
    }
    var specimen = key(context.specimen);
    if (specimen && specimen !== 'unknown' && !includes(policy.compatibleSpecimenIds, specimen)) {
      return unavailable('incompatible-specimen');
    }
    var method = key(context.assayMethodId);
    if (method && method !== 'unknown' && !includes(policy.compatibleAssayMethodIds, method)) {
      return unavailable('incompatible-assay');
    }
    var measurement = context.measurement;
    var unit = text(context.displayUnit) || measurement && text(measurement.unit) || data.canonicalUnit;
    var factor = unitFactor(data, unit);
    if (factor === null) return unavailable('unsupported-unit');
    var points = data.points;
    var start = points[0], end = points[points.length - 1];
    for (var i = 0; i < points.length; i++) {
      if (points[i].ageYears <= lower) start = points[i];
      if (points[i].ageYears >= upper) { end = points[i]; break; }
    }
    if (terminal) start = end = points[points.length - 1];
    var selected = start === end ? [start] : [start, end];
    var mode = terminal ? 'terminal-anchor' : lower === upper && start === end ? 'exact' : 'adjacent';
    return {
      status: 'ready',
      source: copy(data.source),
      dataVersion: data.dataVersion,
      canonicalUnit: data.canonicalUnit,
      points: selected.map(function (point) {
        return { ageYears: point.ageYears, canonicalValue: point.canonicalValue,
          value: point.canonicalValue / factor, unit: unit, statistic: point.statistic };
      }),
      mode: mode,
      ageLowerYears: lower,
      ageUpperYears: upper,
      ageUpperInclusive: context.ageUpperInclusive !== false,
      ageLabel: text(context.ageLabel),
      completeAgeCoverage: !terminal,
      coverageReason: terminal ? 'terminal-anchor-only' : null,
      reproductiveContextKnown: includes(policy.knownCyclePhases, cycle),
      censoredMeasurement: !!(measurement && measurement.operator != null &&
        measurement.operator !== '' && measurement.operator !== '=')
    };
  }

  return Object.freeze({ version: '1.0.0', evaluate: evaluate, parseMeasurement: parseMeasurement });
});
