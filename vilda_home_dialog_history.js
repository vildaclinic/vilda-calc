/* UI-only history for the Patient workspace's nested dialogs. No patient ids,
 * clinical facts or note text enter history state. Native components retain
 * Cancel/dirty/busy ownership; this coordinator never closes a dialog itself.
 */
(function (w) {
  'use strict';
  if (!w || w.__VILDA_HOME_WORKSPACE_PREVIEW__ !== true || w.VildaHomeDialogHistory) return;
  var entries = new Map(), order = [], pending = [], serial = 0, scheduled = false;
  var processingPop = false, batchDepth = 0, transition = null, seenState = w.history.state;
  var seed = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  function trail(state) {
    var value = state && state.vildaHomeDialogStack;
    return value && value.version === 1 && Array.isArray(value.tokens)
      && value.tokens.every(function (token) { return typeof token === 'string'; })
      && value.tokens[value.tokens.length - 1] === state.vildaHomeDialog ? value.tokens.slice() : [];
  }
  function token(state) { var values = trail(state); return values.length ? values[values.length - 1] : null; }
  function consume(event) { if (event && typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation(); }
  function live(entry) { return !!(entry && !entry.released && entry.entered); }
  function top() {
    for (var index = order.length - 1; index >= 0; index -= 1) {
      var entry = entries.get(order[index]); if (live(entry)) return entry;
    }
    return null;
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    Promise.resolve().then(function () { scheduled = false; drain(); });
  }
  function commit(entry) {
    if (entry.released || entry.entered) return;
    var values = trail(w.history.state); values.push(entry.token);
    var state = Object.assign({}, w.history.state, { vildaHomeDialog: entry.token,
      vildaHomeDialogStack: { version: 1, tokens: values } });
    w.history.pushState(state, '', w.location.href); seenState = w.history.state;
    entry.entered = true; order.push(entry.token);
  }
  function flushPending() {
    if (transition || processingPop || batchDepth) return;
    var waiting = pending; pending = [];
    waiting.forEach(function (entry) { entry.pending = false; if (!entry.released) commit(entry); });
  }
  function release(entry) {
    if (entry.released) return true;
    entry.released = true;
    // Keep a tiny opaque tombstone for forward/queued history states, but drop
    // all callbacks/groups so the coordinator cannot retain patient DOM/data.
    entry.requestClose = null; entry.isOpen = null; entry.group = null;
    schedule(); return true;
  }
  function drain() {
    if (transition || processingPop || batchDepth) return;
    flushPending();
    var values = trail(w.history.state), count = 0;
    for (var index = values.length - 1; index >= 0; index -= 1) {
      var entry = entries.get(values[index]);
      if (!entry || !entry.released) break;
      count += 1;
    }
    if (!count) return;
    transition = { kind: 'release', target: values[values.length - count - 1] || null };
    // All synchronous child + parent releases coalesce into this ONE traversal.
    // Releases arriving during it wait for its popstate, then recompute from
    // the actual destination instead of issuing a competing back operation.
    w.history.go(-count);
  }
  function restore(targetToken) {
    transition = { kind: 'restore', target: targetToken };
    // A history-menu jump can cross arbitrary older app entries. Owned trail
    // depth is NOT a physical history index: walk existing forward entries
    // until the exact retained token is found, rather than guessing an offset.
    w.history.go(1);
  }
  function request(entry) {
    if (!live(entry) || typeof entry.requestClose !== 'function') return true;
    var accepted;
    try { accepted = entry.requestClose() !== false; }
    catch (_) { accepted = false; }
    if (entry.released) return true;
    var opened = true;
    try { if (typeof entry.isOpen === 'function') opened = entry.isOpen() !== false; }
    catch (_) { opened = true; }
    if (accepted && !opened) { release(entry); return true; }
    return false;
  }
  function pop(event) {
    var destination = w.history.state, before = trail(seenState), after = trail(destination);
    seenState = destination;
    if (transition) {
      if (top() || pending.some(function (entry) { return !entry.released; })) consume(event);
      // A rejected dirty close restores the ORIGINAL existing entry; it never
      // creates a duplicate with pushState. Ignore intermediate queued pops.
      if (transition.kind === 'restore' && token(destination) !== transition.target) { w.history.go(1); return; }
      transition = null; flushPending(); schedule(); return;
    }
    var entry = top();
    if (!entry) { if (after.some(function (id) { return entries.has(id); })) schedule(); return; }
    // Forward navigation to an obsolete child must not close its live parent.
    if (after.indexOf(entry.token) !== -1) {
      if (after[after.length - 1] !== entry.token) schedule();
      return;
    }
    consume(event); processingPop = true;
    var accepted;
    try { accepted = request(entry); }
    finally { processingPop = false; }
    if (!accepted) { restore(entry.token); return; }
    var parent = top();
    // A browser history-menu jump may skip several entries. Close only the top
    // child and restore its still-open parent's existing entry in that case.
    if (parent && after.indexOf(parent.token) === -1) {
      var parentIndex = before.indexOf(parent.token);
      if (parentIndex >= 0) { restore(parent.token); return; }
    }
    flushPending(); schedule();
  }
  function create(options) {
    options = options || {};
    var entry = { token: 'vhome-' + seed + '-' + (++serial), group: options.group || null,
      entered: false, pending: false, released: false, requestClose: options.requestClose, isOpen: options.isOpen };
    entries.set(entry.token, entry);
    return Object.freeze({ token: entry.token,
      enter: function () {
        if (entry.released) return false;
        if (entry.entered || entry.pending) return true;
        if (transition || processingPop || batchDepth) { entry.pending = true; pending.push(entry); }
        else commit(entry);
        return true;
      },
      release: function () { return release(entry); },
      isTop: function () { return top() === entry; },
      isReleased: function () { return entry.released; }
    });
  }
  function batch(action) {
    batchDepth += 1;
    try { return action(); }
    finally { batchDepth -= 1; if (!batchDepth) { flushPending(); schedule(); } }
  }
  function watchNativeDialog(target, options) {
    options = options || {};
    var stopped = false, observer = null, entered = false;
    var handle = create({ group: options.group,
      isOpen: function () { return target.isConnected && target.open; },
      requestClose: function () {
        if (!target.isConnected || !target.open) return true;
        // Existing Care/Lab handlers own Cancel, including busy/uncertain
        // refusal. A synthetic cancel invokes those handlers; no .close fallback.
        target.dispatchEvent(new w.Event('cancel', { cancelable: true }));
        return !target.isConnected || !target.open;
      } });
    function sync() {
      if (stopped) return;
      if (target.isConnected && target.open) { if (!entered) { entered = true; handle.enter(); } }
      else if (entered) cleanup();
    }
    function cleanup() {
      if (stopped) return;
      stopped = true;
      if (observer) observer.disconnect();
      target.removeEventListener('close', sync); handle.release();
    }
    target.addEventListener('close', sync);
    if (typeof w.MutationObserver === 'function') {
      observer = new w.MutationObserver(sync);
      observer.observe(target, { attributes: true, attributeFilter: ['open'] });
      observer.observe(target.ownerDocument.documentElement, { childList: true, subtree: true });
    }
    sync();
    return cleanup;
  }
  w.addEventListener('popstate', pop);
  w.VildaHomeDialogHistory = Object.freeze({ create: create, batch: batch, watchNativeDialog: watchNativeDialog,
    requestTop: function () { var entry = top(); return entry ? request(entry) : true; } });
})(typeof window !== 'undefined' ? window : null);
