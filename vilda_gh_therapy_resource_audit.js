/*
 * Vilda GH Therapy Resource Audit v1.13.17
 *
 * Krok 8O-11l: read-only audyt miejsc użycia IndexedDB, BroadcastChannel,
 * MutationObserver, aplikacyjnych fetch/async resource cleanup, strategii
 * fetch/cache/offline Service Workera, smoke E2E offline/update-flow, spójnego
 * cache key wersjonowanych zasobów shell, scope czyszczenia starych cache
 * wdrożonego TTL/max-entry pruning runtime cache client-side lifecycle rejestracji/update-flow Service Workera oraz smoke UX banera aktualizacji Service Workera oraz audyt manifestu PWA/start_url/scope/ikon i ich cache oraz aktualny cache-bust 8Q-4.
 * Moduł audytowy nadal nie otwiera IndexedDB, nie zamyka połączeń,
 * nie wysyła komunikatów BroadcastChannel, nie pobiera zasobów, nie rejestruje
 * Service Workera, nie dotyka Cache API i nie zmienia danych terapii.
 * Jest statyczną mapą stanu cleanupu.
 */
(function (global) {
  'use strict';

  if (!global) return;
  if (global.VildaGHTherapyResourceAudit && global.VildaGHTherapyResourceAudit.__vildaGhTherapyResourceAuditModule) {
    return;
  }

  const VERSION = '1.13.17';
  const STEP = '8O-11l';
  const DB_NAME = 'ghTherapyDB';
  const DB_VERSION = 1;
  const STORE_NAME = 'ghTherapyPoints';
  const CHANNEL_NAME = 'gh-therapy-sync';
  const MUTATION_OBSERVER_TARGET_IDS = Object.freeze(['modulesWrapper', 'doctorBottom', 'advancedGrowthSection', 'document.body']);
  const FETCH_TIMEOUT_HELPERS = Object.freeze(['vildaFetchWithTimeout', 'vildaFetchJsonWithTimeout', 'vildaFetchArrayBufferWithTimeout', 'vildaFetchBlobWithTimeout']);
  const FETCH_TIMEOUT_DEFAULT_MS = 10000;
  const SERVICE_WORKER_VERSION = '0.9.428';
  const SERVICE_WORKER_CACHE_PREFIX = 'pwa-kalorii';
  const SERVICE_WORKER_TIMEOUT_POLICY = 'intentional-timeout-exempt-to-preserve-cache-first-background-refresh';
  const SERVICE_WORKER_E2E_SMOKE_TOOL = 'tools/service_worker_offline_update_flow_smoke.js';
  const SERVICE_WORKER_CLIENT_UPDATE_UX_SMOKE_TOOL = 'tools/service_worker_client_update_ux_smoke.js';
  const PWA_MANIFEST_ICON_CACHE_SMOKE_TOOL = 'tools/pwa_manifest_icon_cache_smoke.js';
  const SERVICE_WORKER_RUNTIME_CACHE_MAX_ENTRIES = 96;
  const SERVICE_WORKER_RUNTIME_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;


  const DATABASE_LOCATIONS = Object.freeze([
    Object.freeze({
      id: 'app:openGHTherapyDB',
      file: 'app.js',
      lineHint: 80,
      functionName: 'openGHTherapyDB',
      role: 'advanced-growth-import-db-open',
      opensDatabase: true,
      directIndexedDbOpen: true,
      schemaVersion: DB_VERSION,
      createsStoreOnUpgrade: true,
      objectStoreKeyPath: 'id',
      returnsOpenDatabase: true,
      transactionMode: null,
      closesDatabase: false,
      closeCoverage: 'caller-dependent',
      knownCallersCloseDatabase: true,
      cleanupAppliedStep: '8O-11a-c',
      hasOnVersionChange: true,
      onVersionChangeCoverage: 'direct-handler',
      onVersionChangeHandler: 'attachGHTherapyDBVersionChangeHandler',
      onVersionChangeCloseHelper: 'closeGHTherapyDBConnection',
      changesTherapyData: false,
      cleanupNote: 'Funkcja zwraca otwartą bazę; znani wywołujący w app.js zamykają ją w finally, a openGHTherapyDB() podłącza db.onversionchange zamykające połączenie przy upgrade bazy w innej karcie.'
    }),
    Object.freeze({
      id: 'app:getTherapyPointsFromDB',
      file: 'app.js',
      lineHint: 111,
      functionName: 'getTherapyPointsFromDB',
      role: 'advanced-growth-import-db-read',
      opensDatabase: false,
      usesOpenFunction: 'app:openGHTherapyDB',
      operation: 'getAll',
      transactionMode: 'readonly',
      returnsOpenDatabase: false,
      closesDatabase: true,
      closeCoverage: 'tx-complete-finally',
      closeHelper: 'closeGHTherapyDBConnection',
      cleanupAppliedStep: '8O-11a-b',
      hasOnVersionChange: false,
      changesTherapyData: false,
      cleanupNote: 'Odczyt getAll() oczekuje na zakończenie transakcji i domyka IDBDatabase w finally.'
    }),
    Object.freeze({
      id: 'app:clearTherapyPointsInDB',
      file: 'app.js',
      lineHint: 135,
      functionName: 'clearTherapyPointsInDB',
      role: 'data-clear-db-clear',
      opensDatabase: false,
      usesOpenFunction: 'app:openGHTherapyDB',
      operation: 'clear',
      transactionMode: 'readwrite',
      returnsOpenDatabase: false,
      closesDatabase: true,
      closeCoverage: 'tx-complete-finally',
      closeHelper: 'closeGHTherapyDBConnection',
      cleanupAppliedStep: '8O-11a-b',
      hasOnVersionChange: false,
      changesTherapyData: true,
      cleanupNote: 'Czyszczenie oczekuje na tx.oncomplete/tx.onerror/tx.onabort i domyka IDBDatabase w finally również po błędzie.'
    }),
    Object.freeze({
      id: 'gh-monitor:openTherapyDB',
      file: 'gh_therapy_monitor.js',
      lineHint: 166,
      functionName: 'openTherapyDB',
      role: 'gh-monitor-db-open',
      opensDatabase: true,
      directIndexedDbOpen: true,
      schemaVersion: DB_VERSION,
      createsStoreOnUpgrade: true,
      objectStoreKeyPath: 'id',
      returnsOpenDatabase: true,
      transactionMode: null,
      closesDatabase: false,
      closeCoverage: 'caller-dependent',
      knownCallersCloseDatabase: true,
      cleanupAppliedStep: '8O-11a-c',
      hasOnVersionChange: true,
      onVersionChangeCoverage: 'direct-handler',
      onVersionChangeHandler: 'attachTherapyDBVersionChangeHandler',
      onVersionChangeCloseHelper: 'closeTherapyDBConnection',
      changesTherapyData: false,
      cleanupNote: 'Funkcja zwraca otwartą bazę; saveTherapyPointsToDB() domyka ją w finally, a openTherapyDB() podłącza db.onversionchange zamykające połączenie przy upgrade bazy w innej karcie.'
    }),
    Object.freeze({
      id: 'gh-monitor:saveTherapyPointsToDB',
      file: 'gh_therapy_monitor.js',
      lineHint: 206,
      functionName: 'saveTherapyPointsToDB',
      role: 'gh-monitor-db-write',
      opensDatabase: false,
      usesOpenFunction: 'gh-monitor:openTherapyDB',
      operation: 'clear-and-put-all',
      transactionMode: 'readwrite',
      returnsOpenDatabase: false,
      closesDatabase: true,
      closeCoverage: 'tx-complete-finally',
      closeHelper: 'closeTherapyDBConnection',
      cleanupAppliedStep: '8O-11a-b',
      hasOnVersionChange: false,
      changesTherapyData: true,
      cleanupNote: 'Zapis punktów terapii GH/IGF oczekuje na zakończenie transakcji i domyka IDBDatabase w finally.'
    }),
    Object.freeze({
      id: 'data-io:resetAuxiliaryClinicalModulesAfterClear',
      file: 'vilda_data_import_export.js',
      lineHint: 2431,
      functionName: 'resetAuxiliaryClinicalModulesAfterClear',
      role: 'data-clear-gh-therapy-adapter',
      opensDatabase: false,
      directIndexedDbOpen: false,
      usesOpenFunction: 'app:clearTherapyPointsInDB via options.clearTherapyPointsInDB',
      operation: 'adapter-clear',
      transactionMode: null,
      returnsOpenDatabase: false,
      closesDatabase: null,
      closeCoverage: 'delegated',
      cleanupAppliedStep: '8O-11a-b',
      hasOnVersionChange: false,
      changesTherapyData: true,
      cleanupNote: 'Moduł import/export nie otwiera bazy bezpośrednio; deleguje czyszczenie do adaptera z app.js, który domyka DB.'
    })
  ]);

  const BROADCAST_CHANNEL_LOCATIONS = Object.freeze([
    Object.freeze({
      id: 'app:ghTherapyBroadcastChannel',
      file: 'app.js',
      lineHint: 224,
      variableName: 'ghTherapyBroadcastChannel',
      channelName: CHANNEL_NAME,
      createsChannel: true,
      listensForMessages: true,
      postsMessages: false,
      messageTypes: [],
      closeHandler: true,
      closeHelper: 'closeGHTherapyBroadcastChannel',
      lifecycleHandler: 'registerGHTherapyBroadcastChannelLifecycleCleanup',
      closedStateFlag: 'ghTherapyBroadcastChannelClosed',
      pagehideCloseHandler: true,
      beforeunloadCloseHandler: true,
      removesMessageListenerOnClose: true,
      cleanupAppliedStep: '8O-11b',
      cleanupNote: 'Kanał nasłuchuje zmian z monitora terapii i jest domykany idempotentnie przez close() na pagehide/beforeunload.'
    }),
    Object.freeze({
      id: 'gh-monitor:ghTherapyBroadcastChannel',
      file: 'gh_therapy_monitor.js',
      lineHint: 255,
      variableName: 'ghTherapyBroadcastChannel',
      channelName: CHANNEL_NAME,
      createsChannel: true,
      listensForMessages: false,
      postsMessages: true,
      messageTypes: ['update', 'clear'],
      closeHandler: true,
      closeHelper: 'closeGHTherapyBroadcastChannel',
      postHelper: 'postGHTherapyBroadcastMessage',
      lifecycleHandler: 'registerGHTherapyBroadcastChannelLifecycleCleanup',
      closedStateFlag: 'ghTherapyBroadcastChannelClosed',
      pagehideCloseHandler: true,
      beforeunloadCloseHandler: true,
      guardedPostAfterClose: true,
      cleanupAppliedStep: '8O-11b',
      cleanupNote: 'Monitor wysyła te same payloady update/clear przez helper z guardem i domyka kanał przez close() na pagehide/beforeunload.'
    }),
    Object.freeze({
      id: 'data-io:gh-monitor-broadcast-clear',
      file: 'vilda_data_import_export.js',
      lineHint: 2438,
      variableName: 'injected getGhTherapyBroadcastChannel()/ghTherapyBroadcastChannel',
      channelName: CHANNEL_NAME,
      createsChannel: false,
      listensForMessages: false,
      postsMessages: true,
      messageTypes: ['clear'],
      closeHandler: 'owner-dependent',
      pagehideCloseHandler: 'owner-covered',
      beforeunloadCloseHandler: 'owner-covered',
      cleanupAppliedStep: '8O-11b',
      cleanupNote: 'Import/export korzysta z przekazanego kanału; po kroku 8O-11b adapter zwraca kanał tylko, gdy właściciel nie zamknął go w lifecycle cleanup.'
    })
  ]);

  const MUTATION_OBSERVER_LOCATIONS = Object.freeze([
    Object.freeze({
      id: 'gh-monitor:ghTherapyMonitorDomObserver',
      file: 'gh_therapy_monitor.js',
      lineHint: 1978,
      observerType: 'MutationObserver',
      observerVariable: 'ghTherapyMonitorDomObserver',
      rootSelectorHelper: 'getGHTherapyMonitorMutationObserverRoot',
      preferredRootIds: MUTATION_OBSERVER_TARGET_IDS.slice(0, 3),
      hasBodyFallback: true,
      bodyFallbackId: 'document.body',
      observesDocumentBodyUnconditionally: false,
      observesPreferredContainerFirst: true,
      primaryExpectedRoot: 'modulesWrapper',
      observesChildList: true,
      observesSubtree: true,
      watchesForSelector: '#ghIgfTherapyCard',
      disconnectHelper: 'disconnectGHTherapyMonitorDomObserver',
      lifecycleHandler: 'registerGHTherapyMonitorMutationObserverLifecycleCleanup',
      pagehideDisconnectHandler: true,
      beforeunloadDisconnectHandler: true,
      disconnectsAfterTargetFound: true,
      duplicateObserverGuard: true,
      cleanupAppliedStep: '8O-11c',
      changesTherapyData: false,
      changesRenderingSemantics: false,
      cleanupNote: 'Observer monitora GH/IGF nie nasłuchuje już bezwarunkowo całego document.body: preferuje #modulesWrapper/#doctorBottom/#advancedGrowthSection, ma fallback body, disconnect po wykryciu #ghIgfTherapyCard oraz cleanup na pagehide/beforeunload.'
    })
  ]);



  const FETCH_RESOURCE_LOCATIONS = Object.freeze([
    Object.freeze({
      id: 'app:mainBmiMetabolismPdfLogoBlob',
      file: 'app.js',
      lineHint: 7999,
      functionName: 'toDataURL',
      resourceType: 'blob',
      fetchUse: 'logo-pdf-asset',
      helper: 'vildaFetchBlobWithTimeout',
      timeoutMs: 8000,
      timeoutApplied: true,
      abortControllerHelper: true,
      clearsTimeout: true,
      distinguishesTimeout: true,
      distinguishesHttpError: true,
      distinguishesNetworkError: true,
      distinguishesJsonParseError: false,
      fallbackBehavior: 'empty-logo-on-error',
      changesClinicalData: false,
      changesTherapyData: false,
      cleanupAppliedStep: '8O-11d',
      cleanupNote: 'Pobranie logo do PDF używa helpera blob z timeoutem; istniejący catch nadal pomija logo przy błędzie bez wpływu na obliczenia.'
    }),
    Object.freeze({
      id: 'nutrition-micros:fetchJsonCandidates',
      file: 'nutrition_micros.js',
      lineHint: 173,
      functionName: 'fetchJsonCandidates',
      resourceType: 'json',
      fetchUse: 'micronorms-resource-loader',
      helper: 'vildaFetchJsonWithTimeout',
      timeoutMs: 8000,
      timeoutApplied: true,
      abortControllerHelper: true,
      clearsTimeout: true,
      distinguishesTimeout: true,
      distinguishesHttpError: true,
      distinguishesNetworkError: true,
      distinguishesJsonParseError: true,
      fallbackBehavior: 'try-next-candidate-then-embedded-fallback',
      changesClinicalData: false,
      changesTherapyData: false,
      cleanupAppliedStep: '8O-11d',
      cleanupNote: 'Loader mikroelementów korzysta ze wspólnego JSON helpera z timeoutem; istniejący fallback embedded pozostaje zachowany.'
    }),
    Object.freeze({
      id: 'macro-practice:macroPracticeFetchJsonCandidates',
      file: 'vilda_macro_practice.js',
      lineHint: 141,
      functionName: 'macroPracticeFetchJsonCandidates',
      resourceType: 'json',
      fetchUse: 'macro-practice-resource-loader',
      helper: 'vildaFetchJsonWithTimeout',
      timeoutMs: 8000,
      timeoutApplied: true,
      abortControllerHelper: true,
      clearsTimeout: true,
      distinguishesTimeout: true,
      distinguishesHttpError: true,
      distinguishesNetworkError: true,
      distinguishesJsonParseError: true,
      fallbackBehavior: 'try-next-candidate-then-vilda-food-data-fallback',
      changesClinicalData: false,
      changesTherapyData: false,
      cleanupAppliedStep: '8O-11d',
      cleanupNote: 'Loader makro-praktyki korzysta ze wspólnego JSON helpera z timeoutem; fallback z VildaFoodData pozostaje zachowany.'
    }),
    Object.freeze({
      id: 'clcr:normsXlsxArrayBuffer',
      file: 'kalkulator-klirens.html',
      lineHint: 2864,
      functionName: 'clcr-norms-xlsx-loader',
      resourceType: 'arrayBuffer',
      fetchUse: 'clcr-norms-xlsx-loader',
      helper: 'vildaFetchArrayBufferWithTimeout',
      timeoutMs: 10000,
      timeoutApplied: true,
      abortControllerHelper: true,
      clearsTimeout: true,
      distinguishesTimeout: true,
      distinguishesHttpError: true,
      distinguishesNetworkError: true,
      distinguishesJsonParseError: false,
      fallbackBehavior: 'warn-and-continue-without-xlsx-normy',
      changesClinicalData: false,
      changesTherapyData: false,
      cleanupAppliedStep: '8O-11d',
      cleanupNote: 'Ładowanie arkusza klirensu ma timeout i zachowuje dotychczasowy catch, który pozwala kalkulatorowi działać dalej.'
    }),
    Object.freeze({
      id: 'clcr:aiInterpretationJson',
      file: 'kalkulator-klirens.html',
      lineHint: 4848,
      functionName: 'aiInterpretationButtonHandler',
      resourceType: 'json',
      fetchUse: 'optional-ai-interpretation',
      helper: 'vildaFetchJsonWithTimeout',
      timeoutMs: 20000,
      timeoutApplied: true,
      abortControllerHelper: true,
      clearsTimeout: true,
      distinguishesTimeout: true,
      distinguishesHttpError: true,
      distinguishesNetworkError: true,
      distinguishesJsonParseError: true,
      fallbackBehavior: 'existing-alert-on-error',
      changesClinicalData: false,
      changesTherapyData: false,
      cleanupAppliedStep: '8O-11d',
      cleanupNote: 'Opcjonalne zapytanie AI używa JSON helpera z timeoutem; przy braku klucza API istniejąca ścieżka copy-to-clipboard nadal kończy działanie przed fetch.'
    }),
    Object.freeze({
      id: 'service-worker:updateShellFromNetwork',
      file: 'service-worker-kalorii.js',
      lineHint: 397,
      functionName: 'updateShellFromNetwork',
      resourceType: 'request',
      fetchUse: 'service-worker-shell-cache-strategy',
      timeoutApplied: false,
      timeoutExempt: true,
      timeoutExemptionAudited: true,
      timeoutPolicy: SERVICE_WORKER_TIMEOUT_POLICY,
      cacheStrategyAudited: true,
      cacheStrategyPreserved: true,
      preservesCacheFirstBackgroundRefresh: true,
      preservesNavigationRedirectSafety: true,
      networkErrorHandledByExistingCacheFallback: true,
      fallbackBehavior: 'cached shell response / document fallback / Response.error unchanged',
      changesCacheSemantics: false,
      changesOfflineSemantics: false,
      changesClinicalData: false,
      changesTherapyData: false,
      cleanupAppliedStep: '8O-11e',
      cleanupNote: 'Fetch Service Workera pozostaje celowo bez AbortController timeoutu; 8O-11e audytuje cache-first/background refresh, redirect safety i fallbacki bez zmiany semantyki offline.'
    }),
    Object.freeze({
      id: 'service-worker:updateRuntimeFromNetwork',
      file: 'service-worker-kalorii.js',
      lineHint: 422,
      functionName: 'updateRuntimeFromNetwork',
      resourceType: 'request',
      fetchUse: 'service-worker-runtime-cache-strategy',
      timeoutApplied: false,
      timeoutExempt: true,
      timeoutExemptionAudited: true,
      timeoutPolicy: SERVICE_WORKER_TIMEOUT_POLICY,
      cacheStrategyAudited: true,
      cacheStrategyPreserved: true,
      preservesCacheFirstBackgroundRefresh: true,
      networkErrorHandledByExistingCacheFallback: true,
      fallbackBehavior: 'cached runtime response / Response.error unchanged',
      changesCacheSemantics: false,
      changesOfflineSemantics: false,
      changesClinicalData: false,
      changesTherapyData: false,
      cleanupAppliedStep: '8O-11e',
      cleanupNote: 'Runtime fetch Service Workera objęto audytem strategii cache; timeout pozostaje wyłączony, żeby nie skracać istniejącej ścieżki network-first-on-cache-miss.'
    }),
    Object.freeze({
      id: 'service-worker:fetchAndStorePrecacheUrl',
      file: 'service-worker-kalorii.js',
      lineHint: 434,
      functionName: 'fetchAndStorePrecacheUrl',
      resourceType: 'request',
      fetchUse: 'service-worker-precache-install',
      timeoutApplied: false,
      timeoutExempt: true,
      timeoutExemptionAudited: true,
      timeoutPolicy: SERVICE_WORKER_TIMEOUT_POLICY,
      cacheStrategyAudited: true,
      cacheStrategyPreserved: true,
      preservesRequiredInstallFailure: true,
      preservesOptionalBestEffortCatch: true,
      preservesNavigationRedirectSafety: true,
      fallbackBehavior: 'required core rejects install; optional assets remain best-effort unchanged',
      changesCacheSemantics: false,
      changesOfflineSemantics: false,
      changesClinicalData: false,
      changesTherapyData: false,
      cleanupAppliedStep: '8O-11e',
      versionedShellCacheKeyAudited: true,
      versionedShellCacheKeyFixed: true,
      cleanupNote: 'Precache fetch objęto audytem; brak timeoutu zachowuje dotychczasowe kryteria instalacji nowego Service Workera, a od 8O-11g wersjonowane zasoby shell są zapisywane pod cache key pathname+search.'
    })
  ]);



  const SERVICE_WORKER_CACHE_STRATEGY_LOCATIONS = Object.freeze([
    Object.freeze({
      id: 'service-worker:install-precache-required-and-optional',
      file: 'service-worker-kalorii.js',
      lineHint: 434,
      eventName: 'install',
      functionName: 'installShell/fetchAndStorePrecacheUrl',
      strategyType: 'required-core-precache-optional-sequential-precache',
      requestClass: 'precache',
      cacheName: 'SHELL_CACHE',
      networkFetch: true,
      readsCache: false,
      writesCache: true,
      cacheKeyPolicy: 'document-normalization-or-pathname-plus-search-for-versioned-shell-assets',
      cacheKeyPolicyCovered: true,
      versionedAssetCacheKeyPolicyCovered: true,
      precacheCacheKeyUsesSearch: true,
      requiredInstallFailureBlocksActivation: true,
      optionalInstallFailureSkips: true,
      fallbackFromCache: false,
      backgroundRefresh: false,
      expectedBackgroundRefresh: false,
      usesEventWaitUntil: true,
      redirectSafety: true,
      timeoutPolicy: SERVICE_WORKER_TIMEOUT_POLICY,
      timeoutApplied: false,
      timeoutExempt: true,
      timeoutExemptionAudited: true,
      serviceWorkerAuditApplied: true,
      changesCacheSemantics: false,
      changesOfflineFallbacks: false,
      auditAppliedStep: '8O-11e'
    }),
    Object.freeze({
      id: 'service-worker:navigation-cache-first-background-refresh',
      file: 'service-worker-kalorii.js',
      lineHint: 516,
      eventName: 'fetch',
      functionName: 'fetch:navigation/updateShellFromNetwork',
      strategyType: 'cache-first-background-refresh',
      requestClass: 'navigation',
      cacheName: 'SHELL_CACHE',
      networkFetch: true,
      readsCache: true,
      writesCache: true,
      cacheKeyPolicy: 'normalizeNavigationPath-to-document-path',
      cacheKeyPolicyCovered: true,
      fallbackFromCache: true,
      backgroundRefresh: true,
      expectedBackgroundRefresh: true,
      usesEventWaitUntil: true,
      redirectSafety: true,
      fallbackOrder: ['exact-shell-cache', 'network', 'normalized-document-cache', 'root-document-cache', 'Response.error'],
      timeoutPolicy: SERVICE_WORKER_TIMEOUT_POLICY,
      timeoutApplied: false,
      timeoutExempt: true,
      timeoutExemptionAudited: true,
      serviceWorkerAuditApplied: true,
      changesCacheSemantics: false,
      changesOfflineFallbacks: false,
      auditAppliedStep: '8O-11e'
    }),
    Object.freeze({
      id: 'service-worker:shell-asset-cache-first-background-refresh',
      file: 'service-worker-kalorii.js',
      lineHint: 546,
      eventName: 'fetch',
      functionName: 'fetch:shell-asset/updateShellFromNetwork',
      strategyType: 'cache-first-background-refresh',
      requestClass: 'versioned-shell-asset',
      cacheName: 'SHELL_CACHE with RUNTIME fallback',
      networkFetch: true,
      readsCache: true,
      writesCache: true,
      cacheKeyPolicy: 'pathname-plus-search-for-versioned-assets',
      cacheKeyPolicyCovered: true,
      versionedAssetCacheKeyPolicyCovered: true,
      fetchCacheKeyUsesSearch: true,
      fallbackFromCache: true,
      backgroundRefresh: true,
      expectedBackgroundRefresh: true,
      usesEventWaitUntil: true,
      redirectSafety: true,
      fallbackOrder: ['shell-cache', 'runtime-cache', 'network', 'Response.error'],
      timeoutPolicy: SERVICE_WORKER_TIMEOUT_POLICY,
      timeoutApplied: false,
      timeoutExempt: true,
      timeoutExemptionAudited: true,
      serviceWorkerAuditApplied: true,
      changesCacheSemantics: false,
      changesOfflineFallbacks: false,
      auditAppliedStep: '8O-11e'
    }),
    Object.freeze({
      id: 'service-worker:runtime-cache-first-background-refresh',
      file: 'service-worker-kalorii.js',
      lineHint: 568,
      eventName: 'fetch',
      functionName: 'fetch:runtime/updateRuntimeFromNetwork',
      strategyType: 'cache-first-background-refresh',
      requestClass: 'runtime-get-resource',
      cacheName: 'RUNTIME_CACHE',
      networkFetch: true,
      readsCache: true,
      writesCache: true,
      cacheKeyPolicy: 'request-key-with-same-origin-ignoreSearch-fallback',
      cacheKeyPolicyCovered: true,
      fallbackFromCache: true,
      backgroundRefresh: true,
      expectedBackgroundRefresh: true,
      usesEventWaitUntil: true,
      redirectSafety: false,
      fallbackOrder: ['runtime-cache', 'network', 'Response.error'],
      timeoutPolicy: SERVICE_WORKER_TIMEOUT_POLICY,
      timeoutApplied: false,
      timeoutExempt: true,
      timeoutExemptionAudited: true,
      serviceWorkerAuditApplied: true,
      changesCacheSemantics: false,
      changesOfflineFallbacks: false,
      auditAppliedStep: '8O-11e'
    }),
    Object.freeze({
      id: 'service-worker:bypass-non-cacheable-streaming-requests',
      file: 'service-worker-kalorii.js',
      lineHint: 252,
      eventName: 'fetch',
      functionName: 'shouldBypassCache',
      strategyType: 'bypass-cache',
      requestClass: 'range-video-presentations',
      cacheName: null,
      networkFetch: false,
      readsCache: false,
      writesCache: false,
      cacheKeyPolicy: 'not-cached',
      cacheKeyPolicyCovered: true,
      fallbackFromCache: false,
      backgroundRefresh: false,
      expectedBackgroundRefresh: false,
      usesEventWaitUntil: false,
      redirectSafety: false,
      bypassRules: ['range-header', 'video-destination', '/videos/', '/presentations/'],
      timeoutPolicy: 'bypass-native-browser-fetch',
      timeoutApplied: false,
      timeoutExempt: true,
      timeoutExemptionAudited: true,
      serviceWorkerAuditApplied: true,
      changesCacheSemantics: false,
      changesOfflineFallbacks: false,
      auditAppliedStep: '8O-11e'
    })
  ]);



  const SERVICE_WORKER_OFFLINE_UPDATE_FLOW_SMOKE_SCENARIOS = Object.freeze([
    Object.freeze({
      id: 'service-worker:e2e-install-required-shell-precache',
      tool: SERVICE_WORKER_E2E_SMOKE_TOOL,
      scenarioType: 'install',
      eventName: 'install',
      validates: ['required-core-precache', 'optional-precache-best-effort'],
      mockedCacheApiOnly: true,
      registersRealServiceWorker: false,
      touchesBrowserCacheApi: false,
      changesCacheStrategy: false,
      changesOfflineFallbacks: false,
      expectedInSmoke: true,
      auditAppliedStep: '8O-11f'
    }),
    Object.freeze({
      id: 'service-worker:e2e-activate-runtime-migration-prune',
      tool: SERVICE_WORKER_E2E_SMOKE_TOOL,
      scenarioType: 'activate',
      eventName: 'activate',
      validates: ['runtime-cache-migration', 'old-cache-prune', 'navigation-preload-disable', 'clients-claim'],
      mockedCacheApiOnly: true,
      registersRealServiceWorker: false,
      touchesBrowserCacheApi: false,
      changesCacheStrategy: false,
      changesOfflineFallbacks: false,
      expectedInSmoke: true,
      auditAppliedStep: '8O-11f'
    }),
    Object.freeze({
      id: 'service-worker:e2e-navigation-cache-first-background-refresh',
      tool: SERVICE_WORKER_E2E_SMOKE_TOOL,
      scenarioType: 'fetch',
      eventName: 'fetch',
      requestClass: 'navigation',
      validates: ['cache-first-response', 'event-waitUntil-background-refresh', 'navigation-cache-update'],
      mockedCacheApiOnly: true,
      registersRealServiceWorker: false,
      touchesBrowserCacheApi: false,
      changesCacheStrategy: false,
      changesOfflineFallbacks: false,
      expectedInSmoke: true,
      auditAppliedStep: '8O-11f'
    }),
    Object.freeze({
      id: 'service-worker:e2e-navigation-offline-document-fallback',
      tool: SERVICE_WORKER_E2E_SMOKE_TOOL,
      scenarioType: 'fetch',
      eventName: 'fetch',
      requestClass: 'navigation-offline',
      validates: ['document-path-normalization', 'cached-document-fallback'],
      mockedCacheApiOnly: true,
      registersRealServiceWorker: false,
      touchesBrowserCacheApi: false,
      changesCacheStrategy: false,
      changesOfflineFallbacks: false,
      expectedInSmoke: true,
      auditAppliedStep: '8O-11f'
    }),
    Object.freeze({
      id: 'service-worker:e2e-shell-asset-cache-first-background-refresh',
      tool: SERVICE_WORKER_E2E_SMOKE_TOOL,
      scenarioType: 'fetch',
      eventName: 'fetch',
      requestClass: 'shell-asset',
      validates: ['shell-cache-hit', 'background-refresh'],
      mockedCacheApiOnly: true,
      registersRealServiceWorker: false,
      touchesBrowserCacheApi: false,
      changesCacheStrategy: false,
      changesOfflineFallbacks: false,
      expectedInSmoke: true,
      auditAppliedStep: '8O-11f'
    }),
    Object.freeze({
      id: 'service-worker:e2e-versioned-shell-cache-key-offline-hit',
      tool: SERVICE_WORKER_E2E_SMOKE_TOOL,
      scenarioType: 'fetch',
      eventName: 'fetch',
      requestClass: 'versioned-shell-asset-offline',
      validates: ['precache-cache-key-pathname-plus-search', 'fetch-cache-key-pathname-plus-search', 'offline-versioned-shell-cache-hit'],
      mockedCacheApiOnly: true,
      registersRealServiceWorker: false,
      touchesBrowserCacheApi: false,
      changesCacheStrategy: false,
      changesOfflineFallbacks: false,
      expectedInSmoke: true,
      auditAppliedStep: '8O-11g'
    }),
    Object.freeze({
      id: 'service-worker:e2e-runtime-cache-first-background-refresh',
      tool: SERVICE_WORKER_E2E_SMOKE_TOOL,
      scenarioType: 'fetch',
      eventName: 'fetch',
      requestClass: 'runtime-resource',
      validates: ['runtime-network-fill', 'runtime-cache-hit', 'runtime-background-refresh'],
      mockedCacheApiOnly: true,
      registersRealServiceWorker: false,
      touchesBrowserCacheApi: false,
      changesCacheStrategy: false,
      changesOfflineFallbacks: false,
      expectedInSmoke: true,
      auditAppliedStep: '8O-11f'
    }),
    Object.freeze({
      id: 'service-worker:e2e-runtime-offline-cache-hit-fallback',
      tool: SERVICE_WORKER_E2E_SMOKE_TOOL,
      scenarioType: 'fetch',
      eventName: 'fetch',
      requestClass: 'runtime-resource-offline',
      validates: ['cached-runtime-response-when-network-fails'],
      mockedCacheApiOnly: true,
      registersRealServiceWorker: false,
      touchesBrowserCacheApi: false,
      changesCacheStrategy: false,
      changesOfflineFallbacks: false,
      expectedInSmoke: true,
      auditAppliedStep: '8O-11f'
    }),
    Object.freeze({
      id: 'service-worker:e2e-activate-stale-cache-pruning-scope',
      tool: SERVICE_WORKER_E2E_SMOKE_TOOL,
      scenarioType: 'activate',
      eventName: 'activate',
      requestClass: 'stale-cache-pruning-scope',
      validates: ['old-shell-cache-prune', 'old-versioned-runtime-migration', 'current-runtime-cache-preserved', 'unrelated-cache-preserved'],
      mockedCacheApiOnly: true,
      registersRealServiceWorker: false,
      touchesBrowserCacheApi: false,
      changesCacheStrategy: false,
      changesOfflineFallbacks: false,
      expectedInSmoke: true,
      auditAppliedStep: '8O-11h'
    }),
    Object.freeze({
      id: 'service-worker:e2e-runtime-cache-growth-risk-audit',
      tool: SERVICE_WORKER_E2E_SMOKE_TOOL,
      scenarioType: 'fetch',
      eventName: 'fetch',
      requestClass: 'runtime-cache-growth-risk-audit',
      validates: ['runtime-cache-metadata-written', 'runtime-cache-growth-risk-mitigated'],
      mockedCacheApiOnly: true,
      registersRealServiceWorker: false,
      touchesBrowserCacheApi: false,
      changesCacheStrategy: false,
      changesOfflineFallbacks: false,
      expectedInSmoke: true,
      auditAppliedStep: '8O-11i'
    }),
    Object.freeze({
      id: 'service-worker:e2e-runtime-cache-ttl-prune',
      tool: SERVICE_WORKER_E2E_SMOKE_TOOL,
      scenarioType: 'fetch',
      eventName: 'fetch',
      requestClass: 'runtime-cache-ttl-prune',
      validates: ['runtime-cache-ttl-ms', 'expired-runtime-entry-delete', 'expired-runtime-metadata-delete'],
      mockedCacheApiOnly: true,
      registersRealServiceWorker: false,
      touchesBrowserCacheApi: false,
      changesCacheStrategy: false,
      changesOfflineFallbacks: false,
      expectedInSmoke: true,
      auditAppliedStep: '8O-11i'
    }),
    Object.freeze({
      id: 'service-worker:e2e-runtime-cache-max-entry-prune',
      tool: SERVICE_WORKER_E2E_SMOKE_TOOL,
      scenarioType: 'fetch',
      eventName: 'fetch',
      requestClass: 'runtime-cache-max-entry-prune',
      validates: ['runtime-cache-max-entries', 'oldest-runtime-entry-delete', 'runtime-metadata-count-aligned'],
      mockedCacheApiOnly: true,
      registersRealServiceWorker: false,
      touchesBrowserCacheApi: false,
      changesCacheStrategy: false,
      changesOfflineFallbacks: false,
      expectedInSmoke: true,
      auditAppliedStep: '8O-11i'
    }),
    Object.freeze({
      id: 'service-worker:e2e-streaming-range-video-bypass',
      tool: SERVICE_WORKER_E2E_SMOKE_TOOL,
      scenarioType: 'fetch',
      eventName: 'fetch',
      requestClass: 'range-video',
      validates: ['no-respondWith-for-streaming-range-video'],
      mockedCacheApiOnly: true,
      registersRealServiceWorker: false,
      touchesBrowserCacheApi: false,
      changesCacheStrategy: false,
      changesOfflineFallbacks: false,
      expectedInSmoke: true,
      auditAppliedStep: '8O-11f'
    }),
    Object.freeze({
      id: 'service-worker:e2e-message-skip-waiting-update-flow',
      tool: SERVICE_WORKER_E2E_SMOKE_TOOL,
      scenarioType: 'message',
      eventName: 'message',
      validates: ['skipWaiting-on-SKIP_WAITING-message'],
      mockedCacheApiOnly: true,
      registersRealServiceWorker: false,
      touchesBrowserCacheApi: false,
      changesCacheStrategy: false,
      changesOfflineFallbacks: false,
      expectedInSmoke: true,
      auditAppliedStep: '8O-11f'
    })
  ]);

  const SERVICE_WORKER_VERSIONED_SHELL_CACHE_KEY_LOCATIONS = Object.freeze([
    Object.freeze({
      id: 'service-worker:precache-versioned-shell-asset-cache-key',
      file: 'service-worker-kalorii.js',
      functionName: 'fetchAndStorePrecacheUrl/getShellCacheKeyFromStaticUrl',
      requestClass: 'versioned-shell-asset',
      cacheName: 'SHELL_CACHE',
      beforePolicy: 'pathname-only-for-non-document-precache',
      afterPolicy: 'pathname-plus-search-for-versioned-shell-assets',
      cacheKeyUsesSearch: true,
      alignedWithFetchCacheKey: true,
      preservesDocumentNormalization: true,
      preservesRequiredInstallFailure: true,
      changesOfflineFallbacks: false,
      changesClinicalData: false,
      changesTherapyData: false,
      cleanupAppliedStep: '8O-11g'
    }),
    Object.freeze({
      id: 'service-worker:fetch-versioned-shell-asset-cache-key',
      file: 'service-worker-kalorii.js',
      functionName: 'getShellCacheKeyFromRequest/getShellCacheKeyFromStaticUrl',
      requestClass: 'versioned-shell-asset',
      cacheName: 'SHELL_CACHE',
      beforePolicy: 'pathname-plus-search-on-fetch-only',
      afterPolicy: 'pathname-plus-search-for-versioned-shell-assets',
      cacheKeyUsesSearch: true,
      alignedWithPrecacheCacheKey: true,
      preservesCacheFirstBackgroundRefresh: true,
      changesOfflineFallbacks: false,
      changesClinicalData: false,
      changesTherapyData: false,
      cleanupAppliedStep: '8O-11g'
    }),
    Object.freeze({
      id: 'service-worker:e2e-versioned-shell-cache-key-offline-hit',
      file: SERVICE_WORKER_E2E_SMOKE_TOOL,
      functionName: 'runServiceWorkerOfflineUpdateFlowSmoke',
      requestClass: 'versioned-shell-asset-offline',
      cacheName: 'SHELL_CACHE',
      validatesPrecacheKey: true,
      validatesFetchKey: true,
      validatesOfflineHit: true,
      mockedCacheApiOnly: true,
      registersRealServiceWorker: false,
      touchesBrowserCacheApi: false,
      changesClinicalData: false,
      changesTherapyData: false,
      cleanupAppliedStep: '8O-11g'
    })
  ]);


  const SERVICE_WORKER_STALE_CACHE_PRUNING_LOCATIONS = Object.freeze([
    Object.freeze({
      id: 'service-worker:activate-active-cache-name-allowlist',
      file: 'service-worker-kalorii.js',
      functionName: 'activate handler / ACTIVE_CACHE_NAMES',
      cacheNamePolicy: 'ACTIVE_CACHE_NAMES = SHELL_CACHE + RUNTIME_CACHE',
      activationPruneAudited: true,
      preservesCurrentShellCache: true,
      preservesCurrentRuntimeCache: true,
      changesCacheSemantics: false,
      changesOfflineFallbacks: false,
      auditOnly: true,
      cleanupAppliedStep: '8O-11h'
    }),
    Object.freeze({
      id: 'service-worker:activate-old-shell-cache-prune',
      file: 'service-worker-kalorii.js',
      functionName: 'activate handler / caches.delete',
      cacheNamePattern: 'pwa-kalorii-shell-v* except current SHELL_CACHE',
      activationPruneAudited: true,
      prunesOldShellCache: true,
      keepsCurrentShellCache: true,
      coveredBySmokeCheck: 'activate-stale-cache-pruning-scope-audit',
      changesCacheSemantics: false,
      changesOfflineFallbacks: false,
      auditOnly: true,
      cleanupAppliedStep: '8O-11h'
    }),
    Object.freeze({
      id: 'service-worker:activate-old-versioned-runtime-migration',
      file: 'service-worker-kalorii.js',
      functionName: 'migrateOldRuntimeCaches',
      cacheNamePattern: 'pwa-kalorii-runtime-* to pwa-kalorii-runtime',
      activationPruneAudited: true,
      migratesOldRuntimeBeforeDelete: true,
      prunesOldVersionedRuntimeCache: true,
      preservesRuntimeEntries: true,
      coveredBySmokeCheck: 'activate-migrates-runtime-and-prunes-old-caches',
      changesCacheSemantics: false,
      changesOfflineFallbacks: false,
      auditOnly: true,
      cleanupAppliedStep: '8O-11h'
    }),
    Object.freeze({
      id: 'service-worker:activate-unrelated-cache-preserved',
      file: 'service-worker-kalorii.js',
      functionName: 'activate handler / prefix guard',
      cacheNamePattern: 'not starting with pwa-kalorii',
      activationPruneAudited: true,
      preservesUnrelatedCaches: true,
      coveredBySmokeCheck: 'activate-stale-cache-pruning-scope-audit',
      changesCacheSemantics: false,
      changesOfflineFallbacks: false,
      auditOnly: true,
      cleanupAppliedStep: '8O-11h'
    }),
    Object.freeze({
      id: 'service-worker:runtime-cache-growth-risk-audit',
      file: 'service-worker-kalorii.js',
      functionName: 'updateRuntimeFromNetwork / RUNTIME_CACHE',
      cacheName: 'pwa-kalorii-runtime',
      runtimeCacheVersioned: false,
      runtimeMaxEntriesApplied: true,
      runtimeTtlApplied: true,
      runtimeMetadataEntriesApplied: true,
      runtimeCacheGrowthRiskAudited: true,
      runtimeCachePruningImplemented: true,
      runtimeCachePruningRecommendedFollowUp: false,
      runtimeCacheMaxEntries: SERVICE_WORKER_RUNTIME_CACHE_MAX_ENTRIES,
      runtimeCacheTtlMs: SERVICE_WORKER_RUNTIME_CACHE_TTL_MS,
      coveredBySmokeCheck: 'runtime-cache-metadata-written/runtime-cache-ttl-expired-entry-pruned/runtime-cache-max-entry-prune',
      changesCacheSemantics: false,
      changesOfflineFallbacks: false,
      auditOnly: false,
      cleanupAppliedStep: '8O-11i'
    }),
    Object.freeze({
      id: 'service-worker:e2e-stale-cache-pruning-scope-audit',
      file: SERVICE_WORKER_E2E_SMOKE_TOOL,
      functionName: 'runServiceWorkerOfflineUpdateFlowSmoke',
      validatesOldShellPrune: true,
      validatesOldRuntimeMigration: true,
      validatesCurrentRuntimePreserved: true,
      validatesUnrelatedCachesPreserved: true,
      validatesRuntimeGrowthRiskAuditOnly: true,
      validatesRuntimeCacheMetadata: true,
      validatesRuntimeCacheTtlPrune: true,
      validatesRuntimeCacheMaxEntryPrune: true,
      mockedCacheApiOnly: true,
      registersRealServiceWorker: false,
      touchesBrowserCacheApi: false,
      changesCacheSemantics: false,
      changesOfflineFallbacks: false,
      auditOnly: true,
      cleanupAppliedStep: '8O-11h'
    })
  ]);

  const SERVICE_WORKER_CLIENT_LIFECYCLE_LOCATIONS = Object.freeze([
    Object.freeze({
      id: 'ios26-ui:setupSW-singleton-registration',
      file: 'ios26-ui.js',
      lineHint: 2873,
      functionName: 'setupSW/getSWClientLifecycleState',
      role: 'client-service-worker-registration',
      serviceWorkerScript: '/service-worker-kalorii.js',
      runtimeRegistersServiceWorker: true,
      auditRegistersServiceWorker: false,
      singletonRegistrationGuard: true,
      registrationPromiseGuard: true,
      duplicateRegisterGuard: true,
      exposesClientLifecycleSnapshot: true,
      cleanupAppliedStep: '8O-11j',
      changesCacheSemantics: false,
      changesOfflineFallbacks: false,
      changesClinicalData: false,
      changesTherapyData: false,
      cleanupNote: 'setupSW() używa współdzielonego stanu window.__vildaServiceWorkerClientLifecycle i zwraca istniejący registrationPromise przy ponownej inicjalizacji.'
    }),
    Object.freeze({
      id: 'ios26-ui:updatefound-statechange-listener-dedup',
      file: 'ios26-ui.js',
      lineHint: 2823,
      functionName: 'attachServiceWorkerRegistrationLifecycle',
      role: 'client-service-worker-updatefound-listeners',
      updatefoundListenerDedup: true,
      statechangeListenerDedup: true,
      duplicateWaitingPromptGuard: true,
      skipWaitingPayloadPreserved: true,
      skipWaitingPayload: { type: 'SKIP_WAITING' },
      cleanupAppliedStep: '8O-11j',
      changesCacheSemantics: false,
      changesOfflineFallbacks: false,
      changesClinicalData: false,
      changesTherapyData: false,
      cleanupNote: 'Listener updatefound jest dopinany raz per registration, statechange raz per installing worker, a baner nie duplikuje się dla tego samego waiting worker.'
    }),
    Object.freeze({
      id: 'ios26-ui:controllerchange-reload-once',
      file: 'ios26-ui.js',
      lineHint: 2851,
      functionName: 'attachServiceWorkerControllerChangeLifecycle',
      role: 'client-service-worker-controllerchange',
      controllerchangeListenerGuard: true,
      controllerchangeReloadGuard: true,
      callsMigrateIfNeededBeforeReload: true,
      reloadsPageAtRuntime: true,
      auditReloadsPage: false,
      cleanupAppliedStep: '8O-11j',
      changesCacheSemantics: false,
      changesOfflineFallbacks: false,
      changesClinicalData: false,
      changesTherapyData: false,
      cleanupNote: 'controllerchange listener jest dopinany jednokrotnie i ma guard reloadedAfterControllerChange, żeby jedna aktualizacja SW nie wywołała wielu reloadów.'
    }),
    Object.freeze({
      id: 'docpro:legacy-inline-service-worker-registration-removed',
      file: 'docpro.html',
      lineHint: 6042,
      role: 'legacy-duplicate-client-registration',
      legacyInlineRegistrationRemoved: true,
      delegatedToGlobalIos26UiLifecycle: true,
      registersServiceWorkerHere: false,
      duplicateRegisterGuard: true,
      cleanupAppliedStep: '8O-11j',
      changesCacheSemantics: false,
      changesOfflineFallbacks: false,
      changesClinicalData: false,
      changesTherapyData: false,
      cleanupNote: 'Usunięto równoległe navigator.serviceWorker.register() z docpro.html; strona korzysta z globalnego lifecycle w ios26-ui.js.'
    }),
    Object.freeze({
      id: 'html:ios26-ui-cache-busting-v18',
      file: 'index.html/docpro.html/kalkulator-klirens.html + optional HTML',
      role: 'client-service-worker-lifecycle-cache-busting',
      ios26UiVersionToken: 'ios26-ui.js?v=18',
      serviceWorkerShellAssetToken: '/ios26-ui.js?v=18',
      serviceWorkerVersion: SERVICE_WORKER_VERSION,
      cacheBustingUpdated: true,
      cleanupAppliedStep: '8O-11j',
      changesCacheSemantics: false,
      changesOfflineFallbacks: false,
      changesClinicalData: false,
      changesTherapyData: false,
      cleanupNote: 'Zmieniony ios26-ui.js jest odświeżany przez HTML i shell cache Service Workera bez zmiany strategii cache.'
    })
  ]);




  const SERVICE_WORKER_CLIENT_UPDATE_UX_LOCATIONS = Object.freeze([
    Object.freeze({
      id: 'ios26-ui:update-banner-accessible-singleton',
      file: 'ios26-ui.js',
      functionName: 'showUpdateBanner',
      role: 'client-service-worker-update-ux-banner',
      accessibleAlert: true,
      ariaLivePolite: true,
      ariaAtomic: true,
      singletonBannerGuard: true,
      dataStepToken: '8O-11k',
      buttonTypeExplicit: true,
      buttonAriaLabels: true,
      cleanupAppliedStep: '8O-11k',
      changesCacheSemantics: false,
      changesOfflineFallbacks: false,
      changesClinicalData: false,
      changesTherapyData: false,
      cleanupNote: 'Baner aktualizacji ma dostępny alert, jawne przyciski type=button, aria-label i singleton guard przed duplikacją promptu.'
    }),
    Object.freeze({
      id: 'ios26-ui:update-banner-refresh-single-skip-waiting',
      file: 'ios26-ui.js',
      functionName: 'showUpdateBanner refresh handler / postSkipWaitingToWaitingWorker',
      role: 'client-service-worker-update-ux-refresh',
      refreshClickGuard: true,
      duplicateRefreshClickGuard: true,
      postsSkipWaitingAtRuntime: true,
      auditPostsSkipWaiting: false,
      skipWaitingPayloadPreserved: true,
      skipWaitingPayload: { type: 'SKIP_WAITING' },
      cleanupAppliedStep: '8O-11k',
      changesCacheSemantics: false,
      changesOfflineFallbacks: false,
      changesClinicalData: false,
      changesTherapyData: false,
      cleanupNote: 'Kliknięcie „Przeładuj” wysyła zachowany payload SKIP_WAITING tylko raz; kolejne kliknięcia są ignorowane przez pending-reload guard.'
    }),
    Object.freeze({
      id: 'ios26-ui:update-banner-dismiss-no-skip-waiting',
      file: 'ios26-ui.js',
      functionName: 'showUpdateBanner dismiss handler',
      role: 'client-service-worker-update-ux-dismiss',
      dismissClickGuard: true,
      removesBanner: true,
      postsSkipWaitingOnDismiss: false,
      auditPostsSkipWaiting: false,
      cleanupAppliedStep: '8O-11k',
      changesCacheSemantics: false,
      changesOfflineFallbacks: false,
      changesClinicalData: false,
      changesTherapyData: false,
      cleanupNote: 'Kliknięcie „Później” usuwa baner i nie wysyła SKIP_WAITING.'
    }),
    Object.freeze({
      id: 'ios26-ui:update-ux-readonly-snapshot',
      file: 'ios26-ui.js',
      functionName: 'vildaGetServiceWorkerUpdateUxSnapshot',
      role: 'client-service-worker-update-ux-snapshot',
      exposesReadOnlySnapshot: true,
      snapshotRegistersServiceWorker: false,
      snapshotPostsSkipWaiting: false,
      snapshotReloadsPage: false,
      cleanupAppliedStep: '8O-11k',
      changesCacheSemantics: false,
      changesOfflineFallbacks: false,
      changesClinicalData: false,
      changesTherapyData: false,
      cleanupNote: 'Snapshot update UX jest read-only i nie wykonuje rejestracji, postMessage ani reloadu.'
    }),
    Object.freeze({
      id: 'tools:service-worker-client-update-ux-smoke',
      file: SERVICE_WORKER_CLIENT_UPDATE_UX_SMOKE_TOOL,
      functionName: 'service-worker-client-update-ux-smoke',
      role: 'client-service-worker-update-ux-smoke',
      validatesAccessibleBanner: true,
      validatesRefreshSinglePost: true,
      validatesDismissNoPost: true,
      validatesReadOnlySnapshot: true,
      mockedDomOnly: true,
      registersRealServiceWorker: false,
      touchesBrowserCacheApi: false,
      touchesIndexedDb: false,
      cleanupAppliedStep: '8O-11k',
      changesCacheSemantics: false,
      changesOfflineFallbacks: false,
      changesClinicalData: false,
      changesTherapyData: false,
      cleanupNote: 'Smoke używa Node VM z mockowanym DOM i ServiceWorkerContainer; nie rejestruje realnego Service Workera ani nie dotyka Cache API/IndexedDB.'
    }),
    Object.freeze({
      id: 'html:ios26-ui-cache-busting-v18-update-ux',
      file: 'index.html/docpro.html/kalkulator-klirens.html + optional HTML + service-worker-kalorii.js',
      role: 'client-service-worker-update-ux-cache-busting',
      ios26UiVersionToken: 'ios26-ui.js?v=18',
      serviceWorkerShellAssetToken: '/ios26-ui.js?v=18',
      serviceWorkerVersion: SERVICE_WORKER_VERSION,
      cacheBustingUpdated: true,
      cleanupAppliedStep: '8O-11k',
      changesCacheSemantics: false,
      changesOfflineFallbacks: false,
      changesClinicalData: false,
      changesTherapyData: false,
      cleanupNote: 'Zmieniony UX banera aktualizacji jest odświeżany przez HTML i shell cache Service Workera bez zmiany strategii cache/offline.'
    })
  ]);


  const PWA_MANIFEST_ICON_CACHE_LOCATIONS = Object.freeze([
    Object.freeze({
      id: 'manifest:root-start-url-scope',
      file: 'manifest.json',
      role: 'pwa-manifest-start-url-scope',
      idValue: '/',
      startUrl: '/',
      scope: '/',
      startUrlInScope: true,
      serviceWorkerRootNormalization: '/ -> /index.html',
      rootDocumentCached: true,
      cleanupAppliedStep: '8O-11l',
      changesCacheSemantics: false,
      changesOfflineFallbacks: false,
      changesClinicalData: false,
      changesTherapyData: false,
      cleanupNote: 'start_url i scope pozostają w root scope; Service Worker normalizuje start_url / do cache key /index.html.'
    }),
    Object.freeze({
      id: 'manifest:shortcuts-in-scope',
      file: 'manifest.json',
      role: 'pwa-manifest-shortcuts',
      shortcutUrlsInScope: true,
      externalKontaktShortcutReplaced: true,
      kontaktShortcutUrl: '/kontakt.html',
      cleanupAppliedStep: '8O-11l',
      changesCacheSemantics: false,
      changesOfflineFallbacks: false,
      changesClinicalData: false,
      changesTherapyData: false,
      cleanupNote: 'Shortcut Kontakt nie wskazuje już poza scope PWA; używa lokalnej strony /kontakt.html.'
    }),
    Object.freeze({
      id: 'manifest:declared-icons-materialized',
      file: 'manifest.json + pwa-icons/',
      role: 'pwa-manifest-icons',
      iconCount: 23,
      requiredSizes: ['40x40', '48x48', '58x58', '60x60', '72x72', '76x76', '80x80', '87x87', '96x96', '114x114', '120x120', '128x128', '136x136', '144x144', '152x152', '167x167', '180x180', '192x192', '256x256', '384x384', '512x512', '1024x1024'],
      maskableIcon: '/pwa-icons/icon-512x512-maskable.png',
      canonicalIconDirectory: '/pwa-icons/',
      iconSource: 'uploaded-pwa-icons.zip',
      legacyIconsDirectoryReferenced: false,
      iconFilesMaterialized: true,
      iconDimensionsAudited: true,
      cleanupAppliedStep: '8O-11l',
      changesCacheSemantics: false,
      changesOfflineFallbacks: false,
      changesClinicalData: false,
      changesTherapyData: false,
      cleanupNote: 'Użyto przesłanego katalogu /pwa-icons/ jako kanonicznego źródła ikon; manifest deklaruje 23 istniejące pliki PNG, w tym ikonę maskable 512x512, bez odwołań do /icons/.'
    }),
    Object.freeze({
      id: 'html:manifest-and-touch-icons-root-absolute',
      file: 'index.html/docpro.html',
      role: 'pwa-html-manifest-links',
      manifestHref: '/manifest.json',
      touchIconsRootAbsolute: true,
      msTileImageRootAbsolute: true,
      browserIconsUsePwaIcons: true,
      legacyFaviconIcoRemoved: true,
      cleanupAppliedStep: '8O-11l',
      changesCacheSemantics: false,
      changesOfflineFallbacks: false,
      changesClinicalData: false,
      changesTherapyData: false,
      cleanupNote: 'Link manifestu i touch-icon/Tiles są absolutne względem root scope PWA.'
    }),
    Object.freeze({
      id: 'service-worker:pwa-manifest-icon-cache-list',
      file: 'service-worker-kalorii.js',
      role: 'pwa-manifest-icon-cache',
      manifestCached: true,
      manifestIconsCached: true,
      faviconsCached: true,
      browserIconsCached: true,
      maskableIconCached: true,
      canonicalIconDirectory: '/pwa-icons/',
      legacyIconsDirectoryReferenced: false,
      swVersion: SERVICE_WORKER_VERSION,
      cleanupAppliedStep: '8O-11l',
      changesCacheSemantics: false,
      changesOfflineFallbacks: false,
      changesClinicalData: false,
      changesTherapyData: false,
      cleanupNote: 'Service Worker opcjonalnie precache’uje /manifest.json oraz wszystkie ikony deklarowane w /pwa-icons/ bez używania nieistniejącego katalogu /icons/ i bez zmiany strategii cache-first/background refresh.'
    }),
    Object.freeze({
      id: 'tools:pwa-manifest-icon-cache-smoke',
      file: PWA_MANIFEST_ICON_CACHE_SMOKE_TOOL,
      role: 'pwa-manifest-icon-cache-smoke',
      validatesStartUrlScope: true,
      validatesShortcutScope: true,
      validatesIconFiles: true,
      validatesIconDimensions: true,
      validatesServiceWorkerIconCacheList: true,
      validatesLegacyIconsDirectoryAbsent: true,
      mockedOnly: true,
      registersRealServiceWorker: false,
      touchesBrowserCacheApi: false,
      touchesIndexedDb: false,
      cleanupAppliedStep: '8O-11l',
      changesCacheSemantics: false,
      changesOfflineFallbacks: false,
      changesClinicalData: false,
      changesTherapyData: false,
      cleanupNote: 'Smoke statycznie sprawdza manifest, pliki ikon i listę cache Service Workera; nie rejestruje SW i nie dotyka Cache API.'
    })
  ]);

  const RECOMMENDED_CLEANUP_PLAN = Object.freeze([
    Object.freeze({
      step: '8O-11a-a',
      status: 'done',
      title: 'Read-only mapa IndexedDB/BroadcastChannel',
      action: 'Snapshot audytowy utrzymany jako punkt porównania.'
    }),
    Object.freeze({
      step: '8O-11a-b',
      status: 'done',
      title: 'Jawne domykanie IDBDatabase',
      action: 'Dodano db.close() w bezpiecznych ścieżkach finally po znanych transakcjach odczytu, czyszczenia i zapisu.'
    }),
    Object.freeze({
      step: '8O-11a-c',
      status: 'done',
      title: 'Obsługa onversionchange',
      action: 'Ustawiono db.onversionchange tak, aby zamknąć połączenie przy upgrade bazy w innej karcie.'
    }),
    Object.freeze({
      step: '8O-11b',
      status: 'done',
      title: 'BroadcastChannel lifecycle cleanup',
      action: 'Dodano idempotentne close() kanałów na pagehide/beforeunload bez zmiany payloadów update/clear.'
    }),
    Object.freeze({
      step: '8O-11c',
      status: 'done',
      title: 'MutationObserver lifecycle cleanup',
      action: 'Zawężono obserwator DOM monitora GH/IGF do preferowanych kontenerów i dodano disconnect po wykryciu karty oraz na pagehide/beforeunload.'
    }),
    Object.freeze({
      step: '8O-11d',
      status: 'done',
      title: 'Fetch timeout cleanup',
      action: 'Dodano wspólne helpery fetch*WithTimeout z AbortController oraz przepięto aplikacyjne loadery JSON/XLSX/blob bez zmiany danych klinicznych.'
    }),
    Object.freeze({
      step: '8O-11e',
      status: 'done',
      title: 'Service Worker fetch/cache strategy audit',
      action: 'Zmapowano strategie install/fetch/cache/offline Service Workera, utrzymano timeout-exempt policy i potwierdzono brak zmian semantyki cache-first/background refresh.'
    }),
    Object.freeze({
      step: '8O-11f',
      status: 'done',
      title: 'Service Worker offline/update-flow E2E smoke',
      action: 'Dodano lekki test E2E/PWA dla aktualizacji SW, offline fallbacków i ścieżek cache-first/background refresh w kontrolowanym mocku Cache API bez modyfikacji danych klinicznych.'
    }),
    Object.freeze({
      step: '8O-11g',
      status: 'done',
      title: 'Service Worker versioned shell asset cache-key audit/fix',
      action: 'Ujednolicono cache key dla zasobów shell z ?v= między precache/install i fetch oraz dodano kontrolowany smoke offline dla wersjonowanego zasobu shell.'
    }),
    Object.freeze({
      step: '8O-11h',
      status: 'done',
      title: 'Service Worker stale shell/runtime cache pruning audit',
      action: 'Zmapowano scope aktywacyjnego prune starych cache, potwierdzono migrację starych runtime cache oraz oznaczono runtime cache jako kandydat do osobnego TTL/max-entry cleanupu bez zmiany strategii offline w tym kroku.'
    }),
    Object.freeze({
      step: '8O-11i',
      status: 'done',
      title: 'Service Worker runtime cache TTL/max-entry pruning fix',
      action: 'Dodano metadane runtime cache, TTL 30 dni oraz limit 96 wpisów runtime z prune po zapisie i podczas activate, zachowując cache-first/background refresh dla nieprzeterminowanych wpisów.'
    }),
    Object.freeze({
      step: '8O-11j',
      status: 'done',
      title: 'Client-side Service Worker registration/update-flow lifecycle audit',
      action: 'Dodano singleton registrationPromise, deduplikację updatefound/statechange/waiting prompt, jednorazowy reload po controllerchange oraz usunięto równoległą rejestrację SW z docpro.html.'
    }),
    Object.freeze({
      step: '8O-11k',
      status: 'done',
      title: 'Client-side Service Worker update UX smoke / banner interaction audit',
      action: 'Dodano smoke banera aktualizacji SW w mockowanym DOM: dostępność alertu, jawne przyciski, pojedynczy SKIP_WAITING po „Przeładuj”, bezpieczne „Później” i read-only snapshot UX.'
    }),
    Object.freeze({
      step: '8O-11l',
      status: 'done-in-this-step',
      title: 'PWA manifest/start_url/scope/icon cache audit',
      action: 'Dodano brakujące ikony PWA, domknięto shortcuty w scope, uabsolutniono linki manifestu/touch-icon i potwierdzono cache manifestu/ikon w Service Workerze.'
    })
  ]);

  function clonePlain(value, depth) {
    const maxDepth = typeof depth === 'number' ? depth : 8;
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

  function getEnvironmentAvailability() {
    return {
      indexedDB: typeof global.indexedDB !== 'undefined',
      BroadcastChannel: typeof global.BroadcastChannel !== 'undefined',
      MutationObserver: typeof global.MutationObserver !== 'undefined',
      pagehideListenerApi: typeof global.addEventListener === 'function',
      beforeunloadListenerApi: typeof global.addEventListener === 'function',
      mutationObserverLifecycleApi: typeof global.addEventListener === 'function',
      fetch: typeof global.fetch === 'function',
      AbortController: typeof global.AbortController !== 'undefined',
      setTimeout: typeof global.setTimeout === 'function',
      clearTimeout: typeof global.clearTimeout === 'function'
    };
  }

  function isFullCloseCoverage(item) {
    return item && (item.closeCoverage === 'full' || item.closeCoverage === 'tx-complete-finally' || item.closeCoverage === 'finally-close') && item.closesDatabase === true;
  }

  function buildCloseCoverage() {
    const dataOperationLocations = DATABASE_LOCATIONS.filter(function (item) {
      return !!item.transactionMode;
    });
    const directOpenLocations = DATABASE_LOCATIONS.filter(function (item) {
      return item.returnsOpenDatabase === true;
    });
    const fullCloseIds = dataOperationLocations.filter(isFullCloseCoverage).map(function (item) { return item.id; });
    const partialCloseIds = dataOperationLocations.filter(function (item) {
      return item.closeCoverage === 'partial-success-path';
    }).map(function (item) { return item.id; });
    const missingCloseIds = dataOperationLocations.filter(function (item) {
      return !isFullCloseCoverage(item) && item.closeCoverage !== 'partial-success-path';
    }).map(function (item) { return item.id; });
    const callerDependentIds = directOpenLocations.filter(function (item) {
      return item.closeCoverage === 'caller-dependent';
    }).map(function (item) { return item.id; });
    return {
      knownOperationLocationCount: dataOperationLocations.length,
      openFunctionLocationCount: directOpenLocations.length,
      fullCloseIds,
      partialCloseIds,
      missingCloseIds,
      callerDependentOpenFunctionIds: callerDependentIds,
      knownCallerDependentOpenersCovered: directOpenLocations.every(function (item) { return item.knownCallersCloseDatabase === true; }),
      allKnownDataOperationsCovered: missingCloseIds.length === 0 && partialCloseIds.length === 0,
      allKnownTransactionOperationsCovered: missingCloseIds.length === 0 && partialCloseIds.length === 0,
      allKnownOperationsFullyCovered: missingCloseIds.length === 0 && partialCloseIds.length === 0,
      cleanupAppliedStep: '8O-11a-b',
      needsCleanup: missingCloseIds.length > 0 || partialCloseIds.length > 0
    };
  }

  function buildOnVersionChangeCoverage() {
    const directOpenLocations = DATABASE_LOCATIONS.filter(function (item) { return item.directIndexedDbOpen === true; });
    const coveredIds = directOpenLocations.filter(function (item) { return item.hasOnVersionChange === true; }).map(function (item) { return item.id; });
    const missingIds = directOpenLocations.filter(function (item) { return item.hasOnVersionChange !== true; }).map(function (item) { return item.id; });
    return {
      directOpenLocationCount: directOpenLocations.length,
      coveredIds,
      missingIds,
      allKnownOpenersCovered: missingIds.length === 0,
      cleanupAppliedStep: '8O-11a-c',
      needsCleanup: missingIds.length > 0
    };
  }

  function buildBroadcastChannelCoverage() {
    const ownerLocations = BROADCAST_CHANNEL_LOCATIONS.filter(function (item) { return item.createsChannel === true; });
    const closeHandlerIds = ownerLocations.filter(function (item) {
      return item.closeHandler === true || item.pagehideCloseHandler === true || item.beforeunloadCloseHandler === true;
    }).map(function (item) { return item.id; });
    const lifecycleCoveredIds = ownerLocations.filter(function (item) {
      return item.closeHandler === true && item.pagehideCloseHandler === true && item.beforeunloadCloseHandler === true;
    }).map(function (item) { return item.id; });
    const pagehideCloseHandlerIds = ownerLocations.filter(function (item) { return item.pagehideCloseHandler === true; }).map(function (item) { return item.id; });
    const beforeunloadCloseHandlerIds = ownerLocations.filter(function (item) { return item.beforeunloadCloseHandler === true; }).map(function (item) { return item.id; });
    const missingCloseHandlerIds = ownerLocations.filter(function (item) {
      return item.closeHandler !== true || item.pagehideCloseHandler !== true || item.beforeunloadCloseHandler !== true;
    }).map(function (item) { return item.id; });
    return {
      channelName: CHANNEL_NAME,
      knownLocationCount: BROADCAST_CHANNEL_LOCATIONS.length,
      ownerLocationCount: ownerLocations.length,
      closeHandlerIds,
      lifecycleCoveredIds,
      pagehideCloseHandlerIds,
      beforeunloadCloseHandlerIds,
      missingCloseHandlerIds,
      hasCloseHandlers: missingCloseHandlerIds.length === 0 && ownerLocations.length > 0,
      allOwnerChannelsCovered: missingCloseHandlerIds.length === 0,
      cleanupAppliedStep: '8O-11b',
      needsCleanup: missingCloseHandlerIds.length > 0
    };
  }

  function buildMutationObserverCoverage() {
    const observerLocations = MUTATION_OBSERVER_LOCATIONS.filter(function (item) { return item.observerType === 'MutationObserver'; });
    const disconnectCoveredIds = observerLocations.filter(function (item) {
      return !!item.disconnectHelper && item.disconnectsAfterTargetFound === true && item.pagehideDisconnectHandler === true && item.beforeunloadDisconnectHandler === true;
    }).map(function (item) { return item.id; });
    const scopedIds = observerLocations.filter(function (item) {
      return item.observesPreferredContainerFirst === true && item.observesDocumentBodyUnconditionally !== true;
    }).map(function (item) { return item.id; });
    const missingDisconnectIds = observerLocations.filter(function (item) {
      return !item.disconnectHelper || item.disconnectsAfterTargetFound !== true || item.pagehideDisconnectHandler !== true || item.beforeunloadDisconnectHandler !== true;
    }).map(function (item) { return item.id; });
    const bodyOnlyIds = observerLocations.filter(function (item) { return item.observesDocumentBodyUnconditionally === true; }).map(function (item) { return item.id; });
    return {
      knownLocationCount: observerLocations.length,
      observerType: 'MutationObserver',
      preferredRootIds: MUTATION_OBSERVER_TARGET_IDS.slice(0, 3),
      bodyFallbackId: 'document.body',
      disconnectCoveredIds,
      lifecycleCoveredIds: disconnectCoveredIds.slice(),
      scopedIds,
      bodyOnlyIds,
      missingDisconnectIds,
      hasDisconnectHandlers: missingDisconnectIds.length === 0 && observerLocations.length > 0,
      allKnownObserversCovered: missingDisconnectIds.length === 0,
      scopeCleanupComplete: bodyOnlyIds.length === 0,
      cleanupAppliedStep: '8O-11c',
      needsCleanup: missingDisconnectIds.length > 0 || bodyOnlyIds.length > 0
    };
  }


  function buildFetchTimeoutCoverage() {
    const inScopeLocations = FETCH_RESOURCE_LOCATIONS.filter(function (item) { return item.outOfScope !== true; });
    const outOfScopeIds = FETCH_RESOURCE_LOCATIONS.filter(function (item) { return item.outOfScope === true; }).map(function (item) { return item.id; });
    const serviceWorkerLocations = FETCH_RESOURCE_LOCATIONS.filter(function (item) { return item.file === 'service-worker-kalorii.js'; });
    const timeoutCoveredIds = inScopeLocations.filter(function (item) {
      return item.timeoutApplied === true && item.abortControllerHelper === true && item.clearsTimeout === true;
    }).map(function (item) { return item.id; });
    const timeoutExemptIds = inScopeLocations.filter(function (item) {
      return item.timeoutExempt === true && item.timeoutExemptionAudited === true;
    }).map(function (item) { return item.id; });
    const serviceWorkerTimeoutExemptIds = serviceWorkerLocations.filter(function (item) {
      return item.timeoutExempt === true && item.timeoutExemptionAudited === true && item.cacheStrategyAudited === true && item.cacheStrategyPreserved === true;
    }).map(function (item) { return item.id; });
    const jsonErrorCoveredIds = inScopeLocations.filter(function (item) {
      return item.resourceType === 'json' && item.distinguishesJsonParseError === true;
    }).map(function (item) { return item.id; });
    const missingTimeoutIds = inScopeLocations.filter(function (item) {
      if (item.timeoutExempt === true && item.timeoutExemptionAudited === true) return false;
      return item.timeoutApplied !== true || item.abortControllerHelper !== true || item.clearsTimeout !== true;
    }).map(function (item) { return item.id; });
    const missingServiceWorkerTimeoutExemptionIds = serviceWorkerLocations.filter(function (item) {
      return item.timeoutExempt !== true || item.timeoutExemptionAudited !== true || item.cacheStrategyAudited !== true || item.cacheStrategyPreserved !== true;
    }).map(function (item) { return item.id; });
    const missingErrorClassificationIds = inScopeLocations.filter(function (item) {
      if (item.timeoutExempt === true && item.timeoutExemptionAudited === true) return false;
      return item.distinguishesTimeout !== true || item.distinguishesHttpError !== true || item.distinguishesNetworkError !== true || (item.resourceType === 'json' && item.distinguishesJsonParseError !== true);
    }).map(function (item) { return item.id; });
    return {
      knownLocationCount: FETCH_RESOURCE_LOCATIONS.length,
      inScopeLocationCount: inScopeLocations.length,
      outOfScopeLocationCount: outOfScopeIds.length,
      serviceWorkerLocationCount: serviceWorkerLocations.length,
      helperNames: FETCH_TIMEOUT_HELPERS.slice(),
      defaultTimeoutMs: FETCH_TIMEOUT_DEFAULT_MS,
      serviceWorkerTimeoutPolicy: SERVICE_WORKER_TIMEOUT_POLICY,
      timeoutCoveredIds,
      timeoutExemptIds,
      serviceWorkerTimeoutExemptIds,
      jsonErrorCoveredIds,
      outOfScopeIds,
      missingTimeoutIds,
      missingServiceWorkerTimeoutExemptionIds,
      missingErrorClassificationIds,
      allInScopeFetchesCovered: missingTimeoutIds.length === 0 && missingErrorClassificationIds.length === 0 && missingServiceWorkerTimeoutExemptionIds.length === 0,
      serviceWorkerFetchesDeferred: missingServiceWorkerTimeoutExemptionIds.length > 0,
      serviceWorkerCacheStrategyPreserved: serviceWorkerTimeoutExemptIds.length === serviceWorkerLocations.length && serviceWorkerLocations.length > 0,
      serviceWorkerTimeoutExemptionAuditComplete: missingServiceWorkerTimeoutExemptionIds.length === 0 && serviceWorkerLocations.length > 0,
      cleanupAppliedStep: '8O-11e',
      needsCleanup: missingTimeoutIds.length > 0 || missingErrorClassificationIds.length > 0 || missingServiceWorkerTimeoutExemptionIds.length > 0
    };
  }

  function buildServiceWorkerFetchCacheStrategyCoverage() {
    const locations = SERVICE_WORKER_CACHE_STRATEGY_LOCATIONS.slice();
    const fetchLocations = locations.filter(function (item) { return item.networkFetch === true; });
    const cacheFirstIds = locations.filter(function (item) { return String(item.strategyType || '').indexOf('cache-first') >= 0; }).map(function (item) { return item.id; });
    const backgroundRefreshIds = locations.filter(function (item) { return item.backgroundRefresh === true; }).map(function (item) { return item.id; });
    const waitUntilCoveredIds = locations.filter(function (item) { return item.usesEventWaitUntil === true; }).map(function (item) { return item.id; });
    const fallbackCoveredIds = fetchLocations.filter(function (item) {
      return item.fallbackFromCache === true || item.requiredInstallFailureBlocksActivation === true || item.optionalInstallFailureSkips === true;
    }).map(function (item) { return item.id; });
    const timeoutExemptIds = fetchLocations.filter(function (item) {
      return item.timeoutApplied === false && item.timeoutExempt === true && item.timeoutExemptionAudited === true;
    }).map(function (item) { return item.id; });
    const redirectSafeIds = locations.filter(function (item) { return item.redirectSafety === true; }).map(function (item) { return item.id; });
    const bypassCoveredIds = locations.filter(function (item) { return Array.isArray(item.bypassRules) && item.bypassRules.length > 0; }).map(function (item) { return item.id; });
    const cacheKeyCoveredIds = locations.filter(function (item) { return item.cacheKeyPolicyCovered === true; }).map(function (item) { return item.id; });
    const missingAuditIds = fetchLocations.filter(function (item) {
      return item.serviceWorkerAuditApplied !== true || !item.strategyType || !item.cacheKeyPolicy || item.cacheKeyPolicyCovered !== true;
    }).map(function (item) { return item.id; });
    const missingFallbackIds = fetchLocations.filter(function (item) {
      return !(item.fallbackFromCache === true || item.requiredInstallFailureBlocksActivation === true || item.optionalInstallFailureSkips === true);
    }).map(function (item) { return item.id; });
    const missingBackgroundRefreshIds = locations.filter(function (item) {
      return item.expectedBackgroundRefresh === true && item.backgroundRefresh !== true;
    }).map(function (item) { return item.id; });
    const missingTimeoutExemptionIds = fetchLocations.filter(function (item) {
      return item.timeoutApplied !== false || item.timeoutExempt !== true || item.timeoutExemptionAudited !== true;
    }).map(function (item) { return item.id; });
    const missingCacheStrategyPreservationIds = fetchLocations.filter(function (item) {
      return item.changesCacheSemantics !== false || item.changesOfflineFallbacks !== false;
    }).map(function (item) { return item.id; });
    const changedCacheSemanticsIds = locations.filter(function (item) { return item.changesCacheSemantics === true; }).map(function (item) { return item.id; });
    const changedOfflineFallbackIds = locations.filter(function (item) { return item.changesOfflineFallbacks === true; }).map(function (item) { return item.id; });
    return {
      knownLocationCount: locations.length,
      knownStrategyCount: locations.length,
      networkFetchStrategyCount: fetchLocations.length,
      timeoutPolicy: SERVICE_WORKER_TIMEOUT_POLICY,
      timeoutExemptionAudited: true,
      cacheFirstIds,
      backgroundRefreshIds,
      waitUntilCoveredIds,
      fallbackCoveredIds,
      timeoutExemptIds,
      redirectSafeIds,
      bypassCoveredIds,
      cacheKeyCoveredIds,
      missingAuditIds,
      missingFallbackIds,
      missingBackgroundRefreshIds,
      missingTimeoutExemptionIds,
      missingCacheStrategyPreservationIds,
      changedCacheSemanticsIds,
      changedOfflineFallbackIds,
      allKnownServiceWorkerFetchesAudited: missingAuditIds.length === 0 && fetchLocations.length > 0,
      allKnownServiceWorkerTimeoutExemptionsAudited: missingTimeoutExemptionIds.length === 0 && fetchLocations.length > 0,
      cacheStrategyAuditComplete: missingAuditIds.length === 0 && missingFallbackIds.length === 0 && missingBackgroundRefreshIds.length === 0 && missingTimeoutExemptionIds.length === 0 && missingCacheStrategyPreservationIds.length === 0,
      cacheFirstBackgroundRefreshPreserved: missingBackgroundRefreshIds.length === 0,
      noCacheSemanticsChanges: changedCacheSemanticsIds.length === 0,
      noOfflineSemanticsChanges: changedOfflineFallbackIds.length === 0,
      changedCacheSemantics: changedCacheSemanticsIds.length > 0,
      changedOfflineFallbacks: changedOfflineFallbackIds.length > 0,
      cachePrefix: SERVICE_WORKER_CACHE_PREFIX,
      swVersion: SERVICE_WORKER_VERSION,
      cleanupAppliedStep: '8O-11e',
      needsCleanup: missingAuditIds.length > 0 || missingFallbackIds.length > 0 || missingBackgroundRefreshIds.length > 0 || missingTimeoutExemptionIds.length > 0 || missingCacheStrategyPreservationIds.length > 0 || changedCacheSemanticsIds.length > 0 || changedOfflineFallbackIds.length > 0
    };
  }



  function buildServiceWorkerOfflineUpdateFlowSmokeCoverage() {
    const scenarios = SERVICE_WORKER_OFFLINE_UPDATE_FLOW_SMOKE_SCENARIOS.slice();
    const expectedScenarioIds = scenarios.filter(function (item) { return item.expectedInSmoke === true; }).map(function (item) { return item.id; });
    const installScenarioIds = scenarios.filter(function (item) { return item.scenarioType === 'install'; }).map(function (item) { return item.id; });
    const activateScenarioIds = scenarios.filter(function (item) { return item.scenarioType === 'activate'; }).map(function (item) { return item.id; });
    const fetchScenarioIds = scenarios.filter(function (item) { return item.scenarioType === 'fetch'; }).map(function (item) { return item.id; });
    const messageScenarioIds = scenarios.filter(function (item) { return item.scenarioType === 'message'; }).map(function (item) { return item.id; });
    const offlineFallbackScenarioIds = scenarios.filter(function (item) {
      return String(item.requestClass || '').indexOf('offline') >= 0 || (Array.isArray(item.validates) && item.validates.join('|').indexOf('fallback') >= 0);
    }).map(function (item) { return item.id; });
    const backgroundRefreshScenarioIds = scenarios.filter(function (item) {
      return Array.isArray(item.validates) && item.validates.join('|').indexOf('background-refresh') >= 0;
    }).map(function (item) { return item.id; });
    const updateFlowScenarioIds = scenarios.filter(function (item) {
      return item.scenarioType === 'activate' || item.scenarioType === 'message';
    }).map(function (item) { return item.id; });
    const bypassScenarioIds = scenarios.filter(function (item) { return String(item.requestClass || '').indexOf('range-video') >= 0; }).map(function (item) { return item.id; });
    const missingToolIds = scenarios.filter(function (item) { return item.tool !== SERVICE_WORKER_E2E_SMOKE_TOOL; }).map(function (item) { return item.id; });
    const missingMockIsolationIds = scenarios.filter(function (item) {
      return item.mockedCacheApiOnly !== true || item.registersRealServiceWorker !== false || item.touchesBrowserCacheApi !== false;
    }).map(function (item) { return item.id; });
    const changedStrategyIds = scenarios.filter(function (item) {
      return item.changesCacheStrategy !== false || item.changesOfflineFallbacks !== false;
    }).map(function (item) { return item.id; });
    const missingExpectedIds = scenarios.filter(function (item) { return item.expectedInSmoke !== true; }).map(function (item) { return item.id; });
    return {
      tool: SERVICE_WORKER_E2E_SMOKE_TOOL,
      knownScenarioCount: scenarios.length,
      expectedScenarioIds,
      installScenarioIds,
      activateScenarioIds,
      fetchScenarioIds,
      messageScenarioIds,
      offlineFallbackScenarioIds,
      backgroundRefreshScenarioIds,
      updateFlowScenarioIds,
      bypassScenarioIds,
      missingToolIds,
      missingMockIsolationIds,
      changedStrategyIds,
      missingExpectedIds,
      smokeToolDefined: true,
      smokeDoesNotRegisterRealServiceWorker: missingMockIsolationIds.length === 0,
      smokeUsesMockedCacheApiOnly: missingMockIsolationIds.length === 0,
      offlineFallbackSmokeCovered: offlineFallbackScenarioIds.length >= 2,
      backgroundRefreshSmokeCovered: backgroundRefreshScenarioIds.length >= 3,
      updateFlowSmokeCovered: updateFlowScenarioIds.length >= 2,
      streamingBypassSmokeCovered: bypassScenarioIds.length >= 1,
      noServiceWorkerStrategyChanges: changedStrategyIds.length === 0,
      noOfflineFallbackChanges: changedStrategyIds.length === 0,
      cleanupAppliedStep: '8O-11f',
      needsCleanup: missingToolIds.length > 0 || missingMockIsolationIds.length > 0 || changedStrategyIds.length > 0 || missingExpectedIds.length > 0
    };
  }

  function buildServiceWorkerVersionedShellCacheKeyCoverage() {
    const locations = SERVICE_WORKER_VERSIONED_SHELL_CACHE_KEY_LOCATIONS.slice();
    const cacheKeyUsesSearchIds = locations.filter(function (item) {
      return item.cacheKeyUsesSearch === true || item.validatesPrecacheKey === true || item.validatesFetchKey === true;
    }).map(function (item) { return item.id; });
    const alignedIds = locations.filter(function (item) {
      return item.alignedWithFetchCacheKey === true || item.alignedWithPrecacheCacheKey === true || (item.validatesPrecacheKey === true && item.validatesFetchKey === true);
    }).map(function (item) { return item.id; });
    const e2eCoveredIds = locations.filter(function (item) {
      return item.validatesOfflineHit === true && item.mockedCacheApiOnly === true && item.registersRealServiceWorker === false && item.touchesBrowserCacheApi === false;
    }).map(function (item) { return item.id; });
    const missingCacheKeySearchIds = locations.filter(function (item) {
      if (item.validatesOfflineHit === true) return false;
      return item.cacheKeyUsesSearch !== true;
    }).map(function (item) { return item.id; });
    const missingAlignmentIds = locations.filter(function (item) {
      if (item.validatesOfflineHit === true) return false;
      return item.alignedWithFetchCacheKey !== true && item.alignedWithPrecacheCacheKey !== true;
    }).map(function (item) { return item.id; });
    const missingE2EIds = locations.filter(function (item) {
      if (item.validatesOfflineHit !== true) return false;
      return item.validatesPrecacheKey !== true || item.validatesFetchKey !== true || item.mockedCacheApiOnly !== true || item.registersRealServiceWorker !== false || item.touchesBrowserCacheApi !== false;
    }).map(function (item) { return item.id; });
    const changedDataIds = locations.filter(function (item) { return item.changesClinicalData === true || item.changesTherapyData === true; }).map(function (item) { return item.id; });
    const changedOfflineFallbackIds = locations.filter(function (item) { return item.changesOfflineFallbacks === true; }).map(function (item) { return item.id; });
    return {
      knownLocationCount: locations.length,
      cacheKeyPolicy: 'pathname-plus-search-for-versioned-shell-assets',
      cacheKeyUsesSearchIds,
      alignedIds,
      e2eCoveredIds,
      missingCacheKeySearchIds,
      missingAlignmentIds,
      missingE2EIds,
      changedDataIds,
      changedOfflineFallbackIds,
      precacheAndFetchCacheKeysAligned: missingCacheKeySearchIds.length === 0 && missingAlignmentIds.length === 0,
      e2eOfflineHitCovered: missingE2EIds.length === 0 && e2eCoveredIds.length > 0,
      mockedCacheApiOnly: e2eCoveredIds.length > 0,
      noClinicalDataChanges: changedDataIds.length === 0,
      noOfflineFallbackChanges: changedOfflineFallbackIds.length === 0,
      cleanupAppliedStep: '8O-11g',
      needsCleanup: missingCacheKeySearchIds.length > 0 || missingAlignmentIds.length > 0 || missingE2EIds.length > 0 || changedDataIds.length > 0 || changedOfflineFallbackIds.length > 0
    };
  }


  function buildServiceWorkerStaleCachePruningCoverage() {
    const locations = SERVICE_WORKER_STALE_CACHE_PRUNING_LOCATIONS.slice();
    const activationPruneAuditedIds = locations.filter(function (item) { return item.activationPruneAudited === true; }).map(function (item) { return item.id; });
    const oldShellPruneIds = locations.filter(function (item) { return item.prunesOldShellCache === true; }).map(function (item) { return item.id; });
    const oldRuntimeMigrationIds = locations.filter(function (item) { return item.migratesOldRuntimeBeforeDelete === true && item.prunesOldVersionedRuntimeCache === true; }).map(function (item) { return item.id; });
    const currentRuntimePreservedIds = locations.filter(function (item) { return item.preservesCurrentRuntimeCache === true || item.validatesCurrentRuntimePreserved === true; }).map(function (item) { return item.id; });
    const unrelatedCachePreservedIds = locations.filter(function (item) { return item.preservesUnrelatedCaches === true || item.validatesUnrelatedCachesPreserved === true; }).map(function (item) { return item.id; });
    const runtimeGrowthRiskAuditedIds = locations.filter(function (item) { return item.runtimeCacheGrowthRiskAudited === true || item.validatesRuntimeGrowthRiskAuditOnly === true; }).map(function (item) { return item.id; });
    const e2eCoveredIds = locations.filter(function (item) {
      return item.mockedCacheApiOnly === true && item.registersRealServiceWorker === false && item.touchesBrowserCacheApi === false;
    }).map(function (item) { return item.id; });
    const runtimePruningImplementedIds = locations.filter(function (item) { return item.runtimeCachePruningImplemented === true; }).map(function (item) { return item.id; });
    const runtimeMaxEntryPruneIds = locations.filter(function (item) { return item.runtimeMaxEntriesApplied === true; }).map(function (item) { return item.id; });
    const runtimeTtlPruneIds = locations.filter(function (item) { return item.runtimeTtlApplied === true; }).map(function (item) { return item.id; });
    const runtimeMetadataIds = locations.filter(function (item) { return item.runtimeMetadataEntriesApplied === true; }).map(function (item) { return item.id; });
    const missingAuditIds = locations.filter(function (item) {
      const auditCovered = item.cleanupAppliedStep === '8O-11h' && item.auditOnly === true;
      const pruningCovered = item.cleanupAppliedStep === '8O-11i' && item.runtimeCachePruningImplemented === true;
      return !auditCovered && !pruningCovered;
    }).map(function (item) { return item.id; });
    const missingBehaviorPreservationIds = locations.filter(function (item) {
      return item.changesCacheSemantics !== false || item.changesOfflineFallbacks !== false;
    }).map(function (item) { return item.id; });
    const missingE2EIds = locations.filter(function (item) {
      if (item.file !== SERVICE_WORKER_E2E_SMOKE_TOOL) return false;
      return item.mockedCacheApiOnly !== true || item.registersRealServiceWorker !== false || item.touchesBrowserCacheApi !== false;
    }).map(function (item) { return item.id; });
    return {
      knownLocationCount: locations.length,
      activationPruneAuditedIds,
      oldShellPruneIds,
      oldRuntimeMigrationIds,
      currentRuntimePreservedIds,
      unrelatedCachePreservedIds,
      runtimeGrowthRiskAuditedIds,
      e2eCoveredIds,
      missingAuditIds,
      missingBehaviorPreservationIds,
      missingE2EIds,
      staleShellCachePruneCovered: oldShellPruneIds.length > 0,
      oldRuntimeCacheMigrationCovered: oldRuntimeMigrationIds.length > 0,
      currentRuntimeCachePreserved: currentRuntimePreservedIds.length > 0,
      unrelatedCachesPreserved: unrelatedCachePreservedIds.length > 0,
      runtimeCacheGrowthRiskAudited: runtimeGrowthRiskAuditedIds.length > 0,
      runtimeCachePruningImplementedIds: runtimePruningImplementedIds,
      runtimeMaxEntryPruneIds,
      runtimeTtlPruneIds,
      runtimeMetadataIds,
      runtimeCachePruningImplemented: runtimePruningImplementedIds.length > 0 && runtimeMaxEntryPruneIds.length > 0 && runtimeTtlPruneIds.length > 0 && runtimeMetadataIds.length > 0,
      runtimeCachePruningRecommendedFollowUp: false,
      runtimeCacheMaxEntries: SERVICE_WORKER_RUNTIME_CACHE_MAX_ENTRIES,
      runtimeCacheTtlMs: SERVICE_WORKER_RUNTIME_CACHE_TTL_MS,
      runtimeCacheMetadataCovered: runtimeMetadataIds.length > 0,
      runtimeCacheTtlPruneCovered: runtimeTtlPruneIds.length > 0,
      runtimeCacheMaxEntryPruneCovered: runtimeMaxEntryPruneIds.length > 0,
      e2eScopeCovered: e2eCoveredIds.length > 0,
      noServiceWorkerCacheStrategyChanges: missingBehaviorPreservationIds.length === 0,
      noOfflineFallbackChanges: missingBehaviorPreservationIds.length === 0,
      cleanupAppliedStep: '8O-11i',
      needsCleanup: missingAuditIds.length > 0 || missingBehaviorPreservationIds.length > 0 || missingE2EIds.length > 0 || runtimePruningImplementedIds.length === 0 || runtimeMaxEntryPruneIds.length === 0 || runtimeTtlPruneIds.length === 0 || runtimeMetadataIds.length === 0
    };
  }


  function buildServiceWorkerClientLifecycleCoverage() {
    const locations = SERVICE_WORKER_CLIENT_LIFECYCLE_LOCATIONS.slice();
    const singletonRegistrationIds = locations.filter(function (item) {
      return item.singletonRegistrationGuard === true && item.registrationPromiseGuard === true && item.duplicateRegisterGuard === true;
    }).map(function (item) { return item.id; });
    const listenerDedupIds = locations.filter(function (item) {
      return item.updatefoundListenerDedup === true && item.statechangeListenerDedup === true;
    }).map(function (item) { return item.id; });
    const waitingPromptGuardIds = locations.filter(function (item) { return item.duplicateWaitingPromptGuard === true; }).map(function (item) { return item.id; });
    const controllerchangeGuardIds = locations.filter(function (item) {
      return item.controllerchangeListenerGuard === true && item.controllerchangeReloadGuard === true;
    }).map(function (item) { return item.id; });
    const legacyDuplicateRemovedIds = locations.filter(function (item) {
      return item.legacyInlineRegistrationRemoved === true && item.delegatedToGlobalIos26UiLifecycle === true && item.registersServiceWorkerHere === false;
    }).map(function (item) { return item.id; });
    const cacheBustingIds = locations.filter(function (item) { return item.cacheBustingUpdated === true; }).map(function (item) { return item.id; });
    const missingLifecycleGuardIds = locations.filter(function (item) {
      if (item.role === 'client-service-worker-registration') return !(item.singletonRegistrationGuard === true && item.registrationPromiseGuard === true && item.duplicateRegisterGuard === true);
      if (item.role === 'client-service-worker-updatefound-listeners') return !(item.updatefoundListenerDedup === true && item.statechangeListenerDedup === true && item.duplicateWaitingPromptGuard === true);
      if (item.role === 'client-service-worker-controllerchange') return !(item.controllerchangeListenerGuard === true && item.controllerchangeReloadGuard === true);
      if (item.role === 'legacy-duplicate-client-registration') return !(item.legacyInlineRegistrationRemoved === true && item.delegatedToGlobalIos26UiLifecycle === true && item.registersServiceWorkerHere === false);
      if (item.role === 'client-service-worker-lifecycle-cache-busting') return item.cacheBustingUpdated !== true;
      return false;
    }).map(function (item) { return item.id; });
    const changedCacheSemanticsIds = locations.filter(function (item) { return item.changesCacheSemantics !== false || item.changesOfflineFallbacks !== false; }).map(function (item) { return item.id; });
    const changedDataIds = locations.filter(function (item) { return item.changesClinicalData !== false || item.changesTherapyData !== false; }).map(function (item) { return item.id; });
    return {
      knownLocationCount: locations.length,
      singletonRegistrationIds,
      listenerDedupIds,
      waitingPromptGuardIds,
      controllerchangeGuardIds,
      legacyDuplicateRemovedIds,
      cacheBustingIds,
      missingLifecycleGuardIds,
      changedCacheSemanticsIds,
      changedDataIds,
      singletonRegistrationGuardCovered: singletonRegistrationIds.length > 0,
      updatefoundStatechangeListenerDedupCovered: listenerDedupIds.length > 0,
      duplicateWaitingPromptGuardCovered: waitingPromptGuardIds.length > 0,
      controllerchangeReloadGuardCovered: controllerchangeGuardIds.length > 0,
      docproLegacyDuplicateRegistrationRemoved: legacyDuplicateRemovedIds.length > 0,
      cacheBustingUpdated: cacheBustingIds.length > 0,
      auditRegistersServiceWorker: false,
      auditPostsSkipWaiting: false,
      auditReloadsPage: false,
      noCacheSemanticsChanges: changedCacheSemanticsIds.length === 0,
      noOfflineFallbackChanges: changedCacheSemanticsIds.length === 0,
      noClinicalDataChanges: changedDataIds.length === 0,
      cleanupAppliedStep: '8O-11j',
      needsCleanup: missingLifecycleGuardIds.length > 0 || changedCacheSemanticsIds.length > 0 || changedDataIds.length > 0
    };
  }



  function buildServiceWorkerClientUpdateUxSmokeCoverage() {
    const locations = SERVICE_WORKER_CLIENT_UPDATE_UX_LOCATIONS.slice();
    const accessibleBannerIds = locations.filter(function (item) {
      return item.accessibleAlert === true && item.ariaLivePolite === true && item.ariaAtomic === true && item.singletonBannerGuard === true;
    }).map(function (item) { return item.id; });
    const labelledButtonIds = locations.filter(function (item) {
      return item.buttonTypeExplicit === true && item.buttonAriaLabels === true;
    }).map(function (item) { return item.id; });
    const refreshGuardIds = locations.filter(function (item) {
      return item.refreshClickGuard === true && item.duplicateRefreshClickGuard === true && item.skipWaitingPayloadPreserved === true;
    }).map(function (item) { return item.id; });
    const dismissGuardIds = locations.filter(function (item) {
      return item.dismissClickGuard === true && item.removesBanner === true && item.postsSkipWaitingOnDismiss === false;
    }).map(function (item) { return item.id; });
    const readOnlySnapshotIds = locations.filter(function (item) {
      return item.exposesReadOnlySnapshot === true && item.snapshotRegistersServiceWorker === false && item.snapshotPostsSkipWaiting === false && item.snapshotReloadsPage === false;
    }).map(function (item) { return item.id; });
    const smokeIds = locations.filter(function (item) {
      return item.file === SERVICE_WORKER_CLIENT_UPDATE_UX_SMOKE_TOOL && item.validatesAccessibleBanner === true && item.validatesRefreshSinglePost === true && item.validatesDismissNoPost === true && item.validatesReadOnlySnapshot === true;
    }).map(function (item) { return item.id; });
    const mockedOnlyIds = locations.filter(function (item) {
      return item.mockedDomOnly === true && item.registersRealServiceWorker === false && item.touchesBrowserCacheApi === false && item.touchesIndexedDb === false;
    }).map(function (item) { return item.id; });
    const cacheBustingIds = locations.filter(function (item) { return item.cacheBustingUpdated === true; }).map(function (item) { return item.id; });
    const changedCacheSemanticsIds = locations.filter(function (item) { return item.changesCacheSemantics !== false || item.changesOfflineFallbacks !== false; }).map(function (item) { return item.id; });
    const changedDataIds = locations.filter(function (item) { return item.changesClinicalData !== false || item.changesTherapyData !== false; }).map(function (item) { return item.id; });
    const missingUpdateUxIds = locations.filter(function (item) {
      if (item.role === 'client-service-worker-update-ux-banner') return !(item.accessibleAlert === true && item.singletonBannerGuard === true && item.buttonTypeExplicit === true && item.buttonAriaLabels === true);
      if (item.role === 'client-service-worker-update-ux-refresh') return !(item.refreshClickGuard === true && item.duplicateRefreshClickGuard === true && item.skipWaitingPayloadPreserved === true);
      if (item.role === 'client-service-worker-update-ux-dismiss') return !(item.dismissClickGuard === true && item.removesBanner === true && item.postsSkipWaitingOnDismiss === false);
      if (item.role === 'client-service-worker-update-ux-snapshot') return !(item.exposesReadOnlySnapshot === true && item.snapshotRegistersServiceWorker === false && item.snapshotPostsSkipWaiting === false && item.snapshotReloadsPage === false);
      if (item.role === 'client-service-worker-update-ux-smoke') return !(item.validatesAccessibleBanner === true && item.validatesRefreshSinglePost === true && item.validatesDismissNoPost === true && item.validatesReadOnlySnapshot === true && item.mockedDomOnly === true);
      if (item.role === 'client-service-worker-update-ux-cache-busting') return item.cacheBustingUpdated !== true;
      return false;
    }).map(function (item) { return item.id; });
    return {
      knownLocationCount: locations.length,
      smokeTool: SERVICE_WORKER_CLIENT_UPDATE_UX_SMOKE_TOOL,
      accessibleBannerIds,
      labelledButtonIds,
      refreshGuardIds,
      dismissGuardIds,
      readOnlySnapshotIds,
      smokeIds,
      mockedOnlyIds,
      cacheBustingIds,
      missingUpdateUxIds,
      changedCacheSemanticsIds,
      changedDataIds,
      bannerAccessibleSingletonCovered: accessibleBannerIds.length > 0,
      bannerButtonLabelsCovered: labelledButtonIds.length > 0,
      refreshSinglePostCovered: refreshGuardIds.length > 0,
      dismissNoSkipWaitingCovered: dismissGuardIds.length > 0,
      readOnlySnapshotCovered: readOnlySnapshotIds.length > 0,
      smokeToolDefined: smokeIds.length > 0,
      smokeUsesMockedDomOnly: mockedOnlyIds.length > 0,
      cacheBustingUpdated: cacheBustingIds.length > 0,
      auditRegistersServiceWorker: false,
      auditPostsSkipWaiting: false,
      auditReloadsPage: false,
      noCacheSemanticsChanges: changedCacheSemanticsIds.length === 0,
      noOfflineFallbackChanges: changedCacheSemanticsIds.length === 0,
      noClinicalDataChanges: changedDataIds.length === 0,
      cleanupAppliedStep: '8O-11k',
      needsCleanup: missingUpdateUxIds.length > 0 || changedCacheSemanticsIds.length > 0 || changedDataIds.length > 0 || smokeIds.length === 0 || mockedOnlyIds.length === 0
    };
  }


  function buildPwaManifestIconCacheCoverage() {
    const locations = PWA_MANIFEST_ICON_CACHE_LOCATIONS.slice();
    const startUrlScopeIds = locations.filter(function (item) { return item.startUrlInScope === true && item.rootDocumentCached === true; }).map(function (item) { return item.id; });
    const shortcutScopeIds = locations.filter(function (item) { return item.shortcutUrlsInScope === true && item.externalKontaktShortcutReplaced === true; }).map(function (item) { return item.id; });
    const iconMaterializedIds = locations.filter(function (item) { return item.iconFilesMaterialized === true && item.iconDimensionsAudited === true; }).map(function (item) { return item.id; });
    const pwaOnlyIconIds = locations.filter(function (item) { return item.canonicalIconDirectory === '/pwa-icons/' && item.legacyIconsDirectoryReferenced === false; }).map(function (item) { return item.id; });
    const htmlLinkIds = locations.filter(function (item) { return item.manifestHref === '/manifest.json' && item.touchIconsRootAbsolute === true && item.msTileImageRootAbsolute === true; }).map(function (item) { return item.id; });
    const serviceWorkerCacheIds = locations.filter(function (item) { return item.manifestCached === true && item.manifestIconsCached === true && item.faviconsCached === true && item.maskableIconCached === true; }).map(function (item) { return item.id; });
    const smokeIds = locations.filter(function (item) { return item.file === PWA_MANIFEST_ICON_CACHE_SMOKE_TOOL && item.validatesStartUrlScope === true && item.validatesShortcutScope === true && item.validatesIconFiles === true && item.validatesServiceWorkerIconCacheList === true; }).map(function (item) { return item.id; });
    const mockedOnlyIds = locations.filter(function (item) { return item.mockedOnly === true && item.registersRealServiceWorker === false && item.touchesBrowserCacheApi === false && item.touchesIndexedDb === false; }).map(function (item) { return item.id; });
    const changedCacheSemanticsIds = locations.filter(function (item) { return item.changesCacheSemantics !== false || item.changesOfflineFallbacks !== false; }).map(function (item) { return item.id; });
    const changedDataIds = locations.filter(function (item) { return item.changesClinicalData !== false || item.changesTherapyData !== false; }).map(function (item) { return item.id; });
    const missingIds = locations.filter(function (item) {
      if (item.role === 'pwa-manifest-start-url-scope') return !(item.startUrlInScope === true && item.rootDocumentCached === true);
      if (item.role === 'pwa-manifest-shortcuts') return !(item.shortcutUrlsInScope === true && item.externalKontaktShortcutReplaced === true);
      if (item.role === 'pwa-manifest-icons') return !(item.iconFilesMaterialized === true && item.iconDimensionsAudited === true && item.maskableIcon && item.canonicalIconDirectory === '/pwa-icons/' && item.legacyIconsDirectoryReferenced === false);
      if (item.role === 'pwa-html-manifest-links') return !(item.manifestHref === '/manifest.json' && item.touchIconsRootAbsolute === true && item.msTileImageRootAbsolute === true);
      if (item.role === 'pwa-manifest-icon-cache') return !(item.manifestCached === true && item.manifestIconsCached === true && item.faviconsCached === true && item.browserIconsCached === true && item.maskableIconCached === true && item.canonicalIconDirectory === '/pwa-icons/' && item.legacyIconsDirectoryReferenced === false);
      if (item.role === 'pwa-manifest-icon-cache-smoke') return !(item.validatesStartUrlScope === true && item.validatesShortcutScope === true && item.validatesIconFiles === true && item.validatesServiceWorkerIconCacheList === true && item.mockedOnly === true);
      return false;
    }).map(function (item) { return item.id; });
    return {
      knownLocationCount: locations.length,
      smokeTool: PWA_MANIFEST_ICON_CACHE_SMOKE_TOOL,
      startUrlScopeIds,
      shortcutScopeIds,
      iconMaterializedIds,
      htmlLinkIds,
      serviceWorkerCacheIds,
      smokeIds,
      mockedOnlyIds,
      changedCacheSemanticsIds,
      changedDataIds,
      missingIds,
      startUrlScopeCovered: startUrlScopeIds.length > 0,
      shortcutScopeCovered: shortcutScopeIds.length > 0,
      iconFilesMaterializedCovered: iconMaterializedIds.length > 0,
      pwaOnlyIconDirectoryCovered: pwaOnlyIconIds.length > 0,
      pwaOnlyIconIds,
      htmlManifestLinksCovered: htmlLinkIds.length > 0,
      serviceWorkerIconCacheCovered: serviceWorkerCacheIds.length > 0,
      smokeCovered: smokeIds.length > 0,
      smokeUsesMockedOnly: mockedOnlyIds.length > 0,
      noCacheSemanticsChanges: changedCacheSemanticsIds.length === 0,
      noOfflineFallbackChanges: changedCacheSemanticsIds.length === 0,
      noClinicalDataChanges: changedDataIds.length === 0,
      cleanupAppliedStep: '8O-11l',
      needsCleanup: missingIds.length > 0 || changedCacheSemanticsIds.length > 0 || changedDataIds.length > 0 || smokeIds.length === 0
    };
  }

  function getSnapshot(options) {
    const opts = options || {};
    const includePlan = opts.includePlan !== false;
    const closeCoverage = buildCloseCoverage();
    const onVersionChangeCoverage = buildOnVersionChangeCoverage();
    const broadcastCoverage = buildBroadcastChannelCoverage();
    const mutationObserverCoverage = buildMutationObserverCoverage();
    const fetchTimeoutCoverage = buildFetchTimeoutCoverage();
    const serviceWorkerCoverage = buildServiceWorkerFetchCacheStrategyCoverage();
    const serviceWorkerOfflineUpdateFlowSmokeCoverage = buildServiceWorkerOfflineUpdateFlowSmokeCoverage();
    const serviceWorkerVersionedShellCacheKeyCoverage = buildServiceWorkerVersionedShellCacheKeyCoverage();
    const serviceWorkerStaleCachePruningCoverage = buildServiceWorkerStaleCachePruningCoverage();
    const serviceWorkerClientLifecycleCoverage = buildServiceWorkerClientLifecycleCoverage();
    const serviceWorkerClientUpdateUxSmokeCoverage = buildServiceWorkerClientUpdateUxSmokeCoverage();
    const pwaManifestIconCacheCoverage = buildPwaManifestIconCacheCoverage();
    const snapshot = {
      step: STEP,
      version: VERSION,
      kind: 'gh-therapy-indexeddb-resource-audit',
      readOnly: true,
      openedIndexedDb: false,
      queriedIndexedDb: false,
      closedDatabaseConnection: false,
      changedTherapyData: false,
      postedBroadcastMessage: false,
      performedFetch: false,
      fetchedAsyncResource: false,
      registeredLifecycleHandlers: false,
      applicationBroadcastLifecycleHandlersRegistered: true,
      applicationMutationObserverLifecycleHandlersRegistered: true,
      indexedDbCloseCleanupApplied: true,
      indexedDbOnVersionChangeCleanupApplied: true,
      indexedDbVersionChangeCleanupApplied: true,
      broadcastChannelLifecycleCleanupApplied: true,
      mutationObserverLifecycleCleanupApplied: true,
      mutationObserverScopeCleanupApplied: true,
      fetchTimeoutCleanupApplied: true,
      asyncFetchTimeoutCleanupApplied: true,
      serviceWorkerFetchCacheStrategyAuditApplied: true,
      serviceWorkerCacheStrategyAuditApplied: true,
      serviceWorkerFetchesAudited: true,
      serviceWorkerTimeoutPolicyAudited: true,
      serviceWorkerTimeoutExemptionAuditApplied: true,
      serviceWorkerOfflineUpdateFlowSmokeApplied: true,
      serviceWorkerOfflineUpdateFlowSmokeDefined: true,
      serviceWorkerVersionedShellCacheKeyFixApplied: true,
      serviceWorkerVersionedShellCacheKeyAuditApplied: true,
      serviceWorkerStaleCachePruningAuditApplied: true,
      serviceWorkerStaleCachePruningSmokeCovered: true,
      serviceWorkerRuntimeCacheGrowthRiskAudited: true,
      serviceWorkerRuntimeCachePruningImplemented: true,
      serviceWorkerRuntimeCachePruningRecommendedFollowUp: false,
      serviceWorkerClientLifecycleAuditApplied: true,
      serviceWorkerClientLifecycleCleanupApplied: true,
      serviceWorkerClientLifecycleRecommendedFollowUp: false,
      serviceWorkerClientUpdateUxSmokeApplied: true,
      pwaManifestIconCacheAuditApplied: true,
      serviceWorkerClientUpdateUxSmokeRecommendedFollowUp: false,
      pwaManifestIconCacheAuditApplied: true,
      pwaManifestIconCacheRecommendedFollowUp: false,
      appliedCleanupStep: '8O-11l',
      cleanupApplied: {
        indexedDbClose: true,
        onVersionChange: true,
        broadcastChannelLifecycle: true,
        mutationObserverLifecycle: true,
        mutationObserverScope: true,
        fetchTimeout: true,
        asyncFetchTimeout: true,
        serviceWorkerFetchCacheStrategy: true,
        serviceWorkerTimeoutExemption: true,
        serviceWorkerOfflineUpdateFlowSmoke: true,
        serviceWorkerVersionedShellCacheKey: true,
        serviceWorkerStaleCachePruningAudit: true,
        serviceWorkerRuntimeCachePruning: true,
        serviceWorkerClientLifecycle: true,
        serviceWorkerClientUpdateUxSmoke: true,
        pwaManifestIconCache: true
      },
      environment: getEnvironmentAvailability(),
      database: {
        name: DB_NAME,
        version: DB_VERSION,
        store: STORE_NAME,
        keyPath: 'id',
        openFunctions: clonePlain(DATABASE_LOCATIONS, 6),
        closeCoverage,
        onVersionChangeCoverage,
        directIndexedDbOpenIds: DATABASE_LOCATIONS.filter(function (item) { return item.directIndexedDbOpen === true; }).map(function (item) { return item.id; }),
        dataChangingLocationIds: DATABASE_LOCATIONS.filter(function (item) { return item.changesTherapyData === true; }).map(function (item) { return item.id; })
      },
      broadcastChannel: {
        channelName: CHANNEL_NAME,
        locations: clonePlain(BROADCAST_CHANNEL_LOCATIONS, 6),
        coverage: broadcastCoverage,
        messageTypes: ['update', 'clear']
      },
      mutationObserver: {
        locations: clonePlain(MUTATION_OBSERVER_LOCATIONS, 6),
        coverage: mutationObserverCoverage,
        watchedSelector: '#ghIgfTherapyCard',
        preferredRootIds: MUTATION_OBSERVER_TARGET_IDS.slice(0, 3),
        bodyFallbackId: 'document.body'
      },
      serviceWorker: {
        step: STEP,
        version: VERSION,
        readOnly: true,
        performedFetch: false,
        touchedCacheApi: false,
        registeredServiceWorker: false,
        script: 'service-worker-kalorii.js',
        swVersion: SERVICE_WORKER_VERSION,
        cachePrefix: SERVICE_WORKER_CACHE_PREFIX,
        shellCacheVersioned: true,
        runtimeCacheVersioned: false,
        rootDocument: '/index.html',
        timeoutPolicy: SERVICE_WORKER_TIMEOUT_POLICY,
        timeoutPolicyAudited: true,
        timeoutExemptionAuditApplied: true,
        noSemanticChanges: true,
        strategyAudit: clonePlain(SERVICE_WORKER_CACHE_STRATEGY_LOCATIONS, 6),
        offlineUpdateFlowSmoke: {
          tool: SERVICE_WORKER_E2E_SMOKE_TOOL,
          scenarios: clonePlain(SERVICE_WORKER_OFFLINE_UPDATE_FLOW_SMOKE_SCENARIOS, 6),
          coverage: serviceWorkerOfflineUpdateFlowSmokeCoverage
        },
        versionedShellCacheKey: {
          locations: clonePlain(SERVICE_WORKER_VERSIONED_SHELL_CACHE_KEY_LOCATIONS, 6),
          coverage: serviceWorkerVersionedShellCacheKeyCoverage
        },
        staleCachePruning: {
          locations: clonePlain(SERVICE_WORKER_STALE_CACHE_PRUNING_LOCATIONS, 6),
          coverage: serviceWorkerStaleCachePruningCoverage
        },
        runtimeCachePruning: {
          maxEntries: SERVICE_WORKER_RUNTIME_CACHE_MAX_ENTRIES,
          ttlMs: SERVICE_WORKER_RUNTIME_CACHE_TTL_MS,
          metadataKeyPrefix: '/__vilda_runtime_cache_metadata__/',
          coverage: serviceWorkerStaleCachePruningCoverage
        },
        clientLifecycle: {
          locations: clonePlain(SERVICE_WORKER_CLIENT_LIFECYCLE_LOCATIONS, 6),
          coverage: serviceWorkerClientLifecycleCoverage,
          singletonRegistrationGuard: serviceWorkerClientLifecycleCoverage.singletonRegistrationGuardCovered === true,
          updatefoundStatechangeListenerDedup: serviceWorkerClientLifecycleCoverage.updatefoundStatechangeListenerDedupCovered === true,
          duplicateWaitingPromptGuard: serviceWorkerClientLifecycleCoverage.duplicateWaitingPromptGuardCovered === true,
          controllerchangeReloadGuard: serviceWorkerClientLifecycleCoverage.controllerchangeReloadGuardCovered === true,
          docproLegacyDuplicateRegistrationRemoved: serviceWorkerClientLifecycleCoverage.docproLegacyDuplicateRegistrationRemoved === true,
          auditRegistersServiceWorker: false,
          auditReloadsPage: false,
          auditPostsSkipWaiting: false
        },
        clientUpdateUxSmoke: {
          tool: SERVICE_WORKER_CLIENT_UPDATE_UX_SMOKE_TOOL,
          locations: clonePlain(SERVICE_WORKER_CLIENT_UPDATE_UX_LOCATIONS, 6),
          coverage: serviceWorkerClientUpdateUxSmokeCoverage,
          bannerAccessibleSingleton: serviceWorkerClientUpdateUxSmokeCoverage.bannerAccessibleSingletonCovered === true,
          refreshSingleSkipWaiting: serviceWorkerClientUpdateUxSmokeCoverage.refreshSinglePostCovered === true,
          dismissNoSkipWaiting: serviceWorkerClientUpdateUxSmokeCoverage.dismissNoSkipWaitingCovered === true,
          readOnlySnapshot: serviceWorkerClientUpdateUxSmokeCoverage.readOnlySnapshotCovered === true,
          smokeUsesMockedDomOnly: serviceWorkerClientUpdateUxSmokeCoverage.smokeUsesMockedDomOnly === true,
          auditRegistersServiceWorker: false,
          auditReloadsPage: false,
          auditPostsSkipWaiting: false
        },
        pwaManifestIconCache: {
          tool: PWA_MANIFEST_ICON_CACHE_SMOKE_TOOL,
          locations: clonePlain(PWA_MANIFEST_ICON_CACHE_LOCATIONS, 6),
          coverage: pwaManifestIconCacheCoverage,
          startUrlScopeCovered: pwaManifestIconCacheCoverage.startUrlScopeCovered === true,
          shortcutScopeCovered: pwaManifestIconCacheCoverage.shortcutScopeCovered === true,
          iconFilesMaterializedCovered: pwaManifestIconCacheCoverage.iconFilesMaterializedCovered === true,
          htmlManifestLinksCovered: pwaManifestIconCacheCoverage.htmlManifestLinksCovered === true,
          serviceWorkerIconCacheCovered: pwaManifestIconCacheCoverage.serviceWorkerIconCacheCovered === true,
          smokeCovered: pwaManifestIconCacheCoverage.smokeCovered === true,
          smokeUsesMockedOnly: pwaManifestIconCacheCoverage.smokeUsesMockedOnly === true,
          auditRegistersServiceWorker: false,
          auditTouchesCacheApi: false
        },
        versionedShellCacheKeyFixApplied: true,
        staleCachePruningAuditApplied: true,
        runtimeCacheGrowthRiskAudited: true,
        runtimeCachePruningImplemented: true,
        runtimeCachePruningRecommendedFollowUp: false,
        clientLifecycleAuditApplied: true,
        clientLifecycleCleanupApplied: true,
        clientLifecycleRecommendedFollowUp: false,
        clientUpdateUxSmokeApplied: true,
        clientUpdateUxSmokeRecommendedFollowUp: false,
        pwaManifestIconCacheAuditApplied: true,
        pwaManifestIconCacheRecommendedFollowUp: false,
        runtimeCacheMaxEntries: SERVICE_WORKER_RUNTIME_CACHE_MAX_ENTRIES,
        runtimeCacheTtlMs: SERVICE_WORKER_RUNTIME_CACHE_TTL_MS,
        coverage: serviceWorkerCoverage
      },
      asyncFetch: {
        helperNames: FETCH_TIMEOUT_HELPERS.slice(),
        defaultTimeoutMs: FETCH_TIMEOUT_DEFAULT_MS,
        locations: clonePlain(FETCH_RESOURCE_LOCATIONS, 6),
        coverage: fetchTimeoutCoverage
      },
      summary: {
        knownDatabaseLocationCount: DATABASE_LOCATIONS.length,
        knownBroadcastChannelLocationCount: BROADCAST_CHANNEL_LOCATIONS.length,
        knownMutationObserverLocationCount: MUTATION_OBSERVER_LOCATIONS.length,
        knownFetchResourceLocationCount: FETCH_RESOURCE_LOCATIONS.length,
        inScopeFetchResourceLocationCount: fetchTimeoutCoverage.inScopeLocationCount,
        outOfScopeFetchResourceLocationCount: fetchTimeoutCoverage.outOfScopeLocationCount,
        knownServiceWorkerStrategyCount: SERVICE_WORKER_CACHE_STRATEGY_LOCATIONS.length,
        knownServiceWorkerOfflineUpdateFlowSmokeScenarioCount: SERVICE_WORKER_OFFLINE_UPDATE_FLOW_SMOKE_SCENARIOS.length,
        knownServiceWorkerVersionedShellCacheKeyLocationCount: SERVICE_WORKER_VERSIONED_SHELL_CACHE_KEY_LOCATIONS.length,
        knownServiceWorkerStaleCachePruningLocationCount: SERVICE_WORKER_STALE_CACHE_PRUNING_LOCATIONS.length,
        knownServiceWorkerClientLifecycleLocationCount: SERVICE_WORKER_CLIENT_LIFECYCLE_LOCATIONS.length,
        knownServiceWorkerClientUpdateUxLocationCount: SERVICE_WORKER_CLIENT_UPDATE_UX_LOCATIONS.length,
        knownPwaManifestIconCacheLocationCount: PWA_MANIFEST_ICON_CACHE_LOCATIONS.length,
        serviceWorkerNetworkFetchStrategyCount: serviceWorkerCoverage.networkFetchStrategyCount,
        missingDbCloseCount: closeCoverage.missingCloseIds.length,
        partialDbCloseCount: closeCoverage.partialCloseIds.length,
        fullDbCloseCount: closeCoverage.fullCloseIds.length,
        dbCloseCleanupComplete: closeCoverage.needsCleanup === false,
        allKnownDbCloseOperationsCovered: closeCoverage.needsCleanup === false,
        indexedDbCloseCleanupRecommended: closeCoverage.needsCleanup === true,
        callerDependentOpenFunctionCount: closeCoverage.callerDependentOpenFunctionIds.length,
        missingOnVersionChangeCount: onVersionChangeCoverage.missingIds.length,
        allKnownOnVersionChangeOpenersCovered: onVersionChangeCoverage.needsCleanup === false,
        onVersionChangeCleanupComplete: onVersionChangeCoverage.needsCleanup === false,
        onVersionChangeCleanupRecommended: onVersionChangeCoverage.needsCleanup === true,
        missingBroadcastCloseHandlerCount: broadcastCoverage.missingCloseHandlerIds.length,
        broadcastChannelLifecycleCleanupComplete: broadcastCoverage.needsCleanup === false,
        allKnownBroadcastChannelOwnersCovered: broadcastCoverage.needsCleanup === false,
        broadcastChannelLifecycleCleanupRecommended: broadcastCoverage.needsCleanup === true,
        missingMutationObserverDisconnectCount: mutationObserverCoverage.missingDisconnectIds.length,
        mutationObserverLifecycleCleanupComplete: mutationObserverCoverage.needsCleanup === false,
        mutationObserverScopeCleanupComplete: mutationObserverCoverage.scopeCleanupComplete === true,
        allKnownMutationObserversCovered: mutationObserverCoverage.needsCleanup === false,
        mutationObserverLifecycleCleanupRecommended: mutationObserverCoverage.needsCleanup === true,
        missingFetchTimeoutCount: fetchTimeoutCoverage.missingTimeoutIds.length,
        missingFetchErrorClassificationCount: fetchTimeoutCoverage.missingErrorClassificationIds.length,
        fetchTimeoutCleanupComplete: fetchTimeoutCoverage.needsCleanup === false,
        asyncFetchTimeoutCleanupComplete: fetchTimeoutCoverage.needsCleanup === false,
        serviceWorkerFetchesDeferred: fetchTimeoutCoverage.serviceWorkerFetchesDeferred === true,
        missingServiceWorkerTimeoutExemptionCount: serviceWorkerCoverage.missingTimeoutExemptionIds.length,
        missingServiceWorkerCacheStrategyPreservationCount: serviceWorkerCoverage.missingCacheStrategyPreservationIds.length,
        serviceWorkerTimeoutExemptionAuditComplete: serviceWorkerCoverage.allKnownServiceWorkerTimeoutExemptionsAudited === true,
        serviceWorkerFetchCacheStrategyAuditComplete: serviceWorkerCoverage.cacheStrategyAuditComplete === true,
        serviceWorkerFetchCacheStrategyCleanupRecommended: serviceWorkerCoverage.needsCleanup === true,
        serviceWorkerCacheStrategyPreserved: serviceWorkerCoverage.noCacheSemanticsChanges === true && serviceWorkerCoverage.noOfflineSemanticsChanges === true,
        serviceWorkerCacheFirstBackgroundRefreshPreserved: serviceWorkerCoverage.cacheFirstBackgroundRefreshPreserved === true,
        serviceWorkerCacheSemanticsChanged: serviceWorkerCoverage.changedCacheSemantics === true,
        serviceWorkerOfflineFallbacksChanged: serviceWorkerCoverage.changedOfflineFallbacks === true,
        serviceWorkerOfflineUpdateFlowSmokeDefined: serviceWorkerOfflineUpdateFlowSmokeCoverage.smokeToolDefined === true,
        serviceWorkerOfflineUpdateFlowSmokeComplete: serviceWorkerOfflineUpdateFlowSmokeCoverage.needsCleanup === false,
        serviceWorkerOfflineFallbackSmokeCovered: serviceWorkerOfflineUpdateFlowSmokeCoverage.offlineFallbackSmokeCovered === true,
        serviceWorkerUpdateFlowSmokeCovered: serviceWorkerOfflineUpdateFlowSmokeCoverage.updateFlowSmokeCovered === true,
        serviceWorkerBackgroundRefreshSmokeCovered: serviceWorkerOfflineUpdateFlowSmokeCoverage.backgroundRefreshSmokeCovered === true,
        serviceWorkerE2ESmokeUsesMockedCacheOnly: serviceWorkerOfflineUpdateFlowSmokeCoverage.smokeUsesMockedCacheApiOnly === true,
        serviceWorkerE2ESmokeStrategyPreserved: serviceWorkerOfflineUpdateFlowSmokeCoverage.noServiceWorkerStrategyChanges === true,
        serviceWorkerE2ESmokeCleanupRecommended: serviceWorkerOfflineUpdateFlowSmokeCoverage.needsCleanup === true,
        serviceWorkerVersionedShellCacheKeyFixComplete: serviceWorkerVersionedShellCacheKeyCoverage.needsCleanup === false,
        serviceWorkerVersionedShellCacheKeyPrecacheAndFetchConsistent: serviceWorkerVersionedShellCacheKeyCoverage.precacheAndFetchCacheKeysAligned === true,
        serviceWorkerVersionedShellCacheKeyE2ESmokeCovered: serviceWorkerVersionedShellCacheKeyCoverage.e2eOfflineHitCovered === true,
        serviceWorkerVersionedShellCacheKeyCleanupRecommended: serviceWorkerVersionedShellCacheKeyCoverage.needsCleanup === true,
        serviceWorkerStaleCachePruningAuditComplete: serviceWorkerStaleCachePruningCoverage.needsCleanup === false,
        serviceWorkerStaleShellCachePruneCovered: serviceWorkerStaleCachePruningCoverage.staleShellCachePruneCovered === true,
        serviceWorkerOldRuntimeCacheMigrationCovered: serviceWorkerStaleCachePruningCoverage.oldRuntimeCacheMigrationCovered === true,
        serviceWorkerCurrentRuntimeCachePreserved: serviceWorkerStaleCachePruningCoverage.currentRuntimeCachePreserved === true,
        serviceWorkerUnrelatedCachesPreserved: serviceWorkerStaleCachePruningCoverage.unrelatedCachesPreserved === true,
        serviceWorkerRuntimeCacheGrowthRiskAudited: serviceWorkerStaleCachePruningCoverage.runtimeCacheGrowthRiskAudited === true,
        serviceWorkerRuntimeCachePruningImplemented: serviceWorkerStaleCachePruningCoverage.runtimeCachePruningImplemented === true,
        serviceWorkerRuntimeCachePruningRecommendedFollowUp: serviceWorkerStaleCachePruningCoverage.runtimeCachePruningRecommendedFollowUp === true,
        serviceWorkerRuntimeCacheMetadataCovered: serviceWorkerStaleCachePruningCoverage.runtimeCacheMetadataCovered === true,
        serviceWorkerRuntimeCacheTtlPruneCovered: serviceWorkerStaleCachePruningCoverage.runtimeCacheTtlPruneCovered === true,
        serviceWorkerRuntimeCacheMaxEntryPruneCovered: serviceWorkerStaleCachePruningCoverage.runtimeCacheMaxEntryPruneCovered === true,
        serviceWorkerRuntimeCacheMaxEntries: SERVICE_WORKER_RUNTIME_CACHE_MAX_ENTRIES,
        serviceWorkerRuntimeCacheTtlMs: SERVICE_WORKER_RUNTIME_CACHE_TTL_MS,
        serviceWorkerStaleCachePruningCleanupRecommended: serviceWorkerStaleCachePruningCoverage.needsCleanup === true,
        serviceWorkerClientLifecycleAuditComplete: serviceWorkerClientLifecycleCoverage.needsCleanup === false,
        serviceWorkerClientLifecycleSingletonRegistrationCovered: serviceWorkerClientLifecycleCoverage.singletonRegistrationGuardCovered === true,
        serviceWorkerClientLifecycleUpdatefoundStatechangeDedupCovered: serviceWorkerClientLifecycleCoverage.updatefoundStatechangeListenerDedupCovered === true,
        serviceWorkerClientLifecycleDuplicateWaitingPromptGuardCovered: serviceWorkerClientLifecycleCoverage.duplicateWaitingPromptGuardCovered === true,
        serviceWorkerClientLifecycleControllerchangeReloadGuardCovered: serviceWorkerClientLifecycleCoverage.controllerchangeReloadGuardCovered === true,
        serviceWorkerClientLifecycleDocproLegacyDuplicateRegistrationRemoved: serviceWorkerClientLifecycleCoverage.docproLegacyDuplicateRegistrationRemoved === true,
        serviceWorkerClientLifecycleCacheBustingUpdated: serviceWorkerClientLifecycleCoverage.cacheBustingUpdated === true,
        serviceWorkerClientLifecycleAuditRegistersServiceWorker: serviceWorkerClientLifecycleCoverage.auditRegistersServiceWorker === true,
        serviceWorkerClientLifecycleCleanupRecommended: serviceWorkerClientLifecycleCoverage.needsCleanup === true,
        serviceWorkerClientUpdateUxSmokeComplete: serviceWorkerClientUpdateUxSmokeCoverage.needsCleanup === false,
        serviceWorkerClientUpdateUxBannerAccessibleSingletonCovered: serviceWorkerClientUpdateUxSmokeCoverage.bannerAccessibleSingletonCovered === true,
        serviceWorkerClientUpdateUxButtonLabelsCovered: serviceWorkerClientUpdateUxSmokeCoverage.bannerButtonLabelsCovered === true,
        serviceWorkerClientUpdateUxRefreshInteractionCovered: serviceWorkerClientUpdateUxSmokeCoverage.refreshSinglePostCovered === true,
        serviceWorkerClientUpdateUxDismissInteractionCovered: serviceWorkerClientUpdateUxSmokeCoverage.dismissNoSkipWaitingCovered === true,
        serviceWorkerClientUpdateUxReadOnlySnapshotCovered: serviceWorkerClientUpdateUxSmokeCoverage.readOnlySnapshotCovered === true,
        serviceWorkerClientUpdateUxSmokeUsesMockedDomOnly: serviceWorkerClientUpdateUxSmokeCoverage.smokeUsesMockedDomOnly === true,
        serviceWorkerClientUpdateUxCacheBustingUpdated: serviceWorkerClientUpdateUxSmokeCoverage.cacheBustingUpdated === true,
        serviceWorkerClientUpdateUxAuditRegistersServiceWorker: serviceWorkerClientUpdateUxSmokeCoverage.auditRegistersServiceWorker === true,
        serviceWorkerClientUpdateUxSmokeCleanupRecommended: serviceWorkerClientUpdateUxSmokeCoverage.needsCleanup === true,
        pwaManifestIconCacheAuditComplete: pwaManifestIconCacheCoverage.needsCleanup === false,
        pwaManifestStartUrlScopeCovered: pwaManifestIconCacheCoverage.startUrlScopeCovered === true,
        pwaManifestShortcutScopeCovered: pwaManifestIconCacheCoverage.shortcutScopeCovered === true,
        pwaManifestIconFilesMaterializedCovered: pwaManifestIconCacheCoverage.iconFilesMaterializedCovered === true,
        pwaManifestPwaOnlyIconDirectoryCovered: pwaManifestIconCacheCoverage.pwaOnlyIconDirectoryCovered === true,
        pwaManifestHtmlLinksCovered: pwaManifestIconCacheCoverage.htmlManifestLinksCovered === true,
        pwaManifestServiceWorkerIconCacheCovered: pwaManifestIconCacheCoverage.serviceWorkerIconCacheCovered === true,
        pwaManifestIconCacheSmokeCovered: pwaManifestIconCacheCoverage.smokeCovered === true,
        pwaManifestIconCacheSmokeUsesMockedOnly: pwaManifestIconCacheCoverage.smokeUsesMockedOnly === true,
        pwaManifestPwaOnlyIconDirectoryCovered: pwaManifestIconCacheCoverage.pwaOnlyIconDirectoryCovered === true,
        pwaManifestIconCacheCleanupRecommended: pwaManifestIconCacheCoverage.needsCleanup === true,
        allKnownServiceWorkerFetchesAudited: serviceWorkerCoverage.allKnownServiceWorkerFetchesAudited === true,
        allKnownServiceWorkerTimeoutExemptionsAudited: serviceWorkerCoverage.allKnownServiceWorkerTimeoutExemptionsAudited === true,
        fetchTimeoutCleanupRecommended: fetchTimeoutCoverage.needsCleanup === true,
        cleanupRecommended: closeCoverage.needsCleanup || onVersionChangeCoverage.needsCleanup || broadcastCoverage.needsCleanup || mutationObserverCoverage.needsCleanup || fetchTimeoutCoverage.needsCleanup || serviceWorkerCoverage.needsCleanup || serviceWorkerOfflineUpdateFlowSmokeCoverage.needsCleanup || serviceWorkerVersionedShellCacheKeyCoverage.needsCleanup || serviceWorkerStaleCachePruningCoverage.needsCleanup || serviceWorkerClientLifecycleCoverage.needsCleanup || serviceWorkerClientUpdateUxSmokeCoverage.needsCleanup || pwaManifestIconCacheCoverage.needsCleanup
      },
      recommendedCleanupPlan: includePlan ? clonePlain(RECOMMENDED_CLEANUP_PLAN, 5) : [],
      scope: {
        noClinicalFormulaChanges: true,
        noGhIgfImportExportChanges: true,
        noSyncPayloadChanges: true,
        noIndexedDbSchemaChanges: true,
        indexedDbCloseCleanupApplied: true,
        indexedDbOnVersionChangeCleanupApplied: true,
        indexedDbVersionChangeCleanupApplied: true,
        broadcastChannelLifecycleCleanupApplied: true,
        mutationObserverLifecycleCleanupApplied: true,
        mutationObserverScopeCleanupApplied: true,
        fetchTimeoutCleanupApplied: true,
        asyncFetchTimeoutCleanupApplied: true,
        serviceWorkerFetchCacheStrategyAuditApplied: true,
        serviceWorkerCacheStrategyAuditApplied: true,
        serviceWorkerTimeoutPolicyAudited: true,
        serviceWorkerTimeoutExemptionAuditApplied: true,
        serviceWorkerOfflineUpdateFlowSmokeApplied: true,
        serviceWorkerVersionedShellCacheKeyFixApplied: true,
        serviceWorkerVersionedShellCacheKeyAuditApplied: true,
        serviceWorkerStaleCachePruningAuditApplied: true,
        serviceWorkerStaleCachePruningSmokeCovered: true,
        serviceWorkerRuntimeCacheGrowthRiskAudited: true,
        serviceWorkerRuntimeCachePruningImplemented: true,
        serviceWorkerRuntimeCacheTtlPruningApplied: true,
        serviceWorkerRuntimeCacheMaxEntryPruningApplied: true,
        serviceWorkerClientLifecycleAuditApplied: true,
        serviceWorkerClientLifecycleCleanupApplied: true,
        serviceWorkerClientSingletonRegistrationGuardApplied: true,
        serviceWorkerClientControllerchangeReloadGuardApplied: true,
        serviceWorkerClientDuplicateDocproRegistrationRemoved: true,
        serviceWorkerClientUpdateUxSmokeApplied: true,
      pwaManifestIconCacheAuditApplied: true,
        serviceWorkerClientUpdateUxSmokeUsesMockedDomOnly: true,
        serviceWorkerClientUpdateUxSmokeRegistersServiceWorker: false,
        pwaManifestIconCacheAuditApplied: true,
        pwaManifestIconCacheSmokeUsesMockedOnly: true,
        pwaManifestIconCacheSmokeRegistersServiceWorker: false,
        serviceWorkerClientLifecycleAuditRegistersServiceWorker: false,
        serviceWorkerOfflineUpdateFlowSmokeUsesMockedCacheOnly: true,
        noServiceWorkerStrategyChangesInE2ESmoke: true,
        noServiceWorkerCacheSemanticsChanges: true,
        noServiceWorkerOfflineFallbackChanges: true,
        noIndexedDbCleanupYet: false,
        noIndexedDbOnVersionChangeCleanupYet: false,
        noBroadcastChannelCleanupYet: false,
        noMutationObserverCleanupYet: false,
        noFetchTimeoutCleanupYet: false,
        noServiceWorkerFetchCacheAuditYet: false,
        noServiceWorkerOfflineUpdateFlowSmokeYet: false,
        noServiceWorkerVersionedShellCacheKeyFixYet: false,
        noServiceWorkerStaleCachePruningAuditYet: false,
        noServiceWorkerRuntimeCachePruningYet: false,
        noServiceWorkerClientLifecycleAuditYet: false,
        noServiceWorkerClientUpdateUxSmokeYet: false,
        noPwaManifestIconCacheAuditYet: false
      }
    };
    return clonePlain(snapshot, 8);
  }

  function getApiSurfaceStatus() {
    return {
      step: STEP,
      version: VERSION,
      module: true,
      getSnapshot: true,
      getGHTherapyIndexedDbAuditSnapshot: true,
      getGHTherapyResourceAuditSnapshot: true,
      getServiceWorkerFetchCacheStrategySnapshot: true,
      getServiceWorkerFetchCacheStrategyAuditSnapshot: true,
      getServiceWorkerOfflineUpdateFlowSmokeSnapshot: true,
      getServiceWorkerVersionedShellCacheKeySnapshot: true,
      getServiceWorkerStaleCachePruningAuditSnapshot: true,
      getServiceWorkerRuntimeCachePruningSnapshot: true,
      getServiceWorkerClientLifecycleAuditSnapshot: true,
      getServiceWorkerClientUpdateUxSmokeSnapshot: true,
      getPwaManifestIconCacheSnapshot: true,
      readOnly: true,
      indexedDbCloseCleanupApplied: true,
      indexedDbOnVersionChangeCleanupApplied: true,
      indexedDbVersionChangeCleanupApplied: true,
      broadcastChannelLifecycleCleanupApplied: true,
      mutationObserverLifecycleCleanupApplied: true,
      mutationObserverScopeCleanupApplied: true,
      fetchTimeoutCleanupApplied: true,
      asyncFetchTimeoutCleanupApplied: true,
      serviceWorkerFetchCacheStrategyAuditApplied: true,
      serviceWorkerCacheStrategyAuditApplied: true,
      serviceWorkerTimeoutPolicyAudited: true,
      serviceWorkerTimeoutExemptionAuditApplied: true,
      serviceWorkerOfflineUpdateFlowSmokeApplied: true,
      serviceWorkerVersionedShellCacheKeyFixApplied: true,
      serviceWorkerVersionedShellCacheKeyAuditApplied: true,
      serviceWorkerStaleCachePruningAuditApplied: true,
      serviceWorkerRuntimeCacheGrowthRiskAudited: true,
      serviceWorkerRuntimeCachePruningImplemented: true,
      serviceWorkerClientLifecycleAuditApplied: true,
      serviceWorkerClientLifecycleCleanupApplied: true,
      serviceWorkerClientUpdateUxSmokeApplied: true,
      pwaManifestIconCacheAuditApplied: true
    };
  }

  function getServiceWorkerFetchCacheStrategySnapshot(options) {
    const snapshot = getSnapshot(Object.assign({}, options || {}, { includePlan: false }));
    return snapshot ? snapshot.serviceWorker : null;
  }

  function getServiceWorkerOfflineUpdateFlowSmokeSnapshot(options) {
    const serviceWorker = getServiceWorkerFetchCacheStrategySnapshot(options || {});
    return serviceWorker ? serviceWorker.offlineUpdateFlowSmoke : null;
  }


  function getServiceWorkerVersionedShellCacheKeySnapshot(options) {
    const serviceWorker = getServiceWorkerFetchCacheStrategySnapshot(options || {});
    return serviceWorker ? serviceWorker.versionedShellCacheKey : null;
  }

  function getServiceWorkerStaleCachePruningAuditSnapshot(options) {
    const serviceWorker = getServiceWorkerFetchCacheStrategySnapshot(options || {});
    return serviceWorker ? serviceWorker.staleCachePruning : null;
  }

  function getServiceWorkerRuntimeCachePruningSnapshot(options) {
    const serviceWorker = getServiceWorkerFetchCacheStrategySnapshot(options || {});
    return serviceWorker ? serviceWorker.runtimeCachePruning : null;
  }

  function getServiceWorkerClientLifecycleAuditSnapshot(options) {
    const serviceWorker = getServiceWorkerFetchCacheStrategySnapshot(options || {});
    return serviceWorker ? serviceWorker.clientLifecycle : null;
  }


  function getServiceWorkerClientUpdateUxSmokeSnapshot(options) {
    const serviceWorker = getServiceWorkerFetchCacheStrategySnapshot(options || {});
    return serviceWorker ? serviceWorker.clientUpdateUxSmoke : null;
  }

  function getPwaManifestIconCacheSnapshot(options) {
    const serviceWorker = getServiceWorkerFetchCacheStrategySnapshot(options || {});
    return serviceWorker ? serviceWorker.pwaManifestIconCache : null;
  }

  const api = {
    __vildaGhTherapyResourceAuditModule: true,
    VERSION,
    version: VERSION,
    STEP,
    DB_NAME,
    DB_VERSION,
    STORE_NAME,
    CHANNEL_NAME,
    MUTATION_OBSERVER_TARGET_IDS,
    FETCH_TIMEOUT_HELPERS,
    FETCH_TIMEOUT_DEFAULT_MS,
    SERVICE_WORKER_VERSION,
    SERVICE_WORKER_CACHE_PREFIX,
    SERVICE_WORKER_TIMEOUT_POLICY,
    SERVICE_WORKER_E2E_SMOKE_TOOL,
    SERVICE_WORKER_RUNTIME_CACHE_MAX_ENTRIES,
    SERVICE_WORKER_RUNTIME_CACHE_TTL_MS,
    SERVICE_WORKER_VERSIONED_SHELL_CACHE_KEY_LOCATIONS,
    SERVICE_WORKER_STALE_CACHE_PRUNING_LOCATIONS,
    SERVICE_WORKER_CLIENT_LIFECYCLE_LOCATIONS,
    SERVICE_WORKER_CLIENT_UPDATE_UX_LOCATIONS,
    PWA_MANIFEST_ICON_CACHE_LOCATIONS,
    getSnapshot,
    getGHTherapyIndexedDbAuditSnapshot: getSnapshot,
    getGHTherapyResourceAuditSnapshot: getSnapshot,
    getServiceWorkerFetchCacheStrategySnapshot,
    getServiceWorkerFetchCacheStrategyAuditSnapshot: getServiceWorkerFetchCacheStrategySnapshot,
    getServiceWorkerOfflineUpdateFlowSmokeSnapshot,
    getServiceWorkerVersionedShellCacheKeySnapshot,
    getServiceWorkerStaleCachePruningAuditSnapshot,
    getServiceWorkerRuntimeCachePruningSnapshot,
    getServiceWorkerClientLifecycleAuditSnapshot,
    getServiceWorkerClientUpdateUxSmokeSnapshot,
    getPwaManifestIconCacheSnapshot,
    getApiSurfaceStatus
  };

  global.VildaGHTherapyResourceAudit = api;
  global.vildaGetGHTherapyIndexedDbAuditSnapshot = function (options) { return api.getSnapshot(options || {}); };
  global.vildaGetGHTherapyResourceAuditSnapshot = function (options) { return api.getSnapshot(options || {}); };
  global.vildaGetServiceWorkerFetchCacheStrategyAuditSnapshot = function (options) { return api.getServiceWorkerFetchCacheStrategySnapshot(options || {}); };
  global.vildaGetServiceWorkerOfflineUpdateFlowSmokeSnapshot = function (options) { return api.getServiceWorkerOfflineUpdateFlowSmokeSnapshot(options || {}); };
  global.vildaGetServiceWorkerVersionedShellCacheKeySnapshot = function (options) { return api.getServiceWorkerVersionedShellCacheKeySnapshot(options || {}); };
  global.vildaGetServiceWorkerStaleCachePruningAuditSnapshot = function (options) { return api.getServiceWorkerStaleCachePruningAuditSnapshot(options || {}); };
  global.vildaGetServiceWorkerRuntimeCachePruningSnapshot = function (options) { return api.getServiceWorkerRuntimeCachePruningSnapshot(options || {}); };
  global.vildaGetServiceWorkerClientLifecycleAuditSnapshot = function (options) { return api.getServiceWorkerClientLifecycleAuditSnapshot(options || {}); };
  global.vildaGetServiceWorkerClientUpdateUxSmokeSnapshot = function (options) { return api.getServiceWorkerClientUpdateUxSmokeSnapshot(options || {}); };
  global.vildaGetPwaManifestIconCacheSnapshot = function (options) { return api.getPwaManifestIconCacheSnapshot(options || {}); };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
