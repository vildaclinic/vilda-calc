/* Total testosterone source comparisons. Clinical rows and eligibility are
 * supplied as versioned data; units have a separate immutable registry.
 * No DOM, storage, network, clock, diagnosis or adult reference fallback.
 */
(function (root, factory) {
  'use strict';
  var common = typeof module === 'object' && module.exports;
  var api = factory(common ? require('./vilda_lab_puberty.js') : root && root.VildaLabPuberty,
    common ? require('./vilda_lab_testosterone_units.js') : root && root.VildaLabTestosteroneUnits);
  if (common) module.exports = api;
  if (root) root.VildaLabTestosterone = api;
})(typeof window !== 'undefined' ? window : null, function (core, units) {
  'use strict';
  if (!core || typeof core.resolveAge !== 'function' || !units || !units.factorToCanonical) {
    throw new Error('Testosterone requires generic age utilities and its unit registry.');
  }
  var VERSION = '1.0.0';
  var own = function (o, key) { return o != null && Object.prototype.hasOwnProperty.call(o, key); };
  function record(o) { return o !== null && typeof o === 'object' && !Array.isArray(o); }
  function finite(n) { return typeof n === 'number' && Number.isFinite(n); }
  function text(s, max) { return typeof s === 'string' ? s.trim().slice(0, max || 160) : ''; }
  function named(value) { return typeof value === 'string' && !!value.trim(); }
  function copy(o) { return o == null ? null : JSON.parse(JSON.stringify(o)); }
  function unique(a) { return Array.from(new Set(a)); }
  function flag(v) { return v === true || v === 'yes' ? 'yes' : v === false || v === 'no' ? 'no' : 'unknown'; }
  function operator(v) { return ({ '≤': '<=', '≥': '>=' })[v] || v; }
  function factor(unit) { return own(units.factorToCanonical, unit) ? units.factorToCanonical[unit] : null; }
  function conversion(unit) {
    return { conversionPolicyId: units.id, conversionPolicyVersion: units.version, conversionFactor: factor(unit) };
  }
  function invalidMeasurement(raw, sourceUnit, reason) {
    return Object.assign({ status: 'invalid', raw: raw, operator: null, value: null, unit: null,
      sourceValue: null, sourceUnit: sourceUnit, isExact: false, plotValue: null,
      limitKind: null, reasonCodes: [reason] }, conversion(sourceUnit));
  }
  function parseMeasurement(rawValue, unit) {
    var sourceUnit = text(unit, 24);
    var raw = typeof rawValue === 'string' ? text(rawValue, 96) : finite(rawValue) ? String(rawValue) : '';
    var op, value = null, limitKind = null, ratio = factor(sourceUnit);
    if (!finite(ratio) || ratio <= 0) return invalidMeasurement(raw, sourceUnit, 'unsupported_unit');
    if (typeof rawValue === 'string' && rawValue.trim().length > 96) return invalidMeasurement(raw, sourceUnit, 'invalid_measurement');
    if (record(rawValue)) {
      op = operator(own(rawValue, 'operator') ? rawValue.operator : '='); value = rawValue.value;
      if (!['=', '<', '<=', '>', '>='].includes(op) || !finite(value)) return invalidMeasurement(raw, sourceUnit, 'invalid_measurement');
      raw = (op === '=' ? '' : op) + String(value);
    } else {
      var censored = raw.match(/^(<=|<|≤)\s*(LOD|LOQ)$/i);
      if (censored) { op = operator(censored[1]); limitKind = censored[2].toUpperCase(); }
      else {
        // Match the existing converter's Number syntax, including decimal comma,
        // grouped spaces, leading plus and exponent, while retaining the report.
        var parsed = raw.match(/^(<=|>=|<|>|=|≤|≥)?\s*(.*?)$/);
        if (!parsed) return invalidMeasurement(raw, sourceUnit, 'invalid_measurement');
        op = operator(parsed[1] || '=');
        var numberText = parsed[2].replace(/[\s\u00a0]/g, '').replace(',', '.');
        if (!numberText) return invalidMeasurement(raw, sourceUnit, 'invalid_measurement');
        value = Number(numberText);
      }
    }
    if (value !== null && (!finite(value) || value < 0 || op === '<' && value === 0 || !finite(value * ratio))) {
      return invalidMeasurement(raw, sourceUnit, 'invalid_measurement');
    }
    var canonical = value === null ? null : value * ratio;
    return Object.assign({ status: 'valid', raw: raw, operator: op, value: canonical, unit: units.canonicalUnit,
      sourceValue: value, sourceUnit: sourceUnit, isExact: op === '=' && value !== null,
      plotValue: op === '=' ? canonical : null, limitKind: limitKind,
      reasonCodes: limitKind ? ['unquantified_detection_limit'] : [] }, conversion(sourceUnit));
  }
  function convertMeasurement(raw, from, to) {
    var measurement = parseMeasurement(raw, from), target = text(to, 24), ratio = factor(target);
    if (measurement.status !== 'valid') return measurement;
    if (!finite(ratio) || ratio <= 0) return invalidMeasurement(measurement.raw, measurement.sourceUnit, 'unsupported_target_unit');
    var value = measurement.value === null ? null : measurement.value / ratio;
    if (value !== null && !finite(value)) return invalidMeasurement(measurement.raw, measurement.sourceUnit, 'invalid_measurement');
    return Object.assign({}, measurement, { canonicalValue: measurement.value, canonicalUnit: measurement.unit,
      value: value, unit: target, plotValue: measurement.isExact ? value : null });
  }
  function normalizedAge(age) {
    return record(age) ? { years: finite(age.years) ? age.years : null, months: finite(age.months) ? age.months : null,
      days: finite(age.days) ? age.days : null, precision: text(age.precision, 16) } : null;
  }
  function validCalendarPolicy(policy) {
    return record(policy) && finite(policy.minYearDays) && finite(policy.maxYearDays) && policy.minYearDays > 0 &&
      policy.maxYearDays >= policy.minYearDays && Array.isArray(policy.minMonthSpanDays) && Array.isArray(policy.maxMonthSpanDays) &&
      policy.minMonthSpanDays.length === 12 && policy.maxMonthSpanDays.length === 12 &&
      policy.minMonthSpanDays[0] === 0 && policy.maxMonthSpanDays[0] === 0 &&
      policy.minMonthSpanDays.every(function (min, index) {
        var max = policy.maxMonthSpanDays[index];
        return finite(min) && finite(max) && max >= min && max < policy.maxYearDays && min < policy.minYearDays &&
          (!index || min > policy.minMonthSpanDays[index - 1] && max > policy.maxMonthSpanDays[index - 1]);
      });
  }
  function resolveAge(input, data) {
    var age = core.resolveAge(input);
    if (age.source !== 'neonatal-days') return age;
    var policy = data && data.automaticReferencePolicy && data.automaticReferencePolicy.postnatalCalendarAge;
    if (!validCalendarPolicy(policy)) return { status: 'unknown', precision: null, source: null, lowerYears: null,
      upperYears: null, upperInclusive: false, ageDays: null, reasonCodes: ['postnatal_calendar_age_policy_missing'] };
    var pna = core.resolveNeonatalAge(input).postnatalDays;
    function span(months, maximum) {
      return Math.floor(months / 12) * (maximum ? policy.maxYearDays : policy.minYearDays) +
        (maximum ? policy.maxMonthSpanDays : policy.minMonthSpanDays)[months % 12];
    }
    var lowerMonths = Math.floor(pna.lower / policy.maxYearDays) * 12;
    while (span(lowerMonths + 1, true) <= pna.lower) lowerMonths += 1;
    var upperMonths = Math.floor(pna.upper / policy.minYearDays) * 12;
    while (span(upperMonths, false) <= pna.upper) upperMonths += 1;
    // PNA is elapsed completed days, whereas Mayo uses calendar months/years.
    // Retain every possible completed month without inventing a birth date.
    return Object.assign({}, age, { lowerYears: lowerMonths / 12, upperYears: upperMonths / 12,
      upperInclusive: false, reasonCodes: ['postnatal_age_calendar_month_uncertainty'] });
  }
  function normalizeInput(input, neonatal) {
    var p = record(input.puberty) ? input.puberty : {}, a = record(input.assay) ? input.assay : {}, t = record(input.treatment) ? input.treatment : {};
    var kind = ({ G: 'G', TH: 'Th', B: 'Th', M: 'Th', P: 'P', PH: 'P', AX: 'Ax' })[text(p.kind, 24).toUpperCase()] || 'unspecified';
    var normalized = {
      analyte: text(input.analyte, 24),
      value: record(input.value) ? { operator: operator(own(input.value, 'operator') ? input.value.operator : '='), value: finite(input.value.value) ? input.value.value : null }
        : typeof input.value === 'number' ? finite(input.value) ? input.value : null : text(input.value, 96),
      unit: text(input.unit, 24), sex: ['M', 'F'].includes(input.sex) ? input.sex : null,
      sampleDateISO: text(input.sampleDateISO, 64) || null, birthDateISO: text(input.birthDateISO, 64) || null, age: normalizedAge(input.age),
      contextBasis: input.contextBasis === 'sample' ? 'sample' : 'current-patient', referenceSelection: 'automatic', reproductiveContext: 'unknown',
      specimen: text(input.specimen, 24) || 'unknown', measurementKind: text(input.measurementKind, 40) || 'unknown',
      collectionTime: text(input.collectionTime, 24) || 'unknown',
      assay: { profileId: text(a.profileId, 80), methodId: text(a.methodId, 80), confirmation: text(a.confirmation, 32) || 'unknown' },
      puberty: { kind: kind, stage: Number.isInteger(p.stage) ? p.stage : null, assessedAtISO: text(p.assessedAtISO, 64) || null,
        appliesToSample: p.appliesToSample === true, appliesToCurrentContext: p.appliesToCurrentContext === true, source: text(p.source, 80) || 'provided' },
      testicularVolume: { value: null, unit: '', method: '', assessedAtISO: null, appliesToSample: false },
      onset: { kind: 'unspecified', dateISO: null, age: null, confirmedPubertalOnset: false },
      history: { progression: 'unknown', growthAcceleration: 'unknown', cnsSymptoms: 'unknown', regression: 'unknown' },
      treatment: { gnrha: flag(t.gnrha), sexSteroids: flag(t.sexSteroids), context: ['none', 'hormonal'].includes(t.context) ? t.context : 'unknown' },
      preterm: flag(input.preterm), gestationalAgeWeeks: finite(input.gestationalAgeWeeks) ? input.gestationalAgeWeeks : null, localReference: null
    };
    if (own(a, 'profileVersion')) normalized.assay.profileVersion = text(a.profileVersion, 80);
    if (own(input, 'neonatalAge')) normalized.neonatalAge = { postnatalDays: copy(neonatal.postnatalDays), gestationalDays: copy(neonatal.gestationalDays) };
    return normalized;
  }
  function boundsInterval(bounds) {
    if (!record(bounds) || !bounds.lower && !bounds.upper) return null;
    var l = bounds.lower, u = bounds.upper;
    if (l && (!finite(l.value) || !['>', '>='].includes(l.operator))) return null;
    if (u && (!finite(u.value) || !['<', '<='].includes(u.operator))) return null;
    var result = { lo: l ? l.value : -Infinity, hi: u ? u.value : Infinity, li: !!l && l.operator === '>=', ui: !!u && u.operator === '<=' };
    return result.lo < result.hi || result.lo === result.hi && result.li && result.ui ? result : null;
  }
  function ageBounds(bounds) { return record(bounds) && bounds.axis === 'chronologicalYears' ? boundsInterval(bounds) : null; }
  function contains(a, b) {
    return a && b && (b.lo > a.lo || b.lo === a.lo && (!b.li || a.li)) && (b.hi < a.hi || b.hi === a.hi && (!b.ui || a.ui));
  }
  function intersects(a, b) {
    return a && b && (a.hi > b.lo && b.hi > a.lo || a.hi === b.lo && a.ui && b.li || b.hi === a.lo && b.ui && a.li);
  }
  function ageInterval(age) { return { lo: age.lowerYears, hi: age.upperYears, li: true, ui: age.upperInclusive }; }
  function unavailable(reason) { return { status: 'unavailable', reasonCodes: unique(Array.isArray(reason) ? reason : [reason]), range: null }; }
  // Roundoff tolerance is confined to comparing quantities, never source data,
  // age boundaries, saved values or display rounding.
  function compare(a, b) {
    if (a === b) return 0;
    if (finite(a) && finite(b) && Math.abs(a - b) <= 8 * Number.EPSILON * Math.max(Math.abs(a), Math.abs(b))) return 0;
    return a < b ? -1 : 1;
  }
  function compareMeasurement(measurement, bounds) {
    var reference = boundsInterval(bounds), censored = bounds && bounds.censoredLower;
    if (!reference || censored && bounds.lower || bounds.lower && bounds.lower.value < 0 || bounds.upper && bounds.upper.value < 0 ||
      censored && (!['<', '<='].includes(censored.operator) || !finite(censored.value) || censored.value <= 0)) return unavailable('invalid_reference_range');
    if (measurement.value === null) return { status: 'indeterminate', reasonCodes: ['unquantified_detection_limit'] };
    var value = measurement.value, op = measurement.operator;
    var q = op === '=' ? { lo: value, hi: value, li: true, ui: true }
      : op === '<' || op === '<=' ? { lo: 0, hi: value, li: true, ui: op === '<=' }
        : { lo: value, hi: Infinity, li: op === '>=', ui: false };
    var bottom = compare(q.hi, reference.lo), top = compare(q.lo, reference.hi);
    if (bottom < 0 || bottom === 0 && (!q.ui || !reference.li)) return { status: 'below', reasonCodes: [] };
    if (top > 0 || top === 0 && (!q.li || !reference.ui)) return { status: 'above', reasonCodes: censored ? ['censored_reference_lower_limit'] : [] };
    var low = compare(q.lo, reference.lo), high = compare(q.hi, reference.hi);
    var within = (low > 0 || low === 0 && (!q.li || reference.li)) && (high < 0 || high === 0 && (!q.ui || reference.ui));
    // An unspecified source minimum <7 is not a zero or a detection limit.
    // Values possibly below 7 cannot be declared within or below that interval.
    if (censored && compare(q.lo, censored.value) < 0) return { status: 'indeterminate',
      reasonCodes: ['censored_reference_lower_limit', 'censored_reference_lower_bound_indeterminate'] };
    return { status: within ? 'within' : 'indeterminate', reasonCodes: unique((censored ? ['censored_reference_lower_limit'] : [])
      .concat(within ? [] : ['censored_result_crosses_reference_boundary'])) };
  }
  function validProfile(profile, data) {
    var source = profile && data.sources && data.sources[profile.sourceId];
    return record(profile) && named(profile.id) && named(profile.version) && profile.analyte === 'testosterone_total' &&
      named(profile.sourceId) && record(source) && source.id === profile.sourceId && (named(source.label) || named(source.title)) &&
      (!own(source, 'version') || named(source.version)) && record(profile.method) && named(profile.method.id) &&
      record(profile.population) && named(profile.population.label) && profile.material === 'serum' && factor(profile.unit) &&
      record(profile.scope) && profile.scope.sex && ageBounds(profile.scope.age) && Array.isArray(profile.rows) &&
      Array.isArray(profile.compatibleMethodIds) && Array.isArray(profile.unsupportedMethodIds) && Array.isArray(profile.specimenAliases);
  }
  function selectedComparison(measurement, row, profile, data) {
    var sourceBounds = row.bounds, ratio = factor(profile.unit);
    if (!record(sourceBounds) || ['lower', 'upper', 'censoredLower'].some(function (key) {
      return sourceBounds[key] != null && (!record(sourceBounds[key]) || !finite(sourceBounds[key].value));
    })) return unavailable('invalid_reference_range');
    var bounds = { lower: null, upper: null, censoredLower: null, sourceText: text(sourceBounds.sourceText, 600) };
    ['lower', 'upper', 'censoredLower'].forEach(function (key) {
      if (sourceBounds[key] != null) bounds[key] = { operator: operator(sourceBounds[key].operator), value: sourceBounds[key].value * ratio };
    });
    var compared = compareMeasurement(measurement, bounds);
    if (compared.status === 'unavailable') return compared;
    return { status: compared.status, reasonCodes: compared.reasonCodes, range: {
      id: row.id, profileId: profile.id, profileVersion: profile.version, dataVersion: data.dataVersion,
      sourceId: profile.sourceId, source: Object.assign({ id: profile.sourceId }, copy(data.sources[profile.sourceId])),
      method: copy(profile.method), material: profile.material, unit: units.canonicalUnit, population: copy(profile.population), sex: row.sex,
      age: copy(row.age || (row.stage ? data.automaticReferencePolicy.stageAge : profile.scope.age)), stage: copy(row.stage), bounds: bounds, basis: row.basis || (row.stage ? 'stage' : 'age')
    } };
  }
  function stageReasons(input, policy, requestedAge) {
    var p = input.puberty, codes = [], kind = policy && policy.stageKindBySex && policy.stageKindBySex[input.sex];
    if (!Number.isInteger(p.stage) || p.stage < 1 || p.stage > 5) codes.push('missing_puberty_stage');
    if (!kind || p.kind !== kind) codes.push(p.kind === 'unspecified' ? 'ambiguous_puberty_kind' : 'puberty_kind_sex_mismatch');
    if (!contains(ageBounds(policy && policy.stageAge), requestedAge)) codes.push('stage_age_outside_reference');
    if (p.assessedAtISO && core.resolveAge({ birthDateISO: p.assessedAtISO, sampleDateISO: p.assessedAtISO }).status !== 'known') codes.push('invalid_puberty_observation_date');
    var current = input.contextBasis === 'current-patient' && !input.sampleDateISO && p.appliesToCurrentContext;
    var dated = input.sampleDateISO && p.assessedAtISO === input.sampleDateISO;
    var later = input.sampleDateISO && p.assessedAtISO && p.assessedAtISO > input.sampleDateISO;
    if (!current && !dated && !(input.contextBasis === 'sample' && p.appliesToSample && !later)) codes.push('puberty_not_confirmed_at_sample');
    return unique(codes);
  }
  function contextGates(raw, input, neonatal, age, policy, reasons, data) {
    var gates = [], t = input.treatment;
    if (['specimen', 'measurementKind', 'collectionTime'].some(function (key) {
      return own(raw, key) && raw[key] != null && typeof raw[key] !== 'string';
    }) || own(raw, 'contextBasis') && !['sample', 'current-patient', null, ''].includes(raw.contextBasis)) gates.push('invalid_measurement_context');
    if (input.specimen === 'unknown') reasons.push('specimen_unconfirmed');
    if (input.measurementKind === 'unknown') reasons.push('non_basal_or_unknown_measurement');
    else if (input.measurementKind !== 'basal') gates.push('non_basal_or_unknown_measurement');
    if (own(raw, 'assay') && !record(raw.assay) || record(raw.assay) && ['confirmation', 'methodId', 'profileId', 'profileVersion'].some(function (key) {
      return own(raw.assay, key) && raw.assay[key] != null && typeof raw.assay[key] !== 'string';
    }) || !['unknown', 'configured', 'reported'].includes(input.assay.confirmation)) gates.push('method_not_confirmed');
    else if (input.assay.confirmation !== 'reported' || !input.assay.methodId) reasons.push('source_method_unconfirmed');
    if (own(raw, 'treatment') && !record(raw.treatment) || record(raw.treatment) && own(raw.treatment, 'context') &&
      !['none', 'unknown', 'hormonal', null, ''].includes(raw.treatment.context) || record(raw.treatment) && ['gnrha', 'sexSteroids'].some(function (key) {
      return own(raw.treatment, key) && ![true, false, 'yes', 'no', 'unknown', null, ''].includes(raw.treatment[key]);
    })) gates.push('invalid_treatment_context');
    if (t.context === 'hormonal' || t.gnrha === 'yes' || t.sexSteroids === 'yes') gates.push('treatment_requires_separate_profile');
    else if (!(t.context === 'none' && t.gnrha === 'no' && t.sexSteroids === 'no')) reasons.push('treatment_context_unknown');
    if (!policy.allowedCollectionTimes.includes(input.collectionTime)) gates.push('invalid_collection_time');
    else if (policy.unsupportedCollectionTimes.includes(input.collectionTime)) gates.push('collection_time_outside_reference');
    else if (input.collectionTime === 'unknown') reasons.push('collection_time_unknown');
    if (neonatal.status === 'invalid') gates.push('invalid_neonatal_age');
    var ga = neonatal.gestationalDays, weeks = input.gestationalAgeWeeks;
    if (own(raw, 'gestationalAgeWeeks') && raw.gestationalAgeWeeks != null && raw.gestationalAgeWeeks !== '' &&
      (!finite(raw.gestationalAgeWeeks) || raw.gestationalAgeWeeks < 0 || !finite(raw.gestationalAgeWeeks * 7)) ||
      own(raw, 'preterm') && ![true, false, 'yes', 'no', 'unknown', null, ''].includes(raw.preterm)) gates.push('invalid_neonatal_age');
    if (weeks !== null && ga && (ga.upper < Math.floor(weeks * 7) || ga.lower > (Number.isInteger(weeks) ? weeks * 7 + 6 : Math.ceil(weeks * 7)))) gates.push('preterm_context_conflict');
    var knownPreterm = input.preterm === 'yes' || ga && ga.upper < policy.pretermGestationalDaysUpperExclusive ||
      weeks !== null && weeks * 7 < policy.pretermGestationalDaysUpperExclusive;
    if (knownPreterm && input.preterm === 'no') gates.push('preterm_context_conflict');
    if (policy.blockKnownPretermInInfancy && knownPreterm && intersects(ageBounds(policy.infantAge), ageInterval(age))) gates.push('preterm_reference_not_established');
    if (neonatal.postnatalDays && age.status === 'known' && age.source !== 'neonatal-days') {
      var pna = neonatal.postnatalDays, dayAge = resolveAge({ neonatalAge: { postnatalDays: pna } }, data);
      if (!(age.source === 'dates' ? pna.upper >= Math.max(0, age.ageDays - 1) && pna.lower <= age.ageDays
        : intersects(ageInterval(age), ageInterval(dayAge)))) gates.push('neonatal_age_context_mismatch');
    }
    return gates;
  }
  function evaluate(rawInput, data) {
    var raw = record(rawInput) ? rawInput : {}; data = record(data) ? data : {};
    var neonatal = core.resolveNeonatalAge(raw), input = normalizeInput(raw, neonatal);
    // Aliases describe the same known specimen; save its canonical schema value.
    // Do not infer a specimen when it was not supplied.
    if (input.specimen !== 'unknown' && Array.isArray(data.profiles) && data.profiles.some(function (profile) {
      return validProfile(profile, data) && profile.scope.sex === input.sex && profile.specimenAliases.includes(input.specimen.toLowerCase());
    })) input.specimen = 'serum';
    var measurement = parseMeasurement(raw.value, raw.unit), age = resolveAge(raw, data), requested = ageInterval(age);
    var policy = data.automaticReferencePolicy, reasons = [], gates = [];
    var validPolicy = record(policy) && named(policy.id) && named(policy.version) && Array.isArray(policy.profileIds) && policy.profileIds.length &&
      policy.profileIds.every(named) && unique(policy.profileIds).length === policy.profileIds.length && Array.isArray(data.profiles) && named(data.dataVersion) &&
      ageBounds(policy.stageAge) && ageBounds(policy.infantAge) && ageBounds(policy.adultAge) &&
      record(policy.stageKindBySex) && Array.isArray(policy.allowedCollectionTimes) && Array.isArray(policy.unsupportedCollectionTimes) &&
      finite(policy.pretermGestationalDaysUpperExclusive) && typeof policy.blockKnownPretermInInfancy === 'boolean' &&
      policy.unknownContextComparison === 'orientative-source-reference' && policy.confirmedBiochemicalAssessment === false &&
      policy.knownTherapyRequiresSeparateProfile === true && policy.knownStimulationRequiresSeparateProfile === true;
    if (input.analyte !== 'testosterone_total') gates.push('unsupported_analyte');
    if (measurement.status !== 'valid') gates.push('invalid_measurement');
    if (age.status !== 'known') gates.push.apply(gates, age.reasonCodes);
    if (!input.sex) gates.push('missing_sex');
    if (!validPolicy) gates.push('automatic_reference_policy_missing');
    else gates.push.apply(gates, contextGates(raw, input, neonatal, age, policy, reasons, data));
    var byAge = unavailable('no_matching_reference_range'), byStage = unavailable('stage_reference_not_established');
    var ageCandidates = [], stageCandidates = [], relevant = [], stageCodes = validPolicy ? stageReasons(input, policy, requested) : [];
    if (!gates.length) {
      policy.profileIds.forEach(function (id) {
        var profile = data.profiles.find(function (item) { return item && item.id === id; });
        if (!validProfile(profile, data)) { gates.push('invalid_reference_profile'); return; }
        if (profile.scope.sex !== input.sex) return;
        relevant.push(profile);
        if (profile.active !== true) { gates.push('profile_not_active'); return; }
        if (input.specimen !== 'unknown' && !profile.specimenAliases.includes(input.specimen.toLowerCase())) { gates.push('unsupported_or_unknown_specimen'); return; }
        if (profile.unsupportedMethodIds.includes(input.assay.methodId) || input.assay.confirmation === 'reported' &&
          (!input.assay.methodId || !profile.compatibleMethodIds.includes(input.assay.methodId))) { gates.push('method_not_confirmed'); return; }
        var scope = ageBounds(profile.scope.age);
        if (!contains(scope, requested)) { byAge = unavailable('age_precision_crosses_scope'); return; }
        profile.rows.forEach(function (row) {
          if (!record(row) || row.sex !== input.sex) return;
          var rowAge = row.age || (row.stage ? policy.stageAge : profile.scope.age), interval = ageBounds(rowAge);
          if (!named(row.id) || !interval || !record(row.bounds) || !contains(scope, interval)) { gates.push('invalid_reference_profile'); return; }
          if (!intersects(interval, requested)) return;
          var compared = selectedComparison(measurement, row, profile, data);
          if (compared.status === 'unavailable') { gates.push.apply(gates, compared.reasonCodes); return; }
          var candidate = { row: row, interval: interval, comparison: compared };
          if (!row.stage) ageCandidates.push(candidate);
          else if (!stageCodes.length && row.stage.kind === input.puberty.kind && row.stage.value === input.puberty.stage && contains(interval, requested)) stageCandidates.push(candidate);
        });
      });
      if (!relevant.length) gates.push('unsupported_sex');
      if (ageCandidates.length === 1 && contains(ageCandidates[0].interval, requested)) byAge = ageCandidates[0].comparison;
      else if (ageCandidates.length) byAge = unavailable('age_precision_crosses_reference_boundary');
      if (stageCandidates.length === 1) byStage = stageCandidates[0].comparison;
      else if (stageCodes.length) byStage = unavailable(stageCodes);
      else if (stageCandidates.length > 1) byStage = unavailable('ambiguous_stage_reference');
    }
    if (gates.length) { byAge = unavailable(gates); byStage = unavailable(gates); }
    var available = byAge.status !== 'unavailable' || byStage.status !== 'unavailable';
    var comparisons = [byAge, byStage], ranges = comparisons.filter(function (c) { return c.range; }).map(function (c) { return c.range; });
    var ids = unique(ranges.map(function (range) { return range.profileId; }));
    var selectedReasons = available ? unique(reasons) : unique(gates.concat(byAge.reasonCodes, byStage.reasonCodes));
    var adult = validPolicy && age.status === 'known' && contains(ageBounds(policy.adultAge), requested) && input.sex === 'M';
    var guidance = adult && data.clinicalGuidance && data.clinicalGuidance.adult;
    var result = {
      schemaVersion: 1, engineVersion: VERSION, dataVersion: data.dataVersion || null, analyte: input.analyte,
      input: copy(input), measurement: measurement, ageAtSample: age,
      biochemical: { status: 'unavailable', primary: null, byAge: unavailable('automatic_reference_only'), byStage: unavailable('automatic_reference_only'),
        local: unavailable('no_local_reference'), reasonCodes: unique(['automatic_reference_only'].concat(gates, reasons)) },
      clinical: { status: 'limited', code: 'reference_comparison_only', title: guidance && guidance.title || 'Porównanie ze źródłem',
        text: guidance && guidance.shortText || '', reasonCodes: [], sourceIds: guidance && Array.isArray(guidance.sourceIds) ? guidance.sourceIds.slice() : [] },
      summary: { status: measurement.status === 'invalid' ? 'invalid' : 'limited',
        code: measurement.status === 'invalid' ? 'invalid_measurement' : available ? 'automatic_reference_comparison' : 'limited_interpretation',
        title: measurement.status === 'invalid' ? 'Nieprawidłowy zapis wyniku lub jednostki' : available ? 'Orientacyjne porównanie ze źródłem' : 'Brak zakresu dla podanych danych' },
      referenceSelection: { mode: 'automatic', status: available ? 'selected' : 'unavailable', profileIds: ids, reasonCodes: selectedReasons },
      provenance: { clinicalProfileId: null, clinicalProfileVersion: null, biochemicalPolicyId: null, biochemicalPolicyVersion: null,
        profileId: ids.length === 1 ? ids[0] : null, profileVersion: ids.length === 1 ? ranges[0].profileVersion : null,
        sourceIds: unique(ranges.map(function (range) { return range.sourceId; }).concat(guidance && Array.isArray(guidance.sourceIds) ? guidance.sourceIds : [])),
        selectionPolicyId: validPolicy ? policy.id : null, selectionPolicyVersion: validPolicy ? policy.version : null },
      limitations: unique(selectedReasons.concat(measurement.reasonCodes, comparisons.flatMap(function (c) { return c.reasonCodes; })))
    };
    if (own(raw, 'neonatalAge')) result.neonatalAge = copy(neonatal);
    if (available) result.referencePreview = { kind: 'automatic-source-reference', reasonCodes: selectedReasons.slice(), byAge: byAge, byStage: byStage,
      applicabilityText: unique(relevant.map(function (p) { return text(p.applicabilityText, 600); }).filter(Boolean)).join(' '),
      censoredLowerNote: text(data.presentationPolicy && data.presentationPolicy.censoredLowerNote, 600),
      censoredLowerIndeterminateNote: text(data.presentationPolicy && data.presentationPolicy.censoredLowerIndeterminateNote, 600) };
    return result;
  }
  return Object.freeze({ version: VERSION, evaluate: evaluate, parseMeasurement: parseMeasurement, convertMeasurement: convertMeasurement,
    resolveAge: resolveAge, resolveNeonatalAge: core.resolveNeonatalAge });
});
