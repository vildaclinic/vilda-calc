/*
 * Vilda Data Import/Export Helper v1.10.5
 *
 * Etapy 8L-1–8L-5: neutralne helpery DOM/liczbowe, synchronizacja imienia,
 * sanityzatory danych, collectUserData()/saveUserData(), wiring przycisków
 * zapisu/wczytywania, ciche settery/restore trybu PRO i źródeł centyli,
 * rehydratacja historii advanced/intake oraz stan przycisków/autosave sesji
 * głównej wydzielone z app.js bez przenoszenia pełnego applyLoadedData()
 * ani restoreLoadedState().
 * Etap 8L-6a: clearAllData() i reset historii po pełnym czyszczeniu danych.
 * Etap 8L-6b: restoreLoadedState(), showRestoreButton() i restoreStateBtn.
 * Etap 8L-7a: handleFile(), walidacja pliku JSON oraz FileReader.
 * Etap 8L-7b: syncSharedUserDataFromLoadedData() i normalizeSharedPersistRoot().
 * Etap 8L-7c: applyLoadedData() jako ostatnia wysoka ścieżka importu JSON.
 * Etap 8M: audyt końcowy API, wrapperów i scenariuszy import/export/restore.
 * Etap 8Q-4c: Klirens import JSON w trybie preview-only; pola formularza
 * wypełniają się dopiero po kliknięciu „Odtwórz zapisany stan”.
 */
