/* ========================================================================== 
 * VildaFoodSummary — podsumowanie posiłków, makro-praktyka i czas spalania
 *
 * Plik wydzielony z app.js w kroku 8E. Korzysta z VildaFoodData,
 * VildaActivityBurn oraz helperów makro z app.js, zachowując dotychczasowe
 * globalne API: macroPracticeUpdateFoodSummary(), debouncedFoodUpdate() itd.
 * Nie zmienia wzorów ani logiki obliczeniowej.
 * ========================================================================== */
(function(global){
  'use strict';

  const VERSION = '1.1.0';

  function getFoodData(){
    return (global && (global.VildaFoodData || global.vildaFoodData)) || {};
  }

  function macroPracticeGetFoodSummaryDictionary(){
    const data = getFoodData();
    return data && data.foods && typeof data.foods === 'object' ? data.foods : {};
  }

  function macroPracticeFoodSummaryCalcTotal(dictionary, selector){
    const doc = global && global.document;
    if (!doc || typeof doc.querySelectorAll !== 'function') return 0;
    const obj = dictionary || macroPracticeGetFoodSummaryDictionary();
    let kcal = 0;
    doc.querySelectorAll(selector || '.food-row').forEach((row) => {
      const select = row && typeof row.querySelector === 'function' ? row.querySelector('select') : null;
      const input = row && typeof row.querySelector === 'function' ? row.querySelector('input') : null;
      const key = select ? select.value : '';
      const qty = input ? (parseFloat(input.value) || 0) : 0;
      if (obj && obj[key] && qty > 0) {
        kcal += (Number(obj[key].kcal) || 0) * qty;
      }
    });
    return kcal;
  }

  function macroPracticeEscapeHtml(value) {
    if (global && global.VildaHtml && typeof global.VildaHtml.escapeHtml === 'function') {
      return global.VildaHtml.escapeHtml(value);
    }
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function macroPracticeFormatDisplayNumber(value){
    if (global && typeof global.macroPracticeFormatDisplayNumber === 'function') {
      return global.macroPracticeFormatDisplayNumber(value);
    }
    const num = Number(value);
    if (!Number.isFinite(num)) return '0';
    return num.toLocaleString('pl-PL', { maximumFractionDigits: Number.isInteger(num) ? 0 : 1 });
  }

  function macroPracticeBuildTotalGoalShareParts(totals, nutritionModel){
    if (global && typeof global.macroPracticeBuildTotalGoalShareParts === 'function') {
      return global.macroPracticeBuildTotalGoalShareParts(totals, nutritionModel) || { energy: '', macros: [] };
    }
    return { energy: '', macros: [] };
  }

  function macroPracticeResolveFoodGroup(food){
    if (global && typeof global.macroPracticeResolveFoodGroup === 'function') {
      return global.macroPracticeResolveFoodGroup(food);
    }
    return food && food.foodGroup ? food.foodGroup : 'other';
  }

  function macroPracticeAnalyzeFoodSelection(key, qty, nutritionModel){
    if (global && typeof global.macroPracticeAnalyzeFoodSelection === 'function') {
      return global.macroPracticeAnalyzeFoodSelection(key, qty, nutritionModel);
    }
    return null;
  }

  function macroPracticeBuildSelectedFoodLabel(key, qty){
    if (global && typeof global.macroPracticeBuildSelectedFoodLabel === 'function') {
      return global.macroPracticeBuildSelectedFoodLabel(key, qty);
    }
    const foods = macroPracticeGetFoodSummaryDictionary();
    return foods && foods[key] && foods[key].name ? foods[key].name : String(key || '');
  }

  function vildaAppSetTrustedHtml(element, html, context){
    if (global && typeof global.vildaAppSetTrustedHtml === 'function') {
      return global.vildaAppSetTrustedHtml(element, html, context || 'food-summary');
    }
    if (global && global.VildaHtml && typeof global.VildaHtml.setTrustedHtml === 'function') {
      return global.VildaHtml.setTrustedHtml(element, html, context || 'food-summary');
    }
    if (element) element.textContent = String(html == null ? '' : html);
    return element;
  }

  function vildaAppClearHtml(element){
    if (global && typeof global.vildaAppClearHtml === 'function') {
      return global.vildaAppClearHtml(element);
    }
    if (global && global.VildaHtml && typeof global.VildaHtml.clear === 'function') {
      return global.VildaHtml.clear(element);
    }
    if (element) element.textContent = '';
    return element;
  }

  function getActivityBurnApi(){
    return (global && (global.VildaActivityBurn || global.vildaActivityBurn)) || null;
  }

  function macroPracticeActivityBuildFoodBurnState(options){
    const api = getActivityBurnApi();
    if (api && typeof api.activityBuildFoodBurnState === 'function') return api.activityBuildFoodBurnState(options);
    if (global && typeof global.activityBuildFoodBurnState === 'function') return global.activityBuildFoodBurnState(options);
    return { rows: [] };
  }

  function macroPracticeActivityRenderTableHtml(model){
    const api = getActivityBurnApi();
    if (api && typeof api.activityRenderTableHtml === 'function') return api.activityRenderTableHtml(model);
    if (global && typeof global.activityRenderTableHtml === 'function') return global.activityRenderTableHtml(model);
    return '';
  }

/* === FOOD SUMMARY HELPERS (krok 7C) ====================================
 * Wspólna warstwa dla karty „Kalorie posiłków i czas spalania”.  Dotychczas
 * pełne update() i lokalny refresh karty jedzenia miały niemal identyczną
 * logikę.  Poniższe helpery centralizują zbieranie pozycji, budowę HTML
 * kontrolowanego markupu oraz render czasu spalania bez zmiany wzorów.
 */
function macroPracticeReadFoodSummaryWeight() {
  const weightEl = document.getElementById('weight');
  const weight = parseFloat(weightEl && weightEl.value);
  return Number.isFinite(weight) ? weight : 0;
}

function macroPracticeReadFoodSummaryAge() {
  try {
    if (global && typeof global.getAgeDecimal === 'function') {
      const age = Number(global.getAgeDecimal());
      return Number.isFinite(age) ? age : 0;
    }
  } catch (error) {
    if (typeof vildaLogAppWarn === 'function') {
      vildaLogAppWarn('app:food-summary', 'Nie udało się odczytać wieku dla karty posiłków.', error);
    }
  }
  const ageEl = document.getElementById('age');
  const age = parseFloat(ageEl && ageEl.value);
  return Number.isFinite(age) ? age : 0;
}

function macroPracticeGetFoodNutritionGoals() {
  const buildModel = global && global.patientReportBuildNutritionNormsModelFromCurrentState;
  if (typeof buildModel !== 'function') return null;
  try {
    return buildModel();
  } catch (error) {
    if (typeof vildaLogAppWarn === 'function') {
      vildaLogAppWarn('app:food-summary', 'Nie udało się zbudować modelu norm żywieniowych dla karty posiłków.', error);
    }
    return null;
  }
}

function macroPracticeCollectFoodSummaryItems(nutritionGoalsForFoods, options = {}) {
  const dictionary = options.foods || macroPracticeGetFoodSummaryDictionary();
  const selector = options.selector || '.food-row';
  const items = [];
  document.querySelectorAll(selector).forEach((row) => {
    const select = row.querySelector('select');
    const input = row.querySelector('input');
    const key = select ? select.value : '';
    const qty = input ? (parseFloat(input.value) || 0) : 0;
    if (qty > 0 && dictionary && dictionary[key]) {
      const food = dictionary[key];
      items.push({
        key,
        qty,
        name: macroPracticeBuildSelectedFoodLabel(key, qty) || food.name,
        foodGroup: food.foodGroup || macroPracticeResolveFoodGroup(food),
        kcal: food.kcal * qty,
        analysis: macroPracticeAnalyzeFoodSelection(key, qty, nutritionGoalsForFoods)
      });
    }
  });
  return items;
}

function macroPracticeBuildFoodSummaryState(options = {}) {
  const dictionary = options.foods || macroPracticeGetFoodSummaryDictionary();
  const selector = options.selector || '.food-row';
  const kcal = Number.isFinite(options.kcal) ? options.kcal : macroPracticeFoodSummaryCalcTotal(dictionary, selector);
  const nutritionGoalsForFoods = Object.prototype.hasOwnProperty.call(options, 'nutritionGoalsForFoods')
    ? options.nutritionGoalsForFoods
    : macroPracticeGetFoodNutritionGoals();
  const items = Array.isArray(options.items)
    ? options.items
    : macroPracticeCollectFoodSummaryItems(nutritionGoalsForFoods, { foods: dictionary, selector });
  const itemsWithMacros = items.filter((item) => item.analysis && item.analysis.macroLine);
  const totalProtein = itemsWithMacros.reduce((sum, item) => sum + (item.analysis?.nutrients?.protein_g || 0), 0);
  const totalCarbs = itemsWithMacros.reduce((sum, item) => sum + (item.analysis?.nutrients?.carbs_g || 0), 0);
  const totalFat = itemsWithMacros.reduce((sum, item) => sum + (item.analysis?.nutrients?.fat_g || 0), 0);
  const hasCompoundMeal = itemsWithMacros.some((item) => item.foodGroup === 'meals');
  const totalGoalShareParts = macroPracticeBuildTotalGoalShareParts({
    energy_kcal: kcal,
    protein_g: totalProtein,
    carbs_g: totalCarbs,
    fat_g: totalFat
  }, nutritionGoalsForFoods);
  const totalEnergyShareHtml = totalGoalShareParts.energy
    ? `<div class="food-total-energy-share">${macroPracticeEscapeHtml(totalGoalShareParts.energy)}</div>`
    : '';
  const totalGoalShareHtml = totalGoalShareParts.macros.length
    ? `<div class="food-total-goal-share"><div class="food-total-goal-share-title">Procent dziennego celu do planowania diety:</div><div class="food-total-goal-share-values">${macroPracticeEscapeHtml(totalGoalShareParts.macros.join(' • '))}</div></div>`
    : '';
  const totalGoalShareNote = totalGoalShareParts.macros.length
    ? ' Procenty makroskładników odnoszą się do orientacyjnego dziennego celu do planowania diety, wyliczonego z wieku i PAL wybranego w karcie norm żywieniowych; dla białka nie jest to ta sama wartość co RDA.'
    : '';
  const foodTotalInfoText = `Makroskładniki pokazujemy dla każdej pozycji z listy. Dane oparto na USDA FoodData Central i etykietach produktów; przy daniach złożonych są to wartości orientacyjne dla typowej porcji${hasCompoundMeal ? ', zależne od receptury i wielkości porcji' : ''}.${totalGoalShareNote}`;
  const foodTotalInfoHtml = itemsWithMacros.length
    ? `<div class="food-total-info"><button type="button" class="food-total-info-toggle" data-food-total-info-toggle aria-expanded="false" aria-controls="foodTotalInfoPanel">Informacje ▾</button><div class="food-total-macro-note" id="foodTotalInfoPanel" hidden>${macroPracticeEscapeHtml(foodTotalInfoText)}</div></div>`
    : '';
  const macroSummaryHtml = itemsWithMacros.length
    ? `<div class="food-total-macro-summary">Białko ${macroPracticeFormatDisplayNumber(totalProtein)} g • Węglowodany ${macroPracticeFormatDisplayNumber(totalCarbs)} g • Tłuszcze ${macroPracticeFormatDisplayNumber(totalFat)} g</div>${totalGoalShareHtml}${foodTotalInfoHtml}`
    : '';
  const totalKcalHtml = `<strong>Łącznie: ${Math.round(kcal)} kcal</strong>${totalEnergyShareHtml}${macroSummaryHtml}`;
  const rowsHtml = items.map((item) => {
    const metaLines = [];
    if (item.analysis && item.analysis.macroLine) {
      metaLines.push(`<div class="food-total-item-meta">${macroPracticeEscapeHtml(item.analysis.macroLine)}</div>`);
    }
    if (item.foodGroup === 'meals' && item.analysis && item.analysis.macroNote) {
      metaLines.push(`<div class="food-total-item-note">${macroPracticeEscapeHtml(item.analysis.macroNote)}</div>`);
    }
    if (item.analysis && item.analysis.showAsWarning && item.analysis.warningLine) {
      const warningClass = item.analysis.warningLevel ? ` food-total-item-note--${item.analysis.warningLevel}` : '';
      metaLines.push(`<div class="food-total-item-note${warningClass}">${macroPracticeEscapeHtml(item.analysis.warningLine)}</div>`);
    } else if (item.analysis && item.analysis.coverageLine) {
      metaLines.push(`<div class="food-total-item-note">${macroPracticeEscapeHtml(item.analysis.coverageLine)}</div>`);
    }
    return `<tr><td><div class="food-total-item-name">${macroPracticeEscapeHtml(item.name)}</div>${metaLines.join('')}</td><td>${Math.round(item.kcal)} kcal</td></tr>`;
  }).join('');
  const tableHtml = `<table class="kcal-table kcal-table--macro">
           <tr><th>Produkt</th><th>kcal</th></tr>
           ${rowsHtml}
         </table>`;
  return {
    kcal,
    nutritionGoalsForFoods,
    items,
    itemCount: items.length,
    itemsWithMacrosCount: itemsWithMacros.length,
    totals: { protein_g: totalProtein, carbs_g: totalCarbs, fat_g: totalFat },
    flags: { hasCompoundMeal },
    html: { totalKcalHtml, tableHtml, rowsHtml, totalEnergyShareHtml, macroSummaryHtml }
  };
}

function macroPracticeGetFoodSummaryElements(source) {
  const inputElements = source && source.elements ? source.elements : source;
  return {
    foodTotalSection: (inputElements && inputElements.foodTotalSection) || document.getElementById('foodTotalSection'),
    totalKcalEl: (inputElements && inputElements.foodTotalKcal) || document.getElementById('foodTotalKcal'),
    totalListEl: (inputElements && inputElements.foodTotalList) || document.getElementById('foodTotalList'),
    timesDiv: (inputElements && inputElements.foodTimes) || document.getElementById('foodTimes'),
    foodTimesSection: (inputElements && inputElements.foodTimesSection) || document.getElementById('foodTimesSection')
  };
}

function macroPracticeRenderFoodTotalSummary(summary, elements) {
  const state = summary || macroPracticeBuildFoodSummaryState();
  const els = elements || macroPracticeGetFoodSummaryElements();
  const hasFoodTotalDom = !!(els.foodTotalSection && els.totalKcalEl && els.totalListEl);
  if (hasFoodTotalDom && state.items.length) {
    vildaAppSetTrustedHtml(els.totalKcalEl, state.html.totalKcalHtml, 'app:totalKcalEl');
    vildaAppSetTrustedHtml(els.totalListEl, state.html.tableHtml, 'app:food-total-list');
    els.foodTotalSection.style.display = 'block';
  } else if (hasFoodTotalDom) {
    els.foodTotalSection.style.display = 'none';
    vildaAppClearHtml(els.totalKcalEl);
    vildaAppClearHtml(els.totalListEl);
  }
  return { hasFoodTotalDom, state, elements: els };
}

function macroPracticeRenderFoodBurnSummary(summary, elements, options = {}) {
  const state = summary || macroPracticeBuildFoodSummaryState();
  const els = elements || macroPracticeGetFoodSummaryElements();
  const weight = Number.isFinite(Number(options.weight)) ? Number(options.weight) : macroPracticeReadFoodSummaryWeight();
  const age = Number.isFinite(Number(options.age)) ? Number(options.age) : macroPracticeReadFoodSummaryAge();
  let foodBurnState = null;
  if (weight > 0 && state.kcal > 0 && els.timesDiv && typeof macroPracticeActivityBuildFoodBurnState === 'function') {
    foodBurnState = macroPracticeActivityBuildFoodBurnState({
      kcalTarget: state.kcal,
      weightKg: weight,
      ageYears: age
    });
    vildaAppSetTrustedHtml(els.timesDiv, macroPracticeActivityRenderTableHtml(foodBurnState), 'app:timesDiv');
    if (els.foodTimesSection) {
      els.foodTimesSection.style.display = (foodBurnState && foodBurnState.rows.length) ? 'block' : 'none';
    }
  } else if (els.foodTimesSection) {
    els.foodTimesSection.style.display = 'none';
    if (els.timesDiv) vildaAppClearHtml(els.timesDiv);
  }
  return { state, elements: els, foodBurnState };
}

function macroPracticeUpdateFoodSummary(options = {}) {
  const elements = options.elements || macroPracticeGetFoodSummaryElements(options.inputState);
  const state = options.state || macroPracticeBuildFoodSummaryState(options);
  const totalResult = macroPracticeRenderFoodTotalSummary(state, elements);
  let burnResult = null;
  if (options.renderBurn !== false) {
    burnResult = macroPracticeRenderFoodBurnSummary(state, elements, options);
  }
  return Object.assign({}, state, {
    elements,
    hasFoodTotalDom: totalResult.hasFoodTotalDom,
    foodBurnState: burnResult ? burnResult.foodBurnState : null
  });
}

if (global) {
  global.macroPracticeBuildFoodSummaryState = macroPracticeBuildFoodSummaryState;
  global.macroPracticeUpdateFoodSummary = macroPracticeUpdateFoodSummary;
  global.macroPracticeRefreshFoodSummary = macroPracticeUpdateFoodSummary;
}

/* === FOOD CARD LOCAL REFRESH START =====================================
 * Kliknięcie „+ dodaj pozycję” oraz zmiany wierszy jedzenia nie powinny
 * przebudowywać całej aplikacji przez pełne update(). Pełne update() ukrywa
 * i ponownie generuje karty wyników, co przy scroll anchoringu przeglądarki
 * powodowało widoczne „skakanie” viewportu. Poniższe funkcje odświeżają
 * wyłącznie kartę „Kalorie posiłków i czas spalania”: podsumowanie kcal,
 * makroskładniki, procenty celu i czasy spalania.
 */
let macroPracticeFoodUpdateTimer = null;

function macroPracticePreserveViewportDuringFoodRefresh(callback) {
  if (!global || !global.document) {
    callback();
    return;
  }
  const scrollX = window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft || 0;
  const scrollY = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
  callback();
  const restore = () => {
    try {
      window.scrollTo(scrollX, scrollY);
      if (document.documentElement) document.documentElement.scrollTop = scrollY;
      if (document.body) document.body.scrollTop = scrollY;
      if (document.scrollingElement) document.scrollingElement.scrollTop = scrollY;
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 5075 });
    }
  }
  };
  try { requestAnimationFrame(restore); } catch (_) { restore(); }
  setTimeout(restore, 40);
}

