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
  var completedDays = { lower: 'number', upper: 'number', source: 'text' };
  var neonatalAgeInput = { postnatalDays: completedDays, gestationalDays: completedDays };
  var neonatalAge = {
    postnatalDays: completedDays, gestationalDays: completedDays,
    postmenstrualDays: { lower: 'number', upper: 'number' }, status: 'text', reasonCodes: ['text']
  };
  var rangeBounds = { lower: bound, upper: bound, censoredLower: bound, sourceText: 'text' };
  var ageBounds = { axis: 'text', lower: bound, upper: bound, sourceText: 'text', interpretation: 'text' };
  var source = {
    id: 'text', label: 'text', version: 'text', title: 'text', organization: 'text', url: 'url',
    accessedOn: 'text', accessTimeZone: 'text', readScope: 'text', evidenceSha256: 'text',
    methodDocumentVersion: 'text', knownLimitations: ['text'], pmid: 'text', doi: 'text',
    pubmedUrl: 'url', doiUrl: 'url', definition: 'text',
    intervalEvidence: { kind: 'text', version: 'text', url: 'url', table: 'text', page: 'number', verification: 'text' }
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
    contextBasis: 'text', neonatalAge: neonatalAgeInput,
    specimen: 'text', measurementKind: 'text', assay: { profileId: 'text', profileVersion: 'text', methodId: 'text', confirmation: 'text' },
    puberty: { kind: 'text', stage: 'number', assessedAtISO: 'text', appliesToSample: 'boolean', appliesToCurrentContext: 'boolean', source: 'text' },
    testicularVolume: { value: 'number', unit: 'text', method: 'text', assessedAtISO: 'text', appliesToSample: 'boolean', appliesToCurrentContext: 'boolean' },
    onset: { kind: 'text', dateISO: 'text', age: age, confirmedPubertalOnset: 'boolean' },
    history: { progression: 'text', growthAcceleration: 'text', cnsSymptoms: 'text', regression: 'text' },
    treatment: { gnrha: 'text', sexSteroids: 'text', context: 'text' }, preterm: 'text', gestationalAgeWeeks: 'number',
    reportedRange: { text: 'text', unit: 'text' },
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
    neonatalAge: neonatalAge,
    biochemical: { status: 'text', primary: 'text', byAge: comparison, byStage: comparison, local: comparison, reasonCodes: ['text'] },
    clinical: { status: 'text', code: 'text', title: 'text', text: 'text', reasonCodes: ['text'], sourceIds: ['text'] },
    summary: { status: 'text', code: 'text', title: 'text' },
    provenance: {
      clinicalProfileId: 'text', clinicalProfileVersion: 'text', biochemicalPolicyId: 'text', biochemicalPolicyVersion: 'text',
      profileId: 'text', profileVersion: 'text', sourceIds: ['text'], eligibilityPolicyId: 'text', eligibilityPolicyVersion: 'text'
    },
    limitations: ['text'],
    reportedRange: { status: 'text', raw: 'text', unit: 'text', lower: bound, upper: bound, reasonCodes: ['text'] },
    // Older readers discard this extension and retain unavailable biochemical
    // comparisons; losing the qualifier can never turn a preview into a RI.
    referencePreview: { kind: 'text', reasonCodes: ['text'], byAge: comparison, byStage: comparison }
  };
  // These schema-1 additions are optional. Reading an older assessment must
  // preserve its original shape and must never infer a current-form context.
  var optionalInput = ['contextBasis', 'reportedRange', 'neonatalAge'];
  var optionalNestedInput = { assay: ['profileVersion'], puberty: ['appliesToCurrentContext'], testicularVolume: ['appliesToCurrentContext'], treatment: ['context'] };
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
  function validReportedRange(evaluation) {
    var hasInput = own(evaluation.input, 'reportedRange'), hasOutput = own(evaluation, 'reportedRange');
    if (!hasInput && !hasOutput) return true;
    if (!hasInput || !hasOutput) return false;
    var supplied = evaluation.input.reportedRange, result = evaluation.reportedRange;
    if (!required(supplied, ['text', 'unit']) || typeof supplied.text !== 'string' || !supplied.text.trim() || supplied.text.length > 160 || typeof supplied.unit !== 'string' || supplied.unit.length > 24) return false;
    if (!required(result, Object.keys(evaluationSchema.reportedRange)) || !contains(result.status, ['unavailable', 'indeterminate', 'within', 'below', 'above']) || !Array.isArray(result.reasonCodes)) return false;
    if (result.raw !== supplied.text || result.unit !== supplied.unit) return false;
    if (result.lower !== null && (!validBound(result.lower, ['>', '>='], false) || result.lower.value < 0)) return false;
    if (result.upper !== null && (!validBound(result.upper, ['<', '<='], false) || result.upper.value < 0)) return false;
    if (result.lower && result.upper && (result.lower.value > result.upper.value || result.lower.value === result.upper.value && (result.lower.operator === '>' || result.upper.operator === '<'))) return false;
    if (result.status !== 'unavailable' && (!contains(result.unit, ['IU/L', 'mIU/mL']) || !result.lower && !result.upper)) return false;
    return true;
  }
  function validComparison(value) {
    return required(value, ['status', 'reasonCodes']) && Array.isArray(value.reasonCodes) && contains(value.status, ['unavailable', 'indeterminate', 'within', 'below', 'above']) &&
      (value.status === 'unavailable' ? value.range == null : validRange(value.range));
  }
  function validDayInterval(value, withSource) {
    return required(value, withSource ? ['lower', 'upper', 'source'] : ['lower', 'upper']) &&
      Number.isSafeInteger(value.lower) && Number.isSafeInteger(value.upper) && value.lower >= 0 && value.upper >= value.lower &&
      (!withSource || typeof value.source === 'string' && !!value.source.trim() && value.source.length <= 80 &&
        (value.source.trim() !== 'main-calendar-dates' || value.lower === Math.max(0, value.upper - 1)));
  }
  function sameDayInterval(a, b) {
    return a === null && b === null || record(a) && record(b) && a.lower === b.lower && a.upper === b.upper && a.source === b.source;
  }
  function validNeonatalAge(evaluation) {
    var supplied = evaluation.input.neonatalAge, result = evaluation.neonatalAge, provenance = evaluation.provenance;
    var hasInput = own(evaluation.input, 'neonatalAge'), hasOutput = own(evaluation, 'neonatalAge');
    var hasPolicy = own(provenance, 'eligibilityPolicyId') || own(provenance, 'eligibilityPolicyVersion');
    var comparisons = [evaluation.biochemical.byAge, evaluation.biochemical.byStage];
    if (evaluation.referencePreview) comparisons.push(evaluation.referencePreview.byAge, evaluation.referencePreview.byStage);
    var hasPretermRange = comparisons.some(function (comparison) { return comparison && comparison.range &&
      (comparison.range.basis === 'preterm' || comparison.range.age && comparison.range.age.axis === 'postmenstrualDays'); });
    if (hasPretermRange && (!hasInput || !hasOutput || !hasPolicy)) return false;
    if (hasPolicy && (!required(provenance, ['eligibilityPolicyId', 'eligibilityPolicyVersion']) ||
      !provenance.eligibilityPolicyId || !provenance.eligibilityPolicyVersion || !hasOutput)) return false;
    if (!hasInput && !hasOutput) return true;
    if (!hasOutput || !required(result, Object.keys(neonatalAge)) || !contains(result.status, ['known', 'missing', 'invalid', 'uncertain']) || !Array.isArray(result.reasonCodes)) return false;
    if (hasInput && !required(supplied, Object.keys(neonatalAgeInput))) return false;
    if (!['postnatalDays', 'gestationalDays'].every(function (key) {
      return (result[key] === null || validDayInterval(result[key], true)) && (!hasInput || sameDayInterval(supplied[key], result[key]));
    })) return false;
    var pna = result.postnatalDays, ga = result.gestationalDays, pma = result.postmenstrualDays;
    if (pma !== null && (!validDayInterval(pma, false) || !pna || !ga || pma.lower !== pna.lower + ga.lower || pma.upper !== pna.upper + ga.upper)) return false;
    if (contains(result.status, ['known', 'uncertain']) && (!pna || !ga || !pma)) return false;
    if (result.status === 'missing' && pna && ga || result.status !== 'known' && !result.reasonCodes.length) return false;
    return comparisons.every(function (comparison) {
      var range = comparison && comparison.range;
      return !range || range.basis !== 'preterm' && (!range.age || range.age.axis !== 'postmenstrualDays') ||
        hasPolicy && hasInput && result.status === 'known' && result.reasonCodes.length === 0 && range.basis === 'preterm' && range.age && range.age.axis === 'postmenstrualDays' && !range.stage;
    });
  }
  function validReferencePreview(evaluation) {
    if (!own(evaluation, 'referencePreview')) return true;
    var preview = evaluation.referencePreview, supplied = evaluation.input, biochemical = evaluation.biochemical;
    if (!required(preview, Object.keys(evaluationSchema.referencePreview)) || preview.kind !== 'conditional-basal-untreated' || !Array.isArray(preview.reasonCodes)) return false;
    if (evaluation.measurement.status !== 'valid' || evaluation.ageAtSample.status !== 'known' || !contains(supplied.sex, ['M', 'F']) || supplied.specimen !== 'serum' || !contains(supplied.measurementKind, ['unknown', 'basal'])) return false;
    var treatment = supplied.treatment, assay = supplied.assay;
    if (!contains(treatment.gnrha, ['no', 'unknown']) || !contains(treatment.sexSteroids, ['no', 'unknown']) || treatment.context === 'hormonal') return false;
    var expected = [];
    if (supplied.measurementKind === 'unknown') expected.push('non_basal_or_unknown_measurement');
    if (!(treatment.gnrha === 'no' && treatment.sexSteroids === 'no' && (!own(treatment, 'context') || treatment.context === 'none'))) expected.push('treatment_context_unknown');
    if (!expected.length || expected.length !== preview.reasonCodes.length || !expected.every(function (code) { return preview.reasonCodes.indexOf(code) !== -1; })) return false;
    if (biochemical.status !== 'unavailable' || biochemical.primary !== null || !['byAge', 'byStage', 'local'].every(function (key) { return biochemical[key].status === 'unavailable'; })) return false;
    if (!expected.every(function (code) { return biochemical.reasonCodes.indexOf(code) !== -1; })) return false;
    if (!biochemical.reasonCodes.every(function (code) { return contains(code, ['non_basal_or_unknown_measurement', 'treatment_context_unknown', 'profile_measurement_kind_mismatch']); })) return false;
    if (!assay.profileId || !assay.methodId || !contains(assay.confirmation, ['reported', 'configured']) || assay.confirmation === 'configured' && !assay.profileVersion) return false;
    if (!['byAge', 'byStage'].every(function (key) {
      var item = preview[key];
      if (!required(item, ['range']) || !validComparison(item)) return false;
      if (item.status === 'unavailable') return true;
      var range = item.range;
      var bounds = range.bounds;
      if (bounds.lower && bounds.lower.value < 0 || bounds.upper && bounds.upper.value < 0) return false;
      if (bounds.lower && bounds.upper && (bounds.lower.value > bounds.upper.value || bounds.lower.value === bounds.upper.value && (bounds.lower.operator === '>' || bounds.upper.operator === '<'))) return false;
      if (bounds.censoredLower && (bounds.lower || bounds.censoredLower.value !== null && bounds.censoredLower.value <= 0)) return false;
      return range.profileId === assay.profileId && range.method.id === assay.methodId && range.material === supplied.specimen && range.sex === supplied.sex && range.unit === 'IU/L' &&
        range.profileId === evaluation.provenance.profileId && range.profileVersion === evaluation.provenance.profileVersion &&
        (assay.confirmation !== 'configured' || range.profileVersion === assay.profileVersion) &&
        (key === 'byAge' ? !range.stage : record(range.stage) && range.stage.kind === supplied.puberty.kind && range.stage.value === supplied.puberty.stage);
    })) return false;
    return preview.byAge.status !== 'unavailable' || preview.byStage.status !== 'unavailable';
  }
  function validEvaluation(value) {
    if (!required(value, Object.keys(evaluationSchema).filter(function (key) { return !contains(key, ['reportedRange', 'referencePreview', 'neonatalAge']); })) || value.schemaVersion !== 1 || !value.engineVersion || !contains(value.analyte, ['lh', 'fsh'])) return false;
    if (!required(value.input, Object.keys(input).filter(function (key) { return !contains(key, optionalInput); })) || value.input.analyte !== value.analyte) return false;
    if (!['assay', 'puberty', 'testicularVolume', 'onset', 'history', 'treatment'].every(function (key) {
      return required(value.input[key], Object.keys(input[key]).filter(function (field) { return !contains(field, optionalNestedInput[key] || []); }));
    })) return false;
    if (own(value.input, 'contextBasis') && !contains(value.input.contextBasis, ['current-patient', 'sample'])) return false;
    if (own(value.input.assay, 'profileVersion') && (typeof value.input.assay.profileVersion !== 'string' || value.input.assay.profileVersion.length > 80)) return false;
    if (!['puberty', 'testicularVolume'].every(function (key) { return !own(value.input[key], 'appliesToCurrentContext') || typeof value.input[key].appliesToCurrentContext === 'boolean'; })) return false;
    if (own(value.input.treatment, 'context') && !contains(value.input.treatment.context, ['unknown', 'none', 'hormonal'])) return false;
    if (!validReportedRange(value)) return false;
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
    if (!['byAge', 'byStage', 'local'].every(function (key) { return validComparison(b[key]); })) return false;
    if (b.primary && b[({ age: 'byAge', stage: 'byStage', local: 'local' })[b.primary]].status === 'unavailable') return false;
    if (!validReferencePreview(value) || !validNeonatalAge(value)) return false;
    return required(c, Object.keys(evaluationSchema.clinical)) && contains(c.status, ['limited', 'warning', 'notice', 'out_of_scope', 'no_timing_alert']) &&
      Array.isArray(c.reasonCodes) && Array.isArray(c.sourceIds) &&
      required(value.summary, Object.keys(evaluationSchema.summary)) && contains(value.summary.status, ['attention', 'limited', 'compared', 'invalid', 'out_of_scope']) &&
      required(value.provenance, Object.keys(evaluationSchema.provenance).filter(function (key) { return !contains(key, ['eligibilityPolicyId', 'eligibilityPolicyVersion']); })) && Array.isArray(value.provenance.sourceIds) && Array.isArray(value.limitations);
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
  return Object.freeze({ version: '1.3.0', create: create, normalize: normalize, reconcile: reconcile, forSeries: forSeries });
});
