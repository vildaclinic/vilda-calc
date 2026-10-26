/* Read-only presentation of lightweight previews and production centile canvases. The controller owns
 * patient eligibility and the fullscreen host; this module never saves a patient,
 * changes a form field, or calculates a percentile. */
(function (w) {
  'use strict';
  if (!w || w.VildaCentileLiveView) return;

  var PREFIX = 'vilda-centile-live-';
  var nextId = 0;
  var MPH_REACH = 68;
  var LABELS = { height: 'Wzrost', weight: 'Waga', both: 'Obie siatki' };
  var RANGE_LABELS = { olaf: '3–18 lat', who: '0–3 lata', palInfant: '0–3 lata', palRegular: '1–18 lat' };

  function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
  function positive(value) { return finite(value) && value > 0; }
  function numberLabel(value, digits) {
    return Number(value).toLocaleString('pl-PL', { maximumFractionDigits: digits === undefined ? 1 : digits });
  }
  function sourceLabel(source) {
    return source === 'PALCZEWSKA' ? 'Palczewska' : source === 'WHO' ? 'WHO' : source === 'OLAF' ? 'OLAF / OLA' : source === 'DS' ? 'Zemel (zespół Downa)' : String(source || '');
  }
  function ageLabel(age) {
    var months = Math.max(0, Math.floor(age + 0.0000001));
    return Math.floor(months / 12) + ' lat' + (months % 12 ? ' ' + months % 12 + ' mies.' : '');
  }
  function text(node, value) {
    var next = String(value === null || value === undefined ? '' : value);
    if (node.textContent !== next) node.textContent = next;
  }
  function hidden(node, value) { if (node.hidden !== !!value) node.hidden = !!value; }
  function styles(node, values) {
    Object.keys(values).forEach(function (key) { if (node.style[key] !== values[key]) node.style[key] = values[key]; });
  }
  function create(options) {
    var cfg = options || {};
    var doc = cfg.document || w.document;
    if (!doc || typeof doc.createElement !== 'function') throw new Error('Brak dokumentu dla widoku siatki.');
    var id = PREFIX + (++nextId);
    var listeners = [];
    var observer = null;
    var boundWindow = null;
    var fitFrame = null;
    var probeFrame = null;
    var pendingProbe = null;
    var destroyed = false;
    var state = {
      rendered: null, snapshot: null, metric: 'height', fullscreen: false,
      rangeId: null, pinned: false, age: null, activeMetric: 'height', pointerType: 'mouse', probes: {}
    };

    function node(tag, suffix, content) {
      var result = doc.createElement(tag);
      if (suffix) result.className = PREFIX + suffix;
      if (content !== undefined) text(result, content);
      return result;
    }
    function listen(target, type, fn, opts) {
      target.addEventListener(type, fn, opts);
      listeners.push(function () { target.removeEventListener(type, fn, opts); });
    }
    function icon(path) {
      var svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('aria-hidden', 'true');
      var shape = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
      shape.setAttribute('d', path);
      svg.appendChild(shape);
      return svg;
    }
    function action(label, suffix, path, callback) {
      var button = node('button', suffix);
      button.type = 'button';
      button.setAttribute('aria-label', label);
      button.title = label;
      button.appendChild(icon(path));
      listen(button, 'click', function () { if (typeof callback === 'function') callback(); });
      return button;
    }

    var element = node('article', 'card');
    element.id = cfg.id || 'vildaCentileLivePanel';
    element.setAttribute('aria-labelledby', id + '-title');
    // A div avoids the application's global sticky/glass rules for every header.
    var header = node('div', 'header');
    var heading = node('div', 'heading');
    var eyebrow = node('p', 'eyebrow', 'HISTORIA WZRASTANIA');
    var title = node('h2', 'title', 'Siatka centylowa wzrostu');
    title.id = id + '-title';
    heading.append(eyebrow, title);
    var actions = node('div', 'actions');
    var expandButton = action('Powiększ siatkę na pełny ekran', 'expand', 'M9 3H3v6M15 3h6v6M3 15v6h6M21 15v6h-6', cfg.onExpand);
    var closeButton = action('Zamknij pełny ekran', 'close', 'm6 6 12 12M18 6 6 18', cfg.onClose);
    hidden(closeButton, true);
    actions.append(expandButton, closeButton);
    header.append(heading, actions);

    var controls = node('div', 'controls');
    var tabs = node('div', 'tabs');
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Rodzaj siatki');
    var tabButtons = {};
    Object.keys(LABELS).forEach(function (metric) {
      var button = node('button', 'tab', LABELS[metric]);
      button.type = 'button';
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', metric === 'height' ? 'true' : 'false');
      button.dataset.centileLiveMetric = metric;
      button.tabIndex = metric === 'height' ? 0 : -1;
      hidden(button, metric === 'both');
      listen(button, 'click', function () { setMetric(metric); });
      listen(button, 'keydown', function (event) {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') return;
        event.preventDefault();
        var keys = state.fullscreen ? ['height', 'weight', 'both'] : ['height', 'weight'];
        var index = keys.indexOf(state.metric);
        index = event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : keys.length - 1)) % keys.length;
        setMetric(keys[index]);
        tabButtons[keys[index]].focus();
      });
      tabButtons[metric] = button;
      tabs.appendChild(button);
    });
    var sourceBadge = node('span', 'source');
    var rangeSelect = node('select', 'range');
    rangeSelect.setAttribute('aria-label', 'Zakres wieku siatki');
    hidden(rangeSelect, true);
    listen(rangeSelect, 'change', function () {
      state.rangeId = rangeSelect.value;
      clearProbe(true);
      syncView();
      if (typeof cfg.onRangeChange === 'function') cfg.onRangeChange(state.rangeId);
    });
    controls.append(tabs, rangeSelect, sourceBadge);

    var latest = node('div', 'latest');
    var latestMain = node('div', 'latest-main');
    var latestLabel = node('span', 'latest-label');
    var latestValue = node('strong', 'latest-value');
    var latestCentile = node('span', 'latest-centile');
    var latestAge = node('span', 'latest-age');
    latestMain.append(latestLabel, latestValue);
    latest.append(latestMain, latestCentile, latestAge);
    hidden(latest, true);
    var metadata = node('div', 'metadata');
    var legend = node('span', 'legend');
    legend.append(node('span', 'line-key'), doc.createTextNode('Przebieg pacjenta'));
    var parents = node('div', 'parents');
    parents.setAttribute('aria-label', 'Wzrost rodziców');
    hidden(parents, true);
    var parentFields = {};
    [['motherHeight', 'Mama:'], ['fatherHeight', 'Tata:'], ['targetHeight', 'MPH:']].forEach(function (entry) {
      var field = node('span', 'parent');
      var value = node('strong', 'parent-value');
      field.append(node('span', 'parent-name', entry[1]), value);
      parents.appendChild(field);
      parentFields[entry[0]] = { element: field, value: value };
    });
    var count = node('span', 'count');
    metadata.append(legend, parents, count);
    var deck = node('div', 'deck');
    var footer = node('footer', 'footer');
    var note = node('span', 'annotation-note', 'Adnotacje z Kreatora siatek');
    var hint = node('p', 'hint', 'Najedź, aby odczytać wartości. Powiększ siatkę ikoną w prawym górnym rogu.');
    hint.id = id + '-hint';
    footer.append(note, hint);
    element.append(header, controls, latest, metadata, deck, footer);

    function createPane(index) {
      var root = node('section', 'pane');
      var paneTitle = node('h3', 'pane-title');
      var viewport = node('div', 'viewport');
      var stage = node('div', 'stage');
      var imageFrame = node('div', 'image-frame');
      var crosshair = node('div', 'crosshair');
      var dot = node('div', 'probe-dot');
      var tooltip = node('div', 'tooltip');
      var tooltipHeading = node('span', 'tooltip-age');
      var tooltipReading = node('strong', 'tooltip-reading');
      tooltip.append(tooltipHeading, tooltipReading);
      tooltip.setAttribute('role', 'tooltip');
      tooltip.id = id + '-tooltip-' + index;
      var bar = node('div', 'probe-bar');
      bar.setAttribute('role', 'status');
      bar.setAttribute('aria-live', 'polite');
      var mph = node('div', 'mph');
      mph.setAttribute('role', 'img');
      var diamond = node('span', 'mph-diamond');
      diamond.setAttribute('aria-hidden', 'true');
      var mphLabel = node('span', 'mph-label');
      var mphValue = node('strong', 'mph-value');
      mphLabel.append(node('span', 'mph-name', 'MPH'), mphValue);
      mph.append(diamond, mphLabel);
      var input = node('div', 'interaction');
      input.tabIndex = 0;
      input.setAttribute('role', 'button');
      input.setAttribute('aria-describedby', hint.id);
      var empty = node('p', 'empty', 'Siatka jest niedostępna dla tego zakresu.');
      stage.append(imageFrame, crosshair, dot, tooltip, mph);
      viewport.append(stage, bar, empty, input);
      root.append(paneTitle, viewport);
      deck.appendChild(root);
      [crosshair, dot, tooltip, mph, bar, empty].forEach(function (item) { hidden(item, true); });
      var pane = {
        root: root, title: paneTitle, viewport: viewport, stage: stage, imageFrame: imageFrame,
        crosshair: crosshair, dot: dot, tooltip: tooltip, tooltipHeading: tooltipHeading,
        tooltipReading: tooltipReading, bar: bar, mph: mph, mphValue: mphValue, input: input,
        empty: empty, image: null, metric: index === 0 ? 'height' : 'weight', scale: 0,
        bounds: null, presentationPlot: null, previewAsset: null, previewWidth: 0, previewHeight: 0, gesture: null, suppressClickUntil: 0
      };
      bindPane(pane);
      return pane;
    }
    var panes = [createPane(0), createPane(1)];
    hidden(panes[1].root, true);

    function viewWindow() { return element.ownerDocument.defaultView || doc.defaultView || w; }
    function currentRange() {
      var rendered = state.rendered;
      if (!rendered) return null;
      var ranges = Array.isArray(rendered.ranges) ? rendered.ranges : [];
      return ranges.find(function (range) { return range.id === state.rangeId; }) || rendered;
    }
    function asset(metric) { var range = currentRange(); return range && range[metric] || null; }
    function points(data) {
      return data && Array.isArray(data.points) ? data.points.filter(function (point) { return finite(point.ageMonths) && finite(point.value); }).slice().sort(function (a, b) { return a.ageMonths - b.ageMonths; }) : [];
    }
    function visiblePanes() { return panes.filter(function (pane) { return !pane.root.hidden; }); }
    function frame(callback) {
      var win = viewWindow();
      return { win: win, id: typeof win.requestAnimationFrame === 'function' ? win.requestAnimationFrame(callback) : win.setTimeout(callback, 0), raf: typeof win.requestAnimationFrame === 'function' };
    }
    function cancelFrame(pending) {
      if (!pending) return;
      if (pending.raf) pending.win.cancelAnimationFrame(pending.id);
      else pending.win.clearTimeout(pending.id);
    }
    function ensureWindow() {
      var win = viewWindow();
      if (boundWindow === win) return;
      if (boundWindow) boundWindow.removeEventListener('resize', scheduleFit);
      if (observer) observer.disconnect();
      boundWindow = win;
      win.addEventListener('resize', scheduleFit);
      observer = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(scheduleFit) : null;
      if (observer) { observer.observe(element); panes.forEach(function (pane) { observer.observe(pane.viewport); }); }
    }
    function scheduleFit() {
      if (destroyed || fitFrame) return;
      fitFrame = frame(function () { fitFrame = null; fit(); });
    }
    function crop(data) {
      var b = state.fullscreen && data.contentBounds;
      var x = b && finite(b.x) ? Math.max(0, b.x) : 0;
      var y = b && finite(b.y) ? Math.max(0, b.y) : 0;
      var width = b && positive(b.width) ? b.width : data.width;
      var height = b && positive(b.height) ? b.height : data.height;
      return { x: x, y: y, width: Math.max(1, Math.min(width, data.width - x)), height: Math.max(1, Math.min(height, data.height - y)) };
    }
    function plotOf(data) {
      if (!data || !data.plot) return null;
      var p = data.plot;
      return {
        x: p.x, y: p.y, w: p.w === undefined ? p.width : p.w, h: p.h === undefined ? p.height : p.h,
        ageMin: p.ageMin, ageMax: p.ageMax, minY: p.minY, maxY: p.maxY
      };
    }
    function project(pane, age, value) {
      var p = pane.presentationPlot || plotOf(asset(pane.metric));
      if (!p || !pane.bounds || !(pane.scale > 0) || !(p.ageMax > p.ageMin) || !(p.maxY > p.minY)) return null;
      return {
        x: (p.x + (age - p.ageMin) / (p.ageMax - p.ageMin) * p.w - pane.bounds.x) * pane.scale,
        y: (p.y + (p.maxY - value) / (p.maxY - p.minY) * p.h - pane.bounds.y) * pane.scale,
        top: (p.y - pane.bounds.y) * pane.scale, height: p.h * pane.scale
      };
    }
    function validMph(data) {
      var p = plotOf(data);
      var mph = data && data.mph;
      return state.fullscreen && p && mph && positive(mph.motherHeight) && positive(mph.fatherHeight)
        && finite(mph.ageMonths) && positive(mph.value) && mph.ageMonths >= p.ageMin && mph.ageMonths <= p.ageMax
        && mph.value >= p.minY && mph.value <= p.maxY ? mph : null;
    }
    function updateParents() {
      var snapshot = state.snapshot || {};
      var values = snapshot.parents || snapshot.advanced || {};
      var mph = asset('height') && asset('height').mph;
      var hasHeight = state.metric !== 'weight';
      var available = false;
      ['motherHeight', 'fatherHeight', 'targetHeight'].forEach(function (key) {
        var value = key === 'targetHeight' ? mph && mph.value : values[key];
        var present = positive(value) && (key !== 'targetHeight' || hasHeight && mph && positive(mph.motherHeight) && positive(mph.fatherHeight));
        hidden(parentFields[key].element, !present);
        if (present) { text(parentFields[key].value, numberLabel(value) + ' cm'); available = true; }
      });
      hidden(parents, !state.fullscreen || !available);
    }
    function updateLatest() {
      var data = asset(panes[0].metric);
      var list = points(data);
      var current = list.find(function (point) { return point.current; });
      var point = current || list[list.length - 1];
      hidden(latest, state.fullscreen || !data || !data.preview || !point);
      if (!point) return;
      text(latestLabel, current ? 'OBECNY POMIAR' : 'OSTATNI POMIAR');
      text(latestValue, numberLabel(point.value) + (panes[0].metric === 'height' ? ' cm' : ' kg'));
      var pct = point.percentile;
      var effectiveSource = point.source && point.source !== data.source ? ' · ' + sourceLabel(point.source) : '';
      text(latestCentile, (finite(pct) ? (pct >= 97 ? '≥97' : pct <= 3 ? '≤3' : Math.round(pct)) + '. centyl' : 'Centyl niedostępny') + effectiveSource);
      text(latestAge, ageLabel(finite(point.clinicalAgeMonths) ? point.clinicalAgeMonths : point.ageMonths));
    }
    function fitPreview(pane, data, width, height) {
      var api = w.VildaCentileLivePreview;
      if (!api || typeof api.draw !== 'function') throw new Error('Brak modułu podglądu siatki.');
      pane.scale = 1;
      pane.bounds = { x: 0, y: 0, width: width, height: height };
      styles(pane.stage, { width: width + 'px', height: height + 'px' });
      styles(pane.imageFrame, { width: width + 'px', height: height + 'px' });
      if (pane.previewAsset !== data || pane.previewWidth !== width || pane.previewHeight !== height || !pane.image) {
        var drawing = api.draw(pane.imageFrame.ownerDocument || doc, data, width, height);
        pane.imageFrame.replaceChildren(drawing.element);
        pane.image = drawing.element;
        pane.presentationPlot = drawing.plot;
        pane.previewAsset = data; pane.previewWidth = width; pane.previewHeight = height;
      }
      hidden(pane.mph, true);
    }
    function fit() {
      if (destroyed) return;
      ensureWindow();
      var win = viewWindow();
      var layouts = [];
      visiblePanes().forEach(function (pane) {
        var data = asset(pane.metric);
        if (!data || !data.preview && (!pane.image || !(data.width > 0) || !(data.height > 0))) return;
        var style = typeof win.getComputedStyle === 'function' ? win.getComputedStyle(pane.viewport) : {};
        var rect = pane.viewport.getBoundingClientRect();
        var width = rect.width - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0)
          - (parseFloat(style.borderLeftWidth) || 0) - (parseFloat(style.borderRightWidth) || 0);
        var height = rect.height - (parseFloat(style.paddingTop) || 0) - (parseFloat(style.paddingBottom) || 0)
          - (parseFloat(style.borderTopWidth) || 0) - (parseFloat(style.borderBottomWidth) || 0);
        if (!(width > 0 && height > 0)) return;
        if (data.preview) {
          fitPreview(pane, data, width, height);
          return;
        }
        pane.presentationPlot = null;
        var bounds = crop(data);
        var mph = pane.metric === 'height' ? validMph(data) : null;
        var p = plotOf(data);
        var mphX = mph ? p.x + (mph.ageMonths - p.ageMin) / (p.ageMax - p.ageMin) * p.w - bounds.x : null;
        var scale = Math.min(width / bounds.width, height / bounds.height);
        if (mphX !== null && mphX > 0) scale = Math.min(scale, (width - MPH_REACH) / mphX);
        layouts.push({ pane: pane, data: data, bounds: bounds, mphX: mphX, scale: scale });
      });
      if (!layouts.length) { if (state.age !== null) renderAge(state.age); return; }
      var commonScale = Math.min.apply(null, layouts.map(function (layout) { return layout.scale; }));
      if (!(commonScale > 0)) return;
      // One source-pixel scale for both portrait charts, including the external
      // MPH label. Only the image frame clips blank margins; overlays do not.
      var stageWidth = Math.max.apply(null, layouts.map(function (layout) {
        return Math.max(layout.bounds.width * commonScale, layout.mphX === null ? 0 : layout.mphX * commonScale + MPH_REACH);
      }));
      layouts.forEach(function (layout) {
        var pane = layout.pane;
        pane.scale = commonScale;
        pane.bounds = layout.bounds;
        styles(pane.stage, { width: stageWidth + 'px', height: layout.bounds.height * commonScale + 'px' });
        styles(pane.imageFrame, { width: layout.bounds.width * commonScale + 'px', height: layout.bounds.height * commonScale + 'px' });
        styles(pane.image, {
          width: layout.data.width * commonScale + 'px', height: layout.data.height * commonScale + 'px',
          left: -layout.bounds.x * commonScale + 'px', top: -layout.bounds.y * commonScale + 'px'
        });
        updateMph(pane);
      });
      if (state.age !== null) renderAge(state.age);
    }
    function updateMph(pane) {
      var data = asset(pane.metric);
      var mph = pane.metric === 'height' ? validMph(data) : null;
      var point = mph ? project(pane, mph.ageMonths, mph.value) : null;
      hidden(pane.mph, !point);
      if (!point) return;
      styles(pane.mph, { left: point.x + 'px', top: point.y + 'px' });
      text(pane.mphValue, numberLabel(mph.value) + ' cm');
      pane.mph.dataset.ageMonths = String(mph.ageMonths);
      pane.mph.dataset.value = String(mph.value);
      pane.mph.setAttribute('aria-label', 'MPH — wzrost docelowy według wzrostu rodziców: ' + numberLabel(mph.value) + ' cm, oznaczony przy wieku 18 lat.');
    }
    function probe(data, age) {
      try {
        if (typeof cfg.probe === 'function') return cfg.probe(data, age);
        if (data && typeof data.probe === 'function') return data.probe(age);
        var api = w.VildaCentileLiveRender;
        return api && typeof api.probe === 'function' ? api.probe(data, age) : null;
      } catch (_) { return null; }
    }
    function hidePaneProbe(pane) {
      [pane.crosshair, pane.dot, pane.tooltip, pane.bar].forEach(function (item) { hidden(item, true); });
      pane.stage.classList.remove(PREFIX + 'stage--pinned');
      pane.input.setAttribute('aria-pressed', 'false');
      delete state.probes[pane.metric];
      ['ageMonths', 'value', 'source'].forEach(function (key) { delete pane.dot.dataset[key]; });
    }
    function clearProbe(unpin) {
      cancelFrame(probeFrame); probeFrame = null; pendingProbe = null;
      if (unpin) state.pinned = false;
      state.age = null;
      panes.forEach(hidePaneProbe);
    }
    function renderPaneProbe(pane, result) {
      if (!result || !finite(result.value) || !finite(result.ageMonths)) { hidePaneProbe(pane); return; }
      var point = project(pane, result.ageMonths, result.value);
      if (!point) { hidePaneProbe(pane); return; }
      var pct = finite(result.percentile) ? result.percentile >= 97 ? '≥97 centyl' : result.percentile <= 3 ? '≤3 centyl' : (result.exact ? '' : '~') + Math.round(result.percentile) + ' centyl' : 'Centyl niedostępny';
      var label = (state.pinned ? 'Przypięto · ' : result.exact ? 'Pomiar · ' : 'Między pomiarami · ') + ageLabel(result.ageMonths);
      var data = asset(pane.metric);
      var effectiveSource = result.source && data && result.source !== data.source ? ' · ' + sourceLabel(result.source) : '';
      var reading = numberLabel(result.value) + (pane.metric === 'height' ? ' cm' : ' kg') + ' · ' + pct + effectiveSource;
      state.probes[pane.metric] = {
        ageMonths: result.ageMonths, value: result.value, percentile: result.percentile,
        exact: !!result.exact, source: result.source
      };
      pane.dot.dataset.ageMonths = String(result.ageMonths);
      pane.dot.dataset.value = String(result.value);
      pane.dot.dataset.source = result.source || '';
      text(pane.tooltipHeading, label); text(pane.tooltipReading, reading);
      text(pane.bar, label + ' — ' + LABELS[pane.metric] + ': ' + reading);
      styles(pane.crosshair, { left: point.x + 'px', top: point.top + 'px', height: point.height + 'px' });
      styles(pane.dot, { left: point.x + 'px', top: point.y + 'px' });
      hidden(pane.crosshair, false); hidden(pane.dot, false);
      hidden(pane.tooltip, state.pointerType === 'touch'); hidden(pane.bar, state.pointerType !== 'touch');
      pane.stage.classList.toggle(PREFIX + 'stage--pinned', state.pinned);
      pane.input.setAttribute('aria-pressed', String(state.pinned));
      pane.input.setAttribute('aria-label', LABELS[pane.metric] + '. ' + label + ', ' + reading + '. Enter przypina odczyt. Strzałki wybierają pomiary.');
      if (state.pointerType !== 'touch') {
        var maxX = pane.stage.getBoundingClientRect().width - (pane.tooltip.offsetWidth || 200) - 5;
        styles(pane.tooltip, { left: Math.max(5, Math.min(point.x + 12, maxX)) + 'px', top: Math.max(5, point.y - pane.tooltip.offsetHeight - 15) + 'px' });
      }
    }
    function renderAge(age, pointerType, activeMetric) {
      if (!finite(age)) return;
      state.age = age;
      if (pointerType) state.pointerType = pointerType;
      if (activeMetric) state.activeMetric = activeMetric;
      visiblePanes().forEach(function (pane) { renderPaneProbe(pane, probe(asset(pane.metric), age)); });
    }
    function ageFromClient(pane, clientX, pointerType) {
      var data = asset(pane.metric);
      var p = pane.presentationPlot || plotOf(data);
      if (!data || !p || !pane.bounds || !(pane.scale > 0)) return null;
      var rect = pane.stage.getBoundingClientRect();
      var sourceX = (clientX - rect.left) / pane.scale + pane.bounds.x;
      var age = p.ageMin + Math.max(0, Math.min(1, (sourceX - p.x) / p.w)) * (p.ageMax - p.ageMin);
      var closest = points(data).reduce(function (best, point) { return !best || Math.abs(point.ageMonths - age) < Math.abs(best.ageMonths - age) ? point : best; }, null);
      var pxPerMonth = p.w * pane.scale / (p.ageMax - p.ageMin);
      if (closest && Math.abs(closest.ageMonths - age) * pxPerMonth <= (pointerType === 'touch' ? 12 : 6)) age = closest.ageMonths;
      return age;
    }
    function updateFromClient(pane, clientX, pointerType) {
      var age = ageFromClient(pane, clientX, pointerType || 'mouse');
      if (age !== null) renderAge(age, pointerType || 'mouse', pane.metric);
    }
    function scheduleProbe(pane, clientX, pointerType) {
      pendingProbe = { pane: pane, x: clientX, pointerType: pointerType };
      if (probeFrame) return;
      probeFrame = frame(function () {
        probeFrame = null;
        var pending = pendingProbe; pendingProbe = null;
        if (!destroyed && pending) updateFromClient(pending.pane, pending.x, pending.pointerType);
      });
    }
    function bindPane(pane) {
      listen(pane.input, 'pointermove', function (event) {
        if (event.pointerType === 'mouse' || !event.pointerType) {
          if (!state.pinned) scheduleProbe(pane, event.clientX, 'mouse');
          return;
        }
        var gesture = pane.gesture;
        if (!gesture || gesture.id !== event.pointerId) return;
        var dx = Math.abs(event.clientX - gesture.x), dy = Math.abs(event.clientY - gesture.y);
        if (!gesture.horizontal && !gesture.vertical) {
          if (dx >= 8 && dx > dy * 1.2) gesture.horizontal = true;
          else if (dy >= 12 && dy > dx) gesture.vertical = true;
        }
        if (gesture.horizontal) { state.pinned = false; scheduleProbe(pane, event.clientX, 'touch'); }
      }, { passive: true });
      listen(pane.input, 'pointerdown', function (event) {
        if (event.pointerType === 'mouse' || !event.pointerType) return;
        pane.gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, horizontal: false, vertical: false };
        try { pane.input.setPointerCapture(event.pointerId); } catch (_) { /* optional */ }
      }, { passive: true });
      listen(pane.input, 'pointerup', function (event) {
        if (event.pointerType === 'mouse' || !event.pointerType) return;
        var gesture = pane.gesture; pane.gesture = null;
        panes.forEach(function (item) { item.suppressClickUntil = Date.now() + 800; });
        if (!gesture || gesture.id !== event.pointerId || gesture.vertical) return;
        cancelFrame(probeFrame); probeFrame = null; pendingProbe = null;
        if (state.pinned && !gesture.horizontal && state.age !== null) {
          var result = probe(asset(pane.metric), state.age);
          var point = result && project(pane, result.ageMonths, result.value);
          if (point && Math.abs(event.clientX - pane.stage.getBoundingClientRect().left - point.x) <= 24) { clearProbe(true); return; }
        }
        state.pinned = true;
        updateFromClient(pane, event.clientX, 'touch');
      });
      listen(pane.input, 'pointercancel', function () {
        pane.gesture = null;
        panes.forEach(function (item) { item.suppressClickUntil = Date.now() + 800; });
      });
      listen(pane.input, 'pointerleave', function () { if (!state.pinned && !(pane.gesture && pane.gesture.horizontal)) clearProbe(false); });
      listen(pane.input, 'click', function (event) {
        if (Date.now() < pane.suppressClickUntil) return;
        cancelFrame(probeFrame); probeFrame = null; pendingProbe = null;
        state.pinned = !state.pinned;
        updateFromClient(pane, event.clientX, 'mouse');
      });
      listen(pane.input, 'keydown', function (event) {
        if (['Enter', ' ', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].indexOf(event.key) === -1) return;
        event.preventDefault();
        cancelFrame(probeFrame); probeFrame = null; pendingProbe = null;
        var list = points(asset(pane.metric));
        if (!list.length) return;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
          var direction = event.key === 'ArrowRight' || event.key === 'Home' ? 1 : -1;
          var candidates = event.key === 'Home' || event.key === 'End' ? list : list.filter(function (point) { return state.age === null || direction * (point.ageMonths - state.age) > 0.0001; });
          var point = direction > 0 ? candidates[0] : candidates[candidates.length - 1];
          if (point) { state.pinned = true; renderAge(point.ageMonths, 'keyboard', pane.metric); }
        } else {
          state.pinned = !state.pinned;
          renderAge(state.age === null ? list[Math.floor(list.length / 2)].ageMonths : state.age, 'keyboard', pane.metric);
        }
      });
    }
    function syncRanges() {
      var rendered = state.rendered || {};
      var ranges = Array.isArray(rendered.ranges) ? rendered.ranges : [];
      if (!ranges.some(function (range) { return range.id === state.rangeId; })) state.rangeId = rendered.activeRangeId || (ranges[0] && ranges[0].id) || null;
      var key = ranges.map(function (range) { return range.id + ':' + (range.label || ''); }).join('|');
      if (rangeSelect.dataset.ranges !== key) {
        rangeSelect.replaceChildren();
        ranges.forEach(function (range) { var option = node('option', null, range.label || RANGE_LABELS[range.id] || range.id); option.value = range.id; rangeSelect.appendChild(option); });
        rangeSelect.dataset.ranges = key;
      }
      if (state.rangeId) rangeSelect.value = state.rangeId;
      hidden(rangeSelect, ranges.length < 2);
    }
    function syncView() {
      var dual = state.fullscreen && state.metric === 'both';
      element.classList.toggle(PREFIX + 'card--fullscreen', state.fullscreen);
      element.classList.toggle(PREFIX + 'card--dual', dual);
      element.dataset.centileLiveMetric = state.metric;
      element.classList.toggle(PREFIX + 'card--preview', !state.fullscreen && !!(asset(state.metric) && asset(state.metric).preview));
      hidden(expandButton, state.fullscreen); hidden(closeButton, !state.fullscreen);
      hidden(panes[1].root, !dual);
      panes[0].metric = dual ? 'height' : state.metric;
      panes[1].metric = 'weight';
      if (!state.fullscreen && asset(panes[0].metric) && asset(panes[0].metric).preview) {
        // Returning from the dual full view must release the hidden canvas too.
        panes.filter(function (pane) { return pane.root.hidden; }).forEach(function (pane) {
          pane.imageFrame.replaceChildren(); pane.image = null; pane.previewAsset = null; pane.presentationPlot = null;
          hidePaneProbe(pane);
        });
      }
      text(title, dual ? 'Siatki centylowe wzrostu i masy ciała' : 'Siatka centylowa ' + (state.metric === 'weight' ? 'masy ciała' : 'wzrostu'));
      Object.keys(tabButtons).forEach(function (metric) {
        var button = tabButtons[metric];
        button.setAttribute('aria-selected', String(state.metric === metric));
        button.tabIndex = state.metric === metric ? 0 : -1;
        hidden(button, metric === 'both' && !state.fullscreen);
      });
      visiblePanes().forEach(function (pane) {
        var data = asset(pane.metric);
        text(pane.title, LABELS[pane.metric]);
        pane.root.setAttribute('aria-label', 'Siatka: ' + LABELS[pane.metric]);
        pane.input.setAttribute('aria-label', LABELS[pane.metric] + '. Przesuń wskaźnik, aby odczytać dane. Enter przypina odczyt. Strzałki wybierają pomiary.');
        var available = !!(data && (data.preview || data.canvas));
        hidden(pane.empty, available);
        text(pane.empty, state.rendered && state.rendered.message || 'Siatka jest niedostępna dla tego zakresu.');
        hidden(pane.input, !available);
        hidden(pane.stage, !available);
        if (!available) hidePaneProbe(pane);
        if (data && data.preview) {
          if (pane.previewAsset !== data) {
            pane.imageFrame.replaceChildren(); pane.image = null; pane.presentationPlot = null;
          }
          return;
        }
        pane.previewAsset = null; pane.presentationPlot = null;
        var nextImage = data && data.canvas || null;
        if (pane.image !== nextImage || nextImage && nextImage.parentNode !== pane.imageFrame) {
          pane.imageFrame.replaceChildren();
          pane.image = nextImage;
          if (pane.image) {
            pane.image.className = PREFIX + 'image';
            pane.image.setAttribute('role', 'img');
            pane.image.setAttribute('aria-label', 'Siatka centylowa: ' + LABELS[pane.metric] + ', ' + sourceLabel(data.source) + ', z przebiegiem pacjenta i adnotacjami.');
            pane.imageFrame.appendChild(pane.image);
          }
        }
      });
      var data = asset(panes[0].metric);
      text(sourceBadge, sourceLabel(data && data.source || state.snapshot && state.snapshot.source));
      var sex = state.snapshot && state.snapshot.sex;
      text(count, (sex === 'F' ? 'Dziewczęta' : sex === 'M' ? 'Chłopcy' : '') + ' · ' + points(data).length + ' pomiarów');
      updateParents(); updateLatest();
      text(note, data && data.preview ? 'Centyle 3, 50 i 97 · Pełna siatka i adnotacje po powiększeniu' : 'Adnotacje z Kreatora siatek');
      text(hint, state.fullscreen ? 'Przesuń kursor lub palec, aby odczytać wartości. Kliknięcie przypina odczyt.' : 'Najedź, aby odczytać wartości. Powiększ siatkę ikoną w prawym górnym rogu.');
      panes.forEach(function (pane) { hidden(pane.mph, true); });
      fit(); scheduleFit();
    }
    function setMetric(metric) {
      if (!Object.prototype.hasOwnProperty.call(LABELS, metric) || metric === 'both' && !state.fullscreen) return;
      if (state.metric === metric) return;
      state.metric = metric;
      clearProbe(true);
      syncView();
      if (typeof cfg.onMetricChange === 'function') cfg.onMetricChange(metric);
    }
    function update(rendered, snapshot) {
      if (destroyed) return;
      if (state.snapshot && snapshot && state.snapshot.patientId !== snapshot.patientId) { state.metric = 'height'; state.rangeId = null; clearProbe(true); }
      state.rendered = rendered || null;
      state.snapshot = snapshot || null;
      if (!rendered || rendered.status === 'unavailable') clearProbe(true);
      syncRanges(); syncView();
    }
    function setFullscreen(value) {
      if (destroyed) return;
      state.fullscreen = !!value;
      if (!state.fullscreen && state.metric === 'both') state.metric = 'height';
      clearProbe(true);
      syncView();
    }
    function destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelFrame(fitFrame); cancelFrame(probeFrame);
      if (observer) observer.disconnect();
      if (boundWindow) boundWindow.removeEventListener('resize', scheduleFit);
      listeners.forEach(function (remove) { remove(); });
      element.remove();
      state.rendered = null; state.snapshot = null;
    }
    syncView();
    return {
      element: element, update: update, setFullscreen: setFullscreen, fit: fit, destroy: destroy,
      setStatus: function (message) { update({ status: 'unavailable', message: message }, state.snapshot); },
      setMetric: setMetric, expandButton: expandButton, closeButton: closeButton,
      focus: function () { (state.fullscreen ? closeButton : expandButton).focus({ preventScroll: true }); },
      getState: function () {
        var probes = {};
        Object.keys(state.probes).forEach(function (metric) { probes[metric] = Object.assign({}, state.probes[metric]); });
        return { metric: state.metric, fullscreen: state.fullscreen, rangeId: state.rangeId, pinned: state.pinned, ageMonths: state.age, probes: probes };
      }
    };
  }
  w.VildaCentileLiveView = Object.freeze({ create: create });
})(typeof window !== 'undefined' ? window : globalThis);