function macroPracticeRefreshFoodCardOnly(options = {}) {
  const shouldPreserveViewport = options && options.preserveViewport !== false;
  const render = () => {
    macroPracticeUpdateFoodSummary({
      weight: macroPracticeReadFoodSummaryWeight(),
      age: macroPracticeReadFoodSummaryAge(),
      renderBurn: true
    });
  };

  if (shouldPreserveViewport) {
    macroPracticePreserveViewportDuringFoodRefresh(render);
  } else {
    render();
  }
}

function debouncedFoodUpdate() {
  clearTimeout(macroPracticeFoodUpdateTimer);
  macroPracticeFoodUpdateTimer = setTimeout(() => {
    macroPracticeRefreshFoodCardOnly({ preserveViewport: true });
  }, 120);
}

if (global) {
  global.macroPracticeRefreshFoodCardOnly = macroPracticeRefreshFoodCardOnly;
  global.debouncedFoodUpdate = debouncedFoodUpdate;
}
/* === FOOD CARD LOCAL REFRESH END ======================================= */



const NUTRITION_NORMS_REFRESH_QUEUE_STEP = '8O-10c';
const nutritionNormsRefreshQueueState = {
  step: NUTRITION_NORMS_REFRESH_QUEUE_STEP,
  eventName: 'nutritionNormsModelUpdated',
  bound: false,
  refreshing: false,
  pending: false,
  pendingSignature: '',
  currentSignature: '',
  lastReceivedSignature: '',
  lastExecutedSignature: '',
  lastSkippedSignature: '',
  receivedEvents: 0,
  ignoredEmptySignatureEvents: 0,
  duplicateEvents: 0,
  queuedEvents: 0,
  coalescedQueuedEvents: 0,
  refreshRuns: 0,
  fallbackUpdateRuns: 0,
  skippedNoSelectedRows: 0,
  errors: 0,
  releaseScheduled: false,
  lastAction: 'not-bound',
  lastError: null,
  lastEventAt: null,
  lastQueuedAt: null,
  lastRefreshAt: null,
  lastReleaseAt: null
};

