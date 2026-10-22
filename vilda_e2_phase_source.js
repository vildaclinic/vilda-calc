/* Published phase-group information, separate from age profiles and laboratory RI.
 * The supplied data own source values and eligibility. No patient concentration,
 * comparison, interpretation, persistence or plotting geometry is returned. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VildaE2PhaseSource = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
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
  function nonempty(value) { return typeof value === 'string' && value.trim().length > 0; }
  function stringList(value) { return Array.isArray(value) && value.length > 0 && value.every(nonempty); }
  function known(value) { return value != null && value !== '' && value !== 'unknown'; }
  function normalized(value) { return typeof value === 'string' ? value.trim().toLowerCase() : value; }
  function positive(value) { return value === true || value === 'yes'; }
  function validData(data) {
    var domain = data && data.ageDomain, source = data && data.source, policy = data && data.policy;
    var phases = data && data.phases;
    return !!(data && nonempty(data.version) && data.kind === 'published-phase-group-information' &&
      nonempty(data.analyte) && nonempty(data.sex) && domain &&
      finite(domain.minYears) && finite(domain.maxYears) && domain.minYears >= 0 && domain.maxYears > domain.minYears &&
      phases && typeof phases === 'object' && !Array.isArray(phases) && Object.keys(phases).length > 0 &&
      Object.keys(phases).every(function (id) {
        var phase = phases[id], median = phase && phase.median;
        return phase && phase.id === id && nonempty(phase.label) && nonempty(phase.definition) &&
          Number.isInteger(phase.participants) && phase.participants > 0 && median &&
          finite(median.value) && median.value >= 0 && median.unit === 'pmol/L' &&
          finite(median.approxPgMl) && median.approxPgMl >= 0;
      }) && source && nonempty(source.id) && nonempty(source.citation) && nonempty(source.population) &&
      nonempty(source.statistic) && policy && policy.notClinicalReference === true &&
      policy.noPatientComparison === true && policy.fullAgeIntervalRequired === true &&
      policy.ordinaryOnly === true && policy.knownPhaseRequired === true &&
      ['measurementUnits', 'allowedAssayMethodIds', 'allowedSpecimens', 'excludedCyclePhases',
        'excludedPositiveFlags', 'excludedTreatmentContexts', 'excludedTreatmentFlags', 'allowedMeasurementKinds']
        .every(function (key) { return stringList(policy[key]); }));
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
    if (c.selected !== undefined && (!Array.isArray(c.selected) || c.selected.indexOf('e2') < 0)) {
      return unavailable('unselected-analyte');
    }
    if (c.sampleDateISO || [undefined, null, '', 'current-patient'].indexOf(c.contextBasis) < 0) {
      return unavailable('historical-context');
    }
    var policy = data.policy, treatment = c.treatment || {};
    if (c.contraindicated === true || policy.excludedPositiveFlags.some(function (key) { return positive(c[key]); }) ||
        policy.excludedTreatmentContexts.indexOf(treatment.context) >= 0 ||
        policy.excludedTreatmentFlags.some(function (key) { return positive(treatment[key]); }) ||
        known(c.measurementKind) && policy.allowedMeasurementKinds.indexOf(c.measurementKind) < 0) {
      return unavailable('contraindicated');
    }
    var phaseId = normalized(c.cyclePhase);
    if (policy.excludedCyclePhases.indexOf(phaseId) >= 0) return unavailable('incompatible-reproductive-context');
    if (!known(phaseId)) return unavailable('unknown-cycle-phase');
    if (typeof phaseId !== 'string' || !Object.prototype.hasOwnProperty.call(data.phases, phaseId)) {
      return unavailable('unsupported-cycle-phase');
    }
    if (!finite(c.ageYears) || c.ageYears < 0) return unavailable('missing-age');
    var upper = c.ageUpperYears == null ? c.ageYears : c.ageUpperYears;
    if (!finite(upper) || upper < c.ageYears) return unavailable('ambiguous-age');
    if (c.ageYears < data.ageDomain.minYears || c.ageYears > data.ageDomain.maxYears) return unavailable('unsupported-age');
    if (upper > data.ageDomain.maxYears) return unavailable('ambiguous-age');
    var specimen = normalized(c.specimen);
    if (known(specimen) && policy.allowedSpecimens.indexOf(specimen) < 0) return unavailable('incompatible-specimen');
    var assay = normalized(c.assayMethodId);
    if (known(assay) && policy.allowedAssayMethodIds.indexOf(assay) < 0) return unavailable('incompatible-assay');
    if (!usableMeasurement(data, c.measurement)) return unavailable('invalid-measurement');
    var phase = copy(data.phases[phaseId]), median = phase.median;
    delete phase.median;
    return { status: 'ready', version: data.version, source: copy(data.source), phase: phase,
      median: median, ageDomain: copy(data.ageDomain), policy: copy(policy) };
  }
  return { evaluate: evaluate };
});
