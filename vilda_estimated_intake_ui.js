/* ===========================================================================
 * vilda_estimated_intake_ui.js — estimated intake results renderer
 *
 * Wydzielone z app.js w kroku 8Q-6 bez zmiany obliczeń estimated intake,
 * alertów, window.intakeHistory, window.intakeEstimatedKcalPerDay, JSON,
 * persistence ani synchronizacji advanced growth ↔ estimated intake.
 * Moduł buduje wyłącznie HTML/model renderu i nie dotyka DOM.
 * =========================================================================== */
(function (global) {
  'use strict';

  if (!global) return;
  if (global.VildaEstimatedIntakeUI && global.VildaEstimatedIntakeUI.__vildaEstimatedIntakeUiModule) {
    return;
  }

  const VERSION = '1.0.0';
  const STEP = '8Q-6';

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function resolveDependencies(options) {
    const opts = options || {};
    const deps = opts.dependencies || opts.deps || {};
    return {
      energyRenderModeBadgeHtml: typeof deps.energyRenderModeBadgeHtml === 'function'
        ? deps.energyRenderModeBadgeHtml
        : (typeof global.energyRenderModeBadgeHtml === 'function' ? global.energyRenderModeBadgeHtml : null)
    };
  }

  function formatDecimalComma(value, digits) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    return num.toFixed(digits == null ? 2 : digits).replace('.', ',');
  }

  function formatSignedDecimalComma(value, digits) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    return (num > 0 ? '+' : '') + num.toFixed(digits == null ? 2 : digits).replace('.', ',');
  }

  function formatPal(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num.toFixed(1) : '—';
  }

  function roundKcal(value) {
    return Math.round(value);
  }

  function buildModeBadgeRow(modeBadge, options) {
    const deps = resolveDependencies(options);
    if (!modeBadge || typeof deps.energyRenderModeBadgeHtml !== 'function') return '';
    return `<div class="energy-mode-badge-row energy-mode-badge-row--results">${deps.energyRenderModeBadgeHtml(modeBadge)}</div>`;
  }

  function makeRenderModel(base) {
    return Object.assign({
      step: STEP,
      kind: 'estimated-intake-results-render-model',
      readOnly: true,
      rendersDom: false,
      mutatesDom: false,
      commitsWindowState: false,
      mutatesWindowState: false,
      didCallWindowUpdate: false,
      html: '',
      branch: 'unknown',
      legendVisible: false,
      hasModeBadge: false
    }, base || {});
  }

  function buildEmptyResultsHtml() {
    return makeRenderModel({
      branch: 'empty-rows-message',
      rowCount: 0,
      html: '<p>Uzupełnij co najmniej dwa wiersze, aby wyliczyć szacowane spożycie kalorii na podstawie zmiany masy.</p>',
      legendVisible: false
    });
  }

  function buildSingleRowResultsHtml(calcModel, options) {
    const model = calcModel || {};
    const single = model && model.single ? model.single : null;
    const energy = single ? single.energy : null;
    const modeBadge = single && energy && energy.modeBadge ? energy.modeBadge : (model && model.modeBadge ? model.modeBadge : null);
    const modeBadgeHtml = buildModeBadgeRow(modeBadge, options);
    let html;

    if (single && single.kind === 'infant-under-6') {
      html = `${modeBadgeHtml}<p><strong>Energia:</strong> dla wieku poniżej 6 miesięcy normy nie podają liczbowej wartości energii.</p>`;
    } else if (single && single.kind === 'infant-butte') {
      html = `${modeBadgeHtml}<p><strong>TEE:</strong> ok. <b>${roundKcal(single.teeRawKcal)}</b> kcal/d.<br><span class="muted">Wyliczenie wg Butte dla 6–11 mies.</span></p>`;
    } else {
      const tee = single ? single.maintenanceKcal : null;
      const palUsed = single && single.palUsed != null ? single.palUsed : null;
      html = `${modeBadgeHtml}<p><strong>Utrzymanie masy:</strong> ok. <b>${roundKcal(tee)}</b> kcal/d (PAL ${palUsed != null ? formatPal(palUsed) : '—'}).<br>
        <span class="muted">Dodaj drugi pomiar, aby obliczyć nadwyżkę/deficyt z trendu masy.</span></p>`;
    }

    return makeRenderModel({
      branch: 'single-row-maintenance',
      rowCount: 1,
      singleKind: single && single.kind ? single.kind : null,
      html,
      legendVisible: false,
      hasModeBadge: !!modeBadgeHtml
    });
  }

  function buildIntervalResultsHtml(calcModel, options) {
    const model = calcModel || {};
    const rows = asArray(model.rows);
    const intervals = asArray(model.intervals);
    const modeBadge = model && model.modeBadge ? model.modeBadge : null;
    let cards = buildModeBadgeRow(modeBadge, options);

    intervals.forEach(function (r) {
      if (!r) return;
      cards += `<div class="intake-result-card">
      <p><strong>Okres:</strong> ${formatDecimalComma(r.from, 2)} ➔ ${formatDecimalComma(r.to, 2)} l.</p>
      <p><strong>Dni:</strong> ${r.days}</p>
      <p><strong>Δ masa:</strong> ${formatSignedDecimalComma(r.dW, 2)} kg</p>
      <p><strong>Oczekiwany przyrost:</strong> ${r.isChild ? (formatSignedDecimalComma(r.expectedGain, 2) + ' kg') : '—'}</p>
      <p><strong>Δ vs norma:</strong> ${r.isChild ? (formatSignedDecimalComma(r.deltaVsNorm, 2) + ' kg') : '—'}</p>
      <p><strong>Nadmiar/deficyt (kcal/d):</strong> ${r.energyDeltaPerDay >= 0 ? '+' : ''}${r.energyDeltaPerDay}</p>
      <p><strong>Szac. spożycie (kcal/d):</strong> ${r.intakePerDay}</p>
    </div>`;
    });

    if (model && model.hasChildIntervals) {
      cards += `<p class="muted intake-results-note" style="margin:.25rem 0 0;">* Oczekiwany przyrost – przyrost masy oszacowany na podstawie medianowych (50 c) przyrostów dla wieku oraz rzeczywistego wzrostu dziecka.</p>`;
    }

    return makeRenderModel({
      branch: 'multi-row-interval-render',
      rowCount: rows.length || (Number.isFinite(Number(model.rowCount)) ? Number(model.rowCount) : null),
      intervalCount: intervals.length,
      html: cards,
      legendVisible: (rows.length || Number(model.rowCount) || 0) >= 2,
      hasModeBadge: !!modeBadge && cards.indexOf('energy-mode-badge-row--results') !== -1,
      hasChildIntervals: !!(model && model.hasChildIntervals)
    });
  }

  function buildResultsHtml(calcModel, options) {
    const model = calcModel || {};
    const rows = asArray(model.rows);
    const rowCount = rows.length || (Number.isFinite(Number(model.rowCount)) ? Number(model.rowCount) : 0);
    const branch = model.branch || (!rowCount ? 'empty-rows-message' : (rowCount === 1 ? 'single-row-maintenance' : 'multi-row-interval-render'));

    if (!rowCount || branch === 'empty-rows-message') return buildEmptyResultsHtml(model, options);
    if (rowCount === 1 || branch === 'single-row-maintenance') return buildSingleRowResultsHtml(model, options);
    return buildIntervalResultsHtml(model, options);
  }

  function getSnapshot() {
    return Object.freeze({
      version: VERSION,
      step: STEP,
      kind: 'estimated-intake-ui-snapshot',
      readOnly: true,
      moduleOnly: true,
      initialized: true,
      didRenderDom: false,
      didWriteStorage: false,
      didWriteWindowState: false,
      didCallWindowUpdate: false,
      functions: Object.freeze({
        buildResultsHtml: typeof buildResultsHtml === 'function',
        buildEmptyResultsHtml: typeof buildEmptyResultsHtml === 'function',
        buildSingleRowResultsHtml: typeof buildSingleRowResultsHtml === 'function',
        buildIntervalResultsHtml: typeof buildIntervalResultsHtml === 'function'
      })
    });
  }

  const API = Object.freeze({
    __vildaEstimatedIntakeUiModule: true,
    VERSION: VERSION,
    version: VERSION,
    STEP: STEP,
    buildResultsHtml: buildResultsHtml,
    buildEmptyResultsHtml: buildEmptyResultsHtml,
    buildSingleRowResultsHtml: buildSingleRowResultsHtml,
    buildIntervalResultsHtml: buildIntervalResultsHtml,
    getSnapshot: getSnapshot
  });

  global.VildaEstimatedIntakeUI = API;
  global.vildaGetEstimatedIntakeUiSnapshot = getSnapshot;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
