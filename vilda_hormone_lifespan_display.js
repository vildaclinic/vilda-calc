/* Stable educational display knots, separate from source reference values.
 * The renderer interpolates them in the fixed whole-life display coordinate.
 * No patient data or eligibility decisions enter this module. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VildaHormoneLifespanDisplay = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  function finite(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function buildMaleInhibin(data, engine) {
    var policy = data && data.inhibinDisplayPolicy;
    var sourceData = data && data.patientPointData;
    if (!policy || policy.kind !== 'educational-display-only' ||
        !Array.isArray(policy.sourceIds) || policy.sourceIds.length !== 3 ||
        !Array.isArray(policy.transitions) || !sourceData || !Array.isArray(sourceData.profiles) ||
        !engine || typeof engine.referenceAt !== 'function' || typeof engine.sampleProfile !== 'function' ||
        !Array.isArray(data.maleAges) || !Array.isArray(data.maleHormones)) return null;
    var profiles = policy.sourceIds.map(function (id) {
      return sourceData.profiles.find(function (profile) { return profile.id === id; });
    });
    if (profiles.some(function (profile) {
      return !profile || profile.analyte !== 'inhb' || profile.sex !== 'male' || profile.unit !== 'pg/mL' ||
        !Array.isArray(profile.points) || profile.points.length < 2;
    })) return null;
    var hormone = data.maleHormones.find(function (item) { return item.id === 'inhb'; });
    if (!hormone || !Array.isArray(hormone.values) || hormone.values.length !== data.maleAges.length) return null;
    var ceiling = policy.scale && policy.scale.headroomFactor;
    var divisor = Math.max.apply(null, profiles.flatMap(function (profile) {
      return profile.points.map(function (point) { return point.value; });
    }));
    if (!finite(divisor) || divisor <= 0 || !finite(ceiling) || ceiling <= 1) return null;
    var transitions = policy.transitions.map(function (item) {
      return { minAge: item.minAge, maxAge: item.maxAge,
        fromSource: item.fromSource, toSource: item.toSource, kind: item.kind };
    });
    if (transitions.some(function (item) {
      return !finite(item.minAge) || !finite(item.maxAge) || item.maxAge <= item.minAge ||
        policy.sourceIds.indexOf(item.fromSource) < 0 || policy.sourceIds.indexOf(item.toSource) < 0;
    })) return null;
    var tangentOverrides = [];
    transitions.forEach(function (transition) {
      [[transition.minAge, transition.fromSource], [transition.maxAge, transition.toSource]].forEach(function (endpoint) {
        var ageYears = endpoint[0];
        var profile = profiles.find(function (item) { return item.id === endpoint[1]; });
        var delta = Math.min(0.00001, (ageYears - profile.minAge) / 2, (profile.maxAge - ageYears) / 2);
        if (!(delta > 0)) return;
        var slope = (engine.referenceAt(profile, ageYears + delta) - engine.referenceAt(profile, ageYears - delta)) / (2 * delta);
        if (finite(slope)) tangentOverrides.push({ ageYears: ageYears, slopePerYear: slope, sourceId: profile.id });
      });
    });
    if (tangentOverrides.length !== transitions.length * 2) return null;
    var knots = new Map();
    function add(ageYears, value) {
      if (finite(ageYears) && finite(value) && value >= 0) knots.set(ageYears, { ageYears: ageYears, value: value });
    }
    function inTransition(ageYears) {
      return transitions.some(function (item) { return ageYears > item.minAge && ageYears < item.maxAge; });
    }
    var stageAges = Array.isArray(data.maleStages) ? data.maleStages.flatMap(function (stage) {
      return [stage.min, stage.max];
    }) : [];
    profiles.forEach(function (profile) {
      // Fixed sampling preserves source curvature without making the patient's
      // age an extra interpolation knot. Original source nodes remain exact.
      var ages = new Set(engine.sampleProfile(profile, 400).map(function (point) { return point.ageYears; }));
      profile.points.forEach(function (point) { ages.add(point.ageYears); });
      stageAges.forEach(function (ageYears) { ages.add(ageYears); });
      for (var age = Math.ceil(profile.minAge); age <= profile.maxAge; age++) ages.add(age);
      transitions.forEach(function (transition) {
        if (transition.fromSource === profile.id) ages.add(transition.minAge);
        if (transition.toSource === profile.id) ages.add(transition.maxAge);
      });
      ages.forEach(function (ageYears) {
        if (ageYears < profile.minAge || ageYears > profile.maxAge ||
            (profile.maxAgeExclusive && ageYears === profile.maxAge) || inTransition(ageYears)) return;
        add(ageYears, engine.referenceAt(profile, ageYears));
      });
    });
    var first = profiles[0], last = profiles[profiles.length - 1];
    var schematic = policy.schematic;
    if (!schematic || !finite(schematic.prenatalLastAnchorAge)) return null;
    // Prenatal heights only retain the old illustrative proportions. The old
    // birth dip was also schematic, and is not an extra serum observation.
    data.maleAges.forEach(function (ageYears, index) {
      if (ageYears <= schematic.prenatalLastAnchorAge && ageYears < first.minAge)
        add(ageYears, hormone.values[index] * divisor);
    });
    var lastReference = engine.referenceAt(last, last.maxAge);
    var anchorIndex = data.maleAges.indexOf(last.maxAge);
    var oldAnchor = hormone.values[anchorIndex];
    if (!finite(lastReference) || !finite(oldAnchor) || oldAnchor <= 0) return null;
    data.maleAges.forEach(function (ageYears, index) {
      if (ageYears > last.maxAge) add(ageYears, lastReference * hormone.values[index] / oldAnchor);
    });
    var points = Array.from(knots.values()).sort(function (a, b) { return a.ageYears - b.ageYears; });
    if (points.length < 2) return null;
    return {
      id: 'inhb', kind: policy.kind, unit: policy.unit, policyVersion: policy.version,
      points: points, profiles: profiles, sourceIds: policy.sourceIds.slice(),
      divisor: divisor, ceiling: ceiling, transitions: transitions, tangentOverrides: tangentOverrides,
      illustrativeIntervals: [
        { minAge: points[0].ageYears, maxAge: first.minAge, kind: 'prenatal-lead' },
        ...transitions,
        { minAge: last.maxAge, maxAge: points[points.length - 1].ageYears, kind: 'older-age-tail' }
      ]
    };
  }

  function buildMaleTestosterone(data, engine) {
    var policy = data && data.testosteroneDisplayPolicy;
    var sourceData = data && data.patientPointData;
    if (!policy || policy.kind !== 'educational-display-only' || policy.analyte !== 't' ||
        policy.sex !== 'male' || policy.unit !== 'nmol/L' ||
        !Array.isArray(policy.sourceIds) || policy.sourceIds.length !== 4 ||
        new Set(policy.sourceIds).size !== 4 || !Array.isArray(policy.transitions) ||
        !Array.isArray(policy.anchors) || !policy.anchors.length ||
        !sourceData || !Array.isArray(sourceData.profiles) ||
        !engine || typeof engine.referenceAt !== 'function' || typeof engine.sampleProfile !== 'function' ||
        !Array.isArray(data.maleAges) || !Array.isArray(data.maleHormones)) return null;
    var profiles = policy.sourceIds.map(function (id) {
      return sourceData.profiles.find(function (profile) { return profile.id === id; });
    });
    if (profiles.some(function (profile) {
      return !profile || profile.analyte !== 't' || profile.sex !== 'male' || profile.unit !== 'nmol/L' ||
        !finite(profile.minAge) || !finite(profile.maxAge) || profile.maxAge <= profile.minAge ||
        !Array.isArray(profile.points) || profile.points.length < 2 ||
        profile.points.some(function (point, index, points) {
          return !point || !finite(point.ageYears) || !finite(point.value) || point.value < 0 ||
            (index > 0 && point.ageYears <= points[index - 1].ageYears);
        });
    }) || profiles.some(function (profile, index) {
      if (!index) return false;
      var previous = profiles[index - 1];
      return previous.maxAge > profile.minAge ||
        (previous.maxAge === profile.minAge && !previous.maxAgeExclusive);
    })) return null;
    var hormone = data.maleHormones.find(function (item) { return item.id === 't'; });
    if (!hormone || !Array.isArray(hormone.values) || hormone.values.length !== data.maleAges.length ||
        hormone.values.some(function (value) { return !finite(value) || value < 0; }) ||
        data.maleAges.some(function (age, index, ages) {
          return !finite(age) || (index > 0 && age <= ages[index - 1]);
        })) return null;
    var ceiling = policy.scale && policy.scale.headroomFactor;
    var divisor = Math.max.apply(null, profiles.flatMap(function (profile) {
      return profile.points.map(function (point) { return point.value; });
    }));
    if (!finite(divisor) || divisor <= 0 || !finite(ceiling) || ceiling <= 1 || policy.transitions.length !== 3) return null;
    var validTransitions = policy.transitions.every(function (item, index, items) {
      if (!item || !finite(item.minAge) || !finite(item.maxAge) || item.maxAge <= item.minAge ||
          (index > 0 && item.minAge <= items[index - 1].maxAge) ||
          !['monotone-display', 'original-source-derivative'].includes(item.tangents)) return false;
      var from = profiles.find(function (profile) { return profile.id === item.fromSource; });
      var to = profiles.find(function (profile) { return profile.id === item.toSource; });
      return from && to && item.minAge >= from.minAge && item.minAge < from.maxAge &&
        item.maxAge >= to.minAge && item.maxAge <= to.maxAge;
    });
    if (!validTransitions) return null;
    var transitions = policy.transitions.map(function (item) {
      return { minAge: item.minAge, maxAge: item.maxAge,
        fromSource: item.fromSource, toSource: item.toSource, kind: item.kind };
    });
    var invalid = false;
    var anchors = policy.anchors.map(function (anchor) {
      if (!anchor || !finite(anchor.ageYears)) { invalid = true; return null; }
      var profile = profiles.find(function (item) { return item.id === anchor.sourceId; });
      var point = profile && profile.points.find(function (item) { return item.ageYears === anchor.ageYears; });
      var transition = transitions.find(function (item) {
        return anchor.ageYears > item.minAge && anchor.ageYears < item.maxAge &&
          (item.fromSource === anchor.sourceId || item.toSource === anchor.sourceId);
      });
      // A published endpoint may remain a display anchor even when age routing
      // assigns that exact birthday to the next profile. Never extend the
      // numerical reference domain or interpolate an unreported anchor here.
      if (!profile || !point || point.eligible === false || !transition ||
          anchor.ageYears < profile.minAge || anchor.ageYears > profile.maxAge) {
        invalid = true; return null;
      }
      return { ageYears: anchor.ageYears, value: point.value, sourceId: profile.id };
    });
    if (invalid || new Set(anchors.map(function (anchor) { return anchor.ageYears; })).size !== anchors.length) return null;
    var tangentOverrides = [];
    policy.transitions.forEach(function (transition) {
      if (transition.tangents !== 'original-source-derivative') return;
      [[transition.minAge, transition.fromSource], [transition.maxAge, transition.toSource]].forEach(function (endpoint) {
        var ageYears = endpoint[0];
        var profile = profiles.find(function (item) { return item.id === endpoint[1]; });
        var delta = Math.min(0.00001, (ageYears - profile.minAge) / 2, (profile.maxAge - ageYears) / 2);
        if (!(delta > 0)) { invalid = true; return; }
        var before = engine.referenceAt(profile, ageYears - delta);
        var after = engine.referenceAt(profile, ageYears + delta);
        var slope = (after - before) / (2 * delta);
        if (!finite(before) || !finite(after) || !finite(slope)) { invalid = true; return; }
        var sourceIndex = profile.points.findIndex(function (point) { return point.ageYears === ageYears; });
        if (sourceIndex > 0 && sourceIndex < profile.points.length - 1) {
          var sourceValue = profile.points[sourceIndex].value;
          if ((sourceValue - profile.points[sourceIndex - 1].value) *
              (profile.points[sourceIndex + 1].value - sourceValue) <= 0) slope = 0;
        }
        tangentOverrides.push({ ageYears: ageYears, slopePerYear: slope, sourceId: profile.id });
      });
    });
    if (invalid) return null;
    var knots = new Map();
    function add(ageYears, value) {
      if (!finite(ageYears) || !finite(value) || value < 0) { invalid = true; return; }
      knots.set(ageYears, { ageYears: ageYears, value: value });
    }
    function inTransition(ageYears) {
      return transitions.some(function (item) { return ageYears > item.minAge && ageYears < item.maxAge; });
    }
    function readable(profile, ageYears) {
      var index = profile.points.findIndex(function (point) { return point.ageYears >= ageYears; });
      if (index < 0 || profile.points[index].eligible === false) return false;
      return profile.points[index].ageYears === ageYears || index === 0 || profile.points[index - 1].eligible !== false;
    }
    var stageAges = Array.isArray(data.maleStages) ? data.maleStages.flatMap(function (stage) {
      return [stage.min, stage.max];
    }) : [];
    profiles.forEach(function (profile) {
      var samples = engine.sampleProfile(profile, 400);
      if (!Array.isArray(samples) || samples.length < 2) { invalid = true; return; }
      var ages = new Set(samples.map(function (point) { return point.ageYears; }));
      profile.points.forEach(function (point) { ages.add(point.ageYears); });
      stageAges.forEach(function (ageYears) { ages.add(ageYears); });
      for (var age = Math.ceil(profile.minAge); age <= profile.maxAge; age++) ages.add(age);
      transitions.forEach(function (transition) {
        if (transition.fromSource === profile.id) ages.add(transition.minAge);
        if (transition.toSource === profile.id) ages.add(transition.maxAge);
      });
      ages.forEach(function (ageYears) {
        if (ageYears < profile.minAge || ageYears > profile.maxAge ||
            (profile.maxAgeExclusive && ageYears === profile.maxAge) ||
            inTransition(ageYears) || !readable(profile, ageYears)) return;
        add(ageYears, engine.referenceAt(profile, ageYears));
      });
    });
    anchors.forEach(function (anchor) { add(anchor.ageYears, anchor.value); });
    // Both ends of every illustrative join must still be genuine readable
    // source values. No partial curve may silently replace missing evidence.
    transitions.forEach(function (transition) {
      if (!knots.has(transition.minAge) || !knots.has(transition.maxAge)) invalid = true;
    });
    var first = profiles[0], last = profiles[profiles.length - 1];
    var schematic = policy.schematic;
    if (invalid || !knots.has(first.minAge) || !knots.has(last.maxAge) ||
        !schematic || !finite(schematic.prenatalLastAnchorAge) ||
        schematic.prenatalLastAnchorAge >= first.minAge ||
        schematic.tailScale !== 'hold-last-source-value' || !finite(schematic.tailMaxAge) ||
        schematic.tailMaxAge <= last.maxAge) return null;
    data.maleAges.forEach(function (ageYears, index) {
      if (ageYears <= schematic.prenatalLastAnchorAge) add(ageYears, hormone.values[index] * divisor);
    });
    var lastReference = engine.referenceAt(last, last.maxAge);
    if (!finite(lastReference) || lastReference < 0) return null;
    add(schematic.tailMaxAge, lastReference);
    var points = Array.from(knots.values()).sort(function (a, b) { return a.ageYears - b.ageYears; });
    if (invalid || points.length < 2) return null;
    return {
      id: 't', kind: policy.kind, unit: policy.unit, policyVersion: policy.version,
      points: points, profiles: profiles, sourceIds: policy.sourceIds.slice(),
      divisor: divisor, ceiling: ceiling, transitions: transitions, anchors: anchors, tangentOverrides: tangentOverrides,
      illustrativeIntervals: [
        { minAge: points[0].ageYears, maxAge: first.minAge, kind: 'prenatal-lead' },
        ...transitions,
        { minAge: last.maxAge, maxAge: schematic.tailMaxAge, kind: 'older-age-tail' }
      ]
    };
  }

  return { buildMaleInhibin: buildMaleInhibin, buildMaleTestosterone: buildMaleTestosterone };
});
