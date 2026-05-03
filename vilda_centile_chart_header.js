/*
 * Vilda Centile Chart Header v1.0.0
 *
 * Krok 8O-10e: świeże imię i nazwisko w nagłówkach PDF siatek centylowych.
 * Moduł preferuje aktualne pola DOM (#advName/#basicGrowthName/#name) przed
 * potencjalnie nieświeżym window.advancedGrowthData.name. Nie generuje PDF,
 * nie renderuje DOM i nie zmienia obliczeń wzrostowych.
 */
(function (global) {
  'use strict';

  if (!global) return;
  if (global.VildaCentileChartHeader && global.VildaCentileChartHeader.__vildaCentileChartHeaderModule) {
    return;
  }

  const VERSION = '1.0.0';
  const STEP = '8O-10e';
  const INPUT_IDS = Object.freeze(['advName', 'basicGrowthName', 'name']);
  const editState = {
    lastEditedId: '',
    lastEditedValue: '',
    lastEditedAt: 0,
    listenersInstalled: false,
    listenerDocumentReadyState: '',
    boundIds: Object.create(null)
  };

  function now() {
    try { return Date.now(); } catch (_) { return 0; }
  }

  function normalizeName(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/\s+/g, ' ').trim();
  }

  function clonePlain(value, depth) {
    const maxDepth = typeof depth === 'number' ? depth : 5;
    if (maxDepth <= 0 || value == null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(function (item) { return clonePlain(item, maxDepth - 1); });
    const out = {};
    Object.keys(value).forEach(function (key) {
      const v = value[key];
      out[key] = (typeof v === 'function') ? '[function]' : clonePlain(v, maxDepth - 1);
    });
    return out;
  }

  function getDocument(options) {
    return (options && options.document) || global.document || null;
  }

  function readInput(id, doc) {
    const documentRef = doc || global.document || null;
    let el = null;
    try {
      el = documentRef && typeof documentRef.getElementById === 'function'
        ? documentRef.getElementById(id)
        : null;
    } catch (_) {
      el = null;
    }
    const raw = el && typeof el.value !== 'undefined' ? el.value : '';
    const value = normalizeName(raw);
    return {
      id,
      present: !!el,
      raw: raw == null ? '' : String(raw),
      value,
      nonEmpty: value.length > 0,
      disabled: !!(el && el.disabled)
    };
  }

  function readAllInputs(doc) {
    const out = {};
    INPUT_IDS.forEach(function (id) {
      out[id] = readInput(id, doc);
    });
    return out;
  }

  function getEffectiveDataState(options) {
    const opts = options || {};
    if (Object.prototype.hasOwnProperty.call(opts, 'effectiveDataState')) {
      return (opts.effectiveDataState && typeof opts.effectiveDataState === 'object') ? opts.effectiveDataState : null;
    }
    if (typeof opts.getEffectiveDataState === 'function') {
      try {
        const state = opts.getEffectiveDataState();
        return (state && typeof state === 'object') ? state : null;
      } catch (_) {
        return null;
      }
    }
    if (typeof global.getEffectiveCentileGrowthDataState === 'function') {
      try {
        const state = global.getEffectiveCentileGrowthDataState();
        return (state && typeof state === 'object') ? state : null;
      } catch (_) {
        return null;
      }
    }
    const adv = global.advancedGrowthData;
    return (adv && typeof adv === 'object') ? adv : null;
  }

  function getAdvancedGrowthData(options) {
    const opts = options || {};
    if (Object.prototype.hasOwnProperty.call(opts, 'advancedGrowthData')) {
      return (opts.advancedGrowthData && typeof opts.advancedGrowthData === 'object') ? opts.advancedGrowthData : null;
    }
    return (global.advancedGrowthData && typeof global.advancedGrowthData === 'object') ? global.advancedGrowthData : null;
  }

  function markNameInputEdit(id, value) {
    if (INPUT_IDS.indexOf(id) === -1) return null;
    const normalized = normalizeName(value);
    editState.lastEditedId = id;
    editState.lastEditedValue = normalized;
    editState.lastEditedAt = now();
    return getLastEditedNameInputState();
  }

  function getLastEditedNameInputState() {
    return {
      id: editState.lastEditedId || '',
      value: editState.lastEditedValue || '',
      at: editState.lastEditedAt || 0
    };
  }

  function installInputListeners(documentRef) {
    const doc = documentRef || global.document || null;
    if (!doc || typeof doc.getElementById !== 'function') {
      return { ok: false, reason: 'missing-document' };
    }

    function bindNow() {
      INPUT_IDS.forEach(function (id) {
        let el = null;
        try { el = doc.getElementById(id); } catch (_) { el = null; }
        if (!el || typeof el.addEventListener !== 'function') return;
        if (el.__vildaCentileChartHeaderNameBound) {
          editState.boundIds[id] = true;
          return;
        }
        const handler = function (event) {
          const target = event && event.target ? event.target : el;
          markNameInputEdit(id, target && typeof target.value !== 'undefined' ? target.value : '');
        };
        try {
          el.addEventListener('input', handler);
          el.addEventListener('change', handler);
          el.__vildaCentileChartHeaderNameBound = true;
          editState.boundIds[id] = true;
        } catch (_) {}
      });
      editState.listenersInstalled = true;
      editState.listenerDocumentReadyState = doc.readyState || '';
      return true;
    }

    if (doc.readyState === 'loading' && typeof doc.addEventListener === 'function') {
      try {
        doc.addEventListener('DOMContentLoaded', bindNow, { once: true });
        editState.listenersInstalled = true;
        editState.listenerDocumentReadyState = 'loading';
        return { ok: true, deferred: true };
      } catch (_) {
        bindNow();
      }
    } else {
      bindNow();
    }
    return { ok: true, deferred: false, boundIds: Object.keys(editState.boundIds) };
  }

  function inputOrderForSource(sourceModule) {
    return sourceModule === 'basicGrowth'
      ? ['basicGrowthName', 'advName', 'name']
      : ['advName', 'name', 'basicGrowthName'];
  }

  function pickDomName(inputs, sourceModule, options) {
    const opts = options || {};
    const explicitLastId = typeof opts.lastEditedId === 'string' ? opts.lastEditedId : '';
    const lastId = explicitLastId || editState.lastEditedId || '';
    if (INPUT_IDS.indexOf(lastId) !== -1 && inputs[lastId] && inputs[lastId].nonEmpty) {
      return {
        value: inputs[lastId].value,
        source: lastId + '-last-input',
        inputId: lastId,
        viaLastEdited: true
      };
    }

    const explicitOrder = Array.isArray(opts.inputPriority)
      ? opts.inputPriority.filter(function (id) { return INPUT_IDS.indexOf(id) !== -1; })
      : [];
    const order = explicitOrder.length ? explicitOrder : inputOrderForSource(sourceModule);
    for (let i = 0; i < order.length; i += 1) {
      const id = order[i];
      if (inputs[id] && inputs[id].nonEmpty) {
        return {
          value: inputs[id].value,
          source: id + '-dom',
          inputId: id,
          viaLastEdited: false
        };
      }
    }
    return { value: '', source: '', inputId: '', viaLastEdited: false };
  }

  function buildHeaderNameState(options) {
    const opts = options || {};
    const doc = getDocument(opts);
    const effectiveDataState = getEffectiveDataState(opts) || {};
    const advancedGrowthData = getAdvancedGrowthData(opts) || {};
    const sourceModule = normalizeName(effectiveDataState.sourceModule || advancedGrowthData.sourceModule || '');
    const inputs = readAllInputs(doc);
    const domPick = pickDomName(inputs, sourceModule, opts);
    const effectiveStateName = normalizeName(effectiveDataState.name);
    const advancedGrowthDataName = normalizeName(advancedGrowthData.name);
    const fallbackPick = effectiveStateName
      ? { value: effectiveStateName, source: 'effective-growth-state-name' }
      : (advancedGrowthDataName ? { value: advancedGrowthDataName, source: 'advancedGrowthData-name-fallback' } : { value: '', source: '' });
    const name = domPick.value || fallbackPick.value || '';
    const nameSource = domPick.value ? domPick.source : fallbackPick.source;
    const staleAdvancedGrowthNameDetected = !!(advancedGrowthDataName && domPick.value && advancedGrowthDataName !== domPick.value);
    const staleEffectiveStateNameDetected = !!(effectiveStateName && domPick.value && effectiveStateName !== domPick.value);

    return {
      step: STEP,
      version: VERSION,
      readOnly: true,
      name,
      nameSource,
      sourceModule,
      isBasicGrowth: sourceModule === 'basicGrowth',
      preferredFreshDom: true,
      domInputsBeforeAdvancedGrowthData: true,
      currentDomName: domPick.value,
      currentDomSource: domPick.source,
      currentDomInputId: domPick.inputId,
      usedLastEditedInput: domPick.viaLastEdited === true,
      effectiveStateName,
      advancedGrowthDataName,
      staleAdvancedGrowthNameDetected,
      staleEffectiveStateNameDetected,
      inputs: {
        advName: clonePlain(inputs.advName, 2),
        basicGrowthName: clonePlain(inputs.basicGrowthName, 2),
        name: clonePlain(inputs.name, 2)
      },
      lastEditedInput: getLastEditedNameInputState(),
      policy: {
        lastEditedInputWins: true,
        domInputsBeforeAdvancedGrowthDataName: true,
        advancedGrowthDataNameFallbackOnly: true,
        doesNotMutateAdvancedGrowthData: true,
        doesNotGeneratePdf: true
      }
    };
  }

  function buildNameLabel(options) {
    const opts = options || {};
    const publication = !!opts.publication;
    const showPlaceholder = opts.showPlaceholder !== false;
    const prefix = publication ? 'Patient' : 'Imię i nazwisko';
    const state = buildHeaderNameState(opts);
    if (state.name) return prefix + ': ' + state.name;
    return showPlaceholder ? prefix + ': _________________________________' : '';
  }

  function getSnapshot(options) {
    const opts = options || {};
    const header = buildHeaderNameState(opts);
    return {
      step: STEP,
      version: VERSION,
      kind: 'centile-chart-header-name-snapshot',
      readOnly: true,
      executedPdfGeneration: false,
      renderedDom: false,
      committedAdvancedGrowthData: false,
      header,
      api: getApiSurfaceStatus(),
      timestamp: now()
    };
  }

  function getApiSurfaceStatus() {
    return {
      step: STEP,
      version: VERSION,
      module: true,
      buildHeaderNameState: typeof buildHeaderNameState === 'function',
      buildNameLabel: typeof buildNameLabel === 'function',
      getSnapshot: typeof getSnapshot === 'function',
      markNameInputEdit: typeof markNameInputEdit === 'function',
      installInputListeners: typeof installInputListeners === 'function',
      listenersInstalled: editState.listenersInstalled === true,
      boundIds: Object.keys(editState.boundIds),
      lastEditedInput: getLastEditedNameInputState()
    };
  }

  const api = {
    __vildaCentileChartHeaderModule: true,
    VERSION,
    version: VERSION,
    STEP,
    normalizeName,
    readInput,
    buildHeaderNameState,
    buildNameLabel,
    getSnapshot,
    getApiSurfaceStatus,
    markNameInputEdit,
    getLastEditedNameInputState,
    installInputListeners
  };

  global.VildaCentileChartHeader = api;
  global.vildaGetCentileChartHeaderNameSnapshot = function (options) { return api.getSnapshot(options || {}); };
  global.vildaGetCentileChartHeaderNameState = function (options) { return api.buildHeaderNameState(options || {}); };
  global.vildaBuildCentileChartNameLabel = function (options) { return api.buildNameLabel(options || {}); };
  if (typeof global.getCentileChartHeaderNameState !== 'function') {
    global.getCentileChartHeaderNameState = global.vildaGetCentileChartHeaderNameState;
  }
  if (typeof global.buildCentileChartNameLabel !== 'function') {
    global.buildCentileChartNameLabel = global.vildaBuildCentileChartNameLabel;
  }

  installInputListeners();
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
