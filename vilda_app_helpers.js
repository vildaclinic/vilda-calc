/* ==========================================================================
 * VildaAppHelpers — mostki pomocnicze app.js
 *
 * Plik wydzielony z app.js w kroku 8B. Zachowuje globalne funkcje:
 * vildaAppOnReady / vildaAppOnLoad / vildaAppSafeInit,
 * vildaAppSetTrustedHtml / vildaAppClearHtml / vildaAppEscapeHtml,
 * vildaLogAppError / vildaLogAppWarn oraz mostki VildaDeps.
 *
 * Nie zmienia logiki klinicznej ani obliczeniowej — tylko przenosi lokalne
 * helpery infrastrukturalne z app.js do osobnego pliku.
 * ========================================================================== */
const VILDA_APP_HELPERS_VERSION = '1.1.0';

// Usunięto document.write – wstawianie roku może być realizowane w HTML (footer) lub poprzez JS w konkretnym elemencie.


/* ============================================================================
 * Vilda app bootstrap bridge
 * ----------------------------------------------------------------------------
 * Używa VildaInit, jeśli jest dostępny, a w razie braku zachowuje kompatybilny
 * fallback. Dzięki temu inicjalizatory w app.js można nazywać, izolować i
 * uruchamiać idempotentnie bez zmiany logiki obliczeń.
 * ========================================================================== */
