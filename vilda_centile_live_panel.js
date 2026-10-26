/* Inline centile preview: layout and lifecycle only. The data adapter owns the
 * patient boundary; the renderer reuses the export models without changing them.
 */
(function (w) {
  'use strict';
  if (!w || w.VildaCentileLivePanel) return;
  var d = w.document;
  var mount, form, fieldset, doctor, view, snapshot, rendered, fullscreen;
  var request = 0, timer = 0, pendingTimer = 0, layoutFrame = 0, started = false;
  var boundsFrame = 0, boundsOwner = null, expansion = null, expansionRead = null, resumedExpansion = null;
  var scheduleFrame = 0, scheduledIdentity = false, scheduledReady = false;
  var notice, noticeTitle, noticeMessage, retryButton, slotStatus = 'ineligible', awaitingEdit = false;
  var noticeTimer = 0, noticeSince = null, retryExpansion = false;
  var status = 'hidden', lastWidth = 0, collapsedHeight = 0, lastHeight = 0, renderKey = '', fullKey = '';
  var data = w.VildaCentileLiveData;

  function presentation() {
    return w.VildaSummaryTabs ? w.VildaSummaryTabs.getState() : { mode: 'dedicated', selected: 'chart' };
  }

  function summaryMode() { return presentation().mode === 'summary'; }
  function dataOptions() { return summaryMode() ? { mode: 'summary' } : undefined; }
  function displayable() {
    return summaryMode() ? presentation().selected === 'chart' && form && !!form.getClientRects().length : twoColumns();
  }

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
    var dedicated = !summaryMode();
    d.documentElement.classList.toggle('vilda-centile-live-booting', false);
    d.documentElement.classList.toggle('vilda-centile-live-reserved', reserved && dedicated);
    d.documentElement.classList.toggle('vilda-centile-live-active', !!view && reserved);
    if (mount) {
      mount.hidden = !reserved;
      mount.setAttribute('data-centile-live-state', state);
      mount.setAttribute('aria-busy', state === 'pending' ? 'true' : 'false');
      var summaryPanel = d.getElementById('vildaSummaryChartPanel');
      if (summaryPanel) summaryPanel.setAttribute('data-chart-state', state);
    }
    if (!reserved && wasReserved && typeof w.__vildaRemindersResync === 'function') {
      w.__vildaRemindersResync();
    }
  }

  function stopPending() {
    w.clearTimeout(pendingTimer);
    pendingTimer = 0;
  }

  function noticeText(message) {
    if (noticeTitle) noticeTitle.hidden = !message;
    if (noticeMessage) {
      if (noticeMessage.textContent !== message) noticeMessage.textContent = message;
      noticeMessage.hidden = !message;
    }
  }

  function stopNoticeDelay() {
    w.clearTimeout(noticeTimer);
    noticeTimer = 0;
    noticeSince = null;
    w.__vildaCentileLivePendingSince = null;
  }

  function pendingNotice() {
    if (view || awaitingEdit) {
      stopNoticeDelay();
      noticeText(awaitingEdit ? 'Siatka pojawi się po zakończeniu edycji pola.' : '');
      return;
    }
    if (noticeSince === null) {
      var bootSince = Number(w.__vildaCentileLivePendingSince);
      noticeSince = Number.isFinite(bootSince) && bootSince > 0 ? bootSince : Date.now();
    }
    var remaining = 1200 - Math.max(0, Date.now() - noticeSince);
    if (remaining <= 0) {
      noticeText('Wczytywanie siatki…');
      return;
    }
    noticeText('');
    if (!noticeTimer) noticeTimer = w.setTimeout(function () {
      noticeTimer = 0;
      if (slotStatus === 'pending' && !view && !awaitingEdit) noticeText('Wczytywanie siatki…');
    }, remaining);
  }

  function stopRefresh() {
    w.clearTimeout(timer);
    timer = 0;
    if (scheduleFrame) w.cancelAnimationFrame(scheduleFrame);
    scheduleFrame = 0;
    scheduledIdentity = false;
    scheduledReady = false;
  }

  function expandState(target, state) {
    if (!target || !target.expandButton) return;
    var label = state === 'pending' ? 'Przygotowywanie pełnego ekranu…'
      : state === 'error' ? 'Nie udało się powiększyć siatki. Kliknij, aby spróbować ponownie.'
        : 'Powiększ siatkę na pełny ekran';
    target.expandButton.setAttribute('aria-busy', state === 'pending' ? 'true' : 'false');
    target.expandButton.setAttribute('aria-label', label);
    target.expandButton.title = label;
  }

  function cancelExpansionRead() {
    if (expansionRead) expandState(expansionRead.view);
    expansionRead = null;
  }

  function cancelExpansion() {
    if (boundsFrame) w.cancelAnimationFrame(boundsFrame);
    boundsFrame = 0;
    if (expansion) expandState(expansion.view);
    expansion = null;
  }

  function stopBounds() {
    cancelExpansion();
    if (boundsFrame) w.cancelAnimationFrame(boundsFrame);
    boundsFrame = 0;
    var old = boundsOwner;
    boundsOwner = null;
    if (old && old.job) old.job.cancel();
  }

  function cancelResumedExpansion() {
    if (resumedExpansion) expandState(resumedExpansion.view);
    resumedExpansion = null;
  }

  function suspendExpansion(includeRead) {
    var intent = expansion || includeRead && expansionRead;
    if (intent && snapshot) {
      resumedExpansion = { view: intent.view, token: snapshot.patientToken, key: intent.key };
    }
    if (includeRead) cancelExpansionRead();
    stopBounds();
    if (resumedExpansion) expandState(resumedExpansion.view, 'pending');
  }

  function resumeExpansion() {
    var intent = resumedExpansion;
    cancelResumedExpansion();
    // A background read may confirm the very same committed snapshot. Keep
    // that explicit click, but never open its old drawing after a value/source
    // change. The queued blur path accepts the snapshot it was waiting for.
    if (intent && view === intent.view && snapshot && snapshot.patientToken === intent.token
      && (intent.key === undefined || intent.key === renderKey)) expand();
  }

  function hideRetry() {
    retryExpansion = false;
    if (!retryButton) return;
    retryButton.hidden = true;
    retryButton.textContent = 'Spróbuj ponownie';
  }

  function showBoundsError(message) {
    // A failed crop must not erase a still-current complete inline/fullscreen
    // drawing. Make the stale refresh explicit and offer the existing retry.
    status = 'unavailable';
    retryExpansion = !fullscreen;
    renderKey = '';
    if (retryButton && view) {
      retryButton.textContent = message;
      view.element.appendChild(retryButton);
      retryButton.hidden = false;
    }
    slot('error');
  }

  function currentBounds(owner) {
    return boundsOwner === owner && view === owner.view && data.isCurrent(owner.snapshot)
      && (owner.revision === undefined || owner.revision === request);
  }

  function prepareBounds(owner, priority) {
    if (!owner || !currentBounds(owner)) return null;
    if (boundsFrame) w.cancelAnimationFrame(boundsFrame);
    boundsFrame = 0;
    if (!owner.job || owner.result && owner.result.status === 'error') {
      owner.result = null;
      try {
        owner.job = w.VildaCentileLiveRender.prepareContentBounds(owner.rendered, {
          isCurrent: function () { return currentBounds(owner); }
        });
      } catch (_) {
        owner.job = { promise: Promise.resolve({ status: 'error' }), cancel: function () {}, prioritize: function () {} };
      }
      owner.job.promise.then(function (result) {
        if (currentBounds(owner)) owner.result = result;
      });
    }
    if (priority) owner.job.prioritize();
    return owner.job;
  }

  function discardView(reason) {
    cancelResumedExpansion();
    cancelExpansionRead();
    stopBounds();
    awaitingEdit = false;
    snapshot = null;
    rendered = null;
    renderKey = '';
    fullKey = '';
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
    stopRefresh();
    stopPending();
    stopNoticeDelay();
    noticeText('');
    if (layoutFrame) w.cancelAnimationFrame(layoutFrame);
    layoutFrame = 0;
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
    cancelResumedExpansion();
    cancelExpansionRead();
    retryExpansion = false;
    stopBounds();
    awaitingEdit = false;
    stopPending();
    stopNoticeDelay();
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
      noticeText(message);
    }
    if (retryButton) { retryButton.textContent = 'Spróbuj ponownie'; retryButton.hidden = false; }
    slot('error');
    scheduleLayout();
  }

  function showPending(waitForEdit) {
    awaitingEdit = !!waitForEdit;
    if (view && snapshot && !data.isCurrent(snapshot)) discardView('stale');
    if (!view) status = 'pending';
    if (notice) notice.hidden = !!view;
    if (retryButton) retryButton.hidden = true;
    slot('pending');
    pendingNotice();
    // A lost completion event or a hung read must become a recoverable error,
    // never an endless placeholder or a time-based return to Reminders.
    if (awaitingEdit) stopPending();
    else if (!pendingTimer) pendingTimer = w.setTimeout(function () {
      pendingTimer = 0;
      request += 1;
      stopRefresh();
      if (!displayable() || eligibility().status === 'ineligible') { clear('stale'); return; }
      showError('Wczytywanie siatki trwa zbyt długo. Spróbuj ponownie.');
    }, 10000);
    scheduleLayout();
  }

  function eligibility() {
    return typeof data.getEligibility === 'function' ? data.getEligibility(dataOptions()) : { status: 'eligible' };
  }

  function prepare() {
    if (!displayable()) { clear('stale'); return false; }
    var state = eligibility();
    if (state.status === 'ineligible') { clear('stale'); return false; }
    var firstReservation = slotStatus === 'ineligible';
    if (snapshot && !data.isCurrent(snapshot)) discardView('stale');
    if (state.status === 'error') {
      showError('Nie udało się wczytać siatki. Spróbuj ponownie.');
      if (firstReservation) inlineSize();
      return false;
    }
    showPending(awaitingEdit);
    // A newly reserved slot needs its final height before this paint (startup,
    // new patient or return to two columns). Later updates keep that height and
    // share the layout queue rather than measuring during each field write.
    if (firstReservation) inlineSize();
    return true;
  }

  function applyInlineHeight(height) {
    if (height !== lastHeight) {
      mount.style.setProperty('--vilda-centile-live-inline-height', height + 'px');
      lastHeight = height;
    }
    if (view) view.fit();
  }

  function inlineSize() {
    if (!mount || mount.hidden || !displayable()) return;
    if (summaryMode() && !twoColumns()) {
      var mobileHeight = Math.max(420, Math.min(620, Math.round((w.innerHeight || 720) * 0.72)));
      applyInlineHeight(mobileHeight);
      return;
    }
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
    var trailing = 0;
    if (summaryMode()) {
      var card = d.getElementById('currentSummaryCard');
      if (card) {
        var cardStyle = w.getComputedStyle(card);
        trailing = (parseFloat(cardStyle.paddingBottom) || 0) + (parseFloat(cardStyle.borderBottomWidth) || 0);
      }
    }
    var height = Math.max(280, Math.round(collapsedHeight - offset - trailing));
    applyInlineHeight(height);
  }

  function layout() {
    layoutFrame = 0;
    if (!displayable()) {
      if (slotStatus !== 'ineligible') clear('stale');
      return;
    }
    if (snapshot && !data.isCurrent(snapshot)) { discardView('stale'); schedule(); return; }
    if (slotStatus === 'ineligible') {
      // We are already in the layout frame: reserve the neutral card before
      // this paint when returning from a single-column/hidden form.
      if (prepare()) schedule();
      return;
    }
    inlineSize();
  }

  function scheduleLayout() {
    if (!layoutFrame) layoutFrame = w.requestAnimationFrame(layout);
  }

  function openFullscreen(currentView, currentSnapshot, owner) {
    if (view !== currentView || fullscreen || !currentBounds(owner) || !displayable()) return;
    var host = w.VildaCentileLiveHost;
    if (!host) return;
    var closedDuringOpen = false;
    var handle = host.open({
      sourceWindow: w, element: currentView.element,
      opener: currentView.expandButton, patientToken: currentSnapshot.patientToken,
      // The host checks patient ownership; request revisions protect drawing
      // work while a new measurement/source is awaiting its committed snapshot.
      isCurrent: function (token) { return view === currentView && data.isCurrent(token); },
      onMount: function () {
        currentView.setFullscreen(true);
        currentView.update(owner.rendered, currentSnapshot);
        fullKey = owner.key;
        currentView.fit();
      },
      onRestore: function (result) {
        // Restore SVG while the host still hides the card. A full refresh may
        // be cropping at this instant; it must never publish a raster inline.
        fullscreen = null;
        fullKey = '';
        stopBounds();
        currentView.setFullscreen(false);
        if (result.current && view === currentView && snapshot && data.isCurrent(snapshot)) {
          currentView.update(rendered, snapshot);
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

  function expand() {
    if (!view || !snapshot || fullscreen || expansion || expansionRead || resumedExpansion
      || !data.isCurrent(snapshot) || !displayable() || !w.VildaCentileLiveHost) return;
    if (scheduleFrame || timer || slotStatus === 'pending') {
      // Clicking Expand also blurs an edited measurement. Accept that commit
      // first, rather than opening the last value while its refresh is queued.
      var waiting = { view: view, token: snapshot.patientToken };
      expansionRead = waiting;
      expandState(waiting.view, 'pending');
      refresh().then(function () {
        if (expansionRead !== waiting) return;
        cancelExpansionRead();
        if (view === waiting.view && snapshot && snapshot.patientToken === waiting.token
          && slotStatus === 'ready') expand();
      });
      return;
    }
    if (!rendered || rendered.status !== 'ready') return;
    stopBounds();
    var intent = { view: view, snapshot: snapshot, revision: request, key: JSON.stringify(snapshot) };
    expansion = intent;
    expandState(intent.view, 'pending');
    function current() {
      return expansion === intent && view === intent.view && request === intent.revision
        && data.isCurrent(intent.snapshot) && displayable();
    }
    function failed() {
      if (!current()) return;
      cancelExpansion();
      expandState(intent.view, 'error');
      showBoundsError('Nie udało się przygotować pełnego ekranu. Spróbuj ponownie.');
    }
    // Give the busy button an actual paint before creating the large canvases.
    // No full rendering or pixel reads are scheduled by the inline preview.
    boundsFrame = w.requestAnimationFrame(function () {
      boundsFrame = 0;
      if (!current()) { cancelExpansion(); return; }
      boundsFrame = w.requestAnimationFrame(function () {
        boundsFrame = 0;
        if (!current()) { cancelExpansion(); return; }
        try {
          var renderer = w.VildaCentileLiveRender;
          var deferred = typeof renderer.prepareContentBounds === 'function';
          var full = renderer.render(intent.snapshot, { deferContentBounds: deferred });
          if (!current()) return;
          if (!full || full.status !== 'ready') { failed(); return; }
          var owner = { view: intent.view, snapshot: intent.snapshot, rendered: full,
            revision: intent.revision, key: intent.key, job: null, result: null };
          boundsOwner = owner;
          var job = deferred ? prepareBounds(owner, true) : { promise: Promise.resolve({ status: 'ready' }) };
          if (!job) { cancelExpansion(); return; }
          job.promise.then(function (result) {
            if (!current() || !currentBounds(owner)) return;
            if (result && result.status === 'ready') {
              cancelExpansion();
              status = rendered.status;
              slot('ready');
              hideRetry();
              openFullscreen(intent.view, intent.snapshot, owner);
            } else if (result && result.status === 'error') failed();
            else cancelExpansion();
          });
        } catch (_) { failed(); }
      });
    });
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
    suspendExpansion(false);
    stopRefresh();
    if (!prepare()) return;
    var revision = ++request;
    var result;
    try {
      if (typeof data.getResult === 'function') result = await data.getResult(dataOptions());
      else {
        // Compatibility for existing independent consumers of the controller.
        var legacy = await data.getSnapshot(dataOptions());
        var refreshState = typeof data.getRefreshState === 'function' ? data.getRefreshState(snapshot) : null;
        result = legacy ? { status: 'ready', snapshot: legacy }
          : { status: refreshState || 'ineligible' };
      }
    } catch (_) { result = { status: 'error' }; }
    if (revision !== request) return;
    if (!displayable()) { clear('stale'); return; }
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
    stopNoticeDelay();
    noticeText('');
    if (snapshot && snapshot.patientToken !== next.patientToken) discardView('patient-change');
    try {
      var nextKey = JSON.stringify(next);
      if (!snapshot) snapshot = next;
      if (!view) createView();
      if (rendered && nextKey === renderKey && (!fullscreen || fullKey === nextKey)) {
        snapshot = next;
        slot('ready');
        if (notice) notice.hidden = true;
        hideRetry();
        inlineSize();
        resumeExpansion();
        return;
      }
      stopBounds();
      var renderer = w.VildaCentileLiveRender;
      var nextRendered = renderer.preview(next);
      if (revision !== request || !data.isCurrent(next)) { discardView('stale'); schedule(); return; }
      snapshot = next;
      rendered = nextRendered;
      renderKey = nextKey;
      slot('ready');
      if (notice) notice.hidden = true;
      hideRetry();
      view.element.hidden = false;
      status = rendered && rendered.status || 'ready';
      if (!fullscreen || status !== 'ready') {
        view.update(rendered, next);
      } else {
        // Full images are produced only after expansion, including subsequent
        // committed edits while that full view remains open. Keep its previous
        // verified image until the replacement crop is complete.
        var deferredBounds = typeof renderer.prepareContentBounds === 'function';
        var fullRendered;
        try { fullRendered = renderer.render(next, { deferContentBounds: deferredBounds }); }
        catch (_) { showBoundsError('Nie udało się odświeżyć siatki. Spróbuj ponownie.'); return; }
        if (!fullRendered || fullRendered.status !== 'ready') {
          showBoundsError('Nie udało się odświeżyć siatki. Spróbuj ponownie.');
          return;
        }
        var owner = { view: view, snapshot: next, rendered: fullRendered,
          revision: revision, key: nextKey, job: null, result: null };
        boundsOwner = owner;
        var cropResult = deferredBounds ? await prepareBounds(owner, true).promise : { status: 'ready' };
        if (revision !== request || !currentBounds(owner) || !fullscreen) {
          if (boundsOwner === owner) stopBounds();
          return;
        }
        if (!cropResult || cropResult.status === 'cancelled') return;
        if (cropResult.status !== 'ready') {
          stopBounds();
          showBoundsError('Nie udało się odświeżyć siatki. Spróbuj ponownie.');
          return;
        }
        view.update(fullRendered, next);
        fullKey = nextKey;
      }
    } catch (_) {
      showError('Nie udało się wyświetlić siatki. Spróbuj ponownie.');
      return;
    }
    inlineSize();
    resumeExpansion();
  }

  function readySignal(event) {
    return event && ['startup-settled', 'vilda:dob-restored', 'vilda:auth-hidden', 'vilda:auth-state-settled',
      'vilda:auth-boot-settled', 'vilda:main-session-restored'].includes(event.reason);
  }

  function finishScheduledRefresh() {
    scheduleFrame = 0;
    var identityChanged = scheduledIdentity, ready = scheduledReady;
    scheduledIdentity = false;
    scheduledReady = false;
    if (!started || !prepare()) return;
    if (identityChanged) {
      stopRefresh();
      timer = w.setTimeout(refresh, 0);
      return;
    }
    if (ready && typeof data.getEligibility === 'function' && eligibility().status === 'eligible') {
      // This callback already runs at the next frame. Do not add another frame
      // of latency to the final startup/DOB/auth completion signal.
      refresh();
      return;
    }
    timer = w.setTimeout(refresh, 100);
  }

  function schedule(event) {
    // Cancel old promises immediately, before the debounced replacement starts.
    request += 1;
    suspendExpansion(true);
    if (event && event.reason === 'measurement-commit') awaitingEdit = false;
    var discarded = false;
    if (event && event.identityChanged) {
      stopRefresh();
      stopPending();
      discardView(event.reason === 'lock' ? 'lock' : 'patient-change');
      discarded = true;
    } else if (snapshot && !data.isCurrent(snapshot)) {
      discardView('stale');
      discarded = true;
    }
    w.clearTimeout(timer);
    timer = 0;
    if (!started) return;
    if (eligibility().status === 'ineligible') { clear('stale'); return; }
    // Reserve a first applicable slot synchronously: another frame callback
    // may paint Reminders before our queued refresh. Once reserved, geometry
    // waits until the restoration's input/change burst ends, while erasing a
    // previous patient's drawing remains synchronous.
    if (slotStatus === 'ineligible') {
      if (!prepare()) return;
    } else if (discarded) showPending(awaitingEdit);
    scheduledIdentity = scheduledIdentity || !!(event && event.identityChanged);
    scheduledReady = scheduledReady || !!readySignal(event);
    if (!scheduleFrame) scheduleFrame = w.requestAnimationFrame(finishScheduledRefresh);
  }

  function retry() {
    if (retryExpansion) return expand();
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
    noticeTitle = d.getElementById('vildaCentileLiveLoadingTitle');
    noticeMessage = d.getElementById('vildaCentileLiveLoadingMessage');
    retryButton = d.getElementById('vildaCentileLiveRetry');
    w.clearTimeout(w.__vildaCentileLiveBootTimer);
    w.clearTimeout(w.__vildaCentileLiveMessageTimer);
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
    d.addEventListener('vilda:summary-chart-state', function () {
      // Switching owner/presentation clears any pending fullscreen request
      // synchronously. Merely selecting Summary performs no chart work.
      clear('presentation-change');
      if (displayable()) refresh();
    });
    w.addEventListener('resize', scheduleLayout);
    w.addEventListener('pageshow', schedule);
    w.addEventListener('pagehide', function () { clear('pagehide'); });
    d.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && (expansion || expansionRead || resumedExpansion)) {
        event.preventDefault();
        cancelResumedExpansion();
        cancelExpansionRead();
        stopBounds();
      }
    });
    refresh();
  }

  w.VildaCentileLivePanel = Object.freeze({
    refresh: refresh, retry: retry,
    getState: function () {
      return Object.assign({ eligible: !!snapshot, status: status, slotStatus: slotStatus,
        presentation: presentation().mode, selectedTab: presentation().selected,
        patientId: snapshot ? snapshot.patientId : null,
        source: rendered ? rendered.source : null, fullscreen: !!fullscreen, preparingFullscreen: !!(expansion || expansionRead || resumedExpansion) },
      view ? view.getState() : {});
    }
  });
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})(typeof window !== 'undefined' ? window : undefined);
