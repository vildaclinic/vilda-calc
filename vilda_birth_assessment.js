/* Saved results of an explicit SGA birth calculation. This module never computes SDS. */
(function (root) {
  'use strict';

  const SOURCE_KEYS = ['niklasson', 'intergrowth', 'malewski'];
  const METRIC_KEYS = ['weight', 'length', 'head'];
  const METRIC_INPUT_KEYS = { weight: 'weightG', length: 'lengthCm', head: 'headCm' };
  const STATUSES = ['TAK', 'NIE', 'Brak danych', 'Niedostępne w tym źródle'];
  const INPUT_KEYS = ['sex', 'weeks', 'days', 'weightG', 'lengthCm', 'headCm'];

  function object(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function number(value) {
    if (value == null || String(value).trim() === '') return null;
    return Number(String(value).trim().replace(/\s+/g, '').replace(',', '.'));
  }

  function inputs(state) {
    if (!object(state)) return null;
    const value = {
      sex: state.sex,
      weeks: number(state.weeks),
      days: number(state.days == null || String(state.days).trim() === '' ? 0 : state.days),
      weightG: number(state.weight),
      lengthCm: number(state.length),
      headCm: number(state.head)
    };
    if (!['male', 'female'].includes(value.sex) || !Number.isInteger(value.weeks) ||
        !Number.isInteger(value.days) || value.days < 0 || value.days > 6) return null;
    const measurements = [value.weightG, value.lengthCm, value.headCm];
    if (!measurements.some(Number.isFinite) || measurements.some(item => item !== null && !Number.isFinite(item))) return null;
    return value;
  }

  function sourceKeys(state) {
    const keys = Array.isArray(state.sourceKeys) ? state.sourceKeys :
      state.sourceChoice === 'compare' ? SOURCE_KEYS : [state.sourceChoice || 'niklasson'];
    if (!keys.length || keys.some(key => !SOURCE_KEYS.includes(key)) || new Set(keys).size !== keys.length) return null;
    return keys.slice();
  }

  function strings(value) {
    return Array.isArray(value) && value.every(item => typeof item === 'string') ? value.slice() : null;
  }

  function timestamp(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return false;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) && new Date(parsed).toISOString() === (value.includes('.') ? value : value.replace('Z', '.000Z'));
  }

  function metric(value) {
    if (!object(value) || ['title', 'valueLabel', 'percentile', 'interpretation'].some(key => typeof value[key] !== 'string') ||
        typeof value.unavailable !== 'boolean' || (value.unavailable ? value.sds !== null : !Number.isFinite(value.sds))) return null;
    return {
      title: value.title,
      valueLabel: value.valueLabel,
      sds: value.sds,
      percentile: value.percentile,
      interpretation: value.interpretation,
      unavailable: value.unavailable
    };
  }

  function source(value, requested, input) {
    if (!object(value) || !requested.includes(value.sourceKey) ||
        ['title', 'sourceLabel', 'helperLabel'].some(key => typeof value[key] !== 'string') ||
        !object(value.metrics) || !object(value.summary)) return null;
    const metrics = {};
    for (const key of Object.keys(value.metrics)) {
      if (!METRIC_KEYS.includes(key)) return null;
      const item = metric(value.metrics[key]);
      if (!item || input[METRIC_INPUT_KEYS[key]] === null) return null;
      metrics[key] = item;
    }
    if (METRIC_KEYS.some(key => input[METRIC_INPUT_KEYS[key]] !== null && !metrics[key])) return null;
    if (!Object.values(metrics).some(item => !item.unavailable)) return null;
    for (const key of ['weight', 'length']) {
      const status = value.summary[`${key}Status`];
      if (!STATUSES.includes(status)) return null;
      // Preserve the renderer's conclusion; only check that it has supporting data.
      if (['TAK', 'NIE'].includes(status) && (!metrics[key] || metrics[key].unavailable)) return null;
      if (status === 'Brak danych' && metrics[key]) return null;
      if (status === 'Niedostępne w tym źródle' && metrics[key] && !metrics[key].unavailable) return null;
    }
    const notes = strings(value.notes), metaLines = strings(value.metaLines);
    if (!notes || !metaLines) return null;
    return {
      sourceKey: value.sourceKey,
      title: value.title,
      sourceLabel: value.sourceLabel,
      helperLabel: value.helperLabel,
      metrics,
      summary: { weightStatus: value.summary.weightStatus, lengthStatus: value.summary.lengthStatus },
      notes,
      metaLines
    };
  }

  function read(state) {
    if (!object(state) || state.hasComputed !== true) return null;
    const saved = state.assessment, input = inputs(state), requested = sourceKeys(state);
    if (!object(saved) || saved.version !== 1 || !input || !requested || !object(saved.inputs) ||
        INPUT_KEYS.some(key => saved.inputs[key] !== input[key]) ||
        !Array.isArray(saved.requestedSourceKeys) || saved.requestedSourceKeys.length !== requested.length ||
        requested.some((key, index) => saved.requestedSourceKeys[index] !== key) ||
        !timestamp(saved.computedAtISO) || !Array.isArray(saved.sources) || !saved.sources.length) return null;
    const notes = strings(saved.notes);
    if (!notes) return null;
    const sources = saved.sources.map(item => source(item, requested, input));
    if (sources.some(item => !item) || new Set(sources.map(item => item.sourceKey)).size !== sources.length) return null;
    return {
      version: 1,
      computedAtISO: saved.computedAtISO,
      inputs: input,
      requestedSourceKeys: requested,
      sources,
      notes
    };
  }

  function create(state, results, nowISO, notes) {
    if (!object(state) || !Array.isArray(results)) return null;
    return read({
      ...state,
      assessment: {
        version: 1,
        computedAtISO: nowISO === undefined ? new Date().toISOString() : nowISO,
        inputs: inputs(state),
        requestedSourceKeys: sourceKeys(state),
        sources: results.map(item => object(item) ? {
          sourceKey: item.sourceKey,
          title: item.title,
          sourceLabel: item.sourceLabel,
          helperLabel: item.helperLabel,
          metrics: item.metrics,
          summary: item.summary,
          notes: item.notes || [],
          metaLines: item.metaLines || []
        } : item),
        notes: notes === undefined ? [] : notes
      }
    });
  }

  root.VildaBirthAssessment = Object.freeze({ create, read });
})(typeof window !== 'undefined' ? window : globalThis);
