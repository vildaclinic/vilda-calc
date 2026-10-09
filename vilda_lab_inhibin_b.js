/* Inhibin B source-reference comparisons. Reference values and eligibility are
 * supplied as versioned data. No DOM, storage, network, clock or diagnosis.
 * Only generic interval and age utilities are shared with the LH/FSH engine.
 */
(function (root, factory) {
  'use strict';
  var core = typeof module === 'object' && module.exports
    ? require('./vilda_lab_puberty.js') : root && root.VildaLabPuberty;
  var api = factory(core);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VildaLabInhibinB = api;
})(typeof window !== 'undefined' ? window : null, function (core) {
  'use strict';
  if (!core || typeof core.resolveAge !== 'function' || typeof core.compareMeasurement !== 'function') {
    throw new Error('Inhibin B requires the generic age and interval utilities.');
  }
  var VERSION = '1.0.0';
  var own = function (o, key) { return o != null && Object.prototype.hasOwnProperty.call(o, key); };
  function record(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
  function text(value, max) { return typeof value === 'string' ? value.trim().slice(0, max || 160) : ''; }
  function copy(value) { return value == null ? null : JSON.parse(JSON.stringify(value)); }
  function unique(values) { return Array.from(new Set(values)); }
  function flag(value) { return value === true || value === 'yes' ? 'yes' : value === false || value === 'no' ? 'no' : 'unknown'; }
  function operator(value) { return ({ '≤': '<=', '≥': '>=' })[value] || value; }
  function unavailable(reason) { return { status: 'unavailable', reasonCodes: Array.isArray(reason) ? unique(reason) : [reason], range: null }; }
  function invalidMeasurement(raw, unit, reason) {
    return { status: 'invalid', raw: raw, operator: null, value: null, unit: null, sourceValue: null, sourceUnit: unit,
      isExact: false, plotValue: null, limitKind: null, reasonCodes: [reason] };
  }
  function parseMeasurement(rawValue, unit) {
    var sourceUnit = text(unit, 24);
    var raw = typeof rawValue === 'string' ? text(rawValue, 96) : finite(rawValue) ? String(rawValue) : '';
    var op, value = null, limitKind = null;
    if (!['pg/mL', 'ng/L'].includes(sourceUnit)) return invalidMeasurement(raw, sourceUnit, 'unsupported_unit');
    if (record(rawValue)) {
      op = operator(rawValue.operator || '='); value = rawValue.value;
      if (!['=', '<', '<=', '>', '>='].includes(op) || !finite(value)) return invalidMeasurement(raw, sourceUnit, 'invalid_measurement');
      raw = op === '=' ? String(value) : op + String(value);
    } else {
      var censored = raw.match(/^(<=|<|≤)\s*(LOD|LOQ)$/i);
      if (censored) { op = operator(censored[1]); limitKind = censored[2].toUpperCase(); }
      else {
        var parsed = raw.match(/^(<=|>=|<|>|=|≤|≥)?\s*((?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?)$/i);
        if (!parsed) return invalidMeasurement(raw, sourceUnit, 'invalid_measurement');
        op = operator(parsed[1] || '='); value = Number(parsed[2].replace(',', '.'));
      }
    }
    if (value !== null && (!finite(value) || value < 0 || op === '<' && value === 0)) return invalidMeasurement(raw, sourceUnit, 'invalid_measurement');
    return { status: 'valid', raw: raw, operator: op, value: value, unit: 'pg/mL', sourceValue: value, sourceUnit: sourceUnit,
      isExact: op === '=' && value !== null, plotValue: op === '=' ? value : null, limitKind: limitKind,
      reasonCodes: limitKind ? ['unquantified_detection_limit'] : [] };
  }
  function normalizedAge(age) {
    return record(age) ? { years: finite(age.years) ? age.years : null, months: finite(age.months) ? age.months : null,
      days: finite(age.days) ? age.days : null, precision: text(age.precision, 16) } : null;
  }
  function pubertyKind(value) { return ({ TH: 'Th', M: 'Th', B: 'Th', G: 'G', P: 'P', PH: 'P', AX: 'Ax' })[text(value, 24).toUpperCase()] || 'unspecified'; }
  function normalizeInput(input, neonatal) {
    var p = input.puberty || {}, a = input.assay || {}, t = input.treatment || {};
    var normalized = {
      analyte: text(input.analyte, 24),
      value: record(input.value) ? { operator: operator(input.value.operator || '='), value: finite(input.value.value) ? input.value.value : null }
        : typeof input.value === 'number' ? finite(input.value) ? input.value : null : text(input.value, 96),
      unit: text(input.unit, 24), sex: ['M', 'F'].includes(input.sex) ? input.sex : null,
      sampleDateISO: text(input.sampleDateISO, 64) || null, birthDateISO: text(input.birthDateISO, 64) || null, age: normalizedAge(input.age),
      contextBasis: input.contextBasis === 'sample' ? 'sample' : 'current-patient', referenceSelection: 'automatic',
      reproductiveContext: text(input.reproductiveContext, 40) || 'unknown',
      specimen: text(input.specimen, 24) || 'unknown', measurementKind: text(input.measurementKind, 24) || 'unknown',
      assay: { profileId: text(a.profileId, 80), methodId: text(a.methodId, 80), confirmation: text(a.confirmation, 32) || 'unknown' },
      puberty: { kind: pubertyKind(p.kind), stage: Number.isInteger(p.stage) ? p.stage : null,
        assessedAtISO: text(p.assessedAtISO, 64) || null, appliesToSample: p.appliesToSample === true,
        appliesToCurrentContext: p.appliesToCurrentContext === true, source: text(p.source, 80) || 'provided' },
      // Neutral transport fields keep the existing historical envelope shape;
      // the inhibin engine never turns these into LH/FSH timing diagnostics.
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
  function intersects(a, b) {
    return a.hi > b.lo && b.hi > a.lo || a.hi === b.lo && a.ui && b.li || b.hi === a.lo && b.ui && a.li;
  }
  function contains(a, b) {
    return (b.lo > a.lo || b.lo === a.lo && (!b.li || a.li)) && (b.hi < a.hi || b.hi === a.hi && (!b.ui || a.ui));
  }
  function intersect(a, b) {
    if (!a || !b || !intersects(a, b)) return null;
    return { lo: Math.max(a.lo, b.lo), hi: Math.min(a.hi, b.hi),
      li: a.lo === b.lo ? a.li && b.li : a.lo > b.lo ? a.li : b.li,
      ui: a.hi === b.hi ? a.ui && b.ui : a.hi < b.hi ? a.ui : b.ui };
  }
  function covers(intervals, requested) {
    var ordered = intervals.filter(Boolean).slice().sort(function (a, b) { return a.lo - b.lo || Number(b.li) - Number(a.li); });
    var merged = null;
    for (var i = 0; i < ordered.length; i += 1) {
      var next = ordered[i];
      if (!merged || next.lo > merged.hi || next.lo === merged.hi && !merged.ui && !next.li) {
        if (merged && contains(merged, requested)) return true;
        merged = Object.assign({}, next);
      } else if (next.hi > merged.hi) { merged.hi = next.hi; merged.ui = next.ui; }
      else if (next.hi === merged.hi) merged.ui = merged.ui || next.ui;
    }
    return !!merged && contains(merged, requested);
  }
  function validProfile(profile, data) {
    return record(profile) && profile.id && profile.version && profile.analyte === 'inhibin_b' &&
      profile.sourceId && data.sources && record(data.sources[profile.sourceId]) &&
      record(profile.method) && profile.method.id && record(profile.population) && profile.population.label &&
      profile.material === 'serum' && profile.unit === 'pg/mL' && record(profile.scope) &&
      (!profile.scope.sex || ['M', 'F'].includes(profile.scope.sex)) &&
      profile.scope.age && profile.scope.age.axis === 'chronologicalYears' && boundsInterval(profile.scope.age) && Array.isArray(profile.rows);
  }
  function curveReference(profile, input, age, neonatal, requestedAge) {
    var curve = profile.curve, points = curve && curve.points;
    var invalid = { codes: ['invalid_reference_curve'], rows: [] };
    if (!record(curve) || !curve.id || !['M', 'F'].includes(curve.sex) || !Array.isArray(points) || points.length < 2 ||
      curve.interpolation !== 'linear-published-upper' || !['<', '<='].includes(curve.upperOperator) ||
      points.some(function (point, i) { return !record(point) || !finite(point.ageYears) || point.ageYears < 0 || !finite(point.upper) || point.upper < 0 || i > 0 && point.ageYears <= points[i - 1].ageYears; })) return invalid;
    if (curve.sex !== input.sex) return { codes: [], rows: [] };
    var domain = { lo: points[0].ageYears, hi: points[points.length - 1].ageYears, li: true, ui: true };
    var scope = intersect(boundsInterval(profile.scope.age), domain), eligibilityAge = requestedAge;
    var pointAge = null, pointDays = null;
    if (curve.ageResolution != null && curve.ageResolution !== 'calendar-or-completed-day') return invalid;
    if (curve.ageResolution === 'calendar-or-completed-day') {
      if (!finite(curve.daysPerYear) || curve.daysPerYear <= 0) return invalid;
      var pna = neonatal.postnatalDays, divisor = curve.daysPerYear;
      // This explicit source-model policy is not an elapsed-hours claim and
      // never alters the original chronological age or neonatal day bounds.
      if (pna) {
        eligibilityAge = { lo: pna.lower / divisor, hi: (pna.upper + 1) / divisor, li: true, ui: false };
        if (pna.source === 'main-calendar-dates' || pna.source === 'manual-completed-days' && pna.lower === pna.upper) pointDays = pna.upper;
      } else if (age.source === 'dates' && finite(age.ageDays)) {
        // Calendar dates lack the birth and sampling time. A date difference D
        // permits D-1 or D completed days, even though the published age model
        // uses D as its point. Do not turn a model point into eligibility proof.
        eligibilityAge = { lo: Math.max(0, age.ageDays - 1) / divisor, hi: (age.ageDays + 1) / divisor, li: true, ui: false };
      }
      if (age.source === 'dates' && finite(age.ageDays)) pointDays = age.ageDays;
      if (pointDays !== null) pointAge = pointDays / divisor;
    }
    if (!intersects(boundsInterval(profile.scope.age), eligibilityAge)) return { codes: [], rows: [], outsideScope: true };
    if (!scope || !contains(scope, eligibilityAge)) return { codes: ['age_precision_crosses_scope'], rows: [] };
    function at(year) {
      if (year < domain.lo || year > domain.hi) return null;
      for (var i = 0; i < points.length; i += 1) {
        if (year === points[i].ageYears) return points[i].upper;
        if (i && year < points[i].ageYears) {
          var previous = points[i - 1], next = points[i];
          return previous.upper + (next.upper - previous.upper) * (year - previous.ageYears) / (next.ageYears - previous.ageYears);
        }
      }
      return null;
    }
    var samples = pointAge !== null ? [{ age: pointAge, upper: at(pointAge) }] :
      [{ age: eligibilityAge.lo, upper: at(eligibilityAge.lo) }, { age: eligibilityAge.hi, upper: at(eligibilityAge.hi) }].concat(
        points.filter(function (point) { return point.ageYears > eligibilityAge.lo && point.ageYears < eligibilityAge.hi; }).map(function (point) { return { age: point.ageYears, upper: point.upper }; }));
    if (samples.some(function (sample) { return !finite(sample.upper); })) return invalid;
    var low = samples.reduce(function (a, b) { return b.upper < a.upper ? b : a; });
    var high = samples.reduce(function (a, b) { return b.upper > a.upper ? b : a; });
    var selected = low.upper === high.upper ? [low] : [low, high];
    var multiple = selected.length > 1;
    return { codes: multiple ? ['age_precision_crosses_reference_boundary'] : [], rows: selected.map(function (sample, i) {
      var label = pointDays !== null ? 'Model dla wieku ' + pointDays + ' dni' : multiple
        ? (i ? 'Najwyższa' : 'Najniższa') + ' górna granica dla podanego przedziału wieku' : 'Zakres dla podanego przedziału wieku';
      return { id: curve.id + ':' + (multiple ? i ? 'upper-envelope' : 'lower-envelope' : 'age') + ':' + sample.age,
        sex: input.sex, label: label, basis: 'infant-curve',
        age: { axis: 'chronologicalYears', lower: { operator: '>=', value: sample.age }, upper: { operator: '<=', value: sample.age },
          sourceText: label, interpretation: curve.ageResolution || 'reported-age-interval' },
        bounds: { lower: null, upper: { operator: curve.upperOperator, value: sample.upper }, sourceText: text(curve.sourceText, 600) } };
    }) };
  }
  function stageReasons(input) {
    var p = input.puberty, codes = [];
    if (!Number.isInteger(p.stage) || p.stage < 1 || p.stage > 5) codes.push('missing_puberty_stage');
    if (p.kind !== (input.sex === 'M' ? 'G' : 'Th')) codes.push(p.kind === 'unspecified' ? 'ambiguous_puberty_kind' : 'puberty_kind_sex_mismatch');
    if (p.assessedAtISO && core.resolveAge({ birthDateISO: p.assessedAtISO, sampleDateISO: p.assessedAtISO }).status !== 'known') codes.push('invalid_puberty_observation_date');
    var current = input.contextBasis === 'current-patient' && !input.sampleDateISO && p.appliesToCurrentContext;
    var dated = input.sampleDateISO && p.assessedAtISO === input.sampleDateISO;
    var later = input.sampleDateISO && p.assessedAtISO && p.assessedAtISO > input.sampleDateISO;
    if (!current && !dated && !(p.appliesToSample && !later)) codes.push('puberty_not_confirmed_at_sample');
    return codes;
  }
  function profileReasons(profile, input, neonatal, policy, previewReasons) {
    var codes = [], assay = input.assay;
    if (assay.confirmation === 'reported' && (!assay.methodId || assay.methodId !== profile.method.id)) codes.push('method_not_confirmed');
    if (!profile.scope.termBirthOnly && !profile.scope.gestationalAgeDays) return codes;
    if (input.preterm === 'yes' && profile.scope.termBirthOnly) codes.push('preterm_reference_not_established');
    var bounds = profile.scope.gestationalAgeDays || policy.termGestationalDays;
    var interval = boundsInterval(bounds), ga = neonatal.gestationalDays;
    var legacyWeeks = input.gestationalAgeWeeks;
    if (finite(legacyWeeks)) {
      var legacy = { lower: Math.floor(legacyWeeks * 7), upper: Number.isInteger(legacyWeeks) ? legacyWeeks * 7 + 6 : Math.ceil(legacyWeeks * 7) };
      if (legacyWeeks < 0 || ga && (legacy.upper < ga.lower || legacy.lower > ga.upper)) codes.push('preterm_context_conflict');
      if (!ga) ga = legacy;
    }
    if (!interval) codes.push('invalid_gestational_eligibility_policy');
    else if (ga) {
      var observed = { lo: ga.lower, hi: ga.upper, li: true, ui: true };
      if (!contains(interval, observed)) codes.push(intersects(interval, observed) ? 'gestational_age_precision_crosses_scope' : 'gestational_age_outside_profile');
      if (input.preterm === 'no' && observed.hi < interval.lo) codes.push('preterm_context_conflict');
    } else if (profile.scope.termBirthOnly && input.preterm === 'no' && policy.allowDeclaredNonPretermWithoutGA === true) previewReasons.push('term_birth_unconfirmed');
    else codes.push('infant_birth_context_missing');
    return unique(codes);
  }
  function selectedComparison(measurement, row, profile, data) {
    var compared = core.compareMeasurement(measurement, row.bounds);
    if (compared.status === 'unavailable') return unavailable(compared.reasonCodes);
    return { status: compared.status, reasonCodes: compared.reasonCodes, range: {
      id: row.id, profileId: profile.id, profileVersion: profile.version, dataVersion: data.dataVersion,
      sourceId: profile.sourceId, source: Object.assign({ id: profile.sourceId }, copy(data.sources[profile.sourceId])),
      method: copy(profile.method), material: profile.material, unit: profile.unit, population: copy(profile.population), sex: row.sex,
      age: copy(row.age || profile.scope.age), stage: copy(row.stage), bounds: copy(row.bounds), basis: row.basis || (row.stage ? 'stage' : 'age')
    } };
  }
  function evaluate(rawInput, data) {
    rawInput = record(rawInput) ? rawInput : {}; data = record(data) ? data : {};
    var neonatal = core.resolveNeonatalAge(rawInput), input = normalizeInput(rawInput, neonatal);
    var measurement = parseMeasurement(rawInput.value, rawInput.unit), age = core.resolveAge(rawInput);
    var policy = data.automaticReferencePolicy, gates = [], reasons = [];
    var policyValid = record(policy) && policy.id && policy.version && Array.isArray(policy.profileIds) &&
      policy.profileIds.length && unique(policy.profileIds).length === policy.profileIds.length && Array.isArray(policy.reproductiveContexts) && data.dataVersion && Array.isArray(data.profiles);
    if (input.analyte !== 'inhibin_b') gates.push('unsupported_analyte');
    if (measurement.status !== 'valid') gates.push('invalid_measurement');
    if (age.status !== 'known') gates.push.apply(gates, age.reasonCodes);
    if (!input.sex) gates.push('missing_sex');
    if (!policyValid) gates.push('automatic_reference_policy_missing');
    if (input.specimen === 'unknown') reasons.push('specimen_unconfirmed');
    else if (input.specimen !== 'serum') gates.push('unsupported_or_unknown_specimen');
    if (input.measurementKind === 'unknown') reasons.push('non_basal_or_unknown_measurement');
    else if (input.measurementKind !== 'basal') gates.push('non_basal_or_unknown_measurement');
    if (own(rawInput, 'assay') && !record(rawInput.assay) || !['unknown', 'configured', 'reported'].includes(input.assay.confirmation)) gates.push('method_not_confirmed');
    else if (input.assay.confirmation !== 'reported' || !input.assay.methodId) reasons.push('source_method_unconfirmed');
    var treatment = input.treatment;
    if (own(rawInput, 'treatment') && !record(rawInput.treatment) || record(rawInput.treatment) && own(rawInput.treatment, 'context') &&
      !['none', 'unknown', 'hormonal'].includes(rawInput.treatment.context)) gates.push('invalid_treatment_context');
    if (record(rawInput.treatment) && ['gnrha', 'sexSteroids'].some(function (key) {
      return own(rawInput.treatment, key) && ![true, false, 'yes', 'no', 'unknown', null, ''].includes(rawInput.treatment[key]);
    })) gates.push('invalid_treatment_context');
    if (treatment.context === 'hormonal' || treatment.gnrha === 'yes' || treatment.sexSteroids === 'yes') gates.push('treatment_requires_separate_profile');
    else if (!(treatment.context === 'none' && treatment.gnrha === 'no' && treatment.sexSteroids === 'no')) reasons.push('treatment_context_unknown');
    if (neonatal.status === 'invalid') gates.push('invalid_neonatal_age');
    if (neonatal.postnatalDays && age.status === 'known' && age.source !== 'neonatal-days') {
      var dayAge = core.resolveAge({ neonatalAge: { postnatalDays: neonatal.postnatalDays } });
      var consistent = age.source === 'dates'
        ? neonatal.postnatalDays.upper >= Math.max(0, age.ageDays - 1) && neonatal.postnatalDays.lower <= age.ageDays
        : intersects({ lo: age.lowerYears, hi: age.upperYears, li: true, ui: age.upperInclusive },
          { lo: dayAge.lowerYears, hi: dayAge.upperYears, li: true, ui: dayAge.upperInclusive });
      if (!consistent) gates.push('neonatal_age_context_mismatch');
    }
    if (policyValid && !policy.reproductiveContexts.includes(input.reproductiveContext) || own(rawInput, 'reproductiveContext') &&
      rawInput.reproductiveContext != null && typeof rawInput.reproductiveContext !== 'string') gates.push('invalid_reproductive_context');
    if (input.reproductiveContext !== 'unknown' && input.sex !== 'F') gates.push('reproductive_context_not_applicable');
    var byAge = unavailable('no_matching_reference_range'), byStage = unavailable('stage_reference_not_established'), variants = null;
    var candidates = [], stageCandidates = [], profileIssues = [], matchedReproductive = false, hasStageReferences = false;
    var requestedAge = { lo: age.lowerYears, hi: age.upperYears, li: true, ui: age.upperInclusive };
    var stageCodes = stageReasons(input);
    if (!gates.length) {
      policy.profileIds.forEach(function (id) {
        var profile = (data.profiles || []).find(function (item) { return item && item.id === id; });
        if (!validProfile(profile, data)) { profileIssues.push('invalid_reference_profile'); return; }
        if (profile.scope.sex && profile.scope.sex !== input.sex) return;
        if (!profile.rows.some(function (row) { return row && row.sex === input.sex; }) && !(profile.curve && profile.curve.sex === input.sex)) return;
        var scope = boundsInterval(profile.scope.age);
        // Curve eligibility has its own explicitly configured day policy. The
        // generic calendar-month fraction must never preselect/reject it first.
        var curve = profile.curve ? curveReference(profile, input, age, neonatal, requestedAge) : null;
        if (curve ? curve.outsideScope : !intersects(scope, requestedAge)) return;
        if (profile.active !== true) { profileIssues.push('profile_not_active'); return; }
        var eligibility = profileReasons(profile, input, neonatal, policy, reasons);
        if (eligibility.length) { profileIssues.push.apply(profileIssues, eligibility); return; }
        if (curve) {
          if (!curve.rows.length) profileIssues.push.apply(profileIssues, curve.codes);
          else {
            reasons.push.apply(reasons, curve.codes);
            curve.rows.forEach(function (row) {
              // Eligibility has already covered the complete reported age under
              // the curve's explicit age policy. This interval tracks coverage,
              // while range.age retains the actual model evaluation point.
              candidates.push({ row: row, profile: profile, interval: requestedAge, comparison: selectedComparison(measurement, row, profile, data) });
            });
          }
        }
        profile.rows.forEach(function (row) {
          if (!row || row.sex !== input.sex) return;
          var rowBounds = row.age || profile.scope.age;
          var interval = rowBounds.axis === 'chronologicalYears' ? intersect(boundsInterval(rowBounds), scope) : null;
          if (!row.id || !interval || !intersects(interval, requestedAge)) return;
          if (row.stage) hasStageReferences = true;
          var reproductive = row.reproductiveContext || null;
          var allowed = input.reproductiveContext === 'unknown' || reproductive === input.reproductiveContext ||
            policy.reproductiveContextGroups && Array.isArray(policy.reproductiveContextGroups[input.reproductiveContext]) && policy.reproductiveContextGroups[input.reproductiveContext].includes(reproductive);
          if (input.reproductiveContext !== 'unknown' && !allowed) return;
          if (reproductive) matchedReproductive = true;
          var comparison = selectedComparison(measurement, row, profile, data);
          if (comparison.status === 'unavailable') { profileIssues.push.apply(profileIssues, comparison.reasonCodes); return; }
          var candidate = { row: row, profile: profile, interval: interval, comparison: comparison };
          if (!row.stage) candidates.push(candidate);
          else if (!stageCodes.length && row.stage.kind === input.puberty.kind && row.stage.value === input.puberty.stage && contains(interval, requestedAge)) stageCandidates.push(candidate);
        });
      });
      if (input.reproductiveContext !== 'unknown' && !matchedReproductive) gates.push('reproductive_context_not_applicable');
      if (profileIssues.some(function (issue) { return ['invalid_reference_profile', 'invalid_reference_range', 'invalid_reference_curve'].includes(issue); })) gates.push.apply(gates, profileIssues);
      if (!gates.length && candidates.length && covers(candidates.map(function (item) { return item.interval; }), requestedAge)) {
        if (candidates.length === 1 && contains(candidates[0].interval, requestedAge)) byAge = candidates[0].comparison;
        else {
          variants = candidates.map(function (candidate) {
            var row = candidate.row;
            return { id: candidate.profile.id + ':' + row.id, label: row.label || row.age && row.age.sourceText || row.id,
              reproductiveContext: row.reproductiveContext || null, comparison: candidate.comparison };
          });
          byAge = unavailable('reference_variants_available');
          if (candidates.some(function (item) { return !contains(item.interval, requestedAge); })) reasons.push('age_precision_crosses_reference_boundary');
          if (input.reproductiveContext === 'unknown' && matchedReproductive) reasons.push('reproductive_context_missing');
        }
      } else if (!gates.length) {
        byAge = unavailable(candidates.length ? 'age_precision_crosses_scope' : profileIssues.length ? profileIssues : 'no_matching_reference_range');
      }
      if (!gates.length && stageCandidates.length === 1) byStage = stageCandidates[0].comparison;
      else if (hasStageReferences && stageCodes.length) byStage = unavailable(stageCodes);
      else if (stageCandidates.length > 1) byStage = unavailable('ambiguous_stage_reference');
    }
    if (gates.length) { byAge = unavailable(gates); byStage = unavailable(gates); variants = null; }
    var available = !!variants || byAge.status !== 'unavailable' || byStage.status !== 'unavailable';
    var comparisons = [byAge, byStage].concat((variants || []).map(function (variant) { return variant.comparison; }));
    var ranges = comparisons.filter(function (comparison) { return comparison.range; }).map(function (comparison) { return comparison.range; });
    var profileIds = unique(ranges.map(function (range) { return range.profileId; }));
    var selectionReasons = available ? unique(reasons) : unique(gates.concat(byAge.reasonCodes, byStage.reasonCodes));
    var result = {
      schemaVersion: 1, engineVersion: VERSION, dataVersion: data.dataVersion || null, analyte: input.analyte,
      input: copy(input), measurement: measurement, ageAtSample: age,
      biochemical: { status: 'unavailable', primary: null, byAge: unavailable('automatic_reference_only'), byStage: unavailable('automatic_reference_only'),
        local: unavailable('no_local_reference'), reasonCodes: unique(['automatic_reference_only'].concat(gates, reasons)) },
      clinical: { status: 'limited', code: 'reference_comparison_only', title: 'Porównanie ze źródłem', text: '', reasonCodes: [], sourceIds: [] },
      summary: { status: measurement.status === 'invalid' ? 'invalid' : 'limited',
        code: measurement.status === 'invalid' ? 'invalid_measurement' : variants ? 'reference_variants_available' : available ? 'automatic_reference_comparison' : 'limited_interpretation',
        title: measurement.status === 'invalid' ? 'Nieprawidłowy zapis wyniku lub jednostki' : variants ? 'Warianty zakresów referencyjnych' : available ? 'Orientacyjne porównanie ze źródłem' : 'Brak zakresu dla podanych danych' },
      referenceSelection: { mode: 'automatic', status: available ? variants ? 'variants' : 'selected' : 'unavailable', profileIds: profileIds, reasonCodes: selectionReasons },
      provenance: { clinicalProfileId: null, clinicalProfileVersion: null, biochemicalPolicyId: null, biochemicalPolicyVersion: null,
        profileId: profileIds.length === 1 ? profileIds[0] : null, profileVersion: profileIds.length === 1 ? ranges[0].profileVersion : null,
        sourceIds: unique(ranges.map(function (range) { return range.sourceId; })),
        selectionPolicyId: policyValid ? policy.id : null, selectionPolicyVersion: policyValid ? policy.version : null },
      limitations: unique(selectionReasons.concat(measurement.reasonCodes, comparisons.flatMap(function (comparison) { return comparison.reasonCodes; })))
    };
    if (own(rawInput, 'neonatalAge')) result.neonatalAge = copy(neonatal);
    if (available) {
      result.referencePreview = { kind: 'automatic-source-reference', reasonCodes: selectionReasons.slice(), byAge: byAge, byStage: byStage };
      if (variants) result.referencePreview.variants = variants;
      var notes = unique(candidates.concat(stageCandidates).map(function (item) { return text(item.profile.applicabilityText, 600); }).filter(Boolean));
      if (notes.length) result.referencePreview.applicabilityText = notes.join(' ');
    }
    return result;
  }
  return Object.freeze({ version: VERSION, evaluate: evaluate, parseMeasurement: parseMeasurement,
    resolveAge: core.resolveAge, resolveNeonatalAge: core.resolveNeonatalAge });
});
