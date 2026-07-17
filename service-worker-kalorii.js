/*
 * wagaiwzrost.pl — service worker PWA
 *
 * Priorytety tej wersji:
 * 1) aplikacja ma otwierać się natychmiast z cache,
 * 2) aktualizacja ma odświeżać zasoby w tle,
 * 3) nowy SW nadal czeka w stanie "waiting" aż użytkownik kliknie „Przeładuj”,
 * 4) unikamy oddawania nawigacji odpowiedzi oznaczonych jako redirected,
 *    co ogranicza ryzyko błędu WebKit/Chrome:
 *    "Response served by service worker has redirections".
 *
 * Najważniejsze zmiany względem poprzedniej wersji:
 * - nawigacja używa cache-first + background refresh,
 * - root aplikacji jest kanonizowany do /index.html (nie precache'ujemy '/'),
 * - runtime cache NIE jest wersjonowany, więc CDN-y i inne zasoby runtime
 *   nie znikają przy każdej publikacji nowej wersji,
 * - navigation preload jest wyłączony: tutaj nie daje realnej korzyści,
 *   bo i tak chcemy zwracać HTML z cache natychmiast.
 */

const SW_VERSION = '1.0.647';
const CACHE_PREFIX = 'pwa-kalorii';
const SHELL_CACHE = `${CACHE_PREFIX}-shell-v${SW_VERSION}`;
const RUNTIME_CACHE = `${CACHE_PREFIX}-runtime`;
const ACTIVE_CACHE_NAMES = new Set([SHELL_CACHE, RUNTIME_CACHE]);
const RUNTIME_CACHE_MAX_ENTRIES = 96;
const RUNTIME_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const RUNTIME_METADATA_CACHE_KEY_PREFIX = '/__vilda_runtime_cache_metadata__/';
const RUNTIME_METADATA_SCHEMA_VERSION = 1;
const ROOT_DOCUMENT = '/index.html';
const SW_FETCH_CACHE_STRATEGY_AUDIT = Object.freeze({
  step: '8O-11e',
  latestValidationStep: '8R-5b',
  latestVaultStep: '8R-5a-vault-with-import-and-merge',
  latestFileExportStep: '8R-4d-file-export-fsa-and-fallback-download',
  latestAuthUiStep: '8R-13-passkey-abort-controller',
  latestAppStep: '8R-13-pro-auto-results-mode',
  latestCryptoStep: '8R-1-vilda-crypto-aes-gcm-pbkdf2',
  latestHotfix: '8Q-4c1a-growth-source-default-olaf',
  latestAudit: '8Q-4b-klirens-quality-audit',
  latestAutosaveRestoreFix: '8Q-4b1-klirens-autosave-restore',
  latestClcrImportPreviewFix: '8Q-4c-klirens-import-preview-restore',
  latestClcrPreserveRestoredValuesFix: '8Q-4c1-klirens-preserve-restored-values',
  latestGrowthDefaultSourceFix: '8Q-4c1a-growth-source-default-olaf',
  latestClcrClosureSmoke: '8Q-4c2-klirens-smoke-closure',
  latestReorganizationStep: '8Q-9-estimated-intake-dom-mount',
  readOnly: true,
  navigation: 'cache-first-background-refresh',
  shellAssets: 'cache-first-background-refresh',
  runtime: 'cache-first-background-refresh',
  install: 'required-core-precache-optional-sequential-precache',
  activation: 'runtime-cache-migration-and-prune',
  timeoutPolicy: 'intentional-no-timeout-inside-service-worker-fetch-paths',
  bypassPolicy: 'range-video-videos-presentations',
  offlineUpdateFlowSmoke: 'tools/service_worker_offline_update_flow_smoke.js',
  offlineUpdateFlowSmokeExpected: true,
  versionedShellCacheKeyPolicy: 'precache-and-fetch-use-pathname-plus-search-for-versioned-shell-assets',
  versionedShellCacheKeyFixApplied: true,
  staleCachePruningAuditApplied: true,
  staleCachePruningAuditPolicy: 'audit-activate-prune-scope-and-runtime-cache-growth-risk-without-changing-cache-strategy',
  runtimeCachePruningImplemented: true,
  runtimeCachePruningRecommendedFollowUp: false,
  runtimeCachePruningPolicy: 'ttl-and-max-entry-prune-after-runtime-write-and-on-activate',
  runtimeCacheMaxEntries: RUNTIME_CACHE_MAX_ENTRIES,
  runtimeCacheTtlMs: RUNTIME_CACHE_TTL_MS,
  pwaManifestIconCacheAuditApplied: true,
  pwaManifestStartUrlPolicy: 'root-start-url-normalized-to-index-document',
  pwaManifestScopePolicy: 'root-scope-same-origin',
  pwaManifestShortcutScopeFixApplied: true,
  pwaManifestIconFilesMaterialized: true,
  pwaManifestIconDirectory: '/pwa-icons/',
  pwaManifestIconSource: 'uploaded-pwa-icons.zip',
  pwaLegacyIconsDirectoryUsed: false,
  pwaManifestIconsCached: true,
  pwaManifestMaskableIconCached: true,
  pwaManifestFaviconCacheCovered: true,
  pwaManifestBrowserIconCacheCovered: true,
  semanticsChanged: false
});

