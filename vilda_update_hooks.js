/*
 * Vilda Update Hooks Registry v1.6.0
 *
 * Krok 8O-10d-g: nutrition_micros.js przeniesiony z wrappera window.update do VildaUpdateHooks.
 * Ten moduł nadal sam NIE przepina window.update — bridge instaluje app.js, a audyt potwierdza brak znanych legacy-wrapperów update w torze 8O-10d.
 */
(function (global) {
  'use strict';

  if (!global) return;
  if (global.VildaUpdateHooks && global.VildaUpdateHooks.__vildaUpdateHooksRegistry) {
    return;
  }

  const VERSION = '1.6.0';
  const STEP = '8O-10d-g';
  const MAX_EVENTS = 120;
  const BASE_MIGRATED_UPDATE_WRAPPER_IDS = Object.freeze([
    'app:bmi50-info-after-update',
    'app:ideal-weight-ui-after-update',
    'diet:recommendations-visibility-after-update'
  ]);
  const NUTRITION_NORMS_MIGRATED_WRAPPER_ID = 'nutrition-norms:card-render-after-update';
  const NUTRITION_MICROS_MIGRATED_WRAPPER_ID = 'nutrition-micros:card-render-after-update';
  const EXPECTED_MIGRATED_HOOK_ORDER = Object.freeze({
    'app:bmi50-info-after-update': 10,
    'app:ideal-weight-ui-after-update': 20,
    'diet:recommendations-visibility-after-update': 30,
    'nutrition-norms:card-render-after-update': 40,
    'nutrition-micros:card-render-after-update': 50
  });
  const KNOWN_OUT_OF_SCOPE_UPDATE_WRAPPERS = Object.freeze([]);
  const KNOWN_MIGRATED_LEGACY_UPDATE_WRAPPERS = Object.freeze([
    Object.freeze({ id: 'nutrition-norms:update-wrapper', flag: '__nutritionNormsWrapped', original: '__nutritionNormsOriginal', file: 'nutrition_norms.js', functionName: 'nutritionNormsWrappedUpdate' }),
    Object.freeze({ id: 'nutrition-micros:update-wrapper', flag: '__nutritionMicrosWrapped', original: '__nutritionMicrosOriginal', file: 'nutrition_micros.js', functionName: 'nutritionMicrosWrappedUpdate' })
  ]);
  const hooks = [];
  const events = [];
  let nextToken = 1;
  let nextOrder = 1;
  let totalRuns = 0;
  let totalHooksExecuted = 0;
  let totalFailures = 0;
  let lastRun = null;

  function now() {
    try { return Date.now(); } catch (_) { return 0; }
  }

  function pushEvent(type, details) {
    const event = {
      type: String(type || 'event'),
      at: now(),
      details: clonePlain(details || {}, 4)
    };
    events.push(event);
    while (events.length > MAX_EVENTS) events.shift();
    return event;
  }

  function clonePlain(value, depth) {
    const maxDepth = typeof depth === 'number' ? depth : 6;
    if (maxDepth <= 0 || value == null || typeof value !== 'object') return value;
    if (Array.isArray(value)) {
      return value.map(function (item) { return clonePlain(item, maxDepth - 1); });
    }
    const out = {};
    Object.keys(value).forEach(function (key) {
      const item = value[key];
      out[key] = (typeof item === 'function') ? '[function]' : clonePlain(item, maxDepth - 1);
    });
    return out;
  }

  function normalizeId(id, fn) {
    const raw = String(id || '').trim();
    if (raw) return raw;
    const fnName = fn && fn.name ? String(fn.name).trim() : '';
    return (fnName ? fnName : 'after-update-hook') + '-' + (nextToken++);
  }

  function findHookIndex(id) {
    const needle = String(id || '').trim();
    for (let i = 0; i < hooks.length; i += 1) {
      if (hooks[i] && hooks[i].id === needle) return i;
    }
    return -1;
  }

  function sortHooks(list) {
    return list.slice().sort(function (a, b) {
      if (a.order !== b.order) return a.order - b.order;
      return a.index - b.index;
    });
  }

  function normalizeRegisterArgs(first, second, third) {
    if (typeof first === 'function') {
      return { fn: first, options: second || {} };
    }
    return {
      fn: second,
      options: Object.assign({}, third || {}, { id: first })
    };
  }

  function makeUnregisterToken(id, ok, reason) {
    return Object.freeze({
      ok: ok === true,
      id: id || null,
      reason: reason || null,
      unregister: function () {
        return unregisterAfterUpdateHook(id);
      }
    });
  }

  function registerAfterUpdateHook(first, second, third) {
    const normalized = normalizeRegisterArgs(first, second, third);
    const fn = normalized.fn;
    const options = normalized.options || {};
    if (typeof fn !== 'function') {
      pushEvent('register-failed', { reason: 'hook-not-function' });
      return makeUnregisterToken(null, false, 'hook-not-function');
    }

    const id = normalizeId(options.id, fn);
    const existingIndex = findHookIndex(id);
    if (existingIndex >= 0) {
      if (options.replace === true) {
        hooks.splice(existingIndex, 1);
      } else {
        pushEvent('register-failed', { id, reason: 'duplicate-id' });
        return makeUnregisterToken(id, false, 'duplicate-id');
      }
    }

    const hook = {
      id,
      label: String(options.label || id),
      group: String(options.group || 'after-update'),
      order: Number.isFinite(Number(options.order)) ? Number(options.order) : nextOrder++,
      index: nextToken++,
      once: options.once === true,
      required: options.required === true,
      registeredAt: now(),
      runs: 0,
      failures: 0,
      lastRunAt: null,
      fn
    };
    hooks.push(hook);
    pushEvent('registered', { id: hook.id, label: hook.label, group: hook.group, order: hook.order, once: hook.once, required: hook.required });
    return makeUnregisterToken(id, true, null);
  }

  function unregisterAfterUpdateHook(id) {
    const index = findHookIndex(id);
    if (index < 0) {
      pushEvent('unregister-missed', { id: id || null });
      return false;
    }
    const removed = hooks.splice(index, 1)[0];
    pushEvent('unregistered', { id: removed.id, label: removed.label });
    return true;
  }

  function runAfterUpdateHooks(context, options) {
    const opts = options || {};
    const runId = 'update-hooks-run-' + now() + '-' + totalRuns;
    const runContext = context && typeof context === 'object' ? context : {};
    const snapshot = sortHooks(hooks);
    const results = [];
    const onceIds = [];
    let failedCount = 0;

    totalRuns += 1;
    pushEvent('run-start', { runId, hookCount: snapshot.length, source: opts.source || null });

    snapshot.forEach(function (hook) {
      const startedAt = now();
      let ok = true;
      let errorMessage = null;
      let returned;
      try {
        returned = hook.fn.call(global, runContext, {
          runId,
          hookId: hook.id,
          source: opts.source || null,
          step: STEP,
          registryVersion: VERSION
        });
      } catch (error) {
        ok = false;
        failedCount += 1;
        totalFailures += 1;
        hook.failures += 1;
        errorMessage = String(error && error.message ? error.message : error);
      }
      hook.runs += 1;
      hook.lastRunAt = now();
      totalHooksExecuted += 1;
      if (hook.once === true) onceIds.push(hook.id);
      results.push({
        id: hook.id,
        label: hook.label,
        group: hook.group,
        order: hook.order,
        ok,
        error: errorMessage,
        returnedType: typeof returned,
        durationMs: Math.max(0, hook.lastRunAt - startedAt)
      });
    });

    onceIds.forEach(function (id) { unregisterAfterUpdateHook(id); });

    lastRun = {
      id: runId,
      at: now(),
      source: opts.source || null,
      hookCount: snapshot.length,
      failedCount,
      ok: failedCount === 0,
      results: clonePlain(results, 4),
      didCallWindowUpdate: false,
      didPatchWindowUpdate: false
    };
    pushEvent('run-finish', { runId, hookCount: snapshot.length, failedCount });
    return clonePlain(lastRun, 6);
  }

  function normalizeIdList(list) {
    const out = [];
    (Array.isArray(list) ? list : []).forEach(function (id) {
      const value = String(id || '').trim();
      if (value && out.indexOf(value) < 0) out.push(value);
    });
    return out;
  }

  function getDietRecommendationsMigratedWrapperIds() {
    const ids = [];
    if (global.__vildaDietRecommendationsAfterUpdateHookId) {
      ids.push(global.__vildaDietRecommendationsAfterUpdateHookId);
    }
    if (Array.isArray(global.__vildaUpdateHooksDietRecommendationsMigratedWrapperIds)) {
      global.__vildaUpdateHooksDietRecommendationsMigratedWrapperIds.forEach(function (id) { ids.push(id); });
    }
    return normalizeIdList(ids);
  }

  function getNutritionNormsMigratedWrapperIds() {
    const ids = [];
    if (global.__vildaNutritionNormsAfterUpdateHookId) {
      ids.push(global.__vildaNutritionNormsAfterUpdateHookId);
    }
    if (Array.isArray(global.__vildaUpdateHooksNutritionNormsMigratedWrapperIds)) {
      global.__vildaUpdateHooksNutritionNormsMigratedWrapperIds.forEach(function (id) { ids.push(id); });
    }
    if (ids.length === 0 && global.__vildaNutritionNormsAfterUpdateHookRegistered === true) {
      ids.push(NUTRITION_NORMS_MIGRATED_WRAPPER_ID);
    }
    return normalizeIdList(ids);
  }

  function getNutritionMicrosMigratedWrapperIds() {
    const ids = [];
    if (global.__vildaNutritionMicrosAfterUpdateHookId) {
      ids.push(global.__vildaNutritionMicrosAfterUpdateHookId);
    }
    if (Array.isArray(global.__vildaUpdateHooksNutritionMicrosMigratedWrapperIds)) {
      global.__vildaUpdateHooksNutritionMicrosMigratedWrapperIds.forEach(function (id) { ids.push(id); });
    }
    if (ids.length === 0 && global.__vildaNutritionMicrosAfterUpdateHookRegistered === true) {
      ids.push(NUTRITION_MICROS_MIGRATED_WRAPPER_ID);
    }
    return normalizeIdList(ids);
  }

  function getKnownMigratedUpdateWrapperIds() {
    const ids = BASE_MIGRATED_UPDATE_WRAPPER_IDS.slice();
    getNutritionNormsMigratedWrapperIds().forEach(function (id) { ids.push(id); });
    getNutritionMicrosMigratedWrapperIds().forEach(function (id) { ids.push(id); });
    return normalizeIdList(ids);
  }

  function getBridgeMigratedWrapperIds(bridge) {
    let ids = [];
    if (bridge && Array.isArray(bridge.__vildaUpdateHooksMigratedWrapperIds)) {
      ids = ids.concat(bridge.__vildaUpdateHooksMigratedWrapperIds);
    } else if (Array.isArray(global.__vildaUpdateHooksBridge8O10dDHookIds)) {
      ids = ids.concat(global.__vildaUpdateHooksBridge8O10dDHookIds);
    } else if (Array.isArray(global.__vildaUpdateHooksBridge8O10dCHookIds)) {
      ids = ids.concat(global.__vildaUpdateHooksBridge8O10dCHookIds);
    } else {
      const singular = bridge && bridge.__vildaUpdateHooksMigratedWrapperId || global.__vildaUpdateHooksBridge8O10dBHookId || null;
      if (singular) ids.push(singular);
    }
    ids = ids.concat(getDietRecommendationsMigratedWrapperIds());
    ids = ids.concat(getNutritionNormsMigratedWrapperIds());
    ids = ids.concat(getNutritionMicrosMigratedWrapperIds());
    return normalizeIdList(ids);
  }

  function describeWindowUpdate(options) {
    const opts = options || {};
    const fn = global.update;
    const bridge = global.__vildaUpdateHooksBridge8O10dG || global.__vildaUpdateHooksBridge8O10dF || global.__vildaUpdateHooksBridge8O10dE || global.__vildaUpdateHooksBridge8O10dD || global.__vildaUpdateHooksBridge8O10dC || global.__vildaUpdateHooksBridge8O10dB;
    const isFunction = typeof fn === 'function';
    const bridgeInstalledByApp = typeof bridge === 'function' && bridge.__vildaUpdateHooksRegistryWrapper === true;
    const migratedWrapperIds = bridgeInstalledByApp ? getBridgeMigratedWrapperIds(bridge) : [];
    const descriptor = {
      present: isFunction,
      type: typeof fn,
      name: isFunction && fn.name ? fn.name : null,
      arity: isFunction ? fn.length : null,
      hasVildaHookRegistryWrapperFlag: !!(isFunction && fn.__vildaUpdateHooksRegistryWrapper === true),
      patchedByRegistry: false,
      bridgeInstalledByApp,
      bridgeStep: bridgeInstalledByApp ? (bridge.__vildaUpdateHooksBridgeStep || null) : null,
      bridgeMigratedWrapperId: bridgeInstalledByApp ? (migratedWrapperIds[0] || bridge.__vildaUpdateHooksMigratedWrapperId || global.__vildaUpdateHooksBridge8O10dBHookId || null) : null,
      bridgeMigratedWrapperIds: migratedWrapperIds,
      bridgePreviousUpdatePresent: !!(bridgeInstalledByApp && bridge.__vildaUpdateHooksPreviousUpdatePresent === true),
      finalWindowUpdateIsBridge: bridgeInstalledByApp && fn === bridge,
      downstreamWrappersMayExist: bridgeInstalledByApp && isFunction && fn !== bridge
    };
    if (isFunction && opts.includeSourcePreview === true) {
      try {
        descriptor.sourcePreview = String(Function.prototype.toString.call(fn)).slice(0, 240);
      } catch (_) {
        descriptor.sourcePreview = null;
      }
    }
    return descriptor;
  }


  function describeUpdateChain(options) {
    const opts = options || {};
    const nodes = [];
    const seen = [];
    let fn = global.update;
    let depth = 0;
    let registryBridgeDepth = -1;
    const detectedOutOfScopeIds = [];
    const detectedLegacyMigratedWrapperIds = [];

    while (typeof fn === 'function' && depth < 12) {
      const node = {
        depth,
        name: fn.name || null,
        type: typeof fn,
        flags: {
          registryBridge: fn.__vildaUpdateHooksRegistryWrapper === true,
          nutritionNormsWrapped: fn.__nutritionNormsWrapped === true,
          nutritionMicrosWrapped: fn.__nutritionMicrosWrapped === true
        },
        recognizedAs: null,
        nextLink: null
      };

      if (node.flags.registryBridge) {
        node.recognizedAs = 'vilda-update-hooks-bridge';
        if (registryBridgeDepth < 0) registryBridgeDepth = depth;
      } else if (node.flags.nutritionMicrosWrapped) {
        node.recognizedAs = 'nutrition-micros:update-wrapper';
        if (detectedLegacyMigratedWrapperIds.indexOf(node.recognizedAs) < 0) detectedLegacyMigratedWrapperIds.push(node.recognizedAs);
        node.nextLink = '__nutritionMicrosOriginal';
      } else if (node.flags.nutritionNormsWrapped) {
        node.recognizedAs = 'nutrition-norms:update-wrapper';
        if (detectedLegacyMigratedWrapperIds.indexOf(node.recognizedAs) < 0) detectedLegacyMigratedWrapperIds.push(node.recognizedAs);
        node.nextLink = '__nutritionNormsOriginal';
      }

      if (opts.includeSourcePreview === true) {
        try { node.sourcePreview = String(Function.prototype.toString.call(fn)).slice(0, 240); } catch (_) { node.sourcePreview = null; }
      }

      nodes.push(node);
      const next = fn.__nutritionMicrosOriginal || fn.__nutritionNormsOriginal || null;
      if (typeof next !== 'function') break;
      if (seen.indexOf(next) >= 0 || seen.indexOf(fn) >= 0) {
        nodes.push({ depth: depth + 1, name: next.name || null, type: typeof next, cycleDetected: true });
        break;
      }
      seen.push(fn);
      fn = next;
      depth += 1;
    }

    const finalNode = nodes.length ? nodes[0] : null;
    const bridgeNode = registryBridgeDepth >= 0 ? nodes[registryBridgeDepth] : null;
    return {
      readOnly: true,
      didCallWindowUpdate: false,
      didRunHooks: false,
      didPatchWindowUpdate: false,
      depth: nodes.length,
      finalWindowUpdateName: finalNode ? finalNode.name : null,
      finalWindowUpdateRecognizedAs: finalNode ? finalNode.recognizedAs : null,
      registryBridgeDepth,
      registryBridgeFoundInChain: registryBridgeDepth >= 0,
      registryBridgeNode: bridgeNode ? clonePlain(bridgeNode, 4) : null,
      outOfScopeRemainingWrapperIds: detectedOutOfScopeIds,
      outOfScopeRemainingWrappers: KNOWN_OUT_OF_SCOPE_UPDATE_WRAPPERS
        .filter(function (item) { return detectedOutOfScopeIds.indexOf(item.id) >= 0; })
        .map(function (item) { return { id: item.id, file: item.file, flag: item.flag, original: item.original, functionName: item.functionName }; }),
      legacyMigratedWrapperIdsInChain: detectedLegacyMigratedWrapperIds,
      legacyMigratedWrappersInChain: KNOWN_MIGRATED_LEGACY_UPDATE_WRAPPERS
        .filter(function (item) { return detectedLegacyMigratedWrapperIds.indexOf(item.id) >= 0; })
        .map(function (item) { return { id: item.id, file: item.file, flag: item.flag, original: item.original, functionName: item.functionName }; }),
      nodes: clonePlain(nodes, 5)
    };
  }

  function buildKnownMigratedHookAudit(sortedHooks) {
    const hooksById = Object.create(null);
    sortedHooks.forEach(function (hook) {
      if (!hooksById[hook.id]) hooksById[hook.id] = [];
      hooksById[hook.id].push(hook);
    });
    const expectedIds = getKnownMigratedUpdateWrapperIds();
    const entries = expectedIds.map(function (id, expectedIndex) {
      const matches = hooksById[id] || [];
      const hook = matches[0] || null;
      const expectedOrder = EXPECTED_MIGRATED_HOOK_ORDER[id];
      return {
        id,
        expectedOrder,
        expectedIndex,
        registered: !!hook,
        duplicateCount: Math.max(0, matches.length - 1),
        order: hook ? hook.order : null,
        orderOk: !!hook && hook.order === expectedOrder,
        label: hook ? hook.label : null,
        group: hook ? hook.group : null,
        runs: hook ? hook.runs : null,
        failures: hook ? hook.failures : null
      };
    });
    const missingIds = entries.filter(function (entry) { return entry.registered !== true; }).map(function (entry) { return entry.id; });
    const duplicateIds = entries.filter(function (entry) { return entry.duplicateCount > 0; }).map(function (entry) { return entry.id; });
    const registeredEntries = entries.filter(function (entry) { return entry.registered === true; });
    const orderIncreasing = registeredEntries.every(function (entry, index, list) {
      return index === 0 || Number(entry.order) > Number(list[index - 1].order);
    });
    const orderExact = entries.every(function (entry) { return entry.orderOk === true; });
    return {
      expectedIds: expectedIds.slice(),
      expectedOrder: clonePlain(EXPECTED_MIGRATED_HOOK_ORDER, 3),
      entries,
      missingIds,
      duplicateIds,
      registeredIds: entries.filter(function (entry) { return entry.registered === true; }).map(function (entry) { return entry.id; }),
      allKnownWrappersMigrated: missingIds.length === 0 && duplicateIds.length === 0,
      orderIncreasing,
      orderExact,
      hookOrderExpected: missingIds.length === 0 && duplicateIds.length === 0 && orderIncreasing === true && orderExact === true
    };
  }

  function getFinalUpdateChainAuditSnapshot(options) {
    const opts = options || {};
    const sortedHooks = sortHooks(hooks);
    const hookAudit = buildKnownMigratedHookAudit(sortedHooks);
    const windowUpdate = describeWindowUpdate(opts);
    const chain = describeUpdateChain(opts);
    const outOfScopeIds = chain.outOfScopeRemainingWrapperIds || [];
    const legacyMigratedIds = chain.legacyMigratedWrapperIdsInChain || [];
    const finalWindowUpdateOwner = outOfScopeIds.length
      ? outOfScopeIds[0]
      : (legacyMigratedIds.length ? legacyMigratedIds[0] : (windowUpdate.finalWindowUpdateIsBridge ? 'vilda-update-hooks-bridge' : (windowUpdate.present ? 'unclassified-window.update' : 'missing-window.update')));
    const warnings = [];
    if (hookAudit.allKnownWrappersMigrated !== true) warnings.push('known-migrated-hook-missing-or-duplicated');
    if (hookAudit.hookOrderExpected !== true) warnings.push('known-migrated-hook-order-unexpected');
    if (outOfScopeIds.length > 0) warnings.push('out-of-scope-window-update-wrappers-remain');
    if (legacyMigratedIds.length > 0) warnings.push('migrated-legacy-window-update-wrapper-still-in-chain');
    if (chain.registryBridgeFoundInChain !== true && windowUpdate.bridgeInstalledByApp === true) warnings.push('bridge-installed-but-not-visible-in-final-chain');

    return {
      kind: 'vilda-update-hooks-final-chain-audit',
      step: STEP,
      version: VERSION,
      readOnly: true,
      didCallWindowUpdate: false,
      didRunHooks: false,
      didPatchWindowUpdate: false,
      allKnownWrappersMigrated: hookAudit.allKnownWrappersMigrated === true,
      knownMigrationHookOrderValid: hookAudit.hookOrderExpected === true,
      hookOrderExpected: hookAudit.hookOrderExpected === true,
      knownMigratedWrapperIds: getKnownMigratedUpdateWrapperIds(),
      knownMigratedHookAudit: hookAudit,
      windowUpdate,
      chain,
      finalWindowUpdateOwner,
      finalWindowUpdateIsRegistryBridge: windowUpdate.finalWindowUpdateIsBridge === true,
      registryBridgeFoundInFinalChain: chain.registryBridgeFoundInChain === true,
      downstreamWrappersMayExist: windowUpdate.downstreamWrappersMayExist === true,
      hiddenWrappersOutsideKnownMigration: outOfScopeIds.length > 0,
      outOfScopeRemainingWrapperIds: outOfScopeIds,
      outOfScopeRemainingWrappers: chain.outOfScopeRemainingWrappers || [],
      legacyMigratedWrapperIdsInChain: legacyMigratedIds,
      legacyMigratedWrappersInChain: chain.legacyMigratedWrappersInChain || [],
      warnings,
      conclusion: hookAudit.allKnownWrappersMigrated === true && hookAudit.hookOrderExpected === true && outOfScopeIds.length === 0 && legacyMigratedIds.length === 0
        ? 'known-8O-10d-wrappers-migrated-and-no-known-legacy-wrappers-remain'
        : 'known-8O-10d-wrapper-migration-incomplete-or-legacy-wrapper-remains',
      nextStep: outOfScopeIds.length > 0
        ? 'audyt: usunąć nieznany wrapper window.update albo sprawdzić legacy chain'
        : '8O-11a — IndexedDB cleanup albo dalsze porządki zasobowe'
    };
  }

  function getSnapshot(options) {
    const opts = options || {};
    const windowUpdate = describeWindowUpdate(opts);
    const appBridgeInstalled = windowUpdate.bridgeInstalledByApp === true;
    const sortedHooks = sortHooks(hooks);
    const registeredIds = sortedHooks.map(function (hook) { return hook.id; });
    const migratedWrapperIds = appBridgeInstalled ? (windowUpdate.bridgeMigratedWrapperIds || []) : [];
    const migratedHookIdsRegistered = migratedWrapperIds.filter(function (id) { return registeredIds.indexOf(id) >= 0; });
    const requiredAppHookIds = ['app:bmi50-info-after-update', 'app:ideal-weight-ui-after-update'];
    const requiredMigratedHookIds = requiredAppHookIds.concat(getDietRecommendationsMigratedWrapperIds()).concat(getNutritionNormsMigratedWrapperIds()).concat(getNutritionMicrosMigratedWrapperIds());
    const hasAllKnownAppHooks = requiredAppHookIds.every(function (id) { return registeredIds.indexOf(id) >= 0; });
    const hasAllKnownMigratedHooks = requiredMigratedHookIds.length > 0 && requiredMigratedHookIds.every(function (id) { return registeredIds.indexOf(id) >= 0; });
    const dietRecommendationsHookId = getDietRecommendationsMigratedWrapperIds()[0] || null;
    const dietRecommendationsHookRegistered = dietRecommendationsHookId ? registeredIds.indexOf(dietRecommendationsHookId) >= 0 : false;
    const nutritionNormsHookId = getNutritionNormsMigratedWrapperIds()[0] || null;
    const nutritionNormsHookRegistered = nutritionNormsHookId ? registeredIds.indexOf(nutritionNormsHookId) >= 0 : false;
    const nutritionMicrosHookId = getNutritionMicrosMigratedWrapperIds()[0] || null;
    const nutritionMicrosHookRegistered = nutritionMicrosHookId ? registeredIds.indexOf(nutritionMicrosHookId) >= 0 : false;
    const migrationStatus = appBridgeInstalled
      ? (hasAllKnownMigratedHooks ? 'all-known-wrappers-migrated' : (hasAllKnownAppHooks ? 'two-app-wrappers-migrated' : 'partial-app-wrapper-migration'))
      : 'registry-ready';
    return {
      kind: 'vilda-update-hooks-registry-snapshot',
      step: STEP,
      version: VERSION,
      readOnly: true,
      registryPrepared: true,
      didPatchWindowUpdate: false,
      didCallWindowUpdate: false,
      appBridgeInstalled,
      existingWindowUpdateRewired: appBridgeInstalled,
      migrationStatus,
      migratedWrapperId: appBridgeInstalled ? (windowUpdate.bridgeMigratedWrapperId || null) : null,
      migratedWrapperIds,
      migratedHookIdsRegistered,
      requiredMigratedHookIds,
      dietRecommendationsHookId,
      dietRecommendationsHookRegistered,
      nutritionNormsHookId,
      nutritionNormsHookRegistered,
      nutritionMicrosHookId,
      nutritionMicrosHookRegistered,
      registeredCount: hooks.length,
      hooks: sortedHooks.map(function (hook) {
        return {
          id: hook.id,
          label: hook.label,
          group: hook.group,
          order: hook.order,
          once: hook.once,
          required: hook.required,
          registeredAt: hook.registeredAt,
          runs: hook.runs,
          failures: hook.failures,
          lastRunAt: hook.lastRunAt
        };
      }),
      counters: {
        totalRuns,
        totalHooksExecuted,
        totalFailures
      },
      lastRun: lastRun ? clonePlain(lastRun, 5) : null,
      windowUpdate,
      finalChainAudit: (function(){
        const audit = getFinalUpdateChainAuditSnapshot({ includeSourcePreview: false });
        return {
          allKnownWrappersMigrated: audit.allKnownWrappersMigrated,
          hookOrderExpected: audit.hookOrderExpected,
          finalWindowUpdateOwner: audit.finalWindowUpdateOwner,
          registryBridgeFoundInFinalChain: audit.registryBridgeFoundInFinalChain,
          hiddenWrappersOutsideKnownMigration: audit.hiddenWrappersOutsideKnownMigration,
          outOfScopeRemainingWrapperIds: audit.outOfScopeRemainingWrapperIds,
          legacyMigratedWrapperIdsInChain: audit.legacyMigratedWrapperIdsInChain,
          conclusion: audit.conclusion
        };
      })(),
      events: opts.includeEvents === true ? clonePlain(events, 4) : undefined,
      nextStep: '8O-11a — IndexedDB cleanup albo dalsze porządki zasobowe'
    };
  }

  function getHookAuditSnapshot(options) {
    return getSnapshot(options || {});
  }

  function getApiSurfaceStatus() {
    return {
      version: VERSION,
      step: STEP,
      registerAfterUpdateHook: typeof registerAfterUpdateHook === 'function',
      unregisterAfterUpdateHook: typeof unregisterAfterUpdateHook === 'function',
      runAfterUpdateHooks: typeof runAfterUpdateHooks === 'function',
      getSnapshot: typeof getSnapshot === 'function',
      getHookAuditSnapshot: typeof getHookAuditSnapshot === 'function',
      getFinalUpdateChainAuditSnapshot: typeof getFinalUpdateChainAuditSnapshot === 'function',
      doesNotPatchWindowUpdate: true,
      supportsAppBridge: true,
      supportsDietRecommendationsHook: true,
      supportsFinalChainAudit: true,
      supportsNutritionNormsHook: true,
      supportsNutritionMicrosHook: true
    };
  }

  const api = Object.freeze({
    __vildaUpdateHooksRegistry: true,
    VERSION,
    version: VERSION,
    STEP,
    step: STEP,
    registerAfterUpdateHook,
    unregisterAfterUpdateHook,
    runAfterUpdateHooks,
    getSnapshot,
    getHookAuditSnapshot,
    getFinalUpdateChainAuditSnapshot,
    getApiSurfaceStatus
  });

  global.VildaUpdateHooks = api;
  global.vildaRegisterAfterUpdateHook = registerAfterUpdateHook;
  global.vildaUnregisterAfterUpdateHook = unregisterAfterUpdateHook;
  global.vildaRunAfterUpdateHooks = runAfterUpdateHooks;
  global.vildaGetUpdateHooksSnapshot = getSnapshot;
  global.vildaGetUpdateHooksAuditSnapshot = getHookAuditSnapshot;
  global.vildaGetFinalUpdateChainAuditSnapshot = getFinalUpdateChainAuditSnapshot;
  global.vildaGetUpdateHooksFinalChainAuditSnapshot = getFinalUpdateChainAuditSnapshot;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