(function (global) {
  'use strict';
  if (!global) return;
  if (
    global.__vildaAppInitBridge &&
    typeof global.vildaAppOnReady === 'function' &&
    typeof global.vildaAppOnLoad === 'function' &&
    typeof global.vildaAppSafeInit === 'function'
  ) {
    return;
  }
  global.__vildaAppInitBridge = true;

  const fallbackRegistry = Object.create(null);
  let fallbackDomReadyFired = false;
  let fallbackLoadFired = false;

  function getInitApi() {
    try {
      return global.VildaInit || global.vildaInit || null;
    } catch (_) {
      return null;
    }
  }

  function markFallbackDomReady() {
    fallbackDomReadyFired = true;
  }

  function markFallbackLoad() {
    fallbackLoadFired = true;
    markFallbackDomReady();
  }

  function bindFallbackLifecycleMarkers() {
    try {
      if (!global.document) return;
      if (global.document.readyState === 'complete') {
        markFallbackLoad();
        return;
      }
      if (typeof global.document.addEventListener === 'function') {
        global.document.addEventListener('DOMContentLoaded', markFallbackDomReady, { once: true });
      }
      if (typeof global.addEventListener === 'function') {
        global.addEventListener('load', markFallbackLoad, { once: true, passive: true });
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 81 });
    }
  }
  }

  bindFallbackLifecycleMarkers();

  function emitInitError(name, phase, error) {
    try {
      if (typeof global.CustomEvent === 'function' && typeof global.dispatchEvent === 'function') {
        global.dispatchEvent(new CustomEvent('vilda:init-error', {
          detail: {
            name: String(name || 'app:init'),
            phase: phase || 'init',
            error: {
              name: error && error.name ? error.name : 'Error',
              message: error && error.message ? error.message : String(error || 'Unknown error'),
              stack: error && error.stack ? error.stack : ''
            },
            timestamp: Date.now()
          }
        }));
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 102 });
    }
  }

    try {
      const logger = global.VildaLogger || global.vildaLogger || null;
      if (logger && typeof logger.error === 'function') {
        logger.error('app:init', 'Błąd inicjalizacji app.js: ' + String(name || 'anonymous'), error, {
          initName: String(name || 'anonymous'),
          phase: phase || 'init'
        });
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 112 });
    }
  }

    try {
      if (global.__VILDA_DEBUG === true && global.console && typeof global.console.warn === 'function') {
        global.console.warn('[app:init] ' + String(name || 'anonymous') + ' failed during ' + (phase || 'init'), error);
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 118 });
    }
  }
  }

  function safeInit(name, fn, options) {
    const key = String(name || 'app:anonymous-init');
    const opts = options || {};
    const api = getInitApi();
    if (api && typeof api.safeInit === 'function') {
      return api.safeInit(key, fn, opts);
    }

    const once = opts.once !== false;
    if (once && fallbackRegistry[key]) return undefined;
    if (typeof fn !== 'function') return opts.fallback;
    fallbackRegistry[key] = true;

    try {
      return fn();
    } catch (error) {
      emitInitError(key, opts.phase || 'init', error);
      return opts.fallback;
    }
  }

  function onReady(name, fn, options) {
    const key = String(name || 'app:anonymous-ready-init');
    const opts = options || {};
    const api = getInitApi();
    if (api && typeof api.onReady === 'function') {
      return api.onReady(key, fn, opts);
    }

    const run = function () {
      return safeInit(key, fn, opts);
    };

    try {
      if (!global.document || fallbackDomReadyFired || global.document.readyState === 'complete') {
        markFallbackDomReady();
        return run();
      }
      if (typeof global.document.addEventListener === 'function') {
        global.document.addEventListener('DOMContentLoaded', run, { once: true });
      }
      return undefined;
    } catch (error) {
      emitInitError(key, 'ready-bind', error);
      return run();
    }
  }

  function onLoad(name, fn, options) {
    const key = String(name || 'app:anonymous-load-init');
    const opts = options || {};
    const api = getInitApi();
    if (api && typeof api.onLoad === 'function') {
      return api.onLoad(key, fn, opts);
    }

    const run = function () {
      return safeInit(key, fn, opts);
    };

    try {
      if (fallbackLoadFired || (global.document && global.document.readyState === 'complete')) {
        markFallbackLoad();
        return run();
      }
      if (typeof global.addEventListener === 'function') {
        global.addEventListener('load', run, { once: true, passive: true });
      }
      return undefined;
    } catch (error) {
      emitInitError(key, 'load-bind', error);
      return run();
    }
  }

  global.vildaAppSafeInit = safeInit;
  global.vildaAppOnReady = onReady;
  global.vildaAppOnLoad = onLoad;

  // Turbo Drive (Etap 2 — 2025-05): przed nawigacją bez reloadu czyścimy
  // rejestr `fallbackRegistry`, żeby wywołane ponownie `vildaAppOnReady` /
  // `vildaAppSafeInit` na nowej stronie faktycznie odpaliło fn (zamiast
  // wyjść early-return przez "once" guard). Bez tego listenery na elementach
  // takich jak `#resultsModeToggle` po Turbo-nav byłyby na elementach z
  // poprzedniego body, które już nie istnieją.
  if (global.document && typeof global.document.addEventListener === 'function') {
    global.document.addEventListener('turbo:before-visit', function () {
      try {
        Object.keys(fallbackRegistry).forEach(function (k) {
          delete fallbackRegistry[k];
        });
      } catch (_) { /* noop */ }
    });
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

/* ============================================================================
 * Vilda app HTML rendering bridge
 * ----------------------------------------------------------------------------
 * Małe lokalne wrappery na VildaHtml: rozdzielają kontrolowany markup od
 * czyszczenia elementów i pozwalają zachować fallback, jeśli helper nie
 * został załadowany.
 * ========================================================================== */
function vildaAppHtmlApi() {
  try {
    if (typeof window !== 'undefined' && window.VildaHtml) return window.VildaHtml;
    if (typeof globalThis !== 'undefined' && globalThis.VildaHtml) return globalThis.VildaHtml;
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { helper: 'vildaAppHtmlApi' });
    }
  }
  return null;
}

function vildaAppSetTrustedHtml(element, markup, context) {
  if (!element) return false;
  const html = markup == null ? '' : String(markup);
  try {
    const api = vildaAppHtmlApi();
    if (api && typeof api.setTrustedHtml === 'function') {
      return api.setTrustedHtml(element, html, { context: context || 'app:trusted-markup' });
    }
    element.textContent = html;
    return true;
  } catch (error) {
    if (typeof vildaLogAppWarn === 'function') {
      vildaLogAppWarn('app:html', 'Nie udało się ustawić kontrolowanego HTML.', {
        context: context || '',
        error: error && error.message ? error.message : String(error || '')
      });
    }
    return false;
  }
}

function vildaAppSetEscapedHtml(element, value, context) {
  if (!element) return false;
  try {
    const api = vildaAppHtmlApi();
    if (api && typeof api.setEscapedHtml === 'function') {
      return api.setEscapedHtml(element, value, { context: context || 'app:escaped-text' });
    }
    const escaped = String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/\r\n|\r|\n/g, '<br>');
    element.textContent = String(value == null ? '' : value);
    return true;
  } catch (error) {
    if (typeof vildaLogAppWarn === 'function') {
      vildaLogAppWarn('app:html', 'Nie udało się ustawić escapowanego tekstu.', {
        context: context || '',
        error: error && error.message ? error.message : String(error || '')
      });
    }
    return false;
  }
}