// Minimalny shell wymagany do natychmiastowego startu aplikacji z cache.
// Jeśli któregoś z tych plików nie uda się pobrać podczas instalacji nowego SW,
// nowa wersja NIE powinna zastępować starej.
const CORE_SHELL_URLS = [
  ROOT_DOCUMENT,
  '/manifest.json',
  '/style.css',
  '/style.css?v=54',
  '/style.css?v=55',
  '/style.css?v=56',
  '/style.css?v=57',
  '/style.css?v=39',
  '/style.css?v=40',
  '/style.css?v=41',
  '/style.css?v=42',
  '/style.css?v=43',
  '/style.css?v=44',
  '/style.css?v=45',
  '/style.css?v=46',
  '/style.css?v=47',
  '/style.css?v=48',
  '/style.css?v=49',
  '/style.css?v=50',
  '/style.css?v=51',
  '/style.css?v=52',
  '/style.css?v=53',
  '/lab_clinical_panels.js?v=141',
  // DEFER-P1c: bloki inline wyniesione do plików defer (39 szt.)
  '/inline_docpro_00.js?v=1',
  '/inline_docpro_01.js?v=1',
  '/inline_docpro_02.js?v=1',
  '/inline_docpro_03.js?v=1',
  '/inline_docpro_04.js?v=1',
  '/inline_docpro_04.js?v=2',
  '/inline_docpro_05.js?v=1',
  '/inline_docpro_06.js?v=1',
  '/inline_index_00.js?v=1',
  '/inline_index_01.js?v=1',
  '/inline_index_02.js?v=1',
  '/inline_index_02.js?v=2',
  '/inline_index_02.js?v=3',
  '/inline_index_03.js?v=1',
  '/inline_index_03.js?v=2',
  '/inline_index_03.js?v=3',
  '/inline_index_03.js?v=4',
  '/inline_index_04.js?v=1',
  '/inline_index_04.js?v=2',
  '/inline_index_04.js?v=3',
  '/inline_index_04.js?v=4',
  '/inline_index_04.js?v=5',
  '/inline_index_04.js?v=6',
  '/inline_index_04.js?v=7',
  '/inline_index_04.js?v=8',
  '/inline_index_04.js?v=9',
  '/inline_index_04.js?v=10',
  '/inline_index_04.js?v=11',
  '/inline_index_04.js?v=12',
  '/inline_index_04.js?v=13',
  '/inline_index_04.js?v=14',
  '/inline_index_04.js?v=15',
  '/inline_index_04.js?v=16',
  '/inline_index_04.js?v=17',
  '/inline_index_04.js?v=18',
  '/inline_index_04.js?v=19',
  '/inline_index_05.js?v=1',
  '/inline_index_06.js?v=1',
  '/inline_index_06.js?v=2',
  '/inline_index_07.js?v=1',
  '/inline_index_08.js?v=1',
  '/inline_index_09.js?v=1',
  '/inline_index_10.js?v=1',
  '/inline_kalkulator_klirens_00.js?v=1',
  '/inline_kalkulator_klirens_01.js?v=1',
  '/inline_kalkulator_klirens_02.js?v=1',
  '/inline_kalkulator_klirens_03.js?v=1',
  '/inline_kalkulator_klirens_04.js?v=1',
  '/inline_kalkulator_klirens_05.js?v=1',
  '/inline_kalkulator_klirens_06.js?v=1',
  '/inline_kalkulator_klirens_07.js?v=1',
  '/inline_kalkulator_klirens_07.js?v=2',
  '/inline_kalkulator_klirens_08.js?v=1',
  '/inline_kalkulator_klirens_09.js?v=1',
  '/inline_notatki_00.js?v=2',
  '/inline_notatki_00.js?v=3',
  '/inline_subskrypcja_00.js?v=1',
  '/inline_subskrypcja_00.js?v=2',
  '/inline_subskrypcja_01.js?v=1',
  '/inline_ustawienia_00.js?v=1',
  '/inline_ustawienia_01.js?v=1',
  '/inline_ustawienia_02.js?v=1',
  '/inline_ustawienia_03.js?v=1',
  '/inline_ustawienia_04.js?v=2',
  '/inline_ustawienia_04.js?v=3',
  '/inline_ustawienia_04.js?v=4',
  '/inline_ustawienia_04.js?v=5',
  '/inline_ustawienia_04.js?v=6',
  '/inline_ustawienia_04.js?v=7',
  '/inline_ustawienia_04.js?v=8',
  '/inline_ustawienia_04.js?v=9',
  '/inline_ustawienia_04.js?v=10',
  '/jsQR.min.js?v=1',
  '/inline_ustawienia_05.js?v=1',
  '/inline_ustawienia_06.js?v=1',
  '/inline_ustawienia_07.js?v=1',

  '/sidebar.css',
  '/vilda_chrome.css',
  '/vilda_chrome.css?v=2',
  '/vilda_chrome.css?v=3',
  '/vilda_chrome.css?v=4',
  '/vilda_chrome.css?v=5',
  '/vilda_chrome.css?v=6',
  '/vilda_chrome.css?v=7',
  '/vilda_chrome.js',
  '/vilda_chrome.js?v=2',
  '/vilda_chrome.js?v=3',
  '/vilda_chrome.js?v=4',
  '/vilda_chrome.js?v=5',
  '/vilda_chrome.js?v=6',
  '/vilda_chrome.js?v=7',
  '/ios26-v2.css',
  '/ios26-v2.css?v=10',
  '/ios26-v2.css?v=13',
  '/ios26-v2.css?v=14',
  '/ios26-v2.css?v=15',
  '/ios26-v2.css?v=16',
  '/ios26-v2.css?v=17',
  '/ios26-v2.css?v=18',
  '/ios26-v2.css?v=19',
  '/logo_vilda.jpeg',
  '/logo_vilda.webp',
  '/lucide.min.js?v=1',
  '/vilda_logger.js',
  '/vilda_logger.js?v=2',
  '/vilda_html.js',
  '/vilda_html.js?v=4',
  '/vilda_persistence_adapter.js',
  '/vilda_persistence_adapter.js?v=7',
  '/vilda_persistence_adapter.js?v=8',
  '/vilda_persistence_adapter.js?v=9',
  '/vilda_persistence_adapter.js?v=10',
  '/vilda_persistence_adapter.js?v=11',
  '/vilda_persistence_adapter.js?v=12',
  '/vilda_persistence_adapter.js?v=13',
  '/vilda_persistence_adapter.js?v=14',
  '/vilda_persistence_adapter.js?v=15',
  '/vilda_persistence_adapter.js?v=16',
  '/vilda_persistence_adapter.js?v=17',
  '/vilda_persistence_adapter.js?v=18',
  '/vilda_persistence_adapter.js?v=19',
  '/vilda_persistence_adapter.js?v=20',
  '/vilda_persistence_adapter.js?v=21',
  '/vilda_persistence_adapter.js?v=22',
  '/vilda_persistence_adapter.js?v=23',
  '/vilda_init.js',
  '/vilda_init.js?v=4',
  '/vilda_crypto.js',
  '/vilda_crypto.js?v=1',
  '/vilda_crypto.js?v=4',
  '/vilda_crypto.js?v=6',
  '/vilda_crypto.js?v=7',
  '/vilda_crypto.js?v=8',
  '/vilda_crypto.js?v=9',
  '/vilda_crypto.js?v=10',
  '/vilda_crypto.js?v=11',
  '/vilda_crypto.js?v=12',
  '/vilda_crypto.js?v=13',
  '/vilda_crypto.js?v=14',
  '/vilda_crypto.js?v=15',
  '/vilda_vault.js',
  '/vilda_vault.js?v=9',
  '/vilda_vault.js?v=10',
  '/vilda_vault.js?v=11',
  '/vilda_vault.js?v=12',
  '/vilda_vault.js?v=13',
  '/vilda_vault.js?v=14',
  '/vilda_vault.js?v=15',
  '/vilda_vault.js?v=16',
  '/vilda_vault.js?v=17',
  '/vilda_vault.js?v=18',
  '/vilda_vault.js?v=19',
  '/vilda_vault.js?v=20',
  '/vilda_vault.js?v=21',
  '/vilda_vault.js?v=22',
  '/vilda_vault.js?v=23',
  '/vilda_vault.js?v=24',
  '/vilda_vault.js?v=25',
  '/vilda_vault.js?v=26',
  '/vilda_vault.js?v=27',
  '/vilda_vault.js?v=28',
  '/vilda_vault.js?v=29',
  '/vilda_vault.js?v=30',
  '/vilda_vault.js?v=31',
  '/vilda_vault.js?v=32',
  '/vilda_vault.js?v=33',
  '/vilda_vault.js?v=34',
  '/vilda_vault.js?v=35',
  '/vilda_vault.js?v=36',
  '/vilda_vault.js?v=37',
  '/vilda_vault.js?v=38',
  '/vilda_vault.js?v=39',
  '/vilda_vault.js?v=40',
  '/vilda_vault.js?v=41',
  '/vilda_vault.js?v=42',
  '/vilda_vault.js?v=43',
  '/vilda_vault.js?v=44',
  '/vilda_vault.js?v=45',
  '/vilda_vault.js?v=46',
  '/vilda_vault.js?v=47',
  '/vilda_vault.js?v=48',
  '/vilda_vault.js?v=49',
  '/vilda_vault.js?v=50',
  '/vilda_vault.js?v=51',
  '/vilda_vault.js?v=52',
  '/vilda_vault.js?v=53',
  '/vilda_vault.js?v=54',
  '/vilda_vault.js?v=55',
  '/vilda_vault.js?v=56',
  '/vilda_vault.js?v=57',
  '/vilda_vault.js?v=58',
  '/vilda_vault.js?v=59',
  '/vilda_vault.js?v=60',
  '/vilda_vault.js?v=64',
  '/vilda_vault.js?v=65',
  '/vilda_vault.js?v=66',
  '/vilda_vault.js?v=67',
  '/vilda_vault.js?v=68',
  '/vilda_vault.js?v=69',
  '/vilda_vault.js?v=70',
  '/vilda_vault.js?v=71',
  '/vilda_vault.js?v=72',
  '/vilda_vault.js?v=73',
  '/vilda_vault.js?v=74',
  '/vilda_vault.js?v=75',
  '/vilda_vault.js?v=76',
  '/vilda_vault.js?v=77',
  '/vilda_vault.js?v=78',
  '/vilda_vault.js?v=79',
  '/vilda_vault.js?v=80',
  '/vilda_vault.js?v=81',
  '/vilda_vault.js?v=82',
  '/vilda_vault.js?v=83',
  '/vilda_vault.js?v=84',
  '/vilda_vault.js?v=85',
  '/vilda_vault.js?v=86',
  '/vilda_vault.js?v=87',
  '/vilda_vault.js?v=88',
  '/vilda_vault.js?v=89',
  '/vilda_vault.js?v=98',
  '/vilda_vault.js?v=99',
  '/vilda_vault.js?v=100',
  '/vilda_vault.js?v=101',
  '/vilda_vault.js?v=102',
  '/vilda_vault.js?v=103',
  '/vilda_vault.js?v=104',
  '/vilda_vault.js?v=105',
  '/vilda_vault.js?v=106',
  '/vilda_vault.js?v=107',
  '/vilda_vault.js?v=108',
  '/vilda_vault.js?v=109',
  '/vilda_vault.js?v=110',
  '/vilda_vault.js?v=111',
  '/vilda_vault.js?v=112',
  '/vilda_vault.js?v=113',
  '/vilda_vault.js?v=114',
  '/vilda_vault.js?v=115',
  '/vilda_vault.js?v=116',
  '/vilda_vault.js?v=117',
  '/vilda_vault.js?v=118',
  '/vilda_vault.js?v=119',
  '/vilda_vault.js?v=123',
  '/vilda_vault.js?v=124',
  '/vilda_vault.js?v=125',
  '/vilda_vault.js?v=126',
  '/vilda_vault.js?v=127',
  '/vilda_vault.js?v=128',
  '/vilda_vault.js?v=129',
  '/vilda_vault.js?v=130',
  '/vilda_vault.js?v=131',
  '/vilda_vault.js?v=132',
  '/vilda_vault.js?v=133',
  '/vilda_vault.js?v=134',
  '/vilda_vault.js?v=135',
  '/vilda_vault.js?v=136',
  '/vilda_vault.js?v=137',
  '/vilda_vault.js?v=138',
  '/vilda_vault.js?v=139',
  '/vilda_vault.js?v=140',
  '/vilda_vault.js?v=141',
  '/vilda_vault.js?v=142',
  '/vilda_vault.js?v=143',
  '/vilda_vault.js?v=144',
  '/vilda_vault.js?v=145',
  '/vilda_vault.js?v=146',
  '/vilda_vault.js?v=147',
  '/vilda_vault.js?v=148',
  '/vilda_vault.js?v=149',
  '/vilda_vault.js?v=150',
  '/vilda_vault.js?v=151',
  '/vilda_vault.js?v=152',
  '/vilda_vault.js?v=153',
  '/vilda_vault.js?v=154',
  '/vilda_vault.js?v=155',
  '/vilda_vault.js?v=156',
  '/vilda_vault.js?v=157',
  '/vilda_vault.js?v=158',
  '/vilda_retention.js?v=1',
  '/vilda_auth_ui.js',
  '/vilda_auth_ui.js?v=16',
  '/vilda_auth_ui.js?v=17',
  '/vilda_auth_ui.js?v=18',
  '/vilda_auth_ui.js?v=24',
  '/vilda_auth_ui.js?v=25',
  '/vilda_auth_ui.js?v=26',
  '/vilda_auth_ui.js?v=27',
  '/vilda_auth_ui.js?v=28',
  '/vilda_auth_ui.js?v=29',
  '/vilda_auth_ui.js?v=30',
  '/vilda_auth_ui.js?v=31',
  '/vilda_auth_ui.js?v=32',
  '/vilda_auth_ui.js?v=33',
  '/vilda_auth_ui.js?v=34',
  '/vilda_auth_ui.js?v=35',
  '/vilda_auth_ui.js?v=36',
  '/vilda_auth_ui.js?v=37',
  '/vilda_auth_ui.js?v=38',
  '/vilda_auth_ui.js?v=39',
  '/vilda_auth_ui.js?v=44',
  '/vilda_auth_ui.js?v=45',
  '/vilda_auth_ui.js?v=46',
  '/vilda_auth_ui.js?v=47',
  '/vilda_auth_ui.js?v=48',
  '/vilda_auth_ui.js?v=49',
  '/vilda_auth_ui.js?v=50',
  '/vilda_auth_ui.js?v=51',
  '/vilda_auth_ui.js?v=52',
  '/vilda_auth_ui.js?v=53',
  '/vilda_auth_ui.js?v=60',
  '/vilda_auth_ui.js?v=61',
  '/vilda_auth_ui.js?v=62',
  '/vilda_auth_ui.js?v=63',
  '/vilda_auth_ui.js?v=64',
  '/vilda_auth_ui.js?v=65',
  '/vilda_auth_ui.js?v=66',
  '/vilda_auth_ui.js?v=67',
  '/vilda_auth_ui.js?v=68',
  '/vilda_auth_ui.js?v=69',
  '/vilda_auth_ui.js?v=70',
  '/vilda_auth_ui.js?v=71',
  '/vilda_auth_ui.js?v=72',
  '/vilda_auth_ui.js?v=73',
  '/vilda_auth_ui.js?v=74',
  '/vilda_auth_ui.js?v=75',
  '/vilda_auth_ui.js?v=76',
  '/vilda_auth_ui.js?v=77',
  '/vilda_auth_ui.js?v=78',
  '/vilda_auth_ui.js?v=79',
  '/vilda_auth_ui.js?v=80',
  '/vilda_auth_ui.js?v=81',
  '/vilda_auth_ui.js?v=82',
  '/vilda_auth_ui.js?v=83',
  '/vilda_auth_ui.js?v=84',
  '/vilda_auth_ui.js?v=85',
  '/vilda_auth_ui.js?v=86',
  '/vilda_auth_ui.js?v=87',
  '/vilda_auth_ui.js?v=88',
  '/vilda_auth_ui.js?v=89',
  '/vilda_auth_ui.js?v=90',
  '/vilda_auth_ui.js?v=91',
  '/vilda_auth_ui.js?v=92',
  '/vilda_auth_ui.js?v=93',
  '/vilda_auth_ui.js?v=94',
  '/vilda_auth_ui.js?v=95',
  '/vilda_auth_ui.js?v=96',
  '/vilda_auth_ui.js?v=97',
  '/vilda_auth_ui.js?v=98',
  '/vilda_auth_ui.js?v=99',
  '/vilda_auth_ui.js?v=100',
  '/vilda_auth_ui.js?v=101',
  '/vilda_auth_ui.js?v=102',
  '/vilda_auth_ui.js?v=103',
  '/vilda_auth_ui.js?v=104',
  '/vilda_auth_ui.js?v=105',
  '/vilda_auth_ui.js?v=106',
  '/vilda_auth_ui.js?v=107',
  '/vilda_auth_ui.js?v=108',
  '/vilda_auth_ui.js?v=109',
  '/vilda_auth_ui.js?v=110',
  '/vilda_auth_ui.js?v=111',
  '/vilda_auth_ui.js?v=112',
  '/vilda_auth_ui.js?v=113',
  '/vilda_auth_ui.js?v=114',
  '/vilda_auth_ui.js?v=115',
  '/vilda_auth_ui.js?v=116',
  '/vilda_auth_ui.js?v=117',
  '/vilda_auth_ui.js?v=118',
  '/vilda_auth_ui.js?v=129',
  '/vilda_auth_ui.js?v=130',
  '/vilda_auth_ui.js?v=131',
  '/vilda_auth_ui.js?v=132',
  '/vilda_auth_ui.js?v=133',
  '/vilda_auth_ui.js?v=134',
  '/vilda_auth_ui.js?v=135',
  '/vilda_auth_ui.js?v=136',
  '/vilda_auth_ui.js?v=137',
  '/vilda_auth_ui.js?v=138',
  '/vilda_auth_ui.js?v=139',
  '/vilda_auth_ui.js?v=140',
  '/vilda_auth_ui.js?v=141',
  '/vilda_auth_ui.js?v=142',
  '/vilda_auth_ui.js?v=143',
  '/vilda_auth_ui.js?v=145',
  '/vilda_auth_ui.js?v=146',
  '/vilda_auth_ui.js?v=147',
  '/vilda_auth_ui.js?v=148',
  '/vilda_auth_ui.js?v=149',
  '/vilda_auth_ui.js?v=150',
  '/vilda_auth_ui.js?v=151',
  '/vilda_auth_ui.js?v=152',
  '/vilda_auth_ui.js?v=153',
  '/vilda_auth_ui.js?v=154',
  '/vilda_auth_ui.js?v=155',
  '/vilda_auth_ui.js?v=156',
  '/vilda_auth_ui.js?v=157',
  '/vilda_auth_ui.js?v=158',
  '/vilda_auth_ui.js?v=159',
  '/vilda_auth_ui.js?v=160',
  '/vilda_auth_ui.js?v=161',
  '/vilda_auth_ui.js?v=162',
  '/vilda_auth_ui.js?v=163',
  '/vilda_auth_ui.js?v=164',
  '/vilda_auth_ui.js?v=165',
  '/vilda_auth_ui.js?v=166',
  '/vilda_auth_ui.js?v=167',
  '/vilda_auth_ui.js?v=168',
  '/vilda_auth_ui.js?v=169',
  '/vilda_auth_ui.js?v=170',
  '/vilda_auth_ui.js?v=171',
  '/vilda_auth_ui.js?v=172',
  '/vilda_auth_ui.js?v=173',
  '/vilda_auth_ui.js?v=174',
  '/vilda_auth_ui.js?v=175',
  '/vilda_auth_ui.js?v=176',
  '/vilda_auth_ui.js?v=177',
  '/vilda_auth_ui.js?v=178',
  '/vilda_auth_ui.js?v=179',
  '/vilda_auth_ui.js?v=180',
  '/vilda_auth_ui.js?v=181',
  '/vilda_auth_ui.js?v=182',
  '/vilda_auth_ui.js?v=183',
  '/vilda_auth_ui.js?v=184',
  '/vilda_auth_ui.js?v=185',
  '/vilda_auth_ui.js?v=186',
  '/vilda_auth_ui.js?v=187',
  '/vilda_auth_ui.js?v=217',
  '/vilda_auth_ui.js?v=218',
  '/vilda_auth_ui.js?v=219',
  '/vilda_audit_log.js?v=1',
  '/vilda_auth_ui.js?v=220',
  '/vilda_auth_ui.js?v=221',
  '/vilda_auth_ui.js?v=222',
  '/vilda_auth_ui.js?v=223',
  '/vilda_auth_ui.js?v=224',
  '/vilda_auth_ui.js?v=225',
  '/vilda_auth_ui.js?v=226',
  '/vilda_auth_ui.js?v=227',
  '/vilda_auth_ui.js?v=228',
  '/vilda_auth_ui.js?v=229',
  '/vilda_auth_ui.js?v=230',
  '/vilda_auth_ui.js?v=231',
  '/vilda_auth_ui.js?v=232',
  '/vilda_auth_ui.js?v=233',
  '/vilda_auth_ui.js?v=234',
  '/vilda_auth_ui.js?v=235',
  '/vilda_auth_ui.js?v=236',
  '/vilda_auth_ui.js?v=237',
  '/vilda_auth_ui.js?v=238',
  '/vilda_auth_ui.js?v=239',
  '/vilda_auth_ui.js?v=240',
  '/vilda_auth_ui.js?v=241',
  '/vilda_auth_ui.js?v=242',
  '/vilda_auth_ui.js?v=243',
  '/vilda_auth_ui.js?v=244',
  '/vilda_auth_ui.js?v=245',
  '/vilda_auth_ui.js?v=246',
  '/vilda_auth_ui.js?v=247',
  '/vilda_auth_ui.js?v=248',
  '/vilda_auth_ui.js?v=249',
  '/vilda_auth_ui.js?v=250',
  '/vilda_auth_ui.js?v=251',
  '/vilda_auth_ui.js?v=252',
  '/vilda_auth_ui.js?v=253',
  '/vilda_auth_ui.js?v=254',
  '/vilda_auth_ui.js?v=255',
  '/vilda_auth_ui.js?v=256',
  '/vilda_auth_ui.js?v=257',
  '/vilda_auth_ui.js?v=258',
  '/vilda_auth_ui.js?v=259',
  '/vilda_auth_ui.js?v=260',
  '/vilda_auth_ui.js?v=261',
  '/vilda_auth_ui.js?v=262',
  '/vilda_auth_ui.js?v=263',
  '/vilda_auth_ui.js?v=264',
  '/vilda_auth_ui.js?v=265',
  '/vilda_auth_ui.js?v=266',
  '/vilda_auth_ui.js?v=267',
  '/vilda_auth_ui.js?v=268',
  '/vilda_auth_ui.js?v=269',
  '/vilda_auth_ui.js?v=270',
  '/vilda_auth_ui.js?v=271',
  '/vilda_auth_ui.js?v=272',
  '/vilda_auth_ui.js?v=273',
  '/vilda_auth_ui.js?v=274',
  '/vilda_auth_ui.js?v=275',
  '/vilda_auth_ui.js?v=276',
  '/vilda_auth_ui.js?v=285',
  '/vilda_auth_ui.js?v=286',
  '/vilda_auth_ui.js?v=287',
  '/vilda_auth_ui.js?v=288',
  '/vilda_auth_ui.js?v=289',
  '/vilda_auth_ui.js?v=290',
  '/vilda_auth_ui.js?v=291',
  '/vilda_auth_ui.js?v=292',
  '/vilda_auth_ui.js?v=293',
  '/vilda_auth_ui.js?v=294',
  '/vilda_auth_ui.js?v=295',
  '/vilda_auth_ui.js?v=296',
  '/vilda_auth_ui.js?v=297',
  '/vilda_auth_ui.js?v=298',
  '/vilda_auth_ui.js?v=299',
  '/vilda_auth_ui.js?v=300',
  '/vilda_auth_ui.js?v=301',
  '/vilda_auth_ui.js?v=302',
  '/vilda_auth_ui.js?v=303',
  '/vilda_auth_ui.js?v=304',
  '/vilda_auth_ui.js?v=305',
  '/vilda_auth_ui.js?v=306',
  '/vilda_auth_ui.js?v=307',
  '/vilda_auth_ui.js?v=308',
  '/vilda_auth_ui.js?v=309',
  '/vilda_auth_ui.js?v=310',
  '/vilda_auth_ui.js?v=311',
  '/vilda_auth_ui.js?v=312',
  '/vilda_auth_ui.js?v=313',
  '/vilda_auth_ui.js?v=314',
  '/vilda_auth_ui.js?v=315',
  '/vilda_auth_ui.js?v=316',
  '/vilda_auth_ui.js?v=317',
  '/vilda_auth_ui.js?v=318',
  '/vilda_auth_ui.js?v=319',
  '/vilda_auth_ui.js?v=320',
  '/vilda_auth_ui.js?v=321',
  '/vilda_auth_ui.js?v=322',
  '/vilda_auth_ui.js?v=323',
  '/vilda_auth_ui.js?v=324',
  '/vilda_auth_ui.js?v=325',
  '/vilda_auth_ui.js?v=326',
  '/vilda_auth_ui.js?v=327',
  '/vilda_auth_ui.js?v=328',
  '/vilda_auth_ui.js?v=329',
  '/vilda_auth_ui.js?v=330',
  '/vilda_auth_ui.js?v=331',
  '/vilda_auth_ui.js?v=332',
  '/vilda_auth_ui.js?v=333',
  '/vilda_auth_ui.js?v=334',
  '/vilda_auth_ui.js?v=335',
  '/vilda_auth_ui.js?v=336',
  '/vilda_auth_ui.js?v=337',
  '/vilda_auth_ui.js?v=338',
  '/vilda_auth_ui.js?v=339',
  '/vilda_auth_ui.js?v=340',
  '/vilda_auth_ui.js?v=341',
  '/vilda_auth_ui.js?v=342',
  '/vilda_auth_ui.js?v=343',
  '/vilda_auth_ui.js?v=344',
  '/vilda_auth_ui.js?v=345',
  '/vilda_auth_ui.js?v=346',
  '/vilda_auth_ui.js?v=347',
  '/vilda_auth_ui.js?v=348',
  '/vilda_auth_ui.js?v=349',
  '/vilda_auth_ui.js?v=350',
  '/vilda_auth_ui.js?v=351',
  '/vilda_auth_ui.js?v=352',
  '/vilda_auth_ui.js?v=353',
  '/vilda_auth_ui.js?v=354',
  '/vilda_auth_ui.js?v=355',
  '/vilda_auth_ui.js?v=356',
  '/vilda_auth_ui.js?v=357',
  '/vilda_auth_ui.js?v=358',
  '/vilda_auth_ui.js?v=359',
  '/vilda_auth_ui.js?v=360',
  '/vilda_auth_ui.js?v=361',
  '/vilda_auth_ui.js?v=362',
  '/vilda_auth_ui.js?v=363',
  '/vilda_growth_prediction_validation.js?v=1',
  '/vilda_growth_prediction_validation.js?v=2',
  '/vilda_growth_prediction_validation.js?v=3',
  '/vilda_growth_prediction_validation.js?v=4',
  '/vilda_growth_prediction_validation.js?v=5',
  '/vilda_patient_summary_copy.js?v=1',
  '/vilda_patient_summary_copy.js?v=2',
  '/vilda_version_history_ui.js?v=1',
  '/vilda_version_history_ui.js?v=2',
  '/vilda_version_history_ui.js?v=3',
  '/vilda_version_history_ui.js?v=4',
  '/vilda_version_history_ui.js?v=5',
  '/vilda_version_history_ui.js?v=6',
  '/vilda_version_history_ui.js?v=7',
  '/vilda_version_history_ui.js?v=8',
  '/vilda_version_history_ui.js?v=9',
  '/vilda_version_history_ui.js?v=10',
  '/vilda_version_history_ui.js?v=11',
  '/vilda_version_history_ui.js?v=12',
  '/qrcode.min.js?v=1',
  '/vilda_chrome.js?v=8',
  '/vilda_chrome.js?v=11',
  '/vilda_chrome.js?v=12',
  '/vilda_chrome.js?v=13',
  '/vilda_chrome.js?v=14',
  '/vilda_chrome.js?v=15',
  '/vilda_chrome.js?v=16',
  '/vilda_chrome.js?v=17',
  '/vilda_chrome.js?v=18',
  '/vilda_chrome.js?v=19',
  '/vilda_chrome.js?v=20',
  '/vilda_chrome.js?v=21',
  '/vilda_chrome.js?v=22',
  '/vilda_chrome.js?v=23',
  '/vilda_chrome.js?v=24',
  '/vilda_chrome.js?v=25',
  '/vilda_chrome.js?v=26',
  '/vilda_chrome.js?v=27',
  '/vilda_chrome.js?v=28',
  '/vilda_chrome.js?v=29',
  '/vilda_chrome.js?v=31',
  '/vilda_chrome.js?v=32',
  '/vilda_chrome.js?v=33',
  '/vilda_chrome.js?v=34',
  '/vilda_chrome.js?v=35',
  '/vilda_chrome.js?v=36',
  '/vilda_chrome.js?v=37',
  '/vilda_chrome.js?v=38',
  '/vilda_chrome.js?v=39',
  '/vilda_chrome.js?v=40',
  '/vilda_chrome.js?v=41',
  '/vilda_chrome.js?v=42',
  '/vilda_chrome.js?v=43',
  '/vilda_chrome.js?v=44',
  '/vilda_chrome.js?v=45',
  '/vilda_chrome.js?v=46',
  '/vilda_chrome.js?v=47',
  '/vilda_chrome.js?v=48',
  '/vilda_chrome.js?v=49',
  '/vilda_chrome.js?v=50',
  '/vilda_chrome.js?v=53',
  '/vilda_chrome.js?v=54',
  '/vilda_chrome.js?v=55',
  '/vilda_chrome.js?v=56',
  '/vilda_chrome.js?v=57',
  '/vilda_chrome.js?v=58',
  '/vilda_chrome.js?v=59',
  '/vilda_chrome.js?v=60',
  '/vilda_chrome.js?v=61',
  '/vilda_chrome.js?v=62',
  '/vilda_chrome.js?v=63',
  '/vilda_chrome.js?v=64',
  '/vilda_chrome.js?v=65',
  '/vilda_chrome.js?v=66',
  '/vilda_chrome.js?v=67',
  '/vilda_chrome.js?v=68',
  '/vilda_chrome.js?v=69',
  '/vilda_realtime.js?v=1',
  '/vilda_realtime.js?v=2',
  '/vilda_realtime.js?v=3',
  '/vilda_realtime.js?v=4',
  '/vilda_realtime.js?v=5',
  '/vilda_realtime.js?v=6',
  '/vilda_terminarz.js?v=1',
  '/vilda_terminarz.js?v=2',
  '/vilda_terminarz.js?v=3',
  '/vilda_terminarz.js?v=4',
  '/vilda_terminarz.js?v=5',
  '/vilda_terminarz.js?v=6',
  '/vilda_terminarz.js?v=7',
  '/vilda_terminarz.js?v=8',
  '/vilda_terminarz.js?v=9',
  '/vilda_terminarz.js?v=10',
  '/vilda_terminarz.js?v=11',
  '/vilda_terminarz.js?v=12',
  '/vilda_terminarz.js?v=13',
  '/vilda_terminarz.js?v=14',
  '/vilda_terminarz.js?v=15',
  '/vilda_terminarz.js?v=16',
  '/vilda_terminarz.js?v=17',
  '/vilda_terminarz.js?v=18',
  '/vilda_terminarz.js?v=19',
  '/vilda_terminarz.js?v=20',
  '/vilda_terminarz.js?v=21',
  '/vilda_terminarz.js?v=22',
  '/vilda_terminarz.js?v=23',
  '/vilda_terminarz.js?v=24',
  '/vilda_terminarz.js?v=25',
  '/vilda_terminarz.js?v=26',
  '/vilda_terminarz.js?v=27',
  '/vilda_terminarz.js?v=28',
  '/vilda_terminarz.js?v=29',
  '/vilda_terminarz.js?v=30',
  '/vilda_terminarz.js?v=31',
  '/vilda_terminarz.js?v=32',
  '/vilda_terminarz.js?v=33',
  '/vilda_terminarz.js?v=34',
  '/vilda_terminarz.js?v=35',
  '/vilda_terminarz.js?v=36',
  '/vilda_terminarz.js?v=37',
  '/vilda_terminarz.js?v=38',
  '/vilda_terminarz.js?v=39',
  '/vilda_terminarz.js?v=40',
  '/vilda_terminarz.js?v=41',
  '/vilda_terminarz.js?v=42',
  '/vilda_terminarz.js?v=43',
  '/vilda_terminarz.js?v=44',
  '/vilda_terminarz.js?v=45',
  '/vilda_terminarz.js?v=46',
  '/vilda_terminarz.js?v=47',
  '/vilda_terminarz.js?v=48',
  '/vilda_terminarz.js?v=49',
  '/vilda_terminarz.js?v=50',
  '/vilda_terminarz.js?v=51',
  '/vilda_terminarz.js?v=52',
  '/vilda_terminarz.js?v=53',
  '/vilda_terminarz.js?v=54',
  '/vilda_terminarz.js?v=55',
  '/vilda_terminarz.js?v=56',
  '/vilda_terminarz.js?v=57',
  '/vilda_terminarz.js?v=58',
  '/vilda_terminarz.js?v=59',
  '/vilda_terminarz.js?v=60',
  '/vilda_terminarz.js?v=61',
  '/vilda_terminarz.js?v=62',
  '/vilda_terminarz.js?v=63',
  '/vilda_terminarz.js?v=64',
  '/vilda_terminarz.js?v=65',
  '/vilda_terminarz.js?v=66',
  '/vilda_terminarz.js?v=67',
  '/vilda_terminarz.js?v=68',
  '/vilda_terminarz.js?v=69',
  '/vilda_terminarz.js?v=70',
  '/vilda_terminarz.js?v=71',
  '/vilda_terminarz.js?v=72',
  '/vilda_terminarz.js?v=73',
  '/vilda_terminarz.js?v=74',
  '/vilda_terminarz.js?v=75',
  '/vilda_terminarz.js?v=86',
  '/vilda_terminarz.js?v=87',
  '/vilda_terminarz.js?v=88',
  '/vilda_terminarz.js?v=89',
  '/vilda_terminarz.js?v=90',
  '/vilda_terminarz.js?v=111',
  '/vilda_terminarz.js?v=112',
  '/vilda_terminarz.js?v=113',
  '/vilda_terminarz.js?v=114',
  '/vilda_terminarz.js?v=115',
  '/vilda_terminarz.js?v=116',
  '/vilda_terminarz.js?v=117',
  '/vilda_terminarz.js?v=118',
  '/vilda_terminarz.js?v=119',
  '/vilda_terminarz.js?v=120',
  '/vilda_terminarz.js?v=121',
  '/vilda_terminarz.js?v=122',
  '/vilda_terminarz.js?v=123',
  '/vilda_terminarz.js?v=124',
  '/vilda_terminarz.js?v=125',
  '/vilda_terminarz.js?v=126',
  '/vilda_terminarz.js?v=127',
  '/vilda_terminarz.js?v=128',
  '/vilda_terminarz.js?v=129',
  '/vilda_terminarz.js?v=130',
  '/vilda_terminarz.js?v=131',
  '/vilda_terminarz.js?v=132',
  '/vilda_terminarz.js?v=133',
  '/vilda_terminarz.js?v=134',
  '/vilda_terminarz.js?v=135',
  '/vilda_terminarz.js?v=136',
  '/vilda_terminarz.js?v=137',
  '/vilda_terminarz.js?v=138',
  '/vilda_terminarz.js?v=139',
  '/vilda_terminarz.js?v=140',
  '/vilda_terminarz.js?v=141',
  '/vilda_terminarz.js?v=142',
  '/vilda_terminarz.js?v=143',
  '/vilda_terminarz.js?v=144',
  '/vilda_terminarz.js?v=145',
  '/vilda_terminarz.js?v=146',
  '/vilda_terminarz.js?v=147',
  '/vilda_terminarz.js?v=148',
  '/vilda_terminarz.js?v=149',
  '/vilda_terminarz.js?v=150',
  '/vilda_terminarz.js?v=151',
  '/vilda_terminarz.js?v=152',
  '/vilda_terminarz.js?v=153',
  '/vilda_terminarz.js?v=154',
  '/vilda_terminarz.js?v=155',
  '/vilda_terminarz.js?v=156',
  '/vilda_terminarz.js?v=161',
  '/vilda_terminarz.js?v=162',
  '/vilda_terminarz.js?v=163',
  '/vilda_terminarz.js?v=164',
  '/vilda_terminarz.js?v=165',
  '/vilda_terminarz.js?v=166',
  '/vilda_terminarz.js?v=167',
  '/vilda_terminarz.js?v=168',
  '/vilda_terminarz.js?v=169',
  '/vilda_terminarz.js?v=170',
  '/vilda_terminarz.js?v=171',
  '/vilda_terminarz.js?v=172',
  '/vilda_terminarz.js?v=173',
  '/vilda_terminarz.js?v=174',
  '/vilda_terminarz.js?v=175',
  '/vilda_terminarz.js?v=176',
  '/vilda_terminarz.js?v=177',
  '/vilda_terminarz.js?v=178',
  '/vilda_terminarz.js?v=179',
  '/vilda_chrome.css?v=11',
  '/vilda_chrome.css?v=12',
  '/vilda_chrome.css?v=15',
  '/vilda_chrome.css?v=16',
  '/vilda_chrome.css?v=17',
  '/vilda_chrome.css?v=18',
  '/vilda_chrome.css?v=19',
  '/vilda_chrome.css?v=20',
  '/vilda_chrome.css?v=21',
  '/vilda_chrome.css?v=22',
  '/vilda_chrome.css?v=23',
  '/vilda_chrome.css?v=24',
  '/vilda_chrome.css?v=25',
  '/vilda_chrome.css?v=26',
  '/vilda_chrome.css?v=27',
  '/vilda_chrome.css?v=28',
  '/vilda_chrome.css?v=29',
  '/vilda_chrome.css?v=30',
  '/vilda_chrome.css?v=31',
  '/vilda_chrome.css?v=32',
  '/vilda_chrome.css?v=33',
  '/vilda_chrome.css?v=34',
  '/vilda_chrome.css?v=35',
  '/vilda_auth_ui.css',
  '/vilda_auth_ui.css?v=9',
  '/vilda_auth_ui.css?v=10',
  '/vilda_auth_ui.css?v=11',
  '/vilda_auth_ui.css?v=16',
  '/vilda_auth_ui.css?v=17',
  '/vilda_auth_ui.css?v=21',
  '/vilda_auth_ui.css?v=22',
  '/vilda_auth_ui.css?v=23',
  '/vilda_auth_ui.css?v=24',
  '/vilda_auth_ui.css?v=25',
  '/vilda_auth_ui.css?v=26',
  '/vilda_auth_ui.css?v=27',
  '/vilda_auth_ui.css?v=28',
  '/vilda_auth_ui.css?v=29',
  '/vilda_auth_ui.css?v=30',
  '/vilda_auth_ui.css?v=31',
  '/vilda_auth_ui.css?v=32',
  '/vilda_auth_ui.css?v=34',
  '/vilda_auth_ui.css?v=35',
  '/vilda_auth_ui.css?v=36',
  '/vilda_auth_ui.css?v=37',
  '/vilda_auth_ui.css?v=38',
  '/vilda_auth_ui.css?v=39',
  '/vilda_auth_ui.css?v=40',
  '/vilda_auth_ui.css?v=41',
  '/vilda_auth_ui.css?v=42',
  '/vilda_auth_ui.css?v=43',
  '/vilda_auth_ui.css?v=44',
  '/vilda_auth_ui.css?v=45',
  '/vilda_auth_ui.css?v=46',
  '/vilda_auth_ui.css?v=47',
  '/vilda_auth_ui.css?v=48',
  '/vilda_auth_ui.css?v=49',
  '/vilda_auth_ui.css?v=50',
  '/vilda_auth_ui.css?v=51',
  '/vilda_auth_ui.css?v=52',
  '/vilda_auth_ui.css?v=53',
  '/vilda_auth_ui.css?v=55',
  '/vilda_auth_ui.css?v=56',
  '/vilda_auth_ui.css?v=57',
  '/vilda_auth_ui.css?v=58',
  '/vilda_auth_ui.css?v=59',
  '/vilda_auth_ui.css?v=60',
  '/vilda_auth_ui.css?v=61',
  '/vilda_auth_ui.css?v=62',
  '/vilda_auth_ui.css?v=63',
  '/vilda_file_export.js',
  '/vilda_file_export.js?v=4',
  '/vilda_file_export.js?v=5',
  '/vilda_file_export.js?v=6',
  '/vilda_file_export.js?v=7',
  '/vilda_deps.js',
  '/vilda_deps.js?v=87',
  '/vilda_deps.js?v=89',
  '/vilda_deps.js?v=90',
  '/vilda_deps.js?v=91',
  '/vilda_update_hooks.js',
  '/vilda_update_hooks.js?v=7',
  '/vilda_centile_chart_header.js',
  '/vilda_centile_chart_header.js?v=1',
  '/vilda_gh_therapy_resource_audit.js',
  '/vilda_gh_therapy_resource_audit.js?v=31',
  '/vilda_app_helpers.js',
  '/vilda_app_helpers.js?v=2',
  '/vilda_food_data.js',
  '/vilda_food_data.js?v=1',
  '/vilda_macro_practice.js',
  '/vilda_macro_practice.js?v=2',
  '/vilda_activity_burn.js',
  '/vilda_activity_burn.js?v=1',
  '/vilda_food_summary.js',
  '/vilda_food_summary.js?v=2',
  '/vilda_data_import_export.js',
  '/vilda_data_import_export.js?v=18',
  '/vilda_data_import_export.js?v=19',
  '/vilda_data_import_export.js?v=21',
  '/vilda_data_import_export.js?v=22',
  '/vilda_data_import_export.js?v=25',
  '/vilda_data_import_export.js?v=26',
  '/vilda_data_import_export.js?v=28',
  '/vilda_data_import_export.js?v=29',
  '/vilda_data_import_export.js?v=30',
  '/vilda_data_import_export.js?v=31',
  '/vilda_data_import_export.js?v=32',
  '/vilda_data_import_export.js?v=33',
  '/vilda_data_import_export.js?v=34',
  '/vilda_data_import_export.js?v=35',
  '/vilda_data_import_export.js?v=36',
  '/vilda_data_import_export.js?v=37',
  '/vilda_data_import_export.js?v=38',
  '/vilda_data_import_export.js?v=39',
  '/vilda_data_import_export.js?v=40',
  '/vilda_data_import_export.js?v=41',
  '/vilda_data_import_export.js?v=42',
  '/vilda_data_import_export.js?v=43',
  '/vilda_data_import_export.js?v=44',
  '/vilda_data_import_export.js?v=45',
  '/vilda_data_import_export.js?v=46',
  '/vilda_data_import_export.js?v=47',
  '/vilda_data_import_export.js?v=48',
  '/vilda_data_import_export.js?v=49',
  '/vilda_data_import_export.js?v=50',
  '/vilda_data_import_export.js?v=51',
  '/vilda_data_import_export.js?v=52',
  '/vilda_tab_guard.js?v=1',
  '/vilda_tab_guard.js?v=2',
  '/vilda_tab_guard.js?v=3',
  '/vilda_tab_guard.js?v=4',
  '/vilda_tab_guard.js?v=5',
  '/vilda_advanced_growth.js',
  '/vilda_advanced_growth.js?v=16',
  '/vilda_advanced_growth.js?v=17',
  '/vilda_advanced_growth.js?v=18',
  '/vilda_estimated_intake.js',
  '/vilda_estimated_intake.js?v=3',
  '/vilda_growth_reference_data.js',
  '/vilda_growth_reference_data.js?v=1',
  '/vilda_professional_module.js',
  '/vilda_professional_module.js?v=2',
  '/vilda_professional_module.js?v=3',
  '/vilda_professional_module.js?v=4',
  '/vilda_persist_runtime.js',
  '/vilda_persist_runtime.js?v=2',
  '/vilda_persist_runtime.js?v=3',
  '/vilda_persist_runtime.js?v=4',
  '/vilda_persist_runtime.js?v=5',
  '/vilda_persist_runtime.js?v=6',
  '/vilda_persist_runtime.js?v=7',
  '/vilda_persist_runtime.js?v=8',
  '/vilda_persist_runtime.js?v=9',
  '/vilda_persist_runtime.js?v=10',
  '/vilda_persist_runtime.js?v=11',
  '/vilda_persist_runtime.js?v=12',
  '/vilda_summary_cards.js',
  '/vilda_summary_cards.js?v=2',
  '/vilda_summary_cards.js?v=3',
  '/vilda_summary_cards.js?v=4',
  '/vilda_summary_cards.js?v=5',
  '/vilda_summary_cards.js?v=6',
  '/vilda_summary_cards.js?v=7',
  '/vilda_summary_cards.js?v=8',
  '/vilda_summary_cards.js?v=9',
  '/vilda_summary_cards.js?v=10',
  '/vilda_summary_cards.js?v=11',
  '/vilda_summary_cards.js?v=12',
  '/vilda_summary_cards.js?v=13',
  '/vilda_summary_cards.js?v=14',
  '/vilda_summary_cards.js?v=15',
  '/vilda_summary_cards.js?v=16',
  '/vilda_summary_cards.js?v=17',
  '/vilda_summary_cards.js?v=18',
  '/vilda_summary_cards.js?v=19',
  '/vilda_diet_plan_ui.js',
  '/vilda_diet_plan_ui.js?v=1',
  '/vilda_estimated_intake_ui.js',
  '/vilda_estimated_intake_ui.js?v=1',
  '/vilda_estimated_intake_runtime.js',
  '/vilda_estimated_intake_runtime.js?v=1',
  '/vilda_estimated_intake_input_model.js',
  '/vilda_estimated_intake_input_model.js?v=1',
  '/vilda_estimated_intake_dom_mount.js',
  '/vilda_estimated_intake_dom_mount.js?v=1',
  '/vilda_update_prep.js',
  '/vilda_update_prep.js?v=62',
  '/vilda_update_prep.js?v=63',
  '/vilda_update_prep.js?v=64',
  '/vilda_update_prep.js?v=65',
  '/app.js',
  '/app.js?v=173',
  '/app.js?v=174',
  '/app.js?v=175',
  '/app.js?v=178',
  '/app.js?v=179',
  '/app.js?v=181',
  '/app.js?v=182',
  '/app.js?v=183',
  '/app.js?v=184',
  '/app.js?v=185',
  '/app.js?v=186',
  '/app.js?v=187',
  '/app.js?v=188',
  '/vilda_terms_gate.js?v=1',
  '/vilda_save_status_indicator.js',
  '/vilda_save_status_indicator.js?v=17',
  '/vilda_save_status_indicator.js?v=18',
  '/vilda_save_status_indicator.js?v=19',
  '/vilda_save_status_indicator.js?v=20',
  '/vilda_save_status_indicator.js?v=21',
  '/vilda_save_status_indicator.js?v=22',
  '/vilda_save_status_indicator.js?v=23',
  '/vilda_save_status_indicator.js?v=24',
  '/vilda_unsaved_guard.js?v=1',
  '/vilda_unsaved_guard.js?v=2',
  '/vilda_unsaved_guard.js?v=3',
  '/vilda_diet_recommendations.js',
  '/vilda_diet_recommendations.js?v=3',
  '/vilda_diet_recommendations.js?v=4',
  '/vilda_patient_report.js',
  '/vilda_patient_report.js?v=4',
  '/vilda_patient_report.js?v=5',
  '/nutrition_norms.js',
  '/nutrition_norms.js?v=41',
  '/nutrition_micros.js',
  '/nutrition_micros.js?v=25',
  '/nutrition_micros.js?v=26',
  '/adult_vitals.js',
  '/adult_vitals.js?v=5',
  '/ds_lms.js',
  '/vilda_down_syndrome.js',
  '/vilda_down_syndrome.js?v=1',
  '/vilda_anorexia_risk.js',
  '/vilda_anorexia_risk.js?v=1',
  '/centile_data.js',
  '/bayley_pinneau_data.js',
  '/rwt_data.js',
  '/reinehr_cdgp_data.js',
  '/advanced_growth_kowd.js',
  '/vitalSigns.js',
  '/gh_igf_therapy.js',
  '/gh_igf_therapy.js?v=8',
  '/gh_igf_therapy.js?v=9',
  '/gh_igf_therapy.js?v=10',
  '/gh_igf_therapy.js?v=11',
  '/gh_igf_therapy.js?v=12',
  '/gh_igf_therapy.js?v=13',
  '/gh_igf_therapy.js?v=14',
  '/gh_igf_therapy.js?v=15',
  '/gh_igf_therapy.js?v=16',
  '/gh_igf_therapy.js?v=17',
  '/gh_igf_therapy.js?v=18',
  '/gh_igf_therapy.js?v=19',
  '/gh_igf_therapy.js?v=20',
  '/gh_igf_therapy.js?v=21',
  '/gh_igf_therapy.js?v=22',
  '/gh_igf_therapy.js?v=23',
  '/antibiotic_therapy.js',
  '/antibiotic_therapy.js?v=10',
  '/antibiotic_therapy.js?v=11',
  '/antibiotic_therapy.js?v=12',
  '/userData.js',
  '/userData.js?v=6',
  '/ios26-ui.js',
  '/ios26-ui.js?v=18',
  '/ios26-ui.js?v=19',
  '/ios26-ui.js?v=20',
  '/ios26-ui.js?v=21',
  '/ios26-ui.js?v=22',
  '/ios26-ui.js?v=23',
  '/ios26-ui.js?v=24',
  '/ios26-ui.js?v=25',
  '/ios26-ui.js?v=26',
  '/ios26-ui.js?v=27',
  '/ios26-ui.js?v=28',
  '/ios26-ui.js?v=29',
  '/ios26-ui.js?v=30',
  '/ios26-ui.js?v=31',
  '/ios26-ui.js?v=32',
  '/ios26-ui.js?v=33',
  '/ios26-ui.js?v=34',
  '/ios26-ui.js?v=35',
  '/ios26-ui.js?v=36',
  '/ios26-ui.js?v=37',
  '/ios26-ui.js?v=38',
  '/ios26-ui.js?v=39',
  '/ios26-ui.js?v=40',
  '/tutorial.js?v=6',
  '/tutorial.js?v=7',
  '/tutorial.js?v=8',
  '/bp_module.js',
  '/bp_module.js?v=4',
  '/circumference_module.js',
  '/circumference_module.js?v=13',
  '/respiratory_module.js',
  '/respiratory_module.js?v=3',
  '/sga_intergrowth_data.js',
  '/custom-fixes.js',
  '/custom-fixes.js?v=13',
  '/custom-fixes.js?v=19',
  '/custom-fixes.js?v=21',
  '/custom-fixes.js?v=22',
  '/custom-fixes.js?v=23',
  '/custom-fixes.js?v=24',
  '/custom-fixes.js?v=25',
  '/custom-fixes.js?v=26',
  '/custom-fixes.js?v=27',
  '/custom-fixes.js?v=28',
  '/custom-fixes.js?v=29',
  '/custom-fixes.js?v=30',
  '/custom-fixes.js?v=31',
  '/custom-fixes.js?v=32',
  '/custom-fixes.js?v=33',
  '/custom-fixes.js?v=34',
  '/custom-fixes.js?v=35',
  '/custom-fixes.js?v=36',
  '/custom-fixes.js?v=37',
  '/custom-fixes.js?v=38',
  '/custom-fixes.js?v=39',
  '/custom-fixes.js?v=40',
  '/custom-fixes.js?v=41',
  '/custom-fixes.js?v=42',
  '/custom-fixes.js?v=43',
  '/custom-fixes.js?v=44',
  '/custom-fixes.js?v=45',
  '/custom-fixes.js?v=46',
  '/custom-fixes.js?v=47',
  '/custom-fixes.js?v=48',
  '/custom-fixes.js?v=49',
  '/custom-fixes.js?v=50',
  '/custom-fixes.js?v=51',
  '/custom-fixes.js?v=52',
  '/custom-fixes.js?v=53',
  '/custom-fixes.js?v=54',
  '/custom-fixes.js?v=55',
  '/custom-fixes.js?v=56',
  '/custom-fixes.js?v=57',
  '/reposition.js',
  '/reposition.js?v=5',
  '/growth-basic-module.js?v=8',
  '/vilda_pro_access.js',
  '/vilda_pro_access.js?v=1',
  '/vilda_pro_access.js?v=2',
  '/vilda_pro_access.js?v=3',
  '/vilda_pro_access.js?v=4',
  '/vilda_pro_access.js?v=5',
  '/vilda_pro_access.js?v=6',
  '/vilda_pro_access.js?v=7',
  '/vilda_pro_access.js?v=8',
  '/vilda_pro_access.js?v=9',
  '/vilda_pro_access.js?v=10',
  '/vilda_pro_ui.js',
  '/vilda_pro_ui.js?v=1',
  '/vilda_pro_ui.js?v=2',
  '/vilda_pro_ui.js?v=3'
];

