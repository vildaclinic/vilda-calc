(function(global){
  'use strict';

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

  function mountView(viewName, options){
    const root = getRoot(options && options.doc, viewName);
    if (!root) return { ok: false, reason: 'missing-view-root', view: viewName };
    setVisible(root, true);
    return { ok: true, view: viewName };
  }

  function unmountView(viewName, options){
    const root = getRoot(options && options.doc, viewName);
    if (!root) return { ok: false, reason: 'missing-view-root', view: viewName };
    setVisible(root, false);
    return { ok: true, view: viewName };
  }

  global.VildaSpaViewRuntime = {
    getRoot: getRoot,
    mountView: mountView,
    unmountView: unmountView
  };
})(typeof window !== 'undefined' ? window : globalThis);