function vildaAppClearHtml(element) {
  if (!element) return false;
  try {
    const api = vildaAppHtmlApi();
    if (api && typeof api.clearHtml === 'function') return api.clearHtml(element);
    element.textContent = '';
    return true;
  } catch (error) {
    try { element.textContent = ''; } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', _, { helper: 'vildaAppClearHtml:fallback' });
      }
    }
    return false;
  }
}

function vildaAppHasHtmlContent(element) {
  if (!element) return false;
  try {
    const api = vildaAppHtmlApi();
    if (api && typeof api.hasHtmlContent === 'function') return api.hasHtmlContent(element);
    return !!String(element.textContent || '').trim();
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { helper: 'vildaAppHasHtmlContent' });
    }
    return false;
  }
}

function vildaAppEscapeHtml(value) {
  try {
    const api = vildaAppHtmlApi();
    if (api && typeof api.escapeHtml === 'function') return api.escapeHtml(value);
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { helper: 'vildaAppEscapeHtml' });
    }
  }
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function vildaAppEscapeAttr(value) {
  try {
    const api = vildaAppHtmlApi();
    if (api && typeof api.escapeAttr === 'function') return api.escapeAttr(value);
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { helper: 'vildaAppEscapeAttr' });
    }
  }
  return vildaAppEscapeHtml(value).replace(/`/g, '&#96;');
}

function vildaAppRestoreClonedChildren(element, snapshots, context) {
  if (!element || !Array.isArray(snapshots)) return false;
  try {
    const api = vildaAppHtmlApi();
    if (api && typeof api.restoreClonedChildren === 'function') {
      return api.restoreClonedChildren(element, snapshots, { context: context || 'app:restore-cloned-children' });
    }
    vildaAppClearHtml(element);
    snapshots.forEach(function (node) {
      if (node && typeof node.cloneNode === 'function') element.appendChild(node.cloneNode(true));
    });
    return true;
  } catch (error) {
    if (typeof vildaLogAppWarn === 'function') {
      vildaLogAppWarn('app:html', 'Nie udało się odtworzyć sklonowanych węzłów DOM.', {
        context: context || '',
        error: error && error.message ? error.message : String(error || '')
      });
    }
    return false;
  }
}

function vildaAppReplaceFirstText(root, needle, replacementNode, context) {
  if (!root || needle == null || !replacementNode) return false;
  try {
    const api = vildaAppHtmlApi();
    if (api && typeof api.replaceFirstText === 'function') {
      return api.replaceFirstText(root, needle, replacementNode, { context: context || 'app:replace-first-text' });
    }
    const doc = root.ownerDocument || document;
    const showText = (typeof NodeFilter !== 'undefined' && NodeFilter.SHOW_TEXT) || 4;
    const walker = doc.createTreeWalker(root, showText);
    const search = String(needle);
    let node;
    while ((node = walker.nextNode())) {
      const value = node.nodeValue || '';
      const index = value.indexOf(search);
      if (index === -1) continue;
      const parent = node.parentNode;
      if (!parent) return false;
      if (index > 0) parent.insertBefore(doc.createTextNode(value.slice(0, index)), node);
      parent.insertBefore(replacementNode.cloneNode(true), node);
      const tail = value.slice(index + search.length);
      if (tail) parent.insertBefore(doc.createTextNode(tail), node);
      parent.removeChild(node);
      return true;
    }
  } catch (error) {
    if (typeof vildaLogAppWarn === 'function') {
      vildaLogAppWarn('app:html', 'Nie udało się zastąpić tekstu w DOM.', {
        context: context || '',
        error: error && error.message ? error.message : String(error || '')
      });
    }
  }
  return false;
}


/* ============================================================================
 * Vilda app diagnostic logger bridge
 * ----------------------------------------------------------------------------
 * Cienka warstwa na potrzeby app.js. Używa VildaLogger, jeśli helper jest
 * załadowany, a w razie braku działa bez skutków ubocznych.
 * ========================================================================== */
function vildaLogAppError(moduleName, message, error, meta, options) {
  try {
    const logger = (typeof window !== 'undefined') ? (window.VildaLogger || window.vildaLogger || null) : null;
    if (logger && typeof logger.error === 'function') {
      return logger.error(moduleName || 'app', message || 'Błąd app.js', error, meta || null, options || {});
    }
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 213 });
    }
  }
  try {
    if (typeof window !== 'undefined' && window.__VILDA_DEBUG === true && window.console && typeof window.console.warn === 'function') {
      window.console.warn('[app][' + String(moduleName || 'app') + '] ' + String(message || 'Błąd app.js'), error || '');
    }
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 218 });
    }
  }
  return null;
}

function vildaLogAppWarn(moduleName, message, error, meta, options) {
  try {
    const logger = (typeof window !== 'undefined') ? (window.VildaLogger || window.vildaLogger || null) : null;
    if (logger && typeof logger.warn === 'function') {
      return logger.warn(moduleName || 'app', message || 'Ostrzeżenie app.js', error || null, meta || null, options || {});
    }
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 228 });
    }
  }
  return null;
}

/* ============================================================================
 * Vilda dependency bridge for app.js
 * ----------------------------------------------------------------------------
 * Bezpieczne pobieranie zależności globalnych. Używa VildaDeps, jeśli helper
 * został załadowany, a w razie braku zachowuje lokalny fallback bez zmiany
 * logiki obliczeniowej.
 * ========================================================================== */
function vildaResolveGlobalDependency(path) {
  const normalized = String(path || '').trim();
  if (!normalized) return undefined;
  try {
    const deps = (typeof window !== 'undefined') ? (window.VildaDeps || window.vildaDeps || null) : null;
    if (deps && typeof deps.get === 'function') {
      return deps.get(normalized);
    }
  } catch (error) {
    vildaLogAppWarn('app:deps', 'Nie udało się pobrać zależności przez VildaDeps', error, { path: normalized });
  }

  try {
    const root = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
    if (!root) return undefined;
    return normalized.split('.').reduce(function (cursor, part) {
      return cursor == null ? undefined : cursor[part];
    }, root);
  } catch (error) {
    vildaLogAppWarn('app:deps', 'Nie udało się rozwiązać zależności globalnej przez fallback', error, { path: normalized });
    return undefined;
  }
}

function vildaWarnMissingGlobalDependency(path, moduleName, details) {
  const normalized = String(path || '').trim();
  const context = String(moduleName || 'app').trim() || 'app';
  const info = details || {};
  try {
    const deps = (typeof window !== 'undefined') ? (window.VildaDeps || window.vildaDeps || null) : null;
    if (deps && typeof deps.warnMissing === 'function') {
      deps.warnMissing(normalized, context, info);
      return;
    }
  } catch (error) {
    vildaLogAppWarn('app:deps', 'Nie udało się zgłosić brakującej zależności przez VildaDeps', error, { path: normalized, moduleName: context });
  }

  try {
    if (typeof window !== 'undefined' && typeof window.CustomEvent === 'function' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('vilda:dependency-missing', {
        detail: {
          name: normalized,
          moduleName: context,
          expectedType: info.type || info.expectedType || 'any',
          actualType: info.actualType || 'undefined',
          message: info.message || ('Brak wymaganej zależności globalnej: ' + normalized),
          timestamp: Date.now()
        }
      }));
    }
  } catch (error) {
    vildaLogAppWarn('app:deps', 'Nie udało się wysłać fallbackowego zdarzenia vilda:dependency-missing', error, { path: normalized, moduleName: context });
  }

  try {
    if (typeof window !== 'undefined' && window.__VILDA_DEBUG === true && window.console && typeof window.console.warn === 'function') {
      window.console.warn('[VildaDeps:fallback] Brak wymaganej zależności globalnej: ' + normalized + ' [' + context + ']');
    }
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 298 });
    }
  }
}


function vildaShowDependencyFallbackNotice(message, options) {
  const text = String(message || '').trim();
  const opts = options || {};
  if (!text || opts.showUi === false || opts.show === false) return false;

  try {
    const target = opts.statusElement || opts.statusTarget || null;
    let el = null;
    if (target && typeof document !== 'undefined') {
      if (target.nodeType === 1) el = target;
      else if (typeof target === 'string') {
        try { el = document.getElementById(target) || document.querySelector(target); } catch (error) { vildaLogAppWarn('app:deps-ui', 'Nie udało się znaleźć elementu statusu zależności', error, { target }); el = null; }
      }
    }
    if (el) {
      el.textContent = text;
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      try {
        const root = document.documentElement;
        const computed = window.getComputedStyle ? window.getComputedStyle(root) : null;
        el.style.color = (computed && computed.getPropertyValue('--danger')) || '#d32f2f';
      } catch (error) {
        vildaLogAppWarn('app:deps-ui', 'Nie udało się odczytać stylu komunikatu zależności', error);
        el.style.color = '#d32f2f';
      }
      if (opts.statusOnly === true) return true;
    }
  } catch (error) {
    vildaLogAppWarn('app:deps-ui', 'Nie udało się wpisać komunikatu zależności do elementu statusu', error, { message: text });
  }

  try {
    if (typeof window !== 'undefined' && typeof window.vildaShowDependencyNotice === 'function') {
      window.vildaShowDependencyNotice(text, opts);
      return true;
    }
  } catch (error) {
    vildaLogAppWarn('app:deps-ui', 'Nie udało się pokazać komunikatu przez vildaShowDependencyNotice', error, { message: text });
  }

  try {
    if (typeof patientReportShowToast === 'function') {
      patientReportShowToast(text);
      return true;
    }
  } catch (error) {
    vildaLogAppWarn('app:deps-ui', 'Nie udało się pokazać komunikatu zależności przez toast raportu', error, { message: text });
  }

  try {
    if (typeof document !== 'undefined' && document.body) {
      const box = document.createElement('div');
      box.setAttribute('role', 'status');
      box.setAttribute('aria-live', 'polite');
      box.textContent = text;
      box.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:min(420px,calc(100vw - 32px));background:#fff;color:#2f3137;border:1px solid rgba(211,47,47,.28);border-left:4px solid #d32f2f;border-radius:14px;box-shadow:0 18px 45px rgba(0,0,0,.16);padding:12px 14px;font:500 14px/1.4 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;';
      document.body.appendChild(box);
      setTimeout(function () { try { box.remove(); } catch (error) { vildaLogAppWarn('app:deps-ui', 'Nie udało się usunąć komunikatu zależności', error); } }, 9000);
      return true;
    }
  } catch (error) {
    vildaLogAppWarn('app:deps-ui', 'Nie udało się utworzyć fallbackowego komunikatu zależności', error, { message: text });
  }

  return false;
}

function vildaRequireGlobalFunction(path, moduleName, options) {
  const opts = options || {};
  try {
    const deps = (typeof window !== 'undefined') ? (window.VildaDeps || window.vildaDeps || null) : null;
    if (deps && typeof deps.requireFunction === 'function') {
      return deps.requireFunction(path, Object.assign({ moduleName: moduleName || 'app' }, opts));
    }
  } catch (error) {
    vildaLogAppWarn('app:deps', 'Nie udało się pobrać funkcji globalnej przez VildaDeps', error, { path, moduleName: moduleName || 'app' });
  }

  const value = vildaResolveGlobalDependency(path);
  if (typeof value === 'function') return value;
  if (!opts.silent) {
    vildaWarnMissingGlobalDependency(path, moduleName || 'app', {
      type: 'function',
      actualType: value === null ? 'null' : typeof value,
      message: opts.message
    });
  }
  return Object.prototype.hasOwnProperty.call(opts, 'fallback') ? opts.fallback : null;
}

function vildaRequireGlobalObject(path, moduleName, options) {
  const opts = options || {};
  try {
    const deps = (typeof window !== 'undefined') ? (window.VildaDeps || window.vildaDeps || null) : null;
    if (deps && typeof deps.requireObject === 'function') {
      return deps.requireObject(path, Object.assign({ moduleName: moduleName || 'app' }, opts));
    }
  } catch (error) {
    vildaLogAppWarn('app:deps', 'Nie udało się pobrać obiektu globalnego przez VildaDeps', error, { path, moduleName: moduleName || 'app' });
  }

  const value = vildaResolveGlobalDependency(path);
  if (value && typeof value === 'object') return value;
  if (!opts.silent) {
    vildaWarnMissingGlobalDependency(path, moduleName || 'app', {
      type: 'object',
      actualType: value === null ? 'null' : typeof value,
      message: opts.message
    });
  }
  return Object.prototype.hasOwnProperty.call(opts, 'fallback') ? opts.fallback : null;
}

function vildaCheckGlobalDependencyContract(moduleName, options) {
  const name = String(moduleName || '').trim();
  const opts = options || {};
  if (!name) return { ok: true, moduleName: name, contractFound: false, missingRequired: [], missingOptional: [] };
  try {
    const deps = (typeof window !== 'undefined') ? (window.VildaDeps || window.vildaDeps || null) : null;
    if (deps && typeof deps.checkModuleDeps === 'function') {
      return deps.checkModuleDeps(name, Object.assign({ silent: opts.silent === true }, opts));
    }
  } catch (error) {
    vildaLogAppError('app:dependency-contract', 'Nie udało się sprawdzić kontraktu zależności', error, { moduleName: name });
    try { vildaWarnMissingGlobalDependency(name, 'dependency-contract', { type: 'contract-check', actualType: 'error', message: error && error.message }); } catch (nestedError) { vildaLogAppWarn('app:dependency-contract', 'Nie udało się zgłosić błędu kontraktu zależności', nestedError, { moduleName: name }); }
  }
  return { ok: true, moduleName: name, contractFound: false, missingRequired: [], missingOptional: [], fallback: true };
}

function vildaEnsureGlobalDependencyContract(moduleName, options) {
  const opts = options || {};
  const result = vildaCheckGlobalDependencyContract(moduleName, opts);
  if (result && result.ok === false) {
    const missing = (result.missingRequired || []).map(function (dep) { return dep.path || dep.name; }).filter(Boolean);
    let message = opts.message || ('Brakuje zależności wymaganych przez moduł: ' + moduleName + (missing.length ? ' (' + missing.join(', ') + ')' : ''));

    const shouldShowUi = opts.showUi === true || (opts.showUi !== false && opts.silent !== true && opts.notify !== false);
    try {
      const deps = (typeof window !== 'undefined') ? (window.VildaDeps || window.vildaDeps || null) : null;
      if (shouldShowUi && deps && typeof deps.notifyMissingDependencies === 'function') {
        const notified = deps.notifyMissingDependencies(result, Object.assign({}, opts, { message: opts.message || message }));
        if (notified && notified.userMessage) message = notified.userMessage;
      } else if (shouldShowUi) {
        vildaShowDependencyFallbackNotice(message, opts);
      }
    } catch (error) {
      vildaLogAppError('app:dependency-contract', 'Nie udało się pokazać komunikatu o brakujących zależnościach', error, { moduleName });
      try { if (shouldShowUi) vildaShowDependencyFallbackNotice(message, opts); } catch (nestedError) { vildaLogAppWarn('app:dependency-contract', 'Fallback komunikatu zależności też się nie powiódł', nestedError, { moduleName }); }
    }

    if (opts.throwOnMissing !== false) {
      const error = new Error(message);
      error.name = 'VildaDependencyError';
      error.vildaDependencyError = true;
      error.vildaDependencyResult = result;
      throw error;
    }
  }
  return result;
}

function vildaRunCriticalDependencyDiagnostics() {
  try {
    const deps = (typeof window !== 'undefined') ? (window.VildaDeps || window.vildaDeps || null) : null;
    if (!deps) return null;
    if (typeof deps.getDependencyStatus === 'function') {
      return deps.getDependencyStatus({ silent: true });
    }
    const critical = typeof deps.checkCriticalDependencies === 'function' ? deps.checkCriticalDependencies({ silent: true }) : null;
    const order = typeof deps.checkScriptOrder === 'function' ? deps.checkScriptOrder({ silent: true }) : null;
    return { critical, order };
  } catch (error) {
    vildaLogAppError('app:dependency-diagnostics', 'Nie udało się wykonać diagnostyki krytycznych zależności', error);
    try { vildaWarnMissingGlobalDependency('critical-dependency-diagnostics', 'app', { type: 'diagnostics', actualType: 'error', message: error && error.message }); } catch (nestedError) { vildaLogAppWarn('app:dependency-diagnostics', 'Nie udało się zgłosić błędu diagnostyki zależności', nestedError); }
    return null;
  }
}

try {
  if (typeof window !== 'undefined' && typeof window.vildaAppOnLoad === 'function') {
    window.vildaAppOnLoad('app:critical-dependency-diagnostics', vildaRunCriticalDependencyDiagnostics);
  }
} catch (error) {
  vildaLogAppWarn('app:dependency-diagnostics', 'Nie udało się zarejestrować diagnostyki zależności po load', error);
}


/* ============================================================================
 * Fetch timeout helpers — krok 8O-11d
 * ----------------------------------------------------------------------------
 * Wspólny, mały wrapper dla zasobów pobieranych przez fetch. Rozróżnia timeout,
 * błąd HTTP, błąd sieci oraz błąd parsowania JSON. Gdy AbortController jest
 * dostępny, timeout aktywnie przerywa request i czyści timer w finally.
 * ========================================================================== */
function vildaCloneFetchInitWithoutMeta(options) {
  const source = options || {};
  const init = {};
  Object.keys(source).forEach(function (key) {
    if (key === 'timeoutMs' || key === 'context' || key === 'parseAs') return;
    init[key] = source[key];
  });
  return init;
}

function vildaNormalizeFetchTimeoutMs(value, fallback) {
  const num = Number(value);
  if (Number.isFinite(num) && num > 0) return Math.max(1, Math.floor(num));
  const fallbackNum = Number(fallback);
  return Number.isFinite(fallbackNum) && fallbackNum > 0 ? Math.max(1, Math.floor(fallbackNum)) : 10000;
}

function vildaBuildFetchUrlLabel(input) {
  try {
    if (typeof input === 'string') return input;
    if (input && input.url) return String(input.url);
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('vilda_app_helpers.js', _, { step: '8O-11d', helper: 'vildaBuildFetchUrlLabel' });
    }
  }
  return '';
}

function vildaCreateFetchError(name, code, message, meta, cause) {
  const error = new Error(message || code || 'Vilda fetch error');
  error.name = name || 'VildaFetchError';
  error.code = code || 'VILDA_FETCH_ERROR';
  error.vildaFetchError = true;
  error.vildaFetchMeta = meta || {};
  if (cause) {
    try { error.cause = cause; } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('vilda_app_helpers.js', _, { step: '8O-11d', helper: 'vildaCreateFetchError' });
      }
    }
  }
  return error;
}

function vildaClassifyFetchFailure(error, meta, didTimeout) {
  const name = error && error.name ? String(error.name) : '';
  if (didTimeout || name === 'AbortError') {
    return vildaCreateFetchError(
      'VildaFetchTimeoutError',
      'VILDA_FETCH_TIMEOUT',
      'Timeout pobierania zasobu' + (meta && meta.url ? ': ' + meta.url : '') + '.',
      meta,
      error
    );
  }
  if (error && error.vildaFetchError) return error;
  return vildaCreateFetchError(
    'VildaFetchNetworkError',
    'VILDA_FETCH_NETWORK_ERROR',
    'Błąd sieci podczas pobierania zasobu' + (meta && meta.url ? ': ' + meta.url : '') + '.',
    meta,
    error
  );
}

async function vildaFetchWithTimeout(input, options) {
  const opts = options || {};
  const timeoutMs = vildaNormalizeFetchTimeoutMs(opts.timeoutMs, 10000);
  const meta = {
    step: '8O-11d',
    context: opts.context || 'vilda-fetch-with-timeout',
    timeoutMs: timeoutMs,
    url: vildaBuildFetchUrlLabel(input),
    abortControllerAvailable: typeof AbortController !== 'undefined'
  };

  if (typeof fetch !== 'function') {
    throw vildaCreateFetchError('VildaFetchUnavailableError', 'VILDA_FETCH_UNAVAILABLE', 'Fetch API nie jest dostępne.', meta);
  }

  const init = vildaCloneFetchInitWithoutMeta(opts);
  let controller = null;
  let timeoutId = null;
  let didTimeout = false;

  try {
    if (timeoutMs > 0 && typeof AbortController !== 'undefined') {
      controller = new AbortController();
      const inputSignal = init.signal;
      if (inputSignal && typeof inputSignal.addEventListener === 'function') {
        if (inputSignal.aborted) {
          try { controller.abort(); } catch (_) {
            if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
              globalThis.vildaLogSwallowedCatch('vilda_app_helpers.js', _, { step: '8O-11d', helper: 'vildaFetchWithTimeout:abort-existing-signal' });
            }
          }
        } else {
          inputSignal.addEventListener('abort', function () {
            try { controller.abort(); } catch (_) {
              if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
                globalThis.vildaLogSwallowedCatch('vilda_app_helpers.js', _, { step: '8O-11d', helper: 'vildaFetchWithTimeout:abort-linked-signal' });
              }
            }
          }, { once: true });
        }
      }
      init.signal = controller.signal;
      timeoutId = setTimeout(function () {
        didTimeout = true;
        try { controller.abort(); } catch (_) {
          if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
            globalThis.vildaLogSwallowedCatch('vilda_app_helpers.js', _, { step: '8O-11d', helper: 'vildaFetchWithTimeout:abort-timeout' });
          }
        }
      }, timeoutMs);
    }

    const response = await fetch(input, init);
    if (!response || response.ok !== true) {
      throw vildaCreateFetchError(
        'VildaFetchHttpError',
        'VILDA_FETCH_HTTP_ERROR',
        'Błąd HTTP podczas pobierania zasobu' + (meta.url ? ': ' + meta.url : '') + '.',
        Object.assign({}, meta, {
          status: response && typeof response.status !== 'undefined' ? response.status : null,
          statusText: response && response.statusText ? String(response.statusText) : ''
        })
      );
    }
    return response;
  } catch (error) {
    throw vildaClassifyFetchFailure(error, meta, didTimeout);
  } finally {
    if (timeoutId !== null) {
      try { clearTimeout(timeoutId); } catch (_) {
        if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
          globalThis.vildaLogSwallowedCatch('vilda_app_helpers.js', _, { step: '8O-11d', helper: 'vildaFetchWithTimeout:clearTimeout' });
        }
      }
    }
  }
}

async function vildaFetchJsonWithTimeout(input, options) {
  const opts = options || {};
  const response = await vildaFetchWithTimeout(input, Object.assign({ context: 'vilda-fetch-json-with-timeout' }, opts));
  const meta = {
    step: '8O-11d',
    context: opts.context || 'vilda-fetch-json-with-timeout',
    timeoutMs: vildaNormalizeFetchTimeoutMs(opts.timeoutMs, 10000),
    url: vildaBuildFetchUrlLabel(input),
    parser: 'json'
  };
  try {
    return await response.json();
  } catch (error) {
    throw vildaCreateFetchError(
      'VildaFetchJsonParseError',
      'VILDA_FETCH_JSON_PARSE_ERROR',
      'Błąd parsowania JSON pobranego zasobu' + (meta.url ? ': ' + meta.url : '') + '.',
      meta,
      error
    );
  }
}

async function vildaFetchArrayBufferWithTimeout(input, options) {
  const opts = options || {};
  const response = await vildaFetchWithTimeout(input, Object.assign({ context: 'vilda-fetch-arraybuffer-with-timeout' }, opts));
  return response.arrayBuffer();
}

async function vildaFetchBlobWithTimeout(input, options) {
  const opts = options || {};
  const response = await vildaFetchWithTimeout(input, Object.assign({ context: 'vilda-fetch-blob-with-timeout' }, opts));
  return response.blob();
}

if (typeof window !== 'undefined') {
  window.VildaAppHelpers = Object.freeze({
    VERSION: VILDA_APP_HELPERS_VERSION,
    htmlApi: vildaAppHtmlApi,
    setTrustedHtml: vildaAppSetTrustedHtml,
    setEscapedHtml: vildaAppSetEscapedHtml,
    clearHtml: vildaAppClearHtml,
    hasHtmlContent: vildaAppHasHtmlContent,
    escapeHtml: vildaAppEscapeHtml,
    escapeAttr: vildaAppEscapeAttr,
    restoreClonedChildren: vildaAppRestoreClonedChildren,
    replaceFirstText: vildaAppReplaceFirstText,
    logError: vildaLogAppError,
    logWarn: vildaLogAppWarn,
    resolveDependency: vildaResolveGlobalDependency,
    warnMissingDependency: vildaWarnMissingGlobalDependency,
    showDependencyFallbackNotice: vildaShowDependencyFallbackNotice,
    requireFunction: vildaRequireGlobalFunction,
    requireObject: vildaRequireGlobalObject,
    checkDependencyContract: vildaCheckGlobalDependencyContract,
    ensureDependencyContract: vildaEnsureGlobalDependencyContract,
    runCriticalDependencyDiagnostics: vildaRunCriticalDependencyDiagnostics,
    fetchWithTimeout: vildaFetchWithTimeout,
    fetchJsonWithTimeout: vildaFetchJsonWithTimeout,
    fetchArrayBufferWithTimeout: vildaFetchArrayBufferWithTimeout,
    fetchBlobWithTimeout: vildaFetchBlobWithTimeout
  });
  window.vildaAppHelpers = window.VildaAppHelpers;
  window.vildaFetchWithTimeout = vildaFetchWithTimeout;
  window.vildaFetchJsonWithTimeout = vildaFetchJsonWithTimeout;
  window.vildaFetchArrayBufferWithTimeout = vildaFetchArrayBufferWithTimeout;
  window.vildaFetchBlobWithTimeout = vildaFetchBlobWithTimeout;
  window.vildaAppHelpersVersion = function () { return VILDA_APP_HELPERS_VERSION; };
}
