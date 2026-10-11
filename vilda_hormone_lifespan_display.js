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
        !Array.isArray(policy.sourceIds) || !policy.sourceIds.length ||
        new Set(policy.sourceIds).size !== policy.sourceIds.length ||
        !Array.isArray(policy.transitions) || policy.transitions.length !== 2 ||
        !Array.isArray(policy.anchors) || policy.anchors.length !== 0 ||
        !sourceData || !Array.isArray(sourceData.profiles) ||
        !engine || typeof engine.referenceAt !== 'function' || typeof engine.sampleProfile !== 'function' ||
        !Array.isArray(data.maleAges) || !Array.isArray(data.maleHormones) ||
        !Array.isArray(data.maleStages) || !data.maleStages.length) return null;
    var profiles = policy.sourceIds.map(function (id) {
      return sourceData.profiles.find(function (profile) { return profile && profile.id === id; });
    });
    if (profiles.some(function (profile, index) {
      if (!profile || profile.analyte !== 't' || profile.sex !== 'male' || profile.unit !== 'nmol/L' ||
          !finite(profile.minAge) || !finite(profile.maxAge) || profile.maxAge <= profile.minAge ||
          !Array.isArray(profile.points) || profile.points.length < 2 ||
          profile.points.some(function (point, pointIndex, points) {
            return !point || !finite(point.ageYears) || !finite(point.value) || point.value < 0 ||
              (pointIndex > 0 && point.ageYears <= points[pointIndex - 1].ageYears);
          })) return true;
      var previous = profiles[index - 1];
      return previous && (previous.maxAge > profile.minAge ||
        (previous.maxAge === profile.minAge && !previous.maxAgeExclusive));
    })) return null;
    var hormone = data.maleHormones.find(function (item) { return item && item.id === 't'; });
    if (!hormone || !Array.isArray(hormone.values) || hormone.values.length !== data.maleAges.length ||
        hormone.values.some(function (value) { return !finite(value) || value < 0; }) ||
        data.maleAges.some(function (age, index, ages) {
          return !finite(age) || (index > 0 && age <= ages[index - 1]);
        })) return null;
    var stages = data.maleStages;
    if (stages.some(function (stage, index) {
      return !stage || !finite(stage.min) || !finite(stage.max) || stage.min >= stage.max ||
        !finite(stage.width) || stage.width <= 0 || (index > 0 && stage.min !== stages[index - 1].max);
    }) || Math.abs(stages.reduce(function (sum, stage) { return sum + stage.width; }, 0) - 1) > 1e-10) return null;
    function profileById(id) {
      return profiles.find(function (profile) { return profile && profile.id === id; });
    }
    function publishedPoint(profile, age) {
      return profile && profile.points.find(function (point) {
        return point.ageYears === age && point.eligible !== false;
      });
    }
    var sampling = policy.sampling;
    var trend = policy.adultTrend;
    var schematic = policy.schematic;
    var scale = policy.scale;
    if (!sampling || !trend || !schematic || !scale ||
        scale.basis !== 'fixed-published-source-node' || scale.patientValueMayChangeScale !== false ||
        !finite(scale.headroomFactor) || scale.headroomFactor <= 1 ||
        !Number.isInteger(sampling.sourceSampleCount) || sampling.sourceSampleCount < 2 || sampling.sourceSampleCount > 2000 ||
        !finite(sampling.denseStartAge) || !finite(sampling.denseStepYears) || sampling.denseStepYears <= 0 ||
        sampling.includePublishedPediatricEndpoint !== true ||
        trend.kind !== 'illustrative-adult-trend' || trend.coordinate !== 'canonical-whole-life-display-x' ||
        trend.endpointAge !== 'published-group-mean-age' || trend.method !== 'single-cubic-bezier-horizontal-end-tangents' ||
        !finite(trend.startHandle) || !finite(trend.endHandle) || trend.startHandle <= 0 ||
        trend.endHandle <= 0 || trend.startHandle + trend.endHandle > 1 ||
        !Number.isInteger(trend.sampleCount) || trend.sampleCount < 3 || trend.sampleCount > 2000 ||
        !finite(schematic.prenatalLastAnchorAge) || schematic.prenatalScale !== scale.basis ||
        schematic.tailScale !== 'hold-last-source-value' || !finite(schematic.tailMaxAge)) return null;
    var infant = profileById(sampling.infantSourceId);
    var pediatric = profileById(sampling.pediatricSourceId);
    var adultFirst = profileById(trend.startSourceId);
    var adultLast = profileById(trend.endSourceId);
    var scaleSource = profileById(scale.sourceId);
    var scalePoint = publishedPoint(scaleSource, scale.ageYears);
    if (!infant || !pediatric || !adultFirst || !adultLast || !scalePoint || scaleSource !== pediatric ||
        scale.ageYears !== pediatric.maxAge || scalePoint.value <= 0 ||
        infant !== profiles[0] || adultLast !== profiles[profiles.length - 1] ||
        sampling.denseStartAge < pediatric.minAge || sampling.denseStartAge >= pediatric.maxAge ||
        schematic.prenatalLastAnchorAge >= infant.minAge || schematic.tailMaxAge <= adultLast.maxAge ||
        schematic.tailMaxAge > stages[stages.length - 1].max ||
        pediatric.points.some(function (point) { return point.eligible === false; })) return null;
    var adultProfiles = profiles.slice(profiles.indexOf(adultFirst));
    if (adultProfiles.some(function (profile, index) {
      return profile.statistic !== 'group-mean' || profile.interpolation !== 'constant' ||
        !finite(profile.meanAge) || profile.meanAge < profile.minAge || profile.meanAge >= profile.maxAge ||
        profile.points.some(function (point) { return point.eligible === false || point.value !== profile.points[0].value; }) ||
        (index > 0 && (profile.minAge !== adultProfiles[index - 1].maxAge || profile.meanAge <= adultProfiles[index - 1].meanAge));
    }) || adultFirst.minAge !== pediatric.maxAge || !pediatric.maxAgeExclusive || adultLast.maxAgeExclusive) return null;
    var infantPoints = infant.points.filter(function (point) {
      return point.eligible !== false && point.ageYears >= infant.minAge && point.ageYears <= infant.maxAge;
    });
    if (infantPoints.length < 2 || infantPoints[0].ageYears !== infant.minAge) return null;
    var lastInfant = infantPoints[infantPoints.length - 1];
    var transitions = policy.transitions.map(function (item) {
      return item && { minAge: item.minAge, maxAge: item.maxAge,
        fromSource: item.fromSource, toSource: item.toSource, kind: item.kind };
    });
    var childhood = transitions[0], adulthood = transitions[1];
    if (!childhood || !adulthood ||
        childhood.minAge !== lastInfant.ageYears || childhood.maxAge !== pediatric.minAge ||
        childhood.fromSource !== infant.id || childhood.toSource !== pediatric.id || childhood.kind !== 'illustrative-childhood' ||
        childhood.minAge >= childhood.maxAge ||
        adulthood.minAge !== pediatric.maxAge || adulthood.maxAge !== adultFirst.meanAge ||
        adulthood.fromSource !== pediatric.id || adulthood.toSource !== adultFirst.id || adulthood.kind !== 'illustrative-transition' ||
        adulthood.minAge >= adulthood.maxAge) return null;
    var divisor = scalePoint.value;
    var ceiling = scale.headroomFactor;
    var invalid = false;
    var knots = new Map();
    function add(ageYears, value) {
      if (!finite(ageYears) || !finite(value) || value < 0 || value > divisor * ceiling) { invalid = true; return; }
      knots.set(ageYears, { ageYears: ageYears, value: value });
    }
    // Read only source observations, never evaluate or qualify a patient.
    infantPoints.forEach(function (point) { add(point.ageYears, engine.referenceAt(infant, point.ageYears)); });
    var samples = engine.sampleProfile(pediatric, sampling.sourceSampleCount);
    if (!Array.isArray(samples) || samples.length < 2) return null;
    var pediatricAges = new Set(samples.map(function (point) { return point.ageYears; }));
    pediatric.points.forEach(function (point) { pediatricAges.add(point.ageYears); });
    stages.forEach(function (stage) { pediatricAges.add(stage.min); pediatricAges.add(stage.max); });
    for (var age = Math.ceil(pediatric.minAge); age < sampling.denseStartAge; age++) pediatricAges.add(age);
    pediatricAges.forEach(function (ageYears) {
      if (ageYears >= pediatric.minAge && ageYears < sampling.denseStartAge)
        add(ageYears, engine.referenceAt(pediatric, ageYears));
    });
    // An inclusive clone makes the published endpoint a drawing anchor only.
    // The original pediatric domain and adult routing remain untouched.
    var fullPediatric = Object.assign({}, pediatric, { maxAgeExclusive: false });
    var denseSteps = Math.round((pediatric.maxAge - sampling.denseStartAge) / sampling.denseStepYears);
    if (denseSteps < 1 || denseSteps > 2000 ||
        Math.abs(sampling.denseStartAge + denseSteps * sampling.denseStepYears - pediatric.maxAge) > 1e-10) return null;
    for (var step = 0; step <= denseSteps; step++) {
      var denseAge = step === denseSteps ? pediatric.maxAge : sampling.denseStartAge + step * sampling.denseStepYears;
      add(denseAge, engine.referenceAt(fullPediatric, denseAge));
    }
    function lifeX(ageYears) {
      var offset = 0;
      for (var i = 0; i < stages.length; i++) {
        var stage = stages[i];
        if (ageYears <= stage.max) return offset + (ageYears - stage.min) / (stage.max - stage.min) * stage.width;
        offset += stage.width;
      }
      return null;
    }
    function ageAtLifeX(x) {
      var offset = 0;
      for (var i = 0; i < stages.length; i++) {
        var stage = stages[i];
        if (x <= offset + stage.width) return stage.min + (x - offset) / stage.width * (stage.max - stage.min);
        offset += stage.width;
      }
      return null;
    }
    var startValue = engine.referenceAt(adultFirst, adultFirst.meanAge);
    var endValue = engine.referenceAt(adultLast, adultLast.meanAge);
    if (!finite(startValue) || !finite(endValue) || startValue < endValue) return null;
    // One broad cubic in the canonical drawing coordinate avoids knees from
    // group-to-group fitting and from the time-axis change in older age.
    // Published intermediate group means remain separate numerical references.
    var x0 = lifeX(adultFirst.meanAge);
    var width = lifeX(adultLast.meanAge) - x0;
    if (!finite(x0) || !finite(width) || width <= 0) return null;
    for (var sample = 0; sample < trend.sampleCount; sample++) {
      var t = sample / (trend.sampleCount - 1), u = 1 - t;
      var xFraction = 3 * u * u * t * trend.startHandle + 3 * u * t * t * (1 - trend.endHandle) + t * t * t;
      var arcAge = sample === 0 ? adultFirst.meanAge : sample === trend.sampleCount - 1 ? adultLast.meanAge : ageAtLifeX(x0 + width * xFraction);
      add(arcAge, startValue + (endValue - startValue) * (3 * t * t - 2 * t * t * t));
    }
    data.maleAges.forEach(function (ageYears, index) {
      if (ageYears <= schematic.prenatalLastAnchorAge) add(ageYears, hormone.values[index] * divisor);
    });
    add(adultLast.maxAge, endValue);
    add(schematic.tailMaxAge, endValue);
    transitions.forEach(function (transition) {
      if (!knots.has(transition.minAge) || !knots.has(transition.maxAge)) invalid = true;
    });
    var points = Array.from(knots.values()).sort(function (a, b) { return a.ageYears - b.ageYears; });
    if (invalid || points.length < 2) return null;
    return {
      id: 't', kind: policy.kind, unit: policy.unit, policyVersion: policy.version,
      points: points, profiles: profiles, sourceIds: policy.sourceIds.slice(),
      divisor: divisor, ceiling: ceiling, transitions: transitions, anchors: [], tangentOverrides: [],
      illustrativeIntervals: [
        { minAge: points[0].ageYears, maxAge: infant.minAge, kind: 'prenatal-lead' },
        ...transitions,
        { minAge: adultFirst.meanAge, maxAge: adultLast.maxAge, kind: trend.kind },
        { minAge: adultLast.maxAge, maxAge: schematic.tailMaxAge, kind: 'older-age-tail' }
      ]
    };
  }

  function buildMaleGonadotropin(data, engine, id) {
    var shared = data && data.lhFshDisplayPolicy;
    var policy = shared && shared.hormones && shared.hormones[id];
    var sources = data && data.patientPointData && data.patientPointData.profiles;
    var stages = data && data.maleStages;
    if ((id !== 'lh' && id !== 'fsh') || !shared || !policy ||
        shared.kind !== 'educational-display-only' || shared.sex !== 'male' || shared.unit !== 'IU/L' ||
        typeof shared.version !== 'string' || !shared.version.trim() ||
        shared.coordinate !== 'canonical-whole-life-display-x' || shared.providesClinicalReference !== false ||
        !finite(shared.daysPerYear) || shared.daysPerYear < 365 || shared.daysPerYear > 366 ||
        !Number.isInteger(shared.ageKeyPrecision) || shared.ageKeyPrecision < 6 || shared.ageKeyPrecision > 14 ||
        !Array.isArray(sources) || !Array.isArray(stages) || !stages.length ||
        !engine || typeof engine.referenceAt !== 'function' ||
        !Array.isArray(policy.sourceIds) || !policy.sourceIds.length ||
        new Set(policy.sourceIds).size !== policy.sourceIds.length) return null;
    if (stages.some(function (stage, index) {
      return !stage || !finite(stage.min) || !finite(stage.max) || stage.min >= stage.max ||
        !finite(stage.width) || stage.width <= 0 || (index > 0 && stage.min !== stages[index - 1].max);
    }) || Math.abs(stages.reduce(function (sum, stage) { return sum + stage.width; }, 0) - 1) > 1e-10) return null;
    var profiles = policy.sourceIds.map(function (sourceId) {
      var matching = sources.filter(function (profile) { return profile && profile.id === sourceId; });
      return matching.length === 1 ? matching[0] : null;
    });
    if (profiles.some(function (profile) {
      return !profile || profile.sex !== 'male' || profile.analyte !== id || profile.unit !== 'IU/L' ||
        !finite(profile.minAge) || !finite(profile.maxAge) || profile.minAge >= profile.maxAge ||
        !Array.isArray(profile.points) || profile.points.length < 2 ||
        profile.points.some(function (point, index, points) {
          return !point || !finite(point.ageYears) || !finite(point.value) || point.value < 0 ||
            (index > 0 && point.ageYears <= points[index - 1].ageYears);
        });
    })) return null;
    function profileById(sourceId) {
      return profiles.find(function (profile) { return profile.id === sourceId; });
    }
    var scale = policy.scale, prenatal = policy.prenatalSchematic, infant = policy.infant;
    var childhood = policy.childhood, puberty = policy.puberty, trend = policy.adultTrend, tail = policy.tail;
    if (!scale || !prenatal || !infant || !childhood || !puberty || !trend || !tail ||
        scale.basis !== 'fixed-approved-display-scale' || scale.patientValueMayChangeScale !== false ||
        !finite(scale.divisor) || scale.divisor <= 0 || !finite(scale.headroomFactor) || scale.headroomFactor <= 1 ||
        !finite(scale.sourceAgeYears) ||
        prenatal.coordinateSystem !== 'dimensionless display fractions; not fetal concentrations' ||
        prenatal.providesPatientReference !== false || !Array.isArray(prenatal.points) || prenatal.points.length < 2 ||
        childhood.providesPatientReference !== false || !Array.isArray(childhood.points) ||
        !finite(childhood.minAge) || !finite(childhood.maxAge) || childhood.minAge >= childhood.maxAge ||
        (childhood.kind !== 'schematic-low-baseline' && childhood.kind !== 'low-childhood-bridge') ||
        tail.kind !== 'older-age-tail' || tail.mode !== 'flat-fading-illustration' || tail.providesPatientReference !== false ||
        !finite(tail.minAge) || !finite(tail.maxAge) || tail.minAge >= tail.maxAge ||
        tail.maxAge > stages[stages.length - 1].max) return null;
    var divisor = scale.divisor, ceiling = scale.headroomFactor;
    var axisTop = divisor * ceiling;
    var infantSource = profileById(infant.sourceId), pediatricSource = profileById(puberty.sourceId);
    var adultFirst = profileById(puberty.endSourceId), scaleSource = profileById(scale.sourceId);
    if (!finite(axisTop) || !infantSource || !pediatricSource || !adultFirst || !scaleSource ||
        engine.referenceAt(scaleSource, scale.sourceAgeYears) !== divisor ||
        !finite(infant.peakAgeDays) || infant.peakAgeDays <= 0 || infant.peakAgeIsIllustrative !== true ||
        !finite(infant.peakValue) || infant.peakValue <= 0 || infant.peakValue > axisTop ||
        !finite(infant.sourceStartAgeDays) || infant.sourceStartAgeDays <= infant.peakAgeDays ||
        !finite(infant.sourceMaxAgeYears) || infant.sourceMaxAgeYears <= infant.sourceStartAgeDays / shared.daysPerYear ||
        typeof infant.includeSourceMaxAge !== 'boolean' || !Array.isArray(infant.shoulderPoints) ||
        infant.sourceStartAgeDays / shared.daysPerYear < infantSource.minAge ||
        infant.sourceMaxAgeYears > infantSource.maxAge || childhood.maxAge !== pediatricSource.minAge ||
        puberty.kind !== 'illustrative-puberty-adult-bridge' ||
        (trend.kind !== 'illustrative-adult-trend' && trend.kind !== 'source-constrained-illustrative-adult-trend') ||
        !finite(puberty.minAge) || !finite(puberty.maxAge) || puberty.minAge >= puberty.maxAge ||
        !finite(puberty.startDerivativeStepYears) || puberty.startDerivativeStepYears <= 0 || puberty.startDerivativeStepYears > 0.01 ||
        puberty.minAge - puberty.startDerivativeStepYears < pediatricSource.minAge ||
        puberty.minAge + puberty.startDerivativeStepYears > pediatricSource.maxAge ||
        puberty.minAge < childhood.maxAge ||
        !finite(puberty.endValue) || puberty.endValue <= 0 || puberty.endValue > axisTop ||
        engine.referenceAt(adultFirst, puberty.maxAge) !== puberty.endValue ||
        !finite(puberty.endSlopePerYear) || puberty.endSlopePerYear < 0 ||
        trend.minAge !== puberty.maxAge || !finite(trend.maxAge) || trend.maxAge <= trend.minAge ||
        !finite(trend.endValue) || trend.endValue < puberty.endValue || trend.endValue > axisTop ||
        trend.endSlopePerYear !== 0 || trend.maxAge > tail.minAge ||
        trend.maxAge >= tail.maxAge) return null;
    function validArc(item) {
      return Array.isArray(item.controlFractions) && item.controlFractions.length === 2 &&
        item.controlFractions.every(function (value) { return finite(value) && value > 0; }) &&
        item.controlFractions[0] + item.controlFractions[1] <= 1 &&
        Number.isInteger(item.sampleCount) && item.sampleCount >= 3 && item.sampleCount <= 2000;
    }
    if (![infant, puberty, trend].every(validArc) ||
        prenatal.points.some(function (point, index, points) {
          return !point || !finite(point.ageYears) || point.ageYears > 0 || point.ageYears < stages[0].min ||
            !finite(point.relative) || point.relative < 0 || point.relative > 1 ||
            (index > 0 && point.ageYears <= points[index - 1].ageYears);
        }) || prenatal.points[0].ageYears !== stages[0].min || prenatal.points[prenatal.points.length - 1].ageYears !== 0 ||
        infant.shoulderPoints.some(function (point, index, points) {
          return !point || !finite(point.ageDays) || point.ageDays <= infant.peakAgeDays ||
            point.ageDays >= infant.sourceStartAgeDays || !finite(point.value) || point.value < 0 ||
            point.value > infant.peakValue || (index > 0 &&
              (point.ageDays <= points[index - 1].ageDays || point.value > points[index - 1].value));
        }) || childhood.points.some(function (point, index, points) {
          return !point || !finite(point.ageYears) || point.ageYears <= childhood.minAge ||
            point.ageYears >= childhood.maxAge || !finite(point.value) || point.value < 0 || point.value > axisTop ||
            (index > 0 && point.ageYears <= points[index - 1].ageYears);
        })) return null;
    function lifeX(ageYears) {
      var offset = 0;
      for (var i = 0; i < stages.length; i++) {
        var stage = stages[i];
        if (ageYears <= stage.max) return offset + (ageYears - stage.min) / (stage.max - stage.min) * stage.width;
        offset += stage.width;
      }
      return null;
    }
    function ageAtLifeX(x) {
      var offset = 0;
      for (var i = 0; i < stages.length; i++) {
        var stage = stages[i];
        if (x <= offset + stage.width + 1e-12) return stage.min + (x - offset) / stage.width * (stage.max - stage.min);
        offset += stage.width;
      }
      return null;
    }
    function canonicalSlope(slopePerYear, ageYears) {
      var stage = stages.find(function (item) { return ageYears >= item.min && ageYears < item.max; });
      return stage ? slopePerYear * (stage.max - stage.min) / stage.width : null;
    }
    function bezier(a, b, c, d, t) {
      var u = 1 - t;
      return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
    }
    var invalid = false, knots = new Map();
    function add(ageYears, value) {
      if (!finite(ageYears) || ageYears < stages[0].min || ageYears > tail.maxAge ||
          !finite(value) || value < 0 || value > axisTop) { invalid = true; return; }
      knots.set(Number(ageYears.toFixed(shared.ageKeyPrecision)), { ageYears: ageYears, value: value });
    }
    function arc(minAge, maxAge, startValue, endValue, item, startSlope, endSlope) {
      var x0 = lifeX(minAge), x1 = lifeX(maxAge), width = x1 - x0;
      var firstHandle = item.controlFractions[0], lastHandle = item.controlFractions[1];
      var c1 = startValue + startSlope * width * firstHandle;
      var c2 = endValue - endSlope * width * lastHandle;
      if (!finite(x0) || !finite(x1) || width <= 0 || !finite(startValue) || !finite(endValue) ||
          !finite(startSlope) || !finite(endSlope) || !finite(c1) || !finite(c2) ||
          startValue > c1 || c1 > c2 || c2 > endValue) { invalid = true; return; }
      for (var i = 0; i < item.sampleCount; i++) {
        var t = i / (item.sampleCount - 1);
        var ageYears = i === 0 ? minAge : i === item.sampleCount - 1 ? maxAge :
          ageAtLifeX(bezier(x0, x0 + width * firstHandle, x1 - width * lastHandle, x1, t));
        add(ageYears, bezier(startValue, c1, c2, endValue, t));
      }
    }
    // These are frozen graphic fractions, not concentrations inferred from
    // infant data. Multiplication only adapts them to the renderer's coordinates.
    prenatal.points.forEach(function (point) { add(point.ageYears, point.relative * divisor * ceiling); });
    var birth = knots.get(0);
    if (!birth) return null;
    arc(0, infant.peakAgeDays / shared.daysPerYear, birth.value, infant.peakValue, infant, 0, 0);
    infant.shoulderPoints.forEach(function (point) { add(point.ageDays / shared.daysPerYear, point.value); });
    var sourcePoints = infantSource.points.filter(function (point) {
      return point.eligible !== false && point.ageYears >= infant.sourceStartAgeDays / shared.daysPerYear &&
        point.ageYears <= infant.sourceMaxAgeYears;
    });
    if (sourcePoints.length < 2) return null;
    sourcePoints.forEach(function (point) { add(point.ageYears, point.value); });
    var childhoodStart = sourcePoints[sourcePoints.length - 1].ageYears;
    if (infant.includeSourceMaxAge) {
      // Only the drawing may read the published endpoint; source routing stays exclusive.
      var inclusiveInfant = Object.assign({}, infantSource, { maxAgeExclusive: false });
      add(infant.sourceMaxAgeYears, engine.referenceAt(inclusiveInfant, infant.sourceMaxAgeYears));
      childhoodStart = infant.sourceMaxAgeYears;
    }
    if (childhoodStart !== childhood.minAge) return null;
    childhood.points.forEach(function (point) { add(point.ageYears, point.value); });
    pediatricSource.points.filter(function (point) {
      return point.ageYears >= pediatricSource.minAge && point.ageYears <= puberty.minAge;
    }).forEach(function (point) {
      if (point.eligible === false) invalid = true;
      add(point.ageYears, point.value);
    });
    var delta = puberty.startDerivativeStepYears;
    var startValue = engine.referenceAt(pediatricSource, puberty.minAge);
    var before = engine.referenceAt(pediatricSource, puberty.minAge - delta);
    var after = engine.referenceAt(pediatricSource, puberty.minAge + delta);
    if (!finite(startValue) || !finite(before) || !finite(after)) return null;
    var startSlope = (after - before) / (lifeX(puberty.minAge + delta) - lifeX(puberty.minAge - delta));
    var adultSlope = canonicalSlope(puberty.endSlopePerYear, puberty.maxAge);
    arc(puberty.minAge, puberty.maxAge, startValue, puberty.endValue, puberty, startSlope, adultSlope);
    arc(trend.minAge, trend.maxAge, puberty.endValue, trend.endValue, trend, adultSlope, 0);
    add(tail.maxAge, trend.endValue);
    var points = Array.from(knots.values()).sort(function (a, b) { return a.ageYears - b.ageYears; });
    if (invalid || points.length < 2 || points.some(function (point, index) {
      return index > 0 && point.ageYears <= points[index - 1].ageYears;
    })) return null;
    var transitions = [
      { minAge: puberty.minAge, maxAge: puberty.maxAge, kind: puberty.kind,
        controlFractions: puberty.controlFractions.slice(), startSlopeCanonical: startSlope,
        endSlopeCanonical: adultSlope },
      { minAge: trend.minAge, maxAge: trend.maxAge, kind: trend.kind,
        controlFractions: trend.controlFractions.slice(), startSlopeCanonical: adultSlope,
        endSlopeCanonical: 0 }
    ];
    if (trend.sourceDoi) transitions[1].sourceDoi = trend.sourceDoi;
    if (finite(trend.fitErrorRmsIuL)) transitions[1].fitErrorRmsIuL = trend.fitErrorRmsIuL;
    return {
      id: id, kind: shared.kind, unit: shared.unit, policyVersion: shared.version,
      points: points, profiles: profiles, sourceIds: policy.sourceIds.slice(),
      divisor: divisor, ceiling: ceiling, transitions: transitions, tangentOverrides: [],
      prenatalSchematic: { coordinateSystem: prenatal.coordinateSystem, policy: prenatal.policy,
        points: prenatal.points.map(function (point) { return { ageYears: point.ageYears, relative: point.relative }; }) },
      illustrativeIntervals: [
        { minAge: prenatal.points[0].ageYears, maxAge: 0, kind: 'prenatal-schematic' },
        { minAge: 0, maxAge: infant.sourceStartAgeDays / shared.daysPerYear, kind: 'broad-early-infant-rise',
          controlFractions: infant.controlFractions.slice(), peakAgeIsIllustrative: true },
        { minAge: childhood.minAge, maxAge: childhood.maxAge, kind: childhood.kind },
        ...transitions,
        { minAge: tail.minAge, maxAge: tail.maxAge, kind: tail.kind }
      ]
    };
  }

  function safeMaleGonadotropin(data, engine, id) {
    // Fail closed if an incomplete source bundle or malformed policy reaches
    // this optional display layer; never manufacture a patient reference.
    try { return buildMaleGonadotropin(data, engine, id); }
    catch (_error) { return null; }
  }

  function buildMaleLh(data, engine) { return safeMaleGonadotropin(data, engine, 'lh'); }
  function buildMaleFsh(data, engine) { return safeMaleGonadotropin(data, engine, 'fsh'); }
  function buildMaleGonadotropins(data, engine) {
    return [buildMaleLh(data, engine), buildMaleFsh(data, engine)].filter(Boolean);
  }

  return { buildMaleInhibin: buildMaleInhibin, buildMaleTestosterone: buildMaleTestosterone,
    buildMaleLh: buildMaleLh, buildMaleFsh: buildMaleFsh, buildMaleGonadotropins: buildMaleGonadotropins };
});
