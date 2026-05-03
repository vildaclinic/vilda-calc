#!/usr/bin/env node
'use strict';

/*
 * Node runner dla kroków 8O-T1/8O-10a/8O-10b/8O-10c/8O-10d-a/8O-10e/8O-10d-b/8O-10d-c/8O-10d-d/8O-10d-e/8O-10d-f/8O-10d-g/8O-11a-a/8O-11a-b/8O-11a-c/8O-11b/8O-11c/8O-11d/8O-11e/8O-11f/8O-11g/8O-11h/8O-11i/8O-11j/8O-11k.
 * Sprawdza trwałe okablowanie smoke suite, kontrakty VildaDeps, cache-busting oraz
 * czysty model VildaEstimatedIntake, kontrakt walidacji age=0, kontrakt braku fallbacku BMI dzieci do progów dorosłych kolejkę refreshy nutritionNormsModelUpdated oraz registry hooków update, świeże imię w nagłówku siatek centylowych oraz pierwszy, drugi, dietetyczny i nutrition-norms i nutrition-micros hook window.update oraz końcowy audyt łańcucha update oraz read-only audyt zasobów GH therapy IndexedDB/BroadcastChannel i cleanup db.close(), onversionchange, lifecycle BroadcastChannel oraz MutationObserver monitora GH/IGF i fetch timeout cleanup oraz Service Worker fetch/cache strategy i kontrolowany offline/update-flow E2E smoke oraz cache key wersjonowanych zasobów shell oraz audyt scope stale cache pruning oraz runtime cache TTL/max-entry pruning oraz client-side Service Worker registration/update-flow lifecycle audit bez uruchamiania aplikacji w przeglądarce.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const childProcess = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const REQUIRED_FILES = [
  'vilda_smoke_tests.js',
  'vilda_update_hooks.js',
  'vilda_diet_recommendations.js',
  'nutrition_norms.js',
  'nutrition_micros.js',
  'vilda_centile_chart_header.js',
  'vilda_gh_therapy_resource_audit.js',
  'vilda_app_helpers.js',
  'vilda_macro_practice.js',
  'vilda_estimated_intake.js',
  'vilda_food_summary.js',
  'vilda_deps.js',
  'vilda_update_prep.js',
  'vilda_data_import_export.js',
  'app.js',
  'gh_therapy_monitor.js',
  'service-worker-kalorii.js',
  'ios26-ui.js',
  'index.html',
  'docpro.html',
  'kalkulator-klirens.html',
  'tools/service_worker_offline_update_flow_smoke.js'
];
const EXPECTED_HTML_TOKENS = [
  'vilda_deps.js?v=74',
  'vilda_update_hooks.js?v=7',
  'vilda_centile_chart_header.js?v=1',
  'vilda_gh_therapy_resource_audit.js?v=13',
  'vilda_app_helpers.js?v=2',
  'vilda_macro_practice.js?v=2',
  'vilda_food_summary.js?v=2',
  'vilda_estimated_intake.js?v=3',
  'vilda_update_prep.js?v=61',
  'app.js?v=150',
  'vilda_smoke_tests.js?v=25',
  'vilda_diet_recommendations.js?v=2'
];
const EXPECTED_SW_TOKENS = [
  "const SW_VERSION = '0.9.406';",
  "'/vilda_deps.js?v=74'",
  "'/vilda_update_hooks.js'",
  "'/vilda_update_hooks.js?v=7'",
  "'/vilda_centile_chart_header.js'",
  "'/vilda_centile_chart_header.js?v=1'",
  "'/vilda_gh_therapy_resource_audit.js'",
  "'/vilda_gh_therapy_resource_audit.js?v=13'",
  "'/vilda_app_helpers.js?v=2'",
  "'/vilda_macro_practice.js?v=2'",
  "'/vilda_data_import_export.js?v=14'",
  "'/vilda_food_summary.js?v=2'",
  "'/vilda_update_prep.js?v=61'",
  "'/app.js?v=150'",
  "'/vilda_smoke_tests.js'",
  "'/vilda_smoke_tests.js?v=25'",
  "'/gh_therapy_monitor.js?v=12'",
  "'/nutrition_norms.js?v=39'",
  "'/nutrition_micros.js?v=20'",
  "'/ios26-ui.js?v=18'"
];
const EXPECTED_CONTRACTS = [
  'estimated-intake-card-audit',
  'estimated-intake-card-helpers',
  'estimated-intake-alert-probe-audit',
  'estimated-intake-alert-probe-collector',
  'estimated-intake-calc-seam',
  'estimated-intake-calculation-model',
  'numeric-validation-age-zero',
  'pediatric-bmi-no-adult-fallback',
  'nutrition-norms-refresh-queue',
  'update-hooks-registry',
  'update-hooks-first-wrapper-bridge',
  'update-hooks-second-wrapper-bridge',
  'update-hooks-diet-recommendations-wrapper',
  'update-hooks-final-chain-audit',
  'update-hooks-nutrition-norms-wrapper',
  'update-hooks-nutrition-micros-wrapper',
  'centile-chart-header-fresh-name',
  'gh-therapy-indexeddb-resource-audit',
  'fetch-timeout-cleanup',
  'service-worker-fetch-cache-strategy',
  'service-worker-offline-update-flow-smoke',
  'service-worker-versioned-shell-cache-key',
  'service-worker-stale-cache-pruning-audit',
  'service-worker-runtime-cache-pruning',
  'service-worker-client-lifecycle-audit',
  'service-worker-client-update-ux-smoke',
  'regression-smoke-suite'
];

const results = [];
function addResult(id, ok, details) {
  results.push({ id, ok: !!ok, details: details || null });
}
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}
function runChildJson(scriptPath) {
  return JSON.parse(childProcess.execFileSync(process.execPath, [scriptPath], { encoding: 'utf8' }));
}
function runScriptInContext(rel, context) {
  const code = read(rel);
  vm.runInContext(code, context, { filename: rel });
}
function createContext() {
  const context = {
    console,
    Date,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    RegExp,
    JSON,
    Error,
    isFinite,
    parseFloat,
    setTimeout: function () {},
    clearTimeout: function () {},
    addEventListener: function () {},
    document: {
      getElementById: function () { return null; },
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; },
      addEventListener: function () {},
      removeEventListener: function () {},
      createElement: function () { return { style: {}, dataset: {}, classList: { add: function () {}, remove: function () {}, contains: function () { return false; } }, addEventListener: function () {}, removeEventListener: function () {}, appendChild: function () {}, removeChild: function () {}, setAttribute: function () {}, getAttribute: function () { return null; }, querySelector: function () { return null; }, querySelectorAll: function () { return []; } }; },
      body: { dataset: {}, appendChild: function () {}, removeChild: function () {}, addEventListener: function () {}, removeEventListener: function () {} }
    },
    navigator: { clipboard: null },
    location: { pathname: '/index.html', href: 'https://local.test/index.html' },
    vildaAppOnReady: function () {}
  };
  context.globalThis = context;
  context.window = context;
  return vm.createContext(context);
}

REQUIRED_FILES.forEach((file) => {
  addResult(`file:${file}`, fs.existsSync(path.join(ROOT, file)));
});

const versionFiles = {
  'vilda_smoke_tests.js': "const VERSION = '2.14.0';",
  'vilda_estimated_intake.js': "const VERSION = '1.2.0';",
  'vilda_food_summary.js': "const VERSION = '1.1.0';",
  'vilda_update_hooks.js': "const VERSION = '1.6.0';",
  'vilda_diet_recommendations.js': "const VILDA_DIET_RECOMMENDATIONS_VERSION = '1.1.0';",
  'vilda_centile_chart_header.js': "const VERSION = '1.0.0';",
  'vilda_gh_therapy_resource_audit.js': "const VERSION = '1.12.0';",
  'vilda_deps.js': "const VERSION = '1.18.0';",
  'vilda_update_prep.js': "const VILDA_UPDATE_PREP_VERSION = '2.55.0';",
  'vilda_data_import_export.js': "const VERSION = '1.10.3';",
  'nutrition_norms.js': "const NUTRITION_NORMS_MODULE_VERSION = '1.1.0';",
  'vilda_app_helpers.js': "const VILDA_APP_HELPERS_VERSION = '1.1.0';",
  'vilda_macro_practice.js': "const VILDA_MACRO_PRACTICE_VERSION = '1.1.0';",
  'nutrition_micros.js': "const MICRONORMS_MODULE_VERSION = '1.2.0';"
};
Object.entries(versionFiles).forEach(([file, token]) => {
  addResult(`version:${file}`, read(file).includes(token), { token });
});

['index.html', 'docpro.html', 'kalkulator-klirens.html'].forEach((file) => {
  const html = read(file);
  const missing = EXPECTED_HTML_TOKENS.filter((token) => !html.includes(token));
  addResult(`html-cache:${file}`, missing.length === 0, { missing });
});
addResult('html-cache:docpro-gh-therapy-monitor', read('docpro.html').includes('gh_therapy_monitor.js?v=12'), { token: 'gh_therapy_monitor.js?v=12' });

const sw = read('service-worker-kalorii.js');
const missingSw = EXPECTED_SW_TOKENS.filter((token) => !sw.includes(token));
addResult('service-worker-cache', missingSw.length === 0, { missing: missingSw });

const context = createContext();
runScriptInContext('vilda_deps.js', context);
runScriptInContext('vilda_app_helpers.js', context);
runScriptInContext('vilda_gh_therapy_resource_audit.js', context);
runScriptInContext('vilda_update_hooks.js', context);
runScriptInContext('vilda_centile_chart_header.js', context);
runScriptInContext('vilda_estimated_intake.js', context);
runScriptInContext('vilda_food_summary.js', context);
runScriptInContext('vilda_smoke_tests.js', context);

addResult('VildaDeps.loaded', !!(context.VildaDeps && context.VildaDeps.version === '1.18.0'), { version: context.VildaDeps && context.VildaDeps.version });
addResult('VildaAppHelpers.loaded', !!(context.VildaAppHelpers && context.VildaAppHelpers.VERSION === '1.1.0' && typeof context.VildaAppHelpers.fetchJsonWithTimeout === 'function'), { version: context.VildaAppHelpers && context.VildaAppHelpers.VERSION, fetchJsonWithTimeout: !!(context.VildaAppHelpers && typeof context.VildaAppHelpers.fetchJsonWithTimeout === 'function') });
addResult('VildaEstimatedIntake.loaded', !!(context.VildaEstimatedIntake && context.VildaEstimatedIntake.VERSION === '1.2.0'), { version: context.VildaEstimatedIntake && context.VildaEstimatedIntake.VERSION });
addResult('VildaFoodSummary.loaded', !!(context.VildaFoodSummary && context.VildaFoodSummary.version === '1.1.0'), { version: context.VildaFoodSummary && context.VildaFoodSummary.version });
addResult('VildaUpdateHooks.loaded', !!(context.VildaUpdateHooks && context.VildaUpdateHooks.VERSION === '1.6.0'), { version: context.VildaUpdateHooks && context.VildaUpdateHooks.VERSION });
addResult('VildaCentileChartHeader.loaded', !!(context.VildaCentileChartHeader && context.VildaCentileChartHeader.VERSION === '1.0.0'), { version: context.VildaCentileChartHeader && context.VildaCentileChartHeader.VERSION });
addResult('VildaGHTherapyResourceAudit.loaded', !!(context.VildaGHTherapyResourceAudit && context.VildaGHTherapyResourceAudit.VERSION === '1.12.0'), { version: context.VildaGHTherapyResourceAudit && context.VildaGHTherapyResourceAudit.VERSION });
addResult('VildaSmokeTests.loaded', !!(context.VildaSmokeTests && context.VildaSmokeTests.VERSION === '2.14.0'), { version: context.VildaSmokeTests && context.VildaSmokeTests.VERSION });

const beforeUpdateRef = context.update;
let updateHookRuns = 0;
const updateHookToken = context.VildaUpdateHooks.registerAfterUpdateHook(function nodeSmokeUpdateHook(contextArg, meta) {
  updateHookRuns += 1;
  return !!(contextArg && meta && meta.step === '8O-10d-g');
}, { id: 'node-smoke-update-hooks-registry-temp', replace: true });
const updateHookRun = context.VildaUpdateHooks.runAfterUpdateHooks({ source: 'node-smoke' }, { source: 'node-smoke' });
const updateHookSnapshot = context.VildaUpdateHooks.getSnapshot();
const updateHookAuditSnapshot = context.VildaUpdateHooks.getHookAuditSnapshot();
const updateHookUnregistered = context.VildaUpdateHooks.unregisterAfterUpdateHook('node-smoke-update-hooks-registry-temp');
addResult('VildaUpdateHooks.dynamic',
  !!(updateHookToken && updateHookToken.ok) &&
  updateHookRuns === 1 &&
  !!(updateHookRun && updateHookRun.ok && updateHookRun.didCallWindowUpdate === false && updateHookRun.didPatchWindowUpdate === false) &&
  !!(updateHookSnapshot && updateHookSnapshot.readOnly === true && updateHookSnapshot.didPatchWindowUpdate === false && updateHookSnapshot.existingWindowUpdateRewired === false) &&
  !!(updateHookAuditSnapshot && updateHookAuditSnapshot.readOnly === true && updateHookAuditSnapshot.didPatchWindowUpdate === false && updateHookAuditSnapshot.existingWindowUpdateRewired === false) &&
  updateHookUnregistered === true &&
  beforeUpdateRef === context.update,
  {
    hookRuns: updateHookRuns,
    token: updateHookToken ? { ok: updateHookToken.ok, id: updateHookToken.id, reason: updateHookToken.reason || null } : null,
    run: updateHookRun ? { ok: updateHookRun.ok, hookCount: updateHookRun.hookCount, failedCount: updateHookRun.failedCount } : null,
    snapshot: updateHookSnapshot ? { step: updateHookSnapshot.step, readOnly: updateHookSnapshot.readOnly, didPatchWindowUpdate: updateHookSnapshot.didPatchWindowUpdate, existingWindowUpdateRewired: updateHookSnapshot.existingWindowUpdateRewired } : null,
    auditSnapshot: updateHookAuditSnapshot ? { step: updateHookAuditSnapshot.step, readOnly: updateHookAuditSnapshot.readOnly, didPatchWindowUpdate: updateHookAuditSnapshot.didPatchWindowUpdate, existingWindowUpdateRewired: updateHookAuditSnapshot.existingWindowUpdateRewired } : null,
    windowUpdateReferencePreserved: beforeUpdateRef === context.update,
    unregistered: updateHookUnregistered
  });

const appSourceForUpdateHookBridge = read('app.js');
addResult('update-hooks-first-wrapper-bridge-static',
  appSourceForUpdateHookBridge.includes("BMI50_AFTER_UPDATE_HOOK_ID = 'app:bmi50-info-after-update'") &&
  appSourceForUpdateHookBridge.includes('VildaUpdateHooks.registerAfterUpdateHook(updateBmi50InfoAfterUpdate') &&
  appSourceForUpdateHookBridge.includes('VildaUpdateHooks.runAfterUpdateHooks') &&
  appSourceForUpdateHookBridge.includes('window.__vildaUpdateHooksBridge8O10dB') &&
  appSourceForUpdateHookBridge.includes('window.vildaGetUpdateHooksBridgeSnapshot'),
  {
    hasHookId: appSourceForUpdateHookBridge.includes("BMI50_AFTER_UPDATE_HOOK_ID = 'app:bmi50-info-after-update'"),
    hasRegister: appSourceForUpdateHookBridge.includes('VildaUpdateHooks.registerAfterUpdateHook(updateBmi50InfoAfterUpdate'),
    hasRun: appSourceForUpdateHookBridge.includes('VildaUpdateHooks.runAfterUpdateHooks'),
    hasBridgeRef: appSourceForUpdateHookBridge.includes('window.__vildaUpdateHooksBridge8O10dB'),
    hasSnapshot: appSourceForUpdateHookBridge.includes('window.vildaGetUpdateHooksBridgeSnapshot')
  });

addResult('update-hooks-second-wrapper-bridge-static',
  appSourceForUpdateHookBridge.includes("IDEAL_WEIGHT_AFTER_UPDATE_HOOK_ID = 'app:ideal-weight-ui-after-update'") &&
  appSourceForUpdateHookBridge.includes('VildaUpdateHooks.registerAfterUpdateHook(updateIdealWeightUIAfterUpdate') &&
  !appSourceForUpdateHookBridge.includes('const prevUpdate2 = window.update;') &&
  appSourceForUpdateHookBridge.includes('window.__vildaIdealWeightUIAfterUpdateHookRegistered') &&
  appSourceForUpdateHookBridge.includes('__vildaUpdateHooksBridge8O10dC') &&
  appSourceForUpdateHookBridge.includes('__vildaUpdateHooksBridge8O10dD'),
  {
    hasHookId: appSourceForUpdateHookBridge.includes("IDEAL_WEIGHT_AFTER_UPDATE_HOOK_ID = 'app:ideal-weight-ui-after-update'"),
    hasRegister: appSourceForUpdateHookBridge.includes('VildaUpdateHooks.registerAfterUpdateHook(updateIdealWeightUIAfterUpdate'),
    removedPrevUpdate2: !appSourceForUpdateHookBridge.includes('const prevUpdate2 = window.update;'),
    hasRegisteredFlag: appSourceForUpdateHookBridge.includes('window.__vildaIdealWeightUIAfterUpdateHookRegistered'),
    hasBridgeCAlias: appSourceForUpdateHookBridge.includes('__vildaUpdateHooksBridge8O10dC'),
    hasBridgeDAlias: appSourceForUpdateHookBridge.includes('__vildaUpdateHooksBridge8O10dD')
  });

const dietRecommendationsSourceForUpdateHook = read('vilda_diet_recommendations.js');
addResult('update-hooks-diet-recommendations-wrapper-static',
  dietRecommendationsSourceForUpdateHook.includes("DIET_RECOMMENDATIONS_AFTER_UPDATE_HOOK_ID = 'diet:recommendations-visibility-after-update'") &&
  dietRecommendationsSourceForUpdateHook.includes('VildaUpdateHooks.registerAfterUpdateHook(updateDietRecommendationsVisibilityAfterUpdate') &&
  dietRecommendationsSourceForUpdateHook.includes('window.vildaGetDietRecommendationsUpdateHookSnapshot') &&
  dietRecommendationsSourceForUpdateHook.includes('window.__vildaDietRecommendationsAfterUpdateHookRegistered') &&
  !dietRecommendationsSourceForUpdateHook.includes('const prevUpdateFunc = window.update;') &&
  !dietRecommendationsSourceForUpdateHook.includes('window.update = function()'),
  {
    hasHookId: dietRecommendationsSourceForUpdateHook.includes("DIET_RECOMMENDATIONS_AFTER_UPDATE_HOOK_ID = 'diet:recommendations-visibility-after-update'"),
    hasRegister: dietRecommendationsSourceForUpdateHook.includes('VildaUpdateHooks.registerAfterUpdateHook(updateDietRecommendationsVisibilityAfterUpdate'),
    hasSnapshot: dietRecommendationsSourceForUpdateHook.includes('window.vildaGetDietRecommendationsUpdateHookSnapshot'),
    hasRegisteredFlag: dietRecommendationsSourceForUpdateHook.includes('window.__vildaDietRecommendationsAfterUpdateHookRegistered'),
    removedPrevUpdateFunc: !dietRecommendationsSourceForUpdateHook.includes('const prevUpdateFunc = window.update;'),
    removedLegacyWindowUpdateWrapper: !dietRecommendationsSourceForUpdateHook.includes('window.update = function()')
  });

const nutritionNormsSourceForUpdateHook = read('nutrition_norms.js');
const nutritionMicrosSourceForUpdateHook = read('nutrition_micros.js');
addResult('update-hooks-final-chain-audit-static',
  read('vilda_update_hooks.js').includes('getFinalUpdateChainAuditSnapshot') &&
  appSourceForUpdateHookBridge.includes('window.__vildaUpdateHooksBridge8O10dG') &&
  nutritionNormsSourceForUpdateHook.includes('registerAfterUpdateHook(renderNutritionNormsAfterUpdate') &&
  !nutritionNormsSourceForUpdateHook.includes('__nutritionNormsWrapped = true') &&
  nutritionMicrosSourceForUpdateHook.includes('registerAfterUpdateHook(renderNutritionMicrosAfterUpdate') &&
  !nutritionMicrosSourceForUpdateHook.includes('window.update = wrapped') &&
  !nutritionMicrosSourceForUpdateHook.includes('__nutritionMicrosWrapped = true'),
  {
    hasFinalAudit: read('vilda_update_hooks.js').includes('getFinalUpdateChainAuditSnapshot'),
    hasBridgeGAlias: appSourceForUpdateHookBridge.includes('window.__vildaUpdateHooksBridge8O10dG'),
    nutritionNormsHookDetected: nutritionNormsSourceForUpdateHook.includes('registerAfterUpdateHook(renderNutritionNormsAfterUpdate') && !nutritionNormsSourceForUpdateHook.includes('__nutritionNormsWrapped = true'),
    nutritionMicrosHookDetected: nutritionMicrosSourceForUpdateHook.includes('registerAfterUpdateHook(renderNutritionMicrosAfterUpdate') && !nutritionMicrosSourceForUpdateHook.includes('window.update = wrapped') && !nutritionMicrosSourceForUpdateHook.includes('__nutritionMicrosWrapped = true')
  });

const ghTherapyAuditSource = read('vilda_gh_therapy_resource_audit.js');
const ghTherapyMonitorSource = read('gh_therapy_monitor.js');
const vildaAppHelpersSource = read('vilda_app_helpers.js');
const nutritionMicrosSourceForFetch = read('nutrition_micros.js');
const macroPracticeSourceForFetch = read('vilda_macro_practice.js');
const clcrSourceForFetch = read('kalkulator-klirens.html');
addResult('gh-therapy-resource-audit-static',
  ghTherapyAuditSource.includes("const DB_NAME = 'ghTherapyDB';") &&
  ghTherapyAuditSource.includes("const STORE_NAME = 'ghTherapyPoints';") &&
  ghTherapyAuditSource.includes("const CHANNEL_NAME = 'gh-therapy-sync';") &&
  ghTherapyAuditSource.includes("const VERSION = '1.12.0';") &&
  ghTherapyAuditSource.includes("const STEP = '8O-11k';") &&
  ghTherapyAuditSource.includes('openedIndexedDb: false') &&
  ghTherapyAuditSource.includes('postedBroadcastMessage: false') &&
  ghTherapyAuditSource.includes('performedFetch: false') &&
  ghTherapyAuditSource.includes('fetchTimeoutCleanupApplied: true') &&
  ghTherapyAuditSource.includes('asyncFetchTimeoutCleanupApplied: true') &&
  ghTherapyAuditSource.includes('serviceWorkerTimeoutExemptionAuditApplied: true') &&
  ghTherapyAuditSource.includes('serviceWorkerCacheStrategyAuditApplied: true') &&
  ghTherapyAuditSource.includes('serviceWorkerOfflineUpdateFlowSmokeApplied: true') &&
  ghTherapyAuditSource.includes('SERVICE_WORKER_OFFLINE_UPDATE_FLOW_SMOKE_SCENARIOS') &&
  ghTherapyAuditSource.includes('FETCH_RESOURCE_LOCATIONS') &&
  ghTherapyAuditSource.includes('indexedDbClose: true') &&
  ghTherapyAuditSource.includes('onVersionChange: true') &&
  ghTherapyAuditSource.includes('broadcastChannelLifecycle: true') &&
  ghTherapyAuditSource.includes('broadcastChannelLifecycleCleanupApplied: true') &&
  ghTherapyAuditSource.includes('mutationObserverLifecycleCleanupApplied: true') &&
  ghTherapyAuditSource.includes('mutationObserverScopeCleanupApplied: true') &&
  ghTherapyAuditSource.includes('indexedDbOnVersionChangeCleanupApplied: true') &&
  ghTherapyAuditSource.includes('vildaGetGHTherapyIndexedDbAuditSnapshot'),
  {
    hasDbName: ghTherapyAuditSource.includes("const DB_NAME = 'ghTherapyDB';"),
    hasStoreName: ghTherapyAuditSource.includes("const STORE_NAME = 'ghTherapyPoints';"),
    hasChannelName: ghTherapyAuditSource.includes("const CHANNEL_NAME = 'gh-therapy-sync';"),
    version: ghTherapyAuditSource.includes("const VERSION = '1.12.0';"),
    step: ghTherapyAuditSource.includes("const STEP = '8O-11k';"),
    readOnlyGuards: ghTherapyAuditSource.includes('openedIndexedDb: false') && ghTherapyAuditSource.includes('postedBroadcastMessage: false'),
    closeCleanupApplied: ghTherapyAuditSource.includes('indexedDbClose: true'),
    onVersionChangeCleanupApplied: ghTherapyAuditSource.includes('onVersionChange: true') && ghTherapyAuditSource.includes('indexedDbOnVersionChangeCleanupApplied: true'),
    broadcastLifecycleCleanupApplied: ghTherapyAuditSource.includes('broadcastChannelLifecycle: true') && ghTherapyAuditSource.includes('broadcastChannelLifecycleCleanupApplied: true'),
    mutationObserverCleanupApplied: ghTherapyAuditSource.includes('mutationObserverLifecycle: true') && ghTherapyAuditSource.includes('mutationObserverScope: true') && ghTherapyAuditSource.includes('mutationObserverLifecycleCleanupApplied: true') && ghTherapyAuditSource.includes('mutationObserverScopeCleanupApplied: true'),
    fetchTimeoutCleanupApplied: ghTherapyAuditSource.includes('fetchTimeoutCleanupApplied: true') && ghTherapyAuditSource.includes('asyncFetchTimeoutCleanupApplied: true') && ghTherapyAuditSource.includes('serviceWorkerTimeoutExemptionAuditApplied: true') && ghTherapyAuditSource.includes('FETCH_RESOURCE_LOCATIONS'),
    serviceWorkerOfflineUpdateFlowSmokeApplied: ghTherapyAuditSource.includes('serviceWorkerOfflineUpdateFlowSmokeApplied: true') && ghTherapyAuditSource.includes('SERVICE_WORKER_OFFLINE_UPDATE_FLOW_SMOKE_SCENARIOS'),
    serviceWorkerClientLifecycleAuditApplied: ghTherapyAuditSource.includes('serviceWorkerClientLifecycleAuditApplied: true') && ghTherapyAuditSource.includes('SERVICE_WORKER_CLIENT_LIFECYCLE_LOCATIONS'),
    hasGlobalAlias: ghTherapyAuditSource.includes('vildaGetGHTherapyIndexedDbAuditSnapshot')
  });

addResult('gh-therapy-indexeddb-close-cleanup-static',
  appSourceForUpdateHookBridge.includes('function closeGHTherapyDBConnection') &&
  appSourceForUpdateHookBridge.includes("closeGHTherapyDBConnection(db, 'getTherapyPointsFromDB')") &&
  appSourceForUpdateHookBridge.includes("closeGHTherapyDBConnection(db, 'clearTherapyPointsInDB')") &&
  appSourceForUpdateHookBridge.includes('tx.oncomplete = function(){ resolve(points); }') &&
  ghTherapyMonitorSource.includes('function closeTherapyDBConnection') &&
  ghTherapyMonitorSource.includes("closeTherapyDBConnection(db, 'saveTherapyPointsToDB')") &&
  ghTherapyMonitorSource.includes("tx.onabort = () => rej(tx.error || new Error('IndexedDB transaction aborted'));") ,
  {
    appCloseHelper: appSourceForUpdateHookBridge.includes('function closeGHTherapyDBConnection'),
    appReadFinally: appSourceForUpdateHookBridge.includes("closeGHTherapyDBConnection(db, 'getTherapyPointsFromDB')"),
    appClearFinally: appSourceForUpdateHookBridge.includes("closeGHTherapyDBConnection(db, 'clearTherapyPointsInDB')"),
    appReadWaitsForTransactionComplete: appSourceForUpdateHookBridge.includes('tx.oncomplete = function(){ resolve(points); }'),
    monitorCloseHelper: ghTherapyMonitorSource.includes('function closeTherapyDBConnection'),
    monitorSaveFinally: ghTherapyMonitorSource.includes("closeTherapyDBConnection(db, 'saveTherapyPointsToDB')"),
    monitorAbortHandler: ghTherapyMonitorSource.includes("tx.onabort = () => rej(tx.error || new Error('IndexedDB transaction aborted'));")
  });

addResult('gh-therapy-indexeddb-onversionchange-cleanup-static',
  appSourceForUpdateHookBridge.includes('function attachGHTherapyDBVersionChangeHandler') &&
  appSourceForUpdateHookBridge.includes("attachGHTherapyDBVersionChangeHandler(db, 'openGHTherapyDB')") &&
  appSourceForUpdateHookBridge.includes('db.onversionchange = function(){') &&
  appSourceForUpdateHookBridge.includes("closeGHTherapyDBConnection(db, (contextLabel || 'openGHTherapyDB') + ':onversionchange')") &&
  ghTherapyMonitorSource.includes('function attachTherapyDBVersionChangeHandler') &&
  ghTherapyMonitorSource.includes("attachTherapyDBVersionChangeHandler(db, 'openTherapyDB')") &&
  ghTherapyMonitorSource.includes('db.onversionchange = function(){') &&
  ghTherapyMonitorSource.includes("closeTherapyDBConnection(db, (contextLabel || 'openTherapyDB') + ':onversionchange')"),
  {
    appAttachHelper: appSourceForUpdateHookBridge.includes('function attachGHTherapyDBVersionChangeHandler'),
    appOpenAttachesHandler: appSourceForUpdateHookBridge.includes("attachGHTherapyDBVersionChangeHandler(db, 'openGHTherapyDB')"),
    appOnVersionChange: appSourceForUpdateHookBridge.includes('db.onversionchange = function(){'),
    appVersionChangeClosesDb: appSourceForUpdateHookBridge.includes("closeGHTherapyDBConnection(db, (contextLabel || 'openGHTherapyDB') + ':onversionchange')"),
    monitorAttachHelper: ghTherapyMonitorSource.includes('function attachTherapyDBVersionChangeHandler'),
    monitorOpenAttachesHandler: ghTherapyMonitorSource.includes("attachTherapyDBVersionChangeHandler(db, 'openTherapyDB')"),
    monitorOnVersionChange: ghTherapyMonitorSource.includes('db.onversionchange = function(){'),
    monitorVersionChangeClosesDb: ghTherapyMonitorSource.includes("closeTherapyDBConnection(db, (contextLabel || 'openTherapyDB') + ':onversionchange')")
  });

addResult('gh-therapy-broadcastchannel-lifecycle-cleanup-static',
  appSourceForUpdateHookBridge.includes('function closeGHTherapyBroadcastChannel') &&
  appSourceForUpdateHookBridge.includes('function registerGHTherapyBroadcastChannelLifecycleCleanup') &&
  appSourceForUpdateHookBridge.includes("window.addEventListener('pagehide', cleanup, { once: true })") &&
  appSourceForUpdateHookBridge.includes("window.addEventListener('beforeunload', cleanup, { once: true })") &&
  appSourceForUpdateHookBridge.includes('getGhTherapyBroadcastChannel: getGHTherapyBroadcastChannel') &&
  ghTherapyMonitorSource.includes('function closeGHTherapyBroadcastChannel') &&
  ghTherapyMonitorSource.includes('function postGHTherapyBroadcastMessage') &&
  ghTherapyMonitorSource.includes('function registerGHTherapyBroadcastChannelLifecycleCleanup') &&
  ghTherapyMonitorSource.includes("window.addEventListener('pagehide', cleanup, { once: true })") &&
  ghTherapyMonitorSource.includes("window.addEventListener('beforeunload', cleanup, { once: true })") &&
  ghTherapyMonitorSource.includes("postGHTherapyBroadcastMessage({ type: 'update' }, 'saveTherapyPoints:update-after-db-save')") &&
  ghTherapyMonitorSource.includes("postGHTherapyBroadcastMessage({ type: 'clear' }, 'resetGhMonitorPersistState:clear')"),
  {
    appCloseHelper: appSourceForUpdateHookBridge.includes('function closeGHTherapyBroadcastChannel'),
    appLifecycleHelper: appSourceForUpdateHookBridge.includes('function registerGHTherapyBroadcastChannelLifecycleCleanup'),
    appPagehide: appSourceForUpdateHookBridge.includes("window.addEventListener('pagehide', cleanup, { once: true })"),
    appBeforeUnload: appSourceForUpdateHookBridge.includes("window.addEventListener('beforeunload', cleanup, { once: true })"),
    appAdapterGuard: appSourceForUpdateHookBridge.includes('getGhTherapyBroadcastChannel: getGHTherapyBroadcastChannel'),
    monitorCloseHelper: ghTherapyMonitorSource.includes('function closeGHTherapyBroadcastChannel'),
    monitorPostHelper: ghTherapyMonitorSource.includes('function postGHTherapyBroadcastMessage'),
    monitorLifecycleHelper: ghTherapyMonitorSource.includes('function registerGHTherapyBroadcastChannelLifecycleCleanup'),
    monitorPagehide: ghTherapyMonitorSource.includes("window.addEventListener('pagehide', cleanup, { once: true })"),
    monitorBeforeUnload: ghTherapyMonitorSource.includes("window.addEventListener('beforeunload', cleanup, { once: true })"),
    updatePayloadUnchanged: ghTherapyMonitorSource.includes("postGHTherapyBroadcastMessage({ type: 'update' }, 'saveTherapyPoints:update-after-db-save')"),
    clearPayloadUnchanged: ghTherapyMonitorSource.includes("postGHTherapyBroadcastMessage({ type: 'clear' }, 'resetGhMonitorPersistState:clear')")
  });

addResult('gh-therapy-mutationobserver-lifecycle-cleanup-static',
  ghTherapyMonitorSource.includes('let ghTherapyMonitorDomObserver = null') &&
  ghTherapyMonitorSource.includes('function getGHTherapyMonitorMutationObserverRoot') &&
  ghTherapyMonitorSource.includes("const preferredRootIds = ['modulesWrapper', 'doctorBottom', 'advancedGrowthSection']") &&
  ghTherapyMonitorSource.includes('function disconnectGHTherapyMonitorDomObserver') &&
  ghTherapyMonitorSource.includes('function registerGHTherapyMonitorMutationObserverLifecycleCleanup') &&
  ghTherapyMonitorSource.includes("window.addEventListener('pagehide', cleanup, { once: true })") &&
  ghTherapyMonitorSource.includes("window.addEventListener('beforeunload', cleanup, { once: true })") &&
  ghTherapyMonitorSource.includes('function startGHTherapyMonitorDomObserver') &&
  ghTherapyMonitorSource.includes("observer.observe(root, { childList: true, subtree: true })") &&
  ghTherapyMonitorSource.includes("scheduleGHTherapyMonitorRepositionFromObserver('gh-therapy-monitor-dom-observer-card-detected')") &&
  ghTherapyMonitorSource.includes("disconnectGHTherapyMonitorDomObserver(contextLabel || 'gh-therapy-monitor-dom-observer-target-positioned')") &&
  !ghTherapyMonitorSource.includes('const obs = new MutationObserver') &&
  !ghTherapyMonitorSource.includes('obs.observe(document.body'),
  {
    hasObserverState: ghTherapyMonitorSource.includes('let ghTherapyMonitorDomObserver = null'),
    scopedRootHelper: ghTherapyMonitorSource.includes('function getGHTherapyMonitorMutationObserverRoot') && ghTherapyMonitorSource.includes("const preferredRootIds = ['modulesWrapper', 'doctorBottom', 'advancedGrowthSection']"),
    disconnectHelper: ghTherapyMonitorSource.includes('function disconnectGHTherapyMonitorDomObserver'),
    lifecycleHelper: ghTherapyMonitorSource.includes('function registerGHTherapyMonitorMutationObserverLifecycleCleanup'),
    pagehide: ghTherapyMonitorSource.includes("window.addEventListener('pagehide', cleanup, { once: true })"),
    beforeUnload: ghTherapyMonitorSource.includes("window.addEventListener('beforeunload', cleanup, { once: true })"),
    observesRoot: ghTherapyMonitorSource.includes("observer.observe(root, { childList: true, subtree: true })"),
    disconnectsAfterTargetFound: ghTherapyMonitorSource.includes("disconnectGHTherapyMonitorDomObserver(contextLabel || 'gh-therapy-monitor-dom-observer-target-positioned')"),
    legacyBodyObserverRemoved: !ghTherapyMonitorSource.includes('const obs = new MutationObserver') && !ghTherapyMonitorSource.includes('obs.observe(document.body')
  });


addResult('fetch-timeout-cleanup-static',
  vildaAppHelpersSource.includes('async function vildaFetchWithTimeout') &&
  vildaAppHelpersSource.includes('AbortController') &&
  vildaAppHelpersSource.includes('clearTimeout(timeoutId)') &&
  vildaAppHelpersSource.includes('VildaFetchTimeoutError') &&
  vildaAppHelpersSource.includes('VildaFetchHttpError') &&
  vildaAppHelpersSource.includes('VildaFetchNetworkError') &&
  vildaAppHelpersSource.includes('VildaFetchJsonParseError') &&
  vildaAppHelpersSource.includes('fetchJsonWithTimeout: vildaFetchJsonWithTimeout') &&
  nutritionMicrosSourceForFetch.includes('nutritionMicrosResolveFetchJsonWithTimeout') &&
  nutritionMicrosSourceForFetch.includes("context: 'nutrition-micros:fetch-json-candidate'") &&
  !nutritionMicrosSourceForFetch.includes('const response = await fetch(candidate') &&
  macroPracticeSourceForFetch.includes('macroPracticeResolveFetchJsonWithTimeout') &&
  macroPracticeSourceForFetch.includes("context: 'macro-practice:fetch-json-candidate'") &&
  !macroPracticeSourceForFetch.includes('const response = await fetch(candidate') &&
  appSourceForUpdateHookBridge.includes('fetchBlobWithTimeout') &&
  appSourceForUpdateHookBridge.includes("context: 'main-bmi-metabolism-pdf:logo-blob'") &&
  clcrSourceForFetch.includes('fetchArrayBufferWithTimeout') &&
  clcrSourceForFetch.includes("context: 'clcr-norms-xlsx'") &&
  clcrSourceForFetch.includes("context: 'clcr-ai-interpretation'"),
  {
    helperHasAbortController: vildaAppHelpersSource.includes('AbortController'),
    helperClearsTimeout: vildaAppHelpersSource.includes('clearTimeout(timeoutId)'),
    helperClassifiesErrors: ['VildaFetchTimeoutError', 'VildaFetchHttpError', 'VildaFetchNetworkError', 'VildaFetchJsonParseError'].every((token) => vildaAppHelpersSource.includes(token)),
    nutritionUsesHelper: nutritionMicrosSourceForFetch.includes('nutritionMicrosResolveFetchJsonWithTimeout') && !nutritionMicrosSourceForFetch.includes('const response = await fetch(candidate'),
    macroUsesHelper: macroPracticeSourceForFetch.includes('macroPracticeResolveFetchJsonWithTimeout') && !macroPracticeSourceForFetch.includes('const response = await fetch(candidate'),
    appLogoUsesBlobHelper: appSourceForUpdateHookBridge.includes('fetchBlobWithTimeout'),
    clcrUsesHelpers: clcrSourceForFetch.includes('fetchArrayBufferWithTimeout') && clcrSourceForFetch.includes('fetchJsonWithTimeout')
  });


addResult('service-worker-fetch-cache-strategy-static',
  sw.includes('const SW_FETCH_CACHE_STRATEGY_AUDIT = Object.freeze') &&
  sw.includes("step: '8O-11e'") &&
  sw.includes("latestValidationStep: '8O-11k'") &&
  sw.includes("navigation: 'cache-first-background-refresh'") &&
  sw.includes("shellAssets: 'cache-first-background-refresh'") &&
  sw.includes("runtime: 'cache-first-background-refresh'") &&
  sw.includes("timeoutPolicy: 'intentional-no-timeout-inside-service-worker-fetch-paths'") &&
  sw.includes("bypassPolicy: 'range-video-videos-presentations'") &&
  sw.includes("offlineUpdateFlowSmoke: 'tools/service_worker_offline_update_flow_smoke.js'") &&
  sw.includes('semanticsChanged: false') &&
  sw.includes('const networkResponse = await fetch(networkRequest);') &&
  sw.includes('const networkResponse = await fetch(request);') &&
  sw.includes('const response = await fetch(request);') &&
  !sw.includes('function fetchWithServiceWorkerTimeout'),
  {
    hasAuditConstant: sw.includes('const SW_FETCH_CACHE_STRATEGY_AUDIT = Object.freeze'),
    cacheFirstNavigation: sw.includes("navigation: 'cache-first-background-refresh'"),
    cacheFirstRuntime: sw.includes("runtime: 'cache-first-background-refresh'"),
    timeoutExemptPolicy: sw.includes("timeoutPolicy: 'intentional-no-timeout-inside-service-worker-fetch-paths'"),
    latestValidationStep: sw.includes("latestValidationStep: '8O-11k'"),
    offlineUpdateFlowSmoke: sw.includes("offlineUpdateFlowSmoke: 'tools/service_worker_offline_update_flow_smoke.js'"),
    semanticsChangedFalse: sw.includes('semanticsChanged: false'),
    directFetchesPreserved: sw.includes('const networkResponse = await fetch(networkRequest);') && sw.includes('const networkResponse = await fetch(request);') && sw.includes('const response = await fetch(request);'),
    noServiceWorkerTimeoutHelper: !sw.includes('function fetchWithServiceWorkerTimeout')
  });

const serviceWorkerOfflineUpdateFlowSmokeSource = read('tools/service_worker_offline_update_flow_smoke.js');
addResult('service-worker-offline-update-flow-smoke-static',
  serviceWorkerOfflineUpdateFlowSmokeSource.includes('runServiceWorkerOfflineUpdateFlowSmoke') &&
  serviceWorkerOfflineUpdateFlowSmokeSource.includes('install-required-shell-precache') &&
  serviceWorkerOfflineUpdateFlowSmokeSource.includes('navigation-cache-first-background-refresh') &&
  serviceWorkerOfflineUpdateFlowSmokeSource.includes('runtime-cache-first-background-refresh') &&
  serviceWorkerOfflineUpdateFlowSmokeSource.includes('message-skip-waiting-update-flow') &&
  serviceWorkerOfflineUpdateFlowSmokeSource.includes('registeredRealServiceWorker: false') &&
  serviceWorkerOfflineUpdateFlowSmokeSource.includes('mockedCacheApiOnly: true'),
  {
    hasRunner: serviceWorkerOfflineUpdateFlowSmokeSource.includes('runServiceWorkerOfflineUpdateFlowSmoke'),
    hasInstallScenario: serviceWorkerOfflineUpdateFlowSmokeSource.includes('install-required-shell-precache'),
    hasNavigationScenario: serviceWorkerOfflineUpdateFlowSmokeSource.includes('navigation-cache-first-background-refresh'),
    hasRuntimeScenario: serviceWorkerOfflineUpdateFlowSmokeSource.includes('runtime-cache-first-background-refresh'),
    hasSkipWaitingScenario: serviceWorkerOfflineUpdateFlowSmokeSource.includes('message-skip-waiting-update-flow'),
    realServiceWorkerGuard: serviceWorkerOfflineUpdateFlowSmokeSource.includes('registeredRealServiceWorker: false'),
    mockedCacheGuard: serviceWorkerOfflineUpdateFlowSmokeSource.includes('mockedCacheApiOnly: true')
  });

addResult('service-worker-versioned-shell-cache-key-static',
  sw.includes('function getShellCacheKeyFromStaticUrl') &&
  sw.includes('return url.search ? `${pathname}${url.search}` : pathname;') &&
  sw.includes(': getShellCacheKeyFromStaticUrl(url);') &&
  sw.includes("versionedShellCacheKeyFixApplied: true") &&
  serviceWorkerOfflineUpdateFlowSmokeSource.includes('install-versioned-shell-cache-key-precache') &&
  serviceWorkerOfflineUpdateFlowSmokeSource.includes('versioned-shell-asset-offline-cache-hit'),
  {
    hasStaticKeyHelper: sw.includes('function getShellCacheKeyFromStaticUrl'),
    precacheUsesStaticKeyHelper: sw.includes(': getShellCacheKeyFromStaticUrl(url);'),
    returnsPathnamePlusSearch: sw.includes('return url.search ? `${pathname}${url.search}` : pathname;'),
    auditFlag: sw.includes("versionedShellCacheKeyFixApplied: true"),
    e2ePrecacheCheck: serviceWorkerOfflineUpdateFlowSmokeSource.includes('install-versioned-shell-cache-key-precache'),
    e2eOfflineHitCheck: serviceWorkerOfflineUpdateFlowSmokeSource.includes('versioned-shell-asset-offline-cache-hit')
  });

addResult('service-worker-runtime-cache-pruning-static',
  sw.includes('const RUNTIME_CACHE_MAX_ENTRIES = 96;') &&
  sw.includes('const RUNTIME_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;') &&
  sw.includes("const RUNTIME_METADATA_CACHE_KEY_PREFIX = '/__vilda_runtime_cache_metadata__/'") &&
  sw.includes('function pruneRuntimeCache') &&
  sw.includes('function cacheRuntimeResponse') &&
  sw.includes('await pruneRuntimeCache(await caches.open(RUNTIME_CACHE));') &&
  serviceWorkerOfflineUpdateFlowSmokeSource.includes('runtime-cache-ttl-expired-entry-pruned') &&
  serviceWorkerOfflineUpdateFlowSmokeSource.includes('runtime-cache-max-entry-prune'),
  {
    hasMaxEntries: sw.includes('const RUNTIME_CACHE_MAX_ENTRIES = 96;'),
    hasTtl: sw.includes('const RUNTIME_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;'),
    hasMetadataPrefix: sw.includes("const RUNTIME_METADATA_CACHE_KEY_PREFIX = '/__vilda_runtime_cache_metadata__/'"),
    hasPruneHelper: sw.includes('function pruneRuntimeCache'),
    runtimeCacheUsesPrune: sw.includes('function cacheRuntimeResponse') && sw.includes('await pruneRuntimeCache(cache);'),
    activateUsesPrune: sw.includes('await pruneRuntimeCache(await caches.open(RUNTIME_CACHE));'),
    e2eTtlCheck: serviceWorkerOfflineUpdateFlowSmokeSource.includes('runtime-cache-ttl-expired-entry-pruned'),
    e2eMaxCheck: serviceWorkerOfflineUpdateFlowSmokeSource.includes('runtime-cache-max-entry-prune')
  });

const ios26UiSource = read('ios26-ui.js');
addResult('service-worker-client-lifecycle-audit-static',
  ios26UiSource.includes("const SW_CLIENT_LIFECYCLE_STEP = '8O-11k';") &&
  ios26UiSource.includes('__vildaServiceWorkerClientLifecycle') &&
  ios26UiSource.includes('state.registrationPromise') &&
  ios26UiSource.includes('function attachServiceWorkerRegistrationLifecycle') &&
  ios26UiSource.includes('function attachServiceWorkerControllerChangeLifecycle') &&
  ios26UiSource.includes('controllerchange') &&
  ios26UiSource.includes('state.reloadedAfterControllerChange') &&
  ios26UiSource.includes("waiting.postMessage({ type: 'SKIP_WAITING' });") &&
  read('docpro.html').includes('__vildaDocproLegacyServiceWorkerRegistrationRemoved8O11j') &&
  !read('docpro.html').includes("navigator.serviceWorker.register('service-worker-kalorii.js')") &&
  read('index.html').includes('ios26-ui.js?v=18') &&
  read('docpro.html').includes('ios26-ui.js?v=18') &&
  read('kalkulator-klirens.html').includes('ios26-ui.js?v=18') &&
  sw.includes("'/ios26-ui.js?v=18'") &&
  ghTherapyAuditSource.includes('SERVICE_WORKER_CLIENT_LIFECYCLE_LOCATIONS') &&
  ghTherapyAuditSource.includes('getServiceWorkerClientLifecycleAuditSnapshot'),
  {
    hasLifecycleState: ios26UiSource.includes('__vildaServiceWorkerClientLifecycle'),
    hasRegistrationPromiseGuard: ios26UiSource.includes('state.registrationPromise'),
    hasRegistrationLifecycleHelper: ios26UiSource.includes('function attachServiceWorkerRegistrationLifecycle'),
    hasControllerChangeHelper: ios26UiSource.includes('function attachServiceWorkerControllerChangeLifecycle'),
    hasReloadGuard: ios26UiSource.includes('state.reloadedAfterControllerChange'),
    skipWaitingPayloadPreserved: ios26UiSource.includes("waiting.postMessage({ type: 'SKIP_WAITING' });"),
    docproLegacyRegistrationRemoved: read('docpro.html').includes('__vildaDocproLegacyServiceWorkerRegistrationRemoved8O11j') && !read('docpro.html').includes("navigator.serviceWorker.register('service-worker-kalorii.js')"),
    ios26UiCacheBustUpdated: read('index.html').includes('ios26-ui.js?v=18') && read('docpro.html').includes('ios26-ui.js?v=18') && read('kalkulator-klirens.html').includes('ios26-ui.js?v=18') && sw.includes("'/ios26-ui.js?v=18'"),
    auditSnapshotApi: ghTherapyAuditSource.includes('getServiceWorkerClientLifecycleAuditSnapshot')
  });

const ghTherapyResourceSnapshot = context.vildaGetGHTherapyIndexedDbAuditSnapshot({ includePlan: true });
addResult('gh-therapy-resource-audit-dynamic',
  ghTherapyResourceSnapshot &&
  ghTherapyResourceSnapshot.step === '8O-11k' &&
  ghTherapyResourceSnapshot.readOnly === true &&
  ghTherapyResourceSnapshot.openedIndexedDb === false &&
  ghTherapyResourceSnapshot.queriedIndexedDb === false &&
  ghTherapyResourceSnapshot.changedTherapyData === false &&
  ghTherapyResourceSnapshot.postedBroadcastMessage === false &&
  ghTherapyResourceSnapshot.performedFetch === false &&
  ghTherapyResourceSnapshot.fetchedAsyncResource === false &&
  ghTherapyResourceSnapshot.cleanupApplied &&
  ghTherapyResourceSnapshot.cleanupApplied.indexedDbClose === true &&
  ghTherapyResourceSnapshot.cleanupApplied.onVersionChange === true &&
  ghTherapyResourceSnapshot.cleanupApplied.broadcastChannelLifecycle === true &&
  ghTherapyResourceSnapshot.cleanupApplied.mutationObserverLifecycle === true &&
  ghTherapyResourceSnapshot.cleanupApplied.mutationObserverScope === true &&
  ghTherapyResourceSnapshot.cleanupApplied.fetchTimeout === true &&
  ghTherapyResourceSnapshot.cleanupApplied.asyncFetchTimeout === true &&
  ghTherapyResourceSnapshot.cleanupApplied.serviceWorkerTimeoutExemption === true &&
  ghTherapyResourceSnapshot.cleanupApplied.serviceWorkerFetchCacheStrategy === true &&
  ghTherapyResourceSnapshot.cleanupApplied.serviceWorkerOfflineUpdateFlowSmoke === true &&
  ghTherapyResourceSnapshot.cleanupApplied.serviceWorkerVersionedShellCacheKey === true &&
  ghTherapyResourceSnapshot.cleanupApplied.serviceWorkerStaleCachePruningAudit === true &&
  ghTherapyResourceSnapshot.cleanupApplied.serviceWorkerRuntimeCachePruning === true &&
  ghTherapyResourceSnapshot.cleanupApplied.serviceWorkerClientLifecycle === true &&
  ghTherapyResourceSnapshot.broadcastChannelLifecycleCleanupApplied === true &&
  ghTherapyResourceSnapshot.mutationObserverLifecycleCleanupApplied === true &&
  ghTherapyResourceSnapshot.mutationObserverScopeCleanupApplied === true &&
  ghTherapyResourceSnapshot.fetchTimeoutCleanupApplied === true &&
  ghTherapyResourceSnapshot.asyncFetchTimeoutCleanupApplied === true &&
  ghTherapyResourceSnapshot.serviceWorkerTimeoutExemptionAuditApplied === true &&
  ghTherapyResourceSnapshot.serviceWorkerCacheStrategyAuditApplied === true &&
  ghTherapyResourceSnapshot.serviceWorkerOfflineUpdateFlowSmokeApplied === true &&
  ghTherapyResourceSnapshot.serviceWorkerOfflineUpdateFlowSmokeDefined === true &&
  ghTherapyResourceSnapshot.serviceWorkerVersionedShellCacheKeyFixApplied === true &&
  ghTherapyResourceSnapshot.serviceWorkerStaleCachePruningAuditApplied === true &&
  ghTherapyResourceSnapshot.serviceWorkerRuntimeCacheGrowthRiskAudited === true &&
  ghTherapyResourceSnapshot.serviceWorkerClientLifecycleAuditApplied === true &&
  ghTherapyResourceSnapshot.database &&
  ghTherapyResourceSnapshot.database.name === 'ghTherapyDB' &&
  ghTherapyResourceSnapshot.database.store === 'ghTherapyPoints' &&
  ghTherapyResourceSnapshot.database.closeCoverage &&
  ghTherapyResourceSnapshot.database.closeCoverage.needsCleanup === false &&
  Array.isArray(ghTherapyResourceSnapshot.database.closeCoverage.missingCloseIds) &&
  ghTherapyResourceSnapshot.database.closeCoverage.missingCloseIds.length === 0 &&
  Array.isArray(ghTherapyResourceSnapshot.database.closeCoverage.fullCloseIds) &&
  ghTherapyResourceSnapshot.database.closeCoverage.fullCloseIds.includes('app:getTherapyPointsFromDB') &&
  ghTherapyResourceSnapshot.database.closeCoverage.fullCloseIds.includes('app:clearTherapyPointsInDB') &&
  ghTherapyResourceSnapshot.database.closeCoverage.fullCloseIds.includes('gh-monitor:saveTherapyPointsToDB') &&
  ghTherapyResourceSnapshot.database.onVersionChangeCoverage &&
  ghTherapyResourceSnapshot.database.onVersionChangeCoverage.needsCleanup === false &&
  Array.isArray(ghTherapyResourceSnapshot.database.onVersionChangeCoverage.missingIds) &&
  ghTherapyResourceSnapshot.database.onVersionChangeCoverage.missingIds.length === 0 &&
  Array.isArray(ghTherapyResourceSnapshot.database.onVersionChangeCoverage.coveredIds) &&
  ghTherapyResourceSnapshot.database.onVersionChangeCoverage.coveredIds.includes('app:openGHTherapyDB') &&
  ghTherapyResourceSnapshot.database.onVersionChangeCoverage.coveredIds.includes('gh-monitor:openTherapyDB') &&
  ghTherapyResourceSnapshot.summary &&
  ghTherapyResourceSnapshot.summary.cleanupRecommended === false &&
  ghTherapyResourceSnapshot.summary.allKnownDbCloseOperationsCovered === true &&
  ghTherapyResourceSnapshot.summary.indexedDbCloseCleanupRecommended === false &&
  ghTherapyResourceSnapshot.summary.missingOnVersionChangeCount === 0 &&
  ghTherapyResourceSnapshot.summary.allKnownOnVersionChangeOpenersCovered === true &&
  ghTherapyResourceSnapshot.summary.onVersionChangeCleanupRecommended === false &&
  ghTherapyResourceSnapshot.summary.missingBroadcastCloseHandlerCount === 0 &&
  ghTherapyResourceSnapshot.summary.broadcastChannelLifecycleCleanupComplete === true &&
  ghTherapyResourceSnapshot.summary.broadcastChannelLifecycleCleanupRecommended === false &&
  ghTherapyResourceSnapshot.summary.missingFetchTimeoutCount === 0 &&
  ghTherapyResourceSnapshot.summary.missingFetchErrorClassificationCount === 0 &&
  ghTherapyResourceSnapshot.summary.fetchTimeoutCleanupComplete === true &&
  ghTherapyResourceSnapshot.summary.missingServiceWorkerTimeoutExemptionCount === 0 &&
  ghTherapyResourceSnapshot.summary.serviceWorkerTimeoutExemptionAuditComplete === true &&
  ghTherapyResourceSnapshot.summary.serviceWorkerFetchCacheStrategyAuditComplete === true &&
  ghTherapyResourceSnapshot.summary.serviceWorkerCacheStrategyPreserved === true &&
  ghTherapyResourceSnapshot.summary.serviceWorkerFetchesDeferred === false &&
  ghTherapyResourceSnapshot.summary.fetchTimeoutCleanupRecommended === false &&
  ghTherapyResourceSnapshot.summary.serviceWorkerOfflineUpdateFlowSmokeDefined === true &&
  ghTherapyResourceSnapshot.summary.serviceWorkerOfflineUpdateFlowSmokeComplete === true &&
  ghTherapyResourceSnapshot.summary.serviceWorkerOfflineFallbackSmokeCovered === true &&
  ghTherapyResourceSnapshot.summary.serviceWorkerUpdateFlowSmokeCovered === true &&
  ghTherapyResourceSnapshot.summary.serviceWorkerE2ESmokeUsesMockedCacheOnly === true &&
  ghTherapyResourceSnapshot.summary.serviceWorkerE2ESmokeStrategyPreserved === true &&
  ghTherapyResourceSnapshot.summary.serviceWorkerVersionedShellCacheKeyFixComplete === true &&
  ghTherapyResourceSnapshot.summary.serviceWorkerStaleCachePruningAuditComplete === true &&
  ghTherapyResourceSnapshot.summary.serviceWorkerStaleShellCachePruneCovered === true &&
  ghTherapyResourceSnapshot.summary.serviceWorkerOldRuntimeCacheMigrationCovered === true &&
  ghTherapyResourceSnapshot.summary.serviceWorkerCurrentRuntimeCachePreserved === true &&
  ghTherapyResourceSnapshot.summary.serviceWorkerUnrelatedCachesPreserved === true &&
  ghTherapyResourceSnapshot.summary.serviceWorkerRuntimeCacheGrowthRiskAudited === true &&
  ghTherapyResourceSnapshot.summary.serviceWorkerRuntimeCachePruningImplemented === true &&
  ghTherapyResourceSnapshot.summary.serviceWorkerRuntimeCachePruningRecommendedFollowUp === false &&
  ghTherapyResourceSnapshot.summary.serviceWorkerClientLifecycleAuditComplete === true &&
  ghTherapyResourceSnapshot.summary.serviceWorkerClientLifecycleSingletonRegistrationCovered === true &&
  ghTherapyResourceSnapshot.summary.serviceWorkerClientLifecycleControllerchangeReloadGuardCovered === true &&
  ghTherapyResourceSnapshot.summary.serviceWorkerClientLifecycleDocproLegacyDuplicateRegistrationRemoved === true &&
  ghTherapyResourceSnapshot.summary.serviceWorkerClientLifecycleCleanupRecommended === false &&
  ghTherapyResourceSnapshot.serviceWorker &&
  ghTherapyResourceSnapshot.serviceWorker.clientLifecycle &&
  ghTherapyResourceSnapshot.serviceWorker.clientLifecycle.coverage &&
  ghTherapyResourceSnapshot.serviceWorker.clientLifecycle.coverage.needsCleanup === false &&
  ghTherapyResourceSnapshot.serviceWorker.clientLifecycle.coverage.auditRegistersServiceWorker === false &&
  ghTherapyResourceSnapshot.broadcastChannel &&
  ghTherapyResourceSnapshot.broadcastChannel.channelName === 'gh-therapy-sync' &&
  ghTherapyResourceSnapshot.broadcastChannel.coverage &&
  ghTherapyResourceSnapshot.broadcastChannel.coverage.hasCloseHandlers === true &&
  ghTherapyResourceSnapshot.broadcastChannel.coverage.needsCleanup === false &&
  ghTherapyResourceSnapshot.mutationObserver &&
  ghTherapyResourceSnapshot.mutationObserver.coverage &&
  ghTherapyResourceSnapshot.mutationObserver.coverage.needsCleanup === false &&
  ghTherapyResourceSnapshot.mutationObserver.coverage.hasDisconnectHandlers === true &&
  Array.isArray(ghTherapyResourceSnapshot.mutationObserver.coverage.missingDisconnectIds) &&
  ghTherapyResourceSnapshot.mutationObserver.coverage.missingDisconnectIds.length === 0 &&
  Array.isArray(ghTherapyResourceSnapshot.mutationObserver.coverage.disconnectCoveredIds) &&
  ghTherapyResourceSnapshot.mutationObserver.coverage.disconnectCoveredIds.includes('gh-monitor:ghTherapyMonitorDomObserver') &&
  Array.isArray(ghTherapyResourceSnapshot.mutationObserver.coverage.scopedIds) &&
  ghTherapyResourceSnapshot.mutationObserver.coverage.scopedIds.includes('gh-monitor:ghTherapyMonitorDomObserver') &&
  ghTherapyResourceSnapshot.asyncFetch &&
  ghTherapyResourceSnapshot.asyncFetch.coverage &&
  ghTherapyResourceSnapshot.asyncFetch.coverage.needsCleanup === false &&
  ghTherapyResourceSnapshot.asyncFetch.coverage.allInScopeFetchesCovered === true &&
  Array.isArray(ghTherapyResourceSnapshot.asyncFetch.coverage.missingTimeoutIds) &&
  ghTherapyResourceSnapshot.asyncFetch.coverage.missingTimeoutIds.length === 0 &&
  Array.isArray(ghTherapyResourceSnapshot.asyncFetch.coverage.timeoutCoveredIds) &&
  ghTherapyResourceSnapshot.asyncFetch.coverage.timeoutCoveredIds.includes('nutrition-micros:fetchJsonCandidates') &&
  ghTherapyResourceSnapshot.asyncFetch.coverage.timeoutCoveredIds.includes('macro-practice:macroPracticeFetchJsonCandidates') &&
  ghTherapyResourceSnapshot.asyncFetch.coverage.timeoutCoveredIds.includes('clcr:normsXlsxArrayBuffer') &&
  Array.isArray(ghTherapyResourceSnapshot.asyncFetch.coverage.serviceWorkerTimeoutExemptIds) &&
  ghTherapyResourceSnapshot.asyncFetch.coverage.serviceWorkerTimeoutExemptIds.includes('service-worker:updateShellFromNetwork') &&
  ghTherapyResourceSnapshot.asyncFetch.coverage.serviceWorkerTimeoutExemptIds.includes('service-worker:updateRuntimeFromNetwork') &&
  ghTherapyResourceSnapshot.asyncFetch.coverage.serviceWorkerTimeoutExemptIds.includes('service-worker:fetchAndStorePrecacheUrl') &&
  Array.isArray(ghTherapyResourceSnapshot.asyncFetch.coverage.missingServiceWorkerTimeoutExemptionIds) &&
  ghTherapyResourceSnapshot.asyncFetch.coverage.missingServiceWorkerTimeoutExemptionIds.length === 0 &&
  ghTherapyResourceSnapshot.asyncFetch.coverage.serviceWorkerTimeoutExemptionAuditComplete === true &&
  ghTherapyResourceSnapshot.asyncFetch.coverage.serviceWorkerCacheStrategyPreserved === true &&
  ghTherapyResourceSnapshot.asyncFetch.coverage.serviceWorkerFetchesDeferred === false &&
  ghTherapyResourceSnapshot.serviceWorker &&
  ghTherapyResourceSnapshot.serviceWorker.coverage &&
  ghTherapyResourceSnapshot.serviceWorker.coverage.cacheStrategyAuditComplete === true &&
  ghTherapyResourceSnapshot.serviceWorker.coverage.noCacheSemanticsChanges === true &&
  ghTherapyResourceSnapshot.serviceWorker.coverage.noOfflineSemanticsChanges === true &&
  ghTherapyResourceSnapshot.serviceWorker.offlineUpdateFlowSmoke &&
  ghTherapyResourceSnapshot.serviceWorker.offlineUpdateFlowSmoke.coverage &&
  ghTherapyResourceSnapshot.serviceWorker.offlineUpdateFlowSmoke.coverage.needsCleanup === false &&
  ghTherapyResourceSnapshot.serviceWorker.offlineUpdateFlowSmoke.coverage.updateFlowSmokeCovered === true,
  {
    snapshot: ghTherapyResourceSnapshot ? {
      step: ghTherapyResourceSnapshot.step,
      kind: ghTherapyResourceSnapshot.kind,
      readOnly: ghTherapyResourceSnapshot.readOnly,
      openedIndexedDb: ghTherapyResourceSnapshot.openedIndexedDb,
      changedTherapyData: ghTherapyResourceSnapshot.changedTherapyData,
      performedFetch: ghTherapyResourceSnapshot.performedFetch,
      cleanupApplied: ghTherapyResourceSnapshot.cleanupApplied,
      database: {
        name: ghTherapyResourceSnapshot.database && ghTherapyResourceSnapshot.database.name,
        store: ghTherapyResourceSnapshot.database && ghTherapyResourceSnapshot.database.store,
        closeCoverage: ghTherapyResourceSnapshot.database && ghTherapyResourceSnapshot.database.closeCoverage,
        onVersionChangeCoverage: ghTherapyResourceSnapshot.database && ghTherapyResourceSnapshot.database.onVersionChangeCoverage
      },
      broadcastChannel: {
        channelName: ghTherapyResourceSnapshot.broadcastChannel && ghTherapyResourceSnapshot.broadcastChannel.channelName,
        coverage: ghTherapyResourceSnapshot.broadcastChannel && ghTherapyResourceSnapshot.broadcastChannel.coverage
      },
      mutationObserver: {
        watchedSelector: ghTherapyResourceSnapshot.mutationObserver && ghTherapyResourceSnapshot.mutationObserver.watchedSelector,
        coverage: ghTherapyResourceSnapshot.mutationObserver && ghTherapyResourceSnapshot.mutationObserver.coverage
      },
      asyncFetch: {
        helperNames: ghTherapyResourceSnapshot.asyncFetch && ghTherapyResourceSnapshot.asyncFetch.helperNames,
        coverage: ghTherapyResourceSnapshot.asyncFetch && ghTherapyResourceSnapshot.asyncFetch.coverage
      },
      summary: ghTherapyResourceSnapshot.summary,
      serviceWorkerOfflineUpdateFlowSmoke: ghTherapyResourceSnapshot.serviceWorker && ghTherapyResourceSnapshot.serviceWorker.offlineUpdateFlowSmoke
    } : null
  });

const fakeBridge = function vildaUpdateHooksBridge8O10dB() {};
fakeBridge.__vildaUpdateHooksRegistryWrapper = true;
fakeBridge.__vildaUpdateHooksBridgeStep = '8O-10d-g';
fakeBridge.__vildaUpdateHooksMigratedWrapperId = 'app:bmi50-info-after-update';
fakeBridge.__vildaUpdateHooksMigratedWrapperIds = ['app:bmi50-info-after-update', 'app:ideal-weight-ui-after-update'];
fakeBridge.__vildaUpdateHooksPreviousUpdatePresent = false;
context.__vildaUpdateHooksBridge8O10dB = fakeBridge;
context.__vildaUpdateHooksBridge8O10dC = fakeBridge;
context.__vildaUpdateHooksBridge8O10dD = fakeBridge;
context.__vildaUpdateHooksBridge8O10dE = fakeBridge;
context.__vildaUpdateHooksBridge8O10dF = fakeBridge;
context.__vildaUpdateHooksBridge8O10dG = fakeBridge;
context.__vildaUpdateHooksBridge8O10dBHookId = 'app:bmi50-info-after-update';
context.__vildaUpdateHooksBridge8O10dCHookIds = ['app:bmi50-info-after-update', 'app:ideal-weight-ui-after-update'];
context.__vildaUpdateHooksBridge8O10dDHookIds = ['app:bmi50-info-after-update', 'app:ideal-weight-ui-after-update'];
context.update = fakeBridge;
context.VildaUpdateHooks.registerAfterUpdateHook(function nodeBmi50Hook() {}, { id: 'app:bmi50-info-after-update', replace: true, order: 10 });
context.VildaUpdateHooks.registerAfterUpdateHook(function nodeIdealWeightHook() {}, { id: 'app:ideal-weight-ui-after-update', replace: true, order: 20 });
runScriptInContext('vilda_diet_recommendations.js', context);
context.vildaOnReady = function captureNutritionNormsInit(id, fn) {
  context.__nutritionNormsCapturedInit = { id, fn };
};
runScriptInContext('nutrition_norms.js', context);
if (typeof context.nutritionNormsRegisterAfterUpdateHook === 'function') {
  context.nutritionNormsRegisterAfterUpdateHook();
}

context.vildaOnReady = function captureNutritionMicrosInit(id, fn) {
  context.__nutritionMicrosCapturedInit = { id, fn };
};
runScriptInContext('nutrition_micros.js', context);
if (typeof context.nutritionMicrosRegisterAfterUpdateHook === 'function') {
  context.nutritionMicrosRegisterAfterUpdateHook();
}

const nutritionNormsSnapshot = typeof context.vildaGetNutritionNormsUpdateHookSnapshot === 'function' ? context.vildaGetNutritionNormsUpdateHookSnapshot() : null;
addResult('VildaNutritionNorms.update-hook',
  nutritionNormsSnapshot &&
  nutritionNormsSnapshot.readOnly === true &&
  nutritionNormsSnapshot.didCallWindowUpdate === false &&
  nutritionNormsSnapshot.didPatchWindowUpdate === false &&
  nutritionNormsSnapshot.migratedWrapperId === 'nutrition-norms:card-render-after-update' &&
  nutritionNormsSnapshot.hookRegistered === true &&
  context.VildaNutritionNorms && context.VildaNutritionNorms.version === '1.1.0' &&
  typeof context.VildaNutritionNorms.renderAfterUpdate === 'function' &&
  nutritionNormsSnapshot.hookOrder === 40 &&
  nutritionNormsSnapshot.legacyWrapperRemoved === true,
  { snapshot: nutritionNormsSnapshot ? {
    step: nutritionNormsSnapshot.step,
    hookRegistered: nutritionNormsSnapshot.hookRegistered,
    hookOrder: nutritionNormsSnapshot.hookOrder,
    orderAfterDietRecommendations: nutritionNormsSnapshot.orderAfterDietRecommendations,
    finalWindowUpdateHasLegacyNutritionMicrosWrapper: nutritionNormsSnapshot.finalWindowUpdateHasLegacyNutritionMicrosWrapper
  } : null });

const nutritionMicrosSnapshot = typeof context.vildaGetNutritionMicrosUpdateHookSnapshot === 'function' ? context.vildaGetNutritionMicrosUpdateHookSnapshot() : null;
addResult('VildaNutritionMicros.update-hook',
  nutritionMicrosSnapshot &&
  nutritionMicrosSnapshot.readOnly === true &&
  nutritionMicrosSnapshot.didCallWindowUpdate === false &&
  nutritionMicrosSnapshot.didPatchWindowUpdate === false &&
  nutritionMicrosSnapshot.migratedWrapperId === 'nutrition-micros:card-render-after-update' &&
  nutritionMicrosSnapshot.hookRegistered === true &&
  context.VildaNutritionMicros && context.VildaNutritionMicros.version === '1.2.0' &&
  typeof context.VildaNutritionMicros.renderAfterUpdate === 'function' &&
  nutritionMicrosSnapshot.hookOrder === 50 &&
  nutritionMicrosSnapshot.orderAfterNutritionNorms === true &&
  nutritionMicrosSnapshot.legacyWrapperRemoved === true,
  { snapshot: nutritionMicrosSnapshot ? {
    step: nutritionMicrosSnapshot.step,
    hookRegistered: nutritionMicrosSnapshot.hookRegistered,
    hookOrder: nutritionMicrosSnapshot.hookOrder,
    orderAfterNutritionNorms: nutritionMicrosSnapshot.orderAfterNutritionNorms,
    finalWindowUpdateHasLegacyNutritionMicrosWrapper: nutritionMicrosSnapshot.finalWindowUpdateHasLegacyNutritionMicrosWrapper
  } : null });

addResult('service-worker-client-update-ux-smoke-static',
  ios26UiSource.includes("const SW_CLIENT_LIFECYCLE_STEP = '8O-11k';") &&
  ios26UiSource.includes("const SW_CLIENT_LIFECYCLE_VERSION = '1.1.0';") &&
  ios26UiSource.includes('vildaGetServiceWorkerUpdateUxSnapshot') &&
  ios26UiSource.includes('updateBannerRefreshHandledCount') &&
  ios26UiSource.includes('updateBannerDismissHandledCount') &&
  ghTherapyAuditSource.includes('SERVICE_WORKER_CLIENT_UPDATE_UX_SMOKE_TOOL') &&
  ghTherapyAuditSource.includes('serviceWorkerClientUpdateUxSmokeComplete'), {
    iosStep: ios26UiSource.includes("const SW_CLIENT_LIFECYCLE_STEP = '8O-11k';"),
    iosVersion: ios26UiSource.includes("const SW_CLIENT_LIFECYCLE_VERSION = '1.1.0';"),
    uxSnapshotAlias: ios26UiSource.includes('vildaGetServiceWorkerUpdateUxSnapshot'),
    auditCoverage: ghTherapyAuditSource.includes('serviceWorkerClientUpdateUxSmokeComplete')
  });


addResult('VildaDietRecommendations.loaded', !!(context.VildaDietRecommendations && context.VildaDietRecommendations.version === '1.1.0'), { version: context.VildaDietRecommendations && context.VildaDietRecommendations.version });
const bridgeAwareSnapshot = context.VildaUpdateHooks.getSnapshot();
addResult('VildaUpdateHooks.bridge-aware-snapshot',
  bridgeAwareSnapshot &&
  bridgeAwareSnapshot.readOnly === true &&
  bridgeAwareSnapshot.appBridgeInstalled === true &&
  bridgeAwareSnapshot.existingWindowUpdateRewired === true &&
  bridgeAwareSnapshot.migrationStatus === 'all-known-wrappers-migrated' &&
  bridgeAwareSnapshot.migratedWrapperId === 'app:bmi50-info-after-update' &&
  Array.isArray(bridgeAwareSnapshot.migratedWrapperIds) &&
  bridgeAwareSnapshot.migratedWrapperIds.includes('app:ideal-weight-ui-after-update') &&
  bridgeAwareSnapshot.migratedWrapperIds.includes('diet:recommendations-visibility-after-update') &&
  bridgeAwareSnapshot.migratedWrapperIds.includes('nutrition-norms:card-render-after-update') &&
  bridgeAwareSnapshot.migratedWrapperIds.includes('nutrition-micros:card-render-after-update'),
  {
    snapshot: bridgeAwareSnapshot ? {
      step: bridgeAwareSnapshot.step,
      version: bridgeAwareSnapshot.version,
      appBridgeInstalled: bridgeAwareSnapshot.appBridgeInstalled,
      existingWindowUpdateRewired: bridgeAwareSnapshot.existingWindowUpdateRewired,
      migrationStatus: bridgeAwareSnapshot.migrationStatus,
      migratedWrapperId: bridgeAwareSnapshot.migratedWrapperId,
      migratedWrapperIds: bridgeAwareSnapshot.migratedWrapperIds,
      migratedHookIdsRegistered: bridgeAwareSnapshot.migratedHookIdsRegistered
    } : null
  });

const finalChainAuditBeforeNutritionWrappers = context.VildaUpdateHooks.getFinalUpdateChainAuditSnapshot();
addResult('VildaUpdateHooks.final-chain-audit',
  finalChainAuditBeforeNutritionWrappers &&
  finalChainAuditBeforeNutritionWrappers.readOnly === true &&
  finalChainAuditBeforeNutritionWrappers.didCallWindowUpdate === false &&
  finalChainAuditBeforeNutritionWrappers.didRunHooks === false &&
  finalChainAuditBeforeNutritionWrappers.allKnownWrappersMigrated === true &&
  finalChainAuditBeforeNutritionWrappers.hookOrderExpected === true &&
  finalChainAuditBeforeNutritionWrappers.registryBridgeFoundInFinalChain === true,
  {
    snapshot: finalChainAuditBeforeNutritionWrappers ? {
      step: finalChainAuditBeforeNutritionWrappers.step,
      version: finalChainAuditBeforeNutritionWrappers.version,
      allKnownWrappersMigrated: finalChainAuditBeforeNutritionWrappers.allKnownWrappersMigrated,
      hookOrderExpected: finalChainAuditBeforeNutritionWrappers.hookOrderExpected,
      finalWindowUpdateOwner: finalChainAuditBeforeNutritionWrappers.finalWindowUpdateOwner,
      outOfScopeRemainingWrapperIds: finalChainAuditBeforeNutritionWrappers.outOfScopeRemainingWrapperIds
    } : null
  });

const fakeNutritionMicrosWrapper = function nutritionMicrosWrappedUpdate() {};
fakeNutritionMicrosWrapper.__nutritionMicrosWrapped = true;
fakeNutritionMicrosWrapper.__nutritionMicrosOriginal = fakeBridge;
context.update = fakeNutritionMicrosWrapper;
const finalChainAuditWithNutritionWrappers = context.VildaUpdateHooks.getFinalUpdateChainAuditSnapshot();
addResult('VildaUpdateHooks.final-chain-audit-legacy-migrated-detection',
  finalChainAuditWithNutritionWrappers &&
  finalChainAuditWithNutritionWrappers.allKnownWrappersMigrated === true &&
  finalChainAuditWithNutritionWrappers.registryBridgeFoundInFinalChain === true &&
  finalChainAuditWithNutritionWrappers.hiddenWrappersOutsideKnownMigration === false &&
  Array.isArray(finalChainAuditWithNutritionWrappers.outOfScopeRemainingWrapperIds) &&
  finalChainAuditWithNutritionWrappers.outOfScopeRemainingWrapperIds.length === 0 &&
  Array.isArray(finalChainAuditWithNutritionWrappers.chain.legacyMigratedWrapperIdsInChain) &&
  finalChainAuditWithNutritionWrappers.chain.legacyMigratedWrapperIdsInChain.includes('nutrition-micros:update-wrapper'),
  {
    snapshot: finalChainAuditWithNutritionWrappers ? {
      finalWindowUpdateOwner: finalChainAuditWithNutritionWrappers.finalWindowUpdateOwner,
      hiddenWrappersOutsideKnownMigration: finalChainAuditWithNutritionWrappers.hiddenWrappersOutsideKnownMigration,
      outOfScopeRemainingWrapperIds: finalChainAuditWithNutritionWrappers.outOfScopeRemainingWrapperIds,
      legacyMigratedWrapperIdsInChain: finalChainAuditWithNutritionWrappers.chain && finalChainAuditWithNutritionWrappers.chain.legacyMigratedWrapperIdsInChain,
      registryBridgeFoundInFinalChain: finalChainAuditWithNutritionWrappers.registryBridgeFoundInFinalChain
    } : null
  });
context.update = fakeBridge;

const modules = context.VildaDeps && typeof context.VildaDeps.listModules === 'function' ? context.VildaDeps.listModules() : [];
const missingContracts = EXPECTED_CONTRACTS.filter((name) => !modules.includes(name));
addResult('VildaDeps.contracts', missingContracts.length === 0, { missingContracts });

context.vildaGetEstimatedIntakeAuditSnapshot = function () {};
context.vildaGetEstimatedIntakeCalcSeamSnapshot = function () {};
context.vildaGetEstimatedIntakeCalculationModelSnapshot = function () {};
context.vildaGetAdvancedIntakeSyncAuditSnapshot = function () {};
context.vildaIsFinitePositive = function (value) { return Number.isFinite(Number(value)) && Number(value) > 0; };
context.vildaIsFiniteNonNegative = function (value) { return String(value).trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0; };
context.vildaReadNumericInputState = function () { return { present: true, raw: '0', value: 0, finite: true, nonNegative: true, positive: false }; };
context.vildaGetMainAgeInputState = function () { return { value: 0, finite: true, hasExplicitInput: true, validNonNegative: true, isZeroAge: true }; };
context.vildaGetMainAnthroValidationSnapshot = function () { return { step: '8O-10a', readOnly: true, complete: true, acceptsZeroAge: true }; };
context.vildaGetNumericValidationAuditSnapshot = function () { return { kind: 'numeric-validation-age-zero-audit', step: '8O-10a', readOnly: true }; };
context.vildaGetPediatricBmiClassificationUnavailableLabel = function () { return 'Brak klasyfikacji pediatrycznej — brak danych referencyjnych'; };
context.vildaIsPediatricBmiCategoryUnavailable = function (category) { return String(category || '').trim() === 'Brak klasyfikacji pediatrycznej — brak danych referencyjnych'; };
context.vildaResolvePediatricBmiCategoryFromPercentile = function (percentile) { return percentile == null ? 'Brak klasyfikacji pediatrycznej — brak danych referencyjnych' : 'Prawidłowe'; };
context.vildaGetPediatricBmiClassificationAuditSnapshot = function () { return { step: '8O-10b', readOnly: true, adultFallbackRemoved: true, missingPercentileUsesAdultBmi: false }; };
context.bmiCategoryChild = function () { return 'Brak klasyfikacji pediatrycznej — brak danych referencyjnych'; };
context.bmiPercentileChild = function () { return null; };
context.VildaUpdatePrep = {
  getNumericValidationSnapshot: function () { return { step: '8O-10a', readOnly: true, acceptsZeroAge: true }; },
  getPediatricBmiClassificationSnapshot: function () { return { step: '8O-10b', readOnly: true, adultFallbackRemoved: true, missingPercentileUsesAdultBmi: false }; },
  isPediatricBmiClassificationUnavailable: context.vildaIsPediatricBmiCategoryUnavailable,
  isFinitePositive: context.vildaIsFinitePositive,
  isFiniteNonNegative: context.vildaIsFiniteNonNegative
};
context.VildaDataImportExport = { version: '1.10.3', versionInfo: function () { return { version: '1.10.3' }; } };
context.__vildaUpdateHooksBridge8O10dC = context.__vildaUpdateHooksBridge8O10dC || function vildaUpdateHooksBridge8O10dB() {};
context.__vildaUpdateHooksBridge8O10dD = context.__vildaUpdateHooksBridge8O10dC;
context.__vildaIdealWeightUIAfterUpdateHookId = 'app:ideal-weight-ui-after-update';
context.__vildaIdealWeightUIAfterUpdateHookRegistered = true;
context.__vildaIdealWeightUIAfterUpdateFallback = function () {};
context.vildaGetUpdateHooksBridgeSnapshot = function () { return { step: '8O-10d-g', readOnly: true, didCallWindowUpdate: false, didRunHooks: false, bridgeInstalled: true, migratedWrapperId: 'app:bmi50-info-after-update', migratedWrapperIds: ['app:bmi50-info-after-update', 'app:ideal-weight-ui-after-update', 'diet:recommendations-visibility-after-update', 'nutrition-norms:card-render-after-update', 'nutrition-micros:card-render-after-update'], migratedHookRegistered: true, idealWeightHookRegistered: true, dietRecommendationsHookRegistered: true, nutritionNormsHookRegistered: true, nutritionMicrosHookRegistered: true, allMigratedHooksRegistered: true }; };
const smokeContract = context.VildaDeps.checkModuleDeps('regression-smoke-suite', { record: false, silent: true, page: 'index.html' });
addResult('VildaDeps.regression-smoke-suite-contract', !!(smokeContract && smokeContract.ok), {
  missingRequired: smokeContract && smokeContract.missingRequired ? smokeContract.missingRequired.map((dep) => dep.path) : []
});
const numericContract = context.VildaDeps.checkModuleDeps('numeric-validation-age-zero', { record: false, silent: true, page: 'index.html' });
addResult('VildaDeps.numeric-validation-age-zero-contract', !!(numericContract && numericContract.ok), {
  missingRequired: numericContract && numericContract.missingRequired ? numericContract.missingRequired.map((dep) => dep.path) : []
});

const pediatricBmiContract = context.VildaDeps.checkModuleDeps('pediatric-bmi-no-adult-fallback', { record: false, silent: true, page: 'index.html' });
addResult('VildaDeps.pediatric-bmi-no-adult-fallback-contract', !!(pediatricBmiContract && pediatricBmiContract.ok), {
  missingRequired: pediatricBmiContract && pediatricBmiContract.missingRequired ? pediatricBmiContract.missingRequired.map((dep) => dep.path) : []
});

const nutritionRefreshContract = context.VildaDeps.checkModuleDeps('nutrition-norms-refresh-queue', { record: false, silent: true, page: 'index.html' });
addResult('VildaDeps.nutrition-norms-refresh-queue-contract', !!(nutritionRefreshContract && nutritionRefreshContract.ok), {
  missingRequired: nutritionRefreshContract && nutritionRefreshContract.missingRequired ? nutritionRefreshContract.missingRequired.map((dep) => dep.path) : []
});

const updateHooksContract = context.VildaDeps.checkModuleDeps('update-hooks-registry', { record: false, silent: true, page: 'index.html' });
addResult('VildaDeps.update-hooks-registry-contract', !!(updateHooksContract && updateHooksContract.ok), {
  missingRequired: updateHooksContract && updateHooksContract.missingRequired ? updateHooksContract.missingRequired.map((dep) => dep.path) : []
});
const updateHooksBridgeContract = context.VildaDeps.checkModuleDeps('update-hooks-first-wrapper-bridge', { record: false, silent: true, page: 'index.html' });
addResult('VildaDeps.update-hooks-first-wrapper-bridge-contract', !!(updateHooksBridgeContract && updateHooksBridgeContract.ok), {
  missingRequired: updateHooksBridgeContract && updateHooksBridgeContract.missingRequired ? updateHooksBridgeContract.missingRequired.map((dep) => dep.path) : []
});
const updateHooksSecondBridgeContract = context.VildaDeps.checkModuleDeps('update-hooks-second-wrapper-bridge', { record: false, silent: true, page: 'index.html' });
addResult('VildaDeps.update-hooks-second-wrapper-bridge-contract', !!(updateHooksSecondBridgeContract && updateHooksSecondBridgeContract.ok), {
  missingRequired: updateHooksSecondBridgeContract && updateHooksSecondBridgeContract.missingRequired ? updateHooksSecondBridgeContract.missingRequired.map((dep) => dep.path) : []
});
const updateHooksDietRecommendationsContract = context.VildaDeps.checkModuleDeps('update-hooks-diet-recommendations-wrapper', { record: false, silent: true, page: 'index.html' });
addResult('VildaDeps.update-hooks-diet-recommendations-wrapper-contract', !!(updateHooksDietRecommendationsContract && updateHooksDietRecommendationsContract.ok), {
  missingRequired: updateHooksDietRecommendationsContract && updateHooksDietRecommendationsContract.missingRequired ? updateHooksDietRecommendationsContract.missingRequired.map((dep) => dep.path) : []
});

const updateHooksFinalChainContract = context.VildaDeps.checkModuleDeps('update-hooks-final-chain-audit', { record: false, silent: true, page: 'index.html' });
addResult('VildaDeps.update-hooks-final-chain-audit-contract', !!(updateHooksFinalChainContract && updateHooksFinalChainContract.ok), {
  missingRequired: updateHooksFinalChainContract && updateHooksFinalChainContract.missingRequired ? updateHooksFinalChainContract.missingRequired.map((dep) => dep.path) : []
});

const updateHooksNutritionNormsContract = context.VildaDeps.checkModuleDeps('update-hooks-nutrition-norms-wrapper', { record: false, silent: true, page: 'index.html' });
addResult('VildaDeps.update-hooks-nutrition-norms-wrapper-contract', !!(updateHooksNutritionNormsContract && updateHooksNutritionNormsContract.ok), {
  missingRequired: updateHooksNutritionNormsContract && updateHooksNutritionNormsContract.missingRequired ? updateHooksNutritionNormsContract.missingRequired.map((dep) => dep.path) : []
});

const updateHooksNutritionMicrosContract = context.VildaDeps.checkModuleDeps('update-hooks-nutrition-micros-wrapper', { record: false, silent: true, page: 'index.html' });
addResult('VildaDeps.update-hooks-nutrition-micros-wrapper-contract', !!(updateHooksNutritionMicrosContract && updateHooksNutritionMicrosContract.ok), {
  missingRequired: updateHooksNutritionMicrosContract && updateHooksNutritionMicrosContract.missingRequired ? updateHooksNutritionMicrosContract.missingRequired.map((dep) => dep.path) : []
});

const centileChartHeaderContract = context.VildaDeps.checkModuleDeps('centile-chart-header-fresh-name', { record: false, silent: true, page: 'index.html' });
addResult('VildaDeps.centile-chart-header-fresh-name-contract', !!(centileChartHeaderContract && centileChartHeaderContract.ok), {
  missingRequired: centileChartHeaderContract && centileChartHeaderContract.missingRequired ? centileChartHeaderContract.missingRequired.map((dep) => dep.path) : []
});

const ghTherapyResourceAuditContract = context.VildaDeps.checkModuleDeps('gh-therapy-indexeddb-resource-audit', { record: false, silent: true, page: 'index.html' });
addResult('VildaDeps.gh-therapy-indexeddb-resource-audit-contract', !!(ghTherapyResourceAuditContract && ghTherapyResourceAuditContract.ok), {
  missingRequired: ghTherapyResourceAuditContract && ghTherapyResourceAuditContract.missingRequired ? ghTherapyResourceAuditContract.missingRequired.map((dep) => dep.path) : []
});

const fetchTimeoutCleanupContract = context.VildaDeps.checkModuleDeps('fetch-timeout-cleanup', { record: false, silent: true, page: 'index.html' });
addResult('VildaDeps.fetch-timeout-cleanup-contract', !!(fetchTimeoutCleanupContract && fetchTimeoutCleanupContract.ok), {
  missingRequired: fetchTimeoutCleanupContract && fetchTimeoutCleanupContract.missingRequired ? fetchTimeoutCleanupContract.missingRequired.map((dep) => dep.path) : []
});

const serviceWorkerFetchCacheStrategyContract = context.VildaDeps.checkModuleDeps('service-worker-fetch-cache-strategy', { record: false, silent: true, page: 'index.html' });
addResult('VildaDeps.service-worker-fetch-cache-strategy-contract', !!(serviceWorkerFetchCacheStrategyContract && serviceWorkerFetchCacheStrategyContract.ok), {
  missingRequired: serviceWorkerFetchCacheStrategyContract && serviceWorkerFetchCacheStrategyContract.missingRequired ? serviceWorkerFetchCacheStrategyContract.missingRequired.map((dep) => dep.path) : []
});

const serviceWorkerOfflineUpdateFlowSmokeContract = context.VildaDeps.checkModuleDeps('service-worker-offline-update-flow-smoke', { record: false, silent: true, page: 'index.html' });
addResult('VildaDeps.service-worker-offline-update-flow-smoke-contract', !!(serviceWorkerOfflineUpdateFlowSmokeContract && serviceWorkerOfflineUpdateFlowSmokeContract.ok), {
  missingRequired: serviceWorkerOfflineUpdateFlowSmokeContract && serviceWorkerOfflineUpdateFlowSmokeContract.missingRequired ? serviceWorkerOfflineUpdateFlowSmokeContract.missingRequired.map((dep) => dep.path) : []
});

const serviceWorkerVersionedShellCacheKeyContract = context.VildaDeps.checkModuleDeps('service-worker-versioned-shell-cache-key', { record: false, silent: true, page: 'index.html' });
addResult('VildaDeps.service-worker-versioned-shell-cache-key-contract', !!(serviceWorkerVersionedShellCacheKeyContract && serviceWorkerVersionedShellCacheKeyContract.ok), {
  missingRequired: serviceWorkerVersionedShellCacheKeyContract && serviceWorkerVersionedShellCacheKeyContract.missingRequired ? serviceWorkerVersionedShellCacheKeyContract.missingRequired.map((dep) => dep.path) : []
});

const serviceWorkerStaleCachePruningAuditContract = context.VildaDeps.checkModuleDeps('service-worker-stale-cache-pruning-audit', { record: false, silent: true, page: 'index.html' });
addResult('VildaDeps.service-worker-stale-cache-pruning-audit-contract', !!(serviceWorkerStaleCachePruningAuditContract && serviceWorkerStaleCachePruningAuditContract.ok), {
  missingRequired: serviceWorkerStaleCachePruningAuditContract && serviceWorkerStaleCachePruningAuditContract.missingRequired ? serviceWorkerStaleCachePruningAuditContract.missingRequired.map((dep) => dep.path) : []
});

const serviceWorkerRuntimeCachePruningContract = context.VildaDeps.checkModuleDeps('service-worker-runtime-cache-pruning', { record: false, silent: true, page: 'index.html' });
addResult('VildaDeps.service-worker-runtime-cache-pruning-contract', !!(serviceWorkerRuntimeCachePruningContract && serviceWorkerRuntimeCachePruningContract.ok), {
  missingRequired: serviceWorkerRuntimeCachePruningContract && serviceWorkerRuntimeCachePruningContract.missingRequired ? serviceWorkerRuntimeCachePruningContract.missingRequired.map((dep) => dep.path) : []
});

const serviceWorkerClientLifecycleAuditContract = context.VildaDeps.checkModuleDeps('service-worker-client-lifecycle-audit', { record: false, silent: true, page: 'index.html' });
addResult('VildaDeps.service-worker-client-lifecycle-audit-contract', !!(serviceWorkerClientLifecycleAuditContract && serviceWorkerClientLifecycleAuditContract.ok), {
  missingRequired: serviceWorkerClientLifecycleAuditContract && serviceWorkerClientLifecycleAuditContract.missingRequired ? serviceWorkerClientLifecycleAuditContract.missingRequired.map((dep) => dep.path) : []
});

const serviceWorkerClientUpdateUxSmokeContract = context.VildaDeps.checkModuleDeps('service-worker-client-update-ux-smoke', { record: false, silent: true, page: 'index.html' });
addResult('VildaDeps.service-worker-client-update-ux-smoke-contract', !!(serviceWorkerClientUpdateUxSmokeContract && serviceWorkerClientUpdateUxSmokeContract.ok), {
  missingRequired: serviceWorkerClientUpdateUxSmokeContract && serviceWorkerClientUpdateUxSmokeContract.missingRequired ? serviceWorkerClientUpdateUxSmokeContract.missingRequired.map((dep) => dep.path) : []
});


const fakeNameInputs = {
  advName: { value: 'Nowe Imię z Zaawansowanych', disabled: false },
  basicGrowthName: { value: '', disabled: false },
  name: { value: 'Nowe Imię z Danych', disabled: false }
};
const fakeNameDoc = { getElementById: (id) => fakeNameInputs[id] || null };
context.VildaCentileChartHeader.markNameInputEdit('advName', fakeNameInputs.advName.value);
const centileAdvState = context.VildaCentileChartHeader.buildHeaderNameState({
  document: fakeNameDoc,
  effectiveDataState: { name: 'Stare Imię', sourceModule: 'advancedGrowth' },
  advancedGrowthData: { name: 'Stare Imię', sourceModule: 'advancedGrowth' }
});
fakeNameInputs.advName.value = 'Stare Imię';
fakeNameInputs.name.value = 'Nowe Imię z Danych';
context.VildaCentileChartHeader.markNameInputEdit('name', fakeNameInputs.name.value);
const centileMainState = context.VildaCentileChartHeader.buildHeaderNameState({
  document: fakeNameDoc,
  effectiveDataState: { name: 'Stare Imię', sourceModule: 'advancedGrowth' },
  advancedGrowthData: { name: 'Stare Imię', sourceModule: 'advancedGrowth' }
});
const centileLabel = context.VildaCentileChartHeader.buildNameLabel({
  document: fakeNameDoc,
  effectiveDataState: { name: 'Stare Imię', sourceModule: 'advancedGrowth' },
  advancedGrowthData: { name: 'Stare Imię', sourceModule: 'advancedGrowth' }
});
const centileSnapshot = context.VildaCentileChartHeader.getSnapshot({
  document: fakeNameDoc,
  effectiveDataState: { name: 'Stare Imię', sourceModule: 'advancedGrowth' },
  advancedGrowthData: { name: 'Stare Imię', sourceModule: 'advancedGrowth' }
});
addResult('centile-chart-header-fresh-name-dynamic',
  centileAdvState.name === 'Nowe Imię z Zaawansowanych' &&
  centileAdvState.staleAdvancedGrowthNameDetected === true &&
  centileMainState.name === 'Nowe Imię z Danych' &&
  centileMainState.nameSource === 'name-last-input' &&
  centileLabel === 'Imię i nazwisko: Nowe Imię z Danych' &&
  centileSnapshot.readOnly === true &&
  centileSnapshot.executedPdfGeneration === false &&
  centileSnapshot.renderedDom === false,
  {
    advancedState: { name: centileAdvState.name, nameSource: centileAdvState.nameSource, staleAdvancedGrowthNameDetected: centileAdvState.staleAdvancedGrowthNameDetected },
    mainState: { name: centileMainState.name, nameSource: centileMainState.nameSource, usedLastEditedInput: centileMainState.usedLastEditedInput },
    label: centileLabel,
    snapshot: { readOnly: centileSnapshot.readOnly, executedPdfGeneration: centileSnapshot.executedPdfGeneration, renderedDom: centileSnapshot.renderedDom }
  });

const api = context.VildaEstimatedIntake;
const deps = {
  energyIsNumeric: (value) => Number.isFinite(Number(value)),
  energyBuildIntakeObservedState: (args) => ({
    teeRawKcal: Math.round(900 + Number(args.weightKg || 0) * 20),
    teeBaselineKcal: Math.round(900 + Number(args.weightKg || 0) * 20),
    palUsed: args.palInput,
    isInfantUnder6: false,
    isInfantButte: false,
    modeBadge: 'node-smoke'
  }),
  expectedGainMedianHeightAware: () => 1.1,
  ENERGY_ADULT_START_AGE: 19,
  KCAL_PER_KG: 7700
};
const common = { sex: 'M', height: 120, pal: 1.4, basics: { sex: 'M', height: 120 } };
const empty = api.buildEstimatedIntakeCalculationModel(Object.assign({}, common, { rows: [] }), {}, deps);
const single = api.buildEstimatedIntakeCalculationModel(Object.assign({}, common, { rows: [{ ageYears: 6, ageMonths: 72, months: 72, weight: 23, height: 120 }] }), {}, deps);
const multi = api.buildEstimatedIntakeCalculationModel(Object.assign({}, common, { rows: [{ ageYears: 6, ageMonths: 72, months: 72, weight: 23, height: 120 }, { ageYears: 6.5, ageMonths: 78, months: 78, weight: 25, height: 123 }] }), {}, deps);
addResult('estimated-intake-pure-model',
  empty.branch === 'empty-rows-message' &&
  single.branch === 'single-row-maintenance' &&
  multi.branch === 'multi-row-interval-render' &&
  [empty, single, multi].every((model) => model.pureModel === true && model.rendersDom === false && model.commitsWindowState === false) &&
  Array.isArray(multi.intervals) && multi.intervals.length === 1,
  { empty: empty.branch, single: single.branch, multi: multi.branch, intervals: multi.intervals.length }
);


function runNutritionNormsRefreshQueueDynamicSmoke() {
  const timers = [];
  const listeners = Object.create(null);
  let refreshRuns = 0;
  const selectedFoodRow = {
    querySelector(selector) {
      if (selector === 'select') return { value: 'egg' };
      if (selector === 'input') return { value: '1' };
      return null;
    }
  };
  const queueContext = {
    console,
    Date,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    RegExp,
    JSON,
    Error,
    isFinite,
    parseFloat,
    document: { querySelectorAll: function () { return [selectedFoodRow]; } },
    addEventListener: function (name, fn) {
      listeners[name] = listeners[name] || [];
      listeners[name].push(fn);
    },
    setTimeout: function (fn) { timers.push(fn); return timers.length; },
    clearTimeout: function () {}
  };
  queueContext.globalThis = queueContext;
  queueContext.window = queueContext;
  vm.createContext(queueContext);
  runScriptInContext('vilda_food_summary.js', queueContext);
  const eventHandlers = listeners.nutritionNormsModelUpdated || [];
  queueContext.macroPracticeRefreshFoodCardOnly = function () {
    refreshRuns += 1;
    if (refreshRuns === 1) {
      eventHandlers.forEach((fn) => fn({
        detail: {
          energy: { palMode: 'queued', usedPal: 1.5, range: [1300, 1500] },
          planningReference: { percent: { protein: 16, fat: 31, carbs: 53 } },
          fat: { percentRange: [26, 36] }
        }
      }));
    }
  };
  eventHandlers.forEach((fn) => fn({
    detail: {
      energy: { palMode: 'initial', usedPal: 1.4, range: [1200, 1400] },
      planningReference: { percent: { protein: 15, fat: 30, carbs: 55 } },
      fat: { percentRange: [25, 35] }
    }
  }));
  let guard = 0;
  while (timers.length && guard < 10) {
    guard += 1;
    const fn = timers.shift();
    fn();
  }
  const snapshot = queueContext.vildaGetNutritionNormsRefreshQueueSnapshot();
  return {
    ok: refreshRuns === 2 && snapshot && snapshot.state && snapshot.state.queuedEvents === 1 && snapshot.state.refreshRuns === 2 && snapshot.state.pending === false,
    refreshRuns,
    snapshot: snapshot && snapshot.state ? {
      receivedEvents: snapshot.state.receivedEvents,
      queuedEvents: snapshot.state.queuedEvents,
      refreshRuns: snapshot.state.refreshRuns,
      pending: snapshot.state.pending,
      lastExecutedSignature: snapshot.state.lastExecutedSignature
    } : null
  };
}
const nutritionNormsQueueDynamic = runNutritionNormsRefreshQueueDynamicSmoke();
addResult('nutrition-norms-refresh-queue-dynamic', nutritionNormsQueueDynamic.ok, nutritionNormsQueueDynamic);

const serviceWorkerOfflineUpdateFlowSmokeResult = JSON.parse(childProcess.execFileSync(process.execPath, [path.join(ROOT, 'tools/service_worker_offline_update_flow_smoke.js')], { encoding: 'utf8' }));
addResult('service-worker-offline-update-flow-smoke-dynamic', !!(serviceWorkerOfflineUpdateFlowSmokeResult && serviceWorkerOfflineUpdateFlowSmokeResult.ok === true && serviceWorkerOfflineUpdateFlowSmokeResult.failedCount === 0 && serviceWorkerOfflineUpdateFlowSmokeResult.total >= 17 && serviceWorkerOfflineUpdateFlowSmokeResult.swVersion === '0.9.406'), {
  ok: serviceWorkerOfflineUpdateFlowSmokeResult && serviceWorkerOfflineUpdateFlowSmokeResult.ok,
  failedCount: serviceWorkerOfflineUpdateFlowSmokeResult && serviceWorkerOfflineUpdateFlowSmokeResult.failedCount,
  total: serviceWorkerOfflineUpdateFlowSmokeResult && serviceWorkerOfflineUpdateFlowSmokeResult.total,
  swVersion: serviceWorkerOfflineUpdateFlowSmokeResult && serviceWorkerOfflineUpdateFlowSmokeResult.swVersion,
  failed: serviceWorkerOfflineUpdateFlowSmokeResult && serviceWorkerOfflineUpdateFlowSmokeResult.failed
});

const manifest = context.VildaSmokeTests.getManifest();
addResult('smoke-suite-manifest', Array.isArray(manifest) && manifest.length >= 15, { count: Array.isArray(manifest) ? manifest.length : null });

const serviceWorkerClientUpdateUxSmokeResult = runChildJson(path.join(ROOT, 'tools', 'service_worker_client_update_ux_smoke.js'));
addResult('service-worker-client-update-ux-smoke-dynamic', !!(serviceWorkerClientUpdateUxSmokeResult && serviceWorkerClientUpdateUxSmokeResult.ok === true && serviceWorkerClientUpdateUxSmokeResult.failedCount === 0 && serviceWorkerClientUpdateUxSmokeResult.total >= 8 && serviceWorkerClientUpdateUxSmokeResult.step === '8O-11k'), {
  ok: serviceWorkerClientUpdateUxSmokeResult ? serviceWorkerClientUpdateUxSmokeResult.ok : null,
  failedCount: serviceWorkerClientUpdateUxSmokeResult ? serviceWorkerClientUpdateUxSmokeResult.failedCount : null,
  total: serviceWorkerClientUpdateUxSmokeResult ? serviceWorkerClientUpdateUxSmokeResult.total : null,
  step: serviceWorkerClientUpdateUxSmokeResult ? serviceWorkerClientUpdateUxSmokeResult.step : null,
  mockedDomOnly: serviceWorkerClientUpdateUxSmokeResult ? serviceWorkerClientUpdateUxSmokeResult.mockedDomOnly : null
});


const failed = results.filter((r) => !r.ok);
const summary = {
  ok: failed.length === 0,
  failedCount: failed.length,
  total: results.length,
  failed,
  results
};
console.log(JSON.stringify(summary, null, 2));
process.exit(summary.ok ? 0 : 1);
