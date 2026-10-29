/* Source-age P50 comparison for female total testosterone, independently of RI.
 * Source data and product policy are arguments. PCHIP and TT unit parsing use
 * the existing production modules; no new scoring formula or storage is added. */
(function (root, factory) {
  'use strict';
  var common = typeof module === 'object' && module.exports;
  var api = factory(common ? require('./vilda_hormone_lifespan_reference.js') : root && root.VildaHormoneLifespanReference,
    common ? require('./vilda_lab_testosterone.js') : root && root.VildaLabTestosterone);
  if (common) module.exports = api;
  if (root) root.VildaFemaleTTAge = api;
})(typeof window !== 'undefined' ? window : globalThis, function (reference, testosterone) {
  'use strict';

  function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
  function record(value) { return value && typeof value === 'object' && !Array.isArray(value); }
  function nonempty(value) { return typeof value === 'string' && value.trim().length > 0; }
  function normalized(value) { return typeof value === 'string' ? value.trim().toLowerCase() : value; }
  function known(value) { return value != null && value !== '' && value !== 'unknown'; }
  function positive(value) { return value === true || normalized(value) === 'yes'; }
  function list(value) { return Array.isArray(value) && value.length > 0 && value.every(nonempty); }
  function copy(value) {
    if (Array.isArray(value)) return value.map(copy);
    if (!record(value)) return value;
    var result = {};
    Object.keys(value).forEach(function (key) { result[key] = copy(value[key]); });
    return result;
  }
  function ticks(values, low, high) {
    return Array.isArray(values) && values.length >= 2 && values[0] === low && values[values.length - 1] === high &&
      values.every(function (value, index) { return finite(value) && (!index || value > values[index - 1]); });
  }
  function validData(data, policy) {
    var domain = data && data.ageDomain, source = data && data.source, p = policy && policy.plot;
    return !!(record(data) && data.kind === 'published-age-p50-data' && nonempty(data.id) && nonempty(data.version) &&
      data.analyte === 'testosterone_total' && data.sex === 'female' && data.unit === 'nmol/L' &&
      record(domain) && finite(domain.min) && finite(domain.max) && domain.min >= 0 && domain.max > domain.min &&
      domain.minimumInclusive === true && domain.maximumInclusive === true &&
      Array.isArray(data.points) && data.points.length >= 2 &&
      data.points.every(function (point, index) {
        return record(point) && finite(point.ageYears) && finite(point.value) && point.value > 0 &&
          (!index || point.ageYears > data.points[index - 1].ageYears);
      }) && data.points[0].ageYears === domain.min && data.points[data.points.length - 1].ageYears === domain.max &&
      record(source) && source.id === data.id && source.unit === data.unit &&
      source.statistic === 'model-p50' && ['label', 'citation', 'population', 'method', 'specimen', 'url', 'limitsDescription']
        .every(function (key) { return nonempty(source[key]); }) && list(source.limitations) &&
      record(policy) && policy.kind === 'educational-female-tt-age-comparison' && nonempty(policy.version) &&
      policy.sourceId === data.id && policy.analyte === data.analyte && policy.sex === data.sex &&
      policy.contextBasis === 'current-patient' && policy.clinicalReferenceActivation === false &&
      policy.patientComparisonEnabled === true && policy.notLaboratoryReference === true &&
      policy.noClinicalClassification === true && policy.noHistoryWrite === true &&
      policy.fullAgeIntervalRequired === true && policy.ordinaryOnly === true &&
      policy.interpolation === 'pchip-between-published-p50' && policy.ageReferenceBasis === 'entered-age-lower-bound' &&
      nonempty(policy.chartSelectionKey) && ['allowedViews', 'displayUnits', 'allowedAssayMethodIds', 'allowedSpecimens',
        'excludedCyclePhases', 'excludedReproductiveContexts', 'excludedPositiveFlags', 'excludedTreatmentContexts', 'allowedTreatmentContexts',
        'excludedTreatmentFlags', 'allowedMeasurementKinds'].every(function (key) { return list(policy[key]); }) &&
      policy.displayUnits.indexOf(data.unit) >= 0 && record(p) && p.ageMin === domain.min && p.ageMax === domain.max &&
      finite(p.valueMin) && finite(p.valueMax) && p.valueMin >= 0 && p.valueMax > p.valueMin &&
      p.unit === data.unit && p.independentOfPatient === true && Number.isInteger(p.sampleCount) &&
      p.sampleCount >= data.points.length && p.sampleCount <= 2000 && ticks(p.ageTicks, p.ageMin, p.ageMax) &&
      ticks(p.valueTicks, p.valueMin, p.valueMax) && data.points.every(function (point) { return point.value <= p.valueMax; }) &&
      policy.displayUnits.every(function (unit) { return finite(convert(p.valueMax, data.unit, unit)); }));
  }
  function validGroupedData(data, policy) {
    var domain = data && data.ageDomain, source = data && data.source, p = policy && policy.plot;
    return !!(record(data) && data.kind === 'published-age-group-median-data' && nonempty(data.id) && nonempty(data.version) &&
      data.analyte === 'testosterone_total' && data.sex === 'female' && data.unit === 'nmol/L' &&
      record(domain) && finite(domain.min) && finite(domain.max) && domain.min >= 0 && domain.max > domain.min &&
      domain.minimumInclusive === true && domain.maximumInclusive === false &&
      Array.isArray(data.groups) && data.groups.length >= 2 && data.groups.length <= 100 &&
      data.groups.every(function (group, index, groups) {
        return record(group) && nonempty(group.id) && nonempty(group.label) && nonempty(group.axisLabel) &&
          finite(group.minAgeYears) && finite(group.maxAgeYears) && group.maxAgeYears > group.minAgeYears &&
          group.minimumInclusive === true && group.maximumInclusive === false && finite(group.value) && group.value > 0 &&
          (!index || group.minAgeYears === groups[index - 1].maxAgeYears) &&
          !groups.slice(0, index).some(function (previous) { return previous.id === group.id; });
      }) && data.groups[0].minAgeYears === domain.min && data.groups[data.groups.length - 1].maxAgeYears === domain.max &&
      record(source) && source.id === data.id && source.unit === data.unit &&
      source.statistic === 'approximate-group-median' && source.approximate === true &&
      ['label', 'citation', 'population', 'method', 'specimen', 'url', 'limitsDescription', 'sourceLocation']
        .every(function (key) { return nonempty(source[key]); }) && list(source.limitations) &&
      record(policy) && policy.kind === 'educational-female-tt-group-comparison' && nonempty(policy.version) &&
      policy.sourceId === data.id && policy.analyte === data.analyte && policy.sex === data.sex &&
      policy.contextBasis === 'current-patient' && policy.clinicalReferenceActivation === false &&
      policy.patientComparisonEnabled === true && policy.notLaboratoryReference === true &&
      policy.noClinicalClassification === true && policy.noHistoryWrite === true &&
      policy.fullAgeIntervalRequired === true && policy.fullSourceAgeIntervalRequired === true && policy.ordinaryOnly === true &&
      policy.interpolation === 'none-discrete-age-groups' && policy.ageReferenceBasis === 'whole-age-group' &&
      policy.groupBoundaryConvention === 'lower-inclusive-upper-exclusive' && policy.requiresTannerStage === false &&
      policy.notExactAgeMedian === true && policy.notContinuousCurve === true && policy.renderMode === 'age-groups' &&
      nonempty(policy.chartSelectionKey) && ['allowedViews', 'displayUnits', 'allowedAssayMethodIds', 'allowedSpecimens',
        'excludedCyclePhases', 'excludedReproductiveContexts', 'excludedPositiveFlags', 'excludedTreatmentContexts', 'allowedTreatmentContexts',
        'excludedTreatmentFlags', 'allowedMeasurementKinds'].every(function (key) { return list(policy[key]); }) &&
      policy.displayUnits.indexOf(data.unit) >= 0 && record(p) && p.ageMin === domain.min && p.ageMax === domain.max &&
      finite(p.valueMin) && finite(p.valueMax) && p.valueMin >= 0 && p.valueMax > p.valueMin &&
      p.unit === data.unit && p.ageAxis === 'categorical-groups' && p.independentOfPatient === true &&
      ticks(p.ageTicks, p.ageMin, p.ageMax) && ticks(p.valueTicks, p.valueMin, p.valueMax) &&
      data.groups.every(function (group) { return group.value <= p.valueMax; }) &&
      policy.displayUnits.every(function (unit) { return finite(convert(p.valueMax, data.unit, unit)); }));
  }
  function unavailable(reason, visible, base) {
    return Object.assign({}, base || {}, { status: 'unavailable', visible: visible === true, reason: reason,
      median: null, ageContext: null, curve: [], knots: [],
      comparison: { status: 'unavailable', reason: reason, patientPoint: null } });
  }
  function convert(value, sourceUnit, displayUnit) {
    var result = testosterone.convertMeasurement(String(value), sourceUnit, displayUnit);
    return result && result.status === 'valid' && finite(result.value) ? result.value : null;
  }
  function invalidFlags(value, keys) {
    return keys.some(function (key) {
      return value[key] != null && [true, false, '', 'yes', 'no', 'unknown'].indexOf(normalized(value[key])) < 0;
    });
  }
  function contextExclusion(policy, context) {
    var treatment = context.treatment == null ? {} : context.treatment;
    if (!record(treatment) || invalidFlags(context, policy.excludedPositiveFlags) ||
      invalidFlags(treatment, policy.excludedTreatmentFlags)) return 'invalid-context';
    if (positive(context.contraindicated) || policy.excludedPositiveFlags.some(function (key) { return positive(context[key]); }) ||
      policy.excludedTreatmentContexts.indexOf(normalized(treatment.context)) >= 0 ||
      policy.excludedTreatmentFlags.some(function (key) { return positive(treatment[key]); }) ||
      known(normalized(context.measurementKind)) && policy.allowedMeasurementKinds.indexOf(normalized(context.measurementKind)) < 0) {
      return 'contraindicated';
    }
    if (known(normalized(treatment.context)) && policy.allowedTreatmentContexts.indexOf(normalized(treatment.context)) < 0) return 'invalid-context';
    if (policy.excludedCyclePhases.indexOf(normalized(context.cyclePhase)) >= 0 ||
      policy.excludedReproductiveContexts.indexOf(normalized(context.reproductiveContext)) >= 0) return 'incompatible-reproductive-context';
    var specimen = normalized(context.specimen), assay = normalized(context.assayMethodId);
    if (known(specimen) && policy.allowedSpecimens.indexOf(specimen) < 0) return 'incompatible-specimen';
    if (known(assay) && policy.allowedAssayMethodIds.indexOf(assay) < 0) return 'incompatible-assay';
    return null;
  }
  function measuredPoint(data, policy, context, age, displayUnit) {
    var m = context.measurement;
    if (m == null) return { status: 'unavailable', reason: 'missing-measurement', patientPoint: null };
    if (!record(m) || context.measurementValid === false ||
      m.status != null && m.status !== 'valid' || policy.displayUnits.indexOf(m.unit) < 0) {
      return { status: 'unavailable', reason: 'invalid-measurement', patientPoint: null };
    }
    var operator = m.operator == null ? '=' : m.operator;
    var raw;
    if (m.value === null && ['LOD', 'LOQ'].indexOf(m.limitKind || m.censoring) >= 0) raw = '<' + (m.limitKind || m.censoring);
    else if (finite(m.value)) raw = (operator === '=' ? '' : operator) + String(m.value);
    else return { status: 'unavailable', reason: 'invalid-measurement', patientPoint: null };
    // Do not reinterpret m.raw in m.unit: normalized measurements can retain
    // the user's raw source text while their value/unit are already canonical.
    var parsed = testosterone.parseMeasurement(raw, m.unit);
    if (!parsed || parsed.status !== 'valid') return { status: 'unavailable', reason: 'invalid-measurement', patientPoint: null };
    if (m.isExact === false || operator !== '=' || !parsed.isExact || !finite(parsed.value)) {
      return { status: 'unavailable', reason: 'non-exact-measurement', patientPoint: null };
    }
    var value = convert(parsed.value, parsed.unit, displayUnit);
    if (!finite(value)) return { status: 'unavailable', reason: 'invalid-measurement', patientPoint: null };
    return { status: 'ready', reason: null, patientPoint: { ageYears: age, value: value, unit: displayUnit,
      sourceValue: parsed.value, sourceUnit: data.unit } };
  }
  function evaluate(data, policy, context) {
    var c = context || {};
    if (!reference || typeof reference.referenceAt !== 'function' || typeof reference.sampleProfile !== 'function' ||
      !testosterone || typeof testosterone.convertMeasurement !== 'function' || typeof testosterone.parseMeasurement !== 'function') {
      return unavailable('dependency-unavailable', false);
    }
    var grouped = validGroupedData(data, policy);
    if (!grouped && !validData(data, policy)) return unavailable('source-unavailable', false);
    if (c.sourceStatus !== 'ready') return unavailable('patient-context-unavailable', false);
    if (c.analyte !== data.analyte) return unavailable('unsupported-analyte', false);
    if (c.sex !== data.sex) return unavailable('unsupported-sex', false);
    if (c.contextBasis !== policy.contextBasis || c.sampleDateISO) return unavailable('historical-context', false);
    if (c.compare !== undefined && c.compare !== false || c.view !== undefined && policy.allowedViews.indexOf(c.view) < 0) {
      return unavailable('unsupported-view', false);
    }
    if (c.selected !== undefined && (!Array.isArray(c.selected) || c.selected.indexOf(policy.chartSelectionKey) < 0)) {
      return unavailable('unselected-analyte', false);
    }
    var displayUnit = c.displayUnit == null || c.displayUnit === '' ? data.unit : c.displayUnit;
    var base = { kind: policy.kind, source: copy(data.source), policy: copy(policy), sourceVersion: data.version,
      policyVersion: policy.version, unit: displayUnit, sourceUnit: data.unit,
      clinicalReferenceActivation: false, identityKey: typeof c.identityKey === 'string' ? c.identityKey : '' };
    if (grouped) base.renderMode = 'age-groups';
    if (policy.displayUnits.indexOf(displayUnit) < 0) return unavailable('unsupported-display-unit', true, base);
    var plot = policy.plot;
    base.plot = { ageMin: plot.ageMin, ageMax: plot.ageMax, ageTicks: plot.ageTicks.slice(),
      valueMin: convert(plot.valueMin, data.unit, displayUnit), valueMax: convert(plot.valueMax, data.unit, displayUnit),
      valueTicks: plot.valueTicks.map(function (value) { return convert(value, data.unit, displayUnit); }),
      unit: displayUnit, sourceUnit: data.unit, independentOfPatient: true };
    var reason = contextExclusion(policy, c);
    if (reason) return unavailable(reason, true, base);
    if (!finite(c.ageYears) || c.ageYears < 0) return unavailable('missing-age', true, base);
    // Precision is supplied by the current form. Missing upper bounds or an
    // unknown end closure cannot silently turn reported years into a point.
    if (!finite(c.ageUpperYears) || typeof c.ageUpperInclusive !== 'boolean' || c.ageUpperYears < c.ageYears ||
      c.ageUpperYears === c.ageYears && c.ageUpperInclusive !== true) return unavailable('ambiguous-age', true, base);
    if (c.ageYears < data.ageDomain.min || c.ageUpperYears > data.ageDomain.max) {
      return unavailable('unsupported-source-age', true, base);
    }
    if (grouped) {
      if (c.ageYears >= data.ageDomain.max || c.ageUpperYears === data.ageDomain.max && c.ageUpperInclusive) {
        return unavailable('unsupported-source-age', true, base);
      }
      var groupIndex = data.groups.findIndex(function (group) {
        return c.ageYears >= group.minAgeYears && c.ageYears < group.maxAgeYears &&
          (c.ageUpperYears < group.maxAgeYears || c.ageUpperYears === group.maxAgeYears && !c.ageUpperInclusive);
      });
      if (groupIndex < 0) return unavailable('ambiguous-age-group', true, base);
      var groups = data.groups.map(function (group, index) {
        return { index: index, id: group.id, minAgeYears: group.minAgeYears, maxAgeYears: group.maxAgeYears,
          minimumInclusive: true, maximumInclusive: false, label: group.label, axisLabel: group.axisLabel,
          value: convert(group.value, data.unit, displayUnit), unit: displayUnit,
          sourceValue: group.value, sourceUnit: data.unit, approximate: true };
      });
      var selectedGroup = groups[groupIndex];
      return Object.assign({}, base, { status: 'ready', visible: true, reason: null, renderMode: 'age-groups',
        groups: groups, knots: [], curve: [],
        median: { ageYears: c.ageYears, groupIndex: groupIndex, groupId: selectedGroup.id, groupLabel: selectedGroup.label,
          minAgeYears: selectedGroup.minAgeYears, maxAgeYears: selectedGroup.maxAgeYears,
          value: selectedGroup.value, unit: displayUnit, sourceValue: selectedGroup.sourceValue,
          sourceUnit: data.unit, interpolated: false, approximate: true },
        ageContext: { lowerYears: c.ageYears, upperYears: c.ageUpperYears, upperInclusive: c.ageUpperInclusive,
          basis: policy.ageReferenceBasis },
        comparison: measuredPoint(data, policy, c, c.ageYears, displayUnit) });
    }
    var profile = { minAge: data.ageDomain.min, maxAge: data.ageDomain.max,
      interpolation: 'pchip', points: data.points.map(function (p) { return { ageYears: p.ageYears, value: p.value }; }) };
    var median = reference.referenceAt(profile, c.ageYears), curve = reference.sampleProfile(profile, plot.sampleCount);
    if (!finite(median) || !curve.length || !curve.every(function (p) { return finite(p.value) && p.value >= 0; })) {
      return unavailable('source-unavailable', false);
    }
    function displayPoint(point) {
      return { ageYears: point.ageYears, value: convert(point.value, data.unit, displayUnit),
        sourceValue: point.value, sourceUnit: data.unit, unit: displayUnit };
    }
    return Object.assign({}, base, { status: 'ready', visible: true, reason: null,
      knots: profile.points.map(function (point) { var p = displayPoint(point); p.median = p.value; return p; }),
      curve: curve.map(displayPoint),
      median: { ageYears: c.ageYears, value: convert(median, data.unit, displayUnit), unit: displayUnit,
        sourceValue: median, sourceUnit: data.unit, interpolated: !data.points.some(function (p) { return p.ageYears === c.ageYears; }) },
      ageContext: { lowerYears: c.ageYears, upperYears: c.ageUpperYears, upperInclusive: c.ageUpperInclusive,
        basis: policy.ageReferenceBasis },
      comparison: measuredPoint(data, policy, c, c.ageYears, displayUnit) });
  }
  return Object.freeze({ evaluate: evaluate });
});
