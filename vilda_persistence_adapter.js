/*
 * Vilda Persistence Adapter v1.5.1
 *
 * Jedna bezpieczna warstwa dostępu do localStorage/sessionStorage dla stanu
 * użytkownika, stanu UI docpro oraz stanów sesyjnych. Adapter nie zmienia
 * schematu danych; centralizuje tylko odczyt, zapis, czyszczenie i flagi
 * wygaszające autosave podczas restore/clear.
 */
(function (global) {
  'use strict';

  if (!global) return;
  if (global.VildaPersistence && global.VildaPersistence.__vildaPersistenceAdapter) {
    return;
  }

  const VERSION = '1.5.1';
  const PERSIST_KEY = '_vildaPersist';
  const storageCache = Object.create(null);
  const KEYS = Object.freeze({
    SHARED_USER_DATA: 'sharedUserData',
    DOCPRO_UI: 'wagaiwzrost:docproUi:v2',
    DOCPRO_LEGACY_STATE: 'wagaiwzrost:docproState:v1',
    MAIN_SESSION: 'vildaMainSessionV1',
    CLCR_SESSION: 'vildaClcrSessionV1',
    STEROID_SESSION: 'vildaSteroidsSessionV1'
  });

  const MODULE_KEYS = Object.freeze({
    GH_THERAPY_POINTS: 'ghTherapyPoints',
    ANTIBIOTIC_SHOW_IV: 'showIVAntibiotics',
    RESULTS_MODE: 'resultsMode',
    DIABETES_MEAL_RATIOS: 'wagaiwzrost_cukrzyca_przeliczniki_doposilkowe_v1',
    DIABETES_MACRO_BT_DRAFT: 'wagaiwzrost_cukrzyca_macro_bt_draft_v1',
    DIABETES_DOSE_SETTINGS: 'wagaiwzrost_cukrzyca_dawka_do_posilku_settings_v2',
    DIABETES_DOSE_SETTINGS_LEGACY: 'wagaiwzrost_cukrzyca_dawka_do_posilku_settings_v1',
    PULSE_DURATION_MODE: 'pulseDurationMode',
    PAL_SMOOTH_PASSES: 'palSmoothPasses',
    CARD_VISIBILITY: 'cardVisibility',
    CARD_COLLAPSE_STATE: 'cardCollapseState',
    PUBLICATION_CHARTS: 'publicationCharts',
    CENTILE_CHART_LINE_STYLES: 'centileChartLineStyles',
    CENTILE_CHART_LINE_DEFAULTS_MIGRATION: 'centileChartLineStylesDefaults_v6',
    DIET_MYTH_RECENT_IDS: 'dietRecommendationsRecentMythsV1',
    ANALYTICS_CONSENT: 'analyticsConsent',
    DARK_BG_LEVEL: 'darkBgLevel',
    GLASS_LEVEL: 'glassLevel',
    HIGH_CONTRAST_ENABLED: 'highContrastEnabled',
    HIGH_CONTRAST_LEVEL: 'highContrastLevel',
    SHOW_MOBILE_DOCK: 'showMobileDock',
    SHOW_NAVIGATION_ARROW: 'showNavigationArrow',
    MOBILE_TOP_NAV_FONT_CACHE: 'mobileTopNavFontCache',
    WAGAIWZROST_STATE: 'wagaiwzrost_state',
    GH_THERAPY_VIEW_MODE: 'ghTherapyViewMode'
  });

  const MODULE_KEY_META = Object.freeze({
    [MODULE_KEYS.GH_THERAPY_POINTS]: Object.freeze({ scope: 'gh', kind: 'data', storage: 'local' }),
    [MODULE_KEYS.ANTIBIOTIC_SHOW_IV]: Object.freeze({ scope: 'antibiotic', kind: 'preference', storage: 'local' }),
    [MODULE_KEYS.RESULTS_MODE]: Object.freeze({ scope: 'ui', kind: 'preference', storage: 'local' }),
    [MODULE_KEYS.DIABETES_MEAL_RATIOS]: Object.freeze({ scope: 'diabetes', kind: 'data', storage: 'local' }),
    [MODULE_KEYS.DIABETES_MACRO_BT_DRAFT]: Object.freeze({ scope: 'diabetes', kind: 'data', storage: 'local' }),
    [MODULE_KEYS.DIABETES_DOSE_SETTINGS]: Object.freeze({ scope: 'diabetes', kind: 'data', storage: 'local' }),
    [MODULE_KEYS.DIABETES_DOSE_SETTINGS_LEGACY]: Object.freeze({ scope: 'diabetes', kind: 'data', storage: 'local', legacy: true }),
    [MODULE_KEYS.PULSE_DURATION_MODE]: Object.freeze({ scope: 'ui', kind: 'preference', storage: 'local' }),
    [MODULE_KEYS.PAL_SMOOTH_PASSES]: Object.freeze({ scope: 'ui', kind: 'preference', storage: 'local' }),
    [MODULE_KEYS.CARD_VISIBILITY]: Object.freeze({ scope: 'ui', kind: 'preference', storage: 'local' }),
    [MODULE_KEYS.CARD_COLLAPSE_STATE]: Object.freeze({ scope: 'ui', kind: 'preference', storage: 'local' }),
    [MODULE_KEYS.PUBLICATION_CHARTS]: Object.freeze({ scope: 'ui', kind: 'preference', storage: 'local' }),
    [MODULE_KEYS.CENTILE_CHART_LINE_STYLES]: Object.freeze({ scope: 'ui', kind: 'preference', storage: 'local' }),
    [MODULE_KEYS.CENTILE_CHART_LINE_DEFAULTS_MIGRATION]: Object.freeze({ scope: 'ui', kind: 'technical', storage: 'local' }),
    [MODULE_KEYS.DIET_MYTH_RECENT_IDS]: Object.freeze({ scope: 'diet', kind: 'technical', storage: 'local' }),
    [MODULE_KEYS.ANALYTICS_CONSENT]: Object.freeze({ scope: 'analytics', kind: 'preference', storage: 'local' }),
    [MODULE_KEYS.DARK_BG_LEVEL]: Object.freeze({ scope: 'appearance', kind: 'preference', storage: 'local' }),
    [MODULE_KEYS.GLASS_LEVEL]: Object.freeze({ scope: 'appearance', kind: 'preference', storage: 'local' }),
    [MODULE_KEYS.HIGH_CONTRAST_ENABLED]: Object.freeze({ scope: 'appearance', kind: 'preference', storage: 'local' }),
    [MODULE_KEYS.HIGH_CONTRAST_LEVEL]: Object.freeze({ scope: 'appearance', kind: 'preference', storage: 'local' }),
    [MODULE_KEYS.SHOW_MOBILE_DOCK]: Object.freeze({ scope: 'navigation', kind: 'preference', storage: 'local' }),
    [MODULE_KEYS.SHOW_NAVIGATION_ARROW]: Object.freeze({ scope: 'navigation', kind: 'preference', storage: 'local' }),
    [MODULE_KEYS.MOBILE_TOP_NAV_FONT_CACHE]: Object.freeze({ scope: 'navigation', kind: 'technical', storage: 'local' }),
    [MODULE_KEYS.WAGAIWZROST_STATE]: Object.freeze({ scope: 'ui', kind: 'technical', storage: 'local' }),
    [MODULE_KEYS.GH_THERAPY_VIEW_MODE]: Object.freeze({ scope: 'gh', kind: 'preference', storage: 'local' })
  });

  const MODULE_KEY_ALIASES = Object.freeze({
    GH_THERAPY_POINTS: MODULE_KEYS.GH_THERAPY_POINTS,
    ghTherapyPoints: MODULE_KEYS.GH_THERAPY_POINTS,
    ANTIBIOTIC_SHOW_IV: MODULE_KEYS.ANTIBIOTIC_SHOW_IV,
    showIVAntibiotics: MODULE_KEYS.ANTIBIOTIC_SHOW_IV,
    RESULTS_MODE: MODULE_KEYS.RESULTS_MODE,
    resultsMode: MODULE_KEYS.RESULTS_MODE,
    DIABETES_MEAL_RATIOS: MODULE_KEYS.DIABETES_MEAL_RATIOS,
    DIABETES_MACRO_BT_DRAFT: MODULE_KEYS.DIABETES_MACRO_BT_DRAFT,
    DIABETES_DOSE_SETTINGS: MODULE_KEYS.DIABETES_DOSE_SETTINGS,
    DIABETES_DOSE_SETTINGS_LEGACY: MODULE_KEYS.DIABETES_DOSE_SETTINGS_LEGACY,
    PULSE_DURATION_MODE: MODULE_KEYS.PULSE_DURATION_MODE,
    pulseDurationMode: MODULE_KEYS.PULSE_DURATION_MODE,
    PAL_SMOOTH_PASSES: MODULE_KEYS.PAL_SMOOTH_PASSES,
    palSmoothPasses: MODULE_KEYS.PAL_SMOOTH_PASSES,
    CARD_VISIBILITY: MODULE_KEYS.CARD_VISIBILITY,
    cardVisibility: MODULE_KEYS.CARD_VISIBILITY,
    CARD_COLLAPSE_STATE: MODULE_KEYS.CARD_COLLAPSE_STATE,
    cardCollapseState: MODULE_KEYS.CARD_COLLAPSE_STATE,
    PUBLICATION_CHARTS: MODULE_KEYS.PUBLICATION_CHARTS,
    publicationCharts: MODULE_KEYS.PUBLICATION_CHARTS,
    CENTILE_CHART_LINE_STYLES: MODULE_KEYS.CENTILE_CHART_LINE_STYLES,
    centileChartLineStyles: MODULE_KEYS.CENTILE_CHART_LINE_STYLES,
    CENTILE_CHART_LINE_DEFAULTS_MIGRATION: MODULE_KEYS.CENTILE_CHART_LINE_DEFAULTS_MIGRATION,
    centileChartLineStylesDefaults_v6: MODULE_KEYS.CENTILE_CHART_LINE_DEFAULTS_MIGRATION,
    DIET_MYTH_RECENT_IDS: MODULE_KEYS.DIET_MYTH_RECENT_IDS,
    dietRecommendationsRecentMythsV1: MODULE_KEYS.DIET_MYTH_RECENT_IDS,
    ANALYTICS_CONSENT: MODULE_KEYS.ANALYTICS_CONSENT,
    analyticsConsent: MODULE_KEYS.ANALYTICS_CONSENT,
    DARK_BG_LEVEL: MODULE_KEYS.DARK_BG_LEVEL,
    darkBgLevel: MODULE_KEYS.DARK_BG_LEVEL,
    GLASS_LEVEL: MODULE_KEYS.GLASS_LEVEL,
    glassLevel: MODULE_KEYS.GLASS_LEVEL,
    HIGH_CONTRAST_ENABLED: MODULE_KEYS.HIGH_CONTRAST_ENABLED,
    highContrastEnabled: MODULE_KEYS.HIGH_CONTRAST_ENABLED,
    HIGH_CONTRAST_LEVEL: MODULE_KEYS.HIGH_CONTRAST_LEVEL,
    highContrastLevel: MODULE_KEYS.HIGH_CONTRAST_LEVEL,
    SHOW_MOBILE_DOCK: MODULE_KEYS.SHOW_MOBILE_DOCK,
    showMobileDock: MODULE_KEYS.SHOW_MOBILE_DOCK,
    SHOW_NAVIGATION_ARROW: MODULE_KEYS.SHOW_NAVIGATION_ARROW,
    showNavigationArrow: MODULE_KEYS.SHOW_NAVIGATION_ARROW,
    MOBILE_TOP_NAV_FONT_CACHE: MODULE_KEYS.MOBILE_TOP_NAV_FONT_CACHE,
    mobileTopNavFontCache: MODULE_KEYS.MOBILE_TOP_NAV_FONT_CACHE,
    WAGAIWZROST_STATE: MODULE_KEYS.WAGAIWZROST_STATE,
    wagaiwzrost_state: MODULE_KEYS.WAGAIWZROST_STATE,
    GH_THERAPY_VIEW_MODE: MODULE_KEYS.GH_THERAPY_VIEW_MODE,
    ghTherapyViewMode: MODULE_KEYS.GH_THERAPY_VIEW_MODE
  });

  function storageAvailable(type) {
    const normalizedType = type === 'session' ? 'session' : 'local';
    if (Object.prototype.hasOwnProperty.call(storageCache, normalizedType)) {
      return storageCache[normalizedType];
    }
    try {
      const storage = normalizedType === 'session' ? global.sessionStorage : global.localStorage;
      if (!storage) {
        storageCache[normalizedType] = null;
        return null;
      }
      const testKey = '__vildaPersistenceTest__';
      storage.setItem(testKey, '1');
      storage.removeItem(testKey);
      storageCache[normalizedType] = storage;
      return storage;
    } catch (_) {
      storageCache[normalizedType] = null;
      return null;
    }
  }

  function getStorage(type) {
    return storageAvailable(type === 'session' ? 'session' : 'local');
  }

  function logPersistenceError(message, error, meta) {
    try {
      const logger = global.VildaLogger || global.vildaLogger || null;
      if (logger && typeof logger.error === 'function') {
        logger.error('vilda-persistence', message || 'Błąd persistence', error, Object.assign({
          helper: 'VildaPersistence'
        }, meta || {}), { dedupeMs: 5000 });
      }
    } catch (_) {
    void _;
  }
  }

  function safeParse(raw, fallback, meta) {
    if (raw == null || raw === '') return fallback == null ? null : fallback;
    try {
      const parsed = JSON.parse(raw);
      return parsed == null ? (fallback == null ? null : fallback) : parsed;
    } catch (error) {
      logPersistenceError('Nie udało się sparsować danych JSON ze storage', error, meta);
      return fallback == null ? null : fallback;
    }
  }

  function safeStringify(value, meta) {
    try {
      return JSON.stringify(value);
    } catch (error) {
      logPersistenceError('Nie udało się serializować danych do storage', error, meta);
      return null;
    }
  }

  function cloneJSON(value) {
    if (value == null) return value;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      logPersistenceError('Nie udało się sklonować danych persistence', error);
      return null;
    }
  }

  function readRaw(storageType, key) {
    const storage = getStorage(storageType);
    if (!storage || !key) return null;
    try {
      return storage.getItem(key);
    } catch (error) {
      logPersistenceError('Nie udało się odczytać wartości ze storage', error, { storageType, key });
      return null;
    }
  }

  function writeRaw(storageType, key, value) {
    const storage = getStorage(storageType);
    if (!storage || !key) return false;
    try {
      storage.setItem(key, String(value));
      return true;
    } catch (error) {
      logPersistenceError('Nie udało się zapisać wartości do storage', error, { storageType, key });
      return false;
    }
  }

  function removeKey(storageType, key) {
    const storage = getStorage(storageType);
    if (!storage || !key) return false;
    try {
      storage.removeItem(key);
      return true;
    } catch (error) {
      logPersistenceError('Nie udało się usunąć wartości ze storage', error, { storageType, key });
      return false;
    }
  }

  function readJSON(storageType, key, fallback) {
    const raw = readRaw(storageType, key);
    return safeParse(raw, fallback == null ? null : fallback, { storageType, key });
  }

  function writeJSON(storageType, key, value) {
    const raw = safeStringify(value, { storageType, key });
    if (raw == null) return false;
    return writeRaw(storageType, key, raw);
  }


  function normalizeModuleKey(keyOrAlias) {
    const value = String(keyOrAlias || '').trim();
    if (!value) return '';
    if (MODULE_KEY_META[value]) return value;
    if (Object.prototype.hasOwnProperty.call(MODULE_KEY_ALIASES, value)) {
      return MODULE_KEY_ALIASES[value];
    }
    return value;
  }

  function getModuleKeyMeta(keyOrAlias) {
    const key = normalizeModuleKey(keyOrAlias);
    return MODULE_KEY_META[key] || Object.freeze({ scope: 'custom', kind: 'data', storage: 'local' });
  }

  function readModuleRaw(keyOrAlias, fallback) {
    const key = normalizeModuleKey(keyOrAlias);
    if (!key) return fallback == null ? null : fallback;
    const meta = getModuleKeyMeta(key);
    const raw = readRaw(meta.storage || 'local', key);
    return raw == null ? (fallback == null ? null : fallback) : raw;
  }

  function writeModuleRaw(keyOrAlias, value, options) {
    const opts = options || {};
    if (isClearInProgress() && opts.force !== true) return false;
    const key = normalizeModuleKey(keyOrAlias);
    if (!key) return false;
    const meta = getModuleKeyMeta(key);
    return writeRaw(meta.storage || 'local', key, value);
  }

  function readModuleJSON(keyOrAlias, fallback) {
    const key = normalizeModuleKey(keyOrAlias);
    if (!key) return fallback == null ? null : fallback;
    const meta = getModuleKeyMeta(key);
    return readJSON(meta.storage || 'local', key, fallback == null ? null : fallback);
  }

  function writeModuleJSON(keyOrAlias, value, options) {
    const opts = options || {};
    if (isClearInProgress() && opts.force !== true) return false;
    const key = normalizeModuleKey(keyOrAlias);
    if (!key) return false;
    const meta = getModuleKeyMeta(key);
    return writeJSON(meta.storage || 'local', key, value);
  }


  function readPreferenceRaw(keyOrAlias, fallback) {
    return readModuleRaw(keyOrAlias, fallback);
  }

  function writePreferenceRaw(keyOrAlias, value, options) {
    return writeModuleRaw(keyOrAlias, value, options);
  }

  function readPreferenceJSON(keyOrAlias, fallback) {
    return readModuleJSON(keyOrAlias, fallback);
  }

  function writePreferenceJSON(keyOrAlias, value, options) {
    return writeModuleJSON(keyOrAlias, value, options);
  }

  function readBooleanPreference(keyOrAlias, fallback) {
    const raw = readPreferenceRaw(keyOrAlias, null);
    if (raw === null || raw === undefined || raw === '') return !!fallback;
    const normalized = String(raw).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on', 'granted'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off', 'denied'].includes(normalized)) return false;
    return !!fallback;
  }

  function writeBooleanPreference(keyOrAlias, value, options) {
    return writePreferenceRaw(keyOrAlias, value ? 'true' : 'false', options);
  }

  function readNumberPreference(keyOrAlias, fallback, options) {
    const opts = options || {};
    const raw = readPreferenceRaw(keyOrAlias, null);
    if (raw === null || raw === undefined || raw === '') return fallback;
    const value = opts.float === true ? parseFloat(raw) : parseInt(raw, 10);
    if (!Number.isFinite(value)) return fallback;
    if (Number.isFinite(opts.min) && value < opts.min) return fallback;
    if (Number.isFinite(opts.max) && value > opts.max) return fallback;
    return value;
  }

  function writeNumberPreference(keyOrAlias, value, options) {
    const opts = options || {};
    const numberValue = opts.float === true ? parseFloat(value) : parseInt(value, 10);
    if (!Number.isFinite(numberValue)) return false;
    return writePreferenceRaw(keyOrAlias, String(numberValue), opts);
  }

  function removeModuleKey(keyOrAlias) {
    const key = normalizeModuleKey(keyOrAlias);
    if (!key) return false;
    const meta = getModuleKeyMeta(key);
    return removeKey(meta.storage || 'local', key);
  }

  function matchesModuleClearScope(meta, scope) {
    const normalizedScope = String(scope || 'all').trim().toLowerCase() || 'all';
    if (normalizedScope === 'all' || normalizedScope === '*') return true;
    if (normalizedScope === 'preferences' || normalizedScope === 'preference') return meta.kind === 'preference';
    if (normalizedScope === 'data') return meta.kind !== 'preference';
    return String(meta.scope || '').toLowerCase() === normalizedScope;
  }

  function clearModuleState(options) {
    const opts = options || {};
    const scope = opts.scope || 'all';
    const includePreferences = opts.includePreferences === true;
    const removed = [];
    const skipped = [];
    const failed = [];

    Object.keys(MODULE_KEY_META).forEach((key) => {
      const meta = MODULE_KEY_META[key] || {};
      if (!matchesModuleClearScope(meta, scope)) return;
      if (meta.kind === 'preference' && !includePreferences) {
        skipped.push(key);
        return;
      }
      const ok = removeKey(meta.storage || 'local', key);
      if (ok) removed.push(key);
      else failed.push(key);
    });

    const detail = {
      source: opts.source || 'adapter.clearModuleState',
      scope,
      includePreferences,
      removedKeys: removed.slice(),
      skippedPreferenceKeys: skipped.slice(),
      failedKeys: failed.slice()
    };

    if (opts.dispatchEvent !== false) {
      dispatchModuleStateCleared(detail);
    }

    return Object.assign({ ok: failed.length === 0 }, detail);
  }

  function maxGlobalTimestamp(name, ms) {
    try {
      const duration = Number(ms);
      const until = Date.now() + (Number.isFinite(duration) && duration > 0 ? duration : 0);
      const previous = Number(global[name] || 0);
      global[name] = Math.max(previous || 0, until);
      return global[name];
    } catch (_) {
      return 0;
    }
  }

  function pauseAutosave(ms) {
    return maxGlobalTimestamp('__vildaPersistPauseUntil', ms == null ? 900 : ms);
  }

  function markClearInProgress(ms) {
    return maxGlobalTimestamp('__vildaPersistClearUntil', ms == null ? 1500 : ms);
  }

  function isClearInProgress() {
    try {
      const clearUntil = Number(global.__vildaPersistClearUntil || 0);
      return clearUntil > Date.now();
    } catch (_) {
      return false;
    }
  }

  function isAutosaveSuppressed() {
    try {
      const pauseUntil = Number(global.__vildaPersistPauseUntil || 0);
      return isClearInProgress() || isRestoring() || pauseUntil > Date.now();
    } catch (_) {
      return false;
    }
  }

  function isRestoring() {
    try {
      return !!global.__vildaPersistRestoring;
    } catch (_) {
      return false;
    }
  }

  function withRestoring(fn) {
    const previous = isRestoring();
    try {
      global.__vildaPersistRestoring = true;
      if (typeof fn === 'function') return fn();
      return undefined;
    } finally {
      try {
        global.__vildaPersistRestoring = previous;
      } catch (_) {
    void _;
  }
    }
  }

  function dispatchCustomEvent(name, detail, throttleGlobalName, throttleMs) {
    try {
      if (!name || !global || typeof global.dispatchEvent !== 'function') return false;
      const now = Date.now();
      if (throttleGlobalName) {
        const previous = Number(global[throttleGlobalName] || 0);
        const limit = Number(throttleMs == null ? 150 : throttleMs);
        if (previous && now - previous < limit) return false;
        global[throttleGlobalName] = now;
      }

      const payload = Object.assign({
        clearedAtISO: new Date(now).toISOString(),
        adapterVersion: VERSION
      }, detail && typeof detail === 'object' ? detail : {});

      let event = null;
      if (typeof global.CustomEvent === 'function') {
        event = new global.CustomEvent(name, { detail: payload });
      } else if (global.document && typeof global.document.createEvent === 'function') {
        event = global.document.createEvent('CustomEvent');
        event.initCustomEvent(name, false, false, payload);
      } else if (typeof global.Event === 'function') {
        event = new global.Event(name);
        event.detail = payload;
      }
      if (!event) return false;
      global.dispatchEvent(event);
      return true;
    } catch (_) {
      return false;
    }
  }

  function dispatchUserStateCleared(detail) {
    return dispatchCustomEvent('vilda:user-state-cleared', detail, '__vildaLastUserStateClearedEventAt', 150);
  }

  function dispatchModuleStateCleared(detail) {
    return dispatchCustomEvent('vilda:module-state-cleared', detail, null, 0);
  }

  function ensurePersistRoot(root) {
    const out = root && typeof root === 'object' && !Array.isArray(root) ? root : {};
    const persist = out[PERSIST_KEY] && typeof out[PERSIST_KEY] === 'object' && !Array.isArray(out[PERSIST_KEY])
      ? out[PERSIST_KEY]
      : {};
    persist.v = 1;
    persist.byId = persist.byId && typeof persist.byId === 'object' && !Array.isArray(persist.byId) ? persist.byId : {};
    persist.byName = persist.byName && typeof persist.byName === 'object' && !Array.isArray(persist.byName) ? persist.byName : {};
    persist.radio = persist.radio && typeof persist.radio === 'object' && !Array.isArray(persist.radio) ? persist.radio : {};
    persist.datasetById = persist.datasetById && typeof persist.datasetById === 'object' && !Array.isArray(persist.datasetById) ? persist.datasetById : {};
    persist.globals = persist.globals && typeof persist.globals === 'object' && !Array.isArray(persist.globals) ? persist.globals : {};
    out[PERSIST_KEY] = persist;
    return out;
  }

  function readShared(options) {
    const ensure = !(options && options.ensurePersist === false);
    const value = readJSON('local', KEYS.SHARED_USER_DATA, {});
    const root = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return ensure ? ensurePersistRoot(root) : root;
  }

  function readSharedPersist(options) {
    const root = readShared(options || { ensurePersist: false });
    const persist = root && root[PERSIST_KEY] && typeof root[PERSIST_KEY] === 'object' && !Array.isArray(root[PERSIST_KEY])
      ? root[PERSIST_KEY]
      : {};
    return {
      root,
      persist,
      byId: persist.byId && typeof persist.byId === 'object' && !Array.isArray(persist.byId) ? persist.byId : {},
      byName: persist.byName && typeof persist.byName === 'object' && !Array.isArray(persist.byName) ? persist.byName : {},
      radio: persist.radio && typeof persist.radio === 'object' && !Array.isArray(persist.radio) ? persist.radio : {},
      datasetById: persist.datasetById && typeof persist.datasetById === 'object' && !Array.isArray(persist.datasetById) ? persist.datasetById : {},
      globals: persist.globals && typeof persist.globals === 'object' && !Array.isArray(persist.globals) ? persist.globals : {}
    };
  }

  function writeShared(root, options) {
    const opts = options || {};
    if (isClearInProgress()) return false;
    if (!opts.force && isAutosaveSuppressed()) return false;
    const prepared = opts.ensurePersist === false
      ? (root && typeof root === 'object' && !Array.isArray(root) ? root : {})
      : ensurePersistRoot(root);
    if (opts.touch !== false && prepared[PERSIST_KEY] && typeof prepared[PERSIST_KEY] === 'object') {
      try {
        prepared[PERSIST_KEY].updatedAtISO = new Date().toISOString();
      } catch (_) {
    void _;
  }
    }
    return writeJSON('local', KEYS.SHARED_USER_DATA, prepared);
  }

  function updateShared(mutator, options) {
    const root = readShared();
    if (typeof mutator === 'function') {
      mutator(root, root[PERSIST_KEY]);
    }
    writeShared(root, options || {});
    return root;
  }

  function clearShared(options) {
    const opts = options || {};
    if (opts.markClear !== false) markClearInProgress(opts.durationMs == null ? 1500 : opts.durationMs);
    return removeKey('local', KEYS.SHARED_USER_DATA);
  }

  function readDocproUi() {
    const value = readJSON('local', KEYS.DOCPRO_UI, null);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  }

  function writeDocproUi(state, options) {
    const opts = options || {};
    if (isClearInProgress()) return false;
    if (!opts.force && isAutosaveSuppressed()) return false;
    if (!state || typeof state !== 'object' || Array.isArray(state)) return false;
    return writeJSON('local', KEYS.DOCPRO_UI, state);
  }

  function clearDocproUi(options) {
    const opts = options || {};
    if (opts.markClear) markClearInProgress(opts.durationMs == null ? 1500 : opts.durationMs);
    const removedCurrent = removeKey('local', KEYS.DOCPRO_UI);
    if (opts.includeLegacy !== false) {
      removeKey('local', KEYS.DOCPRO_LEGACY_STATE);
      removeKey('session', KEYS.DOCPRO_LEGACY_STATE);
    }
    return removedCurrent;
  }

  function clearLegacyDocproState() {
    const a = removeKey('local', KEYS.DOCPRO_LEGACY_STATE);
    const b = removeKey('session', KEYS.DOCPRO_LEGACY_STATE);
    return a || b;
  }

  function readMainSession() {
    return readJSON('session', KEYS.MAIN_SESSION, null);
  }

  function writeMainSession(state) {
    if (isClearInProgress()) return false;
    if (!state || typeof state !== 'object') return false;
    return writeJSON('session', KEYS.MAIN_SESSION, state);
  }

  function clearMainSession() {
    return removeKey('session', KEYS.MAIN_SESSION);
  }

  function readClcrSession() {
    return readJSON('session', KEYS.CLCR_SESSION, null);
  }

  function writeClcrSession(state) {
    if (isClearInProgress()) return false;
    if (!state || typeof state !== 'object') return false;
    return writeJSON('session', KEYS.CLCR_SESSION, state);
  }

  function clearClcrSession() {
    return removeKey('session', KEYS.CLCR_SESSION);
  }

  function readSteroidSession() {
    return readJSON('session', KEYS.STEROID_SESSION, null);
  }

  function writeSteroidSession(state) {
    if (isClearInProgress()) return false;
    if (!state || typeof state !== 'object') return false;
    return writeJSON('session', KEYS.STEROID_SESSION, state);
  }

  function clearSteroidSession() {
    return removeKey('session', KEYS.STEROID_SESSION);
  }

  function clearUserState(options) {
    const opts = options || {};
    const durationMs = opts.durationMs == null ? 2500 : opts.durationMs;
    if (opts.markClear !== false) markClearInProgress(durationMs);
    pauseAutosave(durationMs);
    clearShared({ markClear: false });
    clearDocproUi({ includeLegacy: true, markClear: false });
    let moduleClearResult = null;
    if (opts.includeModuleState !== false) {
      moduleClearResult = clearModuleState({
        scope: opts.moduleScope || 'all',
        includePreferences: opts.includePreferences === true,
        source: opts.source || 'adapter.clearUserState',
        dispatchEvent: false
      });
    }
    if (opts.includeSessions !== false) {
      clearMainSession();
      clearClcrSession();
      clearSteroidSession();
    }
    if (opts.dispatchEvent !== false) {
      dispatchUserStateCleared({
        source: opts.source || 'adapter.clearUserState',
        includeSessions: opts.includeSessions !== false,
        includeModuleState: opts.includeModuleState !== false,
        moduleScope: opts.moduleScope || 'all',
        includePreferences: opts.includePreferences === true,
        moduleRemovedKeys: moduleClearResult && moduleClearResult.removedKeys ? moduleClearResult.removedKeys : [],
        durationMs
      });
    }
    return true;
  }

  const api = Object.freeze({
    __vildaPersistenceAdapter: true,
    version: VERSION,
    KEYS,
    MODULE_KEYS,
    MODULE_KEY_META,
    PERSIST_KEY,
    getStorage,
    safeParse,
    safeStringify,
    cloneJSON,
    readRaw,
    writeRaw,
    readJSON,
    writeJSON,
    removeKey,
    normalizeModuleKey,
    readModuleRaw,
    writeModuleRaw,
    readModuleJSON,
    writeModuleJSON,
    removeModuleKey,
    readPreferenceRaw,
    writePreferenceRaw,
    readPreferenceJSON,
    writePreferenceJSON,
    readBooleanPreference,
    writeBooleanPreference,
    readNumberPreference,
    writeNumberPreference,
    clearModuleState,
    pauseAutosave,
    markClearInProgress,
    isAutosaveSuppressed,
    isClearInProgress,
    isRestoring,
    withRestoring,
    dispatchUserStateCleared,
    dispatchModuleStateCleared,
    ensurePersistRoot,
    readShared,
    readSharedPersist,
    writeShared,
    updateShared,
    clearShared,
    readDocproUi,
    writeDocproUi,
    clearDocproUi,
    clearLegacyDocproState,
    readMainSession,
    writeMainSession,
    clearMainSession,
    readClcrSession,
    writeClcrSession,
    clearClcrSession,
    readSteroidSession,
    writeSteroidSession,
    clearSteroidSession,
    clearUserState
  });

  global.VildaPersistence = api;
  global.vildaPersistence = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
