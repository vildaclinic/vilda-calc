/* Read-only centile panel adapter.
 *
 * Curves, smoothing, range expansion and measurement deduplication belong to
 * the existing PDF producers. Their optional modelOnly/growthData arguments
 * stop before canvas/header creation and any Creator/global state setters.
 * The adapter changes presentation geometry only; clinical readouts always
 * call getCentilePercentileStatsForSource with explicit sex, source and age.
 * No patient globals, DOM inputs, persistence or Creator caches are replaced.
 */
(function (w) {
  'use strict';
  if (!w || w.VildaCentileLiveRender) return;

  var WIDTH = 2296;
  var HEIGHT = 3041;
  var RECT = { x: 70, y: 35.45, w: 2166, h: 2905.1 };
  var METRICS = ['height', 'weight'];

  function finite(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function positive(value) {
    return finite(value) && value > 0;
  }

  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (value && typeof value === 'object') {
      var result = {};
      Object.keys(value).forEach(function (key) { result[key] = clone(value[key]); });
      return result;
    }
    return value;
  }

  function advancedSnapshot(snapshot) {
    var advanced = clone(snapshot.advanced || {});
    advanced.measurements = clone(snapshot.measurements || advanced.measurements || []);
    advanced.currentAgeMonths = snapshot.ageMonths;
    advanced.currentHeight = positive(snapshot.currentHeight) ? snapshot.currentHeight : NaN;
    advanced.currentWeight = positive(snapshot.currentWeight) ? snapshot.currentWeight : NaN;
    advanced.sex = snapshot.sex;
    var targetHeight = w.VildaAdvancedGrowth && w.VildaAdvancedGrowth.advGrowthBuildTargetHeightForReport;
    advanced.targetHeight = positive(advanced.motherHeight) && positive(advanced.fatherHeight) && typeof targetHeight === 'function'
      ? targetHeight(snapshot.sex, { motherHeight: advanced.motherHeight, fatherHeight: advanced.fatherHeight }) : null;
    return advanced;
  }

  function producerArgs(snapshot, advanced) {
    return {
      sex: snapshot.sex,
      userAgeMonths: snapshot.ageMonths,
      userHeight: advanced.currentHeight,
      userWeight: advanced.currentWeight,
      growthData: advanced,
      legacyLayout: { standard: snapshot.standardChartStyle === true || snapshot.professionalMode === false,
        hasName: snapshot.hasHeaderName === undefined ? !!snapshot.headerName : !!snapshot.hasHeaderName, hasSubtitle: true },
      modelOnly: true
    };
  }

  function pageModels(args, source) {
    return w.buildCentilePageCanvas(Object.assign({}, args, {
      rangeMinX: source === 'OLAF' ? 36 : 0,
      rangeMaxX: source === 'WHO' ? 35 : source === 'OLAF' ? 216 : 36,
      chartSource: source
    }));
  }

  function palModels(args) {
    var models = w.buildPalczewskaExtendedCanvases(args);
    return { height: models[0], weight: models[1] };
  }

  function geometry(model, metrics) {
    return {
      plotX: metrics.px, plotY: metrics.py, plotW: metrics.pw, plotH: metrics.ph,
      ageMin: model.minX, ageMax: model.maxX, minY: model.minY, maxY: model.maxY
    };
  }

  function originalPalGeometries(models) {
    var metrics = w.getCentilePlotMetrics(157, 326.45, 2166, 2905.1);
    return { height: geometry(models.height, metrics), weight: geometry(models.weight, metrics) };
  }

  function statsFor(metric, value, age, sex, source, population) {
    var result = w.getCentilePercentileStatsForSource(value, sex, age, metric === 'height' ? 'HT' : 'WT', source,
      { population: population || 'OGOLNA' });
    return {
      percentile: result && finite(result.percentile) ? result.percentile : null,
      sd: result && finite(result.sd) ? result.sd : null,
      source: result && (result.siatka || result.source) || source,
      fallback: !!(result && result.fallback)
    };
  }

  function mappedPoint(plot, age, value) {
    return {
      x: plot.x + (age - plot.ageMin) * plot.w / (plot.ageMax - plot.ageMin),
      y: plot.y + plot.h - (value - plot.minY) * plot.h / (plot.maxY - plot.minY)
    };
  }

  function pointsFor(model, metric, snapshot, plot) {
    return model.points.map(function (point) {
      var value = point[metric];
      var current = point.ageMonths === model.userAgeMonths && value === model.userVal;
      var clinicalAge = current && finite(snapshot.exactAgeMonths) ? snapshot.exactAgeMonths : point.ageMonths;
      return Object.assign({ ageMonths: point.ageMonths, value: value, current: current, exact: true,
        clinicalAgeMonths: clinicalAge }, statsFor(metric, value, clinicalAge, snapshot.sex, snapshot.source, snapshot.population),
      mappedPoint(plot, point.ageMonths, value));
    });
  }

  function boneAgeItems(advanced, model, plot) {
    var items = [];
    var current = w.VildaBoneAge && typeof w.VildaBoneAge.chartBoneAgeMonths === 'function'
      ? w.VildaBoneAge.chartBoneAgeMonths(advanced, model.userAgeMonths)
      : advanced.boneAgeContext && advanced.boneAgeContext.version === 1 ? null : advanced.boneAgeMonths;
    var points = advanced.measurements || [];
    var duplicate = advanced.boneAgeContext && advanced.boneAgeContext.version === 1 && points.some(function (point) {
      return point && parseFloat(point.ageMonths) === model.userAgeMonths
        && parseFloat(point.height) === model.userVal && Math.round(parseFloat(point.boneAgeYears) * 12) === current;
    });
    function add(age, value, calendarAge) {
      if (!finite(age) || !positive(value) || age < plot.ageMin || age > plot.ageMax || value < plot.minY || value > plot.maxY) return;
      items.push({ bone: mappedPoint(plot, age, value), calendar: mappedPoint(plot, calendarAge, value) });
    }
    if (!duplicate) add(current, model.userVal, model.userAgeMonths);
    points.forEach(function (point) {
      if (!point) return;
      var age = parseFloat(point.ageMonths);
      var value = parseFloat(point.height);
      var bone = parseFloat(point.boneAgeYears);
      if (finite(age) && finite(bone)) add(Math.round(bone * 12), value, age);
    });
    return items;
  }

  function drawBoneAge(ctx, items) {
    ctx.save();
    ctx.strokeStyle = '#00838d'; ctx.fillStyle = '#00838d';
    ctx.lineWidth = w.getCentileChartLineWidth('boneAgeStroke', 2);
    items.forEach(function (item) {
      ctx.beginPath(); ctx.moveTo(item.bone.x, item.bone.y); ctx.lineTo(item.calendar.x, item.calendar.y); ctx.stroke();
      ctx.beginPath(); ctx.arc(item.bone.x, item.bone.y, 9, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(item.bone.x, item.bone.y, 24, 0, Math.PI * 2); ctx.stroke();
    });
    ctx.restore();
  }

  function readableAnnotations(ctx, items) {
    return items.map(function (item) {
      var words = String(item.comment || '').trim().split(/\s+/).filter(Boolean);
      var lines = [];
      words.forEach(function (word) {
        if (lines.length && lines[lines.length - 1].length + 1 + word.length <= 12) lines[lines.length - 1] += ' ' + word;
        else lines.push(word);
      });
      ctx.font = 'normal ' + item.fs + 'px sans-serif';
      var oldTextWidth = Math.max.apply(Math, [0].concat(item.lines.map(function (line) { return ctx.measureText(line).width; })));
      var textWidth = Math.max.apply(Math, [0].concat(lines.map(function (line) { return ctx.measureText(line).width; })));
      var width = item.w - oldTextWidth + textWidth;
      var height = item.h + (lines.length - item.lines.length) * item.fs * 1.3;
      return Object.assign({}, item, { lines: lines, x: item.x + (item.w - width) / 2,
        y: item.y + (item.h - height) / 2, w: width, h: height });
    });
  }

  function contentBounds(canvas) {
    var pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    var left = canvas.width, right = -1, top = canvas.height, bottom = -1;
    for (var y = 0; y < canvas.height; y++) {
      for (var x = 0; x < canvas.width; x++) {
        var index = (y * canvas.width + x) * 4;
        if (pixels[index] < 255 || pixels[index + 1] < 255 || pixels[index + 2] < 255) {
          if (x < left) left = x;
          if (x > right) right = x;
          if (y < top) top = y;
          if (y > bottom) bottom = y;
        }
      }
    }
    if (right < left) return { x: 0, y: 0, width: canvas.width, height: canvas.height };
    left = Math.max(0, left - 12); top = Math.max(0, top - 12);
    right = Math.min(canvas.width, right + 13); bottom = Math.min(canvas.height, bottom + 13);
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  function mphFor(snapshot, advanced, plot, enabled) {
    if (!enabled || !positive(advanced.motherHeight) || !positive(advanced.fatherHeight) || !positive(advanced.targetHeight)) return null;
    if (216 < plot.ageMin || 216 > plot.ageMax || advanced.targetHeight < plot.minY || advanced.targetHeight > plot.maxY) return null;
    return Object.assign({ ageMonths: 216, value: advanced.targetHeight, motherHeight: advanced.motherHeight,
      fatherHeight: advanced.fatherHeight, targetHeight: advanced.targetHeight },
    snapshot.population === 'DS' ? { percentile: null, sd: null, source: snapshot.source }
      : statsFor('height', advanced.targetHeight, 216, snapshot.sex, snapshot.source, snapshot.population), mappedPoint(plot, 216, advanced.targetHeight));
  }

  function renderMetric(model, metric, snapshot, advanced, context, sourceGeometries) {
    var pc = w.VildaPublicationCreator;
    var root = snapshot.chartCreatorData || {};
    function enabled(name) { return pc.snapshotElementEnabled(name, context, root); }
    var canvas = w.document.createElement('canvas');
    canvas.width = WIDTH; canvas.height = HEIGHT;
    var ctx = canvas.getContext('2d');
    var plotMetrics = w.getCentilePlotMetrics(RECT.x, RECT.y, RECT.w, RECT.h);
    var geom = geometry(model, plotMetrics);
    var items = readableAnnotations(ctx, pc.computeSnapshotLayout(ctx, advanced, root, context, metric, geom, { sourceGeometries: sourceGeometries }));
    // Include displaced boxes in the canvas instead of silently clipping them.
    var left = 0, top = 0, right = WIDTH, bottom = HEIGHT;
    items.forEach(function (item) {
      left = Math.min(left, item.x - 12); top = Math.min(top, item.y - 12);
      right = Math.max(right, item.x + item.w + 12); bottom = Math.max(bottom, item.y + item.h + 12);
    });
    var offsetX = -Math.floor(left), offsetY = -Math.floor(top);
    canvas.width = Math.ceil(right) + offsetX; canvas.height = Math.ceil(bottom) + offsetY;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save(); ctx.translate(offsetX, offsetY);
    w.drawCentileGrid(ctx, Object.assign({}, RECT, model, {
      plotMetrics: plotMetrics, cutoffVal: model.maxY > model.officialMaxY ? model.officialMaxY : undefined,
      bandReferenceVisible: enabled('bandReference'), valueLabelVisible: enabled(metric === 'height' ? 'heightLabel' : 'weightLabel')
    }));
    w.drawCentileMeasurementSeries(ctx, Object.assign({}, RECT, {
      plotMetrics: plotMetrics, minX: model.minX, maxX: model.maxX, minY: model.minY, maxY: model.maxY,
      points: model.points, valueKey: metric, pointRadius: 8, lastPointRadius: 8,
      lineWidth: w.getCentileChartLineWidth('historyPath', 3)
    }));
    var plot = { x: geom.plotX + offsetX, y: geom.plotY + offsetY, w: geom.plotW, h: geom.plotH,
      ageMin: geom.ageMin, ageMax: geom.ageMax, minY: geom.minY, maxY: geom.maxY };
    if (metric === 'height' && enabled('boneAge')) {
      var localPlot = Object.assign({}, plot, { x: geom.plotX, y: geom.plotY });
      drawBoneAge(ctx, boneAgeItems(advanced, model, localPlot));
    }
    pc._drawItems(ctx, items);
    ctx.restore();
    var result = { canvas: canvas, width: canvas.width, height: canvas.height, plot: plot, metric: metric,
      source: snapshot.source, sex: snapshot.sex, population: snapshot.population, annotations: items, points: pointsFor(model, metric, snapshot, plot),
      contentBounds: contentBounds(canvas), mph: metric === 'height' ? mphFor(snapshot, advanced, plot, enabled('mph')) : null };
    result.probe = function (age) { return probe(result, age); };
    return result;
  }

  function empty(source, message) {
    return { status: 'unavailable', source: source, message: message, height: null, weight: null,
      ranges: [], rangePlan: null, activeRangeId: null };
  }

  function render(snapshot) {
    if (!snapshot || !finite(snapshot.ageMonths) || !['M', 'F', 'K'].includes(snapshot.sex)) return empty(null, 'Uzupełnij wiek i płeć pacjenta.');
    var source = String(snapshot.source || snapshot.requestedSource || '').toUpperCase();
    var age = snapshot.ageMonths;
    if (!['OLAF', 'PALCZEWSKA', 'WHO'].includes(source)) return empty(source, 'Brak siatki dla wybranego źródła.');
    if (age < 0 || age >= 216 || source === 'OLAF' && age < 36 || source === 'WHO' && age >= 36
      || source === 'PALCZEWSKA' && snapshot.professionalMode === false) {
      var message = typeof w.getCentileChartUnavailableMessage === 'function'
        ? w.getCentileChartUnavailableMessage(source, age / 12, !!snapshot.professionalMode) : 'Siatka jest niedostępna dla tego wieku lub trybu.';
      return empty(source, message);
    }
    ['buildCentilePageCanvas', 'buildPalczewskaExtendedCanvases', 'drawCentileGrid', 'drawCentileMeasurementSeries',
      'getCentilePlotMetrics', 'getCentilePercentileStatsForSource'].forEach(function (name) {
      if (typeof w[name] !== 'function') throw new Error('Missing centile renderer dependency: ' + name);
    });
    if (!w.VildaPublicationCreator || typeof w.VildaPublicationCreator.computeSnapshotLayout !== 'function') throw new Error('Missing snapshot annotation renderer');
    var input = Object.assign({}, snapshot, { source: source, sex: snapshot.sex === 'M' ? 'M' : 'F',
      population: snapshot.population === 'DS' ? 'DS' : 'OGOLNA' });
    var advanced = advancedSnapshot(input);
    var args = producerArgs(input, advanced);
    var olaf = pageModels(args, 'OLAF');
    var pal = palModels(args);
    var sourceGeometries = { olaf: olaf.originalGeometries, palRegular: originalPalGeometries(pal) };
    var ranges = [], plan = null;
    if (source === 'PALCZEWSKA') {
      plan = w.getPalczewskaChartPlan(age, advanced);
      if (plan.mode !== 'EXTENDED_ONLY') ranges.push({ id: 'palInfant', label: '0–3 lata', models: pageModels(args, source) });
      if (plan.mode !== 'INFANT_ONLY') ranges.push({ id: 'palRegular', label: '1–18 lat', models: pal });
    } else ranges.push({ id: source === 'OLAF' ? 'olaf' : 'who', label: source === 'OLAF' ? '3–18 lat' : '0–3 lata', models: source === 'OLAF' ? olaf : pageModels(args, source) });
    ranges.forEach(function (range) {
      METRICS.forEach(function (metric) { range[metric] = renderMetric(range.models[metric], metric, input, advanced, range.id, sourceGeometries); });
      delete range.models;
    });
    var active = ranges.find(function (range) { return range.id === (age < 36 ? 'palInfant' : 'palRegular'); }) || ranges[0];
    return { status: 'ready', source: source, height: active.height, weight: active.weight,
      ranges: ranges, rangePlan: plan, activeRangeId: active.id };
  }

  function probe(data, age) {
    if (!data || !finite(age) || !Array.isArray(data.points) || !data.points.length) return null;
    var points = data.points;
    var exact = points.filter(function (point) { return Math.abs(point.ageMonths - age) < 0.000001; }).pop();
    if (exact) return Object.assign({}, exact);
    if (age < points[0].ageMonths || age > points[points.length - 1].ageMonths) return null;
    var right = points.findIndex(function (point) { return point.ageMonths > age; });
    if (right < 1) return null;
    var a = points[right - 1], b = points[right];
    var value = a.value + (b.value - a.value) * (age - a.ageMonths) / (b.ageMonths - a.ageMonths);
    return Object.assign({ ageMonths: age, value: value, exact: false, current: false },
      statsFor(data.metric, value, age, data.sex, data.source, data.population), mappedPoint(data.plot, age, value));
  }

  w.VildaCentileLiveRender = { render: render, probe: probe };
})(typeof window !== 'undefined' ? window : globalThis);
