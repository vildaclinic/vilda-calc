/*
 * Vilda Smoke Regression Suite v2.13.0
 *
 * Stały, read-only zestaw smoke testów regresyjnych dodany w kroku 8O-T1 i rozszerzony w 8O-10a/8O-10b/8O-10c/8O-10d-a/8O-10e/8O-10d-b/8O-10d-c/8O-10d-d/8O-10d-e/8O-10d-f/8O-10d-g/8O-11a-a/8O-11a-b/8O-11a-c/8O-11b/8O-11c/8O-11d/8O-11e/8O-11f/8O-11g/8O-11h/8O-11i/8O-11j/8O-11k.
 * Moduł nie uruchamia calcEstimatedIntake(), nie renderuje DOM i nie zapisuje window.*.
 */
(function (global) {
  'use strict';

  if (!global) return;
  if (global.VildaSmokeTests && global.VildaSmokeTests.__vildaSmokeTestsModule) {
    return;
  }

  const VERSION = '2.16.0';
  const STEP = '8O-12b';
  const DEFAULT_ESTIMATED_INTAKE_CONTRACTS = Object.freeze([
    'estimated-intake-card-audit',
    'estimated-intake-card-helpers',
    'estimated-intake-alert-probe-audit',
    'estimated-intake-alert-probe-collector',
    'estimated-intake-calc-seam',
    'estimated-intake-calculation-model'
  ]);
  const DEFAULT_NUMERIC_VALIDATION_CONTRACTS = Object.freeze([
    'numeric-validation-age-zero'
  ]);
  const DEFAULT_PEDIATRIC_BMI_CONTRACTS = Object.freeze([
    'pediatric-bmi-no-adult-fallback'
  ]);
  const DEFAULT_NUTRITION_NORMS_REFRESH_CONTRACTS = Object.freeze([
    'nutrition-norms-refresh-queue'
  ]);
  const DEFAULT_UPDATE_HOOKS_CONTRACTS = Object.freeze([
    'update-hooks-registry',
    'update-hooks-first-wrapper-bridge',
    'update-hooks-second-wrapper-bridge',
    'update-hooks-diet-recommendations-wrapper',
    'update-hooks-nutrition-norms-wrapper',
    'update-hooks-nutrition-micros-wrapper',
    'update-hooks-final-chain-audit'
  ]);
  const DEFAULT_CENTILE_CHART_HEADER_CONTRACTS = Object.freeze([
    'centile-chart-header-fresh-name'
  ]);
  const DEFAULT_GH_THERAPY_RESOURCE_AUDIT_CONTRACTS = Object.freeze([
    'gh-therapy-indexeddb-resource-audit',
    'fetch-timeout-cleanup',
    'service-worker-fetch-cache-strategy',
    'service-worker-offline-update-flow-smoke',
    'service-worker-versioned-shell-cache-key',
    'service-worker-stale-cache-pruning-audit',
    'service-worker-runtime-cache-pruning',
    'service-worker-client-lifecycle-audit'
  ]);
  const DEFAULT_ADVANCED_INTAKE_SYNC_CONTRACTS = Object.freeze([
    'advanced-growth-intake-sync-audit',
    'advanced-growth-intake-sync-helpers',
    'advanced-growth-intake-sync-row-operations',
    'advanced-growth-intake-sync-pairing',
    'advanced-growth-intake-sync-handlers',
    'advanced-growth-intake-sync-live-wiring',
    'advanced-growth-intake-sync-final-validation'
  ]);
  const EXPECTED_BROWSER_SCRIPTS = Object.freeze([
    'vilda_deps.js?v=74',
    'vilda_update_hooks.js?v=7',
    'vilda_centile_chart_header.js?v=1',
    'vilda_gh_therapy_resource_audit.js?v=13',
    'vilda_app_helpers.js?v=2',
    'vilda_macro_practice.js?v=2',
    'vilda_data_import_export.js?v=14',
    'vilda_food_summary.js?v=2',
    'vilda_estimated_intake.js?v=3',
    'vilda_update_prep.js?v=61',
    'vilda_gh_therapy_sync.js?v=1',
    'vilda_plan_input.js?v=1',
    'vilda_plan_energy.js?v=1',
    'vilda_plan_render.js?v=1',
    'app.js?v=154',
    'vilda_smoke_tests.js?v=25',
    'vilda_diet_recommendations.js?v=2',
    'nutrition_norms.js?v=39',
    'nutrition_micros.js?v=20'
  ]);
  const MANIFEST = Object.freeze([
    Object.freeze({ id: 'smoke-suite-api', group: 'smoke-suite', required: true, description: 'API VildaSmokeTests i aliasy konsolowe są dostępne.' }),
    Object.freeze({ id: 'estimated-intake-module-api', group: 'estimated-intake', required: true, description: 'VildaEstimatedIntake ma helpery z 8O-9b–8O-9f.' }),
    Object.freeze({ id: 'estimated-intake-pure-model-samples', group: 'estimated-intake', required: true, description: 'Czysty model estimated intake obsługuje 0/1/wiele wierszy bez DOM i bez commitu window.*.' }),
    Object.freeze({ id: 'estimated-intake-readonly-snapshots', group: 'estimated-intake', required: true, description: 'Snapshoty estimated intake są read-only i nie uruchamiają calcEstimatedIntake().' }),
    Object.freeze({ id: 'plan-modules-contract', group: 'plan-modules', required: true, description: 'Moduły VildaPlanInput/VildaPlanEnergy/VildaPlanRender oraz bridge updatePlanFromDiet są dostępne i mają stabilne API.' }),
    Object.freeze({ id: 'vilda-deps-estimated-contracts', group: 'deps-contracts', required: true, description: 'Kontrakty VildaDeps dla estimated intake są obecne i przechodzą po załadowaniu strony.' }),
    Object.freeze({ id: 'advanced-intake-sync-regression-surface', group: 'advanced-intake-sync', required: true, description: 'Powierzchnia diagnostyczna synchronizacji advanced growth ↔ estimated intake pozostaje dostępna.' }),
    Object.freeze({ id: 'numeric-validation-age-zero', group: 'numeric-validation', required: true, description: 'Jawna walidacja liczbowa akceptuje wpisany wiek 0 lat i odróżnia puste pole wieku od noworodka.' }),
    Object.freeze({ id: 'pediatric-bmi-no-adult-fallback', group: 'pediatric-bmi', required: true, description: 'Dziecko bez dostępnego percentyla BMI nie jest klasyfikowane progami BMI dorosłych.' }),
    Object.freeze({ id: 'nutrition-norms-refresh-queue', group: 'nutrition-norms', required: true, description: 'Szybkie odmienne zdarzenie nutritionNormsModelUpdated podczas trwającego refreshu food-summary jest zapamiętywane jako pending i wykonywane po zakończeniu bieżącego refreshu.' }),
    Object.freeze({ id: 'update-hooks-registry', group: 'update-hooks', required: true, description: 'Registry hooków po update() jest dostępne, testowalne i obsługuje bridge app.js po 8O-10d-g.' }),
    Object.freeze({ id: 'update-hooks-first-wrapper-bridge', group: 'update-hooks', required: true, description: 'Pierwszy wrapper window.update z app.js pozostaje przepięty na VildaUpdateHooks jako hook BMI p50, a bridge zachowuje kolejność łańcucha.' }),
    Object.freeze({ id: 'update-hooks-second-wrapper-bridge', group: 'update-hooks', required: true, description: 'Drugi wrapper window.update z app.js jest przepięty na VildaUpdateHooks jako hook updateIdealWeightUI po hooku BMI p50.' }),
    Object.freeze({ id: 'update-hooks-diet-recommendations-wrapper', group: 'update-hooks', required: true, description: 'Wrapper window.update z vilda_diet_recommendations.js jest przepięty na VildaUpdateHooks jako hook widoczności zaleceń dietetycznych po hookach app.js.' }),
    Object.freeze({ id: 'update-hooks-nutrition-norms-wrapper', group: 'update-hooks', required: true, description: 'Wrapper window.update z nutrition_norms.js jest przepięty na VildaUpdateHooks jako hook renderowania norm po hookach app.js i diet recommendations.' }),
    Object.freeze({ id: 'update-hooks-nutrition-micros-wrapper', group: 'update-hooks', required: true, description: 'Wrapper window.update z nutrition_micros.js jest przepięty na VildaUpdateHooks jako hook renderowania mikroelementów po hooku nutrition_norms.js.' }),
    Object.freeze({ id: 'update-hooks-final-chain-audit', group: 'update-hooks', required: true, description: 'Końcowy audyt łańcucha window.update potwierdza migrację znanych wrapperów i raportuje brak znanych legacy-wrapperów update w torze 8O-10d.' }),
    Object.freeze({ id: 'centile-chart-header-fresh-name', group: 'centile-chart-header', required: true, description: 'Nagłówek PDF siatek centylowych używa świeżego imienia z DOM zamiast nieświeżego window.advancedGrowthData.name.' }),
    Object.freeze({ id: 'gh-therapy-indexeddb-resource-audit', group: 'gh-therapy-resources', required: true, description: 'Read-only snapshot mapuje stan po domknięciu IDBDatabase, obsłudze onversionchange, lifecycle BroadcastChannel, cleanupie MutationObserver, fetch timeout cleanup i Service Worker fetch/cache strategy.' }),
    Object.freeze({ id: 'fetch-timeout-cleanup', group: 'async-resources', required: true, description: 'Helpery fetch*WithTimeout są dostępne i rozróżniają timeout, HTTP, network oraz JSON parse error.' }),
    Object.freeze({ id: 'service-worker-fetch-cache-strategy', group: 'pwa-cache', required: true, description: 'Service Worker ma read-only audyt strategii fetch/cache/offline, zachowuje cache-first/background refresh/offline fallback i ma udokumentowaną timeout-exempt policy.' }),
    Object.freeze({ id: 'service-worker-offline-update-flow-smoke', group: 'pwa-cache', required: true, description: 'Service Worker ma zdefiniowany kontrolowany smoke E2E offline/update-flow dla instalacji, aktywacji, fallbacków offline, background refresh i SKIP_WAITING.' }),
    Object.freeze({ id: 'service-worker-versioned-shell-cache-key', group: 'pwa-cache', required: true, description: 'Service Worker używa spójnego cache key pathname+search dla wersjonowanych zasobów shell w precache/install i fetch.' }),
    Object.freeze({ id: 'service-worker-stale-cache-pruning-audit', group: 'pwa-cache', required: true, description: 'Service Worker ma read-only audyt scope czyszczenia starych shell/runtime cache oraz ryzyka wzrostu runtime cache bez zmiany strategii offline.' }),
    Object.freeze({ id: 'service-worker-runtime-cache-pruning', group: 'pwa-cache', required: true, description: 'Service Worker ma wdrożony TTL/max-entry pruning runtime cache z metadanymi wpisów.' }),
    Object.freeze({ id: 'service-worker-client-lifecycle-audit', group: 'pwa-cache', required: true, description: 'Client-side lifecycle rejestracji/update-flow Service Workera ma singleton registrationPromise, deduplikację listenerów i guard controllerchange reload.' }),
    Object.freeze({ id: 'service-worker-client-update-ux-smoke', group: 'pwa-cache', required: true, description: 'Client-side smoke UX banera aktualizacji Service Workera obejmuje dostępność, Przeładuj/Później i read-only snapshot.' }),
    Object.freeze({ id: 'script-cache-versions', group: 'cache-and-load-order', required: true, description: 'HTML/SW ładują oczekiwane wersje skryptów po 8O-11k.' }),
    Object.freeze({ id: 'window-state-side-effect-guard', group: 'side-effects', required: true, description: 'Uruchomienie smoke suite nie zmienia window.intakeHistory ani window.intakeEstimatedKcalPerDay.' })
  ]);

  let lastRegressionSuiteResult = null;

  function now() {
    try { return Date.now(); } catch (_) { return 0; }
  }

  function clonePlain(value, depth) {
    const maxDepth = typeof depth === 'number' ? depth : 6;
    if (maxDepth <= 0 || value == null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(function (item) { return clonePlain(item, maxDepth - 1); });
    const out = {};
    Object.keys(value).forEach(function (key) {
      const v = value[key];
      out[key] = (typeof v === 'function') ? '[function]' : clonePlain(v, maxDepth - 1);
    });
    return out;
  }

  function inferType(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  }

  function resolvePath(path, root) {
    const base = root || global;
    const parts = String(path || '').split('.').filter(Boolean);
    let cursor = base;
    for (let i = 0; i < parts.length; i += 1) {
      if (cursor == null) return undefined;
      cursor = cursor[parts[i]];
    }
    return cursor;
  }

  function hasFunction(path) {
    return typeof resolvePath(path) === 'function';
  }

  function hasObject(path) {
    const value = resolvePath(path);
    return value !== null && typeof value === 'object';
  }

  function captureWindowState() {
    const intakeHistory = global.intakeHistory;
    return {
      intakeHistoryExists: Array.isArray(intakeHistory),
      intakeHistoryLength: Array.isArray(intakeHistory) ? intakeHistory.length : null,
      intakeHistorySignature: Array.isArray(intakeHistory) ? intakeHistory.map(function (row) {
        if (!row || typeof row !== 'object') return String(row);
        return [row.ageMonths, row.months, row.weight, row.height].map(function (item) { return String(item); }).join(':');
      }).join('|') : null,
      intakeEstimatedKcalPerDay: Object.prototype.hasOwnProperty.call(global, 'intakeEstimatedKcalPerDay') ? global.intakeEstimatedKcalPerDay : undefined,
      advancedGrowthMeasurementsLength: global.advancedGrowthData && Array.isArray(global.advancedGrowthData.measurements)
        ? global.advancedGrowthData.measurements.length
        : null
    };
  }

  function stateChanged(before, after) {
    return before.intakeHistoryExists !== after.intakeHistoryExists ||
      before.intakeHistoryLength !== after.intakeHistoryLength ||
      before.intakeHistorySignature !== after.intakeHistorySignature ||
      before.intakeEstimatedKcalPerDay !== after.intakeEstimatedKcalPerDay ||
      before.advancedGrowthMeasurementsLength !== after.advancedGrowthMeasurementsLength;
  }

  function makeCaseResult(id, group, required, ok, details, error) {
    return {
      id,
      group,
      required: required !== false,
      ok: ok === true,
      status: ok === true ? 'pass' : (required === false ? 'warn' : 'fail'),
      details: details || null,
      error: error ? String(error && error.message ? error.message : error) : null
    };
  }

  function runCase(id, group, required, fn, options) {
    try {
      const details = fn(options || {}) || {};
      return makeCaseResult(id, group, required, details.ok !== false, details, null);
    } catch (error) {
      return makeCaseResult(id, group, required, false, null, error);
    }
  }

  function buildMockEstimatedIntakeDependencies() {
    return {
      energyIsNumeric: function (value) { return Number.isFinite(Number(value)); },
      energyBuildIntakeObservedState: function (args) {
        const weight = Number(args && args.weightKg);
        const pal = Number(args && args.palInput);
        const tee = Math.round(850 + (Number.isFinite(weight) ? weight * 22 : 0) + (Number.isFinite(pal) ? pal * 100 : 0));
        return {
          teeRawKcal: tee,
          teeBaselineKcal: tee,
          palUsed: Number.isFinite(pal) ? pal : null,
          isInfantUnder6: false,
          isInfantButte: false,
          modeBadge: 'smoke-mock'
        };
      },
      expectedGainMedianHeightAware: function () { return 1.2; },
      ENERGY_ADULT_START_AGE: 19,
      KCAL_PER_KG: 7700
    };
  }

  function summarizeModel(model) {
    return model ? {
      branch: model.branch,
      pureModel: model.pureModel === true,
      rendersDom: model.rendersDom === true,
      commitsWindowState: model.commitsWindowState === true,
      mutatesDom: model.mutatesDom === true,
      mutatesWindowState: model.mutatesWindowState === true,
      rowCount: model.rowCount,
      intervalsCount: Array.isArray(model.intervals) ? model.intervals.length : null,
      commitAction: model.commitPlan ? model.commitPlan.action : null,
      commitIntakeKcalPerDay: model.commitPlan ? model.commitPlan.intakeKcalPerDay : null,
      hasPostRenderRiskPlan: !!(model.postRenderRiskPlan && model.postRenderRiskPlan.shouldRun)
    } : null;
  }

  function runEstimatedIntakePureModelSamples() {
    const api = global.VildaEstimatedIntake;
    if (!api || typeof api.buildEstimatedIntakeCalculationModel !== 'function') {
      return { ok: false, reason: 'missing VildaEstimatedIntake.buildEstimatedIntakeCalculationModel' };
    }
    const deps = buildMockEstimatedIntakeDependencies();
    const common = { sex: 'F', height: 110, pal: 1.4, basics: { sex: 'F', height: 110 } };
    const empty = api.buildEstimatedIntakeCalculationModel(Object.assign({}, common, { rows: [] }), {}, deps);
    const single = api.buildEstimatedIntakeCalculationModel(Object.assign({}, common, {
      rows: [{ ageYears: 5, ageMonths: 60, months: 60, weight: 20, height: 110 }]
    }), {}, deps);
    const multi = api.buildEstimatedIntakeCalculationModel(Object.assign({}, common, {
      rows: [
        { ageYears: 5, ageMonths: 60, months: 60, weight: 20, height: 110 },
        { ageYears: 5.5, ageMonths: 66, months: 66, weight: 22, height: 113 }
      ]
    }), {}, deps);
    const models = [empty, single, multi];
    const allPure = models.every(function (model) {
      return model && model.pureModel === true && model.rendersDom === false && model.commitsWindowState === false && model.mutatesDom === false && model.mutatesWindowState === false;
    });
    const branchesOk = empty && empty.branch === 'empty-rows-message' &&
      single && single.branch === 'single-row-maintenance' &&
      multi && multi.branch === 'multi-row-interval-render' &&
      Array.isArray(multi.intervals) && multi.intervals.length === 1;
    return {
      ok: allPure && branchesOk,
      empty: summarizeModel(empty),
      single: summarizeModel(single),
      multi: summarizeModel(multi)
    };
  }

  function checkEstimatedIntakeReadOnlySnapshots(options) {
    const opts = options || {};
    const auditFn = global.vildaGetEstimatedIntakeAuditSnapshot;
    const alertFn = global.vildaGetEstimatedIntakeAlertProbeAuditSnapshot;
    const seamFn = global.vildaGetEstimatedIntakeCalcSeamSnapshot;
    const modelFn = global.vildaGetEstimatedIntakeCalculationModelSnapshot;
    const missing = [];
    if (typeof auditFn !== 'function') missing.push('vildaGetEstimatedIntakeAuditSnapshot');
    if (typeof alertFn !== 'function') missing.push('vildaGetEstimatedIntakeAlertProbeAuditSnapshot');
    if (typeof seamFn !== 'function') missing.push('vildaGetEstimatedIntakeCalcSeamSnapshot');
    if (typeof modelFn !== 'function') missing.push('vildaGetEstimatedIntakeCalculationModelSnapshot');
    if (missing.length) return { ok: false, missing };

    const audit = auditFn({ includeRows: opts.includeRows === true });
    const alert = alertFn({ includeRows: false });
    const seam = seamFn({ includeRows: false });
    const model = modelFn({ includeRows: false, executePureModel: opts.executePureModel === true });
    const ok = !!(audit && audit.readOnly === true) &&
      !!(alert && alert.readOnly === true && alert.executedAlertProbeFunctions === false) &&
      !!(seam && seam.readOnly === true && seam.executedCalcEstimatedIntake === false) &&
      !!(model && model.readOnly === true && model.executedCalcEstimatedIntake === false && model.executedDomRender === false && model.committedWindowState === false);
    return {
      ok,
      audit: audit ? { kind: audit.kind, readOnly: audit.readOnly, step: audit.step } : null,
      alert: alert ? { kind: alert.kind, readOnly: alert.readOnly, executedAlertProbeFunctions: alert.executedAlertProbeFunctions } : null,
      seam: seam ? { kind: seam.kind, readOnly: seam.readOnly, executedCalcEstimatedIntake: seam.executedCalcEstimatedIntake } : null,
      calculationModel: model ? { kind: model.kind, readOnly: model.readOnly, executedPureModel: model.executedPureModel, modelSummary: model.modelSummary || null } : null
    };
  }

  function getContractNames() {
    const deps = global.VildaDeps;
    if (!deps || typeof deps.listModules !== 'function') return [];
    try { return deps.listModules(); } catch (_) { return []; }
  }

  function checkNamedContracts(names, options) {
    const opts = options || {};
    const deps = global.VildaDeps;
    if (!deps || typeof deps.checkModuleDeps !== 'function' || typeof deps.listModules !== 'function') {
      return { ok: false, reason: 'missing VildaDeps API', missingContracts: names.slice(), failedContracts: [] };
    }
    const available = getContractNames();
    const missingContracts = names.filter(function (name) { return available.indexOf(name) === -1; });
    const checked = [];
    const failedContracts = [];
    if (!missingContracts.length && opts.executeChecks !== false) {
      names.forEach(function (name) {
        const result = deps.checkModuleDeps(name, { record: false, silent: true, page: opts.page });
        checked.push({ moduleName: name, ok: !!(result && result.ok), missingRequired: result && result.missingRequired ? result.missingRequired.map(function (dep) { return dep.path; }) : [] });
        if (!result || !result.ok) failedContracts.push(name);
      });
    }
    return {
      ok: missingContracts.length === 0 && failedContracts.length === 0,
      missingContracts,
      failedContracts,
      checked
    };
  }

  function checkBrowserScriptVersions() {
    const doc = global.document;
    if (!doc || typeof doc.getElementsByTagName !== 'function') {
      return { ok: false, reason: 'document unavailable' };
    }
    let srcList = [];
    try {
      srcList = Array.prototype.slice.call(doc.getElementsByTagName('script') || [])
        .map(function (script) { return script && script.getAttribute ? String(script.getAttribute('src') || '') : ''; })
        .filter(Boolean);
    } catch (error) {
      return { ok: false, reason: String(error && error.message ? error.message : error) };
    }
    const missing = EXPECTED_BROWSER_SCRIPTS.filter(function (token) {
      return !srcList.some(function (src) { return src.indexOf(token) !== -1; });
    });
    return { ok: missing.length === 0, expected: EXPECTED_BROWSER_SCRIPTS.slice(), missing, scriptCount: srcList.length };
  }

  function checkPlanModulesContract() {
    const planInput = global.VildaPlanInput || null;
    const planEnergy = global.VildaPlanEnergy || null;
    const planRender = global.VildaPlanRender || null;
    const ok = !!(
      planInput && typeof planInput.readPlanInputFromDom === 'function' && typeof planInput.isPlanInputComplete === 'function' &&
      planEnergy && typeof planEnergy.buildPlanState === 'function' && typeof planEnergy.resolvePlanDiets === 'function' &&
      planRender && typeof planRender.renderPlanUnavailable === 'function' && typeof planRender.renderNoDietsAvailable === 'function' &&
      typeof global.updatePlanFromDiet === 'function'
    );
    return {
      ok,
      planInputApi: !!planInput,
      planEnergyApi: !!planEnergy,
      planRenderApi: !!planRender,
      updatePlanFromDietBridge: typeof global.updatePlanFromDiet === 'function'
    };
  }


  function checkNumericValidationAgeZero(options) {
    const opts = options || {};
    const positive = resolvePath('vildaIsFinitePositive');
    const nonNegative = resolvePath('vildaIsFiniteNonNegative');
    const auditFn = resolvePath('vildaGetNumericValidationAuditSnapshot');
    const anthroFn = resolvePath('vildaGetMainAnthroValidationSnapshot');
    const updateApi = resolvePath('VildaUpdatePrep');
    const dataApi = resolvePath('VildaDataImportExport');
    let audit = null;
    let anthro = null;
    if (typeof auditFn === 'function' && opts.includeNumericValidationSnapshot !== false) {
      try { audit = auditFn(); } catch (error) { audit = { error: String(error && error.message ? error.message : error) }; }
    }
    if (typeof anthroFn === 'function' && opts.includeNumericValidationSnapshot !== false) {
      try { anthro = anthroFn(); } catch (error) { anthro = { error: String(error && error.message ? error.message : error) }; }
    }
    const pureChecks = {
      nonNegativeZero: typeof nonNegative === 'function' ? nonNegative(0) === true : false,
      nonNegativeBlankRejected: typeof nonNegative === 'function' ? nonNegative('') === false : false,
      positiveZeroRejected: typeof positive === 'function' ? positive(0) === false : false,
      positiveOneAccepted: typeof positive === 'function' ? positive(1) === true : false
    };
    const contractDetail = checkNamedContracts(DEFAULT_NUMERIC_VALIDATION_CONTRACTS.slice(), { executeChecks: opts.executeContractChecks !== false, page: opts.page });
    return {
      ok: typeof positive === 'function' &&
        typeof nonNegative === 'function' &&
        typeof auditFn === 'function' &&
        typeof anthroFn === 'function' &&
        !!(updateApi && typeof updateApi.getNumericValidationSnapshot === 'function') &&
        !!(dataApi && dataApi.version === '1.10.3') &&
        Object.keys(pureChecks).every(function (key) { return pureChecks[key] === true; }) &&
        contractDetail.ok === true,
      pureChecks,
      api: {
        vildaIsFinitePositive: typeof positive === 'function',
        vildaIsFiniteNonNegative: typeof nonNegative === 'function',
        vildaGetNumericValidationAuditSnapshot: typeof auditFn === 'function',
        vildaGetMainAnthroValidationSnapshot: typeof anthroFn === 'function',
        VildaUpdatePrep: !!updateApi,
        VildaDataImportExportVersion: dataApi ? dataApi.version || null : null
      },
      contractDetail,
      audit: audit ? clonePlain(audit, 3) : null,
      anthro: anthro ? clonePlain(anthro, 3) : null
    };
  }

  function checkPediatricBmiNoAdultFallback(options) {
    const opts = options || {};
    const labelFn = resolvePath('vildaGetPediatricBmiClassificationUnavailableLabel');
    const unavailableFn = resolvePath('vildaIsPediatricBmiCategoryUnavailable');
    const resolveFn = resolvePath('vildaResolvePediatricBmiCategoryFromPercentile');
    const auditFn = resolvePath('vildaGetPediatricBmiClassificationAuditSnapshot');
    const updateApi = resolvePath('VildaUpdatePrep');
    let appAudit = null;
    let updateSnapshot = null;
    if (typeof auditFn === 'function' && opts.includePediatricBmiSnapshot !== false) {
      try { appAudit = auditFn({ includeSourceHints: true }); } catch (error) { appAudit = { error: String(error && error.message ? error.message : error) }; }
    }
    if (updateApi && typeof updateApi.getPediatricBmiClassificationSnapshot === 'function' && opts.includePediatricBmiSnapshot !== false) {
      try { updateSnapshot = updateApi.getPediatricBmiClassificationSnapshot({ includeSourceHints: true }); } catch (error) { updateSnapshot = { error: String(error && error.message ? error.message : error) }; }
    }
    const label = typeof labelFn === 'function' ? labelFn() : '';
    const missingPercentileCategory = typeof resolveFn === 'function' ? resolveFn(null, { useOlaf: false }) : null;
    const percentile50Category = typeof resolveFn === 'function' ? resolveFn(50, { useOlaf: false }) : null;
    const contractDetail = checkNamedContracts(DEFAULT_PEDIATRIC_BMI_CONTRACTS.slice(), { executeChecks: opts.executeContractChecks !== false, page: opts.page });
    return {
      ok: typeof labelFn === 'function' &&
        typeof unavailableFn === 'function' &&
        typeof resolveFn === 'function' &&
        typeof auditFn === 'function' &&
        !!(updateApi && typeof updateApi.getPediatricBmiClassificationSnapshot === 'function') &&
        label === 'Brak klasyfikacji pediatrycznej — brak danych referencyjnych' &&
        missingPercentileCategory === label &&
        unavailableFn(missingPercentileCategory) === true &&
        percentile50Category === 'Prawidłowe' &&
        !!(appAudit && appAudit.adultFallbackRemoved === true && appAudit.missingPercentileUsesAdultBmi === false) &&
        !!(updateSnapshot && updateSnapshot.adultFallbackRemoved === true && updateSnapshot.missingPercentileUsesAdultBmi === false) &&
        contractDetail.ok === true,
      label,
      missingPercentileCategory,
      percentile50Category,
      appAudit: appAudit ? clonePlain(appAudit, 3) : null,
      updateSnapshot: updateSnapshot ? clonePlain(updateSnapshot, 3) : null,
      contractDetail
    };
  }

  function checkNutritionNormsRefreshQueue(options) {
    const opts = options || {};
    const api = resolvePath('VildaFoodSummary');
    const snapshotFn = resolvePath('vildaGetNutritionNormsRefreshQueueSnapshot') ||
      (api && typeof api.getNutritionNormsRefreshQueueSnapshot === 'function' ? api.getNutritionNormsRefreshQueueSnapshot : null);
    const signatureFn = api && typeof api.buildNutritionNormsRefreshSignature === 'function'
      ? api.buildNutritionNormsRefreshSignature
      : resolvePath('macroPracticeBuildNutritionNormsRefreshSignature');
    let snapshot = null;
    if (typeof snapshotFn === 'function' && opts.includeNutritionNormsRefreshSnapshot !== false) {
      try { snapshot = snapshotFn({ includeDom: opts.includeDom === true }); } catch (error) { snapshot = { error: String(error && error.message ? error.message : error) }; }
    }
    const sampleModel = {
      energy: { palMode: 'smoke', usedPal: 1.4, range: [1200, 1400] },
      planningReference: { percent: { protein: 15, fat: 30, carbs: 55 } },
      fat: { percentRange: [25, 35] }
    };
    const sampleSignature = typeof signatureFn === 'function' ? signatureFn(sampleModel) : '';
    const contractDetail = checkNamedContracts(DEFAULT_NUTRITION_NORMS_REFRESH_CONTRACTS.slice(), { executeChecks: opts.executeContractChecks !== false, page: opts.page });
    return {
      ok: !!api &&
        typeof api.getNutritionNormsRefreshQueueSnapshot === 'function' &&
        typeof api.buildNutritionNormsRefreshSignature === 'function' &&
        typeof snapshotFn === 'function' &&
        typeof signatureFn === 'function' &&
        typeof sampleSignature === 'string' && sampleSignature.indexOf('smoke|1.40|1200-1400') === 0 &&
        !!(snapshot && snapshot.readOnly === true && snapshot.executedRefresh === false && snapshot.queuePolicy && snapshot.queuePolicy.storesDistinctEventWhileRefreshIsRunning === true) &&
        contractDetail.ok === true,
      version: api ? (api.version || api.VERSION || null) : null,
      sampleSignature,
      snapshot: snapshot ? clonePlain({
        kind: snapshot.kind,
        step: snapshot.step,
        readOnly: snapshot.readOnly,
        executedRefresh: snapshot.executedRefresh,
        queuePolicy: snapshot.queuePolicy,
        state: snapshot.state ? {
          bound: snapshot.state.bound,
          refreshing: snapshot.state.refreshing,
          pending: snapshot.state.pending,
          receivedEvents: snapshot.state.receivedEvents,
          queuedEvents: snapshot.state.queuedEvents,
          refreshRuns: snapshot.state.refreshRuns
        } : null
      }, 4) : null,
      contractDetail
    };
  }


  function checkUpdateHooksRegistry(options) {
    const opts = options || {};
    const api = resolvePath('VildaUpdateHooks');
    const auditSnapshotFn = resolvePath('vildaGetUpdateHooksAuditSnapshot') || (api && typeof api.getHookAuditSnapshot === 'function' ? api.getHookAuditSnapshot : null);
    const snapshotFn = auditSnapshotFn || resolvePath('vildaGetUpdateHooksSnapshot') || (api && typeof api.getSnapshot === 'function' ? api.getSnapshot : null);
    let snapshot = null;
    if (typeof snapshotFn === 'function' && opts.includeUpdateHooksSnapshot !== false) {
      try { snapshot = snapshotFn({ includeEvents: opts.includeUpdateHookEvents === true }); } catch (error) { snapshot = { error: String(error && error.message ? error.message : error) }; }
    }
    const initialRegisteredCount = snapshot && Number.isFinite(Number(snapshot.registeredCount)) ? Number(snapshot.registeredCount) : 0;
    const beforeUpdateRef = global.update;
    let hookRuns = 0;
    let token = null;
    let run = null;
    let unregistered = null;
    if (api && typeof api.registerAfterUpdateHook === 'function' && typeof api.runAfterUpdateHooks === 'function') {
      token = api.registerAfterUpdateHook(function smokeUpdateHook(context, meta) {
        hookRuns += 1;
        return !!(context && meta && meta.step === '8O-10d-g');
      }, { id: 'smoke-update-hooks-registry-temp', label: 'Smoke update hooks registry temp', replace: true });
      run = api.runAfterUpdateHooks({ source: 'smoke-suite' }, { source: 'smoke-suite' });
      if (typeof api.unregisterAfterUpdateHook === 'function') {
        unregistered = api.unregisterAfterUpdateHook('smoke-update-hooks-registry-temp');
      }
    }
    const afterUpdateRef = global.update;
    const postSnapshot = api && typeof api.getSnapshot === 'function' ? api.getSnapshot() : null;
    const contractDetail = checkNamedContracts(['update-hooks-registry'], { executeChecks: opts.executeContractChecks !== false, page: opts.page });
    return {
      ok: !!api &&
        api.VERSION === '1.6.0' &&
        typeof api.registerAfterUpdateHook === 'function' &&
        typeof api.unregisterAfterUpdateHook === 'function' &&
        typeof api.runAfterUpdateHooks === 'function' &&
        typeof api.getSnapshot === 'function' &&
        typeof api.getHookAuditSnapshot === 'function' &&
        typeof snapshotFn === 'function' &&
        typeof auditSnapshotFn === 'function' &&
        !!(snapshot && snapshot.readOnly === true && snapshot.didPatchWindowUpdate === false && typeof snapshot.existingWindowUpdateRewired === 'boolean') &&
        !!(token && token.ok === true) &&
        !!(run && run.ok === true && run.didCallWindowUpdate === false && run.didPatchWindowUpdate === false) &&
        hookRuns === 1 &&
        unregistered === true &&
        beforeUpdateRef === afterUpdateRef &&
        !!(postSnapshot && postSnapshot.registeredCount === initialRegisteredCount) &&
        contractDetail.ok === true,
      version: api ? (api.VERSION || api.version || null) : null,
      initialRegisteredCount,
      postRegisteredCount: postSnapshot ? postSnapshot.registeredCount : null,
      hookRuns,
      token: token ? { ok: token.ok, id: token.id, reason: token.reason || null } : null,
      run: run ? { ok: run.ok, hookCount: run.hookCount, failedCount: run.failedCount, didCallWindowUpdate: run.didCallWindowUpdate, didPatchWindowUpdate: run.didPatchWindowUpdate } : null,
      unregistered,
      hasHookAuditSnapshot: !!(api && typeof api.getHookAuditSnapshot === 'function'),
      hasGlobalAuditAlias: hasFunction('vildaGetUpdateHooksAuditSnapshot'),
      windowUpdateReferencePreserved: beforeUpdateRef === afterUpdateRef,
      snapshot: snapshot ? clonePlain({
        kind: snapshot.kind,
        step: snapshot.step,
        readOnly: snapshot.readOnly,
        didPatchWindowUpdate: snapshot.didPatchWindowUpdate,
        didCallWindowUpdate: snapshot.didCallWindowUpdate,
        appBridgeInstalled: snapshot.appBridgeInstalled === true,
        existingWindowUpdateRewired: snapshot.existingWindowUpdateRewired,
        registeredCount: snapshot.registeredCount,
        migrationStatus: snapshot.migrationStatus
      }, 4) : null,
      contractDetail
    };
  }


  function checkUpdateHooksFirstWrapperBridge(options) {
    const opts = options || {};
    const api = resolvePath('VildaUpdateHooks');
    const bridgeSnapshotFn = resolvePath('vildaGetUpdateHooksBridgeSnapshot');
    let bridgeSnapshot = null;
    if (typeof bridgeSnapshotFn === 'function') {
      try { bridgeSnapshot = bridgeSnapshotFn({ includeSourcePreview: opts.includeSourcePreview === true }); } catch (error) { bridgeSnapshot = { error: String(error && error.message ? error.message : error) }; }
    }
    const registrySnapshot = api && typeof api.getSnapshot === 'function' ? api.getSnapshot() : null;
    const contractDetail = checkNamedContracts(['update-hooks-first-wrapper-bridge'], { executeChecks: opts.executeContractChecks !== false, page: opts.page });
    return {
      ok: !!api &&
        api.VERSION === '1.6.0' &&
        typeof bridgeSnapshotFn === 'function' &&
        !!(bridgeSnapshot && bridgeSnapshot.readOnly === true && bridgeSnapshot.didCallWindowUpdate === false && bridgeSnapshot.didRunHooks === false) &&
        bridgeSnapshot.bridgeInstalled === true &&
        bridgeSnapshot.migratedWrapperId === 'app:bmi50-info-after-update' &&
        bridgeSnapshot.migratedHookRegistered === true &&
        !!(registrySnapshot && registrySnapshot.appBridgeInstalled === true && (registrySnapshot.migrationStatus === 'all-known-wrappers-migrated' || registrySnapshot.migrationStatus === 'two-app-wrappers-migrated')) &&
        contractDetail.ok === true,
      version: api ? (api.VERSION || api.version || null) : null,
      bridgeSnapshot: bridgeSnapshot ? clonePlain({
        kind: bridgeSnapshot.kind,
        step: bridgeSnapshot.step,
        readOnly: bridgeSnapshot.readOnly,
        bridgeInstalled: bridgeSnapshot.bridgeInstalled,
        finalWindowUpdateIsBridge: bridgeSnapshot.finalWindowUpdateIsBridge,
        downstreamWrappersMayExist: bridgeSnapshot.downstreamWrappersMayExist,
        migratedWrapperId: bridgeSnapshot.migratedWrapperId,
        migratedHookRegistered: bridgeSnapshot.migratedHookRegistered,
        hookRegisteredAtInstall: bridgeSnapshot.hookRegisteredAtInstall,
        registry: bridgeSnapshot.registry
      }, 5) : null,
      registrySnapshot: registrySnapshot ? clonePlain({
        step: registrySnapshot.step,
        version: registrySnapshot.version,
        appBridgeInstalled: registrySnapshot.appBridgeInstalled,
        migrationStatus: registrySnapshot.migrationStatus,
        registeredCount: registrySnapshot.registeredCount,
        migratedWrapperId: registrySnapshot.migratedWrapperId
      }, 5) : null,
      contractDetail
    };
  }


  function checkUpdateHooksSecondWrapperBridge(options) {
    const opts = options || {};
    const api = resolvePath('VildaUpdateHooks');
    const bridgeSnapshotFn = resolvePath('vildaGetUpdateHooksBridgeSnapshot');
    let bridgeSnapshot = null;
    if (typeof bridgeSnapshotFn === 'function') {
      try { bridgeSnapshot = bridgeSnapshotFn({ includeSourcePreview: opts.includeSourcePreview === true }); } catch (error) { bridgeSnapshot = { error: String(error && error.message ? error.message : error) }; }
    }
    const registrySnapshot = api && typeof api.getSnapshot === 'function' ? api.getSnapshot() : null;
    const migratedWrapperIds = bridgeSnapshot && Array.isArray(bridgeSnapshot.migratedWrapperIds) ? bridgeSnapshot.migratedWrapperIds : [];
    const registryMigratedIds = registrySnapshot && Array.isArray(registrySnapshot.migratedWrapperIds) ? registrySnapshot.migratedWrapperIds : [];
    const contractDetail = checkNamedContracts(['update-hooks-second-wrapper-bridge'], { executeChecks: opts.executeContractChecks !== false, page: opts.page });
    return {
      ok: !!api &&
        api.VERSION === '1.6.0' &&
        typeof bridgeSnapshotFn === 'function' &&
        !!(bridgeSnapshot && bridgeSnapshot.readOnly === true && bridgeSnapshot.didCallWindowUpdate === false && bridgeSnapshot.didRunHooks === false) &&
        bridgeSnapshot.bridgeInstalled === true &&
        migratedWrapperIds.indexOf('app:bmi50-info-after-update') >= 0 &&
        migratedWrapperIds.indexOf('app:ideal-weight-ui-after-update') >= 0 &&
        bridgeSnapshot.migratedHookRegistered === true &&
        bridgeSnapshot.idealWeightHookRegistered === true &&
        bridgeSnapshot.allMigratedHooksRegistered === true &&
        !!(registrySnapshot && registrySnapshot.appBridgeInstalled === true && (registrySnapshot.migrationStatus === 'all-known-wrappers-migrated' || registrySnapshot.migrationStatus === 'two-app-wrappers-migrated')) &&
        registryMigratedIds.indexOf('app:ideal-weight-ui-after-update') >= 0 &&
        contractDetail.ok === true,
      version: api ? (api.VERSION || api.version || null) : null,
      bridgeSnapshot: bridgeSnapshot ? clonePlain({
        kind: bridgeSnapshot.kind,
        step: bridgeSnapshot.step,
        readOnly: bridgeSnapshot.readOnly,
        bridgeInstalled: bridgeSnapshot.bridgeInstalled,
        finalWindowUpdateIsBridge: bridgeSnapshot.finalWindowUpdateIsBridge,
        downstreamWrappersMayExist: bridgeSnapshot.downstreamWrappersMayExist,
        migratedWrapperIds: bridgeSnapshot.migratedWrapperIds,
        migratedHookRegistered: bridgeSnapshot.migratedHookRegistered,
        idealWeightHookRegistered: bridgeSnapshot.idealWeightHookRegistered,
        allMigratedHooksRegistered: bridgeSnapshot.allMigratedHooksRegistered,
        migratedHooks: bridgeSnapshot.migratedHooks,
        registry: bridgeSnapshot.registry
      }, 5) : null,
      registrySnapshot: registrySnapshot ? clonePlain({
        step: registrySnapshot.step,
        version: registrySnapshot.version,
        appBridgeInstalled: registrySnapshot.appBridgeInstalled,
        migrationStatus: registrySnapshot.migrationStatus,
        registeredCount: registrySnapshot.registeredCount,
        migratedWrapperIds: registrySnapshot.migratedWrapperIds,
        migratedHookIdsRegistered: registrySnapshot.migratedHookIdsRegistered
      }, 5) : null,
      contractDetail
    };
  }


  function checkUpdateHooksDietRecommendationsWrapper(options) {
    const opts = options || {};
    const api = resolvePath('VildaUpdateHooks');
    const dietApi = resolvePath('VildaDietRecommendations');
    const snapshotFn = resolvePath('vildaGetDietRecommendationsUpdateHookSnapshot') || (dietApi && typeof dietApi.getUpdateHookSnapshot === 'function' ? dietApi.getUpdateHookSnapshot : null);
    let snapshot = null;
    if (typeof snapshotFn === 'function') {
      try { snapshot = snapshotFn({ includeEvents: opts.includeUpdateHookEvents === true }); } catch (error) { snapshot = { error: String(error && error.message ? error.message : error) }; }
    }
    const registrySnapshot = api && typeof api.getSnapshot === 'function' ? api.getSnapshot() : null;
    const registryMigratedIds = registrySnapshot && Array.isArray(registrySnapshot.migratedWrapperIds) ? registrySnapshot.migratedWrapperIds : [];
    const registryRegisteredIds = registrySnapshot && Array.isArray(registrySnapshot.migratedHookIdsRegistered) ? registrySnapshot.migratedHookIdsRegistered : [];
    const contractDetail = checkNamedContracts(['update-hooks-diet-recommendations-wrapper'], { executeChecks: opts.executeContractChecks !== false, page: opts.page });
    const hookId = 'diet:recommendations-visibility-after-update';
    return {
      ok: !!api &&
        api.VERSION === '1.6.0' &&
        !!dietApi &&
        (dietApi.version === '1.1.0' || dietApi.VERSION === '1.1.0') &&
        typeof dietApi.updateVisibilityAfterUpdate === 'function' &&
        typeof snapshotFn === 'function' &&
        !!(snapshot && snapshot.readOnly === true && snapshot.didCallWindowUpdate === false && snapshot.didRunHooks === false && snapshot.didPatchWindowUpdate === false) &&
        snapshot.migratedWrapperId === hookId &&
        snapshot.hookRegistered === true &&
        snapshot.legacyWrapperRemoved === true &&
        snapshot.hookOrder >= 30 &&
        snapshot.orderAfterAppHooks === true &&
        !!(registrySnapshot && registrySnapshot.appBridgeInstalled === true && registrySnapshot.migrationStatus === 'all-known-wrappers-migrated') &&
        registryMigratedIds.indexOf(hookId) >= 0 &&
        registryRegisteredIds.indexOf(hookId) >= 0 &&
        contractDetail.ok === true,
      version: api ? (api.VERSION || api.version || null) : null,
      dietVersion: dietApi ? (dietApi.version || dietApi.VERSION || null) : null,
      snapshot: snapshot ? clonePlain({
        kind: snapshot.kind,
        step: snapshot.step,
        readOnly: snapshot.readOnly,
        didCallWindowUpdate: snapshot.didCallWindowUpdate,
        didRunHooks: snapshot.didRunHooks,
        didPatchWindowUpdate: snapshot.didPatchWindowUpdate,
        migratedWrapperId: snapshot.migratedWrapperId,
        hookRegistered: snapshot.hookRegistered,
        hookRegisteredAtInstall: snapshot.hookRegisteredAtInstall,
        hookOrder: snapshot.hookOrder,
        orderAfterAppHooks: snapshot.orderAfterAppHooks,
        legacyWrapperRemoved: snapshot.legacyWrapperRemoved,
        finalWindowUpdateIsRegistryBridge: snapshot.finalWindowUpdateIsRegistryBridge,
        registry: snapshot.registry
      }, 5) : null,
      registrySnapshot: registrySnapshot ? clonePlain({
        step: registrySnapshot.step,
        version: registrySnapshot.version,
        appBridgeInstalled: registrySnapshot.appBridgeInstalled,
        migrationStatus: registrySnapshot.migrationStatus,
        migratedWrapperIds: registrySnapshot.migratedWrapperIds,
        migratedHookIdsRegistered: registrySnapshot.migratedHookIdsRegistered,
        dietRecommendationsHookId: registrySnapshot.dietRecommendationsHookId,
        dietRecommendationsHookRegistered: registrySnapshot.dietRecommendationsHookRegistered
      }, 5) : null,
      contractDetail
    };
  }


  function hasNutritionNormsScriptOnPage() {
    const doc = global.document;
    if (!doc || typeof doc.getElementsByTagName !== 'function') return !!global.nutritionNormsBuildCardModel;
    try {
      const scripts = Array.prototype.slice.call(doc.getElementsByTagName('script') || []);
      return scripts.some(function (script) {
        const src = script && script.getAttribute ? String(script.getAttribute('src') || '') : '';
        return src.indexOf('nutrition_norms.js') !== -1;
      });
    } catch (_) {
      return !!global.nutritionNormsBuildCardModel;
    }
  }

  function checkUpdateHooksNutritionNormsWrapper(options) {
    const opts = options || {};
    const scriptExpected = hasNutritionNormsScriptOnPage() || opts.page === 'index.html' || typeof global.nutritionNormsGetUpdateHookSnapshot === 'function';
    if (!scriptExpected) {
      return { ok: true, notApplicable: true, reason: 'nutrition_norms.js-not-loaded-on-this-page' };
    }

    const api = resolvePath('VildaUpdateHooks');
    const snapshotFn = resolvePath('vildaGetNutritionNormsUpdateHookSnapshot') || resolvePath('nutritionNormsGetUpdateHookSnapshot');
    let snapshot = null;
    if (typeof snapshotFn === 'function') {
      try { snapshot = snapshotFn({ includeEvents: opts.includeUpdateHookEvents === true }); } catch (error) { snapshot = { error: String(error && error.message ? error.message : error) }; }
    }
    const registrySnapshot = api && typeof api.getSnapshot === 'function' ? api.getSnapshot() : null;
    const registryMigratedIds = registrySnapshot && Array.isArray(registrySnapshot.migratedWrapperIds) ? registrySnapshot.migratedWrapperIds : [];
    const registryRegisteredIds = registrySnapshot && Array.isArray(registrySnapshot.migratedHookIdsRegistered) ? registrySnapshot.migratedHookIdsRegistered : [];
    const contractDetail = checkNamedContracts(['update-hooks-nutrition-norms-wrapper'], { executeChecks: opts.executeContractChecks !== false, page: opts.page || 'index.html' });
    const hookId = 'nutrition-norms:card-render-after-update';
    return {
      ok: !!api &&
        api.VERSION === '1.6.0' &&
        typeof global.nutritionNormsRenderAfterUpdate === 'function' &&
        typeof global.nutritionNormsRegisterAfterUpdateHook === 'function' &&
        typeof snapshotFn === 'function' &&
        !!(snapshot && snapshot.readOnly === true && snapshot.didCallWindowUpdate === false && snapshot.didRunHooks === false && snapshot.didPatchWindowUpdate === false) &&
        snapshot.migratedWrapperId === hookId &&
        snapshot.hookRegistered === true &&
        snapshot.legacyWrapperRemoved === true &&
        snapshot.finalWindowUpdateHasLegacyNutritionNormsWrapper === false &&
        snapshot.hookOrder === 40 &&
        snapshot.orderAfterDietRecommendations === true &&
        snapshot.orderBeforeNutritionMicrosTarget === true &&
        !!(registrySnapshot && registrySnapshot.appBridgeInstalled === true && registrySnapshot.nutritionNormsHookRegistered === true) &&
        registryMigratedIds.indexOf(hookId) >= 0 &&
        registryRegisteredIds.indexOf(hookId) >= 0 &&
        contractDetail.ok === true,
      version: api ? (api.VERSION || api.version || null) : null,
      snapshot: snapshot ? clonePlain({
        kind: snapshot.kind,
        step: snapshot.step,
        readOnly: snapshot.readOnly,
        didCallWindowUpdate: snapshot.didCallWindowUpdate,
        didRunHooks: snapshot.didRunHooks,
        didPatchWindowUpdate: snapshot.didPatchWindowUpdate,
        migratedWrapperId: snapshot.migratedWrapperId,
        hookRegistered: snapshot.hookRegistered,
        hookOrder: snapshot.hookOrder,
        orderAfterDietRecommendations: snapshot.orderAfterDietRecommendations,
        orderBeforeNutritionMicrosTarget: snapshot.orderBeforeNutritionMicrosTarget,
        legacyWrapperRemoved: snapshot.legacyWrapperRemoved,
        finalWindowUpdateHasLegacyNutritionNormsWrapper: snapshot.finalWindowUpdateHasLegacyNutritionNormsWrapper,
        finalWindowUpdateHasLegacyNutritionMicrosWrapper: snapshot.finalWindowUpdateHasLegacyNutritionMicrosWrapper,
        registry: snapshot.registry,
        finalChainAudit: snapshot.finalChainAudit
      }, 5) : null,
      registrySnapshot: registrySnapshot ? clonePlain({
        step: registrySnapshot.step,
        version: registrySnapshot.version,
        appBridgeInstalled: registrySnapshot.appBridgeInstalled,
        migrationStatus: registrySnapshot.migrationStatus,
        migratedWrapperIds: registrySnapshot.migratedWrapperIds,
        migratedHookIdsRegistered: registrySnapshot.migratedHookIdsRegistered,
        nutritionNormsHookId: registrySnapshot.nutritionNormsHookId,
        nutritionNormsHookRegistered: registrySnapshot.nutritionNormsHookRegistered
      }, 5) : null,
      contractDetail
    };
  }


  function hasNutritionMicrosScriptOnPage() {
    const doc = global.document;
    if (!doc || typeof doc.getElementsByTagName !== 'function') return !!global.nutritionMicrosBuildCardModel;
    try {
      const scripts = Array.prototype.slice.call(doc.getElementsByTagName('script') || []);
      return scripts.some(function (script) {
        const src = script && script.getAttribute ? String(script.getAttribute('src') || '') : '';
        return src.indexOf('nutrition_micros.js') !== -1;
      });
    } catch (_) {
      return !!global.nutritionMicrosBuildCardModel;
    }
  }

  function checkUpdateHooksNutritionMicrosWrapper(options) {
    const opts = options || {};
    const scriptExpected = hasNutritionMicrosScriptOnPage() || opts.page === 'index.html' || typeof global.nutritionMicrosGetUpdateHookSnapshot === 'function';
    if (!scriptExpected) {
      return { ok: true, notApplicable: true, reason: 'nutrition_micros.js-not-loaded-on-this-page' };
    }

    const api = resolvePath('VildaUpdateHooks');
    const snapshotFn = resolvePath('vildaGetNutritionMicrosUpdateHookSnapshot') || resolvePath('nutritionMicrosGetUpdateHookSnapshot');
    let snapshot = null;
    if (typeof snapshotFn === 'function') {
      try { snapshot = snapshotFn({ includeEvents: opts.includeUpdateHookEvents === true }); } catch (error) { snapshot = { error: String(error && error.message ? error.message : error) }; }
    }
    const registrySnapshot = api && typeof api.getSnapshot === 'function' ? api.getSnapshot() : null;
    const registryMigratedIds = registrySnapshot && Array.isArray(registrySnapshot.migratedWrapperIds) ? registrySnapshot.migratedWrapperIds : [];
    const registryRegisteredIds = registrySnapshot && Array.isArray(registrySnapshot.migratedHookIdsRegistered) ? registrySnapshot.migratedHookIdsRegistered : [];
    const contractDetail = checkNamedContracts(['update-hooks-nutrition-micros-wrapper'], { executeChecks: opts.executeContractChecks !== false, page: opts.page || 'index.html' });
    const hookId = 'nutrition-micros:card-render-after-update';
    return {
      ok: !!api &&
        api.VERSION === '1.6.0' &&
        !!(global.VildaNutritionMicros && (global.VildaNutritionMicros.VERSION === '1.2.0' || global.VildaNutritionMicros.version === '1.2.0')) &&
        typeof global.nutritionMicrosRenderAfterUpdate === 'function' &&
        typeof global.nutritionMicrosRegisterAfterUpdateHook === 'function' &&
        typeof snapshotFn === 'function' &&
        !!(snapshot && snapshot.readOnly === true && snapshot.didCallWindowUpdate === false && snapshot.didRunHooks === false && snapshot.didPatchWindowUpdate === false) &&
        snapshot.migratedWrapperId === hookId &&
        snapshot.hookRegistered === true &&
        snapshot.legacyWrapperRemoved === true &&
        snapshot.finalWindowUpdateHasLegacyNutritionMicrosWrapper === false &&
        snapshot.hookOrder === 50 &&
        snapshot.orderAfterNutritionNorms === true &&
        !!(registrySnapshot && registrySnapshot.appBridgeInstalled === true && registrySnapshot.nutritionMicrosHookRegistered === true) &&
        registryMigratedIds.indexOf(hookId) >= 0 &&
        registryRegisteredIds.indexOf(hookId) >= 0 &&
        contractDetail.ok === true,
      version: api ? (api.VERSION || api.version || null) : null,
      snapshot: snapshot ? clonePlain({
        kind: snapshot.kind,
        step: snapshot.step,
        readOnly: snapshot.readOnly,
        didCallWindowUpdate: snapshot.didCallWindowUpdate,
        didRunHooks: snapshot.didRunHooks,
        didPatchWindowUpdate: snapshot.didPatchWindowUpdate,
        migratedWrapperId: snapshot.migratedWrapperId,
        hookRegistered: snapshot.hookRegistered,
        hookOrder: snapshot.hookOrder,
        orderAfterNutritionNorms: snapshot.orderAfterNutritionNorms,
        legacyWrapperRemoved: snapshot.legacyWrapperRemoved,
        finalWindowUpdateHasLegacyNutritionMicrosWrapper: snapshot.finalWindowUpdateHasLegacyNutritionMicrosWrapper,
        registry: snapshot.registry,
        finalChainAudit: snapshot.finalChainAudit
      }, 5) : null,
      registrySnapshot: registrySnapshot ? clonePlain({
        step: registrySnapshot.step,
        version: registrySnapshot.version,
        appBridgeInstalled: registrySnapshot.appBridgeInstalled,
        migrationStatus: registrySnapshot.migrationStatus,
        migratedWrapperIds: registrySnapshot.migratedWrapperIds,
        migratedHookIdsRegistered: registrySnapshot.migratedHookIdsRegistered,
        nutritionMicrosHookId: registrySnapshot.nutritionMicrosHookId,
        nutritionMicrosHookRegistered: registrySnapshot.nutritionMicrosHookRegistered
      }, 5) : null,
      contractDetail
    };
  }


  function checkUpdateHooksFinalChainAudit(options) {
    const opts = options || {};
    const api = resolvePath('VildaUpdateHooks');
    const snapshotFn = resolvePath('vildaGetFinalUpdateChainAuditSnapshot') || resolvePath('vildaGetUpdateHooksFinalChainAuditSnapshot') || (api && typeof api.getFinalUpdateChainAuditSnapshot === 'function' ? api.getFinalUpdateChainAuditSnapshot : null);
    let snapshot = null;
    if (typeof snapshotFn === 'function') {
      try { snapshot = snapshotFn({ includeSourcePreview: opts.includeSourcePreview === true }); } catch (error) { snapshot = { error: String(error && error.message ? error.message : error) }; }
    }
    const expectedIds = ['app:bmi50-info-after-update', 'app:ideal-weight-ui-after-update', 'diet:recommendations-visibility-after-update', 'nutrition-norms:card-render-after-update', 'nutrition-micros:card-render-after-update'];
    const migratedIds = snapshot && Array.isArray(snapshot.knownMigratedWrapperIds) ? snapshot.knownMigratedWrapperIds : [];
    const audit = snapshot && snapshot.knownMigratedHookAudit ? snapshot.knownMigratedHookAudit : null;
    const contractDetail = checkNamedContracts(['update-hooks-final-chain-audit'], { executeChecks: opts.executeContractChecks !== false, page: opts.page });
    return {
      ok: !!api &&
        api.VERSION === '1.6.0' &&
        typeof api.getFinalUpdateChainAuditSnapshot === 'function' &&
        typeof snapshotFn === 'function' &&
        !!(snapshot && snapshot.readOnly === true && snapshot.didCallWindowUpdate === false && snapshot.didRunHooks === false && snapshot.didPatchWindowUpdate === false) &&
        snapshot.allKnownWrappersMigrated === true &&
        snapshot.knownMigrationHookOrderValid === true &&
        snapshot.hookOrderExpected === true &&
        snapshot.registryBridgeFoundInFinalChain === true &&
        snapshot.hiddenWrappersOutsideKnownMigration === false &&
        Array.isArray(snapshot.outOfScopeRemainingWrapperIds) && snapshot.outOfScopeRemainingWrapperIds.length === 0 &&
        Array.isArray(snapshot.legacyMigratedWrapperIdsInChain) && snapshot.legacyMigratedWrapperIdsInChain.length === 0 &&
        expectedIds.every(function (id) { return migratedIds.indexOf(id) >= 0; }) &&
        !!(audit && Array.isArray(audit.entries) && audit.entries.length >= 5 && audit.missingIds.length === 0) &&
        contractDetail.ok === true,
      version: api ? (api.VERSION || api.version || null) : null,
      snapshot: snapshot ? clonePlain({
        kind: snapshot.kind,
        step: snapshot.step,
        readOnly: snapshot.readOnly,
        allKnownWrappersMigrated: snapshot.allKnownWrappersMigrated,
        knownMigrationHookOrderValid: snapshot.knownMigrationHookOrderValid,
        hookOrderExpected: snapshot.hookOrderExpected,
        finalWindowUpdateOwner: snapshot.finalWindowUpdateOwner,
        registryBridgeFoundInFinalChain: snapshot.registryBridgeFoundInFinalChain,
        downstreamWrappersMayExist: snapshot.downstreamWrappersMayExist,
        hiddenWrappersOutsideKnownMigration: snapshot.hiddenWrappersOutsideKnownMigration,
        outOfScopeRemainingWrapperIds: snapshot.outOfScopeRemainingWrapperIds,
        legacyMigratedWrapperIdsInChain: snapshot.legacyMigratedWrapperIdsInChain,
        conclusion: snapshot.conclusion,
        warnings: snapshot.warnings
      }, 6) : null,
      contractDetail
    };
  }


  function checkGhTherapyIndexedDbResourceAudit(options) {
    const opts = options || {};
    const api = resolvePath('VildaGHTherapyResourceAudit');
    const snapshotFn = resolvePath('vildaGetGHTherapyIndexedDbAuditSnapshot') ||
      (api && typeof api.getSnapshot === 'function' ? api.getSnapshot : null);
    let snapshot = null;
    if (typeof snapshotFn === 'function' && opts.includeGhTherapyResourceAuditSnapshot !== false) {
      try { snapshot = snapshotFn({ includePlan: true }); } catch (error) { snapshot = { error: String(error && error.message ? error.message : error) }; }
    }
    const contractDetail = checkNamedContracts(DEFAULT_GH_THERAPY_RESOURCE_AUDIT_CONTRACTS.slice(), { executeChecks: opts.executeContractChecks !== false, page: opts.page });
    const database = snapshot && snapshot.database ? snapshot.database : null;
    const closeCoverage = database && database.closeCoverage ? database.closeCoverage : null;
    const onVersionChangeCoverage = database && database.onVersionChangeCoverage ? database.onVersionChangeCoverage : null;
    const broadcast = snapshot && snapshot.broadcastChannel ? snapshot.broadcastChannel : null;
    const broadcastCoverage = broadcast && broadcast.coverage ? broadcast.coverage : null;
    const mutationObserver = snapshot && snapshot.mutationObserver ? snapshot.mutationObserver : null;
    const mutationObserverCoverage = mutationObserver && mutationObserver.coverage ? mutationObserver.coverage : null;
    const asyncFetch = snapshot && snapshot.asyncFetch ? snapshot.asyncFetch : null;
    const asyncFetchCoverage = asyncFetch && asyncFetch.coverage ? asyncFetch.coverage : null;
    const summary = snapshot && snapshot.summary ? snapshot.summary : null;
    return {
      ok: !!api &&
        api.VERSION === '1.10.0' &&
        typeof api.getSnapshot === 'function' &&
        typeof api.getGHTherapyIndexedDbAuditSnapshot === 'function' &&
        typeof api.getApiSurfaceStatus === 'function' &&
        typeof snapshotFn === 'function' &&
        !!(snapshot && snapshot.step === '8O-11k' && snapshot.readOnly === true && snapshot.openedIndexedDb === false && snapshot.queriedIndexedDb === false && snapshot.changedTherapyData === false && snapshot.postedBroadcastMessage === false && snapshot.performedFetch === false && snapshot.fetchedAsyncResource === false) &&
        !!(snapshot.cleanupApplied && snapshot.cleanupApplied.indexedDbClose === true && snapshot.cleanupApplied.onVersionChange === true && snapshot.cleanupApplied.broadcastChannelLifecycle === true && snapshot.cleanupApplied.mutationObserverLifecycle === true && snapshot.cleanupApplied.mutationObserverScope === true && snapshot.cleanupApplied.fetchTimeout === true && snapshot.cleanupApplied.asyncFetchTimeout === true && snapshot.cleanupApplied.serviceWorkerTimeoutExemption === true && snapshot.cleanupApplied.serviceWorkerFetchCacheStrategy === true && snapshot.cleanupApplied.serviceWorkerOfflineUpdateFlowSmoke === true && snapshot.cleanupApplied.serviceWorkerVersionedShellCacheKey === true && snapshot.cleanupApplied.serviceWorkerStaleCachePruningAudit === true && snapshot.cleanupApplied.serviceWorkerRuntimeCachePruning === true) &&
        !!(snapshot.applicationBroadcastLifecycleHandlersRegistered === true && snapshot.broadcastChannelLifecycleCleanupApplied === true) &&
        !!(snapshot.applicationMutationObserverLifecycleHandlersRegistered === true && snapshot.mutationObserverLifecycleCleanupApplied === true && snapshot.mutationObserverScopeCleanupApplied === true && snapshot.fetchTimeoutCleanupApplied === true && snapshot.asyncFetchTimeoutCleanupApplied === true && snapshot.serviceWorkerTimeoutExemptionAuditApplied === true && snapshot.serviceWorkerCacheStrategyAuditApplied === true && snapshot.serviceWorkerOfflineUpdateFlowSmokeApplied === true && snapshot.serviceWorkerOfflineUpdateFlowSmokeDefined === true && snapshot.serviceWorkerVersionedShellCacheKeyFixApplied === true && snapshot.serviceWorkerStaleCachePruningAuditApplied === true && snapshot.serviceWorkerRuntimeCacheGrowthRiskAudited === true && snapshot.scope && snapshot.scope.serviceWorkerRuntimeCachePruningImplemented === true) &&
        !!(database && database.name === 'ghTherapyDB' && database.store === 'ghTherapyPoints' && Array.isArray(database.openFunctions) && database.openFunctions.length >= 6) &&
        !!(closeCoverage && closeCoverage.needsCleanup === false && closeCoverage.allKnownTransactionOperationsCovered === true && Array.isArray(closeCoverage.missingCloseIds) && closeCoverage.missingCloseIds.length === 0 && Array.isArray(closeCoverage.partialCloseIds) && closeCoverage.partialCloseIds.length === 0 && Array.isArray(closeCoverage.fullCloseIds) && closeCoverage.fullCloseIds.indexOf('app:getTherapyPointsFromDB') >= 0 && closeCoverage.fullCloseIds.indexOf('app:clearTherapyPointsInDB') >= 0 && closeCoverage.fullCloseIds.indexOf('gh-monitor:saveTherapyPointsToDB') >= 0) &&
        !!(onVersionChangeCoverage && onVersionChangeCoverage.needsCleanup === false && Array.isArray(onVersionChangeCoverage.missingIds) && onVersionChangeCoverage.missingIds.length === 0 && Array.isArray(onVersionChangeCoverage.coveredIds) && onVersionChangeCoverage.coveredIds.indexOf('app:openGHTherapyDB') >= 0 && onVersionChangeCoverage.coveredIds.indexOf('gh-monitor:openTherapyDB') >= 0) &&
        !!(broadcast && broadcast.channelName === 'gh-therapy-sync' && Array.isArray(broadcast.locations) && broadcast.locations.length >= 3) &&
        !!(broadcastCoverage && broadcastCoverage.needsCleanup === false && broadcastCoverage.hasCloseHandlers === true && Array.isArray(broadcastCoverage.missingCloseHandlerIds) && broadcastCoverage.missingCloseHandlerIds.length === 0 && Array.isArray(broadcastCoverage.lifecycleCoveredIds) && broadcastCoverage.lifecycleCoveredIds.indexOf('app:ghTherapyBroadcastChannel') >= 0 && broadcastCoverage.lifecycleCoveredIds.indexOf('gh-monitor:ghTherapyBroadcastChannel') >= 0) &&
        !!(mutationObserver && Array.isArray(mutationObserver.locations) && mutationObserver.locations.length >= 1 && mutationObserver.watchedSelector === '#ghIgfTherapyCard') &&
        !!(mutationObserverCoverage && mutationObserverCoverage.needsCleanup === false && mutationObserverCoverage.hasDisconnectHandlers === true && Array.isArray(mutationObserverCoverage.missingDisconnectIds) && mutationObserverCoverage.missingDisconnectIds.length === 0 && Array.isArray(mutationObserverCoverage.disconnectCoveredIds) && mutationObserverCoverage.disconnectCoveredIds.indexOf('gh-monitor:ghTherapyMonitorDomObserver') >= 0 && Array.isArray(mutationObserverCoverage.scopedIds) && mutationObserverCoverage.scopedIds.indexOf('gh-monitor:ghTherapyMonitorDomObserver') >= 0 && Array.isArray(mutationObserverCoverage.bodyOnlyIds) && mutationObserverCoverage.bodyOnlyIds.length === 0) &&
        !!(asyncFetch && Array.isArray(asyncFetch.locations) && asyncFetch.locations.length >= 8 && Array.isArray(asyncFetch.helperNames) && asyncFetch.helperNames.indexOf('vildaFetchJsonWithTimeout') >= 0) &&
        !!(asyncFetchCoverage && asyncFetchCoverage.needsCleanup === false && asyncFetchCoverage.allInScopeFetchesCovered === true && Array.isArray(asyncFetchCoverage.missingTimeoutIds) && asyncFetchCoverage.missingTimeoutIds.length === 0 && Array.isArray(asyncFetchCoverage.missingServiceWorkerTimeoutExemptionIds) && asyncFetchCoverage.missingServiceWorkerTimeoutExemptionIds.length === 0 && Array.isArray(asyncFetchCoverage.missingErrorClassificationIds) && asyncFetchCoverage.missingErrorClassificationIds.length === 0 && Array.isArray(asyncFetchCoverage.timeoutCoveredIds) && asyncFetchCoverage.timeoutCoveredIds.indexOf('nutrition-micros:fetchJsonCandidates') >= 0 && asyncFetchCoverage.timeoutCoveredIds.indexOf('macro-practice:macroPracticeFetchJsonCandidates') >= 0 && asyncFetchCoverage.timeoutCoveredIds.indexOf('clcr:normsXlsxArrayBuffer') >= 0 && Array.isArray(asyncFetchCoverage.serviceWorkerTimeoutExemptIds) && asyncFetchCoverage.serviceWorkerTimeoutExemptIds.indexOf('service-worker:updateShellFromNetwork') >= 0 && asyncFetchCoverage.serviceWorkerTimeoutExemptIds.indexOf('service-worker:updateRuntimeFromNetwork') >= 0 && asyncFetchCoverage.serviceWorkerTimeoutExemptIds.indexOf('service-worker:fetchAndStorePrecacheUrl') >= 0 && Array.isArray(asyncFetchCoverage.outOfScopeIds) && asyncFetchCoverage.outOfScopeIds.length === 0 && asyncFetchCoverage.serviceWorkerFetchesDeferred === false && asyncFetchCoverage.serviceWorkerCacheStrategyPreserved === true && asyncFetchCoverage.serviceWorkerTimeoutExemptionAuditComplete === true) &&
        !!(summary && summary.cleanupRecommended === false && summary.allKnownDbCloseOperationsCovered === true && summary.indexedDbCloseCleanupRecommended === false && summary.missingOnVersionChangeCount === 0 && summary.allKnownOnVersionChangeOpenersCovered === true && summary.onVersionChangeCleanupRecommended === false && summary.missingBroadcastCloseHandlerCount === 0 && summary.broadcastChannelLifecycleCleanupComplete === true && summary.broadcastChannelLifecycleCleanupRecommended === false && summary.missingMutationObserverDisconnectCount === 0 && summary.mutationObserverLifecycleCleanupComplete === true && summary.mutationObserverScopeCleanupComplete === true && summary.mutationObserverLifecycleCleanupRecommended === false && summary.missingFetchTimeoutCount === 0 && summary.missingFetchErrorClassificationCount === 0 && summary.fetchTimeoutCleanupComplete === true && summary.asyncFetchTimeoutCleanupComplete === true && summary.missingServiceWorkerTimeoutExemptionCount === 0 && summary.serviceWorkerTimeoutExemptionAuditComplete === true && summary.serviceWorkerFetchCacheStrategyAuditComplete === true && summary.serviceWorkerCacheStrategyPreserved === true && summary.serviceWorkerFetchesDeferred === false && summary.fetchTimeoutCleanupRecommended === false && summary.serviceWorkerFetchCacheStrategyCleanupRecommended === false && summary.serviceWorkerOfflineUpdateFlowSmokeDefined === true && summary.serviceWorkerOfflineUpdateFlowSmokeComplete === true && summary.serviceWorkerOfflineFallbackSmokeCovered === true && summary.serviceWorkerUpdateFlowSmokeCovered === true && summary.serviceWorkerE2ESmokeUsesMockedCacheOnly === true && summary.serviceWorkerE2ESmokeStrategyPreserved === true && summary.serviceWorkerStaleCachePruningAuditComplete === true && summary.serviceWorkerStaleShellCachePruneCovered === true && summary.serviceWorkerOldRuntimeCacheMigrationCovered === true && summary.serviceWorkerCurrentRuntimeCachePreserved === true && summary.serviceWorkerUnrelatedCachesPreserved === true && summary.serviceWorkerRuntimeCacheGrowthRiskAudited === true && summary.serviceWorkerRuntimeCachePruningImplemented === true && summary.serviceWorkerRuntimeCachePruningRecommendedFollowUp === false && summary.serviceWorkerRuntimeCacheMetadataCovered === true && summary.serviceWorkerRuntimeCacheTtlPruneCovered === true && summary.serviceWorkerRuntimeCacheMaxEntryPruneCovered === true) &&
        contractDetail.ok === true,
      version: api ? (api.VERSION || api.version || null) : null,
      snapshot: snapshot ? clonePlain({
        kind: snapshot.kind,
        step: snapshot.step,
        readOnly: snapshot.readOnly,
        openedIndexedDb: snapshot.openedIndexedDb,
        queriedIndexedDb: snapshot.queriedIndexedDb,
        changedTherapyData: snapshot.changedTherapyData,
        postedBroadcastMessage: snapshot.postedBroadcastMessage,
        database: {
          name: database ? database.name : null,
          store: database ? database.store : null,
          openFunctionsCount: database && Array.isArray(database.openFunctions) ? database.openFunctions.length : null,
          closeCoverage,
          onVersionChangeCoverage
        },
        broadcastChannel: {
          channelName: broadcast ? broadcast.channelName : null,
          locationsCount: broadcast && Array.isArray(broadcast.locations) ? broadcast.locations.length : null,
          coverage: broadcastCoverage
        },
        mutationObserver: {
          locationsCount: mutationObserver && Array.isArray(mutationObserver.locations) ? mutationObserver.locations.length : null,
          watchedSelector: mutationObserver ? mutationObserver.watchedSelector || null : null,
          coverage: mutationObserverCoverage
        },
        asyncFetch: {
          locationsCount: asyncFetch && Array.isArray(asyncFetch.locations) ? asyncFetch.locations.length : null,
          helperNames: asyncFetch && Array.isArray(asyncFetch.helperNames) ? asyncFetch.helperNames.slice() : [],
          coverage: asyncFetchCoverage
        },
        summary
      }, 6) : null,
      contractDetail
    };
  }


  function checkFetchTimeoutCleanup(options) {
    const opts = options || {};
    const helpers = resolvePath('VildaAppHelpers');
    const audit = resolvePath('VildaGHTherapyResourceAudit');
    const snapshot = audit && typeof audit.getSnapshot === 'function' ? audit.getSnapshot({ includePlan: false }) : null;
    const asyncFetch = snapshot && snapshot.asyncFetch ? snapshot.asyncFetch : null;
    const coverage = asyncFetch && asyncFetch.coverage ? asyncFetch.coverage : null;
    const contractDetail = checkNamedContracts(['fetch-timeout-cleanup'], { executeChecks: opts.executeContractChecks !== false, page: opts.page });
    const helperChecks = {
      fetchWithTimeout: !!(helpers && typeof helpers.fetchWithTimeout === 'function' && typeof global.vildaFetchWithTimeout === 'function'),
      fetchJsonWithTimeout: !!(helpers && typeof helpers.fetchJsonWithTimeout === 'function' && typeof global.vildaFetchJsonWithTimeout === 'function'),
      fetchArrayBufferWithTimeout: !!(helpers && typeof helpers.fetchArrayBufferWithTimeout === 'function' && typeof global.vildaFetchArrayBufferWithTimeout === 'function'),
      fetchBlobWithTimeout: !!(helpers && typeof helpers.fetchBlobWithTimeout === 'function' && typeof global.vildaFetchBlobWithTimeout === 'function')
    };
    return {
      ok: Object.keys(helperChecks).every(function (key) { return helperChecks[key] === true; }) &&
        !!(snapshot && snapshot.step === '8O-11k' && snapshot.performedFetch === false && snapshot.fetchTimeoutCleanupApplied === true) &&
        !!(coverage && coverage.needsCleanup === false && coverage.allInScopeFetchesCovered === true && Array.isArray(coverage.missingTimeoutIds) && coverage.missingTimeoutIds.length === 0 && Array.isArray(coverage.missingErrorClassificationIds) && coverage.missingErrorClassificationIds.length === 0) &&
        contractDetail.ok === true,
      helperChecks,
      coverage: coverage ? clonePlain(coverage, 5) : null,
      contractDetail
    };
  }


  function checkServiceWorkerFetchCacheStrategy(options) {
    const opts = options || {};
    const audit = resolvePath('VildaGHTherapyResourceAudit');
    const snapshot = audit && typeof audit.getSnapshot === 'function' ? audit.getSnapshot({ includePlan: false }) : null;
    const serviceWorker = snapshot && snapshot.serviceWorker ? snapshot.serviceWorker : null;
    const coverage = serviceWorker && serviceWorker.coverage ? serviceWorker.coverage : null;
    const asyncFetch = snapshot && snapshot.asyncFetch ? snapshot.asyncFetch : null;
    const asyncCoverage = asyncFetch && asyncFetch.coverage ? asyncFetch.coverage : null;
    const summary = snapshot && snapshot.summary ? snapshot.summary : null;
    const contractDetail = checkNamedContracts(['service-worker-fetch-cache-strategy'], { executeChecks: opts.executeContractChecks !== false, page: opts.page });
    const timeoutExemptIds = coverage && Array.isArray(coverage.timeoutExemptIds) ? coverage.timeoutExemptIds : [];
    const asyncTimeoutExemptIds = asyncCoverage && Array.isArray(asyncCoverage.serviceWorkerTimeoutExemptIds) ? asyncCoverage.serviceWorkerTimeoutExemptIds : [];
    const requiredStrategyIds = [
      'service-worker:install-precache-required-and-optional',
      'service-worker:navigation-cache-first-background-refresh',
      'service-worker:shell-asset-cache-first-background-refresh',
      'service-worker:runtime-cache-first-background-refresh'
    ];
    const requiredFetchIds = ['service-worker:updateShellFromNetwork', 'service-worker:updateRuntimeFromNetwork', 'service-worker:fetchAndStorePrecacheUrl'];
    return {
      ok: !!(snapshot && snapshot.step === '8O-11k' && snapshot.performedFetch === false && snapshot.serviceWorkerTimeoutExemptionAuditApplied === true && snapshot.serviceWorkerCacheStrategyAuditApplied === true && snapshot.serviceWorkerOfflineUpdateFlowSmokeApplied === true && snapshot.serviceWorkerOfflineUpdateFlowSmokeDefined === true && snapshot.serviceWorkerVersionedShellCacheKeyFixApplied === true && snapshot.serviceWorkerStaleCachePruningAuditApplied === true && snapshot.serviceWorkerRuntimeCacheGrowthRiskAudited === true && snapshot.scope && snapshot.scope.serviceWorkerRuntimeCachePruningImplemented === true) &&
        !!(serviceWorker && serviceWorker.readOnly === true && serviceWorker.touchedCacheApi === false && serviceWorker.noSemanticChanges === true && serviceWorker.timeoutPolicyAudited === true) &&
        !!(coverage && coverage.needsCleanup === false && coverage.cacheStrategyAuditComplete === true && coverage.noCacheSemanticsChanges === true && coverage.noOfflineSemanticsChanges === true && coverage.allKnownServiceWorkerTimeoutExemptionsAudited === true) &&
        requiredStrategyIds.every(function (id) { return timeoutExemptIds.indexOf(id) >= 0; }) &&
        requiredFetchIds.every(function (id) { return asyncTimeoutExemptIds.indexOf(id) >= 0; }) &&
        !!(summary && summary.missingServiceWorkerTimeoutExemptionCount === 0 && summary.serviceWorkerTimeoutExemptionAuditComplete === true && summary.serviceWorkerFetchCacheStrategyAuditComplete === true && summary.serviceWorkerCacheStrategyPreserved === true && summary.serviceWorkerFetchesDeferred === false) &&
        contractDetail.ok === true,
      requiredStrategyIds,
      requiredFetchIds,
      timeoutExemptIds: timeoutExemptIds.slice(),
      asyncTimeoutExemptIds: asyncTimeoutExemptIds.slice(),
      serviceWorkerTimeoutPolicy: serviceWorker ? serviceWorker.timeoutPolicy || null : null,
      summary: summary ? clonePlain({
        serviceWorkerFetchesDeferred: summary.serviceWorkerFetchesDeferred,
        missingServiceWorkerTimeoutExemptionCount: summary.missingServiceWorkerTimeoutExemptionCount,
        serviceWorkerTimeoutExemptionAuditComplete: summary.serviceWorkerTimeoutExemptionAuditComplete,
        serviceWorkerFetchCacheStrategyAuditComplete: summary.serviceWorkerFetchCacheStrategyAuditComplete,
        serviceWorkerCacheStrategyPreserved: summary.serviceWorkerCacheStrategyPreserved
      }, 3) : null,
      contractDetail
    };
  }



  function checkServiceWorkerOfflineUpdateFlowSmoke(options) {
    const opts = options || {};
    const audit = resolvePath('VildaGHTherapyResourceAudit');
    const snapshot = audit && typeof audit.getSnapshot === 'function' ? audit.getSnapshot({ includePlan: false }) : null;
    const serviceWorker = snapshot && snapshot.serviceWorker ? snapshot.serviceWorker : null;
    const smoke = serviceWorker && serviceWorker.offlineUpdateFlowSmoke ? serviceWorker.offlineUpdateFlowSmoke : null;
    const coverage = smoke && smoke.coverage ? smoke.coverage : null;
    const summary = snapshot && snapshot.summary ? snapshot.summary : null;
    const contractDetail = checkNamedContracts(['service-worker-offline-update-flow-smoke'], { executeChecks: opts.executeContractChecks !== false, page: opts.page });
    const scenarioIds = coverage && Array.isArray(coverage.expectedScenarioIds) ? coverage.expectedScenarioIds : [];
    const requiredScenarioIds = [
      'service-worker:e2e-install-required-shell-precache',
      'service-worker:e2e-activate-runtime-migration-prune',
      'service-worker:e2e-navigation-cache-first-background-refresh',
      'service-worker:e2e-navigation-offline-document-fallback',
      'service-worker:e2e-runtime-cache-first-background-refresh',
      'service-worker:e2e-runtime-offline-cache-hit-fallback',
      'service-worker:e2e-activate-stale-cache-pruning-scope',
      'service-worker:e2e-runtime-cache-growth-risk-audit',
      'service-worker:e2e-runtime-cache-ttl-prune',
      'service-worker:e2e-runtime-cache-max-entry-prune',
      'service-worker:e2e-message-skip-waiting-update-flow'
    ];
    return {
      ok: !!(snapshot && snapshot.step === '8O-11k' && snapshot.serviceWorkerOfflineUpdateFlowSmokeApplied === true && snapshot.serviceWorkerOfflineUpdateFlowSmokeDefined === true && snapshot.serviceWorkerVersionedShellCacheKeyFixApplied === true && snapshot.serviceWorkerStaleCachePruningAuditApplied === true && snapshot.serviceWorkerRuntimeCacheGrowthRiskAudited === true && snapshot.scope && snapshot.scope.serviceWorkerRuntimeCachePruningImplemented === true) &&
        !!(smoke && smoke.tool === 'tools/service_worker_offline_update_flow_smoke.js' && Array.isArray(smoke.scenarios) && smoke.scenarios.length >= requiredScenarioIds.length) &&
        !!(coverage && coverage.needsCleanup === false && coverage.smokeToolDefined === true && coverage.smokeUsesMockedCacheApiOnly === true && coverage.smokeDoesNotRegisterRealServiceWorker === true && coverage.noServiceWorkerStrategyChanges === true && coverage.offlineFallbackSmokeCovered === true && coverage.updateFlowSmokeCovered === true && coverage.backgroundRefreshSmokeCovered === true) &&
        requiredScenarioIds.every(function (id) { return scenarioIds.indexOf(id) >= 0; }) &&
        !!(summary && summary.serviceWorkerOfflineUpdateFlowSmokeDefined === true && summary.serviceWorkerOfflineUpdateFlowSmokeComplete === true && summary.serviceWorkerOfflineFallbackSmokeCovered === true && summary.serviceWorkerUpdateFlowSmokeCovered === true && summary.serviceWorkerE2ESmokeUsesMockedCacheOnly === true && summary.serviceWorkerE2ESmokeStrategyPreserved === true) &&
        contractDetail.ok === true,
      requiredScenarioIds,
      scenarioIds: scenarioIds.slice(),
      coverage: coverage ? clonePlain(coverage, 5) : null,
      summary: summary ? clonePlain({
        serviceWorkerOfflineUpdateFlowSmokeDefined: summary.serviceWorkerOfflineUpdateFlowSmokeDefined,
        serviceWorkerOfflineUpdateFlowSmokeComplete: summary.serviceWorkerOfflineUpdateFlowSmokeComplete,
        serviceWorkerOfflineFallbackSmokeCovered: summary.serviceWorkerOfflineFallbackSmokeCovered,
        serviceWorkerUpdateFlowSmokeCovered: summary.serviceWorkerUpdateFlowSmokeCovered,
        serviceWorkerE2ESmokeUsesMockedCacheOnly: summary.serviceWorkerE2ESmokeUsesMockedCacheOnly,
        serviceWorkerE2ESmokeStrategyPreserved: summary.serviceWorkerE2ESmokeStrategyPreserved
      }, 3) : null,
      contractDetail
    };
  }


  function checkServiceWorkerVersionedShellCacheKey(options) {
    const opts = options || {};
    const audit = resolvePath('VildaGHTherapyResourceAudit');
    const snapshot = audit && typeof audit.getSnapshot === 'function' ? audit.getSnapshot({ includePlan: false }) : null;
    const serviceWorker = snapshot && snapshot.serviceWorker ? snapshot.serviceWorker : null;
    const versioned = serviceWorker && serviceWorker.versionedShellCacheKey ? serviceWorker.versionedShellCacheKey : null;
    const coverage = versioned && versioned.coverage ? versioned.coverage : null;
    const summary = snapshot && snapshot.summary ? snapshot.summary : null;
    const contractDetail = checkNamedContracts(['service-worker-versioned-shell-cache-key'], { executeChecks: opts.executeContractChecks !== false, page: opts.page });
    return {
      ok: !!(snapshot && snapshot.step === '8O-11k' && snapshot.serviceWorkerVersionedShellCacheKeyFixApplied === true && snapshot.serviceWorkerStaleCachePruningAuditApplied === true) &&
        !!(serviceWorker && serviceWorker.versionedShellCacheKeyFixApplied === true && versioned && Array.isArray(versioned.locations) && versioned.locations.length >= 3) &&
        !!(coverage && coverage.needsCleanup === false && coverage.precacheAndFetchCacheKeysAligned === true && coverage.e2eOfflineHitCovered === true && coverage.mockedCacheApiOnly === true && Array.isArray(coverage.missingCacheKeySearchIds) && coverage.missingCacheKeySearchIds.length === 0 && Array.isArray(coverage.missingAlignmentIds) && coverage.missingAlignmentIds.length === 0 && Array.isArray(coverage.missingE2EIds) && coverage.missingE2EIds.length === 0) &&
        !!(summary && summary.serviceWorkerVersionedShellCacheKeyFixComplete === true && summary.serviceWorkerVersionedShellCacheKeyPrecacheAndFetchConsistent === true && summary.serviceWorkerVersionedShellCacheKeyE2ESmokeCovered === true) &&
        contractDetail.ok === true,
      coverage: coverage ? clonePlain(coverage, 5) : null,
      summary: summary ? clonePlain({
        serviceWorkerVersionedShellCacheKeyFixComplete: summary.serviceWorkerVersionedShellCacheKeyFixComplete,
        serviceWorkerVersionedShellCacheKeyPrecacheAndFetchConsistent: summary.serviceWorkerVersionedShellCacheKeyPrecacheAndFetchConsistent,
        serviceWorkerVersionedShellCacheKeyE2ESmokeCovered: summary.serviceWorkerVersionedShellCacheKeyE2ESmokeCovered
      }, 3) : null,
      contractDetail
    };
  }


  function checkServiceWorkerStaleCachePruningAudit(options) {
    const opts = options || {};
    const audit = resolvePath('VildaGHTherapyResourceAudit');
    const snapshot = audit && typeof audit.getSnapshot === 'function' ? audit.getSnapshot({ includePlan: false }) : null;
    const serviceWorker = snapshot && snapshot.serviceWorker ? snapshot.serviceWorker : null;
    const pruning = serviceWorker && serviceWorker.staleCachePruning ? serviceWorker.staleCachePruning : null;
    const coverage = pruning && pruning.coverage ? pruning.coverage : null;
    const summary = snapshot && snapshot.summary ? snapshot.summary : null;
    const contractDetail = checkNamedContracts(['service-worker-stale-cache-pruning-audit'], { executeChecks: opts.executeContractChecks !== false, page: opts.page });
    return {
      ok: !!(snapshot && snapshot.step === '8O-11k' && snapshot.serviceWorkerStaleCachePruningAuditApplied === true && snapshot.serviceWorkerRuntimeCacheGrowthRiskAudited === true && snapshot.scope && snapshot.scope.serviceWorkerRuntimeCachePruningImplemented === true) &&
        !!(serviceWorker && serviceWorker.staleCachePruningAuditApplied === true && serviceWorker.runtimeCacheGrowthRiskAudited === true && serviceWorker.runtimeCachePruningImplemented === true && serviceWorker.runtimeCachePruningRecommendedFollowUp === false) &&
        !!(pruning && Array.isArray(pruning.locations) && pruning.locations.length >= 6) &&
        !!(coverage && coverage.needsCleanup === false && coverage.staleShellCachePruneCovered === true && coverage.oldRuntimeCacheMigrationCovered === true && coverage.currentRuntimeCachePreserved === true && coverage.unrelatedCachesPreserved === true && coverage.runtimeCacheGrowthRiskAudited === true && coverage.runtimeCachePruningImplemented === true && coverage.runtimeCachePruningRecommendedFollowUp === false && coverage.runtimeCacheMetadataCovered === true && coverage.runtimeCacheTtlPruneCovered === true && coverage.runtimeCacheMaxEntryPruneCovered === true && coverage.e2eScopeCovered === true && coverage.noServiceWorkerCacheStrategyChanges === true && coverage.noOfflineFallbackChanges === true) &&
        !!(summary && summary.serviceWorkerStaleCachePruningAuditComplete === true && summary.serviceWorkerStaleShellCachePruneCovered === true && summary.serviceWorkerOldRuntimeCacheMigrationCovered === true && summary.serviceWorkerCurrentRuntimeCachePreserved === true && summary.serviceWorkerUnrelatedCachesPreserved === true && summary.serviceWorkerRuntimeCacheGrowthRiskAudited === true && summary.serviceWorkerRuntimeCachePruningImplemented === true && summary.serviceWorkerRuntimeCachePruningRecommendedFollowUp === false && summary.serviceWorkerRuntimeCacheMetadataCovered === true && summary.serviceWorkerRuntimeCacheTtlPruneCovered === true && summary.serviceWorkerRuntimeCacheMaxEntryPruneCovered === true && summary.serviceWorkerStaleCachePruningCleanupRecommended === false) &&
        contractDetail.ok === true,
      coverage: coverage ? clonePlain(coverage, 5) : null,
      summary: summary ? clonePlain({
        serviceWorkerStaleCachePruningAuditComplete: summary.serviceWorkerStaleCachePruningAuditComplete,
        serviceWorkerStaleShellCachePruneCovered: summary.serviceWorkerStaleShellCachePruneCovered,
        serviceWorkerOldRuntimeCacheMigrationCovered: summary.serviceWorkerOldRuntimeCacheMigrationCovered,
        serviceWorkerCurrentRuntimeCachePreserved: summary.serviceWorkerCurrentRuntimeCachePreserved,
        serviceWorkerUnrelatedCachesPreserved: summary.serviceWorkerUnrelatedCachesPreserved,
        serviceWorkerRuntimeCacheGrowthRiskAudited: summary.serviceWorkerRuntimeCacheGrowthRiskAudited,
        serviceWorkerRuntimeCachePruningImplemented: summary.serviceWorkerRuntimeCachePruningImplemented,
        serviceWorkerRuntimeCachePruningRecommendedFollowUp: summary.serviceWorkerRuntimeCachePruningRecommendedFollowUp
      }, 3) : null,
      contractDetail
    };
  }


  function checkServiceWorkerRuntimeCachePruning(options) {
    const opts = options || {};
    const audit = resolvePath('VildaGHTherapyResourceAudit');
    const snapshot = audit && typeof audit.getSnapshot === 'function' ? audit.getSnapshot({ includePlan: false }) : null;
    const serviceWorker = snapshot && snapshot.serviceWorker ? snapshot.serviceWorker : null;
    const pruning = serviceWorker && serviceWorker.runtimeCachePruning ? serviceWorker.runtimeCachePruning : null;
    const coverage = pruning && pruning.coverage ? pruning.coverage : null;
    const summary = snapshot && snapshot.summary ? snapshot.summary : null;
    const contractDetail = checkNamedContracts(['service-worker-runtime-cache-pruning'], { executeChecks: opts.executeContractChecks !== false, page: opts.page });
    return {
      ok: !!(snapshot && snapshot.step === '8O-11k' && snapshot.cleanupApplied && snapshot.cleanupApplied.serviceWorkerRuntimeCachePruning === true) &&
        !!(serviceWorker && serviceWorker.runtimeCachePruningImplemented === true && serviceWorker.runtimeCachePruningRecommendedFollowUp === false && serviceWorker.runtimeCacheMaxEntries === 96 && serviceWorker.runtimeCacheTtlMs === 2592000000) &&
        !!(pruning && pruning.maxEntries === 96 && pruning.ttlMs === 2592000000 && pruning.metadataKeyPrefix === '/__vilda_runtime_cache_metadata__/') &&
        !!(coverage && coverage.needsCleanup === false && coverage.runtimeCachePruningImplemented === true && coverage.runtimeCacheMetadataCovered === true && coverage.runtimeCacheTtlPruneCovered === true && coverage.runtimeCacheMaxEntryPruneCovered === true) &&
        !!(summary && summary.serviceWorkerRuntimeCachePruningImplemented === true && summary.serviceWorkerRuntimeCachePruningRecommendedFollowUp === false && summary.serviceWorkerRuntimeCacheMetadataCovered === true && summary.serviceWorkerRuntimeCacheTtlPruneCovered === true && summary.serviceWorkerRuntimeCacheMaxEntryPruneCovered === true && summary.serviceWorkerRuntimeCacheMaxEntries === 96 && summary.serviceWorkerRuntimeCacheTtlMs === 2592000000) &&
        contractDetail.ok === true,
      pruning: pruning ? clonePlain(pruning, 5) : null,
      summary: summary ? clonePlain({
        serviceWorkerRuntimeCachePruningImplemented: summary.serviceWorkerRuntimeCachePruningImplemented,
        serviceWorkerRuntimeCachePruningRecommendedFollowUp: summary.serviceWorkerRuntimeCachePruningRecommendedFollowUp,
        serviceWorkerRuntimeCacheMetadataCovered: summary.serviceWorkerRuntimeCacheMetadataCovered,
        serviceWorkerRuntimeCacheTtlPruneCovered: summary.serviceWorkerRuntimeCacheTtlPruneCovered,
        serviceWorkerRuntimeCacheMaxEntryPruneCovered: summary.serviceWorkerRuntimeCacheMaxEntryPruneCovered,
        serviceWorkerRuntimeCacheMaxEntries: summary.serviceWorkerRuntimeCacheMaxEntries,
        serviceWorkerRuntimeCacheTtlMs: summary.serviceWorkerRuntimeCacheTtlMs
      }, 3) : null,
      contractDetail
    };
  }

  function checkServiceWorkerClientLifecycleAudit(options) {
    const opts = options || {};
    const audit = resolvePath('VildaGHTherapyResourceAudit');
    const snapshot = audit && typeof audit.getSnapshot === 'function' ? audit.getSnapshot({ includePlan: false }) : null;
    const serviceWorker = snapshot && snapshot.serviceWorker ? snapshot.serviceWorker : null;
    const clientLifecycle = serviceWorker && serviceWorker.clientLifecycle ? serviceWorker.clientLifecycle : null;
    const coverage = clientLifecycle && clientLifecycle.coverage ? clientLifecycle.coverage : null;
    const summary = snapshot && snapshot.summary ? snapshot.summary : null;
    const contractDetail = checkNamedContracts(['service-worker-client-lifecycle-audit'], { executeChecks: opts.executeContractChecks !== false, page: opts.page });
    return {
      ok: !!(snapshot && snapshot.step === '8O-11k' && snapshot.cleanupApplied && snapshot.cleanupApplied.serviceWorkerClientLifecycle === true && snapshot.serviceWorkerClientLifecycleAuditApplied === true) &&
        !!(serviceWorker && serviceWorker.clientLifecycleAuditApplied === true && serviceWorker.clientLifecycleCleanupApplied === true && serviceWorker.clientLifecycleRecommendedFollowUp === false) &&
        !!(clientLifecycle && clientLifecycle.singletonRegistrationGuard === true && clientLifecycle.updatefoundStatechangeListenerDedup === true && clientLifecycle.duplicateWaitingPromptGuard === true && clientLifecycle.controllerchangeReloadGuard === true && clientLifecycle.docproLegacyDuplicateRegistrationRemoved === true && clientLifecycle.auditRegistersServiceWorker === false && clientLifecycle.auditReloadsPage === false && clientLifecycle.auditPostsSkipWaiting === false) &&
        !!(coverage && coverage.needsCleanup === false && coverage.singletonRegistrationGuardCovered === true && coverage.updatefoundStatechangeListenerDedupCovered === true && coverage.duplicateWaitingPromptGuardCovered === true && coverage.controllerchangeReloadGuardCovered === true && coverage.docproLegacyDuplicateRegistrationRemoved === true && coverage.cacheBustingUpdated === true && coverage.auditRegistersServiceWorker === false) &&
        !!(summary && summary.serviceWorkerClientLifecycleAuditComplete === true && summary.serviceWorkerClientLifecycleSingletonRegistrationCovered === true && summary.serviceWorkerClientLifecycleUpdatefoundStatechangeDedupCovered === true && summary.serviceWorkerClientLifecycleControllerchangeReloadGuardCovered === true && summary.serviceWorkerClientLifecycleDocproLegacyDuplicateRegistrationRemoved === true && summary.serviceWorkerClientLifecycleCleanupRecommended === false && summary.serviceWorkerClientLifecycleAuditRegistersServiceWorker === false) &&
        contractDetail.ok === true,
      clientLifecycle: clientLifecycle ? clonePlain(clientLifecycle, 5) : null,
      summary: summary ? clonePlain({
        serviceWorkerClientLifecycleAuditComplete: summary.serviceWorkerClientLifecycleAuditComplete,
        serviceWorkerClientLifecycleSingletonRegistrationCovered: summary.serviceWorkerClientLifecycleSingletonRegistrationCovered,
        serviceWorkerClientLifecycleUpdatefoundStatechangeDedupCovered: summary.serviceWorkerClientLifecycleUpdatefoundStatechangeDedupCovered,
        serviceWorkerClientLifecycleDuplicateWaitingPromptGuardCovered: summary.serviceWorkerClientLifecycleDuplicateWaitingPromptGuardCovered,
        serviceWorkerClientLifecycleControllerchangeReloadGuardCovered: summary.serviceWorkerClientLifecycleControllerchangeReloadGuardCovered,
        serviceWorkerClientLifecycleDocproLegacyDuplicateRegistrationRemoved: summary.serviceWorkerClientLifecycleDocproLegacyDuplicateRegistrationRemoved,
        serviceWorkerClientLifecycleCacheBustingUpdated: summary.serviceWorkerClientLifecycleCacheBustingUpdated,
        serviceWorkerClientLifecycleAuditRegistersServiceWorker: summary.serviceWorkerClientLifecycleAuditRegistersServiceWorker,
        serviceWorkerClientLifecycleCleanupRecommended: summary.serviceWorkerClientLifecycleCleanupRecommended
      }, 3) : null,
      contractDetail
    };
  }


  function checkServiceWorkerClientUpdateUxSmoke(options) {
    const opts = options || {};
    const audit = resolvePath('VildaGHTherapyResourceAudit');
    const snapshot = audit && typeof audit.getSnapshot === 'function' ? audit.getSnapshot({ includePlan: false }) : null;
    const serviceWorker = snapshot && snapshot.serviceWorker ? snapshot.serviceWorker : null;
    const clientUpdateUxSmoke = serviceWorker && serviceWorker.clientUpdateUxSmoke ? serviceWorker.clientUpdateUxSmoke : null;
    const coverage = clientUpdateUxSmoke && clientUpdateUxSmoke.coverage ? clientUpdateUxSmoke.coverage : null;
    const summary = snapshot && snapshot.summary ? snapshot.summary : null;
    const contractDetail = checkNamedContracts(['service-worker-client-update-ux-smoke'], { executeChecks: opts.executeContractChecks !== false, page: opts.page });
    return {
      ok: !!(snapshot && snapshot.step === '8O-11k' && snapshot.cleanupApplied && snapshot.cleanupApplied.serviceWorkerClientUpdateUxSmoke === true && snapshot.serviceWorkerClientUpdateUxSmokeApplied === true) &&
        !!(serviceWorker && serviceWorker.clientUpdateUxSmokeApplied === true && serviceWorker.clientUpdateUxSmokeRecommendedFollowUp === false) &&
        !!(clientUpdateUxSmoke && clientUpdateUxSmoke.bannerAccessibleSingleton === true && clientUpdateUxSmoke.refreshSingleSkipWaiting === true && clientUpdateUxSmoke.dismissNoSkipWaiting === true && clientUpdateUxSmoke.readOnlySnapshot === true && clientUpdateUxSmoke.smokeUsesMockedDomOnly === true && clientUpdateUxSmoke.auditRegistersServiceWorker === false && clientUpdateUxSmoke.auditPostsSkipWaiting === false) &&
        !!(coverage && coverage.needsCleanup === false && coverage.bannerAccessibleSingletonCovered === true && coverage.bannerButtonLabelsCovered === true && coverage.refreshSinglePostCovered === true && coverage.dismissNoSkipWaitingCovered === true && coverage.readOnlySnapshotCovered === true && coverage.smokeToolDefined === true && coverage.smokeUsesMockedDomOnly === true && coverage.cacheBustingUpdated === true) &&
        !!(summary && summary.serviceWorkerClientUpdateUxSmokeComplete === true && summary.serviceWorkerClientUpdateUxBannerAccessibleSingletonCovered === true && summary.serviceWorkerClientUpdateUxRefreshInteractionCovered === true && summary.serviceWorkerClientUpdateUxDismissInteractionCovered === true && summary.serviceWorkerClientUpdateUxReadOnlySnapshotCovered === true && summary.serviceWorkerClientUpdateUxSmokeUsesMockedDomOnly === true && summary.serviceWorkerClientUpdateUxSmokeCleanupRecommended === false) &&
        contractDetail.ok === true,
      clientUpdateUxSmoke: clientUpdateUxSmoke ? clonePlain(clientUpdateUxSmoke, 5) : null,
      summary: summary ? clonePlain({
        serviceWorkerClientUpdateUxSmokeComplete: summary.serviceWorkerClientUpdateUxSmokeComplete,
        serviceWorkerClientUpdateUxBannerAccessibleSingletonCovered: summary.serviceWorkerClientUpdateUxBannerAccessibleSingletonCovered,
        serviceWorkerClientUpdateUxButtonLabelsCovered: summary.serviceWorkerClientUpdateUxButtonLabelsCovered,
        serviceWorkerClientUpdateUxRefreshInteractionCovered: summary.serviceWorkerClientUpdateUxRefreshInteractionCovered,
        serviceWorkerClientUpdateUxDismissInteractionCovered: summary.serviceWorkerClientUpdateUxDismissInteractionCovered,
        serviceWorkerClientUpdateUxReadOnlySnapshotCovered: summary.serviceWorkerClientUpdateUxReadOnlySnapshotCovered,
        serviceWorkerClientUpdateUxSmokeUsesMockedDomOnly: summary.serviceWorkerClientUpdateUxSmokeUsesMockedDomOnly,
        serviceWorkerClientUpdateUxCacheBustingUpdated: summary.serviceWorkerClientUpdateUxCacheBustingUpdated,
        serviceWorkerClientUpdateUxSmokeCleanupRecommended: summary.serviceWorkerClientUpdateUxSmokeCleanupRecommended
      }, 3) : null,
      contractDetail
    };
  }


  function checkCentileChartHeaderFreshName(options) {
    const opts = options || {};
    const api = resolvePath('VildaCentileChartHeader');
    const fakeInputs = {
      advName: { value: 'Nowe Imię z Zaawansowanych', disabled: false },
      basicGrowthName: { value: '', disabled: false },
      name: { value: 'Nowe Imię z Danych', disabled: false }
    };
    const fakeDoc = {
      getElementById: function (id) { return fakeInputs[id] || null; }
    };
    let advancedState = null;
    let mainState = null;
    let label = '';
    let snapshot = null;
    if (api && typeof api.buildHeaderNameState === 'function') {
      if (typeof api.markNameInputEdit === 'function') api.markNameInputEdit('advName', fakeInputs.advName.value);
      advancedState = api.buildHeaderNameState({
        document: fakeDoc,
        effectiveDataState: { name: 'Stare Imię', sourceModule: 'advancedGrowth' },
        advancedGrowthData: { name: 'Stare Imię', sourceModule: 'advancedGrowth' }
      });
      fakeInputs.advName.value = 'Stare Imię';
      fakeInputs.name.value = 'Nowe Imię z Danych';
      if (typeof api.markNameInputEdit === 'function') api.markNameInputEdit('name', fakeInputs.name.value);
      mainState = api.buildHeaderNameState({
        document: fakeDoc,
        effectiveDataState: { name: 'Stare Imię', sourceModule: 'advancedGrowth' },
        advancedGrowthData: { name: 'Stare Imię', sourceModule: 'advancedGrowth' }
      });
      label = typeof api.buildNameLabel === 'function'
        ? api.buildNameLabel({
            document: fakeDoc,
            effectiveDataState: { name: 'Stare Imię', sourceModule: 'advancedGrowth' },
            advancedGrowthData: { name: 'Stare Imię', sourceModule: 'advancedGrowth' }
          })
        : '';
      snapshot = typeof api.getSnapshot === 'function'
        ? api.getSnapshot({
            document: fakeDoc,
            effectiveDataState: { name: 'Stare Imię', sourceModule: 'advancedGrowth' },
            advancedGrowthData: { name: 'Stare Imię', sourceModule: 'advancedGrowth' }
          })
        : null;
    }
    const contractDetail = checkNamedContracts(DEFAULT_CENTILE_CHART_HEADER_CONTRACTS.slice(), { executeChecks: opts.executeContractChecks !== false, page: opts.page });
    return {
      ok: !!api &&
        api.VERSION === '1.0.0' &&
        typeof api.buildHeaderNameState === 'function' &&
        typeof api.buildNameLabel === 'function' &&
        typeof api.getSnapshot === 'function' &&
        typeof api.markNameInputEdit === 'function' &&
        !!(advancedState && advancedState.name === 'Nowe Imię z Zaawansowanych' && advancedState.staleAdvancedGrowthNameDetected === true && advancedState.domInputsBeforeAdvancedGrowthData === true) &&
        !!(mainState && mainState.name === 'Nowe Imię z Danych' && mainState.usedLastEditedInput === true && mainState.nameSource === 'name-last-input') &&
        label === 'Imię i nazwisko: Nowe Imię z Danych' &&
        !!(snapshot && snapshot.readOnly === true && snapshot.executedPdfGeneration === false && snapshot.renderedDom === false) &&
        typeof resolvePath('vildaGetCentileChartHeaderNameSnapshot') === 'function' &&
        contractDetail.ok === true,
      version: api ? (api.VERSION || api.version || null) : null,
      advancedState: advancedState ? clonePlain({ name: advancedState.name, nameSource: advancedState.nameSource, staleAdvancedGrowthNameDetected: advancedState.staleAdvancedGrowthNameDetected, currentDomName: advancedState.currentDomName }, 3) : null,
      mainState: mainState ? clonePlain({ name: mainState.name, nameSource: mainState.nameSource, usedLastEditedInput: mainState.usedLastEditedInput, currentDomInputId: mainState.currentDomInputId }, 3) : null,
      label,
      snapshot: snapshot ? clonePlain({ kind: snapshot.kind, step: snapshot.step, readOnly: snapshot.readOnly, executedPdfGeneration: snapshot.executedPdfGeneration, renderedDom: snapshot.renderedDom }, 3) : null,
      contractDetail
    };
  }

  function runRegressionSuite(options) {
    const opts = options || {};
    const before = captureWindowState();
    const tests = [];

    tests.push(runCase('smoke-suite-api', 'smoke-suite', true, function () {
      return {
        ok: hasObject('VildaSmokeTests') && hasFunction('VildaSmokeTests.runRegressionSuite') && hasFunction('vildaRunSmokeRegressionSuite') && hasFunction('vildaGetSmokeRegressionSuiteSnapshot'),
        version: VERSION,
        aliases: {
          vildaRunSmokeRegressionSuite: hasFunction('vildaRunSmokeRegressionSuite'),
          vildaGetSmokeRegressionSuiteSnapshot: hasFunction('vildaGetSmokeRegressionSuiteSnapshot')
        }
      };
    }, opts));

    tests.push(runCase('estimated-intake-module-api', 'estimated-intake', true, function () {
      const api = global.VildaEstimatedIntake;
      const surface = api && typeof api.getApiSurfaceStatus === 'function' ? api.getApiSurfaceStatus() : null;
      const missing = ['readIntakeRows', 'getIntakeRowHeight', 'buildIntakeIntervals', 'collectIntakeRowsForAlertProbe', 'buildEstimatedIntakeCalculationModel'].filter(function (name) {
        return !(api && typeof api[name] === 'function');
      });
      return { ok: !!api && missing.length === 0, version: api ? (api.VERSION || api.version || null) : null, surface, missing };
    }, opts));

    tests.push(runCase('estimated-intake-pure-model-samples', 'estimated-intake', true, runEstimatedIntakePureModelSamples, opts));
    tests.push(runCase('estimated-intake-readonly-snapshots', 'estimated-intake', true, checkEstimatedIntakeReadOnlySnapshots, opts));
    tests.push(runCase('plan-modules-contract', 'plan-modules', true, checkPlanModulesContract, opts));

    tests.push(runCase('vilda-deps-estimated-contracts', 'deps-contracts', true, function () {
      const detail = checkNamedContracts(DEFAULT_ESTIMATED_INTAKE_CONTRACTS.slice(), { executeChecks: opts.executeContractChecks !== false, page: opts.page });
      detail.contracts = DEFAULT_ESTIMATED_INTAKE_CONTRACTS.slice();
      return detail;
    }, opts));

    tests.push(runCase('numeric-validation-age-zero', 'numeric-validation', true, checkNumericValidationAgeZero, opts));
    tests.push(runCase('pediatric-bmi-no-adult-fallback', 'pediatric-bmi', true, checkPediatricBmiNoAdultFallback, opts));
    tests.push(runCase('nutrition-norms-refresh-queue', 'nutrition-norms', true, checkNutritionNormsRefreshQueue, opts));
    tests.push(runCase('update-hooks-registry', 'update-hooks', true, checkUpdateHooksRegistry, opts));
    tests.push(runCase('update-hooks-first-wrapper-bridge', 'update-hooks', true, checkUpdateHooksFirstWrapperBridge, opts));
    tests.push(runCase('update-hooks-second-wrapper-bridge', 'update-hooks', true, checkUpdateHooksSecondWrapperBridge, opts));
    tests.push(runCase('update-hooks-diet-recommendations-wrapper', 'update-hooks', true, checkUpdateHooksDietRecommendationsWrapper, opts));
    tests.push(runCase('update-hooks-nutrition-norms-wrapper', 'update-hooks', true, checkUpdateHooksNutritionNormsWrapper, opts));
    tests.push(runCase('update-hooks-nutrition-micros-wrapper', 'update-hooks', true, checkUpdateHooksNutritionMicrosWrapper, opts));
    tests.push(runCase('update-hooks-final-chain-audit', 'update-hooks', true, checkUpdateHooksFinalChainAudit, opts));
    tests.push(runCase('centile-chart-header-fresh-name', 'centile-chart-header', true, checkCentileChartHeaderFreshName, opts));
    tests.push(runCase('gh-therapy-indexeddb-resource-audit', 'gh-therapy-resources', true, checkGhTherapyIndexedDbResourceAudit, opts));
    tests.push(runCase('fetch-timeout-cleanup', 'async-resources', true, checkFetchTimeoutCleanup, opts));
    tests.push(runCase('service-worker-fetch-cache-strategy', 'pwa-cache', true, checkServiceWorkerFetchCacheStrategy, opts));
    tests.push(runCase('service-worker-offline-update-flow-smoke', 'pwa-cache', true, checkServiceWorkerOfflineUpdateFlowSmoke, opts));
    tests.push(runCase('service-worker-versioned-shell-cache-key', 'pwa-cache', true, checkServiceWorkerVersionedShellCacheKey, opts));
    tests.push(runCase('service-worker-stale-cache-pruning-audit', 'pwa-cache', true, checkServiceWorkerStaleCachePruningAudit, opts));
    tests.push(runCase('service-worker-runtime-cache-pruning', 'pwa-cache', true, checkServiceWorkerRuntimeCachePruning, opts));
    tests.push(runCase('service-worker-client-lifecycle-audit', 'pwa-cache', true, checkServiceWorkerClientLifecycleAudit, opts));
    tests.push(runCase('service-worker-client-update-ux-smoke', 'pwa-cache', true, checkServiceWorkerClientUpdateUxSmoke, opts));

    tests.push(runCase('advanced-intake-sync-regression-surface', 'advanced-intake-sync', true, function () {
      const contracts = checkNamedContracts(DEFAULT_ADVANCED_INTAKE_SYNC_CONTRACTS.slice(), { executeChecks: opts.executeContractChecks !== false, page: opts.page });
      const auditAvailable = typeof global.vildaGetAdvancedIntakeSyncAuditSnapshot === 'function';
      let audit = null;
      if (auditAvailable && opts.executeAdvancedIntakeSyncSnapshot !== false) {
        audit = global.vildaGetAdvancedIntakeSyncAuditSnapshot({ includeRows: false });
      }
      return {
        ok: auditAvailable && contracts.ok,
        auditAvailable,
        audit: audit ? { kind: audit.kind || null, readOnly: audit.readOnly === true, step: audit.step || null } : null,
        contracts
      };
    }, opts));

    tests.push(runCase('script-cache-versions', 'cache-and-load-order', true, checkBrowserScriptVersions, opts));

    const after = captureWindowState();
    tests.push(makeCaseResult('window-state-side-effect-guard', 'side-effects', true, !stateChanged(before, after), { before, after }, null));

    const failedRequired = tests.filter(function (item) { return item.required !== false && item.ok !== true; });
    const warnings = tests.filter(function (item) { return item.required === false && item.ok !== true; });
    const result = {
      step: STEP,
      version: VERSION,
      kind: 'vilda-smoke-regression-suite-result',
      readOnly: true,
      executedCalcEstimatedIntake: false,
      renderedDom: false,
      committedWindowState: false,
      ok: failedRequired.length === 0,
      testCount: tests.length,
      failedRequiredCount: failedRequired.length,
      warningCount: warnings.length,
      tests,
      failedRequired: failedRequired.map(function (item) { return { id: item.id, group: item.group, error: item.error, details: item.details }; }),
      warnings,
      options: clonePlain(opts, 3),
      timestamp: now()
    };
    lastRegressionSuiteResult = result;
    return clonePlain(result, 8);
  }

  function getManifest() {
    return clonePlain(MANIFEST, 4);
  }

  function getLastRegressionSuiteResult() {
    return clonePlain(lastRegressionSuiteResult, 8);
  }

  function getSnapshot(options) {
    const opts = options || {};
    const snapshot = {
      step: STEP,
      version: VERSION,
      kind: 'vilda-smoke-regression-suite-snapshot',
      readOnly: true,
      autoRun: false,
      manifest: getManifest(),
      api: {
        VildaSmokeTests: hasObject('VildaSmokeTests'),
        runRegressionSuite: hasFunction('VildaSmokeTests.runRegressionSuite'),
        vildaRunSmokeRegressionSuite: hasFunction('vildaRunSmokeRegressionSuite'),
        vildaGetSmokeRegressionSuiteSnapshot: hasFunction('vildaGetSmokeRegressionSuiteSnapshot')
      },
      estimatedIntake: {
        module: hasObject('VildaEstimatedIntake'),
        apiSurface: global.VildaEstimatedIntake && typeof global.VildaEstimatedIntake.getApiSurfaceStatus === 'function'
          ? global.VildaEstimatedIntake.getApiSurfaceStatus()
          : null,
        diagnosticApis: {
          audit: hasFunction('vildaGetEstimatedIntakeAuditSnapshot'),
          alertProbe: hasFunction('vildaGetEstimatedIntakeAlertProbeAuditSnapshot'),
          calcSeam: hasFunction('vildaGetEstimatedIntakeCalcSeamSnapshot'),
          calculationModel: hasFunction('vildaGetEstimatedIntakeCalculationModelSnapshot')
        }
      },
      deps: {
        VildaDeps: hasObject('VildaDeps'),
        contractCount: getContractNames().length,
        regressionSmokeSuiteContract: getContractNames().indexOf('regression-smoke-suite') !== -1,
        nutritionNormsRefreshQueueContract: getContractNames().indexOf('nutrition-norms-refresh-queue') !== -1,
        updateHooksRegistryContract: getContractNames().indexOf('update-hooks-registry') !== -1,
        updateHooksFirstWrapperBridgeContract: getContractNames().indexOf('update-hooks-first-wrapper-bridge') !== -1,
        updateHooksDietRecommendationsWrapperContract: getContractNames().indexOf('update-hooks-diet-recommendations-wrapper') !== -1,
        updateHooksNutritionMicrosWrapperContract: getContractNames().indexOf('update-hooks-nutrition-micros-wrapper') !== -1,
        updateHooksFinalChainAuditContract: getContractNames().indexOf('update-hooks-final-chain-audit') !== -1,
        centileChartHeaderContract: getContractNames().indexOf('centile-chart-header-fresh-name') !== -1,
        ghTherapyResourceAuditContract: getContractNames().indexOf('gh-therapy-indexeddb-resource-audit') !== -1,
        fetchTimeoutCleanupContract: getContractNames().indexOf('fetch-timeout-cleanup') !== -1,
        serviceWorkerFetchCacheStrategyContract: getContractNames().indexOf('service-worker-fetch-cache-strategy') !== -1,
        serviceWorkerOfflineUpdateFlowSmokeContract: getContractNames().indexOf('service-worker-offline-update-flow-smoke') !== -1,
        serviceWorkerVersionedShellCacheKeyContract: getContractNames().indexOf('service-worker-versioned-shell-cache-key') !== -1,
        serviceWorkerStaleCachePruningAuditContract: getContractNames().indexOf('service-worker-stale-cache-pruning-audit') !== -1,
        serviceWorkerRuntimeCachePruningContract: getContractNames().indexOf('service-worker-runtime-cache-pruning') !== -1,
        serviceWorkerClientLifecycleAuditContract: getContractNames().indexOf('service-worker-client-lifecycle-audit') !== -1,
        serviceWorkerClientUpdateUxSmokeContract: getContractNames().indexOf('service-worker-client-update-ux-smoke') !== -1
      },
      nutritionNormsRefresh: {
        module: hasObject('VildaFoodSummary'),
        snapshotApi: hasFunction('vildaGetNutritionNormsRefreshQueueSnapshot'),
        apiSurface: hasObject('VildaFoodSummary') ? {
          version: resolvePath('VildaFoodSummary.version') || resolvePath('VildaFoodSummary.VERSION') || null,
          getNutritionNormsRefreshQueueSnapshot: hasFunction('VildaFoodSummary.getNutritionNormsRefreshQueueSnapshot'),
          buildNutritionNormsRefreshSignature: hasFunction('VildaFoodSummary.buildNutritionNormsRefreshSignature')
        } : null
      },
      updateHooks: {
        module: hasObject('VildaUpdateHooks'),
        snapshotApi: hasFunction('vildaGetUpdateHooksSnapshot'),
        auditSnapshotApi: hasFunction('vildaGetUpdateHooksAuditSnapshot'),
        apiSurface: hasObject('VildaUpdateHooks') ? {
          version: resolvePath('VildaUpdateHooks.version') || resolvePath('VildaUpdateHooks.VERSION') || null,
          registerAfterUpdateHook: hasFunction('VildaUpdateHooks.registerAfterUpdateHook'),
          unregisterAfterUpdateHook: hasFunction('VildaUpdateHooks.unregisterAfterUpdateHook'),
          runAfterUpdateHooks: hasFunction('VildaUpdateHooks.runAfterUpdateHooks'),
          getSnapshot: hasFunction('VildaUpdateHooks.getSnapshot'),
          getHookAuditSnapshot: hasFunction('VildaUpdateHooks.getHookAuditSnapshot'),
          bridgeSnapshot: hasFunction('vildaGetUpdateHooksBridgeSnapshot'),
          dietRecommendationsHookSnapshot: hasFunction('vildaGetDietRecommendationsUpdateHookSnapshot'),
          finalChainAuditSnapshot: hasFunction('VildaUpdateHooks.getFinalUpdateChainAuditSnapshot'),
          finalChainAuditAlias: hasFunction('vildaGetFinalUpdateChainAuditSnapshot')
        } : null
      },
      dietRecommendations: {
        module: hasObject('VildaDietRecommendations'),
        updateHookSnapshot: hasFunction('vildaGetDietRecommendationsUpdateHookSnapshot'),
        apiSurface: hasObject('VildaDietRecommendations') ? {
          version: resolvePath('VildaDietRecommendations.version') || resolvePath('VildaDietRecommendations.VERSION') || null,
          updateVisibility: hasFunction('VildaDietRecommendations.updateVisibility'),
          updateVisibilityAfterUpdate: hasFunction('VildaDietRecommendations.updateVisibilityAfterUpdate'),
          getUpdateHookSnapshot: hasFunction('VildaDietRecommendations.getUpdateHookSnapshot')
        } : null
      },
      centileChartHeader: {
        module: hasObject('VildaCentileChartHeader'),
        snapshotApi: hasFunction('vildaGetCentileChartHeaderNameSnapshot'),
        apiSurface: hasObject('VildaCentileChartHeader') ? {
          version: resolvePath('VildaCentileChartHeader.version') || resolvePath('VildaCentileChartHeader.VERSION') || null,
          buildHeaderNameState: hasFunction('VildaCentileChartHeader.buildHeaderNameState'),
          buildNameLabel: hasFunction('VildaCentileChartHeader.buildNameLabel'),
          getSnapshot: hasFunction('VildaCentileChartHeader.getSnapshot'),
          markNameInputEdit: hasFunction('VildaCentileChartHeader.markNameInputEdit')
        } : null
      },
      ghTherapyResources: {
        module: hasObject('VildaGHTherapyResourceAudit'),
        snapshotApi: hasFunction('vildaGetGHTherapyIndexedDbAuditSnapshot'),
        resourceSnapshotApi: hasFunction('vildaGetGHTherapyResourceAuditSnapshot'),
        apiSurface: hasObject('VildaGHTherapyResourceAudit') ? {
          version: resolvePath('VildaGHTherapyResourceAudit.version') || resolvePath('VildaGHTherapyResourceAudit.VERSION') || null,
          getSnapshot: hasFunction('VildaGHTherapyResourceAudit.getSnapshot'),
          getGHTherapyIndexedDbAuditSnapshot: hasFunction('VildaGHTherapyResourceAudit.getGHTherapyIndexedDbAuditSnapshot'),
          getApiSurfaceStatus: hasFunction('VildaGHTherapyResourceAudit.getApiSurfaceStatus'),
          getServiceWorkerClientLifecycleAuditSnapshot: hasFunction('VildaGHTherapyResourceAudit.getServiceWorkerClientLifecycleAuditSnapshot'),
          getServiceWorkerClientUpdateUxSmokeSnapshot: hasFunction('VildaGHTherapyResourceAudit.getServiceWorkerClientUpdateUxSmokeSnapshot')
        } : null
      },
      fetchTimeoutCleanup: {
        helpers: {
          fetchWithTimeout: hasFunction('VildaAppHelpers.fetchWithTimeout'),
          fetchJsonWithTimeout: hasFunction('VildaAppHelpers.fetchJsonWithTimeout'),
          fetchArrayBufferWithTimeout: hasFunction('VildaAppHelpers.fetchArrayBufferWithTimeout'),
          fetchBlobWithTimeout: hasFunction('VildaAppHelpers.fetchBlobWithTimeout')
        },
        globalAliases: {
          vildaFetchWithTimeout: hasFunction('vildaFetchWithTimeout'),
          vildaFetchJsonWithTimeout: hasFunction('vildaFetchJsonWithTimeout'),
          vildaFetchArrayBufferWithTimeout: hasFunction('vildaFetchArrayBufferWithTimeout'),
          vildaFetchBlobWithTimeout: hasFunction('vildaFetchBlobWithTimeout')
        }
      },
      lastResult: getLastRegressionSuiteResult()
    };
    if (opts.run === true) {
      snapshot.lastResult = runRegressionSuite(opts.runOptions || {});
    }
    return clonePlain(snapshot, 8);
  }

  const api = {
    __vildaSmokeTestsModule: true,
    VERSION,
    version: VERSION,
    STEP,
    getManifest,
    runRegressionSuite,
    getLastRegressionSuiteResult,
    getSnapshot
  };

  global.VildaSmokeTests = api;
  global.vildaRunSmokeRegressionSuite = function (options) { return api.runRegressionSuite(options || {}); };
  global.vildaGetSmokeRegressionSuiteSnapshot = function (options) { return api.getSnapshot(options || {}); };
  global.vildaGetRegressionSmokeSuiteSnapshot = global.vildaGetSmokeRegressionSuiteSnapshot;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