function macroPracticeNowIso() {
  try { return new Date().toISOString(); } catch (_) { return null; }
}

function macroPracticeCloneNutritionNormsRefreshState() {
  return Object.assign({}, nutritionNormsRefreshQueueState);
}

function macroPracticeHasSelectedFoodRows() {
  const doc = global && global.document;
  if (!doc || typeof doc.querySelectorAll !== 'function') return false;
  try {
    return Array.from(doc.querySelectorAll('.food-row') || []).some((row) => {
      const select = row && typeof row.querySelector === 'function' ? row.querySelector('select') : null;
      const input = row && typeof row.querySelector === 'function' ? row.querySelector('input') : null;
      const qty = input ? Number(input.value) : 0;
      return !!(select && select.value && Number.isFinite(qty) && qty > 0);
    });
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('vilda_food_summary.js', _, { fn: 'macroPracticeHasSelectedFoodRows' });
    }
    return false;
  }
}

function macroPracticeBuildNutritionNormsRefreshSignature(model) {
  if (!model || typeof model !== 'object') return '';
  const energy = model.energy && typeof model.energy === 'object' ? model.energy : {};
  const reference = model.planningReference && model.planningReference.percent ? model.planningReference.percent : {};
  const fatRange = model.fat && Array.isArray(model.fat.percentRange) ? model.fat.percentRange : [];
  return [
    energy.palMode || '',
    Number.isFinite(Number(energy.usedPal)) ? Number(energy.usedPal).toFixed(2) : '',
    Array.isArray(energy.range) ? energy.range.map((value) => Number(value).toFixed(0)).join('-') : '',
    Number.isFinite(Number(reference.protein)) ? Number(reference.protein).toFixed(1) : '',
    Number.isFinite(Number(reference.fat)) ? Number(reference.fat).toFixed(1) : '',
    Number.isFinite(Number(reference.carbs)) ? Number(reference.carbs).toFixed(1) : '',
    fatRange.join('-')
  ].join('|');
}

