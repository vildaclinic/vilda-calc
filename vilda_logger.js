/*
 * Vilda Logger v1.1.0
 *
 * Lekki logger diagnostyczny dla błędów, które wcześniej znikały w pustych catch.
 * Domyślnie zapisuje zdarzenia w pamięci i emituje event diagnostyczny; konsola
 * jest używana tylko po włączeniu trybu debug.
 */
(function (global) {
  'use strict';

  if (!global) return;
  if (global.VildaLogger && global.VildaLogger.__vildaLogger) {
    return;
  }

  const VERSION = '1.1.0';
  const MAX_RECORDS = 500;
  const MAX_ERRORS = 200;
  const DEDUPE_WINDOW_MS = 2500;
  const records = [];
  const errors = [];
  const lastByKey = Object.create(null);
  let debugEnabled = false;

  function now() {
    try {
      return Date.now();
    } catch (_) {
      return 0;
    }
  }

  function safeString(value) {
    try {
      if (value == null) return '';
      return String(value);
    } catch (_) {
      return '';
    }
  }

  function normalizeLevel(level) {
    const normalized = safeString(level || 'info').toLowerCase();
    if (normalized === 'error' || normalized === 'warn' || normalized === 'warning' || normalized === 'debug' || normalized === 'info') {
      return normalized === 'warning' ? 'warn' : normalized;
    }
    return 'info';
  }

  function normalizeModule(moduleName) {
    const normalized = safeString(moduleName || '').trim();
    return normalized || 'app';
  }

  function shouldConsoleLog() {
    try {
      if (debugEnabled === true) return true;
      if (global.__VILDA_DEBUG === true) return true;
      if (global.localStorage && global.localStorage.getItem('vildaDebug') === '1') return true;
      return /(?:^|[?&])vildaDebug=1(?:&|$)/.test(global.location && global.location.search ? global.location.search : '');
    } catch (_) {
      return false;
    }
  }

  function serializeError(error) {
    if (!error) return null;
    if (typeof error === 'string') {
      return { name: 'Error', message: error, stack: '' };
    }
    try {
      return {
        name: error.name || 'Error',
        message: error.message || safeString(error),
        stack: error.stack || '',
        code: error.code || '',
        vildaDependencyError: !!error.vildaDependencyError
      };
    } catch (_) {
      return { name: 'Error', message: safeString(error), stack: '' };
    }
  }

  function sanitizeMeta(meta) {
    if (!meta || typeof meta !== 'object') return meta == null ? null : safeString(meta);
    const out = {};
    const keys = Object.keys(meta).slice(0, 30);
    keys.forEach(function (key) {
      try {
        const value = meta[key];
        if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          out[key] = value;
        } else if (Array.isArray(value)) {
          out[key] = value.slice(0, 20).map(function (item) {
            return item == null || typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean'
              ? item
              : safeString(item);
          });
        } else if (value && typeof value.nodeType === 'number') {
          out[key] = '[DOMNode:' + (value.id || value.name || value.tagName || 'node') + ']';
        } else {
          out[key] = safeString(value);
        }
      } catch (_) {
        out[key] = '[unserializable]';
      }
    });
    return out;
  }

  function trim(list, max) {
    if (list.length > max) {
      list.splice(0, list.length - max);
    }
  }

  function cloneRecord(record) {
    try {
      return JSON.parse(JSON.stringify(record));
    } catch (_) {
      return Object.assign({}, record);
    }
  }

  function emit(record) {
    try {
      if (typeof global.CustomEvent === 'function' && typeof global.dispatchEvent === 'function') {
        global.dispatchEvent(new CustomEvent('vilda:log', { detail: cloneRecord(record) }));
      }
    } catch (_) {
    void _;
  }
  }

  function consoleLog(record, originalError) {
    if (!shouldConsoleLog()) return;
    try {
      const consoleObj = global.console;
      if (!consoleObj) return;
      const method = record.level === 'error' ? 'error' : (record.level === 'warn' ? 'warn' : (record.level === 'debug' ? 'debug' : 'info'));
      const fn = typeof consoleObj[method] === 'function' ? consoleObj[method] : consoleObj.log;
      if (typeof fn === 'function') {
        fn.call(consoleObj, '[VildaLogger][' + record.level + '][' + record.moduleName + '] ' + record.message, originalError || record);
      }
    } catch (_) {
    void _;
  }
  }

  function makeDedupeKey(level, moduleName, message, errorInfo) {
    return [
      level,
      moduleName,
      message,
      errorInfo && errorInfo.name,
      errorInfo && errorInfo.message
    ].join('::');
  }

  function log(level, moduleName, message, error, meta, options) {
    const opts = options || {};
    const normalizedLevel = normalizeLevel(level);
    const normalizedModule = normalizeModule(moduleName);
    const text = safeString(message || (error && error.message) || 'Zdarzenie diagnostyczne');
    const errorInfo = serializeError(error);
    const timestamp = now();
    const dedupeMs = Number.isFinite(opts.dedupeMs) ? opts.dedupeMs : DEDUPE_WINDOW_MS;
    const key = makeDedupeKey(normalizedLevel, normalizedModule, text, errorInfo);

    if (dedupeMs > 0 && lastByKey[key] && timestamp - lastByKey[key] < dedupeMs) {
      return null;
    }
    lastByKey[key] = timestamp;

    const record = {
      level: normalizedLevel,
      moduleName: normalizedModule,
      message: text,
      timestamp,
      error: errorInfo,
      meta: sanitizeMeta(meta),
      source: opts.source || ''
    };

    records.push(record);
    trim(records, MAX_RECORDS);
    if (normalizedLevel === 'error') {
      errors.push(record);
      trim(errors, MAX_ERRORS);
    }

    if (opts.emit !== false) emit(record);
    consoleLog(record, error);
    return cloneRecord(record);
  }

  function error(moduleName, message, err, meta, options) {
    return log('error', moduleName, message, err, meta, options);
  }

  function warn(moduleName, message, err, meta, options) {
    return log('warn', moduleName, message, err, meta, options);
  }

  function info(moduleName, message, meta, options) {
    return log('info', moduleName, message, null, meta, options);
  }

  function debug(moduleName, message, meta, options) {
    return log('debug', moduleName, message, null, meta, options);
  }


  function logSwallowedCatch(moduleName, err, meta, options) {
    try {
      const mergedMeta = Object.assign({ swallowedCatch: true }, meta && typeof meta === 'object' ? meta : {});
      return warn(moduleName || 'app', 'Cichy catch przechwycił błąd', err, mergedMeta, Object.assign({ source: 'swallowed-catch', dedupeMs: 1000 }, options || {}));
    } catch (loggingError) {
      void loggingError;
      return null;
    }
  }

  function wrap(moduleName, fn, options) {
    const opts = options || {};
    if (typeof fn !== 'function') return fn;
    return function vildaLoggedWrapper() {
      try {
        return fn.apply(this, arguments);
      } catch (err) {
        error(moduleName || opts.moduleName, opts.message || 'Błąd wykonania funkcji', err, opts.meta, opts);
        if (opts.rethrow !== false) throw err;
        return opts.fallback;
      }
    };
  }

  function getRecords(filter) {
    const opts = filter || {};
    return records
      .filter(function (record) {
        if (opts.level && record.level !== opts.level) return false;
        if (opts.moduleName && record.moduleName !== opts.moduleName) return false;
        return true;
      })
      .map(cloneRecord);
  }

  function getErrors() {
    return errors.map(cloneRecord);
  }

  function clear() {
    records.splice(0, records.length);
    errors.splice(0, errors.length);
    Object.keys(lastByKey).forEach(function (key) { delete lastByKey[key]; });
  }

  function setDebug(value) {
    debugEnabled = value !== false;
    try { global.__VILDA_DEBUG = debugEnabled; } catch (_) {
    void _;
  }
    return debugEnabled;
  }

  function isDebugEnabled() {
    return shouldConsoleLog();
  }

  function dump(filter) {
    const data = getRecords(filter);
    try {
      if (global.console && typeof global.console.table === 'function') {
        global.console.table(data.map(function (record) {
          return {
            level: record.level,
            moduleName: record.moduleName,
            message: record.message,
            error: record.error && record.error.message,
            timestamp: record.timestamp
          };
        }));
      } else if (global.console && typeof global.console.log === 'function') {
        global.console.log(data);
      }
    } catch (_) {
    void _;
  }
    return data;
  }

  const api = {
    __vildaLogger: true,
    version: VERSION,
    log,
    error,
    warn,
    info,
    debug,
    logSwallowedCatch,
    wrap,
    getRecords,
    getErrors,
    clear,
    setDebug,
    isDebugEnabled,
    dump
  };

  global.VildaLogger = api;
  global.vildaLogger = api;
  global.vildaLogError = error;
  global.vildaLogWarn = warn;
  global.vildaLogInfo = info;
  global.vildaLogSwallowedCatch = logSwallowedCatch;
  global.vildaLoggerDump = dump;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
