/* ========================================================================== 
 * VildaActivityBurn — helpery spalania kalorii i aktywności
 *
 * Plik wydzielony z app.js w kroku 8D. Korzysta ze statycznych danych
 * z VildaFoodData, zachowując dotychczasowe globalne API:
 * activityBuildFoodBurnState(), activityBuildJourneyBurnState(), kcalFor1km()
 * itd. Nie zmienia wzorów ani założeń obliczeniowych.
 * ========================================================================== */
(function(global){
  'use strict';

  const VERSION = '1.0.0';
  const MINUTES_PER_HOUR_LOCAL = 60;
  const M_PER_KM_LOCAL = 1000;

  function getFoodData(){
    return (global && (global.VildaFoodData || global.vildaFoodData)) || {};
  }

  function asObject(value){
    return value && typeof value === 'object' ? value : Object.freeze({});
  }

  function asArray(value){
    return Array.isArray(value) ? value : Object.freeze([]);
  }

  function logWarn(scope, message, meta) {
    try {
      if (global && global.VildaLogger && typeof global.VildaLogger.warn === 'function') {
        global.VildaLogger.warn(scope || 'activity-burn', message, meta || null);
        return;
      }
      if (global && typeof global.vildaLogWarn === 'function') {
        global.vildaLogWarn(scope || 'activity-burn', message, meta || null);
        return;
      }
      if (global && global.__VILDA_DEBUG && global.console && typeof global.console.warn === 'function') {
        global.console.warn('[VildaActivityBurn]', scope || '', message, meta || '');
      }
    } catch (ignored) {
      void ignored;
    }
  }

  function escapeHtml(value) {
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

  const foodData = getFoodData();
  const ACTIVITY_BURN_LIBRARY = asObject(foodData.activityBurnLibrary);
  const ACTIVITY_BURN_PRESETS = asObject(foodData.activityBurnPresets);
  const ACTIVITY_BURN_ROUTE_EXAMPLES = asArray(foodData.activityBurnRouteExamples);
  // Alias utrzymywany dla kompatybilności ze starszym kodem i testami.
  const activities = asObject(foodData.activities);

  if (!foodData || !foodData.version) {
    logWarn('activity-burn:init', 'Brak VildaFoodData — helper aktywności działa na pustych danych fallback.');
  }

  function activityGetDefinition(activityKey) {
    const key = String(activityKey || '');
    if (foodData && typeof foodData.getActivityDefinition === 'function') {
      return foodData.getActivityDefinition(key);
    }
    return ACTIVITY_BURN_LIBRARY[key] || null;
  }

  function activityGetPreset(presetKey) {
    const key = String(presetKey || '');
    if (foodData && typeof foodData.getActivityPreset === 'function') {
      return foodData.getActivityPreset(key);
    }
    return ACTIVITY_BURN_PRESETS[key] || null;
  }

  function activityResolveChildFactor(ageYears, enabled = false) {
    const ageNum = Number(ageYears) || 0;
    return enabled && ageNum > 0 && ageNum < 14 ? 1.1 : 1;
  }

  function activityBurnPerMinuteKcal(met, weightKg) {
    const metNum = Number(met);
    const weightNum = Number(weightKg);
    if (!(metNum > 0) || !(weightNum > 0)) return 0;
    return (metNum * 3.5 * weightNum) / 200;
  }

  function activityFormatDurationMinutes(totalMinutes) {
    if (!Number.isFinite(totalMinutes) || totalMinutes < 0) return '—';
    const roundedMinutes = Math.max(0, Math.round(totalMinutes));
    const hours = Math.floor(roundedMinutes / MINUTES_PER_HOUR_LOCAL);
    const minutes = roundedMinutes % MINUTES_PER_HOUR_LOCAL;
    return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
  }

  function activityFormatDistanceKm(distanceKm) {
    if (!Number.isFinite(distanceKm) || distanceKm < 0) return '—';
    if (distanceKm >= 1) return `${distanceKm.toFixed(1).replace('.', ',')} km`;
    return `${Math.round(distanceKm * M_PER_KM_LOCAL)} m`;
  }

  function activityBurnEstimate({ activityKey, weightKg, kcalTarget, effectiveKcalTarget = null }) {
    const def = activityGetDefinition(activityKey);
    if (!def) return null;

    const burnPerMinKcal = activityBurnPerMinuteKcal(def.MET, weightKg);
    const hasExplicitEffectiveKcal = effectiveKcalTarget !== null
      && effectiveKcalTarget !== undefined
      && Number.isFinite(Number(effectiveKcalTarget));
    const effectiveKcal = hasExplicitEffectiveKcal
      ? Number(effectiveKcalTarget)
      : (Number(kcalTarget) || 0);
    const minutesRaw = burnPerMinKcal > 0 ? (effectiveKcal / burnPerMinKcal) : null;
    const distanceKm = (Number.isFinite(def.speedKmh) && minutesRaw != null)
      ? (minutesRaw / MINUTES_PER_HOUR_LOCAL) * def.speedKmh
      : null;

    return {
      key: def.key,
      name: def.name,
      MET: def.MET,
      speedKmh: def.speedKmh,
      burnPerMinKcal,
      minutesRaw,
      timeText: activityFormatDurationMinutes(minutesRaw),
      distanceKm,
      distanceText: distanceKm == null ? null : activityFormatDistanceKm(distanceKm),
      kcalTarget: Number(kcalTarget) || 0,
      effectiveKcalTarget: effectiveKcal
    };
  }

  function activityBuildModel({ presetKey, weightKg, kcalTarget, ageYears = 0 }) {
    const preset = activityGetPreset(presetKey);
    const baseKcal = Number(kcalTarget) || 0;
    const weightNum = Number(weightKg) || 0;
    if (!preset) return null;

    const childFactor = activityResolveChildFactor(ageYears, preset.applyChildFactor === true);
    const effectiveKcalTarget = baseKcal * childFactor;
    const rows = (weightNum > 0 && baseKcal > 0)
      ? preset.activityKeys
          .map((activityKey) => activityBurnEstimate({
            activityKey,
            weightKg: weightNum,
            kcalTarget: baseKcal,
            effectiveKcalTarget
          }))
          .filter(Boolean)
      : [];

    return {
      presetKey: preset.key,
      includeDistance: preset.includeDistance === true,
      tableHeader: preset.tableHeader,
      applyChildFactor: preset.applyChildFactor === true,
      childFactor,
      weightKg: weightNum,
      kcalTarget: baseKcal,
      effectiveKcalTarget,
      rows
    };
  }

  function activityBuildFoodBurnState({ kcalTarget, weightKg, ageYears = 0 }) {
    return activityBuildModel({
      presetKey: 'food_times',
      kcalTarget,
      weightKg,
      ageYears
    });
  }

  function activityBuildJourneyBurnState({ kcalTarget, weightKg, ageYears = 0 }) {
    return activityBuildModel({
      presetKey: 'bmi_journey',
      kcalTarget,
      weightKg,
      ageYears
    });
  }

  function activityRenderTableHtml(model) {
    if (!model || !Array.isArray(model.rows) || model.rows.length === 0) return '';

    if (model.includeDistance) {
      const rowsHtml = model.rows
        .map((row) => `<tr><td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.distanceText)} / ${escapeHtml(row.timeText)}</td></tr>`)
        .join('');
      return `<table style="margin-top:6px;width:100%;"><tr><th>Aktywność</th><th>Dystans / Czas do normy</th></tr>${rowsHtml}</table>`;
    }

    const rowsHtml = model.rows
      .map((row) => `<tr><td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.timeText)}</td></tr>`)
      .join('');
    return `<table style="width:100%;border-collapse:collapse;margin-top:0.6rem;"><tr><th>Aktywność</th><th>Czas spalania</th></tr>${rowsHtml}</table>`;
  }

  function activityGetPdfRows(model) {
    if (!model || !Array.isArray(model.rows)) return [];
    if (model.includeDistance) {
      return model.rows.map((row) => [row.name, row.distanceText || '—', row.timeText]);
    }
    return model.rows.map((row) => [row.name, row.timeText]);
  }

  function activityGetRow(model, activityKey) {
    if (!model || !Array.isArray(model.rows)) return null;
    return model.rows.find((row) => row.key === activityKey) || null;
  }

  function activityFindRouteExample(distanceKm) {
    if (!(Number(distanceKm) > 0)) return null;
    const targetKm = Number(distanceKm);
    const nearMatch = ACTIVITY_BURN_ROUTE_EXAMPLES.find((route) => targetKm < route.km * 1.15 && targetKm > route.km * 0.85);
    if (nearMatch) return nearMatch;
    return ACTIVITY_BURN_ROUTE_EXAMPLES.reduce((best, current) => {
      if (!best) return current;
      return Math.abs(current.km - targetKm) < Math.abs(best.km - targetKm) ? current : best;
    }, null);
  }

  function kcalFor1km(activity, weight){
    const definition = activityGetDefinition(activity);
    if (!definition || !Number.isFinite(definition.speedKmh)) return 0;
    const kcalPerMin = activityBurnPerMinuteKcal(definition.MET, weight);
    return kcalPerMin * (MINUTES_PER_HOUR_LOCAL / definition.speedKmh);
  }

  function versionInfo(){
    return {
      version: VERSION,
      activityDefinitions: Object.keys(ACTIVITY_BURN_LIBRARY).length,
      presets: Object.keys(ACTIVITY_BURN_PRESETS).length,
      routes: ACTIVITY_BURN_ROUTE_EXAMPLES.length
    };
  }

  const api = Object.freeze({
    version: VERSION,
    library: ACTIVITY_BURN_LIBRARY,
    presets: ACTIVITY_BURN_PRESETS,
    routeExamples: ACTIVITY_BURN_ROUTE_EXAMPLES,
    activities,
    activityGetDefinition,
    activityGetPreset,
    activityResolveChildFactor,
    activityBurnPerMinuteKcal,
    activityFormatDurationMinutes,
    activityFormatDistanceKm,
    activityBurnEstimate,
    activityBuildModel,
    activityBuildFoodBurnState,
    activityBuildJourneyBurnState,
    activityRenderTableHtml,
    activityGetPdfRows,
    activityGetRow,
    activityFindRouteExample,
    kcalFor1km,
    versionInfo
  });

  global.VildaActivityBurn = api;
  global.vildaActivityBurn = api;
  global.vildaActivityBurnVersion = function(){ return VERSION; };

  global.ACTIVITY_BURN_LIBRARY = ACTIVITY_BURN_LIBRARY;
  global.ACTIVITY_BURN_PRESETS = ACTIVITY_BURN_PRESETS;
  global.ACTIVITY_BURN_ROUTE_EXAMPLES = ACTIVITY_BURN_ROUTE_EXAMPLES;
  global.activities = activities;
  global.activityGetDefinition = activityGetDefinition;
  global.activityGetPreset = activityGetPreset;
  global.activityResolveChildFactor = activityResolveChildFactor;
  global.activityBurnPerMinuteKcal = activityBurnPerMinuteKcal;
  global.activityFormatDurationMinutes = activityFormatDurationMinutes;
  global.activityFormatDistanceKm = activityFormatDistanceKm;
  global.activityBurnEstimate = activityBurnEstimate;
  global.activityBuildModel = activityBuildModel;
  global.activityBuildFoodBurnState = activityBuildFoodBurnState;
  global.activityBuildJourneyBurnState = activityBuildJourneyBurnState;
  global.activityRenderTableHtml = activityRenderTableHtml;
  global.activityGetPdfRows = activityGetPdfRows;
  global.activityGetRow = activityGetRow;
  global.activityFindRouteExample = activityFindRouteExample;
  global.kcalFor1km = kcalFor1km;
})(typeof window !== 'undefined' ? window : globalThis);
