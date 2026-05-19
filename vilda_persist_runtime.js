/* ==========================================================================
 * vilda_persist_runtime.js — runtime persistence/autosave/restore
 *
 * Krok 8Q-3: AUTOSAVE / RESTORE wydzielony z app.js bez zmiany kluczy storage,
 * schematu _vildaPersist, sharedUserData, importu/eksportu JSON ani IndexedDB.
 * ========================================================================== */
(function (global) {
  'use strict';

  if (!global) return;
  if (global.VildaPersistRuntime && global.VildaPersistRuntime.__vildaPersistRuntimeModule) {
    return;
  }

  const VERSION = '1.0.1';
  const STEP = '8Q-3b';

  const dependencyKeys = Object.freeze([
    '__pickLastMeasurement',
    '__renderPrevSummary',
    '_getUserBasics',
    '_updateIntakeFirstRowFromUserBasics',
    'hideLoadDataMessage',
    'importTherapyPointsToAdvancedGrowth',
    'macroPracticeResolveFoodAliasKey',
    'showLoadDataMessage',
    'showRestoreButton',
    'updateProfessionalSummaryCard',
    'updateSaveBtnVisibility',
    'vildaAppClearHtml',
    'vildaLogAppError',
    'vildaLogAppWarn',
    'writeGhTherapyPointsToModuleStorage'
  ]);

  const initState = {
    initialized: false,
    initCalls: 0,
    lastInitAtISO: null,
    lastOptionsKeys: [],
    lastDependencyStatus: {},
    autoPersistFlagSeen: false
  };

  function clonePlain(value, depth) {
    const maxDepth = typeof depth === 'number' ? depth : 5;
    if (maxDepth <= 0 || value == null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(function (item) { return clonePlain(item, maxDepth - 1); });
    const out = {};
    Object.keys(value).forEach(function (key) {
      const v = value[key];
      out[key] = (typeof v === 'function') ? '[function]' : clonePlain(v, maxDepth - 1);
    });
    return out;
  }

  function getRoot() {
    return global || ((typeof window !== 'undefined') ? window : ((typeof globalThis !== 'undefined') ? globalThis : null));
  }

  function getFoodMapFromRoot(root) {
    try {
      if (root && root.VildaFoodData && root.VildaFoodData.foods && typeof root.VildaFoodData.foods === 'object') {
        return root.VildaFoodData.foods;
      }
    } catch (_) {
      // no-op
    }
    return {};
  }

  function normalizeInitOptions(options) {
    const opts = (options && typeof options === 'object') ? options : {};
    const root = getRoot();
    const deps = Object.assign({}, opts.dependencies && typeof opts.dependencies === 'object' ? opts.dependencies : {}, opts);
    delete deps.dependencies;
    deps.foods = (deps.foods && typeof deps.foods === 'object') ? deps.foods : getFoodMapFromRoot(root);
    return deps;
  }

  function dependencyStatus(deps) {
    const root = getRoot();
    const status = {};
    dependencyKeys.forEach(function (key) {
      let value = deps ? deps[key] : undefined;
      if ((typeof value === 'undefined' || value === null) && root) {
        try { value = root[key]; } catch (_) { value = undefined; }
      }
      status[key] = typeof value;
    });
    status.foods = deps && deps.foods && typeof deps.foods === 'object' ? 'object' : 'undefined';
    return status;
  }

  function resolveDependency(deps, name) {
    if (deps && typeof deps[name] !== 'undefined' && deps[name] !== null) return deps[name];
    const root = getRoot();
    try { return root ? root[name] : undefined; } catch (_) { return undefined; }
  }

  function callDependency(deps, name, args, fallback) {
    const fn = resolveDependency(deps, name);
    if (typeof fn === 'function') {
      try { return fn.apply(getRoot(), Array.prototype.slice.call(args || [])); } catch (error) {
        const logger = resolveDependency(deps, 'vildaLogAppError');
        if (typeof logger === 'function') {
          try { logger('persist-runtime:dependency-call', 'Błąd wywołania zależności ' + name, error); } catch (_) { /* no-op */ }
        }
        return fallback;
      }
    }
    return fallback;
  }

  function init(options) {
    const __vildaPersistRuntimeDeps = normalizeInitOptions(options);
    initState.initCalls += 1;
    initState.lastInitAtISO = new Date().toISOString();
    initState.lastOptionsKeys = Object.keys(options && typeof options === 'object' ? options : {}).sort();
    initState.lastDependencyStatus = dependencyStatus(__vildaPersistRuntimeDeps);

    const __pickLastMeasurement = function __pickLastMeasurement(data) {
      return callDependency(__vildaPersistRuntimeDeps, '__pickLastMeasurement', arguments, { sex: null, ageMonths: null, heightCm: null, weightKg: null, waistCm: null, hipCm: null });
    };
    const __renderPrevSummary = function __renderPrevSummary(data) {
      return callDependency(__vildaPersistRuntimeDeps, '__renderPrevSummary', arguments, null);
    };
    const _getUserBasics = function _getUserBasics() {
      return callDependency(__vildaPersistRuntimeDeps, '_getUserBasics', arguments, null);
    };
    const _updateIntakeFirstRowFromUserBasics = function _updateIntakeFirstRowFromUserBasics() {
      return callDependency(__vildaPersistRuntimeDeps, '_updateIntakeFirstRowFromUserBasics', arguments, null);
    };
    const hideLoadDataMessage = function hideLoadDataMessage() {
      return callDependency(__vildaPersistRuntimeDeps, 'hideLoadDataMessage', arguments, null);
    };
    const importTherapyPointsToAdvancedGrowth = function importTherapyPointsToAdvancedGrowth() {
      return callDependency(__vildaPersistRuntimeDeps, 'importTherapyPointsToAdvancedGrowth', arguments, null);
    };
    const macroPracticeResolveFoodAliasKey = function macroPracticeResolveFoodAliasKey() {
      return callDependency(__vildaPersistRuntimeDeps, 'macroPracticeResolveFoodAliasKey', arguments, arguments && arguments.length ? arguments[0] : null);
    };
    const showLoadDataMessage = function showLoadDataMessage() {
      return callDependency(__vildaPersistRuntimeDeps, 'showLoadDataMessage', arguments, null);
    };
    const showRestoreButton = function showRestoreButton() {
      return callDependency(__vildaPersistRuntimeDeps, 'showRestoreButton', arguments, null);
    };
    const updateProfessionalSummaryCard = function updateProfessionalSummaryCard() {
      return callDependency(__vildaPersistRuntimeDeps, 'updateProfessionalSummaryCard', arguments, null);
    };
    const updateSaveBtnVisibility = function updateSaveBtnVisibility() {
      return callDependency(__vildaPersistRuntimeDeps, 'updateSaveBtnVisibility', arguments, null);
    };
    const vildaAppClearHtml = function vildaAppClearHtml() {
      return callDependency(__vildaPersistRuntimeDeps, 'vildaAppClearHtml', arguments, null);
    };
    const vildaLogAppError = function vildaLogAppError() {
      return callDependency(__vildaPersistRuntimeDeps, 'vildaLogAppError', arguments, null);
    };
    const vildaLogAppWarn = function vildaLogAppWarn() {
      return callDependency(__vildaPersistRuntimeDeps, 'vildaLogAppWarn', arguments, null);
    };
    const writeGhTherapyPointsToModuleStorage = function writeGhTherapyPointsToModuleStorage() {
      return callDependency(__vildaPersistRuntimeDeps, 'writeGhTherapyPointsToModuleStorage', arguments, null);
    };
    const foods = __vildaPersistRuntimeDeps.foods && typeof __vildaPersistRuntimeDeps.foods === 'object' ? __vildaPersistRuntimeDeps.foods : {};

  try {
    if (typeof window !== 'undefined') {
      if (window.__vildaAutoPersistV1) {
        initState.initialized = true;
        initState.autoPersistFlagSeen = true;
        return getSnapshot();
      }
      window.__vildaAutoPersistV1 = true;
    }
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 37616 });
    }
  }

  const PKEY = '_vildaPersist';

  function getPersistenceAdapter() {
    try {
      if (typeof window !== 'undefined' && window.VildaPersistence) return window.VildaPersistence;
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 37623 });
    }
  }
    return null;
  }

  function safeClone(obj) {
    try { return JSON.parse(JSON.stringify(obj)); } catch (_) { return null; }
  }
  function loadShared() {
    try {
      const persistence = getPersistenceAdapter();
      if (persistence && typeof persistence.readShared === 'function') {
        return persistence.readShared({ ensurePersist: false }) || {};
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 37636 });
    }
  }
    return {};
  }
  function saveShared(obj, options) {
    try {
      const persistence = getPersistenceAdapter();
      if (persistence && typeof persistence.writeShared === 'function') {
        persistence.writeShared(obj || {}, Object.assign({ ensurePersist: true }, options || {}));
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 37645 });
    }
  }
  }
  function ensurePersist(root) {
    try {
      const persistence = getPersistenceAdapter();
      if (persistence && typeof persistence.ensurePersistRoot === 'function') {
        return persistence.ensurePersistRoot(root || {});
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 37653 });
    }
  }
    if (!root || typeof root !== 'object') root = {};
    if (!root[PKEY] || typeof root[PKEY] !== 'object') {
      root[PKEY] = { v: 1, byId: {}, byName: {}, radio: {}, datasetById: {}, globals: {}, updatedAtISO: null };
    } else {
      root[PKEY].v = 1;
      root[PKEY].byId = root[PKEY].byId && typeof root[PKEY].byId === 'object' ? root[PKEY].byId : {};
      root[PKEY].byName = root[PKEY].byName && typeof root[PKEY].byName === 'object' ? root[PKEY].byName : {};
      root[PKEY].radio = root[PKEY].radio && typeof root[PKEY].radio === 'object' ? root[PKEY].radio : {};
      root[PKEY].datasetById = root[PKEY].datasetById && typeof root[PKEY].datasetById === 'object' ? root[PKEY].datasetById : {};
      root[PKEY].globals = root[PKEY].globals && typeof root[PKEY].globals === 'object' ? root[PKEY].globals : {};
    }
    return root;
  }

  function cssEscape(name) {
    // CSS.escape może nie istnieć w starszych przeglądarkach – fallback do naiwnego escape
    try {
      if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(name);
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 37672 });
    }
  }
    return String(name).replace(/[^a-zA-Z0-9_\-]/g, '\\$&');
  }

  // Pola, które userData.js synchronizuje jako "wspólne" – trzymamy je też na root obiektu,
  // aby zachować kompatybilność wsteczną.
  const BASIC_ROOT_KEYS = new Set([
    'name','fullName','age','ageMonths','weight','height','sex',
    'advMotherHeight','advFatherHeight','advBoneAge','advTesticularVolume','advFamilyDelayedPuberty','advGrowthExclusion'
  ]);
  const TRACKED_DATASET_PROPS = ['manual', 'userChoice', 'preferredSource'];
  const PERSIST_NAME_LOCK_IDS = ['name', 'advName', 'basicGrowthName', 'fullName'];

  function persistHasLockedElement(ids) {
    try {
      if (!Array.isArray(ids)) return false;
      return ids.some((id) => {
        const el = document.getElementById(id);
        return !!(el && el.disabled);
      });
    } catch (_) {
      return false;
    }
  }

  function syncPersistLockFlags(root) {
    if (!root || typeof root !== 'object') return root;
    try {
      const nameLocked = !!root.nameLocked || persistHasLockedElement(PERSIST_NAME_LOCK_IDS);
      if (nameLocked) root.nameLocked = true;
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 37702 });
    }
  }
    try {
      const sexEl = document.getElementById('sex');
      const sexLocked = !!root.sexLocked || !!(sexEl && sexEl.disabled);
      if (sexLocked) root.sexLocked = true;
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 37707 });
    }
  }
    return root;
  }

  function applyPersistLockFlags(root) {
    try {
      if (root && root.nameLocked) {
        PERSIST_NAME_LOCK_IDS.forEach((id) => {
          const el = document.getElementById(id);
          if (el) el.disabled = true;
        });
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 37719 });
    }
  }
    try {
      if (root && root.sexLocked) {
        const sexEl = document.getElementById('sex');
        if (sexEl) sexEl.disabled = true;
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 37725 });
    }
  }
  }

  function syncPersistSharedSexFromDom(root) {
    if (!root || typeof root !== 'object') return root;
    try {
      const sexEl = document.getElementById('sex');
      if (!sexEl) return root;
      const rawValue = readControlValue(sexEl);
      if (rawValue == null) return root;
      const normalizedSex = String(rawValue).trim().toUpperCase() === 'F' ? 'F'
        : (String(rawValue).trim() !== '' ? 'M' : '');
      if (!normalizedSex) return root;
      const r = ensurePersist(root);
      const p = r[PKEY];
      r.sex = normalizedSex;
      p.byId.sex = normalizedSex;
      if (sexEl.disabled) r.sexLocked = true;
      return r;
    } catch (_) {
      return root;
    }
  }

  function persistReadCurrentIntakeBasics() {
    try {
      if (typeof _getUserBasics !== 'function') return null;
      const basics = _getUserBasics();
      if (!basics || typeof basics !== 'object') return null;
      const ageMonths = persistNormalizeNumber(basics.ageMonths);
      const height = persistNormalizeNumber(basics.height);
      const weight = persistNormalizeNumber(basics.weight);
      if (ageMonths === null || height === null || weight === null) return null;
      return { ageMonths: Math.round(ageMonths), height, weight };
    } catch (_) {
      return null;
    }
  }


  function persistNormalizeNumber(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' && value.trim() === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function persistNormalizeAgeMonthsValue(ageMonthsValue, ageYearsValue) {
    const direct = persistNormalizeNumber(ageMonthsValue);
    if (direct !== null) return Math.round(direct);
    const ageYears = persistNormalizeNumber(ageYearsValue);
    return (ageYears !== null) ? Math.round(ageYears * 12) : null;
  }

  function persistSanitizeAdvancedMeasurementEntries(entries) {
    if (!Array.isArray(entries)) return [];
    const out = [];
    const seen = new Set();
    entries.forEach((entry) => {
      if (!entry || typeof entry !== 'object') return;
      const ageMonths = persistNormalizeAgeMonthsValue(entry.ageMonths, entry.ageYears);
      if (ageMonths === null) return;
      const height = persistNormalizeNumber(entry.height);
      const weight = persistNormalizeNumber(entry.weight);
      const boneAgeYears = persistNormalizeNumber(entry.boneAgeYears);
      const arrowEnabled = !!entry.arrowEnabled;
      const arrowComment = (typeof entry.arrowComment === 'string') ? entry.arrowComment.trim() : '';
      const ghSync = !!entry.ghSync;
      const ghId = (entry.ghId != null && String(entry.ghId).trim() !== '') ? String(entry.ghId).trim() : '';
      const hasPayload = (height !== null) || (weight !== null) || (boneAgeYears !== null) || arrowEnabled || !!arrowComment || ghSync || !!ghId;
      if (!hasPayload) return;
      const key = [
        ageMonths,
        height !== null ? height.toFixed(3) : '',
        weight !== null ? weight.toFixed(3) : '',
        boneAgeYears !== null ? boneAgeYears.toFixed(3) : '',
        arrowEnabled ? '1' : '0',
        arrowComment,
        ghSync ? '1' : '0',
        ghId
      ].join('|');
      if (seen.has(key)) return;
      seen.add(key);
      out.push(Object.assign({}, entry, {
        ageMonths,
        ageYears: ageMonths / 12,
        height,
        weight,
        boneAgeYears,
        arrowEnabled,
        arrowComment,
        ghSync,
        ghId: ghId || null
      }));
    });
    out.sort((a, b) => a.ageMonths - b.ageMonths);
    return out;
  }

  function persistSanitizeAdvancedRowsUI(rowsUI) {
    if (!Array.isArray(rowsUI)) return [];
    return rowsUI
      .filter((item) => {
        if (!item || typeof item !== 'object') return false;
        const fields = [item.ageY, item.ageM, item.ht, item.wt, item.boneAge];
        const hasText = fields.some((value) => String(value ?? '').trim() !== '');
        const hasMeta = !!item.arrowEnabled
          || !!(typeof item.arrowComment === 'string' && item.arrowComment.trim())
          || !!item.ghSync
          || !!(item.ghId != null && String(item.ghId).trim() !== '');
        return hasText || hasMeta;
      })
      .map((item) => ({
        ageY: item.ageY ?? '',
        ageM: item.ageM ?? '',
        ht: item.ht ?? '',
        wt: item.wt ?? '',
        boneAge: item.boneAge ?? '',
        arrowEnabled: !!item.arrowEnabled,
        arrowComment: (typeof item.arrowComment === 'string') ? item.arrowComment : '',
        ghSync: !!item.ghSync,
        ghId: (item.ghId != null) ? String(item.ghId) : ''
      }));
  }

  
