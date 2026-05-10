/* ==========================================================================
 * app.js — główny plik aplikacji
 *
 * Mostki inicjalizacji, HTML, loggera i zależności globalnych zostały
 * wydzielone do vilda_app_helpers.js w kroku 8B. Statyczne dane żywności
 * i aktywności zostały wydzielone do vilda_food_data.js w kroku 8C.
 * Logika podsumowania posiłków została wydzielona do vilda_food_summary.js w kroku 8E.
 * Warstwa makro-praktyki i dodawania wierszy posiłków została wydzielona
 * do vilda_macro_practice.js w kroku 8F. Neutralne helpery zaawansowanego
 * wzrastania, kontrola PRO/źródeł danych oraz mostek GH/IGF zostały wydzielone do vilda_advanced_growth.js w krokach 8O-1–8O-5.
 * Statyczne dane referencyjne BMI/LMS/WHO-WFL zostały wydzielone do vilda_growth_reference_data.js w kroku 8Q-1.
 * Moduł profesjonalny został wydzielony do vilda_professional_module.js w kroku 8Q-2.
 * Runtime persistence/autosave/restore został wydzielony do vilda_persist_runtime.js w kroku 8Q-3.
 * Karty podsumowań/metabolic summary UI zostały wydzielone do vilda_summary_cards.js w kroku 8Q-4.
 * ========================================================================== */

const VILDA_FOOD_DATA = (typeof window !== 'undefined' && window.VildaFoodData) ? window.VildaFoodData : {};
if (!VILDA_FOOD_DATA.version && typeof vildaLogAppWarn === 'function') {
  vildaLogAppWarn('food-data', 'Brak VildaFoodData — dane produktów i aktywności nie zostały załadowane przed app.js.');
}

const snacks = VILDA_FOOD_DATA.snacks || {};
const meals = VILDA_FOOD_DATA.meals || {};
const foods = VILDA_FOOD_DATA.foods || Object.assign({}, snacks, meals);

// === MOTION / ACCESSIBILITY HELPERS ==================================
const VILDA_REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const VILDA_REDUCED_MOTION_PULSE_ALLOWED_IDS = Object.freeze([
  'intakeResults',
  'coleInfo',
  'bpResult',
  'adultVitalsResult'
]);

function vildaPrefersReducedMotion() {
  try {
    const root = (typeof window !== 'undefined') ? window : ((typeof globalThis !== 'undefined') ? globalThis : null);
    if (!root || typeof root.matchMedia !== 'function') return false;
    const mediaQuery = root.matchMedia(VILDA_REDUCED_MOTION_QUERY);
    return !!(mediaQuery && mediaQuery.matches === true);
  } catch (error) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', error, { step: '8P-6', context: 'prefers-reduced-motion' });
    }
    return false;
  }
}

function vildaGetMotionAwareScrollBehavior() {
  return vildaPrefersReducedMotion() ? 'auto' : 'smooth';
}

function vildaShouldAnimateNumbers() {
  return !vildaPrefersReducedMotion();
}

function vildaShouldApplyPulseMotion(el) {
  if (!vildaPrefersReducedMotion()) return true;
  try {
    let node = el;
    while (node && node.nodeType === 1) {
      if (node.id && VILDA_REDUCED_MOTION_PULSE_ALLOWED_IDS.indexOf(node.id) >= 0) {
        return true;
      }
      node = node.parentElement || null;
    }
  } catch (error) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', error, { step: '8P-6', context: 'reduced-motion-pulse-allowlist' });
    }
  }
  return false;
}

if (typeof window !== 'undefined') {
  window.vildaPrefersReducedMotion = vildaPrefersReducedMotion;
  window.vildaGetMotionAwareScrollBehavior = vildaGetMotionAwareScrollBehavior;
  window.vildaShouldApplyPulseMotion = vildaShouldApplyPulseMotion;
}

// === LAYOUT / RESIZE rAF THROTTLE HELPERS ============================
const VILDA_LAYOUT_RAF_THROTTLE_STEP = '8P-7';
const VILDA_LAYOUT_RAF_FALLBACK_MS = 16;
const vildaLayoutRafThrottleRegistry = [];

function vildaGetAnimationFrameScheduler() {
  const root = (typeof window !== 'undefined') ? window : ((typeof globalThis !== 'undefined') ? globalThis : null);
  if (root && typeof root.requestAnimationFrame === 'function') {
    return {
      type: 'requestAnimationFrame',
      schedule: root.requestAnimationFrame.bind(root)
    };
  }
  return {
    type: 'setTimeout',
    schedule: function scheduleLayoutRafFallback(callback) {
      return setTimeout(function runLayoutRafFallback() { callback(Date.now()); }, VILDA_LAYOUT_RAF_FALLBACK_MS);
    }
  };
}

function vildaCreateRafThrottledLayoutTask(label, callback) {
  let frameId = null;
  let schedulerType = null;
  let pendingReason = null;
  let lastRunReason = null;
  let scheduledCount = 0;
  let runCount = 0;

  const normalizedLabel = String(label || 'layout-task');
  const snapshot = function getRafThrottledLayoutTaskSnapshot() {
    return {
      label: normalizedLabel,
      pending: frameId !== null,
      schedulerType: schedulerType,
      pendingReason: pendingReason,
      lastRunReason: lastRunReason,
      scheduledCount: scheduledCount,
      runCount: runCount
    };
  };

  const throttledTask = function scheduleRafThrottledLayoutTask(reason) {
    pendingReason = reason || pendingReason || 'layout-refresh';
    if (frameId !== null) return;

    const scheduler = vildaGetAnimationFrameScheduler();
    schedulerType = scheduler.type;
    scheduledCount += 1;
    frameId = scheduler.schedule(function runRafThrottledLayoutTask() {
      const runReason = pendingReason || 'layout-refresh';
      frameId = null;
      pendingReason = null;
      lastRunReason = runReason;
      runCount += 1;
      try {
        callback(runReason);
      } catch (error) {
        if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
          globalThis.vildaLogSwallowedCatch('app.js', error, { step: VILDA_LAYOUT_RAF_THROTTLE_STEP, context: 'layout-raf-throttle:' + normalizedLabel });
        }
      }
    });
  };

  throttledTask.vildaGetLayoutRafThrottleSnapshot = snapshot;
  vildaLayoutRafThrottleRegistry.push(snapshot);
  return throttledTask;
}

function vildaGetLayoutRafThrottleSnapshot() {
  return vildaLayoutRafThrottleRegistry.map(function mapLayoutRafThrottleSnapshot(getSnapshot) {
    try {
      return getSnapshot();
    } catch (error) {
      return { label: 'snapshot-error', error: error && error.message ? error.message : String(error) };
    }
  });
}

if (typeof window !== 'undefined') {
  window.vildaCreateRafThrottledLayoutTask = vildaCreateRafThrottledLayoutTask;
  window.vildaGetLayoutRafThrottleSnapshot = vildaGetLayoutRafThrottleSnapshot;
}

/* === MACRO PRACTICE HELPERS moved to vilda_macro_practice.js in step 8F === */

// === USTAWIENIA KLINICZNE ===
const ADULT_BMI = { UNDER: 18.5, OVER: 25, OBESE: 30 };
// Ujednolicone progi BMI dla dzieci: nadwaga od 85. centyla, otyłość od 97. centyla
// Zarówno w siatkach WHO, jak i OLAF obowiązują teraz te same wartości progowe.
const CHILD_THRESH_WHO  = { NORMAL_HI: 85, OBESE: 97 };
const CHILD_THRESH_OLAF = { NORMAL_HI: 85, OBESE: 97 };
const KCAL_PER_KG = 7700;         // 1 kg tkanki tłuszczowej ≈ 7700 kcal
const Z85 = 1.036;  // z‑score dla 85. centyla (WHO próg nadwagi)
const Z90 = 1.282;        // z‑score dla 90. centyla (OLAF – próg nadwagi)

// ---- NOWE STAŁE --------------------------------------------
/* Z‑score skrajnych centyli */
const Z3  = -1.8808;      // 3. centyl  (≈‑2 SD)
const Z97 =  1.8808;      // 97. centyl (≈+2 SD)
/* ==================  K O N S T A N T Y  ====================== */
const PAL_OPTIONS = {
  1.2: 'bardzo niska',
  1.4: 'niska',
  1.6: 'umiarkowana',
  1.8: 'wysoka',
  2.0: 'bardzo wysoka'
};

// DIET_LEVELS i opisy diet zostały wydzielone do vilda_diet_plan_ui.js w kroku 8Q-5.

/*
 * ==============================
 * IndexedDB and BroadcastChannel utilities for GH/IGF therapy sync
 *
 * W sekcji zaawansowanych obliczeń wzrostowych korzystamy z
 * IndexedDB jako źródła danych o punktach terapii hormonem wzrostu/IGF‑1.
 * Ponadto nasłuchujemy kanału BroadcastChannel "gh-therapy-sync", aby
 * aktualizować pomiary w czasie rzeczywistym, gdy tylko dane zostaną
 * zmienione w innej karcie (moduł monitorowania terapii).  Funkcje
 * openGHTherapyDB() oraz getTherapyPointsFromDB() są asynchroniczne i
 * obsługują utworzenie bazy przy pierwszym użyciu.  W razie braku
 * wsparcia dla IndexedDB zachowujemy kompatybilność poprzez
 * użycie localStorage.
 */

const GH_DB_NAME = 'ghTherapyDB';
const GH_STORE_NAME = 'ghTherapyPoints';

function openGHTherapyDB(){
  return new Promise((resolve, reject) => {
    try {
      if (typeof indexedDB === 'undefined') {
        return reject(new Error('IndexedDB not available'));
      }
      const req = indexedDB.open(GH_DB_NAME, 1);
      req.onupgradeneeded = function(ev){
        const db = ev.target.result;
        if (!db.objectStoreNames.contains(GH_STORE_NAME)) {
          db.createObjectStore(GH_STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = function(ev){
        const db = ev.target.result;
        attachGHTherapyDBVersionChangeHandler(db, 'openGHTherapyDB');
        resolve(db);
      };
      req.onerror = function(ev){ reject(ev.target.error); };
    } catch(err) {
      reject(err);
    }
  });
}

function attachGHTherapyDBVersionChangeHandler(db, contextLabel){
  try {
    if (!db) return db;
    db.onversionchange = function(){
      closeGHTherapyDBConnection(db, (contextLabel || 'openGHTherapyDB') + ':onversionchange');
    };
  } catch (error) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', error, { step: '8O-11a-c', context: contextLabel || 'gh-therapy-indexeddb-onversionchange' });
    }
  }
  return db;
}

function closeGHTherapyDBConnection(db, contextLabel){
  try {
    if (db && typeof db.close === 'function') db.close();
  } catch (error) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', error, { step: '8O-11a-c', context: contextLabel || 'gh-therapy-indexeddb-close' });
    }
  }
}

async function getTherapyPointsFromDB(){
  let db = null;
  try {
    db = await openGHTherapyDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(GH_STORE_NAME, 'readonly');
      const store = tx.objectStore(GH_STORE_NAME);
      const req = store.getAll();
      let points = [];
      req.onsuccess = function(){
        points = Array.isArray(req.result) ? req.result : [];
      };
      req.onerror = function(){ reject(req.error); };
      tx.oncomplete = function(){ resolve(points); };
      tx.onerror = function(){ reject(tx.error || req.error); };
      tx.onabort = function(){ reject(tx.error || new Error('IndexedDB transaction aborted')); };
    });
  } catch(_) {
    return [];
  } finally {
    closeGHTherapyDBConnection(db, 'getTherapyPointsFromDB');
  }
}

async function clearTherapyPointsInDB(){
  let db = null;
  try {
    db = await openGHTherapyDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(GH_STORE_NAME, 'readwrite');
      const store = tx.objectStore(GH_STORE_NAME);
      const req = store.clear();
      req.onerror = function(){ reject(req.error); };
      tx.oncomplete = function(){ resolve(true); };
      tx.onerror = function(){ reject(tx.error || req.error); };
      tx.onabort = function(){ reject(tx.error || new Error('IndexedDB transaction aborted')); };
    });
    return true;
  } catch (_) {
    return false;
  } finally {
    closeGHTherapyDBConnection(db, 'clearTherapyPointsInDB');
  }
}

function isGhAdvancedImportSuppressed(){
  try {
    if (typeof window === 'undefined') return false;
    return Number(window.__vildaSuppressGhAdvancedImportUntil || 0) > Date.now();
  } catch (_) {
    return false;
  }
}

function readGhTherapyPointsFromModuleStorage(){
  try {
    if (typeof window !== 'undefined' && window.VildaPersistence && typeof window.VildaPersistence.readModuleJSON === 'function') {
      const value = window.VildaPersistence.readModuleJSON('GH_THERAPY_POINTS', []);
      return Array.isArray(value) ? value : [];
    }
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 3175 });
    }
  }
  return [];
}

function writeGhTherapyPointsToModuleStorage(points){
  const safePoints = Array.isArray(points) ? points : [];
  try {
    if (typeof window !== 'undefined' && window.VildaPersistence && typeof window.VildaPersistence.writeModuleJSON === 'function') {
      return window.VildaPersistence.writeModuleJSON('GH_THERAPY_POINTS', safePoints, { force: true });
    }
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 3185 });
    }
  }
  return false;
}

function clearGhTherapyPointsModuleStorage(){
  try {
    if (typeof window !== 'undefined' && window.VildaPersistence && typeof window.VildaPersistence.removeModuleKey === 'function') {
      return window.VildaPersistence.removeModuleKey('GH_THERAPY_POINTS');
    }
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 3194 });
    }
  }
  return false;
}

// Inicjalizuj BroadcastChannel do nasłuchiwania zmian w module terapii.
const ghTherapyBroadcastChannel = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel('gh-therapy-sync') : null;
let ghTherapyBroadcastChannelClosed = false;

function handleGHTherapyBroadcastMessage(){
  // Po otrzymaniu komunikatu spróbuj ponownie zaimportować punkty z bazy
  try {
    if (typeof importTherapyPointsToAdvancedGrowth === 'function') {
      importTherapyPointsToAdvancedGrowth();
    }
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 3208 });
    }
  }
}

function isGHTherapyBroadcastChannelOpen(){
  return !!(ghTherapyBroadcastChannel && ghTherapyBroadcastChannelClosed !== true);
}

function getGHTherapyBroadcastChannel(){
  return isGHTherapyBroadcastChannelOpen() ? ghTherapyBroadcastChannel : null;
}

function closeGHTherapyBroadcastChannel(contextLabel){
  if (!ghTherapyBroadcastChannel || ghTherapyBroadcastChannelClosed) return false;
  ghTherapyBroadcastChannelClosed = true;
  try {
    if (typeof ghTherapyBroadcastChannel.removeEventListener === 'function') {
      ghTherapyBroadcastChannel.removeEventListener('message', handleGHTherapyBroadcastMessage);
    }
  } catch (error) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', error, { step: '8O-11b', context: (contextLabel || 'gh-therapy-broadcast-channel-close') + ':remove-listener' });
    }
  }
  try {
    if (typeof ghTherapyBroadcastChannel.close === 'function') ghTherapyBroadcastChannel.close();
    return true;
  } catch (error) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', error, { step: '8O-11b', context: contextLabel || 'gh-therapy-broadcast-channel-close' });
    }
  }
  return false;
}

function registerGHTherapyBroadcastChannelLifecycleCleanup(){
  try {
    if (!ghTherapyBroadcastChannel || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return false;
    const cleanup = function(){ closeGHTherapyBroadcastChannel('gh-therapy-broadcast-channel-page-lifecycle'); };
    window.addEventListener('pagehide', cleanup, { once: true });
    window.addEventListener('beforeunload', cleanup, { once: true });
    return true;
  } catch (error) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', error, { step: '8O-11b', context: 'gh-therapy-broadcast-channel-lifecycle-bind' });
    }
  }
  return false;
}

if (ghTherapyBroadcastChannel) {
  try {
    ghTherapyBroadcastChannel.addEventListener('message', handleGHTherapyBroadcastMessage);
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 3212 });
    }
  }
  registerGHTherapyBroadcastChannelLifecycleCleanup();
}

// =======================================================================
//  Tooltip helper for disabled menu items
//
//  Aby uniknąć pełnoekranowych okien alert, które przerywają działanie
//  aplikacji, tworzymy niestandardowy tooltip.  Funkcja showTooltip()
//  wyświetla niewielką etykietę z wiadomością obok wskazanego elementu.
//  Tooltip znika automatycznie po kilku sekundach.  Dzięki temu
//  użytkownik otrzymuje natychmiastową informację, dlaczego przycisk
//  jest nieaktywny, bez przerywania pracy całej strony.
let __menuTooltip = null;
function showTooltip(target, message) {
  if (!target || !message) return;
  // Usuń poprzedni tooltip, jeśli istnieje
  if (__menuTooltip) {
    __menuTooltip.remove();
    __menuTooltip = null;
  }
  const tooltip = document.createElement('div');
  tooltip.className = 'menu-tooltip';
  tooltip.textContent = message;
  document.body.appendChild(tooltip);
  // Ustaw pozycję: obok (na prawo) wskazanego elementu, aby nie zasłaniać menu
  const rect = target.getBoundingClientRect();
  const scrollY = window.pageYOffset || document.documentElement.scrollTop;
  const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
  // Oblicz podstawową pozycję: po prawej stronie elementu i na wysokości jego górnej krawędzi
  let left = rect.right + scrollX + 8;
  let top = rect.top + scrollY;
  // Pobierz wymiary tooltipu (wymaga, aby tooltip był już wstawiony do DOM)
  const tooltipRect = { width: tooltip.offsetWidth, height: tooltip.offsetHeight };
  // Jeśli tooltip wyjdzie poza prawą krawędź ekranu, dostosuj lewą pozycję tak, aby pozostał widoczny
  if (left + tooltipRect.width > window.innerWidth) {
    left = Math.max(scrollX, window.innerWidth - tooltipRect.width - 10);
  }
  // Jeśli tooltip wyjdzie poza dolną krawędź okna, przesuń go w górę
  if (top + tooltipRect.height > window.innerHeight + scrollY) {
    top = Math.max(scrollY, window.innerHeight + scrollY - tooltipRect.height - 10);
  }
  tooltip.style.top = `${top}px`;
  tooltip.style.left = `${left}px`;
  // Ustaw pełną widoczność
  requestAnimationFrame(() => {
    tooltip.style.opacity = '1';
  });
  __menuTooltip = tooltip;
  // Automatyczne ukrycie po 3 sekundach
  setTimeout(() => {
    if (__menuTooltip) {
      __menuTooltip.style.opacity = '0';
      // Usuń tooltip po zakończeniu animacji zanikania
      setTimeout(() => {
        if (__menuTooltip) {
          __menuTooltip.remove();
          __menuTooltip = null;
        }
      }, 200);
    }
  }, 2500);
}

// -----------------------------------------------------------------------------
// Globalna zmienna kontrolująca tryb wyświetlania wyników
// professionalMode = true  ➔ tryb profesjonalny: wyświetla Z‑score dla wagi,
//                           wzrostu i BMI
// professionalMode = false ➔ tryb standardowy: ukrywa te wartości
//
// Architektura (krok PRO-0+):
//   Wartość jest ustawiana przez initResultsModeToggle() na podstawie
//   window.VildaProAccess.hasAccess() — NIE przez bezpośredni odczyt z localStorage.
//   Przełącznik resultsModeToggle jest blokowany jeśli VildaProAccess nie daje dostępu.
//   W PRO-3+ hasAccess() sprawdzi status subskrypcji z VildaVault/VildaSync.
let professionalMode = false;

function dispatchResultsModeSyncEvent(isProfessional) {
  const detail = { professional: !!isProfessional };
  try {
    document.dispatchEvent(new CustomEvent('vildaResultsModeChanged', { detail }));
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 3291 });
    }
  }
  try {
    window.dispatchEvent(new CustomEvent('vildaResultsModeChanged', { detail }));
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 3294 });
    }
  }
}

function readResultsModeStorage(){
  try {
    if (typeof window !== 'undefined' && window.VildaPersistence && typeof window.VildaPersistence.readPreferenceRaw === 'function') {
      return window.VildaPersistence.readPreferenceRaw('RESULTS_MODE', 'standard') || 'standard';
    }
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 3302 });
    }
  }
  return 'standard';
}

function writeResultsModeStorage(mode){
  const value = mode === 'professional' ? 'professional' : 'standard';
  try {
    if (typeof window !== 'undefined' && window.VildaPersistence && typeof window.VildaPersistence.writePreferenceRaw === 'function') {
      return window.VildaPersistence.writePreferenceRaw('RESULTS_MODE', value, { force: true });
    }
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 3312 });
    }
  }
  return false;
}

/*
 * Global setting controlling the pulsation duration for warning/danger frames.
 * Possible values:
 *   'off'      – no pulsation; frames remain in their color without animation
 *   '3s'       – pulsation lasts 3 seconds
 *   '5s'       – pulsation lasts 5 seconds
 *   '7s'       – pulsation lasts 7 seconds
 *   '10s'      – pulsation lasts 10 seconds
 *   'infinite' – pulsation continues indefinitely
 * (The legacy value '2s' is still recognised for backward compatibility.)
 * The value is read from localStorage (key 'pulseDurationMode') on page load and
 * can be changed via settings. Default is 'infinite'.
 */
window.PULSE_MODE = 'infinite';

/**
 * Kontrola dostępu PRO i źródeł danych wzrastania została wydzielona do
 * vilda_advanced_growth.js w kroku 8O-4. Poniższe wrappery zachowują dostęp
 * do lokalnych zmiennych app.js (`professionalMode`, `bmiSource`) i utrzymują
 * dotychczasowe globalne API.
 */
function getVildaAdvancedGrowthSourceOptions(options = {}) {
  return Object.assign({
    olafDataMinAge: (typeof OLAF_DATA_MIN_AGE !== 'undefined') ? OLAF_DATA_MIN_AGE : 3,
    getProfessionalMode: function () {
      try {
        const toggle = document.getElementById('resultsModeToggle');
        if (toggle) return !!toggle.checked;
      } catch (_) {
        if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
          globalThis.vildaLogSwallowedCatch('app.js', _, { module: 'advanced-growth:source-options:professional-toggle' });
        }
      }
      try {
        if (typeof window !== 'undefined' && typeof window.professionalMode !== 'undefined') return !!window.professionalMode;
      } catch (_) {
        if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
          globalThis.vildaLogSwallowedCatch('app.js', _, { module: 'advanced-growth:source-options:professional-global' });
        }
      }
      try {
        if (typeof professionalMode !== 'undefined') return !!professionalMode;
      } catch (_) {
        if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
          globalThis.vildaLogSwallowedCatch('app.js', _, { module: 'advanced-growth:source-options:professional-local' });
        }
      }
      try { return readResultsModeStorage() === 'professional'; } catch (_) { return false; }
    },
    getBmiSource: function () {
      try { return (typeof bmiSource !== 'undefined' && bmiSource) ? bmiSource : 'OLAF'; } catch (_) { return 'OLAF'; }
    },
    setBmiSource: function (source) {
      const normalized = ['PALCZEWSKA', 'OLAF', 'WHO'].includes(String(source || '').toUpperCase()) ? String(source || '').toUpperCase() : 'OLAF';
      try { bmiSource = normalized; } catch (_) {
        if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
          globalThis.vildaLogSwallowedCatch('app.js', _, { module: 'advanced-growth:source-options:set-bmi-source' });
        }
      }
      try { if (typeof window !== 'undefined') window.bmiSource = normalized; } catch (_) {}
      return normalized;
    },
    updateAdvancedMeasurementAnalysisControls: function (forceHide) {
      if (typeof updateAdvancedMeasurementAnalysisControls === 'function') {
        return updateAdvancedMeasurementAnalysisControls(forceHide);
      }
      return undefined;
    },
    hooks: {
      updateCentileButtons: (typeof window !== 'undefined') ? window.updateCentileButtons : null,
      updateAdvancedCentileChartButton: (typeof window !== 'undefined') ? window.updateAdvancedCentileChartButton : null,
      updatePublicationToggleVisibility: (typeof window !== 'undefined') ? window.updatePublicationToggleVisibility : null
    }
  }, options || {});
}

function updateAdvancedGrowthAccess(options) {
  const adapter = getVildaAdvancedGrowthAdapter();
  if (adapter && typeof adapter.updateAdvancedGrowthAccess === 'function') {
    return adapter.updateAdvancedGrowthAccess(getVildaAdvancedGrowthSourceOptions(options || {}));
  }
  if (typeof vildaLogAppWarn === 'function') {
    vildaLogAppWarn('app:advanced-growth-access', 'Brak VildaAdvancedGrowth.updateAdvancedGrowthAccess().');
  }
  return undefined;
}

function getGrowthDataSourceAgeYears(options) {
  const adapter = getVildaAdvancedGrowthAdapter();
  if (adapter && typeof adapter.getGrowthDataSourceAgeYears === 'function') {
    return adapter.getGrowthDataSourceAgeYears(getVildaAdvancedGrowthSourceOptions(options || {}));
  }
  const ageInput = document.getElementById('age');
  const monthsInput = document.getElementById('ageMonths');
  const yearsVal = parseFloat(ageInput?.value);
  const monthsVal = parseFloat(monthsInput?.value);
  const years = Number.isFinite(yearsVal) ? yearsVal : 0;
  const months = Number.isFinite(monthsVal) ? monthsVal : 0;
  return years + (months / 12);
}

function isGrowthResultsProfessionalMode(options) {
  const adapter = getVildaAdvancedGrowthAdapter();
  if (adapter && typeof adapter.isGrowthResultsProfessionalMode === 'function') {
    return adapter.isGrowthResultsProfessionalMode(getVildaAdvancedGrowthSourceOptions(options || {}));
  }
  try {
    const toggle = document.getElementById('resultsModeToggle');
    if (toggle) return !!toggle.checked;
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { module: 'advanced-growth:pro-mode-fallback' });
    }
  }
  try {
    if (typeof window !== 'undefined' && typeof window.professionalMode !== 'undefined') return !!window.professionalMode;
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { module: 'advanced-growth:pro-mode-global-fallback' });
    }
  }
  try { if (typeof professionalMode !== 'undefined') return !!professionalMode; } catch (_) {}
  return false;
}

function normalizeGrowthDataSource(source) {
  const adapter = getVildaAdvancedGrowthAdapter();
  if (adapter && typeof adapter.normalizeGrowthDataSource === 'function') {
    return adapter.normalizeGrowthDataSource(source);
  }
  const selectedSource = String(source || '').toUpperCase();
  return ['PALCZEWSKA', 'OLAF', 'WHO'].includes(selectedSource) ? selectedSource : '';
}

function isGrowthDataSourceAllowed(source, ageYears, proMode) {
  const adapter = getVildaAdvancedGrowthAdapter();
  if (adapter && typeof adapter.isGrowthDataSourceAllowed === 'function') {
    return adapter.isGrowthDataSourceAllowed(source, ageYears, proMode, getVildaAdvancedGrowthSourceOptions());
  }
  const src = normalizeGrowthDataSource(source);
  const age = Number.isFinite(ageYears) ? ageYears : 0;
  const pro = !!proMode;
  if (src === 'PALCZEWSKA') return pro && age < 18;
  if (src === 'OLAF') return age >= ((typeof OLAF_DATA_MIN_AGE !== 'undefined') ? OLAF_DATA_MIN_AGE : 3) && age < 18;
  if (src === 'WHO') return age < 18;
  return false;
}

function getDefaultGrowthDataSource(ageYears, proMode) {
  const adapter = getVildaAdvancedGrowthAdapter();
  if (adapter && typeof adapter.getDefaultGrowthDataSource === 'function') {
    return adapter.getDefaultGrowthDataSource(ageYears, proMode, getVildaAdvancedGrowthSourceOptions());
  }
  if (!Number.isFinite(ageYears)) return 'OLAF';
  const age = ageYears;
  const pro = !!proMode;
  if (!(age < 18)) return 'WHO';
  if (age < ((typeof OLAF_DATA_MIN_AGE !== 'undefined') ? OLAF_DATA_MIN_AGE : 3)) return pro ? 'PALCZEWSKA' : 'WHO';
  return 'OLAF';
}

function setCheckedGrowthDataSource(source) {
  const adapter = getVildaAdvancedGrowthAdapter();
  if (adapter && typeof adapter.setCheckedGrowthDataSource === 'function') {
    return adapter.setCheckedGrowthDataSource(source, getVildaAdvancedGrowthSourceOptions());
  }
  const selectedSource = normalizeGrowthDataSource(source) || 'OLAF';
  try { bmiSource = selectedSource; } catch (_) {}
  return selectedSource;
}

function rememberManualGrowthDataSource(source, options) {
  const adapter = getVildaAdvancedGrowthAdapter();
  if (adapter && typeof adapter.rememberManualGrowthDataSource === 'function') {
    return adapter.rememberManualGrowthDataSource(source, getVildaAdvancedGrowthSourceOptions(options || {}));
  }
  return normalizeGrowthDataSource(source);
}

function refreshGrowthChartActionControls(options) {
  const adapter = getVildaAdvancedGrowthAdapter();
  if (adapter && typeof adapter.refreshGrowthChartActionControls === 'function') {
    return adapter.refreshGrowthChartActionControls(getVildaAdvancedGrowthSourceOptions(options || {}));
  }
  return undefined;
}

function syncGrowthDataSourceInputs(options = {}) {
  const adapter = getVildaAdvancedGrowthAdapter();
  if (adapter && typeof adapter.syncGrowthDataSourceInputs === 'function') {
    return adapter.syncGrowthDataSourceInputs(getVildaAdvancedGrowthSourceOptions(options || {}));
  }
  return (typeof bmiSource !== 'undefined' && bmiSource) ? bmiSource : 'OLAF';
}

if (typeof window !== 'undefined') {
  window.getDefaultGrowthDataSource = getDefaultGrowthDataSource;
  window.isGrowthDataSourceAllowed = isGrowthDataSourceAllowed;
  window.syncGrowthDataSourceInputs = syncGrowthDataSourceInputs;
  window.normalizeGrowthDataSource = normalizeGrowthDataSource;
  window.setCheckedGrowthDataSource = setCheckedGrowthDataSource;
  window.rememberManualGrowthDataSource = rememberManualGrowthDataSource;
  window.refreshGrowthChartActionControls = refreshGrowthChartActionControls;
  window.updateAdvancedGrowthAccess = updateAdvancedGrowthAccess;
}

function updatePalczewskaAccess(options) {
  const adapter = getVildaAdvancedGrowthAdapter();
  if (adapter && typeof adapter.updatePalczewskaAccess === 'function') {
    return adapter.updatePalczewskaAccess(getVildaAdvancedGrowthSourceOptions(options || {}));
  }
  try { return syncGrowthDataSourceInputs(options || {}); } catch (_) { return 'WHO'; }
}

function updateGrowthDataSourceControls(context, options) {
  const adapter = getVildaAdvancedGrowthAdapter();
  if (adapter && typeof adapter.updateGrowthDataSourceControls === 'function') {
    const mergedOptions = getVildaAdvancedGrowthSourceOptions(options || {});
    if (!mergedOptions.markSection && typeof window !== 'undefined' && window.VildaUpdatePrep && typeof window.VildaUpdatePrep.markSection === 'function') {
      mergedOptions.markSection = window.VildaUpdatePrep.markSection;
    }
    return adapter.updateGrowthDataSourceControls(context, mergedOptions);
  }
  return { action: 'skipped', reason: 'missing-vilda-advanced-growth' };
}

/**
 * Aktualizuje widoczność instrukcji w prawej kolumnie (#compareInstruction) w zależności od trybu wyników.
 *
 * Gdy włączony jest tryb profesjonalny (wyniki profesjonalne), instrukcja jest ukrywana, aby
 * nie pojawiała się zbędna informacja o wprowadzeniu wymaganych pól.  W trybie standardowym
 * instrukcja jest przywracana zgodnie z domyślną logiką: jeżeli wczytano poprzedni pomiar
 * lub ustawiono globalną flagę forceHideCompareInstruction, pozostaje ukryta; w przeciwnym
 * razie przywracamy jej domyślną treść i pokazujemy ją użytkownikowi.
 */
function updateCompareInstructionVisibility() {
  try {
    const ci = document.getElementById('compareInstruction');
    if (!ci) return;
    // Ustal tryb profesjonalny na podstawie suwaka lub globalnej zmiennej
    let pro = false;
    try {
      const toggle = document.getElementById('resultsModeToggle');
      if (toggle) {
        pro = !!toggle.checked;
      } else if (typeof window !== 'undefined' && typeof window.professionalMode !== 'undefined') {
        pro = !!window.professionalMode;
      }
    } catch (_) {
      pro = (typeof window !== 'undefined' && window.professionalMode);
    }
    // W trybie profesjonalnym zawsze ukrywamy instrukcję
    if (pro) {
      ci.style.display = 'none';
      return;
    }
    // Tryb standardowy: oceń, czy instrukcja powinna być ukryta z innych powodów
    let forceHide = false;
    try {
      forceHide = (typeof window !== 'undefined' && window.forceHideCompareInstruction);
    } catch (_) {
      forceHide = false;
    }
    if (forceHide) {
      ci.style.display = 'none';
      return;
    }
    // Sprawdź, czy wczytano poprzednie dane pomiaru
    let hasLoaded = false;
    try {
      const wrap = document.getElementById('prevSummaryWrap');
      const card = document.getElementById('prevSummaryCard');
      hasLoaded = (card && card.dataset && card.dataset.loaded === 'true') ||
                  (wrap && wrap.dataset && wrap.dataset.loaded === 'true');
    } catch (_) {
      hasLoaded = false;
    }
    if (hasLoaded) {
      ci.style.display = 'none';
    } else {
      // Przywróć domyślną treść instrukcji, jeśli została zapisana
      if (Array.isArray(defaultCompareInstructionNodes) && defaultCompareInstructionNodes.length) {
        vildaAppRestoreClonedChildren(ci, defaultCompareInstructionNodes, 'app:compare-instruction');
      }
      ci.style.display = 'block';
    }
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 3633 });
    }
  }
}


// === Komunikaty po wczytaniu danych ===
// Funkcje odpowiedzialne za pokazywanie i ukrywanie informacji, że dane
// z pliku JSON zostały pomyślnie załadowane. Zdefiniowany w HTML
// element #loadDataMessage jest domyślnie ukryty; po wczytaniu danych
// jest ustawiany na widoczny. Gdy użytkownik zaczyna wpisywać nowe dane
// lub czyści formularz, komunikat jest ukrywany ponownie.
// Zachowujemy domyślną treść komunikatu z prawej kolumny w zmiennej globalnej.
// Dzięki temu możemy przywrócić pierwotny tekst, gdy użytkownik zacznie nową sesję
// (np. po wyczyszczeniu danych).  Zmienna ta jest ustawiana raz podczas
// ładowania DOM w funkcji initDefaultCompareInstruction().
let defaultCompareInstructionNodes = null;

/**
 * Globalna flaga wymuszająca ukrycie etykiety instrukcji w prawej kolumnie (#compareInstruction).
 *
 * W standardowym działaniu aplikacji etykieta z instrukcją pojawia się, gdy użytkownik nie ma
 * załadowanego poprzedniego pomiaru i powinien uzupełnić wymagane pola, aby móc zapisać dane.
 * Jednak w sytuacjach takich jak wczytanie pliku JSON z danymi lub przywrócenie zapisanego stanu
 * z przycisku „Przywróć zapisany stan” wymagane jest, aby etykieta pozostała ukryta – użytkownik
 * ma już wszystkie wymagane dane wprowadzone, a instrukcja byłaby myląca.  Ustawienie tej flagi
 * na `true` blokuje ponowne wyświetlenie instrukcji nawet wtedy, gdy hideLoadDataMessage()
 * oceni, że nie ma wczytanego poprzedniego pomiaru.  Flaga powinna być resetowana do `false`
 * gdy rozpoczyna się nowa sesja (np. po wyczyszczeniu danych lub przy pierwszej edycji po
 * wczytaniu danych), aby umożliwić ponowne pojawienie się instrukcji zgodnie z naturalnym
 * przepływem aplikacji.
 */
try {
  if (typeof window !== 'undefined') {
    window.forceHideCompareInstruction = false;
  }
} catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 3669 });
    }
  }

/**
 * Inicjalizuje domyślne brzmienie komunikatu w kolumnie prawej (#compareInstruction).
 * Funkcja zapisuje aktualne węzły DOM tego elementu w zmiennej globalnej
 * defaultCompareInstructionNodes.  Jest wywoływana raz po załadowaniu DOM.
 */
function initDefaultCompareInstruction() {
  try {
    const ci = document.getElementById('compareInstruction');
    if (ci && !defaultCompareInstructionNodes) {
      defaultCompareInstructionNodes = ci.childNodes ? Array.prototype.slice.call(ci.childNodes).map(function (node) {
        return node.cloneNode(true);
      }) : [];
    }
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 3682 });
    }
  }
}

// Zapisz domyślną treść komunikatu w prawej kolumnie po załadowaniu DOM.  
// Używamy tego, aby móc przywrócić instrukcję podczas rozpoczęcia nowej sesji.
if (typeof window !== 'undefined' && typeof window.vildaAppOnReady === 'function') {
  window.vildaAppOnReady('app:default-compare-instruction', initDefaultCompareInstruction);
}

function showLoadDataMessage(){
  // Przy wczytaniu danych ukryj oryginalny komunikat w sekcji formularza,
  // ponieważ tekst zostanie przeniesiony do karty "Ostatni pomiar".
  const loadEl = document.getElementById('loadDataMessage');
  if (loadEl) loadEl.style.display = 'none';
  // Ukryj instrukcję w prawej kolumnie, aby nie dublować komunikatu.  Zgodnie
  // z wymaganiami użytkownika, komunikat o udanym wczytaniu danych powinien
  // pojawić się wewnątrz karty "Ostatni pomiar", nie obok formularza.
  const ci = document.getElementById('compareInstruction');
  if (ci) {
    try {
      // Ukryj link do wideo instruktażowego, aby nie był widoczny wraz z komunikatem.
      const link = ci.querySelector('#tutorialVideoLink');
      if (link && link.style) link.style.display = 'none';
      // Schowaj cały element instrukcji. Nie modyfikujemy jego zawartości,
      // aby móc przywrócić ją później.
      ci.style.display = 'none';
      // Ustaw globalną flagę wymuszającą ukrycie instrukcji.  Dzięki temu
      // hideLoadDataMessage() nie przywróci instrukcji, dopóki flaga nie zostanie
      // zresetowana (np. podczas nowej sesji lub po edycji danych).
      try {
        if (typeof window !== 'undefined') {
          window.forceHideCompareInstruction = true;
        }
      } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 3717 });
    }
  }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 3718 });
    }
  }
  }
  // Umieść komunikat na dole karty "Ostatni pomiar".  Jeśli element
  // nie istnieje (np. karta nie została jeszcze wyrenderowana), pomiń operację.
  const msgEl = document.getElementById('prevSummaryMessage');
  if (msgEl) {
    msgEl.innerText = 'Dane zostały wczytane prawidłowo. Wprowadź aktualną wagę, wzrost i wiek aby zobaczyć porównanie wyników.';
    msgEl.style.display = 'block';
  }
  // Ukryj komunikat o błędzie/braku danych
  const eb = document.getElementById('errorBox');
  if (eb) eb.style.display = 'none';
}
function hideLoadDataMessage(){
  // Ukryj komunikat w sekcji formularza
  const loadEl = document.getElementById('loadDataMessage');
  if (loadEl) loadEl.style.display = 'none';
  // Ukryj komunikat wewnątrz karty "Ostatni pomiar", jeśli istnieje.  
  // Gdy użytkownik zaczyna wprowadzać nowe dane, komunikat o udanym wczytaniu
  // danych powinien zniknąć również z tej karty.
  const msgEl = document.getElementById('prevSummaryMessage');
  if (msgEl) msgEl.style.display = 'none';
  // Przywróć treść i widoczność komunikatu w prawej kolumnie w zależności
  // od tego, czy zostały wczytane dane historyczne.  Jeżeli odczytaliśmy
  // pomiar z pliku (prevSummaryCard/Wrap ma atrybut loaded), instrukcja
  // pozostaje ukryta – pokazują się tam porównania.  W przeciwnym razie
  // przywracamy domyślną treść, aby poinformować użytkownika, że powinien
  // wprowadzić wymagane pola.
  const ci = document.getElementById('compareInstruction');
  if (ci) {
    // Sprawdź, czy wymuszone ukrycie instrukcji jest aktywne (np. po wczytaniu danych
    // lub przywróceniu stanu).  Jeśli tak, ukryj etykietę niezależnie od stanu
    // poprzedniego pomiaru.  W przeciwnym razie oceń, czy istnieje wczytany pomiar i
    // odpowiednio wyświetl lub ukryj instrukcję.
    let forceHide = false;
    try {
      forceHide = (typeof window !== 'undefined' && window.forceHideCompareInstruction);
    } catch (_) {
      forceHide = false;
    }
    if (forceHide) {
      ci.style.display = 'none';
    } else {
      let hasLoaded = false;
      try {
        const wrap = document.getElementById('prevSummaryWrap');
        const card = document.getElementById('prevSummaryCard');
        hasLoaded = (card && card.dataset && card.dataset.loaded === 'true') ||
                    (wrap && wrap.dataset && wrap.dataset.loaded === 'true');
      } catch (_) {
        hasLoaded = false;
      }
      if (hasLoaded) {
        ci.style.display = 'none';
      } else {
        // Przywróć oryginalną treść instrukcji, jeśli została zapisana
        if (Array.isArray(defaultCompareInstructionNodes) && defaultCompareInstructionNodes.length) {
          vildaAppRestoreClonedChildren(ci, defaultCompareInstructionNodes, 'app:compare-instruction');
        }
        ci.style.display = 'block';
      }
    }
  }
  // Po dostosowaniu treści instrukcji na podstawie wczytanych danych
  // dodatkowo zaktualizuj jej widoczność zależnie od trybu profesjonalnego.
  if (typeof updateCompareInstructionVisibility === 'function') {
    try {
      updateCompareInstructionVisibility();
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 3788 });
    }
  }
  }
}

/*
 * Oblicza wiek użytkownika jako liczbę lat z uwzględnieniem miesięcy.
 * Pobiera wartości z pól formularza: #age (lata) oraz opcjonalnie #ageMonths (miesiące).
 * Zwraca sumę lat oraz miesięcy/12. Jeśli pole miesięcy jest puste lub nie istnieje,
 * przyjmuje wartość 0. Wartości nieprawidłowe (puste, NaN) są traktowane jako 0.
 *
 * Funkcja ta jest używana w całej aplikacji do dokładniejszych obliczeń
 * zależnych od wieku (centyle, dawki leków, rekomendacje diet itp.).
 */
function getAgeDecimal(){
  const yearsInput  = document.getElementById('age');
  const monthsInput = document.getElementById('ageMonths');
  const years  = yearsInput  ? parseFloat(yearsInput.value)  || 0 : 0;
  const months = monthsInput ? parseFloat(monthsInput.value) || 0 : 0;
  // Zapewniamy, że miesiące mieszczą się w przedziale 0–11.
  const m = Math.max(0, Math.min(11, months));
  return years + m / 12;
}
try { window.getAgeDecimal = getAgeDecimal; } catch (_) {
  if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
    globalThis.vildaLogSwallowedCatch('app.js', _, { line: 3812 });
  }
}

function vildaToFiniteNumber(value){
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = String(value).trim();
  if (raw === '') return null;
  const normalized = raw.replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function vildaIsFinitePositive(value){
  const n = vildaToFiniteNumber(value);
  return n !== null && n > 0;
}

function vildaIsFiniteNonNegative(value){
  const n = vildaToFiniteNumber(value);
  return n !== null && n >= 0;
}

function vildaReadNumericInputState(idOrElement){
  const el = (typeof idOrElement === 'string')
    ? document.getElementById(idOrElement)
    : idOrElement;
  const id = (typeof idOrElement === 'string') ? idOrElement : (el && el.id ? el.id : null);
  const raw = el && typeof el.value !== 'undefined' ? String(el.value).trim() : '';
  const value = vildaToFiniteNumber(raw);
  return {
    id,
    present: !!el,
    raw,
    hasRawValue: raw !== '',
    value,
    finite: value !== null,
    positive: value !== null && value > 0,
    nonNegative: value !== null && value >= 0
  };
}

function vildaGetMainAgeInputState(){
  const yearsState = vildaReadNumericInputState('age');
  const monthsState = vildaReadNumericInputState('ageMonths');
  let ageValue = null;
  try {
    ageValue = (typeof getAgeDecimal === 'function') ? Number(getAgeDecimal()) : null;
  } catch (_) {
    ageValue = null;
  }
  if (!Number.isFinite(ageValue)) {
    const years = yearsState.finite ? yearsState.value : 0;
    const months = monthsState.finite ? Math.max(0, Math.min(11, monthsState.value)) : 0;
    ageValue = years + months / 12;
  }
  const hasExplicitInput = yearsState.finite || monthsState.finite;
  const finite = Number.isFinite(ageValue);
  const validNonNegative = hasExplicitInput && finite && ageValue >= 0 && ageValue <= 130;
  return {
    id: 'age+ageMonths',
    value: finite ? ageValue : null,
    finite,
    hasExplicitInput,
    validNonNegative,
    isZeroAge: validNonNegative && ageValue === 0,
    years: yearsState,
    months: monthsState
  };
}

function vildaHasExplicitMainAgeInput(){
  return !!vildaGetMainAgeInputState().hasExplicitInput;
}

function vildaGetMainAnthroValidationSnapshot(){
  const age = vildaGetMainAgeInputState();
  const weight = vildaReadNumericInputState('weight');
  const height = vildaReadNumericInputState('height');
  const complete = !!(age.validNonNegative && weight.positive && height.positive);
  return {
    step: '8O-10a',
    readOnly: true,
    age,
    weight,
    height,
    complete,
    acceptsZeroAge: age.isZeroAge === true,
    validationRules: {
      age: 'finite, explicit and >= 0',
      weight: 'finite and > 0',
      height: 'finite and > 0'
    }
  };
}

function vildaGetNumericValidationAuditSnapshot(){
  const mainAnthro = vildaGetMainAnthroValidationSnapshot();
  return {
    kind: 'numeric-validation-age-zero-audit',
    step: '8O-10a',
    readOnly: true,
    mainAnthro,
    api: {
      vildaToFiniteNumber: typeof vildaToFiniteNumber === 'function',
      vildaIsFinitePositive: typeof vildaIsFinitePositive === 'function',
      vildaIsFiniteNonNegative: typeof vildaIsFiniteNonNegative === 'function',
      vildaReadNumericInputState: typeof vildaReadNumericInputState === 'function',
      vildaGetMainAgeInputState: typeof vildaGetMainAgeInputState === 'function',
      vildaGetMainAnthroValidationSnapshot: typeof vildaGetMainAnthroValidationSnapshot === 'function'
    }
  };
}

try {
  window.vildaToFiniteNumber = vildaToFiniteNumber;
  window.vildaIsFinitePositive = vildaIsFinitePositive;
  window.vildaIsFiniteNonNegative = vildaIsFiniteNonNegative;
  window.vildaReadNumericInputState = vildaReadNumericInputState;
  window.vildaGetMainAgeInputState = vildaGetMainAgeInputState;
  window.vildaHasExplicitMainAgeInput = vildaHasExplicitMainAgeInput;
  window.vildaGetMainAnthroValidationSnapshot = vildaGetMainAnthroValidationSnapshot;
  window.vildaGetNumericValidationAuditSnapshot = vildaGetNumericValidationAuditSnapshot;
} catch (_) {
  if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
    globalThis.vildaLogSwallowedCatch('app.js', _, { step: '8O-10a', helper: 'numeric-validation-api-export' });
  }
}

// Szczegółowe informacje o dietach w postaci wypunktowanej.
// Każdy element tablicy zaczyna się małą literą i wyjaśnia najważniejsze aspekty danej diety.
/* === DIET PLAN UI / PAL HELPERS moved to vilda_diet_plan_ui.js in step 8Q-5 === */

// === PULSE ANIMATION HELPERS ======================================
// Global variable controlling pulse mode: 'infinite' for continuous pulses or '2s' for single 2s flash.
// Default is continuous pulses.
window.PULSE_MODE = window.PULSE_MODE || 'infinite';

/**
 * Returns the CSS class for the given level ('danger' or 'warning') and current PULSE_MODE.
 * @param {string} level - 'danger' for red pulses, 'warning' for orange pulses.
 */
function pulseModeClass(level) {
  // Determine the appropriate pulse class based on the global PULSE_MODE.
  // For 'off' we return an empty string (no pulsation). For time‑limited
  // durations (3s, 5s, 7s, 10s) and 'infinite' we use the
  // existing infinite class.  The legacy value '2s' uses a separate CSS
  // class but is no longer exposed in the settings.  For durations other
  // than 2 seconds we reuse the infinite animation and stop it via
  // JavaScript after the specified time.
  const mode = window.PULSE_MODE || 'infinite';
  if (mode === 'off') {
    return '';
  }
  let suffix;
  if (mode === '2s') {
    suffix = '2s';
  } else {
    // For '3s','5s','7s','10s' and 'infinite', use the infinite CSS class
    suffix = 'infinite';
  }
  return (level === 'danger') ? `pulse-danger-${suffix}` : `pulse-warning-${suffix}`;
}

/**
 * Clears any pulse classes from the element.
 * @param {HTMLElement} el
 */
function clearPulse(el) {
  if (!el) return;
  el.classList.remove('pulse-danger-infinite','pulse-warning-infinite','pulse-danger-2s','pulse-warning-2s');
}

/**
 * Applies the appropriate pulse class to the element based on the severity level.
 * Automatically clears other pulse classes before applying.
 * @param {HTMLElement} el
 * @param {string} level - 'danger' (red) or 'warning' (orange).
 */
function applyPulse(el, level) {
  if (!el) return;
  // Always clear existing pulse classes
  clearPulse(el);
  // Determine current pulse mode
  const mode = window.PULSE_MODE || 'infinite';
  // If pulsation is disabled, do not apply any animation
  if (mode === 'off') return;
  // Respect system reduced-motion preferences for non-critical pulse effects.
  // Selected warning containers remain allowlisted because their CSS already
  // keeps the visual warning visible in this mode.
  if (!vildaShouldApplyPulseMotion(el)) return;
  const cls = pulseModeClass(level);
  if (!cls) return;
  el.classList.add(cls);
  // Handle time‑limited pulsations: schedule removal after the specified duration.
  // Durations other than 'infinite' share the same CSS class; we stop the
  // animation via JavaScript after the appropriate time.
  const msMap = {
    '2s': 2000,
    '3s': 3000,
    '5s': 5000,
    '7s': 7000,
    '10s': 10000
  };
  if (mode !== 'infinite' && msMap[mode]) {
    // Cancel any previous timeout on this element
    if (el._pulseTimeout) {
      clearTimeout(el._pulseTimeout);
    }
    el._pulseTimeout = setTimeout(() => {
      clearPulse(el);
      el._pulseTimeout = null;
    }, msMap[mode]);
  }
}

/**
 * Dodaje lub usuwa pulsujące nakładki w trybie profesjonalnym dla pól wagi/wzrostu
 * oraz BMI. Nakładka powiela logikę koloru i animacji z pola wskaźnika Cole’a:
 * kolor ciemnopomarańczowy (warning) i pulsowanie, gdy BMI to „Nadwaga”,
 * lub waga/wzrost mieszczą się w przedziałach (3,10) albo [90,97);
 * kolor czerwony (danger) i pulsowanie, gdy BMI to „Otyłość” bądź waga
 * lub wzrost są ≤3 centyla lub ≥97 centyla.  Funkcja dba również o ukrycie
 * oryginalnej turkusowej ramki, aby nie przebijała spod nakładki. Przy wyłączeniu
 * trybu profesjonalnego lub braku warunków ostrzegawczych, nakładki są
 * usuwane, a ramki przywracane.
 *
 * @param {?number} weightPerc – percentyl wagi (0–100) lub null jeśli brak danych
 * @param {?number} heightPerc – percentyl wzrostu (0–100) lub null jeśli brak danych
 * @param {?string} bmiCat – kategoria BMI (np. „W normie”, „Nadwaga”, „Otyłość”, „Niedowaga”)
 * @param {?number} bmiPerc – percentyl BMI (0–100) lub null, jeśli brak danych
 * @param {boolean} proMode – true, jeśli włączony jest tryb profesjonalny
 */
function applyProModePulse(weightPerc, heightPerc, bmiCat, bmiPerc, proMode) {
  // Pomocnicza funkcja usuwająca nakładkę i przywracająca stan ramki
  function removeOverlay(container) {
    if (!container) return;
    const existing = container.querySelector('.pro-overlay');
    if (existing) existing.remove();
    // Przywróć oryginalne overflow, jeśli zostało zmienione po dodaniu nakładki
    if (container._prevOverflow !== undefined) {
      container.style.overflow = container._prevOverflow;
      delete container._prevOverflow;
    }
    // Przywróć oryginalną ramkę, jeśli była ukryta
    container.classList.remove('pro-hidden-border');
    // Przywróć poprzednie ustawienie position, jeśli zostało zmienione
    if (container._prevPosition !== undefined) {
      container.style.position = container._prevPosition;
      delete container._prevPosition;
    }
  }
  // Pomocnicza funkcja dodająca nakładkę o określonej powadze (warning/danger)
  function addOverlay(container, severity) {
    if (!container || !severity) return;
    const overlay = document.createElement('div');
    overlay.className = 'pro-overlay';
    // Nadaj klasę koloru (używamy tych samych nazw co w BMI: bmi-warning / bmi-danger)
    if (severity === 'warning') {
      overlay.classList.add('bmi-warning');
    } else if (severity === 'danger') {
      overlay.classList.add('bmi-danger');
    }
    container.appendChild(overlay);
    // Zapamiętaj bieżące ustawienie overflow i ustaw na 'visible' –
    // kontenery wyników często mają overflow:hidden (np. .result-card),
    // co ukrywa pulsujące pierścienie.  Po usunięciu nakładki overflow jest
    // przywracane.
    if (container._prevOverflow === undefined) {
      container._prevOverflow = container.style.overflow || '';
    }
    container.style.overflow = 'visible';
    // Zapamiętaj i ustaw position na relative, aby absolutnie pozycjonowana nakładka
    // była pozycjonowana względem kontenera. Dotyczy to elementów, które mają
    // domyślne position: static (np. .result-box).  Nie nadpisujemy, jeśli już
    // ustawiono inną wartość.
    const computedPos = window.getComputedStyle(container).position;
    if (computedPos === 'static' && container._prevPosition === undefined) {
      container._prevPosition = container.style.position || '';
      container.style.position = 'relative';
    }
    // Ukryj bazową turkusową ramkę na czas pulsowania
    container.classList.add('pro-hidden-border');
    // Zastosuj klasę animacji pulsowania na nakładce
    applyPulse(overlay, severity);
  }
  // Jeżeli tryb PRO jest wyłączony, usuń wszystkie nakładki i wyjdź
  if (!proMode) {
    const whContainer = document.getElementById('whResult');
    const bmiContainer = document.getElementById('bmiResult');
    removeOverlay(whContainer);
    removeOverlay(bmiContainer);
    return;
  }
  // Wyznacz powagę (severity) dla wagi/wzrostu oraz BMI na podstawie percentyli
  let whSeverity = null;
  let bmiSeverity = null;
  const isNum = (v) => typeof v === 'number' && !isNaN(v);
  // Wagi/wzrost – warunki czerwone (danger): waga ≤3c lub ≥97c, wzrost ≤3c
  const weightDanger = isNum(weightPerc) && (weightPerc <= 3 || weightPerc >= 97);
  const heightDanger = isNum(heightPerc) && heightPerc <= 3;
  // Wagi/wzrost – warunki pomarańczowe (warning): waga (3,10) lub [90,97), wzrost (3,10) lub >97c
  const weightWarning = isNum(weightPerc) && ((weightPerc > 3 && weightPerc < 10) || (weightPerc >= 90 && weightPerc < 97));
  const heightWarning = isNum(heightPerc) && ((heightPerc > 3 && heightPerc < 10) || heightPerc > 97);
  if (weightDanger || heightDanger) {
    whSeverity = 'danger';
  } else if (weightWarning || heightWarning) {
    whSeverity = 'warning';
  }
  // BMI – rozpoznaj na podstawie tekstu kategorii (oraz percentyla dla niedowagi)
  if (typeof bmiCat === 'string') {
    const cat = bmiCat.toLowerCase();
    if (cat.includes('otyłość') || cat.includes('obesity')) {
      bmiSeverity = 'danger';
    } else if (cat.includes('nadwaga') || cat.includes('overweight')) {
      bmiSeverity = 'warning';
    } else if (cat.includes('niedowaga') || cat.includes('underweight')) {
      // Dla niedowagi różnicujemy powagę według *ZAOKRĄGLONEGO* centyla BMI
      // (dokładnie tak, jak jest on prezentowany w UI przez formatCentile()).
      //
      // Reguła:
      //   BMI ≤ 3 centyla      ➔ danger  (czerwony)
      //   BMI (3, 5] centyla   ➔ warning (ciemnopomarańczowy)
      if (isNum(bmiPerc)) {
        const roundedBmiCent = Math.round(bmiPerc);
        if (roundedBmiCent <= 3) {
          bmiSeverity = 'danger';
        } else if (roundedBmiCent <= 5) {
          bmiSeverity = 'warning';
        } else {
          // Jeśli z jakiegoś powodu centyl >5, ale kategoria nadal wskazuje „Niedowaga”,
          // zachowaj poziom warning jako bezpieczny fallback.
          bmiSeverity = 'warning';
        }
      } else {
        // Brak percentyla – oznacz niedowagę jako warning (fallback).
        bmiSeverity = 'warning';
      }
    }
  }
  // UWAGA: BMI NIE dziedziczy powagi z percentyli wagi/wzrostu.
  // Nakładka PRO dla BMI ma się pojawiać wyłącznie, gdy sama kategoria BMI
  // wskazuje „Nadwaga” (warning) lub „Otyłość” (danger).  Dzięki temu przy
  // BMI „W normie” ramka pozostaje turkusowa, nawet jeśli waga/wzrost mają
  // ostrzeżenia na podstawie swoich percentyli.
  // Znajdź kontenery i usuń stare nakładki
  const whContainer = document.getElementById('whResult');
  const bmiContainer = document.getElementById('bmiResult');
  removeOverlay(whContainer);
  removeOverlay(bmiContainer);
  // Dodaj nowe nakładki i ukryj bazowe ramki, jeśli wymagane
  if (whSeverity) {
    addOverlay(whContainer, whSeverity);
  }
  if (bmiSeverity) {
    addOverlay(bmiContainer, bmiSeverity);
  }
}

/**
 * Sets the global pulse mode. Accepts 'infinite' (continuous) or '2s' (single flash).
 * Reapplies pulse classes on all existing elements to reflect the new mode.
 * @param {string} mode
 */
/**
 * Sets the global pulsation mode and re‑applies animations on all active
 * elements.  Accepted values: 'off','2s','3s','5s','7s','10s','infinite'.
 * Any other string defaults to 'infinite'.  The new value is stored in
 * localStorage under the key 'pulseDurationMode'.  After updating the
 * mode, this function iterates over all elements currently pulsing and
 * re‑applies the appropriate class based on their previous severity.
 *
 * @param {string} mode
 */
window.setPulseMode = function(mode) {
  // Normalise mode; fall back to 'infinite' for unknown values
  // Recognised values. '2s' is included for backward compatibility but
  // is not exposed in the settings. Valid options for users are
  // 'off','3s','5s','7s','10s','infinite'.
  const allowed = ['off','2s','3s','5s','7s','10s','infinite'];
  window.PULSE_MODE = allowed.includes(mode) ? mode : 'infinite';
  try {
    if (typeof window !== 'undefined' && window.VildaPersistence && typeof window.VildaPersistence.writePreferenceRaw === 'function') {
      window.VildaPersistence.writePreferenceRaw('PULSE_DURATION_MODE', window.PULSE_MODE, { force: true });
    }
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 4423 });
    }
  }
  // Reapply pulses on all elements currently showing a pulse class
  document.querySelectorAll('.pulse-danger-infinite, .pulse-warning-infinite, .pulse-danger-2s, .pulse-warning-2s')
    .forEach(el => {
      const wasDanger = el.classList.contains('pulse-danger-infinite') || el.classList.contains('pulse-danger-2s');
      clearPulse(el);
      if (window.PULSE_MODE !== 'off') {
        applyPulse(el, wasDanger ? 'danger' : 'warning');
      }
    });
};

// Attach event listener to optional checkbox controlling pulse duration
window.vildaAppOnReady('app:pulse-mode-toggle', function initPulseModeToggle() {
  // On page load, retrieve the stored pulsation mode and apply it.
  try {
    const persistence = (typeof window !== 'undefined') ? window.VildaPersistence : null;
    const savedMode = persistence && typeof persistence.readPreferenceRaw === 'function'
      ? persistence.readPreferenceRaw('PULSE_DURATION_MODE', null)
      : null;
    if (savedMode) {
      window.setPulseMode(savedMode);
    }
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 4448 });
    }
  }
  // Backwards compatibility: toggle controlling 2s vs infinite pulsation
  const cb = document.getElementById('pulseOnce');
  if (cb) {
    cb.addEventListener('change', () => {
      window.setPulseMode(cb.checked ? '2s' : 'infinite');
      // Force restart of animations by toggling animation property
      document.querySelectorAll('.pulse-danger-infinite, .pulse-warning-infinite, .pulse-danger-2s, .pulse-warning-2s')
        .forEach(el => {
          el.style.animation = 'none';
          void el.offsetHeight;
          el.style.animation = '';
        });
    });
  }
});

/**
 * Ustawia opis dla wybranej diety redukcyjnej. Pobiera opis z obiektu
 * DIET_DESCRIPTIONS i wstawia go do elementu #dietDesc. Jeśli klucz nie istnieje,
 * opis jest ukrywany.
 * @param {string} key – klucz diety ('light','moderate','intense')
 */
// updateDietDescription(), updatePalDescription() i minimalne limity podaży energii przeniesiono do vilda_diet_plan_ui.js w kroku 8Q-5.

/* ------------- znacznik: TRUE jeśli użyto alternatywnego źródła LMS ------------- */
let weightUsedFallback = false;   // resetowane w getChildLMS(...)

/* Percentyle progowe u dzieci */
const PERCENTILE_CUTOFF_UNDERWEIGHT = 5;
const PERCENTILE_EXTREME_LOW       = 3;

/*
 * Próg ostrzegawczy dla niskiego wzrostu u dzieci został skorygowany. Wcześniej
 * wyświetlaliśmy alert już dla dzieci z wynikiem poniżej 3 centyla, co
 * powodowało, że komunikat pojawiał się również przy dokładnie 3 centylu
 * (po zaokrągleniu). Zgodnie z nowymi wymaganiami, ostrzeżenie ma się
 * wyświetlać dopiero wtedy, gdy dziecko znajduje się co najmniej jeden
 * centyl poniżej 3 centyla – czyli przy percentylu < 2. Definiujemy
 * dodatkową stałą do obliczeń, aby nie wpływać na próg dla masy ciała.
 */
// (Historycznie używana przy „surowym” percentylu; bieżąca logika ostrzeżeń opiera się na roundedHeightCent)
const HEIGHT_WARNING_THRESHOLD = PERCENTILE_EXTREME_LOW; // 3
const PERCENTILE_EXTREME_HIGH      = 97;

/* Progi BMI anoreksji dorosłych */
const BMI_STARVATION_THRESHOLD = 13;  // <13  — zagrożenie życia
const BMI_SEVERE_ANOREXIA      = 15;  // <15  — bardzo ciężka
const BMI_HEAVY_ANOREXIA       = 16;  // <16  — ciężka
const BMI_MODERATE_ANOREXIA    = 17;  // <17  — umiarkowana
// (BMI <18.5 = ADULT_BMI.UNDER)

/* Granice wieku */
const CHILD_AGE_MIN      = 0.25;   // (3 mies.) – od tego wieku stosujemy siatki WHO
const CHILD_AGE_MAX      = 19;
const OLAF_DATA_MIN_AGE  = 3;   // od tego wieku są dane OLAF
const ADULT_AGE_THRESHOLD   = 18;
const SENIOR_AGE_THRESHOLD  = 60;

/* Zakres dopuszczalnych danych wejściowych */
const MIN_AGE    = 0.25;  // 3 mies.
const MAX_AGE    = 130;
const MIN_WEIGHT = 1;
const MAX_WEIGHT = 500;
const MIN_HEIGHT = 40;
const MAX_HEIGHT = 250;

/* -------------------------------------------------------------------
 *  Dane WHO dla wskaźnika waga do długości/wzrostu (WFL)
 *
 *  W poniższych tablicach zamieszczono parametry L, M i S (LMS) dla
 *  pomiarów długości/leżącej i wzrostu u dziewczynek i chłopców od
 *  45 cm do 110 cm. Dane te pochodzą z tabel WHO „Weight-for-length:
 *  Birth to 2 years (z‑scores)” i pokrywają standardowy zakres długości
 *  dla dzieci do 5 lat (długości > 2 lat mieszczą się w tym samym
 *  przedziale centylowym). Dla wysokości spoza zakresu brzegowego
 *  wykorzystujemy wartości skrajne.
 *
 *  Każdy wiersz tablicy ma postać:
 *      [length_cm, L, M, S]
 *
 *  gdzie length_cm – długość lub wzrost w centymetrach,
 *        L – parametr Box‑Cox,
 *        M – mediana masy (kg) dla danej długości,
 *        S – współczynnik zmienności.
 */
const VILDA_GROWTH_REFERENCE_DATA = (typeof window !== 'undefined' && window.VildaGrowthReferenceData) || {};
function vildaCloneGrowthReferenceData(value, fallback) {
  if (value == null) return fallback;
  try { return JSON.parse(JSON.stringify(value)); } catch (_) { return fallback; }
}
const WFL_DATA_GIRLS = VILDA_GROWTH_REFERENCE_DATA.WFL_DATA_GIRLS || [];

// Updated LMS parameters for boys: Weight-for-Length (birth to 2 years)
// Source: WHO infant weight‑for‑length percentiles table (<24 months) published on MSD Manuals.
// Each entry contains [length_cm, L, M, S]. The Power (L) parameter is constant (-0.3521) across lengths.
const WFL_DATA_BOYS = VILDA_GROWTH_REFERENCE_DATA.WFL_DATA_BOYS || [];

/**
 * Zwraca parametry LMS dla podanej długości/wzrostu poprzez interpolację
 * pomiędzy punktami w tabeli WFL. Jeśli zadana długość znajduje się poza
 * zakresem tablicy, używa wartości skrajnych.
 *
 * @param {string} sex – 'M' dla chłopców, 'F' dla dziewczynek
 * @param {number} lengthCm – długość lub wzrost w centymetrach
 * @returns {Array} – [L, M, S] lub null, jeśli brak danych
 */
function getWflLMS(sex, lengthCm) {
  const data = (sex === 'M') ? WFL_DATA_BOYS : WFL_DATA_GIRLS;
  if (!data || !Array.isArray(data) || data.length === 0) return null;
  const minLen = data[0][0];
  const maxLen = data[data.length - 1][0];
  // Jeżeli długość poniżej minimalnej, zwróć pierwszy wiersz
  if (lengthCm <= minLen) return [data[0][1], data[0][2], data[0][3]];
  // Jeżeli powyżej zakresu, zwróć ostatni wiersz
  if (lengthCm >= maxLen) return [data[data.length-1][1], data[data.length-1][2], data[data.length-1][3]];
  // Znajdź dwa sąsiednie wiersze, pomiędzy którymi znajduje się długość
  for (let i = 0; i < data.length - 1; i++) {
    const h1 = data[i][0];
    const h2 = data[i+1][0];
    if (lengthCm >= h1 && lengthCm <= h2) {
      const t = (lengthCm - h1) / (h2 - h1);
      const L = data[i][1] + t * (data[i+1][1] - data[i][1]);
      const M = data[i][2] + t * (data[i+1][2] - data[i][2]);
      const S = data[i][3] + t * (data[i+1][3] - data[i][3]);
      return [L, M, S];
    }
  }
  return null;
}

/**
 * Oblicza Z‑score wskaźnika waga do długości/wzrostu (weight‑for‑length/height)
 * przy użyciu parametrów LMS oraz masy ciała. Dla L=0 stosuje wzór logarytmiczny.
 *
 * @param {number} weight – masa ciała w kg
 * @param {number} length – długość lub wzrost w cm
 * @param {string} sex – 'M' (chłopiec) lub 'F' (dziewczynka)
 * @returns {number|null} – Z‑score lub null, jeśli brak danych
 */
function computeWflZScore(weight, length, sex) {
  const lms = getWflLMS(sex, length);
  if (!lms) return null;
  const [L, M, S] = lms;
  if (M === 0 || S === 0) return null;
  if (L !== 0) {
    return ((Math.pow(weight / M, L) - 1) / (L * S));
  } else {
    // gdy L=0 użyj wzoru logarytmicznego
    return (Math.log(weight / M)) / S;
  }
}

/* Jednostki i konwersje */
const CM_TO_M = 100;

/* === ACTIVITY BURN SHARED HELPERS moved to vilda_activity_burn.js in step 8D === */
const VILDA_ACTIVITY_BURN = (typeof window !== 'undefined' && (window.VildaActivityBurn || window.vildaActivityBurn))
  ? (window.VildaActivityBurn || window.vildaActivityBurn)
  : {};
if (!VILDA_ACTIVITY_BURN || typeof VILDA_ACTIVITY_BURN.activityBuildFoodBurnState !== 'function') {
  vildaLogAppWarn('app:activity-burn', 'Brak VildaActivityBurn — część podsumowań spalania będzie działać w trybie fallback.');
}
const {
  library: ACTIVITY_BURN_LIBRARY = VILDA_FOOD_DATA.activityBurnLibrary || Object.freeze({}),
  presets: ACTIVITY_BURN_PRESETS = VILDA_FOOD_DATA.activityBurnPresets || Object.freeze({}),
  routeExamples: ACTIVITY_BURN_ROUTE_EXAMPLES = VILDA_FOOD_DATA.activityBurnRouteExamples || Object.freeze([]),
  activities = VILDA_FOOD_DATA.activities || Object.freeze({}),
  activityGetDefinition = function(){ return null; },
  activityGetPreset = function(){ return null; },
  activityResolveChildFactor = function(){ return 1; },
  activityBurnPerMinuteKcal = function(){ return 0; },
  activityFormatDurationMinutes = function(){ return '—'; },
  activityFormatDistanceKm = function(){ return '—'; },
  activityBurnEstimate = function(){ return null; },
  activityBuildModel = function(){ return null; },
  activityBuildFoodBurnState = function(){ return null; },
  activityBuildJourneyBurnState = function(){ return null; },
  activityRenderTableHtml = function(){ return ''; },
  activityGetPdfRows = function(){ return []; },
  activityGetRow = function(){ return null; },
  activityFindRouteExample = function(){ return null; },
  kcalFor1km = function(){ return 0; }
} = VILDA_ACTIVITY_BURN;
/* === ACTIVITY BURN SHARED HELPERS END ================================ */

/* === FOOD ROW HELPERS moved to vilda_macro_practice.js in step 8F === */

/* === FOOD SUMMARY / LOCAL REFRESH moved to vilda_food_summary.js in step 8E === */
/* === ENERGY NORMS ENGINE moved to vilda_diet_plan_ui.js in step 8Q-5 === */

function BMI(weight,height){
  return weight/Math.pow(height/CM_TO_M,2);
}

function bmiCategory(bmi){
  // Nowa klasyfikacja dorosłych według WHO z rozróżnieniem stopni otyłości
  // Niedowaga – poniżej progu UNDER
  if (bmi < ADULT_BMI.UNDER) return 'Niedowaga';
  // Prawidłowe BMI – poniżej górnej granicy normy (25)
  if (bmi < ADULT_BMI.OVER) return 'Prawidłowe';
  // Nadwaga – 25.0–29.99
  if (bmi < 30) return 'Nadwaga';
  // Otyłość I stopnia – 30.0–34.99
  if (bmi < 35) return 'Otyłość I stopnia';
  // Otyłość II stopnia – 35.0–39.99
  if (bmi < 40) return 'Otyłość II stopnia';
  // Otyłość III stopnia – 40.0 i więcej
  return 'Otyłość III stopnia';
}

const PEDIATRIC_BMI_CLASSIFICATION_UNAVAILABLE_KEY = 'pediatric-bmi-reference-unavailable';
const PEDIATRIC_BMI_CLASSIFICATION_UNAVAILABLE_LABEL = 'Brak klasyfikacji pediatrycznej — brak danych referencyjnych';

function vildaGetPediatricBmiClassificationUnavailableLabel(){
  return PEDIATRIC_BMI_CLASSIFICATION_UNAVAILABLE_LABEL;
}

function vildaIsPediatricBmiCategoryUnavailable(category){
  return String(category || '').trim() === PEDIATRIC_BMI_CLASSIFICATION_UNAVAILABLE_LABEL;
}

function vildaResolvePediatricBmiCategoryFromPercentile(percentile, options){
  const opts = options || {};
  const p = Number(percentile);
  if (percentile == null || !isFinite(p)) return PEDIATRIC_BMI_CLASSIFICATION_UNAVAILABLE_LABEL;

  const useOlaf = !!opts.useOlaf;
  const normHi  = useOlaf ? CHILD_THRESH_OLAF.NORMAL_HI : CHILD_THRESH_WHO.NORMAL_HI;
  const obesity = useOlaf ? CHILD_THRESH_OLAF.OBESE     : CHILD_THRESH_WHO.OBESE;
  const z = Number(opts.zScore);

  if (isFinite(z) && z >= 3) return 'Otyłość olbrzymia';
  if (p < PERCENTILE_CUTOFF_UNDERWEIGHT) return 'Niedowaga';
  if (p < normHi) return 'Prawidłowe';
  if (p < obesity) return 'Nadwaga';
  return 'Otyłość';
}

function vildaGetPediatricBmiClassificationAuditSnapshot(options){
  const opts = options || {};
  const sampleMissingPercentile = vildaResolvePediatricBmiCategoryFromPercentile(null, { useOlaf: false });
  const sampleWhoNormal = vildaResolvePediatricBmiCategoryFromPercentile(50, { useOlaf: false });
  const sampleOlafOverweight = vildaResolvePediatricBmiCategoryFromPercentile(92, { useOlaf: true });
  const sampleWhoObesity = vildaResolvePediatricBmiCategoryFromPercentile(98, { useOlaf: false });
  return {
    step: '8O-10b',
    kind: 'pediatric-bmi-classification-audit',
    readOnly: true,
    executedUpdate: false,
    renderedDom: false,
    committedWindowState: false,
    adultFallbackRemoved: true,
    missingPercentileUsesAdultBmi: false,
    unavailableKey: PEDIATRIC_BMI_CLASSIFICATION_UNAVAILABLE_KEY,
    unavailableLabel: PEDIATRIC_BMI_CLASSIFICATION_UNAVAILABLE_LABEL,
    policy: {
      childPercentileMissing: 'Nie klasyfikuj według progów dorosłych; pokaż brak klasyfikacji pediatrycznej.',
      adultBmiClassificationStillAvailable: true,
      thresholdsUnchanged: true
    },
    functions: {
      bmiCategory: typeof bmiCategory === 'function',
      bmiCategoryChild: typeof bmiCategoryChild === 'function',
      bmiPercentileChild: typeof bmiPercentileChild === 'function',
      bmiZscore: typeof bmiZscore === 'function',
      vildaResolvePediatricBmiCategoryFromPercentile: typeof vildaResolvePediatricBmiCategoryFromPercentile === 'function',
      vildaIsPediatricBmiCategoryUnavailable: typeof vildaIsPediatricBmiCategoryUnavailable === 'function'
    },
    samples: {
      missingPercentile: sampleMissingPercentile,
      whoPercentile50: sampleWhoNormal,
      olafPercentile92: sampleOlafOverweight,
      whoPercentile98: sampleWhoObesity,
      adultBmi25StillAdultOnly: typeof bmiCategory === 'function' ? bmiCategory(25) : null
    },
    includeSourceHints: opts.includeSourceHints === true ? {
      replacedFallback: 'bmiCategoryChild(): p == null nie wywołuje bmiCategory(bmi).',
      updatePrepGuard: 'VildaUpdatePrep.classifyBmi(): bmiPercentile == null u dziecka nie wywołuje bmiCategory(bmi).'
    } : null
  };
}

if (typeof window !== 'undefined') {
  window.vildaGetPediatricBmiClassificationUnavailableLabel = vildaGetPediatricBmiClassificationUnavailableLabel;
  window.vildaIsPediatricBmiCategoryUnavailable = vildaIsPediatricBmiCategoryUnavailable;
  window.vildaResolvePediatricBmiCategoryFromPercentile = vildaResolvePediatricBmiCategoryFromPercentile;
  window.vildaGetPediatricBmiClassificationAuditSnapshot = vildaGetPediatricBmiClassificationAuditSnapshot;
}

/* === DIET PLAN REDUCTION ENGINE moved to vilda_diet_plan_ui.js in step 8Q-5 === */

// Wybór klasy pod kolor ramki/ liczby BMI u dorosłych
function bmiBoxClassForAdult(bmiCat, ageYears){
  if (ageYears < 18) return '';
  if (bmiCat === 'Niedowaga' || bmiCat === 'Nadwaga') return ' bmi-warning';
  if (String(bmiCat).startsWith('Otyłość'))           return ' bmi-danger';
  return '';
}
/* =====================================================================
 * Diet plan / energy plan renderer został wydzielony do vilda_diet_plan_ui.js w kroku 8Q-5.
 * Mostek zachowuje dotychczasowe globalne aliasy updatePlanFromDiet(),
 * fillDietSelect(), BMR() i helpery energy*, bez zmiany wzorów klinicznych.
 * ===================================================================== */
(function () {
  function initDietPlanUiBridge() {
    try {
      if (typeof window === 'undefined') return undefined;
      if (!window.VildaDietPlanUI || typeof window.VildaDietPlanUI.init !== 'function') {
        if (typeof vildaLogAppWarn === 'function') {
          vildaLogAppWarn('app:diet-plan-ui', 'Brak VildaDietPlanUI — plan dietetyczny/energy renderer nie został zainicjalizowany.');
        }
        return undefined;
      }
      return window.VildaDietPlanUI.init();
    } catch (error) {
      if (typeof vildaLogAppError === 'function') {
        vildaLogAppError('app:diet-plan-ui', 'Nie udało się zainicjalizować VildaDietPlanUI.', error);
      } else if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', error, { feature: 'diet-plan-ui:init-bridge', step: '8Q-5' });
      }
      return undefined;
    }
  }

  if (typeof window !== 'undefined' && typeof window.vildaAppSafeInit === 'function') {
    window.vildaAppSafeInit('app:diet-plan-ui', initDietPlanUiBridge, { once: true, phase: 'init' });
  } else {
    initDietPlanUiBridge();
  }
})();

/**
 * Prosty predyktor końcowego wzrostu u dziecka.
 * Zakładamy, że dziecko pozostanie na swoim centylu wysokości.
 * Funkcję trzymamy w jednym miejscu, by łatwo ją później podmienić.
 */
function predictAdultHeight(age, sex, heightPercentile) {
  // Tabela docelowego wzrostu (cm) w wieku 18 l.
  const ADULT_HEIGHT = {
    M: {50: 176, 75: 183, 90: 188},
    F: {50: 164, 75: 169, 90: 173}
  };
  // Zaokrąglij percentile do 50/75/90; domyślnie 50
  const key = heightPercentile >= 90 ? 90 : heightPercentile >= 75 ? 75 : 50;
  return ADULT_HEIGHT[sex][key];
}

function toNormalBMITarget(weight, height, age, sex){
  // Dzieci 0,25–19 l.
  if (age >= CHILD_AGE_MIN && age <= CHILD_AGE_MAX){
    const months = Math.round(age * 12);
    const lms    = getLMS(sex, months);
    if (lms){
      const [L, M, S] = lms;

      // ◀ NOWE ▶ wybór docelowego centyla
      // Dla wszystkich dzieci stosujemy górną granicę normy BMI odpowiadającą 85. centylowi
      // (próg nadwagi) niezależnie od wybranego źródła (WHO/OLAF). Dzięki temu definicje są spójne.
      const zTarget = Z85;

      return (L !== 0)
             ? M * Math.pow(1 + L * S * zTarget, 1 / L)
             : M * Math.exp(S * zTarget);
    }
    return null;                                   // 8O-10b: brak referencji pediatrycznej — bez fallbacku do progów dorosłych
  }
  // Dorośli
  return 24.9;
}


/**
 * Zwraca kcal spalane na 1 km danej aktywności
 * @param {string} activity – klucz aktywności ('bike16','bike20','run','swim','walk')
 * @param {number} weight   – masa ciała w kg
 * @returns {number} kcal na 1 km
 */

/**
 * Oblicza, ile km i ile czasu potrzeba, by osiągnąć normę BMI
 * @returns {object|null} {kgToLose, kcalToBurn, table} lub null gdy BMI ≤ norma
 */
function distanceToNormalBMI(weight, height, age, sex) {
  const currentBMI = BMI(weight, height);
  const targetBMI  = toNormalBMITarget(weight, height, age, sex);
  if (!isFinite(Number(targetBMI)) || Number(targetBMI) <= 0) return null;
  if (currentBMI <= targetBMI) return null;

  // ile kg trzeba schudnąć i ile kcal to daje
  const targetWeight = targetBMI * Math.pow(height / CM_TO_M, 2);
  const kgToLose     = weight - targetWeight;
  const kcalToBurn   = kgToLose * KCAL_PER_KG;

  const activityModel = activityBuildJourneyBurnState({
    kcalTarget: kcalToBurn,
    weightKg: weight,
    ageYears: age
  });
  const table = activityRenderTableHtml(activityModel);

  return { kgToLose, kcalToBurn, table, activityModel };
}
/**
 * Ile kilogramów brakuje dziecku (2–19 l.) do dolnej granicy normy BMI (P5 WHO)
 * Zwraca liczbę > 0 — kg do przybrania, lub 0 jeśli BMI ≥ P5.
 */
function kgToReachNormalBMIChild(weight, height, age, sex){
  const months = Math.round(age * 12);
  const dataMap = bmiPercentiles[ sex==='M' ? 'boys' : 'girls' ];
  const data   = dataMap[ months ];
  if(!data) return 0;                     // brak danych – nie wyliczamy
  const targetBMI   = data.P5;            // 5 percentyl = dolna granica normy
  const targetWgt   = targetBMI * Math.pow(height/CM_TO_M, 2);
  const kgNeeded    = targetWgt - weight; // >0: masa do przybrania
  return kgNeeded > 0 ? kgNeeded : 0;
}

// --- KONIEC: Funkcje Droga do normy BMI ---

/* =====================================================================
 * Karty poprzedniego pomiaru / klirensu zostały wydzielone do vilda_summary_cards.js w kroku 8Q-4.
 * ===================================================================== */
/* ------------ Debounce wrapper ------------ */
const debouncedUpdate = (() => {
  let raf = null;
  return () => {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      raf = null;
      update();
      // Po każdej aktualizacji przeliczamy także pozycjonowanie sekcji
      // modułu lekarskiego oraz przycisku podsumowania wyników. Dzięki temu
      // w trybie mobilnym elementy zostaną przeniesione w odpowiednie miejsce
      // po uzupełnieniu danych.
      if (typeof repositionDoctor === 'function') {
        repositionDoctor();
      }
      if (typeof repositionMetabolicSummary === 'function') {
        repositionMetabolicSummary();
      }
      // Aktualizuj kartę podsumowania wyników w trybie profesjonalnym
      if (typeof updateProfessionalSummaryCard === 'function') {
        updateProfessionalSummaryCard();
      }
      // Nie przewijamy tutaj strony – wykonywanie scrollowania
      // realizowane jest w funkcji update() po wygenerowaniu wyników.
    });
  };
})();
try { window.debouncedUpdate = debouncedUpdate; } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 7369 });
    }
  }

// === Patch 2025-12-14 – reposition antibiotic therapy card below its button ===
// This patch ensures that the antibiotic therapy card, when created by the
// antibiotic_therapy.js module, appears directly below the "Antybiotykoterapia"
// button inside #modulesWrapper.  Without this patch the card is inserted
// higher up in the DOM, causing it to appear between the user fields and other
// professional module controls.  We listen for clicks on the toggle button and
// attempt to move the card after it has been generated.
//
// If the card already exists on page load (e.g. due to caching), it will be
// repositioned on DOMContentLoaded.
(function() {
  function repositionAbxCard() {
    // reposition disabled to prevent layout shifts
    return;
    try {
      var abxCard = document.getElementById('antibioticTherapyCard');
      var modulesWrapper = document.getElementById('modulesWrapper');
      var abxButtonWrapper = document.getElementById('abxButtonWrapper');
      // Only reposition if all elements exist and the card is not already inside modulesWrapper.
      if (abxCard && modulesWrapper && abxButtonWrapper && !modulesWrapper.contains(abxCard)) {
        if (abxButtonWrapper.nextSibling) {
          modulesWrapper.insertBefore(abxCard, abxButtonWrapper.nextSibling);
        } else {
          modulesWrapper.appendChild(abxCard);
        }
      }
    } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 7397 });
    }
  }
  }
  // Reposition on DOMContentLoaded in case the card is present from a previous session.
  window.vildaAppOnReady('app:antibiotic-card-reposition', function initAntibioticCardReposition() {
    repositionAbxCard();
    var abxToggle = document.getElementById('toggleAbxTherapy');
    if (abxToggle) {
      abxToggle.addEventListener('click', function() {
        // Use a short timeout to allow the external script to insert the card first.
        setTimeout(repositionAbxCard, 0);
      });
    }
  });
})();

// Ukrywanie opcji „Strategia stabilizacji masy ciała” po zaznaczeniu „Wzrost zakończony”
// Ten listener reaguje na zmianę pola checkbox (growthEndedFlag) i
// odpowiednio ukrywa lub pokazuje opcję stabilizacji.  Jeśli użytkownik
// zaznaczy, że wzrost jest zakończony, opcja stabilizacji znika, a wybrana
// zostaje automatycznie strategia redukcji masy ciała.  Dzięki temu
// użytkownik nie widzi zbędnej opcji, która nie ma sensu przy braku
// dalszego wzrostu.
window.vildaAppOnReady('app:stabilization-strategy-toggle', function initStabilizationStrategyToggle() {
  const growthCheckbox = document.getElementById('growthEndedFlag');
  // Nowy element, który zawiera przełącznik stabilizacji masy ciała
  const stabilizationGroup = document.getElementById('stabilizationGroup');
  const reduceToggle = document.getElementById('reduceToggle');
  const stabilizationToggle = document.getElementById('stabilizationToggle');
  // Ikona informacyjna przy stabilizacji
  const stabilizationInfoIcon = document.getElementById('stabilizationInfoIcon');

  /**
   * Sprawdza, czy stabilizacja masy ciała jest możliwa na podstawie aktualnych danych.
   * Stabilizacja wymaga posiadania prognozy docelowego wzrostu (MPH) i sprawdza,
   * czy przy takim wzroście obecna masa mieści się w górnej granicy normy BMI.
   * Jeśli obecna waga przekracza docelową wagę dla docelowego wzrostu, redukcja jest konieczna.
   * @returns {boolean} true, jeśli stabilizacja jest możliwa; false w przeciwnym razie
   */
  function isStabilizationPossibleForCurrentData() {
    // Pobierz podstawowe dane z formularza
    const weightVal  = parseFloat(document.getElementById('weight')?.value) || 0;
    const heightVal  = parseFloat(document.getElementById('height')?.value) || 0;
    const ageVal     = (typeof window.getAgeDecimal === 'function') ? window.getAgeDecimal() : ((typeof getAgeDecimal === 'function') ? getAgeDecimal() : 0);
    const sexVal     = document.getElementById('sex')?.value || 'M';
    const agd        = (typeof window.advancedGrowthData !== 'undefined') ? window.advancedGrowthData : null;
    // Stabilizacja możliwa tylko dla dzieci <19 lat; dorośli zawsze muszą redukować, jeśli mają nadwagę
    if (!agd || !agd.targetHeight || isNaN(agd.targetHeight) || ageVal >= 19) {
      return false;
    }
    const predictedHeight = parseFloat(agd.targetHeight);
    if (!predictedHeight || predictedHeight <= heightVal) {
      return false;
    }
    // Oblicz docelową wartość BMI odpowiadającą górnej granicy normy dla docelowego wzrostu
    // Zakładamy, że w wieku 18 lat nadal stosujemy definicję normy BMI (85. centyl) dla dzieci;
    // funkcja toNormalBMITarget zwraca 24,9 dla dorosłych, co jest spójne ze standardem.
    const predictedAge  = 18;
    const bmiTarget     = toNormalBMITarget(weightVal, predictedHeight, predictedAge, sexVal);
    if (!bmiTarget || isNaN(bmiTarget)) {
      return false;
    }
    const normWeightAdult = bmiTarget * Math.pow(predictedHeight / 100, 2);
    // Jeżeli aktualna waga jest mniejsza lub równa docelowej wadze przy docelowym wzroście,
    // stabilizacja jest możliwa – dalszy wzrost pozwoli „wyrosnąć” z nadwagi/otyłości.
    return weightVal <= normWeightAdult;
  }

  /**
   * Aktualizuje możliwość zaznaczenia strategii stabilizacji.  Jeśli stabilizacja
   * nie jest możliwa (brak danych o docelowym wzroście lub obecna masa znacząco
   * przekracza docelową przy końcowym wzroście), przełącznik jest dezaktywowany,
   * a obok pojawia się ikona informacyjna z wyjaśnieniem.
   */
  function updateStabilizationEligibility() {
    if (!stabilizationGroup || !stabilizationToggle) return;
    // Jeśli wzrost został oznaczony jako zakończony, ukryj ikonę i wyjdź.
    if (growthCheckbox && growthCheckbox.checked) {
      if (stabilizationInfoIcon) {
        stabilizationInfoIcon.style.display = 'none';
      }
      return;
    }

    // Oblicz wiek w latach (uwzględnij miesiące) bez odwoływania się do zewnętrznych funkcji.
    const yearsEl = document.getElementById('age');
    const monthsEl = document.getElementById('ageMonths');
    const years = parseFloat(yearsEl && yearsEl.value) || 0;
    const months = parseFloat(monthsEl && monthsEl.value) || 0;
    const ageVal = years + (months / 12);

    // Dorosłym (>18 lat) nie oferujemy strategii stabilizacji – włącz redukcję i pokaż informację.
    if (ageVal >= 19) {
      stabilizationToggle.disabled = true;
      stabilizationToggle.checked = false;
      if (reduceToggle) {
        reduceToggle.checked = true;
      }
      if (stabilizationInfoIcon) {
        stabilizationInfoIcon.style.display = 'inline-flex';
        stabilizationInfoIcon.title = 'Strategia stabilizacji masy ciała dotyczy tylko dzieci i nastolatków; osoby dorosłe powinny przyjąć strategię redukcji masy ciała.';
      }
      return;
    }

    // Sprawdź, czy dane o docelowym wzroście są dostępne (MPH). Jeżeli nie ma
    // globalnego obiektu advancedGrowthData lub jego pola targetHeight są
    // nieprawidłowe, nie możemy ocenić potencjału „wyrośnięcia z nadwagi”. W
    // takim wypadku pozostaw przełącznik stabilizacji aktywny i ukryj ikonę.
    const agd = (typeof window.advancedGrowthData !== 'undefined') ? window.advancedGrowthData : null;
    const hasTarget = agd && agd.targetHeight !== undefined && agd.targetHeight !== null && !isNaN(parseFloat(agd.targetHeight));
    if (!hasTarget) {
      // Brak danych wejściowych – pozostaw możliwość stabilizacji. Nie
      // zaznaczamy redukcji automatycznie i nie wyświetlamy komunikatu.
      stabilizationToggle.disabled = false;
      if (stabilizationInfoIcon) {
        stabilizationInfoIcon.style.display = 'none';
      }
      return;
    }

    // W tym momencie mamy komplet danych i możemy obliczyć, czy stabilizacja jest możliwa.
    const canStabilize = isStabilizationPossibleForCurrentData();
    if (canStabilize) {
      // Możliwa stabilizacja – odblokuj przełącznik i ukryj ikonę
      stabilizationToggle.disabled = false;
      if (stabilizationInfoIcon) {
        stabilizationInfoIcon.style.display = 'none';
      }
    } else {
      // Stabilizacja niemożliwa – wyłącz przełącznik, zaznacz redukcję i pokaż ikonę z odpowiednim komunikatem
      stabilizationToggle.disabled = true;
      stabilizationToggle.checked = false;
      if (reduceToggle) {
        reduceToggle.checked = true;
      }
      if (stabilizationInfoIcon) {
        stabilizationInfoIcon.style.display = 'inline-flex';
        stabilizationInfoIcon.title = 'Według algorytmów systemu wagaiwzrost.pl ta osoba już nie zdąży wyrosnąć z otyłości i trzeba przyjąć strategię redukcji masy ciała.';
      }
    }
  }

  function updateStabilizationVisibility() {
    if (!stabilizationGroup) return;
    if (growthCheckbox && growthCheckbox.checked) {
      // Ukryj przełącznik stabilizacji, gdy wzrost zakończony
      stabilizationGroup.style.display = 'none';
      // Odznacz stabilizację i zaznacz redukcję
      if (stabilizationToggle && stabilizationToggle.checked) {
        stabilizationToggle.checked = false;
      }
      if (reduceToggle) {
        reduceToggle.checked = true;
      }
      // Gdy grupa jest ukryta, nie ma potrzeby informować o stabilizacji; ukryj ikonę, jeśli istnieje
      if (stabilizationInfoIcon) {
        stabilizationInfoIcon.style.display = 'none';
      }
    } else {
      // Przywróć widoczność przełącznika stabilizacji
      stabilizationGroup.style.display = '';
      // Zaktualizuj możliwość stabilizacji na podstawie danych (czy można ją wybrać?)
      updateStabilizationEligibility();
    }
  }
  if (growthCheckbox) {
    growthCheckbox.addEventListener('change', updateStabilizationVisibility);
  }
  // Wywołaj na starcie, aby ustawić widoczność prawidłowo po załadowaniu strony
  updateStabilizationVisibility();

  // Ustaw wzajemne wykluczanie się strategii redukcji i stabilizacji
  if (reduceToggle && stabilizationToggle) {
    reduceToggle.addEventListener('change', function() {
      if (reduceToggle.checked && stabilizationToggle.checked) {
        // Odznacz stabilizację, gdy zaznaczona jest redukcja
        stabilizationToggle.checked = false;
      }
    });
    stabilizationToggle.addEventListener('change', function() {
      if (stabilizationToggle.checked && reduceToggle.checked) {
        // Odznacz redukcję, gdy zaznaczona jest stabilizacja
        reduceToggle.checked = false;
      }
    });
  }

  // Kliknięcie ikony informacyjnej: pokaż szczegółowe wyjaśnienie, dlaczego stabilizacja jest niedostępna
  if (stabilizationInfoIcon) {
    stabilizationInfoIcon.addEventListener('click', function() {
      // Wyświetl komunikat na podstawie atrybutu title, który jest ustawiany w updateStabilizationEligibility().
      // Jeżeli z jakiegoś powodu title nie jest dostępny, użyj domyślnego komunikatu.
      var msg = this && this.getAttribute('title');
      if (!msg || typeof msg !== 'string' || msg.trim() === '') {
        msg = 'Według algorytmów systemu wagaiwzrost.pl ta osoba już nie zdąży wyrosnąć z otyłości i trzeba przyjąć strategię redukcji masy ciała.';
      }
      alert(msg);
    });
  }

  // Eksportuj funkcje sprawdzające i aktualizujące stabilizację do globalnego obiektu `window`.
  // Dzięki temu funkcje te będą dostępne poza zakresem niniejszego modułu (np. w funkcji update()).
  try {
    window.isStabilizationPossibleForCurrentData = isStabilizationPossibleForCurrentData;
    window.updateStabilizationEligibility = updateStabilizationEligibility;
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 7604 });
    }
  }
});

// =====================================================================
// Moduł zaleceń dietetycznych został wydzielony do vilda_diet_recommendations.js w kroku 8I.
// Zachowane globalne API: updateDietRecommendationsVisibility(), generateDietRecommendations(),
// generateDietRecommendationsStabilization(), dietRecommendationsCollectPdfPages() i eksport PDF.
// =====================================================================

// -----------------------------------------------------------------------------
// Live updating, tone helpers i raport pacjenta zostały wydzielone do vilda_patient_report.js w kroku 8H.
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// Autoscroll wyników jest celowo wyłączony globalnie. Stała bramka pozwala
// pomijać inicjalizację listenerów, które przy tym ustawieniu wykonywały
// wyłącznie martwą pracę. Nie wpływa na ręczne przewijanie strony ani na
// walidację pól formularza.
// -----------------------------------------------------------------------------
const VILDA_AUTO_SCROLL_PERMANENTLY_DISABLED = true;
function isVildaAutoScrollPermanentlyDisabled() {
  return VILDA_AUTO_SCROLL_PERMANENTLY_DISABLED === true;
}

// ============================================================================
// Podsumowanie profesjonalne i raport pacjenta
//
// Implementacja funkcji updateProfessionalSummaryCard(),
// getFormattedProfessionalSummaryLines(), patientReport*() oraz generatorów PDF
// została wydzielona do vilda_patient_report.js w kroku 8H.
// ============================================================================



// Po załadowaniu strony dodajemy obsługę zdarzeń blur na polach wiek, waga i wzrost.
// Gdy użytkownik zakończy edycję dowolnego z tych pól (tj. pole traci fokus),
// sprawdzamy, czy dane są kompletne i czy karta z wynikami jest widoczna.
// Jeśli tak, wywołujemy funkcję scrollToResultsCard(), która płynnie
// przewinie stronę tak, aby karta BMI znalazła się u góry widoku.
if (typeof document !== 'undefined') {
  // Funkcja inicjująca obsługę przewijania po opuszczeniu pól wprowadzania danych.
  function initScrollOnBlur() {
    try {
      if (isVildaAutoScrollPermanentlyDisabled()) return;
      const ageInputEl    = document.getElementById('age');
      const weightInputEl = document.getElementById('weight');
      const heightInputEl = document.getElementById('height');
      if (!ageInputEl || !weightInputEl || !heightInputEl) return;
      // Funkcja wywoływana po opuszczeniu pola lub zmianie jego wartości.
      // Używamy setTimeout, aby poczekać na wygenerowanie wyników i repozycjonowanie.
      const onBlurOrChangeHandler = function() {
        setTimeout(() => {
          try {
            // Na potrzeby przewijania po opuszczeniu pól wprowadzania danych
            // nie korzystamy z globalnej funkcji scrollToResultsCard, gdyż
            // jej wywołanie mogło nastąpić wcześniej w trakcie edycji.
            // Zamiast tego bezpośrednio przewijamy kartę BMI do górnej
            // krawędzi okna, o ile wszystkie pola są wypełnione i karta
            // z wynikami jest widoczna.
            const anthroValidation = (typeof vildaGetMainAnthroValidationSnapshot === 'function')
              ? vildaGetMainAnthroValidationSnapshot()
              : null;
            const resultsEl = document.getElementById('results');
            if (!(anthroValidation ? anthroValidation.complete : false)) return;
            if (resultsEl && resultsEl.style.display === 'none') return;
            const bmiCardEl = document.getElementById('bmiCard');
            // Jeśli przewijanie jest globalnie wyłączone (po wczytaniu danych), nie przewijaj
            if (typeof autoScrollDisabled !== 'undefined' && autoScrollDisabled) {
              return;
            }
            if (bmiCardEl) {
              // Używamy naszej funkcji scrollToResultsCard, która dodatkowo sprawdzi
              // widoczność wyników, stan aktywnego elementu oraz inne wykluczenia.
              scrollToResultsCard();
            }
          } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 18481 });
    }
  }
        }, 200);
      };
      ['blur','change'].forEach(evt => {
        ageInputEl.addEventListener(evt, onBlurOrChangeHandler);
        weightInputEl.addEventListener(evt, onBlurOrChangeHandler);
        heightInputEl.addEventListener(evt, onBlurOrChangeHandler);
      });
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 18491 });
    }
  }
  }
  // Jeżeli dokument jest już załadowany, inicjujemy przez wspólny helper.
  window.vildaAppOnReady('app:auto-scroll-blur', initScrollOnBlur);
}

// -----------------------------------------------------------------------------
// Wyłącz automatyczne przewijanie po interakcji z określonymi polami
// (obwód talii, obwód bioder, lista przekąsek, lista dań obiadowych i karta
// planu odchudzania).  Ustawia flagę skipAutoScrollOnce na true przy
// wejściu do któregoś z tych pól, aby zapobiec automatycznemu scrollowaniu
// wyników bezpośrednio po ich edycji.
if (typeof window !== 'undefined' && typeof window.vildaAppOnReady === 'function') {
  window.vildaAppOnReady('app:auto-scroll-focus-exclusions', function initAutoScrollFocusExclusions() {
    if (isVildaAutoScrollPermanentlyDisabled()) return;
    document.addEventListener('focusin', (e) => {
      try {
        const target = e.target;
        if (!target) return;
        // Ustal, czy element jest jednym z wykluczonych pól lub znajduje się
        // wewnątrz jednej z wykluczonych sekcji.
        if (target.id === 'waistCm' || target.id === 'hipCm') {
          // Ustaw licznik pomijania scrollowania na większą wartość, aby
          // zignorować wszystkie wywołania scrollowania generowane po
          // aktualizacji tych pól oraz następującym repozycjonowaniu elementów.
          skipAutoScrollCounter = 3;
          return;
        }
        if (typeof target.closest === 'function') {
          if (target.closest('#foodList') || target.closest('#planCard')) {
            // Ustaw większą wartość, ponieważ zmiany w listach przekąsek/dania
            // mogą powodować kilka wywołań scrollowania (update + reposition).
            skipAutoScrollCounter = 3;
            return;
          }
        }
      } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 18528 });
    }
  }
    });
  });
}

// -----------------------------------------------------------------------------
// Inicjalizacja przełącznika trybu wyników (standardowe / profesjonalne)
// Funkcja ta ustawia stan przełącznika na podstawie localStorage i
// rejestruje obsługę zdarzenia zmiany. Dzięki temu użytkownik może
// przełączać się między uproszczonymi wynikami (bez Z‑score) a pełnymi
// wynikami profesjonalnymi. Stan przełącznika jest zapisywany do
// localStorage i odczytywany przy kolejnym uruchomieniu aplikacji.
(() => {
  function initResultsModeToggle(){
    const toggle = document.getElementById('resultsModeToggle');
    if (!toggle) return;

    // Funkcja pomocnicza: aktualizuje elementy interfejsu po zmianie trybu
    // wyników.  Od wersji z ciemnym tłem dodawanie klasy 'professional-bg'
    // zostało wyłączone – przełącznik trybu profesjonalnego nie steruje już
    // przyciemnieniem tła aplikacji.  Klasa 'professional-bg' jest zawsze
    // usuwana, aby uniknąć efektu przyciemnienia.
    function updateBmiCardBackground() {
      const body = document.body;
      // W trybie profesjonalnym przełącznik nie powinien sterować kolorem tła aplikacji.
      // Usuwamy klasę professional-bg, aby zapobiec przyciemnianiu tła przez suwak PRO.
      body.classList.remove('professional-bg');

      // Zaktualizuj wygląd karty/kart podsumowania wyników.  Gdy tryb PRO jest
      // aktywny, dodajemy klasę pro-summary-card i pokazujemy etykietę PRO.
      // W przeciwnym razie usuwamy klasę i ukrywamy etykietę.
      const summaryIds = ['currentSummaryCard', 'currentSummaryCardLeft', 'currentSummaryCardRight'];
      summaryIds.forEach((sid) => {
        const card = document.getElementById(sid);
        if (!card) return;
        if (toggle.checked) {
          card.classList.add('pro-summary-card');
        } else {
          card.classList.remove('pro-summary-card');
        }
        // pokaż lub ukryj etykietę PRO wewnątrz karty
        const label = card.querySelector('.pro-summary-label');
        if (label) {
          label.style.display = toggle.checked ? 'block' : 'none';
        }
      });

      // Po aktualizacji klasy profesjonalnej zastosuj ustawienia motywu użytkownika
      if (typeof window.applyThemeCustom === 'function') {
        try {
          window.applyThemeCustom();
        } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 18581 });
    }
  }
      }
    }
    // Ustal tryb PRO przez VildaProAccess (PRO-0: zawsze false).
    // NIE czytamy tu z localStorage — decyzja należy do warstwy dostępu,
    // nie do preferencji zapisanej przez użytkownika.
    // PRO-3+: VildaProAccess.hasAccess() sprawdzi VildaVault/VildaSync.
    const _proAccess = (typeof window !== 'undefined' &&
      window.VildaProAccess &&
      typeof window.VildaProAccess.hasAccess === 'function')
      ? window.VildaProAccess.hasAccess()
      : false;
    professionalMode = _proAccess;
    // Zapamiętaj tryb także w obiekcie window, aby był dostępny dla
    // generateMetabolicSummary() (korzysta z window.professionalMode)
    try {
      window.professionalMode = professionalMode;
    } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 18593 });
    }
  }
    // Ustaw stan zaznaczenia (checked = tryb profesjonalny)
    toggle.checked = professionalMode;
    dispatchResultsModeSyncEvent(professionalMode);

    // Zaktualizuj klasę tła karty BMI zgodnie z początkowym stanem
    updateBmiCardBackground();
    // Zaktualizuj dostępność sekcji zaawansowanych obliczeń wzrostowych
    // w zależności od początkowego trybu profesjonalnego
    if (typeof updateAdvancedGrowthAccess === 'function') {
      try {
        updateAdvancedGrowthAccess();
      } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 18607 });
    }
  }
    }
    // Zaktualizuj dostępność opcji Palczewska w suwaku źródła danych.
    if (typeof updatePalczewskaAccess === 'function') {
      try {
        updatePalczewskaAccess();
      } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 18615 });
    }
  }
    }

    // Zaktualizuj widoczność instrukcji w prawej kolumnie zależnie od trybu wyników.
    if (typeof updateCompareInstructionVisibility === 'function') {
      try {
        updateCompareInstructionVisibility();
      } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 18624 });
    }
  }
    }
    // Obsłuż zmianę stanu suwaka
    toggle.addEventListener('change', () => {
      // Guard PRO-0+: blokuj włączenie trybu PRO jeśli użytkownik nie ma dostępu.
      // Przełącznik może próbować ustawić checked=true, ale jeśli VildaProAccess
      // nie potwierdza dostępu, natychmiast cofamy zmianę.
      // W PRO-3+ gdy hasAccess() zwróci true, guard przepuści zmianę.
      const _canEnablePro = (typeof window !== 'undefined' &&
        window.VildaProAccess &&
        typeof window.VildaProAccess.hasAccess === 'function')
        ? window.VildaProAccess.hasAccess()
        : false;
      if (toggle.checked && !_canEnablePro) {
        toggle.checked = false; // Przywróć stan — brak dostępu do PRO
        return;                 // Nie wykonuj dalszej logiki change
      }
      professionalMode = toggle.checked;
      // Zapisz bieżący stan również w obiekcie window, aby inne funkcje mogły
      // odczytać tryb profesjonalny za pomocą window.professionalMode.  Bez
      // tej instrukcji window.professionalMode może pozostać niezdefiniowane.
      try {
        window.professionalMode = professionalMode;
      } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 18636 });
    }
  }
      writeResultsModeStorage(professionalMode ? 'professional' : 'standard');
      dispatchResultsModeSyncEvent(professionalMode);

      // Przy przejściu ze standardu do trybu profesjonalnego karta
      // „Obliczenia wzrostowe” jest źródłem prawdy dla historii pomiarów.
      // Wcześniej poniższy handler uruchamiał calculateGrowthAdvanced()
      // zanim historia z karty podstawowej została zsynchronizowana do
      // modułu zaawansowanego.  Jeśli w zaawansowanej karcie istniał tylko
      // 1–2 wiersze, calculateGrowthAdvanced() synchronizowało krótszą
      // historię z powrotem do karty podstawowej i starsze pomiary znikały.
      // Dlatego przy włączaniu trybu PRO najpierw wymuszamy synchronizację
      // basic ➔ advanced, a dopiero potem wykonujemy dalsze przeliczenia.
      if (professionalMode) {
        try {
          if (typeof window !== 'undefined' && typeof window.reconcileGrowthHistoryModules === 'function') {
            window.reconcileGrowthHistoryModules('basic');
          }
        } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 18656 });
    }
  }
      }

      // Po zmianie trybu wyników zaktualizuj dostępność sekcji
      // zaawansowanych obliczeń wzrostowych.  Dzięki temu przycisk
      // „Zaawansowane obliczenia wzrostowe” zostanie aktywowany
      // lub dezaktywowany zgodnie z wybranym trybem, a karta przyjmie
      // właściwe obramowanie i etykietę PRO.
      if (typeof updateAdvancedGrowthAccess === 'function') {
        try {
          updateAdvancedGrowthAccess();
        } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 18669 });
    }
  }
      }

      // Po zmianie trybu wyników zaktualizuj dostępność opcji Palczewska.
      if (typeof updatePalczewskaAccess === 'function') {
        try {
          updatePalczewskaAccess();
        } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 18678 });
    }
  }
      }

      // Po zmianie trybu wyników zaktualizuj widoczność przycisku „Zalecenia dietetyczne”.
      // Funkcja updateDietRecommendationsVisibility (jeśli istnieje) ustawia stan
      // przycisku w zależności od warunków nadwagi/otyłości, wieku i trybu wyników.
      if (typeof updateDietRecommendationsVisibility === 'function') {
        try {
          updateDietRecommendationsVisibility();
        } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 18689 });
    }
  }
      }

      // Po zmianie trybu wyników zaktualizuj widoczność sekcji podsumowania metabolicznego.
      if (typeof updateMetabolicSummaryVisibility === 'function') {
        try {
          updateMetabolicSummaryVisibility();
        } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 18698 });
    }
  }
      }

      // Uaktualnij tło karty BMI i zastosuj ustawienia motywu użytkownika
      try {
        updateBmiCardBackground();
      } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 18706 });
    }
  }

      // Po zmianie trybu wyników zaktualizuj widoczność instrukcji w prawej kolumnie.
      if (typeof updateCompareInstructionVisibility === 'function') {
        try {
          updateCompareInstructionVisibility();
        } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 18714 });
    }
  }
      }

      // -------------------------------------------------------------------
      // Wyłącz jednorazowo autoscroll podczas przełączania trybu wyników
      //
      // Zmiana trybu (standardowy ↔ profesjonalny) powoduje wywołanie update()
      // oraz funkcji repozycjonujących, co w normalnych warunkach skutkuje
      // automatycznym przewinięciem strony do karty BMI.  Aby temu zapobiec
      // i pozwolić użytkownikowi pozostać w bieżącym miejscu, ustawiamy
      // licznik skipAutoScrollCounter na co najmniej 3.  Scroll będzie
      // pomijany podczas kolejnych wywołań scrollToResultsCard() aż do
      // momentu wyzerowania licznika w tej funkcji.
      if (!isVildaAutoScrollPermanentlyDisabled() && typeof skipAutoScrollCounter !== 'undefined') {
        // Ustaw wartość większą lub równą 3.  Korzystamy z Math.max, aby
        // nie resetować licznika do niższej wartości, jeśli został już
        // wcześniej zwiększony przez inne interakcje.
        skipAutoScrollCounter = Math.max(skipAutoScrollCounter, 3);
      }

      // Aktualizuj wyniki po zmianie trybu. Wywołujemy debouncedUpdate lub update,
      // a następnie niezależnie przeliczamy sekcję zaawansowaną, aby zawartość
      // ramki wyników „Zaawansowane obliczenia wzrostowe” zawsze reagowała na
      // zmianę trybu (ukrywając np. różnicę hSDS - mpSDS w trybie standardowym).
      if (typeof debouncedUpdate === 'function') {
        debouncedUpdate();
      } else if (typeof update === 'function') {
        update();
      }
      // Jeśli funkcja obliczeń zaawansowanych jest dostępna, uruchom ją ponownie,
      // aby wymusić aktualizację zawartości sekcji niezależnie od zmian w innych
      // polach formularza.
      if (typeof calculateGrowthAdvanced === 'function') {
        calculateGrowthAdvanced();
      }

      // Wywołaj aktualizację karty podsumowania wyników.  Dodajemy to
      // wywołanie, aby zapewnić natychmiastową reakcję na zmianę trybu.
      if (typeof updateProfessionalSummaryCard === 'function') {
        try { updateProfessionalSummaryCard(); } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 18755 });
    }
  }
      }

      // Po wszystkich powyższych aktualizacjach zaktualizuj pulsujące nakładki,
      // aby w trybie profesjonalnym ukryć oryginalne ramki i włączyć pulsowanie
      // zgodnie z nowym stanem suwaka.  Jeśli funkcja nie istnieje lub wystąpi błąd,
      // przechwycimy go i przejdziemy dalej bez wpływu na resztę UI.
      try {
        applyProModePulse(
          typeof window.lastWeightPercentile  !== 'undefined' ? window.lastWeightPercentile  : null,
          typeof window.lastHeightPercentile  !== 'undefined' ? window.lastHeightPercentile  : null,
          typeof window.lastBmiCategory       !== 'undefined' ? window.lastBmiCategory       : null,
          typeof window.lastBmiPercentile     !== 'undefined' ? window.lastBmiPercentile     : null,
          professionalMode
        );
      } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 18770 });
    }
  }
      // Po wszystkim zaktualizuj tło karty BMI
      updateBmiCardBackground();
    });
  }
  window.vildaAppOnReady('app:results-mode-toggle', initResultsModeToggle);
})();
/* =========================================================================
 * DOWN SYNDROME MODULE
 * Wydzielone w kroku 8J do vilda_down_syndrome.js z zachowaniem globalnych funkcji __ds_* i API window.VildaDownSyndrome.
 * ========================================================================= */

/* =========================================================================
 * ANOREXIA RISK MODULE
 * Wydzielone w kroku 8J do vilda_anorexia_risk.js z zachowaniem window.detectAnRisk i window.anorexiaRiskAdjust.
 * ========================================================================= */

// --- POLISH CENTILE DATA (Palczewska & Niedźwiecka 1999) ---
// Poniższe stałe reprezentują krzywe centylowe długości/wysokości i masy ciała
// dla dziewczynek i chłopców od 0 do 36 miesięcy, opracowane na podstawie
// badań I. Palczewskiej i Z. Niedźwieckiej (Warszawa 1999).  Dla każdej płci
// zdefiniowano słownik, w którym kluczem jest wartość centyla (3, 10, 25, 50,
// 75, 90, 97), a wartością jest tablica 37 elementów odpowiadających miesiącom
// życia (0–36).  Tablice powstały poprzez interpolację liniową pomiędzy
// miesiącami referencyjnymi i ekstrapolację do miesiąca 0 na podstawie
// nachylenia pierwszych dwóch punktów.
const CENTILES_PL_HEIGHT_GIRLS = {
  "3": [48.70, 51.00, 53.30, 56.80, 59.40, 61.80, 63.40, 64.77, 66.13, 67.50, 68.53, 69.57, 70.60, 71.67, 72.73, 73.80, 74.73, 75.67, 76.60, 77.53, 78.47, 79.40, 80.03, 80.67, 81.30, 82.05, 82.80, 83.55, 84.30, 85.05, 85.80, 86.50, 87.20, 87.90, 88.60, 89.30, 90.00],
  "10": [49.20, 51.80, 54.40, 58.00, 60.60, 63.10, 64.80, 66.17, 67.53, 68.90, 69.93, 70.97, 72.00, 73.10, 74.20, 75.30, 76.27, 77.23, 78.20, 79.10, 80.00, 80.90, 81.50, 82.10, 82.70, 83.43, 84.17, 84.90, 85.63, 86.37, 87.10, 87.77, 88.43, 89.10, 89.77, 90.43, 91.10],
  "25": [49.90, 52.80, 55.70, 59.20, 61.80, 64.30, 66.00, 67.40, 68.80, 70.20, 71.33, 72.47, 73.60, 74.73, 75.87, 77.00, 77.97, 78.93, 79.90, 80.77, 81.63, 82.50, 83.10, 83.70, 84.30, 85.08, 85.87, 86.65, 87.43, 88.22, 89.00, 89.68, 90.37, 91.05, 91.73, 92.42, 93.10],
  "50": [51.00, 54.00, 57.00, 60.60, 63.10, 65.50, 67.20, 68.63, 70.07, 71.50, 72.77, 74.03, 75.30, 76.47, 77.63, 78.80, 79.67, 80.53, 81.40, 82.27, 83.13, 84.00, 84.73, 85.47, 86.20, 87.07, 87.93, 88.80, 89.67, 90.53, 91.40, 92.10, 92.80, 93.50, 94.20, 94.90, 95.60],
  "75": [52.30, 55.40, 58.50, 62.00, 64.60, 66.90, 68.50, 69.93, 71.37, 72.80, 74.17, 75.53, 76.90, 78.07, 79.23, 80.40, 81.23, 82.07, 82.90, 83.87, 84.83, 85.80, 86.70, 87.60, 88.50, 89.35, 90.20, 91.05, 91.90, 92.75, 93.60, 94.27, 94.93, 95.60, 96.27, 96.93, 97.60],
  "90": [53.10, 56.40, 59.70, 63.00, 65.70, 67.90, 69.80, 71.27, 72.73, 74.20, 75.60, 77.00, 78.40, 79.50, 80.60, 81.70, 82.63, 83.57, 84.50, 85.57, 86.63, 87.70, 88.63, 89.57, 90.50, 91.40, 92.30, 93.20, 94.10, 95.00, 95.90, 96.58, 97.27, 97.95, 98.63, 99.32, 100.00],
  "97": [54.40, 57.60, 60.80, 64.00, 66.70, 69.00, 70.70, 72.27, 73.83, 75.40, 76.87, 78.33, 79.80, 81.00, 82.20, 83.40, 84.30, 85.20, 86.10, 87.17, 88.23, 89.30, 90.30, 91.30, 92.30, 93.20, 94.10, 95.00, 95.90, 96.80, 97.70, 98.50, 99.30, 100.10, 100.90, 101.70, 102.50],
};

const CENTILES_PL_HEIGHT_BOYS = {
  "3": [49.30, 52.00, 54.70, 57.90, 61.00, 63.00, 64.90, 66.10, 67.30, 68.50, 69.63, 70.77, 71.90, 72.90, 73.90, 74.90, 75.93, 76.97, 78.00, 79.00, 80.00, 81.00, 81.83, 82.67, 83.50, 84.00, 84.50, 85.00, 85.50, 86.00, 86.50, 87.05, 87.60, 88.15, 88.70, 89.25, 89.80],
  "10": [49.90, 53.00, 56.10, 59.50, 62.40, 64.40, 66.20, 67.53, 68.87, 70.20, 71.40, 72.60, 73.80, 74.77, 75.73, 76.70, 77.70, 78.70, 79.70, 80.63, 81.57, 82.50, 83.40, 84.30, 85.20, 85.77, 86.33, 86.90, 87.47, 88.03, 88.60, 89.20, 89.80, 90.40, 91.00, 91.60, 92.20],
  "25": [50.70, 54.00, 57.30, 60.90, 63.80, 65.80, 67.70, 69.03, 70.37, 71.70, 72.90, 74.10, 75.30, 76.37, 77.43, 78.50, 79.43, 80.37, 81.30, 82.13, 82.97, 83.80, 84.77, 85.73, 86.70, 87.37, 88.03, 88.70, 89.37, 90.03, 90.70, 91.30, 91.90, 92.50, 93.10, 93.70, 94.30],
  "50": [52.30, 55.50, 58.70, 62.40, 65.00, 67.30, 69.10, 70.40, 71.70, 73.00, 74.33, 75.67, 77.00, 78.10, 79.20, 80.30, 81.23, 82.17, 83.10, 83.90, 84.70, 85.50, 86.47, 87.43, 88.40, 89.08, 89.77, 90.45, 91.13, 91.82, 92.50, 93.20, 93.90, 94.60, 95.30, 96.00, 96.70],
  "75": [53.00, 56.60, 60.20, 63.70, 66.30, 68.70, 70.60, 71.97, 73.33, 74.70, 76.03, 77.37, 78.70, 79.77, 80.83, 81.90, 82.83, 83.77, 84.70, 85.50, 86.30, 87.10, 88.17, 89.23, 90.30, 91.00, 91.70, 92.40, 93.10, 93.80, 94.50, 95.17, 95.83, 96.50, 97.17, 97.83, 98.50],
  "90": [54.00, 57.70, 61.40, 64.90, 67.50, 69.90, 72.00, 73.43, 74.87, 76.30, 77.63, 78.97, 80.30, 81.33, 82.37, 83.40, 84.33, 85.27, 86.20, 87.03, 87.87, 88.70, 89.83, 90.97, 92.10, 92.78, 93.47, 94.15, 94.83, 95.52, 96.20, 96.90, 97.60, 98.30, 99.00, 99.70, 100.40],
  "97": [55.60, 59.30, 63.00, 66.20, 68.70, 70.80, 73.10, 74.63, 76.17, 77.70, 79.03, 80.37, 81.70, 82.80, 83.90, 85.00, 85.93, 86.87, 87.80, 88.63, 89.47, 90.30, 91.43, 92.57, 93.70, 94.42, 95.13, 95.85, 96.57, 97.28, 98.00, 98.77, 99.53, 100.30, 101.07, 101.83, 102.60],
};

const CENTILES_PL_WEIGHT_GIRLS = {
  "3": [2.40, 3.20, 4.00, 4.70, 5.40, 5.90, 6.30, 6.63, 6.97, 7.30, 7.50, 7.70, 7.90, 8.10, 8.30, 8.50, 8.67, 8.83, 9.00, 9.13, 9.27, 9.40, 9.53, 9.67, 9.80, 9.97, 10.13, 10.30, 10.47, 10.63, 10.80, 10.97, 11.13, 11.30, 11.47, 11.63, 11.80],
  "10": [2.80, 3.60, 4.40, 5.00, 5.70, 6.20, 6.70, 7.03, 7.37, 7.70, 7.97, 8.23, 8.50, 8.70, 8.90, 9.10, 9.30, 9.50, 9.70, 9.87, 10.03, 10.20, 10.33, 10.47, 10.60, 10.77, 10.93, 11.10, 11.27, 11.43, 11.60, 11.78, 11.97, 12.15, 12.33, 12.52, 12.70],
  "25": [3.30, 4.00, 4.70, 5.40, 6.20, 6.50, 7.00, 7.37, 7.73, 8.10, 8.40, 8.70, 9.00, 9.23, 9.47, 9.70, 9.93, 10.17, 10.40, 10.57, 10.73, 10.90, 11.03, 11.17, 11.30, 11.47, 11.63, 11.80, 11.97, 12.13, 12.30, 12.48, 12.67, 12.85, 13.03, 13.22, 13.40],
  "50": [3.60, 4.30, 5.00, 5.80, 6.50, 7.00, 7.50, 7.87, 8.23, 8.60, 8.93, 9.27, 9.60, 9.90, 10.20, 10.50, 10.70, 10.90, 11.10, 11.30, 11.50, 11.70, 11.83, 11.97, 12.10, 12.28, 12.47, 12.65, 12.83, 13.02, 13.20, 13.45, 13.70, 13.95, 14.20, 14.45, 14.70],
  "75": [3.80, 4.60, 5.40, 6.20, 7.00, 7.50, 8.00, 8.40, 8.80, 9.20, 9.57, 9.93, 10.30, 10.67, 11.03, 11.40, 11.60, 11.80, 12.00, 12.20, 12.40, 12.60, 12.80, 13.00, 13.20, 13.40, 13.60, 13.80, 14.00, 14.20, 14.40, 14.63, 14.87, 15.10, 15.33, 15.57, 15.80],
  "90": [3.90, 4.80, 5.70, 6.60, 7.50, 8.00, 8.50, 8.93, 9.37, 9.80, 10.20, 10.60, 11.00, 11.43, 11.87, 12.30, 12.50, 12.70, 12.90, 13.17, 13.43, 13.70, 13.93, 14.17, 14.40, 14.57, 14.73, 14.90, 15.07, 15.23, 15.40, 15.63, 15.87, 16.10, 16.33, 16.57, 16.80],
  "97": [3.90, 5.00, 6.10, 7.10, 7.90, 8.50, 9.10, 9.53, 9.97, 10.40, 10.83, 11.27, 11.70, 12.17, 12.63, 13.10, 13.40, 13.70, 14.00, 14.27, 14.53, 14.80, 15.07, 15.33, 15.60, 15.77, 15.93, 16.10, 16.27, 16.43, 16.60, 16.80, 17.00, 17.20, 17.40, 17.60, 17.80],
};

const CENTILES_PL_WEIGHT_BOYS = {
  "3": [2.80, 3.70, 4.60, 5.30, 5.90, 6.40, 6.80, 7.13, 7.47, 7.80, 8.07, 8.33, 8.60, 8.80, 9.00, 9.20, 9.37, 9.53, 9.70, 9.83, 9.97, 10.10, 10.27, 10.43, 10.60, 10.73, 10.87, 11.00, 11.13, 11.27, 11.40, 11.57, 11.73, 11.90, 12.07, 12.23, 12.40],
  "10": [3.20, 4.00, 4.80, 5.60, 6.20, 6.80, 7.20, 7.57, 7.93, 8.30, 8.53, 8.77, 9.00, 9.23, 9.47, 9.70, 9.90, 10.10, 10.30, 10.47, 10.63, 10.80, 10.97, 11.13, 11.30, 11.47, 11.63, 11.80, 11.97, 12.13, 12.30, 12.45, 12.60, 12.75, 12.90, 13.05, 13.20],
  "25": [3.50, 4.30, 5.10, 6.00, 6.70, 7.20, 7.70, 8.03, 8.37, 8.70, 8.97, 9.23, 9.50, 9.73, 9.97, 10.20, 10.43, 10.67, 10.90, 11.13, 11.37, 11.60, 11.77, 11.93, 12.10, 12.27, 12.43, 12.60, 12.77, 12.93, 13.10, 13.25, 13.40, 13.55, 13.70, 13.85, 14.00],
  "50": [3.70, 4.60, 5.50, 6.40, 7.20, 7.70, 8.20, 8.57, 8.93, 9.30, 9.60, 9.90, 10.20, 10.43, 10.67, 10.90, 11.17, 11.43, 11.70, 11.97, 12.23, 12.50, 12.67, 12.83, 13.00, 13.18, 13.37, 13.55, 13.73, 13.92, 14.10, 14.23, 14.37, 14.50, 14.63, 14.77, 14.90],
  "75": [4.00, 5.00, 6.00, 7.00, 7.60, 8.30, 8.70, 9.13, 9.57, 10.00, 10.30, 10.60, 10.90, 11.13, 11.37, 11.60, 11.87, 12.13, 12.40, 12.67, 12.93, 13.20, 13.47, 13.73, 14.00, 14.17, 14.33, 14.50, 14.67, 14.83, 15.00, 15.20, 15.40, 15.60, 15.80, 16.00, 16.20],
  "90": [4.10, 5.20, 6.30, 7.30, 8.10, 8.70, 9.20, 9.67, 10.13, 10.60, 10.87, 11.13, 11.40, 11.73, 12.07, 12.40, 12.67, 12.93, 13.20, 13.43, 13.67, 13.90, 14.20, 14.50, 14.80, 14.98, 15.17, 15.35, 15.53, 15.72, 15.90, 16.12, 16.33, 16.55, 16.77, 16.98, 17.20],
  "97": [4.40, 5.50, 6.60, 7.70, 8.60, 9.30, 9.90, 10.40, 10.90, 11.40, 11.80, 12.20, 12.60, 12.87, 13.13, 13.40, 13.70, 14.00, 14.30, 14.57, 14.83, 15.10, 15.33, 15.57, 15.80, 16.00, 16.20, 16.40, 16.60, 16.80, 17.00, 17.25, 17.50, 17.75, 18.00, 18.25, 18.50],
};

// Wspólny helper dla danych Palczewskiej.  Dzięki niemu wykresy i obliczenia
// (centyle / Z-score) korzystają z dokładnie tego samego źródła referencyjnego
// `centileData`.  Dla wieku < 1 miesiąca stosujemy liniową ekstrapolację na
// podstawie dwóch pierwszych punktów tabelarycznych, co zachowuje płynny początek
// krzywych bez wracania do osobnej, zdublowanej bazy miesięcznych tablic.
function getPalReferenceCentileInterpolated(sex, months, centile, param) {
  const palReferenceData = vildaRequireGlobalObject('centileData', 'palczewska-centile-reference', { silent: true });
  if (!palReferenceData) return null;
  const m = Number(months);
  if (!Number.isFinite(m) || m < 0) return null;

  const sexKey = (sex === 'M') ? 'boys' : 'girls';
  const dataKey = (param === 'WT') ? 'weight' : (param === 'HT') ? 'height' : 'bmi';
  const arr = palReferenceData[sexKey] && palReferenceData[sexKey][dataKey];
  if (!Array.isArray(arr) || !arr.length) return null;

  const key = 'p' + centile;
  const first = arr[0];
  const last = arr[arr.length - 1];
  const firstVal = first ? first[key] : null;
  const lastVal = last ? last[key] : null;
  if (typeof firstVal !== 'number') return null;

  if (m <= first.months) {
    if (m === first.months || arr.length < 2) return firstVal;
    const second = arr[1];
    const secondVal = second ? second[key] : null;
    if (typeof secondVal !== 'number' || !Number.isFinite(second.months) || second.months === first.months) {
      return firstVal;
    }
    const slope = (secondVal - firstVal) / (second.months - first.months);
    return firstVal + (m - first.months) * slope;
  }

  if (m >= last.months) {
    return (typeof lastVal === 'number') ? lastVal : null;
  }

  for (let i = 0; i < arr.length - 1; i++) {
    const lower = arr[i];
    const upper = arr[i + 1];
    if (m < lower.months || m > upper.months) continue;
    const lowVal = lower[key];
    const upVal = upper[key];
    if (typeof lowVal !== 'number' && typeof upVal !== 'number') return null;
    if (typeof lowVal !== 'number') return upVal;
    if (typeof upVal !== 'number') return lowVal;
    if (upper.months === lower.months) return lowVal;
    const t = (m - lower.months) / (upper.months - lower.months);
    return lowVal + t * (upVal - lowVal);
  }

  return (typeof lastVal === 'number') ? lastVal : null;
}

// Funkcja zwracająca wartość centyla dla wzrostu (0–36 mies.) na podstawie płci, miesiąca i centyla.
// Nazwa zostaje dla zgodności wstecznej, ale źródło danych jest już wspólne z obliczeniami.
function getPLHeightCentile(sex, m, p) {
  if (typeof m !== 'number' || m < 0 || m > 36) return undefined;
  const value = getPalReferenceCentileInterpolated(sex, m, p, 'HT');
  return (typeof value === 'number' && Number.isFinite(value)) ? value : undefined;
}

// Funkcja zwracająca wartość centyla dla masy ciała (0–36 mies.) na podstawie płci, miesiąca i centyla.
// Nazwa zostaje dla zgodności wstecznej, ale źródło danych jest już wspólne z obliczeniami.
function getPLWeightCentile(sex, m, p) {
  if (typeof m !== 'number' || m < 0 || m > 36) return undefined;
  const value = getPalReferenceCentileInterpolated(sex, m, p, 'WT');
  return (typeof value === 'number' && Number.isFinite(value)) ? value : undefined;
}

// Uczyńmy zmienne i funkcje globalnie dostępne, aby mogły być używane w innych plikach (np. HTML).
window.CENTILES_PL_HEIGHT_GIRLS = CENTILES_PL_HEIGHT_GIRLS;
window.CENTILES_PL_HEIGHT_BOYS = CENTILES_PL_HEIGHT_BOYS;
window.CENTILES_PL_WEIGHT_GIRLS = CENTILES_PL_WEIGHT_GIRLS;
window.CENTILES_PL_WEIGHT_BOYS = CENTILES_PL_WEIGHT_BOYS;
window.getPLHeightCentile = getPLHeightCentile;
window.getPLWeightCentile = getPLWeightCentile;
window.getPalReferenceCentileInterpolated = getPalReferenceCentileInterpolated;

/*
 * =====================================================================
 *  Funkcje pomocnicze dla danych Palczewskiej i Niedźwieckiej (0–36 mies.)
 *
 *  Dane w tablicach CENTILES_PL_* zawierają wartości centylowe długości i
 *  masy ciała dla wybranych centyli (3, 10, 25, 50, 75, 90, 97) w każdym
 *  miesiącu życia. Aby móc wykorzystać te dane do obliczania pozycji
 *  dziecka na krzywej centylowej (w formie percentyla) oraz odpowiadającego
 *  z-score (SD), poniżej definiujemy funkcje:
 *    - normInv(p): przybliżenie odwrotnej dystrybuanty normalnej. Pozwala
 *      przekształcić percentyl na z‑score dla standardowego rozkładu normalnego.
 *    - calcPercentileStatsPL(value, sex, ageYears, param): zwraca obiekt
 *      {percentile, sd} dla danej wartości wagi (param = 'WT') lub
 *      wzrostu (param = 'HT') dla wieku w latach (0–3). Percentyl jest
 *      interpolowany liniowo pomiędzy zdefiniowanymi centylami. Z‑score
 *      obliczamy jako odwrotność dystrybuanty standardowego rozkładu
 *      normalnego.
 *    - bmiPercentileChildPL(bmi, sex, months): oblicza percentyl BMI
 *      przez zbudowanie pomocniczych krzywych BMI na podstawie danych
 *      Palczewskiej. Dla każdego z centyli (3,10,25,50,75,90,97) BMI
 *      obliczamy jako waga_centyl / (wzrost_centyl/100)^2. Percentyl BMI
 *      wyznaczamy liniowo jak wyżej. Zwraca percentyl (0–100) lub null.
 */

// Odwrotna dystrybuanta normalna (aproksymacja metody Moro/Acklama)
function normInv(p) {
  // Zabezpieczenie przed wartościami spoza [0,1]
  if (typeof p !== 'number' || isNaN(p)) return NaN;
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  // Stałe dla aproksymacji Acklama
  const a1 = -39.6968302866538, a2 = 220.946098424521,
        a3 = -275.928510446969, a4 = 138.357751867269,
        a5 = -30.6647980661472, a6 = 2.50662827745924;
  const b1 = -54.4760987982241, b2 = 161.585836858041,
        b3 = -155.698979859887, b4 = 66.8013118877197,
        b5 = -13.2806815528857;
  const c1 = -0.00778489400243029, c2 = -0.322396458041136,
        c3 = -2.40075827716184, c4 = -2.54973253934373,
        c5 =  4.37466414146497, c6 =  2.93816398269878;
  const d1 =  0.00778469570904146, d2 =  0.32246712907004,
        d3 =  2.445134137143,    d4 =  3.75440866190742;
  const plow = 0.02425;
  const phigh = 1 - plow;
  let q, r;
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
           ((((d1 * q + d2) * q + d3) * q + d4) * q + 1);
  }
  if (p > phigh) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
            ((((d1 * q + d2) * q + d3) * q + d4) * q + 1);
  }
  q = p - 0.5;
  r = q * q;
  return (((((a1 * r + a2) * r + a3) * r + a4) * r + a5) * r + a6) * q /
         (((((b1 * r + b2) * r + b3) * r + b4) * r + b5) * r + 1);
}

// Oblicz percentyl i z‑score dla danych Palczewskiej (masa lub wzrost)
function calcPercentileStatsPL(value, sex, ageYears, param) {
  const ageMonths = Math.round(ageYears * 12);
  if (ageMonths < 0 || ageMonths > 36) return null;
  // Zdefiniowane centyle
  const centiles = [3, 10, 25, 50, 75, 90, 97];
  const pairs = [];
  for (const c of centiles) {
    let v;
    if (param === 'WT') {
      v = getPLWeightCentile(sex, ageMonths, c);
    } else {
      v = getPLHeightCentile(sex, ageMonths, c);
    }
    if (typeof v === 'number') {
      pairs.push({ centile: c, value: v });
    }
  }
  if (!pairs.length) return null;
  // Sortuj rosnąco po wartości
  pairs.sort((a, b) => a.value - b.value);
  let percentile;
  // Dla wartości poniżej najniższego centyla – ekstrapolacja liniowa do 0
  if (value <= pairs[0].value) {
    const first = pairs[0];
    // p = (value / v1) * c1, ale ogranicz do [0, first.centile]
    percentile = (value / first.value) * first.centile;
    if (percentile < 0) percentile = 0;
  } else if (value >= pairs[pairs.length - 1].value) {
    // Powyżej najwyższego centyla – ekstrapolacja liniowa do 100
    const last = pairs[pairs.length - 1];
    const prev = pairs[pairs.length - 2];
    const slope = (100 - last.centile) / (last.value - prev.value);
    percentile = last.centile + (value - last.value) * slope;
    if (percentile > 100) percentile = 100;
  } else {
    // Między dwoma sąsiadującymi centylami – interpolacja liniowa
    let lower = pairs[0], upper = pairs[1];
    for (let i = 0; i < pairs.length - 1; i++) {
      if (value >= pairs[i].value && value <= pairs[i + 1].value) {
        lower = pairs[i];
        upper = pairs[i + 1];
        break;
      }
    }
    const fraction = (value - lower.value) / (upper.value - lower.value);
    percentile = lower.centile + fraction * (upper.centile - lower.centile);
  }
  /*
   * Zamiast bezpośrednio przekształcać percentyl na z‑score za pomocą
   * normInv(percentile/100) – co dla procentyli 0 i 100 dawało ±∞ –
   * obliczamy z‑score poprzez interpolację liniową (i ekstrapolację)
   * pomiędzy z‑score odpowiadającymi zdefiniowanym centylom w
   * palczewskiej siatce (3,10,25,50,75,90,97).  Każdemu centylowi
   * przypisujemy z‑score `normInv(c/100)`.  Następnie dla wartości
   * `value` wyznaczamy z‑score `z` na podstawie pozycji `value`
   * pomiędzy sąsiadującymi centylami (lub poza zakresem – wtedy
   * stosujemy liniową ekstrapolację z ostatnich dwóch punktów).  W ten
   * sposób z‑score rośnie (lub maleje) w miarę oddalania się od
   * ostatniego zdefiniowanego centyla, zamiast natychmiast przechodzić
   * w nieskończoność.  Na końcu przeliczamy z‑score z powrotem na
   * percentyl przy użyciu dystrybuanty normalnej (normalCDF), co
   * zapewnia wynik procentowy w przedziale 0–100.  Zwracamy zarówno
   * wyliczony percentyl, jak i z‑score.
   */
  // Przygotuj tablicę z parami (wartość, z‑score) dla zdefiniowanych centyli
  const pairsZ = [];
  for (const c of pairs.map(p => p.centile)) {
    // Znajdź odpowiadającą wartość dla centyla c
    const v = pairs.find(p => p.centile === c).value;
    const zc = normInv(c / 100);
    pairsZ.push({ centile: c, value: v, z: zc });
  }
  // Posortuj po wartości (powinno być już posortowane, ale upewniamy się)
  pairsZ.sort((a, b) => a.value - b.value);
  let z;
  if (value <= pairsZ[0].value) {
    // liniowa ekstrapolacja poniżej najniższego centyla
    const first = pairsZ[0];
    const next  = pairsZ[1];
    const slopeZ = (next.z - first.z) / (next.value - first.value);
    z = first.z + (value - first.value) * slopeZ;
  } else if (value >= pairsZ[pairsZ.length - 1].value) {
    // liniowa ekstrapolacja powyżej najwyższego centyla
    const last = pairsZ[pairsZ.length - 1];
    const prev = pairsZ[pairsZ.length - 2];
    const slopeZ = (last.z - prev.z) / (last.value - prev.value);
    z = last.z + (value - last.value) * slopeZ;
  } else {
    // interpolacja liniowa pomiędzy sąsiadującymi centylami
    let lower = pairsZ[0], upper = pairsZ[1];
    for (let i = 0; i < pairsZ.length - 1; i++) {
      if (value >= pairsZ[i].value && value <= pairsZ[i + 1].value) {
        lower = pairsZ[i];
        upper = pairsZ[i + 1];
        break;
      }
    }
    const fraction = (value - lower.value) / (upper.value - lower.value);
    z = lower.z + fraction * (upper.z - lower.z);
  }
  // Oblicz percentyl na podstawie z‑score i dystrybuanty normalnej
  const percentileCalc = normalCDF(z) * 100;
  // Upewnij się, że percentyl mieści się w przedziale 0–100
  const percClamped = Math.max(0, Math.min(100, percentileCalc));
  return { percentile: percClamped, sd: z };
}

// Oblicz percentyl BMI na podstawie danych Palczewskiej
function bmiPercentileChildPL(bmi, sex, months) {
  const m = Math.round(months);
  if (m < 0 || m > 36) return null;
  // Zdefiniowane centyle
  const centiles = [3, 10, 25, 50, 75, 90, 97];
  const bmiPairs = [];
  for (const c of centiles) {
    const w = getPLWeightCentile(sex, m, c);
    const h = getPLHeightCentile(sex, m, c);
    if (typeof w === 'number' && typeof h === 'number' && h > 0) {
      const bmiVal = w / Math.pow(h / 100, 2);
      bmiPairs.push({ centile: c, value: bmiVal });
    }
  }
  if (!bmiPairs.length) return null;
  // Sortuj według wartości BMI
  bmiPairs.sort((a, b) => a.value - b.value);
  let percentile;
  if (bmi <= bmiPairs[0].value) {
    const first = bmiPairs[0];
    percentile = (bmi / first.value) * first.centile;
    if (percentile < 0) percentile = 0;
  } else if (bmi >= bmiPairs[bmiPairs.length - 1].value) {
    const last = bmiPairs[bmiPairs.length - 1];
    const prev = bmiPairs[bmiPairs.length - 2];
    const slope = (100 - last.centile) / (last.value - prev.value);
    percentile = last.centile + (bmi - last.value) * slope;
    if (percentile > 100) percentile = 100;
  } else {
    let lower = bmiPairs[0], upper = bmiPairs[1];
    for (let i = 0; i < bmiPairs.length - 1; i++) {
      if (bmi >= bmiPairs[i].value && bmi <= bmiPairs[i + 1].value) {
        lower = bmiPairs[i];
        upper = bmiPairs[i + 1];
        break;
      }
    }
    const fraction = (bmi - lower.value) / (upper.value - lower.value);
    percentile = lower.centile + fraction * (upper.centile - lower.centile);
  }
  return percentile;
}

/*
 * --------------------------------------------------------------
 *  Rozszerzone funkcje dla danych Palczewskiej (0–18 lat)
 *  Poniższe funkcje korzystają z globalnego obiektu `centileData`,
 *  który jest wczytywany z pliku centile_data.js. Dane obejmują
 *  centyle dla masy, wzrostu i BMI w wieku od 1 miesiąca do 18,5 lat.
 *  Wartości są interpolowane liniowo pomiędzy sąsiadującymi punktami.
 *
 *  - getPalCentile(sex, months, centile, param): pobiera wartość dla
 *    podanego centyla (3,10,25,50,75,90,97), płci (M/F), wieku w
 *    miesiącach i parametru ('WT' – waga, 'HT' – wzrost, 'BMI').
 *  - calcPercentileStatsPal(value, sex, ageYears, param): oblicza
 *    percentyl i z‑score dla dowolnej wartości (masa, wzrost lub BMI)
 *    bazując na rozszerzonych danych Palczewskiej.
 *  - bmiPercentileChildPal(bmi, sex, months): wyznacza percentyl BMI
 *    przy użyciu tabel centylowych BMI Palczewskiej.
 */

// Pobierz interpolowaną wartość centylową z danych Palczewskiej.
// Obliczenia pozostają oparte na pełnych miesiącach, ale korzystają z tego
// samego helpera co siatki, więc nie ma już osobnej ścieżki dla wieku < 3 lat.
function getPalCentile(sex, months, centile, param) {
  const m = Math.round(months);
  const value = getPalReferenceCentileInterpolated(sex, m, centile, param);
  return (typeof value === 'number' && Number.isFinite(value)) ? value : null;
}

// Oblicz percentyl i z‑score dla wartości wagi, wzrostu lub BMI w oparciu o dane Palczewskiej (0–18 l.)
function calcPercentileStatsPal(value, sex, ageYears, param) {
  const months = Math.round(ageYears * 12);
  const centiles = [3, 10, 25, 50, 75, 90, 97];
  const pairs = [];
  for (const c of centiles) {
    const v = getPalCentile(sex, months, c, param);
    if (typeof v === 'number') {
      pairs.push({ centile: c, value: v });
    }
  }
  if (!pairs.length) return null;
  // sortuj według wartości
  pairs.sort((a, b) => a.value - b.value);
  let percentile;
  if (value <= pairs[0].value) {
    const first = pairs[0];
    percentile = (value / first.value) * first.centile;
    if (percentile < 0) percentile = 0;
  } else if (value >= pairs[pairs.length - 1].value) {
    const last = pairs[pairs.length - 1];
    const prev = pairs[pairs.length - 2];
    const slope = (100 - last.centile) / (last.value - prev.value);
    percentile = last.centile + (value - last.value) * slope;
    if (percentile > 100) percentile = 100;
  } else {
    let lower = pairs[0], upper = pairs[1];
    for (let i = 0; i < pairs.length - 1; i++) {
      if (value >= pairs[i].value && value <= pairs[i + 1].value) {
        lower = pairs[i];
        upper = pairs[i + 1];
        break;
      }
    }
    const fraction = (value - lower.value) / (upper.value - lower.value);
    percentile = lower.centile + fraction * (upper.centile - lower.centile);
  }
  // oblicz z-score poprzez interpolację z-score zdefiniowanych centyli
  const pairsZ = [];
  for (const pObj of pairs) {
    const zc = normInv(pObj.centile / 100);
    pairsZ.push({ value: pObj.value, z: zc });
  }
  pairsZ.sort((a, b) => a.value - b.value);
  let z;
  if (value <= pairsZ[0].value) {
    const first = pairsZ[0];
    const next  = pairsZ[1];
    const slopeZ = (next.z - first.z) / (next.value - first.value);
    z = first.z + (value - first.value) * slopeZ;
  } else if (value >= pairsZ[pairsZ.length - 1].value) {
    const lastP = pairsZ[pairsZ.length - 1];
    const prev  = pairsZ[pairsZ.length - 2];
    const slopeZ = (lastP.z - prev.z) / (lastP.value - prev.value);
    z = lastP.z + (value - lastP.value) * slopeZ;
  } else {
    let lower = pairsZ[0], upper = pairsZ[1];
    for (let i = 0; i < pairsZ.length - 1; i++) {
      if (value >= pairsZ[i].value && value <= pairsZ[i + 1].value) {
        lower = pairsZ[i];
        upper = pairsZ[i + 1];
        break;
      }
    }
    const fraction = (value - lower.value) / (upper.value - lower.value);
    z = lower.z + fraction * (upper.z - lower.z);
  }
  const percentileCalc = normalCDF(z) * 100;
  const percClamped   = Math.max(0, Math.min(100, percentileCalc));
  return { percentile: percClamped, sd: z };
}

// Oblicz percentyl BMI na podstawie rozszerzonych danych Palczewskiej
function bmiPercentileChildPal(bmi, sex, months) {
  /*
   * Percentyl BMI dla Palczewskiej wyprowadzamy z tej samej funkcji, która
   * zwraca z‑score (`calcPercentileStatsPal`). Dzięki temu percentyl i z‑score
   * pozostają spójne także powyżej 97. centyla. Wcześniej percentyl był
   * ekstrapolowany osobno w przestrzeni centyli (97 ➔ 100), co mogło dawać
   * wynik „>100 centyla” i kategorię „Otyłość olbrzymia” przy z‑score wyraźnie
   * poniżej 3 SD.
   */
  const stats = calcPercentileStatsPal(bmi, sex, months / 12, 'BMI');
  return stats ? stats.percentile : null;
}

/* =====================================================================
 * Layout sekcji lekarza i podsumowania metabolicznego został wydzielony do vilda_summary_cards.js w kroku 8Q-4.
 * ===================================================================== */
/**
 * Przenosi przełącznik Palczewska / OLAF / WHO do środka karty wyników
 * BMI/BMR tak, aby znalazł się pomiędzy „kartą” z BMI a „kartą” z BMR.
 * Działa zarówno na desktopie, jak i w widoku mobilnym.
 */
function repositionDataSourceToggle() {
  // reposition disabled to prevent layout shifts
  return;
  const bmrInfo = document.getElementById('bmrInfo');
  const toggle  = document.getElementById('dataToggleContainer');
  if (!bmrInfo || !toggle) return;

  const resultBoxes = bmrInfo.querySelectorAll('.result-box');

  // Brak wygenerowanych wyników – osadź przełącznik na początku sekcji
  if (!resultBoxes.length) {
    bmrInfo.insertAdjacentElement('afterbegin', toggle);
    return;
  }

  // Spróbuj znaleźć kartę BMR po tekście „BMR:”
  let bmrBox = null;
  resultBoxes.forEach(box => {
    if (!bmrBox && box.textContent.includes('BMR:')) {
      bmrBox = box;
    }
  });

  if (bmrBox) {
    // Wstaw przełącznik bezpośrednio przed kartą BMR (czyli po karcie BMI)
    bmrInfo.insertBefore(toggle, bmrBox);
  } else {
    // Fallback: wstaw przełącznik za ostatnią kartą wyników
    resultBoxes[resultBoxes.length - 1].insertAdjacentElement('afterend', toggle);
  }
}
/**
 * Przenosi kontener przycisków generowania siatek centylowych (#centileButtons)
 * tak, aby był dokładnie pod przełącznikiem Palczewska / OLAF / WHO
 * (czyli między polem wyniku BMI a polem wyniku BMR).
 */
function repositionCentileButtons() {
  // reposition disabled to prevent layout shifts
  return;
  const bmrInfo  = document.getElementById('bmrInfo');
  const toggle   = document.getElementById('dataToggleContainer');
  const buttons  = document.getElementById('centileButtons');
  if (!bmrInfo || !buttons) return;

  // Jeśli przełącznik jest już w bmrInfo (po repositionDataSourceToggle),
  // wstaw przyciski zaraz po nim: BMI -> toggle -> przyciski -> BMR
  if (toggle && toggle.parentElement === bmrInfo) {
    if (toggle.nextElementSibling !== buttons) {
      toggle.insertAdjacentElement('afterend', buttons);
    }
    return;
  }

  // Fallback: znajdź box BMR i wstaw przyciski tuż przed nim
  const resultBoxes = bmrInfo.querySelectorAll('.result-box');
  let bmrBox = null;
  resultBoxes.forEach((box) => {
    if (!bmrBox && box.textContent.includes('BMR:')) bmrBox = box;
  });

  if (bmrBox) {
    bmrInfo.insertBefore(buttons, bmrBox);
  } else {
    bmrInfo.appendChild(buttons);
  }
}

/**
 * Smoothly scrolls the first results card (BMI card) into view.  This function
 * is called after the user enters all required input data (wiek, waga, wzrost)
 * and the results have been generated.  It centres the BMI card in the viewport
 * so that users can immediately see their calculations.  If the BMI card
 * element is not found, the function quietly does nothing.
 */
function scrollToResultsCard() {
  // Nie wykonuj przewijania, jeśli funkcja została wyłączona po wczytaniu danych.
  if (typeof autoScrollDisabled !== 'undefined' && autoScrollDisabled) {
    return;
  }
  // Jeśli użytkownik edytuje aktualnie pole wieku w miesiącach (#ageMonths),
  // wstrzymaj przewijanie.  Kursor miga w tym polu podczas wprowadzania danych,
  // więc przewijanie mogłoby przerwać edycję.  Scroll zostanie wykonany dopiero
  // po zakończeniu edycji (blur lub Enter).
  if (typeof editingAgeMonths !== 'undefined' && editingAgeMonths) {
    return;
  }

  // Jeżeli ustawiono licznik skipAutoScrollCounter na wartość dodatnią,
  // pomijamy aktualne przewijanie i dekrementujemy licznik.  Zapobiega
  // to automatycznemu przewijaniu po edycji pól, które nie powinny
  // wywoływać zmiany widoku (np. obwód talii/bioder, listy przekąsek/dań,
  // karta planu odchudzania).  Zastosowanie licznika pozwala na
  // pominięcie kilku następujących po sobie prób przewinięcia.
  if (typeof skipAutoScrollCounter !== 'undefined' && skipAutoScrollCounter > 0) {
    skipAutoScrollCounter--;
    return;
  }
  /**
   * Płynnie przewija stronę tak, aby górna krawędź pierwszej karty z wynikami
   * (BMI card) wyrównała się z górną krawędzią okna przeglądarki.  Przewijanie
   * jest wolniejsze niż domyślne zachowanie scrollIntoView, dzięki czemu
   * użytkownik może komfortowo śledzić ruch strony.  Jeżeli użytkownik nadal
   * edytuje któreś z pól wieku, wagi lub wzrostu (kursor miga w polu), funkcja
   * nie wykonuje przewijania, aby nie przerywać wprowadzania danych.
   */
  const bmiCard     = document.getElementById('bmiCard');
  const ageInput    = document.getElementById('age');
  const weightInput = document.getElementById('weight');
  const heightInput = document.getElementById('height');
  const resultsEl   = document.getElementById('results');
  if (!bmiCard || !ageInput || !weightInput || !heightInput || !resultsEl) {
    return;
  }
  // Sprawdź, czy wszystkie wymagane pola są jawnie wypełnione poprawnymi liczbami.
  // Wiek 0 lat jest poprawny, jeśli został wpisany przez użytkownika.
  const anthroValidation = (typeof vildaGetMainAnthroValidationSnapshot === 'function')
    ? vildaGetMainAnthroValidationSnapshot()
    : null;
  if (!(anthroValidation && anthroValidation.complete)) {
    return;
  }
  // Nie zwracamy jeszcze, gdy użytkownik edytuje jedno z pól.  
  // Płynne przewijanie zostanie zaplanowane poniżej, a ostateczna
  // kontrola aktywnego pola zostanie wykonana tuż przed rozpoczęciem
  // przewijania (w środku setTimeout).  Dzięki temu unikamy sytuacji,
  // w której scroll nie byłby w ogóle zaplanowany, jeśli funkcja
  // scrollToResultsCard została wywołana w trakcie wpisywania danych.
  // Funkcja pomocnicza jest zdefiniowana globalnie jako smoothScrollToElement,
  // dlatego nie definiujemy jej ponownie wewnątrz scrollToResultsCard.
  // Zamiast tego, skorzystamy z globalnej funkcji smoothScrollToElement,
  // która przyjmuje element docelowy oraz czas trwania animacji.
  // Używamy niewielkiego opóźnienia, aby mieć pewność, że elementy zostały
  // w pełni wyrenderowane i przelokowane (funkcje reposition* mogły zmienić layout).
  setTimeout(() => {
    // Ponowne sprawdzenie aktywnego elementu tuż przed przewijaniem
    const currentActive = document.activeElement;
    if (currentActive === ageInput || currentActive === weightInput || currentActive === heightInput) {
      return;
    }
    // Nie przewijaj, jeśli kursor znajduje się w którymkolwiek z wyłączonych pól.
    // Oprócz pól wieku/wagi/wzrostu pomijamy także pola obwodu talii i bioder,
    // pola w sekcji przekąsek/dania oraz wszystkie pola planu odchudzania.
    if (currentActive && (currentActive.id === 'waistCm' || currentActive.id === 'hipCm')) {
      return;
    }
    // Sprawdź, czy aktywny element znajduje się wewnątrz przekąsek, dań obiadowych lub planu odchudzania
    if (currentActive && typeof currentActive.closest === 'function') {
      if (currentActive.closest('#foodList') || currentActive.closest('#planCard')) {
        return;
      }
    }
    // Ponowne sprawdzenie widoczności rezultatów
    if (resultsEl.style.display === 'none') {
      return;
    }
      // Wybieramy dłuższy czas trwania przewijania (ok. 2,5 s), aby przewijanie
      // było bardzo płynne i wolne.  Używamy globalnej funkcji smoothScrollToElement,
      // która przewija okno tak, aby górna krawędź elementu zrównała się z
      // górną krawędzią viewportu.  Dodatkowy easing w funkcji pozwala
      // uzyskać łagodniejsze przyspieszenie i wyhamowanie.  Czas trwania (2500 ms)
      // można zmienić, by uzyskać szybszą lub wolniejszą animację.
      smoothScrollToElement(bmiCard, 2000);
  }, 300);
}

// Upewnij się, że funkcja scrollToResultsCard jest dostępna globalnie.
// W niektórych miejscach kodu (np. obsługa zdarzeń blur) funkcja jest
// wywoływana z przestrzeni globalnej, dlatego przypisujemy ją do
// obiektu window, jeśli jest dostępny.
if (typeof window !== 'undefined') {
  window.scrollToResultsCard = scrollToResultsCard;
}

// Flag indicating whether a scroll to the results card is pending.  This flag
// is set in update() whenever all required fields (wiek, waga, wzrost) are
// filled and results become visible.  Reposition functions will detect this
// flag and trigger the smooth scroll after layout changes, ensuring that
// the results card is centred in the viewport after any dynamic DOM moves.
let pendingResultsScroll = false;

// Global flag to disable automatic scrolling after user loads previously saved data.
// When set to true, auto scrolling will be completely turned off for the rest
// of the session.  This prevents the page from jumping when navigating
// between results using loaded data.  It is toggled in applyLoadedData().
//
// In this modified version of the application, we want to disable any form of
// automatic scrolling globally.  To achieve this we initialise the flag to
// `true` from the outset.  Many parts of the application check the value of
// `autoScrollDisabled` before performing a smooth scroll (see
// scrollToResultsCard and related handlers).  By ensuring the flag starts as
// `true` and never gets reset to `false`, we effectively turn off all
// auto‑scroll functionality in the UI.
let autoScrollDisabled = VILDA_AUTO_SCROLL_PERMANENTLY_DISABLED;
// Ensure the property on the global window object is also set to true.  Some
// parts of the application check `window.autoScrollDisabled` directly.  We
// wrap in a try/catch to avoid errors in non‑browser contexts (SSR).
try {
  if (typeof window !== 'undefined') {
    window.autoScrollDisabled = true;
  }
} catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 20361 });
    }
  }

// Licznik, który dezaktywuje automatyczne przewijanie po interakcji z
// określonymi polami (obwód talii, obwód bioder, listy przekąsek/dań,
// karta planu odchudzania).  Ustawienie wartości dodatniej powoduje,
// że kolejne wywołania scrollToResultsCard() zostaną pominięte, a
// licznik będzie dekrementowany.  Pozwala to ignorować więcej niż
// jedno wywołanie scrollowania, jeśli po zmianie danych nastąpi
// sekwencja kilku wywołań (np. z update() i repositionDoctor()).
let skipAutoScrollCounter = 0;

// === Wyłącz autoscroll dla kart „Przekąski” i „Dania obiadowe” ===
// Interakcje w sekcjach przekąsek i dań obiadowych (kliknięcia, zmiany selektora,
// edycja liczby porcji czy usuwanie wierszy) nie powinny powodować automatycznego
// przewijania do karty z wynikami.  Aby to osiągnąć, zwiększamy licznik
// skipAutoScrollCounter przy każdym zdarzeniu w tych sekcjach.  Licznik jest
// dekrementowany w scrollToResultsCard() przy każdym wywołaniu, dzięki czemu
// pomijamy kolejne próby przewinięcia po zmianie danych w tych kartach.
if (typeof document !== 'undefined') {
  function initDisableAutoScrollForFoodLists() {
    try {
      if (isVildaAutoScrollPermanentlyDisabled()) return;
      // Funkcja, która ustawia licznik pomijania autoscrolla na wartość dodatnią.
      const disableScroll = () => {
        // Przypisz co najmniej 3, aby zignorować kilka następujących po sobie wywołań.
        skipAutoScrollCounter = 3;
      };
      // Pomocnicza funkcja podpinająca obsługę zdarzeń do elementu
      const attach = (el) => {
        if (!el) return;
        ['click','change','input'].forEach(evt => {
          el.addEventListener(evt, disableScroll, true);
        });
      };
      // Pobierz kontener zintegrowanej listy jedzenia
      const foodListEl = document.getElementById('foodList');
      // Nasłuchuj zdarzeń na zintegrowanej liście wierszy (select, input, × usuń)
      attach(foodListEl);
      // Dodatkowo nasłuchuj kliknięcia przycisku „+ dodaj…”, który znajduje się
      // poza divem listy.  Bez tego kliknięcie przycisku dodawania mogłoby
      // wywołać update() i autoscroll.
      if (foodListEl && foodListEl.parentElement) {
        foodListEl.parentElement.addEventListener('click', (e) => {
          const target = e.target;
          if (target && target.classList && target.classList.contains('add-row')) {
            disableScroll();
          }
        }, true);
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 20411 });
    }
  }
  }
  // Zainicjuj obsługę po załadowaniu DOM – podobnie jak w innych sekcjach.
  window.vildaAppOnReady('app:disable-auto-scroll-food-lists', initDisableAutoScrollForFoodLists);
}

if (typeof document !== 'undefined') {
  function initFoodTotalInfoToggle() {
    try {
      document.addEventListener('click', function(event) {
        const btn = event.target && event.target.closest
          ? event.target.closest('[data-food-total-info-toggle]')
          : null;
        if (!btn) return;
        const panelId = btn.getAttribute('aria-controls');
        const panel = panelId ? document.getElementById(panelId) : null;
        const expanded = btn.getAttribute('aria-expanded') === 'true';
        const nextExpanded = !expanded;
        btn.setAttribute('aria-expanded', String(nextExpanded));
        btn.textContent = nextExpanded ? 'Ukryj informacje ▴' : 'Informacje ▾';
        if (panel) {
          panel.hidden = !nextExpanded;
        }
      }, true);
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 20437 });
    }
  }
  }
  window.vildaAppOnReady('app:food-total-info-toggle', initFoodTotalInfoToggle);
}
// Flaga sygnalizująca, że użytkownik edytuje pole miesięcy (#ageMonths).
// Gdy jest ustawiona na true, automatyczne przewijanie inicjowane przez
// update() jest tymczasowo pomijane.  Wartość ta jest ustawiana na true
// podczas fokusu w polu miesięcy i resetowana na false po zakończeniu
// edycji (np. na blur lub wciśnięciu Enter).  Dzięki temu scrollowanie
// nie zostanie wykonane, dopóki użytkownik nie zatwierdzi zmian.
let editingAgeMonths = false;

/* -----------------------------------------------------------------------
 * Inicjalizacja obsługi pola wieku w miesiącach (#ageMonths)
 *
 * To pole powinno przyjmować wyłącznie wartości z zakresu 1–11.  Podczas
 * edycji (kiedy kursor znajduje się w polu) aplikacja nie powinna
 * automatycznie przewijać wyników – scrollowanie następuje dopiero po
 * zakończeniu edycji (zdarzenie blur) lub po naciśnięciu klawisza Enter.
 * W tym celu używamy globalnej flagi editingAgeMonths.  Funkcja
 * scrollToResultsCard() sprawdza tę flagę i wstrzymuje przewijanie,
 * jeśli użytkownik wprowadza właśnie liczbę w polu miesięcy.  Po
 * zatwierdzeniu wpisu przewijamy wyniki, o ile dane są kompletne.
 */
if (typeof document !== 'undefined') {
  function initScrollOnAgeMonths(){
    try {
      const monthsEl = document.getElementById('ageMonths');
      if (!monthsEl) return;
      // Funkcja obsługująca zakończenie edycji (blur lub Enter)
      const finalizeEdit = function(e){
        // Reagujemy tylko na blur lub na naciśnięcie klawisza Enter
        if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== 'NumpadEnter') return;
        // Jeśli to zdarzenie keydown, powstrzymaj domyślną obsługę Enter w polu number,
        // aby nie doszło do wysyłki formularza lub podwójnego przewinięcia.
        if (e.type === 'keydown') {
          e.preventDefault();
        }
        // Oznacz zakończenie edycji
        editingAgeMonths = false;
        // Wyzeruj licznik scrollowania
        skipAutoScrollCounter = 0;
        // Niezależnie od tego, czy pole jest puste czy zawiera wartość (1–11),
        // chcemy przewinąć wyniki, pod warunkiem że wszystkie wymagane pola są wypełnione.
        setTimeout(() => {
          try {
            const anthroValidation = (typeof vildaGetMainAnthroValidationSnapshot === 'function')
              ? vildaGetMainAnthroValidationSnapshot()
              : null;
            const resultsEl = document.getElementById('results');
            // Wszystkie trzy pola muszą mieć jawnie poprawne wartości; wiek 0 lat jest legalny.
            if (!(anthroValidation && anthroValidation.complete)) return;
            if (resultsEl && resultsEl.style.display === 'none') return;
            if (typeof autoScrollDisabled !== 'undefined' && autoScrollDisabled) return;
            if (typeof scrollToResultsCard === 'function') {
              scrollToResultsCard();
            }
          } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 20496 });
    }
  }
        }, 200);
      };
      if (!isVildaAutoScrollPermanentlyDisabled()) {
        // Podczas fokusu zaznaczamy, że trwa edycja.  Nie modyfikujemy licznika
        // skipAutoScrollCounter, gdyż scrollowanie będzie blokowane przez
        // warunek w scrollToResultsCard() sprawdzający editingAgeMonths.
        monthsEl.addEventListener('focus', function(){
          editingAgeMonths = true;
        });
        // Podczas każdej zmiany wartości (input) jedynie aktualizujemy
        // wskaźnik editingAgeMonths.  Scrollowanie podczas edycji jest
        // zablokowane przez warunek w scrollToResultsCard(), więc nie
        // manipulujemy licznikiem skipAutoScrollCounter.
        monthsEl.addEventListener('input', function(){
          if (!editingAgeMonths) {
            editingAgeMonths = true;
          }
        });
        // Dodaj obsługę blur i klawisza Enter na potrzeby przewijania po zakończeniu edycji.
        monthsEl.addEventListener('blur', finalizeEdit);
        monthsEl.addEventListener('keydown', finalizeEdit);
      }
      /*
       * The previous implementation attached a `beforeinput` handler to the #ageMonths input
       * in order to reject invalid characters and values outside of the 1–11 range before
       * they were inserted.  In practice, this aggressive filtering caused issues on
       * some browsers – users could not enter values like "10" or "11" as the input
       * would be blocked or rewritten unexpectedly.  To make the component more robust
       * we remove the `beforeinput` filter and instead normalise the value during the
       * standard `input` event.  This allows the browser to accept the keystrokes and
       * then clamps the value after entry if it falls outside the allowed range.  The
       * normalisation logic is defined below and ensures only 1–11 or an empty value is
       * retained.
       */
      // monthsEl.addEventListener('beforeinput', ...) has been removed

      // Normalise the month value on every input.  Empty string is allowed (optional field).
      monthsEl.addEventListener('input', function () {
        try {
          const raw = monthsEl.value;
          // If field is cleared, leave it blank
          if (raw === '' || raw === null) {
            return;
          }
          // Remove any non‑digit characters
          const numeric = raw.replace(/[^0-9]/g, '');
          // Parse to integer
          let n = parseInt(numeric, 10);
          if (isNaN(n)) {
            monthsEl.value = '';
            return;
          }
          // Clamp to 1–11
          if (n < 1) {
            monthsEl.value = '';
            return;
          }
          if (n > 11) {
            n = 11;
          }
          monthsEl.value = String(n);
        } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 20558 });
    }
  }
      });
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 20562 });
    }
  }
  }
  // Uruchom inicjalizację po załadowaniu DOM
  window.vildaAppOnReady('app:scroll-on-age-months', initScrollOnAgeMonths);

  /**
   * Inicjalizuje obsługę automatycznego przewijania po zakończeniu edycji
   * ostatniego wymaganego pola: wiek (lata), waga (kg) lub wzrost (cm).
   * Jeśli użytkownik wprowadzi wartość do jednego z tych pól i następnie
   * naciśnie Enter lub kliknie poza pole, a pozostałe wymagane pola są
   * już wypełnione, funkcja scrollToResultsCard() zostanie wywołana.
   * Dzięki temu autoscroll działa również po naciśnięciu Enter, nie tylko
   * po opuszczeniu pola myszą/klawiaturą.
   */
  function initAutoScrollOnFinalFields() {
    try {
      if (isVildaAutoScrollPermanentlyDisabled()) return;
      const requiredIds = ['age', 'weight', 'height'];
      requiredIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        // Funkcja pomocnicza wywołująca scroll po krótkim opóźnieniu,
        // o ile wszystkie wymagane pola są wypełnione. Nie sprawdzamy
        // widoczności wyników – logika w scrollToResultsCard() oraz
        // reposition funkcje zadbają o poprawne przewijanie.
        const handle = function() {
          setTimeout(() => {
            try {
              const anthroValidation = (typeof vildaGetMainAnthroValidationSnapshot === 'function')
                ? vildaGetMainAnthroValidationSnapshot()
                : null;
              if (!(anthroValidation ? anthroValidation.complete : false)) return;
              if (typeof autoScrollDisabled !== 'undefined' && autoScrollDisabled) return;
              if (typeof scrollToResultsCard === 'function') {
                scrollToResultsCard();
              }
            } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 20599 });
    }
  }
          }, 300);
        };
        const finalizeField = function(ev) {
          try {
            // Resetuj licznik, aby nie blokować autoscrolla podczas obsługi końcowych pól
            if (typeof skipAutoScrollCounter !== 'undefined') {
              skipAutoScrollCounter = 0;
            }
            // Jeśli użytkownik wcisnął klawisz Enter (także na klawiaturze numerycznej),
            // traktuj to jak zakończenie edycji: zapobiegaj domyślnej akcji i
            // zabierz fokus z pola.  Zdarzenie blur wywoła handle() i uruchomi autoscroll.
            const key = ev.key;
            if (key === 'Enter' || key === 'NumpadEnter') {
              if (ev.type === 'keydown' || ev.type === 'keypress') {
                ev.preventDefault();
                if (ev.target && typeof ev.target.blur === 'function') {
                  ev.target.blur();
                }
                // Zwróć, aby nie wywoływać handle() wielokrotnie; blur wyzwoli osobne zdarzenie
                return;
              }
              // Dla zdarzeń keyup, blur został już wykonany, więc nie robimy nic.
            }
            // Gdy pole traci fokus z innych powodów (np. kliknięcie poza pole), wywołaj handle()
            if (ev.type === 'blur') {
              handle();
              return;
            }
          } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 20630 });
    }
  }
        };
        // Podpinamy do blur, keydown, keyup oraz keypress
        el.addEventListener('blur', finalizeField);
        el.addEventListener('keydown', finalizeField);
        el.addEventListener('keyup', finalizeField);
        el.addEventListener('keypress', finalizeField);
      });
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 20640 });
    }
  }
  }
  // Zainicjuj obsługę auto scrolla dla końcowych pól po załadowaniu DOM
  window.vildaAppOnReady('app:auto-scroll-final-fields', initAutoScrollOnFinalFields);
}

// -----------------------------------------------------------------------------
// Automatyczne wyłączenie autoscrolla przy ponownym otwarciu aplikacji
//
// Jeśli aplikacja została ponownie uruchomiona lub strona została odświeżona,
// a w polach wieku, wagi i wzrostu nadal znajdują się wartości dodatnie
// (czyli użytkownik nie wyczyścił formularza przed zamknięciem), uznajemy, że
// wczytano wcześniej zapisane dane.  W takiej sytuacji autoscroll nie
// powinien się uruchamiać po wczytaniu wyników.  Dodatkowo ukrywamy
// instrukcję „Uzupełnij wymagane pola…", ponieważ w tym miejscu pojawi się
// podsumowanie poprzedniego pomiaru.
if (typeof document !== 'undefined') {
  /**
   * Sprawdza, czy pola wieku, wagi i wzrostu są wypełnione dodatnimi
   * wartościami.  Jeżeli tak, ustawiamy globalną flagę autoScrollDisabled,
   * aby wyłączyć automatyczne przewijanie kart z wynikami w bieżącej sesji.
   * Dodatkowo ukrywamy instrukcję wypełnienia pól (#compareInstruction).
   * Funkcja jest idempotentna: wielokrotne wywołania nie powodują
   * ponownego włączenia autoscrolla, jeśli flaga jest już ustawiona.
   */
  function autoDisableFromStoredData() {
    try {
      // Jeżeli autoscroll jest już wyłączony, nie musimy nic robić.
      if (typeof autoScrollDisabled !== 'undefined' && autoScrollDisabled) return;
      const ageEl = document.getElementById('age');
      const weightEl = document.getElementById('weight');
      const heightEl = document.getElementById('height');
      // Pobierz aktualne wartości wejściowe. Używamy parseFloat() i operatora
      // logicznego OR, aby prawidłowo obsłużyć puste stringi (zwracają NaN).
      const anthroValidation = (typeof vildaGetMainAnthroValidationSnapshot === 'function')
        ? vildaGetMainAnthroValidationSnapshot()
        : null;
      // Jeśli wszystkie wymagane pola zawierają jawnie poprawne wartości, traktujemy
      // je jako wczytane z poprzedniej sesji. Wiek 0 lat jest legalny, jeśli został
      // wpisany jawnie, a puste pole wieku nie jest mylone z noworodkiem.
      if (anthroValidation && anthroValidation.complete) {
        try {
          if (typeof window !== 'undefined') {
            window.autoScrollDisabled = true;
          }
          autoScrollDisabled = true;
        } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 20688 });
    }
  }
        const ci = document.getElementById('compareInstruction');
        if (ci && ci.style) {
          ci.style.display = 'none';
        }
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 20696 });
    }
  }
  }
  // Uruchamiamy sprawdzenie na wczesnym etapie (DOMContentLoaded) oraz ponownie
  // po załadowaniu wszystkich skryptów (zdarzenie load).  Użycie load jest
  // konieczne, ponieważ moduł userData.js wczytuje dane z localStorage
  // dopiero po app.js i może nadpisać wartości pól.  Dzięki temu, jeśli
  // wartości zostaną uzupełnione po initializacji, autoscroll zostanie
  // wyłączony zanim pojawią się wyniki.
  window.vildaAppOnReady('app:auto-disable-autoscroll-from-stored-data', autoDisableFromStoredData);
  // Dodatkowo podłączamy się do zdarzenia load, aby sprawdzić ponownie
  // po załadowaniu wszystkich zasobów (w tym userData.js).
  window.vildaAppOnLoad('app:auto-disable-autoscroll-after-load', function initAutoDisableAutoscrollAfterLoad() {
    // Używamy krótkiego opóźnienia, aby upewnić się, że userData.js zdążył
    // wczytać i ustawić wartości z localStorage.
    setTimeout(autoDisableFromStoredData, 0);
  });
}

/*
 * Płynnie przewija stronę na samą górę. Funkcja jest wywoływana przez
 * przycisk przewijania w widoku mobilnym. Używamy try/catch, aby
 * zapewnić kompatybilność ze starszymi przeglądarkami, które mogą
 * nie obsługiwać opcji `behavior: 'smooth'` w metodzie scrollTo().
 */
/**
 * Płynnie przewija stronę na samą górę.
 *
 * W układach mobilnych oraz innych kontekstach, w których przewijanie
 * odbywa się na elemencie innym niż obiekt `window` (np. `document.scrollingElement`),
 * wywołanie `window.scrollTo()` nie będzie miało efektu. Dlatego najpierw
 * ustalamy element odpowiedzialny za przewijanie i na nim wykonujemy
 * przewinięcie. Wspieramy zarówno płynne przewijanie, jak i prosty
 * fallback na starsze przeglądarki.
 */
/**
 * Płynnie przewija stronę lub dowolny przewijalny kontener na samą górę.
 *
 * W praktyce mobilnej (np. w układzie jednokolumnowym) przewijanie często
 * odbywa się na innym elemencie niż `window` czy `document.documentElement`
 * — na przykład na kontenerach z ustawionym `overflow-y: auto`. Poprzednia
 * implementacja zakładała, że `document.scrollingElement` obejmuje główny
 * obszar przewijania, co nie zawsze jest prawdą. Z tego powodu dodajemy
 * logikę, która wyszukuje wszystkie potencjalnie przewijalne elementy w
 * dokumencie i ustawia im scrollTop na 0. Zachowujemy dotychczasowe
 * wywołania `window.scrollTo()` i przewijanie na `scrollTarget`, a nową
 * logikę stosujemy jako uzupełnienie – najpierw próbujemy przewinąć
 * standardowe elementy, a następnie przechodzimy przez inne elementy
 * posiadające przewinięcie.
 */
/**
 * Przewija całą stronę (lub jej główne kontenery) do początku. W poprzedniej
 * implementacji wykonywaliśmy rozbudowane przeszukiwanie drzewa DOM w
 * poszukiwaniu potencjalnie przewijalnych elementów. Okazało się jednak, że
 * takie podejście bywa zawodne w układach mobilnych (jednokolumnowych), w
 * których główny obszar przewijania jest zdefiniowany na konkretnym
 * kontenerze, a nie na dokumencie. Nowsze przeglądarki natywnie obsługują
 * płynne przewijanie, dlatego uprościliśmy logikę tak, aby zawsze
 * resetować scroll na kilku kluczowych elementach: oknie, dokumencie,
 * elementach <html> i <body> oraz głównym kontenerze aplikacji. Dzięki
 * temu niezależnie od sposobu ustawienia overflow w CSS, kliknięcie
 * przycisku "powrót na górę" spowoduje przewinięcie treści na sam początek.
 */
function scrollToTop() {
  const scrollBehavior = vildaGetMotionAwareScrollBehavior();
  try {
    // 1. Spróbuj użyć natywnej funkcji window.scrollTo z obsługą płynnego
    // przewijania. Przy prefers-reduced-motion używamy natychmiastowego
    // przewinięcia bez płynnej animacji.
    if (typeof window.scrollTo === 'function') {
      try {
        window.scrollTo({ top: 0, left: 0, behavior: scrollBehavior });
      } catch (err) {
        // Niektóre starsze przeglądarki nie obsługują obiektu opcji – podajemy
        // więc wartości liczbowe.
        window.scrollTo(0, 0);
      }
    }

    // 2. Ustaw scrollTop na 0 dla dokumentu i elementu <html>. W niektórych
    // mobilnych layoutach te elementy odpowiadają za przewijanie.
    const docEl = document.documentElement;
    if (docEl) {
      docEl.scrollTop = 0;
    }
    const body = document.body;
    if (body) {
      body.scrollTop = 0;
    }

    // 3. Spróbuj przewinąć element wskazany przez document.scrollingElement.
    const scrollingEl = document.scrollingElement;
    if (scrollingEl && typeof scrollingEl.scrollTo === 'function') {
      scrollingEl.scrollTo({ top: 0, left: 0, behavior: scrollBehavior });
    } else if (scrollingEl) {
      scrollingEl.scrollTop = 0;
    }

    // 4. Jeśli istnieje główny kontener aplikacji (o klasie 'container'),
    // wyzeruj także jego przewinięcie. W układach mobilnych zawartość
    // bywa osadzona w kontenerze z overflow-y: auto, dlatego bez tego
    // zabiegu sama strona pozostawała w niezmienionej pozycji.
    const mainContainer = document.querySelector('.container');
    if (mainContainer) {
      try {
        if (typeof mainContainer.scrollTo === 'function') {
          mainContainer.scrollTo({ top: 0, left: 0, behavior: scrollBehavior });
        } else {
          mainContainer.scrollTop = 0;
        }
      } catch (ex) {
        mainContainer.scrollTop = 0;
      }
    }
  } catch (e) {
    // Jeśli z jakiegoś powodu któraś z metod rzuci wyjątek, używamy
    // najprostszego możliwego rozwiązania – ustawiamy scrollTop na 0
    // zarówno dla <html>, jak i <body>.
    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;
  }
}

// Upewnij się, że funkcja scrollToTop jest dostępna w globalnym obiekcie window.
if (typeof window !== 'undefined') {
  window.scrollToTop = scrollToTop;
}

// Uruchom repositionDoctor przy załadowaniu strony i po każdym
// przeskalowaniu okna. Dzięki temu sekcja modułu lekarskiego będzie
// odpowiednio ustawiona jeszcze przed pierwszym wywołaniem update().
window.vildaAppOnReady('app:initial-reposition-doctor', function initInitialRepositionDoctor() {
  if (typeof repositionDoctor === 'function') {
    repositionDoctor();
  }
  if (typeof repositionMetabolicSummary === 'function') {
    repositionMetabolicSummary();
  }
  // Podłącz obsługę kliknięcia przycisku przewijania na górę, jeśli istnieje
  const scrollBtn = document.getElementById('scrollTopBtn');
  if (scrollBtn) {
    scrollBtn.addEventListener('click', () => {
      if (typeof scrollToTop === 'function') {
        scrollToTop();
      }
    });
  }
  // Ukryj przyciski sterujące kartą poprzedniego pomiaru, aby użytkownik nie mógł jej zwijać
  const hideBtn = document.getElementById('hidePrevSummary');
  const toggleBtn = document.getElementById('togglePrevSummary');
  if (hideBtn) hideBtn.style.display = 'none';
  if (toggleBtn) toggleBtn.style.display = 'none';
});
const scheduleMainLayoutResize = vildaCreateRafThrottledLayoutTask('main-layout-resize', function refreshMainLayoutAfterResize() {
  if (typeof repositionDoctor === 'function') {
    repositionDoctor();
  }
  if (typeof repositionMetabolicSummary === 'function') {
    repositionMetabolicSummary();
  }
  if (typeof updateProfessionalSummaryCard === 'function') {
    updateProfessionalSummaryCard();
  }
});
window.addEventListener('resize', function handleMainLayoutResize() {
  scheduleMainLayoutResize('resize');
});


// ============================================================================
// Dostosowanie szerokości przycisków testów w układzie dwukolumnowym
//
// W układzie dwukolumnowym (szerokość okna ≥ 700 px) przyciski do otwierania
// poszczególnych testów (GH, OGTT/GnRH oraz ACTH/TRH) mogą mieć różne
// szerokości ze względu na różną długość etykiet. Aby zachować estetykę
// interfejsu, wyrównujemy szerokość tych przycisków do szerokości
// najszerszego z nich. W widoku mobilnym (jednokolumnowym) przyciski
// zajmują pełną szerokość kontenera.

/**
 * Oblicza szerokość najszerszego przycisku testu i ustawia taką samą
 * szerokość dla wszystkich przycisków w trybie dwukolumnowym. W trybie
 * jednokolumnowym przyciski zajmują 100 % dostępnej szerokości.
 */
function adjustTestButtonWidths() {
  // Lista identyfikatorów przycisków, dla których chcemy wyrównać szerokość w trybie dwukolumnowym.
  // Oprócz istniejących przycisków testów GH/OGTT/ACTH dodajemy nowe przyciski modułu lekarskiego
  // (Testy w endokrynologii oraz Leczenie hormonem wzrostu / IGF‑1). Dzięki temu wszystkie
  // główne przyciski będą miały jednakową szerokość, co zapewnia spójny wygląd.
  // Do listy identyfikatorów dodajemy również 'toggleBisphos', aby przycisk
  // leczenia bisfosfonianami był brany pod uwagę przy obliczaniu
  // maksymalnej szerokości.  Dzięki temu jego szerokość zostanie
  // wyrównana do innych przycisków modułu (np. Leczenie hormonem wzrostu / IGF‑1).
  const ids = ['toggleGhTests', 'toggleOgttTests', 'toggleActhTests', 'toggleEndoTests', 'toggleIgfTests', 'toggleAbxTherapy', 'toggleZscore', 'toggleFluTherapy', 'toggleObesityTherapy', 'toggleBisphos', 'toggleSgaBirth'];
  const isTwoColumn = window.innerWidth >= 700;

  // W trybie jednokolumnowym ustawiamy szerokość wszystkich przycisków
  // na 100%, aby wypełniały całą dostępną przestrzeń.
  if (!isTwoColumn) {
    ids.forEach(id => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.style.width = '100%';
      }
    });
    return;
  }

  // W trybie dwukolumnowym obliczamy naturalną szerokość każdego przycisku
  // na podstawie zawartości tekstowej, niezależnie od tego, czy przycisk
  // jest aktualnie widoczny. Tworzymy niewidoczny kontener, w którym
  // klonujemy przyciski do pomiaru. Dzięki temu unikamy sytuacji,
  // gdy ukryte przyciski mają szerokość 0 i powodują błąd w układzie.
  let maxWidth = 0;
  const tmpContainer = document.createElement('div');
  tmpContainer.style.position = 'absolute';
  tmpContainer.style.visibility = 'hidden';
  tmpContainer.style.height = 'auto';
  tmpContainer.style.width = 'auto';
  tmpContainer.style.whiteSpace = 'nowrap';
  document.body.appendChild(tmpContainer);
  ids.forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    const clone = btn.cloneNode(true);
    clone.style.width = 'auto';
    clone.style.display = 'inline-block';
    // Dodaj klona do tymczasowego kontenera
    tmpContainer.appendChild(clone);
    // Zmierz szerokość klona
    const width = clone.getBoundingClientRect().width;
    if (width > maxWidth) maxWidth = width;
    // Usuń klona po pomiarze
    tmpContainer.removeChild(clone);
  });
  // Usuń tymczasowy kontener z dokumentu
  document.body.removeChild(tmpContainer);

  // Ustaw obliczoną maksymalną szerokość dla wszystkich przycisków
  ids.forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.style.width = `${maxWidth}px`;
    }
  });
}

// Wywołuj adjustTestButtonWidths po załadowaniu strony i przy zmianie rozmiaru okna.
window.vildaAppOnReady('app:test-button-widths', function initTestButtonWidths() {
  if (typeof adjustTestButtonWidths === 'function') {
    adjustTestButtonWidths();
  }
});
const scheduleTestButtonWidthResize = vildaCreateRafThrottledLayoutTask('test-button-widths-resize', function adjustTestButtonWidthsAfterResize() {
  if (typeof adjustTestButtonWidths === 'function') {
    adjustTestButtonWidths();
  }
});
window.addEventListener('resize', function handleTestButtonWidthResize() {
  scheduleTestButtonWidthResize('resize');
});

/**
 * Klasyfikacja ciężkości anoreksji u dorosłych (≥18 r.ż.)
 * Zwraca string z nazwą poziomu + zakresem.
 */
function anorexiaSeverityAdult(bmi){
  if (bmi < BMI_STARVATION_THRESHOLD) return '🚨 Zagrażająca życiu (BMI < 13)';
  if (bmi < BMI_SEVERE_ANOREXIA)     return '🔴 Bardzo ciężka (BMI < 15)';
  if (bmi < BMI_HEAVY_ANOREXIA)      return '🔴 Ciężka (BMI 15 – 15,99)';
  if (bmi < BMI_MODERATE_ANOREXIA)   return '🟠 Umiarkowana (BMI 16 – 16,99)';
  if (bmi < ADULT_BMI.UNDER)         return '🟡 Łagodna (BMI 17 – 18,49)';
  return null;
}

/**
 * Rekomendacja formy pomocy przy BMI < 18,5 (dorośli)
 * Zwraca pusty string, albo zalecenie.
 */
function anorexiaConsultRecommendation(bmi){
  if (bmi < BMI_STARVATION_THRESHOLD) return '🚑 Wymagana NATYCHMIASTOWA hospitalizacja';
  if (bmi < BMI_MODERATE_ANOREXIA)    return '‼️ Wskazana pilna konsultacja psychiatryczna';
  if (bmi < ADULT_BMI.UNDER)          return '💬 Rozważ konsultację psychologiczną';
  return '';
}

/**
 * Płynnie przewija okno tak, aby górna krawędź elementu znalazła się przy górnym brzegu viewportu.
 * Używa funkcji animacji requestAnimationFrame dla uzyskania wolniejszej, bardziej kontrolowanej
 * animacji niż wbudowane scrollIntoView.  Parametr duration określa czas przewijania w milisekundach.
 * @param {HTMLElement} element  docelowy element, do którego chcemy przewinąć
 * @param {number} [duration=800]  czas trwania animacji w ms
 */
function smoothScrollToElement(element, duration = 800) {
  if (!element) return;
  const startY = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
  // Offset docelowego elementu względem dokumentu
  const targetY = element.getBoundingClientRect().top + startY;
  const distance = targetY - startY;
  const normalizedDuration = Math.max(0, Number(duration) || 0);
  if (vildaPrefersReducedMotion() || normalizedDuration === 0 || Math.abs(distance) < 1) {
    try {
      window.scrollTo(0, targetY);
    } catch (error) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', error, { step: '8P-6', context: 'smooth-scroll-reduced-motion-fallback' });
      }
    }
    const docEl = document.documentElement;
    if (docEl && typeof docEl.scrollTop === 'number') docEl.scrollTop = targetY;
    const scrollingEl = document.scrollingElement;
    if (scrollingEl && typeof scrollingEl.scrollTop === 'number') scrollingEl.scrollTop = targetY;
    const bodyEl = document.body;
    if (bodyEl && typeof bodyEl.scrollTop === 'number') bodyEl.scrollTop = targetY;
    return;
  }
  const startTime = performance.now();
  // Funkcja easing (łatwo można zmienić na inną). Używamy easeInOutQuad dla płynności.
  function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }
  function animateScroll(currentTime) {
    const elapsed = currentTime - startTime;
    // Procent postępu (0–1)
    const progress = Math.min(elapsed / normalizedDuration, 1);
    const easedProgress = easeInOutQuad(progress);
    const currentY = startY + distance * easedProgress;
    // Przewiń główny viewport oraz alternatywne kontenery scrollujące.  W niektórych układach
    // mobilnych przewijanie odbywa się na elemencie document.scrollingElement lub
    // document.documentElement, dlatego ustawiamy scrollTop na wszystkich potencjalnych
    // elementach, oprócz wywołania window.scrollTo, które w wielu przeglądarkach jest
    // obsługiwane poprawnie.
    try {
      window.scrollTo(0, currentY);
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 21007 });
    }
  }
    const docEl = document.documentElement;
    if (docEl && typeof docEl.scrollTop === 'number') {
      docEl.scrollTop = currentY;
    }
    const scrollingEl = document.scrollingElement;
    if (scrollingEl && typeof scrollingEl.scrollTop === 'number') {
      scrollingEl.scrollTop = currentY;
    }
    const bodyEl = document.body;
    if (bodyEl && typeof bodyEl.scrollTop === 'number') {
      bodyEl.scrollTop = currentY;
    }
    if (progress < 1) {
      requestAnimationFrame(animateScroll);
    }
  }
  requestAnimationFrame(animateScroll);
}

/* ==========================================================================
 * VildaUpdatePrep został wydzielony w kroku 8A do vilda_update_prep.js.
 * app.js zachowuje tylko publiczny wrapper update(), który deleguje do
 * window.VildaUpdatePrep.runMainUpdate().
 * ========================================================================== */

function update(){
  const prep = (typeof window !== 'undefined' && window.VildaUpdatePrep) ? window.VildaUpdatePrep : null;
  if (prep && typeof prep.runMainUpdate === 'function') {
    return prep.runMainUpdate(this, arguments, update);
  }
  if (typeof vildaUpdatePrepRunMainUpdate === 'function') {
    return vildaUpdatePrepRunMainUpdate(this, arguments, update);
  }
  if (typeof vildaLogAppError === 'function') {
    vildaLogAppError('app:update', 'Brak VildaUpdatePrep.runMainUpdate() — update() nie może zostać wykonane.');
  }
  return undefined;
}


// init with no rows so user explicitly adds items

window.vildaAppOnReady('app:fieldset-legend-enhancement', function initFieldsetLegendEnhancement() {
  document.querySelectorAll('fieldset').forEach(fs => {
    const legend = fs.querySelector('legend');
    if(!legend) return;
    /* Pomiń przekąski i dania – dla nich używamy własnego CSS */
    if (fs.classList.contains('food-field')) return;

    // wybierz referencyjny element:
    let reference = fs.querySelector('button.add-row');
    if(!reference) reference = fs.querySelector('label');
    if(!reference) return;

    const fsRect = fs.getBoundingClientRect();
    const refRect = reference.getBoundingClientRect();

    // połowa drogi w pionie
    const centerY = (refRect.top - fsRect.top) / 2;
    legend.style.top = (centerY - legend.offsetHeight / 2) + 'px';

    // wyrównaj lewą krawędź
    const offsetX = refRect.left - fsRect.left;
    legend.style.left = offsetX + 'px';
  });
});

const bmiPercentiles = vildaCloneGrowthReferenceData(VILDA_GROWTH_REFERENCE_DATA.bmiPercentiles, { boys: {}, girls: {} });

/* === ŹRÓDŁO DANYCH BMI ============================================= */
let bmiSource = 'OLAF';            // 'OLAF' (domyślnie) lub 'WHO'
/* =================================================================== */
/* === BMI Percentile Enhancement === */
const LMS_BOYS = VILDA_GROWTH_REFERENCE_DATA.LMS_BOYS || {};
const LMS_GIRLS = VILDA_GROWTH_REFERENCE_DATA.LMS_GIRLS || {};

/* === OLAF BMI‑for‑age 3‑18 l. – L, M, S ============================ */
const OLAF_LMS_BOYS = {
  36: [-2.743, 15.7, 0.081],
  37: [-2.735, 15.7, 0.082],
  38: [-2.727, 15.7, 0.082],
  39: [-2.72, 15.6, 0.083],
  40: [-2.712, 15.6, 0.084],
  41: [-2.704, 15.6, 0.084],
  42: [-2.696, 15.6, 0.085],
  43: [-2.688, 15.6, 0.086],
  44: [-2.68, 15.6, 0.087],
  45: [-2.672, 15.6, 0.088],
  46: [-2.664, 15.6, 0.088],
  47: [-2.656, 15.6, 0.089],
  48: [-2.648, 15.6, 0.09],
  49: [-2.64, 15.6, 0.091],
  50: [-2.632, 15.6, 0.091],
  51: [-2.625, 15.6, 0.092],
  52: [-2.617, 15.5, 0.093],
  53: [-2.609, 15.5, 0.093],
  54: [-2.601, 15.5, 0.094],
  55: [-2.593, 15.5, 0.095],
  56: [-2.585, 15.5, 0.096],
  57: [-2.577, 15.5, 0.096],
  58: [-2.57, 15.5, 0.097],
  59: [-2.562, 15.5, 0.098],
  60: [-2.554, 15.5, 0.099],
  61: [-2.546, 15.5, 0.1],
  62: [-2.538, 15.5, 0.101],
  63: [-2.53, 15.5, 0.102],
  64: [-2.523, 15.5, 0.102],
  65: [-2.515, 15.5, 0.103],
  66: [-2.507, 15.5, 0.104],
  67: [-2.499, 15.5, 0.105],
  68: [-2.491, 15.5, 0.106],
  69: [-2.484, 15.6, 0.106],
  70: [-2.476, 15.6, 0.107],
  71: [-2.468, 15.6, 0.108],
  72: [-2.46, 15.6, 0.109],
  73: [-2.44, 15.6, 0.11],
  74: [-2.42, 15.6, 0.111],
  75: [-2.4, 15.6, 0.112],
  76: [-2.38, 15.7, 0.112],
  77: [-2.36, 15.7, 0.113],
  78: [-2.34, 15.7, 0.114],
  79: [-2.32, 15.7, 0.115],
  80: [-2.3, 15.7, 0.116],
  81: [-2.28, 15.8, 0.116],
  82: [-2.26, 15.8, 0.117],
  83: [-2.24, 15.8, 0.118],
  84: [-2.22, 15.8, 0.119],
  85: [-2.215, 15.8, 0.12],
  86: [-2.21, 15.9, 0.121],
  87: [-2.205, 15.9, 0.122],
  88: [-2.2, 15.9, 0.122],
  89: [-2.195, 16.0, 0.123],
  90: [-2.19, 16.0, 0.124],
  91: [-2.185, 16.0, 0.125],
  92: [-2.18, 16.1, 0.126],
  93: [-2.175, 16.1, 0.126],
  94: [-2.17, 16.1, 0.127],
  95: [-2.165, 16.2, 0.128],
  96: [-2.16, 16.2, 0.129],
  97: [-2.155, 16.2, 0.13],
  98: [-2.15, 16.3, 0.131],
  99: [-2.145, 16.3, 0.132],
 100: [-2.14, 16.3, 0.133],
 101: [-2.135, 16.4, 0.134],
 102: [-2.13, 16.4, 0.135],
 103: [-2.123, 16.4, 0.136],
 104: [-2.117, 16.5, 0.137],
 105: [-2.11, 16.5, 0.138],
 106: [-2.103, 16.6, 0.138],
 107: [-2.097, 16.6, 0.139],
 108: [-2.09, 16.7, 0.14],
 109: [-2.085, 16.7, 0.141],
 110: [-2.08, 16.8, 0.141],
 111: [-2.075, 16.8, 0.142],
 112: [-2.07, 16.8, 0.143],
 113: [-2.065, 16.9, 0.143],
 114: [-2.06, 16.9, 0.144],
 115: [-2.055, 16.9, 0.145],
 116: [-2.05, 17.0, 0.145],
 117: [-2.045, 17.0, 0.146],
 118: [-2.04, 17.0, 0.147],
 119: [-2.035, 17.1, 0.147],
 120: [-2.03, 17.1, 0.148],
 121: [-2.023, 17.1, 0.148],
 122: [-2.017, 17.2, 0.149],
 123: [-2.01, 17.2, 0.15],
 124: [-2.003, 17.2, 0.15],
 125: [-1.997, 17.3, 0.15],
 126: [-1.99, 17.3, 0.151],
 127: [-1.985, 17.4, 0.152],
 128: [-1.98, 17.4, 0.152],
 129: [-1.975, 17.5, 0.152],
 130: [-1.97, 17.5, 0.153],
 131: [-1.965, 17.6, 0.154],
 132: [-1.96, 17.6, 0.154],
 133: [-1.953, 17.6, 0.154],
 134: [-1.947, 17.7, 0.154],
 135: [-1.94, 17.7, 0.154],
 136: [-1.933, 17.7, 0.155],
 137: [-1.927, 17.8, 0.155],
 138: [-1.92, 17.8, 0.155],
 139: [-1.913, 17.8, 0.155],
 140: [-1.907, 17.9, 0.155],
 141: [-1.9, 18.0, 0.155],
 142: [-1.893, 18.0, 0.155],
 143: [-1.887, 18.0, 0.155],
 144: [-1.88, 18.1, 0.155],
 145: [-1.873, 18.1, 0.155],
 146: [-1.867, 18.2, 0.155],
 147: [-1.86, 18.2, 0.154],
 148: [-1.853, 18.2, 0.154],
 149: [-1.847, 18.3, 0.154],
 150: [-1.84, 18.3, 0.154],
 151: [-1.833, 18.4, 0.154],
 152: [-1.827, 18.4, 0.153],
 153: [-1.82, 18.5, 0.153],
 154: [-1.813, 18.5, 0.153],
 155: [-1.807, 18.6, 0.152],
 156: [-1.8, 18.6, 0.152],
 157: [-1.793, 18.7, 0.152],
 158: [-1.787, 18.7, 0.151],
 159: [-1.78, 18.8, 0.15],
 160: [-1.773, 18.8, 0.15],
 161: [-1.767, 18.8, 0.15],
 162: [-1.76, 18.9, 0.149],
 163: [-1.753, 19.0, 0.148],
 164: [-1.747, 19.0, 0.148],
 165: [-1.74, 19.0, 0.148],
 166: [-1.733, 19.1, 0.147],
 167: [-1.727, 19.2, 0.146],
 168: [-1.72, 19.2, 0.146],
 169: [-1.712, 19.2, 0.146],
 170: [-1.703, 19.3, 0.145],
 171: [-1.695, 19.4, 0.144],
 172: [-1.687, 19.4, 0.144],
 173: [-1.678, 19.4, 0.144],
 174: [-1.67, 19.5, 0.143],
 175: [-1.663, 19.6, 0.142],
 176: [-1.657, 19.6, 0.142],
 177: [-1.65, 19.6, 0.142],
 178: [-1.643, 19.7, 0.141],
 179: [-1.637, 19.8, 0.14],
 180: [-1.63, 19.8, 0.14],
 181: [-1.622, 19.8, 0.14],
 182: [-1.613, 19.9, 0.139],
 183: [-1.605, 20.0, 0.139],
 184: [-1.597, 20.0, 0.139],
 185: [-1.588, 20.0, 0.138],
 186: [-1.58, 20.1, 0.138],
 187: [-1.572, 20.2, 0.138],
 188: [-1.563, 20.2, 0.137],
 189: [-1.555, 20.2, 0.137],
 190: [-1.547, 20.3, 0.137],
 191: [-1.538, 20.3, 0.136],
 192: [-1.53, 20.4, 0.136],
 193: [-1.523, 20.5, 0.136],
 194: [-1.517, 20.5, 0.136],
 195: [-1.51, 20.6, 0.136],
 196: [-1.503, 20.7, 0.135],
 197: [-1.497, 20.7, 0.135],
 198: [-1.49, 20.8, 0.135],
 199: [-1.482, 20.8, 0.135],
 200: [-1.473, 20.9, 0.135],
 201: [-1.465, 21.0, 0.134],
 202: [-1.457, 21.0, 0.134],
 203: [-1.448, 21.0, 0.134],
 204: [-1.44, 21.1, 0.134],
 205: [-1.432, 21.2, 0.134],
 206: [-1.423, 21.2, 0.134],
 207: [-1.415, 21.3, 0.134],
 208: [-1.407, 21.4, 0.134],
 209: [-1.398, 21.4, 0.134],
 210: [-1.39, 21.5, 0.134],
 211: [-1.382, 21.6, 0.134],
 212: [-1.373, 21.6, 0.134],
 213: [-1.365, 21.6, 0.134],
 214: [-1.357, 21.7, 0.133],
 215: [-1.348, 21.8, 0.133],
 216: [-1.34, 21.8, 0.133]
};

const OLAF_LMS_GIRLS = {
  36: [-2.094, 15.6, 0.085],
  37: [-2.087, 15.6, 0.086],
  38: [-2.081, 15.6, 0.087],
  39: [-2.074, 15.6, 0.088],
  40: [-2.067, 15.5, 0.088],
  41: [-2.061, 15.5, 0.089],
  42: [-2.054, 15.5, 0.09],
  43: [-2.047, 15.5, 0.091],
  44: [-2.04, 15.5, 0.092],
  45: [-2.034, 15.5, 0.092],
  46: [-2.027, 15.5, 0.093],
  47: [-2.02, 15.5, 0.094],
  48: [-2.013, 15.5, 0.095],
  49: [-2.006, 15.5, 0.096],
  50: [-2.0, 15.5, 0.097],
  51: [-1.993, 15.5, 0.098],
  52: [-1.986, 15.5, 0.098],
  53: [-1.98, 15.5, 0.099],
  54: [-1.973, 15.5, 0.1],
  55: [-1.966, 15.5, 0.101],
  56: [-1.96, 15.5, 0.102],
  57: [-1.953, 15.4, 0.103],
  58: [-1.946, 15.4, 0.103],
  59: [-1.94, 15.4, 0.104],
  60: [-1.933, 15.4, 0.105],
  61: [-1.926, 15.4, 0.106],
  62: [-1.92, 15.4, 0.107],
  63: [-1.914, 15.4, 0.108],
  64: [-1.907, 15.5, 0.108],
  65: [-1.9, 15.5, 0.109],
  66: [-1.894, 15.5, 0.11],
  67: [-1.888, 15.5, 0.111],
  68: [-1.882, 15.5, 0.112],
  69: [-1.876, 15.5, 0.112],
  70: [-1.869, 15.5, 0.113],
  71: [-1.863, 15.5, 0.114],
  72: [-1.857, 15.5, 0.115],
  73: [-1.874, 15.5, 0.115],
  74: [-1.891, 15.5, 0.116],
  75: [-1.908, 15.5, 0.116],
  76: [-1.925, 15.5, 0.116],
  77: [-1.942, 15.5, 0.117],
  78: [-1.958, 15.5, 0.117],
  79: [-1.975, 15.5, 0.117],
  80: [-1.992, 15.5, 0.118],
  81: [-2.009, 15.5, 0.118],
  82: [-2.026, 15.5, 0.118],
  83: [-2.043, 15.5, 0.119],
  84: [-2.06, 15.5, 0.119],
  85: [-2.048, 15.5, 0.12],
  86: [-2.037, 15.6, 0.121],
  87: [-2.025, 15.6, 0.122],
  88: [-2.013, 15.6, 0.122],
  89: [-2.002, 15.7, 0.123],
  90: [-1.99, 15.7, 0.124],
  91: [-1.98, 15.8, 0.125],
  92: [-1.97, 15.8, 0.126],
  93: [-1.96, 15.8, 0.126],
  94: [-1.95, 15.9, 0.127],
  95: [-1.94, 16.0, 0.128],
  96: [-1.93, 16.0, 0.129],
  97: [-1.918, 16.0, 0.13],
  98: [-1.907, 16.1, 0.131],
  99: [-1.895, 16.1, 0.132],
 100: [-1.883, 16.1, 0.132],
 101: [-1.872, 16.2, 0.133],
 102: [-1.86, 16.2, 0.134],
 103: [-1.848, 16.2, 0.135],
 104: [-1.837, 16.3, 0.136],
 105: [-1.825, 16.3, 0.136],
 106: [-1.813, 16.3, 0.137],
 107: [-1.802, 16.4, 0.138],
 108: [-1.79, 16.4, 0.139],
 109: [-1.778, 16.4, 0.14],
 110: [-1.767, 16.5, 0.14],
 111: [-1.755, 16.5, 0.141],
 112: [-1.743, 16.6, 0.142],
 113: [-1.732, 16.6, 0.142],
 114: [-1.72, 16.7, 0.143],
 115: [-1.71, 16.7, 0.144],
 116: [-1.7, 16.8, 0.144],
 117: [-1.69, 16.8, 0.145],
 118: [-1.68, 16.8, 0.146],
 119: [-1.67, 17.0, 0.146],
 120: [-1.66, 16.9, 0.147],
 121: [-1.648, 17.0, 0.148],
 122: [-1.637, 17.0, 0.148],
 123: [-1.625, 17.0, 0.149],
 124: [-1.613, 17.1, 0.15],
 125: [-1.602, 17.2, 0.15],
 126: [-1.59, 17.2, 0.151],
 127: [-1.58, 17.2, 0.151],
 128: [-1.57, 17.3, 0.152],
 129: [-1.56, 17.4, 0.152],
 130: [-1.55, 17.4, 0.152],
 131: [-1.54, 17.4, 0.153],
 132: [-1.53, 17.5, 0.153],
 133: [-1.522, 17.6, 0.153],
 134: [-1.513, 17.6, 0.153],
 135: [-1.505, 17.6, 0.154],
 136: [-1.497, 17.7, 0.154],
 137: [-1.488, 17.8, 0.154],
 138: [-1.48, 17.8, 0.154],
 139: [-1.473, 17.8, 0.154],
 140: [-1.467, 17.9, 0.154],
 141: [-1.46, 18.0, 0.154],
 142: [-1.453, 18.0, 0.154],
 143: [-1.447, 18.0, 0.154],
 144: [-1.44, 18.1, 0.154],
 145: [-1.437, 18.2, 0.154],
 146: [-1.433, 18.2, 0.154],
 147: [-1.43, 18.2, 0.154],
 148: [-1.427, 18.3, 0.153],
 149: [-1.423, 18.3, 0.153],
 150: [-1.42, 18.4, 0.153],
 151: [-1.42, 18.5, 0.152],
 152: [-1.42, 18.5, 0.152],
 153: [-1.42, 18.6, 0.152],
 154: [-1.42, 18.7, 0.151],
 155: [-1.42, 18.7, 0.15],
 156: [-1.42, 18.8, 0.15],
 157: [-1.422, 18.8, 0.15],
 158: [-1.423, 18.9, 0.149],
 159: [-1.425, 19.0, 0.148],
 160: [-1.427, 19.0, 0.148],
 161: [-1.428, 19.0, 0.148],
 162: [-1.43, 19.1, 0.147],
 163: [-1.435, 19.2, 0.146],
 164: [-1.44, 19.2, 0.146],
 165: [-1.445, 19.2, 0.145],
 166: [-1.45, 19.3, 0.144],
 167: [-1.455, 19.3, 0.144],
 168: [-1.46, 19.4, 0.143],
 169: [-1.467, 19.4, 0.142],
 170: [-1.473, 19.5, 0.142],
 171: [-1.48, 19.5, 0.141],
 172: [-1.487, 19.6, 0.14],
 173: [-1.493, 19.6, 0.14],
 174: [-1.5, 19.7, 0.139],
 175: [-1.507, 19.7, 0.138],
 176: [-1.513, 19.8, 0.138],
 177: [-1.52, 19.8, 0.138],
 178: [-1.527, 19.8, 0.137],
 179: [-1.533, 19.9, 0.136],
 180: [-1.54, 19.9, 0.136],
 181: [-1.547, 19.9, 0.136],
 182: [-1.553, 20.0, 0.135],
 183: [-1.56, 20.0, 0.134],
 184: [-1.567, 20.0, 0.134],
 185: [-1.573, 20.1, 0.134],
 186: [-1.58, 20.1, 0.133],
 187: [-1.587, 20.1, 0.132],
 188: [-1.593, 20.2, 0.132],
 189: [-1.6, 20.2, 0.132],
 190: [-1.607, 20.2, 0.131],
 191: [-1.613, 20.3, 0.13],
 192: [-1.62, 20.3, 0.13],
 193: [-1.627, 20.3, 0.13],
 194: [-1.633, 20.3, 0.129],
 195: [-1.64, 20.4, 0.129],
 196: [-1.647, 20.4, 0.129],
 197: [-1.653, 20.4, 0.128],
 198: [-1.66, 20.4, 0.128],
 199: [-1.665, 20.4, 0.128],
 200: [-1.67, 20.4, 0.127],
 201: [-1.675, 20.4, 0.127],
 202: [-1.68, 20.5, 0.127],
 203: [-1.685, 20.5, 0.126],
 204: [-1.69, 20.5, 0.126],
 205: [-1.693, 20.5, 0.126],
 206: [-1.697, 20.5, 0.126],
 207: [-1.7, 20.6, 0.126],
 208: [-1.703, 20.6, 0.125],
 209: [-1.707, 20.6, 0.125],
 210: [-1.71, 20.6, 0.125],
 211: [-1.715, 20.6, 0.125],
 212: [-1.72, 20.6, 0.125],
 213: [-1.725, 20.6, 0.124],
 214: [-1.73, 20.7, 0.124],
 215: [-1.735, 20.7, 0.124],
 216: [-1.74, 20.7, 0.124]
};

// LMS WHO – masa ciała dla wieku 0–36 mies. (chłopcy i dziewczynki)  
const LMS_INFANT_WEIGHT_BOYS = {  
  "0":  [ 0.3487,  3.3464, 0.14602 ],   // 0 mies. – L, M, S  
  "1":  [ 0.2297,  4.4709, 0.13395 ],   // 1 mies.  
  "2":  [ 0.1970,  5.5675, 0.12385 ],  
  "3":  [ 0.1738,  6.3762, 0.11727 ],  
  "4":  [ 0.1553,  7.0023, 0.11316 ],  
  "5":  [ 0.1395,  7.5105, 0.11080 ],  
  "6":  [ 0.1257,  7.9340, 0.10958 ],  
  "7":  [ 0.1134,  8.2970, 0.10902 ],  
  "8":  [ 0.1021,  8.6151, 0.10882 ],  
  "9":  [ 0.0917,  8.9014, 0.10881 ],  
  "10": [ 0.0820,  9.1649, 0.10891 ],  
  "11": [ 0.0730,  9.4122, 0.10906 ],  
  "12": [ 0.0644,  9.6479, 0.10925 ],   // 12 mies. (1 rok)  
  "13": [ 0.0563,  9.8749, 0.10949 ],  
  "14": [ 0.0487, 10.0953, 0.10976 ],  
  "15": [ 0.0413, 10.3108, 0.11007 ],  
  "16": [ 0.0343, 10.5228, 0.11041 ],  
  "17": [ 0.0275, 10.7319, 0.11079 ],  
  "18": [ 0.0211, 10.9385, 0.11119 ],  
  "19": [ 0.0148, 11.1430, 0.11164 ],  
  "20": [ 0.0087, 11.3462, 0.11211 ],  
  "21": [ 0.0029, 11.5486, 0.11261 ],  
  "22": [ -0.0028, 11.7504, 0.11314 ],  
  "23": [ -0.0083, 11.9514, 0.11369 ],  
  "24": [ -0.0137, 12.1515, 0.11426 ],   // 24 mies. (2 lata)  
  "25": [ -0.0189, 12.3502, 0.11485 ],  
  "26": [ -0.0240, 12.5466, 0.11544 ],  
  "27": [ -0.0289, 12.7401, 0.11604 ],  
  "28": [ -0.0337, 12.9303, 0.11664 ],  
  "29": [ -0.0385, 13.1169, 0.11723 ],  
  "30": [ -0.0431, 13.3000, 0.11781 ],  
  "31": [ -0.0476, 13.4798, 0.11839 ],  
  "32": [ -0.0520, 13.6567, 0.11896 ],  
  "33": [ -0.0564, 13.8309, 0.11953 ],  
  "34": [ -0.0606, 14.0031, 0.12008 ],  
  "35": [ -0.0648, 14.1736, 0.12062 ]    // 35 mies.  
};  

const LMS_INFANT_WEIGHT_GIRLS = {  
  "0":  [ 0.3809,  3.2322, 0.14171 ],  
  "1":  [ 0.1714,  4.1873, 0.13724 ],  
  "2":  [ 0.0962,  5.1282, 0.13000 ],  
  "3":  [ 0.0402,  5.8458, 0.12619 ],  
  "4":  [ -0.0050,  6.4237, 0.12402 ],  
  "5":  [ -0.0430,  6.8985, 0.12274 ],  
  "6":  [ -0.0756,  7.2970, 0.12204 ],  
  "7":  [ -0.1039,  7.6422, 0.12178 ],  
  "8":  [ -0.1288,  7.9487, 0.12181 ],  
  "9":  [ -0.1507,  8.2254, 0.12199 ],  
  "10": [ -0.1700,  8.4800, 0.12223 ],  
  "11": [ -0.1872,  8.7192, 0.12247 ],  
  "12": [ -0.2024,  8.9481, 0.12268 ],  
  "13": [ -0.2158,  9.1699, 0.12283 ],  
  "14": [ -0.2278,  9.3870, 0.12294 ],  
  "15": [ -0.2384,  9.6008, 0.12299 ],  
  "16": [ -0.2478,  9.8124, 0.12303 ],  
  "17": [ -0.2562, 10.0226, 0.12306 ],  
  "18": [ -0.2637, 10.2315, 0.12309 ],  
  "19": [ -0.2703, 10.4393, 0.12315 ],  
  "20": [ -0.2762, 10.6464, 0.12323 ],  
  "21": [ -0.2815, 10.8534, 0.12335 ],  
  "22": [ -0.2862, 11.0608, 0.12350 ],  
  "23": [ -0.2903, 11.2688, 0.12369 ],  
  "24": [ -0.2941, 11.4775, 0.12390 ],  
  "25": [ -0.2975, 11.6864, 0.12414 ],  
  "26": [ -0.3005, 11.8947, 0.12441 ],  
  "27": [ -0.3032, 12.1015, 0.12472 ],  
  "28": [ -0.3057, 12.3059, 0.12506 ],  
  "29": [ -0.3080, 12.5073, 0.12545 ],  
  "30": [ -0.3101, 12.7055, 0.12587 ],  
  "31": [ -0.3120, 12.9006, 0.12633 ],  
  "32": [ -0.3138, 13.0930, 0.12683 ],  
  "33": [ -0.3155, 13.2837, 0.12737 ],  
  "34": [ -0.3171, 13.4731, 0.12794 ],  
  "35": [ -0.3186, 13.6618, 0.12855 ]  
};  

// LMS WHO – długość/wzrost dla wieku 0–36 mies. (chłopcy i dziewczynki)  
const LMS_INFANT_HEIGHT_BOYS = {  
  "0":  [ 1.0, 49.8842, 0.03795 ],   // długość urodzeniowa (cm)  
  "1":  [ 1.0, 54.7244, 0.03557 ],  
  "2":  [ 1.0, 58.4249, 0.03424 ],  
  "3":  [ 1.0, 61.4292, 0.03328 ],  
  "4":  [ 1.0, 63.8860, 0.03257 ],  
  "5":  [ 1.0, 65.9026, 0.03204 ],  
  "6":  [ 1.0, 67.6236, 0.03165 ],  
  "7":  [ 1.0, 69.1645, 0.03139 ],  
  "8":  [ 1.0, 70.5994, 0.03124 ],  
  "9":  [ 1.0, 71.9687, 0.03117 ],  
  "10": [ 1.0, 73.2812, 0.03118 ],  
  "11": [ 1.0, 74.5388, 0.03125 ],  
  "12": [ 1.0, 75.7488, 0.03137 ],   // 12 mies.  
  "13": [ 1.0, 76.9186, 0.03154 ],  
  "14": [ 1.0, 78.0497, 0.03174 ],  
  "15": [ 1.0, 79.1458, 0.03197 ],  
  "16": [ 1.0, 80.2113, 0.03222 ],  
  "17": [ 1.0, 81.2487, 0.03250 ],  
  "18": [ 1.0, 82.2587, 0.03279 ],  
  "19": [ 1.0, 83.2418, 0.03310 ],  
  "20": [ 1.0, 84.1996, 0.03342 ],  
  "21": [ 1.0, 85.1348, 0.03376 ],  
  "22": [ 1.0, 86.0477, 0.03410 ],  
  "23": [ 1.0, 86.9410, 0.03445 ],  
  "24": [ 1.0, 87.1161, 0.03507 ],   // 24 mies. (od tego punktu – wysokość stojąca)  
  "25": [ 1.0, 87.9720, 0.03542 ],  
  "26": [ 1.0, 88.8065, 0.03576 ],  
  "27": [ 1.0, 89.6197, 0.03610 ],  
  "28": [ 1.0, 90.4120, 0.03642 ],  
  "29": [ 1.0, 91.1828, 0.03674 ],  
  "30": [ 1.0, 91.9327, 0.03704 ],  
  "31": [ 1.0, 92.6631, 0.03733 ],  
  "32": [ 1.0, 93.3753, 0.03761 ],  
  "33": [ 1.0, 94.0711, 0.03787 ],  
  "34": [ 1.0, 94.7532, 0.03812 ],  
  "35": [ 1.0, 95.4236, 0.03836 ]  
};  

const LMS_INFANT_HEIGHT_GIRLS = {  
  "0":  [ 1.0, 49.1477, 0.03790 ],  
  "1":  [ 1.0, 53.6872, 0.03640 ],  
  "2":  [ 1.0, 57.0673, 0.03568 ],  
  "3":  [ 1.0, 59.8029, 0.03520 ],  
  "4":  [ 1.0, 62.0899, 0.03486 ],  
  "5":  [ 1.0, 64.0301, 0.03463 ],  
  "6":  [ 1.0, 65.7311, 0.03448 ],  
  "7":  [ 1.0, 67.2873, 0.03441 ],  
  "8":  [ 1.0, 68.7498, 0.03440 ],  
  "9":  [ 1.0, 70.1435, 0.03444 ],  
  "10": [ 1.0, 71.4818, 0.03452 ],  
  "11": [ 1.0, 72.7710, 0.03464 ],  
  "12": [ 1.0, 74.0150, 0.03479 ],  
  "13": [ 1.0, 75.2176, 0.03496 ],  
  "14": [ 1.0, 76.3817, 0.03514 ],  
  "15": [ 1.0, 77.5099, 0.03534 ],  
  "16": [ 1.0, 78.6055, 0.03555 ],  
  "17": [ 1.0, 79.6710, 0.03576 ],  
  "18": [ 1.0, 80.7079, 0.03598 ],  
  "19": [ 1.0, 81.7182, 0.03620 ],  
  "20": [ 1.0, 82.7036, 0.03643 ],  
  "21": [ 1.0, 83.6654, 0.03666 ],  
  "22": [ 1.0, 84.6040, 0.03688 ],  
  "23": [ 1.0, 85.5202, 0.03711 ],  
  "24": [ 1.0, 85.7153, 0.03764 ],  
  "25": [ 1.0, 86.5904, 0.03786 ],  
  "26": [ 1.0, 87.4462, 0.03808 ],  
  "27": [ 1.0, 88.2830, 0.03830 ],  
  "28": [ 1.0, 89.1004, 0.03851 ],  
  "29": [ 1.0, 89.8991, 0.03872 ],  
  "30": [ 1.0, 90.6797, 0.03893 ],  
  "31": [ 1.0, 91.4430, 0.03913 ],  
  "32": [ 1.0, 92.1906, 0.03933 ],  
  "33": [ 1.0, 92.9239, 0.03952 ],  
  "34": [ 1.0, 93.6444, 0.03971 ],  
  "35": [ 1.0, 94.3533, 0.03989 ]  
};  

// Wzrost-for-age (Height-for-age) – WHO LMS data, chłopcy 36–216 miesięcy
const LMS_HEIGHT_WHO_BOYS = {
  "36": [1, 96.0835, 0.03858],
  "37": [1, 96.7337, 0.03879],
  "38": [1, 97.3749, 0.03900],
  "39": [1, 98.0073, 0.03919],
  "40": [1, 98.6310, 0.03937],
  "41": [1, 99.2459, 0.03954],
  "42": [1, 99.8515, 0.03971],
  "43": [1, 100.4485, 0.03986],
  "44": [1, 101.0374, 0.04002],
  "45": [1, 101.6186, 0.04016],
  "46": [1, 102.1933, 0.04031],
  "47": [1, 102.7625, 0.04045],
  "48": [1, 103.3273, 0.04059],
  "49": [1, 103.8886, 0.04073],
  "50": [1, 104.4473, 0.04086],
  "51": [1, 105.0041, 0.04100],
  "52": [1, 105.5596, 0.04113],
  "53": [1, 106.1138, 0.04126],
  "54": [1, 106.6668, 0.04139],
  "55": [1, 107.2188, 0.04152],
  "56": [1, 107.7697, 0.04165],
  "57": [1, 108.3198, 0.04177],
  "58": [1, 108.8689, 0.04190],
  "59": [1, 109.4170, 0.04202],
  "60": [1, 109.9638, 0.04214],
  "61": [1, 110.2647, 0.04164],
  "62": [1, 110.8006, 0.04172],
  "63": [1, 111.3338, 0.04180],
  "64": [1, 111.8636, 0.04187],
  "65": [1, 112.3895, 0.04195],
  "66": [1, 112.9110, 0.04203],
  "67": [1, 113.4280, 0.04211],
  "68": [1, 113.9410, 0.04218],
  "69": [1, 114.4500, 0.04226],
  "70": [1, 114.9547, 0.04234],
  "71": [1, 115.4549, 0.04241],
  "72": [1, 115.9509, 0.04249],
  "73": [1, 116.4432, 0.04257],
  "74": [1, 116.9325, 0.04264],
  "75": [1, 117.4196, 0.04272],
  "76": [1, 117.9046, 0.04280],
  "77": [1, 118.3880, 0.04287],
  "78": [1, 118.8700, 0.04295],
  "79": [1, 119.3508, 0.04303],
  "80": [1, 119.8303, 0.04311],
  "81": [1, 120.3085, 0.04318],
  "82": [1, 120.7853, 0.04326],
  "83": [1, 121.2604, 0.04334],
  "84": [1, 121.7338, 0.04342],
  "85": [1, 122.2053, 0.04350],
  "86": [1, 122.6750, 0.04358],
  "87": [1, 123.1429, 0.04366],
  "88": [1, 123.6092, 0.04374],
  "89": [1, 124.0736, 0.04382],
  "90": [1, 124.5361, 0.04390],
  "91": [1, 124.9964, 0.04398],
  "92": [1, 125.4545, 0.04406],
  "93": [1, 125.9104, 0.04414],
  "94": [1, 126.3640, 0.04422],
  "95": [1, 126.8156, 0.04430],
  "96": [1, 127.2651, 0.04438],
  "97": [1, 127.7129, 0.04446],
  "98": [1, 128.1590, 0.04454],
  "99": [1, 128.6034, 0.04462],
  "100": [1, 129.0466, 0.04470],
  "101": [1, 129.4887, 0.04478],
  "102": [1, 129.9300, 0.04487],
  "103": [1, 130.3705, 0.04495],
  "104": [1, 130.8103, 0.04503],
  "105": [1, 131.2495, 0.04511],
  "106": [1, 131.6884, 0.04519],
  "107": [1, 132.1269, 0.04527],
  "108": [1, 132.5652, 0.04535],
  "109": [1, 133.0031, 0.04543],
  "110": [1, 133.4404, 0.04551],
  "111": [1, 133.8770, 0.04559],
  "112": [1, 134.3130, 0.04566],
  "113": [1, 134.7483, 0.04574],
  "114": [1, 135.1829, 0.04582],
  "115": [1, 135.6168, 0.04589],
  "116": [1, 136.0501, 0.04597],
  "117": [1, 136.4829, 0.04604],
  "118": [1, 136.9153, 0.04612],
  "119": [1, 137.3474, 0.04619],
  "120": [1, 137.7795, 0.04626],
  "121": [1, 138.2119, 0.04633],
  "122": [1, 138.6452, 0.04640],
  "123": [1, 139.0797, 0.04647],
  "124": [1, 139.5158, 0.04654],
  "125": [1, 139.9540, 0.04661],
  "126": [1, 140.3948, 0.04667],
  "127": [1, 140.8387, 0.04674],
  "128": [1, 141.2859, 0.04680],
  "129": [1, 141.7368, 0.04686],
  "130": [1, 142.1916, 0.04692],
  "131": [1, 142.6501, 0.04698],
  "132": [1, 143.1126, 0.04703],
  "133": [1, 143.5795, 0.04709],
  "134": [1, 144.0511, 0.04714],
  "135": [1, 144.5276, 0.04719],
  "136": [1, 145.0093, 0.04723],
  "137": [1, 145.4964, 0.04728],
  "138": [1, 145.9891, 0.04732],
  "139": [1, 146.4878, 0.04736],
  "140": [1, 146.9927, 0.04740],
  "141": [1, 147.5041, 0.04744],
  "142": [1, 148.0224, 0.04747],
  "143": [1, 148.5478, 0.04750],
  "144": [1, 149.0807, 0.04753],
  "145": [1, 149.6212, 0.04755],
  "146": [1, 150.1694, 0.04758],
  "147": [1, 150.7256, 0.04759],
  "148": [1, 151.2899, 0.04761],
  "149": [1, 151.8623, 0.04762],
  "150": [1, 152.4425, 0.04763],
  "151": [1, 153.0298, 0.04763],
  "152": [1, 153.6234, 0.04764],
  "153": [1, 154.2223, 0.04763],
  "154": [1, 154.8258, 0.04763],
  "155": [1, 155.4329, 0.04762],
  "156": [1, 156.0426, 0.04760],
  "157": [1, 156.6539, 0.04758],
  "158": [1, 157.2660, 0.04756],
  "159": [1, 157.8775, 0.04754],
  "160": [1, 158.4871, 0.04751],
  "161": [1, 159.0937, 0.04747],
  "162": [1, 159.6962, 0.04744],
  "163": [1, 160.2939, 0.04740],
  "164": [1, 160.8861, 0.04735],
  "165": [1, 161.4720, 0.04730],
  "166": [1, 162.0505, 0.04725],
  "167": [1, 162.6207, 0.04720],
  "168": [1, 163.1816, 0.04714],
  "169": [1, 163.7321, 0.04707],
  "170": [1, 164.2717, 0.04701],
  "171": [1, 164.7994, 0.04694],
  "172": [1, 165.3145, 0.04687],
  "173": [1, 165.8165, 0.04679],
  "174": [1, 166.3050, 0.04671],
  "175": [1, 166.7799, 0.04663],
  "176": [1, 167.2415, 0.04655],
  "177": [1, 167.6899, 0.04646],
  "178": [1, 168.1255, 0.04637],
  "179": [1, 168.5482, 0.04628],
  "180": [1, 168.9580, 0.04619],
  "181": [1, 169.3549, 0.04609],
  "182": [1, 169.7389, 0.04599],
  "183": [1, 170.1099, 0.04589],
  "184": [1, 170.4680, 0.04579],
  "185": [1, 170.8136, 0.04569],
  "186": [1, 171.1468, 0.04559],
  "187": [1, 171.4680, 0.04548],
  "188": [1, 171.7773, 0.04538],
  "189": [1, 172.0748, 0.04527],
  "190": [1, 172.3606, 0.04516],
  "191": [1, 172.6345, 0.04506],
  "192": [1, 172.8967, 0.04495],
  "193": [1, 173.1470, 0.04484],
  "194": [1, 173.3856, 0.04473],
  "195": [1, 173.6126, 0.04462],
  "196": [1, 173.8280, 0.04451],
  "197": [1, 174.0321, 0.04440],
  "198": [1, 174.2251, 0.04429],
  "199": [1, 174.4071, 0.04418],
  "200": [1, 174.5784, 0.04407],
  "201": [1, 174.7392, 0.04396],
  "202": [1, 174.8896, 0.04385],
  "203": [1, 175.0301, 0.04375],
  "204": [1, 175.1609, 0.04364],
  "205": [1, 175.2824, 0.04353],
  "206": [1, 175.3951, 0.04343],
  "207": [1, 175.4995, 0.04332],
  "208": [1, 175.5959, 0.04322],
  "209": [1, 175.6850, 0.04311],
  "210": [1, 175.7672, 0.04301],
  "211": [1, 175.8432, 0.04291],
  "212": [1, 175.9133, 0.04281],
  "213": [1, 175.9781, 0.04271],
  "214": [1, 176.0380, 0.04261],
  "215": [1, 176.0935, 0.04251],
  "216": [1, 176.1449, 0.04241]
};

// Wzrost-for-age – WHO LMS data, dziewczynki 36–216 miesięcy
const LMS_HEIGHT_WHO_GIRLS = {
  "36": [1, 95.0515, 0.04006],
  "37": [1, 95.7399, 0.04024],
  "38": [1, 96.4187, 0.04041],
  "39": [1, 97.0885, 0.04057],
  "40": [1, 97.7493, 0.04073],
  "41": [1, 98.4015, 0.04089],
  "42": [1, 99.0448, 0.04105],
  "43": [1, 99.6795, 0.04120],
  "44": [1, 100.3058, 0.04135],
  "45": [1, 100.9238, 0.04150],
  "46": [1, 101.5337, 0.04164],
  "47": [1, 102.1360, 0.04179],
  "48": [1, 102.7312, 0.04193],
  "49": [1, 103.3197, 0.04206],
  "50": [1, 103.9021, 0.04220],
  "51": [1, 104.4786, 0.04233],
  "52": [1, 105.0494, 0.04246],
  "53": [1, 105.6148, 0.04259],
  "54": [1, 106.1748, 0.04272],
  "55": [1, 106.7295, 0.04285],
  "56": [1, 107.2788, 0.04298],
  "57": [1, 107.8227, 0.04310],
  "58": [1, 108.3613, 0.04322],
  "59": [1, 108.8948, 0.04334],
  "60": [1, 109.4233, 0.04347],
  "61": [1, 109.6016, 0.04355],
  "62": [1, 110.1258, 0.04364],
  "63": [1, 110.6451, 0.04373],
  "64": [1, 111.1596, 0.04382],
  "65": [1, 111.6696, 0.04390],
  "66": [1, 112.1753, 0.04399],
  "67": [1, 112.6767, 0.04407],
  "68": [1, 113.1740, 0.04415],
  "69": [1, 113.6672, 0.04423],
  "70": [1, 114.1565, 0.04431],
  "71": [1, 114.6421, 0.04439],
  "72": [1, 115.1244, 0.04447],
  "73": [1, 115.6039, 0.04454],
  "74": [1, 116.0812, 0.04461],
  "75": [1, 116.5568, 0.04469],
  "76": [1, 117.0311, 0.04475],
  "77": [1, 117.5044, 0.04482],
  "78": [1, 117.9769, 0.04489],
  "79": [1, 118.4489, 0.04495],
  "80": [1, 118.9208, 0.04502],
  "81": [1, 119.3926, 0.04508],
  "82": [1, 119.8648, 0.04514],
  "83": [1, 120.3374, 0.04520],
  "84": [1, 120.8105, 0.04525],
  "85": [1, 121.2843, 0.04531],
  "86": [1, 121.7587, 0.04536],
  "87": [1, 122.2338, 0.04542],
  "88": [1, 122.7098, 0.04547],
  "89": [1, 123.1868, 0.04551],
  "90": [1, 123.6646, 0.04556],
  "91": [1, 124.1435, 0.04561],
  "92": [1, 124.6234, 0.04565],
  "93": [1, 125.1045, 0.04569],
  "94": [1, 125.5869, 0.04573],
  "95": [1, 126.0706, 0.04577],
  "96": [1, 126.5558, 0.04581],
  "97": [1, 127.0424, 0.04585],
  "98": [1, 127.5304, 0.04588],
  "99": [1, 128.0199, 0.04591],
  "100": [1, 128.5109, 0.04594],
  "101": [1, 129.0035, 0.04597],
  "102": [1, 129.4975, 0.04600],
  "103": [1, 129.9932, 0.04602],
  "104": [1, 130.4904, 0.04604],
  "105": [1, 130.9891, 0.04607],
  "106": [1, 131.4895, 0.04608],
  "107": [1, 131.9912, 0.04610],
  "108": [1, 132.4944, 0.04612],
  "109": [1, 132.9989, 0.04613],
  "110": [1, 133.5046, 0.04614],
  "111": [1, 134.0118, 0.04615],
  "112": [1, 134.5202, 0.04616],
  "113": [1, 135.0299, 0.04616],
  "114": [1, 135.5410, 0.04617],
  "115": [1, 136.0533, 0.04617],
  "116": [1, 136.5670, 0.04616],
  "117": [1, 137.0821, 0.04616],
  "118": [1, 137.5987, 0.04616],
  "119": [1, 138.1167, 0.04615],
  "120": [1, 138.6363, 0.04614],
  "121": [1, 139.1575, 0.04612],
  "122": [1, 139.6803, 0.04611],
  "123": [1, 140.2049, 0.04609],
  "124": [1, 140.7313, 0.04607],
  "125": [1, 141.2594, 0.04605],
  "126": [1, 141.7892, 0.04603],
  "127": [1, 142.3206, 0.04600],
  "128": [1, 142.8534, 0.04597],
  "129": [1, 143.3874, 0.04594],
  "130": [1, 143.9222, 0.04591],
  "131": [1, 144.4575, 0.04588],
  "132": [1, 144.9929, 0.04584],
  "133": [1, 145.5280, 0.04580],
  "134": [1, 146.0622, 0.04576],
  "135": [1, 146.5951, 0.04571],
  "136": [1, 147.1262, 0.04567],
  "137": [1, 147.6548, 0.04562],
  "138": [1, 148.1804, 0.04557],
  "139": [1, 148.7023, 0.04552],
  "140": [1, 149.2197, 0.04546],
  "141": [1, 149.7322, 0.04541],
  "142": [1, 150.2390, 0.04535],
  "143": [1, 150.7394, 0.04529],
  "144": [1, 151.2327, 0.04523],
  "145": [1, 151.7182, 0.04516],
  "146": [1, 152.1951, 0.04510],
  "147": [1, 152.6628, 0.04503],
  "148": [1, 153.1206, 0.04497],
  "149": [1, 153.5678, 0.04490],
  "150": [1, 154.0041, 0.04483],
  "151": [1, 154.4290, 0.04476],
  "152": [1, 154.8423, 0.04468],
  "153": [1, 155.2437, 0.04461],
  "154": [1, 155.6330, 0.04454],
  "155": [1, 156.0101, 0.04446],
  "156": [1, 156.3748, 0.04439],
  "157": [1, 156.7269, 0.04431],
  "158": [1, 157.0666, 0.04423],
  "159": [1, 157.3936, 0.04415],
  "160": [1, 157.7082, 0.04408],
  "161": [1, 158.0102, 0.04400],
  "162": [1, 158.2997, 0.04392],
  "163": [1, 158.5771, 0.04384],
  "164": [1, 158.8425, 0.04376],
  "165": [1, 159.0961, 0.04369],
  "166": [1, 159.3382, 0.04361],
  "167": [1, 159.5691, 0.04353],
  "168": [1, 159.7890, 0.04345],
  "169": [1, 159.9983, 0.04337],
  "170": [1, 160.1971, 0.04330],
  "171": [1, 160.3857, 0.04322],
  "172": [1, 160.5643, 0.04314],
  "173": [1, 160.7332, 0.04307],
  "174": [1, 160.8927, 0.04299],
  "175": [1, 161.0430, 0.04292],
  "176": [1, 161.1845, 0.04284],
  "177": [1, 161.3176, 0.04277],
  "178": [1, 161.4425, 0.04270],
  "179": [1, 161.5596, 0.04263],
  "180": [1, 161.6692, 0.04255],
  "181": [1, 161.7717, 0.04248],
  "182": [1, 161.8673, 0.04241],
  "183": [1, 161.9564, 0.04235],
  "184": [1, 162.0393, 0.04228],
  "185": [1, 162.1164, 0.04221],
  "186": [1, 162.1880, 0.04214],
  "187": [1, 162.2542, 0.04208],
  "188": [1, 162.3154, 0.04201],
  "189": [1, 162.3719, 0.04195],
  "190": [1, 162.4239, 0.04189],
  "191": [1, 162.4717, 0.04182],
  "192": [1, 162.5156, 0.04176],
  "193": [1, 162.5560, 0.04170],
  "194": [1, 162.5933, 0.04164],
  "195": [1, 162.6276, 0.04158],
  "196": [1, 162.6594, 0.04152],
  "197": [1, 162.6890, 0.04147],
  "198": [1, 162.7165, 0.04141],
  "199": [1, 162.7425, 0.04136],
  "200": [1, 162.7670, 0.04130],
  "201": [1, 162.7904, 0.04125],
  "202": [1, 162.8126, 0.04119],
  "203": [1, 162.8340, 0.04114],
  "204": [1, 162.8545, 0.04109],
  "205": [1, 162.8743, 0.04104],
  "206": [1, 162.8935, 0.04099],
  "207": [1, 162.9120, 0.04094],
  "208": [1, 162.9300, 0.04089],
  "209": [1, 162.9476, 0.04084],
  "210": [1, 162.9649, 0.04080],
  "211": [1, 162.9817, 0.04075],
  "212": [1, 162.9983, 0.04071],
  "213": [1, 163.0144, 0.04066],
  "214": [1, 163.0300, 0.04062],
  "215": [1, 163.0451, 0.04058],
  "216": [1, 163.0595, 0.04053]
};

// Masa ciała-for-age (Weight-for-age) – WHO LMS data, chłopcy 36–120 miesięcy
const LMS_WEIGHT_WHO_BOYS = {
  "36": [-0.0689, 14.3429, 0.12116],
  "37": [-0.0729, 14.5113, 0.12168],
  "38": [-0.0769, 14.6791, 0.12220],
  "39": [-0.0808, 14.8466, 0.12271],
  "40": [-0.0846, 15.0140, 0.12322],
  "41": [-0.0883, 15.1813, 0.12373],
  "42": [-0.0920, 15.3486, 0.12425],
  "43": [-0.0957, 15.5158, 0.12478],
  "44": [-0.0993, 15.6828, 0.12531],
  "45": [-0.1028, 15.8497, 0.12586],
  "46": [-0.1063, 16.0163, 0.12643],
  "47": [-0.1097, 16.1827, 0.12700],
  "48": [-0.1131, 16.3489, 0.12759],
  "49": [-0.1166, 16.5139, 0.12818],
  "50": [-0.1200, 16.6788, 0.12878],
  "51": [-0.1233, 16.8438, 0.12937],
  "52": [-0.1266, 17.0079, 0.12996],
  "53": [-0.1298, 17.1719, 0.13055],
  "54": [-0.1329, 17.3351, 0.13113],
  "55": [-0.1359, 17.4973, 0.13172],
  "56": [-0.1389, 17.6586, 0.13230],
  "57": [-0.1417, 17.8189, 0.13289],
  "58": [-0.1447, 17.9783, 0.13347],
  "59": [-0.1477, 18.1367, 0.13405],
  "60": [-0.1506, 18.2943, 0.13464],
  "61": [-0.2026, 18.5057, 0.12988],
  "62": [-0.2130, 18.6802, 0.13028],
  "63": [-0.2234, 18.8563, 0.13067],
  "64": [-0.2338, 19.0340, 0.13105],
  "65": [-0.2443, 19.2132, 0.13142],
  "66": [-0.2548, 19.3940, 0.13178],
  "67": [-0.2653, 19.5765, 0.13213],
  "68": [-0.2758, 19.7607, 0.13246],
  "69": [-0.2864, 19.9468, 0.13279],
  "70": [-0.2969, 20.1344, 0.13311],
  "71": [-0.3075, 20.3235, 0.13342],
  "72": [-0.3180, 20.5137, 0.13372],
  "73": [-0.3285, 20.7052, 0.13402],
  "74": [-0.3390, 20.8979, 0.13432],
  "75": [-0.3494, 21.0918, 0.13462],
  "76": [-0.3598, 21.2870, 0.13493],
  "77": [-0.3701, 21.4833, 0.13523],
  "78": [-0.3804, 21.6810, 0.13554],
  "79": [-0.3906, 21.8799, 0.13586],
  "80": [-0.4007, 22.0800, 0.13618],
  "81": [-0.4107, 22.2813, 0.13652],
  "82": [-0.4207, 22.4837, 0.13686],
  "83": [-0.4305, 22.6872, 0.13722],
  "84": [-0.4402, 22.8915, 0.13759],
  "85": [-0.4499, 23.0968, 0.13797],
  "86": [-0.4594, 23.3029, 0.13838],
  "87": [-0.4688, 23.5101, 0.13880],
  "88": [-0.4781, 23.7182, 0.13923],
  "89": [-0.4873, 23.9272, 0.13969],
  "90": [-0.4964, 24.1371, 0.14016],
  "91": [-0.5053, 24.3479, 0.14065],
  "92": [-0.5142, 24.5595, 0.14117],
  "93": [-0.5229, 24.7722, 0.14170],
  "94": [-0.5315, 24.9858, 0.14226],
  "95": [-0.5399, 25.2005, 0.14284],
  "96": [-0.5482, 25.4163, 0.14344],
  "97": [-0.5564, 25.6332, 0.14407],
  "98": [-0.5644, 25.8513, 0.14472],
  "99": [-0.5722, 26.0706, 0.14539],
  "100": [-0.5799, 26.2911, 0.14608],
  "101": [-0.5873, 26.5128, 0.14679],
  "102": [-0.5946, 26.7358, 0.14752],
  "103": [-0.6017, 26.9602, 0.14828],
  "104": [-0.6085, 27.1861, 0.14905],
  "105": [-0.6152, 27.4137, 0.14984],
  "106": [-0.6216, 27.6432, 0.15066],
  "107": [-0.6278, 27.8750, 0.15149],
  "108": [-0.6337, 28.1092, 0.15233],
  "109": [-0.6393, 28.3459, 0.15319],
  "110": [-0.6446, 28.5854, 0.15406],
  "111": [-0.6496, 28.8277, 0.15493],
  "112": [-0.6545, 29.0728, 0.15582],
  "113": [-0.6591, 29.3205, 0.15672],
  "114": [-0.6634, 29.5710, 0.15762],
  "115": [-0.6674, 29.8240, 0.15853],
  "116": [-0.6711, 30.0796, 0.15945],
  "117": [-0.6744, 30.3376, 0.16037],
  "118": [-0.6775, 30.5980, 0.16130],
  "119": [-0.6802, 30.8605, 0.16223],
  "120": [-0.6825, 31.1251, 0.16317]
};

// Masa ciała-for-age – WHO LMS data, dziewczynki 36–120 miesięcy
const LMS_WEIGHT_WHO_GIRLS = {
  "36": [-0.3201, 13.8503, 0.12919],
  "37": [-0.3216, 14.0385, 0.12988],
  "38": [-0.3230, 14.2265, 0.13059],
  "39": [-0.3243, 14.4140, 0.13135],
  "40": [-0.3257, 14.6010, 0.13213],
  "41": [-0.3270, 14.7873, 0.13293],
  "42": [-0.3283, 14.9727, 0.13376],
  "43": [-0.3296, 15.1573, 0.13460],
  "44": [-0.3309, 15.3410, 0.13545],
  "45": [-0.3322, 15.5240, 0.13630],
  "46": [-0.3335, 15.7064, 0.13716],
  "47": [-0.3348, 15.8882, 0.13800],
  "48": [-0.3361, 16.0697, 0.13884],
  "49": [-0.3374, 16.2511, 0.13968],
  "50": [-0.3387, 16.4322, 0.14051],
  "51": [-0.3400, 16.6133, 0.14132],
  "52": [-0.3414, 16.7942, 0.14213],
  "53": [-0.3427, 16.9748, 0.14293],
  "54": [-0.3440, 17.1551, 0.14371],
  "55": [-0.3453, 17.3347, 0.14448],
  "56": [-0.3466, 17.5136, 0.14525],
  "57": [-0.3479, 17.6916, 0.14600],
  "58": [-0.3492, 17.8686, 0.14675],
  "59": [-0.3505, 18.0445, 0.14748],
  "60": [-0.3518, 18.2193, 0.14821],
  "61": [-0.4681, 18.2579, 0.14295],
  "62": [-0.4711, 18.4329, 0.14350],
  "63": [-0.4742, 18.6073, 0.14404],
  "64": [-0.4773, 18.7811, 0.14459],
  "65": [-0.4803, 18.9545, 0.14514],
  "66": [-0.4834, 19.1276, 0.14569],
  "67": [-0.4864, 19.3004, 0.14624],
  "68": [-0.4894, 19.4730, 0.14679],
  "69": [-0.4924, 19.6455, 0.14735],
  "70": [-0.4954, 19.8180, 0.14790],
  "71": [-0.4984, 19.9908, 0.14845],
  "72": [-0.5013, 20.1639, 0.14900],
  "73": [-0.5043, 20.3377, 0.14955],
  "74": [-0.5072, 20.5124, 0.15010],
  "75": [-0.5100, 20.6885, 0.15065],
  "76": [-0.5129, 20.8661, 0.15120],
  "77": [-0.5157, 21.0457, 0.15175],
  "78": [-0.5185, 21.2274, 0.15230],
  "79": [-0.5213, 21.4113, 0.15284],
  "80": [-0.5240, 21.5979, 0.15339],
  "81": [-0.5268, 21.7872, 0.15393],
  "82": [-0.5294, 21.9795, 0.15448],
  "83": [-0.5321, 22.1751, 0.15502],
  "84": [-0.5347, 22.3740, 0.15556],
  "85": [-0.5372, 22.5762, 0.15610],
  "86": [-0.5398, 22.7816, 0.15663],
  "87": [-0.5423, 22.9904, 0.15717],
  "88": [-0.5447, 23.2025, 0.15770],
  "89": [-0.5471, 23.4180, 0.15823],
  "90": [-0.5495, 23.6369, 0.15876],
  "91": [-0.5518, 23.8593, 0.15928],
  "92": [-0.5541, 24.0853, 0.15980],
  "93": [-0.5563, 24.3149, 0.16032],
  "94": [-0.5585, 24.5482, 0.16084],
  "95": [-0.5606, 24.7853, 0.16135],
  "96": [-0.5627, 25.0262, 0.16186],
  "97": [-0.5647, 25.2710, 0.16237],
  "98": [-0.5667, 25.5197, 0.16287],
  "99": [-0.5686, 25.7721, 0.16337],
  "100": [-0.5704, 26.0284, 0.16386],
  "101": [-0.5722, 26.2883, 0.16435],
  "102": [-0.5740, 26.5519, 0.16483],
  "103": [-0.5757, 26.8190, 0.16532],
  "104": [-0.5773, 27.0896, 0.16579],
  "105": [-0.5789, 27.3635, 0.16626],
  "106": [-0.5804, 27.6406, 0.16673],
  "107": [-0.5819, 27.9208, 0.16719],
  "108": [-0.5833, 28.2040, 0.16764],
  "109": [-0.5847, 28.4901, 0.16809],
  "110": [-0.5859, 28.7791, 0.16854],
  "111": [-0.5872, 29.0711, 0.16897],
  "112": [-0.5885, 29.3663, 0.16941],
  "113": [-0.5897, 29.6640, 0.16983],
  "114": [-0.5908, 29.9641, 0.17025],
  "115": [-0.5919, 30.2665, 0.17067],
  "116": [-0.5929, 30.5713, 0.17108],
  "117": [-0.5938, 30.8783, 0.17148],
  "118": [-0.5947, 31.1875, 0.17188],
  "119": [-0.5954, 31.4987, 0.17227],
  "120": [-0.5961, 31.8119, 0.17266]
};
/* =================================================================== */
// LMS dla wagi chłopców 3–18 lat (klucz: wiek w miesiącach, wartość: [L, M, S])
const LMS_WEIGHT_BOYS = {
  "36":[-1.289,14.9,0.131],
  "42":[-1.35,16.0,0.131],
  "48":[-1.382,17.1,0.130],
  "54":[-1.379,18.1,0.134],
  "60":[-1.369,19.1,0.142],
  "66":[-1.384,20.3,0.152],
  "72":[-1.416,21.6,0.163],
  "84":[-1.3451,24.4425,0.1739],
  "96":[-1.2241,27.5948,0.1853],
  "108":[-1.1007,30.82,0.1969],
  "120":[-0.9733,34.2322,0.2077],
  "132":[-0.841,38.1082,0.2164],
  "144":[-0.7093,42.7117,0.2205],
  "156":[-0.6043,48.1026,0.2164],
  "168":[-0.5548,53.7776,0.2034],
  "180":[-0.5641,59.0021,0.1864],
  "192":[-0.6093,63.3307,0.1716],
  "204":[-0.6625,66.8807,0.1601],
  "216":[-0.711,69.8692,0.151]
};
// LMS dla wzrostu chłopców 3–18 lat
const LMS_HEIGHT_BOYS = {
  "36":[1.0,97.5,0.038],
  "42":[1.0,101.3,0.039],
  "48":[1.0,104.9,0.039],
  "54":[1.0,108.4,0.040],
  "60":[1.0,111.8,0.041],
  "66":[1.0,115.2,0.041],
  "72":[1.0,118.4,0.042],
  "84":[1.0,124.5763,0.0407],
  "96":[1.0,130.5084,0.0422],
  "108":[1.0,136.27,0.0441],
  "120":[1.0,141.4685,0.0457],
  "132":[1.0,146.749,0.0473],
  "144":[1.0,152.9406,0.0499],
  "156":[1.0,160.2044,0.0511],
  "168":[1.0,167.2116,0.0481],
  "180":[1.0,172.4996,0.0430],
  "192":[1.0,175.7266,0.0392],
  "204":[1.0,177.6036,0.0370],
  "216":[1.0,178.6756,0.0357]
};
// LMS dla wagi dziewczynek 3–18 lat
const LMS_WEIGHT_GIRLS = {
  "36":[-1.211,14.5,0.129],
  "42":[-1.202,15.5,0.135],
  "48":[-1.192,16.6,0.141],
  "54":[-1.182,17.6,0.147],
  "60":[-1.170,18.7,0.153],
  "66":[-1.157,19.8,0.158],
  "72":[-1.142,21.0,0.164],
  "84":[-1.0642,23.4756,0.1703],
  "96":[-1.0484,26.6216,0.1825],
  "108":[-0.9785,29.9233,0.1940],
  "120":[-0.8443,33.5526,0.2050],
  "132":[-0.6766,37.8737,0.2133],
  "144":[-0.5461,42.8172,0.2095],
  "156":[-0.5460,47.6669,0.1936],
  "168":[-0.7062,51.3003,0.1742],
  "180":[-0.9209,53.6394,0.1589],
  "192":[-1.0647,54.9580,0.1506],
  "204":[-1.1518,55.7267,0.1461],
  "216":[-1.2035,56.1779,0.1434]
};
// LMS dla wzrostu dziewczynek 3–18 lat
const LMS_HEIGHT_GIRLS = {
  "36":[1.0,96.3,0.040],
  "42":[1.0,100.1,0.040],
  "48":[1.0,103.7,0.040],
  "54":[1.0,107.2,0.041],
  "60":[1.0,110.5,0.042],
  "66":[1.0,113.8,0.042],
  "72":[1.0,117.0,0.043],
  "84":[1.0,123.0195,0.0419],
  "96":[1.0,129.3683,0.0440],
  "108":[1.0,135.2446,0.0457],
  "120":[1.0,140.7839,0.0471],
  "132":[1.0,147.1313,0.0472],
  "144":[1.0,153.8132,0.0444],
  "156":[1.0,159.0773,0.0406],
  "168":[1.0,162.2376,0.0380],
  "180":[1.0,163.7435,0.0368],
  "192":[1.0,164.3511,0.0363],
  "204":[1.0,164.7437,0.0360],
  "216":[1.0,165.0598,0.0358]
};

/* =========================================================================
   getChildLMS(sex, ageYears, param)
   ‑ zwraca [L,M,S] lub null
   ‑ automatycznie przełącza się na drugie źródło, jeśli w preferowanym brak danych
   ‑ weightUsedFallback == true  ⇒  waga bierze się z OLAF, bo WHO nie ma >10 l.
   ========================================================================= */
   function getChildLMS(sex, ageYears, param){
    const ageMonths = Math.round(ageYears * 12);
    if (ageMonths > 216) return null;                 // >18 l. – brak danych pediatrycznych
  
    /* -------- reset flagi fallbacku (ważne przy kolejnym wywołaniu) -------- */
    if (param === 'WT') weightUsedFallback = false;
  
    /* -------- wybór zbioru danych wg wieku, płci i preferencji suwaka ------- */
    const isBoy = (sex === 'M');
    const preferOlaf = (typeof bmiSource !== 'undefined' && bmiSource === 'OLAF');
  
    /* definicja pomocnicza */
    function dataset(source){
       if (param === 'WT'){                 // ----- MASA -----
           if (source === 'OLAF') return isBoy ? LMS_WEIGHT_BOYS : LMS_WEIGHT_GIRLS;
           /* WHO waga kończy się na 120 m‑cy (10 l.) */
           if (ageMonths > 120) return null;
           return isBoy ? LMS_WEIGHT_WHO_BOYS : LMS_WEIGHT_WHO_GIRLS;
       }else{                               // ----- WZROST -----
           if (source === 'OLAF') return isBoy ? LMS_HEIGHT_BOYS : LMS_HEIGHT_GIRLS;
           return isBoy ? LMS_HEIGHT_WHO_BOYS : LMS_HEIGHT_WHO_GIRLS;
       }
    }
  
    /* ----------------------- niemowlęta < 36 mies. ------------------------- */
    if (ageMonths < 36){
      const idx   = String(ageMonths);                         // klucz 0‑35
      if (param === 'WT'){
         const tbl = isBoy ? LMS_INFANT_WEIGHT_BOYS
                           : LMS_INFANT_WEIGHT_GIRLS;
         return tbl[idx] || null;                             // [L,M,S] albo null
      }
      const tbl =  isBoy ? LMS_INFANT_HEIGHT_BOYS
                         : LMS_INFANT_HEIGHT_GIRLS;
      return tbl[idx] || null;
    }
  
    /* ----------------------- dzieci 3‑18 lat -------------------------------- */
    let dataSet = preferOlaf ? dataset('OLAF') : dataset('WHO');
  
    /* jeśli brak danych w preferowanym źródle ➔ spróbuj drugiego */
    if (!dataSet){
        dataSet = preferOlaf ? dataset('WHO') : dataset('OLAF');
        if (param === 'WT') weightUsedFallback = true;   // zapisz fakt fallbacku
    }
    if (!dataSet) return null;   // naprawdę brak w obu źródłach
  
    /* ----------- odczyt / interpolacja liniowa pomiędzy miesiącami ---------- */
    const key = String(ageMonths);
    if (dataSet[key]) return dataSet[key];
  
    const keys = Object.keys(dataSet).map(Number).sort((a,b)=>a-b);
    let lo = keys[0], hi = keys[keys.length-1];
    for (let k of keys){
        if (k <= ageMonths) lo = k;
        if (k >= ageMonths){ hi = k; break; }
    }
    if (!dataSet[lo] || !dataSet[hi]) return null;
    if (lo === hi) return dataSet[lo];
  
    const [L1,M1,S1] = dataSet[lo];
    const [L2,M2,S2] = dataSet[hi];
    const t = (ageMonths - lo) / (hi - lo);
    return [ L1 + t*(L2 - L1),  M1 + t*(M2 - M1),  S1 + t*(S2 - S1) ];
  }

function calcPercentileStats(value, sex, ageYears, param) {
  const lms = getChildLMS(sex, ageYears, param);
  if (!lms) return null;  // brak danych dla tego zakresu
  const [L, M, S] = lms;
  // Oblicz z-score wg formuły LMS
  let z;
  if (L !== 0) {
      z = (Math.pow(value / M, L) - 1) / (L * S);
  } else {
      z = Math.log(value / M) / S;
  }
  // Oblicz centyl na podstawie rozkładu normalnego
  const percentile = normalCDF(z) * 100;
  return { percentile: percentile, sd: z };
}

function centylWord(centTxt){
  // jeśli zawiera &lt;1 lub &gt;100 ➔ użyj dopełniacza „centyla”
  if (centTxt.includes('&lt;') || centTxt.includes('&gt;')) return 'centyla';
  // domyślnie zostaw „centyl” (używane w karcie od lat)
  return 'centyl';
}

function formatCentile(p) {
  // identyczny próg jak w BMI: 0‑1% lub 99,9‑100%
  if (p >= 99.9) return '&gt;100';
  if (p <   1.0) return '&lt;1';
  // w pozostałych przypadkach pokażemy 1 cyfrę po kropce,
  // ale bez zbędnego „.0” (żeby 75,0 → 75)
  // w pozostałych przypadkach zaokrąglij wynik do pełnej wartości
  return Math.round(p).toString();
}

/**
 * Zamień wartość percentyla na opisowy tekst używany w kartach wyników.
 *
 * formatCentile() zwraca surowy tekst z operatorami (&lt;, &gt;, liczba).
 * Na jego podstawie budujemy pełny opis: „N centyl”, „poniżej 1 centyla”,
 * „powyżej 100 centyla”. Dla liczb używamy słowa „centyl” bez odmiany,
 * zgodnie z przykładem w karcie „Ostatni pomiar”.
 *
 * @param {number} p – percentile
 * @returns {string} opis percentyla z odpowiednim słowem
 */
function formatCentileLabel(p) {
  const raw = formatCentile(p);
  // Zamień ewentualne encje HTML na symbole < i >
  const txt = raw.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  /*
   * Funkcja ta zwraca opis percentyla w języku polskim lub angielskim w
   * zależności od kontekstu.  Aby całkowicie odseparować tryb publikacji
   * (wykorzystywany w sekcji „Zaawansowane obliczenia wzrostowe”) od innych
   * widoków, wprowadzono nową zmienną globalną `window.forceCentileEnglish`.
   * Gdy jest ona ustawiona na true, wszystkie opisy percentyli są
   * generowane w języku angielskim, niezależnie od wybranego źródła
   * danych.  W przeciwnym razie (wartość false lub brak zmiennej)
   * zwracane są polskie opisy.
   */
  let useEnglish = false;
  try {
    if (typeof window !== 'undefined' && window.forceCentileEnglish) {
      useEnglish = true;
    }
  } catch (_) {
    useEnglish = false;
  }
  // Jeżeli wymuszono angielski opis, wygeneruj ordinal plus „percentile”
  if (useEnglish) {
    // Funkcja pomocnicza do dodawania angielskiego sufiksu porządkowego
    const ordinalEng = (nStr) => {
      const n = parseInt(nStr, 10);
      if (isNaN(n)) return nStr;
      const mod100 = n % 100;
      let suffix = 'th';
      if (mod100 < 11 || mod100 > 13) {
        const mod10 = n % 10;
        if (mod10 === 1) suffix = 'st';
        else if (mod10 === 2) suffix = 'nd';
        else if (mod10 === 3) suffix = 'rd';
      }
      return `${n}${suffix}`;
    };
    if (txt.startsWith('<')) {
      const num = txt.replace('<', '').trim();
      return `<${ordinalEng(num)} percentile`;
    }
    if (txt.startsWith('>')) {
      const num = txt.replace('>', '').trim();
      return `>${ordinalEng(num)} percentile`;
    }
    return `${ordinalEng(txt)} percentile`;
  }
  // W przeciwnym wypadku zwróć polskie opisy: poniżej/powyżej N centyla lub N centyl.
  if (txt.startsWith('<')) {
    const num = txt.replace('<', '').trim();
    return `poniżej ${num} centyla`;
  }
  if (txt.startsWith('>')) {
    const num = txt.replace('>', '').trim();
    return `powyżej ${num} centyla`;
  }
  return `${txt} centyl`;
}

function erf(x) {
  // Abramowitz & Stegun formula 7.1.26
  const sign = (x >= 0) ? 1 : -1;
  x = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741,
        a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

function normalCDF(x) {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

// 8P-2: pojedyncza kanoniczna implementacja bmiPercentileChild znajduje się niżej,
// przy bmiZscore(). Usunięto wcześniejszą nadpisywaną deklarację bez zmiany
// runtime: w JavaScript ostatnia deklaracja o tej nazwie była wiążąca.

function bmiCategoryChildExact(percentile){
  if(percentile === null) return '';
  // Zastosuj polskie progi (OLAF/Palczewska) dla źródła 'OLAF' lub 'PALCZEWSKA'
  const useOlaf = (typeof bmiSource !== 'undefined' && (bmiSource === 'OLAF' || bmiSource === 'PALCZEWSKA'));
  const normalHi = useOlaf ? CHILD_THRESH_OLAF.NORMAL_HI : CHILD_THRESH_WHO.NORMAL_HI;
  const obesity  = useOlaf ? CHILD_THRESH_OLAF.OBESE     : CHILD_THRESH_WHO.OBESE;
  // Niedowaga poniżej 5. centyla
  if (percentile < 5) return 'Niedowaga';
  // Prawidłowe BMI pomiędzy 5. a górną granicą normy
  if (percentile < normalHi) return 'Prawidłowe';
  // Nadwaga poniżej progu otyłości
  if (percentile < obesity) return 'Nadwaga';
  // Otyłość olbrzymia – ≥99,9 centyla (≈ 3 SD)
  if (percentile >= 99.9) return 'Otyłość olbrzymia';
  // Otyłość (obesity threshold ≤ percentyl < 99,9)
  return 'Otyłość';
}

const downloadPDFButton = document.getElementById('downloadPDF');
if (downloadPDFButton && document.getElementById('bmrInfo') && document.getElementById('toNormInfo')) {
  downloadPDFButton.addEventListener('click', async function() {
  try {
  vildaEnsureGlobalDependencyContract('main-bmi-metabolism-pdf', { silent: true, showUi: true, throwOnMissing: false, message: 'Brakuje biblioteki jsPDF potrzebnej do wygenerowania raportu BMI/metabolizmu.' });
  const jsPDF = vildaRequireGlobalFunction('jspdf.jsPDF', 'main-bmi-metabolism-pdf');
  if (!jsPDF) return;
  const pdf = new jsPDF('p', 'mm', 'a4');
  const left = 18;
  let y = 18;

  // 1. Logo
  const logo = document.querySelector('header img');
  const toDataURL = async url => {
    const fetchBlobWithTimeout = (typeof window !== 'undefined' && window.VildaAppHelpers && typeof window.VildaAppHelpers.fetchBlobWithTimeout === 'function')
      ? window.VildaAppHelpers.fetchBlobWithTimeout
      : ((typeof window !== 'undefined' && typeof window.vildaFetchBlobWithTimeout === 'function') ? window.vildaFetchBlobWithTimeout : null);
    if (typeof fetchBlobWithTimeout !== 'function') return '';
    const blob = await fetchBlobWithTimeout(url, { timeoutMs: 8000, context: 'main-bmi-metabolism-pdf:logo-blob' });
    return await new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => res(reader.result);
      reader.onerror = () => rej(reader.error || new Error('FileReader error'));
      reader.readAsDataURL(blob);
    });
  };
  let logoData = '';
  try { logoData = logo && logo.src ? await toDataURL(logo.src) : ''; } catch (e) { vildaLogAppWarn('main-bmi-metabolism-pdf', 'Nie udało się pobrać logo do raportu PDF', e); logoData = ''; }
  if(logoData) pdf.addImage(logoData, 'JPEG', left, y, 36, 18);

  // 2. Nagłówek
  pdf.setFont('helvetica','bold');
  pdf.setTextColor(0, 131, 141);
  pdf.setFontSize(19);
  pdf.text("VILDA CLINIC", left + 44, y + 10);
  pdf.setFontSize(13);
  pdf.setTextColor(66, 66, 66);
  pdf.setFont('helvetica','normal');
  pdf.text("Raport BMI & Metabolizmu", left + 44, y + 18);
  y += 28;

  // 3. Dane użytkownika – karta
  pdf.setFillColor(230, 245, 246);
  pdf.roundedRect(left, y, 174, 18, 4, 4, 'F');
  pdf.setFont('helvetica','bold');
  pdf.setFontSize(12);
  pdf.setTextColor(0,131,141);
  pdf.text("DANE PACJENTA", left + 3, y + 7);
  pdf.setFont('helvetica','normal');
  pdf.setTextColor(33,33,33);

  // Odczytaj dane użytkownika
  const yearsPdf   = parseInt(document.getElementById('age')?.value) || 0;
  const monthsPdfEl = document.getElementById('ageMonths');
  const monthsPdf  = monthsPdfEl ? parseInt(monthsPdfEl.value) || 0 : 0;
  const age = yearsPdf + (monthsPdf / 12);
  const weight = parseFloat(document.getElementById('weight')?.value) || 0;
  const height = parseFloat(document.getElementById('height')?.value) || 0;
  const sexCode = document.getElementById('sex')?.value === 'F' ? 'F' : 'M';
  const sexLabel = sexCode === 'M' ? "Mężczyzna" : "Kobieta";
  // Sformatuj wiek w postaci „X lat Y mies.” jeśli podano miesiące
  let ageStr = `${yearsPdf} lat`;
  if(monthsPdf){
    ageStr += ` ${monthsPdf} mies.`;
  }
  y += 12;
  pdf.setFontSize(11);
  pdf.text(`Płeć: ${sexLabel}`, left + 4, y + 8);
  pdf.text(`Wiek: ${ageStr}`, left + 50, y + 8);
  pdf.text(`Wzrost: ${height} cm`, left + 90, y + 8);
  pdf.text(`Waga: ${weight} kg`, left + 140, y + 8);
  y += 18;

  // 4. BMI – karta
  pdf.setFillColor(255,255,255);
  pdf.roundedRect(left, y, 174, 26, 4, 4, 'F');
  pdf.setFont('helvetica','bold');
  pdf.setFontSize(12);
  pdf.setTextColor(0,131,141);
  pdf.text("WYNIKI BMI", left + 3, y + 7);
  pdf.setFont('helvetica','normal');
  pdf.setTextColor(40,40,40);

  let bmrBox = (document.getElementById('bmrInfo')?.innerText || '').replace(/\n+/g, '\n').trim();
  let bmiLines = pdf.splitTextToSize(bmrBox, 170);
  pdf.setFontSize(11);
  pdf.text(bmiLines, left + 4, y + 14);
  y += Math.max(26, 14 + bmiLines.length * 6);

  // 5. Droga do normy BMI – karta i tabela
  const toNormData = (weight > 0 && height > 0)
    ? distanceToNormalBMI(weight, height, age, sexCode)
    : null;
  const journeyModel = toNormData ? (toNormData.activityModel || activityBuildJourneyBurnState({
    kcalTarget: toNormData.kcalToBurn,
    weightKg: weight,
    ageYears: age
  })) : null;
  const journeyRows = activityGetPdfRows(journeyModel);
  const journeyBoxTextRaw = (document.getElementById('toNormInfo')?.innerText || '').replace(/\n+/g, '\n').trim();
  const journeySummaryText = (toNormData && age >= 5)
    ? `Musisz zredukować masę o ${toNormData.kgToLose.toFixed(1).replace('.', ',')} kg (ok. ${Math.round(toNormData.kcalToBurn)} kcal).`
    : (journeyBoxTextRaw || 'BMI jest w normie.');
  const drogaLines = pdf.splitTextToSize(journeySummaryText, 170);
  const journeyTableHeight = journeyRows.length ? (7 + journeyRows.length * 7) : 0;
  const journeyBoxHeight = Math.max(30, 16 + drogaLines.length * 6 + (journeyRows.length ? journeyTableHeight + 10 : 0));

  pdf.setFillColor(248, 251, 250);
  pdf.roundedRect(left, y, 174, journeyBoxHeight, 4, 4, 'F');
  pdf.setFont('helvetica','bold');
  pdf.setFontSize(12);
  pdf.setTextColor(0,131,141);
  pdf.text("DROGA DO NORMY BMI", left + 3, y + 7);
  pdf.setFont('helvetica','normal');
  pdf.setFontSize(11);
  pdf.setTextColor(45,45,45);
  pdf.text(drogaLines, left + 4, y + 14);

  let journeyTableY = y + 14 + drogaLines.length * 6;
  if (journeyRows.length) {
    pdf.setFillColor(240,248,246);
    pdf.setDrawColor(200,225,225);
    pdf.roundedRect(left + 2, journeyTableY, 170, journeyTableHeight, 2, 2, 'F');
    pdf.setFont('helvetica','bold');
    pdf.setTextColor(0,131,141);
    pdf.setFontSize(11);
    pdf.text("Aktywność", left + 7, journeyTableY + 5.5);
    pdf.text("Dystans", left + 64, journeyTableY + 5.5);
    pdf.text("Czas", left + 112, journeyTableY + 5.5);
    pdf.setFont('helvetica','normal');
    pdf.setTextColor(25,35,37);
    journeyRows.forEach((row, idx) => {
      const lineY = journeyTableY + 12 + idx * 7;
      pdf.text(row[0], left + 7, lineY);
      pdf.text(row[1], left + 64, lineY);
      pdf.text(row[2], left + 112, lineY);
    });
  }
  y += journeyBoxHeight;

  // Ciekawostka dystansowa (rower 20 km/h)
  const bike20Row = activityGetRow(journeyModel, 'bike20');
  const kmRower20 = bike20Row && Number.isFinite(bike20Row.distanceKm) ? bike20Row.distanceKm : null;
  const przyklad = activityFindRouteExample(kmRower20);
  if(kmRower20 && przyklad){
    pdf.setFont('helvetica','bold');
    pdf.setFontSize(12);
    pdf.setTextColor(0,131,141);
    pdf.text("Przykład:", left+3, y+10);
    pdf.setFont('helvetica','normal');
    pdf.setFontSize(11);
    pdf.setTextColor(30,30,30);
    pdf.text(`Aby osiągnąć BMI w normie, musisz przejechać rowerem (20 km/h) ok. ${kmRower20.toFixed(0)} km –`, left+3, y+16);
    pdf.text(`to tyle, ile z ${przyklad.miasta}!`, left+3, y+22);
    y += 22;
  } else {
    y += 6;
  }

  // 7. Sekcja spalania kalorii – karta
  let kcal = 0;
  document.querySelectorAll('.food-row').forEach(r=>{
    const select = r.querySelector('select');
    const input = r.querySelector('input');
    const key = select ? select.value : '';
    const qty = input ? (parseFloat(input.value) || 0) : 0;
    if (foods[key] && qty > 0) {
      kcal += foods[key].kcal * qty;
    }
  });

  const foodBurnModel = activityBuildFoodBurnState({
    kcalTarget: kcal,
    weightKg: weight,
    ageYears: age
  });
  const foodRows = activityGetPdfRows(foodBurnModel);
  const foodTableHeight = foodRows.length ? (7 + foodRows.length * 7) : 0;
  const foodBoxHeight = Math.max(30, 18 + (foodRows.length ? foodTableHeight + 8 : 8));

  pdf.setFillColor(255,255,255);
  pdf.roundedRect(left, y, 174, foodBoxHeight, 4, 4, 'F');
  pdf.setFont('helvetica','bold');
  pdf.setFontSize(12);
  pdf.setTextColor(0,131,141);
  pdf.text("SPALANIE KALORII (WYBRANE PRZEKĄSKI / POSIŁKI)", left + 3, y + 7);
  pdf.setFont('helvetica','normal');
  pdf.setFontSize(11);
  pdf.setTextColor(35,35,35);
  pdf.text(`Całkowita ilość wybranych kalorii: ${Math.round(kcal)} kcal`, left + 4, y + 14);

  if (foodRows.length) {
    const foodTableY = y + 18;
    pdf.setFillColor(240,248,246);
    pdf.roundedRect(left+2, foodTableY, 170, foodTableHeight, 2,2,'F');
    pdf.setFont('helvetica','bold');
    pdf.setTextColor(0,131,141);
    pdf.setFontSize(11);
    pdf.text("Aktywność", left+7, foodTableY+5.5);
    pdf.text("Czas do spalenia", left+74, foodTableY+5.5);
    pdf.setFont('helvetica','normal');
    pdf.setTextColor(25,35,37);
    foodRows.forEach((row, idx) => {
      const lineY = foodTableY + 12 + idx * 7;
      pdf.text(row[0], left+7, lineY);
      pdf.text(row[1], left+74, lineY);
    });
  }
  y += foodBoxHeight;

  // 8. Data i stopka
  y = Math.max(y + 12, 270);
  pdf.setFontSize(10);
  pdf.setTextColor(140,160,165);
  pdf.text("Wygenerowano automatycznie przez kalkulator Vilda Clinic", left, y + 10);
  pdf.setFontSize(9);
  pdf.text("vildaclinic.pl", left + 142, y + 10);

  pdf.save("Raport_BMI_VildaClinic.pdf");
  } catch (error) {
    vildaLogAppError('main-bmi-metabolism-pdf', 'Błąd generowania raportu BMI/metabolizmu PDF', error);
    if (!(error && error.vildaDependencyError)) {
      vildaShowDependencyFallbackNotice(error && error.message ? error.message : 'Nie udało się wygenerować raportu BMI/metabolizmu PDF.', {
        moduleName: 'main-bmi-metabolism-pdf'
      });
    }
  }
  });
}

/* =====================================================================
 * Karty podsumowań/metabolic summary UI zostały wydzielone do vilda_summary_cards.js w kroku 8Q-4.
 * Mostek zachowuje dotychczasowe globalne aliasy i inicjalizację kontrolek.
 * ===================================================================== */
(function () {
  function initSummaryCardsBridge() {
    try {
      if (typeof window === 'undefined') return undefined;
      if (!window.VildaSummaryCards || typeof window.VildaSummaryCards.init !== 'function') {
        if (typeof vildaLogAppWarn === 'function') {
          vildaLogAppWarn('app:summary-cards', 'Brak VildaSummaryCards — karty podsumowań nie zostały zainicjalizowane.');
        }
        return undefined;
      }
      return window.VildaSummaryCards.init();
    } catch (error) {
      if (typeof vildaLogAppError === 'function') {
        vildaLogAppError('app:summary-cards', 'Nie udało się zainicjalizować VildaSummaryCards.', error);
      } else if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', error, { feature: 'summary-cards:init-bridge', step: '8Q-4' });
      }
      return undefined;
    }
  }

  if (typeof window !== 'undefined' && typeof window.vildaAppSafeInit === 'function') {
    window.vildaAppSafeInit('app:summary-cards', initSummaryCardsBridge, { once: true, phase: 'init' });
  } else {
    initSummaryCardsBridge();
  }
})();

/* =====================================================================
 * Zaawansowane obliczenia wzrostowe
 *
 * Ta sekcja implementuje logikę do obliczania potencjału wzrostowego
 * (tzw. target height), tempa wzrastania oraz przygotowuje dane
 * potrzebne do naniesienia dodatkowych elementów na siatki centylowe.
 * Skrypt dynamicznie dodaje kolejne wiersze pomiarów (wiek, wzrost,
 * waga) i na bieżąco aktualizuje wyniki po każdej zmianie pól.
 * Wyniki oraz dane pomocnicze są przechowywane w zmiennej
 * `window.advancedGrowthData`, dzięki czemu mogą zostać wykorzystane
 * również w funkcji generującej siatkę centylową PDF.
 */

// Globalny obiekt do przechowywania wyliczeń z sekcji zaawansowanej.
// Będzie uzupełniany w calculateGrowthAdvanced() i wykorzystywany
// przy generowaniu dodatkowych elementów na wykresie centylowym.
window.advancedGrowthData = null;

function updateAdvancedGrowthSexSpecificFields() {
  try {
    const sex = String(document.getElementById('sex')?.value || '').trim().toUpperCase();
    const hideForGirls = sex === 'F';
    ['advTesticularVolume', 'advFamilyDelayedPuberty', 'advGrowthExclusion'].forEach((id) => {
      const field = document.getElementById(id);
      if (!field) return;
      const wrapper = (typeof field.closest === 'function' && field.closest('label')) ? field.closest('label') : field;
      if (wrapper) {
        wrapper.hidden = hideForGirls;
        wrapper.style.display = hideForGirls ? 'none' : '';
        if (hideForGirls) wrapper.setAttribute('aria-hidden', 'true');
        else wrapper.removeAttribute('aria-hidden');
      }
      field.disabled = hideForGirls;
    });
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 25028 });
    }
  }
}

/**
 * Inicjalizuje obsługę sekcji zaawansowanych obliczeń wzrostowych.
 * Dodaje obsługę przycisku rozwijającego formularz, obsługę
 * przycisku dodającego kolejne pomiary oraz nasłuchuje zmian na
 * wszystkich polach, aby automatycznie przeliczać wyniki.
 */
function getVildaAdvancedGrowthAdapter() {
  return (typeof window !== 'undefined' && (window.VildaAdvancedGrowth || window.vildaAdvancedGrowth))
    ? (window.VildaAdvancedGrowth || window.vildaAdvancedGrowth)
    : null;
}

function setupAdvancedGrowth(options) {
  const adapter = getVildaAdvancedGrowthAdapter();
  if (adapter && typeof adapter.setupAdvancedGrowth === 'function') {
    return adapter.setupAdvancedGrowth(options);
  }
  if (typeof vildaLogAppWarn === 'function') {
    vildaLogAppWarn('app:advanced-growth:setup', 'Brak VildaAdvancedGrowth.setupAdvancedGrowth(); sekcja advanced growth nie została zainicjalizowana.');
  }
  return undefined;
}

/* =====================================================================
 * Analiza historycznych punktów pomiarowych (tryb PRO, strona główna)
 * ===================================================================== */

function isAdvancedGrowthMainPage() {
  const adapter = getVildaAdvancedGrowthAdapter();
  if (adapter && typeof adapter.isAdvancedGrowthMainPage === 'function') {
    return adapter.isAdvancedGrowthMainPage();
  }
  try {
    const path = String((window.location && window.location.pathname) || '').toLowerCase();
    const file = path.split('/').pop();
    if (!file || file === '' || file === 'index.html') return true;
    return file !== 'docpro.html';
  } catch (_) {
    return true;
  }
}

function isAdvancedGrowthProModeActive() {
  const adapter = getVildaAdvancedGrowthAdapter();
  if (adapter && typeof adapter.isAdvancedGrowthProModeActive === 'function') {
    return adapter.isAdvancedGrowthProModeActive();
  }
  try {
    const toggle = document.getElementById('resultsModeToggle');
    if (toggle) return !!toggle.checked;
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { module: 'advanced-growth:pro-mode-fallback' });
    }
  }
  try {
    if (typeof window !== 'undefined' && typeof window.professionalMode !== 'undefined') return !!window.professionalMode;
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { module: 'advanced-growth:pro-mode-global-fallback' });
    }
  }
  try { return readResultsModeStorage() === 'professional'; } catch (_) { return false; }
}

const ADV_HISTORY_ANALYZE_LABEL = 'Analiza punktu pomiarowego';
const ADV_HISTORY_ANALYZE_HIDE_LABEL = 'Ukryj analizę';

/* Neutralne helpery historii/formatowania advanced growth zostały wydzielone do vilda_advanced_growth.js w kroku 8O-1. */

function advHistoryInterpolateLmsDataSet(dataSet, ageMonths) {
  if (!dataSet) return null;
  const m = Math.round(ageMonths);
  const key = String(m);
  if (dataSet[key]) return dataSet[key];
  const keys = Object.keys(dataSet).map(Number).filter(k => !isNaN(k)).sort((a, b) => a - b);
  if (!keys.length) return null;
  let lo = keys[0];
  let hi = keys[keys.length - 1];
  for (const k of keys) {
    if (k <= m) lo = k;
    if (k >= m) {
      hi = k;
      break;
    }
  }
  if (!dataSet[String(lo)] || !dataSet[String(hi)]) return null;
  if (lo === hi) return dataSet[String(lo)];
  const [L1, M1, S1] = dataSet[String(lo)];
  const [L2, M2, S2] = dataSet[String(hi)];
  const t = (m - lo) / (hi - lo);
  return [L1 + t * (L2 - L1), M1 + t * (M2 - M1), S1 + t * (S2 - S1)];
}

function advHistoryGetChildLMSForSource(source, sex, ageYears, param) {
  const ageMonths = Math.round(ageYears * 12);
  if (!isFinite(ageMonths) || ageMonths < 0 || ageMonths > 216) return null;
  const src = String(source || '').toUpperCase();
  const metric = (param === 'WT') ? 'WT' : 'HT';
  const isBoy = (sex === 'M');

  if (src === 'PALCZEWSKA') return null;

  if (ageMonths < 36) {
    if (src !== 'WHO') return null;
    if (metric === 'WT') {
      const ds = isBoy ? LMS_INFANT_WEIGHT_BOYS : LMS_INFANT_WEIGHT_GIRLS;
      return ds[String(ageMonths)] || null;
    }
    const ds = isBoy ? LMS_INFANT_HEIGHT_BOYS : LMS_INFANT_HEIGHT_GIRLS;
    return ds[String(ageMonths)] || null;
  }

  if (src === 'OLAF') {
    const ds = (metric === 'WT')
      ? (isBoy ? LMS_WEIGHT_BOYS : LMS_WEIGHT_GIRLS)
      : (isBoy ? LMS_HEIGHT_BOYS : LMS_HEIGHT_GIRLS);
    return advHistoryInterpolateLmsDataSet(ds, ageMonths);
  }

  if (src === 'WHO') {
    if (metric === 'WT' && ageMonths > 120) return null;
    const ds = (metric === 'WT')
      ? (isBoy ? LMS_WEIGHT_WHO_BOYS : LMS_WEIGHT_WHO_GIRLS)
      : (isBoy ? LMS_HEIGHT_WHO_BOYS : LMS_HEIGHT_WHO_GIRLS);
    return advHistoryInterpolateLmsDataSet(ds, ageMonths);
  }

  return null;
}

function advHistoryGetBmiLMSForSource(source, sex, ageYears) {
  const months = Math.round(ageYears * 12);
  if (!isFinite(months) || months < 0 || months > 228) return null;
  const src = String(source || '').toUpperCase();
  if (src === 'PALCZEWSKA') return null;
  if (src === 'OLAF') {
    if (months < 36 || months > 216) return null;
    const ds = (sex === 'M') ? OLAF_LMS_BOYS : OLAF_LMS_GIRLS;
    return advHistoryInterpolateLmsDataSet(ds, months);
  }
  if (src === 'WHO') {
    const ds = (months <= 60)
      ? ((sex === 'M') ? LMS_INFANT_BOYS : LMS_INFANT_GIRLS)
      : ((sex === 'M') ? LMS_BOYS : LMS_GIRLS);
    return advHistoryInterpolateLmsDataSet(ds, months);
  }
  return null;
}

function advHistoryCalcLmsStats(value, lms) {
  if (!lms || typeof value !== 'number' || !isFinite(value)) return null;
  const [L, M, S] = lms;
  if (![L, M, S].every(v => typeof v === 'number' && isFinite(v)) || M <= 0 || S <= 0 || value <= 0) {
    return null;
  }
  let z;
  if (L !== 0) {
    z = (Math.pow(value / M, L) - 1) / (L * S);
  } else {
    z = Math.log(value / M) / S;
  }
  return {
    percentile: normalCDF(z) * 100,
    sd: z,
    median: M
  };
}

function advHistoryCalcAnthroStatsForSource(value, sex, ageYears, metric, source) {
  if (typeof value !== 'number' || !isFinite(value) || value <= 0) return null;
  const src = String(source || '').toUpperCase();
  const met = (metric === 'WT') ? 'WT' : 'HT';
  if (src === 'PALCZEWSKA') {
    return calcPercentileStatsPal(value, sex, ageYears, met === 'WT' ? 'WT' : 'HT');
  }
  const lms = advHistoryGetChildLMSForSource(src, sex, ageYears, met);
  return advHistoryCalcLmsStats(value, lms);
}

function advHistoryCalcBmiStatsForSource(bmiValue, sex, ageYears, source) {
  if (typeof bmiValue !== 'number' || !isFinite(bmiValue) || bmiValue <= 0) return null;
  const src = String(source || '').toUpperCase();
  if (src === 'PALCZEWSKA') {
    return calcPercentileStatsPal(bmiValue, sex, ageYears, 'BMI');
  }
  const lms = advHistoryGetBmiLMSForSource(src, sex, ageYears);
  return advHistoryCalcLmsStats(bmiValue, lms);
}

function advHistoryCalcColeForSource(bmiValue, sex, ageYears, source) {
  if (typeof bmiValue !== 'number' || !isFinite(bmiValue) || bmiValue <= 0) return null;
  const src = String(source || '').toUpperCase();
  let median = null;
  if (src === 'PALCZEWSKA') {
    median = getPalCentile(sex, Math.round(ageYears * 12), 50, 'BMI');
  } else {
    const lms = advHistoryGetBmiLMSForSource(src, sex, ageYears);
    if (lms && typeof lms[1] === 'number' && isFinite(lms[1]) && lms[1] > 0) {
      median = lms[1];
    }
  }
  if (typeof median !== 'number' || !isFinite(median) || median <= 0) return null;
  return (bmiValue / median) * 100;
}

function advHistoryMetricCandidates(preferredSource, metric, ageYears) {
  const pref = String(preferredSource || 'OLAF').toUpperCase();
  const ageM = Math.round((ageYears || 0) * 12);
  const list = [];
  const add = (src) => {
    const s = String(src || '').toUpperCase();
    if (s && !list.includes(s)) list.push(s);
  };

  if (pref === 'PALCZEWSKA') {
    add('PALCZEWSKA');
    if (metric === 'WT' && ageM > 120) add('OLAF');
    add('WHO');
    add('OLAF');
    return list;
  }

  if (pref === 'OLAF') {
    if (ageYears < OLAF_DATA_MIN_AGE) {
      add('PALCZEWSKA');
      add('WHO');
      add('OLAF');
    } else {
      add('OLAF');
      if (metric === 'WT') add('WHO');
      add('PALCZEWSKA');
      add('WHO');
    }
    return list;
  }

  add('WHO');
  if (metric === 'WT' && ageM > 120) add('OLAF');
  add('PALCZEWSKA');
  add('OLAF');
  return list;
}

function advHistoryMetricFallbackReason(preferredSource, usedSource, metric, ageYears) {
  const pref = String(preferredSource || '').toUpperCase();
  const used = String(usedSource || '').toUpperCase();
  if (!pref || !used || pref === used) return '';
  if (pref === 'OLAF' && ageYears < OLAF_DATA_MIN_AGE) {
    return 'brak danych OLAF dla wieku poniżej 3 lat';
  }
  if (pref === 'WHO' && metric === 'WT' && Math.round(ageYears * 12) > 120 && used === 'OLAF') {
    return 'brak siatek WHO dla masy ciała powyżej 10 lat';
  }
  return `brak danych ${advHistorySourceLabel(pref)} dla tego parametru / wieku`;
}

function advHistoryResolveMetric(metric, rawValue, sex, ageYears, preferredSource) {
  const candidates = advHistoryMetricCandidates(preferredSource, metric, ageYears);
  for (const src of candidates) {
    let result = null;
    if (metric === 'BMI') {
      result = advHistoryCalcBmiStatsForSource(rawValue, sex, ageYears, src);
      if (result && typeof result.percentile === 'number' && isFinite(result.percentile)) {
        return {
          result,
          source: src,
          reason: advHistoryMetricFallbackReason(preferredSource, src, metric, ageYears)
        };
      }
    } else if (metric === 'COLE') {
      result = advHistoryCalcColeForSource(rawValue, sex, ageYears, src);
      if (typeof result === 'number' && isFinite(result)) {
        return {
          result,
          source: src,
          reason: advHistoryMetricFallbackReason(preferredSource, src, metric, ageYears)
        };
      }
    } else {
      result = advHistoryCalcAnthroStatsForSource(rawValue, sex, ageYears, metric, src);
      if (result && typeof result.percentile === 'number' && isFinite(result.percentile)) {
        return {
          result,
          source: src,
          reason: advHistoryMetricFallbackReason(preferredSource, src, metric, ageYears)
        };
      }
    }
  }
  return { result: null, source: null, reason: '' };
}

function advHistoryBuildSourceSummary(preferredSource, metricMeta) {
  const pref = String(preferredSource || 'OLAF').toUpperCase();
  const prefLabel = advHistorySourceLabel(pref);
  const metricLabels = {
    WT: 'waga',
    HT: 'wzrost',
    BMI: 'BMI',
    COLE: 'wskaźnik Cole’a'
  };
  const fallbackItems = [];
  Object.keys(metricMeta || {}).forEach((key) => {
    const meta = metricMeta[key];
    if (!meta || !meta.source || String(meta.source).toUpperCase() === pref) return;
    fallbackItems.push({
      metric: metricLabels[key] || key,
      source: advHistorySourceLabel(meta.source),
      reason: meta.reason || `brak danych ${prefLabel}`
    });
  });

  if (!fallbackItems.length) {
    return `Źródło danych: ${prefLabel}.`;
  }

  const uniqueSources = [...new Set(fallbackItems.map(item => item.source))];
  const uniqueReasons = [...new Set(fallbackItems.map(item => item.reason))];
  if (fallbackItems.length >= 3 && uniqueSources.length === 1 && uniqueReasons.length === 1) {
    return `Źródło danych: ${uniqueSources[0]} (wybrano ${prefLabel}; ${uniqueReasons[0]}).`;
  }

  const grouped = new Map();
  fallbackItems.forEach((item) => {
    const key = `${item.source}||${item.reason}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item.metric);
  });
  const parts = [];
  grouped.forEach((metrics, key) => {
    const [src, reason] = key.split('||');
    parts.push(`${metrics.join(', ')} ➔ ${src} (${reason})`);
  });
  return `Źródło danych: preferowane ${prefLabel}. Fallbacki: ${parts.join('; ')}.`;
}

function collectAdvancedMeasurements(includeDomRefs) {
  const rows = document.querySelectorAll('#advMeasurements .measure-row');
  const measurements = [];
  rows.forEach((row, domIndex) => {
    const yInput = row.querySelector('.adv-age-years');
    const mInput = row.querySelector('.adv-age-months');
    const heightInput = row.querySelector('.adv-height');
    const weightInput = row.querySelector('.adv-weight');
    const boneInput = row.querySelector('.adv-bone-age');
    const yVal = parseFloat(yInput?.value);
    const mVal = parseFloat(mInput?.value);
    if (isNaN(yVal) && isNaN(mVal)) return;
    const ageYearsRow = (isNaN(yVal) ? 0 : yVal) + (isNaN(mVal) ? 0 : mVal / 12);
    const ageMonthsRow = Math.round(ageYearsRow * 12);
    const hVal = parseFloat(heightInput?.value);
    const wVal = parseFloat(weightInput?.value);
    const bVal = parseFloat(boneInput?.value);
    const arrowEnableEl = row.querySelector('.adv-arrow-enable');
    const arrowCommentEl = row.querySelector('.adv-arrow-comment');
    const arrowEnabled = !!(arrowEnableEl && arrowEnableEl.checked);
    const arrowComment = arrowEnabled && arrowCommentEl && typeof arrowCommentEl.value === 'string'
      ? arrowCommentEl.value.trim()
      : '';
    const ghSync = row.getAttribute('data-gh-sync') === 'true';
    const ghId = row.getAttribute('data-gh-id');
    const entry = {
      ageYears: ageYearsRow,
      ageMonths: ageMonthsRow,
      height: (!isNaN(hVal) ? hVal : null),
      weight: (!isNaN(wVal) ? wVal : null),
      boneAgeYears: (!isNaN(bVal) ? bVal : null),
      arrowEnabled,
      arrowComment,
      ghSync,
      ghId: (ghId ? String(ghId) : null),
      domIndex
    };
    if (includeDomRefs) entry.rowEl = row;
    measurements.push(entry);
  });
  return measurements;
}

function advHistoryGetPreferredSource() {
  try {
    const selected = document.querySelector('input[name="dataSource"]:checked');
    if (selected && selected.value) return String(selected.value).toUpperCase();
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 25512 });
    }
  }
  try {
    if (typeof bmiSource !== 'undefined' && bmiSource) return String(bmiSource).toUpperCase();
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 25515 });
    }
  }
  return 'OLAF';
}

function advHistoryMetricUsesTwoLineZScore(label) {
  const normalized = String(label || '').trim().toLowerCase();
  return normalized === 'waga' || normalized === 'wzrost' || normalized === 'bmi';
}

function advHistoryCreateMetricLine(label, valueText, stats) {
  const safeLabel = advHistoryEscapeHtml(label);
  if (!valueText) return `<p class="adv-history-analysis-line"><strong>${safeLabel}:</strong> brak danych</p>`;
  if (!stats || !stats.result) {
    return `<p class="adv-history-analysis-line"><strong>${safeLabel}:</strong> ${advHistoryEscapeHtml(valueText)} — brak możliwości obliczenia centyla / Z-score</p>`;
  }
  const percText = advHistoryPercentileText(stats.result.percentile);
  const zText = (typeof stats.result.sd === 'number' && isFinite(stats.result.sd))
    ? advHistoryFormatNumber(stats.result.sd, 2)
    : null;
  const splitZ = advHistoryMetricUsesTwoLineZScore(label) && zText != null;

  let firstLine = `<strong>${safeLabel}:</strong> ${advHistoryEscapeHtml(valueText)}`;
  if (percText) {
    firstLine += ` — ${advHistoryEscapeHtml(percText)}`;
  }
  if (splitZ) {
    firstLine += ',';
    return `<p class="adv-history-analysis-line adv-history-analysis-line--split"><span class="adv-history-analysis-line-primary">${firstLine}</span><span class="adv-history-analysis-line-secondary">Z-score: ${advHistoryEscapeHtml(zText)}</span></p>`;
  }
  if (zText != null) {
    firstLine += `, Z-score: ${advHistoryEscapeHtml(zText)}`;
  }
  return `<p class="adv-history-analysis-line"><span class="adv-history-analysis-line-primary">${firstLine}</span></p>`;
}

function advHistoryBuildTextMetricLine(label, valueText, stats) {
  if (!valueText) return `${label}: brak danych`;
  if (!stats || !stats.result) return `${label}: ${valueText} — brak możliwości obliczenia centyla / Z-score`;

  const percText = advHistoryPercentileText(stats.result.percentile);
  const zText = (typeof stats.result.sd === 'number' && isFinite(stats.result.sd))
    ? advHistoryFormatNumber(stats.result.sd, 2)
    : null;

  let line = `${label}: ${valueText}`;
  if (percText) {
    line += ` — ${percText}`;
  }
  if (zText != null) {
    if (advHistoryMetricUsesTwoLineZScore(label)) {
      return `${line},
Z-score: ${zText}`;
    }
    line += `, Z-score: ${zText}`;
  }
  return line;
}

function showAdvancedGrowthHistoryToast(message) {
  try {
    const existing = document.getElementById('advancedGrowthHistoryCopyToast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'advancedGrowthHistoryCopyToast';
    toast.textContent = message || 'Dane zostały skopiowane do schowka.';
    toast.style.position = 'fixed';
    toast.style.bottom = '1rem';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.background = '#00838d';
    toast.style.color = 'white';
    toast.style.padding = '0.6rem 1.2rem';
    toast.style.borderRadius = '4px';
    toast.style.fontSize = '1rem';
    toast.style.zIndex = '9999';
    document.body.appendChild(toast);
    setTimeout(() => {
      try { toast.remove(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 25592 });
    }
  }
    }, 2500);
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 25594 });
    }
  }
}

function copyAdvancedGrowthHistoryText(text) {
  return new Promise((resolve, reject) => {
    const fallbackCopy = () => {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);
        const ok = document.execCommand('copy');
        textarea.remove();
        if (ok) resolve();
        else reject(new Error('Copy command failed'));
      } catch (err) {
        reject(err);
      }
    };

    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(text).then(resolve).catch(() => {
        fallbackCopy();
      });
      return;
    }
    fallbackCopy();
  });
}


// Advanced growth report HTML/PDF helpers moved to vilda_advanced_growth.js in step 8O-3.
function advGrowthBuildTargetHeightForReport(sex) {
  const adapter = getVildaAdvancedGrowthAdapter();
  return adapter && typeof adapter.advGrowthBuildTargetHeightForReport === 'function'
    ? adapter.advGrowthBuildTargetHeightForReport(sex)
    : null;
}

function advGrowthGetTargetStatsForReport(targetHeight, sex, source, cache) {
  const adapter = getVildaAdvancedGrowthAdapter();
  return adapter && typeof adapter.advGrowthGetTargetStatsForReport === 'function'
    ? adapter.advGrowthGetTargetStatsForReport(targetHeight, sex, source, cache)
    : null;
}

function advGrowthCollectHistoricalPointsForReport() {
  const adapter = getVildaAdvancedGrowthAdapter();
  return adapter && typeof adapter.advGrowthCollectHistoricalPointsForReport === 'function'
    ? adapter.advGrowthCollectHistoricalPointsForReport()
    : [];
}

function advGrowthCollectAllPointsForReport() {
  const adapter = getVildaAdvancedGrowthAdapter();
  return adapter && typeof adapter.advGrowthCollectAllPointsForReport === 'function'
    ? adapter.advGrowthCollectAllPointsForReport()
    : [];
}

function advGrowthBuildReportRows() {
  const adapter = getVildaAdvancedGrowthAdapter();
  return adapter && typeof adapter.advGrowthBuildReportRows === 'function'
    ? adapter.advGrowthBuildReportRows()
    : null;
}

function advGrowthDrawPdfCell(pdf, x, y, width, height, text, options) {
  const adapter = getVildaAdvancedGrowthAdapter();
  return adapter && typeof adapter.advGrowthDrawPdfCell === 'function'
    ? adapter.advGrowthDrawPdfCell(pdf, x, y, width, height, text, options)
    : undefined;
}

function advGrowthLoadScriptOnce(src, testFn) {
  const adapter = getVildaAdvancedGrowthAdapter();
  return adapter && typeof adapter.advGrowthLoadScriptOnce === 'function'
    ? adapter.advGrowthLoadScriptOnce(src, testFn)
    : Promise.resolve(false);
}

async function advGrowthEnsurePdfMake() {
  const adapter = getVildaAdvancedGrowthAdapter();
  return adapter && typeof adapter.advGrowthEnsurePdfMake === 'function'
    ? adapter.advGrowthEnsurePdfMake()
    : false;
}

function advGrowthCreatePdfMakeCell(text, options) {
  const adapter = getVildaAdvancedGrowthAdapter();
  return adapter && typeof adapter.advGrowthCreatePdfMakeCell === 'function'
    ? adapter.advGrowthCreatePdfMakeCell(text, options)
    : { text: String(text == null ? '' : text) };
}

function advGrowthBuildPdfMakeDefinition(report) {
  const adapter = getVildaAdvancedGrowthAdapter();
  return adapter && typeof adapter.advGrowthBuildPdfMakeDefinition === 'function'
    ? adapter.advGrowthBuildPdfMakeDefinition(report)
    : null;
}

function advGrowthDecodeCentileEntities(value) {
  const adapter = getVildaAdvancedGrowthAdapter();
  return adapter && typeof adapter.advGrowthDecodeCentileEntities === 'function'
    ? adapter.advGrowthDecodeCentileEntities(value)
    : String(value || '');
}

function advGrowthFormatAdultHeightValue(value) {
  const adapter = getVildaAdvancedGrowthAdapter();
  return adapter && typeof adapter.advGrowthFormatAdultHeightValue === 'function'
    ? adapter.advGrowthFormatAdultHeightValue(value)
    : '—';
}

function advGrowthBuildParentHeightSummaryText(label, heightValue, sex, preferredSource) {
  const adapter = getVildaAdvancedGrowthAdapter();
  return adapter && typeof adapter.advGrowthBuildParentHeightSummaryText === 'function'
    ? adapter.advGrowthBuildParentHeightSummaryText(label, heightValue, sex, preferredSource)
    : '';
}

function advGrowthBuildMphSummaryText(targetHeight, sex, preferredSource) {
  const adapter = getVildaAdvancedGrowthAdapter();
  return adapter && typeof adapter.advGrowthBuildMphSummaryText === 'function'
    ? adapter.advGrowthBuildMphSummaryText(targetHeight, sex, preferredSource)
    : '';
}

function advGrowthBuildReportPresentationModel(report) {
  const adapter = getVildaAdvancedGrowthAdapter();
  return adapter && typeof adapter.advGrowthBuildReportPresentationModel === 'function'
    ? adapter.advGrowthBuildReportPresentationModel(report)
    : null;
}

function advGrowthBuildHtmlReportMarkup(report) {
  const adapter = getVildaAdvancedGrowthAdapter();
  return adapter && typeof adapter.advGrowthBuildHtmlReportMarkup === 'function'
    ? adapter.advGrowthBuildHtmlReportMarkup(report)
    : '';
}

async function advGrowthGeneratePdfViaCanvas(report, filename) {
  const adapter = getVildaAdvancedGrowthAdapter();
  if (adapter && typeof adapter.advGrowthGeneratePdfViaCanvas === 'function') {
    return adapter.advGrowthGeneratePdfViaCanvas(report, filename);
  }
  return undefined;
}

async function generateAdvancedGrowthPdfReport() {
  const adapter = getVildaAdvancedGrowthAdapter();
  if (adapter && typeof adapter.generateAdvancedGrowthPdfReport === 'function') {
    return adapter.generateAdvancedGrowthPdfReport();
  }
  if (typeof vildaLogAppWarn === 'function') {
    vildaLogAppWarn('advanced-growth-report', 'Brak VildaAdvancedGrowth.generateAdvancedGrowthPdfReport().');
  }
  return undefined;
}

function ensureAdvancedGrowthReportControls() {
  const adapter = getVildaAdvancedGrowthAdapter();
  return adapter && typeof adapter.ensureAdvancedGrowthReportControls === 'function'
    ? adapter.ensureAdvancedGrowthReportControls()
    : undefined;
}

function removeAdvancedGrowthClearButton() {
  const adapter = getVildaAdvancedGrowthAdapter();
  return adapter && typeof adapter.removeAdvancedGrowthClearButton === 'function'
    ? adapter.removeAdvancedGrowthClearButton()
    : undefined;
}

function updateAdvancedGrowthReportButtonVisibility(forceHide) {
  const adapter = getVildaAdvancedGrowthAdapter();
  return adapter && typeof adapter.updateAdvancedGrowthReportButtonVisibility === 'function'
    ? adapter.updateAdvancedGrowthReportButtonVisibility(forceHide)
    : undefined;
}


function buildHistoricalPointAnalysis(rowEl) {
  if (!rowEl || !isAdvancedGrowthMainPage()) return null;
  const measurements = collectAdvancedMeasurements(true);
  const point = measurements.find(m => m.rowEl === rowEl);
  if (!point || typeof point.ageMonths !== 'number' || !isFinite(point.ageMonths)) return null;
  const preferredSource = advHistoryGetPreferredSource();
  const sex = document.getElementById('sex')?.value || 'M';
  const ageYears = point.ageMonths / 12;
  const ageLabel = advHistoryFormatAgeMonths(point.ageMonths);
  const metricMeta = {};

  const weightText = (typeof point.weight === 'number' && isFinite(point.weight))
    ? `${advHistoryFormatNumber(point.weight, 1)} kg`
    : '';
  const heightText = (typeof point.height === 'number' && isFinite(point.height))
    ? `${advHistoryFormatNumber(point.height, 1)} cm`
    : '';

  const weightStats = (point.weight != null)
    ? advHistoryResolveMetric('WT', point.weight, sex, ageYears, preferredSource)
    : { result: null, source: null, reason: '' };
  const heightStats = (point.height != null)
    ? advHistoryResolveMetric('HT', point.height, sex, ageYears, preferredSource)
    : { result: null, source: null, reason: '' };
  metricMeta.WT = weightStats;
  metricMeta.HT = heightStats;

  const bmiValue = (point.weight != null && point.height != null && typeof BMI === 'function')
    ? BMI(point.weight, point.height)
    : null;
  const bmiText = (typeof bmiValue === 'number' && isFinite(bmiValue))
    ? `${advHistoryFormatNumber(bmiValue, 1)} kg/m²`
    : '';
  const bmiStats = (bmiValue != null)
    ? advHistoryResolveMetric('BMI', bmiValue, sex, ageYears, preferredSource)
    : { result: null, source: null, reason: '' };
  metricMeta.BMI = bmiStats;

  const coleStats = (bmiValue != null)
    ? advHistoryResolveMetric('COLE', bmiValue, sex, ageYears, preferredSource)
    : { result: null, source: null, reason: '' };
  metricMeta.COLE = coleStats;

  let targetHeight = null;
  const motherH = parseFloat(document.getElementById('advMotherHeight')?.value);
  const fatherH = parseFloat(document.getElementById('advFatherHeight')?.value);
  if (!isNaN(motherH) && !isNaN(fatherH)) {
    targetHeight = (sex === 'F')
      ? (((fatherH - 13) + motherH) / 2)
      : (((motherH + 13) + fatherH) / 2);
  }

  let targetStats = null;
  const targetSource = (heightStats && heightStats.source) ? heightStats.source : preferredSource;
  if (typeof targetHeight === 'number' && isFinite(targetHeight)) {
    if (String(targetSource).toUpperCase() === 'PALCZEWSKA') {
      targetStats = calcPercentileStatsPal(targetHeight, sex, 18, 'HT');
    } else {
      targetStats = advHistoryCalcAnthroStatsForSource(targetHeight, sex, 18, 'HT', targetSource);
    }
  }

  let hsdsMpSdsText = 'brak danych';
  if (targetHeight == null) {
    hsdsMpSdsText = 'brak danych o wzroście rodziców';
  } else if (!heightText) {
    hsdsMpSdsText = 'brak wzrostu w tym punkcie pomiarowym';
  } else if (heightStats && heightStats.result && typeof heightStats.result.sd === 'number' && targetStats && typeof targetStats.sd === 'number') {
    hsdsMpSdsText = advHistoryFormatNumber(heightStats.result.sd - targetStats.sd, 2);
  } else {
    hsdsMpSdsText = 'brak możliwości obliczenia';
  }

  const sorted = measurements
    .slice()
    .sort((a, b) => (a.ageMonths - b.ageMonths) || ((a.domIndex || 0) - (b.domIndex || 0)));
  const pointIdx = sorted.findIndex(item => item.rowEl === rowEl);
  const prevPoint = pointIdx > 0 ? sorted[pointIdx - 1] : null;
  let velocityHtml = '<p class="adv-history-analysis-line"><strong>Tempo wzrastania:</strong> brak wcześniejszego pomiaru</p>';
  let velocityText = 'Tempo wzrastania: brak wcześniejszego pomiaru';
  if (point.height == null) {
    velocityHtml = '<p class="adv-history-analysis-line"><strong>Tempo wzrastania:</strong> brak wzrostu w analizowanym punkcie</p>';
    velocityText = 'Tempo wzrastania: brak wzrostu w analizowanym punkcie';
  } else if (prevPoint) {
    const gapM = point.ageMonths - prevPoint.ageMonths;
    if (prevPoint.height == null) {
      velocityHtml = '<p class="adv-history-analysis-line"><strong>Tempo wzrastania:</strong> brak wzrostu w poprzednim pomiarze</p>';
      velocityText = 'Tempo wzrastania: brak wzrostu w poprzednim pomiarze';
    } else if (gapM < 6) {
      velocityHtml = `<p class="adv-history-analysis-line"><strong>Tempo wzrastania:</strong> nie obliczono — odstęp od poprzedniego pomiaru wynosi ${advHistoryEscapeHtml(String(gapM))} mies.</p>`;
      velocityText = `Tempo wzrastania: nie obliczono — odstęp od poprzedniego pomiaru wynosi ${gapM} mies.`;
    } else {
      const vel = (typeof velocityCmPerYear === 'function')
        ? velocityCmPerYear(prevPoint.height, prevPoint.ageMonths, point.height, point.ageMonths)
        : null;
      if (typeof vel === 'number' && isFinite(vel)) {
        velocityHtml = `<p class="adv-history-analysis-line"><strong>Tempo wzrastania od poprzedniego pomiaru (${advHistoryEscapeHtml(String(gapM))} mies.):</strong> ${advHistoryEscapeHtml(advHistoryFormatNumber(vel, 1))} cm/rok</p>`;
        velocityText = `Tempo wzrastania od poprzedniego pomiaru (${gapM} mies.): ${advHistoryFormatNumber(vel, 1)} cm/rok`;
      } else {
        velocityHtml = '<p class="adv-history-analysis-line"><strong>Tempo wzrastania:</strong> brak możliwości obliczenia</p>';
        velocityText = 'Tempo wzrastania: brak możliwości obliczenia';
      }
    }
  }

  let boneAgeHtml = '';
  let boneAgeText = '';
  if (typeof point.boneAgeYears === 'number' && isFinite(point.boneAgeYears)) {
    const diffM = Math.round((point.boneAgeYears - ageYears) * 12);
    let diffTxt = 'zgodny z wiekiem metrykalnym';
    if (diffM > 0) diffTxt = `+${diffM} mies. względem wieku metrykalnego`;
    if (diffM < 0) diffTxt = `${diffM} mies. względem wieku metrykalnego`;
    boneAgeHtml = `<p class="adv-history-analysis-line"><strong>Wiek kostny:</strong> ${advHistoryEscapeHtml(advHistoryFormatNumber(point.boneAgeYears, 1))} lat (${advHistoryEscapeHtml(diffTxt)})</p>`;
    boneAgeText = `Wiek kostny: ${advHistoryFormatNumber(point.boneAgeYears, 1)} lat (${diffTxt})`;
  }

  const sourceSummary = advHistoryBuildSourceSummary(preferredSource, metricMeta);

  const mphHtml = (typeof targetHeight === 'number' && isFinite(targetHeight))
    ? (() => {
        let html = `<p class="adv-history-analysis-line"><strong>MPH (mid-parental height):</strong> ${advHistoryEscapeHtml(advHistoryFormatNumber(targetHeight, 1))} cm`;
        if (targetStats && typeof targetStats.percentile === 'number' && isFinite(targetStats.percentile)) {
          html += ` — ${advHistoryEscapeHtml(advHistoryPercentileText(targetStats.percentile) || '')}`;
          if (typeof targetStats.sd === 'number' && isFinite(targetStats.sd)) {
            html += `, Z-score: ${advHistoryEscapeHtml(advHistoryFormatNumber(targetStats.sd, 2))}`;
          }
        }
        html += '</p>';
        return html;
      })()
    : '<p class="adv-history-analysis-line"><strong>MPH (mid-parental height):</strong> brak danych o wzroście rodziców</p>';

  const mphText = (typeof targetHeight === 'number' && isFinite(targetHeight))
    ? (() => {
        let line = `MPH (mid-parental height): ${advHistoryFormatNumber(targetHeight, 1)} cm`;
        if (targetStats && typeof targetStats.percentile === 'number' && isFinite(targetStats.percentile)) {
          line += ` — ${advHistoryPercentileText(targetStats.percentile) || ''}`;
          if (typeof targetStats.sd === 'number' && isFinite(targetStats.sd)) {
            line += `, Z-score: ${advHistoryFormatNumber(targetStats.sd, 2)}`;
          }
        }
        return line;
      })()
    : 'MPH (mid-parental height): brak danych o wzroście rodziców';

  const coleHtml = (typeof coleStats.result === 'number' && isFinite(coleStats.result))
    ? `<p class="adv-history-analysis-line"><strong>Wskaźnik Cole’a:</strong> ${advHistoryEscapeHtml(advHistoryFormatNumber(coleStats.result, 1))}%</p>`
    : '<p class="adv-history-analysis-line"><strong>Wskaźnik Cole’a:</strong> brak możliwości obliczenia</p>';
  const coleText = (typeof coleStats.result === 'number' && isFinite(coleStats.result))
    ? `Wskaźnik Cole’a: ${advHistoryFormatNumber(coleStats.result, 1)}%`
    : 'Wskaźnik Cole’a: brak możliwości obliczenia';

  const html = `
    <div class="adv-history-analysis-card result-box">
      <h3>Analiza punktu pomiarowego</h3>
      <p class="adv-history-analysis-source">${advHistoryEscapeHtml(sourceSummary)}</p>
      <div class="adv-history-analysis-meta">
        <span><strong>Wiek:</strong> ${advHistoryEscapeHtml(ageLabel)}</span>
      </div>
      <div class="adv-history-analysis-lines">
        ${advHistoryCreateMetricLine('Waga', weightText, weightStats)}
        ${advHistoryCreateMetricLine('Wzrost', heightText, heightStats)}
        ${advHistoryCreateMetricLine('BMI', bmiText, bmiStats)}
        ${coleHtml}
        ${mphHtml}
        <p class="adv-history-analysis-line"><strong>hSDS - mpSDS:</strong> ${advHistoryEscapeHtml(hsdsMpSdsText)}</p>
        ${velocityHtml}
        ${boneAgeHtml}
      </div>
      <div class="adv-history-analysis-actions-bottom">
        <button type="button" class="adv-copy-analysis-btn">Kopiuj dane</button>
      </div>
    </div>
  `;

  const textLines = [
    'Analiza punktu pomiarowego',
    sourceSummary,
    `Wiek: ${ageLabel}`
  ];
  textLines.push(advHistoryBuildTextMetricLine('Waga', weightText, weightStats));
  textLines.push(advHistoryBuildTextMetricLine('Wzrost', heightText, heightStats));
  textLines.push(advHistoryBuildTextMetricLine('BMI', bmiText, bmiStats));
  textLines.push(coleText);
  textLines.push(mphText);
  textLines.push(`hSDS - mpSDS: ${hsdsMpSdsText}`);
  textLines.push(velocityText);
  if (boneAgeText) textLines.push(boneAgeText);

  return {
    html,
    text: textLines.join('\n')
      .replace(/ /g, ' ')
      .replace(/([0-9])\.([0-9])/g, '$1,$2')
  };
}

function renderAdvancedMeasurementAnalysisRow(rowEl) {
  if (!rowEl) return;
  const actionsWrap = rowEl.querySelector('.adv-history-analysis-actions');
  const panel = rowEl.querySelector('.adv-history-analysis-panel');
  const toggleBtn = rowEl.querySelector('.adv-analyze-btn');
  if (!actionsWrap || !panel || !toggleBtn) return;

  const open = rowEl.dataset.analysisOpen === 'true';
  if (!open) {
    panel.style.display = 'none';
    vildaAppClearHtml(panel);
    toggleBtn.textContent = ADV_HISTORY_ANALYZE_LABEL;
    updateAdvancedMeasurementActionDivider();
    return;
  }

  const model = buildHistoricalPointAnalysis(rowEl);
  if (!model) {
    rowEl.dataset.analysisOpen = 'false';
    panel.style.display = 'none';
    vildaAppClearHtml(panel);
    toggleBtn.textContent = ADV_HISTORY_ANALYZE_LABEL;
    updateAdvancedMeasurementActionDivider();
    return;
  }

  vildaAppSetTrustedHtml(panel, model.html, 'app:panel');
  panel.style.display = 'block';
  toggleBtn.textContent = ADV_HISTORY_ANALYZE_HIDE_LABEL;

  const copyBtn = panel.querySelector('.adv-copy-analysis-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', function(event) {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      copyAdvancedGrowthHistoryText(model.text)
        .then(() => {
          showAdvancedGrowthHistoryToast('Dane zostały skopiowane do schowka.');
        })
        .catch(() => {
          showAdvancedGrowthHistoryToast('Nie udało się skopiować danych.');
        });
    });
  }

  updateAdvancedMeasurementActionDivider();
}

function updateAdvancedMeasurementActionDivider() {
  const form = document.getElementById('advancedGrowthForm');
  if (!form) return;

  let showDivider = false;
  try {
    const rows = Array.from(document.querySelectorAll('#advMeasurements .measure-row'));
    const lastRow = rows.length ? rows[rows.length - 1] : null;
    if (lastRow) {
      const actionsWrap = lastRow.querySelector('.adv-history-analysis-actions');
      const panel = lastRow.querySelector('.adv-history-analysis-panel');
      const actionsVisible = !!(actionsWrap && actionsWrap.style.display !== 'none');
      const panelVisible = !!(panel && panel.style.display !== 'none' && vildaAppHasHtmlContent(panel));
      showDivider = actionsVisible && !panelVisible;
    }
  } catch (_) {
    showDivider = false;
  }

  form.classList.toggle('adv-show-add-divider', showDivider);
}

function updateAdvancedMeasurementAnalysisControls(forceHide) {
  const adapter = getVildaAdvancedGrowthAdapter();
  if (adapter && typeof adapter.updateAdvancedMeasurementAnalysisControls === 'function') {
    return adapter.updateAdvancedMeasurementAnalysisControls(forceHide);
  }
  return undefined;
}

/**
 * Dodaje jeden wiersz pomiarowy do kontenera #advMeasurements.
 * Wiersz zawiera pola: wiek (lata), wzrost (cm) i waga (kg) oraz
 * przycisk usuwający dany wiersz. Po dodaniu wiersza wszystkie
 * pola otrzymują nasłuchy, które powodują ponowne przeliczenie
 * wyników.
 */
function addAdvMeasurementRow(options) {
  const adapter = getVildaAdvancedGrowthAdapter();
  if (adapter && typeof adapter.addAdvMeasurementRow === 'function') {
    return adapter.addAdvMeasurementRow(options);
  }
  if (typeof vildaLogAppWarn === 'function') {
    vildaLogAppWarn('app:advanced-growth:add-row', 'Brak VildaAdvancedGrowth.addAdvMeasurementRow(); nie dodano wiersza pomiarowego.');
  }
  return undefined;
}

/**
 * Ukrywa przycisk usuwania wiersza pomiarowego, gdy jest tylko jeden wiersz,
 * i pokazuje go, gdy istnieje więcej niż jeden wiersz. Dzięki temu użytkownik
 * nie może usunąć ostatniego pomiaru, ale może dodawać i usuwać kolejne.
 */
function updateRemoveButtons() {
  const rows = Array.from(document.querySelectorAll('#advMeasurements .measure-row'));
  rows.forEach((row, idx) => {
    const btn = row.querySelector('.remove-measure');
    if (!btn) return;
    const onlyStarterRow = rows.length === 1 && idx === 0 && !_advRowHasAnyData(row)
      && row.getAttribute('data-gh-sync') !== 'true'
      && !String(row.getAttribute('data-gh-id') || '').trim();
    btn.style.display = onlyStarterRow ? 'none' : 'inline-block';
  });
}

/**
 * Aktualizuje atrybut `max` dla pól wieku w sekcji pomiarowej,
 * aby wiek wprowadzany w pomiarach nie przekraczał wieku dziecka
 * podanego w sekcji „Dane użytkownika”.
 */
function updateAdvAgeMax() {
  const adapter = getVildaAdvancedGrowthAdapter();
  if (adapter && typeof adapter.updateAdvAgeMax === 'function') {
    return adapter.updateAdvAgeMax();
  }
  try {
    const ageYears = getAgeDecimal();
    const inputsY = document.querySelectorAll('#advMeasurements .adv-age-years');
    inputsY.forEach(inp => {
      if (!isNaN(ageYears)) inp.max = Math.floor(ageYears);
    });
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { module: 'advanced-growth:update-age-max-fallback' });
    }
  }
}

/**
 * Mostek importu punktów terapii GH/IGF‑1 do historii advanced growth
 * został wydzielony do vilda_advanced_growth.js w kroku 8O-5.
 *
 * Poniższe wrappery utrzymują dotychczasowe globalne API app.js i przekazują
 * modułowi zależności lokalne: IndexedDB/localStorage GH_THERAPY_POINTS,
 * dodawanie wierszy, aktualizację przycisków, calculateGrowthAdvanced()
 * oraz odczyt bieżących danych użytkownika.
 */
function getVildaAdvancedGrowthGhImportOptions(options = {}) {
  return Object.assign({
    isGhAdvancedImportSuppressed: (typeof isGhAdvancedImportSuppressed === 'function') ? isGhAdvancedImportSuppressed : null,
    getTherapyPointsFromDB: (typeof getTherapyPointsFromDB === 'function') ? getTherapyPointsFromDB : null,
    readGhTherapyPointsFromModuleStorage: (typeof readGhTherapyPointsFromModuleStorage === 'function') ? readGhTherapyPointsFromModuleStorage : null,
    writeGhTherapyPointsToModuleStorage: (typeof writeGhTherapyPointsToModuleStorage === 'function') ? writeGhTherapyPointsToModuleStorage : null,
    addAdvMeasurementRow: (typeof addAdvMeasurementRow === 'function') ? addAdvMeasurementRow : null,
    updateRemoveButtons: (typeof updateRemoveButtons === 'function') ? updateRemoveButtons : null,
    calculateGrowthAdvanced: (typeof calculateGrowthAdvanced === 'function') ? calculateGrowthAdvanced : null,
    getUserBasics: (typeof _getUserBasics === 'function') ? _getUserBasics : null
  }, options || {});
}

function getGhAdvancedCurrentBasics(options){
  const adapter = getVildaAdvancedGrowthAdapter();
  if (adapter && typeof adapter.getGhAdvancedCurrentBasics === 'function') {
    return adapter.getGhAdvancedCurrentBasics(getVildaAdvancedGrowthGhImportOptions(options || {}));
  }
  try {
    if (typeof _getUserBasics === 'function') {
      return _getUserBasics();
    }
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { module: 'advanced-growth:gh-current-basics-fallback' });
    }
  }
  const ageYearsRaw = parseFloat(document.getElementById('age')?.value);
  const ageMonthsRaw = parseFloat(document.getElementById('ageMonths')?.value);
  const heightRaw = parseFloat(document.getElementById('height')?.value);
  const weightRaw = parseFloat(document.getElementById('weight')?.value);
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
  const adapter = getVildaAdvancedGrowthAdapter();
  if (adapter && typeof adapter.ghAdvancedApproxEq === 'function') {
    return adapter.ghAdvancedApproxEq(a, b, tol);
  }
  if (typeof a !== 'number' || !isFinite(a) || typeof b !== 'number' || !isFinite(b)) return false;
  return Math.abs(a - b) <= tol;
}

function ghTherapyPointMatchesCurrentBasics(pt, basics, options) {
  const adapter = getVildaAdvancedGrowthAdapter();
  if (adapter && typeof adapter.ghTherapyPointMatchesCurrentBasics === 'function') {
    return adapter.ghTherapyPointMatchesCurrentBasics(pt, basics, getVildaAdvancedGrowthGhImportOptions(options || {}));
  }
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
  const adapter = getVildaAdvancedGrowthAdapter();
  if (adapter && typeof adapter.ghAdvancedRowMatchesCurrentBasics === 'function') {
    return adapter.ghAdvancedRowMatchesCurrentBasics(row, basics, getVildaAdvancedGrowthGhImportOptions(options || {}));
  }
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

async function importTherapyPointsToAdvancedGrowth(options) {
  const adapter = getVildaAdvancedGrowthAdapter();
  if (adapter && typeof adapter.importTherapyPointsToAdvancedGrowth === 'function') {
    return adapter.importTherapyPointsToAdvancedGrowth(getVildaAdvancedGrowthGhImportOptions(options || {}));
  }
  if (typeof vildaLogAppWarn === 'function') {
    vildaLogAppWarn('app:advanced-growth:gh-import', 'Brak VildaAdvancedGrowth.importTherapyPointsToAdvancedGrowth(); nie zaimportowano punktów GH/IGF.');
  }
  return undefined;
}

if (typeof window !== 'undefined') {
  window.getGhAdvancedCurrentBasics = getGhAdvancedCurrentBasics;
  window.ghAdvancedApproxEq = ghAdvancedApproxEq;
  window.ghTherapyPointMatchesCurrentBasics = ghTherapyPointMatchesCurrentBasics;
  window.ghAdvancedRowMatchesCurrentBasics = ghAdvancedRowMatchesCurrentBasics;
  window.importTherapyPointsToAdvancedGrowth = importTherapyPointsToAdvancedGrowth;
}

/**
 * Mapuje percentyl na kanał centylowy według standardowych przedziałów.
 * Kanały definiowane są następująco: 0–<3, 3–<10, 10–<25, 25–<50, 50–<75,
 * 75–<90, 90–<97, ≥97. Służy do oceny spadku tempa wzrastania (≥2 kanały).
 * @param {number} percentile – wartość percentyla (0–100)
 * @returns {number} indeks kanału (0–7)
 */
function getCentileChannel(percentile) {
  if (percentile < 3) return 0;
  if (percentile < 10) return 1;
  if (percentile < 25) return 2;
  if (percentile < 50) return 3;
  if (percentile < 75) return 4;
  if (percentile < 90) return 5;
  if (percentile < 97) return 6;
  return 7;
}

/* === DODANE (Zaawansowane obliczenia wzrostowe) – funkcje pomocnicze === */

/** Zwraca różnicę w miesiącach (liczbę dodatnią) między dwoma wiekami w miesiącach. */
function diffMonths(aM, bM) {
  return Math.abs(aM - bM);
}

/**
 * Wybiera wcześniejszy pomiar wzrostu do obliczenia tempa z ostatniego roku
 * (12 miesięcy ± 3 miesiące), ale tylko jeśli odstęp wynosi co najmniej 6 mies.
 * Zwraca obiekt pomiaru albo null.
 */
function pickPrevForLastYear(heightMeas, currentAgeM, minGapM = 6, targetM = 12, tolM = 3) {
  const low = targetM - tolM;   // 9 mies.
  const high = targetM + tolM;  // 15 mies.
  let best = null;
  let bestDist = Infinity;
  for (let i = heightMeas.length - 1; i >= 0; i--) {
    const m = heightMeas[i];
    const gap = currentAgeM - m.ageMonths;
    if (gap < minGapM) continue;        // za blisko
    if (gap < low || gap > high) continue; // poza oknem 12±3
    const dist = Math.abs(gap - targetM);
    if (dist < bestDist) {
      best = m;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * Wybiera najnowszy wcześniejszy pomiar oddalony o ≥6 mies. (fallback,
 * gdy nie udało się policzyć „ostatniego roku”).
 */
function pickPrevFallback(heightMeas, currentAgeM, minGapM = 6) {
  for (let i = heightMeas.length - 1; i >= 0; i--) {
    const m = heightMeas[i];
    const gap = currentAgeM - m.ageMonths;
    if (gap >= minGapM) return m;
  }
  return null;
}

/** Formatuje opis okresu z którego policzono tempo (ostatni rok lub „średnia z …”). */
function formatVelocityContext(prevAgeM, currAgeM, usedLastYear) {
  const gapM = currAgeM - prevAgeM;
  if (usedLastYear) return 'ostatni rok';
  if (gapM < 12) return `ostatnich ${gapM} mies.`;
  // Zaokrąglamy lata do pełnych, żeby komunikat był "2 lata, 3 lata..."
  const yrs = Math.round(gapM / 12);
  return `ostatnich ${yrs} lat`;
}

/**
 * Zwraca próg minimalnego tempa (cm/rok) i etykietę normy w zależności od wieku końcowego.
 * Uwaga: tolerancja pomiarowa tylko dla 1. i 2. roku życia (−2 cm i −1 cm).
 * Jeżeli brak progu (wiek >10 lat), zwraca null.
 */
function getVelocityThreshold(endAgeMonths) {
  const y = endAgeMonths / 12;
  if (y < 1) {
    return { threshold: 23 - 2, label: '≥23 cm/rok (tolerancja ±2 cm)' };
  } else if (y >= 1 && y < 2) {
    return { threshold: 10 - 1, label: '≥10 cm/rok (tolerancja ±1 cm)' };
  } else if (y >= 2 && y < 3) {
    return { threshold: 7, label: '≥7 cm/rok' };
  } else if (y >= 3 && y < 5) {
    return { threshold: 6, label: '≥6 cm/rok' };
  } else if (y >= 5 && y < 10) {
    return { threshold: 5, label: '≥5 cm/rok' };
  }
  // >10 r.ż. – brak zdefiniowanej normy w specyfikacji
  return null;
}

/** Oblicza tempo wzrastania (cm/rok) między dwoma pomiarami. */
function velocityCmPerYear(h1, m1, h2, m2) {
  const dy = (m2 - m1) / 12;
  if (dy <= 0) return null;
  return (h2 - h1) / dy;
}

/**
 * Wylicza średnie tempa wzrastania dla przedziałów:
 * 0–12 mies., 12–24 mies., 24–36 mies., 36–60 mies., 60–120 mies., ≥120 mies.
 * Dla każdego okresu wymaga ≥2 pomiarów w danym oknie oraz odstępu ≥6 mies.
 * Zwraca tablicę obiektów {label, value|null}.
 */
function computePeriodVelocities(points) {
  // points: tablica obiektów {ageMonths, height}, posortowana rosnąco po ageMonths
  const ranges = [
    { label: '1. rok życia',       start:   0, end:  12 },
    { label: '2. rok życia',       start:  12, end:  24 },
    { label: '3. rok życia',       start:  24, end:  36 },
    { label: '3–5 lat',            start:  36, end:  60 },
    { label: '5–10 lat',           start:  60, end: 120 },
    { label: '>10 lat',            start: 120, end: 9999 }
  ];
  const out = [];
  for (const r of ranges) {
    const inRange = points.filter(p => p.ageMonths >= r.start && p.ageMonths <= r.end);
    if (inRange.length >= 2) {
      const first = inRange[0];
      const last  = inRange[inRange.length - 1];
      const gapM = last.ageMonths - first.ageMonths;
      if (gapM >= 6) {
        const v = velocityCmPerYear(first.height, first.ageMonths, last.height, last.ageMonths);
        out.push({ label: r.label, value: (v !== null ? v : null) });
        continue;
      }
    }
    out.push({ label: r.label, value: null });
  }
  return out;
}

/** Buduje HTML tabeli tempa wzrastania dla okresów.
 *  WERSJA: bez osobnej ramki; tytuł ~2× mniejszy; tylko okresy z wyliczonym tempem;
 *  tabelka pokazuje się dopiero gdy są ≥2 okresy z wyliczeniem.
 */
function buildVelocityTableHtml(periods) {
  // Bierzemy tylko okresy, w których rzeczywiście policzono tempo
  const valid = (periods || []).filter(p => p && p.value !== null);

  // Pokazuj tabelę dopiero, gdy mamy co najmniej 2 takie okresy
  if (valid.length < 2) return '';

  // Budowa wierszy tylko dla dostępnych okresów
  let rows = '';
  for (const p of valid) {
    rows += `<tr>
               <td style="padding:4px 0;">${p.label}</td>
               <td style="padding:4px 0;">${(p.value != null && isFinite(p.value) ? p.value.toFixed(1).replace('.', ',') : '—')} cm/rok</td>
             </tr>`;
  }

  // Zwracamy sam tytuł (mniejszy) + tabelę — bez „ramki” (result-box)
  return `
    <div class="velocity-periods-title"
         style="font-size:1.0em; font-weight:600; margin:0.5rem 0 0.25rem 0; opacity:0.9;">
      Średnie tempo wzrastania (wg okresów)
    </div>
    <table class="velocity-periods-table"
           style="width:100%; border-collapse:collapse; margin-bottom:0.5rem;">
      <thead>
        <tr>
          <th style="text-align:left; border-bottom:1px solid #ddd; padding:4px 0;">Okres</th>
          <th style="text-align:left; border-bottom:1px solid #ddd; padding:4px 0;">Tempo (cm/rok)</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}
/* === KONIEC: funkcje pomocnicze === */

/**
 * 8O-6: wrappery kompatybilnościowe dla silników predykcyjnych advanced growth.
 * Właściwa implementacja Bayley-Pinneau/RWT oraz modelu wiarygodności znajduje się
 * w vilda_advanced_growth.js; calculateGrowthAdvanced() pozostaje orkiestratorem w app.js.
 */
function vildaAdvancedGrowthPredictionEngineCall(name, args, fallback) {
  const api = (typeof window !== 'undefined' && window.VildaAdvancedGrowth && typeof window.VildaAdvancedGrowth === 'object')
    ? window.VildaAdvancedGrowth
    : null;
  const fn = api && typeof api[name] === 'function' ? api[name] : null;
  if (!fn) return (typeof fallback === 'function') ? fallback() : fallback;
  return fn.apply(api, args || []);
}

function bayleyPinneauRoundHalfUp() {
  return vildaAdvancedGrowthPredictionEngineCall('bayleyPinneauRoundHalfUp', arguments, NaN);
}

function bayleyPinneauNormalizeSexKey() {
  return vildaAdvancedGrowthPredictionEngineCall('bayleyPinneauNormalizeSexKey', arguments, null);
}

function bayleyPinneauSexLabel() {
  return vildaAdvancedGrowthPredictionEngineCall('bayleyPinneauSexLabel', arguments, '');
}

function bayleyPinneauGroupLabel() {
  return vildaAdvancedGrowthPredictionEngineCall('bayleyPinneauGroupLabel', arguments, '');
}

function bayleyPinneauGroupNominativeLabel() {
  return vildaAdvancedGrowthPredictionEngineCall('bayleyPinneauGroupNominativeLabel', arguments, '');
}

function bayleyPinneauGroupReasonText() {
  return vildaAdvancedGrowthPredictionEngineCall('bayleyPinneauGroupReasonText', arguments, '');
}

function bayleyPinneauLabelToMonths() {
  return vildaAdvancedGrowthPredictionEngineCall('bayleyPinneauLabelToMonths', arguments, null);
}

function bayleyPinneauDetermineGroupKey() {
  return vildaAdvancedGrowthPredictionEngineCall('bayleyPinneauDetermineGroupKey', arguments, 'average');
}

function bayleyPinneauFormatMonthDistance() {
  return vildaAdvancedGrowthPredictionEngineCall('bayleyPinneauFormatMonthDistance', arguments, '');
}

function bayleyPinneauFormatAgeLabel() {
  return vildaAdvancedGrowthPredictionEngineCall('bayleyPinneauFormatAgeLabel', arguments, '');
}

function bayleyPinneauErrorSampleLabel() {
  return vildaAdvancedGrowthPredictionEngineCall('bayleyPinneauErrorSampleLabel', arguments, '');
}

function bayleyPinneauInterpolateErrorStats() {
  return vildaAdvancedGrowthPredictionEngineCall('bayleyPinneauInterpolateErrorStats', arguments, null);
}

function bayleyPinneauBuildPortabilityWarningText() {
  return vildaAdvancedGrowthPredictionEngineCall('bayleyPinneauBuildPortabilityWarningText', arguments, null);
}

function bayleyPinneauResolvePrintedSegment() {
  return vildaAdvancedGrowthPredictionEngineCall('bayleyPinneauResolvePrintedSegment', arguments, null);
}

function bayleyPinneauSelectNearestFactor() {
  return vildaAdvancedGrowthPredictionEngineCall('bayleyPinneauSelectNearestFactor', arguments, null);
}

function calculateBayleyPinneauPrediction() {
  return vildaAdvancedGrowthPredictionEngineCall('calculateBayleyPinneauPrediction', arguments, { available: false, reason: 'missing-advanced-growth-module', message: 'Nie udało się wczytać modułu predykcji Bayley-Pinneau.' });
}

function buildAdvancedGrowthDetailsToggleHtml() {
  return vildaAdvancedGrowthPredictionEngineCall('buildAdvancedGrowthDetailsToggleHtml', arguments, '');
}

function initAdvancedGrowthResultDetailsToggles() {
  return vildaAdvancedGrowthPredictionEngineCall('initAdvancedGrowthResultDetailsToggles', arguments, undefined);
}

function advGrowthPredictionReliabilityLabel() {
  return vildaAdvancedGrowthPredictionEngineCall('advGrowthPredictionReliabilityLabel', arguments, '');
}

function advGrowthPredictionReliabilitySeverity() {
  return vildaAdvancedGrowthPredictionEngineCall('advGrowthPredictionReliabilitySeverity', arguments, 2);
}

function advGrowthPredictionReliabilityLevelFromSeverity() {
  return vildaAdvancedGrowthPredictionEngineCall('advGrowthPredictionReliabilityLevelFromSeverity', arguments, 'lowered');
}

function advGrowthDowngradeReliabilityLevel() {
  return vildaAdvancedGrowthPredictionEngineCall('advGrowthDowngradeReliabilityLevel', arguments, 'low');
}

function advGrowthFormatReasonList() {
  return vildaAdvancedGrowthPredictionEngineCall('advGrowthFormatReasonList', arguments, '');
}

function advGrowthBuildReliabilityBadgeHtml() {
  return vildaAdvancedGrowthPredictionEngineCall('advGrowthBuildReliabilityBadgeHtml', arguments, '');
}

function advGrowthAssessBayleyPinneauReliability() {
  return vildaAdvancedGrowthPredictionEngineCall('advGrowthAssessBayleyPinneauReliability', arguments, null);
}

function advGrowthAssessRWTReliability() {
  return vildaAdvancedGrowthPredictionEngineCall('advGrowthAssessRWTReliability', arguments, null);
}

function advGrowthBuildPredictionReliabilityModel() {
  return vildaAdvancedGrowthPredictionEngineCall('advGrowthBuildPredictionReliabilityModel', arguments, null);
}

function advGrowthBuildPredictionReliabilityHtml() {
  return vildaAdvancedGrowthPredictionEngineCall('advGrowthBuildPredictionReliabilityHtml', arguments, '');
}

function advGrowthBuildPredictionReliabilitySummaryLine() {
  return vildaAdvancedGrowthPredictionEngineCall('advGrowthBuildPredictionReliabilitySummaryLine', arguments, '');
}

function advGrowthBuildMethodReliabilityDetailsParagraph() {
  return vildaAdvancedGrowthPredictionEngineCall('advGrowthBuildMethodReliabilityDetailsParagraph', arguments, '');
}

function buildBayleyPinneauResultHtml() {
  return vildaAdvancedGrowthPredictionEngineCall('buildBayleyPinneauResultHtml', arguments, '');
}

function advGrowthBuildBayleyPinneauSummaryText() {
  return vildaAdvancedGrowthPredictionEngineCall('advGrowthBuildBayleyPinneauSummaryText', arguments, '');
}

function advGrowthBuildBayleyPinneauSummaryCardLine() {
  return vildaAdvancedGrowthPredictionEngineCall('advGrowthBuildBayleyPinneauSummaryCardLine', arguments, '');
}

function rwtRoundHalfUp() {
  return vildaAdvancedGrowthPredictionEngineCall('rwtRoundHalfUp', arguments, NaN);
}

function rwtNormalizeSexKey() {
  return vildaAdvancedGrowthPredictionEngineCall('rwtNormalizeSexKey', arguments, null);
}

function rwtSexLabel() {
  return vildaAdvancedGrowthPredictionEngineCall('rwtSexLabel', arguments, '');
}

function rwtFormatAgeLabel() {
  return vildaAdvancedGrowthPredictionEngineCall('rwtFormatAgeLabel', arguments, '');
}

function rwtJoinRequirementLabels() {
  return vildaAdvancedGrowthPredictionEngineCall('rwtJoinRequirementLabels', arguments, '');
}

function rwtInterpolateAgeWeights() {
  return vildaAdvancedGrowthPredictionEngineCall('rwtInterpolateAgeWeights', arguments, null);
}

function rwtInterpolateErrorBoundRows() {
  return vildaAdvancedGrowthPredictionEngineCall('rwtInterpolateErrorBoundRows', arguments, null);
}

function calculateRWTPrediction() {
  return vildaAdvancedGrowthPredictionEngineCall('calculateRWTPrediction', arguments, { available: false, reason: 'missing-advanced-growth-module', message: 'Nie udało się wczytać modułu predykcji RWT.' });
}

function calculateReinehrCdgpPrediction() {
  return vildaAdvancedGrowthPredictionEngineCall('calculateReinehrCdgpPrediction', arguments, null);
}

function buildRWTResultHtml() {
  return vildaAdvancedGrowthPredictionEngineCall('buildRWTResultHtml', arguments, '');
}

function advGrowthBuildRWTSummaryText() {
  return vildaAdvancedGrowthPredictionEngineCall('advGrowthBuildRWTSummaryText', arguments, '');
}

function advGrowthBuildRWTSummaryCardLine() {
  return vildaAdvancedGrowthPredictionEngineCall('advGrowthBuildRWTSummaryCardLine', arguments, '');
}

function advGrowthBuildRWTErrorIntervalSummaryCardLine() {
  return vildaAdvancedGrowthPredictionEngineCall('advGrowthBuildRWTErrorIntervalSummaryCardLine', arguments, '');
}

/**
 * 8O-7a/8O-7b: adaptery wejścia/wyjścia oraz lifecycle commit/clear dla calculateGrowthAdvanced().
 * Sam orkiestrator nadal pozostaje w app.js; te wrappery tylko delegują do
 * VildaAdvancedGrowth i utrzymują bezpieczny fallback kompatybilnościowy.
 */
function vildaAdvancedGrowthCalculationAdapterCall(name, args, fallback) {
  const api = (typeof window !== 'undefined' && window.VildaAdvancedGrowth && typeof window.VildaAdvancedGrowth === 'object')
    ? window.VildaAdvancedGrowth
    : null;
  const fn = api && typeof api[name] === 'function' ? api[name] : null;
  if (!fn) return (typeof fallback === 'function') ? fallback() : fallback;
  return fn.apply(api, args || []);
}

function collectAdvancedGrowthCalculationInput(options) {
  return vildaAdvancedGrowthCalculationAdapterCall('collectAdvancedGrowthCalculationInput', arguments, function fallbackCollectAdvancedGrowthCalculationInput() {
    const opts = options || {};
    const doc = opts.document || (typeof document !== 'undefined' ? document : null);
    const byId = (id) => doc && typeof doc.getElementById === 'function' ? doc.getElementById(id) : null;
    const readNumber = (id) => {
      const value = parseFloat(byId(id)?.value);
      return Number.isFinite(value) ? value : NaN;
    };
    const readText = (id) => {
      const el = byId(id);
      return (el && typeof el.value === 'string') ? el.value.trim() : '';
    };
    const readRaw = (id) => {
      const el = byId(id);
      return (el && el.value != null) ? String(el.value) : '';
    };
    let ageYears = NaN;
    try {
      const getAge = (typeof opts.getAgeDecimal === 'function') ? opts.getAgeDecimal : ((typeof getAgeDecimal === 'function') ? getAgeDecimal : null);
      ageYears = getAge ? Number(getAge()) : NaN;
    } catch (_) { ageYears = NaN; }
    const ageMonths = Math.round((isNaN(ageYears) ? 0 : ageYears) * 12);
    const sexEl = byId('sex');
    const sex = sexEl ? sexEl.value : 'M';
    const sexSpecificAdvancedFieldsEnabled = sex === 'M';
    const heightVal = readNumber('height');
    const weightVal = readNumber('weight');
    const motherH = readNumber('advMotherHeight');
    const fatherH = readNumber('advFatherHeight');
    let targetHeight = null;
    if (!isNaN(motherH) && !isNaN(fatherH)) {
      targetHeight = (sex === 'F') ? ((fatherH - 13) + motherH) / 2 : ((motherH + 13) + fatherH) / 2;
    }
    const boneAgeVal = readNumber('advBoneAge');
    const arrowEnabled = !!(byId('advCurrentArrowEnable') && byId('advCurrentArrowEnable').checked);
    return {
      adapterStep: '8O-7a-fallback',
      ageYears,
      ageMonths,
      sex,
      sexSpecificAdvancedFieldsEnabled,
      heightVal,
      weightVal,
      advName: readText('advName'),
      motherH,
      fatherH,
      targetHeight,
      boneAgeVal,
      boneAgeMonths: !isNaN(boneAgeVal) ? Math.round(boneAgeVal * 12) : null,
      rwtDataComplete: !isNaN(heightVal) && !isNaN(weightVal) && !isNaN(motherH) && !isNaN(fatherH),
      testicularVolumeVal: sexSpecificAdvancedFieldsEnabled ? readRaw('advTesticularVolume') : '',
      familyDelayedPubertyVal: sexSpecificAdvancedFieldsEnabled ? readRaw('advFamilyDelayedPuberty') : '',
      growthExclusionVal: sexSpecificAdvancedFieldsEnabled ? readRaw('advGrowthExclusion') : '',
      currentArrowEnabled: arrowEnabled,
      currentArrowComment: arrowEnabled ? readText('advCurrentArrowComment') : '',
      professionalMode: (typeof opts.professionalMode !== 'undefined') ? !!opts.professionalMode : (typeof professionalMode !== 'undefined' ? !!professionalMode : false)
    };
  });
}

function buildAdvancedGrowthDataPayload(input, computed) {
  return vildaAdvancedGrowthCalculationAdapterCall('buildAdvancedGrowthDataPayload', arguments, function fallbackBuildAdvancedGrowthDataPayload() {
    const safeInput = input || {};
    const safeComputed = computed || {};
    const own = (obj, key, fallback) => (obj && Object.prototype.hasOwnProperty.call(obj, key)) ? obj[key] : fallback;
    return {
      targetHeight: own(safeInput, 'targetHeight', null),
      targetStats: own(safeComputed, 'targetStats', null),
      measurements: own(safeComputed, 'measurements', []),
      boneAgeMonths: own(safeInput, 'boneAgeMonths', null),
      growthVelocity: own(safeComputed, 'growthVelocity', null),
      growthVelocityUsedLastYear: !!own(safeComputed, 'growthVelocityUsedLastYear', false),
      growthVelocityContext: own(safeComputed, 'growthVelocityContext', ''),
      growthVelocityGapM: own(safeComputed, 'growthVelocityGapM', null),
      periodVelocities: own(safeComputed, 'periodVelocities', []),
      currentAgeMonths: own(safeInput, 'ageMonths', null),
      currentHeight: own(safeInput, 'heightVal', NaN),
      currentWeight: own(safeInput, 'weightVal', NaN),
      sex: own(safeInput, 'sex', 'M'),
      name: own(safeInput, 'advName', '') || '',
      bayleyPinneau: own(safeComputed, 'bayleyPinneau', null),
      rwt: own(safeComputed, 'rwt', null),
      reinehr: own(safeComputed, 'reinehr', null),
      predictionProfile: own(safeComputed, 'predictionProfile', null),
      predictionReliability: own(safeComputed, 'predictionReliability', null),
      testicularVolume: own(safeInput, 'testicularVolumeVal', '') || '',
      familyDelayedPuberty: own(safeInput, 'familyDelayedPubertyVal', '') || '',
      growthExclusion: own(safeInput, 'growthExclusionVal', '') || '',
      isLosingGrowth: !!own(safeComputed, 'isLosingGrowth', false),
      currentArrowEnabled: !!own(safeInput, 'currentArrowEnabled', false),
      currentArrowComment: own(safeInput, 'currentArrowEnabled', false) ? (own(safeInput, 'currentArrowComment', '') || '') : ''
    };
  });
}

function commitAdvancedGrowthDataPayload(payload, options) {
  return vildaAdvancedGrowthCalculationAdapterCall('commitAdvancedGrowthDataPayload', arguments, function fallbackCommitAdvancedGrowthDataPayload() {
    const target = (options && options.global) || (typeof window !== 'undefined' ? window : globalThis);
    target.advancedGrowthData = payload || null;
    return payload || null;
  });
}

function clearAdvancedGrowthDataPayload(options) {
  return vildaAdvancedGrowthCalculationAdapterCall('clearAdvancedGrowthDataPayload', arguments, function fallbackClearAdvancedGrowthDataPayload() {
    const target = (options && options.global) || (typeof window !== 'undefined' ? window : globalThis);
    target.advancedGrowthData = null;
    return null;
  });
}

function clearAdvancedGrowthCalculationState(options) {
  return vildaAdvancedGrowthCalculationAdapterCall('clearAdvancedGrowthCalculationState', arguments, function fallbackClearAdvancedGrowthCalculationState() {
    const opts = options || {};
    const target = opts.global || (typeof window !== 'undefined' ? window : globalThis);
    target.advancedGrowthData = null;
    const resultsEl = opts.resultsEl || (typeof document !== 'undefined' ? document.getElementById('advResults') : null);
    if (resultsEl && opts.clearResults !== false) {
      try {
        if (typeof opts.clearHtml === 'function') opts.clearHtml(resultsEl);
        else if (typeof vildaAppClearHtml === 'function') vildaAppClearHtml(resultsEl);
        else resultsEl.textContent = '';
      } catch (_) {
        if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
          globalThis.vildaLogSwallowedCatch('app.js', _, { step: '8O-7b', helper: 'fallbackClearAdvancedGrowthCalculationState' });
        }
      }
    }
    try { if (typeof updateAdvancedMeasurementAnalysisControls === 'function') updateAdvancedMeasurementAnalysisControls(true); } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') globalThis.vildaLogSwallowedCatch('app.js', _, { step: '8O-7b', helper: 'fallbackClearAnalysisControls' });
    }
    try { if (typeof updateAdvancedGrowthReportButtonVisibility === 'function') updateAdvancedGrowthReportButtonVisibility(true); } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') globalThis.vildaLogSwallowedCatch('app.js', _, { step: '8O-7b', helper: 'fallbackClearReportButton' });
    }
    try { if (typeof refreshGrowthChartActionControls === 'function') refreshGrowthChartActionControls(); } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') globalThis.vildaLogSwallowedCatch('app.js', _, { step: '8O-7b', helper: 'fallbackClearChartControls' });
    }
    try {
      if (typeof window !== 'undefined' && typeof window.refreshEstimatedIntakeVisibility === 'function') {
        window.refreshEstimatedIntakeVisibility(opts.estimatedIntakeOptions || { preserveRows: true, recalcIfOpen: true });
      }
    } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') globalThis.vildaLogSwallowedCatch('app.js', _, { step: '8O-7b', helper: 'fallbackClearEstimatedIntake' });
    }
    return null;
  });
}

function commitAdvancedGrowthCalculationState(payload, options) {
  return vildaAdvancedGrowthCalculationAdapterCall('commitAdvancedGrowthCalculationState', arguments, function fallbackCommitAdvancedGrowthCalculationState() {
    const opts = options || {};
    const committed = commitAdvancedGrowthDataPayload(payload, { global: opts.global || (typeof window !== 'undefined' ? window : globalThis) });
    try { if (typeof window !== 'undefined' && typeof window.updateStabilizationEligibility === 'function') window.updateStabilizationEligibility(); } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') globalThis.vildaLogSwallowedCatch('app.js', _, { step: '8O-7b', helper: 'fallbackCommitStabilization' });
    }
    try {
      if (typeof window !== 'undefined' && typeof window.refreshEstimatedIntakeVisibility === 'function') {
        window.refreshEstimatedIntakeVisibility(opts.estimatedIntakeOptions || { preserveRows: true, recalcIfOpen: true });
      }
    } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') globalThis.vildaLogSwallowedCatch('app.js', _, { step: '8O-7b', helper: 'fallbackCommitEstimatedIntake' });
    }
    return committed;
  });
}

function finalizeAdvancedGrowthCalculationLifecycle(options) {
  return vildaAdvancedGrowthCalculationAdapterCall('finalizeAdvancedGrowthCalculationLifecycle', arguments, function fallbackFinalizeAdvancedGrowthCalculationLifecycle() {
    const opts = options || {};
    try { if (opts.updateProfessionalSummary !== false && typeof updateProfessionalSummaryCard === 'function') updateProfessionalSummaryCard(); } catch (e) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') globalThis.vildaLogSwallowedCatch('app.js', e, { step: '8O-7b', helper: 'fallbackFinalizeProfessionalSummary' });
    }
    try { if (typeof updateAdvancedMeasurementAnalysisControls === 'function') updateAdvancedMeasurementAnalysisControls(false); } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') globalThis.vildaLogSwallowedCatch('app.js', _, { step: '8O-7b', helper: 'fallbackFinalizeAnalysisControls' });
    }
    try { if (typeof updateAdvancedGrowthReportButtonVisibility === 'function') updateAdvancedGrowthReportButtonVisibility(false); } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') globalThis.vildaLogSwallowedCatch('app.js', _, { step: '8O-7b', helper: 'fallbackFinalizeReportButton' });
    }
    try { if (typeof refreshGrowthChartActionControls === 'function') refreshGrowthChartActionControls(); } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') globalThis.vildaLogSwallowedCatch('app.js', _, { step: '8O-7b', helper: 'fallbackFinalizeChartControls' });
    }
    try { if (typeof window !== 'undefined' && typeof window.syncAdvancedGrowthRowsToBasic === 'function') window.syncAdvancedGrowthRowsToBasic(); } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') globalThis.vildaLogSwallowedCatch('app.js', _, { step: '8O-7b', helper: 'fallbackFinalizeSyncBasic' });
    }
    try { if (typeof window !== 'undefined' && typeof window.vildaPersistScheduleSave === 'function') window.vildaPersistScheduleSave(); } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') globalThis.vildaLogSwallowedCatch('app.js', _, { step: '8O-7b', helper: 'fallbackFinalizePersist' });
    }
    return true;
  });
}


function getVildaAdvancedGrowthCalculationOrchestratorOptions(options = {}) {
  return Object.assign({
    global: (typeof window !== 'undefined') ? window : globalThis,
    document: (typeof document !== 'undefined') ? document : null,
    professionalMode: (typeof professionalMode !== 'undefined') ? professionalMode : undefined,
    bmiSource: (typeof bmiSource !== 'undefined') ? bmiSource : undefined,
    OLAF_DATA_MIN_AGE: (typeof OLAF_DATA_MIN_AGE !== 'undefined') ? OLAF_DATA_MIN_AGE : 3,
    getAgeDecimal: (typeof getAgeDecimal === 'function') ? getAgeDecimal : null,
    updateAdvancedGrowthSexSpecificFields: (typeof updateAdvancedGrowthSexSpecificFields === 'function') ? updateAdvancedGrowthSexSpecificFields : null,
    updateAdvAgeMax: (typeof updateAdvAgeMax === 'function') ? updateAdvAgeMax : null,
    collectAdvancedMeasurements: (typeof collectAdvancedMeasurements === 'function') ? collectAdvancedMeasurements : null,
    pickPrevForLastYear: (typeof pickPrevForLastYear === 'function') ? pickPrevForLastYear : null,
    pickPrevFallback: (typeof pickPrevFallback === 'function') ? pickPrevFallback : null,
    velocityCmPerYear: (typeof velocityCmPerYear === 'function') ? velocityCmPerYear : null,
    formatVelocityContext: (typeof formatVelocityContext === 'function') ? formatVelocityContext : null,
    calcPercentileStats: (typeof calcPercentileStats === 'function') ? calcPercentileStats : null,
    calcPercentileStatsPal: (typeof calcPercentileStatsPal === 'function') ? calcPercentileStatsPal : null,
    getCentileChannel: (typeof getCentileChannel === 'function') ? getCentileChannel : null,
    computePeriodVelocities: (typeof computePeriodVelocities === 'function') ? computePeriodVelocities : null,
    buildVelocityTableHtml: (typeof buildVelocityTableHtml === 'function') ? buildVelocityTableHtml : null,
    getVelocityThreshold: (typeof getVelocityThreshold === 'function') ? getVelocityThreshold : null,
    formatCentile: (typeof formatCentile === 'function') ? formatCentile : null,
    advGrowthBuildKowdProfileModel: (typeof advGrowthBuildKowdProfileModel === 'function') ? advGrowthBuildKowdProfileModel : null,
    advGrowthBuildKowdProfileHtml: (typeof advGrowthBuildKowdProfileHtml === 'function') ? advGrowthBuildKowdProfileHtml : null,
    advGrowthBuildReinehrCdgpResultHtml: (typeof advGrowthBuildReinehrCdgpResultHtml === 'function') ? advGrowthBuildReinehrCdgpResultHtml : null,
    updateStabilizationEligibility: (typeof window !== 'undefined' && typeof window.updateStabilizationEligibility === 'function') ? window.updateStabilizationEligibility : null,
    refreshEstimatedIntakeVisibility: (typeof window !== 'undefined' && typeof window.refreshEstimatedIntakeVisibility === 'function') ? window.refreshEstimatedIntakeVisibility : null,
    updateProfessionalSummaryCard: (typeof updateProfessionalSummaryCard === 'function') ? updateProfessionalSummaryCard : null,
    updateAdvancedMeasurementAnalysisControls: (typeof updateAdvancedMeasurementAnalysisControls === 'function') ? updateAdvancedMeasurementAnalysisControls : null,
    updateAdvancedGrowthReportButtonVisibility: (typeof updateAdvancedGrowthReportButtonVisibility === 'function') ? updateAdvancedGrowthReportButtonVisibility : null,
    refreshGrowthChartActionControls: (typeof refreshGrowthChartActionControls === 'function') ? refreshGrowthChartActionControls : null,
    syncAdvancedGrowthRowsToBasic: (typeof window !== 'undefined' && typeof window.syncAdvancedGrowthRowsToBasic === 'function') ? window.syncAdvancedGrowthRowsToBasic : null,
    vildaPersistScheduleSave: (typeof window !== 'undefined' && typeof window.vildaPersistScheduleSave === 'function') ? window.vildaPersistScheduleSave : null,
    vildaAppClearHtml: (typeof vildaAppClearHtml === 'function') ? vildaAppClearHtml : null,
    vildaAppSetTrustedHtml: (typeof vildaAppSetTrustedHtml === 'function') ? vildaAppSetTrustedHtml : null,
    clearPulse: (typeof clearPulse === 'function') ? clearPulse : null,
    applyPulse: (typeof applyPulse === 'function') ? applyPulse : null
  }, options || {});
}

function calculateGrowthAdvanced(options) {
  const adapter = getVildaAdvancedGrowthAdapter();
  if (adapter && typeof adapter.calculateGrowthAdvanced === 'function') {
    return adapter.calculateGrowthAdvanced(getVildaAdvancedGrowthCalculationOrchestratorOptions(options || {}));
  }
  if (typeof vildaLogAppWarn === 'function') {
    vildaLogAppWarn('app:advanced-growth:calculate', 'Brak VildaAdvancedGrowth.calculateGrowthAdvanced(); nie przeliczono advanced growth.');
  }
  return null;
}

/**
 * Przycisk „Wyczyść dane tej karty” został usunięty z interfejsu.
 * Zachowujemy pusty stub wyłącznie dla zgodności wstecznej ze starszym HTML,
 * ale nie wykonujemy już żadnego czyszczenia danych tej karty.
 */
function clearAdvancedGrowthCard() {
  return false;
}

// Uruchom inicjalizację zaawansowanej sekcji po załadowaniu DOM.
window.vildaAppOnReady('app:advanced-growth-init', function initAdvancedGrowthSection() {
  setupAdvancedGrowth();
  try { removeAdvancedGrowthClearButton(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 29533 });
    }
  }
  try { ensureAdvancedGrowthReportControls(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 29534 });
    }
  }
  // Przenieś kontener zaawansowanych obliczeń wzrostowych między kartę
  // Wskaźnika Cole'a a kartę „Droga do normy BMI”. Dzięki temu sekcja
  // pojawia się w układzie dwukolumnowym w odpowiednim miejscu.
  const adv = document.getElementById('advancedGrowthSection');
  const coleCard = document.getElementById('coleCard');
  const toNormCard = document.getElementById('toNormCard');
  if (adv && coleCard && toNormCard && coleCard.parentNode) {
    coleCard.parentNode.insertBefore(adv, toNormCard);
  }
});

/* ===========================================================
 * SYNC OVERLAY — Advanced Growth ↔ Intake (2-way DOM only)
 * ===========================================================
 * Ten blok utrzymuje stabilną, dwukierunkową synchronizację
 * pomiędzy historią w karcie „Zaawansowane obliczenia wzrostowe”
 * oraz historią w karcie „Szacowane spożycie energii”.
 *
 * Założenia:
 *  - pierwszy wiersz w Advanced jest zawsze chroniony (bez „×”)
 *  - pierwszy historyczny wiersz w Intake jest zawsze chroniony (bez „×”)
 *  - w Intake dodatkowo istnieje zablokowany, wyszarzony wiersz
 *    z bieżącymi danymi z „Danych użytkownika”
 *  - kliknięcie „Dodaj kolejny pomiar” nie tworzy kolejnego pustego
 *    wiersza, jeśli poprzedni wiersz jest całkowicie pusty
 *  - usunięcie wiersza usuwa wyłącznie jego prawidłowy odpowiednik
 *    w drugiej karcie – nigdy wyszarzonego wiersza z danymi bieżącymi
 */

let __advIntakePairSeq = 0;

/* ---------- helpers ---------- */
function _getAdvIntakeHelperOptions(options){
  return Object.assign({ document: (typeof document !== 'undefined') ? document : null }, options || {});
}

function _callAdvIntakeHelper(name, args, fallback){
  const adapter = getVildaAdvancedGrowthAdapter();
  if (adapter && typeof adapter[name] === 'function') {
    try {
      return adapter[name].apply(adapter, Array.isArray(args) ? args : []);
    } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', _, { step: '8O-8f', helper: name });
      }
    }
  }
  return (typeof fallback === 'function') ? fallback() : undefined;
}
function _intkRows(){
  return _callAdvIntakeHelper('advIntakeGetIntakeRows', [_getAdvIntakeHelperOptions()], () => Array.from(document.querySelectorAll('#intakeMeasurements .measure-row-intake')));
}
function _advRows(){
  return _callAdvIntakeHelper('advIntakeGetAdvancedRows', [_getAdvIntakeHelperOptions()], () => Array.from(document.querySelectorAll('#advMeasurements .measure-row')));
}
function _getIntakeHistoryRows(){
  return _callAdvIntakeHelper('advIntakeGetIntakeHistoryRows', [_getAdvIntakeHelperOptions()], () => _intkRows().filter(row => row.dataset.locked !== 'true'));
}

function _isAdvIntakeSyncSuspended(){
  try {
    return !!(typeof window !== 'undefined' && window.__vildaSuspendAdvIntakeSync);
  } catch (_) {
    return false;
  }
}

function _runWithAdvIntakeSyncSuspended(callback){
  let prev = false;
  try {
    prev = !!window.__vildaSuspendAdvIntakeSync;
    window.__vildaSuspendAdvIntakeSync = true;
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 29584 });
    }
  }
  try {
    return callback();
  } finally {
    try { window.__vildaSuspendAdvIntakeSync = prev; } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 29588 });
    }
  }
  }
}

function _nextAdvIntakeSyncId(){
  __advIntakePairSeq += 1;
  return `adv-intake-${Date.now().toString(36)}-${__advIntakePairSeq}`;
}

function _getAdvIntakeSyncId(row){
  return _callAdvIntakeHelper('advIntakeGetSyncId', [row], () => row?.dataset?.advIntakeSyncId || '');
}

function _setAdvIntakeSyncId(row, syncId){
  return _callAdvIntakeHelper('advIntakeSetSyncId', [row, syncId], () => {
    if (!row) return;
    if (syncId) row.dataset.advIntakeSyncId = String(syncId);
    else delete row.dataset.advIntakeSyncId;
    return row;
  });
}

function _findAdvRowBySyncId(syncId){
  return _callAdvIntakeHelper('advIntakeFindAdvancedRowBySyncId', [syncId, _getAdvIntakeHelperOptions()], () => {
    if (!syncId) return null;
    return _advRows().find(row => _getAdvIntakeSyncId(row) === syncId) || null;
  });
}

function _findIntakeHistoryRowBySyncId(syncId){
  return _callAdvIntakeHelper('advIntakeFindIntakeHistoryRowBySyncId', [syncId, _getAdvIntakeHelperOptions()], () => {
    if (!syncId) return null;
    return _getIntakeHistoryRows().find(row => _getAdvIntakeSyncId(row) === syncId) || null;
  });
}

function _getUserBasics(){
  return _callAdvIntakeHelper('advIntakeGetUserBasics', [_getAdvIntakeHelperOptions()], () => {
    const ageYRaw = parseFloat(document.getElementById('age')?.value);
    const ageMRaw = parseFloat(document.getElementById('ageMonths')?.value);
    const heightRaw = parseFloat(document.getElementById('height')?.value);
    const weightRaw = parseFloat(document.getElementById('weight')?.value);

    const hasAge = !isNaN(ageYRaw) || !isNaN(ageMRaw);
    const totalM = hasAge ? ((isNaN(ageYRaw) ? 0 : ageYRaw) * 12 + (isNaN(ageMRaw) ? 0 : ageMRaw)) : null;

    return {
      ageMonths: (typeof totalM === 'number' && isFinite(totalM)) ? Math.round(totalM) : null,
      height: (!isNaN(heightRaw) && isFinite(heightRaw)) ? heightRaw : null,
      weight: (!isNaN(weightRaw) && isFinite(weightRaw)) ? weightRaw : null
    };
  });
}


function _getCompleteHistoryCurrentBasics(){
  return _callAdvIntakeHelper('advIntakeGetCompleteCurrentBasics', [_getAdvIntakeHelperOptions()], () => {
    try {
      const basics = _getUserBasics();
      const ageMonths = Number.isFinite(Number(basics && basics.ageMonths)) ? Math.round(Number(basics.ageMonths)) : null;
      const height = Number.isFinite(Number(basics && basics.height)) ? Number(basics.height) : null;
      const weight = Number.isFinite(Number(basics && basics.weight)) ? Number(basics.weight) : null;
      if (ageMonths === null || height === null || weight === null) return null;
      return { ageMonths, height, weight };
    } catch (_) {
      return null;
    }
  });
}

function _historyApproxEq(a, b, tol = 0.05){
  return _callAdvIntakeHelper('advIntakeApproxEq', [a, b, tol], () => {
    if (typeof a !== 'number' || !isFinite(a) || typeof b !== 'number' || !isFinite(b)) return false;
    return Math.abs(a - b) <= tol;
  });
}

function _advRowAgeMonths(row){
  return _callAdvIntakeHelper('advIntakeAdvRowAgeMonths', [row], () => {
    if (!row) return null;
    const y = parseFloat(row.querySelector('.adv-age-years')?.value);
    const m = parseFloat(row.querySelector('.adv-age-months')?.value);
    if (Number.isNaN(y) && Number.isNaN(m)) return null;
    return Math.round((Number.isNaN(y) ? 0 : y) * 12 + (Number.isNaN(m) ? 0 : m));
  });
}

function _intakeRowAgeMonths(row){
  return _callAdvIntakeHelper('advIntakeIntakeRowAgeMonths', [row], () => {
    if (!row) return null;
    const y = parseFloat(row.querySelector('.intake-ageY')?.value);
    const m = parseFloat(row.querySelector('.intake-ageM')?.value);
    if (Number.isNaN(y) && Number.isNaN(m)) return null;
    return Math.round((Number.isNaN(y) ? 0 : y) * 12 + (Number.isNaN(m) ? 0 : m));
  });
}

function _rowMatchesCurrentBasicsByMetrics(ageMonths, height, weight, basics){
  return _callAdvIntakeHelper('advIntakeRowMatchesCurrentBasicsByMetrics', [ageMonths, height, weight, basics], () => {
    if (!basics || typeof basics !== 'object') return false;
    if (!Number.isFinite(Number(ageMonths)) || Math.round(Number(ageMonths)) !== Math.round(Number(basics.ageMonths))) {
      return false;
    }

    let compared = 0;
    if (typeof height === 'number' && isFinite(height) && typeof basics.height === 'number' && isFinite(basics.height)) {
      compared += 1;
      if (!_historyApproxEq(height, basics.height)) return false;
    }
    if (typeof weight === 'number' && isFinite(weight) && typeof basics.weight === 'number' && isFinite(basics.weight)) {
      compared += 1;
      if (!_historyApproxEq(weight, basics.weight)) return false;
    }

    return compared > 0;
  });
}

function _intakeHistoryRowDuplicatesCurrentBasics(row, basics){
  return _callAdvIntakeHelper('advIntakeIntakeHistoryRowDuplicatesCurrentBasics', [row, basics], () => {
    if (!row || !basics) return false;
    const ageMonths = _intakeRowAgeMonths(row);
    const height = parseFloat(row.querySelector('.intake-ht')?.value);
    const weight = parseFloat(row.querySelector('.intake-wt')?.value);
    return _rowMatchesCurrentBasicsByMetrics(
      ageMonths,
      Number.isNaN(height) ? null : height,
      Number.isNaN(weight) ? null : weight,
      basics
    );
  });
}

function _advancedHistoryRowDuplicatesCurrentBasics(row, basics){
  return _callAdvIntakeHelper('advIntakeAdvancedHistoryRowDuplicatesCurrentBasics', [row, basics], () => {
    if (!row || !basics) return false;
    const ageMonths = _advRowAgeMonths(row);
    const height = parseFloat(row.querySelector('.adv-height')?.value);
    const weight = parseFloat(row.querySelector('.adv-weight')?.value);
    const boneAge = parseFloat(row.querySelector('.adv-bone-age')?.value);
    const arrowEnabled = !!row.querySelector('.adv-arrow-enable')?.checked;
    const arrowComment = String(row.querySelector('.adv-arrow-comment')?.value || '').trim();
    const ghSync = row.getAttribute('data-gh-sync') === 'true';
    const ghId = String(row.getAttribute('data-gh-id') || '').trim();
    const hasExtraPayload = (!Number.isNaN(boneAge)) || arrowEnabled || !!arrowComment || ghSync || !!ghId;
    if (hasExtraPayload) return false;
    return _rowMatchesCurrentBasicsByMetrics(
      ageMonths,
      Number.isNaN(height) ? null : height,
      Number.isNaN(weight) ? null : weight,
      basics
    );
  });
}

function _pruneDuplicateCurrentHistoryRows(){
  const basics = _getCompleteHistoryCurrentBasics();
  if (!basics) return false;
  let changed = false;

  _getIntakeHistoryRows().forEach(row => {
    if (!row) return;
    if (_intakeHistoryRowDuplicatesCurrentBasics(row, basics)) {
      try { row.remove(); changed = true; } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 29728 });
    }
  }
    }
  });

  _advRows().forEach(row => {
    if (!row) return;
    if (_advancedHistoryRowDuplicatesCurrentBasics(row, basics)) {
      try { row.remove(); changed = true; } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 29735 });
    }
  }
    }
  });

  return changed;
}

function _pruneBlankAdvancedRows(){
  const rows = _advRows();
  if (!rows.length) return false;
  const nonEmpty = rows.filter(row => _advRowHasAnyData(row));
  let changed = false;

  if (nonEmpty.length > 0) {
    // Zachowaj dokładnie jeden pusty, końcowy wiersz startowy. Dzięki temu kliknięcie
    // „Dodaj kolejny pomiar” nie jest natychmiast „cofane” przez mechanizm parowania
    // z kartą szacowanego spożycia energii.
    const trailingBlank = [...rows].reverse().find(row => !_advRowHasAnyData(row)) || null;
    rows.forEach(row => {
      if (_advRowHasAnyData(row)) return;
      if (trailingBlank && row === trailingBlank) return;
      try { row.remove(); changed = true; } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 29756 });
    }
  }
    });
    return changed;
  }

  // Jeżeli wszystkie wiersze są puste, nie usuwaj ich automatycznie — użytkownik
  // może właśnie przygotowywać kilka pól do późniejszego wpisania, tak jak w karcie
  // podstawowych obliczeń wzrostowych.
  return changed;
}

function _pruneBlankIntakeHistoryRows(){
  const rows = _getIntakeHistoryRows();
  if (!rows.length) return false;
  const nonEmpty = rows.filter(row => _intakeRowHasAnyData(row));
  let changed = false;

  if (nonEmpty.length > 0) {
    // Jak wyżej: pozostaw jeden pusty, ostatni wiersz historii, żeby użytkownik mógł
    // dopisać kolejny pomiar bez walki z automatycznym pruningiem.
    const trailingBlank = [...rows].reverse().find(row => !_intakeRowHasAnyData(row)) || null;
    rows.forEach(row => {
      if (_intakeRowHasAnyData(row)) return;
      if (trailingBlank && row === trailingBlank) return;
      try { row.remove(); changed = true; } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 29780 });
    }
  }
    });
    return changed;
  }

  // Gdy wszystkie wiersze historii są puste, pozostaw je — odpowiadają wierszom
  // utworzonym przez użytkownika w module zaawansowanym.
  return changed;
}

function _getRawInputValue(el){
  return _callAdvIntakeHelper('advIntakeGetRawInputValue', [el], () => {
    if (!el) return '';
    return String(el.value ?? '').trim();
  });
}

function _rowHasAnyData(row, selectors){
  return _callAdvIntakeHelper('advIntakeRowHasAnyData', [row, selectors], () => {
    if (!row) return false;
    return selectors.some(sel => {
      const el = row.querySelector(sel);
      return !!el && String(el.value ?? '').trim() !== '';
    });
  });
}

function _advRowHasAnyData(row){
  return _callAdvIntakeHelper('advIntakeAdvRowHasAnyData', [row], () => _rowHasAnyData(row, [
    '.adv-age-years',
    '.adv-age-months',
    '.adv-height',
    '.adv-weight',
    '.adv-bone-age'
  ]));
}

function _intakeRowHasAnyData(row){
  return _callAdvIntakeHelper('advIntakeIntakeRowHasAnyData', [row], () => _rowHasAnyData(row, [
    '.intake-ageY',
    '.intake-ageM',
    '.intake-ht',
    '.intake-wt'
  ]));
}

function _isProtectedAdvancedHistoryRow(row){
  return _callAdvIntakeHelper('advIntakeIsProtectedAdvancedHistoryRow', [row, _getAdvIntakeHelperOptions()], () => {
    const rows = _advRows();
    if (!row || !rows.length || rows[0] !== row) return false;
    const hasGhMeta = row.getAttribute('data-gh-sync') === 'true'
      || !!String(row.getAttribute('data-gh-id') || '').trim();
    return rows.length === 1 && !_advRowHasAnyData(row) && !hasGhMeta;
  });
}

function _isProtectedIntakeHistoryRow(row){
  return _callAdvIntakeHelper('advIntakeIsProtectedIntakeHistoryRow', [row, _getAdvIntakeHelperOptions()], () => {
    const rows = _getIntakeHistoryRows();
    if (!row || !rows.length || rows[0] !== row) return false;
    return rows.length === 1 && !_intakeRowHasAnyData(row);
  });
}

function _lockIntakeFirstRow(){
  const rows = _intkRows();
  if (!rows.length) return;
  const first = rows[0];
  first.dataset.locked = 'true';
  _setAdvIntakeSyncId(first, '');
  first.querySelectorAll('input').forEach(inp => { inp.disabled = true; });
  const rm = first.querySelector('.remove-intake-row');
  if (rm) rm.style.display = 'none';
}

function _updateIntakeFirstRowFromUserBasics(){
  const cont = document.getElementById('intakeMeasurements');
  if (!cont) return;

  const basics = _getUserBasics();
  const hasCurrentBasics = Number.isFinite(Number(basics && basics.ageMonths))
    && Number.isFinite(Number(basics && basics.height))
    && Number.isFinite(Number(basics && basics.weight));

  if (!hasCurrentBasics) {
    const rows = _intkRows();
    const first = rows[0];
    if (first && first.dataset.locked === 'true' && !_intakeRowHasAnyData(first)) {
      try { first.remove(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 29860 });
    }
  }
    }
    if (typeof updateIntakeRemoveButtons === 'function') updateIntakeRemoveButtons();
    return;
  }

  if (!_intkRows().length) {
    if (typeof intakeAddRow === 'function') intakeAddRow();
    else return;
  }

  const first = _intkRows()[0];
  if (!first) return;

  const setVal = (sel, value) => {
    const el = first.querySelector(sel);
    if (!el) return;
    el.value = (value === null || value === undefined || value === '') ? '' : String(value);
  };

  const ageMonths = (typeof basics.ageMonths === 'number' && isFinite(basics.ageMonths))
    ? basics.ageMonths
    : null;

  setVal('.intake-ageY', ageMonths === null ? '' : Math.floor(ageMonths / 12));
  setVal('.intake-ageM', ageMonths === null ? '' : (ageMonths % 12));
  setVal('.intake-ht', basics.height);
  setVal('.intake-wt', basics.weight);

  _lockIntakeFirstRow();
  if (typeof updateIntakeRemoveButtons === 'function') updateIntakeRemoveButtons();
}

function _ensureAtLeastOneAdvancedHistoryRow(){
  if (!document.getElementById('advMeasurements')) return;
  if (_advRows().length) return;
  if (typeof addAdvMeasurementRow === 'function') addAdvMeasurementRow();
}

function _ensureAtLeastOneIntakeHistoryRow(){
  if (!document.getElementById('intakeMeasurements')) return;
  if (_getIntakeHistoryRows().length) return;
  if (typeof intakeAddRow === 'function') intakeAddRow();
}

function _refreshAdvIntakeRowUi(){
  try { if (typeof updateRemoveButtons === 'function') updateRemoveButtons(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 29906 });
    }
  }
  try { if (typeof updateIntakeRemoveButtons === 'function') updateIntakeRemoveButtons(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 29907 });
    }
  }
}

function vildaGetAdvancedIntakeSyncAuditSnapshot(options){
  const opts = options || {};
  const adapter = getVildaAdvancedGrowthAdapter();
  if (adapter && typeof adapter.advIntakeBuildAuditSnapshot === 'function') {
    try {
      return adapter.advIntakeBuildAuditSnapshot(_getAdvIntakeHelperOptions(opts));
    } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', _, { step: '8O-8d', helper: 'advIntakeBuildAuditSnapshot' });
      }
    }
  }
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

  const advancedRows = safeRows('advancedRows', _advRows);
  const intakeRows = safeRows('intakeRows', _intkRows);
  const intakeHistoryRows = safeRows('intakeHistoryRows', _getIntakeHistoryRows);

  const describeRow = (row, index, kind) => {
    const syncId = _getAdvIntakeSyncId(row);
    const locked = !!(row && row.dataset && row.dataset.locked === 'true');
    const hasData = kind === 'advanced'
      ? safeHasData('advancedHasData', row, _advRowHasAnyData)
      : safeHasData('intakeHasData', row, _intakeRowHasAnyData);
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

  const snapshot = {
    step: '8O-8d',
    kind: 'advanced-intake-sync-audit',
    hasAdvancedContainer: !!(typeof document !== 'undefined' && document.getElementById && document.getElementById('advMeasurements')),
    hasIntakeContainer: !!(typeof document !== 'undefined' && document.getElementById && document.getElementById('intakeMeasurements')),
    suspended: _isAdvIntakeSyncSuspended(),
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

try {
  if (typeof window !== 'undefined') {
    window.vildaGetAdvancedIntakeSyncAuditSnapshot = vildaGetAdvancedIntakeSyncAuditSnapshot;
  }
} catch (_) {
  if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
    globalThis.vildaLogSwallowedCatch('app.js', _, { step: '8O-8d', helper: 'vildaGetAdvancedIntakeSyncAuditSnapshot:expose' });
  }
}

/* ---------- Estimated intake audit snapshot: 8O-9a / 8O-9e ---------- */

function vildaGetEstimatedIntakeAlertProbeAuditSnapshot(options){
  const opts = options || {};
  const errors = [];
  const hasDocument = typeof document !== 'undefined' && document && typeof document.getElementById === 'function';
  const root = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : null);

  const safeCall = (label, fn, fallback) => {
    try {
      return (typeof fn === 'function') ? fn() : fallback;
    } catch (error) {
      errors.push({ label, message: String(error && error.message ? error.message : error) });
      return fallback;
    }
  };

  const functionSourceIncludes = (fn, token) => safeCall('source:' + token, () => {
    if (typeof fn !== 'function') return false;
    return Function.prototype.toString.call(fn).indexOf(token) !== -1;
  }, false);

  const getElement = (id) => safeCall('getElement:' + id, () => hasDocument ? document.getElementById(id) : null, null);
  const rawInput = (id) => safeCall('input:' + id, () => {
    const el = getElement(id);
    return el ? String(el.value ?? '') : '';
  }, '');
  const parseMaybe = (value) => {
    const num = parseFloat(value);
    return Number.isFinite(num) ? num : null;
  };

  const functions = {
    getUserBasics: typeof getUserBasics === 'function',
    readIntakeRows: typeof readIntakeRows === 'function',
    getIntakeRowHeight: typeof getIntakeRowHeight === 'function',
    buildIntakeIntervals: typeof buildIntakeIntervals === 'function',
    collectIntakeRowsForAlertProbe: typeof collectIntakeRowsForAlertProbe === 'function',
    hasPotentialIntakeAlerts: typeof hasPotentialIntakeAlerts === 'function',
    VildaEstimatedIntake: !!(root && root.VildaEstimatedIntake),
    VildaEstimatedIntakeCollectRowsForAlertProbe: !!(root && root.VildaEstimatedIntake && typeof root.VildaEstimatedIntake.collectIntakeRowsForAlertProbe === 'function'),
    energyBuildIntakeObservedState: typeof energyBuildIntakeObservedState === 'function',
    energyIsNumeric: typeof energyIsNumeric === 'function',
    detectAnRisk: !!(root && typeof root.detectAnRisk === 'function'),
    has12mLossOrangeRisk: !!(root && typeof root.has12mLossOrangeRisk === 'function')
  };

  const collectSourceSignals = {
    usesGetUserBasics: functionSourceIncludes(typeof collectIntakeRowsForAlertProbe === 'function' ? collectIntakeRowsForAlertProbe : null, 'getUserBasics'),
    usesReadIntakeRows: functionSourceIncludes(typeof collectIntakeRowsForAlertProbe === 'function' ? collectIntakeRowsForAlertProbe : null, 'readIntakeRows'),
    usesGetIntakeRowHeight: functionSourceIncludes(typeof collectIntakeRowsForAlertProbe === 'function' ? collectIntakeRowsForAlertProbe : null, 'getIntakeRowHeight'),
    usesAdvancedGrowthData: functionSourceIncludes(typeof collectIntakeRowsForAlertProbe === 'function' ? collectIntakeRowsForAlertProbe : null, 'advancedGrowthData'),
    usesWindow: functionSourceIncludes(typeof collectIntakeRowsForAlertProbe === 'function' ? collectIntakeRowsForAlertProbe : null, 'window.'),
    usesDocument: functionSourceIncludes(typeof collectIntakeRowsForAlertProbe === 'function' ? collectIntakeRowsForAlertProbe : null, 'document'),
    wrapperDelegatesToModule: functionSourceIncludes(typeof collectIntakeRowsForAlertProbe === 'function' ? collectIntakeRowsForAlertProbe : null, 'adapter.collectIntakeRowsForAlertProbe'),
    moduleAvailable: !!(root && root.VildaEstimatedIntake && typeof root.VildaEstimatedIntake.collectIntakeRowsForAlertProbe === 'function'),
    moduleUsesDependencyInjection: functionSourceIncludes(root && root.VildaEstimatedIntake ? root.VildaEstimatedIntake.collectIntakeRowsForAlertProbe : null, 'dependencies')
  };

  const hasAlertsSourceSignals = {
    usesGetUserBasics: functionSourceIncludes(typeof hasPotentialIntakeAlerts === 'function' ? hasPotentialIntakeAlerts : null, 'getUserBasics'),
    usesCollectIntakeRowsForAlertProbe: functionSourceIncludes(typeof hasPotentialIntakeAlerts === 'function' ? hasPotentialIntakeAlerts : null, 'collectIntakeRowsForAlertProbe'),
    usesDomPalInput: functionSourceIncludes(typeof hasPotentialIntakeAlerts === 'function' ? hasPotentialIntakeAlerts : null, "document.getElementById('intakePal'"),
    usesPalFactorFallback: functionSourceIncludes(typeof hasPotentialIntakeAlerts === 'function' ? hasPotentialIntakeAlerts : null, "document.getElementById('palFactor'"),
    usesEnergyObservedState: functionSourceIncludes(typeof hasPotentialIntakeAlerts === 'function' ? hasPotentialIntakeAlerts : null, 'energyBuildIntakeObservedState'),
    usesBuildIntakeIntervals: functionSourceIncludes(typeof hasPotentialIntakeAlerts === 'function' ? hasPotentialIntakeAlerts : null, 'buildIntakeIntervals'),
    usesDetectAnRisk: functionSourceIncludes(typeof hasPotentialIntakeAlerts === 'function' ? hasPotentialIntakeAlerts : null, 'detectAnRisk'),
    usesHas12mLossOrangeRisk: functionSourceIncludes(typeof hasPotentialIntakeAlerts === 'function' ? hasPotentialIntakeAlerts : null, 'has12mLossOrangeRisk'),
    usesAnorexiaTmpMount: functionSourceIncludes(typeof hasPotentialIntakeAlerts === 'function' ? hasPotentialIntakeAlerts : null, 'anorexiaTmpMount'),
    usesApplyRiskAdjustTrue: functionSourceIncludes(typeof hasPotentialIntakeAlerts === 'function' ? hasPotentialIntakeAlerts : null, 'applyRiskAdjust: true')
  };

  const collectRequired = ['getUserBasics', 'readIntakeRows', 'getIntakeRowHeight'];
  const hasAlertsRequired = ['getUserBasics', 'collectIntakeRowsForAlertProbe', 'getIntakeRowHeight', 'energyBuildIntakeObservedState', 'energyIsNumeric', 'buildIntakeIntervals'];
  const collectMissing = collectRequired.filter((name) => !functions[name]);
  const hasAlertsMissing = hasAlertsRequired.filter((name) => !functions[name]);

  const rowsPreview = opts.includeRows === true ? safeCall('readIntakeRows:preview', () => {
    if (typeof readIntakeRows !== 'function') return null;
    return readIntakeRows().map((row, index) => ({
      index,
      ageMonths: row && Number.isFinite(Number(row.ageMonths)) ? Number(row.ageMonths) : null,
      ageYears: row && Number.isFinite(Number(row.ageYears)) ? Number(row.ageYears) : null,
      weight: row && Number.isFinite(Number(row.weight)) ? Number(row.weight) : null,
      height: row && Number.isFinite(Number(row.height)) ? Number(row.height) : null
    }));
  }, null) : undefined;

  const palRaw = rawInput('intakePal') || rawInput('palFactor');
  const pal = parseMaybe(palRaw);
  const snapshot = {
    step: '8O-9f',
    kind: 'estimated-intake-alert-probe-collector-audit',
    readOnly: true,
    executedAlertProbeFunctions: false,
    executionPolicy: 'Nie uruchamia hasPotentialIntakeAlerts(); nie wywołuje kolektora alert-probe w trybie audytu poza opcjonalnym readIntakeRows preview. Analizuje delegację kolektora i statyczne sygnały źródłowe.',
    functions,
    moduleApi: {
      VildaEstimatedIntake: !!(root && root.VildaEstimatedIntake),
      version: root && root.VildaEstimatedIntake ? (root.VildaEstimatedIntake.version || root.VildaEstimatedIntake.VERSION || null) : null,
      collectIntakeRowsForAlertProbe: !!(root && root.VildaEstimatedIntake && typeof root.VildaEstimatedIntake.collectIntakeRowsForAlertProbe === 'function'),
      getApiSurfaceStatus: !!(root && root.VildaEstimatedIntake && typeof root.VildaEstimatedIntake.getApiSurfaceStatus === 'function')
    },
    domInputs: {
      hasDocument,
      hasIntakePal: !!getElement('intakePal'),
      hasPalFactor: !!getElement('palFactor'),
      intakePalRaw: rawInput('intakePal'),
      palFactorRaw: rawInput('palFactor'),
      effectivePal: pal
    },
    advancedGrowthData: {
      exists: !!(root && root.advancedGrowthData),
      hasMeasurements: !!(root && root.advancedGrowthData && Array.isArray(root.advancedGrowthData.measurements)),
      measurementsLength: root && root.advancedGrowthData && Array.isArray(root.advancedGrowthData.measurements) ? root.advancedGrowthData.measurements.length : null
    },
    sourceSignals: {
      collectIntakeRowsForAlertProbe: collectSourceSignals,
      hasPotentialIntakeAlerts: hasAlertsSourceSignals
    },
    dependencyMap: {
      collectIntakeRowsForAlertProbe: {
        required: collectRequired,
        optional: ['window.advancedGrowthData.measurements'],
        missing: collectMissing,
        satisfied: collectMissing.length === 0
      },
      hasPotentialIntakeAlerts: {
        required: hasAlertsRequired,
        optional: ['window.detectAnRisk', 'window.has12mLossOrangeRisk', 'DOM:intakePal', 'DOM:palFactor'],
        missing: hasAlertsMissing,
        satisfied: hasAlertsMissing.length === 0
      }
    },
    delegationAssessment: {
      collectIntakeRowsForAlertProbe: {
        delegatedIn8O9dLite: !!(root && root.VildaEstimatedIntake && typeof root.VildaEstimatedIntake.collectIntakeRowsForAlertProbe === 'function'),
        canBeDelegatedSafely: collectMissing.length === 0,
        recommendation: 'Wydzielony jako helper DI w 8O-9d-lite; app.js zachowuje wrapper i fallback, a hasPotentialIntakeAlerts() nadal wywołuje dotychczasową nazwę.',
        blockers: collectMissing
      },
      hasPotentialIntakeAlerts: {
        canBeDelegatedSafely: false,
        recommendation: 'Nie przenosić jako neutralnego helpera; po 8O-9e funkcja nadal powinna poczekać na rozdzielenie czystego modelu obliczeniowego od alertów i renderowania.',
        blockers: [
          'czyta PAL z DOM (#intakePal/#palFactor)',
          'wywołuje energyBuildIntakeObservedState() z applyRiskAdjust=true i mountId=anorexiaTmpMount',
          'łączy estimated intake z detektorami anoreksji i utraty masy',
          'buduje intakeKcalPerDay przez buildIntakeIntervals()',
          'zależna od bieżącego modelu pacjenta getUserBasics()'
        ]
      }
    },
    proposedExtractionBoundary: {
      delegatedIn8O9dLite: ['collectIntakeRowsForAlertProbe jako helper DI w vilda_estimated_intake.js z wrapperem/fallbackiem app.js'],
      keepInAppJsUntilCalcSeam: ['hasPotentialIntakeAlerts', 'calcEstimatedIntake', 'render estimated intake results', 'window.intakeHistory', 'window.intakeEstimatedKcalPerDay'],
      nextRecommendedStep: '8Q-10 — estimated intake orchestration diagnostics and acceptance hardening'
    },
    errors
  };

  if (opts.includeRows === true) {
    snapshot.rowsPreview = Array.isArray(rowsPreview) ? rowsPreview : rowsPreview;
    snapshot.rowPreviewCount = Array.isArray(rowsPreview) ? rowsPreview.length : null;
  }

  return snapshot;
}

function vildaGetEstimatedIntakeAuditSnapshot(options){
  const opts = options || {};
  const errors = [];
  const hasDocument = typeof document !== 'undefined' && document && typeof document.getElementById === 'function';
  const root = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : null);

  const safeCall = (label, fn, fallback) => {
    try {
      return (typeof fn === 'function') ? fn() : fallback;
    } catch (error) {
      errors.push({ label, message: String(error && error.message ? error.message : error) });
      return fallback;
    }
  };

  const safeRows = (label, reader) => {
    const rows = safeCall(label, reader, []);
    return Array.isArray(rows) ? rows : Array.from(rows || []);
  };

  const getElement = (id) => safeCall('getElement:' + id, () => hasDocument ? document.getElementById(id) : null, null);
  const getRawValue = (row, selector) => safeCall('rowValue:' + selector, () => {
    const el = row && typeof row.querySelector === 'function' ? row.querySelector(selector) : null;
    return el ? String(el.value ?? '').trim() : '';
  }, '');
  const parseMaybe = (value) => {
    const num = parseFloat(value);
    return Number.isFinite(num) ? num : null;
  };
  const hasOwnFn = (name) => typeof safeCall('function:' + name, () => root && root[name], null) === 'function';
  const getSyncId = (row) => safeCall('syncId', () => {
    if (typeof _getAdvIntakeSyncId === 'function') return _getAdvIntakeSyncId(row);
    return row && row.dataset ? String(row.dataset.advIntakeSyncId || '') : '';
  }, '');

  const wrap = getElement('intakeMeasurements');
  const card = getElement('intakeCard');
  const results = getElement('intakeResults');
  const toggle = getElement('toggleIntakeCard');

  const intakeRows = safeRows('intakeRows', () => {
    if (typeof _intkRows === 'function') return _intkRows();
    return hasDocument ? Array.from(document.querySelectorAll('#intakeMeasurements .measure-row-intake')) : [];
  });
  const intakeHistoryRows = safeRows('intakeHistoryRows', () => {
    if (typeof _getIntakeHistoryRows === 'function') return _getIntakeHistoryRows();
    return intakeRows.filter((row) => !(row && row.dataset && row.dataset.locked === 'true'));
  });

  const describeRow = (row, index) => {
    const yRaw = getRawValue(row, '.intake-ageY');
    const mRaw = getRawValue(row, '.intake-ageM');
    const hRaw = getRawValue(row, '.intake-ht');
    const wRaw = getRawValue(row, '.intake-wt');
    const y = parseMaybe(yRaw);
    const m = parseMaybe(mRaw);
    const h = parseMaybe(hRaw);
    const w = parseMaybe(wRaw);
    const hasAge = y !== null || m !== null;
    const ageMonths = hasAge ? Math.round((y === null ? 0 : y) * 12 + (m === null ? 0 : m)) : null;
    const locked = !!(row && row.dataset && row.dataset.locked === 'true');
    const datasetType = row && row.dataset ? String(row.dataset.intakeRowType || '') : '';
    const className = row && typeof row.className === 'string' ? row.className : '';
    const uiCurrent = locked || datasetType === 'current' || /(?:^|\s)intake-current-row(?:\s|$)/.test(className) || index === 0;
    const uiHistory = !locked && (datasetType === 'history' || /(?:^|\s)intake-history-row(?:\s|$)/.test(className) || !uiCurrent);
    const blank = !yRaw && !mRaw && !hRaw && !wRaw;
    const complete = hasAge && h !== null && w !== null;
    return {
      index,
      locked,
      uiCurrent,
      uiHistory,
      datasetType,
      syncId: getSyncId(row),
      blank,
      complete,
      hasAge,
      ageMonths,
      height: h,
      weight: w,
      values: opts.includeRawValues === true ? { ageY: yRaw, ageM: mRaw, height: hRaw, weight: wRaw } : undefined
    };
  };

  const rows = intakeRows.map(describeRow);
  const historySet = new Set(intakeHistoryRows);
  rows.forEach((row, idx) => {
    row.historyByHelper = historySet.has(intakeRows[idx]);
  });

  const syncCount = rows.reduce((acc, row) => {
    if (row.syncId) acc[row.syncId] = (acc[row.syncId] || 0) + 1;
    return acc;
  }, Object.create(null));
  const duplicateSyncIds = Object.keys(syncCount).filter((id) => syncCount[id] > 1);

  const readRows = safeCall('readIntakeRows', () => {
    if (typeof readIntakeRows === 'function') return readIntakeRows();
    return null;
  }, null);

  const rawInput = (id) => safeCall('input:' + id, () => {
    const el = getElement(id);
    return el ? String(el.value ?? '') : '';
  }, '');
  const ageYRaw = rawInput('age');
  const ageMRaw = rawInput('ageMonths');
  const ageY = parseMaybe(ageYRaw);
  const ageM = parseMaybe(ageMRaw);

  const snapshot = {
    step: '8Q-8',
    kind: 'estimated-intake-card-audit',
    readOnly: true,
    hasDocument,
    card: {
      hasToggle: !!toggle,
      hasCard: !!card,
      hasMeasurementsContainer: !!wrap,
      hasResults: !!results,
      display: card && card.style ? String(card.style.display || '') : '',
      visible: !!(card && card.style && card.style.display !== 'none')
    },
    counts: {
      totalRows: rows.length,
      lockedRows: rows.filter((row) => row.locked).length,
      currentRows: rows.filter((row) => row.uiCurrent).length,
      historyRows: intakeHistoryRows.length,
      uiHistoryRows: rows.filter((row) => row.uiHistory).length,
      blankRows: rows.filter((row) => row.blank).length,
      completeRows: rows.filter((row) => row.complete).length,
      readIntakeRows: Array.isArray(readRows) ? readRows.length : null,
      duplicateSyncIds: duplicateSyncIds.length
    },
    syncIds: {
      duplicate: duplicateSyncIds,
      all: rows.map((row) => row.syncId).filter(Boolean)
    },
    state: {
      intakeHistory: {
        exists: !!(root && Object.prototype.hasOwnProperty.call(root, 'intakeHistory')),
        isArray: !!(root && Array.isArray(root.intakeHistory)),
        length: root && Array.isArray(root.intakeHistory) ? root.intakeHistory.length : null,
        valueType: root && root.intakeHistory === null ? 'null' : typeof (root ? root.intakeHistory : undefined)
      },
      intakeEstimatedKcalPerDay: {
        value: root ? root.intakeEstimatedKcalPerDay : undefined,
        isNumeric: Number.isFinite(Number(root ? root.intakeEstimatedKcalPerDay : NaN))
      },
      advancedGrowthData: {
        exists: !!(root && root.advancedGrowthData),
        hasMeasurements: !!(root && root.advancedGrowthData && Array.isArray(root.advancedGrowthData.measurements)),
        measurementsLength: root && root.advancedGrowthData && Array.isArray(root.advancedGrowthData.measurements) ? root.advancedGrowthData.measurements.length : null
      }
    },
    patientInputs: {
      sex: rawInput('sex'),
      ageYearsRaw: ageYRaw,
      ageMonthsRaw: ageMRaw,
      ageMonths: (ageY !== null || ageM !== null) ? Math.round((ageY === null ? 0 : ageY) * 12 + (ageM === null ? 0 : ageM)) : null,
      weight: parseMaybe(rawInput('weight')),
      height: parseMaybe(rawInput('height')),
      intakePal: parseMaybe(rawInput('intakePal')),
      palFactor: parseMaybe(rawInput('palFactor'))
    },
    functions: {
      intakeAddRow: typeof intakeAddRow === 'function',
      readIntakeRows: typeof readIntakeRows === 'function',
      getIntakeRowHeight: typeof getIntakeRowHeight === 'function',
      buildIntakeIntervals: typeof buildIntakeIntervals === 'function',
      calcEstimatedIntake: typeof calcEstimatedIntake === 'function',
      setupEstimatedIntake: typeof setupEstimatedIntake === 'function',
      debouncedIntakeCalc: typeof debouncedIntakeCalc === 'function',
      updateIntakeRemoveButtons: typeof updateIntakeRemoveButtons === 'function',
      collectIntakeRowsForAlertProbe: typeof collectIntakeRowsForAlertProbe === 'function',
      hasPotentialIntakeAlerts: typeof hasPotentialIntakeAlerts === 'function',
      buildEstimatedIntakeCalcInputModel: typeof buildEstimatedIntakeCalcInputModel === 'function',
      buildEstimatedIntakeLastObservedModel: typeof buildEstimatedIntakeLastObservedModel === 'function',
      buildEstimatedIntakeCalculationModel: typeof buildEstimatedIntakeCalculationModel === 'function',
      getEstimatedIntakeCalcOutputTargets: typeof getEstimatedIntakeCalcOutputTargets === 'function',
      commitEstimatedIntakeWindowState: typeof commitEstimatedIntakeWindowState === 'function',
      clearEstimatedIntakeWindowState: typeof clearEstimatedIntakeWindowState === 'function',
      vildaGetEstimatedIntakeCalcSeamSnapshot: typeof vildaGetEstimatedIntakeCalcSeamSnapshot === 'function',
      vildaGetEstimatedIntakeCalculationModelSnapshot: typeof vildaGetEstimatedIntakeCalculationModelSnapshot === 'function',
      getVildaEstimatedIntakeInputModelAdapter: typeof getVildaEstimatedIntakeInputModelAdapter === 'function',
      getVildaEstimatedIntakeInputModelDependencies: typeof getVildaEstimatedIntakeInputModelDependencies === 'function'
    },
    dependencies: {
      energyBuildIntakeObservedState: hasOwnFn('energyBuildIntakeObservedState'),
      energyIsNumeric: hasOwnFn('energyIsNumeric'),
      expectedGainMedianHeightAware: hasOwnFn('expectedGainMedianHeightAware'),
      updatePalDescription: hasOwnFn('updatePalDescription'),
      energyPopulateIntakePalSelect: hasOwnFn('energyPopulateIntakePalSelect'),
      detectAnRisk: hasOwnFn('detectAnRisk'),
      has12mLossOrangeRisk: hasOwnFn('has12mLossOrangeRisk'),
      VildaAdvancedGrowth: !!(root && root.VildaAdvancedGrowth),
      VildaFoodSummary: !!(root && root.VildaFoodSummary),
      VildaEstimatedIntake: !!(root && root.VildaEstimatedIntake),
      VildaEstimatedIntakeReadRows: !!(root && root.VildaEstimatedIntake && typeof root.VildaEstimatedIntake.readIntakeRows === 'function'),
      VildaEstimatedIntakeRowHeight: !!(root && root.VildaEstimatedIntake && typeof root.VildaEstimatedIntake.getIntakeRowHeight === 'function'),
      VildaEstimatedIntakeBuildIntervals: !!(root && root.VildaEstimatedIntake && typeof root.VildaEstimatedIntake.buildIntakeIntervals === 'function'),
      VildaEstimatedIntakeCollectRowsForAlertProbe: !!(root && root.VildaEstimatedIntake && typeof root.VildaEstimatedIntake.collectIntakeRowsForAlertProbe === 'function'),
      VildaEstimatedIntakeCalculationModel: !!(root && root.VildaEstimatedIntake && typeof root.VildaEstimatedIntake.buildEstimatedIntakeCalculationModel === 'function'),
      VildaEstimatedIntakeRuntime: !!(root && root.VildaEstimatedIntakeRuntime),
      VildaEstimatedIntakeRuntimeCommit: !!(root && root.VildaEstimatedIntakeRuntime && typeof root.VildaEstimatedIntakeRuntime.commitEstimatedIntakeCalcModelWindowState === 'function'),
      VildaEstimatedIntakeRuntimeRisk: !!(root && root.VildaEstimatedIntakeRuntime && typeof root.VildaEstimatedIntakeRuntime.runEstimatedIntakePostRenderRisk === 'function'),
      estimatedIntakeRuntimeSnapshot: typeof vildaGetEstimatedIntakeRuntimeSnapshot === 'function',
      VildaEstimatedIntakeInputModel: !!(root && root.VildaEstimatedIntakeInputModel),
      VildaEstimatedIntakeInputModelBuildInput: !!(root && root.VildaEstimatedIntakeInputModel && typeof root.VildaEstimatedIntakeInputModel.buildEstimatedIntakeCalcInputModel === 'function'),
      VildaEstimatedIntakeInputModelBuildObserved: !!(root && root.VildaEstimatedIntakeInputModel && typeof root.VildaEstimatedIntakeInputModel.buildEstimatedIntakeLastObservedModel === 'function'),
      VildaEstimatedIntakeInputModelDependencies: !!(root && root.VildaEstimatedIntakeInputModel && typeof root.VildaEstimatedIntakeInputModel.getEstimatedIntakeCalculationModelDependencies === 'function'),
      estimatedIntakeInputModelSnapshot: typeof vildaGetEstimatedIntakeInputModelSnapshot === 'function',
      advancedIntakeSyncAudit: typeof vildaGetAdvancedIntakeSyncAuditSnapshot === 'function',
      estimatedIntakeAlertProbeAudit: typeof vildaGetEstimatedIntakeAlertProbeAuditSnapshot === 'function',
      estimatedIntakeCalcSeamAudit: typeof vildaGetEstimatedIntakeCalcSeamSnapshot === 'function',
      estimatedIntakeCalculationModelAudit: typeof vildaGetEstimatedIntakeCalculationModelSnapshot === 'function'
    },
    calcSeam: typeof vildaGetEstimatedIntakeCalcSeamSnapshot === 'function'
      ? vildaGetEstimatedIntakeCalcSeamSnapshot({ includeRows: opts.includeRows === true, includeWindowState: opts.includeWindowState === true })
      : null,
    calculationModel: typeof vildaGetEstimatedIntakeCalculationModelSnapshot === 'function'
      ? vildaGetEstimatedIntakeCalculationModelSnapshot({ includeRows: opts.includeRows === true })
      : null,
    alertProbe: vildaGetEstimatedIntakeAlertProbeAuditSnapshot({ includeRows: opts.includeRows === true }),
    proposedExtractionBoundary: {
      file: 'vilda_estimated_intake.js',
      delegatedIn8O9b: ['readIntakeRows', 'getIntakeRowHeight', 'buildIntakeIntervals'],
      reviewedIn8O9c: ['collectIntakeRowsForAlertProbe', 'hasPotentialIntakeAlerts'],
      delegatedIn8O9dLite: ['collectIntakeRowsForAlertProbe'],
      delegatedIn8O9f: ['buildEstimatedIntakeCalculationModel jako czysty model w vilda_estimated_intake.js z wrapperem/fallbackiem app.js'],
      delegatedIn8Q7: ['commitEstimatedIntakeCalcModelWindowState', 'clearEstimatedIntakeWindowState', 'commitEstimatedIntakeWindowState', 'runEstimatedIntakePostRenderRisk jako runtime adapter w vilda_estimated_intake_runtime.js'],
      keepInAppJsForNow: ['calcEstimatedIntake', 'setupEstimatedIntake', 'intakeAddRow', 'hasPotentialIntakeAlerts', 'JSON rehydration', 'advanced growth ↔ estimated intake sync'],
      seamPreparedIn8O9e: ['buildEstimatedIntakeCalcInputModel', 'buildEstimatedIntakeLastObservedModel', 'buildEstimatedIntakeWindowHistory', 'commitEstimatedIntakeWindowState', 'clearEstimatedIntakeWindowState', 'vildaGetEstimatedIntakeCalcSeamSnapshot'],
      calcModelDelegatedIn8O9f: ['buildEstimatedIntakeCalculationModel'],
      runtimeDelegatedIn8Q7: ['window-state commit', 'post-render risk checks'],
      inputModelDelegatedIn8Q8: ['buildEstimatedIntakeCalcInputModel', 'buildEstimatedIntakeLastObservedModel', 'buildEstimatedIntakeHistoryForRisk', 'getVildaEstimatedIntakeCalculationModelDependencies jako adapter DI w vilda_estimated_intake_input_model.js'],
      nextStep: '8Q-9'
    },
    errors
  };

  if (opts.includeRows === true) {
    snapshot.rows = rows;
    snapshot.readIntakeRows = Array.isArray(readRows) ? readRows.map((row) => Object.assign({}, row)) : readRows;
  }

  if (opts.includeWindowState === true && root) {
    snapshot.windowState = {
      intakeHistory: Array.isArray(root.intakeHistory) ? root.intakeHistory.map((row) => Object.assign({}, row)) : root.intakeHistory,
      advancedGrowthMeasurements: root.advancedGrowthData && Array.isArray(root.advancedGrowthData.measurements)
        ? root.advancedGrowthData.measurements.map((row) => Object.assign({}, row))
        : null
    };
  }

  return snapshot;
}

try {
  if (typeof window !== 'undefined') {
    window.vildaGetEstimatedIntakeAuditSnapshot = vildaGetEstimatedIntakeAuditSnapshot;
    window.vildaGetEstimatedIntakeAlertProbeAuditSnapshot = vildaGetEstimatedIntakeAlertProbeAuditSnapshot;
    window.vildaGetEstimatedIntakeCalcSeamSnapshot = vildaGetEstimatedIntakeCalcSeamSnapshot;
    window.vildaGetEstimatedIntakeCalculationModelSnapshot = vildaGetEstimatedIntakeCalculationModelSnapshot;
  }
} catch (_) {
  if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
    globalThis.vildaLogSwallowedCatch('app.js', _, { step: '8O-9f', helper: 'vildaGetEstimatedIntakeAuditSnapshot:expose' });
  }
}


function _getAdvIntakeRowOperationOptions(options){
  const base = _getAdvIntakeHelperOptions(options || {});
  base.global = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
  base.pairRows = _pairAdvancedAndIntakeRowsByOrder;
  base.findAdvancedRowBySyncId = _findAdvRowBySyncId;
  base.findIntakeHistoryRowBySyncId = _findIntakeHistoryRowBySyncId;
  return Object.assign(base, options || {});
}

function _syncAdvRowToIntake(advRow, options){
  const delegatedOptions = _getAdvIntakeRowOperationOptions(Object.assign({}, options || {}, {
    onAfterSync: function(){
      try { if (typeof debouncedIntakeCalc === 'function') debouncedIntakeCalc(); } catch (_) {
        if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
          globalThis.vildaLogSwallowedCatch('app.js', _, { step: '8O-8d', helper: '_syncAdvRowToIntake:onAfterSync' });
        }
      }
    }
  }));

  return _callAdvIntakeHelper('syncAdvancedIntakeAdvancedRowToHistoryRow', [advRow, delegatedOptions], () => {
    const opts = options || {};
    if (_isAdvIntakeSyncSuspended()) return;
    if (!advRow) return;

    let syncId = _getAdvIntakeSyncId(advRow);
    if (!syncId && !opts.skipPairing) {
      _pairAdvancedAndIntakeRowsByOrder();
      syncId = _getAdvIntakeSyncId(advRow);
    }
    const target = _findIntakeHistoryRowBySyncId(syncId);
    if (!target) return;

    const yEl = advRow.querySelector('.adv-age-years');
    const mEl = advRow.querySelector('.adv-age-months');
    const yRaw = _getRawInputValue(yEl);
    const mRaw = _getRawInputValue(mEl);
    const yVal = yEl ? parseFloat(yEl.value) : NaN;
    const mVal = mEl ? parseFloat(mEl.value) : NaN;
    const h = parseFloat(advRow.querySelector('.adv-height')?.value);
    const w = parseFloat(advRow.querySelector('.adv-weight')?.value);

    const setText = (sel, value) => {
      const el = target.querySelector(sel);
      if (!el) return;
      el.value = (value === '' || value === null || value === undefined || Number.isNaN(value)) ? '' : String(value);
    };

    if (yRaw !== '' || mRaw !== '') {
      let yyOut = (yRaw === '' || Number.isNaN(yVal)) ? '' : yVal;
      let mmOut = (mRaw === '' || Number.isNaN(mVal)) ? '' : Math.round(mVal);
      if (mmOut !== '' && mmOut >= 12) {
        const baseYears = (yyOut === '' || Number.isNaN(Number(yyOut))) ? 0 : Number(yyOut);
        yyOut = baseYears + Math.floor(Number(mmOut) / 12);
        mmOut = Number(mmOut) % 12;
      }
      setText('.intake-ageY', yyOut);
      setText('.intake-ageM', mmOut);
    } else {
      setText('.intake-ageY', '');
      setText('.intake-ageM', '');
    }

    setText('.intake-ht', h);
    setText('.intake-wt', w);

    try { if (typeof debouncedIntakeCalc === 'function') debouncedIntakeCalc(); } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', _, { line: 29956 });
      }
    }
  });
}

function _syncIntakeRowToAdv(intakeRow, options){
  const delegatedOptions = _getAdvIntakeRowOperationOptions(Object.assign({}, options || {}, {
    onAfterSync: function(){
      try { if (typeof calculateGrowthAdvanced === 'function') calculateGrowthAdvanced(); } catch (_) {
        if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
          globalThis.vildaLogSwallowedCatch('app.js', _, { step: '8O-8d', helper: '_syncIntakeRowToAdv:onAfterSync' });
        }
      }
    }
  }));

  return _callAdvIntakeHelper('syncAdvancedIntakeHistoryRowToAdvancedRow', [intakeRow, delegatedOptions], () => {
    const opts = options || {};
    if (_isAdvIntakeSyncSuspended()) return;
    if (!intakeRow || intakeRow.dataset.locked === 'true') return;

    let syncId = _getAdvIntakeSyncId(intakeRow);
    if (!syncId && !opts.skipPairing) {
      _pairAdvancedAndIntakeRowsByOrder();
      syncId = _getAdvIntakeSyncId(intakeRow);
    }
    const advRow = _findAdvRowBySyncId(syncId);
    if (!advRow) return;

    const yEl = intakeRow.querySelector('.intake-ageY');
    const mEl = intakeRow.querySelector('.intake-ageM');
    const yRaw = _getRawInputValue(yEl);
    const mRaw = _getRawInputValue(mEl);
    const y = yEl ? parseFloat(yEl.value) : NaN;
    const m = mEl ? parseFloat(mEl.value) : NaN;
    const h = parseFloat(intakeRow.querySelector('.intake-ht')?.value);
    const w = parseFloat(intakeRow.querySelector('.intake-wt')?.value);

    const setVal = (sel, value) => {
      const el = advRow.querySelector(sel);
      if (!el) return;
      el.value = (value === '' || value === null || value === undefined || Number.isNaN(value)) ? '' : String(value);
    };

    if (yRaw === '' && mRaw === '') {
      setVal('.adv-age-years', '');
      setVal('.adv-age-months', '');
    } else {
      let yrsOut = (yRaw === '' || Number.isNaN(y)) ? '' : y;
      let mosOut = (mRaw === '' || Number.isNaN(m)) ? '' : Math.round(m);
      if (mosOut !== '' && mosOut >= 12) {
        const baseYears = (yrsOut === '' || Number.isNaN(Number(yrsOut))) ? 0 : Number(yrsOut);
        yrsOut = baseYears + Math.floor(Number(mosOut) / 12);
        mosOut = Number(mosOut) % 12;
      }
      setVal('.adv-age-years', yrsOut);
      setVal('.adv-age-months', mosOut);
    }

    setVal('.adv-height', h);
    setVal('.adv-weight', w);

    try { if (typeof calculateGrowthAdvanced === 'function') calculateGrowthAdvanced(); } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', _, { line: 30005 });
      }
    }
  });
}

function _copyValueIfTargetEmpty(targetEl, value) {
  return _callAdvIntakeHelper('copyAdvancedIntakeValueIfTargetEmpty', [targetEl, value], () => {
    if (!targetEl) return false;
    if (String(targetEl.value ?? '').trim() !== '') return false;
    if (value === null || value === undefined || value === '' || Number.isNaN(value)) return false;
    targetEl.value = String(value);
    return true;
  });
}

function _backfillIntakeRowFromAdv(advRow, intakeRow) {
  return _callAdvIntakeHelper('backfillAdvancedIntakeHistoryRowFromAdvancedRow', [advRow, intakeRow], () => {
    if (!advRow || !intakeRow) return false;
    const advAgeY = parseFloat(advRow.querySelector('.adv-age-years')?.value);
    const advAgeM = parseFloat(advRow.querySelector('.adv-age-months')?.value);
    const advHeight = parseFloat(advRow.querySelector('.adv-height')?.value);
    const advWeight = parseFloat(advRow.querySelector('.adv-weight')?.value);
    let changed = false;
    changed = _copyValueIfTargetEmpty(intakeRow.querySelector('.intake-ageY'), Number.isNaN(advAgeY) ? '' : advAgeY) || changed;
    changed = _copyValueIfTargetEmpty(intakeRow.querySelector('.intake-ageM'), Number.isNaN(advAgeM) ? '' : Math.round(advAgeM)) || changed;
    changed = _copyValueIfTargetEmpty(intakeRow.querySelector('.intake-ht'), Number.isNaN(advHeight) ? '' : advHeight) || changed;
    changed = _copyValueIfTargetEmpty(intakeRow.querySelector('.intake-wt'), Number.isNaN(advWeight) ? '' : advWeight) || changed;
    return changed;
  });
}

function _backfillAdvRowFromIntake(intakeRow, advRow) {
  return _callAdvIntakeHelper('backfillAdvancedIntakeAdvancedRowFromHistoryRow', [intakeRow, advRow], () => {
    if (!intakeRow || !advRow) return false;
    const intakeAgeY = parseFloat(intakeRow.querySelector('.intake-ageY')?.value);
    const intakeAgeM = parseFloat(intakeRow.querySelector('.intake-ageM')?.value);
    const intakeHeight = parseFloat(intakeRow.querySelector('.intake-ht')?.value);
    const intakeWeight = parseFloat(intakeRow.querySelector('.intake-wt')?.value);
    let changed = false;
    changed = _copyValueIfTargetEmpty(advRow.querySelector('.adv-age-years'), Number.isNaN(intakeAgeY) ? '' : intakeAgeY) || changed;
    changed = _copyValueIfTargetEmpty(advRow.querySelector('.adv-age-months'), Number.isNaN(intakeAgeM) ? '' : Math.round(intakeAgeM)) || changed;
    changed = _copyValueIfTargetEmpty(advRow.querySelector('.adv-height'), Number.isNaN(intakeHeight) ? '' : intakeHeight) || changed;
    changed = _copyValueIfTargetEmpty(advRow.querySelector('.adv-weight'), Number.isNaN(intakeWeight) ? '' : intakeWeight) || changed;
    return changed;
  });
}


function _getAdvIntakePairingOptions(options){
  const base = _getAdvIntakeRowOperationOptions(options || {});
  base.isSuspended = _isAdvIntakeSyncSuspended;
  base.runWithSyncSuspended = _runWithAdvIntakeSyncSuspended;
  base.nextSyncId = _nextAdvIntakeSyncId;
  base.updateIntakeFirstRowFromUserBasics = _updateIntakeFirstRowFromUserBasics;
  base.pruneDuplicateCurrentHistoryRows = _pruneDuplicateCurrentHistoryRows;
  base.pruneBlankAdvancedRows = _pruneBlankAdvancedRows;
  base.pruneBlankIntakeHistoryRows = _pruneBlankIntakeHistoryRows;
  base.ensureAtLeastOneAdvancedHistoryRow = _ensureAtLeastOneAdvancedHistoryRow;
  base.ensureAtLeastOneIntakeHistoryRow = _ensureAtLeastOneIntakeHistoryRow;
  base.addAdvancedRow = (typeof addAdvMeasurementRow === 'function') ? addAdvMeasurementRow : null;
  base.addIntakeRow = (typeof intakeAddRow === 'function') ? intakeAddRow : null;
  base.backfillIntakeRowFromAdv = _backfillIntakeRowFromAdv;
  base.backfillAdvRowFromIntake = _backfillAdvRowFromIntake;
  base.syncAdvRowToIntake = _syncAdvRowToIntake;
  base.syncIntakeRowToAdv = _syncIntakeRowToAdv;
  base.refreshRowUi = _refreshAdvIntakeRowUi;
  base.calculateGrowthAdvanced = (typeof calculateGrowthAdvanced === 'function') ? calculateGrowthAdvanced : null;
  base.debouncedIntakeCalc = (typeof debouncedIntakeCalc === 'function') ? debouncedIntakeCalc : null;
  return Object.assign(base, options || {});
}

function _getAdvIntakeHandlerOptions(options){
  const base = _getAdvIntakePairingOptions(options || {});
  base.pairRows = _pairAdvancedAndIntakeRowsByOrder;
  base.getAdvancedRows = _advRows;
  base.getIntakeHistoryRows = _getIntakeHistoryRows;
  base.isProtectedAdvancedHistoryRow = _isProtectedAdvancedHistoryRow;
  base.isProtectedIntakeHistoryRow = _isProtectedIntakeHistoryRow;
  base.findAdvancedRowBySyncId = _findAdvRowBySyncId;
  base.findIntakeHistoryRowBySyncId = _findIntakeHistoryRowBySyncId;
  return Object.assign(base, options || {});
}

function _getAdvIntakeLiveWiringOptions(options){
  const base = _getAdvIntakeHandlerOptions(options || {});
  base.global = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
  base.document = (typeof document !== 'undefined') ? document : null;
  base.updateIntakeFirstRowFromUserBasics = _updateIntakeFirstRowFromUserBasics;
  base.refreshRowUi = _refreshAdvIntakeRowUi;
  base.debouncedIntakeCalc = (typeof debouncedIntakeCalc === 'function') ? debouncedIntakeCalc : null;
  base.syncAdvRowToIntake = _syncAdvRowToIntake;
  base.syncIntakeRowToAdv = _syncIntakeRowToAdv;
  base.pairRows = _pairAdvancedAndIntakeRowsByOrder;
  base.handleAdvancedMeasurementAdd = handleAdvancedMeasurementAdd;
  base.handleIntakeHistoryAdd = handleIntakeHistoryAdd;
  base.handleAdvancedMeasurementRowRemove = handleAdvancedMeasurementRowRemove;
  base.handleIntakeHistoryRowRemove = handleIntakeHistoryRowRemove;
  base.setTimeout = (typeof window !== 'undefined' && typeof window.setTimeout === 'function') ? window.setTimeout.bind(window) : null;
  return Object.assign(base, options || {});
}

function setupAdvancedIntakeLiveWiring(options){
  return _callAdvIntakeHelper('setupAdvancedIntakeLiveWiring', [_getAdvIntakeLiveWiringOptions(options)], () => {
    const liveCb = () => {
      _updateIntakeFirstRowFromUserBasics();
      _refreshAdvIntakeRowUi();
      try { if (typeof debouncedIntakeCalc === 'function') debouncedIntakeCalc(); } catch (_) {
        if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
          globalThis.vildaLogSwallowedCatch('app.js', _, { step: '8O-8f', helper: 'setupAdvancedIntakeLiveWiring:liveCb' });
        }
      }
    };

    ['age','ageMonths','weight','height','sex'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', liveCb);
        el.addEventListener('change', liveCb);
      }
    });

    const advWrap = document.getElementById('advMeasurements');
    if (advWrap) {
      const handleAdvInput = (e) => {
        if (!e.target.matches('.adv-age-years,.adv-age-months,.adv-height,.adv-weight')) return;
        const row = e.target.closest('.measure-row');
        if (row) _syncAdvRowToIntake(row);
      };
      advWrap.addEventListener('input', handleAdvInput);
      advWrap.addEventListener('change', handleAdvInput);
    }

    const intkWrap = document.getElementById('intakeMeasurements');
    if (intkWrap) {
      const handleIntakeInput = (e) => {
        if (!e.target.matches('.intake-ageY,.intake-ageM,.intake-ht,.intake-wt')) return;
        const row = e.target.closest('.measure-row-intake');
        if (row && row.dataset.locked !== 'true') _syncIntakeRowToAdv(row);
      };
      intkWrap.addEventListener('input', handleIntakeInput);
      intkWrap.addEventListener('change', handleIntakeInput);
    }

    window.setTimeout(() => {
      _pairAdvancedAndIntakeRowsByOrder();
      try { if (typeof debouncedIntakeCalc === 'function') debouncedIntakeCalc(); } catch (_) {
        if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
          globalThis.vildaLogSwallowedCatch('app.js', _, { step: '8O-8f', helper: 'setupAdvancedIntakeLiveWiring:initial' });
        }
      }
    }, 0);

    try {
      if (typeof window !== 'undefined') {
        window.vildaHandleAdvancedMeasurementAdd = handleAdvancedMeasurementAdd;
        window.vildaHandleIntakeHistoryAdd = handleIntakeHistoryAdd;
        window.vildaHandleAdvancedMeasurementRowRemove = handleAdvancedMeasurementRowRemove;
        window.vildaHandleIntakeHistoryRowRemove = handleIntakeHistoryRowRemove;
        window.vildaEnsureAdvancedIntakePairing = _pairAdvancedAndIntakeRowsByOrder;
      }
    } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', _, { step: '8O-8f', helper: 'setupAdvancedIntakeLiveWiring:expose' });
      }
    }

    return { step: '8O-8f', wired: true, fallback: true };
  });
}


function _pairAdvancedAndIntakeRowsByOrder(options){
  return _callAdvIntakeHelper('pairAdvancedIntakeRowsByOrder', [_getAdvIntakePairingOptions(options)], () => {
  if (_isAdvIntakeSyncSuspended()) return;
  if (!document.getElementById('advMeasurements') || !document.getElementById('intakeMeasurements')) {
    _refreshAdvIntakeRowUi();
    return;
  }

  let mutated = false;

  _runWithAdvIntakeSyncSuspended(() => {
    _updateIntakeFirstRowFromUserBasics();
    mutated = _pruneDuplicateCurrentHistoryRows() || mutated;
    mutated = _pruneBlankAdvancedRows() || mutated;
    mutated = _pruneBlankIntakeHistoryRows() || mutated;

    const advBeforeEnsure = _advRows().length;
    const intakeBeforeEnsure = _getIntakeHistoryRows().length;
    _ensureAtLeastOneAdvancedHistoryRow();
    _ensureAtLeastOneIntakeHistoryRow();
    if (_advRows().length !== advBeforeEnsure || _getIntakeHistoryRows().length !== intakeBeforeEnsure) {
      mutated = true;
    }

    while (_advRows().length < _getIntakeHistoryRows().length) {
      if (typeof addAdvMeasurementRow !== 'function') break;
      addAdvMeasurementRow();
      mutated = true;
    }
    while (_getIntakeHistoryRows().length < _advRows().length) {
      if (typeof intakeAddRow !== 'function') break;
      intakeAddRow();
      mutated = true;
    }

    const advRows = _advRows();
    const intakeHistoryRows = _getIntakeHistoryRows();
    const pairCount = Math.max(advRows.length, intakeHistoryRows.length);

    for (let i = 0; i < pairCount; i += 1) {
      const advRow = advRows[i];
      const intakeRow = intakeHistoryRows[i];
      const syncId = _getAdvIntakeSyncId(advRow) || _getAdvIntakeSyncId(intakeRow) || _nextAdvIntakeSyncId();
      _setAdvIntakeSyncId(advRow, syncId);
      _setAdvIntakeSyncId(intakeRow, syncId);
    }

    for (let i = 0; i < pairCount; i += 1) {
      const advRow = advRows[i];
      const intakeRow = intakeHistoryRows[i];
      if (!advRow || !intakeRow) continue;

      _backfillIntakeRowFromAdv(advRow, intakeRow);
      _backfillAdvRowFromIntake(intakeRow, advRow);

      if (_advRowHasAnyData(advRow) && !_intakeRowHasAnyData(intakeRow)) {
        _syncAdvRowToIntake(advRow, { skipPairing: true });
      } else if (_intakeRowHasAnyData(intakeRow) && !_advRowHasAnyData(advRow)) {
        _syncIntakeRowToAdv(intakeRow, { skipPairing: true });
      }
    }
  });

  _refreshAdvIntakeRowUi();
  if (mutated) {
    try { if (typeof calculateGrowthAdvanced === 'function') calculateGrowthAdvanced(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 30104 });
    }
  }
    try { if (typeof debouncedIntakeCalc === 'function') debouncedIntakeCalc(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 30105 });
    }
  }
  }
  });
}

function handleAdvancedMeasurementRowRemove(row){
  return _callAdvIntakeHelper('handleAdvancedIntakeAdvancedMeasurementRowRemove', [row, _getAdvIntakeHandlerOptions()], () => {
  if (!row || _isProtectedAdvancedHistoryRow(row)) {
    _refreshAdvIntakeRowUi();
    return false;
  }

  const syncId = _getAdvIntakeSyncId(row);

  _runWithAdvIntakeSyncSuspended(() => {
    const twin = _findIntakeHistoryRowBySyncId(syncId);
    if (twin) twin.remove();
    row.remove();

    if (!_advRows().length && typeof addAdvMeasurementRow === 'function') addAdvMeasurementRow();
    if (!_getIntakeHistoryRows().length && typeof intakeAddRow === 'function') intakeAddRow();
  });

  _pairAdvancedAndIntakeRowsByOrder();
  try { if (typeof calculateGrowthAdvanced === 'function') calculateGrowthAdvanced(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 30127 });
    }
  }
  try { if (typeof debouncedIntakeCalc === 'function') debouncedIntakeCalc(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 30128 });
    }
  }
  return true;

  });
}

function handleIntakeHistoryRowRemove(row){
  return _callAdvIntakeHelper('handleAdvancedIntakeHistoryRowRemove', [row, _getAdvIntakeHandlerOptions()], () => {
  if (!row || row.dataset.locked === 'true' || _isProtectedIntakeHistoryRow(row)) {
    _refreshAdvIntakeRowUi();
    return false;
  }

  const syncId = _getAdvIntakeSyncId(row);

  _runWithAdvIntakeSyncSuspended(() => {
    const twin = _findAdvRowBySyncId(syncId);
    if (twin) twin.remove();
    row.remove();

    if (!_getIntakeHistoryRows().length && typeof intakeAddRow === 'function') intakeAddRow();
    if (!_advRows().length && typeof addAdvMeasurementRow === 'function') addAdvMeasurementRow();
  });

  _pairAdvancedAndIntakeRowsByOrder();
  try { if (typeof calculateGrowthAdvanced === 'function') calculateGrowthAdvanced(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 30150 });
    }
  }
  try { if (typeof debouncedIntakeCalc === 'function') debouncedIntakeCalc(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 30151 });
    }
  }
  return true;

  });
}

function handleAdvancedMeasurementAdd(){
  return _callAdvIntakeHelper('handleAdvancedIntakeAdvancedMeasurementAdd', [_getAdvIntakeHandlerOptions()], () => {
  _pairAdvancedAndIntakeRowsByOrder();

  // Zachowuj się tak samo jak karta podstawowych obliczeń wzrostowych:
  // każde kliknięcie „Dodaj kolejny pomiar” ma realnie dodawać nowy wiersz,
  // nawet jeśli poprzedni jest jeszcze pusty.
  const syncId = _nextAdvIntakeSyncId();

  _runWithAdvIntakeSyncSuspended(() => {
    if (typeof addAdvMeasurementRow === 'function') addAdvMeasurementRow();
    if (typeof intakeAddRow === 'function') intakeAddRow();
  });

  const advRow = _advRows()[_advRows().length - 1];
  const intakeRow = _getIntakeHistoryRows()[_getIntakeHistoryRows().length - 1];
  _setAdvIntakeSyncId(advRow, syncId);
  _setAdvIntakeSyncId(intakeRow, syncId);

  _refreshAdvIntakeRowUi();
  try { if (typeof calculateGrowthAdvanced === 'function') calculateGrowthAdvanced(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 30174 });
    }
  }
  try { if (typeof debouncedIntakeCalc === 'function') debouncedIntakeCalc(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 30175 });
    }
  }
  return true;

  });
}

function handleIntakeHistoryAdd(){
  return _callAdvIntakeHelper('handleAdvancedIntakeHistoryAdd', [_getAdvIntakeHandlerOptions()], () => {
  _pairAdvancedAndIntakeRowsByOrder();

  // Lustrzane zachowanie dla sekcji szacowanego spożycia energii, która jest
  // sprzężona 1:1 z zaawansowaną historią wzrastania.
  const syncId = _nextAdvIntakeSyncId();

  _runWithAdvIntakeSyncSuspended(() => {
    if (typeof intakeAddRow === 'function') intakeAddRow();
    if (typeof addAdvMeasurementRow === 'function') addAdvMeasurementRow();
  });

  const intakeRow = _getIntakeHistoryRows()[_getIntakeHistoryRows().length - 1];
  const advRow = _advRows()[_advRows().length - 1];
  _setAdvIntakeSyncId(intakeRow, syncId);
  _setAdvIntakeSyncId(advRow, syncId);

  _refreshAdvIntakeRowUi();
  try { if (typeof calculateGrowthAdvanced === 'function') calculateGrowthAdvanced(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 30197 });
    }
  }
  try { if (typeof debouncedIntakeCalc === 'function') debouncedIntakeCalc(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 30198 });
    }
  }
  return true;

  });
}

/* ---------- non-invasive wiring ---------- */
window.vildaAppOnReady('app:intake-live-wiring', function initIntakeLiveWiring() {
  setupAdvancedIntakeLiveWiring();
});

window.vildaAppOnReady('app:initial-update', function runInitialUpdate() {
  if (typeof update === 'function') update();
});

function animateValue(el, end, unit=''){
  if(!el) return;
  const start = 0;
  const duration = 600;
  if(!vildaShouldAnimateNumbers()){
    const finalVal = Number(end || 0).toFixed(1).replace('.', ',');
    el.textContent = finalVal + unit;
    return;
  }
  const startTime = performance.now();
    function step(now){
    const t = Math.min((now - startTime)/duration, 1);
    const val = (start + (end - start)*t).toFixed(1);
    // Replace decimal point with comma for display
    el.textContent = val.replace('.', ',') + unit;
    if(t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function createScaleIcon(){
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns,'svg');
  svg.setAttribute('viewBox','0 0 24 24');
  svg.setAttribute('width','20');
  svg.setAttribute('height','20');
  svg.setAttribute('aria-hidden','true');
  svg.style.marginRight='0.35rem';
  const path = document.createElementNS(ns,'path');
  path.setAttribute('stroke','currentColor');
  path.setAttribute('stroke-linecap','round');
  path.setAttribute('stroke-linejoin','round');
  path.setAttribute('stroke-width','1.8');
  path.setAttribute('d','M6 8h12M6 8a6 6 0 006 6 6 6 0 006-6M6 8v8a6 6 0 006 6 6 6 0 006-6V8');
  svg.appendChild(path);
  return svg;
}

window.vildaAppOnReady('app:result-box-enhancement-observer', function initResultBoxEnhancementObserver(){
  const resultObserverRoots = [];
  ['results', 'advancedGrowthSection'].forEach(id=>{
    const root = document.getElementById(id);
    if(root && resultObserverRoots.indexOf(root) < 0) resultObserverRoots.push(root);
  });
  if(!resultObserverRoots.length || typeof MutationObserver === 'undefined') return;

  const observer = new MutationObserver((mutations)=>{
    mutations.forEach(m=>{
      m.addedNodes.forEach(node=>{
        if(node.nodeType===1 && node.classList.contains('result-box')){
            enhanceResult(node);
        }
      });
    });
  });
  resultObserverRoots.forEach(root=>observer.observe(root,{childList:true,subtree:true}));

  function enhanceResult(box){
     if(box.dataset.enhanced) return;
     box.dataset.enhanced = '1';
     box.classList.add('result-card','animate-in','--pulse');
     const strong = box.querySelector('strong');
     if(!strong) return;
     // prepend icon
     strong.prepend(createScaleIcon());
     const match = strong.textContent.match(/BMI:?\s*([\d.,]+)/i);
     if(match){
        const numVal = parseFloat(match[1].replace(',','.'));
        const span = document.createElement('span');
        span.className = 'result-number';
        span.textContent = match[1];
        vildaAppReplaceFirstText(strong, match[1], span, 'app:result-number');
        const numEl = strong.querySelector('.result-number');
        animateValue(numEl, numVal);
     }
     // NEW: apply pulse animation based on BMI severity. If the result box has
     // class .bmi-danger (Otyłość) or .bmi-warning (Niedowaga/Nadwaga), apply the
     // corresponding pulse effect.
     if (box.classList.contains('bmi-danger')) {
        applyPulse(box, 'danger');
     } else if (box.classList.contains('bmi-warning')) {
        applyPulse(box, 'warning');
     }
  }
});

/* === APPLY DATA CARD STYLE TO SPECIFIC TABLES === */
window.vildaAppOnReady('app:data-card-style', function initDataCardStyle(){
  ['toNormCard','dietPlanCard'].forEach(id=>{
    const card=document.getElementById(id);
    if(card){
      card.classList.add('result-card','animate-in');
    }
  });
  document.querySelectorAll('#toNormCard table, #dietPlanCard table').forEach(t=>{
    t.classList.add('data-card');
  });
});

// WHO 2007 BMI-for-age LMS tables (months 24‑228) – generated 2025‑06‑30

// Derived percentiles P5, P85, P95 for quick lookup

// Replace helper functions to use these tables

// Oblicz z‑score BMI dla dzieci – z obsługą rozszerzonych danych Palczewskiej.
function bmiZscore(bmi, sex, months){
  // Jeśli wybrano Palczewską, oblicz z‑score na podstawie jej siatek centylowych
  if (typeof bmiSource !== 'undefined' && bmiSource === 'PALCZEWSKA') {
    const ageYears = months / 12;
    const stats = calcPercentileStatsPal(bmi, sex, ageYears, 'BMI');
    return stats ? stats.sd : null;
  }
  // W pozostałych przypadkach użyj LMS (WHO/OLAF)
  const lms = getLMS(sex, months);
  if(!lms) return null;
  const [L,M,S] = lms;
  return (L!==0) ? (Math.pow(bmi/M, L)-1)/(L*S) : Math.log(bmi/M)/S;
}

// Oblicz percentyl BMI dla dzieci z uwzględnieniem Palczewskiej
function bmiPercentileChild(bmi, sex, months){
  // Palczewska: interpolacja percentyla z rozszerzonych danych
  if (typeof bmiSource !== 'undefined' && bmiSource === 'PALCZEWSKA') {
    return bmiPercentileChildPal(bmi, sex, months);
  }
  const z = bmiZscore(bmi, sex, months);
  return z===null ? null : normalCDF(z)*100;
}

// Klasyfikacja BMI u dzieci (niedowaga/prawidłowe/nadwaga/otyłość) z obsługą Palczewskiej
function bmiCategoryChild(bmi, sex, months){
  /*
   * Ustal, czy stosować polskie progi centylowe (OLAF/Palczewska) dla BMI.
   * Zgodnie z dotychczasową logiką, wykorzystujemy progi OLAF/Palczewska
   * dopiero od 3. roku życia (>=36 mies.), gdy istnieją referencyjne centyle.
   * Dla młodszych dzieci (<36 mies.) zawsze stosujemy progi WHO.
   */
  const useOlaf = (typeof bmiSource !== 'undefined' &&
                   (bmiSource === 'OLAF' || bmiSource === 'PALCZEWSKA') &&
                   months >= OLAF_DATA_MIN_AGE * 12);
  const p = bmiPercentileChild(bmi, sex, months);
  // 8O-10b: brak percentyla dziecięcego nie może przechodzić na progi BMI dorosłych.
  if (p === null || !isFinite(Number(p))) {
    return PEDIATRIC_BMI_CLASSIFICATION_UNAVAILABLE_LABEL;
  }
  const z = bmiZscore(bmi, sex, months);
  return vildaResolvePediatricBmiCategoryFromPercentile(p, { useOlaf, zScore: z });
}
// Infant LMS tables (0–60 mies.)
const LMS_INFANT_BOYS = VILDA_GROWTH_REFERENCE_DATA.LMS_INFANT_BOYS || {};
const LMS_INFANT_GIRLS = VILDA_GROWTH_REFERENCE_DATA.LMS_INFANT_GIRLS || {};

// Infant percentiles (P5, P85, P95)
const bmiInfantBoys = VILDA_GROWTH_REFERENCE_DATA.bmiInfantBoys || {};
const bmiInfantGirls = VILDA_GROWTH_REFERENCE_DATA.bmiInfantGirls || {};

// Merge with existing bmiPercentiles, overriding duplicates 0–60 mies.
if(typeof bmiPercentiles !== 'undefined'){{
  Object.assign(bmiPercentiles.boys, bmiInfantBoys);
  Object.assign(bmiPercentiles.girls, bmiInfantGirls);
}}

function getLMS(sex, months){
  const m = Math.round(months);
  // Nie wymuszaj źródła danych dla niemowląt – użytkownik może wybrać WHO lub polskie dane.
  // 1) OLAF, jeżeli wybrany oraz zakres 36–216 mies.
  if(bmiSource === 'OLAF' && m >= 36 && m <= 216){
    const olaf = (sex==='M' ? OLAF_LMS_BOYS[m] : OLAF_LMS_GIRLS[m]);
    if(olaf) return olaf;
  }

  // 2) WHO 0‑5 l. (infant) – m ≤ 60
  if(m <= 60){
    return (sex==='M' ? LMS_INFANT_BOYS[m] : LMS_INFANT_GIRLS[m]) || null;
  }

  // 3) WHO 5‑19 l. (domyślnie)
  return (sex==='M' ? LMS_BOYS[m] : LMS_GIRLS[m]) || null;
}
// bmiPercentileChild stays unchanged – it will now see infant LMS
(function(){
  const MEDIAN_ADULT_BMI = 22.0;
  const getMedianBMI = (age, sex) => {
    if(age >= CHILD_AGE_MIN && age <= CHILD_AGE_MAX){
      const lms = (typeof getLMS === 'function') ? getLMS(sex, Math.round(age*12)) : null;
      return lms ? lms[1] : MEDIAN_ADULT_BMI;
    }
    return MEDIAN_ADULT_BMI;
  };

  // 8O-10d-b/8O-10d-g: dotychczasowe wrappery po window.update
  // są stopniowo przenoszone do VildaUpdateHooks. Bridge pozostaje jeden,
  // a kolejne hooki są wykonywane przez registry z zachowaniem kolejności.
  const BMI50_AFTER_UPDATE_HOOK_ID = 'app:bmi50-info-after-update';
  const IDEAL_WEIGHT_AFTER_UPDATE_HOOK_ID = 'app:ideal-weight-ui-after-update';
  const APP_UPDATE_MIGRATED_WRAPPER_IDS_8O10DC = Object.freeze([
    BMI50_AFTER_UPDATE_HOOK_ID,
    IDEAL_WEIGHT_AFTER_UPDATE_HOOK_ID
  ]);

  function updateBmi50InfoAfterUpdate(context){
    const source = context && context.source ? String(context.source) : '';
    if (source && source !== 'window.update' && source !== 'window.update-fallback') {
      return { skipped: true, reason: 'non-window-update-context', source };
    }
    if (typeof document === 'undefined') {
      return { skipped: true, reason: 'document-unavailable' };
    }

    const weightEl = document.getElementById('weight');
    const heightEl = document.getElementById('height');
    const sexEl = document.getElementById('sex');
    const weight = weightEl ? (+weightEl.value || 0) : 0;
    const height = heightEl ? (+heightEl.value || 0) : 0;
    // Używamy wieku z uwzględnieniem miesięcy (0 oznacza brak danych)
    const age    = getAgeDecimal();
    const sex    = sexEl ? sexEl.value : '';

    if(!(weight > 0 && height > 0)) return { skipped: true, reason: 'incomplete-anthro' };

    // calculate kg to 50th percentile
    const targetBMI50 = getMedianBMI(age, sex);
    const targetWeight50 = targetBMI50 * Math.pow(height/CM_TO_M, 2);
    const kgTo50 = weight - targetWeight50;        // positive => need to lose

    // only show when there is weight to lose (>0.1 kg)
    if(kgTo50 <= 0.1) return { skipped: true, reason: 'kg-to-50-not-positive', kgTo50 };

    const toNormInfo = document.getElementById('toNormInfo');
    if(!toNormInfo) return { skipped: true, reason: 'toNormInfo-missing' };

    const box = toNormInfo.querySelector('.result-box');
    if(!box) return { skipped: true, reason: 'result-box-missing' };

    // check if element already exists
    let span = box.querySelector('.bmi50-info');
    if(!span){
      span = document.createElement('span');
      span.className = 'bmi50-info';
      span.style.display = 'block';
      span.style.fontSize = '0.95rem';
      span.style.marginTop = '4px';
      box.querySelector('strong')?.insertAdjacentElement('afterend', span);
    }
    // Zmieniamy separator dziesiętny na przecinek w wyświetlanej ilości kilogramów
    vildaAppSetTrustedHtml(span, `Do 50&nbsp;centyla BMI brakuje <strong>${kgTo50.toFixed(1).replace('.', ',')} kg</strong>`, 'app:span');
    return { skipped: false, kgTo50 };
  }

  let bmi50HookRegistered = false;
  let bmi50HookToken = null;
  if (typeof window !== 'undefined' && window.VildaUpdateHooks && typeof window.VildaUpdateHooks.registerAfterUpdateHook === 'function') {
    try {
      bmi50HookToken = window.VildaUpdateHooks.registerAfterUpdateHook(updateBmi50InfoAfterUpdate, {
        id: BMI50_AFTER_UPDATE_HOOK_ID,
        label: 'BMI p50 info after update',
        group: 'app-update-migrated-wrapper',
        order: 10,
        replace: true
      });
      bmi50HookRegistered = !!(bmi50HookToken && bmi50HookToken.ok === true);
    } catch (_) {
      bmi50HookRegistered = false;
    }
  }

  const prevUpdate = window.update;
  const vildaUpdateHooksBridge8O10dB = function vildaUpdateHooksBridge8O10dB(){
    if (typeof prevUpdate === 'function') {
      prevUpdate.apply(this, arguments);
    }
    if (typeof window !== 'undefined' && window.VildaUpdateHooks && typeof window.VildaUpdateHooks.runAfterUpdateHooks === 'function') {
      if (!bmi50HookRegistered) {
        updateBmi50InfoAfterUpdate({ source: 'window.update-fallback', step: '8O-10d-g', reason: 'bmi50-hook-not-registered' });
      }
      const hookRunResult = window.VildaUpdateHooks.runAfterUpdateHooks({
        source: 'window.update',
        step: '8O-10d-g',
        migratedWrapperId: BMI50_AFTER_UPDATE_HOOK_ID,
        migratedWrapperIds: APP_UPDATE_MIGRATED_WRAPPER_IDS_8O10DC.slice(),
        argumentsLength: arguments.length
      }, {
        source: 'app.js:window.update:8O-10d-g'
      });
      if (window.__vildaIdealWeightUIAfterUpdateHookRegistered !== true && typeof window.__vildaIdealWeightUIAfterUpdateFallback === 'function') {
        window.__vildaIdealWeightUIAfterUpdateFallback({ source: 'window.update-fallback', step: '8O-10d-g', reason: 'ideal-weight-hook-not-registered' });
      }
      return hookRunResult;
    }
    updateBmi50InfoAfterUpdate({ source: 'window.update-fallback', step: '8O-10d-g' });
    if (typeof window !== 'undefined' && typeof window.__vildaIdealWeightUIAfterUpdateFallback === 'function') {
      window.__vildaIdealWeightUIAfterUpdateFallback({ source: 'window.update-fallback', step: '8O-10d-g' });
    }
  };
  try {
    Object.defineProperties(vildaUpdateHooksBridge8O10dB, {
      __vildaUpdateHooksRegistryWrapper: { value: true, configurable: true },
      __vildaUpdateHooksBridgeStep: { value: '8O-10d-g', configurable: true },
      __vildaUpdateHooksMigratedWrapperId: { value: BMI50_AFTER_UPDATE_HOOK_ID, configurable: true },
      __vildaUpdateHooksMigratedWrapperIds: { value: APP_UPDATE_MIGRATED_WRAPPER_IDS_8O10DC.slice(), configurable: true },
      __vildaUpdateHooksPreviousUpdatePresent: { value: typeof prevUpdate === 'function', configurable: true }
    });
  } catch (_) {
    try { vildaUpdateHooksBridge8O10dB.__vildaUpdateHooksRegistryWrapper = true; } catch (__) {}
    try { vildaUpdateHooksBridge8O10dB.__vildaUpdateHooksBridgeStep = '8O-10d-g'; } catch (__) {}
    try { vildaUpdateHooksBridge8O10dB.__vildaUpdateHooksMigratedWrapperId = BMI50_AFTER_UPDATE_HOOK_ID; } catch (__) {}
    try { vildaUpdateHooksBridge8O10dB.__vildaUpdateHooksMigratedWrapperIds = APP_UPDATE_MIGRATED_WRAPPER_IDS_8O10DC.slice(); } catch (__) {}
    try { vildaUpdateHooksBridge8O10dB.__vildaUpdateHooksPreviousUpdatePresent = typeof prevUpdate === 'function'; } catch (__) {}
  }
  window.update = vildaUpdateHooksBridge8O10dB;
  window.__vildaUpdateHooksBridge8O10dB = vildaUpdateHooksBridge8O10dB;
  window.__vildaUpdateHooksBridge8O10dC = vildaUpdateHooksBridge8O10dB;
  window.__vildaUpdateHooksBridge8O10dD = vildaUpdateHooksBridge8O10dB;
  window.__vildaUpdateHooksBridge8O10dE = vildaUpdateHooksBridge8O10dB;
  window.__vildaUpdateHooksBridge8O10dF = vildaUpdateHooksBridge8O10dB;
  window.__vildaUpdateHooksBridge8O10dG = vildaUpdateHooksBridge8O10dB;
  window.__vildaUpdateHooksBridge8O10dBHookId = BMI50_AFTER_UPDATE_HOOK_ID;
  window.__vildaUpdateHooksBridge8O10dCHookIds = APP_UPDATE_MIGRATED_WRAPPER_IDS_8O10DC.slice();
  window.__vildaUpdateHooksBridge8O10dBHookRegistered = bmi50HookRegistered;

  window.vildaGetUpdateHooksBridgeSnapshot = function vildaGetUpdateHooksBridgeSnapshot(options){
    const opts = options || {};
    const registry = window.VildaUpdateHooks || null;
    let registrySnapshot = null;
    try {
      registrySnapshot = registry && typeof registry.getSnapshot === 'function'
        ? registry.getSnapshot({ includeSourcePreview: opts.includeSourcePreview === true })
        : null;
    } catch (_) {
      registrySnapshot = null;
    }
    const registeredHooks = registrySnapshot && Array.isArray(registrySnapshot.hooks) ? registrySnapshot.hooks : [];
    const migratedWrapperIds = APP_UPDATE_MIGRATED_WRAPPER_IDS_8O10DC.slice();
    const dietHookId = window.__vildaDietRecommendationsAfterUpdateHookId || 'diet:recommendations-visibility-after-update';
    if (dietHookId && migratedWrapperIds.indexOf(dietHookId) < 0) migratedWrapperIds.push(dietHookId);
    const nutritionNormsHookId = window.__vildaNutritionNormsAfterUpdateHookId || null;
    if (nutritionNormsHookId && migratedWrapperIds.indexOf(nutritionNormsHookId) < 0) migratedWrapperIds.push(nutritionNormsHookId);
    const nutritionMicrosHookId = window.__vildaNutritionMicrosAfterUpdateHookId || null;
    if (nutritionMicrosHookId && migratedWrapperIds.indexOf(nutritionMicrosHookId) < 0) migratedWrapperIds.push(nutritionMicrosHookId);
    const migratedHooks = migratedWrapperIds.map(function(id){
      const hook = registeredHooks.find(function(item){ return item && item.id === id; }) || null;
      return hook ? {
        id: hook.id,
        label: hook.label,
        group: hook.group,
        order: hook.order,
        runs: hook.runs,
        failures: hook.failures
      } : { id: id, missing: true };
    });
    const bmiHook = migratedHooks.find(function(hook){ return hook && hook.id === BMI50_AFTER_UPDATE_HOOK_ID; }) || null;
    const idealHook = migratedHooks.find(function(hook){ return hook && hook.id === IDEAL_WEIGHT_AFTER_UPDATE_HOOK_ID; }) || null;
    const bridge = window.__vildaUpdateHooksBridge8O10dG || window.__vildaUpdateHooksBridge8O10dF || window.__vildaUpdateHooksBridge8O10dE || window.__vildaUpdateHooksBridge8O10dD || window.__vildaUpdateHooksBridge8O10dC || window.__vildaUpdateHooksBridge8O10dB || null;
    return {
      kind: 'vilda-update-hooks-bridge-snapshot',
      step: '8O-10d-g',
      readOnly: true,
      didCallWindowUpdate: false,
      didRunHooks: false,
      migratedWrapperId: BMI50_AFTER_UPDATE_HOOK_ID,
      migratedWrapperIds: migratedWrapperIds,
      migratedWrapperLabels: {
        'app:bmi50-info-after-update': 'BMI p50 info after update',
        'app:ideal-weight-ui-after-update': 'Ideal weight UI after update',
        'diet:recommendations-visibility-after-update': 'Diet recommendations visibility after update',
        'nutrition-norms:card-render-after-update': 'Nutrition norms card render after update',
        'nutrition-micros:card-render-after-update': 'Nutrition micros card render after update'
      },
      bridgeInstalled: typeof bridge === 'function' && bridge.__vildaUpdateHooksRegistryWrapper === true,
      bridgeStep: bridge && bridge.__vildaUpdateHooksBridgeStep || null,
      bridgePreviousUpdatePresent: !!(bridge && bridge.__vildaUpdateHooksPreviousUpdatePresent === true),
      finalWindowUpdatePresent: typeof window.update === 'function',
      finalWindowUpdateIsBridge: window.update === bridge,
      downstreamWrappersMayExist: typeof window.update === 'function' && window.update !== bridge,
      hookRegisteredAtInstall: bmi50HookRegistered,
      migratedHookRegistered: !!(bmiHook && !bmiHook.missing),
      idealWeightHookRegistered: !!(idealHook && !idealHook.missing),
      dietRecommendationsHookRegistered: migratedHooks.some(function(hook){ return hook && hook.id === dietHookId && hook.missing !== true; }),
      nutritionNormsHookRegistered: nutritionNormsHookId ? migratedHooks.some(function(hook){ return hook && hook.id === nutritionNormsHookId && hook.missing !== true; }) : null,
      nutritionMicrosHookRegistered: nutritionMicrosHookId ? migratedHooks.some(function(hook){ return hook && hook.id === nutritionMicrosHookId && hook.missing !== true; }) : null,
      allMigratedHooksRegistered: migratedHooks.every(function(hook){ return hook && hook.missing !== true; }),
      migratedHooks: migratedHooks,
      registry: registrySnapshot ? {
        version: registrySnapshot.version,
        step: registrySnapshot.step,
        registeredCount: registrySnapshot.registeredCount,
        migrationStatus: registrySnapshot.migrationStatus,
        migratedWrapperIds: registrySnapshot.migratedWrapperIds || [],
        appBridgeInstalled: registrySnapshot.appBridgeInstalled === true
      } : null,
      finalChainAudit: (opts.includeFinalChainAudit === true && window.VildaUpdateHooks && typeof window.VildaUpdateHooks.getFinalUpdateChainAuditSnapshot === 'function') ? window.VildaUpdateHooks.getFinalUpdateChainAuditSnapshot({ includeSourcePreview: false }) : null,
      nextStep: '8O-11a — IndexedDB cleanup albo dalsze porządki zasobowe'
    };
  };})();

(function(){
  function animateValue(el, end, unit=''){
    if(!el) return;
    const start = 0;
    const duration = 600;
    if(!vildaShouldAnimateNumbers()){
      el.textContent = Number(end || 0).toFixed(0) + unit;
      return;
    }
    const startTime = performance.now();
    function step(now){
      const t = Math.min((now - startTime)/duration, 1);
      const val = (start + (end - start)*t).toFixed(0);
      el.textContent = val + unit;
      if(t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ---- helper to patch plan table rows ---- */
  function enhancePlanTable(){
    const planResults = document.getElementById('planResults');
    if(!planResults) return;
    planResults.querySelectorAll('tr').forEach(row=>{
      const first = row.children[0]?.textContent.trim();
      if(first === 'Kg do redukcji' && !row.dataset.bold){
          vildaAppSetTrustedHtml(row.children[0], '<strong>Kg do redukcji</strong>', 'app:row-children-0');
          vildaAppSetTrustedHtml(row.children[1], '<strong>'+row.children[1].textContent+'</strong>', 'app:row-children-1');
          row.dataset.bold = '1';
      }
      if(first === 'Szacowany czas' && !row.dataset.enh){
          const match = row.children[1].textContent.match(/(\d+)\s*tyg/);
          if(match){
              const weeks = match[1];
              const restText = (row.children[1].textContent || '').split(/tyg/i).slice(1).join('tyg');
              const rest = restText ? vildaAppEscapeHtml(restText) : '';
              vildaAppSetTrustedHtml(row.children[1], '<strong><span class="plan-time" data-weeks="'+vildaAppEscapeAttr(weeks)+'">'+vildaAppEscapeHtml(weeks)+'</span> tyg'+rest+'</strong>', 'app:row-children-1');
          }
          row.dataset.enh = '1';
      }
    });
  }

  function animateNewNumbers(){
    const planResults = document.getElementById('planResults');
    if(!planResults) return;
    planResults.querySelectorAll('.plan-time').forEach(el=>{
        if(el.dataset.anim) return;
        el.dataset.anim='1';
        const val = parseFloat(el.dataset.weeks||el.textContent)||0;
        animateValue(el, val, '');
    });
    planResults.querySelectorAll('.bmi50-number').forEach(el=>{
        if(el.dataset.anim) return;
        el.dataset.anim='1';
        const val = parseFloat(el.dataset.val||el.textContent)||0;
        animateValue(el, val, '');
    });
  }

  /* ---- Observe mutations to trigger enhancements ---- */
  window.vildaAppOnReady('app:plan-table-enhancement-observer', function initPlanTableEnhancementObserver(){
    const planResultsRoot = document.getElementById('planResults');
    if(!planResultsRoot || typeof MutationObserver === 'undefined') return;
    const obs = new MutationObserver(()=>{
        enhancePlanTable();
        animateNewNumbers();
    });
    obs.observe(planResultsRoot,{childList:true,subtree:true});
  });

})();

(function(){
  function animateVal(el,end){
    if(!el) return;
    const dur=600;
    const decimals = end % 1 ? 1 : 0;
    if(!vildaShouldAnimateNumbers()){
      el.textContent = Number(end || 0).toFixed(decimals).replace('.', ',');
      return;
    }
    const startT=performance.now();
    function step(now){
      const t=Math.min((now-startT)/dur,1);
      // Formatowanie z przecinkiem jako separatorem dziesiętnym w animowanych wartościach
      const valStr = (end*t).toFixed(decimals);
      el.textContent = valStr.replace('.', ',');
      if(t<1)requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function transformPlan(){
    const planResults=document.getElementById('planResults');
    if(!planResults) return;
    planResults.querySelectorAll('.plan-col strong').forEach(st=>{
       if(st.dataset.sm50) return;
       const txt=st.textContent || '';
       if(/BMI\s*50/.test(txt)){
          st.textContent = txt.replace(/BMI\s*50(?:\.0)?/i,'BMI 50');
          st.dataset.sm50='1';
       }
    });
    planResults.querySelectorAll('tr').forEach(row=>{
       const label=row.children[0]?.textContent.trim();
       if(label==='Kg do redukcji' && !row.dataset.bold){
           vildaAppSetTrustedHtml(row.children[0], '<strong>Kg do redukcji</strong>', 'app:row-children-0');
           vildaAppSetTrustedHtml(row.children[1], '<strong>'+row.children[1].textContent+'</strong>', 'app:row-children-1');
           row.dataset.bold='1';
       }
       if(label==='Szacowany czas' && !row.dataset.enh){
           const weeksMatch=row.children[1].textContent.match(/(\d+)/);
           if(weeksMatch){
              const weeks=parseInt(weeksMatch[1]);
              // Obliczamy liczbę miesięcy i lat, zamieniając kropkę na przecinek dla wyświetlania
              const months = (weeks / 4.345).toFixed(1).replace('.', ',');
              const years  = ( (weeks / 4.345) / 12 ).toFixed(1).replace('.', ',');
              vildaAppSetTrustedHtml(row.children[1], '<strong>'
              +'<span class="plan-time" data-val="'+vildaAppEscapeAttr(weeks)+'">'+vildaAppEscapeHtml(weeks)+'</span> tyg<br>('
              +'<span class="plan-month" data-val="'+vildaAppEscapeAttr(months)+'">'+vildaAppEscapeHtml(months)+'</span> mies)<br>('
              +'<span class="plan-year" data-val="'+vildaAppEscapeAttr(years)+'">'+vildaAppEscapeHtml(years)+'</span> lat)'
              +'</strong>', 'app:plan-time-breakdown');
           }
           row.dataset.enh='1';
       }
    });
    planResults.querySelectorAll('.plan-time,.plan-month,.plan-year').forEach(el=>{
       if(el.dataset.animated) return;
       el.dataset.animated='1';
       animateVal(el, parseFloat(el.dataset.val||el.textContent.replace(',','.')));
    });
  }
  window.vildaAppOnReady('app:growth-data-source-toggle', function initGrowthDataSourceToggle() {
    // Obsługa zmian na trójpozycyjnym suwaku wyboru źródła danych
    const toggleContainer = document.getElementById('dataToggleContainer');
    if (toggleContainer) {
      const radios = toggleContainer.querySelectorAll('input[name="dataSource"]');
      radios.forEach(input => {
        input.addEventListener('change', () => {
          // Zaznacz, że użytkownik zmienił ręcznie ustawienie, aby nie nadpisać wyboru podczas update().
          // Osobno zapamiętujemy preferowane źródło, ponieważ podczas pustego wieku lub wieku dorosłego
          // UI może chwilowo zaznaczyć WHO, a po ponownym wpisaniu danych ma wrócić do wyboru użytkownika.
          bmiSource = rememberManualGrowthDataSource(input.value) || input.value;
          update();
        });
      });
    }
  });
  window.vildaAppOnReady('app:plan-transform-observer', function initPlanTransformObserver(){
    const planResultsRoot = document.getElementById('planResults');
    if(!planResultsRoot || typeof MutationObserver === 'undefined') return;
    const obs=new MutationObserver(transformPlan);
    obs.observe(planResultsRoot,{childList:true,subtree:true});
  });
  window.vildaAppOnReady('app:plan-transform-initial', transformPlan);
})();

/*
 * Moduł profesjonalny został wydzielony do vilda_professional_module.js w kroku 8Q-2.
 * Runtime persistence/autosave/restore został wydzielony do vilda_persist_runtime.js w kroku 8Q-3.
 * Karty podsumowań/metabolic summary UI zostały wydzielone do vilda_summary_cards.js w kroku 8Q-4.
 * app.js pozostawia tylko mostek inicjalizacji, aby zachować dotychczasową kolejność
 * hooków window.vildaAppOnReady bez zmiany logiki klinicznej ani UI.
 */
(function () {
  if (typeof window === 'undefined' || typeof window.vildaAppOnReady !== 'function') return;
  window.vildaAppOnReady('app:professional-module', function initProfessionalModuleBridge() {
    if (
      window.VildaProfessionalModule &&
      typeof window.VildaProfessionalModule.init === 'function'
    ) {
      window.VildaProfessionalModule.init();
    }
  });
})();
/* ============================
 *  KARTA: Szacowane spożycie energii (wariant A mobile)
 * ============================ */

/* ——— helpers ——— */
function lmsToValue(L, M, S, z){
  return (L !== 0) ? M * Math.pow(1 + L*S*z, 1/L) : M * Math.exp(S*z);
}

/* === PATCH 2025‑08‑31: median-based expected gain with height awareness ===
 *
 * Dodajemy funkcje obliczające medianową masę i wzrost dla podanego wieku (w miesiącach)
 * oraz funkcję obliczającą „należną” masę ciała przy BMI z 50. centyla.  W przypadku
 * braku wzrostu w wierszu przyjmujemy medianę wzrostu.  Funkcja expectedGainMedianHeightAware
 * oblicza oczekiwany przyrost masy między dwoma pomiarami, bazując na medianowym BMI i
 * rzeczywistym wzroście dziecka.  Negatywne wartości są obcięte do zera.  Dodatkowo,
 * jeśli różnica wzrostu między pomiarami jest mniejsza niż 0,5 cm przy różnicy wieku
 * ≥ 6 mies., przyjmujemy 0 jako oczekiwany przyrost.
 */
function _refsReady(){
  return typeof getPLWeightCentile === 'function' && typeof getPLHeightCentile === 'function' && typeof getChildLMS === 'function';
}

// Medianowa waga [kg] dla wieku (mies.) i płci: dla <36 mies. korzysta z siatek
// Palczewskiej (50c), a dla ≥36 mies. z LMS (WHO/OLAF) przez getChildLMS.
function medianWeightForAgeMonths(sex, ageMonths){
  if (!isFinite(ageMonths) || ageMonths < 0) return NaN;
  if (ageMonths < 36) {
    return getPLWeightCentile(sex, ageMonths, 50);
  }
  const ageYears = ageMonths / 12;
  const lms = getChildLMS(sex, ageYears, 'WT');
  return lms ? lms[1] : NaN;
}

// Medianowy wzrost [cm] dla wieku (mies.) i płci: <36 mies. – Palczewska, ≥36 mies. – LMS.
function medianHeightForAgeMonths(sex, ageMonths){
  if (!isFinite(ageMonths) || ageMonths < 0) return NaN;
  if (ageMonths < 36) {
    return getPLHeightCentile(sex, ageMonths, 50);
  }
  const ageYears = ageMonths / 12;
  const lms = getChildLMS(sex, ageYears, 'h');
  return lms ? lms[1] : NaN;
}

// „Należna” masa ciała [kg] przy BMI z 50. centyla i rzeczywistym wzroście (w cm).
function expectedWeightAtBMI50GivenHeight(sex, ageMonths, heightCm){
  const Mw = medianWeightForAgeMonths(sex, ageMonths);
  const Mh = medianHeightForAgeMonths(sex, ageMonths);
  if (!isFinite(Mw) || !isFinite(Mh) || Mw <= 0 || Mh <= 0 || !isFinite(heightCm) || heightCm <= 0) return NaN;
  const bmi50 = Mw / Math.pow(Mh / 100, 2);
  return bmi50 * Math.pow(heightCm / 100, 2);
}

// Oblicza oczekiwany przyrost masy między dwoma pomiarami.  Bazuje na medianowym BMI
// (50c) i rzeczywistych wysokościach dziecka.  Jeśli różnica wzrostu jest bardzo mała
// (<0,5 cm) przy odstępie ≥6 mies., wynik wynosi 0.  Ujemne wartości są obcinane do zera.
/**
 * Oblicza oczekiwany przyrost masy między dwoma pomiarami, z uwzględnieniem
 * aktualnego stanu odżywienia dziecka.  Dla dzieci z prawidłową masą ciała
 * (wskaźnik Cole’a < 110%) zwracamy medianowy oczekiwany przyrost masy
 * wynikający z utrzymania BMI na poziomie 50. centyla.  Dla dzieci z
 * nadwagą (Cole 110–119%) przyjmujemy zerowy przyrost masy ciała, chyba że
 * dziecko rośnie wyraźnie szybciej niż medianowe tempo wzrostu – wtedy
 * dopuszczamy niewielki przyrost proporcjonalny do nadwyżki wzrostu.
 * Dla dzieci z otyłością (Cole ≥ 120%) zakładamy utrzymanie masy ciała w
 * przypadku szybkiego wzrostu, a w pozostałych sytuacjach oczekujemy
 * łagodnego spadku masy.  Negatywne wartości mogą być zwrócone (nie są
 * obcinane do zera), aby oddać rekomendację redukcji masy ciała.
 */
function expectedGainMedianHeightAware(measPrev, measCurr, sex){
  const ageMonthsPrev = measPrev.ageMonths;
  const ageMonthsCurr = measCurr.ageMonths;
  if (!isFinite(ageMonthsPrev) || !isFinite(ageMonthsCurr)) return 0;
  const gapM = ageMonthsCurr - ageMonthsPrev;
  if (gapM <= 0) return 0;
  const gapYears = gapM / 12;
  // Ustal wzrost poprzedni i obecny; jeżeli brak wartości, użyj mediany
  const hPrev = (measPrev.height != null && isFinite(measPrev.height)) ? measPrev.height : medianHeightForAgeMonths(sex, ageMonthsPrev);
  const hCurr = (measCurr.height != null && isFinite(measCurr.height)) ? measCurr.height : medianHeightForAgeMonths(sex, ageMonthsCurr);
  // Oblicz przyrost wzrostu
  const heightGain = (isFinite(hCurr) && isFinite(hPrev)) ? (hCurr - hPrev) : 0;
  // Medianowy oczekiwany przyrost masy przy BMI=50c
  const wPrevMedian = expectedWeightAtBMI50GivenHeight(sex, ageMonthsPrev, hPrev);
  const wCurrMedian = expectedWeightAtBMI50GivenHeight(sex, ageMonthsCurr, hCurr);
  if (!isFinite(wPrevMedian) || !isFinite(wCurrMedian)) return 0;
  let baseGain = wCurrMedian - wPrevMedian;
  if (!isFinite(baseGain) || baseGain < 0) baseGain = 0;
  // Oblicz medianowy oczekiwany przyrost wzrostu i stosunek rzeczywistego wzrostu do mediany
  let expectedHeightGain = 0;
  if (typeof medianHeightForAgeMonths === 'function') {
    const medianPrevH = medianHeightForAgeMonths(sex, ageMonthsPrev);
    const medianCurrH = medianHeightForAgeMonths(sex, ageMonthsCurr);
    if (isFinite(medianPrevH) && isFinite(medianCurrH)) {
      expectedHeightGain = medianCurrH - medianPrevH;
    }
  }
  let growthFactor = 0;
  if (expectedHeightGain > 0) {
    growthFactor = heightGain / expectedHeightGain;
  }
  // Warunek braku liniowego wzrostu (co najmniej 6 miesięcy i prawie brak przyrostu wzrostu)
  const noLinearGrowth = (gapM >= 6 && Math.abs(heightGain) < 0.5);
  // Oblicz wskaźnik Cole’a dla poprzedniego pomiaru
  let colePrev = null;
  try {
    if (typeof getBmiP50ForAgeSex === 'function' && isFinite(measPrev.ageMonths)) {
      const bmiPrev = (measPrev.weight && measPrev.height) ? (measPrev.weight / Math.pow(measPrev.height / 100, 2)) : null;
      const bmi50Prev = getBmiP50ForAgeSex(measPrev.ageMonths, sex);
      if (bmiPrev != null && isFinite(bmiPrev) && isFinite(bmi50Prev) && bmi50Prev > 0) {
        colePrev = (bmiPrev / bmi50Prev) * 100;
      }
    }
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 32246 });
    }
  }
  // Jeżeli brak danych o Cole’u lub mieści się on w normie (<110%), zwracamy medianowy przyrost masy
  if (colePrev == null || !isFinite(colePrev) || colePrev < 110) {
    return baseGain;
  }
  // Nadwaga (110–119%): utrzymanie masy, niewielki przyrost tylko przy szybkim wzroście
  if (colePrev < 120) {
    // Brak wzrostu – utrzymanie masy
    if (noLinearGrowth) {
      return 0;
    }
    const normGainPos = baseGain > 0 ? baseGain : 0;
    // Dopuszczamy do 25% medianowego przyrostu masy, skalowane wzrostem
    let gainAllowed = normGainPos * 0.25;
    // Jeśli dziecko rośnie wolniej niż mediana, zmniejsz proporcjonalnie
    if (growthFactor > 0 && growthFactor < 1) {
      gainAllowed *= growthFactor;
    }
    // Jeżeli rośnie szybciej, pozostawimy pełną 25% normy (growthFactor>=1)
    // Ogranicz maksymalny przyrost do 2 kg na rok
    const maxGainPerYearOverweight = 2.0;
    const maxGain = maxGainPerYearOverweight * gapYears;
    const expected = Math.max(0, Math.min(gainAllowed, maxGain));
    return expected;
  }
  // Otyłość (>=120%): utrzymanie masy przy szybkim wzroście, łagodna redukcja w pozostałych sytuacjach
  if (colePrev >= 120) {
    // Jeśli rośnie co najmniej jak mediana (growthFactor >= 1) i jest wzrost liniowy, utrzymujemy masę
    if (!noLinearGrowth && growthFactor >= 1) {
      return 0;
    }
    // Inaczej redukcja masy proporcjonalna do braku wzrostu
    const maxLossPerYearObese = 4.0;
    // Skala redukcji: im wolniejszy wzrost, tym większa redukcja; growthFactor <= 1 -> (1 - growthFactor)
    const factor = 1 - Math.min(Math.max(growthFactor, 0), 1);
    let expectedLoss = maxLossPerYearObese * gapYears * factor;
    if (!isFinite(expectedLoss) || expectedLoss < 0) {
      expectedLoss = maxLossPerYearObese * gapYears;
    }
    // Zwracamy ujemną wartość (spadek masy)
    return -expectedLoss;
  }
  return baseGain;
}
function getUserBasics(){
  const sex = (document.getElementById('sex')?.value || 'M');
  const y   = parseFloat(document.getElementById('age')?.value);
  const m   = parseFloat(document.getElementById('ageMonths')?.value);
  const wt  = parseFloat(document.getElementById('weight')?.value);
  const ht  = parseFloat(document.getElementById('height')?.value);
  const ageYears  = (isNaN(y)?0:y) + (isNaN(m)?0:m)/12;
  const ageMonths = Math.round(((isNaN(y)?0:y)*12) + (isNaN(m)?0:m));
  return { sex, ageYears, ageMonths, weight: wt, height: ht };
}

/* ——— UI rows (jak w „Zaawansowanych…”): dodawanie/odczyt ——— */
function intakeAddRow(prefill){
  const wrap = document.getElementById('intakeMeasurements');
  if(!wrap) return;
  const row = document.createElement('div');
  row.className = 'measure-row-intake';
  // W każdym wierszu pole wieku znajduje się nad polami wzrostu i masy.
  vildaAppSetTrustedHtml(row, `
    <div class="intake-row-top">
      <label class="intake-age-label">Wiek:
        <div class="age-mm-group">
          <input type="number" class="intake-ageY" min="0" max="18" step="1" placeholder="lata">
          <input type="number" class="intake-ageM" min="0" max="11" step="1" placeholder="miesiące">
        </div>
      </label>
    </div>
    <div class="intake-row-bottom">
      <label>Wzrost (cm)
        <input type="number" step="0.1" min="45" max="230" class="intake-ht">
      </label>
      <label>Masa (kg)
        <input type="number" step="0.1" min="1" max="250" class="intake-wt">
      </label>
      <button type="button" class="icon remove-intake-row" aria-label="Usuń wiersz">×</button>
    </div>
  `, 'app:row');
  wrap.appendChild(row);

  if(prefill){
    // Prefill age using either ageMonths or ageYears
    if (typeof prefill.ageMonths === 'number'){
      row.querySelector('.intake-ageY').value = Math.floor(prefill.ageMonths / 12);
      row.querySelector('.intake-ageM').value = prefill.ageMonths % 12;
    } else if (typeof prefill.ageYears === 'number'){
      const y = Math.floor(prefill.ageYears);
      const mm = Math.round((prefill.ageYears - y) * 12);
      row.querySelector('.intake-ageY').value = y;
      row.querySelector('.intake-ageM').value = mm;
    }
    if (typeof prefill.height === 'number') {
      row.querySelector('.intake-ht').value = prefill.height;
    }
    if (typeof prefill.weight === 'number') {
      row.querySelector('.intake-wt').value = prefill.weight;
    }
  }

  row.querySelector('.remove-intake-row').addEventListener('click', (e)=>{
    e.preventDefault();
    if (typeof window !== 'undefined' && typeof window.vildaHandleIntakeHistoryRowRemove === 'function') {
      window.vildaHandleIntakeHistoryRowRemove(row);
    } else {
      row.remove();
      updateIntakeRemoveButtons();
      debouncedIntakeCalc();
    }
  });
  ['input','change'].forEach(ev=>{
    row.addEventListener(ev, e=>{
      if(e.target.matches('.intake-ageY,.intake-ageM,.intake-ht,.intake-wt')) debouncedIntakeCalc();
    });
  });

  // Aktualizuj widoczność przycisków „×” po dodaniu nowego wiersza
  updateIntakeRemoveButtons();
}

function getVildaEstimatedIntakeAdapter(){
  try {
    return (typeof window !== 'undefined' && window.VildaEstimatedIntake && typeof window.VildaEstimatedIntake === 'object')
      ? window.VildaEstimatedIntake
      : null;
  } catch (_) {
    return null;
  }
}

function readIntakeRows(){
  const adapter = getVildaEstimatedIntakeAdapter();
  if (adapter && typeof adapter.readIntakeRows === 'function') {
    try {
      const delegated = adapter.readIntakeRows({ document: (typeof document !== 'undefined') ? document : null });
      if (Array.isArray(delegated)) return delegated;
    } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', _, { step: '8O-9b', helper: 'VildaEstimatedIntake.readIntakeRows' });
      }
    }
  }
  return readIntakeRowsFallback();
}

function readIntakeRowsFallback(){
  const out = [];
  document.querySelectorAll('#intakeMeasurements .measure-row-intake').forEach(row=>{
    const y = parseFloat(row.querySelector('.intake-ageY')?.value);
    const m = parseFloat(row.querySelector('.intake-ageM')?.value);
    const h = parseFloat(row.querySelector('.intake-ht')?.value);
    const w = parseFloat(row.querySelector('.intake-wt')?.value);
    const hasAge = (!isNaN(y) || !isNaN(m));
    if(hasAge && !isNaN(h) && !isNaN(w)){
      const months = Math.round(((isNaN(y)?0:y)*12) + (isNaN(m)?0:m));
      out.push({ ageYears: months/12, ageMonths: months, months, weight: w, height: h });
    }
  });
  out.sort((a,b)=>a.months-b.months);
  return out;
}

function getIntakeRowHeight(row, fallbackHeight){
  const adapter = getVildaEstimatedIntakeAdapter();
  if (adapter && typeof adapter.getIntakeRowHeight === 'function') {
    try {
      return adapter.getIntakeRowHeight(row, fallbackHeight);
    } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', _, { step: '8O-9b', helper: 'VildaEstimatedIntake.getIntakeRowHeight' });
      }
    }
  }
  return getIntakeRowHeightFallback(row, fallbackHeight);
}

function getIntakeRowHeightFallback(row, fallbackHeight){
  const rowHeight = Number(row && row.height);
  if (isFinite(rowHeight) && rowHeight > 0) return rowHeight;
  const fallback = Number(fallbackHeight);
  return (isFinite(fallback) && fallback > 0) ? fallback : null;
}

function clearIntakeResultsAlertState(mountId){
  const mount = document.getElementById(mountId || 'intakeResults');
  if (!mount) return;
  mount.classList.remove('bmi-warning', 'bmi-danger');
  try { clearPulse(mount); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 32396 });
    }
  }
}

function getVildaEstimatedIntakeIntervalDependencies(){
  return {
    energyBuildIntakeObservedState: (typeof energyBuildIntakeObservedState === 'function') ? energyBuildIntakeObservedState : null,
    energyIsNumeric: (typeof energyIsNumeric === 'function') ? energyIsNumeric : null,
    expectedGainMedianHeightAware: (typeof expectedGainMedianHeightAware === 'function') ? expectedGainMedianHeightAware : null,
    ENERGY_ADULT_START_AGE: (typeof ENERGY_ADULT_START_AGE === 'number') ? ENERGY_ADULT_START_AGE : 19,
    KCAL_PER_KG: (typeof KCAL_PER_KG === 'number') ? KCAL_PER_KG : 7700
  };
}

function buildIntakeIntervals(rows, options){
  const adapter = getVildaEstimatedIntakeAdapter();
  if (adapter && typeof adapter.buildIntakeIntervals === 'function') {
    try {
      const delegated = adapter.buildIntakeIntervals(rows, options, getVildaEstimatedIntakeIntervalDependencies());
      if (Array.isArray(delegated)) return delegated;
    } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', _, { step: '8O-9b', helper: 'VildaEstimatedIntake.buildIntakeIntervals' });
      }
    }
  }
  return buildIntakeIntervalsFallback(rows, options);
}

function buildIntakeIntervalsFallback(rows, options){

  const opts = options || {};
  const sex = opts.sex || 'M';
  const fallbackHeight = opts.fallbackHeight;
  const pal = Number(opts.pal);
  const teeFactor = (typeof opts.teeFactor === 'number' && isFinite(opts.teeFactor)) ? opts.teeFactor : 1;
  const intervals = [];
  const KG_TOL_PER_MONTH = 0.2;

  if (!Array.isArray(rows) || rows.length < 2) return intervals;

  for(let i=0;i<rows.length-1;i++){
    const a = rows[i], b = rows[i+1];
    const monthsGap = b.months - a.months;
    if(monthsGap <= 0) continue;
    const days = monthsGap * 30.4375;
    const dW   = b.weight - a.weight;

    const heightA = getIntakeRowHeight(a, fallbackHeight);
    const heightB = getIntakeRowHeight(b, fallbackHeight);

    const energyA = energyBuildIntakeObservedState({
      ageYears: a.ageYears,
      ageMonthsOpt: (a.ageMonths || 0) % 12,
      sex,
      weightKg: a.weight,
      heightCm: heightA,
      palInput: pal,
      applyRiskAdjust: false
    });
    const energyB = energyBuildIntakeObservedState({
      ageYears: b.ageYears,
      ageMonthsOpt: (b.ageMonths || 0) % 12,
      sex,
      weightKg: b.weight,
      heightCm: heightB,
      palInput: pal,
      applyRiskAdjust: false
    });

    if (!energyIsNumeric(energyA.teeRawKcal) || !energyIsNumeric(energyB.teeRawKcal)) continue;

    const teeRaw = (energyA.teeRawKcal + energyB.teeRawKcal) / 2;
    const teeAdj = teeRaw * teeFactor;

    let expectedGain = 0;
    let deltaVsNorm  = dW;
    const childPair  = (a.ageYears < ENERGY_ADULT_START_AGE && b.ageYears < ENERGY_ADULT_START_AGE);

    if(childPair){
      const measPrev = { ageMonths: (typeof a.ageMonths === 'number' ? a.ageMonths : a.months), height: getIntakeRowHeight(a, fallbackHeight), weight: a.weight };
      const measCurr = { ageMonths: (typeof b.ageMonths === 'number' ? b.ageMonths : b.months), height: getIntakeRowHeight(b, fallbackHeight), weight: b.weight };
      expectedGain = expectedGainMedianHeightAware(measPrev, measCurr, sex);
      deltaVsNorm  = dW - expectedGain;
    }

    const tol = KG_TOL_PER_MONTH * Math.max(1, monthsGap);
    const stable = Math.abs(childPair ? deltaVsNorm : dW) < tol;
    const energyDeltaPerDay = ((childPair ? deltaVsNorm : dW) * KCAL_PER_KG) / days;
    const intakePerDay = teeAdj + (dW * KCAL_PER_KG) / days;

    intervals.push({
      from: a.ageYears, to: b.ageYears,
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

function getVildaEstimatedIntakeAlertProbeDependencies(){
  return {
    getUserBasics: (typeof getUserBasics === 'function') ? getUserBasics : null,
    readIntakeRows: (typeof readIntakeRows === 'function') ? readIntakeRows : null,
    getIntakeRowHeight: (typeof getIntakeRowHeight === 'function') ? getIntakeRowHeight : null,
    advancedGrowthData: (typeof window !== 'undefined') ? window.advancedGrowthData : null,
    logSwallowedCatch: (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function')
      ? globalThis.vildaLogSwallowedCatch
      : null
  };
}

function collectIntakeRowsForAlertProbe(){
  const adapter = getVildaEstimatedIntakeAdapter();
  if (adapter && typeof adapter.collectIntakeRowsForAlertProbe === 'function') {
    try {
      const delegated = adapter.collectIntakeRowsForAlertProbe({}, getVildaEstimatedIntakeAlertProbeDependencies());
      if (Array.isArray(delegated)) return delegated;
    } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', _, { step: '8O-9d-lite', helper: 'VildaEstimatedIntake.collectIntakeRowsForAlertProbe' });
      }
    }
  }
  return collectIntakeRowsForAlertProbeFallback();
}

function collectIntakeRowsForAlertProbeFallback(){
  const basics = getUserBasics();
  const rows = [];

  const pushUniqueRow = (row) => {
    if (!row || !isFinite(row.ageMonths) || !isFinite(row.weight)) return;
    const height = getIntakeRowHeight(row, basics.height);
    const dupe = rows.some(r => Math.abs(r.ageMonths - row.ageMonths) <= 1 && Math.abs(r.weight - row.weight) < 0.01);
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
    const liveRows = readIntakeRows();
    if (Array.isArray(liveRows) && liveRows.length) {
      liveRows.forEach(pushUniqueRow);
    }
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 32498 });
    }
  }

  if (isFinite(basics.ageMonths) && isFinite(basics.weight) && isFinite(basics.height)) {
    pushUniqueRow({ ageMonths: basics.ageMonths, weight: basics.weight, height: basics.height });
  }

  if (basics.ageYears < 18 && window.advancedGrowthData && Array.isArray(window.advancedGrowthData.measurements)) {
    window.advancedGrowthData.measurements.forEach(m => {
      if (!m || typeof m.ageMonths !== 'number' || typeof m.weight !== 'number') return;
      pushUniqueRow({ ageMonths: m.ageMonths, weight: m.weight, height: m.height });
    });
  }

  rows.sort((a, b) => a.months - b.months);
  return rows;
}

function hasPotentialIntakeAlerts(state){
  const basicsState = state || {};
  if (basicsState.visible === false) return false;

  const basics = getUserBasics();
  if (!isFinite(basics.weight) || !isFinite(basics.height) || !isFinite(basics.ageYears)) return false;

  const rows = collectIntakeRowsForAlertProbe();
  if (!rows.length) return false;

  const pal = parseFloat(document.getElementById('intakePal')?.value || document.getElementById('palFactor')?.value || '1.4');
  const history = rows.map(r => ({ ageMonths: r.ageMonths, weight: r.weight }));
  const lastRow = rows[rows.length - 1];
  const lastHeight = getIntakeRowHeight(lastRow, basics.height);
  const lastEnergy = energyBuildIntakeObservedState({
    ageYears: lastRow.ageYears,
    ageMonthsOpt: (lastRow.ageMonths || 0) % 12,
    sex: basics.sex,
    weightKg: lastRow.weight,
    heightCm: lastHeight,
    palInput: pal,
    history,
    intakeKcalPerDay: null,
    mountId: 'anorexiaTmpMount',
    applyRiskAdjust: true
  });
  const lastBmr = lastEnergy.reeKcal;

  let teeFactor = 1;
  if (energyIsNumeric(lastEnergy.teeRawKcal) && energyIsNumeric(lastEnergy.teeBaselineKcal) && lastEnergy.teeRawKcal > 0) {
    teeFactor = lastEnergy.teeBaselineKcal / lastEnergy.teeRawKcal;
  }

  let intakeKcalPerDay = null;
  try {
    const intervals = buildIntakeIntervals(rows, {
      sex: basics.sex,
      fallbackHeight: basics.height,
      pal: pal,
      teeFactor: teeFactor
    });
    const lastInterval = intervals[intervals.length - 1];
    intakeKcalPerDay = lastInterval ? lastInterval.intakePerDay : null;
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 32558 });
    }
  }

  try {
    if (typeof window.detectAnRisk === 'function') {
      const risk = window.detectAnRisk({
        ageYears: basics.ageYears,
        ageMonthsOpt: basics.ageMonths % 12,
        sex: basics.sex,
        heightCm: basics.height,
        weightKg: basics.weight
      }, {
        history: history,
        bmr: lastBmr,
        pal: lastEnergy.palUsed,
        intakeKcalPerDay: intakeKcalPerDay
      });
      if (risk && risk.any) return true;
    }
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 32576 });
    }
  }

  try {
    if (typeof window.has12mLossOrangeRisk === 'function' && window.has12mLossOrangeRisk(history)) {
      return true;
    }
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 32582 });
    }
  }

  return false;
}

/* ——— autofill ——— */
let intakeAutofilledOnce = false;
function intakeAutofill(){
  if(intakeAutofilledOnce) return;
  intakeAutofilledOnce = true;

  const wrap = document.getElementById('intakeMeasurements');
  if(!wrap) return;
  vildaAppClearHtml(wrap);

  const basic = getUserBasics();
  if(!isNaN(basic.weight)){
    intakeAddRow({ ageMonths: basic.ageMonths, height: basic.height, weight: basic.weight });
  }
  if (basic.ageYears < 18 && window.advancedGrowthData && Array.isArray(window.advancedGrowthData.measurements)){
    window.advancedGrowthData.measurements.forEach(m=>{
      if (m && typeof m.ageMonths==='number' && typeof m.weight==='number'){
        const dupe = Math.abs(m.ageMonths - basic.ageMonths) <= 1 && Math.abs(m.weight - basic.weight) < 0.01;
        if(!dupe) intakeAddRow({ ageMonths: m.ageMonths, height: m.height, weight: m.weight });
      }
    });
  }

  const intakePalEl = document.getElementById('intakePal');
  const planPal = document.getElementById('palFactor')?.value;
  if (intakePalEl) {
    energyPopulateIntakePalSelect(intakePalEl, {
      ageYears: basic.ageYears,
      ageMonthsOpt: basic.ageMonths % 12,
      value: planPal || '1.4'
    });
  }
  intakeUpdatePalDesc();
  _updateIntakeFirstRowFromUserBasics();
}

/* ——— opis PAL ——— */
function intakeUpdatePalDesc(){
  const pal = document.getElementById('intakePal')?.value;
  updatePalDescription(pal, 'intakePalDesc');
}

/* ——— seam kalkulacji estimated intake: 8O-9e / input model adapter: 8Q-8 / runtime adapter: 8Q-7 ——— */
function buildEstimatedIntakeHistoryForRiskFallback(rows){
  return (Array.isArray(rows) ? rows : []).map(r => ({ ageMonths: r.ageMonths, weight: r.weight }));
}

function getVildaEstimatedIntakeInputModelAdapter(){
  try {
    const root = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
    return root && root.VildaEstimatedIntakeInputModel && typeof root.VildaEstimatedIntakeInputModel === 'object'
      ? root.VildaEstimatedIntakeInputModel
      : null;
  } catch (_) {
    return null;
  }
}

function getVildaEstimatedIntakeInputModelDependencies(){
  return {
    document: (typeof document !== 'undefined') ? document : null,
    getUserBasics: (typeof getUserBasics === 'function') ? getUserBasics : null,
    readIntakeRows: (typeof readIntakeRows === 'function') ? readIntakeRows : null,
    getIntakeRowHeight: (typeof getIntakeRowHeight === 'function') ? getIntakeRowHeight : null,
    buildIntakeIntervals: (typeof buildIntakeIntervals === 'function') ? buildIntakeIntervals : null,
    energyBuildIntakeObservedState: (typeof energyBuildIntakeObservedState === 'function') ? energyBuildIntakeObservedState : null,
    energyIsNumeric: (typeof energyIsNumeric === 'function') ? energyIsNumeric : null,
    intakeUpdatePalDesc: (typeof intakeUpdatePalDesc === 'function') ? intakeUpdatePalDesc : null,
    getVildaEstimatedIntakeIntervalDependencies: (typeof getVildaEstimatedIntakeIntervalDependencies === 'function') ? getVildaEstimatedIntakeIntervalDependencies : null
  };
}

function buildEstimatedIntakeHistoryForRisk(rows){
  const adapter = getVildaEstimatedIntakeInputModelAdapter();
  if (adapter && typeof adapter.buildEstimatedIntakeHistoryForRisk === 'function') {
    try {
      return adapter.buildEstimatedIntakeHistoryForRisk(rows);
    } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', _, { step: '8Q-8', helper: 'VildaEstimatedIntakeInputModel.buildEstimatedIntakeHistoryForRisk' });
      }
    }
  }
  return buildEstimatedIntakeHistoryForRiskFallback(rows);
}

function getVildaEstimatedIntakeRuntimeAdapter(){
  try {
    const root = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
    return root && root.VildaEstimatedIntakeRuntime && typeof root.VildaEstimatedIntakeRuntime === 'object'
      ? root.VildaEstimatedIntakeRuntime
      : null;
  } catch (_) {
    return null;
  }
}

function getVildaEstimatedIntakeRuntimeDependencies(){
  const root = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
  return {
    energyBuildIntakeObservedState: (typeof energyBuildIntakeObservedState === 'function') ? energyBuildIntakeObservedState : null,
    check12mLossOrange: root && typeof root.check12mLossOrange === 'function' ? root.check12mLossOrange : null,
    logSwallowedCatch: (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') ? globalThis.vildaLogSwallowedCatch : null
  };
}

function buildEstimatedIntakeWindowHistoryFallback(rows){
  return (Array.isArray(rows) ? rows : []).map(row => ({
    ageMonths: row.ageMonths,
    ageYears: row.ageYears,
    height: row.height,
    weight: row.weight
  }));
}

function buildEstimatedIntakeWindowHistory(rows){
  const adapter = getVildaEstimatedIntakeRuntimeAdapter();
  if (adapter && typeof adapter.buildEstimatedIntakeWindowHistory === 'function') {
    try {
      return adapter.buildEstimatedIntakeWindowHistory(rows);
    } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', _, { step: '8Q-7', helper: 'VildaEstimatedIntakeRuntime.buildEstimatedIntakeWindowHistory' });
      }
    }
  }
  return buildEstimatedIntakeWindowHistoryFallback(rows);
}

function clearEstimatedIntakeWindowState(){
  const adapter = getVildaEstimatedIntakeRuntimeAdapter();
  if (adapter && typeof adapter.clearEstimatedIntakeWindowState === 'function') {
    try {
      return adapter.clearEstimatedIntakeWindowState({ root: (typeof window !== 'undefined') ? window : globalThis });
    } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', _, { step: '8Q-7', helper: 'VildaEstimatedIntakeRuntime.clearEstimatedIntakeWindowState' });
      }
    }
  }
  window.intakeHistory = null;
  window.intakeEstimatedKcalPerDay = null;
  return { intakeHistory: window.intakeHistory, intakeEstimatedKcalPerDay: window.intakeEstimatedKcalPerDay };
}

function commitEstimatedIntakeWindowState(rows, intakeKcalPerDay){
  const adapter = getVildaEstimatedIntakeRuntimeAdapter();
  if (adapter && typeof adapter.commitEstimatedIntakeWindowState === 'function') {
    try {
      return adapter.commitEstimatedIntakeWindowState(rows, intakeKcalPerDay, { root: (typeof window !== 'undefined') ? window : globalThis });
    } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', _, { step: '8Q-7', helper: 'VildaEstimatedIntakeRuntime.commitEstimatedIntakeWindowState' });
      }
    }
  }
  window.intakeHistory = buildEstimatedIntakeWindowHistoryFallback(rows);
  window.intakeEstimatedKcalPerDay = intakeKcalPerDay;
  return { intakeHistory: window.intakeHistory, intakeEstimatedKcalPerDay: window.intakeEstimatedKcalPerDay };
}

function buildEstimatedIntakeCalcInputModel(options){
  const adapter = getVildaEstimatedIntakeInputModelAdapter();
  if (adapter && typeof adapter.buildEstimatedIntakeCalcInputModel === 'function') {
    try {
      return adapter.buildEstimatedIntakeCalcInputModel(options || {}, getVildaEstimatedIntakeInputModelDependencies());
    } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', _, { step: '8Q-8', helper: 'VildaEstimatedIntakeInputModel.buildEstimatedIntakeCalcInputModel' });
      }
    }
  }
  return buildEstimatedIntakeCalcInputModelFallback(options);
}

function buildEstimatedIntakeCalcInputModelFallback(options){
  const opts = options || {};
  const basics = (typeof getUserBasics === 'function') ? getUserBasics() : {};
  const palEl = (typeof document !== 'undefined' && document && typeof document.getElementById === 'function')
    ? document.getElementById('intakePal')
    : null;
  const palRaw = palEl ? palEl.value : undefined;
  const pal = palRaw === '' || palRaw == null ? null : parseFloat(palRaw);

  if (opts.updatePalDescription === true && typeof intakeUpdatePalDesc === 'function') {
    intakeUpdatePalDesc();
  }

  const rows = (typeof readIntakeRows === 'function') ? readIntakeRows() : [];
  const safeRows = Array.isArray(rows) ? rows : [];
  return {
    step: '8Q-8',
    kind: 'estimated-intake-input-model',
    basics: basics || {},
    sex: basics && basics.sex,
    height: basics && basics.height,
    palRaw,
    pal,
    rows: safeRows,
    historyForRisk: buildEstimatedIntakeHistoryForRiskFallback(safeRows)
  };
}

function buildEstimatedIntakeLastObservedModel(inputModel){
  const adapter = getVildaEstimatedIntakeInputModelAdapter();
  if (adapter && typeof adapter.buildEstimatedIntakeLastObservedModel === 'function') {
    try {
      return adapter.buildEstimatedIntakeLastObservedModel(inputModel, { mountId: 'anorexiaTmpMount', applyRiskAdjust: true }, getVildaEstimatedIntakeInputModelDependencies());
    } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', _, { step: '8Q-8', helper: 'VildaEstimatedIntakeInputModel.buildEstimatedIntakeLastObservedModel' });
      }
    }
  }
  return buildEstimatedIntakeLastObservedModelFallback(inputModel);
}

function buildEstimatedIntakeLastObservedModelFallback(inputModel){
  const input = inputModel || {};
  const basics = input.basics || {};
  const rows = Array.isArray(input.rows) ? input.rows : [];
  const historyForRisk = Array.isArray(input.historyForRisk) ? input.historyForRisk : buildEstimatedIntakeHistoryForRiskFallback(rows);
  let lastObservedState = null;
  let teeFactor = 1;
  let lastRow = null;
  let lastHeight = null;

  if (rows.length) {
    lastRow = rows[rows.length - 1];
    lastHeight = getIntakeRowHeight(lastRow, basics.height);
    lastObservedState = energyBuildIntakeObservedState({
      ageYears: lastRow.ageYears,
      ageMonthsOpt: (lastRow.ageMonths || 0) % 12,
      sex: basics.sex,
      weightKg: lastRow.weight,
      heightCm: lastHeight,
      palInput: input.pal,
      history: historyForRisk,
      intakeKcalPerDay: null,
      mountId: 'anorexiaTmpMount',
      applyRiskAdjust: true
    });
    if (energyIsNumeric(lastObservedState?.teeRawKcal) && energyIsNumeric(lastObservedState?.teeBaselineKcal) && lastObservedState.teeRawKcal > 0) {
      teeFactor = lastObservedState.teeBaselineKcal / lastObservedState.teeRawKcal;
    }
  }

  return {
    lastObservedState,
    teeFactor,
    lastRow,
    lastHeight,
    historyForRisk
  };
}


function getVildaEstimatedIntakeCalculationModelDependencies(){
  const adapter = getVildaEstimatedIntakeInputModelAdapter();
  if (adapter && typeof adapter.getEstimatedIntakeCalculationModelDependencies === 'function') {
    try {
      return adapter.getEstimatedIntakeCalculationModelDependencies({}, getVildaEstimatedIntakeInputModelDependencies());
    } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', _, { step: '8Q-8', helper: 'VildaEstimatedIntakeInputModel.getEstimatedIntakeCalculationModelDependencies' });
      }
    }
  }
  return {
    buildIntakeIntervals: (typeof buildIntakeIntervals === 'function') ? buildIntakeIntervals : null,
    getIntakeRowHeight: (typeof getIntakeRowHeight === 'function') ? getIntakeRowHeight : null,
    energyBuildIntakeObservedState: (typeof energyBuildIntakeObservedState === 'function') ? energyBuildIntakeObservedState : null,
    energyIsNumeric: (typeof energyIsNumeric === 'function') ? energyIsNumeric : null,
    intervalDependencies: (typeof getVildaEstimatedIntakeIntervalDependencies === 'function') ? getVildaEstimatedIntakeIntervalDependencies() : {}
  };
}

function cloneEstimatedIntakeCalculationRow(row){
  if (!row || typeof row !== 'object') return row;
  return {
    ageYears: row.ageYears,
    ageMonths: row.ageMonths,
    months: row.months,
    weight: row.weight,
    height: row.height
  };
}

function normalizeEstimatedIntakeCalculationRows(rows){
  return Array.isArray(rows) ? rows.map(cloneEstimatedIntakeCalculationRow) : [];
}

function buildEstimatedIntakeCalculationModel(inputModel, observedModel){
  const adapter = getVildaEstimatedIntakeAdapter();
  if (adapter && typeof adapter.buildEstimatedIntakeCalculationModel === 'function') {
    try {
      const delegated = adapter.buildEstimatedIntakeCalculationModel(
        inputModel,
        observedModel,
        getVildaEstimatedIntakeCalculationModelDependencies()
      );
      if (delegated && typeof delegated === 'object') return delegated;
    } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', _, { step: '8O-9f', helper: 'VildaEstimatedIntake.buildEstimatedIntakeCalculationModel' });
      }
    }
  }
  return buildEstimatedIntakeCalculationModelFallback(inputModel, observedModel);
}

function buildEstimatedIntakeCalculationModelFallback(inputModel, observedModel){
  const input = inputModel || {};
  const observed = observedModel || {};
  const basics = input.basics || {};
  const rows = normalizeEstimatedIntakeCalculationRows(input.rows);
  const sex = input.sex || basics.sex || 'M';
  const fallbackHeight = Object.prototype.hasOwnProperty.call(input, 'height') ? input.height : basics.height;
  const pal = input.pal;
  const teeFactor = (typeof observed.teeFactor === 'number' && isFinite(observed.teeFactor)) ? observed.teeFactor : 1;

  const model = {
    step: '8O-9f',
    kind: 'estimated-intake-calculation-model',
    pureModel: true,
    rendersDom: false,
    commitsWindowState: false,
    branch: !rows.length ? 'empty-rows-message' : (rows.length === 1 ? 'single-row-maintenance' : 'multi-row-interval-render'),
    basics: { sex, height: fallbackHeight },
    pal,
    rows,
    rowCount: rows.length,
    observed: {
      hasLastObservedState: !!observed.lastObservedState,
      teeFactor,
      lastRow: observed.lastRow ? cloneEstimatedIntakeCalculationRow(observed.lastRow) : null,
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
    const rowHeight = getIntakeRowHeight(r, fallbackHeight);
    const energy = observed.lastObservedState || energyBuildIntakeObservedState({
      ageYears: r.ageYears,
      ageMonthsOpt: (r.ageMonths || 0) % 12,
      sex,
      weightKg: r.weight,
      heightCm: rowHeight,
      palInput: pal,
      applyRiskAdjust: false
    });
    const singleKind = !energy
      ? 'energy-unavailable'
      : (energy.isInfantUnder6 ? 'infant-under-6' : (energy.isInfantButte ? 'infant-butte' : 'maintenance'));
    const maintenanceKcal = energy
      ? (energyIsNumeric(energy.teeBaselineKcal) ? energy.teeBaselineKcal : energy.teeRawKcal)
      : null;

    model.modeBadge = energy && energy.modeBadge ? energy.modeBadge : null;
    model.single = {
      kind: singleKind,
      row: cloneEstimatedIntakeCalculationRow(r),
      rowHeight,
      energy,
      teeRawKcal: energy ? energy.teeRawKcal : null,
      teeBaselineKcal: energy ? energy.teeBaselineKcal : null,
      maintenanceKcal,
      palUsed: energy && energy.palUsed != null ? energy.palUsed : null
    };
    model.commitPlan = { action: 'set', rows, intakeKcalPerDay: null };
    model.postRenderRiskPlan = {
      shouldRun: true,
      row: cloneEstimatedIntakeCalculationRow(r),
      rowHeight,
      sex,
      pal,
      intakeKcalPerDay: null
    };
    return model;
  }

  const intervals = buildIntakeIntervals(rows, {
    sex: sex,
    fallbackHeight: fallbackHeight,
    pal: pal,
    teeFactor: teeFactor
  });
  const safeIntervals = Array.isArray(intervals) ? intervals : [];
  const lastInterval = safeIntervals[safeIntervals.length - 1] || null;
  const lastRow = rows[rows.length - 1];
  const lastHeight = getIntakeRowHeight(lastRow, fallbackHeight);

  model.modeBadge = observed.lastObservedState && observed.lastObservedState.modeBadge ? observed.lastObservedState.modeBadge : null;
  model.intervals = safeIntervals;
  model.hasChildIntervals = safeIntervals.some(r => r && r.isChild);
  model.commitPlan = { action: 'set', rows, intakeKcalPerDay: lastInterval ? lastInterval.intakePerDay : null };
  model.postRenderRiskPlan = {
    shouldRun: true,
    row: cloneEstimatedIntakeCalculationRow(lastRow),
    rowHeight: lastHeight,
    sex,
    pal,
    intakeKcalPerDay: lastInterval ? lastInterval.intakePerDay : null
  };
  return model;
}

function commitEstimatedIntakeCalcModelWindowState(calcModel){
  const adapter = getVildaEstimatedIntakeRuntimeAdapter();
  if (adapter && typeof adapter.commitEstimatedIntakeCalcModelWindowState === 'function') {
    try {
      return adapter.commitEstimatedIntakeCalcModelWindowState(calcModel, { root: (typeof window !== 'undefined') ? window : globalThis });
    } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', _, { step: '8Q-7', helper: 'VildaEstimatedIntakeRuntime.commitEstimatedIntakeCalcModelWindowState' });
      }
    }
  }
  const plan = calcModel && calcModel.commitPlan ? calcModel.commitPlan : { action: 'clear' };
  if (plan.action === 'clear') {
    return clearEstimatedIntakeWindowState();
  }
  return commitEstimatedIntakeWindowState(plan.rows || (calcModel && calcModel.rows) || [], plan.intakeKcalPerDay == null ? null : plan.intakeKcalPerDay);
}

function runEstimatedIntakePostRenderRisk(calcModel){
  const adapter = getVildaEstimatedIntakeRuntimeAdapter();
  if (adapter && typeof adapter.runEstimatedIntakePostRenderRisk === 'function') {
    try {
      return adapter.runEstimatedIntakePostRenderRisk(calcModel, {
        root: (typeof window !== 'undefined') ? window : globalThis,
        dependencies: getVildaEstimatedIntakeRuntimeDependencies(),
        mountId: 'intakeResults'
      });
    } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', _, { step: '8Q-7', helper: 'VildaEstimatedIntakeRuntime.runEstimatedIntakePostRenderRisk' });
      }
    }
  }
  const plan = calcModel && calcModel.postRenderRiskPlan ? calcModel.postRenderRiskPlan : null;
  if (!plan || !plan.shouldRun || !plan.row) return;
  const row = plan.row;
  energyBuildIntakeObservedState({
    ageYears: row.ageYears,
    ageMonthsOpt: (row.ageMonths || 0) % 12,
    sex: plan.sex,
    weightKg: row.weight,
    heightCm: plan.rowHeight,
    palInput: plan.pal,
    history: window.intakeHistory,
    intakeKcalPerDay: plan.intakeKcalPerDay,
    mountId: 'intakeResults',
    applyRiskAdjust: true
  });
  try {
    if (typeof window.check12mLossOrange === 'function') {
      const hist = window.intakeHistory || (calcModel && calcModel.rows) || [];
      window.check12mLossOrange(hist, 'intakeResults');
    }
  } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { step: '8Q-7', helper: 'runEstimatedIntakePostRenderRisk:check12mLossOrangeFallback' });
    }
  }
}


/* ——— renderer wyników estimated intake: 8Q-6 ——— */
function getVildaEstimatedIntakeUiAdapter(){
  const root = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
  return root && root.VildaEstimatedIntakeUI && typeof root.VildaEstimatedIntakeUI.buildResultsHtml === 'function'
    ? root.VildaEstimatedIntakeUI
    : null;
}

function getVildaEstimatedIntakeUiRenderDependencies(){
  return {
    energyRenderModeBadgeHtml: (typeof energyRenderModeBadgeHtml === 'function') ? energyRenderModeBadgeHtml : null
  };
}

function buildEstimatedIntakeResultsRenderModel(calcModel){
  const adapter = getVildaEstimatedIntakeUiAdapter();
  if (adapter && typeof adapter.buildResultsHtml === 'function') {
    try {
      return adapter.buildResultsHtml(calcModel, { dependencies: getVildaEstimatedIntakeUiRenderDependencies() });
    } catch (error) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', error, { step: '8Q-6', helper: 'VildaEstimatedIntakeUI.buildResultsHtml' });
      }
    }
  }
  return {
    step: '8Q-6',
    kind: 'estimated-intake-results-render-model',
    readOnly: true,
    rendersDom: false,
    mutatesDom: false,
    commitsWindowState: false,
    mutatesWindowState: false,
    branch: 'renderer-unavailable',
    legendVisible: false,
    html: '<p>Nie można wyrenderować wyników szacowanego spożycia energii, bo moduł VildaEstimatedIntakeUI nie jest dostępny.</p>'
  };
}

function getVildaEstimatedIntakeDomMountAdapter(){
  const root = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
  return root && root.VildaEstimatedIntakeDomMount && typeof root.VildaEstimatedIntakeDomMount.applyEstimatedIntakeResultsRenderModel === 'function'
    ? root.VildaEstimatedIntakeDomMount
    : null;
}

function getVildaEstimatedIntakeDomMountDependencies(){
  return {
    document: (typeof document !== 'undefined' && document) ? document : null,
    vildaAppSetTrustedHtml: (typeof vildaAppSetTrustedHtml === 'function') ? vildaAppSetTrustedHtml : null,
    logSwallowedCatch: (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') ? globalThis.vildaLogSwallowedCatch : null
  };
}

function isEstimatedIntakeDomTargets(value){
  return !!(value && typeof value === 'object' && (
    Object.prototype.hasOwnProperty.call(value, 'res') ||
    Object.prototype.hasOwnProperty.call(value, 'resultsEl') ||
    Object.prototype.hasOwnProperty.call(value, 'mount')
  ));
}

function getEstimatedIntakeDomMountOptions(options){
  const opts = options && typeof options === 'object' ? Object.assign({}, options) : {};
  opts.dependencies = Object.assign({}, opts.dependencies || opts.deps || {}, getVildaEstimatedIntakeDomMountDependencies());
  return opts;
}

function applyEstimatedIntakeResultsRenderModel(arg1, arg2, arg3, arg4){
  const adapter = getVildaEstimatedIntakeDomMountAdapter();
  const targetsSignature = isEstimatedIntakeDomTargets(arg1);
  const options = getEstimatedIntakeDomMountOptions(targetsSignature ? arg3 : arg4);
  if (adapter && typeof adapter.applyEstimatedIntakeResultsRenderModel === 'function') {
    try {
      return targetsSignature
        ? adapter.applyEstimatedIntakeResultsRenderModel(arg1, arg2, options)
        : adapter.applyEstimatedIntakeResultsRenderModel(arg1, arg2, arg3, options);
    } catch (error) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', error, { step: '8Q-9', helper: 'VildaEstimatedIntakeDomMount.applyEstimatedIntakeResultsRenderModel' });
      }
    }
  }
  const targets = targetsSignature ? arg1 : { res: arg1 || null, legendEl: arg2 || null };
  const model = targetsSignature ? (arg2 || {}) : (arg3 || {});
  const res = targets.res || targets.resultsEl || targets.mount || null;
  const legendEl = targets.legendEl || null;
  const html = typeof model.html === 'string' ? model.html : '';
  if (res) {
    if (typeof vildaAppSetTrustedHtml === 'function') {
      vildaAppSetTrustedHtml(res, html, 'app:res');
    } else {
      res.innerHTML = String(html || '');
    }
  }
  if (legendEl) {
    legendEl.style.display = model.legendVisible === true ? 'block' : 'none';
  }
  return {
    step: '8Q-9',
    kind: 'estimated-intake-dom-mount-result-fallback',
    branch: model.branch || 'unknown',
    legendVisible: model.legendVisible === true,
    didRenderDom: !!res,
    didSetLegendDisplay: !!legendEl,
    missingResults: !res
  };
}

function getEstimatedIntakeCalcOutputTargets(){
  const adapter = getVildaEstimatedIntakeDomMountAdapter();
  if (adapter && typeof adapter.getEstimatedIntakeCalcOutputTargets === 'function') {
    try {
      return adapter.getEstimatedIntakeCalcOutputTargets(getEstimatedIntakeDomMountOptions());
    } catch (error) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', error, { step: '8Q-9', helper: 'VildaEstimatedIntakeDomMount.getEstimatedIntakeCalcOutputTargets' });
      }
    }
  }
  const res = (typeof document !== 'undefined' && document && typeof document.getElementById === 'function')
    ? document.getElementById('intakeResults')
    : null;
  const legendEl = (typeof document !== 'undefined' && document && typeof document.getElementById === 'function')
    ? document.getElementById('intakeLegend')
    : null;
  return { step: '8Q-9', kind: 'estimated-intake-dom-targets-fallback', hasDocument: typeof document !== 'undefined' && !!document, resultsId: 'intakeResults', legendId: 'intakeLegend', res, resultsEl: res, mount: res, legendEl };
}

function getEstimatedIntakeCalcBranch(inputModel, targets){
  const adapter = getVildaEstimatedIntakeDomMountAdapter();
  if (adapter && typeof adapter.getEstimatedIntakeCalcBranch === 'function') {
    try {
      return adapter.getEstimatedIntakeCalcBranch(inputModel, targets);
    } catch (error) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', error, { step: '8Q-9', helper: 'VildaEstimatedIntakeDomMount.getEstimatedIntakeCalcBranch' });
      }
    }
  }
  const rows = inputModel && Array.isArray(inputModel.rows) ? inputModel.rows : [];
  const rowCount = rows.length || (inputModel && Number.isFinite(Number(inputModel.rowCount)) ? Number(inputModel.rowCount) : 0);
  if (!targets || !(targets.res || targets.resultsEl || targets.mount)) return 'missing-results-mount';
  if (!rowCount) return 'empty-rows-message';
  if (rowCount === 1) return 'single-row-maintenance';
  return 'multi-row-interval-render';
}

function hideEstimatedIntakeLegend(targets){
  const adapter = getVildaEstimatedIntakeDomMountAdapter();
  if (adapter && typeof adapter.hideEstimatedIntakeLegend === 'function') {
    try {
      return adapter.hideEstimatedIntakeLegend(targets || getEstimatedIntakeCalcOutputTargets());
    } catch (error) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', error, { step: '8Q-9', helper: 'VildaEstimatedIntakeDomMount.hideEstimatedIntakeLegend' });
      }
    }
  }
  const safeTargets = targets || getEstimatedIntakeCalcOutputTargets();
  const legendEl = safeTargets && safeTargets.legendEl ? safeTargets.legendEl : null;
  if (legendEl && legendEl.style) {
    legendEl.style.display = 'none';
    return true;
  }
  return false;
}

function describeEstimatedIntakeCalcTargets(targets){
  const adapter = getVildaEstimatedIntakeDomMountAdapter();
  if (adapter && typeof adapter.describeEstimatedIntakeCalcTargets === 'function') {
    try {
      return adapter.describeEstimatedIntakeCalcTargets(targets);
    } catch (error) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', error, { step: '8Q-9', helper: 'VildaEstimatedIntakeDomMount.describeEstimatedIntakeCalcTargets' });
      }
    }
  }
  const safeTargets = targets || {};
  const res = safeTargets.res || safeTargets.resultsEl || safeTargets.mount || null;
  const legendEl = safeTargets.legendEl || null;
  return {
    step: '8Q-9',
    kind: 'estimated-intake-dom-target-description-fallback',
    hasResults: !!res,
    hasLegend: !!legendEl,
    resultsClassName: res ? String(res.className || '') : '',
    resultsHtmlLength: res && typeof res.innerHTML === 'string' ? res.innerHTML.length : null,
    resultsTextLength: res && typeof res.textContent === 'string' ? res.textContent.length : null,
    legendDisplay: legendEl && legendEl.style ? String(legendEl.style.display || '') : ''
  };
}

function sanitizeEstimatedIntakeSeamRow(row, index){
  return {
    index,
    ageMonths: row && Number.isFinite(Number(row.ageMonths)) ? Number(row.ageMonths) : null,
    ageYears: row && Number.isFinite(Number(row.ageYears)) ? Number(row.ageYears) : null,
    months: row && Number.isFinite(Number(row.months)) ? Number(row.months) : null,
    height: row && Number.isFinite(Number(row.height)) ? Number(row.height) : null,
    weight: row && Number.isFinite(Number(row.weight)) ? Number(row.weight) : null
  };
}

function describeEstimatedIntakeWindowStateForSeam(root){
  const source = root || ((typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
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


function describeEstimatedIntakeCalculationModelSummary(model){
  if (!model || typeof model !== 'object') return null;
  return {
    step: model.step || null,
    kind: model.kind || null,
    pureModel: !!model.pureModel,
    rendersDom: !!model.rendersDom,
    commitsWindowState: !!model.commitsWindowState,
    mutatesDom: !!model.mutatesDom,
    mutatesWindowState: !!model.mutatesWindowState,
    branch: model.branch || null,
    rowCount: Number.isFinite(Number(model.rowCount)) ? Number(model.rowCount) : (Array.isArray(model.rows) ? model.rows.length : null),
    intervalsCount: Array.isArray(model.intervals) ? model.intervals.length : null,
    hasChildIntervals: !!model.hasChildIntervals,
    singleKind: model.single && model.single.kind ? model.single.kind : null,
    commitAction: model.commitPlan && model.commitPlan.action ? model.commitPlan.action : null,
    commitRowsCount: model.commitPlan && Array.isArray(model.commitPlan.rows) ? model.commitPlan.rows.length : null,
    commitIntakeKcalPerDay: model.commitPlan ? model.commitPlan.intakeKcalPerDay : null,
    hasPostRenderRiskPlan: !!(model.postRenderRiskPlan && model.postRenderRiskPlan.shouldRun)
  };
}

function vildaGetEstimatedIntakeCalculationModelSnapshot(options){
  const opts = options || {};
  const errors = [];
  const root = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
  const safeCall = (label, fn, fallback) => {
    try {
      return (typeof fn === 'function') ? fn() : fallback;
    } catch (error) {
      errors.push({ label, message: String(error && error.message ? error.message : error) });
      return fallback;
    }
  };

  const inputModel = safeCall('buildEstimatedIntakeCalcInputModel', () => buildEstimatedIntakeCalcInputModel({ updatePalDescription: false }), null);
  const rows = inputModel && Array.isArray(inputModel.rows) ? inputModel.rows : [];
  const shouldExecutePureModel = opts.executePureModel === true;
  let model = null;
  let observedSummary = null;

  if (shouldExecutePureModel && inputModel) {
    const observedModel = safeCall('buildEstimatedIntakeLastObservedModel', () => buildEstimatedIntakeLastObservedModel(inputModel), null);
    observedSummary = observedModel ? {
      hasLastObservedState: !!observedModel.lastObservedState,
      teeFactor: Number.isFinite(Number(observedModel.teeFactor)) ? Number(observedModel.teeFactor) : null,
      hasLastRow: !!observedModel.lastRow,
      lastHeight: Number.isFinite(Number(observedModel.lastHeight)) ? Number(observedModel.lastHeight) : null,
      historyForRiskCount: Array.isArray(observedModel.historyForRisk) ? observedModel.historyForRisk.length : null
    } : null;
    model = safeCall('buildEstimatedIntakeCalculationModel', () => buildEstimatedIntakeCalculationModel(inputModel, observedModel), null);
  }

  const snapshot = {
    step: '8Q-8',
    kind: 'estimated-intake-calculation-model-audit',
    readOnly: true,
    executedCalcEstimatedIntake: false,
    executedDomRender: false,
    committedWindowState: false,
    executedPureModel: shouldExecutePureModel,
    executionPolicy: shouldExecutePureModel
      ? 'Uruchomiono wyłącznie model kalkulacyjny bez renderowania DOM i bez zapisu window.intakeHistory/window.intakeEstimatedKcalPerDay.'
      : 'Domyślnie nie uruchamia modelu kalkulacyjnego; raportuje granicę wydzielenia i dostępność funkcji. Użyj executePureModel=true tylko do read-only próby modelu bez renderowania i commitu.',
    inputSummary: inputModel ? {
      rowsCount: rows.length,
      branchCandidate: !rows.length ? 'empty-rows-message' : (rows.length === 1 ? 'single-row-maintenance' : 'multi-row-interval-render'),
      pal: Number.isFinite(Number(inputModel.pal)) ? Number(inputModel.pal) : null,
      sex: inputModel.sex || (inputModel.basics && inputModel.basics.sex) || null,
      height: Number.isFinite(Number(inputModel.height)) ? Number(inputModel.height) : null,
      historyForRiskCount: Array.isArray(inputModel.historyForRisk) ? inputModel.historyForRisk.length : null
    } : null,
    observedSummary,
    moduleApi: {
      VildaEstimatedIntake: !!(root && root.VildaEstimatedIntake),
      version: root && root.VildaEstimatedIntake ? (root.VildaEstimatedIntake.version || root.VildaEstimatedIntake.VERSION || null) : null,
      buildEstimatedIntakeCalculationModel: !!(root && root.VildaEstimatedIntake && typeof root.VildaEstimatedIntake.buildEstimatedIntakeCalculationModel === 'function'),
      VildaEstimatedIntakeInputModel: !!(root && root.VildaEstimatedIntakeInputModel),
      inputModelVersion: root && root.VildaEstimatedIntakeInputModel ? (root.VildaEstimatedIntakeInputModel.version || root.VildaEstimatedIntakeInputModel.VERSION || null) : null,
      buildEstimatedIntakeCalcInputModel: !!(root && root.VildaEstimatedIntakeInputModel && typeof root.VildaEstimatedIntakeInputModel.buildEstimatedIntakeCalcInputModel === 'function'),
      buildEstimatedIntakeLastObservedModel: !!(root && root.VildaEstimatedIntakeInputModel && typeof root.VildaEstimatedIntakeInputModel.buildEstimatedIntakeLastObservedModel === 'function')
    },
    functions: {
      buildEstimatedIntakeCalculationModel: typeof buildEstimatedIntakeCalculationModel === 'function',
      buildEstimatedIntakeCalculationModelFallback: typeof buildEstimatedIntakeCalculationModelFallback === 'function',
      getVildaEstimatedIntakeCalculationModelDependencies: typeof getVildaEstimatedIntakeCalculationModelDependencies === 'function',
      commitEstimatedIntakeCalcModelWindowState: typeof commitEstimatedIntakeCalcModelWindowState === 'function',
      runEstimatedIntakePostRenderRisk: typeof runEstimatedIntakePostRenderRisk === 'function',
      calcEstimatedIntake: typeof calcEstimatedIntake === 'function'
    },
    boundary: {
      delegatedToModule: ['buildEstimatedIntakeCalculationModel'],
      delegatedToInputModelModule: ['buildEstimatedIntakeCalcInputModel', 'buildEstimatedIntakeLastObservedModel', 'buildEstimatedIntakeHistoryForRisk', 'getVildaEstimatedIntakeCalculationModelDependencies'],
      delegatedToRuntimeModule: ['commitEstimatedIntakeCalcModelWindowState', 'runEstimatedIntakePostRenderRisk'],
      stillInAppJs: ['calcEstimatedIntake orchestration', 'HTML render/mount', 'setupEstimatedIntake', 'intakeAddRow', 'hasPotentialIntakeAlerts'],
      moduleMustNot: ['render DOM', 'write storage', 'mutate estimated intake rows']
    },
    modelSummary: describeEstimatedIntakeCalculationModelSummary(model),
    errors
  };

  if (opts.includeRows === true) {
    snapshot.rows = rows.map(sanitizeEstimatedIntakeSeamRow);
  }

  return snapshot;
}

function vildaGetEstimatedIntakeCalcSeamSnapshot(options){
  const opts = options || {};
  const errors = [];
  const root = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
  const safeCall = (label, fn, fallback) => {
    try {
      return (typeof fn === 'function') ? fn() : fallback;
    } catch (error) {
      errors.push({ label, message: String(error && error.message ? error.message : error) });
      return fallback;
    }
  };

  const inputModel = safeCall('buildEstimatedIntakeCalcInputModel', () => buildEstimatedIntakeCalcInputModel({ updatePalDescription: false }), null);
  const targets = safeCall('getEstimatedIntakeCalcOutputTargets', () => getEstimatedIntakeCalcOutputTargets(), null);
  const rows = inputModel && Array.isArray(inputModel.rows) ? inputModel.rows : [];
  const branch = safeCall('getEstimatedIntakeCalcBranch', () => getEstimatedIntakeCalcBranch(inputModel, targets), 'unknown');
  const basics = inputModel && inputModel.basics ? inputModel.basics : {};

  const snapshot = {
    step: '8Q-9',
    kind: 'estimated-intake-calc-seam-audit',
    readOnly: true,
    executedCalcEstimatedIntake: false,
    executedEnergyObservedState: false,
    executedBuildIntakeIntervals: false,
    executedBuildEstimatedIntakeCalculationModel: false,
    executedRuntimeCommit: false,
    executedPostRenderRisk: false,
    executionPolicy: 'Snapshot czyta model wejściowy i aktualny stan wyjścia, ale nie uruchamia calcEstimatedIntake(), energyBuildIntakeObservedState(), buildIntakeIntervals(), renderowania ani zapisu window.intakeHistory/window.intakeEstimatedKcalPerDay.',
    branch,
    input: inputModel ? {
      basics: {
        sex: basics.sex || null,
        ageYears: Number.isFinite(Number(basics.ageYears)) ? Number(basics.ageYears) : null,
        ageMonths: Number.isFinite(Number(basics.ageMonths)) ? Number(basics.ageMonths) : null,
        weight: Number.isFinite(Number(basics.weight)) ? Number(basics.weight) : null,
        height: Number.isFinite(Number(basics.height)) ? Number(basics.height) : null
      },
      palRaw: inputModel.palRaw == null ? null : String(inputModel.palRaw),
      pal: Number.isFinite(Number(inputModel.pal)) ? Number(inputModel.pal) : null,
      rowsCount: rows.length,
      historyForRiskCount: Array.isArray(inputModel.historyForRisk) ? inputModel.historyForRisk.length : null,
      lastRow: rows.length ? sanitizeEstimatedIntakeSeamRow(rows[rows.length - 1], rows.length - 1) : null
    } : null,
    outputTargets: describeEstimatedIntakeCalcTargets(targets),
    currentWindowState: describeEstimatedIntakeWindowStateForSeam(root),
    calcModel: {
      wrapperAvailable: typeof buildEstimatedIntakeCalculationModel === 'function',
      fallbackAvailable: typeof buildEstimatedIntakeCalculationModelFallback === 'function',
      moduleAvailable: !!(root && root.VildaEstimatedIntake && typeof root.VildaEstimatedIntake.buildEstimatedIntakeCalculationModel === 'function'),
      runtimeModuleAvailable: !!(root && root.VildaEstimatedIntakeRuntime && typeof root.VildaEstimatedIntakeRuntime.commitEstimatedIntakeCalcModelWindowState === 'function'),
      inputModelModuleAvailable: !!(root && root.VildaEstimatedIntakeInputModel && typeof root.VildaEstimatedIntakeInputModel.buildEstimatedIntakeCalcInputModel === 'function'),
      domMountModuleAvailable: !!(root && root.VildaEstimatedIntakeDomMount && typeof root.VildaEstimatedIntakeDomMount.applyEstimatedIntakeResultsRenderModel === 'function'),
      executedBySnapshot: false,
      boundary: 'branch + single/interwały + commitPlan + postRenderRiskPlan; bez DOM i bez zapisu window.intakeHistory/window.intakeEstimatedKcalPerDay'
    },
    functions: {
      calcEstimatedIntake: typeof calcEstimatedIntake === 'function',
      buildEstimatedIntakeCalcInputModel: typeof buildEstimatedIntakeCalcInputModel === 'function',
      buildEstimatedIntakeLastObservedModel: typeof buildEstimatedIntakeLastObservedModel === 'function',
      buildEstimatedIntakeCalculationModel: typeof buildEstimatedIntakeCalculationModel === 'function',
      commitEstimatedIntakeCalcModelWindowState: typeof commitEstimatedIntakeCalcModelWindowState === 'function',
      runEstimatedIntakePostRenderRisk: typeof runEstimatedIntakePostRenderRisk === 'function',
      buildEstimatedIntakeHistoryForRisk: typeof buildEstimatedIntakeHistoryForRisk === 'function',
      buildEstimatedIntakeWindowHistory: typeof buildEstimatedIntakeWindowHistory === 'function',
      getEstimatedIntakeCalcOutputTargets: typeof getEstimatedIntakeCalcOutputTargets === 'function',
      commitEstimatedIntakeWindowState: typeof commitEstimatedIntakeWindowState === 'function',
      clearEstimatedIntakeWindowState: typeof clearEstimatedIntakeWindowState === 'function',
      getVildaEstimatedIntakeRuntimeAdapter: typeof getVildaEstimatedIntakeRuntimeAdapter === 'function',
      getVildaEstimatedIntakeRuntimeDependencies: typeof getVildaEstimatedIntakeRuntimeDependencies === 'function',
      getVildaEstimatedIntakeInputModelAdapter: typeof getVildaEstimatedIntakeInputModelAdapter === 'function',
      getVildaEstimatedIntakeInputModelDependencies: typeof getVildaEstimatedIntakeInputModelDependencies === 'function',
      getVildaEstimatedIntakeDomMountAdapter: typeof getVildaEstimatedIntakeDomMountAdapter === 'function',
      getVildaEstimatedIntakeDomMountDependencies: typeof getVildaEstimatedIntakeDomMountDependencies === 'function',
      applyEstimatedIntakeResultsRenderModel: typeof applyEstimatedIntakeResultsRenderModel === 'function',
      describeEstimatedIntakeCalcTargets: typeof describeEstimatedIntakeCalcTargets === 'function',
      hideEstimatedIntakeLegend: typeof hideEstimatedIntakeLegend === 'function',
      hasPotentialIntakeAlerts: typeof hasPotentialIntakeAlerts === 'function'
    },
    seam: {
      phases: [
        'read-input-model',
        'build-last-observed-energy-context',
        'build-pure-calculation-model',
        'choose-render-branch',
        'delegate-dom-mount',
        'commit-window-state',
        'post-render-risk-checks'
      ],
      preparedHelpers: [
        'buildEstimatedIntakeCalcInputModel',
        'buildEstimatedIntakeLastObservedModel',
        'buildEstimatedIntakeHistoryForRisk',
        'buildEstimatedIntakeWindowHistory',
        'commitEstimatedIntakeWindowState',
        'clearEstimatedIntakeWindowState',
        'buildEstimatedIntakeCalculationModel',
        'commitEstimatedIntakeCalcModelWindowState',
        'runEstimatedIntakePostRenderRisk',
        'getEstimatedIntakeCalcOutputTargets',
        'applyEstimatedIntakeResultsRenderModel'
      ],
      sideEffectBoundaries: [
        'intakeUpdatePalDesc() przez VildaEstimatedIntakeInputModel przy updatePalDescription=true',
        'VildaEstimatedIntakeDomMount.applyEstimatedIntakeResultsRenderModel(...)',
        'VildaEstimatedIntakeDomMount.hideEstimatedIntakeLegend(...)',
        'VildaEstimatedIntakeRuntime.commitEstimatedIntakeCalcModelWindowState(...)',
        'VildaEstimatedIntakeRuntime.runEstimatedIntakePostRenderRisk(...)',
        'window.intakeHistory / window.intakeEstimatedKcalPerDay przez runtime adapter',
        'energyBuildIntakeObservedState(... mountId=intakeResults) przez runtime adapter',
        'window.check12mLossOrange(...) przez runtime adapter'
      ],
      keepInAppJsForNow: [
        'calcEstimatedIntake',
        'hasPotentialIntakeAlerts',
        'setupEstimatedIntake / intakeAddRow DOM rows'
      ],
      nextRecommendedStep: '8Q-10 — estimated intake orchestration diagnostics and acceptance hardening'
    },
    errors
  };

  if (opts.includeRows === true) {
    snapshot.rows = rows.map(sanitizeEstimatedIntakeSeamRow);
  }

  if (opts.includeWindowState === true && root) {
    snapshot.windowState = {
      intakeHistory: Array.isArray(root.intakeHistory) ? root.intakeHistory.map((row) => Object.assign({}, row)) : root.intakeHistory,
      intakeEstimatedKcalPerDay: root.intakeEstimatedKcalPerDay
    };
  }

  return snapshot;
}

/* ——— obliczenia + render (tabela dla desktop; karty – wariant A – dla mobile) ——— */
function calcEstimatedIntake(){
  const inputModel = buildEstimatedIntakeCalcInputModel({ updatePalDescription: true });
  const observedModel = buildEstimatedIntakeLastObservedModel(inputModel);
  const calcModel = buildEstimatedIntakeCalculationModel(inputModel, observedModel);
  const rows = calcModel && Array.isArray(calcModel.rows) ? calcModel.rows : inputModel.rows;

  const targets = getEstimatedIntakeCalcOutputTargets();
  hideEstimatedIntakeLegend(targets);
  const res = targets && (targets.res || targets.resultsEl || targets.mount);
  if(!res) return;
  clearIntakeResultsAlertState('intakeResults');

  const renderModel = buildEstimatedIntakeResultsRenderModel(calcModel);
  applyEstimatedIntakeResultsRenderModel(targets, renderModel);

  if(!rows.length){
    try {
      commitEstimatedIntakeCalcModelWindowState(calcModel);
    } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', _, { step: '8Q-7', helper: 'calcEstimatedIntake:clearModelCommit' });
      }
    }
    return;
  }

  try {
    commitEstimatedIntakeCalcModelWindowState(calcModel);
    runEstimatedIntakePostRenderRisk(calcModel);
  } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { step: '8Q-7', helper: 'calcEstimatedIntake:commitAndPostRenderRisk' });
    }
  }
}

/* ——— debounce ——— */
let intakeTimer=null;
function debouncedIntakeCalc(){
  clearTimeout(intakeTimer);
  intakeTimer = setTimeout(calcEstimatedIntake, 200);
}

/* ——— automatyczny reset przy zmianach w „Dane użytkownika” ——— */
function resetIntakeCard(){
  const card = document.getElementById('intakeCard');
  const meas = document.getElementById('intakeMeasurements');
  const res  = document.getElementById('intakeResults');
  if(card) card.style.display='none';        // zamknij
  intakeAutofilledOnce = false;              // pozwól na ponowne wypełnienie
  if(meas) vildaAppClearHtml(meas);
  if(res)  vildaAppClearHtml(res);
  clearIntakeResultsAlertState('intakeResults');
  // Wyczyść globalne zmienne historii i szacowanego spożycia
  try {
    clearEstimatedIntakeWindowState();
  } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 32810 });
    }
  }
}
function shouldSuspendIntakeUserReset(){
  try {
    if (typeof window === 'undefined') return false;
    return !!(window.__vildaPersistRestoring || window.__vildaSuspendIntakeUserReset);
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 32816 });
    }
  }
  return false;
}
function wireAutosyncIntakeWithUserData(){
  const handleUserBasicsMutation = (ev)=>{
    if (shouldSuspendIntakeUserReset()) return;
    resetIntakeCard(ev);
  };
  ['age','ageMonths','sex','weight','height'].forEach(id=>{
    const el = document.getElementById(id);
    if(!el) return;
    // input oraz change – aby zareagować i na wpisywanie, i na wybór z listy
    el.addEventListener('input', handleUserBasicsMutation);
    el.addEventListener('change', handleUserBasicsMutation);
  });
}

/**
 * Steruje widocznością czerwonych przycisków „×” do usuwania wierszy w karcie
 * Szacowanego spożycia energii. Jeśli istnieje tylko jeden wiersz, przycisk
 * usuwania jest ukrywany, aby użytkownik nie mógł usunąć ostatniego pomiaru.
 */
function updateIntakeHistoryRowMarkers(){
  const rows = Array.from(document.querySelectorAll('#intakeMeasurements .measure-row-intake'));
  rows.forEach((row, idx) => {
    const isCurrent = idx === 0 || row.dataset.locked === 'true';
    row.classList.toggle('intake-current-row', isCurrent);
    row.classList.toggle('intake-history-row', !isCurrent);
    row.dataset.intakeRowType = isCurrent ? 'current' : 'history';
  });
}

function syncIntakeHistoryDividers(){
  const wrap = document.getElementById('intakeMeasurements');
  if (!wrap) return;

  wrap.querySelectorAll('.intake-history-divider').forEach(divider => divider.remove());

  const rows = Array.from(wrap.querySelectorAll('.measure-row-intake'));
  rows.forEach((row, idx) => {
    if (idx === 0 || !row.classList.contains('intake-history-row')) return;

    const divider = document.createElement('div');
    divider.className = 'intake-history-divider';
    divider.setAttribute('aria-hidden', 'true');
    wrap.insertBefore(divider, row);
  });
}

function updateIntakeRemoveButtons(){
  const rows = Array.from(document.querySelectorAll('#intakeMeasurements .measure-row-intake'));
  const historyRows = rows.filter(row => row.dataset.locked !== 'true');
  updateIntakeHistoryRowMarkers();
  syncIntakeHistoryDividers();
  rows.forEach(row=>{
    const btn = row.querySelector('.remove-intake-row');
    if(!btn) return;
    if (row.dataset.locked === 'true') {
      btn.style.display = 'none';
      return;
    }
    const historyIdx = historyRows.indexOf(row);
    const onlyStarterRow = historyRows.length === 1 && historyIdx === 0 && !_intakeRowHasAnyData(row);
    btn.style.display = onlyStarterRow ? 'none' : 'inline-block';
  });
}

/* ——— setup ——— */
function setupEstimatedIntake(){
  const btn   = document.getElementById('toggleIntakeCard');
  const card  = document.getElementById('intakeCard');
  const addBtn= document.getElementById('intakeAddRow');
  if(!btn || !card) return;

  function getIntakeBasicsState(){
  const anthroValidation = (typeof vildaGetMainAnthroValidationSnapshot === 'function')
    ? vildaGetMainAnthroValidationSnapshot()
    : null;
  const weight = anthroValidation && anthroValidation.weight && anthroValidation.weight.value != null
    ? anthroValidation.weight.value
    : parseFloat(document.getElementById('weight')?.value);
  const height = anthroValidation && anthroValidation.height && anthroValidation.height.value != null
    ? anthroValidation.height.value
    : parseFloat(document.getElementById('height')?.value);
  const ageDec = anthroValidation && anthroValidation.age && anthroValidation.age.value != null
    ? anthroValidation.age.value
    : (typeof getAgeDecimal === 'function' ? getAgeDecimal() : 0);
  const sex = document.getElementById('sex')?.value || 'M';

  const hasValidAge    = anthroValidation
    ? anthroValidation.age.validNonNegative
    : (!isNaN(ageDec) && ageDec >= 0 && ageDec <= 130);
  const hasValidWeight = !isNaN(weight) && weight >= 1 && weight <= 500;
  const hasValidHeight = !isNaN(height) && height >= 40 && height <= 250;

  return {
    weight,
    height,
    ageDec,
    sex,
    visible: hasValidAge && hasValidWeight && hasValidHeight
  };
}

function shouldAutoExpandIntakeCard(state){
  const basics = state || getIntakeBasicsState();
  if (!basics.visible) return false;

  const bmi = basics.weight / Math.pow(basics.height / 100, 2);
  if (!isFinite(bmi) || bmi <= 0) return false;

  let bmiSuggestsExcessWeight = false;
  let coleSuggestsExcessWeight = false;

  if (basics.ageDec >= 18) {
    bmiSuggestsExcessWeight = bmi >= 25;
  } else {
    try {
      const months = Math.round(basics.ageDec * 12);
      if (typeof bmiCategoryChild === 'function') {
        const category = bmiCategoryChild(bmi, basics.sex, months);
        bmiSuggestsExcessWeight = (category === 'Nadwaga') || (typeof category === 'string' && category.indexOf('Otyłość') === 0);
      } else if (typeof bmiPercentileChild === 'function') {
        const percentile = bmiPercentileChild(bmi, basics.sex, months);
        bmiSuggestsExcessWeight = isFinite(percentile) && percentile >= 85;
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 32931 });
    }
  }

    try {
      const cole = Number(window.colePercentValue);
      coleSuggestsExcessWeight = isFinite(cole) && cole >= 110;
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 32936 });
    }
  }
  }

  if (bmiSuggestsExcessWeight || coleSuggestsExcessWeight) {
    return true;
  }

  return hasPotentialIntakeAlerts(basics);
}

function openIntakeCard(options){
  const opts = options || {};
  card.style.display = 'block';

  const wrap = document.getElementById('intakeMeasurements');
  const hasRows = !!(wrap && wrap.querySelector('.measure-row-intake'));

  if (!opts.preserveRows || !hasRows) {
    intakeAutofill();
    _updateIntakeFirstRowFromUserBasics();
  } else {
    try { if (typeof updateIntakeRemoveButtons === 'function') updateIntakeRemoveButtons(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 32957 });
    }
  }
  }

  try {
    if (typeof window !== 'undefined' && typeof window.vildaEnsureAdvancedIntakePairing === 'function') {
      window.vildaEnsureAdvancedIntakePairing();
    }
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 32964 });
    }
  }

  try { calcEstimatedIntake(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 32966 });
    }
  }
}

  // Funkcja pomocnicza sterująca widocznością przycisku „Szacowane spożycie energii”.
  // Przycisk jest widoczny dopiero, gdy użytkownik wprowadzi masę, wzrost i wiek.
  function updateIntakeToggleVisibility(options){
    const opts = options || {};
    const state = getIntakeBasicsState();

    btn.style.display = state.visible ? 'block' : 'none';


    if(!state.visible){
      // Zamknij kartę, jeśli przestaje spełniać warunek
      card.style.display = 'none';
      return;
    }

    const intakePalEl = document.getElementById('intakePal');
    if (intakePalEl) {
      const ageMonthsOpt = parseFloat(document.getElementById('ageMonths')?.value) || 0;
      const currentPal = intakePalEl.value || document.getElementById('palFactor')?.value || '1.4';
      energyPopulateIntakePalSelect(intakePalEl, {
        ageYears: state.ageDec,
        ageMonthsOpt,
        value: currentPal
      });
      intakeUpdatePalDesc();
    }

    if (shouldAutoExpandIntakeCard(state)) {
      openIntakeCard({ preserveRows: opts.preserveRows !== false });
      return;
    }

    if (opts.recalcIfOpen && card.style.display !== 'none') {
      try { calcEstimatedIntake(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 33002 });
    }
  }
    }
  }

  try {
    window.refreshEstimatedIntakeVisibility = updateIntakeToggleVisibility;
    window.shouldAutoExpandEstimatedIntakeCard = shouldAutoExpandIntakeCard;
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 33009 });
    }
  }

  wireAutosyncIntakeWithUserData();

  // dodaj nasłuchy na wprowadzane dane użytkownika
  ['weight','height','age','ageMonths','sex'].forEach(id=>{
    const el = document.getElementById(id);
    if(el){
      el.addEventListener('input', ()=> updateIntakeToggleVisibility({ preserveRows: true, recalcIfOpen: true }));
      el.addEventListener('change', ()=> updateIntakeToggleVisibility({ preserveRows: true, recalcIfOpen: true }));
    }
  });

  document.querySelectorAll('input[name="dataSource"]').forEach(el => {
    el.addEventListener('change', ()=> updateIntakeToggleVisibility({ preserveRows: true, recalcIfOpen: true }));
  });

  // natychmiastowa ocena widoczności przy pierwszym załadowaniu
  updateIntakeToggleVisibility({ preserveRows: true, recalcIfOpen: true });
  // Uruchom ponownie po pozostałych listenerach DOMContentLoaded (np. przywracaniu stanu kart).
  window.setTimeout(()=>{
    updateIntakeToggleVisibility({ preserveRows: true, recalcIfOpen: true });
  }, 0);

  btn.addEventListener('click', ()=>{
    const show = (card.style.display === 'none' || card.style.display === '');
    if (show) {
      openIntakeCard({ preserveRows: true });
    } else {
      card.style.display = 'none';
    }
  });

  if(addBtn){
    addBtn.addEventListener('click', (e)=>{
      e.preventDefault();
      if (typeof window !== 'undefined' && typeof window.vildaHandleIntakeHistoryAdd === 'function') {
        window.vildaHandleIntakeHistoryAdd();
      } else {
        intakeAddRow();
      }
    });
  }
  document.getElementById('intakePal')?.addEventListener('change', debouncedIntakeCalc);

  // przelicz wyniki przy rotacji/zmianie szerokości, aby zachować poprawny układ sekcji
  window.addEventListener('resize', ()=>{
    const visible = card && card.style.display !== 'none';
    if(visible) calcEstimatedIntake();
  });
}

window.vildaAppOnReady('app:estimated-intake-init', setupEstimatedIntake);
/* ================= WHR – stałe i dane =================== */

// Progi WHO dla dorosłych (otyłość brzuszna / zwiększone ryzyko)
const ADULT_WHR_LIMIT = { M: 0.90, F: 0.85 }; // WHO Expert Consultation, 2008/2011. (dokumentacja w UI) 

// --- POLSKIE CENTYLE OLAF/OLA: TALIA (cm) – CHŁOPCY 3–18 l. ---
const WAIST_PL_BOYS = {
  3:[45.1,45.9,47.3,49.2,51.5,53.9,55.7], 4:[46.2,47.1,48.7,50.7,53.2,55.9,57.9],
  5:[47.3,48.2,49.9,52.2,54.9,58.1,60.4], 6:[48.4,49.4,51.2,53.7,56.8,60.5,63.2],
  7:[49.5,50.6,52.6,55.4,58.9,63.1,66.3], 8:[50.7,51.8,54.1,57.2,61.2,66.0,69.8],
  9:[51.9,53.2,55.7,59.1,63.6,69.1,73.6], 10:[53.2,54.6,57.3,61.0,66.0,72.1,77.1],
  11:[54.7,56.2,59.1,63.0,68.2,74.7,80.0], 12:[56.5,58.0,61.0,65.0,70.3,76.9,82.2],
  13:[58.5,60.0,63.0,67.0,72.3,78.7,83.7], 14:[60.6,62.1,65.1,69.0,74.1,80.2,84.9],
  15:[62.7,64.2,67.1,71.0,75.9,81.6,86.0], 16:[64.7,66.2,69.1,72.9,77.7,83.2,87.4],
  17:[66.5,68.0,70.9,74.8,79.6,85.1,89.2], 18:[68.1,69.7,72.7,76.6,81.5,87.1,91.2]
};
// --- TALIA – DZIEWCZĘTA ---
const WAIST_PL_GIRLS = {
  3:[44.0,44.9,46.4,48.4,50.8,53.3,55.1], 4:[45.1,46.0,47.6,49.8,52.4,55.3,57.3],
  5:[46.0,46.9,48.7,51.1,54.0,57.2,59.5], 6:[46.9,47.9,49.8,52.4,55.5,59.1,61.7],
  7:[47.9,49.0,51.0,53.8,57.2,61.2,64.2], 8:[49.0,50.2,52.4,55.4,59.2,63.6,67.1],
  9:[50.4,51.7,54.0,57.3,61.4,66.4,70.2], 10:[51.9,53.2,55.7,59.2,63.6,69.0,73.3],
  11:[53.6,54.9,57.5,61.1,65.7,71.3,75.8], 12:[55.4,56.8,59.4,63.0,67.6,73.2,77.5],
  13:[57.3,58.6,61.2,64.7,69.2,74.6,78.7], 14:[58.8,60.1,62.7,66.1,70.4,75.6,79.5],
  15:[59.9,61.2,63.7,67.0,71.3,76.2,80.0], 16:[60.6,61.9,64.3,67.6,71.8,76.6,80.3],
  17:[61.0,62.3,64.8,68.1,72.2,76.9,80.5], 18:[61.4,62.7,65.1,68.4,72.5,77.2,80.7]
};
// --- BIODRA – CHŁOPCY ---
const HIP_PL_BOYS = {
  3:[48.3,49.2,50.8,53.0,55.6,58.5,60.6], 4:[50.5,51.5,53.2,55.6,58.4,61.6,63.9],
  5:[52.5,53.6,55.5,58.1,61.3,64.9,67.4], 6:[54.6,55.8,58.0,60.9,64.4,68.5,71.4],
  7:[56.9,58.2,60.6,63.9,67.9,72.5,75.8], 8:[59.2,60.7,63.4,67.0,71.5,76.6,80.4],
  9:[61.5,63.1,66.2,70.2,75.1,80.7,84.8], 10:[63.8,65.6,68.9,73.3,78.7,84.7,89.0],
  11:[66.2,68.2,71.8,76.5,82.1,88.3,92.7], 12:[69.0,71.1,74.8,79.7,85.5,91.7,96.1],
  13:[72.2,74.3,78.1,83.0,88.8,94.9,99.1], 14:[75.7,77.7,81.5,86.2,91.7,97.6,101.6],
  15:[79.1,81.1,84.6,89.1,94.3,99.7,103.5], 16:[82.1,83.9,87.2,91.4,96.3,101.4,104.9],
  17:[84.5,86.2,89.3,93.3,98.0,102.8,106.2], 18:[86.5,88.1,91.1,94.9,99.3,104.0,107.2]
};
// --- BIODRA – DZIEWCZĘTA ---
const HIP_PL_GIRLS = {
  3:[48.6,49.6,51.4,53.6,56.1,58.8,60.5], 4:[50.6,51.7,53.7,56.2,59.2,62.3,64.4],
  5:[52.6,53.8,56.0,58.8,62.0,65.6,68.0], 6:[54.8,56.1,58.4,61.4,64.9,68.8,71.5],
  7:[57.2,58.6,61.0,64.3,68.2,72.4,75.4], 8:[59.7,61.1,63.8,67.3,71.6,76.3,79.7],
  9:[62.1,63.7,66.7,70.6,75.2,80.3,83.9], 10:[64.4,66.2,69.5,73.8,78.8,84.2,87.9],
  11:[67.1,69.0,72.7,77.3,82.7,88.5,92.5], 12:[70.8,72.9,76.6,81.4,87.0,92.9,96.9],
  13:[75.1,77.2,81.0,85.7,91.1,96.6,100.2], 14:[79.0,81.0,84.5,89.0,94.0,99.0,102.4],
  15:[81.9,83.7,87.0,91.1,95.8,100.7,103.9], 16:[83.5,85.2,88.4,92.3,96.9,101.6,104.8],
  17:[84.5,86.1,89.2,93.0,97.5,102.2,105.5], 18:[85.0,86.7,89.7,93.5,97.9,102.6,105.8]
};

// Centyle w kolejności: 5,10,25,50,75,90,95  (zgodne z tablicami)
const CENT_LIST = [5,10,25,50,75,90,95];

/* --------- pomoc: interpolacja centyla dla danej wartości --------- */
function percentileFromBand(value, arrVals){
  // arrVals: [v5,v10,v25,v50,v75,v90,v95]
  // poniżej najniższego ➔ <5 c.; powyżej najwyższego ➔ >95 c.
  if (value <= arrVals[0]) {
    // liniowo 0..5
    const p = (value/arrVals[0])*5;
    return Math.max(0, Math.min(5, p));
  }
  if (value >= arrVals[arrVals.length-1]) {
    // liniowo 95..100
    const v2 = arrVals[arrVals.length-1], v1 = arrVals[arrVals.length-2];
    const slope = (100-95)/(v2-v1);
    return Math.min(100, 95 + (value - v1)*slope);
  }
  // szukamy przedziału
  for (let i=0;i<arrVals.length-1;i++){
    const vL = arrVals[i], vU = arrVals[i+1];
    if (value >= vL && value <= vU){
      const frac = (value - vL)/(vU - vL || 1);
      const pL = CENT_LIST[i], pU = CENT_LIST[i+1];
      return pL + frac*(pU-pL);
    }
  }
  return 50;
}

/* Interpolacja po wieku (3..18 lat): oblicz centyl dla dwóch wieku brzegowych i zinterpoluj */
function childPercentileFromTables(ageY, sex, waistCm, hipCm){
  if (ageY < 3 || ageY > 18 || !sex) return null;
  const tblW = sex==='M' ? WAIST_PL_BOYS : WAIST_PL_GIRLS;
  const tblH = sex==='M' ? HIP_PL_BOYS   : HIP_PL_GIRLS;
  const aLo = Math.max(3, Math.min(18, Math.floor(ageY)));
  const aHi = Math.max(3, Math.min(18, Math.ceil(ageY)));
  const t = (aHi===aLo) ? 0 : (ageY - aLo)/(aHi - aLo);

  const wLo = percentileFromBand(waistCm, tblW[aLo] || tblW[aHi]);
  const wHi = percentileFromBand(waistCm, tblW[aHi] || tblW[aLo]);
  const hLo = percentileFromBand(hipCm,   tblH[aLo] || tblH[aHi]);
  const hHi = percentileFromBand(hipCm,   tblH[aHi] || tblH[aLo]);

  return {
    waistP: wLo + t*(wHi - wLo),
    hipP:   hLo + t*(hHi - hLo)
  };
}

/* Oblicz WHR (waist/hip) z ochroną przed zerem */
function computeWHR(waistCm, hipCm){
  const w = parseFloat(waistCm)||0, h = parseFloat(hipCm)||0;
  if (w<=0 || h<=0) return null;
  return +(w/h).toFixed(2);
}

/* Interpretacja WHR – zwraca obiekt do renderu (z polami state, waistP, hipP) */
function interpretWHR(ageY, sex, waistCm, hipCm, bmiVal, bmiPercentile, coleCat){
  const whr = computeWHR(waistCm, hipCm);
  if (whr===null) return null;

  let header = `WHR: <span class="result-val">${whr}</span>`; // zostawiamy dla zgodności, ale nie używamy w renderze A
  let interp = '';
  let tableHtml = '';
  let showTable = false;

  // NOWE: stan i centyle
  let state = 'ok';
  let waistP = null, hipP = null;

  if (ageY >= 18){ // DOROŚLI – WHO
    const lim = ADULT_WHR_LIMIT[sex] || 0.90;
    const ok = whr <= lim;
    state = ok ? 'ok' : 'bad';
    if (ok){
      // Zamieniamy separator dziesiętny na przecinek dla progu WHR u dorosłych
      interp = `Rozmieszczenie tkanki tłuszczowej <strong>w normie</strong> (próg ${lim.toFixed(2).replace('.', ',')}).`;
    }else{
      // Zamieniamy separator dziesiętny na przecinek dla przekroczenia progu WHR u dorosłych
      interp = `WHR przekracza próg WHO (${lim.toFixed(2).replace('.', ',')}) – <strong>otyłość brzuszna</strong>, zwiększone ryzyko sercowo‑metaboliczne.`;
    }
  } else {
    // DZIECI – centyle TALII/BIODER; WHR podajemy liczbowo
    const pc = childPercentileFromTables(ageY, sex, waistCm, hipCm);
    if (pc){
      waistP = pc.waistP; hipP = pc.hipP;

      // kategoryzacja ryzyka wg talii (spójna z Twoim opisem)
      if (pc.waistP >= 95){
        state = 'bad';
      } else if (pc.waistP >= 85){
        state = 'warn';
      } else {
        state = 'ok';
      }

      const waistTxt = `${pc.waistP.toFixed(0)} centyl`;
      const hipTxt   = `${pc.hipP.toFixed(0)} centyl`;
      const risk =
        (state==='bad')  ? 'Talia &ge;95. centyla – <strong>istotnie podwyższone ryzyko otyłości brzusznej</strong>.'
      : (state==='warn') ? 'Talia &ge;85. centyla – <strong>podwyższony</strong> WHR/ryzyko centralizacji tkanki tłuszczowej.'
                         : 'Proporcje talii do bioder <strong>w normie</strong> dla wieku.';

      interp = risk;
      showTable = true;
      tableHtml = `
        <table>
          <thead><tr><th>Parametr</th><th>Wartość</th><th>Centyl</th></tr></thead>
          <tbody>
            <tr><td>Obwód talii</td><td>${waistCm.toFixed ? waistCm.toFixed(1).replace('.', ',') : waistCm} cm</td><td>${pc.waistP.toFixed(0)} c.</td></tr>
            <tr><td>Obwód bioder</td><td>${hipCm.toFixed ? hipCm.toFixed(1).replace('.', ',') : hipCm} cm</td><td>${pc.hipP.toFixed(0)} c.</td></tr>
          </tbody>
        </table>`;
    } else {
      interp = 'Dla wieku poniżej 3 lat lub powyżej 18 lat tabele pediatryczne nie są dostępne.';
    }
  }

  // Notka edukacyjna – zostaje jak było u Ciebie
  let note = '';
  if (ageY>=18){
    const lim = ADULT_WHR_LIMIT[sex] || 0.90;
    if (bmiVal && bmiVal<25 && whr>lim){
      note = 'Mimo prawidłowego BMI, wysoki WHR sugeruje odkładanie tłuszczu w okolicy brzucha (zwiększone ryzyko metaboliczne).';
    }
  } else if (bmiPercentile!=null){
    const coleOver = (coleCat==='Nadwaga' || String(coleCat).startsWith('Otyłość'));
    if (bmiPercentile<85 && coleOver){
      note = 'BMI w normie, ale wskaźnik Cole’a wskazuje nadwagę – WHR pomaga ocenić typ otłuszczenia (centralny vs gynoidalny).';
    }
  }

  return { whr, header, interp, tableHtml, showTable, note, state, waistP, hipP };
}

/* Kiedy zasugerować WHR (baner w karcie) */
function shouldSuggestWHR(ageY, sex, bmiVal, bmiPercentile, coleCat){
  if (!ageY || !sex || !bmiVal) return false;
  if (ageY >= 18){
    return bmiVal > 24; // dorosły BMI >24
  } else {
    const coleOver = (coleCat==='Nadwaga' || String(coleCat).startsWith('Otyłość'));
    return (bmiPercentile!=null && bmiPercentile >= 85) || (bmiPercentile!=null && bmiPercentile < 85 && coleOver);
  }
}

/* === Idealna waga – obsługa UI karty "Droga do normy BMI" === */
(function(){
  // Obliczenie mediany BMI (50. centyla) na podstawie danych LMS
  function medianBMI(sex, months) {
    if (typeof getLMS !== 'function') return null;
    const lms = getLMS(sex, Math.round(months));
    return lms ? lms[1] : null;
  }

  // Oblicz i wyświetl idealną wagę po kliknięciu
  function renderIdealWeight() {
    const infoEl = document.getElementById('idealWeightInfo');
    if (!infoEl) return;
    const weight = parseFloat(document.getElementById('weight')?.value) || 0;
    const height = parseFloat(document.getElementById('height')?.value) || 0;
    const ageDec = (typeof getAgeDecimal === 'function') ? getAgeDecimal() : 0;
    const sex    = document.getElementById('sex')?.value || 'M';
    if (!(height > 0)) {
      infoEl.style.display = 'none';
      vildaAppClearHtml(infoEl);
      return;
    }
    const hMeters = height / 100;
    let idealW = null;
    let msg = '';
    if (ageDec >= 18) {
      // Dorośli – „idealna” masa ciała liczona dla BMI = 22,0
      const targetBMI = 22.0;
      idealW = targetBMI * hMeters * hMeters;
      // Zamieniamy separator dziesiętny na przecinek dla idealnej masy ciała u dorosłych
      msg = `Dla Twojego wzrostu orientacyjna „idealna” masa ciała to ok. ${idealW.toFixed(1).replace('.', ',')}&nbsp;kg (BMI&nbsp;22,0).`;
    } else {
      // Dzieci – korzystamy z 50. centyla BMI dla wieku i płci
      const months = Math.round(ageDec * 12);
      const mBMI = medianBMI(sex, months);
      if (mBMI == null) {
        infoEl.style.display = 'block';
        vildaAppSetTrustedHtml(infoEl, `<strong>Brak danych referencyjnych BMI 50. centyla dla tego wieku.</strong>`, 'app:infoEl');
        return;
      }
      idealW = mBMI * hMeters * hMeters;
      // Zamieniamy separator dziesiętny na przecinek dla idealnej masy ciała u dzieci
      msg = `Przy Twoim wzroście i wieku idealna masa ciała (50. centyl BMI) to około ${idealW.toFixed(1).replace('.', ',')}&nbsp;kg.`;
    }
    infoEl.style.display = 'block';
    vildaAppSetTrustedHtml(infoEl, `<strong>${msg}</strong>`, 'app:infoEl');
  }

  // Funkcja pomocnicza umożliwiająca naprzemienne wyświetlanie lub ukrywanie
  // informacji o idealnej wadze po kliknięciu przycisku. Jeśli wynik
  // aktualnie jest widoczny, zostaje schowany, w przeciwnym razie obliczany
  // jest na nowo przez funkcję renderIdealWeight(). Ta funkcja nie powinna
  // być wywoływana z poziomu update, aby uniknąć przypadkowego ukrywania
  // wyniku podczas automatycznych aktualizacji.
  function toggleIdealWeight() {
    const infoEl = document.getElementById('idealWeightInfo');
    if (!infoEl) return;
    // Jeżeli wynik jest widoczny – ukryj i wyczyść zawartość
    if (infoEl.style.display !== 'none' && vildaAppHasHtmlContent(infoEl)) {
      infoEl.style.display = 'none';
      vildaAppClearHtml(infoEl);
    } else {
      // W innym przypadku oblicz i pokaż na nowo
      renderIdealWeight();
    }
  }

  // Sprawdź, czy BMI jest w normie, i pokaż/ukryj przycisk i notatkę
  function updateIdealWeightUI() {
    const noteEl  = document.getElementById('toNormNote');
    const wrapEl  = document.getElementById('idealWeightWrap');
    const infoEl  = document.getElementById('idealWeightInfo');
    const btnEl   = document.getElementById('idealWeightBtn');
    if (!noteEl || !wrapEl) return;
    // Pobierz dane wejściowe
    const weight = parseFloat(document.getElementById('weight')?.value) || 0;
    const height = parseFloat(document.getElementById('height')?.value) || 0;
    const ageDec = (typeof getAgeDecimal === 'function') ? getAgeDecimal() : 0;
    const sex    = document.getElementById('sex')?.value || 'M';
    // Gdy brak pełnych danych, ukryj oba elementy
    if (!(weight > 0 && height > 0)) {
      noteEl.style.display = 'none';
      wrapEl.style.display = 'none';
      if (infoEl) {
        infoEl.style.display = 'none';
        vildaAppClearHtml(infoEl);
      }
      return;
    }
    // Oblicz BMI
    const bmi = weight / Math.pow(height / 100, 2);
    let isNormal = false;
    if (ageDec >= 18) {
      // Dorośli: BMI w normie jeśli 18.5 ≤ BMI < 25
      isNormal = (bmi >= 18.5 && bmi < 25);
    } else {
      const months = Math.round(ageDec * 12);
      let percentile = null;
      if (typeof bmiPercentileChild === 'function') {
        percentile = bmiPercentileChild(bmi, sex, months);
      }
      if (percentile == null || isNaN(percentile)) {
        // Brak danych – ukryj oba elementy
        noteEl.style.display = 'none';
        wrapEl.style.display = 'none';
        if (infoEl) {
          infoEl.style.display = 'none';
          vildaAppClearHtml(infoEl);
        }
        return;
      }
      // Dzieci: BMI w normie jeśli 5 ≤ centyl < 85
      isNormal = (percentile >= 5 && percentile < 85);
    }
    // Notatka „szacunkowa liczba km…” pokazuje się, gdy BMI NIE jest w normie
    noteEl.style.display = isNormal ? 'none' : 'inline';
    // Przycisk do idealnej wagi pokazujemy, gdy BMI jest w normie
    wrapEl.style.display = isNormal ? 'block' : 'none';
    // Gdy wychodzimy z normy – ukryj wynik
    if (!isNormal && infoEl) {
      infoEl.style.display = 'none';
      vildaAppClearHtml(infoEl);
    }
    // Podpinamy zdarzenie kliknięcia (jednorazowe oznaczenie data-attr)
    if (isNormal && btnEl && !btnEl.dataset.idealAttached) {
      // Do przycisku dopinamy toggleIdealWeight zamiast bezpośrednio renderować wynik.
      // Dzięki temu kolejne kliknięcia będą naprzemiennie pokazywać i ukrywać tekst.
      btnEl.addEventListener('click', toggleIdealWeight);
      btnEl.dataset.idealAttached = '1';
    }
    // Jeśli wynik idealnej wagi jest już widoczny – przelicz go na żywo przy zmianie danych
    if (isNormal && infoEl && infoEl.style.display !== 'none') {
      renderIdealWeight();
    }
  }
  // Po załadowaniu strony obliczamy i ustawiamy widoczność
  window.vildaAppOnReady('app:ideal-weight-ui-init', function initIdealWeightUi() {
    updateIdealWeightUI();
  });

  // 8O-10d-c: drugi wrapper app.js po window.update został przepięty na
  // VildaUpdateHooks. Sam bridge pozostaje zainstalowany w bloku BMI p50, dzięki
  // czemu kolejność jest zachowana: poprzedni update() → hook BMI p50 → hook UI idealnej wagi.
  const IDEAL_WEIGHT_AFTER_UPDATE_HOOK_ID = 'app:ideal-weight-ui-after-update';

  function updateIdealWeightUIAfterUpdate(context) {
    const source = context && context.source ? String(context.source) : '';
    if (source && source !== 'window.update' && source !== 'window.update-fallback') {
      return { skipped: true, reason: 'non-window-update-context', source };
    }
    updateIdealWeightUI();
    return { skipped: false };
  }

  let idealWeightHookRegistered = false;
  let idealWeightHookToken = null;
  if (typeof window !== 'undefined' && window.VildaUpdateHooks && typeof window.VildaUpdateHooks.registerAfterUpdateHook === 'function') {
    try {
      idealWeightHookToken = window.VildaUpdateHooks.registerAfterUpdateHook(updateIdealWeightUIAfterUpdate, {
        id: IDEAL_WEIGHT_AFTER_UPDATE_HOOK_ID,
        label: 'Ideal weight UI after update',
        group: 'app-update-migrated-wrapper',
        order: 20,
        replace: true
      });
      idealWeightHookRegistered = !!(idealWeightHookToken && idealWeightHookToken.ok === true);
    } catch (_) {
      idealWeightHookRegistered = false;
    }
  }
  if (typeof window !== 'undefined') {
    window.__vildaIdealWeightUIAfterUpdateHookId = IDEAL_WEIGHT_AFTER_UPDATE_HOOK_ID;
    window.__vildaIdealWeightUIAfterUpdateHookRegistered = idealWeightHookRegistered;
    window.__vildaIdealWeightUIAfterUpdateFallback = updateIdealWeightUIAfterUpdate;
  }
})();
/* === BMI-p50 helpers (EBW) – polyfill dla modułu ryzyka AN ==================
   Używa getLMS(sex, ageMonths) ➔ [L, M, S], gdzie M = 50. centyl BMI.
   Zakres wieku: 0–216 mies.  Zwraca liczbę (BMI p50) lub null.
   Idempotentne: nie nadpisuje istniejących implementacji. */

   (function () {
    function _bmiP50FromLMS(ageMonths, sex) {
      const m = Math.round(Number(ageMonths));
      const s = (sex === 'M') ? 'M' : 'F';
      if (!isFinite(m) || m < 0 || m > 216) return null;
      if (typeof getLMS !== 'function') return null;
      const lms = getLMS(s, m);          // BMI-for-age LMS
      return (lms && isFinite(lms[1])) ? Number(lms[1]) : null; // M = mediana (P50)
    }
  
    // Jeśli nie zdefiniowano – dodaj
    if (typeof window.getBmiP50ForAgeSex !== 'function') {
      window.getBmiP50ForAgeSex = function (ageMonths, sex) {
        return _bmiP50FromLMS(ageMonths, sex);
      };
    }
  
    // Cole 100% odpowiada BMI z 50. centyla ➔ alias
    if (typeof window.getColeBMI50 !== 'function') {
      window.getColeBMI50 = function (ageMonths, sex) {
        return _bmiP50FromLMS(ageMonths, sex);
      };
    }
  })();

// === 12-miesięczne ostrzeżenie o dużej utracie masy (niezależne od AN) ===
(function () {
  const CSS_ID = 'warn-12m-loss-orange-style';
  if (!document.getElementById(CSS_ID)) {
    const style = document.createElement('style');
    style.id = CSS_ID;
    style.textContent = `
      .warn-12m-orange {
        box-sizing: border-box;
        margin: 0.75rem 0 1rem 0;
        padding: 0.75rem 0.9rem;
        border-left: 4px solid #cc6e00;
        background: #ff8c00;
        color: #ffffff;
        border-radius: 6px;
        font-size: 0.95rem;
        line-height: 1.35;
      }
      .warn-12m-orange strong { color: #fff; }
      .warn-12m-orange small { opacity: 0.9; }
    `;
    document.head.appendChild(style);
  }

  function _rowToPoint(r) {
    let t = null;
    if (r.t != null) t = Number(r.t);
    else if (r.date) t = Date.parse(r.date);
    else if (r.ageMonths != null) t = Number(r.ageMonths) * 30.44 * 24 * 3600 * 1000;
    const w = (r.weight != null) ? Number(r.weight) : null;
    return (t && isFinite(w)) ? { t, w } : null;
  }

  // znajdź parę punktów oddzielonych ~12 miesięcy (11–13 m)
  function _find12mAgoPair(pointsSortedAsc) {
    if (!pointsSortedAsc.length) return null;
    const b = pointsSortedAsc[pointsSortedAsc.length - 1];
    const targetDays = 365.24;
    const minDays = 335; // ≥ ~11 mies.
    const maxDays = 395; // ≤ ~13 mies.
    let best = null;
    let bestDiff = Infinity;
    for (let i = 0; i < pointsSortedAsc.length - 1; i++) {
      const a = pointsSortedAsc[i];
      const dtDays = (b.t - a.t) / (1000 * 3600 * 24);
      if (dtDays >= minDays && dtDays <= maxDays) {
        const d = Math.abs(dtDays - targetDays);
        if (d < bestDiff) { best = { a, b, dtDays }; bestDiff = d; }
      }
    }
    return best;
  }

  function _renderOrangeBanner(mount, text) {
    if (!mount) return;
    // Nie dubluj komunikatu 12m – sprawdź, czy alert jest już obecny
    if (mount.querySelector('.intake-alert.warn[data-kind="12m"]')) return;
    const box = document.createElement('div');
    box.className = 'intake-alert warn';
    box.dataset.kind = '12m';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    vildaAppSetTrustedHtml(box, `<strong>Uwaga:</strong> ${text}`, 'app:box');
    // Dodaj komunikat na końcu kontenera wyników
    mount.appendChild(box);
    // Jeśli nie ma silniejszego czerwonego alertu, ustaw stan ostrzegawczy i puls
    if (!mount.classList.contains('bmi-danger')) {
      mount.classList.add('bmi-warning');
      try { applyPulse(mount, 'warning'); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 33505 });
    }
  }
    }
  }

  function has12mLossOrangeRisk(history) {
    if (!Array.isArray(history) || history.length < 2) return false;
    const pts = history.map(_rowToPoint).filter(Boolean).sort((x, y) => x.t - y.t);
    if (pts.length < 2) return false;
    const pair = _find12mAgoPair(pts);
    if (!pair) return false;
    const lostKg = pair.a.w - pair.b.w;
    return lostKg > 8;
  }

  // API: sprawdź historię i wstaw ostrzeżenie, gdy spadek > 8 kg w ~12 miesięcy
  function check12mLossOrange(history, mountId) {
    if (!Array.isArray(history) || history.length < 2) return false;
    const pts = history.map(_rowToPoint).filter(Boolean).sort((x, y) => x.t - y.t);
    if (pts.length < 2) return false;
    const pair = _find12mAgoPair(pts);
    if (!pair) return false;
    const lostKg = pair.a.w - pair.b.w; // >0 oznacza spadek
    if (lostKg > 8) {
      // Zamieniamy separator dziesiętny na przecinek dla utraconej masy ciała
      const text = `W ciągu ostatnich ~12 miesięcy masa spadła o ${lostKg.toFixed(1).replace('.', ',')} kg. ` +
                   `<small>Zalecamy ocenę, czy był to intencjonalny spadek.</small>`;
      const mount = document.getElementById(mountId || 'intakeResults');
      _renderOrangeBanner(mount, text);
      return true;
    }
    return false;
  }

  window.check12mLossOrange = check12mLossOrange;
  window.has12mLossOrangeRisk = has12mLossOrangeRisk;
})();

/* ================== SAVE / LOAD JSON – Vilda Clinic (2025-09-05) ================== */
(function(){
  const VILDA_DATA_IMPORT_EXPORT = (typeof window !== 'undefined' && (window.VildaDataImportExport || window.vildaDataImportExport)) || {};
  const q = (typeof VILDA_DATA_IMPORT_EXPORT.q === 'function') ? VILDA_DATA_IMPORT_EXPORT.q : function(id){ return document.getElementById(id); };
  const num = (typeof VILDA_DATA_IMPORT_EXPORT.num === 'function') ? VILDA_DATA_IMPORT_EXPORT.num : function(v){ const n = parseFloat(v); return isFinite(n) ? n : null; };
  const val = (typeof VILDA_DATA_IMPORT_EXPORT.val === 'function') ? VILDA_DATA_IMPORT_EXPORT.val : function(id){ const el=q(id); return el ? el.value : ''; };

  function getVildaDataImportExportAdapter() {
    try {
      return (typeof window !== 'undefined' && (window.VildaDataImportExport || window.vildaDataImportExport)) || VILDA_DATA_IMPORT_EXPORT || null;
    } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', _, { feature: 'data-import-export:get-adapter' });
      }
      return VILDA_DATA_IMPORT_EXPORT || null;
    }
  }

  // Helpery neutralne importu/eksportu JSON zostały wydzielone do vilda_data_import_export.js (8L-1).
  const getTip = (typeof VILDA_DATA_IMPORT_EXPORT.getTip === 'function') ? VILDA_DATA_IMPORT_EXPORT.getTip : function(el) {
    if (!el) return '';
    const dt = el.getAttribute('data-tip');
    if (dt && dt.trim() !== '') return dt;
    const t = el.getAttribute('title');
    return t || '';
  };
  const migrateTitleToDataTip = (typeof VILDA_DATA_IMPORT_EXPORT.migrateTitleToDataTip === 'function') ? VILDA_DATA_IMPORT_EXPORT.migrateTitleToDataTip : function(el) {
    if (!el) return;
    const t = el.getAttribute('title');
    if (t) {
      if (!el.getAttribute('data-tip')) el.setAttribute('data-tip', t);
      el.removeAttribute('title');
    }
  };
  window.syncNames = function(source){
    if (typeof VILDA_DATA_IMPORT_EXPORT.syncNames === 'function') {
      return VILDA_DATA_IMPORT_EXPORT.syncNames(source, { updateSaveBtnVisibility });
    }
    const nameEl = q('name'), advEl = q('advName');
    if(!nameEl || !advEl) return;
    if(source==='name'){
      advEl.value = nameEl.value;
      try { advEl.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {
        if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
          globalThis.vildaLogSwallowedCatch('app.js', _, { feature: 'syncNames:fallback:name' });
        }
      }
    }else if(source==='adv'){
      nameEl.value = advEl.value;
      try { nameEl.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {
        if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
          globalThis.vildaLogSwallowedCatch('app.js', _, { feature: 'syncNames:fallback:adv' });
        }
      }
    }
    updateSaveBtnVisibility();
  };

  const normalizePersistNumber = (typeof VILDA_DATA_IMPORT_EXPORT.normalizePersistNumber === 'function') ? VILDA_DATA_IMPORT_EXPORT.normalizePersistNumber : function(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' && value.trim() === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };
  const normalizeAgeMonthsValue = (typeof VILDA_DATA_IMPORT_EXPORT.normalizeAgeMonthsValue === 'function') ? VILDA_DATA_IMPORT_EXPORT.normalizeAgeMonthsValue : function(ageMonthsValue, ageYearsValue) {
    const direct = normalizePersistNumber(ageMonthsValue);
    if (direct !== null) return Math.round(direct);
    const ageYears = normalizePersistNumber(ageYearsValue);
    return (ageYears !== null) ? Math.round(ageYears * 12) : null;
  };
  const sanitizeAdvancedMeasurementEntries = (typeof VILDA_DATA_IMPORT_EXPORT.sanitizeAdvancedMeasurementEntries === 'function') ? VILDA_DATA_IMPORT_EXPORT.sanitizeAdvancedMeasurementEntries : function(entries) { return Array.isArray(entries) ? entries.slice() : []; };
  const sanitizeAdvancedRowsUI = (typeof VILDA_DATA_IMPORT_EXPORT.sanitizeAdvancedRowsUI === 'function') ? VILDA_DATA_IMPORT_EXPORT.sanitizeAdvancedRowsUI : function(rowsUI) { return Array.isArray(rowsUI) ? rowsUI.slice() : []; };
  const normalizeIntakeCurrentBasics = (typeof VILDA_DATA_IMPORT_EXPORT.normalizeIntakeCurrentBasics === 'function') ? VILDA_DATA_IMPORT_EXPORT.normalizeIntakeCurrentBasics : function(currentBasics) { return currentBasics && typeof currentBasics === 'object' ? currentBasics : null; };
  const intakeHistoryEntryMatchesCurrentBasics = (typeof VILDA_DATA_IMPORT_EXPORT.intakeHistoryEntryMatchesCurrentBasics === 'function') ? VILDA_DATA_IMPORT_EXPORT.intakeHistoryEntryMatchesCurrentBasics : function() { return false; };
  const sanitizeIntakeHistoryEntries = (typeof VILDA_DATA_IMPORT_EXPORT.sanitizeIntakeHistoryEntries === 'function') ? VILDA_DATA_IMPORT_EXPORT.sanitizeIntakeHistoryEntries : function(entries) { return Array.isArray(entries) ? entries.slice() : []; };
  const sanitizeIntakeRowsUI = (typeof VILDA_DATA_IMPORT_EXPORT.sanitizeIntakeRowsUI === 'function') ? VILDA_DATA_IMPORT_EXPORT.sanitizeIntakeRowsUI : function(rowsUI) { return Array.isArray(rowsUI) ? rowsUI.slice() : []; };

  function hasCompleteIntakeCurrentBasics() {
    try {
      if (typeof _getUserBasics !== 'function') return false;
      const basics = _getUserBasics();
      return Number.isFinite(Number(basics && basics.ageMonths))
        && Number.isFinite(Number(basics && basics.height))
        && Number.isFinite(Number(basics && basics.weight));
    } catch (_) {
      return false;
    }
  }

  function setFieldValueSilently(el, value, options) {
    const adapter = getVildaDataImportExportAdapter();
    if (adapter && typeof adapter.setFieldValueSilently === 'function') {
      return adapter.setFieldValueSilently(el, value, options);
    }
    if (!el) return null;
    const opts = (options && typeof options === 'object') ? options : {};
    try { el.value = (value == null || Number.isNaN(value)) ? '' : String(value); } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', _, { feature: 'data-import-export:set-field-fallback' });
      }
    }
    if (Object.prototype.hasOwnProperty.call(opts, 'disabled')) {
      try { el.disabled = !!opts.disabled; } catch (_) {
        if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
          globalThis.vildaLogSwallowedCatch('app.js', _, { feature: 'data-import-export:set-field-disabled-fallback' });
        }
      }
    }
    return el;
  }

  function setCheckboxValueSilently(el, checked) {
    const adapter = getVildaDataImportExportAdapter();
    if (adapter && typeof adapter.setCheckboxValueSilently === 'function') {
      return adapter.setCheckboxValueSilently(el, checked);
    }
    if (!el) return null;
    try { el.checked = !!checked; } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', _, { feature: 'data-import-export:set-checkbox-fallback' });
      }
    }
    return el;
  }

  function applyResultsModeRestoreState(isProfessional) {
    const adapter = getVildaDataImportExportAdapter();
    const options = {
      setProfessionalMode: function(pro) {
        professionalMode = !!pro;
        try { if (typeof window !== 'undefined') window.professionalMode = professionalMode; } catch (_) {
          if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
            globalThis.vildaLogSwallowedCatch('app.js', _, { feature: 'data-import-export:restore-results-mode:set-window' });
          }
        }
      },
      writeResultsModeStorage,
      updateAdvancedGrowthAccess,
      updatePalczewskaAccess,
      updateCompareInstructionVisibility,
      applyThemeCustom: (typeof window !== 'undefined') ? window.applyThemeCustom : null,
      dispatchResultsModeSyncEvent
    };
    if (adapter && typeof adapter.applyResultsModeRestoreState === 'function') {
      return adapter.applyResultsModeRestoreState(isProfessional, options);
    }
    const pro = !!isProfessional;
    options.setProfessionalMode(pro);
    try { writeResultsModeStorage(pro ? 'professional' : 'standard'); } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', _, { feature: 'data-import-export:restore-results-mode:write-fallback' });
      }
    }
    try { document.body.classList.remove('professional-bg'); } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', _, { feature: 'data-import-export:restore-results-mode:body-fallback' });
      }
    }
    try {
      ['currentSummaryCard', 'currentSummaryCardLeft', 'currentSummaryCardRight'].forEach((sid) => {
        const card = document.getElementById(sid);
        if (!card) return;
        if (pro) card.classList.add('pro-summary-card');
        else card.classList.remove('pro-summary-card');
        const label = card.querySelector('.pro-summary-label');
        if (label) label.style.display = pro ? 'block' : 'none';
      });
    } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', _, { feature: 'data-import-export:restore-results-mode:cards-fallback' });
      }
    }
    try { if (typeof updateAdvancedGrowthAccess === 'function') updateAdvancedGrowthAccess(); } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', _, { feature: 'data-import-export:restore-results-mode:advanced-access-fallback' });
      }
    }
    try { if (typeof updatePalczewskaAccess === 'function') updatePalczewskaAccess(); } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', _, { feature: 'data-import-export:restore-results-mode:palczewska-access-fallback' });
      }
    }
    try { if (typeof updateCompareInstructionVisibility === 'function') updateCompareInstructionVisibility(); } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', _, { feature: 'data-import-export:restore-results-mode:compare-fallback' });
      }
    }
    try { if (typeof window !== 'undefined' && typeof window.applyThemeCustom === 'function') window.applyThemeCustom(); } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', _, { feature: 'data-import-export:restore-results-mode:theme-fallback' });
      }
    }
    try { if (typeof dispatchResultsModeSyncEvent === 'function') dispatchResultsModeSyncEvent(pro); } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', _, { feature: 'data-import-export:restore-results-mode:dispatch-fallback' });
      }
    }
    return { professionalMode: pro };
  }

  function applyDataSourceRestoreState(dataSourceValue) {
    const adapter = getVildaDataImportExportAdapter();
    const options = {
      setBmiSource: function(value) {
        bmiSource = value;
      }
    };
    if (adapter && typeof adapter.applyDataSourceRestoreState === 'function') {
      return adapter.applyDataSourceRestoreState(dataSourceValue, options);
    }
    const value = (typeof dataSourceValue === 'string') ? dataSourceValue : '';
    let selected = null;
    try {
      const radios = document.querySelectorAll('input[name="dataSource"]');
      radios.forEach((radio) => {
        const shouldCheck = !!value && radio.value === value;
        radio.checked = shouldCheck;
        if (shouldCheck) selected = radio;
      });
      if (selected) {
        const toggleContainer = document.getElementById('dataToggleContainer');
        if (toggleContainer) {
          toggleContainer.dataset.manual = '1';
          toggleContainer.dataset.preferredSource = selected.value;
        }
      }
      if (selected && selected.value) bmiSource = selected.value;
    } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', _, { feature: 'data-import-export:restore-data-source-fallback' });
      }
    }
    return selected;
  }


  function getVildaDataImportExportRehydrateOptions(options) {
    const extra = (options && typeof options === 'object') ? options : {};
    return Object.assign({
      addAdvMeasurementRow: (typeof addAdvMeasurementRow === 'function') ? addAdvMeasurementRow : null,
      calculateGrowthAdvanced: (typeof calculateGrowthAdvanced === 'function') ? calculateGrowthAdvanced : null,
      updateRemoveButtons: (typeof updateRemoveButtons === 'function') ? updateRemoveButtons : null,
      updateAdvAgeMax: (typeof updateAdvAgeMax === 'function') ? updateAdvAgeMax : null,
      updateArrowInputsVisibility: (typeof window !== 'undefined') ? window.updateArrowInputsVisibility : null,
      ensureAdvancedIntakePairing: (typeof window !== 'undefined') ? window.vildaEnsureAdvancedIntakePairing : null,
      hasCompleteIntakeCurrentBasics: (typeof hasCompleteIntakeCurrentBasics === 'function') ? hasCompleteIntakeCurrentBasics : null,
      getCurrentBasics: (typeof _getUserBasics === 'function') ? function(){ return _getUserBasics(); } : null,
      getUserBasics: (typeof getUserBasics === 'function') ? getUserBasics : null,
      intakeAddRow: (typeof intakeAddRow === 'function') ? intakeAddRow : null,
      intakeUpdatePalDesc: (typeof intakeUpdatePalDesc === 'function') ? intakeUpdatePalDesc : null,
      updateIntakeFirstRowFromUserBasics: (typeof _updateIntakeFirstRowFromUserBasics === 'function') ? _updateIntakeFirstRowFromUserBasics : null,
      updateIntakeRemoveButtons: (typeof updateIntakeRemoveButtons === 'function') ? updateIntakeRemoveButtons : null,
      calcEstimatedIntake: (typeof calcEstimatedIntake === 'function') ? calcEstimatedIntake : null,
      refreshEstimatedIntakeVisibility: (typeof window !== 'undefined') ? window.refreshEstimatedIntakeVisibility : null
    }, extra);
  }

  function withHistoryRestoreGuards(callback) {
    const adapter = getVildaDataImportExportAdapter();
    if (adapter && typeof adapter.withHistoryRestoreGuards === 'function') {
      return adapter.withHistoryRestoreGuards(callback);
    }
    if (typeof vildaLogAppError === 'function') {
      vildaLogAppError('app:data-import-export', 'Brak VildaDataImportExport.withHistoryRestoreGuards().');
    }
    return (typeof callback === 'function') ? callback() : undefined;
  }

  function rehydrateAdvancedFromState(options){
    const adapter = getVildaDataImportExportAdapter();
    if (adapter && typeof adapter.rehydrateAdvancedFromState === 'function') {
      return adapter.rehydrateAdvancedFromState(getVildaDataImportExportRehydrateOptions(options));
    }
    if (typeof vildaLogAppError === 'function') {
      vildaLogAppError('app:data-import-export', 'Brak VildaDataImportExport.rehydrateAdvancedFromState().');
    }
    return null;
  }

  function rehydrateAdvancedRowsUIFromState(rowsUI, options){
    const adapter = getVildaDataImportExportAdapter();
    if (adapter && typeof adapter.rehydrateAdvancedRowsUIFromState === 'function') {
      return adapter.rehydrateAdvancedRowsUIFromState(rowsUI, getVildaDataImportExportRehydrateOptions(options));
    }
    if (typeof vildaLogAppError === 'function') {
      vildaLogAppError('app:data-import-export', 'Brak VildaDataImportExport.rehydrateAdvancedRowsUIFromState().');
    }
    return null;
  }

  function rehydrateIntakeFromState(savedPal, options){
    const adapter = getVildaDataImportExportAdapter();
    if (adapter && typeof adapter.rehydrateIntakeFromState === 'function') {
      return adapter.rehydrateIntakeFromState(savedPal, getVildaDataImportExportRehydrateOptions(options));
    }
    if (typeof vildaLogAppError === 'function') {
      vildaLogAppError('app:data-import-export', 'Brak VildaDataImportExport.rehydrateIntakeFromState().');
    }
    return null;
  }

  // Udostępnij funkcje rehydratacji (np. dla autosave w localStorage).
  // Wrappery przekazują lokalne zależności app.js do vilda_data_import_export.js.
  try {
    if (typeof window !== 'undefined') {
      window.vildaRehydrateAdvancedFromState = rehydrateAdvancedFromState;
      window.vildaRehydrateAdvancedRowsUI = rehydrateAdvancedRowsUIFromState;
      window.vildaRehydrateIntakeFromState = rehydrateIntakeFromState;
    }
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { feature: 'data-import-export:rehydrate-aliases' });
    }
  }

  // Stan przycisków zapisu/wczytywania oraz autosave sesji głównej
  // zostały wydzielone do vilda_data_import_export.js w kroku 8L-5.
  function getVildaDataImportExportSessionOptions(options) {
    const extra = (options && typeof options === 'object') ? options : {};
    return Object.assign({
      collectUserData: (typeof collectUserData === 'function') ? function collectUserDataForMainSession(){ return collectUserData(); } : null,
      applyLoadedData: (typeof applyLoadedData === 'function') ? applyLoadedData : null,
      anyDataEntered: (typeof anyDataEntered === 'function') ? function anyDataEnteredForMainSession(){ return anyDataEntered(); } : null,
      vildaAppOnReady: (typeof window !== 'undefined' && typeof window.vildaAppOnReady === 'function') ? window.vildaAppOnReady : null
    }, extra);
  }

  function anyDataEntered(options){
    const adapter = getVildaDataImportExportAdapter();
    if (adapter && typeof adapter.anyDataEntered === 'function') {
      return adapter.anyDataEntered(options);
    }
    const textIds = ['name','advName','basicGrowthName','fullName','advTesticularVolume','advFamilyDelayedPuberty','advGrowthExclusion'];
    const positiveNumberIds = ['age','ageMonths','weight','height','advBoneAge','advMotherHeight','advFatherHeight'];
    try {
      for (const id of textIds) {
        const el = q(id);
        const value = el ? String(el.value || '').trim() : '';
        if (value) return true;
      }
      for (const id of positiveNumberIds) {
        const n = num(val(id));
        if (n !== null && n > 0) return true;
      }
      const clcrForm = document.getElementById('clcrForm');
      if (clcrForm) {
        const controls = clcrForm.querySelectorAll('input, select, textarea');
        for (const el of controls) {
          const type = (el.type || '').toLowerCase();
          if (type === 'button' || type === 'submit' || type === 'reset') continue;
          if ((type === 'checkbox' || type === 'radio') ? el.checked : String(el.value || '').trim() !== '') return true;
        }
      }
    } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', _, { feature: 'data-import-export:anyDataEntered-fallback' });
      }
    }
    return false;
  }

  function updateSaveBtnVisibility(options){
    const adapter = getVildaDataImportExportAdapter();
    if (adapter && typeof adapter.updateSaveBtnVisibility === 'function') {
      return adapter.updateSaveBtnVisibility(options);
    }
    if (typeof vildaLogAppError === 'function') {
      vildaLogAppError('app:data-import-export', 'Brak VildaDataImportExport.updateSaveBtnVisibility().');
    }
    return false;
  }

  function maybeDisableLoadIfNeeded(options) {
    const adapter = getVildaDataImportExportAdapter();
    if (adapter && typeof adapter.maybeDisableLoadIfNeeded === 'function') {
      return adapter.maybeDisableLoadIfNeeded(options);
    }
    if (typeof vildaLogAppError === 'function') {
      vildaLogAppError('app:data-import-export', 'Brak VildaDataImportExport.maybeDisableLoadIfNeeded().');
    }
    return false;
  }

  function getVildaPersistenceAdapter(){
    const adapter = getVildaDataImportExportAdapter();
    if (adapter && typeof adapter.getVildaPersistenceAdapter === 'function') {
      return adapter.getVildaPersistenceAdapter();
    }
    try {
      if (typeof window !== 'undefined' && window.VildaPersistence) return window.VildaPersistence;
    } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', _, { feature: 'data-import-export:get-persistence-fallback' });
      }
    }
    return null;
  }

  function hasMainSessionStorage(options){
    const adapter = getVildaDataImportExportAdapter();
    if (adapter && typeof adapter.hasMainSessionStorage === 'function') {
      return adapter.hasMainSessionStorage(options);
    }
    try {
      const persistence = getVildaPersistenceAdapter();
      return !!(persistence && typeof persistence.getStorage === 'function' && persistence.getStorage('session'));
    } catch (_) { return false; }
  }

  function isMainSessionAutosavePaused(options){
    const adapter = getVildaDataImportExportAdapter();
    if (adapter && typeof adapter.isMainSessionAutosavePaused === 'function') {
      return adapter.isMainSessionAutosavePaused(getVildaDataImportExportSessionOptions(options));
    }
    try {
      if (typeof window !== 'undefined') {
        if (window.__vildaPersistRestoring) return true;
        const pauseUntil = Number(window.__vildaPersistPauseUntil || 0);
        if (pauseUntil && Date.now() < pauseUntil) return true;
      }
    } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', _, { feature: 'data-import-export:is-main-session-paused-fallback' });
      }
    }
    return false;
  }

  function clearMainSessionStorage(options){
    const adapter = getVildaDataImportExportAdapter();
    if (adapter && typeof adapter.clearMainSessionStorage === 'function') {
      return adapter.clearMainSessionStorage(getVildaDataImportExportSessionOptions(options));
    }
    const persistence = getVildaPersistenceAdapter();
    if (persistence && typeof persistence.clearMainSession === 'function') {
      try { persistence.clearMainSession(); return true; } catch (_) {
        if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
          globalThis.vildaLogSwallowedCatch('app.js', _, { feature: 'data-import-export:clear-main-session-fallback' });
        }
      }
    }
    return false;
  }

  function saveMainSessionNow(options){
    const adapter = getVildaDataImportExportAdapter();
    if (adapter && typeof adapter.saveMainSessionNow === 'function') {
      return adapter.saveMainSessionNow(getVildaDataImportExportSessionOptions(options));
    }
    if (!hasMainSessionStorage() || isMainSessionAutosavePaused()) return false;
    try {
      const data = collectUserData();
      const persistence = getVildaPersistenceAdapter();
      if (data && data.version === 1 && persistence && typeof persistence.writeMainSession === 'function') {
        persistence.writeMainSession(data);
        return true;
      }
    } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', _, { feature: 'data-import-export:save-main-session-fallback' });
      }
    }
    return false;
  }

  function scheduleMainSessionSave(evt, options) {
    const adapter = getVildaDataImportExportAdapter();
    if (adapter && typeof adapter.scheduleMainSessionSave === 'function') {
      return adapter.scheduleMainSessionSave(evt, getVildaDataImportExportSessionOptions(options));
    }
    return saveMainSessionNow(options);
  }

  function finalizeMainSessionRestore(prevPersistRestoring, options) {
    const adapter = getVildaDataImportExportAdapter();
    if (adapter && typeof adapter.finalizeMainSessionRestore === 'function') {
      return adapter.finalizeMainSessionRestore(prevPersistRestoring, getVildaDataImportExportSessionOptions(options));
    }
    try { if (typeof window !== 'undefined') window.__vildaPersistRestoring = prevPersistRestoring; } catch (_) {}
    return saveMainSessionNow(options);
  }

  function restoreMainSessionIfAny(options) {
    const adapter = getVildaDataImportExportAdapter();
    if (adapter && typeof adapter.restoreMainSessionIfAny === 'function') {
      return adapter.restoreMainSessionIfAny(getVildaDataImportExportSessionOptions(options));
    }
    return false;
  }

  function attachMainSessionClearHandler(btnId, options) {
    const adapter = getVildaDataImportExportAdapter();
    if (adapter && typeof adapter.attachMainSessionClearHandler === 'function') {
      return adapter.attachMainSessionClearHandler(btnId, getVildaDataImportExportSessionOptions(options));
    }
    const clearBtn = document.getElementById(btnId);
    if (!clearBtn || clearBtn.__vildaMainSessionClearBound) return false;
    clearBtn.__vildaMainSessionClearBound = '1';
    clearBtn.addEventListener('click', clearMainSessionStorage, true);
    return true;
  }

  function initMainSessionPersistence(options) {
    const adapter = getVildaDataImportExportAdapter();
    if (adapter && typeof adapter.initMainSessionPersistence === 'function') {
      return adapter.initMainSessionPersistence(getVildaDataImportExportSessionOptions(options));
    }
    if (typeof vildaLogAppError === 'function') {
      vildaLogAppError('app:data-import-export', 'Brak VildaDataImportExport.initMainSessionPersistence().');
    }
    return false;
  }

  initMainSessionPersistence();

  function collectUserData(){
    const dataIo = getVildaDataImportExportAdapter();
    if (dataIo && typeof dataIo.collectUserData === 'function') {
      return dataIo.collectUserData();
    }
    if (typeof vildaLogAppError === 'function') {
      vildaLogAppError('app:data-import-export', 'Brak VildaDataImportExport.collectUserData().');
    }
    return {
      version: 1,
      timestampISO: new Date().toISOString(),
      name: '',
      user: { age: null, ageMonths: 0, sex: 'M', weight: null, height: null, waist: null, hip: null },
      advanced: null,
      growthBasic: null,
      intake: null,
      foods: { snacks: [], meals: [] },
      plan: null,
      clcr: null,
      bp: null,
      adultVitals: null,
      respiratory: null,
      circumference: null,
      doctor: null,
      bisphos: null,
      zscore: null,
      bpDataToggle: null,
      ghTherapyPoints: []
    };
  }

  function sanitizeFilename(name){
    const dataIo = getVildaDataImportExportAdapter();
    if (dataIo && typeof dataIo.sanitizeFilename === 'function') {
      return dataIo.sanitizeFilename(name);
    }
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const dateStr = `${day}_${month}_${year}`;
    if (!name || !String(name).trim()) return `dane_${dateStr}`;
    return `${String(name).trim().replace(/\s+/g, '_').replace(/[\\/:*?"<>|]/g, '-')}_${dateStr}`;
  }

  function saveUserData(){
    const dataIo = getVildaDataImportExportAdapter();
    if (dataIo && typeof dataIo.saveUserData === 'function') {
      return dataIo.saveUserData({
        showTooltip: (typeof showTooltip === 'function') ? showTooltip : null
      });
    }
    if (typeof vildaLogAppError === 'function') {
      vildaLogAppError('app:data-import-export', 'Brak VildaDataImportExport.saveUserData().');
    }
    const saveBtnEl = document.getElementById('saveDataBtn');
    const msg = 'Nie udało się uruchomić modułu zapisu danych.';
    if (saveBtnEl && typeof showTooltip === 'function') showTooltip(saveBtnEl, msg);
    else alert(msg);
    return null;
  }

  function getVildaDataImportExportClearOptions(options) {
    const opts = (options && typeof options === 'object') ? options : {};
    return Object.assign({
      clearPulse: (typeof clearPulse === 'function') ? clearPulse : null,
      hideLoadDataMessage: (typeof hideLoadDataMessage === 'function') ? hideLoadDataMessage : null,
      debouncedUpdate: (typeof debouncedUpdate === 'function') ? debouncedUpdate : null,
      addAdvMeasurementRow: (typeof addAdvMeasurementRow === 'function') ? addAdvMeasurementRow : null,
      addBasicGrowthMeasurementRow: (typeof window !== 'undefined' && typeof window.addBasicGrowthMeasurementRow === 'function') ? window.addBasicGrowthMeasurementRow : null,
      updateRemoveButtons: (typeof updateRemoveButtons === 'function') ? updateRemoveButtons : null,
      calculateGrowthAdvanced: (typeof calculateGrowthAdvanced === 'function') ? calculateGrowthAdvanced : null,
      calculateBasicGrowth: (typeof window !== 'undefined' && typeof window.calculateBasicGrowth === 'function') ? window.calculateBasicGrowth : null,
      updateIntakeRemoveButtons: (typeof updateIntakeRemoveButtons === 'function') ? updateIntakeRemoveButtons : null,
      debouncedIntakeCalc: (typeof debouncedIntakeCalc === 'function') ? debouncedIntakeCalc : null,
      clearGhTherapyPointsModuleStorage: (typeof clearGhTherapyPointsModuleStorage === 'function') ? clearGhTherapyPointsModuleStorage : null,
      clearTherapyPointsInDB: (typeof clearTherapyPointsInDB === 'function') ? clearTherapyPointsInDB : null,
      getGhTherapyBroadcastChannel: getGHTherapyBroadcastChannel
    }, opts);
  }

  function resetGrowthHistoryModulesAfterClear(options){
    const adapter = getVildaDataImportExportAdapter();
    if (adapter && typeof adapter.resetGrowthHistoryModulesAfterClear === 'function') {
      return adapter.resetGrowthHistoryModulesAfterClear(getVildaDataImportExportClearOptions(options));
    }
    if (typeof vildaLogAppError === 'function') {
      vildaLogAppError('app:data-import-export', 'Brak VildaDataImportExport.resetGrowthHistoryModulesAfterClear().');
    }
    return false;
  }

  function clearAllData(options){
    const adapter = getVildaDataImportExportAdapter();
    if (adapter && typeof adapter.clearAllData === 'function') {
      return adapter.clearAllData(getVildaDataImportExportClearOptions(options));
    }
    if (typeof vildaLogAppError === 'function') {
      vildaLogAppError('app:data-import-export', 'Brak VildaDataImportExport.clearAllData().');
    }
    return false;
  }

  // Synchronizacja sharedUserData po imporcie została wydzielona do vilda_data_import_export.js w kroku 8L-7b.
  function normalizeSharedPersistRoot(shared) {
    const adapter = getVildaDataImportExportAdapter();
    if (adapter && typeof adapter.normalizeSharedPersistRoot === 'function') {
      return adapter.normalizeSharedPersistRoot(shared);
    }
    const root = shared && typeof shared === 'object' ? shared : {};
    const persistRoot = root._vildaPersist && typeof root._vildaPersist === 'object' ? root._vildaPersist : {};
    persistRoot.v = 1;
    persistRoot.byId = persistRoot.byId && typeof persistRoot.byId === 'object' ? persistRoot.byId : {};
    persistRoot.byName = persistRoot.byName && typeof persistRoot.byName === 'object' ? persistRoot.byName : {};
    persistRoot.radio = persistRoot.radio && typeof persistRoot.radio === 'object' ? persistRoot.radio : {};
    persistRoot.datasetById = persistRoot.datasetById && typeof persistRoot.datasetById === 'object' ? persistRoot.datasetById : {};
    persistRoot.globals = persistRoot.globals && typeof persistRoot.globals === 'object' ? persistRoot.globals : {};
    root._vildaPersist = persistRoot;
    return persistRoot;
  }

  function syncSharedUserDataFromLoadedData(data, name, options) {
    const adapter = getVildaDataImportExportAdapter();
    if (adapter && typeof adapter.syncSharedUserDataFromLoadedData === 'function') {
      return adapter.syncSharedUserDataFromLoadedData(data, name, Object.assign({
        persistence: (typeof getVildaPersistenceAdapter === 'function') ? getVildaPersistenceAdapter() : null
      }, (options && typeof options === 'object') ? options : {}));
    }
    if (typeof vildaLogAppError === 'function') {
      vildaLogAppError('app:data-import-export', 'Brak VildaDataImportExport.syncSharedUserDataFromLoadedData().');
    }
    return null;
  }

  // Pełne zastosowanie danych z importu JSON zostało wydzielone do vilda_data_import_export.js w kroku 8L-7c.
  function getVildaDataImportExportApplyOptions(options) {
    const extra = (options && typeof options === 'object') ? options : {};
    return Object.assign({
      showTooltip: (typeof showTooltip === 'function') ? showTooltip : null,
      showLoadDataMessage: (typeof showLoadDataMessage === 'function') ? showLoadDataMessage : null,
      showRestoreButton: (typeof showRestoreButton === 'function') ? showRestoreButton : null,
      syncSharedUserDataFromLoadedData: (typeof syncSharedUserDataFromLoadedData === 'function') ? syncSharedUserDataFromLoadedData : null,
      macroPracticeResolveFoodAliasKey: (typeof macroPracticeResolveFoodAliasKey === 'function') ? macroPracticeResolveFoodAliasKey : null,
      addFoodRow: (typeof addFoodRow === 'function') ? addFoodRow : null,
      updateSaveBtnVisibility: (typeof updateSaveBtnVisibility === 'function') ? updateSaveBtnVisibility : null,
      debouncedUpdate: (typeof debouncedUpdate === 'function') ? debouncedUpdate : null,
      withHistoryRestoreGuards: (typeof withHistoryRestoreGuards === 'function') ? withHistoryRestoreGuards : null,
      rehydrateAdvancedFromState: (typeof rehydrateAdvancedFromState === 'function') ? rehydrateAdvancedFromState : null,
      rehydrateIntakeFromState: (typeof rehydrateIntakeFromState === 'function') ? rehydrateIntakeFromState : null,
      getVildaPersistenceAdapter: (typeof getVildaPersistenceAdapter === 'function') ? getVildaPersistenceAdapter : null,
      writeGhTherapyPointsToModuleStorage: (typeof writeGhTherapyPointsToModuleStorage === 'function') ? writeGhTherapyPointsToModuleStorage : null,
      clearGhTherapyPointsModuleStorage: (typeof clearGhTherapyPointsModuleStorage === 'function') ? clearGhTherapyPointsModuleStorage : null,
      renderPrevSummary: (typeof __renderPrevSummary === 'function') ? __renderPrevSummary : null,
      renderPrevClcrSummary: (typeof __renderPrevClcrSummary === 'function') ? __renderPrevClcrSummary : null,
      pickLastMeasurement: (typeof __pickLastMeasurement === 'function') ? __pickLastMeasurement : null,
            applyResultsModeRestoreState: (typeof applyResultsModeRestoreState === 'function') ? applyResultsModeRestoreState : null,
      applyDataSourceRestoreState: (typeof applyDataSourceRestoreState === 'function') ? applyDataSourceRestoreState : null,
      setAutoScrollDisabled: function setAutoScrollDisabledForImport(value) {
        const nextAutoScrollDisabled = isVildaAutoScrollPermanentlyDisabled() ? true : !!value;
        try { if (typeof window !== 'undefined') window.autoScrollDisabled = nextAutoScrollDisabled; } catch (_) {
          if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
            globalThis.vildaLogSwallowedCatch('app.js', _, { feature: 'applyLoadedData:set-window-autoscroll' });
          }
        }
        try { autoScrollDisabled = nextAutoScrollDisabled; } catch (_) {
          if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
            globalThis.vildaLogSwallowedCatch('app.js', _, { feature: 'applyLoadedData:set-local-autoscroll' });
          }
        }
      },
      foods: (typeof foods !== 'undefined') ? foods : null,
      closeMenuTooltip: function closeMenuTooltipForImport() {
        try {
          if (typeof __menuTooltip !== 'undefined' && __menuTooltip) {
            __menuTooltip.remove();
            __menuTooltip = null;
            return true;
          }
        } catch (_) {
          if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
            globalThis.vildaLogSwallowedCatch('app.js', _, { feature: 'applyLoadedData:close-menu-tooltip' });
          }
        }
        return false;
      }
    }, extra);
  }

  function applyLoadedData(data, options){
    const dataIo = getVildaDataImportExportAdapter();
    if (dataIo && typeof dataIo.applyLoadedData === 'function') {
      return dataIo.applyLoadedData(data, getVildaDataImportExportApplyOptions(options));
    }
    if (typeof vildaLogAppError === 'function') {
      vildaLogAppError('app:data-import-export', 'Brak VildaDataImportExport.applyLoadedData().');
    }
    return false;
  }

  function getVildaDataImportExportFileOptions(options) {
    const extra = (options && typeof options === 'object') ? options : {};
    return Object.assign({
      applyLoadedData: (typeof applyLoadedData === 'function') ? applyLoadedData : null,
      showTooltip: (typeof showTooltip === 'function') ? showTooltip : null,
      maxJsonImportBytes: 10 * 1024 * 1024,
      requireVildaPayload: true
    }, extra);
  }

  function handleFile(e, options){
    const dataIo = getVildaDataImportExportAdapter();
    if (dataIo && typeof dataIo.handleFile === 'function') {
      return dataIo.handleFile(e, getVildaDataImportExportFileOptions(options));
    }
    const loadBtnEl = document.getElementById('loadDataBtn');
    const msg = 'Moduł importu danych JSON nie jest gotowy.';
    if (typeof vildaLogAppError === 'function') {
      vildaLogAppError('app:data-import-export:handle-file', 'Brak VildaDataImportExport.handleFile().');
    }
    if (loadBtnEl && typeof showTooltip === 'function') {
      showTooltip(loadBtnEl, msg);
    } else if (typeof alert === 'function') {
      alert(msg);
    }
    try { if (e && e.target) e.target.value = ''; } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', _, { feature: 'handleFile:reset-fallback' });
      }
    }
    return null;
  }

  window.vildaAppOnReady('app:json-data-import-export-init', function initJsonDataImportExport(){
    const dataIo = getVildaDataImportExportAdapter();
    if (dataIo && typeof dataIo.initJsonDataImportExport === 'function') {
      return dataIo.initJsonDataImportExport({
        applyLoadedData,
        saveUserData,
        anyDataEntered,
        hideLoadDataMessage,
        updateSaveBtnVisibility,
        showTooltip: (typeof showTooltip === 'function') ? showTooltip : null
      });
    }
    if (typeof vildaLogAppError === 'function') {
      vildaLogAppError('app:data-import-export-init', 'Brak VildaDataImportExport.initJsonDataImportExport().');
    }
    updateSaveBtnVisibility();
  });

  ['input','change'].forEach(evt=>{
    document.addEventListener(evt, function(e){
      const t = e.target;
      if(!t) return;
      // Jeśli użytkownik edytuje cokolwiek w trakcie sesji załadowanej z pliku,
      // ustaw flagę modyfikacji.  Dzięki temu updateSaveBtnVisibility() będzie
      // włączać przycisk zapisu po jakiejkolwiek zmianie, nie tylko w
      // formularzu podstawowym.
      try {
        if (typeof window !== 'undefined' && window.lastLoadedData) {
          window.hasUserModifiedAfterLoad = true;
        }
      } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 35927 });
    }
  }
      // Aktualizuj dostępność przycisku zapisu przy każdej modyfikacji w dowolnym polu.
      // Dzięki temu „Zapisz dane” stanie się aktywne nie tylko po zmianach w podstawowym formularzu,
      // ale również po edycji innych sekcji (np. modułu klirensu, ciśnienia, itp.).
      updateSaveBtnVisibility();
    }, true);
  });

  // === Funkcje przywracania pełnego stanu aplikacji po wczytaniu danych ===
  /**
   * Ujawnia przycisk #restoreStateBtn i rejestruje jednorazowe nasłuchiwacze
   * na zdarzenia `input` i `change`.  Po pierwszej modyfikacji formularza
   * przycisk zostanie ukryty wraz z komunikatem o wczytaniu danych.  Dzięki
   * temu użytkownik widzi przycisk tylko wtedy, gdy wczytano dane i nie
   * rozpoczęto jeszcze edycji nowych pól.
   */
  // Restore ostatnio wczytanego stanu został wydzielony do vilda_data_import_export.js w kroku 8L-6b.
  function getVildaDataImportExportRestoreOptions(options) {
    const extra = (options && typeof options === 'object') ? options : {};
    return Object.assign({
      anyDataEntered: (typeof anyDataEntered === 'function') ? function anyDataEnteredForRestore(){ return anyDataEntered(); } : null,
      hideLoadDataMessage: (typeof hideLoadDataMessage === 'function') ? hideLoadDataMessage : null,
      updateSaveBtnVisibility: (typeof updateSaveBtnVisibility === 'function') ? updateSaveBtnVisibility : null,
      syncSharedUserDataFromLoadedData: (typeof syncSharedUserDataFromLoadedData === 'function') ? syncSharedUserDataFromLoadedData : null,
      macroPracticeResolveFoodAliasKey: (typeof macroPracticeResolveFoodAliasKey === 'function') ? macroPracticeResolveFoodAliasKey : null,
      addFoodRow: (typeof addFoodRow === 'function') ? addFoodRow : null,
      applyResultsModeRestoreState: (typeof applyResultsModeRestoreState === 'function') ? applyResultsModeRestoreState : null,
      applyDataSourceRestoreState: (typeof applyDataSourceRestoreState === 'function') ? applyDataSourceRestoreState : null,
      rehydrateAdvancedFromState: (typeof rehydrateAdvancedFromState === 'function') ? rehydrateAdvancedFromState : null,
      rehydrateIntakeFromState: (typeof rehydrateIntakeFromState === 'function') ? rehydrateIntakeFromState : null,
      calculateGrowthAdvanced: (typeof calculateGrowthAdvanced === 'function') ? calculateGrowthAdvanced : null,
      calcEstimatedIntake: (typeof calcEstimatedIntake === 'function') ? calcEstimatedIntake : null,
      autoDisableFromStoredData: (typeof autoDisableFromStoredData === 'function') ? autoDisableFromStoredData : null,
      debouncedUpdate: (typeof debouncedUpdate === 'function') ? debouncedUpdate : null,
      scheduleMainSessionSave: (typeof scheduleMainSessionSave === 'function') ? scheduleMainSessionSave : null
    }, extra);
  }

  function showRestoreButton(){
    const adapter = getVildaDataImportExportAdapter();
    if (adapter && typeof adapter.showRestoreButton === 'function') {
      return adapter.showRestoreButton(getVildaDataImportExportRestoreOptions());
    }
    if (typeof vildaLogAppError === 'function') {
      vildaLogAppError('app:data-import-export', 'Brak VildaDataImportExport.showRestoreButton().');
    }
    return false;
  }

  function restoreLoadedState(){
    const adapter = getVildaDataImportExportAdapter();
    if (adapter && typeof adapter.restoreLoadedState === 'function') {
      return adapter.restoreLoadedState(getVildaDataImportExportRestoreOptions());
    }
    if (typeof vildaLogAppError === 'function') {
      vildaLogAppError('app:data-import-export', 'Brak VildaDataImportExport.restoreLoadedState().');
    }
    return false;
  }


  // Podłącz obsługę kliknięcia przycisku przywracania po załadowaniu DOM
  window.vildaAppOnReady('app:restore-state-button-init', function initRestoreStateButton(){
    const adapter = getVildaDataImportExportAdapter();
    if (adapter && typeof adapter.initRestoreStateButton === 'function') {
      return adapter.initRestoreStateButton(getVildaDataImportExportRestoreOptions({ restoreLoadedState }));
    }
    const rb = document.getElementById('restoreStateBtn');
    if (rb) {
      rb.addEventListener('click', function(ev){
        ev.preventDefault();
        restoreLoadedState();
      });
    }
    return false;
  });

  window.vildaExport = { collectUserData, saveUserData, applyLoadedData, clearAllData };
  const btn = document.getElementById('clearAllDataBtn');
  if(btn){
    btn.addEventListener('click', function(ev){
      ev.preventDefault();
      clearAllData();
      // Po wyczyszczeniu danych ukryj kartę podsumowania i przycisk
      const wrap = document.getElementById('prevSummaryWrap');
      const card = document.getElementById('prevSummaryCard');
      const toggle = document.getElementById('togglePrevSummary');
      if (wrap) {
        wrap.style.display = 'none';
        // Usuń znacznik załadowania poprzedniego pomiaru, aby karta nie była wyświetlana
        // w kolejnych sesjach bez wczytania danych
        if (wrap.dataset) delete wrap.dataset.loaded;
      }
      if (card) {
        card.style.display = 'none';
        if (card.dataset) delete card.dataset.loaded;
      }
      if (toggle) {
        toggle.style.display = 'none';
      }
    });
  }

  // ---------------------------------------------------------------------------
  //  Obsługa automatycznego zwijania menu po kliknięciu poza nim
  //
  //  Gdy menu hamburgera jest rozwinięte (checkbox navToggle jest zaznaczony),
  //  kliknięcie w dowolnym miejscu poza samym menu, checkboxem lub ikoną
  //  hamburgera powinno zwinąć menu.  Dzięki temu użytkownik może łatwo
  //  zamknąć menu bez konieczności ponownego klikania w ikonę.
  window.vildaAppOnReady('app:mobile-menu-autocollapse', function initMobileMenuAutocollapse() {
    const navToggle     = document.getElementById('navToggle');
    const verticalMenu  = document.getElementById('verticalMenu');
    const toggleLabel   = document.querySelector('label[for="navToggle"]');
    // Jeśli istnieje przycisk hamburgera, dołącz nasłuchiwanie zmiany stanu.
    // Gdy menu jest zwijane (navToggle.checked = false), należy ukryć wszelkie widoczne tooltipy,
    // aby nie zasłaniały innych elementów interfejsu.
    if (navToggle) {
      navToggle.addEventListener('change', function () {
        // Po zwinięciu menu od razu usuń tooltip
        if (!navToggle.checked && typeof __menuTooltip !== 'undefined' && __menuTooltip) {
          __menuTooltip.remove();
          __menuTooltip = null;
        }
      });
    }
    // Jeśli elementy istnieją, podłącz globalny listener kliknięć, który zwija menu przy kliknięciu poza nim
    if (navToggle && verticalMenu) {
      document.addEventListener('click', function (event) {
        // Reaguj tylko, gdy menu jest aktualnie rozwinięte
        if (!navToggle.checked) return;
        const target = event.target;
        // Nie zwijaj menu, jeśli kliknięto wewnątrz pionowego menu,
        // checkboxa lub etykiety sterującej (ikona hamburgera)
        if (verticalMenu.contains(target) ||
            target === navToggle ||
            (toggleLabel && (toggleLabel.contains(target) || target === toggleLabel))) {
          return;
        }
        // Kliknięto poza menu — odznacz checkbox, aby zwinąć menu
        navToggle.checked = false;
        // Usuń aktywny tooltip po zwinięciu menu, aby nie zasłaniał opcji
        if (typeof __menuTooltip !== 'undefined' && __menuTooltip) {
          __menuTooltip.remove();
          __menuTooltip = null;
        }
      });
    }
  });

(function() {
  // Baner jest teraz centralnie wstrzykiwany przez vilda_chrome.js (initConsentBanner).
  // Ten blok obsługuje jedynie starsze strony, na których baner jest jeszcze w HTML.
  const banner   = document.getElementById('consent-banner');
  const btnAccept = document.getElementById('consent-accept');
  const btnDecline = document.getElementById('consent-decline');
  // Jeśli vilda_chrome.js już przejął obsługę banera, wyjdź.
  if (!banner || !btnAccept || !btnDecline) return;

  function readAnalyticsConsent(){
    try {
      const persistence = (typeof window !== 'undefined') ? window.VildaPersistence : null;
      return persistence && typeof persistence.readPreferenceRaw === 'function'
        ? persistence.readPreferenceRaw('ANALYTICS_CONSENT', null)
        : null;
    } catch (_) {
      return null;
    }
  }

  function writeAnalyticsConsent(value){
    try {
      const persistence = (typeof window !== 'undefined') ? window.VildaPersistence : null;
      if (persistence && typeof persistence.writePreferenceRaw === 'function') {
        persistence.writePreferenceRaw('ANALYTICS_CONSENT', value, { force: true });
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 36581 });
    }
  }
  }

  // Sprawdź, czy użytkownik podjął decyzję
  const consent = readAnalyticsConsent();

  function loadGA() {
    // Consent Mode v2 — aktualizuj zgodę zanim skrypt GA4 zacznie zbierać dane
    window.dataLayer = window.dataLayer || [];
    function gtag(){ dataLayer.push(arguments); }
    gtag('consent', 'update', {
      analytics_storage: 'granted'
    });

    // Załaduj skrypt GA4 dopiero po wyrażeniu zgody
    const gaScript = document.createElement('script');
    gaScript.src = 'https://www.googletagmanager.com/gtag/js?id=G-EZZTNV8W07';
    gaScript.async = true;
    document.head.appendChild(gaScript);

    gtag('js', new Date());
    gtag('config', 'G-EZZTNV8W07', {
      anonymize_ip: true
    });
  }

  function denyGA() {
    // Consent Mode v2 — jawne potwierdzenie braku zgody
    window.dataLayer = window.dataLayer || [];
    function gtag(){ dataLayer.push(arguments); }
    gtag('consent', 'update', {
      analytics_storage: 'denied'
    });
  }

  if (!consent) {
    // Użytkownik jeszcze nie podjął decyzji — pokaż baner
    banner.style.display = 'block';
  } else if (consent === 'granted') {
    loadGA();
  } else {
    denyGA();
  }

  btnAccept.addEventListener('click', function() {
    writeAnalyticsConsent('granted');
    banner.style.display = 'none';
    loadGA();
  });

  btnDecline.addEventListener('click', function() {
    writeAnalyticsConsent('denied');
    banner.style.display = 'none';
    denyGA();
  });
})();

})();

/* =====================================================================
 * Różnice poprzedniego pomiaru i wyrównywanie wysokości kart zostały wydzielone do vilda_summary_cards.js w kroku 8Q-4.
 * ===================================================================== */

/* =====================================================================
 * Runtime persistence/autosave/restore został wydzielony do vilda_persist_runtime.js w kroku 8Q-3.
 * Karty podsumowań/metabolic summary UI zostały wydzielone do vilda_summary_cards.js w kroku 8Q-4.
 * Mostek przekazuje zależności lexical/global z app.js bez zmiany kluczy storage,
 * schematu _vildaPersist, sharedUserData, importu/eksportu JSON ani IndexedDB.
 * ===================================================================== */
(function () {
  function initPersistRuntimeBridge() {
    try {
      if (typeof window === 'undefined') return undefined;
      if (!window.VildaPersistRuntime || typeof window.VildaPersistRuntime.init !== 'function') {
        if (typeof vildaLogAppWarn === 'function') {
          vildaLogAppWarn('app:persist-runtime', 'Brak VildaPersistRuntime — autosave/restore nie został zainicjalizowany.');
        }
        return undefined;
      }
      return window.VildaPersistRuntime.init({
      __pickLastMeasurement: (typeof __pickLastMeasurement === 'function') ? __pickLastMeasurement : null,
      __renderPrevSummary: (typeof __renderPrevSummary === 'function') ? __renderPrevSummary : null,
      _getUserBasics: (typeof _getUserBasics === 'function') ? _getUserBasics : null,
      _updateIntakeFirstRowFromUserBasics: (typeof _updateIntakeFirstRowFromUserBasics === 'function') ? _updateIntakeFirstRowFromUserBasics : null,
      foods: (typeof foods !== 'undefined') ? foods : null,
      hideLoadDataMessage: (typeof hideLoadDataMessage === 'function') ? hideLoadDataMessage : null,
      importTherapyPointsToAdvancedGrowth: (typeof importTherapyPointsToAdvancedGrowth === 'function') ? importTherapyPointsToAdvancedGrowth : null,
      macroPracticeResolveFoodAliasKey: (typeof macroPracticeResolveFoodAliasKey === 'function') ? macroPracticeResolveFoodAliasKey : null,
      showLoadDataMessage: (typeof showLoadDataMessage === 'function') ? showLoadDataMessage : null,
      showRestoreButton: (typeof window.showRestoreButton === 'function') ? window.showRestoreButton : null,
      updateProfessionalSummaryCard: function updateProfessionalSummaryCardPersistRuntimeBridge() {
        if (typeof window.updateProfessionalSummaryCard === 'function') {
          return window.updateProfessionalSummaryCard.apply(window, arguments);
        }
        return null;
      },
      updateSaveBtnVisibility: (typeof window.updateSaveBtnVisibility === 'function') ? window.updateSaveBtnVisibility : null,
      vildaAppClearHtml: (typeof vildaAppClearHtml === 'function') ? vildaAppClearHtml : null,
      vildaLogAppError: (typeof vildaLogAppError === 'function') ? vildaLogAppError : null,
      vildaLogAppWarn: (typeof vildaLogAppWarn === 'function') ? vildaLogAppWarn : null,
      writeGhTherapyPointsToModuleStorage: (typeof writeGhTherapyPointsToModuleStorage === 'function') ? writeGhTherapyPointsToModuleStorage : null
      });
    } catch (error) {
      if (typeof vildaLogAppError === 'function') {
        vildaLogAppError('app:persist-runtime', 'Nie udało się zainicjalizować VildaPersistRuntime.', error);
      } else if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', error, { feature: 'persist-runtime:init-bridge', step: '8Q-3' });
      }
      return undefined;
    }
  }

  if (typeof window !== 'undefined' && typeof window.vildaAppSafeInit === 'function') {
    window.vildaAppSafeInit('app:persist-runtime', initPersistRuntimeBridge, { once: true, phase: 'init' });
  } else {
    initPersistRuntimeBridge();
  }
})();
