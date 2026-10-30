/* Device-local presentation shield for the Reminders workspace.
 * Load before the UI renderer: the root class and its visibility rule protect
 * newly created content before register() supplies inert/aria-hidden semantics.
 * This preference never enters patient state or cloud preference replication.
 */
(function (w) {
  'use strict';
  if (!w || !w.document || w.VildaRemindersPrivacy) return;
  var doc = w.document, html = doc.documentElement;
  var KEY = 'remindersPrivacyHidden', CLASS = 'vilda-reminders-private';
  var views = [], listeners = [], hidden = read();
  try {
    if (w.top && w.top !== w && w.top.VildaRemindersPrivacy) hidden = w.top.VildaRemindersPrivacy.isHidden();
  } catch (_) {}

  function persistence() {
    var p = w.VildaPersistence, meta = p && p.MODULE_KEY_META && p.MODULE_KEY_META[KEY];
    return meta && meta.kind === 'preference' && meta.storage === 'local-persistent' ? p : null;
  }
  function read() {
    try {
      // This one device key can be read before the adapter's deferred bootstrap.
      if (!w.localStorage) return typeof hidden === 'boolean' ? hidden : false;
      var value = w.localStorage.getItem(KEY);
      return value === 'true' || value === '1';
    } catch (_) { return typeof hidden === 'boolean' ? hidden : false; }
  }
  function write(value) {
    try {
      var p = persistence();
      // A user can toggle this UI preference while patient writes are quarantined.
      if (p && typeof p.writeBooleanPreference === 'function' && p.writeBooleanPreference(KEY, value, { force: true })) return;
      if (w.localStorage) w.localStorage.setItem(KEY, value ? 'true' : 'false');
    } catch (_) { /* The shield still works in memory when storage is unavailable. */ }
  }
  function list(value) { return !value ? [] : Array.isArray(value) ? value.filter(Boolean) : [value]; }
  function contains(parent, child) { return !!(parent && child && parent.contains && parent.contains(child)); }
  function attr(node, name, value) { if (value === null) node.removeAttribute(name); else node.setAttribute(name, value); }
  function icon(value) {
    return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
      (value ? '<path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.8 5.2A11.8 11.8 0 0 1 12 5c6 0 10 7 10 7a18 18 0 0 1-3.1 3.7M6.1 6.1A20 20 0 0 0 2 12s4 7 10 7a12 12 0 0 0 5.1-1.2"/>' :
        '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>') + '</svg>';
  }
  function installStyle() {
    if (doc.getElementById('vilda-reminders-privacy-style')) return;
    var style = doc.createElement('style'); style.id = 'vilda-reminders-privacy-style';
    style.textContent =
      'html.' + CLASS + ' .vb22-private-content,html.' + CLASS + ' .vb22-subtitle{visibility:hidden!important;pointer-events:none!important;}' +
      '.vb22-inline.vilda-reminders-private-surface{position:relative;}' +
      '.vilda-reminders-private-body{position:relative;display:flex;flex:1 1 auto;flex-direction:column;min-width:0;min-height:0;overflow:hidden;isolation:isolate;}' +
      // Native headers inherit a global z-index even as static flex items.
      // Keep each protected block (including its header descendants) in its
      // own lower layer, so it cannot intercept the eye or paint over the mask.
      '.vilda-reminders-private-surface>.vb22-private-content,.vilda-reminders-private-body>.vb22-private-content{isolation:isolate;z-index:0!important;}' +
      '.vilda-reminders-private-cover{position:absolute;inset:0;z-index:20;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;overflow:hidden;padding:24px;background:#f5f8f8;color:#607b81;text-align:center;box-sizing:border-box;font:400 14.4px/1.5 Inter,sans-serif;}' +
      '.vilda-reminders-private-cover[hidden]{display:none!important;}' +
      '.vilda-reminders-private-cover strong{font-size:17px;font-weight:500;color:#29464d;}' +
      '.vilda-reminders-private-cover::before{content:"";display:block;width:min(230px,70%);height:65px;flex-shrink:0;background:linear-gradient(#cbd9d9 0 0) 0 0/85% 10px,linear-gradient(#d7e1e1 0 0) 0 25px/100% 10px,linear-gradient(#d7e1e1 0 0) 0 50px/65% 10px;background-repeat:no-repeat;filter:blur(5px);opacity:.65;}' +
      '.vilda-reminders-private-eye{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;}' +
      '.vilda-reminders-private-eye svg{display:block;pointer-events:none;}' +
      '.vilda-reminders-dialog-eye{position:absolute;z-index:21;top:14px;right:58px;width:36px;height:36px;min-height:36px;padding:6px;border:1px solid #dce7e8;border-radius:8px;background:#fff;color:#29464d;cursor:pointer;}' +
      '.vilda-reminders-dialog-eye:focus-visible{outline:2px solid #4c9ea5;outline-offset:2px;}';
    (doc.head || html).appendChild(style);
  }
  function cover() {
    var node = doc.createElement('div'); node.className = 'vilda-reminders-private-cover'; node.hidden = true;
    var title = doc.createElement('strong'); title.textContent = 'Treść ukryta'; node.appendChild(title);
    var caption = doc.createElement('span'); caption.textContent = 'Użyj ikony oka, aby pokazać Przypomnienia.'; node.appendChild(caption);
    return node;
  }
  function label(view, masked) {
    // Accessible-name references can include hidden referenced text. Remove
    // those references as well as shielding the visual/accessibility subtree.
    attr(view.root, 'aria-label', masked ? 'Przypomnienia — treść ukryta' : view.label.label);
    attr(view.root, 'aria-labelledby', masked ? null : view.label.labelledby);
    attr(view.root, 'aria-describedby', masked ? null : view.label.describedby);
  }
  function update(view) {
    var active = doc.activeElement, moveFocus = false;
    label(view, hidden);
    view.parts.forEach(function (part) {
      var node = part.node;
      if (hidden && contains(node, active)) moveFocus = true;
      node.inert = hidden || part.inert;
      attr(node, 'aria-hidden', hidden ? 'true' : part.ariaHidden);
    });
    view.cover.hidden = !hidden;
    view.buttons.forEach(function (button) {
      button.classList.add('vilda-reminders-private-eye'); button.innerHTML = icon(hidden);
      button.setAttribute('aria-label', hidden ? 'Pokaż treść Przypomnień' : 'Ukryj treść Przypomnień');
      button.setAttribute('title', hidden ? 'Pokaż treść Przypomnień' : 'Ukryj treść Przypomnień');
      button.setAttribute('aria-pressed', String(hidden));
    });
    if (moveFocus && view.buttons[0] && view.buttons[0].focus) view.buttons[0].focus({ preventScroll: true });
  }
  function apply(value) {
    var changed = hidden !== !!value; hidden = !!value;
    html.classList.toggle(CLASS, hidden);
    views.slice().forEach(update);
    if (changed) listeners.slice().forEach(function (fn) { try { fn(hidden); } catch (_) {} });
    return hidden;
  }
  function share(value) {
    // Same-origin shell frames can keep warm documents alive. Update their guards
    // synchronously as well as relying on the browser's later storage event.
    var top = w; try { if (w.top && w.top.document) top = w.top; } catch (_) {}
    function visit(target) {
      try {
        if (target.VildaRemindersPrivacy) target.VildaRemindersPrivacy.receive(value);
        else if (target.document && target.document.documentElement) target.document.documentElement.classList.toggle(CLASS, value);
        for (var index = 0; target.frames && index < target.frames.length; index += 1) visit(target.frames[index]);
      } catch (_) { /* A foreign embedded document is outside this UI scope. */ }
    }
    visit(top);
  }
  function setHidden(value) { value = !!value; write(value); apply(value); share(value); return hidden; }
  function toggle() { return setHidden(!hidden); }
  function subscribe(fn) {
    if (typeof fn !== 'function') return function () {};
    listeners.push(fn);
    return function () { listeners = listeners.filter(function (entry) { return entry !== fn; }); };
  }
  function refresh(root) {
    views.filter(function (view) { return !root || view.root === root; }).forEach(update);
  }
  function register(options) {
    options = options || {};
    if (!options.root) return function () {};
    var root = options.root, mask = options.cover || cover(), ownCover = !options.cover;
    var maskOrigin = { parent: mask.parentNode, next: mask.nextSibling };
    var view = { root: root, cover: mask, header: options.header || null, buttons: list(options.buttons || options.button),
      label: { label: root.getAttribute('aria-label'), labelledby: root.getAttribute('aria-labelledby'), describedby: root.getAttribute('aria-describedby') },
      parts: list(options.content).map(function (node) {
        node.classList.add('vb22-private-content');
        return { node: node, parent: node.parentNode, next: node.nextSibling, ariaHidden: node.getAttribute('aria-hidden'), inert: !!node.inert };
      }) };
    root.classList.add('vilda-reminders-private-surface'); mask.classList.add('vilda-reminders-private-cover');
    // The body defines the cover's geometry in normal flex layout. The header
    // stays outside it, including when a closed dialog has no measured height.
    var body = null;
    if (view.header) {
      body = doc.createElement('div'); body.className = 'vilda-reminders-private-body';
      var first = view.parts[0] && view.parts[0].node;
      root.insertBefore(body, first && first.parentNode === root ? first : null);
      view.parts.forEach(function (part) { body.appendChild(part.node); });
      body.appendChild(mask);
    } else if (ownCover) root.appendChild(mask);
    view.buttons.forEach(function (button) { button.addEventListener('click', toggle); });
    views.push(view); update(view);
    var stopped = false;
    return function () {
      if (stopped) return; stopped = true;
      views = views.filter(function (entry) { return entry !== view; });
      view.buttons.forEach(function (button) { button.removeEventListener('click', toggle); });
      view.parts.forEach(function (part) {
        part.node.classList.remove('vb22-private-content'); part.node.inert = part.inert;
        attr(part.node, 'aria-hidden', part.ariaHidden);
      });
      if (body) view.parts.slice().reverse().forEach(function (part) {
        if (part.parent) part.parent.insertBefore(part.node, part.next && part.next.parentNode === part.parent ? part.next : null);
        else part.node.remove();
      });
      label(view, false);
      root.classList.remove('vilda-reminders-private-surface');
      if (ownCover) mask.remove();
      else if (body) {
        if (maskOrigin.parent) maskOrigin.parent.insertBefore(mask, maskOrigin.next && maskOrigin.next.parentNode === maskOrigin.parent ? maskOrigin.next : null);
        else mask.remove();
      }
      if (body) body.remove();
    };
  }
  function protectDialog(dialog) {
    if (!dialog) return function () {};
    var parts = Array.from(dialog.children), eye = doc.createElement('button');
    eye.type = 'button'; eye.className = 'vilda-reminders-private-eye vilda-reminders-dialog-eye';
    // Register before insertion/showModal, so even the first paint is guarded.
    var stop = register({ root: dialog, content: parts, button: eye }); dialog.appendChild(eye);
    return function () { stop(); eye.remove(); };
  }
  installStyle(); html.classList.toggle(CLASS, hidden);
  if (w.addEventListener) {
    w.addEventListener('storage', function (event) { if (event.key === KEY || event.key === null) apply(read()); });
    w.addEventListener('pageshow', function () { apply(read()); });
    w.addEventListener('resize', function () { refresh(); });
    w.addEventListener('vilda:module-state-cleared', function (event) {
      if (event.detail && event.detail.includePreferences === true) apply(read());
    });
  }
  w.VildaRemindersPrivacy = Object.freeze({ version: '1', KEY: KEY, isHidden: function () { return hidden; },
    setHidden: setHidden, toggle: toggle, subscribe: subscribe, register: register, protectDialog: protectDialog, refresh: refresh, receive: apply });
})(typeof window !== 'undefined' ? window : null);
