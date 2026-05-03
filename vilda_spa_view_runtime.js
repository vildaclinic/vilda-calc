(function(global){
  'use strict';

  const lifecycleRegistry = Object.create(null);

  function getRoot(doc, viewName){
    const d = doc || global.document;
    if (!d || !viewName) return null;
    return d.querySelector('[data-spa-view="' + viewName + '"]');
  }

  function setVisible(el, visible){
    if (!el) return false;
    if (visible) {
      el.removeAttribute('hidden');
      el.setAttribute('aria-hidden', 'false');
    } else {
      el.setAttribute('hidden', 'hidden');
      el.setAttribute('aria-hidden', 'true');
    }
    return true;
  }

  function registerViewLifecycle(viewName, hooks){
    if (!viewName || !hooks || typeof hooks !== 'object') return false;
    lifecycleRegistry[viewName] = {
      onMount: typeof hooks.onMount === 'function' ? hooks.onMount : null,
      onUnmount: typeof hooks.onUnmount === 'function' ? hooks.onUnmount : null
    };
    return true;
  }

  function runHook(viewName, hookName, context){
    const entry = lifecycleRegistry[viewName];
    const fn = entry && entry[hookName];
    if (typeof fn !== 'function') return;
    try { fn(context || {}); } catch (_) {}
  }

  function emitLifecycleEvent(doc, type, detail){
    const d = doc || global.document;
    if (!d || typeof d.dispatchEvent !== 'function' || typeof global.CustomEvent !== 'function') return;
    try { d.dispatchEvent(new CustomEvent(type, { detail: detail || {} })); } catch (_) {}
  }

  function mountView(viewName, options){
    const root = getRoot(options && options.doc, viewName);
    if (!root) return { ok: false, reason: 'missing-view-root', view: viewName };
    setVisible(root, true);
    const context = { view: viewName, root: root, options: options || {} };
    runHook(viewName, 'onMount', context);
    emitLifecycleEvent(options && options.doc, 'vilda:spa:view-enter', context);
    return { ok: true, view: viewName };
  }

  function unmountView(viewName, options){
    const root = getRoot(options && options.doc, viewName);
    if (!root) return { ok: false, reason: 'missing-view-root', view: viewName };
    setVisible(root, false);
    const context = { view: viewName, root: root, options: options || {} };
    runHook(viewName, 'onUnmount', context);
    emitLifecycleEvent(options && options.doc, 'vilda:spa:view-leave', context);
    return { ok: true, view: viewName };
  }

  global.VildaSpaViewRuntime = {
    getRoot: getRoot,
    mountView: mountView,
    unmountView: unmountView,
    registerViewLifecycle: registerViewLifecycle
  };
})(typeof window !== 'undefined' ? window : globalThis);
