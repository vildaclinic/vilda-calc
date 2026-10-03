/* Historical LH/FSH assessment transport. No engine, reference data, DOM, storage
 * or current-date dependency. An explicit unreadable assessment stays explicit;
 * it must never fall back to an interpretation using today's patient context.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VildaLabSnapshot = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  var own = function (value, key) { return value != null && Object.prototype.hasOwnProperty.call(value, key); };
  var record = function (value) { return value !== null && typeof value === 'object' && !Array.isArray(value); };
  var finite = function (value) { return typeof value === 'number' && Number.isFinite(value); };

  // Every object level has an explicit whitelist. Unknown extensions (including
  // patient IDs, DOM/HTML and imported object graphs) are never traversed.
  var bound = { operator: 'text', value: 'number' };
  var age = { years: 'number', months: 'number', days: 'number', precision: 'text' };
  var rangeBounds = { lower: bound, upper: bound, censoredLower: bound, sourceText: 'text' };
  var ageBounds = { axis: 'text', lower: bound, upper: bound, sourceText: 'text', interpretation: 'text' };
  var source = {
    id: 'text', label: 'text', version: 'text', title: 'text', organization: 'text', url: 'url',
    accessedOn: 'text', accessTimeZone: 'text', readScope: 'text', evidenceSha256: 'text',
    methodDocumentVersion: 'text', knownLimitations: ['text'], pmid: 'text', doi: 'text',
    pubmedUrl: 'url', doiUrl: 'url', definition: 'text'
  };
  var population = {
    label: 'text', sourceDescription: 'text',
    statistics: { kind: 'text', coveragePercent: 'number', sampleSize: 'number', lowerPercentile: 'number', upperPercentile: 'number', transformation: 'text' }
  };
  var method = {
    id: 'text', name: 'text', description: 'text',
    analyticalSensitivity: { value: 'number', unit: 'text', sourceTerm: 'text' }
  };
  var selectedRange = {
    id: 'text', profileId: 'text', profileVersion: 'text', dataVersion: 'text', sourceId: 'text',
    source: source, population: population, method: method, material: 'text', unit: 'text', sex: 'text',
    age: ageBounds, stage: { kind: 'text', value: 'number', sourceText: 'text' }, bounds: rangeBounds, basis: 'text'
  };
  var comparison = { status: 'text', reasonCodes: ['text'], range: selectedRange };
  var input = {
    analyte: 'text', value: 'measurementInput', unit: 'text', sex: 'text', sampleDateISO: 'text', birthDateISO: 'text', age: age,
    specimen: 'text', measurementKind: 'text', assay: { profileId: 'text', methodId: 'text', confirmation: 'text' },
    puberty: { kind: 'text', stage: 'number', assessedAtISO: 'text', appliesToSample: 'boolean', source: 'text' },
    testicularVolume: { value: 'number', unit: 'text', method: 'text', assessedAtISO: 'text', appliesToSample: 'boolean' },
    onset: { kind: 'text', dateISO: 'text', age: age, confirmedPubertalOnset: 'boolean' },
    history: { progression: 'text', growthAcceleration: 'text', cnsSymptoms: 'text', regression: 'text' },
    treatment: { gnrha: 'text', sexSteroids: 'text' }, preterm: 'text', gestationalAgeWeeks: 'number',
    localReference: {
      id: 'text', version: 'text', analyte: 'text', material: 'text', unit: 'text', methodId: 'text',
      applicabilityConfirmed: 'boolean', source: source, population: population, range: rangeBounds
    }
  };
  var evaluationSchema = {
    schemaVersion: 'number', engineVersion: 'text', dataVersion: 'text', analyte: 'text', input: input,
    measurement: {
      status: 'text', raw: 'text', operator: 'text', value: 'number', unit: 'text', sourceValue: 'number', sourceUnit: 'text',
      isExact: 'boolean', plotValue: 'number', limitKind: 'text', reasonCodes: ['text']
    },
    ageAtSample: {
      status: 'text', precision: 'text', source: 'text', lowerYears: 'number', upperYears: 'number', upperInclusive: 'boolean',
      ageDays: 'number', reasonCodes: ['text'], anniversaryPolicy: 'text'
    },
    biochemical: { status: 'text', primary: 'text', byAge: comparison, byStage: comparison, local: comparison, reasonCodes: ['text'] },
    clinical: { status: 'text', code: 'text', title: 'text', text: 'text', reasonCodes: ['text'], sourceIds: ['text'] },
    summary: { status: 'text', code: 'text', title: 'text' },
    provenance: {
      clinicalProfileId: 'text', clinicalProfileVersion: 'text', biochemicalPolicyId: 'text', biochemicalPolicyVersion: 'text',
      profileId: 'text', profileVersion: 'text', sourceIds: ['text']
    },
    limitations: ['text']
  };
  var bindingSchema = { testKey: 'text', test: 'text', value: 'text', valueNum: 'number', unit: 'text', norm: 'text', clinicalDateISO: 'text' };

  function plainText(value) {
    // Operators such as <0.02 and <LOD are plain text, not markup.
    if (typeof value !== 'string' || value.length > 12000 || /<\/?[A-Za-z][^>]*>/.test(value)) throw new Error('invalid_text');
    return value;
  }
  function project(value, schema) {
    if (value === null) return null;
    if (schema === 'text' || schema === 'url') {
      var string = plainText(value);
      if (schema === 'url' && string && !/^https?:\/\//i.test(string)) throw new Error('invalid_url');
      return string;
    }
    if (schema === 'number') { if (!finite(value)) throw new Error('invalid_number'); return value; }
    if (schema === 'boolean') { if (typeof value !== 'boolean') throw new Error('invalid_boolean'); return value; }
    if (schema === 'measurementInput') {
      if (record(value)) return project(value, bound);
      return project(value, typeof value === 'number' ? 'number' : 'text');
    }
    if (Array.isArray(schema)) {
      if (!Array.isArray(value) || value.length > 256) throw new Error('invalid_array');
      return value.map(function (item) { if (item === null) throw new Error('invalid_array_item'); return project(item, schema[0]); });
    }
    if (!record(value)) throw new Error('invalid_object');
    var out = {};
    Object.keys(schema).forEach(function (key) {
      // Accessors and custom toJSON are never invoked by the transport layer.
      var descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor) {
        if (!own(descriptor, 'value')) throw new Error('invalid_accessor');
        out[key] = project(descriptor.value, schema[key]);
      }
    });
    return out;
  }
  function contains(value, choices) { return choices.indexOf(value) !== -1; }
  function required(object, keys) { return record(object) && keys.every(function (key) { return own(object, key); }); }
  function validBound(value, operators, nullableValue) {
    return required(value, ['operator', 'value']) && contains(value.operator, operators) && (finite(value.value) || nullableValue && value.value === null);
  }
  function validRange(value) {
    if (!required(value, ['id', 'profileId', 'profileVersion', 'sourceId', 'source', 'method', 'population', 'bounds', 'material', 'unit'])) return false;
    if (!value.id || !value.profileId || !value.profileVersion || !value.sourceId || !value.material || !value.unit) return false;
    if (!record(value.source) || value.source.id !== value.sourceId || !(value.source.label || value.source.title)) return false;
    if (!record(value.method) || !value.method.id || !record(value.population) || !value.population.label) return false;
    var limits = value.bounds;
    if (!required(limits, ['lower', 'upper']) || !limits.lower && !limits.upper) return false;
    if (limits.lower !== null && !validBound(limits.lower, ['>', '>='], false)) return false;
    if (limits.upper !== null && !validBound(limits.upper, ['<', '<='], false)) return false;
    if (limits.censoredLower != null && !validBound(limits.censoredLower, ['<', '<='], true)) return false;
    return true;
  }
  function validEvaluation(value) {
    if (!required(value, Object.keys(evaluationSchema)) || value.schemaVersion !== 1 || !value.engineVersion || !contains(value.analyte, ['lh', 'fsh'])) return false;
    if (!required(value.input, Object.keys(input)) || value.input.analyte !== value.analyte) return false;
    if (!['assay', 'puberty', 'testicularVolume', 'onset', 'history', 'treatment'].every(function (key) { return required(value.input[key], Object.keys(input[key])); })) return false;
    var m = value.measurement, b = value.biochemical, c = value.clinical;
    if (!required(m, Object.keys(evaluationSchema.measurement)) || !contains(m.status, ['valid', 'invalid']) || typeof m.raw !== 'string' || typeof m.isExact !== 'boolean') return false;
    if (m.status === 'valid' && (!contains(m.operator, ['=', '<', '<=', '>', '>=']) || m.unit !== 'IU/L' || !contains(m.sourceUnit, ['IU/L', 'mIU/mL']))) return false;
    if (m.status === 'valid' && (m.isExact !== (m.operator === '=') || m.sourceValue !== m.value || m.sourceUnit !== value.input.unit || m.value !== null && m.value < 0)) return false;
    if (m.status === 'valid') {
      var rawOperator = m.raw.trim().match(/^(<=|>=|<|>|=|≤|≥)/);
      var normalizedOperator = rawOperator ? ({ '≤': '<=', '≥': '>=' })[rawOperator[0]] || rawOperator[0] : '=';
      if (normalizedOperator !== m.operator) return false;
      var numericRaw = m.raw.trim().slice(rawOperator ? rawOperator[0].length : 0).trim().replace(',', '.');
      if (m.value !== null) {
        if (!/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(numericRaw) || Number(numericRaw) !== m.value) return false;
        if (m.limitKind !== null) return false;
      } else if (numericRaw.toUpperCase() !== m.limitKind) return false;
      var original = value.input.value;
      var originalRaw = record(original) ? (original.operator === '=' ? '' : original.operator) + String(original.value) : String(original).trim();
      if (originalRaw !== m.raw) return false;
    }
    if (m.status === 'valid' && m.value === null && (!contains(m.limitKind, ['LOD', 'LOQ']) || !contains(m.operator, ['<', '<=']))) return false;
    if (m.status === 'invalid' && (m.operator !== null || m.value !== null || m.isExact)) return false;
    if (m.isExact && (m.status !== 'valid' || m.operator !== '=' || !finite(m.value) || m.value < 0 || m.plotValue !== m.value)) return false;
    if (!m.isExact && m.plotValue !== null) return false;
    if (!Array.isArray(m.reasonCodes) || !required(value.ageAtSample, ['status', 'precision', 'source', 'lowerYears', 'upperYears', 'upperInclusive', 'ageDays', 'reasonCodes']) || !contains(value.ageAtSample.status, ['known', 'unknown', 'invalid']) || !Array.isArray(value.ageAtSample.reasonCodes)) return false;
    if (!required(b, Object.keys(evaluationSchema.biochemical)) || !contains(b.status, ['available', 'unavailable']) || !contains(b.primary, [null, 'age', 'stage', 'local'])) return false;
    if (!Array.isArray(b.reasonCodes) || (b.status === 'available') !== (b.primary !== null)) return false;
    if (!['byAge', 'byStage', 'local'].every(function (key) {
      var item = b[key];
      return required(item, ['status', 'reasonCodes']) && Array.isArray(item.reasonCodes) && contains(item.status, ['unavailable', 'indeterminate', 'within', 'below', 'above']) &&
        (item.status === 'unavailable' ? item.range == null : validRange(item.range));
    })) return false;
    if (b.primary && b[({ age: 'byAge', stage: 'byStage', local: 'local' })[b.primary]].status === 'unavailable') return false;
    return required(c, Object.keys(evaluationSchema.clinical)) && contains(c.status, ['limited', 'warning', 'notice', 'out_of_scope', 'no_timing_alert']) &&
      Array.isArray(c.reasonCodes) && Array.isArray(c.sourceIds) &&
      required(value.summary, Object.keys(evaluationSchema.summary)) && contains(value.summary.status, ['attention', 'limited', 'compared', 'invalid', 'out_of_scope']) &&
      required(value.provenance, Object.keys(evaluationSchema.provenance)) && Array.isArray(value.provenance.sourceIds) && Array.isArray(value.limitations);
  }
  function unavailable(reason) { return { schemaVersion: 1, status: 'unavailable', reasonCodes: [reason], evaluation: null }; }
  function normalize(envelope) {
    try {
      var clean = project(envelope, { schemaVersion: 'number', status: 'text', reasonCodes: ['text'], evaluation: evaluationSchema, binding: bindingSchema });
      if (!required(clean, ['schemaVersion', 'status', 'reasonCodes', 'evaluation']) || clean.schemaVersion !== 1) return unavailable('unsupported_or_invalid_assessment_schema');
      if (!contains(clean.status, ['recorded', 'invalidated', 'unavailable']) || !Array.isArray(clean.reasonCodes)) return unavailable('invalid_assessment');
      if (clean.status === 'recorded' && !validEvaluation(clean.evaluation)) return unavailable('invalid_assessment_evaluation');
      if (clean.evaluation !== null && !validEvaluation(clean.evaluation)) return unavailable('invalid_assessment_evaluation');
      if (clean.status !== 'recorded' && !clean.reasonCodes.length) clean.reasonCodes.push('assessment_unavailable');
      if (own(clean, 'binding') && !required(clean.binding, Object.keys(bindingSchema))) return unavailable('invalid_assessment_binding');
      return clean;
    } catch (_) { return unavailable('invalid_assessment'); }
  }
  function bindingFor(lab, dateISO) {
    var result = {};
    Object.keys(bindingSchema).forEach(function (key) {
      var value = key === 'clinicalDateISO' ? dateISO : lab[key];
      result[key] = key === 'valueNum' ? (finite(value) ? value : null) : typeof value === 'string' ? value : finite(value) ? String(value) : null;
    });
    return result;
  }
  function create(evaluation, binding) {
    var envelope = { schemaVersion: 1, status: 'recorded', reasonCodes: [], evaluation: evaluation };
    if (binding) envelope.binding = bindingFor(binding, binding.clinicalDateISO);
    return normalize(envelope);
  }
  function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
  function invalidate(envelope, reason) {
    envelope.status = 'invalidated';
    if (envelope.reasonCodes.indexOf(reason) === -1) envelope.reasonCodes.push(reason);
    return envelope;
  }
  function matchesLab(evaluation, lab) {
    var m = evaluation.measurement;
    if (lab.testKey && String(lab.testKey).toLowerCase() !== evaluation.analyte) return false;
    if (!lab.testKey && lab.test && String(lab.test).trim().toLowerCase() !== evaluation.analyte) return false;
    if (lab.unit != null && String(lab.unit) !== m.sourceUnit) return false;
    if (lab.value != null && String(lab.value).trim() !== m.raw.trim()) return false;
    if (finite(lab.valueNum) && lab.valueNum !== m.sourceValue) return false;
    // A censored result must retain its raw expression, not just its boundary.
    return m.isExact || typeof lab.value === 'string' && lab.value.trim() === m.raw.trim();
  }
  function reconcile(previousLab, nextLab, previousDateISO, nextDateISO) {
    if (!record(nextLab)) return nextLab;
    var result = Object.assign({}, nextLab);
    var previousHas = own(previousLab, 'assessment'), nextHas = own(nextLab, 'assessment');
    if (!previousHas && !nextHas) return result;
    var old = previousHas ? normalize(previousLab.assessment) : null;
    var assessment = nextHas ? normalize(nextLab.assessment) : normalize(previousLab.assessment);
    var currentBinding = bindingFor(nextLab, nextDateISO);
    var changed = record(previousLab) && !same(bindingFor(previousLab, previousDateISO), currentBinding);
    var fresh = nextHas && (!old || !same(assessment.evaluation, old.evaluation));
    if (assessment.status === 'recorded') {
      if (old && old.status !== 'recorded' && !fresh) {
        old.reasonCodes.forEach(function (reason) { if (assessment.reasonCodes.indexOf(reason) === -1) assessment.reasonCodes.push(reason); });
        invalidate(assessment, 'assessment_requires_recalculation');
      } else if (changed && !fresh) invalidate(assessment, 'result_or_clinical_date_changed');
      else if (!matchesLab(assessment.evaluation, nextLab)) invalidate(assessment, 'assessment_result_mismatch');
      else if (assessment.evaluation.input.sampleDateISO && assessment.evaluation.input.sampleDateISO !== nextDateISO) invalidate(assessment, 'assessment_sample_date_mismatch');
      else if (assessment.binding && !same(assessment.binding, currentBinding)) invalidate(assessment, 'assessment_binding_mismatch');
      else assessment.binding = currentBinding;
    }
    result.assessment = assessment;
    return result;
  }
  function forSeries(lab, dateISO) {
    if (!own(lab, 'assessment')) return {};
    var assessment = reconcile(null, lab, null, dateISO).assessment;
    var m = assessment.status === 'recorded' && assessment.evaluation.measurement;
    var value = m && m.status === 'valid' && m.isExact && m.operator === '=' ? m.plotValue : null;
    return { assessment: assessment, valueNum: value, plotValue: value };
  }
  return Object.freeze({ version: '1.0.0', create: create, normalize: normalize, reconcile: reconcile, forSeries: forSeries });
});
