(function(global){
  'use strict';

  function resolveRoot(doc){
    const d = doc || global.document;
    if (!d) return null;
    return d.getElementById('app') || d.body || null;
  }

  function mount(options){
    const opts = options || {};
    const runtime = global.VildaSpaViewRuntime;
    if (runtime && typeof runtime.mountView === 'function') {
      return runtime.mountView('home', opts);
    }
    const root = resolveRoot(opts.doc);
    if (!root) return { ok: false, reason: 'missing-root' };
    root.setAttribute('data-spa-active-view', 'home');
    return { ok: true, view: 'home' };
  }

  function unmount(options){
    const opts = options || {};
    const runtime = global.VildaSpaViewRuntime;
    if (runtime && typeof runtime.unmountView === 'function') {
      return runtime.unmountView('home', opts);
    }
    const root = resolveRoot(opts.doc);
    if (!root) return { ok: false, reason: 'missing-root' };
    if (root.getAttribute('data-spa-active-view') === 'home') {
      root.removeAttribute('data-spa-active-view');
    }
    return { ok: true, view: 'home' };
  }

  global.VildaSpaViews = global.VildaSpaViews || {};
  global.VildaSpaViews.Home = {
    mount: mount,
    unmount: unmount
  };
})(typeof window !== 'undefined' ? window : globalThis);
