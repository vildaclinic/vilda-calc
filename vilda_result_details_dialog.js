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
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
