/* Quantitative educational comparison with a source population central curve.
 * This module does not classify normality, calculate percentiles or diagnose.
 * The source data, population and qualification policy are supplied by callers.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VildaHormoneLifespanReference = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var cache = typeof WeakMap === 'function' ? new WeakMap() : null;
  var aliases = {
    lh: 'lh', fsh: 'fsh', amh: 'amh', insl3: 'insl3',
    t: 't', tt: 't', testosterone: 't', testosterone_total: 't',
    inhb: 'inhb', inhibin_b: 'inhb', 'inhibin b': 'inhb',
    e2: 'e2', estradiol: 'e2'
  };

  function finite(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function unavailable(reason) {
    return { status: 'unavailable', reason: reason };
  }

  function sourceData(data) {
    return data && (data.patientPointData || data);
  }

  function analyteId(value) {
    if (typeof value !== 'string') return null;
    var key = value.trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(aliases, key) ? aliases[key] : null;
  }

  function inDomain(profile, age) {
    return finite(age) && finite(profile.minAge) && finite(profile.maxAge) &&
      age >= profile.minAge && (profile.maxAgeExclusive ? age < profile.maxAge : age <= profile.maxAge);
  }

  function termBirth(value) {
    return value === false || value === 'no';
  }

  function selected(data, context) {
    context = context || {};
    data = sourceData(data);
    if (context.contraindicated === true) return unavailable('contraindicated');
    if (!finite(context.ageYears) || context.ageYears < 0) return unavailable('missing-age');
    var upper = context.ageUpperYears == null ? context.ageYears : context.ageUpperYears;
    if (!finite(upper) || upper < context.ageYears) return unavailable('ambiguous-age');
    if (context.sex !== 'male' && context.sex !== 'female') return unavailable('unsupported-sex');
    var analyte = analyteId(context.analyte);
    if (!analyte || !data || !Array.isArray(data.profiles)) return unavailable('unsupported-analyte');
    var candidates = data.profiles.filter(function (profile) {
      return profile.analyte === analyte && profile.sex === context.sex && inDomain(profile, context.ageYears);
    });
    if (!candidates.length) return unavailable('unsupported-age');
    // Overlapping policies are a data error, never a reason to choose a more
    // favourable reference from the patient measurement.
    if (candidates.length !== 1) return unavailable('ambiguous-profile');
    var profile = candidates[0];
    var exclusiveEnd = context.ageUpperInclusive === false && upper > context.ageYears;
    if (!inDomain(profile, upper) && !(exclusiveEnd && upper === profile.maxAge)) {
      return unavailable('ambiguous-age');
    }
    if (profile.termOnly && !termBirth(context.preterm)) return unavailable('preterm-context');
    if (profile.requiredGonadalStage != null) {
      var puberty = context.puberty;
      if (!puberty || !Number.isInteger(puberty.stage) || puberty.stage < 1 || puberty.stage > 5 ||
          !puberty.kind || puberty.kind === 'unspecified') return unavailable('missing-puberty-stage');
      // A known gonadal observation is supplied by the current-patient adapter.
      // Pubic/axillary hair and an untyped Tanner number cannot qualify a cohort.
      if (puberty.kind !== (context.sex === 'male' ? 'G' : 'Th') ||
          puberty.stage !== profile.requiredGonadalStage) return unavailable('incompatible-puberty-stage');
    }
    var specimen = typeof context.specimen === 'string' ? context.specimen.trim().toLowerCase() : '';
    if (specimen && specimen !== 'unknown' && specimen !== 'serum' && specimen !== 'surowica') {
      return unavailable('incompatible-specimen');
    }
    var method = typeof context.assayMethodId === 'string' ? context.assayMethodId.trim().toLowerCase() : '';
    if (method && method !== 'unknown' && (!Array.isArray(profile.compatibleAssayMethodIds) ||
        profile.compatibleAssayMethodIds.indexOf(method) < 0)) return unavailable('incompatible-assay');
    return { status: 'ready', profile: profile };
  }

  function endpoint(h0, h1, delta0, delta1) {
    var slope = ((2 * h0 + h1) * delta0 - h0 * delta1) / (h0 + h1);
    if (Math.sign(slope) !== Math.sign(delta0)) return 0;
    if (Math.sign(delta0) !== Math.sign(delta1) && Math.abs(slope) > 3 * Math.abs(delta0)) return 3 * delta0;
    return slope;
  }

  function model(profile) {
    if (!profile || !Array.isArray(profile.points) || profile.points.length < 2) return null;
    if (cache && cache.has(profile)) return cache.get(profile);
    var points = profile.points;
    // A published group median is a single value across its routing interval,
    // never a fitted trajectory between observations at individual ages.
    if (profile.interpolation === 'constant' && points.some(function (point) {
      return point.value !== points[0].value;
    })) return null;
    var h = [], delta = [], slopes = [];
    for (var i = 0; i < points.length; i++) {
      if (!finite(points[i].ageYears) || !finite(points[i].value) || points[i].value < 0) return null;
      if (i) {
        var width = points[i].ageYears - points[i - 1].ageYears;
        if (!(width > 0)) return null;
        h.push(width);
        delta.push((points[i].value - points[i - 1].value) / width);
      }
    }
    var n = points.length;
    if (n === 2) slopes = [delta[0], delta[0]];
    else {
      slopes[0] = endpoint(h[0], h[1], delta[0], delta[1]);
      for (var j = 1; j < n - 1; j++) {
        if (!delta[j - 1] || !delta[j] || Math.sign(delta[j - 1]) !== Math.sign(delta[j])) slopes[j] = 0;
        else {
          var w1 = 2 * h[j] + h[j - 1];
          var w2 = h[j] + 2 * h[j - 1];
          slopes[j] = (w1 + w2) / (w1 / delta[j - 1] + w2 / delta[j]);
        }
      }
      slopes[n - 1] = endpoint(h[n - 2], h[n - 3], delta[n - 2], delta[n - 3]);
    }
    var result = { points: points, slopes: slopes };
    if (cache) cache.set(profile, result);
    return result;
  }

  function interval(points, age) {
    var low = 0, high = points.length - 1;
    if (age < points[0].ageYears || age > points[high].ageYears) return null;
    while (high - low > 1) {
      var mid = Math.floor((low + high) / 2);
      if (points[mid].ageYears <= age) low = mid;
      else high = mid;
    }
    if (age === points[low].ageYears) return { exact: low };
    if (age === points[high].ageYears) return { exact: high };
    return { low: low, high: high };
  }

  function referenceAt(profile, age) {
    if (!profile || !inDomain(profile, age)) return null;
    var fitted = model(profile);
    if (!fitted) return null;
    var found = interval(fitted.points, age);
    if (!found) return null;
    if (profile.interpolation === 'constant') return fitted.points[0].value;
    if (found.exact != null) return fitted.points[found.exact].value;
    var p0 = fitted.points[found.low], p1 = fitted.points[found.high];
    var h = p1.ageYears - p0.ageYears;
    var t = (age - p0.ageYears) / h;
    var t2 = t * t, t3 = t2 * t;
    var value = (2 * t3 - 3 * t2 + 1) * p0.value + (t3 - 2 * t2 + t) * h * fitted.slopes[found.low] +
      (-2 * t3 + 3 * t2) * p1.value + (t3 - t2) * h * fitted.slopes[found.high];
    return finite(value) && value >= 0 ? value : null;
  }

  function sampleProfile(profile, count) {
    if (!profile || !finite(profile.minAge) || !finite(profile.maxAge)) return [];
    count = finite(count) ? Math.max(2, Math.min(2000, Math.floor(count))) : 200;
    var end = profile.maxAgeExclusive ? profile.maxAge - 1e-10 : profile.maxAge;
    if (!(end > profile.minAge)) return [];
    var points = [];
    for (var i = 0; i < count; i++) {
      var age = profile.minAge + (end - profile.minAge) * i / (count - 1);
      var value = referenceAt(profile, age);
      if (value == null) return [];
      points.push({ ageYears: age, value: value });
    }
    return points;
  }

  function eligibleAt(profile, age) {
    var fitted = model(profile);
    if (!fitted) return false;
    var found = interval(fitted.points, age);
    if (!found) return false;
    if (found.exact != null) return fitted.points[found.exact].eligible !== false;
    // The rounded source nodes are conservative display eligibility markers.
    // Interpolation must not cross from an eligible to a censored/uncertain node.
    return fitted.points[found.low].eligible !== false && fitted.points[found.high].eligible !== false;
  }

  function eligibleSpan(profile, low, high) {
    if (!eligibleAt(profile, low) || !eligibleAt(profile, high)) return false;
    return profile.points.every(function (point) {
      return point.ageYears < low || point.ageYears > high || point.eligible !== false;
    });
  }

  function evaluate(data, context) {
    context = context || {};
    var choice = selected(data, context);
    if (choice.status !== 'ready') return choice;
    var measurement = context.measurement;
    if (!measurement || !finite(measurement.value) || measurement.value < 0) return unavailable('invalid-value');
    if (measurement.operator != null && measurement.operator !== '' && measurement.operator !== '=') {
      return unavailable('censored-result');
    }
    var profile = choice.profile;
    var conversions = sourceData(data).unitConversions;
    var units = conversions && conversions[profile.analyte];
    var factor = units && units.unit === profile.unit && typeof measurement.unit === 'string' &&
      units.factors && Object.prototype.hasOwnProperty.call(units.factors, measurement.unit) ?
      units.factors[measurement.unit] : null;
    if (!finite(factor) || factor <= 0) return unavailable('unsupported-unit');
    var value = measurement.value * factor;
    if (!finite(value)) return unavailable('invalid-value');
    var upper = context.ageUpperYears == null ? context.ageYears : context.ageUpperYears;
    // Completed months/years describe a half-open age interval. Its endpoint
    // belongs to the next interval; do not accidentally switch source there.
    if (context.ageUpperInclusive === false && upper > context.ageYears) {
      upper = Math.max(context.ageYears, upper - Math.max(1, Math.abs(upper)) * Number.EPSILON * 4);
    }
    if (!eligibleSpan(profile, context.ageYears, upper)) return unavailable('reference-unavailable');
    var referenceValue = referenceAt(profile, context.ageYears);
    if (!(referenceValue > 0)) return unavailable('reference-unavailable');
    return { status: 'ready', profile: profile, value: value, referenceValue: referenceValue };
  }

  return { version: '1.2.0', evaluate: evaluate, selectProfile: selected,
    referenceAt: referenceAt, sampleProfile: sampleProfile };
});
