/* Guarded presentation of the original AuthUI note actor. The native editor
 * keeps its parent, writer, dirty confirmation, conflict flow and Back owner. */
(function (w) {
  'use strict';
  if (!w || !w.document || w.__VILDA_HOME_WORKSPACE_PREVIEW__ !== true || w.VildaHomePatientNativeNote) return;
  var d = w.document;

  function wipeRoot(root) {
    if (!root) return;
    var fields = root.querySelectorAll('input,textarea,select');
    var descendants = Array.from(root.querySelectorAll('*'));
    fields.forEach(function (field) {
      try { field.value = ''; } catch (_) { /* Do not dispatch a clinical input event. */ }
    });
    root.remove();
    descendants.forEach(function (node) { node.textContent = ''; });
    root.textContent = '';
  }
  function captureOwner() {
    var vault = w.VildaVault, user = null, token = null;
    if (vault) {
      if (typeof vault.isUnlocked === 'function' && !vault.isUnlocked()) return null;
      if (typeof vault.getCurrentUser === 'function') user = vault.getCurrentUser();
      if (typeof vault.captureSyncOperationSession === 'function') token = vault.captureSyncOperationSession();
    }
    var importer = w.VildaDataImportExport;
    return { vault: vault || null, userId: user && user.userId || null, token: token,
      importer: importer || null, hasSequence: typeof importer?.getApplyLoadedDataSequence === 'function',
      sequence: typeof importer?.getApplyLoadedDataSequence === 'function' ? importer.getApplyLoadedDataSequence() : null };
  }
  function ownerCurrent(owner) {
    try {
      if (!owner || owner.vault !== (w.VildaVault || null)) return false;
      var vault = owner.vault;
      if (vault) {
        if (typeof vault.isUnlocked === 'function' && !vault.isUnlocked()) return false;
        var user = typeof vault.getCurrentUser === 'function' ? vault.getCurrentUser() : null;
        if ((user && user.userId || null) !== owner.userId) return false;
        if (owner.token != null && typeof vault.assertSyncOperationSession === 'function') vault.assertSyncOperationSession(owner.token);
      }
      if (owner.hasSequence && (w.VildaDataImportExport !== owner.importer
        || owner.importer.getApplyLoadedDataSequence() !== owner.sequence)) return false;
      return true;
    } catch (_) { return false; }
  }
  function create(options) {
    options = options || {};
    if (typeof options.patientId !== 'string' || !options.patientId
      || typeof options.isCurrent !== 'function' || typeof options.openNative !== 'function') return null;
    var patientId = options.patientId, active = null, destroyed = false;

    function callerCurrent() {
      try { return !destroyed && options.isCurrent() === true; } catch (_) { return false; }
    }
    function current(view) {
      try {
        return !!(view && !view.disposed && active === view && callerCurrent() && ownerCurrent(view.owner)
          && (!view.requestIsCurrent || view.requestIsCurrent() === true));
      } catch (_) { return false; }
    }
    function notifyDisposed(reason) {
      try { if (typeof options.onDisposed === 'function') options.onDisposed({ reason: reason }); } catch (_) { /* Presentation cleanup must complete. */ }
    }
    function finish(view, reason, afterCleanup) {
      if (!view || view.disposed) return;
      view.disposed = true; view.awaiting = false;
      if (view.observer) view.observer.disconnect();
      view.resizeStops.forEach(function (stop) { stop(); }); view.resizeStops = [];
      if (active === view) active = null;
      var root = view.root;
      view.root = null; view.sheet = null; view.nativeCancel = null; view.closeButton = null; view.observer = null;
      view.onSaved = null; view.onCancel = null; view.requestIsCurrent = null;
      if (root) wipeRoot(root);
      // Callback identities stay in AuthUI's WeakMap. Their disposed provider
      // must still deny a delayed conflict reopen; never remove that binding.
      try { if (typeof afterCleanup === 'function') afterCleanup(); }
      finally { notifyDisposed(reason); }
    }
    function requestCloseView(view) {
      if (!view || view.disposed) return true;
      if (!current(view)) { finish(view, 'owner-changed'); return true; }
      if (!view.root) { finish(view, 'pending-cancelled'); return true; }
      var cancel = view.nativeCancel;
      if (!cancel || !cancel.isConnected || !view.root.contains(cancel) || cancel.disabled) return false;
      // Only the source-backed native Cancel actor may ask about dirty input.
      cancel.click();
      var closed = view.disposed || !view.root || !view.root.isConnected;
      if (closed && !view.disposed) finish(view, 'native-closed');
      return closed;
    }
    function syncCloseButton(view) {
      if (!view.closeButton) return;
      var cancel = view.nativeCancel;
      var disabled = !cancel || !cancel.isConnected || !view.root?.contains(cancel) || cancel.disabled;
      if (view.closeButton.disabled !== disabled) view.closeButton.disabled = disabled;
    }
    function pending(view) {
      if (!current(view)) { finish(view, 'owner-changed'); return false; }
      view.awaiting = true;
      // Native replacement decides about dirtiness before removing its own
      // connected root. Do not detach that editor to display a loading state.
      if (view.root && !view.root.isConnected) {
        wipeRoot(view.root); view.root = null; view.sheet = null; view.nativeCancel = null; view.closeButton = null;
      }
      return true;
    }
    function adopt(view, native) {
      if (!current(view) || !native || native.patientId !== patientId) return false;
      var root = native.root, sheet = native.sheet;
      if (!root || !sheet || !root.isConnected || !root.parentNode || !root.contains(sheet)) return false;
      if (native.kind !== 'editor' && native.kind !== 'readonly') return false;
      if (view.root === root && view.sheet === sheet) { view.awaiting = false; return true; }
      if (view.root && view.root.isConnected) return false;
      var children = Array.from(sheet.children), title = children[0], actions = children[children.length - 1];
      if (!title || !/^H[1-6]$/.test(title.tagName) || !actions) return false;
      var buttons = Array.from(actions.children).filter(function (node) { return node.tagName === 'BUTTON'; });
      // Native writable footer Oe=[Ce,la]; readonly footer ends with dismiss.
      // Never locate a close actor by translated text or an arbitrary button.
      var cancel = native.kind === 'readonly' ? buttons[buttons.length - 1] : buttons[0];
      if (!cancel || cancel.type !== 'button' || native.kind === 'editor' && buttons.length !== 2) return false;
      if (view.root) wipeRoot(view.root);
      view.root = root; view.sheet = sheet; view.nativeCancel = cancel; view.awaiting = false;
      root.classList.add('vhome-b1-native-note'); sheet.classList.add('vhome-b1-native-note');
      if (options.compactPresentation?.()) sheet.classList.add('vhome-b1-compact-note-editor');
      root.dataset.vhomeB1NoteKind = native.kind;
      sheet.dataset.vhomeB1NoteKind = native.kind;
      // tr() applies an inline !important max-height on coarse embedded views.
      // Remove only that presentation constraint; retain every native field.
      sheet.style.removeProperty('max-height');
      var heading = d.createElement('div'); heading.className = 'vhome-b1-native-note-heading';
      sheet.insertBefore(heading, title); heading.appendChild(title);
      var close = d.createElement('button'); close.type = 'button'; close.className = 'vhome-b1-native-note-close';
      close.textContent = '×'; close.setAttribute('aria-label', 'Zamknij notatkę pacjenta');
      close.addEventListener('click', function () { requestCloseView(view); }); heading.appendChild(close);
      actions.classList.add('vhome-b1-native-note-actions'); view.closeButton = close;
      syncCloseButton(view);
      fit(view);
      return true;
    }
    function fit(view) {
      if (!current(view)) return;
      var workspace = w.VildaHomeWorkspace;
      if (!workspace || typeof workspace.fitDialog !== 'function') return;
      if (view.root) workspace.fitDialog(view.root);
      if (view.sheet) workspace.fitDialog(view.sheet);
    }
    function bindResize(view) {
      var targets = [w, w.visualViewport];
      try { if (w.parent && w.parent !== w) targets.push(w.parent, w.parent.visualViewport); } catch (_) { /* Foreign embeds expose no parent viewport. */ }
      targets.forEach(function (target) {
        if (!target || typeof target.addEventListener !== 'function') return;
        var listener = function () { fit(view); };
        try {
          target.addEventListener('resize', listener);
          view.resizeStops.push(function () { try { target.removeEventListener('resize', listener); } catch (_) { /* A parent may have navigated. */ } });
        } catch (_) { /* A parent may have navigated. */ }
      });
    }
    function observe(view) {
      if (typeof w.MutationObserver !== 'function') return;
      view.observer = new w.MutationObserver(function () {
        if (view.disposed) return;
        if (!current(view)) { finish(view, 'owner-changed'); return; }
        if (view.root && !view.root.isConnected && !view.awaiting) { finish(view, 'native-closed'); return; }
        if (view.root) syncCloseButton(view);
      });
      view.observer.observe(d.documentElement, { childList: true, subtree: true,
        attributes: true, attributeFilter: ['disabled'] });
    }
    function open(request) {
      request = request || {};
      if (!callerCurrent()) return false;
      if (request.patientId != null && request.patientId !== patientId
        || request.note && request.note.patientId != null && request.note.patientId !== patientId) return false;
      if (active && !requestCloseView(active)) return false;
      if (!callerCurrent()) return false;
      var owner;
      try { owner = captureOwner(); } catch (_) { return false; }
      var view = { owner: owner, root: null, sheet: null, nativeCancel: null, closeButton: null,
        observer: null, resizeStops: [], disposed: false, awaiting: true, savedNotified: false,
        requestIsCurrent: typeof request.isCurrent === 'function' ? request.isCurrent : null,
        onSaved: typeof request.onSaved === 'function' ? request.onSaved : null,
        onCancel: typeof request.onCancel === 'function' ? request.onCancel : null };
      active = view;
      if (!current(view)) { finish(view, 'owner-changed'); return false; }
      observe(view); bindResize(view);
      var presentation = {
        patientId: patientId,
        isCurrent: function () { return current(view); },
        pending: function () { return pending(view); },
        adopt: function (native) { return adopt(view, native); },
        abort: function () { finish(view, 'native-aborted'); },
        unavailable: function (reason) {
          if (current(view) && view.root?.isConnected) { view.awaiting = false; return; }
          finish(view, reason || 'native-unavailable');
        },
        canOpenPlan: function () { return current(view) && typeof options.openPlan === 'function'; },
        openPlan: function (destination) {
          if (!current(view) || typeof options.openPlan !== 'function') return;
          var handler = options.openPlan;
          finish(view, 'open-plan', function () { if (callerCurrent() && ownerCurrent(owner)) handler(destination); });
        }
      };
      function saved() {
        if (view.savedNotified) return;
        var notify = current(view), callback = view.onSaved, args = arguments;
        view.savedNotified = true;
        finish(view, 'saved', function () { if (notify && typeof callback === 'function') callback.apply(null, args); });
      }
      function cancelled() {
        var notify = current(view), callback = view.onCancel, args = arguments;
        finish(view, 'cancelled', function () { if (notify && typeof callback === 'function') callback.apply(null, args); });
      }
      var nativeRequest = Object.assign({}, request, { patientId: patientId,
        onSaved: saved, onCancel: cancelled, isCurrent: presentation.isCurrent,
        notePresentation: presentation, openPlan: presentation.openPlan });
      var result;
      try { result = options.openNative(nativeRequest); }
      catch (error) { finish(view, 'open-failed'); throw error; }
      // Preserve ga()'s actual return, including its Promise, so awaiting lab
      // callers focus a date field only after the native access read completes.
      if (result && typeof result.then === 'function') {
        Promise.resolve(result).then(function (value) {
          if (value === false && current(view) && !view.root?.isConnected) finish(view, 'native-not-opened');
        }, function () { finish(view, 'open-failed'); });
      } else if (result === false && current(view) && !view.root?.isConnected) finish(view, 'native-not-opened');
      return result;
    }
    return Object.freeze({
      open: open,
      destroy: function () { if (destroyed) return; destroyed = true; if (active) finish(active, 'destroyed'); },
      isEditing: function () {
        if (active && !current(active)) finish(active, 'owner-changed');
        return !!(active && !active.disposed && (active.awaiting || active.root?.isConnected));
      },
      requestClose: function () { return requestCloseView(active); }
    });
  }
  w.VildaHomePatientNativeNote = Object.freeze({ create: create });
})(typeof window !== 'undefined' ? window : null);
