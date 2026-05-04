/* ==========================================================================
 * VildaMacroPractice — słowniki i helpery makro-praktyki
 *
 * Plik wydzielony z app.js w kroku 8F. Zachowuje dotychczasowe globalne API
 * macroPractice* oraz addFoodRow()/addSnackRow()/addMealRow().
 * Nie zmienia danych, wzorów ani sposobu liczenia — przenosi logikę wyboru
 * produktów, słowniki, analizę makro i dodawanie wierszy posiłków.
 * ========================================================================== */
(function(global) {
  'use strict';

  const VILDA_MACRO_PRACTICE_VERSION = '1.1.0';
  const VILDA_FOOD_DATA = global && global.VildaFoodData ? global.VildaFoodData : {};
  if ((!VILDA_FOOD_DATA || !VILDA_FOOD_DATA.version) && typeof global.vildaLogAppWarn === 'function') {
    global.vildaLogAppWarn('macro-practice', 'Brak VildaFoodData — makro-praktyka działa w trybie fallback.');
  }

  const snacks = VILDA_FOOD_DATA.snacks || {};
  const meals = VILDA_FOOD_DATA.meals || {};
  const foods = VILDA_FOOD_DATA.foods || Object.assign({}, snacks, meals);

const FOOD_SELECT_GROUPS = VILDA_FOOD_DATA.foodSelectGroups || Object.freeze([
  Object.freeze({ key: 'snacks', label: 'Przekąski i napoje' }),
  Object.freeze({ key: 'meals', label: 'Dania i zestawy' }),
  Object.freeze({ key: 'base', label: 'Produkty bazowe' }),
  Object.freeze({ key: 'other', label: 'Inne' })
]);

const MACRO_REFERENCE_FOOD_ALIASES = VILDA_FOOD_DATA.macroReferenceFoodAliases || Object.freeze({});
const MACRO_PRACTICE_DICTIONARY_URL_CANDIDATES = VILDA_FOOD_DATA.macroPracticeDictionaryUrlCandidates || [
  './macro_examples_dictionary_pl.json',
  'macro_examples_dictionary_pl.json',
  '/macro_examples_dictionary_pl.json'
];
const MACRO_UI_COPY_URL_CANDIDATES = VILDA_FOOD_DATA.macroUiCopyUrlCandidates || [
  './macro_ui_copy_pl.json',
  'macro_ui_copy_pl.json',
  '/macro_ui_copy_pl.json'
];
const MACRO_PRACTICE_FALLBACK_DICTIONARY = VILDA_FOOD_DATA.macroPracticeFallbackDictionary || {};
const MACRO_PRACTICE_FALLBACK_COPY = VILDA_FOOD_DATA.macroPracticeFallbackCopy || {};



function macroPracticeResolveFoodAliasKey(key) {
  const rawKey = String(key || '');
  if (!rawKey) return rawKey;
  if (foods[rawKey]) return rawKey;
  const productId = rawKey.startsWith('macro_') ? rawKey.slice(6) : rawKey;
  return MACRO_REFERENCE_FOOD_ALIASES[productId] || rawKey;
}


const MACRO_PRACTICE_STATE = {
  dictionary: null,
  copy: null,
  ready: false,
  loadPromise: null,
  installedFoodRefs: false,
  referenceFoodKeys: [],
  source: 'none'
};

if (snacks.snickers) {
  snacks.snickers.macroProductId = 'satfat_snickers_single';
  snacks.snickers.macroPortionMultiplier = 1;
}
if (snacks.banana) {
  snacks.banana.macroProductId = 'carb_banana';
  snacks.banana.macroPortionMultiplier = 100 / 120;
}
if (snacks.chocolate) {
  snacks.chocolate.macroProductId = 'satfat_milk_chocolate';
  snacks.chocolate.macroPortionMultiplier = 0.5;
}

function macroPracticeSafeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function macroPracticeFormatNumber(value, digits = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  const precision = Number.isFinite(Number(digits)) ? Math.max(0, Number(digits)) : 0;
  return num.toLocaleString('pl-PL', {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision
  });
}

function macroPracticeFillTemplate(template, values) {
  const source = String(template || '');
  return source.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    if (!values || !(key in values)) return '';
    return String(values[key]);
  });
}

function macroPracticeEscapeHtml(value) {
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

function macroPracticeDeepClone(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    return value;
  }
}

function macroPracticeDispatchReady() {
  try {
    window.dispatchEvent(new CustomEvent('macroPracticeResourcesReady', { detail: macroPracticeGetResources() }));
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('vilda_macro_practice.js', _, { line: 2364 });
    }
  }
}

function macroPracticeSetResources(dictionary, copy, source) {
  if (!dictionary || !copy) return null;
  MACRO_PRACTICE_STATE.dictionary = macroPracticeDeepClone(dictionary);
  MACRO_PRACTICE_STATE.copy = macroPracticeDeepClone(copy);
  MACRO_PRACTICE_STATE.ready = true;
  MACRO_PRACTICE_STATE.source = source || 'embedded';
  macroPracticeInstallReferenceFoods(true);
  macroPracticeDispatchReady();
  return macroPracticeGetResources();
}

function macroPracticeResolveFetchJsonWithTimeout() {
  try {
    if (global && global.VildaAppHelpers && typeof global.VildaAppHelpers.fetchJsonWithTimeout === 'function') {
      return global.VildaAppHelpers.fetchJsonWithTimeout;
    }
    if (global && typeof global.vildaFetchJsonWithTimeout === 'function') return global.vildaFetchJsonWithTimeout;
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('vilda_macro_practice.js', _, { step: '8O-11d', helper: 'macroPracticeResolveFetchJsonWithTimeout' });
    }
  }
  return null;
}

async function macroPracticeFetchJsonCandidates(candidates) {
  const fetchJsonWithTimeout = macroPracticeResolveFetchJsonWithTimeout();
  if (typeof fetchJsonWithTimeout !== 'function') return null;
  const list = Array.isArray(candidates) ? candidates : [];
  for (const candidate of list) {
    if (!candidate) continue;
    try {
      return await fetchJsonWithTimeout(candidate, {
        cache: 'no-cache',
        timeoutMs: 8000,
        context: 'macro-practice:fetch-json-candidate'
      });
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('vilda_macro_practice.js', _, { step: '8O-11d', helper: 'macroPracticeFetchJsonCandidates', candidate: String(candidate || '') });
    }
  }
  }
  return null;
}

