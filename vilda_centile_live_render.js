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

  // The inline view uses the full canvas. Only fullscreen needs the exact
  // non-white bounds, so its readback/scan may run after the first painted view.
  // Keep each read small too: a row may be very wide after an annotation moves
  // outside the original canvas. No partial bounds are published to the view.
  function prepareContentBounds(rendered, options) {
    var cfg = options || {};
    var assets = [], scans = [], completed = [], index = 0;
    var settled = false, priority = false, channel = null, timer = null;
    var resolve;
    var promise = new Promise(function (done) { resolve = done; });

    function add(asset) {
      if (asset && asset.canvas && !asset.contentBounds && assets.indexOf(asset) < 0) assets.push(asset);
    }
    (rendered && rendered.ranges || []).forEach(function (range) {
      METRICS.forEach(function (metric) { add(range[metric]); });
    });
    METRICS.forEach(function (metric) { add(rendered && rendered[metric]); });
    rendered = null;

    function finish(status, error) {
      if (settled) return;
      settled = true;
      if (timer !== null) { w.clearTimeout(timer); timer = null; }
      if (channel) {
        channel.port1.onmessage = null;
        channel.port1.close(); channel.port2.close(); channel = null;
      }
      assets = []; scans = []; completed = [];
      cfg = {};
      resolve(error ? { status: status, error: error } : { status: status });
    }
    function current() {
      if (typeof cfg.isCurrent !== 'function' || cfg.isCurrent()) return true;
      finish('cancelled');
      return false;
    }
    function now() {
      return w.performance && typeof w.performance.now === 'function' ? w.performance.now() : Date.now();
    }
    function bounds(scan) {
      if (scan.right < scan.left) return { x: 0, y: 0, width: scan.width, height: scan.height };
      var left = Math.max(0, scan.left - 12), top = Math.max(0, scan.top - 12);
      var right = Math.min(scan.width, scan.right + 13), bottom = Math.min(scan.height, scan.bottom + 13);
      return { x: left, y: top, width: right - left, height: bottom - top };
    }
    function readTile(scan) {
      var canvas = scan.canvas;
      if (canvas.width !== scan.width || canvas.height !== scan.height) throw new Error('Centile canvas changed during preparation');
      var width = Math.min(4096, scan.width - scan.x);
      var height = Math.min(scan.rows, scan.height - scan.y);
      var pixels = canvas.getContext('2d').getImageData(scan.x, scan.y, width, height).data;
      for (var y = 0; y < height; y++) {
        for (var x = 0; x < width; x++) {
          var pixel = (y * width + x) * 4;
          if (pixels[pixel] < 255 || pixels[pixel + 1] < 255 || pixels[pixel + 2] < 255) {
            var atX = scan.x + x, atY = scan.y + y;
            if (atX < scan.left) scan.left = atX;
            if (atX > scan.right) scan.right = atX;
            if (atY < scan.top) scan.top = atY;
            if (atY > scan.bottom) scan.bottom = atY;
          }
        }
      }
      scan.x += width;
      if (scan.x === scan.width) { scan.x = 0; scan.y += height; }
      return scan.y === scan.height;
    }
    function enqueue() {
      if (settled) return;
      if (channel) channel.port2.postMessage(null);
      else timer = w.setTimeout(run, 0);
    }
    function run() {
      timer = null;
      if (settled) return;
      try {
        if (!current()) return;
        var started = now(), tiles = 0;
        // Time is checked between bounded reads. A browser may still need to
        // flush earlier canvas drawing on a read; the budget is not a hard
        // guarantee about GPU work. Never scan a whole image in one task.
        while (index < scans.length && tiles < 4) {
          if (readTile(scans[index])) { completed.push(bounds(scans[index])); index += 1; }
          if (settled) return;
          tiles += 1;
          if (now() - started >= (priority ? 8 : 4)) break;
        }
        if (!current()) return;
        if (index === scans.length) {
          assets.forEach(function (asset, position) { asset.contentBounds = completed[position]; });
          finish('ready');
        } else enqueue();
      } catch (error) { finish('error', error); }
    }
    try {
      if (current()) {
        scans = assets.map(function (asset) {
          var canvas = asset.canvas, width = canvas.width, height = canvas.height;
          if (!(width > 0 && height > 0)) throw new Error('Invalid centile canvas size');
          return { canvas: canvas, width: width, height: height, x: 0, y: 0,
            rows: Math.max(1, Math.min(32, Math.floor(32768 / Math.min(4096, width)))),
            left: width, right: -1, top: height, bottom: -1 };
        });
        if (!scans.length) finish('ready');
        else {
          if (typeof w.MessageChannel === 'function') {
            channel = new w.MessageChannel();
            channel.port1.onmessage = run;
          }
          enqueue();
        }
      }
    } catch (error) { finish('error', error); }
    return { promise: promise, cancel: function () { finish('cancelled'); },
      prioritize: function () { priority = true; } };
  }

  function mphFor(snapshot, advanced, plot, enabled) {
    if (!enabled || !positive(advanced.motherHeight) || !positive(advanced.fatherHeight) || !positive(advanced.targetHeight)) return null;
    if (216 < plot.ageMin || 216 > plot.ageMax || advanced.targetHeight < plot.minY || advanced.targetHeight > plot.maxY) return null;
    return Object.assign({ ageMonths: 216, value: advanced.targetHeight, motherHeight: advanced.motherHeight,
      fatherHeight: advanced.fatherHeight, targetHeight: advanced.targetHeight },
    snapshot.population === 'DS' ? { percentile: null, sd: null, source: snapshot.source }
      : statsFor('height', advanced.targetHeight, 216, snapshot.sex, snapshot.source, snapshot.population), mappedPoint(plot, 216, advanced.targetHeight));
  }

  function renderMetric(model, metric, snapshot, advanced, context, sourceGeometries, deferBounds) {
    var pc = w.VildaPublicationCreator;
    var vectorPatient = !!w.VildaCentileLiveColors;
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
      skipUserPoint: vectorPatient, plotMetrics: plotMetrics, cutoffVal: model.maxY > model.officialMaxY ? model.officialMaxY : undefined,
      bandReferenceVisible: enabled('bandReference'), valueLabelVisible: enabled(metric === 'height' ? 'heightLabel' : 'weightLabel')
    }));
    if (!vectorPatient) w.drawCentileMeasurementSeries(ctx, Object.assign({}, RECT, {
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
      source: snapshot.source, sex: snapshot.sex, population: snapshot.population, annotations: items,
      vectorPatient: vectorPatient, valueLabelVisible: enabled(metric === 'height' ? 'heightLabel' : 'weightLabel'), points: pointsFor(model, metric, snapshot, plot),
      contentBounds: deferBounds ? null : contentBounds(canvas), mph: metric === 'height' ? mphFor(snapshot, advanced, plot, enabled('mph')) : null };
    result.probe = function (age) { return probe(result, age); };
    return result;
  }

  function empty(source, message) {
    return { status: 'unavailable', source: source, message: message, height: null, weight: null,
      ranges: [], rangePlan: null, activeRangeId: null };
  }

  function unavailable(snapshot) {
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
    return null;
  }

  function normalizedSnapshot(snapshot) {
    return Object.assign({}, snapshot, { source: String(snapshot.source || snapshot.requestedSource || '').toUpperCase(),
      sex: snapshot.sex === 'M' ? 'M' : 'F', population: snapshot.population === 'DS' ? 'DS' : 'OGOLNA' });
  }

  function modelRanges(input, advanced, args, prepared) {
    var source = input.source, ranges = [], plan = null;
    var models = prepared || {};
    if (source === 'PALCZEWSKA') {
      plan = w.getPalczewskaChartPlan(input.ageMonths, advanced);
      if (plan.mode !== 'EXTENDED_ONLY') ranges.push({ id: 'palInfant', label: '0–3 lata', models: pageModels(args, source) });
      if (plan.mode !== 'INFANT_ONLY') ranges.push({ id: 'palRegular', label: '1–18 lat', models: models.pal || palModels(args) });
    } else ranges.push({ id: source === 'OLAF' ? 'olaf' : 'who', label: source === 'OLAF' ? '3–18 lat' : '0–3 lata',
      models: source === 'OLAF' && models.olaf || pageModels(args, source) });
    return { ranges: ranges, plan: plan };
  }

  function bundle(input, ranges, plan) {
    var active = ranges.find(function (range) { return range.id === (input.ageMonths < 36 ? 'palInfant' : 'palRegular'); }) || ranges[0];
    return { status: 'ready', source: input.source, height: active.height, weight: active.weight,
      ranges: ranges, rangePlan: plan, activeRangeId: active.id };
  }

  function previewMetric(model, metric, input) {
    var plot = { x: 0, y: 0, w: 1, h: 1, ageMin: model.minX, ageMax: model.maxX, minY: model.minY, maxY: model.maxY };
    var curves = {};
    // Producers return inclusive monthly samples. Keep those source values:
    // the SVG view supplies only screen geometry, never a new interpolation.
    [3, 50, 97].forEach(function (percentile) { curves[percentile] = model.curves[percentile].slice(); });
    var result = { preview: true, width: 1, height: 1, plot: plot, metric: metric,
      source: input.source, sex: input.sex, population: input.population,
      curves: curves, percentiles: [3, 50, 97], sampleStepMonths: 1,
      officialMaxY: model.officialMaxY, units: model.units, title: model.title,
      points: pointsFor(model, metric, input, plot), annotations: [], mph: null };
    result.probe = function (age) { return probe(result, age); };
    return result;
  }

  function preview(snapshot) {
    var rejected = unavailable(snapshot);
    if (rejected) return rejected;
    var input = normalizedSnapshot(snapshot);
    var advanced = advancedSnapshot(input);
    var prepared = modelRanges(input, advanced, producerArgs(input, advanced));
    prepared.ranges.forEach(function (range) {
      METRICS.forEach(function (metric) { range[metric] = previewMetric(range.models[metric], metric, input); });
      delete range.models;
    });
    return bundle(input, prepared.ranges, prepared.plan);
  }

  function render(snapshot, options) {
    var rejected = unavailable(snapshot);
    if (rejected) return rejected;
    ['buildCentilePageCanvas', 'buildPalczewskaExtendedCanvases', 'drawCentileGrid', 'drawCentileMeasurementSeries',
      'getCentilePlotMetrics', 'getCentilePercentileStatsForSource'].forEach(function (name) {
      if (typeof w[name] !== 'function') throw new Error('Missing centile renderer dependency: ' + name);
    });
    if (!w.VildaPublicationCreator || typeof w.VildaPublicationCreator.computeSnapshotLayout !== 'function') throw new Error('Missing snapshot annotation renderer');
    var input = normalizedSnapshot(snapshot);
    var advanced = advancedSnapshot(input);
    var args = producerArgs(input, advanced);
    var olaf = pageModels(args, 'OLAF');
    var pal = palModels(args);
    var sourceGeometries = { olaf: olaf.originalGeometries, palRegular: originalPalGeometries(pal) };
    var prepared = modelRanges(input, advanced, args, { olaf: olaf, pal: pal });
    var ranges = prepared.ranges;
    ranges.forEach(function (range) {
      METRICS.forEach(function (metric) {
        range[metric] = renderMetric(range.models[metric], metric, input, advanced, range.id, sourceGeometries,
          !!(options && options.deferContentBounds));
      });
      delete range.models;
    });
    return bundle(input, ranges, prepared.plan);
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

  w.VildaCentileLiveRender = { preview: preview, render: render, probe: probe, prepareContentBounds: prepareContentBounds };
})(typeof window !== 'undefined' ? window : globalThis);
