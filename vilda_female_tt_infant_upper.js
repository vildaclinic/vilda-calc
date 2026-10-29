/* Female infant TT: a source upper percentile, never a median or full RI.
 * Clinical values, age/population eligibility and presentation scales are
 * versioned arguments. Measurement parsing/conversion remains the TT API's.
 * This module has no DOM, clock, storage, network or history effects. */
(function (root, factory) {
  'use strict';
  var common = typeof module === 'object' && module.exports;
  var api = factory(common ? require('./vilda_lab_testosterone.js') : root && root.VildaLabTestosterone);
  if (common) module.exports = api;
  if (root) root.VildaFemaleTTInfantUpper = api;
})(typeof window !== 'undefined' ? window : globalThis, function (testosterone) {
  'use strict';

  function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
  function record(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function nonempty(value) { return typeof value === 'string' && value.trim().length > 0; }
  function list(value) { return Array.isArray(value) && value.length > 0 && value.every(nonempty); }
  function normalized(value) { return typeof value === 'string' ? value.trim().toLowerCase() : value; }
  function known(value) { return value != null && value !== '' && normalized(value) !== 'unknown'; }
  function positive(value) { return value === true || normalized(value) === 'yes'; }
  function copy(value) {
    if (Array.isArray(value)) return value.map(copy);
    if (!record(value)) return value;
    var result = {};
    Object.keys(value).forEach(function (key) { result[key] = copy(value[key]); });
    return result;
  }
  function convert(value, sourceUnit, displayUnit) {
    var result = testosterone.convertMeasurement(String(value), sourceUnit, displayUnit);
    return result && result.status === 'valid' && finite(result.value) ? result.value : null;
  }
  function validDomain(domain) {
    return record(domain) && finite(domain.min) && finite(domain.max) && domain.min >= 0 && domain.max > domain.min &&
      domain.minimumInclusive === true && typeof domain.maximumInclusive === 'boolean';
  }
  function validData(data, policy) {
    var domain = data && data.ageDomain, source = data && data.source, population = data && data.population;
    var application = policy && policy.applicationAgeDomain, plot = policy && policy.plot;
    return !!(record(data) && data.kind === 'published-age-group-upper-percentile-data' && nonempty(data.id) &&
      nonempty(data.version) && data.analyte === 'testosterone_total' && data.sex === 'female' && data.unit === 'nmol/L' &&
      validDomain(domain) && Array.isArray(data.groups) && data.groups.length >= 2 && data.groups.length <= 100 &&
      data.groups.every(function (group, index, groups) {
        return record(group) && nonempty(group.id) && nonempty(group.label) && nonempty(group.sourceAgeLabel) &&
          finite(group.minAgeYears) && finite(group.maxAgeYears) && group.maxAgeYears > group.minAgeYears &&
          group.minimumInclusive === true && typeof group.maximumInclusive === 'boolean' &&
          finite(group.upper) && group.upper > 0 && Number.isInteger(group.individualGroupN) && group.individualGroupN > 0 &&
          (!index || group.minAgeYears === groups[index - 1].maxAgeYears && groups[index - 1].maximumInclusive === false) &&
          !groups.slice(0, index).some(function (previous) { return previous.id === group.id; });
      }) && data.groups[0].minAgeYears === domain.min &&
      data.groups[data.groups.length - 1].maxAgeYears === domain.max &&
      data.groups[data.groups.length - 1].maximumInclusive === domain.maximumInclusive &&
      record(source) && source.id === data.id && source.unit === data.unit && source.statistic === 'published-upper-p97.5' &&
      ['label', 'citation', 'population', 'method', 'specimen', 'url', 'sourceLocation'].every(function (key) {
        return nonempty(source[key]);
      }) && list(source.limitations) && source.median === null && source.lowerLimit === null &&
      record(source.limits) && source.limits.patientImputationAllowed === false && record(data.provenance) && record(population) &&
      Number.isInteger(population.minGestationalAgeDays) && Number.isInteger(population.maxGestationalAgeDays) &&
      population.minGestationalAgeDays >= 0 && population.maxGestationalAgeDays >= population.minGestationalAgeDays &&
      record(policy) && policy.kind === 'source-upper-female-tt-infant-comparison' && nonempty(policy.version) &&
      policy.sourceId === data.id && policy.analyte === data.analyte && policy.sex === data.sex &&
      policy.contextBasis === 'current-patient' && policy.clinicalReferenceActivation === false &&
      policy.patientComparisonEnabled === true && policy.upperOnly === true && policy.noMedian === true &&
      policy.noLowerLimit === true && policy.noHistoryWrite === true && policy.notLaboratoryReference === true &&
      policy.noClinicalClassification === true && policy.fullAgeIntervalRequired === true &&
      policy.fullSourceAgeIntervalRequired === true && policy.ordinaryOnly === true &&
      policy.singleGroupRequiredForComparison === true && policy.requireKnownGestationalAge === true &&
      policy.requireKnownSpecimen === true && policy.requireKnownAssayMethod === true && policy.allowSourceMethodAsPatientMethod === false &&
      policy.exactPointRequiresMatchedContext === true && policy.inequalityPointAllowed === false &&
      policy.numericPatientLimitRequired === true && policy.sourceLodIsPatientLimit === false &&
      policy.ageReferenceBasis === 'whole-chronological-age-interval' &&
      policy.unknownSourceContextMode === 'source-info' && policy.wholeAgeAcrossGroups === 'split' &&
      validDomain(application) && application.min >= domain.min && application.max <= domain.max &&
      !(application.max === domain.max && application.maximumInclusive && !domain.maximumInclusive) &&
      nonempty(policy.chartSelectionKey) && ['allowedViews', 'displayUnits', 'allowedAssayMethodIds', 'allowedSpecimens',
        'excludedCyclePhases', 'excludedReproductiveContexts', 'excludedPositiveFlags', 'excludedTreatmentContexts',
        'allowedTreatmentContexts', 'excludedTreatmentFlags', 'allowedMeasurementKinds'].every(function (key) { return list(policy[key]); }) &&
      policy.displayUnits.indexOf(data.unit) >= 0 && record(plot) && plot.unit === data.unit &&
      finite(plot.valueMin) && finite(plot.valueMax) && plot.valueMin >= 0 && plot.valueMax > plot.valueMin &&
      plot.independentOfPatient === true && plot.normalBand === false && plot.zeroIsLowerReferenceLimit === false &&
      Array.isArray(plot.valueTicks) && plot.valueTicks.length >= 2 &&
      plot.valueTicks[0] === plot.valueMin && plot.valueTicks[plot.valueTicks.length - 1] === plot.valueMax &&
      plot.valueTicks.every(function (value, index, values) { return finite(value) && (!index || value > values[index - 1]); }) &&
      data.groups.every(function (group) { return group.upper >= plot.valueMin && group.upper <= plot.valueMax; }) &&
      policy.displayUnits.every(function (unit) { return finite(convert(plot.valueMax, data.unit, unit)); }));
  }
  function unavailable(reason, visible, base) {
    return Object.assign({}, base || {}, { status: 'unavailable', visible: visible === true, reason: reason,
      renderMode: 'upper-reference', median: null, lowerLimit: null, rows: [], upper: null, ageContext: null,
      plot: null, comparison: { status: 'unavailable', reason: reason, measurement: null, patientPoint: null } });
  }
  function invalidFlags(value, keys) {
    return keys.some(function (key) {
      return value[key] != null && [true, false, '', 'yes', 'no', 'unknown'].indexOf(normalized(value[key])) < 0;
    });
  }
  function contextExclusion(data, policy, context) {
    var treatment = context.treatment == null ? {} : context.treatment;
    if (!record(treatment) || invalidFlags(context, policy.excludedPositiveFlags.concat(['preterm', 'contraindicated'])) ||
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
    if (positive(context.preterm)) return 'prematurity';
    var ga = context.gestationalAgeDays, gaUpper = context.gestationalAgeUpperDays;
    if (known(ga)) {
      if (!Number.isInteger(ga) || ga < 0) return 'invalid-gestational-age';
      if (ga < data.population.minGestationalAgeDays || ga > data.population.maxGestationalAgeDays) return 'outside-source-gestational-age';
    }
    if (known(gaUpper)) {
      if (!Number.isInteger(gaUpper) || gaUpper < 0 || known(ga) && gaUpper < ga) return 'invalid-gestational-age';
      if (gaUpper < data.population.minGestationalAgeDays || gaUpper > data.population.maxGestationalAgeDays) return 'outside-source-gestational-age';
    }
    if (context.gestationalAgeUpperInclusive != null && typeof context.gestationalAgeUpperInclusive !== 'boolean' ||
      known(ga) && known(gaUpper) && ga === gaUpper && context.gestationalAgeUpperInclusive === false) {
      return 'invalid-gestational-age';
    }
    var specimen = normalized(context.specimen), assay = normalized(context.assayMethodId);
    if (known(specimen) && policy.allowedSpecimens.indexOf(specimen) < 0) return 'incompatible-specimen';
    if (known(assay) && policy.allowedAssayMethodIds.indexOf(assay) < 0) return 'incompatible-assay';
    return null;
  }
  function sourceFactsMissing(context) {
    var missing = [];
    if (!known(context.gestationalAgeDays) || !known(context.gestationalAgeUpperDays) ||
      typeof context.gestationalAgeUpperInclusive !== 'boolean') missing.push('gestational-age');
    if (!known(normalized(context.specimen))) missing.push('specimen');
    if (!known(normalized(context.assayMethodId))) missing.push('assay-method');
    return missing;
  }
  function normalizedMeasurement(context, policy, displayUnit) {
    var m = context.measurement, raw;
    if (m == null) return { measurement: null, reason: 'missing-measurement' };
    if (!record(m) || m.status !== 'valid' || context.measurementValid === false || policy.displayUnits.indexOf(m.unit) < 0 ||
      ['=', '<', '<=', '>', '>='].indexOf(m.operator) < 0) return { measurement: null, reason: 'invalid-measurement' };
    // m.raw may still be the user's original text in another unit. Rebuild
    // from its normalized value/unit; never reinterpret the stale raw text.
    if (m.value === null && ['LOD', 'LOQ'].indexOf(m.limitKind) >= 0 && ['<', '<='].indexOf(m.operator) >= 0) {
      raw = m.operator + m.limitKind;
    } else if (finite(m.value)) raw = { operator: m.operator, value: m.value };
    else return { measurement: null, reason: 'invalid-measurement' };
    var parsed = testosterone.parseMeasurement(raw, m.unit);
    if (!parsed || parsed.status !== 'valid' || typeof m.isExact === 'boolean' && m.isExact !== parsed.isExact) {
      return { measurement: null, reason: 'invalid-measurement' };
    }
    var value = parsed.value === null ? null : convert(parsed.value, parsed.unit, displayUnit);
    if (parsed.value !== null && !finite(value)) return { measurement: null, reason: 'invalid-measurement' };
    // parseMeasurement.value/unit are canonical. Its sourceValue/sourceUnit
    // instead name the original input and must not be used for this comparison.
    return { reason: null, measurement: { operator: parsed.operator, sourceValue: parsed.value,
      sourceUnit: parsed.unit, value: value,
      unit: displayUnit, limitKind: parsed.limitKind, isExact: parsed.isExact } };
  }
  function quantityRelation(a, b) {
    // Match the existing TT engine's quantity-only roundoff protection. The
    // canonical source data, patient value and all age boundaries stay intact.
    if (a === b || Math.abs(a - b) <= 8 * Number.EPSILON * Math.max(Math.abs(a), Math.abs(b))) return 0;
    return a < b ? -1 : 1;
  }
  function compare(measured, upper) {
    var m = measured.measurement;
    if (!m) return { status: 'indeterminate', reason: measured.reason, measurement: null, patientPoint: null };
    var status = 'indeterminate', reason = m.sourceValue === null ? 'unquantified-detection-limit' : 'bound-crosses-upper';
    if (m.sourceValue !== null) {
      var relation = quantityRelation(m.sourceValue, upper.sourceUpper);
      if (m.operator === '=') status = relation > 0 ? 'above-upper' : 'not-above-upper';
      else if (['<', '<='].indexOf(m.operator) >= 0 && relation <= 0) status = 'not-above-upper';
      else if (m.operator === '>' && relation >= 0 || m.operator === '>=' && relation > 0) status = 'above-upper';
    }
    if (status !== 'indeterminate') reason = null;
    return { status: status, reason: reason, measurement: m, patientPoint: m.isExact && m.sourceValue !== null ? {
      value: m.value, unit: m.unit, sourceValue: m.sourceValue, sourceUnit: m.sourceUnit
    } : null };
  }
  function contains(group, lower, upper, upperInclusive) {
    return lower >= group.minAgeYears && (lower < group.maxAgeYears || lower === group.maxAgeYears && group.maximumInclusive) &&
      (upper < group.maxAgeYears || upper === group.maxAgeYears && (!upperInclusive || group.maximumInclusive));
  }
  function intersects(group, lower, upper, upperInclusive) {
    return !(group.minAgeYears > upper || group.minAgeYears === upper && !upperInclusive ||
      group.maxAgeYears < lower || group.maxAgeYears === lower && !group.maximumInclusive);
  }
  function evaluate(data, policy, context) {
    if (!testosterone || typeof testosterone.convertMeasurement !== 'function' || typeof testosterone.parseMeasurement !== 'function') {
      return unavailable('dependency-unavailable', false);
    }
    if (!validData(data, policy)) return unavailable('source-unavailable', false);
    var c = record(context) ? context : {};
    if (c.sourceStatus !== 'ready') return unavailable('patient-context-unavailable', false);
    if (c.analyte !== data.analyte) return unavailable('unsupported-analyte', false);
    if (c.sex !== data.sex) return unavailable('unsupported-sex', false);
    if (c.contextBasis !== policy.contextBasis || c.sampleDateISO) return unavailable('historical-context', false);
    // Explicit equal empty keys represent the application's ready anonymous
    // form. Missing keys and a stale named-patient key remain ineligible.
    if (typeof c.identityKey !== 'string' || typeof c.currentIdentityKey !== 'string' || c.identityKey !== c.currentIdentityKey) {
      return unavailable('patient-identity-unavailable', false);
    }
    if (c.compare !== undefined && c.compare !== false || c.view !== undefined && policy.allowedViews.indexOf(c.view) < 0) {
      return unavailable('unsupported-view', false);
    }
    if (c.selected !== undefined && (!Array.isArray(c.selected) || c.selected.indexOf(policy.chartSelectionKey) < 0)) {
      return unavailable('unselected-analyte', false);
    }
    var displayUnit = c.displayUnit == null || c.displayUnit === '' ? data.unit : c.displayUnit;
    var base = { kind: policy.kind, source: copy(data.source), provenance: copy(data.provenance), policy: copy(policy),
      sourceVersion: data.version, policyVersion: policy.version, unit: displayUnit, sourceUnit: data.unit,
      clinicalReferenceActivation: false, identityKey: c.identityKey, renderMode: 'upper-reference', median: null, lowerLimit: null };
    if (policy.displayUnits.indexOf(displayUnit) < 0) return unavailable('unsupported-display-unit', true, base);
    var reason = contextExclusion(data, policy, c);
    if (reason) return unavailable(reason, true, base);
    if (!finite(c.ageYears) || c.ageYears < 0) return unavailable('missing-age', true, base);
    if (!finite(c.ageUpperYears) || typeof c.ageUpperInclusive !== 'boolean' || c.ageUpperYears < c.ageYears ||
      c.ageUpperYears === c.ageYears && c.ageUpperInclusive !== true) return unavailable('ambiguous-age', true, base);
    var domain = policy.applicationAgeDomain;
    if (c.ageYears < domain.min || c.ageYears > domain.max || c.ageUpperYears > domain.max ||
      c.ageUpperYears === domain.max && c.ageUpperInclusive && !domain.maximumInclusive ||
      c.ageYears === domain.max && !domain.maximumInclusive) return unavailable('unsupported-source-age', true, base);
    var groups = data.groups.filter(function (group) { return intersects(group, c.ageYears, c.ageUpperYears, c.ageUpperInclusive); });
    var selected = groups.find(function (group) { return contains(group, c.ageYears, c.ageUpperYears, c.ageUpperInclusive); });
    var rows = groups.map(function (group) {
      return { id: group.id, label: group.label, sourceAgeLabel: group.sourceAgeLabel, individualGroupN: group.individualGroupN,
        minAgeYears: group.minAgeYears, maxAgeYears: group.maxAgeYears, minimumInclusive: group.minimumInclusive,
        maximumInclusive: group.maximumInclusive, sourceUpper: group.upper, sourceValue: group.upper, sourceUnit: data.unit,
        value: convert(group.upper, data.unit, displayUnit), unit: displayUnit, lowerLimit: null, median: null };
    });
    if (!rows.length) return unavailable('unsupported-source-age', true, base);
    var missing = sourceFactsMissing(c), measured = normalizedMeasurement(c, policy, displayUnit);
    var upper = selected ? rows.find(function (row) { return row.id === selected.id; }) : null;
    var status = !selected ? 'split' : missing.length ? 'source-info' : 'ready';
    var comparison = !selected ? { status: 'indeterminate', reason: 'ambiguous-age-group', measurement: measured.measurement, patientPoint: null } :
      missing.length ? { status: 'source-info', reason: 'source-context-incomplete', measurement: measured.measurement, patientPoint: null } : compare(measured, upper);
    return Object.assign({}, base, { status: status, visible: true, reason: !selected ? 'ambiguous-age-group' : missing.length ? 'source-context-incomplete' : null,
      rows: rows, upper: upper, missingSourceFacts: missing,
      ageContext: { lowerYears: c.ageYears, upperYears: c.ageUpperYears, upperInclusive: c.ageUpperInclusive, basis: policy.ageReferenceBasis },
      plot: { valueMin: convert(policy.plot.valueMin, data.unit, displayUnit), valueMax: convert(policy.plot.valueMax, data.unit, displayUnit),
        valueTicks: policy.plot.valueTicks.map(function (value) { return convert(value, data.unit, displayUnit); }),
        unit: displayUnit, sourceUnit: data.unit, independentOfPatient: true },
      comparison: comparison });
  }
  return Object.freeze({ evaluate: evaluate });
});
