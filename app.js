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
 * ========================================================================== */

const VILDA_FOOD_DATA = (typeof window !== 'undefined' && window.VildaFoodData) ? window.VildaFoodData : {};
if (!VILDA_FOOD_DATA.version && typeof vildaLogAppWarn === 'function') {
  vildaLogAppWarn('food-data', 'Brak VildaFoodData — dane produktów i aktywności nie zostały załadowane przed app.js.');
}

const snacks = VILDA_FOOD_DATA.snacks || {};
const meals = VILDA_FOOD_DATA.meals || {};
const foods = VILDA_FOOD_DATA.foods || Object.assign({}, snacks, meals);

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

const DIET_LEVELS = {
  light:   { label:'lekka',       deficitPct:0.15, maxDeficit:500 },
  moderate:{ label:'umiarkowana', deficitPct:0.22, maxDeficit:750 },
  intense: { label:'intensywna',  deficitPct:0.30, maxDeficit:1000 }
};

// Opisy diet redukcyjnych w języku polskim. Każda dieta ma krótki opis
// wyjaśniający charakter deficytu kalorycznego oraz docelowe tempo utraty wagi.
const DIET_DESCRIPTIONS = {
  light: 'Dieta lekka – niewielki deficyt ok. 15% całkowitego wydatku energetycznego (300–500 kcal/dzień),\npozwalający na utratę ok. 0,25–0,5 kg tygodniowo. Odpowiednia dla dzieci i osób z niewielką nadwagą;\nzachęca do stopniowych zmian bez ryzyka niedoborów.',
  // w opisach diet rozwijamy skrót TEE do "całkowitego wydatku energetycznego" dla lepszej czytelności
  moderate: 'Dieta umiarkowana – deficyt ok. 22% całkowitego wydatku energetycznego (500–750 kcal/dzień),\nco zwykle prowadzi do utraty ok. 0,5 kg tygodniowo. Zalecana jako domyślna zgodnie z konsensusem WHO i CDC;\npomaga redukować tkankę tłuszczową przy minimalnej utracie mięśni.',
  intense: 'Dieta intensywna – duży deficyt ok. 30% całkowitego wydatku energetycznego (750–1000 kcal/dzień) i szybsze tempo utraty (0,8–1 kg/tydzień).\nPrzeznaczona dla osób z otyłością i tylko pod nadzorem specjalisty;\nmoże wiązać się z większym ryzykiem niedoborów i efektu jojo.'
};

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

function vildaPerfIsEnabled(){
  try {
    return !!(typeof window !== 'undefined' && window.DEBUG_PERF);
  } catch (_) {
    return false;
  }
}

function vildaPerfStart(label){
  const enabled = vildaPerfIsEnabled() && typeof performance !== 'undefined' && typeof performance.now === 'function';
  if (!enabled) return function(){};
  const start = performance.now();
  return function(){
    const duration = performance.now() - start;
    try {
      if (typeof performance.mark === 'function' && typeof performance.measure === 'function') {
        const markStart = label + ':start:' + start.toFixed(3);
        const markEnd = label + ':end:' + (start + duration).toFixed(3);
        performance.mark(markStart);
        performance.mark(markEnd);
        performance.measure(label, markStart, markEnd);
      }
    } catch (_) {}
    try {
      if (typeof console !== 'undefined' && typeof console.debug === 'function') {
        console.debug('[VILDA PERF]', label, Math.round(duration * 100) / 100 + 'ms');
      }
    } catch (_) {}
  };
}

function getGHTherapySyncBridge(){
  try {
    if (typeof window === 'undefined' || !window.VildaGHTherapySync) return null;
    return window.VildaGHTherapySync;
  } catch (_) {
    return null;
  }
}

function openGHTherapyDB(){
  const bridge = getGHTherapySyncBridge();
  if (bridge && typeof bridge.openGHTherapyDB === 'function') return bridge.openGHTherapyDB();
  return Promise.reject(new Error('VildaGHTherapySync unavailable: openGHTherapyDB'));
}

function attachGHTherapyDBVersionChangeHandler(db, contextLabel){
  const bridge = getGHTherapySyncBridge();
  if (bridge && typeof bridge.attachGHTherapyDBVersionChangeHandler === 'function') {
    return bridge.attachGHTherapyDBVersionChangeHandler(db, contextLabel);
  }
  return db;
}

function closeGHTherapyDBConnection(db, contextLabel){
  const bridge = getGHTherapySyncBridge();
  if (bridge && typeof bridge.closeGHTherapyDBConnection === 'function') {
    return bridge.closeGHTherapyDBConnection(db, contextLabel);
  }
  return undefined;
}

async function getTherapyPointsFromDB(){
  const __perfEnd = vildaPerfStart('P1:getTherapyPointsFromDB');
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
    __perfEnd();
  }
}

async function clearTherapyPointsInDB(){
  const __perfEnd = vildaPerfStart('P1:clearTherapyPointsInDB');
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
    __perfEnd();
  }
}

function isGhAdvancedImportSuppressed(){
  const bridge = getGHTherapySyncBridge();
  if (bridge && typeof bridge.isGhAdvancedImportSuppressed === 'function') return bridge.isGhAdvancedImportSuppressed();
  try {
    if (typeof window === 'undefined') return false;
    return Number(window.__vildaSuppressGhAdvancedImportUntil || 0) > Date.now();
  } catch (_) {
    return false;
  }
}

function readGhTherapyPointsFromModuleStorage(){
  const bridge = getGHTherapySyncBridge();
  if (bridge && typeof bridge.readGhTherapyPointsFromModuleStorage === 'function') return bridge.readGhTherapyPointsFromModuleStorage();
  return [];
}

function writeGhTherapyPointsToModuleStorage(points){
  const bridge = getGHTherapySyncBridge();
  if (bridge && typeof bridge.writeGhTherapyPointsToModuleStorage === 'function') return bridge.writeGhTherapyPointsToModuleStorage(points);
  return false;
}

function clearGhTherapyPointsModuleStorage(){
  const bridge = getGHTherapySyncBridge();
  if (bridge && typeof bridge.clearGhTherapyPointsModuleStorage === 'function') return bridge.clearGhTherapyPointsModuleStorage();
  return false;
}

function handleGHTherapyBroadcastMessage(){
  const bridge = getGHTherapySyncBridge();
  if (bridge && typeof bridge.handleGHTherapyBroadcastMessage === 'function') return bridge.handleGHTherapyBroadcastMessage();
  return undefined;
}

function isGHTherapyBroadcastChannelOpen(){
  const bridge = getGHTherapySyncBridge();
  if (bridge && typeof bridge.isGHTherapyBroadcastChannelOpen === 'function') return bridge.isGHTherapyBroadcastChannelOpen();
  return false;
}

function getGHTherapyBroadcastChannel(){
  const bridge = getGHTherapySyncBridge();
  if (bridge && typeof bridge.getGHTherapyBroadcastChannel === 'function') return bridge.getGHTherapyBroadcastChannel();
  return null;
}

function closeGHTherapyBroadcastChannel(contextLabel){
  const bridge = getGHTherapySyncBridge();
  if (bridge && typeof bridge.closeGHTherapyBroadcastChannel === 'function') return bridge.closeGHTherapyBroadcastChannel(contextLabel);
  return false;
}

function registerGHTherapyBroadcastChannelLifecycleCleanup(){
  const bridge = getGHTherapySyncBridge();
  if (bridge && typeof bridge.registerGHTherapyBroadcastChannelLifecycleCleanup === 'function') return bridge.registerGHTherapyBroadcastChannelLifecycleCleanup();
  return false;
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
// Wartość ta jest modyfikowana przez przełącznik umieszczony w karcie BMI
// (resultsModeToggle) oraz zapisywana w localStorage, aby stan został
// zachowany pomiędzy sesjami.
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
      try { return (typeof bmiSource !== 'undefined' && bmiSource) ? bmiSource : 'WHO'; } catch (_) { return 'WHO'; }
    },
    setBmiSource: function (source) {
      const normalized = ['PALCZEWSKA', 'OLAF', 'WHO'].includes(String(source || '').toUpperCase()) ? String(source || '').toUpperCase() : 'WHO';
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
  const age = Number.isFinite(ageYears) ? ageYears : 0;
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
  const selectedSource = normalizeGrowthDataSource(source) || 'WHO';
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
  const __perfEnd = vildaPerfStart('P2:syncGrowthDataSourceInputs');
  const adapter = getVildaAdvancedGrowthAdapter();
  if (adapter && typeof adapter.syncGrowthDataSourceInputs === 'function') {
    try {
      return adapter.syncGrowthDataSourceInputs(getVildaAdvancedGrowthSourceOptions(options || {}));
    } finally {
      __perfEnd();
    }
  }
  try {
    return (typeof bmiSource !== 'undefined' && bmiSource) ? bmiSource : 'WHO';
  } finally {
    __perfEnd();
  }
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
  const __perfEnd = vildaPerfStart('P2:updateGrowthDataSourceControls');
  const adapter = getVildaAdvancedGrowthAdapter();
  if (adapter && typeof adapter.updateGrowthDataSourceControls === 'function') {
    const mergedOptions = getVildaAdvancedGrowthSourceOptions(options || {});
    if (!mergedOptions.markSection && typeof window !== 'undefined' && window.VildaUpdatePrep && typeof window.VildaUpdatePrep.markSection === 'function') {
      mergedOptions.markSection = window.VildaUpdatePrep.markSection;
    }
    try {
      return adapter.updateGrowthDataSourceControls(context, mergedOptions);
    } finally {
      __perfEnd();
    }
  }
  try {
    return { action: 'skipped', reason: 'missing-vilda-advanced-growth' };
  } finally {
    __perfEnd();
  }
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
const DIET_BULLETS = {
  light: [
    'niewielki deficyt (ok. 15 % całkowitego wydatku energetycznego, 300–500 kcal dziennie)',
    'utrata ok. 0,25–0,5 kg tygodniowo',
    'odpowiednia dla dzieci i osób z niewielką nadwagą',
    'zachęca do stopniowych zmian bez ryzyka niedoborów'
  ],
  moderate: [
    'deficyt ok. 22 % całkowitego wydatku energetycznego (500–750 kcal dziennie)',
    'utrata ok. 0,5 kg tygodniowo',
    'zalecana jako domyślna zgodnie z konsensusem WHO i CDC',
    'pomaga redukować tkankę tłuszczową przy minimalnej utracie mięśni'
  ],
  intense: [
    'duży deficyt ok. 30 % całkowitego wydatku energetycznego (750–1000 kcal dziennie)',
    'szybsza utrata masy (0,8–1 kg tygodniowo)',
    'przeznaczona dla osób z otyłością i tylko pod nadzorem specjalisty',
    'może wiązać się z większym ryzykiem niedoborów i efektu jojo'
  ]
};

// Opisy współczynników aktywności fizycznej PAL. Wyświetlane są po wyborze w formularzu,
// aby użytkownik świadomie określił swój poziom aktywności.
const ENERGY_ADULT_START_AGE = 19;
const ENERGY_CHILD_GROWTH_MULTIPLIER = 1.01;

const ENERGY_REFERENCE_INFANT_TABLE = {
  M: {
    6: { weightKg: 7.9, ear: 1.12, rda: 1.31 },
    7: { weightKg: 8.3, ear: 1.12, rda: 1.31 },
    8: { weightKg: 8.6, ear: 1.12, rda: 1.31 },
    9: { weightKg: 8.9, ear: 1.12, rda: 1.31 },
    10: { weightKg: 9.2, ear: 1.12, rda: 1.31 },
    11: { weightKg: 9.4, ear: 1.12, rda: 1.31 }
  },
  F: {
    6: { weightKg: 7.3, ear: 1.12, rda: 1.31 },
    7: { weightKg: 7.6, ear: 1.12, rda: 1.31 },
    8: { weightKg: 7.9, ear: 1.12, rda: 1.31 },
    9: { weightKg: 8.2, ear: 1.12, rda: 1.31 },
    10: { weightKg: 8.5, ear: 1.12, rda: 1.31 },
    11: { weightKg: 8.7, ear: 1.12, rda: 1.31 }
  }
};

const ENERGY_REFERENCE_CHILD_TABLE = {
  M: {
    1: { heightCm: 75.7, weightKg: 9.6, ear: 0.95, rda: 1.14 },
    2: { heightCm: 87.8, weightKg: 12.2, ear: 0.79, rda: 0.97 },
    3: { heightCm: 96.1, weightKg: 14.3, ear: 0.73, rda: 0.90 },
    4: { heightCm: 103.3, weightKg: 16.3, ear: 0.69, rda: 0.86 },
    5: { heightCm: 111.8, weightKg: 19.1, ear: 0.69, rda: 0.85 },
    6: { heightCm: 118.4, weightKg: 21.6, ear: 0.72, rda: 0.89 },
    7: { heightCm: 124.6, weightKg: 24.4, ear: 0.74, rda: 0.91 },
    8: { heightCm: 130.5, weightKg: 27.6, ear: 0.75, rda: 0.92 },
    9: { heightCm: 136.3, weightKg: 30.8, ear: 0.75, rda: 0.92 },
    10: { heightCm: 141.5, weightKg: 34.2, ear: 0.75, rda: 0.91 },
    11: { heightCm: 146.7, weightKg: 38.1, ear: 0.75, rda: 0.91 },
    12: { heightCm: 152.9, weightKg: 42.7, ear: 0.74, rda: 0.90 },
    13: { heightCm: 160.2, weightKg: 48.1, ear: 0.73, rda: 0.90 },
    14: { heightCm: 167.2, weightKg: 53.8, ear: 0.72, rda: 0.89 },
    15: { heightCm: 172.5, weightKg: 59.0, ear: 0.72, rda: 0.88 },
    16: { heightCm: 175.7, weightKg: 63.3, ear: 0.71, rda: 0.87 },
    17: { heightCm: 177.6, weightKg: 66.9, ear: 0.70, rda: 0.86 },
    18: { heightCm: 178.7, weightKg: 69.9, ear: 0.66, rda: 0.83 }
  },
  F: {
    1: { heightCm: 74.0, weightKg: 8.9, ear: 0.95, rda: 1.14 },
    2: { heightCm: 86.4, weightKg: 11.5, ear: 0.79, rda: 0.97 },
    3: { heightCm: 95.1, weightKg: 13.9, ear: 0.73, rda: 0.90 },
    4: { heightCm: 102.7, weightKg: 16.1, ear: 0.69, rda: 0.86 },
    5: { heightCm: 110.5, weightKg: 18.7, ear: 0.69, rda: 0.85 },
    6: { heightCm: 117.0, weightKg: 21.0, ear: 0.72, rda: 0.89 },
    7: { heightCm: 123.0, weightKg: 23.5, ear: 0.74, rda: 0.91 },
    8: { heightCm: 129.4, weightKg: 26.6, ear: 0.75, rda: 0.92 },
    9: { heightCm: 135.2, weightKg: 29.9, ear: 0.75, rda: 0.92 },
    10: { heightCm: 140.8, weightKg: 33.6, ear: 0.75, rda: 0.91 },
    11: { heightCm: 147.1, weightKg: 37.9, ear: 0.73, rda: 0.90 },
    12: { heightCm: 153.8, weightKg: 42.8, ear: 0.72, rda: 0.89 },
    13: { heightCm: 159.1, weightKg: 47.7, ear: 0.71, rda: 0.88 },
    14: { heightCm: 162.2, weightKg: 51.3, ear: 0.70, rda: 0.87 },
    15: { heightCm: 163.7, weightKg: 53.6, ear: 0.69, rda: 0.85 },
    16: { heightCm: 164.4, weightKg: 55.0, ear: 0.68, rda: 0.84 },
    17: { heightCm: 164.7, weightKg: 55.7, ear: 0.67, rda: 0.83 },
    18: { heightCm: 165.1, weightKg: 56.2, ear: 0.66, rda: 0.83 }
  }
};

const ENERGY_PAL_META = {
  '1.2': {
    shortLabel: '1.2 – bardzo mała aktywność (tryb kliniczny)',
    description: 'PAL 1.2 – bardzo mała aktywność. Tryb kliniczny poza Normami 2024; stosuj tylko wtedy, gdy naprawdę odpowiada sytuacji pacjenta.',
    tableLabel: 'bardzo mała aktywność',
    tableHint: 'np. unieruchomienie lub skrajnie siedzący tryb życia',
    clinical: true
  },
  '1.4': {
    shortLabel: '1.4 – mała aktywność',
    description: 'PAL 1.4 – mała aktywność.',
    tableLabel: 'mała aktywność',
    tableHint: 'np. mało ruchu w ciągu dnia',
    clinical: false
  },
  '1.6': {
    shortLabel: '1.6 – umiarkowana aktywność',
    description: 'PAL 1.6 – umiarkowana aktywność.',
    tableLabel: 'umiarkowana aktywność',
    tableHint: 'np. umiarkowana ilość ruchu w ciągu dnia',
    clinical: false
  },
  '1.8': {
    shortLabel: '1.8 – aktywny tryb życia',
    description: 'PAL 1.8 – aktywny tryb życia.',
    tableLabel: 'aktywny tryb życia',
    tableHint: 'np. dużo ruchu lub regularny trening',
    clinical: false
  },
  '2.0': {
    shortLabel: '2.0 – bardzo aktywny tryb życia',
    description: 'PAL 2.0 – bardzo aktywny tryb życia.',
    tableLabel: 'bardzo aktywny tryb życia',
    tableHint: 'np. bardzo duża aktywność lub intensywny trening',
    clinical: false
  }
};

const ENERGY_PAL_LABELS = Object.fromEntries(
  Object.entries(ENERGY_PAL_META).map(([key, value]) => [key, value.shortLabel])
);

const PAL_DESCRIPTIONS = Object.fromEntries(
  Object.entries(ENERGY_PAL_META).map(([key, value]) => [key, value.description])
);

const ENERGY_PAL_TABLE_LABELS = Object.fromEntries(
  Object.entries(ENERGY_PAL_META).map(([key, value]) => [key, value.tableLabel])
);

const ENERGY_PAL_TABLE_HINTS = Object.fromEntries(
  Object.entries(ENERGY_PAL_META).map(([key, value]) => [key, value.tableHint])
);

function energyEscapeHtml(value) {
  if (typeof window !== 'undefined' && window.VildaHtml && typeof window.VildaHtml.escapeHtml === 'function') {
    return window.VildaHtml.escapeHtml(value);
  }
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function energyGetPalMeta(pal) {
  const num = Number(pal);
  if (!Number.isFinite(num)) return null;
  return ENERGY_PAL_META[num.toFixed(1)] || null;
}

function energyGetPalOptionLabel(pal) {
  const num = Number(pal);
  if (!Number.isFinite(num)) return '';
  const key = num.toFixed(1);
  const meta = energyGetPalMeta(key);
  return meta && meta.shortLabel ? meta.shortLabel : key;
}

function energyGetPalDescription(pal) {
  const meta = energyGetPalMeta(pal);
  return meta && meta.description ? meta.description : '';
}

function energyFormatPalCodeLabel(pal) {
  const num = Number(pal);
  if (!Number.isFinite(num)) return '';
  return `PAL ${num.toFixed(1)}`;
}

function energyFormatPalRangeLabel(minPal, maxPal, { prefix = 'PAL' } = {}) {
  const minNum = Number(minPal);
  const maxNum = Number(maxPal);
  if (!(Number.isFinite(minNum) && Number.isFinite(maxNum))) return '';
  if (Math.abs(minNum - maxNum) < 0.01) {
    return prefix ? `${prefix} ${minNum.toFixed(1)}` : minNum.toFixed(1);
  }
  return prefix ? `${prefix} ${minNum.toFixed(1)}–${maxNum.toFixed(1)}` : `${minNum.toFixed(1)}–${maxNum.toFixed(1)}`;
}

function energyGetPalTableLabel(pal) {
  const meta = energyGetPalMeta(pal);
  const code = energyFormatPalCodeLabel(pal);
  if (!code) return 'Poziom aktywności';
  return meta && meta.tableLabel ? `${code} — ${meta.tableLabel}` : code;
}

function energyGetPalTableHint(pal) {
  const meta = energyGetPalMeta(pal);
  return meta && meta.tableHint ? meta.tableHint : '';
}

function energyGetContextModeBadge(contextOrState) {
  const ctx = contextOrState && contextOrState.context ? contextOrState.context : contextOrState;
  const policy = ctx && ctx.policy ? ctx.policy : null;
  const pal = ctx && ctx.pal ? ctx.pal : null;
  const usingPal12 = !!(policy && policy.clinicalOverride) || (pal && Number(pal.used) === 1.2);
  if (!usingPal12) return null;

  return {
    text: 'Tryb kliniczny',
    tone: 'clinical',
    detail: 'PAL 1.2 – poza Normami 2024.',
    title: 'PAL 1.2 nie należy do standardowych poziomów PAL z norm referencyjnych i pozostaje wyłącznie klinicznym override.'
  };
}

function energyRenderModeBadgeHtml(badge) {
  if (!badge) return '';
  const tone = energyEscapeHtml(badge.tone || 'info');
  const text = energyEscapeHtml(badge.text || 'Informacyjnie');
  const detailHtml = badge.detail ? `<span class="energy-mode-badge-caption">${energyEscapeHtml(badge.detail)}</span>` : '';
  const titleAttr = badge.title ? ` title="${energyEscapeHtml(badge.title)}"` : '';
  return `<span class="energy-mode-badge energy-mode-badge--${tone}"${titleAttr}>${text}</span>${detailHtml}`;
}

/* === ENERGY NORMS ENGINE: PAL HELPERS START ====================== */
const ENERGY_PAL_PRESETS = {
  infant_0_5: [],
  infant_6_11: [],
  child_1_3: [1.4],
  child_4_9: [1.4, 1.6, 1.8],
  child_10_18: [1.6, 1.8, 2.0],
  adult_normative: [1.4, 1.6, 1.8, 2.0],
  adult_clinical: [1.2, 1.4, 1.6, 1.8, 2.0]
};

const ENERGY_CONTEXT_PRESETS = {
  nutrition_reference: {
    palPolicy: 'normative',
    bodyPolicy: 'reference',
    allowRange: true,
    allowClinicalPal12: false,
    applyRiskAdjust: false
  },
  nutrition_actual: {
    palPolicy: 'normative',
    bodyPolicy: 'actual',
    allowRange: true,
    allowClinicalPal12: false,
    applyRiskAdjust: false
  },
  intake_observed: {
    palPolicy: 'clinical',
    bodyPolicy: 'actual',
    allowRange: false,
    allowClinicalPal12: true,
    applyRiskAdjust: 'optional'
  },
  plan_reduction: {
    palPolicy: 'clinical',
    bodyPolicy: 'actual',
    allowRange: false,
    allowClinicalPal12: true,
    applyRiskAdjust: 'optional'
  }
};

function energyGetPresetConfig(preset) {
  const config = ENERGY_CONTEXT_PRESETS[preset] || ENERGY_CONTEXT_PRESETS.nutrition_actual;
  return {
    palPolicy: config.palPolicy,
    bodyPolicy: config.bodyPolicy,
    allowRange: !!config.allowRange,
    allowClinicalPal12: !!config.allowClinicalPal12,
    applyRiskAdjust: config.applyRiskAdjust
  };
}

function energyNormalizePalFromAllowed(pal, allowed) {
  const palette = Array.isArray(allowed) ? allowed.slice() : [];
  if (!palette.length) return { pal: null, allowed: palette };
  if (pal == null || pal === '') return { pal: palette[0], allowed: palette };
  const numericPal = Number(pal);
  if (palette.includes(numericPal)) return { pal: numericPal, allowed: palette };
  return { pal: palette[0], allowed: palette };
}

function energyResolvePalBand(ageYears, ageMonthsOpt = 0) {
  const ageNum = Number(ageYears) || 0;
  const years = Math.floor(ageNum);
  const months = years === 0
    ? Math.floor(Number(ageMonthsOpt) || Math.round(ageNum * 12))
    : Math.floor(ageNum * 12);

  if (months < 6) return 'infant_0_5';
  if (months < 12) return 'infant_6_11';
  if (years < 4) return 'child_1_3';
  if (years < 10) return 'child_4_9';
  if (years < ENERGY_ADULT_START_AGE) return 'child_10_18';
  return 'adult';
}

function energyGetAllowedPals(ageYears, ageMonthsOpt = 0, palMode = 'normative') {
  const band = energyResolvePalBand(ageYears, ageMonthsOpt);
  if (band === 'adult') {
    return palMode === 'clinical'
      ? ENERGY_PAL_PRESETS.adult_clinical.slice()
      : ENERGY_PAL_PRESETS.adult_normative.slice();
  }
  return (ENERGY_PAL_PRESETS[band] || []).slice();
}

function energyNormalizePal(ageYears, ageMonthsOpt = 0, pal, palMode = 'normative') {
  const allowed = energyGetAllowedPals(ageYears, ageMonthsOpt, palMode);
  if (!allowed.length) return { pal: null, allowed };
  const numericPal = Number(pal);
  if (allowed.includes(numericPal)) return { pal: numericPal, allowed };
  return { pal: allowed[0], allowed };
}

function energyIsNumeric(value) {
  return typeof value === 'number' && isFinite(value);
}

function energyPopulatePalSelect(selectEl, { ageYears, ageMonthsOpt = 0, value = null, palMode = 'normative' }) {
  if (!selectEl) return;
  const preferred = (value !== null && value !== undefined && value !== '') ? Number(value) : Number(selectEl.value);
  const { pal, allowed } = energyNormalizePal(ageYears, ageMonthsOpt, preferred, palMode);
  if (!allowed.length) {
    vildaAppSetTrustedHtml(selectEl, '<option value="">nie dotyczy</option>', 'app:selectEl');
    selectEl.value = '';
    return;
  }
  vildaAppSetTrustedHtml(selectEl, allowed.map(v => {
    const key = v.toFixed(1);
    const label = energyGetPalOptionLabel(v) || ENERGY_PAL_LABELS[key] || key;
    return `<option value="${key}">${label}</option>`;
  }).join(''), 'app:energy-pal-options');
  if (isFinite(preferred) && allowed.includes(preferred)) {
    selectEl.value = preferred.toFixed(1);
  } else if (pal != null) {
    selectEl.value = pal.toFixed(1);
  }
}

function energyPopulatePalSelectByPreset(selectEl, {
  preset = 'nutrition_actual',
  ageYears,
  ageMonthsOpt = 0,
  value = null
} = {}) {
  const presetConfig = energyGetPresetConfig(preset);
  const palMode = presetConfig.palPolicy === 'clinical' ? 'clinical' : 'normative';
  return energyPopulatePalSelect(selectEl, {
    ageYears,
    ageMonthsOpt,
    value,
    palMode
  });
}
/* === ENERGY NORMS ENGINE: PAL HELPERS END ======================== */

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
function updateDietDescription(key) {
  const descEl = document.getElementById('dietDesc');
  if (!descEl) return;
  const text = DIET_DESCRIPTIONS[key];
  if (text) {
    descEl.textContent = text;
    descEl.style.display = 'block';
  } else {
    descEl.textContent = '';
    descEl.style.display = 'none';
  }
}

/**
 * Ustawia opis dla wybranego współczynnika PAL. Pobiera opis z PAL_DESCRIPTIONS
 * i wyświetla go w elemencie #palDesc. Jeśli opis nie jest zdefiniowany,
 * element jest ukrywany.
 * @param {number|string} value – wybrany współczynnik PAL (np. '1.6')
 */
function updatePalDescription(value, mountId = 'palDesc') {
  const descEl = document.getElementById(mountId);
  if (!descEl) return;
  const text = energyGetPalDescription(value);
  const badge = energyGetContextModeBadge({
    policy: { clinicalOverride: Number(value) === 1.2 },
    pal: { used: Number(value) }
  });
  if (text) {
    const badgeHtml = badge
      ? `<div class="energy-mode-badge-row energy-mode-badge-row--inline">${energyRenderModeBadgeHtml(badge)}</div>`
      : '';
    vildaAppSetTrustedHtml(descEl, `<div class="energy-pal-description-text">${energyEscapeHtml(text)}</div>${badgeHtml}`, 'app:descEl');
    descEl.style.display = 'block';
  } else {
    vildaAppClearHtml(descEl);
    descEl.style.display = 'none';
  }
}

// Minimalna dzienna podaż energii (kcal)
const MIN_INTAKE_ADULT  = { M:1600, F:1200 }; // WHO / NIH konsensus
const MIN_INTAKE_CHILD  = 1200;               // absolutne minimum pediatryczne

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
const WFL_DATA_GIRLS = [[45.0,-0.3833,2.4607,0.09029],[45.5,-0.3833,2.5457,0.09033],[46.0,-0.3833,2.6306,0.09037],[46.5,-0.3833,2.7155,0.0904],[47.0,-0.3833,2.8007,0.09044],[47.5,-0.3833,2.8867,0.09048],[48.0,-0.3833,2.9741,0.09052],[48.5,-0.3833,3.0636,0.09056],[49.0,-0.3833,3.156,0.0906],[49.5,-0.3833,3.252,0.09064],[50.0,-0.3833,3.3518,0.09068],[50.5,-0.3833,3.4557,0.09072],[51.0,-0.3833,3.5636,0.09076],[51.5,-0.3833,3.6754,0.0908],[52.0,-0.3833,3.7911,0.09085],[52.5,-0.3833,3.9105,0.09089],[53.0,-0.3833,4.0332,0.09093],[53.5,-0.3833,4.1591,0.09098],[54.0,-0.3833,4.2875,0.09102],[54.5,-0.3833,4.4179,0.09106],[55.0,-0.3833,4.5498,0.0911],[55.5,-0.3833,4.6827,0.09114],[56.0,-0.3833,4.8162,0.09118],[56.5,-0.3833,4.95,0.09121],[57.0,-0.3833,5.0837,0.09125],[57.5,-0.3833,5.2173,0.09128],[58.0,-0.3833,5.3507,0.0913],[58.5,-0.3833,5.4834,0.09132],[59.0,-0.3833,5.6151,0.09134],[59.5,-0.3833,5.7454,0.09135],[60.0,-0.3833,5.8742,0.09136],[60.5,-0.3833,6.0014,0.09137],[61.0,-0.3833,6.127,0.09137],[61.5,-0.3833,6.2511,0.09136],[62.0,-0.3833,6.3738,0.09135],[62.5,-0.3833,6.4948,0.09133],[63.0,-0.3833,6.6144,0.09131],[63.5,-0.3833,6.7328,0.09129],[64.0,-0.3833,6.8501,0.09126],[64.5,-0.3833,6.9662,0.09123],[65.0,-0.3833,7.0812,0.09119],[65.5,-0.3833,7.195,0.09115],[66.0,-0.3833,7.3076,0.0911],[66.5,-0.3833,7.4189,0.09106],[67.0,-0.3833,7.5288,0.09101],[67.5,-0.3833,7.6375,0.09096],[68.0,-0.3833,7.7448,0.0909],[68.5,-0.3833,7.8509,0.09085],[69.0,-0.3833,7.9559,0.09079],[69.5,-0.3833,8.0599,0.09074],[70.0,-0.3833,8.163,0.09068],[70.5,-0.3833,8.2651,0.09062],[71.0,-0.3833,8.3666,0.09056],[71.5,-0.3833,8.4676,0.0905],[72.0,-0.3833,8.5679,0.09043],[72.5,-0.3833,8.6674,0.09037],[73.0,-0.3833,8.7661,0.09031],[73.5,-0.3833,8.8638,0.09025],[74.0,-0.3833,8.9601,0.09018],[74.5,-0.3833,9.0552,0.09012],[75.0,-0.3833,9.149,0.09005],[75.5,-0.3833,9.2418,0.08999],[76.0,-0.3833,9.3337,0.08992],[76.5,-0.3833,9.4252,0.08985],[77.0,-0.3833,9.5166,0.08979],[77.5,-0.3833,9.6086,0.08972],[78.0,-0.3833,9.7015,0.08965],[78.5,-0.3833,9.7957,0.08959],[79.0,-0.3833,9.8915,0.08952],[79.5,-0.3833,9.9892,0.08946],[80.0,-0.3833,10.0891,0.0894],[80.5,-0.3833,10.1916,0.08934],[81.0,-0.3833,10.2965,0.08928],[81.5,-0.3833,10.4041,0.08923],[82.0,-0.3833,10.514,0.08918],[82.5,-0.3833,10.6263,0.08914],[83.0,-0.3833,10.741,0.0891],[83.5,-0.3833,10.8578,0.08906],[84.0,-0.3833,10.9767,0.08903],[84.5,-0.3833,11.0974,0.089],[85.0,-0.3833,11.2198,0.08898],[85.5,-0.3833,11.3435,0.08897],[86.0,-0.3833,11.4684,0.08895],[86.5,-0.3833,11.594,0.08895],[87.0,-0.3833,11.7201,0.08895],[87.5,-0.3833,11.8461,0.08895],[88.0,-0.3833,11.972,0.08896],[88.5,-0.3833,12.0976,0.08898],[89.0,-0.3833,12.2229,0.089],[89.5,-0.3833,12.3477,0.08903],[90.0,-0.3833,12.4723,0.08906],[90.5,-0.3833,12.5965,0.08909],[91.0,-0.3833,12.7205,0.08913],[91.5,-0.3833,12.8443,0.08918],[92.0,-0.3833,12.9681,0.08923],[92.5,-0.3833,13.092,0.08928],[93.0,-0.3833,13.2158,0.08934],[93.5,-0.3833,13.3399,0.08941],[94.0,-0.3833,13.4643,0.08948],[94.5,-0.3833,13.5892,0.08955],[95.0,-0.3833,13.7146,0.08963],[95.5,-0.3833,13.8408,0.08972],[96.0,-0.3833,13.9676,0.08981],[96.5,-0.3833,14.0953,0.0899],[97.0,-0.3833,14.2239,0.09],[97.5,-0.3833,14.3537,0.0901],[98.0,-0.3833,14.4848,0.09021],[98.5,-0.3833,14.6174,0.09033],[99.0,-0.3833,14.7519,0.09044],[99.5,-0.3833,14.8882,0.09057],[100.0,-0.3833,15.0267,0.09069],[100.5,-0.3833,15.1676,0.09083],[101.0,-0.3833,15.3108,0.09096],[101.5,-0.3833,15.4564,0.0911],[102.0,-0.3833,15.6046,0.09125],[102.5,-0.3833,15.7553,0.09139],[103.0,-0.3833,15.9087,0.09155],[103.5,-0.3833,16.0645,0.0917],[104.0,-0.3833,16.2229,0.09186],[104.5,-0.3833,16.3837,0.09203],[105.0,-0.3833,16.547,0.09219],[105.5,-0.3833,16.7129,0.09236],[106.0,-0.3833,16.8814,0.09254],[106.5,-0.3833,17.0527,0.09271],[107.0,-0.3833,17.2269,0.09289],[107.5,-0.3833,17.4039,0.09307],[108.0,-0.3833,17.5839,0.09326],[108.5,-0.3833,17.7668,0.09344],[109.0,-0.3833,17.9526,0.09363],[109.5,-0.3833,18.1412,0.09382],[110.0,-0.3833,18.3324,0.09401]];

// Updated LMS parameters for boys: Weight-for-Length (birth to 2 years)
// Source: WHO infant weight‑for‑length percentiles table (<24 months) published on MSD Manuals.
// Each entry contains [length_cm, L, M, S]. The Power (L) parameter is constant (-0.3521) across lengths.
const WFL_DATA_BOYS = [
  [45.0,  -0.3521,  2.4410, 0.09182],
  [45.5,  -0.3521,  2.5244, 0.09153],
  [46.0,  -0.3521,  2.6077, 0.09124],
  [46.5,  -0.3521,  2.6913, 0.09094],
  [47.0,  -0.3521,  2.7755, 0.09065],
  [47.5,  -0.3521,  2.8609, 0.09036],
  [48.0,  -0.3521,  2.9480, 0.09007],
  [48.5,  -0.3521,  3.0377, 0.08977],
  [49.0,  -0.3521,  3.1308, 0.08948],
  [49.5,  -0.3521,  3.2276, 0.08919],
  [50.0,  -0.3521,  3.3278, 0.08890],
  [50.5,  -0.3521,  3.4311, 0.08861],
  [51.0,  -0.3521,  3.5376, 0.08831],
  [51.5,  -0.3521,  3.6477, 0.08801],
  [52.0,  -0.3521,  3.7620, 0.08771],
  [52.5,  -0.3521,  3.8814, 0.08741],
  [53.0,  -0.3521,  4.0060, 0.08711],
  [53.5,  -0.3521,  4.1354, 0.08681],
  [54.0,  -0.3521,  4.2693, 0.08651],
  [54.5,  -0.3521,  4.4066, 0.08621],
  [55.0,  -0.3521,  4.5467, 0.08592],
  [55.5,  -0.3521,  4.6892, 0.08563],
  [56.0,  -0.3521,  4.8338, 0.08535],
  [56.5,  -0.3521,  4.9796, 0.08507],
  [57.0,  -0.3521,  5.1259, 0.08481],
  [57.5,  -0.3521,  5.2721, 0.08455],
  [58.0,  -0.3521,  5.4180, 0.08430],
  [58.5,  -0.3521,  5.5632, 0.08406],
  [59.0,  -0.3521,  5.7074, 0.08383],
  [59.5,  -0.3521,  5.8501, 0.08362],
  [60.0,  -0.3521,  5.9907, 0.08342],
  [60.5,  -0.3521,  6.1284, 0.08324],
  [61.0,  -0.3521,  6.2632, 0.08308],
  [61.5,  -0.3521,  6.3954, 0.08292],
  [62.0,  -0.3521,  6.5251, 0.08279],
  [62.5,  -0.3521,  6.6527, 0.08266],
  [63.0,  -0.3521,  6.7786, 0.08255],
  [63.5,  -0.3521,  6.9028, 0.08245],
  [64.0,  -0.3521,  7.0255, 0.08236],
  [64.5,  -0.3521,  7.1467, 0.08229],
  [65.0,  -0.3521,  7.2666, 0.08223],
  [65.5,  -0.3521,  7.3854, 0.08218],
  [66.0,  -0.3521,  7.5034, 0.08215],
  [66.5,  -0.3521,  7.6206, 0.08213],
  [67.0,  -0.3521,  7.7370, 0.08212],
  [67.5,  -0.3521,  7.8526, 0.08212],
  [68.0,  -0.3521,  7.9674, 0.08214],
  [68.5,  -0.3521,  8.0816, 0.08216],
  [69.0,  -0.3521,  8.1955, 0.08219],
  [69.5,  -0.3521,  8.3092, 0.08224],
  [70.0,  -0.3521,  8.4227, 0.08229],
  [70.5,  -0.3521,  8.5358, 0.08235],
  [71.0,  -0.3521,  8.6480, 0.08241],
  [71.5,  -0.3521,  8.7594, 0.08248],
  [72.0,  -0.3521,  8.8697, 0.08254],
  [72.5,  -0.3521,  8.9788, 0.08262],
  [73.0,  -0.3521,  9.0865, 0.08269],
  [73.5,  -0.3521,  9.1927, 0.08276],
  [74.0,  -0.3521,  9.2974, 0.08283],
  [74.5,  -0.3521,  9.4010, 0.08289],
  [75.0,  -0.3521,  9.5032, 0.08295],
  [75.5,  -0.3521,  9.6041, 0.08301],
  [76.0,  -0.3521,  9.7033, 0.08307],
  [76.5,  -0.3521,  9.8007, 0.08311],
  [77.0,  -0.3521,  9.8963, 0.08314],
  [77.5,  -0.3521,  9.9902, 0.08317],
  [78.0,  -0.3521, 10.0827, 0.08318],
  [78.5,  -0.3521, 10.1741, 0.08318],
  [79.0,  -0.3521, 10.2649, 0.08316],
  [79.5,  -0.3521, 10.3558, 0.08313],
  [80.0,  -0.3521, 10.4475, 0.08308],
  [80.5,  -0.3521, 10.5405, 0.08301],
  [81.0,  -0.3521, 10.6352, 0.08293],
  [81.5,  -0.3521, 10.7322, 0.08284],
  [82.0,  -0.3521, 10.8321, 0.08273],
  [82.5,  -0.3521, 10.9350, 0.08260],
  [83.0,  -0.3521, 11.0415, 0.08246],
  [83.5,  -0.3521, 11.1516, 0.08231],
  [84.0,  -0.3521, 11.2651, 0.08215],
  [84.5,  -0.3521, 11.3817, 0.08198],
  [85.0,  -0.3521, 11.5007, 0.08181],
  [85.5,  -0.3521, 11.6218, 0.08163],
  [86.0,  -0.3521, 11.7444, 0.08145],
  [86.5,  -0.3521, 11.8678, 0.08128],
  [87.0,  -0.3521, 11.9916, 0.08111],
  [87.5,  -0.3521, 12.1152, 0.08096],
  [88.0,  -0.3521, 12.2382, 0.08082],
  [88.5,  -0.3521, 12.3603, 0.08069],
  [89.0,  -0.3521, 12.4815, 0.08058],
  [89.5,  -0.3521, 12.6017, 0.08048],
  [90.0,  -0.3521, 12.7209, 0.08041],
  [90.5,  -0.3521, 12.8392, 0.08034],
  [91.0,  -0.3521, 12.9569, 0.08030],
  [91.5,  -0.3521, 13.0742, 0.08026],
  [92.0,  -0.3521, 13.1910, 0.08025],
  [92.5,  -0.3521, 13.3075, 0.08025],
  [93.0,  -0.3521, 13.4239, 0.08026],
  [93.5,  -0.3521, 13.5404, 0.08029],
  [94.0,  -0.3521, 13.6572, 0.08034],
  [94.5,  -0.3521, 13.7746, 0.08040],
  [95.0,  -0.3521, 13.8928, 0.08047],
  [95.5,  -0.3521, 14.0120, 0.08056],
  [96.0,  -0.3521, 14.1325, 0.08067],
  [96.5,  -0.3521, 14.2544, 0.08078],
  [97.0,  -0.3521, 14.3782, 0.08092],
  [97.5,  -0.3521, 14.5038, 0.08106],
  [98.0,  -0.3521, 14.6316, 0.08122],
  [98.5,  -0.3521, 14.7614, 0.08139],
  [99.0,  -0.3521, 14.8934, 0.08157],
  [99.5,  -0.3521, 15.0275, 0.08177],
  [100.0, -0.3521, 15.1637, 0.08198],
  [100.5, -0.3521, 15.3018, 0.08220],
  [101.0, -0.3521, 15.4419, 0.08243],
  [101.5, -0.3521, 15.5838, 0.08267],
  [102.0, -0.3521, 15.7276, 0.08292],
  [102.5, -0.3521, 15.8732, 0.08317],
  [103.0, -0.3521, 16.0206, 0.08343],
  [103.5, -0.3521, 16.1697, 0.08370],
  [104.0, -0.3521, 16.3204, 0.08397],
  [104.5, -0.3521, 16.4728, 0.08425],
  [105.0, -0.3521, 16.6268, 0.08453],
  [105.5, -0.3521, 16.7826, 0.08481],
  [106.0, -0.3521, 16.9401, 0.08510],
  [106.5, -0.3521, 17.0995, 0.08539],
  [107.0, -0.3521, 17.2607, 0.08568],
  [107.5, -0.3521, 17.4237, 0.08599],
  [108.0, -0.3521, 17.5885, 0.08629],
  [108.5, -0.3521, 17.7553, 0.08660],
  [109.0, -0.3521, 17.9242, 0.08691],
  [109.5, -0.3521, 18.0954, 0.08723],
  [110.0, -0.3521, 18.2689, 0.08755]
];

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
/* === ENERGY NORMS ENGINE START ================================= */
function energyResolveEquationStage(ageYears, ageMonthsOpt = 0) {
  const ageNum = Number(ageYears) || 0;
  const years = Math.floor(ageNum);
  const months = years === 0
    ? Math.floor(Number(ageMonthsOpt) || Math.round(ageNum * 12))
    : Math.floor(ageNum * 12);

  if (months < 6) return 'infant_0_5';
  if (months < 12) return 'infant_6_11';
  if (years < 3) return 'child_1_2';
  if (years < 10) return 'child_3_9';
  if (years < 18) return 'child_10_17';
  if (years < ENERGY_ADULT_START_AGE) return 'child_18';
  if (years < 30) return 'adult_19_29';
  if (years < 60) return 'adult_30_59';
  return 'adult_60_plus';
}

function energyNormalizeSex(value) {
  return String(value || '').toUpperCase() === 'F' ? 'F' : 'M';
}

function energyGetCompletedYears(ageYears) {
  return Math.max(0, Math.floor(Number(ageYears) || 0));
}

function energyGetCompletedMonths(ageYears, ageMonthsOpt = 0) {
  const ageNum = Number(ageYears) || 0;
  const fullYears = Math.floor(ageNum);
  if (fullYears === 0) {
    const explicitMonths = Math.floor(Number(ageMonthsOpt));
    if (Number.isFinite(explicitMonths) && explicitMonths >= 0) return explicitMonths;
    return Math.max(0, Math.floor(ageNum * 12));
  }
  return fullYears * 12;
}

function energyGetReferenceAgeBand(ageYears, ageMonthsOpt = 0) {
  const months = energyGetCompletedMonths(ageYears, ageMonthsOpt);
  const years = energyGetCompletedYears(ageYears);
  if (months < 6) {
    return { kind: 'infant_0_6', completedMonths: months };
  }
  if (months < 12) {
    return {
      kind: 'infant_6_11',
      completedMonths: months,
      infantMonth: Math.max(6, Math.min(11, months))
    };
  }
  if (years < ENERGY_ADULT_START_AGE) {
    return {
      kind: 'child_1_18',
      completedYears: Math.max(1, Math.min(18, years))
    };
  }
  return {
    kind: 'adult_19_plus',
    completedYears: years
  };
}

function energyGetReferenceEntry({ sex, ageYears, ageMonthsOpt = 0 } = {}) {
  const sexKey = energyNormalizeSex(sex);
  const band = energyGetReferenceAgeBand(ageYears, ageMonthsOpt);
  if (band.kind === 'infant_6_11') {
    return {
      sexKey,
      band,
      row: (ENERGY_REFERENCE_INFANT_TABLE[sexKey] || {})[band.infantMonth] || null
    };
  }
  if (band.kind === 'child_1_18') {
    return {
      sexKey,
      band,
      row: (ENERGY_REFERENCE_CHILD_TABLE[sexKey] || {})[band.completedYears] || null
    };
  }
  return { sexKey, band, row: null };
}

function energyReferenceWeightKg({ sex, ageYears, ageMonthsOpt = 0, heightCm } = {}) {
  const ref = energyGetReferenceEntry({ sex, ageYears, ageMonthsOpt });
  const band = ref.band || energyGetReferenceAgeBand(ageYears, ageMonthsOpt);
  const height = Number(heightCm);

  if (band.kind === 'infant_0_6') {
    return {
      weightRefKg: null,
      referenceHeightCm: null,
      method: 'none',
      source: 'none',
      label: 'brak liczbowej normy',
      explanation: 'Dla wieku poniżej 6 miesięcy nie stosuje się liczbowej normy referencyjnej.',
      entry: null
    };
  }

  if (band.kind === 'infant_6_11') {
    const row = ref.row;
    if (!row) {
      return {
        weightRefKg: null,
        referenceHeightCm: null,
        method: 'none',
        source: 'none',
        label: '',
        explanation: 'Brak tabeli referencyjnej dla tego miesiąca życia.',
        entry: null
      };
    }
    return {
      weightRefKg: row.weightKg,
      referenceHeightCm: null,
      method: 'infant_table',
      source: 'infant_table',
      label: `masa referencyjna z tabeli (${band.infantMonth}. miesiąc)`,
      explanation: `Masa referencyjna z tabeli norm dla ${band.infantMonth}. miesiąca życia.`,
      entry: row
    };
  }

  if (band.kind === 'child_1_18') {
    const row = ref.row;
    if (!row) {
      return {
        weightRefKg: null,
        referenceHeightCm: null,
        method: 'none',
        source: 'none',
        label: '',
        explanation: 'Brak tabeli referencyjnej dla tego wieku.',
        entry: null
      };
    }
    return {
      weightRefKg: row.weightKg,
      referenceHeightCm: row.heightCm,
      method: 'child_p50_table',
      source: 'child_p50',
      label: `wartości typowe dla wieku ${band.completedYears === 1 ? '1 roku' : band.completedYears + ' lat'} i tej płci`,
      explanation: `Masa i wzrost typowe dla wieku ${band.completedYears === 1 ? '1 roku' : band.completedYears + ' lat'} i płci.`,
      entry: row
    };
  }

  if (!(Number.isFinite(height) && height > 0)) {
    return {
      weightRefKg: null,
      referenceHeightCm: null,
      method: 'none',
      source: 'none',
      label: 'masa referencyjna przy BMI 22',
      explanation: 'Dla dorosłych masa referencyjna wymaga podanego wzrostu.',
      entry: null
    };
  }

  const heightM = height / 100;
  return {
    weightRefKg: 22 * heightM * heightM,
    referenceHeightCm: height,
    method: 'adult_bmi22',
    source: 'adult_bmi22',
    label: 'masa referencyjna przy BMI 22',
    explanation: 'Masa referencyjna obliczona dla BMI 22 przy podanym wzroście.',
    entry: null
  };
}

function energyResolveReferenceAnthropometry({ sex, ageYears, ageMonthsOpt = 0, heightCm } = {}) {
  const resolved = energyReferenceWeightKg({ sex, ageYears, ageMonthsOpt, heightCm });
  const inputHeight = Number(heightCm);
  const fallbackHeight = Number.isFinite(inputHeight) && inputHeight > 0 ? inputHeight : null;
  if (resolved.method === 'infant_table') {
    return {
      weightKg: resolved.weightRefKg,
      heightCm: fallbackHeight,
      method: resolved.method,
      source: resolved.source,
      label: resolved.label,
      explanation: resolved.explanation,
      entry: resolved.entry
    };
  }
  if (resolved.method === 'child_p50_table') {
    return {
      weightKg: resolved.weightRefKg,
      heightCm: resolved.referenceHeightCm,
      method: resolved.method,
      source: resolved.source,
      label: resolved.label,
      explanation: resolved.explanation,
      entry: resolved.entry
    };
  }
  if (resolved.method === 'adult_bmi22') {
    return {
      weightKg: resolved.weightRefKg,
      heightCm: resolved.referenceHeightCm,
      method: resolved.method,
      source: resolved.source,
      label: resolved.label,
      explanation: resolved.explanation,
      entry: resolved.entry
    };
  }
  return {
    weightKg: null,
    heightCm: fallbackHeight,
    method: resolved.method || 'none',
    source: resolved.source || 'none',
    label: resolved.label || '',
    explanation: resolved.explanation || '',
    entry: null
  };
}

function energyResolveAnthropometry({
  ageYears,
  ageMonthsOpt = 0,
  sex,
  weightKg,
  heightCm,
  bodyMode = 'actual'
}) {
  const numericWeight = Number(weightKg);
  const numericHeight = Number(heightCm);
  const safeWeight = Number.isFinite(numericWeight) && numericWeight > 0 ? numericWeight : null;
  const safeHeight = Number.isFinite(numericHeight) && numericHeight > 0 ? numericHeight : null;

  if (bodyMode === 'actual') {
    return {
      weightKg: safeWeight,
      heightCm: safeHeight,
      source: (safeWeight == null && safeHeight == null) ? 'invalid' : 'actual',
      label: 'masa aktualna'
    };
  }

  if (bodyMode === 'reference_adult_bmi22' && Number(ageYears) >= ENERGY_ADULT_START_AGE) {
    const resolved = energyResolveReferenceAnthropometry({ sex, ageYears, ageMonthsOpt, heightCm: safeHeight });
    return {
      weightKg: resolved.weightKg,
      heightCm: resolved.heightCm,
      source: resolved.source || 'adult_bmi22',
      label: resolved.label || 'masa referencyjna przy BMI 22'
    };
  }

  if ((bodyMode === 'reference_child_p50' || bodyMode === 'reference_infant_table') && Number(ageYears) < ENERGY_ADULT_START_AGE) {
    const resolved = energyResolveReferenceAnthropometry({ sex, ageYears, ageMonthsOpt, heightCm: safeHeight });
    if (energyIsNumeric(resolved.weightKg)) {
      return {
        weightKg: resolved.weightKg,
        heightCm: energyIsNumeric(resolved.heightCm) ? resolved.heightCm : safeHeight,
        source: resolved.source || 'child_p50',
        label: resolved.label || 'masa referencyjna'
      };
    }

    if (typeof advHistoryResolveMetric === 'function' && Number(ageYears) >= 1) {
      const source = Number(ageYears) < 3 ? 'WHO' : 'OLAF';
      const wt = advHistoryResolveMetric('WT', safeWeight, sex, ageYears, source);
      const ht = advHistoryResolveMetric('HT', safeHeight, sex, ageYears, source);
      const medianWeight = wt?.result?.median;
      const medianHeight = ht?.result?.median;
      return {
        weightKg: energyIsNumeric(medianWeight) ? medianWeight : safeWeight,
        heightCm: energyIsNumeric(medianHeight) ? medianHeight : safeHeight,
        source: 'child_p50_fallback',
        label: `wartości typowe dla wieku ${energyGetCompletedYears(ageYears) === 1 ? '1 roku' : energyGetCompletedYears(ageYears) + ' lat'} i tej płci`
      };
    }
  }

  return {
    weightKg: safeWeight,
    heightCm: safeHeight,
    source: 'actual_fallback',
    label: 'masa aktualna'
  };
}

function energyHenryREEkcal({ stage, sex, weightKg, heightCm }) {
  const W = Number(weightKg);
  const H = Number(heightCm) / 100;
  if (!isFinite(W) || !isFinite(H) || W <= 0 || H <= 0) return null;

  switch (stage) {
    case 'child_1_2':
      return sex === 'M'
        ? (28.2 * W + 859 * H - 371)
        : (30.4 * W + 703 * H - 287);

    case 'child_3_9':
      if (sex === 'M') {
        const mj = 0.0632 * W + 1.31 * H + 1.28;
        return mj * 239;
      }
      return 15.9 * W + 210 * H + 349;

    case 'child_10_17':
      return sex === 'M'
        ? (15.6 * W + 226 * H + 299)
        : (9.4 * W + 249 * H + 462);

    case 'child_18':
      return sex === 'M'
        ? (14.4 * W + 313 * H + 113)
        : (10.4 * W + 615 * H - 282);

    case 'adult_19_29':
      return sex === 'M'
        ? (14.4 * W + 313 * H + 113)
        : (10.4 * W + 615 * H - 282);

    case 'adult_30_59':
      return sex === 'M'
        ? (11.4 * W + 541 * H - 137)
        : (8.18 * W + 502 * H - 11.6);

    case 'adult_60_plus':
      return sex === 'M'
        ? (11.4 * W + 541 * H - 256)
        : (8.52 * W + 421 * H + 10.7);

    default:
      return null;
  }
}

function energyButteTEEkcal(weightKg) {
  const W = Number(weightKg);
  if (!isFinite(W) || W <= 0) return null;
  return -152.0 + 92.8 * W;
}

function energyStageUsesGrowthMultiplier(stage) {
  return stage === 'child_1_2' || stage === 'child_3_9' || stage === 'child_10_17' || stage === 'child_18';
}

function energyResolveBodyModeFromPolicy({
  ageYears,
  stage,
  bodyPolicy = 'actual',
  bodyOverride = null
} = {}) {
  const ageNum = Number(ageYears) || 0;
  const stageName = String(stage || '');
  const rawOverride = String(bodyOverride == null ? '' : bodyOverride).trim().toLowerCase();

  if (rawOverride === 'actual') return 'actual';
  if (rawOverride === 'reference') {
    if (stageName.startsWith('adult_') || ageNum >= ENERGY_ADULT_START_AGE) return 'reference_adult_bmi22';
    if (stageName === 'infant_6_11') return 'reference_infant_table';
    if (stageName.startsWith('child_')) return 'reference_child_p50';
    return ageNum >= ENERGY_ADULT_START_AGE ? 'reference_adult_bmi22' : 'reference_child_p50';
  }
  if (rawOverride === 'reference_adult_bmi22' || rawOverride === 'adult_bmi22') return 'reference_adult_bmi22';
  if (rawOverride === 'reference_child_p50' || rawOverride === 'child_p50') return 'reference_child_p50';
  if (rawOverride === 'reference_infant_table' || rawOverride === 'infant_table') return 'reference_infant_table';

  if (bodyPolicy === 'reference') {
    if (stageName.startsWith('adult_') || ageNum >= ENERGY_ADULT_START_AGE) return 'reference_adult_bmi22';
    if (stageName === 'infant_6_11') return 'reference_infant_table';
    if (stageName === 'infant_0_5') return 'actual';
    return 'reference_child_p50';
  }
  return 'actual';
}

function energyResolvePalSelection({
  ageYears,
  ageMonthsOpt = 0,
  palInput = null,
  palPolicy = 'normative',
  allowRange = false
} = {}) {
  const allowed = energyGetAllowedPals(ageYears, ageMonthsOpt, palPolicy === 'clinical' ? 'clinical' : 'normative');
  if (!allowed.length) {
    return {
      requested: null,
      allowed: [],
      used: null,
      mode: 'none',
      clinicalOverride: false,
      note: ''
    };
  }

  const raw = String(palInput == null ? '' : palInput).trim().toLowerCase();
  const requested = raw ? Number(raw) : null;
  const rangeRequested = allowRange && (!raw || raw === 'range' || raw === 'brak' || raw === 'brak-ograniczen' || raw === 'auto' || raw === 'all');

  if (rangeRequested) {
    return {
      requested: null,
      allowed: allowed.slice(),
      used: null,
      mode: 'range',
      clinicalOverride: false,
      note: ''
    };
  }

  const normalized = energyNormalizePalFromAllowed(requested, allowed);
  const clinicalOverride = normalized.pal === 1.2 && palPolicy === 'clinical';
  let note = '';
  if (requested != null && Number.isFinite(requested) && normalized.pal != null && normalized.pal !== requested) {
    note = `PAL ${requested.toFixed(1)} nie jest dostępny dla tej grupy wieku. Przyjęto PAL ${normalized.pal.toFixed(1)}.`;
  }

  return {
    requested: Number.isFinite(requested) ? requested : null,
    allowed: normalized.allowed,
    used: normalized.pal,
    mode: energyIsNumeric(normalized.pal) ? 'fixed' : 'none',
    clinicalOverride,
    note
  };
}

function energyResolveLegacyPreset({ bodyMode = 'actual', palMode = 'normative', context = '' } = {}) {
  const normalizedBodyMode = String(bodyMode || 'actual').trim();
  const normalizedPalMode = String(palMode || 'normative').trim().toLowerCase();
  const normalizedContext = String(context || '').trim().toLowerCase();
  const bodyPolicy = normalizedBodyMode === 'actual' ? 'actual' : 'reference';
  const palPolicy = normalizedPalMode === 'clinical' ? 'clinical' : 'normative';

  if (bodyPolicy === 'reference') {
    return {
      preset: 'nutrition_reference',
      palPolicyOverride: palPolicy === 'clinical' ? 'clinical' : null
    };
  }

  if (palPolicy === 'clinical') {
    return {
      preset: (normalizedContext.includes('plan') || normalizedContext.includes('diet'))
        ? 'plan_reduction'
        : 'intake_observed'
    };
  }

  return { preset: 'nutrition_actual' };
}

function energyBuildContext({
  preset = 'nutrition_actual',
  ageYears,
  ageMonthsOpt = 0,
  sex,
  weightKg,
  heightCm,
  palInput = null,
  bodyOverride = null,
  notes = [],
  allowRangeOverride = null,
  palPolicyOverride = null,
  bodyPolicyOverride = null
} = {}) {
  const presetName = Object.prototype.hasOwnProperty.call(ENERGY_CONTEXT_PRESETS, preset)
    ? preset
    : 'nutrition_actual';
  const presetConfig = energyGetPresetConfig(presetName);
  const policyConfig = {
    ...presetConfig,
    palPolicy: palPolicyOverride || presetConfig.palPolicy,
    bodyPolicy: bodyPolicyOverride || presetConfig.bodyPolicy
  };
  if (typeof allowRangeOverride === 'boolean') {
    policyConfig.allowRange = allowRangeOverride;
  }

  const stage = energyResolveEquationStage(ageYears, ageMonthsOpt);
  const palBand = energyResolvePalBand(ageYears, ageMonthsOpt);
  const yearsCompleted = Math.max(0, Math.floor(Number(ageYears) || 0));
  const monthsCompleted = yearsCompleted === 0
    ? Math.max(0, Math.floor(Number(ageMonthsOpt) || Math.round((Number(ageYears) || 0) * 12)))
    : Math.max(0, Math.floor((Number(ageYears) || 0) * 12));
  const resolvedBodyMode = energyResolveBodyModeFromPolicy({
    ageYears,
    stage,
    bodyPolicy: policyConfig.bodyPolicy,
    bodyOverride
  });
  const anthropometry = energyResolveAnthropometry({
    ageYears,
    ageMonthsOpt,
    sex,
    weightKg,
    heightCm,
    bodyMode: resolvedBodyMode
  });
  const pal = energyResolvePalSelection({
    ageYears,
    ageMonthsOpt,
    palInput,
    palPolicy: policyConfig.palPolicy,
    allowRange: !!policyConfig.allowRange
  });

  const noteList = Array.isArray(notes)
    ? notes.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim())
    : [];
  if (pal.note) noteList.push(pal.note);

  const energy = {
    reeKcal: null,
    teeRawKcal: null,
    teeAdjustedKcal: null,
    growthMultiplier: null,
    formulaId: null,
    teeRangeKcal: [],
    teeRangeMinKcal: null,
    teeRangeMaxKcal: null
  };

  if (stage === 'infant_0_5') {
    energy.formulaId = 'none_infant_0_5';
    noteList.push('Brak liczbowej normy energii dla wieku poniżej 6 miesięcy.');
  } else if (stage === 'infant_6_11') {
    const teeInfant = energyButteTEEkcal(anthropometry.weightKg);
    energy.formulaId = 'butte_6_11';
    energy.teeRawKcal = teeInfant;
    energy.teeAdjustedKcal = teeInfant;
    noteList.push('TEE wg Butte dla niemowląt 6–11 miesięcy.');
  } else {
    const reeKcal = energyHenryREEkcal({
      stage,
      sex,
      weightKg: anthropometry.weightKg,
      heightCm: anthropometry.heightCm
    });
    energy.formulaId = `henry_${stage}`;
    energy.reeKcal = energyIsNumeric(reeKcal) ? reeKcal : null;
    energy.growthMultiplier = energyStageUsesGrowthMultiplier(stage)
      ? ENERGY_CHILD_GROWTH_MULTIPLIER
      : 1;

    if (!energyIsNumeric(energy.reeKcal)) {
      noteList.push('Brak kompletu danych do wyliczenia TEE.');
    } else if (pal.mode === 'range') {
      energy.teeRangeKcal = pal.allowed.map((palValue) => ({
        pal: palValue,
        kcal: energy.reeKcal * palValue * energy.growthMultiplier
      }));
      if (energy.teeRangeKcal.length) {
        energy.teeRangeMinKcal = energy.teeRangeKcal[0].kcal;
        energy.teeRangeMaxKcal = energy.teeRangeKcal[energy.teeRangeKcal.length - 1].kcal;
      }
    } else if (energyIsNumeric(pal.used)) {
      energy.teeRawKcal = energy.reeKcal * pal.used * energy.growthMultiplier;
      energy.teeAdjustedKcal = energy.teeRawKcal;
    } else {
      noteList.push('Brak kompletu danych do wyliczenia TEE.');
    }
  }

  return {
    preset: presetName,
    age: {
      yearsCompleted,
      monthsCompleted,
      stage,
      palBand
    },
    policy: {
      palPolicy: policyConfig.palPolicy,
      bodyPolicy: policyConfig.bodyPolicy === 'reference' ? 'reference' : 'actual',
      bodyMode: resolvedBodyMode,
      allowRange: !!policyConfig.allowRange,
      allowClinicalPal12: policyConfig.palPolicy === 'clinical' ? true : !!policyConfig.allowClinicalPal12,
      applyRiskAdjust: policyConfig.applyRiskAdjust,
      clinicalOverride: pal.clinicalOverride
    },
    anthropometry: {
      weightInputKg: Number.isFinite(Number(weightKg)) ? Number(weightKg) : null,
      heightInputCm: Number.isFinite(Number(heightCm)) ? Number(heightCm) : null,
      weightUsedKg: Number.isFinite(Number(anthropometry.weightKg)) ? Number(anthropometry.weightKg) : anthropometry.weightKg,
      heightUsedCm: Number.isFinite(Number(anthropometry.heightCm)) ? Number(anthropometry.heightCm) : anthropometry.heightCm,
      source: anthropometry.source || 'unknown',
      label: anthropometry.label || ''
    },
    pal: {
      requested: pal.requested,
      allowed: pal.allowed.slice(),
      used: pal.used,
      mode: pal.mode
    },
    energy,
    notes: noteList,
    meta: {
      presetConfig: { ...presetConfig }
    }
  };
}

function energyConvertLegacyParams({
  ageYears,
  ageMonthsOpt = 0,
  sex,
  weightKg,
  heightCm,
  pal = null,
  context = 'plan',
  bodyMode = 'actual',
  palMode = 'normative'
} = {}) {
  const resolved = energyResolveLegacyPreset({ bodyMode, palMode, context });
  return {
    preset: resolved.preset,
    ageYears,
    ageMonthsOpt,
    sex,
    weightKg,
    heightCm,
    palInput: pal,
    bodyOverride: bodyMode,
    notes: [],
    allowRangeOverride: false,
    palPolicyOverride: resolved.palPolicyOverride || null,
    bodyPolicyOverride: resolved.bodyPolicyOverride || null
  };
}

function energyProjectLegacyEstimate(ctx, legacyInput = {}) {
  return {
    stage: ctx.age.stage,
    palBand: ctx.age.palBand,
    reeKcal: energyIsNumeric(ctx.energy.reeKcal) ? ctx.energy.reeKcal : null,
    teeRawKcal: energyIsNumeric(ctx.energy.teeRawKcal) ? ctx.energy.teeRawKcal : null,
    teeAdjustedKcal: energyIsNumeric(ctx.energy.teeAdjustedKcal) ? ctx.energy.teeAdjustedKcal : null,
    formulaId: ctx.energy.formulaId,
    palUsed: ctx.pal.mode === 'fixed' ? ctx.pal.used : null,
    palAllowed: Array.isArray(ctx.pal.allowed) ? ctx.pal.allowed.slice() : [],
    growthMultiplier: energyIsNumeric(ctx.energy.teeRawKcal) ? ctx.energy.growthMultiplier : null,
    weightUsedKg: ctx.anthropometry.weightUsedKg,
    heightUsedCm: ctx.anthropometry.heightUsedCm,
    bodyMode: legacyInput.bodyMode || 'actual',
    notes: Array.isArray(ctx.notes) ? ctx.notes.slice() : []
  };
}

function energyEstimate(legacyInput = {}) {
  const ctx = energyBuildContext(energyConvertLegacyParams(legacyInput));
  return energyProjectLegacyEstimate(ctx, legacyInput);
}

if (typeof window !== 'undefined') {
  window.ENERGY_CONTEXT_PRESETS = ENERGY_CONTEXT_PRESETS;
  window.ENERGY_REFERENCE_INFANT_TABLE = ENERGY_REFERENCE_INFANT_TABLE;
  window.ENERGY_REFERENCE_CHILD_TABLE = ENERGY_REFERENCE_CHILD_TABLE;
  window.energyGetCompletedYears = energyGetCompletedYears;
  window.energyGetCompletedMonths = energyGetCompletedMonths;
  window.energyGetReferenceAgeBand = energyGetReferenceAgeBand;
  window.energyGetReferenceEntry = energyGetReferenceEntry;
  window.energyReferenceWeightKg = energyReferenceWeightKg;
  window.energyResolveReferenceAnthropometry = energyResolveReferenceAnthropometry;
  window.energyResolveEquationStage = energyResolveEquationStage;
  window.energyResolvePalBand = energyResolvePalBand;
  window.energyGetAllowedPals = energyGetAllowedPals;
  window.energyNormalizePal = energyNormalizePal;
  window.energyResolvePalSelection = energyResolvePalSelection;
  window.energyResolveAnthropometry = energyResolveAnthropometry;
  window.energyHenryREEkcal = energyHenryREEkcal;
  window.energyButteTEEkcal = energyButteTEEkcal;
  window.energyStageUsesGrowthMultiplier = energyStageUsesGrowthMultiplier;
  window.energyBuildContext = energyBuildContext;
  window.energyConvertLegacyParams = energyConvertLegacyParams;
  window.energyProjectLegacyEstimate = energyProjectLegacyEstimate;
  window.energyGetPalMeta = energyGetPalMeta;
  window.energyGetPalOptionLabel = energyGetPalOptionLabel;
  window.energyGetPalDescription = energyGetPalDescription;
  window.energyFormatPalCodeLabel = energyFormatPalCodeLabel;
  window.energyFormatPalRangeLabel = energyFormatPalRangeLabel;
}

/**
 * Oblicza spoczynkowy wydatek energetyczny (REE).
 * Funkcja pozostaje jako wrapper kompatybilności dla starszych modułów.
 */
function BMR(weight, height, age, sex){
  const profile = energyEstimate({
    ageYears: age,
    ageMonthsOpt: age > 0 ? Math.round((Number(age) % 1) * 12) : 0,
    sex,
    weightKg: weight,
    heightCm: height,
    pal: 1.4,
    context: 'legacy_bmr',
    bodyMode: 'actual',
    palMode: 'clinical'
  });
  return energyIsNumeric(profile.reeKcal) ? Math.round(profile.reeKcal) : NaN;
}

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

function proposeDietsFromTEE(teeKcal, sex, isChild) {
  const tee = Number(teeKcal);
  if (!isFinite(tee) || tee <= 0) return [];

  const minIntake = isChild ? MIN_INTAKE_CHILD : MIN_INTAKE_ADULT[sex];

  return Object.entries(DIET_LEVELS).reduce((arr, [key, cfg]) => {
    let deficit = Math.min(cfg.deficitPct * tee, cfg.maxDeficit);
    if (tee - deficit < minIntake) deficit = 0;
    if (deficit === 0) return arr;

    const intake = Math.round(tee - deficit);
    const weeklyLoss = deficit > 0 ? (deficit * 7 / KCAL_PER_KG) : 0;
    arr.push({
      key,
      name: cfg.label,
      deficit: Math.round(deficit),
      intake,
      weeklyLoss
    });
    return arr;
  }, []);
}

function proposeDiets(bmr, pal, sex, isChild) {
  const tee = Number(bmr) * Number(pal);
  return proposeDietsFromTEE(tee, sex, isChild);
}

function energyPopulatePlanPalSelect(selectEl, { ageYears, ageMonthsOpt = 0, value = null } = {}) {
  return energyPopulatePalSelectByPreset(selectEl, {
    preset: 'plan_reduction',
    ageYears,
    ageMonthsOpt,
    value
  });
}

function energyPopulateIntakePalSelect(selectEl, { ageYears, ageMonthsOpt = 0, value = null } = {}) {
  return energyPopulatePalSelectByPreset(selectEl, {
    preset: 'intake_observed',
    ageYears,
    ageMonthsOpt,
    value
  });
}

function energyMaybeApplyRiskAdjustment({
  context,
  ageYears,
  ageMonthsOpt = 0,
  sex,
  weightKg,
  heightCm,
  history = null,
  intakeKcalPerDay = null,
  mountId = 'anorexiaTmpMount',
  applyRiskAdjust = false,
  skipForInfants = true
} = {}) {
  const reeKcal = energyIsNumeric(context?.energy?.reeKcal) ? context.energy.reeKcal : null;
  const teeRawKcal = energyIsNumeric(context?.energy?.teeRawKcal) ? context.energy.teeRawKcal : null;
  const stage = context?.age?.stage || '';
  const isInfantUnder6 = stage === 'infant_0_5';
  const isInfantButte = stage === 'infant_6_11';

  let teeBaselineKcal = teeRawKcal;
  let risk = null;
  let riskAdjusted = false;

  const canApplyRiskAdjust = !!applyRiskAdjust
    && energyIsNumeric(teeRawKcal)
    && context?.policy?.applyRiskAdjust
    && typeof window !== 'undefined'
    && typeof window.anorexiaRiskAdjust === 'function'
    && !(skipForInfants && (isInfantUnder6 || isInfantButte));

  if (canApplyRiskAdjust) {
    try {
      const adjusted = window.anorexiaRiskAdjust({
        user: {
          ageYears,
          ageMonthsOpt,
          sex,
          heightCm,
          weightKg
        },
        reeKcal,
        teeRawKcal,
        bmr: reeKcal,
        pal: context?.pal?.used,
        history: history || null,
        intakeKcalPerDay: intakeKcalPerDay == null ? null : intakeKcalPerDay,
        mountId
      });
      if (adjusted && energyIsNumeric(adjusted.teeAdjusted)) {
        teeBaselineKcal = adjusted.teeAdjusted;
      }
      risk = adjusted?.risk || null;
      riskAdjusted = !!(adjusted && adjusted.risk && adjusted.risk.any);
    } catch (_) {
      risk = null;
      riskAdjusted = false;
    }
  }

  return {
    stage,
    reeKcal,
    teeRawKcal,
    teeBaselineKcal,
    risk,
    riskAdjusted,
    isInfantUnder6,
    isInfantButte
  };
}

function energyBuildIntakeObservedState({
  ageYears,
  ageMonthsOpt = 0,
  sex,
  weightKg,
  heightCm,
  palInput = null,
  history = null,
  intakeKcalPerDay = null,
  mountId = 'anorexiaTmpMount',
  applyRiskAdjust = false
} = {}) {
  const context = energyBuildContext({
    preset: 'intake_observed',
    ageYears,
    ageMonthsOpt,
    sex,
    weightKg,
    heightCm,
    palInput
  });

  const riskState = energyMaybeApplyRiskAdjustment({
    context,
    ageYears,
    ageMonthsOpt,
    sex,
    weightKg,
    heightCm,
    history,
    intakeKcalPerDay,
    mountId,
    applyRiskAdjust,
    skipForInfants: true
  });

  const isChild = Number(ageYears) >= CHILD_AGE_MIN && Number(ageYears) < ENERGY_ADULT_START_AGE;

  return {
    context,
    stage: riskState.stage,
    reeKcal: riskState.reeKcal,
    teeRawKcal: riskState.teeRawKcal,
    teeBaselineKcal: riskState.teeBaselineKcal,
    palUsed: energyIsNumeric(context?.pal?.used) ? context.pal.used : null,
    isChild,
    isInfantUnder6: riskState.isInfantUnder6,
    isInfantButte: riskState.isInfantButte,
    risk: riskState.risk,
    riskAdjusted: riskState.riskAdjusted,
    modeBadge: energyGetContextModeBadge(context)
  };
}

function energyBuildPlanReductionState({
  ageYears,
  ageMonthsOpt = 0,
  sex,
  weightKg,
  heightCm,
  palInput = null,
  history = null,
  intakeKcalPerDay = null,
  mountId = 'anorexiaTmpMount'
} = {}) {
  const context = energyBuildContext({
    preset: 'plan_reduction',
    ageYears,
    ageMonthsOpt,
    sex,
    weightKg,
    heightCm,
    palInput
  });

  const riskState = energyMaybeApplyRiskAdjustment({
    context,
    ageYears,
    ageMonthsOpt,
    sex,
    weightKg,
    heightCm,
    history,
    intakeKcalPerDay,
    mountId,
    applyRiskAdjust: true,
    skipForInfants: true
  });

  const stage = riskState.stage;
  const isInfantPlanUnavailable = stage === 'infant_0_5' || stage === 'infant_6_11';
  const isChild = Number(ageYears) >= CHILD_AGE_MIN && Number(ageYears) < ENERGY_ADULT_START_AGE;
  const diets = isInfantPlanUnavailable
    ? []
    : proposeDietsFromTEE(riskState.teeBaselineKcal, sex, isChild);

  return {
    context,
    stage,
    reeKcal: riskState.reeKcal,
    teeRawKcal: riskState.teeRawKcal,
    teeBaselineKcal: riskState.teeBaselineKcal,
    palUsed: energyIsNumeric(context?.pal?.used) ? context.pal.used : null,
    isChild,
    isInfantPlanUnavailable,
    diets,
    risk: riskState.risk,
    riskAdjusted: riskState.riskAdjusted,
    modeBadge: energyGetContextModeBadge(context)
  };
}

if (typeof window !== 'undefined') {
  window.energyPopulatePalSelectByPreset = energyPopulatePalSelectByPreset;
  window.energyPopulatePlanPalSelect = energyPopulatePlanPalSelect;
  window.energyPopulateIntakePalSelect = energyPopulateIntakePalSelect;
  window.energyBuildIntakeObservedState = energyBuildIntakeObservedState;
  window.energyBuildPlanReductionState = energyBuildPlanReductionState;
  window.energyMaybeApplyRiskAdjustment = energyMaybeApplyRiskAdjustment;
  window.energyGetContextModeBadge = energyGetContextModeBadge;
  window.energyRenderModeBadgeHtml = energyRenderModeBadgeHtml;
}

/* === ENERGY NORMS ENGINE END =================================== */

// Wybór klasy pod kolor ramki/ liczby BMI u dorosłych
function bmiBoxClassForAdult(bmiCat, ageYears){
  if (ageYears < 18) return '';
  if (bmiCat === 'Niedowaga' || bmiCat === 'Nadwaga') return ' bmi-warning';
  if (String(bmiCat).startsWith('Otyłość'))           return ' bmi-danger';
  return '';
}
function fillDietSelect(diets) {
  const sel = document.getElementById('dietLevel');
  if (!sel) return;
  vildaAppClearHtml(sel);

  const ageVal = getAgeDecimal();
  const isChildDefault = (ageVal >= CHILD_AGE_MIN && ageVal < ENERGY_ADULT_START_AGE);

  if (!diets || diets.length === 0) {
    vildaAppClearHtml(sel);
    document.getElementById('dietChoiceWrap').style.display = 'none';
    const descEl = document.getElementById('dietDesc');
    const calEl  = document.getElementById('dietCalorieInfo');
    if (descEl) descEl.style.display = 'none';
    if (calEl) calEl.style.display = 'none';
    return;
  }

  let recommendedKey = isChildDefault ? 'light' : 'moderate';
  if (!diets.some(d => d.key === recommendedKey)) {
    recommendedKey = diets[0].key;
  }

  diets.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.key;
    let label = `${d.name} (‑${d.deficit} kcal/dzień ≈ ${d.weeklyLoss.toFixed(1).replace('.', ',')} kg/tydz.)`;
    if (d.key === recommendedKey) {
      label += ' – rekomendowana dieta';
      opt.classList.add('recommended');
    }
    opt.textContent = label;
    sel.appendChild(opt);
  });

  let defaultKey = isChildDefault ? 'light' : 'moderate';
  if (!diets.some(d => d.key === defaultKey)) {
    defaultKey = diets[0].key;
  }
  sel.value = defaultKey;
  document.getElementById('dietChoiceWrap').style.display = 'block';
  updateDietDescription(defaultKey);
}

/* === PLAN – aktualizacja po wyborze diety  =========================== */
function updatePlanFromDiet(){
  const __perfEnd = vildaPerfStart('P1:updatePlanFromDiet');
  try {

  /* ------------------ 1. Dane wejściowe ------------------ */
  const planInputAdapter = (typeof window !== 'undefined' && window.VildaPlanInput) ? window.VildaPlanInput : null;
  const readPlanInput = planInputAdapter && typeof planInputAdapter.readPlanInputFromDom === 'function'
    ? planInputAdapter.readPlanInputFromDom
    : null;
  const isPlanInputComplete = planInputAdapter && typeof planInputAdapter.isPlanInputComplete === 'function'
    ? planInputAdapter.isPlanInputComplete
    : null;

  const planInput = readPlanInput
    ? readPlanInput({
      doc: document,
      getAgeDecimal: (typeof getAgeDecimal === 'function') ? getAgeDecimal : null,
      getAnthroValidation: (typeof vildaGetMainAnthroValidationSnapshot === 'function')
        ? vildaGetMainAnthroValidationSnapshot
        : null
    })
    : null;

  const age = planInput ? planInput.age : ((typeof getAgeDecimal === 'function') ? getAgeDecimal() : 0);
  const planResultsContainer = planInput ? planInput.planResultsContainer : document.getElementById('planResults');
  const planCardContainer = planInput ? planInput.planCardContainer : document.getElementById('planCard');
  const sex = planInput ? planInput.sex : ((document.getElementById('sex')?.value) || 'M');
  const anthroValidation = planInput ? planInput.anthroValidation : ((typeof vildaGetMainAnthroValidationSnapshot === 'function')
    ? vildaGetMainAnthroValidationSnapshot()
    : null);
  const weightKg = planInput ? planInput.weightKg : +(document.getElementById('weight')?.value);
  const heightCm = planInput ? planInput.heightCm : +(document.getElementById('height')?.value);
  const pal = planInput ? planInput.pal : +(document.getElementById('palFactor')?.value);

  // Ten moduł nie występuje na wszystkich podstronach. Brak DOM = bezpieczny no-op.
  if ((planInput && planInput.missingRequiredDom) || !planResultsContainer || !planCardContainer) return;
  planResultsContainer.classList.toggle('adult-plan-results', Number(age) >= ENERGY_ADULT_START_AGE);

  if (!(isPlanInputComplete
    ? isPlanInputComplete(planInput, {
      isFiniteNonNegative: (typeof vildaIsFiniteNonNegative === 'function') ? vildaIsFiniteNonNegative : null,
      isFinitePositive: (typeof vildaIsFinitePositive === 'function') ? vildaIsFinitePositive : null
    })
    : (
      anthroValidation
        ? anthroValidation.complete
        : (vildaIsFiniteNonNegative(age) && vildaIsFinitePositive(weightKg) && vildaIsFinitePositive(heightCm))
    )
  )) return;                  // brak danych

  /* ------------------ 2. TEE i dostępne diety ------------- */
  const ageMonthsOpt = (parseFloat(document.getElementById('ageMonths')?.value) || 0);
  const isChildEnergy = age >= CHILD_AGE_MIN && age < ENERGY_ADULT_START_AGE;
  const intakeHistory = window.intakeHistory || null;
  const intakeKcalPerDay = window.intakeEstimatedKcalPerDay || null;
  const planEnergyAdapter = (typeof window !== 'undefined' && window.VildaPlanEnergy) ? window.VildaPlanEnergy : null;
  const planRenderAdapter = (typeof window !== 'undefined' && window.VildaPlanRender) ? window.VildaPlanRender : null;
  const buildPlanState = planEnergyAdapter && typeof planEnergyAdapter.buildPlanState === 'function'
    ? planEnergyAdapter.buildPlanState
    : null;
  const resolvePlanDiets = planEnergyAdapter && typeof planEnergyAdapter.resolvePlanDiets === 'function'
    ? planEnergyAdapter.resolvePlanDiets
    : null;
  const planState = buildPlanState
    ? buildPlanState({ age, sex, weightKg, heightCm, pal }, {
      ageMonthsOpt,
      intakeHistory,
      intakeKcalPerDay,
      mountId: 'anorexiaTmpMount',
      energyBuildPlanReductionState: (typeof energyBuildPlanReductionState === 'function') ? energyBuildPlanReductionState : null
    })
    : energyBuildPlanReductionState({
      ageYears: age,
      ageMonthsOpt,
      sex,
      weightKg,
      heightCm,
      palInput: pal,
      history: intakeHistory,
      intakeKcalPerDay,
      mountId: 'anorexiaTmpMount'
    });

  const bmr = planState.reeKcal;
  const teeRawPlan = planState.teeRawKcal;

  if (planState.isInfantPlanUnavailable) {
    if (planRenderAdapter && typeof planRenderAdapter.renderPlanUnavailable === 'function') {
      planRenderAdapter.renderPlanUnavailable('infant', { doc: document });
    } else {
      const dietSel = document.getElementById('dietLevel');
      if (dietSel) vildaAppClearHtml(dietSel);
      const descEl = document.getElementById('dietDesc');
      const calEl  = document.getElementById('dietCalorieInfo');
      const wrap = document.getElementById('dietChoiceWrap');
      if (descEl) descEl.style.display = 'none';
      if (calEl) calEl.style.display = 'none';
      if (wrap) wrap.style.display = 'none';
      const planCardEl = document.getElementById('planCard');
      if (planCardEl) planCardEl.style.display = 'block';
      const planResultsEl = document.getElementById('planResults');
      if (planResultsEl) {
        vildaAppSetTrustedHtml(planResultsEl, `<div class="result-card plan-col plan-result-card animate-in"><h3>Informacja</h3><p class="diet-warning">Plan odchudzania nie jest dostępny dla niemowląt. W tym wieku moduł energii ma charakter wyłącznie informacyjny.</p></div>`, 'app:planResultsEl');
      }
    }
    return;
  }

  let teeForDiets = planState.teeBaselineKcal;
  let diets = resolvePlanDiets
    ? resolvePlanDiets(planState, { sex, isChildEnergy }, { proposeDietsFromTEE: (typeof proposeDietsFromTEE === 'function') ? proposeDietsFromTEE : null })
    : (Array.isArray(planState.diets) ? planState.diets.slice() : proposeDietsFromTEE(teeForDiets, sex, isChildEnergy));

  // Jeśli nie ma żadnych diet (deficyt zbyt niski dla wszystkich poziomów),
  // ukryj opcję wyboru diety i wyświetl informację w wynikach planu.
  if (!diets || diets.length === 0) {
    if (planRenderAdapter && typeof planRenderAdapter.renderNoDietsAvailable === 'function') {
      planRenderAdapter.renderNoDietsAvailable({ doc: document });
    } else {
      const dietSel = document.getElementById('dietLevel');
      if (dietSel) {
        vildaAppClearHtml(dietSel);
      }
      const descEl = document.getElementById('dietDesc');
      const calEl  = document.getElementById('dietCalorieInfo');
      if (descEl) descEl.style.display = 'none';
      if (calEl)  calEl.style.display  = 'none';
      const wrap = document.getElementById('dietChoiceWrap');
      if (wrap) wrap.style.display = 'none';
      const planCardEl = document.getElementById('planCard');
      if (planCardEl) planCardEl.style.display = 'block';
    }
    const planResultsEl = document.getElementById('planResults');
    if (planResultsEl) {
      vildaAppSetTrustedHtml(planResultsEl, `<div class="result-card plan-col plan-result-card animate-in"><h3>Brak diety</h3><p class="diet-warning">Twoje całkowite zapotrzebowanie jest zbyt niskie, aby zaproponować dietę redukcyjną.</p></div>`, 'app:planResultsEl');
    }
    return;
  }

  // Zachowaj dotychczasowy wybór diety (jeśli istnieje)
  const dietSel = document.getElementById('dietLevel');
  const prevKey = dietSel ? dietSel.value : null;

  // Wypełnij listę diet (ustawi domyślną dla wieku)
  fillDietSelect(diets);

  // Przywróć poprzedni wybór, jeśli nadal jest dostępny w nowej liście
  if (prevKey && diets.some(d => d.key === prevKey)) {
    dietSel.value = prevKey;
  }

  const chosenKey = dietSel ? dietSel.value : null;
  // Uaktualnij opis diety po zmianie wyboru
  if (chosenKey) {
    updateDietDescription(chosenKey);
  }
  const diet      = diets.find(d => d.key === chosenKey);

  // Informacja o kaloryczności zostanie zaktualizowana poniżej; nie powtarzaj updateDietDescription
  const calInfoEl = document.getElementById('dietCalorieInfo');
  if (calInfoEl && diet) {
    const intakeRounded = Math.round(diet.intake / 100) * 100;
    // Określ, czy użytkownik jest dzieckiem dla potrzeb rekomendowanej diety
    const isChildDef2 = (age >= CHILD_AGE_MIN && age < ENERGY_ADULT_START_AGE);
    const recKey2 = isChildDef2 ? 'light' : 'moderate';
    // Dostosuj nagłówek: jeśli wybrano dietę rekomendowaną, użyj "Zalecana", w przeciwnym razie "Kaloryczność wybranej diety"
    const headerText = (diet && diet.key === recKey2) ? 'Zalecana kaloryczność diety' : 'Kaloryczność wybranej diety';
    vildaAppSetTrustedHtml(calInfoEl, `${headerText}: <strong>${intakeRounded}</strong> kcal/dzień`, 'app:calInfoEl');
    calInfoEl.style.display = 'block';
  }

  /* ------------------ 3. Cele BMI (różne dla dzieci/dorosłych) ------ */
  const isChild   = age >= CHILD_AGE_MIN && age < ENERGY_ADULT_START_AGE;
  const h         = heightCm / CM_TO_M;                              // metry

  /* 3a. Górna granica normy BMI – używa helpera, który respektuje WHO/OLAF */
  const targetUpperBMI = age < ENERGY_ADULT_START_AGE ? toNormalBMITarget(weightKg, heightCm, age, sex) : ADULT_BMI.NORMAL_MAX;

  /* 3b. BMI 50 centyla – te same siatki co w całym kalkulatorze */
  let targetMedianBMI = 22.0;                                        // dorośli – przyjmujemy BMI 22 jako środek normy
  if(isChild){
      const months = Math.round(age * 12);
      const lms    = getLMS(sex, months);                            // :contentReference[oaicite:1]{index=1}
      if(lms) targetMedianBMI = lms[1];                              // parametr M = 50 c.
  }

  /* ------------------ 4. Masa docelowa i czas --------------- */
  function weeksNeeded(targetBMI){
      const target = Number(targetBMI);
      if (!isFinite(target) || target <= 0) return null;
      const targetW = target * h * h;
      const kgToLose = weightKg - targetW;
      return (kgToLose > 0)
             ? Math.ceil(kgToLose / diet.weeklyLoss)
             : 0;
  }
  // Oblicz liczbę tygodni do osiągnięcia docelowego BMI. Jeśli dieta nie powoduje
  // deficytu (weeklyLoss = 0), zwracamy 0 tygodni, aby uniknąć Infinity.
  const wUpper  = (diet && diet.weeklyLoss > 0) ? weeksNeeded(targetUpperBMI) : 0;
  const wMedian = (diet && diet.weeklyLoss > 0) ? weeksNeeded(targetMedianBMI) : 0;

  /* ------------------ 5. Render  ---------------------------- */
  const planResults = planResultsContainer;
  if (!planResults) return;
  // oblicz czas w latach (1 rok = 52 tygodnie)
  // oblicz czas w latach (1 rok = 52 tygodnie), tylko jeśli mamy dodatni tygodniowy ubytek
  const hasUpperTimeline = !!(diet && diet.weeklyLoss > 0 && wUpper !== null);
  const hasMedianTimeline = !!(diet && diet.weeklyLoss > 0 && wMedian !== null);
  const yearsUpper  = hasUpperTimeline ? wUpper  / 52 : 0;
  const yearsMedian = hasMedianTimeline ? wMedian / 52 : 0;
  // zalecana kaloryczność (zaokrąglona do 100 kcal)
  const intakeRounded = diet ? Math.round(diet.intake / 100) * 100 : 0;

  // Przygotuj wartości do wyświetlenia w kartach czasu. Jeśli tygodniowa utrata masy
  // wynosi 0 (deficyt zbyt niski), zamiast liczby pokazujemy znak „–”, by uniknąć Infinity.
  const dispUpperWeeks  = hasUpperTimeline ? wUpper  : '–';
  const dispMedianWeeks = hasMedianTimeline ? wMedian : '–';
  // Use comma as decimal separator when displaying years values
  const dispUpperYears  = hasUpperTimeline ? yearsUpper.toFixed(1).replace('.', ',') : '–';
  const dispMedianYears = hasMedianTimeline ? yearsMedian.toFixed(1).replace('.', ',') : '–';

  // Schowaj ewentualny dodatkowy tekst o kaloryczności (aby uniknąć podwójnego wyświetlania)
  const calInfoEl2 = document.getElementById('dietCalorieInfo');
  if (calInfoEl2) calInfoEl2.style.display = 'none';

  // Ukryj opis diety pod selectem, aby nie dublować treści w wynikach
  const dietDescEl = document.getElementById('dietDesc');
  if (dietDescEl) {
    dietDescEl.style.display = 'none';
  }

  // Zbuduj dodatkowy kontener z opisem wybranej diety w formie listy, jeśli istnieje
  let dietCard = '';
  if (chosenKey && DIET_BULLETS[chosenKey]) {
    const bullets = DIET_BULLETS[chosenKey];
    const bulletItems = bullets.map(item => `<li>${item}</li>`).join('');
    dietCard = `<div class="result-card plan-col plan-result-card animate-in">
      <h3>Wybrana dieta</h3>
      <ul class="diet-list">${bulletItems}</ul>
    </div>`;
  }

  // Przygotuj ostrzeżenia dotyczące diety. Dla osób dorosłych wyświetlamy tylko
  // komunikat o intensywnej diecie, jeśli jest wybrana. W przypadku dzieci w wieku 5–9 lat
  // należy poinformować rodziców, że jakakolwiek dieta wymaga nadzoru dietetyka lub lekarza.
  // Jeśli dodatkowo wybrano dietę intensywną dla dziecka 5–9 lat, pokaż oba komunikaty.
  const warnings = [];
  // Ostrzeżenie dla dzieci 5–9 lat niezależnie od typu diety
  if (age >= 5 && age < 10) {
    warnings.push(`<p class="diet-warning">Dieta u dzieci w wieku 5–9 lat wymaga nadzoru dietetyka lub lekarza.</p>`);
  }
  // Ostrzeżenie o intensywnej diecie: dla wszystkich użytkowników po wybraniu intensywnej diety
  if (chosenKey === 'intense') {
    warnings.push(`<p class="diet-warning">Intensywna dieta wymaga nadzoru specjalisty i&nbsp;nie powinna być stosowana dłużej niż kilka tygodni.</p>`);
  }
  const dietWarningMarkup = warnings.join('');

  // Określ, czy użytkownik jest dzieckiem w kontekście wyboru domyślnej diety
  const isChildDef = (age >= CHILD_AGE_MIN && age < ENERGY_ADULT_START_AGE);
  const recommendedKey = isChildDef ? 'light' : 'moderate';
  const recommendedName = DIET_LEVELS[recommendedKey] ? DIET_LEVELS[recommendedKey].label : '';
  // Określ etykietę nagłówka pierwszej karty w zależności od tego, czy wybrano dietę rekomendowaną
  const firstCardHeading = (diet && chosenKey === recommendedKey) ? 'Zalecana kaloryczność diety:' : 'Kaloryczność wybranej diety:';
  // Nota rekomendacji nie jest już wyświetlana tutaj. Informację o rekomendowanej diecie
  // umieszczamy bezpośrednio w opcjach listy diet (jako dopisek „rekomendowana dieta”).
  const recommendNote = '';
  const modeBadgeHtml = planState && planState.modeBadge
    ? `<div class="energy-mode-badge-row energy-mode-badge-row--results">${energyRenderModeBadgeHtml(planState.modeBadge)}</div>`
    : '';

  vildaAppSetTrustedHtml(planResults, `
    ${recommendNote}
    ${modeBadgeHtml}
    <div class="result-card plan-col plan-result-card animate-in">
      <h3>${firstCardHeading}</h3>
      <p class="result-number result-val">${intakeRounded}</p>
      <small>kcal/dzień</small>
      ${dietWarningMarkup}
    </div>
    <div class="result-card plan-col plan-result-card animate-in">
      <!-- Jasno informujemy, że wynik odnosi się do wybranej diety i dodajemy informację o czasie -->
      <h3>Stosując wybraną dietę osiągniesz górną granicę normy BMI w czasie:</h3>
      <p class="result-number result-val">${dispUpperWeeks}</p>
      <small>tyg.</small><br>
      <small>(≈ ${dispUpperYears} lat)</small>
    </div>
    <div class="result-card plan-col plan-result-card animate-in">
      <!-- Podkreślamy, że efekty dotyczą idealnej wagi (50. centyl BMI) i dodajemy informację "za:" -->
      <h3>Dzięki wybranej diecie dojdziesz do idealnej wagi (50. centyl&nbsp;BMI) za:</h3>
      <p class="result-number result-val">${dispMedianWeeks}</p>
      <small>tyg.</small><br>
      <small>(≈ ${dispMedianYears} lat)</small>
    </div>
    ${dietCard}
  `, 'app:planResults');

  // Po wyrenderowaniu kart planu wywołaj ponownie detekcję ryzyka anoreksji.
  // Dzięki temu baner ostrzegawczy zostanie wstawiony do #planResults na końcu,
  // a nie zostanie usunięty przez późniejsze operacje na zawartości HTML.
  try {
    if (typeof window !== 'undefined' && typeof window.anorexiaRiskAdjust === 'function') {
      const history = window.intakeHistory || null;
      const intakeKcalPerDay = window.intakeEstimatedKcalPerDay || null;
      window.anorexiaRiskAdjust({
        user: {
          ageYears: age,
          ageMonthsOpt: (parseFloat(document.getElementById('ageMonths')?.value) || 0),
          sex: sex,
          heightCm: heightCm,
          weightKg: weightKg
        },
        reeKcal: bmr,
        teeRawKcal: teeRawPlan,
        bmr: bmr,
        pal: planState.palUsed,
        history: history,
        intakeKcalPerDay: intakeKcalPerDay,
        mountId: 'planResults'
      });
    }
  } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 6490 });
    }
  }
  // Po ponownej detekcji ryzyka anoreksji wywołaj też ostrzeżenie o dużym spadku masy w ~12 mies. (ciemnopomarańczowy baner).
  // Używamy historii z karty „Szacowane...” jeśli jest dostępna. W przeciwnym razie pobieramy pomiary z zaawansowanej historii wzrostu (advancedGrowthData)
  // i bieżących danych użytkownika (wiek/miesiące, masa), aby wciąż móc wykryć spadek >8 kg w ciągu roku.
  try {
    if (typeof window.check12mLossOrange === 'function') {
      let hist = window.intakeHistory;
      if (!hist || !Array.isArray(hist) || hist.length < 2) {
        // Zbuduj historię z zaawansowanych pomiarów i bieżących danych, jeśli dostępne
        hist = [];
        try {
          if (window.advancedGrowthData && Array.isArray(window.advancedGrowthData.measurements)) {
            window.advancedGrowthData.measurements.forEach(m => {
              if (m && typeof m.ageMonths === 'number' && typeof m.weight === 'number') {
                hist.push({ ageMonths: m.ageMonths, weight: m.weight });
              }
            });
          }
          // Dodaj bieżący pomiar użytkownika do listy, aby móc porównać z przeszłością
          const currentAgeYears = parseFloat(document.getElementById('age')?.value) || 0;
          const currentAgeMonthsAdditional = parseFloat(document.getElementById('ageMonths')?.value) || 0;
          const currentAgeMonths = Math.round(currentAgeYears * 12 + currentAgeMonthsAdditional);
          const currentWeight = parseFloat(document.getElementById('weight')?.value);
          if (isFinite(currentAgeMonths) && isFinite(currentWeight)) {
            hist.push({ ageMonths: currentAgeMonths, weight: currentWeight });
          }
          // Posortuj rosnąco po wieku w miesiącach
          hist.sort((a,b) => a.ageMonths - b.ageMonths);
        } catch (err) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', err, { line: 6518 });
    }
  }
      }
      if (hist && hist.length >= 2) {
        window.check12mLossOrange(hist, 'planResults');
      }
    }
  } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 6526 });
    }
  }
  } finally {
    __perfEnd();
  }
}
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

  /* === Podsumowanie poprzednich pomiarów ===
     Funkcje pomocnicze do analizy ostatniego pomiaru wczytanego z pliku JSON.
     Obejmują wybór ostatniego pomiaru, obliczenie BMI, centyli dziecięcych,
     wskaźnika Cole’a, WHR i różnicy do normy BMI.
  */
  function __pickLastMeasurement(data){
    // Zwraca sex, wiek w miesiącach, wzrost cm, wagę kg oraz obwody talii i bioder (jeśli występują).
    const result = { sex: null, ageMonths: null, heightCm: null, weightKg: null, waistCm: null, hipCm: null };
    if(!data || !data.user) return result;
    // Sex
    result.sex = data.user.sex || (data.advanced && data.advanced.data && data.advanced.data.sex) || 'M';
    // Age
    // preferuj currentAgeMonths jeśli dostępny w sekcji advanced.data
    if(data.advanced && data.advanced.data && typeof data.advanced.data.currentAgeMonths === 'number'){
      result.ageMonths = data.advanced.data.currentAgeMonths;
    } else {
      const ageYears  = (typeof data.user.age === 'number') ? data.user.age : null;
      const ageMonths = (typeof data.user.ageMonths === 'number') ? data.user.ageMonths : null;
      if(ageYears!=null || ageMonths!=null){
        result.ageMonths = Math.round((ageYears||0) * 12 + (ageMonths||0));
      }
    }
    // Height / weight – preferuj pola currentHeight/currentWeight w advanced.data
    if(data.advanced && data.advanced.data){
      const adv = data.advanced.data;
      if(typeof adv.currentHeight === 'number') result.heightCm = adv.currentHeight;
      if(typeof adv.currentWeight === 'number') result.weightKg = adv.currentWeight;
    }
    // Fallback do user.height/weight jeśli brak current*
    if(result.heightCm == null && typeof data.user.height === 'number'){
      result.heightCm = data.user.height;
    }
    if(result.weightKg == null && typeof data.user.weight === 'number'){
      result.weightKg = data.user.weight;
    }
    // Wiek oraz waga z historii pomiarów – wybierz ostatni (największy ageMonths)
    // jeżeli brak current* lub user.*
    let meas = [];
    if(data.advanced && data.advanced.data && Array.isArray(data.advanced.data.measurements)){
      meas = data.advanced.data.measurements.slice();
    }
    if(meas.length){
      meas.sort((a,b)=>{
        const am = (typeof a.ageMonths === 'number') ? a.ageMonths : Math.round((a.ageYears||0)*12);
        const bm = (typeof b.ageMonths === 'number') ? b.ageMonths : Math.round((b.ageYears||0)*12);
        return am - bm;
      });
      const last = meas[meas.length-1];
      const h = (typeof last.height === 'number') ? last.height : null;
      const w = (typeof last.weight === 'number') ? last.weight : null;
      if(result.heightCm == null && h!=null) result.heightCm = h;
      if(result.weightKg == null && w!=null) result.weightKg = w;
      // ageMonths z historii jeśli brak
      if(result.ageMonths == null){
        if(typeof last.ageMonths === 'number') result.ageMonths = last.ageMonths;
        else if(typeof last.ageYears === 'number') result.ageMonths = Math.round(last.ageYears * 12);
      }
    }
    // WHR – obwód talii i bioder (jeśli w danych)
    if(typeof data.user.waist === 'number') result.waistCm = data.user.waist;
    if(typeof data.user.hip === 'number') result.hipCm = data.user.hip;
    // Alternatywne pola w advanced.data
    if(data.advanced && data.advanced.data){
      if(typeof data.advanced.data.currentWaist === 'number' && result.waistCm == null) result.waistCm = data.advanced.data.currentWaist;
      if(typeof data.advanced.data.currentHip === 'number' && result.hipCm == null) result.hipCm = data.advanced.data.currentHip;
    }
    return result;
  }

  function __kgToEnterNormalRange(weightKg, heightCm, sex, ageMonths){
    // Oblicza minimalną różnicę masy (kg) do wejścia w zakres normy BMI.
    if(!weightKg || !heightCm) return null;
    const h2 = Math.pow(heightCm / 100, 2);
    const bmi = weightKg / h2;
    const ageYears = (typeof ageMonths === 'number') ? ageMonths / 12 : null;
    // Dziecko (<18 lat): użyj z‑score 5c (–1.645) i 85c (+1.036)
    if(ageYears != null && ageYears < 18){
      const lms = (typeof getLMS === 'function') ? getLMS(sex, Math.round(ageMonths)) : null;
      if(!lms) return null;
      const [L,M,S] = lms;
      const bmiAtZ = (z) => {
        return (L !== 0) ? M * Math.pow(1 + L * S * z, 1 / L) : M * Math.exp(S * z);
      };
      const BMI_P5  = bmiAtZ(-1.645);
      const BMI_P85 = bmiAtZ( 1.036);
      if(bmi < BMI_P5){
        const targetW = BMI_P5 * h2;
        return targetW - weightKg;      // dodatnie: ile kg do przybrania
      }else if(bmi >= BMI_P85){
        const targetW = BMI_P85 * h2;
        return weightKg - targetW;      // dodatnie: ile kg do zgubienia
      }else{
        return 0;                       // w normie
      }
    }
    // Dorośli: zakres 18.5–24.9
    const BMI_LOW = 18.5, BMI_HIGH = 24.9;
    if(bmi < BMI_LOW){
      const targetW = BMI_LOW * h2;
      return targetW - weightKg;        // dodatnie: do przybrania
    }else if(bmi > BMI_HIGH){
      const targetW = BMI_HIGH * h2;
      return weightKg - targetW;        // dodatnie: do zgubienia
    }
    return 0;
  }

  function __renderPrevSummary(data){
    // Zwróć jeśli brak elementów DOM
    const wrap  = document.getElementById('prevSummaryWrap');
    const card  = document.getElementById('prevSummaryCard');
    const toggle= document.getElementById('togglePrevSummary');
    const content = document.getElementById('prevSummaryContent');
    if(!wrap || !card || !toggle || !content) return;

    // Pobierz ostatni pomiar z danych
    const last = __pickLastMeasurement(data);
    const ageMonths = last.ageMonths;
    const sex = last.sex || 'M';
    const height = last.heightCm;
    const weight = last.weightKg;

    // Obliczenia podstawowe
    const bmi = (typeof BMI === 'function' && weight && height) ? BMI(weight, height) : null;
    const whr = (last.waistCm && last.hipCm && last.hipCm !== 0) ? (last.waistCm / last.hipCm) : null;
    // Centyle (dzieci) – poprawne wywołanie funkcji calcPercentileStats(value, sex, ageYears, param)
    let heightPerc = null, weightPerc = null, bmiPerc = null, cole = null;
    if (ageMonths != null && (ageMonths / 12) < 18) {
      const ageYears = ageMonths / 12;
      // Ustal zapisane źródło danych dla centyli z pliku JSON.  Dzięki temu
      // można tymczasowo nadpisać globalną zmienną bmiSource, aby funkcje
      // calcPercentileStats() i bmiPercentileChild() korzystały z odpowiednich
      // siatek centylowych (WHO, OLAF lub Palczewska) niezależnie od
      // aktualnie zaznaczonego suwaka w UI.
      let dataSrc = null;
      try {
        if (data && data.zscore && data.zscore.dataSource) dataSrc = data.zscore.dataSource;
      } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 6752 });
    }
  }
      // Zapisz oryginalną wartość bmiSource i tymczasowo ustaw ją na dataSrc.
      let __origBmiSource;
      try {
        if (typeof bmiSource !== 'undefined') __origBmiSource = bmiSource;
        if (dataSrc) {
          bmiSource = dataSrc;
        }
      } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 6760 });
    }
  }
      // Jeśli źródło to Palczewska i dostępna jest funkcja calcPercentileStatsPal,
      // użyj jej do obliczenia centyli wzrostu i wagi.  W przeciwnym razie
      // korzystaj ze standardowej calcPercentileStats() (dla WHO/OLAF).
      if (dataSrc === 'PALCZEWSKA' && typeof calcPercentileStatsPal === 'function') {
        if (height != null) {
          const statsH = calcPercentileStatsPal(height, sex, ageYears, 'HT');
          if (statsH && statsH.percentile != null) heightPerc = statsH.percentile;
        }
        if (weight != null) {
          const statsW = calcPercentileStatsPal(weight, sex, ageYears, 'WT');
          if (statsW && statsW.percentile != null) weightPerc = statsW.percentile;
        }
      } else {
        if (typeof calcPercentileStats === 'function' && height != null) {
          const statsH = calcPercentileStats(height, sex, ageYears, 'HT');
          if (statsH && statsH.percentile != null) heightPerc = statsH.percentile;
        }
        if (typeof calcPercentileStats === 'function' && weight != null) {
          const statsW = calcPercentileStats(weight, sex, ageYears, 'WT');
          if (statsW && statsW.percentile != null) weightPerc = statsW.percentile;
        }
      }
      // Percentyl BMI – korzystaj z bmiPercentileChild(), które automatycznie
      // używa Palczewskiej, OLAF lub WHO w zależności od zmiennej bmiSource.
      if (typeof bmiPercentileChild === 'function' && bmi != null) {
        const bp = bmiPercentileChild(bmi, sex, ageMonths);
        if (bp != null) bmiPerc = bp;
      }
      // Indeks Cole’a (Cole Index) obliczamy tylko wówczas,
      // gdy mamy LMS z siatek WHO/OLAF.  Palczewska nie udostępnia LMS,
      // dlatego ten wskaźnik pomijamy dla źródła PALCZEWSKA.
      if (dataSrc !== 'PALCZEWSKA' && typeof getLMS === 'function' && bmi != null) {
        const lms = getLMS(sex, Math.round(ageMonths));
        if (lms) {
          const M = lms[1];
          cole = (bmi / M) * 100;
        }
      }
      // Przywróć poprzednią wartość bmiSource, aby nie zmieniać globalnego stanu
      // po zakończeniu obliczeń.
      try {
        if (__origBmiSource !== undefined) bmiSource = __origBmiSource;
      } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 6803 });
    }
  }
      // Przekaż użyte źródło danych do formatu etykiet (formatCentileLabel)
      // poprzez zmienną globalną prevSummaryDataSource.  Zostanie ona
      // nadpisana w każdym wywołaniu tej funkcji i wyczyszczona po
      // wstawieniu wyników do DOM.  Dzięki temu formatCentileLabel()
      // może sprawdzić, że aktualnie renderujemy podsumowanie poprzedniego
      // pomiaru i wymusić polskie opisy centyli dla Palczewskiej i OLAF.
      try {
        if (typeof window !== 'undefined') {
          window.prevSummaryDataSource = dataSrc || null;
        }
      } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 6814 });
    }
  }
    }
    // Różnica masy do normy
    const kgDiff = __kgToEnterNormalRange(weight, height, sex, ageMonths);
    let kgText = '';
    if(kgDiff != null){
      const absKg = Math.abs(kgDiff);
      // Ustal kierunek: jeśli BMI powyżej górnej granicy – trzeba schudnąć (−),
      // jeśli BMI poniżej dolnej granicy – trzeba przybrać (+), w normie 0.
      if(kgDiff === 0){
        kgText = 'w normie';
      }else if(weight != null && height != null){
        const h2 = Math.pow(height/100,2);
        const bmiVal = weight / h2;
        const ageYears = (ageMonths != null) ? ageMonths/12 : null;
        let overweight;
        if(ageYears != null && ageYears < 18){
          // Dziecko: sprawdź BMI względem 85 centyla
          const lms = (typeof getLMS === 'function') ? getLMS(sex, Math.round(ageMonths)) : null;
          if(lms){
            const [L,M,S] = lms;
            const bmi85 = (L !== 0) ? M * Math.pow(1 + L*S*1.036, 1/L) : M * Math.exp(S*1.036);
            overweight = bmiVal >= bmi85;
          }else{
            overweight = false;
          }
        }else{
          overweight = bmiVal > 24.9;
        }
        kgText = overweight
          ? `${absKg.toFixed(1).replace('.', ',')} kg do górnej granicy normy`
          : `${absKg.toFixed(1).replace('.', ',')} kg do dolnej granicy normy`;
      }
    }
    // Wylicz wiek w latach i miesiącach do wyświetlenia.
    // Dla 1 roku użyj "rok", dla pozostałych "lata" (2–4) lub "lat" (≥5) zgodnie z językiem polskim.
    let ageDisplay = '';
    if (ageMonths != null) {
      const yrs = Math.floor(ageMonths / 12);
      const mos = ageMonths - yrs * 12;
      let yearWord;
      if (yrs === 1) {
        yearWord = 'rok';
      } else if (yrs % 10 >= 2 && yrs % 10 <= 4 && (yrs % 100 < 10 || yrs % 100 >= 20)) {
        yearWord = 'lata';
      } else {
        yearWord = 'lat';
      }
      ageDisplay = `${yrs} ${yearWord} ${mos} mies.`;
    }

    // Obwody talii i bioder – oblicz centyle dla dzieci (3–18 lat) jeśli dostępne.
    // W przypadku dorosłych lub braku danych centyle nie są obliczane.
    let waistPerc = null;
    let hipPerc = null;
    if (last.waistCm != null && last.hipCm != null && ageMonths != null) {
      const ageYearsWHR = ageMonths / 12;
      if (ageYearsWHR >= 3 && ageYearsWHR <= 18 && typeof childPercentileFromTables === 'function') {
        try {
          const percRes = childPercentileFromTables(ageYearsWHR, sex, last.waistCm, last.hipCm);
          if (percRes) {
            waistPerc = percRes.waistP;
            hipPerc   = percRes.hipP;
          }
        } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 6880 });
    }
  }
      }
    }
    // Wyznacz klasy kolorów dla wyników w zależności od kategorii (norma, ostrzeżenie, alert)
    let heightClass = '';
    let weightClass = '';
    let bmiClass    = '';
    let coleClass   = '';
    let waistClass  = '';
    let hipClass    = '';
    let whrClass    = '';
    // Ustal, czy mamy do czynienia z osobą pełnoletnią (wiek >= 18 lat).
    const isAdult = (ageMonths != null && (ageMonths / 12) >= 18);
    if (!isAdult) {
      // Klasyfikacja wzrostu: poniżej 3. lub powyżej 97. centyla – czerwony alert
      if (heightPerc != null && (heightPerc < 3 || heightPerc > 97)) {
        heightClass = ' status-alert';
      }
      // Klasyfikacja wagi u dzieci: dostosuj progi ostrzegawcze.
      // Jeżeli percentyl masy ciała znajduje się poza skrajnymi wartościami (<3 lub >97) — użyj koloru ostrzegawczego (czerwony).
      // Dodatkowo, jeśli mieści się w przedziale 90–97 centyl, zastosuj kolor ostrzegawczy umiarkowany (ciemny pomarańczowy).
      if (weightPerc != null) {
        if (weightPerc >= 97 || weightPerc < 3) {
          weightClass = ' status-alert';
        } else if (weightPerc >= 90) {
          weightClass = ' status-improve';
        }
      }
      // Klasyfikacja BMI u dzieci
      if (bmi != null && bmiPerc != null) {
        if (bmiPerc >= 97 || bmiPerc < 3) {
          bmiClass = ' status-alert';
        } else if (bmiPerc >= 85) {
          bmiClass = ' status-improve';
        }
      }
      // Klasyfikacja wskaźnika Cole'a – nadwaga/otyłość
      if (cole != null) {
        if (cole < 90 || cole >= 120) {
          coleClass = ' status-alert';
        } else if (cole > 110 && cole < 120) {
          coleClass = ' status-improve';
        }
      }
      // Klasyfikacja obwodu talii u dzieci
      if (last.waistCm != null && waistPerc != null) {
        if (waistPerc >= 97) {
          waistClass = ' status-alert';
        } else if (waistPerc >= 90) {
          waistClass = ' status-improve';
        }
      }
      // Klasyfikacja obwodu bioder u dzieci
      if (last.hipCm != null && hipPerc != null) {
        if (hipPerc >= 97) {
          hipClass = ' status-alert';
        } else if (hipPerc >= 90) {
          hipClass = ' status-improve';
        }
      }
      // WHR u dzieci – brak kolorowania
    } else {
      // Klasyfikacja BMI u dorosłych
      if (bmi != null) {
        if (bmi >= 30 || bmi < 18.5) {
          bmiClass = ' status-alert';
        } else if (bmi >= 25) {
          bmiClass = ' status-improve';
        }
      }
      // Klasyfikacja Cole'a u dorosłych (jeżeli M z siatek jest dostępne)
      if (cole != null) {
        if (cole < 90 || cole >= 120) {
          coleClass = ' status-alert';
        } else if (cole > 110 && cole < 120) {
          coleClass = ' status-improve';
        }
      }
      // Klasyfikacja obwodu talii u dorosłych
      if (last.waistCm != null) {
        if (sex === 'M') {
          if (last.waistCm >= 102) {
            waistClass = ' status-alert';
          } else if (last.waistCm >= 94) {
            waistClass = ' status-improve';
          }
        } else {
          // Zakładamy, że pozostałe osoby to kobiety
          if (last.waistCm >= 88) {
            waistClass = ' status-alert';
          } else if (last.waistCm >= 80) {
            waistClass = ' status-improve';
          }
        }
      }
      // Biodra u dorosłych – brak kolorowania
      // Klasyfikacja WHR u dorosłych
      if (whr != null) {
        const whrLimit = (sex === 'M') ? 0.90 : 0.85;
        if (whr > whrLimit) {
          whrClass = ' status-alert';
        }
      }
    }

    // Budowa HTML
    const rows = [];
    // ► Źródło danych
    // Wstaw wiersz informujący o zestawie danych (WHO/OLAF/Palczewska), z którego
    // korzystano podczas zapisu pomiaru.  Informacja ta pochodzi z pola
    // data.zscore.dataSource zapisanego w pliku JSON.  Dzięki temu użytkownik
    // widzi, na podstawie której siatki centylowej obliczono wysokość,
    // masę, BMI oraz inne parametry.  Jeżeli brak takiej informacji,
    // wiersz nie jest dodawany.
    (function() {
      let __srcLabel = null;
      try {
        if (data && data.zscore && data.zscore.dataSource) {
          const src = data.zscore.dataSource;
          if (src === 'PALCZEWSKA') {
            __srcLabel = 'Palczewska';
          } else if (src === 'OLAF') {
            __srcLabel = 'OLAF';
          } else if (src === 'WHO') {
            __srcLabel = 'WHO';
          } else {
            __srcLabel = src;
          }
        }
      } catch (_) {
        __srcLabel = null;
      }
      if (__srcLabel) {
        rows.push(`<div class="label">Źródło\u00a0danych</div><div class="val"><span class="result-val">${__srcLabel}</span></div>`);
      }
    })();
    // Data ostatniego zapisu
    const ts = data && (data.timestampISO || data.timestamp);
    if(ts){
      const d = new Date(ts);
      const pl = d.toLocaleString('pl-PL', { year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit' });
      rows.push(`<div class="label">Data ostatniego zapisu</div><div class="val">${pl}</div>`);
      // Wiersz informujący o czasie od ostatniego pomiaru będzie uaktualniany dynamicznie
      // po uzupełnieniu aktualnego wieku użytkownika.  Wstawiamy ukryty placeholder.
      rows.push(`<div class="label time-since-label" style="display:none;">Od ostatniego pomiaru</div><div class="val time-since-val" style="display:none;"><span class="result-val" style="text-decoration:underline; font-size:1.0rem; font-weight:600;"></span></div>`);
    }
    // Wiek
    if(ageDisplay){
      rows.push(`<div class="label">Wiek podczas pomiaru</div><div class="val"><span class="result-val">${ageDisplay}</span></div>`);
    }
    // Wzrost
    rows.push(`<div class="label">Wzrost</div><div class="val"><span class="result-val${heightClass}">${height != null ? height.toFixed(1).replace('.', ',') : '—'}<small> cm</small></span>${heightPerc != null ? ` <span class="muted">(${formatCentileLabel(heightPerc)})</span>` : ''}</div>`);
    // Waga
    rows.push(`<div class="label">Waga</div><div class="val"><span class="result-val${weightClass}">${weight != null ? weight.toFixed(1).replace('.', ',') : '—'}<small> kg</small></span>${weightPerc != null ? ` <span class="muted">(${formatCentileLabel(weightPerc)})</span>` : ''}</div>`);
    // BMI
    rows.push(`<div class="label">BMI</div><div class="val"><span class="result-val${bmiClass}">${bmi != null ? bmi.toFixed(1).replace('.', ',') : '—'}</span>${bmiPerc != null ? ` <span class="muted">(${formatCentileLabel(bmiPerc)})</span>` : ''}</div>`);
    // Cole index
    if(cole != null){
      rows.push(`<div class="label">Wskaźnik Cole’a</div><div class="val"><span class="result-val${coleClass}">${cole.toFixed(1).replace('.', ',')}<small>%</small></span></div>`);
    }
    // Obwód talii (jeśli dostępny)
    if (last.waistCm != null) {
      const waistVal = last.waistCm.toFixed(1).replace('.', ',');
      rows.push(`<div class="label">Obwód\u00a0talii</div><div class="val"><span class="result-val${waistClass}">${waistVal}<small>\u00a0cm</small></span>${waistPerc != null ? ` <span class="muted">(${formatCentileLabel(waistPerc)})</span>` : ''}</div>`);
    }
    // Obwód bioder (jeśli dostępny)
    if (last.hipCm != null) {
      const hipVal = last.hipCm.toFixed(1).replace('.', ',');
      rows.push(`<div class="label">Obwód\u00a0bioder</div><div class="val"><span class="result-val${hipClass}">${hipVal}<small>\u00a0cm</small></span>${hipPerc != null ? ` <span class="muted">(${formatCentileLabel(hipPerc)})</span>` : ''}</div>`);
    }
    // WHR (wskaźnik talia‑biodra)
    if(whr != null){
      rows.push(`<div class="label">WHR</div><div class="val"><span class="result-val${whrClass}">${whr.toFixed(2).replace('.', ',')}</span></div>`);
    }
    // Usunięto wiersz "Do normy BMI" – nie pokazujemy tego parametru ani jego zmian.
    // Insert into DOM
    vildaAppSetTrustedHtml(content, rows.join(''), 'app:content');
    // Po wyrenderowaniu wyniku usuń znacznik prevSummaryDataSource.
    // Wykorzystywany jest tylko podczas tworzenia wierszy, aby
    // formatCentileLabel() mógł poprawnie dobrać język dla centyli.
    try {
      if (typeof window !== 'undefined') {
        window.prevSummaryDataSource = null;
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 7066 });
    }
  }
    // Pokaż kartę i ukryj przycisk toggle
    wrap.style.display = 'block';
    card.style.display = 'block';
    toggle.style.display = 'none';
    // Oznacz, że podsumowanie poprzedniego pomiaru zostało poprawnie załadowane.
    // Dzięki temu będziemy mogli decydować, czy karta powinna być wyświetlana
    // podczas modyfikacji formularza – karta ma się pojawiać tylko po wczytaniu
    // danych z pliku JSON.
    if (wrap && wrap.dataset) {
      wrap.dataset.loaded = 'true';
    }
    if (card && card.dataset) {
      card.dataset.loaded = 'true';
    }
  }
// === Podsumowanie ostatniego pomiaru klirensu (tylko na podstronie „Klirens”) ===
// === Podsumowanie ostatniego pomiaru klirensu (tylko na podstronie „Klirens”) ===

/**
 * Synchronize the height of the previous creatinine clearance measurement card
 * (#prevClcrCard) with the patient data card.  On desktop (≥ 700 px) both cards
 * should be the same height so they align neatly when displayed side by side.
 * This function measures the height of the patient card and applies it to the
 * previous measurement card.  It also enables an internal scroll on the list
 * of previous results (.prev-clcr-sections) so that overflowing content does
 * not stretch the card.  On mobile (< 700 px) any inline height and overflow
 * styles applied by this function are removed, allowing the layout defined in
 * CSS to take effect.
 */
function __syncPrevClcrCardHeight() {
  try {
    // Jeśli dostępna jest nowa funkcja ustawiająca wysokość karty,
    // użyj jej zamiast lokalnej implementacji.  Dzięki temu logika wysokości
    // pozostaje spójna z definicją w pliku HTML (setupPrevClcrCardHeight),
    // która oblicza wysokość na podstawie odległości między sekcją "Dane pacjenta"
    // a "Wybierz formułę do obliczenia".
    if (typeof window !== 'undefined' && typeof window.setupPrevClcrCardHeight === 'function') {
      window.setupPrevClcrCardHeight();
      return;
    }
    // Fallback: zachowaj oryginalną funkcjonalność tylko jeśli nowa funkcja nie istnieje.
    const clcrForm = document.getElementById('clcrForm');
    if (!clcrForm || !clcrForm.classList.contains('has-prev-clcr')) {
      return;
    }
    const patientFieldset = document.getElementById('patientSet') || clcrForm.querySelector('.patient-card fieldset');
    const prevClcrCard = document.getElementById('prevClcrCard');
    if (!patientFieldset || !prevClcrCard) {
      return;
    }
    const listContainer = prevClcrCard.querySelector('.prev-clcr-sections');
    prevClcrCard.style.height = '';
    prevClcrCard.style.minHeight = '';
    prevClcrCard.style.maxHeight = '';
    if (listContainer) {
      listContainer.style.overflowY = '';
    }
    const isDesktop = typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(min-width: 700px)').matches;
    if (!isDesktop) {
      return;
    }
    const patientHeight = patientFieldset.getBoundingClientRect().height;
    if (!patientHeight || patientHeight <= 0) {
      return;
    }
    const hPx = patientHeight + 'px';
    prevClcrCard.style.height = hPx;
    prevClcrCard.style.minHeight = hPx;
    prevClcrCard.style.maxHeight = hPx;
    if (listContainer) {
      listContainer.style.overflowY = 'auto';
    }
  } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 7143 });
    }
  }
}
function __renderPrevClcrSummary(data) {
  try {
    const clcrData = data && data.clcr;
    if (!clcrData || !clcrData.summary) return;

    const summary  = clcrData.summary || {};
    const clcrArr  = Array.isArray(summary.clcr)  ? summary.clcr  : [];
    const elecArr  = Array.isArray(summary.elec)  ? summary.elec  : [];
    const stoneArr = Array.isArray(summary.stone) ? summary.stone : [];
    const ktvArr   = Array.isArray(summary.ktv)   ? summary.ktv   : [];

    // Jeśli w pliku nie ma żadnych podsumowań z modułu klirensu – nic nie pokazujemy
    if (!clcrArr.length && !elecArr.length && !stoneArr.length && !ktvArr.length) {
      return;
    }

    const clcrForm = document.getElementById('clcrForm');
    if (!clcrForm) return;

    // Utwórz (lub pobierz) kartę "Ostatni pomiar"
    let prevClcrCard = document.getElementById('prevClcrCard');
    if (!prevClcrCard) {
      prevClcrCard = document.createElement('div');
      prevClcrCard.id = 'prevClcrCard';
      prevClcrCard.className = 'card';
    } else {
      prevClcrCard.classList.add('card');
    }

    // Upewnij się, że karta jest dzieckiem formularza
    if (prevClcrCard.parentNode !== clcrForm) {
      clcrForm.appendChild(prevClcrCard);
    }

    // Ustaw kartę bezpośrednio za sekcją „Dane pacjenta”
    const patientCard = clcrForm.querySelector('.patient-card');
    if (patientCard) {
      const next = patientCard.nextElementSibling;
      if (next !== prevClcrCard) {
        if (next) {
          clcrForm.insertBefore(prevClcrCard, next);
        } else {
          clcrForm.appendChild(prevClcrCard);
        }
      }
    }

    // Włącz tryb dwukolumnowy – CSS ustawi patient + prevClcr w jednym wierszu
    clcrForm.classList.add('has-prev-clcr');

    // Wyczyść zawartość karty i zbuduj ją od nowa
    vildaAppClearHtml(prevClcrCard);

    // --- Nagłówek karty ---
    const header = document.createElement('h2');
    header.textContent = 'Ostatni pomiar (klirens/eGFR)';
    header.style.textAlign = 'center';
    header.style.marginTop = '0';
    prevClcrCard.appendChild(header);

    // --- Metadane (pacjent, data, wiek, masa, wzrost) ---
    const meta = document.createElement('p');
    meta.className = 'prev-clcr-meta';
    meta.style.textAlign = 'center';
    meta.style.fontSize = '0.9rem';

    const user     = (data && data.user) || {};
    const fullName = (data && (data.fullName || data.name)) || '';
    const ageY     = user.age != null
      ? user.age
      : (user.ageMonths != null ? (user.ageMonths / 12).toFixed(1) : null);
    const weight   = user.weight;
    const height   = user.height;

    const metaParts = [];

    if (fullName) {
      metaParts.push('Pacjent: ' + fullName);
    }

    if (data && data.timestampISO) {
      const dt = new Date(data.timestampISO);
      if (!isNaN(dt.getTime())) {
        const dateStr = dt.toLocaleDateString('pl-PL');
        const timeStr = dt.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
        metaParts.push('Data zapisu: ' + dateStr + ', ' + timeStr);
      }
    }

    const aux = [];
    if (ageY != null && isFinite(ageY)) aux.push('wiek ok. ' + ageY + ' lat');
    if (weight != null) aux.push('masa ' + weight + ' kg');
    if (height != null) aux.push('wzrost ' + height + ' cm');
    if (aux.length) metaParts.push(aux.join(', '));

    meta.textContent = metaParts.join(' \u2022 ');
    prevClcrCard.appendChild(meta);

    // Informacja o wersji kalkulatora
    const version = clcrData.currentVersion || clcrData.version;
    if (version) {
      const v = document.createElement('p');
      v.style.textAlign = 'center';
      v.style.fontSize = '0.85rem';
      v.style.color = 'var(--muted-text, #555)';

      let label = version;
      if (version === 'basic')    label = 'podstawowa';
      if (version === 'advanced') label = 'rozszerzona';
      if (version === 'spot')     label = 'spot (pojedyncza próbka moczu)';
      if (version === 'pro')      label = 'pełna (PRO)';

      v.textContent = 'Aktywna wersja kalkulatora (w momencie zapisu): ' + label;
      prevClcrCard.appendChild(v);
    }

    const hr = document.createElement('hr');
    hr.style.margin = '0.75rem 0 1rem';
    prevClcrCard.appendChild(hr);

    const listContainer = document.createElement('div');
    listContainer.className = 'prev-clcr-sections';
    prevClcrCard.appendChild(listContainer);

    const addSection = (titleText, arr) => {
      if (!arr || !arr.length) return;

      const section = document.createElement('div');
      section.className = 'prev-clcr-section';

      const h3 = document.createElement('h3');
      h3.textContent = titleText;
      h3.style.fontSize = '1rem';
      h3.style.margin = '0.25rem 0 0.5rem';
      section.appendChild(h3);

      const ul = document.createElement('ul');
      ul.style.margin = '0 0 0.75rem';
      ul.style.paddingLeft = '1.1rem';

      arr.forEach((row) => {
        if (!row) return;
        const text = typeof row === 'string' ? row : row.text;
        if (!text) return;

        const li = document.createElement('li');
        li.textContent = text;

        const isOut = typeof row === 'object' && !!row.isOut;
        if (isOut) {
          li.style.fontWeight = '600';
          li.style.color = 'var(--danger, #b00020)';
        }

        ul.appendChild(li);
      });

      if (ul.children.length) {
        section.appendChild(ul);
        listContainer.appendChild(section);
      }
    };

    // Sekcje: wszystkie obliczenia z modułu Klirens
    addSection('Wyniki klirensu / eGFR', clcrArr);
    addSection('Parametry surowicy i DZM', elecArr);
    addSection('Ryzyko kamicy nerkowej', stoneArr);
    addSection('Parametry dializy / KT/V', ktvArr);

    // Dopasuj wysokość karty do "Dane pacjenta"
    __syncPrevClcrCardHeight();

    // Jednorazowo podpinamy się pod resize i zmiany w formularzu,
    // żeby wysokość karty aktualizowała się przy zmianie układu / pól.
    if (!window.__prevClcrLayoutBound) {
      window.__prevClcrLayoutBound = true;

      window.addEventListener('resize', () => {
        try { __syncPrevClcrCardHeight(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 7325 });
    }
  }
      });

      const form = document.getElementById('clcrForm');
      if (form) {
        const handler = () => {
          try { __syncPrevClcrCardHeight(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 7331 });
    }
  }
        };
        form.addEventListener('input', handler);
        form.addEventListener('change', handler);
      }
    }

  } catch (e) {
    console.error('Błąd w __renderPrevClcrSummary:', e);
  }
}
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
    // Odczytaj poprzedni stan z localStorage
    const storedMode = readResultsModeStorage();
    professionalMode = (storedMode === 'professional');
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
      if (typeof skipAutoScrollCounter !== 'undefined') {
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

/*
 * Funkcja repositionDoctor() odpowiada za dynamiczne przenoszenie sekcji
 * przejścia do modułu lekarskiego (doctorWrapper) między oryginalnym
 * kontenerem w kolumnie formularza a dedykowanym kontenerem pod
 * komunikatem błędu w widoku jednokolumnowym. Jeżeli okno jest wąskie
 * (mniej niż 700 px), wówczas element jest przenoszony pod pola
 * obowiązkowe i wyświetlany z większym odstępem podczas oczekiwania na
 * dane (3 rem) lub z mniejszym odstępem, gdy wyniki są już wyświetlane
 * (1 rem). W trybie kompaktowym zmniejszamy także rozmiary czcionek
 * oraz samego checkboxa o 0,25 rem.
 */
function repositionDoctor() {
  // reposition disabled to prevent layout shifts
  return;
  const doctorWrapper = document.getElementById('doctorWrapper');
  const doctorContainer = document.getElementById('doctorContainer');
  const doctorMobileContainer = document.getElementById('doctorMobileContainer');
  const doctorBottomContainer = document.getElementById('doctorBottom');
  const pwzContainer = document.getElementById('pwzContainer');
  const prevSummaryWrap = document.getElementById('prevSummaryWrap');
  const resultsDiv = document.getElementById('results');
  const errorBox = document.getElementById('errorBox');
  const isDoctorCb = document.getElementById('isDoctor');
  if (!doctorWrapper || !doctorContainer || !doctorMobileContainer) return;

  // Jeżeli przewinięcie do wyników jest oczekiwane, ale sekcja modułu lekarza
  // została już przeniesiona (co może wpływać na pozycję kart wyników),
  // pozostawiamy obsługę przewijania funkcji repositionMetabolicSummary,
  // która zostanie wywołana jako kolejna.  Nie zerujemy flagi tutaj, aby
  // umożliwić przesunięcie po kompletnym repozycjonowaniu układu.
  // Determine whether we should show compact version
  const isMobile = window.innerWidth < 700;
  const resultsVisible = resultsDiv && resultsDiv.style && resultsDiv.style.display !== 'none';
  const isDoctor = isDoctorCb && isDoctorCb.checked;

  if (isMobile) {
    // Show the mobile container
    doctorMobileContainer.style.display = 'flex';
    doctorMobileContainer.style.justifyContent = 'center';
    doctorMobileContainer.style.alignItems = 'center';
    // Układ pionowy: umieszczamy elementy jeden pod drugim
    doctorMobileContainer.style.flexDirection = 'column';
    // Move wrapper into mobile container if not already there
    if (doctorWrapper.parentElement !== doctorMobileContainer) {
      doctorMobileContainer.appendChild(doctorWrapper);
    }
    // Jeśli istnieje kontener z polem na numer PWZ, przenieś go pod sekcję
    // przełącznika w widoku mobilnym, aby pole pojawiało się bezpośrednio
    // pod przyciskiem „Przejdź do modułu lekarskiego”.
    if (pwzContainer && pwzContainer.parentElement !== doctorMobileContainer) {
      doctorMobileContainer.appendChild(pwzContainer);
    }
    // Przenieś podsumowanie pomiarów poniżej sekcji modułu lekarskiego w mobilnym układzie
    if (prevSummaryWrap && prevSummaryWrap.parentElement !== doctorMobileContainer) {
      if (pwzContainer && pwzContainer.parentElement === doctorMobileContainer) {
        doctorMobileContainer.insertBefore(prevSummaryWrap, pwzContainer);
      } else {
        doctorMobileContainer.appendChild(prevSummaryWrap);
      }
    }
    // Ustawienie kolejności: upewnij się, że karta podsumowania jest przed sekcją lekarza w mobilnym układzie
    if (prevSummaryWrap && doctorWrapper && prevSummaryWrap.parentElement === doctorMobileContainer) {
      doctorMobileContainer.insertBefore(prevSummaryWrap, doctorWrapper);
    }
    // Hide original container (to avoid taking up space)
    doctorContainer.style.display = 'none';
    // Ukryj kontener dolny w widoku mobilnym
    if (doctorBottomContainer) {
      doctorBottomContainer.style.display = 'none';
    }
    // Apply spacing and sizing
    if (!resultsVisible) {
      // waiting for data – larger gap and normal size
      doctorWrapper.classList.remove('compact');
      doctorWrapper.style.marginTop = '3rem';
      doctorWrapper.style.marginBottom = '0';
    } else {
      // results visible – smaller gap; shrink size only if użytkownik nie jest lekarzem
      doctorWrapper.style.marginTop = '1rem';
      doctorWrapper.style.marginBottom = '1rem';
      if (!isDoctor) {
        doctorWrapper.classList.add('compact');
      } else {
        doctorWrapper.classList.remove('compact');
      }
    }
  } else {
    // Large screens: przenieś sekcję modułu lekarskiego do kontenera dolnego
    // oraz pozostaw podsumowanie pomiarów w oryginalnym kontenerze.
    if (doctorBottomContainer) {
      // Pokaż i wyśrodkuj dolny kontener
      doctorBottomContainer.style.display = 'flex';
      doctorBottomContainer.style.justifyContent = 'center';
      doctorBottomContainer.style.alignItems = 'center';
      doctorBottomContainer.style.flexDirection = 'column';
      // Przenieś sekcję lekarza do kontenera dolnego
      if (doctorWrapper.parentElement !== doctorBottomContainer) {
        doctorBottomContainer.appendChild(doctorWrapper);
      }
      // Przenieś pole PWZ do kontenera dolnego
      if (pwzContainer && pwzContainer.parentElement !== doctorBottomContainer) {
        doctorBottomContainer.appendChild(pwzContainer);
      }
    }
    // Upewnij się, że podsumowanie pomiarów znajduje się w oryginalnym kontenerze
    if (prevSummaryWrap && prevSummaryWrap.parentElement !== doctorContainer) {
      doctorContainer.appendChild(prevSummaryWrap);
    }
    // W widoku szerokim ukryj kontener mobilny i przywróć widoczność oryginalnego kontenera
    doctorContainer.style.display = '';
    doctorMobileContainer.style.display = 'none';
    // Usuń ustawienie kierunku flex w kontenerze mobilnym w razie ponownego przełączenia
    doctorMobileContainer.style.flexDirection = '';
    // Ustaw marginesy sekcji lekarskiej w zależności od stanu wyników
    if (!resultsVisible) {
      // waiting for data – większa przerwa i pełny rozmiar
      doctorWrapper.classList.remove('compact');
      doctorWrapper.style.marginTop = '3rem';
      doctorWrapper.style.marginBottom = '0';
    } else {
      // wyniki widoczne – mniejsza przerwa; zmniejsz rozmiar tylko, gdy użytkownik nie jest lekarzem
      doctorWrapper.style.marginTop = '1rem';
      doctorWrapper.style.marginBottom = '1rem';
      if (!isDoctor) {
        doctorWrapper.classList.add('compact');
      } else {
        doctorWrapper.classList.remove('compact');
      }
    }
  }

  // Po zakończeniu zmiany położenia sekcji modułu lekarskiego (zarówno w widoku
  // mobilnym, jak i desktopowym), ponownie wyrównaj szerokości przycisków
  // testów. Użycie requestAnimationFrame gwarantuje, że pomiar zostanie
  // wykonany po zakończeniu reflow.
  if (typeof adjustTestButtonWidths === 'function') {
    requestAnimationFrame(() => adjustTestButtonWidths());
  }
}

/*
 * Funkcja repositionMetabolicSummary() odpowiada za dynamiczne przenoszenie
 * przycisku podsumowania wyników pomiędzy kolumnami w zależności od szerokości
 * okna. W układzie jednokolumnowym (np. szerokość < 700 px) przycisk
 * "Podsumowanie wyników – kliknij i skopiuj" ma znajdować się przed kartą
 * "Centyle i BMI" w lewej kolumnie. Na większych
 * ekranach przycisk pozostaje w prawej kolumnie (normWrapper) za kartą WFL.
 */
function repositionMetabolicSummary() {
  // reposition disabled to prevent layout shifts
  return;
  const section = document.getElementById('metabolicSummarySection');
  const leftColumn = document.getElementById('leftColumnWrap');
  const normWrapper = document.getElementById('normWrapper');
  const bmiCard = document.getElementById('bmiCard');
  const wflCard = document.getElementById('wflCard');
  if (!section || !leftColumn || !normWrapper) return;
  const isMobile = window.innerWidth < 700;
  if (isMobile) {
    // W widoku mobilnym przenieś sekcję nad kartę BMI
    // Jeśli nie znajduje się już w lewej kolumnie, dodaj ją tam
    if (section.parentElement !== leftColumn) {
      leftColumn.insertBefore(section, leftColumn.firstChild);
    }
    // Upewnij się, że sekcja znajduje się bezpośrednio przed kartą BMI
    if (bmiCard && section.nextSibling !== bmiCard) {
      leftColumn.insertBefore(section, bmiCard);
    }
  } else {
    // W widoku szerokim przywróć sekcję do prawej kolumny (normWrapper)
    if (section.parentElement !== normWrapper) {
      // Jeśli istnieje karta WFL w normWrapper, umieść przycisk bezpośrednio za nią.
      if (wflCard && wflCard.parentElement === normWrapper) {
        // insertAfter: w JS insertBefore z nextSibling
        normWrapper.insertBefore(section, wflCard.nextSibling);
      } else {
        normWrapper.insertBefore(section, normWrapper.firstChild);
      }
    } else {
      // Upewnij się, że sekcja jest za kartą WFL, jeśli WFL jest widoczna
      if (wflCard && wflCard.parentElement === normWrapper) {
        const expectedPos = wflCard.nextSibling;
        if (expectedPos !== section) {
          normWrapper.insertBefore(section, expectedPos);
        }
      }
    }
  }

  // Po zakończeniu repozycjonowania, jeżeli oczekuje przewinięcia do
  // wyników, wykonaj je teraz.  Sprawdzamy także, czy element wyników
  // jest widoczny (display: grid) – w przeciwnym razie przewijanie nie
  // zostanie wywołane.  Po przewinięciu zerujemy flagę, aby uniknąć
  // kolejnych przewinięć przy przyszłych zmianach układu.
  try {
    // Jeżeli flaga przewijania jest ustawiona, zaplanuj płynne przewinięcie
    // do karty wyników w następnym cyklu animacji.  Użycie
    // requestAnimationFrame zapewnia, że DOM został już przebudowany i
    // elementy znajdują się na właściwych pozycjach, co pozwala na poprawne
    // obliczenie współrzędnych.  Po wykonaniu przewinięcia resetujemy flagę.
    if (pendingResultsScroll) {
      requestAnimationFrame(() => {
        try {
          scrollToResultsCard();
        } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 20144 });
    }
  } finally {
          pendingResultsScroll = false;
        }
      });
    }
  } catch (e) {
    // ignorujemy błędy zewnętrzne, ale resetujemy flagę, by zapobiec
    // nieskończonemu oczekiwaniu na przewinięcie przy kolejnych zmianach
    pendingResultsScroll = false;
  }
}
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
let autoScrollDisabled = true;
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
      // Dodaj obsługę blur i klawisza Enter
      monthsEl.addEventListener('blur', finalizeEdit);
      monthsEl.addEventListener('keydown', finalizeEdit);
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
  try {
    // 1. Spróbuj użyć natywnej funkcji window.scrollTo z obsługą płynnego
    // przewijania. W większości nowoczesnych przeglądarek spowoduje to
    // przewinięcie całej strony.
    if (typeof window.scrollTo === 'function') {
      try {
        window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
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
      scrollingEl.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
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
          mainContainer.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
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
window.addEventListener('resize', () => {
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
window.addEventListener('resize', () => {
  if (typeof adjustTestButtonWidths === 'function') {
    adjustTestButtonWidths();
  }
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
  const startTime = performance.now();
  // Funkcja easing (łatwo można zmienić na inną). Używamy easeInOutQuad dla płynności.
  function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }
  function animateScroll(currentTime) {
    const elapsed = currentTime - startTime;
    // Procent postępu (0–1)
    const progress = Math.min(elapsed / duration, 1);
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

const bmiPercentiles={"boys":{"24":{"P5":14.16,"P85":17.4,"P95":18.31},"25":{"P5":14.12,"P85":17.36,"P95":18.26},"26":{"P5":14.08,"P85":17.32,"P95":18.21},"27":{"P5":14.04,"P85":17.27,"P95":18.16},"28":{"P5":14.01,"P85":17.23,"P95":18.12},"29":{"P5":13.97,"P85":17.19,"P95":18.08},"30":{"P5":13.93,"P85":17.16,"P95":18.04},"31":{"P5":13.9,"P85":17.12,"P95":18.0},"32":{"P5":13.86,"P85":17.08,"P95":17.96},"33":{"P5":13.83,"P85":17.05,"P95":17.92},"34":{"P5":13.79,"P85":17.02,"P95":17.89},"35":{"P5":13.76,"P85":16.98,"P95":17.85},"36":{"P5":13.73,"P85":16.95,"P95":17.82},"37":{"P5":13.69,"P85":16.92,"P95":17.79},"38":{"P5":13.67,"P85":16.9,"P95":17.76},"39":{"P5":13.64,"P85":16.87,"P95":17.74},"40":{"P5":13.61,"P85":16.85,"P95":17.72},"41":{"P5":13.58,"P85":16.82,"P95":17.7},"42":{"P5":13.56,"P85":16.8,"P95":17.68},"43":{"P5":13.53,"P85":16.79,"P95":17.66},"44":{"P5":13.51,"P85":16.77,"P95":17.65},"45":{"P5":13.49,"P85":16.76,"P95":17.64},"46":{"P5":13.47,"P85":16.74,"P95":17.63},"47":{"P5":13.45,"P85":16.73,"P95":17.62},"48":{"P5":13.43,"P85":16.72,"P95":17.62},"49":{"P5":13.41,"P85":16.71,"P95":17.61},"50":{"P5":13.4,"P85":16.7,"P95":17.61},"51":{"P5":13.38,"P85":16.7,"P95":17.61},"52":{"P5":13.36,"P85":16.69,"P95":17.61},"53":{"P5":13.35,"P85":16.69,"P95":17.61},"54":{"P5":13.33,"P85":16.68,"P95":17.62},"55":{"P5":13.32,"P85":16.68,"P95":17.62},"56":{"P5":13.3,"P85":16.67,"P95":17.63},"57":{"P5":13.29,"P85":16.67,"P95":17.63},"58":{"P5":13.28,"P85":16.67,"P95":17.64},"59":{"P5":13.26,"P85":16.67,"P95":17.65},"60":{"P5":13.25,"P85":16.67,"P95":17.66},"61":{"P5":13.38,"P85":16.7,"P95":17.66},"62":{"P5":13.38,"P85":16.7,"P95":17.67},"63":{"P5":13.38,"P85":16.71,"P95":17.68},"64":{"P5":13.37,"P85":16.71,"P95":17.69},"65":{"P5":13.37,"P85":16.72,"P95":17.7},"66":{"P5":13.37,"P85":16.73,"P95":17.72},"67":{"P5":13.37,"P85":16.74,"P95":17.74},"68":{"P5":13.38,"P85":16.75,"P95":17.76},"69":{"P5":13.38,"P85":16.77,"P95":17.78},"70":{"P5":13.38,"P85":16.78,"P95":17.8},"71":{"P5":13.39,"P85":16.8,"P95":17.83},"72":{"P5":13.39,"P85":16.82,"P95":17.85},"73":{"P5":13.4,"P85":16.84,"P95":17.88},"74":{"P5":13.41,"P85":16.86,"P95":17.91},"75":{"P5":13.41,"P85":16.88,"P95":17.94},"76":{"P5":13.42,"P85":16.9,"P95":17.97},"77":{"P5":13.43,"P85":16.92,"P95":18.0},"78":{"P5":13.44,"P85":16.95,"P95":18.04},"79":{"P5":13.45,"P85":16.97,"P95":18.07},"80":{"P5":13.46,"P85":17.0,"P95":18.11},"81":{"P5":13.47,"P85":17.03,"P95":18.15},"82":{"P5":13.48,"P85":17.05,"P95":18.18},"83":{"P5":13.49,"P85":17.08,"P95":18.22},"84":{"P5":13.5,"P85":17.11,"P95":18.26},"85":{"P5":13.52,"P85":17.14,"P95":18.3},"86":{"P5":13.53,"P85":17.17,"P95":18.34},"87":{"P5":13.54,"P85":17.2,"P95":18.39},"88":{"P5":13.55,"P85":17.23,"P95":18.43},"89":{"P5":13.57,"P85":17.26,"P95":18.47},"90":{"P5":13.58,"P85":17.3,"P95":18.52},"91":{"P5":13.59,"P85":17.33,"P95":18.56},"92":{"P5":13.61,"P85":17.36,"P95":18.61},"93":{"P5":13.62,"P85":17.4,"P95":18.66},"94":{"P5":13.64,"P85":17.43,"P95":18.7},"95":{"P5":13.65,"P85":17.47,"P95":18.75},"96":{"P5":13.67,"P85":17.51,"P95":18.8},"97":{"P5":13.68,"P85":17.54,"P95":18.85},"98":{"P5":13.7,"P85":17.58,"P95":18.9},"99":{"P5":13.71,"P85":17.62,"P95":18.96},"100":{"P5":13.73,"P85":17.66,"P95":19.01},"101":{"P5":13.74,"P85":17.7,"P95":19.06},"102":{"P5":13.76,"P85":17.74,"P95":19.12},"103":{"P5":13.78,"P85":17.78,"P95":19.17},"104":{"P5":13.79,"P85":17.82,"P95":19.23},"105":{"P5":13.81,"P85":17.86,"P95":19.28},"106":{"P5":13.83,"P85":17.9,"P95":19.34},"107":{"P5":13.85,"P85":17.94,"P95":19.4},"108":{"P5":13.87,"P85":17.99,"P95":19.45},"109":{"P5":13.88,"P85":18.03,"P95":19.51},"110":{"P5":13.9,"P85":18.07,"P95":19.57},"111":{"P5":13.92,"P85":18.12,"P95":19.63},"112":{"P5":13.94,"P85":18.17,"P95":19.7},"113":{"P5":13.96,"P85":18.21,"P95":19.76},"114":{"P5":13.99,"P85":18.26,"P95":19.82},"115":{"P5":14.01,"P85":18.31,"P95":19.89},"116":{"P5":14.03,"P85":18.36,"P95":19.95},"117":{"P5":14.05,"P85":18.41,"P95":20.02},"118":{"P5":14.08,"P85":18.46,"P95":20.09},"119":{"P5":14.1,"P85":18.51,"P95":20.16},"120":{"P5":14.13,"P85":18.57,"P95":20.23},"121":{"P5":14.15,"P85":18.62,"P95":20.29},"122":{"P5":14.18,"P85":18.67,"P95":20.37},"123":{"P5":14.2,"P85":18.73,"P95":20.44},"124":{"P5":14.23,"P85":18.79,"P95":20.51},"125":{"P5":14.26,"P85":18.84,"P95":20.58},"126":{"P5":14.29,"P85":18.9,"P95":20.66},"127":{"P5":14.32,"P85":18.96,"P95":20.73},"128":{"P5":14.35,"P85":19.02,"P95":20.81},"129":{"P5":14.38,"P85":19.08,"P95":20.88},"130":{"P5":14.41,"P85":19.14,"P95":20.96},"131":{"P5":14.44,"P85":19.2,"P95":21.04},"132":{"P5":14.47,"P85":19.26,"P95":21.11},"133":{"P5":14.5,"P85":19.32,"P95":21.19},"134":{"P5":14.53,"P85":19.38,"P95":21.27},"135":{"P5":14.57,"P85":19.45,"P95":21.35},"136":{"P5":14.6,"P85":19.51,"P95":21.43},"137":{"P5":14.63,"P85":19.58,"P95":21.51},"138":{"P5":14.67,"P85":19.64,"P95":21.59},"139":{"P5":14.7,"P85":19.71,"P95":21.67},"140":{"P5":14.74,"P85":19.78,"P95":21.76},"141":{"P5":14.78,"P85":19.84,"P95":21.84},"142":{"P5":14.81,"P85":19.91,"P95":21.92},"143":{"P5":14.85,"P85":19.98,"P95":22.01},"144":{"P5":14.89,"P85":20.05,"P95":22.09},"145":{"P5":14.93,"P85":20.12,"P95":22.18},"146":{"P5":14.97,"P85":20.19,"P95":22.26},"147":{"P5":15.01,"P85":20.26,"P95":22.35},"148":{"P5":15.05,"P85":20.34,"P95":22.43},"149":{"P5":15.09,"P85":20.41,"P95":22.52},"150":{"P5":15.14,"P85":20.48,"P95":22.61},"151":{"P5":15.18,"P85":20.56,"P95":22.7},"152":{"P5":15.22,"P85":20.63,"P95":22.79},"153":{"P5":15.27,"P85":20.71,"P95":22.87},"154":{"P5":15.31,"P85":20.79,"P95":22.96},"155":{"P5":15.36,"P85":20.86,"P95":23.05},"156":{"P5":15.4,"P85":20.94,"P95":23.14},"157":{"P5":15.45,"P85":21.02,"P95":23.23},"158":{"P5":15.5,"P85":21.1,"P95":23.32},"159":{"P5":15.54,"P85":21.18,"P95":23.42},"160":{"P5":15.59,"P85":21.26,"P95":23.51},"161":{"P5":15.64,"P85":21.33,"P95":23.6},"162":{"P5":15.69,"P85":21.41,"P95":23.69},"163":{"P5":15.73,"P85":21.49,"P95":23.78},"164":{"P5":15.78,"P85":21.57,"P95":23.87},"165":{"P5":15.83,"P85":21.65,"P95":23.96},"166":{"P5":15.88,"P85":21.73,"P95":24.04},"167":{"P5":15.93,"P85":21.81,"P95":24.13},"168":{"P5":15.98,"P85":21.89,"P95":24.22},"169":{"P5":16.02,"P85":21.97,"P95":24.31},"170":{"P5":16.07,"P85":22.05,"P95":24.4},"171":{"P5":16.12,"P85":22.13,"P95":24.48},"172":{"P5":16.17,"P85":22.2,"P95":24.57},"173":{"P5":16.22,"P85":22.28,"P95":24.65},"174":{"P5":16.26,"P85":22.36,"P95":24.74},"175":{"P5":16.31,"P85":22.43,"P95":24.82},"176":{"P5":16.36,"P85":22.51,"P95":24.91},"177":{"P5":16.41,"P85":22.59,"P95":24.99},"178":{"P5":16.45,"P85":22.66,"P95":25.07},"179":{"P5":16.5,"P85":22.74,"P95":25.15},"180":{"P5":16.55,"P85":22.81,"P95":25.23},"181":{"P5":16.59,"P85":22.88,"P95":25.31},"182":{"P5":16.64,"P85":22.96,"P95":25.39},"183":{"P5":16.68,"P85":23.03,"P95":25.47},"184":{"P5":16.73,"P85":23.1,"P95":25.54},"185":{"P5":16.77,"P85":23.17,"P95":25.62},"186":{"P5":16.82,"P85":23.24,"P95":25.69},"187":{"P5":16.86,"P85":23.31,"P95":25.77},"188":{"P5":16.91,"P85":23.38,"P95":25.84},"189":{"P5":16.95,"P85":23.45,"P95":25.91},"190":{"P5":16.99,"P85":23.52,"P95":25.99},"191":{"P5":17.04,"P85":23.59,"P95":26.06},"192":{"P5":17.08,"P85":23.65,"P95":26.13},"193":{"P5":17.12,"P85":23.72,"P95":26.2},"194":{"P5":17.16,"P85":23.79,"P95":26.26},"195":{"P5":17.2,"P85":23.85,"P95":26.33},"196":{"P5":17.24,"P85":23.91,"P95":26.4},"197":{"P5":17.28,"P85":23.98,"P95":26.46},"198":{"P5":17.32,"P85":24.04,"P95":26.53},"199":{"P5":17.36,"P85":24.1,"P95":26.59},"200":{"P5":17.4,"P85":24.16,"P95":26.65},"201":{"P5":17.43,"P85":24.22,"P95":26.72},"202":{"P5":17.47,"P85":24.28,"P95":26.78},"203":{"P5":17.51,"P85":24.34,"P95":26.84},"204":{"P5":17.54,"P85":24.4,"P95":26.9},"205":{"P5":17.58,"P85":24.46,"P95":26.96},"206":{"P5":17.61,"P85":24.52,"P95":27.01},"207":{"P5":17.65,"P85":24.57,"P95":27.07},"208":{"P5":17.68,"P85":24.63,"P95":27.12},"209":{"P5":17.71,"P85":24.68,"P95":27.18},"210":{"P5":17.75,"P85":24.74,"P95":27.23},"211":{"P5":17.78,"P85":24.79,"P95":27.29},"212":{"P5":17.81,"P85":24.84,"P95":27.34},"213":{"P5":17.84,"P85":24.89,"P95":27.39},"214":{"P5":17.87,"P85":24.94,"P95":27.44},"215":{"P5":17.9,"P85":24.99,"P95":27.49},"216":{"P5":17.93,"P85":25.04,"P95":27.54},"217":{"P5":17.96,"P85":25.09,"P95":27.59},"218":{"P5":17.99,"P85":25.14,"P95":27.63},"219":{"P5":18.02,"P85":25.19,"P95":27.68},"220":{"P5":18.04,"P85":25.24,"P95":27.73},"221":{"P5":18.07,"P85":25.28,"P95":27.77},"222":{"P5":18.1,"P85":25.33,"P95":27.81},"223":{"P5":18.12,"P85":25.37,"P95":27.86},"224":{"P5":18.15,"P85":25.41,"P95":27.9},"225":{"P5":18.17,"P85":25.46,"P95":27.94},"226":{"P5":18.19,"P85":25.5,"P95":27.98},"227":{"P5":18.22,"P85":25.54,"P95":28.02},"228":{"P5":18.24,"P85":25.58,"P95":28.06}},"girls":{"24":{"P5":13.72,"P85":17.16,"P95":18.13},"25":{"P5":13.7,"P85":17.13,"P95":18.1},"26":{"P5":13.67,"P85":17.1,"P95":18.07},"27":{"P5":13.65,"P85":17.07,"P95":18.03},"28":{"P5":13.63,"P85":17.04,"P95":18.0},"29":{"P5":13.61,"P85":17.01,"P95":17.97},"30":{"P5":13.58,"P85":16.99,"P95":17.95},"31":{"P5":13.56,"P85":16.96,"P95":17.92},"32":{"P5":13.54,"P85":16.94,"P95":17.89},"33":{"P5":13.52,"P85":16.91,"P95":17.87},"34":{"P5":13.5,"P85":16.89,"P95":17.85},"35":{"P5":13.47,"P85":16.87,"P95":17.84},"36":{"P5":13.45,"P85":16.86,"P95":17.82},"37":{"P5":13.43,"P85":16.85,"P95":17.81},"38":{"P5":13.41,"P85":16.84,"P95":17.81},"39":{"P5":13.39,"P85":16.83,"P95":17.81},"40":{"P5":13.36,"P85":16.82,"P95":17.81},"41":{"P5":13.34,"P85":16.82,"P95":17.81},"42":{"P5":13.32,"P85":16.82,"P95":17.81},"43":{"P5":13.3,"P85":16.82,"P95":17.82},"44":{"P5":13.28,"P85":16.82,"P95":17.83},"45":{"P5":13.26,"P85":16.82,"P95":17.83},"46":{"P5":13.24,"P85":16.82,"P95":17.84},"47":{"P5":13.22,"P85":16.82,"P95":17.85},"48":{"P5":13.2,"P85":16.83,"P95":17.87},"49":{"P5":13.19,"P85":16.83,"P95":17.88},"50":{"P5":13.17,"P85":16.84,"P95":17.9},"51":{"P5":13.16,"P85":16.85,"P95":17.91},"52":{"P5":13.15,"P85":16.86,"P95":17.93},"53":{"P5":13.14,"P85":16.87,"P95":17.95},"54":{"P5":13.13,"P85":16.88,"P95":17.97},"55":{"P5":13.12,"P85":16.89,"P95":17.99},"56":{"P5":13.11,"P85":16.91,"P95":18.01},"57":{"P5":13.11,"P85":16.92,"P95":18.03},"58":{"P5":13.1,"P85":16.93,"P95":18.05},"59":{"P5":13.1,"P85":16.94,"P95":18.07},"60":{"P5":13.09,"P85":16.96,"P95":18.08},"61":{"P5":13.13,"P85":16.93,"P95":18.1},"62":{"P5":13.13,"P85":16.94,"P95":18.12},"63":{"P5":13.12,"P85":16.95,"P95":18.14},"64":{"P5":13.11,"P85":16.97,"P95":18.17},"65":{"P5":13.11,"P85":16.98,"P95":18.19},"66":{"P5":13.1,"P85":16.99,"P95":18.21},"67":{"P5":13.1,"P85":17.0,"P95":18.24},"68":{"P5":13.1,"P85":17.02,"P95":18.26},"69":{"P5":13.09,"P85":17.03,"P95":18.29},"70":{"P5":13.09,"P85":17.05,"P95":18.32},"71":{"P5":13.09,"P85":17.06,"P95":18.34},"72":{"P5":13.09,"P85":17.08,"P95":18.37},"73":{"P5":13.09,"P85":17.1,"P95":18.4},"74":{"P5":13.09,"P85":17.12,"P95":18.43},"75":{"P5":13.09,"P85":17.14,"P95":18.47},"76":{"P5":13.09,"P85":17.16,"P95":18.5},"77":{"P5":13.09,"P85":17.18,"P95":18.53},"78":{"P5":13.1,"P85":17.2,"P95":18.57},"79":{"P5":13.1,"P85":17.23,"P95":18.61},"80":{"P5":13.1,"P85":17.25,"P95":18.65},"81":{"P5":13.11,"P85":17.28,"P95":18.69},"82":{"P5":13.12,"P85":17.31,"P95":18.73},"83":{"P5":13.12,"P85":17.34,"P95":18.77},"84":{"P5":13.13,"P85":17.37,"P95":18.81},"85":{"P5":13.14,"P85":17.4,"P95":18.86},"86":{"P5":13.15,"P85":17.43,"P95":18.9},"87":{"P5":13.16,"P85":17.46,"P95":18.95},"88":{"P5":13.17,"P85":17.5,"P95":19.0},"89":{"P5":13.18,"P85":17.53,"P95":19.05},"90":{"P5":13.2,"P85":17.57,"P95":19.1},"91":{"P5":13.21,"P85":17.61,"P95":19.15},"92":{"P5":13.23,"P85":17.65,"P95":19.21},"93":{"P5":13.24,"P85":17.69,"P95":19.26},"94":{"P5":13.26,"P85":17.73,"P95":19.32},"95":{"P5":13.27,"P85":17.77,"P95":19.38},"96":{"P5":13.29,"P85":17.82,"P95":19.44},"97":{"P5":13.31,"P85":17.86,"P95":19.5},"98":{"P5":13.33,"P85":17.91,"P95":19.56},"99":{"P5":13.35,"P85":17.95,"P95":19.62},"100":{"P5":13.37,"P85":18.0,"P95":19.69},"101":{"P5":13.39,"P85":18.05,"P95":19.75},"102":{"P5":13.42,"P85":18.1,"P95":19.82},"103":{"P5":13.44,"P85":18.15,"P95":19.89},"104":{"P5":13.46,"P85":18.21,"P95":19.95},"105":{"P5":13.49,"P85":18.26,"P95":20.02},"106":{"P5":13.51,"P85":18.31,"P95":20.09},"107":{"P5":13.54,"P85":18.37,"P95":20.16},"108":{"P5":13.57,"P85":18.42,"P95":20.23},"109":{"P5":13.59,"P85":18.48,"P95":20.31},"110":{"P5":13.62,"P85":18.53,"P95":20.38},"111":{"P5":13.65,"P85":18.59,"P95":20.45},"112":{"P5":13.67,"P85":18.65,"P95":20.52},"113":{"P5":13.7,"P85":18.71,"P95":20.6},"114":{"P5":13.73,"P85":18.77,"P95":20.67},"115":{"P5":13.76,"P85":18.83,"P95":20.75},"116":{"P5":13.79,"P85":18.89,"P95":20.83},"117":{"P5":13.82,"P85":18.95,"P95":20.9},"118":{"P5":13.85,"P85":19.01,"P95":20.98},"119":{"P5":13.89,"P85":19.07,"P95":21.06},"120":{"P5":13.92,"P85":19.14,"P95":21.14},"121":{"P5":13.95,"P85":19.2,"P95":21.22},"122":{"P5":13.99,"P85":19.27,"P95":21.3},"123":{"P5":14.02,"P85":19.33,"P95":21.38},"124":{"P5":14.06,"P85":19.4,"P95":21.46},"125":{"P5":14.09,"P85":19.47,"P95":21.55},"126":{"P5":14.13,"P85":19.54,"P95":21.63},"127":{"P5":14.17,"P85":19.61,"P95":21.71},"128":{"P5":14.2,"P85":19.68,"P95":21.8},"129":{"P5":14.24,"P85":19.75,"P95":21.89},"130":{"P5":14.28,"P85":19.82,"P95":21.97},"131":{"P5":14.32,"P85":19.9,"P95":22.06},"132":{"P5":14.36,"P85":19.97,"P95":22.15},"133":{"P5":14.4,"P85":20.05,"P95":22.24},"134":{"P5":14.45,"P85":20.12,"P95":22.33},"135":{"P5":14.49,"P85":20.2,"P95":22.42},"136":{"P5":14.53,"P85":20.28,"P95":22.52},"137":{"P5":14.58,"P85":20.36,"P95":22.61},"138":{"P5":14.62,"P85":20.44,"P95":22.7},"139":{"P5":14.67,"P85":20.52,"P95":22.8},"140":{"P5":14.71,"P85":20.6,"P95":22.89},"141":{"P5":14.76,"P85":20.68,"P95":22.99},"142":{"P5":14.81,"P85":20.76,"P95":23.08},"143":{"P5":14.85,"P85":20.84,"P95":23.18},"144":{"P5":14.9,"P85":20.93,"P95":23.28},"145":{"P5":14.95,"P85":21.01,"P95":23.37},"146":{"P5":15.0,"P85":21.09,"P95":23.47},"147":{"P5":15.05,"P85":21.18,"P95":23.56},"148":{"P5":15.1,"P85":21.26,"P95":23.66},"149":{"P5":15.14,"P85":21.35,"P95":23.76},"150":{"P5":15.19,"P85":21.43,"P95":23.85},"151":{"P5":15.24,"P85":21.51,"P95":23.95},"152":{"P5":15.29,"P85":21.6,"P95":24.04},"153":{"P5":15.34,"P85":21.68,"P95":24.14},"154":{"P5":15.39,"P85":21.76,"P95":24.23},"155":{"P5":15.44,"P85":21.85,"P95":24.33},"156":{"P5":15.48,"P85":21.93,"P95":24.42},"157":{"P5":15.53,"P85":22.01,"P95":24.51},"158":{"P5":15.58,"P85":22.09,"P95":24.61},"159":{"P5":15.63,"P85":22.17,"P95":24.7},"160":{"P5":15.67,"P85":22.25,"P95":24.79},"161":{"P5":15.72,"P85":22.33,"P95":24.88},"162":{"P5":15.77,"P85":22.41,"P95":24.96},"163":{"P5":15.81,"P85":22.49,"P95":25.05},"164":{"P5":15.86,"P85":22.57,"P95":25.14},"165":{"P5":15.9,"P85":22.64,"P95":25.22},"166":{"P5":15.95,"P85":22.72,"P95":25.31},"167":{"P5":15.99,"P85":22.79,"P95":25.39},"168":{"P5":16.03,"P85":22.87,"P95":25.47},"169":{"P5":16.08,"P85":22.94,"P95":25.55},"170":{"P5":16.12,"P85":23.01,"P95":25.63},"171":{"P5":16.16,"P85":23.08,"P95":25.71},"172":{"P5":16.2,"P85":23.15,"P95":25.78},"173":{"P5":16.24,"P85":23.22,"P95":25.86},"174":{"P5":16.28,"P85":23.28,"P95":25.93},"175":{"P5":16.32,"P85":23.35,"P95":26.0},"176":{"P5":16.35,"P85":23.41,"P95":26.07},"177":{"P5":16.39,"P85":23.48,"P95":26.14},"178":{"P5":16.42,"P85":23.54,"P95":26.21},"179":{"P5":16.46,"P85":23.6,"P95":26.27},"180":{"P5":16.49,"P85":23.65,"P95":26.34},"181":{"P5":16.52,"P85":23.71,"P95":26.4},"182":{"P5":16.56,"P85":23.77,"P95":26.46},"183":{"P5":16.59,"P85":23.82,"P95":26.52},"184":{"P5":16.62,"P85":23.87,"P95":26.57},"185":{"P5":16.65,"P85":23.92,"P95":26.63},"186":{"P5":16.67,"P85":23.97,"P95":26.68},"187":{"P5":16.7,"P85":24.02,"P95":26.74},"188":{"P5":16.73,"P85":24.07,"P95":26.79},"189":{"P5":16.75,"P85":24.12,"P95":26.83},"190":{"P5":16.78,"P85":24.16,"P95":26.88},"191":{"P5":16.8,"P85":24.2,"P95":26.93},"192":{"P5":16.82,"P85":24.24,"P95":26.97},"193":{"P5":16.84,"P85":24.29,"P95":27.02},"194":{"P5":16.87,"P85":24.32,"P95":27.06},"195":{"P5":16.89,"P85":24.36,"P95":27.1},"196":{"P5":16.9,"P85":24.4,"P95":27.13},"197":{"P5":16.92,"P85":24.43,"P95":27.17},"198":{"P5":16.94,"P85":24.47,"P95":27.21},"199":{"P5":16.96,"P85":24.5,"P95":27.24},"200":{"P5":16.97,"P85":24.53,"P95":27.27},"201":{"P5":16.99,"P85":24.56,"P95":27.31},"202":{"P5":17.0,"P85":24.59,"P95":27.34},"203":{"P5":17.02,"P85":24.62,"P95":27.37},"204":{"P5":17.03,"P85":24.65,"P95":27.39},"205":{"P5":17.04,"P85":24.68,"P95":27.42},"206":{"P5":17.06,"P85":24.7,"P95":27.45},"207":{"P5":17.07,"P85":24.73,"P95":27.47},"208":{"P5":17.08,"P85":24.75,"P95":27.49},"209":{"P5":17.09,"P85":24.77,"P95":27.52},"210":{"P5":17.1,"P85":24.79,"P95":27.54},"211":{"P5":17.11,"P85":24.82,"P95":27.56},"212":{"P5":17.12,"P85":24.84,"P95":27.58},"213":{"P5":17.12,"P85":24.86,"P95":27.6},"214":{"P5":17.13,"P85":24.88,"P95":27.62},"215":{"P5":17.14,"P85":24.9,"P95":27.64},"216":{"P5":17.15,"P85":24.92,"P95":27.65},"217":{"P5":17.16,"P85":24.93,"P95":27.67},"218":{"P5":17.16,"P85":24.95,"P95":27.69},"219":{"P5":17.17,"P85":24.97,"P95":27.7},"220":{"P5":17.18,"P85":24.99,"P95":27.72},"221":{"P5":17.18,"P85":25.0,"P95":27.74},"222":{"P5":17.19,"P85":25.02,"P95":27.75},"223":{"P5":17.19,"P85":25.04,"P95":27.77},"224":{"P5":17.2,"P85":25.05,"P95":27.78},"225":{"P5":17.2,"P85":25.07,"P95":27.79},"226":{"P5":17.21,"P85":25.08,"P95":27.81},"227":{"P5":17.21,"P85":25.1,"P95":27.82},"228":{"P5":17.22,"P85":25.11,"P95":27.83}}};

/* === ŹRÓDŁO DANYCH BMI ============================================= */
let bmiSource = 'OLAF';            // 'OLAF' (domyślnie) lub 'WHO'
/* =================================================================== */
/* === BMI Percentile Enhancement === */
const LMS_BOYS={"24":[-0.6187,16.0189,0.07785],"25":[-0.584,15.98,0.07792],"26":[-0.5497,15.9414,0.078],"27":[-0.5166,15.9036,0.07808],"28":[-0.485,15.8667,0.07818],"29":[-0.4552,15.8306,0.07829],"30":[-0.4274,15.7953,0.07841],"31":[-0.4016,15.7606,0.07854],"32":[-0.3782,15.7267,0.07867],"33":[-0.3572,15.6934,0.07882],"34":[-0.3388,15.661,0.07897],"35":[-0.3231,15.6294,0.07914],"36":[-0.3101,15.5988,0.07931],"37":[-0.3,15.5693,0.0795],"38":[-0.2927,15.541,0.07969],"39":[-0.2884,15.514,0.0799],"40":[-0.2869,15.4885,0.08012],"41":[-0.2881,15.4645,0.08036],"42":[-0.2919,15.442,0.08061],"43":[-0.2981,15.421,0.08087],"44":[-0.3067,15.4013,0.08115],"45":[-0.3174,15.3827,0.08144],"46":[-0.3303,15.3652,0.08174],"47":[-0.3452,15.3485,0.08205],"48":[-0.3622,15.3326,0.08238],"49":[-0.3811,15.3174,0.08272],"50":[-0.4019,15.3029,0.08307],"51":[-0.4245,15.2891,0.08343],"52":[-0.4488,15.2759,0.0838],"53":[-0.4747,15.2633,0.08418],"54":[-0.5019,15.2514,0.08457],"55":[-0.5303,15.24,0.08496],"56":[-0.5599,15.2291,0.08536],"57":[-0.5905,15.2188,0.08577],"58":[-0.6223,15.2091,0.08617],"59":[-0.6552,15.2,0.08659],"60":[-0.6892,15.1916,0.087],"61":[-0.7387,15.2641,0.0839],"62":[-0.7621,15.2616,0.08414],"63":[-0.7856,15.2604,0.08439],"64":[-0.8089,15.2605,0.08464],"65":[-0.8322,15.2619,0.0849],"66":[-0.8554,15.2645,0.08516],"67":[-0.8785,15.2684,0.08543],"68":[-0.9015,15.2737,0.0857],"69":[-0.9243,15.2801,0.08597],"70":[-0.9471,15.2877,0.08625],"71":[-0.9697,15.2965,0.08653],"72":[-0.9921,15.3062,0.08682],"73":[-1.0144,15.3169,0.08711],"74":[-1.0365,15.3285,0.08741],"75":[-1.0584,15.3408,0.08771],"76":[-1.0801,15.354,0.08802],"77":[-1.1017,15.3679,0.08833],"78":[-1.123,15.3825,0.08865],"79":[-1.1441,15.3978,0.08898],"80":[-1.1649,15.4137,0.08931],"81":[-1.1856,15.4302,0.08964],"82":[-1.206,15.4473,0.08998],"83":[-1.2261,15.465,0.09033],"84":[-1.246,15.4832,0.09068],"85":[-1.2656,15.5019,0.09103],"86":[-1.2849,15.521,0.09139],"87":[-1.304,15.5407,0.09176],"88":[-1.3228,15.5608,0.09213],"89":[-1.3414,15.5814,0.09251],"90":[-1.3596,15.6023,0.09289],"91":[-1.3776,15.6237,0.09327],"92":[-1.3953,15.6455,0.09366],"93":[-1.4126,15.6677,0.09406],"94":[-1.4297,15.6903,0.09445],"95":[-1.4464,15.7133,0.09486],"96":[-1.4629,15.7368,0.09526],"97":[-1.479,15.7606,0.09567],"98":[-1.4947,15.7848,0.09609],"99":[-1.5101,15.8094,0.09651],"100":[-1.5252,15.8344,0.09693],"101":[-1.5399,15.8597,0.09735],"102":[-1.5542,15.8855,0.09778],"103":[-1.5681,15.9116,0.09821],"104":[-1.5817,15.9381,0.09864],"105":[-1.5948,15.9651,0.09907],"106":[-1.6076,15.9925,0.09951],"107":[-1.6199,16.0205,0.09994],"108":[-1.6318,16.049,0.10038],"109":[-1.6433,16.0781,0.10082],"110":[-1.6544,16.1078,0.10126],"111":[-1.6651,16.1381,0.1017],"112":[-1.6753,16.1692,0.10214],"113":[-1.6851,16.2009,0.10259],"114":[-1.6944,16.2333,0.10303],"115":[-1.7032,16.2665,0.10347],"116":[-1.7116,16.3004,0.10391],"117":[-1.7196,16.3351,0.10435],"118":[-1.7271,16.3704,0.10478],"119":[-1.7341,16.4065,0.10522],"120":[-1.7407,16.4433,0.10566],"121":[-1.7468,16.4807,0.10609],"122":[-1.7525,16.5189,0.10652],"123":[-1.7578,16.5578,0.10695],"124":[-1.7626,16.5974,0.10738],"125":[-1.767,16.6376,0.1078],"126":[-1.771,16.6786,0.10823],"127":[-1.7745,16.7203,0.10865],"128":[-1.7777,16.7628,0.10906],"129":[-1.7804,16.8059,0.10948],"130":[-1.7828,16.8497,0.10989],"131":[-1.7847,16.8941,0.1103],"132":[-1.7862,16.9392,0.1107],"133":[-1.7873,16.985,0.1111],"134":[-1.7881,17.0314,0.1115],"135":[-1.7884,17.0784,0.11189],"136":[-1.7884,17.1262,0.11228],"137":[-1.788,17.1746,0.11266],"138":[-1.7873,17.2236,0.11304],"139":[-1.7861,17.2734,0.11342],"140":[-1.7846,17.324,0.11379],"141":[-1.7828,17.3752,0.11415],"142":[-1.7806,17.4272,0.11451],"143":[-1.778,17.4799,0.11487],"144":[-1.7751,17.5334,0.11522],"145":[-1.7719,17.5877,0.11556],"146":[-1.7684,17.6427,0.1159],"147":[-1.7645,17.6985,0.11623],"148":[-1.7604,17.7551,0.11656],"149":[-1.7559,17.8124,0.11688],"150":[-1.7511,17.8704,0.1172],"151":[-1.7461,17.9292,0.11751],"152":[-1.7408,17.9887,0.11781],"153":[-1.7352,18.0488,0.11811],"154":[-1.7293,18.1096,0.11841],"155":[-1.7232,18.171,0.11869],"156":[-1.7168,18.233,0.11898],"157":[-1.7102,18.2955,0.11925],"158":[-1.7033,18.3586,0.11952],"159":[-1.6962,18.4221,0.11979],"160":[-1.6888,18.486,0.12005],"161":[-1.6811,18.5502,0.1203],"162":[-1.6732,18.6148,0.12055],"163":[-1.6651,18.6795,0.12079],"164":[-1.6568,18.7445,0.12102],"165":[-1.6482,18.8095,0.12125],"166":[-1.6394,18.8746,0.12148],"167":[-1.6304,18.9398,0.1217],"168":[-1.6211,19.005,0.12191],"169":[-1.6116,19.0701,0.12212],"170":[-1.602,19.1351,0.12233],"171":[-1.5921,19.2,0.12253],"172":[-1.5821,19.2648,0.12272],"173":[-1.5719,19.3294,0.12291],"174":[-1.5615,19.3937,0.1231],"175":[-1.551,19.4578,0.12328],"176":[-1.5403,19.5217,0.12346],"177":[-1.5294,19.5853,0.12363],"178":[-1.5185,19.6486,0.1238],"179":[-1.5074,19.7117,0.12396],"180":[-1.4961,19.7744,0.12412],"181":[-1.4848,19.8367,0.12428],"182":[-1.4733,19.8987,0.12443],"183":[-1.4617,19.9603,0.12458],"184":[-1.45,20.0215,0.12473],"185":[-1.4382,20.0823,0.12487],"186":[-1.4263,20.1427,0.12501],"187":[-1.4143,20.2026,0.12514],"188":[-1.4022,20.2621,0.12528],"189":[-1.39,20.3211,0.12541],"190":[-1.3777,20.3796,0.12554],"191":[-1.3653,20.4376,0.12567],"192":[-1.3529,20.4951,0.12579],"193":[-1.3403,20.5521,0.12591],"194":[-1.3277,20.6085,0.12603],"195":[-1.3149,20.6644,0.12615],"196":[-1.3021,20.7197,0.12627],"197":[-1.2892,20.7745,0.12638],"198":[-1.2762,20.8287,0.1265],"199":[-1.2631,20.8824,0.12661],"200":[-1.2499,20.9355,0.12672],"201":[-1.2366,20.9881,0.12683],"202":[-1.2233,21.04,0.12694],"203":[-1.2098,21.0914,0.12704],"204":[-1.1962,21.1423,0.12715],"205":[-1.1826,21.1925,0.12726],"206":[-1.1688,21.2423,0.12736],"207":[-1.155,21.2914,0.12746],"208":[-1.141,21.34,0.12756],"209":[-1.127,21.388,0.12767],"210":[-1.1129,21.4354,0.12777],"211":[-1.0986,21.4822,0.12787],"212":[-1.0843,21.5285,0.12797],"213":[-1.0699,21.5742,0.12807],"214":[-1.0553,21.6193,0.12816],"215":[-1.0407,21.6638,0.12826],"216":[-1.026,21.7077,0.12836],"217":[-1.0112,21.751,0.12845],"218":[-0.9962,21.7937,0.12855],"219":[-0.9812,21.8358,0.12864],"220":[-0.9661,21.8773,0.12874],"221":[-0.9509,21.9182,0.12883],"222":[-0.9356,21.9585,0.12893],"223":[-0.9202,21.9982,0.12902],"224":[-0.9048,22.0374,0.12911],"225":[-0.8892,22.076,0.1292],"226":[-0.8735,22.114,0.1293],"227":[-0.8578,22.1514,0.12939],"228":[-0.8419,22.1883,0.12948]};
const LMS_GIRLS={"24":[-0.5684,15.6881,0.08454],"25":[-0.5684,15.659,0.08452],"26":[-0.5684,15.6308,0.08449],"27":[-0.5684,15.6037,0.08446],"28":[-0.5684,15.5777,0.08444],"29":[-0.5684,15.5523,0.08443],"30":[-0.5684,15.5276,0.08444],"31":[-0.5684,15.5034,0.08448],"32":[-0.5684,15.4798,0.08455],"33":[-0.5684,15.4572,0.08467],"34":[-0.5684,15.4356,0.08484],"35":[-0.5684,15.4155,0.08506],"36":[-0.5684,15.3968,0.08535],"37":[-0.5684,15.3796,0.08569],"38":[-0.5684,15.3638,0.08609],"39":[-0.5684,15.3493,0.08654],"40":[-0.5684,15.3358,0.08704],"41":[-0.5684,15.3233,0.08757],"42":[-0.5684,15.3116,0.08813],"43":[-0.5684,15.3007,0.08872],"44":[-0.5684,15.2905,0.08931],"45":[-0.5684,15.2814,0.08991],"46":[-0.5684,15.2732,0.09051],"47":[-0.5684,15.2661,0.0911],"48":[-0.5684,15.2602,0.09168],"49":[-0.5684,15.2556,0.09227],"50":[-0.5684,15.2523,0.09286],"51":[-0.5684,15.2503,0.09345],"52":[-0.5684,15.2496,0.09403],"53":[-0.5684,15.2502,0.0946],"54":[-0.5684,15.2519,0.09515],"55":[-0.5684,15.2544,0.09568],"56":[-0.5684,15.2575,0.09618],"57":[-0.5684,15.2612,0.09665],"58":[-0.5684,15.2653,0.09709],"59":[-0.5684,15.2698,0.0975],"60":[-0.5684,15.2747,0.09789],"61":[-0.8886,15.2441,0.09692],"62":[-0.9068,15.2434,0.09738],"63":[-0.9248,15.2433,0.09783],"64":[-0.9427,15.2438,0.09829],"65":[-0.9605,15.2448,0.09875],"66":[-0.978,15.2464,0.0992],"67":[-0.9954,15.2487,0.09966],"68":[-1.0126,15.2516,0.10012],"69":[-1.0296,15.2551,0.10058],"70":[-1.0464,15.2592,0.10104],"71":[-1.063,15.2641,0.10149],"72":[-1.0794,15.2697,0.10195],"73":[-1.0956,15.276,0.10241],"74":[-1.1115,15.2831,0.10287],"75":[-1.1272,15.2911,0.10333],"76":[-1.1427,15.2998,0.10379],"77":[-1.1579,15.3095,0.10425],"78":[-1.1728,15.32,0.10471],"79":[-1.1875,15.3314,0.10517],"80":[-1.2019,15.3439,0.10562],"81":[-1.216,15.3572,0.10608],"82":[-1.2298,15.3717,0.10654],"83":[-1.2433,15.3871,0.107],"84":[-1.2565,15.4036,0.10746],"85":[-1.2693,15.4211,0.10792],"86":[-1.2819,15.4397,0.10837],"87":[-1.2941,15.4593,0.10883],"88":[-1.306,15.4798,0.10929],"89":[-1.3175,15.5014,0.10974],"90":[-1.3287,15.524,0.1102],"91":[-1.3395,15.5476,0.11065],"92":[-1.3499,15.5723,0.1111],"93":[-1.36,15.5979,0.11156],"94":[-1.3697,15.6246,0.11201],"95":[-1.379,15.6523,0.11246],"96":[-1.388,15.681,0.11291],"97":[-1.3966,15.7107,0.11335],"98":[-1.4047,15.7415,0.1138],"99":[-1.4125,15.7732,0.11424],"100":[-1.4199,15.8058,0.11469],"101":[-1.427,15.8394,0.11513],"102":[-1.4336,15.8738,0.11557],"103":[-1.4398,15.909,0.11601],"104":[-1.4456,15.9451,0.11644],"105":[-1.4511,15.9818,0.11688],"106":[-1.4561,16.0194,0.11731],"107":[-1.4607,16.0575,0.11774],"108":[-1.465,16.0964,0.11816],"109":[-1.4688,16.1358,0.11859],"110":[-1.4723,16.1759,0.11901],"111":[-1.4753,16.2166,0.11943],"112":[-1.478,16.258,0.11985],"113":[-1.4803,16.2999,0.12026],"114":[-1.4823,16.3425,0.12067],"115":[-1.4838,16.3858,0.12108],"116":[-1.485,16.4298,0.12148],"117":[-1.4859,16.4746,0.12188],"118":[-1.4864,16.52,0.12228],"119":[-1.4866,16.5663,0.12268],"120":[-1.4864,16.6133,0.12307],"121":[-1.4859,16.6612,0.12346],"122":[-1.4851,16.71,0.12384],"123":[-1.4839,16.7595,0.12422],"124":[-1.4825,16.81,0.1246],"125":[-1.4807,16.8614,0.12497],"126":[-1.4787,16.9136,0.12534],"127":[-1.4763,16.9667,0.12571],"128":[-1.4737,17.0208,0.12607],"129":[-1.4708,17.0757,0.12643],"130":[-1.4677,17.1316,0.12678],"131":[-1.4642,17.1883,0.12713],"132":[-1.4606,17.2459,0.12748],"133":[-1.4567,17.3044,0.12782],"134":[-1.4526,17.3637,0.12816],"135":[-1.4482,17.4238,0.12849],"136":[-1.4436,17.4847,0.12882],"137":[-1.4389,17.5464,0.12914],"138":[-1.4339,17.6088,0.12946],"139":[-1.4288,17.6719,0.12978],"140":[-1.4235,17.7357,0.13009],"141":[-1.418,17.8001,0.1304],"142":[-1.4123,17.8651,0.1307],"143":[-1.4065,17.9306,0.13099],"144":[-1.4006,17.9966,0.13129],"145":[-1.3945,18.063,0.13158],"146":[-1.3883,18.1297,0.13186],"147":[-1.3819,18.1967,0.13214],"148":[-1.3755,18.2639,0.13241],"149":[-1.3689,18.3312,0.13268],"150":[-1.3621,18.3986,0.13295],"151":[-1.3553,18.466,0.13321],"152":[-1.3483,18.5333,0.13347],"153":[-1.3413,18.6006,0.13372],"154":[-1.3341,18.6677,0.13397],"155":[-1.3269,18.7346,0.13421],"156":[-1.3195,18.8012,0.13445],"157":[-1.3121,18.8675,0.13469],"158":[-1.3046,18.9335,0.13492],"159":[-1.297,18.9991,0.13514],"160":[-1.2894,19.0642,0.13537],"161":[-1.2816,19.1289,0.13559],"162":[-1.2739,19.1931,0.1358],"163":[-1.2661,19.2567,0.13601],"164":[-1.2583,19.3197,0.13622],"165":[-1.2504,19.382,0.13642],"166":[-1.2425,19.4437,0.13662],"167":[-1.2345,19.5045,0.13681],"168":[-1.2266,19.5647,0.137],"169":[-1.2186,19.624,0.13719],"170":[-1.2107,19.6824,0.13738],"171":[-1.2027,19.74,0.13756],"172":[-1.1947,19.7966,0.13774],"173":[-1.1867,19.8523,0.13791],"174":[-1.1788,19.907,0.13808],"175":[-1.1708,19.9607,0.13825],"176":[-1.1629,20.0133,0.13841],"177":[-1.1549,20.0648,0.13858],"178":[-1.147,20.1152,0.13873],"179":[-1.139,20.1644,0.13889],"180":[-1.1311,20.2125,0.13904],"181":[-1.1232,20.2595,0.1392],"182":[-1.1153,20.3053,0.13934],"183":[-1.1074,20.3499,0.13949],"184":[-1.0996,20.3934,0.13963],"185":[-1.0917,20.4357,0.13977],"186":[-1.0838,20.4769,0.13991],"187":[-1.076,20.517,0.14005],"188":[-1.0681,20.556,0.14018],"189":[-1.0603,20.5938,0.14031],"190":[-1.0525,20.6306,0.14044],"191":[-1.0447,20.6663,0.14057],"192":[-1.0368,20.7008,0.1407],"193":[-1.029,20.7344,0.14082],"194":[-1.0212,20.7668,0.14094],"195":[-1.0134,20.7982,0.14106],"196":[-1.0055,20.8286,0.14118],"197":[-0.9977,20.858,0.1413],"198":[-0.9898,20.8863,0.14142],"199":[-0.9819,20.9137,0.14153],"200":[-0.974,20.9401,0.14164],"201":[-0.9661,20.9656,0.14176],"202":[-0.9582,20.9901,0.14187],"203":[-0.9503,21.0138,0.14198],"204":[-0.9423,21.0367,0.14208],"205":[-0.9344,21.0587,0.14219],"206":[-0.9264,21.0801,0.1423],"207":[-0.9184,21.1007,0.1424],"208":[-0.9104,21.1206,0.1425],"209":[-0.9024,21.1399,0.14261],"210":[-0.8944,21.1586,0.14271],"211":[-0.8863,21.1768,0.14281],"212":[-0.8783,21.1944,0.14291],"213":[-0.8703,21.2116,0.14301],"214":[-0.8623,21.2282,0.14311],"215":[-0.8542,21.2444,0.1432],"216":[-0.8462,21.2603,0.1433],"217":[-0.8382,21.2757,0.1434],"218":[-0.8301,21.2908,0.14349],"219":[-0.8221,21.3055,0.14359],"220":[-0.814,21.32,0.14368],"221":[-0.806,21.3341,0.14377],"222":[-0.798,21.348,0.14386],"223":[-0.7899,21.3617,0.14396],"224":[-0.7819,21.3752,0.14405],"225":[-0.7738,21.3884,0.14414],"226":[-0.7658,21.4014,0.14423],"227":[-0.7577,21.4143,0.14432],"228":[-0.7496,21.4269,0.14441]};

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

function bmiPercentileChild(bmi, sex, months) {
  // Jeśli aktywne są dane Palczewskiej, korzystamy z ich siatek centylowych
  if (typeof bmiSource !== 'undefined' && bmiSource === 'PALCZEWSKA') {
    return bmiPercentileChildPal(bmi, sex, months);
  }
  const lms = getLMS(sex, months);
  if(!lms) return null;
  const [L, M, S] = lms;
  const z = (L !== 0) ? (Math.pow(bmi / M, L) - 1) / (L * S) : Math.log(bmi / M) / S;
  return normalCDF(z) * 100;
}

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

/**
 * Aktualizuje widoczność sekcji „Podsumowanie metaboliczne”.
 * Sekcja jest widoczna tylko, gdy użytkownik podał minimalny zestaw danych: wiek, wagę oraz wzrost.
 */
function updateMetabolicSummaryVisibility() {
  const section = document.getElementById('metabolicSummarySection');
  if (!section) return;
  const summaryBtnEl = document.getElementById('metabolicSummaryBtn');
  const dietBtnEl    = document.getElementById('dietRecommendationsBtn');
  // Tryb wyników: sekcja jest dostępna tylko w trybie profesjonalnym
  let proMode = false;
  try {
    if (typeof window !== 'undefined' && typeof window.professionalMode !== 'undefined') {
      proMode = !!window.professionalMode;
    } else if (typeof professionalMode !== 'undefined') {
      proMode = !!professionalMode;
    } else {
      proMode = (readResultsModeStorage() === 'professional');
    }
  } catch (_) {
    proMode = false;
  }
  // Ustawienia widoczności przycisków: każdy przycisk może być wyłączony w ustawieniach
  let showSummarySetting = true;
  let showDietSetting    = true;
  try {
    const persistence = (typeof window !== 'undefined') ? window.VildaPersistence : null;
    const settings = persistence && typeof persistence.readPreferenceJSON === 'function'
      ? persistence.readPreferenceJSON('CARD_VISIBILITY', {})
      : {};
    showSummarySetting = settings['metabolicSummaryBtn'] !== false;
    showDietSetting    = settings['dietRecommendationsBtn'] !== false;
  } catch (_) {
    showSummarySetting = true;
    showDietSetting    = true;
  }
  // Wartości wieku – korzystamy z funkcji getAgeDecimal(), która sumuje lata i miesiące.
  const ageYears = (typeof getAgeDecimal === 'function') ? getAgeDecimal() : 0;
  const weightVal = parseFloat(document.getElementById('weight')?.value);
  const heightVal = parseFloat(document.getElementById('height')?.value);
  const anthroValidation = (typeof vildaGetMainAnthroValidationSnapshot === 'function')
    ? vildaGetMainAnthroValidationSnapshot()
    : null;
  // Minimalny zestaw danych — wiek 0 lat jest legalny, jeśli został jawnie wpisany.
  const hasData = anthroValidation
    ? anthroValidation.complete
    : (vildaIsFiniteNonNegative(ageYears) && vildaIsFinitePositive(weightVal) && vildaIsFinitePositive(heightVal));
  // Czy wyświetlać przycisk podsumowania
  const showSummary = proMode && showSummarySetting && hasData;
  if (summaryBtnEl) {
    summaryBtnEl.style.display = showSummary ? 'block' : 'none';
  }
  // Kontener sekcji wyświetlamy, gdy są spełnione warunki: tryb profesjonalny,
  // minimalne dane oraz co najmniej jeden z przycisków ma być widoczny.
  const showContainer = proMode && hasData && (showSummarySetting || showDietSetting);
  if (showContainer) {
    section.style.display = 'block';
    if (!section.classList.contains('animate-in')) {
      section.classList.add('animate-in');
    }
  } else {
    section.style.display = 'none';
  }
  // Nie zarządzamy tutaj przyciskiem zaleceń dietetycznych – jego widoczność
  // ustala updateDietRecommendationsVisibility(), aby wziąć pod uwagę warunki
  // nadwagi/otyłości oraz ustawienia użytkownika.
}

/**
 * Generuje tekstowy raport „Podsumowanie metaboliczne” na podstawie bieżących danych i wyników obliczeń.
 * Wyniki są umieszczane w oddzielnych liniach. W razie braku konkretnych danych dany element jest pomijany.
 * Funkcja wykorzystuje globalne zmienne i funkcje do ponownego obliczenia centyli wagi, wzrostu i BMI,
 * a także odczytuje wyniki z modułów ciśnienia krwi, obwodów oraz zaawansowanego wzrostu.
 * @returns {string} Tekst podsumowania, gotowy do skopiowania do schowka.
 */
function generateMetabolicSummary() {
  const __perfEnd = vildaPerfStart('P1:generateMetabolicSummary');
  try {
  const lines = [];
  // Odczytaj dane wejściowe
  const weightVal = parseFloat(document.getElementById('weight')?.value);
  const heightVal = parseFloat(document.getElementById('height')?.value);
  const ageYears = (typeof getAgeDecimal === 'function') ? getAgeDecimal() : 0;
  const sexEl = document.getElementById('sex');
  const sexVal = sexEl ? sexEl.value : 'M';
  const isAdultPatient = (typeof patientReportIsAdultAgeForCurrentMode === 'function')
    ? patientReportIsAdultAgeForCurrentMode(ageYears)
    : ((typeof patientReportIsAdultAge === 'function')
      ? patientReportIsAdultAge(ageYears)
      : (isFinite(ageYears) && ageYears >= 18));
  const referenceAgeYears = (typeof patientReportGetReferenceAgeYears === 'function')
    ? patientReportGetReferenceAgeYears(ageYears)
    : ageYears;
  const reportPreferredSource = (typeof patientReportGetPreferredSource === 'function')
    ? patientReportGetPreferredSource()
    : ((typeof bmiSource !== 'undefined' && bmiSource) ? String(bmiSource).toUpperCase() : 'OLAF');
  // Tryb profesjonalny
  const pro = (typeof window !== 'undefined' && window.professionalMode) ? window.professionalMode : false;
  const anthroValidation = (typeof vildaGetMainAnthroValidationSnapshot === 'function')
    ? vildaGetMainAnthroValidationSnapshot()
    : null;

  // Warunki minimalne: waga, wzrost i jawnie podany wiek. Wiek 0 lat jest poprawny.
  if (anthroValidation
    ? anthroValidation.complete
    : (vildaIsFiniteNonNegative(ageYears) && vildaIsFinitePositive(weightVal) && vildaIsFinitePositive(heightVal))) {
    // Oblicz statystyki wagi i wzrostu (percentyl i z-score)
    let statsW, statsH;
    let statsWSource = reportPreferredSource;
    let statsHSource = reportPreferredSource;
    const useAdultReferenceSummary = isAdultPatient
      && typeof advHistoryResolveMetric === 'function'
      && typeof referenceAgeYears === 'number'
      && isFinite(referenceAgeYears)
      && referenceAgeYears > 0;
    const usePal = !useAdultReferenceSummary && (typeof bmiSource !== 'undefined' &&
                   (bmiSource === 'PALCZEWSKA' ||
                    (bmiSource === 'OLAF' && ageYears < OLAF_DATA_MIN_AGE)));
    if (useAdultReferenceSummary) {
      const weightResolved = advHistoryResolveMetric('WT', weightVal, sexVal, referenceAgeYears, reportPreferredSource);
      const heightResolved = advHistoryResolveMetric('HT', heightVal, sexVal, referenceAgeYears, reportPreferredSource);
      statsW = weightResolved && weightResolved.result ? weightResolved.result : null;
      statsH = heightResolved && heightResolved.result ? heightResolved.result : null;
      statsWSource = (weightResolved && weightResolved.source) ? weightResolved.source : reportPreferredSource;
      statsHSource = (heightResolved && heightResolved.source) ? heightResolved.source : reportPreferredSource;
    } else if (usePal) {
      statsW = calcPercentileStatsPal(weightVal, sexVal, ageYears, 'WT');
      statsH = calcPercentileStatsPal(heightVal, sexVal, ageYears, 'HT');
    } else {
      statsW = calcPercentileStats(weightVal, sexVal, ageYears, 'WT');
      statsH = calcPercentileStats(heightVal, sexVal, ageYears, 'HT');
    }
    // Oblicz wartości graniczne 3. i 97. centyla dla wagi i wzrostu.
    // Są one używane do wyświetlania, ile kilogramów lub centymetrów brakuje do 3. centyla
    // oraz o ile dany parametr przekracza 97. centyl. Wartości te zależą od wyboru
    // siatek centylowych (Palczewska/OLAF/WHO) i wieku dziecka.
    let w3, w97, h3, h97;
    const monthsWH = Math.round(ageYears * 12);
    if (statsW && statsH) {
      if (useAdultReferenceSummary && typeof patientReportGetMetricValueAtPercentile === 'function') {
        w3 = patientReportGetMetricValueAtPercentile('WT', sexVal, referenceAgeYears, 3, statsWSource);
        w97 = patientReportGetMetricValueAtPercentile('WT', sexVal, referenceAgeYears, 97, statsWSource);
        h3 = patientReportGetMetricValueAtPercentile('HT', sexVal, referenceAgeYears, 3, statsHSource);
        h97 = patientReportGetMetricValueAtPercentile('HT', sexVal, referenceAgeYears, 97, statsHSource);
      } else if (usePal) {
        // Skorzystaj z siatek Palczewskiej dla granicznych centyli
        w3  = getPalCentile(sexVal, monthsWH, 3, 'WT');
        w97 = getPalCentile(sexVal, monthsWH, 97, 'WT');
        h3  = getPalCentile(sexVal, monthsWH, 3, 'HT');
        h97 = getPalCentile(sexVal, monthsWH, 97, 'HT');
      } else {
        // Użyj funkcji LMS (WHO/OLAF) dla obliczenia wartości granicznych
        const lmsW = getChildLMS(sexVal, ageYears, 'WT');
        if (lmsW) {
          w3 = (lmsW[0] !== 0)
             ? lmsW[1] * Math.pow(1 + lmsW[0] * lmsW[2] * Z3, 1 / lmsW[0])
             : lmsW[1] * Math.exp(lmsW[2] * Z3);
          w97 = (lmsW[0] !== 0)
              ? lmsW[1] * Math.pow(1 + lmsW[0] * lmsW[2] * Z97, 1 / lmsW[0])
              : lmsW[1] * Math.exp(lmsW[2] * Z97);
        }
        const lmsH = getChildLMS(sexVal, ageYears, 'HT');
        if (lmsH) {
          h3 = (lmsH[0] !== 0)
             ? lmsH[1] * Math.pow(1 + lmsH[0] * lmsH[2] * Z3, 1 / lmsH[0])
             : lmsH[1] * Math.exp(lmsH[2] * Z3);
          h97 = (lmsH[0] !== 0)
              ? lmsH[1] * Math.pow(1 + lmsH[0] * lmsH[2] * Z97, 1 / lmsH[0])
              : lmsH[1] * Math.exp(lmsH[2] * Z97);
        }
      }
    }
    // Waga
    if (statsW && typeof statsW.percentile === 'number') {
      if (isAdultPatient) {
        const adultWeightPopulationText = patientReportBuildAdultWeightPopulationSummaryText(weightVal, heightVal, sexVal, ageYears);
        lines.push(`Waga: ${adultWeightPopulationText}`);
      } else {
        // Format percentyl tak, aby skrajne wartości (<1, >99,9) były wyświetlane jako "<1" lub ">100".
        let percStr = formatCentile(statsW.percentile);
        // Określ właściwy rodzaj rzeczownika („centyl” vs „centyla”) na podstawie zakodowanych znaków
        let word = centylWord(percStr);
        // Zamień encje HTML na zwykłe znaki w tekście podsumowania
        let decoded = percStr.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
        let line = `Waga: ${decoded} ${word}`;
        if (pro && typeof statsW.sd === 'number' && !isNaN(statsW.sd)) {
          line += ` (Z‑score = ${statsW.sd.toFixed(2).replace('.', ',')})`;
        }
        // Dla skrajnie niskich wartości (zaokrąglony centyl ≤ 2) podaj, ile kg brakuje do 3. centyla
        const roundedWeightCent = Math.round(statsW.percentile);
        if (typeof w3 === 'number' && roundedWeightCent <= 2) {
          // używamy zwykłej spacji do oddzielenia jednostki od liczby, aby uniknąć niewidzialnych znaków
          line += `, brakuje ${(w3 - weightVal).toFixed(1).replace('.', ',')} kg do 3 centyla`;
        }
        // Dla wartości ≥98. centyla podaj, o ile kilogramów przekracza 97. centyl
        if (typeof w97 === 'number' && statsW.percentile >= 98) {
          line += `, +${(weightVal - w97).toFixed(1).replace('.', ',')} kg ponad 97 centyl`;
        }
        lines.push(line);
      }

    }
    // Wzrost
    if (statsH && typeof statsH.percentile === 'number') {
      if (isAdultPatient) {
        const adultHeightPopulationText = patientReportBuildAdultHeightPopulationSummaryText(heightVal, sexVal, ageYears);
        lines.push(`Wzrost: ${adultHeightPopulationText}`);
      } else {
        let percStr = formatCentile(statsH.percentile);
        let word = centylWord(percStr);
        let decoded = percStr.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
        let line = `Wzrost: ${decoded} ${word}`;
        if (pro && typeof statsH.sd === 'number' && !isNaN(statsH.sd)) {
          line += ` (Z‑score = ${statsH.sd.toFixed(2).replace('.', ',')})`;
        }
        // Dla skrajnie niskich wartości (zaokrąglony centyl ≤ 2) podaj, ile cm brakuje do 3. centyla
        const roundedHeightCent = Math.round(statsH.percentile);
        if (typeof h3 === 'number' && roundedHeightCent <= 2) {
          // stosujemy zwykłe spacje zamiast wąskiej spacji, aby poprawić kompatybilność z edytorami
          line += `, brakuje ${(h3 - heightVal).toFixed(1).replace('.', ',')} cm do 3 centyla`;
        }
        // Dla wartości ≥98. centyla podaj, o ile centymetrów przekracza 97. centyl
        if (typeof h97 === 'number' && statsH.percentile >= 98) {
          line += `, +${(heightVal - h97).toFixed(1).replace('.', ',')} cm ponad 97 centyl`;
        }
        lines.push(line);
      }
    }
    // BMI
    const bmi = BMI(weightVal, heightVal);
    if (bmi && !isNaN(bmi)) {
      const months = Math.round(ageYears * 12);
      let bmiPerc = null;
      // Oblicz percentyl BMI wyłącznie u dzieci i młodzieży.
      if (!isAdultPatient && ageYears >= CHILD_AGE_MIN && ageYears <= CHILD_AGE_MAX) {
        bmiPerc = bmiPercentileChild(bmi, sexVal, months);
      }
      let line = `BMI: ${bmi.toFixed(1).replace('.', ',')}`;
      if (isAdultPatient) {
        const adultAssessment = (typeof patientReportGetAdultBmiAssessment === 'function')
          ? patientReportGetAdultBmiAssessment(bmi)
          : null;
        const adultStatusLabel = patientReportGetAdultBmiSummaryStatusLabel(adultAssessment && adultAssessment.state);
        const adultDeltaSentence = patientReportBuildAdultBmiWeightDeltaSentence(weightVal, heightVal);
        const adultPopulationSentence = patientReportBuildAdultBmiPopulationSummaryText(bmi, sexVal, ageYears);
        line += ` – ${adultStatusLabel}`;
        const adultParts = [];
        if (adultDeltaSentence) {
          const adultDeltaContinuation = adultDeltaSentence.charAt(0).toLowerCase() + adultDeltaSentence.slice(1);
          adultParts.push(adultDeltaContinuation.replace(/\.$/, ''));
        }
        if (adultPopulationSentence) {
          adultParts.push(String(adultPopulationSentence).replace(/\.$/, ''));
        }
        if (adultParts.length) {
          line += `, ${adultParts.join('; ')}.`;
        } else {
          line += '.';
        }
      } else {
        if (typeof bmiPerc === 'number') {
          // BMI percentyl również formatujemy przy użyciu formatCentile, aby zachować spójność ze wzrostem i wagą
          let percStrBmi = formatCentile(bmiPerc);
          let wordBmi   = centylWord(percStrBmi);
          let decodedBmi = percStrBmi.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
          line += ` – ${decodedBmi} ${wordBmi}`;
        }
        // Oblicz z-score BMI w trybie profesjonalnym tylko u dzieci i młodzieży.
        if (pro && ageYears >= CHILD_AGE_MIN && ageYears <= CHILD_AGE_MAX) {
          const bmiZ = bmiZscore(bmi, sexVal, months);
          if (bmiZ !== null && !isNaN(bmiZ)) {
            line += ` (Z‑score = ${bmiZ.toFixed(2).replace('.', ',')})`;
          }
        }
      }
      lines.push(line);
    }
    // Powierzchnia ciała (BSA)
    // Niektóre moduły mogą nie eksportować funkcji BSA_Haycock do zasięgu globalnego,
    // co powoduje ReferenceError podczas wywołania generateMetabolicSummary().
    // Definiujemy funkcję pomocniczą bsaFunc: jeśli istnieje globalna
    // funkcja BSA_Haycock, użyjemy jej; w przeciwnym razie obliczamy BSA
    // bezpośrednio wzorem Haycocka.
    const bsaFunc = (typeof BSA_Haycock === 'function') ? BSA_Haycock : function(weight, height){
      return 0.024265 * Math.pow(weight, 0.5378) * Math.pow(height, 0.3964);
    };
    const bsa = bsaFunc(weightVal, heightVal);
    if (bsa && !isNaN(bsa)) {
      lines.push(`Pow. ciała: ${bsa.toFixed(2).replace('.', ',')} m²`);
    }
    // Wskaźnik Cole’a pokazujemy wyłącznie u dzieci i młodzieży.
    // Dla pacjentów dorosłych nie włączamy go ani do obliczeń, ani do podsumowania.
    let coleVal = null;
    if (!isAdultPatient) {
      coleVal = (typeof window !== 'undefined'
        && typeof window.colePercentValue === 'number'
        && !isNaN(window.colePercentValue))
        ? window.colePercentValue
        : null;

      if ((coleVal === null || coleVal === undefined)
          && ageYears >= CHILD_AGE_MIN && ageYears <= CHILD_AGE_MAX
          && typeof getLMS === 'function') {
        try {
          const monthsCole = Math.round(ageYears * 12);
          const lmsBMI = getLMS(sexVal, monthsCole);
          if (lmsBMI && Array.isArray(lmsBMI) && lmsBMI[1] > 0) {
            // jeśli BMI nie zostało jeszcze policzone, oblicz je pomocniczo
            const bmiForCole = (typeof bmi === 'number' && !isNaN(bmi))
              ? bmi
              : BMI(weightVal, heightVal);
            if (bmiForCole && !isNaN(bmiForCole)) {
              coleVal = (bmiForCole / lmsBMI[1]) * 100;
            }
          }
        } catch (_) {
          coleVal = null;
        }
      }
    }

    if (coleVal !== null && coleVal !== undefined && !isNaN(coleVal)) {
      lines.push(`Wskaźnik Cole’a: ${coleVal.toFixed(1).replace('.', ',')}%`);
    }

    // --- Obwody talii/bioder i WHR ---
    // Jeśli użytkownik wprowadził pomiary talii i bioder, dołącz je do podsumowania.
    // W przypadku dzieci (3–18 lat) spróbuj obliczyć centyle na podstawie siatek;
    // dla dorosłych lub braku centyli pokaż tylko wartości w cm.
    try {
      const waistInput = document.getElementById('waistCm');
      const hipInput   = document.getElementById('hipCm');
      const waistVal   = waistInput ? parseFloat(waistInput.value) : NaN;
      const hipVal     = hipInput   ? parseFloat(hipInput.value)   : NaN;
      // Oblicz centyle talii i bioder dla dzieci, jeśli to możliwe
      let percRes = null;
      if (waistVal > 0 && hipVal > 0 && ageYears >= 3 && ageYears <= 18 && typeof childPercentileFromTables === 'function') {
        try {
          percRes = childPercentileFromTables(ageYears, sexVal, waistVal, hipVal);
        } catch (_) {
          percRes = null;
        }
      }
      // Obwód talii
      if (waistVal && !isNaN(waistVal) && waistVal > 0) {
        let line = `Obwód talii: ${waistVal.toFixed(1).replace('.', ',')} cm`;
        if (percRes && typeof percRes.waistP === 'number' && isFinite(percRes.waistP)) {
          const cent = Math.round(percRes.waistP);
          line += `, ${cent} centyl`;
        }
        lines.push(line);
      }
      // Obwód bioder
      if (hipVal && !isNaN(hipVal) && hipVal > 0) {
        let line = `Obwód bioder: ${hipVal.toFixed(1).replace('.', ',')} cm`;
        if (percRes && typeof percRes.hipP === 'number' && isFinite(percRes.hipP)) {
          const cent = Math.round(percRes.hipP);
          line += `, ${cent} centyl`;
        }
        lines.push(line);
      }
      // Wskaźnik WHR (talia/biodra)
      if (waistVal > 0 && hipVal > 0) {
        const whrVal = waistVal / hipVal;
        if (isFinite(whrVal)) {
          lines.push(`WHR: ${whrVal.toFixed(2).replace('.', ',')}`);
        }
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 24567 });
    }
  }
  }
  // Ciśnienie i tętno
  if (isAdultPatient && window.adultVitalsApi && typeof window.adultVitalsApi.buildSummaryLines === 'function') {
    try {
      const adultState = (typeof window.adultVitalsApi.getState === 'function')
        ? window.adultVitalsApi.getState()
        : null;
      const adultVitalLines = window.adultVitalsApi.buildSummaryLines(adultState);
      (adultVitalLines || []).forEach((line) => {
        if (line) lines.push(line);
      });
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 24581 });
    }
  }
  } else {
    // Ciśnienie – odczytaj globalne zmienne ustawione przez bp_module.js
    const bpSystolicCurrent = parseFloat(document.getElementById('bpSystolic')?.value);
    const bpDiastolicCurrent = parseFloat(document.getElementById('bpDiastolic')?.value);
    let summaryBpEval = null;
    try {
      if (bpSystolicCurrent > 0 && bpDiastolicCurrent > 0 && heightVal > 0
          && typeof referenceAgeYears === 'number' && isFinite(referenceAgeYears) && referenceAgeYears > 0
          && window.bpModuleApi && typeof window.bpModuleApi.computePediatricBp === 'function') {
        summaryBpEval = window.bpModuleApi.computePediatricBp({
          ageYears: referenceAgeYears,
          sex: sexVal,
          heightCm: heightVal,
          sbp: bpSystolicCurrent,
          dbp: bpDiastolicCurrent,
          datasetChoice: undefined
        });
      }
    } catch (_) {
      summaryBpEval = null;
    }
    const summaryPercSbp = (summaryBpEval && summaryBpEval.ok && typeof summaryBpEval.percSbp === 'number' && isFinite(summaryBpEval.percSbp))
      ? summaryBpEval.percSbp
      : ((typeof window.percSbp === 'number' && !isNaN(window.percSbp)) ? window.percSbp : null);
    const summaryPercDbp = (summaryBpEval && summaryBpEval.ok && typeof summaryBpEval.percDbp === 'number' && isFinite(summaryBpEval.percDbp))
      ? summaryBpEval.percDbp
      : ((typeof window.percDbp === 'number' && !isNaN(window.percDbp)) ? window.percDbp : null);
    const summaryZSbp = (summaryBpEval && summaryBpEval.ok && typeof summaryBpEval.zSbp === 'number' && isFinite(summaryBpEval.zSbp))
      ? summaryBpEval.zSbp
      : ((typeof window.zSbp === 'number' && !isNaN(window.zSbp)) ? window.zSbp : null);
    const summaryZDbp = (summaryBpEval && summaryBpEval.ok && typeof summaryBpEval.zDbp === 'number' && isFinite(summaryBpEval.zDbp))
      ? summaryBpEval.zDbp
      : ((typeof window.zDbp === 'number' && !isNaN(window.zDbp)) ? window.zDbp : null);
    if (bpSystolicCurrent > 0 && typeof summaryPercSbp === 'number' && !isNaN(summaryPercSbp)) {
      let line = `Ciśnienie skurczowe: ${Math.round(summaryPercSbp)} centyl`;
      if (pro && typeof summaryZSbp === 'number' && !isNaN(summaryZSbp)) {
        line += ` (Z‑score = ${summaryZSbp.toFixed(2).replace('.', ',')})`;
      }
      lines.push(line);
    }
    if (bpDiastolicCurrent > 0 && typeof summaryPercDbp === 'number' && !isNaN(summaryPercDbp)) {
      let line = `Ciśnienie rozkurczowe: ${Math.round(summaryPercDbp)} centyl`;
      if (pro && typeof summaryZDbp === 'number' && !isNaN(summaryZDbp)) {
        line += ` (Z‑score = ${summaryZDbp.toFixed(2).replace('.', ',')})`;
      }
      lines.push(line);
    }
  }
  // Obwód głowy i klatki piersiowej – ustawiane przez circumference_module.js
  const headCircCurrent = parseFloat(document.getElementById('headCircumference')?.value);
  const chestCircCurrent = parseFloat(document.getElementById('chestCircumference')?.value);
  if (headCircCurrent > 0 && typeof window.headCircPercentile === 'number' && isFinite(window.headCircPercentile)) {
    let line = `Obwód głowy: ${Math.round(window.headCircPercentile)} centyl`;
    if (pro && typeof window.headCircSD === 'number' && isFinite(window.headCircSD)) {
      line += ` (Z‑score = ${window.headCircSD.toFixed(2).replace('.', ',')})`;
    }
    lines.push(line);
  }
  if (chestCircCurrent > 0 && typeof window.chestCircPercentile === 'number' && isFinite(window.chestCircPercentile)) {
    let line = `Obwód klatki piersiowej: ${Math.round(window.chestCircPercentile)} centyl`;
    if (pro && typeof window.chestCircSD === 'number' && isFinite(window.chestCircSD)) {
      line += ` (Z‑score = ${window.chestCircSD.toFixed(2).replace('.', ',')})`;
    }
    lines.push(line);
  }
  // Tempo wzrastania i potencjał wzrostowy – z advancedGrowthData
  const agd = (typeof window.advancedGrowthData !== 'undefined') ? window.advancedGrowthData : null;
  if (agd) {
    // Tempo wzrastania
    // Sprawdź, czy jest dostępna wartość tempa; oryginalny kod pomija 0 jako wartość fałszywą,
    // więc tutaj również stosujemy to ograniczenie, aby nie pokazywać „0 cm/rok” w podsumowaniu.
    if (agd.growthVelocity && !isNaN(agd.growthVelocity)) {
      // Jeśli w obliczeniach zaawansowanych wykorzystano okno ostatniego roku (6–15 mies.),
      // to traktujemy tempo jako „aktualne” i podajemy liczbę miesięcy, z której zostało wyliczone.
      if (agd.growthVelocityUsedLastYear) {
        // growthVelocityGapM określa dokładną liczbę miesięcy odstępu między bieżącym pomiarem a użytym poprzednim.
        const m = (typeof agd.growthVelocityGapM === 'number' && agd.growthVelocityGapM >= 6) ? agd.growthVelocityGapM : null;
        const monthInfo = m ? ` (z ostatnich ${m} mies.)` : '';
        lines.push(`Aktualne tempo wzrastania${monthInfo}: ${agd.growthVelocity.toFixed(1).replace('.', ',')} cm/rok`);
      } else {
        // W przeciwnym razie wyświetlamy ogólne tempo wzrastania wraz z kontekstem (średnia z okresu), jeśli jest dostępny.
        let ctxStr = '';
        if (agd.growthVelocityContext) {
          ctxStr = ` (obliczono jako średnią z ${agd.growthVelocityContext})`;
        }
        lines.push(`Tempo wzrastania: ${agd.growthVelocity.toFixed(1).replace('.', ',')} cm/rok${ctxStr}`);
      }
    }
    // Potencjał wzrostowy
    if (agd.targetHeight && !isNaN(agd.targetHeight)) {
      // Zawsze zaczynamy od wartości potencjału i jednostki (MPH – mid‑parental height)
      let line = `MPH (mid-parental height): ${agd.targetHeight.toFixed(1).replace('.', ',')} cm`;
      // Jeżeli dostępne są statystyki centyla i z‑score, wyświetl je
      if (agd.targetStats && typeof agd.targetStats.percentile === 'number') {
        const cent = Math.round(agd.targetStats.percentile);
        // W trybie profesjonalnym pokazujemy również z‑score, gdy jest dostępny
        if (pro && typeof agd.targetStats.sd === 'number' && isFinite(agd.targetStats.sd)) {
          line += ` – centyl: ${cent}, z-score: ${agd.targetStats.sd.toFixed(2).replace('.', ',')}`;
        } else {
          // Tryb standardowy – tylko centyl
          line += ` – centyl: ${cent}`;
        }
      }
      lines.push(line);

      // Dodaj różnicę hSDS - mpSDS do podsumowania metabolicznego w trybie profesjonalnym.
      // Obliczamy Z‑score aktualnego wzrostu dziecka zgodnie z wybranym źródłem siatek centylowych
      // (Palczewska, OLAF lub WHO), a następnie odejmujemy z‑score MPH.
      if (pro && agd.targetStats && typeof agd.targetStats.sd === 'number' && isFinite(agd.targetStats.sd)) {
        let statsHeightDiff = null;
        const usePalAdv = (typeof bmiSource !== 'undefined' &&
                           (bmiSource === 'PALCZEWSKA' ||
                           (bmiSource === 'OLAF' && ageYears < OLAF_DATA_MIN_AGE)));
        if (usePalAdv) {
          statsHeightDiff = calcPercentileStatsPal(heightVal, sexVal, ageYears, 'HT');
        } else {
          statsHeightDiff = calcPercentileStats(heightVal, sexVal, ageYears, 'HT');
        }
        if (statsHeightDiff && typeof statsHeightDiff.sd === 'number' && isFinite(statsHeightDiff.sd)) {
          const diffSummary = statsHeightDiff.sd - agd.targetStats.sd;
          if (typeof diffSummary === 'number' && isFinite(diffSummary)) {
            lines.push(`hSDS - mpSDS: ${diffSummary.toFixed(2).replace('.', ',')}`);
          }
        }
      }
    }

    const bayleyPinneauSummaryLine = advGrowthBuildBayleyPinneauSummaryCardLine(agd.bayleyPinneau);
    if (bayleyPinneauSummaryLine) {
      lines.push(bayleyPinneauSummaryLine);
    }

    const rwtSummaryLine = advGrowthBuildRWTSummaryCardLine(agd.rwt);
    if (rwtSummaryLine) {
      lines.push(rwtSummaryLine);
    }

    const reinehrSummaryLine = (typeof advGrowthBuildReinehrCdgpSummaryCardLine === 'function')
      ? advGrowthBuildReinehrCdgpSummaryCardLine(agd.reinehr)
      : '';
    if (reinehrSummaryLine) {
      lines.push(reinehrSummaryLine);
    }

  }
  try {
    const nutritionSummaryLines = (typeof patientReportBuildNutritionSummaryLines === 'function')
      ? patientReportBuildNutritionSummaryLines()
      : [];
    (nutritionSummaryLines || []).forEach((line) => {
      if (line) lines.push(line);
    });
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 24736 });
    }
  }
  // Zwróć wszystkie linie w postaci tekstu
  return lines.join('\n');
  } finally {
    __perfEnd();
  }
}

/**
 * Obsługuje kliknięcie przycisku „Podsumowanie metaboliczne”.
 * Funkcja ta wywołuje generateMetabolicSummary(), a następnie kopiuje
 * wynik do schowka i informuje użytkownika. Została wydzielona jako
 * globalna, aby można ją było bezpośrednio przypisać do atrybutu
 * onclick w kodzie HTML.
 */
function handleMetabolicSummaryClick(event) {
  const __perfEnd = vildaPerfStart('P2:handleMetabolicSummaryClick');
  try {
  if (event) {
    if (typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    } else if (typeof event.stopPropagation === 'function') {
      event.stopPropagation();
    }
  }

  // Wygeneruj podstawowe podsumowanie
  let summaryText = generateMetabolicSummary();

  // Brak danych — powiadom użytkownika
  if (!summaryText || summaryText.trim() === '') {
    alert('Brak danych do podsumowania.');
    return;
  }

  try {
    // Rozbij podsumowanie na linie i dodaj wartości wejściowe oraz zmodyfikuj etykiety,
    // tak jak jest to widoczne w karcie Podsumowanie wyników. Dzięki temu do schowka
    // kopiowane są zarówno odczytane wartości (np. kg/cm/mmHg), jak i ich centyle.
    let lines = summaryText.split('\n').map(s => s.trim()).filter(Boolean);

    // Odczytaj aktualne wartości z formularza (jeśli są wypełnione).
    const weightValStr    = (document.getElementById('weight')?.value || '').trim();
    const heightValStr    = (document.getElementById('height')?.value || '').trim();
    const sbpValStr       = (document.getElementById('bpSystolic')?.value || '').trim();
    const dbpValStr       = (document.getElementById('bpDiastolic')?.value || '').trim();
    const headCircValStr  = (document.getElementById('headCircumference')?.value || '').trim();
    const chestCircValStr = (document.getElementById('chestCircumference')?.value || '').trim();

    lines = lines.map(function (line) {
      if (line.startsWith('Waga:')) {
        const rest   = line.slice(line.indexOf(':') + 1).trim();
        const valueLabel = weightValStr ? (weightValStr + ' kg') : '';
        return patientReportFormatSummaryLineWithValue('Waga', valueLabel, rest);
      }

      if (line.startsWith('Wzrost:')) {
        const rest   = line.slice(line.indexOf(':') + 1).trim();
        const valueLabel = heightValStr ? (heightValStr + ' cm') : '';
        return patientReportFormatSummaryLineWithValue('Wzrost', valueLabel, rest);
      }

      if (line.startsWith('Ciśnienie skurczowe')) {
        const rest   = line.slice(line.indexOf(':') + 1).trim();
        const prefix = sbpValStr ? (sbpValStr + ' mmHg, ') : '';
        return 'RR skurczowe: ' + prefix + rest;
      }

      if (line.startsWith('Ciśnienie rozkurczowe')) {
        const rest   = line.slice(line.indexOf(':') + 1).trim();
        const prefix = dbpValStr ? (dbpValStr + ' mmHg, ') : '';
        return 'RR rozkurczowe: ' + prefix + rest;
      }

      if (line.startsWith('Obwód głowy')) {
        const rest   = line.slice(line.indexOf(':') + 1).trim();
        const prefix = headCircValStr ? (headCircValStr + ' cm, ') : '';
        return 'Obwód głowy: ' + prefix + rest;
      }

      if (line.startsWith('Obwód klatki piersiowej')) {
        const rest   = line.slice(line.indexOf(':') + 1).trim();
        const prefix = chestCircValStr ? (chestCircValStr + ' cm, ') : '';
        return 'Obwód kl. piersiowej: ' + prefix + rest;
      }

      if (/^MPH \(mid[-‑]parental height\):/i.test(line)) {
        let newLine = line.replace(/^MPH \(mid[^)]*\):/i, 'MPH:');
        newLine = newLine.replace(/z-score:/i, 'Z-score:');
        return newLine;
      }

      return line;
    });

    summaryText = lines.join('\n');
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 24832 });
    }
  }

  // Ujednolicenie formatowania tekstu przed kopiowaniem
  summaryText = summaryText
    .replace(/\u00A0/g, ' ')
    .replace(/([0-9])\.([0-9])/g, '$1,$2');

  // Funkcja pomocnicza: wyświetla toast po skopiowaniu zamiast alertu
  const copyAndNotify = () => {
    const existingToast = document.getElementById('metabolicSummaryCopyToast');
    if (existingToast) {
      existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.id = 'metabolicSummaryCopyToast';
    toast.textContent = 'Dane zostały skopiowane do schowka.';
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
      if (toast.parentNode) {
        toast.remove();
      }
    }, 2500);
  };

  const copySummaryTextToClipboard = function(text) {
    return new Promise(function(resolve, reject) {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(text).then(resolve).catch(function() {
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
            const successful = document.execCommand('copy');
            textarea.remove();
            if (successful) {
              resolve();
            } else {
              reject(new Error('Copy command failed'));
            }
          } catch (err) {
            reject(err);
          }
        });
        return;
      }

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
        const successful = document.execCommand('copy');
        textarea.remove();
        if (successful) {
          resolve();
        } else {
          reject(new Error('Copy command failed'));
        }
      } catch (err) {
        reject(err);
      }
    });
  };

  copySummaryTextToClipboard(summaryText)
    .then(copyAndNotify)
    .catch(function() {
      alert('Nie udało się skopiować danych.');
    });
  } finally {
    __perfEnd();
  }
}

// Upewnij się, że funkcja kliknięcia jest dostępna globalnie, aby mogła być wywołana
// z poziomu atrybutu onclick w kodzie HTML. Niektóre bundlery lub tryby strict
// mogą blokować dostęp do funkcji globalnych, dlatego przypisujemy ją do
// obiektu window w sposób jawny.
if (typeof window !== 'undefined') {
  window.handleMetabolicSummaryClick = handleMetabolicSummaryClick;
}

// Po załadowaniu DOM, podłącz obsługę przycisku i nasłuchuj zmian na kluczowych polach
window.vildaAppOnReady('app:metabolic-summary-controls', function initMetabolicSummaryControls() {
  // Aktualizuj widoczność przycisku po każdej zmianie wieku, wagi lub wzrostu
  ['age','ageMonths','weight','height'].forEach(function(id){
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', function(){
        updateMetabolicSummaryVisibility();
        // Przy każdej zmianie odśwież kartę profesjonalnego podsumowania,
        // aby natychmiast zareagować na nowe dane.
        if (typeof updateProfessionalSummaryCard === 'function') {
          try { updateProfessionalSummaryCard(); } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 24948 });
    }
  }
        }
      });
      el.addEventListener('change', function(){
        updateMetabolicSummaryVisibility();
        if (typeof updateProfessionalSummaryCard === 'function') {
          try { updateProfessionalSummaryCard(); } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 24954 });
    }
  }
        }
      });
    }
  });
  // Wywołaj na starcie, aby ustawić stan początkowy
  updateMetabolicSummaryVisibility();
  // Zaktualizuj kartę z podsumowaniem wyników na starcie
  if (typeof updateProfessionalSummaryCard === 'function') {
    updateProfessionalSummaryCard();
  }

  // Dodaj ogólny nasłuch na formularzu, aby karta podsumowania aktualizowała się
  // „w locie” podczas wprowadzania dowolnych danych (np. ciśnienia, obwodów).
  // Dzięki temu zmiany w polach obsługiwanych przez dodatkowe moduły (bp_module,
  // circumference_module itp.) będą od razu widoczne w karcie podsumowania.
  try {
    const formEl = document.getElementById('calcForm');
    if (formEl) {
      const liveHandler = function(){
        if (typeof updateProfessionalSummaryCard === 'function') {
          try { updateProfessionalSummaryCard(); } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 24975 });
    }
  }
        }
      };
      // Reaguj zarówno na input, jak i change – niektóre komponenty
      // emulują dane dopiero po zdarzeniu change.
      formEl.addEventListener('input', liveHandler);
      formEl.addEventListener('change', liveHandler);
    }
  } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 24983 });
    }
  }
  // Dodaj obsługę kliknięcia przycisku podsumowania
  const metaBtn = document.getElementById('metabolicSummaryBtn');
  if (metaBtn && !metaBtn.dataset.metabolicSummaryListenerAttached) {
    metaBtn.addEventListener('click', handleMetabolicSummaryClick, { capture: true });
    metaBtn.dataset.metabolicSummaryListenerAttached = 'true';
  }
});

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
  const __perfEnd = vildaPerfStart('P2:buildHistoricalPointAnalysis');
  try {
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
  } finally {
    __perfEnd();
  }
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
      nextRecommendedStep: '8O-9g-lite — wydzielenie rendererów HTML estimated intake bez zmiany commitów ani alertów'
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
    step: '8O-9f',
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
      vildaGetEstimatedIntakeCalculationModelSnapshot: typeof vildaGetEstimatedIntakeCalculationModelSnapshot === 'function'
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
      keepInAppJsForNow: ['calcEstimatedIntake', 'setupEstimatedIntake', 'intakeAddRow', 'hasPotentialIntakeAlerts', 'window.intakeHistory', 'window.intakeEstimatedKcalPerDay', 'JSON rehydration', 'advanced growth ↔ estimated intake sync'],
      seamPreparedIn8O9e: ['buildEstimatedIntakeCalcInputModel', 'buildEstimatedIntakeLastObservedModel', 'buildEstimatedIntakeWindowHistory', 'commitEstimatedIntakeWindowState', 'clearEstimatedIntakeWindowState', 'vildaGetEstimatedIntakeCalcSeamSnapshot'],
      calcModelDelegatedIn8O9f: ['buildEstimatedIntakeCalculationModel'],
      nextStep: '8O-9g-lite'
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
  const start = 0;
  const duration = 600;
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
  const observer = new MutationObserver((mutations)=>{
    mutations.forEach(m=>{
      m.addedNodes.forEach(node=>{
        if(node.nodeType===1 && node.classList.contains('result-box')){
            enhanceResult(node);
        }
      });
    });
  });
  observer.observe(document.body,{childList:true,subtree:true});

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
const LMS_INFANT_BOYS = {"0":[0.5094, 13.3843, 0.09769],"1":[0.2669, 14.9822, 0.09017],"2":[0.1113, 16.3231, 0.08676],"3":[0.0048, 16.9069, 0.08492],"4":[-0.0732, 17.1594, 0.08378],"5":[-0.1366, 17.2914, 0.08297],"6":[-0.1919, 17.3424, 0.08233],"7":[-0.2384, 17.3289, 0.08183],"8":[-0.2808, 17.2633, 0.08139],"9":[-0.3177, 17.1659, 0.08102],"10":[-0.3523, 17.0463, 0.08067],"11":[-0.383, 16.9231, 0.08037],"12":[-0.4122, 16.7951, 0.08008],"13":[-0.4384, 16.6731, 0.07982],"14":[-0.4629, 16.5553, 0.07958],"15":[-0.4867, 16.4393, 0.07934],"16":[-0.5082, 16.3335, 0.07913],"17":[-0.5292, 16.2311, 0.07892],"18":[-0.5485, 16.1388, 0.07873],"19":[-0.5673, 16.0509, 0.07853],"20":[-0.5847, 15.9737, 0.07836],"21":[-0.6013, 15.9043, 0.07818],"22":[-0.6176, 15.8405, 0.07802],"23":[-0.6328, 15.7853, 0.07786],"24":[-0.6187, 16.0189, 0.07785],"25":[-0.584, 15.9799, 0.07792],"26":[-0.549, 15.9406, 0.078],"27":[-0.5164, 15.9034, 0.07809],"28":[-0.4843, 15.8658, 0.07819],"29":[-0.4549, 15.8303, 0.07829],"30":[-0.4275, 15.7954, 0.07841],"31":[-0.4013, 15.7601, 0.07854],"32":[-0.3782, 15.7267, 0.07867],"33":[-0.3568, 15.6928, 0.07882],"34":[-0.3388, 15.6609, 0.07897],"35":[-0.3228, 15.6287, 0.07914],"36":[-0.31, 15.5986, 0.07931],"37":[-0.3, 15.5695, 0.07949],"38":[-0.2927, 15.5406, 0.07969],"39":[-0.2884, 15.5141, 0.0799],"40":[-0.2869, 15.4881, 0.08013],"41":[-0.2881, 15.4645, 0.08036],"42":[-0.292, 15.4416, 0.08061],"43":[-0.2982, 15.4209, 0.08087],"44":[-0.3069, 15.4008, 0.08115],"45":[-0.3175, 15.3825, 0.08144],"46":[-0.3302, 15.3652, 0.08174],"47":[-0.3455, 15.3483, 0.08206],"48":[-0.3622, 15.3326, 0.08238],"49":[-0.3815, 15.3171, 0.08273],"50":[-0.402, 15.3029, 0.08307],"51":[-0.425, 15.2888, 0.08344],"52":[-0.449, 15.2758, 0.08381],"53":[-0.4745, 15.2634, 0.08418],"54":[-0.5022, 15.2513, 0.08457],"55":[-0.5302, 15.24, 0.08496],"56":[-0.5604, 15.229, 0.08537],"57":[-0.5906, 15.2188, 0.08577],"58":[-0.623, 15.2089, 0.08618],"59":[-0.6554, 15.2, 0.08659],"60":[-0.69, 15.1914, 0.08701]};
const LMS_INFANT_GIRLS = {"0":[0.6142, 13.2455, 0.09866],"1":[0.3406, 14.6003, 0.09551],"2":[0.1743, 15.7713, 0.09371],"3":[0.0621, 16.3668, 0.09252],"4":[-0.0197, 16.6722, 0.09166],"5":[-0.086, 16.8379, 0.09096],"6":[-0.1436, 16.9086, 0.09035],"7":[-0.1915, 16.9021, 0.08984],"8":[-0.2351, 16.839, 0.08938],"9":[-0.2726, 16.7404, 0.08898],"10":[-0.3075, 16.6157, 0.0886],"11":[-0.3382, 16.4867, 0.08827],"12":[-0.3674, 16.3536, 0.08796],"13":[-0.3934, 16.2298, 0.08768],"14":[-0.4176, 16.1132, 0.08741],"15":[-0.441, 16.0013, 0.08716],"16":[-0.4623, 15.9017, 0.08693],"17":[-0.4829, 15.808, 0.08671],"18":[-0.5018, 15.726, 0.0865],"19":[-0.5203, 15.6501, 0.0863],"20":[-0.5374, 15.585, 0.08611],"21":[-0.5536, 15.5281, 0.08594],"22":[-0.5697, 15.4782, 0.08576],"23":[-0.5846, 15.4381, 0.0856],"24":[-0.5684, 15.6881, 0.08454],"25":[-0.5684, 15.6589, 0.08452],"26":[-0.5684, 15.6302, 0.08449],"27":[-0.5684, 15.6036, 0.08446],"28":[-0.5684, 15.577, 0.08444],"29":[-0.5684, 15.5521, 0.08443],"30":[-0.5684, 15.5277, 0.08444],"31":[-0.5684, 15.503, 0.08448],"32":[-0.5684, 15.4798, 0.08455],"33":[-0.5684, 15.4568, 0.08467],"34":[-0.5684, 15.4355, 0.08484],"35":[-0.5684, 15.415, 0.08507],"36":[-0.5684, 15.3966, 0.08535],"37":[-0.5684, 15.3797, 0.08569],"38":[-0.5684, 15.3636, 0.08609],"39":[-0.5684, 15.3493, 0.08654],"40":[-0.5684, 15.3356, 0.08704],"41":[-0.5684, 15.3233, 0.08757],"42":[-0.5684, 15.3114, 0.08814],"43":[-0.5684, 15.3006, 0.08872],"44":[-0.5684, 15.2903, 0.08933],"45":[-0.5684, 15.2813, 0.08992],"46":[-0.5684, 15.2732, 0.0905],"47":[-0.5684, 15.266, 0.0911],"48":[-0.5684, 15.2602, 0.09168],"49":[-0.5684, 15.2555, 0.09229],"50":[-0.5684, 15.2523, 0.09287],"51":[-0.5684, 15.2503, 0.09346],"52":[-0.5684, 15.2496, 0.09404],"53":[-0.5684, 15.2502, 0.0946],"54":[-0.5684, 15.2519, 0.09516],"55":[-0.5684, 15.2543, 0.09567],"56":[-0.5684, 15.2576, 0.09618],"57":[-0.5684, 15.2612, 0.09665],"58":[-0.5684, 15.2654, 0.0971],"59":[-0.5684, 15.2698, 0.0975],"60":[-0.5684, 15.2748, 0.0979]};

// Infant percentiles (P5, P85, P95)
const bmiInfantBoys = {"0":{"P5": 11.32, "P85": 14.77, "P95": 15.62},"1":{"P5": 12.88, "P85": 16.43, "P95": 17.33},"2":{"P5": 14.14, "P85": 17.85, "P95": 18.81},"3":{"P5": 14.7, "P85": 18.46, "P95": 19.44},"4":{"P5": 14.96, "P85": 18.72, "P95": 19.71},"5":{"P5": 15.1, "P85": 18.85, "P95": 19.85},"6":{"P5": 15.17, "P85": 18.9, "P95": 19.89},"7":{"P5": 15.18, "P85": 18.88, "P95": 19.87},"8":{"P5": 15.14, "P85": 18.8, "P95": 19.79},"9":{"P5": 15.07, "P85": 18.69, "P95": 19.67},"10":{"P5": 14.97, "P85": 18.56, "P95": 19.53},"11":{"P5": 14.88, "P85": 18.42, "P95": 19.38},"12":{"P5": 14.77, "P85": 18.28, "P95": 19.23},"13":{"P5": 14.67, "P85": 18.14, "P95": 19.09},"14":{"P5": 14.58, "P85": 18.01, "P95": 18.95},"15":{"P5": 14.49, "P85": 17.88, "P95": 18.81},"16":{"P5": 14.4, "P85": 17.76, "P95": 18.69},"17":{"P5": 14.32, "P85": 17.65, "P95": 18.57},"18":{"P5": 14.24, "P85": 17.54, "P95": 18.46},"19":{"P5": 14.17, "P85": 17.45, "P95": 18.36},"20":{"P5": 14.11, "P85": 17.36, "P95": 18.26},"21":{"P5": 14.05, "P85": 17.28, "P95": 18.18},"22":{"P5": 14.0, "P85": 17.21, "P95": 18.11},"23":{"P5": 13.96, "P85": 17.15, "P95": 18.04},"24":{"P5": 14.16, "P85": 17.4, "P95": 18.31},"25":{"P5": 14.12, "P85": 17.36, "P95": 18.26},"26":{"P5": 14.08, "P85": 17.31, "P95": 18.21},"27":{"P5": 14.04, "P85": 17.27, "P95": 18.16},"28":{"P5": 14.0, "P85": 17.23, "P95": 18.12},"29":{"P5": 13.97, "P85": 17.19, "P95": 18.08},"30":{"P5": 13.93, "P85": 17.16, "P95": 18.04},"31":{"P5": 13.9, "P85": 17.12, "P95": 18.0},"32":{"P5": 13.86, "P85": 17.08, "P95": 17.96},"33":{"P5": 13.82, "P85": 17.05, "P95": 17.92},"34":{"P5": 13.79, "P85": 17.02, "P95": 17.89},"35":{"P5": 13.76, "P85": 16.98, "P95": 17.85},"36":{"P5": 13.73, "P85": 16.95, "P95": 17.82},"37":{"P5": 13.7, "P85": 16.92, "P95": 17.79},"38":{"P5": 13.66, "P85": 16.9, "P95": 17.76},"39":{"P5": 13.64, "P85": 16.87, "P95": 17.74},"40":{"P5": 13.61, "P85": 16.85, "P95": 17.72},"41":{"P5": 13.58, "P85": 16.82, "P95": 17.7},"42":{"P5": 13.56, "P85": 16.8, "P95": 17.68},"43":{"P5": 13.53, "P85": 16.79, "P95": 17.66},"44":{"P5": 13.51, "P85": 16.77, "P95": 17.65},"45":{"P5": 13.49, "P85": 16.76, "P95": 17.64},"46":{"P5": 13.47, "P85": 16.74, "P95": 17.63},"47":{"P5": 13.45, "P85": 16.73, "P95": 17.62},"48":{"P5": 13.43, "P85": 16.72, "P95": 17.62},"49":{"P5": 13.41, "P85": 16.71, "P95": 17.61},"50":{"P5": 13.4, "P85": 16.7, "P95": 17.61},"51":{"P5": 13.38, "P85": 16.7, "P95": 17.61},"52":{"P5": 13.36, "P85": 16.69, "P95": 17.61},"53":{"P5": 13.35, "P85": 16.69, "P95": 17.61},"54":{"P5": 13.33, "P85": 16.68, "P95": 17.62},"55":{"P5": 13.32, "P85": 16.68, "P95": 17.62},"56":{"P5": 13.3, "P85": 16.68, "P95": 17.63},"57":{"P5": 13.29, "P85": 16.67, "P95": 17.63},"58":{"P5": 13.28, "P85": 16.67, "P95": 17.64},"59":{"P5": 13.26, "P85": 16.67, "P95": 17.65},"60":{"P5": 13.25, "P85": 16.67, "P95": 17.66}};
const bmiInfantGirls = {"0":{"P5": 11.16, "P85": 14.63, "P95": 15.46},"1":{"P5": 12.42, "P85": 16.09, "P95": 17.01},"2":{"P5": 13.49, "P85": 17.37, "P95": 18.36},"3":{"P5": 14.05, "P85": 18.01, "P95": 19.04},"4":{"P5": 14.34, "P85": 18.34, "P95": 19.39},"5":{"P5": 14.51, "P85": 18.51, "P95": 19.57},"6":{"P5": 14.6, "P85": 18.58, "P95": 19.65},"7":{"P5": 14.61, "P85": 18.57, "P95": 19.64},"8":{"P5": 14.57, "P85": 18.49, "P95": 19.56},"9":{"P5": 14.5, "P85": 18.38, "P95": 19.44},"10":{"P5": 14.41, "P85": 18.24, "P95": 19.29},"11":{"P5": 14.31, "P85": 18.09, "P95": 19.13},"12":{"P5": 14.2, "P85": 17.94, "P95": 18.97},"13":{"P5": 14.11, "P85": 17.8, "P95": 18.83},"14":{"P5": 14.01, "P85": 17.67, "P95": 18.69},"15":{"P5": 13.92, "P85": 17.55, "P95": 18.56},"16":{"P5": 13.85, "P85": 17.43, "P95": 18.44},"17":{"P5": 13.77, "P85": 17.33, "P95": 18.33},"18":{"P5": 13.71, "P85": 17.24, "P95": 18.23},"19":{"P5": 13.65, "P85": 17.15, "P95": 18.14},"20":{"P5": 13.6, "P85": 17.08, "P95": 18.06},"21":{"P5": 13.55, "P85": 17.01, "P95": 17.99},"22":{"P5": 13.51, "P85": 16.96, "P95": 17.93},"23":{"P5": 13.48, "P85": 16.91, "P95": 17.88},"24":{"P5": 13.72, "P85": 17.16, "P95": 18.13},"25":{"P5": 13.7, "P85": 17.13, "P95": 18.1},"26":{"P5": 13.67, "P85": 17.1, "P95": 18.06},"27":{"P5": 13.65, "P85": 17.07, "P95": 18.03},"28":{"P5": 13.63, "P85": 17.04, "P95": 18.0},"29":{"P5": 13.61, "P85": 17.01, "P95": 17.97},"30":{"P5": 13.58, "P85": 16.99, "P95": 17.94},"31":{"P5": 13.56, "P85": 16.96, "P95": 17.92},"32":{"P5": 13.54, "P85": 16.94, "P95": 17.89},"33":{"P5": 13.52, "P85": 16.91, "P95": 17.87},"34":{"P5": 13.5, "P85": 16.89, "P95": 17.85},"35":{"P5": 13.47, "P85": 16.87, "P95": 17.83},"36":{"P5": 13.45, "P85": 16.86, "P95": 17.82},"37":{"P5": 13.43, "P85": 16.85, "P95": 17.81},"38":{"P5": 13.41, "P85": 16.84, "P95": 17.81},"39":{"P5": 13.39, "P85": 16.83, "P95": 17.81},"40":{"P5": 13.36, "P85": 16.82, "P95": 17.81},"41":{"P5": 13.34, "P85": 16.82, "P95": 17.81},"42":{"P5": 13.32, "P85": 16.82, "P95": 17.81},"43":{"P5": 13.3, "P85": 16.82, "P95": 17.82},"44":{"P5": 13.28, "P85": 16.82, "P95": 17.83},"45":{"P5": 13.26, "P85": 16.82, "P95": 17.83},"46":{"P5": 13.24, "P85": 16.82, "P95": 17.84},"47":{"P5": 13.22, "P85": 16.82, "P95": 17.85},"48":{"P5": 13.2, "P85": 16.83, "P95": 17.87},"49":{"P5": 13.19, "P85": 16.83, "P95": 17.88},"50":{"P5": 13.17, "P85": 16.84, "P95": 17.9},"51":{"P5": 13.16, "P85": 16.85, "P95": 17.91},"52":{"P5": 13.15, "P85": 16.86, "P95": 17.93},"53":{"P5": 13.14, "P85": 16.87, "P95": 17.95},"54":{"P5": 13.13, "P85": 16.88, "P95": 17.97},"55":{"P5": 13.12, "P85": 16.89, "P95": 17.99},"56":{"P5": 13.11, "P85": 16.91, "P95": 18.01},"57":{"P5": 13.11, "P85": 16.92, "P95": 18.03},"58":{"P5": 13.1, "P85": 16.93, "P95": 18.05},"59":{"P5": 13.1, "P85": 16.94, "P95": 18.07},"60":{"P5": 13.09, "P85": 16.96, "P95": 18.09}};

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
    document.querySelectorAll('.plan-time').forEach(el=>{
        if(el.dataset.anim) return;
        el.dataset.anim='1';
        const val = parseFloat(el.dataset.weeks||el.textContent)||0;
        animateValue(el, val, '');
    });
    document.querySelectorAll('.bmi50-number').forEach(el=>{
        if(el.dataset.anim) return;
        el.dataset.anim='1';
        const val = parseFloat(el.dataset.val||el.textContent)||0;
        animateValue(el, val, '');
    });
  }

  /* ---- Observe mutations to trigger enhancements ---- */
  const obs = new MutationObserver(()=>{
      enhancePlanTable();
      animateNewNumbers();
  });
  obs.observe(document.body,{childList:true,subtree:true});

})();

(function(){
  function animateVal(el,end){
    if(!el) return;
    const dur=600;
    const startT=performance.now();
    function step(now){
      const t=Math.min((now-startT)/dur,1);
      // Formatowanie z przecinkiem jako separatorem dziesiętnym w animowanych wartościach
      const valStr = (end*t).toFixed(end % 1 ? 1 : 0);
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
  const obs=new MutationObserver(transformPlan);
  obs.observe(document.body,{childList:true,subtree:true});
  window.vildaAppOnReady('app:plan-transform-initial', transformPlan);
})();

/*
 * Moduł profesjonalny – obliczanie dawek dla testów stymulacyjnych GH.
 * Ten blok kodu odpowiada za obsługę checkboxa „Jestem lekarzem”,
 * weryfikację numeru PWZ oraz wyświetlanie kart z wynikami testów.
 * Obliczenia są wykonywane na podstawie masy ciała (kg), wzrostu (cm)
 * oraz powierzchni ciała (m²) wyliczanej wzorem Mostellera.
 */
(function(){
  window.vildaAppOnReady('app:professional-module', function initProfessionalModule(){
    const isDoctorCheckbox   = document.getElementById('isDoctor');
    const pwzContainer       = document.getElementById('pwzContainer');
    const pwzNumberInput     = document.getElementById('pwzNumber');
    const pwzError           = document.getElementById('pwzError');
    const professionalModule = document.getElementById('professionalModule');
    const toggleGhTestsBtn   = document.getElementById('toggleGhTests');
    // Kontener dla przycisku testów GH (umieszczony poza modułem profesjonalnym)
    const ghButtonWrapper    = document.getElementById('ghButtonWrapper');
    // Kontenery z testami GH podzielone na kolumny (lewa i prawa). Zastępują dawny ghTestsContainer.
    const ghTestsLeft  = document.getElementById('ghTestsLeft');
    const ghTestsRight = document.getElementById('ghTestsRight');

    // === NOWE TESTY: OGTT/GnRH i ACTH/TRH ===
    // Pobierz przyciski i kontenery dla nowych testów. Domyślnie są ukryte i pojawiają się
    // dopiero po pozytywnej weryfikacji numeru PWZ. Każdy przycisk steruje swoją
    // parą kart wynikowych.
    const toggleOgttTestsBtn = document.getElementById('toggleOgttTests');
    const ogttButtonWrapper  = document.getElementById('ogttButtonWrapper');
    const ogttTestsLeft      = document.getElementById('ogttTestsLeft');
    const ogttTestsRight     = document.getElementById('ogttTestsRight');
    const toggleActhTestsBtn = document.getElementById('toggleActhTests');
    const acthButtonWrapper  = document.getElementById('acthButtonWrapper');
    const acthTestsLeft      = document.getElementById('acthTestsLeft');
    const acthTestsRight     = document.getElementById('acthTestsRight');
    // Nowe przyciski i kontenery: główny przycisk testów endokrynologii
    // oraz przycisk leczenia hormonem wzrostu / IGF-1 wraz z listą podprzycisków.
    const toggleEndoTestsBtn  = document.getElementById('toggleEndoTests');
    const endoButtonWrapper   = document.getElementById('endoButtonWrapper');
    const toggleIgfTestsBtn   = document.getElementById('toggleIgfTests');
    const igfButtonWrapper    = document.getElementById('igfButtonWrapper');
    const snpButtonWrapper    = document.getElementById('snpButtonWrapper');
    const turnerButtonWrapper = document.getElementById('turnerButtonWrapper');
    const pwsButtonWrapper    = document.getElementById('pwsButtonWrapper');
    const sgaButtonWrapper    = document.getElementById('sgaButtonWrapper');
    const igf1ButtonWrapper   = document.getElementById('igf1ButtonWrapper');
    // Kontener dla przycisku antybiotykoterapii. Sekcja ta jest analogiczna do innych
    // przycisków modułu lekarskiego i powinna być wyświetlana wyłącznie po pozytywnej
    // weryfikacji numeru PWZ. Element ten zostanie zainicjowany również tutaj, aby
    // umożliwić jego pokazanie/ukrycie zależnie od stanu użytkownika.
    const abxButtonWrapper    = document.getElementById('abxButtonWrapper');

    // Nowy przycisk i elementy kalkulatora Z‑score (batch XLSX)
    const zscoreButtonWrapper = document.getElementById('zscoreButtonWrapper');
    // Elementy modułu leczenia bisfosfonianami (przycisk oraz karta).  
    // Przyciski są ukryte domyślnie w HTML i pokazują się dopiero po pozytywnej weryfikacji numeru PWZ.
    const bisphosButtonWrapper = document.getElementById('bisphosButtonWrapper');
    const toggleBisphosBtn    = document.getElementById('toggleBisphos');
    const bisphosCard         = document.getElementById('bisphosCard');
    const sgaBirthButtonWrapper = document.getElementById('sgaBirthButtonWrapper');
    const toggleSgaBirthBtn   = document.getElementById('toggleSgaBirth');
    const sgaBirthCard        = document.getElementById('sgaBirthCard');

    // Nowy moduł: leczenie otyłości (placeholder)
    const obesityButtonWrapper = document.getElementById('obesityButtonWrapper');
    const toggleObesityTherapyBtn = document.getElementById('toggleObesityTherapy');
    const obesityCard = document.getElementById('obesityCard');
    const toggleZscoreBtn     = document.getElementById('toggleZscore');
    const zscoreCard          = document.getElementById('zscoreCard');
    const zscoreFileInput     = document.getElementById('zscoreFileInput');
    const computeZscoreBatchBtn = document.getElementById('computeZscoreBatch');
    const zscoreMessage       = document.getElementById('zscoreMessage');

    // === Konfiguracja wyboru źródła danych dla kalkulatora Z‑score ===
    // Użytkownik wybiera pomiędzy danymi Palczewska i OLAF za pomocą dwóch przycisków.
    // Przechowujemy aktualny wybór w zmiennej zscoreBatchSourceChoice.  Domyślnie
    // ustawiamy OLAF jako źródło. Kliknięcie przycisku ustawia wybór i
    // podświetla aktywny przycisk poprzez dodanie klasy .active-toggle.
    let zscoreBatchSourceChoice = 'OLAF';
    const btnZscorePalczewska = document.getElementById('btnZscorePalczewska');
    const btnZscoreOlaf       = document.getElementById('btnZscoreOlaf');
    const getZscoreBatchSourceChoice = () => {
      if (btnZscorePalczewska && btnZscorePalczewska.classList.contains('active-toggle')) {
        return 'PALCZEWSKA';
      }
      if (btnZscoreOlaf && btnZscoreOlaf.classList.contains('active-toggle')) {
        return 'OLAF';
      }
      return zscoreBatchSourceChoice || 'OLAF';
    };
    if (btnZscorePalczewska && btnZscoreOlaf) {
      const updateZscoreButtons = (choice) => {
        zscoreBatchSourceChoice = choice;
        if (choice === 'PALCZEWSKA') {
          btnZscorePalczewska.classList.add('active-toggle');
          btnZscoreOlaf.classList.remove('active-toggle');
        } else {
          btnZscoreOlaf.classList.add('active-toggle');
          btnZscorePalczewska.classList.remove('active-toggle');
        }
      };
      btnZscorePalczewska.addEventListener('click', () => updateZscoreButtons('PALCZEWSKA'));
      btnZscoreOlaf.addEventListener('click',       () => updateZscoreButtons('OLAF'));
      zscoreBatchSourceChoice = getZscoreBatchSourceChoice();
    }

    if(!isDoctorCheckbox) return;

    // Rejestracja obsługi dla kalkulatora Z‑score (batch)
    // Funkcje te są wykonywane tylko, gdy elementy istnieją (przykład na stronie DocPro).
    if (toggleZscoreBtn) {
      toggleZscoreBtn.addEventListener('click', function () {
        // Jeśli karta Z‑score jest otwarta, zamknij ją; w przeciwnym razie otwórz i schowaj inne karty
        const visible = zscoreCard && zscoreCard.style.display !== 'none' && zscoreCard.style.display !== '';
        if (visible) {
          if (zscoreCard) zscoreCard.style.display = 'none';
          this.classList.remove('active-toggle');
        } else {
          if (zscoreCard) zscoreCard.style.display = 'block';
          this.classList.add('active-toggle');
          // Zamknij wszystkie listy testów i usuń podświetlenie przycisków
          if (ghTestsLeft && ghTestsRight) {
            ghTestsLeft.classList.remove('active');
            ghTestsRight.classList.remove('active');
          }
          if (ogttTestsLeft && ogttTestsRight) {
            ogttTestsLeft.classList.remove('active');
            ogttTestsRight.classList.remove('active');
          }
          if (acthTestsLeft && acthTestsRight) {
            acthTestsLeft.classList.remove('active');
            acthTestsRight.classList.remove('active');
          }
          if (ghButtonWrapper) ghButtonWrapper.style.display = 'none';
          if (ogttButtonWrapper) ogttButtonWrapper.style.display = 'none';
          if (acthButtonWrapper) acthButtonWrapper.style.display = 'none';
          if (snpButtonWrapper)    snpButtonWrapper.style.display    = 'none';
          if (turnerButtonWrapper) turnerButtonWrapper.style.display = 'none';
          if (pwsButtonWrapper)    pwsButtonWrapper.style.display    = 'none';
          if (sgaButtonWrapper)    sgaButtonWrapper.style.display    = 'none';
          if (igf1ButtonWrapper)   igf1ButtonWrapper.style.display   = 'none';
          // Przywróć widoczność przycisku IGF‑1 (jeśli ukryty)
          if (igfButtonWrapper) igfButtonWrapper.style.display = 'flex';
          // Usuń podświetlenie z innych przycisków
          if (toggleGhTestsBtn)   toggleGhTestsBtn.classList.remove('active-toggle');
          if (toggleOgttTestsBtn) toggleOgttTestsBtn.classList.remove('active-toggle');
          if (toggleActhTestsBtn) toggleActhTestsBtn.classList.remove('active-toggle');
          if (toggleEndoTestsBtn) toggleEndoTestsBtn.classList.remove('active-toggle');
          if (toggleIgfTestsBtn)  toggleIgfTestsBtn.classList.remove('active-toggle');
          // Schowaj kartę antybiotykoterapii i usuń podświetlenie jej przycisku
          const abxCard = document.getElementById('antibioticTherapyCard');
          if (abxCard) abxCard.style.display = 'none';
          const abxToggleBtn = document.getElementById('toggleAbxTherapy');
          if (abxToggleBtn) abxToggleBtn.classList.remove('active-toggle');
        }
        if (typeof adjustTestButtonWidths === 'function') {
          requestAnimationFrame(() => adjustTestButtonWidths());
        }
      });
    }
    if (computeZscoreBatchBtn) {
      computeZscoreBatchBtn.addEventListener('click', function () {
        if (!zscoreFileInput || !zscoreFileInput.files || zscoreFileInput.files.length === 0) {
          if (zscoreMessage) {
            zscoreMessage.style.color = getComputedStyle(document.documentElement).getPropertyValue('--danger') || '#d32f2f';
            zscoreMessage.textContent = 'Wybierz plik .xlsx zawierający dane pacjentów.';
          }
          return;
        }
        // Show a loading overlay for a brief moment to simulate processing.  The
        // overlay is hidden automatically after 2 s.  We wrap this in a try/catch
        // to avoid errors if the element does not exist.
        try {
          const loadingOverlay = document.getElementById('zscoreLoadingOverlay');
          if (loadingOverlay) {
            // display flex so that the Lottie animation is centered
            loadingOverlay.style.display = 'flex';
            setTimeout(() => {
              loadingOverlay.style.display = 'none';
            }, 2000);
          }
        } catch (err) {
          vildaLogAppWarn('zscore-batch-xlsx', 'Nie udało się pokazać overlay przetwarzania XLSX', err);
        }
        const file = zscoreFileInput.files[0];
        // Ustal źródło danych (Palczewska lub OLAF) na podstawie wyboru użytkownika.
        // Źródło przechowywane jest w zmiennej zscoreBatchSourceChoice ustawianej
        // przez przyciski Dane Palczewska / Dane OLAF.
        let sourceChoice = getZscoreBatchSourceChoice();
        zscoreBatchSourceChoice = sourceChoice || 'OLAF';
        if (zscoreMessage) {
          zscoreMessage.textContent = '';
        }
        const reader = new FileReader();
        reader.onerror = function () {
          vildaLogAppError('zscore-batch-xlsx', 'Błąd odczytu pliku XLSX przez FileReader', reader.error || null, { fileName: file && file.name });
          if (zscoreMessage) {
            zscoreMessage.style.color = getComputedStyle(document.documentElement).getPropertyValue('--danger') || '#d32f2f';
            zscoreMessage.textContent = 'Błąd odczytu pliku.';
          }
        };
        reader.onload = function (e) {
          try {
            vildaEnsureGlobalDependencyContract('zscore-batch-xlsx', { silent: true, showUi: true, throwOnMissing: false, statusElement: zscoreMessage, message: 'Brakuje biblioteki XLSX potrzebnej do przetworzenia pliku.' });
            const xlsx = vildaRequireGlobalObject('XLSX', 'zscore-batch-xlsx');
            if (!xlsx || typeof xlsx.read !== 'function' || !xlsx.utils || typeof xlsx.writeFile !== 'function') {
              vildaShowDependencyFallbackNotice('Brakuje biblioteki XLSX potrzebnej do przetworzenia pliku.', {
                moduleName: 'zscore-batch-xlsx',
                statusElement: zscoreMessage,
                statusOnly: true
              });
              return;
            }
            const data = new Uint8Array(e.target.result);
            const workbook = xlsx.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames && workbook.SheetNames.length > 0 ? workbook.SheetNames[0] : null;
            if (!sheetName) {
              if (zscoreMessage) {
                zscoreMessage.style.color = getComputedStyle(document.documentElement).getPropertyValue('--danger') || '#d32f2f';
                zscoreMessage.textContent = 'Plik nie zawiera arkuszy.';
              }
              return;
            }
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = xlsx.utils.sheet_to_json(worksheet, { defval: null });
            if (!jsonData || jsonData.length === 0) {
              if (zscoreMessage) {
                zscoreMessage.style.color = getComputedStyle(document.documentElement).getPropertyValue('--danger') || '#d32f2f';
                zscoreMessage.textContent = 'Plik nie zawiera danych.';
              }
              return;
            }
            if (jsonData.length > 250) {
              if (zscoreMessage) {
                zscoreMessage.style.color = getComputedStyle(document.documentElement).getPropertyValue('--danger') || '#d32f2f';
                zscoreMessage.textContent = 'Maksymalna liczba wierszy to 250. Zmniejsz dane wejściowe.';
              }
              return;
            }
            const detectColumn = (row, keys, patterns) => {
              for (const key of keys) {
                const lower = String(key).trim().toLowerCase();
                for (const pattern of patterns) {
                  if (lower.includes(pattern)) return key;
                }
              }
              return null;
            };
            const headerKeys = Object.keys(jsonData[0] || {});
            const weightKey = detectColumn(jsonData[0], headerKeys, ['waga', 'masa']);
            const heightKey = detectColumn(jsonData[0], headerKeys, ['wzrost']);
            const birthKey  = detectColumn(jsonData[0], headerKeys, ['data urodzenia', 'dataurodzenia', 'urodzenia', 'data']);
            let sexKey = detectColumn(jsonData[0], headerKeys, ['płeć', 'plec', 'sex', 'płe', 'pleć']);
            let colM = null;
            let colK = null;
            if (!sexKey) {
              const mCandidates = headerKeys.filter(k => String(k).trim().toUpperCase() === 'M');
              const kCandidates = headerKeys.filter(k => String(k).trim().toUpperCase() === 'K');
              if (mCandidates.length > 0) colM = mCandidates[0];
              if (kCandidates.length > 0) colK = kCandidates[0];
            }
            if (!weightKey || !heightKey || !birthKey || (!sexKey && !(colM || colK))) {
              if (zscoreMessage) {
                zscoreMessage.style.color = getComputedStyle(document.documentElement).getPropertyValue('--danger') || '#d32f2f';
                zscoreMessage.textContent = 'Nie znaleziono wymaganych kolumn w pliku. Upewnij się, że plik zawiera kolumny waga, wzrost, płeć i data urodzenia.';
              }
              return;
            }
            const output = [];
            jsonData.forEach((row) => {
              // Utwórz nowy obiekt wynikowy i pomiń kolumny bez nazwy (np. __EMPTY, Unnamed) lub puste nagłówki.
              const outRow = {};
              Object.keys(row).forEach((key) => {
                const trimmed = String(key).trim();
                if (trimmed && !trimmed.startsWith('__') && !trimmed.toLowerCase().startsWith('unnamed')) {
                  outRow[key] = row[key];
                }
              });
              try {
                // Ustal płeć na podstawie kolumny sexKey lub binarnych kolumn M/K
                let sexVal = null;
                if (sexKey) {
                  const val = row[sexKey];
                  if (val != null) {
                    const txt = String(val).trim().toUpperCase();
                    if (txt.startsWith('M')) sexVal = 'M';
                    else if (txt.startsWith('K')) sexVal = 'K';
                  }
                } else {
                  const mVal = colM ? row[colM] : null;
                  const kVal = colK ? row[colK] : null;
                  if (mVal != null && mVal !== '' && mVal !== 0) sexVal = 'M';
                  else if (kVal != null && kVal !== '' && kVal !== 0) sexVal = 'K';
                }
                if (!sexVal) throw new Error('Brak informacji o płci.');
                // Waga i wzrost
                const weightValRaw = row[weightKey];
                const weightNum = parseFloat(String(weightValRaw).replace(',', '.'));
                if (!(weightNum > 0)) throw new Error('Nieprawidłowa wartość wagi.');
                const heightValRaw = row[heightKey];
                const heightNum = parseFloat(String(heightValRaw).replace(',', '.'));
                if (!(heightNum > 0)) throw new Error('Nieprawidłowa wartość wzrostu.');
                // Odczytaj i przelicz datę urodzenia na obiekt Date
                let birthDateVal = row[birthKey];
                let birthDate;
                if (birthDateVal instanceof Date) {
                  birthDate = birthDateVal;
                } else if (typeof birthDateVal === 'number') {
                  // Konwersja z liczb excelowych: dzień 0 = 1899-12-30
                  const excelEpoch = new Date(Date.UTC(1899, 11, 30));
                  birthDate = new Date(excelEpoch.getTime() + (birthDateVal * 24 * 3600 * 1000));
                } else if (typeof birthDateVal === 'string') {
                  // Zamień kropki na slash i parsuj
                  const parsed = Date.parse(birthDateVal.replace(/\./g, '/'));
                  if (!isNaN(parsed)) {
                    birthDate = new Date(parsed);
                  } else {
                    // Jeśli format dd-mm-yyyy lub yyyy-mm-dd, rozdziel i zbuduj datę
                    const parts = birthDateVal.split(/[-\/]/);
                    if (parts.length === 3) {
                      // próbujemy obu układów (dzień pierwszy) i (rok pierwszy)
                      // Spróbuj RRRR-MM-DD
                      let dt;
                      if (parts[0].length === 4) {
                        dt = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
                      } else {
                        // dd-mm-yyyy
                        dt = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
                      }
                      if (!isNaN(dt.getTime())) {
                        birthDate = dt;
                      }
                    }
                  }
                }
                if (!(birthDate instanceof Date) || isNaN(birthDate.getTime())) {
                  throw new Error('Nieprawidłowa data urodzenia.');
                }
                // Oblicz wiek i BMI
                const now = new Date();
                const diffMs = now.getTime() - birthDate.getTime();
                const ageYears = diffMs / (365.25 * 24 * 3600 * 1000);
                const ageMonths = ageYears * 12;
                const bmi = weightNum / Math.pow(heightNum / 100, 2);
                // Dopisz BMI i Z-score'y
                outRow.BMI = Math.round(bmi * 10) / 10;
                let zW = null, zH = null, zBMI = null;
                if (sourceChoice === 'PALCZEWSKA') {
                  const statsW = calcPercentileStatsPal(weightNum, sexVal, ageYears, 'WT');
                  zW = statsW ? statsW.sd : null;
                  const statsH = calcPercentileStatsPal(heightNum, sexVal, ageYears, 'HT');
                  zH = statsH ? statsH.sd : null;
                  const originalBmiSource = bmiSource;
                  try {
                    bmiSource = 'PALCZEWSKA';
                    zBMI = bmiZscore(bmi, sexVal, ageMonths);
                  } finally {
                    bmiSource = originalBmiSource;
                  }
                } else {
                  const originalBmiSource = bmiSource;
                  try {
                    bmiSource = 'OLAF';
                    const statsW = calcPercentileStats(weightNum, sexVal, ageYears, 'WT');
                    zW = statsW ? statsW.sd : null;
                    const statsH = calcPercentileStats(heightNum, sexVal, ageYears, 'HT');
                    zH = statsH ? statsH.sd : null;
                    zBMI = bmiZscore(bmi, sexVal, ageMonths);
                  } finally {
                    bmiSource = originalBmiSource;
                  }
                }
                outRow['Z_waga']   = (zW !== null && zW !== undefined) ? Math.round(zW * 100) / 100 : '';
                outRow['Z_wzrost'] = (zH !== null && zH !== undefined) ? Math.round(zH * 100) / 100 : '';
                outRow['Z_BMI']    = (zBMI !== null && zBMI !== undefined) ? Math.round(zBMI * 100) / 100 : '';
                // Nadpisz kolumnę daty urodzenia czytelnym łańcuchem znaków w formacie RRRR-MM-DD, poprzedzonym apostrofem.
                const isoStr = birthDate.toISOString().slice(0, 10);
                outRow[birthKey] = "'" + isoStr;
              } catch (err) {
                vildaLogAppWarn('zscore-batch-xlsx', 'Pominięto nieprawidłowy wiersz podczas przeliczania Z-score XLSX', err, { fileName: file && file.name });
                console.error(err);
                return;
              }
              output.push(outRow);
            });
            if (!output || output.length === 0) {
              if (zscoreMessage) {
                zscoreMessage.style.color = getComputedStyle(document.documentElement).getPropertyValue('--danger') || '#d32f2f';
                zscoreMessage.textContent = 'Brak prawidłowych danych do obliczeń.';
              }
              return;
            }
            const wsOut = xlsx.utils.json_to_sheet(output);
            const wbOut = xlsx.utils.book_new();
            xlsx.utils.book_append_sheet(wbOut, wsOut, 'Wyniki');
            const baseName = file.name.replace(/\.(xlsx|xls)$/i, '');
            const fileName = baseName + '_Zscore.xlsx';
            xlsx.writeFile(wbOut, fileName);
            if (zscoreMessage) {
              zscoreMessage.style.color = getComputedStyle(document.documentElement).getPropertyValue('--success') || '#007e33';
              zscoreMessage.textContent = 'Obliczenia zakończone. Plik został pobrany.';
            }
          } catch (ex) {
            vildaLogAppError('zscore-batch-xlsx', 'Błąd przetwarzania lub eksportu pliku XLSX Z-score', ex, { fileName: file && file.name });
            console.error(ex);
            if (zscoreMessage) {
              zscoreMessage.style.color = getComputedStyle(document.documentElement).getPropertyValue('--danger') || '#d32f2f';
              zscoreMessage.textContent = 'Wystąpił błąd podczas przetwarzania pliku.';
            }
          }
        };
        reader.readAsArrayBuffer(file);
      });
    }

    // Obsługa zmiany stanu checkboxa "Jestem lekarzem". Jeśli istnieje zapamiętany numer
    // prawa wykonywania zawodu w localStorage, to po zaznaczeniu checkboxa automatycznie
    // zostanie pokazany moduł profesjonalny bez ponownego pytania o numer. W przeciwnym
    // razie wyświetlimy pole do wpisania numeru i zweryfikujemy wpisaną wartość.
    isDoctorCheckbox.addEventListener('change', function(){
      // Po każdym kliknięciu checkboxa „Jestem lekarzem” wywołujemy krótką wibrację urządzenia (jeśli obsługiwane)
      try {
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          navigator.vibrate(100);
        }
      } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 31058 });
    }
  }
      const storedPwz = localStorage.getItem('pwzNumber');
      if(this.checked){
        if(storedPwz){
          // Użytkownik uprzednio zgodził się na zapamiętanie numeru – nie pytamy ponownie.
          // Zamiast od razu pokazywać kartę z komunikatem, zastosuj overlay
          // edukacyjny, jeśli minął miesiąc od ostatniego potwierdzenia. Po potwierdzeniu
          // lub gdy overlay nie jest wymagany, aktywuj moduł profesjonalny.  Ta
          // funkcja ukryje kartę z komunikatem i pokaże odpowiednie przyciski.
          const proceedWithModule = () => {
            // Ukryj pole wprowadzania PWZ oraz komunikat o błędzie
            pwzContainer.style.display = 'none';
            pwzError.style.display     = 'none';
            // Aktywuj moduł profesjonalny bez ponownego pytania o zapamiętanie numeru
            activateProfessionalModule(storedPwz);
          };
          if (typeof shouldShowProfessionalOverlay === 'function' && shouldShowProfessionalOverlay()) {
            showProfessionalOverlay(proceedWithModule);
          } else {
            proceedWithModule();
          }
        } else {
          // Brak zapamiętanego numeru – umożliwiamy jego wpisanie i weryfikację
          pwzContainer.style.display = 'block';
          // Pokaż instrukcję wpisania numeru PWZ
          try {
            var doctorInfoEl = document.querySelector('.doctor-info');
            if (doctorInfoEl) doctorInfoEl.style.display = '';
          } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 31088 });
    }
  }
          // Ukryj przyciski testów, dopóki numer nie zostanie pozytywnie zweryfikowany
          if (ghButtonWrapper)    ghButtonWrapper.style.display    = 'none';
          if (ogttButtonWrapper)  ogttButtonWrapper.style.display  = 'none';
          if (acthButtonWrapper)  acthButtonWrapper.style.display  = 'none';
          // Ukryj również główne przyciski modułu lekarskiego i wszystkie podprzyciski IGF‑1
          if (abxButtonWrapper)   abxButtonWrapper.style.display   = 'none';
          if (endoButtonWrapper)  endoButtonWrapper.style.display  = 'none';
          if (igfButtonWrapper)   igfButtonWrapper.style.display   = 'none';
          if (snpButtonWrapper)    snpButtonWrapper.style.display    = 'none';
          if (turnerButtonWrapper) turnerButtonWrapper.style.display = 'none';
          if (pwsButtonWrapper)    pwsButtonWrapper.style.display    = 'none';
          if (sgaButtonWrapper)    sgaButtonWrapper.style.display    = 'none';
          if (igf1ButtonWrapper)   igf1ButtonWrapper.style.display   = 'none';
          // Ukryj kalkulator Z‑score (przycisk i kartę), dopóki numer PWZ nie zostanie pozytywnie zweryfikowany
          if (typeof zscoreButtonWrapper !== 'undefined' && zscoreButtonWrapper) {
            zscoreButtonWrapper.style.display = 'none';
          }
          if (typeof zscoreCard !== 'undefined' && zscoreCard) {
            zscoreCard.style.display = 'none';
          }
          // Ukryj moduł leczenia bisfosfonianami, dopóki numer PWZ nie zostanie pozytywnie zweryfikowany
          if (bisphosButtonWrapper) {
            bisphosButtonWrapper.style.display = 'none';
          }
          if (bisphosCard) {
            bisphosCard.style.display = 'none';
          }
          if (toggleBisphosBtn) {
            toggleBisphosBtn.classList.remove('active-toggle');
          }
          if (sgaBirthButtonWrapper) {
            sgaBirthButtonWrapper.style.display = 'none';
          }
          if (sgaBirthCard) {
            sgaBirthCard.style.display = 'none';
          }
          if (toggleSgaBirthBtn) {
            toggleSgaBirthBtn.classList.remove('active-toggle');
          }
          // Ukryj moduł leczenia otyłości (placeholder), dopóki numer PWZ nie zostanie pozytywnie zweryfikowany
          if (obesityButtonWrapper) {
            obesityButtonWrapper.style.display = 'none';
          }
          if (obesityCard) {
            obesityCard.style.display = 'none';
          }
          if (toggleObesityTherapyBtn) {
            toggleObesityTherapyBtn.classList.remove('active-toggle');
          }
          // Wywołujemy walidację dla obecnej wartości, by w razie potrzeby od razu
          // włączyć moduł (np. po ponownym zaznaczeniu checkboxa z zachowaną wartością).
          validatePWZ();
        }
      } else {
        // Odznaczono checkbox – ukrywamy pole, moduł oraz komunikaty
        pwzContainer.style.display       = 'none';
        professionalModule.style.display = 'none';
        pwzError.style.display           = 'none';
        // Ukryj instrukcję wpisania numeru PWZ, gdy użytkownik nie jest lekarzem
        try {
          var doctorInfoEl = document.querySelector('.doctor-info');
          if (doctorInfoEl) doctorInfoEl.style.display = 'none';
        } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 31151 });
    }
  }
        // Ukryj wszystkie przyciski testów, gdy użytkownik nie jest lekarzem
        if (ghButtonWrapper)    ghButtonWrapper.style.display    = 'none';
        if (ogttButtonWrapper)  ogttButtonWrapper.style.display  = 'none';
        if (acthButtonWrapper)  acthButtonWrapper.style.display  = 'none';
        if (abxButtonWrapper)   abxButtonWrapper.style.display   = 'none';
        // Ukryj przycisk i kartę leczenia bisfosfonianami, jeśli numer PWZ jest niepoprawny
        if (bisphosButtonWrapper) {
          bisphosButtonWrapper.style.display = 'none';
        }
        if (bisphosCard) {
          bisphosCard.style.display = 'none';
        }
        if (toggleBisphosBtn) {
          toggleBisphosBtn.classList.remove('active-toggle');
        }
        // Ukryj moduł leczenia otyłości (placeholder) przy wyłączeniu modułu profesjonalnego
        if (obesityButtonWrapper) {
          obesityButtonWrapper.style.display = 'none';
        }
        if (obesityCard) {
          obesityCard.style.display = 'none';
        }
        if (toggleObesityTherapyBtn) {
          toggleObesityTherapyBtn.classList.remove('active-toggle');
        }
        if (endoButtonWrapper)  endoButtonWrapper.style.display  = 'none';
        if (igfButtonWrapper)   igfButtonWrapper.style.display   = 'none';
        // Ukryj wszystkie podprzyciski IGF‑1
        if (snpButtonWrapper)    snpButtonWrapper.style.display    = 'none';
        if (turnerButtonWrapper) turnerButtonWrapper.style.display = 'none';
        if (pwsButtonWrapper)    pwsButtonWrapper.style.display    = 'none';
        if (sgaButtonWrapper)    sgaButtonWrapper.style.display    = 'none';
        if (igf1ButtonWrapper)   igf1ButtonWrapper.style.display   = 'none';

        // Ukryj kalkulator Z‑score (przycisk i kartę) oraz usuń podświetlenie
        // przycisku Kalkulator Z‑score, gdy moduł lekarski jest deaktywowany.
        if (typeof zscoreButtonWrapper !== 'undefined' && zscoreButtonWrapper) {
          zscoreButtonWrapper.style.display = 'none';
        }
        // Ukryj przycisk i kartę leczenia bisfosfonianami przy wyłączeniu modułu profesjonalnego
        if (bisphosButtonWrapper) {
          bisphosButtonWrapper.style.display = 'none';
        }
        if (bisphosCard) {
          bisphosCard.style.display = 'none';
        }
        if (typeof toggleBisphosBtn !== 'undefined' && toggleBisphosBtn) {
          toggleBisphosBtn.classList.remove('active-toggle');
        }
        if (sgaBirthButtonWrapper) {
          sgaBirthButtonWrapper.style.display = 'none';
        }
        if (sgaBirthCard) {
          sgaBirthCard.style.display = 'none';
        }
        if (toggleSgaBirthBtn) {
          toggleSgaBirthBtn.classList.remove('active-toggle');
        }
        // Ukryj moduł leczenia otyłości (placeholder)
        if (obesityButtonWrapper) {
          obesityButtonWrapper.style.display = 'none';
        }
        if (obesityCard) {
          obesityCard.style.display = 'none';
        }
        if (toggleObesityTherapyBtn) {
          toggleObesityTherapyBtn.classList.remove('active-toggle');
        }
        if (typeof zscoreCard !== 'undefined' && zscoreCard) {
          zscoreCard.style.display = 'none';
        }
        if (typeof toggleZscoreBtn !== 'undefined' && toggleZscoreBtn) {
          toggleZscoreBtn.classList.remove('active-toggle');
        }
        // Ukryj wszystkie listy testów
        if (ghTestsLeft && ghTestsRight) {
          ghTestsLeft.classList.remove('active');
          ghTestsRight.classList.remove('active');
        }
        if (ogttTestsLeft && ogttTestsRight) {
          ogttTestsLeft.classList.remove('active');
          ogttTestsRight.classList.remove('active');
        }
        if (acthTestsLeft && acthTestsRight) {
          acthTestsLeft.classList.remove('active');
          acthTestsRight.classList.remove('active');
        }
        // Jeśli użytkownik wyłącza moduł profesjonalny, schowaj kartę antybiotykoterapii
        // oraz usuń podświetlenie przycisku Antybiotykoterapia. Dzięki temu karta
        // nie pozostanie widoczna, gdy użytkownik nie ma uprawnień.
        const abxCard = document.getElementById('antibioticTherapyCard');
        if (abxCard) {
          abxCard.style.display = 'none';
        }
        const abxToggleBtn = document.getElementById('toggleAbxTherapy');
        if (abxToggleBtn) {
          abxToggleBtn.classList.remove('active-toggle');
        }
        // Jeśli numer PWZ nie został zapamiętany, wyczyść wpisaną wartość,
        // aby przy ponownym zaznaczeniu checkboxa wymagać ponownego podania numeru.
        if (!localStorage.getItem('pwzNumber')) {
          pwzNumberInput.value = '';
        }
        // Po każdej zmianie widoczności przycisków testów aktualizuj ich szerokość.
        // Używamy requestAnimationFrame, aby poczekać na zakończenie bieżącego
        // przebiegu renderowania – dzięki temu elementy mają już właściwe
        // rozmiary, gdy funkcja pobiera ich szerokość.
        if (typeof adjustTestButtonWidths === 'function') {
          requestAnimationFrame(() => adjustTestButtonWidths());
        }
      }
    });

    // Po zainicjowaniu elementów w dokumencie: jeśli przeglądarka nie
    // przechowuje zapamiętanego numeru PWZ, upewnij się, że pole wejściowe
    // jest puste przy pierwszym załadowaniu strony. W niektórych
    // przeglądarkach formularze mogą zachowywać wcześniejsze dane
    // wprowadzane przed odświeżeniem (autouzupełnianie), co powodowałoby
    // natychmiastowe ukrywanie pola po ponownym zaznaczeniu checkboxa.
    if(!localStorage.getItem('pwzNumber')){
      pwzNumberInput.value = '';
    }

    // Po załadowaniu elementów i wstępnej inicjalizacji wywołaj logikę
    // obsługi checkboxa „Jestem lekarzem”.  Bez tego kroku pole na
    // numer PWZ mogłoby pozostać ukryte po pierwszym załadowaniu strony,
    // ponieważ handler „change” uruchamia się tylko po interakcji.
    // Dzięki dispatchEvent z eventem „change” zapewniamy, że UI zostanie
    // dostosowane zależnie od tego, czy numer PWZ jest zapamiętany oraz
    // czy overlay powinien się pojawić.
    if (isDoctorCheckbox && isDoctorCheckbox.checked) {
      setTimeout(() => {
        try {
          const ev = new Event('change');
          isDoctorCheckbox.dispatchEvent(ev);
        } catch(err) {
          // Fallback: ręcznie wykonaj część logiki z handlera
          const storedPwzInit = localStorage.getItem('pwzNumber');
          if (storedPwzInit) {
            const proceedWithModule = () => {
              pwzContainer.style.display = 'none';
              pwzError.style.display     = 'none';
              activateProfessionalModule(storedPwzInit);
            };
            if (typeof shouldShowProfessionalOverlay === 'function' && shouldShowProfessionalOverlay()) {
              showProfessionalOverlay(proceedWithModule);
            } else {
              proceedWithModule();
            }
          } else {
            pwzContainer.style.display = 'block';
            validatePWZ();
          }
        }
      }, 0);
    }

    // Walidacja numeru PWZ: 7 cyfr. Jeśli poprawny – pokaż moduł profesjonalny.
    // Funkcja obliczająca cyfrę kontrolną i weryfikująca numer PWZ.
    // Numer PWZ ma format KABCDEF, gdzie K jest cyfrą kontrolną.
    function verifyPWZ(num){
      // Sprawdź długość, cyfry i brak wiodącego zera.
      // Numer PWZ składa się z siedmiu cyfr i nie zaczyna się od zera.
      // Używamy wyrażenia regularnego ^[1-9]\d{6}$, aby odrzucić ciągi
      // zaczynające się od 0 (np. „0000000”), które mimo poprawnej
      // cyfry kontrolnej nie są prawidłowymi numerami.
      if(!/^[1-9]\d{6}$/.test(num)) return false;
      const digits = num.split('').map(d => parseInt(d, 10));
      // Suma ważona cyfr A‑F z wagami 1..6 (indeksy 1..6 w tablicy)
      let sum = 0;
      for(let i = 1; i < digits.length; i++){
        sum += digits[i] * i;
      }
      let control = sum % 11;
      // Jeśli reszta to 10, numer jest niepoprawny
      if(control === 10) return false;
      return digits[0] === control;
    }

    /*
     * Sprawdza, czy należy wyświetlić overlay informacyjny modułu profesjonalnego.
     * Overlay jest wyświetlany, jeśli w localStorage nie zapisano daty potwierdzenia
     * (professionalConfirmedDate) lub minęło co najmniej 30 dni od ostatniego
     * potwierdzenia. Funkcja zwraca true, gdy overlay powinien się pojawić.
     */
    function shouldShowProfessionalOverlay(){
      try {
        const ts = localStorage.getItem('professionalConfirmedDate');
        if(!ts) return true;
        const last = parseInt(ts, 10);
        if(isNaN(last)) return true;
        const now = Date.now();
        const diffDays = (now - last) / (1000 * 60 * 60 * 24);
        return diffDays >= 30;
      } catch(e){
        return true;
      }
    }

    /*
     * Wyświetla pełnoekranowy overlay z informacją o charakterze edukacyjnym modułu
     * profesjonalnego i dwoma przyciskami: „Potwierdzam” oraz „Wychodzę”.
     * Po kliknięciu „Potwierdzam” zapisuje datę potwierdzenia w localStorage
     * (klucz professionalConfirmedDate) i wywołuje przekazaną funkcję callback.
     * Po kliknięciu „Wychodzę” zamyka overlay i przekierowuje użytkownika do
     * strony głównej.  Jeśli overlay nie istnieje w DOM, natychmiast wywołuje callback.
     */
    function showProfessionalOverlay(onConfirm){
      const overlay    = document.getElementById('professionalOverlay');
      const confirmBtn = document.getElementById('professionalConfirmBtn');
      const exitBtn    = document.getElementById('professionalExitBtn');
      if(!overlay || !confirmBtn || !exitBtn){
        if(typeof onConfirm === 'function') onConfirm();
        return;
      }
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      overlay.style.display = 'flex';
      function cleanup(){
        overlay.style.display = 'none';
        document.body.style.overflow = prevOverflow;
        confirmBtn.removeEventListener('click', confirmHandler);
        exitBtn.removeEventListener('click', exitHandler);
      }
      function confirmHandler(){
        cleanup();
        try {
          localStorage.setItem('professionalConfirmedDate', Date.now().toString());
        } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 31380 });
    }
  }
        // Ukryj kartę z komunikatem w module profesjonalnym, ponieważ została ona zastąpiona overlayem
        try {
          const msgCard = document.getElementById('professionalModule');
          if(msgCard) msgCard.style.display = 'none';
        } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 31385 });
    }
  }
        if(typeof onConfirm === 'function') onConfirm();
      }
      function exitHandler(){
        cleanup();
        // Przekieruj do strony głównej serwisu
        try {
          window.location.href = '/';
        } catch(e) {
          window.location.pathname = '/';
        }
      }
      confirmBtn.addEventListener('click', confirmHandler);
      exitBtn.addEventListener('click', exitHandler);
    }

    /*
     * Wyświetla pełnoekranowy overlay z pytaniem, czy zapamiętać numer
     * prawa wykonywania zawodu lekarza w tej przeglądarce.  Używa tego
     * samego stylu co overlay modułu profesjonalnego.  Po kliknięciu
     * „Tak” zapisuje numer w localStorage (klucz pwzNumber).  Po
     * kliknięciu „Nie” nie zapisuje numeru.  Po dokonaniu wyboru
     * zamyka overlay i przywraca poprzedni stan przewijania.  Opcjonalny
     * callback onComplete jest wywoływany po zamknięciu overlayu.
     */
    function showRememberPwzOverlay(val, onComplete){
      const overlay   = document.getElementById('rememberPwzOverlay');
      const yesBtn    = document.getElementById('rememberPwzYesBtn');
      const noBtn     = document.getElementById('rememberPwzNoBtn');
      if(!overlay || !yesBtn || !noBtn){
        if(typeof onComplete === 'function') onComplete();
        return;
      }
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      overlay.style.display = 'flex';
      function cleanup(){
        overlay.style.display = 'none';
        document.body.style.overflow = prevOverflow;
        yesBtn.removeEventListener('click', yesHandler);
        noBtn.removeEventListener('click', noHandler);
      }
      function yesHandler(){
        cleanup();
        try{
          localStorage.setItem('pwzNumber', val);
        }catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 31431 });
    }
  }
        if(typeof onComplete === 'function') onComplete();
      }
      function noHandler(){
        cleanup();
        if(typeof onComplete === 'function') onComplete();
      }
      yesBtn.addEventListener('click', yesHandler);
      noBtn.addEventListener('click', noHandler);
    }

    /*
     * Aktywuje moduł profesjonalny po pozytywnej weryfikacji numeru PWZ.
     * Ukrywa zbędne elementy, pokazuje główne przyciski, resetuje pola
     * i proponuje zapamiętanie numeru PWZ.  Funkcja przyjmuje numer PWZ,
     * aby ewentualnie zapisać go w localStorage.
     */
    function activateProfessionalModule(val){
      // Ukryj komunikat o błędzie
      pwzError.style.display = 'none';
      // Ukryj instrukcję wpisania PWZ
      try {
        var doctorInfoEl = document.querySelector('.doctor-info');
        if (doctorInfoEl) doctorInfoEl.style.display = 'none';
      } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 31455 });
    }
  }
      // Ukryj kartę z komunikatem modułu (zostanie ukryta również po potwierdzeniu)
      if (professionalModule) {
        professionalModule.style.display = 'none';
      }
      // Pokaż główne przyciski modułu lekarskiego
      if (abxButtonWrapper)   { abxButtonWrapper.style.display   = 'flex'; }
      if (endoButtonWrapper)  { endoButtonWrapper.style.display  = 'flex'; }
      if (igfButtonWrapper)   { igfButtonWrapper.style.display   = 'flex'; }
      // Pokaż przycisk kalkulatora Z‑score, gdy moduł profesjonalny jest aktywowany
      if (typeof zscoreButtonWrapper !== 'undefined' && zscoreButtonWrapper) {
        zscoreButtonWrapper.style.display = 'flex';
      }
      // Pokaż przycisk leczenia otyłości (placeholder)
      if (obesityButtonWrapper) {
        obesityButtonWrapper.style.display = 'flex';
      }
      // Pokaż przycisk leczenia bisfosfonianami, gdy moduł profesjonalny jest aktywowany
      if (bisphosButtonWrapper) {
        bisphosButtonWrapper.style.display = 'flex';
      }
      if (sgaBirthButtonWrapper) {
        sgaBirthButtonWrapper.style.display = 'flex';
      }
      if (sgaBirthCard) {
        sgaBirthCard.style.display = 'none';
      }
      if (toggleSgaBirthBtn) {
        toggleSgaBirthBtn.classList.remove('active-toggle');
      }
      // Ukryj kartę Z‑score – użytkownik otworzy ją ręcznie przyciskiem
      if (typeof zscoreCard !== 'undefined' && zscoreCard) {
        zscoreCard.style.display = 'none';
      }
      // Ukryj kartę leczenia otyłości – użytkownik otworzy ją ręcznie
      if (obesityCard) {
        obesityCard.style.display = 'none';
      }
      if (toggleObesityTherapyBtn) {
        toggleObesityTherapyBtn.classList.remove('active-toggle');
      }
      // Ukryj przyciski poszczególnych testów – użytkownik rozwinie je z menu
      if (ghButtonWrapper)    { ghButtonWrapper.style.display    = 'none'; }
      if (ogttButtonWrapper)  { ogttButtonWrapper.style.display  = 'none'; }
      if (acthButtonWrapper)  { acthButtonWrapper.style.display  = 'none'; }
      // Ukryj podprzyciski IGF‑1
      if (snpButtonWrapper)    { snpButtonWrapper.style.display    = 'none'; }
      if (turnerButtonWrapper) { turnerButtonWrapper.style.display = 'none'; }
      if (pwsButtonWrapper)    { pwsButtonWrapper.style.display    = 'none'; }
      if (sgaButtonWrapper)    { sgaButtonWrapper.style.display    = 'none'; }
      if (igf1ButtonWrapper)   { igf1ButtonWrapper.style.display   = 'none'; }
      // Ukryj wszystkie listy testów
      if (ghTestsLeft  && ghTestsRight)  { ghTestsLeft.classList.remove('active');  ghTestsRight.classList.remove('active'); }
      if (ogttTestsLeft && ogttTestsRight){ ogttTestsLeft.classList.remove('active'); ogttTestsRight.classList.remove('active'); }
      if (acthTestsLeft && acthTestsRight){ acthTestsLeft.classList.remove('active'); acthTestsRight.classList.remove('active'); }
      // Dopasuj szerokości przycisków
      if (typeof adjustTestButtonWidths === 'function') {
        adjustTestButtonWidths();
      }
      // Zapytaj o zapamiętanie numeru PWZ poprzez overlay, jeśli numer nie został jeszcze zapisany
      if(!localStorage.getItem('pwzNumber')){
        // Wywołaj overlay zapamiętywania.  Nie przekazujemy callbacku, ponieważ
        // dalsza logika nie wymaga oczekiwania na wybór użytkownika.  Moduł
        // profesjonalny jest już aktywny, a overlay blokuje interakcję do
        // momentu podjęcia decyzji przez użytkownika.
        showRememberPwzOverlay(val);
      }
      // Ukryj pole wprowadzania numeru
      pwzContainer.style.display = 'none';
      // Wyczyść wpisaną wartość, aby przy ponownym włączeniu modułu wymagane było
      // ponowne wpisanie numeru, jeśli nie został zapamiętany
      pwzNumberInput.value = '';
    }

    function validatePWZ(){
      const val     = pwzNumberInput.value.trim();
      const isValid = verifyPWZ(val);
      // Jeśli numer jest poprawny
      if(isValid){
        // *** Niestandardowa obsługa modułu profesjonalnego ***
        // Zamiast natychmiast pokazywać moduł profesjonalny, wywołujemy overlay
        // z komunikatem edukacyjnym. Po potwierdzeniu aktywujemy moduł.
        pwzError.style.display = 'none';
        const proceedFn = () => activateProfessionalModule(val);
        if (shouldShowProfessionalOverlay()) {
          showProfessionalOverlay(proceedFn);
        } else {
          proceedFn();
        }
        return;
        // Ukryj komunikat o błędzie i pokaż moduł profesjonalny
        pwzError.style.display = 'none';
        professionalModule.style.display = 'block';
        // Po pozytywnej weryfikacji numeru ukryj instrukcję wpisania PWZ
        try {
          var doctorInfoEl = document.querySelector('.doctor-info');
          if (doctorInfoEl) doctorInfoEl.style.display = 'none';
        } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 31552 });
    }
  }
        // Pokaż główne przyciski modułu lekarskiego po pozytywnej weryfikacji numeru
        if (abxButtonWrapper)  abxButtonWrapper.style.display  = 'flex';
        if (endoButtonWrapper)  endoButtonWrapper.style.display  = 'flex';
        if (igfButtonWrapper)   igfButtonWrapper.style.display   = 'flex';
        // Ukryj przyciski poszczególnych testów (GH/OGTT/ACTH) – użytkownik rozwinie je z menu endo
        if (ghButtonWrapper)    ghButtonWrapper.style.display    = 'none';
        if (ogttButtonWrapper)  ogttButtonWrapper.style.display  = 'none';
        if (acthButtonWrapper)  acthButtonWrapper.style.display  = 'none';
        // Ukryj podprzyciski IGF‑1; użytkownik może je rozwinąć później
        if (snpButtonWrapper)    snpButtonWrapper.style.display    = 'none';
        if (turnerButtonWrapper) turnerButtonWrapper.style.display = 'none';
        if (pwsButtonWrapper)    pwsButtonWrapper.style.display    = 'none';
        if (sgaButtonWrapper)    sgaButtonWrapper.style.display    = 'none';
        if (igf1ButtonWrapper)   igf1ButtonWrapper.style.display   = 'none';
        // Nie pokazujemy od razu listy testów. Użytkownik może ją otworzyć później.
        if (ghTestsLeft && ghTestsRight) {
          ghTestsLeft.classList.remove('active');
          ghTestsRight.classList.remove('active');
        }
        if (ogttTestsLeft && ogttTestsRight) {
          ogttTestsLeft.classList.remove('active');
          ogttTestsRight.classList.remove('active');
        }
        if (acthTestsLeft && acthTestsRight) {
          acthTestsLeft.classList.remove('active');
          acthTestsRight.classList.remove('active');
        }
        // Po uaktywnieniu modułu i pokazaniu przycisków testów natychmiast
        // wyrównaj ich szerokości. Wykonujemy to synchronicznie, aby
        // zapewnić prawidłowy wygląd zanim pojawi się blokujący popup
        // (okno confirm). Funkcja adjustTestButtonWidths ustawi taką samą
        // szerokość wszystkich przycisków testów.
        if (typeof adjustTestButtonWidths === 'function') {
          adjustTestButtonWidths();
        }
        // Jeśli w pamięci przeglądarki nie ma jeszcze zapisanego numeru,
        // zapytaj użytkownika o zapamiętanie. Wywołujemy to tylko przy
        // pierwszej poprawnej weryfikacji w danej przeglądarce.
        if(!localStorage.getItem('pwzNumber')){
          const remember = window.confirm('Czy zapamiętać podany numer prawa wykonywania zawodu w tej przeglądarce?');
          if(remember){
            try{
              localStorage.setItem('pwzNumber', val);
            }catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 31596 });
    }
  }
          }
        }
        // Zawsze ukryj pole wprowadzania numeru po udanej walidacji,
        // niezależnie od tego, czy użytkownik zapamiętał numer.
        pwzContainer.style.display = 'none';
        // Wyczyść wpisaną wartość, aby przy ponownym włączeniu modułu
        // wymagane było ponowne wpisanie numeru jeśli nie został zapamiętany.
        pwzNumberInput.value = '';
      } else {
        // Numer niepoprawny. Wyświetl błąd tylko gdy użytkownik coś wpisał.
        pwzError.style.display = val ? 'block' : 'none';
        professionalModule.style.display = 'none';
        // Przy niepoprawnym numerze pokaż ponownie instrukcję wpisania PWZ
        try {
          var doctorInfoEl = document.querySelector('.doctor-info');
          if (doctorInfoEl) doctorInfoEl.style.display = '';
        } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 31615 });
    }
  }
        // Ukryj wszystkie przyciski testów w razie niepoprawnego numeru
        if (ghButtonWrapper)    ghButtonWrapper.style.display    = 'none';
        if (ogttButtonWrapper)  ogttButtonWrapper.style.display  = 'none';
        if (acthButtonWrapper)  acthButtonWrapper.style.display  = 'none';
        if (endoButtonWrapper)  endoButtonWrapper.style.display  = 'none';
        if (igfButtonWrapper)   igfButtonWrapper.style.display   = 'none';
        if (abxButtonWrapper)   abxButtonWrapper.style.display   = 'none';
        if (sgaBirthButtonWrapper) sgaBirthButtonWrapper.style.display = 'none';
        // Ukryj podprzyciski IGF‑1
        if (snpButtonWrapper)    snpButtonWrapper.style.display    = 'none';
        if (turnerButtonWrapper) turnerButtonWrapper.style.display = 'none';
        if (pwsButtonWrapper)    pwsButtonWrapper.style.display    = 'none';
        if (sgaButtonWrapper)    sgaButtonWrapper.style.display    = 'none';
        if (igf1ButtonWrapper)   igf1ButtonWrapper.style.display   = 'none';
        // Ukryj wszystkie listy testów
        if (ghTestsLeft && ghTestsRight) {
          ghTestsLeft.classList.remove('active');
          ghTestsRight.classList.remove('active');
        }
        if (ogttTestsLeft && ogttTestsRight) {
          ogttTestsLeft.classList.remove('active');
          ogttTestsRight.classList.remove('active');
        }
        if(acthTestsLeft && acthTestsRight){
          acthTestsLeft.classList.remove('active');
          acthTestsRight.classList.remove('active');
        }
        // Schowaj kartę antybiotykoterapii i wyłącz podświetlenie przycisku, jeśli numer PWZ jest niepoprawny
        const abxCard = document.getElementById('antibioticTherapyCard');
        if (abxCard) {
          abxCard.style.display = 'none';
        }
        const abxToggleBtn = document.getElementById('toggleAbxTherapy');
        if (abxToggleBtn) {
          abxToggleBtn.classList.remove('active-toggle');
        }
        if (sgaBirthCard) {
          sgaBirthCard.style.display = 'none';
        }
        if (toggleSgaBirthBtn) {
          toggleSgaBirthBtn.classList.remove('active-toggle');
        }
      }
      // Po aktualizacji widoczności przycisków testów (zarówno przy poprawnym,
      // jak i błędnym numerze), wyrównaj ich szerokości w układzie dwukolumnowym.
      // Używamy requestAnimationFrame, aby zmiana była obliczana po zrenderowaniu
      // elementów – inaczej pomiar mógłby zwrócić zbyt małe wartości.
      if (typeof adjustTestButtonWidths === 'function') {
        requestAnimationFrame(() => adjustTestButtonWidths());
      }
    }

      // Po każdej zmianie checkboxa aktualizuj pozycję i wygląd sekcji modułu
      // lekarskiego (np. mniejszy rozmiar w trybie mobilnym przy włączonych
      // wynikach). Funkcję repositionDoctor deklarujemy niżej.
      if (typeof repositionDoctor === 'function') {
        repositionDoctor();
      }
    if(pwzNumberInput){
      pwzNumberInput.addEventListener('input', validatePWZ);
    }

    // Otwieranie i zamykanie listy testów GH
    if(toggleGhTestsBtn){
      toggleGhTestsBtn.addEventListener('click', function(){
        // Zamknij kalkulator Z‑score, jeśli jest otwarty, gdy użytkownik otwiera listę GH
        if (typeof zscoreCard !== 'undefined' && zscoreCard && zscoreCard.style.display !== 'none') {
          zscoreCard.style.display = 'none';
          if (typeof toggleZscoreBtn !== 'undefined' && toggleZscoreBtn) toggleZscoreBtn.classList.remove('active-toggle');
        }
        // Jeśli nie znaleziono kontenerów testów, przerwij
        if(!ghTestsLeft || !ghTestsRight) return;
        // Listę testów uważamy za widoczną, jeśli lewy kontener ma klasę 'active'
        const currentlyActive = ghTestsLeft.classList.contains('active');
        if(currentlyActive){
          // Ukryj oba kontenery
          ghTestsLeft.classList.remove('active');
          ghTestsRight.classList.remove('active');
        } else {
          // Pokaż oba kontenery i przelicz dawki
          ghTestsLeft.classList.add('active');
          ghTestsRight.classList.add('active');
          computeGhResults();
        }
        // Po zmianie widoczności listy GH aktualizujemy stan aktywnego przycisku.
        try {
          if (document.body && document.body.classList.contains('liquid-ios26')) {
            const isActiveNow = ghTestsLeft.classList.contains('active');
            if (isActiveNow) {
              toggleGhTestsBtn.classList.add('active-toggle');
            } else {
              toggleGhTestsBtn.classList.remove('active-toggle');
            }
          }
        } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 31710 });
    }
  }
      });
    }

    // Otwieranie i zamykanie listy testów OGTT/GnRH
    if(toggleOgttTestsBtn){
      toggleOgttTestsBtn.addEventListener('click', function(){
        // Zamknij kalkulator Z‑score, jeśli jest otwarty, gdy użytkownik otwiera listę OGTT
        if (typeof zscoreCard !== 'undefined' && zscoreCard && zscoreCard.style.display !== 'none') {
          zscoreCard.style.display = 'none';
          if (typeof toggleZscoreBtn !== 'undefined' && toggleZscoreBtn) toggleZscoreBtn.classList.remove('active-toggle');
        }
        if(!ogttTestsLeft || !ogttTestsRight) return;
        const isActive = ogttTestsLeft.classList.contains('active');
        if(isActive){
          ogttTestsLeft.classList.remove('active');
          ogttTestsRight.classList.remove('active');
        } else {
          ogttTestsLeft.classList.add('active');
          ogttTestsRight.classList.add('active');
          computeOgttResults();
        }
        // Aktualizuj aktywne podświetlenie przycisku OGTT
        try {
          if (document.body && document.body.classList.contains('liquid-ios26')) {
            const isActiveNow = ogttTestsLeft.classList.contains('active');
            if (isActiveNow) {
              toggleOgttTestsBtn.classList.add('active-toggle');
            } else {
              toggleOgttTestsBtn.classList.remove('active-toggle');
            }
          }
        } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 31744 });
    }
  }
      });
    }
    // Otwieranie i zamykanie listy testów ACTH/TRH
    if(toggleActhTestsBtn){
      toggleActhTestsBtn.addEventListener('click', function(){
        // Zamknij kalkulator Z‑score, jeśli jest otwarty, gdy użytkownik otwiera listę ACTH
        if (typeof zscoreCard !== 'undefined' && zscoreCard && zscoreCard.style.display !== 'none') {
          zscoreCard.style.display = 'none';
          if (typeof toggleZscoreBtn !== 'undefined' && toggleZscoreBtn) toggleZscoreBtn.classList.remove('active-toggle');
        }
        if(!acthTestsLeft || !acthTestsRight) return;
        const isActive = acthTestsLeft.classList.contains('active');
        if(isActive){
          acthTestsLeft.classList.remove('active');
          acthTestsRight.classList.remove('active');
        } else {
          acthTestsLeft.classList.add('active');
          acthTestsRight.classList.add('active');
          computeActhResults();
        }
        // Aktualizuj aktywne podświetlenie przycisku ACTH
        try {
          if (document.body && document.body.classList.contains('liquid-ios26')) {
            const isActiveNow = acthTestsLeft.classList.contains('active');
            if (isActiveNow) {
              toggleActhTestsBtn.classList.add('active-toggle');
            } else {
              toggleActhTestsBtn.classList.remove('active-toggle');
            }
          }
        } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 31777 });
    }
  }
      });
    }

    // Otwieranie i zamykanie listy testów endokrynologicznych (GH/OGTT/ACTH)
    // Kliknięcie w przycisk „Testy w endokrynologii” powoduje rozwinięcie lub zwinięcie listy testów GH, OGTT i ACTH.
    if (toggleEndoTestsBtn) {
      toggleEndoTestsBtn.addEventListener('click', function() {
        // Zamknij kalkulator Z‑score, jeśli jest otwarty, gdy użytkownik otwiera lub zamyka listę endokrynologiczną
        if (typeof zscoreCard !== 'undefined' && zscoreCard && zscoreCard.style.display !== 'none') {
          zscoreCard.style.display = 'none';
          if (typeof toggleZscoreBtn !== 'undefined' && toggleZscoreBtn) toggleZscoreBtn.classList.remove('active-toggle');
        }
        // Jeżeli przyciski testów GH/OGTT/ACTH są widoczne (display !== 'none'), traktujemy listę jako otwartą
        const isVisible = ghButtonWrapper && ghButtonWrapper.style.display !== 'none';
        if (isVisible) {
          // Lista jest otwarta – chowamy przyciski poszczególnych testów i zwijamy otwarte karty testów
          if (ghButtonWrapper)    ghButtonWrapper.style.display    = 'none';
          if (ogttButtonWrapper)  ogttButtonWrapper.style.display  = 'none';
          if (acthButtonWrapper)  acthButtonWrapper.style.display  = 'none';
          // Zamknij wszystkie karty testów GH, OGTT i ACTH
          if (ghTestsLeft && ghTestsRight) {
            ghTestsLeft.classList.remove('active');
            ghTestsRight.classList.remove('active');
          }
          if (ogttTestsLeft && ogttTestsRight) {
            ogttTestsLeft.classList.remove('active');
            ogttTestsRight.classList.remove('active');
          }
          if (acthTestsLeft && acthTestsRight) {
            acthTestsLeft.classList.remove('active');
            acthTestsRight.classList.remove('active');
          }
        } else {
          // Lista jest zwinięta – pokaż przyciski testów GH/OGTT/ACTH
          if (ghButtonWrapper)    ghButtonWrapper.style.display    = 'flex';
          if (ogttButtonWrapper)  ogttButtonWrapper.style.display  = 'flex';
          if (acthButtonWrapper)  acthButtonWrapper.style.display  = 'flex';
        }
        // Po zmianie widoczności wyrównaj szerokość przycisków w układzie dwukolumnowym
        if (typeof adjustTestButtonWidths === 'function') {
          requestAnimationFrame(() => adjustTestButtonWidths());
        }
        // Aktualizuj aktywne podświetlenie przycisku „Testy w endokrynologii”
        try {
          if (document.body && document.body.classList.contains('liquid-ios26')) {
            const listOpen = ghButtonWrapper && ghButtonWrapper.style.display !== 'none';
            if (listOpen) {
              toggleEndoTestsBtn.classList.add('active-toggle');
            } else {
              toggleEndoTestsBtn.classList.remove('active-toggle');
              // Zwijanie listy usuwa również podświetlenie z podprzycisków GH/OGTT/ACTH
              if (typeof toggleGhTestsBtn !== 'undefined' && toggleGhTestsBtn)   toggleGhTestsBtn.classList.remove('active-toggle');
              if (typeof toggleOgttTestsBtn !== 'undefined' && toggleOgttTestsBtn) toggleOgttTestsBtn.classList.remove('active-toggle');
              if (typeof toggleActhTestsBtn !== 'undefined' && toggleActhTestsBtn) toggleActhTestsBtn.classList.remove('active-toggle');
            }
          }
        } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 31836 });
    }
  }
      });
    }

    // Otwieranie i zamykanie listy testów IGF‑1 (SNP, Zespół Turnera, Zespół PWS, SGA, IGF‑1)
    // Kliknięcie w przycisk „Leczenie hormonem wzrostu / IGF‑1” rozwija lub zwija listę pięciu podprzycisków.
    if (toggleIgfTestsBtn) {
      toggleIgfTestsBtn.addEventListener('click', function() {
        // Zamknij kalkulator Z‑score, jeśli jest otwarty, gdy użytkownik otwiera lub zamyka listę IGF
        if (typeof zscoreCard !== 'undefined' && zscoreCard && zscoreCard.style.display !== 'none') {
          zscoreCard.style.display = 'none';
          if (typeof toggleZscoreBtn !== 'undefined' && toggleZscoreBtn) toggleZscoreBtn.classList.remove('active-toggle');
        }
        // Sprawdź, czy pierwszy podprzycisk jest aktualnie widoczny
        const isOpen = snpButtonWrapper && snpButtonWrapper.style.display !== 'none';
        if (isOpen) {
          // Lista jest otwarta – chowamy wszystkie podprzyciski IGF‑1
          if (snpButtonWrapper)    snpButtonWrapper.style.display    = 'none';
          if (turnerButtonWrapper) turnerButtonWrapper.style.display = 'none';
          if (pwsButtonWrapper)    pwsButtonWrapper.style.display    = 'none';
          if (sgaButtonWrapper)    sgaButtonWrapper.style.display    = 'none';
          if (igf1ButtonWrapper)   igf1ButtonWrapper.style.display   = 'none';
        } else {
          // Lista jest zamknięta – pokaż wszystkie podprzyciski IGF‑1
          if (snpButtonWrapper)    snpButtonWrapper.style.display    = 'flex';
          if (turnerButtonWrapper) turnerButtonWrapper.style.display = 'flex';
          if (pwsButtonWrapper)    pwsButtonWrapper.style.display    = 'flex';
          if (sgaButtonWrapper)    sgaButtonWrapper.style.display    = 'flex';
          if (igf1ButtonWrapper)   igf1ButtonWrapper.style.display   = 'flex';
        }
        // Wyrównaj szerokości przycisków po zmianie
        if (typeof adjustTestButtonWidths === 'function') {
          requestAnimationFrame(() => adjustTestButtonWidths());
        }
      });
    }

    /**
     * Oblicza dawki dla poszczególnych testów stymulacyjnych GH i aktualizuje karty.
     * Wzory obliczeniowe:
     *   – Arginina: 0,5 g/kg masy ciała, maks. 30 g.
     *   – Klonidyna: 0,10–0,15 mg/m² powierzchni ciała (podajemy w mikrogramach).
     *   – L‑Dopa: 300 mg/m² powierzchni ciała; wg masy ciała <15 kg: 125 mg, 15–35 kg: 250 mg, >35 kg: 500 mg.
     *   – Insulina: 0,1 j./kg; w szczególnych przypadkach (deficyt GH, <5 r.ż.) 0,05 j./kg.
     *   – Glukagon: 0,03 mg/kg masy ciała, maks. 1 mg; >90 kg: 1,5 mg.
     */
    function computeGhResults(){
      const weightInput = document.getElementById('weight');
      const heightInput = document.getElementById('height');
      if(!weightInput || !heightInput) return;
      const weight = parseFloat(weightInput.value);
      const height = parseFloat(heightInput.value);
      // Jeśli brak danych, wyświetl komunikat w kartach
      if(!(weight > 0 && height > 0)){
        const cards = document.querySelectorAll('#ghTestsLeft .gh-test-card, #ghTestsRight .gh-test-card');
        cards.forEach(card => {
          const p = card.querySelector('p');
          if(p){
            p.textContent = 'Wprowadź wagę i wzrost, aby obliczyć dawkę.';
          }
        });
        return;
      }
      // Powierzchnia ciała – wzór Mostellera (cm i kg): sqrt((wzrost_cm × masa_kg) / 3600)
      const bsa = Math.sqrt((height * weight) / 3600);
      // Test z argininą: 0,5 g/kg, maks. 30 g
      const arginineDose = Math.min(weight * 0.5, 30);
      // Test z klonidyną: 0,10–0,15 mg/m²; przeliczenie na µg (1 mg = 1000 µg)
      // Zakres dawki w mikrogramach obliczamy jak dotychczas.
      const clonidineLowUg  = bsa * 0.10 * 1000;
      const clonidineHighUg = bsa * 0.15 * 1000;

      /*
       * Przeliczanie dawek klonidyny na liczbę tabletek Iporel.
       * Jedna tabletka Iporelu zawiera 75 µg substancji czynnej. Ponieważ
       * tabletkę można bezpiecznie podzielić jedynie na pół, zaokrąglamy
       * obliczoną liczbę tabletek do najbliższej połówki. Dodatkowo
       * prezentujemy odpowiadającą temu zaokrągleniu ilość w mikrogramach.
       */
      const iporelTabUg = 75;
      // Zaokrąglenie do najbliższej 0,5 tabletki
      const roundToHalf = (val) => Math.round(val * 2) / 2;
      const iporelLowTabs  = roundToHalf(clonidineLowUg  / iporelTabUg);
      const iporelHighTabs = roundToHalf(clonidineHighUg / iporelTabUg);
      // Formatowanie liczby tabletek tak, aby zamiast kropki użyć przecinka
      const formatTablet = (t) => {
        // jeśli wartość jest całkowita, nie pokazujemy części dziesiętnej
        const str = (t % 1 === 0) ? t.toFixed(0) : t.toString();
        return str.replace('.', ',');
      };
      // Formatowanie mikrogramów – jeśli ma część dziesiętną .5, wyświetlamy jedną cyfrę
      const formatMicrog = (ug) => {
        // zaokrąglamy do 0,1 µg, choć wartości połówkowe dają dokładnie x,5
        const rounded = Math.round(ug * 10) / 10;
        // usuwamy .0 aby nie wyświetlać zbędnych zer po przecinku
        const str = Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(1);
        return str.replace('.', ',');
      };
      const iporelRangeTabStr = `${formatTablet(iporelLowTabs)}–${formatTablet(iporelHighTabs)} tabl.`;
      const iporelRangeUgLow  = iporelLowTabs  * iporelTabUg;
      const iporelRangeUgHigh = iporelHighTabs * iporelTabUg;
      const iporelRangeUgStr  = `${formatMicrog(iporelRangeUgLow)}–${formatMicrog(iporelRangeUgHigh)} µg`;
      const iporelInfo = `Iporel: ${iporelRangeTabStr} (${iporelRangeUgStr})`;
      // Test z L‑Dopą: 300 mg/m² oraz progowe dawki wg masy ciała
      const lDopaPerM2 = bsa * 300; // mg
      let lDopaWeightCat;
      if(weight < 15)      lDopaWeightCat = 125;
      else if(weight <= 35) lDopaWeightCat = 250;
      else                  lDopaWeightCat = 500;
      // Test z insuliną: 0,1 j./kg; dodatkowo 0,05 j./kg
      // W zależności od wieku dziecka dawki insuliny mogą ulec zmianie. Domyślnie
      // obliczamy wartości 0,1 j./kg oraz 0,05 j./kg, ale wybór odpowiedniej
      // dawki nastąpi później w opisie. Jeśli wiek <5 lat, stosujemy tylko 0,05 j./kg.
      const insulinDose    = weight * 0.1;
      const insulinDoseLow = weight * 0.05;
      // Test z glukagonem: 0,03 mg/kg (maks. 1 mg; >90 kg: 1,5 mg)
      let glucagonDose = weight * 0.03;
      if(weight > 90){
        glucagonDose = 1.5;
      }else if(glucagonDose > 1){
        glucagonDose = 1;
      }
      // Ustal opis dawki insuliny w zależności od wieku. Jeśli wiek nie został
      // podany, poproś użytkownika o jego wprowadzenie. Przy wieku <5 lat
      // stosowana jest dawka 0,05 j./kg; w przeciwnym razie prezentujemy
      // domyślną dawkę 0,1 j./kg z alternatywną dawką 0,05 j./kg.
      let insulinDesc;
      // Wiek z uwzględnieniem miesięcy (lata + miesiące/12). Wiek 0 lat jest
      // prawidłowy, o ile został wpisany jawnie; puste pole wieku nadal oznacza brak danych.
      const ageStateForInsulin = (typeof vildaGetMainAgeInputState === 'function') ? vildaGetMainAgeInputState() : null;
      const ageVal = ageStateForInsulin && ageStateForInsulin.value != null ? ageStateForInsulin.value : getAgeDecimal();
      if(!(ageStateForInsulin ? ageStateForInsulin.validNonNegative : vildaIsFiniteNonNegative(ageVal))){
        insulinDesc = 'Podaj wiek dziecka, aby obliczyć dawkę insuliny.';
      } else if(ageVal < 5){
        // Zmieniamy separator dziesiętny na przecinek dla dawki insuliny
        insulinDesc = `Dawka: ${insulinDoseLow.toFixed(2).replace('.', ',')} j. (0,05 j./kg)`;
      } else {
        // Używamy przecinków jako separatorów dziesiętnych dla obu dawek
        insulinDesc = `Dawka: ${insulinDose.toFixed(2).replace('.', ',')} j. (0,1 j./kg); alternatywnie ${insulinDoseLow.toFixed(2).replace('.', ',')} j. (0,05 j./kg)`;
      }
      // Przygotuj opisy dla kart. Do wyniku testu z klonidyną dodajemy również
      // informację o liczbie tabletek Iporelu potrzebnych do podania dawki.
      const descriptions = [
        `Zakres dawki: ${Math.round(clonidineLowUg)}–${Math.round(clonidineHighUg)} µg (0,10–0,15 mg/m²); ${iporelInfo}`,
        // Zamiana kropki na przecinek dla dawki glukagonu
        `Dawka: ${glucagonDose.toFixed(2).replace('.', ',')} mg (0,03 mg/kg; maks. 1 mg, >90 kg: 1,5 mg)` ,
        insulinDesc,
        // Zamiana kropki na przecinek dla dawki argininy
        `Dawka: ${arginineDose.toFixed(1).replace('.', ',')} g (0,5 g/kg; maks. 30 g)` ,
        `Dawka wg masy: ${lDopaWeightCat} mg; wg 300 mg/m²: ${Math.round(lDopaPerM2)} mg`
      ];
      // Przygotuj tablicę ostrzeżeń przeciwwskazań w zależności od wieku dziecka.
      const warnings = ['', '', '', '', ''];
      const ageStateForWarn = (typeof vildaGetMainAgeInputState === 'function') ? vildaGetMainAgeInputState() : null;
      const ageValForWarn = ageStateForWarn && ageStateForWarn.value != null ? ageStateForWarn.value : getAgeDecimal();
      if(ageStateForWarn ? ageStateForWarn.validNonNegative : vildaIsFiniteNonNegative(ageValForWarn)) {
        // Testy z klonidyną, glukagonem, argininą oraz L‑Dopą są przeciwwskazane u dzieci <2 r.ż.
        if(ageValForWarn < 2) {
          warnings[0] = 'Test przeciwwskazany u dzieci poniżej 2. roku życia!';
          warnings[1] = 'Test przeciwwskazany u dzieci poniżej 2. roku życia!';
          warnings[3] = 'Test przeciwwskazany u dzieci poniżej 2. roku życia!';
          warnings[4] = 'Test przeciwwskazany u dzieci poniżej 2. roku życia!';
        }
        // Test z insuliną jest przeciwwskazany u dzieci <5 r.ż.
        if(ageValForWarn < 5) {
          warnings[2] = 'Test przeciwwskazany u dzieci poniżej 5. roku życia!';
        }
      }
      // Zaktualizuj treści kart z uwzględnieniem ostrzeżeń. Pobieramy karty z kontenerów
      // ghTestsLeft i ghTestsRight. Kolejność kart odpowiada kolejności testów:
      // klonidyna, glukagon, insulina, arginina, L‑Dopa.
      const cards = document.querySelectorAll('#ghTestsLeft .gh-test-card, #ghTestsRight .gh-test-card');
      cards.forEach((card, idx) => {
        const p = card.querySelector('p');
        if(!p) return;
        const desc = descriptions[idx] || '';
        const warn = warnings[idx] || '';
        if(warn) {
          // Wstawiamy span z klasą ostrzeżenia poniżej opisu przez kontrolowany helper HTML.
          vildaAppSetTrustedHtml(p, `${desc}<br><span class="gh-test-warning">${warn}</span>`, 'app:p');
        } else {
          // Jeśli nie ma ostrzeżenia, zachowujemy zwykły tekst (textContent),
          // co zapobiega interpretacji znaków specjalnych jako HTML.
          p.textContent = desc;
        }
      });
    }

    /**
     * Oblicza dawki dla testu OGTT oraz GnRH/LHRH i aktualizuje karty wynikowe.
     * Wzory obliczeniowe:
     *   – OGTT: 1,75 g/kg masy ciała; maksymalnie 75 g.
     *   – GnRH/LHRH: 2,5 µg/kg masy ciała; maksymalnie 100 µg.
     * Jeśli waga nie została podana, prosi użytkownika o jej wprowadzenie.
     */
    function computeOgttResults(){
      const weightInput = document.getElementById('weight');
      if(!weightInput) return;
      const weight = parseFloat(weightInput.value);
      // Pobierz oba paragrafy kart testów OGTT i GnRH
      const ogttCard = document.querySelector('#ogttTestsLeft .gh-test-card p');
      const gnrhCard = document.querySelector('#ogttTestsRight .gh-test-card p');
      if(!(weight > 0)){
        if(ogttCard) ogttCard.textContent = 'Wprowadź wagę, aby obliczyć dawkę.';
        if(gnrhCard) gnrhCard.textContent = 'Wprowadź wagę, aby obliczyć dawkę.';
        return;
      }
      // Obliczenie dawek
      let ogttDose = weight * 1.75;
      if(ogttDose > 75) ogttDose = 75;
      let gnrhDose = weight * 2.5;
      if(gnrhDose > 100) gnrhDose = 100;
      // Formatowanie z przecinkiem zamiast kropki
      const formatDose = (dose) => {
        return (dose % 1 === 0 ? dose.toFixed(0) : dose.toFixed(2)).replace('.', ',');
      };
      if(ogttCard) ogttCard.textContent = `Dawka: ${formatDose(ogttDose)}\u00a0g (1,75\u00a0g/kg; maks.\u00a075\u00a0g)`;
      if(gnrhCard) gnrhCard.textContent = `Dawka: ${formatDose(gnrhDose)}\u00a0µg (2,5\u00a0µg/kg; maks.\u00a0100\u00a0µg)`;
    }

    /**
     * Oblicza dawki dla testu z dużą dawką ACTH oraz testu z TRH.
     * Wzory obliczeniowe:
     *   – ACTH: dzieci >2 lat – 250 µg; dzieci ≤2 lat – 15 µg/kg masy ciała (maks. 125 µg).
     *   – TRH: 7 µg/kg masy ciała; maksymalnie 200 µg. Część źródeł podaje dawkę maks. 400 µg.
     * Jeśli wymagane dane (wiek lub waga) nie zostały podane, wyświetla komunikat.
     */
    function computeActhResults(){
      const weightInput = document.getElementById('weight');
      const weight = weightInput ? parseFloat(weightInput.value) : NaN;
      // Użyj funkcji pomocniczej do obliczenia wieku z dokładnością do miesięcy.
      const ageState = (typeof vildaGetMainAgeInputState === 'function') ? vildaGetMainAgeInputState() : null;
      const age = ageState && ageState.value != null ? ageState.value : getAgeDecimal();
      // Pobierz paragrafy kart testów ACTH i TRH
      const acthCard = document.querySelector('#acthTestsLeft .gh-test-card p');
      const trhCard  = document.querySelector('#acthTestsRight .gh-test-card p');
      // ACTH: potrzebujemy wieku i wagi
      if(!((ageState ? ageState.validNonNegative : vildaIsFiniteNonNegative(age))) || !(weight > 0)){
        if(acthCard) acthCard.textContent = 'Podaj wiek i wagę, aby obliczyć dawkę ACTH.';
      } else {
        let acthDose;
        if(age <= 2){
          acthDose = weight * 15;
          if(acthDose > 125) acthDose = 125;
        } else {
          acthDose = 250;
        }
        const doseStr = (acthDose % 1 === 0 ? acthDose.toFixed(0) : acthDose.toFixed(2)).replace('.', ',');
        if(acthCard) acthCard.textContent = `Dawka: ${doseStr}\u00a0µg (${age <= 2 ? '15\u00a0µg/kg; maks.\u00a0125\u00a0µg' : 'stała dawka 250\u00a0µg'})`;
      }
      // TRH: potrzebujemy wagi
      if(!(weight > 0)){
        if(trhCard) trhCard.textContent = 'Wprowadź wagę, aby obliczyć dawkę.';
      } else {
        let trhDose = weight * 7;
        if(trhDose > 200) trhDose = 200;
        const doseStr = (trhDose % 1 === 0 ? trhDose.toFixed(0) : trhDose.toFixed(2)).replace('.', ',');
        if(trhCard) trhCard.textContent = `Dawka: ${doseStr}\u00a0µg (7\u00a0µg/kg; maks.\u00a0200\u00a0µg; niektóre źródła: maks.\u00a0400\u00a0µg)`;
      }
    }

    // Aktualizuj dawki testów endokrynologicznych przy każdej zmianie wagi, wzrostu
    // lub wieku (w latach i miesiącach).  Dzięki temu wyniki w kartach testów GH/OGTT/ACTH
    // są odświeżane na bieżąco, bez konieczności zamykania i ponownego otwierania kart.
    const weightInputEl  = document.getElementById('weight');
    const heightInputEl  = document.getElementById('height');
    const ageInputEl     = document.getElementById('age');
    const ageMonthsEl    = document.getElementById('ageMonths');
    // Funkcja pomocnicza do podpięcia wielu zdarzeń do jednego elementu.
    function attachListeners(el, handlers){
      if(!el) return;
      ['input','change'].forEach(evt => {
        el.addEventListener(evt, handlers);
      });
    }
    // Przy zmianie wagi i wzrostu przeliczamy wszystkie testy endokrynologiczne
    attachListeners(weightInputEl, function(){
      computeGhResults();
      computeOgttResults();
      computeActhResults();
    });
    attachListeners(heightInputEl, function(){
      computeGhResults();
      computeOgttResults();
      computeActhResults();
    });
    // Przy zmianie wieku (lata) oraz wieku w miesiącach przeliczamy testy zależne od wieku
    attachListeners(ageInputEl, function(){
      computeGhResults();
      computeActhResults();
    });
    attachListeners(ageMonthsEl, function(){
      computeGhResults();
      computeActhResults();
    });
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

/* ——— seam kalkulacji estimated intake: 8O-9e ——— */
function buildEstimatedIntakeHistoryForRisk(rows){
  return (Array.isArray(rows) ? rows : []).map(r => ({ ageMonths: r.ageMonths, weight: r.weight }));
}

function buildEstimatedIntakeWindowHistory(rows){
  return (Array.isArray(rows) ? rows : []).map(row => ({
    ageMonths: row.ageMonths,
    ageYears: row.ageYears,
    height: row.height,
    weight: row.weight
  }));
}

function clearEstimatedIntakeWindowState(){
  window.intakeHistory = null;
  window.intakeEstimatedKcalPerDay = null;
  return { intakeHistory: window.intakeHistory, intakeEstimatedKcalPerDay: window.intakeEstimatedKcalPerDay };
}

function commitEstimatedIntakeWindowState(rows, intakeKcalPerDay){
  window.intakeHistory = buildEstimatedIntakeWindowHistory(rows);
  window.intakeEstimatedKcalPerDay = intakeKcalPerDay;
  return { intakeHistory: window.intakeHistory, intakeEstimatedKcalPerDay: window.intakeEstimatedKcalPerDay };
}

function buildEstimatedIntakeCalcInputModel(options){
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
    step: '8O-9f',
    basics: basics || {},
    sex: basics && basics.sex,
    height: basics && basics.height,
    palRaw,
    pal,
    rows: safeRows,
    historyForRisk: buildEstimatedIntakeHistoryForRisk(safeRows)
  };
}

function buildEstimatedIntakeLastObservedModel(inputModel){
  const input = inputModel || {};
  const basics = input.basics || {};
  const rows = Array.isArray(input.rows) ? input.rows : [];
  const historyForRisk = Array.isArray(input.historyForRisk) ? input.historyForRisk : buildEstimatedIntakeHistoryForRisk(rows);
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
  const plan = calcModel && calcModel.commitPlan ? calcModel.commitPlan : { action: 'clear' };
  if (plan.action === 'clear') {
    return clearEstimatedIntakeWindowState();
  }
  return commitEstimatedIntakeWindowState(plan.rows || (calcModel && calcModel.rows) || [], plan.intakeKcalPerDay == null ? null : plan.intakeKcalPerDay);
}

function runEstimatedIntakePostRenderRisk(calcModel){
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
      globalThis.vildaLogSwallowedCatch('app.js', e, { step: '8O-9f', helper: 'runEstimatedIntakePostRenderRisk:check12mLossOrange' });
    }
  }
}

function getEstimatedIntakeCalcOutputTargets(){
  const res = (typeof document !== 'undefined' && document && typeof document.getElementById === 'function')
    ? document.getElementById('intakeResults')
    : null;
  const legendEl = (typeof document !== 'undefined' && document && typeof document.getElementById === 'function')
    ? document.getElementById('intakeLegend')
    : null;
  return { res, legendEl };
}

function getEstimatedIntakeCalcBranch(inputModel, targets){
  const rows = inputModel && Array.isArray(inputModel.rows) ? inputModel.rows : [];
  if (!targets || !targets.res) return 'missing-results-mount';
  if (!rows.length) return 'empty-rows-message';
  if (rows.length === 1) return 'single-row-maintenance';
  return 'multi-row-interval-render';
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

function describeEstimatedIntakeCalcTargets(targets){
  const safeTargets = targets || {};
  const res = safeTargets.res || null;
  const legendEl = safeTargets.legendEl || null;
  return {
    hasResults: !!res,
    hasLegend: !!legendEl,
    resultsClassName: res ? String(res.className || '') : '',
    resultsHtmlLength: res && typeof res.innerHTML === 'string' ? res.innerHTML.length : null,
    resultsTextLength: res && typeof res.textContent === 'string' ? res.textContent.length : null,
    legendDisplay: legendEl && legendEl.style ? String(legendEl.style.display || '') : ''
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
    step: '8O-9f',
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
      buildEstimatedIntakeCalculationModel: !!(root && root.VildaEstimatedIntake && typeof root.VildaEstimatedIntake.buildEstimatedIntakeCalculationModel === 'function')
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
      stillInAppJs: ['calcEstimatedIntake orchestration', 'HTML render', 'window state commit', 'post-render risk checks', 'setupEstimatedIntake', 'intakeAddRow', 'hasPotentialIntakeAlerts'],
      moduleMustNot: ['render DOM', 'write window.intakeHistory', 'write window.intakeEstimatedKcalPerDay', 'call check12mLossOrange']
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
    step: '8O-9f',
    kind: 'estimated-intake-calc-seam-audit',
    readOnly: true,
    executedCalcEstimatedIntake: false,
    executedEnergyObservedState: false,
    executedBuildIntakeIntervals: false,
    executedBuildEstimatedIntakeCalculationModel: false,
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
      hasPotentialIntakeAlerts: typeof hasPotentialIntakeAlerts === 'function'
    },
    seam: {
      phases: [
        'read-input-model',
        'build-last-observed-energy-context',
        'build-pure-calculation-model',
        'choose-render-branch',
        'render-dom-results',
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
        'runEstimatedIntakePostRenderRisk'
      ],
      sideEffectBoundaries: [
        'intakeUpdatePalDesc()',
        'vildaAppSetTrustedHtml(res, ...)',
        'legendEl.style.display',
        'window.intakeHistory / window.intakeEstimatedKcalPerDay',
        'energyBuildIntakeObservedState(... mountId=intakeResults)',
        'window.check12mLossOrange(...)'
      ],
      keepInAppJsForNow: [
        'calcEstimatedIntake',
        'hasPotentialIntakeAlerts',
        'render estimated intake result DOM',
        'window state commit',
        'post-render risk checks'
      ],
      nextRecommendedStep: '8O-9g-lite — wydzielenie rendererów HTML estimated intake bez zmiany commitów ani alertów'
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

  const res  = document.getElementById('intakeResults');
  const legendEl = document.getElementById('intakeLegend');
  if (legendEl) {
    legendEl.style.display = 'none';
  }
  if(!res) return;
  clearIntakeResultsAlertState('intakeResults');

  if(!rows.length){
    try {
      commitEstimatedIntakeCalcModelWindowState(calcModel);
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { step: '8O-9f', helper: 'calcEstimatedIntake:clearModelCommit' });
    }
  }
    vildaAppSetTrustedHtml(res, '<p>Uzupełnij co najmniej dwa wiersze, aby wyliczyć szacowane spożycie kalorii na podstawie zmiany masy.</p>', 'app:res');
    return;
  }

  if(rows.length === 1){
    const single = calcModel && calcModel.single ? calcModel.single : null;
    const energy = single ? single.energy : null;
    const modeBadge = single && energy && energy.modeBadge ? energy.modeBadge : (calcModel && calcModel.modeBadge ? calcModel.modeBadge : null);
    const modeBadgeHtml = modeBadge
      ? `<div class="energy-mode-badge-row energy-mode-badge-row--results">${energyRenderModeBadgeHtml(modeBadge)}</div>`
      : '';

    if (single && single.kind === 'infant-under-6') {
      vildaAppSetTrustedHtml(res, `${modeBadgeHtml}<p><strong>Energia:</strong> dla wieku poniżej 6 miesięcy normy nie podają liczbowej wartości energii.</p>`, 'app:res');
    } else if (single && single.kind === 'infant-butte') {
      vildaAppSetTrustedHtml(res, `${modeBadgeHtml}<p><strong>TEE:</strong> ok. <b>${Math.round(single.teeRawKcal)}</b> kcal/d.<br><span class="muted">Wyliczenie wg Butte dla 6–11 mies.</span></p>`, 'app:res');
    } else {
      const tee = single ? single.maintenanceKcal : null;
      const palUsed = single && single.palUsed != null ? single.palUsed : null;
      vildaAppSetTrustedHtml(res, `${modeBadgeHtml}<p><strong>Utrzymanie masy:</strong> ok. <b>${Math.round(tee)}</b> kcal/d (PAL ${palUsed != null ? palUsed.toFixed(1) : '—'}).<br>
        <span class="muted">Dodaj drugi pomiar, aby obliczyć nadwyżkę/deficyt z trendu masy.</span></p>`, 'app:res');
    }

    try {
      commitEstimatedIntakeCalcModelWindowState(calcModel);
      runEstimatedIntakePostRenderRisk(calcModel);
    } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { step: '8O-9f', helper: 'calcEstimatedIntake:singleModelPostRender' });
    }
  }
    return;
  }

  const intervals = calcModel && Array.isArray(calcModel.intervals) ? calcModel.intervals : [];
  const modeBadge = calcModel && calcModel.modeBadge ? calcModel.modeBadge : null;
  let cards = modeBadge
    ? `<div class="energy-mode-badge-row energy-mode-badge-row--results">${energyRenderModeBadgeHtml(modeBadge)}</div>`
    : '';
  intervals.forEach(r=>{
    cards += `<div class="intake-result-card">
      <p><strong>Okres:</strong> ${r.from.toFixed(2).replace('.', ',')} ➔ ${r.to.toFixed(2).replace('.', ',')} l.</p>
      <p><strong>Dni:</strong> ${r.days}</p>
      <p><strong>Δ masa:</strong> ${r.dW>0?'+':''}${r.dW.toFixed(2).replace('.', ',')} kg</p>
      <p><strong>Oczekiwany przyrost:</strong> ${r.isChild ? ((r.expectedGain>0?'+':'') + r.expectedGain.toFixed(2).replace('.', ',') + ' kg') : '—'}</p>
      <p><strong>Δ vs norma:</strong> ${r.isChild ? ((r.deltaVsNorm>0?'+':'') + r.deltaVsNorm.toFixed(2).replace('.', ',') + ' kg') : '—'}</p>
      <p><strong>Nadmiar/deficyt (kcal/d):</strong> ${r.energyDeltaPerDay>=0?'+':''}${r.energyDeltaPerDay}</p>
      <p><strong>Szac. spożycie (kcal/d):</strong> ${r.intakePerDay}</p>
    </div>`;
  });
  if (calcModel && calcModel.hasChildIntervals) {
    cards += `<p class="muted intake-results-note" style="margin:.25rem 0 0;">* Oczekiwany przyrost – przyrost masy oszacowany na podstawie medianowych (50 c) przyrostów dla wieku oraz rzeczywistego wzrostu dziecka.</p>`;
  }
  vildaAppSetTrustedHtml(res, cards, 'app:res');

  if (legendEl && rows.length >= 2) {
    legendEl.style.display = 'block';
  }

  try {
    commitEstimatedIntakeCalcModelWindowState(calcModel);
    runEstimatedIntakePostRenderRisk(calcModel);
  } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { step: '8O-9f', helper: 'calcEstimatedIntake:multiModelPostRender' });
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

  const scheduleIntakeVisibilityUpdate = (function(){
    let rafId = null;
    let latestOptions = null;
    return function(options){
      latestOptions = options || { preserveRows: true, recalcIfOpen: true };
      if (rafId != null) return;
      const runner = function(){
        rafId = null;
        const opts = latestOptions || { preserveRows: true, recalcIfOpen: true };
        latestOptions = null;
        updateIntakeToggleVisibility(opts);
      };
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        rafId = window.requestAnimationFrame(runner);
      } else {
        rafId = window.setTimeout(runner, 16);
      }
    };
  })();

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
      el.addEventListener('input', ()=> scheduleIntakeVisibilityUpdate({ preserveRows: true, recalcIfOpen: true }));
      el.addEventListener('change', ()=> scheduleIntakeVisibilityUpdate({ preserveRows: true, recalcIfOpen: true }));
    }
  });

  document.querySelectorAll('input[name="dataSource"]').forEach(el => {
    el.addEventListener('change', ()=> scheduleIntakeVisibilityUpdate({ preserveRows: true, recalcIfOpen: true }));
  });

  // natychmiastowa ocena widoczności przy pierwszym załadowaniu
  scheduleIntakeVisibilityUpdate({ preserveRows: true, recalcIfOpen: true });
  // Uruchom ponownie po pozostałych listenerach DOMContentLoaded (np. przywracaniu stanu kart).
  window.setTimeout(()=>{
    scheduleIntakeVisibilityUpdate({ preserveRows: true, recalcIfOpen: true });
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
  const debouncedIntakeResizeRecalc = debounce(()=>{
    const visible = card && card.style.display !== 'none';
    if(visible) calcEstimatedIntake();
  }, 120);
  window.addEventListener('resize', debouncedIntakeResizeRecalc);
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
        try { if (typeof window !== 'undefined') window.autoScrollDisabled = !!value; } catch (_) {
          if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
            globalThis.vildaLogSwallowedCatch('app.js', _, { feature: 'applyLoadedData:set-window-autoscroll' });
          }
        }
        try { autoScrollDisabled = !!value; } catch (_) {
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
  // Elementy banera
  const banner   = document.getElementById('consent-banner');
  const btnAccept = document.getElementById('consent-accept');
  const btnDecline = document.getElementById('consent-decline');

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
    // Załaduj skrypt GA4 dopiero po wyrażeniu zgody
    const gaScript = document.createElement('script');
    gaScript.src = 'https://www.googletagmanager.com/gtag/js?id=G-EZZTNV8W07';
    gaScript.async = true;
    document.head.appendChild(gaScript);

    window.dataLayer = window.dataLayer || [];
    function gtag(){ dataLayer.push(arguments); }

    gtag('js', new Date());
    gtag('config', 'G-EZZTNV8W07', {
      anonymize_ip: true
    });
  }

  if (!consent) {
    // Jeśli użytkownik nie udzielił zgody – pokaż baner
    banner.style.display = 'block';
  } else if (consent === 'granted') {
    loadGA();
  }

  btnAccept.addEventListener('click', function() {
    writeAnalyticsConsent('granted');
    banner.style.display = 'none';
    loadGA();
  });

  btnDecline.addEventListener('click', function() {
    writeAnalyticsConsent('denied');
    banner.style.display = 'none';
    // Brak ładowania GA4
  });
})();

})();

// === DODANE: podsumowanie różnic i wyrównanie wysokości kart (2025-11) ===
// Funkcje te obliczają różnice między ostatnim zapisanym pomiarem a
// aktualnymi wartościami wprowadzonymi w formularzu.  Na podstawie
// obliczeń tworzą w sekcji „Ostatni pomiar” dodatkowe wiersze
// informujące o zmianach wzrostu, wagi, BMI, wskaźnika Cole’a oraz
// różnicy do górnej granicy normy BMI.  Kolory wierszy określają, czy
// zmiany są prawidłowe (turkusowy), sygnalizują poprawę u dziecka z
// nadwagą/otyłością (ciemny pomarańczowy) czy też wskazują na problem
// (czerwony).  Funkcja adjustPrevSummaryHeight() sprawia, że karta
// „Ostatni pomiar” ma taką samą wysokość jak karta „Dane użytkownika”.
(function() {
  // Funkcja uaktualniająca wiersz informujący o czasie, jaki upłynął od ostatniego pomiaru.
  // Wiersz ten jest wstawiany jako ukryty placeholder w __renderPrevSummary i ma klasy
  // .time-since-label oraz .time-since-val.  Funkcja wyświetla go dopiero po tym,
  // jak użytkownik wpisze aktualny wiek.  Różnica w czasie jest obliczana na
  // podstawie różnicy wieku (w miesiącach) między obecnym pomiarem a
  // załadowanym poprzednim pomiarem.  Jeśli brak danych lub różnica ≤ 0,
  // wiersz pozostaje ukryty.
  window.updatePrevMeasurementElapsed = function() {
    try {
      const labelEl = document.querySelector('.time-since-label');
      const valEl   = document.querySelector('.time-since-val');
      if (!labelEl || !valEl) return;
      const prev = window.prevMeasurementInfo;
      // Jeżeli brak poprzedniego pomiaru lub nie określono wieku – ukryj wiersz
      if (!prev || !isFinite(prev.ageMonths)) {
        labelEl.style.display = 'none';
        valEl.style.display = 'none';
        return;
      }
      // Pobierz aktualny wiek z formularza (uwzględnia lata + miesiące)
      let ageDec = NaN;
      if (typeof getAgeDecimal === 'function') {
        try { ageDec = getAgeDecimal(); } catch (_) { ageDec = NaN; }
      }
      if (!isFinite(ageDec) || ageDec <= 0) {
        // Wiek nie został uzupełniony – ukryj wiersz
        labelEl.style.display = 'none';
        valEl.style.display = 'none';
        return;
      }
      const ageMonths = Math.round((ageDec || 0) * 12);
      // Oblicz różnicę w miesiącach między bieżącym wiekiem a poprzednim pomiarem
      const diffMonthsTotal = ageMonths - prev.ageMonths;
      if (!isFinite(diffMonthsTotal) || diffMonthsTotal <= 0) {
        // Brak różnicy lub wiek młodszy niż poprzedni – ukryj wiersz
        labelEl.style.display = 'none';
        valEl.style.display = 'none';
        return;
      }
      // Oblicz lata i pozostałe miesiące
      const diffYears = Math.floor(diffMonthsTotal / 12);
      const diffMonths = diffMonthsTotal % 12;
      let phraseFull = '';
      if (diffYears === 0 && diffMonths === 0) {
        phraseFull = 'minęło mniej niż miesiąc';
      } else {
        // Buduj część opisującą lata i miesiące
        let yearPart = '';
        let monthPart = '';
        if (diffYears > 0) {
          let yearWord;
          if (diffYears === 1) {
            yearWord = 'rok';
          } else if (diffYears % 10 >= 2 && diffYears % 10 <= 4 && (diffYears % 100 < 10 || diffYears % 100 >= 20)) {
            yearWord = 'lata';
          } else {
            yearWord = 'lat';
          }
          yearPart = `${diffYears} ${yearWord}`;
        }
        if (diffMonths > 0) {
          let monthWord;
          if (diffMonths === 1) {
            monthWord = 'miesiąc';
          } else if (diffMonths % 10 >= 2 && diffMonths % 10 <= 4 && (diffMonths % 100 < 10 || diffMonths % 100 >= 20)) {
            monthWord = 'miesiące';
          } else {
            monthWord = 'miesięcy';
          }
          monthPart = `${diffMonths} ${monthWord}`;
        }
        let timeText;
        if (yearPart && monthPart) {
          timeText = `${yearPart} i ${monthPart}`;
        } else if (yearPart) {
          timeText = `${yearPart}`;
        } else {
          timeText = `${monthPart}`;
        }
        // Określ czasownik (minął/minęły/minęło)
        let verb;
        if (diffYears > 0) {
          if (diffYears === 1) {
            verb = 'minął';
          } else if (diffYears >= 2 && diffYears <= 4) {
            verb = 'minęły';
          } else {
            verb = 'minęło';
          }
        } else {
          // tylko miesiące
          if (diffMonths === 1) {
            verb = 'minął';
          } else if (diffMonths >= 2 && diffMonths <= 4) {
            verb = 'minęły';
          } else {
            verb = 'minęło';
          }
        }
        phraseFull = `${verb} ${timeText}`;
      }
      // Uaktualnij tekst i pokaż wiersz
      labelEl.style.display = '';
      valEl.style.display = '';
      const span = valEl.querySelector('span');
      if (span) span.textContent = phraseFull;
    } catch (_) {
      // W przypadku błędu ukryj wiersz
      try {
        const labelEl = document.querySelector('.time-since-label');
        const valEl   = document.querySelector('.time-since-val');
        if (labelEl) labelEl.style.display = 'none';
        if (valEl) valEl.style.display = 'none';
      } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 36749 });
    }
  }
    }
  };
  // Globalna funkcja aktualizująca sekcję różnic w karcie poprzedniego pomiaru
  window.updatePrevSummaryDiff = function() {
    try {
      // Zawsze uaktualnij wiersz z informacją, ile czasu minęło od ostatniego pomiaru.
      if (typeof window.updatePrevMeasurementElapsed === 'function') {
        try { window.updatePrevMeasurementElapsed(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 36757 });
    }
  }
      }
      const contentEl = document.getElementById('prevSummaryContent');
      if (!contentEl) return;
      // Usuń istniejącą sekcję różnic, aby uniknąć duplikatów
      const oldSec = contentEl.querySelector('.diff-section');
      if (oldSec) oldSec.remove();
      const prev = window.prevMeasurementInfo;
      if (!prev || !isFinite(prev.weightKg) || !isFinite(prev.heightCm) || !isFinite(prev.ageMonths)) return;
      const weightEl = document.getElementById('weight');
      const heightEl = document.getElementById('height');
      const sexEl = document.getElementById('sex');
      if (!weightEl || !heightEl || !sexEl) return;
      const weight = parseFloat(weightEl.value);
      const height = parseFloat(heightEl.value);
      const sex = sexEl.value || prev.sex || 'M';
      const ageDec = (typeof getAgeDecimal === 'function') ? getAgeDecimal() : 0;
      const ageMonths = Math.round((ageDec || 0) * 12);
      if (!isFinite(weight) || !isFinite(height) || !isFinite(ageMonths)) return;
      // Ustal, czy mamy do czynienia z osobą pełnoletnią (wiek >= 18 lat).
      const isAdult = (isFinite(ageDec) && ageDec >= 18);
      // Kontener na sekcję różnic
      const diffSec = document.createElement('div');
      diffSec.className = 'diff-section';
      // Wspólny stan dla wierszy porównania – używany, aby wyrównać ocenę BMI
      // i wskaźnika Cole’a z oceną zmian wzrostu i masy ciała.
      let lastHeightDiff = null;
      let lastHClass = null;
      let lastWeightDiff = null;
      let lastWClass = null;
      // Pomocnicza funkcja: ujednolica kolor wskaźników pochodnych (BMI, wskaźnik Cole’a)
      // z oceną zmian podstawowych parametrów (wzrost, masa ciała).
      function unifyDiffClass(baseClass, lastWClass, lastHClass) {
        const order = { 'status-ok': 0, 'status-improve': 1, 'status-alert': 2 };
        if (!baseClass || !order.hasOwnProperty(baseClass)) return baseClass;
        const primary = [];
        if (lastWClass && order.hasOwnProperty(lastWClass)) primary.push(lastWClass);
        if (lastHClass && order.hasOwnProperty(lastHClass)) primary.push(lastHClass);
        if (primary.length === 0) return baseClass;
        let worst = primary[0];
        for (let i = 1; i < primary.length; i++) {
          if (order[primary[i]] > order[worst]) worst = primary[i];
        }
        const baseSev = order[baseClass];
        const worstSev = order[worst];
        let finalSev;
        if (worstSev === 0) {
          // Wzrost i masa ocenione jako prawidłowe – nie pogarszaj oceny wskaźników pochodnych.
          finalSev = 0;
        } else if (worstSev === 1) {
          // Umiarkowany problem lub poprawa – wskaźniki pochodne nie mogą wyglądać lepiej niż „umiarkowany”.
          finalSev = Math.max(baseSev, 1);
        } else {
          // Poważny problem (czerwony) – wskaźniki BMI/Cole nie mogą wyglądać „zbyt dobrze”
          // w porównaniu z oceną masy i wzrostu.
          finalSev = Math.max(baseSev, 2);
        }
        for (const key in order) {
          if (order[key] === finalSev) return key;
        }
        return baseClass;
      }
      // Dodaj etykietę informującą o porównaniu z poprzednim pomiarem
      const headerLabel = document.createElement('div');
      headerLabel.className = 'prev-summary-label';
      headerLabel.textContent = 'W porównaniu do poprzedniego pomiaru:';
      diffSec.appendChild(headerLabel);
      // Separator oddzielający historię od nowych danych
      const hr = document.createElement('hr');
      hr.className = 'prev-summary-separator';
      diffSec.appendChild(hr);
      // Wzrost
      (function(){
        // Nie pokazuj zmian wzrostu dla osób dorosłych – u dorosłych wzrost się nie zmienia.
        if (isAdult) return;
        const hPrev = prev.heightCm;
        const heightDiff = height - hPrev;
        const medianPrevH = (typeof medianHeightForAgeMonths === 'function') ? medianHeightForAgeMonths(sex, prev.ageMonths) : null;
        const medianCurrH = (typeof medianHeightForAgeMonths === 'function') ? medianHeightForAgeMonths(sex, ageMonths) : null;
        let expectedH = null;
        if (medianPrevH != null && medianCurrH != null && isFinite(medianPrevH) && isFinite(medianCurrH)) {
          expectedH = medianCurrH - medianPrevH;
        }
        let hClass = 'status-ok';
        if (expectedH != null && expectedH > 0) {
          const ratio = heightDiff / expectedH;
          if (ratio < 0.75) hClass = 'status-alert';
          else hClass = 'status-ok';
        } else {
          if (heightDiff < 0) hClass = 'status-alert';
        }
        // Zapamiętaj ocenę wzrostu dla dalszych wierszy (BMI, wskaźnik Cole’a),
        // aby wskaźniki pochodne nie wyglądały gorzej niż sam wzrost.
        lastHeightDiff = heightDiff;
        lastHClass = hClass;
        const row = document.createElement('div');
        row.className = 'diff-row';
        const label = document.createElement('div');
        label.className = 'label';
        label.textContent = 'Wzrost';
        const val = document.createElement('div');
        val.className = 'val';
        const diffSpan = document.createElement('span');
        diffSpan.className = 'result-val ' + hClass;
        diffSpan.textContent = (heightDiff >= 0 ? '+' : '') + (Math.abs(heightDiff).toFixed(1).replace('.', ',')) + '\u00a0cm';
        const sub = document.createElement('span');
        sub.className = 'muted';
        sub.textContent = ' (' + (isFinite(height) ? height.toFixed(1).replace('.', ',') : '—') + '\u00a0cm)';
        val.appendChild(diffSpan);
        val.appendChild(sub);
        row.appendChild(label);
        row.appendChild(val);
        diffSec.appendChild(row);
      })();
      // Waga
      (function(){
        const wPrev = prev.weightKg;
        const wDiff = weight - wPrev;
        let expectedGain = 0;
        if (typeof expectedGainMedianHeightAware === 'function') {
          const measPrev = { ageMonths: prev.ageMonths, height: prev.heightCm, weight: prev.weightKg };
          const measCurr = { ageMonths: ageMonths, height: height, weight: weight };
          try {
            expectedGain = expectedGainMedianHeightAware(measPrev, measCurr, sex);
          } catch (_) {
            expectedGain = 0;
          }
          if (!isFinite(expectedGain)) expectedGain = 0;
        }
        let ratio = 0;
        if (expectedGain > 0) {
          // Dodatnie oczekiwanie przyrostu masy: klasyczna interpretacja – stosunek obserwowanego przyrostu do oczekiwanego
          ratio = wDiff / expectedGain;
        } else if (expectedGain < 0) {
          // Ujemne oczekiwanie przyrostu (spadek masy): użyj stosunku względem oczekiwanej redukcji
          if (wDiff >= 0) {
            // Zamiast dzielenia przez zero używamy wartości ujemnej, aby łatwo rozróżnić wzrost masy
            ratio = -1;
          } else {
            ratio = Math.abs(wDiff) / Math.abs(expectedGain);
          }
        } else {
          // Oczekiwanie równe zero: brak zmiany wagi powinien dać ratio=0; dodatnia zmiana -> 2, ujemna -> -1
          if (wDiff > 0) ratio = 2;
          else if (wDiff < 0) ratio = -1;
          else ratio = 0;
        }
        let coleCurr = null;
        let colePrevChild = null;
        if (typeof getBmiP50ForAgeSex === 'function') {
          // Aktualny wskaźnik Cole’a
          const bmiCurr = weight / Math.pow(height/100,2);
          const bmi50Curr = getBmiP50ForAgeSex(ageMonths, sex);
          if (bmi50Curr && isFinite(bmi50Curr) && bmi50Curr > 0) {
            coleCurr = (bmiCurr / bmi50Curr) * 100;
          }
          // Poprzedni wskaźnik Cole’a
          if (prev.heightCm && prev.weightKg && isFinite(prev.ageMonths)) {
            const bmiPrevChild = prev.weightKg / Math.pow(prev.heightCm/100,2);
            const bmi50PrevChild = getBmiP50ForAgeSex(prev.ageMonths, sex);
            if (bmi50PrevChild && isFinite(bmi50PrevChild) && bmi50PrevChild > 0) {
              colePrevChild = (bmiPrevChild / bmi50PrevChild) * 100;
            }
          }
        }
        const overOrObese = ((colePrevChild != null && isFinite(colePrevChild) && colePrevChild >= 110) || (coleCurr != null && isFinite(coleCurr) && coleCurr >= 110));
        let wClass;
        /*
         * Klasyfikacja zmian wagi w zależności od wieku i płci.
         * Dla dorosłych stosujemy progi rocznego przyrostu masy ciała
         * oparte na literaturze: dla młodych dorosłych (18–39 lat)
         * mężczyzn przyrost do 0,5 kg/rok jest bezpieczny, 0,5–1,0 kg/rok umiarkowany,
         * powyżej 1,0 kg/rok nadmierny. U kobiet granice są odpowiednio 1,0 kg/rok
         * (bezpieczny) oraz 2,0 kg/rok (nadmierny). W wieku 40–59 lat u obu płci
         * przyrost do 0,5 kg/rok jest bezpieczny, 0,5–1,5 kg/rok umiarkowany,
         * powyżej 1,5 kg/rok nadmierny. Po 60. roku życia zakładamy, że
         * stabilizacja masy jest celem: każdy przyrost >0,5 kg/rok uznajemy za
         * nadmierny, zaś drobne wahania do 0,5 kg/rok jako umiarkowane.
         * Dodatkowo, jeśli pacjent ma nadwagę lub otyłość (BMI ≥25),
         * każdy dodatni przyrost traktujemy jako nadmierny. Utrata masy u osób
         * z niedowagą (BMI <18,5) oznacza alert (status-alert), natomiast u osób
         * z nadwagą/otyłością – poprawę (status-improve). Pozostałe sytuacje
         * zmniejszenia masy klasyfikujemy jako bezpieczne (status-ok).
         */
        if (isAdult) {
          // Oblicz BMI poprzedniego i aktualnego pomiaru
          let bmiPrev = null;
          if (prev.heightCm && prev.weightKg) {
            const hPrevM = prev.heightCm / 100;
            bmiPrev = prev.weightKg / (hPrevM * hPrevM);
          }
          let bmiCurr = null;
          if (height && weight) {
            const hCurrM = height / 100;
            bmiCurr = weight / (hCurrM * hCurrM);
          }
          const overweight = (bmiPrev != null && bmiPrev >= ADULT_BMI.OVER) || (bmiCurr != null && bmiCurr >= ADULT_BMI.OVER);
          // Oblicz roczny przyrost wagi (kg/rok). Jeżeli między pomiarami
          // upłynęło mniej niż rok, skalujemy do rocznego tempa; jeżeli różnica
          // wynosi 0 (np. ten sam dzień), unikamy dzielenia przez zero przyjmując 1 rok.
          const deltaYearsRaw = (ageMonths - prev.ageMonths) / 12;
          const deltaYears = (deltaYearsRaw && deltaYearsRaw > 0) ? deltaYearsRaw : 1;
          const wDiffRate = wDiff / deltaYears;
          if (wDiff <= 0) {
            // Spadek masy ciała – różna interpretacja w zależności od BMI
            if (bmiCurr != null && bmiCurr < ADULT_BMI.UNDER) {
              // U osób z niedowagą dalsza utrata masy jest niebezpieczna
              wClass = 'status-alert';
            } else if (overweight) {
              // U osób z nadwagą/otyłością spadek masy ciała jest poprawą
              wClass = 'status-improve';
            } else {
              // W pozostałych przypadkach utrata masy jest uznawana za bezpieczną
              wClass = 'status-ok';
            }
          } else {
            // Wzrost masy ciała
            if (overweight) {
              // Każdy przyrost masy u osób z nadwagą/otyłością jest nadmierny
              wClass = 'status-alert';
            } else {
              // Ustal progi w zależności od wieku i płci
              let safeTh, moderateTh;
              if (ageDec < 40) {
                if (sex === 'M') {
                  safeTh = 0.5;
                  moderateTh = 1.0;
                } else {
                  safeTh = 1.0;
                  moderateTh = 2.0;
                }
              } else if (ageDec < 60) {
                safeTh = 0.5;
                moderateTh = 1.5;
              } else {
                safeTh = 0;
                moderateTh = 0.5;
              }
              if (wDiffRate <= safeTh) {
                wClass = 'status-ok';
              } else if (wDiffRate <= moderateTh) {
                wClass = 'status-improve';
              } else {
                wClass = 'status-alert';
              }
            }
          }
        } else {
          // Klasyfikacja pediatryczna
          if (expectedGain < 0) {
            // Spodziewamy się redukcji masy
            if (wDiff >= 0) {
              // Przyrost masy ciała przy oczekiwanym spadku – alert
              wClass = 'status-alert';
            } else {
              // Rzeczywista redukcja masy
              const r = ratio; // ratio = |wDiff| / |expectedGain|
              if (r < 0.75) {
                // spadek mniejszy niż oczekiwany – uznajemy za bezpieczny
                wClass = 'status-ok';
              } else if (r <= 1.25) {
                // spadek w granicach oczekiwań
                wClass = 'status-ok';
              } else if (r <= 1.50) {
                // spadek nieco większy niż oczekiwano – umiarkowana poprawa
                wClass = 'status-improve';
              } else {
                // spadek zdecydowanie zbyt duży – alert
                wClass = 'status-alert';
              }
            }
          } else {
            // Oczekujemy przyrostu lub utrzymania masy (expectedGain >= 0)
            if (expectedGain === 0) {
              // Brak oczekiwanego przyrostu: ratio = 2 przy wzroście masy, ratio = -1 przy spadku lub 0 przy braku zmian
              if (ratio < 0.75) {
                wClass = overOrObese ? 'status-improve' : 'status-alert';
              } else if (ratio <= 1.25) {
                wClass = 'status-ok';
              } else if (ratio <= 1.50) {
                wClass = 'status-improve';
              } else {
                wClass = 'status-alert';
              }
            } else {
              // expectedGain > 0
              if (ratio < 0.75) {
                wClass = overOrObese ? 'status-improve' : 'status-alert';
              } else if (ratio <= 1.25) {
                wClass = 'status-ok';
              } else if (ratio <= 1.50) {
                wClass = 'status-improve';
              } else {
                wClass = 'status-alert';
              }
            }
          }
        }
        // Zapamiętaj ocenę zmiany masy dla dalszych wierszy (BMI, wskaźnik Cole’a),
        // tak aby wskaźniki pochodne nie wyglądały gorzej niż sama masa ciała.
        lastWeightDiff = wDiff;
        lastWClass = wClass;
        const row = document.createElement('div');
        row.className = 'diff-row';
        const label = document.createElement('div');
        label.className = 'label';
        label.textContent = 'Waga';
        const val = document.createElement('div');
        val.className = 'val';
        const diffSpan = document.createElement('span');
        diffSpan.className = 'result-val ' + wClass;
        // Pokazuj znak minus przy ujemnej różnicy masy ciała zamiast pustego ciągu
        diffSpan.textContent = (wDiff >= 0 ? '+' : '-') + (Math.abs(wDiff).toFixed(1).replace('.', ',')) + '\u00a0kg';
        const sub = document.createElement('span');
        sub.className = 'muted';
        const currentStr = isFinite(weight) ? weight.toFixed(1).replace('.', ',') + '\u00a0kg' : '—';
        const expectedStr = (expectedGain && isFinite(expectedGain)) ? expectedGain.toFixed(1).replace('.', ',') + '\u00a0kg' : '0\u00a0kg';
        // Dla dorosłych nie pokazujemy oczekiwanej zmiany masy (zawsze 0), więc pomijamy tę część tekstu.
        if (isAdult) {
          sub.textContent = ' (' + currentStr + ')';
        } else {
          sub.textContent = ' (' + currentStr + ', oczekiwanie ' + expectedStr + ')';
        }
        val.appendChild(diffSpan);
        val.appendChild(sub);
        row.appendChild(label);
        row.appendChild(val);
        diffSec.appendChild(row);
      })();
      // BMI
      (function(){
        const hPrev = prev.heightCm;
        const wPrev = prev.weightKg;
        if (!hPrev || !wPrev || !height || !weight) return;
        const bmiPrev = wPrev / Math.pow(hPrev/100,2);
        const bmiCurr = weight / Math.pow(height/100,2);
        const bmiDiff = bmiCurr - bmiPrev;
        let bmi50Prev = null;
        let bmi50Curr = null;
        if (typeof getBmiP50ForAgeSex === 'function') {
          bmi50Prev = getBmiP50ForAgeSex(prev.ageMonths, prev.sex || sex);
          bmi50Curr = getBmiP50ForAgeSex(ageMonths, sex);
        }
        let colePrev = null;
        let coleCurr = null;
        if (bmi50Prev && isFinite(bmi50Prev) && bmi50Prev > 0) {
          colePrev = (bmiPrev / bmi50Prev) * 100;
        }
        if (bmi50Curr && isFinite(bmi50Curr) && bmi50Curr > 0) {
          coleCurr = (bmiCurr / bmi50Curr) * 100;
        }
        let bmiClass;
        // Prepare evaluation of weight change for adults to ensure BMI and weight classifications are aligned.
        // This object will store thresholds, change rate and the resulting class/category.
        let weightEval = null;
        if (isAdult) {
          const wPrevVal = prev.weightKg;
          const hPrevVal = prev.heightCm;
          // Ensure necessary values are finite before computing
          if (isFinite(wPrevVal) && isFinite(hPrevVal) && isFinite(weight) && isFinite(height)) {
            // Determine safe and moderate thresholds (kg/year) based on age and sex
            let safeThW, moderateThW;
            if (ageDec < 40) {
              if (sex === 'M') {
                safeThW = 0.5;
                moderateThW = 1.0;
              } else {
                safeThW = 1.0;
                moderateThW = 2.0;
              }
            } else if (ageDec < 60) {
              safeThW = 0.5;
              moderateThW = 1.5;
            } else {
              safeThW = 0.0;
              moderateThW = 0.5;
            }
            // Compute change in weight and annualized rate
            const wDiffLocal = weight - wPrevVal;
            const deltaYearsRawLocal = (ageMonths - prev.ageMonths) / 12;
            const deltaYearsLocal = (deltaYearsRawLocal && deltaYearsRawLocal > 0) ? deltaYearsRawLocal : 1;
            const wDiffRateLocal = wDiffLocal / deltaYearsLocal;
            // Compute BMI values for previous and current measurements
            const bmiPrevLocal = wPrevVal / Math.pow(hPrevVal / 100, 2);
            const bmiCurrLocal = weight / Math.pow(height / 100, 2);
            const overweightLocal = (bmiPrevLocal >= ADULT_BMI.OVER) || (bmiCurrLocal >= ADULT_BMI.OVER);
            // Determine the weight classification using the same logic as the weight change section
            let wClassLocal;
            if (wDiffLocal <= 0) {
              if (bmiCurrLocal < ADULT_BMI.UNDER) {
                wClassLocal = 'status-alert';
              } else if (overweightLocal) {
                wClassLocal = 'status-improve';
              } else {
                wClassLocal = 'status-ok';
              }
            } else {
              if (overweightLocal) {
                wClassLocal = 'status-alert';
              } else {
                if (wDiffRateLocal <= safeThW) {
                  wClassLocal = 'status-ok';
                } else if (wDiffRateLocal <= moderateThW) {
                  wClassLocal = 'status-improve';
                } else {
                  wClassLocal = 'status-alert';
                }
              }
            }
            // Map internal class to a human-readable category
            let categoryName;
            if (wClassLocal === 'status-ok') {
              categoryName = 'bezpieczny';
            } else if (wClassLocal === 'status-improve') {
              categoryName = 'umiarkowany';
            } else {
              categoryName = 'nadmierny';
            }
            // Store evaluation data for later use in overriding BMI class and generating comments
            weightEval = {
              safeLimit: safeThW,
              moderateLimit: moderateThW,
              wDiffRate: wDiffRateLocal,
              wClass: wClassLocal,
              category: categoryName
            };
          }
        }
        /*
         * Klasyfikacja zmian BMI została uproszczona tak, aby była
         * spójna z oceną przyrostu masy ciała w kilogramach.  Dla osób
         * dorosłych wykorzystujemy tę samą kategorię (status-ok,
         * status-improve, status-alert) co dla zmiany masy ciała; w ten
         * sposób użytkownik nie otrzymuje sprzecznych komunikatów.  U
         * dzieci pozostawiamy dotychczasową klasyfikację opartą o
         * wskaźnik Cole’a.
         */
        if (isAdult) {
          // Jeżeli dostępna jest ocena wagi, użyj jej do klasyfikacji BMI
          if (weightEval && weightEval.wClass) {
            bmiClass = weightEval.wClass;
          } else {
            // W razie braku weightEval (bardzo mało prawdopodobne) zastosuj
            // domyślną logikę opartą o nadwagę/otyłość i trend BMI.
            // Określ, czy mamy do czynienia z nadwagą lub otyłością
            const overweight = (bmiPrev >= ADULT_BMI.OVER) || (bmiCurr >= ADULT_BMI.OVER);
            if (bmiDiff <= 0) {
              if (bmiCurr < ADULT_BMI.UNDER) {
                bmiClass = 'status-alert';
              } else if (overweight) {
                bmiClass = 'status-improve';
              } else {
                bmiClass = 'status-ok';
              }
            } else {
              if (overweight) {
                bmiClass = 'status-alert';
              } else {
                bmiClass = 'status-ok';
              }
            }
          }
        } else {
          // Klasyfikacja pediatryczna oparta na wskaźniku Cole’a
          bmiClass = 'status-ok';
          if (coleCurr != null) {
            if (coleCurr >= 110) {
              bmiClass = (bmiDiff < 0 ? 'status-improve' : 'status-alert');
            } else if (coleCurr <= 90) {
              if (bmiDiff > 0) {
                // Dziecko ma niedowagę (Cole < 90%), ale BMI rośnie. Jeżeli równocześnie
                // zmiany masy ciała i wzrostu są ocenione jako prawidłowe (turkusowe),
                // nie pokazuj koloru ostrzegawczego dla BMI – pozostaw status-ok,
                // aby uniknąć sprzecznego komunikatu względem wagi i wzrostu.
                if (lastWClass === 'status-ok' && lastHClass === 'status-ok') {
                  bmiClass = 'status-ok';
                } else {
                  bmiClass = 'status-improve';
                }
              } else {
                bmiClass = 'status-alert';
              }
            } else {
              bmiClass = 'status-ok';
            }
          }
        }
        // Ustal, czy mamy do czynienia z nadwagą lub otyłością, aby odpowiednio sklasyfikować zmianę BMI.
        let overweightFlag = false;
        if (isAdult) {
          // U dorosłych ocena oparta na progach BMI
          overweightFlag = (bmiPrev >= ADULT_BMI.OVER) || (bmiCurr >= ADULT_BMI.OVER);
        } else {
          // U dzieci wykorzystujemy wskaźnik Cole’a do oceny nadwagi/otyłości
          overweightFlag = ((colePrev != null && colePrev >= 110) || (coleCurr != null && coleCurr >= 110));
        }
        // Określ bazową klasę w zależności od wagi i kierunku zmiany BMI.
        let baseBmiClass;
        if (overweightFlag) {
          const absDiff = Math.abs(bmiDiff);
          if (absDiff <= 0.1) {
            // Minimalna zmiana – kolor ostrzegawczy (ciemny pomarańczowy)
            baseBmiClass = 'status-improve';
          } else if (bmiDiff < 0) {
            // Utrata masy (spadek BMI) u osób z nadwagą/otyłością – pozytywna zmiana
            baseBmiClass = 'status-ok';
          } else {
            // Przyrost BMI u osób z nadwagą/otyłością – alert (czerwony)
            baseBmiClass = 'status-alert';
          }
        } else {
          // Jeżeli użytkownik mieści się w normie, pozostaw dotychczasową klasyfikację.
          baseBmiClass = bmiClass;
        }
        // Ujednolicenie koloru z oceną wzrostu i masy ciała.  Jednakże w przypadku
        // nadwagi/otyłości celowo nie pogarszamy oceny wskaźnika BMI – chcemy
        // zobaczyć realny kierunek zmiany nawet, jeśli wiersz „Waga” jest na czerwono.
        let bmiClassFinal = unifyDiffClass(baseBmiClass, lastWClass, lastHClass);
        if (overweightFlag) {
          // Nadwaga lub otyłość – zastosuj bezpośrednią ocenę, ignorując degradację
          bmiClassFinal = baseBmiClass;
        }
        // Zbuduj wiersz z etykietą „Różnica w BMI” oraz bez wartości BMI w nawiasie
        const row = document.createElement('div');
        row.className = 'diff-row';
        const label = document.createElement('div');
        label.className = 'label';
        label.textContent = 'Różnica\u00a0w\u00a0BMI';
        const val = document.createElement('div');
        val.className = 'val';
        const diffSpan = document.createElement('span');
        diffSpan.className = 'result-val ' + bmiClassFinal;
        // Pokazuj znak minus przy ujemnej różnicy BMI zamiast pustego ciągu
        diffSpan.textContent = (bmiDiff >= 0 ? '+' : '-') + Math.abs(bmiDiff).toFixed(1).replace('.', ',');
        val.appendChild(diffSpan);
        row.appendChild(label);
        row.appendChild(val);
        diffSec.appendChild(row);
        // After adding the BMI row, append an explanatory comment with the safe limit and change rate for adults.
        if (isAdult && weightEval) {
          const commentEl = document.createElement('div');
          commentEl.className = 'weight-eval-comment';
          commentEl.style.marginTop = '0.4rem';
          commentEl.style.fontSize = '0.9rem';
          // Format numeric values with comma as decimal separator
          const safeLimitText = (typeof weightEval.safeLimit === 'number')
            ? weightEval.safeLimit.toFixed(1).replace('.', ',') + '\u00a0kg/rok'
            : '—';
          const rateText = (weightEval.wDiffRate != null && isFinite(weightEval.wDiffRate))
            ? weightEval.wDiffRate.toFixed(1).replace('.', ',') + '\u00a0kg/rok'
            : '—';
          commentEl.textContent = 'Limit bezpiecznego przyrostu masy ciała: ' + safeLimitText +
            '; Twój przyrost: ' + rateText + '; Kategoria: ' + weightEval.category + '.';
          // Build a legend explaining the colour coding for categories
          const legend = document.createElement('div');
          legend.className = 'weight-eval-legend';
          legend.style.marginTop = '0.3rem';
          // Use coloured circles (styled via existing classes) to denote each category
          vildaAppSetTrustedHtml(legend, '<span class="result-val status-ok">●</span> Bezpieczny ' +
            '<span class="result-val status-improve" style="margin-left:1rem;">●</span> Umiarkowany ' +
            '<span class="result-val status-alert" style="margin-left:1rem;">●</span> Nadmierny', 'app:legend');
          commentEl.appendChild(legend);
          diffSec.appendChild(commentEl);
        }
      })();
      // Wskaźnik Cole’a
      (function(){
        const hPrev = prev.heightCm;
        const wPrev = prev.weightKg;
        if (!hPrev || !wPrev || !height || !weight) return;
        const bmiPrev = wPrev / Math.pow(hPrev/100,2);
        const bmiCurr = weight / Math.pow(height/100,2);
        let bmi50Prev = null;
        let bmi50Curr = null;
        if (typeof getBmiP50ForAgeSex === 'function') {
          bmi50Prev = getBmiP50ForAgeSex(prev.ageMonths, prev.sex || sex);
          bmi50Curr = getBmiP50ForAgeSex(ageMonths, sex);
        }
        if (!bmi50Prev || !bmi50Curr) return;
        const colePrev = (bmiPrev / bmi50Prev) * 100;
        const coleCurr = (bmiCurr / bmi50Curr) * 100;
        const coleDiff = coleCurr - colePrev;
        // Nowa klasyfikacja zmian wskaźnika Cole’a zgodnie z wymaganiami użytkownika.
        // Określ, czy występuje nadwaga/otyłość lub niedowaga na podstawie obecnego i poprzedniego wskaźnika.
        const coleOverweight = (colePrev >= 110 || coleCurr >= 110);
        const coleUnderweight = (colePrev <= 90 || coleCurr <= 90);
        let baseColeClass;
        if (coleOverweight) {
          // Osoba z nadwagą/otyłością
          const absDiff = Math.abs(coleDiff);
          if (absDiff <= 1) {
            // Minimalna zmiana (±1%) – kolor ostrzegawczy (ciemny pomarańczowy)
            baseColeClass = 'status-improve';
          } else if (coleDiff < 0) {
            // Spadek wskaźnika Cole’a – pozytywna zmiana (turkus)
            baseColeClass = 'status-ok';
          } else {
            // Wzrost wskaźnika Cole’a – alert (czerwony)
            baseColeClass = 'status-alert';
          }
        } else if (coleUnderweight) {
          // Osoba z niedowagą
          const absDiff = Math.abs(coleDiff);
          if (absDiff <= 1) {
            baseColeClass = 'status-improve';
          } else if (coleDiff > 0) {
            // Wzrost wskaźnika Cole’a u osoby z niedowagą – pozytywna zmiana (turkus)
            baseColeClass = 'status-ok';
          } else {
            // Spadek wskaźnika Cole’a u osoby z niedowagą – alert (czerwony)
            baseColeClass = 'status-alert';
          }
        } else {
          // Wskaźnik w normie – domyślnie kolor turkusowy
          baseColeClass = 'status-ok';
        }
        // Ujednolicenie koloru wskaźnika Cole’a z oceną zmian wzrostu i masy ciała.
        let coleClassFinal = unifyDiffClass(baseColeClass, lastWClass, lastHClass);
        // Jeżeli mamy do czynienia z nadwagą/otyłością lub niedowagą,
        // celowo nie pogarszaj oceny wskaźnika Cole’a – zachowaj bezpośrednią ocenę.
        if (coleOverweight || coleUnderweight) {
          coleClassFinal = baseColeClass;
        }
        // Zbuduj wiersz różnicy dla wskaźnika Cole’a, z dodanym znakiem plus/minus i bez wartości w nawiasie
        const row = document.createElement('div');
        row.className = 'diff-row';
        const label = document.createElement('div');
        label.className = 'label';
        label.textContent = 'Wskaźnik\u00a0Cole’a';
        const val = document.createElement('div');
        val.className = 'val';
        const diffSpan = document.createElement('span');
        diffSpan.className = 'result-val ' + coleClassFinal;
        // Zawsze pokazujemy znak '+' dla wzrostu i '-' dla spadku
        diffSpan.textContent = (coleDiff >= 0 ? '+' : '-') + Math.abs(coleDiff).toFixed(1).replace('.', ',') + '%';
        val.appendChild(diffSpan);
        row.appendChild(label);
        row.appendChild(val);
        diffSec.appendChild(row);
      })();
      // Obwód talii – różnica względem poprzedniego pomiaru
      (function(){
        const prevWaist = prev.waistCm;
        const waistEl = document.getElementById('waistCm');
        const currWaist = parseFloat(waistEl && waistEl.value);
        if (prevWaist == null || !isFinite(prevWaist) || currWaist == null || !isFinite(currWaist)) return;
        const diff = currWaist - prevWaist;
        const row = document.createElement('div');
        row.className = 'diff-row';
        const label = document.createElement('div');
        label.className = 'label';
        label.textContent = 'Obwód\u00a0talii';
        const val = document.createElement('div');
        val.className = 'val';
        const diffSpan = document.createElement('span');
        diffSpan.className = 'result-val';
        diffSpan.textContent = (diff >= 0 ? '+' : '') + Math.abs(diff).toFixed(1).replace('.', ',') + '\u00a0cm';
        const sub = document.createElement('span');
        sub.className = 'muted';
        sub.textContent = ' (' + currWaist.toFixed(1).replace('.', ',') + '\u00a0cm)';
        val.appendChild(diffSpan);
        val.appendChild(sub);
        row.appendChild(label);
        row.appendChild(val);
        diffSec.appendChild(row);
      })();
      // Obwód bioder – różnica względem poprzedniego pomiaru
      (function(){
        const prevHip = prev.hipCm;
        const hipEl = document.getElementById('hipCm');
        const currHip = parseFloat(hipEl && hipEl.value);
        if (prevHip == null || !isFinite(prevHip) || currHip == null || !isFinite(currHip)) return;
        const diff = currHip - prevHip;
        const row = document.createElement('div');
        row.className = 'diff-row';
        const label = document.createElement('div');
        label.className = 'label';
        label.textContent = 'Obwód\u00a0bioder';
        const val = document.createElement('div');
        val.className = 'val';
        const diffSpan = document.createElement('span');
        diffSpan.className = 'result-val';
        diffSpan.textContent = (diff >= 0 ? '+' : '') + Math.abs(diff).toFixed(1).replace('.', ',') + '\u00a0cm';
        const sub = document.createElement('span');
        sub.className = 'muted';
        sub.textContent = ' (' + currHip.toFixed(1).replace('.', ',') + '\u00a0cm)';
        val.appendChild(diffSpan);
        val.appendChild(sub);
        row.appendChild(label);
        row.appendChild(val);
        diffSec.appendChild(row);
      })();
      // WHR – różnica względem poprzedniego pomiaru
      (function(){
        const prevWaist = prev.waistCm;
        const prevHip = prev.hipCm;
        const waistEl = document.getElementById('waistCm');
        const hipEl = document.getElementById('hipCm');
        const currWaist = parseFloat(waistEl && waistEl.value);
        const currHip = parseFloat(hipEl && hipEl.value);
        if (prevWaist == null || prevHip == null || !isFinite(prevWaist) || !isFinite(prevHip)) return;
        if (currWaist == null || currHip == null || !isFinite(currWaist) || !isFinite(currHip)) return;
        if (prevHip === 0 || currHip === 0) return;
        const prevWHR = prevWaist / prevHip;
        const currWHR = currWaist / currHip;
        if (!isFinite(prevWHR) || !isFinite(currWHR)) return;
        const diff = currWHR - prevWHR;
        const row = document.createElement('div');
        row.className = 'diff-row';
        const label = document.createElement('div');
        label.className = 'label';
        label.textContent = 'WHR';
        const val = document.createElement('div');
        val.className = 'val';
        const diffSpan = document.createElement('span');
        diffSpan.className = 'result-val';
        diffSpan.textContent = (diff >= 0 ? '+' : '') + Math.abs(diff).toFixed(2).replace('.', ',');
        const sub = document.createElement('span');
        sub.className = 'muted';
        sub.textContent = ' (' + currWHR.toFixed(2).replace('.', ',') + ')';
        val.appendChild(diffSpan);
        val.appendChild(sub);
        row.appendChild(label);
        row.appendChild(val);
        diffSec.appendChild(row);
      })();
      // Dodaj sekcję do karty
      contentEl.appendChild(diffSec);
      // Wyrównaj wysokość karty podsumowania do karty użytkownika
      if (typeof window.adjustPrevSummaryHeight === 'function') {
        try { window.adjustPrevSummaryHeight(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 37488 });
    }
  }
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 37490 });
    }
  }
  };
  // Globalna funkcja wyrównująca wysokość karty „Ostatni pomiar” do karty użytkownika
  window.adjustPrevSummaryHeight = function() {
    try {
      const card = document.getElementById('prevSummaryCard');
      const formEl = document.getElementById('calcForm');
      if (!card || !formEl) return;
      let userCard = null;
      const fieldsets = formEl.getElementsByTagName('fieldset');
      if (fieldsets.length > 0) {
        userCard = fieldsets[0];
      }
      if (!userCard) return;
      // Sprawdź, czy widok jest desktopowy (szerokość ≥ 700 px).  W trybie
      // mobilnym resetuj nadane style, aby obowiązywały reguły z CSS.
      const isDesktop = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(min-width: 700px)').matches;
      if (!isDesktop) {
        card.style.height = '';
        card.style.minHeight = '';
        card.style.maxHeight = '';
        card.style.overflowY = '';
        return;
      }
      // Wysokość karty użytkownika jako punkt odniesienia
      const h = userCard.getBoundingClientRect().height;
      if (h && h > 0) {
        // Ustaw zarówno minimalną, maksymalną jak i stałą wysokość
        card.style.height = h + 'px';
        card.style.minHeight = h + 'px';
        card.style.maxHeight = h + 'px';
        card.style.overflowY = 'auto';
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 37525 });
    }
  }
  };

  // Globalna funkcja wyrównująca wysokość kart „Podsumowanie wyników” w układzie dwukolumnowym
  //
  // Funkcja ta porównuje wysokości dwóch kart podsumowania (lewej i prawej) w trybie
  // desktopowym i ustawia je na maksymalną z nich.  Dla widoków mobilnych
  // (szerokość <700 px) resetuje nadane style, aby pozostawić naturalne
  // dopasowanie wysokości zgodnie z CSS.  Dodatkowo ustawia overflow-y: auto,
  // aby dłuższe listy wierszy były przewijane w ramach swojej karty.
  window.adjustSummaryCardsHeight = function() {
    try {
      // Wykryj tryb mobilny: nie stosuj wyrównywania w jednokolumnowym widoku
      const isDesktop = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(min-width: 700px)').matches;
      const leftCard  = document.getElementById('currentSummaryCardLeft');
      const rightCard = document.getElementById('currentSummaryCardRight');
      if (!isDesktop || !leftCard || !rightCard) {
        // Resetuj style kart, jeśli nie spełniono warunków
        [leftCard, rightCard].forEach((c) => {
          if (c) {
            c.style.height = '';
            c.style.minHeight = '';
            c.style.maxHeight = '';
            c.style.overflowY = '';
          }
        });
        return;
      }
      // Oblicz wysokości obu kart
      const hLeft  = leftCard.getBoundingClientRect().height;
      const hRight = rightCard.getBoundingClientRect().height;
      const maxH   = Math.max(hLeft || 0, hRight || 0);
      if (maxH > 0) {
        [leftCard, rightCard].forEach((c) => {
          c.style.height = maxH + 'px';
          c.style.minHeight = maxH + 'px';
          c.style.maxHeight = maxH + 'px';
          c.style.overflowY = 'auto';
        });
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 37567 });
    }
  }
  };
  // Wyrównaj wysokość karty po załadowaniu DOM
  if (typeof document !== 'undefined') {
    window.vildaAppOnReady('app:summary-cards-height-init', function initSummaryCardsHeight() {
      // Ustaw wysokość karty „Ostatni pomiar” oraz kart podsumowania po załadowaniu DOM
      if (typeof window.adjustPrevSummaryHeight === 'function') {
        try { window.adjustPrevSummaryHeight(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 37576 });
    }
  }
      }
      if (typeof window.adjustSummaryCardsHeight === 'function') {
        try { window.adjustSummaryCardsHeight(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 37579 });
    }
  }
      }
      // Przy każdej zmianie rozmiaru okna dostosuj wysokości kart
      if (typeof window !== 'undefined') {
        window.addEventListener('resize', function() {
          if (typeof window.adjustPrevSummaryHeight === 'function') {
            try { window.adjustPrevSummaryHeight(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 37585 });
    }
  }
          }
          if (typeof window.adjustSummaryCardsHeight === 'function') {
            try { window.adjustSummaryCardsHeight(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 37588 });
    }
  }
          }
        });
      }
    });
  }
})();


/* =====================================================================
 * AUTOSAVE / RESTORE (localStorage) – pełen stan formularzy na wszystkich podstronach
 *
 * Wymagania:
 *  - jeden wspólny wpis obsługiwany przez VildaPersistence (klucz 'sharedUserData')
 *  - zapis automatyczny przy każdej edycji
 *  - automatyczne odtworzenie po odświeżeniu strony i przejściach między podstronami
 *  - czyszczenie po kliknięciu „Wyczyść wszystkie pola” (clearAllDataBtn / clearBtn)
 *
 * Dane są trzymane w obiekcie sharedUserData zarządzanym przez adapter:
 *  - podstawowe pola (name/age/...) pozostają kompatybilne z userData.js
 *  - reszta pól trafia do: sharedUserData._vildaPersist.byId / byName / radio / globals
 * ===================================================================== */
(function () {
  try {
    if (typeof window !== 'undefined') {
      if (window.__vildaAutoPersistV1) return;
      window.__vildaAutoPersistV1 = true;
    }
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 37616 });
    }
  }

  const PKEY = '_vildaPersist';

  function getPersistenceAdapter() {
    try {
      if (typeof window !== 'undefined' && window.VildaPersistence) return window.VildaPersistence;
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 37623 });
    }
  }
    return null;
  }

  function safeClone(obj) {
    try { return JSON.parse(JSON.stringify(obj)); } catch (_) { return null; }
  }
  function loadShared() {
    try {
      const persistence = getPersistenceAdapter();
      if (persistence && typeof persistence.readShared === 'function') {
        return persistence.readShared({ ensurePersist: false }) || {};
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 37636 });
    }
  }
    return {};
  }
  function saveShared(obj, options) {
    try {
      const persistence = getPersistenceAdapter();
      if (persistence && typeof persistence.writeShared === 'function') {
        persistence.writeShared(obj || {}, Object.assign({ ensurePersist: true }, options || {}));
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 37645 });
    }
  }
  }
  function ensurePersist(root) {
    try {
      const persistence = getPersistenceAdapter();
      if (persistence && typeof persistence.ensurePersistRoot === 'function') {
        return persistence.ensurePersistRoot(root || {});
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 37653 });
    }
  }
    if (!root || typeof root !== 'object') root = {};
    if (!root[PKEY] || typeof root[PKEY] !== 'object') {
      root[PKEY] = { v: 1, byId: {}, byName: {}, radio: {}, datasetById: {}, globals: {}, updatedAtISO: null };
    } else {
      root[PKEY].v = 1;
      root[PKEY].byId = root[PKEY].byId && typeof root[PKEY].byId === 'object' ? root[PKEY].byId : {};
      root[PKEY].byName = root[PKEY].byName && typeof root[PKEY].byName === 'object' ? root[PKEY].byName : {};
      root[PKEY].radio = root[PKEY].radio && typeof root[PKEY].radio === 'object' ? root[PKEY].radio : {};
      root[PKEY].datasetById = root[PKEY].datasetById && typeof root[PKEY].datasetById === 'object' ? root[PKEY].datasetById : {};
      root[PKEY].globals = root[PKEY].globals && typeof root[PKEY].globals === 'object' ? root[PKEY].globals : {};
    }
    return root;
  }

  function cssEscape(name) {
    // CSS.escape może nie istnieć w starszych przeglądarkach – fallback do naiwnego escape
    try {
      if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(name);
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 37672 });
    }
  }
    return String(name).replace(/[^a-zA-Z0-9_\-]/g, '\\$&');
  }

  // Pola, które userData.js synchronizuje jako "wspólne" – trzymamy je też na root obiektu,
  // aby zachować kompatybilność wsteczną.
  const BASIC_ROOT_KEYS = new Set([
    'name','fullName','age','ageMonths','weight','height','sex',
    'advMotherHeight','advFatherHeight','advBoneAge','advTesticularVolume','advFamilyDelayedPuberty','advGrowthExclusion'
  ]);
  const TRACKED_DATASET_PROPS = ['manual', 'userChoice'];
  const PERSIST_NAME_LOCK_IDS = ['name', 'advName', 'basicGrowthName', 'fullName'];

  function persistHasLockedElement(ids) {
    try {
      if (!Array.isArray(ids)) return false;
      return ids.some((id) => {
        const el = document.getElementById(id);
        return !!(el && el.disabled);
      });
    } catch (_) {
      return false;
    }
  }

  function syncPersistLockFlags(root) {
    if (!root || typeof root !== 'object') return root;
    try {
      const nameLocked = !!root.nameLocked || persistHasLockedElement(PERSIST_NAME_LOCK_IDS);
      if (nameLocked) root.nameLocked = true;
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 37702 });
    }
  }
    try {
      const sexEl = document.getElementById('sex');
      const sexLocked = !!root.sexLocked || !!(sexEl && sexEl.disabled);
      if (sexLocked) root.sexLocked = true;
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 37707 });
    }
  }
    return root;
  }

  function applyPersistLockFlags(root) {
    try {
      if (root && root.nameLocked) {
        PERSIST_NAME_LOCK_IDS.forEach((id) => {
          const el = document.getElementById(id);
          if (el) el.disabled = true;
        });
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 37719 });
    }
  }
    try {
      if (root && root.sexLocked) {
        const sexEl = document.getElementById('sex');
        if (sexEl) sexEl.disabled = true;
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 37725 });
    }
  }
  }

  function syncPersistSharedSexFromDom(root) {
    if (!root || typeof root !== 'object') return root;
    try {
      const sexEl = document.getElementById('sex');
      if (!sexEl) return root;
      const rawValue = readControlValue(sexEl);
      if (rawValue == null) return root;
      const normalizedSex = String(rawValue).trim().toUpperCase() === 'F' ? 'F'
        : (String(rawValue).trim() !== '' ? 'M' : '');
      if (!normalizedSex) return root;
      const r = ensurePersist(root);
      const p = r[PKEY];
      r.sex = normalizedSex;
      p.byId.sex = normalizedSex;
      if (sexEl.disabled) r.sexLocked = true;
      return r;
    } catch (_) {
      return root;
    }
  }

  function persistReadCurrentIntakeBasics() {
    try {
      if (typeof _getUserBasics !== 'function') return null;
      const basics = _getUserBasics();
      if (!basics || typeof basics !== 'object') return null;
      const ageMonths = persistNormalizeNumber(basics.ageMonths);
      const height = persistNormalizeNumber(basics.height);
      const weight = persistNormalizeNumber(basics.weight);
      if (ageMonths === null || height === null || weight === null) return null;
      return { ageMonths: Math.round(ageMonths), height, weight };
    } catch (_) {
      return null;
    }
  }


  function persistNormalizeNumber(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' && value.trim() === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function persistNormalizeAgeMonthsValue(ageMonthsValue, ageYearsValue) {
    const direct = persistNormalizeNumber(ageMonthsValue);
    if (direct !== null) return Math.round(direct);
    const ageYears = persistNormalizeNumber(ageYearsValue);
    return (ageYears !== null) ? Math.round(ageYears * 12) : null;
  }

  function persistSanitizeAdvancedMeasurementEntries(entries) {
    if (!Array.isArray(entries)) return [];
    const out = [];
    const seen = new Set();
    entries.forEach((entry) => {
      if (!entry || typeof entry !== 'object') return;
      const ageMonths = persistNormalizeAgeMonthsValue(entry.ageMonths, entry.ageYears);
      if (ageMonths === null) return;
      const height = persistNormalizeNumber(entry.height);
      const weight = persistNormalizeNumber(entry.weight);
      const boneAgeYears = persistNormalizeNumber(entry.boneAgeYears);
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
      out.push(Object.assign({}, entry, {
        ageMonths,
        ageYears: ageMonths / 12,
        height,
        weight,
        boneAgeYears,
        arrowEnabled,
        arrowComment,
        ghSync,
        ghId: ghId || null
      }));
    });
    out.sort((a, b) => a.ageMonths - b.ageMonths);
    return out;
  }

  function persistSanitizeAdvancedRowsUI(rowsUI) {
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

  
function persistNormalizeIntakeCurrentBasics(currentBasics) {
    if (!currentBasics || typeof currentBasics !== 'object') return null;
    const ageMonths = persistNormalizeNumber(currentBasics.ageMonths);
    const height = persistNormalizeNumber(currentBasics.height);
    const weight = persistNormalizeNumber(currentBasics.weight);
    if (ageMonths === null || height === null || weight === null) return null;
    return { ageMonths: Math.round(ageMonths), height, weight };
  }

  function persistIntakeEntryMatchesCurrentBasics(ageMonths, height, weight, currentBasics) {
    const basics = persistNormalizeIntakeCurrentBasics(currentBasics);
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

  function persistIntakeRowsUIMatchesCurrentBasics(item, currentBasics) {
    if (!item || typeof item !== 'object') return false;
    const basics = persistNormalizeIntakeCurrentBasics(currentBasics);
    if (!basics) return false;
    const ageY = persistNormalizeNumber(item.ageY);
    const ageM = persistNormalizeNumber(item.ageM);
    if (ageY === null && ageM === null) return false;
    const ageMonths = Math.round((ageY === null ? 0 : ageY) * 12 + (ageM === null ? 0 : ageM));
    const height = persistNormalizeNumber(item.ht);
    const weight = persistNormalizeNumber(item.wt);
    return persistIntakeEntryMatchesCurrentBasics(ageMonths, height, weight, basics);
  }

  function persistSanitizeIntakeHistoryEntries(entries, options) {
    const opts = (options && typeof options === 'object') ? options : {};
    const currentBasics = persistNormalizeIntakeCurrentBasics(opts.currentBasics);
    const omitCurrentDuplicate = !!opts.omitCurrentDuplicate;
    if (!Array.isArray(entries)) return [];
    const out = [];
    const seen = new Set();
    entries.forEach((entry) => {
      if (!entry || typeof entry !== 'object') return;
      const ageMonths = persistNormalizeAgeMonthsValue(entry.ageMonths, entry.ageYears);
      if (ageMonths === null) return;
      const height = persistNormalizeNumber(entry.height);
      const weight = persistNormalizeNumber(entry.weight);
      if (height === null && weight === null) return;
      if (omitCurrentDuplicate && persistIntakeEntryMatchesCurrentBasics(ageMonths, height, weight, currentBasics)) {
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

  function persistSanitizeIntakeRowsUI(rowsUI, options) {
    const opts = (options && typeof options === 'object') ? options : {};
    const currentBasics = persistNormalizeIntakeCurrentBasics(opts.currentBasics);
    const omitLockedCurrent = !!opts.omitLockedCurrent;
    const omitCurrentDuplicate = !!opts.omitCurrentDuplicate;
    if (!Array.isArray(rowsUI)) return [];

    const out = [];
    const seen = new Set();

    rowsUI.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      const fields = [item.ageY, item.ageM, item.ht, item.wt];
      const hasData = fields.some((value) => String(value ?? '').trim() !== '');
      if (!hasData) return;

      const isLocked = !!item.locked;
      if (omitLockedCurrent && isLocked && persistIntakeRowsUIMatchesCurrentBasics(item, currentBasics)) {
        return;
      }
      if (omitCurrentDuplicate && !isLocked && persistIntakeRowsUIMatchesCurrentBasics(item, currentBasics)) {
        return;
      }

      const normalized = {
        ageY: item.ageY ?? '',
        ageM: item.ageM ?? '',
        ht: item.ht ?? '',
        wt: item.wt ?? '',
        locked: isLocked,
        disabled: {
          ageY: !!(item.disabled && item.disabled.ageY),
          ageM: !!(item.disabled && item.disabled.ageM),
          ht: !!(item.disabled && item.disabled.ht),
          wt: !!(item.disabled && item.disabled.wt)
        }
      };

      const key = [
        normalized.ageY,
        normalized.ageM,
        normalized.ht,
        normalized.wt,
        normalized.locked ? '1' : '0',
        normalized.disabled.ageY ? '1' : '0',
        normalized.disabled.ageM ? '1' : '0',
        normalized.disabled.ht ? '1' : '0',
        normalized.disabled.wt ? '1' : '0'
      ].join('|');
      if (seen.has(key)) return;
      seen.add(key);
      out.push(normalized);
    });

    return out;
  }

  function readControlValue(el) {
    if (!el) return null;
    const type = (el.type || '').toLowerCase();
    if (type === 'checkbox') return !!el.checked;
    if (type === 'radio') return el.checked ? el.value : null;
    // Zachowujemy dokładny tekst (np. przecinki), żeby nie zgubić formatowania
    return (typeof el.value === 'string') ? el.value : '';
  }

  function readTrackedDataset(el) {
    if (!el || !el.id || !el.dataset) return null;
    const out = {};
    TRACKED_DATASET_PROPS.forEach((prop) => {
      try {
        if (Object.prototype.hasOwnProperty.call(el.dataset, prop)) {
          out[prop] = String(el.dataset[prop]);
        }
      } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 37999 });
    }
  }
    });
    return Object.keys(out).length ? out : null;
  }

  function storeTrackedDataset(persistState, el) {
    if (!persistState || !persistState.datasetById || !el || !el.id) return;
    const next = readTrackedDataset(el);
    if (next) {
      persistState.datasetById[el.id] = next;
    } else if (Object.prototype.hasOwnProperty.call(persistState.datasetById, el.id)) {
      delete persistState.datasetById[el.id];
    }
  }

  function applyTrackedDataset(el, saved) {
    if (!el || !el.dataset) return;
    TRACKED_DATASET_PROPS.forEach((prop) => {
      try {
        if (saved && Object.prototype.hasOwnProperty.call(saved, prop)) {
          el.dataset[prop] = String(saved[prop]);
        } else if (Object.prototype.hasOwnProperty.call(el.dataset, prop)) {
          delete el.dataset[prop];
        }
      } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38023 });
    }
  }
    });
  }

  let saveTimer = null;
  let pendingRoot = null;
  let isRestoring = false;

  function isPersistClearInProgress() {
    try {
      const persistence = getPersistenceAdapter();
      if (persistence && typeof persistence.isClearInProgress === 'function') {
        return !!persistence.isClearInProgress();
      }
      if (typeof window === 'undefined') return false;
      return Number(window.__vildaPersistClearUntil || 0) > Date.now();
    } catch (_) {
      return false;
    }
  }

  function isPersistSuppressed() {
    try {
      const persistence = getPersistenceAdapter();
      if (persistence && typeof persistence.isAutosaveSuppressed === 'function') {
        return !!persistence.isAutosaveSuppressed();
      }
      if (typeof window === 'undefined') return false;
      const now = Date.now();
      const clearUntil = Number(window.__vildaPersistClearUntil || 0);
      const pauseUntil = Number(window.__vildaPersistPauseUntil || 0);
      return clearUntil > now || pauseUntil > now;
    } catch (_) {
      return false;
    }
  }

  function captureAdvancedGrowthRowsUI() {
    const rowsUI = [];
    try {
      document.querySelectorAll('#advMeasurements .measure-row').forEach(row => {
        const getVal = (sel) => {
          const el = row.querySelector(sel);
          return (el && typeof el.value === 'string') ? el.value : '';
        };
        const getChecked = (sel) => {
          const el = row.querySelector(sel);
          return !!(el && el.checked);
        };
        rowsUI.push({
          ageY: getVal('.adv-age-years'),
          ageM: getVal('.adv-age-months'),
          ht: getVal('.adv-height'),
          wt: getVal('.adv-weight'),
          boneAge: getVal('.adv-bone-age'),
          arrowEnabled: getChecked('.adv-arrow-enable'),
          arrowComment: getVal('.adv-arrow-comment'),
          ghSync: row.getAttribute('data-gh-sync') === 'true',
          ghId: row.getAttribute('data-gh-id') || ''
        });
      });
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38084 });
    }
  }
    return persistSanitizeAdvancedRowsUI(rowsUI);
  }

  function capturePersistGlobals(p) {
    if (!p || typeof p !== 'object') return;
    p.globals = (p.globals && typeof p.globals === 'object') ? p.globals : {};
    try {
      if (typeof window !== 'undefined') {
        const hasAdvancedModule = !!document.getElementById('advMeasurements');
        const hasBasicGrowthModule = !!document.getElementById('basicGrowthMeasurements');
        const hasIntakeModule = !!document.getElementById('intakeMeasurements');
        const hasFoodModule = !!document.getElementById('foodRowsSection') || !!document.getElementById('addFoodRowBtn');

        // Ten sam sharedUserData jest współdzielony między wszystkimi podstronami.
        // Gdy moduł nie istnieje na bieżącej stronie, nie wolno nadpisywać jego
        // kanonicznego stanu pustymi snapshotami.  Dotyczy to szczególnie
        // przejścia index.html -> docpro.html po imporcie JSON.

        if (hasAdvancedModule) {
          const hasAdvancedDataObject = !!(window.advancedGrowthData && typeof window.advancedGrowthData === 'object');
          const advancedRowsUI = captureAdvancedGrowthRowsUI();
          const advancedMeasurements = hasAdvancedDataObject
            ? persistSanitizeAdvancedMeasurementEntries(window.advancedGrowthData.measurements)
            : [];

          // Zapisz kanoniczny stan tylko wtedy, gdy naprawdę istnieje.
          // Nie nadpisuj poprawnego snapshotu wartością null na stronie, która
          // nie zdążyła jeszcze odbudować obiektu window.advancedGrowthData.
          if (hasAdvancedDataObject) {
            p.globals.advancedGrowthData = safeClone(window.advancedGrowthData);
          }

          // Jeżeli UI ma rzeczywiste wiersze – zapisz je.  Jeżeli UI jest puste,
          // ale dane kanoniczne zawierają historię, zachowaj poprzedni snapshot UI
          // zamiast wpisywać pustą tablicę.  To zapobiega znikaniu historii po
          // przejściu na docpro.html i powrocie na stronę główną.
          if (advancedRowsUI.length > 0) {
            p.globals.advancedGrowthRowsUI = advancedRowsUI;
          } else if (advancedMeasurements.length === 0) {
            p.globals.advancedGrowthRowsUI = [];
          }
        }

        if (hasBasicGrowthModule) {
          if (window.basicGrowthData && typeof window.basicGrowthData === 'object') {
            p.globals.basicGrowthData = safeClone(window.basicGrowthData);
          } else {
            p.globals.basicGrowthData = null;
          }
        }


if (hasIntakeModule) {
  const intakeCurrentBasics = persistReadCurrentIntakeBasics();
  const intakeHistory = Array.isArray(window.intakeHistory)
    ? persistSanitizeIntakeHistoryEntries(window.intakeHistory, {
        currentBasics: intakeCurrentBasics,
        omitCurrentDuplicate: !!intakeCurrentBasics
      })
    : [];

  p.globals.intakeHistory = intakeHistory;
  if (typeof window.intakeEstimatedKcalPerDay === 'number' && isFinite(window.intakeEstimatedKcalPerDay)) {
    p.globals.intakeEstimatedKcalPerDay = window.intakeEstimatedKcalPerDay;
  } else {
    p.globals.intakeEstimatedKcalPerDay = null;
  }

  try {
    const rowsUI = [];
    document.querySelectorAll('#intakeMeasurements .measure-row-intake').forEach(row => {
      const getVal = (sel) => {
        const el = row.querySelector(sel);
        return (el && typeof el.value === 'string') ? el.value : '';
      };
      const getDis = (sel) => {
        const el = row.querySelector(sel);
        return !!(el && el.disabled);
      };
      rowsUI.push({
        ageY: getVal('.intake-ageY'),
        ageM: getVal('.intake-ageM'),
        ht:   getVal('.intake-ht'),
        wt:   getVal('.intake-wt'),
        locked: row.dataset.locked === 'true',
        disabled: {
          ageY: getDis('.intake-ageY'),
          ageM: getDis('.intake-ageM'),
          ht:   getDis('.intake-ht'),
          wt:   getDis('.intake-wt')
        }
      });
    });
    const sanitizedRowsUI = persistSanitizeIntakeRowsUI(rowsUI, {
      currentBasics: intakeCurrentBasics,
      omitLockedCurrent: !!intakeCurrentBasics,
      omitCurrentDuplicate: !!intakeCurrentBasics
    });
    if (sanitizedRowsUI.length > 0) {
      p.globals.intakeRowsUI = sanitizedRowsUI;
    } else if (intakeHistory.length === 0) {
      p.globals.intakeRowsUI = [];
    }
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38188 });
    }
  }
}

        if (hasFoodModule) {
          try {
            const rows = [];
            document.querySelectorAll('.food-row').forEach(row => {
              const sel = row.querySelector('select');
              const inp = row.querySelector('input[type="number"]');
              if (!sel || !inp) return;
              rows.push({ key: (sel.value || ''), qty: (inp.value || '').toString() });
            });
            p.globals.foodRows = rows;
          } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38201 });
    }
  }
        }

        if (Array.isArray(window.ghTherapyPoints)) {
          p.globals.ghTherapyPoints = safeClone(window.ghTherapyPoints);
        }

        if (typeof window.currentVersion === 'string' && window.currentVersion) {
          p.globals.clcrCurrentVersion = window.currentVersion;
        } else if (typeof window.currentVersion !== 'undefined') {
          p.globals.clcrCurrentVersion = String(window.currentVersion);
        }

        const hasPrevSummaryModule = !!document.getElementById('prevSummaryWrap')
          || !!document.getElementById('prevSummaryCard')
          || !!document.getElementById('restoreStateBtn');
        if (hasPrevSummaryModule) {
          const loadedComparisonData = (window.lastLoadedData && typeof window.lastLoadedData === 'object')
            ? (safeClone(window.lastLoadedData) || window.lastLoadedData)
            : null;
          if (loadedComparisonData) {
            p.globals.loadedComparisonData = loadedComparisonData;
            p.globals.hasUserModifiedAfterLoad = !!window.hasUserModifiedAfterLoad;
          } else {
            const wrap = document.getElementById('prevSummaryWrap');
            const card = document.getElementById('prevSummaryCard');
            const restoreBtn = document.getElementById('restoreStateBtn');
            const hasLoadedUi = !!(
              (card && card.dataset && card.dataset.loaded === 'true')
              || (wrap && wrap.dataset && wrap.dataset.loaded === 'true')
            );
            const restoreVisible = !!(restoreBtn && restoreBtn.style && restoreBtn.style.display !== 'none');
            if (!hasLoadedUi && !restoreVisible) {
              p.globals.loadedComparisonData = null;
              p.globals.hasUserModifiedAfterLoad = false;
            }
          }
        }
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38240 });
    }
  }
  }

  function flushPersistNow(options) {
    const force = !!(options && options.force);
    if (isRestoring || isPersistClearInProgress() || (isPersistSuppressed() && !force)) {
      try {
        if (saveTimer) {
          clearTimeout(saveTimer);
          saveTimer = null;
        }
      } catch (error) {
        vildaLogAppWarn('app:persistence', 'Nie udało się anulować pending autosave podczas clear/restore', error);
      }
      pendingRoot = null;
      return;
    }
    try {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      const root = pendingRoot || loadShared();
      pendingRoot = null;
      const r = ensurePersist(root);
      syncPersistSharedSexFromDom(r);
      syncPersistLockFlags(r);
      const p = r[PKEY];
      capturePersistGlobals(p);
      syncPersistSharedSexFromDom(r);
      syncPersistLockFlags(r);
      if (!persistHasMeaningfulCurrentFormData(r)) {
        resetLoadedComparisonUiResidue();
        clearSharedAutosaveResidue('app:persistence-empty-autosave');
        return;
      }
      p.updatedAtISO = new Date().toISOString();
      saveShared(r, { force });
    } catch (error) {
      vildaLogAppError('app:persistence', 'Nie udało się wykonać flushPersistNow', error, { force });
    }
  }

  function scheduleSave() {
    if (isRestoring || isPersistSuppressed()) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      flushPersistNow();
    }, 250);
  }

  function updatePersistFromElement(el) {
    if (!el || isRestoring || isPersistSuppressed()) return;
    const tag = (el.tagName || '').toUpperCase();
    if (!(tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA')) return;

    // Pomijamy przyciski/submit/reset/file
    if (tag === 'INPUT') {
      const t = (el.type || '').toLowerCase();
      if (t === 'button' || t === 'submit' || t === 'reset' || t === 'file') return;
    }

    const root = pendingRoot || loadShared();
    pendingRoot = ensurePersist(root);
    syncPersistLockFlags(pendingRoot);
    const p = pendingRoot[PKEY];

    const type = (el.type || '').toLowerCase();

    // Radio: zapisujemy wybór całej grupy w p.radio[name]
    if (type === 'radio') {
      if (el.name) {
        const v = readControlValue(el);
        if (v !== null) {
          p.radio[el.name] = v;
        }
      }
      // Jeśli radio ma id, zapisujemy też jego stan checked, aby móc odtworzyć w nietypowych przypadkach
      if (el.id) {
        p.byId[el.id] = !!el.checked;
        storeTrackedDataset(p, el);
      }
      scheduleSave();
      return;
    }

    // Checkbox
    if (type === 'checkbox') {
      const v = readControlValue(el);
      if (el.id) {
        p.byId[el.id] = v;
        if (BASIC_ROOT_KEYS.has(el.id)) pendingRoot[el.id] = v;
        storeTrackedDataset(p, el);
      } else if (el.name) {
        // Checkboxy bez id – zapisuj po name jako boolean lub listę wartości (gdy grupa)
        let nodes = null;
        try {
          nodes = document.querySelectorAll('input[type="checkbox"][name="' + cssEscape(el.name) + '"]');
        } catch (_) {
          nodes = null;
        }
        if (nodes && nodes.length > 1) {
          const arr = [];
          nodes.forEach(n => { if (n && n.checked) arr.push(n.value || 'on'); });
          p.byName[el.name] = arr;
        } else {
          p.byName[el.name] = v;
        }
      }
      scheduleSave();
      return;
    }

    // Pozostałe input/select/textarea
    const v = readControlValue(el);
    if (el.id) {
      p.byId[el.id] = v;
      if (BASIC_ROOT_KEYS.has(el.id)) pendingRoot[el.id] = v;
      storeTrackedDataset(p, el);
    } else if (el.name) {
      p.byName[el.name] = v;
    }

    scheduleSave();
  }

  function isAdvancedGrowthCriticalTarget(target) {
    try {
      if (!target || typeof target.closest !== 'function') return false;
      if (target.closest('#advMeasurements')) return true;
      const id = target.id || '';
      return id === 'advMotherHeight' || id === 'advFatherHeight' || id === 'advBoneAge' || id === 'advTesticularVolume' || id === 'advFamilyDelayedPuberty' || id === 'advGrowthExclusion';
    } catch (_) {
      return false;
    }
  }

  // Podłącz autosave (capture = true, żeby „złapać” zmiany zanim inne moduły nadpiszą stan)
  document.addEventListener('input', function (ev) {
    try { updatePersistFromElement(ev.target); } catch (error) { vildaLogAppError('app:persistence', 'Błąd autosave przy zdarzeniu input', error); }
    try {
      setTimeout(() => { try { updatePersistFromElement(ev.target); } catch (error) { vildaLogAppError('app:persistence', 'Błąd opóźnionego autosave przy zdarzeniu input', error); } }, 0);
      if (isAdvancedGrowthCriticalTarget(ev.target)) {
        setTimeout(() => { try { flushPersistNow({ force: true }); } catch (error) { vildaLogAppError('app:persistence', 'Błąd wymuszonego flush po zmianie wzrastania', error); } }, 0);
      }
    } catch (error) {
      vildaLogAppError('app:persistence', 'Błąd planowania autosave przy zdarzeniu input', error);
    }
  }, true);
  document.addEventListener('change', function (ev) {
    try { updatePersistFromElement(ev.target); } catch (error) { vildaLogAppError('app:persistence', 'Błąd autosave przy zdarzeniu change', error); }
    try {
      setTimeout(() => { try { updatePersistFromElement(ev.target); } catch (error) { vildaLogAppError('app:persistence', 'Błąd opóźnionego autosave przy zdarzeniu change', error); } }, 0);
      if (isAdvancedGrowthCriticalTarget(ev.target)) {
        setTimeout(() => { try { flushPersistNow({ force: true }); } catch (error) { vildaLogAppError('app:persistence', 'Błąd wymuszonego flush po zmianie wzrastania', error); } }, 0);
      }
    } catch (error) {
      vildaLogAppError('app:persistence', 'Błąd planowania autosave przy zdarzeniu change', error);
    }
  }, true);
  document.addEventListener('click', function (ev) {
    try {
      const target = ev.target;
      if (!target || typeof target.closest !== 'function') return;
      if (target.closest('#advAddMeasurementBtn') || target.closest('#advMeasurements .remove-measure')) {
        setTimeout(() => { try { flushPersistNow({ force: true }); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38400 });
    }
  } }, 0);
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38402 });
    }
  }
  }, true);

  try {
    if (typeof window !== 'undefined') {
      window.vildaPersistScheduleSave = scheduleSave;
      window.vildaPersistFlushNow = flushPersistNow;
      window.addEventListener('pagehide', function () {
        try { flushPersistNow({ force: true }); } catch (error) { vildaLogAppError('app:persistence', 'Błąd flushPersistNow przy pagehide', error); }
      }, true);
      window.addEventListener('beforeunload', function () {
        try { flushPersistNow({ force: true }); } catch (error) { vildaLogAppError('app:persistence', 'Błąd flushPersistNow przy beforeunload', error); }
      }, true);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', function () {
        try {
          if (document.visibilityState === 'hidden') flushPersistNow({ force: true });
        } catch (error) {
          vildaLogAppError('app:persistence', 'Błąd flushPersistNow przy visibilitychange', error);
        }
      }, true);
    }
  } catch (error) {
    vildaLogAppError('app:persistence', 'Nie udało się podpiąć awaryjnych listenerów persistence', error);
  }

  function applyToElement(el, storedValue, touched) {
    if (!el) return;
    const tag = (el.tagName || '').toUpperCase();
    if (!(tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA')) return;

    const type = (el.type || '').toLowerCase();

    if (type === 'radio') {
      // radio odtwarzamy grupowo
      return;
    }
    if (type === 'checkbox') {
      const boolVal = (storedValue === true || storedValue === 'true' || storedValue === 1 || storedValue === '1');
      if (el.checked !== boolVal) {
        el.checked = boolVal;
        touched.push(el);
      }
      return;
    }

    const s = (storedValue == null) ? '' : String(storedValue);
    if (el.value !== s) {
      el.value = s;
      touched.push(el);
    }
  }


  function persistHasMeaningfulLoadedComparisonData(data) {
    try {
      const adapter = (typeof window !== 'undefined') ? window.VildaDataImportExport : null;
      if (adapter && typeof adapter.hasMeaningfulMainSessionData === 'function') {
        return !!adapter.hasMeaningfulMainSessionData(data);
      }
    } catch (_) {
      // fallback poniżej
    }
    try {
      if (!data || typeof data !== 'object' || data.version !== 1) return false;
      const hasText = (value) => typeof value === 'string' && value.trim().length > 0;
      const hasPositive = (value) => {
        if (value === null || value === undefined || value === '') return false;
        const n = Number(value);
        return Number.isFinite(n) && n > 0;
      };
      if (hasText(data.name)) return true;
      const user = data.user && typeof data.user === 'object' ? data.user : {};
      if (hasPositive(user.age) || hasPositive(user.ageMonths) || hasPositive(user.weight) || hasPositive(user.height) || hasPositive(user.waist) || hasPositive(user.hip)) return true;
      const advanced = data.advanced && typeof data.advanced === 'object' ? data.advanced : {};
      if (hasPositive(advanced.boneAgeYears) || hasPositive(advanced.motherHeight) || hasPositive(advanced.fatherHeight) || hasText(advanced.testicularVolume) || hasText(advanced.familyDelayedPuberty) || hasText(advanced.growthExclusion)) return true;
      const advData = advanced.data && typeof advanced.data === 'object' ? advanced.data : {};
      if (Array.isArray(advData.measurements) && advData.measurements.length > 0) return true;
      const basicData = data.growthBasic && data.growthBasic.data && typeof data.growthBasic.data === 'object' ? data.growthBasic.data : {};
      if (Array.isArray(basicData.measurements) && basicData.measurements.length > 0) return true;
      const intake = data.intake && typeof data.intake === 'object' ? data.intake : {};
      if (Array.isArray(intake.history) && intake.history.length > 0) return true;
      if (hasPositive(intake.estKcalPerDay)) return true;
      const foodsData = data.foods && typeof data.foods === 'object' ? data.foods : {};
      if (Array.isArray(foodsData.snacks) && foodsData.snacks.length > 0) return true;
      if (Array.isArray(foodsData.meals) && foodsData.meals.length > 0) return true;
      if (Array.isArray(data.ghTherapyPoints) && data.ghTherapyPoints.length > 0) return true;
    } catch (_) {
      return false;
    }
    return false;
  }

  function persistNonEmptyTextValue(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  function persistPositiveNumberValue(value) {
    if (value === null || value === undefined || value === '') return false;
    const n = Number(value);
    return Number.isFinite(n) && n > 0;
  }

  function persistArrayHasItems(value) {
    return Array.isArray(value) && value.length > 0;
  }

  function persistMeasurementArrayHasPayload(entries) {
    if (!Array.isArray(entries)) return false;
    return entries.some((entry) => {
      if (!entry || typeof entry !== 'object') return false;
      return persistPositiveNumberValue(entry.ageMonths)
        || persistPositiveNumberValue(entry.ageYears)
        || persistPositiveNumberValue(entry.height)
        || persistPositiveNumberValue(entry.weight)
        || persistPositiveNumberValue(entry.boneAgeYears)
        || entry.arrowEnabled === true
        || persistNonEmptyTextValue(entry.arrowComment)
        || entry.ghSync === true
        || persistNonEmptyTextValue(entry.ghId);
    });
  }

  function persistGrowthDataHasPayload(data) {
    if (!data || typeof data !== 'object') return false;
    if (persistMeasurementArrayHasPayload(data.measurements)) return true;
    return persistPositiveNumberValue(data.currentAgeMonths)
      || persistPositiveNumberValue(data.currentHeight)
      || persistPositiveNumberValue(data.currentWeight)
      || persistPositiveNumberValue(data.boneAgeMonths)
      || data.currentArrowEnabled === true
      || persistNonEmptyTextValue(data.currentArrowComment);
  }

  function persistFoodRowsHavePayload(rows) {
    return Array.isArray(rows) && rows.some((row) => {
      if (!row || typeof row !== 'object') return false;
      const qty = Number(row.qty);
      return persistNonEmptyTextValue(row.key) && Number.isFinite(qty) && qty > 0;
    });
  }

  function persistRowsUiHavePayload(rows, selectors) {
    if (!Array.isArray(rows)) return false;
    return rows.some((row) => {
      if (!row || typeof row !== 'object') return false;
      const keys = Array.isArray(selectors) ? selectors : Object.keys(row);
      return keys.some((key) => persistNonEmptyTextValue(row[key]) || persistPositiveNumberValue(row[key]));
    });
  }

  function persistHasMeaningfulCurrentFormData(root, options) {
    const opts = options && typeof options === 'object' ? options : {};
    try {
      if (!opts.skipDomCollect) {
        const adapter = (typeof window !== 'undefined') ? window.VildaDataImportExport : null;
        if (adapter
            && typeof adapter.collectUserData === 'function'
            && typeof adapter.hasMeaningfulMainSessionData === 'function') {
          const data = adapter.collectUserData();
          if (adapter.hasMeaningfulMainSessionData(data)) return true;
        }
      }
    } catch (_) {
      // fallback poniżej
    }

    try {
      const r = root && typeof root === 'object' ? root : {};
      const p = r[PKEY] && typeof r[PKEY] === 'object' ? r[PKEY] : {};
      const byId = p.byId && typeof p.byId === 'object' ? p.byId : {};
      const globals = p.globals && typeof p.globals === 'object' ? p.globals : {};

      const getValue = (id) => Object.prototype.hasOwnProperty.call(r, id) ? r[id] : byId[id];

      if (['name', 'advName', 'basicGrowthName', 'fullName'].some((id) => persistNonEmptyTextValue(getValue(id)))) return true;
      if (['age', 'ageMonths', 'weight', 'height', 'waistCm', 'hipCm', 'advBoneAge', 'advMotherHeight', 'advFatherHeight',
           'palFactor', 'heartRate', 'hrTemperature', 'bpSystolic', 'bpDiastolic', 'adultHeartRate', 'adultBpSystolic',
           'adultBpDiastolic', 'respiratoryRateInput', 'respTemperature', 'headCircumference', 'chestCircumference',
           'headCircumDS'].some((id) => persistPositiveNumberValue(getValue(id)))) return true;
      if (['advTesticularVolume', 'advFamilyDelayedPuberty', 'advGrowthExclusion', 'pwzNumber',
           'bisphosIndication', 'bisphosDrug', 'bisphosDoseNumber'].some((id) => persistNonEmptyTextValue(getValue(id)))) return true;

      if (persistGrowthDataHasPayload(globals.advancedGrowthData)) return true;
      if (persistGrowthDataHasPayload(globals.basicGrowthData)) return true;
      if (persistMeasurementArrayHasPayload(globals.intakeHistory)) return true;
      if (persistRowsUiHavePayload(globals.advancedGrowthRowsUI, ['ageY', 'ageM', 'ht', 'wt', 'boneAge', 'arrowComment'])) return true;
      if (persistRowsUiHavePayload(globals.intakeRowsUI, ['ageY', 'ageM', 'ht', 'wt'])) return true;
      if (persistPositiveNumberValue(globals.intakeEstimatedKcalPerDay)) return true;
      if (persistFoodRowsHavePayload(globals.foodRows)) return true;
      if (persistArrayHasItems(globals.ghTherapyPoints)) return true;
    } catch (_) {
      return false;
    }

    return false;
  }

  function clearSharedAutosaveResidue(source) {
    try {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
    } catch (_) {
      // no-op
    }
    pendingRoot = null;

    try {
      const persistence = getPersistenceAdapter();
      if (persistence && typeof persistence.clearShared === 'function') {
        persistence.clearShared({ markClear: false, source: source || 'app:persistence-empty-shared' });
      } else if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem('sharedUserData');
      }
    } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', _, { feature: 'persist:clear-shared-autosave-residue', source: source || 'unknown' });
      }
    }

    try {
      const persistence = getPersistenceAdapter();
      if (persistence && typeof persistence.clearMainSession === 'function') {
        persistence.clearMainSession();
      } else if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.removeItem('vildaMainSessionV1');
      }
    } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', _, { feature: 'persist:clear-main-session-autosave-residue', source: source || 'unknown' });
      }
    }
  }

  function resetLoadedComparisonUiResidue() {
    try { window.lastLoadedData = null; } catch (_) {}
    try { window.prevMeasurementInfo = null; } catch (_) {}
    try { window.hasUserModifiedAfterLoad = false; } catch (_) {}
    try {
      const rb = document.getElementById('restoreStateBtn');
      if (rb) rb.style.display = 'none';
      const wrap = document.getElementById('prevSummaryWrap');
      const card = document.getElementById('prevSummaryCard');
      const toggle = document.getElementById('togglePrevSummary');
      const content = document.getElementById('prevSummaryContent');
      [wrap, card].forEach((el) => {
        if (!el) return;
        el.style.display = 'none';
        if (el.dataset && Object.prototype.hasOwnProperty.call(el.dataset, 'loaded')) delete el.dataset.loaded;
      });
      if (toggle) toggle.style.display = 'none';
      if (content) {
        if (typeof vildaAppClearHtml === 'function') vildaAppClearHtml(content);
        else content.innerHTML = '';
      }
    } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', _, { feature: 'persist:reset-loaded-comparison-ui-residue' });
      }
    }
  }

  function normalizeLoadedComparisonPersistResidue(root, persistState, globalsState) {
    try {
      if (!globalsState || typeof globalsState !== 'object') return;
      const loaded = globalsState.loadedComparisonData;
      if (!loaded || typeof loaded !== 'object') return;
      if (persistHasMeaningfulLoadedComparisonData(loaded)) return;

      globalsState.loadedComparisonData = null;
      globalsState.hasUserModifiedAfterLoad = false;

      // Pusty snapshot sesji po clear mógł zapisać płeć jako zablokowaną tylko dlatego,
      // że applyLoadedData() potraktowało domyślne "M" jak zaimportowany JSON.
      // Jeżeli sam snapshot porównawczy nie niesie danych klinicznych, zdejmij tę blokadę.
      if (root && typeof root === 'object' && root.sexLocked) {
        delete root.sexLocked;
      }
      if (persistState && persistState.byId && typeof persistState.byId === 'object') {
        delete persistState.byId.sex;
      }
      try {
        const sexEl = document.getElementById('sex');
        if (sexEl) sexEl.disabled = false;
      } catch (_) {
        // no-op
      }
    } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', _, { feature: 'persist:normalize-empty-loaded-comparison' });
      }
    }
  }

  function restoreAll() {
    let root = ensurePersist(loadShared());
    const p = root[PKEY] || {};
    const touched = [];
    // Dane potrzebne do odbudowy karty porównania poprzedniego pomiaru
    // muszą być dostępne także po wyjściu z wewnętrznego bloku restore UI.
    // W poprzedniej wersji `g` było zdefiniowane tylko wewnątrz zagnieżdżonego
    // try/finally, więc etap odtwarzania comparisonData wpadał w ReferenceError
    // połykany przez catch i karta porównawcza nie wracała po odświeżeniu.
    let g = (p.globals && typeof p.globals === 'object') ? p.globals : {};
    normalizeLoadedComparisonPersistResidue(root, p, g);
    if (!persistHasMeaningfulCurrentFormData(root, { skipDomCollect: true })) {
      clearSharedAutosaveResidue('app:persistence-empty-restore');
      resetLoadedComparisonUiResidue();
      root = ensurePersist({});
      g = {};
    }
    try {
      if (typeof window !== 'undefined') {
        window.__vildaSuspendAdvIntakeSync = true;
        window.__vildaSuspendGrowthHistoryCrossSync = true;
        window.__vildaPersistRestoring = true;
        window.__vildaSuspendIntakeUserReset = true;
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38473 });
    }
  }
    isRestoring = true;

    try {
      try {
      // 1) Odtwórz wybrane atrybuty dataset po ID, zanim późniejsze moduły
      // skorzystają z tych flag podczas własnej inicjalizacji.
      const datasetById = (p.datasetById && typeof p.datasetById === 'object') ? p.datasetById : {};
      Object.keys(datasetById).forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        applyTrackedDataset(el, datasetById[id]);
      });

      // 2) Odtwórz pola po ID
      const byId = (p.byId && typeof p.byId === 'object') ? p.byId : {};
      Object.keys(byId).forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        applyToElement(el, byId[id], touched);
      });

      // 2) Odtwórz grupy radio
      const radios = (p.radio && typeof p.radio === 'object') ? p.radio : {};
      Object.keys(radios).forEach(name => {
        const val = radios[name];
        if (val == null) return;
        let nodes = null;
        try {
          nodes = document.querySelectorAll('input[type="radio"][name="' + cssEscape(name) + '"]');
        } catch (_) {
          nodes = null;
        }
        if (!nodes || nodes.length === 0) return;
        nodes.forEach(n => {
          const should = (n.value === String(val));
          if (n.checked !== should) {
            n.checked = should;
            touched.push(n);
          }
        });
      });

      // 3) Odtwórz pola po name (dla elementów bez id)
      const byName = (p.byName && typeof p.byName === 'object') ? p.byName : {};
      Object.keys(byName).forEach(name => {
        const nodes = document.getElementsByName(name);
        if (!nodes || !nodes.length) return;
        const stored = byName[name];

        if (Array.isArray(stored)) {
          // Grupa checkboxów
          Array.from(nodes).forEach(n => {
            if (!n || (n.type || '').toLowerCase() !== 'checkbox') return;
            const should = stored.includes(n.value || 'on');
            if (n.checked !== should) {
              n.checked = should;
              touched.push(n);
            }
          });
        } else {
          // Pojedyncza kontrolka
          const el = nodes[0];
          applyToElement(el, stored, touched);
        }
      });

      // 4) Odtwórz dynamiczne sekcje / globalne dane

      // Zaawansowane obliczenia wzrostowe (historia + komentarze)
      const restoredAdvancedRowsUI = persistSanitizeAdvancedRowsUI(g.advancedGrowthRowsUI);
      if (restoredAdvancedRowsUI.length && typeof window.vildaRehydrateAdvancedRowsUI === 'function') {
        try {
          const fnRows = window.vildaRehydrateAdvancedRowsUI;
          if (typeof fnRows === 'function') fnRows(restoredAdvancedRowsUI);
        } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38548 });
    }
  }
      } else if (g.advancedGrowthData && typeof g.advancedGrowthData === 'object') {
        try { window.advancedGrowthData = safeClone(g.advancedGrowthData) || g.advancedGrowthData; } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38550 });
    }
  }
        try {
          const fn = window.vildaRehydrateAdvancedFromState;
          if (typeof fn === 'function') fn();
        } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38554 });
    }
  }
      }

      if (g.basicGrowthData && typeof g.basicGrowthData === 'object') {
        try { window.basicGrowthData = safeClone(g.basicGrowthData) || g.basicGrowthData; } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38558 });
    }
  }
        try {
          const fnBasic = window.vildaRehydrateBasicGrowthFromState;
          if (typeof fnBasic === 'function') fnBasic();
        } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38562 });
    }
  }
      }


// Szacowane spożycie energii – pełny stan wierszy (UI)
const intakeCurrentBasics = persistReadCurrentIntakeBasics();
const restoredIntakeRowsUI = persistSanitizeIntakeRowsUI(g.intakeRowsUI, {
  currentBasics: intakeCurrentBasics,
  omitLockedCurrent: !!intakeCurrentBasics,
  omitCurrentDuplicate: !!intakeCurrentBasics
});
if (restoredIntakeRowsUI.length && typeof window.intakeAddRow === 'function') {
  try {
    const wrap = document.getElementById('intakeMeasurements');
    if (wrap) vildaAppClearHtml(wrap);

    if (intakeCurrentBasics) {
      try {
        window.intakeAddRow({
          ageMonths: intakeCurrentBasics.ageMonths,
          height: intakeCurrentBasics.height,
          weight: intakeCurrentBasics.weight
        });
      } catch (_) {
        window.intakeAddRow();
      }
    }

    restoredIntakeRowsUI.forEach(r => {
      try {
        window.intakeAddRow();
        const rows = document.querySelectorAll('#intakeMeasurements .measure-row-intake');
        const row = rows[rows.length - 1];
        if (!row || !r) return;

        const setVal = (sel, v) => {
          const el = row.querySelector(sel);
          if (!el) return;
          el.value = (v == null) ? '' : String(v);
          touched.push(el);
        };
        const setDis = (sel, d) => {
          const el = row.querySelector(sel);
          if (!el) return;
          el.disabled = !!d;
        };
        const setLocked = (locked) => {
          if (locked) row.dataset.locked = 'true';
          else delete row.dataset.locked;
        };

        setVal('.intake-ageY', r.ageY);
        setVal('.intake-ageM', r.ageM);
        setVal('.intake-ht',   r.ht);
        setVal('.intake-wt',   r.wt);

        if (r.disabled && typeof r.disabled === 'object') {
          setDis('.intake-ageY', r.disabled.ageY);
          setDis('.intake-ageM', r.disabled.ageM);
          setDis('.intake-ht',   r.disabled.ht);
          setDis('.intake-wt',   r.disabled.wt);
        }

        const shouldLock = !intakeCurrentBasics && !!(r.locked || (r.disabled && r.disabled.ageY && r.disabled.ageM && r.disabled.ht && r.disabled.wt));
        setLocked(shouldLock);
      } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38627 });
    }
  }
    });

    if (intakeCurrentBasics && typeof _updateIntakeFirstRowFromUserBasics === 'function') {
      _updateIntakeFirstRowFromUserBasics();
    }
    if (typeof window.updateIntakeRemoveButtons === 'function') window.updateIntakeRemoveButtons();
    if (typeof window.calcEstimatedIntake === 'function') window.calcEstimatedIntake();
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38635 });
    }
  }
} else if (Array.isArray(g.intakeHistory)) {
  try {
    window.intakeHistory = persistSanitizeIntakeHistoryEntries(safeClone(g.intakeHistory) || g.intakeHistory, {
      currentBasics: intakeCurrentBasics,
      omitCurrentDuplicate: !!intakeCurrentBasics
    });
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38642 });
    }
  }
  try {
    if (typeof g.intakeEstimatedKcalPerDay === 'number' && isFinite(g.intakeEstimatedKcalPerDay)) {
      window.intakeEstimatedKcalPerDay = g.intakeEstimatedKcalPerDay;
    }
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38647 });
    }
  }
  try {
    const fn2 = window.vildaRehydrateIntakeFromState;
    if (typeof fn2 === 'function') fn2((document.getElementById('intakePal') || {}).value || null);
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38651 });
    }
  }
}

      // Wiersze jedzenia
      if (Array.isArray(g.foodRows)) {
        try {
          document.querySelectorAll('.food-row').forEach(el => el.remove());
        } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38658 });
    }
  }
        try {
          if (typeof window.addFoodRow === 'function') {
            g.foodRows.forEach(r => {
              if (!r || typeof r !== 'object') return;
              const resolvedFoodKey = macroPracticeResolveFoodAliasKey(r.key || '');
              window.addFoodRow(resolvedFoodKey);
              const list = document.querySelectorAll('.food-row');
              const row = list[list.length - 1];
              if (!row) return;
              const sel = row.querySelector('select');
              const inp = row.querySelector('input[type="number"]');
              if (sel) sel.value = foods[resolvedFoodKey] ? resolvedFoodKey : 'snickers';
              if (inp && r.qty != null) inp.value = String(r.qty);
              if (sel) touched.push(sel);
              if (inp) touched.push(inp);
            });
          }
        } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38676 });
    }
  }
      }

      // Kalkulator-klirens – wersja
      if (g.clcrCurrentVersion && typeof window.setVersion === 'function') {
        try { window.setVersion(g.clcrCurrentVersion); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38681 });
    }
  }
      }

      // Monitor terapii GH/IGF‑1 – jeżeli jest wczytany (opcjonalnie)
      if (Array.isArray(g.ghTherapyPoints)) {
        try {
          window.ghTherapyPoints = safeClone(g.ghTherapyPoints) || g.ghTherapyPoints;
          writeGhTherapyPointsToModuleStorage(window.ghTherapyPoints);
          if (typeof window.refreshGHTherapyMonitor === 'function') {
            window.refreshGHTherapyMonitor();
          }
        } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38692 });
    }
  }
      }
      } finally {
      }

    try { applyPersistLockFlags(root); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38697 });
    }
  }

    // 5) Po odtworzeniu danych – wymuś przeliczenie wyników w modułach
    try {
      touched.forEach(el => {
        try { el.dispatchEvent(new Event('input',  { bubbles: true })); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38702 });
    }
  }
        try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38703 });
    }
  }
      });
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38705 });
    }
  }

    // Dodatkowe przeliczenie globalne (fallback)
    try {
      if (typeof window.debouncedUpdate === 'function') {
        window.debouncedUpdate();
      } else if (typeof window.update === 'function') {
        window.update();
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38714 });
    }
  }
    try {
      if (typeof window.calculateGrowthAdvanced === 'function') {
        window.calculateGrowthAdvanced();
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38719 });
    }
  }

    /**
     * Uzupełnij wybrane pola po podstawowym odtworzeniu stanu.
     *
     * Po wczytaniu danych z localStorage `restoreAll()` odtwarza wartości
     * wszystkich zarejestrowanych kontrolek, ale nie wykonuje dodatkowej
     * logiki synchronizacji pomiędzy polami lub blokowania edycji.  W
     * niektórych scenariuszach (np. po wczytaniu pliku JSON, wpisaniu
     * nowych danych, a następnie ponownym otwarciu przeglądarki) pole
     * „Imię i nazwisko” w karcie zaawansowanych obliczeń oraz pola na
     * wzrost rodziców mogą pozostać puste, mimo że odpowiednie wartości
     * zostały zapisane w lokalnym magazynie.  Dodatkowy blok poniżej
     * porównuje stan pól z wartościami root (sharedUserData) i w razie
     * potrzeby uzupełnia brakujące dane.  Dodatkowo – jeśli imię jest
     * zablokowane (np. wczytane z pliku) – blokujemy pole w karcie
     * zaawansowanej, tak aby nie różniło się od pola w karcie
     * podstawowej.
     */
    try {
      // Korzystaj z lokalnej zmiennej `root`, która zawiera całą strukturę
      // sharedUserData (wraz z _vildaPersist).  Pola takie jak
      // `name`, `advMotherHeight` i `advFatherHeight` są zapisywane na
      // pierwszym poziomie obiektu (patrz BASIC_ROOT_KEYS).  Jeżeli pole
      // w formularzu jest puste, a w root jest wartość, uzupełnij je i
      // wyemituj zdarzenie `input`, aby warstwa autozapisu mogła
      // zaktualizować swój stan.
      const nameEl = document.getElementById('name');
      const advNameEl = document.getElementById('advName');
      if (nameEl && advNameEl) {
        const advVal  = (advNameEl.value || '').trim();
        const nameVal = (nameEl.value || '').trim();
        // Jeżeli pole zaawansowane jest puste, a mamy imię z karty
        // podstawowej, synchronizuj je.  Zachowaj blokadę edycji, jeśli
        // imię w karcie podstawowej jest zablokowane (np. wczytano z pliku).
        if (!advVal && nameVal) {
          advNameEl.value = nameVal;
          // Jeżeli imię zostało zablokowane podczas wczytywania danych z pliku
          // JSON (flaga nameLocked w sharedUserData) lub pole imienia w
          // formularzu podstawowym jest zablokowane, zablokuj również pole
          // w sekcji zaawansowanej.  Dzięki temu wyszarzone pole jest
          // spójne z kartą główną.
          try {
            const locked = !!(root && typeof root.nameLocked !== 'undefined' ? root.nameLocked : nameEl.disabled);
            if (locked) {
              advNameEl.disabled = true;
            }
          } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38766 });
    }
  }
          try { advNameEl.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38767 });
    }
  }
        }
        // Alternatywnie, jeśli imię w karcie podstawowej jest puste, a
        // zaawansowane ma wartość (możliwy scenariusz po czyszczeniu
        // pól w jednej karcie), skopiuj je z zaawansowanego do
        // podstawowego.
        else if (advVal && !nameVal) {
          nameEl.value = advVal;
          try { nameEl.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38775 });
    }
  }
        }
      }

      // Przywróć wzrost rodziców, jeżeli istnieją w root.  Użytkownik
      // może zmienić te wartości ręcznie; dlatego nie nadpisujemy
      // istniejących wartości, lecz tylko uzupełniamy brakujące.
      const sexEl = document.getElementById('sex');
      if (sexEl) {
        const rootSex = (root && String(root.sex || '').toUpperCase() === 'F') ? 'F'
          : ((root && String(root.sex || '').trim() !== '') ? 'M' : '');
        if (rootSex && sexEl.value !== rootSex) {
          sexEl.value = rootSex;
        }
        try {
          if (root && root.sexLocked) {
            sexEl.disabled = true;
          }
        } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38793 });
    }
  }
      }

      const motherEl = document.getElementById('advMotherHeight');
      if (motherEl && (motherEl.value === '' || motherEl.value == null)) {
        const val = root.advMotherHeight;
        if (val != null && val !== '') {
          motherEl.value = String(val);
          try { motherEl.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38801 });
    }
  }
        }
      }
      const fatherEl = document.getElementById('advFatherHeight');
      if (fatherEl && (fatherEl.value === '' || fatherEl.value == null)) {
        const val = root.advFatherHeight;
        if (val != null && val !== '') {
          fatherEl.value = String(val);
          try { fatherEl.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38809 });
    }
  }
        }
      }
      const testicularEl = document.getElementById('advTesticularVolume');
      if (testicularEl && (testicularEl.value === '' || testicularEl.value == null)) {
        const val = root.advTesticularVolume;
        if (val != null && val !== '') {
          testicularEl.value = String(val);
          try { testicularEl.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38817 });
    }
  }
        }
      }
      const familyDelayedEl = document.getElementById('advFamilyDelayedPuberty');
      if (familyDelayedEl && (familyDelayedEl.value === '' || familyDelayedEl.value == null)) {
        const val = root.advFamilyDelayedPuberty;
        if (val != null && val !== '') {
          familyDelayedEl.value = String(val);
          try { familyDelayedEl.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38825 });
    }
  }
        }
      }
      const exclusionEl = document.getElementById('advGrowthExclusion');
      if (exclusionEl && (exclusionEl.value === '' || exclusionEl.value == null)) {
        const val = root.advGrowthExclusion;
        if (val != null && val !== '') {
          exclusionEl.value = String(val);
          try { exclusionEl.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38833 });
    }
  }
        }
      }

      // Aktualny wiek kostny jest trzymany także na root obiektu sharedUserData,
      // ale po ręcznym „Przywróć zapisany stan” wpis do _vildaPersist.byId może być
      // jeszcze pusty lub nieaktualny.  Na odświeżeniu strony preferuj więc wartość
      // root.advBoneAge, aby nie zgubić bieżącego wieku kostnego po poprawnym restore.
      const boneAgeEl = document.getElementById('advBoneAge');
      if (boneAgeEl) {
        const rootBoneAge = (root && root.advBoneAge != null) ? String(root.advBoneAge).trim() : '';
        const currentBoneAge = (boneAgeEl.value || '').trim();
        if (rootBoneAge !== '' && currentBoneAge !== rootBoneAge) {
          boneAgeEl.value = rootBoneAge;
          try { boneAgeEl.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38847 });
    }
  }
          try { boneAgeEl.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38848 });
    }
  }
        }
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38851 });
    }
  }

    try { applyPersistLockFlags(root); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38853 });
    }
  }

    try {
      const rawComparisonData = (g.loadedComparisonData && typeof g.loadedComparisonData === 'object') ? g.loadedComparisonData : null;
      const comparisonData = persistHasMeaningfulLoadedComparisonData(rawComparisonData)
        ? (safeClone(rawComparisonData) || rawComparisonData)
        : null;
      if (comparisonData) {
        try { window.lastLoadedData = comparisonData; } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38860 });
    }
  }
        try { window.hasUserModifiedAfterLoad = !!g.hasUserModifiedAfterLoad; } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38861 });
    }
  }
        try {
          if (typeof __renderPrevSummary === 'function') {
            __renderPrevSummary(comparisonData);
          }
        } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38866 });
    }
  }
        try {
          if (typeof __pickLastMeasurement === 'function') {
            window.prevMeasurementInfo = __pickLastMeasurement(comparisonData);
          } else {
            window.prevMeasurementInfo = null;
          }
        } catch (_) {
          try { window.prevMeasurementInfo = null; } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38874 });
    }
  }
        }
        try {
          if (window.hasUserModifiedAfterLoad) {
            hideLoadDataMessage();
            const rb = document.getElementById('restoreStateBtn');
            if (rb) rb.style.display = 'none';
          } else {
            showLoadDataMessage();
            if (typeof showRestoreButton === 'function') {
              showRestoreButton();
            }
          }
        } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38887 });
    }
  }
        try {
          if (typeof window.updatePrevSummaryDiff === 'function') {
            window.updatePrevSummaryDiff();
          }
        } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38892 });
    }
  }
        try {
          if (typeof updateProfessionalSummaryCard === 'function') {
            updateProfessionalSummaryCard();
          }
        } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38897 });
    }
  }
        try {
          if (typeof window.adjustPrevSummaryHeight === 'function') {
            window.adjustPrevSummaryHeight();
          }
          if (typeof window.adjustSummaryCardsHeight === 'function') {
            window.adjustSummaryCardsHeight();
          }
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('resize'));
          }
        } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38908 });
    }
  }
        try {
          if (typeof updateSaveBtnVisibility === 'function') {
            updateSaveBtnVisibility();
          }
        } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38913 });
    }
  }
      } else {
        try { window.lastLoadedData = null; } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38915 });
    }
  }
        try { window.prevMeasurementInfo = null; } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38916 });
    }
  }
        try { window.hasUserModifiedAfterLoad = false; } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38917 });
    }
  }
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38919 });
    }
  }

    try {
      if (typeof window !== 'undefined') {
        setTimeout(() => {
          const finishGrowthSyncRestore = () => {
            try { window.__vildaSuspendAdvIntakeSync = false; } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38925 });
    }
  }
            try { window.__vildaSuspendGrowthHistoryCrossSync = false; } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38926 });
    }
  }
            try {
              if (typeof window.vildaEnsureAdvancedIntakePairing === 'function') {
                window.vildaEnsureAdvancedIntakePairing();
              }
            } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38931 });
    }
  }
            try {
              if (typeof window.reconcileGrowthHistoryModules === 'function') {
                window.reconcileGrowthHistoryModules('advanced');
              }
            } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38936 });
    }
  }
            try {
              if (typeof window.calculateBasicGrowth === 'function') {
                window.calculateBasicGrowth();
              }
            } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38941 });
    }
  }
            try {
              if (typeof window.vildaPersistScheduleSave === 'function') {
                window.vildaPersistScheduleSave();
              }
            } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38946 });
    }
  }
          };

          (async () => {
            try {
              if (typeof importTherapyPointsToAdvancedGrowth === 'function') {
                await importTherapyPointsToAdvancedGrowth();
              }
            } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38954 });
    }
  } finally {
              finishGrowthSyncRestore();
            }
          })();
        }, 0);
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38962 });
    }
  }
    } finally {
      isRestoring = false;
      try {
        if (typeof window !== 'undefined') {
          window.__vildaPersistRestoring = false;
          window.__vildaSuspendIntakeUserReset = false;
        }
      } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38970 });
    }
  }
    }
  }

  // Odtwarzaj po DOMContentLoaded, żeby UI zdążyło się zainicjalizować
  window.vildaAppOnReady('app:persist-restore-all', function initPersistRestoreAll() {
    try { restoreAll(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38976 });
    }
  }
  });

  function cancelPendingPersistSave() {
    try {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 38985 });
    }
  }
    pendingRoot = null;
  }

  function dispatchUserStateClearFallback(source) {
    try {
      if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
      const detail = { source: source || 'app.persistClearFallback', clearedAtISO: new Date().toISOString() };
      if (typeof window.CustomEvent === 'function') {
        window.dispatchEvent(new CustomEvent('vilda:user-state-cleared', { detail }));
      } else {
        const ev = new Event('vilda:user-state-cleared');
        ev.detail = detail;
        window.dispatchEvent(ev);
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 39000 });
    }
  }
  }

  function clearPersistedUserState(source) {
    cancelPendingPersistSave();
    try {
      const persistence = getPersistenceAdapter();
      if (persistence && typeof persistence.clearUserState === 'function') {
        persistence.clearUserState({ includeSessions: true, source: source || 'app.attachClear', durationMs: 2500 });
        resetLoadedComparisonUiResidue();
        return;
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 39011 });
    }
  }
    try {
      if (typeof window !== 'undefined') {
        window.__vildaPersistClearUntil = Date.now() + 2500;
        window.__vildaPersistPauseUntil = Math.max(Number(window.__vildaPersistPauseUntil || 0), Date.now() + 2500);
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 39017 });
    }
  }
    clearSharedAutosaveResidue(source || 'app.attachClear');
    resetLoadedComparisonUiResidue();
    dispatchUserStateClearFallback(source);
  }

  try {
    if (typeof window !== 'undefined') {
      window.vildaPersistClearAfterUserClear = function vildaPersistClearAfterUserClear(source) {
        cancelPendingPersistSave();
        clearSharedAutosaveResidue(source || 'app:clearAllData');
        resetLoadedComparisonUiResidue();
        try {
          window.__vildaPersistClearUntil = Math.max(Number(window.__vildaPersistClearUntil || 0), Date.now() + 2500);
          window.__vildaPersistPauseUntil = Math.max(Number(window.__vildaPersistPauseUntil || 0), Date.now() + 2500);
        } catch (_) {
          // no-op
        }
        return true;
      };
    }
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { feature: 'persist:expose-clear-after-user-clear' });
    }
  }

  function clearPersistedModuleState(source, options) {
    const opts = options || {};
    try {
      const persistence = getPersistenceAdapter();
      if (persistence && typeof persistence.clearModuleState === 'function') {
        persistence.clearModuleState({
          scope: opts.scope || 'all',
          includePreferences: opts.includePreferences === true,
          source: source || 'app.attachModuleClear',
          dispatchEvent: true
        });
        return true;
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 39034 });
    }
  }
    return false;
  }

  // Czyszczenie: jedna ścieżka adaptera dla wspólnych danych i sesji po kliknięciu "Wyczyść wszystkie pola".
  function attachClear(btnId, mode) {
    const btn = document.getElementById(btnId);
    if (!btn || btn.__vildaPersistUnifiedClearBound) return;
    btn.__vildaPersistUnifiedClearBound = '1';
    btn.addEventListener('click', function () {
      if (mode === 'modules') {
        clearPersistedModuleState('app.attachClear:' + btnId, { scope: 'all', includePreferences: false });
        return;
      }
      clearPersistedUserState('app.attachClear:' + btnId);
    }, true);
  }
  window.vildaAppOnReady('app:persist-clear-buttons-init', function initPersistClearButtons() {
    attachClear('clearAllDataBtn', 'user'); // index.html + docpro.html
    attachClear('clearBtn', 'user');        // kalkulator-klirens.html
    attachClear('clearAllModulesBtn', 'modules'); // przyszłe/zbiorcze przyciski modułowe — bez czyszczenia danych pacjenta
  });
})();