(function (global) {
  'use strict';

  if (!global) return;
  if (global.VildaDataImportExport && global.VildaDataImportExport.__vildaDataImportExport) {
    return;
  }

  const VERSION = '1.10.5';

  const FINAL_AUDIT_REQUIRED_API = Object.freeze([
    'q',
    'num',
    'val',
    'syncNames',
    'collectUserData',
    'saveUserData',
    'initJsonDataImportExport',
    'anyDataEntered',
    'updateSaveBtnVisibility',
    'clearMainSessionStorage',
    'saveMainSessionNow',
    'scheduleMainSessionSave',
    'restoreMainSessionIfAny',
    'hasMeaningfulMainSessionData',
    'clearAllData',
    'showRestoreButton',
    'restoreLoadedState',
    'initRestoreStateButton',
    'handleFile',
    'normalizeSharedPersistRoot',
    'syncSharedUserDataFromLoadedData',
    'applyLoadedData'
  ]);
  const FINAL_AUDIT_GLOBAL_WRAPPERS = Object.freeze([
    'window.vildaExport.collectUserData',
    'window.vildaExport.saveUserData',
    'window.vildaExport.applyLoadedData',
    'window.vildaExport.clearAllData',
    'window.vildaSession.saveNow',
    'window.vildaSession.schedule',
    'window.vildaSession.clear',
    'window.vildaSession.restore',
    'window.handleFile',
    'window.applyLoadedData',
    'window.restoreLoadedState',
    'window.clearAllData'
  ]);
  const FINAL_AUDIT_SCENARIOS = Object.freeze([
    'export JSON: collectUserData() + saveUserData()',
    'import JSON: handleFile() -> parse JSON -> applyLoadedData()',
    'sharedUserData: normalizeSharedPersistRoot() + syncSharedUserDataFromLoadedData()',
    'restore: showRestoreButton() + restoreLoadedState()',
    'session: saveMainSessionNow() + restoreMainSessionIfAny()',
    'clear: clearAllData() + clearMainSessionStorage()'
  ]);
  const FINAL_AUDIT = Object.freeze({
    step: '8M',
    status: 'done',
    module: 'vilda_data_import_export.js',
    appJsRole: 'wrapper-only',
    version: VERSION,
    requiredApi: FINAL_AUDIT_REQUIRED_API,
    expectedGlobalWrappers: FINAL_AUDIT_GLOBAL_WRAPPERS,
    smokeScenarios: FINAL_AUDIT_SCENARIOS,
    notes: [
      'Pełne ścieżki importu/eksportu JSON są w VildaDataImportExport.',
      'app.js zachowuje cienkie wrappery kompatybilnościowe oraz callbacki lokalnego stanu.',
      'Pełne testy end-to-end w przeglądarce pozostają zalecane po wdrożeniu.'
    ]
  });
  let dataImportExportApiRef = null;

  function cloneAuditValue(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_) {
      return value;
    }
  }

  function getFinalAudit() {
    return cloneAuditValue(FINAL_AUDIT);
  }

  function getApiSurfaceStatus() {
    const target = dataImportExportApiRef || global.VildaDataImportExport || {};
    const missingApi = FINAL_AUDIT_REQUIRED_API.filter(function missingApiName(name) {
      return typeof target[name] !== 'function';
    });
    const wrapperStatus = FINAL_AUDIT_GLOBAL_WRAPPERS.map(function resolveWrapperStatus(path) {
      const parts = String(path).replace(/^window\./, '').split('.');
      let current = global;
      for (let i = 0; i < parts.length; i += 1) {
        if (!current || !(parts[i] in current)) return { path, available: false };
        current = current[parts[i]];
      }
      return { path, available: typeof current === 'function' || (current && typeof current === 'object') };
    });
    const missingWrappers = wrapperStatus
      .filter(function notAvailable(item) { return !item.available; })
      .map(function wrapperPath(item) { return item.path; });
    return {
      step: '8M',
      version: VERSION,
      ok: missingApi.length === 0,
      requiredApiCount: FINAL_AUDIT_REQUIRED_API.length,
      missingApi,
      wrapperStatus,
      missingWrappers,
      scenarios: FINAL_AUDIT_SCENARIOS.slice()
    };
  }

  function dumpFinalAudit() {
    const status = getApiSurfaceStatus();
    try {
      if (global.console && typeof global.console.table === 'function') {
        global.console.table(status.wrapperStatus);
      }
      if (global.console && typeof global.console.log === 'function') {
        global.console.log('VildaDataImportExport 8M audit', status);
      }
    } catch (_) {}
    return status;
  }


  function logSwallowed(context, error, meta) {
    try {
      if (global && typeof global.vildaLogSwallowedCatch === 'function') {
        global.vildaLogSwallowedCatch(context, error, meta || {});
        return;
      }
      if (global && global.VildaLogger && typeof global.VildaLogger.warn === 'function') {
        global.VildaLogger.warn(context, error && error.message ? error.message : String(error || ''), meta || {});
      }
    } catch (_) {
      void _;
      // Logger fallback intentionally silent to avoid recursive diagnostics.
    }
  }

  function q(id) {
    try {
      return global.document ? global.document.getElementById(id) : null;
    } catch (error) {
      logSwallowed('vilda_data_import_export:q', error, { id });
      return null;
    }
  }

  function num(value) {
    const raw = value == null ? '' : String(value).trim();
    if (raw === '') return null;
    const n = Number(raw.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  function isFinitePositive(value) {
    const n = typeof value === 'number' ? value : num(value);
    return Number.isFinite(n) && n > 0;
  }

  function isFiniteNonNegative(value) {
    const n = typeof value === 'number' ? value : num(value);
    return Number.isFinite(n) && n >= 0;
  }

  function hasExplicitNumericField(id) {
    const raw = val(id);
    return raw != null && String(raw).trim() !== '' && num(raw) !== null;
  }

  function val(id) {
    const el = q(id);
    return el ? el.value : '';
  }

  function getTip(el) {
    if (!el || typeof el.getAttribute !== 'function') return '';
    const dt = el.getAttribute('data-tip');
    if (dt && dt.trim() !== '') return dt;
    const title = el.getAttribute('title');
    return title || '';
  }

  function migrateTitleToDataTip(el) {
    if (!el || typeof el.getAttribute !== 'function' || typeof el.setAttribute !== 'function') return;
    const title = el.getAttribute('title');
    if (title) {
      if (!el.getAttribute('data-tip')) {
        el.setAttribute('data-tip', title);
      }
      if (typeof el.removeAttribute === 'function') {
        el.removeAttribute('title');
      }
    }
  }

  function dispatchInputEvent(el) {
    if (!el || typeof el.dispatchEvent !== 'function') return;
    try {
      let ev = null;
      if (typeof global.Event === 'function') {
        ev = new global.Event('input', { bubbles: true });
      } else if (global.document && typeof global.document.createEvent === 'function') {
        ev = global.document.createEvent('Event');
        ev.initEvent('input', true, true);
      }
      if (ev) el.dispatchEvent(ev);
    } catch (error) {
      logSwallowed('vilda_data_import_export:dispatchInputEvent', error, { elementId: el && el.id });
    }
  }

  function syncNames(source, options) {
    const opts = (options && typeof options === 'object') ? options : {};
    const window = global;
    const document = global.document || null;
    const Event = global.Event || function VildaFallbackEvent(type) { this.type = type; };
    const nameEl = q('name');
    const advEl = q('advName');
    if (!nameEl || !advEl) return;

    if (source === 'name') {
      advEl.value = nameEl.value;
      dispatchInputEvent(advEl);
    } else if (source === 'adv') {
      nameEl.value = advEl.value;
      dispatchInputEvent(nameEl);
    }

    const updateSaveBtnVisibility = (typeof opts.updateSaveBtnVisibility === 'function')
      ? opts.updateSaveBtnVisibility
      : (typeof global.updateSaveBtnVisibility === 'function' ? global.updateSaveBtnVisibility : null);
    if (updateSaveBtnVisibility) {
      try {
        updateSaveBtnVisibility();
      } catch (error) {
        logSwallowed('vilda_data_import_export:syncNames:updateSaveBtnVisibility', error, { source });
      }
    }
  }

  function normalizePersistNumber(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' && value.trim() === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function normalizeAgeMonthsValue(ageMonthsValue, ageYearsValue) {
    const direct = normalizePersistNumber(ageMonthsValue);
    if (direct !== null) return Math.round(direct);
    const ageYears = normalizePersistNumber(ageYearsValue);
    return (ageYears !== null) ? Math.round(ageYears * 12) : null;
  }

  function sanitizeAdvancedMeasurementEntries(entries) {
    if (!Array.isArray(entries)) return [];
    const out = [];
    const seen = new Set();
    entries.forEach((entry) => {
      if (!entry || typeof entry !== 'object') return;
      const ageMonths = normalizeAgeMonthsValue(entry.ageMonths, entry.ageYears);
      if (ageMonths === null) return;
      const height = normalizePersistNumber(entry.height);
      const weight = normalizePersistNumber(entry.weight);
      const boneAgeYears = normalizePersistNumber(entry.boneAgeYears);
      const arrowEnabled = !!entry.arrowEnabled;
      const arrowComment = (typeof entry.arrowComment === 'string') ? entry.arrowComment.trim() : '';
      const ghSync = !!entry.ghSync;
      const ghId = (entry.ghId != null && String(entry.ghId).trim() !== '') ? String(entry.ghId).trim() : '';
      const hasPayload = (height !== null) || (weight !== null) || (boneAgeYears !== null) || arrowEnabled || !!arrowComment || ghSync || !!ghId;
      if (!hasPayload) return;
      const key = [
        ageMonths,
        height !== null ? height.toFixed(3) : '',
        weight !== null ? weight.toFixed(3) : '',
        boneAgeYears !== null ? boneAgeYears.toFixed(3) : '',
        arrowEnabled ? '1' : '0',
        arrowComment,
        ghSync ? '1' : '0',
        ghId
      ].join('|');
      if (seen.has(key)) return;
      seen.add(key);
      const next = Object.assign({}, entry, {
        ageMonths,
        ageYears: ageMonths / 12,
        height,
        weight,
        boneAgeYears,
        arrowEnabled,
        arrowComment,
        ghSync,
        ghId: ghId || null
      });
      out.push(next);
    });
    out.sort((a, b) => a.ageMonths - b.ageMonths);
    return out;
  }

  function sanitizeAdvancedRowsUI(rowsUI) {
    if (!Array.isArray(rowsUI)) return [];
    return rowsUI
      .filter((item) => {
        if (!item || typeof item !== 'object') return false;
        const fields = [item.ageY, item.ageM, item.ht, item.wt, item.boneAge];
        const hasText = fields.some((value) => String(value ?? '').trim() !== '');
        const hasMeta = !!item.arrowEnabled
          || !!(typeof item.arrowComment === 'string' && item.arrowComment.trim())
          || !!item.ghSync
          || !!(item.ghId != null && String(item.ghId).trim() !== '');
        return hasText || hasMeta;
      })
      .map((item) => ({
        ageY: item.ageY ?? '',
        ageM: item.ageM ?? '',
        ht: item.ht ?? '',
        wt: item.wt ?? '',
        boneAge: item.boneAge ?? '',
        arrowEnabled: !!item.arrowEnabled,
        arrowComment: (typeof item.arrowComment === 'string') ? item.arrowComment : '',
        ghSync: !!item.ghSync,
        ghId: (item.ghId != null) ? String(item.ghId) : ''
      }));
  }

  function normalizeIntakeCurrentBasics(currentBasics) {
    if (!currentBasics || typeof currentBasics !== 'object') return null;
    const ageMonths = normalizePersistNumber(currentBasics.ageMonths);
    const height = normalizePersistNumber(currentBasics.height);
    const weight = normalizePersistNumber(currentBasics.weight);
    if (ageMonths === null || height === null || weight === null) return null;
    return { ageMonths: Math.round(ageMonths), height, weight };
  }

  function intakeHistoryEntryMatchesCurrentBasics(ageMonths, height, weight, currentBasics) {
    const basics = normalizeIntakeCurrentBasics(currentBasics);
    if (!basics || ageMonths === null) return false;
    if (Math.round(ageMonths) !== basics.ageMonths) return false;

    let compared = 0;
    if (height !== null && typeof basics.height === 'number') {
      compared += 1;
      if (Math.abs(height - basics.height) > 0.05) return false;
    }
    if (weight !== null && typeof basics.weight === 'number') {
      compared += 1;
      if (Math.abs(weight - basics.weight) > 0.05) return false;
    }
    return compared > 0;
  }

  function sanitizeIntakeHistoryEntries(entries, options) {
    const opts = (options && typeof options === 'object') ? options : {};
    const currentBasics = normalizeIntakeCurrentBasics(opts.currentBasics);
    const omitCurrentDuplicate = !!opts.omitCurrentDuplicate;
    if (!Array.isArray(entries)) return [];
    const out = [];
    const seen = new Set();
    entries.forEach((entry) => {
      if (!entry || typeof entry !== 'object') return;
      const ageMonths = normalizeAgeMonthsValue(entry.ageMonths, entry.ageYears);
      if (ageMonths === null) return;
      const height = normalizePersistNumber(entry.height);
      const weight = normalizePersistNumber(entry.weight);
      if (height === null && weight === null) return;
      if (omitCurrentDuplicate && intakeHistoryEntryMatchesCurrentBasics(ageMonths, height, weight, currentBasics)) {
        return;
      }
      const key = [
        ageMonths,
        height !== null ? height.toFixed(3) : '',
        weight !== null ? weight.toFixed(3) : ''
      ].join('|');
      if (seen.has(key)) return;
      seen.add(key);
      out.push({
        ageMonths,
        ageYears: ageMonths / 12,
        height,
        weight
      });
    });
    out.sort((a, b) => a.ageMonths - b.ageMonths);
    return out;
  }

  function sanitizeIntakeRowsUI(rowsUI) {
    if (!Array.isArray(rowsUI)) return [];
    return rowsUI
      .filter((item) => {
        if (!item || typeof item !== 'object') return false;
        const fields = [item.ageY, item.ageM, item.ht, item.wt];
        return fields.some((value) => String(value ?? '').trim() !== '');
      })
      .map((item) => ({
        ageY: item.ageY ?? '',
        ageM: item.ageM ?? '',
        ht: item.ht ?? '',
        wt: item.wt ?? '',
        locked: !!item.locked,
        disabled: {
          ageY: !!(item.disabled && item.disabled.ageY),
          ageM: !!(item.disabled && item.disabled.ageM),
          ht: !!(item.disabled && item.disabled.ht),
          wt: !!(item.disabled && item.disabled.wt)
        }
      }));
  }


  function cloneForExport(value) {
    if (value === null || value === undefined) return null;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      logSwallowed('vilda_data_import_export:cloneForExport', error);
      return null;
    }
  }

  function getFoodDictionaries() {
    const foodData = (global.VildaFoodData || global.vildaFoodData || {});
    const snacks = (foodData.snacks && typeof foodData.snacks === 'object') ? foodData.snacks : {};
    const meals = (foodData.meals && typeof foodData.meals === 'object') ? foodData.meals : {};
    const foods = (foodData.foods && typeof foodData.foods === 'object')
      ? foodData.foods
      : Object.assign({}, snacks, meals);
    return { snacks, meals, foods };
  }

  function getPersistenceAdapter() {
    try {
      return global.VildaPersistence || global.vildaPersistence || null;
    } catch (error) {
      logSwallowed('vilda_data_import_export:getPersistenceAdapter', error);
      return null;
    }
  }

  function resolveCallback(options, name, fallbackName) {
    const opts = (options && typeof options === 'object') ? options : {};
    if (typeof opts[name] === 'function') return opts[name];
    const globalName = fallbackName || name;
    if (global && typeof global[globalName] === 'function') return global[globalName];
    return null;
  }

  function setFieldValueSilently(el, value, options) {
    if (!el) return null;
    const opts = (options && typeof options === 'object') ? options : {};
    const nextValue = (value == null || Number.isNaN(value)) ? '' : String(value);
    try {
      el.value = nextValue;
    } catch (error) {
      logSwallowed('vilda_data_import_export:setFieldValueSilently:value', error, { elementId: el && el.id });
    }
    if (Object.prototype.hasOwnProperty.call(opts, 'disabled')) {
      try {
        el.disabled = !!opts.disabled;
      } catch (error) {
        logSwallowed('vilda_data_import_export:setFieldValueSilently:disabled', error, { elementId: el && el.id });
      }
    }
    return el;
  }

  function setCheckboxValueSilently(el, checked) {
    if (!el) return null;
    try {
      el.checked = !!checked;
    } catch (error) {
      logSwallowed('vilda_data_import_export:setCheckboxValueSilently', error, { elementId: el && el.id });
    }
    return el;
  }

  function callRestoreHook(options, name, args, fallbackName) {
    const fn = resolveCallback(options, name, fallbackName || name);
    if (typeof fn !== 'function') return undefined;
    try {
      return fn.apply(global, Array.isArray(args) ? args : []);
    } catch (error) {
      logSwallowed('vilda_data_import_export:' + name, error);
      return undefined;
    }
  }

  function applyResultsModeRestoreState(isProfessional, options) {
    const opts = (options && typeof options === 'object') ? options : {};
    const pro = !!isProfessional;

    const setProfessionalMode = resolveCallback(opts, 'setProfessionalMode', null);
    if (setProfessionalMode) {
      try {
        setProfessionalMode(pro);
      } catch (error) {
        logSwallowed('vilda_data_import_export:applyResultsModeRestoreState:setProfessionalMode', error, { professionalMode: pro });
      }
    }
    try {
      global.professionalMode = pro;
    } catch (error) {
      logSwallowed('vilda_data_import_export:applyResultsModeRestoreState:globalProfessionalMode', error, { professionalMode: pro });
    }

    const writeResultsModeStorage = resolveCallback(opts, 'writeResultsModeStorage', 'writeResultsModeStorage');
    if (writeResultsModeStorage) {
      try {
        writeResultsModeStorage(pro ? 'professional' : 'standard');
      } catch (error) {
        logSwallowed('vilda_data_import_export:applyResultsModeRestoreState:writeStorage', error, { professionalMode: pro });
      }
    }

    try {
      if (global.document && global.document.body && global.document.body.classList) {
        global.document.body.classList.remove('professional-bg');
      }
    } catch (error) {
      logSwallowed('vilda_data_import_export:applyResultsModeRestoreState:bodyClass', error);
    }

    try {
      const summaryIds = ['currentSummaryCard', 'currentSummaryCardLeft', 'currentSummaryCardRight'];
      summaryIds.forEach((sid) => {
        const card = q(sid);
        if (!card) return;
        if (pro) card.classList.add('pro-summary-card');
        else card.classList.remove('pro-summary-card');
        const label = (typeof card.querySelector === 'function') ? card.querySelector('.pro-summary-label') : null;
        if (label) label.style.display = pro ? 'block' : 'none';
      });
    } catch (error) {
      logSwallowed('vilda_data_import_export:applyResultsModeRestoreState:summaryCards', error, { professionalMode: pro });
    }

    callRestoreHook(opts, 'updateAdvancedGrowthAccess', []);
    callRestoreHook(opts, 'updatePalczewskaAccess', []);
    callRestoreHook(opts, 'updateCompareInstructionVisibility', []);
    callRestoreHook(opts, 'applyThemeCustom', [], 'applyThemeCustom');
    callRestoreHook(opts, 'dispatchResultsModeSyncEvent', [pro], 'dispatchResultsModeSyncEvent');

    return { professionalMode: pro };
  }

  function applyDataSourceRestoreState(dataSourceValue, options) {
    const opts = (options && typeof options === 'object') ? options : {};
    const value = (typeof dataSourceValue === 'string') ? dataSourceValue : '';
    let selected = null;

    try {
      const radios = (global.document && typeof global.document.querySelectorAll === 'function')
        ? global.document.querySelectorAll('input[name="dataSource"]')
        : [];
      radios.forEach((radio) => {
        const shouldCheck = !!value && radio.value === value;
        radio.checked = shouldCheck;
        if (shouldCheck) selected = radio;
      });
    } catch (error) {
      logSwallowed('vilda_data_import_export:applyDataSourceRestoreState:radios', error, { value });
    }

    try {
      const toggleContainer = q('dataToggleContainer');
      if (toggleContainer && selected) {
        toggleContainer.dataset.manual = '1';
        toggleContainer.dataset.preferredSource = selected.value;
      }
    } catch (error) {
      logSwallowed('vilda_data_import_export:applyDataSourceRestoreState:toggleContainer', error, { value });
    }

    try {
      if (selected && typeof selected.value === 'string' && selected.value) {
        const setBmiSource = resolveCallback(opts, 'setBmiSource', null);
        if (setBmiSource) setBmiSource(selected.value);
        else global.bmiSource = selected.value;
      }
    } catch (error) {
      logSwallowed('vilda_data_import_export:applyDataSourceRestoreState:setBmiSource', error, { value });
    }

    return selected;
  }

  function callTooltip(target, message, options) {
    const showTooltip = resolveCallback(options, 'showTooltip', 'showTooltip');
    if (showTooltip) {
      try {
        showTooltip(target, message);
        return true;
      } catch (error) {
        logSwallowed('vilda_data_import_export:showTooltip', error, { message });
      }
    }
    try {
      if (global && typeof global.alert === 'function') {
        global.alert(message);
        return true;
      }
    } catch (error) {
      logSwallowed('vilda_data_import_export:alertFallback', error, { message });
    }
    return false;
  }

  function readFoodRows(selector) {
    const rows = [];
    if (!global.document || typeof global.document.querySelectorAll !== 'function') return rows;
    try {
      global.document.querySelectorAll(selector || '.food-row').forEach((row) => {
        if (!row || typeof row.querySelector !== 'function') return;
        const sel = row.querySelector('select');
        const inp = row.querySelector('input[type="number"]');
        if (!sel || !inp) return;
        const key = sel.value;
        const qty = parseFloat(inp.value) || 0;
        if (qty > 0) rows.push({ key, qty });
      });
    } catch (error) {
      logSwallowed('vilda_data_import_export:readFoodRows', error, { selector });
    }
    return rows;
  }

  function flushClcrSessionBeforeCollect(reason) {
    try {
      const runtime = global.VildaClcrSessionRuntime;
      if (runtime && typeof runtime.saveNow === 'function') {
        return !!runtime.saveNow({ force: true, reason: reason || 'collect-user-data' });
      }
      if (typeof global.clcrSaveSessionNow === 'function') {
        return !!global.clcrSaveSessionNow({ force: true, reason: reason || 'collect-user-data' });
      }
      if (typeof global.saveClcrSession === 'function') {
        return !!global.saveClcrSession({ force: true, reason: reason || 'collect-user-data' });
      }
    } catch (error) {
      logSwallowed('vilda_data_import_export:flushClcrSessionBeforeCollect', error, { reason: reason || 'collect-user-data' });
    }
    return false;
  }

  function collectUserData(options) {
    const opts = (options && typeof options === 'object') ? options : {};
    flushClcrSessionBeforeCollect(opts.source || 'collect-user-data');
    const dicts = getFoodDictionaries();
    const snacks = (opts.snacks && typeof opts.snacks === 'object') ? opts.snacks : dicts.snacks;
    const meals = (opts.meals && typeof opts.meals === 'object') ? opts.meals : dicts.meals;

    const name = (val('name') || val('advName') || val('fullName') || '').trim();
    const ageYearsField = num(val('age'));
    const ageMonthsField = num(val('ageMonths'));
    const user = {
      age: ageYearsField != null ? ageYearsField : (ageMonthsField != null ? 0 : null),
      ageMonths: ageMonthsField != null ? ageMonthsField : 0,
      sex: val('sex') || 'M',
      weight: num(val('weight')),
      height: num(val('height')),
      waist: num(val('waistCm')),
      hip: num(val('hipCm'))
    };

    const adv = {
      name: (val('advName') || name),
      boneAgeYears: num(val('advBoneAge')),
      motherHeight: num(val('advMotherHeight')),
      fatherHeight: num(val('advFatherHeight')),
      testicularVolume: (val('advTesticularVolume') || null),
      familyDelayedPuberty: (val('advFamilyDelayedPuberty') || null),
      growthExclusion: (val('advGrowthExclusion') || null),
      data: (global.advancedGrowthData ? cloneForExport(global.advancedGrowthData) : null)
    };

    const growthBasic = {
      name: (val('basicGrowthName') || name),
      data: (global.basicGrowthData ? cloneForExport(global.basicGrowthData) : null)
    };

    const intake = {
      pal: val('intakePal') || null,
      history: (Array.isArray(global.intakeHistory) ? cloneForExport(global.intakeHistory) : null),
      estKcalPerDay: (typeof global.intakeEstimatedKcalPerDay === 'number' ? global.intakeEstimatedKcalPerDay : null)
    };

    const foodRows = readFoodRows('.food-row');
    const snackRows = foodRows.filter((row) => row && row.key in snacks);
    const mealRows = foodRows.filter((row) => row && row.key in meals);

    const plan = {
      palFactor: num((q('palFactor') || {}).value),
      dietLevel: (q('dietLevel') || {}).value || null
    };

    let clcr = null;
    try {
      const persistence = getPersistenceAdapter();
      if (persistence && typeof persistence.readClcrSession === 'function') {
        const parsed = persistence.readClcrSession();
        if (parsed && typeof parsed === 'object') clcr = parsed;
      }
    } catch (error) {
      logSwallowed('vilda_data_import_export:collectUserData:clcr', error);
    }

    const bp = {
      heartRate: num(val('heartRate')),
      temperature: num(val('hrTemperature')),
      population: val('hrPopulation') || null,
      systolic: num(val('bpSystolic')),
      diastolic: num(val('bpDiastolic'))
    };

    const adultVitals = {
      guideline: (function () {
        const el = q('adultBpGuidelineToggle');
        return el ? (el.checked ? 'ESC' : 'AHA') : null;
      })(),
      heartRate: num(val('adultHeartRate')),
      systolic: num(val('adultBpSystolic')),
      diastolic: num(val('adultBpDiastolic')),
      athlete: (function () { const el = q('adultHrAthlete'); return el ? !!el.checked : null; })(),
      betaBlocker: (function () { const el = q('adultHrBetaBlocker'); return el ? !!el.checked : null; })()
    };

    const respiratory = {
      rate: num(val('respiratoryRateInput')),
      temperature: num(val('respTemperature')),
      state: val('respState') || null,
      population: val('respPopulation') || null
    };

    const circumference = {
      head: num(val('headCircumference')),
      chest: num(val('chestCircumference')),
      headDs: num(val('headCircumDS'))
    };

    const doctor = {
      isDoctor: (function () {
        const el = q('isDoctor');
        return el ? !!el.checked : null;
      })(),
      pwzNumber: (function () {
        const v = val('pwzNumber');
        return v && v.trim().length ? v.trim() : null;
      })()
    };

    const bisphos = {
      indication: (function () { const el = q('bisphosIndication'); return el ? el.value || null : null; })(),
      drug: (function () { const el = q('bisphosDrug'); return el ? el.value || null : null; })(),
      doseNumber: (function () { const el = q('bisphosDoseNumber'); return el ? el.value || null : null; })()
    };

    const zscore = {
      resultsMode: (function () { const el = q('resultsModeToggle'); return el ? !!el.checked : null; })(),
      dataSource: (function () {
        try {
          const radios = global.document ? global.document.querySelectorAll('input[name="dataSource"]') : [];
          for (const radio of radios) {
            if (radio.checked) return radio.value || null;
          }
        } catch (error) {
          logSwallowed('vilda_data_import_export:collectUserData:zscoreSource', error);
        }
        return null;
      })()
    };

    const bpDataToggle = (function () {
      const el = q('bpDataToggle');
      return el ? !!el.checked : null;
    })();

    let ghTherapyPoints = [];
    try {
      if (Array.isArray(global.ghTherapyPoints)) {
        ghTherapyPoints = cloneForExport(global.ghTherapyPoints) || [];
      }
    } catch (error) {
      logSwallowed('vilda_data_import_export:collectUserData:ghTherapyPoints', error);
    }

    return {
      version: 1,
      timestampISO: new Date().toISOString(),
      name,
      user,
      advanced: adv,
      growthBasic,
      intake,
      foods: { snacks: snackRows, meals: mealRows },
      plan,
      clcr,
      bp,
      adultVitals,
      respiratory,
      circumference,
      doctor,
      bisphos,
      zscore,
      bpDataToggle,
      ghTherapyPoints
    };
  }

  function sanitizeFilename(name) {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const dateStr = `${day}_${month}_${year}`;
    if (!name || !String(name).trim()) return `dane_${dateStr}`;
    const sanitizedName = String(name)
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[\\/:*?"<>|]/g, '-');
    return `${sanitizedName}_${dateStr}`;
  }

  function saveUserData(options) {
    const opts = (options && typeof options === 'object') ? options : {};
    const data = (typeof opts.collectUserData === 'function') ? opts.collectUserData() : collectUserData(opts);
    const saveBtnEl = q('saveDataBtn');

    if (!(data && data.user && isFiniteNonNegative(data.user.age) && isFinitePositive(data.user.weight) && isFinitePositive(data.user.height))) {
      callTooltip(saveBtnEl, 'Uzupełnij: wiek, wagę i wzrost przed zapisem.', opts);
      return null;
    }

    if (!(data.name && data.name.trim().length)) {
      callTooltip(saveBtnEl, 'Podaj „Imię i Nazwisko” przed zapisem.', opts);
      return null;
    }

    // Etap 8R-4b: zapis idzie wyłącznie przez VildaVault. Tryb gościa, vault
    // zablokowany, brak skonfigurowanego konta — wszystkie pokazują tooltip
    // i nie zapisują nic. Niezaszyfrowanego pliku JSON aplikacja już nie
    // produkuje.
    const vault = global.VildaVault;
    const isGuest = global.VildaGuestMode === true;
    if (isGuest) {
      callTooltip(saveBtnEl, 'Zaloguj się, aby zapisywać dane pacjentów.', opts);
      return null;
    }
    if (!vault || typeof vault.isUnlocked !== 'function') {
      callTooltip(saveBtnEl, 'Brak modułu zapisu — odśwież stronę.', opts);
      return null;
    }
    if (!vault.isUnlocked()) {
      callTooltip(saveBtnEl, 'Zaloguj się, aby zapisać dane pacjentów.', opts);
      return null;
    }

    // K1: wycofano automatyczne wstrzykiwanie aktualnego pomiaru do tabeli
    // historycznej (FIX A/B/C). Patrz komentarz w applyLoadedData. Snapshot
    // zapisany w vault będzie miał aktualny pomiar TYLKO w `payload.user.{*}`,
    // a `payload.advanced.data.measurements` trzyma TYLKO świadomie dodane
    // wpisy historyczne. Vault listPatientTimelineEvents generuje chip dla
    // pomiaru aktualnego z payload.user (bezwarunkowy fallback).

    Promise.resolve()
      .then(function () { return vault.savePatient(data); })
      .then(function (result) {
        const name = (result && result.header && result.header.name) ? result.header.name : data.name;
        const msg = (result && result.isNew)
          ? 'Zapisano nowego pacjenta: ' + name + '.'
          : 'Zapisano (snapshot ' + (result && result.snapshotCount) + ') dla ' + name + '.';
        callTooltip(saveBtnEl, msg, opts);

        // H2: dispatch „vilda:patient-loaded" po pomyślnym zapisie. Ten sam event
        // dispatchowany jest po „Wczytaj tego pacjenta" w karcie pacjenta — listener
        // w custom-fixes.js zapamiętuje patientId w window._vildaCurrentPatientId,
        // co aktywuje sidebar „Dodaj notatkę do wizyty". Bez tego user musi po
        // zapisie wchodzić w Pacjenci → wybierać → Wczytaj, żeby button się odblokował.
        // Pokrywa scenariusze: nowy pacjent zapisany od zera, zaktualizowany pomiar
        // istniejącego pacjenta z formularza, dedup po imieniu+wieku.
        try {
          if (result && result.patientId && typeof global.CustomEvent === 'function' && global.document) {
            global.document.dispatchEvent(new global.CustomEvent('vilda:patient-loaded', {
              detail: {
                patientId: result.patientId,
                savedAtISO: (result && result.savedAtISO) || null,
                snapshotCount: (result && result.snapshotCount) || null,
                name: name
              }
            }));
          }
        } catch (eventErr) {
          logSwallowed('vilda_data_import_export:saveUserData:dispatch-patient-loaded', eventErr);
        }
      })
      .catch(function (e) {
        logSwallowed('vilda_data_import_export:saveUserData:vault', e);
        callTooltip(saveBtnEl, 'Nie udało się zapisać pacjenta: ' + (e && e.message ? e.message : 'błąd'), opts);
      });
    return data;
  }


  function getImportFileFromEvent(event, options) {
    const opts = (options && typeof options === 'object') ? options : {};
    if (opts.file) return opts.file;
    const input = (event && event.target) ? event.target : null;
    try {
      if (input && input.files && input.files[0]) return input.files[0];
    } catch (error) {
      logSwallowed('vilda_data_import_export:getImportFileFromEvent', error);
    }
    return null;
  }


  function validateJsonImportFile(file, options) {
    const opts = (options && typeof options === 'object') ? options : {};
    if (!file) return { ok: false, reason: 'missing-file', message: '' };

    const name = (typeof file.name === 'string') ? file.name : '';
    const type = (typeof file.type === 'string') ? file.type : '';
    const lowerName = name.toLowerCase();
    const looksLikeJson = /\.json$/i.test(lowerName) || /(^|\/)json($|;)/i.test(type) || type === '';
    if (!looksLikeJson) {
      return {
        ok: false,
        reason: 'file-type',
        message: 'Wybierz plik JSON wygenerowany przez aplikację.',
        fileName: name,
        fileType: type
      };
    }

    const maxBytes = Number(opts.maxJsonImportBytes || opts.maxFileSizeBytes || 10 * 1024 * 1024);
    const size = Number(file.size || 0);
    if (Number.isFinite(maxBytes) && maxBytes > 0 && size > maxBytes) {
      return {
        ok: false,
        reason: 'file-too-large',
        message: 'Plik JSON jest zbyt duży do bezpiecznego wczytania.',
        fileName: name,
        fileSize: size,
        maxBytes
      };
    }

    return { ok: true, reason: 'ok' };
  }

  function resetFileInput(eventOrInput) {
    const input = eventOrInput && eventOrInput.target ? eventOrInput.target : eventOrInput;
    if (!input) return false;
    try {
      input.value = '';
      return true;
    } catch (error) {
      logSwallowed('vilda_data_import_export:resetFileInput', error, { elementId: input && input.id });
      return false;
    }
  }

  function notifyJsonImportError(message, options, error) {
    const opts = (options && typeof options === 'object') ? options : {};
    const loadBtnEl = opts.loadButton || q('loadDataBtn');
    if (error) {
      logSwallowed('vilda_data_import_export:json-import-error', error, { message });
    }
    callTooltip(loadBtnEl, message || 'Nieprawidłowy plik JSON.', opts);
  }

  function parseJsonImportText(text, options) {
    const opts = (options && typeof options === 'object') ? options : {};
    const raw = (typeof text === 'string') ? text : String(text == null ? '' : text);
    const trimmed = raw.trim();
    if (!trimmed) {
      const emptyError = new Error('Empty JSON import file');
      emptyError.vildaInvalidJson = true;
      throw emptyError;
    }
    let obj;
    try {
      obj = JSON.parse(trimmed);
    } catch (error) {
      error.vildaInvalidJson = true;
      throw error;
    }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      const shapeError = new Error('JSON import root must be an object');
      shapeError.vildaInvalidJson = true;
      throw shapeError;
    }
    if (opts.requireVildaPayload === true) {
      const hasKnownShape = !!(obj.user || obj.advanced || obj.growthBasic || obj.intake || obj.foods || obj.clcr || obj.version || obj.name);
      if (!hasKnownShape) {
        const payloadError = new Error('JSON import object does not look like Vilda export payload');
        payloadError.vildaInvalidJson = true;
        throw payloadError;
      }
    }
    return obj;
  }

  function readImportFileAsText(file, options, onSuccess, onError) {
    const opts = (options && typeof options === 'object') ? options : {};
    const encoding = opts.encoding || 'utf-8';
    if (!file) {
      const noFileError = new Error('No JSON import file selected');
      if (typeof onError === 'function') onError(noFileError);
      return null;
    }

    if (typeof opts.readFileAsText === 'function') {
      try {
        const result = opts.readFileAsText(file, encoding);
        if (result && typeof result.then === 'function') {
          result.then(onSuccess).catch(onError);
        } else if (typeof onSuccess === 'function') {
          onSuccess(result);
        }
        return result;
      } catch (error) {
        if (typeof onError === 'function') onError(error);
        return null;
      }
    }

    if (typeof global.FileReader === 'function') {
      try {
        const reader = new global.FileReader();
        reader.onload = function onJsonFileReaderLoad() {
          if (typeof onSuccess === 'function') onSuccess(reader.result);
        };
        reader.onerror = function onJsonFileReaderError() {
          const readerError = reader.error || new Error('FileReader error while reading JSON import file');
          if (typeof onError === 'function') onError(readerError);
        };
        reader.readAsText(file, encoding);
        return reader;
      } catch (error) {
        if (typeof onError === 'function') onError(error);
        return null;
      }
    }

    if (file && typeof file.text === 'function') {
      try {
        const promise = file.text();
        promise.then(onSuccess).catch(onError);
        return promise;
      } catch (error) {
        if (typeof onError === 'function') onError(error);
        return null;
      }
    }

    const unsupportedError = new Error('FileReader API is not available');
    if (typeof onError === 'function') onError(unsupportedError);
    return null;
  }

  function handleFile(event, options) {
    const opts = (options && typeof options === 'object') ? options : {};
    const input = (event && event.target) ? event.target : null;
    const file = getImportFileFromEvent(event, opts);
    if (!file) return null;

    const validation = validateJsonImportFile(file, opts);
    if (!validation.ok) {
      if (validation.message) notifyJsonImportError(validation.message, opts, new Error(validation.reason || 'Invalid JSON import file'));
      resetFileInput(input);
      return null;
    }

    const applyLoadedData = resolveCallback(opts, 'applyLoadedData', 'applyLoadedData');
    if (typeof applyLoadedData !== 'function') {
      notifyJsonImportError('Brak funkcji importu danych.', opts, new Error('Missing applyLoadedData callback'));
      resetFileInput(input);
      return null;
    }

    const onSuccess = (text) => {
      try {
        const obj = parseJsonImportText(text, opts);
        applyLoadedData(obj);
        if (typeof opts.onLoaded === 'function') {
          try { opts.onLoaded(obj, file); } catch (callbackError) { logSwallowed('vilda_data_import_export:handleFile:onLoaded', callbackError); }
        }
        return obj;
      } catch (error) {
        const msg = opts.invalidJsonMessage || 'Nieprawidłowy plik JSON.';
        notifyJsonImportError(msg, opts, error);
        if (typeof opts.onError === 'function') {
          try { opts.onError(error, file); } catch (callbackError) { logSwallowed('vilda_data_import_export:handleFile:onError', callbackError); }
        }
        return null;
      } finally {
        resetFileInput(input);
      }
    };

    const onError = (error) => {
      const msg = opts.fileReadErrorMessage || 'Nie udało się odczytać pliku JSON.';
      notifyJsonImportError(msg, opts, error);
      if (typeof opts.onError === 'function') {
        try { opts.onError(error, file); } catch (callbackError) { logSwallowed('vilda_data_import_export:handleFile:onReadError', callbackError); }
      }
      resetFileInput(input);
      return null;
    };

    return readImportFileAsText(file, opts, onSuccess, onError);
  }

  function addDisabledTooltip(btn, options) {
    if (!btn || btn.__vildaDataImportExportDisabledTooltipBound) return;
    btn.__vildaDataImportExportDisabledTooltipBound = '1';
    const opts = (options && typeof options === 'object') ? options : {};
    const handler = () => {
      const isDisabled = btn.disabled === true || (typeof btn.hasAttribute === 'function' && btn.hasAttribute('disabled'));
      if (!isDisabled) return;
      const msg = getTip(btn);
      if (msg) callTooltip(btn, msg, opts);
    };
    btn.addEventListener('mouseenter', handler);
    btn.addEventListener('touchstart', handler, { passive: true });
    btn.addEventListener('focus', handler);
  }

  let jsonDataImportExportInitialized = false;

  function initJsonDataImportExport(options) {
    if (jsonDataImportExportInitialized) return;
    jsonDataImportExportInitialized = true;

    const opts = (options && typeof options === 'object') ? options : {};
    const loadBtn = q('loadDataBtn');
    const saveBtn = q('saveDataBtn');
    const fileIn = q('fileInput');
    const updateSaveBtnVisibility = resolveCallback(opts, 'updateSaveBtnVisibility', 'updateSaveBtnVisibility');
    const anyDataEntered = resolveCallback(opts, 'anyDataEntered', 'anyDataEntered');
    const hideLoadDataMessage = resolveCallback(opts, 'hideLoadDataMessage', 'hideLoadDataMessage');
    const handleFileCallback = (typeof opts.handleFile === 'function')
      ? opts.handleFile
      : function vildaDataImportExportFileInputHandler(event) { return handleFile(event, opts); };
    const saveFn = (typeof opts.saveUserData === 'function') ? opts.saveUserData : function () { return saveUserData(opts); };

    migrateTitleToDataTip(loadBtn);
    migrateTitleToDataTip(saveBtn);

    if (loadBtn && fileIn) {
      loadBtn.disabled = false;
      loadBtn.removeAttribute('disabled');
      loadBtn.removeAttribute('aria-disabled');

      loadBtn.addEventListener('click', (event) => {
        event.preventDefault();

        if (loadBtn.disabled) {
          const msg = getTip(loadBtn);
          if (msg) callTooltip(loadBtn, msg, opts);
          return;
        }

        const hasData = anyDataEntered ? !!anyDataEntered() : false;
        if (hasData) {
          callTooltip(loadBtn, 'Wczytywanie danych jest możliwe tylko na początku sesji (gdy formularz jest pusty).', opts);
          return;
        }

        // Etap 8R-4b: w trybie zalogowanym otwieramy listę pacjentów z vaultu
        // zamiast natywnego dialogu pliku. Gość/wylogowany — tooltip.
        const vault = global.VildaVault;
        const authUI = global.VildaAuthUI;
        const isGuest = global.VildaGuestMode === true;
        if (isGuest) {
          callTooltip(loadBtn, 'Zaloguj się, aby wczytać dane pacjentów.', opts);
          return;
        }
        if (vault && typeof vault.isUnlocked === 'function' && vault.isUnlocked()) {
          if (authUI && typeof authUI.showPatientsList === 'function') {
            authUI.showPatientsList(function (payload) {
              const applyFn = resolveCallback(opts, 'applyLoadedData', 'applyLoadedData');
              if (typeof applyFn === 'function' && payload) {
                try { applyFn(payload); } catch (err) { logSwallowed('vilda_data_import_export:loadFromVault:apply', err); }
              }
            });
          } else {
            callTooltip(loadBtn, 'Brak modułu listy pacjentów.', opts);
          }
          return;
        }
        callTooltip(loadBtn, 'Zaloguj się, aby wczytać dane pacjentów.', opts);
      });

      if (handleFileCallback) {
        fileIn.addEventListener('change', handleFileCallback);
      }
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', (event) => {
        event.preventDefault();

        if (saveBtn.disabled) {
          const msg = getTip(saveBtn);
          if (msg) callTooltip(saveBtn, msg, opts);
          return;
        }

        saveFn();
      });
    }

    addDisabledTooltip(saveBtn, opts);
    addDisabledTooltip(loadBtn, opts);

    const nameEl = q('name');
    const advEl = q('advName');
    if (nameEl && advEl) {
      nameEl.addEventListener('input', () => syncNames('name', { updateSaveBtnVisibility }));
      advEl.addEventListener('input', () => syncNames('adv', { updateSaveBtnVisibility }));
    }

    const disableLoad = () => {
      if (hideLoadDataMessage) {
        try { hideLoadDataMessage(); } catch (error) { logSwallowed('vilda_data_import_export:disableLoad:hideMessage', error); }
      }

      const loadEl = q('loadDataBtn');
      if (loadEl) {
        migrateTitleToDataTip(loadEl);
        loadEl.disabled = true;
        loadEl.setAttribute('disabled', '');
      }

      const wrap = q('prevSummaryWrap');
      const card = q('prevSummaryCard');
      const toggle = q('togglePrevSummary');
      if (card && toggle) {
        const hasLoaded = (card.dataset && card.dataset.loaded === 'true') || (wrap && wrap.dataset && wrap.dataset.loaded === 'true');
        if (hasLoaded) {
          if (wrap) wrap.style.display = 'block';
          card.style.display = 'block';
          toggle.style.display = 'none';
        } else {
          if (wrap) wrap.style.display = 'none';
          card.style.display = 'none';
          toggle.style.display = 'none';
        }
      }
    };

    ['name', 'advName', 'fullName', 'age', 'ageMonths', 'weight', 'height', 'advBoneAge', 'advMotherHeight', 'advFatherHeight', 'advTesticularVolume', 'advFamilyDelayedPuberty', 'advGrowthExclusion']
      .forEach((id) => {
        const el = q(id);
        if (!el) return;
        el.addEventListener('input', disableLoad);
        el.addEventListener('change', disableLoad);
      });

    const togglePrev = q('togglePrevSummary');
    const hidePrev = q('hidePrevSummary');
    const prevCard = q('prevSummaryCard');

    if (togglePrev && prevCard) {
      togglePrev.addEventListener('click', () => {
        prevCard.style.display = 'block';
        togglePrev.style.display = 'none';
      });
    }

    if (hidePrev && prevCard && togglePrev) {
      hidePrev.addEventListener('click', () => {
        prevCard.style.display = 'none';
        togglePrev.style.display = 'block';
      });
    }

    const clcrClearBtn = q('clearBtn');
    if (clcrClearBtn) {
      clcrClearBtn.addEventListener('click', function () {
        const headerLoad = q('loadDataBtn');
        if (headerLoad) {
          migrateTitleToDataTip(headerLoad);
          headerLoad.disabled = false;
          headerLoad.removeAttribute('disabled');
          headerLoad.removeAttribute('aria-disabled');
        }

        const sidebarLoad = q('loadDataBtnSidebar');
        if (sidebarLoad) {
          sidebarLoad.disabled = false;
          sidebarLoad.removeAttribute('disabled');
          sidebarLoad.removeAttribute('aria-disabled');
        }

        const saveBtns = [];
        const headerSave = q('saveDataBtn');
        const sidebarSave = q('saveDataBtnSidebar');
        if (headerSave) saveBtns.push(headerSave);
        if (sidebarSave) saveBtns.push(sidebarSave);
        saveBtns.forEach((btn) => {
          btn.disabled = true;
          btn.setAttribute('disabled', '');
          btn.setAttribute('aria-disabled', 'true');
        });
      });
    }

    if (updateSaveBtnVisibility) {
      try { updateSaveBtnVisibility(); } catch (error) { logSwallowed('vilda_data_import_export:init:updateSaveBtnVisibility', error); }
    }
  }

  // ---------------------------------------------------------------------------
  // 8L-5: stan przycisków zapisu/wczytywania oraz autosave sesji głównej
  // ---------------------------------------------------------------------------
  const MAIN_SESSION_KEY = 'vildaMainSessionV1';
  let mainSessionTimer = null;
  let mainSessionPersistenceInitialized = false;
  let mainSessionRestoreAttempted = false;
  let mainSessionRestoreInProgress = false;
  let mainSessionRestoreFinalizeTimer = null;
  let mainSessionOptions = {};

  function mergeMainSessionOptions(options) {
    if (options && typeof options === 'object') {
      mainSessionOptions = Object.assign({}, mainSessionOptions, options);
    }
    return mainSessionOptions;
  }

  function getMainSessionOptions(options) {
    return Object.assign({}, mainSessionOptions, (options && typeof options === 'object') ? options : {});
  }

  function anyDataEntered(options) {
    const opts = (options && typeof options === 'object') ? options : {};
    const hasText = (id) => {
      const el = q(id);
      if (!el) return false;
      const v = (el.value ?? '').trim();
      return v.length > 0;
    };
    const hasPosNumber = (id) => {
      const v = num(val(id));
      return v !== null && v > 0;
    };

    let started =
      hasText('name') ||
      hasText('advName') ||
      hasText('basicGrowthName') ||
      hasText('fullName') ||
      hasPosNumber('age') ||
      hasPosNumber('ageMonths') ||
      hasPosNumber('weight') ||
      hasPosNumber('height') ||
      hasPosNumber('advBoneAge') ||
      hasPosNumber('advMotherHeight') ||
      hasPosNumber('advFatherHeight') ||
      hasText('advTesticularVolume') ||
      hasText('advFamilyDelayedPuberty') ||
      hasText('advGrowthExclusion');

    if (!started) {
      try {
        const clcrForm = q('clcrForm');
        if (clcrForm && typeof clcrForm.querySelectorAll === 'function') {
          const controls = clcrForm.querySelectorAll('input, select, textarea');
          for (const el of controls) {
            const type = (el.type || '').toLowerCase();
            const tag = (el.tagName || '').toUpperCase();
            if (type === 'button' || type === 'submit' || type === 'reset' || type === 'file') continue;
            if (tag === 'SELECT' || type === 'select-one' || type === 'select-multiple') {
              const v = (el.value || '').trim();
              if (el.id === 'formulaPicker' && v !== '') { started = true; break; }
              continue;
            }
            if (type === 'checkbox' || type === 'radio') {
              if (el.checked) { started = true; break; }
            } else {
              const v = (el.value || '').trim();
              if (v !== '') { started = true; break; }
            }
          }
        }
      } catch (error) {
        logSwallowed('vilda_data_import_export:anyDataEntered:clcrForm', error, { source: opts.source || 'unknown' });
      }
    }

    return !!started;
  }

  function maybeDisableLoadIfNeeded(options) {
    const loadEls = [];
    const headerLoad = q('loadDataBtn');
    const sidebarLoad = q('loadDataBtnSidebar');
    if (headerLoad) loadEls.push(headerLoad);
    if (sidebarLoad) loadEls.push(sidebarLoad);
    if (loadEls.length === 0) return false;

    loadEls.forEach((btn) => migrateTitleToDataTip(btn));
    const hasData = anyDataEntered(options);
    loadEls.forEach((btn) => {
      if (!btn) return;
      if (hasData) {
        if (!btn.disabled) {
          btn.disabled = true;
          btn.setAttribute('disabled', '');
        }
      } else {
        btn.disabled = false;
        btn.removeAttribute('disabled');
        btn.removeAttribute('aria-disabled');
      }
    });
    return hasData;
  }

  function updateSaveBtnVisibility(options) {
    const opts = (options && typeof options === 'object') ? options : {};
    const saveBtn = q('saveDataBtn');
    const saveSidebar = q('saveDataBtnSidebar');
    if (!saveBtn && !saveSidebar) {
      maybeDisableLoadIfNeeded(opts);
      return false;
    }

    let shouldEnable;
    if (global.lastLoadedData) {
      shouldEnable = !!global.hasUserModifiedAfterLoad;
    } else {
      const age = num(val('age'));
      const ageMonths = num(val('ageMonths'));
      const normalizedAge = age != null ? age : (ageMonths != null ? 0 : null);
      const w = num(val('weight'));
      const h = num(val('height'));
      const nameOk = (val('name') || val('advName') || val('fullName')).trim().length > 0;
      const hasExplicitAge = hasExplicitNumericField('age') || hasExplicitNumericField('ageMonths');
      const minimal = hasExplicitAge && isFiniteNonNegative(normalizedAge) && isFinitePositive(w) && isFinitePositive(h);
      shouldEnable = minimal && nameOk;
    }

    const targets = [];
    if (saveBtn) targets.push(saveBtn);
    if (saveSidebar) targets.push(saveSidebar);
    targets.forEach((btn) => {
      if (!btn) return;
      if (shouldEnable) {
        btn.disabled = false;
        btn.removeAttribute('disabled');
        btn.removeAttribute('aria-disabled');
      } else {
        btn.disabled = true;
        btn.setAttribute('disabled', '');
        btn.setAttribute('aria-disabled', 'true');
      }
    });

    maybeDisableLoadIfNeeded(opts);
    return shouldEnable;
  }

  function getVildaPersistenceAdapter() {
    return getPersistenceAdapter();
  }

  function hasMainSessionStorage(options) {
    try {
      const persistence = (options && options.persistence) || getVildaPersistenceAdapter();
      return !!(persistence && typeof persistence.getStorage === 'function' && persistence.getStorage('session'));
    } catch (error) {
      logSwallowed('vilda_data_import_export:hasMainSessionStorage', error);
      return false;
    }
  }

  function isMainSessionAutosavePaused(options) {
    const opts = getMainSessionOptions(options);
    if (mainSessionRestoreInProgress) return true;
    if (opts && opts.restoreInProgress) return true;
    try {
      if (global.__vildaPersistRestoring) return true;
      const pauseUntil = Number(global.__vildaPersistPauseUntil || 0);
      if (pauseUntil && Date.now() < pauseUntil) return true;
    } catch (error) {
      logSwallowed('vilda_data_import_export:isMainSessionAutosavePaused', error);
    }
    return false;
  }

  function clearMainSessionStorage(options) {
    try {
      if (mainSessionTimer) {
        clearTimeout(mainSessionTimer);
        mainSessionTimer = null;
      }
      if (mainSessionRestoreFinalizeTimer) {
        clearTimeout(mainSessionRestoreFinalizeTimer);
        mainSessionRestoreFinalizeTimer = null;
      }
    } catch (error) {
      logSwallowed('vilda_data_import_export:clearMainSessionStorage:timers', error);
    }

    if (!hasMainSessionStorage(options)) return false;
    try {
      const persistence = getVildaPersistenceAdapter();
      if (persistence && typeof persistence.clearMainSession === 'function') {
        persistence.clearMainSession();
        return true;
      }
    } catch (error) {
      logSwallowed('vilda_data_import_export:clearMainSessionStorage', error);
    }
    return false;
  }

  function resolveCollectUserData(options) {
    const opts = getMainSessionOptions(options);
    if (typeof opts.collectUserData === 'function') return opts.collectUserData;
    return function collectUserDataFallback() { return collectUserData(opts); };
  }


  function mainSessionNonEmptyText(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  function mainSessionPositiveNumber(value) {
    if (value === null || value === undefined || value === '') return false;
    const n = Number(value);
    return Number.isFinite(n) && n > 0;
  }

  function mainSessionMeaningfulMeasurement(entry) {
    if (!entry || typeof entry !== 'object') return false;
    return mainSessionPositiveNumber(entry.ageMonths)
      || mainSessionPositiveNumber(entry.ageYears)
      || mainSessionPositiveNumber(entry.height)
      || mainSessionPositiveNumber(entry.weight)
      || mainSessionPositiveNumber(entry.boneAgeYears)
      || entry.arrowEnabled === true
      || mainSessionNonEmptyText(entry.arrowComment)
      || entry.ghSync === true
      || mainSessionNonEmptyText(entry.ghId);
  }

  function mainSessionGrowthDataHasMeaning(data) {
    if (!data || typeof data !== 'object') return false;
    if (Array.isArray(data.measurements) && data.measurements.some(mainSessionMeaningfulMeasurement)) return true;
    return mainSessionPositiveNumber(data.currentAgeMonths)
      || mainSessionPositiveNumber(data.currentHeight)
      || mainSessionPositiveNumber(data.currentWeight)
      || mainSessionPositiveNumber(data.boneAgeMonths)
      || data.currentArrowEnabled === true
      || mainSessionNonEmptyText(data.currentArrowComment);
  }

  function mainSessionFoodRowsHaveMeaning(rows) {
    return Array.isArray(rows) && rows.some((row) => {
      if (!row || typeof row !== 'object') return false;
      const qty = Number(row.qty);
      return mainSessionNonEmptyText(row.key) && Number.isFinite(qty) && qty > 0;
    });
  }

  function mainSessionDeepHasMeaning(value, depth) {
    if (depth > 5) return false;
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (typeof value === 'number') return Number.isFinite(value) && value !== 0;
    if (typeof value === 'boolean') return value === true;
    if (Array.isArray(value)) return value.some((item) => mainSessionDeepHasMeaning(item, depth + 1));
    if (typeof value === 'object') {
      return Object.keys(value).some((key) => {
        if (key === 'version' || key === 'timestamp' || key === 'timestampISO') return false;
        return mainSessionDeepHasMeaning(value[key], depth + 1);
      });
    }
    return false;
  }

  function hasMeaningfulMainSessionData(data) {
    if (!data || typeof data !== 'object' || data.version !== 1) return false;

    if (mainSessionNonEmptyText(data.name)) return true;

    const user = data.user && typeof data.user === 'object' ? data.user : null;
    if (user) {
      if (mainSessionPositiveNumber(user.age)
        || mainSessionPositiveNumber(user.ageMonths)
        || mainSessionPositiveNumber(user.weight)
        || mainSessionPositiveNumber(user.height)
        || mainSessionPositiveNumber(user.waist)
        || mainSessionPositiveNumber(user.hip)) {
        return true;
      }
      // Sama płeć jest wartością domyślną formularza i nie może tworzyć sesji do odtworzenia.
    }

    const advanced = data.advanced && typeof data.advanced === 'object' ? data.advanced : null;
    if (advanced) {
      if (mainSessionPositiveNumber(advanced.boneAgeYears)
        || mainSessionPositiveNumber(advanced.motherHeight)
        || mainSessionPositiveNumber(advanced.fatherHeight)
        || mainSessionNonEmptyText(advanced.testicularVolume)
        || mainSessionNonEmptyText(advanced.familyDelayedPuberty)
        || mainSessionNonEmptyText(advanced.growthExclusion)
        || mainSessionGrowthDataHasMeaning(advanced.data)) {
        return true;
      }
    }

    const growthBasic = data.growthBasic && typeof data.growthBasic === 'object' ? data.growthBasic : null;
    if (growthBasic && mainSessionGrowthDataHasMeaning(growthBasic.data)) return true;

    const intake = data.intake && typeof data.intake === 'object' ? data.intake : null;
    if (intake) {
      if (Array.isArray(intake.history) && intake.history.some(mainSessionMeaningfulMeasurement)) return true;
      if (mainSessionPositiveNumber(intake.estKcalPerDay)) return true;
      const pal = mainSessionNonEmptyText(intake.pal) ? String(intake.pal).trim() : '';
      if (pal && pal !== '1.4') return true;
    }

    const foodsData = data.foods && typeof data.foods === 'object' ? data.foods : null;
    if (foodsData && (mainSessionFoodRowsHaveMeaning(foodsData.snacks) || mainSessionFoodRowsHaveMeaning(foodsData.meals))) return true;

    const plan = data.plan && typeof data.plan === 'object' ? data.plan : null;
    if (plan) {
      if (mainSessionPositiveNumber(plan.palFactor) && Math.abs(Number(plan.palFactor) - 1.4) > 0.0001) return true;
      // dietLevel bywa automatycznie wypełniany po wcześniejszych obliczeniach; sam nie może tworzyć sesji do odtworzenia po pełnym czyszczeniu.
    }

    if (Array.isArray(data.ghTherapyPoints) && data.ghTherapyPoints.length > 0) return true;

    const bp = data.bp && typeof data.bp === 'object' ? data.bp : null;
    if (bp && (mainSessionPositiveNumber(bp.heartRate) || mainSessionPositiveNumber(bp.temperature) || mainSessionPositiveNumber(bp.systolic) || mainSessionPositiveNumber(bp.diastolic))) return true;

    const adultVitals = data.adultVitals && typeof data.adultVitals === 'object' ? data.adultVitals : null;
    if (adultVitals && (mainSessionPositiveNumber(adultVitals.heartRate) || mainSessionPositiveNumber(adultVitals.systolic) || mainSessionPositiveNumber(adultVitals.diastolic) || adultVitals.athlete === true || adultVitals.betaBlocker === true)) return true;

    const respiratory = data.respiratory && typeof data.respiratory === 'object' ? data.respiratory : null;
    if (respiratory && (mainSessionPositiveNumber(respiratory.rate) || mainSessionPositiveNumber(respiratory.temperature))) return true;

    const circumference = data.circumference && typeof data.circumference === 'object' ? data.circumference : null;
    if (circumference && (mainSessionPositiveNumber(circumference.head) || mainSessionPositiveNumber(circumference.chest) || mainSessionPositiveNumber(circumference.headDs))) return true;

    const doctor = data.doctor && typeof data.doctor === 'object' ? data.doctor : null;
    if (doctor && (doctor.isDoctor === true || mainSessionNonEmptyText(doctor.pwzNumber))) return true;

    const bisphos = data.bisphos && typeof data.bisphos === 'object' ? data.bisphos : null;
    if (bisphos && (mainSessionNonEmptyText(bisphos.indication) || mainSessionNonEmptyText(bisphos.drug) || mainSessionNonEmptyText(bisphos.doseNumber))) return true;

    const zscore = data.zscore && typeof data.zscore === 'object' ? data.zscore : null;
    // Domyślne źródło centyli (np. OLAF) jest preferencją UI i nie może samo tworzyć sesji do odtworzenia.
    if (zscore && zscore.resultsMode === true) return true;

    if (data.bpDataToggle === true) return true;
    if (mainSessionDeepHasMeaning(data.clcr, 0)) return true;
    if (mainSessionDeepHasMeaning(data.steroid, 0)) return true;

    return false;
  }

  function saveMainSessionNow(options) {
    const opts = getMainSessionOptions(options);
    if (!hasMainSessionStorage(opts) || isMainSessionAutosavePaused(opts)) return false;
    try {
      if (mainSessionTimer) {
        clearTimeout(mainSessionTimer);
        mainSessionTimer = null;
      }
    } catch (error) {
      logSwallowed('vilda_data_import_export:saveMainSessionNow:timer', error);
    }

    try {
      const collect = resolveCollectUserData(opts);
      const data = collect ? collect() : null;
      if (!hasMeaningfulMainSessionData(data)) {
        clearMainSessionStorage(opts);
        return false;
      }
      if (data && data.version === 1) {
        const persistence = getVildaPersistenceAdapter();
        if (persistence && typeof persistence.writeMainSession === 'function') {
          persistence.writeMainSession(data);
          return true;
        }
      }
    } catch (error) {
      logSwallowed('vilda_data_import_export:saveMainSessionNow', error);
    }
    return false;
  }

  function scheduleMainSessionSave(evt, options) {
    const opts = getMainSessionOptions(options);
    if (!hasMainSessionStorage(opts) || isMainSessionAutosavePaused(opts)) return false;
    if (evt && evt.target) {
      try {
        if (typeof evt.target.matches === 'function' && !evt.target.matches('input, select, textarea')) {
          return false;
        }
      } catch (error) {
        logSwallowed('vilda_data_import_export:scheduleMainSessionSave:target', error);
      }
    }

    if (mainSessionTimer) clearTimeout(mainSessionTimer);
    mainSessionTimer = setTimeout(() => {
      mainSessionTimer = null;
      if (isMainSessionAutosavePaused(opts)) return;
      saveMainSessionNow(opts);
    }, 300);
    return true;
  }

  function finalizeMainSessionRestore(prevPersistRestoring, options) {
    const opts = getMainSessionOptions(options);
    const complete = () => {
      mainSessionRestoreFinalizeTimer = null;
      mainSessionRestoreInProgress = false;
      try {
        global.__vildaPersistRestoring = prevPersistRestoring;
      } catch (error) {
        logSwallowed('vilda_data_import_export:finalizeMainSessionRestore:flag', error);
      }
      try {
        saveMainSessionNow(opts);
      } catch (error) {
        logSwallowed('vilda_data_import_export:finalizeMainSessionRestore:saveNow', error);
      }
    };

    try {
      if (mainSessionRestoreFinalizeTimer) clearTimeout(mainSessionRestoreFinalizeTimer);
    } catch (error) {
      logSwallowed('vilda_data_import_export:finalizeMainSessionRestore:clearTimer', error);
    }

    const queueComplete = () => {
      mainSessionRestoreFinalizeTimer = setTimeout(complete, 0);
    };

    try {
      if (typeof global.requestAnimationFrame === 'function') {
        global.requestAnimationFrame(queueComplete);
        return true;
      }
    } catch (error) {
      logSwallowed('vilda_data_import_export:finalizeMainSessionRestore:raf', error);
    }

    queueComplete();
    return true;
  }

  function restoreMainSessionIfAny(options) {
    const opts = getMainSessionOptions(options);
    if (mainSessionRestoreAttempted || !hasMainSessionStorage(opts)) return false;
    mainSessionRestoreAttempted = true;
    let prevPersistRestoring = false;
    let restoreQueuedFinalize = false;
    try {
      const persistence = getVildaPersistenceAdapter();
      let data = null;
      if (persistence && typeof persistence.readMainSession === 'function') {
        data = persistence.readMainSession();
      }
      if (!data) return false;
      if (!hasMeaningfulMainSessionData(data)) {
        clearMainSessionStorage(opts);
        return false;
      }

      const hasData = (typeof opts.anyDataEntered === 'function') ? !!opts.anyDataEntered(opts) : anyDataEntered(opts);
      if (hasData) return false;
      if (!data || data.version !== 1) return false;

      try {
        prevPersistRestoring = !!global.__vildaPersistRestoring;
        global.__vildaPersistRestoring = true;
      } catch (error) {
        logSwallowed('vilda_data_import_export:restoreMainSessionIfAny:setFlag', error);
      }

      const applyLoadedData = resolveCallback(opts, 'applyLoadedData', 'applyLoadedData');
      if (typeof applyLoadedData !== 'function') {
        logSwallowed('vilda_data_import_export:restoreMainSessionIfAny', new Error('Missing applyLoadedData callback'));
        return false;
      }

      mainSessionRestoreInProgress = true;
      applyLoadedData(data, { isSessionRestore: true });
      restoreQueuedFinalize = true;
      finalizeMainSessionRestore(prevPersistRestoring, opts);
      return true;
    } catch (error) {
      logSwallowed('vilda_data_import_export:restoreMainSessionIfAny', error);
      return false;
    } finally {
      if (!restoreQueuedFinalize) {
        mainSessionRestoreInProgress = false;
        try {
          global.__vildaPersistRestoring = prevPersistRestoring;
        } catch (error) {
          logSwallowed('vilda_data_import_export:restoreMainSessionIfAny:restoreFlag', error);
        }
      }
    }
  }

  function attachMainSessionClearHandler(btnId, options) {
    const clearBtn = q(btnId);
    if (!clearBtn || clearBtn.__vildaMainSessionClearBound) return false;
    clearBtn.__vildaMainSessionClearBound = '1';
    clearBtn.addEventListener('click', () => clearMainSessionStorage(options), true);
    return true;
  }

  function initMainSessionPersistence(options) {
    const opts = mergeMainSessionOptions(options);
    if (mainSessionPersistenceInitialized) return false;
    mainSessionPersistenceInitialized = true;

    const doc = global.document;
    if (!doc || typeof doc.addEventListener !== 'function') return false;

    ['input', 'change'].forEach((evt) => {
      doc.addEventListener(evt, (event) => scheduleMainSessionSave(event, opts), true);
    });

    try {
      if (global && typeof global.addEventListener === 'function') {
        global.addEventListener('pagehide', () => saveMainSessionNow(opts), { capture: true });
      }
    } catch (error) {
      logSwallowed('vilda_data_import_export:initMainSessionPersistence:pagehide', error);
    }

    // Flush sesji głównej także na visibilitychange→hidden. Na iOS/Safari zdarzenie
    // 'pagehide' bywa zawodne przy przełączaniu kart/podstron i usypianiu aplikacji,
    // a 'visibilitychange' (hidden) jest tam rekomendowanym, niezawodnym triggerem.
    // Zamyka to szczelinę, w której świeża (debounced 300 ms) edycja nie zdążyłaby
    // trafić do main session przed nawigacją — dzięki czemu wskaźnik statusu zapisu
    // poprawnie pokazuje DIRTY na kolejnej podstronie (np. klirensie).
    try {
      if (doc && typeof doc.addEventListener === 'function') {
        doc.addEventListener('visibilitychange', () => {
          try {
            if (doc.visibilityState === 'hidden' || doc.hidden === true) {
              saveMainSessionNow(opts);
            }
          } catch (innerError) {
            logSwallowed('vilda_data_import_export:initMainSessionPersistence:visibilitychange', innerError);
          }
        }, { capture: true });
      }
    } catch (error) {
      logSwallowed('vilda_data_import_export:initMainSessionPersistence:visibilitychange-attach', error);
    }

    const initAfterDomReady = () => {
      attachMainSessionClearHandler('clearAllDataBtn', opts);
      attachMainSessionClearHandler('clearBtn', opts);
      const runRestore = () => {
        try { restoreMainSessionIfAny(opts); } catch (error) { logSwallowed('vilda_data_import_export:initMainSessionPersistence:restore', error); }
      };
      if (typeof global.requestAnimationFrame === 'function') {
        global.requestAnimationFrame(() => global.requestAnimationFrame(runRestore));
      } else {
        setTimeout(runRestore, 0);
      }
    };

    const onReady = resolveCallback(opts, 'vildaAppOnReady', 'vildaAppOnReady');
    if (typeof onReady === 'function') {
      onReady('app:main-session-restore-init', initAfterDomReady);
    } else if (doc.readyState === 'loading') {
      doc.addEventListener('DOMContentLoaded', initAfterDomReady, { once: true });
    } else {
      setTimeout(initAfterDomReady, 0);
    }

    try {
      global.vildaSession = {
        saveNow: () => saveMainSessionNow(opts),
        schedule: (event) => scheduleMainSessionSave(event, opts),
        clear: () => clearMainSessionStorage(opts),
        restore: () => {
          mainSessionRestoreAttempted = false;
          return restoreMainSessionIfAny(opts);
        }
      };
    } catch (error) {
      logSwallowed('vilda_data_import_export:initMainSessionPersistence:vildaSession', error);
    }

    return true;
  }




  function clearElement(el, context) {
    if (!el) return;
    try {
      if (global && typeof global.vildaAppClearHtml === 'function') {
        global.vildaAppClearHtml(el);
        return;
      }
      if (global && global.VildaHtml && typeof global.VildaHtml.clear === 'function') {
        global.VildaHtml.clear(el);
        return;
      }
    } catch (error) {
      logSwallowed(context || 'vilda_data_import_export:clearElement', error);
    }
    try {
      el.textContent = '';
    } catch (error) {
      logSwallowed(context || 'vilda_data_import_export:clearElement:fallback', error);
    }
  }

  function callOptional(options, name, args, fallbackName, meta) {
    const fn = resolveCallback(options, name, fallbackName || name);
    if (typeof fn !== 'function') return undefined;
    try {
      return fn.apply(global, Array.isArray(args) ? args : []);
    } catch (error) {
      logSwallowed('vilda_data_import_export:' + name, error, meta || {});
      return undefined;
    }
  }

  function getDocumentElement(id) {
    return q(id);
  }

  function withHistoryRestoreGuards(callback, options) {
    const opts = (options && typeof options === 'object') ? options : {};
    if (typeof callback !== 'function') return undefined;
    let prevAdvSync = false;
    let prevCrossSync = false;
    let prevPauseUntil = 0;
    let prevIntakeReset = false;
    const pauseMs = Number.isFinite(Number(opts.pauseMs)) ? Number(opts.pauseMs) : 900;
    try {
      prevAdvSync = !!global.__vildaSuspendAdvIntakeSync;
      prevCrossSync = !!global.__vildaSuspendGrowthHistoryCrossSync;
      prevPauseUntil = Number(global.__vildaPersistPauseUntil || 0);
      prevIntakeReset = !!global.__vildaSuspendIntakeUserReset;
      global.__vildaSuspendAdvIntakeSync = true;
      global.__vildaSuspendGrowthHistoryCrossSync = true;
      global.__vildaSuspendIntakeUserReset = true;
      global.__vildaPersistPauseUntil = Math.max(prevPauseUntil, Date.now() + pauseMs);
    } catch (error) {
      logSwallowed('vilda_data_import_export:withHistoryRestoreGuards:set', error);
    }
    try {
      return callback();
    } finally {
      try {
        global.__vildaSuspendAdvIntakeSync = prevAdvSync;
        global.__vildaSuspendGrowthHistoryCrossSync = prevCrossSync;
        global.__vildaSuspendIntakeUserReset = prevIntakeReset;
      } catch (error) {
        logSwallowed('vilda_data_import_export:withHistoryRestoreGuards:restore', error);
      }
    }
  }

  function rehydrateAdvancedFromState(options) {
    const opts = (options && typeof options === 'object') ? options : {};
    const skipRecalc = !!opts.skipRecalc;
    const skipPairing = !!opts.skipPairing;
    const cont = getDocumentElement('advMeasurements');
    if (!cont) return { rendered: false, reason: 'missing-advMeasurements' };
    clearElement(cont, 'vilda_data_import_export:rehydrateAdvancedFromState:clear');

    const advancedGrowthData = (opts.advancedGrowthData && typeof opts.advancedGrowthData === 'object')
      ? opts.advancedGrowthData
      : global.advancedGrowthData;
    const arr = (advancedGrowthData && Array.isArray(advancedGrowthData.measurements))
      ? sanitizeAdvancedMeasurementEntries(advancedGrowthData.measurements)
      : [];

    const addAdvMeasurementRow = resolveCallback(opts, 'addAdvMeasurementRow', 'addAdvMeasurementRow');
    const calculateGrowthAdvanced = resolveCallback(opts, 'calculateGrowthAdvanced', 'calculateGrowthAdvanced');

    if (!arr.length) {
      if (addAdvMeasurementRow) {
        try { addAdvMeasurementRow({ skipInitialRecalc: true }); } catch (error) { logSwallowed('vilda_data_import_export:rehydrateAdvancedFromState:add-empty-row', error); }
      }
      if (!skipRecalc && calculateGrowthAdvanced) {
        try { calculateGrowthAdvanced(); } catch (error) { logSwallowed('vilda_data_import_export:rehydrateAdvancedFromState:calculate-empty', error); }
      }
      if (!skipPairing) callOptional(opts, 'ensureAdvancedIntakePairing', [], 'vildaEnsureAdvancedIntakePairing');
      return { rendered: true, rows: 0 };
    }

    arr.forEach((m) => {
      if (!addAdvMeasurementRow) return;
      try { addAdvMeasurementRow({ skipInitialRecalc: true }); } catch (error) { logSwallowed('vilda_data_import_export:rehydrateAdvancedFromState:add-row', error); return; }
      const rows = (typeof cont.querySelectorAll === 'function') ? cont.querySelectorAll('.measure-row') : [];
      const row = rows[rows.length - 1];
      if (!row) return;

      try {
        if (m && (m.ghSync || m.ghId)) {
          row.setAttribute('data-gh-sync', 'true');
          if (m.ghId != null && String(m.ghId) !== '') row.setAttribute('data-gh-id', String(m.ghId));
        }
      } catch (error) {
        logSwallowed('vilda_data_import_export:rehydrateAdvancedFromState:gh-meta', error);
      }

      const set = (sel, v) => {
        const el = (typeof row.querySelector === 'function') ? row.querySelector(sel) : null;
        if (el) el.value = (v == null || Number.isNaN(v)) ? '' : String(v);
      };
      const ageDec = (typeof m.ageYears === 'number') ? m.ageYears : (typeof m.ageMonths === 'number' ? m.ageMonths / 12 : null);
      if (typeof ageDec === 'number') {
        const yrs = Math.floor(ageDec);
        let mos = Math.round((ageDec - yrs) * 12);
        if (mos === 12) mos = 0;
        set('.adv-age-years', yrs);
        set('.adv-age-months', mos);
      } else {
        set('.adv-age-years', '');
        set('.adv-age-months', '');
      }
      set('.adv-height', (typeof m.height === 'number') ? m.height : '');
      set('.adv-weight', (typeof m.weight === 'number') ? m.weight : '');
      set('.adv-bone-age', (typeof m.boneAgeYears === 'number') ? m.boneAgeYears : '');

      const arrowEnableEl = (typeof row.querySelector === 'function') ? row.querySelector('.adv-arrow-enable') : null;
      const arrowCommentEl = (typeof row.querySelector === 'function') ? row.querySelector('.adv-arrow-comment') : null;
      if (arrowEnableEl) arrowEnableEl.checked = !!m.arrowEnabled;
      if (arrowCommentEl) {
        arrowCommentEl.value = (typeof m.arrowComment === 'string') ? m.arrowComment : '';
        arrowCommentEl.style.display = (arrowEnableEl && arrowEnableEl.checked) ? '' : 'none';
      }
    });

    callOptional(opts, 'updateRemoveButtons', [], 'updateRemoveButtons');
    callOptional(opts, 'updateAdvAgeMax', [], 'updateAdvAgeMax');
    callOptional(opts, 'updateArrowInputsVisibility', [], 'updateArrowInputsVisibility');
    if (!skipRecalc && calculateGrowthAdvanced) {
      try { calculateGrowthAdvanced(); } catch (error) { logSwallowed('vilda_data_import_export:rehydrateAdvancedFromState:calculate', error); }
    }
    if (!skipPairing) callOptional(opts, 'ensureAdvancedIntakePairing', [], 'vildaEnsureAdvancedIntakePairing');
    return { rendered: true, rows: arr.length };
  }

  function rehydrateAdvancedRowsUIFromState(rowsUI, options) {
    const opts = (options && typeof options === 'object') ? options : {};
    const skipRecalc = !!opts.skipRecalc;
    const skipPairing = !!opts.skipPairing;
    const cont = getDocumentElement('advMeasurements');
    if (!cont) return { rendered: false, reason: 'missing-advMeasurements' };
    clearElement(cont, 'vilda_data_import_export:rehydrateAdvancedRowsUIFromState:clear');

    const arr = sanitizeAdvancedRowsUI(rowsUI);
    const addAdvMeasurementRow = resolveCallback(opts, 'addAdvMeasurementRow', 'addAdvMeasurementRow');
    const calculateGrowthAdvanced = resolveCallback(opts, 'calculateGrowthAdvanced', 'calculateGrowthAdvanced');

    if (!arr.length) {
      if (addAdvMeasurementRow) {
        try { addAdvMeasurementRow({ skipInitialRecalc: true }); } catch (error) { logSwallowed('vilda_data_import_export:rehydrateAdvancedRowsUIFromState:add-empty-row', error); }
      }
      if (!skipRecalc && calculateGrowthAdvanced) {
        try { calculateGrowthAdvanced(); } catch (error) { logSwallowed('vilda_data_import_export:rehydrateAdvancedRowsUIFromState:calculate-empty', error); }
      }
      if (!skipPairing) callOptional(opts, 'ensureAdvancedIntakePairing', [], 'vildaEnsureAdvancedIntakePairing');
      return { rendered: true, rows: 0 };
    }

    arr.forEach((item) => {
      if (!addAdvMeasurementRow) return;
      try { addAdvMeasurementRow({ skipInitialRecalc: true }); } catch (error) { logSwallowed('vilda_data_import_export:rehydrateAdvancedRowsUIFromState:add-row', error); return; }
      const rows = (typeof cont.querySelectorAll === 'function') ? cont.querySelectorAll('.measure-row') : [];
      const row = rows[rows.length - 1];
      if (!row || !item) return;

      const setVal = (sel, v) => {
        const el = (typeof row.querySelector === 'function') ? row.querySelector(sel) : null;
        if (el) el.value = (v == null) ? '' : String(v);
      };
      const setChecked = (sel, checked) => {
        const el = (typeof row.querySelector === 'function') ? row.querySelector(sel) : null;
        if (el) el.checked = !!checked;
      };

      setVal('.adv-age-years', item.ageY);
      setVal('.adv-age-months', item.ageM);
      setVal('.adv-height', item.ht);
      setVal('.adv-weight', item.wt);
      setVal('.adv-bone-age', item.boneAge);
      setChecked('.adv-arrow-enable', !!item.arrowEnabled);
      setVal('.adv-arrow-comment', item.arrowComment);

      const arrowEnableEl = (typeof row.querySelector === 'function') ? row.querySelector('.adv-arrow-enable') : null;
      const arrowCommentEl = (typeof row.querySelector === 'function') ? row.querySelector('.adv-arrow-comment') : null;
      if (arrowCommentEl) arrowCommentEl.style.display = (arrowEnableEl && arrowEnableEl.checked) ? '' : 'none';

      try {
        if (item.ghSync) row.setAttribute('data-gh-sync', 'true');
        else row.removeAttribute('data-gh-sync');
        if (item.ghId != null && String(item.ghId).trim() !== '') row.setAttribute('data-gh-id', String(item.ghId));
        else row.removeAttribute('data-gh-id');
      } catch (error) {
        logSwallowed('vilda_data_import_export:rehydrateAdvancedRowsUIFromState:gh-meta', error);
      }
    });

    callOptional(opts, 'updateRemoveButtons', [], 'updateRemoveButtons');
    callOptional(opts, 'updateAdvAgeMax', [], 'updateAdvAgeMax');
    callOptional(opts, 'updateArrowInputsVisibility', [], 'updateArrowInputsVisibility');
    if (!skipRecalc && calculateGrowthAdvanced) {
      try { calculateGrowthAdvanced(); } catch (error) { logSwallowed('vilda_data_import_export:rehydrateAdvancedRowsUIFromState:calculate', error); }
    }
    if (!skipPairing) callOptional(opts, 'ensureAdvancedIntakePairing', [], 'vildaEnsureAdvancedIntakePairing');
    return { rendered: true, rows: arr.length };
  }

  function getCurrentBasicsForIntake(options) {
    const hasComplete = resolveCallback(options, 'hasCompleteIntakeCurrentBasics', 'hasCompleteIntakeCurrentBasics');
    let complete = false;
    if (hasComplete) {
      try { complete = !!hasComplete(); } catch (error) { logSwallowed('vilda_data_import_export:rehydrateIntakeFromState:hasCompleteBasics', error); }
    }
    if (!complete) return null;
    const getCurrentBasics = resolveCallback(options, 'getCurrentBasics', '_getUserBasics') || resolveCallback(options, 'getUserBasics', 'getUserBasics');
    if (!getCurrentBasics) return null;
    try {
      return normalizeIntakeCurrentBasics(getCurrentBasics());
    } catch (error) {
      logSwallowed('vilda_data_import_export:rehydrateIntakeFromState:getCurrentBasics', error);
      return null;
    }
  }

  function readFallbackUserBasics(options) {
    const getUserBasics = resolveCallback(options, 'getUserBasics', 'getUserBasics');
    if (getUserBasics) {
      try { return getUserBasics(); } catch (error) { logSwallowed('vilda_data_import_export:rehydrateIntakeFromState:getUserBasics', error); }
    }
    const ageY = parseFloat((q('age') || {}).value);
    const ageM = parseFloat((q('ageMonths') || {}).value);
    const height = parseFloat((q('height') || {}).value);
    const weight = parseFloat((q('weight') || {}).value);
    return {
      ageMonths: (Number.isFinite(ageY) ? ageY : 0) * 12 + (Number.isFinite(ageM) ? ageM : 0),
      height,
      weight
    };
  }

  function rehydrateIntakeFromState(savedPal, options) {
    const opts = (options && typeof options === 'object') ? options : {};
    const skipRecalc = !!opts.skipRecalc;
    const skipPairing = !!opts.skipPairing;
    const btn = getDocumentElement('toggleIntakeCard');
    const card = getDocumentElement('intakeCard');
    const wrap = getDocumentElement('intakeMeasurements');
    if (!wrap) return { rendered: false, reason: 'missing-intakeMeasurements' };

    if (btn) btn.style.display = 'none';
    if (card) card.style.display = 'none';
    clearElement(wrap, 'vilda_data_import_export:rehydrateIntakeFromState:clear');

    const currentBasics = getCurrentBasicsForIntake(opts);
    const histArr = sanitizeIntakeHistoryEntries(Array.isArray(global.intakeHistory) ? global.intakeHistory : [], {
      currentBasics,
      omitCurrentDuplicate: !!currentBasics
    });
    const hasHistory = histArr.length > 0;
    const hasCurrentBasics = !!currentBasics;
    const intakeAddRow = resolveCallback(opts, 'intakeAddRow', 'intakeAddRow');

    const addIntakeRow = (prefill, fallbackOnError) => {
      if (!intakeAddRow) return false;
      try {
        intakeAddRow(prefill);
        return true;
      } catch (error) {
        logSwallowed('vilda_data_import_export:rehydrateIntakeFromState:intakeAddRow', error, { fallbackOnError: !!fallbackOnError });
        if (fallbackOnError) {
          try { intakeAddRow(); return true; } catch (fallbackError) { logSwallowed('vilda_data_import_export:rehydrateIntakeFromState:intakeAddRowFallback', fallbackError); }
        }
      }
      return false;
    };

    if (hasCurrentBasics) {
      addIntakeRow({ ageMonths: currentBasics.ageMonths, height: currentBasics.height, weight: currentBasics.weight }, true);
    } else if (!hasHistory && intakeAddRow) {
      const basics = readFallbackUserBasics(opts);
      if (basics && (Number.isFinite(Number(basics.ageMonths)) || Number.isFinite(Number(basics.height)) || Number.isFinite(Number(basics.weight)))) {
        addIntakeRow({ ageMonths: basics.ageMonths, height: basics.height, weight: basics.weight }, false);
      } else {
        addIntakeRow(undefined, false);
      }
    }

    histArr.forEach((m) => {
      addIntakeRow({ ageMonths: m.ageMonths, height: m.height, weight: m.weight }, false);
    });

    const palSel = getDocumentElement('intakePal');
    if (palSel) {
      palSel.value = (savedPal || palSel.value || '1.4');
      callOptional(opts, 'intakeUpdatePalDesc', [], 'intakeUpdatePalDesc');
    }

    if (hasCurrentBasics) {
      callOptional(opts, 'updateIntakeFirstRowFromUserBasics', [], '_updateIntakeFirstRowFromUserBasics');
    }

    if (!skipPairing) callOptional(opts, 'ensureAdvancedIntakePairing', [], 'vildaEnsureAdvancedIntakePairing');
    callOptional(opts, 'updateIntakeRemoveButtons', [], 'updateIntakeRemoveButtons');
    if (!skipRecalc) callOptional(opts, 'calcEstimatedIntake', [], 'calcEstimatedIntake');
    if (!skipRecalc) callOptional(opts, 'refreshEstimatedIntakeVisibility', [{ preserveRows: true, recalcIfOpen: true }], 'refreshEstimatedIntakeVisibility');

    return { rendered: true, currentBasics: hasCurrentBasics, historyRows: histArr.length };
  }


  function resetGrowthHistoryModulesAfterClear(options) {
    const opts = (options && typeof options === 'object') ? options : {};
    try {
      global.__vildaSuspendAdvIntakeSync = true;
      global.__vildaSuspendGrowthHistoryCrossSync = true;
      global.__vildaSuspendIntakeUserReset = true;
      global.__vildaPersistPauseUntil = Math.max(Number(global.__vildaPersistPauseUntil || 0), Date.now() + 1200);
      global.__vildaSuppressGhAdvancedImportUntil = Date.now() + 4000;
    } catch (error) {
      logSwallowed('vilda_data_import_export:resetGrowthHistoryModulesAfterClear:flags', error);
    }

    try {
      const advWrap = q('advMeasurements');
      if (advWrap) clearElement(advWrap, 'vilda_data_import_export:resetGrowthHistoryModulesAfterClear:adv-clear');
      if (advWrap) callOptional(opts, 'addAdvMeasurementRow', [], 'addAdvMeasurementRow');
    } catch (error) {
      logSwallowed('vilda_data_import_export:resetGrowthHistoryModulesAfterClear:advanced', error);
    }

    try {
      const basicWrap = q('basicGrowthMeasurements');
      if (basicWrap) clearElement(basicWrap, 'vilda_data_import_export:resetGrowthHistoryModulesAfterClear:basic-clear');
      if (basicWrap) callOptional(opts, 'addBasicGrowthMeasurementRow', [], 'addBasicGrowthMeasurementRow');
    } catch (error) {
      logSwallowed('vilda_data_import_export:resetGrowthHistoryModulesAfterClear:basic', error);
    }

    try {
      const intakeWrap = q('intakeMeasurements');
      if (intakeWrap) clearElement(intakeWrap, 'vilda_data_import_export:resetGrowthHistoryModulesAfterClear:intake-clear');
    } catch (error) {
      logSwallowed('vilda_data_import_export:resetGrowthHistoryModulesAfterClear:intake', error);
    }

    callOptional(opts, 'updateRemoveButtons', [], 'updateRemoveButtons');
    callOptional(opts, 'calculateGrowthAdvanced', [], 'calculateGrowthAdvanced');
    callOptional(opts, 'calculateBasicGrowth', [], 'calculateBasicGrowth');
    callOptional(opts, 'updateIntakeRemoveButtons', [], 'updateIntakeRemoveButtons');
    callOptional(opts, 'debouncedIntakeCalc', [], 'debouncedIntakeCalc');

    try {
      scheduleTimeout(() => {
        try {
          global.__vildaSuspendAdvIntakeSync = false;
          global.__vildaSuspendGrowthHistoryCrossSync = false;
          global.__vildaSuspendIntakeUserReset = false;
        } catch (error) {
          logSwallowed('vilda_data_import_export:resetGrowthHistoryModulesAfterClear:restore-flags', error);
        }
        try {
          if (typeof global.vildaEnsureAdvancedIntakePairing === 'function') {
            global.vildaEnsureAdvancedIntakePairing();
          }
        } catch (error) {
          logSwallowed('vilda_data_import_export:resetGrowthHistoryModulesAfterClear:pairing', error);
        }
        try {
          if (typeof global.reconcileGrowthHistoryModules === 'function') {
            global.reconcileGrowthHistoryModules('advanced');
          }
        } catch (error) {
          logSwallowed('vilda_data_import_export:resetGrowthHistoryModulesAfterClear:reconcile', error);
        }
      }, 0);
    } catch (error) {
      logSwallowed('vilda_data_import_export:resetGrowthHistoryModulesAfterClear:timeout', error);
    }
    return true;
  }

  function resetModuleGlobalsAfterClear() {
    try {
      [
        'percSbp', 'percDbp', 'zSbp', 'zDbp',
        'headCircPercentile', 'headCircSD', 'chestCircPercentile', 'chestCircSD'
      ].forEach((key) => {
        try { global[key] = undefined; } catch (error) {
          logSwallowed('vilda_data_import_export:clearAllData:reset-module-global', error, { key });
        }
      });
    } catch (error) {
      logSwallowed('vilda_data_import_export:clearAllData:reset-module-globals', error);
    }
  }

  function resetVisibleFieldsAfterClear() {
    [
      'name', 'advName', 'basicGrowthName', 'age', 'ageMonths', 'weight', 'height', 'waistCm', 'hipCm',
      'advBoneAge', 'advMotherHeight', 'advFatherHeight', 'advTesticularVolume', 'advFamilyDelayedPuberty', 'advGrowthExclusion',
      'heartRate', 'hrTemperature', 'bpSystolic', 'bpDiastolic',
      'adultHeartRate', 'adultBpSystolic', 'adultBpDiastolic',
      'respiratoryRateInput', 'respTemperature',
      'headCircumference', 'chestCircumference', 'headCircumDS'
    ].forEach((id) => {
      const el = q(id);
      if (!el) return;
      try { el.disabled = false; } catch (error) { logSwallowed('vilda_data_import_export:clearAllData:field-disabled', error, { id }); }
      try { el.value = ''; } catch (error) { logSwallowed('vilda_data_import_export:clearAllData:field-value', error, { id }); }
    });
  }

  function resetSelectsAndTogglesAfterClear() {
    const sexEl = q('sex');
    if (sexEl) {
      try { sexEl.disabled = false; } catch (error) { logSwallowed('vilda_data_import_export:clearAllData:sex-disabled', error); }
      try { sexEl.value = 'M'; } catch (error) { logSwallowed('vilda_data_import_export:clearAllData:sex-value', error); }
      try { if (typeof sexEl.selectedIndex === 'number') sexEl.selectedIndex = 0; } catch (error) { logSwallowed('vilda_data_import_export:clearAllData:sex-index', error); }
    }
    const intakePal = q('intakePal');
    if (intakePal) intakePal.value = '1.4';
    ['advTesticularVolume', 'advFamilyDelayedPuberty', 'advGrowthExclusion'].forEach((id) => {
      const el = q(id);
      if (el) el.value = '';
    });
    const palFactor = q('palFactor');
    if (palFactor) palFactor.value = '1.4';
    const hrPopulation = q('hrPopulation');
    if (hrPopulation) hrPopulation.value = 'healthy';
    const respState = q('respState');
    if (respState) respState.value = 'awake';
    const respPopulation = q('respPopulation');
    if (respPopulation) respPopulation.value = 'healthy';

    const bpDataToggle = q('bpDataToggle');
    if (bpDataToggle) {
      bpDataToggle.checked = false;
      try {
        if (bpDataToggle.dataset && Object.prototype.hasOwnProperty.call(bpDataToggle.dataset, 'manual')) {
          delete bpDataToggle.dataset.manual;
        }
      } catch (error) {
        logSwallowed('vilda_data_import_export:clearAllData:bpDataToggle-manual', error);
      }
    }
    const adultBpGuidelineToggle = q('adultBpGuidelineToggle');
    if (adultBpGuidelineToggle) adultBpGuidelineToggle.checked = true;
    const adultHrAthlete = q('adultHrAthlete');
    if (adultHrAthlete) adultHrAthlete.checked = false;
    const adultHrAthleteNo = q('adultHrAthleteNo');
    if (adultHrAthleteNo) adultHrAthleteNo.checked = true;
    const adultHrBetaBlocker = q('adultHrBetaBlocker');
    if (adultHrBetaBlocker) adultHrBetaBlocker.checked = false;
    const adultHrBetaBlockerNo = q('adultHrBetaBlockerNo');
    if (adultHrBetaBlockerNo) adultHrBetaBlockerNo.checked = true;
  }

  function resetDynamicRowsAfterClear() {
    try {
      const advWrap = q('advMeasurements');
      if (advWrap) clearElement(advWrap, 'vilda_data_import_export:clearAllData:advMeasurements');
      const basicWrap = q('basicGrowthMeasurements');
      if (basicWrap) clearElement(basicWrap, 'vilda_data_import_export:clearAllData:basicGrowthMeasurements');
      const intakeWrap = q('intakeMeasurements');
      if (intakeWrap) clearElement(intakeWrap, 'vilda_data_import_export:clearAllData:intakeMeasurements');
      if (global.document && typeof global.document.querySelectorAll === 'function') {
        global.document.querySelectorAll('.food-row').forEach((el) => {
          try { el.remove(); } catch (error) { logSwallowed('vilda_data_import_export:clearAllData:remove-food-row', error); }
        });
      }
    } catch (error) {
      logSwallowed('vilda_data_import_export:clearAllData:reset-dynamic-rows', error);
    }
  }

  function resetRestoreButtonStateAfterClear() {
    try {
      const rb = q('restoreStateBtn');
      if (rb) {
        rb.style.display = 'none';
        try { rb.setAttribute('aria-hidden', 'true'); } catch (innerError) { logSwallowed('vilda_data_import_export:clearAllData:restore-aria', innerError); }
      }

      const wrap = q('prevSummaryWrap');
      const card = q('prevSummaryCard');
      const toggle = q('togglePrevSummary');
      const content = q('prevSummaryContent');
      [wrap, card].forEach((el) => {
        if (!el) return;
        try { el.style.display = 'none'; } catch (innerError) { logSwallowed('vilda_data_import_export:clearAllData:prev-summary-display', innerError); }
        try {
          if (el.dataset && Object.prototype.hasOwnProperty.call(el.dataset, 'loaded')) {
            delete el.dataset.loaded;
          }
        } catch (innerError) {
          logSwallowed('vilda_data_import_export:clearAllData:prev-summary-dataset', innerError);
        }
      });
      if (toggle) {
        try { toggle.style.display = 'none'; } catch (innerError) { logSwallowed('vilda_data_import_export:clearAllData:prev-toggle-display', innerError); }
        try { toggle.setAttribute('aria-expanded', 'false'); } catch (innerError) { logSwallowed('vilda_data_import_export:clearAllData:prev-toggle-aria', innerError); }
      }
      if (content) {
        clearElement(content, 'vilda_data_import_export:clearAllData:prev-summary-content');
      }

      global.lastLoadedData = null;
      global.prevMeasurementInfo = null;
      global.hasUserModifiedAfterLoad = false;
      try { global.__vildaLastLoadedDataClearedAt = Date.now(); } catch (innerError) { logSwallowed('vilda_data_import_export:clearAllData:last-loaded-clear-flag', innerError); }
    } catch (error) {
      logSwallowed('vilda_data_import_export:clearAllData:restore-state-button', error);
    }
  }

  function hideTransientCardsAfterClear(options) {
    const opts = (options && typeof options === 'object') ? options : {};
    try {
      const intakeToggle = q('toggleIntakeCard');
      if (intakeToggle) intakeToggle.style.display = 'none';
      const intakeCardEl = q('intakeCard');
      if (intakeCardEl) intakeCardEl.style.display = 'none';
      try {
        const childConsultCard = q('childConsultCard');
        if (childConsultCard) {
          childConsultCard.style.display = 'none';
          clearElement(childConsultCard, 'vilda_data_import_export:clearAllData:childConsultCard');
        }
        const planWarningEl = q('planWarning');
        if (planWarningEl) {
          planWarningEl.style.display = 'none';
          callOptional(opts, 'clearPulse', [planWarningEl], 'clearPulse');
        }
        const planCardEl = q('planCard');
        if (planCardEl) planCardEl.style.display = 'none';
      } catch (error) {
        logSwallowed('vilda_data_import_export:clearAllData:hide-transient-nested', error);
      }
    } catch (error) {
      logSwallowed('vilda_data_import_export:clearAllData:hide-transient-cards', error);
    }
  }

  function dispatchResetFieldEventsAfterClear() {
    try {
      scheduleTimeout(() => {
        try {
          const fieldIds = [
            'age', 'ageMonths', 'height', 'weight', 'sex',
            'heartRate', 'hrTemperature', 'hrPopulation', 'bpSystolic', 'bpDiastolic',
            'adultHeartRate', 'adultBpSystolic', 'adultBpDiastolic', 'adultBpGuidelineToggle', 'adultHrAthlete', 'adultHrAthleteNo', 'adultHrBetaBlocker', 'adultHrBetaBlockerNo',
            'respiratoryRateInput', 'respTemperature', 'respState', 'respPopulation',
            'headCircumference', 'chestCircumference', 'headCircumDS'
          ];
          fieldIds.forEach((id) => {
            const el = q(id);
            if (!el) return;
            try { el.dispatchEvent(new global.Event('input', { bubbles: true })); } catch (error) {
              logSwallowed('vilda_data_import_export:clearAllData:dispatch-input', error, { id });
            }
            try { el.dispatchEvent(new global.Event('change', { bubbles: true })); } catch (error) {
              logSwallowed('vilda_data_import_export:clearAllData:dispatch-change', error, { id });
            }
          });
        } catch (error) {
          logSwallowed('vilda_data_import_export:clearAllData:dispatch-loop', error);
        }
        try {
          if (typeof global.updateProfessionalSummaryCard === 'function') {
            global.updateProfessionalSummaryCard();
          }
        } catch (error) {
          logSwallowed('vilda_data_import_export:clearAllData:update-professional-summary', error);
        }
      }, 0);
    } catch (error) {
      logSwallowed('vilda_data_import_export:clearAllData:dispatch-timeout', error);
    }
  }

  function resetAuxiliaryClinicalModulesAfterClear(options) {
    const opts = (options && typeof options === 'object') ? options : {};
    try {
      if (global.vildaGhIgfPersistApi && typeof global.vildaGhIgfPersistApi.resetState === 'function') {
        global.vildaGhIgfPersistApi.resetState({ hideCards: true });
      }
    } catch (error) {
      logSwallowed('vilda_data_import_export:clearAllData:gh-igf-reset', error);
    }

    try {
      if (global.vildaSgaBirthPersistApi && typeof global.vildaSgaBirthPersistApi.resetState === 'function') {
        global.vildaSgaBirthPersistApi.resetState({ hideCard: true });
      }
    } catch (error) {
      logSwallowed('vilda_data_import_export:clearAllData:sga-reset', error);
    }

    try {
      global.ghTherapyPoints = [];
      callOptional(opts, 'clearGhTherapyPointsModuleStorage', [], 'clearGhTherapyPointsModuleStorage');
      try {
        const channel = (typeof opts.getGhTherapyBroadcastChannel === 'function')
          ? opts.getGhTherapyBroadcastChannel()
          : (opts.ghTherapyBroadcastChannel || global.ghTherapyBroadcastChannel || null);
        if (channel && typeof channel.postMessage === 'function') {
          channel.postMessage({ type: 'clear' });
        }
      } catch (error) {
        logSwallowed('vilda_data_import_export:clearAllData:gh-monitor-broadcast', error);
      }
      try {
        const clearDbResult = callOptional(opts, 'clearTherapyPointsInDB', [], 'clearTherapyPointsInDB');
        if (clearDbResult && typeof clearDbResult.catch === 'function') {
          clearDbResult.catch((error) => logSwallowed('vilda_data_import_export:clearAllData:gh-monitor-clear-db-async', error));
        }
      } catch (error) {
        logSwallowed('vilda_data_import_export:clearAllData:gh-monitor-clear-db', error);
      }
      if (typeof global.refreshGHTherapyMonitor === 'function') {
        global.refreshGHTherapyMonitor();
      }
      const monitorCard = q('ghTherapyMonitorCard');
      if (monitorCard) monitorCard.style.display = 'none';
    } catch (error) {
      logSwallowed('vilda_data_import_export:clearAllData:gh-monitor-reset', error);
    }
  }

  function clearAllData(options) {
    const opts = (options && typeof options === 'object') ? options : {};
    try {
      const persistence = getVildaPersistenceAdapter();
      if (persistence && typeof persistence.clearUserState === 'function') {
        persistence.clearUserState({ includeSessions: true, source: 'data-import-export.clearAllData', durationMs: 2500 });
      } else {
        global.__vildaPersistClearUntil = Date.now() + 2500;
        global.__vildaPersistPauseUntil = Math.max(Number(global.__vildaPersistPauseUntil || 0), Date.now() + 2500);
      }
      global.__vildaSuppressGhAdvancedImportUntil = Date.now() + 4000;
    } catch (error) {
      logSwallowed('vilda_data_import_export:clearAllData:persistence-clear', error);
    }

    clearMainSessionStorage(opts);
    try {
      if (typeof global.vildaPersistClearAfterUserClear === 'function') {
        global.vildaPersistClearAfterUserClear('vilda_data_import_export.clearAllData');
      }
    } catch (error) {
      logSwallowed('vilda_data_import_export:clearAllData:app-persist-clear', error);
    }
    resetVisibleFieldsAfterClear();
    resetSelectsAndTogglesAfterClear();
    resetModuleGlobalsAfterClear();

    try { global.advancedGrowthData = { measurements: [] }; } catch (error) { logSwallowed('vilda_data_import_export:clearAllData:advancedGrowthData', error); }
    try { global.basicGrowthData = { measurements: [] }; } catch (error) { logSwallowed('vilda_data_import_export:clearAllData:basicGrowthData', error); }
    try { global.intakeHistory = []; global.intakeEstimatedKcalPerDay = null; } catch (error) { logSwallowed('vilda_data_import_export:clearAllData:intakeGlobals', error); }

    resetDynamicRowsAfterClear();
    resetGrowthHistoryModulesAfterClear(opts);

    callOptional(opts, 'hideLoadDataMessage', [], 'hideLoadDataMessage');
    try { global.forceHideCompareInstruction = false; } catch (error) { logSwallowed('vilda_data_import_export:clearAllData:forceHideCompareInstruction', error); }

    const loadEl = q('loadDataBtn');
    if (loadEl) {
      loadEl.disabled = false;
      if (typeof loadEl.removeAttribute === 'function') loadEl.removeAttribute('disabled');
    }

    resetRestoreButtonStateAfterClear();
    hideTransientCardsAfterClear(opts);
    dispatchResetFieldEventsAfterClear();

    callOptional(opts, 'debouncedUpdate', [], 'debouncedUpdate');
    updateSaveBtnVisibility(opts);
    resetAuxiliaryClinicalModulesAfterClear(opts);
    return true;
  }

  // Synchronizacja sharedUserData po imporcie JSON — wydzielone z app.js w kroku 8L-7b.
  function normalizeSharedPersistRoot(shared) {
    const root = shared && typeof shared === 'object' && !Array.isArray(shared) ? shared : {};
    const persistRoot = root._vildaPersist && typeof root._vildaPersist === 'object' && !Array.isArray(root._vildaPersist)
      ? root._vildaPersist
      : {};
    persistRoot.v = 1;
    persistRoot.byId = persistRoot.byId && typeof persistRoot.byId === 'object' && !Array.isArray(persistRoot.byId) ? persistRoot.byId : {};
    persistRoot.byName = persistRoot.byName && typeof persistRoot.byName === 'object' && !Array.isArray(persistRoot.byName) ? persistRoot.byName : {};
    persistRoot.radio = persistRoot.radio && typeof persistRoot.radio === 'object' && !Array.isArray(persistRoot.radio) ? persistRoot.radio : {};
    persistRoot.datasetById = persistRoot.datasetById && typeof persistRoot.datasetById === 'object' && !Array.isArray(persistRoot.datasetById) ? persistRoot.datasetById : {};
    persistRoot.globals = persistRoot.globals && typeof persistRoot.globals === 'object' && !Array.isArray(persistRoot.globals) ? persistRoot.globals : {};
    root._vildaPersist = persistRoot;
    return persistRoot;
  }

  function applyLoadedDataToSharedUserRoot(root, persistRoot, data, name) {
    const shared = root && typeof root === 'object' && !Array.isArray(root) ? root : {};
    const pRoot = persistRoot && typeof persistRoot === 'object' && !Array.isArray(persistRoot)
      ? persistRoot
      : normalizeSharedPersistRoot(shared);

    if (name) {
      shared.name = name;
      shared.nameLocked = true;
    }

    if (data && data.user && typeof data.user === 'object') {
      if (data.user.age != null) shared.age = data.user.age;
      if (data.user.ageMonths != null) shared.ageMonths = data.user.ageMonths;
      if (data.user.weight != null) shared.weight = data.user.weight;
      if (data.user.height != null) shared.height = data.user.height;
      if (data.user.waist != null) shared.waistCm = data.user.waist;
      if (data.user.hip != null) shared.hipCm = data.user.hip;
      if (data.user.sex) {
        const normalizedSex = String(data.user.sex).toUpperCase() === 'F' ? 'F' : 'M';
        shared.sex = normalizedSex;
        shared.sexLocked = true;
        pRoot.byId = pRoot.byId && typeof pRoot.byId === 'object' && !Array.isArray(pRoot.byId) ? pRoot.byId : {};
        pRoot.byId.sex = normalizedSex;
      }
    }

    if (data && data.advanced && typeof data.advanced === 'object') {
      if (data.advanced.motherHeight != null) shared.advMotherHeight = data.advanced.motherHeight;
      if (data.advanced.fatherHeight != null) shared.advFatherHeight = data.advanced.fatherHeight;
      if (data.advanced.testicularVolume != null) shared.advTesticularVolume = data.advanced.testicularVolume;
      if (data.advanced.familyDelayedPuberty != null) shared.advFamilyDelayedPuberty = data.advanced.familyDelayedPuberty;
      if (data.advanced.growthExclusion != null) shared.advGrowthExclusion = data.advanced.growthExclusion;

      const boneAgePersistValue = (data.advanced.boneAgeYears != null) ? data.advanced.boneAgeYears : '';
      shared.advBoneAge = boneAgePersistValue;
      pRoot.byId = pRoot.byId && typeof pRoot.byId === 'object' && !Array.isArray(pRoot.byId) ? pRoot.byId : {};
      pRoot.byId.advBoneAge = boneAgePersistValue !== '' ? String(boneAgePersistValue) : '';
    }

    shared._vildaPersist = pRoot;
    return shared;
  }

  function syncSharedUserDataFromLoadedData(data, name, options) {
    if (!data || typeof data !== 'object') return null;
    const opts = (options && typeof options === 'object') ? options : {};
    const persistence = opts.persistence || getVildaPersistenceAdapter();
    const trimmedName = (name != null) ? String(name).trim() : '';
    const applyToShared = function applyLoadedDataSharedMutation(shared, persistRoot) {
      return applyLoadedDataToSharedUserRoot(shared, persistRoot, data, trimmedName);
    };

    try {
      if (persistence && typeof persistence.updateShared === 'function') {
        return persistence.updateShared(applyToShared, { force: true });
      }
      if (persistence && typeof persistence.readShared === 'function' && typeof persistence.writeShared === 'function') {
        const root = persistence.readShared();
        applyToShared(root, normalizeSharedPersistRoot(root));
        persistence.writeShared(root, { force: true });
        return root;
      }
    } catch (error) {
      logSwallowed('vilda_data_import_export:syncSharedUserDataFromLoadedData', error);
      return null;
    }

    logSwallowed('vilda_data_import_export:syncSharedUserDataFromLoadedData', new Error('Brak adaptera persistence.updateShared().'));
    return null;
  }

  // Pełne zastosowanie danych z importu JSON — wydzielone z app.js w kroku 8L-7c.
  // ============ FIX A+B+C — auto-dorzucanie pomiaru do tabel historycznych ============
  // Helper wspólny dla applyLoadedData() i saveUserData(). Mutuje przekazany `data`:
  //
  //   • Luka A — tworzy `data.advanced.data.measurements[]` jeśli go nie ma (puste struktury).
  //     Wcześniej cały blok auto-dorzucania był pod warunkiem `if (data.advanced.data)` —
  //     pacjenci którzy nigdy nie aktywowali modułu Zaawansowane nigdy nie dostawali wpisu.
  //
  //   • Luka B — wywoływane także przy `saveUserData()` PRZED `vault.savePatient(data)`.
  //     Dzięki temu nowy pacjent zapisany jednorazowo (bez cyklu wczytaj→edytuj→zapisz) też
  //     ma od razu wpis w tabeli, a Historia / siatka centylowa go widzi.
  //
  //   • Luka C — analogiczne dorzucanie do `data.growthBasic.data.measurements[]`. Wcześniej
  //     tylko `advanced` było auto-uzupełniane.
  //
  // DEDUP + UPDATE: jeden wpis na konkretny `ageMonths`. Jeśli wpis z tym samym wiekiem
  // już istnieje, zostaje NADPISANY nowymi wartościami z payload.user (height/weight/
  // boneAgeYears/arrow). To pokrywa scenariusz świadomej korekty pomiaru — lekarz
  // wczytuje pacjenta, poprawia wagę/wzrost w tym samym wieku, zapisuje → tabela
  // historyczna dostaje POPRAWNE wartości (nie zostaje przy starych błędnych).
  // Duplikaty (dwa różne wpisy dla tego samego wieku) nadal są niemożliwe.
  //
  // ŹRÓDŁO POMIARU: `data.user.{age, ageMonths, height, weight}` — bieżący stan formularza.
  //   age       = pełne lata
  //   ageMonths = DODATKOWE miesiące (NIE total)
  //   total miesięcy = age * 12 + ageMonths
  function _ensureCurrentMeasurementInHistory(data) {
    if (!data || typeof data !== 'object') return;
    var u = data.user || {};

    var age = (typeof u.age === 'number' && Number.isFinite(u.age)) ? u.age : null;
    var aPart = (typeof u.ageMonths === 'number' && Number.isFinite(u.ageMonths)) ? u.ageMonths : null;
    var height = (typeof u.height === 'number' && Number.isFinite(u.height) && u.height > 0) ? u.height : null;
    var weight = (typeof u.weight === 'number' && Number.isFinite(u.weight) && u.weight > 0) ? u.weight : null;

    if (age === null && aPart === null) return;           // brak wieku → no-op
    if (height === null && weight === null) return;       // brak pomiaru → no-op

    var ageMonths, ageYears;
    if (age !== null) {
      var m = (aPart !== null) ? aPart : 0;
      ageMonths = Math.round(age * 12 + m);
      ageYears = age + (m / 12);
    } else {
      ageMonths = Math.round(aPart);
      ageYears = aPart / 12;
    }
    if (!Number.isFinite(ageMonths) || ageMonths < 0) return;

    // Opcjonalne meta z modułu Zaawansowane (boneAge + arrow comment) — kompatybilność
    // ze starym blokiem 2851-2911 który też zbierał te pola.
    var boneAgeYears = null;
    if (data.advanced && typeof data.advanced.boneAgeYears === 'number' && Number.isFinite(data.advanced.boneAgeYears)) {
      boneAgeYears = data.advanced.boneAgeYears;
    } else if (data.advanced && data.advanced.data && typeof data.advanced.data.boneAgeMonths === 'number'
        && Number.isFinite(data.advanced.data.boneAgeMonths)) {
      boneAgeYears = data.advanced.data.boneAgeMonths / 12;
    }
    var advData = (data.advanced && data.advanced.data) ? data.advanced.data : null;
    var arrowEnabled = !!(advData && advData.currentArrowEnabled);
    var arrowComment = arrowEnabled && advData && typeof advData.currentArrowComment === 'string'
      ? advData.currentArrowComment.trim()
      : '';

    function buildEntry() {
      var e = {
        ageYears: ageYears,
        ageMonths: ageMonths,
        height: height,
        weight: weight
      };
      if (boneAgeYears !== null) e.boneAgeYears = boneAgeYears;
      if (arrowEnabled) {
        e.arrowEnabled = true;
        e.arrowComment = arrowComment;
      }
      return e;
    }

    // Dedup: czy istnieje już wpis z tym samym ageMonths?
    function findIndexForAge(arr) {
      if (!Array.isArray(arr)) return -1;
      for (var i = 0; i < arr.length; i += 1) {
        var entry = arr[i];
        if (!entry) continue;
        var am = (typeof entry.ageMonths === 'number' && Number.isFinite(entry.ageMonths))
          ? Math.round(entry.ageMonths)
          : (typeof entry.ageYears === 'number' && Number.isFinite(entry.ageYears))
          ? Math.round(entry.ageYears * 12)
          : NaN;
        if (Number.isFinite(am) && am === ageMonths) return i;
      }
      return -1;
    }

    function pushOrUpdate(arr) {
      var idx = findIndexForAge(arr);
      var entry = buildEntry();
      if (idx >= 0) {
        // UPDATE — istniejący wpis dla tego wieku zostaje nadpisany aktualnymi
        // wartościami z payload.user. To pozwala lekarzowi poprawić błędny pomiar
        // bez tworzenia duplikatu (drugi wpis dla tego samego wieku jest niemożliwy,
        // ale wartości się zmieniają).
        arr[idx] = entry;
        return;
      }
      arr.push(entry);
      arr.sort(function (a, b) {
        var am = (typeof a.ageMonths === 'number') ? a.ageMonths : Math.round((a.ageYears || 0) * 12);
        var bm = (typeof b.ageMonths === 'number') ? b.ageMonths : Math.round((b.ageYears || 0) * 12);
        return am - bm;
      });
    }

    // Luka A + C: zapewnij struktury data.advanced.data.measurements + data.growthBasic.data.measurements
    if (!data.advanced || typeof data.advanced !== 'object') data.advanced = {};
    if (!data.advanced.data || typeof data.advanced.data !== 'object') data.advanced.data = {};
    if (!Array.isArray(data.advanced.data.measurements)) data.advanced.data.measurements = [];
    pushOrUpdate(data.advanced.data.measurements);

    if (!data.growthBasic || typeof data.growthBasic !== 'object') data.growthBasic = {};
    if (!data.growthBasic.data || typeof data.growthBasic.data !== 'object') data.growthBasic.data = {};
    if (!Array.isArray(data.growthBasic.data.measurements)) data.growthBasic.data.measurements = [];
    pushOrUpdate(data.growthBasic.data.measurements);
  }

  function applyLoadedData(data, options){
    const opts = (options && typeof options === 'object') ? options : {};
    const document = global.document || null;
    const scheduleTimeout = (typeof global.setTimeout === 'function')
      ? global.setTimeout.bind(global)
      : function fallbackImmediateTimeout(fn) { if (typeof fn === 'function') fn(); return 0; };
    if (!data || typeof data !== 'object') return false;

    // K1: wycofano automatyczne wstrzykiwanie aktualnego pomiaru do tabeli
    // historycznej (FIX A/B/C). Powodowało duplikat — pomiar żył jednocześnie
    // w formularzu głównym (data.user) i w tabeli „Historyczne pomiary"
    // (data.advanced.data.measurements). Po K1 tabela historyczna trzyma TYLKO
    // wpisy świadomie dodane przez usera. Vault listPatientTimelineEvents sam
    // generuje chip dla pomiaru aktualnego z payload.user (bezwarunkowo).
    // Helper _ensureCurrentMeasurementInHistory zostaje wyexportowany (regresja
    // API), ale nie jest już wywoływany tutaj.

    const syncShared = resolveCallback(opts, 'syncSharedUserDataFromLoadedData', 'syncSharedUserDataFromLoadedData') || syncSharedUserDataFromLoadedData;
    const resolveFoodAlias = resolveCallback(opts, 'macroPracticeResolveFoodAliasKey', 'macroPracticeResolveFoodAliasKey') || function defaultResolveFoodAlias(key) { return key; };
    const addFoodRowFn = resolveCallback(opts, 'addFoodRow', 'addFoodRow');
    const updateSaveBtnVisibilityFn = resolveCallback(opts, 'updateSaveBtnVisibility', 'updateSaveBtnVisibility') || function noopUpdateSaveBtnVisibility() {};
    const debouncedUpdateFn = resolveCallback(opts, 'debouncedUpdate', 'debouncedUpdate');
    const showLoadDataMessageFn = resolveCallback(opts, 'showLoadDataMessage', 'showLoadDataMessage') || function noopShowLoadDataMessage() {};
    const showRestoreButtonFn = resolveCallback(opts, 'showRestoreButton', 'showRestoreButton');
    const withHistoryRestoreGuardsFn = resolveCallback(opts, 'withHistoryRestoreGuards', 'withHistoryRestoreGuards') || withHistoryRestoreGuards;
    const rehydrateAdvancedFromStateFn = resolveCallback(opts, 'rehydrateAdvancedFromState', 'vildaRehydrateAdvancedFromState') || rehydrateAdvancedFromState;
    const rehydrateIntakeFromStateFn = resolveCallback(opts, 'rehydrateIntakeFromState', 'vildaRehydrateIntakeFromState') || rehydrateIntakeFromState;
    const getPersistenceFn = resolveCallback(opts, 'getVildaPersistenceAdapter', 'getVildaPersistenceAdapter') || getVildaPersistenceAdapter || getPersistenceAdapter;
    const writeGhPoints = resolveCallback(opts, 'writeGhTherapyPointsToModuleStorage', 'writeGhTherapyPointsToModuleStorage');
    const clearGhPoints = resolveCallback(opts, 'clearGhTherapyPointsModuleStorage', 'clearGhTherapyPointsModuleStorage');
    // Przy przywracaniu bieżącej sesji (nawigacja między podstronami) nie pokazujemy
    // karty "Ostatni pomiar" — ta karta służy wyłącznie do porównania z historycznym
    // plikiem JSON wczytanym przez użytkownika explicite.
    const renderPrevSummary = opts.isSessionRestore ? null : resolveCallback(opts, 'renderPrevSummary', '__renderPrevSummary');
    const renderPrevClcrSummary = opts.isSessionRestore ? null : resolveCallback(opts, 'renderPrevClcrSummary', '__renderPrevClcrSummary');
    const pickLastMeasurement = resolveCallback(opts, 'pickLastMeasurement', '__pickLastMeasurement');
    const setAutoScrollDisabled = resolveCallback(opts, 'setAutoScrollDisabled', 'setAutoScrollDisabled');
    const closeMenuTooltip = resolveCallback(opts, 'closeMenuTooltip', 'closeMenuTooltip');
    const applyResultsMode = resolveCallback(opts, 'applyResultsModeRestoreState', 'applyResultsModeRestoreState') || applyResultsModeRestoreState;
    const applyDataSource = resolveCallback(opts, 'applyDataSourceRestoreState', 'applyDataSourceRestoreState') || applyDataSourceRestoreState;

    const safeCall = function safeCall(context, fn, args, meta) {
      if (typeof fn !== 'function') return undefined;
      try {
        return fn.apply(global, Array.isArray(args) ? args : []);
      } catch (error) {
        logSwallowed('vilda_data_import_export:applyLoadedData:' + context, error, meta || {});
        return undefined;
      }
    };

    const cloneValue = function cloneValue(value) {
      try {
        return JSON.parse(JSON.stringify(value));
      } catch (error) {
        logSwallowed('vilda_data_import_export:applyLoadedData:clone', error);
        return value;
      }
    };

    const dispatchFieldEvent = function dispatchFieldEvent(el, type) {
      if (!el || typeof el.dispatchEvent !== 'function') return;
      try {
        let ev = null;
        if (typeof global.Event === 'function') {
          ev = new global.Event(type, { bubbles: true });
        } else if (document && typeof document.createEvent === 'function') {
          ev = document.createEvent('Event');
          ev.initEvent(type, true, true);
        }
        if (ev) el.dispatchEvent(ev);
      } catch (error) {
        logSwallowed('vilda_data_import_export:applyLoadedData:dispatch-' + type, error, { elementId: el && el.id });
      }
    };

    const setField = function setField(id, value, meta) {
      const el = q(id);
      if (!el) return null;
      try { el.value = (value == null) ? '' : String(value); } catch (error) { logSwallowed('vilda_data_import_export:applyLoadedData:setField', error, Object.assign({ id }, meta || {})); }
      return el;
    };

    // Na stronie Klirens import JSON jest najpierw tylko podglądem poprzedniego
    // pomiaru. Formularz i aktywna wersja kalkulatora mają zostać nietknięte do
    // chwili jawnego kliknięcia „Odtwórz zapisany stan”.  restoreLoadedState()
    // przekazuje dane do lokalnego VildaClcrSessionRuntime i dopiero wtedy
    // odtwarza pola oraz zapisuje bieżący autosave Klirensu.
    const isClcrJsonImportPreviewOnly = !!(
      q('clcrForm') &&
      data && data.clcr && typeof data.clcr === 'object' &&
      opts.clcrPreviewOnly !== false &&
      !opts.restoreInProgress &&
      !mainSessionRestoreInProgress
    );

    // Przywróć punkty terapii hormonem wzrostu/IGF-1.
    if (!isClcrJsonImportPreviewOnly && data.ghTherapyPoints !== undefined) {
      try {
        if (Array.isArray(data.ghTherapyPoints)) {
          global.ghTherapyPoints = cloneValue(data.ghTherapyPoints);
          if (writeGhPoints) safeCall('write-gh-points', writeGhPoints, [data.ghTherapyPoints]);
        } else {
          global.ghTherapyPoints = [];
          if (clearGhPoints) safeCall('clear-gh-points', clearGhPoints, []);
        }
      } catch (error) {
        logSwallowed('vilda_data_import_export:applyLoadedData:gh-points', error);
        try { global.ghTherapyPoints = []; } catch (innerError) { logSwallowed('vilda_data_import_export:applyLoadedData:gh-points-reset', innerError); }
        if (clearGhPoints) safeCall('clear-gh-points-after-error', clearGhPoints, []);
      }
      if (typeof global.refreshGHTherapyMonitor === 'function') {
        safeCall('refresh-gh-monitor', global.refreshGHTherapyMonitor, []);
      }
    }

    const name = (data.name || '').trim();
    if (!isClcrJsonImportPreviewOnly && name) {
      ['name', 'advName', 'basicGrowthName', 'fullName'].forEach(function applyImportedName(id) {
        const el = q(id);
        if (!el) return;
        try { el.value = name; } catch (error) { logSwallowed('vilda_data_import_export:applyLoadedData:name-value', error, { id }); }
        try { el.disabled = true; } catch (error) { logSwallowed('vilda_data_import_export:applyLoadedData:name-disabled', error, { id }); }
        if (id === 'advName' || id === 'basicGrowthName') dispatchFieldEvent(el, 'input');
      });
    }

    if (!isClcrJsonImportPreviewOnly && data.user && data.user.sex && q('sex')) {
      const sexEl = q('sex');
      const normalizedSex = String(data.user.sex).toUpperCase() === 'F' ? 'F' : 'M';
      try { sexEl.value = normalizedSex; } catch (error) { logSwallowed('vilda_data_import_export:applyLoadedData:sex-value', error); }
      try { sexEl.disabled = true; } catch (error) { logSwallowed('vilda_data_import_export:applyLoadedData:sex-disabled', error); }
    }

    if (!isClcrJsonImportPreviewOnly) {
      safeCall('sync-shared-user-data', syncShared, [data, name]);
    }

    if (!isClcrJsonImportPreviewOnly && data.advanced) {
      [
        ['advMotherHeight', data.advanced.motherHeight, 'input'],
        ['advFatherHeight', data.advanced.fatherHeight, 'input'],
        ['advTesticularVolume', data.advanced.testicularVolume, 'change'],
        ['advFamilyDelayedPuberty', data.advanced.familyDelayedPuberty, 'change'],
        ['advGrowthExclusion', data.advanced.growthExclusion, 'change']
      ].forEach(function restoreAdvancedField(item) {
        const id = item[0];
        const value = item[1];
        const eventType = item[2];
        if (value == null) return;
        const el = setField(id, value);
        if (el) dispatchFieldEvent(el, eventType);
      });

      // FIX A+B+C: _ensureCurrentMeasurementInHistory został wywołany na początku
      // applyLoadedData (i już zmutował data.advanced.data.measurements + .growthBasic).
      // Tu już tylko kopiujemy do globalu — pomiar bieżący jest w tablicy.
      if (data.advanced.data) {
        try {
          global.advancedGrowthData = cloneValue(data.advanced.data);
        } catch (error) {
          logSwallowed('vilda_data_import_export:applyLoadedData:advanced-data', error);
          global.advancedGrowthData = data.advanced.data;
        }
        try {
          if (global.advancedGrowthData && typeof global.advancedGrowthData === 'object') {
            global.advancedGrowthData.measurements = sanitizeAdvancedMeasurementEntries(global.advancedGrowthData.measurements);
          }
        } catch (error) {
          logSwallowed('vilda_data_import_export:applyLoadedData:sanitize-advanced-measurements', error);
        }
      }
    }

    if (!isClcrJsonImportPreviewOnly && data.growthBasic) {
      if (data.growthBasic.data) {
        try { global.basicGrowthData = cloneValue(data.growthBasic.data); }
        catch (error) { logSwallowed('vilda_data_import_export:applyLoadedData:growth-basic-data', error); global.basicGrowthData = data.growthBasic.data; }
      } else {
        try { global.basicGrowthData = { measurements: [] }; } catch (error) { logSwallowed('vilda_data_import_export:applyLoadedData:growth-basic-reset', error); }
      }
      if (q('basicGrowthName') && data.growthBasic.name != null) {
        const el = setField('basicGrowthName', data.growthBasic.name);
        if (el) dispatchFieldEvent(el, 'input');
      }
    }

    if (!isClcrJsonImportPreviewOnly && data.intake) {
      if (q('intakePal') && data.intake.pal) setField('intakePal', data.intake.pal);
      if (Array.isArray(data.intake.history)) {
        try { global.intakeHistory = sanitizeIntakeHistoryEntries(data.intake.history); }
        catch (error) { logSwallowed('vilda_data_import_export:applyLoadedData:intake-history', error); global.intakeHistory = sanitizeIntakeHistoryEntries(data.intake.history || []); }
      }
      if (typeof data.intake.estKcalPerDay === 'number') {
        global.intakeEstimatedKcalPerDay = data.intake.estKcalPerDay;
      }
    }

    if (!isClcrJsonImportPreviewOnly) try {
      const dictionaries = getFoodDictionaries();
      const foods = dictionaries.foods || {};
      const buildRows = function buildRows(rows) {
        if (!rows || !rows.length || !addFoodRowFn) return;
        rows.forEach(function addImportedFoodRow(r) {
          if (!r || typeof r !== 'object') return;
          const resolvedFoodKey = resolveFoodAlias(r.key);
          safeCall('add-food-row', addFoodRowFn, [resolvedFoodKey]);
          const list = document ? document.querySelectorAll('.food-row') : [];
          const row = list && list.length ? list[list.length - 1] : null;
          if (!row) return;
          const sel = row.querySelector('select');
          const inp = row.querySelector('input[type="number"]');
          if (sel) sel.value = foods[resolvedFoodKey] ? resolvedFoodKey : 'snickers';
          if (inp) inp.value = r.qty;
        });
      };
      if (data.foods) {
        if (Array.isArray(data.foods.snacks)) buildRows(data.foods.snacks);
        if (Array.isArray(data.foods.meals)) buildRows(data.foods.meals);
      }
    } catch (error) {
      logSwallowed('vilda_data_import_export:applyLoadedData:foods', error);
    }

    if (!isClcrJsonImportPreviewOnly && data.user) {
      const a = data.user;
      const clearIds = (a.age != null && a.age > 18)
        ? ['age', 'ageMonths', 'weight', 'advBoneAge']
        : ['age', 'ageMonths', 'weight', 'height', 'advBoneAge'];
      clearIds.forEach(function clearImportedCurrentField(id) { setField(id, ''); });
      ['advTesticularVolume', 'advFamilyDelayedPuberty', 'advGrowthExclusion'].forEach(function clearAdvancedSelect(id) { setField(id, ''); });
      if (a.age != null && a.age > 18 && q('height')) setField('height', a.height != null ? a.height : '');
    }

    if (!isClcrJsonImportPreviewOnly) {
      if (setAutoScrollDisabled) {
        safeCall('set-autoscroll-disabled', setAutoScrollDisabled, [true]);
      } else {
        try { global.autoScrollDisabled = true; } catch (error) { logSwallowed('vilda_data_import_export:applyLoadedData:auto-scroll-global', error); }
      }
    }

    if (!isClcrJsonImportPreviewOnly) try {
      if (data && data.zscore) {
        if (data.zscore.resultsMode != null) {
          safeCall('apply-results-mode-restore', applyResultsMode, [!!data.zscore.resultsMode, opts]);
        }
        if (data.zscore.dataSource) {
          safeCall('apply-data-source-restore', applyDataSource, [data.zscore.dataSource, opts]);
        }
      }
    } catch (error) {
      logSwallowed('vilda_data_import_export:applyLoadedData:zscore-restore', error);
    }

    if (!isClcrJsonImportPreviewOnly && data.plan) {
      if (q('palFactor') && data.plan.palFactor) setField('palFactor', String(data.plan.palFactor));
      if (q('dietLevel') && data.plan.dietLevel) setField('dietLevel', data.plan.dietLevel);
    }

    if (!isClcrJsonImportPreviewOnly && data.clcr && typeof data.clcr === 'object') {
      try {
        const persistence = getPersistenceFn ? safeCall('get-persistence', getPersistenceFn, []) : getPersistenceAdapter();
        if (persistence && typeof persistence.writeClcrSession === 'function') {
          safeCall('write-clcr-session', persistence.writeClcrSession.bind(persistence), [data.clcr]);
        }
      } catch (error) {
        logSwallowed('vilda_data_import_export:applyLoadedData:clcr-persistence', error);
      }
      try {
        let handledByClcrRuntime = false;
        const clcrRuntime = global.VildaClcrSessionRuntime;
        if (clcrRuntime && typeof clcrRuntime.restoreFromSession === 'function') {
          safeCall('clcr-apply-import-runtime', clcrRuntime.restoreFromSession, [data.clcr, {
            source: 'json-import-apply',
            update: true,
            hideLoadedSummary: false,
            hideRestoreButton: false,
            dispatchEvents: false
          }]);
          handledByClcrRuntime = true;
        } else if (typeof global.applyClcrSessionSnapshot === 'function') {
          safeCall('clcr-apply-import-runtime', global.applyClcrSessionSnapshot, [data.clcr, {
            source: 'json-import-apply',
            update: true,
            hideLoadedSummary: false,
            hideRestoreButton: false,
            dispatchEvents: false
          }]);
          handledByClcrRuntime = true;
        }
        if (!handledByClcrRuntime) {
          const form = q('clcrForm');
          if (form && data.clcr.inputs && typeof data.clcr.inputs === 'object') {
            const targetVersion = data.clcr.currentVersion || data.clcr.inputs.currentVersion || data.clcr.calculatorVersion || '';
            if (targetVersion && typeof global.setVersion === 'function') safeCall('clcr-set-version-after-import', global.setVersion, [targetVersion]);
            Object.keys(data.clcr.inputs).forEach(function restoreClcrInput(key) {
              if (key === 'currentVersion') return;
              const el = q(key) || (form.elements && typeof form.elements.namedItem === 'function' ? form.elements.namedItem(key) : null);
              if (!el) return;
              const value = data.clcr.inputs[key];
              const type = (el.type || '').toLowerCase();
              if (type === 'checkbox' || type === 'radio') el.checked = !!value;
              else el.value = value == null ? '' : String(value);
            });
            if (typeof global.clcrUpdate === 'function') safeCall('clcr-update-after-import', global.clcrUpdate, []);
            else if (typeof global.update === 'function') safeCall('clcr-update-after-import', global.update, []);
          }
        }
      } catch (error) {
        logSwallowed('vilda_data_import_export:applyLoadedData:clcr-ui', error);
      }
    }


    if (!isClcrJsonImportPreviewOnly) {
      safeCall('with-history-restore-guards', withHistoryRestoreGuardsFn, [function runImportRehydration() {
        safeCall('rehydrate-advanced-from-state', rehydrateAdvancedFromStateFn, []);
        if (typeof global.vildaRehydrateBasicGrowthFromState === 'function') safeCall('rehydrate-basic-from-state', global.vildaRehydrateBasicGrowthFromState, []);
        safeCall('rehydrate-intake-from-state', rehydrateIntakeFromStateFn, [(data && data.intake && data.intake.pal) || null]);
      }]);

      if (typeof global.vildaEnsureAdvancedIntakePairing === 'function') safeCall('ensure-advanced-intake-pairing', global.vildaEnsureAdvancedIntakePairing, []);
      if (typeof global.reconcileGrowthHistoryModules === 'function') safeCall('reconcile-growth-history-advanced', global.reconcileGrowthHistoryModules, ['advanced']);
    }
    if (!isClcrJsonImportPreviewOnly && typeof global.vildaPersistScheduleSave === 'function') {
      try {
        scheduleTimeout(function schedulePersistAfterImport() {
          safeCall('persist-schedule-save', global.vildaPersistScheduleSave, []);
        }, 950);
      } catch (error) {
        logSwallowed('vilda_data_import_export:applyLoadedData:persist-schedule-timeout', error);
      }
    }

    const loadEl = q('loadDataBtn');
    if (loadEl) {
      try { loadEl.disabled = true; loadEl.setAttribute('disabled', ''); } catch (error) { logSwallowed('vilda_data_import_export:applyLoadedData:disable-load-button', error); }
    }

    safeCall('show-load-data-message', showLoadDataMessageFn, []);
    if (!isClcrJsonImportPreviewOnly && debouncedUpdateFn) safeCall('debounced-update', debouncedUpdateFn, []);
    safeCall('update-save-button-visibility', updateSaveBtnVisibilityFn, []);

    safeCall('render-prev-summary', renderPrevSummary, [data]);
    safeCall('render-prev-clcr-summary', renderPrevClcrSummary, [data]);

    try {
      const placeholderEl = q('prevClcrPlaceholder');
      if (placeholderEl) placeholderEl.style.display = 'none';
    } catch (error) {
      logSwallowed('vilda_data_import_export:applyLoadedData:hide-prev-clcr-placeholder', error);
    }

    try {
      global.prevMeasurementInfo = pickLastMeasurement ? pickLastMeasurement(data) : null;
    } catch (error) {
      logSwallowed('vilda_data_import_export:applyLoadedData:prev-measurement-info', error);
      global.prevMeasurementInfo = null;
    }

    if (typeof global.updatePrevSummaryDiff === 'function') safeCall('update-prev-summary-diff', global.updatePrevSummaryDiff, []);

    if (!isClcrJsonImportPreviewOnly) {
      try {
        [
          'sex', 'heartRate', 'hrTemperature', 'hrPopulation', 'bpSystolic', 'bpDiastolic',
          'adultHeartRate', 'adultBpSystolic', 'adultBpDiastolic', 'adultBpGuidelineToggle',
          'adultHrAthlete', 'adultHrAthleteNo', 'adultHrBetaBlocker', 'adultHrBetaBlockerNo',
          'respiratoryRateInput', 'respTemperature', 'respState', 'respPopulation',
          'headCircumference', 'chestCircumference', 'headCircumDS'
        ].forEach(function dispatchImportedModuleField(id) {
          const el = q(id);
          if (!el) return;
          dispatchFieldEvent(el, 'input');
          dispatchFieldEvent(el, 'change');
        });
      } catch (error) {
        logSwallowed('vilda_data_import_export:applyLoadedData:dispatch-module-fields', error);
      }
    }

    try {
      const navToggle = q('navToggle');
      if (navToggle) navToggle.checked = false;
      if (closeMenuTooltip) safeCall('close-menu-tooltip', closeMenuTooltip, []);
    } catch (error) {
      logSwallowed('vilda_data_import_export:applyLoadedData:collapse-menu', error);
    }

    try {
      // Podczas przywracania sesji (nawigacja między podstronami) NIE ustawiamy
      // lastLoadedData — uniknięcie zapisu loadedComparisonData do localStorage
      // przez flushPersistNow, co powodowałoby pokazanie karty "Ostatni pomiar"
      // na kolejnej podstronie przez ścieżkę restoreAll() w vilda_persist_runtime.js.
      if (!opts.isSessionRestore) {
        global.lastLoadedData = cloneValue(data);
        global.hasUserModifiedAfterLoad = false;
      }
    } catch (error) {
      logSwallowed('vilda_data_import_export:applyLoadedData:last-loaded-data', error);
      try { if (!opts.isSessionRestore) global.lastLoadedData = data; } catch (innerError) { logSwallowed('vilda_data_import_export:applyLoadedData:last-loaded-data-fallback', innerError); }
    }

    if (!isClcrJsonImportPreviewOnly) {
      try {
        scheduleTimeout(function flushPersistAfterImport() {
          try {
            if (typeof global.vildaPersistFlushNow === 'function') {
              global.vildaPersistFlushNow({ force: true });
            }
          } catch (error) {
            logSwallowed('vilda_data_import_export:applyLoadedData:persist-flush', error);
          }
          // ── Faza 5: dispatch event dla wskaźnika statusu zapisu ──
          // VildaSaveStatusIndicator nasłuchuje i przechodzi w NEW_PATIENT —
          // plik JSON to NIE snapshot w vault. User musi kliknąć „Zapisz dane",
          // żeby utworzyć kartę pacjenta dla tych danych w karcie pacjenta.
          try {
            if (typeof global.CustomEvent === 'function' && global.document) {
              global.document.dispatchEvent(new global.CustomEvent('vilda:json-imported', {
                detail: {
                  name: (data && data.name) || null,
                  source: opts.source || 'json-import'
                }
              }));
            }
          } catch (_) { /* fail-silent — nie blokuj importu */ }
        }, 0);
      } catch (error) {
        logSwallowed('vilda_data_import_export:applyLoadedData:persist-flush-timeout', error);
      }
    }

    if (showRestoreButtonFn) safeCall('show-restore-button', showRestoreButtonFn, []);
    else safeCall('show-restore-button-local', showRestoreButton, [opts]);

    return true;
  }


  // Restore przycisku ostatnio wczytanego stanu — wydzielone z app.js w kroku 8L-6b.
  function showRestoreButton(options){
    const opts = (options && typeof options === 'object') ? options : {};
    const window = global;
    const document = global.document || null;
    const hideLoadDataMessage = resolveCallback(opts, 'hideLoadDataMessage', 'hideLoadDataMessage') || function noopHideLoadDataMessage() {};
    const updateSaveBtnVisibility = resolveCallback(opts, 'updateSaveBtnVisibility', 'updateSaveBtnVisibility') || function noopUpdateSaveBtnVisibility() {};
    const btn = document.getElementById('restoreStateBtn');
    if (!btn) return;
    // Jeżeli przycisk jest już widoczny, nie rób nic
    if (btn.style.display !== 'none' && btn.style.display !== '') return;
    btn.style.display = 'inline-block';
    // Po wyświetleniu przycisku "Przywróć zapisany stan" należy dopasować wysokość
    // kart po obu stronach formularza (np. karta "Ostatni pomiar" lub karta wyników
    // klirensu). W przeciwnym razie zmiana wysokości sekcji użytkownika przez
    // dodatkowy przycisk powoduje, że sąsiednia karta ma inną wysokość aż do
    // następnej zmiany rozmiaru okna.  Aby natychmiast wyrównać wysokości,
    // wywołujemy globalne funkcje dostosowujące layout za pośrednictwem
    // zdarzenia resize.  Funkcje te są nasłuchiwane zarówno na stronie głównej
    // (adjustPrevSummaryHeight, adjustSummaryCardsHeight), jak i w kalkulatorze
    // klirensu (setupPrevClcrCardHeight), dlatego użycie zdarzenia "resize"
    // gwarantuje wykonanie odpowiednich dostosowań bez ręcznej ingerencji.
    try {
      if (typeof window !== 'undefined') {
        // Wywołaj event resize, aby układy mogły zaktualizować wysokości kart.
        window.dispatchEvent(new Event('resize'));
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 35964 });
    }
  }
    // Jednorazowa funkcja ukrywająca przycisk i komunikat o wczytaniu danych
    const hideFunc = function(){
      try { btn.style.display = 'none'; } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 35967 });
    }
  }
      try { hideLoadDataMessage(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 35968 });
    }
  }
      // Po edycji czegokolwiek ustaw flagę oznaczającą, że użytkownik
      // zmodyfikował formularz po wczytaniu danych.  Dzięki temu
      // updateSaveBtnVisibility() aktywuje przycisk zapisu w kontekście
      // załadowanego stanu.
      try {
        if (typeof window !== 'undefined' && window.lastLoadedData) {
          window.hasUserModifiedAfterLoad = true;
        }
      } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 35977 });
    }
  }
      document.removeEventListener('input', hideFunc, true);
      document.removeEventListener('change', hideFunc, true);
      // Po ukryciu przycisku ponownie oceń dostępność przycisku zapisu
      updateSaveBtnVisibility();
      // Po ukryciu przycisku należy również dostosować wysokości kart, ponieważ
      // sekcja formularza uległa skróceniu.  Wywołaj zdarzenie resize, aby
      // globalne funkcje adjustPrevSummaryHeight/setupPrevClcrCardHeight
      // mogły wyrównać wysokości kart do aktualnego rozmiaru.
      try {
        if (typeof window !== 'undefined') {
          // Wywołaj zdarzenie resize, aby układy mogły zaktualizować wysokości kart.
          window.dispatchEvent(new Event('resize'));
          // Nie resetujemy globalnej flagi forceHideCompareInstruction w tym miejscu.
          // Po wczytaniu danych z pliku i rozpoczęciu edycji użytkownik nie powinien
          // ponownie widzieć etykiety "Uzupełnij wymagane pola…" w prawej kolumnie.
          // Pozostawienie tej flagi w stanie true pozwala hideLoadDataMessage()
          // utrzymać instrukcję ukrytą, zgodnie z wymaganiami, aż do pełnego
          // wyczyszczenia formularza (np. funkcja clearAllData() ustawia flagę
          // ponownie na false).
        }
      } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 35998 });
    }
  }
    };
    // Nasłuchuj w fazie capture, aby wykryć zmiany zanim dotrą do innych handlerów
    document.addEventListener('input', hideFunc, true);
    document.addEventListener('change', hideFunc, true);
  }

  function restoreLoadedState(options){
    const opts = (options && typeof options === 'object') ? options : {};
    const window = global;
    const document = global.document || null;
    const Event = global.Event;
    const foods = getFoodDictionaries().foods || {};
    const anyDataEntered = resolveCallback(opts, 'anyDataEntered', 'anyDataEntered') || function noopAnyDataEntered() { return false; };
    const hideLoadDataMessage = resolveCallback(opts, 'hideLoadDataMessage', 'hideLoadDataMessage') || function noopHideLoadDataMessage() {};
    const macroPracticeResolveFoodAliasKey = resolveCallback(opts, 'macroPracticeResolveFoodAliasKey', 'macroPracticeResolveFoodAliasKey') || function identityFoodKey(key) { return key; };
    const addFoodRow = resolveCallback(opts, 'addFoodRow', 'addFoodRow') || function noopAddFoodRow() {};
    const syncSharedUserDataFromLoadedData = resolveCallback(opts, 'syncSharedUserDataFromLoadedData', 'syncSharedUserDataFromLoadedData') || function noopSyncSharedUserDataFromLoadedData() {};
    const calculateGrowthAdvanced = resolveCallback(opts, 'calculateGrowthAdvanced', 'calculateGrowthAdvanced') || function noopCalculateGrowthAdvanced() {};
    const calcEstimatedIntake = resolveCallback(opts, 'calcEstimatedIntake', 'calcEstimatedIntake') || function noopCalcEstimatedIntake() {};
    const autoDisableFromStoredData = resolveCallback(opts, 'autoDisableFromStoredData', 'autoDisableFromStoredData') || function noopAutoDisableFromStoredData() {};
    const debouncedUpdate = resolveCallback(opts, 'debouncedUpdate', 'debouncedUpdate') || null;
    const updateSaveBtnVisibility = resolveCallback(opts, 'updateSaveBtnVisibility', 'updateSaveBtnVisibility') || function noopUpdateSaveBtnVisibility() {};
    const scheduleMainSessionSave = resolveCallback(opts, 'scheduleMainSessionSave', 'scheduleMainSessionSave') || function noopScheduleMainSessionSave() {};
    const restoreApplyResultsModeRestoreState = resolveCallback(opts, 'applyResultsModeRestoreState', 'applyResultsModeRestoreState') || function defaultApplyResultsModeRestoreState(value) { return applyResultsModeRestoreState(value, opts); };
    const restoreApplyDataSourceRestoreState = resolveCallback(opts, 'applyDataSourceRestoreState', 'applyDataSourceRestoreState') || function defaultApplyDataSourceRestoreState(value) { return applyDataSourceRestoreState(value, opts); };
    const restoreRehydrateAdvancedFromState = resolveCallback(opts, 'rehydrateAdvancedFromState', 'vildaRehydrateAdvancedFromState') || function defaultRehydrateAdvancedFromState(value) { return rehydrateAdvancedFromState(value); };
    const restoreRehydrateIntakeFromState = resolveCallback(opts, 'rehydrateIntakeFromState', 'vildaRehydrateIntakeFromState') || function defaultRehydrateIntakeFromState(savedPal, value) { return rehydrateIntakeFromState(savedPal, value); };
    const data = opts.data || ((typeof window !== 'undefined') ? window.lastLoadedData : null);
    if (!data) return;

    try {
      // Jeżeli użytkownik zdążył wprowadzić nowe dane po wczytaniu pliku,
      // zapytaj o potwierdzenie przed nadpisaniem
      if (typeof anyDataEntered === 'function' && anyDataEntered()) {
        const ok = window.confirm && window.confirm('Masz wprowadzone nowe dane, które nie zostały zapisane.\nCzy na pewno chcesz przywrócić zapisany stan?');
        if (!ok) return;
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 36025 });
    }
  }

    // Przywracając pełny stan nie modyfikujemy tablicy pomiarów.
    // W poprzedniej wersji usuwano pierwszy element, ponieważ przy wczytywaniu
    // zapisu dodawano duplikat aktualnego pomiaru.  Po modyfikacji logiki
    // w applyLoadedData() duplikat nie jest już tworzony, dlatego nic
    // nie usuwamy z historii zaawansowanych obliczeń.
    // Ukryj kartę poprzedniego pomiaru i związane elementy (na stronie głównej)
    try {
      const wrap = document.getElementById('prevSummaryWrap');
      const card = document.getElementById('prevSummaryCard');
      const togglePrev = document.getElementById('togglePrevSummary');
      if (wrap) {
        wrap.style.display = 'none';
        if (wrap.dataset) delete wrap.dataset.loaded;
      }
      if (card) {
        card.style.display = 'none';
        if (card.dataset) delete card.dataset.loaded;
      }
      if (togglePrev) {
        togglePrev.style.display = 'none';
      }
      try {
        hideLoadDataMessage();
        // Po przywróceniu stanu nie pokazuj ponownie instrukcji "Uzupełnij wymagane pola...".
        const ci = document.getElementById('compareInstruction');
        if (ci && ci.style) {
          ci.style.display = 'none';
        }
        try {
          if (typeof window !== 'undefined') {
            window.forceHideCompareInstruction = true;
          }
        } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 36061 });
    }
  }
      } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 36062 });
    }
  }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 36063 });
    }
  }

    let prevAdvSync = false;
    let prevCrossSync = false;
    let prevIntakeReset = false;
    let prevPersistRestoring = false;
    let prevPauseUntil = 0;

    try {
      if (typeof window !== 'undefined') {
        prevAdvSync = !!window.__vildaSuspendAdvIntakeSync;
        prevCrossSync = !!window.__vildaSuspendGrowthHistoryCrossSync;
        prevIntakeReset = !!window.__vildaSuspendIntakeUserReset;
        prevPersistRestoring = !!window.__vildaPersistRestoring;
        prevPauseUntil = Number(window.__vildaPersistPauseUntil || 0);
        window.__vildaSuspendAdvIntakeSync = true;
        window.__vildaSuspendGrowthHistoryCrossSync = true;
        window.__vildaSuspendIntakeUserReset = true;
        window.__vildaPersistRestoring = true;
        window.__vildaPersistPauseUntil = Math.max(prevPauseUntil, Date.now() + 1600);
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 36084 });
    }
  }

    try {
      const name = (data.name || '').trim();
      const resultsModeSaved = !!(data.zscore && data.zscore.resultsMode);
      const dataSourceSaved = (data.zscore && typeof data.zscore.dataSource === 'string') ? data.zscore.dataSource : '';

      // Przywróć podstawowe dane użytkownika i zablokuj odpowiednie pola.
      // Nie emitujemy lawiny zdarzeń input/change – finalne przeliczenie i synchronizacja
      // wykonywane są kontrolowanie dopiero po odbudowaniu całego UI.
      if (name) {
        setFieldValueSilently(document.getElementById('name'), name, { disabled: true });
        setFieldValueSilently(document.getElementById('advName'), name, { disabled: true });
        setFieldValueSilently(document.getElementById('basicGrowthName'), name, { disabled: true });
        setFieldValueSilently(document.getElementById('fullName'), name, { disabled: true });
      }

      if (data.user) {
        setFieldValueSilently(document.getElementById('sex'), data.user.sex || '', { disabled: !!data.user.sex });
        setFieldValueSilently(document.getElementById('age'), data.user.age != null ? data.user.age : '');
        setFieldValueSilently(document.getElementById('ageMonths'), data.user.ageMonths != null ? data.user.ageMonths : '');
        setFieldValueSilently(document.getElementById('weight'), data.user.weight != null ? data.user.weight : '');
        setFieldValueSilently(document.getElementById('height'), data.user.height != null ? data.user.height : '');
        setFieldValueSilently(document.getElementById('waistCm'), data.user.waist != null ? data.user.waist : '');
        setFieldValueSilently(document.getElementById('hipCm'), data.user.hip != null ? data.user.hip : '');
      }

      if (data.advanced) {
        setFieldValueSilently(document.getElementById('advBoneAge'), data.advanced.boneAgeYears != null ? data.advanced.boneAgeYears : '');
        setFieldValueSilently(document.getElementById('advMotherHeight'), data.advanced.motherHeight != null ? data.advanced.motherHeight : '');
        setFieldValueSilently(document.getElementById('advFatherHeight'), data.advanced.fatherHeight != null ? data.advanced.fatherHeight : '');
        setFieldValueSilently(document.getElementById('advTesticularVolume'), data.advanced.testicularVolume != null ? data.advanced.testicularVolume : '');
        setFieldValueSilently(document.getElementById('advFamilyDelayedPuberty'), data.advanced.familyDelayedPuberty != null ? data.advanced.familyDelayedPuberty : '');
        setFieldValueSilently(document.getElementById('advGrowthExclusion'), data.advanced.growthExclusion != null ? data.advanced.growthExclusion : '');
        if (data.advanced.data) {
          try { window.advancedGrowthData = JSON.parse(JSON.stringify(data.advanced.data)); }
          catch (_) { window.advancedGrowthData = data.advanced.data; }
          try {
            if (window.advancedGrowthData && typeof window.advancedGrowthData === 'object') {
              window.advancedGrowthData.measurements = sanitizeAdvancedMeasurementEntries(window.advancedGrowthData.measurements);
            }
          } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 36125 });
    }
  }
        } else {
          window.advancedGrowthData = { measurements: [] };
        }
      }

      if (data.growthBasic) {
        if (data.growthBasic.data) {
          try { window.basicGrowthData = JSON.parse(JSON.stringify(data.growthBasic.data)); }
          catch (_) { window.basicGrowthData = data.growthBasic.data; }
        } else {
          window.basicGrowthData = { measurements: [] };
        }
      }

      if (data.intake) {
        setFieldValueSilently(document.getElementById('intakePal'), data.intake.pal || '');
        try {
          if (Array.isArray(data.intake.history)) {
            window.intakeHistory = sanitizeIntakeHistoryEntries(JSON.parse(JSON.stringify(data.intake.history)));
          } else {
            window.intakeHistory = [];
          }
        } catch (_) {
          window.intakeHistory = sanitizeIntakeHistoryEntries(data.intake.history || []);
        }
        if (typeof data.intake.estKcalPerDay === 'number') {
          window.intakeEstimatedKcalPerDay = data.intake.estKcalPerDay;
        } else {
          window.intakeEstimatedKcalPerDay = null;
        }
      }

      // Usuń wiersze przekąsek i dań przed odtworzeniem
      try {
        document.querySelectorAll('.food-row').forEach(el => el.remove());
      } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 36161 });
    }
  }
      // Odtwórz wiersze przekąsek i dań
      if (data.foods) {
        try {
          if (Array.isArray(data.foods.snacks)) {
            data.foods.snacks.forEach(r => {
              const resolvedFoodKey = macroPracticeResolveFoodAliasKey(r.key);
              addFoodRow(resolvedFoodKey);
              const list = document.querySelectorAll('.food-row');
              const row  = list[list.length - 1];
              if (!row) return;
              const sel = row.querySelector('select');
              const inp = row.querySelector('input[type="number"]');
              if (sel) sel.value = foods[resolvedFoodKey] ? resolvedFoodKey : 'snickers';
              if (inp) inp.value = r.qty;
            });
          }
          if (Array.isArray(data.foods.meals)) {
            data.foods.meals.forEach(r => {
              const resolvedFoodKey = macroPracticeResolveFoodAliasKey(r.key);
              addFoodRow(resolvedFoodKey);
              const list = document.querySelectorAll('.food-row');
              const row  = list[list.length - 1];
              if (!row) return;
              const sel = row.querySelector('select');
              const inp = row.querySelector('input[type="number"]');
              if (sel) sel.value = foods[resolvedFoodKey] ? resolvedFoodKey : 'snickers';
              if (inp) inp.value = r.qty;
            });
          }
        } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 36191 });
    }
  }
      }

      // Przywróć plan
      if (data.plan) {
        setFieldValueSilently(document.getElementById('palFactor'), data.plan.palFactor ? String(data.plan.palFactor) : '');
        setFieldValueSilently(document.getElementById('dietLevel'), data.plan.dietLevel || '');
      }

      // Odtwórz dane klirensu w sessionStorage i formularzu, jeśli istnieją.
      // Na stronie Klirens delegujemy do lokalnego runtime, który zna układ wersji
      // kalkulatora, pola bez atrybutów name oraz kartę „Ostatni pomiar”.
      if (data.clcr && typeof data.clcr === 'object') {
        try {
          const persistence = getVildaPersistenceAdapter();
          if (persistence && typeof persistence.writeClcrSession === 'function') {
            persistence.writeClcrSession(data.clcr);
          }
        } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 36207 });
    }
  }
        try {
          let handledByClcrRuntime = false;
          const clcrRuntime = window.VildaClcrSessionRuntime;
          if (clcrRuntime && typeof clcrRuntime.restoreFromSession === 'function') {
            window.VildaClcrSessionRuntime.restoreFromSession(data.clcr, {
              source: 'json-restore',
              update: true,
              hideLoadedSummary: true,
              showPlaceholder: false,
              hideRestoreButton: true,
              dispatchEvents: false,
              writeSession: true
            });
            handledByClcrRuntime = true;
          } else if (typeof window.applyClcrSessionSnapshot === 'function') {
            window.applyClcrSessionSnapshot(data.clcr, {
              source: 'json-restore',
              update: true,
              hideLoadedSummary: true,
              showPlaceholder: false,
              hideRestoreButton: true,
              dispatchEvents: false,
              writeSession: true
            });
            handledByClcrRuntime = true;
          }
          if (!handledByClcrRuntime) {
            const form = document.getElementById('clcrForm');
            if (form && data.clcr.inputs && typeof data.clcr.inputs === 'object') {
              const targetVersion = data.clcr.currentVersion || data.clcr.inputs.currentVersion || data.clcr.calculatorVersion || '';
              if (targetVersion && typeof window.setVersion === 'function') {
                try { window.setVersion(targetVersion); } catch (_) {}
              }
              Object.keys(data.clcr.inputs).forEach(function(key) {
                if (key === 'currentVersion') return;
                const el = document.getElementById(key) || form.elements.namedItem(key);
                if (!el) return;
                const value = data.clcr.inputs[key];
                const type  = (el.type || '').toLowerCase();
                if (type === 'checkbox' || type === 'radio') {
                  el.checked = !!value;
                } else {
                  el.value = value == null ? '' : String(value);
                }
              });
              if (typeof window.hideLoadedClcrSummaryCard === 'function') {
                try { window.hideLoadedClcrSummaryCard({ showPlaceholder: false }); } catch (_) {}
              }
              if (typeof window.clcrUpdate === 'function') {
                try { window.clcrUpdate(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 36223 });
    }
  }
              } else if (typeof window.update === 'function') {
                try { window.update(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 36224 });
    }
  }
              }
            }
          }
        } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 36226 });
    }
  }
      }

      // Przywróć dodatkowe moduły: ciśnienie/tętno, liczba oddechów i obwody
      if (data.bp) {
        setFieldValueSilently(document.getElementById('heartRate'), data.bp.heartRate != null ? data.bp.heartRate : '');
        setFieldValueSilently(document.getElementById('hrTemperature'), data.bp.temperature != null ? data.bp.temperature : '');
        setFieldValueSilently(document.getElementById('hrPopulation'), data.bp.population != null ? data.bp.population : '');
        setFieldValueSilently(document.getElementById('bpSystolic'), data.bp.systolic != null ? data.bp.systolic : '');
        setFieldValueSilently(document.getElementById('bpDiastolic'), data.bp.diastolic != null ? data.bp.diastolic : '');
      }
      const adultVitalsData = data.adultVitals || (function() {
        const ageYearsRaw = data && data.user ? Number(data.user.age) : NaN;
        const ageMonthsRaw = data && data.user ? Number(data.user.ageMonths) : NaN;
        const isAdultSnapshot = Number.isFinite(ageYearsRaw) && (ageYearsRaw + ((Number.isFinite(ageMonthsRaw) ? ageMonthsRaw : 0) / 12)) >= 18;
        if (!isAdultSnapshot || !data.bp) return null;
        return {
          guideline: 'ESC',
          heartRate: data.bp.heartRate != null ? data.bp.heartRate : null,
          systolic: data.bp.systolic != null ? data.bp.systolic : null,
          diastolic: data.bp.diastolic != null ? data.bp.diastolic : null,
          athlete: false,
          betaBlocker: false
        };
      })();
      if (adultVitalsData) {
        setCheckboxValueSilently(document.getElementById('adultBpGuidelineToggle'), String(adultVitalsData.guideline || '').toUpperCase() !== 'AHA');
        setFieldValueSilently(document.getElementById('adultHeartRate'), adultVitalsData.heartRate != null ? adultVitalsData.heartRate : '');
        setFieldValueSilently(document.getElementById('adultBpSystolic'), adultVitalsData.systolic != null ? adultVitalsData.systolic : '');
        setFieldValueSilently(document.getElementById('adultBpDiastolic'), adultVitalsData.diastolic != null ? adultVitalsData.diastolic : '');
        setCheckboxValueSilently(document.getElementById('adultHrAthlete'), !!adultVitalsData.athlete);
        setCheckboxValueSilently(document.getElementById('adultHrAthleteNo'), !adultVitalsData.athlete);
        setCheckboxValueSilently(document.getElementById('adultHrBetaBlocker'), !!adultVitalsData.betaBlocker);
        setCheckboxValueSilently(document.getElementById('adultHrBetaBlockerNo'), !adultVitalsData.betaBlocker);
      }
      if (data.respiratory) {
        setFieldValueSilently(document.getElementById('respiratoryRateInput'), data.respiratory.rate != null ? data.respiratory.rate : '');
        setFieldValueSilently(document.getElementById('respTemperature'), data.respiratory.temperature != null ? data.respiratory.temperature : '');
        setFieldValueSilently(document.getElementById('respState'), data.respiratory.state != null ? data.respiratory.state : 'awake');
        setFieldValueSilently(document.getElementById('respPopulation'), data.respiratory.population != null ? data.respiratory.population : 'healthy');
      }
      if (data.circumference) {
        setFieldValueSilently(document.getElementById('headCircumference'), data.circumference.head != null ? data.circumference.head : '');
        setFieldValueSilently(document.getElementById('chestCircumference'), data.circumference.chest != null ? data.circumference.chest : '');
        setFieldValueSilently(document.getElementById('headCircumDS'), data.circumference.headDs != null ? data.circumference.headDs : '');
      }

      // Przywróć przełącznik normy ciśnienia (bpDataToggle)
      if (data.bpDataToggle != null) {
        setCheckboxValueSilently(document.getElementById('bpDataToggle'), !!data.bpDataToggle);
      }

      // Przywróć dane lekarza (isDoctor, pwzNumber)
      if (data.doctor) {
        const elDoc = document.getElementById('isDoctor');
        if (elDoc && data.doctor.isDoctor != null) {
          elDoc.checked = !!data.doctor.isDoctor;
          try {
            if (typeof elDoc.onchange === 'function') {
              elDoc.onchange(new Event('change'));
            }
          } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 36287 });
    }
  }
        }
        setFieldValueSilently(document.getElementById('pwzNumber'), data.doctor.pwzNumber != null ? data.doctor.pwzNumber : '');
      }

      // Przywróć dane leczenia bisfosfonianami
      if (data.bisphos) {
        setFieldValueSilently(document.getElementById('bisphosIndication'), data.bisphos.indication != null ? data.bisphos.indication : '');
        setFieldValueSilently(document.getElementById('bisphosDrug'), data.bisphos.drug != null ? data.bisphos.drug : '');
        setFieldValueSilently(document.getElementById('bisphosDoseNumber'), data.bisphos.doseNumber != null ? data.bisphos.doseNumber : '');
      }

      // Przywróć ustawienia modułu Z-score bez uruchamiania pełnego łańcucha change-handlerów.
      try {
        const elResults = document.getElementById('resultsModeToggle');
        if (elResults) {
          elResults.checked = resultsModeSaved;
        }
      } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 36305 });
    }
  }
      restoreApplyResultsModeRestoreState(resultsModeSaved);
      restoreApplyDataSourceRestoreState(dataSourceSaved);

      // Zaktualizuj współdzielone dane przez wspólny adapter persistence,
      // aby pola pozostały zablokowane na innych podstronach.
      syncSharedUserDataFromLoadedData(data, name);

      // Odtwórz UI z zapisanych struktur wsadowo, bez pośrednich przeliczeń po każdym polu/wierszu.
      try { if (typeof restoreRehydrateAdvancedFromState === 'function') restoreRehydrateAdvancedFromState({ skipRecalc: true, skipPairing: true }); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 36314 });
    }
  }
      try {
        if (typeof window !== 'undefined' && typeof window.vildaRehydrateBasicGrowthFromState === 'function') {
          window.vildaRehydrateBasicGrowthFromState({ skipRecalc: true });
        }
      } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 36319 });
    }
  }
      try { if (typeof restoreRehydrateIntakeFromState === 'function') restoreRehydrateIntakeFromState(data.intake ? data.intake.pal : null, { skipRecalc: true, skipPairing: true }); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 36320 });
    }
  }
    } catch (err) {
      try { console.error('restoreLoadedState error', err); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 36322 });
    }
  }
    } finally {
      try {
        if (typeof window !== 'undefined') {
          window.__vildaSuspendAdvIntakeSync = prevAdvSync;
          window.__vildaSuspendGrowthHistoryCrossSync = prevCrossSync;
          window.__vildaSuspendIntakeUserReset = prevIntakeReset;
          window.__vildaPersistRestoring = prevPersistRestoring;
        }
      } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 36331 });
    }
  }
    }

    try {
      if (typeof window !== 'undefined' && typeof window.vildaEnsureAdvancedIntakePairing === 'function') {
        window.vildaEnsureAdvancedIntakePairing();
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 36338 });
    }
  }
    try { if (typeof calculateGrowthAdvanced === 'function') calculateGrowthAdvanced(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 36339 });
    }
  }
    try {
      if (typeof window !== 'undefined' && typeof window.reconcileGrowthHistoryModules === 'function') {
        window.reconcileGrowthHistoryModules('advanced');
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 36344 });
    }
  }
    try {
      if (typeof window !== 'undefined' && typeof window.calculateBasicGrowth === 'function') {
        window.calculateBasicGrowth();
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 36349 });
    }
  }
    try { if (typeof calcEstimatedIntake === 'function') calcEstimatedIntake(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 36350 });
    }
  }
    try {
      if (typeof window !== 'undefined' && typeof window.refreshEstimatedIntakeVisibility === 'function') {
        window.refreshEstimatedIntakeVisibility({ preserveRows: true, recalcIfOpen: true });
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 36355 });
    }
  }

    /*
     * Po zakończeniu wsadowej odbudowy można ponownie dopuścić autosave dla
     * mniej kosztownych pól pomocniczych. Dzięki temu localStorage i
     * sessionStorage dostają świeży snapshot bez ponownego uruchamiania całej
     * lawiny synchronizacji wzrostowych.
     */
    try {
      if (typeof window !== 'undefined') {
        window.__vildaPersistPauseUntil = Date.now() - 1;
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 36367 });
    }
  }

    /*
     * Po przywróceniu stanu z wczytanego pliku JSON wypełnione zostają
     * pola dodatkowych modułów (ciśnienie, tętno, oddychanie, obwody oraz
     * ustawienia planu/intake). Aby karty wyników i warstwa autosave
     * zaktualizowały się bez potrzeby ingerencji użytkownika, wysyłamy do
     * tych pól zdarzenia `input` i `change`.
     */
    try {
      const fieldIds = [
        'sex',
        'heartRate',
        'hrTemperature',
        'hrPopulation',
        'bpSystolic',
        'bpDiastolic',
        'adultHeartRate',
        'adultBpSystolic',
        'adultBpDiastolic',
        'adultBpGuidelineToggle',
        'adultHrAthlete',
        'adultHrAthleteNo',
        'adultHrBetaBlocker',
        'adultHrBetaBlockerNo',
        'respiratoryRateInput',
        'respTemperature',
        'respState',
        'respPopulation',
        'headCircumference',
        'chestCircumference',
        'headCircumDS',
        'waistCm',
        'hipCm',
        'bpDataToggle',
        'intakePal',
        'palFactor',
        'dietLevel',
        'pwzNumber',
        'bisphosIndication',
        'bisphosDrug',
        'bisphosDoseNumber'
      ];
      fieldIds.forEach(function(id) {
        const el = document.getElementById(id);
        if (el) {
          try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 36413 });
    }
  }
          try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 36414 });
    }
  }
        }
      });
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 36417 });
    }
  }
    try {
      const selectedDataSource = document.querySelector('input[name="dataSource"]:checked');
      if (selectedDataSource) {
        selectedDataSource.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 36423 });
    }
  }

    // Po przywróceniu starego stanu ukryj instrukcję porównawczą w prawej kolumnie.
    try {
      if (typeof autoDisableFromStoredData === 'function') {
        autoDisableFromStoredData();
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 36430 });
    }
  }

    // Przelicz wyniki, odśwież autosave i zaktualizuj widoczność przycisków.
    try {
      if (typeof debouncedUpdate === 'function') {
        debouncedUpdate();
      } else if (typeof window.update === 'function') {
        window.update();
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 36439 });
    }
  }
    try { if (typeof updateSaveBtnVisibility === 'function') updateSaveBtnVisibility(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 36440 });
    }
  }
    try { if (typeof scheduleMainSessionSave === 'function') scheduleMainSessionSave(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 36441 });
    }
  }

    // Usuń zapamiętane dane, aby uniemożliwić ponowne przywracanie tego samego stanu
    try { window.lastLoadedData = null; } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 36444 });
    }
  }
    try { window.prevMeasurementInfo = null; } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 36445 });
    }
  }
    try { window.hasUserModifiedAfterLoad = false; } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 36446 });
    }
  }
    try {
      if (typeof window !== 'undefined' && typeof window.vildaPersistScheduleSave === 'function') {
        window.vildaPersistScheduleSave();
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 36451 });
    }
  }
    try {
      if (typeof window !== 'undefined' && typeof window.vildaPersistFlushNow === 'function') {
        setTimeout(() => {
          try { window.vildaPersistFlushNow({ force: true }); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 36455 });
    }
  }
        }, 0);
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 36458 });
    }
  }

    // Ukryj przycisk przywracania po zakończeniu
    try {
      const rb2 = document.getElementById('restoreStateBtn');
      if (rb2) {
        rb2.style.display = 'none';
        try {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('resize'));
          }
        } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 36469 });
    }
  }
      }
      // ── Dispatch dla VildaSaveStatusIndicator ──
      // "Odtwórz zapisany stan" przywraca dane pacjenta, które user widział
      // poprzednio → wskaźnik traktuje to jako SAVED (kontynuacja pracy).
      // Bez tego eventu input/change od restore wpychałyby wskaźnik w NEW_PATIENT.
      try {
        if (typeof window !== 'undefined' && typeof window.CustomEvent === 'function' && document) {
          document.dispatchEvent(new window.CustomEvent('vilda:state-restored', {
            detail: { source: 'restoreLoadedState' }
          }));
        }
      } catch (_) { /* fail-silent */ }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 36471 });
    }
  }
  }

  function initRestoreStateButton(options) {
    const opts = (options && typeof options === 'object') ? options : {};
    const restoreFn = resolveCallback(opts, 'restoreLoadedState', 'restoreLoadedState') || function defaultRestoreLoadedState() {
      return restoreLoadedState(opts);
    };
    const rb = q('restoreStateBtn');
    if (!rb || rb.__vildaRestoreStateButtonBound) return false;
    rb.__vildaRestoreStateButtonBound = true;
    rb.addEventListener('click', function onRestoreStateButtonClick(ev) {
      if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
      restoreFn();
    });
    return true;
  }



  const api = {
    __vildaDataImportExport: true,
    version: VERSION,
    q,
    num,
    val,
    getTip,
    migrateTitleToDataTip,
    syncNames,
    normalizePersistNumber,
    normalizeAgeMonthsValue,
    sanitizeAdvancedMeasurementEntries,
    sanitizeAdvancedRowsUI,
    normalizeIntakeCurrentBasics,
    intakeHistoryEntryMatchesCurrentBasics,
    sanitizeIntakeHistoryEntries,
    sanitizeIntakeRowsUI,
    setFieldValueSilently,
    setCheckboxValueSilently,
    applyResultsModeRestoreState,
    applyDataSourceRestoreState,
    withHistoryRestoreGuards,
    rehydrateAdvancedFromState,
    rehydrateAdvancedRowsUIFromState,
    rehydrateIntakeFromState,
    anyDataEntered,
    updateSaveBtnVisibility,
    maybeDisableLoadIfNeeded,
    getVildaPersistenceAdapter,
    hasMainSessionStorage,
    isMainSessionAutosavePaused,
    clearMainSessionStorage,
    saveMainSessionNow,
    scheduleMainSessionSave,
    finalizeMainSessionRestore,
    restoreMainSessionIfAny,
    hasMeaningfulMainSessionData,
    attachMainSessionClearHandler,
    initMainSessionPersistence,
    resetGrowthHistoryModulesAfterClear,
    clearAllData,
    normalizeSharedPersistRoot,
    syncSharedUserDataFromLoadedData,
    applyLoadedData,
    showRestoreButton,
    restoreLoadedState,
    initRestoreStateButton,
    getImportFileFromEvent,
    validateJsonImportFile,
    resetFileInput,
    parseJsonImportText,
    readImportFileAsText,
    handleFile,
    collectUserData,
    sanitizeFilename,
    saveUserData,
    addDisabledTooltip,
    initJsonDataImportExport,
    getFinalAudit,
    getApiSurfaceStatus,
    dumpFinalAudit,
    // P6.3 — eksport helpera FIX A/B/C. Modal „+ Nowy pomiar" w karcie pacjenta
    // klonuje payload poprzedniego snapshota i nadpisuje pola pomiaru — chcemy
    // żeby `growthBasic.data.measurements[]` był spójny z tym, co robi
    // applyLoadedData/saveUserData. Eksport pozwala wywołać tę samą logikę
    // bez powielania.
    _ensureCurrentMeasurementInHistory,
    versionInfo: () => ({ version: VERSION })
  };

  dataImportExportApiRef = api;
  global.VildaDataImportExport = api;
  global.vildaDataImportExport = api;
  global.vildaDataImportExportVersion = function vildaDataImportExportVersion() {
    return VERSION;
  };
  global.vildaDataImportExportFinalAudit = function vildaDataImportExportFinalAudit() {
    return getFinalAudit();
  };
  global.vildaDataImportExportStatus = function vildaDataImportExportStatus() {
    return getApiSurfaceStatus();
  };
  global.vildaDumpDataImportExportFinalAudit = function vildaDumpDataImportExportFinalAudit() {
    return dumpFinalAudit();
  };

  // Zachowane dotychczasowe publiczne aliasy używane przez app.js i inline listenery.
  global.syncNames = function vildaDataImportExportGlobalSyncNames(source) {
    return syncNames(source);
  };
  global.setFieldValueSilently = global.setFieldValueSilently || function vildaDataImportExportGlobalSetFieldValueSilently(el, value, options) {
    return setFieldValueSilently(el, value, options);
  };
  global.setCheckboxValueSilently = global.setCheckboxValueSilently || function vildaDataImportExportGlobalSetCheckboxValueSilently(el, checked) {
    return setCheckboxValueSilently(el, checked);
  };
  global.applyResultsModeRestoreState = global.applyResultsModeRestoreState || function vildaDataImportExportGlobalApplyResultsModeRestoreState(isProfessional, options) {
    return applyResultsModeRestoreState(isProfessional, options);
  };
  global.applyDataSourceRestoreState = global.applyDataSourceRestoreState || function vildaDataImportExportGlobalApplyDataSourceRestoreState(dataSourceValue, options) {
    return applyDataSourceRestoreState(dataSourceValue, options);
  };
  global.withHistoryRestoreGuards = global.withHistoryRestoreGuards || function vildaDataImportExportGlobalWithHistoryRestoreGuards(callback, options) {
    return withHistoryRestoreGuards(callback, options);
  };
  global.vildaRehydrateAdvancedFromState = global.vildaRehydrateAdvancedFromState || function vildaDataImportExportGlobalRehydrateAdvancedFromState(options) {
    return rehydrateAdvancedFromState(options);
  };
  global.vildaRehydrateAdvancedRowsUI = global.vildaRehydrateAdvancedRowsUI || function vildaDataImportExportGlobalRehydrateAdvancedRowsUI(rowsUI, options) {
    return rehydrateAdvancedRowsUIFromState(rowsUI, options);
  };
  global.vildaRehydrateIntakeFromState = global.vildaRehydrateIntakeFromState || function vildaDataImportExportGlobalRehydrateIntakeFromState(savedPal, options) {
    return rehydrateIntakeFromState(savedPal, options);
  };
  global.anyDataEntered = global.anyDataEntered || function vildaDataImportExportGlobalAnyDataEntered(options) {
    return anyDataEntered(options);
  };
  global.updateSaveBtnVisibility = global.updateSaveBtnVisibility || function vildaDataImportExportGlobalUpdateSaveBtnVisibility(options) {
    return updateSaveBtnVisibility(options);
  };
  global.maybeDisableLoadIfNeeded = global.maybeDisableLoadIfNeeded || function vildaDataImportExportGlobalMaybeDisableLoadIfNeeded(options) {
    return maybeDisableLoadIfNeeded(options);
  };
  global.getVildaPersistenceAdapter = global.getVildaPersistenceAdapter || function vildaDataImportExportGlobalGetPersistenceAdapter() {
    return getVildaPersistenceAdapter();
  };
  global.clearMainSessionStorage = global.clearMainSessionStorage || function vildaDataImportExportGlobalClearMainSessionStorage(options) {
    return clearMainSessionStorage(options);
  };
  global.saveMainSessionNow = global.saveMainSessionNow || function vildaDataImportExportGlobalSaveMainSessionNow(options) {
    return saveMainSessionNow(options);
  };
  global.scheduleMainSessionSave = global.scheduleMainSessionSave || function vildaDataImportExportGlobalScheduleMainSessionSave(event, options) {
    return scheduleMainSessionSave(event, options);
  };
  global.restoreMainSessionIfAny = global.restoreMainSessionIfAny || function vildaDataImportExportGlobalRestoreMainSessionIfAny(options) {
    return restoreMainSessionIfAny(options);
  };
  global.hasMeaningfulMainSessionData = global.hasMeaningfulMainSessionData || function vildaDataImportExportGlobalHasMeaningfulMainSessionData(data) {
    return hasMeaningfulMainSessionData(data);
  };
  global.resetGrowthHistoryModulesAfterClear = global.resetGrowthHistoryModulesAfterClear || function vildaDataImportExportGlobalResetGrowthHistoryModulesAfterClear(options) {
    return resetGrowthHistoryModulesAfterClear(options);
  };
  global.clearAllData = global.clearAllData || function vildaDataImportExportGlobalClearAllData(options) {
    return clearAllData(options);
  };
  global.normalizeSharedPersistRoot = global.normalizeSharedPersistRoot || function vildaDataImportExportGlobalNormalizeSharedPersistRoot(shared) {
    return normalizeSharedPersistRoot(shared);
  };
  global.syncSharedUserDataFromLoadedData = global.syncSharedUserDataFromLoadedData || function vildaDataImportExportGlobalSyncSharedUserDataFromLoadedData(data, name, options) {
    return syncSharedUserDataFromLoadedData(data, name, options);
  };
  global.showRestoreButton = global.showRestoreButton || function vildaDataImportExportGlobalShowRestoreButton(options) {
    return showRestoreButton(options);
  };
  global.restoreLoadedState = global.restoreLoadedState || function vildaDataImportExportGlobalRestoreLoadedState(options) {
    return restoreLoadedState(options);
  };
  global.initRestoreStateButton = global.initRestoreStateButton || function vildaDataImportExportGlobalInitRestoreStateButton(options) {
    return initRestoreStateButton(options);
  };
  global.handleFile = global.handleFile || function vildaDataImportExportGlobalHandleFile(event, options) {
    return handleFile(event, options);
  };
  global.applyLoadedData = global.applyLoadedData || function vildaDataImportExportGlobalApplyLoadedData(data, options) {
    return applyLoadedData(data, options);
  };
  global.collectUserData = global.collectUserData || function vildaDataImportExportGlobalCollectUserData(options) {
    return collectUserData(options);
  };
  global.saveUserData = global.saveUserData || function vildaDataImportExportGlobalSaveUserData(options) {
    return saveUserData(options);
  };
  global.sanitizeFilename = global.sanitizeFilename || function vildaDataImportExportGlobalSanitizeFilename(name) {
    return sanitizeFilename(name);
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
