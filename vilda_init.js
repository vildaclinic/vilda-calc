/*
 * Vilda Init Helper v1.2.1
 *
 * Bezpieczna warstwa inicjalizacji modułów. Ujednolica uruchamianie kodu po
 * DOMContentLoaded/load, ogranicza wielokrotne podpinanie listenerów, izoluje
 * błędy jednego modułu od pozostałych oraz udostępnia diagnostykę kolejności
 * startu z poziomu konsoli.
 */
(function (global) {
  'use strict';

  if (!global) return;
  if (global.VildaInit && global.VildaInit.__vildaInitHelper) {
    return;
  }

  const VERSION = '1.2.1';
  const MAX_TIMELINE_EVENTS = 500;
  const MAX_ERROR_EVENTS = 100;
  const registry = Object.create(null);
  const pendingByDependency = Object.create(null);
  const timeline = [];
  const errors = [];
  let sequence = 0;
  let domReadyFired = false;
  let loadFired = false;

  function now() {
    try {
      return Date.now();
    } catch (_) {
      return 0;
    }
  }

  function getReadyState() {
    try {
      return global.document && global.document.readyState ? global.document.readyState : 'unknown';
    } catch (_) {
      return 'unknown';
    }
  }

  function normalizeName(name) {
    const normalized = String(name || '').trim();
    return normalized || 'anonymous-init';
  }

  function normalizeList(value) {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value.map(normalizeName).filter(Boolean);
    }
    return String(value)
      .split(',')
      .map(normalizeName)
      .filter(Boolean);
  }

  function shouldLog() {
    try {
      if (global.__VILDA_DEBUG === true) return true;
      if (global.localStorage && global.localStorage.getItem('vildaDebug') === '1') return true;
      return /(?:^|[?&])vildaDebug=1(?:&|$)/.test(global.location && global.location.search ? global.location.search : '');
    } catch (_) {
      return false;
    }
  }

  function serializeError(error) {
    if (!error) return { message: 'Unknown error' };
    return {
      name: error.name || 'Error',
      message: error.message || String(error),
      stack: error.stack || ''
    };
  }

  function logInitError(name, phase, error) {
    try {
      const logger = global.VildaLogger || global.vildaLogger || null;
      if (logger && typeof logger.error === 'function') {
        logger.error('vilda-init', 'Błąd inicjalizacji modułu: ' + String(name || 'anonymous'), error, {
          initName: String(name || 'anonymous'),
          phase: phase || 'init',
          readyState: getReadyState()
        });
      }
    } catch (_) {
    void _;
  }
  }

  function compactEntry(entry) {
    if (!entry) return null;
    return {
      name: entry.name,
      attempts: entry.attempts,
      initialized: entry.initialized,
      running: entry.running,
      status: entry.status,
      registeredAt: entry.registeredAt,
      lastRunAt: entry.lastRunAt,
      lastSuccessAt: entry.lastSuccessAt,
      lastDurationMs: entry.lastDurationMs,
      lastPhase: entry.lastPhase,
      lastError: entry.lastError,
      dependencies: entry.dependencies ? entry.dependencies.slice() : []
    };
  }

  function cloneDetail(detail) {
    const out = {};
    Object.keys(detail || {}).forEach(function (key) {
      const value = detail[key];
      out[key] = Array.isArray(value) ? value.slice() : value;
    });
    return out;
  }

  function record(name, event, detail) {
    const item = Object.assign({
      seq: ++sequence,
      timestamp: now(),
      name: normalizeName(name),
      event: event || 'event',
      readyState: getReadyState(),
      domReadyFired: !!domReadyFired,
      loadFired: !!loadFired
    }, cloneDetail(detail || {}));

    timeline.push(item);
    if (timeline.length > MAX_TIMELINE_EVENTS) {
      timeline.splice(0, timeline.length - MAX_TIMELINE_EVENTS);
    }
    return item;
  }

  function emitError(name, phase, error) {
    const detail = {
      name,
      phase: phase || 'init',
      error: serializeError(error),
      timestamp: now(),
      readyState: getReadyState()
    };

    errors.push(detail);
    if (errors.length > MAX_ERROR_EVENTS) {
      errors.splice(0, errors.length - MAX_ERROR_EVENTS);
    }

    record(name, 'error', { phase: detail.phase, errorMessage: detail.error.message });
    logInitError(name, detail.phase, error);

    try {
      if (typeof global.CustomEvent === 'function' && typeof global.dispatchEvent === 'function') {
        global.dispatchEvent(new CustomEvent('vilda:init-error', { detail }));
      }
    } catch (_) {
    void _;
  }

    if (shouldLog() && global.console && typeof global.console.warn === 'function') {
      try {
        global.console.warn('[VildaInit] ' + name + ' failed during ' + detail.phase, error);
      } catch (_) {
    void _;
  }
    }
  }

  function getEntry(name) {
    const key = normalizeName(name);
    if (!registry[key]) {
      registry[key] = {
        name: key,
        attempts: 0,
        initialized: false,
        running: false,
        status: 'new',
        registeredAt: now(),
        lastRunAt: 0,
        lastSuccessAt: 0,
        lastDurationMs: 0,
        lastPhase: '',
        lastError: null,
        dependencies: []
      };
    }
    return registry[key];
  }

  function isInitialized(name) {
    const entry = registry[normalizeName(name)];
    return !!(entry && entry.initialized);
  }

  function unmetDependencies(dependencies) {
    return normalizeList(dependencies).filter(function (dep) {
      return !isInitialized(dep);
    });
  }

  function rememberPending(name, fn, options, missing) {
    const key = normalizeName(name);
    const entry = getEntry(key);
    const deps = normalizeList(missing);
    entry.status = 'waiting';
    entry.dependencies = deps.slice();
    entry.pendingFn = fn;
    entry.pendingOptions = Object.assign({}, options || {}, { __dependencyRetry: true });

    deps.forEach(function (dep) {
      if (!pendingByDependency[dep]) pendingByDependency[dep] = [];
      if (pendingByDependency[dep].indexOf(key) === -1) {
        pendingByDependency[dep].push(key);
      }
    });

    record(key, 'waiting-dependencies', { dependencies: deps });
  }

  function flushPendingForDependency(depName) {
    const dep = normalizeName(depName);
    const names = pendingByDependency[dep] ? pendingByDependency[dep].slice() : [];
    if (!names.length) return;
    pendingByDependency[dep] = [];

    names.forEach(function (name) {
      const entry = registry[name];
      if (!entry || !entry.pendingFn) return;
      const opts = entry.pendingOptions || {};
      const deps = normalizeList(opts.after || opts.dependsOn || opts.requires || entry.dependencies);
      const missing = unmetDependencies(deps);
      if (missing.length) {
        rememberPending(name, entry.pendingFn, opts, missing);
        return;
      }
      const fn = entry.pendingFn;
      entry.pendingFn = null;
      entry.pendingOptions = null;
      safeInit(name, fn, opts);
    });
  }

  function flushAllPending() {
    Object.keys(registry).forEach(function (name) {
      if (isInitialized(name)) {
        flushPendingForDependency(name);
      }
    });
  }

  function safeInit(name, fn, options) {
    const key = normalizeName(name);
    const opts = options || {};
    const once = opts.once !== false;
    const entry = getEntry(key);
    const dependencies = normalizeList(opts.after || opts.dependsOn || opts.requires);

    if (dependencies.length) {
      entry.dependencies = dependencies.slice();
      const missing = unmetDependencies(dependencies);
      if (missing.length) {
        if (opts.deferUntilDependencies === false || opts.deferUntilDeps === false) {
          record(key, 'dependencies-missing-ignored', { dependencies: missing });
        } else {
          rememberPending(key, fn, opts, missing);
          return opts.fallback;
        }
      }
    }

    if (once && entry.initialized) {
      record(key, 'skipped-already-initialized', { phase: opts.phase || 'init' });
      return entry.value;
    }
    if (once && entry.running) {
      record(key, 'skipped-currently-running', { phase: opts.phase || 'init' });
      return entry.value;
    }

    if (typeof fn !== 'function') {
      entry.status = 'missing-callback';
      record(key, 'missing-callback', { phase: opts.phase || 'init' });
      return opts.fallback;
    }

    const startedAt = now();
    entry.running = true;
    entry.status = 'running';
    entry.attempts += 1;
    entry.lastRunAt = startedAt;
    entry.lastPhase = opts.phase || 'init';
    record(key, 'start', { phase: entry.lastPhase, attempts: entry.attempts });

    try {
      const value = fn();
      const finishedAt = now();
      entry.value = value;
      entry.initialized = true;
      entry.status = 'initialized';
      entry.lastSuccessAt = finishedAt;
      entry.lastDurationMs = Math.max(0, finishedAt - startedAt);
      entry.lastError = null;
      record(key, 'success', { phase: entry.lastPhase, durationMs: entry.lastDurationMs });

      if (value && typeof value.then === 'function') {
        value.then(function () {
          record(key, 'async-success', { phase: entry.lastPhase });
        }).catch(function (error) {
          entry.lastError = serializeError(error);
          entry.status = 'async-error';
          emitError(key, 'async', error);
        });
      }

      flushPendingForDependency(key);
      return value;
    } catch (error) {
      entry.status = 'error';
      entry.lastError = serializeError(error);
      emitError(key, opts.phase || 'init', error);
      return opts.fallback;
    } finally {
      entry.running = false;
    }
  }

  function markDomReady(source) {
    if (domReadyFired) return;
    domReadyFired = true;
    record('document', 'dom-ready', { source: source || 'DOMContentLoaded' });
    flushAllPending();
  }

  function markLoad(source) {
    if (loadFired) return;
    loadFired = true;
    if (!domReadyFired) markDomReady('load-fallback');
    record('window', 'load', { source: source || 'load' });
    flushAllPending();
  }

  function bindLifecycleMarkers() {
    try {
      if (!global.document) return;
      if (global.document.readyState === 'complete') {
        markDomReady('initial-complete');
        markLoad('initial-complete');
        return;
      }
      global.document.addEventListener('DOMContentLoaded', function () {
        markDomReady('event');
      }, { once: true });
      if (typeof global.addEventListener === 'function') {
        global.addEventListener('load', function () {
          markLoad('event');
        }, { once: true, passive: true });
      }
    } catch (error) {
      emitError('vilda-init:lifecycle-bind', 'lifecycle-bind', error);
    }
  }

  bindLifecycleMarkers();

  function onReady(name, fn, options) {
    if (typeof name === 'function') {
      options = fn;
      fn = name;
      name = fn.name || 'anonymous-ready-init';
    }

    const key = normalizeName(name);
    const opts = Object.assign({}, options || {}, { phase: (options && options.phase) || 'ready' });
    const run = function () {
      return safeInit(key, fn, opts);
    };

    record(key, 'register-ready', { phase: opts.phase });

    try {
      if (!global.document || domReadyFired || global.document.readyState === 'complete') {
        if (!domReadyFired && global.document && global.document.readyState === 'complete') {
          markDomReady('ready-complete');
        }
        return run();
      }
      global.document.addEventListener('DOMContentLoaded', run, { once: true });
      return undefined;
    } catch (error) {
      emitError(key, 'ready-bind', error);
      return safeInit(key, fn, opts);
    }
  }

  function onLoad(name, fn, options) {
    if (typeof name === 'function') {
      options = fn;
      fn = name;
      name = fn.name || 'anonymous-load-init';
    }

    const key = normalizeName(name);
    const opts = Object.assign({}, options || {}, { phase: (options && options.phase) || 'load' });
    const run = function () {
      return safeInit(key, fn, opts);
    };

    record(key, 'register-load', { phase: opts.phase });

    try {
      if (loadFired || (global.document && global.document.readyState === 'complete')) {
        if (!loadFired && global.document && global.document.readyState === 'complete') {
          markLoad('load-complete');
        }
        return run();
      }
      if (typeof global.addEventListener === 'function') {
        global.addEventListener('load', run, { once: true, passive: true });
      } else {
        return run();
      }
      return undefined;
    } catch (error) {
      emitError(key, 'load-bind', error);
      return safeInit(key, fn, opts);
    }
  }

  function delay(name, fn, ms, options) {
    const key = normalizeName(name);
    const wait = Number.isFinite(Number(ms)) ? Math.max(0, Number(ms)) : 0;
    record(key, 'register-delay', { delayMs: wait });
    try {
      return global.setTimeout(function () {
        safeInit(key, fn, Object.assign({ once: false, phase: 'delay' }, options || {}));
      }, wait);
    } catch (error) {
      emitError(key, 'delay-bind', error);
      return safeInit(key, fn, Object.assign({ once: false, phase: 'delay' }, options || {}));
    }
  }

  function getState() {
    const out = {};
    Object.keys(registry).forEach(function (key) {
      out[key] = compactEntry(registry[key]);
    });
    return out;
  }

  function getTimeline(filter) {
    const opts = filter || {};
    const items = timeline.filter(function (item) {
      if (opts.name && item.name !== opts.name) return false;
      if (opts.event && item.event !== opts.event) return false;
      if (opts.contains && item.name.indexOf(String(opts.contains)) === -1) return false;
      return true;
    });
    return items.map(function (item) { return Object.assign({}, item); });
  }

  function getErrors() {
    return errors.map(function (item) {
      return {
        name: item.name,
        phase: item.phase,
        error: Object.assign({}, item.error),
        timestamp: item.timestamp,
        readyState: item.readyState
      };
    });
  }

  function getPending() {
    const out = {};
    Object.keys(registry).forEach(function (key) {
      const entry = registry[key];
      if (entry && entry.pendingFn) {
        out[key] = {
          dependencies: entry.dependencies ? entry.dependencies.slice() : [],
          phase: entry.pendingOptions && entry.pendingOptions.phase ? entry.pendingOptions.phase : 'init'
        };
      }
    });
    return out;
  }

  function getDiagnostics() {
    return {
      version: VERSION,
      readyState: getReadyState(),
      domReadyFired: !!domReadyFired,
      loadFired: !!loadFired,
      debug: shouldLog(),
      modules: getState(),
      timeline: getTimeline(),
      errors: getErrors(),
      pending: getPending()
    };
  }

  function dumpDiagnostics(filter) {
    const data = filter && filter.errorsOnly ? getErrors() : getTimeline(filter || {});
    try {
      if (global.console && typeof global.console.table === 'function') {
        global.console.table(data);
      } else if (global.console && typeof global.console.log === 'function') {
        global.console.log(data);
      }
    } catch (_) {
    void _;
  }
    return data;
  }

  function resetDiagnostics(options) {
    const opts = options || {};
    timeline.length = 0;
    errors.length = 0;
    sequence = 0;
    if (opts.includeRegistry === true) {
      Object.keys(registry).forEach(function (key) { delete registry[key]; });
      Object.keys(pendingByDependency).forEach(function (key) { delete pendingByDependency[key]; });
    }
  }

  function setDebug(value) {
    try {
      global.__VILDA_DEBUG = value !== false;
      return global.__VILDA_DEBUG;
    } catch (_) {
      return false;
    }
  }

  const api = Object.freeze({
    __vildaInitHelper: true,
    version: VERSION,
    safeInit,
    onReady,
    onLoad,
    delay,
    getState,
    getTimeline,
    getErrors,
    getPending,
    getDiagnostics,
    dumpDiagnostics,
    resetDiagnostics,
    isInitialized,
    setDebug
  });

  global.VildaInit = api;
  global.vildaInit = api;
  global.vildaSafeInit = safeInit;
  global.vildaOnReady = onReady;
  global.vildaOnLoad = onLoad;
  global.vildaInitDiagnostics = getDiagnostics;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
