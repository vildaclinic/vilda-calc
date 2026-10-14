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
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }

  function observation(value) {
    if (!object(value) || !stage(value.stage)) return null;
    if (value.observedAtISO != null && !date(value.observedAtISO)) return null;
    if (value.ageMonths != null && (typeof value.ageMonths !== 'number' ||
        !Number.isFinite(value.ageMonths) || value.ageMonths < 0)) return null;
    if (value.source != null && (typeof value.source !== 'string' || !value.source.trim())) return null;
    return {
      stage: value.stage,
      observedAtISO: value.observedAtISO == null ? null : value.observedAtISO,
      ageMonths: value.ageMonths == null ? null : value.ageMonths,
      source: value.source == null ? null : value.source
    };
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

  global.VildaPubertyAssessment = { VERSION: '1', readUser: readUser, clone: clone };
})(typeof window !== 'undefined' ? window : globalThis);
