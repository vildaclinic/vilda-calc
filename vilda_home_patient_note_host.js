/* Native note presentation for the opt-in home workspace.
 * Native AuthUI owns every note field, validation, conflict, dirty prompt and
 * writer. This module owns only the shared dialog and its patient's lifetime.
 * Requires the optional readable ga() notePresentation bridge accompanying it.
 */
(function (w) {
  'use strict';
  if (!w || w.__VILDA_HOME_WORKSPACE_PREVIEW__ !== true || w.VildaHomePatientNoteHost) return;
  var d = w.document, dialog = null, active = null;
  var boundVaults = new WeakSet();
  var lifetimeEvents = ['vilda:user-state-cleared', 'vilda:patient-loaded', 'vilda:auth-loaded'];

  function element(tag, className, text) {
    var node = d.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  function selectedPatientId() {
    try { return w.sessionStorage.getItem('vildaCurrentPatientId') || null; }
    catch (_) { return null; }
  }
  function loadedSequence() {
    var api = w.VildaDataImportExport;
    return api && typeof api.getApplyLoadedDataSequence === 'function' ? api.getApplyLoadedDataSequence() : null;
  }
  function actorCurrent(view) {
    try {
      if (!view || w.VildaVault !== view.vault || !view.vault.isUnlocked()) return false;
      var user = view.vault.getCurrentUser();
      if (!user || user.userId !== view.userId || selectedPatientId() !== view.patientId) return false;
      if (loadedSequence() !== view.loadedSequence) return false;
      if (view.token != null) view.vault.assertSyncOperationSession(view.token);
      if (w.VildaPanelPacjent && (w.VildaPanelPacjent.nieaktualny()
        || typeof w.VildaPanelPacjent.wlasciciel === 'function' && w.VildaPanelPacjent.wlasciciel() !== view.patientId)) return false;
      if (w.VildaProAccess && !w.VildaProAccess.hasAccess()) return false;
      return !view.caller.isCurrent || view.caller.isCurrent() === true;
    } catch (_) { return false; }
  }
  function current(view) { return !!(view && !view.disposed && active === view && actorCurrent(view)); }
  function wipeRoot(root) {
    if (!root) return;
    var fields = root.querySelectorAll('input,textarea,select'), nodes = Array.from(root.querySelectorAll('*'));
    fields.forEach(function (field) { try { field.value = ''; } catch (_) { /* A readonly control may reject assignment. */ } });
    root.remove();
    // Static references let us clear descendants even after their parents are
    // detached. No input/change event or clinical persistence is dispatched.
    nodes.forEach(function (node) { node.textContent = ''; });
    root.textContent = '';
  }
  function notifyNativeParent(view) {
    var parent = view.originalParent;
    if (!parent) return;
    // The old native Qmo/fr observe ONLY direct children of this parent. A
    // conflict removes d deeper inside the shared dialog, so relay a harmless
    // real childList mutation before the asynchronous ga access reread starts.
    // Native cleanup then clears its own marker/listeners before the replacement
    // can register the same note id. No private callback is copied or invoked.
    var relay = d.createComment('native-note-lifecycle');
    parent.appendChild(relay); relay.remove();
  }
  function restoreFocus(view) {
    var opener = view.caller.opener;
    if (actorCurrent(view) && opener && opener.isConnected && typeof opener.focus === 'function') opener.focus({ preventScroll: true });
  }
  function finish(view, focus) {
    if (!view || view.disposed) return;
    view.disposed = true; view.awaiting = false;
    if (view.observer) view.observer.disconnect();
    if (view.history) view.history.release();
    if (view.root) wipeRoot(view.root);
    view.root = null; view.sheet = null; view.nativeCancel = null; view.closeButton = null;
    if (active === view) {
      active = null;
      // Removing this direct child of originalParent is intentional. The
      // unchanged native observers watch that parent with childList:true.
      if (dialog.open) dialog.close();
      dialog.remove();
      dialog.querySelector('.vhome-dialog-body').replaceChildren();
      dialog.classList.remove('vhome-note-native-ready');
      dialog.removeAttribute('aria-busy');
      dialog.setAttribute('aria-labelledby', 'vhomePatientNoteTitle');
    }
    // Never remove the presentation bridge's callback WeakMap entries here:
    // disposed isCurrent() must still refuse a delayed native conflict reopen.
    if (focus) restoreFocus(view);
  }
  function requestClose(view) {
    if (!view || view.disposed) return true;
    if (!current(view)) { finish(view, false); return true; }
    if (!view.root) { finish(view, true); return true; }
    var cancel = view.nativeCancel;
    if (!cancel || !cancel.isConnected || !view.root.contains(cancel) || cancel.disabled) return false;
    cancel.click();
    // A declined native dirty confirmation leaves the same connected root.
    return view.disposed || !view.root || !view.root.isConnected;
  }
  function ensureDialog() {
    if (dialog) return dialog;
    var workspace = w.VildaHomeWorkspace;
    if (!workspace || typeof workspace.createDialog !== 'function') return null;
    dialog = workspace.createDialog({ id: 'vhomePatientNoteDialog', titleId: 'vhomePatientNoteTitle',
      title: 'Notatka pacjenta', applyLabel: 'Zapisz',
      onClose: function () { if (active) requestClose(active); },
      onApply: function () { /* Hidden in native mode: only the native writer button is active. */ } });
    dialog.classList.add('vhome-note-host');
    var apply = dialog.querySelector('.vhome-dialog-apply'); apply.hidden = true;
    dialog.querySelector('.vhome-dialog-cancel').textContent = 'Zamknij';
    dialog.addEventListener('close', function () {
      // Covers a coordinator closing the native <dialog> directly. Ordinary
      // user closure must call controller.requestClose(), preserving dirtiness.
      if (active && active.shown && !dialog.open) finish(active, false);
    });
    return dialog;
  }
  function showDialog(view) {
    if (!current(view)) return false;
    if (!dialog.isConnected) d.body.appendChild(dialog);
    w.VildaHomeWorkspace.fitDialog(dialog);
    if (!dialog.open) dialog.showModal();
    view.shown = true;
    return true;
  }
  function pending(view) {
    if (!current(view)) return false;
    view.awaiting = true;
    // Keep a still-connected native dirty editor visible until its own opener
    // has asked whether to discard it. Detaching it here would bypass Qzap.
    if (view.root && view.root.isConnected) return true;
    if (view.root && !view.root.isConnected) {
      notifyNativeParent(view);
      wipeRoot(view.root); view.root = null; view.sheet = null; view.nativeCancel = null;
    }
    dialog.classList.remove('vhome-note-native-ready');
    dialog.setAttribute('aria-busy', 'true');
    dialog.setAttribute('aria-labelledby', 'vhomePatientNoteTitle');
    var body = dialog.querySelector('.vhome-dialog-body');
    body.replaceChildren(element('p', 'vhome-note-loading', 'Wczytywanie notatki…'));
    // Initial native construction determines dr()'s actual parent before the
    // modal enters the top layer. A conflict reload keeps its existing modal.
    if (dialog.open) return showDialog(view);
    w.VildaHomeWorkspace.fitDialog(dialog);
    return true;
  }
  function unavailable(view, reason) {
    if (!current(view)) return;
    view.awaiting = false;
    if (view.root && view.root.isConnected) return;
    if (reason === 'native-editor-kept') { finish(view, false); return; }
    if (view.root) { wipeRoot(view.root); view.root = null; }
    view.sheet = null; view.nativeCancel = null;
    dialog.classList.remove('vhome-note-native-ready'); dialog.removeAttribute('aria-busy');
    var message = reason === 'care-plan-handler-required'
      ? 'Dokument jest częścią planu opieki. Otwórz go w Planie opieki.'
      : 'Nie udało się otworzyć notatki. Spróbuj ponownie.';
    var body = dialog.querySelector('.vhome-dialog-body'), status = element('p', 'vhome-note-state', message);
    status.setAttribute('role', 'status'); body.replaceChildren(status);
    showDialog(view);
  }
  function syncNativeClose(view) {
    if (!view.closeButton) return;
    var cancel = view.nativeCancel;
    // Resurrection replaces the native footer controls. Its explicit native
    // decisions remain available; do not invoke the now-detached old Cancel.
    var disabled = !cancel || !cancel.isConnected || !view.root.contains(cancel) || cancel.disabled;
    if (view.closeButton.disabled !== disabled) view.closeButton.disabled = disabled;
  }
  function adopt(view, native) {
    if (!current(view)) return false;
    var root = native.root, sheet = native.sheet, originalParent = root && root.parentNode;
    if (!root || !sheet || !originalParent || !root.isConnected || !root.contains(sheet)) return false;
    if (native.patientId !== view.patientId) return false;
    // A replacement must retain the same native parent-observer target. Moving
    // an already-open modal to a different parent is deliberately unsupported.
    if (view.originalParent && view.originalParent !== originalParent) return false;
    var children = Array.from(sheet.children), title = children[0], actions = children[children.length - 1];
    if (!title || !/^H[1-6]$/.test(title.tagName) || !actions) return false;
    var actionButtons = Array.from(actions.children).filter(function (node) { return node.tagName === 'BUTTON'; });
    // These are source-backed positions: writable Oe=[Ce,la], readonly
    // .vilda-auth-sheet-actions=[optional openPlan,dismiss]. No text matching.
    var nativeCancel = native.kind === 'readonly' ? actionButtons[actionButtons.length - 1] : actionButtons[0];
    if (!nativeCancel || nativeCancel.type !== 'button') return false;
    if (native.kind !== 'readonly' && actionButtons.length !== 2) return false;
    var old = view.root;
    view.originalParent = originalParent; view.awaiting = false;
    // Preserve both native parent-observer targets, including a visible AuthUI
    // root chosen by dr(). The shared dialog becomes its direct child.
    if (dialog.parentNode !== originalParent) originalParent.appendChild(dialog);
    var body = dialog.querySelector('.vhome-dialog-body');
    body.replaceChildren(root);
    if (old && old !== root) wipeRoot(old);
    view.root = root; view.sheet = sheet; view.nativeCancel = nativeCancel;
    root.classList.add('vhome-note-native-root'); sheet.classList.add('vhome-note-native-sheet');
    // tr(d,c) sets a coarse-embedded inline !important max-height, which a
    // stylesheet cannot override. Remove this presentation property only.
    sheet.style.removeProperty('max-height');
    sheet.removeAttribute('role'); sheet.removeAttribute('aria-modal');
    if (!title.id) title.id = 'vhomePatientNativeNoteTitle';
    dialog.setAttribute('aria-labelledby', title.id); dialog.removeAttribute('aria-busy');
    var heading = element('div', 'vhome-note-native-heading');
    sheet.insertBefore(heading, title); heading.appendChild(title);
    var close = element('button', 'vhome-dialog-close vhome-note-native-close', '×');
    close.type = 'button'; close.setAttribute('aria-label', 'Zamknij notatkę pacjenta');
    close.addEventListener('click', function () { requestClose(view); }); heading.appendChild(close);
    actions.classList.add('vhome-note-native-actions'); view.closeButton = close;
    dialog.classList.add('vhome-note-native-ready');
    syncNativeClose(view);
    if (!showDialog(view)) return false;
    var first = native.kind === 'readonly' ? null : sheet.querySelector('textarea')
      || sheet.querySelector('input:not([type=radio]):not([type=checkbox]),select');
    if (first && typeof first.focus === 'function') first.focus({ preventScroll: true });
    else close.focus({ preventScroll: true });
    return true;
  }
  function observe(view) {
    if (typeof w.MutationObserver !== 'function') return;
    view.observer = new w.MutationObserver(function () {
      if (view.disposed) return;
      if (!current(view) || !dialog.isConnected) { finish(view, false); return; }
      if (view.root && !view.root.isConnected) {
        // ga() calls pending() synchronously before an async conflict reread.
        // Only the bridge adopts a verified replacement: never guess a root
        // from another editor merely because it appeared in document.body.
        if (!view.awaiting) { finish(view, false); return; }
      }
      if (view.root) syncNativeClose(view);
    });
    view.observer.observe(d.documentElement, { childList: true, subtree: true, attributes: true,
      attributeFilter: ['disabled'] });
  }
  function bindVault(vault) {
    if (boundVaults.has(vault)) return;
    boundVaults.add(vault);
    if (typeof vault.onLock === 'function') vault.onLock(function () {
      if (active && active.vault === vault) finish(active, false);
    });
  }
  function open(options) {
    options = options || {};
    if (active && !requestClose(active)) return false;
    var vault = w.VildaVault, user = vault && vault.getCurrentUser && vault.getCurrentUser();
    if (!options.patientId || !vault || !user || !vault.isUnlocked()
      || !w.VildaAuthUI || w.VildaAuthUI.notePresentationVersion !== 1
      || typeof w.VildaAuthUI.showPatientNoteEditor !== 'function' || !w.VildaHomeDialogHistory || !ensureDialog()) return false;
    var token = null;
    try { if (typeof vault.captureSyncOperationSession === 'function') token = vault.captureSyncOperationSession(); }
    catch (_) { return false; }
    var view = { vault: vault, userId: user.userId, patientId: options.patientId, token: token,
      loadedSequence: loadedSequence(), disposed: false, awaiting: false, shown: false, root: null, sheet: null,
      observer: null, originalParent: null, nativeCancel: null, closeButton: null, savedNotified: false, history: null,
      caller: { isCurrent: options.isCurrent, opener: options.opener || d.activeElement,
        onSaved: options.onSaved, onCancel: options.onCancel, openPlan: options.openPlan } };
    active = view;
    if (!current(view)) { finish(view, false); return false; }
    view.history = w.VildaHomeDialogHistory.create({ group: options.historyGroup || view,
      requestClose: function () { return requestClose(view); }, isOpen: function () { return !view.disposed; } });
    // Own one entry even while initial native access reads are pending. Back
    // cancels that pending lifetime; conflict reload reuses this same handle.
    view.history.enter();
    bindVault(vault); observe(view);
    var presentation = {
      patientId: view.patientId,
      isCurrent: function () { return current(view); },
      pending: function () { return pending(view); },
      adopt: function (native) { return adopt(view, native); },
      unavailable: function (reason) { unavailable(view, reason); },
      abort: function () { finish(view, false); },
      canOpenPlan: function () { return typeof view.caller.openPlan === 'function'; },
      openPlan: function (destination) {
        if (!current(view) || typeof view.caller.openPlan !== 'function') return;
        var handler = view.caller.openPlan; finish(view, false);
        if (actorCurrent(view)) handler(destination);
      }
    };
    function saved() {
      var notify = actorCurrent(view) && !view.savedNotified;
      view.savedNotified = true; finish(view, true);
      if (notify && typeof view.caller.onSaved === 'function') view.caller.onSaved();
    }
    function cancelled() {
      var notify = current(view); finish(view, true);
      if (notify && typeof view.caller.onCancel === 'function') view.caller.onCancel();
    }
    var controller = { requestClose: function () { return requestClose(view); },
      destroy: function () { finish(view, false); }, isCurrent: function () { return current(view); },
      getRoot: function () { return view.root; }, getDialog: function () { return dialog; },
      historyHandled: true, ready: null };
    var request = { patientId: options.patientId, note: options.note || null,
      onSaved: saved, onCancel: cancelled, isCurrent: presentation.isCurrent,
      notePresentation: presentation, openPlan: presentation.openPlan };
    ['template', 'anchor', 'suggestLinkedAge'].forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(options, key)) request[key] = options[key];
    });
    try {
      controller.ready = Promise.resolve(w.VildaAuthUI.showPatientNoteEditor(request)).catch(function () {
        if (current(view)) unavailable(view, 'open-failed'); return false;
      });
    } catch (_) { unavailable(view, 'open-failed'); controller.ready = Promise.resolve(false); }
    return controller;
  }
  lifetimeEvents.forEach(function (name) { d.addEventListener(name, function (event) {
    if (!active || name === 'vilda:patient-loaded' && w.VildaHomePatient?.ownsSavePublication?.(event,active.patientId)) return;
    finish(active, false);
  }); });
  ['pointerdown', 'focusin', 'keydown'].forEach(function (name) {
    d.addEventListener(name, function () { if (active && !actorCurrent(active)) finish(active, false); }, true);
  });
  w.VildaHomePatientNoteHost = Object.freeze({ open: open });
})(typeof window !== 'undefined' ? window : null);
