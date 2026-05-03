(function(global){
  'use strict';

  function normalizeRoute(path){
    const raw = String(path || '/').trim();
    if (!raw) return '/';
    if (raw.startsWith('#')) return raw.slice(1) || '/';
    return raw.startsWith('/') ? raw : ('/' + raw);
  }


  function sameRoute(a, b){
    return normalizeRoute(a) === normalizeRoute(b);
  }

  function syncActiveSpaLinks(doc, route){
    if (!doc || typeof doc.querySelectorAll !== 'function') return;
    const normalized = normalizeRoute(route);
    const links = doc.querySelectorAll('a[data-spa-link][href]');
    links.forEach(function(link){
      const href = link.getAttribute('href') || '';
      const linkRoute = href.startsWith('#/') ? normalizeRoute(href.slice(1)) : normalizeRoute(href);
      const active = sameRoute(linkRoute, normalized);
      if (active) link.setAttribute('aria-current', 'page');
      else if (link.getAttribute('aria-current') === 'page') link.removeAttribute('aria-current');
    });
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
        const isHashRoute = href.startsWith('#/');
        const isSpaLink = target.hasAttribute('data-spa-link') || (target.dataset && target.dataset.spaLink === 'true');
        if (!isHashRoute && !isSpaLink) return;
        ev.preventDefault();
        const route = href.startsWith('#/') ? href.slice(1) : '/' + href.replace(/\.html$/i, '');
        if (global.location && global.location.hash !== '#' + route) {
          global.location.hash = route;
        }
        router.navigate(route, { source: 'click', href: href });
      } catch (_) {}
    }

    function resolveLocationRoute(){
      if (!global.location) return '/';
      if (global.location.hash && global.location.hash.startsWith('#/')) {
        return normalizeRoute(global.location.hash.slice(1));
      }
      const pathname = normalizeRoute(global.location.pathname || '/');
      return pathname === '/' ? '/index' : pathname;
    }

    function handleHashChange(){
      const route = resolveLocationRoute();
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
        const klirensView = global.VildaSpaViews && global.VildaSpaViews.Klirens ? global.VildaSpaViews.Klirens : null;
        let homeMounted = false;
        let docproMounted = false;
        let klirensMounted = false;
        const state = initSpaRouter({
          enabled: global.VILDA_ENABLE_SPA_ROUTER !== false,
          routes: {
            '*': function(){ return true; }
          },
          onRoute: function(route){
            const normalized = normalizeRoute(route);
            syncActiveSpaLinks(global.document, normalized);
            const isHome = normalized === '/' || normalized === '/index' || normalized === '/index.html';
            const isDocpro = normalized === '/docpro' || normalized === '/docpro.html';
            const isKlirens = normalized === '/kalkulator-klirens' || normalized === '/kalkulator-klirens.html' || normalized === '/klirens';
            const runtime = global.VildaSpaViewRuntime || null;
            const hasHomeRoot = !!(runtime && typeof runtime.getRoot === 'function' && runtime.getRoot(global.document, 'home'));
            const hasDocproRoot = !!(runtime && typeof runtime.getRoot === 'function' && runtime.getRoot(global.document, 'docpro'));
            const hasKlirensRoot = !!(runtime && typeof runtime.getRoot === 'function' && runtime.getRoot(global.document, 'klirens'));

            if (isDocpro && !hasDocproRoot && global.location) { global.location.assign('index.html#/docpro'); return true; }
            if (isKlirens && !hasKlirensRoot && global.location) { global.location.assign('index.html#/kalkulator-klirens'); return true; }

            if (runtime && typeof runtime.unmountView === 'function') {
              if (!isHome && hasHomeRoot) { runtime.unmountView('home', {}); homeMounted = false; }
              if (!isDocpro && hasDocproRoot) { runtime.unmountView('docpro', {}); docproMounted = false; }
              if (!isKlirens && hasKlirensRoot) { runtime.unmountView('klirens', {}); klirensMounted = false; }
            }

            if (homeView && isHome && !homeMounted && typeof homeView.mount === 'function') {
              const mountState = homeView.mount({});
              homeMounted = !mountState || mountState.ok !== false;
            }
            if (homeView && !isHome && homeMounted && typeof homeView.unmount === 'function') {
              homeView.unmount({});
              homeMounted = false;
            }
            if (docproView && isDocpro && !docproMounted && typeof docproView.mount === 'function') {
              const mountState = docproView.mount({});
              docproMounted = !!(mountState && mountState.ok);
            }
            if (docproView && !isDocpro && docproMounted && typeof docproView.unmount === 'function') {
              docproView.unmount({});
              docproMounted = false;
            }
            if (klirensView && isKlirens && !klirensMounted && typeof klirensView.mount === 'function') {
              const mountState = klirensView.mount({});
              klirensMounted = !!(mountState && mountState.ok);
            }
            if (klirensView && !isKlirens && klirensMounted && typeof klirensView.unmount === 'function') {
              klirensView.unmount({});
              klirensMounted = false;
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
