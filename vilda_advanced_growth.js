/* ========================================================================== 
 * VildaAdvancedGrowth — helpery i UI zaawansowanego wzrastania
 *
 * 8O-1: neutralne funkcje formatowania, escapowania i sanityzacji tekstu.
 * 8O-2: UI formularza i wierszy pomiarowych advanced growth.
 * 8O-3: raport HTML/PDF advanced growth i kontrolki raportu.
 * 8O-4: kontrola dostępu PRO i źródeł danych wzrastania.
 * 8O-5: mostek importu GH/IGF-1 do historii advanced growth.
 * 8O-6: silniki predykcyjne Bayley-Pinneau/RWT i model wiarygodności.
 * 8O-7a: adapter wejścia/wyjścia dla calculateGrowthAdvanced(), bez przenoszenia orkiestratora.
 * 8O-7b: pomocniczy lifecycle commit/clear/finalize advanced growth.
 * 8O-7c: calculateGrowthAdvanced() jako orkiestrator modułowy z wrapperem app.js.
 * 8O-8b: neutralne helpery synchronizacji advanced growth ↔ estimated intake.
 * 8O-8c: operacje kopiowania/backfill pojedynczego wiersza advanced ↔ intake.
 * 8O-8d: parowanie list wierszy advanced ↔ intake jako delegowany helper.
 * 8O-8e: handlery add/remove synchronizacji advanced ↔ intake jako delegowane helpery.
 * 8O-8f: event wiring input/change synchronizacji advanced ↔ intake jako delegowany helper.
 *
 * Moduł nadal NIE zawiera pełnej rehydratacji JSON.
 * Event wiring advanced ↔ intake jest rejestrowany przez moduł,
 * ale zależności i callbacki pozostają wstrzykiwane z app.js.
 * ========================================================================== */
