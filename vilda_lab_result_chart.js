/* Shared result UI transport: the dialog lifecycle is its own IIFE below.
 * Keeping both presentation APIs in this existing resource avoids additional
 * fresh-install requests; the saved-result chart implementation follows intact.
 */
/* Shared presentation lifecycle for saved lab and Klirens details.
 * This module never reads, recalculates or writes a patient/result record.
 * The caller owns the contents, transactions, cancellation policy and DOM.
 */
(function (root) {
  'use strict';

  function attach(dialog, options) {
    options = options || {};
    if (!dialog || !dialog.ownerDocument) throw new TypeError('A result dialog is required.');
    var doc = dialog.ownerDocument, win = doc.defaultView || root;
    var context = options.context || null;
    var destroyed = false, opened = false, closing = false, saved = null, restoreFrame = null, generation = 0;
    dialog.classList.add('vilda-result-details-dialog');

    function connected(element) { return !!element && element.isConnected !== false; }
    function isOpen() { return dialog.open === true || dialog.hasAttribute('open'); }
    function validContext() {
      return connected(dialog) && (!context || connected(context))
        && (typeof options.isCurrent !== 'function' || options.isCurrent());
    }
    function capture(anchor) {
      var elements = [], windows = [];
      function remember(element) {
        if (!element || elements.some(function (position) { return position.element === element; })) return;
        if (typeof element.scrollTop === 'number') elements.push({ element: element, top: element.scrollTop, left: element.scrollLeft || 0 });
      }
      function ancestry(element) {
        for (var cursor = element; cursor; cursor = cursor.parentElement || cursor.parentNode) remember(cursor);
      }
      ancestry(anchor); ancestry(context);
      // A Details button can sit outside its chart's horizontal scroller.
      // Preserve that sibling's existing position as well as the button's ancestors.
      function descendants(parent) {
        Array.from(parent && parent.children || []).forEach(function (element) {
          if (element.scrollTop || element.scrollLeft) remember(element);
          descendants(element);
        });
      }
      descendants(context);
      var owner = win;
      while (owner) {
        try {
          windows.push({ window: owner, x: owner.scrollX || owner.pageXOffset || 0, y: owner.scrollY || owner.pageYOffset || 0 });
          remember(owner.document && owner.document.scrollingElement);
          var frame = owner.frameElement;
          if (!frame) break;
          ancestry(frame);
          owner = frame.ownerDocument && frame.ownerDocument.defaultView;
          if (windows.some(function (position) { return position.window === owner; })) break;
        } catch (_) { break; /* an embedded cross-origin boundary owns its own viewport */ }
      }
      return { anchor: anchor, elements: elements, windows: windows };
    }
    function restore(position, focus) {
      if (!position || !validContext()) return;
      if (focus && connected(position.anchor) && typeof position.anchor.focus === 'function') {
        try { position.anchor.focus({ preventScroll: true }); } catch (_) { /* removed/inert origin */ }
      }
      position.elements.forEach(function (item) {
        if (!connected(item.element)) return;
        item.element.scrollTop = item.top;
        item.element.scrollLeft = item.left;
      });
      position.windows.forEach(function (item) {
        try { if (typeof item.window.scrollTo === 'function') item.window.scrollTo(item.x, item.y); } catch (_) { /* detached ancestor frame */ }
      });
    }
    function cancelRestore() {
      if (restoreFrame !== null && win && typeof win.cancelAnimationFrame === 'function') win.cancelAnimationFrame(restoreFrame);
      restoreFrame = null;
    }
    function finish(restoreFocus) {
      if (!opened && !saved) return;
      var position = saved;
      opened = false; saved = null; generation++;
      cancelRestore();
      // Clear state before invoking a caller that may destroy the controller.
      // Native `close` can arrive later, after this callback or even a new show.
      if (restoreFocus) restore(position, true);
      if (typeof options.onClose === 'function') options.onClose();
    }
    function closed() { if (!destroyed && !closing && !isOpen()) finish(true); }
    function show(anchor) {
      if (destroyed || !validContext()) return false;
      if (isOpen()) return true;
      cancelRestore(); generation++;
      var candidate = connected(anchor) ? anchor : doc.activeElement;
      if (!connected(candidate) || dialog.contains(candidate)) candidate = null;
      saved = capture(candidate); opened = true;
      try {
        if (typeof dialog.showModal === 'function') dialog.showModal();
        else dialog.setAttribute('open', '');
      } catch (error) {
        opened = false; saved = null;
        throw error;
      }
      var heading = dialog.querySelector('.vilda-result-details-heading');
      var closeButton = dialog.querySelector('[data-result-details-close]') || heading && heading.querySelector('button');
      if (closeButton && typeof closeButton.focus === 'function') closeButton.focus({ preventScroll: true });
      restore(saved, false);
      var current = generation, position = saved;
      if (win && typeof win.requestAnimationFrame === 'function') {
        restoreFrame = win.requestAnimationFrame(function () {
          restoreFrame = null;
          if (!destroyed && opened && generation === current) restore(position, false);
        });
      }
      return true;
    }
    function close(settings) {
      if (destroyed || !opened && !isOpen()) return;
      var restoreFocus = !settings || settings.restoreFocus !== false;
      // The native close event is asynchronous in browsers and synchronous in
      // some adapters. Suppress that notification until the requested focus
      // policy has been applied and the caller can safely destroy the shell.
      closing = true;
      try {
        if (isOpen()) {
          if (typeof dialog.close === 'function') dialog.close();
          else dialog.removeAttribute('open');
        }
      } finally { closing = false; }
      finish(restoreFocus);
    }
    function destroy(settings) {
      if (destroyed) return;
      close(settings);
      destroyed = true; generation++;
      cancelRestore();
      if (typeof dialog.removeEventListener === 'function') {
        dialog.removeEventListener('close', closed);
        dialog.removeEventListener('wheel', backdrop);
        dialog.removeEventListener('touchmove', backdrop);
        dialog.removeEventListener('keydown', navigate);
      }
    }
    function backdrop(event) {
      if (!destroyed && opened && (event.target === dialog || !dialog.contains(event.target))) event.preventDefault();
    }
    function navigate(event) {
      if (destroyed || !opened || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      var target = event.target;
      // Native input/radio/select keyboard contracts belong to the editor.
      if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) return;
      var direction = { ArrowDown: 40, ArrowUp: -40, PageDown: 1, PageUp: -1, Home: 0, End: 0 };
      if (!Object.prototype.hasOwnProperty.call(direction, event.key)) return;
      var body = dialog.querySelector('.vilda-result-details-body');
      if (!body) return;
      event.preventDefault();
      if (event.key === 'Home') body.scrollTop = 0;
      else if (event.key === 'End') body.scrollTop = body.scrollHeight;
      else body.scrollTop += /^Page/.test(event.key) ? direction[event.key] * Math.max(40, body.clientHeight * 0.85) : direction[event.key];
    }

    dialog.addEventListener('close', closed);
    dialog.addEventListener('wheel', backdrop, { passive: false });
    dialog.addEventListener('touchmove', backdrop, { passive: false });
    dialog.addEventListener('keydown', navigate);
    return Object.freeze({ dialog: dialog, show: show, close: close, destroy: destroy });
  }

  var api = Object.freeze({ attach: attach });
  if (root) root.VildaResultDetailsDialog = api;
})(typeof window !== 'undefined' ? window : globalThis);