function persistNormalizeIntakeCurrentBasics(currentBasics) {
    if (!currentBasics || typeof currentBasics !== 'object') return null;
    const ageMonths = persistNormalizeNumber(currentBasics.ageMonths);
    const height = persistNormalizeNumber(currentBasics.height);
    const weight = persistNormalizeNumber(currentBasics.weight);
    if (ageMonths === null || height === null || weight === null) return null;
    return { ageMonths: Math.round(ageMonths), height, weight };
  }

  function persistIntakeEntryMatchesCurrentBasics(ageMonths, height, weight, currentBasics) {
    const basics = persistNormalizeIntakeCurrentBasics(currentBasics);
    if (!basics || ageMonths === null) return false;
    if (Math.round(ageMonths) !== basics.ageMonths) return false;

    let compared = 0;
    if (height !== null && typeof basics.height === 'number') {
      compared += 1;
      if (Math.abs(height - basics.height) > 0.05) return false;
    }
    if (weight !== null && typeof basics.weight === 'number') {
      compared += 1;
      if (Math.abs(weight - basics.weight) > 0.05) return false;
    }
    return compared > 0;
  }

  function persistIntakeRowsUIMatchesCurrentBasics(item, currentBasics) {
    if (!item || typeof item !== 'object') return false;
    const basics = persistNormalizeIntakeCurrentBasics(currentBasics);
    if (!basics) return false;
    const ageY = persistNormalizeNumber(item.ageY);
    const ageM = persistNormalizeNumber(item.ageM);
    if (ageY === null && ageM === null) return false;
    const ageMonths = Math.round((ageY === null ? 0 : ageY) * 12 + (ageM === null ? 0 : ageM));
    const height = persistNormalizeNumber(item.ht);
    const weight = persistNormalizeNumber(item.wt);
    return persistIntakeEntryMatchesCurrentBasics(ageMonths, height, weight, basics);
  }

  function persistSanitizeIntakeHistoryEntries(entries, options) {
    const opts = (options && typeof options === 'object') ? options : {};
    const currentBasics = persistNormalizeIntakeCurrentBasics(opts.currentBasics);
    const omitCurrentDuplicate = !!opts.omitCurrentDuplicate;
    if (!Array.isArray(entries)) return [];
    const out = [];
    const seen = new Set();
    entries.forEach((entry) => {
      if (!entry || typeof entry !== 'object') return;
      const ageMonths = persistNormalizeAgeMonthsValue(entry.ageMonths, entry.ageYears);
      if (ageMonths === null) return;
      const height = persistNormalizeNumber(entry.height);
      const weight = persistNormalizeNumber(entry.weight);
      if (height === null && weight === null) return;
      if (omitCurrentDuplicate && persistIntakeEntryMatchesCurrentBasics(ageMonths, height, weight, currentBasics)) {
        return;
      }
      const key = [
        ageMonths,
        height !== null ? height.toFixed(3) : '',
        weight !== null ? weight.toFixed(3) : ''
      ].join('|');
      if (seen.has(key)) return;
      seen.add(key);
      out.push({
        ageMonths,
        ageYears: ageMonths / 12,
        height,
        weight
      });
    });
    out.sort((a, b) => a.ageMonths - b.ageMonths);
    return out;
  }

  function persistSanitizeIntakeRowsUI(rowsUI, options) {
    const opts = (options && typeof options === 'object') ? options : {};
    const currentBasics = persistNormalizeIntakeCurrentBasics(opts.currentBasics);
    const omitLockedCurrent = !!opts.omitLockedCurrent;
    const omitCurrentDuplicate = !!opts.omitCurrentDuplicate;
    if (!Array.isArray(rowsUI)) return [];

    const out = [];
    const seen = new Set();

    rowsUI.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      const fields = [item.ageY, item.ageM, item.ht, item.wt];
      const hasData = fields.some((value) => String(value ?? '').trim() !== '');
      if (!hasData) return;

      const isLocked = !!item.locked;
      if (omitLockedCurrent && isLocked && persistIntakeRowsUIMatchesCurrentBasics(item, currentBasics)) {
        return;
      }
      if (omitCurrentDuplicate && !isLocked && persistIntakeRowsUIMatchesCurrentBasics(item, currentBasics)) {
        return;
      }

      const normalized = {
        ageY: item.ageY ?? '',
        ageM: item.ageM ?? '',
        ht: item.ht ?? '',
        wt: item.wt ?? '',
        locked: isLocked,
        disabled: {
          ageY: !!(item.disabled && item.disabled.ageY),
          ageM: !!(item.disabled && item.disabled.ageM),
          ht: !!(item.disabled && item.disabled.ht),
          wt: !!(item.disabled && item.disabled.wt)
        }
      };

      const key = [
        normalized.ageY,
        normalized.ageM,
        normalized.ht,
        normalized.wt,
        normalized.locked ? '1' : '0',
        normalized.disabled.ageY ? '1' : '0',
        normalized.disabled.ageM ? '1' : '0',
        normalized.disabled.ht ? '1' : '0',
        normalized.disabled.wt ? '1' : '0'
      ].join('|');
      if (seen.has(key)) return;
      seen.add(key);
      out.push(normalized);
    });

    return out;
  }

  function readControlValue(el) {
    if (!el) return null;
    const type = (el.type || '').toLowerCase();
    if (type === 'checkbox') return !!el.checked;
    if (type === 'radio') return el.checked ? el.value : null;
    // Zachowujemy dokładny tekst (np. przecinki), żeby nie zgubić formatowania
    return (typeof el.value === 'string') ? el.value : '';
  }

  function readTrackedDataset(el) {
    if (!el || !el.id || !el.dataset) return null;
    const out = {};
    TRACKED_DATASET_PROPS.forEach((prop) => {
      try {
        if (Object.prototype.hasOwnProperty.call(el.dataset, prop)) {
          out[prop] = String(el.dataset[prop]);
        }
      } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 37999 });
    }
  }
    });
    return Object.keys(out).length ? out : null;
  }

  function storeTrackedDataset(persistState, el) {
    if (!persistState || !persistState.datasetById || !el || !el.id) return;
    const next = readTrackedDataset(el);
    if (next) {
      persistState.datasetById[el.id] = next;
    } else if (Object.prototype.hasOwnProperty.call(persistState.datasetById, el.id)) {
      delete persistState.datasetById[el.id];
    }
  }

  function applyTrackedDataset(el, saved) {
    if (!el || !el.dataset) return;
    TRACKED_DATASET_PROPS.forEach((prop) => {
      try {
        if (saved && Object.prototype.hasOwnProperty.call(saved, prop)) {
          el.dataset[prop] = String(saved[prop]);
        } else if (Object.prototype.hasOwnProperty.call(el.dataset, prop)) {
          delete el.dataset[prop];
        }
      } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38023 });
    }
  }
    });
  }

  const PERSIST_SAVE_DEBOUNCE_MS = 250;
  const PERSIST_FORCE_FLUSH_COALESCE_MS = 120;
  let saveTimer = null;
  let forceSaveTimer = null;
  let pendingPersistElementRefreshTimer = null;
  const pendingPersistElementRefreshQueue = [];
  let pendingRoot = null;
  let isRestoring = false;

  function isPersistClearInProgress() {
    try {
      const persistence = getPersistenceAdapter();
      if (persistence && typeof persistence.isClearInProgress === 'function') {
        return !!persistence.isClearInProgress();
      }
      if (typeof window === 'undefined') return false;
      return Number(window.__vildaPersistClearUntil || 0) > Date.now();
    } catch (_) {
      return false;
    }
  }

  function isPersistSuppressed() {
    try {
      const persistence = getPersistenceAdapter();
      if (persistence && typeof persistence.isAutosaveSuppressed === 'function') {
        return !!persistence.isAutosaveSuppressed();
      }
      if (typeof window === 'undefined') return false;
      const now = Date.now();
      const clearUntil = Number(window.__vildaPersistClearUntil || 0);
      const pauseUntil = Number(window.__vildaPersistPauseUntil || 0);
      return clearUntil > now || pauseUntil > now;
    } catch (_) {
      return false;
    }
  }

  function captureAdvancedGrowthRowsUI() {
    const rowsUI = [];
    try {
      document.querySelectorAll('#advMeasurements .measure-row').forEach(row => {
        const getVal = (sel) => {
          const el = row.querySelector(sel);
          return (el && typeof el.value === 'string') ? el.value : '';
        };
        const getChecked = (sel) => {
          const el = row.querySelector(sel);
          return !!(el && el.checked);
        };
        rowsUI.push({
          ageY: getVal('.adv-age-years'),
          ageM: getVal('.adv-age-months'),
          ht: getVal('.adv-height'),
          wt: getVal('.adv-weight'),
          boneAge: getVal('.adv-bone-age'),
          arrowEnabled: getChecked('.adv-arrow-enable'),
          arrowComment: getVal('.adv-arrow-comment'),
          ghSync: row.getAttribute('data-gh-sync') === 'true',
          ghId: row.getAttribute('data-gh-id') || ''
        });
      });
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38084 });
    }
  }
    return persistSanitizeAdvancedRowsUI(rowsUI);
  }

  function capturePersistGlobals(p) {
    if (!p || typeof p !== 'object') return;
    p.globals = (p.globals && typeof p.globals === 'object') ? p.globals : {};
    try {
      if (typeof window !== 'undefined') {
        const hasAdvancedModule = !!document.getElementById('advMeasurements');
        const hasBasicGrowthModule = !!document.getElementById('basicGrowthMeasurements');
        const hasIntakeModule = !!document.getElementById('intakeMeasurements');
        const hasFoodModule = !!document.getElementById('foodRowsSection') || !!document.getElementById('addFoodRowBtn');

        // Ten sam sharedUserData jest współdzielony między wszystkimi podstronami.
        // Gdy moduł nie istnieje na bieżącej stronie, nie wolno nadpisywać jego
        // kanonicznego stanu pustymi snapshotami.  Dotyczy to szczególnie
        // przejścia index.html -> docpro.html po imporcie JSON.

        if (hasAdvancedModule) {
          const hasAdvancedDataObject = !!(window.advancedGrowthData && typeof window.advancedGrowthData === 'object');
          const advancedRowsUI = captureAdvancedGrowthRowsUI();
          const advancedMeasurements = hasAdvancedDataObject
            ? persistSanitizeAdvancedMeasurementEntries(window.advancedGrowthData.measurements)
            : [];

          // Zapisz kanoniczny stan tylko wtedy, gdy naprawdę istnieje.
          // Nie nadpisuj poprawnego snapshotu wartością null na stronie, która
          // nie zdążyła jeszcze odbudować obiektu window.advancedGrowthData.
          if (hasAdvancedDataObject) {
            p.globals.advancedGrowthData = safeClone(window.advancedGrowthData);
          }

          // Jeżeli UI ma rzeczywiste wiersze – zapisz je.  Jeżeli UI jest puste,
          // ale dane kanoniczne zawierają historię, zachowaj poprzedni snapshot UI
          // zamiast wpisywać pustą tablicę.  To zapobiega znikaniu historii po
          // przejściu na docpro.html i powrocie na stronę główną.
          if (advancedRowsUI.length > 0) {
            p.globals.advancedGrowthRowsUI = advancedRowsUI;
          } else if (advancedMeasurements.length === 0) {
            p.globals.advancedGrowthRowsUI = [];
          }
        }

        if (hasBasicGrowthModule) {
          if (window.basicGrowthData && typeof window.basicGrowthData === 'object') {
            p.globals.basicGrowthData = safeClone(window.basicGrowthData);
          } else {
            p.globals.basicGrowthData = null;
          }
        }


if (hasIntakeModule) {
  const intakeCurrentBasics = persistReadCurrentIntakeBasics();
  const intakeHistory = Array.isArray(window.intakeHistory)
    ? persistSanitizeIntakeHistoryEntries(window.intakeHistory, {
        currentBasics: intakeCurrentBasics,
        omitCurrentDuplicate: !!intakeCurrentBasics
      })
    : [];

  p.globals.intakeHistory = intakeHistory;
  if (typeof window.intakeEstimatedKcalPerDay === 'number' && isFinite(window.intakeEstimatedKcalPerDay)) {
    p.globals.intakeEstimatedKcalPerDay = window.intakeEstimatedKcalPerDay;
  } else {
    p.globals.intakeEstimatedKcalPerDay = null;
  }

  try {
    const rowsUI = [];
    document.querySelectorAll('#intakeMeasurements .measure-row-intake').forEach(row => {
      const getVal = (sel) => {
        const el = row.querySelector(sel);
        return (el && typeof el.value === 'string') ? el.value : '';
      };
      const getDis = (sel) => {
        const el = row.querySelector(sel);
        return !!(el && el.disabled);
      };
      rowsUI.push({
        ageY: getVal('.intake-ageY'),
        ageM: getVal('.intake-ageM'),
        ht:   getVal('.intake-ht'),
        wt:   getVal('.intake-wt'),
        locked: row.dataset.locked === 'true',
        disabled: {
          ageY: getDis('.intake-ageY'),
          ageM: getDis('.intake-ageM'),
          ht:   getDis('.intake-ht'),
          wt:   getDis('.intake-wt')
        }
      });
    });
    const sanitizedRowsUI = persistSanitizeIntakeRowsUI(rowsUI, {
      currentBasics: intakeCurrentBasics,
      omitLockedCurrent: !!intakeCurrentBasics,
      omitCurrentDuplicate: !!intakeCurrentBasics
    });
    if (sanitizedRowsUI.length > 0) {
      p.globals.intakeRowsUI = sanitizedRowsUI;
    } else if (intakeHistory.length === 0) {
      p.globals.intakeRowsUI = [];
    }
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38188 });
    }
  }
}

        const growthSourceToggle = document.getElementById('dataToggleContainer');
        if (growthSourceToggle) {
          storeTrackedDataset(p, growthSourceToggle);
        }

        if (hasFoodModule) {
          try {
            const rows = [];
            document.querySelectorAll('.food-row').forEach(row => {
              const sel = row.querySelector('select');
              const inp = row.querySelector('input[type="number"]');
              if (!sel || !inp) return;
              rows.push({ key: (sel.value || ''), qty: (inp.value || '').toString() });
            });
            p.globals.foodRows = rows;
          } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38201 });
    }
  }
        }

        if (Array.isArray(window.ghTherapyPoints)) {
          p.globals.ghTherapyPoints = safeClone(window.ghTherapyPoints);
        }

        if (typeof window.currentVersion === 'string' && window.currentVersion) {
          p.globals.clcrCurrentVersion = window.currentVersion;
        } else if (typeof window.currentVersion !== 'undefined') {
          p.globals.clcrCurrentVersion = String(window.currentVersion);
        }

        const hasPrevSummaryModule = !!document.getElementById('prevSummaryWrap')
          || !!document.getElementById('prevSummaryCard')
          || !!document.getElementById('restoreStateBtn');
        if (hasPrevSummaryModule) {
          const loadedComparisonData = (window.lastLoadedData && typeof window.lastLoadedData === 'object')
            ? (safeClone(window.lastLoadedData) || window.lastLoadedData)
            : null;
          if (loadedComparisonData) {
            p.globals.loadedComparisonData = loadedComparisonData;
            p.globals.hasUserModifiedAfterLoad = !!window.hasUserModifiedAfterLoad;
          } else {
            const wrap = document.getElementById('prevSummaryWrap');
            const card = document.getElementById('prevSummaryCard');
            const restoreBtn = document.getElementById('restoreStateBtn');
            const hasLoadedUi = !!(
              (card && card.dataset && card.dataset.loaded === 'true')
              || (wrap && wrap.dataset && wrap.dataset.loaded === 'true')
            );
            const restoreVisible = !!(restoreBtn && restoreBtn.style && restoreBtn.style.display !== 'none');
            if (!hasLoadedUi && !restoreVisible) {
              p.globals.loadedComparisonData = null;
              p.globals.hasUserModifiedAfterLoad = false;
            }
          }
        }
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38240 });
    }
  }
  }

  function clearPersistAutosaveTimer(timerName) {
    try {
      if (timerName === 'save' && saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      if (timerName === 'force' && forceSaveTimer) {
        clearTimeout(forceSaveTimer);
        forceSaveTimer = null;
      }
      if (timerName === 'element-refresh' && pendingPersistElementRefreshTimer) {
        clearTimeout(pendingPersistElementRefreshTimer);
        pendingPersistElementRefreshTimer = null;
      }
    } catch (error) {
      vildaLogAppWarn('app:persistence', 'Nie udało się wyczyścić timera autosave', error, { timerName });
    }
  }

  function cancelPersistAutosaveTimers(options) {
    const opts = options || {};
    clearPersistAutosaveTimer('save');
    clearPersistAutosaveTimer('force');
    clearPersistAutosaveTimer('element-refresh');
    if (opts.dropQueuedElements !== false) {
      pendingPersistElementRefreshQueue.length = 0;
    }
  }

  function drainQueuedPersistElementRefreshes() {
    clearPersistAutosaveTimer('element-refresh');
    if (!pendingPersistElementRefreshQueue.length) return;
    const queue = pendingPersistElementRefreshQueue.splice(0);
    queue.forEach((el) => {
      try { updatePersistFromElement(el); } catch (error) {
        vildaLogAppError('app:persistence', 'Błąd scalenia opóźnionego autosave elementu', error);
      }
    });
  }

  function queuePersistElementRefresh(el) {
    if (!el || isRestoring || isPersistSuppressed()) return false;
    try {
      if (pendingPersistElementRefreshQueue.indexOf(el) === -1) {
        pendingPersistElementRefreshQueue.push(el);
      }
      if (!pendingPersistElementRefreshTimer) {
        pendingPersistElementRefreshTimer = setTimeout(() => {
          pendingPersistElementRefreshTimer = null;
          drainQueuedPersistElementRefreshes();
        }, 0);
      }
      return true;
    } catch (error) {
      vildaLogAppError('app:persistence', 'Błąd kolejkowania opóźnionego autosave elementu', error);
      return false;
    }
  }

  function scheduleForcedPersistFlush(reason) {
    if (isRestoring || isPersistClearInProgress()) return false;
    clearPersistAutosaveTimer('force');
    forceSaveTimer = setTimeout(() => {
      forceSaveTimer = null;
      try {
        flushPersistNow({ force: true, reason: reason || 'coalesced-force-flush' });
      } catch (error) {
        vildaLogAppError('app:persistence', 'Błąd scalonego wymuszonego flush autosave', error, { reason: reason || null });
      }
    }, PERSIST_FORCE_FLUSH_COALESCE_MS);
    return true;
  }

  function getPersistAutosaveCoalescingSnapshot() {
    return {
      step: '8Q-3',
      saveDebounceMs: PERSIST_SAVE_DEBOUNCE_MS,
      forceFlushCoalesceMs: PERSIST_FORCE_FLUSH_COALESCE_MS,
      hasPendingSaveTimer: !!saveTimer,
      hasPendingForceSaveTimer: !!forceSaveTimer,
      hasPendingElementRefreshTimer: !!pendingPersistElementRefreshTimer,
      pendingElementRefreshCount: pendingPersistElementRefreshQueue.length
    };
  }

  function flushPersistNow(options) {
    const force = !!(options && options.force);
    if (isRestoring || isPersistClearInProgress() || (isPersistSuppressed() && !force)) {
      cancelPersistAutosaveTimers();
      pendingRoot = null;
      return;
    }
    try {
      drainQueuedPersistElementRefreshes();
      cancelPersistAutosaveTimers({ dropQueuedElements: false });
      const root = pendingRoot || loadShared();
      pendingRoot = null;
      const r = ensurePersist(root);
      syncPersistSharedSexFromDom(r);
      syncPersistLockFlags(r);
      const p = r[PKEY];
      capturePersistGlobals(p);
      syncPersistSharedSexFromDom(r);
      syncPersistLockFlags(r);
      if (!persistHasMeaningfulCurrentFormData(r)) {
        resetLoadedComparisonUiResidue();
        clearSharedAutosaveResidue('app:persistence-empty-autosave');
        return;
      }
      p.updatedAtISO = new Date().toISOString();
      saveShared(r, { force });
    } catch (error) {
      vildaLogAppError('app:persistence', 'Nie udało się wykonać flushPersistNow', error, { force });
    }
  }

  function scheduleSave() {
    if (isRestoring || isPersistSuppressed()) return;
    clearPersistAutosaveTimer('save');
    saveTimer = setTimeout(() => {
      saveTimer = null;
      flushPersistNow();
    }, PERSIST_SAVE_DEBOUNCE_MS);
  }

  function updatePersistFromElement(el) {
    if (!el || isRestoring || isPersistSuppressed()) return;
    const tag = (el.tagName || '').toUpperCase();
    if (!(tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA')) return;

    // Pomijamy przyciski/submit/reset/file
    if (tag === 'INPUT') {
      const t = (el.type || '').toLowerCase();
      if (t === 'button' || t === 'submit' || t === 'reset' || t === 'file') return;
    }

    const root = pendingRoot || loadShared();
    pendingRoot = ensurePersist(root);
    syncPersistLockFlags(pendingRoot);
    const p = pendingRoot[PKEY];

    const type = (el.type || '').toLowerCase();

    // Radio: zapisujemy wybór całej grupy w p.radio[name]
    if (type === 'radio') {
      if (el.name) {
        const v = readControlValue(el);
        if (v !== null) {
          p.radio[el.name] = v;
        }
        if (el.name === 'dataSource') {
          const growthSourceToggle = document.getElementById('dataToggleContainer');
          if (growthSourceToggle) storeTrackedDataset(p, growthSourceToggle);
        }
      }
      // Jeśli radio ma id, zapisujemy też jego stan checked, aby móc odtworzyć w nietypowych przypadkach
      if (el.id) {
        p.byId[el.id] = !!el.checked;
        storeTrackedDataset(p, el);
      }
      scheduleSave();
      return;
    }

    // Checkbox
    if (type === 'checkbox') {
      const v = readControlValue(el);
      if (el.id) {
        p.byId[el.id] = v;
        if (BASIC_ROOT_KEYS.has(el.id)) pendingRoot[el.id] = v;
        storeTrackedDataset(p, el);
      } else if (el.name) {
        // Checkboxy bez id – zapisuj po name jako boolean lub listę wartości (gdy grupa)
        let nodes = null;
        try {
          nodes = document.querySelectorAll('input[type="checkbox"][name="' + cssEscape(el.name) + '"]');
        } catch (_) {
          nodes = null;
        }
        if (nodes && nodes.length > 1) {
          const arr = [];
          nodes.forEach(n => { if (n && n.checked) arr.push(n.value || 'on'); });
          p.byName[el.name] = arr;
        } else {
          p.byName[el.name] = v;
        }
      }
      scheduleSave();
      return;
    }

    // Pozostałe input/select/textarea
    const v = readControlValue(el);
    if (el.id) {
      p.byId[el.id] = v;
      if (BASIC_ROOT_KEYS.has(el.id)) pendingRoot[el.id] = v;
      // Synchronizacja synonimów name/fullName (krok 8Q-3b):
      // userData.js mapuje oba pola na klucz 'name' w sharedUserData.
      // Persist runtime zapisuje pod id elementu (name lub fullName).
      // Bez tej synchronizacji pendingRoot.name (lub .fullName) pozostaje
      // z przestarzałą wartością z momentu loadShared() i przy flush
      // nadpisuje poprawną wartość zapisaną przez userData.js w bubble-phase.
      if (el.id === 'name') { pendingRoot.fullName = v; p.byId.fullName = v; }
      if (el.id === 'fullName') { pendingRoot.name = v; p.byId.name = v; }
      storeTrackedDataset(p, el);
    } else if (el.name) {
      p.byName[el.name] = v;
    }

    scheduleSave();
  }

  function isAdvancedGrowthCriticalTarget(target) {
    try {
      if (!target || typeof target.closest !== 'function') return false;
      if (target.closest('#advMeasurements')) return true;
      const id = target.id || '';
      return id === 'advMotherHeight' || id === 'advFatherHeight' || id === 'advBoneAge' || id === 'advTesticularVolume' || id === 'advFamilyDelayedPuberty' || id === 'advGrowthExclusion';
    } catch (_) {
      return false;
    }
  }

  // Podłącz autosave (capture = true, żeby „złapać” zmiany zanim inne moduły nadpiszą stan)
  document.addEventListener('input', function (ev) {
    const target = ev.target;
    try { updatePersistFromElement(target); } catch (error) { vildaLogAppError('app:persistence', 'Błąd autosave przy zdarzeniu input', error); }
    try {
      queuePersistElementRefresh(target);
      if (isAdvancedGrowthCriticalTarget(target)) {
        scheduleForcedPersistFlush('advanced-growth-critical-input');
      }
    } catch (error) {
      vildaLogAppError('app:persistence', 'Błąd planowania autosave przy zdarzeniu input', error);
    }
  }, true);
  document.addEventListener('change', function (ev) {
    const target = ev.target;
    try { updatePersistFromElement(target); } catch (error) { vildaLogAppError('app:persistence', 'Błąd autosave przy zdarzeniu change', error); }
    try {
      queuePersistElementRefresh(target);
      if (isAdvancedGrowthCriticalTarget(target)) {
        scheduleForcedPersistFlush('advanced-growth-critical-change');
      }
    } catch (error) {
      vildaLogAppError('app:persistence', 'Błąd planowania autosave przy zdarzeniu change', error);
    }
  }, true);
  document.addEventListener('click', function (ev) {
    try {
      const target = ev.target;
      if (!target || typeof target.closest !== 'function') return;
      if (target.closest('#advAddMeasurementBtn') || target.closest('#advMeasurements .remove-measure')) {
        scheduleForcedPersistFlush('advanced-growth-measurement-list-click');
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38402 });
    }
  }
  }, true);

  // ── Ochrona PII przy nagłym zamknięciu okna (audyt — Opcja A) ──────────
  // Gdy okno zamyka się BEZ wykonania normalnego lock (crash przeglądarki,
  // wymuszone zamknięcie laptopa, kill -9 procesu), listener onLock z
  // vilda_auth_ui.js nie zdąży uruchomić clearAllData() i pole `name` pacjenta
  // zostaje w plaintext w localStorage.sharedUserData. Ten helper sprawdza
  // stan vault i — jeśli zalokowany lub brak (tryb gość) — usuwa name/fullName/
  // nameLocked z sharedUserData. Wywoływany PO flushPersistNow w listenerach
  // lifecycle, więc nadpisuje wynik flushu (kolejność deterministyczna w obrębie
  // tego samego dispatch tick).
  //
  // Gdy vault jest UNLOCKED, helper no-opuje. Feature inter-page persistence
  // pola name (userData.js + custom-fixes.js — przenoszenie imienia między
  // index.html / docpro.html / kalkulator-klirens.html w aktywnej sesji)
  // działa bez zmian. Ochrona dotyczy wyłącznie scenariusza „vault zalokowany
  // lub trybu gość przy zamykaniu okna".
  function clearLockedNameInShared(source) {
    try {
      var V = (typeof window !== 'undefined') ? window.VildaVault : null;
      var unlocked = !!(V && typeof V.isUnlocked === 'function' && V.isUnlocked());
      if (unlocked) return; // vault aktywny — feature inter-page persistence name zostaje
      if (typeof window === 'undefined' || !window.localStorage) return;
      var raw = window.localStorage.getItem('sharedUserData');
      if (!raw) return;
      var data;
      try { data = JSON.parse(raw); } catch (_) { return; }
      if (!data || typeof data !== 'object') return;
      if (data.name == null && data.fullName == null && data.nameLocked == null) return;
      delete data.name;
      delete data.fullName;
      delete data.nameLocked;
      try {
        window.localStorage.setItem('sharedUserData', JSON.stringify(data));
      } catch (writeErr) {
        vildaLogAppError('app:persistence', 'Błąd usunięcia name z sharedUserData (' + (source || '') + ')', writeErr);
      }
    } catch (error) {
      try { vildaLogAppError('app:persistence', 'Błąd clearLockedNameInShared (' + (source || '') + ')', error); } catch (_) {}
    }
  }

  try {
    if (typeof window !== 'undefined') {
      window.vildaPersistScheduleSave = scheduleSave;
      window.vildaPersistFlushNow = flushPersistNow;
      window.vildaGetPersistAutosaveCoalescingSnapshot = getPersistAutosaveCoalescingSnapshot;
      // Eksponujemy restoreAll() aby vilda_auth_ui mógł przywrócić stan formularza
      // po ponownym zalogowaniu tego samego użytkownika (bez przeładowania strony).
      window.vildaPersistRestoreAll = restoreAll;
      window.addEventListener('pagehide', function () {
        try { flushPersistNow({ force: true }); } catch (error) { vildaLogAppError('app:persistence', 'Błąd flushPersistNow przy pagehide', error); }
        clearLockedNameInShared('pagehide');
      }, true);
      window.addEventListener('beforeunload', function () {
        try { flushPersistNow({ force: true }); } catch (error) { vildaLogAppError('app:persistence', 'Błąd flushPersistNow przy beforeunload', error); }
        clearLockedNameInShared('beforeunload');
      }, true);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', function () {
        var isHidden = false;
        try {
          isHidden = (document.visibilityState === 'hidden');
          if (isHidden) flushPersistNow({ force: true });
        } catch (error) {
          vildaLogAppError('app:persistence', 'Błąd flushPersistNow przy visibilitychange', error);
        }
        if (isHidden) clearLockedNameInShared('visibilitychange-hidden');
      }, true);
    }
  } catch (error) {
    vildaLogAppError('app:persistence', 'Nie udało się podpiąć awaryjnych listenerów persistence', error);
  }

  function applyToElement(el, storedValue, touched) {
    if (!el) return;
    const tag = (el.tagName || '').toUpperCase();
    if (!(tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA')) return;

    const type = (el.type || '').toLowerCase();

    if (type === 'radio') {
      // radio odtwarzamy grupowo
      return;
    }
    if (type === 'checkbox') {
      const boolVal = (storedValue === true || storedValue === 'true' || storedValue === 1 || storedValue === '1');
      if (el.checked !== boolVal) {
        el.checked = boolVal;
        touched.push(el);
      }
      return;
    }

    const s = (storedValue == null) ? '' : String(storedValue);
    if (el.value !== s) {
      el.value = s;
      touched.push(el);
    }
  }


  function persistHasMeaningfulLoadedComparisonData(data) {
    try {
      const adapter = (typeof window !== 'undefined') ? window.VildaDataImportExport : null;
      if (adapter && typeof adapter.hasMeaningfulMainSessionData === 'function') {
        return !!adapter.hasMeaningfulMainSessionData(data);
      }
    } catch (_) {
      // fallback poniżej
    }
    try {
      if (!data || typeof data !== 'object' || data.version !== 1) return false;
      const hasText = (value) => typeof value === 'string' && value.trim().length > 0;
      const hasPositive = (value) => {
        if (value === null || value === undefined || value === '') return false;
        const n = Number(value);
        return Number.isFinite(n) && n > 0;
      };
      if (hasText(data.name)) return true;
      const user = data.user && typeof data.user === 'object' ? data.user : {};
      if (hasPositive(user.age) || hasPositive(user.ageMonths) || hasPositive(user.weight) || hasPositive(user.height) || hasPositive(user.waist) || hasPositive(user.hip)) return true;
      const advanced = data.advanced && typeof data.advanced === 'object' ? data.advanced : {};
      if (hasPositive(advanced.boneAgeYears) || hasPositive(advanced.motherHeight) || hasPositive(advanced.fatherHeight) || hasText(advanced.testicularVolume) || hasText(advanced.familyDelayedPuberty) || hasText(advanced.growthExclusion)) return true;
      const advData = advanced.data && typeof advanced.data === 'object' ? advanced.data : {};
      if (Array.isArray(advData.measurements) && advData.measurements.length > 0) return true;
      const basicData = data.growthBasic && data.growthBasic.data && typeof data.growthBasic.data === 'object' ? data.growthBasic.data : {};
      if (Array.isArray(basicData.measurements) && basicData.measurements.length > 0) return true;
      const intake = data.intake && typeof data.intake === 'object' ? data.intake : {};
      if (Array.isArray(intake.history) && intake.history.length > 0) return true;
      if (hasPositive(intake.estKcalPerDay)) return true;
      const foodsData = data.foods && typeof data.foods === 'object' ? data.foods : {};
      if (Array.isArray(foodsData.snacks) && foodsData.snacks.length > 0) return true;
      if (Array.isArray(foodsData.meals) && foodsData.meals.length > 0) return true;
      if (Array.isArray(data.ghTherapyPoints) && data.ghTherapyPoints.length > 0) return true;
    } catch (_) {
      return false;
    }
    return false;
  }

  function persistNonEmptyTextValue(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  function persistPositiveNumberValue(value) {
    if (value === null || value === undefined || value === '') return false;
    const n = Number(value);
    return Number.isFinite(n) && n > 0;
  }

  function persistArrayHasItems(value) {
    return Array.isArray(value) && value.length > 0;
  }

  function persistMeasurementArrayHasPayload(entries) {
    if (!Array.isArray(entries)) return false;
    return entries.some((entry) => {
      if (!entry || typeof entry !== 'object') return false;
      return persistPositiveNumberValue(entry.ageMonths)
        || persistPositiveNumberValue(entry.ageYears)
        || persistPositiveNumberValue(entry.height)
        || persistPositiveNumberValue(entry.weight)
        || persistPositiveNumberValue(entry.boneAgeYears)
        || entry.arrowEnabled === true
        || persistNonEmptyTextValue(entry.arrowComment)
        || entry.ghSync === true
        || persistNonEmptyTextValue(entry.ghId);
    });
  }

  function persistGrowthDataHasPayload(data) {
    if (!data || typeof data !== 'object') return false;
    if (persistMeasurementArrayHasPayload(data.measurements)) return true;
    return persistPositiveNumberValue(data.currentAgeMonths)
      || persistPositiveNumberValue(data.currentHeight)
      || persistPositiveNumberValue(data.currentWeight)
      || persistPositiveNumberValue(data.boneAgeMonths)
      || data.currentArrowEnabled === true
      || persistNonEmptyTextValue(data.currentArrowComment);
  }

  function persistFoodRowsHavePayload(rows) {
    return Array.isArray(rows) && rows.some((row) => {
      if (!row || typeof row !== 'object') return false;
      const qty = Number(row.qty);
      return persistNonEmptyTextValue(row.key) && Number.isFinite(qty) && qty > 0;
    });
  }

  function persistRowsUiHavePayload(rows, selectors) {
    if (!Array.isArray(rows)) return false;
    return rows.some((row) => {
      if (!row || typeof row !== 'object') return false;
      const keys = Array.isArray(selectors) ? selectors : Object.keys(row);
      return keys.some((key) => persistNonEmptyTextValue(row[key]) || persistPositiveNumberValue(row[key]));
    });
  }

  function persistHasMeaningfulCurrentFormData(root, options) {
    const opts = options && typeof options === 'object' ? options : {};
    try {
      if (!opts.skipDomCollect) {
        const adapter = (typeof window !== 'undefined') ? window.VildaDataImportExport : null;
        if (adapter
            && typeof adapter.collectUserData === 'function'
            && typeof adapter.hasMeaningfulMainSessionData === 'function') {
          const data = adapter.collectUserData();
          if (adapter.hasMeaningfulMainSessionData(data)) return true;
        }
      }
    } catch (_) {
      // fallback poniżej
    }

    try {
      const r = root && typeof root === 'object' ? root : {};
      const p = r[PKEY] && typeof r[PKEY] === 'object' ? r[PKEY] : {};
      const byId = p.byId && typeof p.byId === 'object' ? p.byId : {};
      const globals = p.globals && typeof p.globals === 'object' ? p.globals : {};

      const getValue = (id) => Object.prototype.hasOwnProperty.call(r, id) ? r[id] : byId[id];

      if (['name', 'advName', 'basicGrowthName', 'fullName'].some((id) => persistNonEmptyTextValue(getValue(id)))) return true;
      if (['age', 'ageMonths', 'weight', 'height', 'waistCm', 'hipCm', 'advBoneAge', 'advMotherHeight', 'advFatherHeight',
           'palFactor', 'heartRate', 'hrTemperature', 'bpSystolic', 'bpDiastolic', 'adultHeartRate', 'adultBpSystolic',
           'adultBpDiastolic', 'respiratoryRateInput', 'respTemperature', 'headCircumference', 'chestCircumference',
           'headCircumDS'].some((id) => persistPositiveNumberValue(getValue(id)))) return true;
      if (['advTesticularVolume', 'advFamilyDelayedPuberty', 'advGrowthExclusion', 'pwzNumber',
           'bisphosIndication', 'bisphosDrug', 'bisphosDoseNumber'].some((id) => persistNonEmptyTextValue(getValue(id)))) return true;

      if (persistGrowthDataHasPayload(globals.advancedGrowthData)) return true;
      if (persistGrowthDataHasPayload(globals.basicGrowthData)) return true;
      if (persistMeasurementArrayHasPayload(globals.intakeHistory)) return true;
      if (persistRowsUiHavePayload(globals.advancedGrowthRowsUI, ['ageY', 'ageM', 'ht', 'wt', 'boneAge', 'arrowComment'])) return true;
      if (persistRowsUiHavePayload(globals.intakeRowsUI, ['ageY', 'ageM', 'ht', 'wt'])) return true;
      if (persistPositiveNumberValue(globals.intakeEstimatedKcalPerDay)) return true;
      if (persistFoodRowsHavePayload(globals.foodRows)) return true;
      if (persistArrayHasItems(globals.ghTherapyPoints)) return true;
    } catch (_) {
      return false;
    }

    return false;
  }

  function clearSharedAutosaveResidue(source) {
    cancelPersistAutosaveTimers();
    pendingRoot = null;

    try {
      const persistence = getPersistenceAdapter();
      if (persistence && typeof persistence.clearShared === 'function') {
        persistence.clearShared({ markClear: false, source: source || 'app:persistence-empty-shared' });
      } else if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem('sharedUserData');
      }
    } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', _, { feature: 'persist:clear-shared-autosave-residue', source: source || 'unknown' });
      }
    }

    try {
      const persistence = getPersistenceAdapter();
      if (persistence && typeof persistence.clearMainSession === 'function') {
        persistence.clearMainSession();
      } else if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.removeItem('vildaMainSessionV1');
      }
    } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', _, { feature: 'persist:clear-main-session-autosave-residue', source: source || 'unknown' });
      }
    }
  }

  function resetLoadedComparisonUiResidue() {
    try { window.lastLoadedData = null; } catch (_) {}
    try { window.prevMeasurementInfo = null; } catch (_) {}
    try { window.hasUserModifiedAfterLoad = false; } catch (_) {}
    try {
      const rb = document.getElementById('restoreStateBtn');
      if (rb) rb.style.display = 'none';
      const wrap = document.getElementById('prevSummaryWrap');
      const card = document.getElementById('prevSummaryCard');
      const toggle = document.getElementById('togglePrevSummary');
      const content = document.getElementById('prevSummaryContent');
      [wrap, card].forEach((el) => {
        if (!el) return;
        el.style.display = 'none';
        if (el.dataset && Object.prototype.hasOwnProperty.call(el.dataset, 'loaded')) delete el.dataset.loaded;
      });
      if (toggle) toggle.style.display = 'none';
      if (content) {
        if (typeof vildaAppClearHtml === 'function') vildaAppClearHtml(content);
        else content.innerHTML = '';
      }
    } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', _, { feature: 'persist:reset-loaded-comparison-ui-residue' });
      }
    }
  }

  function normalizeLoadedComparisonPersistResidue(root, persistState, globalsState) {
    try {
      if (!globalsState || typeof globalsState !== 'object') return;
      const loaded = globalsState.loadedComparisonData;
      if (!loaded || typeof loaded !== 'object') return;
      if (persistHasMeaningfulLoadedComparisonData(loaded)) return;

      globalsState.loadedComparisonData = null;
      globalsState.hasUserModifiedAfterLoad = false;

      // Pusty snapshot sesji po clear mógł zapisać płeć jako zablokowaną tylko dlatego,
      // że applyLoadedData() potraktowało domyślne "M" jak zaimportowany JSON.
      // Jeżeli sam snapshot porównawczy nie niesie danych klinicznych, zdejmij tę blokadę.
      if (root && typeof root === 'object' && root.sexLocked) {
        delete root.sexLocked;
      }
      if (persistState && persistState.byId && typeof persistState.byId === 'object') {
        delete persistState.byId.sex;
      }
      try {
        const sexEl = document.getElementById('sex');
        if (sexEl) sexEl.disabled = false;
      } catch (_) {
        // no-op
      }
    } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', _, { feature: 'persist:normalize-empty-loaded-comparison' });
      }
    }
  }

  function restoreAll() {
    let root = ensurePersist(loadShared());
    let p = root[PKEY] || {};
    const touched = [];
    // Dane potrzebne do odbudowy karty porównania poprzedniego pomiaru
    // muszą być dostępne także po wyjściu z wewnętrznego bloku restore UI.
    // W poprzedniej wersji `g` było zdefiniowane tylko wewnątrz zagnieżdżonego
    // try/finally, więc etap odtwarzania comparisonData wpadał w ReferenceError
    // połykany przez catch i karta porównawcza nie wracała po odświeżeniu.
    let g = (p.globals && typeof p.globals === 'object') ? p.globals : {};
    normalizeLoadedComparisonPersistResidue(root, p, g);
    if (!persistHasMeaningfulCurrentFormData(root, { skipDomCollect: true })) {
      clearSharedAutosaveResidue('app:persistence-empty-restore');
      resetLoadedComparisonUiResidue();
      root = ensurePersist({});
      p = root[PKEY] || {};
      g = {};
    }
    try {
      if (typeof window !== 'undefined') {
        window.__vildaSuspendAdvIntakeSync = true;
        window.__vildaSuspendGrowthHistoryCrossSync = true;
        window.__vildaPersistRestoring = true;
        window.__vildaSuspendIntakeUserReset = true;
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38473 });
    }
  }
    isRestoring = true;

    try {
      try {
      // 1) Odtwórz wybrane atrybuty dataset po ID, zanim późniejsze moduły
      // skorzystają z tych flag podczas własnej inicjalizacji.
      const datasetById = (p.datasetById && typeof p.datasetById === 'object') ? p.datasetById : {};
      Object.keys(datasetById).forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        applyTrackedDataset(el, datasetById[id]);
      });

      // 2) Odtwórz pola po ID
      const byId = (p.byId && typeof p.byId === 'object') ? p.byId : {};
      Object.keys(byId).forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        applyToElement(el, byId[id], touched);
      });

      // 2) Odtwórz grupy radio
      const radios = (p.radio && typeof p.radio === 'object') ? p.radio : {};
      Object.keys(radios).forEach(name => {
        const val = radios[name];
        if (val == null) return;
        let nodes = null;
        try {
          nodes = document.querySelectorAll('input[type="radio"][name="' + cssEscape(name) + '"]');
        } catch (_) {
          nodes = null;
        }
        if (!nodes || nodes.length === 0) return;
        nodes.forEach(n => {
          const should = (n.value === String(val));
          if (n.checked !== should) {
            n.checked = should;
            touched.push(n);
          }
        });
      });

      // 3) Odtwórz pola po name (dla elementów bez id)
      const byName = (p.byName && typeof p.byName === 'object') ? p.byName : {};
      Object.keys(byName).forEach(name => {
        const nodes = document.getElementsByName(name);
        if (!nodes || !nodes.length) return;
        const stored = byName[name];

        if (Array.isArray(stored)) {
          // Grupa checkboxów
          Array.from(nodes).forEach(n => {
            if (!n || (n.type || '').toLowerCase() !== 'checkbox') return;
            const should = stored.includes(n.value || 'on');
            if (n.checked !== should) {
              n.checked = should;
              touched.push(n);
            }
          });
        } else {
          // Pojedyncza kontrolka
          const el = nodes[0];
          applyToElement(el, stored, touched);
        }
      });

      // 4) Odtwórz dynamiczne sekcje / globalne dane

      // Zaawansowane obliczenia wzrostowe (historia + komentarze)
      const restoredAdvancedRowsUI = persistSanitizeAdvancedRowsUI(g.advancedGrowthRowsUI);
      if (restoredAdvancedRowsUI.length && typeof window.vildaRehydrateAdvancedRowsUI === 'function') {
        try {
          const fnRows = window.vildaRehydrateAdvancedRowsUI;
          if (typeof fnRows === 'function') fnRows(restoredAdvancedRowsUI);
        } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38548 });
    }
  }
      } else if (g.advancedGrowthData && typeof g.advancedGrowthData === 'object') {
        try { window.advancedGrowthData = safeClone(g.advancedGrowthData) || g.advancedGrowthData; } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38550 });
    }
  }
        try {
          const fn = window.vildaRehydrateAdvancedFromState;
          if (typeof fn === 'function') fn();
        } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38554 });
    }
  }
      }

      if (g.basicGrowthData && typeof g.basicGrowthData === 'object') {
        try { window.basicGrowthData = safeClone(g.basicGrowthData) || g.basicGrowthData; } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38558 });
    }
  }
        try {
          const fnBasic = window.vildaRehydrateBasicGrowthFromState;
          if (typeof fnBasic === 'function') fnBasic();
        } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38562 });
    }
  }
      }


