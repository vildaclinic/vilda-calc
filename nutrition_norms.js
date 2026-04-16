(function(window, document) {
  'use strict';

  const NUTRITION_NORMS_DEFAULT_STATE = {
    palSelector: '1.6',
    bodyMode: 'actual',
    includeInSummary: false
  };

  const KCAL_PER_GRAM = {
    protein: 4,
    carbs: 4,
    fat: 9
  };

  function nutritionNormsGetSharedReferenceEntry(sex, ageYears, ageMonthsOpt) {
    if (typeof window.energyGetReferenceEntry === 'function') {
      return window.energyGetReferenceEntry({ sex, ageYears, ageMonthsOpt });
    }
    return { band: null, row: null };
  }

  function el(id) {
    return document.getElementById(id);
  }

  function toNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : NaN;
  }

  function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function normalizeSex(value) {
    return String(value || '').toUpperCase() === 'F' ? 'F' : 'M';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatNumber(value, digits) {
    if (!isFiniteNumber(value)) return '—';
    const precision = Number.isFinite(digits) ? Math.max(0, digits) : 0;
    const rounded = Number(value.toFixed(precision));
    return String(rounded).replace('.', ',');
  }

  function formatKcal(value) {
    return isFiniteNumber(value) ? `${formatNumber(value, 0)} kcal/d` : '—';
  }

  function formatKg(value, digits) {
    return isFiniteNumber(value) ? `${formatNumber(value, Number.isFinite(digits) ? digits : 1)} kg` : '—';
  }

  function formatPal(value) {
    return isFiniteNumber(value) ? formatNumber(value, 1) : '—';
  }

  function formatPercentRange(range) {
    if (!Array.isArray(range) || range.length !== 2) return '—';
    return `${formatNumber(range[0], 0)}–${formatNumber(range[1], 0)}% energii`;
  }

  function formatPercentRangeValue(minValue, maxValue, digits) {
    const precision = Number.isFinite(digits) ? Math.max(0, digits) : 0;
    if (!(isFiniteNumber(minValue) && isFiniteNumber(maxValue))) return '—';
    if (Math.abs(Number(minValue) - Number(maxValue)) < (precision === 0 ? 0.5 : 0.05)) {
      return `około ${formatNumber((Number(minValue) + Number(maxValue)) / 2, precision)}% energii`;
    }
    return `${formatNumber(minValue, precision)}–${formatNumber(maxValue, precision)}% energii`;
  }

  function formatGramRange(range, digits) {
    if (!Array.isArray(range) || range.length !== 2 || !isFiniteNumber(range[0]) || !isFiniteNumber(range[1])) return '—';
    const precision = Number.isFinite(digits) ? digits : 0;
    return `${formatNumber(range[0], precision)}–${formatNumber(range[1], precision)} g/d`;
  }

  function formatGramTarget(range, digits) {
    if (!Array.isArray(range) || range.length !== 2 || !isFiniteNumber(range[0]) || !isFiniteNumber(range[1])) return '—';
    const precision = Number.isFinite(digits) ? digits : 0;
    const minVal = Number(range[0]);
    const maxVal = Number(range[1]);
    if (Math.abs(minVal - maxVal) < Math.max(0.05, precision === 0 ? 0.5 : 0.05)) {
      return `${formatNumber((minVal + maxVal) / 2, precision)} g/d`;
    }
    return `${formatNumber(minVal, precision)}–${formatNumber(maxVal, precision)} g/d`;
  }

  function nutritionNormsPracticeMidpoint(range) {
    if (!Array.isArray(range) || range.length !== 2 || !isFiniteNumber(range[0]) || !isFiniteNumber(range[1])) return null;
    return (Number(range[0]) + Number(range[1])) / 2;
  }

  function nutritionNormsGetPracticeResources() {
    return typeof window.macroPracticeGetResources === 'function' ? window.macroPracticeGetResources() : null;
  }

  function nutritionNormsPracticeTemplate(template, values) {
    if (typeof window.macroPracticeFillTemplate === 'function') {
      return window.macroPracticeFillTemplate(template, values);
    }
    return String(template || '');
  }

  function nutritionNormsGetPracticeProducts(category) {
    return typeof window.macroPracticeGetProductsByCategory === 'function'
      ? window.macroPracticeGetProductsByCategory(category)
      : [];
  }

  function nutritionNormsGetPracticePortion(product) {
    return typeof window.macroPracticeGetProductPortion === 'function'
      ? window.macroPracticeGetProductPortion(product)
      : null;
  }

  function nutritionNormsPracticePercent(value, total) {
    return typeof window.macroPracticePercentOfGoal === 'function'
      ? window.macroPracticePercentOfGoal(value, total)
      : null;
  }

  function nutritionNormsPracticeWarningLevel(sharePct) {
    return typeof window.macroPracticeGetWarningLevel === 'function'
      ? window.macroPracticeGetWarningLevel(sharePct)
      : 'medium';
  }

  function nutritionNormsPracticeCountServings(targetProteinG) {
    if (!isFiniteNumber(targetProteinG)) return 3;
    return Math.max(2, Math.min(6, Math.round(targetProteinG / 25)));
  }

  function nutritionNormsPracticeFormatPortionMass(product) {
    const portion = nutritionNormsGetPracticePortion(product);
    const massG = portion && isFiniteNumber(portion.portion_mass_g) ? Number(portion.portion_mass_g) : null;
    if (!isFiniteNumber(massG) || massG <= 0) return '';
    return `${formatNumber(massG, Number.isInteger(massG) ? 0 : 1)} g`;
  }

  function nutritionNormsPracticePortionLabel(product) {
    if (!product || typeof product !== 'object') return '';
    const rawLabel = product.default_portion && product.default_portion.label_pl
      ? String(product.default_portion.label_pl).trim()
      : '';
    const massLabel = nutritionNormsPracticeFormatPortionMass(product);
    if (rawLabel && massLabel) {
      if (/\b\d+(?:[.,]\d+)?\s*g\b/i.test(rawLabel)) return rawLabel;
      return `${rawLabel} • ${massLabel}`;
    }
    return rawLabel || massLabel || '';
  }

  const NUTRITION_PRACTICE_AGE_RULES = {
    protein_chicken_breast: { minYears: 4 },
    protein_skyr_natural: { minYears: 1 },
    protein_twarog_half_fat: { minYears: 1 },
    protein_eggs: { minYears: 1 },
    protein_tofu_natural: { minYears: 4 },
    carb_rice_cooked: { minYears: 1 },
    carb_pasta_cooked: { minYears: 2 },
    carb_oats_dry: { minYears: 1 },
    carb_banana: { minYears: 1 },
    carb_wholegrain_bread: { minYears: 2 },
    fat_olive_oil: { minYears: 1 },
    fat_avocado: { minYears: 1 },
    fat_walnuts: { minYears: 4 },
    fat_almonds: { minYears: 4 },
    fat_peanut_butter_100: { minYears: 3 },
    satfat_snickers_single: { minYears: 10 },
    satfat_milk_chocolate: { minYears: 4 },
    satfat_butter_croissant: { minYears: 4 },
    satfat_kabanos: { minYears: 6 },
    satfat_yellow_cheese: { minYears: 1 }
  };

  const NUTRITION_PRACTICE_AGE_PRIORITIES = {
    toddler: {
      protein: ['protein_eggs', 'protein_skyr_natural', 'protein_twarog_half_fat', 'protein_chicken_breast'],
      carbs: ['carb_oats_dry', 'carb_banana', 'carb_rice_cooked', 'carb_pasta_cooked', 'carb_wholegrain_bread'],
      fat: ['fat_avocado', 'fat_olive_oil', 'fat_peanut_butter_100'],
      satfat: ['satfat_yellow_cheese', 'satfat_butter_croissant', 'satfat_milk_chocolate']
    },
    child: {
      protein: ['protein_eggs', 'protein_skyr_natural', 'protein_twarog_half_fat', 'protein_chicken_breast', 'protein_tofu_natural'],
      carbs: ['carb_rice_cooked', 'carb_pasta_cooked', 'carb_oats_dry', 'carb_banana', 'carb_wholegrain_bread'],
      fat: ['fat_avocado', 'fat_olive_oil', 'fat_walnuts', 'fat_almonds', 'fat_peanut_butter_100'],
      satfat: ['satfat_yellow_cheese', 'satfat_milk_chocolate', 'satfat_butter_croissant', 'satfat_kabanos']
    },
    teen: {
      protein: ['protein_chicken_breast', 'protein_skyr_natural', 'protein_eggs', 'protein_twarog_half_fat', 'protein_tofu_natural'],
      carbs: ['carb_pasta_cooked', 'carb_rice_cooked', 'carb_oats_dry', 'carb_banana', 'carb_wholegrain_bread'],
      fat: ['fat_olive_oil', 'fat_avocado', 'fat_walnuts', 'fat_almonds', 'fat_peanut_butter_100'],
      satfat: ['satfat_snickers_single', 'satfat_milk_chocolate', 'satfat_butter_croissant', 'satfat_kabanos', 'satfat_yellow_cheese']
    },
    adult: {
      protein: ['protein_chicken_breast', 'protein_skyr_natural', 'protein_twarog_half_fat', 'protein_eggs', 'protein_tofu_natural'],
      carbs: ['carb_rice_cooked', 'carb_pasta_cooked', 'carb_oats_dry', 'carb_banana', 'carb_wholegrain_bread'],
      fat: ['fat_olive_oil', 'fat_avocado', 'fat_walnuts', 'fat_almonds', 'fat_peanut_butter_100'],
      satfat: ['satfat_snickers_single', 'satfat_milk_chocolate', 'satfat_butter_croissant', 'satfat_kabanos', 'satfat_yellow_cheese']
    }
  };

  function nutritionNormsGetPracticeAgeValue(model) {
    if (model && model.ageBand) {
      const ageBand = model.ageBand;
      if (ageBand.kind === 'infant_0_6') {
        return Math.max(0, Number(ageBand.completedMonths || 0) / 12);
      }
      if (ageBand.kind === 'infant_6_11') {
        return Math.max(0.5, Number(ageBand.infantMonth || ageBand.completedMonths || 6) / 12);
      }
      if (isFiniteNumber(Number(ageBand.completedYears))) {
        return Number(ageBand.completedYears);
      }
    }
    if (typeof window.getAgeDecimal === 'function') {
      const currentAge = Number(window.getAgeDecimal());
      if (Number.isFinite(currentAge)) return currentAge;
    }
    return null;
  }

  function nutritionNormsGetPracticeAgeBucket(model) {
    const ageYears = nutritionNormsGetPracticeAgeValue(model);
    if (!isFiniteNumber(ageYears)) return 'adult';
    if (ageYears < 1) return 'infant';
    if (ageYears < 4) return 'toddler';
    if (ageYears < 10) return 'child';
    if (ageYears < 19) return 'teen';
    return 'adult';
  }

  function nutritionNormsPracticeProductMatchesAge(product, model) {
    if (!product || typeof product !== 'object') return false;
    const ageYears = nutritionNormsGetPracticeAgeValue(model);
    const bucket = nutritionNormsGetPracticeAgeBucket(model);
    if (bucket === 'infant') return false;
    const rules = product && product.id ? NUTRITION_PRACTICE_AGE_RULES[product.id] : null;
    if (!rules || !isFiniteNumber(ageYears)) return true;
    if (Number.isFinite(Number(rules.minYears)) && ageYears < Number(rules.minYears)) return false;
    if (Number.isFinite(Number(rules.maxYears)) && ageYears > Number(rules.maxYears)) return false;
    return true;
  }

  function nutritionNormsGetPracticePriorityIndex(productId, ageBucket, category) {
    const bucketRules = ageBucket ? NUTRITION_PRACTICE_AGE_PRIORITIES[ageBucket] : null;
    const orderedIds = bucketRules && bucketRules[category] ? bucketRules[category] : null;
    if (!Array.isArray(orderedIds) || !orderedIds.length) return Number.MAX_SAFE_INTEGER;
    const index = orderedIds.indexOf(productId);
    return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
  }

  function nutritionNormsRotatePracticeProducts(products, seedValue) {
    const list = Array.isArray(products) ? products.slice() : [];
    if (list.length <= 1) return list;
    const seed = Math.abs(Number(seedValue) || 0);
    const offset = seed % list.length;
    if (!offset) return list;
    return list.slice(offset).concat(list.slice(0, offset));
  }

  function nutritionNormsGetPracticeRotationSeed(model, category, sectionKey) {
    const ageBucket = nutritionNormsGetPracticeAgeBucket(model);
    const ageYears = nutritionNormsGetPracticeAgeValue(model);
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 0);
    const dayOfYear = Math.max(1, Math.floor((now - yearStart) / 86400000));
    const seedText = `${category || ''}|${sectionKey || ''}|${ageBucket}|${Math.floor(Number(ageYears) || 0)}`;
    let hash = 0;
    for (let i = 0; i < seedText.length; i += 1) {
      hash = ((hash * 33) + seedText.charCodeAt(i)) % 2147483647;
    }
    return dayOfYear + hash;
  }

  function nutritionNormsGetPracticeProductsForCategory(model, category) {
    const products = nutritionNormsGetPracticeProducts(category);
    const ageBucket = nutritionNormsGetPracticeAgeBucket(model);
    return products
      .map((product, index) => ({ product, index }))
      .filter(({ product }) => nutritionNormsPracticeProductMatchesAge(product, model))
      .sort((left, right) => {
        const priorityLeft = nutritionNormsGetPracticePriorityIndex(left.product.id, ageBucket, category);
        const priorityRight = nutritionNormsGetPracticePriorityIndex(right.product.id, ageBucket, category);
        if (priorityLeft !== priorityRight) return priorityLeft - priorityRight;
        return left.index - right.index;
      })
      .map(({ product }) => product);
  }

  function nutritionNormsSelectPracticeProducts(model, category, roles, limit, sectionKey) {
    let products = nutritionNormsGetPracticeProductsForCategory(model, category);
    if (Array.isArray(roles) && roles.length) {
      const roleSet = new Set(roles.map((role) => String(role)));
      products = products.filter((product) => roleSet.has(String(product && product.role || '')));
    }
    products = nutritionNormsRotatePracticeProducts(products, nutritionNormsGetPracticeRotationSeed(model, category, sectionKey || 'default'));
    if (!Number.isFinite(limit)) return products;
    return products.slice(0, Math.max(0, Number(limit)));
  }

  function nutritionNormsBuildPracticeInlineText(model, type) {
    const resources = nutritionNormsGetPracticeResources();
    const copy = resources && resources.copy ? resources.copy.card_inline : null;
    if (!copy) return '';
    let text = '';
    if (type === 'protein') {
      const target = model && model.protein && model.protein.main ? model.protein.main.rdaGDay : null;
      text = nutritionNormsPracticeTemplate(copy.protein_summary, {
        servings_count: nutritionNormsPracticeCountServings(target)
      });
    } else if (type === 'carbs') {
      text = copy.carbs_summary || '';
    } else if (type === 'fat') {
      text = copy.fat_summary || '';
    } else if (type === 'satfat') {
      text = copy.satfat_summary || '';
    }
    return String(text || '').replace(/^To\s+w\s+praktyce:\s*/i, '').trim();
  }

  function nutritionNormsRenderPracticeInline(model, type) {
    const resources = nutritionNormsGetPracticeResources();
    const eligibleProducts = nutritionNormsGetPracticeProductsForCategory(model, type);
    const text = nutritionNormsBuildPracticeInlineText(model, type);
    const cta = resources && resources.copy && resources.copy.card_inline ? resources.copy.card_inline.cta_examples : '';
    if (!text || !cta || !eligibleProducts.length) return '';
    return `
      <div class="nutrition-practice-inline">
        <div class="nutrition-practice-inline-text">${escapeHtml(text)}</div>
        <button type="button" class="nutrition-practice-cta" data-practice-sheet="${escapeHtml(type)}">${escapeHtml(cta)}</button>
      </div>`;
  }

  function nutritionNormsBuildRestingEnergyText(reeKcal) {
    return isFiniteNumber(reeKcal) ? `Spoczynkowy wydatek energetyczny: ${formatNumber(reeKcal, 0)} kcal/d` : '';
  }

  function nutritionNormsBuildProteinCriteriaText(main, targets) {
    if (main) {
      return `Zalecane spożycie (RDA): ${formatNumber(main.rdaGPerKg, 2)} g/kg • Średnie zapotrzebowanie (EAR): ${formatNumber(main.earGDay, 0)} g/d (${formatNumber(main.earGPerKg, 2)} g/kg)`;
    }
    if (targets && targets.available) {
      return `Zalecane spożycie (RDA): ${formatNumber(targets.rda_g_per_kg, 2)} g/kg • Średnie zapotrzebowanie (EAR): ${formatNumber(targets.ear_g_per_kg, 2)} g/kg`;
    }
    return '';
  }

  function nutritionNormsBuildProteinEnergyShareText(model) {
    const protein = model && model.protein;
    const energy = model && model.energy;
    const main = protein && protein.main;
    if (!(main && energy && energy.available)) return '';
    const earKcal = Number(main.earGDay) * KCAL_PER_GRAM.protein;
    const rdaKcal = Number(main.rdaGDay) * KCAL_PER_GRAM.protein;
    if (!(isFiniteNumber(earKcal) && isFiniteNumber(rdaKcal))) return '';

    const energyValues = Array.isArray(energy.items)
      ? energy.items.map((item) => Number(item && item.teeKcal)).filter((value) => isFiniteNumber(value) && value > 0)
      : [];
    if (!energyValues.length && Array.isArray(energy.range)) {
      energy.range.forEach((value) => {
        const num = Number(value);
        if (isFiniteNumber(num) && num > 0) energyValues.push(num);
      });
    }
    if (!energyValues.length) return '';

    const minEnergy = Math.min.apply(null, energyValues);
    const maxEnergy = Math.max.apply(null, energyValues);
    const minPercent = (earKcal / maxEnergy) * 100;
    const maxPercent = (rdaKcal / minEnergy) * 100;
    return formatPercentRangeValue(minPercent, maxPercent, 0);
  }

  function nutritionNormsExplainEnergyFormula(formulaLabel) {
    if (formulaLabel === 'Henry') {
      return 'Spoczynkowy wydatek energetyczny oszacowano równaniem Henry’ego, a następnie uwzględniono poziom aktywności fizycznej (PAL).';
    }
    if (formulaLabel === 'Butte') {
      return 'Całkowity wydatek energetyczny oszacowano wzorem Butte dla niemowląt w wieku 6–11 miesięcy.';
    }
    return '';
  }

  function nutritionNormsGetPalDisplayParts(pal) {
    const code = `PAL ${formatPal(pal)}`;
    const meta = typeof window.energyGetPalMeta === 'function' ? window.energyGetPalMeta(pal) : null;
    const label = meta && meta.tableLabel ? meta.tableLabel : '';
    const hint = meta && meta.tableHint ? meta.tableHint : '';
    return {
      main: label ? `${code} — ${label}` : code,
      hint
    };
  }

  function nutritionNormsBuildOmega3QualityText(text) {
    const clean = String(text || '').trim().replace(/\.$/, '');
    if (!clean) return '';
    if (/^DHA\s*:/i.test(clean)) {
      const value = clean.replace(/^DHA\s*:/i, '').trim();
      return `Kwas dokozaheksaenowy (DHA, omega-3) to długołańcuchowy tłuszcz nienasycony z rodziny omega-3. Zalecana ilość: ${value}.`;
    }
    if (/EPA\s*\+\s*DHA/i.test(clean)) {
      const value = clean.replace(/^EPA\s*\+\s*DHA\s*:/i, '').trim();
      return `Kwasy eikozapentaenowy (EPA) i dokozaheksaenowy (DHA) to długołańcuchowe tłuszcze nienasycone omega-3. Zalecana łączna ilość: ${value}. Najczęściej dostarczają ich tłuste ryby morskie.`;
    }
    return `${clean}.`;
  }

  function buildAgeLabel(ageYears, ageMonthsOpt) {
    const age = Number(ageYears);
    const months = Math.floor(Number(ageMonthsOpt) || 0);
    if (Number.isFinite(age) && age < 1) {
      const monthValue = months > 0 ? months : Math.max(0, Math.round(age * 12));
      if (monthValue === 1) return '1 miesiąc';
      if (monthValue >= 2 && monthValue <= 4) return `${monthValue} miesiące`;
      return `${monthValue} miesięcy`;
    }
    const completedYears = Math.floor(age || 0);
    if (completedYears === 1) return '1 rok';
    if (completedYears >= 2 && completedYears <= 4) return `${completedYears} lata`;
    return `${completedYears} lat`;
  }

  function nutritionNormsGetCompletedMonths(ageYears, ageMonthsOpt) {
    const ageNum = Number(ageYears) || 0;
    const fullYears = Math.floor(ageNum);
    if (fullYears === 0) {
      const explicitMonths = Math.floor(Number(ageMonthsOpt));
      if (Number.isFinite(explicitMonths) && explicitMonths >= 0) return explicitMonths;
      return Math.max(0, Math.floor(ageNum * 12));
    }
    return fullYears * 12;
  }

  function nutritionNormsGetCompletedYears(ageYears) {
    return Math.max(0, Math.floor(Number(ageYears) || 0));
  }

  function nutritionNormsGetAgeBand(ageYears, ageMonthsOpt) {
    const months = nutritionNormsGetCompletedMonths(ageYears, ageMonthsOpt);
    const years = nutritionNormsGetCompletedYears(ageYears);
    if (months < 6) {
      return { kind: 'infant_0_6', completedMonths: months, label: '0–6 miesięcy' };
    }
    if (months < 12) {
      return {
        kind: 'infant_6_11',
        completedMonths: months,
        infantMonth: Math.max(6, Math.min(11, months)),
        label: '6–11 miesięcy'
      };
    }
    if (years < 19) {
      return {
        kind: 'child_1_18',
        completedYears: Math.max(1, Math.min(18, years)),
        label: '1–18 lat'
      };
    }
    return { kind: 'adult_19_plus', completedYears: years, label: '≥19 lat' };
  }

  function nutritionNormsGetAllowedPAL(ageYears, ageMonthsOpt) {
    if (typeof window.energyGetAllowedPals === 'function') {
      return Array.from(window.energyGetAllowedPals(ageYears, ageMonthsOpt, 'normative'));
    }
    return [];
  }

  function nutritionNormsResolvePAL(ageYears, ageMonthsOpt, palInput) {
    if (typeof window.energyResolvePalSelection !== 'function') {
      return { mode: 'none', pals: [], usedPal: null, note: '' };
    }
    const resolved = window.energyResolvePalSelection({
      ageYears,
      ageMonthsOpt,
      palInput,
      palPolicy: 'normative',
      allowRange: true
    });
    const pals = resolved.mode === 'range'
      ? Array.from(resolved.allowed || [])
      : (isFiniteNumber(resolved.used) ? [resolved.used] : []);
    return {
      mode: resolved.mode || 'none',
      pals,
      usedPal: isFiniteNumber(resolved.used) ? resolved.used : null,
      note: resolved.note || ''
    };
  }

  function nutritionNormsProteinTargets(sex, ageYears, ageMonthsOpt) {
    const band = nutritionNormsGetAgeBand(ageYears, ageMonthsOpt);

    if (band.kind === 'infant_0_6') {
      return {
        ear_g_per_kg: null,
        rda_g_per_kg: null,
        referenceWeightKg: null,
        basisLabel: 'brak liczbowej normy',
        available: false
      };
    }

    const sharedReference = nutritionNormsGetSharedReferenceEntry(sex, ageYears, ageMonthsOpt);
    const row = sharedReference && sharedReference.row ? sharedReference.row : null;

    if (band.kind === 'infant_6_11') {
      return row ? {
        ear_g_per_kg: row.ear,
        rda_g_per_kg: row.rda,
        referenceWeightKg: row.weightKg,
        basisLabel: `tabela referencyjna ${band.infantMonth}. miesiąca`,
        available: true
      } : {
        ear_g_per_kg: null,
        rda_g_per_kg: null,
        referenceWeightKg: null,
        basisLabel: '',
        available: false
      };
    }

    if (band.kind === 'child_1_18') {
      return row ? {
        ear_g_per_kg: row.ear,
        rda_g_per_kg: row.rda,
        referenceWeightKg: row.weightKg,
        basisLabel: `wartości typowe dla wieku ${band.completedYears === 1 ? '1 roku' : band.completedYears + ' lat'} i tej płci`,
        available: true
      } : {
        ear_g_per_kg: null,
        rda_g_per_kg: null,
        referenceWeightKg: null,
        basisLabel: '',
        available: false
      };
    }

    return {
      ear_g_per_kg: 0.66,
      rda_g_per_kg: 0.83,
      referenceWeightKg: null,
      basisLabel: 'dorosły',
      available: true
    };
  }

  function nutritionNormsMacroRI(ageYears, ageMonthsOpt) {
    const band = nutritionNormsGetAgeBand(ageYears, ageMonthsOpt);
    if (band.kind === 'infant_0_6') {
      return {
        fat_percent_range: null,
        carb_percent_range: null,
        quality: null,
        available: false
      };
    }

    if (band.kind === 'infant_6_11') {
      return {
        fat_percent_range: [30, 45],
        carb_percent_range: [45, 55],
        quality: {
          sfaText: 'Nasycone kwasy tłuszczowe: tak mało, jak to możliwe.',
          laPercent: 4,
          alaPercent: 0.5,
          omega3Text: 'DHA: minimum 100 mg/d.'
        },
        available: true
      };
    }

    if (band.kind === 'child_1_18') {
      const fatRange = band.completedYears <= 3 ? [35, 40] : [30, 40];
      const omega3Text = band.completedYears === 1
        ? 'DHA: minimum 100 mg/d.'
        : 'EPA + DHA: 250 mg/d.';
      return {
        fat_percent_range: fatRange,
        carb_percent_range: [45, 65],
        quality: {
          sfaText: 'Nasycone kwasy tłuszczowe: tak mało, jak to możliwe.',
          laPercent: 4,
          alaPercent: 0.5,
          omega3Text
        },
        available: true
      };
    }

    return {
      fat_percent_range: [30, 40],
      carb_percent_range: [45, 65],
      quality: {
        sfaText: 'Nasycone kwasy tłuszczowe: tak mało, jak to możliwe.',
        laPercent: 4,
        alaPercent: 0.5,
        omega3Text: 'EPA + DHA: 250 mg/d.',
        optionalLowActivityFatRange: [20, 30]
      },
      available: true
    };
  }

  function nutritionNormsPercentEnergyToGrams(energyKcal, percent, kcalPerGram) {
    const energy = Number(energyKcal);
    const pct = Number(percent);
    const kcal = Number(kcalPerGram);
    if (!(isFiniteNumber(energy) && energy > 0 && isFiniteNumber(pct) && pct >= 0 && isFiniteNumber(kcal) && kcal > 0)) {
      return null;
    }
    return (energy * (pct / 100)) / kcal;
  }

  function nutritionNormsRangePercentToGramRange(energyKcal, range, kcalPerGram) {
    if (!Array.isArray(range) || range.length !== 2) return null;
    const min = nutritionNormsPercentEnergyToGrams(energyKcal, range[0], kcalPerGram);
    const max = nutritionNormsPercentEnergyToGrams(energyKcal, range[1], kcalPerGram);
    return (isFiniteNumber(min) && isFiniteNumber(max)) ? [min, max] : null;
  }

  function nutritionNormsResolveMainPalValue() {
    const input = el('palFactor');
    return input ? toNumber(input.value) : NaN;
  }

  function nutritionNormsGetDefaultPalSelector(allowedPals) {
    const pals = Array.isArray(allowedPals) ? allowedPals.filter((value) => isFiniteNumber(value)) : [];
    if (!pals.length) return 'none';
    if (pals.includes(1.6)) return '1.6';
    return String(pals[0]);
  }

  function nutritionNormsGetUiState() {
    const current = window.nutritionNormsUiState || {};
    const next = {
      palSelector: current.palSelector || NUTRITION_NORMS_DEFAULT_STATE.palSelector,
      bodyMode: current.bodyMode || NUTRITION_NORMS_DEFAULT_STATE.bodyMode,
      includeInSummary: !!current.includeInSummary
    };
    window.nutritionNormsUiState = next;
    return next;
  }

  function nutritionNormsSetUiState(partial) {
    const next = {
      ...nutritionNormsGetUiState(),
      ...(partial || {})
    };
    window.nutritionNormsUiState = next;
    return next;
  }

  function nutritionNormsBuildBasicsSignature(basics) {
    if (!basics || typeof basics !== 'object') return '';
    const ageYears = isFiniteNumber(basics.ageYears) ? Number(basics.ageYears).toFixed(4) : '';
    const ageMonthsOpt = isFiniteNumber(basics.ageMonthsOpt) ? Number(basics.ageMonthsOpt).toFixed(0) : '';
    const sex = normalizeSex(basics.sex);
    const weightKg = isFiniteNumber(basics.weightKg) ? Number(basics.weightKg).toFixed(3) : '';
    const heightCm = isFiniteNumber(basics.heightCm) ? Number(basics.heightCm).toFixed(3) : '';
    return [ageYears, ageMonthsOpt, sex, weightKg, heightCm].join('|');
  }

  function nutritionNormsMaybeResetBodyModeForBasicsChange(basics) {
    const signature = nutritionNormsBuildBasicsSignature(basics);
    const previousSignature = window.nutritionNormsLastBasicsSignature || '';
    window.nutritionNormsLastBasicsSignature = signature;
    if (!signature || !previousSignature || signature === previousSignature) return false;
    const currentState = nutritionNormsGetUiState();
    if (currentState.bodyMode === 'actual') return false;
    nutritionNormsSetUiState({ bodyMode: 'actual' });
    return true;
  }

  function nutritionNormsResetBodyModeToActual(options) {
    const opts = options && typeof options === 'object' ? options : {};
    const currentState = nutritionNormsGetUiState();
    const nextState = { bodyMode: 'actual' };
    if (typeof opts.includeInSummary === 'boolean') nextState.includeInSummary = opts.includeInSummary;
    if (opts.force !== true && currentState.bodyMode === 'actual') return currentState;
    return nutritionNormsSetUiState(nextState);
  }

  function nutritionNormsNormalizeUiState(basics, uiOptions) {
    const band = nutritionNormsGetAgeBand(basics.ageYears, basics.ageMonthsOpt);
    const allowedPals = nutritionNormsGetAllowedPAL(basics.ageYears, basics.ageMonthsOpt);
    const inputState = {
      ...nutritionNormsGetUiState(),
      ...(uiOptions || {})
    };
    const normalized = {
      palSelector: inputState.palSelector || NUTRITION_NORMS_DEFAULT_STATE.palSelector,
      bodyMode: inputState.bodyMode || 'actual',
      includeInSummary: !!inputState.includeInSummary
    };

    if (band.kind === 'infant_0_6' || band.kind === 'infant_6_11') {
      normalized.bodyMode = 'actual';
      normalized.palSelector = 'none';
      return normalized;
    }

    if (normalized.bodyMode !== 'reference' && normalized.bodyMode !== 'actual') {
      normalized.bodyMode = 'actual';
    }

    if (normalized.palSelector === 'inherit') {
      normalized.palSelector = nutritionNormsGetDefaultPalSelector(allowedPals);
    }

    if (normalized.palSelector === 'range' && allowedPals.length <= 1) {
      normalized.palSelector = nutritionNormsGetDefaultPalSelector(allowedPals);
    }

    if (
      normalized.palSelector !== 'range' &&
      normalized.palSelector !== 'none' &&
      !allowedPals.includes(Number(normalized.palSelector))
    ) {
      normalized.palSelector = nutritionNormsGetDefaultPalSelector(allowedPals);
    }

    if (normalized.palSelector === 'none' && allowedPals.length) {
      normalized.palSelector = nutritionNormsGetDefaultPalSelector(allowedPals);
    }

    return normalized;
  }

  function nutritionNormsResolvePalSelectorValue(state, basics) {
    if (!state || state.palSelector === 'none') return { input: null, inherited: false };
    if (state.palSelector === 'inherit') {
      return { input: basics.mainPal, inherited: true };
    }
    if (state.palSelector === 'range') {
      return { input: 'range', inherited: false };
    }
    return { input: Number(state.palSelector), inherited: false };
  }

  function nutritionNormsBuildPalOptions(basics, state) {
    const allowed = nutritionNormsGetAllowedPAL(basics.ageYears, basics.ageMonthsOpt);
    if (!allowed.length) return [];
    const options = [];
    if (allowed.length > 1) {
      options.push({ value: 'range', label: 'Pełen zakres aktywności' });
    }
    allowed.forEach((pal) => {
      const sharedLabel = typeof window.energyGetPalOptionLabel === 'function'
        ? window.energyGetPalOptionLabel(pal)
        : '';
      options.push({ value: String(pal), label: sharedLabel || `PAL ${formatPal(pal)}` });
    });
    return options.map((opt) => ({ ...opt, selected: String(opt.value) === String(state.palSelector) }));
  }

  function nutritionNormsProjectEnergyContext(ctx) {
    const anthropometry = ctx && ctx.anthropometry ? ctx.anthropometry : {};
    const stage = ctx && ctx.age ? ctx.age.stage : null;
    const formulaId = ctx && ctx.energy ? ctx.energy.formulaId : '';
    const formulaLabel = String(formulaId || '').indexOf('butte') === 0
      ? 'Butte'
      : (formulaId ? 'Henry' : null);

    if (stage === 'infant_0_5') {
      return {
        available: false,
        mode: 'info',
        stage,
        reeKcal: null,
        items: [],
        range: null,
        weightUsedKg: anthropometry.weightUsedKg,
        heightUsedCm: anthropometry.heightUsedCm,
        formulaLabel: null,
        growthMultiplier: null,
        infoText: 'W wieku poniżej 6 miesięcy normy nie podają liczbowych zaleceń energii i makroskładników.',
        context: ctx || null
      };
    }

    if (ctx && ctx.energy && Array.isArray(ctx.energy.teeRangeKcal) && ctx.energy.teeRangeKcal.length) {
      const items = ctx.energy.teeRangeKcal
        .map((item) => ({ pal: item.pal, teeKcal: item.kcal }))
        .filter((item) => isFiniteNumber(item.teeKcal));
      if (items.length) {
        const kcalValues = items.map((item) => item.teeKcal);
        return {
          available: true,
          mode: 'range',
          stage,
          reeKcal: ctx.energy.reeKcal,
          items,
          range: [Math.min.apply(null, kcalValues), Math.max.apply(null, kcalValues)],
          weightUsedKg: anthropometry.weightUsedKg,
          heightUsedCm: anthropometry.heightUsedCm,
          formulaLabel,
          growthMultiplier: ctx.energy.growthMultiplier,
          context: ctx
        };
      }
    }

    const singleEnergy = ctx && ctx.energy && isFiniteNumber(ctx.energy.teeAdjustedKcal)
      ? ctx.energy.teeAdjustedKcal
      : (ctx && ctx.energy ? ctx.energy.teeRawKcal : null);
    if (isFiniteNumber(singleEnergy)) {
      const fixedPal = ctx && ctx.pal && isFiniteNumber(ctx.pal.used) ? ctx.pal.used : null;
      return {
        available: true,
        mode: (stage === 'infant_6_11' || !isFiniteNumber(fixedPal)) ? 'single' : 'fixed',
        stage,
        reeKcal: ctx && ctx.energy ? ctx.energy.reeKcal : null,
        items: [{ pal: fixedPal, teeKcal: singleEnergy }],
        range: [singleEnergy, singleEnergy],
        weightUsedKg: anthropometry.weightUsedKg,
        heightUsedCm: anthropometry.heightUsedCm,
        formulaLabel,
        growthMultiplier: ctx && ctx.energy ? ctx.energy.growthMultiplier : null,
        infoText: stage === 'infant_6_11' ? 'TEE wg Butte dla niemowląt 6–11 miesięcy.' : '',
        context: ctx
      };
    }

    const defaultInfo = stage === 'infant_6_11'
      ? 'Aby wyliczyć energię dla niemowlęcia 6–11 miesięcy, potrzebna jest masa ciała.'
      : 'Aby przeliczyć energię, potrzebne są masa i wzrost.';
    return {
      available: false,
      mode: 'unavailable',
      stage,
      reeKcal: ctx && ctx.energy ? ctx.energy.reeKcal : null,
      items: [],
      range: null,
      weightUsedKg: anthropometry.weightUsedKg,
      heightUsedCm: anthropometry.heightUsedCm,
      formulaLabel,
      growthMultiplier: ctx && ctx.energy ? ctx.energy.growthMultiplier : null,
      infoText: ctx && Array.isArray(ctx.notes) && ctx.notes.length
        ? ctx.notes[ctx.notes.length - 1]
        : defaultInfo,
      context: ctx || null
    };
  }

  function nutritionNormsEstimateEnergy(input) {
    if (typeof window.energyBuildContext !== 'function') {
      return nutritionNormsProjectEnergyContext(null);
    }
    const ctx = window.energyBuildContext({
      preset: input && input.preset ? input.preset : 'nutrition_actual',
      ageYears: input ? input.ageYears : null,
      ageMonthsOpt: input ? input.ageMonthsOpt : 0,
      sex: input ? input.sex : null,
      weightKg: input ? input.weightKg : null,
      heightCm: input ? input.heightCm : null,
      palInput: input ? input.palInput : null,
      bodyOverride: input ? input.bodyOverride : null,
      allowRangeOverride: input && typeof input.allowRange === 'boolean' ? input.allowRange : true
    });
    return nutritionNormsProjectEnergyContext(ctx);
  }

  function nutritionNormsComputeProteinValues(targets, weightKg) {
    const weight = Number(weightKg);
    if (!targets || !targets.available || !isFiniteNumber(weight) || weight <= 0) {
      return null;
    }
    return {
      basisWeightKg: weight,
      earGDay: targets.ear_g_per_kg * weight,
      rdaGDay: targets.rda_g_per_kg * weight,
      earGPerKg: targets.ear_g_per_kg,
      rdaGPerKg: targets.rda_g_per_kg
    };
  }

  function nutritionNormsComputeMacroGramRange(energyModel, percentRange, kcalPerGram) {
    if (!energyModel || !energyModel.available || !Array.isArray(energyModel.items) || !energyModel.items.length) return null;
    let min = Infinity;
    let max = -Infinity;
    energyModel.items.forEach((item) => {
      const range = nutritionNormsRangePercentToGramRange(item.teeKcal, percentRange, kcalPerGram);
      if (range) {
        min = Math.min(min, range[0]);
        max = Math.max(max, range[1]);
      }
    });
    return (isFiniteNumber(min) && isFiniteNumber(max)) ? [min, max] : null;
  }

  function nutritionNormsComparisonShouldShow(mainValue, comparisonValue, minAbsoluteDiff) {
    const threshold = Number.isFinite(minAbsoluteDiff) ? minAbsoluteDiff : 1;
    return isFiniteNumber(mainValue) && isFiniteNumber(comparisonValue) && Math.abs(mainValue - comparisonValue) >= threshold;
  }

  function nutritionNormsBuildMessages(ageBand, state, palResolution, mainEnergy, basics) {
    const messages = [];
    if (ageBand.kind === 'infant_0_6') {
      messages.push({ tone: 'info', text: 'Dla wieku poniżej 6 miesięcy normy nie podają liczbowej energii i makroskładników; standardem pozostaje mleko kobiece.' });
      return messages;
    }
    if (palResolution && palResolution.note) {
      messages.push({ tone: 'warn', text: palResolution.note });
    }
    if (state.bodyMode === 'reference') {
      if (ageBand.kind === 'adult_19_plus') {
        messages.push({ tone: 'info', text: 'Tryb referencyjny u dorosłych korzysta z masy należnej przy BMI 22.' });
      } else if (ageBand.kind === 'child_1_18') {
        messages.push({ tone: 'info', text: 'W trybie referencyjnym u dzieci używane są typowe dla wieku i płci wartości masy ciała i wzrostu.', centered: true });
      }
    } else if (ageBand.kind === 'adult_19_plus') {
      messages.push({ tone: 'info', text: 'Tryb aktualny przelicza normy dla obecnej masy ciała.' });
    }
    if (mainEnergy && mainEnergy.available && basics.mainPal === 1.2) {
      messages.push({ tone: 'info', text: 'W nowej karcie używane są wyłącznie normatywne poziomy PAL z Norm PL 2024 (1,4–2,0 u dorosłych).' });
    }
    return messages;
  }

  function nutritionNormsBuildInputSummary(basics) {
    const parts = [];
    parts.push(`Wiek: ${buildAgeLabel(basics.ageYears, basics.ageMonthsOpt)}`);
    parts.push(`Płeć: ${normalizeSex(basics.sex) === 'F' ? 'kobieta' : 'mężczyzna'}`);
    if (isFiniteNumber(basics.weightKg)) parts.push(`Masa: ${formatKg(basics.weightKg, 1)}`);
    if (isFiniteNumber(basics.heightCm)) parts.push(`Wzrost: ${formatNumber(basics.heightCm, 1)} cm`);
    return parts.join(' • ');
  }

  function nutritionNormsBuildCardModel(basics, uiOptions) {
    const ageBand = nutritionNormsGetAgeBand(basics.ageYears, basics.ageMonthsOpt);
    const sexKey = normalizeSex(basics.sex);
    const state = nutritionNormsNormalizeUiState(basics, uiOptions);
    const palSource = nutritionNormsResolvePalSelectorValue(state, basics);
    const palResolution = nutritionNormsResolvePAL(basics.ageYears, basics.ageMonthsOpt, palSource.input);
    const mainPreset = state.bodyMode === 'reference' ? 'nutrition_reference' : 'nutrition_actual';
    const comparisonPreset = state.bodyMode === 'reference' ? 'nutrition_actual' : 'nutrition_reference';

    const energyMain = nutritionNormsEstimateEnergy({
      preset: mainPreset,
      ageYears: basics.ageYears,
      ageMonthsOpt: basics.ageMonthsOpt,
      sex: sexKey,
      weightKg: basics.weightKg,
      heightCm: basics.heightCm,
      palInput: palSource.input,
      allowRange: true
    });
    const mainCtx = energyMain && energyMain.context ? energyMain.context : null;
    const mainAnthro = {
      weightKg: mainCtx && mainCtx.anthropometry ? mainCtx.anthropometry.weightUsedKg : (isFiniteNumber(basics.weightKg) ? basics.weightKg : null),
      heightCm: mainCtx && mainCtx.anthropometry ? mainCtx.anthropometry.heightUsedCm : (isFiniteNumber(basics.heightCm) ? basics.heightCm : null),
      method: mainCtx && mainCtx.anthropometry ? mainCtx.anthropometry.source : (state.bodyMode === 'reference' ? 'none' : 'actual'),
      label: mainCtx && mainCtx.anthropometry && mainCtx.anthropometry.label
        ? mainCtx.anthropometry.label
        : (state.bodyMode === 'reference' ? '' : 'masa aktualna')
    };

    const energyComparison = (ageBand.kind !== 'infant_0_6' && palResolution.mode === 'fixed')
      ? nutritionNormsEstimateEnergy({
          preset: comparisonPreset,
          ageYears: basics.ageYears,
          ageMonthsOpt: basics.ageMonthsOpt,
          sex: sexKey,
          weightKg: basics.weightKg,
          heightCm: basics.heightCm,
          palInput: palSource.input,
          allowRange: false
        })
      : null;
    const comparisonCtx = energyComparison && energyComparison.context ? energyComparison.context : null;
    const comparisonAnthro = comparisonCtx && comparisonCtx.anthropometry ? {
      weightKg: comparisonCtx.anthropometry.weightUsedKg,
      heightCm: comparisonCtx.anthropometry.heightUsedCm,
      method: comparisonCtx.anthropometry.source,
      label: comparisonCtx.anthropometry.label || ''
    } : null;

    const proteinTargets = nutritionNormsProteinTargets(sexKey, basics.ageYears, basics.ageMonthsOpt);
    const proteinMain = nutritionNormsComputeProteinValues(proteinTargets, mainAnthro.weightKg);
    const proteinComparison = nutritionNormsComputeProteinValues(proteinTargets, comparisonAnthro && comparisonAnthro.weightKg);

    const macroRI = nutritionNormsMacroRI(basics.ageYears, basics.ageMonthsOpt);
    const fatGramRange = macroRI.available ? nutritionNormsComputeMacroGramRange(energyMain, macroRI.fat_percent_range, KCAL_PER_GRAM.fat) : null;
    const carbGramRange = macroRI.available ? nutritionNormsComputeMacroGramRange(energyMain, macroRI.carb_percent_range, KCAL_PER_GRAM.carbs) : null;
    const laGramRange = macroRI.available && macroRI.quality ? nutritionNormsComputeMacroGramRange(energyMain, [macroRI.quality.laPercent, macroRI.quality.laPercent], KCAL_PER_GRAM.fat) : null;
    const alaGramRange = macroRI.available && macroRI.quality ? nutritionNormsComputeMacroGramRange(energyMain, [macroRI.quality.alaPercent, macroRI.quality.alaPercent], KCAL_PER_GRAM.fat) : null;

    const comparisonEnergyValue = energyComparison && energyComparison.available && energyComparison.range
      ? energyComparison.range[energyComparison.range[0] === energyComparison.range[1] ? 0 : 1]
      : null;
    const mainEnergyValue = energyMain && energyMain.available && energyMain.range
      ? energyMain.range[energyMain.range[0] === energyMain.range[1] ? 0 : 1]
      : null;
    const comparisonProteinValue = proteinComparison ? proteinComparison.rdaGDay : null;
    const mainProteinValue = proteinMain ? proteinMain.rdaGDay : null;

    const qualityNote = macroRI && macroRI.quality ? {
      sfaText: macroRI.quality.sfaText,
      laGramRange,
      alaGramRange,
      omega3Text: macroRI.quality.omega3Text,
      optionalLowActivityFatRange: macroRI.quality.optionalLowActivityFatRange || null
    } : null;

    const lowActivityAdultNote = ageBand.kind === 'adult_19_plus'
      && qualityNote
      && Array.isArray(qualityNote.optionalLowActivityFatRange)
      && ((palResolution.mode === 'fixed' && palResolution.usedPal === 1.4) || (palResolution.mode === 'range' && palResolution.pals.includes(1.4)))
        ? `Przy małej aktywności fizycznej tłuszcz może również mieścić się w zakresie ${formatPercentRange(qualityNote.optionalLowActivityFatRange)}.`
        : '';

    const messages = nutritionNormsBuildMessages(ageBand, state, palResolution, energyMain, basics);
    if (!proteinMain && proteinTargets.available && state.bodyMode === 'actual') {
      messages.push({ tone: 'info', text: 'Aby przeliczyć białko na g/d w trybie aktualnym, potrzebna jest masa ciała.' });
    }
    if (!energyMain.available && ageBand.kind !== 'infant_0_6') {
      messages.push({ tone: 'info', text: energyMain.infoText || 'Do wyliczenia energii potrzebne są wymagane dane antropometryczne.' });
    }

    const proMode = !!(window && window.professionalMode);

    return {
      ageBand,
      ui: {
        state,
        showBodyMode: ageBand.kind === 'child_1_18' || ageBand.kind === 'adult_19_plus',
        showPalControl: ageBand.kind === 'child_1_18' || ageBand.kind === 'adult_19_plus',
        showSummaryToggle: true,
        palOptions: nutritionNormsBuildPalOptions(basics, state),
        palMode: palResolution.mode,
        usedPal: palResolution.usedPal,
        proMode
      },
      inputSummary: nutritionNormsBuildInputSummary(basics),
      energy: {
        ...energyMain,
        comparisonLabel: comparisonAnthro && comparisonAnthro.label,
        comparisonValue: comparisonEnergyValue,
        showComparison: nutritionNormsComparisonShouldShow(mainEnergyValue, comparisonEnergyValue, 25),
        mainValue: mainEnergyValue,
        palMode: palResolution.mode,
        usedPal: palResolution.usedPal,
        palNote: palSource.inherited ? 'z formularza / planu' : '',
        basisLabel: mainAnthro.label,
        basisWeightKg: mainAnthro.weightKg,
        basisHeightCm: mainAnthro.heightCm
      },
      protein: {
        available: !!proteinMain,
        targets: proteinTargets,
        main: proteinMain,
        comparisonLabel: comparisonAnthro && comparisonAnthro.label,
        comparisonValue: comparisonProteinValue,
        showComparison: nutritionNormsComparisonShouldShow(mainProteinValue, comparisonProteinValue, 1),
        basisLabel: mainAnthro.label,
        basisWeightKg: mainAnthro.weightKg
      },
      fat: {
        percentRange: macroRI.fat_percent_range,
        gramRange: fatGramRange,
        lowActivityNote: lowActivityAdultNote
      },
      carbs: {
        percentRange: macroRI.carb_percent_range,
        gramRange: carbGramRange
      },
      quality: qualityNote,
      messages,
      notes: {
        averageText: 'Normy służą do planowania średniej z kilku dni – nie trzeba trzymać ich co do grama każdego dnia.',
        sourceShort: 'Źródło: Normy żywienia dla populacji Polski (NIZP PZH–PIB, 2024).',
        sourceLong: ''
      }
    };
  }


  function nutritionNormsFormatEnergyValueForSummary(energy) {
    if (!energy || !energy.available) return '';
    const item = Array.isArray(energy.items) && energy.items.length ? energy.items[0] : null;
    if ((energy.mode === 'single' || energy.mode === 'fixed') && item && isFiniteNumber(item.teeKcal)) {
      return `${formatNumber(item.teeKcal, 0)} kcal/d`;
    }
    if (Array.isArray(energy.range) && isFiniteNumber(energy.range[0]) && isFiniteNumber(energy.range[1])) {
      if (Math.abs(energy.range[0] - energy.range[1]) < 0.5) {
        return `${formatNumber(energy.range[0], 0)} kcal/d`;
      }
      return `${formatNumber(energy.range[0], 0)}–${formatNumber(energy.range[1], 0)} kcal/d`;
    }
    return '';
  }

  function nutritionNormsFormatMacroValueForSummary(macroModel) {
    if (!macroModel) return '';
    const valueText = macroModel.gramRange ? formatGramRange(macroModel.gramRange, 0) : '';
    const percentText = formatPercentRange(macroModel.percentRange);
    if (valueText && valueText !== '—' && percentText && percentText !== '—') {
      return `${valueText} (${percentText})`;
    }
    if (valueText && valueText !== '—') return valueText;
    if (percentText && percentText !== '—') return percentText;
    return '';
  }

  function nutritionNormsBuildPalSummaryLabel(model) {
    const energy = model && model.energy;
    const items = energy && Array.isArray(energy.items) ? energy.items : [];
    const pals = items
      .map((item) => item && item.pal)
      .filter((value) => isFiniteNumber(value));
    if (energy && energy.mode === 'fixed' && isFiniteNumber(energy.usedPal)) {
      return `PAL ${formatPal(energy.usedPal)}`;
    }
    if (pals.length > 1) {
      const minPal = Math.min.apply(null, pals);
      const maxPal = Math.max.apply(null, pals);
      if (Math.abs(minPal - maxPal) < 0.01) {
        return `PAL ${formatPal(minPal)}`;
      }
      return `PAL ${formatPal(minPal)}–${formatPal(maxPal)}`;
    }
    return '';
  }

  function nutritionNormsBuildSummaryContextText(model) {
    const parts = [];
    const palLabel = nutritionNormsBuildPalSummaryLabel(model);
    if (palLabel) parts.push(palLabel);
    if (model && model.energy && model.energy.basisLabel) parts.push(model.energy.basisLabel);
    return parts.join('; ');
  }

  function nutritionNormsBuildSummaryLines(model) {
    if (!model) return [];
    if (model.ageBand && model.ageBand.kind === 'infant_0_6') {
      return ['Normy żywieniowe: w wieku poniżej 6 miesięcy normy nie podają liczbowych wartości energii i makroskładników.'];
    }

    const lines = [];
    const firstParts = [];
    const energyText = nutritionNormsFormatEnergyValueForSummary(model.energy);
    if (energyText) firstParts.push(`energia ${energyText}`);

    if (model.protein && model.protein.targets && model.protein.targets.available) {
      if (model.protein.available && model.protein.main) {
        firstParts.push(`białko – zalecane spożycie (RDA) ${formatNumber(model.protein.main.rdaGDay, 0)} g/d; średnie zapotrzebowanie (EAR) ${formatNumber(model.protein.main.earGDay, 0)} g/d`);
      } else {
        firstParts.push(`białko – zalecane spożycie (RDA) ${formatNumber(model.protein.targets.rda_g_per_kg, 2)} g/kg; średnie zapotrzebowanie (EAR) ${formatNumber(model.protein.targets.ear_g_per_kg, 2)} g/kg`);
      }
    }

    if (firstParts.length) {
      lines.push(`Normy żywieniowe: ${firstParts.join('; ')}.`);
    }

    const secondParts = [];
    const fatText = nutritionNormsFormatMacroValueForSummary(model.fat);
    if (fatText) secondParts.push(`tłuszcz ${fatText}`);
    const carbText = nutritionNormsFormatMacroValueForSummary(model.carbs);
    if (carbText) secondParts.push(`węglowodany ${carbText}`);
    const contextText = nutritionNormsBuildSummaryContextText(model);

    if (secondParts.length) {
      let line = secondParts.join('; ');
      if (contextText) line += ` (${contextText})`;
      lines.push(`${line}.`);
    } else if (contextText && lines.length) {
      lines[0] = lines[0].replace(/\.$/, ` (${contextText}).`);
    }

    return lines;
  }

  function nutritionNormsBuildPatientReportComparisonText(model) {
    if (!model) return '';
    const parts = [];
    if (model.energy && model.energy.showComparison && model.energy.comparisonLabel && isFiniteNumber(model.energy.comparisonValue)) {
      parts.push(`Energia dla ${model.energy.comparisonLabel}: ${formatKcal(model.energy.comparisonValue)}.`);
    }
    if (model.protein && model.protein.showComparison && model.protein.comparisonLabel && isFiniteNumber(model.protein.comparisonValue)) {
      parts.push(`Białko – zalecane spożycie (RDA) dla ${model.protein.comparisonLabel}: ${formatNumber(model.protein.comparisonValue, 0)} g/d.`);
    }
    return parts.join(' ');
  }

  function nutritionNormsBuildPatientReportCard(model) {
    if (!model) {
      return {
        layout: 'nutrition',
        title: 'Normy żywieniowe',
        badge: 'Brak danych',
        value: '—',
        subtitle: '',
        note: 'Nie udało się przygotować norm żywieniowych dla tego raportu.',
        rows: [],
        comparisonNote: '',
        sourceNote: ''
      };
    }

    const palLabel = nutritionNormsBuildPalSummaryLabel(model);
    const contextParts = [];
    if (palLabel) contextParts.push(palLabel);
    if (model.energy && model.energy.basisLabel) contextParts.push(model.energy.basisLabel);
    const subtitle = contextParts.join(' • ');

    let badge = 'Informacyjnie';
    if (model.ageBand && model.ageBand.kind === 'infant_0_6') {
      badge = '0–6 mies.';
    } else if (model.ageBand && model.ageBand.kind === 'infant_6_11') {
      badge = '6–11 mies.';
    } else if (model.energy && model.energy.mode === 'fixed' && isFiniteNumber(model.energy.usedPal)) {
      badge = `PAL ${formatPal(model.energy.usedPal)}`;
    } else if (model.energy && model.energy.mode === 'range') {
      badge = 'Zakres PAL';
    }

    if (model.ageBand && model.ageBand.kind === 'infant_0_6') {
      return {
        layout: 'nutrition',
        title: 'Normy żywieniowe',
        badge,
        value: 'brak norm liczbowych',
        subtitle,
        note: 'W pierwszych 6 miesiącach normy nie podają liczbowych wartości energii i makroskładników.',
        rows: [],
        emptyMessage: 'Standardem żywienia pozostaje mleko kobiece.',
        comparisonNote: '',
        sourceNote: model.notes && model.notes.sourceShort ? model.notes.sourceShort : ''
      };
    }

    const rows = [];
    const energyText = nutritionNormsFormatEnergyValueForSummary(model.energy) || '—';
    const energyDetails = [];
    if (model.energy && isFiniteNumber(model.energy.reeKcal)) energyDetails.push(nutritionNormsBuildRestingEnergyText(model.energy.reeKcal));
    if (subtitle) energyDetails.push(subtitle);
    rows.push({
      label: 'Energia',
      value: energyText,
      detail: energyDetails.join(' • ')
    });

    const carbText = nutritionNormsFormatMacroValueForSummary(model.carbs);
    if (carbText) {
      rows.push({
        label: 'Węglowodany',
        value: model.carbs && model.carbs.gramRange ? formatGramRange(model.carbs.gramRange, 0) : carbText,
        detail: model.carbs && model.carbs.percentRange ? formatPercentRange(model.carbs.percentRange) : ''
      });
    }

    if (model.protein && model.protein.targets && model.protein.targets.available) {
      if (model.protein.available && model.protein.main) {
        rows.push({
          label: 'Białko',
          value: `${formatNumber(model.protein.main.rdaGDay, 0)} g/d`,
          detail: `Średnie zapotrzebowanie (EAR): ${formatNumber(model.protein.main.earGDay, 0)} g/d • Zalecane spożycie (RDA): ${formatNumber(model.protein.main.rdaGPerKg, 2)} g/kg`
        });
      } else {
        rows.push({
          label: 'Białko',
          value: `${formatNumber(model.protein.targets.rda_g_per_kg, 2)} g/kg`,
          detail: `Średnie zapotrzebowanie (EAR): ${formatNumber(model.protein.targets.ear_g_per_kg, 2)} g/kg • Zalecane spożycie (RDA): ${formatNumber(model.protein.targets.rda_g_per_kg, 2)} g/kg`
        });
      }
    }

    const fatText = nutritionNormsFormatMacroValueForSummary(model.fat);
    if (fatText) {
      const fatDetailParts = [];
      if (model.fat && model.fat.percentRange) fatDetailParts.push(formatPercentRange(model.fat.percentRange));
      if (model.fat && model.fat.lowActivityNote) fatDetailParts.push(model.fat.lowActivityNote);
      rows.push({
        label: 'Tłuszcze',
        value: model.fat && model.fat.gramRange ? formatGramRange(model.fat.gramRange, 0) : fatText,
        detail: fatDetailParts.join(' • ')
      });
    }

    return {
      layout: 'nutrition',
      title: 'Normy żywieniowe',
      badge,
      value: energyText,
      subtitle,
      note: model.notes ? [model.notes.averageText, model.notes.sourceLong].filter(Boolean).join(' ') : '',
      rows,
      comparisonNote: nutritionNormsBuildPatientReportComparisonText(model),
      sourceNote: model.notes && model.notes.sourceShort ? model.notes.sourceShort : ''
    };
  }

  function nutritionNormsRenderMessage(msg) {
    const tone = msg && msg.tone === 'warn' ? 'warn' : 'info';
    const centeredClass = msg && msg.centered ? ' nutrition-norms-message--centered' : '';
    return `<div class="nutrition-norms-message nutrition-norms-message--${tone}${centeredClass}">${escapeHtml(msg && msg.text)}</div>`;
  }

  function nutritionNormsRenderEnergyBox(model) {
    const energy = model.energy;
    if (model.ageBand.kind === 'infant_0_6') {
      return `
        <div class="result-box nutrition-norms-box">
          <strong>Energia</strong>
          <span class="nutrition-norms-value">brak norm liczbowych</span>
          <p class="nutrition-norms-sub">Normy dla wieku poniżej 6 miesięcy opierają się na podaży z mleka kobiecego.</p>
        </div>`;
    }
    if (!energy.available) {
      return `
        <div class="result-box nutrition-norms-box">
          <strong>Energia</strong>
          <span class="nutrition-norms-value">—</span>
          <p class="nutrition-norms-sub">${escapeHtml(energy.infoText || 'Brak danych do obliczeń energii.')}</p>
        </div>`;
    }

    let header = '';
    if (energy.mode === 'single' || energy.mode === 'fixed') {
      header = formatKcal(energy.items[0] && energy.items[0].teeKcal);
    } else {
      header = formatKcal(energy.range[0]) === formatKcal(energy.range[1])
        ? formatKcal(energy.range[0])
        : `${formatNumber(energy.range[0], 0)}–${formatNumber(energy.range[1], 0)} kcal/d`;
    }

    let sub = '';
    if (energy.mode === 'single') {
      sub = 'Norma dla niemowląt w wieku 6–11 miesięcy.';
    }

    const table = energy.mode === 'range' && energy.items.length > 1
      ? `<table class="nutrition-norms-range-table">
          <thead><tr><th>Poziom aktywności (PAL)</th><th>Całkowity wydatek energetyczny (TEE)</th></tr></thead>
          <tbody>${energy.items.map((item) => {
            const palParts = nutritionNormsGetPalDisplayParts(item.pal);
            const hintHtml = palParts.hint ? `<div class="nutrition-norms-pal-cell-sub">${escapeHtml(palParts.hint)}</div>` : '';
            return `<tr><td><div class="nutrition-norms-pal-cell-main">${escapeHtml(palParts.main)}</div>${hintHtml}</td><td>${formatNumber(item.teeKcal, 0)} kcal/d</td></tr>`;
          }).join('')}</tbody>
        </table>`
      : '';

    return `
      <div class="result-box nutrition-norms-box">
        <strong>Energia</strong>
        <span class="nutrition-norms-value">${header}</span>
        ${sub ? `<p class="nutrition-norms-sub">${escapeHtml(sub)}</p>` : ''}
        ${table}
      </div>`;
  }

  function nutritionNormsRenderProteinBox(model) {
    const protein = model.protein;
    const targets = protein.targets;
    if (!targets || !targets.available) {
      return `
        <div class="result-box nutrition-norms-box">
          <strong>Białko</strong>
          <span class="nutrition-norms-value">brak norm liczbowych</span>
          <p class="nutrition-norms-sub">W wieku poniżej 6 miesięcy nie prezentujemy liczbowej normy białka.</p>
        </div>`;
    }

    if (!protein.available) {
      return `
        <div class="result-box nutrition-norms-box">
          <strong>Białko</strong>
          <span class="nutrition-norms-value">${formatNumber(targets.rda_g_per_kg, 2)} g/kg</span>
          <p class="nutrition-norms-sub">${escapeHtml(nutritionNormsBuildProteinCriteriaText(null, targets))}</p>
          <p class="nutrition-norms-sub">Brakuje masy ciała, aby przeliczyć wartości na g/d.</p>
        </div>`;
    }

    const main = protein.main;
    const proteinEnergyShare = nutritionNormsBuildProteinEnergyShareText(model);
    const proteinShareLine = proteinEnergyShare ? `<p class="nutrition-norms-sub nutrition-norms-sub--macro-share">${escapeHtml(proteinEnergyShare)}</p>` : '';
    return `
      <div class="result-box nutrition-norms-box">
        <strong>Białko</strong>
        <span class="nutrition-norms-value">${formatNumber(main.rdaGDay, 0)} g/d</span>
        ${proteinShareLine}
        ${nutritionNormsRenderPracticeInline(model, 'protein')}
      </div>`;
  }

  function nutritionNormsRenderMacroBox(title, macroModel, model, practiceType) {
    const valueText = macroModel.gramRange ? formatGramRange(macroModel.gramRange, 0) : formatPercentRange(macroModel.percentRange);
    const sub = formatPercentRange(macroModel.percentRange);
    return `
      <div class="result-box nutrition-norms-box">
        <strong>${escapeHtml(title)}</strong>
        <span class="nutrition-norms-value">${valueText}</span>
        <p class="nutrition-norms-sub nutrition-norms-sub--macro-share">${sub}</p>
        ${macroModel.lowActivityNote ? `<p class="nutrition-norms-sub">${escapeHtml(macroModel.lowActivityNote)}</p>` : ''}
        ${practiceType ? nutritionNormsRenderPracticeInline(model, practiceType) : ''}
      </div>`;
  }

  function nutritionNormsRenderQualityBox(model) {
    if (!model.quality) return '';

    const saturatedParts = [];
    if (model.quality.sfaText) {
      saturatedParts.push('Nasycone kwasy tłuszczowe warto ograniczać możliwie najbardziej. To mniej korzystna część tłuszczu w diecie.');
    }

    const unsaturatedParts = [];
    if (model.quality.laGramRange || model.quality.alaGramRange || model.quality.omega3Text) {
      unsaturatedParts.push('Kwasy omega-3 i omega-6 należą do tłuszczów nienasyconych, czyli do korzystniejszej części tłuszczu w diecie.');
    }
    if (model.quality.laGramRange) {
      unsaturatedParts.push(`Kwas linolowy (LA, omega-6) to wielonienasycony tłuszcz nienasycony. Docelowo warto, aby dostarczał około 4% całej energii diety — ${formatGramTarget(model.quality.laGramRange, 1)}.`);
    }
    if (model.quality.alaGramRange) {
      unsaturatedParts.push(`Kwas alfa-linolenowy (ALA, omega-3) to wielonienasycony tłuszcz nienasycony. Docelowo warto, aby dostarczał około 0,5% całej energii diety — ${formatGramTarget(model.quality.alaGramRange, 1)}.`);
    }
    if (model.quality.omega3Text) {
      unsaturatedParts.push(nutritionNormsBuildOmega3QualityText(model.quality.omega3Text));
    }

    const groups = [];
    if (saturatedParts.length) {
      groups.push(`
        <div class="nutrition-norms-quality-group">
          <strong>Tłuszcze nasycone</strong>
          ${saturatedParts.map((part) => `<p>${escapeHtml(part)}</p>`).join('')}
          ${nutritionNormsRenderPracticeInline(model, 'satfat')}
        </div>`);
    }
    if (unsaturatedParts.length) {
      groups.push(`
        <div class="nutrition-norms-quality-group">
          <strong>Tłuszcze nienasycone</strong>
          ${unsaturatedParts.map((part) => `<p>${escapeHtml(part)}</p>`).join('')}
        </div>`);
    }
    if (!groups.length) return '';

    return `
      <details class="nutrition-norms-details nutrition-norms-quality-details">
        <summary>Jakość tłuszczu</summary>
        <div class="nutrition-norms-quality-content">${groups.join('')}</div>
      </details>`;
  }

  function nutritionNormsRenderDetails(model) {
    const lines = [];
    if (model.energy && model.energy.available) {
      if (isFiniteNumber(model.energy.basisWeightKg)) lines.push(`Masa użyta do obliczeń energii: ${formatKg(model.energy.basisWeightKg, 1)}.`);
      if (isFiniteNumber(model.energy.basisHeightCm)) lines.push(`Wzrost użyty do obliczeń energii: ${formatNumber(model.energy.basisHeightCm, 1)} cm.`);
      if (model.energy.formulaLabel) {
        const formulaLine = nutritionNormsExplainEnergyFormula(model.energy.formulaLabel);
        if (formulaLine) lines.push(formulaLine);
      }
      if (model.energy.mode === 'fixed' && isFiniteNumber(model.energy.usedPal)) lines.push(`Wybrany poziom aktywności fizycznej (PAL): ${formatPal(model.energy.usedPal)}.`);
      if (model.energy.mode === 'range' && model.energy.items.length > 1) lines.push('Pokazano pełny zakres energii dla wszystkich dopuszczalnych poziomów aktywności fizycznej (PAL).');
      if (isFiniteNumber(model.energy.growthMultiplier) && model.energy.growthMultiplier > 1) lines.push('U dzieci doliczono 1% kosztu wzrastania.');
    }
    if (model.protein && model.protein.targets && model.protein.targets.available) {
      lines.push('Białko pokazujemy jako dwie wartości: średnie zapotrzebowanie (EAR), czyli poziom wystarczający przeciętnie dla około połowy osób w danej grupie, oraz zalecane spożycie (RDA), czyli poziom pokrywający potrzeby prawie wszystkich zdrowych osób. Wynik podajemy zarówno w gramach na kilogram masy ciała, jak i w gramach na dobę.');
    }
    if (model.fat && model.fat.percentRange) {
      lines.push('Przy tłuszczu i węglowodanach pokazujemy zalecany przedział udziału w całej energii diety. Obok przeliczamy ten przedział na gramy na dobę, żeby łatwiej było przełożyć wynik na codzienne posiłki.');
    }
    if (!lines.length) return '';
    return `
      <details class="nutrition-norms-details">
        <summary>Szczegóły obliczeń</summary>
        <ul>${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
      </details>`;
  }

  function nutritionNormsBuildPracticeItemHtml(product, mainText, noteText, chipText, chipTone) {
    const label = product && product.display_name_pl ? product.display_name_pl : 'Produkt';
    const portionLabel = nutritionNormsPracticePortionLabel(product);
    return `
      <div class="nutrition-practice-sheet-item">
        <div class="nutrition-practice-sheet-item-head">
          <strong>${escapeHtml(label)}</strong>
          ${portionLabel ? `<span class="nutrition-practice-sheet-item-portion">${escapeHtml(portionLabel)}</span>` : ''}
        </div>
        ${chipText ? `<div class="nutrition-practice-chip nutrition-practice-chip--${escapeHtml(chipTone || 'medium')}">${escapeHtml(chipText)}</div>` : ''}
        ${mainText ? `<div class="nutrition-practice-sheet-item-main">${escapeHtml(mainText)}</div>` : ''}
        ${noteText ? `<div class="nutrition-practice-sheet-item-note">${escapeHtml(noteText)}</div>` : ''}
      </div>`;
  }

  function nutritionNormsBuildPracticeSheetContent(model, type) {
    const resources = nutritionNormsGetPracticeResources();
    const bottomSheetCopy = resources && resources.copy ? resources.copy.bottom_sheet : null;
    const commonCopy = bottomSheetCopy ? bottomSheetCopy.common : null;
    const chips = resources && resources.copy ? resources.copy.chips : null;
    if (!bottomSheetCopy || !bottomSheetCopy[type]) return null;
    const copy = bottomSheetCopy[type];
    const sections = [];

    if (type === 'protein') {
      const target = model && model.protein && model.protein.main ? model.protein.main.rdaGDay : null;
      const simple = nutritionNormsSelectPracticeProducts(model, 'protein', ['najprostszy', 'na_szybko'], 3, 'simple');
      const meatless = nutritionNormsSelectPracticeProducts(model, 'protein', ['bez_miesa'], 2, 'meatless');
      const simpleHtml = simple.map((product) => {
        const portion = nutritionNormsGetPracticePortion(product);
        const pct = portion ? nutritionNormsPracticePercent(portion.protein_g, target) : null;
        const mainText = pct !== null ? nutritionNormsPracticeTemplate(copy.row_goal_share, { pct }) : '';
        return nutritionNormsBuildPracticeItemHtml(product, mainText, copy.row_good_choice, '', '');
      }).join('');
      if (simpleHtml) {
        sections.push(`<section class="nutrition-practice-sheet-section"><h4>${escapeHtml(copy.section_simple)}</h4><div class="nutrition-practice-sheet-list">${simpleHtml}</div></section>`);
      }
      const meatlessHtml = meatless.map((product) => {
        const portion = nutritionNormsGetPracticePortion(product);
        const pct = portion ? nutritionNormsPracticePercent(portion.protein_g, target) : null;
        const mainText = pct !== null ? nutritionNormsPracticeTemplate(copy.row_goal_share, { pct }) : '';
        return nutritionNormsBuildPracticeItemHtml(product, mainText, copy.row_meatless_note, '', '');
      }).join('');
      if (meatlessHtml) {
        sections.push(`<section class="nutrition-practice-sheet-section"><h4>${escapeHtml(copy.section_meatless)}</h4><div class="nutrition-practice-sheet-list">${meatlessHtml}</div></section>`);
      }
      const mixProducts = nutritionNormsSelectPracticeProducts(model, 'protein', ['najprostszy', 'na_szybko', 'bez_miesa'], 3, 'mix');
      if (mixProducts.length >= 3) {
        const labels = mixProducts.map((product) => product && product.display_name_pl ? product.display_name_pl : '').filter(Boolean);
        if (labels.length >= 3) {
          const mixLine = nutritionNormsPracticeTemplate(copy.mix_example_template, {
            item_1: labels[0],
            item_2: labels[1],
            item_3: labels[2]
          });
          sections.push(`<section class="nutrition-practice-sheet-section"><h4>${escapeHtml(copy.section_mix)}</h4><div class="nutrition-practice-mix">${escapeHtml(copy.mix_example_intro)} <strong>${escapeHtml(mixLine)}</strong></div></section>`);
        }
      }
      return {
        title: copy.title,
        subtitle: nutritionNormsPracticeTemplate(copy.subtitle, { target_g: formatNumber(target, 0) }),
        bodyHtml: sections.join(''),
        footer: commonCopy && commonCopy.disclaimer_examples ? commonCopy.disclaimer_examples : ''
      };
    }

    if (type === 'carbs') {
      const target = nutritionNormsPracticeMidpoint(model && model.carbs ? model.carbs.gramRange : null);
      const base = nutritionNormsSelectPracticeProducts(model, 'carbs', ['porcja_bazowa', 'sniadanie'], 3, 'base');
      const quick = nutritionNormsSelectPracticeProducts(model, 'carbs', ['na_szybko'], 2, 'quick');
      const baseHtml = base.map((product) => {
        const portion = nutritionNormsGetPracticePortion(product);
        const pct = portion ? nutritionNormsPracticePercent(portion.carbs_g, target) : null;
        const mainText = pct !== null ? nutritionNormsPracticeTemplate(copy.row_goal_share, { pct }) : '';
        return nutritionNormsBuildPracticeItemHtml(product, mainText, copy.row_base_note, '', '');
      }).join('');
      if (baseHtml) sections.push(`<section class="nutrition-practice-sheet-section"><h4>${escapeHtml(copy.section_base)}</h4><div class="nutrition-practice-sheet-list">${baseHtml}</div></section>`);
      const quickHtml = quick.map((product) => {
        const portion = nutritionNormsGetPracticePortion(product);
        const pct = portion ? nutritionNormsPracticePercent(portion.carbs_g, target) : null;
        const mainText = pct !== null ? nutritionNormsPracticeTemplate(copy.row_goal_share, { pct }) : '';
        return nutritionNormsBuildPracticeItemHtml(product, mainText, copy.row_quick_note, '', '');
      }).join('');
      if (quickHtml) sections.push(`<section class="nutrition-practice-sheet-section"><h4>${escapeHtml(copy.section_quick)}</h4><div class="nutrition-practice-sheet-list">${quickHtml}</div></section>`);
      return {
        title: copy.title,
        subtitle: nutritionNormsPracticeTemplate(copy.subtitle, { target_g: formatNumber(target, 0) }),
        bodyHtml: sections.join(''),
        footer: copy.footer || ''
      };
    }

    if (type === 'fat') {
      const targetMid = nutritionNormsPracticeMidpoint(model && model.fat ? model.fat.gramRange : null);
      const targetMin = model && model.fat && Array.isArray(model.fat.gramRange) ? model.fat.gramRange[0] : null;
      const targetMax = model && model.fat && Array.isArray(model.fat.gramRange) ? model.fat.gramRange[1] : null;
      const better = nutritionNormsSelectPracticeProducts(model, 'fat', ['lepsze_zrodlo'], 3, 'better');
      const watch = nutritionNormsSelectPracticeProducts(model, 'fat', ['uwazaj_na'], 2, 'watch');
      const betterHtml = better.map((product) => {
        const portion = nutritionNormsGetPracticePortion(product);
        const pct = portion ? nutritionNormsPracticePercent(portion.fat_g, targetMid) : null;
        const mainText = pct !== null ? nutritionNormsPracticeTemplate(copy.row_range_share, { pct }) : '';
        return nutritionNormsBuildPracticeItemHtml(product, mainText, copy.row_better_note, '', '');
      }).join('');
      if (betterHtml) sections.push(`<section class="nutrition-practice-sheet-section"><h4>${escapeHtml(copy.section_better)}</h4><div class="nutrition-practice-sheet-list">${betterHtml}</div></section>`);
      const watchHtml = watch.map((product) => {
        const portion = nutritionNormsGetPracticePortion(product);
        const pct = portion ? nutritionNormsPracticePercent(portion.fat_g, targetMid) : null;
        const mainText = pct !== null ? nutritionNormsPracticeTemplate(copy.row_range_share, { pct }) : '';
        return nutritionNormsBuildPracticeItemHtml(product, mainText, copy.row_watch_note, '', '');
      }).join('');
      if (watchHtml) sections.push(`<section class="nutrition-practice-sheet-section"><h4>${escapeHtml(copy.section_watch)}</h4><div class="nutrition-practice-sheet-list">${watchHtml}</div></section>`);
      return {
        title: copy.title,
        subtitle: nutritionNormsPracticeTemplate(copy.subtitle, {
          target_min_g: formatNumber(targetMin, 0),
          target_max_g: formatNumber(targetMax, 0)
        }),
        bodyHtml: sections.join(''),
        footer: copy.footer || ''
      };
    }

    if (type === 'satfat') {
      const products = nutritionNormsSelectPracticeProducts(model, 'satfat', ['warning'], 5, 'warning');
      const satfatCap = resources && resources.dictionary && resources.dictionary.reference_caps
        ? Number(resources.dictionary.reference_caps.saturated_fat_g) || 20
        : 20;
      const warningHtml = products.map((product) => {
        const portion = nutritionNormsGetPracticePortion(product);
        const pct = portion ? nutritionNormsPracticePercent(portion.saturated_fat_g, satfatCap) : null;
        const level = nutritionNormsPracticeWarningLevel(pct);
        const chipText = chips && chips[level] ? chips[level] : (level === 'high' ? 'wysoka ilość' : level === 'low' ? 'niska ilość' : 'średnia ilość');
        const noteText = level === 'high' ? copy.row_high : level === 'low' ? copy.row_low : copy.row_medium;
        const mainText = pct !== null ? nutritionNormsPracticeTemplate(copy.row_portion_share, { pct }) : '';
        return nutritionNormsBuildPracticeItemHtml(product, mainText, noteText, chipText, level);
      }).join('');
      if (warningHtml) sections.push(`<section class="nutrition-practice-sheet-section"><h4>${escapeHtml(copy.section_warning)}</h4><div class="nutrition-practice-sheet-list">${warningHtml}</div></section>`);
      return {
        title: copy.title,
        subtitle: copy.subtitle,
        bodyHtml: sections.join(''),
        footer: copy.footer || (commonCopy && commonCopy.disclaimer_warning ? commonCopy.disclaimer_warning : '')
      };
    }

    return null;
  }

  function nutritionNormsGetPracticeViewportHeight() {
    const vv = window.visualViewport;
    const vvHeight = vv && Number.isFinite(Number(vv.height)) ? Number(vv.height) : null;
    if (vvHeight && vvHeight > 0) return vvHeight;
    const inner = Number.isFinite(Number(window.innerHeight)) ? Number(window.innerHeight) : null;
    if (inner && inner > 0) return inner;
    return null;
  }

  function nutritionNormsSyncPracticeSheetViewport() {
    const root = el('nutritionPracticeSheet');
    if (!root) return;
    const viewportHeight = nutritionNormsGetPracticeViewportHeight();
    if (!viewportHeight) {
      root.style.removeProperty('--nutrition-practice-sheet-vh');
      return;
    }
    root.style.setProperty('--nutrition-practice-sheet-vh', `${Math.round(viewportHeight)}px`);
  }

  function nutritionNormsEnsurePracticeSheet() {
    let root = el('nutritionPracticeSheet');
    if (root) return root;
    root = document.createElement('div');
    root.id = 'nutritionPracticeSheet';
    root.className = 'nutrition-practice-sheet';
    root.hidden = true;
    root.innerHTML = `
      <div class="nutrition-practice-sheet-backdrop" data-practice-sheet-close></div>
      <div class="nutrition-practice-sheet-panel" role="dialog" aria-modal="true" aria-labelledby="nutritionPracticeSheetTitle">
        <div class="nutrition-practice-sheet-handle"></div>
        <div class="nutrition-practice-sheet-header">
          <div class="nutrition-practice-sheet-header-copy">
            <h3 id="nutritionPracticeSheetTitle"></h3>
            <p id="nutritionPracticeSheetSubtitle"></p>
          </div>
          <button type="button" class="nutrition-practice-sheet-close" data-practice-sheet-close aria-label="Zamknij">✕</button>
        </div>
        <div id="nutritionPracticeSheetBody" class="nutrition-practice-sheet-body"></div>
        <div id="nutritionPracticeSheetFooter" class="nutrition-practice-sheet-footer"></div>
      </div>`;
    document.body.appendChild(root);
    root.addEventListener('click', (event) => {
      if (event.target && event.target.hasAttribute('data-practice-sheet-close')) {
        nutritionNormsClosePracticeSheet();
      }
    });
    nutritionNormsSyncPracticeSheetViewport();
    if (!root.dataset.viewportSyncBound) {
      const syncViewport = () => nutritionNormsSyncPracticeSheetViewport();
      window.addEventListener('resize', syncViewport, { passive: true });
      window.addEventListener('orientationchange', syncViewport, { passive: true });
      if (window.visualViewport && typeof window.visualViewport.addEventListener === 'function') {
        window.visualViewport.addEventListener('resize', syncViewport, { passive: true });
        window.visualViewport.addEventListener('scroll', syncViewport, { passive: true });
      }
      root.dataset.viewportSyncBound = '1';
    }
    return root;
  }

  function nutritionNormsOpenPracticeSheet(type) {
    const model = window.nutritionNormsLastModel;
    const sheetModel = nutritionNormsBuildPracticeSheetContent(model, type);
    if (!sheetModel) return;
    const root = nutritionNormsEnsurePracticeSheet();
    const titleEl = document.getElementById('nutritionPracticeSheetTitle');
    const subtitleEl = document.getElementById('nutritionPracticeSheetSubtitle');
    const bodyEl = document.getElementById('nutritionPracticeSheetBody');
    const footerEl = document.getElementById('nutritionPracticeSheetFooter');
    if (titleEl) titleEl.textContent = sheetModel.title || '';
    if (subtitleEl) subtitleEl.textContent = sheetModel.subtitle || '';
    if (bodyEl) {
      bodyEl.innerHTML = sheetModel.bodyHtml || '';
      bodyEl.scrollTop = 0;
    }
    if (footerEl) footerEl.textContent = sheetModel.footer || '';
    nutritionNormsSyncPracticeSheetViewport();
    root.hidden = false;
    document.body.classList.add('nutrition-practice-sheet-open');
    requestAnimationFrame(() => {
      nutritionNormsSyncPracticeSheetViewport();
      const panel = root.querySelector('.nutrition-practice-sheet-panel');
      if (panel && typeof panel.scrollTo === 'function') panel.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    });
  }

  function nutritionNormsClosePracticeSheet() {
    const root = el('nutritionPracticeSheet');
    if (root) root.hidden = true;
    document.body.classList.remove('nutrition-practice-sheet-open');
  }

  function nutritionNormsRenderToolbar(model) {
    const ui = model.ui;
    if (!ui.showBodyMode && !ui.showPalControl && !ui.showSummaryToggle) return '';

    const bodyModeRow = ui.showBodyMode
      ? `
        <div class="nutrition-norms-toolbar-row nutrition-norms-toolbar-row--body-mode">
          <div class="nutrition-norms-toolbar-label">Masa do obliczeń</div>
          <div class="adult-vitals-radio-group nutrition-norms-radio-group" role="radiogroup" aria-label="Masa do obliczeń w normach żywieniowych">
            <label class="adult-vitals-radio-option">
              <input type="radio" name="nutritionNormsBodyMode" value="actual" ${ui.state.bodyMode === 'actual' ? 'checked' : ''}>
              <span>Aktualna</span>
            </label>
            <label class="adult-vitals-radio-option">
              <input type="radio" name="nutritionNormsBodyMode" value="reference" ${ui.state.bodyMode === 'reference' ? 'checked' : ''}>
              <span>Referencyjna</span>
            </label>
          </div>
        </div>`
      : '';

    const palRow = ui.showPalControl
      ? `
        <div class="nutrition-norms-toolbar-row">
          <label class="nutrition-norms-toolbar-label" for="nutritionNormsPalSelect">Aktywność (PAL)</label>
          <select id="nutritionNormsPalSelect" class="nutrition-norms-pal-select">
            ${ui.palOptions.map((opt) => `<option value="${escapeHtml(opt.value)}" ${opt.selected ? 'selected' : ''}>${escapeHtml(opt.label)}</option>`).join('')}
          </select>
        </div>`
      : '';

    const summaryRow = ui.showSummaryToggle
      ? `
        <div class="nutrition-norms-toolbar-row nutrition-norms-toolbar-row--summary">
          <div class="nutrition-norms-toolbar-inline">
            <span class="nutrition-norms-toolbar-label">Podsumowanie wyników</span>
            <label class="nutrition-norms-switch" aria-label="Pokazuj normy żywieniowe w podsumowaniu wyników">
              <input type="checkbox" id="nutritionNormsSummaryToggle" ${ui.state.includeInSummary ? 'checked' : ''}>
              <span class="nutrition-norms-switch-slider"></span>
            </label>
            <span class="nutrition-norms-toolbar-state">${ui.state.includeInSummary ? 'Włączone' : 'Wyłączone'}</span>
          </div>
          <div class="nutrition-norms-toolbar-help">Pokazuj wyniki tej karty w sekcji „Podsumowanie wyników”.</div>
        </div>`
      : '';

    return `<div class="nutrition-norms-toolbar">${bodyModeRow}${palRow}${summaryRow}</div>`;
  }

  function nutritionNormsRenderCard(model) {
    const messagesHtml = (model.messages || []).length
      ? `<div class="nutrition-norms-messages">${(model.messages || []).map(nutritionNormsRenderMessage).join('')}</div>`
      : '';

    const metaLines = [model.notes && model.notes.sourceShort, model.notes && model.notes.averageText, model.notes && model.notes.sourceLong].filter(Boolean);
    const metaHtml = metaLines.length
      ? `<div class="nutrition-norms-meta">${metaLines.map((line, index) => index === 0 ? `<strong>${escapeHtml(line)}</strong>` : escapeHtml(line)).join('<br>')}</div>`
      : '';

    return `
      ${nutritionNormsRenderToolbar(model)}
      ${messagesHtml}
      <div class="nutrition-norms-grid">
        ${nutritionNormsRenderEnergyBox(model)}
        ${nutritionNormsRenderMacroBox('Węglowodany', model.carbs, model, 'carbs')}
        ${nutritionNormsRenderProteinBox(model)}
        ${nutritionNormsRenderMacroBox('Tłuszcze', model.fat, model, 'fat')}
      </div>
      ${nutritionNormsRenderQualityBox(model)}
      ${nutritionNormsRenderDetails(model)}
      ${metaHtml}`;
  }

  function nutritionNormsReadBasicsFromDom() {
    const ageYears = typeof window.getAgeDecimal === 'function'
      ? Number(window.getAgeDecimal())
      : toNumber(el('age') && el('age').value);
    const ageMonthsOpt = toNumber(el('ageMonths') && el('ageMonths').value);
    const sex = normalizeSex(el('sex') && el('sex').value);
    const weightKg = toNumber(el('weight') && el('weight').value);
    const heightCm = toNumber(el('height') && el('height').value);
    return {
      ageYears: isFiniteNumber(ageYears) ? ageYears : 0,
      ageMonthsOpt: isFiniteNumber(ageMonthsOpt) ? ageMonthsOpt : 0,
      sex,
      weightKg: isFiniteNumber(weightKg) ? weightKg : NaN,
      heightCm: isFiniteNumber(heightCm) ? heightCm : NaN,
      mainPal: nutritionNormsResolveMainPalValue()
    };
  }

  function clearNutritionNormsCard() {
    const card = el('nutritionNormsCard');
    const mount = el('nutritionNormsMount');
    if (mount) mount.innerHTML = '';
    if (card) card.style.display = 'none';
    window.nutritionNormsLastModel = null;
  }

  function initNutritionNormsFormResetListeners() {
    if (document.body && document.body.dataset.nutritionNormsFormResetBound === '1') return;
    const fieldIds = ['age', 'ageMonths', 'sex', 'weight', 'height'];
    const resetHandler = function() {
      nutritionNormsResetBodyModeToActual();
    };
    fieldIds.forEach((fieldId) => {
      const field = el(fieldId);
      if (!field) return;
      field.addEventListener('input', resetHandler, { passive: true });
      field.addEventListener('change', resetHandler, { passive: true });
    });
    if (document.body) document.body.dataset.nutritionNormsFormResetBound = '1';
  }

  function renderNutritionNormsCardFromDom() {
    const card = el('nutritionNormsCard');
    const mount = el('nutritionNormsMount');
    if (!card || !mount) return null;

    const basics = nutritionNormsReadBasicsFromDom();
    const hasAge = isFiniteNumber(basics.ageYears) || basics.ageMonthsOpt > 0;
    if (!hasAge) {
      clearNutritionNormsCard();
      return null;
    }

    nutritionNormsMaybeResetBodyModeForBasicsChange(basics);
    const model = nutritionNormsBuildCardModel(basics, nutritionNormsGetUiState());
    mount.innerHTML = nutritionNormsRenderCard(model);
    card.style.display = 'block';
    window.nutritionNormsLastModel = model;
    try {
      if (typeof window.updateProfessionalSummaryCard === 'function') {
        window.updateProfessionalSummaryCard();
      }
    } catch (_) {
      /* ignore */
    }
    try {
      if (typeof window.dispatchEvent === 'function' && typeof window.CustomEvent === 'function') {
        window.dispatchEvent(new window.CustomEvent('nutritionNormsModelUpdated', { detail: model }));
      }
    } catch (_) {
      /* ignore */
    }
    return model;
  }

  function initNutritionNormsCardInteractions() {
    const mount = el('nutritionNormsMount');
    if (!mount || mount.dataset.boundNutritionNorms === '1') return;

    mount.addEventListener('change', function(event) {
      const target = event.target;
      if (!target) return;
      if (target.id === 'nutritionNormsPalSelect') {
        nutritionNormsSetUiState({ palSelector: target.value || 'inherit' });
        renderNutritionNormsCardFromDom();
        return;
      }
      if (target.name === 'nutritionNormsBodyMode') {
        nutritionNormsSetUiState({ bodyMode: target.value === 'reference' ? 'reference' : 'actual' });
        renderNutritionNormsCardFromDom();
        return;
      }
      if (target.id === 'nutritionNormsSummaryToggle') {
        nutritionNormsSetUiState({ includeInSummary: !!target.checked });
        renderNutritionNormsCardFromDom();
      }
    });

    mount.addEventListener('click', function(event) {
      const trigger = event.target && event.target.closest ? event.target.closest('[data-practice-sheet]') : null;
      if (!trigger) return;
      event.preventDefault();
      nutritionNormsOpenPracticeSheet(trigger.getAttribute('data-practice-sheet'));
    });

    mount.dataset.boundNutritionNorms = '1';
  }

  function ensureNutritionNormsCardShell() {
    initNutritionNormsFormResetListeners();
    const card = el('nutritionNormsCard');
    if (!card) return null;
    if (!el('nutritionNormsMount')) {
      card.innerHTML = `
        <h2 style="text-align:center;">Normy żywieniowe: białko, tłuszcz, węglowodany</h2>
        <div id="nutritionNormsMount"></div>`;
    }
    return card;
  }

  function wrapNutritionNormsIntoUpdate() {
    if (typeof window.update !== 'function' || window.update.__nutritionNormsWrapped) return;
    const original = window.update;
    const wrapped = function nutritionNormsWrappedUpdate() {
      const result = original.apply(this, arguments);
      try { renderNutritionNormsCardFromDom(); } catch (_) { /* ignore */ }
      return result;
    };
    wrapped.__nutritionNormsWrapped = true;
    wrapped.__nutritionNormsOriginal = original;
    window.update = wrapped;
    try { update = wrapped; } catch (_) { /* ignore */ }
  }

  function initNutritionNormsModule() {
    ensureNutritionNormsCardShell();
    initNutritionNormsCardInteractions();
    wrapNutritionNormsIntoUpdate();
    try {
      window.addEventListener('vildaResultsModeChanged', function() {
        if (window.nutritionNormsLastModel) renderNutritionNormsCardFromDom();
      });
    } catch (_) {
      /* ignore */
    }
    try {
      window.addEventListener('macroPracticeResourcesReady', function() {
        if (window.nutritionNormsLastModel) renderNutritionNormsCardFromDom();
      });
      window.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') nutritionNormsClosePracticeSheet();
      });
    } catch (_) {
      /* ignore */
    }
    try {
      renderNutritionNormsCardFromDom();
    } catch (_) {
      /* ignore */
    }
  }

  window.nutritionNormsGetAgeBand = nutritionNormsGetAgeBand;
  window.nutritionNormsGetAllowedPAL = nutritionNormsGetAllowedPAL;
  window.nutritionNormsResolvePAL = nutritionNormsResolvePAL;
  window.nutritionNormsProteinTargets = nutritionNormsProteinTargets;
  window.nutritionNormsMacroRI = nutritionNormsMacroRI;
  window.nutritionNormsPercentEnergyToGrams = nutritionNormsPercentEnergyToGrams;
  window.nutritionNormsRangePercentToGramRange = nutritionNormsRangePercentToGramRange;
  window.nutritionNormsGetUiState = nutritionNormsGetUiState;
  window.nutritionNormsResetBodyModeToActual = nutritionNormsResetBodyModeToActual;
  window.nutritionNormsReadBasicsFromDom = nutritionNormsReadBasicsFromDom;
  window.nutritionNormsBuildSummaryLines = nutritionNormsBuildSummaryLines;
  window.nutritionNormsBuildPatientReportCard = nutritionNormsBuildPatientReportCard;
  window.nutritionNormsBuildCardModel = nutritionNormsBuildCardModel;
  window.renderNutritionNormsCardFromDom = renderNutritionNormsCardFromDom;
  window.clearNutritionNormsCard = clearNutritionNormsCard;

  if (document && typeof document.addEventListener === 'function') {
    document.addEventListener('DOMContentLoaded', initNutritionNormsModule);
  }
})(window, document);
