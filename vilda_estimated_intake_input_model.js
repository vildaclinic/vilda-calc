/*
 * Vilda Estimated Intake Input Model Adapter v1.0.0
 *
 * Krok 8Q-8: adapter modelu wejściowego/observed dla karty „Szacowane spożycie energii”.
 * Moduł buduje inputModel, historyForRisk i lastObservedModel z jawnych zależności DI.
 * Nie inicjalizuje UI, nie renderuje DOM, nie zapisuje storage i nie zapisuje window.intakeHistory
 * ani window.intakeEstimatedKcalPerDay.
 */
(function (global) {
  'use strict';

  if (!global) return;
  if (global.VildaEstimatedIntakeInputModel && global.VildaEstimatedIntakeInputModel.__vildaEstimatedIntakeInputModelModule) {
    return;
  }

  const VERSION = '1.0.0';
  const STEP = '8Q-8';

  function hasOwn(obj, key) {
    return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
  }

  function resolveRootDocument(options, dependencies) {
    const opts = options || {};
    const deps = dependencies || {};
    return opts.document || opts.doc || deps.document || deps.doc || global.document || null;
  }

  function optionalFunction(value) {
    return typeof value === 'function' ? value : null;
  }

  function requireFunction(value, name) {
    if (typeof value !== 'function') {
      throw new Error('VildaEstimatedIntakeInputModel: missing dependency ' + name);
    }
    return value;
  }

  function isNumeric(value) {
    return Number.isFinite(Number(value));
  }

  function clonePlainRow(row) {
    if (!row || typeof row !== 'object') return row;
    const out = {};
    ['ageYears', 'ageMonths', 'months', 'weight', 'height'].forEach(function (key) {
      if (hasOwn(row, key)) out[key] = row[key];
    });
    return out;
  }

  function buildEstimatedIntakeHistoryForRisk(rows) {
    return (Array.isArray(rows) ? rows : []).map(function (row) {
      return {
        ageMonths: row ? row.ageMonths : undefined,
        weight: row ? row.weight : undefined
      };
    });
  }

  function readPalRawValue(options, dependencies) {
    const doc = resolveRootDocument(options, dependencies);
    const palEl = doc && typeof doc.getElementById === 'function'
      ? doc.getElementById('intakePal')
      : null;
    return palEl ? palEl.value : undefined;
  }

  function resolveInputDependencies(dependencies) {
    const deps = dependencies || {};
    const estimated = global.VildaEstimatedIntake || null;
    return {
      document: deps.document || deps.doc || global.document || null,
      getUserBasics: optionalFunction(deps.getUserBasics) || optionalFunction(global.getUserBasics),
      readIntakeRows: optionalFunction(deps.readIntakeRows) || optionalFunction(global.readIntakeRows) || (estimated && optionalFunction(estimated.readIntakeRows)),
      intakeUpdatePalDesc: optionalFunction(deps.intakeUpdatePalDesc) || optionalFunction(global.intakeUpdatePalDesc),
      logSwallowedCatch: optionalFunction(deps.logSwallowedCatch) || optionalFunction(global.vildaLogSwallowedCatch)
    };
  }

  function buildEstimatedIntakeCalcInputModel(options, dependencies) {
    const opts = options || {};
    const deps = resolveInputDependencies(dependencies);
    const getUserBasics = requireFunction(deps.getUserBasics, 'getUserBasics');
    const readRows = requireFunction(deps.readIntakeRows, 'readIntakeRows');
    const basics = getUserBasics() || {};
    const palRaw = readPalRawValue(opts, deps);
    const pal = palRaw === '' || palRaw == null ? null : parseFloat(palRaw);

    if (opts.updatePalDescription === true && typeof deps.intakeUpdatePalDesc === 'function') {
      deps.intakeUpdatePalDesc();
    }

    const rows = readRows(opts.readRowsOptions || undefined);
    const safeRows = Array.isArray(rows) ? rows : [];
    return {
      step: STEP,
      kind: 'estimated-intake-input-model',
      readOnly: true,
      rendersDom: false,
      commitsWindowState: false,
      mutatesWindowState: false,
      basics: basics,
      sex: basics && basics.sex,
      height: basics && basics.height,
      palRaw: palRaw,
      pal: pal,
      rows: safeRows,
      historyForRisk: buildEstimatedIntakeHistoryForRisk(safeRows)
    };
  }

  function resolveObservedDependencies(dependencies) {
    const deps = dependencies || {};
    const estimated = global.VildaEstimatedIntake || null;
    return {
      getIntakeRowHeight: optionalFunction(deps.getIntakeRowHeight) || optionalFunction(global.getIntakeRowHeight) || (estimated && optionalFunction(estimated.getIntakeRowHeight)),
      energyBuildIntakeObservedState: optionalFunction(deps.energyBuildIntakeObservedState) || optionalFunction(global.energyBuildIntakeObservedState),
      energyIsNumeric: optionalFunction(deps.energyIsNumeric) || optionalFunction(global.energyIsNumeric),
      logSwallowedCatch: optionalFunction(deps.logSwallowedCatch) || optionalFunction(global.vildaLogSwallowedCatch)
    };
  }

  function buildEstimatedIntakeLastObservedModel(inputModel, options, dependencies) {
    const opts = options || {};
    const input = inputModel || {};
    const deps = resolveObservedDependencies(dependencies);
    const resolveRowHeight = requireFunction(deps.getIntakeRowHeight, 'getIntakeRowHeight');
    const energyBuildObserved = requireFunction(deps.energyBuildIntakeObservedState, 'energyBuildIntakeObservedState');
    const numeric = requireFunction(deps.energyIsNumeric, 'energyIsNumeric');
    const basics = input.basics || {};
    const rows = Array.isArray(input.rows) ? input.rows : [];
    const historyForRisk = Array.isArray(input.historyForRisk) ? input.historyForRisk : buildEstimatedIntakeHistoryForRisk(rows);
    let lastObservedState = null;
    let teeFactor = 1;
    let lastRow = null;
    let lastHeight = null;

    if (rows.length) {
      lastRow = rows[rows.length - 1];
      lastHeight = resolveRowHeight(lastRow, basics.height);
      lastObservedState = energyBuildObserved({
        ageYears: lastRow.ageYears,
        ageMonthsOpt: (lastRow.ageMonths || 0) % 12,
        sex: basics.sex,
        weightKg: lastRow.weight,
        heightCm: lastHeight,
        palInput: input.pal,
        history: historyForRisk,
        intakeKcalPerDay: null,
        mountId: opts.mountId || 'anorexiaTmpMount',
        applyRiskAdjust: opts.applyRiskAdjust !== false
      });
      if (numeric(lastObservedState && lastObservedState.teeRawKcal) && numeric(lastObservedState && lastObservedState.teeBaselineKcal) && lastObservedState.teeRawKcal > 0) {
        teeFactor = lastObservedState.teeBaselineKcal / lastObservedState.teeRawKcal;
      }
    }

    return {
      step: STEP,
      kind: 'estimated-intake-last-observed-model',
      readOnly: true,
      rendersDom: false,
      commitsWindowState: false,
      mutatesWindowState: false,
      lastObservedState: lastObservedState,
      teeFactor: teeFactor,
      lastRow: lastRow,
      lastHeight: lastHeight,
      historyForRisk: historyForRisk
    };
  }

  function getEstimatedIntakeCalculationModelDependencies(options, dependencies) {
    const deps = dependencies || {};
    const estimated = global.VildaEstimatedIntake || null;
    const intervalDependencies = hasOwn(deps, 'intervalDependencies')
      ? deps.intervalDependencies
      : (typeof deps.getVildaEstimatedIntakeIntervalDependencies === 'function'
          ? deps.getVildaEstimatedIntakeIntervalDependencies()
          : (typeof global.getVildaEstimatedIntakeIntervalDependencies === 'function'
              ? global.getVildaEstimatedIntakeIntervalDependencies()
              : {}));
    return {
      buildIntakeIntervals: optionalFunction(deps.buildIntakeIntervals) || optionalFunction(global.buildIntakeIntervals) || (estimated && optionalFunction(estimated.buildIntakeIntervals)),
      getIntakeRowHeight: optionalFunction(deps.getIntakeRowHeight) || optionalFunction(global.getIntakeRowHeight) || (estimated && optionalFunction(estimated.getIntakeRowHeight)),
      energyBuildIntakeObservedState: optionalFunction(deps.energyBuildIntakeObservedState) || optionalFunction(global.energyBuildIntakeObservedState),
      energyIsNumeric: optionalFunction(deps.energyIsNumeric) || optionalFunction(global.energyIsNumeric),
      intervalDependencies: intervalDependencies || {}
    };
  }

  function getSnapshot(options) {
    const opts = options || {};
    const deps = resolveInputDependencies(opts.dependencies || {});
    const observedDeps = resolveObservedDependencies(opts.dependencies || {});
    let sample = null;
    let errors = [];

    if (opts.executeSample === true) {
      try {
        const sampleRows = [
          { ageYears: 5, ageMonths: 60, months: 60, weight: 20, height: 110 },
          { ageYears: 5.5, ageMonths: 66, months: 66, weight: 22, height: 113 }
        ];
        const sampleInput = buildEstimatedIntakeCalcInputModel({
          updatePalDescription: false,
          document: { getElementById: function () { return { value: '1.4' }; } }
        }, {
          getUserBasics: function () { return { sex: 'M', height: 112, ageYears: 5.5, ageMonths: 66, weight: 22 }; },
          readIntakeRows: function () { return sampleRows; }
        });
        const sampleObserved = buildEstimatedIntakeLastObservedModel(sampleInput, {}, {
          getIntakeRowHeight: function (row, fallbackHeight) { return row && row.height ? row.height : fallbackHeight; },
          energyIsNumeric: function (value) { return Number.isFinite(Number(value)); },
          energyBuildIntakeObservedState: function () { return { teeRawKcal: 1200, teeBaselineKcal: 1320, modeBadge: { mode: 'smoke' } }; }
        });
        sample = {
          inputRows: Array.isArray(sampleInput.rows) ? sampleInput.rows.length : null,
          historyForRiskRows: Array.isArray(sampleInput.historyForRisk) ? sampleInput.historyForRisk.length : null,
          observedTeeFactor: sampleObserved ? sampleObserved.teeFactor : null,
          hasLastObservedState: !!(sampleObserved && sampleObserved.lastObservedState)
        };
      } catch (error) {
        errors.push(String(error && error.message ? error.message : error));
      }
    }

    return {
      step: STEP,
      version: VERSION,
      kind: 'estimated-intake-input-model-adapter-snapshot',
      readOnly: true,
      moduleOnly: true,
      didRenderDom: false,
      didWriteStorage: false,
      didWriteWindowState: false,
      executedCalcEstimatedIntake: false,
      executedDomMount: false,
      executedRuntimeCommit: false,
      api: {
        buildEstimatedIntakeHistoryForRisk: true,
        buildEstimatedIntakeCalcInputModel: true,
        buildEstimatedIntakeLastObservedModel: true,
        getEstimatedIntakeCalculationModelDependencies: true
      },
      dependencies: {
        document: !!deps.document,
        getUserBasics: typeof deps.getUserBasics === 'function',
        readIntakeRows: typeof deps.readIntakeRows === 'function',
        intakeUpdatePalDesc: typeof deps.intakeUpdatePalDesc === 'function',
        getIntakeRowHeight: typeof observedDeps.getIntakeRowHeight === 'function',
        energyBuildIntakeObservedState: typeof observedDeps.energyBuildIntakeObservedState === 'function',
        energyIsNumeric: typeof observedDeps.energyIsNumeric === 'function'
      },
      sample: sample,
      errors: errors
    };
  }

  const api = Object.freeze({
    __vildaEstimatedIntakeInputModelModule: true,
    VERSION: VERSION,
    version: VERSION,
    STEP: STEP,
    buildEstimatedIntakeHistoryForRisk: buildEstimatedIntakeHistoryForRisk,
    buildEstimatedIntakeCalcInputModel: buildEstimatedIntakeCalcInputModel,
    buildEstimatedIntakeLastObservedModel: buildEstimatedIntakeLastObservedModel,
    getEstimatedIntakeCalculationModelDependencies: getEstimatedIntakeCalculationModelDependencies,
    getSnapshot: getSnapshot
  });

  global.VildaEstimatedIntakeInputModel = api;
  global.vildaGetEstimatedIntakeInputModelSnapshot = function (options) {
    return api.getSnapshot(options || {});
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