(function (global) {
  'use strict';

  if (!global) return;
  if (global.VildaAdvancedGrowth && global.VildaAdvancedGrowth.__vildaAdvancedGrowth) {
    return;
  }

  const VERSION = '1.13.1';
  let advancedIntakePairSeq = 0;

  const ADV_HISTORY_ANALYZE_LABEL = 'Analiza punktu pomiarowego';
  const ADV_HISTORY_ANALYZE_HIDE_LABEL = 'Ukryj analizę';

  function logSwallowed(context, error, meta) {
    try {
      if (global.vildaLogSwallowedCatch) {
        global.vildaLogSwallowedCatch(context || 'vilda_advanced_growth', error, meta || {});
        return;
      }
      if (global.VildaLogger && typeof global.VildaLogger.warn === 'function') {
        global.VildaLogger.warn(context || 'vilda_advanced_growth', error, meta || {});
      }
    } catch (_) {}
  }

  function getFunction(name) {
    const fn = global && global[name];
    return (typeof fn === 'function') ? fn : null;
  }

  function callGlobal(name, args, context) {
    const fn = getFunction(name);
    if (!fn) return undefined;
    try {
      return fn.apply(global, Array.isArray(args) ? args : []);
    } catch (error) {
      logSwallowed(context || ('vilda_advanced_growth:' + name), error);
      return undefined;
    }
  }

  function setTrustedHtml(element, html, context) {
    if (!element) return;
    if (global.vildaAppSetTrustedHtml) {
      global.vildaAppSetTrustedHtml(element, html, context || 'vilda-advanced-growth');
      return;
    }
    if (global.VildaHtml && typeof global.VildaHtml.setTrustedHtml === 'function') {
      global.VildaHtml.setTrustedHtml(element, html, context || 'vilda-advanced-growth');
      return;
    }
    element.textContent = String(html || '');
  }

  function clearHtml(element) {
    if (!element) return;
    if (global.vildaAppClearHtml) {
      global.vildaAppClearHtml(element);
      return;
    }
    if (global.VildaHtml && typeof global.VildaHtml.clear === 'function') {
      global.VildaHtml.clear(element);
      return;
    }
    element.textContent = '';
  }

  function escapeHtml(str) {
    if (global.VildaHtml && typeof global.VildaHtml.escapeHtml === 'function') {
      return global.VildaHtml.escapeHtml(str);
    }
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatNumber(value, digits) {
    if (typeof value !== 'number' || !isFinite(value)) return '';
    return value.toFixed(digits).replace('.', ',');
  }

  function formatAgeMonths(ageMonths) {
    if (typeof ageMonths !== 'number' || !isFinite(ageMonths) || ageMonths < 0) return '';
    const yrs = Math.floor(ageMonths / 12);
    const mos = ageMonths - (yrs * 12);
    let yearWord;
    if (yrs === 1) {
      yearWord = 'rok';
    } else if (yrs % 10 >= 2 && yrs % 10 <= 4 && (yrs % 100 < 10 || yrs % 100 >= 20)) {
      yearWord = 'lata';
    } else {
      yearWord = 'lat';
    }
    return `${yrs} ${yearWord} ${mos} mies.`;
  }

  function sourceLabel(source) {
    const map = {
      'PALCZEWSKA': 'Palczewska',
      'OLAF': 'OLAF',
      'WHO': 'WHO'
    };
    return map[String(source || '').toUpperCase()] || String(source || '');
  }

  function decodeCentile(centileText) {
    return String(centileText || '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  }

  function percentileText(percentile) {
    if (typeof percentile !== 'number' || !isFinite(percentile)) return null;
    const centTxt = (typeof global.formatCentile === 'function')
      ? global.formatCentile(percentile)
      : formatNumber(percentile, percentile < 10 ? 1 : 0);
    const word = (typeof global.centylWord === 'function')
      ? global.centylWord(centTxt)
      : 'centyl';
    return `${decodeCentile(centTxt)} ${word}`;
  }

  function formatSignedNumber(value, digits) {
    if (typeof value !== 'number' || !isFinite(value)) return '—';
    const abs = formatNumber(Math.abs(value), digits);
    if (value > 0) return `+${abs}`;
    if (value < 0) return `-${abs}`;
    return abs;
  }

  function sanitizePdfText(value) {
    return String(value == null ? '' : value)
      .replace(/\r?\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function sanitizePdfMultilineText(value) {
    return String(value == null ? '' : value)
      .replace(/\r\n?/g, '\n')
      .replace(/[^\S\n]+/g, ' ')
      .replace(/\n{2,}/g, '\n')
      .split('\n')
      .map((line) => line.trim())
      .join('\n')
      .trim();
  }

  function hexToRgb(hex) {
    const raw = String(hex || '').replace('#', '');
    if (raw.length !== 6) return [0, 0, 0];
    return [parseInt(raw.slice(0, 2), 16), parseInt(raw.slice(2, 4), 16), parseInt(raw.slice(4, 6), 16)];
  }

  /* --------------------------------------------------------------------------
   * 8O-8c — operacje pojedynczego wiersza advanced growth ↔ estimated intake.
   *
   * Ten blok NIE paruje całych list wierszy, NIE dodaje ani NIE usuwa wierszy
   * i NIE podpina eventów. Wykonuje wyłącznie kopiowanie danych w ramach
   * istniejącej pary syncId oraz opcjonalne callbacki przekazane przez app.js.
   * -------------------------------------------------------------------------- */

  function advancedIntakeRowSyncIsSuspended(options) {
    try {
      const opts = options || {};
      const root = opts.global || global || (typeof globalThis !== 'undefined' ? globalThis : null);
      return !!(root && root.__vildaSuspendAdvIntakeSync);
    } catch (_) {
      return false;
    }
  }

  function advancedIntakeCallRowSyncCallback(callback, args, context) {
    if (typeof callback !== 'function') return undefined;
    try {
      return callback.apply(null, Array.isArray(args) ? args : []);
    } catch (error) {
      logSwallowed(context || 'vilda_advanced_growth:advanced-intake-row-sync:callback', error);
      return undefined;
    }
  }

  function advancedIntakePairingIsSuspended(options) {
    const opts = options || {};
    if (typeof opts.isSuspended === 'function') {
      return !!advancedIntakeCallRowSyncCallback(opts.isSuspended, [], 'vilda_advanced_growth:advanced-intake-pairing:is-suspended');
    }
    return advancedIntakeRowSyncIsSuspended(opts);
  }

  function advancedIntakeRunPairingWithSyncSuspended(options, callback) {
    const opts = options || {};
    if (typeof opts.runWithSyncSuspended === 'function') {
      return opts.runWithSyncSuspended(callback);
    }

    const root = opts.global || global || (typeof globalThis !== 'undefined' ? globalThis : null);
    let previous = false;
    try {
      if (root) {
        previous = !!root.__vildaSuspendAdvIntakeSync;
        root.__vildaSuspendAdvIntakeSync = true;
      }
    } catch (error) {
      logSwallowed('vilda_advanced_growth:advanced-intake-pairing:set-suspended', error);
    }

    try {
      return (typeof callback === 'function') ? callback() : undefined;
    } finally {
      try {
        if (root) root.__vildaSuspendAdvIntakeSync = previous;
      } catch (error) {
        logSwallowed('vilda_advanced_growth:advanced-intake-pairing:restore-suspended', error);
      }
    }
  }

  function advancedIntakeNextPairSyncId(options) {
    const opts = options || {};
    if (typeof opts.nextSyncId === 'function') {
      const delegated = advancedIntakeCallRowSyncCallback(opts.nextSyncId, [], 'vilda_advanced_growth:advanced-intake-pairing:next-sync-id');
      if (delegated) return String(delegated);
    }
    advancedIntakePairSeq += 1;
    let stamp = '0';
    try { stamp = Date.now().toString(36); } catch (_) {}
    return `adv-intake-${stamp}-${advancedIntakePairSeq}`;
  }

  function advancedIntakeCallPairingCallback(callback, args, context) {
    return advancedIntakeCallRowSyncCallback(callback, args, context);
  }

  function advancedIntakeDomValue(value) {
    if (value === '' || value === null || value === undefined) return '';
    if (typeof value === 'number' && Number.isNaN(value)) return '';
    return String(value);
  }

  function advancedIntakeSetRowValue(row, selector, value) {
    const el = row && typeof row.querySelector === 'function' ? row.querySelector(selector) : null;
    if (!el) return false;
    el.value = advancedIntakeDomValue(value);
    return true;
  }

  function advancedIntakeNormalizeAgeParts(yearRaw, monthRaw, yearValue, monthValue) {
    const hasYear = String(yearRaw ?? '').trim() !== '';
    const hasMonth = String(monthRaw ?? '').trim() !== '';
    if (!hasYear && !hasMonth) return { years: '', months: '' };

    let yearsOut = (!hasYear || Number.isNaN(yearValue)) ? '' : yearValue;
    let monthsOut = (!hasMonth || Number.isNaN(monthValue)) ? '' : Math.round(monthValue);
    if (monthsOut !== '' && monthsOut >= 12) {
      const baseYears = (yearsOut === '' || Number.isNaN(Number(yearsOut))) ? 0 : Number(yearsOut);
      yearsOut = baseYears + Math.floor(Number(monthsOut) / 12);
      monthsOut = Number(monthsOut) % 12;
    }
    return { years: yearsOut, months: monthsOut };
  }

  function copyAdvancedIntakeValueIfTargetEmpty(targetEl, value) {
    if (!targetEl) return false;
    if (String(targetEl.value ?? '').trim() !== '') return false;
    if (value === null || value === undefined || value === '' || (typeof value === 'number' && Number.isNaN(value))) return false;
    targetEl.value = String(value);
    return true;
  }

  function backfillAdvancedIntakeHistoryRowFromAdvancedRow(advancedRow, intakeRow) {
    if (!advancedRow || !intakeRow || typeof advancedRow.querySelector !== 'function' || typeof intakeRow.querySelector !== 'function') return false;
    let changed = false;
    const advAgeY = parseFloat(advancedRow.querySelector('.adv-age-years')?.value);
    const advAgeM = parseFloat(advancedRow.querySelector('.adv-age-months')?.value);
    const advHeight = parseFloat(advancedRow.querySelector('.adv-height')?.value);
    const advWeight = parseFloat(advancedRow.querySelector('.adv-weight')?.value);
    changed = copyAdvancedIntakeValueIfTargetEmpty(intakeRow.querySelector('.intake-ageY'), Number.isNaN(advAgeY) ? '' : advAgeY) || changed;
    changed = copyAdvancedIntakeValueIfTargetEmpty(intakeRow.querySelector('.intake-ageM'), Number.isNaN(advAgeM) ? '' : Math.round(advAgeM)) || changed;
    changed = copyAdvancedIntakeValueIfTargetEmpty(intakeRow.querySelector('.intake-ht'), Number.isNaN(advHeight) ? '' : advHeight) || changed;
    changed = copyAdvancedIntakeValueIfTargetEmpty(intakeRow.querySelector('.intake-wt'), Number.isNaN(advWeight) ? '' : advWeight) || changed;
    return changed;
  }

  function backfillAdvancedIntakeAdvancedRowFromHistoryRow(intakeRow, advancedRow) {
    if (!intakeRow || !advancedRow || typeof intakeRow.querySelector !== 'function' || typeof advancedRow.querySelector !== 'function') return false;
    let changed = false;
    const intakeAgeY = parseFloat(intakeRow.querySelector('.intake-ageY')?.value);
    const intakeAgeM = parseFloat(intakeRow.querySelector('.intake-ageM')?.value);
    const intakeHeight = parseFloat(intakeRow.querySelector('.intake-ht')?.value);
    const intakeWeight = parseFloat(intakeRow.querySelector('.intake-wt')?.value);
    changed = copyAdvancedIntakeValueIfTargetEmpty(advancedRow.querySelector('.adv-age-years'), Number.isNaN(intakeAgeY) ? '' : intakeAgeY) || changed;
    changed = copyAdvancedIntakeValueIfTargetEmpty(advancedRow.querySelector('.adv-age-months'), Number.isNaN(intakeAgeM) ? '' : Math.round(intakeAgeM)) || changed;
    changed = copyAdvancedIntakeValueIfTargetEmpty(advancedRow.querySelector('.adv-height'), Number.isNaN(intakeHeight) ? '' : intakeHeight) || changed;
    changed = copyAdvancedIntakeValueIfTargetEmpty(advancedRow.querySelector('.adv-weight'), Number.isNaN(intakeWeight) ? '' : intakeWeight) || changed;
    return changed;
  }

  function syncAdvancedIntakeAdvancedRowToHistoryRow(advancedRow, options) {
    const opts = options || {};
    if (advancedIntakeRowSyncIsSuspended(opts)) return false;
    if (!advancedRow || typeof advancedRow.querySelector !== 'function') return false;

    let syncId = advIntakeGetSyncId(advancedRow);
    if (!syncId && !opts.skipPairing) {
      advancedIntakeCallRowSyncCallback(opts.pairRows, [], 'vilda_advanced_growth:advanced-intake-row-sync:pair-advanced-to-intake');
      syncId = advIntakeGetSyncId(advancedRow);
    }

    const intakeRow = opts.targetRow || (
      typeof opts.findIntakeHistoryRowBySyncId === 'function'
        ? opts.findIntakeHistoryRowBySyncId(syncId)
        : advIntakeFindIntakeHistoryRowBySyncId(syncId, opts)
    );
    if (!intakeRow || typeof intakeRow.querySelector !== 'function') return false;

    const yEl = advancedRow.querySelector('.adv-age-years');
    const mEl = advancedRow.querySelector('.adv-age-months');
    const yRaw = advIntakeGetRawInputValue(yEl);
    const mRaw = advIntakeGetRawInputValue(mEl);
    const yVal = yEl ? parseFloat(yEl.value) : NaN;
    const mVal = mEl ? parseFloat(mEl.value) : NaN;
    const h = parseFloat(advancedRow.querySelector('.adv-height')?.value);
    const w = parseFloat(advancedRow.querySelector('.adv-weight')?.value);
    const age = advancedIntakeNormalizeAgeParts(yRaw, mRaw, yVal, mVal);

    advancedIntakeSetRowValue(intakeRow, '.intake-ageY', age.years);
    advancedIntakeSetRowValue(intakeRow, '.intake-ageM', age.months);
    advancedIntakeSetRowValue(intakeRow, '.intake-ht', h);
    advancedIntakeSetRowValue(intakeRow, '.intake-wt', w);

    advancedIntakeCallRowSyncCallback(opts.onAfterSync, [advancedRow, intakeRow, syncId], 'vilda_advanced_growth:advanced-intake-row-sync:after-advanced-to-intake');
    return true;
  }

  function syncAdvancedIntakeHistoryRowToAdvancedRow(intakeRow, options) {
    const opts = options || {};
    if (advancedIntakeRowSyncIsSuspended(opts)) return false;
    if (!intakeRow || typeof intakeRow.querySelector !== 'function' || (intakeRow.dataset && intakeRow.dataset.locked === 'true')) return false;

    let syncId = advIntakeGetSyncId(intakeRow);
    if (!syncId && !opts.skipPairing) {
      advancedIntakeCallRowSyncCallback(opts.pairRows, [], 'vilda_advanced_growth:advanced-intake-row-sync:pair-intake-to-advanced');
      syncId = advIntakeGetSyncId(intakeRow);
    }

    const advancedRow = opts.targetRow || (
      typeof opts.findAdvancedRowBySyncId === 'function'
        ? opts.findAdvancedRowBySyncId(syncId)
        : advIntakeFindAdvancedRowBySyncId(syncId, opts)
    );
    if (!advancedRow || typeof advancedRow.querySelector !== 'function') return false;

    const yEl = intakeRow.querySelector('.intake-ageY');
    const mEl = intakeRow.querySelector('.intake-ageM');
    const yRaw = advIntakeGetRawInputValue(yEl);
    const mRaw = advIntakeGetRawInputValue(mEl);
    const yVal = yEl ? parseFloat(yEl.value) : NaN;
    const mVal = mEl ? parseFloat(mEl.value) : NaN;
    const h = parseFloat(intakeRow.querySelector('.intake-ht')?.value);
    const w = parseFloat(intakeRow.querySelector('.intake-wt')?.value);
    const age = advancedIntakeNormalizeAgeParts(yRaw, mRaw, yVal, mVal);

    advancedIntakeSetRowValue(advancedRow, '.adv-age-years', age.years);
    advancedIntakeSetRowValue(advancedRow, '.adv-age-months', age.months);
    advancedIntakeSetRowValue(advancedRow, '.adv-height', h);
    advancedIntakeSetRowValue(advancedRow, '.adv-weight', w);

    advancedIntakeCallRowSyncCallback(opts.onAfterSync, [intakeRow, advancedRow, syncId], 'vilda_advanced_growth:advanced-intake-row-sync:after-intake-to-advanced');
    return true;
  }

  function pairAdvancedIntakeRowsByOrder(options) {
    const opts = options || {};
    const doc = getDocument(opts);
    const result = {
      step: '8O-8d',
      paired: false,
      mutated: false,
      skipped: false,
      reason: ''
    };

    if (advancedIntakePairingIsSuspended(opts)) {
      result.skipped = true;
      result.reason = 'suspended';
      return result;
    }

    const hasAdvanced = !!(doc && typeof doc.getElementById === 'function' && doc.getElementById('advMeasurements'));
    const hasIntake = !!(doc && typeof doc.getElementById === 'function' && doc.getElementById('intakeMeasurements'));
    if (!hasAdvanced || !hasIntake) {
      advancedIntakeCallPairingCallback(opts.refreshRowUi, [], 'vilda_advanced_growth:advanced-intake-pairing:refresh-missing-containers');
      result.skipped = true;
      result.reason = 'missing-containers';
      return result;
    }

    let mutated = false;
    const readAdvancedRows = () => advIntakeGetAdvancedRows(opts);
    const readIntakeHistoryRows = () => advIntakeGetIntakeHistoryRows(opts);

    advancedIntakeRunPairingWithSyncSuspended(opts, () => {
      advancedIntakeCallPairingCallback(opts.updateIntakeFirstRowFromUserBasics, [], 'vilda_advanced_growth:advanced-intake-pairing:update-current-row');
      mutated = !!advancedIntakeCallPairingCallback(opts.pruneDuplicateCurrentHistoryRows, [], 'vilda_advanced_growth:advanced-intake-pairing:prune-current-duplicates') || mutated;
      mutated = !!advancedIntakeCallPairingCallback(opts.pruneBlankAdvancedRows, [], 'vilda_advanced_growth:advanced-intake-pairing:prune-blank-advanced') || mutated;
      mutated = !!advancedIntakeCallPairingCallback(opts.pruneBlankIntakeHistoryRows, [], 'vilda_advanced_growth:advanced-intake-pairing:prune-blank-intake') || mutated;

      const advBeforeEnsure = readAdvancedRows().length;
      const intakeBeforeEnsure = readIntakeHistoryRows().length;
      advancedIntakeCallPairingCallback(opts.ensureAtLeastOneAdvancedHistoryRow, [], 'vilda_advanced_growth:advanced-intake-pairing:ensure-advanced-row');
      advancedIntakeCallPairingCallback(opts.ensureAtLeastOneIntakeHistoryRow, [], 'vilda_advanced_growth:advanced-intake-pairing:ensure-intake-row');
      if (readAdvancedRows().length !== advBeforeEnsure || readIntakeHistoryRows().length !== intakeBeforeEnsure) {
        mutated = true;
      }

      let safety = 0;
      while (readAdvancedRows().length < readIntakeHistoryRows().length) {
        if (typeof opts.addAdvancedRow !== 'function') break;
        const before = readAdvancedRows().length;
        advancedIntakeCallPairingCallback(opts.addAdvancedRow, [], 'vilda_advanced_growth:advanced-intake-pairing:add-advanced-row');
        mutated = true;
        safety += 1;
        if (safety > 200) break;
        if (readAdvancedRows().length <= before && readAdvancedRows().length < readIntakeHistoryRows().length) break;
      }

      safety = 0;
      while (readIntakeHistoryRows().length < readAdvancedRows().length) {
        if (typeof opts.addIntakeRow !== 'function') break;
        const before = readIntakeHistoryRows().length;
        advancedIntakeCallPairingCallback(opts.addIntakeRow, [], 'vilda_advanced_growth:advanced-intake-pairing:add-intake-row');
        mutated = true;
        safety += 1;
        if (safety > 200) break;
        if (readIntakeHistoryRows().length <= before && readIntakeHistoryRows().length < readAdvancedRows().length) break;
      }

      const advancedRows = readAdvancedRows();
      const intakeHistoryRows = readIntakeHistoryRows();
      const pairCount = Math.max(advancedRows.length, intakeHistoryRows.length);

      for (let i = 0; i < pairCount; i += 1) {
        const advancedRow = advancedRows[i];
        const intakeRow = intakeHistoryRows[i];
        const syncId = advIntakeGetSyncId(advancedRow) || advIntakeGetSyncId(intakeRow) || advancedIntakeNextPairSyncId(opts);
        advIntakeSetSyncId(advancedRow, syncId);
        advIntakeSetSyncId(intakeRow, syncId);
      }

      for (let i = 0; i < pairCount; i += 1) {
        const advancedRow = advancedRows[i];
        const intakeRow = intakeHistoryRows[i];
        if (!advancedRow || !intakeRow) continue;

        if (typeof opts.backfillIntakeRowFromAdv === 'function') {
          advancedIntakeCallPairingCallback(opts.backfillIntakeRowFromAdv, [advancedRow, intakeRow], 'vilda_advanced_growth:advanced-intake-pairing:backfill-intake');
        } else {
          backfillAdvancedIntakeHistoryRowFromAdvancedRow(advancedRow, intakeRow);
        }

        if (typeof opts.backfillAdvRowFromIntake === 'function') {
          advancedIntakeCallPairingCallback(opts.backfillAdvRowFromIntake, [intakeRow, advancedRow], 'vilda_advanced_growth:advanced-intake-pairing:backfill-advanced');
        } else {
          backfillAdvancedIntakeAdvancedRowFromHistoryRow(intakeRow, advancedRow);
        }

        if (advIntakeAdvRowHasAnyData(advancedRow) && !advIntakeIntakeRowHasAnyData(intakeRow)) {
          if (typeof opts.syncAdvRowToIntake === 'function') {
            advancedIntakeCallPairingCallback(opts.syncAdvRowToIntake, [advancedRow, { skipPairing: true }], 'vilda_advanced_growth:advanced-intake-pairing:sync-advanced-to-intake');
          } else {
            syncAdvancedIntakeAdvancedRowToHistoryRow(advancedRow, Object.assign({}, opts, { skipPairing: true }));
          }
        } else if (advIntakeIntakeRowHasAnyData(intakeRow) && !advIntakeAdvRowHasAnyData(advancedRow)) {
          if (typeof opts.syncIntakeRowToAdv === 'function') {
            advancedIntakeCallPairingCallback(opts.syncIntakeRowToAdv, [intakeRow, { skipPairing: true }], 'vilda_advanced_growth:advanced-intake-pairing:sync-intake-to-advanced');
          } else {
            syncAdvancedIntakeHistoryRowToAdvancedRow(intakeRow, Object.assign({}, opts, { skipPairing: true }));
          }
        }
      }
    });

    advancedIntakeCallPairingCallback(opts.refreshRowUi, [], 'vilda_advanced_growth:advanced-intake-pairing:refresh-final');

    if (mutated) {
      advancedIntakeCallPairingCallback(opts.calculateGrowthAdvanced, [], 'vilda_advanced_growth:advanced-intake-pairing:calculate-growth');
      advancedIntakeCallPairingCallback(opts.debouncedIntakeCalc, [], 'vilda_advanced_growth:advanced-intake-pairing:intake-calc');
    }

    result.paired = true;
    result.mutated = mutated;
    try {
      result.counts = {
        advancedRows: readAdvancedRows().length,
        intakeHistoryRows: readIntakeHistoryRows().length
      };
    } catch (_) {}
    return result;
  }


  /* --------------------------------------------------------------------------
   * 8O-8e — handlery add/remove advanced growth ↔ estimated intake.
   *
   * Ten blok NIE podpina eventów i NIE zmienia rehydratacji JSON. Przejmuje
   * wyłącznie logikę reakcji na kliknięcia add/remove, z callbackami przekazanymi
   * przez app.js dla lokalnych funkcji dodawania wierszy, przeliczeń i UI.
   * -------------------------------------------------------------------------- */

  function advancedIntakeReadRowsForHandler(options, callbackName, fallbackReader, context) {
    const opts = options || {};
    let rows;
    if (callbackName && typeof opts[callbackName] === 'function') {
      rows = advancedIntakeCallRowSyncCallback(opts[callbackName], [], context || ('vilda_advanced_growth:advanced-intake-handler:' + callbackName));
    } else if (typeof fallbackReader === 'function') {
      rows = fallbackReader(opts);
    }
    return Array.isArray(rows) ? rows : Array.from(rows || []);
  }

  function advancedIntakeReadAdvancedRowsForHandler(options) {
    return advancedIntakeReadRowsForHandler(
      options,
      'getAdvancedRows',
      advIntakeGetAdvancedRows,
      'vilda_advanced_growth:advanced-intake-handler:get-advanced-rows'
    );
  }

  function advancedIntakeReadIntakeHistoryRowsForHandler(options) {
    return advancedIntakeReadRowsForHandler(
      options,
      'getIntakeHistoryRows',
      advIntakeGetIntakeHistoryRows,
      'vilda_advanced_growth:advanced-intake-handler:get-intake-history-rows'
    );
  }

  function advancedIntakeInvokePairRowsForHandler(options, context) {
    const opts = options || {};
    if (typeof opts.pairRows === 'function') {
      return advancedIntakeCallRowSyncCallback(opts.pairRows, [], context || 'vilda_advanced_growth:advanced-intake-handler:pair-rows');
    }
    return pairAdvancedIntakeRowsByOrder(opts);
  }

  function advancedIntakeRefreshRowsForHandler(options, context) {
    advancedIntakeCallRowSyncCallback((options || {}).refreshRowUi, [], context || 'vilda_advanced_growth:advanced-intake-handler:refresh-row-ui');
  }

  function advancedIntakeRunCalculationsForHandler(options, contextPrefix) {
    const opts = options || {};
    advancedIntakeCallRowSyncCallback(opts.calculateGrowthAdvanced, [], (contextPrefix || 'vilda_advanced_growth:advanced-intake-handler') + ':calculate-growth');
    advancedIntakeCallRowSyncCallback(opts.debouncedIntakeCalc, [], (contextPrefix || 'vilda_advanced_growth:advanced-intake-handler') + ':intake-calc');
  }

  function advancedIntakeRemoveRowForHandler(row, context) {
    if (!row || typeof row.remove !== 'function') return false;
    try {
      row.remove();
      return true;
    } catch (error) {
      logSwallowed(context || 'vilda_advanced_growth:advanced-intake-handler:remove-row', error);
      return false;
    }
  }

  function advancedIntakeIsProtectedAdvancedForHandler(row, options) {
    const opts = options || {};
    if (typeof opts.isProtectedAdvancedHistoryRow === 'function') {
      return !!advancedIntakeCallRowSyncCallback(opts.isProtectedAdvancedHistoryRow, [row], 'vilda_advanced_growth:advanced-intake-handler:is-protected-advanced');
    }
    return advIntakeIsProtectedAdvancedHistoryRow(row, opts);
  }

  function advancedIntakeIsProtectedIntakeForHandler(row, options) {
    const opts = options || {};
    if (typeof opts.isProtectedIntakeHistoryRow === 'function') {
      return !!advancedIntakeCallRowSyncCallback(opts.isProtectedIntakeHistoryRow, [row], 'vilda_advanced_growth:advanced-intake-handler:is-protected-intake');
    }
    return advIntakeIsProtectedIntakeHistoryRow(row, opts);
  }

  function handleAdvancedIntakeAdvancedMeasurementRowRemove(row, options) {
    const opts = options || {};
    if (!row || advancedIntakeIsProtectedAdvancedForHandler(row, opts)) {
      advancedIntakeRefreshRowsForHandler(opts, 'vilda_advanced_growth:advanced-intake-handler:advanced-remove:protected-refresh');
      return false;
    }

    const syncId = advIntakeGetSyncId(row);

    advancedIntakeRunPairingWithSyncSuspended(opts, () => {
      const twin = (typeof opts.findIntakeHistoryRowBySyncId === 'function')
        ? advancedIntakeCallRowSyncCallback(opts.findIntakeHistoryRowBySyncId, [syncId], 'vilda_advanced_growth:advanced-intake-handler:advanced-remove:find-twin')
        : advIntakeFindIntakeHistoryRowBySyncId(syncId, opts);
      if (twin) advancedIntakeRemoveRowForHandler(twin, 'vilda_advanced_growth:advanced-intake-handler:advanced-remove:remove-twin');
      advancedIntakeRemoveRowForHandler(row, 'vilda_advanced_growth:advanced-intake-handler:advanced-remove:remove-row');

      if (!advancedIntakeReadAdvancedRowsForHandler(opts).length && typeof opts.addAdvancedRow === 'function') {
        advancedIntakeCallRowSyncCallback(opts.addAdvancedRow, [], 'vilda_advanced_growth:advanced-intake-handler:advanced-remove:add-advanced-row');
      }
      if (!advancedIntakeReadIntakeHistoryRowsForHandler(opts).length && typeof opts.addIntakeRow === 'function') {
        advancedIntakeCallRowSyncCallback(opts.addIntakeRow, [], 'vilda_advanced_growth:advanced-intake-handler:advanced-remove:add-intake-row');
      }
    });

    advancedIntakeInvokePairRowsForHandler(opts, 'vilda_advanced_growth:advanced-intake-handler:advanced-remove:pair');
    advancedIntakeRunCalculationsForHandler(opts, 'vilda_advanced_growth:advanced-intake-handler:advanced-remove');
    return true;
  }

  function handleAdvancedIntakeHistoryRowRemove(row, options) {
    const opts = options || {};
    const locked = !!(row && row.dataset && row.dataset.locked === 'true');
    if (!row || locked || advancedIntakeIsProtectedIntakeForHandler(row, opts)) {
      advancedIntakeRefreshRowsForHandler(opts, 'vilda_advanced_growth:advanced-intake-handler:intake-remove:protected-refresh');
      return false;
    }

    const syncId = advIntakeGetSyncId(row);

    advancedIntakeRunPairingWithSyncSuspended(opts, () => {
      const twin = (typeof opts.findAdvancedRowBySyncId === 'function')
        ? advancedIntakeCallRowSyncCallback(opts.findAdvancedRowBySyncId, [syncId], 'vilda_advanced_growth:advanced-intake-handler:intake-remove:find-twin')
        : advIntakeFindAdvancedRowBySyncId(syncId, opts);
      if (twin) advancedIntakeRemoveRowForHandler(twin, 'vilda_advanced_growth:advanced-intake-handler:intake-remove:remove-twin');
      advancedIntakeRemoveRowForHandler(row, 'vilda_advanced_growth:advanced-intake-handler:intake-remove:remove-row');

      if (!advancedIntakeReadIntakeHistoryRowsForHandler(opts).length && typeof opts.addIntakeRow === 'function') {
        advancedIntakeCallRowSyncCallback(opts.addIntakeRow, [], 'vilda_advanced_growth:advanced-intake-handler:intake-remove:add-intake-row');
      }
      if (!advancedIntakeReadAdvancedRowsForHandler(opts).length && typeof opts.addAdvancedRow === 'function') {
        advancedIntakeCallRowSyncCallback(opts.addAdvancedRow, [], 'vilda_advanced_growth:advanced-intake-handler:intake-remove:add-advanced-row');
      }
    });

    advancedIntakeInvokePairRowsForHandler(opts, 'vilda_advanced_growth:advanced-intake-handler:intake-remove:pair');
    advancedIntakeRunCalculationsForHandler(opts, 'vilda_advanced_growth:advanced-intake-handler:intake-remove');
    return true;
  }

  function handleAdvancedIntakeAdvancedMeasurementAdd(options) {
    const opts = options || {};
    advancedIntakeInvokePairRowsForHandler(opts, 'vilda_advanced_growth:advanced-intake-handler:advanced-add:initial-pair');

    const syncId = advancedIntakeNextPairSyncId(opts);

    advancedIntakeRunPairingWithSyncSuspended(opts, () => {
      if (typeof opts.addAdvancedRow === 'function') {
        advancedIntakeCallRowSyncCallback(opts.addAdvancedRow, [], 'vilda_advanced_growth:advanced-intake-handler:advanced-add:add-advanced-row');
      }
      if (typeof opts.addIntakeRow === 'function') {
        advancedIntakeCallRowSyncCallback(opts.addIntakeRow, [], 'vilda_advanced_growth:advanced-intake-handler:advanced-add:add-intake-row');
      }
    });

    const advancedRows = advancedIntakeReadAdvancedRowsForHandler(opts);
    const intakeRows = advancedIntakeReadIntakeHistoryRowsForHandler(opts);
    advIntakeSetSyncId(advancedRows[advancedRows.length - 1], syncId);
    advIntakeSetSyncId(intakeRows[intakeRows.length - 1], syncId);

    advancedIntakeRefreshRowsForHandler(opts, 'vilda_advanced_growth:advanced-intake-handler:advanced-add:refresh');
    advancedIntakeRunCalculationsForHandler(opts, 'vilda_advanced_growth:advanced-intake-handler:advanced-add');
    return true;
  }

  function handleAdvancedIntakeHistoryAdd(options) {
    const opts = options || {};
    advancedIntakeInvokePairRowsForHandler(opts, 'vilda_advanced_growth:advanced-intake-handler:intake-add:initial-pair');

    const syncId = advancedIntakeNextPairSyncId(opts);

    advancedIntakeRunPairingWithSyncSuspended(opts, () => {
      if (typeof opts.addIntakeRow === 'function') {
        advancedIntakeCallRowSyncCallback(opts.addIntakeRow, [], 'vilda_advanced_growth:advanced-intake-handler:intake-add:add-intake-row');
      }
      if (typeof opts.addAdvancedRow === 'function') {
        advancedIntakeCallRowSyncCallback(opts.addAdvancedRow, [], 'vilda_advanced_growth:advanced-intake-handler:intake-add:add-advanced-row');
      }
    });

    const intakeRows = advancedIntakeReadIntakeHistoryRowsForHandler(opts);
    const advancedRows = advancedIntakeReadAdvancedRowsForHandler(opts);
    advIntakeSetSyncId(intakeRows[intakeRows.length - 1], syncId);
    advIntakeSetSyncId(advancedRows[advancedRows.length - 1], syncId);

    advancedIntakeRefreshRowsForHandler(opts, 'vilda_advanced_growth:advanced-intake-handler:intake-add:refresh');
    advancedIntakeRunCalculationsForHandler(opts, 'vilda_advanced_growth:advanced-intake-handler:intake-add');
    return true;
  }

  function advancedIntakeCallLiveWiringCallback(callback, args, context) {
    return advancedIntakeCallRowSyncCallback(callback, args, context);
  }

  function advancedIntakeAddLiveWiringListener(target, type, handler, result, context) {
    if (!target || typeof target.addEventListener !== 'function' || typeof handler !== 'function') return false;
    try {
      target.addEventListener(type, handler);
      if (result && result.listeners) {
        result.listeners.push({
          target: context || '',
          type
        });
      }
      return true;
    } catch (error) {
      logSwallowed('vilda_advanced_growth:advanced-intake-live-wiring:add-listener', error, { target: context || '', type });
      if (result && result.errors) {
        result.errors.push({ target: context || '', type, message: String(error && error.message ? error.message : error) });
      }
      return false;
    }
  }

  function advancedIntakeTargetMatches(target, selector) {
    try {
      return !!(target && typeof target.matches === 'function' && target.matches(selector));
    } catch (_) {
      return false;
    }
  }

  function advancedIntakeClosest(target, selector) {
    try {
      return target && typeof target.closest === 'function' ? target.closest(selector) : null;
    } catch (_) {
      return null;
    }
  }

  function setupAdvancedIntakeLiveWiring(options) {
    const opts = options || {};
    const doc = getDocument(opts);
    const root = opts.global || global || (typeof globalThis !== 'undefined' ? globalThis : null);
    const result = {
      step: '8O-8f',
      wired: false,
      skipped: false,
      reason: '',
      listeners: [],
      globalsExposed: false,
      initialPairScheduled: false,
      errors: []
    };

    if (!doc) {
      result.skipped = true;
      result.reason = 'missing-document';
      return result;
    }

    const liveCb = () => {
      advancedIntakeCallLiveWiringCallback(
        opts.updateIntakeFirstRowFromUserBasics,
        [],
        'vilda_advanced_growth:advanced-intake-live-wiring:update-current-row'
      );
      advancedIntakeCallLiveWiringCallback(
        opts.refreshRowUi,
        [],
        'vilda_advanced_growth:advanced-intake-live-wiring:refresh-ui'
      );
      advancedIntakeCallLiveWiringCallback(
        opts.debouncedIntakeCalc,
        [],
        'vilda_advanced_growth:advanced-intake-live-wiring:debounced-intake-calc'
      );
    };

    const observedBasics = Array.isArray(opts.basicInputIds)
      ? opts.basicInputIds
      : ['age', 'ageMonths', 'weight', 'height', 'sex'];

    observedBasics.forEach((id) => {
      const el = getElementById(id, opts);
      if (!el) return;
      advancedIntakeAddLiveWiringListener(el, 'input', liveCb, result, `basic:${id}`);
      advancedIntakeAddLiveWiringListener(el, 'change', liveCb, result, `basic:${id}`);
    });

    const advancedSelector = opts.advancedInputSelector || '.adv-age-years,.adv-age-months,.adv-height,.adv-weight';
    const advancedRowSelector = opts.advancedRowSelector || '.measure-row';
    const advancedWrap = getElementById(opts.advancedContainerId || 'advMeasurements', opts);
    if (advancedWrap) {
      const handleAdvancedInput = (event) => {
        const target = event && event.target;
        if (!advancedIntakeTargetMatches(target, advancedSelector)) return;
        const row = advancedIntakeClosest(target, advancedRowSelector);
        if (row) {
          advancedIntakeCallLiveWiringCallback(
            opts.syncAdvRowToIntake,
            [row],
            'vilda_advanced_growth:advanced-intake-live-wiring:advanced-input'
          );
        }
      };
      advancedIntakeAddLiveWiringListener(advancedWrap, 'input', handleAdvancedInput, result, 'advanced:history');
      advancedIntakeAddLiveWiringListener(advancedWrap, 'change', handleAdvancedInput, result, 'advanced:history');
    }

    const intakeSelector = opts.intakeInputSelector || '.intake-ageY,.intake-ageM,.intake-ht,.intake-wt';
    const intakeRowSelector = opts.intakeRowSelector || '.measure-row-intake';
    const intakeWrap = getElementById(opts.intakeContainerId || 'intakeMeasurements', opts);
    if (intakeWrap) {
      const handleIntakeInput = (event) => {
        const target = event && event.target;
        if (!advancedIntakeTargetMatches(target, intakeSelector)) return;
        const row = advancedIntakeClosest(target, intakeRowSelector);
        if (row && !(row.dataset && row.dataset.locked === 'true')) {
          advancedIntakeCallLiveWiringCallback(
            opts.syncIntakeRowToAdv,
            [row],
            'vilda_advanced_growth:advanced-intake-live-wiring:intake-input'
          );
        }
      };
      advancedIntakeAddLiveWiringListener(intakeWrap, 'input', handleIntakeInput, result, 'intake:history');
      advancedIntakeAddLiveWiringListener(intakeWrap, 'change', handleIntakeInput, result, 'intake:history');
    }

    const runInitialPairing = () => {
      advancedIntakeCallLiveWiringCallback(
        opts.pairRows,
        [],
        'vilda_advanced_growth:advanced-intake-live-wiring:initial-pair'
      );
      advancedIntakeCallLiveWiringCallback(
        opts.debouncedIntakeCalc,
        [],
        'vilda_advanced_growth:advanced-intake-live-wiring:initial-intake-calc'
      );
    };

    const scheduler = opts.setTimeout || (root && typeof root.setTimeout === 'function' ? root.setTimeout.bind(root) : null);
    try {
      if (typeof scheduler === 'function') {
        scheduler(runInitialPairing, 0);
        result.initialPairScheduled = true;
      } else {
        runInitialPairing();
        result.initialPairScheduled = false;
      }
    } catch (error) {
      logSwallowed('vilda_advanced_growth:advanced-intake-live-wiring:initial-schedule', error);
      result.errors.push({ target: 'initial-pair', type: 'setTimeout', message: String(error && error.message ? error.message : error) });
      runInitialPairing();
    }

    try {
      if (root && opts.exposeGlobalHandlers !== false) {
        if (typeof opts.handleAdvancedMeasurementAdd === 'function') {
          root.vildaHandleAdvancedMeasurementAdd = opts.handleAdvancedMeasurementAdd;
        }
        if (typeof opts.handleIntakeHistoryAdd === 'function') {
          root.vildaHandleIntakeHistoryAdd = opts.handleIntakeHistoryAdd;
        }
        if (typeof opts.handleAdvancedMeasurementRowRemove === 'function') {
          root.vildaHandleAdvancedMeasurementRowRemove = opts.handleAdvancedMeasurementRowRemove;
        }
        if (typeof opts.handleIntakeHistoryRowRemove === 'function') {
          root.vildaHandleIntakeHistoryRowRemove = opts.handleIntakeHistoryRowRemove;
        }
        if (typeof opts.pairRows === 'function') {
          root.vildaEnsureAdvancedIntakePairing = opts.pairRows;
        }
        result.globalsExposed = true;
      }
    } catch (error) {
      logSwallowed('vilda_advanced_growth:advanced-intake-live-wiring:expose-globals', error);
      result.errors.push({ target: 'global-handlers', type: 'expose', message: String(error && error.message ? error.message : error) });
    }

    result.wired = result.listeners.length > 0 || result.initialPairScheduled || result.globalsExposed;
    return result;
  }

  function advHistoryEscapeHtml(str) {
    return escapeHtml(str);
  }

  function advHistoryFormatNumber(value, digits) {
    return formatNumber(value, digits);
  }

  function advHistoryFormatAgeMonths(ageMonths) {
    return formatAgeMonths(ageMonths);
  }

  function advHistorySourceLabel(source) {
    return sourceLabel(source);
  }

  function advHistoryDecodeCentile(centileText) {
    return decodeCentile(centileText);
  }

  function advHistoryPercentileText(percentile) {
    return percentileText(percentile);
  }

  function advGrowthFormatSignedNumber(value, digits) {
    return formatSignedNumber(value, digits);
  }

  function advGrowthSanitizePdfText(value) {
    return sanitizePdfText(value);
  }

  function advGrowthSanitizePdfMultilineText(value) {
    return sanitizePdfMultilineText(value);
  }

  function advGrowthHexToRgb(hex) {
    return hexToRgb(hex);
  }

  function isAdvancedGrowthMainPage() {
    try {
      const path = String((global.location && global.location.pathname) || '').toLowerCase();
      const file = path.split('/').pop();
      if (!file || file === '' || file === 'index.html') return true;
      return file !== 'docpro.html';
    } catch (_) {
      try {
        return !/docpro\.html?(?:$|[?#])/i.test(String((global.location && global.location.href) || ''));
      } catch (__){
        return true;
      }
    }
  }


  function resolveGhImportOptions(options) {
    const opts = (options && typeof options === 'object') ? options : {};
    const pick = function (name) {
      return (typeof opts[name] === 'function') ? opts[name] : getFunction(name);
    };
    return {
      isGhAdvancedImportSuppressed: pick('isGhAdvancedImportSuppressed'),
      getTherapyPointsFromDB: pick('getTherapyPointsFromDB'),
      readGhTherapyPointsFromModuleStorage: pick('readGhTherapyPointsFromModuleStorage'),
      writeGhTherapyPointsToModuleStorage: pick('writeGhTherapyPointsToModuleStorage'),
      addAdvMeasurementRow: pick('addAdvMeasurementRow'),
      updateRemoveButtons: pick('updateRemoveButtons'),
      calculateGrowthAdvanced: pick('calculateGrowthAdvanced'),
      getUserBasics: (typeof opts.getUserBasics === 'function')
        ? opts.getUserBasics
        : ((typeof opts._getUserBasics === 'function') ? opts._getUserBasics : (getFunction('_getUserBasics') || getFunction('getUserBasics')))
    };
  }

  function callGhImportDependency(fn, args, context, fallback) {
    if (typeof fn !== 'function') return fallback;
    try {
      return fn.apply(global, Array.isArray(args) ? args : []);
    } catch (error) {
      logSwallowed(context || 'vilda_advanced_growth:gh-import-dependency', error);
      return fallback;
    }
  }

  function isGhAdvancedImportSuppressedByOptions(options) {
    const deps = resolveGhImportOptions(options);
    if (typeof deps.isGhAdvancedImportSuppressed === 'function') {
      return !!callGhImportDependency(
        deps.isGhAdvancedImportSuppressed,
        [],
        'vilda_advanced_growth:gh-import-suppressed',
        false
      );
    }
    try {
      return Number(global.__vildaSuppressGhAdvancedImportUntil || 0) > Date.now();
    } catch (error) {
      logSwallowed('vilda_advanced_growth:gh-import-suppressed-fallback', error);
      return false;
    }
  }

  function getGhAdvancedCurrentBasics(options){
    const deps = resolveGhImportOptions(options);
    try {
      if (typeof deps.getUserBasics === 'function') {
        return deps.getUserBasics();
      }
    } catch (error) {
      logSwallowed('vilda_advanced_growth:gh-current-basics', error);
    }
    const doc = global.document;
    const ageYearsRaw = parseFloat(doc && doc.getElementById('age')?.value);
    const ageMonthsRaw = parseFloat(doc && doc.getElementById('ageMonths')?.value);
    const heightRaw = parseFloat(doc && doc.getElementById('height')?.value);
    const weightRaw = parseFloat(doc && doc.getElementById('weight')?.value);
    const hasAge = !isNaN(ageYearsRaw) || !isNaN(ageMonthsRaw);
    const totalAgeMonths = hasAge
      ? Math.round(((isNaN(ageYearsRaw) ? 0 : ageYearsRaw) * 12) + (isNaN(ageMonthsRaw) ? 0 : ageMonthsRaw))
      : null;
    return {
      ageMonths: (typeof totalAgeMonths === 'number' && isFinite(totalAgeMonths)) ? totalAgeMonths : null,
      height: (!isNaN(heightRaw) && isFinite(heightRaw)) ? heightRaw : null,
      weight: (!isNaN(weightRaw) && isFinite(weightRaw)) ? weightRaw : null
    };
  }

  function ghAdvancedApproxEq(a, b, tol=0.11) {
    if (typeof a !== 'number' || !isFinite(a) || typeof b !== 'number' || !isFinite(b)) return false;
    return Math.abs(a - b) <= tol;
  }

  function ghTherapyPointMatchesCurrentBasics(pt, basics, options) {
    const current = (basics && typeof basics === 'object') ? basics : getGhAdvancedCurrentBasics(options);
    if (!pt || current.ageMonths == null || current.height == null || current.weight == null) return false;
    const ageM = Math.round((((pt.ageYears || 0) * 12) + (pt.ageMonths || 0)));
    if (ageM !== current.ageMonths) return false;
    const h = (pt.height != null && isFinite(pt.height)) ? Number(pt.height) : null;
    const w = (pt.weight != null && isFinite(pt.weight)) ? Number(pt.weight) : null;
    if (h == null || w == null) return false;
    return ghAdvancedApproxEq(h, current.height, 0.11)
      && ghAdvancedApproxEq(w, current.weight, 0.11);
  }

  function ghAdvancedRowMatchesCurrentBasics(row, basics, options) {
    if (!row) return false;
    const current = (basics && typeof basics === 'object') ? basics : getGhAdvancedCurrentBasics(options);
    if (current.ageMonths == null || current.height == null || current.weight == null) return false;
    const ageYearsRaw = parseFloat(row.querySelector('.adv-age-years')?.value);
    const ageMonthsRaw = parseFloat(row.querySelector('.adv-age-months')?.value);
    if (isNaN(ageYearsRaw) && isNaN(ageMonthsRaw)) return false;
    const ageM = Math.round(((isNaN(ageYearsRaw) ? 0 : ageYearsRaw) * 12) + (isNaN(ageMonthsRaw) ? 0 : ageMonthsRaw));
    if (ageM !== current.ageMonths) return false;
    const heightRaw = parseFloat(row.querySelector('.adv-height')?.value);
    const weightRaw = parseFloat(row.querySelector('.adv-weight')?.value);
    if (!isFinite(heightRaw) || !isFinite(weightRaw)) return false;
    return ghAdvancedApproxEq(heightRaw, current.height, 0.11)
      && ghAdvancedApproxEq(weightRaw, current.weight, 0.11);
  }

  let __ghAdvImportInFlight = false;
  let __ghAdvImportQueued = false;
  let __ghAdvImportQueuedOptions = null;

  async function importTherapyPointsToAdvancedGrowth(options) {
    // Anty-reentrancy: jeżeli import już trwa, tylko oznacz, że trzeba go powtórzyć.
    if (__ghAdvImportInFlight) {
      __ghAdvImportQueued = true;
      __ghAdvImportQueuedOptions = options || __ghAdvImportQueuedOptions;
      return;
    }
    if (isGhAdvancedImportSuppressedByOptions(options)) {
      return;
    }
    __ghAdvImportInFlight = true;

    try {
      // Import punktów terapii wykonujemy wyłącznie na stronie głównej.
      // Strona DocPro ma własny moduł monitorowania terapii, więc tutaj
      // pomijamy synchronizację. Rozpoznanie strony opieramy o pathname,
      // a nie o obecność przycisków modułów, bo część z nich występuje
      // także na stronie głównej.
      if (!isAdvancedGrowthMainPage()) {
        return;
      }

      const doc = global.document;
      const deps = resolveGhImportOptions(options);
      const advContainer = doc && doc.getElementById('advMeasurements');
      if (!advContainer || typeof deps.addAdvMeasurementRow !== 'function') {
        return;
      }

      // Pobierz punkty z IndexedDB (fallback na localStorage).
      let pts = [];
      try {
        pts = (typeof deps.getTherapyPointsFromDB === 'function') ? await deps.getTherapyPointsFromDB() : [];
      } catch (error) {
        logSwallowed('vilda_advanced_growth:gh-import-db', error);
        pts = [];
      }

      if (!Array.isArray(pts) || pts.length === 0) {
        pts = callGhImportDependency(
          deps.readGhTherapyPointsFromModuleStorage,
          [],
          'vilda_advanced_growth:gh-import-storage-read',
          []
        );
      }

      if (isGhAdvancedImportSuppressedByOptions(options)) {
        return;
      }

      const cloneGhPts = (list) => {
        try { return JSON.parse(JSON.stringify(Array.isArray(list) ? list : [])); } catch (error) {
          logSwallowed('vilda_advanced_growth:gh-import-clone', error);
          return Array.isArray(list) ? list.slice() : [];
        }
      };

      const refreshGhTherapyMirror = (list) => {
        const normalized = cloneGhPts(list);
        try {
          global.ghTherapyPoints = normalized;
        } catch (error) {
          logSwallowed('vilda_advanced_growth:gh-import-mirror', error);
        }
        callGhImportDependency(
          deps.writeGhTherapyPointsToModuleStorage,
          [normalized],
          'vilda_advanced_growth:gh-import-storage-write',
          false
        );
      };

      const finalizeGhImport = () => {
        if (typeof deps.updateRemoveButtons === 'function') {
          callGhImportDependency(
            deps.updateRemoveButtons,
            [],
            'vilda_advanced_growth:gh-import-update-remove-buttons',
            undefined
          );
        }
        if (typeof deps.calculateGrowthAdvanced === 'function') {
          callGhImportDependency(
            deps.calculateGrowthAdvanced,
            [],
            'vilda_advanced_growth:gh-import-calculate',
            undefined
          );
        }
        try {
          const poke = (doc && doc.getElementById('advName')) || (doc && doc.getElementById('name'));
          if (poke) {
            const EventCtor = global.Event || Event;
            poke.dispatchEvent(new EventCtor('input', { bubbles: true }));
          }
        } catch (error) {
          logSwallowed('vilda_advanced_growth:gh-import-poke-autosave', error);
        }
      };

      const clearImportedGhRows = () => {
        const ghRows = Array.from(advContainer.querySelectorAll('.measure-row[data-gh-sync="true"], .measure-row[data-gh-id]'));
        if (!ghRows.length) return;
        ghRows.forEach(row => {
          try { row.remove(); } catch (error) {
            logSwallowed('vilda_advanced_growth:gh-import-clear-row', error);
          }
        });
        finalizeGhImport();
      };

      if (!Array.isArray(pts) || pts.length === 0) {
        refreshGhTherapyMirror([]);
        clearImportedGhRows();
        return;
      }

      refreshGhTherapyMirror(pts);

      // Uporządkuj po wieku (miesiącach).
      pts.sort((a,b) => {
        const ta = ((a.ageYears || 0) * 12) + (a.ageMonths || 0);
        const tb = ((b.ageYears || 0) * 12) + (b.ageMonths || 0);
        return ta - tb;
      });

      const toNum = (v) => {
        const n = parseFloat(v);
        return (isFinite(n) ? n : null);
      };

      // Stabilny klucz punktu (preferujemy pt.id; dla starych wpisów tworzymy klucz deterministyczny).
      const pointKey = (pt) => {
        if (pt && pt.id != null && String(pt.id) !== '') return String(pt.id);
        const ageM = (((pt?.ageYears || 0) * 12) + (pt?.ageMonths || 0));
        const h = (pt?.height != null && isFinite(pt.height)) ? Number(pt.height) : '';
        const w = (pt?.weight != null && isFinite(pt.weight)) ? Number(pt.weight) : '';
        const t = (pt?.type != null) ? String(pt.type) : '';
        // deterministyczny „legacy key” – nieidealny, ale lepszy niż brak deduplikacji.
        return `legacy:${ageM}:${h}:${w}:${t}`;
      };

      // Zbuduj mapę istniejących wierszy zsynchronizowanych.
      const rows = Array.from(advContainer.querySelectorAll('.measure-row'));
      const byGhId = new Map();              // ghId -> row
      const dupRows = [];                    // duplikaty (ten sam ghId)
      const unmarkedCandidates = [];         // tylko legacy wiersze GH: data-gh-sync=true, ale brak ghId

      rows.forEach(r => {
        const ghIdRaw = r.getAttribute('data-gh-id');
        const ghId = (ghIdRaw != null && String(ghIdRaw) !== '') ? String(ghIdRaw) : null;
        const ghSyncMarked = r.getAttribute('data-gh-sync') === 'true';
        if (ghId) {
          if (byGhId.has(ghId)) {
            dupRows.push(r);
          } else {
            byGhId.set(ghId, r);
          }
        } else if (ghSyncMarked) {
          // Tylko historyczne/legacy wiersze pochodzące z monitora GH mogą zostać
          // „upgrade’owane” do pełnego ghId. Ręcznie wpisane punkty użytkownika
          // (bez metadanych GH) nie mogą być tutaj przejmowane ani nadpisywane.
          unmarkedCandidates.push(r);
        }
      });

      // Usuń już istniejące duplikaty zsynchronizowanych wierszy (jeśli zostały wytworzone historycznie).
      dupRows.forEach(r => { try { r.remove(); } catch (error) {
        logSwallowed('vilda_advanced_growth:gh-import-remove-duplicate', error);
      } });

      const currentBasics = getGhAdvancedCurrentBasics(options);

      // Usuń legacy wiersze GH, które odpowiadają bieżącym danym użytkownika.
      // Taki punkt nie jest historią – aktualny pomiar jest już reprezentowany
      // przez pola „Dane użytkownika” i nie powinien być dublowany w historii.
      for (let i = unmarkedCandidates.length - 1; i >= 0; i--) {
        const row = unmarkedCandidates[i];
        if (!row) continue;
        if (ghAdvancedRowMatchesCurrentBasics(row, currentBasics, options)) {
          try { row.remove(); } catch (error) {
            logSwallowed('vilda_advanced_growth:gh-import-remove-current-row', error);
          }
          unmarkedCandidates.splice(i, 1);
        }
      }

      const used = new Set();

      const setVal = (row, sel, value) => {
        const el = row.querySelector(sel);
        if (!el) return;
        if (value === '' || value === null || Number.isNaN(value)) {
          el.value = '';
        } else {
          el.value = String(value);
        }
      };

      const rowAgeMonths = (row) => {
        const y = toNum(row.querySelector('.adv-age-years')?.value);
        const m = toNum(row.querySelector('.adv-age-months')?.value);
        if (y === null && m === null) return null;
        const ay = (y === null ? 0 : y) + (m === null ? 0 : m / 12);
        return Math.round(ay * 12);
      };

      const approxEq = (a, b, tol=0.05) => {
        if (a === null || b === null) return false;
        return Math.abs(a - b) <= tol;
      };

      // Próba dopasowania wiersza bez metadanych (legacy) do punktu terapii:
      // porównujemy wiek w miesiącach oraz – jeśli dostępne – wzrost i wagę.
      const findLegacyRowMatch = (pt) => {
        const ptAgeM = (((pt?.ageYears || 0) * 12) + (pt?.ageMonths || 0));
        const ptH = (pt?.height != null && isFinite(pt.height)) ? Number(pt.height) : null;
        const ptW = (pt?.weight != null && isFinite(pt.weight)) ? Number(pt.weight) : null;

        for (let i = 0; i < unmarkedCandidates.length; i++) {
          const r = unmarkedCandidates[i];
          if (!r) continue;
          const ageM = rowAgeMonths(r);
          if (ageM === null || ageM !== ptAgeM) continue;

          // Jeśli zarówno źródło jak i wiersz mają wysokość/wagę, wymagaj zgodności.
          const rh = toNum(r.querySelector('.adv-height')?.value);
          const rw = toNum(r.querySelector('.adv-weight')?.value);

          if (ptH !== null && rh !== null && !approxEq(ptH, rh)) continue;
          if (ptW !== null && rw !== null && !approxEq(ptW, rw)) continue;

          // Dopasowanie OK – usuń z listy kandydatów, aby nie wykorzystać drugi raz.
          unmarkedCandidates.splice(i, 1);
          return r;
        }
        return null;
      };

      // Upsert dla każdego punktu.
      for (const pt of pts) {
        const ghId = pointKey(pt);

        // Punkt identyczny z bieżącymi danymi użytkownika nie jest punktem
        // historycznym. Nie importujemy go do historii pomiarów na index.html.
        if (ghTherapyPointMatchesCurrentBasics(pt, currentBasics, options)) {
          continue;
        }

        used.add(ghId);

        let row = byGhId.get(ghId);
        if (!row) {
          // Spróbuj dopasować legacy wiersz (np. odtworzony ze starego autosave bez metadanych).
          row = findLegacyRowMatch(pt);
          if (row) {
            byGhId.set(ghId, row);
          }
        }

        if (!row) {
          // Utwórz nowy wiersz.
          callGhImportDependency(
            deps.addAdvMeasurementRow,
            [],
            'vilda_advanced_growth:gh-import-add-row',
            undefined
          );
          const all = advContainer.querySelectorAll('.measure-row');
          row = all[all.length - 1];
          if (!row) continue;
        }

        // Oznacz wiersz jako zsynchronizowany i przypisz klucz.
        row.setAttribute('data-gh-sync', 'true');
        row.setAttribute('data-gh-id', ghId);

        // Ustaw wartości liczbowe wg źródła (Monitorowanie leczenia).
        const y = (pt.ageYears != null && !isNaN(pt.ageYears)) ? pt.ageYears : '';
        const m = (pt.ageMonths != null && !isNaN(pt.ageMonths)) ? pt.ageMonths : '';
        setVal(row, '.adv-age-years', y);
        setVal(row, '.adv-age-months', m);
        setVal(row, '.adv-height', (pt.height != null && !isNaN(pt.height)) ? pt.height : '');
        setVal(row, '.adv-weight', (pt.weight != null && !isNaN(pt.weight)) ? pt.weight : '');

        // Ustaw wiek kostny, jeśli dostępny (w monitorze trzymamy pt.boneAge).
        if ('boneAge' in (pt || {})) {
          setVal(row, '.adv-bone-age', (pt.boneAge != null && !isNaN(pt.boneAge)) ? pt.boneAge : '');
        }
      }

      // Usuń legacy duplikaty (np. odtworzone ze starego autosave bez metadanych):
      // jeżeli istnieje już wiersz zsynchronizowany z GH o tym samym wieku/wzroście/masie,
      // usuń pozostałe „kopie” nieoznaczone.
      try {
        const ptsByAge = new Map(); // ageM -> [{id, h, w}]
        pts.forEach(pt => {
          const id = pointKey(pt);
          const ageM = (((pt?.ageYears || 0) * 12) + (pt?.ageMonths || 0));
          const h = (pt?.height != null && isFinite(pt.height)) ? Number(pt.height) : null;
          const w = (pt?.weight != null && isFinite(pt.weight)) ? Number(pt.weight) : null;
          if (!ptsByAge.has(ageM)) ptsByAge.set(ageM, []);
          ptsByAge.get(ageM).push({ id, h, w });
        });

        unmarkedCandidates.forEach(r => {
          if (!r) return;
          const ageM = rowAgeMonths(r);
          if (ageM === null) return;
          const list = ptsByAge.get(ageM);
          if (!list || !list.length) return;

          const rh = toNum(r.querySelector('.adv-height')?.value);
          const rw = toNum(r.querySelector('.adv-weight')?.value);

          for (const meta of list) {
            if (!meta || !meta.id) continue;
            if (!used.has(meta.id)) continue; // nie usuwaj, jeśli punkt nie został zaimportowany
            if (meta.h !== null && rh !== null && !approxEq(meta.h, rh)) continue;
            if (meta.w !== null && rw !== null && !approxEq(meta.w, rw)) continue;

            // To wygląda na duplikat punktu terapii – usuń wiersz.
            try { r.remove(); } catch (error) {
              logSwallowed('vilda_advanced_growth:gh-import-remove-legacy-duplicate', error);
            }
            break;
          }
        });
      } catch (error) {
        logSwallowed('vilda_advanced_growth:gh-import-legacy-dedupe', error);
      }

      // Usuń wiersze GH, których już nie ma w źródle (stale).
      byGhId.forEach((row, ghId) => {
        if (!used.has(ghId) && row && row.getAttribute('data-gh-sync') === 'true') {
          try { row.remove(); } catch (error) {
            logSwallowed('vilda_advanced_growth:gh-import-remove-stale-row', error);
          }
        }
      });

      // Dodatkowa deduplikacja „ostatniej szansy” – jeżeli w DOM pozostały 2 wiersze z tym samym ghId,
      // usuń nadmiarowe.
      try {
        const seen = new Set();
        Array.from(advContainer.querySelectorAll('.measure-row[data-gh-id]')).forEach(r => {
          const id = r.getAttribute('data-gh-id');
          if (!id) return;
          if (seen.has(id)) {
            try { r.remove(); } catch (error) {
              logSwallowed('vilda_advanced_growth:gh-import-final-dedupe', error);
            }
          } else {
            seen.add(id);
          }
        });
      } catch (error) {
        logSwallowed('vilda_advanced_growth:gh-import-final-dedupe-loop', error);
      }

      // Po imporcie odśwież przyciski usuwania, przelicz wyniki i zapisz
      // oczyszczony snapshot do autosave.
      finalizeGhImport();
    } catch (error) {
      logSwallowed('vilda_advanced_growth:gh-import', error);
    } finally {
      __ghAdvImportInFlight = false;
      if (__ghAdvImportQueued) {
        const queuedOptions = __ghAdvImportQueuedOptions || options;
        __ghAdvImportQueued = false;
        __ghAdvImportQueuedOptions = null;
        // Uruchom ponownie import (np. gdy w trakcie przyszło kolejne powiadomienie BC).
        try { importTherapyPointsToAdvancedGrowth(queuedOptions); } catch (error) {
          logSwallowed('vilda_advanced_growth:gh-import-rerun', error);
        }
      }
    }
  }

  function isAdvancedGrowthProModeActive() {
    try {
      const toggle = global.document && global.document.getElementById('resultsModeToggle');
      if (toggle) return !!toggle.checked;
    } catch (error) {
      logSwallowed('vilda_advanced_growth:pro-mode-toggle', error);
    }
    try {
      if (typeof global.professionalMode !== 'undefined') return !!global.professionalMode;
    } catch (error) {
      logSwallowed('vilda_advanced_growth:pro-mode-global', error);
    }
    try {
      if (typeof global.readResultsModeStorage === 'function') return global.readResultsModeStorage() === 'professional';
    } catch (error) {
      logSwallowed('vilda_advanced_growth:pro-mode-storage', error);
    }
    return false;
  }


  /* 8O-4 — kontrola dostępu PRO i źródeł danych wzrastania. */
  function getDocument(options) {
    return (options && options.document) || global.document || null;
  }

  function getElementById(id, options) {
    const elements = options && options.elements;
    if (elements && elements[id]) return elements[id];
    const doc = getDocument(options);
    return doc && typeof doc.getElementById === 'function' ? doc.getElementById(id) : null;
  }

  function readNumberElement(id, options) {
    const el = getElementById(id, options);
    const value = parseFloat(el && el.value);
    return Number.isFinite(value) ? value : 0;
  }

  function getOlafDataMinAge(options) {
    const fromOptions = Number(options && options.olafDataMinAge);
    if (Number.isFinite(fromOptions) && fromOptions > 0) return fromOptions;
    const fromGlobal = Number(global.OLAF_DATA_MIN_AGE);
    if (Number.isFinite(fromGlobal) && fromGlobal > 0) return fromGlobal;
    return 3;
  }

  function getBmiSourceValue(options) {
    try {
      if (options && typeof options.getBmiSource === 'function') {
        const value = options.getBmiSource();
        if (value) return String(value).toUpperCase();
      }
    } catch (error) {
      logSwallowed('vilda_advanced_growth:get-bmi-source-option', error);
    }
    try {
      if (options && options.bmiSource) return String(options.bmiSource).toUpperCase();
    } catch (error) {
      logSwallowed('vilda_advanced_growth:get-bmi-source-value', error);
    }
    try {
      if (global.bmiSource) return String(global.bmiSource).toUpperCase();
    } catch (error) {
      logSwallowed('vilda_advanced_growth:get-bmi-source-global', error);
    }
    return 'OLAF';
  }

  function setBmiSourceValue(source, options) {
    const selectedSource = normalizeGrowthDataSource(source) || 'OLAF';
    try {
      if (options && typeof options.setBmiSource === 'function') {
        options.setBmiSource(selectedSource);
        return selectedSource;
      }
    } catch (error) {
      logSwallowed('vilda_advanced_growth:set-bmi-source-option', error, { source: selectedSource });
    }
    try {
      global.bmiSource = selectedSource;
    } catch (error) {
      logSwallowed('vilda_advanced_growth:set-bmi-source-global', error, { source: selectedSource });
    }
    return selectedSource;
  }

  function getGrowthDataSourceAgeYears(options) {
    const years = readNumberElement('age', options);
    const months = readNumberElement('ageMonths', options);
    return years + (months / 12);
  }

  function isGrowthResultsProfessionalMode(options) {
    try {
      if (options && typeof options.proMode === 'boolean') return !!options.proMode;
      if (options && typeof options.getProfessionalMode === 'function') return !!options.getProfessionalMode();
    } catch (error) {
      logSwallowed('vilda_advanced_growth:professional-mode-option', error);
    }
    try {
      const toggle = getElementById('resultsModeToggle', options);
      if (toggle) return !!toggle.checked;
    } catch (error) {
      logSwallowed('vilda_advanced_growth:professional-mode-toggle', error);
    }
    try {
      if (typeof global.professionalMode !== 'undefined') return !!global.professionalMode;
    } catch (error) {
      logSwallowed('vilda_advanced_growth:professional-mode-global', error);
    }
    try {
      const readMode = (options && typeof options.readResultsModeStorage === 'function')
        ? options.readResultsModeStorage
        : global.readResultsModeStorage;
      if (typeof readMode === 'function') return readMode() === 'professional';
    } catch (error) {
      logSwallowed('vilda_advanced_growth:professional-mode-storage', error);
    }
    return isAdvancedGrowthProModeActive();
  }

  function isGrowthDataSourceAllowed(source, ageYears, proMode, options) {
    const src = String(source || '').toUpperCase();
    const age = Number.isFinite(ageYears) ? ageYears : 0;
    const pro = !!proMode;
    const olafMinAge = getOlafDataMinAge(options);
    if (src === 'PALCZEWSKA') return pro && age < 18;
    if (src === 'OLAF') return age >= olafMinAge && age < 18;
    if (src === 'WHO') return age < 18;
    return false;
  }

  function getDefaultGrowthDataSource(ageYears, proMode, options) {
    if (!Number.isFinite(ageYears)) return 'OLAF';
    const age = ageYears;
    const pro = !!proMode;
    const olafMinAge = getOlafDataMinAge(options);
    if (!(age < 18)) return 'WHO';
    if (age < olafMinAge) return pro ? 'PALCZEWSKA' : 'WHO';
    return 'OLAF';
  }

  function normalizeGrowthDataSource(source) {
    const selectedSource = String(source || '').toUpperCase();
    return ['PALCZEWSKA', 'OLAF', 'WHO'].includes(selectedSource) ? selectedSource : '';
  }

  function setCheckedGrowthDataSource(source, options) {
    const selectedSource = normalizeGrowthDataSource(source) || 'OLAF';
    const palRadio = getElementById('sourcePalczewska', options);
    const olafRadio = getElementById('sourceOlaf', options);
    const whoRadio = getElementById('sourceWho', options);
    if (palRadio) palRadio.checked = (selectedSource === 'PALCZEWSKA');
    if (olafRadio) olafRadio.checked = (selectedSource === 'OLAF');
    if (whoRadio) whoRadio.checked = (selectedSource === 'WHO');
    return setBmiSourceValue(selectedSource, options);
  }

  function rememberManualGrowthDataSource(source, options) {
    const selectedSource = normalizeGrowthDataSource(source);
    const toggleContainer = getElementById('dataToggleContainer', options);
    if (!selectedSource || !toggleContainer || !toggleContainer.dataset) return selectedSource;
    toggleContainer.dataset.manual = '1';
    toggleContainer.dataset.preferredSource = selectedSource;
    return selectedSource;
  }

  function refreshGrowthChartActionControls(options) {
    const hooks = [
      'updateCentileButtons',
      'updateAdvancedCentileChartButton',
      'updatePublicationToggleVisibility'
    ];
    hooks.forEach((name) => {
      try {
        const localHooks = options && options.hooks;
        const fn = localHooks && typeof localHooks[name] === 'function' ? localHooks[name] : global[name];
        if (typeof fn === 'function') fn.call(global);
      } catch (error) {
        logSwallowed('vilda_advanced_growth:refresh-chart-action:' + name, error);
      }
    });
  }

  function hasAgeSourceInput(options) {
    const ageEl = getElementById('age', options);
    const monthsEl = getElementById('ageMonths', options);
    return !!(
      (ageEl && String(ageEl.value || '').trim() !== '') ||
      (monthsEl && String(monthsEl.value || '').trim() !== '')
    );
  }

  function syncGrowthDataSourceInputs(options) {
    const opts = options && typeof options === 'object' ? options : {};
    try {
      const toggleContainer = getElementById('dataToggleContainer', opts);
      const palRadio = getElementById('sourcePalczewska', opts);
      const olafRadio = getElementById('sourceOlaf', opts);
      const whoRadio = getElementById('sourceWho', opts);
      if (!palRadio || !olafRadio || !whoRadio) {
        return getBmiSourceValue(opts) || 'OLAF';
      }

      const ageYears = Number.isFinite(opts.ageYears) ? opts.ageYears : getGrowthDataSourceAgeYears(opts);
      const proMode = (typeof opts.proMode === 'boolean') ? opts.proMode : isGrowthResultsProfessionalMode(opts);
      const hasAgeInput = (typeof opts.hasAgeSourceInput === 'boolean') ? !!opts.hasAgeSourceInput : hasAgeSourceInput(opts);
      const manualSelection = !!(toggleContainer && toggleContainer.dataset && toggleContainer.dataset.manual === '1');
      const preferredSource = normalizeGrowthDataSource(toggleContainer && toggleContainer.dataset ? toggleContainer.dataset.preferredSource : '');
      const doc = getDocument(opts);
      const currentSourceEl = doc && typeof doc.querySelector === 'function'
        ? doc.querySelector('input[name="dataSource"]:checked')
        : null;
      const currentSource = normalizeGrowthDataSource(currentSourceEl && currentSourceEl.value ? currentSourceEl.value : '');

      if (hasAgeInput) {
        palRadio.disabled = !isGrowthDataSourceAllowed('PALCZEWSKA', ageYears, proMode, opts);
        olafRadio.disabled = !isGrowthDataSourceAllowed('OLAF', ageYears, proMode, opts);
        whoRadio.disabled = !isGrowthDataSourceAllowed('WHO', ageYears, proMode, opts);
      } else {
        // Pusty formularz nie oznacza „dziecka 0 lat”. Przy starcie UI ma pozostać
        // na domyślnym źródle OLAF, dopóki użytkownik nie poda wieku albo nie
        // przywróci rzeczywistego zapisanego stanu.
        palRadio.disabled = !proMode;
        olafRadio.disabled = false;
        whoRadio.disabled = false;
      }

      let nextSource = currentSource;
      if (!hasAgeInput) {
        if (manualSelection && (preferredSource || currentSource)) {
          nextSource = preferredSource || currentSource;
          if (nextSource === 'PALCZEWSKA' && !proMode) nextSource = 'OLAF';
        } else {
          nextSource = 'OLAF';
        }
      } else if (manualSelection) {
        const manualSource = preferredSource || currentSource;
        if (manualSource && isGrowthDataSourceAllowed(manualSource, ageYears, proMode, opts)) {
          nextSource = manualSource;
        } else {
          nextSource = getDefaultGrowthDataSource(ageYears, proMode, opts);
        }
      } else {
        // Bez ręcznego wyboru zawsze ustawiamy kanoniczne źródło domyślne dla wieku:
        // OLAF od 3 r.ż., WHO poniżej 3 r.ż. w trybie standardowym, Palczewska
        // poniżej 3 r.ż. w trybie wyników profesjonalnych.
        nextSource = getDefaultGrowthDataSource(ageYears, proMode, opts);
      }
      if (hasAgeInput && !isGrowthDataSourceAllowed(nextSource, ageYears, proMode, opts)) {
        nextSource = getDefaultGrowthDataSource(ageYears, proMode, opts);
      }
      if (!normalizeGrowthDataSource(nextSource)) nextSource = 'OLAF';

      if (nextSource !== currentSource || !currentSource) {
        setCheckedGrowthDataSource(nextSource, opts);
      } else {
        setBmiSourceValue(currentSource, opts);
      }

      refreshGrowthChartActionControls(opts);
      return nextSource || 'OLAF';
    } catch (error) {
      logSwallowed('vilda_advanced_growth:sync-growth-data-source-inputs', error);
      try { refreshGrowthChartActionControls(opts); } catch (refreshError) { logSwallowed('vilda_advanced_growth:sync-refresh-fallback', refreshError); }
      return 'OLAF';
    }
  }

  function updatePalczewskaAccess(options) {
    try {
      return syncGrowthDataSourceInputs(options || {});
    } catch (error) {
      logSwallowed('vilda_advanced_growth:update-palczewska-access', error);
      return 'OLAF';
    }
  }

  function updateAdvancedGrowthAccess(options) {
    const opts = options && typeof options === 'object' ? options : {};
    try {
      const btn = getElementById('toggleAdvancedGrowth', opts);
      const form = getElementById('advancedGrowthForm', opts);
      const label = form ? form.querySelector('.pro-summary-label') : null;
      const pro = isGrowthResultsProfessionalMode(opts);

      if (btn) {
        if (pro) {
          btn.disabled = false;
          btn.classList.remove('disabled');
          btn.removeAttribute('disabled');
        } else {
          btn.disabled = true;
          btn.classList.add('disabled');
          btn.setAttribute('disabled', '');
        }
      }

      if (form) {
        if (pro) {
          form.classList.add('pro-summary-card');
          if (label) label.style.display = 'block';
        } else {
          form.style.display = 'none';
          form.classList.remove('pro-summary-card');
          if (label) label.style.display = 'none';
        }
      }

      const updateAnalysis = (typeof opts.updateAdvancedMeasurementAnalysisControls === 'function')
        ? opts.updateAdvancedMeasurementAnalysisControls
        : global.updateAdvancedMeasurementAnalysisControls;
      if (typeof updateAnalysis === 'function') {
        try { updateAnalysis(!pro); } catch (error) { logSwallowed('vilda_advanced_growth:update-analysis-controls', error); }
      }
      return { pro, buttonPresent: !!btn, formPresent: !!form };
    } catch (error) {
      logSwallowed('vilda_advanced_growth:update-advanced-growth-access', error);
      return { pro: false, error: true };
    }
  }

  function updateGrowthDataSourceControls(context, options) {
    const opts = options && typeof options === 'object' ? options : {};
    const hasExplicitAgeInput = hasAgeSourceInput(opts);
    const rawAge = opts.age != null ? Number(opts.age) : getGrowthDataSourceAgeYears(opts);
    const age = Number.isFinite(rawAge) ? rawAge : 0;
    const state = {
      version: VERSION,
      age,
      action: 'skipped',
      hasAgeSourceInput: hasExplicitAgeInput,
      controlsPresent: !!(getElementById('dataToggleContainer', opts) && getElementById('sourcePalczewska', opts) && getElementById('sourceOlaf', opts) && getElementById('sourceWho', opts))
    };

    const mark = (phase, meta) => {
      try {
        if (typeof opts.markSection === 'function') opts.markSection(context, 'adult-metrics', phase, meta || {});
      } catch (error) {
        logSwallowed('vilda_advanced_growth:update-source-controls-mark', error);
      }
    };

    if (!state.controlsPresent) {
      mark('mark', { action: 'growth-source-skipped', reason: 'missing-controls' });
      return state;
    }

    const toggleContainer = getElementById('dataToggleContainer', opts);
    if (age > 18) {
      if (toggleContainer) toggleContainer.style.display = 'none';
      setCheckedGrowthDataSource('WHO', opts);
      refreshGrowthChartActionControls(opts);
      state.action = 'adult-force-who';
    } else if (!state.hasAgeSourceInput) {
      if (toggleContainer) {
        toggleContainer.style.display = 'none';
        const manualSelection = !!(toggleContainer.dataset && toggleContainer.dataset.manual === '1');
        const preferredSource = normalizeGrowthDataSource(toggleContainer.dataset ? toggleContainer.dataset.preferredSource : '');
        if (manualSelection && preferredSource) {
          setCheckedGrowthDataSource(preferredSource, opts);
        } else {
          setCheckedGrowthDataSource('OLAF', opts);
        }
      } else {
        setCheckedGrowthDataSource('OLAF', opts);
      }
      refreshGrowthChartActionControls(opts);
      state.action = 'empty-age-default-olaf';
    } else {
      if (toggleContainer) toggleContainer.style.display = 'flex';
      setBmiSourceValue(syncGrowthDataSourceInputs(Object.assign({}, opts, { ageYears: age })), opts);
      state.action = 'child-sync-source';
    }

    mark('mark', {
      action: 'growth-source-controls',
      sourceAction: state.action,
      age: state.age
    });
    return state;
  }

  function setupAdvancedGrowth() {
    const doc = global.document;
    if (!doc) return;
    const toggleBtn = doc.getElementById('toggleAdvancedGrowth');
    const form = doc.getElementById('advancedGrowthForm');
    if (toggleBtn && form && !toggleBtn.dataset.vildaAdvancedGrowthToggleAttached) {
      toggleBtn.addEventListener('click', () => {
        if (form.style.display === 'none' || form.style.display === '') {
          form.style.display = 'block';
          callGlobal('importTherapyPointsToAdvancedGrowth', [], 'vilda_advanced_growth:import-therapy-points');
        } else {
          form.style.display = 'none';
        }
      });
      toggleBtn.dataset.vildaAdvancedGrowthToggleAttached = 'true';
    }

    const addBtn = doc.getElementById('advAddMeasurementBtn');
    if (addBtn && !addBtn.dataset.vildaAdvancedGrowthAddAttached) {
      addBtn.addEventListener('click', (e) => {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        if (typeof global.vildaHandleAdvancedMeasurementAdd === 'function') {
          global.vildaHandleAdvancedMeasurementAdd();
        } else {
          addAdvMeasurementRow();
        }
      });
      addBtn.dataset.vildaAdvancedGrowthAddAttached = 'true';
    }

    const container = doc.getElementById('advMeasurements');
    if (container && !container.querySelector('.measure-row')) {
      addAdvMeasurementRow();
    }

    const ids = ['age', 'ageMonths', 'weight', 'height', 'sex', 'advMotherHeight', 'advFatherHeight', 'advBoneAge', 'advTesticularVolume', 'advFamilyDelayedPuberty', 'advGrowthExclusion'];
    ids.forEach(id => {
      const el = doc.getElementById(id);
      if (el && !el.dataset.vildaAdvancedGrowthInputAttached) {
        const calc = getFunction('calculateGrowthAdvanced');
        if (calc) {
          el.addEventListener('input', calc);
          el.addEventListener('change', calc);
        }
        el.dataset.vildaAdvancedGrowthInputAttached = 'true';
      }
    });

    callGlobal('removeAdvancedGrowthClearButton', [], 'vilda_advanced_growth:remove-clear-button');
    callGlobal('ensureAdvancedGrowthReportControls', [], 'vilda_advanced_growth:report-controls');
    callGlobal('updateAdvancedGrowthSexSpecificFields', [], 'vilda_advanced_growth:sex-specific-fields');
    callGlobal('calculateGrowthAdvanced', [], 'vilda_advanced_growth:initial-calculate');
  }

  function updateAdvancedMeasurementAnalysisControls(forceHide) {
    const doc = global.document;
    if (!doc) return;
    const rows = doc.querySelectorAll('#advMeasurements .measure-row');
    const proMode = !forceHide && isAdvancedGrowthProModeActive();
    const enabledForPage = !forceHide && isAdvancedGrowthMainPage();
    rows.forEach((row) => {
      const actionsWrap = row.querySelector('.adv-history-analysis-actions');
      const panel = row.querySelector('.adv-history-analysis-panel');
      const toggleBtn = row.querySelector('.adv-analyze-btn');
      if (!actionsWrap || !panel || !toggleBtn) return;

      const yVal = parseFloat(row.querySelector('.adv-age-years')?.value);
      const mVal = parseFloat(row.querySelector('.adv-age-months')?.value);
      const hVal = parseFloat(row.querySelector('.adv-height')?.value);
      const wVal = parseFloat(row.querySelector('.adv-weight')?.value);
      const hasAge = !(isNaN(yVal) && isNaN(mVal));
      const hasAnthro = !isNaN(hVal) || !isNaN(wVal);
      const visible = proMode && enabledForPage && hasAge && hasAnthro;

      actionsWrap.style.display = visible ? 'flex' : 'none';
      if (!visible) {
        row.dataset.analysisOpen = 'false';
        panel.style.display = 'none';
        clearHtml(panel);
        toggleBtn.textContent = ADV_HISTORY_ANALYZE_LABEL;
        return;
      }

      if (row.dataset.analysisOpen === 'true') {
        callGlobal('renderAdvancedMeasurementAnalysisRow', [row], 'vilda_advanced_growth:render-analysis-row');
      }
    });

    callGlobal('updateAdvancedMeasurementActionDivider', [], 'vilda_advanced_growth:update-analysis-divider');
  }

  function addAdvMeasurementRow(options) {
    const opts = (options && typeof options === 'object') ? options : {};
    const skipInitialRecalc = !!opts.skipInitialRecalc;
    const doc = global.document;
    if (!doc) return;
    const container = doc.getElementById('advMeasurements');
    if (!container) return;

    const row = doc.createElement('div');
    row.className = 'measure-row';
    setTrustedHtml(row, `
      <div class="measure-row-sep"></div>
      <div class="measure-row-top">
        <label>Wiek (lata):
          <input type="number" class="adv-age-years" min="0" max="18" step="1">
        </label>
        <label>Wiek (miesiące):
          <input type="number" class="adv-age-months" min="0" max="11" step="1">
        </label>
        <label>Wzrost (cm):
          <input type="number" class="adv-height" min="40" max="250" step="0.1">
        </label>
      </div>
      <div class="measure-row-bot">
        <label>Waga (kg):
          <input type="number" class="adv-weight" min="1" max="200" step="0.1">
        </label>
        <label>Wiek kostny (lata):
          <input type="number" class="adv-bone-age" min="0" max="18" step="0.1">
        </label>
        <button type="button" class="icon remove-measure" title="Usuń ten pomiar">&times;</button>
      </div>
    `, 'vilda-advanced-growth:measure-row');
    container.appendChild(row);

    const arrowDiv = doc.createElement('div');
    arrowDiv.className = 'measure-row-arrow';
    arrowDiv.style.display = 'none';
    setTrustedHtml(arrowDiv, `
      <label class="switch-pub">
        <input type="checkbox" class="adv-arrow-enable">
        <span class="slider"></span>
      </label>
      <span class="arrow-label">Dodaj strzałkę z komentarzem</span>
      <input type="text" class="adv-arrow-comment" placeholder="Wpisz komentarz" style="display:none;margin-top:.35rem;">
    `, 'vilda-advanced-growth:arrow-controls');
    row.appendChild(arrowDiv);

    const arrowCheck = arrowDiv.querySelector('.adv-arrow-enable');
    const arrowComment = arrowDiv.querySelector('.adv-arrow-comment');
    if (arrowCheck && arrowComment) {
      arrowCheck.addEventListener('change', () => {
        arrowComment.style.display = arrowCheck.checked ? '' : 'none';
        callGlobal('calculateGrowthAdvanced', [], 'vilda_advanced_growth:arrow-change');
      });
      arrowComment.addEventListener('input', () => {
        callGlobal('calculateGrowthAdvanced', [], 'vilda_advanced_growth:arrow-comment');
      });
    }

    if (isAdvancedGrowthMainPage()) {
      const analysisActions = doc.createElement('div');
      analysisActions.className = 'adv-history-analysis-actions';
      analysisActions.style.display = 'none';
      setTrustedHtml(analysisActions, `<button type="button" class="adv-analyze-btn">${escapeHtml(ADV_HISTORY_ANALYZE_LABEL)}</button>`, 'vilda-advanced-growth:analysis-actions');
      row.appendChild(analysisActions);

      const analysisPanel = doc.createElement('div');
      analysisPanel.className = 'adv-history-analysis-panel';
      analysisPanel.style.display = 'none';
      row.appendChild(analysisPanel);

      const analyzeBtn = analysisActions.querySelector('.adv-analyze-btn');
      if (analyzeBtn) {
        analyzeBtn.addEventListener('click', () => {
          const willOpen = row.dataset.analysisOpen !== 'true';
          row.dataset.analysisOpen = willOpen ? 'true' : 'false';
          callGlobal('renderAdvancedMeasurementAnalysisRow', [row], 'vilda_advanced_growth:analysis-button');
        });
      }
    }

    callGlobal('updateArrowInputsVisibility', [], 'vilda_advanced_growth:update-arrow-visibility');

    const removeBtn = row.querySelector('.remove-measure');
    if (removeBtn) {
      removeBtn.addEventListener('click', (e) => {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        if (typeof global.vildaHandleAdvancedMeasurementRowRemove === 'function') {
          global.vildaHandleAdvancedMeasurementRowRemove(row);
        } else {
          try { container.removeChild(row); } catch (error) { logSwallowed('vilda_advanced_growth:remove-row', error); }
          callGlobal('updateRemoveButtons', [], 'vilda_advanced_growth:update-remove-buttons-after-remove');
          callGlobal('calculateGrowthAdvanced', [], 'vilda_advanced_growth:calculate-after-remove');
        }
      });
    }

    const inputs = row.querySelectorAll('input');
    const handleRowInput = (event) => {
      try {
        const target = event && event.target;
        if (target && target.matches('.adv-age-years,.adv-age-months,.adv-height,.adv-weight')) {
          callGlobal('_syncAdvRowToIntake', [row], 'vilda_advanced_growth:sync-adv-row-to-intake');
        }
      } catch (error) {
        logSwallowed('vilda_advanced_growth:row-input-sync', error);
      }
      callGlobal('calculateGrowthAdvanced', [], 'vilda_advanced_growth:calculate-row-input');
    };
    inputs.forEach(inp => {
      inp.addEventListener('input', handleRowInput);
      inp.addEventListener('change', handleRowInput);
    });

    callGlobal('updateRemoveButtons', [], 'vilda_advanced_growth:update-remove-buttons-after-add');
    updateAdvAgeMax();
    if (!skipInitialRecalc) callGlobal('calculateGrowthAdvanced', [], 'vilda_advanced_growth:calculate-after-add');
    return row;
  }

  function updateAdvAgeMax() {
    try {
      const getAgeDecimal = getFunction('getAgeDecimal');
      const ageYears = getAgeDecimal ? getAgeDecimal() : NaN;
      const doc = global.document;
      if (!doc) return;
      const inputsY = doc.querySelectorAll('#advMeasurements .adv-age-years');
      inputsY.forEach(inp => {
        if (!isNaN(ageYears)) {
          inp.max = Math.floor(ageYears);
        }
      });
    } catch (error) {
      logSwallowed('vilda_advanced_growth:update-age-max', error);
    }
  }


  /* 8O-3 — raport HTML/PDF advanced growth. */
  function advGrowthBuildTargetHeightForReport(sex) {
    const motherH = parseFloat(document.getElementById('advMotherHeight')?.value);
    const fatherH = parseFloat(document.getElementById('advFatherHeight')?.value);
    if (isNaN(motherH) || isNaN(fatherH)) return null;
    return (sex === 'F')
      ? (((fatherH - 13) + motherH) / 2)
      : (((motherH + 13) + fatherH) / 2);
  }

  function advGrowthGetTargetStatsForReport(targetHeight, sex, source, cache) {
    if (typeof targetHeight !== 'number' || !isFinite(targetHeight)) return null;
    const src = String(source || '').toUpperCase() || 'OLAF';
    const memo = cache && typeof cache === 'object' ? cache : null;
    if (memo && Object.prototype.hasOwnProperty.call(memo, src)) {
      return memo[src];
    }
    let stats = null;
    if (src === 'PALCZEWSKA') {
      stats = calcPercentileStatsPal(targetHeight, sex, 18, 'HT');
    } else {
      stats = advHistoryCalcAnthroStatsForSource(targetHeight, sex, 18, 'HT', src);
    }
    if (memo) memo[src] = stats || null;
    return stats || null;
  }

  function advGrowthCollectHistoricalPointsForReport() {
    return collectAdvancedMeasurements(false)
      .filter((m) => typeof m.ageMonths === 'number' && isFinite(m.ageMonths) && (m.height != null || m.weight != null))
      .sort((a, b) => (a.ageMonths - b.ageMonths) || ((a.domIndex || 0) - (b.domIndex || 0)));
  }

  function advGrowthCollectAllPointsForReport() {
    const historical = advGrowthCollectHistoricalPointsForReport().map((m, idx) => Object.assign({
      pointType: 'history',
      sourceIndex: idx
    }, m));

    const currentAgeYears = getAgeDecimal();
    const currentAgeMonths = Math.round((isNaN(currentAgeYears) ? NaN : currentAgeYears * 12));
    const currentHeight = parseFloat(document.getElementById('height')?.value);
    const currentWeight = parseFloat(document.getElementById('weight')?.value);
    const currentHasAnthro = !isNaN(currentHeight) || !isNaN(currentWeight);

    if (!isNaN(currentAgeMonths) && currentAgeMonths >= 0 && currentHasAnthro && currentAgeYears < 18) {
      const currentPoint = {
        pointType: 'current',
        sourceIndex: historical.length,
        ageYears: currentAgeYears,
        ageMonths: currentAgeMonths,
        height: !isNaN(currentHeight) ? currentHeight : null,
        weight: !isNaN(currentWeight) ? currentWeight : null,
        boneAgeYears: null,
        arrowEnabled: false,
        arrowComment: '',
        ghSync: false,
        ghId: null,
        domIndex: Number.MAX_SAFE_INTEGER
      };

      const isDuplicate = historical.some((row) => {
        if (!row || row.ageMonths !== currentPoint.ageMonths) return false;
        const sameHeight = (
          (row.height == null && currentPoint.height == null) ||
          (typeof row.height === 'number' && typeof currentPoint.height === 'number' && Math.abs(row.height - currentPoint.height) < 0.05)
        );
        const sameWeight = (
          (row.weight == null && currentPoint.weight == null) ||
          (typeof row.weight === 'number' && typeof currentPoint.weight === 'number' && Math.abs(row.weight - currentPoint.weight) < 0.05)
        );
        return sameHeight && sameWeight;
      });

      if (!isDuplicate) historical.push(currentPoint);
    }

    return historical
      .slice()
      .sort((a, b) => (a.ageMonths - b.ageMonths) || ((a.domIndex || 0) - (b.domIndex || 0)));
  }

  function advGrowthBuildReportRows() {
    const points = advGrowthCollectAllPointsForReport();
    const preferredSource = advHistoryGetPreferredSource();
    const sex = document.getElementById('sex')?.value || 'M';
    const targetHeight = advGrowthBuildTargetHeightForReport(sex);
    const targetStatsCache = {};
    const rows = [];
    let previousHsds = null;
    let fallbackUsed = false;

    points.forEach((point, index) => {
      const ageYears = point.ageMonths / 12;
      const metricMeta = {};

      const weightStats = (point.weight != null)
        ? advHistoryResolveMetric('WT', point.weight, sex, ageYears, preferredSource)
        : { result: null, source: null, reason: '' };
      const heightStats = (point.height != null)
        ? advHistoryResolveMetric('HT', point.height, sex, ageYears, preferredSource)
        : { result: null, source: null, reason: '' };
      const bmiValue = (point.weight != null && point.height != null && typeof BMI === 'function')
        ? BMI(point.weight, point.height)
        : null;
      const bmiStats = (bmiValue != null)
        ? advHistoryResolveMetric('BMI', bmiValue, sex, ageYears, preferredSource)
        : { result: null, source: null, reason: '' };
      const coleStats = (bmiValue != null)
        ? advHistoryResolveMetric('COLE', bmiValue, sex, ageYears, preferredSource)
        : { result: null, source: null, reason: '' };

      metricMeta.WT = weightStats;
      metricMeta.HT = heightStats;
      metricMeta.BMI = bmiStats;
      metricMeta.COLE = coleStats;

      const targetSource = (heightStats && heightStats.source) ? heightStats.source : preferredSource;
      const targetStats = advGrowthGetTargetStatsForReport(targetHeight, sex, targetSource, targetStatsCache);

      const hsds = (heightStats && heightStats.result && typeof heightStats.result.sd === 'number' && isFinite(heightStats.result.sd))
        ? heightStats.result.sd
        : null;
      const deltaHsds = (typeof hsds === 'number' && isFinite(hsds) && typeof previousHsds === 'number' && isFinite(previousHsds))
        ? (hsds - previousHsds)
        : null;
      if (typeof hsds === 'number' && isFinite(hsds)) {
        previousHsds = hsds;
      }

      const hsdsMpSds = (
        typeof hsds === 'number' && isFinite(hsds) &&
        targetStats && typeof targetStats.sd === 'number' && isFinite(targetStats.sd)
      ) ? (hsds - targetStats.sd) : null;

      let velocity = null;
      let velocityGapM = null;
      if (index > 0) {
        const prev = points[index - 1];
        if (
          prev && typeof prev.ageMonths === 'number' && isFinite(prev.ageMonths) &&
          typeof point.ageMonths === 'number' && isFinite(point.ageMonths) &&
          prev.height != null && point.height != null
        ) {
          velocityGapM = point.ageMonths - prev.ageMonths;
          if (velocityGapM >= 6 && typeof velocityCmPerYear === 'function') {
            const vel = velocityCmPerYear(prev.height, prev.ageMonths, point.height, point.ageMonths);
            if (typeof vel === 'number' && isFinite(vel)) {
              velocity = vel;
            }
          }
        }
      }

      const rowFallbackUsed = Object.values(metricMeta).some((meta) => meta && meta.source && String(meta.source).toUpperCase() !== String(preferredSource).toUpperCase());
      if (rowFallbackUsed) fallbackUsed = true;

      const ageLabelBase = advHistoryFormatAgeMonths(point.ageMonths);
      const ageLabel = point.pointType === 'current' ? `${ageLabelBase} (akt.)` : ageLabelBase;
      const weightCentileText = (weightStats && weightStats.result && typeof weightStats.result.percentile === 'number' && isFinite(weightStats.result.percentile))
        ? (advHistoryPercentileText(weightStats.result.percentile) || '—')
        : '—';
      const heightCentileText = (heightStats && heightStats.result && typeof heightStats.result.percentile === 'number' && isFinite(heightStats.result.percentile))
        ? (advHistoryPercentileText(heightStats.result.percentile) || '—')
        : '—';
      const bmiCentileText = (bmiStats && bmiStats.result && typeof bmiStats.result.percentile === 'number' && isFinite(bmiStats.result.percentile))
        ? (advHistoryPercentileText(bmiStats.result.percentile) || '—')
        : '—';

      rows.push({
        pointType: point.pointType,
        ageMonths: point.ageMonths,
        ageLabel,
        weightText: (typeof point.weight === 'number' && isFinite(point.weight)) ? `${advHistoryFormatNumber(point.weight, 1)} kg` : '—',
        weightCentileText,
        heightText: (typeof point.height === 'number' && isFinite(point.height)) ? `${advHistoryFormatNumber(point.height, 1)} cm` : '—',
        heightCentileText,
        velocityText: (typeof velocity === 'number' && isFinite(velocity)) ? `${advHistoryFormatNumber(velocity, 1)} cm/rok` : '—',
        velocityGapM,
        hsdsText: (typeof hsds === 'number' && isFinite(hsds)) ? advGrowthFormatSignedNumber(hsds, 2) : '—',
        deltaHsdsText: (typeof deltaHsds === 'number' && isFinite(deltaHsds)) ? advGrowthFormatSignedNumber(deltaHsds, 2) : '—',
        hsdsMpSdsText: (typeof hsdsMpSds === 'number' && isFinite(hsdsMpSds)) ? advGrowthFormatSignedNumber(hsdsMpSds, 2) : '—',
        bmiText: (typeof bmiValue === 'number' && isFinite(bmiValue)) ? advHistoryFormatNumber(bmiValue, 1) : '—',
        bmiCentileText,
        coleText: (typeof coleStats.result === 'number' && isFinite(coleStats.result)) ? `${advHistoryFormatNumber(coleStats.result, 1)}%` : '—',
        sourceSummary: advHistoryBuildSourceSummary(preferredSource, metricMeta),
        rowFallbackUsed
      });
    });

    return {
      preferredSource,
      sex,
      targetHeight,
      motherHeight: (typeof parseFloat(document.getElementById('advMotherHeight')?.value) === 'number' && isFinite(parseFloat(document.getElementById('advMotherHeight')?.value))) ? parseFloat(document.getElementById('advMotherHeight')?.value) : null,
      fatherHeight: (typeof parseFloat(document.getElementById('advFatherHeight')?.value) === 'number' && isFinite(parseFloat(document.getElementById('advFatherHeight')?.value))) ? parseFloat(document.getElementById('advFatherHeight')?.value) : null,
      rows,
      fallbackUsed,
      historicalCount: points.filter((p) => p.pointType !== 'current').length,
      includesCurrent: points.some((p) => p.pointType === 'current')
    };
  }

  function advGrowthDrawPdfCell(pdf, x, y, width, height, text, options) {
    const opts = options || {};
    const fill = opts.fill || null;
    const border = opts.border || '#becdcd';
    const textColor = opts.textColor || '#1f2b2b';
    const align = opts.align || 'left';
    const fontSize = Number.isFinite(opts.fontSize) ? opts.fontSize : 9.4;
    const fontStyle = opts.fontStyle || 'normal';
    const paddingX = Number.isFinite(opts.paddingX) ? opts.paddingX : 2.2;
    const safeText = advGrowthSanitizePdfText(text || '');

    if (fill) {
      const [fr, fg, fb] = advGrowthHexToRgb(fill);
      pdf.setFillColor(fr, fg, fb);
      pdf.rect(x, y, width, height, 'F');
    }

    const [br, bg, bb] = advGrowthHexToRgb(border);
    pdf.setDrawColor(br, bg, bb);
    pdf.rect(x, y, width, height);

    pdf.setFont('helvetica', fontStyle);
    pdf.setFontSize(fontSize);
    const [tr, tg, tb] = advGrowthHexToRgb(textColor);
    pdf.setTextColor(tr, tg, tb);

    const maxTextWidth = Math.max(4, width - (paddingX * 2));
    const lines = safeText ? pdf.splitTextToSize(safeText, maxTextWidth) : [''];
    const lineHeight = fontSize * 0.38;
    const blockHeight = Math.max(lineHeight, lines.length * lineHeight);
    let textY = y + (height / 2) - (blockHeight / 2) + lineHeight * 0.82;

    lines.forEach((line) => {
      let textX = x + paddingX;
      if (align === 'center') {
        textX = x + (width / 2);
        pdf.text(line, textX, textY, { align: 'center', baseline: 'middle' });
      } else if (align === 'right') {
        textX = x + width - paddingX;
        pdf.text(line, textX, textY, { align: 'right', baseline: 'middle' });
      } else {
        pdf.text(line, textX, textY, { align: 'left', baseline: 'middle' });
      }
      textY += lineHeight;
    });
  }


  let __advGrowthPdfMakeLoadPromise = null;

  function advGrowthLoadScriptOnce(src, testFn) {
    return new Promise((resolve, reject) => {
      try {
        if (typeof testFn === 'function' && testFn()) {
          resolve(true);
          return;
        }
        const existing = Array.from(document.getElementsByTagName('script')).find((script) => script && script.src === src);
        if (existing) {
          if (existing.dataset.loaded === 'true' || (typeof testFn === 'function' && testFn())) {
            resolve(true);
            return;
          }
          existing.addEventListener('load', () => resolve(true), { once: true });
          existing.addEventListener('error', () => reject(new Error(`Nie udało się załadować skryptu: ${src}`)), { once: true });
          return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = () => {
          script.dataset.loaded = 'true';
          resolve(true);
        };
        script.onerror = () => reject(new Error(`Nie udało się załadować skryptu: ${src}`));
        document.head.appendChild(script);
      } catch (error) {
        reject(error);
      }
    });
  }

  async function advGrowthEnsurePdfMake() {
    if (window.pdfMake && typeof window.pdfMake.createPdf === 'function') {
      return true;
    }
    if (__advGrowthPdfMakeLoadPromise) {
      return __advGrowthPdfMakeLoadPromise;
    }

    __advGrowthPdfMakeLoadPromise = (async () => {
      await advGrowthLoadScriptOnce(
        'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/pdfmake.min.js',
        () => !!(window.pdfMake && typeof window.pdfMake.createPdf === 'function')
      );
      await advGrowthLoadScriptOnce(
        'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/vfs_fonts.min.js',
        () => !!(window.pdfMake && window.pdfMake.vfs && Object.keys(window.pdfMake.vfs || {}).length)
      );
      return !!(window.pdfMake && typeof window.pdfMake.createPdf === 'function');
    })().catch((error) => {
      console.warn('Nie udało się załadować pdfMake dla raportu wzrostowego.', error);
      return false;
    });

    return __advGrowthPdfMakeLoadPromise;
  }

  function advGrowthCreatePdfMakeCell(text, options) {
    const opts = options || {};
    const sanitizedText = opts.preserveLineBreaks
      ? advGrowthSanitizePdfMultilineText(text)
      : advGrowthSanitizePdfText(text);
    const cell = {
      text: sanitizedText,
      alignment: opts.alignment || 'left',
      margin: Array.isArray(opts.margin) ? opts.margin : [4, 5, 4, 5]
    };

    if (opts.bold) cell.bold = true;
    if (opts.fillColor) cell.fillColor = opts.fillColor;
    if (opts.color) cell.color = opts.color;
    if (Number.isFinite(opts.fontSize)) cell.fontSize = opts.fontSize;
    if (Array.isArray(opts.border)) cell.border = opts.border;
    if (Array.isArray(opts.borderColor)) cell.borderColor = opts.borderColor;
    if (Number.isFinite(opts.colSpan) && opts.colSpan > 1) cell.colSpan = opts.colSpan;
    if (opts.noWrap === true) cell.noWrap = true;
    if (opts.italics) cell.italics = true;

    return cell;
  }

  function advGrowthBuildPdfMakeDefinition(report) {
    const model = advGrowthBuildReportPresentationModel(report);
    const headerFill = '#eef7f7';
    const headerTextColor = '#005f66';
    const accentFill = '#f5f3ff';
    const accentTextColor = '#5b21b6';
    const currentAccentFill = '#faf7ff';
    const tableWidths = [84, 54, 66, 58, 68, 84, 46, 50, 72, 46, 60, 56];
    const tableTotalWidth = tableWidths.reduce((sum, width) => sum + (Number(width) || 0), 0);

    const headerRow = [
      advGrowthCreatePdfMakeCell('Wiek', { alignment: 'left', bold: true, fillColor: headerFill, color: headerTextColor, fontSize: 10.0, margin: [6, 6, 6, 6] }),
      advGrowthCreatePdfMakeCell('Waga', { alignment: 'center', bold: true, fillColor: accentFill, color: accentTextColor, fontSize: 10.0, margin: [4, 6, 4, 6] }),
      advGrowthCreatePdfMakeCell('Centyl wagi', { alignment: 'center', bold: true, fillColor: headerFill, color: headerTextColor, fontSize: 9.4, margin: [3, 6, 3, 6] }),
      advGrowthCreatePdfMakeCell('Wzrost', { alignment: 'center', bold: true, fillColor: accentFill, color: accentTextColor, fontSize: 10.0, margin: [4, 6, 4, 6] }),
      advGrowthCreatePdfMakeCell('Centyl wzrostu', { alignment: 'center', bold: true, fillColor: headerFill, color: headerTextColor, fontSize: 9.4, margin: [3, 6, 3, 6] }),
      advGrowthCreatePdfMakeCell('Tempo wzrastania', { alignment: 'center', bold: true, fillColor: headerFill, color: headerTextColor, fontSize: 9.6, margin: [3, 6, 3, 6] }),
      advGrowthCreatePdfMakeCell('hSDS', { alignment: 'center', bold: true, fillColor: headerFill, color: headerTextColor, fontSize: 10.0, margin: [3, 6, 3, 6] }),
      advGrowthCreatePdfMakeCell('ΔhSDS', { alignment: 'center', bold: true, fillColor: headerFill, color: headerTextColor, fontSize: 10.0, margin: [3, 6, 3, 6] }),
      advGrowthCreatePdfMakeCell('hSDS - mpSDS', { alignment: 'center', bold: true, fillColor: headerFill, color: headerTextColor, fontSize: 9.4, margin: [3, 6, 3, 6] }),
      advGrowthCreatePdfMakeCell('BMI', { alignment: 'center', bold: true, fillColor: headerFill, color: headerTextColor, fontSize: 10.0, margin: [3, 6, 3, 6] }),
      advGrowthCreatePdfMakeCell('Centyl BMI', { alignment: 'center', bold: true, fillColor: headerFill, color: headerTextColor, fontSize: 9.4, margin: [3, 6, 3, 6] }),
      advGrowthCreatePdfMakeCell("Wskaźnik\nCole'a", { alignment: 'center', bold: true, fillColor: headerFill, color: headerTextColor, fontSize: 9.1, margin: [3, 6, 3, 6], preserveLineBreaks: true })
    ];

    const bodyRows = report.rows.map((row) => {
      const isCurrentRow = row.pointType === 'current';
      const baseFill = isCurrentRow ? '#f8fbfb' : '#ffffff';
      const ageColor = isCurrentRow ? '#0f4c5c' : '#1f2b2b';
      return [
        advGrowthCreatePdfMakeCell(row.ageLabel, { alignment: 'left', bold: isCurrentRow, fillColor: baseFill, color: ageColor, fontSize: 9.9, margin: [6, 5, 6, 5] }),
        advGrowthCreatePdfMakeCell(row.weightText, { alignment: 'center', bold: isCurrentRow, fillColor: currentAccentFill, color: accentTextColor, fontSize: 9.8, margin: [4, 5, 4, 5] }),
        advGrowthCreatePdfMakeCell(row.weightCentileText, { alignment: 'center', bold: isCurrentRow, fillColor: baseFill, fontSize: 9.3, margin: [3, 5, 3, 5] }),
        advGrowthCreatePdfMakeCell(row.heightText, { alignment: 'center', bold: isCurrentRow, fillColor: currentAccentFill, color: accentTextColor, fontSize: 9.8, margin: [4, 5, 4, 5] }),
        advGrowthCreatePdfMakeCell(row.heightCentileText, { alignment: 'center', bold: isCurrentRow, fillColor: baseFill, fontSize: 9.3, margin: [3, 5, 3, 5] }),
        advGrowthCreatePdfMakeCell(row.velocityText, { alignment: 'center', bold: isCurrentRow, fillColor: baseFill, fontSize: 9.6, margin: [3, 5, 3, 5] }),
        advGrowthCreatePdfMakeCell(row.hsdsText, { alignment: 'center', bold: isCurrentRow, fillColor: baseFill, fontSize: 9.8, margin: [3, 5, 3, 5] }),
        advGrowthCreatePdfMakeCell(row.deltaHsdsText, { alignment: 'center', bold: isCurrentRow, fillColor: baseFill, fontSize: 9.8, margin: [3, 5, 3, 5] }),
        advGrowthCreatePdfMakeCell(row.hsdsMpSdsText, { alignment: 'center', bold: isCurrentRow, fillColor: baseFill, fontSize: 9.5, margin: [3, 5, 3, 5] }),
        advGrowthCreatePdfMakeCell(row.bmiText, { alignment: 'center', bold: isCurrentRow, fillColor: baseFill, fontSize: 9.8, margin: [3, 5, 3, 5] }),
        advGrowthCreatePdfMakeCell(row.bmiCentileText, { alignment: 'center', bold: isCurrentRow, fillColor: baseFill, fontSize: 9.3, margin: [3, 5, 3, 5] }),
        advGrowthCreatePdfMakeCell(row.coleText, { alignment: 'center', bold: isCurrentRow, fillColor: baseFill, fontSize: 9.7, margin: [3, 5, 3, 5] })
      ];
    });

    const tableBody = [headerRow].concat(bodyRows);

    return {
      compress: true,
      pageSize: 'A4',
      pageOrientation: 'landscape',
      pageMargins: [26, 24, 26, 28],
      info: {
        title: advGrowthSanitizePdfText(`${model.title} — ${model.subtitle}`),
        subject: advGrowthSanitizePdfText('Raport wzrastania'),
        author: 'wagaiwzrost.pl'
      },
      defaultStyle: {
        font: 'Roboto',
        fontSize: 10.2,
        color: '#212b36'
      },
      footer: function (currentPage, pageCount) {
        return {
          margin: [26, 4, 26, 10],
          columns: [
            {
              text: 'Wygenerowano automatycznie przez raport wzrastania - www.wagaiwzrost.pl',
              color: '#8ca0a5',
              fontSize: 8.5,
              alignment: 'left'
            },
            {
              text: `Strona ${currentPage} / ${pageCount}`,
              color: '#8ca0a5',
              fontSize: 8.5,
              alignment: 'right'
            }
          ]
        };
      },
      content: [
        { text: model.title, style: 'pdfTitle' },
        { text: model.subtitle, style: 'pdfSubtitle', margin: [0, 4, 0, 0] },
        {
          margin: [0, 10, 0, 12],
          table: {
            widths: [tableTotalWidth],
            body: [[{
              stack: [
                { text: 'PODSUMOWANIE RAPORTU', style: 'pdfSummaryTitle', margin: [0, 0, 0, 4] },
                { ul: model.summaryItems, style: 'pdfSummaryList', margin: [12, 0, 0, 0] }
              ],
              border: [false, false, false, false],
              margin: [0, 0, 0, 0]
            }]]
          },
          layout: {
            hLineWidth: function () { return 0; },
            vLineWidth: function () { return 0; },
            paddingLeft: function () { return 0; },
            paddingRight: function () { return 0; },
            paddingTop: function () { return 0; },
            paddingBottom: function () { return 0; }
          }
        },
        {
          table: {
            headerRows: 1,
            dontBreakRows: true,
            keepWithHeaderRows: 1,
            widths: tableWidths,
            body: tableBody
          },
          layout: {
            hLineWidth: function () { return 0.6; },
            vLineWidth: function () { return 0.6; },
            hLineColor: function () { return '#becdcd'; },
            vLineColor: function () { return '#becdcd'; },
            paddingLeft: function () { return 0; },
            paddingRight: function () { return 0; },
            paddingTop: function () { return 0; },
            paddingBottom: function () { return 0; }
          }
        },
        { ul: model.noteItems, style: 'pdfNoteList', margin: [0, 12, 0, 0] }
      ],
      styles: {
        pdfTitle: {
          fontSize: 20,
          bold: true,
          color: '#172222'
        },
        pdfSubtitle: {
          fontSize: 12,
          color: '#424242'
        },
        pdfSummaryTitle: {
          fontSize: 11.6,
          bold: true,
          color: '#005f66'
        },
        pdfSummaryList: {
          fontSize: 10.2,
          color: '#212b36'
        },
        pdfNoteList: {
          fontSize: 10.0,
          color: '#434d4d'
        }
      }
    };
  }


  function advGrowthDecodeCentileEntities(value) {
    return String(value == null ? '' : value)
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  }

  function advGrowthFormatAdultHeightValue(value) {
    if (typeof value !== 'number' || !isFinite(value)) return '—';
    const rounded = Math.round(value);
    const digits = Math.abs(value - rounded) < 0.05 ? 0 : 1;
    return advHistoryFormatNumber(value, digits);
  }

  function advGrowthBuildParentHeightSummaryText(label, heightValue, sex, preferredSource) {
    if (typeof heightValue !== 'number' || !isFinite(heightValue)) return null;
    let line = `${label}: ${advGrowthFormatAdultHeightValue(heightValue)} cm`;
    const resolved = advHistoryResolveMetric('HT', heightValue, sex, 18, preferredSource);
    if (resolved && resolved.result) {
      const percentileText = (typeof resolved.result.percentile === 'number' && isFinite(resolved.result.percentile))
        ? advGrowthDecodeCentileEntities(advHistoryPercentileText(resolved.result.percentile) || '')
        : '';
      const zText = (typeof resolved.result.sd === 'number' && isFinite(resolved.result.sd))
        ? advGrowthFormatSignedNumber(resolved.result.sd, 2)
        : '';
      if (percentileText) line += `, ${percentileText}`;
      if (zText && zText !== '—') line += `, Z-score: ${zText}`;
    }
    return line;
  }

  function advGrowthBuildMphSummaryText(targetHeight, sex, preferredSource) {
    if (typeof targetHeight !== 'number' || !isFinite(targetHeight)) {
      return 'MPH (mid-parental height): brak danych o wzroście rodziców';
    }
    let line = `MPH (mid-parental height): ${advHistoryFormatNumber(targetHeight, 1)} cm`;
    const resolved = advHistoryResolveMetric('HT', targetHeight, sex, 18, preferredSource);
    if (resolved && resolved.result) {
      const percentileText = (typeof resolved.result.percentile === 'number' && isFinite(resolved.result.percentile))
        ? advGrowthDecodeCentileEntities(formatCentile(resolved.result.percentile))
        : '';
      const zText = (typeof resolved.result.sd === 'number' && isFinite(resolved.result.sd))
        ? advGrowthFormatSignedNumber(resolved.result.sd, 2)
        : '';
      if (percentileText) line += ` – centyl: ${percentileText}`;
      if (zText && zText !== '—') line += `, Z-score: ${zText}`;
    }
    return line;
  }

  function advGrowthBuildReportPresentationModel(report) {
    const nameValue = advGrowthSanitizePdfText(document.getElementById('advName')?.value || document.getElementById('name')?.value || '');
    const sexLabel = report.sex === 'F' ? 'Dziewczynka' : 'Chłopiec';
    const sourceLabel = advHistorySourceLabel(report.preferredSource);
    const generatedAt = new Date();
    let generatedLabel = '';
    try {
      generatedLabel = new Intl.DateTimeFormat('pl-PL', {
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
      }).format(generatedAt);
    } catch (_) {
      generatedLabel = generatedAt.toISOString();
    }

    const motherSummary = advGrowthBuildParentHeightSummaryText('Wzrost Mamy', report.motherHeight, 'F', report.preferredSource);
    const fatherSummary = advGrowthBuildParentHeightSummaryText('Wzrost Taty', report.fatherHeight, 'M', report.preferredSource);
    const mphSummary = advGrowthBuildMphSummaryText(report.targetHeight, report.sex, report.preferredSource);
    const bayleyPinneauResultForReport = (typeof window !== 'undefined' && window.advancedGrowthData && typeof window.advancedGrowthData === 'object')
      ? window.advancedGrowthData.bayleyPinneau
      : null;
    const bayleyPinneauSummary = advGrowthBuildBayleyPinneauSummaryText(bayleyPinneauResultForReport);
    const bayleyPinneauComputed = !!(bayleyPinneauResultForReport && bayleyPinneauResultForReport.available === true);
    const rwtResultForReport = (typeof window !== 'undefined' && window.advancedGrowthData && typeof window.advancedGrowthData === 'object')
      ? window.advancedGrowthData.rwt
      : null;
    const rwtSummary = advGrowthBuildRWTSummaryText(rwtResultForReport);
    const rwtComputed = !!(rwtResultForReport && rwtResultForReport.available === true);
    const predictionProfileForReport = (typeof window !== 'undefined' && window.advancedGrowthData && typeof window.advancedGrowthData === 'object')
      ? window.advancedGrowthData.predictionProfile
      : null;
    const predictionProfileSummaryLines = (typeof advGrowthBuildKowdProfileSummaryLines === 'function')
      ? advGrowthBuildKowdProfileSummaryLines(predictionProfileForReport)
      : [];
    const reinehrResultForReport = (typeof window !== 'undefined' && window.advancedGrowthData && typeof window.advancedGrowthData === 'object')
      ? window.advancedGrowthData.reinehr
      : null;
    const reinehrSummary = (typeof advGrowthBuildReinehrCdgpSummaryText === 'function')
      ? advGrowthBuildReinehrCdgpSummaryText(reinehrResultForReport)
      : null;
    const reinehrComputed = !!(reinehrResultForReport && reinehrResultForReport.available === true);
    const predictionReliabilityForReport = (typeof window !== 'undefined' && window.advancedGrowthData && typeof window.advancedGrowthData === 'object' && window.advancedGrowthData.predictionReliability)
      ? window.advancedGrowthData.predictionReliability
      : advGrowthBuildPredictionReliabilityModel({
          bayleyPinneau: bayleyPinneauResultForReport,
          rwt: rwtResultForReport,
          reinehr: reinehrResultForReport,
          profileModel: predictionProfileForReport
        });
    const predictionReliabilitySummary = advGrowthBuildPredictionReliabilitySummaryLine(predictionReliabilityForReport);
    const anyAdultHeightPredictionComputed = bayleyPinneauComputed || rwtComputed || reinehrComputed;

    return {
      title: 'Raport wzrastania',
      subtitle: 'Na podstawie karty Zaawansowane obliczenia wzrostowe',
      nameValue,
      sexLabel,
      sourceLabel,
      motherSummary,
      fatherSummary,
      mphSummary,
      generatedLabel,
      summaryItems: [
        nameValue ? `Pacjent: ${nameValue}` : null,
        `Płeć: ${sexLabel}`,
        motherSummary,
        fatherSummary,
        mphSummary,
        ...predictionProfileSummaryLines,
        bayleyPinneauSummary,
        rwtSummary,
        reinehrSummary,
        predictionReliabilitySummary,
        `Obliczenia wykonano na podstawie danych: ${sourceLabel}`,
        `Punkty historyczne: ${report.historicalCount}` + (report.includesCurrent ? ' + aktualny pomiar' : ''),
        `Wygenerowano: ${generatedLabel}`
      ].filter(Boolean).map((item) => advGrowthSanitizePdfText(item)),
      noteItems: [
        'Tempo wzrastania wyliczono tylko wtedy, gdy odstęp od poprzedniego punktu wynosił co najmniej 6 miesięcy i w obu punktach wpisano wzrost.',
        'ΔhSDS oznacza zmianę względem poprzedniego dostępnego punktu z obliczalnym hSDS.',
        report.targetHeight == null
          ? 'Kolumna hSDS - mpSDS pozostaje pusta, jeśli nie wpisano wzrostu rodziców.'
          : 'Kolumna hSDS - mpSDS porównuje hSDS dziecka z potencjałem wzrostowym MPH.',
        report.fallbackUsed
          ? 'Tam, gdzie wybrane źródło danych było niedostępne dla wieku lub parametru, zastosowano automatyczny fallback zgodny z logiką karty Centyle, BMI… .'
          : null,
        anyAdultHeightPredictionComputed
          ? ADV_GROWTH_PREDICTION_GLOBAL_DISCLAIMER_TEXT
          : null
      ].filter(Boolean).map((item) => advGrowthSanitizePdfText(item))
    };
  }

  function advGrowthBuildHtmlReportMarkup(report) {
    const model = advGrowthBuildReportPresentationModel(report);
    const summaryItemsHtml = model.summaryItems
      .map((item) => `<li>${advHistoryEscapeHtml(item)}</li>`)
      .join('');
    const noteItemsHtml = model.noteItems
      .map((item) => `<li>${advHistoryEscapeHtml(item)}</li>`)
      .join('');
    const rowsHtml = report.rows.map((row) => {
      const currentClass = row.pointType === 'current' ? ' is-current' : '';
      return `
        <tr class="adv-growth-pdf-row${currentClass}">
          <td class="col-age">${advHistoryEscapeHtml(row.ageLabel || '—')}</td>
          <td class="col-weight col-accent">${advHistoryEscapeHtml(row.weightText || '—')}</td>
          <td class="col-centile">${advHistoryEscapeHtml(row.weightCentileText || '—')}</td>
          <td class="col-height col-accent">${advHistoryEscapeHtml(row.heightText || '—')}</td>
          <td class="col-centile">${advHistoryEscapeHtml(row.heightCentileText || '—')}</td>
          <td class="col-velocity">${advHistoryEscapeHtml(row.velocityText || '—')}</td>
          <td class="col-short">${advHistoryEscapeHtml(row.hsdsText || '—')}</td>
          <td class="col-short">${advHistoryEscapeHtml(row.deltaHsdsText || '—')}</td>
          <td class="col-medium">${advHistoryEscapeHtml(row.hsdsMpSdsText || '—')}</td>
          <td class="col-bmi">${advHistoryEscapeHtml(row.bmiText || '—')}</td>
          <td class="col-centile">${advHistoryEscapeHtml(row.bmiCentileText || '—')}</td>
          <td class="col-cole">${advHistoryEscapeHtml(row.coleText || '—')}</td>
        </tr>`;
    }).join('');

    return `
      <div class="adv-growth-pdf-html-root">
        <style>
          .adv-growth-pdf-html-root {
            width: 1120px;
            background: #ffffff;
            color: #212b36;
            font-family: Arial, Helvetica, sans-serif;
            box-sizing: border-box;
            padding: 34px 36px 38px;
          }
          .adv-growth-pdf-title {
            font-size: 30px;
            line-height: 1.15;
            font-weight: 700;
            color: #172222;
            margin: 0;
          }
          .adv-growth-pdf-subtitle {
            font-size: 18px;
            line-height: 1.25;
            color: #424242;
            margin: 6px 0 0;
          }
          .adv-growth-pdf-summary,
          .adv-growth-pdf-table-wrap,
          .adv-growth-pdf-notes,
          .adv-growth-pdf-footer {
            width: 100%;
            box-sizing: border-box;
          }
          .adv-growth-pdf-summary {
            margin-top: 18px;
            padding: 0;
            background: transparent;
            border: 0;
            border-radius: 0;
          }
          .adv-growth-pdf-summary-title {
            font-size: 16px;
            font-weight: 700;
            color: #005f66;
            margin: 0 0 8px;
          }
          .adv-growth-pdf-summary ul,
          .adv-growth-pdf-notes ul {
            margin: 0;
            padding-left: 22px;
          }
          .adv-growth-pdf-summary li,
          .adv-growth-pdf-notes li {
            margin: 0 0 6px;
            line-height: 1.35;
            font-size: 14px;
          }
          .adv-growth-pdf-summary li:last-child,
          .adv-growth-pdf-notes li:last-child {
            margin-bottom: 0;
          }
          .adv-growth-pdf-table-wrap {
            margin-top: 18px;
          }
          .adv-growth-pdf-table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
          }
          .adv-growth-pdf-table th,
          .adv-growth-pdf-table td {
            border: 1px solid #becdcd;
            padding: 9px 8px;
            font-size: 13px;
            line-height: 1.25;
            text-align: center;
            vertical-align: middle;
            word-break: break-word;
            overflow-wrap: anywhere;
          }
          .adv-growth-pdf-table th {
            background: #eef7f7;
            color: #005f66;
            font-weight: 700;
          }
          .adv-growth-pdf-table th.col-age,
          .adv-growth-pdf-table td.col-age {
            text-align: left;
            width: 12.5%;
          }
          .adv-growth-pdf-table th.col-weight,
          .adv-growth-pdf-table td.col-weight {
            width: 7.5%;
          }
          .adv-growth-pdf-table th.col-height,
          .adv-growth-pdf-table td.col-height {
            width: 7.5%;
          }
          .adv-growth-pdf-table th.col-centile,
          .adv-growth-pdf-table td.col-centile {
            width: 8%;
          }
          .adv-growth-pdf-table th.col-velocity,
          .adv-growth-pdf-table td.col-velocity {
            width: 10.5%;
          }
          .adv-growth-pdf-table th.col-short,
          .adv-growth-pdf-table td.col-short {
            width: 5.8%;
          }
          .adv-growth-pdf-table th.col-medium,
          .adv-growth-pdf-table td.col-medium {
            width: 7.8%;
          }
          .adv-growth-pdf-table th.col-bmi,
          .adv-growth-pdf-table td.col-bmi {
            width: 5.8%;
          }
          .adv-growth-pdf-table th.col-cole,
          .adv-growth-pdf-table td.col-cole {
            width: 7.8%;
          }
          .adv-growth-pdf-table th.col-accent,
          .adv-growth-pdf-table td.col-accent {
            background: #f5f3ff;
            color: #5b21b6;
          }
          .adv-growth-pdf-table th.col-cole span {
            display: inline-block;
            line-height: 1.1;
          }
          .adv-growth-pdf-row.is-current td {
            font-weight: 700;
          }
          .adv-growth-pdf-row.is-current td:not(.col-accent) {
            background: #f8fbfb;
          }
          .adv-growth-pdf-row.is-current td.col-age {
            color: #0f4c5c;
          }
          .adv-growth-pdf-notes {
            margin-top: 18px;
          }
          .adv-growth-pdf-footer {
            margin-top: 18px;
            font-size: 12px;
            color: #8ca0a5;
            display: flex;
            justify-content: space-between;
            gap: 12px;
            align-items: center;
          }
        </style>
        <h1 class="adv-growth-pdf-title">${advHistoryEscapeHtml(model.title)}</h1>
        <p class="adv-growth-pdf-subtitle">${advHistoryEscapeHtml(model.subtitle)}</p>
        <section class="adv-growth-pdf-summary">
          <h2 class="adv-growth-pdf-summary-title">PODSUMOWANIE RAPORTU</h2>
          <ul>${summaryItemsHtml}</ul>
        </section>
        <section class="adv-growth-pdf-table-wrap">
          <table class="adv-growth-pdf-table" aria-label="Raport punktów pomiarowych">
            <thead>
              <tr>
                <th class="col-age">Wiek</th>
                <th class="col-weight col-accent">Waga</th>
                <th class="col-centile">Centyl wagi</th>
                <th class="col-height col-accent">Wzrost</th>
                <th class="col-centile">Centyl wzrostu</th>
                <th class="col-velocity">Tempo wzrastania</th>
                <th class="col-short">hSDS</th>
                <th class="col-short">ΔhSDS</th>
                <th class="col-medium">hSDS - mpSDS</th>
                <th class="col-bmi">BMI</th>
                <th class="col-centile">Centyl BMI</th>
                <th class="col-cole"><span>Wskaźnik<br>Cole'a</span></th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </section>
        <section class="adv-growth-pdf-notes">
          <ul>${noteItemsHtml}</ul>
        </section>
        <div class="adv-growth-pdf-footer">
          <span>Wygenerowano automatycznie przez raport wzrastania - www.wagaiwzrost.pl</span>
        </div>
      </div>
    `;
  }

  async function advGrowthGeneratePdfViaCanvas(report, filename) {
    if (typeof window !== 'undefined' && typeof window.vildaEnsurePdfLibraries === 'function') { try { await window.vildaEnsurePdfLibraries(); } catch (e) {} } // PERF: lazy jsPDF/html2canvas
    vildaEnsureGlobalDependencyContract('advanced-growth-pdf', { silent: true, showUi: true, message: 'Brakuje bibliotek potrzebnych do wygenerowania raportu wzrastania PDF.' });
    const advGrowthHtml2Canvas = vildaRequireGlobalFunction('html2canvas', 'advanced-growth-pdf', { silent: true });
    const advGrowthJsPDF = vildaRequireGlobalFunction('jspdf.jsPDF', 'advanced-growth-pdf', { silent: true });
    if (!advGrowthHtml2Canvas || !advGrowthJsPDF) {
      throw new Error('Brak html2canvas lub jsPDF do wygenerowania raportu awaryjnego.');
    }

    const host = document.createElement('div');
    host.style.position = 'fixed';
    host.style.left = '-20000px';
    host.style.top = '0';
    host.style.width = '1120px';
    host.style.maxWidth = '1120px';
    host.style.pointerEvents = 'none';
    host.style.opacity = '1';
    host.style.zIndex = '-1';
    vildaAppSetTrustedHtml(host, advGrowthBuildHtmlReportMarkup(report), 'app:host');
    document.body.appendChild(host);

    try {
      await patientReportWaitForStableLayout();

      const reportNode = host.querySelector('.adv-growth-pdf-html-root') || host;
      const renderScale = patientReportResolveRenderScale(reportNode);
      const canvas = await advGrowthHtml2Canvas(reportNode, {
        scale: renderScale,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false
      });

      const exportCanvas = patientReportResizeCanvasForPdf(canvas);
      const pdf = new advGrowthJsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgData = exportCanvas.toDataURL('image/png');
      const imgWidth = pageWidth;
      const imgHeight = (exportCanvas.height * imgWidth) / exportCanvas.width;

      let heightLeft = imgHeight;
      let position = 0;
      const pdfImageCompression = (typeof PATIENT_REPORT_PDF_IMAGE_COMPRESSION !== 'undefined')
        ? PATIENT_REPORT_PDF_IMAGE_COMPRESSION
        : 'FAST';
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight, undefined, pdfImageCompression);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage('a4', 'landscape');
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight, undefined, pdfImageCompression);
        heightLeft -= pageHeight;
      }

      pdf.save(filename);
    } finally {
      if (host && host.parentNode) {
        host.parentNode.removeChild(host);
      }
    }
  }

  async function generateAdvancedGrowthPdfReport() {
    const report = advGrowthBuildReportRows();
    if (!report || !Array.isArray(report.rows) || !report.rows.length || report.historicalCount < 1) {
      showAdvancedGrowthHistoryToast('Brak historycznych punktów pomiarowych do raportu.');
      return;
    }

    const nameValue = advGrowthSanitizePdfText(document.getElementById('advName')?.value || document.getElementById('name')?.value || '');
    const safeName = (nameValue || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '');
    const filename = `Raport_wzrastania${safeName ? '_' + safeName : ''}.pdf`;

    const ready = await advGrowthEnsurePdfMake();
    if (ready && window.pdfMake && typeof window.pdfMake.createPdf === 'function') {
      const definition = advGrowthBuildPdfMakeDefinition(report);
      window.pdfMake.createPdf(definition).download(filename);
      showAdvancedGrowthHistoryToast('Raport PDF został wygenerowany.');
      return;
    }

    try {
      await advGrowthGeneratePdfViaCanvas(report, filename);
      showAdvancedGrowthHistoryToast('Raport PDF został wygenerowany.');
    } catch (error) {
      console.warn('Nie udało się wygenerować raportu PDF metodą awaryjną.', error);
      showAdvancedGrowthHistoryToast('Nie udało się uruchomić generatora PDF. Sprawdź połączenie z internetem i spróbuj ponownie.');
    }
  }

  function ensureAdvancedGrowthReportControls() {
    if (!isAdvancedGrowthMainPage()) return;
    const form = document.getElementById('advancedGrowthForm');
    const resultsEl = document.getElementById('advResults');
    const buttonsWrap = document.getElementById('advButtons');
    if (!form || !resultsEl || !buttonsWrap) return;

    let wrap = document.getElementById('advReportActions');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'advReportActions';
      wrap.className = 'adv-report-actions';
      wrap.hidden = true;
      vildaAppSetTrustedHtml(wrap, '<button type="button" id="advGenerateReportBtn">Generuj raport</button>', 'app:wrap');
      if (buttonsWrap.parentNode) {
        buttonsWrap.parentNode.insertBefore(wrap, buttonsWrap);
      }
    }

    const btn = wrap.querySelector('#advGenerateReportBtn');
    if (btn && !btn.dataset.wired) {
      btn.dataset.wired = 'true';
      btn.addEventListener('click', async function (event) {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        if (btn.dataset.busy === 'true') return;
        const originalLabel = btn.textContent;
        btn.dataset.busy = 'true';
        btn.disabled = true;
        btn.textContent = 'Przygotowywanie raportu…';
        try {
          await generateAdvancedGrowthPdfReport();
        } finally {
          btn.dataset.busy = 'false';
          btn.textContent = originalLabel;
          updateAdvancedGrowthReportButtonVisibility();
        }
      });
    }

    updateAdvancedGrowthReportButtonVisibility();
  }

  function removeAdvancedGrowthClearButton() {
    const clearBtn = document.getElementById('advClearBtn');
    if (clearBtn && clearBtn.parentNode) {
      clearBtn.parentNode.removeChild(clearBtn);
    }
  }

  function updateAdvancedGrowthReportButtonVisibility(forceHide) {
    const wrap = document.getElementById('advReportActions');
    const btn = document.getElementById('advGenerateReportBtn');
    if (!wrap || !btn) return;
    if (forceHide || !isAdvancedGrowthMainPage()) {
      wrap.hidden = true;
      btn.disabled = true;
      return;
    }

    const historicalCount = advGrowthCollectHistoricalPointsForReport().length;
    const visible = historicalCount >= 1;
    wrap.hidden = !visible;
    btn.disabled = !visible;
  }


  function requireGlobalObject(path, moduleName, options) {
    const opts = options || {};
    const fn = getFunction('vildaRequireGlobalObject');
    if (fn) {
      try {
        return fn(path, moduleName, opts);
      } catch (error) {
        logSwallowed('vilda_advanced_growth:requireGlobalObject', error, { path, moduleName: moduleName || 'vilda_advanced_growth' });
      }
    }
    const value = resolveGlobalPath(path);
    if (value && typeof value === 'object') return value;
    return Object.prototype.hasOwnProperty.call(opts, 'fallback') ? opts.fallback : null;
  }

  function requireGlobalFunction(path, moduleName, options) {
    const opts = options || {};
    const fn = getFunction('vildaRequireGlobalFunction');
    if (fn) {
      try {
        return fn(path, moduleName, opts);
      } catch (error) {
        logSwallowed('vilda_advanced_growth:requireGlobalFunction', error, { path, moduleName: moduleName || 'vilda_advanced_growth' });
      }
    }
    const value = resolveGlobalPath(path);
    if (typeof value === 'function') return value;
    return Object.prototype.hasOwnProperty.call(opts, 'fallback') ? opts.fallback : null;
  }

  function resolveGlobalPath(path) {
    try {
      const parts = String(path || '').split('.').filter(Boolean);
      let cursor = global;
      for (const part of parts) {
        if (!cursor || !Object.prototype.hasOwnProperty.call(cursor, part)) return null;
        cursor = cursor[part];
      }
      return cursor;
    } catch (_) {
      return null;
    }
  }

function bayleyPinneauRoundHalfUp(value, digits = 1) {
  if (typeof value !== 'number' || !isFinite(value)) return null;
  const factor = Math.pow(10, digits);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function bayleyPinneauNormalizeSexKey(sex) {
  const raw = String(sex || '').trim().toUpperCase();
  if (raw === 'M') return 'boys';
  if (raw === 'F') return 'girls';
  return null;
}

function bayleyPinneauSexLabel(sexKey) {
  if (sexKey === 'boys') return 'chłopców';
  if (sexKey === 'girls') return 'dziewcząt';
  return '';
}

function bayleyPinneauGroupLabel(groupKey) {
  if (groupKey === 'accelerated') return 'przyspieszonej';
  if (groupKey === 'retarded') return 'opóźnionej';
  return 'średniej';
}

function bayleyPinneauGroupNominativeLabel(groupKey) {
  if (groupKey === 'accelerated') return 'przyspieszona';
  if (groupKey === 'retarded') return 'opóźniona';
  return 'średnia';
}

function bayleyPinneauGroupReasonText(groupKey, deltaMonths) {
  if (typeof deltaMonths !== 'number' || !isFinite(deltaMonths)) return '';
  if (groupKey === 'accelerated') {
    return `wiek kostny wyprzedza wiek metrykalny o ${bayleyPinneauFormatMonthDistance(deltaMonths)}, dlatego użyto grupy przyspieszonej`;
  }
  if (groupKey === 'retarded') {
    return `wiek kostny jest opóźniony względem wieku metrykalnego o ${bayleyPinneauFormatMonthDistance(deltaMonths)}, dlatego użyto grupy opóźnionej`;
  }
  return 'wiek kostny mieści się w granicach ±12 miesięcy od wieku metrykalnego, dlatego użyto grupy średniej';
}

function bayleyPinneauLabelToMonths(label) {
  const match = /^\s*(\d+)\-(\d+)\s*$/.exec(String(label || ''));
  if (!match) return null;
  const years = parseInt(match[1], 10);
  const months = parseInt(match[2], 10);
  if (!isFinite(years) || !isFinite(months)) return null;
  return years * 12 + months;
}

function bayleyPinneauDetermineGroupKey(deltaMonths) {
  if (typeof deltaMonths !== 'number' || !isFinite(deltaMonths)) return null;
  if (deltaMonths >= 12) return 'accelerated';
  if (deltaMonths <= -12) return 'retarded';
  return 'average';
}

function bayleyPinneauFormatMonthDistance(months) {
  const total = Math.abs(Math.round(Number(months) || 0));
  const years = Math.floor(total / 12);
  const remainingMonths = total % 12;
  const parts = [];

  if (years > 0) {
    let yearWord = 'lat';
    if (years === 1) yearWord = 'rok';
    else if (years % 10 >= 2 && years % 10 <= 4 && (years % 100 < 10 || years % 100 >= 20)) yearWord = 'lata';
    parts.push(`${years} ${yearWord}`);
  }

  if (remainingMonths > 0 || !parts.length) {
    parts.push(`${remainingMonths} mies.`);
  }

  return parts.join(' ');
}


function bayleyPinneauFormatAgeLabel(totalMonths) {
  if (!Number.isFinite(totalMonths)) return '';
  const value = Math.max(0, Math.round(Number(totalMonths) || 0));
  return `${Math.floor(value / 12)}-${value % 12}`;
}

function bayleyPinneauErrorSampleLabel(sampleKey) {
  if (sampleKey === 'validatingSample') return 'próba walidacyjna Berkeley';
  if (sampleKey === 'standardizationSample') return 'próba standaryzacyjna Guidance Study';
  return '';
}

function bayleyPinneauInterpolateErrorStats(rows, targetAgeMonths, sampleKey = 'validatingSample') {
  if (!Array.isArray(rows) || !rows.length || !Number.isFinite(targetAgeMonths)) return null;

  const usableRows = rows
    .map((row) => {
      const ageMonthsTotal = Number(row?.ageMonthsTotal);
      const sample = row && typeof row === 'object' ? row[sampleKey] : null;
      const meanErrorCm = Number(sample?.meanErrorCm);
      const sdErrorCm = Number(sample?.sdErrorCm);
      const meanErrorInches = Number(sample?.meanErrorInches);
      const sdErrorInches = Number(sample?.sdErrorInches);
      if (!Number.isFinite(ageMonthsTotal) || !Number.isFinite(meanErrorCm) || !Number.isFinite(sdErrorCm)) {
        return null;
      }
      return {
        ageMonthsTotal,
        ageLabel: row?.ageLabel || bayleyPinneauFormatAgeLabel(ageMonthsTotal),
        tableId: row?.tableId || null,
        sourceImage: row?.sourceImage || null,
        sample: {
          cases: Number(sample?.cases),
          meanErrorCm,
          sdErrorCm,
          meanErrorInches: Number.isFinite(meanErrorInches) ? meanErrorInches : null,
          sdErrorInches: Number.isFinite(sdErrorInches) ? sdErrorInches : null
        }
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.ageMonthsTotal - b.ageMonthsTotal);

  if (!usableRows.length) return null;

  const minRow = usableRows[0];
  const maxRow = usableRows[usableRows.length - 1];
  if (targetAgeMonths < minRow.ageMonthsTotal || targetAgeMonths > maxRow.ageMonthsTotal) {
    return {
      ok: false,
      reason: 'out-of-range',
      sampleKey,
      minRow,
      maxRow
    };
  }

  for (const row of usableRows) {
    if (row.ageMonthsTotal === targetAgeMonths) {
      return {
        ok: true,
        sampleKey,
        interpolated: false,
        interpolationRatio: 0,
        lowerRow: row,
        upperRow: row,
        values: {
          meanErrorCm: row.sample.meanErrorCm,
          sdErrorCm: row.sample.sdErrorCm,
          meanErrorInches: row.sample.meanErrorInches,
          sdErrorInches: row.sample.sdErrorInches
        }
      };
    }
  }

  let lowerRow = minRow;
  let upperRow = maxRow;
  for (let i = 1; i < usableRows.length; i += 1) {
    const currentRow = usableRows[i];
    if (targetAgeMonths < currentRow.ageMonthsTotal) {
      lowerRow = usableRows[i - 1];
      upperRow = currentRow;
      break;
    }
  }

  const span = upperRow.ageMonthsTotal - lowerRow.ageMonthsTotal;
  if (!Number.isFinite(span) || span <= 0) {
    return {
      ok: false,
      reason: 'invalid-span',
      sampleKey,
      minRow,
      maxRow
    };
  }

  const ratio = (targetAgeMonths - lowerRow.ageMonthsTotal) / span;
  const interpolate = (a, b) => a + ((b - a) * ratio);

  return {
    ok: true,
    sampleKey,
    interpolated: true,
    interpolationRatio: ratio,
    lowerRow,
    upperRow,
    values: {
      meanErrorCm: interpolate(lowerRow.sample.meanErrorCm, upperRow.sample.meanErrorCm),
      sdErrorCm: interpolate(lowerRow.sample.sdErrorCm, upperRow.sample.sdErrorCm),
      meanErrorInches: (
        Number.isFinite(lowerRow.sample.meanErrorInches) && Number.isFinite(upperRow.sample.meanErrorInches)
      ) ? interpolate(lowerRow.sample.meanErrorInches, upperRow.sample.meanErrorInches) : null,
      sdErrorInches: (
        Number.isFinite(lowerRow.sample.sdErrorInches) && Number.isFinite(upperRow.sample.sdErrorInches)
      ) ? interpolate(lowerRow.sample.sdErrorInches, upperRow.sample.sdErrorInches) : null
    }
  };
}

function bayleyPinneauBuildPortabilityWarningText(result) {
  const deltaMonths = Number(result?.deltaMonths);
  if (!Number.isFinite(deltaMonths) || Math.abs(deltaMonths) < 24) return '';
  return 'Uwaga: wiek kostny różni się od metrykalnego o co najmniej 24 mies. Tabele błędu Bayley-Pinneau pochodzą z ogólnej zdrowej populacji Berkeley i nie były osobno kalibrowane dla tak nasilonego przyspieszenia lub opóźnienia dojrzewania, dlatego ten przybliżony błąd należy interpretować ostrożnie.';
}

function bayleyPinneauResolvePrintedSegment(groupData, boneAgeMonths) {
  if (!groupData || !Array.isArray(groupData.printedSegments)) return null;
  for (const segment of groupData.printedSegments) {
    const startM = bayleyPinneauLabelToMonths(segment?.boneAgeLabelRange?.start);
    const endM = bayleyPinneauLabelToMonths(segment?.boneAgeLabelRange?.end);
    if (typeof startM === 'number' && typeof endM === 'number' && boneAgeMonths >= startM && boneAgeMonths <= endM) {
      return segment;
    }
  }
  return null;
}

function bayleyPinneauSelectNearestFactor(factors, boneAgeMonths) {
  if (!Array.isArray(factors) || !factors.length || typeof boneAgeMonths !== 'number' || !isFinite(boneAgeMonths)) {
    return null;
  }
  const minFactor = factors[0];
  const maxFactor = factors[factors.length - 1];
  if (boneAgeMonths < minFactor.boneAgeMonths || boneAgeMonths > maxFactor.boneAgeMonths) {
    return {
      ok: false,
      reason: 'out-of-range',
      minFactor,
      maxFactor
    };
  }

  let bestFactor = minFactor;
  let bestDiff = Math.abs(boneAgeMonths - minFactor.boneAgeMonths);
  for (let i = 1; i < factors.length; i += 1) {
    const factor = factors[i];
    const diff = Math.abs(boneAgeMonths - factor.boneAgeMonths);
    if (diff < bestDiff) {
      bestFactor = factor;
      bestDiff = diff;
    }
  }

  return {
    ok: true,
    factor: bestFactor,
    snapped: bestFactor.boneAgeMonths !== boneAgeMonths,
    diffMonths: bestDiff,
    minFactor,
    maxFactor
  };
}


function calculateBayleyPinneauPrediction(params) {
  const dataRoot = requireGlobalObject('bayleyPinneauData', 'advanced-growth-bayley-pinneau', { silent: true });

  if (!dataRoot || !dataRoot.groups) {
    return {
      available: false,
      reason: 'missing-dataset',
      message: 'Nie udało się wczytać danych tabel Bayley-Pinneau.'
    };
  }

  const chronologicalAgeYears = Number(params?.chronologicalAgeYears);
  const chronologicalAgeMonths = Number.isFinite(Number(params?.chronologicalAgeMonths))
    ? Math.round(Number(params.chronologicalAgeMonths))
    : (Number.isFinite(chronologicalAgeYears) ? Math.round(chronologicalAgeYears * 12) : null);
  const boneAgeYears = Number(params?.boneAgeYears);
  const currentHeightCm = Number(params?.currentHeightCm);
  const sexKey = bayleyPinneauNormalizeSexKey(params?.sex);

  if (!sexKey) {
    return {
      available: false,
      reason: 'missing-sex',
      message: 'Nie udało się określić płci potrzebnej do doboru tabel Bayley-Pinneau.'
    };
  }
  if (!Number.isFinite(chronologicalAgeMonths) || chronologicalAgeMonths < 0) {
    return {
      available: false,
      reason: 'missing-chronological-age',
      message: 'Aby obliczyć prognozę metodą Bayley-Pinneau, uzupełnij aktualny wiek metrykalny.'
    };
  }
  const missingHeight = (!Number.isFinite(currentHeightCm) || currentHeightCm <= 0);
  const missingBoneAge = (!Number.isFinite(boneAgeYears) || boneAgeYears <= 0);
  if (missingHeight || missingBoneAge) {
    let reason = 'missing-input';
    let message = 'Aby obliczyć prognozę wzrostu ostatecznego metodą Bayley-Pinneau, uzupełnij aktualny wzrost i wiek kostny.';
    if (missingHeight && !missingBoneAge) {
      reason = 'missing-height';
      message = 'Aby obliczyć prognozę wzrostu ostatecznego metodą Bayley-Pinneau, uzupełnij aktualny wzrost w karcie Dane użytkownika.';
    } else if (!missingHeight && missingBoneAge) {
      reason = 'missing-bone-age';
      message = 'Prognoza wzrostu ostatecznego metodą Bayley-Pinneau pojawi się po wpisaniu aktualnego wieku kostnego.';
    }
    return {
      available: false,
      reason,
      message
    };
  }

  const requestedBoneAgeMonths = Math.round(boneAgeYears * 12);
  const deltaMonths = requestedBoneAgeMonths - chronologicalAgeMonths;
  const groupKey = bayleyPinneauDetermineGroupKey(deltaMonths);
  const sexData = dataRoot.groups[sexKey];
  const groupData = sexData ? sexData[groupKey] : null;

  if (!groupData || !Array.isArray(groupData.factors) || !groupData.factors.length) {
    return {
      available: false,
      reason: 'missing-group-data',
      message: 'Dla tej kombinacji płci i wieku kostnego nie znaleziono danych Bayley-Pinneau.'
    };
  }

  const factorSelection = bayleyPinneauSelectNearestFactor(groupData.factors, requestedBoneAgeMonths);
  if (!factorSelection || factorSelection.ok !== true) {
    const minLabel = factorSelection?.minFactor?.boneAgeLabel || groupData?.factors?.[0]?.boneAgeLabel || '—';
    const maxLabel = factorSelection?.maxFactor?.boneAgeLabel || groupData?.factors?.[groupData.factors.length - 1]?.boneAgeLabel || '—';
    return {
      available: false,
      reason: 'out-of-range',
      sexKey,
      sexLabel: bayleyPinneauSexLabel(sexKey),
      groupKey,
      groupLabel: bayleyPinneauGroupNominativeLabel(groupKey),
      chronologicalAgeMonths,
      chronologicalAgeYears: chronologicalAgeMonths / 12,
      requestedBoneAgeYears: boneAgeYears,
      requestedBoneAgeMonths,
      deltaMonths,
      range: {
        minLabel,
        maxLabel,
        minMonths: factorSelection?.minFactor?.boneAgeMonths ?? null,
        maxMonths: factorSelection?.maxFactor?.boneAgeMonths ?? null
      },
      message: `Metoda Bayley-Pinneau nie zawiera odpowiedniej tabeli dla ${bayleyPinneauSexLabel(sexKey)} z grupy ${bayleyPinneauGroupLabel(groupKey)} przy wieku kostnym ${advHistoryFormatNumber(boneAgeYears, 1)} lat. Zakres dostępny dla tej grupy to ${minLabel}–${maxLabel}.`
    };
  }

  const factor = factorSelection.factor;
  const fraction = Number(factor.fractionMatureHeight);
  if (!Number.isFinite(fraction) || fraction <= 0) {
    return {
      available: false,
      reason: 'invalid-factor',
      message: 'W danych Bayley-Pinneau brakuje prawidłowego współczynnika do obliczenia wyniku.'
    };
  }

  const predictedAdultHeightCmRawUncorrected = currentHeightCm / fraction;

  const errorModelMeta = dataRoot?.meta?.errorModel || null;
  const errorSampleKey = String(errorModelMeta?.defaultSampleKey || 'validatingSample');
  const errorRows = Array.isArray(dataRoot?.predictionErrorTables?.[sexKey])
    ? dataRoot.predictionErrorTables[sexKey]
    : [];
  const usableErrorRows = errorRows
    .filter((row) => {
      const sample = row && typeof row === 'object' ? row[errorSampleKey] : null;
      return Number.isFinite(Number(row?.ageMonthsTotal))
        && Number.isFinite(Number(sample?.meanErrorCm))
        && Number.isFinite(Number(sample?.sdErrorCm));
    })
    .sort((a, b) => Number(a.ageMonthsTotal) - Number(b.ageMonthsTotal));

  const errorModelMinAgeMonths = usableErrorRows.length ? Number(usableErrorRows[0].ageMonthsTotal) : null;
  const errorModelMaxAgeMonths = usableErrorRows.length ? Number(usableErrorRows[usableErrorRows.length - 1].ageMonthsTotal) : null;
  const errorModelEligibleByAge = Number.isFinite(errorModelMinAgeMonths) && chronologicalAgeMonths >= errorModelMinAgeMonths;
  const errorCoveragePercent = Number.isFinite(Number(errorModelMeta?.coveragePercent))
    ? Number(errorModelMeta.coveragePercent)
    : 90;
  const errorNormalApproximationZ = Number.isFinite(Number(errorModelMeta?.normalApproximationZ))
    ? Number(errorModelMeta.normalApproximationZ)
    : 1.645;

  let predictedAdultHeightCmRaw = predictedAdultHeightCmRawUncorrected;
  let meanErrorCorrectionCmRaw = null;
  let errorSdCmRaw = null;
  let errorBoundHalfWidthCmRaw = null;
  let predictionIntervalLowerCmRaw = null;
  let predictionIntervalUpperCmRaw = null;
  let errorSelection = null;
  let errorModelUnavailableReason = null;

  if (!usableErrorRows.length) {
    errorModelUnavailableReason = 'missing-error-dataset';
  } else if (Number.isFinite(errorModelMinAgeMonths) && chronologicalAgeMonths < errorModelMinAgeMonths) {
    errorModelUnavailableReason = 'below-min-age';
  } else if (Number.isFinite(errorModelMaxAgeMonths) && chronologicalAgeMonths > errorModelMaxAgeMonths) {
    errorModelUnavailableReason = 'above-max-age';
  } else {
    errorSelection = bayleyPinneauInterpolateErrorStats(errorRows, chronologicalAgeMonths, errorSampleKey);
    if (errorSelection && errorSelection.ok === true) {
      meanErrorCorrectionCmRaw = Number(errorSelection.values?.meanErrorCm);
      errorSdCmRaw = Number(errorSelection.values?.sdErrorCm);
      if (Number.isFinite(meanErrorCorrectionCmRaw)) {
        predictedAdultHeightCmRaw = predictedAdultHeightCmRawUncorrected + meanErrorCorrectionCmRaw;
      }
      if (Number.isFinite(errorSdCmRaw) && errorSdCmRaw >= 0) {
        errorBoundHalfWidthCmRaw = errorSdCmRaw * errorNormalApproximationZ;
        predictionIntervalLowerCmRaw = predictedAdultHeightCmRaw - errorBoundHalfWidthCmRaw;
        predictionIntervalUpperCmRaw = predictedAdultHeightCmRaw + errorBoundHalfWidthCmRaw;
      }
    } else {
      errorModelUnavailableReason = errorSelection?.reason || 'missing-error-data';
    }
  }

  const predictedAdultHeightCm = bayleyPinneauRoundHalfUp(predictedAdultHeightCmRaw, 1);
  const predictedAdultHeightCmUncorrected = bayleyPinneauRoundHalfUp(predictedAdultHeightCmRawUncorrected, 1);
  const remainingGrowthCm = bayleyPinneauRoundHalfUp(predictedAdultHeightCm - currentHeightCm, 1);
  const segment = bayleyPinneauResolvePrintedSegment(groupData, factor.boneAgeMonths);
  const requestedBoneAgeRoundedYears = bayleyPinneauRoundHalfUp(requestedBoneAgeMonths / 12, 2);
  const usedBoneAgeYears = bayleyPinneauRoundHalfUp(factor.boneAgeMonths / 12, 2);
  const hasErrorInterval = Number.isFinite(errorBoundHalfWidthCmRaw);
  const hasBiasCorrection = Number.isFinite(meanErrorCorrectionCmRaw);

  const baseResult = {
    available: true,
    method: 'Bayley-Pinneau',
    sexKey,
    sexLabel: bayleyPinneauSexLabel(sexKey),
    groupKey,
    groupLabel: bayleyPinneauGroupNominativeLabel(groupKey),
    groupReasonText: bayleyPinneauGroupReasonText(groupKey, deltaMonths),
    chronologicalAgeMonths,
    chronologicalAgeYears: bayleyPinneauRoundHalfUp(chronologicalAgeMonths / 12, 2),
    currentHeightCm: bayleyPinneauRoundHalfUp(currentHeightCm, 1),
    requestedBoneAgeYears: bayleyPinneauRoundHalfUp(boneAgeYears, 2),
    requestedBoneAgeRoundedYears,
    requestedBoneAgeMonths,
    requestedBoneAgeLabel: `${Math.floor(requestedBoneAgeMonths / 12)}-${String(requestedBoneAgeMonths % 12).padStart(1, '0')}`,
    usedBoneAgeYears,
    usedBoneAgeMonths: factor.boneAgeMonths,
    usedBoneAgeLabel: factor.boneAgeLabel,
    snappedToNearestNode: !!factorSelection.snapped,
    snappedDiffMonths: factorSelection.diffMonths,
    percentMatureHeight: Number(factor.percentMatureHeight),
    fractionMatureHeight: fraction,
    predictedAdultHeightCm,
    predictedAdultHeightCmUncorrected,
    remainingGrowthCm,
    deltaMonths,
    tableId: segment?.tableId || null,
    tableTitle: segment?.title || null,
    sourceImage: segment?.sourceImage || null,
    hasBiasCorrection,
    meanErrorCorrectionCmRaw: Number.isFinite(meanErrorCorrectionCmRaw) ? meanErrorCorrectionCmRaw : null,
    meanErrorCorrectionCm: Number.isFinite(meanErrorCorrectionCmRaw) ? bayleyPinneauRoundHalfUp(meanErrorCorrectionCmRaw, 2) : null,
    errorSdCmRaw: Number.isFinite(errorSdCmRaw) ? errorSdCmRaw : null,
    errorSdCm: Number.isFinite(errorSdCmRaw) ? bayleyPinneauRoundHalfUp(errorSdCmRaw, 2) : null,
    hasErrorInterval,
    errorBoundHalfWidthCmRaw: Number.isFinite(errorBoundHalfWidthCmRaw) ? errorBoundHalfWidthCmRaw : null,
    errorBoundHalfWidthCm: Number.isFinite(errorBoundHalfWidthCmRaw) ? bayleyPinneauRoundHalfUp(errorBoundHalfWidthCmRaw, 1) : null,
    predictionIntervalLowerCm: Number.isFinite(predictionIntervalLowerCmRaw) ? bayleyPinneauRoundHalfUp(predictionIntervalLowerCmRaw, 1) : null,
    predictionIntervalUpperCm: Number.isFinite(predictionIntervalUpperCmRaw) ? bayleyPinneauRoundHalfUp(predictionIntervalUpperCmRaw, 1) : null,
    errorBoundsCoveragePercent: errorCoveragePercent,
    errorBoundsSampleKey: errorSampleKey,
    errorBoundsSampleLabel: bayleyPinneauErrorSampleLabel(errorSampleKey) || String(errorModelMeta?.defaultSampleLabel || '').trim(),
    errorBoundsInterpolatedByAge: !!(errorSelection && errorSelection.ok === true && errorSelection.interpolated === true),
    errorBoundsAgeNodeLowerLabel: errorSelection?.lowerRow?.ageLabel || null,
    errorBoundsAgeNodeUpperLabel: errorSelection?.upperRow?.ageLabel || null,
    errorBoundsAgeNodeLowerMonths: Number.isFinite(Number(errorSelection?.lowerRow?.ageMonthsTotal)) ? Number(errorSelection.lowerRow.ageMonthsTotal) : null,
    errorBoundsAgeNodeUpperMonths: Number.isFinite(Number(errorSelection?.upperRow?.ageMonthsTotal)) ? Number(errorSelection.upperRow.ageMonthsTotal) : null,
    errorBoundsSourceTableId: errorSelection?.lowerRow?.tableId || null,
    errorBoundsSourceImage: errorSelection?.lowerRow?.sourceImage || null,
    errorModelEligibleByAge,
    errorModelUnavailableReason,
    errorModelMinAgeMonths: Number.isFinite(errorModelMinAgeMonths) ? errorModelMinAgeMonths : null,
    errorModelMinAgeLabel: Number.isFinite(errorModelMinAgeMonths) ? bayleyPinneauFormatAgeLabel(errorModelMinAgeMonths) : null,
    errorModelMaxAgeMonths: Number.isFinite(errorModelMaxAgeMonths) ? errorModelMaxAgeMonths : null,
    errorModelMaxAgeLabel: Number.isFinite(errorModelMaxAgeMonths) ? bayleyPinneauFormatAgeLabel(errorModelMaxAgeMonths) : null,
    errorModelApproximate: true
  };

  const portabilityWarningText = bayleyPinneauBuildPortabilityWarningText(baseResult);

  return {
    ...baseResult,
    portabilityWarningText: portabilityWarningText || '',
    hasPortabilityWarning: !!portabilityWarningText
  };
}

function buildAdvancedGrowthDetailsToggleHtml(detailsId, detailsHtml, options) {
  const safeDetailsId = String(detailsId || '').trim();
  const normalizedDetailsHtml = String(detailsHtml || '').trim();
  if (!safeDetailsId || !normalizedDetailsHtml) return '';

  const collapsedLabel = String(options?.collapsedLabel || 'Szczegóły').trim() || 'Szczegóły';
  const expandedLabel = String(options?.expandedLabel || 'Ukryj szczegóły').trim() || 'Ukryj szczegóły';

  return `
    <div class="adv-growth-result-details">
      <button
        type="button"
        class="patient-report-summary-btn adv-growth-result-details-btn"
        data-adv-growth-details-toggle
        data-collapsed-label="${advHistoryEscapeHtml(collapsedLabel)}"
        data-expanded-label="${advHistoryEscapeHtml(expandedLabel)}"
        aria-expanded="false"
        aria-controls="${advHistoryEscapeHtml(safeDetailsId)}">
        ${advHistoryEscapeHtml(collapsedLabel)}
      </button>
      <div id="${advHistoryEscapeHtml(safeDetailsId)}" class="adv-growth-result-details-panel" hidden aria-hidden="true">
        ${normalizedDetailsHtml}
      </div>
    </div>`;
}

function initAdvancedGrowthResultDetailsToggles(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  const buttons = root.querySelectorAll('[data-adv-growth-details-toggle]');
  buttons.forEach((btn) => {
    if (!btn || btn.dataset.advGrowthDetailsBound === 'true') return;
    btn.dataset.advGrowthDetailsBound = 'true';
    btn.addEventListener('click', () => {
      const panelId = btn.getAttribute('aria-controls');
      const panel = panelId ? document.getElementById(panelId) : null;
      if (!panel) return;

      const isExpanded = btn.getAttribute('aria-expanded') === 'true';
      const nextExpanded = !isExpanded;
      const collapsedLabel = String(btn.dataset.collapsedLabel || 'Szczegóły').trim() || 'Szczegóły';
      const expandedLabel = String(btn.dataset.expandedLabel || 'Ukryj szczegóły').trim() || 'Ukryj szczegóły';

      btn.setAttribute('aria-expanded', nextExpanded ? 'true' : 'false');
      btn.textContent = nextExpanded ? expandedLabel : collapsedLabel;
      panel.hidden = !nextExpanded;
      panel.setAttribute('aria-hidden', nextExpanded ? 'false' : 'true');
    });
  });
}



const ADV_GROWTH_PREDICTION_GLOBAL_DISCLAIMER_TEXT = 'Metody prognozowania wzrostu ostatecznego są przeznaczone dla dzieci zdrowych i nieleczonych. W przypadku chorób przewlekłych, zaburzeń endokrynologicznych lub leczenia wpływającego na wzrastanie wynik należy interpretować ostrożnie.';

function advGrowthPredictionReliabilityLabel(levelKey) {
  switch (String(levelKey || '')) {
    case 'high':
      return 'wysoka';
    case 'moderate':
      return 'umiarkowana';
    case 'lowered':
      return 'obniżona';
    case 'low':
      return 'niska';
    case 'indicative':
      return 'orientacyjna';
    default:
      return 'nieokreślona';
  }
}

function advGrowthPredictionReliabilitySeverity(levelKey) {
  switch (String(levelKey || '')) {
    case 'high':
      return 0;
    case 'moderate':
      return 1;
    case 'lowered':
      return 2;
    case 'low':
      return 3;
    case 'indicative':
      return 2;
    default:
      return 2;
  }
}

function advGrowthPredictionReliabilityLevelFromSeverity(severity) {
  const numericSeverity = Number.isFinite(Number(severity)) ? Number(severity) : 2;
  if (numericSeverity <= 0.5) return 'high';
  if (numericSeverity <= 1.5) return 'moderate';
  if (numericSeverity <= 2.5) return 'lowered';
  return 'low';
}

function advGrowthDowngradeReliabilityLevel(levelKey, steps = 1) {
  const normalized = String(levelKey || 'indicative');
  if (normalized === 'indicative') return 'indicative';
  const order = ['high', 'moderate', 'lowered', 'low'];
  const startIndex = Math.max(0, order.indexOf(normalized));
  const safeSteps = Math.max(0, Math.round(Number(steps) || 0));
  return order[Math.min(order.length - 1, startIndex + safeSteps)] || 'low';
}

function advGrowthFormatReasonList(items) {
  const cleaned = Array.from(new Set((items || [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)));
  if (!cleaned.length) return '';
  if (cleaned.length === 1) return cleaned[0];
  if (cleaned.length === 2) return `${cleaned[0]} oraz ${cleaned[1]}`;
  return `${cleaned.slice(0, -1).join(', ')} oraz ${cleaned[cleaned.length - 1]}`;
}

function advGrowthBuildReliabilityBadgeHtml(levelKey) {
  const normalized = String(levelKey || 'indicative').trim() || 'indicative';
  return `<span class="adv-growth-reliability-badge is-${advHistoryEscapeHtml(normalized)}">${advHistoryEscapeHtml(advGrowthPredictionReliabilityLabel(normalized))}</span>`;
}

function advGrowthAssessBayleyPinneauReliability(result, profileModel) {
  if (!result || typeof result !== 'object' || result.available !== true) return null;

  const reasons = [];
  const halfWidth = Number(result.errorBoundHalfWidthCm);
  let levelKey = 'indicative';

  if (Number.isFinite(halfWidth)) {
    if (halfWidth <= 3.5) levelKey = 'high';
    else if (halfWidth <= 4.8) levelKey = 'moderate';
    else if (halfWidth <= 6.0) levelKey = 'lowered';
    else levelKey = 'low';
    reasons.push(`dostępnej szerokości przybliżonego błędu metody (±${advHistoryFormatNumber(halfWidth, 1)} cm)`);
  } else if (result.errorModelUnavailableReason === 'below-min-age' && result.errorModelMinAgeLabel) {
    reasons.push(`braku oryginalnych tabel błędu Bayley-Pinneau poniżej ${result.errorModelMinAgeLabel} lat`);
  } else if (result.errorModelUnavailableReason === 'above-max-age' && result.errorModelMaxAgeLabel) {
    reasons.push(`braku oryginalnych tabel błędu Bayley-Pinneau powyżej ${result.errorModelMaxAgeLabel} lat`);
  } else {
    reasons.push('braku ilościowej oceny błędu dla tego wieku metrykalnego');
  }

  const deltaMonths = Number(result.deltaMonths);
  if (Number.isFinite(deltaMonths) && Math.abs(deltaMonths) >= 24) {
    if (levelKey !== 'indicative') {
      levelKey = advGrowthDowngradeReliabilityLevel(levelKey, 1);
    }
    reasons.push(`dużej rozbieżności wieku kostnego i metrykalnego (${bayleyPinneauFormatMonthDistance(deltaMonths)})`);
  }

  if (profileModel && profileModel.shouldDowngradeBayleyInReliability) {
    if (levelKey !== 'indicative') {
      levelKey = advGrowthDowngradeReliabilityLevel(levelKey, 1);
    }
    reasons.push('profilu KOWD-like, w którym Bayley-Pinneau może zawyżać przy większym opóźnieniu wieku kostnego');
  } else if (profileModel && profileModel.isOutOfScope) {
    if (levelKey !== 'indicative') {
      levelKey = advGrowthDowngradeReliabilityLevel(levelKey, 1);
    }
    reasons.push('wyjścia poza populację dzieci zdrowych i nieleczonych');
  }

  return {
    methodKey: 'bayleyPinneau',
    methodLabel: 'Bayley-Pinneau',
    levelKey,
    label: advGrowthPredictionReliabilityLabel(levelKey),
    reasons,
    reasonText: advGrowthFormatReasonList(reasons)
  };
}

function advGrowthAssessRWTReliability(result, profileModel) {
  if (!result || typeof result !== 'object' || result.available !== true) return null;

  const reasons = [];
  const halfWidth = Number(result.errorBoundHalfWidthCm);
  let levelKey = 'indicative';

  if (Number.isFinite(halfWidth)) {
    if (halfWidth <= 4.4) levelKey = 'high';
    else if (halfWidth <= 5.6) levelKey = 'moderate';
    else if (halfWidth <= 6.6) levelKey = 'lowered';
    else levelKey = 'low';
    reasons.push(`dostępnej szerokości przybliżonego błędu metody (±${advHistoryFormatNumber(halfWidth, 1)} cm)`);
  } else {
    reasons.push('braku ilościowej oceny błędu dla tego wieku metrykalnego');
  }

  if (result.usedChronologicalAgeAsSkeletalAge === true) {
    if (levelKey !== 'indicative') {
      levelKey = advGrowthDowngradeReliabilityLevel(levelKey, 1);
    }
    reasons.push('zastąpienia wieku kostnego wiekiem metrykalnym');
  }

  const enteredBoneAgeYears = Number(result.enteredBoneAgeYears);
  const chronologicalAgeMonths = Number(result.chronologicalAgeMonths);
  if (Number.isFinite(enteredBoneAgeYears) && Number.isFinite(chronologicalAgeMonths)) {
    const deltaMonths = Math.round(enteredBoneAgeYears * 12) - chronologicalAgeMonths;
    if (Math.abs(deltaMonths) >= 24) {
      if (levelKey !== 'indicative') {
        levelKey = advGrowthDowngradeReliabilityLevel(levelKey, 1);
      }
      reasons.push(`dużej rozbieżności wieku kostnego i metrykalnego (${bayleyPinneauFormatMonthDistance(deltaMonths)})`);
    }
  }

  if (profileModel && profileModel.shouldPreferRwt) {
    reasons.push('preferencji tej metody w profilu KOWD-like / CDGP-like');
  }
  if (profileModel && profileModel.isOutOfScope) {
    if (levelKey !== 'indicative') {
      levelKey = advGrowthDowngradeReliabilityLevel(levelKey, 1);
    }
    reasons.push('wyjścia poza populację dzieci zdrowych i nieleczonych');
  }

  return {
    methodKey: 'rwt',
    methodLabel: 'RWT',
    levelKey,
    label: advGrowthPredictionReliabilityLabel(levelKey),
    reasons,
    reasonText: advGrowthFormatReasonList(reasons)
  };
}

function advGrowthBuildPredictionReliabilityModel(params) {
  const profileModel = params?.profileModel || null;
  const bpReliability = advGrowthAssessBayleyPinneauReliability(params?.bayleyPinneau, profileModel);
  const rwtReliability = advGrowthAssessRWTReliability(params?.rwt, profileModel);
  const assessReinehrReliability = requireGlobalFunction('advGrowthAssessReinehrCdgpReliability', 'advanced-growth-reinehr', { silent: true });
  const reinehrReliability = assessReinehrReliability
    ? assessReinehrReliability(params?.reinehr, profileModel)
    : null;
  const entries = [bpReliability, rwtReliability, reinehrReliability].filter(Boolean);
  if (!entries.length) return null;

  const entryMap = Object.create(null);
  entries.forEach((entry) => {
    entryMap[entry.methodKey] = entry;
  });

  let overallLevelKey = entries[0].levelKey;
  let agreementLabel = '';
  let agreementDiffCm = null;
  const allIndicative = entries.every((entry) => entry.levelKey === 'indicative');

  const availablePredictions = [
    { key: 'bayleyPinneau', value: Number(params?.bayleyPinneau?.predictedAdultHeightCm) },
    { key: 'rwt', value: Number(params?.rwt?.predictedAdultHeightCm) },
    { key: 'reinehr', value: Number(params?.reinehr?.predictedAdultHeightCm) }
  ].filter((item) => Number.isFinite(item.value));

  if (entries.length > 1) {
    const severityAverage = entries.reduce((sum, entry) => sum + advGrowthPredictionReliabilitySeverity(entry.levelKey), 0) / entries.length;
    let combinedSeverity = Math.round(severityAverage);

    if (availablePredictions.length > 1) {
      const values = availablePredictions.map((item) => item.value);
      agreementDiffCm = Math.max(...values) - Math.min(...values);
      if (agreementDiffCm <= 3) {
        agreementLabel = 'dobra';
      } else if (agreementDiffCm <= 6) {
        agreementLabel = 'umiarkowana';
      } else {
        agreementLabel = 'niska';
        combinedSeverity = Math.min(3, combinedSeverity + 1);
      }
    }

    if (profileModel && profileModel.isOutOfScope) {
      combinedSeverity = Math.min(3, combinedSeverity + 1);
    }

    overallLevelKey = allIndicative ? 'indicative' : advGrowthPredictionReliabilityLevelFromSeverity(combinedSeverity);
  } else if (allIndicative) {
    overallLevelKey = 'indicative';
  }

  return {
    entries,
    entryMap,
    overallLevelKey,
    overallLabel: advGrowthPredictionReliabilityLabel(overallLevelKey),
    agreementLabel,
    agreementDiffCm: Number.isFinite(agreementDiffCm) ? bayleyPinneauRoundHalfUp(agreementDiffCm, 1) : null,
    disclaimerText: (profileModel && profileModel.disclaimerText) ? profileModel.disclaimerText : ADV_GROWTH_PREDICTION_GLOBAL_DISCLAIMER_TEXT,
    profileStatusLabel: profileModel ? profileModel.statusLabel : '',
    profileSummaryText: profileModel ? profileModel.summaryText : '',
    hasAnyPrediction: true
  };
}

function advGrowthBuildPredictionReliabilityHtml(model) {
  if (!model || typeof model !== 'object' || !Array.isArray(model.entries) || !model.entries.length) {
    return '';
  }

  const methodRowsHtml = model.entries
    .map((entry) => `
      <div class="adv-growth-reliability-method-row">
        <span class="adv-growth-reliability-method-name">${advHistoryEscapeHtml(entry.methodLabel)}:</span>
        ${advGrowthBuildReliabilityBadgeHtml(entry.levelKey)}
      </div>`)
    .join('');

  const agreementHtml = model.agreementLabel
    ? `<p class="adv-growth-reliability-copy">Zgodność metod: <strong>${advHistoryEscapeHtml(model.agreementLabel)}</strong>${Number.isFinite(Number(model.agreementDiffCm)) ? ` (różnica ${advHistoryEscapeHtml(advHistoryFormatNumber(model.agreementDiffCm, 1))} cm)` : ''}.</p>`
    : '';

  const detailsHtml = `
    <div class="adv-growth-reliability-card">
      <p class="adv-growth-reliability-title"><strong>Wskaźnik wiarygodności prognozy:</strong> ${advGrowthBuildReliabilityBadgeHtml(model.overallLevelKey)}</p>
      <div class="adv-growth-reliability-methods">${methodRowsHtml}</div>
      ${agreementHtml}
      <p class="adv-growth-reliability-copy">Ocena uwzględnia dostępność błędu metody, relację wieku kostnego do metrykalnego oraz zakres zastosowania modeli.</p>
    </div>
    <div class="adv-growth-global-disclaimer"><strong>Uwaga ogólna:</strong> ${advHistoryEscapeHtml(model.disclaimerText || ADV_GROWTH_PREDICTION_GLOBAL_DISCLAIMER_TEXT)}</div>`;

  return `
    <div class="adv-growth-result-block adv-growth-result-block--reliability">
      ${buildAdvancedGrowthDetailsToggleHtml('advGrowthPredictionReliabilityDetails', detailsHtml, {
        collapsedLabel: 'Wskaźnik wiarygodności prognozy',
        expandedLabel: 'Ukryj wskaźnik wiarygodności prognozy'
      })}
    </div>`;
}

function advGrowthBuildPredictionReliabilitySummaryLine(model) {
  if (!model || typeof model !== 'object' || !Array.isArray(model.entries) || !model.entries.length) {
    return '';
  }
  const prefix = model.entries.length > 1
    ? 'Wiarygodność prognoz wzrostu'
    : 'Wiarygodność prognozy wzrostu';
  const methodParts = model.entries
    .map((entry) => `${entry.methodLabel}: ${entry.label}`)
    .join('; ');
  return methodParts
    ? `${prefix}: ${model.overallLabel} (${methodParts})`
    : `${prefix}: ${model.overallLabel}`;
}

function advGrowthBuildMethodReliabilityDetailsParagraph(reliability) {
  if (!reliability || typeof reliability !== 'object') return '';
  const reasonText = String(reliability.reasonText || '').trim();
  const suffix = reasonText ? ` Ocenę oparto na ${advHistoryEscapeHtml(reasonText)}.` : '';
  return `<p class="adv-growth-result-details-copy"><span style="opacity:0.85;">Orientacyjny wskaźnik wiarygodności tej prognozy: <strong>${advHistoryEscapeHtml(reliability.label)}</strong>.${suffix}</span></p>`;
}

function buildBayleyPinneauResultHtml(result) {
  if (!result || typeof result !== 'object') return '';
  if (result.available !== true) {
    const msg = String(result.message || '').trim();
    return msg ? `<p><em>${advHistoryEscapeHtml(msg)}</em></p>` : '';
  }

  const reliability = advGrowthAssessBayleyPinneauReliability(result, result.profileModel || null);
  const predicted = advHistoryFormatNumber(result.predictedAdultHeightCm, 1);
  const currentHeight = advHistoryFormatNumber(result.currentHeightCm, 1);
  const remaining = advHistoryFormatNumber(result.remainingGrowthCm, 1);
  const percent = advHistoryFormatNumber(result.percentMatureHeight, 1);
  const reasonText = result.groupReasonText ? (result.groupReasonText.charAt(0).toUpperCase() + result.groupReasonText.slice(1)) : '';
  const groupText = `użyto tabeli Bayley-Pinneau dla ${result.sexLabel} z grupy ${bayleyPinneauGroupLabel(result.groupKey)}`;
  const nodeText = result.snappedToNearestNode
    ? `Wpisany wiek kostny dopasowano do najbliższego punktu tabeli ${result.usedBoneAgeLabel}`
    : `Użyty punkt tabeli odpowiada wiekowi kostnemu ${result.usedBoneAgeLabel}`;

  const rawPredicted = advHistoryFormatNumber(result.predictedAdultHeightCmUncorrected, 1);
  const biasCorrectionRaw = Number(result.meanErrorCorrectionCmRaw);
  const biasCorrectionDigits = Math.abs(biasCorrectionRaw) < 0.1 ? 2 : 1;
  const biasCorrectionText = Number.isFinite(biasCorrectionRaw)
    ? advGrowthFormatSignedNumber(biasCorrectionRaw, biasCorrectionDigits)
    : '';
  const pointEstimateCorrectionText = (result.hasBiasCorrection === true && Number.isFinite(biasCorrectionRaw) && Math.abs(biasCorrectionRaw) >= 0.05)
    ? ` Surowa prognoza z tabeli wyniosła ${advHistoryEscapeHtml(rawPredicted)} cm; po korekcie o średni błąd ${advHistoryEscapeHtml(biasCorrectionText)} cm przyjęto ${advHistoryEscapeHtml(predicted)} cm.`
    : (result.hasBiasCorrection === true
      ? ' Punktową prognozę skorygowano o średni błąd z tabeli walidacyjnej.'
      : '');

  let errorParagraph = '';
  if (result.hasErrorInterval === true) {
    const lower = advHistoryFormatNumber(result.predictionIntervalLowerCm, 1);
    const upper = advHistoryFormatNumber(result.predictionIntervalUpperCm, 1);
    const halfWidth = advHistoryFormatNumber(result.errorBoundHalfWidthCm, 1);
    const coverage = Math.round(Number(result.errorBoundsCoveragePercent) || 90);
    const interpolationText = result.errorBoundsInterpolatedByAge
      ? `Średni błąd i odchylenie standardowe zinterpolowano liniowo między punktami wieku ${result.errorBoundsAgeNodeLowerLabel} i ${result.errorBoundsAgeNodeUpperLabel}; wykorzystano ${result.errorBoundsSampleLabel}.`
      : `Średni błąd i odchylenie standardowe odczytano dla wieku ${result.errorBoundsAgeNodeLowerLabel}; wykorzystano ${result.errorBoundsSampleLabel}.`;
    errorParagraph = `<p class="adv-growth-result-details-copy"><span style="opacity:0.85;">Przybliżony ${coverage}% przedział błędu Bayley-Pinneau: ${advHistoryEscapeHtml(lower)}–${advHistoryEscapeHtml(upper)} cm (±${advHistoryEscapeHtml(halfWidth)} cm). ${advHistoryEscapeHtml(interpolationText)}</span></p>`;
  } else if (result.errorModelUnavailableReason === 'below-min-age' && result.errorModelMinAgeLabel) {
    errorParagraph = `<p class="adv-growth-result-details-copy"><span style="opacity:0.85;">Dla wieku metrykalnego poniżej ${advHistoryEscapeHtml(result.errorModelMinAgeLabel)} lat oryginalne tabele błędu Bayley-Pinneau nie podają danych, dlatego nie pokazano przybliżonego błędu prognozy.</span></p>`;
  } else if ((result.errorModelUnavailableReason === 'above-max-age' || result.errorModelUnavailableReason === 'missing-error-data') && result.errorModelMaxAgeLabel) {
    errorParagraph = `<p class="adv-growth-result-details-copy"><span style="opacity:0.85;">Przybliżonego błędu Bayley-Pinneau nie pokazano, ponieważ dostępne tabele błędu obejmują wiek metrykalny do ${advHistoryEscapeHtml(result.errorModelMaxAgeLabel)} lat.</span></p>`;
  }

  const warningParagraph = result.hasPortabilityWarning
    ? `<p class="adv-growth-result-details-copy"><span style="opacity:0.9;"><strong>Uwaga:</strong> ${advHistoryEscapeHtml(result.portabilityWarningText)}</span></p>`
    : '';

  const reliabilityParagraph = advGrowthBuildMethodReliabilityDetailsParagraph(reliability);

  const detailsHtml = `
    <p class="adv-growth-result-details-copy"><span style="opacity:0.85;">Wyliczono na podstawie aktualnego wzrostu ${advHistoryEscapeHtml(currentHeight)} cm. ${advHistoryEscapeHtml(reasonText)} — ${advHistoryEscapeHtml(groupText)}. ${advHistoryEscapeHtml(nodeText)}; odpowiada to ${advHistoryEscapeHtml(percent)}% wzrostu ostatecznego.${pointEstimateCorrectionText} Do osiągnięcia pozostaje orientacyjnie ${advHistoryEscapeHtml(remaining)} cm.</span></p>
    ${reliabilityParagraph}
    ${errorParagraph}
    ${warningParagraph}`;

  return `
    <div class="adv-growth-result-block adv-growth-result-block--bp">
      <p><strong>Prognoza wzrostu ostatecznego (metoda Bayley-Pinneau):</strong> ${advHistoryEscapeHtml(predicted)} cm</p>
      ${buildAdvancedGrowthDetailsToggleHtml('advGrowthBayleyDetails', detailsHtml)}
    </div>`;
}

function advGrowthBuildBayleyPinneauSummaryText(result) {
  if (!result || typeof result !== 'object') return null;
  if (result.available !== true) return null;
  const predictedAdultHeight = Number(result.predictedAdultHeightCm);
  if (!isFinite(predictedAdultHeight)) return null;
  let line = `Prognoza wzrostu ostatecznego (Bayley-Pinneau): ${advHistoryFormatNumber(predictedAdultHeight, 1)} cm`;
  const halfWidth = Number(result.errorBoundHalfWidthCm);
  if (result.hasErrorInterval === true && isFinite(halfWidth)) {
    line += ` (±${advHistoryFormatNumber(halfWidth, 1)} cm)`;
  }
  return line;
}

function advGrowthBuildBayleyPinneauSummaryCardLine(result) {
  if (!result || typeof result !== 'object') return '';
  if (result.available !== true) return '';
  const predictedAdultHeight = Number(result.predictedAdultHeightCm);
  if (!isFinite(predictedAdultHeight)) return '';
  let line = `Prognoza wzrostu ostatecznego (metoda Bayley-Pinneau): ${advHistoryFormatNumber(predictedAdultHeight, 1)} cm`;
  const halfWidth = Number(result.errorBoundHalfWidthCm);
  if (result.hasErrorInterval === true && isFinite(halfWidth)) {
    line += ` (±${advHistoryFormatNumber(halfWidth, 1)} cm)`;
  }
  return line;
}


function rwtRoundHalfUp(value, digits = 1) {
  if (typeof value !== 'number' || !isFinite(value)) return null;
  const factor = Math.pow(10, digits);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function rwtNormalizeSexKey(sex) {
  const raw = String(sex || '').trim().toUpperCase();
  if (raw === 'M') return 'boys';
  if (raw === 'F') return 'girls';
  return null;
}

function rwtSexLabel(sexKey) {
  if (sexKey === 'boys') return 'chłopców';
  if (sexKey === 'girls') return 'dziewcząt';
  return '';
}

function rwtFormatAgeLabel(totalMonths) {
  if (!Number.isFinite(totalMonths)) return '';
  const value = Math.max(0, Math.round(Number(totalMonths) || 0));
  return `${Math.floor(value / 12)}-${value % 12}`;
}

function rwtJoinRequirementLabels(items) {
  if (!Array.isArray(items) || !items.length) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} i ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} oraz ${items[items.length - 1]}`;
}

function rwtInterpolateAgeWeights(rows, targetAgeMonths) {
  if (!Array.isArray(rows) || !rows.length || !Number.isFinite(targetAgeMonths)) {
    return null;
  }

  const minRow = rows[0];
  const maxRow = rows[rows.length - 1];
  if (targetAgeMonths < minRow.ageMonthsTotal || targetAgeMonths > maxRow.ageMonthsTotal) {
    return {
      ok: false,
      reason: 'out-of-range',
      minRow,
      maxRow
    };
  }

  for (const row of rows) {
    if (row.ageMonthsTotal === targetAgeMonths) {
      return {
        ok: true,
        interpolated: false,
        lowerRow: row,
        upperRow: row,
        fraction: 0,
        coefficients: {
          betaRL: Number(row.betaRL),
          betaW: Number(row.betaW),
          betaMPS: Number(row.betaMPS),
          betaSA: Number(row.betaSA),
          beta0: Number(row.beta0)
        }
      };
    }
  }

  let lowerRow = minRow;
  let upperRow = maxRow;
  for (let i = 1; i < rows.length; i += 1) {
    const candidate = rows[i];
    if (candidate.ageMonthsTotal > targetAgeMonths) {
      upperRow = candidate;
      lowerRow = rows[i - 1];
      break;
    }
  }

  const span = upperRow.ageMonthsTotal - lowerRow.ageMonthsTotal;
  if (!Number.isFinite(span) || span <= 0) {
    return {
      ok: false,
      reason: 'invalid-span',
      minRow,
      maxRow
    };
  }

  const fraction = (targetAgeMonths - lowerRow.ageMonthsTotal) / span;
  const coefficients = {};
  ['betaRL', 'betaW', 'betaMPS', 'betaSA', 'beta0'].forEach((key) => {
    const lowerValue = Number(lowerRow[key]);
    const upperValue = Number(upperRow[key]);
    coefficients[key] = lowerValue + ((upperValue - lowerValue) * fraction);
  });

  return {
    ok: true,
    interpolated: true,
    lowerRow,
    upperRow,
    fraction,
    coefficients
  };
}

function rwtInterpolateErrorBoundRows(rows, targetAgeMonths) {
  if (!Array.isArray(rows) || !rows.length || !Number.isFinite(targetAgeMonths)) {
    return null;
  }

  const sortedRows = rows.slice().sort((a, b) => Number(a?.ageMonthsTotal) - Number(b?.ageMonthsTotal));
  const minRow = sortedRows[0];
  const maxRow = sortedRows[sortedRows.length - 1];
  if (targetAgeMonths < minRow.ageMonthsTotal || targetAgeMonths > maxRow.ageMonthsTotal) {
    return {
      ok: false,
      reason: 'out-of-range',
      minRow,
      maxRow
    };
  }

  for (const row of sortedRows) {
    if (row.ageMonthsTotal === targetAgeMonths) {
      return {
        ok: true,
        interpolated: false,
        lowerRow: row,
        upperRow: row,
        fraction: 0,
        halfWidthCm: Number(row.halfWidthCm)
      };
    }
  }

  let lowerRow = minRow;
  let upperRow = maxRow;
  for (let i = 1; i < sortedRows.length; i += 1) {
    const candidate = sortedRows[i];
    if (candidate.ageMonthsTotal > targetAgeMonths) {
      upperRow = candidate;
      lowerRow = sortedRows[i - 1];
      break;
    }
  }

  const span = upperRow.ageMonthsTotal - lowerRow.ageMonthsTotal;
  const lowerValue = Number(lowerRow?.halfWidthCm);
  const upperValue = Number(upperRow?.halfWidthCm);
  if (!Number.isFinite(span) || span <= 0 || !Number.isFinite(lowerValue) || !Number.isFinite(upperValue)) {
    return {
      ok: false,
      reason: 'invalid-span',
      minRow,
      maxRow
    };
  }

  const fraction = (targetAgeMonths - lowerRow.ageMonthsTotal) / span;
  return {
    ok: true,
    interpolated: true,
    lowerRow,
    upperRow,
    fraction,
    halfWidthCm: lowerValue + ((upperValue - lowerValue) * fraction)
  };
}

function calculateRWTPrediction(params) {
  const dataRoot = requireGlobalObject('rwtData', 'advanced-growth-rwt', { silent: true });

  if (!dataRoot || !dataRoot.tables) {
    return {
      available: false,
      reason: 'missing-dataset',
      message: 'Nie udało się wczytać danych metody Roche-Wainer-Thissen (RWT).'
    };
  }

  const sexKey = rwtNormalizeSexKey(params?.sex);
  if (!sexKey) {
    return {
      available: false,
      reason: 'missing-sex',
      message: 'Nie udało się określić płci potrzebnej do obliczenia metody RWT.'
    };
  }

  const chronologicalAgeYears = Number(params?.chronologicalAgeYears);
  const chronologicalAgeMonths = Number.isFinite(Number(params?.chronologicalAgeMonths))
    ? Math.round(Number(params.chronologicalAgeMonths))
    : (Number.isFinite(chronologicalAgeYears) ? Math.round(chronologicalAgeYears * 12) : null);

  if (!Number.isFinite(chronologicalAgeMonths) || chronologicalAgeMonths < 0) {
    return {
      available: false,
      reason: 'missing-chronological-age',
      message: 'Aby obliczyć prognozę metodą RWT, uzupełnij aktualny wiek metrykalny.'
    };
  }

  const rows = Array.isArray(dataRoot.tables?.[sexKey]) ? dataRoot.tables[sexKey] : [];
  if (!rows.length) {
    return {
      available: false,
      reason: 'missing-table',
      message: 'Dla tej płci nie znaleziono tabel RWT.'
    };
  }

  const ageSelection = rwtInterpolateAgeWeights(rows, chronologicalAgeMonths);
  if (!ageSelection || ageSelection.ok !== true) {
    const minLabel = rwtFormatAgeLabel(rows?.[0]?.ageMonthsTotal);
    const maxLabel = rwtFormatAgeLabel(rows?.[rows.length - 1]?.ageMonthsTotal);
    return {
      available: false,
      reason: 'out-of-range',
      sexKey,
      sexLabel: rwtSexLabel(sexKey),
      chronologicalAgeMonths,
      chronologicalAgeYears: rwtRoundHalfUp(chronologicalAgeMonths / 12, 2),
      range: {
        minLabel,
        maxLabel,
        minMonths: rows?.[0]?.ageMonthsTotal ?? null,
        maxMonths: rows?.[rows.length - 1]?.ageMonthsTotal ?? null
      },
      message: `Oryginalne tabele RWT zawierają dane dla ${rwtSexLabel(sexKey)} w zakresie wieku metrykalnego ${minLabel}–${maxLabel}. Bieżący wiek ${advHistoryFormatNumber(chronologicalAgeMonths / 12, 2)} lat wykracza poza ten zakres.`
    };
  }

  const currentHeightCm = Number(params?.currentHeightCm);
  const currentWeightKg = Number(params?.currentWeightKg);
  const motherHeightCm = Number(params?.motherHeightCm);
  const fatherHeightCm = Number(params?.fatherHeightCm);
  const providedBoneAgeYears = Number(params?.boneAgeYears);
  const fallbackUpperMonths = Number(dataRoot?.meta?.chronologicalAgeMayReplaceSkeletalAgeUntilMonths?.[sexKey]);
  const canFallbackToChronologicalAge = Number.isFinite(fallbackUpperMonths) && chronologicalAgeMonths <= fallbackUpperMonths;

  const missingItems = [];
  if (!Number.isFinite(currentHeightCm) || currentHeightCm <= 0) {
    missingItems.push('aktualny wzrost w karcie Dane użytkownika');
  }
  if (!Number.isFinite(currentWeightKg) || currentWeightKg <= 0) {
    missingItems.push('aktualną masę ciała w karcie Dane użytkownika');
  }
  if (!Number.isFinite(motherHeightCm) || motherHeightCm <= 0 || !Number.isFinite(fatherHeightCm) || fatherHeightCm <= 0) {
    missingItems.push('wzrost Mamy i Taty w karcie Zaawansowane obliczenia wzrostowe');
  }
  const missingBoneAge = (!Number.isFinite(providedBoneAgeYears) || providedBoneAgeYears <= 0);
  if (missingBoneAge && !canFallbackToChronologicalAge) {
    missingItems.push('aktualny wiek kostny');
  }

  if (missingItems.length) {
    return {
      available: false,
      reason: 'missing-input',
      sexKey,
      sexLabel: rwtSexLabel(sexKey),
      message: `Aby obliczyć prognozę wzrostu ostatecznego metodą RWT, uzupełnij ${rwtJoinRequirementLabels(missingItems)}.`
    };
  }

  let usedSkeletalAgeYears = providedBoneAgeYears;
  let usedChronologicalAgeAsSkeletalAge = false;
  if (missingBoneAge && canFallbackToChronologicalAge) {
    usedSkeletalAgeYears = chronologicalAgeMonths / 12;
    usedChronologicalAgeAsSkeletalAge = true;
  }

  const standingToRecumbentAdjustmentCm = Number(dataRoot?.meta?.standingToRecumbentAdjustmentCm);
  const recumbentEquivalentLengthCmRaw = currentHeightCm + (Number.isFinite(standingToRecumbentAdjustmentCm) ? standingToRecumbentAdjustmentCm : 1.25);
  const midparentStatureCmRaw = (motherHeightCm + fatherHeightCm) / 2;
  const coeffs = ageSelection.coefficients || {};
  const predictedStatureAt18CmRaw = (Number(coeffs.betaRL) * recumbentEquivalentLengthCmRaw)
    + (Number(coeffs.betaW) * currentWeightKg)
    + (Number(coeffs.betaMPS) * midparentStatureCmRaw)
    + (Number(coeffs.betaSA) * usedSkeletalAgeYears)
    + Number(coeffs.beta0);

  const predictedAdultHeightCm = rwtRoundHalfUp(predictedStatureAt18CmRaw, 1);
  const remainingGrowthCm = rwtRoundHalfUp(predictedAdultHeightCm - currentHeightCm, 1);

  const errorBoundRows = Array.isArray(dataRoot?.errorBounds90?.[sexKey]) ? dataRoot.errorBounds90[sexKey] : [];
  const errorBoundSelection = rwtInterpolateErrorBoundRows(errorBoundRows, chronologicalAgeMonths);
  const errorBoundHalfWidthRaw = (errorBoundSelection && errorBoundSelection.ok === true)
    ? Number(errorBoundSelection.halfWidthCm)
    : null;
  const errorBoundHalfWidthCm = Number.isFinite(errorBoundHalfWidthRaw)
    ? rwtRoundHalfUp(errorBoundHalfWidthRaw, 1)
    : null;
  const predictionIntervalLowerCm = Number.isFinite(errorBoundHalfWidthCm)
    ? rwtRoundHalfUp(predictedAdultHeightCm - errorBoundHalfWidthCm, 1)
    : null;
  const predictionIntervalUpperCm = Number.isFinite(errorBoundHalfWidthCm)
    ? rwtRoundHalfUp(predictedAdultHeightCm + errorBoundHalfWidthCm, 1)
    : null;

  return {
    available: true,
    method: 'RWT',
    sexKey,
    sexLabel: rwtSexLabel(sexKey),
    chronologicalAgeMonths,
    chronologicalAgeYears: rwtRoundHalfUp(chronologicalAgeMonths / 12, 2),
    chronologicalAgeLabel: rwtFormatAgeLabel(chronologicalAgeMonths),
    currentHeightCm: rwtRoundHalfUp(currentHeightCm, 1),
    currentWeightKg: rwtRoundHalfUp(currentWeightKg, 1),
    motherHeightCm: rwtRoundHalfUp(motherHeightCm, 1),
    fatherHeightCm: rwtRoundHalfUp(fatherHeightCm, 1),
    midparentStatureCm: rwtRoundHalfUp(midparentStatureCmRaw, 1),
    recumbentEquivalentLengthCm: rwtRoundHalfUp(recumbentEquivalentLengthCmRaw, 2),
    enteredBoneAgeYears: missingBoneAge ? null : rwtRoundHalfUp(providedBoneAgeYears, 2),
    usedSkeletalAgeYears: rwtRoundHalfUp(usedSkeletalAgeYears, 2),
    usedChronologicalAgeAsSkeletalAge,
    interpolatedByChronologicalAge: !!ageSelection.interpolated,
    ageNodeLowerLabel: ageSelection.lowerRow?.ageLabel || null,
    ageNodeUpperLabel: ageSelection.upperRow?.ageLabel || null,
    ageInterpolationFraction: ageSelection.interpolated ? Number(ageSelection.fraction) : 0,
    coefficients: {
      betaRL: rwtRoundHalfUp(Number(coeffs.betaRL), 4),
      betaW: rwtRoundHalfUp(Number(coeffs.betaW), 4),
      betaMPS: rwtRoundHalfUp(Number(coeffs.betaMPS), 4),
      betaSA: rwtRoundHalfUp(Number(coeffs.betaSA), 4),
      beta0: rwtRoundHalfUp(Number(coeffs.beta0), 4)
    },
    predictedAdultHeightCm,
    predictedStatureAt18Cm: predictedAdultHeightCm,
    predictedStatureAt18CmRaw,
    remainingGrowthCm,
    hasErrorInterval: Number.isFinite(errorBoundHalfWidthCm),
    errorBoundsCoveragePercent: Number(dataRoot?.meta?.errorBounds?.coveragePercent) || 90,
    errorBoundsApproximate: true,
    errorBoundHalfWidthCm,
    predictionIntervalLowerCm,
    predictionIntervalUpperCm,
    errorBoundsInterpolatedByAge: !!(errorBoundSelection && errorBoundSelection.ok === true && errorBoundSelection.interpolated),
    errorBoundsAgeNodeLowerLabel: errorBoundSelection?.lowerRow?.ageLabel || null,
    errorBoundsAgeNodeUpperLabel: errorBoundSelection?.upperRow?.ageLabel || null,
    errorBoundsInterpolationFraction: (errorBoundSelection && errorBoundSelection.ok === true && errorBoundSelection.interpolated)
      ? Number(errorBoundSelection.fraction)
      : 0,
    errorBoundsSourceLower: errorBoundSelection?.lowerRow?.source || null,
    errorBoundsSourceUpper: errorBoundSelection?.upperRow?.source || null
  };
}

function buildRWTResultHtml(result) {
  if (!result || typeof result !== 'object') return '';
  if (result.available !== true) {
    const msg = String(result.message || '').trim();
    return msg ? `<p><em>${advHistoryEscapeHtml(msg)}</em></p>` : '';
  }

  const reliability = advGrowthAssessRWTReliability(result, result.profileModel || null);
  const predicted = advHistoryFormatNumber(result.predictedAdultHeightCm, 1);
  const currentHeight = advHistoryFormatNumber(result.currentHeightCm, 1);
  const recumbentEquivalent = advHistoryFormatNumber(result.recumbentEquivalentLengthCm, 2);
  const weight = advHistoryFormatNumber(result.currentWeightKg, 1);
  const midparent = advHistoryFormatNumber(result.midparentStatureCm, 1);
  const usedSkeletalAge = advHistoryFormatNumber(result.usedSkeletalAgeYears, 2);
  const remaining = advHistoryFormatNumber(result.remainingGrowthCm, 1);
  const ageWeightsText = result.interpolatedByChronologicalAge
    ? `Współczynniki wieku zinterpolowano liniowo między wierszami ${result.ageNodeLowerLabel} i ${result.ageNodeUpperLabel}.`
    : `Użyto wiersza wieku ${result.ageNodeLowerLabel}.`;
  const skeletalAgeText = result.usedChronologicalAgeAsSkeletalAge
    ? `Nie wpisano wieku kostnego; zgodnie z oryginalnym opisem metody RWT użyto wieku metrykalnego ${advHistoryEscapeHtml(advHistoryFormatNumber(result.chronologicalAgeYears, 2))} lat jako przybliżenia wieku kostnego.`
    : `Do równania wprowadzono wiek kostny ${advHistoryEscapeHtml(usedSkeletalAge)} lat.`;

  const intervalDetailsHtml = result.hasErrorInterval
    ? (() => {
        const lower = advHistoryFormatNumber(result.predictionIntervalLowerCm, 1);
        const upper = advHistoryFormatNumber(result.predictionIntervalUpperCm, 1);
        const halfWidth = advHistoryFormatNumber(result.errorBoundHalfWidthCm, 1);
        const coverage = Math.round(Number(result.errorBoundsCoveragePercent) || 90);
        const intervalAgeText = result.errorBoundsInterpolatedByAge
          ? `Połowę szerokości przedziału błędu zinterpolowano liniowo między punktami wieku ${result.errorBoundsAgeNodeLowerLabel} i ${result.errorBoundsAgeNodeUpperLabel}.`
          : `Połowę szerokości przedziału błędu odczytano dla wieku ${result.errorBoundsAgeNodeLowerLabel}.`;
        return `<p class="adv-growth-result-details-copy"><span style="opacity:0.85;">Przybliżony ${coverage}% przedział błędu RWT: ${advHistoryEscapeHtml(lower)}–${advHistoryEscapeHtml(upper)} cm (±${advHistoryEscapeHtml(halfWidth)} cm). ${advHistoryEscapeHtml(intervalAgeText)}</span></p>`;
      })()
    : '';

  const reliabilityParagraph = advGrowthBuildMethodReliabilityDetailsParagraph(reliability);

  const detailsHtml = `
    <p class="adv-growth-result-details-copy"><span style="opacity:0.85;">Wyliczono z równania Roche-Wainer-Thissen dla ${result.sexLabel}. Z aktualnego wzrostu stojącego ${advHistoryEscapeHtml(currentHeight)} cm utworzono przybliżoną długość leżącą ${advHistoryEscapeHtml(recumbentEquivalent)} cm (+1,25 cm), użyto masy ${advHistoryEscapeHtml(weight)} kg oraz średniego wzrostu rodziców ${advHistoryEscapeHtml(midparent)} cm. ${advHistoryEscapeHtml(skeletalAgeText)} ${advHistoryEscapeHtml(ageWeightsText)} Wynik odpowiada oryginalnej prognozie RWT dla 18. roku życia; do osiągnięcia pozostaje orientacyjnie ${advHistoryEscapeHtml(remaining)} cm.</span></p>
    ${reliabilityParagraph}
    ${intervalDetailsHtml}`;

  return `
    <div class="adv-growth-result-block adv-growth-result-block--rwt">
      <p><strong>Prognoza wzrostu ostatecznego (metoda RWT):</strong> ${advHistoryEscapeHtml(predicted)} cm</p>
      ${buildAdvancedGrowthDetailsToggleHtml('advGrowthRwtDetails', detailsHtml)}
    </div>`;
}

function advGrowthBuildRWTSummaryText(result) {
  if (!result || typeof result !== 'object') return null;
  if (result.available !== true) return null;
  const predictedAdultHeight = Number(result.predictedAdultHeightCm);
  if (!isFinite(predictedAdultHeight)) return null;
  let line = `Prognoza wzrostu ostatecznego (RWT): ${advHistoryFormatNumber(predictedAdultHeight, 1)} cm`;
  const halfWidth = Number(result.errorBoundHalfWidthCm);
  if (result.hasErrorInterval === true && isFinite(halfWidth)) {
    line += ` (±${advHistoryFormatNumber(halfWidth, 1)} cm)`;
  }
  return line;
}

function advGrowthBuildRWTSummaryCardLine(result) {
  if (!result || typeof result !== 'object') return '';
  if (result.available !== true) return '';
  const predictedAdultHeight = Number(result.predictedAdultHeightCm);
  if (!isFinite(predictedAdultHeight)) return '';
  let line = `Prognoza wzrostu ostatecznego (metoda RWT): ${advHistoryFormatNumber(predictedAdultHeight, 1)} cm`;
  const halfWidth = Number(result.errorBoundHalfWidthCm);
  if (result.hasErrorInterval === true && isFinite(halfWidth)) {
    line += ` (±${advHistoryFormatNumber(halfWidth, 1)} cm)`;
  }
  return line;
}

function advGrowthBuildRWTErrorIntervalSummaryCardLine(result) {
  return '';
}

/**
 * Główna funkcja obliczająca potencjał wzrostowy, tempo wzrastania
 * oraz przygotowująca dane historycznych pomiarów. Dane te są
 * prezentowane w interfejsie oraz zapisywane w globalnym obiekcie
 * window.advancedGrowthData. Funkcja jest wywoływana w wyniku
 * zmian pól formularza.
 */

function calculateReinehrCdgpPrediction(params) {
  const calculateReinehr = requireGlobalFunction('advGrowthCalculateReinehrCdgpPrediction', 'advanced-growth-reinehr', { silent: true });
  return calculateReinehr ? calculateReinehr(params) : null;
}



/* 8O-7a — adapter wejścia/wyjścia dla calculateGrowthAdvanced().
 * Cel: przygotować stabilny kontrakt przed przeniesieniem orkiestratora.
 * Funkcje są celowo małe i nie wykonują obliczeń klinicznych ani renderowania.
 */
function advGrowthParseCalculationNumber(id, options) {
  const el = getElementById(id, options);
  const value = parseFloat(el && el.value);
  return Number.isFinite(value) ? value : NaN;
}

function advGrowthReadCalculationText(id, options) {
  const el = getElementById(id, options);
  return (el && typeof el.value === 'string') ? el.value.trim() : '';
}

function advGrowthReadCalculationRawValue(id, options) {
  const el = getElementById(id, options);
  return (el && el.value != null) ? String(el.value) : '';
}

function advGrowthReadCalculationCheckbox(id, options) {
  const el = getElementById(id, options);
  return !!(el && el.checked);
}

function advGrowthReadCalculationAgeYears(options) {
  try {
    if (options && typeof options.getAgeDecimal === 'function') {
      const value = Number(options.getAgeDecimal());
      return Number.isFinite(value) ? value : NaN;
    }
  } catch (error) {
    logSwallowed('vilda_advanced_growth:calc-input-age-option', error);
  }
  try {
    if (typeof global.getAgeDecimal === 'function') {
      const value = Number(global.getAgeDecimal());
      return Number.isFinite(value) ? value : NaN;
    }
  } catch (error) {
    logSwallowed('vilda_advanced_growth:calc-input-age-global', error);
  }
  return NaN;
}

function advGrowthReadCalculationProfessionalMode(options) {
  if (options && typeof options.professionalMode === 'boolean') return options.professionalMode;
  if (options && options.professionalMode != null) return !!options.professionalMode;
  try {
    if (typeof global.professionalMode !== 'undefined') return !!global.professionalMode;
  } catch (error) {
    logSwallowed('vilda_advanced_growth:calc-input-professional-mode', error);
  }
  return isGrowthResultsProfessionalMode(options);
}

function collectAdvancedGrowthCalculationInput(options) {
  const ageYears = advGrowthReadCalculationAgeYears(options);
  const ageMonths = Math.round((isNaN(ageYears) ? 0 : ageYears) * 12);
  const sexEl = getElementById('sex', options);
  const sex = sexEl ? sexEl.value : 'M';
  const sexSpecificAdvancedFieldsEnabled = sex === 'M';
  const heightVal = advGrowthParseCalculationNumber('height', options);
  const weightVal = advGrowthParseCalculationNumber('weight', options);
  const advName = advGrowthReadCalculationText('advName', options);
  const motherH = advGrowthParseCalculationNumber('advMotherHeight', options);
  const fatherH = advGrowthParseCalculationNumber('advFatherHeight', options);
  const testicularVolumeVal = sexSpecificAdvancedFieldsEnabled ? advGrowthReadCalculationRawValue('advTesticularVolume', options) : '';
  const familyDelayedPubertyVal = sexSpecificAdvancedFieldsEnabled ? advGrowthReadCalculationRawValue('advFamilyDelayedPuberty', options) : '';
  const growthExclusionVal = sexSpecificAdvancedFieldsEnabled ? advGrowthReadCalculationRawValue('advGrowthExclusion', options) : '';

  let targetHeight = null;
  if (!isNaN(motherH) && !isNaN(fatherH)) {
    if (sex === 'F') {
      targetHeight = ((fatherH - 13) + motherH) / 2;
    } else {
      targetHeight = ((motherH + 13) + fatherH) / 2;
    }
  }

  const boneAgeVal = advGrowthParseCalculationNumber('advBoneAge', options);
  const boneAgeMonths = !isNaN(boneAgeVal) ? Math.round(boneAgeVal * 12) : null;
  const currentArrowEnabled = advGrowthReadCalculationCheckbox('advCurrentArrowEnable', options);
  const currentArrowComment = currentArrowEnabled ? advGrowthReadCalculationText('advCurrentArrowComment', options) : '';

  return {
    adapterStep: '8O-7a',
    version: VERSION,
    ageYears,
    ageMonths,
    sex,
    sexSpecificAdvancedFieldsEnabled,
    heightVal,
    weightVal,
    advName,
    motherH,
    fatherH,
    targetHeight,
    boneAgeVal,
    boneAgeMonths,
    rwtDataComplete: !isNaN(heightVal) && !isNaN(weightVal) && !isNaN(motherH) && !isNaN(fatherH),
    testicularVolumeVal,
    familyDelayedPubertyVal,
    growthExclusionVal,
    currentArrowEnabled,
    currentArrowComment,
    professionalMode: advGrowthReadCalculationProfessionalMode(options)
  };
}

function advGrowthOwnValue(source, key, fallback) {
  return (source && Object.prototype.hasOwnProperty.call(source, key)) ? source[key] : fallback;
}

function buildAdvancedGrowthDataPayload(input, computed) {
  const safeInput = input || {};
  const safeComputed = computed || {};
  return {
    targetHeight: advGrowthOwnValue(safeInput, 'targetHeight', null),
    targetStats: advGrowthOwnValue(safeComputed, 'targetStats', null),
    measurements: advGrowthOwnValue(safeComputed, 'measurements', []),
    boneAgeMonths: advGrowthOwnValue(safeInput, 'boneAgeMonths', null),
    growthVelocity: advGrowthOwnValue(safeComputed, 'growthVelocity', null),
    growthVelocityUsedLastYear: !!advGrowthOwnValue(safeComputed, 'growthVelocityUsedLastYear', false),
    growthVelocityContext: advGrowthOwnValue(safeComputed, 'growthVelocityContext', ''),
    growthVelocityGapM: advGrowthOwnValue(safeComputed, 'growthVelocityGapM', null),
    periodVelocities: advGrowthOwnValue(safeComputed, 'periodVelocities', []),
    currentAgeMonths: advGrowthOwnValue(safeInput, 'ageMonths', null),
    currentHeight: advGrowthOwnValue(safeInput, 'heightVal', NaN),
    currentWeight: advGrowthOwnValue(safeInput, 'weightVal', NaN),
    sex: advGrowthOwnValue(safeInput, 'sex', 'M'),
    name: advGrowthOwnValue(safeInput, 'advName', '') || '',
    bayleyPinneau: advGrowthOwnValue(safeComputed, 'bayleyPinneau', null),
    rwt: advGrowthOwnValue(safeComputed, 'rwt', null),
    reinehr: advGrowthOwnValue(safeComputed, 'reinehr', null),
    predictionProfile: advGrowthOwnValue(safeComputed, 'predictionProfile', null),
    predictionReliability: advGrowthOwnValue(safeComputed, 'predictionReliability', null),
    testicularVolume: advGrowthOwnValue(safeInput, 'testicularVolumeVal', '') || '',
    familyDelayedPuberty: advGrowthOwnValue(safeInput, 'familyDelayedPubertyVal', '') || '',
    growthExclusion: advGrowthOwnValue(safeInput, 'growthExclusionVal', '') || '',
    isLosingGrowth: !!advGrowthOwnValue(safeComputed, 'isLosingGrowth', false),
    currentArrowEnabled: !!advGrowthOwnValue(safeInput, 'currentArrowEnabled', false),
    currentArrowComment: advGrowthOwnValue(safeInput, 'currentArrowEnabled', false)
      ? (advGrowthOwnValue(safeInput, 'currentArrowComment', '') || '')
      : ''
  };
}

function commitAdvancedGrowthDataPayload(payload, options) {
  const target = (options && options.global) || global;
  try {
    target.advancedGrowthData = payload || null;
  } catch (error) {
    logSwallowed('vilda_advanced_growth:commit-advanced-growth-data', error);
  }
  return payload || null;
}

function clearAdvancedGrowthDataPayload(options) {
  return commitAdvancedGrowthDataPayload(null, options);
}

/* 8O-7b — pomocniczy lifecycle commit/clear/finalize advanced growth.
 * Funkcje nie liczą wyników klinicznych i nie renderują HTML wynikowego;
 * centralizują wyłącznie skutki uboczne, które do tej pory były rozsiane
 * wokół zapisu window.advancedGrowthData w calculateGrowthAdvanced().
 */
function advGrowthLifecycleTarget(options) {
  return (options && options.global) || global;
}

function advGrowthLifecycleFunction(options, optionName, globalName) {
  const opts = options || {};
  if (typeof opts[optionName] === 'function') return opts[optionName];
  return getFunction(globalName || optionName);
}

function advGrowthRunLifecycleHook(options, optionName, globalName, args, context) {
  const fn = advGrowthLifecycleFunction(options, optionName, globalName);
  if (!fn) return undefined;
  try {
    return fn.apply(advGrowthLifecycleTarget(options), Array.isArray(args) ? args : []);
  } catch (error) {
    logSwallowed(context || ('vilda_advanced_growth:lifecycle:' + optionName), error);
    return undefined;
  }
}

function advGrowthClearLifecycleResults(options) {
  const opts = options || {};
  const resultsEl = opts.resultsEl || getElementById('advResults', opts);
  if (!resultsEl || opts.clearResults === false) return;
  try {
    if (typeof opts.clearHtml === 'function') {
      opts.clearHtml(resultsEl);
    } else {
      clearHtml(resultsEl);
    }
  } catch (error) {
    logSwallowed('vilda_advanced_growth:lifecycle:clear-results', error);
  }
}

function clearAdvancedGrowthCalculationState(options) {
  const opts = options || {};
  clearAdvancedGrowthDataPayload({ global: advGrowthLifecycleTarget(opts) });
  advGrowthClearLifecycleResults(opts);
  advGrowthRunLifecycleHook(opts, 'updateAdvancedMeasurementAnalysisControls', 'updateAdvancedMeasurementAnalysisControls', [true], 'vilda_advanced_growth:lifecycle:analysis-controls-clear');
  advGrowthRunLifecycleHook(opts, 'updateAdvancedGrowthReportButtonVisibility', 'updateAdvancedGrowthReportButtonVisibility', [true], 'vilda_advanced_growth:lifecycle:report-button-clear');
  advGrowthRunLifecycleHook(opts, 'refreshGrowthChartActionControls', 'refreshGrowthChartActionControls', [], 'vilda_advanced_growth:lifecycle:chart-controls-clear');
  if (opts.refreshEstimatedIntake !== false) {
    const intakeOptions = opts.estimatedIntakeOptions || { preserveRows: true, recalcIfOpen: true };
    advGrowthRunLifecycleHook(opts, 'refreshEstimatedIntakeVisibility', 'refreshEstimatedIntakeVisibility', [intakeOptions], 'vilda_advanced_growth:lifecycle:intake-clear');
  }
  return null;
}

function commitAdvancedGrowthCalculationState(payload, options) {
  const opts = options || {};
  const committed = commitAdvancedGrowthDataPayload(payload, { global: advGrowthLifecycleTarget(opts) });
  if (opts.refreshStabilization !== false) {
    advGrowthRunLifecycleHook(opts, 'updateStabilizationEligibility', 'updateStabilizationEligibility', [], 'vilda_advanced_growth:lifecycle:stabilization-commit');
  }
  if (opts.refreshEstimatedIntake !== false) {
    const intakeOptions = opts.estimatedIntakeOptions || { preserveRows: true, recalcIfOpen: true };
    advGrowthRunLifecycleHook(opts, 'refreshEstimatedIntakeVisibility', 'refreshEstimatedIntakeVisibility', [intakeOptions], 'vilda_advanced_growth:lifecycle:intake-commit');
  }
  return committed;
}

function finalizeAdvancedGrowthCalculationLifecycle(options) {
  const opts = options || {};
  if (opts.updateProfessionalSummary !== false) {
    advGrowthRunLifecycleHook(opts, 'updateProfessionalSummaryCard', 'updateProfessionalSummaryCard', [], 'vilda_advanced_growth:lifecycle:professional-summary');
  }
  advGrowthRunLifecycleHook(opts, 'updateAdvancedMeasurementAnalysisControls', 'updateAdvancedMeasurementAnalysisControls', [false], 'vilda_advanced_growth:lifecycle:analysis-controls-finalize');
  advGrowthRunLifecycleHook(opts, 'updateAdvancedGrowthReportButtonVisibility', 'updateAdvancedGrowthReportButtonVisibility', [false], 'vilda_advanced_growth:lifecycle:report-button-finalize');
  advGrowthRunLifecycleHook(opts, 'refreshGrowthChartActionControls', 'refreshGrowthChartActionControls', [], 'vilda_advanced_growth:lifecycle:chart-controls-finalize');
  if (opts.syncAdvancedGrowthRowsToBasic !== false) {
    advGrowthRunLifecycleHook(opts, 'syncAdvancedGrowthRowsToBasic', 'syncAdvancedGrowthRowsToBasic', [], 'vilda_advanced_growth:lifecycle:sync-basic');
  }
  if (opts.schedulePersist !== false) {
    advGrowthRunLifecycleHook(opts, 'vildaPersistScheduleSave', 'vildaPersistScheduleSave', [], 'vilda_advanced_growth:lifecycle:persist-save');
  }
  return true;
}


/* 8O-7c — pełny orkiestrator calculateGrowthAdvanced() w VildaAdvancedGrowth.
 * Funkcja zachowuje dotychczasowy publiczny wrapper window.calculateGrowthAdvanced
 * w app.js, ale właściwy przebieg obliczeń/renderu advanced growth mieszka już
 * w module. Zależności z app.js są przekazywane jako opcje, aby nie dotykać
 * importu JSON, synchronizacji intake ani pozostałych globalnych cykli życia.
 */
function advGrowthCalculationTarget(options) {
  return (options && options.global) || global;
}

function advGrowthCalculationFunction(options, name) {
  const opts = options || {};
  if (typeof opts[name] === 'function') return opts[name];
  return getFunction(name);
}

function advGrowthCalculationValue(options, name, fallback) {
  const opts = options || {};
  if (Object.prototype.hasOwnProperty.call(opts, name) && typeof opts[name] !== 'undefined') {
    return opts[name];
  }
  try {
    if (global && Object.prototype.hasOwnProperty.call(global, name) && typeof global[name] !== 'undefined') {
      return global[name];
    }
  } catch (_) {}
  return fallback;
}

function calculateGrowthAdvanced(options) {
  const opts = options || {};
  const window = advGrowthCalculationTarget(opts);
  const document = opts.document || (window && window.document) || (global && global.document) || null;
  const resultsEl = document && typeof document.getElementById === 'function' ? document.getElementById('advResults') : null;
  const updateAdvancedGrowthSexSpecificFields = advGrowthCalculationFunction(opts, 'updateAdvancedGrowthSexSpecificFields');
  const updateAdvAgeMaxForCalculation = advGrowthCalculationFunction(opts, 'updateAdvAgeMax') || updateAdvAgeMax;
  const getAgeDecimal = advGrowthCalculationFunction(opts, 'getAgeDecimal');
  const collectAdvancedMeasurements = advGrowthCalculationFunction(opts, 'collectAdvancedMeasurements') || function () { return []; };
  const pickPrevForLastYear = advGrowthCalculationFunction(opts, 'pickPrevForLastYear') || function () { return null; };
  const pickPrevFallback = advGrowthCalculationFunction(opts, 'pickPrevFallback') || function () { return null; };
  const velocityCmPerYear = advGrowthCalculationFunction(opts, 'velocityCmPerYear') || function () { return null; };
  const formatVelocityContext = advGrowthCalculationFunction(opts, 'formatVelocityContext') || function () { return ''; };
  const calcPercentileStats = advGrowthCalculationFunction(opts, 'calcPercentileStats') || function () { return null; };
  const calcPercentileStatsPal = advGrowthCalculationFunction(opts, 'calcPercentileStatsPal') || calcPercentileStats;
  const getCentileChannel = advGrowthCalculationFunction(opts, 'getCentileChannel') || function () { return 0; };
  const computePeriodVelocities = advGrowthCalculationFunction(opts, 'computePeriodVelocities') || function () { return []; };
  const buildVelocityTableHtml = advGrowthCalculationFunction(opts, 'buildVelocityTableHtml') || function () { return ''; };
  const getVelocityThreshold = advGrowthCalculationFunction(opts, 'getVelocityThreshold') || function () { return null; };
  const formatCentile = advGrowthCalculationFunction(opts, 'formatCentile') || function (value) { return formatNumber(Number(value), 1); };
  const advGrowthBuildKowdProfileModel = advGrowthCalculationFunction(opts, 'advGrowthBuildKowdProfileModel');
  const advGrowthBuildKowdProfileHtml = advGrowthCalculationFunction(opts, 'advGrowthBuildKowdProfileHtml');
  const advGrowthBuildReinehrCdgpResultHtml = advGrowthCalculationFunction(opts, 'advGrowthBuildReinehrCdgpResultHtml');
  const updateProfessionalSummaryCard = advGrowthCalculationFunction(opts, 'updateProfessionalSummaryCard');
  const updateAdvancedMeasurementAnalysisControls = advGrowthCalculationFunction(opts, 'updateAdvancedMeasurementAnalysisControls');
  const updateAdvancedGrowthReportButtonVisibility = advGrowthCalculationFunction(opts, 'updateAdvancedGrowthReportButtonVisibility');
  const refreshGrowthChartActionControls = advGrowthCalculationFunction(opts, 'refreshGrowthChartActionControls');
  const vildaPersistScheduleSave = advGrowthCalculationFunction(opts, 'vildaPersistScheduleSave');
  const syncAdvancedGrowthRowsToBasic = advGrowthCalculationFunction(opts, 'syncAdvancedGrowthRowsToBasic');
  const refreshEstimatedIntakeVisibility = advGrowthCalculationFunction(opts, 'refreshEstimatedIntakeVisibility');
  const updateStabilizationEligibility = advGrowthCalculationFunction(opts, 'updateStabilizationEligibility');
  const vildaAppClearHtml = advGrowthCalculationFunction(opts, 'vildaAppClearHtml');
  const vildaAppSetTrustedHtml = advGrowthCalculationFunction(opts, 'vildaAppSetTrustedHtml') || setTrustedHtml;
  const clearPulse = advGrowthCalculationFunction(opts, 'clearPulse') || function () {};
  const applyPulse = advGrowthCalculationFunction(opts, 'applyPulse') || function () {};
  const professionalMode = advGrowthCalculationValue(opts, 'professionalMode', false);
  const bmiSource = advGrowthCalculationValue(opts, 'bmiSource', undefined);
  const OLAF_DATA_MIN_AGE = Number.isFinite(Number(advGrowthCalculationValue(opts, 'OLAF_DATA_MIN_AGE', 3)))
    ? Number(advGrowthCalculationValue(opts, 'OLAF_DATA_MIN_AGE', 3))
    : 3;
  try { updateAdvancedGrowthSexSpecificFields(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('vilda_advanced_growth.js', _, { step: '8O-7c', previousLine: 29101 });
    }
  }
  // Aktualizuj maksymalny dopuszczalny wiek w polach pomiarowych przy każdym przeliczeniu
  if (typeof updateAdvAgeMaxForCalculation === 'function') {
    updateAdvAgeMaxForCalculation();
  }

  // 8O-7a: snapshot wejścia dla przyszłego przeniesienia orkiestratora.
  const calculationInput = collectAdvancedGrowthCalculationInput({
    document: document,
    getAgeDecimal: (typeof getAgeDecimal === 'function') ? getAgeDecimal : null,
    professionalMode: (typeof professionalMode !== 'undefined') ? professionalMode : undefined
  });
  const ageYears = calculationInput.ageYears;
  const ageMonths = calculationInput.ageMonths;

  // Sprawdź, czy sekcja powinna być aktywna (wiek < 18 lat)
  // Wcześniej funkcja zwracała od razu dla dzieci młodszych niż 3 lata.
  // Usunięto ten warunek, aby umożliwić obliczenia dla dzieci w wieku 0–3 lat
  // z użyciem siatek Palczewskiej. Wyłącznie wiek >= 18 lat (dorośli)
  // dezaktywuje sekcję zaawansowaną.
  if (isNaN(ageYears) || ageYears >= 18) {
    // 8O-7b: centralny lifecycle czyszczenia danych advanced growth bez ruszania formularza.
    clearAdvancedGrowthCalculationState({
      global: window,
      resultsEl: resultsEl,
      clearHtml: (typeof vildaAppClearHtml === 'function') ? vildaAppClearHtml : null,
      updateAdvancedMeasurementAnalysisControls: (typeof updateAdvancedMeasurementAnalysisControls === 'function') ? updateAdvancedMeasurementAnalysisControls : null,
      updateAdvancedGrowthReportButtonVisibility: (typeof updateAdvancedGrowthReportButtonVisibility === 'function') ? updateAdvancedGrowthReportButtonVisibility : null,
      refreshGrowthChartActionControls: (typeof refreshGrowthChartActionControls === 'function') ? refreshGrowthChartActionControls : null,
      refreshEstimatedIntakeVisibility: (typeof refreshEstimatedIntakeVisibility === 'function') ? refreshEstimatedIntakeVisibility : null
    });
    return;
  }
  const sex = calculationInput.sex;
  const sexSpecificAdvancedFieldsEnabled = calculationInput.sexSpecificAdvancedFieldsEnabled;
  const heightVal = calculationInput.heightVal;
  const weightVal = calculationInput.weightVal;
  const advName = calculationInput.advName;
  const motherH = calculationInput.motherH;
  const fatherH = calculationInput.fatherH;
  const testicularVolumeVal = calculationInput.testicularVolumeVal;
  const familyDelayedPubertyVal = calculationInput.familyDelayedPubertyVal;
  const growthExclusionVal = calculationInput.growthExclusionVal;
  const targetHeight = calculationInput.targetHeight;
  const boneAgeVal = calculationInput.boneAgeVal;
  const boneAgeMonths = calculationInput.boneAgeMonths;
  const rwtDataComplete = calculationInput.rwtDataComplete;
  const predictionProfile = (typeof advGrowthBuildKowdProfileModel === 'function')
    ? advGrowthBuildKowdProfileModel({
        sex: sex,
        chronologicalAgeYears: ageYears,
        chronologicalAgeMonths: ageMonths,
        boneAgeYears: !isNaN(boneAgeVal) ? boneAgeVal : null,
        currentHeightCm: !isNaN(heightVal) ? heightVal : null,
        targetHeightCm: targetHeight,
        testicularVolume: testicularVolumeVal,
        familyDelayedPuberty: familyDelayedPubertyVal,
        growthExclusion: growthExclusionVal,
        rwtDataComplete: rwtDataComplete
      })
    : null;
  const bayleyPinneauResult = calculateBayleyPinneauPrediction({
    sex: sex,
    chronologicalAgeYears: ageYears,
    chronologicalAgeMonths: ageMonths,
    boneAgeYears: !isNaN(boneAgeVal) ? boneAgeVal : null,
    currentHeightCm: !isNaN(heightVal) ? heightVal : null
  });
  const rwtResult = calculateRWTPrediction({
    sex: sex,
    chronologicalAgeYears: ageYears,
    chronologicalAgeMonths: ageMonths,
    boneAgeYears: !isNaN(boneAgeVal) ? boneAgeVal : null,
    currentHeightCm: !isNaN(heightVal) ? heightVal : null,
    currentWeightKg: !isNaN(weightVal) ? weightVal : null,
    motherHeightCm: !isNaN(motherH) ? motherH : null,
    fatherHeightCm: !isNaN(fatherH) ? fatherH : null
  });
  const reinehrResult = calculateReinehrCdgpPrediction({
    sex: sex,
    chronologicalAgeYears: ageYears,
    chronologicalAgeMonths: ageMonths,
    boneAgeYears: !isNaN(boneAgeVal) ? boneAgeVal : null,
    currentHeightCm: !isNaN(heightVal) ? heightVal : null,
    boneAgeDelayYears: (!isNaN(boneAgeVal) ? (ageYears - boneAgeVal) : null),
    profileModel: predictionProfile
  });
  try { if (bayleyPinneauResult && typeof bayleyPinneauResult === 'object') bayleyPinneauResult.profileModel = predictionProfile || null; } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('vilda_advanced_growth.js', _, { step: '8O-7c', previousLine: 29204 });
    }
  }
  try { if (rwtResult && typeof rwtResult === 'object') rwtResult.profileModel = predictionProfile || null; } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('vilda_advanced_growth.js', _, { step: '8O-7c', previousLine: 29205 });
    }
  }
  try { if (reinehrResult && typeof reinehrResult === 'object') reinehrResult.profileModel = predictionProfile || null; } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('vilda_advanced_growth.js', _, { step: '8O-7c', previousLine: 29206 });
    }
  }
  const predictionReliability = advGrowthBuildPredictionReliabilityModel({
    bayleyPinneau: bayleyPinneauResult,
    rwt: rwtResult,
    reinehr: reinehrResult,
    profileModel: predictionProfile
  });
  // Odczytaj wprowadzone pomiary z formularza historii wzrostu.
  const measurements = collectAdvancedMeasurements(false);
    // === [ZAMIANA] Obliczanie tempa wzrastania zgodnie z wymaganiami (aktualizacja) ===
let growthVelocity = null;               // cm/rok
// Uwaga: ta flaga oznacza teraz „Aktualne” (okno 6–15 mies., tj. 6–8 mies. oraz 12±3 mies.)
let growthVelocityUsedLastYear = false;
let growthVelocityContext = '';          // dla „Tempo wzrastania” (nieaktualne): "ostatnich X mies." / "ostatnich N lat"
let growthVelocityGapM = null;           // dokładna liczba miesięcy użyta do „Aktualnego”/„nieaktualnego” tempa

const heightMeas = measurements
  .filter(m => m.height !== null)
  .sort((a,b)=>a.ageMonths - b.ageMonths);

if (heightMeas.length >= 1 && !isNaN(heightVal)) {
  const currentAgeM = ageMonths;
  const currentH = heightVal;

  // 1) Preferencja: okno „ostatni rok” = 12±3 mies. (ale min. 6 mies.)
  let prev = pickPrevForLastYear(heightMeas, currentAgeM, 6, 12, 3);
  if (prev) {
    const v = velocityCmPerYear(prev.height, prev.ageMonths, currentH, currentAgeM);
    if (v !== null) {
      growthVelocity = v;
      growthVelocityUsedLastYear = true;                   // traktujemy jako „Aktualne”
      growthVelocityGapM = currentAgeM - prev.ageMonths;   // np. 13 mies.
      // Nie potrzebujemy tu „ostatni rok” – do etykiety pokażemy dokładną liczbę miesięcy
      growthVelocityContext = `ostatnich ${growthVelocityGapM} mies.`;
    }
  }

  // 2) Jeśli brak pary w 12±3 mies.: bierzemy najnowszy pomiar oddalony ≥6 mies.
  if (growthVelocity === null) {
    const p2 = pickPrevFallback(heightMeas, currentAgeM, 6);
    if (p2) {
      const v = velocityCmPerYear(p2.height, p2.ageMonths, currentH, currentAgeM);
      if (v !== null) {
        growthVelocity = v;
        growthVelocityGapM = currentAgeM - p2.ageMonths;    // np. 6/7/8/… mies.
        // 6–8 mies. także traktujemy jako „Aktualne”
        growthVelocityUsedLastYear = (growthVelocityGapM >= 6 && growthVelocityGapM <= 8);
        // Ten kontekst wykorzystujemy tylko w „Tempo wzrastania” (nieaktualne)
        growthVelocityContext = formatVelocityContext(p2.ageMonths, currentAgeM, false);
      }
    }
  }
}
// === [KONIEC ZAMIANY] ===
  
    // Oblicz parametry centylowe dla potencjału wzrostowego w wieku 18 lat
  // Oblicz parametry centylowe dla potencjału wzrostowego w wieku 18 lat
  let targetStats = null;
  if (targetHeight !== null && !isNaN(targetHeight)) {
    const stats = calcPercentileStats(targetHeight, sex, 18, 'h');
    if (stats) {
      targetStats = stats;
    }
  }

  // Oceń spadek tempa wzrastania – jeśli dziecko spadło o ≥2 kanały centylowe względem pierwszego pomiaru
  let isLosingGrowth = false;
  if (heightMeas.length >= 1 && !isNaN(heightVal)) {
    const first = heightMeas[0];
    const statsFirst = calcPercentileStats(first.height, sex, first.ageYears, 'h');
    const statsCurr  = calcPercentileStats(heightVal, sex, ageYears, 'h');
    if (statsFirst && statsCurr) {
      const chFirst = getCentileChannel(statsFirst.percentile);
      const chCurr  = getCentileChannel(statsCurr.percentile);
      if (chFirst - chCurr >= 2) {
        isLosingGrowth = true;
      }
    }
  }
    // Przygotuj punkty wysokości (wraz z aktualnym wzrostem) do tabeli okresów
    const pointsForTable = heightMeas.slice();
    if (!isNaN(heightVal)) {
      pointsForTable.push({ ageMonths, height: heightVal });
    }
    pointsForTable.sort((a,b)=>a.ageMonths - b.ageMonths);
    const periodVelocities = computePeriodVelocities(pointsForTable.map(p => ({ageMonths: p.ageMonths, height: p.height})));
    const periodTableHtml = buildVelocityTableHtml(periodVelocities);
  
    // Ocena „słabego” tempa wzrastania – tylko dla obliczonego aktualnego tempa
    let isSlowVelocity = false;
    let slowNormLabel = '';
    const endAgeM = (typeof currentAgeForVelocityM !== 'undefined' && currentAgeForVelocityM !== null)
      ? currentAgeForVelocityM
      : ageMonths;
      const thr = getVelocityThreshold(ageMonths);
      if (thr && growthVelocity !== null && !isNaN(growthVelocity) && growthVelocityUsedLastYear) {
        if (growthVelocity < thr.threshold) {
          isSlowVelocity = true;
        }
        slowNormLabel = thr.label;
      }
  
    // Zaktualizuj globalny obiekt (dostępny także dla PDF) przez adapter 8O-7a.
    const advancedGrowthPayload = buildAdvancedGrowthDataPayload(calculationInput, {
      targetStats: targetStats,
      measurements: measurements,
      growthVelocity: growthVelocity,
      growthVelocityUsedLastYear: growthVelocityUsedLastYear,
      growthVelocityContext: growthVelocityContext,
      growthVelocityGapM: growthVelocityGapM,
      periodVelocities: periodVelocities,
      bayleyPinneau: bayleyPinneauResult,
      rwt: rwtResult,
      reinehr: reinehrResult,
      predictionProfile: predictionProfile,
      predictionReliability: predictionReliability,
      isLosingGrowth: isLosingGrowth
    });
    // 8O-7b: commit payloadu oraz powiązane odświeżenia lifecycle przez adapter.
    commitAdvancedGrowthCalculationState(advancedGrowthPayload, {
      global: window,
      updateStabilizationEligibility: (typeof updateStabilizationEligibility === 'function') ? updateStabilizationEligibility : null,
      refreshEstimatedIntakeVisibility: (typeof refreshEstimatedIntakeVisibility === 'function') ? refreshEstimatedIntakeVisibility : null
    });
  
    // Przygotuj i wyświetl tekstowy rezultat w sekcji zaawansowanej
    if (resultsEl) {
      let html = '';
      if (targetHeight !== null && !isNaN(targetHeight)) {
        const th = targetHeight.toFixed(1).replace('.', ',');
        if (targetStats) {
          const cent = formatCentile(targetStats.percentile);
          const sd = targetStats.sd.toFixed(2).replace('.', ',');
          // Zmieniono etykietę na MPH (mid‑parental height)
          html += `<p><strong>MPH (mid-parental height):</strong> ${th} cm – centyl: ${cent}, z-score: ${sd}</p>`;
        } else {
          html += `<p><strong>MPH (mid-parental height):</strong> ${th} cm</p>`;
        }
      }

      if (predictionProfile && typeof advGrowthBuildKowdProfileHtml === 'function') {
        html += advGrowthBuildKowdProfileHtml(predictionProfile);
      }

      const predictionBlocks = [];
      if (predictionProfile && predictionProfile.preferredModelKey === 'rwt') {
        predictionBlocks.push(buildRWTResultHtml(rwtResult));
        if (typeof advGrowthBuildReinehrCdgpResultHtml === 'function') {
          predictionBlocks.push(advGrowthBuildReinehrCdgpResultHtml(reinehrResult));
        }
        predictionBlocks.push(buildBayleyPinneauResultHtml(bayleyPinneauResult));
      } else {
        predictionBlocks.push(buildBayleyPinneauResultHtml(bayleyPinneauResult));
        predictionBlocks.push(buildRWTResultHtml(rwtResult));
        if (typeof advGrowthBuildReinehrCdgpResultHtml === 'function') {
          predictionBlocks.push(advGrowthBuildReinehrCdgpResultHtml(reinehrResult));
        }
      }
      html += predictionBlocks.filter(Boolean).join('');

      if (predictionReliability && Array.isArray(predictionReliability.entries) && predictionReliability.entries.length) {
        html += advGrowthBuildPredictionReliabilityHtml(predictionReliability);
      }

      // Dodaj różnicę hSDS - mpSDS w trybie profesjonalnym.
      // Aby obliczyć różnicę, wymagane są zarówno targetStats (Z‑score rodziców) jak i profesjonalny tryb wyników.
      if (targetStats && typeof targetStats.sd === 'number' && isFinite(targetStats.sd) && professionalMode) {
        // Z‑score aktualnego wzrostu dziecka (hSDS) powinien być obliczany na podstawie
        // tego samego zestawu siatek centylowych, z którego korzystamy przy obliczaniu mph.
        // Do tej pory wykorzystywano parametr 'h' w funkcji calcPercentileStats, co nie
        // odpowiada nazwie używanej w pozostałych modułach (HT). Ponadto nie uwzględniano
        // wyboru źródła danych (Palczewska/OLAF/WHO), co prowadziło do niespójności.
        // Tutaj wykrywamy bieżące źródło siatek (bmiSource) i korzystamy z
        // odpowiedniej funkcji (calcPercentileStatsPal lub calcPercentileStats) z parametrem 'HT'.
        let statsHeightDiff = null;
        // W zależności od źródła (Palczewska dla dzieci <3 lat lub wybrana przez użytkownika)
        // stosujemy właściwą funkcję. Zmienna bmiSource jest ustawiana globalnie przy
        // przełączaniu radiobuttonów w karcie BMI.
        const usePalAdv = (typeof bmiSource !== 'undefined' &&
                           (bmiSource === 'PALCZEWSKA' ||
                            (bmiSource === 'OLAF' && ageYears < OLAF_DATA_MIN_AGE)));
        if (usePalAdv) {
          statsHeightDiff = calcPercentileStatsPal(heightVal, sex, ageYears, 'HT');
        } else {
          statsHeightDiff = calcPercentileStats(heightVal, sex, ageYears, 'HT');
        }
        if (statsHeightDiff && typeof statsHeightDiff.sd === 'number' && isFinite(statsHeightDiff.sd)) {
          const diffZ = statsHeightDiff.sd - targetStats.sd;
          if (typeof diffZ === 'number' && isFinite(diffZ)) {
            html += `<p><strong>hSDS - mpSDS:</strong> ${diffZ.toFixed(2).replace('.', ',')}</p>`;
          }
        }
      }
  
      if (growthVelocity !== null && !isNaN(growthVelocity)) {
        if (growthVelocityUsedLastYear) {
          // „Aktualne” zawsze pokazujemy z dokładną liczbą miesięcy
          const m = (typeof growthVelocityGapM === 'number' && growthVelocityGapM >= 6) ? growthVelocityGapM : null;
          const monthInfo = m ? ` (z ostatnich ${m} mies.)` : '';
          html += `<p><strong>Aktualne tempo wzrastania${monthInfo}:</strong> ${growthVelocity.toFixed(1).replace('.', ',')} cm/rok</p>`;
        } else {
          const ctx = growthVelocityContext ? ` <span style="opacity:0.85;">(obliczono jako średnią z ${growthVelocityContext})</span>` : '';
          html += `<p><strong>Tempo wzrastania:</strong> ${growthVelocity.toFixed(1).replace('.', ',')} cm/rok${ctx}</p>`;
        }
      } else {
        html += `<p><em>Brak wystarczających danych (wymagane ≥2 pomiary oddalone o ≥6 miesięcy), aby obliczyć tempo wzrastania.</em></p>`;
      }
  
      // Komunikat o utracie tempa wzrastania (kanały centylowe) – zachowujemy istniejącą logikę
      if (isLosingGrowth) {
        html += `<p style="color: var(--danger); font-weight:600;">Z analizy siatki centylowej wynika utrata tempa wzrastania, wskazana konsultacja endokrynologiczna, <a href="https://vildaclinic.pl" target="_blank" rel="noopener noreferrer" style="color: var(--danger); text-decoration: underline;">umów wizytę</a></p>`;
      }
  
      // NOWY komunikat: słabe tempo wzrastania (dotyczy tylko obliczonego aktualnego tempa)
      if (isSlowVelocity) {
        const normInfo = slowNormLabel ? ` <span style="font-weight:400;">(norma: ${slowNormLabel})</span>` : '';
        html += `<p style="color: var(--danger); font-weight:600;">Z analizy siatki centylowej wynika słabe tempo wzrastania dziecka, wskazana konsultacja endokrynologiczna, <a href="https://vildaclinic.pl" target="_blank" rel="noopener noreferrer" style="color: var(--danger); text-decoration: underline;">umów wizytę</a>${normInfo}</p>`;
      }
  
      // Tabela okresów (pokazujemy niezależnie od komunikatów)
      if (periodTableHtml) {
        html += periodTableHtml;
      }
  
      if (html === '') {
        html = '<p>Uzupełnij dane, aby obliczyć potencjał wzrostowy i tempo wzrastania.</p>';
      }
      // Wstaw wygenerowane wyniki do kontenera
      vildaAppSetTrustedHtml(resultsEl, html, 'vilda_advanced_growth:resultsEl');
      initAdvancedGrowthResultDetailsToggles(resultsEl);

      /*
       * Po wstawieniu wyników oceń, czy należy wyróżnić cały blok wyników.
       * Zgodnie z wymaganiami, gdy pojawia się ostrzeżenie o "słabym tempie wzrastania",
       * obramowanie kontenera powinno zmieniać kolor na czerwony, a sam kontener
       * pulsować podobnie jak karta Wskaźnika Cole'a w przypadku nadwagi lub otyłości.
       * Dodatkowo powiększamy czcionkę w tym bloku o 25% dla lepszej czytelności.
       */
      // Resetuj ewentualne poprzednie efekty pulsowania i style ramki
      clearPulse(resultsEl);
      // Przywróć bazowy rozmiar czcionki i obramowanie (style inline mają priorytet nad CSS)
      resultsEl.style.borderColor = '';
      resultsEl.style.fontSize   = '';

      // Wyświetl ostrzeżenie: jeśli tempo wzrastania jest wolne
      // (isSlowVelocity = true) lub nastąpiła utrata tempa wzrastania
      // (isLosingGrowth = true), ustawiamy czerwone obramowanie, powiększamy
      // czcionkę i uruchamiamy pulsowanie. Dotyczy to wszystkich grup
      // wiekowych, również >10 lat. W przeciwnym wypadku obramowanie
      // pozostaje w kolorze podstawowym.
      if (isSlowVelocity || isLosingGrowth) {
        // Ustaw czerwone obramowanie i zwiększ rozmiar czcionki
        resultsEl.style.borderColor = 'var(--danger)';
        resultsEl.style.fontSize = '1.25rem';
        // Zastosuj pulsowanie czerwone – wykorzystujemy globalną funkcję applyPulse
        applyPulse(resultsEl, 'danger');
      } else {
        // Przywróć turkusową ramkę (primary) jeśli wcześniej ustawiono kolor
        resultsEl.style.borderColor = 'var(--primary)';
      }
    }
    // 8O-7b: końcowe odświeżenia lifecycle po renderze wyników advanced growth.
    finalizeAdvancedGrowthCalculationLifecycle({
      global: window,
      updateProfessionalSummary: !!resultsEl,
      updateProfessionalSummaryCard: (typeof updateProfessionalSummaryCard === 'function') ? updateProfessionalSummaryCard : null,
      updateAdvancedMeasurementAnalysisControls: (typeof updateAdvancedMeasurementAnalysisControls === 'function') ? updateAdvancedMeasurementAnalysisControls : null,
      updateAdvancedGrowthReportButtonVisibility: (typeof updateAdvancedGrowthReportButtonVisibility === 'function') ? updateAdvancedGrowthReportButtonVisibility : null,
      refreshGrowthChartActionControls: (typeof refreshGrowthChartActionControls === 'function') ? refreshGrowthChartActionControls : null,
      syncAdvancedGrowthRowsToBasic: (typeof syncAdvancedGrowthRowsToBasic === 'function') ? syncAdvancedGrowthRowsToBasic : null,
      vildaPersistScheduleSave: (typeof vildaPersistScheduleSave === 'function') ? vildaPersistScheduleSave : null
    });
}

  /* 8O-8b — neutralne helpery synchronizacji advanced growth ↔ estimated intake.
   * Ten blok nie wykonuje parowania, nie dodaje/usuwa wierszy i nie wywołuje
   * przeliczeń. Udostępnia wyłącznie odczyt DOM, obsługę syncId, wiek wierszy
   * oraz detekcję danych, aby app.js mógł zachować event wiring i algorytm
   * _pairAdvancedAndIntakeRowsByOrder() bez zmiany zachowania.
   */
  const ADV_INTAKE_ROW_SELECTORS = Object.freeze({
    intakeRows: '#intakeMeasurements .measure-row-intake',
    advancedRows: '#advMeasurements .measure-row',
    advancedData: Object.freeze(['.adv-age-years', '.adv-age-months', '.adv-height', '.adv-weight', '.adv-bone-age']),
    intakeData: Object.freeze(['.intake-ageY', '.intake-ageM', '.intake-ht', '.intake-wt'])
  });

  function advIntakeGetRows(selector, options) {
    const doc = getDocument(options);
    if (!doc || typeof doc.querySelectorAll !== 'function') return [];
    try {
      return Array.from(doc.querySelectorAll(selector));
    } catch (error) {
      logSwallowed('vilda_advanced_growth:adv-intake-get-rows', error, { selector });
      return [];
    }
  }

  function advIntakeGetIntakeRows(options) {
    return advIntakeGetRows(ADV_INTAKE_ROW_SELECTORS.intakeRows, options);
  }

  function advIntakeGetAdvancedRows(options) {
    return advIntakeGetRows(ADV_INTAKE_ROW_SELECTORS.advancedRows, options);
  }

  function advIntakeGetIntakeHistoryRows(options) {
    return advIntakeGetIntakeRows(options).filter(row => row && row.dataset && row.dataset.locked !== 'true');
  }

  function advIntakeGetSyncId(row) {
    return row && row.dataset ? (row.dataset.advIntakeSyncId || '') : '';
  }

  function advIntakeSetSyncId(row, syncId) {
    if (!row || !row.dataset) return row || null;
    if (syncId) row.dataset.advIntakeSyncId = String(syncId);
    else delete row.dataset.advIntakeSyncId;
    return row;
  }

  function advIntakeFindAdvancedRowBySyncId(syncId, options) {
    if (!syncId) return null;
    return advIntakeGetAdvancedRows(options).find(row => advIntakeGetSyncId(row) === syncId) || null;
  }

  function advIntakeFindIntakeHistoryRowBySyncId(syncId, options) {
    if (!syncId) return null;
    return advIntakeGetIntakeHistoryRows(options).find(row => advIntakeGetSyncId(row) === syncId) || null;
  }

  function advIntakeGetUserBasics(options) {
    const doc = getDocument(options);
    const ageYRaw = parseFloat(doc && doc.getElementById ? doc.getElementById('age')?.value : undefined);
    const ageMRaw = parseFloat(doc && doc.getElementById ? doc.getElementById('ageMonths')?.value : undefined);
    const heightRaw = parseFloat(doc && doc.getElementById ? doc.getElementById('height')?.value : undefined);
    const weightRaw = parseFloat(doc && doc.getElementById ? doc.getElementById('weight')?.value : undefined);
    const hasAge = !Number.isNaN(ageYRaw) || !Number.isNaN(ageMRaw);
    const totalM = hasAge ? ((Number.isNaN(ageYRaw) ? 0 : ageYRaw) * 12 + (Number.isNaN(ageMRaw) ? 0 : ageMRaw)) : null;
    return {
      ageMonths: (typeof totalM === 'number' && isFinite(totalM)) ? Math.round(totalM) : null,
      height: (!Number.isNaN(heightRaw) && isFinite(heightRaw)) ? heightRaw : null,
      weight: (!Number.isNaN(weightRaw) && isFinite(weightRaw)) ? weightRaw : null
    };
  }

  function advIntakeGetCompleteCurrentBasics(options) {
    try {
      const basics = advIntakeGetUserBasics(options);
      const ageMonths = Number.isFinite(Number(basics && basics.ageMonths)) ? Math.round(Number(basics.ageMonths)) : null;
      const height = Number.isFinite(Number(basics && basics.height)) ? Number(basics.height) : null;
      const weight = Number.isFinite(Number(basics && basics.weight)) ? Number(basics.weight) : null;
      if (ageMonths === null || height === null || weight === null) return null;
      return { ageMonths, height, weight };
    } catch (error) {
      logSwallowed('vilda_advanced_growth:adv-intake-current-basics', error);
      return null;
    }
  }

  function advIntakeApproxEq(a, b, tol = 0.05) {
    if (typeof a !== 'number' || !isFinite(a) || typeof b !== 'number' || !isFinite(b)) return false;
    return Math.abs(a - b) <= tol;
  }

  function advIntakeGetRawInputValue(el) {
    if (!el) return '';
    return String(el.value ?? '').trim();
  }

  function advIntakeAgeMonthsFromRow(row, yearsSelector, monthsSelector) {
    if (!row || typeof row.querySelector !== 'function') return null;
    const y = parseFloat(row.querySelector(yearsSelector)?.value);
    const m = parseFloat(row.querySelector(monthsSelector)?.value);
    if (Number.isNaN(y) && Number.isNaN(m)) return null;
    return Math.round((Number.isNaN(y) ? 0 : y) * 12 + (Number.isNaN(m) ? 0 : m));
  }

  function advIntakeAdvRowAgeMonths(row) {
    return advIntakeAgeMonthsFromRow(row, '.adv-age-years', '.adv-age-months');
  }

  function advIntakeIntakeRowAgeMonths(row) {
    return advIntakeAgeMonthsFromRow(row, '.intake-ageY', '.intake-ageM');
  }

  function advIntakeRowHasAnyData(row, selectors) {
    if (!row || typeof row.querySelector !== 'function') return false;
    const list = Array.isArray(selectors) ? selectors : [];
    return list.some(sel => {
      const el = row.querySelector(sel);
      return !!el && String(el.value ?? '').trim() !== '';
    });
  }

  function advIntakeAdvRowHasAnyData(row) {
    return advIntakeRowHasAnyData(row, ADV_INTAKE_ROW_SELECTORS.advancedData.slice());
  }

  function advIntakeIntakeRowHasAnyData(row) {
    return advIntakeRowHasAnyData(row, ADV_INTAKE_ROW_SELECTORS.intakeData.slice());
  }

  function advIntakeRowMatchesCurrentBasicsByMetrics(ageMonths, height, weight, basics) {
    if (!basics || typeof basics !== 'object') return false;
    if (!Number.isFinite(Number(ageMonths)) || Math.round(Number(ageMonths)) !== Math.round(Number(basics.ageMonths))) {
      return false;
    }
    let compared = 0;
    if (typeof height === 'number' && isFinite(height) && typeof basics.height === 'number' && isFinite(basics.height)) {
      compared += 1;
      if (!advIntakeApproxEq(height, basics.height)) return false;
    }
    if (typeof weight === 'number' && isFinite(weight) && typeof basics.weight === 'number' && isFinite(basics.weight)) {
      compared += 1;
      if (!advIntakeApproxEq(weight, basics.weight)) return false;
    }
    return compared > 0;
  }

  function advIntakeIntakeHistoryRowDuplicatesCurrentBasics(row, basics) {
    if (!row || !basics) return false;
    const ageMonths = advIntakeIntakeRowAgeMonths(row);
    const height = parseFloat(row.querySelector('.intake-ht')?.value);
    const weight = parseFloat(row.querySelector('.intake-wt')?.value);
    return advIntakeRowMatchesCurrentBasicsByMetrics(
      ageMonths,
      Number.isNaN(height) ? null : height,
      Number.isNaN(weight) ? null : weight,
      basics
    );
  }

  function advIntakeAdvancedHistoryRowDuplicatesCurrentBasics(row, basics) {
    if (!row || !basics) return false;
    const ageMonths = advIntakeAdvRowAgeMonths(row);
    const height = parseFloat(row.querySelector('.adv-height')?.value);
    const weight = parseFloat(row.querySelector('.adv-weight')?.value);
    const boneAge = parseFloat(row.querySelector('.adv-bone-age')?.value);
    const arrowEnabled = !!row.querySelector('.adv-arrow-enable')?.checked;
    const arrowComment = String(row.querySelector('.adv-arrow-comment')?.value || '').trim();
    const ghSync = row.getAttribute('data-gh-sync') === 'true';
    const ghId = String(row.getAttribute('data-gh-id') || '').trim();
    const hasExtraPayload = (!Number.isNaN(boneAge)) || arrowEnabled || !!arrowComment || ghSync || !!ghId;
    if (hasExtraPayload) return false;
    return advIntakeRowMatchesCurrentBasicsByMetrics(
      ageMonths,
      Number.isNaN(height) ? null : height,
      Number.isNaN(weight) ? null : weight,
      basics
    );
  }

  function advIntakeIsProtectedAdvancedHistoryRow(row, options) {
    const rows = advIntakeGetAdvancedRows(options);
    if (!row || !rows.length || rows[0] !== row) return false;
    const hasGhMeta = row.getAttribute('data-gh-sync') === 'true'
      || !!String(row.getAttribute('data-gh-id') || '').trim();
    return rows.length === 1 && !advIntakeAdvRowHasAnyData(row) && !hasGhMeta;
  }

  function advIntakeIsProtectedIntakeHistoryRow(row, options) {
    const rows = advIntakeGetIntakeHistoryRows(options);
    if (!row || !rows.length || rows[0] !== row) return false;
    return rows.length === 1 && !advIntakeIntakeRowHasAnyData(row);
  }

  function advIntakeBuildAuditSnapshot(options) {
    const opts = options || {};
    const errors = [];
    const safeRows = (label, reader) => {
      try {
        const rows = (typeof reader === 'function') ? reader() : [];
        return Array.isArray(rows) ? rows : Array.from(rows || []);
      } catch (error) {
        errors.push({ label, message: String(error && error.message ? error.message : error) });
        return [];
      }
    };
    const safeHasData = (label, row, reader) => {
      try {
        return !!(typeof reader === 'function' && reader(row));
      } catch (error) {
        errors.push({ label, message: String(error && error.message ? error.message : error) });
        return false;
      }
    };
    const safeAttr = (row, name) => {
      try {
        return row && typeof row.getAttribute === 'function' ? String(row.getAttribute(name) || '') : '';
      } catch (_) {
        return '';
      }
    };
    const advancedRows = safeRows('advancedRows', () => advIntakeGetAdvancedRows(opts));
    const intakeRows = safeRows('intakeRows', () => advIntakeGetIntakeRows(opts));
    const intakeHistoryRows = safeRows('intakeHistoryRows', () => advIntakeGetIntakeHistoryRows(opts));
    const describeRow = (row, index, kind) => {
      const syncId = advIntakeGetSyncId(row);
      const locked = !!(row && row.dataset && row.dataset.locked === 'true');
      const hasData = kind === 'advanced'
        ? safeHasData('advancedHasData', row, advIntakeAdvRowHasAnyData)
        : safeHasData('intakeHasData', row, advIntakeIntakeRowHasAnyData);
      const ghSync = kind === 'advanced' && safeAttr(row, 'data-gh-sync') === 'true';
      const ghId = kind === 'advanced' ? safeAttr(row, 'data-gh-id') : '';
      return { kind, index, syncId, locked, hasData, ghSync, ghId };
    };
    const advanced = advancedRows.map((row, index) => describeRow(row, index, 'advanced'));
    const intake = intakeRows.map((row, index) => describeRow(row, index, 'intake'));
    const intakeHistory = intakeHistoryRows.map((row, index) => describeRow(row, index, 'intake-history'));
    const countById = (rows) => rows.reduce((acc, row) => {
      if (!row.syncId) return acc;
      acc[row.syncId] = (acc[row.syncId] || 0) + 1;
      return acc;
    }, Object.create(null));
    const advancedById = countById(advanced);
    const intakeHistoryById = countById(intakeHistory);
    const allIds = Array.from(new Set(Object.keys(advancedById).concat(Object.keys(intakeHistoryById))));
    const duplicateAdvancedIds = Object.keys(advancedById).filter((id) => advancedById[id] > 1);
    const duplicateIntakeIds = Object.keys(intakeHistoryById).filter((id) => intakeHistoryById[id] > 1);
    const pairedIds = allIds.filter((id) => advancedById[id] > 0 && intakeHistoryById[id] > 0);
    const orphanAdvancedIds = allIds.filter((id) => advancedById[id] > 0 && !intakeHistoryById[id]);
    const orphanIntakeIds = allIds.filter((id) => intakeHistoryById[id] > 0 && !advancedById[id]);
    const unpairedAdvancedRows = advanced.filter((row) => !row.locked && !row.syncId).length;
    const unpairedIntakeHistoryRows = intakeHistory.filter((row) => !row.syncId).length;
    const doc = getDocument(opts);
    const snapshot = {
      step: '8O-8d',
      kind: 'advanced-intake-sync-audit',
      hasAdvancedContainer: !!(doc && doc.getElementById && doc.getElementById('advMeasurements')),
      hasIntakeContainer: !!(doc && doc.getElementById && doc.getElementById('intakeMeasurements')),
      suspended: !!(global && global.__vildaSuspendAdvIntakeSync),
      counts: {
        advancedRows: advanced.length,
        intakeRows: intake.length,
        intakeHistoryRows: intakeHistory.length,
        lockedIntakeRows: intake.filter((row) => row.locked).length,
        advancedRowsWithData: advanced.filter((row) => row.hasData).length,
        intakeHistoryRowsWithData: intakeHistory.filter((row) => row.hasData).length,
        ghSyncedAdvancedRows: advanced.filter((row) => row.ghSync || !!row.ghId).length,
        pairedIds: pairedIds.length,
        unpairedAdvancedRows,
        unpairedIntakeHistoryRows,
        duplicateAdvancedIds: duplicateAdvancedIds.length,
        duplicateIntakeIds: duplicateIntakeIds.length,
        orphanAdvancedIds: orphanAdvancedIds.length,
        orphanIntakeIds: orphanIntakeIds.length
      },
      syncIds: {
        paired: pairedIds,
        duplicateAdvanced: duplicateAdvancedIds,
        duplicateIntakeHistory: duplicateIntakeIds,
        orphanAdvanced: orphanAdvancedIds,
        orphanIntakeHistory: orphanIntakeIds
      },
      errors
    };
    if (opts.includeRows === true) {
      snapshot.rows = { advanced, intake, intakeHistory };
    }
    return snapshot;
  }

  function versionInfo() {
    return {
      version: VERSION,
      step: '8O-8f',
      containsClinicalCalculations: true,
      containsAdvancedGrowthDataLifecycle: true,
      containsAdvancedGrowthLifecycleAdapters: true,
      containsCalculationOrchestrator: true,
      containsAdvancedIntakeSyncHelpers: true,
      containsAdvancedIntakeSyncRowOperations: true,
      containsAdvancedIntakeSyncPairing: true,
      containsAdvancedIntakeSyncHandlers: true,
      containsAdvancedIntakeLiveWiring: true,
      containsCalculationAdapters: true,
      containsGhIgfImport: true,
      containsPredictionEngines: true,
      containsJsonRehydration: false,
      movedHelpers: [
        'advHistoryEscapeHtml',
        'advHistoryFormatNumber',
        'advHistoryFormatAgeMonths',
        'advHistorySourceLabel',
        'advHistoryDecodeCentile',
        'advHistoryPercentileText',
        'advGrowthFormatSignedNumber',
        'advGrowthSanitizePdfText',
        'advGrowthSanitizePdfMultilineText',
        'advGrowthHexToRgb',
        'getGhAdvancedCurrentBasics',
        'ghAdvancedApproxEq',
        'ghTherapyPointMatchesCurrentBasics',
        'ghAdvancedRowMatchesCurrentBasics',
        'importTherapyPointsToAdvancedGrowth',
        'bayleyPinneauRoundHalfUp',
        'bayleyPinneauNormalizeSexKey',
        'bayleyPinneauSexLabel',
        'bayleyPinneauGroupLabel',
        'bayleyPinneauGroupNominativeLabel',
        'bayleyPinneauGroupReasonText',
        'bayleyPinneauLabelToMonths',
        'bayleyPinneauDetermineGroupKey',
        'bayleyPinneauFormatMonthDistance',
        'bayleyPinneauFormatAgeLabel',
        'bayleyPinneauErrorSampleLabel',
        'bayleyPinneauInterpolateErrorStats',
        'bayleyPinneauBuildPortabilityWarningText',
        'bayleyPinneauResolvePrintedSegment',
        'bayleyPinneauSelectNearestFactor',
        'calculateBayleyPinneauPrediction',
        'buildAdvancedGrowthDetailsToggleHtml',
        'initAdvancedGrowthResultDetailsToggles',
        'advGrowthPredictionReliabilityLabel',
        'advGrowthPredictionReliabilitySeverity',
        'advGrowthPredictionReliabilityLevelFromSeverity',
        'advGrowthDowngradeReliabilityLevel',
        'advGrowthFormatReasonList',
        'advGrowthBuildReliabilityBadgeHtml',
        'advGrowthAssessBayleyPinneauReliability',
        'advGrowthAssessRWTReliability',
        'advGrowthBuildPredictionReliabilityModel',
        'advGrowthBuildPredictionReliabilityHtml',
        'advGrowthBuildPredictionReliabilitySummaryLine',
        'advGrowthBuildMethodReliabilityDetailsParagraph',
        'buildBayleyPinneauResultHtml',
        'advGrowthBuildBayleyPinneauSummaryText',
        'advGrowthBuildBayleyPinneauSummaryCardLine',
        'rwtRoundHalfUp',
        'rwtNormalizeSexKey',
        'rwtSexLabel',
        'rwtFormatAgeLabel',
        'rwtJoinRequirementLabels',
        'rwtInterpolateAgeWeights',
        'rwtInterpolateErrorBoundRows',
        'calculateRWTPrediction',
        'calculateReinehrCdgpPrediction',
        'buildRWTResultHtml',
        'advGrowthBuildRWTSummaryText',
        'advGrowthBuildRWTSummaryCardLine',
        'advGrowthBuildRWTErrorIntervalSummaryCardLine',
        'collectAdvancedGrowthCalculationInput',
        'buildAdvancedGrowthDataPayload',
        'commitAdvancedGrowthDataPayload',
        'clearAdvancedGrowthDataPayload',
        'clearAdvancedGrowthCalculationState',
        'commitAdvancedGrowthCalculationState',
        'finalizeAdvancedGrowthCalculationLifecycle',
        'calculateGrowthAdvanced',
        'advIntakeGetIntakeRows',
        'advIntakeGetAdvancedRows',
        'advIntakeGetIntakeHistoryRows',
        'advIntakeGetSyncId',
        'advIntakeSetSyncId',
        'advIntakeFindAdvancedRowBySyncId',
        'advIntakeFindIntakeHistoryRowBySyncId',
        'advIntakeGetUserBasics',
        'advIntakeGetCompleteCurrentBasics',
        'advIntakeApproxEq',
        'advIntakeAdvRowAgeMonths',
        'advIntakeIntakeRowAgeMonths',
        'advIntakeGetRawInputValue',
        'advIntakeRowHasAnyData',
        'advIntakeAdvRowHasAnyData',
        'advIntakeIntakeRowHasAnyData',
        'advIntakeRowMatchesCurrentBasicsByMetrics',
        'advIntakeIntakeHistoryRowDuplicatesCurrentBasics',
        'advIntakeAdvancedHistoryRowDuplicatesCurrentBasics',
        'advIntakeIsProtectedAdvancedHistoryRow',
        'advIntakeIsProtectedIntakeHistoryRow',
        'advIntakeBuildAuditSnapshot',
        'copyAdvancedIntakeValueIfTargetEmpty',
        'backfillAdvancedIntakeHistoryRowFromAdvancedRow',
        'backfillAdvancedIntakeAdvancedRowFromHistoryRow',
        'syncAdvancedIntakeAdvancedRowToHistoryRow',
        'syncAdvancedIntakeHistoryRowToAdvancedRow',
        'pairAdvancedIntakeRowsByOrder',
        'handleAdvancedIntakeAdvancedMeasurementRowRemove',
        'handleAdvancedIntakeHistoryRowRemove',
        'handleAdvancedIntakeAdvancedMeasurementAdd',
        'handleAdvancedIntakeHistoryAdd',
        'setupAdvancedIntakeLiveWiring',
        'setupAdvancedGrowth',
        'isAdvancedGrowthMainPage',
        'isAdvancedGrowthProModeActive',
        'addAdvMeasurementRow',
        'updateAdvAgeMax',
        'updateAdvancedMeasurementAnalysisControls',
        'updateAdvancedGrowthAccess',
        'getGrowthDataSourceAgeYears',
        'isGrowthResultsProfessionalMode',
        'normalizeGrowthDataSource',
        'isGrowthDataSourceAllowed',
        'getDefaultGrowthDataSource',
        'setCheckedGrowthDataSource',
        'rememberManualGrowthDataSource',
        'refreshGrowthChartActionControls',
        'syncGrowthDataSourceInputs',
        'updatePalczewskaAccess',
        'updateGrowthDataSourceControls',
        'advGrowthBuildTargetHeightForReport',
        'advGrowthGetTargetStatsForReport',
        'advGrowthCollectHistoricalPointsForReport',
        'advGrowthCollectAllPointsForReport',
        'advGrowthBuildReportRows',
        'advGrowthBuildPdfMakeDefinition',
        'advGrowthBuildReportPresentationModel',
        'advGrowthBuildHtmlReportMarkup',
        'advGrowthGeneratePdfViaCanvas',
        'generateAdvancedGrowthPdfReport',
        'ensureAdvancedGrowthReportControls',
        'removeAdvancedGrowthClearButton',
        'updateAdvancedGrowthReportButtonVisibility'
      ]
    };
  }

  const api = Object.freeze({
    __vildaAdvancedGrowth: true,
    VERSION,
    version: VERSION,
    escapeHtml,
    formatNumber,
    formatAgeMonths,
    sourceLabel,
    decodeCentile,
    percentileText,
    formatSignedNumber,
    sanitizePdfText,
    sanitizePdfMultilineText,
    hexToRgb,
    setupAdvancedGrowth,
    isAdvancedGrowthMainPage,
    getGhAdvancedCurrentBasics,
    ghAdvancedApproxEq,
    ghTherapyPointMatchesCurrentBasics,
    ghAdvancedRowMatchesCurrentBasics,
    importTherapyPointsToAdvancedGrowth,
    bayleyPinneauRoundHalfUp,
    bayleyPinneauNormalizeSexKey,
    bayleyPinneauSexLabel,
    bayleyPinneauGroupLabel,
    bayleyPinneauGroupNominativeLabel,
    bayleyPinneauGroupReasonText,
    bayleyPinneauLabelToMonths,
    bayleyPinneauDetermineGroupKey,
    bayleyPinneauFormatMonthDistance,
    bayleyPinneauFormatAgeLabel,
    bayleyPinneauErrorSampleLabel,
    bayleyPinneauInterpolateErrorStats,
    bayleyPinneauBuildPortabilityWarningText,
    bayleyPinneauResolvePrintedSegment,
    bayleyPinneauSelectNearestFactor,
    calculateBayleyPinneauPrediction,
    buildAdvancedGrowthDetailsToggleHtml,
    initAdvancedGrowthResultDetailsToggles,
    advGrowthPredictionReliabilityLabel,
    advGrowthPredictionReliabilitySeverity,
    advGrowthPredictionReliabilityLevelFromSeverity,
    advGrowthDowngradeReliabilityLevel,
    advGrowthFormatReasonList,
    advGrowthBuildReliabilityBadgeHtml,
    advGrowthAssessBayleyPinneauReliability,
    advGrowthAssessRWTReliability,
    advGrowthBuildPredictionReliabilityModel,
    advGrowthBuildPredictionReliabilityHtml,
    advGrowthBuildPredictionReliabilitySummaryLine,
    advGrowthBuildMethodReliabilityDetailsParagraph,
    buildBayleyPinneauResultHtml,
    advGrowthBuildBayleyPinneauSummaryText,
    advGrowthBuildBayleyPinneauSummaryCardLine,
    rwtRoundHalfUp,
    rwtNormalizeSexKey,
    rwtSexLabel,
    rwtFormatAgeLabel,
    rwtJoinRequirementLabels,
    rwtInterpolateAgeWeights,
    rwtInterpolateErrorBoundRows,
    calculateRWTPrediction,
    calculateReinehrCdgpPrediction,
    buildRWTResultHtml,
    advGrowthBuildRWTSummaryText,
    advGrowthBuildRWTSummaryCardLine,
    advGrowthBuildRWTErrorIntervalSummaryCardLine,
    collectAdvancedGrowthCalculationInput,
    buildAdvancedGrowthDataPayload,
    commitAdvancedGrowthDataPayload,
    clearAdvancedGrowthDataPayload,
    clearAdvancedGrowthCalculationState,
    commitAdvancedGrowthCalculationState,
    finalizeAdvancedGrowthCalculationLifecycle,
    calculateGrowthAdvanced,
    advIntakeGetIntakeRows,
    advIntakeGetAdvancedRows,
    advIntakeGetIntakeHistoryRows,
    advIntakeGetSyncId,
    advIntakeSetSyncId,
    advIntakeFindAdvancedRowBySyncId,
    advIntakeFindIntakeHistoryRowBySyncId,
    advIntakeGetUserBasics,
    advIntakeGetCompleteCurrentBasics,
    advIntakeApproxEq,
    advIntakeAdvRowAgeMonths,
    advIntakeIntakeRowAgeMonths,
    advIntakeGetRawInputValue,
    advIntakeRowHasAnyData,
    advIntakeAdvRowHasAnyData,
    advIntakeIntakeRowHasAnyData,
    advIntakeRowMatchesCurrentBasicsByMetrics,
    advIntakeIntakeHistoryRowDuplicatesCurrentBasics,
    advIntakeAdvancedHistoryRowDuplicatesCurrentBasics,
    advIntakeIsProtectedAdvancedHistoryRow,
    advIntakeIsProtectedIntakeHistoryRow,
    advIntakeBuildAuditSnapshot,
    copyAdvancedIntakeValueIfTargetEmpty,
    backfillAdvancedIntakeHistoryRowFromAdvancedRow,
    backfillAdvancedIntakeAdvancedRowFromHistoryRow,
    syncAdvancedIntakeAdvancedRowToHistoryRow,
    syncAdvancedIntakeHistoryRowToAdvancedRow,
    pairAdvancedIntakeRowsByOrder,
    handleAdvancedIntakeAdvancedMeasurementRowRemove,
    handleAdvancedIntakeHistoryRowRemove,
    handleAdvancedIntakeAdvancedMeasurementAdd,
    handleAdvancedIntakeHistoryAdd,
    setupAdvancedIntakeLiveWiring,
    isAdvancedGrowthProModeActive,
    addAdvMeasurementRow,
    updateAdvAgeMax,
    updateAdvancedMeasurementAnalysisControls,
    updateAdvancedGrowthAccess,
    getGrowthDataSourceAgeYears,
    isGrowthResultsProfessionalMode,
    normalizeGrowthDataSource,
    isGrowthDataSourceAllowed,
    getDefaultGrowthDataSource,
    setCheckedGrowthDataSource,
    rememberManualGrowthDataSource,
    refreshGrowthChartActionControls,
    syncGrowthDataSourceInputs,
    updatePalczewskaAccess,
    updateGrowthDataSourceControls,
    advGrowthBuildTargetHeightForReport,
    advGrowthGetTargetStatsForReport,
    advGrowthCollectHistoricalPointsForReport,
    advGrowthCollectAllPointsForReport,
    advGrowthBuildReportRows,
    advGrowthDrawPdfCell,
    advGrowthLoadScriptOnce,
    advGrowthEnsurePdfMake,
    advGrowthCreatePdfMakeCell,
    advGrowthBuildPdfMakeDefinition,
    advGrowthDecodeCentileEntities,
    advGrowthFormatAdultHeightValue,
    advGrowthBuildParentHeightSummaryText,
    advGrowthBuildMphSummaryText,
    advGrowthBuildReportPresentationModel,
    advGrowthBuildHtmlReportMarkup,
    advGrowthGeneratePdfViaCanvas,
    generateAdvancedGrowthPdfReport,
    ensureAdvancedGrowthReportControls,
    removeAdvancedGrowthClearButton,
    updateAdvancedGrowthReportButtonVisibility,
    versionInfo
  });

  global.VildaAdvancedGrowth = api;
  global.vildaAdvancedGrowth = api;
  global.vildaAdvancedGrowthVersion = function () { return VERSION; };

  global.advHistoryEscapeHtml = escapeHtml;
  global.advHistoryFormatNumber = formatNumber;
  global.advHistoryFormatAgeMonths = formatAgeMonths;
  global.advHistorySourceLabel = sourceLabel;
  global.advHistoryDecodeCentile = decodeCentile;
  global.advHistoryPercentileText = percentileText;
  global.advGrowthFormatSignedNumber = formatSignedNumber;
  global.advGrowthSanitizePdfText = sanitizePdfText;
  global.advGrowthSanitizePdfMultilineText = sanitizePdfMultilineText;
  global.advGrowthHexToRgb = hexToRgb;

  global.setupAdvancedGrowth = setupAdvancedGrowth;
  global.isAdvancedGrowthMainPage = isAdvancedGrowthMainPage;
  global.getGhAdvancedCurrentBasics = getGhAdvancedCurrentBasics;
  global.ghAdvancedApproxEq = ghAdvancedApproxEq;
  global.ghTherapyPointMatchesCurrentBasics = ghTherapyPointMatchesCurrentBasics;
  global.ghAdvancedRowMatchesCurrentBasics = ghAdvancedRowMatchesCurrentBasics;
  global.importTherapyPointsToAdvancedGrowth = importTherapyPointsToAdvancedGrowth;
  global.bayleyPinneauRoundHalfUp = bayleyPinneauRoundHalfUp;
  global.bayleyPinneauNormalizeSexKey = bayleyPinneauNormalizeSexKey;
  global.bayleyPinneauSexLabel = bayleyPinneauSexLabel;
  global.bayleyPinneauGroupLabel = bayleyPinneauGroupLabel;
  global.bayleyPinneauGroupNominativeLabel = bayleyPinneauGroupNominativeLabel;
  global.bayleyPinneauGroupReasonText = bayleyPinneauGroupReasonText;
  global.bayleyPinneauLabelToMonths = bayleyPinneauLabelToMonths;
  global.bayleyPinneauDetermineGroupKey = bayleyPinneauDetermineGroupKey;
  global.bayleyPinneauFormatMonthDistance = bayleyPinneauFormatMonthDistance;
  global.bayleyPinneauFormatAgeLabel = bayleyPinneauFormatAgeLabel;
  global.bayleyPinneauErrorSampleLabel = bayleyPinneauErrorSampleLabel;
  global.bayleyPinneauInterpolateErrorStats = bayleyPinneauInterpolateErrorStats;
  global.bayleyPinneauBuildPortabilityWarningText = bayleyPinneauBuildPortabilityWarningText;
  global.bayleyPinneauResolvePrintedSegment = bayleyPinneauResolvePrintedSegment;
  global.bayleyPinneauSelectNearestFactor = bayleyPinneauSelectNearestFactor;
  global.calculateBayleyPinneauPrediction = calculateBayleyPinneauPrediction;
  global.buildAdvancedGrowthDetailsToggleHtml = buildAdvancedGrowthDetailsToggleHtml;
  global.initAdvancedGrowthResultDetailsToggles = initAdvancedGrowthResultDetailsToggles;
  global.advGrowthPredictionReliabilityLabel = advGrowthPredictionReliabilityLabel;
  global.advGrowthPredictionReliabilitySeverity = advGrowthPredictionReliabilitySeverity;
  global.advGrowthPredictionReliabilityLevelFromSeverity = advGrowthPredictionReliabilityLevelFromSeverity;
  global.advGrowthDowngradeReliabilityLevel = advGrowthDowngradeReliabilityLevel;
  global.advGrowthFormatReasonList = advGrowthFormatReasonList;
  global.advGrowthBuildReliabilityBadgeHtml = advGrowthBuildReliabilityBadgeHtml;
  global.advGrowthAssessBayleyPinneauReliability = advGrowthAssessBayleyPinneauReliability;
  global.advGrowthAssessRWTReliability = advGrowthAssessRWTReliability;
  global.advGrowthBuildPredictionReliabilityModel = advGrowthBuildPredictionReliabilityModel;
  global.advGrowthBuildPredictionReliabilityHtml = advGrowthBuildPredictionReliabilityHtml;
  global.advGrowthBuildPredictionReliabilitySummaryLine = advGrowthBuildPredictionReliabilitySummaryLine;
  global.advGrowthBuildMethodReliabilityDetailsParagraph = advGrowthBuildMethodReliabilityDetailsParagraph;
  global.buildBayleyPinneauResultHtml = buildBayleyPinneauResultHtml;
  global.advGrowthBuildBayleyPinneauSummaryText = advGrowthBuildBayleyPinneauSummaryText;
  global.advGrowthBuildBayleyPinneauSummaryCardLine = advGrowthBuildBayleyPinneauSummaryCardLine;
  global.rwtRoundHalfUp = rwtRoundHalfUp;
  global.rwtNormalizeSexKey = rwtNormalizeSexKey;
  global.rwtSexLabel = rwtSexLabel;
  global.rwtFormatAgeLabel = rwtFormatAgeLabel;
  global.rwtJoinRequirementLabels = rwtJoinRequirementLabels;
  global.rwtInterpolateAgeWeights = rwtInterpolateAgeWeights;
  global.rwtInterpolateErrorBoundRows = rwtInterpolateErrorBoundRows;
  global.calculateRWTPrediction = calculateRWTPrediction;
  global.calculateReinehrCdgpPrediction = calculateReinehrCdgpPrediction;
  global.buildRWTResultHtml = buildRWTResultHtml;
  global.advGrowthBuildRWTSummaryText = advGrowthBuildRWTSummaryText;
  global.advGrowthBuildRWTSummaryCardLine = advGrowthBuildRWTSummaryCardLine;
  global.advGrowthBuildRWTErrorIntervalSummaryCardLine = advGrowthBuildRWTErrorIntervalSummaryCardLine;
  global.collectAdvancedGrowthCalculationInput = collectAdvancedGrowthCalculationInput;
  global.buildAdvancedGrowthDataPayload = buildAdvancedGrowthDataPayload;
  global.commitAdvancedGrowthDataPayload = commitAdvancedGrowthDataPayload;
  global.clearAdvancedGrowthDataPayload = clearAdvancedGrowthDataPayload;
  global.clearAdvancedGrowthCalculationState = clearAdvancedGrowthCalculationState;
  global.commitAdvancedGrowthCalculationState = commitAdvancedGrowthCalculationState;
  global.finalizeAdvancedGrowthCalculationLifecycle = finalizeAdvancedGrowthCalculationLifecycle;
  global.calculateGrowthAdvanced = calculateGrowthAdvanced;
  global.advIntakeGetIntakeRows = advIntakeGetIntakeRows;
  global.advIntakeGetAdvancedRows = advIntakeGetAdvancedRows;
  global.advIntakeGetIntakeHistoryRows = advIntakeGetIntakeHistoryRows;
  global.advIntakeGetSyncId = advIntakeGetSyncId;
  global.advIntakeSetSyncId = advIntakeSetSyncId;
  global.advIntakeFindAdvancedRowBySyncId = advIntakeFindAdvancedRowBySyncId;
  global.advIntakeFindIntakeHistoryRowBySyncId = advIntakeFindIntakeHistoryRowBySyncId;
  global.advIntakeGetUserBasics = advIntakeGetUserBasics;
  global.advIntakeGetCompleteCurrentBasics = advIntakeGetCompleteCurrentBasics;
  global.advIntakeApproxEq = advIntakeApproxEq;
  global.advIntakeAdvRowAgeMonths = advIntakeAdvRowAgeMonths;
  global.advIntakeIntakeRowAgeMonths = advIntakeIntakeRowAgeMonths;
  global.advIntakeGetRawInputValue = advIntakeGetRawInputValue;
  global.advIntakeRowHasAnyData = advIntakeRowHasAnyData;
  global.advIntakeAdvRowHasAnyData = advIntakeAdvRowHasAnyData;
  global.advIntakeIntakeRowHasAnyData = advIntakeIntakeRowHasAnyData;
  global.advIntakeRowMatchesCurrentBasicsByMetrics = advIntakeRowMatchesCurrentBasicsByMetrics;
  global.advIntakeIntakeHistoryRowDuplicatesCurrentBasics = advIntakeIntakeHistoryRowDuplicatesCurrentBasics;
  global.advIntakeAdvancedHistoryRowDuplicatesCurrentBasics = advIntakeAdvancedHistoryRowDuplicatesCurrentBasics;
  global.advIntakeIsProtectedAdvancedHistoryRow = advIntakeIsProtectedAdvancedHistoryRow;
  global.advIntakeIsProtectedIntakeHistoryRow = advIntakeIsProtectedIntakeHistoryRow;
  global.advIntakeBuildAuditSnapshot = advIntakeBuildAuditSnapshot;
  global.pairAdvancedIntakeRowsByOrder = pairAdvancedIntakeRowsByOrder;
  global.handleAdvancedIntakeAdvancedMeasurementRowRemove = handleAdvancedIntakeAdvancedMeasurementRowRemove;
  global.handleAdvancedIntakeHistoryRowRemove = handleAdvancedIntakeHistoryRowRemove;
  global.handleAdvancedIntakeAdvancedMeasurementAdd = handleAdvancedIntakeAdvancedMeasurementAdd;
  global.handleAdvancedIntakeHistoryAdd = handleAdvancedIntakeHistoryAdd;
  global.setupAdvancedIntakeLiveWiring = setupAdvancedIntakeLiveWiring;
  global.isAdvancedGrowthProModeActive = isAdvancedGrowthProModeActive;
  global.addAdvMeasurementRow = addAdvMeasurementRow;
  global.updateAdvAgeMax = updateAdvAgeMax;
  global.updateAdvancedMeasurementAnalysisControls = updateAdvancedMeasurementAnalysisControls;
  global.updateAdvancedGrowthAccess = updateAdvancedGrowthAccess;
  global.getGrowthDataSourceAgeYears = getGrowthDataSourceAgeYears;
  global.isGrowthResultsProfessionalMode = isGrowthResultsProfessionalMode;
  global.normalizeGrowthDataSource = normalizeGrowthDataSource;
  global.isGrowthDataSourceAllowed = isGrowthDataSourceAllowed;
  global.getDefaultGrowthDataSource = getDefaultGrowthDataSource;
  global.setCheckedGrowthDataSource = setCheckedGrowthDataSource;
  global.rememberManualGrowthDataSource = rememberManualGrowthDataSource;
  global.refreshGrowthChartActionControls = refreshGrowthChartActionControls;
  global.syncGrowthDataSourceInputs = syncGrowthDataSourceInputs;
  global.updatePalczewskaAccess = updatePalczewskaAccess;
  global.updateGrowthDataSourceControls = updateGrowthDataSourceControls;

  global.advGrowthBuildTargetHeightForReport = advGrowthBuildTargetHeightForReport;
  global.advGrowthGetTargetStatsForReport = advGrowthGetTargetStatsForReport;
  global.advGrowthCollectHistoricalPointsForReport = advGrowthCollectHistoricalPointsForReport;
  global.advGrowthCollectAllPointsForReport = advGrowthCollectAllPointsForReport;
  global.advGrowthBuildReportRows = advGrowthBuildReportRows;
  global.advGrowthDrawPdfCell = advGrowthDrawPdfCell;
  global.advGrowthLoadScriptOnce = advGrowthLoadScriptOnce;
  global.advGrowthEnsurePdfMake = advGrowthEnsurePdfMake;
  global.advGrowthCreatePdfMakeCell = advGrowthCreatePdfMakeCell;
  global.advGrowthBuildPdfMakeDefinition = advGrowthBuildPdfMakeDefinition;
  global.advGrowthDecodeCentileEntities = advGrowthDecodeCentileEntities;
  global.advGrowthFormatAdultHeightValue = advGrowthFormatAdultHeightValue;
  global.advGrowthBuildParentHeightSummaryText = advGrowthBuildParentHeightSummaryText;
  global.advGrowthBuildMphSummaryText = advGrowthBuildMphSummaryText;
  global.advGrowthBuildReportPresentationModel = advGrowthBuildReportPresentationModel;
  global.advGrowthBuildHtmlReportMarkup = advGrowthBuildHtmlReportMarkup;
  global.advGrowthGeneratePdfViaCanvas = advGrowthGeneratePdfViaCanvas;
  global.generateAdvancedGrowthPdfReport = generateAdvancedGrowthPdfReport;
  global.ensureAdvancedGrowthReportControls = ensureAdvancedGrowthReportControls;
  global.removeAdvancedGrowthClearButton = removeAdvancedGrowthClearButton;
  global.updateAdvancedGrowthReportButtonVisibility = updateAdvancedGrowthReportButtonVisibility;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
