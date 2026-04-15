(function(window, document) {
  'use strict';

  const NUTRITION_NORMS_DEFAULT_STATE = {
    palSelector: 'range',
    bodyMode: 'reference',
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

  function nutritionNormsExplainEnergyFormula(formulaLabel) {
    if (formulaLabel === 'Henry') {
      return 'Spoczynkowy wydatek energetyczny oszacowano równaniem Henry’ego, a następnie uwzględniono poziom aktywności fizycznej (PAL).';
    }
    if (formulaLabel === 'Butte') {
      return 'Całkowity wydatek energetyczny oszacowano wzorem Butte dla niemowląt w wieku 6–11 miesięcy.';
    }
    return '';
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
        basisLabel: `P50 dla wieku ${band.completedYears} lat`,
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

  function nutritionNormsNormalizeUiState(basics, uiOptions) {
    const band = nutritionNormsGetAgeBand(basics.ageYears, basics.ageMonthsOpt);
    const allowedPals = nutritionNormsGetAllowedPAL(basics.ageYears, basics.ageMonthsOpt);
    const inputState = {
      ...nutritionNormsGetUiState(),
      ...(uiOptions || {})
    };
    const normalized = {
      palSelector: inputState.palSelector || 'range',
      bodyMode: inputState.bodyMode || 'reference',
      includeInSummary: !!inputState.includeInSummary
    };

    if (band.kind === 'infant_0_6' || band.kind === 'infant_6_11') {
      normalized.bodyMode = 'actual';
      normalized.palSelector = 'none';
      return normalized;
    }

    if (normalized.bodyMode !== 'reference' && normalized.bodyMode !== 'actual') {
      normalized.bodyMode = 'reference';
    }

    if (normalized.palSelector === 'inherit') {
      normalized.palSelector = 'range';
    }

    if (normalized.palSelector === 'range' && allowedPals.length <= 1) {
      normalized.palSelector = allowedPals.length === 1 ? String(allowedPals[0]) : 'none';
    }

    if (
      normalized.palSelector !== 'range' &&
      normalized.palSelector !== 'none' &&
      !allowedPals.includes(Number(normalized.palSelector))
    ) {
      normalized.palSelector = allowedPals.length > 1 ? 'range' : (allowedPals.length === 1 ? String(allowedPals[0]) : 'none');
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
      options.push({ value: 'range', label: 'Brak ograniczeń – pokaż cały zakres' });
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
        messages.push({ tone: 'info', text: 'Tryb referencyjny u dzieci korzysta z mediany P50 dla wieku i płci.' });
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
    return `<div class="nutrition-norms-message nutrition-norms-message--${tone}">${escapeHtml(msg && msg.text)}</div>`;
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
      sub = 'TEE wg Butte dla niemowląt 6–11 miesięcy.';
    } else if (energy.mode === 'fixed') {
      const parts = [];
      if (isFiniteNumber(energy.reeKcal)) parts.push(nutritionNormsBuildRestingEnergyText(energy.reeKcal));
      if (isFiniteNumber(energy.usedPal)) parts.push(`PAL ${formatPal(energy.usedPal)}`);
      if (isFiniteNumber(energy.growthMultiplier) && energy.growthMultiplier > 1) parts.push('+1% kosztu wzrastania');
      sub = parts.join(' • ');
    } else if (energy.mode === 'range') {
      const minPal = energy.items[0] && energy.items[0].pal;
      const maxPal = energy.items[energy.items.length - 1] && energy.items[energy.items.length - 1].pal;
      const parts = [];
      if (isFiniteNumber(energy.reeKcal)) parts.push(nutritionNormsBuildRestingEnergyText(energy.reeKcal));
      if (isFiniteNumber(minPal) && isFiniteNumber(maxPal)) parts.push(`zakres PAL ${formatPal(minPal)}–${formatPal(maxPal)}`);
      if (isFiniteNumber(energy.growthMultiplier) && energy.growthMultiplier > 1) parts.push('+1% kosztu wzrastania');
      sub = parts.join(' • ');
    }

    const comparisonLine = energy.showComparison
      ? `<p class="nutrition-norms-sub">Dla ${escapeHtml(energy.comparisonLabel)}: ${formatKcal(energy.comparisonValue)}.</p>`
      : '';

    const table = energy.mode === 'range' && energy.items.length > 1
      ? `<table class="nutrition-norms-range-table">
          <thead><tr><th>PAL</th><th>TEE</th></tr></thead>
          <tbody>${energy.items.map((item) => `<tr><td>${formatPal(item.pal)}</td><td>${formatNumber(item.teeKcal, 0)} kcal/d</td></tr>`).join('')}</tbody>
        </table>`
      : '';

    const basisLine = isFiniteNumber(energy.basisWeightKg)
      ? `<p class="nutrition-norms-sub">Do obliczeń użyto: ${escapeHtml(energy.basisLabel)} (${formatKg(energy.basisWeightKg, 1)}${isFiniteNumber(energy.basisHeightCm) ? `; ${formatNumber(energy.basisHeightCm, 1)} cm` : ''}).</p>`
      : '';

    return `
      <div class="result-box nutrition-norms-box">
        <strong>Energia</strong>
        <span class="nutrition-norms-value">${header}</span>
        ${sub ? `<p class="nutrition-norms-sub">${escapeHtml(sub)}</p>` : ''}
        ${comparisonLine}
        ${basisLine}
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
    const comparisonLine = protein.showComparison
      ? `<p class="nutrition-norms-sub">Dla ${escapeHtml(protein.comparisonLabel)}: ${formatNumber(protein.comparisonValue, 0)} g/d (zalecane spożycie, RDA).</p>`
      : '';
    return `
      <div class="result-box nutrition-norms-box">
        <strong>Białko</strong>
        <span class="nutrition-norms-value">${formatNumber(main.rdaGDay, 0)} g/d</span>
        <p class="nutrition-norms-sub">${escapeHtml(nutritionNormsBuildProteinCriteriaText(main, null))}</p>
        <p class="nutrition-norms-sub">Do obliczeń przyjęto ${escapeHtml(protein.basisLabel)} (${formatKg(protein.basisWeightKg, 1)}).</p>
        ${comparisonLine}
      </div>`;
  }

  function nutritionNormsRenderMacroBox(title, macroModel) {
    const valueText = macroModel.gramRange ? formatGramRange(macroModel.gramRange, 0) : formatPercentRange(macroModel.percentRange);
    const sub = formatPercentRange(macroModel.percentRange);
    return `
      <div class="result-box nutrition-norms-box">
        <strong>${escapeHtml(title)}</strong>
        <span class="nutrition-norms-value">${valueText}</span>
        <p class="nutrition-norms-sub">${sub}</p>
        ${macroModel.lowActivityNote ? `<p class="nutrition-norms-sub">${escapeHtml(macroModel.lowActivityNote)}</p>` : ''}
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
        ${nutritionNormsRenderMacroBox('Węglowodany', model.carbs)}
        ${nutritionNormsRenderProteinBox(model)}
        ${nutritionNormsRenderMacroBox('Tłuszcze', model.fat)}
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

    mount.dataset.boundNutritionNorms = '1';
  }

  function ensureNutritionNormsCardShell() {
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