function macroPracticeGetResources() {
  if (!MACRO_PRACTICE_STATE.ready || !MACRO_PRACTICE_STATE.dictionary || !MACRO_PRACTICE_STATE.copy) return null;
  return { dictionary: MACRO_PRACTICE_STATE.dictionary, copy: MACRO_PRACTICE_STATE.copy };
}

function macroPracticeGetProductsByCategory(category) {
  const resources = macroPracticeGetResources();
  if (!resources || !Array.isArray(resources.dictionary.products)) return [];
  return resources.dictionary.products.filter((product) => String(product && product.category || '') === String(category || ''));
}

function macroPracticeGetProduct(productOrId) {
  const resources = macroPracticeGetResources();
  if (!resources || !Array.isArray(resources.dictionary.products)) return null;
  if (!productOrId) return null;
  if (typeof productOrId === 'object' && productOrId.id) return productOrId;
  return resources.dictionary.products.find((product) => product && product.id === productOrId) || null;
}

function macroPracticeGetProductPortion(productOrId) {
  const product = macroPracticeGetProduct(productOrId);
  if (!product || typeof product !== 'object' || !product.resolved_nutrients_per_portion) return null;
  return product.resolved_nutrients_per_portion;
}

function macroPracticeBuildPortionLabel(product) {
  if (!product || typeof product !== 'object') return '';
  const rawLabel = product.default_portion && product.default_portion.label_pl
    ? String(product.default_portion.label_pl).trim()
    : '';
  const massG = product.resolved_nutrients_per_portion && Number.isFinite(Number(product.resolved_nutrients_per_portion.portion_mass_g))
    ? Number(product.resolved_nutrients_per_portion.portion_mass_g)
    : null;
  const massLabel = Number.isFinite(massG) && massG > 0
    ? `${macroPracticeFormatNumber(massG, Number.isInteger(massG) ? 0 : 1)} g`
    : '';
  if (rawLabel && massLabel) {
    if (/\b\d+(?:[.,]\d+)?\s*g\b/i.test(rawLabel)) return rawLabel;
    return `${rawLabel} • ${massLabel}`;
  }
  return rawLabel || massLabel || '';
}

function macroPracticeBuildFoodOptionName(product) {
  if (!product || typeof product !== 'object') return '';
  const label = product.display_name_pl || product.name || 'Produkt referencyjny';
  const portionLabel = macroPracticeBuildPortionLabel(product)
    ? ` (${macroPracticeBuildPortionLabel(product)})`
    : '';
  return `${label}${portionLabel}`;
}

function macroPracticeBuildReferenceFoodKey(product) {
  return product && product.id ? `macro_${product.id}` : '';
}

function macroPracticeBuildFoodEntryFromProduct(product) {
  const portion = macroPracticeGetProductPortion(product);
  if (!product || !portion) return null;
  const displayName = product.display_name_pl || product.name || 'Produkt referencyjny';
  const rawPortionLabel = product.default_portion && product.default_portion.label_pl
    ? String(product.default_portion.label_pl).trim()
    : '';
  const portionMassG = Number(portion.portion_mass_g);
  return {
    name: macroPracticeBuildFoodOptionName(product),
    kcal: Math.round(Number(portion.energy_kcal) || 0),
    protein_g: macroPracticeSafeNumber(portion.protein_g) || 0,
    carbs_g: macroPracticeSafeNumber(portion.carbs_g) || 0,
    fat_g: macroPracticeSafeNumber(portion.fat_g) || 0,
    saturated_fat_g: macroPracticeSafeNumber(portion.saturated_fat_g) || 0,
    sugars_g: macroPracticeSafeNumber(portion.sugars_g) || 0,
    salt_g: macroPracticeSafeNumber(portion.salt_g) || 0,
    macroProductId: product.id,
    macroDisplayName: displayName,
    macroBasePortionLabel: rawPortionLabel,
    macroBasePortionMassG: Number.isFinite(portionMassG) ? portionMassG : null,
    macroPortionMultiplier: 1,
    macroPortionLabel: macroPracticeBuildPortionLabel(product),
    isMacroReferenceFood: true,
    macroCategory: product.category || '',
    foodGroup: 'base',
    macroSource: product.lookup && product.lookup.provider ? product.lookup.provider : 'USDA FoodData Central',
    macroNote: 'Produkt bazowy — wartości orientacyjne dla podanej porcji.',
    showSatfatWarning: product.category === 'satfat'
  };
}