/* Historia badań: wykres wyłącznie zapisanych wyników i zapisanych zakresów.
 * Nie dobiera norm, nie ocenia pacjenta i nie zmienia danych modelu historii.
 * Każdy odcinek odniesienia należy do daty konkretnego zapisu; nie interpoluje
 * norm między badaniami i nie rozciąga ostatniej normy na wcześniejsze wyniki.
 */
(function (root) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var COLORS = { within: '#087f5b', below: '#cf222e', above: '#cf222e', neutral: '#79919a' };
  var SAMPLES = ['badanie', 'kontrola'];
  var MAX_CHART_WIDTH = 4096, MIN_PLOT_WIDTH = 144, WIDTH_GUTTER = 66;
  var PLOT_HEIGHT = 180, DATE_ROW_HEIGHT = 34;
  var chooserId = 0;

  function finite(value) { return typeof value === 'number' && isFinite(value); }
  function unit(value) { return String(value || '').trim().replace(/\s+/g, ' ').replace(/µ/g, 'μ'); }
  function day(iso) {
    var parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!parts) return null;
    var stamp = Date.parse(iso + 'T12:00:00Z');
    if (!isFinite(stamp)) return null;
    // Parse the recorded calendar day in explicit UTC, without formatting a
    // current/local day or accepting Date.parse's rollover of e.g. 30 February.
    var parsed = new Date(stamp);
    return parsed.getUTCFullYear() === Number(parts[1]) && parsed.getUTCMonth() + 1 === Number(parts[2])
      && parsed.getUTCDate() === Number(parts[3]) ? stamp : null;
  }
  function defaultNumber(value) { return value.toLocaleString('pl-PL', { maximumSignificantDigits: 4 }); }
  function defaultDate(iso) { return iso.split('-').reverse().join('.'); }
  function node(doc, tag, className, content, svg) {
    var element = svg ? doc.createElementNS(NS, tag) : doc.createElement(tag);
    if (className) element.setAttribute('class', className);
    if (content != null) element.textContent = String(content);
    return element;
  }
  function attr(element, attributes) {
    Object.keys(attributes).forEach(function (key) { element.setAttribute(key, String(attributes[key])); });
    return element;
  }
  function coordinate(value) { return value.toFixed(4); }
  function usableNorms(description, displayUnit) {
    return (Array.isArray(description.norms) ? description.norms : []).filter(function (norm) {
      return norm && norm.eligible === true && unit(norm.unit) === displayUnit
        && (finite(norm.low) || finite(norm.high))
        && (!finite(norm.low) || !finite(norm.high) || norm.low <= norm.high);
    });
  }
  function normSignature(norms) {
    return JSON.stringify(norms.map(function (norm) {
      return [finite(norm.low) ? norm.low : null, finite(norm.high) ? norm.high : null,
        unit(norm.unit), norm.label || '', norm.conditional === true];
    }));
  }
  function explicitSeries(entry) {
    var record = entry.clcrRecord || entry.record || {};
    return String(entry.seriesKey || record.seriesKey || '').trim();
  }
  function explicitMethod(entry) {
    var record = entry.clcrRecord || entry.record || {};
    return String(entry.method || record.method || '').trim();
  }
  function comparable(before, after) {
    // The model owns assay comparison. Do not bypass its saved mismatch, and
    // never join calculation methods/series merely because labels are alike.
    if (after.delta && after.delta.reason === 'method_mismatch') return false;
    return explicitSeries(before) === explicitSeries(after) && explicitMethod(before) === explicitMethod(after)
      && unit(before.unit) === unit(after.unit);
  }

  // One transient, non-interactive tooltip per document. SVG attributes carry
  // viewport geometry; presentation stays in CSS (no generated inline styles).
  var tooltips = new WeakMap(), selections = new WeakMap(), selectionContexts = new WeakSet(), previewGeneration = 0;
  function hidePreview(doc) {
    previewGeneration++;
    var close = tooltips.get(doc);
    if (close) close();
  }
  function clearSelection(doc) {
    var selected = selections.get(doc);
    if (!selected) return;
    selected.classList.remove('is-selected');
    selected.setAttribute('aria-pressed', 'false');
    selections.delete(doc);
  }
  function selectControl(doc, control) {
    clearSelection(doc);
    control.classList.add('is-selected');
    control.setAttribute('aria-pressed', 'true');
    selections.set(doc, control);
    if (selectionContexts.has(doc)) return;
    selectionContexts.add(doc);
    ['visibilitychange', 'vilda:session-changed', 'vilda:patient-loaded', 'vilda:user-state-cleared'].forEach(function (name) {
      doc.addEventListener(name, function () { clearSelection(doc); });
    });
  }
  function preview(doc, host, control, label, value, displayUnit, tone) {
    var win = doc.defaultView;
    if (!win || typeof control.getBoundingClientRect !== 'function') return;
    var previous = tooltips.get(doc);
    if (previous) previous();
    if (!control.isConnected || !host.isConnected) return;
    var layer = node(doc, 'div', 'vilda-lab-point-preview');
    layer.setAttribute('popover', 'manual');
    var canvas = layer.appendChild(node(doc, 'svg', 'vilda-lab-point-preview-canvas', null, true));
    attr(canvas, { width: '100%', height: '100%' });
    var target = canvas.appendChild(node(doc, 'foreignObject', 'vilda-lab-point-preview-target', null, true));
    attr(target, { x: 0, y: 0, width: Math.max(1, Math.min(360, win.innerWidth - 24)), height: 160 });
    var bubble = target.appendChild(node(doc, 'div', 'vilda-lab-point-preview-bubble'));
    var id = 'vilda-lab-point-preview-' + (++chooserId);
    attr(bubble, { id: id, role: 'tooltip' });
    bubble.appendChild(node(doc, 'span', 'vilda-lab-point-preview-name', label));
    var reading = bubble.appendChild(node(doc, 'span', 'vilda-lab-point-preview-reading'));
    var number = reading.appendChild(node(doc, 'strong', 'vilda-lab-point-preview-value', value));
    number.setAttribute('data-tone', tone);
    reading.appendChild(node(doc, 'span', 'vilda-lab-point-preview-unit', displayUnit));
    var oldDescription = control.getAttribute('aria-describedby');
    control.setAttribute('aria-describedby', (oldDescription ? oldDescription + ' ' : '') + id);
    doc.body.appendChild(layer);
    if (typeof layer.showPopover === 'function') layer.showPopover();
    var observer, closed = false;
    var contextEvents = ['visibilitychange', 'vilda:session-changed', 'vilda:patient-loaded', 'vilda:user-state-cleared'];
    function close() {
      if (closed) return;
      closed = true; previewGeneration++;
      if (observer) observer.disconnect();
      contextEvents.forEach(function (name) { doc.removeEventListener(name, close); });
      doc.removeEventListener('pointerdown', outside, true);
      doc.removeEventListener('keydown', key, true);
      doc.removeEventListener('scroll', scrolled, true);
      win.removeEventListener('resize', close);
      win.removeEventListener('blur', close);
      win.removeEventListener('pagehide', close);
      if (oldDescription) control.setAttribute('aria-describedby', oldDescription);
      else control.removeAttribute('aria-describedby');
      if (layer.parentNode) layer.parentNode.removeChild(layer);
      if (tooltips.get(doc) === close) tooltips.delete(doc);
    }
    function scrolled() {
      var next = control.getBoundingClientRect();
      if (Math.abs(next.left - bounds.left) > 0.5 || Math.abs(next.top - bounds.top) > 0.5) close();
    }
    function outside(event) { if (!control.contains(event.target)) close(); }
    function key(event) { if (event.key === 'Escape') { event.stopPropagation(); close(); } }
    function visible() {
      if (!host.isConnected || !control.isConnected || !control.getClientRects().length) return false;
      for (var parent = control; parent; parent = parent.parentElement) {
        if (parent.hidden || parent.inert || parent.getAttribute('aria-hidden') === 'true'
          || parent.classList.contains('vb22-private-content')) return false;
        var css = win.getComputedStyle(parent);
        if (css.visibility === 'hidden' || css.display === 'none' || Number(css.opacity) === 0
          || css.filter.indexOf('blur(') !== -1) return false;
      }
      return true;
    }
    function check() { if (!visible()) close(); }
    if (!visible()) { close(); return; }
    var bounds = control.getBoundingClientRect(), size = bubble.getBoundingClientRect();
    var left = Math.max(12, Math.min(win.innerWidth - size.width - 12, bounds.left + bounds.width / 2 - size.width / 2));
    var top = bounds.top - size.height - 8;
    if (top < 12) top = bounds.bottom + 8;
    top = Math.max(12, Math.min(win.innerHeight - size.height - 12, top));
    attr(target, { x: left, y: top });
    contextEvents.forEach(function (name) { doc.addEventListener(name, close); });
    doc.addEventListener('pointerdown', outside, true);
    doc.addEventListener('keydown', key, true);
    doc.addEventListener('scroll', scrolled, true);
    win.addEventListener('resize', close);
    win.addEventListener('blur', close);
    win.addEventListener('pagehide', close);
    if (typeof win.MutationObserver === 'function') {
      observer = new win.MutationObserver(check);
      observer.observe(doc.documentElement, { childList: true, subtree: true, attributes: true,
        attributeFilter: ['hidden', 'inert', 'aria-hidden', 'class', 'style', 'open'] });
    }
    close.control = control;
    close.bubble = bubble;
    bubble.addEventListener('pointerleave', close);
    tooltips.set(doc, close);
  }
  function bindPreview(doc, host, control, label, value, displayUnit, tone, interaction) {
    var win = doc.defaultView, hold = null, held = false, origin, leave = null;
    var touchPending = false, moved = false, selectedByPointer = false, pinned = false;
    function hide() { pinned = false; previewGeneration++; if (win && leave !== null) win.clearTimeout(leave); leave = null; var close = tooltips.get(doc); if (close && close.control === control) close(); }
    function show() { if (win && leave !== null) win.clearTimeout(leave); leave = null; preview(doc, host, control, label, value, displayUnit, tone); }
    function cancel() { if (win && hold !== null) win.clearTimeout(hold); hold = null; }
    control.addEventListener('pointerenter', function (event) { if (event.pointerType === 'mouse') show(); });
    control.addEventListener('pointerleave', function () {
      cancel();
      var leaving = tooltips.get(doc);
      if (!held && !pinned && win) leave = win.setTimeout(function () {
        leave = null; var close = tooltips.get(doc);
        if (close && close === leaving && !(close.bubble && close.bubble.matches(':hover'))) close();
      }, 180);
    });
    control.addEventListener('focus', function () {
      var generation = previewGeneration;
      if (win && win.requestAnimationFrame) win.requestAnimationFrame(function () {
        if (generation === previewGeneration && doc.activeElement === control) show();
      });
      else show();
    });
    control.addEventListener('blur', hide);
    control.addEventListener('keydown', function (event) {
      if (!interaction || ['Enter', ' ', 'Spacebar'].indexOf(event.key) === -1) return;
      touchPending = false; moved = false; selectedByPointer = false; held = false; origin = null; cancel();
    });
    function select() {
      if (!host.isConnected || !control.isConnected) return;
      selectedByPointer = true;
      selectControl(doc, control);
      interaction.select();
      pinned = true;
      show();
    }
    control.addEventListener('pointerdown', function (event) {
      held = false; cancel(); moved = false; selectedByPointer = false; origin = null;
      touchPending = event.pointerType === 'touch' || event.pointerType === 'pen';
      if (!win || !touchPending) return;
      origin = { x: event.clientX, y: event.clientY };
      hold = win.setTimeout(function () { hold = null; held = true; show(); }, 420);
    });
    control.addEventListener('pointermove', function (event) {
      if (origin && Math.abs(event.clientX - origin.x) + Math.abs(event.clientY - origin.y) > 10) {
        moved = true; cancel();
        if (interaction) hide();
      }
    });
    control.addEventListener('pointerup', function () {
      cancel();
      if (interaction && touchPending && !moved) select();
      origin = null;
    });
    control.addEventListener('pointercancel', function () { cancel(); held = false; moved = true; origin = null; hide(); });
    control.addEventListener('contextmenu', function (event) { if (held || hold !== null) event.preventDefault(); });
    control.addEventListener('click', function (event) {
      cancel();
      if (interaction) {
        if (!host.isConnected || !control.isConnected) return;
        var touchClick = touchPending || event.pointerType === 'touch' || event.pointerType === 'pen';
        touchPending = false;
        if (touchClick || moved || held) {
          if (touchClick && !moved && !selectedByPointer) select();
          event.preventDefault();
          if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
          held = false;
          return;
        }
        selectControl(doc, control);
        interaction.select();
        hide();
        interaction.open();
        return;
      }
      if (held) { held = false; event.preventDefault(); event.stopImmediatePropagation(); return; }
      hide();
    }, true);
  }

  function render(doc, view, options) {
    options = options || {};
    if (!doc || typeof doc.createElementNS !== 'function' || !view || !view.chart || typeof options.describe !== 'function') return null;
    var previousSelection = selections.get(doc);
    if (previousSelection && !previousSelection.isConnected) clearSelection(doc);
    var displayUnit = unit(view.unit || view.chart.unit);
    if (!displayUnit) return null;
    var formatNumber = typeof options.formatNumber === 'function' ? options.formatNumber : defaultNumber;
    var formatDate = typeof options.formatDate === 'function' ? options.formatDate : defaultDate;
    var sourceEntries = Array.isArray(view.entries) ? view.entries : [];
    var described = sourceEntries.map(function (entry, order) {
      var stamp = day(entry.dateISO), description;
      try { description = options.describe(entry); } catch (_) { return null; }
      if (!description) return null;
      return { entry: entry, order: order, stamp: stamp, description: description,
        norms: usableNorms(description, displayUnit) };
    }).filter(Boolean);
    var entries = described.filter(function (item) {
      return item.stamp != null && SAMPLES.indexOf(item.entry.dateSource) !== -1 && unit(item.description.unit) === displayUnit;
    }).sort(function (a, b) { return a.stamp - b.stamp || a.order - b.order; });
    var points = (Array.isArray(view.chart.points) ? view.chart.points : []).map(function (point, order) {
      if (!point || !finite(point.v) || day(point.dateISO) == null) return null;
      var saved = entries.filter(function (item) { return item.entry.noteId === point.noteId && item.entry.dateISO === point.dateISO; })[0];
      // The history model supplies exact, comparable points. The presentation must
      // independently agree that this entry still has an exact value.
      if (!saved || !finite(saved.description.value) || saved.description.value !== point.v) return null;
      return { point: point, saved: saved, stamp: saved.stamp, order: order };
    }).filter(Boolean).sort(function (a, b) { return a.stamp - b.stamp || a.order - b.order; });
    if (!points.length) return null;

    var timeline = [];
    entries.forEach(function (item) {
      var sameDate = timeline[timeline.length - 1];
      if (!sameDate || sameDate.stamp !== item.stamp) timeline.push({ stamp: item.stamp, date: item.entry.dateISO, records: [item] });
      else sameDate.records.push(item);
    });
    timeline.forEach(function (date) {
      var first = date.records[0], signature = normSignature(first.norms);
      // Different ranges on the same date cannot become one shared green band.
      date.norms = date.records.every(function (item) { return normSignature(item.norms) === signature; }) ? first.norms : [];
    });
    var values = points.map(function (point) { return point.point.v; });
    timeline.forEach(function (date) {
      date.norms.forEach(function (norm) {
        if (finite(norm.low)) values.push(norm.low);
        if (finite(norm.high)) values.push(norm.high);
      });
    });
    var smallest = Math.min.apply(Math, values), largest = Math.max.apply(Math, values);
    var low = Math.min(0, smallest), high = Math.max(0, largest);
    var span = high - low;
    if (!finite(span)) return null;
    if (span === 0) { high = low + 1; span = 1; }
    var padding = span * 0.12;
    if (low < 0 && finite(low - padding)) low -= padding;
    if (finite(high + padding)) high += padding;
    span = high - low;
    if (!finite(span) || span <= 0) return null;
    var firstStamp = timeline[0].stamp, lastStamp = timeline[timeline.length - 1].stamp;
    var x = function (stamp) { return firstStamp === lastStamp ? 50 : 8 + (stamp - firstStamp) / (lastStamp - firstStamp) * 84; };
    var y = function (value) { return 92 - (value - low) / span * 84; };
    var pointDates = [];
    points.forEach(function (point) {
      if (!pointDates.length || pointDates[pointDates.length - 1].stamp !== point.stamp) pointDates.push({ stamp: point.stamp, date: point.saved.entry.dateISO });
    });
    var minGap = null;
    pointDates.forEach(function (date, index) {
      if (index) minGap = minGap == null ? date.stamp - pointDates[index - 1].stamp : Math.min(minGap, date.stamp - pointDates[index - 1].stamp);
    });
    var requiredPlotWidth = minGap == null ? MIN_PLOT_WIDTH : Math.max(MIN_PLOT_WIDTH, Math.ceil(48 * (lastStamp - firstStamp) / (0.84 * minGap)));
    var plotWidth = Math.min(MAX_CHART_WIDTH - WIDTH_GUTTER, requiredPlotWidth);
    var crowded = requiredPlotWidth > plotWidth, lanes = [], axisDates = [];
    pointDates.forEach(function (date) {
      var position = x(date.stamp) / 100 * plotWidth, lane = -1;
      for (var index = 0; index < 2; index++) if (lanes[index] == null || position - lanes[index] >= 48) { lane = index; break; }
      if (lane === -1) return;
      lanes[lane] = position;
      axisDates.push({ stamp: date.stamp, date: date.date, lane: lane });
    });
    var dateHeight = axisDates.some(function (date) { return date.lane === 1; }) ? DATE_ROW_HEIGHT * 2 : DATE_ROW_HEIGHT;

    var host = node(doc, 'div', 'vilda-lab-result-chart');
    var scroll = host.appendChild(node(doc, 'div', 'vilda-lab-result-chart-scroll'));
    attr(scroll, { tabindex: 0, role: 'region', 'aria-label': 'Historia wyników ' + (view.label || view.test || '') });
    // The outer canvas has no viewBox: its foreignObject and all HTML text
    // retain CSS-pixel sizes. A CSS min-width of 100% lets it fill a wider card.
    var layout = scroll.appendChild(node(doc, 'svg', 'vilda-lab-result-chart-layout' + (dateHeight > DATE_ROW_HEIGHT ? ' has-date-lanes' : ''), null, true));
    attr(layout, { width: plotWidth + WIDTH_GUTTER, height: PLOT_HEIGHT + dateHeight + 25, role: 'group', 'data-plot-width': plotWidth, 'data-crowded': String(crowded) });
    var body = layout.appendChild(node(doc, 'foreignObject', 'vilda-lab-result-chart-layout-body', null, true));
    attr(body, { x: 0, y: 0, width: '100%', height: '100%' });
    var area = body.appendChild(node(doc, 'div', 'vilda-lab-result-chart-area'));
    var ticks = area.appendChild(node(doc, 'div', 'vilda-lab-result-chart-y'));
    ticks.setAttribute('aria-hidden', 'true');
    [high, (high + low) / 2, low].forEach(function (value) {
      ticks.appendChild(node(doc, 'span', '', formatNumber(value)));
    });
    var plot = area.appendChild(node(doc, 'div', 'vilda-lab-result-chart-plot'));
    var svg = plot.appendChild(node(doc, 'svg', 'vilda-lab-result-chart-svg', null, true));
    attr(svg, { viewBox: '0 0 100 100', preserveAspectRatio: 'none', role: 'img',
      'aria-label': (view.label || view.test || '') + '. ' + points.length + ' dokładnych wyników. Jednostka: ' + displayUnit + '. Zakresy odniesienia z poszczególnych zapisów.' });
    var grid = svg.appendChild(node(doc, 'g', 'vilda-lab-result-chart-grid', null, true));
    [high, (high + low) / 2, low].forEach(function (value) {
      attr(grid.appendChild(node(doc, 'line', '', null, true)), { x1: 0, x2: 100, y1: coordinate(y(value)), y2: coordinate(y(value)), stroke: '#dce7e9', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' });
    });
    var references = svg.appendChild(node(doc, 'g', 'vilda-lab-result-chart-references', null, true));
    timeline.forEach(function (date, index) {
      var left = index === 0 ? 0 : (x(date.stamp) + x(timeline[index - 1].stamp)) / 2;
      var right = index === timeline.length - 1 ? 100 : (x(date.stamp) + x(timeline[index + 1].stamp)) / 2;
      date.norms.forEach(function (norm) {
        var label = formatDate(date.date) + ': ' + (norm.label ? norm.label + ' · ' : '') + norm.text;
        var bounds = { 'data-date': date.date, 'data-norm': norm.text || '', 'data-low': finite(norm.low) ? norm.low : '', 'data-high': finite(norm.high) ? norm.high : '' };
        var colorable = date.norms.length === 1 && norm.conditional !== true && ['within', 'below', 'above'].indexOf(norm.tone) !== -1;
        if (colorable && finite(norm.low) && finite(norm.high)) {
          var band = references.appendChild(node(doc, 'rect', 'vilda-lab-result-chart-band', null, true));
          attr(band, Object.assign({ x: coordinate(left), width: coordinate(right - left), y: coordinate(y(norm.high)), height: coordinate(Math.max(0, y(norm.low) - y(norm.high))), fill: COLORS.within, 'fill-opacity': 0.12 }, bounds));
          band.appendChild(node(doc, 'title', '', label, true));
        }
        [norm.low, norm.high].filter(finite).forEach(function (bound) {
          var line = references.appendChild(node(doc, 'line', 'vilda-lab-result-chart-bound', null, true));
          attr(line, Object.assign({ x1: coordinate(left), x2: coordinate(right), y1: coordinate(y(bound)), y2: coordinate(y(bound)), stroke: colorable ? '#659c88' : '#779aa2', 'stroke-dasharray': '3 3', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }, bounds));
          line.appendChild(node(doc, 'title', '', label, true));
        });
      });
    });
    var guides = svg.appendChild(node(doc, 'g', 'vilda-lab-result-chart-guides', null, true));
    guides.setAttribute('aria-hidden', 'true');
    points.forEach(function (point) {
      attr(guides.appendChild(node(doc, 'line', 'vilda-lab-result-chart-guide', null, true)), { x1: coordinate(x(point.stamp)), x2: coordinate(x(point.stamp)), y1: coordinate(y(point.point.v)), y2: 100, 'data-note-id': point.saved.entry.noteId || '', 'data-date': point.saved.entry.dateISO });
    });
    attr(guides.appendChild(node(doc, 'line', 'vilda-lab-result-chart-baseline', null, true)), { x1: 0, x2: 100, y1: 100, y2: 100 });

    var gaps = (Array.isArray(view.chart.gaps) ? view.chart.gaps : []).map(function (gap) { return day(gap.dateISO); }).filter(function (stamp) { return stamp != null; });
    described.forEach(function (item) {
      if (item.stamp != null && SAMPLES.indexOf(item.entry.dateSource) !== -1 && !points.some(function (point) { return point.saved.entry === item.entry; })) gaps.push(item.stamp);
    });
    var counts = {};
    points.forEach(function (point) { counts[point.stamp] = (counts[point.stamp] || 0) + 1; });
    var previous = null;
    points.forEach(function (point) {
      var disconnected = previous && (counts[previous.stamp] > 1 || counts[point.stamp] > 1 || !comparable(previous.saved.entry, point.saved.entry) || gaps.some(function (gap) { return gap >= previous.stamp && gap <= point.stamp; }));
      if (options.joinLines !== false && previous && !disconnected) {
        attr(svg.appendChild(node(doc, 'line', 'vilda-lab-result-chart-line', null, true)), { x1: coordinate(x(previous.stamp)), x2: coordinate(x(point.stamp)), y1: coordinate(y(previous.point.v)), y2: coordinate(y(point.point.v)), stroke: '#087f89', 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke', 'data-from-id': previous.saved.entry.noteId || '', 'data-to-id': point.saved.entry.noteId || '' });
      }
      previous = point;
    });
    function pointTone(point) {
      var tone = point.saved.description.tone;
      return Object.prototype.hasOwnProperty.call(COLORS, tone) ? tone : 'neutral';
    }
    function shownValue(point) {
      return point.saved.entry.display || point.saved.entry.raw || formatNumber(point.point.v) + ' ' + displayUnit;
    }
    function pointTitle(point) {
      return (view.label || view.test || '') + ': ' + shownValue(point) + ' · ' + formatDate(point.saved.entry.dateISO)
        + ' · Norma: ' + (point.saved.description.normText || '—');
    }
    // Two records with the same date and exact value share the same real
    // coordinate. One control opens a choice instead of covering an older
    // record with a second button or inventing a different result position.
    var groups = [], groupByPosition = Object.create(null);
    points.forEach(function (point) {
      var key = point.stamp + '|' + point.point.v;
      if (!groupByPosition[key]) {
        groupByPosition[key] = [];
        groups.push(groupByPosition[key]);
      }
      groupByPosition[key].push(point);
    });
    // This unscaled SVG uses percentages for each real coordinate and actual
    // CSS pixels for each 44 px target. It never scales button text or hit areas
    // with the data viewBox and needs no generated inline CSS.
    var pointLayer = plot.appendChild(node(doc, 'svg', 'vilda-lab-result-chart-point-layer', null, true));
    attr(pointLayer, { width: '100%', height: '100%', role: 'group', 'aria-label': typeof options.openEntries === 'function' ? 'Wybierz zapisany wynik' : 'Otwórz zapisany wynik' });
    groups.forEach(function (group) {
      var point = group[0], entry = point.saved.entry;
      var tone = pointTone(point);
      if (!group.every(function (item) { return pointTone(item) === tone; })) tone = 'neutral';
      var title = pointTitle(point);
      var target = pointLayer.appendChild(node(doc, 'foreignObject', 'vilda-lab-result-chart-target', null, true));
      attr(target, { x: coordinate(x(point.stamp)) + '%', y: coordinate(y(point.point.v)) + '%', width: 44, height: 44, transform: 'translate(-22 -22)' });
      var control = target.appendChild(node(doc, 'button', 'vilda-lab-result-chart-point'));
      attr(control, { type: 'button', 'data-value': point.point.v, 'data-tone': tone, 'data-date': entry.dateISO,
        'aria-label': title + '. Otwórz wynik' });
      control.appendChild(node(doc, 'span', 'vilda-lab-result-chart-dot'));
      var label = String(view.label || view.test || '').trim();
      if (!view.clcr) label = label.split('(')[0].trim() || label;
      var shown = String(shownValue(point)).replace(/\s+/g, ' ').trim();
      if (shown.charAt(shown.length - displayUnit.length - 1) === ' ' && unit(shown.slice(-displayUnit.length)) === displayUnit) shown = shown.slice(0, -displayUnit.length - 1);
      if (typeof options.openEntries === 'function') {
        var selectedEntries = group.map(function (item) { return item.saved.entry; });
        control.setAttribute('aria-pressed', 'false');
        control.setAttribute('aria-label', title + '. Wybierz punkt. Pełne dane są dostępne przyciskiem Szczegóły lub po aktywacji klawiaturą.');
        if (group.length === 1) control.setAttribute('data-note-id', entry.noteId || '');
        else {
          control.setAttribute('data-count', group.length);
          control.setAttribute('aria-label', title + '. Wyniki w tym punkcie: ' + group.length + '. Wybierz punkt, a następnie Szczegóły.');
          control.appendChild(node(doc, 'span', 'vilda-lab-result-chart-count', group.length)).setAttribute('aria-hidden', 'true');
        }
        bindPreview(doc, host, control, label, shown, displayUnit, tone, {
          select: function () { if (typeof options.selectEntries === 'function') options.selectEntries(selectedEntries, control); },
          open: function () { options.openEntries(selectedEntries, control); }
        });
        return;
      }
      bindPreview(doc, host, control, label, shown, displayUnit, tone);
      if (group.length === 1) {
        control.setAttribute('data-note-id', entry.noteId || '');
        if (typeof options.openNote === 'function' && entry.noteId) control.addEventListener('click', function () { options.openNote(entry.noteId); });
        return;
      }
      var chooser = host.appendChild(node(doc, 'div', 'vilda-lab-result-chart-chooser'));
      chooser.hidden = true;
      attr(chooser, { id: 'vilda-lab-chart-choice-' + (++chooserId), role: 'group', 'aria-label': 'Wybierz wynik z tego punktu' });
      attr(control, { 'data-count': group.length, 'aria-expanded': 'false', 'aria-controls': chooser.id,
        'aria-label': (view.label || view.test || '') + ': ' + shownValue(point) + ' · ' + formatDate(entry.dateISO) + '. Wyniki w tym punkcie: ' + group.length + '. Wybierz wynik.' });
      control.appendChild(node(doc, 'span', 'vilda-lab-result-chart-count', group.length)).setAttribute('aria-hidden', 'true');
      chooser.appendChild(node(doc, 'p', 'vilda-lab-result-chart-chooser-title', 'Wyniki z ' + formatDate(entry.dateISO)));
      var choices = group.map(function (item) {
        var row = item.saved.entry, choice = chooser.appendChild(node(doc, 'button', 'vilda-lab-result-chart-choice'));
        attr(choice, { type: 'button', 'data-note-id': row.noteId || '', 'data-tone': pointTone(item), 'aria-label': pointTitle(item) + '. Otwórz wynik' });
        choice.appendChild(node(doc, 'span', 'vilda-lab-result-chart-choice-value', shownValue(item)));
        choice.appendChild(node(doc, 'time', 'vilda-lab-result-chart-choice-date', formatDate(row.dateISO))).setAttribute('datetime', row.dateISO);
        choice.appendChild(node(doc, 'span', 'vilda-lab-result-chart-choice-norm', 'Norma: ' + (item.saved.description.normText || '—')));
        if (typeof options.openNote === 'function' && row.noteId) choice.addEventListener('click', function () {
          chooser.hidden = true;
          control.setAttribute('aria-expanded', 'false');
          control.focus();
          options.openNote(row.noteId);
        });
        return choice;
      });
      control.addEventListener('click', function () {
        chooser.hidden = !chooser.hidden;
        control.setAttribute('aria-expanded', String(!chooser.hidden));
        if (!chooser.hidden && choices.length) choices[0].focus();
      });
      chooser.addEventListener('keydown', function (event) {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        chooser.hidden = true;
        control.setAttribute('aria-expanded', 'false');
        control.focus();
      });
    });
    var dates = area.appendChild(node(doc, 'svg', 'vilda-lab-result-chart-x' + (dateHeight > DATE_ROW_HEIGHT ? ' has-date-lanes' : ''), null, true));
    attr(dates, { 'aria-hidden': 'true', width: '100%', height: dateHeight });
    axisDates.filter(function (date) { return date.lane === 1; }).forEach(function (date) {
      attr(dates.appendChild(node(doc, 'line', 'vilda-lab-result-chart-date-stem', null, true)), { x1: coordinate(x(date.stamp)) + '%', x2: coordinate(x(date.stamp)) + '%', y1: 0, y2: DATE_ROW_HEIGHT });
    });
    axisDates.forEach(function (date) {
      var target = dates.appendChild(node(doc, 'foreignObject', 'vilda-lab-result-chart-date-target', null, true));
      attr(target, { x: coordinate(x(date.stamp)) + '%', y: date.lane * DATE_ROW_HEIGHT, width: 44, height: DATE_ROW_HEIGHT, transform: 'translate(-22 0)' });
      var label = target.appendChild(node(doc, 'time', 'vilda-lab-result-chart-date'));
      attr(label, { datetime: date.date, 'data-date': date.date });
      label.appendChild(node(doc, 'span', 'vilda-lab-result-chart-date-day', date.date.slice(8, 10) + '.' + date.date.slice(5, 7)));
      label.appendChild(node(doc, 'span', 'vilda-lab-result-chart-date-year', date.date.slice(0, 4)));
    });
    // A bounded canvas cannot spread an arbitrarily dense cluster. Preserve
    // every exact note as a separate clickable record below it instead.
    var plotted = points.map(function (point) { return point.saved.entry; });
    var fallback = described.filter(function (item) { return crowded || plotted.indexOf(item.entry) === -1; });
    if (fallback.length) {
      var records = host.appendChild(node(doc, 'div', 'vilda-lab-result-chart-records'));
      records.setAttribute('aria-label', 'Zapisane wyniki');
      fallback.slice().sort(function (a, b) { return (b.stamp == null ? -Infinity : b.stamp) - (a.stamp == null ? -Infinity : a.stamp) || a.order - b.order; }).forEach(function (item) {
        var row = item.entry;
        if (!row.noteId) return;
        var link = records.appendChild(node(doc, 'button', 'vilda-lab-result-chart-record'));
        var value = row.display || row.raw || '—', when = item.stamp != null ? formatDate(row.dateISO) : 'Bez daty';
        attr(link, { type: 'button', 'data-note-id': row.noteId, 'data-tone': pointTone({ saved: item }), 'aria-label': (view.label || view.test || '') + ': ' + value + ' · ' + when + '. Otwórz wynik' });
        link.appendChild(node(doc, 'span', 'vilda-lab-result-chart-record-value', value));
        var recordedDate = link.appendChild(node(doc, 'time', 'vilda-lab-result-chart-record-date', when));
        if (item.stamp != null) recordedDate.setAttribute('datetime', row.dateISO);
        if (typeof options.openEntries === 'function') link.addEventListener('click', function () { hidePreview(doc); options.openEntries([row], link); });
        else if (typeof options.openNote === 'function') link.addEventListener('click', function () { options.openNote(row.noteId); });
      });
    }
    return host;
  }

  root.VildaLabResultChart = Object.freeze({ version: '1.3.0', render: render, hidePreview: hidePreview, clearSelection: clearSelection });
})(typeof window !== 'undefined' ? window : globalThis);
