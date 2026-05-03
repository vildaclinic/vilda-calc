(function(global){
  'use strict';

  function normalizeRoute(path){
    const raw = String(path || '/').trim();
    if (!raw) return '/';
    if (raw.startsWith('#')) return raw.slice(1) || '/';
    return raw.startsWith('/') ? raw : ('/' + raw);
  }

  function createRouter(options){
    const opts = options || {};
    const routes = opts.routes || {};
    const onRoute = typeof opts.onRoute === 'function' ? opts.onRoute : function(){};

    function resolveRoute(route){
      const key = normalizeRoute(route);
      const handler = routes[key] || routes['*'] || null;
      return { key: key, handler: handler };
    }

    function navigate(route, meta){
      const resolved = resolveRoute(route);
      try {
        onRoute(resolved.key, resolved.handler, meta || {});
      } catch (_) {}
      return resolved;
    }

    return {
      navigate: navigate,
      resolveRoute: resolveRoute,
      normalizeRoute: normalizeRoute
    };
  }

  function initSpaRouter(options){
    const opts = options || {};
    const enabled = opts.enabled === true || (opts.enabled !== false && global.VILDA_ENABLE_SPA_ROUTER !== false);
    const doc = global.document;
    if (!enabled || !doc) {
      return { enabled: false, reason: enabled ? 'missing-document' : 'disabled-by-flag' };
    }

    const router = createRouter(opts);

    function handleLinkClick(ev){
      try {
        const target = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
        if (!target) return;
        const href = target.getAttribute('href') || '';
        if (!href || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
        if (!href.endsWith('.html') && !href.startsWith('#/')) return;
        ev.preventDefault();
        const route = href.startsWith('#/') ? href.slice(1) : '/' + href.replace(/\.html$/i, '');
        if (global.location && global.location.hash !== '#' + route) {
          global.location.hash = route;
        }
        router.navigate(route, { source: 'click', href: href });
      } catch (_) {}
    }

    function handleHashChange(){
      const route = normalizeRoute((global.location && global.location.hash) ? global.location.hash.slice(1) : '/');
      router.navigate(route, { source: 'hashchange' });
    }

    doc.addEventListener('click', handleLinkClick);
    global.addEventListener('hashchange', handleHashChange);
    handleHashChange();

    return {
      enabled: true,
      navigate: router.navigate,
      dispose: function(){
        try { doc.removeEventListener('click', handleLinkClick); } catch (_) {}
        try { global.removeEventListener('hashchange', handleHashChange); } catch (_) {}
      }
    };
  }

  global.VildaSpaRouter = {
    normalizeRoute: normalizeRoute,
    createRouter: createRouter,
    initSpaRouter: initSpaRouter
  };

  function autoInitDefaultRouter(){
    try {
      if (!global.document) return;
      if (global.__vildaSpaRouterAutoInitDone) return;
      global.__vildaSpaRouterAutoInitDone = true;
      const start = function(){
        const homeView = global.VildaSpaViews && global.VildaSpaViews.Home ? global.VildaSpaViews.Home : null;
        const docproView = global.VildaSpaViews && global.VildaSpaViews.DocPro ? global.VildaSpaViews.DocPro : null;
        let homeMounted = false;
        let docproMounted = false;
        const state = initSpaRouter({
          enabled: global.VILDA_ENABLE_SPA_ROUTER !== false,
          routes: {
            '*': function(){ return true; }
          },
          onRoute: function(route){
            const normalized = normalizeRoute(route);
            const isHome = normalized === '/' || normalized === '/index' || normalized === '/index.html';
            const isDocpro = normalized === '/docpro' || normalized === '/docpro.html';
            if (homeView && isHome && !homeMounted && typeof homeView.mount === 'function') {
              homeView.mount({});
              homeMounted = true;
            }
            if (homeView && !isHome && homeMounted && typeof homeView.unmount === 'function') {
              homeView.unmount({});
              homeMounted = false;
            }
            if (docproView && isDocpro && !docproMounted && typeof docproView.mount === 'function') {
              docproView.mount({});
              docproMounted = true;
            }
            if (docproView && !isDocpro && docproMounted && typeof docproView.unmount === 'function') {
              docproView.unmount({});
              docproMounted = false;
            }
            return true;
          }
        });
        global.__vildaSpaRouterState = state;
      };
      if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', start, { once: true });
      } else {
        start();
      }
    } catch (_) {}
  }

  autoInitDefaultRouter();
})(typeof window !== 'undefined' ? window : globalThis);
