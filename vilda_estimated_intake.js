/*
 * Vilda Estimated Intake Helper v1.2.0
 *
 * Neutralne helpery i czysty model karty „Szacowane spożycie energii” wydzielane w krokach 8O-9b–8O-9f.
 * Moduł nie inicjalizuje UI, nie dodaje/usuwa wierszy, nie uruchamia calcEstimatedIntake()
 * i nie modyfikuje window.intakeHistory ani window.intakeEstimatedKcalPerDay.
 */
(function (global) {
  'use strict';

  if (!global) return;
  if (global.VildaEstimatedIntake && global.VildaEstimatedIntake.__vildaEstimatedIntakeModule) {
    return;
  }

  const VERSION = '1.2.0';

  function getDocument(options) {
    const opts = options || {};
    return opts.document || opts.doc || global.document || null;
  }

  function readIntakeRows(options) {
    const doc = getDocument(options);
    const out = [];
    if (!doc || typeof doc.querySelectorAll !== 'function') return out;

    doc.querySelectorAll('#intakeMeasurements .measure-row-intake').forEach(function (row) {
      const y = parseFloat(row.querySelector('.intake-ageY') && row.querySelector('.intake-ageY').value);
      const m = parseFloat(row.querySelector('.intake-ageM') && row.querySelector('.intake-ageM').value);
      const h = parseFloat(row.querySelector('.intake-ht') && row.querySelector('.intake-ht').value);
      const w = parseFloat(row.querySelector('.intake-wt') && row.querySelector('.intake-wt').value);
      const hasAge = (!isNaN(y) || !isNaN(m));
      if (hasAge && !isNaN(h) && !isNaN(w)) {
        const months = Math.round(((isNaN(y) ? 0 : y) * 12) + (isNaN(m) ? 0 : m));
        out.push({ ageYears: months / 12, ageMonths: months, months: months, weight: w, height: h });
      }
    });
    out.sort(function (a, b) { return a.months - b.months; });
    return out;
  }

  function getIntakeRowHeight(row, fallbackHeight) {
    const rowHeight = Number(row && row.height);
    if (isFinite(rowHeight) && rowHeight > 0) return rowHeight;
    const fallback = Number(fallbackHeight);
    return (isFinite(fallback) && fallback > 0) ? fallback : null;
  }

  function requireFunction(value, name) {
    if (typeof value !== 'function') {
      throw new Error('VildaEstimatedIntake: missing dependency ' + name);
    }
    return value;
  }

  function resolveFiniteConstant(value, fallback) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  function buildIntakeIntervals(rows, options, dependencies) {
    const opts = options || {};
    const deps = dependencies || {};
    const energyBuildIntakeObservedState = requireFunction(
      deps.energyBuildIntakeObservedState || global.energyBuildIntakeObservedState,
      'energyBuildIntakeObservedState'
    );
    const energyIsNumeric = requireFunction(
      deps.energyIsNumeric || global.energyIsNumeric,
      'energyIsNumeric'
    );
    const expectedGainMedianHeightAware = requireFunction(
      deps.expectedGainMedianHeightAware || global.expectedGainMedianHeightAware,
      'expectedGainMedianHeightAware'
    );
    const ENERGY_ADULT_START_AGE = resolveFiniteConstant(deps.ENERGY_ADULT_START_AGE, 19);
    const KCAL_PER_KG = resolveFiniteConstant(deps.KCAL_PER_KG, 7700);

    const sex = opts.sex || 'M';
    const fallbackHeight = opts.fallbackHeight;
    const pal = Number(opts.pal);
    const teeFactor = (typeof opts.teeFactor === 'number' && isFinite(opts.teeFactor)) ? opts.teeFactor : 1;
    const intervals = [];
    const KG_TOL_PER_MONTH = 0.2;

    if (!Array.isArray(rows) || rows.length < 2) return intervals;

    for (let i = 0; i < rows.length - 1; i += 1) {
      const a = rows[i], b = rows[i + 1];
      const monthsGap = b.months - a.months;
      if (monthsGap <= 0) continue;
      const days = monthsGap * 30.4375;
      const dW = b.weight - a.weight;

      const heightA = getIntakeRowHeight(a, fallbackHeight);
      const heightB = getIntakeRowHeight(b, fallbackHeight);

      const energyA = energyBuildIntakeObservedState({
        ageYears: a.ageYears,
        ageMonthsOpt: (a.ageMonths || 0) % 12,
        sex: sex,
        weightKg: a.weight,
        heightCm: heightA,
        palInput: pal,
        applyRiskAdjust: false
      });
      const energyB = energyBuildIntakeObservedState({
        ageYears: b.ageYears,
        ageMonthsOpt: (b.ageMonths || 0) % 12,
        sex: sex,
        weightKg: b.weight,
        heightCm: heightB,
        palInput: pal,
        applyRiskAdjust: false
      });

      if (!energyIsNumeric(energyA.teeRawKcal) || !energyIsNumeric(energyB.teeRawKcal)) continue;

      const teeRaw = (energyA.teeRawKcal + energyB.teeRawKcal) / 2;
      const teeAdj = teeRaw * teeFactor;

      let expectedGain = 0;
      let deltaVsNorm = dW;
      const childPair = (a.ageYears < ENERGY_ADULT_START_AGE && b.ageYears < ENERGY_ADULT_START_AGE);

      if (childPair) {
        const measPrev = { ageMonths: (typeof a.ageMonths === 'number' ? a.ageMonths : a.months), height: getIntakeRowHeight(a, fallbackHeight), weight: a.weight };
        const measCurr = { ageMonths: (typeof b.ageMonths === 'number' ? b.ageMonths : b.months), height: getIntakeRowHeight(b, fallbackHeight), weight: b.weight };
        expectedGain = expectedGainMedianHeightAware(measPrev, measCurr, sex);
        deltaVsNorm = dW - expectedGain;
      }

      const tol = KG_TOL_PER_MONTH * Math.max(1, monthsGap);
      const stable = Math.abs(childPair ? deltaVsNorm : dW) < tol;
      const energyDeltaPerDay = ((childPair ? deltaVsNorm : dW) * KCAL_PER_KG) / days;
      const intakePerDay = teeAdj + (dW * KCAL_PER_KG) / days;

      intervals.push({
        from: a.ageYears,
        to: b.ageYears,
        days: Math.round(days),
        dW: dW,
        expectedGain: childPair ? expectedGain : null,
        deltaVsNorm: childPair ? deltaVsNorm : null,
        energyDeltaPerDay: stable ? Math.round(energyDeltaPerDay) : Math.round(energyDeltaPerDay),
        intakePerDay: Math.round(intakePerDay),
        isChild: childPair
      });
    }

    return intervals;
  }


  function isFiniteNumberLike(value) {
    return isFinite(value);
  }

  function getAdvancedGrowthData(dependencies) {
    const deps = dependencies || {};
    if (Object.prototype.hasOwnProperty.call(deps, 'advancedGrowthData')) return deps.advancedGrowthData;
    return global.advancedGrowthData || null;
  }

  function collectIntakeRowsForAlertProbe(options, dependencies) {
    const opts = options || {};
    const deps = dependencies || {};
    const getUserBasics = requireFunction(deps.getUserBasics || global.getUserBasics, 'getUserBasics');
    const readRows = requireFunction(deps.readIntakeRows || readIntakeRows, 'readIntakeRows');
    const resolveRowHeight = requireFunction(deps.getIntakeRowHeight || getIntakeRowHeight, 'getIntakeRowHeight');
    const logSwallowedCatch = (typeof deps.logSwallowedCatch === 'function')
      ? deps.logSwallowedCatch
      : (typeof global.vildaLogSwallowedCatch === 'function' ? global.vildaLogSwallowedCatch : null);
    const basics = getUserBasics() || {};
    const rows = [];

    const pushUniqueRow = function (row) {
      if (!row || !isFiniteNumberLike(row.ageMonths) || !isFiniteNumberLike(row.weight)) return;
      const height = resolveRowHeight(row, basics.height);
      const dupe = rows.some(function (existing) {
        return Math.abs(existing.ageMonths - row.ageMonths) <= 1 && Math.abs(existing.weight - row.weight) < 0.01;
      });
      if (dupe) return;
      rows.push({
        ageYears: row.ageMonths / 12,
        ageMonths: row.ageMonths,
        months: row.ageMonths,
        weight: row.weight,
        height: height
      });
    };

    try {
      const liveRows = readRows(opts.readRowsOptions || undefined);
      if (Array.isArray(liveRows) && liveRows.length) {
        liveRows.forEach(pushUniqueRow);
      }
    } catch (error) {
      if (logSwallowedCatch) {
        logSwallowedCatch('vilda_estimated_intake.js', error, { step: '8O-9d-lite', helper: 'collectIntakeRowsForAlertProbe:readIntakeRows' });
      }
    }

    if (isFiniteNumberLike(basics.ageMonths) && isFiniteNumberLike(basics.weight) && isFiniteNumberLike(basics.height)) {
      pushUniqueRow({ ageMonths: basics.ageMonths, weight: basics.weight, height: basics.height });
    }

    const advancedGrowthData = getAdvancedGrowthData(deps);
    if (basics.ageYears < 18 && advancedGrowthData && Array.isArray(advancedGrowthData.measurements)) {
      advancedGrowthData.measurements.forEach(function (measurement) {
        if (!measurement || typeof measurement.ageMonths !== 'number' || typeof measurement.weight !== 'number') return;
        pushUniqueRow({ ageMonths: measurement.ageMonths, weight: measurement.weight, height: measurement.height });
      });
    }

    rows.sort(function (a, b) { return a.months - b.months; });
    return rows;
  }



  function cloneEstimatedIntakeModelRow(row) {
    if (!row || typeof row !== 'object') return row;
    const months = Number.isFinite(Number(row.months))
      ? Number(row.months)
      : (Number.isFinite(Number(row.ageMonths)) ? Number(row.ageMonths) : null);
    const ageMonths = Number.isFinite(Number(row.ageMonths))
      ? Number(row.ageMonths)
      : months;
    const ageYears = Number.isFinite(Number(row.ageYears))
      ? Number(row.ageYears)
      : (Number.isFinite(Number(ageMonths)) ? Number(ageMonths) / 12 : null);
    return {
      ageYears: ageYears,
      ageMonths: ageMonths,
      months: months,
      weight: Number.isFinite(Number(row.weight)) ? Number(row.weight) : row.weight,
      height: Number.isFinite(Number(row.height)) ? Number(row.height) : row.height
    };
  }

  function normalizeEstimatedIntakeModelRows(rows) {
    return Array.isArray(rows) ? rows.map(cloneEstimatedIntakeModelRow).filter(function (row) { return row && row.months != null; }) : [];
  }

  function cloneEstimatedIntakeIntervals(intervals) {
    return Array.isArray(intervals) ? intervals.map(function (r) {
      if (!r || typeof r !== 'object') return r;
      return {
        from: r.from,
        to: r.to,
        days: r.days,
        dW: r.dW,
        expectedGain: r.expectedGain,
        deltaVsNorm: r.deltaVsNorm,
        energyDeltaPerDay: r.energyDeltaPerDay,
        intakePerDay: r.intakePerDay,
        isChild: !!r.isChild
      };
    }) : [];
  }

  function resolveCalculationObservedModel(options) {
    const opts = options || {};
    if (opts.observedModel && typeof opts.observedModel === 'object') return opts.observedModel;
    return opts;
  }

  function resolveCalculationDeps(dependencies) {
    const deps = dependencies || {};
    const intervalDeps = deps.intervalDependencies && typeof deps.intervalDependencies === 'object'
      ? deps.intervalDependencies
      : deps;
    return {
      buildIntakeIntervals: typeof deps.buildIntakeIntervals === 'function' ? deps.buildIntakeIntervals : buildIntakeIntervals,
      getIntakeRowHeight: typeof deps.getIntakeRowHeight === 'function' ? deps.getIntakeRowHeight : getIntakeRowHeight,
      energyBuildIntakeObservedState: deps.energyBuildIntakeObservedState || global.energyBuildIntakeObservedState,
      energyIsNumeric: deps.energyIsNumeric || global.energyIsNumeric || function (value) { return Number.isFinite(Number(value)); },
      intervalDependencies: intervalDeps
    };
  }

  function buildEstimatedIntakeCalculationModel(inputModel, options, dependencies) {
    const input = inputModel || {};
    const observed = resolveCalculationObservedModel(options);
    const deps = resolveCalculationDeps(dependencies);
    const basics = input.basics || {};
    const rows = normalizeEstimatedIntakeModelRows(input.rows);
    const sex = input.sex || basics.sex || 'M';
    const fallbackHeight = Object.prototype.hasOwnProperty.call(input, 'height') ? input.height : basics.height;
    const pal = input.pal;
    const teeFactor = (typeof observed.teeFactor === 'number' && isFinite(observed.teeFactor)) ? observed.teeFactor : 1;
    const branch = !rows.length ? 'empty-rows-message' : (rows.length === 1 ? 'single-row-maintenance' : 'multi-row-interval-render');

    const model = {
      step: '8O-9f',
      kind: 'estimated-intake-calculation-model',
      pureModel: true,
      rendersDom: false,
      commitsWindowState: false,
      mutatesDom: false,
      mutatesWindowState: false,
      branch: branch,
      basics: { sex: sex, height: fallbackHeight },
      pal: pal,
      rows: rows,
      rowCount: rows.length,
      observed: {
        hasLastObservedState: !!observed.lastObservedState,
        teeFactor: teeFactor,
        lastRow: observed.lastRow ? cloneEstimatedIntakeModelRow(observed.lastRow) : null,
        lastHeight: Object.prototype.hasOwnProperty.call(observed, 'lastHeight') ? observed.lastHeight : null
      },
      modeBadge: null,
      single: null,
      intervals: [],
      hasChildIntervals: false,
      commitPlan: { action: 'clear', rows: [], intakeKcalPerDay: null },
      postRenderRiskPlan: null
    };

    if (!rows.length) {
      return model;
    }

    if (rows.length === 1) {
      const r = rows[0];
      const rowHeight = deps.getIntakeRowHeight(r, fallbackHeight);
      let energy = observed.lastObservedState || null;
      if (!energy && typeof deps.energyBuildIntakeObservedState === 'function') {
        energy = deps.energyBuildIntakeObservedState({
          ageYears: r.ageYears,
          ageMonthsOpt: (r.ageMonths || 0) % 12,
          sex: sex,
          weightKg: r.weight,
          heightCm: rowHeight,
          palInput: pal,
          applyRiskAdjust: false
        });
      }
      const singleKind = !energy
        ? 'energy-unavailable'
        : (energy.isInfantUnder6 ? 'infant-under-6' : (energy.isInfantButte ? 'infant-butte' : 'maintenance'));
      const maintenanceKcal = energy
        ? (deps.energyIsNumeric(energy.teeBaselineKcal) ? energy.teeBaselineKcal : energy.teeRawKcal)
        : null;

      model.modeBadge = energy && energy.modeBadge ? energy.modeBadge : null;
      model.single = {
        kind: singleKind,
        row: cloneEstimatedIntakeModelRow(r),
        rowHeight: rowHeight,
        energy: energy || null,
        teeRawKcal: energy ? energy.teeRawKcal : null,
        teeBaselineKcal: energy ? energy.teeBaselineKcal : null,
        maintenanceKcal: maintenanceKcal,
        palUsed: energy && energy.palUsed != null ? energy.palUsed : null
      };
      model.commitPlan = { action: 'set', rows: rows, intakeKcalPerDay: null };
      model.postRenderRiskPlan = {
        shouldRun: true,
        row: cloneEstimatedIntakeModelRow(r),
        rowHeight: rowHeight,
        sex: sex,
        pal: pal,
        intakeKcalPerDay: null
      };
      return model;
    }

    const intervals = cloneEstimatedIntakeIntervals(deps.buildIntakeIntervals(rows, {
      sex: sex,
      fallbackHeight: fallbackHeight,
      pal: pal,
      teeFactor: teeFactor
    }, deps.intervalDependencies));
    const lastInterval = intervals[intervals.length - 1] || null;
    const lastRow = rows[rows.length - 1];
    const lastHeight = deps.getIntakeRowHeight(lastRow, fallbackHeight);

    model.modeBadge = observed.lastObservedState && observed.lastObservedState.modeBadge ? observed.lastObservedState.modeBadge : null;
    model.intervals = intervals;
    model.hasChildIntervals = intervals.some(function (r) { return r && r.isChild; });
    model.commitPlan = { action: 'set', rows: rows, intakeKcalPerDay: lastInterval ? lastInterval.intakePerDay : null };
    model.postRenderRiskPlan = {
      shouldRun: true,
      row: cloneEstimatedIntakeModelRow(lastRow),
      rowHeight: lastHeight,
      sex: sex,
      pal: pal,
      intakeKcalPerDay: lastInterval ? lastInterval.intakePerDay : null
    };
    return model;
  }

  function getApiSurfaceStatus() {
    return {
      version: VERSION,
      readIntakeRows: typeof readIntakeRows === 'function',
      getIntakeRowHeight: typeof getIntakeRowHeight === 'function',
      buildIntakeIntervals: typeof buildIntakeIntervals === 'function',
      collectIntakeRowsForAlertProbe: typeof collectIntakeRowsForAlertProbe === 'function',
      buildEstimatedIntakeCalculationModel: typeof buildEstimatedIntakeCalculationModel === 'function'
    };
  }

  const api = {
    __vildaEstimatedIntakeModule: true,
    version: VERSION,
    VERSION: VERSION,
    readIntakeRows: readIntakeRows,
    getIntakeRowHeight: getIntakeRowHeight,
    buildIntakeIntervals: buildIntakeIntervals,
    collectIntakeRowsForAlertProbe: collectIntakeRowsForAlertProbe,
    buildEstimatedIntakeCalculationModel: buildEstimatedIntakeCalculationModel,
    getApiSurfaceStatus: getApiSurfaceStatus
  };

  global.VildaEstimatedIntake = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
