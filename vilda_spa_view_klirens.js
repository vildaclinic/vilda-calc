(function(global){
  'use strict';

  function resolveRoot(doc){
    const d = doc || global.document;
    if (!d) return null;
    return d.getElementById('app') || d.body || null;
  }

  let detachKlirensLifecycle = null;

  function ensureLifecycleRegistered(){
    const runtime = global.VildaSpaViewRuntime;
    if (!runtime || typeof runtime.registerViewLifecycle !== 'function') return;
    if (detachKlirensLifecycle) return;
    runtime.registerViewLifecycle('klirens', {
      onMount: function(ctx){
        const doc = (ctx && ctx.options && ctx.options.doc) || global.document;
        if (!doc) return;
        const onEsc = function(ev){
          if (!ev || ev.key !== 'Escape') return;
          const toggle = doc.getElementById('navToggle');
          if (toggle) toggle.checked = false;
        };
        doc.addEventListener('keydown', onEsc);
        detachKlirensLifecycle = function(){
          try { doc.removeEventListener('keydown', onEsc); } catch (_) {}
          detachKlirensLifecycle = null;
        };
      },
      onUnmount: function(){
        if (detachKlirensLifecycle) detachKlirensLifecycle();
      }
    });
  }

  function mount(options){
    const opts = options || {};
    ensureLifecycleRegistered();
    const runtime = global.VildaSpaViewRuntime;
    if (runtime && typeof runtime.mountView === 'function') {
      return runtime.mountView('klirens', opts);
    }
    const root = resolveRoot(opts.doc);
    if (!root) return { ok: false, reason: 'missing-root' };
    root.setAttribute('data-spa-active-view', 'klirens');
    return { ok: true, view: 'klirens' };
  }

  function unmount(options){
    const opts = options || {};
    const runtime = global.VildaSpaViewRuntime;
    if (runtime && typeof runtime.unmountView === 'function') {
      return runtime.unmountView('klirens', opts);
    }
    const root = resolveRoot(opts.doc);
    if (!root) return { ok: false, reason: 'missing-root' };
    if (root.getAttribute('data-spa-active-view') === 'klirens') {
      root.removeAttribute('data-spa-active-view');
    }
    return { ok: true, view: 'klirens' };
  }

  global.VildaSpaViews = global.VildaSpaViews || {};
  global.VildaSpaViews.Klirens = {
    mount: mount,
    unmount: unmount
  };
})(typeof window !== 'undefined' ? window : globalThis);