function macroPracticeGetNutritionNormsRefreshQueueSnapshot(options = {}) {
  const opts = options || {};
  return {
    step: NUTRITION_NORMS_REFRESH_QUEUE_STEP,
    kind: 'nutrition-norms-refresh-queue-snapshot',
    readOnly: true,
    eventName: 'nutritionNormsModelUpdated',
    executedRefresh: false,
    renderedDom: false,
    committedWindowState: false,
    queuePolicy: {
      storesDistinctEventWhileRefreshIsRunning: true,
      coalescesMultiplePendingEventsToLatestSignature: true,
      ignoresDuplicateExecutedSignature: true,
      doesNotChangeNutritionNormsCalculations: true,
      refreshOwner: 'macroPracticeRefreshFoodCardOnly() albo fallback update()'
    },
    api: {
      VildaFoodSummary: !!(global && global.VildaFoodSummary),
      initNutritionNormsRefresh: typeof macroPracticeInitNutritionNormsRefresh === 'function',
      getNutritionNormsRefreshQueueSnapshot: true,
      buildNutritionNormsRefreshSignature: typeof macroPracticeBuildNutritionNormsRefreshSignature === 'function'
    },
    state: macroPracticeCloneNutritionNormsRefreshState(),
    dom: opts.includeDom === true ? {
      hasSelectedFoodRows: macroPracticeHasSelectedFoodRows()
    } : null
  };
}

