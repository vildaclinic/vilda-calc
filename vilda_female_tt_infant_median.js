/* Literal female infant TT medians from a published table. Source data and
 * product eligibility are arguments; parsing and units belong to the TT API.
 * No DOM, clock, storage, patient writes, interpolation or laboratory verdict. */
(function (root, factory) {
  'use strict';
  var common = typeof module === 'object' && module.exports;
  var api = factory(common ? require('./vilda_lab_testosterone.js') : root && root.VildaLabTestosterone);
  if (common) module.exports = api;
  if (root) root.VildaFemaleTTInfantMedian = api;
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
    var out = {}; Object.keys(value).forEach(function (key) { out[key] = copy(value[key]); }); return out;
  }
  function convert(value, from, to) {
    var result = testosterone.convertMeasurement(String(value), from, to);
    return result && result.status === 'valid' && finite(result.value) ? result.value : null;
  }
  function validDomain(domain, integer) {
    return record(domain) && finite(domain.min) && finite(domain.max) && domain.min >= 0 && domain.max > domain.min &&
      (!integer || Number.isSafeInteger(domain.min) && Number.isSafeInteger(domain.max)) &&
      domain.minimumInclusive === true && typeof domain.maximumInclusive === 'boolean';
  }
  function validData(data, policy) {
    var source = data && data.source, pop = data && data.population, plot = policy && policy.plot;
    var domain = data && data.ageDomain, app = policy && policy.applicationPostnatalDayDomain;
    return !!(record(data) && data.kind === 'published-postnatal-age-group-median-data' && nonempty(data.id) &&
      nonempty(data.version) && data.analyte === 'testosterone_total' && data.sex === 'female' && data.unit === 'nmol/L' &&
      validDomain(domain, true) && domain.maximumInclusive === true && Array.isArray(data.groups) &&
      data.groups.length > 0 && data.groups.length <= 100 && data.groups.every(function (g, i, groups) {
        return record(g) && nonempty(g.id) && nonempty(g.label) && nonempty(g.sourceAgeLabel) &&
          Number.isSafeInteger(g.minPostnatalDays) && Number.isSafeInteger(g.maxPostnatalDays) && g.minPostnatalDays >= 0 &&
          g.maxPostnatalDays >= g.minPostnatalDays && finite(g.median) && g.median > 0 &&
          g.minimumInclusive === true && g.maximumInclusive === true &&
          (!i || g.minPostnatalDays === groups[i - 1].maxPostnatalDays + 1) &&
          !groups.slice(0, i).some(function (previous) { return previous.id === g.id; });
      }) && data.groups[0].minPostnatalDays === domain.min && data.groups[data.groups.length - 1].maxPostnatalDays === domain.max &&
      record(source) && source.id === data.id && source.unit === data.unit && source.statistic === 'published-age-group-median' &&
      source.approximate === false && ['label', 'citation', 'population', 'method', 'specimen', 'url', 'sourceLocation'].every(function (key) {
        return nonempty(source[key]);
      }) && list(source.limitations) && record(data.provenance) && record(pop) &&
      Number.isSafeInteger(pop.minGestationalAgeDays) && Number.isSafeInteger(pop.maxGestationalAgeDays) &&
      pop.minGestationalAgeDays >= 0 && pop.maxGestationalAgeDays >= pop.minGestationalAgeDays &&
      record(policy) && policy.kind === 'educational-female-tt-infant-group-comparison' && nonempty(policy.version) &&
      policy.sourceId === data.id && policy.analyte === data.analyte && policy.sex === data.sex &&
      policy.contextBasis === 'current-patient' && policy.clinicalReferenceActivation === false && policy.patientComparisonEnabled === true &&
      policy.notLaboratoryReference === true && policy.noClinicalClassification === true && policy.noHistoryWrite === true &&
      policy.fullAgeIntervalRequired === true && policy.fullSourceAgeIntervalRequired === true && policy.ordinaryOnly === true &&
      policy.singleGroupRequiredForComparison === true && policy.requireKnownGestationalAge === true && policy.fullGestationalAgeIntervalRequired === true &&
      policy.requireKnownSpecimen === true && policy.requireKnownAssayMethod === true && policy.allowSourceMethodAsPatientMethod === false &&
      policy.exactPointRequiresMatchedContext === true && policy.inequalityPointAllowed === false && policy.sourceLodIsPatientLimit === false &&
      policy.requiresTannerStage === false && policy.notExactAgeMedian === true && policy.notContinuousCurve === true &&
      policy.wholeAgeAcrossGroups === 'split' && policy.interpolation === 'none-discrete-source-age-groups' &&
      policy.unknownSourceContextMode === 'source-info' && validDomain(policy.applicationAgeDomain, false) &&
      validDomain(app, true) && app.min >= domain.min && app.max <= domain.max && app.maximumInclusive === true &&
      record(policy.applicationGroupLabels) && nonempty(policy.chartSelectionKey) &&
      ['allowedViews', 'displayUnits', 'allowedAssayMethodIds', 'allowedSpecimens', 'allowedPostnatalDaySources',
        'excludedCyclePhases', 'excludedReproductiveContexts', 'excludedPositiveFlags', 'excludedTreatmentContexts',
        'allowedTreatmentContexts', 'excludedTreatmentFlags', 'allowedMeasurementKinds', 'allowedBirthSizes', 'excludedBirthSizes'].every(function (key) {
        return list(policy[key]);
      }) && policy.displayUnits.indexOf(data.unit) >= 0 && record(plot) && plot.unit === data.unit && plot.valueMin === 0 &&
      finite(plot.medianMultiplier) && plot.medianMultiplier > 1 && plot.independentOfPatient === true && plot.normalBand === false &&
      plot.zeroIsLowerReferenceLimit === false && Array.isArray(plot.tickMultipliers) && plot.tickMultipliers.length >= 2 &&
      plot.tickMultipliers[0] === 0 && plot.tickMultipliers[plot.tickMultipliers.length - 1] === plot.medianMultiplier &&
      plot.tickMultipliers.every(function (x, i, xs) { return finite(x) && (!i || x > xs[i - 1]); }) &&
      data.groups.every(function (g) { return policy.displayUnits.every(function (unit) {
        return finite(convert(g.median * plot.medianMultiplier, data.unit, unit));
      }); }));
  }
  function unavailable(reason, visible, base) {
    return Object.assign({}, base || {}, { status: 'unavailable', visible: visible === true, reason: reason,
      renderMode: 'infant-age-group-median', rows: [], median: null, ageContext: null, postnatalDays: null,
      postnatalAgeContext: null, plot: null, missingSourceFacts: [],
      comparison: { status: 'unavailable', reason: reason, measurement: null, patientPoint: null, ratio: null,
        showPoint: false, showRatio: false, overflow: false } });
  }
  function invalidFlags(value, keys) {
    return keys.some(function (key) {
      return value[key] != null && [true, false, '', 'yes', 'no', 'unknown'].indexOf(normalized(value[key])) < 0;
    });
  }
  function exclusion(data, policy, c) {
    var treatment = c.treatment == null ? {} : c.treatment;
    if (!record(treatment) || invalidFlags(c, policy.excludedPositiveFlags.concat(['preterm', 'contraindicated'])) ||
      invalidFlags(treatment, policy.excludedTreatmentFlags)) return 'invalid-context';
    var birthSize = normalized(c.birthSize);
    if (positive(c.sga) || positive(c.lga) || policy.excludedBirthSizes.indexOf(birthSize) >= 0) return 'outside-source-birth-size';
    if (known(birthSize) && policy.allowedBirthSizes.indexOf(birthSize) < 0) return 'invalid-context';
    if (positive(c.contraindicated) || policy.excludedPositiveFlags.some(function (key) { return positive(c[key]); }) ||
      policy.excludedTreatmentContexts.indexOf(normalized(treatment.context)) >= 0 ||
      policy.excludedTreatmentFlags.some(function (key) { return positive(treatment[key]); }) ||
      known(normalized(c.measurementKind)) && policy.allowedMeasurementKinds.indexOf(normalized(c.measurementKind)) < 0) return 'contraindicated';
    if (known(normalized(treatment.context)) && policy.allowedTreatmentContexts.indexOf(normalized(treatment.context)) < 0) return 'invalid-context';
    if (policy.excludedCyclePhases.indexOf(normalized(c.cyclePhase)) >= 0 ||
      policy.excludedReproductiveContexts.indexOf(normalized(c.reproductiveContext)) >= 0) return 'incompatible-reproductive-context';
    if (positive(c.preterm)) return 'prematurity';
    var ga = c.gestationalAgeDays, upper = c.gestationalAgeUpperDays;
    if (known(ga)) {
      if (!Number.isSafeInteger(ga) || ga < 0) return 'invalid-gestational-age';
      if (ga < data.population.minGestationalAgeDays || ga > data.population.maxGestationalAgeDays) return 'outside-source-gestational-age';
    }
    if (known(upper)) {
      if (!Number.isSafeInteger(upper) || upper < 0 || known(ga) && upper < ga) return 'invalid-gestational-age';
      if (upper < data.population.minGestationalAgeDays || upper > data.population.maxGestationalAgeDays) return 'outside-source-gestational-age';
    }
    if (c.gestationalAgeUpperInclusive != null && typeof c.gestationalAgeUpperInclusive !== 'boolean' ||
      known(ga) && known(upper) && ga === upper && c.gestationalAgeUpperInclusive === false) return 'invalid-gestational-age';
    var specimen = normalized(c.specimen), assay = normalized(c.assayMethodId);
    if (known(specimen) && policy.allowedSpecimens.indexOf(specimen) < 0) return 'incompatible-specimen';
    if (known(assay) && policy.allowedAssayMethodIds.indexOf(assay) < 0) return 'incompatible-assay';
    return null;
  }
  function missingFacts(c) {
    var missing = [];
    if (!known(c.gestationalAgeDays) || !known(c.gestationalAgeUpperDays) || typeof c.gestationalAgeUpperInclusive !== 'boolean') missing.push('gestational-age');
    if (!known(normalized(c.specimen))) missing.push('specimen');
    if (!known(normalized(c.assayMethodId))) missing.push('assay-method');
    return missing;
  }
  function measured(c, policy, unit) {
    var m = c.measurement, raw;
    if (m == null) return { measurement: null, reason: 'missing-measurement' };
    if (!record(m) || m.status !== 'valid' || c.measurementValid === false || policy.displayUnits.indexOf(m.unit) < 0 ||
      ['=', '<', '<=', '>', '>='].indexOf(m.operator) < 0 || m.isExact != null && typeof m.isExact !== 'boolean') {
      return { measurement: null, reason: 'invalid-measurement' };
    }
    // Raw text can retain the original unit after normalization. Reparse only
    // the supplied normalized value/unit, never stale raw or sourceValue fields.
    if (m.value === null && ['LOD', 'LOQ'].indexOf(m.limitKind) >= 0 && ['<', '<='].indexOf(m.operator) >= 0) raw = m.operator + m.limitKind;
    else if (finite(m.value)) raw = { operator: m.operator, value: m.value };
    else return { measurement: null, reason: 'invalid-measurement' };
    var parsed = testosterone.parseMeasurement(raw, m.unit);
    if (!parsed || parsed.status !== 'valid' || typeof m.isExact === 'boolean' && m.isExact !== parsed.isExact) {
      return { measurement: null, reason: 'invalid-measurement' };
    }
    var value = parsed.value === null ? null : convert(parsed.value, parsed.unit, unit);
    if (parsed.value !== null && !finite(value)) return { measurement: null, reason: 'invalid-measurement' };
    return { reason: null, measurement: { operator: parsed.operator, sourceValue: parsed.value, sourceUnit: parsed.unit,
      value: value, unit: unit, limitKind: parsed.limitKind, isExact: parsed.isExact } };
  }
  function relation(a, b) {
    if (a === b || Math.abs(a - b) <= 8 * Number.EPSILON * Math.max(Math.abs(a), Math.abs(b))) return 0;
    return a < b ? -1 : 1;
  }
  function comparison(measurement, median, plot) {
    var m = measurement.measurement;
    var out = { status: 'indeterminate', reason: measurement.reason, measurement: m, patientPoint: null,
      ratio: null, showPoint: false, showRatio: false, overflow: false };
    if (!m) return out;
    if (!m.isExact || m.sourceValue === null) { out.reason = 'non-exact-measurement'; return out; }
    var ratio = relation(m.sourceValue, median.sourceMedian) === 0 ? 1 : m.sourceValue / median.sourceMedian;
    return Object.assign(out, { status: 'ready', reason: null, patientPoint: { value: m.value, unit: m.unit,
      sourceValue: m.sourceValue, sourceUnit: m.sourceUnit }, ratio: finite(ratio) ? ratio : null, showPoint: true, showRatio: finite(ratio),
      overflow: relation(m.value, plot.valueMax) > 0 || relation(m.value, plot.valueMin) < 0 });
  }
  function evaluate(data, policy, context) {
    if (!testosterone || typeof testosterone.parseMeasurement !== 'function' || typeof testosterone.convertMeasurement !== 'function') return unavailable('dependency-unavailable', false);
    if (!validData(data, policy)) return unavailable('source-unavailable', false);
    var c = record(context) ? context : {};
    if (c.sourceStatus !== 'ready') return unavailable('patient-context-unavailable', false);
    if (c.analyte !== data.analyte) return unavailable('unsupported-analyte', false);
    if (c.sex !== data.sex) return unavailable('unsupported-sex', false);
    if (c.contextBasis !== policy.contextBasis || c.sampleDateISO) return unavailable('historical-context', false);
    if (typeof c.identityKey !== 'string' || typeof c.currentIdentityKey !== 'string' || c.identityKey !== c.currentIdentityKey) return unavailable('patient-identity-unavailable', false);
    if (c.compare !== undefined && c.compare !== false || c.view !== undefined && policy.allowedViews.indexOf(c.view) < 0) return unavailable('unsupported-view', false);
    if (c.selected !== undefined && (!Array.isArray(c.selected) || c.selected.indexOf(policy.chartSelectionKey) < 0)) return unavailable('unselected-analyte', false);
    var unit = c.displayUnit == null || c.displayUnit === '' ? data.unit : c.displayUnit;
    var base = { kind: policy.kind, source: copy(data.source), provenance: copy(data.provenance), policy: copy(policy),
      sourceVersion: data.version, policyVersion: policy.version, unit: unit, sourceUnit: data.unit,
      clinicalReferenceActivation: false, identityKey: c.identityKey, renderMode: 'infant-age-group-median' };
    if (policy.displayUnits.indexOf(unit) < 0) return unavailable('unsupported-display-unit', true, base);
    var reason = exclusion(data, policy, c);
    if (reason) return unavailable(reason, true, base);
    if (!finite(c.ageYears) || c.ageYears < 0) return unavailable('missing-age', true, base);
    if (!finite(c.ageUpperYears) || typeof c.ageUpperInclusive !== 'boolean' || c.ageUpperYears < c.ageYears ||
      c.ageUpperYears === c.ageYears && c.ageUpperInclusive !== true) return unavailable('ambiguous-age', true, base);
    var calendar = policy.applicationAgeDomain;
    if (c.ageYears < calendar.min || c.ageYears > calendar.max || c.ageUpperYears > calendar.max ||
      c.ageYears === calendar.max && !calendar.maximumInclusive || c.ageUpperYears === calendar.max && c.ageUpperInclusive && !calendar.maximumInclusive) {
      return unavailable('unsupported-calendar-age', false, base);
    }
    var pna = c.postnatalDays;
    if (!record(pna) || !Number.isSafeInteger(pna.lower) || !Number.isSafeInteger(pna.upper) || pna.lower < 0 || pna.upper < pna.lower ||
      policy.allowedPostnatalDaySources.indexOf(pna.source) < 0) return unavailable('missing-postnatal-age', true, base);
    var dayDomain = policy.applicationPostnatalDayDomain;
    if (pna.lower < dayDomain.min || pna.upper > dayDomain.max) return unavailable('unsupported-postnatal-age', true, base);
    var groups = data.groups.filter(function (g) { return g.minPostnatalDays <= pna.upper && g.maxPostnatalDays >= pna.lower; });
    var selected = groups.find(function (g) { return g.minPostnatalDays <= pna.lower && g.maxPostnatalDays >= pna.upper; });
    var rows = groups.map(function (g) {
      return { id: g.id, label: policy.applicationGroupLabels[g.id] || g.label, sourceAgeLabel: g.sourceAgeLabel,
        minPostnatalDays: g.minPostnatalDays, maxPostnatalDays: g.maxPostnatalDays, minimumInclusive: true, maximumInclusive: true,
        sourceMedian: g.median, sourceValue: g.median, sourceUnit: data.unit, value: convert(g.median, data.unit, unit),
        unit: unit, individualGroupN: null, sourceN: null, approximate: false, interpolated: false };
    });
    if (!rows.length) return unavailable('unsupported-postnatal-age', true, base);
    var missing = missingFacts(c), measurement = measured(c, policy, unit);
    var median = selected ? rows.find(function (row) { return row.id === selected.id; }) : null;
    var status = !selected ? 'split' : missing.length ? 'source-info' : 'ready';
    var plot = status !== 'ready' ? null : { valueMin: convert(policy.plot.valueMin, data.unit, unit),
      valueMax: convert(selected.median * policy.plot.medianMultiplier, data.unit, unit),
      valueTicks: policy.plot.tickMultipliers.map(function (x) { return convert(selected.median * x, data.unit, unit); }),
      unit: unit, sourceUnit: data.unit, independentOfPatient: true, normalBand: false, zeroIsLowerReferenceLimit: false };
    var compared = status === 'ready' ? comparison(measurement, median, plot) : { status: status === 'split' ? 'indeterminate' : 'source-info',
      reason: status === 'split' ? 'ambiguous-age-group' : 'source-context-incomplete', measurement: measurement.measurement,
      patientPoint: null, ratio: null, showPoint: false, showRatio: false, overflow: false };
    return Object.assign({}, base, { status: status, visible: true, reason: status === 'split' ? 'ambiguous-age-group' : missing.length ? 'source-context-incomplete' : null,
      rows: rows, median: median, missingSourceFacts: missing,
      ageContext: { lowerYears: c.ageYears, upperYears: c.ageUpperYears, upperInclusive: c.ageUpperInclusive, basis: 'whole-chronological-age-interval' },
      postnatalDays: copy(pna), postnatalAgeContext: { lower: pna.lower, upper: pna.upper, source: pna.source, basis: 'whole-postnatal-age-interval' },
      plot: plot, comparison: compared });
  }
  return Object.freeze({ evaluate: evaluate });
});
