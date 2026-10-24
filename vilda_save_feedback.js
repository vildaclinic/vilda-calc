/* Save feedback is presentation only. The save collector supplies the outcome;
 * this module neither writes a patient nor changes the form. A visible shell pane
 * lends its message to the outer document so the phone Dock and keyboard are known.
 */
(function (w) {
  'use strict';
  if (!w || !w.document || w.VildaSaveFeedback) return;

  var d = w.document, epoch = 0, editRevision = 0, active = null, serial = 0, frameObserver = null;
  var watchedVaults = new WeakSet();
  var tones = { ok: true, nowy: true, uwaga: true, blad: true, info: true };

  function safely(callback) { try { return callback(); } catch (_) { return undefined; } }
  function route() {
    var path = String(w.location && w.location.pathname || '');
    return /(?:^|\/)docpro\.html$/.test(path) ? 'docpro'
      : /(?:^|\/)index\.html$/.test(path) || path === '/' ? 'start' : null;
  }
  function patientId() {
    try { return w.sessionStorage ? w.sessionStorage.getItem('vildaCurrentPatientId') || null : w._vildaCurrentPatientId || null; }
    catch (_) { return undefined; }
  }
  function sequence() {
    return safely(function () {
      var api = w.VildaDataImportExport;
      return api && typeof api.getApplyLoadedDataSequence === 'function' ? api.getApplyLoadedDataSequence() : null;
    });
  }
  function unlocked() { return safely(function () { return !!(w.VildaVault && w.VildaVault.isUnlocked()); }) === true; }
  function owner() {
    return safely(function () {
      return w.parent && w.parent !== w && w.parent.VildaShell ? w.parent : w;
    }) || w;
  }
  function visibleSource(source) {
    try {
      if (source === w) return !!route();
      if (!w.VildaShell || source.parent !== w) return false;
      var panes = d.getElementById('appPanes');
      if (!panes) return false;
      var frames = Array.from(panes.querySelectorAll('iframe.app-pane')).filter(function (frame) {
        var style = w.getComputedStyle(frame);
        return frame.isConnected && !frame.hidden && style.display !== 'none' && style.visibility !== 'hidden';
      });
      return frames.length === 1 && frames[0].contentWindow === source;
    } catch (_) { return false; }
  }
  function scopeCurrent(scope, options, checkEdits) {
    if (!scope || scope.document !== d || scope.epoch !== epoch || scope.route !== route()
      || scope.applySequence !== sequence() || scope.patientId === undefined
      || checkEdits && scope.editRevision !== editRevision) return false;
    var expected = options && Object.prototype.hasOwnProperty.call(options, 'patientId') ? options.patientId : scope.patientId;
    if (patientId() !== expected || scope.unlocked && !unlocked()) return false;
    if (safely(function () { return w.VildaPanelPacjent && w.VildaPanelPacjent.nieaktualny(); }) === true) return false;
    var host = owner();
    return host === w ? !!scope.route : safely(function () {
      return host.VildaSaveFeedback && scope.hostEpoch === host.VildaSaveFeedback._getEpoch()
        && host.VildaSaveFeedback._visibleSource(w);
    }) === true;
  }
  function isCurrent(scope, options) { return scopeCurrent(scope, options, true); }
  // An already displayed error stays available for reading and retry after an
  // edit. That does not make the old save operation current for a later outcome.
  function ownsScope(scope, options) { return scopeCurrent(scope, options, false); }
  function watchVault() {
    var vault = w.VildaVault;
    if (!vault || typeof vault !== 'object' || watchedVaults.has(vault) || typeof vault.onLock !== 'function') return;
    watchedVaults.add(vault);
    vault.onLock(invalidate);
  }
  function watchSourceFrame() {
    var host = owner();
    if (frameObserver || host === w || !host.MutationObserver) return;
    var frame = safely(function () { return w.frameElement; });
    if (!frame) return;
    frameObserver = new host.MutationObserver(function () {
      if (!safely(function () { return host.VildaSaveFeedback._visibleSource(w); })) invalidate();
    });
    frameObserver.observe(frame, { attributes: true, attributeFilter: ['hidden', 'class', 'style'] });
  }
  function capture() {
    if (!route()) return null;
    watchVault();
    watchSourceFrame();
    var host = owner();
    return Object.freeze({ document: d, route: route(), epoch: epoch, editRevision: editRevision, patientId: patientId(),
      applySequence: sequence(), unlocked: unlocked(), hostEpoch: host === w ? epoch
        : safely(function () { return host.VildaSaveFeedback._getEpoch(); }) });
  }
  function current(record) {
    return safely(function () {
      var api = record.source.VildaSaveFeedback;
      var provisional = record.element.dataset.state === 'saving' || record.element.dataset.state === 'saved';
      return record.source.document === record.sourceDocument && visibleSource(record.source)
        && (provisional ? api.isCurrent(record.scope, record.options) : api._ownsScope(record.scope, record.options));
    }) === true;
  }
  function listen(record, target, event, callback, options) {
    if (!target || typeof target.addEventListener !== 'function') return;
    target.addEventListener(event, callback, options);
    record.cleanups.push(function () { target.removeEventListener(event, callback, options); });
  }
  function remove(record) {
    if (!record || record.removed) return;
    record.removed = true;
    w.clearTimeout(record.timer);
    if (record.raf) w.cancelAnimationFrame(record.raf);
    if (record.layoutRaf) w.cancelAnimationFrame(record.layoutRaf);
    record.cleanups.splice(0).forEach(function (cleanup) { safely(cleanup); });
    record.element.remove();
    record.live.remove();
    record.safe.remove();
    if (active === record) active = null;
  }
  function clearSource(source) { if (active && active.source === source) remove(active); }
  function clearEditedSource(source) {
    if (active && active.source === source && (active.element.dataset.state === 'saved' || active.element.dataset.state === 'saving')) remove(active);
  }
  function clear() {
    var host = owner();
    if (host !== w && host.VildaSaveFeedback) host.VildaSaveFeedback._clearSource(w);
    if (host === w) remove(active);
    else clearSource(w);
  }
  function invalidate() { epoch += 1; clear(); }
  function edited() {
    editRevision += 1;
    var host = owner();
    if (host !== w && host.VildaSaveFeedback) host.VildaSaveFeedback._clearEditedSource(w);
    else clearEditedSource(w);
  }
  function trustedEdit(event) { if (event && event.isTrusted === true) edited(); }
  function viewport() {
    var vv = w.visualViewport;
    var left = vv && Number.isFinite(vv.offsetLeft) ? vv.offsetLeft : 0;
    var top = vv && Number.isFinite(vv.offsetTop) ? vv.offsetTop : 0;
    var width = vv && vv.width > 0 ? vv.width : w.innerWidth || d.documentElement.clientWidth;
    var height = vv && vv.height > 0 ? vv.height : w.innerHeight || d.documentElement.clientHeight;
    return { left: left, top: top, width: width, height: height, right: left + width, bottom: top + height };
  }
  function visibleBox(element, bounds) {
    if (!element || element.hidden || !element.getClientRects().length) return null;
    var style = w.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0
      || element.classList.contains('is-hidden') || element.classList.contains('is-keyboard-hidden')) return null;
    var box = element.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && box.top < bounds.bottom && box.bottom > bounds.top
      && box.left < bounds.right && box.right > bounds.left ? box : null;
  }
  function position(record) {
    if (!current(record)) { remove(record); return; }
    var bounds = viewport(), safe = w.getComputedStyle(record.safe);
    var mobile = (w.innerWidth || bounds.width) < 992 || d.documentElement.classList.contains('vilda-phone-landscape');
    var insetLeft = Math.max(mobile ? 12 : 24, parseFloat(safe.paddingLeft) || 0);
    var insetRight = Math.max(mobile ? 12 : 24, parseFloat(safe.paddingRight) || 0);
    var insetBottom = Math.max(mobile ? 12 : 24, parseFloat(safe.paddingBottom) || 0);
    var width = Math.max(0, bounds.width - insetLeft - insetRight);
    record.element.classList.toggle('is-mobile', mobile);
    record.element.style.maxWidth = width + 'px';
    record.element.style.maxHeight = Math.max(80, bounds.height - 24) + 'px';
    var rect = record.element.getBoundingClientRect();
    var left = mobile ? bounds.left + insetLeft + (width - rect.width) / 2 : bounds.left + insetLeft;
    var bottom = bounds.bottom - insetBottom;
    var dock = visibleBox(d.getElementById('mobileBottomDock'), bounds);
    if (dock) bottom = Math.min(bottom, dock.top - 10);
    // Keep the compact capsule close to the Dock: a small shift left can clear
    // the scroll button. Full messages (or capsules with no horizontal room)
    // go above the obstacle without hiding or moving an app control.
    var compact = mobile && (record.element.classList.contains('is-success') || record.element.classList.contains('is-pending'));
    ['scrollTopBtn', 'appShellScrollTop', 'appShellTermFab'].forEach(function (id) {
      var obstacle = visibleBox(d.getElementById(id), bounds);
      if (obstacle && left < obstacle.right + 8 && left + rect.width > obstacle.left - 8
        && bottom > obstacle.top - 8 && bottom - rect.height < obstacle.bottom + 8) {
        var beside = obstacle.left - 8 - rect.width;
        if (compact && beside >= bounds.left + insetLeft) left = Math.min(left, beside);
        else bottom = obstacle.top - 8;
      }
    });
    var top = Math.max(bounds.top + 12, bottom - rect.height);
    record.element.style.left = Math.round(left) + 'px';
    record.element.style.top = Math.round(top) + 'px';
    record.element.classList.add('is-positioned');
  }
  function schedulePosition(record) {
    if (record.removed || record.layoutRaf) return;
    record.layoutRaf = w.requestAnimationFrame(function () { record.layoutRaf = 0; position(record); });
  }
  function track(record) {
    if (!current(record)) { remove(record); return; }
    record.raf = w.requestAnimationFrame(function () { track(record); });
  }
  function node(tag, className, text) {
    var element = d.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  }
  function fieldLink(record, field) {
    var button = node('button', 'vilda-save-feedback__field', field.etykieta);
    button.type = 'button';
    button.addEventListener('click', function () {
      if (!current(record)) { remove(record); return; }
      var target = record.sourceDocument.getElementById(field.id);
      if (!target) return;
      safely(function () { target.scrollIntoView({ block: 'center', behavior: record.source.vildaGetMotionAwareScrollBehavior ? record.source.vildaGetMotionAwareScrollBehavior() : 'smooth' }); });
      safely(function () { target.focus({ preventScroll: true }); });
    });
    return button;
  }
  function messageText(record, target, text, fields) {
    var index = 0;
    (Array.isArray(fields) ? fields : []).forEach(function (field) {
      if (!field || typeof field.id !== 'string' || typeof field.etykieta !== 'string' || !field.etykieta) return;
      var match = text.indexOf(field.etykieta, index);
      if (match < 0) return;
      target.appendChild(d.createTextNode(text.slice(index, match)));
      target.appendChild(fieldLink(record, field));
      index = match + field.etykieta.length;
    });
    target.appendChild(d.createTextNode(text.slice(index)));
  }
  function time(value) {
    var date = value == null ? new Date() : new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) : '';
  }
  function showFrom(source, options) {
    watchVault();
    var input = options && typeof options === 'object' ? options : {};
    var text = input.tekst == null ? '' : String(input.tekst);
    if (!text.trim() || !d.body) return false;
    var api = source && source.VildaSaveFeedback;
    if (!api) return false;
    var scope = input.scope || api.capture();
    if (!visibleSource(source) || !api.isCurrent(scope, input)) return true;
    remove(active);
    var tone = tones[input.ton] ? input.ton : 'info';
    var success = input.success === true && (tone === 'ok' || tone === 'nowy');
    var pending = input.pending === true;
    var stamp = time(input.kiedy);
    var record = { source: source, sourceDocument: source.document, options: input, scope: scope,
      element: node('aside', 'vilda-save-feedback'), live: node('div', 'vilda-save-feedback-live'),
      safe: node('div', 'vilda-save-feedback-safe'), cleanups: [], timer: 0, raf: 0, layoutRaf: 0, removed: false };
    active = record;
    record.element.id = 'vildaSaveFeedback';
    record.element.dataset.tone = tone;
    record.element.dataset.state = pending ? 'saving' : success ? 'saved' : tone === 'blad' ? 'error' : 'notice';
    record.element.classList.toggle('is-success', success);
    record.element.classList.toggle('is-pending', pending);
    record.element.setAttribute('aria-label', 'Wynik zapisu');
    record.safe.setAttribute('aria-hidden', 'true');
    record.live.id = 'vildaSaveFeedbackLive';
    record.live.setAttribute('role', 'status');
    record.live.setAttribute('aria-live', 'polite');
    record.live.setAttribute('aria-atomic', 'true');
    var icon = node('span', 'vilda-save-feedback__icon', pending ? '◌' : success ? '✓' : tone === 'blad' ? '!' : tone === 'uwaga' ? '!' : 'ℹ');
    icon.setAttribute('aria-hidden', 'true');
    record.element.appendChild(icon);
    var content = node('div', 'vilda-save-feedback__content');
    var title = node('strong', 'vilda-save-feedback__title', success ? 'Dane zostały zapisane' : pending ? 'Zapisywanie danych…' : tone === 'blad' ? 'Nie zapisano danych' : 'Informacja o zapisie');
    var compact = node('span', 'vilda-save-feedback__compact', success ? 'Zapisano' : 'Zapisywanie…');
    var body = node('div', 'vilda-save-feedback__text');
    if (success) body.textContent = (input.patientName ? String(input.patientName) + ' · ' : '') + stamp;
    else messageText(record, body, text, input.pola);
    var when = node('span', 'vilda-save-feedback__time', success && stamp ? '· ' + stamp : '');
    content.appendChild(title); content.appendChild(compact); content.appendChild(body); content.appendChild(when);
    if (tone === 'blad' && typeof input.retry === 'function') {
      var retry = node('button', 'vilda-save-feedback__retry', 'Ponów zapis');
      retry.type = 'button'; retry.id = 'vildaSaveFeedbackRetry';
      retry.addEventListener('click', function () {
        if (!current(record)) { remove(record); return; }
        retry.disabled = true;
        // The callback still owns validation and duplicate prevention.
        safely(function () { input.retry(); });
        if (record.element.isConnected) retry.disabled = false;
      });
      content.appendChild(retry);
    }
    record.element.appendChild(content);
    var close = node('button', 'vilda-save-feedback__close', '×');
    close.type = 'button'; close.id = 'vildaSaveFeedbackClose'; close.setAttribute('aria-label', 'Zamknij powiadomienie');
    close.addEventListener('click', function () { remove(record); });
    record.element.appendChild(close);
    d.body.appendChild(record.safe); d.body.appendChild(record.live); d.body.appendChild(record.element);
    position(record);
    // Populate the live region only after it is connected. Only the outer document
    // announces this message; no duplicate hidden live region exists in the pane.
    var announcement = ++serial;
    w.setTimeout(function () { if (active === record && !record.removed && announcement === serial && current(record)) record.live.textContent = text; }, 0);
    if (success) record.timer = w.setTimeout(function () { remove(record); }, 5000);
    var update = function () { schedulePosition(record); };
    listen(record, w, 'resize', update); listen(record, w, 'scroll', update, { passive: true });
    listen(record, w.visualViewport, 'resize', update); listen(record, w.visualViewport, 'scroll', update, { passive: true });
    listen(record, source, 'pagehide', function () { remove(record); });
    listen(record, source, 'vilda:user-state-cleared', function () { remove(record); });
    if (typeof w.ResizeObserver === 'function') {
      var resize = new w.ResizeObserver(update);
      resize.observe(record.element);
      var dock = d.getElementById('mobileBottomDock');
      if (dock) resize.observe(dock);
      record.cleanups.push(function () { resize.disconnect(); });
    }
    if (typeof w.MutationObserver === 'function') {
      var mutation = new w.MutationObserver(function () { if (!current(record)) remove(record); else update(); });
      [d.documentElement, d.body, d.getElementById('mobileBottomDock'), d.getElementById('appPanes')].forEach(function (element) {
        if (element) mutation.observe(element, { attributes: true, attributeFilter: ['class', 'hidden', 'style'], subtree: element.id === 'appPanes', childList: element.id === 'appPanes' });
      });
      record.cleanups.push(function () { mutation.disconnect(); });
    }
    track(record);
    return true;
  }
  function show(options) {
    if (!route()) return false;
    watchVault();
    var host = owner();
    if (host !== w) return host.VildaSaveFeedback ? host.VildaSaveFeedback._showFrom(w, options) : false;
    return showFrom(w, options);
  }
  w.VildaSaveFeedback = Object.freeze({ VERSION: '1', capture: capture, isCurrent: isCurrent,
    pokaz: show, clear: clear, wyczysc: clear, _showFrom: showFrom, _clearSource: clearSource,
    _clearEditedSource: clearEditedSource, _ownsScope: ownsScope,
    _visibleSource: visibleSource, _getEpoch: function () { return epoch; },
    getState: function () { return active ? { visible: true, state: active.element.dataset.state } : { visible: false }; } });
  w.addEventListener('vilda:user-state-cleared', invalidate);
  w.addEventListener('pagehide', invalidate);
  w.addEventListener('pagehide', function () { if (frameObserver) { frameObserver.disconnect(); frameObserver = null; } });
  d.addEventListener('vilda:patient-loaded', function (event) { if (!event.detail || event.detail.source !== 'save') invalidate(); });
  d.addEventListener('vilda:json-imported', invalidate);
  // A newer intentional edit cannot be acknowledged by an older slow save.
  // Programmatic DOB adoption and restoration emit untrusted events and do not
  // advance this revision or cancel a legitimate save of a newly created patient.
  d.addEventListener('input', trustedEdit, true);
  d.addEventListener('change', trustedEdit, true);
  d.addEventListener('vilda:puberty-assessment-changed', function (event) {
    if (event && event.detail && event.detail.reason === 'edit') edited();
  });
  watchVault();
})(typeof window !== 'undefined' ? window : undefined);