function macroPracticeInitNutritionNormsRefresh() {
  if (!global || typeof global.addEventListener !== 'function') return;
  if (global.__macroPracticeNutritionNormsRefreshBound) {
    nutritionNormsRefreshQueueState.bound = true;
    nutritionNormsRefreshQueueState.lastAction = nutritionNormsRefreshQueueState.lastAction || 'already-bound';
    return;
  }
  global.__macroPracticeNutritionNormsRefreshBound = true;
  nutritionNormsRefreshQueueState.bound = true;
  nutritionNormsRefreshQueueState.lastAction = 'bound';

  const queuePendingRefresh = function(signature, reason) {
    if (!signature) return;
    if (nutritionNormsRefreshQueueState.pending && nutritionNormsRefreshQueueState.pendingSignature !== signature) {
      nutritionNormsRefreshQueueState.coalescedQueuedEvents += 1;
    }
    if (!nutritionNormsRefreshQueueState.pending || nutritionNormsRefreshQueueState.pendingSignature !== signature) {
      nutritionNormsRefreshQueueState.queuedEvents += 1;
    } else {
      nutritionNormsRefreshQueueState.duplicateEvents += 1;
    }
    nutritionNormsRefreshQueueState.pending = true;
    nutritionNormsRefreshQueueState.pendingSignature = signature;
    nutritionNormsRefreshQueueState.lastQueuedAt = macroPracticeNowIso();
    nutritionNormsRefreshQueueState.lastAction = reason || 'queued-during-refresh';
  };

  const runRefreshForSignature = function(signature, reason) {
    if (!signature) {
      nutritionNormsRefreshQueueState.ignoredEmptySignatureEvents += 1;
      nutritionNormsRefreshQueueState.lastAction = 'ignored-empty-signature';
      return;
    }

    if (nutritionNormsRefreshQueueState.refreshing) {
      if (signature === nutritionNormsRefreshQueueState.currentSignature ||
          (nutritionNormsRefreshQueueState.pending && signature === nutritionNormsRefreshQueueState.pendingSignature)) {
        nutritionNormsRefreshQueueState.duplicateEvents += 1;
        nutritionNormsRefreshQueueState.lastAction = 'ignored-duplicate-during-refresh';
        return;
      }
      queuePendingRefresh(signature, 'queued-during-refresh');
      return;
    }

    if (signature === nutritionNormsRefreshQueueState.lastExecutedSignature && !nutritionNormsRefreshQueueState.pending) {
      nutritionNormsRefreshQueueState.duplicateEvents += 1;
      nutritionNormsRefreshQueueState.lastAction = 'ignored-duplicate-after-refresh';
      return;
    }

    if (!macroPracticeHasSelectedFoodRows()) {
      nutritionNormsRefreshQueueState.skippedNoSelectedRows += 1;
      nutritionNormsRefreshQueueState.lastSkippedSignature = signature;
      nutritionNormsRefreshQueueState.lastAction = 'skipped-no-selected-food-rows';
      return;
    }

    nutritionNormsRefreshQueueState.refreshing = true;
    nutritionNormsRefreshQueueState.currentSignature = signature;
    nutritionNormsRefreshQueueState.lastAction = reason === 'queued-after-refresh' ? 'running-queued-refresh' : 'running-refresh';
    try {
      if (typeof global.macroPracticeRefreshFoodCardOnly === 'function') {
        global.macroPracticeRefreshFoodCardOnly({ preserveViewport: true });
      } else if (typeof global.update === 'function') {
        nutritionNormsRefreshQueueState.fallbackUpdateRuns += 1;
        global.update();
      }
      nutritionNormsRefreshQueueState.refreshRuns += 1;
      nutritionNormsRefreshQueueState.lastExecutedSignature = signature;
      nutritionNormsRefreshQueueState.lastRefreshAt = macroPracticeNowIso();
    } catch (_) {
      nutritionNormsRefreshQueueState.errors += 1;
      nutritionNormsRefreshQueueState.lastError = String(_ && _.message ? _.message : _);
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('vilda_food_summary.js', _, { fn: 'nutritionNormsModelUpdated' });
      }
    } finally {
      const release = function() {
        nutritionNormsRefreshQueueState.releaseScheduled = false;
        nutritionNormsRefreshQueueState.refreshing = false;
        nutritionNormsRefreshQueueState.currentSignature = '';
        nutritionNormsRefreshQueueState.lastReleaseAt = macroPracticeNowIso();
        if (nutritionNormsRefreshQueueState.pending) {
          const pendingSignature = nutritionNormsRefreshQueueState.pendingSignature;
          nutritionNormsRefreshQueueState.pending = false;
          nutritionNormsRefreshQueueState.pendingSignature = '';
          runRefreshForSignature(pendingSignature, 'queued-after-refresh');
        } else {
          nutritionNormsRefreshQueueState.lastAction = 'idle';
        }
      };
      if (!nutritionNormsRefreshQueueState.releaseScheduled) {
        nutritionNormsRefreshQueueState.releaseScheduled = true;
        try { setTimeout(release, 0); } catch (_) { release(); }
      }
    }
  };

  global.addEventListener('nutritionNormsModelUpdated', function(event) {
    const signature = macroPracticeBuildNutritionNormsRefreshSignature(event && event.detail);
    nutritionNormsRefreshQueueState.receivedEvents += 1;
    nutritionNormsRefreshQueueState.lastReceivedSignature = signature;
    nutritionNormsRefreshQueueState.lastEventAt = macroPracticeNowIso();
    runRefreshForSignature(signature, 'event');
  });
}


  const api = Object.freeze({
    version: VERSION,
    readWeight: macroPracticeReadFoodSummaryWeight,
    readAge: macroPracticeReadFoodSummaryAge,
    getNutritionGoals: macroPracticeGetFoodNutritionGoals,
    collectItems: macroPracticeCollectFoodSummaryItems,
    buildState: macroPracticeBuildFoodSummaryState,
    getElements: macroPracticeGetFoodSummaryElements,
    renderTotalSummary: macroPracticeRenderFoodTotalSummary,
    renderBurnSummary: macroPracticeRenderFoodBurnSummary,
    update: macroPracticeUpdateFoodSummary,
    refreshCardOnly: macroPracticeRefreshFoodCardOnly,
    debouncedUpdate: debouncedFoodUpdate,
    initNutritionNormsRefresh: macroPracticeInitNutritionNormsRefresh,
    getNutritionNormsRefreshQueueSnapshot: macroPracticeGetNutritionNormsRefreshQueueSnapshot,
    buildNutritionNormsRefreshSignature: macroPracticeBuildNutritionNormsRefreshSignature,
    calcTotal: macroPracticeFoodSummaryCalcTotal,
    versionInfo(){
      const foods = macroPracticeGetFoodSummaryDictionary();
      return { version: VERSION, foods: Object.keys(foods || {}).length };
    }
  });

  global.VildaFoodSummary = api;
  global.vildaFoodSummary = api;
  global.vildaFoodSummaryVersion = function(){ return VERSION; };

  global.calcTotal = global.calcTotal || macroPracticeFoodSummaryCalcTotal;
  global.macroPracticeFoodSummaryCalcTotal = macroPracticeFoodSummaryCalcTotal;
  global.macroPracticeInitNutritionNormsRefresh = macroPracticeInitNutritionNormsRefresh;
  global.macroPracticeGetNutritionNormsRefreshQueueSnapshot = macroPracticeGetNutritionNormsRefreshQueueSnapshot;
  global.vildaGetNutritionNormsRefreshQueueSnapshot = macroPracticeGetNutritionNormsRefreshQueueSnapshot;
  global.macroPracticeBuildNutritionNormsRefreshSignature = macroPracticeBuildNutritionNormsRefreshSignature;

  global.macroPracticeReadFoodSummaryWeight = macroPracticeReadFoodSummaryWeight;
  global.macroPracticeReadFoodSummaryAge = macroPracticeReadFoodSummaryAge;
  global.macroPracticeGetFoodNutritionGoals = macroPracticeGetFoodNutritionGoals;
  global.macroPracticeCollectFoodSummaryItems = macroPracticeCollectFoodSummaryItems;
  global.macroPracticeBuildFoodSummaryState = macroPracticeBuildFoodSummaryState;
  global.macroPracticeGetFoodSummaryElements = macroPracticeGetFoodSummaryElements;
  global.macroPracticeRenderFoodTotalSummary = macroPracticeRenderFoodTotalSummary;
  global.macroPracticeRenderFoodBurnSummary = macroPracticeRenderFoodBurnSummary;
  global.macroPracticeUpdateFoodSummary = macroPracticeUpdateFoodSummary;
  global.macroPracticeRefreshFoodSummary = macroPracticeUpdateFoodSummary;
  global.macroPracticeRefreshFoodCardOnly = macroPracticeRefreshFoodCardOnly;
  global.debouncedFoodUpdate = debouncedFoodUpdate;

  macroPracticeInitNutritionNormsRefresh();
})(typeof window !== 'undefined' ? window : globalThis);
