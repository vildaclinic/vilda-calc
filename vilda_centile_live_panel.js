/* Inline centile preview: layout and lifecycle only. The data adapter owns the
 * patient boundary; the renderer reuses the export models without changing them.
 */
(function (w) {
  'use strict';
  if (!w || w.VildaCentileLivePanel) return;
  var d = w.document;
  var mount, form, fieldset, doctor, view, snapshot, rendered, fullscreen;
  var request = 0, timer = 0, layoutFrame = 0, started = false;
  var status = 'hidden', lastWidth = 0, collapsedHeight = 0, lastHeight = 0, renderKey = '';
  var data = w.VildaCentileLiveData;

  function twoColumns() {
    if (!form || !fieldset || !doctor || !form.getClientRects().length) return false;
    var columns = w.getComputedStyle(form).gridTemplateColumns.trim().split(/\s+/);
    var left = fieldset.getBoundingClientRect(), right = doctor.getBoundingClientRect();
    return columns.length === 2 && left.width > 0 && right.width > 0
      && right.left >= left.right - 1 && right.top < left.bottom;
  }

  function activeClass(active) {
    d.documentElement.classList.toggle('vilda-centile-live-active', active);
    if (mount) mount.hidden = !active;
  }

  function clear(reason) {
    var wasVisible = !!view;
    request += 1;
    snapshot = null;
    rendered = null;
    renderKey = '';
    status = 'hidden';
    if (view) view.element.hidden = true;
    var oldView = view;
    view = null;
    var oldFullscreen = fullscreen;
    fullscreen = null;
    // Invalidating closes are immediate. Erase the old patient's card before a
    // subsequent async snapshot or a restored source document can become visible.
    if (oldFullscreen) oldFullscreen.close(reason || 'stale');
    if (oldView) oldView.destroy();
    activeClass(false);
    if (wasVisible && typeof w.__vildaRemindersResync === 'function') {
      w.__vildaRemindersResync();
    }
    lastHeight = 0;
    collapsedHeight = 0;
    lastWidth = 0;
  }

  function inlineSize() {
    if (!view || !mount || mount.hidden || !twoColumns()) return;
    var bounds = fieldset.getBoundingClientRect();
    var puberty = d.getElementById('tannerStageWrap');
    var expanded = puberty && puberty.getClientRects().length
      && w.getComputedStyle(puberty).display !== 'none';
    if (!expanded) {
      collapsedHeight = bounds.height;
      lastWidth = bounds.width;
    } else if (!collapsedHeight || Math.abs(bounds.width - lastWidth) > 1) {
      var styles = w.getComputedStyle(puberty);
      var removed = puberty.getBoundingClientRect().height
        + (parseFloat(styles.marginTop) || 0) + (parseFloat(styles.marginBottom) || 0);
      var before = puberty.previousElementSibling, after = puberty.nextElementSibling;
      while (before && !before.getClientRects().length) before = before.previousElementSibling;
      while (after && !after.getClientRects().length) after = after.nextElementSibling;
      if (before && after) {
        // Hiding the panel leaves the normal collapsed margin between its
        // neighbours. Subtracting both panel margins would remove that gap too.
        var bottomMargin = parseFloat(w.getComputedStyle(before).marginBottom) || 0;
        var topMargin = parseFloat(w.getComputedStyle(after).marginTop) || 0;
        var remainingGap = Math.max(0, bottomMargin, topMargin) + Math.min(0, bottomMargin, topMargin);
        removed = after.getBoundingClientRect().top - before.getBoundingClientRect().bottom - remainingGap;
      }
      collapsedHeight = bounds.height - removed;
      lastWidth = bounds.width;
    }
    // The status strip sits above the card on Start. As with Reminders, align
    // the bottom with the collapsed form rather than stretching the grid row.
    var offset = Math.max(0, mount.getBoundingClientRect().top - bounds.top);
    var height = Math.max(280, Math.round(collapsedHeight - offset));
    if (height !== lastHeight) {
      mount.style.setProperty('--vilda-centile-live-inline-height', height + 'px');
      lastHeight = height;
    }
    view.fit();
  }

  function layout() {
    layoutFrame = 0;
    if (!twoColumns()) {
      if (view || snapshot) clear('stale');
      return;
    }
    if (snapshot && !data.isCurrent(snapshot)) { clear('stale'); schedule(); return; }
    if (!view) { schedule(); return; }
    inlineSize();
  }

  function scheduleLayout() {
    if (!layoutFrame) layoutFrame = w.requestAnimationFrame(layout);
  }

  function expand() {
    if (!view || !snapshot || fullscreen || !data.isCurrent(snapshot) || !twoColumns()) return;
    var currentView = view, currentSnapshot = snapshot;
    var host = w.VildaCentileLiveHost;
    if (!host) return;
    var closedDuringOpen = false;
    var handle = host.open({
      sourceWindow: w, element: currentView.element,
      opener: currentView.expandButton, patientToken: currentSnapshot.patientToken,
      // ResizeObserver/window resize enforce the two-column layout separately;
      // the host's per-frame ownership check must not force a layout read.
      isCurrent: function (token) { return view === currentView && data.isCurrent(token); },
      onMount: function () {
        currentView.setFullscreen(true);
        currentView.fit();
      },
      onRestore: function (result) {
        currentView.setFullscreen(false);
        if (result.current && view === currentView) {
          currentView.fit();
        }
      },
      onClose: function () {
        closedDuringOpen = true;
        if (view === currentView) {
          fullscreen = null;
          scheduleLayout();
        }
      }
    });
    fullscreen = closedDuringOpen ? null : handle;
  }

  function createView() {
    view = w.VildaCentileLiveView.create({
      document: d,
      onExpand: expand,
      onClose: function () { if (fullscreen) fullscreen.close('user'); },
      probe: function (metric, ageMonths) { return w.VildaCentileLiveRender.probe(metric, ageMonths); }
    });
    mount.appendChild(view.element);
  }

  async function refresh() {
    if (!started || !data) return;
    w.clearTimeout(timer);
    timer = 0;
    if (!twoColumns()) { clear('stale'); return; }
    if (snapshot && !data.isCurrent(snapshot)) clear('stale');
    var revision = ++request;
    var next;
    try { next = await data.getSnapshot(); }
    catch (_) { next = null; }
    if (revision !== request) return;
    if (!next || !data.isCurrent(next) || !twoColumns()) { clear('stale'); return; }
    if (snapshot && snapshot.patientToken !== next.patientToken) clear('patient-change');
    var nextKey = JSON.stringify(next);
    snapshot = next;
    if (view && rendered && nextKey === renderKey) { inlineSize(); return; }
    if (!view) createView();
    activeClass(true);
    view.element.hidden = false;
    try {
      rendered = w.VildaCentileLiveRender.render(next);
      if (!data.isCurrent(next)) { clear('stale'); return; }
      status = rendered && rendered.status || 'ready';
      view.update(rendered, next);
      renderKey = nextKey;
    } catch (_) {
      rendered = null;
      status = 'unavailable';
      view.setStatus('Nie udało się wyświetlić siatki. Spróbuj ponownie po zmianie danych.');
    }
    inlineSize();
  }

  function schedule(event) {
    if (event && event.identityChanged) clear(event.reason === 'lock' ? 'lock' : 'patient-change');
    else if (snapshot && !data.isCurrent(snapshot)) clear('stale');
    w.clearTimeout(timer);
    timer = w.setTimeout(refresh, event && event.identityChanged ? 0 : 100);
  }

  function start() {
    if (started || !data || !w.VildaCentileLiveView || !w.VildaCentileLiveRender) return;
    form = d.getElementById('calcForm');
    fieldset = d.querySelector('#userSection fieldset.user-card');
    doctor = d.getElementById('doctorSection');
    mount = d.getElementById('vildaCentileLiveMount');
    if (!form || !fieldset || !doctor || !mount) return;
    started = true;
    data.subscribe(schedule);
    if (typeof w.ResizeObserver === 'function') {
      var resize = new w.ResizeObserver(scheduleLayout);
      resize.observe(fieldset);
      resize.observe(form);
      var strip = d.getElementById('vildaStatusSide');
      if (strip) resize.observe(strip);
    }
    w.addEventListener('resize', scheduleLayout);
    w.addEventListener('pageshow', schedule);
    w.addEventListener('pagehide', function () { clear('pagehide'); });
    refresh();
  }

  w.VildaCentileLivePanel = Object.freeze({
    refresh: refresh,
    getState: function () {
      return Object.assign({ eligible: !!snapshot, status: status,
        patientId: snapshot ? snapshot.patientId : null,
        source: rendered ? rendered.source : null, fullscreen: !!fullscreen },
      view ? view.getState() : {});
    }
  });
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})(typeof window !== 'undefined' ? window : undefined);
