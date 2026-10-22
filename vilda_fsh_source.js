/* Manufacturer FSH group information, separate from patient age references and RI.
 * Source facts and presentation eligibility are supplied as data. No concentration
 * comparison, diagnostic decision, history, persistence or plot position is made. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VildaFshSource = api;
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
  function validData(data) {
    var source = data && data.source, policy = data && data.policy, placement = data && data.placement;
    var groups = data && data.groups;
    return !!(data && nonempty(data.version) && data.kind === 'manufacturer-group-information' &&
      nonempty(data.analyte) && nonempty(data.sex) && data.ageDomain === null &&
      placement && placement.kind === 'application-adult-placement' &&
      finite(placement.minimumAgeYearsExclusive) && placement.minimumAgeYearsExclusive >= 0 &&
      nonempty(placement.description) && groups && typeof groups === 'object' && !Array.isArray(groups) &&
      Object.keys(groups).length > 0 && Object.keys(groups).every(function (id) {
        var group = groups[id], median = group && group.median;
        return group && group.id === id && nonempty(group.label) && nonempty(group.definition) &&
          Number.isInteger(group.printedN) && group.printedN > 0 && median &&
          finite(median.value) && median.value >= 0 && median.unit === 'IU/L';
      }) && source && source.ageDomain === null &&
      ['id', 'label', 'citation', 'population', 'statistic', 'method', 'phaseDefinition', 'limitsDescription', 'url']
        .every(function (key) { return nonempty(source[key]); }) && stringList(source.limitations) &&
      policy && policy.notClinicalReference === true && policy.noPatientComparison === true &&
      policy.placementOnly === true && policy.fullAgeIntervalRequired === true &&
      policy.ordinaryOnly === true && policy.knownGroupRequired === true && nonempty(policy.chartSelectionKey) &&
      ['measurementUnits', 'allowedAssayMethodIds', 'allowedSpecimens', 'excludedCyclePhases',
        'excludedPositiveFlags', 'excludedTreatmentContexts', 'excludedTreatmentFlags', 'allowedMeasurementKinds']
        .every(function (key) { return stringList(policy[key]); }));
  }
  function usableMeasurement(data, context) {
    if (context.measurementValid === false) return false;
    var measurement = context.measurement;
    // The adapter may supply its existing parser's verdict without duplicating
    // a measurement. A supplied malformed measurement never uses this fallback.
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
    var groupId = normalized(c.cyclePhase);
    if (policy.excludedCyclePhases.indexOf(groupId) >= 0) return unavailable('incompatible-reproductive-context');
    if (!known(groupId)) return unavailable('unknown-cycle-phase');
    if (typeof groupId !== 'string' || !Object.prototype.hasOwnProperty.call(data.groups, groupId)) {
      return unavailable('unsupported-cycle-phase');
    }
    if (!finite(c.ageYears) || c.ageYears < 0) return unavailable('missing-age');
    var upper = c.ageUpperYears == null ? c.ageYears : c.ageUpperYears;
    if (!finite(upper) || upper < c.ageYears) return unavailable('ambiguous-age');
    // This is an application placement boundary. Source ages remain unknown;
    // passing it never asserts that this patient matches the reference cohort.
    if (c.ageYears <= data.placement.minimumAgeYearsExclusive) return unavailable('unsupported-placement-age');
    var specimen = normalized(c.specimen);
    if (known(specimen) && policy.allowedSpecimens.indexOf(specimen) < 0) return unavailable('incompatible-specimen');
    var assay = normalized(c.assayMethodId);
    if (known(assay) && policy.allowedAssayMethodIds.indexOf(assay) < 0) return unavailable('incompatible-assay');
    if (!usableMeasurement(data, c)) return unavailable('invalid-measurement');
    var group = copy(data.groups[groupId]), median = group.median;
    delete group.median;
    return { status: 'ready', version: data.version, source: copy(data.source), group: group,
      median: median, ageDomain: null, placement: copy(data.placement), policy: copy(policy) };
  }
  return Object.freeze({ evaluate: evaluate });
});
