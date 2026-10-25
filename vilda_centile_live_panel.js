/* Inline centile preview: layout and lifecycle only. The data adapter owns the
 * patient boundary; the renderer reuses the export models without changing them.
 */
(function (w) {
  'use strict';
  if (!w || w.VildaCentileLivePanel) return;
  var d = w.document;
  var mount, form, fieldset, doctor, view, snapshot, rendered, fullscreen;
  var request = 0, timer = 0, pendingTimer = 0, layoutFrame = 0, started = false;
  var notice, noticeMessage, retryButton, slotStatus = 'ineligible', awaitingEdit = false;
  var status = 'hidden', lastWidth = 0, collapsedHeight = 0, lastHeight = 0, renderKey = '';
  var data = w.VildaCentileLiveData;

  function twoColumns() {
    if (!form || !fieldset || !doctor || !form.getClientRects().length) return false;
    var columns = w.getComputedStyle(form).gridTemplateColumns.trim().split(/\s+/);
    var left = fieldset.getBoundingClientRect(), right = doctor.getBoundingClientRect();
    return columns.length === 2 && left.width > 0 && right.width > 0
      && right.left >= left.right - 1 && right.top < left.bottom;
  }

  function slot(state) {
    var wasReserved = slotStatus !== 'ineligible';
    slotStatus = state;
    var reserved = state !== 'ineligible';
    d.documentElement.classList.toggle('vilda-centile-live-booting', false);
    d.documentElement.classList.toggle('vilda-centile-live-reserved', reserved);
    d.documentElement.classList.toggle('vilda-centile-live-active', !!view);
    if (mount) {
      mount.hidden = !reserved;
      mount.setAttribute('data-centile-live-state', state);
      mount.setAttribute('aria-busy', state === 'pending' ? 'true' : 'false');
    }
    if (!reserved && wasReserved && typeof w.__vildaRemindersResync === 'function') {
      w.__vildaRemindersResync();
    }
  }

  function stopPending() {
    w.clearTimeout(pendingTimer);
    pendingTimer = 0;
  }

  function discardView(reason) {
    awaitingEdit = false;
    snapshot = null;
    rendered = null;
    renderKey = '';
    if (view) view.element.hidden = true;
    var oldView = view;
    view = null;
    var oldFullscreen = fullscreen;
    fullscreen = null;
    // Erase the old patient's image synchronously. The neutral slot can remain
    // reserved while the next patient's ownership and data are being checked.
    if (oldFullscreen) oldFullscreen.close(reason || 'stale');
    if (retryButton && notice) notice.appendChild(retryButton);
    if (oldView) oldView.destroy();
    d.documentElement.classList.toggle('vilda-centile-live-active', false);
  }

  function clear(reason) {
    request += 1;
    w.clearTimeout(timer);
    timer = 0;
    stopPending();
    discardView(reason);
    status = 'hidden';
    if (notice) notice.hidden = true;
    if (retryButton) retryButton.hidden = true;
    slot('ineligible');
    lastHeight = 0;
    collapsedHeight = 0;
    lastWidth = 0;
  }

  function showError(message) {
    awaitingEdit = false;
    stopPending();
    status = 'unavailable';
    rendered = null;
    renderKey = '';
    if (view && snapshot && data.isCurrent(snapshot)) {
      try { view.setStatus(message); }
      catch (_) { discardView('view-error'); }
    } else discardView('stale');
    if (view) {
      if (notice) notice.hidden = true;
      if (retryButton) view.element.appendChild(retryButton);
    } else {
      if (notice) notice.hidden = false;
      if (noticeMessage) noticeMessage.textContent = message;
    }
    if (retryButton) retryButton.hidden = false;
    slot('error');
    inlineSize();
  }

  function showPending(waitForEdit) {
    awaitingEdit = !!waitForEdit;
    if (view && snapshot && !data.isCurrent(snapshot)) discardView('stale');
    if (!view) status = 'pending';
    if (notice) notice.hidden = !!view;
    if (noticeMessage) noticeMessage.textContent = awaitingEdit
      ? 'Siatka pojawi się po zakończeniu edycji pola.' : 'Wczytywanie siatki…';
    if (retryButton) retryButton.hidden = true;
    slot('pending');
    // A lost completion event or a hung read must become a recoverable error,
    // never an endless placeholder or a time-based return to Reminders.
    if (awaitingEdit) stopPending();
    else if (!pendingTimer) pendingTimer = w.setTimeout(function () {
      pendingTimer = 0;
      request += 1;
      w.clearTimeout(timer);
      timer = 0;
      if (!twoColumns() || eligibility().status === 'ineligible') { clear('stale'); return; }
      showError('Wczytywanie siatki trwa zbyt długo. Spróbuj ponownie.');
    }, 10000);
    inlineSize();
  }

  function eligibility() {
    return typeof data.getEligibility === 'function' ? data.getEligibility() : { status: 'eligible' };
  }

  function prepare() {
    if (!twoColumns()) { clear('stale'); return false; }
    var state = eligibility();
    if (state.status === 'ineligible') { clear('stale'); return false; }
    if (snapshot && !data.isCurrent(snapshot)) discardView('stale');
    if (state.status === 'error') {
      showError('Nie udało się wczytać siatki. Spróbuj ponownie.');
      return false;
    }
    showPending(awaitingEdit);
    return true;
  }

  function inlineSize() {
    if (!mount || mount.hidden || !twoColumns()) return;
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
    if (view) view.fit();
  }

  function layout() {
    layoutFrame = 0;
    if (!twoColumns()) {
      if (slotStatus !== 'ineligible') clear('stale');
      return;
    }
    if (snapshot && !data.isCurrent(snapshot)) { discardView('stale'); schedule(); return; }
    if (slotStatus === 'ineligible') { schedule(); return; }
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
    if (!prepare()) return;
    var revision = ++request;
    var result;
    try {
      if (typeof data.getResult === 'function') result = await data.getResult();
      else {
        // Compatibility for existing independent consumers of the controller.
        var legacy = await data.getSnapshot();
        var refreshState = typeof data.getRefreshState === 'function' ? data.getRefreshState(snapshot) : null;
        result = legacy ? { status: 'ready', snapshot: legacy }
          : { status: refreshState || 'ineligible' };
      }
    } catch (_) { result = { status: 'error' }; }
    if (revision !== request) return;
    if (!twoColumns()) { clear('stale'); return; }
    if (!result || result.status === 'error') {
      showError('Nie udało się wczytać siatki. Spróbuj ponownie.');
      return;
    }
    if (result.status === 'ineligible') { clear('stale'); return; }
    var next = result.snapshot;
    if (result.status === 'pending' || !next || !data.isCurrent(next)) {
      // A superseded read or temporary restore has no authority to show the
      // fallback card. Retry even when no further application event arrives.
      if (!prepare()) return;
      if (result.reason === 'measurement-edit') { showPending(true); return; }
      awaitingEdit = false;
      showPending();
      timer = w.setTimeout(refresh, 150);
      return;
    }
    awaitingEdit = false;
    stopPending();
    if (snapshot && snapshot.patientToken !== next.patientToken) discardView('patient-change');
    try {
      var nextKey = JSON.stringify(next);
      snapshot = next;
      if (!view) createView();
      slot('ready');
      if (notice) notice.hidden = true;
      if (retryButton) retryButton.hidden = true;
      view.element.hidden = false;
      if (rendered && nextKey === renderKey) { inlineSize(); return; }
      rendered = w.VildaCentileLiveRender.render(next);
      if (!data.isCurrent(next)) { discardView('stale'); schedule(); return; }
      status = rendered && rendered.status || 'ready';
      view.update(rendered, next);
      renderKey = nextKey;
    } catch (_) {
      showError('Nie udało się wyświetlić siatki. Spróbuj ponownie.');
      return;
    }
    inlineSize();
  }

  function schedule(event) {
    // Cancel old promises immediately, before the debounced replacement starts.
    request += 1;
    if (event && event.reason === 'measurement-commit') awaitingEdit = false;
    if (event && event.identityChanged) {
      stopPending();
      discardView(event.reason === 'lock' ? 'lock' : 'patient-change');
    } else if (snapshot && !data.isCurrent(snapshot)) discardView('stale');
    w.clearTimeout(timer);
    timer = 0;
    if (!started || !prepare()) return;
    timer = w.setTimeout(refresh, event && event.identityChanged ? 0 : 100);
  }

  function retry() {
    if (typeof data.retry === 'function') data.retry();
    return refresh();
  }

  function start() {
    if (started || !data || !w.VildaCentileLiveView || !w.VildaCentileLiveRender) return;
    form = d.getElementById('calcForm');
    fieldset = d.querySelector('#userSection fieldset.user-card');
    doctor = d.getElementById('doctorSection');
    mount = d.getElementById('vildaCentileLiveMount');
    if (!form || !fieldset || !doctor || !mount) return;
    started = true;
    notice = d.getElementById('vildaCentileLiveLoading');
    noticeMessage = d.getElementById('vildaCentileLiveLoadingMessage');
    retryButton = d.getElementById('vildaCentileLiveRetry');
    w.clearTimeout(w.__vildaCentileLiveBootTimer);
    if (retryButton) {
      retryButton.textContent = 'Spróbuj ponownie';
      retryButton.addEventListener('click', retry);
    }
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
    refresh: refresh, retry: retry,
    getState: function () {
      return Object.assign({ eligible: !!snapshot, status: status, slotStatus: slotStatus,
        patientId: snapshot ? snapshot.patientId : null,
        source: rendered ? rendered.source : null, fullscreen: !!fullscreen },
      view ? view.getState() : {});
    }
  });
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})(typeof window !== 'undefined' ? window : undefined);
