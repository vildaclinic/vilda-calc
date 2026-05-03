(function(global){
  'use strict';

  function resolveRoot(doc){
    const d = doc || global.document;
    if (!d) return null;
    return d.getElementById('app') || d.body || null;
  }

  let detachHomeLifecycle = null;

  function ensureLifecycleRegistered(){
    const runtime = global.VildaSpaViewRuntime;
    if (!runtime || typeof runtime.registerViewLifecycle !== 'function') return;
    if (detachHomeLifecycle) return;
    runtime.registerViewLifecycle('home', {
      onMount: function(ctx){
        const doc = (ctx && ctx.options && ctx.options.doc) || global.document;
        if (!doc) return;
        const onEsc = function(ev){
          if (!ev || ev.key !== 'Escape') return;
          const toggle = doc.getElementById('navToggle');
          if (toggle) toggle.checked = false;
        };
        doc.addEventListener('keydown', onEsc);
        detachHomeLifecycle = function(){
          try { doc.removeEventListener('keydown', onEsc); } catch (_) {}
          detachHomeLifecycle = null;
        };
      },
      onUnmount: function(){
        if (detachHomeLifecycle) detachHomeLifecycle();
      }
    });
  }

  function mount(options){
    const opts = options || {};
    ensureLifecycleRegistered();
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
