/* ===========================================================================
 * vilda_estimated_intake_runtime.js — estimated intake runtime side-effect adapter
 *
 * Wydzielone z app.js w kroku 8Q-7 bez zmiany obliczeń estimated intake,
 * renderowania HTML, JSON, persistence ani synchronizacji advanced growth ↔ estimated intake.
 * Moduł kontroluje wyłącznie runtime effects po kalkulacji: commit window.*
 * oraz post-render risk checks na podstawie planu z calc modelu.
 * =========================================================================== */
(function (global) {
  'use strict';

  if (!global) return;
  if (global.VildaEstimatedIntakeRuntime && global.VildaEstimatedIntakeRuntime.__vildaEstimatedIntakeRuntimeModule) {
    return;
  }

  const VERSION = '1.0.0';
  const STEP = '8Q-7';

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function resolveRoot(options) {
    const opts = options || {};
    return opts.root || opts.window || opts.global || global || null;
  }

  function cloneWindowHistoryRow(row) {
    if (!row || typeof row !== 'object') return row;
    return {
      ageMonths: row.ageMonths,
      ageYears: row.ageYears,
      height: row.height,
      weight: row.weight
    };
  }

  function buildEstimatedIntakeWindowHistory(rows) {
    return asArray(rows).map(cloneWindowHistoryRow);
  }

  function describeWindowState(root) {
    const source = root || null;
    return {
      intakeHistory: {
        exists: !!(source && Object.prototype.hasOwnProperty.call(source, 'intakeHistory')),
        isArray: !!(source && Array.isArray(source.intakeHistory)),
        length: source && Array.isArray(source.intakeHistory) ? source.intakeHistory.length : null,
        valueType: source && source.intakeHistory === null ? 'null' : typeof (source ? source.intakeHistory : undefined)
      },
      intakeEstimatedKcalPerDay: {
        value: source ? source.intakeEstimatedKcalPerDay : undefined,
        isNumeric: Number.isFinite(Number(source ? source.intakeEstimatedKcalPerDay : NaN))
      }
    };
  }

  function clearEstimatedIntakeWindowState(options) {
    const root = resolveRoot(options);
    if (!root) {
      return { rootAvailable: false, intakeHistory: null, intakeEstimatedKcalPerDay: null };
    }
    root.intakeHistory = null;
    root.intakeEstimatedKcalPerDay = null;
    return { rootAvailable: true, intakeHistory: root.intakeHistory, intakeEstimatedKcalPerDay: root.intakeEstimatedKcalPerDay };
  }

  function commitEstimatedIntakeWindowState(rows, intakeKcalPerDay, options) {
    const root = resolveRoot(options);
    const history = buildEstimatedIntakeWindowHistory(rows);
    if (!root) {
      return { rootAvailable: false, intakeHistory: history, intakeEstimatedKcalPerDay: intakeKcalPerDay };
    }
    root.intakeHistory = history;
    root.intakeEstimatedKcalPerDay = intakeKcalPerDay;
    return { rootAvailable: true, intakeHistory: root.intakeHistory, intakeEstimatedKcalPerDay: root.intakeEstimatedKcalPerDay };
  }

  function commitEstimatedIntakeCalcModelWindowState(calcModel, options) {
    const model = calcModel || {};
    const plan = model.commitPlan || { action: 'clear' };
    if (plan.action === 'clear') {
      return clearEstimatedIntakeWindowState(options);
    }
    return commitEstimatedIntakeWindowState(
      plan.rows || model.rows || [],
      plan.intakeKcalPerDay == null ? null : plan.intakeKcalPerDay,
      options
    );
  }

  function resolveDependencies(options) {
    const opts = options || {};
    const deps = opts.dependencies || opts.deps || {};
    return {
      energyBuildIntakeObservedState: typeof deps.energyBuildIntakeObservedState === 'function'
        ? deps.energyBuildIntakeObservedState
        : (typeof global.energyBuildIntakeObservedState === 'function' ? global.energyBuildIntakeObservedState : null),
      check12mLossOrange: typeof deps.check12mLossOrange === 'function'
        ? deps.check12mLossOrange
        : (typeof global.check12mLossOrange === 'function' ? global.check12mLossOrange : null),
      logSwallowedCatch: typeof deps.logSwallowedCatch === 'function'
        ? deps.logSwallowedCatch
        : (typeof global.vildaLogSwallowedCatch === 'function' ? global.vildaLogSwallowedCatch : null)
    };
  }

  function runEstimatedIntakePostRenderRisk(calcModel, options) {
    const opts = options || {};
    const root = resolveRoot(opts);
    const deps = resolveDependencies(opts);
    const model = calcModel || {};
    const plan = model.postRenderRiskPlan || null;
    const result = {
      step: STEP,
      didRun: false,
      didRunEnergyObservedState: false,
      didRunCheck12mLossOrange: false,
      skippedReason: null
    };

    if (!plan || !plan.shouldRun || !plan.row) {
      result.skippedReason = 'missing-post-render-risk-plan';
      return result;
    }
    if (typeof deps.energyBuildIntakeObservedState !== 'function') {
      throw new Error('VildaEstimatedIntakeRuntime: missing dependency energyBuildIntakeObservedState');
    }

    const row = plan.row;
    deps.energyBuildIntakeObservedState({
      ageYears: row.ageYears,
      ageMonthsOpt: (row.ageMonths || 0) % 12,
      sex: plan.sex,
      weightKg: row.weight,
      heightCm: plan.rowHeight,
      palInput: plan.pal,
      history: root ? root.intakeHistory : undefined,
      intakeKcalPerDay: plan.intakeKcalPerDay,
      mountId: opts.mountId || 'intakeResults',
      applyRiskAdjust: true
    });
    result.didRun = true;
    result.didRunEnergyObservedState = true;

    try {
      if (typeof deps.check12mLossOrange === 'function') {
        const hist = (root && root.intakeHistory) || model.rows || [];
        deps.check12mLossOrange(hist, opts.mountId || 'intakeResults');
        result.didRunCheck12mLossOrange = true;
      }
    } catch (error) {
      if (typeof deps.logSwallowedCatch === 'function') {
        deps.logSwallowedCatch('vilda_estimated_intake_runtime.js', error, { step: STEP, helper: 'runEstimatedIntakePostRenderRisk:check12mLossOrange' });
      }
      result.check12mLossOrangeError = String(error && error.message ? error.message : error);
    }

    return result;
  }

  function getSnapshot(options) {
    const root = resolveRoot(options);
    return Object.freeze({
      version: VERSION,
      step: STEP,
      kind: 'estimated-intake-runtime-snapshot',
      readOnly: true,
      moduleOnly: true,
      initialized: true,
      rendersDom: false,
      didRenderDom: false,
      didWriteStorage: false,
      canWriteWindowState: true,
      ownsWindowStateCommit: true,
      ownsPostRenderRiskChecks: true,
      currentWindowState: describeWindowState(root),
      functions: Object.freeze({
        buildEstimatedIntakeWindowHistory: typeof buildEstimatedIntakeWindowHistory === 'function',
        clearEstimatedIntakeWindowState: typeof clearEstimatedIntakeWindowState === 'function',
        commitEstimatedIntakeWindowState: typeof commitEstimatedIntakeWindowState === 'function',
        commitEstimatedIntakeCalcModelWindowState: typeof commitEstimatedIntakeCalcModelWindowState === 'function',
        runEstimatedIntakePostRenderRisk: typeof runEstimatedIntakePostRenderRisk === 'function'
      })
    });
  }

  const API = Object.freeze({
    __vildaEstimatedIntakeRuntimeModule: true,
    VERSION: VERSION,
    version: VERSION,
    STEP: STEP,
    buildEstimatedIntakeWindowHistory: buildEstimatedIntakeWindowHistory,
    clearEstimatedIntakeWindowState: clearEstimatedIntakeWindowState,
    commitEstimatedIntakeWindowState: commitEstimatedIntakeWindowState,
    commitEstimatedIntakeCalcModelWindowState: commitEstimatedIntakeCalcModelWindowState,
    runEstimatedIntakePostRenderRisk: runEstimatedIntakePostRenderRisk,
    getSnapshot: getSnapshot
  });

  global.VildaEstimatedIntakeRuntime = API;
  global.vildaGetEstimatedIntakeRuntimeSnapshot = getSnapshot;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
