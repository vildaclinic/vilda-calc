/* ===========================================================================
 * vilda_estimated_intake_dom_mount.js — estimated intake DOM mount adapter
 *
 * Wydzielone z app.js w kroku 8Q-9 bez zmiany obliczeń estimated intake,
 * renderera HTML, runtime commitów, JSON, persistence ani synchronizacji
 * advanced growth ↔ estimated intake. Moduł kontroluje wyłącznie pobranie
 * targetów #intakeResults/#intakeLegend, opis targetów, wybór gałęzi renderu
 * oraz bezpieczny montaż renderModel.html do DOM.
 * =========================================================================== */
(function (global) {
  'use strict';

  if (!global) return;
  if (global.VildaEstimatedIntakeDomMount && global.VildaEstimatedIntakeDomMount.__vildaEstimatedIntakeDomMountModule) {
    return;
  }

  const VERSION = '1.0.0';
  const STEP = '8Q-9';
  const DEFAULT_RESULTS_ID = 'intakeResults';
  const DEFAULT_LEGEND_ID = 'intakeLegend';

  function resolveDocument(options, dependencies) {
    const opts = options || {};
    const deps = dependencies || opts.dependencies || opts.deps || {};
    return opts.document || opts.doc || deps.document || deps.doc || global.document || null;
  }

  function resolveDependencies(options) {
    const opts = options || {};
    const deps = opts.dependencies || opts.deps || {};
    return {
      vildaAppSetTrustedHtml: typeof deps.vildaAppSetTrustedHtml === 'function'
        ? deps.vildaAppSetTrustedHtml
        : (typeof global.vildaAppSetTrustedHtml === 'function' ? global.vildaAppSetTrustedHtml : null),
      logSwallowedCatch: typeof deps.logSwallowedCatch === 'function'
        ? deps.logSwallowedCatch
        : (typeof global.vildaLogSwallowedCatch === 'function' ? global.vildaLogSwallowedCatch : null)
    };
  }

  function getElementById(doc, id) {
    return doc && typeof doc.getElementById === 'function' ? doc.getElementById(id) : null;
  }

  function getEstimatedIntakeCalcOutputTargets(options, dependencies) {
    const opts = options || {};
    const doc = resolveDocument(opts, dependencies);
    const resultsId = opts.resultsId || opts.mountId || DEFAULT_RESULTS_ID;
    const legendId = opts.legendId || DEFAULT_LEGEND_ID;
    const res = getElementById(doc, resultsId);
    const legendEl = getElementById(doc, legendId);
    return {
      step: STEP,
      kind: 'estimated-intake-dom-targets',
      hasDocument: !!doc,
      resultsId,
      legendId,
      res,
      resultsEl: res,
      mount: res,
      legendEl
    };
  }

  function getRowCount(inputModel) {
    const rows = inputModel && Array.isArray(inputModel.rows) ? inputModel.rows : [];
    if (rows.length) return rows.length;
    const fromModel = inputModel && Number.isFinite(Number(inputModel.rowCount)) ? Number(inputModel.rowCount) : 0;
    return fromModel > 0 ? fromModel : 0;
  }

  function getEstimatedIntakeCalcBranch(inputModel, targets) {
    const rowCount = getRowCount(inputModel);
    if (!targets || !(targets.res || targets.resultsEl || targets.mount)) return 'missing-results-mount';
    if (!rowCount) return 'empty-rows-message';
    if (rowCount === 1) return 'single-row-maintenance';
    return 'multi-row-interval-render';
  }

  function safeString(value) {
    return value == null ? '' : String(value);
  }

  function describeEstimatedIntakeCalcTargets(targets) {
    const safeTargets = targets || {};
    const res = safeTargets.res || safeTargets.resultsEl || safeTargets.mount || null;
    const legendEl = safeTargets.legendEl || null;
    return {
      step: STEP,
      kind: 'estimated-intake-dom-target-description',
      hasDocument: !!safeTargets.hasDocument,
      resultsId: safeTargets.resultsId || DEFAULT_RESULTS_ID,
      legendId: safeTargets.legendId || DEFAULT_LEGEND_ID,
      hasResults: !!res,
      hasLegend: !!legendEl,
      resultsClassName: res ? safeString(res.className || '') : '',
      resultsHtmlLength: res && typeof res.innerHTML === 'string' ? res.innerHTML.length : null,
      resultsTextLength: res && typeof res.textContent === 'string' ? res.textContent.length : null,
      legendDisplay: legendEl && legendEl.style ? safeString(legendEl.style.display || '') : ''
    };
  }

  function normalizeApplyArgs(arg1, arg2, arg3, arg4) {
    if (arg1 && typeof arg1 === 'object' && (Object.prototype.hasOwnProperty.call(arg1, 'res') || Object.prototype.hasOwnProperty.call(arg1, 'resultsEl') || Object.prototype.hasOwnProperty.call(arg1, 'mount'))) {
      return {
        targets: arg1,
        renderModel: arg2 || {},
        options: arg3 || {}
      };
    }
    return {
      targets: {
        res: arg1 || null,
        resultsEl: arg1 || null,
        mount: arg1 || null,
        legendEl: arg2 || null,
        resultsId: DEFAULT_RESULTS_ID,
        legendId: DEFAULT_LEGEND_ID,
        hasDocument: true
      },
      renderModel: arg3 || {},
      options: arg4 || {}
    };
  }

  function setTrustedHtml(target, html, options) {
    const deps = resolveDependencies(options);
    if (!target) return false;
    if (typeof deps.vildaAppSetTrustedHtml === 'function') {
      deps.vildaAppSetTrustedHtml(target, html, 'estimated-intake-dom-mount');
      return true;
    }
    target.innerHTML = String(html || '');
    return true;
  }

  function applyEstimatedIntakeResultsRenderModel(arg1, arg2, arg3, arg4) {
    const normalized = normalizeApplyArgs(arg1, arg2, arg3, arg4);
    const targets = normalized.targets || {};
    const model = normalized.renderModel || {};
    const options = normalized.options || {};
    const res = targets.res || targets.resultsEl || targets.mount || null;
    const legendEl = targets.legendEl || null;
    const html = typeof model.html === 'string' ? model.html : '';
    const result = {
      step: STEP,
      kind: 'estimated-intake-dom-mount-result',
      branch: model.branch || 'unknown',
      legendVisible: model.legendVisible === true,
      didRenderDom: false,
      didSetLegendDisplay: false,
      missingResults: !res,
      mutatesDom: true,
      writesWindowState: false,
      writesStorage: false,
      targets: describeEstimatedIntakeCalcTargets(targets)
    };

    if (!res) {
      return result;
    }

    setTrustedHtml(res, html, options);
    result.didRenderDom = true;
    result.missingResults = false;

    if (legendEl && legendEl.style) {
      legendEl.style.display = model.legendVisible === true ? 'block' : 'none';
      result.didSetLegendDisplay = true;
    }
    result.targets = describeEstimatedIntakeCalcTargets(targets);
    return result;
  }

  function hideEstimatedIntakeLegend(targets) {
    const safeTargets = targets || getEstimatedIntakeCalcOutputTargets();
    const legendEl = safeTargets.legendEl || null;
    if (legendEl && legendEl.style) {
      legendEl.style.display = 'none';
      return true;
    }
    return false;
  }

  function getSnapshot(options) {
    const opts = options || {};
    const includeTargets = opts.includeTargets === true;
    const targets = includeTargets ? getEstimatedIntakeCalcOutputTargets(opts, opts.dependencies || opts.deps || {}) : null;
    return Object.freeze({
      version: VERSION,
      step: STEP,
      kind: 'estimated-intake-dom-mount-snapshot',
      readOnly: true,
      moduleOnly: true,
      initialized: true,
      canRenderDom: true,
      didRenderDom: false,
      didWriteStorage: false,
      didWriteWindowState: false,
      ownsDomTargets: true,
      ownsRenderMount: true,
      defaultTargets: Object.freeze({ resultsId: DEFAULT_RESULTS_ID, legendId: DEFAULT_LEGEND_ID }),
      currentTargets: includeTargets ? describeEstimatedIntakeCalcTargets(targets) : null,
      functions: Object.freeze({
        getEstimatedIntakeCalcOutputTargets: typeof getEstimatedIntakeCalcOutputTargets === 'function',
        describeEstimatedIntakeCalcTargets: typeof describeEstimatedIntakeCalcTargets === 'function',
        getEstimatedIntakeCalcBranch: typeof getEstimatedIntakeCalcBranch === 'function',
        applyEstimatedIntakeResultsRenderModel: typeof applyEstimatedIntakeResultsRenderModel === 'function',
        hideEstimatedIntakeLegend: typeof hideEstimatedIntakeLegend === 'function'
      })
    });
  }

  const API = Object.freeze({
    __vildaEstimatedIntakeDomMountModule: true,
    VERSION: VERSION,
    version: VERSION,
    STEP: STEP,
    getEstimatedIntakeCalcOutputTargets: getEstimatedIntakeCalcOutputTargets,
    describeEstimatedIntakeCalcTargets: describeEstimatedIntakeCalcTargets,
    getEstimatedIntakeCalcBranch: getEstimatedIntakeCalcBranch,
    applyEstimatedIntakeResultsRenderModel: applyEstimatedIntakeResultsRenderModel,
    hideEstimatedIntakeLegend: hideEstimatedIntakeLegend,
    getSnapshot: getSnapshot
  });

  global.VildaEstimatedIntakeDomMount = API;
  global.vildaGetEstimatedIntakeDomMountSnapshot = getSnapshot;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