function macroPracticeEscapeAttr(value) {
  return macroPracticeEscapeHtml(value).replace(/`/g, '&#96;');
}

function macroPracticeResolveFoodGroup(food) {
  const explicit = food && food.foodGroup ? String(food.foodGroup) : '';
  if (explicit) return explicit;
  const category = food && food.macroCategory ? String(food.macroCategory) : '';
  if (category === 'meal') return 'meals';
  if (category === 'protein' || category === 'carbs' || category === 'fat' || category === 'satfat') return 'base';
  return 'other';
}

function macroPracticeGetFoodGroupLabel(groupKey) {
  const group = FOOD_SELECT_GROUPS.find((item) => item.key === groupKey);
  return group ? group.label : 'Inne';
}

function macroPracticeBuildFoodOptionLabel(food) {
  // W selektorze zostawiamy tylko nazwę produktu/dania i gramaturę porcji.
  // Makroskładniki są nadal widoczne po wybraniu pozycji w podsumowaniu karty.
  return food && food.name ? String(food.name) : '';
}

function macroPracticeIsEffectivelyOne(value) {
  const num = Number(value);
  return Number.isFinite(num) && Math.abs(num - 1) < 0.0001;
}

function macroPracticeIsIntegerLike(value) {
  const num = Number(value);
  return Number.isFinite(num) && Math.abs(num - Math.round(num)) < 0.0001;
}

function macroPracticeFormatQuantity(value, digits = 1) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  const abs = Math.abs(num);
  const precision = macroPracticeIsIntegerLike(num) ? 0 : Math.max(0, Number(digits) || 1);
  const formatted = num.toLocaleString('pl-PL', {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision
  });
  return abs >= 1000 ? formatted.replace(/\u00a0/g, ' ') : formatted;
}

function macroPracticePolishPluralForm(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 'many';
  if (!macroPracticeIsIntegerLike(num)) return 'many';
  const abs = Math.abs(Math.round(num));
  if (abs === 1) return 'one';
  const lastTwo = abs % 100;
  const last = abs % 10;
  if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return 'few';
  return 'many';
}

function macroPracticeChooseForm(value, forms) {
  const form = macroPracticePolishPluralForm(value);
  return (forms && forms[form]) || (forms && forms.many) || '';
}

function macroPracticeBuildCountPhrase(value, forms, digits = 1) {
  const formatted = macroPracticeFormatQuantity(value, digits);
  if (!formatted) return '';
  return `${formatted} ${macroPracticeChooseForm(value, forms)}`.trim();
}

function macroPracticeScaleRangeLabel(label, qty, unitForms) {
  const match = String(label || '').trim().match(/^(\d+(?:[,.]\d+)?)\s*[–-]\s*(\d+(?:[,.]\d+)?)\s+(.+)$/);
  if (!match) return '';
  const low = Number(match[1].replace(',', '.')) * qty;
  const high = Number(match[2].replace(',', '.')) * qty;
  if (!Number.isFinite(low) || !Number.isFinite(high)) return '';
  return `${macroPracticeFormatQuantity(low)}–${macroPracticeFormatQuantity(high)} ${macroPracticeChooseForm(high, unitForms)}`.trim();
}

function macroPracticeScaleFractionLabel(label, qty, wholeForms, wholeCountForQtyOne = 0.5) {
  const count = Number(qty) * wholeCountForQtyOne;
  if (!Number.isFinite(count) || count <= 0) return '';
  if (macroPracticeIsIntegerLike(count) || count >= 1) {
    return macroPracticeBuildCountPhrase(count, wholeForms);
  }
  return `${macroPracticeFormatQuantity(qty)} × ${String(label || '').trim()}`;
}

function macroPracticeBuildScaledBasePortionLabel(rawLabel, qty) {
  const label = String(rawLabel || '').trim();
  const amount = Number(qty);
  if (!label || !Number.isFinite(amount) || amount <= 0 || macroPracticeIsEffectivelyOne(amount)) return label;

  const exactScalers = {
    '1 porcja obiadowa': () => macroPracticeBuildCountPhrase(amount, { one: 'porcja obiadowa', few: 'porcje obiadowe', many: 'porcji obiadowych' }),
    '1 porcja śniadaniowa': () => macroPracticeBuildCountPhrase(amount, { one: 'porcja śniadaniowa', few: 'porcje śniadaniowe', many: 'porcji śniadaniowych' }),
    '1 średnia porcja': () => macroPracticeBuildCountPhrase(amount, { one: 'średnia porcja', few: 'średnie porcje', many: 'średnich porcji' }),
    '1 kubeczek': () => macroPracticeBuildCountPhrase(amount, { one: 'kubeczek', few: 'kubeczki', many: 'kubeczków' }),
    '1 szklanka': () => macroPracticeBuildCountPhrase(amount, { one: 'szklanka', few: 'szklanki', many: 'szklanek' }),
    '1 mała puszka': () => macroPracticeBuildCountPhrase(amount, { one: 'mała puszka', few: 'małe puszki', many: 'małych puszek' }),
    '1 średni banan': () => macroPracticeBuildCountPhrase(amount, { one: 'średni banan', few: 'średnie banany', many: 'średnich bananów' }),
    '1 średnia sztuka': () => macroPracticeBuildCountPhrase(amount, { one: 'średnia sztuka', few: 'średnie sztuki', many: 'średnich sztuk' }),
    '1 łyżka': () => macroPracticeBuildCountPhrase(amount, { one: 'łyżka', few: 'łyżki', many: 'łyżek' }),
    '1 garść': () => macroPracticeBuildCountPhrase(amount, { one: 'garść', few: 'garście', many: 'garści' }),
    '1 baton': () => macroPracticeBuildCountPhrase(amount, { one: 'baton', few: 'batony', many: 'batonów' }),
    '1 sztuka': () => macroPracticeBuildCountPhrase(amount, { one: 'sztuka', few: 'sztuki', many: 'sztuk' }),
    '1 mała paczka': () => macroPracticeBuildCountPhrase(amount, { one: 'mała paczka', few: 'małe paczki', many: 'małych paczek' }),
    '2 sztuki': () => macroPracticeBuildCountPhrase(amount * 2, { one: 'sztuka', few: 'sztuki', many: 'sztuk' }),
    '2 kromki': () => macroPracticeBuildCountPhrase(amount * 2, { one: 'kromka', few: 'kromki', many: 'kromek' }),
    '2 łyżki': () => macroPracticeBuildCountPhrase(amount * 2, { one: 'łyżka', few: 'łyżki', many: 'łyżek' }),
    '1/2 kostki': () => macroPracticeScaleFractionLabel(label, amount, { one: 'kostka', few: 'kostki', many: 'kostek' }, 0.5),
    '1/2 sztuki': () => macroPracticeScaleFractionLabel(label, amount, { one: 'sztuka', few: 'sztuki', many: 'sztuk' }, 0.5),
    '1/2 tabliczki': () => macroPracticeScaleFractionLabel(label, amount, { one: 'tabliczka', few: 'tabliczki', many: 'tabliczek' }, 0.5)
  };

  if (exactScalers[label]) return exactScalers[label]();
  if (label === '1/2–3/4 kostki') {
    return `${macroPracticeFormatQuantity(amount)} × ${label}`;
  }
  const scaledRange = macroPracticeScaleRangeLabel(label, amount, { one: 'plaster', few: 'plastry', many: 'plastrów' });
  if (scaledRange) return scaledRange;
  return `${macroPracticeFormatQuantity(amount)} × ${label}`;
}

function macroPracticeBuildScaledMassLabel(food, qty) {
  if (!food || typeof food !== 'object') return '';
  const amount = Number(qty);
  if (!Number.isFinite(amount) || amount <= 0) return '';
  const baseMass = Number(food.macroBasePortionMassG);
  if (!Number.isFinite(baseMass) || baseMass <= 0) return '';
  const totalMass = baseMass * amount;
  return `${macroPracticeFormatQuantity(totalMass, Number.isInteger(totalMass) ? 0 : 1)} g`;
}

function macroPracticeBuildScaledReferenceFoodLabel(food, qty) {
  if (!food || typeof food !== 'object') return '';
  const displayName = food.macroDisplayName || '';
  if (!displayName) return '';
  if (macroPracticeIsEffectivelyOne(qty)) return food.name || displayName;
  const scaledBaseLabel = macroPracticeBuildScaledBasePortionLabel(food.macroBasePortionLabel, qty);
  const massLabel = macroPracticeBuildScaledMassLabel(food, qty);
  const portionLabel = scaledBaseLabel && massLabel
    ? `${scaledBaseLabel} • ${massLabel}`
    : (scaledBaseLabel || massLabel);
  return portionLabel ? `${displayName} (${portionLabel})` : displayName;
}

function macroPracticeBuildScaledPlainFoodLabel(food, qty) {
  if (!food || !food.name) return '';
  const amount = Number(qty);
  const name = String(food.name);
  if (!Number.isFinite(amount) || amount <= 0 || macroPracticeIsEffectivelyOne(amount)) return name;

  const parenCountMatch = name.match(/^(.*?\()\s*(\d+(?:[,.]\d+)?)\s*(szt\.|sztuk|kawałków|kromek|łyżek)\s*(\).*)$/i);
  if (parenCountMatch) {
    const baseCount = Number(parenCountMatch[2].replace(',', '.'));
    const total = baseCount * amount;
    if (Number.isFinite(total)) {
      return `${parenCountMatch[1]}${macroPracticeFormatQuantity(total)} ${parenCountMatch[3]}${parenCountMatch[4]}`;
    }
  }

  const trailingMassMatch = name.match(/^(.*?)(\d+(?:[,.]\d+)?)\s*(g|ml)$/i);
  if (trailingMassMatch) {
    const baseValue = Number(trailingMassMatch[2].replace(',', '.'));
    const total = baseValue * amount;
    if (Number.isFinite(total)) {
      return `${trailingMassMatch[1]}${macroPracticeFormatQuantity(total, Number.isInteger(total) ? 0 : 1)} ${trailingMassMatch[3]}`.replace(/\s+/g, ' ').trim();
    }
  }

  const trailingCountMatch = name.match(/^(.*?)(\d+(?:[,.]\d+)?)\s+(kawałków|szt\.)$/i);
  if (trailingCountMatch) {
    const baseCount = Number(trailingCountMatch[2].replace(',', '.'));
    const total = baseCount * amount;
    if (Number.isFinite(total)) {
      return `${trailingCountMatch[1]}${macroPracticeFormatQuantity(total)} ${trailingCountMatch[3]}`.replace(/\s+/g, ' ').trim();
    }
  }

  return `${macroPracticeFormatQuantity(amount)} × ${name}`;
}

function macroPracticeBuildSelectedFoodLabel(foodKey, qty) {
  const resolvedKey = macroPracticeResolveFoodAliasKey(foodKey);
  const food = foods[resolvedKey];
  if (!food) return '';
  const referenceLabel = macroPracticeBuildScaledReferenceFoodLabel(food, qty);
  if (referenceLabel) return referenceLabel;
  return macroPracticeBuildScaledPlainFoodLabel(food, qty);
}


function macroPracticeFoodSortValue(food) {
  return String(food && food.name ? food.name : '')
    .toLocaleLowerCase('pl-PL')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function macroPracticeBuildFoodOptionsMarkup(selectedValue) {
  const grouped = FOOD_SELECT_GROUPS.reduce((acc, group) => {
    acc[group.key] = [];
    return acc;
  }, {});

  Object.entries(foods).forEach(([key, value]) => {
    if (!value || value.hiddenInFoodSelector) return;
    const groupKey = grouped[macroPracticeResolveFoodGroup(value)] ? macroPracticeResolveFoodGroup(value) : 'other';
    grouped[groupKey].push([key, value]);
  });

  return FOOD_SELECT_GROUPS
    .map((group) => {
      const entries = (grouped[group.key] || []).sort((a, b) => macroPracticeFoodSortValue(a[1]).localeCompare(macroPracticeFoodSortValue(b[1]), 'pl-PL'));
      if (!entries.length) return '';
      const options = entries
        .map(([key, value]) => {
          const selected = key === selectedValue ? ' selected' : '';
          return `<option value="${macroPracticeEscapeAttr(key)}"${selected}>${macroPracticeEscapeHtml(macroPracticeBuildFoodOptionLabel(value))}</option>`;
        })
        .join('');
      return `<optgroup label="${macroPracticeEscapeAttr(macroPracticeGetFoodGroupLabel(group.key))}">${options}</optgroup>`;
    })
    .join('');
}

function macroPracticeRefreshFoodSelectOptions() {
  document.querySelectorAll('.food-row select').forEach((selectEl) => {
    const currentValue = selectEl.value;
    const resolvedValue = macroPracticeResolveFoodAliasKey(currentValue);
    vildaAppSetTrustedHtml(selectEl, macroPracticeBuildFoodOptionsMarkup(resolvedValue), 'app:selectEl');
    selectEl.value = foods[resolvedValue] ? resolvedValue : 'snickers';
  });
}

function macroPracticeInstallReferenceFoods(forceRefresh = false) {
  if (MACRO_PRACTICE_STATE.installedFoodRefs && !forceRefresh) return false;
  const resources = macroPracticeGetResources();
  if (!resources || !Array.isArray(resources.dictionary.products)) return false;
  if (forceRefresh && Array.isArray(MACRO_PRACTICE_STATE.referenceFoodKeys)) {
    MACRO_PRACTICE_STATE.referenceFoodKeys.forEach((key) => {
      delete snacks[key];
      delete foods[key];
    });
  }
  const installedKeys = [];
  resources.dictionary.products.forEach((product) => {
    const entry = macroPracticeBuildFoodEntryFromProduct(product);
    const key = macroPracticeBuildReferenceFoodKey(product);
    if (!entry || !key) return;
    if (product.install_in_food_select === false) return;

    const aliasKey = MACRO_REFERENCE_FOOD_ALIASES[product.id];
    if (aliasKey && foods[aliasKey]) {
      // Te produkty występują już w podstawowej liście posiłków/przekąsek.
      // Nie dokładamy ich ponownie jako „produkty referencyjne”, żeby selektor nie miał duplikatów.
      return;
    }

    snacks[key] = entry;
    foods[key] = entry;
    installedKeys.push(key);
  });
  MACRO_PRACTICE_STATE.installedFoodRefs = installedKeys.length > 0;
  MACRO_PRACTICE_STATE.referenceFoodKeys = installedKeys;
  if (installedKeys.length) macroPracticeRefreshFoodSelectOptions();
  return installedKeys.length > 0;
}

function macroPracticeLoadResources() {
  if (!MACRO_PRACTICE_STATE.ready) {
    macroPracticeSetResources(MACRO_PRACTICE_FALLBACK_DICTIONARY, MACRO_PRACTICE_FALLBACK_COPY, 'embedded');
  }
  if (MACRO_PRACTICE_STATE.loadPromise) return MACRO_PRACTICE_STATE.loadPromise;
  MACRO_PRACTICE_STATE.loadPromise = Promise.all([
    macroPracticeFetchJsonCandidates(MACRO_PRACTICE_DICTIONARY_URL_CANDIDATES),
    macroPracticeFetchJsonCandidates(MACRO_UI_COPY_URL_CANDIDATES)
  ]).then(([dictionary, copy]) => {
    if (dictionary && copy) {
      return macroPracticeSetResources(dictionary, copy, 'fetched');
    }
    return macroPracticeGetResources();
  }).catch((error) => {
    console.warn('Nie udało się odświeżyć słownika praktycznych przykładów makro. Pozostawiono zasoby wbudowane w aplikację.', error);
    return macroPracticeGetResources();
  }).finally(() => {
    MACRO_PRACTICE_STATE.loadPromise = null;
  });
  return MACRO_PRACTICE_STATE.loadPromise;
}

function macroPracticeResolveFoodMacros(foodOrKey) {
  const food = typeof foodOrKey === 'string' ? foods[foodOrKey] : foodOrKey;
  if (!food || typeof food !== 'object') return null;
  const directMacros = ['protein_g', 'carbs_g', 'fat_g', 'saturated_fat_g', 'sugars_g', 'salt_g']
    .some((key) => Number.isFinite(Number(food[key])));
  if (directMacros) {
    return {
      energy_kcal: macroPracticeSafeNumber(food.kcal) || 0,
      protein_g: macroPracticeSafeNumber(food.protein_g) || 0,
      carbs_g: macroPracticeSafeNumber(food.carbs_g) || 0,
      fat_g: macroPracticeSafeNumber(food.fat_g) || 0,
      saturated_fat_g: macroPracticeSafeNumber(food.saturated_fat_g) || 0,
      sugars_g: macroPracticeSafeNumber(food.sugars_g) || 0,
      salt_g: macroPracticeSafeNumber(food.salt_g) || 0,
      macroProductId: food.macroProductId || '',
      portionLabel: food.macroPortionLabel || '',
      macroCategory: food.macroCategory || '',
      macroNote: food.macroNote || '',
      macroSource: food.macroSource || ''
    };
  }
  if (!food.macroProductId) return null;
  const portion = macroPracticeGetProductPortion(food.macroProductId);
  if (!portion) return null;
  const multiplier = macroPracticeSafeNumber(food.macroPortionMultiplier) || 1;
  return {
    energy_kcal: (macroPracticeSafeNumber(portion.energy_kcal) || 0) * multiplier,
    protein_g: (macroPracticeSafeNumber(portion.protein_g) || 0) * multiplier,
    carbs_g: (macroPracticeSafeNumber(portion.carbs_g) || 0) * multiplier,
    fat_g: (macroPracticeSafeNumber(portion.fat_g) || 0) * multiplier,
    saturated_fat_g: (macroPracticeSafeNumber(portion.saturated_fat_g) || 0) * multiplier,
    sugars_g: (macroPracticeSafeNumber(portion.sugars_g) || 0) * multiplier,
    salt_g: (macroPracticeSafeNumber(portion.salt_g) || 0) * multiplier,
    macroProductId: food.macroProductId,
    portionLabel: food.macroPortionLabel || '',
    macroCategory: food.macroCategory || '',
    macroNote: food.macroNote || '',
    macroSource: food.macroSource || ''
  };
}

function macroPracticeGetNutritionGoalTargets(model) {
  if (!model || typeof model !== 'object') return null;
  const midpoint = (range) => Array.isArray(range) && range.length === 2 ? (Number(range[0]) + Number(range[1])) / 2 : null;
  let energyKcal = null;
  const energy = model.energy && typeof model.energy === 'object' ? model.energy : null;
  if (energy && energy.available) {
    if (Array.isArray(energy.items) && energy.items.length) {
      const energyValues = energy.items
        .map((item) => macroPracticeSafeNumber(item && item.teeKcal))
        .filter((value) => Number.isFinite(value) && value > 0);
      if (energyValues.length === 1) {
        energyKcal = energyValues[0];
      } else if (energyValues.length > 1) {
        energyKcal = (Math.min(...energyValues) + Math.max(...energyValues)) / 2;
      }
    }
    if (!Number.isFinite(energyKcal) && Array.isArray(energy.range) && energy.range.length === 2) {
      energyKcal = midpoint(energy.range);
    }
  }

  const reference = model.planningReference && typeof model.planningReference === 'object'
    ? model.planningReference
    : null;
  const referenceGramTargets = reference && reference.gramTargets && typeof reference.gramTargets === 'object'
    ? reference.gramTargets
    : null;
  const referencePercent = reference && reference.percent && typeof reference.percent === 'object'
    ? reference.percent
    : null;
  const percentToGrams = (pct, kcalPerGram) => {
    const p = macroPracticeSafeNumber(pct);
    const e = macroPracticeSafeNumber(energyKcal);
    const k = macroPracticeSafeNumber(kcalPerGram);
    return Number.isFinite(p) && Number.isFinite(e) && e > 0 && Number.isFinite(k) && k > 0
      ? (e * (p / 100)) / k
      : null;
  };

  const proteinPlanningRange = model.protein && Array.isArray(model.protein.planningGramRange) ? model.protein.planningGramRange : null;
  const proteinPlanningG = midpoint(proteinPlanningRange);
  const proteinRdaG = model.protein && model.protein.main ? macroPracticeSafeNumber(model.protein.main.rdaGDay) : null;
  const carbsRange = model.carbs && Array.isArray(model.carbs.gramRange) ? model.carbs.gramRange : null;
  const fatRange = model.fat && Array.isArray(model.fat.gramRange) ? model.fat.gramRange : null;

  const proteinG = macroPracticeSafeNumber(referenceGramTargets && referenceGramTargets.proteinG)
    || percentToGrams(referencePercent && referencePercent.protein, 4)
    || (Number.isFinite(proteinPlanningG) && proteinPlanningG > 0 ? proteinPlanningG : proteinRdaG);
  const carbsG = macroPracticeSafeNumber(referenceGramTargets && referenceGramTargets.carbsG)
    || percentToGrams(referencePercent && referencePercent.carbs, 4)
    || midpoint(carbsRange);
  const fatG = macroPracticeSafeNumber(referenceGramTargets && referenceGramTargets.fatG)
    || percentToGrams(referencePercent && referencePercent.fat, 9)
    || midpoint(fatRange);

  const satfatCap = MACRO_PRACTICE_STATE.dictionary && MACRO_PRACTICE_STATE.dictionary.reference_caps
    ? macroPracticeSafeNumber(MACRO_PRACTICE_STATE.dictionary.reference_caps.saturated_fat_g)
    : 20;
  return {
    energy_kcal: energyKcal,
    protein_g: proteinG,
    carbs_g: carbsG,
    fat_g: fatG,
    reference_percent: referencePercent || null,
    satfat_cap_g: satfatCap || 20
  };
}

function macroPracticePercentOfGoal(value, total) {
  const num = Number(value);
  const den = Number(total);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return null;
  return Math.round((num / den) * 100);
}

function macroPracticeBuildTotalGoalShareParts(totals, nutritionModel) {
  const targets = macroPracticeGetNutritionGoalTargets(nutritionModel);
  const result = { energy: '', macros: [] };
  if (!targets) return result;
  const buildPart = (label, value, target) => {
    const pct = macroPracticePercentOfGoal(value, target);
    return pct !== null ? `${label} ${pct}%` : '';
  };
  result.energy = buildPart('Energia', totals && totals.energy_kcal, targets.energy_kcal);
  ['Białko', 'Węglowodany', 'Tłuszcze'].forEach((label) => {
    const key = label === 'Białko' ? 'protein_g' : label === 'Węglowodany' ? 'carbs_g' : 'fat_g';
    const targetKey = key;
    const part = buildPart(label, totals && totals[key], targets[targetKey]);
    if (part) result.macros.push(part);
  });
  return result;
}

function macroPracticeBuildTotalGoalShareLine(totals, nutritionModel) {
  const parts = macroPracticeBuildTotalGoalShareParts(totals, nutritionModel);
  const combined = [parts.energy, ...parts.macros].filter(Boolean);
  return combined.length ? `Procent dziennego celu do planowania diety: ${combined.join(' • ')}` : '';
}

function macroPracticeGetWarningLevel(sharePct) {
  const thresholds = MACRO_PRACTICE_STATE.dictionary && MACRO_PRACTICE_STATE.dictionary.warning_rules
    ? MACRO_PRACTICE_STATE.dictionary.warning_rules.saturated_fat_portion_share_of_day_cap_pct
    : null;
  const share = Number(sharePct);
  if (!Number.isFinite(share)) return 'medium';
  const lowMax = thresholds && Number.isFinite(Number(thresholds.low_max)) ? Number(thresholds.low_max) : 10;
  const mediumMax = thresholds && Number.isFinite(Number(thresholds.medium_max)) ? Number(thresholds.medium_max) : 20;
  if (share <= lowMax) return 'low';
  if (share <= mediumMax) return 'medium';
  return 'high';
}

function macroPracticeFormatDisplayNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0';
  const digits = Math.abs(num) >= 10 ? 0 : 1;
  return num.toLocaleString('pl-PL', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function macroPracticeAnalyzeFoodSelection(foodKey, qty, nutritionModel) {
  const base = macroPracticeResolveFoodMacros(foodKey);
  if (!base) return null;
  const amount = Number(qty);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const totals = {
    energy_kcal: (macroPracticeSafeNumber(base.energy_kcal) || 0) * amount,
    protein_g: (macroPracticeSafeNumber(base.protein_g) || 0) * amount,
    carbs_g: (macroPracticeSafeNumber(base.carbs_g) || 0) * amount,
    fat_g: (macroPracticeSafeNumber(base.fat_g) || 0) * amount,
    saturated_fat_g: (macroPracticeSafeNumber(base.saturated_fat_g) || 0) * amount,
    sugars_g: (macroPracticeSafeNumber(base.sugars_g) || 0) * amount,
    salt_g: (macroPracticeSafeNumber(base.salt_g) || 0) * amount
  };
  const mealCopy = MACRO_PRACTICE_STATE.copy && MACRO_PRACTICE_STATE.copy.meal_card ? MACRO_PRACTICE_STATE.copy.meal_card : null;
  const chips = MACRO_PRACTICE_STATE.copy && MACRO_PRACTICE_STATE.copy.chips ? MACRO_PRACTICE_STATE.copy.chips : null;
  const macroLine = mealCopy
    ? macroPracticeFillTemplate(mealCopy.line_macros, {
        protein_g: macroPracticeFormatDisplayNumber(totals.protein_g),
        carbs_g: macroPracticeFormatDisplayNumber(totals.carbs_g),
        fat_g: macroPracticeFormatDisplayNumber(totals.fat_g)
      })
    : '';
  const targets = macroPracticeGetNutritionGoalTargets(nutritionModel);
  const proteinPct = targets ? macroPracticePercentOfGoal(totals.protein_g, targets.protein_g) : null;
  const carbsPct = targets ? macroPracticePercentOfGoal(totals.carbs_g, targets.carbs_g) : null;
  const fatPct = targets ? macroPracticePercentOfGoal(totals.fat_g, targets.fat_g) : null;
  const coverageLine = (mealCopy && proteinPct !== null && carbsPct !== null && fatPct !== null)
    ? macroPracticeFillTemplate(mealCopy.line_goal_share, { protein_pct: proteinPct, carbs_pct: carbsPct, fat_pct: fatPct })
    : '';
  const satfatPct = targets ? macroPracticePercentOfGoal(totals.saturated_fat_g, targets.satfat_cap_g) : null;
  const warningLevel = satfatPct !== null ? macroPracticeGetWarningLevel(satfatPct) : null;
  const warningLabel = chips && warningLevel && chips[warningLevel]
    ? chips[warningLevel]
    : (warningLevel === 'high' ? 'wysoka ilość' : warningLevel === 'low' ? 'niska ilość' : 'średnia ilość');
  const warningLine = (mealCopy && satfatPct !== null && satfatPct > 0)
    ? macroPracticeFillTemplate(mealCopy.line_warning_satfat, { level_label: warningLabel, pct: satfatPct })
    : '';
  const showAsWarning = String(base.macroCategory || '') === 'satfat' || totals.saturated_fat_g >= 4;
  return { nutrients: totals, macroLine, coverageLine, warningLine, showAsWarning, satfatPct, warningLevel, macroNote: base.macroNote || '', macroSource: base.macroSource || '' };
}

macroPracticeLoadResources();
window.addEventListener('macroPracticeResourcesReady', () => {
  try {
    if (typeof update === 'function') update();
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('vilda_macro_practice.js', _, { line: 2979 });
    }
  }
});

window.macroPracticeLoadResources = macroPracticeLoadResources;
window.macroPracticeGetResources = macroPracticeGetResources;
window.macroPracticeFillTemplate = macroPracticeFillTemplate;
window.macroPracticeGetProductsByCategory = macroPracticeGetProductsByCategory;
window.macroPracticeGetProductPortion = macroPracticeGetProductPortion;
window.macroPracticeResolveFoodMacros = macroPracticeResolveFoodMacros;
window.macroPracticeGetNutritionGoalTargets = macroPracticeGetNutritionGoalTargets;
window.macroPracticePercentOfGoal = macroPracticePercentOfGoal;
window.macroPracticeGetWarningLevel = macroPracticeGetWarningLevel;
window.macroPracticeAnalyzeFoodSelection = macroPracticeAnalyzeFoodSelection;
window.macroPracticeBuildSelectedFoodLabel = macroPracticeBuildSelectedFoodLabel;

/* === MACRO PRACTICE NUTRITION NORMS REFRESH moved to vilda_food_summary.js in step 8E === */

/**
 * Adds a food row to the unified food list.  Uses the combined `foods`
 * dictionary.  Accepts an optional default key; falls back to 'snickers'.
 */
function addFoodRow(defaultKey = 'snickers'){
  const resolvedDefaultKey = macroPracticeResolveFoodAliasKey(defaultKey) || 'snickers';
  addRow('foodList', foods, 'food-row', foods[resolvedDefaultKey] ? resolvedDefaultKey : 'snickers');
}



let rowId=0;
function addRow(containerId,optionsObj,className,defaultKey){
  const row=document.createElement('div');
  row.className=className;
  row.dataset.id=rowId++;
  const isFoodRow = className === 'food-row';
  const optionsHtml = isFoodRow
    ? macroPracticeBuildFoodOptionsMarkup(defaultKey)
    : Object.entries(optionsObj).map(([k,v])=>`<option value="${macroPracticeEscapeAttr(k)}" ${k===defaultKey?'selected':''}>${macroPracticeEscapeHtml(v.name)}</option>`).join('');
  const changeHandler = isFoodRow ? 'debouncedFoodUpdate()' : 'debouncedUpdate()';
  const removeHandler = isFoodRow
    ? 'this.parentElement.remove();macroPracticeRefreshFoodCardOnly({preserveViewport:true})'
    : 'this.parentElement.remove();update()';
  vildaAppSetTrustedHtml(row, `
    <select onchange="${changeHandler}">
      ${optionsHtml}
    </select>
    <input type="number" value="1" min="1" onchange="${changeHandler}" title="Ilość">
    <button type="button" class="icon" aria-label="Usuń" onclick="${removeHandler}">×</button>`, 'app:row');
  document.getElementById(containerId).appendChild(row);
  if (isFoodRow && typeof macroPracticeRefreshFoodCardOnly === 'function') {
    macroPracticeRefreshFoodCardOnly({ preserveViewport: true });
  } else {
    update();
  }
}
// `addSnackRow` and `addMealRow` are preserved for backward compatibility but
// now delegate to the unified `addFoodRow`.  They specify the default key
// corresponding to the first item in the original category.
function addSnackRow(){ addFoodRow('snickers'); }
function addMealRow(){ addFoodRow('burger'); }



  const api = Object.freeze({
    version: VILDA_MACRO_PRACTICE_VERSION,
    snacks: snacks,
    meals: meals,
    foods: foods,
    foodSelectGroups: FOOD_SELECT_GROUPS,
    state: MACRO_PRACTICE_STATE,
    macroPracticeResolveFoodAliasKey: macroPracticeResolveFoodAliasKey,
    macroPracticeSafeNumber: macroPracticeSafeNumber,
    macroPracticeFormatNumber: macroPracticeFormatNumber,
    macroPracticeFillTemplate: macroPracticeFillTemplate,
    macroPracticeEscapeHtml: macroPracticeEscapeHtml,
    macroPracticeDeepClone: macroPracticeDeepClone,
    macroPracticeDispatchReady: macroPracticeDispatchReady,
    macroPracticeSetResources: macroPracticeSetResources,
    macroPracticeGetResources: macroPracticeGetResources,
    macroPracticeGetProductsByCategory: macroPracticeGetProductsByCategory,
    macroPracticeGetProduct: macroPracticeGetProduct,
    macroPracticeGetProductPortion: macroPracticeGetProductPortion,
    macroPracticeBuildPortionLabel: macroPracticeBuildPortionLabel,
    macroPracticeBuildFoodOptionName: macroPracticeBuildFoodOptionName,
    macroPracticeBuildReferenceFoodKey: macroPracticeBuildReferenceFoodKey,
    macroPracticeBuildFoodEntryFromProduct: macroPracticeBuildFoodEntryFromProduct,
    macroPracticeEscapeAttr: macroPracticeEscapeAttr,
    macroPracticeResolveFoodGroup: macroPracticeResolveFoodGroup,
    macroPracticeGetFoodGroupLabel: macroPracticeGetFoodGroupLabel,
    macroPracticeBuildFoodOptionLabel: macroPracticeBuildFoodOptionLabel,
    macroPracticeIsEffectivelyOne: macroPracticeIsEffectivelyOne,
    macroPracticeIsIntegerLike: macroPracticeIsIntegerLike,
    macroPracticeFormatQuantity: macroPracticeFormatQuantity,
    macroPracticePolishPluralForm: macroPracticePolishPluralForm,
    macroPracticeChooseForm: macroPracticeChooseForm,
    macroPracticeBuildCountPhrase: macroPracticeBuildCountPhrase,
    macroPracticeScaleRangeLabel: macroPracticeScaleRangeLabel,
    macroPracticeScaleFractionLabel: macroPracticeScaleFractionLabel,
    macroPracticeBuildScaledBasePortionLabel: macroPracticeBuildScaledBasePortionLabel,
    macroPracticeBuildScaledMassLabel: macroPracticeBuildScaledMassLabel,
    macroPracticeBuildScaledReferenceFoodLabel: macroPracticeBuildScaledReferenceFoodLabel,
    macroPracticeBuildScaledPlainFoodLabel: macroPracticeBuildScaledPlainFoodLabel,
    macroPracticeBuildSelectedFoodLabel: macroPracticeBuildSelectedFoodLabel,
    macroPracticeFoodSortValue: macroPracticeFoodSortValue,
    macroPracticeBuildFoodOptionsMarkup: macroPracticeBuildFoodOptionsMarkup,
    macroPracticeRefreshFoodSelectOptions: macroPracticeRefreshFoodSelectOptions,
    macroPracticeInstallReferenceFoods: macroPracticeInstallReferenceFoods,
    macroPracticeLoadResources: macroPracticeLoadResources,
    macroPracticeResolveFoodMacros: macroPracticeResolveFoodMacros,
    macroPracticeGetNutritionGoalTargets: macroPracticeGetNutritionGoalTargets,
    macroPracticePercentOfGoal: macroPracticePercentOfGoal,
    macroPracticeBuildTotalGoalShareParts: macroPracticeBuildTotalGoalShareParts,
    macroPracticeBuildTotalGoalShareLine: macroPracticeBuildTotalGoalShareLine,
    macroPracticeGetWarningLevel: macroPracticeGetWarningLevel,
    macroPracticeFormatDisplayNumber: macroPracticeFormatDisplayNumber,
    macroPracticeAnalyzeFoodSelection: macroPracticeAnalyzeFoodSelection,
    addFoodRow: addFoodRow,
    addRow: addRow,
    addSnackRow: addSnackRow,
    addMealRow: addMealRow,
    macroPracticeFetchJsonCandidates: macroPracticeFetchJsonCandidates
  });

  global.VildaMacroPractice = api;
  global.vildaMacroPractice = api;
  global.vildaMacroPracticeVersion = function() { return VILDA_MACRO_PRACTICE_VERSION; };

  global.macroPracticeResolveFoodAliasKey = macroPracticeResolveFoodAliasKey;
  global.macroPracticeSafeNumber = macroPracticeSafeNumber;
  global.macroPracticeFormatNumber = macroPracticeFormatNumber;
  global.macroPracticeFillTemplate = macroPracticeFillTemplate;
  global.macroPracticeEscapeHtml = macroPracticeEscapeHtml;
  global.macroPracticeDeepClone = macroPracticeDeepClone;
  global.macroPracticeDispatchReady = macroPracticeDispatchReady;
  global.macroPracticeSetResources = macroPracticeSetResources;
  global.macroPracticeGetResources = macroPracticeGetResources;
  global.macroPracticeGetProductsByCategory = macroPracticeGetProductsByCategory;
  global.macroPracticeGetProduct = macroPracticeGetProduct;
  global.macroPracticeGetProductPortion = macroPracticeGetProductPortion;
  global.macroPracticeBuildPortionLabel = macroPracticeBuildPortionLabel;
  global.macroPracticeBuildFoodOptionName = macroPracticeBuildFoodOptionName;
  global.macroPracticeBuildReferenceFoodKey = macroPracticeBuildReferenceFoodKey;
  global.macroPracticeBuildFoodEntryFromProduct = macroPracticeBuildFoodEntryFromProduct;
  global.macroPracticeEscapeAttr = macroPracticeEscapeAttr;
  global.macroPracticeResolveFoodGroup = macroPracticeResolveFoodGroup;
  global.macroPracticeGetFoodGroupLabel = macroPracticeGetFoodGroupLabel;
  global.macroPracticeBuildFoodOptionLabel = macroPracticeBuildFoodOptionLabel;
  global.macroPracticeIsEffectivelyOne = macroPracticeIsEffectivelyOne;
  global.macroPracticeIsIntegerLike = macroPracticeIsIntegerLike;
  global.macroPracticeFormatQuantity = macroPracticeFormatQuantity;
  global.macroPracticePolishPluralForm = macroPracticePolishPluralForm;
  global.macroPracticeChooseForm = macroPracticeChooseForm;
  global.macroPracticeBuildCountPhrase = macroPracticeBuildCountPhrase;
  global.macroPracticeScaleRangeLabel = macroPracticeScaleRangeLabel;
  global.macroPracticeScaleFractionLabel = macroPracticeScaleFractionLabel;
  global.macroPracticeBuildScaledBasePortionLabel = macroPracticeBuildScaledBasePortionLabel;
  global.macroPracticeBuildScaledMassLabel = macroPracticeBuildScaledMassLabel;
  global.macroPracticeBuildScaledReferenceFoodLabel = macroPracticeBuildScaledReferenceFoodLabel;
  global.macroPracticeBuildScaledPlainFoodLabel = macroPracticeBuildScaledPlainFoodLabel;
  global.macroPracticeBuildSelectedFoodLabel = macroPracticeBuildSelectedFoodLabel;
  global.macroPracticeFoodSortValue = macroPracticeFoodSortValue;
  global.macroPracticeBuildFoodOptionsMarkup = macroPracticeBuildFoodOptionsMarkup;
  global.macroPracticeRefreshFoodSelectOptions = macroPracticeRefreshFoodSelectOptions;
  global.macroPracticeInstallReferenceFoods = macroPracticeInstallReferenceFoods;
  global.macroPracticeLoadResources = macroPracticeLoadResources;
  global.macroPracticeResolveFoodMacros = macroPracticeResolveFoodMacros;
  global.macroPracticeGetNutritionGoalTargets = macroPracticeGetNutritionGoalTargets;
  global.macroPracticePercentOfGoal = macroPracticePercentOfGoal;
  global.macroPracticeBuildTotalGoalShareParts = macroPracticeBuildTotalGoalShareParts;
  global.macroPracticeBuildTotalGoalShareLine = macroPracticeBuildTotalGoalShareLine;
  global.macroPracticeGetWarningLevel = macroPracticeGetWarningLevel;
  global.macroPracticeFormatDisplayNumber = macroPracticeFormatDisplayNumber;
  global.macroPracticeAnalyzeFoodSelection = macroPracticeAnalyzeFoodSelection;
  global.addFoodRow = addFoodRow;
  global.addRow = addRow;
  global.addSnackRow = addSnackRow;
  global.addMealRow = addMealRow;
  global.macroPracticeFetchJsonCandidates = macroPracticeFetchJsonCandidates;

})(typeof window !== 'undefined' ? window : globalThis);
