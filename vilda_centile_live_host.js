/* Fullscreen ownership for the live centile view. Patient scope stays in RAM.
 * A shell frame lends its card to the parent document, never the iframe itself.
 */
(function (w) {
  'use strict';
  if (!w || !w.document || w.VildaCentileLiveHost) return;

  var active = null;
  var watchedVaults = new WeakSet();
  var userReasons = ['user', 'button', 'escape', 'backdrop'];
  var invalidatingReasons = ['lock', 'patient-change', 'pagehide', 'stale', 'route-change'];
  var activityEvents = ['pointerdown', 'mousedown', 'keydown', 'touchstart', 'touchmove', 'wheel'];

  function safely(callback) {
    try { return callback(); } catch (_) { return undefined; }
  }

  function sourceFrame(source) {
    if (source === w) return null;
    if (!w.VildaShell || source.parent !== w) return null;
    var container = w.document.getElementById('appPanes');
    var frames = container ? Array.from(container.querySelectorAll('iframe.app-pane')) : [];
    var visible = frames.filter(function (frame) {
      var style = w.getComputedStyle(frame);
      return !frame.hidden && style.display !== 'none' && style.visibility !== 'hidden';
    });
    return visible.length === 1 && visible[0].contentWindow === source ? visible[0] : null;
  }

  function current(record) {
    try {
      if (record.invalidated) return false;
      if (record.source.closed || record.source.document !== record.sourceDocument) return false;
      if (record.source !== w && (!record.frame || !record.frame.isConnected || record.frame.hidden ||
        record.frame.contentWindow !== record.source || record.source.parent !== w)) return false;
      return record.isCurrent(record.patientToken) === true;
    } catch (_) { return false; }
  }

  function listen(record, target, name, callback, options) {
    target.addEventListener(name, callback, options);
    record.cleanups.push(function () { target.removeEventListener(name, callback, options); });
  }

  function lockScroll(record, win) {
    var doc = win.document;
    var saved = { win: win, x: win.scrollX || 0, y: win.scrollY || 0, elements: [] };
    [doc.documentElement, doc.body].forEach(function (element) {
      if (!element) return;
      var owned = !element.classList.contains('vilda-centile-live-scroll-locked');
      saved.elements.push({ element: element, owned: owned });
      if (owned) element.classList.add('vilda-centile-live-scroll-locked');
    });
    record.scroll.push(saved);
  }

  function unlockScroll(record, restorePosition) {
    record.scroll.forEach(function (saved) {
      saved.elements.forEach(function (entry) {
        if (entry.owned) entry.element.classList.remove('vilda-centile-live-scroll-locked');
      });
      if (restorePosition) safely(function () { saved.win.scrollTo({ left: saved.x, top: saved.y, behavior: 'instant' }); });
    });
    record.scroll = [];
  }

  function transferring(record, value) {
    if (value) record.element.classList.add('vilda-centile-live-transferring');
    else if (!record.originalTransferClass) record.element.classList.remove('vilda-centile-live-transferring');
  }

  function cancelAnimations(record) {
    record.animations.forEach(function (animation) { safely(function () { animation.cancel(); }); });
    record.animations.clear();
  }

  async function animate(record, keyframes, duration) {
    if (record.done || !record.element.animate || safely(function () { return w.matchMedia('(prefers-reduced-motion: reduce)').matches; })) return;
    var animation;
    try {
      animation = record.element.animate(keyframes, {
        duration: duration, easing: 'cubic-bezier(.22,.68,0,1)', fill: 'forwards',
      });
      record.animations.add(animation);
      await animation.finished.catch(function () {});
    } finally {
      if (animation) {
        record.animations.delete(animation);
        safely(function () { animation.cancel(); });
      }
    }
  }

  function restore(record) {
    if (record.restoreAttempted) return;
    record.restoreAttempted = true;
    transferring(record, true);
    var valid = current(record);
    // A new document or a destroyed inline mount must never receive this card.
    if (safely(function () { return record.source.document; }) === record.sourceDocument && record.placeholder.isConnected) {
      record.sourceDocument.adoptNode(record.element);
      record.placeholder.replaceWith(record.element);
      record.restored = true;
    } else {
      record.element.remove();
      record.placeholder.remove();
    }
    if (record.restored) safely(function () {
      if (record.onRestore) record.onRestore({ reason: record.reason, current: valid, restored: true });
    });
    if (!valid) record.element.hidden = true;
    safely(function () { if (record.dialog.open && record.dialog.close) record.dialog.close(); });
    record.dialog.remove();
    record.fallbackInert.forEach(function (entry) { entry.element.inert = entry.inert; });
    record.fallbackInert = [];
    w.document.documentElement.classList.remove('vilda-centile-live-host-open');
    unlockScroll(record, valid);
    // The callback fits the already-restored inline geometry while it is hidden.
    record.element.getBoundingClientRect();
    transferring(record, false);
    if (valid && record.restored && record.opener && record.opener.isConnected) {
      safely(function () { record.opener.focus({ preventScroll: true }); });
    }
  }

  function finish(record) {
    if (record.done) return;
    record.done = true;
    cancelAnimations(record);
    restore(record);
    record.cleanups.splice(0).forEach(function (cleanup) { safely(cleanup); });
    if (record.raf) w.cancelAnimationFrame(record.raf);
    record.raf = 0;
    if (active === record) active = null;
    var info = { reason: record.reason, restored: record.restored, current: current(record) };
    safely(function () { if (record.onClose) record.onClose(info); });
    record.resolveReady(false);
    record.resolveClosed(info);
    // Vault subscriptions outlive one dialog; none of them closes over the card.
    record.patientToken = null;
    record.isCurrent = function () { return false; };
    record.onMount = record.onRestore = record.onClose = record.opener = null;
  }

  function close(record, reason) {
    if (record.done) return record.closed;
    reason = typeof reason === 'string' ? reason : 'user';
    if (invalidatingReasons.includes(reason)) record.invalidated = true;
    var animated = userReasons.includes(reason) && current(record);
    if (record.closing) {
      if (!animated) { record.reason = reason; finish(record); }
      return record.closed;
    }
    record.closing = true;
    record.reason = reason;
    cancelAnimations(record);
    if (!animated) { finish(record); return record.closed; }
    (async function () {
      // Keep the fullscreen size until the card is completely transparent.
      await animate(record, [
        { opacity: 1, transform: 'translateY(0)' },
        { opacity: 0, transform: 'translateY(8px)' },
      ], 200);
      if (record.done) return;
      restore(record);
      if (current(record) && record.restored) {
        await animate(record, [{ opacity: 0 }, { opacity: 1 }], 120);
      }
      finish(record);
    })().catch(function () { finish(record); });
    return record.closed;
  }

  function watchVault(vault) {
    if (!vault || typeof vault !== 'object' || watchedVaults.has(vault) || typeof vault.onLock !== 'function') return;
    watchedVaults.add(vault);
    vault.onLock(function () { if (active && active.vaults.has(vault)) close(active, 'lock'); });
  }

  function focusable(dialog) {
    return Array.from(dialog.querySelectorAll('button, a[href], input, select, textarea, [tabindex]')).filter(function (element) {
      return !element.disabled && element.tabIndex >= 0 && !element.hidden && element.getClientRects().length;
    });
  }

  function recordActivity(record, event) {
    try {
      if (!event || event.isTrusted !== true || !activityEvents.includes(event.type) ||
        active !== record || record.done || record.closing || !current(record) ||
        !record.dialog.open || record.dialog.hidden || !record.dialog.isConnected ||
        !record.dialog.getClientRects().length || !record.element.isConnected || record.element.hidden ||
        !record.placeholder.isConnected || record.sourceDocument.visibilityState !== 'visible' ||
        w.document.visibilityState !== 'visible' || record.frame &&
        (record.frame.getAttribute('aria-hidden') === 'true' || sourceFrame(record.source) !== record.frame)) return;
    } catch (_) { return; }
    // The adopted card lives in the shell, while its authentication session
    // still belongs to the source frame. Reuse AuthUI's complete activity API
    // so both idle timers and return-from-background checks see real input.
    var notified = new Set();
    [record.source, w].forEach(function (view) {
      safely(function () {
        var auth = view.VildaAuthUI;
        if (auth && !notified.has(auth) && typeof auth.recordActivity === 'function') {
          notified.add(auth);
          auth.recordActivity();
        }
      });
    });
  }

  function watch(record) {
    var invalidate = function () { close(record, 'patient-change'); };
    activityEvents.forEach(function (type) {
      listen(record, record.dialog, type, function (event) { recordActivity(record, event); },
        { capture: true, passive: true });
    });
    listen(record, record.sourceDocument, 'vilda:patient-loaded', function (event) {
      // Saving the same patient republishes patient-loaded without replacing the
      // editing context. The data adapter keeps that token current as well.
      if (event && event.detail && event.detail.source === 'save') {
        if (!current(record)) close(record, 'stale');
        return;
      }
      invalidate();
    });
    ['vilda:json-imported', 'vilda:user-state-cleared'].forEach(function (name) {
      listen(record, record.sourceDocument, name, invalidate);
    });
    listen(record, record.source, 'vilda:user-state-cleared', invalidate);
    listen(record, record.source, 'pagehide', function () { close(record, 'pagehide'); });
    if (record.source !== w) listen(record, w, 'pagehide', function () { close(record, 'pagehide'); });
    ['hashchange', 'popstate'].forEach(function (name) {
      listen(record, w, name, function () { if (!current(record)) close(record, 'route-change'); });
    });
    listen(record, record.dialog, 'cancel', function (event) { event.preventDefault(); close(record, 'escape'); });
    listen(record, record.dialog, 'close', function () {
      if (!record.restoreAttempted) close(record, 'dialog-close');
    });
    listen(record, record.dialog, 'click', function (event) {
      if (event.target === record.dialog) close(record, 'backdrop');
    });
    listen(record, record.dialog, 'keydown', function (event) {
      if (event.key !== 'Tab') return;
      var elements = focusable(record.dialog);
      var first = elements[0] || record.dialog;
      var last = elements[elements.length - 1] || record.dialog;
      var focused = w.document.activeElement;
      if ((event.shiftKey && (focused === first || !record.dialog.contains(focused))) ||
        (!event.shiftKey && (focused === last || !record.dialog.contains(focused))) || !elements.length) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
      }
    });
    if (record.frame && typeof w.MutationObserver === 'function') {
      var observer = new w.MutationObserver(function () {
        if (!current(record) || safely(function () { return sourceFrame(record.source); }) !== record.frame) close(record, 'route-change');
      });
      observer.observe(w.document.getElementById('appPanes'), {
        attributes: true, attributeFilter: ['hidden', 'class', 'style'], childList: true, subtree: true,
      });
      record.cleanups.push(function () { observer.disconnect(); });
    }
    watchVault(record.source.VildaVault);
    if (record.source !== w) watchVault(w.VildaVault);
    // A token can become stale at the beginning of an apply, before patient-loaded.
    // This loop only compares identity; it does not read layout or mutate the DOM.
    var tick = function () {
      if (record.done) return;
      if (!current(record)) { close(record, 'stale'); return; }
      record.raf = w.requestAnimationFrame(tick);
    };
    record.raf = w.requestAnimationFrame(tick);
  }

  function open(options) {
    options = options || {};
    var source = options.sourceWindow || w;
    try {
      // Embedded pages use exactly the same host API as standalone pages.
      if (w.parent !== w && w.parent.VildaShell) {
        var parentHost = w.parent.VildaCentileLiveHost;
        return parentHost && parentHost.protocol === 1
          ? parentHost.open(Object.assign({}, options, { sourceWindow: source })) : null;
      }
      if (!/\/(?:index|docpro)\.html$/.test(source.location.pathname) && source.location.pathname !== '/') return null;
      if (source !== w && !sourceFrame(source)) return null;
      // An unknown iframe embedding must not fall back to a clipped local modal.
      if (source === w && w.parent !== w) return null;
      if (!options.element || options.element.ownerDocument !== source.document || !options.element.isConnected ||
        options.patientToken == null || typeof options.isCurrent !== 'function') return null;
    } catch (_) { return null; }

    var record = {
      source: source, sourceDocument: source.document, frame: sourceFrame(source),
      element: options.element, patientToken: options.patientToken, isCurrent: options.isCurrent,
      onMount: options.onMount, onRestore: options.onRestore, onClose: options.onClose,
      opener: options.opener || source.document.activeElement,
      cleanups: [], scroll: [], fallbackInert: [], animations: new Set(),
      vaults: new Set([source.VildaVault, w.VildaVault].filter(Boolean)), raf: 0,
      done: false, closing: false, invalidated: false, restoreAttempted: false, restored: false, reason: null,
      originalTransferClass: options.element.classList.contains('vilda-centile-live-transferring'),
    };
    if (!current(record)) return null;
    if (active) close(active, 'replaced');
    if (!current(record) || options.element.ownerDocument !== source.document || !options.element.isConnected) return null;
    record.closed = new Promise(function (resolve) { record.resolveClosed = resolve; });
    record.ready = new Promise(function (resolve) { record.resolveReady = resolve; });
    var dialog = w.document.createElement('dialog');
    dialog.className = 'vilda-centile-live-dialog';
    dialog.setAttribute('aria-label', 'Siatki centylowe pacjenta');
    dialog.setAttribute('aria-modal', 'true');
    dialog.tabIndex = -1;
    record.dialog = dialog;
    var handle = Object.freeze({
      dialog: dialog, closed: record.closed, ready: record.ready,
      close: function (reason) { return close(record, reason); },
      check: function () {
        if (record.done) return false;
        if (current(record) && (!record.frame || sourceFrame(record.source) === record.frame)) return true;
        close(record, 'stale');
        return false;
      },
    });
    record.placeholder = source.document.createElement('div');
    record.placeholder.className = 'vilda-centile-live-placeholder';
    record.placeholder.setAttribute('aria-hidden', 'true');
    var rect = record.element.getBoundingClientRect();
    record.placeholder.style.setProperty('--vilda-centile-live-placeholder-height', rect.height + 'px');
    record.element.replaceWith(record.placeholder);
    transferring(record, true);
    active = record;
    try {
      lockScroll(record, w);
      if (source !== w) lockScroll(record, source);
      w.document.adoptNode(record.element);
      dialog.appendChild(record.element);
      w.document.body.appendChild(dialog);
      w.document.documentElement.classList.add('vilda-centile-live-host-open');
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else {
        dialog.setAttribute('open', '');
        Array.from(w.document.body.children).forEach(function (element) {
          if (element === dialog) return;
          record.fallbackInert.push({ element: element, inert: element.inert });
          element.inert = true;
        });
      }
      watch(record);
      if (record.onMount) record.onMount({ dialog: dialog, hostWindow: w, handle: handle });
      if (record.done) return handle;
      if (!current(record)) { close(record, 'stale'); return handle; }
      transferring(record, false);
      (focusable(dialog)[0] || dialog).focus({ preventScroll: true });
      (async function () {
        await animate(record, [
          { opacity: 0, transform: 'translateY(10px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ], 230);
        if (!record.done && !record.closing) record.resolveReady(current(record));
      })().catch(function () { close(record, 'mount-error'); });
    } catch (_) {
      close(record, 'mount-error');
    }
    return handle;
  }

  w.VildaCentileLiveHost = Object.freeze({ protocol: 1, open: open });
})(typeof window !== 'undefined' ? window : undefined);