// Szacowane spożycie energii – pełny stan wierszy (UI)
const intakeCurrentBasics = persistReadCurrentIntakeBasics();
const restoredIntakeRowsUI = persistSanitizeIntakeRowsUI(g.intakeRowsUI, {
  currentBasics: intakeCurrentBasics,
  omitLockedCurrent: !!intakeCurrentBasics,
  omitCurrentDuplicate: !!intakeCurrentBasics
});
if (restoredIntakeRowsUI.length && typeof window.intakeAddRow === 'function') {
  try {
    const wrap = document.getElementById('intakeMeasurements');
    if (wrap) vildaAppClearHtml(wrap);

    if (intakeCurrentBasics) {
      try {
        window.intakeAddRow({
          ageMonths: intakeCurrentBasics.ageMonths,
          height: intakeCurrentBasics.height,
          weight: intakeCurrentBasics.weight
        });
      } catch (_) {
        window.intakeAddRow();
      }
    }

    restoredIntakeRowsUI.forEach(r => {
      try {
        window.intakeAddRow();
        const rows = document.querySelectorAll('#intakeMeasurements .measure-row-intake');
        const row = rows[rows.length - 1];
        if (!row || !r) return;

        const setVal = (sel, v) => {
          const el = row.querySelector(sel);
          if (!el) return;
          el.value = (v == null) ? '' : String(v);
          touched.push(el);
        };
        const setDis = (sel, d) => {
          const el = row.querySelector(sel);
          if (!el) return;
          el.disabled = !!d;
        };
        const setLocked = (locked) => {
          if (locked) row.dataset.locked = 'true';
          else delete row.dataset.locked;
        };

        setVal('.intake-ageY', r.ageY);
        setVal('.intake-ageM', r.ageM);
        setVal('.intake-ht',   r.ht);
        setVal('.intake-wt',   r.wt);

        if (r.disabled && typeof r.disabled === 'object') {
          setDis('.intake-ageY', r.disabled.ageY);
          setDis('.intake-ageM', r.disabled.ageM);
          setDis('.intake-ht',   r.disabled.ht);
          setDis('.intake-wt',   r.disabled.wt);
        }

        const shouldLock = !intakeCurrentBasics && !!(r.locked || (r.disabled && r.disabled.ageY && r.disabled.ageM && r.disabled.ht && r.disabled.wt));
        setLocked(shouldLock);
      } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38627 });
    }
  }
    });

    if (intakeCurrentBasics && typeof _updateIntakeFirstRowFromUserBasics === 'function') {
      _updateIntakeFirstRowFromUserBasics();
    }
    if (typeof window.updateIntakeRemoveButtons === 'function') window.updateIntakeRemoveButtons();
    if (typeof window.calcEstimatedIntake === 'function') window.calcEstimatedIntake();
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38635 });
    }
  }
} else if (Array.isArray(g.intakeHistory)) {
  try {
    window.intakeHistory = persistSanitizeIntakeHistoryEntries(safeClone(g.intakeHistory) || g.intakeHistory, {
      currentBasics: intakeCurrentBasics,
      omitCurrentDuplicate: !!intakeCurrentBasics
    });
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38642 });
    }
  }
  try {
    if (typeof g.intakeEstimatedKcalPerDay === 'number' && isFinite(g.intakeEstimatedKcalPerDay)) {
      window.intakeEstimatedKcalPerDay = g.intakeEstimatedKcalPerDay;
    }
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38647 });
    }
  }
  try {
    const fn2 = window.vildaRehydrateIntakeFromState;
    if (typeof fn2 === 'function') fn2((document.getElementById('intakePal') || {}).value || null);
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38651 });
    }
  }
}

      // Wiersze jedzenia
      if (Array.isArray(g.foodRows)) {
        try {
          document.querySelectorAll('.food-row').forEach(el => el.remove());
        } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38658 });
    }
  }
        try {
          if (typeof window.addFoodRow === 'function') {
            g.foodRows.forEach(r => {
              if (!r || typeof r !== 'object') return;
              const resolvedFoodKey = macroPracticeResolveFoodAliasKey(r.key || '');
              window.addFoodRow(resolvedFoodKey);
              const list = document.querySelectorAll('.food-row');
              const row = list[list.length - 1];
              if (!row) return;
              const sel = row.querySelector('select');
              const inp = row.querySelector('input[type="number"]');
              if (sel) sel.value = foods[resolvedFoodKey] ? resolvedFoodKey : 'snickers';
              if (inp && r.qty != null) inp.value = String(r.qty);
              if (sel) touched.push(sel);
              if (inp) touched.push(inp);
            });
          }
        } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38676 });
    }
  }
      }

      // Kalkulator-klirens – wersja
      if (g.clcrCurrentVersion && typeof window.setVersion === 'function') {
        try { window.setVersion(g.clcrCurrentVersion); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38681 });
    }
  }
      }

      // Monitor terapii GH/IGF‑1 – jeżeli jest wczytany (opcjonalnie)
      if (Array.isArray(g.ghTherapyPoints)) {
        try {
          window.ghTherapyPoints = safeClone(g.ghTherapyPoints) || g.ghTherapyPoints;
          writeGhTherapyPointsToModuleStorage(window.ghTherapyPoints);
          if (typeof window.refreshGHTherapyMonitor === 'function') {
            window.refreshGHTherapyMonitor();
          }
        } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38692 });
    }
  }
      }
      } finally {
      }

    try { applyPersistLockFlags(root); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38697 });
    }
  }

    // 5) Po odtworzeniu danych – wymuś przeliczenie wyników w modułach
    try {
      touched.forEach(el => {
        try { el.dispatchEvent(new Event('input',  { bubbles: true })); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38702 });
    }
  }
        try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38703 });
    }
  }
      });
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38705 });
    }
  }

    // Dodatkowe przeliczenie globalne (fallback)
    try {
      if (typeof window.debouncedUpdate === 'function') {
        window.debouncedUpdate();
      } else if (typeof window.update === 'function') {
        window.update();
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38714 });
    }
  }
    try {
      if (typeof window.calculateGrowthAdvanced === 'function') {
        window.calculateGrowthAdvanced();
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38719 });
    }
  }

    /**
     * Uzupełnij wybrane pola po podstawowym odtworzeniu stanu.
     *
     * Po wczytaniu danych z localStorage `restoreAll()` odtwarza wartości
     * wszystkich zarejestrowanych kontrolek, ale nie wykonuje dodatkowej
     * logiki synchronizacji pomiędzy polami lub blokowania edycji.  W
     * niektórych scenariuszach (np. po wczytaniu pliku JSON, wpisaniu
     * nowych danych, a następnie ponownym otwarciu przeglądarki) pole
     * „Imię i nazwisko” w karcie zaawansowanych obliczeń oraz pola na
     * wzrost rodziców mogą pozostać puste, mimo że odpowiednie wartości
     * zostały zapisane w lokalnym magazynie.  Dodatkowy blok poniżej
     * porównuje stan pól z wartościami root (sharedUserData) i w razie
     * potrzeby uzupełnia brakujące dane.  Dodatkowo – jeśli imię jest
     * zablokowane (np. wczytane z pliku) – blokujemy pole w karcie
     * zaawansowanej, tak aby nie różniło się od pola w karcie
     * podstawowej.
     */
    try {
      // Korzystaj z lokalnej zmiennej `root`, która zawiera całą strukturę
      // sharedUserData (wraz z _vildaPersist).  Pola takie jak
      // `name`, `advMotherHeight` i `advFatherHeight` są zapisywane na
      // pierwszym poziomie obiektu (patrz BASIC_ROOT_KEYS).  Jeżeli pole
      // w formularzu jest puste, a w root jest wartość, uzupełnij je i
      // wyemituj zdarzenie `input`, aby warstwa autozapisu mogła
      // zaktualizować swój stan.
      const nameEl = document.getElementById('name');
      const advNameEl = document.getElementById('advName');
      if (nameEl && advNameEl) {
        const advVal  = (advNameEl.value || '').trim();
        const nameVal = (nameEl.value || '').trim();
        // Jeżeli pole zaawansowane jest puste, a mamy imię z karty
        // podstawowej, synchronizuj je.  Zachowaj blokadę edycji, jeśli
        // imię w karcie podstawowej jest zablokowane (np. wczytano z pliku).
        if (!advVal && nameVal) {
          advNameEl.value = nameVal;
          // Jeżeli imię zostało zablokowane podczas wczytywania danych z pliku
          // JSON (flaga nameLocked w sharedUserData) lub pole imienia w
          // formularzu podstawowym jest zablokowane, zablokuj również pole
          // w sekcji zaawansowanej.  Dzięki temu wyszarzone pole jest
          // spójne z kartą główną.
          try {
            const locked = !!(root && typeof root.nameLocked !== 'undefined' ? root.nameLocked : nameEl.disabled);
            if (locked) {
              advNameEl.disabled = true;
            }
          } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38766 });
    }
  }
          try { advNameEl.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38767 });
    }
  }
        }
        // Alternatywnie, jeśli imię w karcie podstawowej jest puste, a
        // zaawansowane ma wartość (możliwy scenariusz po czyszczeniu
        // pól w jednej karcie), skopiuj je z zaawansowanego do
        // podstawowego.
        else if (advVal && !nameVal) {
          nameEl.value = advVal;
          try { nameEl.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38775 });
    }
  }
        }
      }

      // Przywróć wzrost rodziców, jeżeli istnieją w root.  Użytkownik
      // może zmienić te wartości ręcznie; dlatego nie nadpisujemy
      // istniejących wartości, lecz tylko uzupełniamy brakujące.
      const sexEl = document.getElementById('sex');
      if (sexEl) {
        const rootSex = (root && String(root.sex || '').toUpperCase() === 'F') ? 'F'
          : ((root && String(root.sex || '').trim() !== '') ? 'M' : '');
        if (rootSex && sexEl.value !== rootSex) {
          sexEl.value = rootSex;
        }
        try {
          if (root && root.sexLocked) {
            sexEl.disabled = true;
          }
        } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38793 });
    }
  }
      }

      const motherEl = document.getElementById('advMotherHeight');
      if (motherEl && (motherEl.value === '' || motherEl.value == null)) {
        const val = root.advMotherHeight;
        if (val != null && val !== '') {
          motherEl.value = String(val);
          try { motherEl.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38801 });
    }
  }
        }
      }
      const fatherEl = document.getElementById('advFatherHeight');
      if (fatherEl && (fatherEl.value === '' || fatherEl.value == null)) {
        const val = root.advFatherHeight;
        if (val != null && val !== '') {
          fatherEl.value = String(val);
          try { fatherEl.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38809 });
    }
  }
        }
      }
      const testicularEl = document.getElementById('advTesticularVolume');
      if (testicularEl && (testicularEl.value === '' || testicularEl.value == null)) {
        const val = root.advTesticularVolume;
        if (val != null && val !== '') {
          testicularEl.value = String(val);
          try { testicularEl.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38817 });
    }
  }
        }
      }
      const familyDelayedEl = document.getElementById('advFamilyDelayedPuberty');
      if (familyDelayedEl && (familyDelayedEl.value === '' || familyDelayedEl.value == null)) {
        const val = root.advFamilyDelayedPuberty;
        if (val != null && val !== '') {
          familyDelayedEl.value = String(val);
          try { familyDelayedEl.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38825 });
    }
  }
        }
      }
      const exclusionEl = document.getElementById('advGrowthExclusion');
      if (exclusionEl && (exclusionEl.value === '' || exclusionEl.value == null)) {
        const val = root.advGrowthExclusion;
        if (val != null && val !== '') {
          exclusionEl.value = String(val);
          try { exclusionEl.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38833 });
    }
  }
        }
      }

      // Aktualny wiek kostny jest trzymany także na root obiektu sharedUserData,
      // ale po ręcznym „Przywróć zapisany stan” wpis do _vildaPersist.byId może być
      // jeszcze pusty lub nieaktualny.  Na odświeżeniu strony preferuj więc wartość
      // root.advBoneAge, aby nie zgubić bieżącego wieku kostnego po poprawnym restore.
      const boneAgeEl = document.getElementById('advBoneAge');
      if (boneAgeEl) {
        const rootBoneAge = (root && root.advBoneAge != null) ? String(root.advBoneAge).trim() : '';
        const currentBoneAge = (boneAgeEl.value || '').trim();
        if (rootBoneAge !== '' && currentBoneAge !== rootBoneAge) {
          boneAgeEl.value = rootBoneAge;
          try { boneAgeEl.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38847 });
    }
  }
          try { boneAgeEl.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38848 });
    }
  }
        }
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38851 });
    }
  }

    try { applyPersistLockFlags(root); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38853 });
    }
  }

    try {
      const rawComparisonData = (g.loadedComparisonData && typeof g.loadedComparisonData === 'object') ? g.loadedComparisonData : null;
      const comparisonData = persistHasMeaningfulLoadedComparisonData(rawComparisonData)
        ? (safeClone(rawComparisonData) || rawComparisonData)
        : null;
      if (comparisonData) {
        try { window.lastLoadedData = comparisonData; } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38860 });
    }
  }
        try { window.hasUserModifiedAfterLoad = !!g.hasUserModifiedAfterLoad; } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38861 });
    }
  }
        try {
          if (typeof __renderPrevSummary === 'function') {
            __renderPrevSummary(comparisonData);
          }
        } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38866 });
    }
  }
        try {
          if (typeof __pickLastMeasurement === 'function') {
            window.prevMeasurementInfo = __pickLastMeasurement(comparisonData);
          } else {
            window.prevMeasurementInfo = null;
          }
        } catch (_) {
          try { window.prevMeasurementInfo = null; } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38874 });
    }
  }
        }
        try {
          if (window.hasUserModifiedAfterLoad) {
            hideLoadDataMessage();
            const rb = document.getElementById('restoreStateBtn');
            if (rb) rb.style.display = 'none';
          } else {
            showLoadDataMessage();
            if (typeof showRestoreButton === 'function') {
              showRestoreButton();
            }
          }
        } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38887 });
    }
  }
        try {
          if (typeof window.updatePrevSummaryDiff === 'function') {
            window.updatePrevSummaryDiff();
          }
        } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38892 });
    }
  }
        try {
          if (typeof updateProfessionalSummaryCard === 'function') {
            updateProfessionalSummaryCard();
          }
        } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38897 });
    }
  }
        try {
          if (typeof window.adjustPrevSummaryHeight === 'function') {
            window.adjustPrevSummaryHeight();
          }
          if (typeof window.adjustSummaryCardsHeight === 'function') {
            window.adjustSummaryCardsHeight();
          }
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('resize'));
          }
        } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38908 });
    }
  }
        try {
          if (typeof updateSaveBtnVisibility === 'function') {
            updateSaveBtnVisibility();
          }
        } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38913 });
    }
  }
      } else {
        try { window.lastLoadedData = null; } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38915 });
    }
  }
        try { window.prevMeasurementInfo = null; } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38916 });
    }
  }
        try { window.hasUserModifiedAfterLoad = false; } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38917 });
    }
  }
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38919 });
    }
  }

    try {
      if (typeof window !== 'undefined') {
        setTimeout(() => {
          const finishGrowthSyncRestore = () => {
            try { window.__vildaSuspendAdvIntakeSync = false; } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38925 });
    }
  }
            try { window.__vildaSuspendGrowthHistoryCrossSync = false; } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38926 });
    }
  }
            try {
              if (typeof window.vildaEnsureAdvancedIntakePairing === 'function') {
                window.vildaEnsureAdvancedIntakePairing();
              }
            } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38931 });
    }
  }
            try {
              if (typeof window.reconcileGrowthHistoryModules === 'function') {
                window.reconcileGrowthHistoryModules('advanced');
              }
            } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38936 });
    }
  }
            try {
              if (typeof window.calculateBasicGrowth === 'function') {
                window.calculateBasicGrowth();
              }
            } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38941 });
    }
  }
            try {
              if (typeof window.vildaPersistScheduleSave === 'function') {
                window.vildaPersistScheduleSave();
              }
            } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38946 });
    }
  }
          };

          (async () => {
            try {
              if (typeof importTherapyPointsToAdvancedGrowth === 'function') {
                await importTherapyPointsToAdvancedGrowth();
              }
            } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38954 });
    }
  } finally {
              finishGrowthSyncRestore();
            }
          })();
        }, 0);
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38962 });
    }
  }
    } finally {
      isRestoring = false;
      try {
        if (typeof window !== 'undefined') {
          window.__vildaPersistRestoring = false;
          window.__vildaSuspendIntakeUserReset = false;
        }
      } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38970 });
    }
  }
    }
  }

  // Odtwarzaj po DOMContentLoaded, żeby UI zdążyło się zainicjalizować
  window.vildaAppOnReady('app:persist-restore-all', function initPersistRestoreAll() {
    try { restoreAll(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38976 });
    }
  }
  });

  function cancelPendingPersistSave() {
    cancelPersistAutosaveTimers();
    pendingRoot = null;
  }

  function dispatchUserStateClearFallback(source) {
    try {
      if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
      const detail = { source: source || 'app.persistClearFallback', clearedAtISO: new Date().toISOString() };
      if (typeof window.CustomEvent === 'function') {
        window.dispatchEvent(new CustomEvent('vilda:user-state-cleared', { detail }));
      } else {
        const ev = new Event('vilda:user-state-cleared');
        ev.detail = detail;
        window.dispatchEvent(ev);
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 39000 });
    }
  }
  }

  function clearPersistedUserState(source) {
    cancelPendingPersistSave();
    try {
      const persistence = getPersistenceAdapter();
      if (persistence && typeof persistence.clearUserState === 'function') {
        persistence.clearUserState({ includeSessions: true, source: source || 'app.attachClear', durationMs: 2500 });
        resetLoadedComparisonUiResidue();
        return;
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 39011 });
    }
  }
    try {
      if (typeof window !== 'undefined') {
        window.__vildaPersistClearUntil = Date.now() + 2500;
        window.__vildaPersistPauseUntil = Math.max(Number(window.__vildaPersistPauseUntil || 0), Date.now() + 2500);
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 39017 });
    }
  }
    clearSharedAutosaveResidue(source || 'app.attachClear');
    resetLoadedComparisonUiResidue();
    dispatchUserStateClearFallback(source);
  }

  try {
    if (typeof window !== 'undefined') {
      window.vildaPersistClearAfterUserClear = function vildaPersistClearAfterUserClear(source) {
        cancelPendingPersistSave();
        clearSharedAutosaveResidue(source || 'app:clearAllData');
        resetLoadedComparisonUiResidue();
        try {
          window.__vildaPersistClearUntil = Math.max(Number(window.__vildaPersistClearUntil || 0), Date.now() + 2500);
          window.__vildaPersistPauseUntil = Math.max(Number(window.__vildaPersistPauseUntil || 0), Date.now() + 2500);
        } catch (_) {
          // no-op
        }
        return true;
      };
    }
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { feature: 'persist:expose-clear-after-user-clear' });
    }
  }

  function clearPersistedModuleState(source, options) {
    const opts = options || {};
    try {
      const persistence = getPersistenceAdapter();
      if (persistence && typeof persistence.clearModuleState === 'function') {
        persistence.clearModuleState({
          scope: opts.scope || 'all',
          includePreferences: opts.includePreferences === true,
          source: source || 'app.attachModuleClear',
          dispatchEvent: true
        });
        return true;
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 39034 });
    }
  }
    return false;
  }

  // Czyszczenie: jedna ścieżka adaptera dla wspólnych danych i sesji po kliknięciu "Wyczyść wszystkie pola".
  function attachClear(btnId, mode) {
    const btn = document.getElementById(btnId);
    if (!btn || btn.__vildaPersistUnifiedClearBound) return;
    btn.__vildaPersistUnifiedClearBound = '1';
    btn.addEventListener('click', function () {
      if (mode === 'modules') {
        clearPersistedModuleState('app.attachClear:' + btnId, { scope: 'all', includePreferences: false });
        return;
      }
      clearPersistedUserState('app.attachClear:' + btnId);
    }, true);
  }
  window.vildaAppOnReady('app:persist-clear-buttons-init', function initPersistClearButtons() {
    attachClear('clearAllDataBtn', 'user'); // index.html + docpro.html
    attachClear('clearBtn', 'user');        // kalkulator-klirens.html
    attachClear('clearAllModulesBtn', 'modules'); // przyszłe/zbiorcze przyciski modułowe — bez czyszczenia danych pacjenta
  });

    initState.initialized = true;
    try { initState.autoPersistFlagSeen = !!(getRoot() && getRoot().__vildaAutoPersistV1); } catch (_) { initState.autoPersistFlagSeen = false; }
    return getSnapshot();
  }

  function getSnapshot() {
    const root = getRoot();
    let autoPersistFlag = false;
    try { autoPersistFlag = !!(root && root.__vildaAutoPersistV1); } catch (_) { autoPersistFlag = false; }
    return Object.freeze({
      kind: 'vilda-persist-runtime-snapshot',
      VERSION,
      version: VERSION,
      STEP,
      step: STEP,
      readOnly: true,
      moduleOnly: true,
      didRenderDom: false,
      didCallWindowUpdate: false,
      didWriteStorage: false,
      api: Object.freeze({
        scheduleSave: !!(root && typeof root.vildaPersistScheduleSave === 'function'),
        flushNow: !!(root && typeof root.vildaPersistFlushNow === 'function'),
        coalescingSnapshot: !!(root && typeof root.vildaGetPersistAutosaveCoalescingSnapshot === 'function'),
        clearAfterUserClear: !!(root && typeof root.vildaPersistClearAfterUserClear === 'function')
      }),
      initialized: !!initState.initialized,
      initCalls: initState.initCalls,
      lastInitAtISO: initState.lastInitAtISO,
      lastOptionsKeys: initState.lastOptionsKeys.slice(),
      lastDependencyStatus: clonePlain(initState.lastDependencyStatus, 3),
      autoPersistFlag,
      extractedFromAppJs: true,
      storageKeyPreserved: 'sharedUserData',
      persistSchemaKeyPreserved: '_vildaPersist'
    });
  }

  const api = Object.freeze({
    __vildaPersistRuntimeModule: true,
    VERSION,
    version: VERSION,
    STEP,
    step: STEP,
    init,
    initPersistRuntime: init,
    getSnapshot
  });

  global.VildaPersistRuntime = api;
  global.vildaGetPersistRuntimeSnapshot = function vildaGetPersistRuntimeSnapshot() {
    return api.getSnapshot();
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