// Dodatkowe strony i zasoby próbujemy dociągnąć w tle podczas instalacji,
// ale ich brak nie może zablokować bezpiecznego wdrożenia nowej wersji SW.
const OPTIONAL_DOCUMENTS = [
  '/docpro.html',
  '/homa-ir.html',
  '/instrukcja.html',
  '/kalkulator-klirens.html',
  '/kontakt.html',
  '/materialy-edukacyjne.html',
  '/o-aplikacji.html',
  '/steroidy.html',
  '/ustawienia.html',
  '/cukrzyca.html',
  '/omnitrope-instrukcja.html',
  '/genotropin-instrukcja.html',
  '/ngenla-instrukcja.html',
  '/przelicznik-doposilkowy-instrukcja.html',
  '/subskrypcja.html',
  '/notatki.html',
  '/terminarz.html',
  '/przelicznik-jednostek.html',
  '/lab_pin_result.js',
  '/app.html'
];

const OPTIONAL_ASSETS = [
  '/cukrzyca.js',
  '/cukrzyca.js?v=29',
  '/gh_therapy_monitor.js',
  '/gh_therapy_monitor.js?v=13',
  '/gh_therapy_monitor.js?v=14',
  '/gh_therapy_monitor.js?v=15',
  '/gh_therapy_monitor.js?v=16',
  '/gh_therapy_monitor.js?v=17',
  '/gh_therapy_monitor.js?v=18',
  '/gh_therapy_monitor.js?v=19',
  '/gh_therapy_monitor.js?v=20',
  '/gh_therapy_monitor.js?v=21',
  '/gh_therapy_monitor.js?v=22',
  '/gh_therapy_monitor.js?v=23',
  '/gh_therapy_monitor.js?v=24',
  '/gh_therapy_monitor.js?v=25',
  '/gh_therapy_monitor.js?v=26',
  '/gh_therapy_monitor.js?v=27',
  '/gh_therapy_monitor.js?v=28',
  '/gh_therapy_monitor.js?v=29',
  '/gh_therapy_monitor.js?v=30',
  '/gh_therapy_monitor.js?v=31',
  '/gh_therapy_monitor.js?v=32',
  '/gh_therapy_monitor.js?v=33',
  '/gh_therapy_monitor.js?v=34',
  '/gh_therapy_monitor.js?v=35',
  '/gh_therapy_monitor.js?v=36',
  '/gh_therapy_monitor.js?v=37',
  '/gh_therapy_monitor.js?v=38',
  '/flu_therapy.js',
  '/flu_therapy.js?v=5',
  '/bisphos_therapy.js',
  '/bisphos_therapy.js?v=4',
  '/bisphos_therapy.js?v=5',
  '/bisphos_therapy.js?v=6',
  '/bisphos_therapy_monitor.js',
  '/bisphos_therapy_monitor.js?v=1',
  '/bisphos_therapy_monitor.js?v=2',
  '/bisphos_therapy_monitor.js?v=3',
  '/vilda_module_monitor_badges.js',
  '/vilda_module_monitor_badges.js?v=1',
  '/thyroid_cancer_kids.js',
  '/thyroid_cancer_kids.js?v=4',
  '/hypertension_therapy.js',
  '/hypertension_therapy.js?v=4',
  '/obesity_therapy.js',
  '/obesity_therapy.js?v=4',
  '/obesity_therapy.js?v=5',
  '/obesity_therapy.js?v=6',
  '/obesity_therapy.js?v=7',
  '/obesity_therapy.js?v=8',
  '/obesity_therapy.js?v=9',
  '/obesity_therapy_monitor.js',
  '/obesity_therapy_monitor.js?v=1',
  '/obesity_therapy_monitor.js?v=2',
  '/obesity_therapy_monitor.js?v=3',
  '/obesity_therapy_monitor.js?v=4',
  '/obesity_therapy_monitor.js?v=5',
  '/obesity_therapy_monitor.js?v=6',
  '/obesity_therapy_monitor.js?v=7',
  '/obesity_therapy_monitor.js?v=8',
  '/obesity_therapy_monitor.js?v=9',
  '/obesity_therapy_monitor.js?v=10',
  '/obesity_therapy_monitor.js?v=11',
  '/obesity_therapy_monitor.js?v=12',
  '/obesity_therapy_monitor.js?v=13',
  '/obesity_therapy_monitor.js?v=14',
  '/obesity_response_criteria.js',
  '/obesity_response_criteria.js?v=1',
  '/gh_therapy_segments.js',
  '/gh_therapy_segments.js?v=1',
  '/gh_therapy_segments.js?v=2',
  '/gh_therapy_segments.js?v=3',
  '/sga_intergrowth_data.js',
  '/sga_malewski_data.js',
  '/sga_birth_module.js',
  '/sga_birth_module.js?v=7',
  '/sga_birth_module.js?v=8',
  '/sga_birth_module.js?v=9',
  '/docpro_state_persist.js',
  '/docpro_state_persist.js?v=4',
  '/docpro_state_persist.js?v=5',
  '/lab_units_data.js',
  '/lab_units_data.js?v=1',
  '/lab_units_data.js?v=35',
  '/lab_unit_converter.js',
  '/lab_unit_converter.js?v=1',
  '/lab_unit_converter.js?v=4',
  '/klirens.xlsx',
  '/zscore_przyklad_palczewska.xlsx',
  '/zscore_przyklad_olaf.xlsx',
  '/macro_examples_dictionary_pl.json',
  '/macro_ui_copy_pl.json',
  '/micronorms_norms.json',
  '/micronorms_ul.json',
  '/micronorms_safe_levels.json',
  '/micronorms_quicksets.json',
  '/normy-02.01.pdf',
  '/thyroid_neck_levels_pl.png',
  '/IMG_8041.JPG',
  '/edu-video-ui.css',
  '/posters/omnitrope_poster.png',
  '/posters/genotropin_poster.png',
  '/posters/ngenla_poster.png',
  '/posters/przelicznik_doposilkowy_poster.png',
  '/pwa-icons/icon-40x40.png',
  '/pwa-icons/icon-48x48.png',
  '/pwa-icons/icon-58x58.png',
  '/pwa-icons/icon-60x60.png',
  '/pwa-icons/icon-72x72.png',
  '/pwa-icons/icon-76x76.png',
  '/pwa-icons/icon-80x80.png',
  '/pwa-icons/icon-87x87.png',
  '/pwa-icons/icon-96x96.png',
  '/pwa-icons/icon-114x114.png',
  '/pwa-icons/icon-120x120.png',
  '/pwa-icons/icon-128x128.png',
  '/pwa-icons/icon-136x136.png',
  '/pwa-icons/icon-144x144.png',
  '/pwa-icons/icon-152x152.png',
  '/pwa-icons/icon-167x167.png',
  '/pwa-icons/icon-180x180.png',
  '/pwa-icons/icon-192x192.png',
  '/pwa-icons/icon-256x256.png',
  '/pwa-icons/icon-384x384.png',
  '/pwa-icons/icon-512x512-maskable.png',
  '/pwa-icons/icon-512x512.png',
  '/pwa-icons/icon-1024x1024.png',
  '/vilda_crypto_strength_explainer.js',
  '/vilda_crypto_strength_explainer.js?v=1',
  '/vilda_crypto_strength_explainer.js?v=2',
  '/vilda_crypto_strength_explainer.js?v=3',
  '/vilda_crypto_strength_explainer.js?v=4',
  '/vilda_crypto_strength_explainer.js?v=5',
  '/vilda_crypto_strength_explainer.js?v=6',
  '/vilda_shell.js',
  '/vilda_shell.js?v=1',
  '/vilda_shell.js?v=2',
  '/vilda_shell.js?v=3',
  '/vilda_shell.js?v=4',
  '/vilda_shell.js?v=5',
  '/vilda_shell.js?v=6',
  '/vilda_shell.js?v=7',
  '/vilda_shell.js?v=8',
  '/vilda_shell.js?v=9',
  '/vilda_shell.js?v=10',
  '/vilda_shell.js?v=11',
  '/vilda_shell.js?v=12',
  '/vilda_shell.js?v=13',
  '/vilda_shell.js?v=14',
  '/vilda_shell.js?v=15',
  '/vilda_shell.js?v=16',
  '/vilda_shell.js?v=17',
  '/vilda_shell.js?v=18',
  '/vilda_shell.js?v=19',
  '/vilda_shell.js?v=20',
  '/vilda_shell.js?v=21',
  '/vilda_shell.js?v=22',
  '/vilda_shell.js?v=23',
  '/vilda_shell.js?v=24',
  '/vilda_shell.js?v=25',
  '/vilda_shell.js?v=26',
  '/vilda_shell.js?v=27',
  '/vilda_shell.js?v=28',
  '/vilda_shell.js?v=29',
  '/vilda_shell.js?v=30',
  '/vilda_shell.js?v=31',
  '/vilda_shell.js?v=32',
  '/vilda_shell.js?v=33',
  '/vilda_shell.js?v=34',
  '/vilda_shell.js?v=35',
  '/vilda_shell.js?v=36',
  '/vilda_shell.js?v=40',
  '/vilda_shell.js?v=41',
  '/vilda_shell.js?v=42',
  '/vilda_shell.js?v=43',
  '/vilda_shell.js?v=44',
  '/vilda_shell.js?v=45',
  '/vilda_shell.js?v=46',
  '/vilda_shell.js?v=47',
  '/vilda_shell.js?v=48',
  '/vilda_shell.js?v=49',
  '/vilda_shell.js?v=50',
  '/vilda_shell.js?v=51',
  '/vilda_shell.js?v=52',
  '/vilda_shell.js?v=53',
  '/vilda_shell.css',
  '/vilda_shell.css?v=1',
  '/vilda_shell.css?v=2',
  '/vilda_shell.css?v=3',
  '/vilda_shell.css?v=4',
  '/vilda_shell.css?v=5',
  '/vilda_shell.css?v=6',
  '/vilda_shell.css?v=7',
  '/vilda_shell.css?v=10',
  '/vilda_shell.css?v=11',
  '/vilda_shell.css?v=12',
  '/vilda_save_status_indicator.css?v=4',
  '/vilda_frame_sync.js',
  '/vilda_frame_sync.js?v=1',
  '/vilda_frame_sync.js?v=2'
];

