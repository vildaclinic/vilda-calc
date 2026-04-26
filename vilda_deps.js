/*
 * Vilda Dependencies Helper v1.3.0
 *
 * Lekka warstwa diagnostyczna dla zależności ładowanych globalnie przez <script>.
 * Nie ładuje bibliotek dynamicznie; tylko bezpiecznie sprawdza ich obecność,
 * zwraca zależność albo fallback i emituje pojedyncze ostrzeżenia diagnostyczne.
 *
 * Od v1.1 zawiera jawny kontrakt zależności krytycznych dla eksportów,
 * wykresów i danych wzrastania. Od v1.2 zawiera wspólną warstwę
 * komunikatów fallback dla brakujących zależności.
 */
(function (global) {
  'use strict';

  if (!global) return;
  if (global.VildaDeps && global.VildaDeps.__vildaDepsHelper) {
    return;
  }

  const VERSION = '1.3.1';
  const MAX_EVENTS = 300;
  const MAX_CHECKS = 120;
  const MAX_NOTICES = 120;
  const missingEvents = [];
  const contractCheckEvents = [];
  const noticeEvents = [];
  const lastNoticeByKey = Object.create(null);
  const warned = Object.create(null);
  const moduleContracts = Object.create(null);
  const loadOrderRules = [];
  let debugEnabled = false;

  const DEPENDENCY_LABELS = {
    'jspdf.jsPDF': 'jsPDF',
    'html2canvas': 'html2canvas',
    'XLSX': 'SheetJS XLSX',
    'docx': 'docx.js',
    'docx.Packer': 'docx.Packer',
    'pdfMake': 'pdfMake',
    'pdfMake.createPdf': 'pdfMake.createPdf',
    'pdfMake.vfs': 'pdfMake.vfs',
    'Chart': 'Chart.js',
    'centileData': 'dane centylowe',
    'generateCentileChart': 'generator siatek centylowych',
    'generatePalczewskaCentileCharts': 'generator siatek Palczewskiej',
    'getCentileChartState': 'stan siatek centylowych',
    'buildCentilePageCanvas': 'render siatek centylowych',
    'getEffectiveCentileGrowthDataState': 'dane wzrastania dla siatek',
    'collectAllAgesMonths': 'kolektor wieku dla siatek',
    'bayleyPinneauData': 'dane Bayley-Pinneau',
    'rwtData': 'dane RWT',
    'reinehrCdgpData': 'dane Reinehr/CDGP',
    'advGrowthCalculateReinehrCdgpPrediction': 'predykcja Reinehr/CDGP',
    'advGrowthCollectHistoricalPointsForReport': 'historia wzrastania do raportu',
    'generateAdvancedGrowthPdfReport': 'generator raportu wzrastania',
    'advGrowthBuildReportRows': 'wiersze raportu wzrastania',
    'advGrowthBuildHtmlReportMarkup': 'HTML raportu wzrastania',
    'SGA_INTERGROWTH_ZS': 'dane SGA Intergrowth',
    'SGA_MALEWSKI_WEIGHT': 'dane SGA Malewski',
    'DS': 'dane LMS dla zespołu Downa'
  };

  const MODULE_LABELS = {
    'main-bmi-metabolism-pdf': 'raport BMI/metabolizmu',
    'diet-recommendations-pdf': 'raport zaleceń dietetycznych PDF',
    'patient-report-pdf': 'raport pacjenta PDF',
    'patient-report-visit-pages': 'dodatkowe strony raportu po wizycie',
    'patient-report-selected-pdf': 'wybrane strony raportu pacjenta',
    'patient-report-centile-chart': 'wykresy centylowe w raporcie',
    'patient-report-advanced-growth': 'sekcja zaawansowanego wzrastania w raporcie',
    'advanced-growth-pdf': 'raport zaawansowanego wzrastania PDF',
    'advanced-growth-bayley-pinneau': 'predykcja Bayley-Pinneau',
    'advanced-growth-rwt': 'predykcja Roche-Wainer-Thissen',
    'advanced-growth-reinehr': 'predykcja Reinehr/CDGP',
    'growth-basic-module-chart': 'podstawowy wykres wzrastania',
    'circumference-module-pdf': 'PDF siatki obwodów',
    'zscore-batch-xlsx': 'wsadowy import/eksport Z-score XLSX',
    'clcr-pdf-export': 'PDF kalkulatora klirensu',
    'clcr-norms-xlsx': 'normy XLSX kalkulatora klirensu',
    'clcr-docx-export': 'DOCX kalkulatora klirensu',
    'diabetes-pdfmake-export': 'eksport PDF modułów cukrzycowych',
    'steroids-hpta-chart': 'wykres HPTA',
    'sga-birth-module-data': 'dane modułu SGA',
    'down-syndrome-lms-data': 'siatki LMS dla zespołu Downa',
    'palczewska-centile-reference': 'referencja centylowa Palczewskiej'
  };

  const MODULE_FALLBACK_MESSAGES = {
    'main-bmi-metabolism-pdf': 'Nie można wygenerować raportu BMI/metabolizmu, bo brakuje wymaganej biblioteki PDF.',
    'diet-recommendations-pdf': 'Nie można wygenerować raportu zaleceń dietetycznych PDF, bo brakuje wymaganych bibliotek.',
    'patient-report-pdf': 'Nie można wygenerować raportu pacjenta PDF, bo brakuje wymaganych bibliotek.',
    'patient-report-visit-pages': 'Nie można dodać stron raportu po wizycie, bo brakuje wymaganych bibliotek.',
    'patient-report-selected-pdf': 'Nie można wygenerować wybranych stron raportu, bo brakuje wymaganej biblioteki PDF.',
    'patient-report-centile-chart': 'Nie można wygenerować wykresów centylowych, bo brakuje danych albo generatora wykresu.',
    'patient-report-advanced-growth': 'Nie można dodać sekcji zaawansowanego wzrastania, bo brakuje wymaganych funkcji.',
    'advanced-growth-pdf': 'Nie można wygenerować raportu wzrastania PDF, bo brakuje wymaganych bibliotek.',
    'growth-basic-module-chart': 'Generator siatek centylowych nie jest gotowy.',
    'circumference-module-pdf': 'Nie można wygenerować PDF siatki obwodów, bo brakuje wymaganej biblioteki PDF.',
    'zscore-batch-xlsx': 'Nie można przetworzyć pliku XLSX, bo brakuje biblioteki SheetJS.',
    'clcr-pdf-export': 'Nie można wygenerować PDF kalkulatora klirensu, bo brakuje wymaganych bibliotek.',
    'clcr-norms-xlsx': 'Nie można odczytać norm XLSX kalkulatora klirensu, bo brakuje biblioteki SheetJS.',
    'clcr-docx-export': 'Nie można wygenerować DOCX kalkulatora klirensu, bo brakuje wymaganej biblioteki.',
    'diabetes-pdfmake-export': 'Nie można wygenerować PDF modułów cukrzycowych, bo brakuje biblioteki pdfMake.',
    'steroids-hpta-chart': 'Nie można narysować wykresu HPTA, bo brakuje Chart.js.',
    'sga-birth-module-data': 'Nie można obliczyć modułu SGA, bo brakuje danych referencyjnych.',
    'down-syndrome-lms-data': 'Nie można użyć siatek dla zespołu Downa, bo brakuje danych LMS.'
  };


  function now() {
    try { return Date.now(); } catch (_) { return 0; }
  }

  function normalizePath(path) {
    return String(path || '').trim();
  }

  function normalizeModuleName(moduleName) {
    const text = String(moduleName || '').trim();
    return text || 'unknown-module';
  }

  function splitPath(path) {
    const normalized = normalizePath(path);
    if (!normalized) return [];
    return normalized.split('.').map(function (part) { return part.trim(); }).filter(Boolean);
  }

  function shouldLog(options) {
    const opts = options || {};
    if (opts.silent) return false;
    if (debugEnabled) return true;
    try {
      if (global.__VILDA_DEBUG === true) return true;
      if (global.localStorage && global.localStorage.getItem('vildaDebug') === '1') return true;
      return /(?:^|[?&])vildaDebug=1(?:&|$)/.test(global.location && global.location.search ? global.location.search : '');
    } catch (_) {
      return false;
    }
  }

  function logDependencyEvent(level, moduleName, message, error, meta, options) {
    const opts = options || {};
    if (opts.log === false || opts.silent === true) return null;
    try {
      const logger = global.VildaLogger || global.vildaLogger || null;
      if (!logger || typeof logger.log !== 'function') return null;
      return logger.log(level || 'warn', moduleName || 'vilda-deps', message || 'Zdarzenie zależności globalnych', error || null, Object.assign({
        helper: 'VildaDeps'
      }, meta || {}), { dedupeMs: opts.logDedupeMs || 4500 });
    } catch (_) {
      return null;
    }
  }

  function resolve(path, root) {
    const parts = splitPath(path);
    if (!parts.length) return undefined;
    let cursor = root || global;
    for (let i = 0; i < parts.length; i += 1) {
      if (cursor == null) return undefined;
      try {
        cursor = cursor[parts[i]];
      } catch (_) {
        return undefined;
      }
    }
    return cursor;
  }

  function inferType(value) {
    if (typeof value === 'undefined') return 'undefined';
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  }

  function typeMatches(value, expectedType) {
    if (!expectedType || expectedType === 'any') return typeof value !== 'undefined';
    if (expectedType === 'function') return typeof value === 'function';
    if (expectedType === 'object') return !!value && typeof value === 'object';
    if (expectedType === 'array') return Array.isArray(value);
    if (expectedType === 'number') return typeof value === 'number' && Number.isFinite(value);
    return typeof value === expectedType;
  }

  function cloneEvent(event) {
    return Object.assign({}, event || {});
  }

  function shallowClone(value) {
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.slice();
    return Object.assign({}, value);
  }

  function normalizeStringList(value) {
    if (Array.isArray(value)) {
      return value.map(function (item) { return normalizePath(item); }).filter(Boolean);
    }
    const single = normalizePath(value);
    return single ? [single] : [];
  }

  function trimEventList(list, max) {
    if (list.length > max) {
      list.splice(0, list.length - max);
    }
  }

  function recordMissing(path, options, actualType) {
    const opts = options || {};
    const name = normalizePath(path);
    const moduleName = normalizeModuleName(opts.moduleName || opts.module || opts.context);
    const expectedType = opts.type || 'any';
    const key = moduleName + '::' + name + '::' + expectedType;
    const event = {
      kind: opts.kind || 'dependency-missing',
      name,
      moduleName,
      expectedType,
      actualType: actualType || 'undefined',
      required: opts.required !== false,
      critical: opts.critical !== false,
      contract: opts.contract === true,
      message: opts.message || ('Brak wymaganej zależności globalnej: ' + name),
      timestamp: now()
    };

    if (opts.description) event.description = opts.description;
    if (opts.source) event.source = opts.source;
    if (opts.page) event.page = opts.page;

    missingEvents.push(event);
    trimEventList(missingEvents, MAX_EVENTS);

    if (!warned[key]) {
      warned[key] = true;
      logDependencyEvent(event.critical ? 'error' : 'warn', moduleName, event.message, null, {
        dependency: name,
        expectedType,
        actualType: event.actualType,
        required: event.required,
        critical: event.critical,
        source: event.source || '',
        page: event.page || ''
      }, opts);
      try {
        if (typeof global.CustomEvent === 'function' && typeof global.dispatchEvent === 'function') {
          global.dispatchEvent(new CustomEvent('vilda:dependency-missing', { detail: cloneEvent(event) }));
        }
      } catch (_) {
    void _;
  }

      if (shouldLog(opts) && global.console && typeof global.console.warn === 'function') {
        try {
          global.console.warn('[VildaDeps] ' + event.message + ' [' + moduleName + ']', {
            name,
            expectedType,
            actualType: event.actualType,
            required: event.required,
            source: event.source || null
          });
        } catch (_) {
    void _;
  }
      }
    }

    return event;
  }

  function requireDependency(path, options) {
    const opts = options || {};
    const name = normalizePath(path);
    const expectedType = opts.type || 'any';
    const value = resolve(name, opts.root || global);

    if (typeMatches(value, expectedType)) return value;

    recordMissing(name, Object.assign({}, opts, { type: expectedType }), inferType(value));

    if (typeof opts.onMissing === 'function') {
      try { opts.onMissing(name, opts); } catch (_) {
    void _;
  }
    }
    return Object.prototype.hasOwnProperty.call(opts, 'fallback') ? opts.fallback : null;
  }

  function requireFunction(path, options) {
    return requireDependency(path, Object.assign({}, options || {}, { type: 'function' }));
  }

  function requireObject(path, options) {
    return requireDependency(path, Object.assign({}, options || {}, { type: 'object' }));
  }

  function requireAny(paths, options) {
    const list = Array.isArray(paths) ? paths : [paths];
    const opts = options || {};
    for (let i = 0; i < list.length; i += 1) {
      const name = normalizePath(list[i]);
      const value = resolve(name, opts.root || global);
      if (typeMatches(value, opts.type || 'any')) return value;
    }
    recordMissing(list.map(normalizePath).filter(Boolean).join(' | '), opts, 'undefined');
    return Object.prototype.hasOwnProperty.call(opts, 'fallback') ? opts.fallback : null;
  }

  function has(path, expectedType) {
    return typeMatches(resolve(path), expectedType || 'any');
  }

  function isFunction(path) {
    return has(path, 'function');
  }

  function isObject(path) {
    return has(path, 'object');
  }

  function warnMissing(path, moduleName, details) {
    return recordMissing(path, Object.assign({}, details || {}, { moduleName: moduleName || (details && details.moduleName) }), details && details.actualType);
  }

  function normalizeDependencySpec(spec, defaults) {
    const base = defaults || {};
    if (typeof spec === 'string') {
      return {
        name: spec,
        path: spec,
        type: base.type || 'any',
        required: base.required !== false,
        critical: base.critical !== false,
        source: base.source || '',
        script: base.script || '',
        description: base.description || ''
      };
    }
    const obj = spec && typeof spec === 'object' ? spec : {};
    const path = normalizePath(obj.path || obj.name);
    return {
      name: normalizePath(obj.name || path),
      path,
      type: obj.type || base.type || 'any',
      required: obj.required !== false && base.required !== false,
      critical: obj.critical !== false && base.critical !== false,
      source: obj.source || base.source || '',
      script: obj.script || base.script || '',
      description: obj.description || base.description || '',
      group: obj.group || base.group || ''
    };
  }

  function cloneDependency(dep) {
    return shallowClone(dep);
  }

  function cloneContract(contract) {
    if (!contract) return null;
    return {
      moduleName: contract.moduleName,
      description: contract.description,
      critical: contract.critical !== false,
      pages: contract.pages.slice(),
      tags: contract.tags.slice(),
      script: contract.script || '',
      loadAfter: contract.loadAfter.slice(),
      dependencies: contract.dependencies.map(cloneDependency),
      definedAt: contract.definedAt
    };
  }

  function defineModuleDeps(moduleName, dependencies, options) {
    const name = normalizeModuleName(moduleName);
    const opts = options || {};
    const list = Array.isArray(dependencies) ? dependencies : [];
    const normalized = list.map(function (dep) { return normalizeDependencySpec(dep, opts.defaults); }).filter(function (dep) { return !!dep.path; });
    const previous = moduleContracts[name];
    const shouldMerge = opts.merge === true && previous;
    const contract = {
      moduleName: name,
      description: opts.description || (previous && previous.description) || '',
      critical: opts.critical !== false,
      pages: normalizeStringList(opts.pages || opts.page || (previous && previous.pages)),
      tags: normalizeStringList(opts.tags || opts.tag || (previous && previous.tags)),
      script: normalizePath(opts.script || (previous && previous.script)),
      loadAfter: normalizeStringList(opts.loadAfter || opts.afterScripts || (previous && previous.loadAfter)),
      dependencies: shouldMerge ? previous.dependencies.concat(normalized) : normalized,
      definedAt: now()
    };
    moduleContracts[name] = contract;
    return cloneContract(contract);
  }

  function defineModuleDependencies(moduleName, dependencies, options) {
    return defineModuleDeps(moduleName, dependencies, options);
  }

  function defineLoadOrderRule(name, source, target, options) {
    const opts = options || {};
    const rule = {
      name: normalizePath(name) || (normalizePath(source) + '-before-' + normalizePath(target)),
      source: normalizePath(source || opts.source),
      target: normalizePath(target || opts.target),
      required: opts.required !== false,
      critical: opts.critical !== false,
      description: opts.description || '',
      pages: normalizeStringList(opts.pages || opts.page),
      definedAt: now()
    };
    if (!rule.source || !rule.target) return null;
    const existingIndex = loadOrderRules.findIndex(function (item) { return item.name === rule.name; });
    if (existingIndex >= 0) {
      loadOrderRules[existingIndex] = rule;
    } else {
      loadOrderRules.push(rule);
    }
    return shallowClone(rule);
  }

  function getLoadOrderRules() {
    return loadOrderRules.map(shallowClone);
  }

  function listModuleDeps() {
    return listModules().map(function (name) { return getModuleDeps(name); });
  }

  function getModuleDeps(moduleName) {
    const contract = moduleContracts[normalizeModuleName(moduleName)];
    return cloneContract(contract);
  }

  function listModules() {
    return Object.keys(moduleContracts).sort();
  }

  function getModuleContracts() {
    const out = {};
    listModules().forEach(function (name) {
      out[name] = cloneContract(moduleContracts[name]);
    });
    return out;
  }

  function currentPageKey() {
    try {
      const pathname = (global.location && global.location.pathname) ? global.location.pathname : '';
      if (!pathname || pathname === '/') return 'index.html';
      const trimmed = pathname.replace(/\/+$|^\/+/, '');
      const parts = trimmed.split('/').filter(Boolean);
      return parts.length ? parts[parts.length - 1] : 'index.html';
    } catch (_) {
      return 'index.html';
    }
  }

  function normalizePageName(page) {
    const text = normalizePath(page);
    if (!text || text === '/') return 'index.html';
    const trimmed = text.replace(/\/+$|^\/+/, '');
    const parts = trimmed.split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : text;
  }

  function contractAppliesToPage(contract, page) {
    if (!contract) return false;
    const pages = contract.pages || [];
    if (!pages.length) return true;
    const pageKey = normalizePageName(page || currentPageKey());
    return pages.some(function (entry) {
      const normalized = normalizePageName(entry);
      return normalized === '*' || normalized === 'all' || normalized === pageKey;
    });
  }

  function checkOneDependency(dep, moduleName, options) {
    const opts = options || {};
    const value = resolve(dep.path, opts.root || global);
    const ok = typeMatches(value, dep.type || 'any');
    const required = dep.required !== false;
    const result = {
      name: dep.name || dep.path,
      path: dep.path,
      type: dep.type || 'any',
      actualType: inferType(value),
      ok,
      required,
      critical: dep.critical !== false,
      source: dep.source || '',
      script: dep.script || '',
      description: dep.description || ''
    };

    if (!ok && (opts.record !== false)) {
      recordMissing(dep.path, {
        moduleName,
        type: dep.type || 'any',
        required,
        critical: dep.critical !== false,
        contract: true,
        silent: opts.silent === true,
        source: dep.source,
        description: dep.description,
        page: opts.page || currentPageKey(),
        message: (required ? 'Brak wymaganej zależności modułu' : 'Brak opcjonalnej zależności modułu') + ': ' + dep.path
      }, result.actualType);
    }

    return result;
  }

  function summarizeDependencyResults(results) {
    const missingRequired = results.filter(function (item) { return !item.ok && item.required; });
    const missingOptional = results.filter(function (item) { return !item.ok && !item.required; });
    return {
      ok: missingRequired.length === 0,
      missingRequired,
      missingOptional,
      available: results.filter(function (item) { return item.ok; })
    };
  }

  function recordContractCheck(result) {
    contractCheckEvents.push({
      kind: 'module-deps-check',
      moduleName: result.moduleName,
      ok: result.ok,
      missingRequiredCount: result.missingRequired.length,
      missingOptionalCount: result.missingOptional.length,
      page: result.page,
      timestamp: result.timestamp
    });
    trimEventList(contractCheckEvents, MAX_CHECKS);
  }

  function checkModuleDeps(moduleName, options) {
    const name = normalizeModuleName(moduleName);
    const contract = moduleContracts[name];
    const opts = options || {};
    const timestamp = now();
    if (!contract) {
      const resultMissingContract = {
        moduleName: name,
        ok: false,
        page: opts.page || currentPageKey(),
        timestamp,
        contractFound: false,
        dependencies: [],
        missingRequired: [],
        missingOptional: [],
        message: 'Brak kontraktu zależności dla modułu: ' + name
      };
      if (opts.record !== false) {
        recordMissing(name, {
          moduleName: 'vilda-deps-contracts',
          type: 'contract',
          required: true,
          contract: true,
          silent: opts.silent === true,
          message: resultMissingContract.message,
          page: opts.page || currentPageKey()
        }, 'undefined');
      }
      return resultMissingContract;
    }

    const dependencies = contract.dependencies.map(function (dep) {
      return checkOneDependency(dep, name, opts);
    });
    const summary = summarizeDependencyResults(dependencies);
    const result = {
      moduleName: name,
      ok: summary.ok,
      page: opts.page || currentPageKey(),
      timestamp,
      contractFound: true,
      description: contract.description,
      critical: contract.critical !== false,
      dependencies,
      missingRequired: summary.missingRequired,
      missingOptional: summary.missingOptional,
      available: summary.available
    };
    if (opts.store !== false) recordContractCheck(result);
    return result;
  }

  function collectContractsForCheck(options) {
    const opts = options || {};
    const page = opts.page || currentPageKey();
    let names = [];
    if (Array.isArray(opts.modules) && opts.modules.length) {
      names = opts.modules.map(normalizeModuleName);
    } else {
      names = listModules().filter(function (name) {
        const contract = moduleContracts[name];
        if (!contract) return false;
        if (opts.criticalOnly !== false && contract.critical === false) return false;
        if (opts.scope === 'all') return true;
        return contractAppliesToPage(contract, page);
      });
    }
    return names;
  }

  function checkCriticalDependencies(options) {
    const opts = options || {};
    const page = opts.page || currentPageKey();
    const moduleNames = collectContractsForCheck(Object.assign({}, opts, { page }));
    const modules = moduleNames.map(function (name) {
      return checkModuleDeps(name, Object.assign({}, opts, { page }));
    });
    const missingRequired = [];
    const missingOptional = [];
    modules.forEach(function (mod) {
      (mod.missingRequired || []).forEach(function (dep) {
        missingRequired.push(Object.assign({ moduleName: mod.moduleName }, dep));
      });
      (mod.missingOptional || []).forEach(function (dep) {
        missingOptional.push(Object.assign({ moduleName: mod.moduleName }, dep));
      });
    });
    return {
      version: VERSION,
      ok: missingRequired.length === 0,
      page,
      scope: opts.scope === 'all' ? 'all' : 'current-page',
      moduleCount: modules.length,
      modules,
      missingRequired,
      missingOptional,
      timestamp: now()
    };
  }

  function getScriptInventory() {
    const doc = global.document;
    if (!doc || typeof doc.getElementsByTagName !== 'function') return [];
    let scripts = [];
    try {
      scripts = Array.prototype.slice.call(doc.getElementsByTagName('script') || []);
    } catch (_) {
      scripts = [];
    }
    return scripts.map(function (script, index) {
      const rawSrc = script && script.getAttribute ? (script.getAttribute('src') || '') : (script && script.src ? script.src : '');
      let pathname = '';
      let file = '';
      try {
        const url = rawSrc ? new URL(rawSrc, global.location && global.location.href ? global.location.href : 'https://local.invalid/') : null;
        pathname = url ? url.pathname : '';
        file = pathname.split('/').filter(Boolean).pop() || '';
      } catch (_) {
        pathname = rawSrc || '';
        file = String(pathname || '').split('/').filter(Boolean).pop() || '';
      }
      return {
        index,
        src: rawSrc,
        pathname,
        file,
        async: !!(script && script.async),
        defer: !!(script && script.defer),
        type: script && script.type ? script.type : '',
        inline: !rawSrc
      };
    });
  }

  function scriptMatches(script, token) {
    const needle = normalizePath(token);
    if (!needle || !script) return false;
    return String(script.src || '').indexOf(needle) !== -1 ||
      String(script.pathname || '').indexOf(needle) !== -1 ||
      String(script.file || '').indexOf(needle) !== -1;
  }

  function findScriptIndex(token, inventory) {
    const scripts = inventory || getScriptInventory();
    for (let i = 0; i < scripts.length; i += 1) {
      if (scriptMatches(scripts[i], token)) return scripts[i].index;
    }
    return -1;
  }

  function ruleAppliesToPage(rule, page) {
    if (!rule || !rule.pages || !rule.pages.length) return true;
    const pageKey = normalizePageName(page || currentPageKey());
    return rule.pages.some(function (entry) {
      const normalized = normalizePageName(entry);
      return normalized === '*' || normalized === 'all' || normalized === pageKey;
    });
  }

  function checkLoadOrderRule(rule, inventory, page) {
    const sourceIndex = findScriptIndex(rule.source, inventory);
    const targetIndex = findScriptIndex(rule.target, inventory);
    const required = rule.required !== false;
    let ok = true;
    let reason = 'order-ok';

    if (sourceIndex < 0 || targetIndex < 0) {
      ok = !required;
      reason = sourceIndex < 0 && targetIndex < 0 ? 'source-and-target-not-found' :
        (sourceIndex < 0 ? 'source-not-found' : 'target-not-found');
    } else if (sourceIndex > targetIndex) {
      ok = false;
      reason = 'source-after-target';
    }

    return {
      kind: 'load-order-rule',
      ruleName: rule.name,
      ok,
      reason,
      sourceScript: rule.source,
      targetScript: rule.target,
      sourceIndex,
      targetIndex,
      required,
      critical: rule.critical !== false,
      description: rule.description || '',
      page: page || currentPageKey()
    };
  }

  function checkScriptOrder(options) {
    const opts = options || {};
    const page = opts.page || currentPageKey();
    const inventory = getScriptInventory();
    const moduleNames = collectContractsForCheck(Object.assign({}, opts, { page }));
    const checks = [];

    loadOrderRules.forEach(function (rule) {
      if (ruleAppliesToPage(rule, page)) {
        checks.push(checkLoadOrderRule(rule, inventory, page));
      }
    });
    moduleNames.forEach(function (name) {
      const contract = moduleContracts[name];
      if (!contract || !contract.script) return;
      const moduleIndex = findScriptIndex(contract.script, inventory);
      if (moduleIndex < 0) {
        checks.push({ moduleName: name, ok: false, reason: 'module-script-not-found', moduleScript: contract.script, moduleIndex });
        return;
      }
      const tokens = [];
      (contract.loadAfter || []).forEach(function (token) { if (token) tokens.push(token); });
      (contract.dependencies || []).forEach(function (dep) { if (dep.script) tokens.push(dep.script); });
      const uniqueTokens = Array.from(new Set(tokens));
      uniqueTokens.forEach(function (token) {
        const depIndex = findScriptIndex(token, inventory);
        if (depIndex < 0) {
          checks.push({ moduleName: name, ok: true, reason: 'dependency-script-not-found-global-may-be-inline', moduleScript: contract.script, dependencyScript: token, moduleIndex, dependencyIndex: depIndex });
          return;
        }
        checks.push({
          moduleName: name,
          ok: depIndex <= moduleIndex,
          reason: depIndex <= moduleIndex ? 'order-ok' : 'dependency-after-module',
          moduleScript: contract.script,
          dependencyScript: token,
          moduleIndex,
          dependencyIndex: depIndex
        });
      });
    });
    const violations = checks.filter(function (item) { return !item.ok; });
    return {
      version: VERSION,
      ok: violations.length === 0,
      page,
      scriptCount: inventory.length,
      checks,
      violations,
      timestamp: now()
    };
  }

  function moduleDepsReady(moduleName, options) {
    return !!checkModuleDeps(moduleName, Object.assign({ record: false, silent: true }, options || {})).ok;
  }

  function getDependencyStatus(options) {
    const opts = options || {};
    const page = opts.page || currentPageKey();
    const critical = checkCriticalDependencies(Object.assign({}, opts, { page }));
    const scriptOrder = checkScriptOrder(Object.assign({}, opts, { page }));
    return {
      version: VERSION,
      ok: critical.ok && scriptOrder.ok,
      page,
      critical,
      scriptOrder,
      missing: getMissing(),
      contractChecks: getContractChecks(),
      moduleCount: listModules().length,
      loadOrderRuleCount: loadOrderRules.length,
      timestamp: now()
    };
  }

  function dumpContracts() {
    const contracts = getModuleContracts();
    try {
      if (global.console && typeof global.console.table === 'function') {
        global.console.table(listModules().map(function (name) {
          const contract = moduleContracts[name];
          return {
            moduleName: name,
            critical: contract.critical !== false,
            pages: contract.pages.join(', '),
            deps: contract.dependencies.length,
            script: contract.script || ''
          };
        }));
      }
    } catch (_) {
    void _;
  }
    return contracts;
  }

  function dumpCriticalDependencies(options) {
    const result = checkCriticalDependencies(options || {});
    try {
      if (global.console && typeof global.console.table === 'function') {
        global.console.table(result.modules.map(function (mod) {
          return {
            moduleName: mod.moduleName,
            ok: mod.ok,
            missingRequired: mod.missingRequired.length,
            missingOptional: mod.missingOptional.length,
            deps: mod.dependencies.length
          };
        }));
      }
    } catch (_) {
    void _;
  }
    return result;
  }

  function getDiagnostics() {
    return {
      version: VERSION,
      missing: missingEvents.map(cloneEvent),
      checks: contractCheckEvents.map(cloneEvent),
      notices: noticeEvents.map(cloneEvent),
      warnedKeys: Object.keys(warned),
      contracts: getModuleContracts(),
      debug: !!debugEnabled
    };
  }

  function getMissing() {
    return missingEvents.map(cloneEvent);
  }

  function getContractChecks() {
    return contractCheckEvents.map(cloneEvent);
  }

  function resetDiagnostics() {
    missingEvents.splice(0, missingEvents.length);
    contractCheckEvents.splice(0, contractCheckEvents.length);
    noticeEvents.splice(0, noticeEvents.length);
    Object.keys(lastNoticeByKey).forEach(function (key) { delete lastNoticeByKey[key]; });
    Object.keys(warned).forEach(function (key) { delete warned[key]; });
  }

  function setDebug(value) {
    debugEnabled = value !== false;
  }


  function uniqueStrings(values) {
    const seen = Object.create(null);
    const out = [];
    (values || []).forEach(function (value) {
      const text = String(value || '').trim();
      if (!text || seen[text]) return;
      seen[text] = true;
      out.push(text);
    });
    return out;
  }

  function friendlyDependencyName(dep) {
    const path = normalizePath((dep && (dep.path || dep.name)) || dep);
    if (!path) return '';
    if (DEPENDENCY_LABELS[path]) return DEPENDENCY_LABELS[path];
    const source = normalizePath(dep && dep.source);
    if (source) return source;
    return path;
  }

  function friendlyModuleName(moduleName) {
    const name = normalizeModuleName(moduleName);
    return MODULE_LABELS[name] || name;
  }

  function resolveStatusElement(target) {
    if (!target || !global.document) return null;
    if (target.nodeType === 1) return target;
    if (typeof target !== 'string') return null;
    const key = target.trim();
    if (!key) return null;
    try {
      return global.document.getElementById(key) || global.document.querySelector(key);
    } catch (_) {
      return null;
    }
  }

  function setStatusElementMessage(target, message, options) {
    const el = resolveStatusElement(target);
    if (!el) return false;
    try {
      el.textContent = String(message || '');
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      if (options && options.statusClass) el.classList.add(options.statusClass);
      if (options && options.statusColor) {
        el.style.color = options.statusColor;
      } else {
        try {
          const root = global.document && global.document.documentElement;
          const computed = global.getComputedStyle ? global.getComputedStyle(root) : null;
          el.style.color = (computed && computed.getPropertyValue('--danger')) || '#d32f2f';
        } catch (_) {
          el.style.color = '#d32f2f';
        }
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  function ensureNoticeStyles() {
    const doc = global.document;
    if (!doc || !doc.head || doc.getElementById('vilda-dependency-notice-style')) return;
    try {
      const style = doc.createElement('style');
      style.id = 'vilda-dependency-notice-style';
      style.textContent = [
        '#vilda-dependency-notice-container{position:fixed;z-index:2147483647;right:16px;bottom:16px;display:flex;flex-direction:column;gap:10px;max-width:min(420px,calc(100vw - 32px));pointer-events:none}',
        '.vilda-dependency-notice{box-sizing:border-box;border:1px solid rgba(211,47,47,.28);border-left:4px solid #d32f2f;border-radius:14px;background:rgba(255,255,255,.96);box-shadow:0 18px 45px rgba(0,0,0,.16);color:#2f3137;padding:12px 38px 12px 14px;font:500 14px/1.4 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;pointer-events:auto;position:relative}',
        '.vilda-dependency-notice strong{display:block;margin:0 0 3px;font-size:14px;color:#b42318}',
        '.vilda-dependency-notice small{display:block;margin-top:6px;color:#69707a;font-weight:400}',
        '.vilda-dependency-notice button{position:absolute;right:8px;top:8px;border:0;background:transparent;color:#6b7280;font-size:20px;line-height:1;cursor:pointer;padding:2px 6px}'
      ].join('\n');
      doc.head.appendChild(style);
    } catch (_) {
    void _;
  }
  }

  function getNoticeContainer() {
    const doc = global.document;
    if (!doc || !doc.body) return null;
    ensureNoticeStyles();
    let container = null;
    try { container = doc.getElementById('vilda-dependency-notice-container'); } catch (_) { container = null; }
    if (container) return container;
    try {
      container = doc.createElement('div');
      container.id = 'vilda-dependency-notice-container';
      container.setAttribute('aria-live', 'polite');
      container.setAttribute('aria-atomic', 'false');
      doc.body.appendChild(container);
      return container;
    } catch (_) {
      return null;
    }
  }

  function showInjectedNotice(message, options) {
    const opts = options || {};
    const container = getNoticeContainer();
    if (!container) return false;
    try {
      const doc = global.document;
      const notice = doc.createElement('div');
      notice.className = 'vilda-dependency-notice';
      notice.setAttribute('role', 'status');
      const title = doc.createElement('strong');
      title.textContent = opts.title || 'Brakuje wymaganych zasobów';
      const body = doc.createElement('div');
      body.textContent = String(message || '');
      const hint = doc.createElement('small');
      hint.textContent = opts.hint || 'Odśwież stronę. Jeżeli problem wróci, wyczyść cache lub sprawdź kolejność ładowania skryptów.';
      const close = doc.createElement('button');
      close.type = 'button';
      close.setAttribute('aria-label', 'Zamknij komunikat');
      close.textContent = '×';
      close.addEventListener('click', function () {
        try { notice.remove(); } catch (_) {
    void _;
  }
      });
      notice.appendChild(close);
      notice.appendChild(title);
      notice.appendChild(body);
      if (opts.showHint !== false) notice.appendChild(hint);
      container.appendChild(notice);
      const timeout = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : 9000;
      if (timeout > 0) {
        global.setTimeout(function () {
          try { notice.remove(); } catch (_) {
    void _;
  }
        }, timeout);
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  function buildMissingDependencyMessage(resultOrModule, options) {
    const opts = options || {};
    const result = coerceDependencyResult(resultOrModule, Object.assign({}, opts, { record: opts.record !== false, silent: true }));
    const moduleName = normalizeModuleName((result && result.moduleName) || (typeof resultOrModule === 'string' ? resultOrModule : 'unknown-module'));
    const missingRequired = (result && result.missingRequired) ? result.missingRequired : [];
    const missingOptional = (result && result.missingOptional) ? result.missingOptional : [];
    const missing = uniqueStrings(missingRequired.map(friendlyDependencyName).concat(opts.includeOptional ? missingOptional.map(friendlyDependencyName) : []));
    const base = opts.message || MODULE_FALLBACK_MESSAGES[moduleName] || ('Nie można uruchomić funkcji „' + friendlyModuleName(moduleName) + '”, bo brakuje wymaganych bibliotek lub danych.');
    const missingText = missing.length ? ' Brakujące elementy: ' + missing.join(', ') + '.' : '';
    const recovery = opts.recovery || ' Odśwież stronę i spróbuj ponownie. Jeśli problem wraca, wyczyść cache albo sprawdź kolejność ładowania skryptów.';
    return String(base + missingText + recovery).replace(/\s+/g, ' ').trim();
  }

  function coerceDependencyResult(resultOrModule, options) {
    const opts = options || {};
    if (typeof resultOrModule === 'string') {
      return checkModuleDeps(resultOrModule, Object.assign({ silent: true }, opts));
    }
    if (resultOrModule && typeof resultOrModule === 'object') return resultOrModule;
    return {
      moduleName: normalizeModuleName(opts.moduleName),
      ok: true,
      missingRequired: [],
      missingOptional: [],
      contractFound: false
    };
  }

  function recordNotice(event) {
    noticeEvents.push(cloneEvent(event));
    trimEventList(noticeEvents, MAX_NOTICES);
  }

  function showDependencyNotice(message, options) {
    const opts = options || {};
    const text = String(message || '').trim();
    if (!text || opts.show === false || opts.showUi === false) return false;
    const moduleName = normalizeModuleName(opts.moduleName || opts.module || opts.context);
    const key = moduleName + '::' + text;
    const ts = now();
    const dedupeMs = Number.isFinite(opts.dedupeMs) ? opts.dedupeMs : 4500;
    if (dedupeMs > 0 && lastNoticeByKey[key] && (ts - lastNoticeByKey[key]) < dedupeMs) {
      return true;
    }
    lastNoticeByKey[key] = ts;

    const event = {
      kind: 'dependency-notice',
      moduleName,
      message: text,
      timestamp: ts,
      level: opts.level || 'error'
    };
    recordNotice(event);
    logDependencyEvent(event.level === 'error' ? 'error' : 'warn', moduleName, text, null, {
      notice: true,
      statusOnly: opts.statusOnly === true,
      statusElement: opts.statusElement || ''
    }, opts);

    try {
      if (typeof global.CustomEvent === 'function' && typeof global.dispatchEvent === 'function') {
        global.dispatchEvent(new CustomEvent('vilda:dependency-notice', { detail: cloneEvent(event) }));
      }
    } catch (_) {
    void _;
  }

    const statusWritten = opts.statusElement ? setStatusElementMessage(opts.statusElement, text, opts) : false;
    if (opts.statusOnly === true) return statusWritten;

    if (opts.preferToast !== false) {
      try {
        if (typeof global.patientReportShowToast === 'function') {
          global.patientReportShowToast(text);
          return true;
        }
      } catch (_) {
    void _;
  }
    }
    return showInjectedNotice(text, opts) || statusWritten;
  }

  function notifyMissingDependencies(resultOrModule, options) {
    const opts = options || {};
    const result = coerceDependencyResult(resultOrModule, Object.assign({}, opts, { silent: true }));
    if (!result || result.ok !== false) return Object.assign({ userMessage: '' }, result || {});
    const message = buildMissingDependencyMessage(result, opts);
    showDependencyNotice(message, Object.assign({}, opts, { moduleName: result.moduleName }));
    return Object.assign({}, result, { userMessage: message });
  }

  function createMissingDependenciesError(resultOrModule, options) {
    const notified = notifyMissingDependencies(resultOrModule, options || {});
    const message = notified.userMessage || buildMissingDependencyMessage(notified, options || {});
    const error = new Error(message);
    error.name = 'VildaDependencyError';
    error.vildaDependencyError = true;
    error.vildaDependencyResult = notified;
    return error;
  }

  function getNotices() {
    return noticeEvents.map(cloneEvent);
  }

  function registerDefaultContracts() {
    const JS_PDF = { path: 'jspdf.jsPDF', type: 'function', source: 'jsPDF UMD', script: 'jspdf.umd.min.js' };
    const HTML2CANVAS = { path: 'html2canvas', type: 'function', source: 'html2canvas', script: 'html2canvas.min.js' };
    const XLSX = { path: 'XLSX', type: 'object', source: 'SheetJS XLSX', script: 'xlsx.full.min.js' };
    const DOCX = { path: 'docx', type: 'object', source: 'docx.js', script: 'docx' };
    const DOCX_PACKER = { path: 'docx.Packer', type: 'any', source: 'docx.js', script: 'docx', required: false };
    const PDFMAKE = { path: 'pdfMake', type: 'object', source: 'pdfmake', script: 'pdfmake.min.js' };
    const PDFMAKE_CREATE = { path: 'pdfMake.createPdf', type: 'function', source: 'pdfmake', script: 'pdfmake.min.js' };
    const PDFMAKE_VFS = { path: 'pdfMake.vfs', type: 'object', source: 'pdfmake fonts', script: 'vfs_fonts.min.js', required: false };
    const CHART = { path: 'Chart', type: 'function', source: 'Chart.js', script: 'chart.js' };
    const CENTILE_DATA = { path: 'centileData', type: 'object', source: 'centile_data.js', script: 'centile_data.js' };
    const GENERATE_CENTILE = { path: 'generateCentileChart', type: 'function', source: 'inline centile chart renderer' };
    const GENERATE_PAL = { path: 'generatePalczewskaCentileCharts', type: 'function', source: 'inline Palczewska chart renderer' };
    const GET_CHART_STATE = { path: 'getCentileChartState', type: 'function', source: 'inline centile chart state' };
    const BUILD_CENTILE_CANVAS = { path: 'buildCentilePageCanvas', type: 'function', source: 'inline centile page canvas builder' };
    const EFFECTIVE_CENTILE_STATE = { path: 'getEffectiveCentileGrowthDataState', type: 'function', source: 'inline centile growth data state', required: false };
    const COLLECT_AGES = { path: 'collectAllAgesMonths', type: 'function', source: 'inline centile age collector' };

    defineLoadOrderRule('vilda-deps-before-app', 'vilda_deps.js', 'app.js', {
      description: 'Helper VildaDeps powinien być dostępny przed app.js'
    });
    defineLoadOrderRule('jspdf-before-app', 'jspdf.umd.min.js', 'app.js', {
      description: 'jsPDF powinien być dostępny przed eksportami PDF w app.js',
      required: false
    });
    defineLoadOrderRule('html2canvas-before-app', 'html2canvas.min.js', 'app.js', {
      description: 'html2canvas powinien być dostępny przed eksportami PDF opartymi o canvas',
      required: false
    });
    defineLoadOrderRule('centile-data-before-app', 'centile_data.js', 'app.js', {
      description: 'Dane centylowe powinny ładować się przed logiką raportów centylowych',
      required: false
    });
    defineLoadOrderRule('xlsx-before-app', 'xlsx.full.min.js', 'app.js', {
      description: 'SheetJS powinien być dostępny przed importem/eksportem XLSX',
      required: false
    });
    defineLoadOrderRule('advanced-growth-before-app', 'advanced_growth_kowd.js', 'app.js', {
      description: 'Zaawansowane helpery wzrastania powinny być dostępne przed raportami app.js',
      required: false
    });
    defineLoadOrderRule('bayley-pinneau-before-app', 'bayley_pinneau_data.js', 'app.js', {
      description: 'Dane Bayley-Pinneau powinny ładować się przed predykcją wzrostu',
      required: false
    });
    defineLoadOrderRule('rwt-before-app', 'rwt_data.js', 'app.js', {
      description: 'Dane RWT powinny ładować się przed predykcją wzrostu',
      required: false
    });
    defineLoadOrderRule('reinehr-before-app', 'reinehr_cdgp_data.js', 'app.js', {
      description: 'Dane Reinehr/CDGP powinny ładować się przed predykcją wzrostu',
      required: false
    });

    defineModuleDeps('patient-report-pdf', [JS_PDF, HTML2CANVAS], {
      description: 'Raport pacjenta PDF',
      pages: ['index.html', 'docpro.html'],
      script: 'app.js',
      loadAfter: ['vilda_deps.js']
    });

    defineModuleDeps('diet-recommendations-pdf', [JS_PDF, HTML2CANVAS], {
      description: 'PDF zaleceń dietetycznych',
      pages: ['index.html', 'docpro.html'],
      script: 'app.js',
      loadAfter: ['vilda_deps.js']
    });

    defineModuleDeps('main-bmi-metabolism-pdf', [JS_PDF], {
      description: 'Główny raport BMI/metabolizmu',
      pages: ['index.html', 'docpro.html'],
      script: 'app.js',
      loadAfter: ['vilda_deps.js']
    });

    defineModuleDeps('patient-report-selected-pdf', [JS_PDF], {
      description: 'Eksport wybranych stron raportu pacjenta',
      pages: ['index.html', 'docpro.html'],
      script: 'app.js',
      loadAfter: ['vilda_deps.js']
    });

    defineModuleDeps('patient-report-visit-pages', [JS_PDF, HTML2CANVAS], {
      description: 'Dodatkowe strony PDF po wizycie',
      pages: ['index.html', 'docpro.html'],
      script: 'app.js',
      loadAfter: ['vilda_deps.js']
    });

    defineModuleDeps('advanced-growth-pdf', [JS_PDF, HTML2CANVAS], {
      description: 'PDF zaawansowanego wzrastania',
      pages: ['index.html'],
      script: 'app.js',
      loadAfter: ['vilda_deps.js']
    });

    defineModuleDeps('patient-report-centile-chart', [
      CENTILE_DATA,
      GET_CHART_STATE,
      GENERATE_CENTILE,
      GENERATE_PAL,
      BUILD_CENTILE_CANVAS,
      EFFECTIVE_CENTILE_STATE,
      COLLECT_AGES
    ], {
      description: 'Wykresy centylowe w raporcie pacjenta',
      pages: ['index.html', 'docpro.html'],
      script: 'app.js',
      loadAfter: ['vilda_deps.js', 'centile_data.js']
    });

    defineModuleDeps('growth-basic-module-chart', [CENTILE_DATA, GENERATE_CENTILE], {
      description: 'Podstawowy moduł wzrastania — wykres centylowy',
      pages: ['index.html'],
      script: 'growth-basic-module.js',
      loadAfter: ['vilda_deps.js', 'centile_data.js']
    });

    defineModuleDeps('palczewska-centile-reference', [CENTILE_DATA], {
      description: 'Referencja centylowa Palczewskiej',
      pages: ['index.html', 'docpro.html'],
      script: 'app.js',
      loadAfter: ['centile_data.js']
    });

    defineModuleDeps('patient-report-advanced-growth', [
      { path: 'advGrowthCollectHistoricalPointsForReport', type: 'function', source: 'app.js advanced growth report' },
      { path: 'generateAdvancedGrowthPdfReport', type: 'function', source: 'app.js advanced growth report' },
      { path: 'advGrowthBuildReportRows', type: 'function', source: 'app.js advanced growth report' },
      { path: 'advGrowthBuildHtmlReportMarkup', type: 'function', source: 'app.js advanced growth report' },
      HTML2CANVAS
    ], {
      description: 'Zaawansowane wzrastanie w raporcie pacjenta',
      pages: ['index.html'],
      script: 'app.js',
      loadAfter: ['vilda_deps.js']
    });

    defineModuleDeps('advanced-growth-bayley-pinneau', [
      { path: 'bayleyPinneauData', type: 'object', source: 'bayley_pinneau_data.js', script: 'bayley_pinneau_data.js' }
    ], {
      description: 'Dane Bayley-Pinneau',
      pages: ['index.html'],
      script: 'app.js',
      loadAfter: ['bayley_pinneau_data.js']
    });

    defineModuleDeps('advanced-growth-rwt', [
      { path: 'rwtData', type: 'object', source: 'rwt_data.js', script: 'rwt_data.js' }
    ], {
      description: 'Dane Roche-Wainer-Thissen',
      pages: ['index.html'],
      script: 'app.js',
      loadAfter: ['rwt_data.js']
    });

    defineModuleDeps('advanced-growth-reinehr', [
      { path: 'reinehrCdgpData', type: 'object', source: 'reinehr_cdgp_data.js', script: 'reinehr_cdgp_data.js' },
      { path: 'advGrowthCalculateReinehrCdgpPrediction', type: 'function', source: 'advanced_growth_kowd.js', script: 'advanced_growth_kowd.js' }
    ], {
      description: 'Prognoza Reinehr/CDGP',
      pages: ['index.html'],
      script: 'app.js',
      loadAfter: ['reinehr_cdgp_data.js', 'advanced_growth_kowd.js']
    });

    defineModuleDeps('zscore-batch-xlsx', [XLSX], {
      description: 'Wsadowy import/eksport Z-score XLSX',
      pages: ['docpro.html'],
      script: 'app.js',
      loadAfter: ['vilda_deps.js', 'xlsx.full.min.js']
    });

    defineModuleDeps('circumference-module-pdf', [JS_PDF], {
      description: 'PDF modułu obwodów',
      pages: ['index.html', 'docpro.html'],
      script: 'circumference_module.js',
      loadAfter: ['vilda_deps.js']
    });

    defineModuleDeps('clcr-norms-xlsx', [XLSX], {
      description: 'Kalkulator klirensu — dane norm XLSX',
      pages: ['kalkulator-klirens.html'],
      loadAfter: ['vilda_deps.js', 'xlsx.full.min.js']
    });

    defineModuleDeps('clcr-pdf-export', [JS_PDF, HTML2CANVAS], {
      description: 'Kalkulator klirensu — eksport PDF',
      pages: ['kalkulator-klirens.html'],
      loadAfter: ['vilda_deps.js', 'jspdf.umd.min.js', 'html2canvas.min.js']
    });

    defineModuleDeps('clcr-docx-export', [DOCX, DOCX_PACKER], {
      description: 'Kalkulator klirensu — eksport DOCX z fallbackiem do DOC',
      pages: ['kalkulator-klirens.html'],
      critical: false,
      loadAfter: ['docx']
    });

    defineModuleDeps('diabetes-pdfmake-export', [PDFMAKE, PDFMAKE_CREATE, PDFMAKE_VFS], {
      description: 'Moduły cukrzycowe — eksport przez pdfMake',
      pages: ['cukrzyca.html'],
      script: 'cukrzyca.js',
      loadAfter: ['pdfmake.min.js', 'vfs_fonts.min.js']
    });

    defineModuleDeps('steroids-hpta-chart', [CHART], {
      description: 'Steroidy — wykres osi HPTA',
      pages: ['steroidy.html'],
      critical: false,
      loadAfter: ['chart.js']
    });

    defineModuleDeps('sga-birth-module-data', [
      { path: 'SGA_INTERGROWTH_ZS', type: 'object', source: 'sga_intergrowth_data.js', script: 'sga_intergrowth_data.js' },
      { path: 'SGA_MALEWSKI_WEIGHT', type: 'object', source: 'sga_malewski_data.js', script: 'sga_malewski_data.js' }
    ], {
      description: 'Moduł SGA — dane Intergrowth/Malewski',
      pages: ['docpro.html'],
      script: 'sga_birth_module.js',
      loadAfter: ['sga_intergrowth_data.js', 'sga_malewski_data.js']
    });

    defineModuleDeps('down-syndrome-lms-data', [
      { path: 'DS', type: 'object', source: 'ds_lms.js', script: 'ds_lms.js' }
    ], {
      description: 'Siatki LMS dla zespołu Downa',
      pages: ['index.html', 'docpro.html'],
      script: 'app.js',
      loadAfter: ['ds_lms.js']
    });
  }

  const api = {
    __vildaDepsHelper: true,
    version: VERSION,
    get: resolve,
    resolve,
    has,
    isFunction,
    isObject,
    require: requireDependency,
    requireFunction,
    requireObject,
    requireAny,
    warnMissing,
    defineModuleDeps,
    defineModuleDependencies,
    getModuleDeps,
    listModuleDeps,
    moduleDepsReady,
    defineLoadOrderRule,
    getLoadOrderRules,
    getModuleContracts,
    listModules,
    checkModuleDeps,
    checkCriticalDependencies,
    checkScriptOrder,
    getScriptInventory,
    getDependencyStatus,
    dumpContracts,
    dumpCriticalDependencies,
    buildMissingDependencyMessage,
    showDependencyNotice,
    notifyMissingDependencies,
    createMissingDependenciesError,
    getNotices,
    getDiagnostics,
    getMissing,
    getContractChecks,
    resetDiagnostics,
    setDebug,
    currentPageKey
  };

  global.VildaDeps = api;
  global.vildaDeps = api;
  global.vildaRequireFunction = function (path, options) { return requireFunction(path, options); };
  global.vildaRequireObject = function (path, options) { return requireObject(path, options); };
  global.vildaDependencyDiagnostics = getDiagnostics;
  global.vildaDependencyContracts = getModuleContracts;
  global.vildaCheckCriticalDependencies = checkCriticalDependencies;
  global.vildaCriticalDependencyCheck = checkCriticalDependencies;
  global.vildaDependencyStatus = getDependencyStatus;
  global.vildaDumpCriticalDependencies = dumpCriticalDependencies;
  global.vildaShowDependencyNotice = showDependencyNotice;
  global.vildaNotifyMissingDependencies = notifyMissingDependencies;

  registerDefaultContracts();
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
