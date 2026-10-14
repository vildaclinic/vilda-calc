/* Immutable transport for an educational AMH source reference, separate from
 * laboratory norms and clinical assessments. No live data, engine, DOM, clock,
 * or storage is consulted when reading a saved result. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VildaHormoneReferenceSnapshot = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  var own = function (value, key) { return value != null && Object.prototype.hasOwnProperty.call(value, key); };
  var record = function (value) { return value !== null && typeof value === 'object' && !Array.isArray(value); };
  var finite = function (value) { return typeof value === 'number' && Number.isFinite(value); };
  var has = function (value, keys) { return record(value) && keys.every(function (key) { return own(value, key); }); };
  var kind = 'educational-hormone-reference';
  var scope = 'ordinary-patient-reference';
  var units = ['pmol/L', 'ng/mL', 'μg/L', 'ug/L'];
  var contextSchema = {
    sex: 'text', ageYears: 'number', ageUpperYears: 'number', ageUpperInclusive: 'boolean', ageLabel: 'text',
    preterm: 'text', puberty: { kind: 'text', stage: 'number' }, cyclePhase: 'text',
    specimen: 'text', assayMethodId: 'text', contraindicated: 'boolean'
  };
  var measurementSchema = { raw: 'text', operator: 'text', sourceValue: 'number', sourceUnit: 'text', value: 'number', unit: 'text', conversionFactor: 'number' };
  var provenanceSchema = {
    doi: 'text', pmid: 'text', title: 'text', authors: 'text', year: 'number', journal: 'text',
    documentId: 'text', sha256: 'text', sourceSha256: 'text', supplementSha256: 'text',
    url: 'url', supplementUrl: 'url', supplementDoi: 'text', table: 'locator', referenceTable: 'text',
    figure: 'locator', pdfPage: 'number', journalPage: 'number',
    sourceSpecimen: 'text', sourceUnit: 'text', sourceToCanonicalFactor: 'number', model: 'text',
    participants: 'number', groupParticipants: 'number', ageRouting: 'text', routingVersion: 'text',
    selectionPolicy: 'text', specimenPolicy: 'text', assayPolicy: 'text', reproductiveContextPolicy: 'text'
  };
  var referenceSchema = {
    value: 'number', unit: 'text', statistic: 'text', approximate: 'boolean', profileId: 'text', profileVersion: 'text',
    sourceLabel: 'text', url: 'url', method: 'text', population: 'text', interpolation: 'text',
    minAge: 'number', maxAge: 'number', minAgeExclusive: 'boolean', maxAgeExclusive: 'boolean',
    ageGroup: { label: 'text', minAge: 'number', maxAge: 'number', n: 'number', sourceUnit: 'text',
      sourceMedian: 'number', sourceMean: 'number', boundaryPolicy: 'text', description: 'text' },
    limitations: ['text'], provenance: provenanceSchema
  };
  var bindingSchema = { test: 'text', testKey: 'text', value: 'text', valueNum: 'number', unit: 'text', clinicalDateISO: 'text' };
  var schema = {
    schemaVersion: 'number', kind: 'text', scope: 'text', analyte: 'text', status: 'text', reasonCodes: ['text'], capturedAtISO: 'text',
    context: contextSchema, measurement: measurementSchema, reference: referenceSchema,
    display: { unit: 'text', value: 'number', referenceValue: 'number', factorFromCanonical: 'number' },
    versions: { engine: 'text', data: 'text', runtime: 'text' }, binding: bindingSchema
  };
  function hasControlText(value) {
    for (var index = 0; index < value.length; index += 1) {
      var code = value.charCodeAt(index);
      if (code < 32 && code !== 9 && code !== 10 && code !== 13) return true;
    }
    return false;
  }
  function project(value, shape) {
    if (value === null) return null;
    if (shape === 'text' || shape === 'url') {
      if (typeof value !== 'string' || value.length > 8000 || /<\/?[A-Za-z][^>]*>/.test(value) || hasControlText(value)) throw new Error('invalid_text');
      if (shape === 'url' && value && !/^https?:\/\/[^\s]+$/i.test(value)) throw new Error('invalid_url');
      return value;
    }
    if (shape === 'number') { if (!finite(value)) throw new Error('invalid_number'); return value; }
    if (shape === 'boolean') { if (typeof value !== 'boolean') throw new Error('invalid_boolean'); return value; }
    if (shape === 'locator') {
      if (Array.isArray(value)) return project(value, ['locator']);
      return project(value, typeof value === 'number' ? 'number' : 'text');
    }
    if (Array.isArray(shape)) {
      if (!Array.isArray(value) || value.length > 128) throw new Error('invalid_array');
      return value.map(function (item) { if (item === null || Array.isArray(item)) throw new Error('invalid_array_item'); return project(item, shape[0]); });
    }
    if (!record(value)) throw new Error('invalid_object');
    var result = {};
    Object.keys(shape).forEach(function (key) {
      var descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor) return;
      if (!own(descriptor, 'value')) throw new Error('invalid_accessor');
      result[key] = project(descriptor.value, shape[key]);
    });
    return result;
  }
  function unavailable(reason) {
    return { schemaVersion: 1, kind: kind, scope: scope, analyte: 'amh', status: 'unavailable',
      reasonCodes: [reason], capturedAtISO: null, context: null, measurement: null, reference: null, display: null, versions: null };
  }
  function parsed(raw) {
    if (typeof raw !== 'string' || !raw.trim()) return null;
    var expression = raw.trim(), prefix = expression.match(/^(<=|>=|<|>|=|≤|≥)/);
    var operator = prefix ? ({ '≤': '<=', '≥': '>=' })[prefix[0]] || prefix[0] : '=';
    var numeric = (prefix ? expression.slice(prefix[0].length) : expression).trim();
    // Match the established converter's Number semantics, including leading +,
    // exponent notation and whitespace/NBSP grouping. Preserve raw unchanged.
    // Censoring is parsed separately and never becomes an exact concentration.
    if (!numeric) return null;
    numeric = numeric.replace(/[\s\u00a0]/g, '').replace(',', '.');
    var limit = /^(LOD|LOQ)$/i.test(numeric);
    if (limit && operator !== '<' && operator !== '<=') return null;
    var value = limit ? null : Number(numeric);
    if (!limit && (!finite(value) || value < 0)) return null;
    return { operator: operator, value: value };
  }
  function close(left, right) {
    return finite(left) && finite(right) && Math.abs(left - right) <= Math.max(1, Math.abs(left), Math.abs(right)) * Number.EPSILON * 16;
  }
  function validContext(value, ready) {
    if (!has(value, Object.keys(contextSchema))) return false;
    var knownAge = finite(value.ageYears) && value.ageYears >= 0 && finite(value.ageUpperYears) && value.ageUpperYears >= value.ageYears;
    if (!knownAge && (value.ageYears !== null || value.ageUpperYears !== null)) return false;
    if (![null, 'male', 'female'].includes(value.sex) || typeof value.ageUpperInclusive !== 'boolean' ||
        !['yes', 'no', 'unknown'].includes(value.preterm) || typeof value.contraindicated !== 'boolean') return false;
    if (value.puberty !== null && (!has(value.puberty, ['kind', 'stage']) ||
        ![null, 'G', 'Th', 'P', 'Ax', 'unspecified'].includes(value.puberty.kind) ||
        value.puberty.stage !== null && (!Number.isInteger(value.puberty.stage) || value.puberty.stage < 1 || value.puberty.stage > 5))) return false;
    return !ready || knownAge && value.sex !== null && value.contraindicated === false;
  }
  function validMeasurement(value, ready) {
    if (!has(value, Object.keys(measurementSchema)) || typeof value.raw !== 'string' || typeof value.sourceUnit !== 'string') return false;
    var p = parsed(value.raw);
    if (!p) return !ready && value.operator === null && value.sourceValue === null && value.value === null && value.unit === null && value.conversionFactor === null;
    if (value.operator !== p.operator || value.sourceValue !== p.value) return false;
    if (!ready && value.value === null && value.unit === null && value.conversionFactor === null) return true;
    return p.operator === '=' && finite(p.value) && units.includes(value.sourceUnit) && value.unit === 'pmol/L' &&
      finite(value.conversionFactor) && value.conversionFactor > 0 && close(value.value, p.value * value.conversionFactor) &&
      (value.sourceUnit !== value.unit || value.conversionFactor === 1);
  }
  function validReference(value, context) {
    if (!has(value, Object.keys(referenceSchema)) || !(value.value > 0) || value.unit !== 'pmol/L' ||
        !['median', 'group-median'].includes(value.statistic) || typeof value.approximate !== 'boolean' ||
        !value.profileId || !value.sourceLabel || !value.url || !value.method || !value.population ||
        !['pchip', 'constant'].includes(value.interpolation) || !Array.isArray(value.limitations) || !record(value.provenance) ||
        !finite(value.minAge) || !finite(value.maxAge) || value.minAge < 0 || value.maxAge < value.minAge ||
        typeof value.minAgeExclusive !== 'boolean' || typeof value.maxAgeExclusive !== 'boolean') return false;
    if (context.ageYears < value.minAge || context.ageYears === value.minAge && value.minAgeExclusive ||
        context.ageUpperYears > value.maxAge || context.ageUpperYears === value.maxAge && value.maxAgeExclusive &&
        (context.ageUpperInclusive || context.ageYears === context.ageUpperYears)) return false;
    if (value.statistic === 'group-median') {
      var group = value.ageGroup;
      if (!has(group, ['label', 'minAge', 'maxAge', 'n', 'sourceUnit', 'sourceMedian', 'description']) || !group.label ||
          !finite(group.minAge) || !finite(group.maxAge) || group.minAge < 0 || group.maxAge < group.minAge ||
          group.n !== null && (!Number.isInteger(group.n) || group.n <= 0) ||
          !units.includes(group.sourceUnit) || !(group.sourceMedian > 0) || value.interpolation !== 'constant') return false;
      var sourceFactor = group.sourceUnit === value.unit ? 1 : value.provenance.sourceToCanonicalFactor;
      if (!(sourceFactor > 0) || !close(value.value, group.sourceMedian * sourceFactor)) return false;
    } else if (value.ageGroup !== null) return false;
    return true;
  }
  function validPayload(value) {
    var ready = value.status === 'recorded' || value.reference !== null;
    if (value.capturedAtISO !== null && (typeof value.capturedAtISO !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value.capturedAtISO) || !finite(Date.parse(value.capturedAtISO)))) return false;
    if (value.context === null || value.measurement === null || value.versions === null) {
      return !ready && value.context === null && value.measurement === null && value.versions === null && value.display === null;
    }
    if (!validContext(value.context, ready) || !validMeasurement(value.measurement, ready) ||
        !has(value.versions, ['engine', 'data', 'runtime'])) return false;
    if (!ready) return value.reference === null && value.display === null;
    if (!value.capturedAtISO || !value.versions.engine || !value.versions.data || !value.versions.runtime ||
        !validReference(value.reference, value.context) || !has(value.display, Object.keys(schema.display))) return false;
    var display = value.display;
    return units.includes(display.unit) && display.factorFromCanonical > 0 &&
      close(display.value, value.measurement.value * display.factorFromCanonical) &&
      close(display.referenceValue, value.reference.value * display.factorFromCanonical) &&
      (display.unit !== value.reference.unit || display.factorFromCanonical === 1);
  }
  function normalize(envelope) {
    try {
      var clean = project(envelope, schema);
      if (!has(clean, Object.keys(schema).filter(function (key) { return key !== 'binding'; })) || clean.schemaVersion !== 1 ||
          clean.kind !== kind || clean.scope !== scope || clean.analyte !== 'amh') return unavailable('unsupported_or_invalid_reference_schema');
      if (!['recorded', 'unavailable', 'invalidated'].includes(clean.status) || !Array.isArray(clean.reasonCodes) ||
          clean.reasonCodes.some(function (code) { return !code || code.length > 120; }) ||
          !validPayload(clean)) return unavailable('invalid_hormone_reference');
      if (clean.status === 'recorded' && clean.reasonCodes.length) return unavailable('invalid_hormone_reference');
      if (clean.status !== 'recorded' && !clean.reasonCodes.length) clean.reasonCodes.push('reference_unavailable');
      if (own(clean, 'binding') && !has(clean.binding, Object.keys(bindingSchema))) return unavailable('invalid_reference_binding');
      if (JSON.stringify(clean).length > 64000) return unavailable('invalid_hormone_reference');
      return clean;
    } catch (_) { return unavailable('invalid_hormone_reference'); }
  }
  function nullable(value) { return value === undefined ? null : value; }
  function bindingFor(lab, dateISO) {
    var result = {};
    Object.keys(bindingSchema).forEach(function (key) {
      var value = key === 'clinicalDateISO' ? dateISO : lab && lab[key];
      result[key] = key === 'valueNum' ? finite(value) ? value : null : typeof value === 'string' ? value : null;
    });
    return result;
  }
  // evaluation is the production resolver result, already calculated for context.
  // measurement carries the original input; display supplies the selected unit's
  // existing conversion. This serializer never selects a profile or interpolates.
  function create(options) {
    try {
      options = options || {};
      var evaluation = options.evaluation || {}, supplied = options.context || {}, input = options.measurement || {};
      var p = parsed(input.raw), ready = evaluation.status === 'ready', profile = evaluation.profile || {};
      var context = {};
      Object.keys(contextSchema).forEach(function (key) { context[key] = nullable(supplied[key]); });
      context.ageUpperYears = supplied.ageUpperYears == null ? nullable(supplied.ageYears) : supplied.ageUpperYears;
      context.ageUpperInclusive = supplied.ageUpperInclusive !== false;
      context.preterm = supplied.preterm === 'yes' || supplied.preterm === true ? 'yes' : supplied.preterm === 'no' || supplied.preterm === false ? 'no' : 'unknown';
      context.contraindicated = supplied.contraindicated === true;
      var measurement = { raw: input.raw, operator: p ? p.operator : null, sourceValue: p ? p.value : null,
        sourceUnit: input.sourceUnit, value: ready ? evaluation.value : null,
        unit: ready ? profile.unit : null, conversionFactor: ready ? input.conversionFactor : null };
      if (own(input, 'sourceValue') && input.sourceValue !== measurement.sourceValue || own(input, 'operator') && input.operator !== measurement.operator) return unavailable('reference_input_mismatch');
      var reference = null, display = null;
      if (ready) {
        if (profile.analyte !== 'amh' || profile.sex !== context.sex || supplied.analyte !== 'amh') return unavailable('reference_context_mismatch');
        reference = {};
        Object.keys(referenceSchema).forEach(function (key) { reference[key] = nullable(profile[key]); });
        reference.value = evaluation.referenceValue;
        reference.profileId = profile.id;
        reference.profileVersion = nullable(profile.version || profile.profileVersion);
        reference.minAgeExclusive = profile.minAgeExclusive === true;
        reference.maxAgeExclusive = profile.maxAgeExclusive === true;
        var target = options.display || {};
        display = { unit: target.unit, factorFromCanonical: target.factorFromCanonical,
          value: evaluation.value * target.factorFromCanonical, referenceValue: evaluation.referenceValue * target.factorFromCanonical };
      }
      var envelope = { schemaVersion: 1, kind: kind, scope: scope, analyte: 'amh', status: ready ? 'recorded' : 'unavailable',
        reasonCodes: ready ? [] : [typeof evaluation.reason === 'string' && evaluation.reason || 'reference_unavailable'],
        capturedAtISO: nullable(options.capturedAtISO), context: context, measurement: measurement,
        reference: reference, display: display, versions: options.versions || { engine: null, data: null, runtime: null } };
      if (options.binding) envelope.binding = bindingFor(options.binding, options.binding.clinicalDateISO);
      return normalize(envelope);
    } catch (_) { return unavailable('reference_capture_failed'); }
  }
  function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
  function invalidate(envelope, reason) {
    envelope.status = 'invalidated';
    if (!envelope.reasonCodes.includes(reason)) envelope.reasonCodes.push(reason);
    return envelope;
  }
  function matchesLab(snapshot, lab) {
    var measurement = snapshot.measurement;
    var analyte = typeof lab.testKey === 'string' && lab.testKey ? lab.testKey : lab.test;
    if (typeof analyte !== 'string' || analyte.trim().toLowerCase() !== 'amh' || !measurement) return false;
    if (lab.unit !== measurement.sourceUnit || typeof lab.value !== 'string' || lab.value.trim() !== measurement.raw.trim()) return false;
    return !finite(lab.valueNum) || measurement.sourceValue === lab.valueNum;
  }
  function reconcile(previousLab, nextLab, previousDateISO, nextDateISO) {
    if (!record(nextLab)) return nextLab;
    var result = Object.assign({}, nextLab);
    var previousHas = own(previousLab, 'hormoneReference'), nextHas = own(nextLab, 'hormoneReference');
    if (!previousHas && !nextHas) return result;
    var old = previousHas ? normalize(previousLab.hormoneReference) : null;
    var snapshot = normalize(nextHas ? nextLab.hormoneReference : previousLab.hormoneReference);
    var currentBinding = bindingFor(nextLab, nextDateISO);
    var changed = record(previousLab) && !same(bindingFor(previousLab, previousDateISO), currentBinding);
    var fresh = nextHas && (!old || snapshot.capturedAtISO !== old.capturedAtISO ||
      !same([snapshot.context, snapshot.measurement, snapshot.reference, snapshot.versions], [old.context, old.measurement, old.reference, old.versions]));
    if (snapshot.status === 'recorded' || snapshot.status === 'unavailable' && snapshot.measurement) {
      if (old && old.status === 'invalidated' && !fresh) {
        old.reasonCodes.forEach(function (reason) { if (!snapshot.reasonCodes.includes(reason)) snapshot.reasonCodes.push(reason); });
        invalidate(snapshot, 'reference_requires_recalculation');
      } else if (changed && !fresh) invalidate(snapshot, 'result_or_clinical_date_changed');
      else if (!matchesLab(snapshot, nextLab)) invalidate(snapshot, 'reference_result_mismatch');
      else if (snapshot.binding && !same(snapshot.binding, currentBinding)) invalidate(snapshot, 'reference_binding_mismatch');
      else snapshot.binding = currentBinding;
    }
    result.hormoneReference = snapshot;
    return result;
  }
  function forSeries(lab, dateISO) {
    return own(lab, 'hormoneReference') ? { hormoneReference: reconcile(null, lab, null, dateISO).hormoneReference } : {};
  }
  return Object.freeze({ version: '1.0.0', create: create, normalize: normalize, reconcile: reconcile, forSeries: forSeries, unavailable: unavailable });
});
