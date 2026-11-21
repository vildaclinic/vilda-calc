/* Selected-patient lifetime for the opt-in home Reminder presentation.
 * Native AuthUI owns readers, dates, categories, actions, forms and writes.
 * This module moves only the original host and supplies an immutable owner.
 */
(function (w) {
  'use strict';
  if (!w || w.__VILDA_HOME_WORKSPACE_PREVIEW__ !== true || w.VildaHomeRemindersRuntime) return;
  var d = w.document, started = false, suspended = false, host = null, origin = null;
  var originalMarker = null, originalHidden = false, registration = null, active = null, generation = 0;
  var frame = 0, timer = null, readRequested = true, listeners = [], frameObserver = null;
  var subscribed = new WeakSet();
  var overviewSlot = null, parking = null;

  function byId(id) { return d.getElementById(id); }
  function value(id) { var node = byId(id); return node ? node.value : ''; }
  function patientId() {
    try { return w.sessionStorage.getItem('vildaCurrentPatientId') || null; }
    catch (_) { return null; }
  }
  function pageCurrent() {
    try { return !suspended && (!w.frameElement || w.frameElement.isConnected && !w.frameElement.hidden); }
    catch (_) { return false; }
  }
  function ownerSnapshot(verifiedSave) {
    try {
      var vault = w.VildaVault, importer = w.VildaDataImportExport, panel = w.VildaPanelPacjent;
      var id = patientId(), user = vault && vault.getCurrentUser();
      if (!pageCurrent() || !id || !user || !vault.isUnlocked() || !w.VildaAuthUI?.isBootReady()
        || !w.VildaProAccess?.hasAccess() || !importer || typeof importer.getApplyLoadedDataSequence !== 'function'
        || !panel || panel.nieaktualny() || panel.wlasciciel() !== id
        || w.__vildaPersistRestoring || w.__vildaLustroWpis || w.__vildaSuspendIntakeUserReset
        || importer.isMainSessionRestorePending() || (!verifiedSave && w.VildaDobAge?.restorePending?.())
        || w.VildaPersistence?.isClearInProgress?.() || Number(w.__vildaPersistClearUntil || 0) > Date.now()) return null;
      var measured = w.VildaDobAge?.readMeasuredAtISO();
      var encounter = integrated() && w.VildaHomeEncounter?.state(id);
      if (encounter && encounter.busy) return null;
      var binding = encounter && (encounter.mode === 'new' || encounter.mode === 'edit')
        && encounter.visitId && encounter.date ? Object.freeze({ mode: encounter.mode, visitId: encounter.visitId, date: encounter.date }) : null;
      return { account: user.userId, patientId: id, encounter: binding, load: importer.getApplyLoadedDataSequence(),
        identity: ['firstName', 'lastName', 'sex', 'dobInput'].map(value),
        visit: w.VildaVisitContext?.capture({ user: { measuredAtISO: measured } }, { patientId: id, readOnly: true }) || null };
    } catch (_) { return null; }
  }
  function current(view) {
    try {
      if (!started || !view || view !== active || view.generation !== generation || view.vault !== w.VildaVault
        || !host?.isConnected || (integrated() ? !ownsOverviewHost(host)
          : host.parentNode !== byId('vhomeMainCards'))) return false;
      view.vault.assertSyncOperationSession(view.token);
      return (!view.binding || view.binding.isCurrent()) && JSON.stringify(ownerSnapshot(view.savedDobPending === true)) === view.key;
    } catch (_) { return false; }
  }
  function disposeRegistration() {
    function dispose() {
      // Retire the closure before native cleanup can run a delayed callback.
      generation += 1;
      var previous = registration, oldView = active; registration = null; active = null; readRequested = true;
      if (host) host.hidden = true;
      if (oldView?.cancelDobWait) oldView.cancelDobWait();
      if (oldView?.note) { oldView.note.destroy(); oldView.note = null; }
      if (previous && host && typeof previous.api.disposeHomeReminders === 'function') {
        previous.api.disposeHomeReminders(host, previous.options);
      }
      if (oldView?.dialogs) oldView.dialogs.forEach(function (release) { release(); });
    }
    // Child, parent and note entries retire through the same origin history
    // coordinator in one batch, without competing browser traversals.
    if (w.VildaHomeDialogHistory?.batch) w.VildaHomeDialogHistory.batch(dispose);
    else dispose();
  }
  function invalidated() { disposeRegistration(); schedule(); }
  function requestRead() { readRequested = true; schedule(); }
  function listen(target, name, handler) {
    target.addEventListener(name, handler);
    listeners.push(function () { target.removeEventListener(name, handler); });
  }
  function subscribe(vault) {
    if (!vault || subscribed.has(vault)) return;
    subscribed.add(vault);
    if (typeof vault.onLock === 'function') vault.onLock(function () {
      if (started && w.VildaVault === vault) invalidated();
    });
    if (typeof vault.onUnlock === 'function') vault.onUnlock(function () {
      if (started && w.VildaVault === vault) requestRead();
    });
    ['onPatientSaved', 'onPatientNoteChanged', 'onPatientDeleted'].forEach(function (name) {
      if (typeof vault[name] !== 'function') return;
      vault[name](function (event) {
        if (!started || w.VildaVault !== vault || event?.patientId && event.patientId !== patientId()) return;
        if (name === 'onPatientDeleted') invalidated();
        else requestRead();
      });
    });
  }
  function placeHost() {
    var grid = byId('vhomeMainCards'), diet = byId('vhomeDietCard');
    if (!grid || !host) return false;
    if (integrated()) {
      if (!parking) {
        parking = d.createElement('div');
        parking.hidden = true;
        grid.appendChild(parking);
      }
      var destination = validSlot(overviewSlot) ? overviewSlot : parking;
      if (host.parentNode !== destination) destination.appendChild(host);
      return true;
    }
    if (diet && diet.parentNode === grid) {
      if (diet.nextElementSibling !== host) diet.after(host);
    } else if (grid.lastElementChild !== host) grid.appendChild(host);
    return host.parentNode === grid;
  }
  function integrated() { return w.__VILDA_HOME_GABINET_PREVIEW__ === true; }
  function validSlot(slot) {
    var overview = byId('vhomePatientOverview');
    return !!(slot && overview && overview.contains(slot) && slot === byId('vhomePatientRemindersSlot')
      && slot.dataset.homePatientId && slot.dataset.homePatientId === patientId());
  }
  function ownsOverviewHost(candidate) {
    return !!(integrated() && host && host === candidate && candidate === byId('remindersInline')
      && validSlot(overviewSlot) && host.parentNode === overviewSlot);
  }
  function mountOverview(slot, id) {
    if (!integrated() || !validSlot(slot) || slot.dataset.homePatientId !== id) return false;
    if (overviewSlot !== slot) {
      disposeRegistration();
      overviewSlot = slot;
    }
    if (!started) start(); else refresh();
    return ownsOverviewHost(host);
  }
  function unmountOverview(slot) {
    if (!slot || overviewSlot !== slot) return;
    disposeRegistration();
    overviewSlot = null;
    if (started) refresh();
  }
  function openPatient(view, id, noteId) {
    if (!current(view) || id !== view.owner.patientId || typeof w.VildaAuthUI?.showPatientCard !== 'function') return false;
    if (integrated()) {
      if (noteId && w.VildaHomePatient?.focusInlineNote?.(noteId)) return true;
      if (!noteId && w.VildaHomeGabinet?.openOverview?.()) return true;
    }
    return w.VildaAuthUI.showPatientCard(id, null,
      { homePatientPresentation: true, homePatientOpenerId: 'vhomePatientExpand' },
      { activeTab: noteId ? 'notes' : 'antro', focusNoteId: noteId || null });
  }
  function openNote(view, request) {
    if (!current(view) || !request || request.patientId !== view.owner.patientId
      || request.note && request.note.patientId !== view.owner.patientId || !w.VildaHomePatientNoteHost?.open) return false;
    var caller = request, options = Object.assign({}, request, {
      isCurrent: function () {
        return current(view) && (typeof caller.isCurrent !== 'function' || caller.isCurrent() === true);
      }, historyGroup: view,
      opener: byId('remindersInline')?.querySelector('.vild-rem-all') || d.activeElement,
      openPlan: function (destination) {
        if (!current(view)) return;
        if (typeof caller.openPlan === 'function') return caller.openPlan(destination);
        return w.VildaHomePatient?.open?.('care', destination);
      },
      onSaved: function () {
        view.note = null; if (!current(view)) return;
        requestRead(); w.VildaHomePatient?.refresh?.();
        if (typeof caller.onSaved === 'function') caller.onSaved();
      },
      onCancel: function () {
        view.note = null; if (!current(view)) return;
        if (integrated()) w.VildaHomePatient?.refresh?.();
        if (typeof caller.onCancel === 'function') caller.onCancel();
      }
    });
    var editor = w.VildaHomePatientNoteHost.open(options);
    if (editor) view.note = editor;
    return editor;
  }
  function onDialog(view, target) {
    if (!current(view) || !target || !w.VildaHomeDialogHistory?.watchNativeDialog) return null;
    var released = false, cleanup = w.VildaHomeDialogHistory.watchNativeDialog(target, { group: view });
    function release() {
      if (released) return;
      released = true; target.removeEventListener('close', release);
      cleanup(); view.dialogs.delete(release);
      if (integrated() && !view.dialogs.size && current(view)) w.VildaHomePatient?.refresh?.();
    }
    // The shared coordinator dispatches the native cancel event on Back.
    // It respects each actor's dirty/busy refusal and never calls .close().
    target.addEventListener('close', release); view.dialogs.add(release);
    return release;
  }
  function waitForRecordedDate(view) {
    if (!view.savedDobPending || !w.VildaDobAge.restorePending()) return Promise.resolve(true);
    return new Promise(function (resolve) {
      // Saving the first snapshot triggers the native DOB reader. Keep the
      // originating editor until its verified own record has been restored.
      function finish(ready) {
        d.removeEventListener('vilda:dob-restored', restored);
        w.clearTimeout(timer); view.cancelDobWait = null; resolve(ready);
      }
      function restored() { if (!w.VildaDobAge.restorePending()) finish(true); }
      var timer = w.setTimeout(function () { finish(false); }, 8000);
      view.cancelDobWait = function () { finish(false); };
      d.addEventListener('vilda:dob-restored', restored);
      restored();
    });
  }
  function register(owner) {
    var api = w.VildaAuthUI, view = null;
    if (owner) {
      try {
        var binding = owner.encounter ? w.VildaHomeEncounter.captureBinding(owner.patientId) : null;
        view = { owner: owner, binding: binding, key: JSON.stringify(owner), vault: w.VildaVault,
          token: w.VildaVault.captureSyncOperationSession(), generation: generation, note: null, dialogs: new Set() };
      } catch (_) { view = null; }
    }
    if (owner?.encounter && !view?.binding) view = null;
    active = view;
    var options = Object.freeze({ homePresentation: true, patientId: view ? owner.patientId : null,
      encounter: view ? owner.encounter : null,
      visitContext: view?.binding?.visitContext || null,
      ensureRecorded: async function () {
        if (!view?.binding || !current(view)) return false;
        const recorded = await view.binding.ensureRecorded();
        var settled = recorded && current(view) && await waitForRecordedDate(view);
        view.savedDobPending = false;
        return settled && current(view);
      },
      contextLabel: view ? [value('firstName'), value('lastName')].filter(Boolean).join(' ') || value('name') || 'Wybrany pacjent' : '',
      showPatientName: false, isCurrent: function () { return !!view && current(view); },
      openPatient: function (id, noteId) { return openPatient(view, id, noteId); },
      openNote: function (request) { return openNote(view, request); },
      onDialog: function (target) { return onDialog(view, target); } });
    registration = { api: api, options: options };
    // An explicit null patient is an inactive scoped registration. Native
    // automatic refreshes must not fall back to the account-wide card.
    readRequested = true;
  }
  function refresh() {
    frame = 0; if (!started) return;
    subscribe(w.VildaVault);
    if (!placeHost()) { disposeRegistration(); return; }
    var owner = !integrated() || ownsOverviewHost(host) ? ownerSnapshot() : null;
    if (registration && (registration.api !== w.VildaAuthUI || active && !current(active))) disposeRegistration();
    if (!registration || !active && owner) register(owner);
    host.hidden = !active;
    var grid = byId('vhomeMainCards'), heading = byId('vhomeAnalysisHeading');
    if (grid && heading) heading.hidden = grid.hidden = Array.from(grid.children).every(function (node) { return node.hidden; });
    if (active?.savedDobPending && w.VildaDobAge?.restorePending?.()) return;
    if (readRequested && registration) {
      readRequested = false;
      // Native read failures keep their original visible retry UI. This
      // adapter neither repeats a read nor interprets an empty/error result.
      registration.api.renderRemindersInline(host, registration.options);
    }
  }
  function schedule() { if (started && !frame) frame = w.requestAnimationFrame(refresh); }
  function checkOwner() {
    if (!started) return;
    subscribe(w.VildaVault);
    if (active && !current(active)) invalidated();
    else if (!active && (!integrated() || validSlot(overviewSlot)) && ownerSnapshot()) schedule();
  }
  function start() {
    if (started || !w.VildaHomeWorkspace || !w.VildaHomeRemindersPresentation || !byId('vhomeMainCards')
      || !byId('remindersInline') || typeof w.VildaAuthUI?.renderRemindersInline !== 'function'
      || typeof w.VildaAuthUI?.disposeHomeReminders !== 'function') return;
    host = byId('remindersInline'); origin = d.createComment('Original Reminder host position'); host.before(origin);
    originalMarker = host.getAttribute('data-home-reminders-presentation'); originalHidden = host.hidden; host.hidden = true;
    host.setAttribute('data-home-reminders-presentation', 'true');
    started = true; suspended = false; placeHost();
    ['vilda:user-state-cleared', 'vilda:data-applied', 'vilda:patient-loaded', 'vilda:auth-loaded', 'vilda:session-changed']
      .forEach(function (name) { listen(d, name, function (event) {
        if (name === 'vilda:patient-loaded' && integrated() && active?.binding?.isCurrent()
          && w.VildaHomePatient?.ownsSavePublication?.(event, active.owner.patientId)) {
          active.savedDobPending = !!w.VildaDobAge?.restorePending?.();
          requestRead(); return;
        }
        invalidated();
      }); });
    if (integrated()) {
      listen(d, 'vilda:home-encounter-changed', checkOwner);
      listen(d, 'vilda:dob-restored', function () {
        if (active && !w.VildaDobAge?.restorePending?.()) { active.savedDobPending = false; requestRead(); }
      });
    }
    listen(w, 'vilda:user-state-cleared', invalidated);
    ['vilda:auth-boot-settled', 'vilda:auth-hidden', 'vilda:main-session-restored', 'vilda:initial-main-session-restore-settled',
      'vilda:state-restored', 'vildaProAccessChanged', 'vilda:sync-merged'].forEach(function (name) { listen(d, name, requestRead); });
    ['input', 'change'].forEach(function (name) { listen(d, name, function () { checkOwner(); schedule(); }); });
    listen(w, 'pagehide', function () { suspended = true; disposeRegistration(); });
    listen(w, 'pageshow', function () { suspended = false; requestRead(); });
    var ownedFrame;
    try { ownedFrame = w.frameElement; } catch (_) { ownedFrame = null; }
    if (ownedFrame && typeof w.MutationObserver === 'function') {
      frameObserver = new w.MutationObserver(function () { checkOwner(); schedule(); });
      frameObserver.observe(ownedFrame, { attributes: true, attributeFilter: ['hidden'] });
    }
    // No native generic account/patient-context subscription exists. This
    // read-only owner check also catches direct same-tab session changes.
    timer = w.setInterval(checkOwner, 250);
    refresh();
  }
  function destroy() {
    if (!started) return;
    disposeRegistration(); started = false;
    if (frame) w.cancelAnimationFrame(frame); frame = 0;
    if (timer) w.clearInterval(timer); timer = null;
    if (frameObserver) frameObserver.disconnect(); frameObserver = null;
    listeners.splice(0).forEach(function (remove) { remove(); });
    if (host) {
      if (originalMarker == null) host.removeAttribute('data-home-reminders-presentation');
      else host.setAttribute('data-home-reminders-presentation', originalMarker);
      host.hidden = originalHidden;
      if (origin?.parentNode) origin.parentNode.insertBefore(host, origin);
    }
    if (parking) parking.remove(); parking = null; overviewSlot = null;
    if (origin) origin.remove(); origin = null; host = null;
  }
  w.VildaHomeRemindersRuntime = Object.freeze({ start: start, refresh: requestRead, destroy: destroy,
    mountOverview: mountOverview, unmountOverview: unmountOverview, ownsOverviewHost: ownsOverviewHost,
    overviewIsEditing: function () { return integrated() && current(active) && !!(active.note || active.dialogs.size); } });
  d.addEventListener('vilda:home-workspace-ready', start);
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})(typeof window !== 'undefined' ? window : null);
