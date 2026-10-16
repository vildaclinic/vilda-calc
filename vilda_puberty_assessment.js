/*
 * P-POKWITANIE-KONTRAKT: typed observations, without DOM, storage or interpretation.
 * This reader never migrates the stored payload. Persistence keeps the original
 * JSON, including unsupported future schemas. See docs/PUBERTY_ASSESSMENT.md.
 */
(function (global) {
  'use strict';

  function object(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function owns(value, key) {
    return object(value) && Object.prototype.hasOwnProperty.call(value, key);
  }

  function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function stage(value) {
    return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5;
  }

  // An examination date is a calendar date, not the autosave timestamp.
  function date(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    var parsed = new Date(value + 'T00:00:00.000Z');
    return Number.isFinite(parsed.getTime()) &&
      parsed.getUTCFullYear() === Number(value.slice(0, 4)) &&
      parsed.getUTCMonth() + 1 === Number(value.slice(5, 7)) &&
      parsed.getUTCDate() === Number(value.slice(8, 10));
  }

  function observation(value) {
    if (!object(value) || !stage(value.stage)) return null;
    if (value.observedAtISO != null && !date(value.observedAtISO)) return null;
    if (value.ageMonths != null && (typeof value.ageMonths !== 'number' ||
        !Number.isFinite(value.ageMonths) || value.ageMonths < 0)) return null;
    if (value.source != null && (typeof value.source !== 'string' || !value.source.trim())) return null;
    if (owns(value, 'sex') && value.sex !== null && value.sex !== 'M' && value.sex !== 'F') return null;
    var normalized = {
      stage: value.stage,
      observedAtISO: value.observedAtISO == null ? null : value.observedAtISO,
      ageMonths: value.ageMonths == null ? null : value.ageMonths,
      source: value.source == null ? null : value.source
    };
    // A later edit for another sex must not relabel an earlier independent axis.
    if (owns(value, 'sex')) normalized.sex = value.sex;
    return normalized;
  }

  function result(status, assessment, legacy) {
    return { status: status, assessment: assessment || null, legacy: legacy || null };
  }

  function readUser(user) {
    if (!owns(user, 'pubertyAssessment')) {
      var oldStage = owns(user, 'tannerStage') ? user.tannerStage : null;
      if (typeof oldStage === 'string' && /^[1-5]$/.test(oldStage)) oldStage = Number(oldStage);
      return result('absent', null, stage(oldStage) ? { kind: 'unspecified', stage: oldStage } : null);
    }
    var raw = user.pubertyAssessment;
    if (!object(raw) || !Number.isInteger(raw.version) || raw.version < 1) return result('invalid');
    if (raw.version !== 1) return result('unsupported');
    if ((raw.sex != null && raw.sex !== 'M' && raw.sex !== 'F') || !object(raw.observations)) {
      return result('invalid');
    }
    var observations = { G: null, Th: null, P: null };
    var axes = ['G', 'Th', 'P'];
    for (var i = 0; i < axes.length; i++) {
      var key = axes[i];
      if (!owns(raw.observations, key) || raw.observations[key] === null) continue;
      var item = observation(raw.observations[key]);
      if (!item) return result('invalid');
      observations[key] = item;
    }
    // Keep the source sex and axis labels. Clinical consumers must explicitly
    // check applicability; this reader does not infer or relabel an observation.
    return result('ready', { version: 1, sex: raw.sex == null ? null : raw.sex, observations: observations });
  }

  function sexCode(value) {
    return value === 'M' ? 'M' : value === 'F' || value === 'K' ? 'F' : null;
  }

  function finite(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
  }

  // P-POKWITANIE-WIZYTA: the same visit means the same completed month of age.
  // Consumers may pass an exact fractional age (146.07) while the form carries
  // completed months (146); a difference below one month is the same visit.
  var SAME_MONTH = 1 - 1e-9;

  function sameNumber(a, b) {
    return a === null && b === null || finite(a) !== null && finite(b) !== null && Math.abs(a - b) < SAME_MONTH;
  }

  // The marker records an explicit examination in this visit. A matching date,
  // an import, a storage timestamp or 'clinician-entry' alone is insufficient.
  function visitMatches(marker, options) {
    if (!object(marker) || marker.version !== 1 || typeof marker.visitId !== 'string' ||
        !marker.visitId.trim() || !Array.isArray(marker.currentAxes) || !object(marker.reference)) return false;
    if (marker.currentAxes.some(function (axis) { return ['G', 'Th', 'P'].indexOf(axis) < 0; })) return false;
    if (owns(options, 'patientId') && marker.ownerPatientId !== (options.patientId || null)) return false;
    var reference = marker.reference;
    if (reference.ageMonths !== null && finite(reference.ageMonths) === null ||
        reference.measuredAtISO !== null && !date(reference.measuredAtISO)) return false;
    // An absent date or age must not invent a new visit when another existing
    // field is filled later. Known contradictions still reject the marker.
    return reference.sex === options.sex &&
      (!reference.measuredAtISO || !options.measuredAtISO || reference.measuredAtISO === options.measuredAtISO) &&
      (reference.ageMonths === null || options.currentAgeMonths === null || sameNumber(reference.ageMonths, options.currentAgeMonths));
  }

  function contextOptions(input, options) {
    var user = object(input) ? input : {};
    var opts = Object.assign({}, options || {});
    opts.sex = sexCode(owns(opts, 'sex') ? opts.sex : user.sex);
    opts.currentAgeMonths = finite(opts.currentAgeMonths);
    opts.measuredAtISO = date(opts.measuredAtISO) ? opts.measuredAtISO : null;
    opts.visitMarker = owns(opts, 'visitMarker') ? opts.visitMarker : user.pubertyAssessmentVisit || user.visit || null;
    return opts;
  }

  function resolveAxis(input, axis, options) {
    var read = input && typeof input.status === 'string' && owns(input, 'assessment') ? input : readUser(input);
    var opts = contextOptions(input, options);
    var observation = read.status === 'ready' && read.assessment && read.assessment.observations[axis] || null;
    var out = { kind: axis, stage: null, observation: observation ? clone(observation) : null,
      ageMonths: observation ? observation.ageMonths : null,
      observedAtISO: observation ? observation.observedAtISO : null,
      source: observation ? observation.source : null,
      current: false, usableForGrowth: false, status: read.status, reason: read.status };
    if (!observation) {
      if (read.status === 'ready') out.status = out.reason = 'missing';
      return out;
    }
    var sourceSex = owns(observation, 'sex') ? observation.sex : read.assessment.sex;
    if (!opts.sex || sourceSex !== opts.sex || axis === 'G' && opts.sex !== 'M' || axis === 'Th' && opts.sex !== 'F') {
      out.status = out.reason = 'sex-mismatch';
      return out;
    }
    var ageDifference = opts.currentAgeMonths !== null && observation.ageMonths !== null
      ? opts.currentAgeMonths - observation.ageMonths : null;
    var dated = !!(opts.measuredAtISO && observation.observedAtISO);
    if (ageDifference !== null && ageDifference < -1e-6 || dated && observation.observedAtISO > opts.measuredAtISO) {
      out.status = out.reason = 'future';
      return out;
    }
    var marker = opts.visitMarker;
    out.current = visitMatches(marker, opts) && marker.currentAxes.indexOf(axis) >= 0 &&
      (ageDifference === null || Math.abs(ageDifference) < SAME_MONTH) &&
      (!dated || observation.observedAtISO === opts.measuredAtISO);
    var fresh = false;
    if (ageDifference !== null) fresh = ageDifference <= 12 + 1e-6;
    else if (dated) {
      var cutoff = new Date(opts.measuredAtISO + 'T00:00:00.000Z');
      cutoff.setUTCMonth(cutoff.getUTCMonth() - 12);
      fresh = new Date(observation.observedAtISO + 'T00:00:00.000Z').getTime() >= cutoff.getTime();
    }
    // Both clocks constrain an observation when available. A contradictory old
    // calendar date cannot become fresh solely because the entered ages match.
    if (fresh && dated) {
      var oldest = new Date(opts.measuredAtISO + 'T00:00:00.000Z');
      oldest.setUTCMonth(oldest.getUTCMonth() - 12);
      fresh = new Date(observation.observedAtISO + 'T00:00:00.000Z').getTime() >= oldest.getTime();
    }
    out.usableForGrowth = out.current || fresh;
    out.status = out.reason = out.current ? 'ready' : out.usableForGrowth ? 'historical'
      : ageDifference === null && !dated ? 'unknown-time' : 'stale';
    if (options && options.scope === 'growth' ? out.usableForGrowth : out.current) out.stage = observation.stage;
    return out;
  }

  function gonadalContext(input, options) {
    var opts = contextOptions(input, options);
    var axis = opts.sex === 'M' ? 'G' : opts.sex === 'F' ? 'Th' : null;
    if (!axis) return { kind: null, stage: null, observation: null, ageMonths: null,
      observedAtISO: null, source: null, current: false, usableForGrowth: false,
      status: 'sex-missing', reason: 'sex-missing' };
    return resolveAxis(input, axis, opts);
  }

  global.VildaPubertyAssessment = { VERSION: '3', readUser: readUser, clone: clone,
    resolveAxis: resolveAxis, gonadalContext: gonadalContext, visitMatches: visitMatches };
})(typeof window !== 'undefined' ? window : globalThis);
