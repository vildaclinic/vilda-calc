(function () {
  'use strict';

  const STORAGE_KEY = 'wagaiwzrost:docproUi:v2';
  const LEGACY_STORAGE_KEY = 'wagaiwzrost:docproState:v1';
  const UI_RESTORE_DELAYS = [0, 120, 320, 700, 1400];
  const MODULE_RESTORE_DELAYS = [80, 260, 700, 1500];
  const BUTTON_CLASS_NAMES = ['active-toggle', 'gh-selected'];
  const UI_TOGGLE_IDS = new Set([
    'toggleEndoTests',
    'toggleGhTests',
    'toggleOgttTests',
    'toggleActhTests',
    'toggleIgfTests',
    'toggleGhMonitor',
    'toggleAbxTherapy',
    'toggleFluTherapy',
    'toggleObesityTherapy',
    'toggleHypertensionTherapy',
    'toggleThyroidCancerKids',
    'toggleBisphos',
    'toggleZscore',
    'toggleSgaBirth'
  ]);
  const CLEAR_BUTTON_SELECTOR = '#clearAllDataBtn, #clearBtn, #advClearBtn';

  let restoring = false;
  let saveTimer = null;
  let mutationObserver = null;

  function isSaveSuppressed() {
    try {
      return !!(typeof window !== 'undefined' && Number(window.__vildaPersistClearUntil || 0) > Date.now());
    } catch (_) {
      return false;
    }
  }

  function getStorage() {
    try {
      if (window.localStorage) return window.localStorage;
    } catch (_) {}
    return null;
  }

  const storage = getStorage();
  if (!storage) return;

  function safeParse(raw) {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function loadState() {
    return safeParse(storage.getItem(STORAGE_KEY));
  }

  function saveRaw(state) {
    if (isSaveSuppressed()) return;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {
      /* ignore storage errors */
    }
  }

  function clearState() {
    clearTimeout(saveTimer);
    saveTimer = null;
    try {
      if (typeof window !== 'undefined') {
        window.__vildaPersistClearUntil = Date.now() + 1500;
      }
    } catch (_) {}
    try {
      storage.removeItem(STORAGE_KEY);
    } catch (_) {}
    clearLegacyState();
  }

  function clearLegacyState() {
    try {
      storage.removeItem(LEGACY_STORAGE_KEY);
    } catch (_) {}
    try {
      if (window.sessionStorage) window.sessionStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch (_) {}
  }

  function getElementById(id) {
    return id ? document.getElementById(id) : null;
  }

  function cssEscape(value) {
    const raw = String(value == null ? '' : value);
    try {
      if (window.CSS && typeof window.CSS.escape === 'function') {
        return window.CSS.escape(raw);
      }
    } catch (_) {}
    return raw.replace(/([\"'\[\]#.:>+~*=(),])/g, '\\$1');
  }

  function isShown(el) {
    if (!el) return false;
    if (el.hidden) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  function hasActiveClass(el) {
    return !!(el && (el.classList.contains('active') || el.classList.contains('active-toggle') || el.classList.contains('gh-selected')));
  }

  function getNearestStateContainer(el) {
    if (!el || !el.closest) return null;
    return el.closest(
      '#ghIgfTherapyCard, #ghTherapyMonitorCard, #antibioticTherapyCard, #fluCard, #obesityCard, #hypertensionCard, #thyroidCancerKidsCard, #bisphosCard, #zscoreCard, #sgaBirthCard, #ghTestsLeft, #ghTestsRight, #ogttTestsLeft, #ogttTestsRight, #acthTestsLeft, #acthTestsRight, #professionalModule, form, section, .card, .result-card, .gh-test-card'
    );
  }

  function getUntrackedControlKey(el) {
    if (!el || el.id || el.name) return null;

    const container = getNearestStateContainer(el);
    const containerId = container && container.id ? container.id : 'root';

    let pathParts = [];
    let node = el;
    while (node && node !== document.body && pathParts.length < 6) {
      let part = node.tagName ? node.tagName.toLowerCase() : 'node';
      if (node.parentElement) {
        const siblings = Array.from(node.parentElement.children).filter((child) => child.tagName === node.tagName);
        const idx = siblings.indexOf(node);
        part += `:${idx}`;
      }
      pathParts.unshift(part);
      node = node.parentElement;
      if (node && node.id) {
        pathParts.unshift(`#${node.id}`);
        break;
      }
    }

    return `path:${containerId}:${pathParts.join('>')}`;
  }

  function serializeControl(el) {
    const tag = (el.tagName || '').toLowerCase();
    const type = (el.type || '').toLowerCase();
    if (type === 'file') return null;

    if (type === 'checkbox' || type === 'radio') {
      return { kind: type, checked: !!el.checked };
    }

    if (tag === 'select' && el.multiple) {
      return {
        kind: 'select-multiple',
        values: Array.from(el.options).filter((opt) => opt.selected).map((opt) => opt.value)
      };
    }

    return {
      kind: tag === 'textarea' ? 'textarea' : (tag === 'select' ? 'select' : 'value'),
      value: el.value
    };
  }

  function collectUntrackedControls() {
    const out = {};
    document.querySelectorAll('input, select, textarea').forEach((el) => {
      if (el.id || el.name) return;
      const key = getUntrackedControlKey(el);
      const value = serializeControl(el);
      if (!key || !value) return;
      out[key] = value;
    });
    return out;
  }

  function collectDetails() {
    const out = {};
    document.querySelectorAll('details').forEach((el, idx) => {
      const key = el.id ? `id:${el.id}` : `details:${idx}`;
      out[key] = !!el.open;
    });
    return out;
  }

  function collectButtonStates() {
    const out = {};
    document.querySelectorAll('button[id], [role="button"][id]').forEach((el) => {
      const entry = {};
      let relevant = false;

      BUTTON_CLASS_NAMES.forEach((className) => {
        if (el.classList.contains(className)) {
          entry[className] = true;
          relevant = true;
        }
      });

      const ariaPressed = el.getAttribute('aria-pressed');
      if (ariaPressed != null) {
        entry.ariaPressed = ariaPressed;
        relevant = true;
      }

      if (relevant) {
        out[el.id] = entry;
      }
    });
    return out;
  }

  function collectUi() {
    const visible = (id) => isShown(getElementById(id));
    const active = (id) => {
      const el = getElementById(id);
      return !!(el && el.classList.contains('active'));
    };

    return {
      endoListOpen: visible('ghButtonWrapper') || visible('ogttButtonWrapper') || visible('acthButtonWrapper'),
      ghTestsOpen: active('ghTestsLeft') || active('ghTestsRight'),
      ogttTestsOpen: active('ogttTestsLeft') || active('ogttTestsRight'),
      acthTestsOpen: active('acthTestsLeft') || active('acthTestsRight'),
      igfTherapyOpen: visible('ghIgfTherapyCard'),
      ghMonitorOpen: visible('ghTherapyMonitorCard'),
      antibioticOpen: visible('antibioticTherapyCard'),
      fluOpen: visible('fluCard'),
      obesityOpen: visible('obesityCard'),
      hypertensionOpen: visible('hypertensionCard'),
      thyroidCancerKidsOpen: visible('thyroidCancerKidsCard'),
      bisphosOpen: visible('bisphosCard'),
      zscoreOpen: visible('zscoreCard'),
      sgaBirthOpen: visible('sgaBirthCard')
    };
  }


  function collectModuleStates() {
    const out = {};
    try {
      if (window.vildaGhIgfPersistApi && typeof window.vildaGhIgfPersistApi.captureState === 'function') {
        const state = window.vildaGhIgfPersistApi.captureState();
        if (state) out.ghTherapy = state;
      }
    } catch (_) {}
    try {
      if (window.vildaAbxPersistApi && typeof window.vildaAbxPersistApi.captureState === 'function') {
        const state = window.vildaAbxPersistApi.captureState();
        if (state) out.antibiotic = state;
      }
    } catch (_) {}
    try {
      if (window.vildaSgaBirthPersistApi && typeof window.vildaSgaBirthPersistApi.captureState === 'function') {
        const state = window.vildaSgaBirthPersistApi.captureState();
        if (state) out.sgaBirth = state;
      }
    } catch (_) {}
    try {
      if (window.vildaGhTherapyMonitorPersistApi && typeof window.vildaGhTherapyMonitorPersistApi.captureState === 'function') {
        const state = window.vildaGhTherapyMonitorPersistApi.captureState();
        if (state) out.ghMonitor = state;
      }
    } catch (_) {}
    return out;
  }

  function attemptRestoreModuleStates(moduleStates, restoredModules) {
    const savedModules = moduleStates && typeof moduleStates === 'object' ? moduleStates : {};
    const restored = restoredModules && typeof restoredModules === 'object' ? restoredModules : {};

    const tryRestore = (key, apiName) => {
      if (restored[key]) return;
      const api = window[apiName];
      if (!api || typeof api.restoreState !== 'function') return;
      const saved = Object.prototype.hasOwnProperty.call(savedModules, key) ? savedModules[key] : undefined;
      try {
        const result = api.restoreState(saved);
        if (result !== false) {
          restored[key] = true;
        }
      } catch (_) {}
    };

    tryRestore('ghTherapy', 'vildaGhIgfPersistApi');
    tryRestore('antibiotic', 'vildaAbxPersistApi');
    tryRestore('sgaBirth', 'vildaSgaBirthPersistApi');
    tryRestore('ghMonitor', 'vildaGhTherapyMonitorPersistApi');
  }

  function buildState() {
    return {
      version: 2,
      savedAt: Date.now(),
      controls: collectUntrackedControls(),
      details: collectDetails(),
      buttonStates: collectButtonStates(),
      ui: collectUi(),
      moduleStates: collectModuleStates()
    };
  }

  function queueSave(delay) {
    if (restoring || isSaveSuppressed()) return;
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      if (restoring || isSaveSuppressed()) {
        saveTimer = null;
        return;
      }
      saveTimer = null;
      saveRaw(buildState());
    }, typeof delay === 'number' ? delay : 180);
  }

  function applyControlValue(el, saved) {
    if (!el || !saved) return false;
    const tag = (el.tagName || '').toLowerCase();
    const type = (el.type || '').toLowerCase();
    if (type === 'file') return false;

    let changed = false;

    if (saved.kind === 'checkbox' || saved.kind === 'radio') {
      const nextChecked = !!saved.checked;
      if (el.checked !== nextChecked) {
        el.checked = nextChecked;
        changed = true;
      }
    } else if (saved.kind === 'select-multiple' && tag === 'select' && el.multiple) {
      const nextValues = new Set(Array.isArray(saved.values) ? saved.values : []);
      Array.from(el.options).forEach((opt) => {
        const shouldSelect = nextValues.has(opt.value);
        if (opt.selected !== shouldSelect) {
          opt.selected = shouldSelect;
          changed = true;
        }
      });
    } else {
      const nextValue = saved.value == null ? '' : String(saved.value);
      if (String(el.value) !== nextValue) {
        el.value = nextValue;
        changed = true;
      }
    }

    if (changed) {
      try {
        el.dispatchEvent(new Event('input', { bubbles: true }));
      } catch (_) {}
      try {
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (_) {}
    }

    return changed;
  }

  function applyControls(state) {
    if (!state || !state.controls) return 0;
    let applied = 0;
    document.querySelectorAll('input, select, textarea').forEach((el) => {
      if (el.id || el.name) return;
      const key = getUntrackedControlKey(el);
      if (!key || !Object.prototype.hasOwnProperty.call(state.controls, key)) return;
      if (applyControlValue(el, state.controls[key])) {
        applied += 1;
      }
    });
    return applied;
  }

  function restoreDetails(detailsState) {
    if (!detailsState) return;
    document.querySelectorAll('details').forEach((el, idx) => {
      const key = el.id ? `id:${el.id}` : `details:${idx}`;
      if (!Object.prototype.hasOwnProperty.call(detailsState, key)) return;
      el.open = !!detailsState[key];
    });
  }

  function safeClick(el) {
    if (!el || typeof el.click !== 'function' || el.disabled) return;
    try {
      el.click();
    } catch (_) {
      try {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      } catch (__){ }
    }
  }

  function ensureOpen(toggleId, shouldBeOpen, isOpen) {
    if (!shouldBeOpen) return;
    const btn = getElementById(toggleId);
    if (!btn) return;
    if (isOpen()) return;
    safeClick(btn);
  }

  function restoreUi(ui) {
    if (!ui) return;

    ensureOpen('toggleEndoTests', !!(ui.endoListOpen || ui.ghTestsOpen || ui.ogttTestsOpen || ui.acthTestsOpen), () => isShown(getElementById('ghButtonWrapper')));
    ensureOpen('toggleGhTests', !!ui.ghTestsOpen, () => hasActiveClass(getElementById('ghTestsLeft')) || hasActiveClass(getElementById('ghTestsRight')));
    ensureOpen('toggleOgttTests', !!ui.ogttTestsOpen, () => hasActiveClass(getElementById('ogttTestsLeft')) || hasActiveClass(getElementById('ogttTestsRight')));
    ensureOpen('toggleActhTests', !!ui.acthTestsOpen, () => hasActiveClass(getElementById('acthTestsLeft')) || hasActiveClass(getElementById('acthTestsRight')));

    ensureOpen('toggleIgfTests', !!(ui.igfTherapyOpen || ui.ghMonitorOpen), () => isShown(getElementById('ghIgfTherapyCard')));
    ensureOpen('toggleGhMonitor', !!ui.ghMonitorOpen, () => isShown(getElementById('ghTherapyMonitorCard')));
    ensureOpen('toggleAbxTherapy', !!ui.antibioticOpen, () => isShown(getElementById('antibioticTherapyCard')));
    ensureOpen('toggleFluTherapy', !!ui.fluOpen, () => isShown(getElementById('fluCard')));
    ensureOpen('toggleObesityTherapy', !!ui.obesityOpen, () => isShown(getElementById('obesityCard')));
    ensureOpen('toggleHypertensionTherapy', !!ui.hypertensionOpen, () => isShown(getElementById('hypertensionCard')));
    ensureOpen('toggleThyroidCancerKids', !!ui.thyroidCancerKidsOpen, () => isShown(getElementById('thyroidCancerKidsCard')));
    ensureOpen('toggleBisphos', !!ui.bisphosOpen, () => isShown(getElementById('bisphosCard')));
    ensureOpen('toggleZscore', !!ui.zscoreOpen, () => isShown(getElementById('zscoreCard')));
    ensureOpen('toggleSgaBirth', !!ui.sgaBirthOpen, () => isShown(getElementById('sgaBirthCard')));
  }

  function restoreCustomButtons(buttonStates) {
    if (!buttonStates) return;
    Object.keys(buttonStates).forEach((id) => {
      if (UI_TOGGLE_IDS.has(id)) return;
      const saved = buttonStates[id] || {};
      const el = getElementById(id);
      if (!el) return;

      const shouldClick = BUTTON_CLASS_NAMES.some((className) => saved[className] && !el.classList.contains(className));
      if (shouldClick) {
        safeClick(el);
      }

      if (saved.ariaPressed != null) {
        try {
          el.setAttribute('aria-pressed', saved.ariaPressed);
        } catch (_) {}
      }

      BUTTON_CLASS_NAMES.forEach((className) => {
        if (!Object.prototype.hasOwnProperty.call(saved, className)) return;
        if (saved[className]) {
          el.classList.add(className);
        }
      });
    });
  }

  function startMutationObserver(state) {
    if (mutationObserver) {
      mutationObserver.disconnect();
    }

    mutationObserver = new MutationObserver(() => {
      if (!restoring) return;
      restoreUi(state.ui);
      applyControls(state);
      restoreCustomButtons(state.buttonStates);
      restoreDetails(state.details);
    });

    try {
      mutationObserver.observe(document.body, { childList: true, subtree: true });
      window.setTimeout(() => {
        if (mutationObserver) {
          mutationObserver.disconnect();
          mutationObserver = null;
        }
      }, 4000);
    } catch (_) {
      mutationObserver = null;
    }
  }

  function restoreState(state) {
    if (!state) return;

    const restoredModules = Object.create(null);

    restoring = true;
    startMutationObserver(state);

    UI_RESTORE_DELAYS.forEach((delay) => {
      window.setTimeout(() => {
        restoreUi(state.ui);
        applyControls(state);
        restoreCustomButtons(state.buttonStates);
        restoreDetails(state.details);
      }, delay);
    });

    MODULE_RESTORE_DELAYS.forEach((delay) => {
      window.setTimeout(() => {
        restoreUi(state.ui);
        attemptRestoreModuleStates(state.moduleStates, restoredModules);
      }, delay);
    });

    const lastDelay = Math.max(
      Math.max.apply(Math, UI_RESTORE_DELAYS),
      Math.max.apply(Math, MODULE_RESTORE_DELAYS)
    ) + 350;
    window.setTimeout(() => {
      restoring = false;
      queueSave(0);
    }, lastDelay);
  }

  function isClearActionTarget(target) {
    if (!target || typeof target.closest !== 'function') return false;
    return !!target.closest(CLEAR_BUTTON_SELECTOR);
  }

  function initPersistence() {
    clearLegacyState();

    const existing = loadState();
    if (existing) {
      restoreState(existing);
    }

    document.addEventListener('input', (ev) => {
      if (isClearActionTarget(ev.target)) return;
      queueSave(180);
    }, true);
    document.addEventListener('change', (ev) => {
      if (isClearActionTarget(ev.target)) return;
      queueSave(180);
    }, true);
    document.addEventListener('toggle', (ev) => {
      if (isClearActionTarget(ev.target)) return;
      queueSave(180);
    }, true);
    document.addEventListener('click', (ev) => {
      if (isClearActionTarget(ev.target)) {
        clearState();
        return;
      }
      if (!isSaveSuppressed()) {
        queueSave(220);
      }
    }, true);
    window.addEventListener('pagehide', () => {
      if (mutationObserver) {
        mutationObserver.disconnect();
        mutationObserver = null;
      }
      if (!restoring && !isSaveSuppressed()) {
        saveRaw(buildState());
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && !restoring && !isSaveSuppressed()) {
        saveRaw(buildState());
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPersistence, { once: true });
  } else {
    initPersistence();
  }
})();