const PRECACHE_URLS = [...new Set([...CORE_SHELL_URLS, ...OPTIONAL_DOCUMENTS, ...OPTIONAL_ASSETS])];
const DOCUMENT_PATHS = new Set([ROOT_DOCUMENT, ...OPTIONAL_DOCUMENTS]);
const SHELL_PATHS = new Set(
  PRECACHE_URLS
    .map((url) => {
      try {
        return new URL(url, self.location.origin).pathname;
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean)
);

// ── PWA-SUBPATH (2026-06-05): aplikacja na GitHub Pages żyje pod /vilda-calc/,
// a cały SW (precache, klucze cache, DOCUMENT_PATHS) myśli w przestrzeni „/x".
// Most: wejściowe pathname requestów są OD-skopowane do przestrzeni aplikacji
// (unscopePathname: '/vilda-calc/app.js' → '/app.js'), a wychodzące fetche
// precache DO-skopowane do realnego URL-a (scopeHref: '/app.js?v=1' →
// https://host/vilda-calc/app.js?v=1). Na hostingu z roota SCOPE_PATH==='/'
// i obie funkcje są neutralne — zero zmiany zachowania lokalnie.
const SCOPE_BASE = new URL('./', self.location);
const SCOPE_PATH = SCOPE_BASE.pathname;
function unscopePathname(pathname) {
  if (SCOPE_PATH !== '/' && typeof pathname === 'string' && pathname.startsWith(SCOPE_PATH)) {
    return '/' + pathname.slice(SCOPE_PATH.length);
  }
  return pathname;
}
function scopeHref(appUrl) {
  return new URL(String(appUrl).replace(/^\//, ''), SCOPE_BASE).href;
}

function toURL(input) {
  try {
    return typeof input === 'string'
      ? new URL(input, self.location.origin)
      : new URL(input.url, self.location.origin);
  } catch (_) {
    return null;
  }
}

function isHttpRequest(request) {
  const url = toURL(request);
  return !!url && (url.protocol === 'http:' || url.protocol === 'https:');
}

function isSameOrigin(input) {
  const url = toURL(input);
  return !!url && url.origin === self.location.origin;
}

function getPathname(input) {
  const url = toURL(input);
  // PWA-SUBPATH: porównania działają w przestrzeni aplikacji („/x").
  return url ? unscopePathname(url.pathname) : '';
}

function normalizeNavigationPath(pathname) {
  if (!pathname || pathname === '/') return ROOT_DOCUMENT;

  if (DOCUMENT_PATHS.has(pathname)) return pathname;

  if (pathname.endsWith('/')) {
    const withoutTrailingSlash = pathname.slice(0, -1);
    const htmlCandidate = `${withoutTrailingSlash}.html`;
    if (DOCUMENT_PATHS.has(htmlCandidate)) return htmlCandidate;
  }

  if (!pathname.endsWith('.html')) {
    const htmlCandidate = `${pathname}.html`;
    if (DOCUMENT_PATHS.has(htmlCandidate)) return htmlCandidate;
  }

  return pathname;
}

function isNavigationRequest(request) {
  return request.mode === 'navigate';
}

function shouldBypassCache(request) {
  const pathname = getPathname(request);

  // R-3/W-7 AUDYT TERMINARZA (2026-07-13): żądania do workera synchronizacji
  // NIGDY nie przechodzą przez cache SW (runtime cache ma TTL 30 dni!) — statusy,
  // ETagi, szyfrogramy blobów i entitlement muszą być zawsze świeże. Dotąd
  // chronił wyłącznie nagłówek Cache-Control: no-store z workera (jedna warstwa);
  // ten bypass to druga, niezależna. UWAGA: przy przejściu na własną domenę
  // workera (plan P4) dopisać ją tutaj.
  try {
    const reqHost = new URL(request.url).hostname;
    if (reqHost.endsWith('.workers.dev')) return true;
  } catch (_) { /* niepoprawny URL → dalej standardowe reguły */ }

  if (request.headers.has('range')) return true;
  if (request.destination === 'video') return true;
  if (pathname.startsWith('/videos/')) return true;
  if (pathname.startsWith('/presentations/')) return true;

  return false;
}

function isCacheableResponse(response) {
  if (!response) return false;
  if (response.type === 'error') return false;

  const cacheControl = response.headers?.get?.('cache-control') || '';
  if (/\bno-store\b/i.test(cacheControl)) return false;

  return response.ok || response.type === 'opaque';
}

function copyHeadersForSyntheticResponse(response) {
  const headers = new Headers(response.headers || undefined);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.delete('transfer-encoding');
  return headers;
}

async function makeNavigationResponseSafe(response) {
  if (!response) return response;

  // Dla navigation requests nie chcemy oddawać odpowiedzi, która niesie
  // znacznik redirected/opaqueredirect. Tworzymy więc „czystą” odpowiedź.
  if (!response.redirected && response.type !== 'opaqueredirect') {
    return response;
  }

  // Opaqueredirect nie da się sensownie zwrócić do nawigacji przez SW.
  // Traktujemy to jako błąd sieci i przechodzimy do fallbacku z cache.
  if (response.type === 'opaqueredirect') {
    throw new Error('Navigation returned opaqueredirect response');
  }

  const headers = copyHeadersForSyntheticResponse(response);
  const body = await response.blob();

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function buildNavigationNetworkRequest(request) {
  // Dla dokumentów robimy osobny GET z redirect:'follow', żeby uniknąć
  // problemów z redirect mode „manual” oryginalnej nawigacji.
  return new Request(request.url, {
    method: 'GET',
    credentials: 'same-origin',
    mode: 'same-origin',
    redirect: 'follow',
    cache: 'no-cache'
  });
}

function getShellCacheKeyFromStaticUrl(input) {
  if (!isSameOrigin(input)) return null;

  const url = toURL(input);
  if (!url) return null;

  const pathname = unscopePathname(url.pathname); // PWA-SUBPATH
  if (!SHELL_PATHS.has(pathname)) return null;

  // Dla zasobów statycznych z query stringiem (np. app.js?v=100) kluczem cache
  // musi być pełny URL względny. W przeciwnym razie można oddać starą,
  // niewersjonowaną odpowiedź /app.js i rozjechać HTML/CSS/JS między wersjami.
  return url.search ? `${pathname}${url.search}` : pathname;
}

function getShellCacheKeyFromRequest(request) {
  if (!isSameOrigin(request)) return null;

  const url = toURL(request);
  if (!url) return null;

  const pathname = unscopePathname(url.pathname); // PWA-SUBPATH

  if (isNavigationRequest(request)) {
    const normalizedPath = normalizeNavigationPath(pathname);
    return DOCUMENT_PATHS.has(normalizedPath) ? normalizedPath : null;
  }

  return getShellCacheKeyFromStaticUrl(request);
}

function getNavigationCacheKeyFromResponse(request, response) {
  if (!isSameOrigin(request)) return null;

  const responseUrl = toURL(response?.url || request.url);
  const pathname = responseUrl ? unscopePathname(responseUrl.pathname) : getPathname(request); // PWA-SUBPATH
  const normalizedPath = normalizeNavigationPath(pathname);

  if (DOCUMENT_PATHS.has(normalizedPath)) return normalizedPath;
  if (pathname === '/' || pathname === ROOT_DOCUMENT) return ROOT_DOCUMENT;

  return null;
}

async function cacheResponse(cacheName, key, response) {
  if (!key || !isCacheableResponse(response)) return response;

  const cache = await caches.open(cacheName);
  await cache.put(key, response.clone());
  return response;
}

function getRuntimeCacheNowMs() {
  try {
    return Date.now();
  } catch (_) {
    void _;
    return 0;
  }
}

function getRuntimeMetadataCacheKey(request) {
  const url = toURL(request);
  if (!url) return null;
  return `${RUNTIME_METADATA_CACHE_KEY_PREFIX}${encodeURIComponent(url.href)}`;
}

function isRuntimeMetadataRequest(request) {
  const pathname = getPathname(request);
  return !!pathname && pathname.indexOf(RUNTIME_METADATA_CACHE_KEY_PREFIX) === 0;
}

function buildRuntimeMetadataResponse(request, cachedAt) {
  const url = toURL(request);
  const metadata = {
    schemaVersion: RUNTIME_METADATA_SCHEMA_VERSION,
    url: url ? url.href : '',
    cachedAt,
    ttlMs: RUNTIME_CACHE_TTL_MS
  };

  return new Response(JSON.stringify(metadata), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

async function readRuntimeCacheMetadata(cache, request) {
  const metadataKey = getRuntimeMetadataCacheKey(request);
  if (!metadataKey) return null;

  try {
    const response = await cache.match(metadataKey);
    if (!response) return null;

    const raw = typeof response.text === 'function' ? await response.clone().text() : '';
    const metadata = raw ? JSON.parse(raw) : null;
    const cachedAt = metadata && Number(metadata.cachedAt);

    if (!Number.isFinite(cachedAt)) return null;

    return {
      schemaVersion: metadata.schemaVersion || RUNTIME_METADATA_SCHEMA_VERSION,
      url: metadata.url || '',
      cachedAt,
      ttlMs: metadata.ttlMs || RUNTIME_CACHE_TTL_MS
    };
  } catch (_) {
    void _;
    return null;
  }
}

async function writeRuntimeCacheMetadata(cache, request, cachedAt) {
  const metadataKey = getRuntimeMetadataCacheKey(request);
  if (!metadataKey) return;
  await cache.put(metadataKey, buildRuntimeMetadataResponse(request, cachedAt));
}

async function deleteRuntimeCacheEntry(cache, request) {
  await cache.delete(request);

  const metadataKey = getRuntimeMetadataCacheKey(request);
  if (metadataKey) {
    await cache.delete(metadataKey);
  }
}

function isRuntimeCacheMetadataExpired(metadata, nowMs) {
  if (!metadata || !Number.isFinite(Number(metadata.cachedAt))) return false;
  return nowMs - Number(metadata.cachedAt) > RUNTIME_CACHE_TTL_MS;
}

async function findRuntimeCacheMatch(cache, request) {
  const exactMatch = await cache.match(request);
  if (exactMatch) return { request, response: exactMatch };

  const url = toURL(request);
  if (!isSameOrigin(request) || !url || url.search) return null;

  const keys = await cache.keys();
  for (const candidate of keys) {
    if (isRuntimeMetadataRequest(candidate)) continue;

    const candidateUrl = toURL(candidate);
    if (!candidateUrl || candidateUrl.origin !== url.origin || candidateUrl.pathname !== url.pathname) continue;

    const response = await cache.match(candidate);
    if (response) return { request: candidate, response };
  }

  return null;
}

async function getRuntimeCacheEntries(cache) {
  const keys = await cache.keys();
  const nowMs = getRuntimeCacheNowMs();
  const entries = [];

  for (const request of keys) {
    if (isRuntimeMetadataRequest(request)) continue;

    let metadata = await readRuntimeCacheMetadata(cache, request);
    if (!metadata) {
      await writeRuntimeCacheMetadata(cache, request, nowMs);
      metadata = {
        schemaVersion: RUNTIME_METADATA_SCHEMA_VERSION,
        url: toURL(request)?.href || '',
        cachedAt: nowMs,
        ttlMs: RUNTIME_CACHE_TTL_MS
      };
    }

    entries.push({ request, metadata, cachedAt: Number(metadata.cachedAt) || 0 });
  }

  return entries;
}

async function pruneRuntimeCache(cache) {
  const nowMs = getRuntimeCacheNowMs();
  const entries = await getRuntimeCacheEntries(cache);
  const expiredEntries = entries.filter((entry) => isRuntimeCacheMetadataExpired(entry.metadata, nowMs));

  for (const entry of expiredEntries) {
    await deleteRuntimeCacheEntry(cache, entry.request);
  }

  const remainingEntries = entries
    .filter((entry) => expiredEntries.indexOf(entry) === -1)
    .sort((a, b) => a.cachedAt - b.cachedAt);

  const overflowCount = Math.max(0, remainingEntries.length - RUNTIME_CACHE_MAX_ENTRIES);
  if (overflowCount > 0) {
    const overflowEntries = remainingEntries.slice(0, overflowCount);
    for (const entry of overflowEntries) {
      await deleteRuntimeCacheEntry(cache, entry.request);
    }
  }
}

async function cacheRuntimeResponse(request, response) {
  if (!isCacheableResponse(response) || shouldBypassCache(request) || isRuntimeMetadataRequest(request)) return response;

  const cache = await caches.open(RUNTIME_CACHE);
  await cache.put(request, response.clone());
  await writeRuntimeCacheMetadata(cache, request, getRuntimeCacheNowMs());
  await pruneRuntimeCache(cache);
  return response;
}

async function readFromShellCache(request) {
  const key = getShellCacheKeyFromRequest(request);
  if (!key) return undefined;

  const cache = await caches.open(SHELL_CACHE);
  return cache.match(key);
}

async function readDocumentFromShell(pathname) {
  const key = normalizeNavigationPath(pathname);
  if (!DOCUMENT_PATHS.has(key)) return undefined;

  const cache = await caches.open(SHELL_CACHE);
  return cache.match(key);
}

async function readFromRuntimeCache(request) {
  if (isRuntimeMetadataRequest(request)) return undefined;

  const cache = await caches.open(RUNTIME_CACHE);
  const match = await findRuntimeCacheMatch(cache, request);
  if (!match) return undefined;

  const nowMs = getRuntimeCacheNowMs();
  const metadata = await readRuntimeCacheMetadata(cache, match.request);

  if (metadata && isRuntimeCacheMetadataExpired(metadata, nowMs)) {
    await deleteRuntimeCacheEntry(cache, match.request);
    return undefined;
  }

  if (!metadata) {
    await writeRuntimeCacheMetadata(cache, match.request, nowMs);
  }

  return match.response;
}

async function updateShellFromNetwork(request) {
  const networkRequest = isNavigationRequest(request)
    ? buildNavigationNetworkRequest(request)
    : request;

  const networkResponse = await fetch(networkRequest);

  if (isNavigationRequest(request)) {
    const cacheKey = getNavigationCacheKeyFromResponse(request, networkResponse);
    const safeResponse = await makeNavigationResponseSafe(networkResponse);

    if (cacheKey && isCacheableResponse(safeResponse)) {
      await cacheResponse(SHELL_CACHE, cacheKey, safeResponse);
    }

    return safeResponse;
  }

  const cacheKey = getShellCacheKeyFromRequest(request);

  // Zasobów innych niż dokumenty nie zapisujemy do shell cache, jeśli po drodze
  // wydarzył się redirect — to zwykle sygnał, że adres URL nie jest kanoniczny.
  if (cacheKey && isCacheableResponse(networkResponse) && !networkResponse.redirected) {
    await cacheResponse(SHELL_CACHE, cacheKey, networkResponse);
  }

  return networkResponse;
}

async function updateRuntimeFromNetwork(request) {
  const networkResponse = await fetch(request);

  if (isCacheableResponse(networkResponse) && !shouldBypassCache(request)) {
    await cacheRuntimeResponse(request, networkResponse);
  }

  return networkResponse;
}

async function fetchAndStorePrecacheUrl(url, { required = false } = {}) {
  const cache = await caches.open(SHELL_CACHE);
  // PWA-SUBPATH: fetch pod realny URL w zasięgu SW; klucz cache zostaje w „/x".
  const request = new Request(scopeHref(url), { cache: 'reload', redirect: 'follow' });
  const response = await fetch(request);
  const pathname = getPathname(url);
  const cacheKey = DOCUMENT_PATHS.has(pathname)
    ? normalizeNavigationPath(pathname)
    : getShellCacheKeyFromStaticUrl(url);
  const safeResponse = DOCUMENT_PATHS.has(cacheKey)
    ? await makeNavigationResponseSafe(response)
    : response;

  if (!cacheKey || !isCacheableResponse(safeResponse)) {
    if (required) {
      throw new Error(`Nie udało się precache'ować wymaganego pliku: ${url}`);
    }
    return;
  }

  await cache.put(cacheKey, safeResponse);
}

async function installShell() {
  // Najpierw minimalny shell – jeśli to się nie uda, nowa wersja SW nie powinna wejść.
  for (const url of CORE_SHELL_URLS) {
    await fetchAndStorePrecacheUrl(url, { required: true });
  }

  // Następnie dodatkowe strony i zasoby pobieramy spokojnie, jeden po drugim,
  // żeby nie zapychać łącza użytkownika przy słabym internecie.
  for (const url of [...OPTIONAL_DOCUMENTS, ...OPTIONAL_ASSETS]) {
    try {
      await fetchAndStorePrecacheUrl(url, { required: false });
    } catch (_) {
    void _;
  }
  }
}

async function migrateOldRuntimeCaches(keys) {
  const runtimeCache = await caches.open(RUNTIME_CACHE);

  const oldRuntimeKeys = keys.filter((key) =>
    key.startsWith(`${CACHE_PREFIX}-runtime-`) && key !== RUNTIME_CACHE
  );

  for (const oldKey of oldRuntimeKeys) {
    try {
      const oldCache = await caches.open(oldKey);
      const requests = await oldCache.keys();

      for (const request of requests) {
        const response = await oldCache.match(request);
        if (response) {
          await runtimeCache.put(request, response);
          await writeRuntimeCacheMetadata(runtimeCache, request, getRuntimeCacheNowMs());
        }
      }
    } catch (_) {
    void _;
  }
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(installShell());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();

      await migrateOldRuntimeCaches(keys);
      await pruneRuntimeCache(await caches.open(RUNTIME_CACHE));

      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && !ACTIVE_CACHE_NAMES.has(key))
          .map((key) => caches.delete(key))
      );

      if ('navigationPreload' in self.registration) {
        try {
          await self.registration.navigationPreload.disable();
        } catch (_) {
    void _;
  }
      }

      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') return;
  if (!isHttpRequest(request)) return;

  // Safari/Chrome workaround dla certain only-if-cached requests.
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;

  if (shouldBypassCache(request)) return;
  if (isRuntimeMetadataRequest(request)) return;

  if (isNavigationRequest(request)) {
    event.respondWith(
      (async () => {
        const requestedPath = normalizeNavigationPath(getPathname(request));
        const cachedResponse = await readFromShellCache(request);
        const networkResponsePromise = updateShellFromNetwork(request);

        event.waitUntil(networkResponsePromise.catch(() => undefined));

        if (cachedResponse) {
          return cachedResponse;
        }

        try {
          return await networkResponsePromise;
        } catch (_) {
          return (
            (await readDocumentFromShell(requestedPath)) ||
            ((requestedPath === ROOT_DOCUMENT || getPathname(request) === '/')
              ? await readDocumentFromShell(ROOT_DOCUMENT)
              : undefined) ||
            Response.error()
          );
        }
      })()
    );
    return;
  }

  const shellCacheKey = getShellCacheKeyFromRequest(request);

  if (shellCacheKey) {
    event.respondWith(
      (async () => {
        const cachedResponse =
          (await readFromShellCache(request)) ||
          (await readFromRuntimeCache(request));

        const networkResponsePromise = updateShellFromNetwork(request);
        event.waitUntil(networkResponsePromise.catch(() => undefined));

        if (cachedResponse) {
          return cachedResponse;
        }

        try {
          return await networkResponsePromise;
        } catch (_) {
          return cachedResponse || Response.error();
        }
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cachedResponse = await readFromRuntimeCache(request);
      const networkResponsePromise = updateRuntimeFromNetwork(request);

      event.waitUntil(networkResponsePromise.catch(() => undefined));

      if (cachedResponse) {
        return cachedResponse;
      }

      try {
        return await networkResponsePromise;
      } catch (_) {
        return cachedResponse || Response.error();
      }
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event?.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
