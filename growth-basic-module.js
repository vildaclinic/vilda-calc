(function () {
  window.basicGrowthData = window.basicGrowthData && typeof window.basicGrowthData === 'object'
    ? window.basicGrowthData
    : null;

  function q(id) {
    return document.getElementById(id);
  }

  function num(value) {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : null;
  }

  function cloneData(obj) {
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch (_) {
      return obj;
    }
  }

  function hasMeaningfulSyncValue(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string' && value.trim() === '') return false;
    return true;
  }

  function toOptionalSyncNumber(value) {
    if (!hasMeaningfulSyncValue(value)) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function toSyncAgeMonths(ageMonthsValue, ageYearsValue) {
    const direct = toOptionalSyncNumber(ageMonthsValue);
    if (direct !== null) return Math.round(direct);
    const years = toOptionalSyncNumber(ageYearsValue);
    return years !== null ? Math.round(years * 12) : null;
  }


  function isProfessionalResultsModeActiveLocal() {
    const toggle = q('resultsModeToggle');
    if (toggle) return !!toggle.checked;
    try {
      if (typeof window !== 'undefined' && typeof window.professionalMode !== 'undefined') {
        return !!window.professionalMode;
      }
    } catch (_) {}
    try {
      return localStorage.getItem('resultsMode') === 'professional';
    } catch (_) {}
    return false;
  }

  function isGrowthHistoryCrossSyncTemporarilySuspended() {
    try {
      return !!(typeof window !== 'undefined' && window.__vildaSuspendGrowthHistoryCrossSync);
    } catch (_) {
      return false;
    }
  }

  function isGrowthHistoryCrossSyncEnabled() {
    return isProfessionalResultsModeActiveLocal() && !isGrowthHistoryCrossSyncTemporarilySuspended();
  }

  function getGrowthHistorySyncState() {
    try {
      if (!window.__vildaGrowthHistorySync || typeof window.__vildaGrowthHistorySync !== 'object') {
        window.__vildaGrowthHistorySync = { active: false, source: '' };
      }
      return window.__vildaGrowthHistorySync;
    } catch (_) {
      return { active: false, source: '' };
    }
  }

  function getGrowthHistoryCountsState() {
    try {
      if (!window.__vildaGrowthHistoryCounts || typeof window.__vildaGrowthHistoryCounts !== 'object') {
        window.__vildaGrowthHistoryCounts = { basic: 0, advanced: 0 };
      }
      return window.__vildaGrowthHistoryCounts;
    } catch (_) {
      return { basic: 0, advanced: 0 };
    }
  }

  function noteGrowthHistoryCount(kind, count) {
    const state = getGrowthHistoryCountsState();
    if (!state) return;
    state[kind] = Number.isFinite(Number(count)) ? Number(count) : 0;
  }

  function getBasicHistorySignatureState() {
    try {
      if (!window.__vildaBasicGrowthHistorySignatureState || typeof window.__vildaBasicGrowthHistorySignatureState !== 'object') {
        window.__vildaBasicGrowthHistorySignatureState = { synced: null };
      }
      return window.__vildaBasicGrowthHistorySignatureState;
    } catch (_) {
      return { synced: null };
    }
  }

  function buildBasicHistorySignature(entries) {
    const list = Array.isArray(entries) ? entries : [];
    return list
      .map((entry) => {
        const ageMonths = toSyncAgeMonths(entry?.ageMonths, entry?.ageYears);
        const height = toOptionalSyncNumber(entry?.height);
        const weight = toOptionalSyncNumber(entry?.weight);
        return [
          ageMonths === null ? '' : String(ageMonths),
          height === null ? '' : height.toFixed(3),
          weight === null ? '' : weight.toFixed(3)
        ].join('|');
      })
      .join('||');
  }

  function rememberBasicHistorySignature(entries) {
    const state = getBasicHistorySignatureState();
    if (!state) return;
    state.synced = buildBasicHistorySignature(entries);
  }

  function hasBasicHistoryChangedSinceLastSync(entries) {
    const state = getBasicHistorySignatureState();
    const next = buildBasicHistorySignature(entries);
    return !state || state.synced !== next;
  }

  function shouldPropagateBasicHistory(currentCount) {
    const state = getGrowthHistoryCountsState();
    const nextCount = Number.isFinite(Number(currentCount)) ? Number(currentCount) : 0;
    const prevCount = Number.isFinite(Number(state.basic)) ? Number(state.basic) : 0;
    const advancedCount = collectAdvancedMeasurementsForSync().length;
    state.basic = nextCount;
    return nextCount > 0 || advancedCount === 0 || prevCount > 0;
  }

  function shouldPropagateAdvancedHistory(currentCount) {
    const state = getGrowthHistoryCountsState();
    const nextCount = Number.isFinite(Number(currentCount)) ? Number(currentCount) : 0;
    const prevCount = Number.isFinite(Number(state.advanced)) ? Number(state.advanced) : 0;
    const basicCount = collectBasicGrowthMeasurementsForSync().length;
    state.advanced = nextCount;
    return nextCount > 0 || basicCount === 0 || prevCount > 0;
  }

  function isGrowthHistorySyncLockedFor(source) {
    const state = getGrowthHistorySyncState();
    return !!(state && state.active && state.source && state.source !== source);
  }

  function withGrowthHistorySyncLock(source, callback) {
    const state = getGrowthHistorySyncState();
    if (state && state.active) return false;
    if (state) {
      state.active = true;
      state.source = source || '';
    }
    try {
      callback();
    } finally {
      if (state) {
        state.active = false;
        state.source = '';
      }
    }
    return true;
  }

  function getAgeDecimalLocal() {
    if (typeof window.getAgeDecimal === 'function') {
      const v = window.getAgeDecimal();
      return Number.isFinite(v) ? v : NaN;
    }
    const years = num(q('age')?.value);
    const months = num(q('ageMonths')?.value);
    if (years === null && months === null) return NaN;
    return (years || 0) + ((months || 0) / 12);
  }

  function getCurrentBasicGrowthName() {
    const basic = q('basicGrowthName');
    const main = q('name');
    const adv = q('advName');
    return (basic && typeof basic.value === 'string' && basic.value.trim())
      || (main && typeof main.value === 'string' && main.value.trim())
      || (adv && typeof adv.value === 'string' && adv.value.trim())
      || '';
  }

  function collectBasicGrowthMeasurements() {
    const rows = document.querySelectorAll('#basicGrowthMeasurements .measure-row');
    const measurements = [];
    rows.forEach((row) => {
      const yVal = num(row.querySelector('.bg-age-years')?.value);
      const mVal = num(row.querySelector('.bg-age-months')?.value);
      if (yVal === null && mVal === null) return;
      const ageYears = (yVal || 0) + ((mVal || 0) / 12);
      const ageMonths = Math.round(ageYears * 12);
      const hVal = num(row.querySelector('.bg-height')?.value);
      const wVal = num(row.querySelector('.bg-weight')?.value);
      measurements.push({
        ageYears,
        ageMonths,
        height: hVal,
        weight: wVal
      });
    });
    return measurements.sort((a, b) => a.ageMonths - b.ageMonths);
  }


  function collectBasicGrowthMeasurementsForSync() {
    const rows = document.querySelectorAll('#basicGrowthMeasurements .measure-row');
    const measurements = [];
    rows.forEach((row, domIndex) => {
      const yVal = num(row.querySelector('.bg-age-years')?.value);
      const mVal = num(row.querySelector('.bg-age-months')?.value);
      if (yVal === null && mVal === null) return;
      const ageYears = (yVal || 0) + ((mVal || 0) / 12);
      const ageMonths = Math.round(ageYears * 12);
      const hVal = num(row.querySelector('.bg-height')?.value);
      const wVal = num(row.querySelector('.bg-weight')?.value);
      measurements.push({
        ageYears,
        ageMonths,
        height: hVal,
        weight: wVal,
        domIndex
      });
    });
    return measurements;
  }

  function captureAdvancedRowsForSync() {
    const rows = Array.from(document.querySelectorAll('#advMeasurements .measure-row'));
    return rows.map((row) => ({
      ageYears: row.querySelector('.adv-age-years')?.value ?? '',
      ageMonthsPart: row.querySelector('.adv-age-months')?.value ?? '',
      height: row.querySelector('.adv-height')?.value ?? '',
      weight: row.querySelector('.adv-weight')?.value ?? '',
      boneAgeYears: row.querySelector('.adv-bone-age')?.value ?? '',
      arrowEnabled: !!row.querySelector('.adv-arrow-enable')?.checked,
      arrowComment: row.querySelector('.adv-arrow-comment')?.value ?? '',
      ghSync: row.getAttribute('data-gh-sync') === 'true',
      ghId: row.getAttribute('data-gh-id') || '',
      analysisOpen: row.dataset.analysisOpen === 'true'
    }));
  }

  function collectAdvancedMeasurementsForSync() {
    if (typeof window.collectAdvancedMeasurements === 'function') {
      try {
        return window.collectAdvancedMeasurements(false) || [];
      } catch (_) {}
    }
    const rows = Array.from(document.querySelectorAll('#advMeasurements .measure-row'));
    const measurements = [];
    rows.forEach((row, domIndex) => {
      const yVal = num(row.querySelector('.adv-age-years')?.value);
      const mVal = num(row.querySelector('.adv-age-months')?.value);
      if (yVal === null && mVal === null) return;
      const ageYears = (yVal || 0) + ((mVal || 0) / 12);
      const ageMonths = Math.round(ageYears * 12);
      const hVal = num(row.querySelector('.adv-height')?.value);
      const wVal = num(row.querySelector('.adv-weight')?.value);
      const boneVal = num(row.querySelector('.adv-bone-age')?.value);
      measurements.push({
        ageYears,
        ageMonths,
        height: hVal,
        weight: wVal,
        boneAgeYears: boneVal,
        domIndex
      });
    });
    return measurements;
  }

  function rebuildBasicRowsFromShared(entries) {
    const wrap = q('basicGrowthMeasurements');
    if (!wrap) return;
    wrap.innerHTML = '';

    const list = Array.isArray(entries) ? entries : [];
    if (!list.length) {
      createBasicGrowthRow();
      updateBasicGrowthRemoveButtons();
      updateBasicGrowthAgeMax();
      return;
    }

    list.forEach((entry) => {
      const months = Number.isFinite(Number(entry?.ageMonths))
        ? Math.round(Number(entry.ageMonths))
        : Math.round((Number(entry?.ageYears) || 0) * 12);
      const height = toOptionalSyncNumber(entry?.height);
      const weight = toOptionalSyncNumber(entry?.weight);
      createBasicGrowthRow({
        ageMonths: months,
        height,
        weight
      });
    });

    updateBasicGrowthRemoveButtons();
    updateBasicGrowthAgeMax();
  }

  function rebuildAdvancedRowsFromShared(entries, preservedRows) {
    const wrap = q('advMeasurements');
    if (!wrap || typeof window.addAdvMeasurementRow !== 'function') return;
    wrap.innerHTML = '';

    const list = Array.isArray(entries) ? entries : [];
    const preserved = Array.isArray(preservedRows) ? preservedRows : [];
    const usedPreservedIndexes = new Set();
    const statePreserved = (() => {
      try {
        if (typeof window === 'undefined' || !window.advancedGrowthData || !Array.isArray(window.advancedGrowthData.measurements)) {
          return [];
        }
        return window.advancedGrowthData.measurements.map((entry) => {
          if (!entry || typeof entry !== 'object') return null;
          const ageMonths = toSyncAgeMonths(entry.ageMonths, entry.ageYears);
          const yearsPart = ageMonths === null ? null : Math.floor(ageMonths / 12);
          const monthsPart = ageMonths === null ? null : (ageMonths - (yearsPart * 12));
          return {
            ageYears: yearsPart,
            ageMonthsPart: monthsPart,
            height: entry.height,
            weight: entry.weight,
            boneAgeYears: entry.boneAgeYears,
            arrowEnabled: !!entry.arrowEnabled,
            arrowComment: (typeof entry.arrowComment === 'string') ? entry.arrowComment : '',
            ghSync: !!entry.ghSync,
            ghId: (entry.ghId != null) ? String(entry.ghId) : '',
            analysisOpen: !!entry.analysisOpen
          };
        }).filter(Boolean);
      } catch (_) {
        return [];
      }
    })();
    const usedStatePreservedIndexes = new Set();

    const setValue = (row, selector, value) => {
      const el = row.querySelector(selector);
      if (!el) return;
      el.value = (value == null || Number.isNaN(value)) ? '' : String(value);
    };

    const normalizeNumericToken = (value) => {
      const n = toOptionalSyncNumber(value);
      if (n === null) return '';
      return n.toFixed(3);
    };

    const entryAgeKey = (entry) => {
      const ageMonths = toSyncAgeMonths(entry?.ageMonths, entry?.ageYears);
      return ageMonths === null ? '' : String(ageMonths);
    };

    const preservedAgeKey = (meta) => {
      if (!meta || typeof meta !== 'object') return '';
      const years = toOptionalSyncNumber(meta.ageYears != null ? meta.ageYears : meta.ageY);
      const months = toOptionalSyncNumber(meta.ageMonthsPart != null ? meta.ageMonthsPart : meta.ageM);
      if (years === null && months === null) return '';
      return String(Math.round((years || 0) * 12 + (months || 0)));
    };

    const entrySignature = (entry) => {
      if (!entry || typeof entry !== 'object') return '';
      const ageKey = entryAgeKey(entry);
      return [
        ageKey,
        normalizeNumericToken(entry.height),
        normalizeNumericToken(entry.weight)
      ].join('|');
    };

    const entryAgeWeightSignature = (entry) => {
      if (!entry || typeof entry !== 'object') return '';
      return [
        entryAgeKey(entry),
        normalizeNumericToken(entry.weight)
      ].join('|');
    };

    const preservedSignature = (meta) => {
      if (!meta || typeof meta !== 'object') return '';
      return [
        preservedAgeKey(meta),
        normalizeNumericToken(meta.height),
        normalizeNumericToken(meta.weight)
      ].join('|');
    };

    const preservedAgeWeightSignature = (meta) => {
      if (!meta || typeof meta !== 'object') return '';
      return [
        preservedAgeKey(meta),
        normalizeNumericToken(meta.weight)
      ].join('|');
    };

    const takeMatchingPreservedMeta = (matcher) => {
      const index = preserved.findIndex((meta, metaIndex) => {
        if (usedPreservedIndexes.has(metaIndex)) return false;
        return matcher(meta, metaIndex);
      });
      if (index === -1) return null;
      usedPreservedIndexes.add(index);
      return preserved[index] || null;
    };

    const takeMatchingStateMeta = (matcher) => {
      const index = statePreserved.findIndex((meta, metaIndex) => {
        if (usedStatePreservedIndexes.has(metaIndex)) return false;
        return matcher(meta, metaIndex);
      });
      if (index === -1) return null;
      usedStatePreservedIndexes.add(index);
      return statePreserved[index] || null;
    };

    const takePreservedMeta = (entry, idx) => {
      const fullSig = entrySignature(entry);
      if (fullSig) {
        const exact = takeMatchingPreservedMeta((meta) => preservedSignature(meta) === fullSig);
        if (exact) return exact;
      }

      const ageWeightSig = entryAgeWeightSignature(entry);
      if (ageWeightSig) {
        const byAgeWeight = takeMatchingPreservedMeta((meta) => preservedAgeWeightSignature(meta) === ageWeightSig);
        if (byAgeWeight) return byAgeWeight;
      }

      const ageKey = entryAgeKey(entry);
      if (ageKey) {
        const byAge = takeMatchingPreservedMeta((meta) => preservedAgeKey(meta) === ageKey);
        if (byAge) return byAge;
      }

      if (fullSig) {
        const exactState = takeMatchingStateMeta((meta) => preservedSignature(meta) === fullSig);
        if (exactState) return exactState;
      }

      if (ageWeightSig) {
        const stateByAgeWeight = takeMatchingStateMeta((meta) => preservedAgeWeightSignature(meta) === ageWeightSig);
        if (stateByAgeWeight) return stateByAgeWeight;
      }

      if (ageKey) {
        const stateByAge = takeMatchingStateMeta((meta) => preservedAgeKey(meta) === ageKey);
        if (stateByAge) return stateByAge;
      }

      if (!usedPreservedIndexes.has(idx) && preserved[idx] && typeof preserved[idx] === 'object') {
        usedPreservedIndexes.add(idx);
        const fallback = Object.assign({}, preserved[idx]);
        fallback.ghSync = false;
        fallback.ghId = '';
        return fallback;
      }
      return null;
    };

    const applyPreservedMeta = (row, meta, entry) => {
      const arrowEnableEl = row.querySelector('.adv-arrow-enable');
      const arrowCommentEl = row.querySelector('.adv-arrow-comment');
      const boneAgeValue = (meta && hasMeaningfulSyncValue(meta.boneAgeYears))
        ? meta.boneAgeYears
        : (toOptionalSyncNumber(entry?.boneAgeYears) !== null ? toOptionalSyncNumber(entry?.boneAgeYears) : '');
      setValue(row, '.adv-bone-age', boneAgeValue);
      if (arrowEnableEl) arrowEnableEl.checked = !!(meta && meta.arrowEnabled);
      if (arrowCommentEl) {
        arrowCommentEl.value = (meta && typeof meta.arrowComment === 'string') ? meta.arrowComment : '';
        arrowCommentEl.style.display = (arrowEnableEl && arrowEnableEl.checked) ? '' : 'none';
      }
      try {
        if (meta && meta.ghSync) row.setAttribute('data-gh-sync', 'true');
        else row.removeAttribute('data-gh-sync');
        if (meta && meta.ghId) row.setAttribute('data-gh-id', String(meta.ghId));
        else row.removeAttribute('data-gh-id');
      } catch (_) {}
      row.dataset.analysisOpen = meta && meta.analysisOpen ? 'true' : 'false';
    };

    if (!list.length) {
      window.addAdvMeasurementRow();
      const row = wrap.querySelector('.measure-row');
      if (row) applyPreservedMeta(row, takePreservedMeta(null, 0), null);
      try { if (typeof window.updateRemoveButtons === 'function') window.updateRemoveButtons(); } catch (_) {}
      try { if (typeof window.updateAdvAgeMax === 'function') window.updateAdvAgeMax(); } catch (_) {}
      try { if (typeof window.updateArrowInputsVisibility === 'function') window.updateArrowInputsVisibility(); } catch (_) {}
      return;
    }

    list.forEach((entry, idx) => {
      window.addAdvMeasurementRow();
      const row = wrap.querySelectorAll('.measure-row')[idx];
      if (!row) return;
      const months = Number.isFinite(Number(entry?.ageMonths))
        ? Math.round(Number(entry.ageMonths))
        : Math.round((Number(entry?.ageYears) || 0) * 12);
      const yearsPart = Math.floor(months / 12);
      const monthsPart = months - (yearsPart * 12);
      const preservedMeta = takePreservedMeta(entry, idx);
      const mergedHeight = (() => {
        const entryHeight = toOptionalSyncNumber(entry?.height);
        if (entryHeight !== null) return entryHeight;
        const preservedHeight = toOptionalSyncNumber(preservedMeta && preservedMeta.height);
        return preservedHeight !== null ? preservedHeight : '';
      })();
      const mergedWeight = (() => {
        const entryWeight = toOptionalSyncNumber(entry?.weight);
        if (entryWeight !== null) return entryWeight;
        const preservedWeight = toOptionalSyncNumber(preservedMeta && preservedMeta.weight);
        return preservedWeight !== null ? preservedWeight : '';
      })();
      setValue(row, '.adv-age-years', yearsPart);
      setValue(row, '.adv-age-months', monthsPart);
      setValue(row, '.adv-height', mergedHeight);
      setValue(row, '.adv-weight', mergedWeight);
      applyPreservedMeta(row, preservedMeta, entry);
    });

    try { if (typeof window.updateRemoveButtons === 'function') window.updateRemoveButtons(); } catch (_) {}
    try { if (typeof window.updateAdvAgeMax === 'function') window.updateAdvAgeMax(); } catch (_) {}
    try { if (typeof window.updateArrowInputsVisibility === 'function') window.updateArrowInputsVisibility(); } catch (_) {}
    try { if (typeof window.updateAdvancedMeasurementAnalysisControls === 'function') window.updateAdvancedMeasurementAnalysisControls(false); } catch (_) {}
  }

  function syncBasicGrowthRowsToAdvanced() {
    if (!isGrowthHistoryCrossSyncEnabled()) return false;
    if (isGrowthHistorySyncLockedFor('basic')) return false;
    if (!q('advMeasurements') || typeof window.addAdvMeasurementRow !== 'function') return false;
    return withGrowthHistorySyncLock('basic', () => {
      const sourceEntries = collectBasicGrowthMeasurementsForSync();
      const preservedRows = captureAdvancedRowsForSync();
      noteGrowthHistoryCount('basic', sourceEntries.length);
      noteGrowthHistoryCount('advanced', sourceEntries.length);
      rebuildAdvancedRowsFromShared(sourceEntries, preservedRows);
      rememberBasicHistorySignature(sourceEntries);
      if (typeof window.calculateGrowthAdvanced === 'function') {
        window.calculateGrowthAdvanced();
      }
    });
  }

  function syncAdvancedGrowthRowsToBasic() {
    if (!isGrowthHistoryCrossSyncEnabled()) return false;
    if (isGrowthHistorySyncLockedFor('advanced')) return false;
    const sourceEntries = collectAdvancedMeasurementsForSync();
    if (!shouldPropagateAdvancedHistory(sourceEntries.length)) return false;
    return withGrowthHistorySyncLock('advanced', () => {
      noteGrowthHistoryCount('advanced', sourceEntries.length);
      noteGrowthHistoryCount('basic', sourceEntries.length);
      rebuildBasicRowsFromShared(sourceEntries);
      rememberBasicHistorySignature(sourceEntries);
      calculateBasicGrowth();
    });
  }

  function reconcileGrowthHistoryModules(preferredSource) {
    if (!isGrowthHistoryCrossSyncEnabled()) return false;
    const basicEntries = collectBasicGrowthMeasurementsForSync();
    const advancedEntries = collectAdvancedMeasurementsForSync();
    const basicHasData = basicEntries.length > 0;
    const advancedHasData = advancedEntries.length > 0;

    if (preferredSource === 'advanced' && advancedHasData) {
      return syncAdvancedGrowthRowsToBasic();
    }
    if ((preferredSource === 'basic' && basicHasData) || (basicHasData && !advancedHasData)) {
      return syncBasicGrowthRowsToAdvanced();
    }
    if (advancedHasData && !basicHasData) {
      return syncAdvancedGrowthRowsToBasic();
    }
    return false;
  }

  function updateBasicGrowthRemoveButtons() {
    const rows = document.querySelectorAll('#basicGrowthMeasurements .measure-row');
    rows.forEach((row) => {
      const btn = row.querySelector('.remove-measure');
      if (btn) {
        btn.style.display = rows.length > 1 ? 'inline-block' : 'none';
      }
    });
  }

  function updateBasicGrowthAgeMax() {
    const ageYears = getAgeDecimalLocal();
    const inputs = document.querySelectorAll('#basicGrowthMeasurements .bg-age-years');
    inputs.forEach((inp) => {
      if (Number.isFinite(ageYears)) {
        inp.max = Math.max(0, Math.floor(ageYears));
      }
    });
  }

  function createBasicGrowthRow(prefill) {
    const container = q('basicGrowthMeasurements');
    if (!container) return null;

    const row = document.createElement('div');
    row.className = 'measure-row';
    row.innerHTML = `
      <div class="measure-row-sep"></div>
      <div class="measure-row-top">
        <label>Wiek (lata):
          <input type="number" class="bg-age-years" min="0" max="18" step="1">
        </label>
        <label>Wiek (miesiące):
          <input type="number" class="bg-age-months" min="0" max="11" step="1">
        </label>
        <label>Wzrost (cm):
          <input type="number" class="bg-height" min="40" max="250" step="0.1">
        </label>
      </div>
      <div class="measure-row-bot">
        <label>Waga (kg):
          <input type="number" class="bg-weight" min="1" max="200" step="0.1">
        </label>
        <button type="button" class="icon remove-measure" title="Usuń ten pomiar">&times;</button>
      </div>
    `;
    container.appendChild(row);

    const setValue = (selector, value) => {
      const el = row.querySelector(selector);
      if (!el) return;
      el.value = (value == null || Number.isNaN(value)) ? '' : String(value);
    };

    if (prefill && typeof prefill === 'object') {
      const months = Number.isFinite(prefill.ageMonths) ? prefill.ageMonths : Math.round((prefill.ageYears || 0) * 12);
      const yearsPart = Math.floor(months / 12);
      const monthsPart = months - (yearsPart * 12);
      setValue('.bg-age-years', yearsPart);
      setValue('.bg-age-months', monthsPart);
      setValue('.bg-height', prefill.height);
      setValue('.bg-weight', prefill.weight);
    }

    const removeBtn = row.querySelector('.remove-measure');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        try {
          row.remove();
        } catch (_) {}
        updateBasicGrowthRemoveButtons();
        calculateBasicGrowth();
      });
    }

    row.querySelectorAll('input').forEach((input) => {
      input.addEventListener('input', calculateBasicGrowth);
      input.addEventListener('change', calculateBasicGrowth);
    });

    updateBasicGrowthAgeMax();
    updateBasicGrowthRemoveButtons();
    return row;
  }

  function addBasicGrowthMeasurementRow(prefill) {
    createBasicGrowthRow(prefill || null);
    calculateBasicGrowth();
  }

  function getBasicGrowthChartState() {
    const ageYears = getAgeDecimalLocal();
    const height = num(q('height')?.value);
    const weight = num(q('weight')?.value);
    const visible = Number.isFinite(ageYears) && ageYears < 18;
    const defaultSource = (typeof window.getDefaultGrowthDataSource === 'function')
      ? window.getDefaultGrowthDataSource(ageYears, false)
      : (ageYears < (window.OLAF_DATA_MIN_AGE || 3) ? 'WHO' : 'OLAF');
    const selected = document.querySelector('input[name="dataSource"]:checked');
    const selectedSource = selected && selected.value ? String(selected.value).toUpperCase() : defaultSource;

    let source = selectedSource;
    if (source === 'PALCZEWSKA' || (source === 'OLAF' && ageYears < (window.OLAF_DATA_MIN_AGE || 3))) {
      source = defaultSource === 'PALCZEWSKA'
        ? (ageYears < (window.OLAF_DATA_MIN_AGE || 3) ? 'WHO' : 'OLAF')
        : defaultSource;
    }
    if (source !== 'OLAF' && source !== 'WHO') {
      source = ageYears < (window.OLAF_DATA_MIN_AGE || 3) ? 'WHO' : 'OLAF';
    }

    let supported = visible;
    let message = '';
    if (!visible) {
      supported = false;
      message = 'Moduł „Obliczenia wzrostowe” jest dostępny tylko dla dzieci i młodzieży poniżej 18 lat.';
    } else if (!(height > 0) || !(weight > 0)) {
      supported = false;
      message = 'Uzupełnij aktualny wzrost i wagę w karcie „Dane użytkownika”, aby wygenerować siatkę centylową.';
    }

    let hint = source === 'WHO'
      ? 'W module „Obliczenia wzrostowe” generowana jest siatka WHO.'
      : 'W module „Obliczenia wzrostowe” generowana jest siatka OLAF.';
    if (selectedSource === 'PALCZEWSKA') {
      hint = source === 'WHO'
        ? 'W tym module dostępne są siatki WHO lub OLAF. Zamiast Palczewskiej wybrano WHO.'
        : 'W tym module dostępne są siatki WHO lub OLAF. Zamiast Palczewskiej wybrano OLAF.';
    }

    return {
      visible,
      supported,
      source,
      label: source === 'WHO' ? 'Generuj siatkę WHO' : 'Generuj siatkę OLAF',
      hint,
      message
    };
  }

  function buildBasicGrowthChartPayload() {
    const ageYears = getAgeDecimalLocal();
    const ageMonths = Math.round((Number.isFinite(ageYears) ? ageYears : 0) * 12);
    const sex = q('sex') ? q('sex').value : 'M';
    const currentHeight = num(q('height')?.value);
    const currentWeight = num(q('weight')?.value);
    const measurements = collectBasicGrowthMeasurements();
    const name = getCurrentBasicGrowthName();

    return {
      measurements,
      growthVelocity: (window.basicGrowthData && typeof window.basicGrowthData.growthVelocity === 'number') ? window.basicGrowthData.growthVelocity : null,
      growthVelocityUsedLastYear: !!(window.basicGrowthData && window.basicGrowthData.growthVelocityUsedLastYear),
      growthVelocityContext: (window.basicGrowthData && window.basicGrowthData.growthVelocityContext) || '',
      growthVelocityGapM: (window.basicGrowthData && window.basicGrowthData.growthVelocityGapM) || null,
      currentAgeMonths: ageMonths,
      currentHeight,
      currentWeight,
      sex,
      name,
      sourceModule: 'basicGrowth',
      isLosingGrowth: !!(window.basicGrowthData && window.basicGrowthData.isLosingGrowth),
      targetHeight: null,
      targetStats: null,
      boneAgeMonths: null,
      currentArrowEnabled: false,
      currentArrowComment: ''
    };
  }

  function calculateBasicGrowth() {
    const resultsEl = q('basicGrowthResults');
    updateBasicGrowthAgeMax();

    const ageYears = getAgeDecimalLocal();
    if (!Number.isFinite(ageYears) || ageYears >= 18) {
      window.basicGrowthData = null;
      if (resultsEl) {
        resultsEl.innerHTML = '';
        resultsEl.style.borderColor = '';
        resultsEl.style.fontSize = '';
      }
      updateBasicGrowthSectionVisibility();
      return;
    }

    const ageMonths = Math.round(ageYears * 12);
    const sex = q('sex') ? q('sex').value : 'M';
    const heightVal = num(q('height')?.value);
    const weightVal = num(q('weight')?.value);
    const measurements = collectBasicGrowthMeasurements();
    const advName = getCurrentBasicGrowthName();

    let growthVelocity = null;
    let growthVelocityUsedLastYear = false;
    let growthVelocityContext = '';
    let growthVelocityGapM = null;

    const heightMeas = measurements
      .filter((m) => m && typeof m.height === 'number' && Number.isFinite(m.height))
      .sort((a, b) => a.ageMonths - b.ageMonths);

    if (heightMeas.length >= 1 && typeof heightVal === 'number' && Number.isFinite(heightVal)) {
      const currentAgeM = ageMonths;
      const currentH = heightVal;

      let prev = (typeof window.pickPrevForLastYear === 'function')
        ? window.pickPrevForLastYear(heightMeas, currentAgeM, 6, 12, 3)
        : null;
      if (prev && typeof window.velocityCmPerYear === 'function') {
        const v = window.velocityCmPerYear(prev.height, prev.ageMonths, currentH, currentAgeM);
        if (v !== null) {
          growthVelocity = v;
          growthVelocityUsedLastYear = true;
          growthVelocityGapM = currentAgeM - prev.ageMonths;
          growthVelocityContext = `ostatnich ${growthVelocityGapM} mies.`;
        }
      }

      if (growthVelocity === null) {
        const prevFallback = (typeof window.pickPrevFallback === 'function')
          ? window.pickPrevFallback(heightMeas, currentAgeM, 6)
          : null;
        if (prevFallback && typeof window.velocityCmPerYear === 'function') {
          const v = window.velocityCmPerYear(prevFallback.height, prevFallback.ageMonths, currentH, currentAgeM);
          if (v !== null) {
            growthVelocity = v;
            growthVelocityGapM = currentAgeM - prevFallback.ageMonths;
            growthVelocityUsedLastYear = (growthVelocityGapM >= 6 && growthVelocityGapM <= 8);
            growthVelocityContext = (typeof window.formatVelocityContext === 'function')
              ? window.formatVelocityContext(prevFallback.ageMonths, currentAgeM, false)
              : '';
          }
        }
      }
    }

    let isLosingGrowth = false;
    if (heightMeas.length >= 1 && typeof heightVal === 'number' && Number.isFinite(heightVal)
        && typeof window.calcPercentileStats === 'function'
        && typeof window.getCentileChannel === 'function') {
      const first = heightMeas[0];
      const statsFirst = window.calcPercentileStats(first.height, sex, first.ageYears, 'h');
      const statsCurr = window.calcPercentileStats(heightVal, sex, ageYears, 'h');
      if (statsFirst && statsCurr) {
        const chFirst = window.getCentileChannel(statsFirst.percentile);
        const chCurr = window.getCentileChannel(statsCurr.percentile);
        if (chFirst - chCurr >= 2) {
          isLosingGrowth = true;
        }
      }
    }

    let isSlowVelocity = false;
    let slowNormLabel = '';
    if (typeof window.getVelocityThreshold === 'function') {
      const thr = window.getVelocityThreshold(ageMonths);
      if (thr && growthVelocity !== null && Number.isFinite(growthVelocity) && growthVelocityUsedLastYear) {
        if (growthVelocity < thr.threshold) {
          isSlowVelocity = true;
        }
        slowNormLabel = thr.label;
      }
    }

    window.basicGrowthData = {
      measurements,
      growthVelocity,
      growthVelocityUsedLastYear,
      growthVelocityContext,
      growthVelocityGapM,
      currentAgeMonths: ageMonths,
      currentHeight: heightVal,
      currentWeight: weightVal,
      sex,
      name: advName || '',
      isLosingGrowth,
      isSlowVelocity
    };

    if (resultsEl) {
      let html = '';
      if (growthVelocity !== null && Number.isFinite(growthVelocity)) {
        if (growthVelocityUsedLastYear) {
          const m = (typeof growthVelocityGapM === 'number' && growthVelocityGapM >= 6) ? growthVelocityGapM : null;
          const monthInfo = m ? ` (z ostatnich ${m} mies.)` : '';
          html += `<p><strong>Aktualne tempo wzrastania${monthInfo}:</strong> ${growthVelocity.toFixed(1).replace('.', ',')} cm/rok</p>`;
        } else {
          const ctx = growthVelocityContext ? ` <span style="opacity:0.85;">(obliczono jako średnią z ${growthVelocityContext})</span>` : '';
          html += `<p><strong>Tempo wzrastania:</strong> ${growthVelocity.toFixed(1).replace('.', ',')} cm/rok${ctx}</p>`;
        }
      } else {
        html += '<p><em>Brak wystarczających danych (wymagane ≥2 pomiary wzrostu oddalone o ≥6 miesięcy), aby obliczyć tempo wzrastania.</em></p>';
      }

      if (isLosingGrowth) {
        html += '<p style="color: var(--danger); font-weight:600;">Z analizy siatki centylowej wynika utrata tempa wzrastania, wskazana konsultacja endokrynologiczna, <a href="https://vildaclinic.pl" target="_blank" rel="noopener noreferrer" style="color: var(--danger); text-decoration: underline;">umów wizytę</a></p>';
      }

      if (isSlowVelocity) {
        const normInfo = slowNormLabel ? ` <span style="font-weight:400;">(norma: ${slowNormLabel})</span>` : '';
        html += `<p style="color: var(--danger); font-weight:600;">Z analizy siatki centylowej wynika słabe tempo wzrastania dziecka, wskazana konsultacja endokrynologiczna, <a href="https://vildaclinic.pl" target="_blank" rel="noopener noreferrer" style="color: var(--danger); text-decoration: underline;">umów wizytę</a>${normInfo}</p>`;
      }

      resultsEl.innerHTML = html;
      try {
        if (typeof window.clearPulse === 'function') window.clearPulse(resultsEl);
      } catch (_) {}
      resultsEl.style.borderColor = '';
      resultsEl.style.fontSize = '';
      if (isSlowVelocity || isLosingGrowth) {
        resultsEl.style.borderColor = 'var(--danger)';
        resultsEl.style.fontSize = '1.15rem';
        try {
          if (typeof window.applyPulse === 'function') window.applyPulse(resultsEl, 'danger');
        } catch (_) {}
      } else {
        resultsEl.style.borderColor = 'var(--primary)';
      }
    }

    updateBasicGrowthButtonState();

    if (isGrowthHistoryCrossSyncEnabled()) {
      try {
        const shouldPropagate = shouldPropagateBasicHistory(measurements.length);
        const historyChanged = hasBasicHistoryChangedSinceLastSync(measurements);
        const advancedCount = collectAdvancedMeasurementsForSync().length;
        const advancedMissing = measurements.length > 0 && advancedCount === 0;
        if (shouldPropagate && (historyChanged || advancedMissing)) {
          syncBasicGrowthRowsToAdvanced();
        }
      } catch (_) {}
    } else {
      noteGrowthHistoryCount('basic', measurements.length);
    }
  }

  async function generateBasicGrowthChart() {
    const state = getBasicGrowthChartState();
    if (!state.supported) {
      if (state.message) alert(state.message);
      return;
    }
    if (typeof window.generateCentileChart !== 'function') {
      alert('Generator siatek centylowych nie jest jeszcze gotowy. Odśwież stronę i spróbuj ponownie.');
      return;
    }

    const payload = buildBasicGrowthChartPayload();
    const previousAdvanced = (typeof window.advancedGrowthData !== 'undefined') ? window.advancedGrowthData : null;
    const previousOverride = (typeof window.overrideCentileSource !== 'undefined') ? window.overrideCentileSource : undefined;
    const previousStandardVisual = (typeof window.forceStandardCentileChartStyle !== 'undefined')
      ? window.forceStandardCentileChartStyle
      : undefined;
    try {
      window.advancedGrowthData = cloneData(payload);
      window.overrideCentileSource = state.source;
      window.forceStandardCentileChartStyle = true;
      await window.generateCentileChart();
    } finally {
      window.advancedGrowthData = previousAdvanced;
      if (typeof previousOverride === 'undefined') {
        try { delete window.overrideCentileSource; } catch (_) { window.overrideCentileSource = undefined; }
      } else {
        window.overrideCentileSource = previousOverride;
      }
      if (typeof previousStandardVisual === 'undefined') {
        try { delete window.forceStandardCentileChartStyle; } catch (_) { window.forceStandardCentileChartStyle = undefined; }
      } else {
        window.forceStandardCentileChartStyle = previousStandardVisual;
      }
    }
  }

  function updateBasicGrowthButtonState() {
    const btn = q('generateCentileChartBasic');
    if (!btn) return;
    const state = getBasicGrowthChartState();
    btn.textContent = state.label || 'Generuj siatkę centylową';
    btn.disabled = !state.supported;
    btn.title = state.supported ? (state.hint || '') : (state.message || '');
  }

  function updateBasicGrowthSectionVisibility() {
    const section = q('growthCalculationsSection');
    const form = q('growthCalculationsForm');
    const ageYears = getAgeDecimalLocal();
    const visible = Number.isFinite(ageYears) && ageYears < 18;
    if (section) section.style.display = visible ? 'block' : 'none';
    if (!visible && form) form.style.display = 'none';
    updateBasicGrowthButtonState();
  }

  let syncGuard = false;

  function mirrorNameValue(sourceKey) {
    if (syncGuard) return;
    const nameEl = q('name');
    const advEl = q('advName');
    const basicEl = q('basicGrowthName');
    const map = {
      name: nameEl,
      adv: advEl,
      basic: basicEl
    };
    const source = map[sourceKey] || nameEl || advEl || basicEl;
    if (!source) return;
    const value = typeof source.value === 'string' ? source.value : '';
    const lockState = !!(nameEl && nameEl.disabled);

    syncGuard = true;
    try {
      [nameEl, advEl, basicEl].forEach((el) => {
        if (!el || el === source) return;
        if (el.value !== value) {
          el.value = value;
          try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
        }
      });
      if (advEl) advEl.disabled = lockState;
      if (basicEl) basicEl.disabled = lockState;
    } finally {
      syncGuard = false;
    }
  }

  function wrapSyncNames() {
    window.syncNames = function (source) {
      mirrorNameValue(source === 'adv' ? 'adv' : source === 'basic' ? 'basic' : 'name');
      try {
        if (typeof window.updateSaveBtnVisibility === 'function') {
          window.updateSaveBtnVisibility();
        }
      } catch (_) {}
    };
  }

  function restoreCollapsedState() {
    try {
      const states = JSON.parse(localStorage.getItem('cardCollapseState') || '{}');
      const form = q('growthCalculationsForm');
      if (!form) return;
      if (states.growthCalculationsForm === false) {
        form.style.display = 'none';
      } else if (states.growthCalculationsForm === true) {
        form.style.display = 'block';
      }
    } catch (_) {}
  }

  function persistCollapsedState() {
    const form = q('growthCalculationsForm');
    if (!form) return;
    try {
      const states = JSON.parse(localStorage.getItem('cardCollapseState') || '{}');
      const computed = window.getComputedStyle(form);
      states.growthCalculationsForm = computed.display !== 'none';
      localStorage.setItem('cardCollapseState', JSON.stringify(states));
    } catch (_) {}
  }

  function rehydrateBasicGrowthFromState() {
    const wrap = q('basicGrowthMeasurements');
    if (!wrap) return;

    let prevSuspend = false;
    try {
      prevSuspend = !!window.__vildaSuspendGrowthHistoryCrossSync;
      window.__vildaSuspendGrowthHistoryCrossSync = true;
    } catch (_) {}

    try {
      wrap.innerHTML = '';
      const arr = (window.basicGrowthData && Array.isArray(window.basicGrowthData.measurements))
        ? window.basicGrowthData.measurements.slice().sort((a, b) => {
            const am = (typeof a.ageMonths === 'number') ? a.ageMonths : Math.round((a.ageYears || 0) * 12);
            const bm = (typeof b.ageMonths === 'number') ? b.ageMonths : Math.round((b.ageYears || 0) * 12);
            return am - bm;
          })
        : [];

      if (!arr.length) {
        createBasicGrowthRow();
        updateBasicGrowthRemoveButtons();
        updateBasicGrowthAgeMax();
        rememberBasicHistorySignature([]);
        return;
      }

      arr.forEach((m) => createBasicGrowthRow(m));
      updateBasicGrowthRemoveButtons();
      updateBasicGrowthAgeMax();
      rememberBasicHistorySignature(arr);
    } finally {
      try { window.__vildaSuspendGrowthHistoryCrossSync = prevSuspend; } catch (_) {}
    }

    calculateBasicGrowth();
  }

  function setupBasicGrowthModule() {
    const section = q('growthCalculationsSection');
    const form = q('growthCalculationsForm');
    const toggleBtn = q('toggleGrowthCalculations');
    const addBtn = q('basicGrowthAddMeasurementBtn');
    const genBtn = q('generateCentileChartBasic');
    const basicNameEl = q('basicGrowthName');

    if (!section || !form || !toggleBtn || !addBtn || !genBtn) return;

    wrapSyncNames();

    toggleBtn.addEventListener('click', () => {
      form.style.display = (form.style.display === 'none' || form.style.display === '') ? 'block' : 'none';
      persistCollapsedState();
    });

    addBtn.addEventListener('click', () => addBasicGrowthMeasurementRow());
    genBtn.addEventListener('click', generateBasicGrowthChart);

    if (basicNameEl) {
      basicNameEl.addEventListener('input', () => {
        if (typeof window.syncNames === 'function') {
          window.syncNames('basic');
        } else {
          mirrorNameValue('basic');
        }
        calculateBasicGrowth();
      });
      basicNameEl.addEventListener('change', calculateBasicGrowth);
    }

    const nameEl = q('name');
    const advEl = q('advName');
    if (nameEl) {
      nameEl.addEventListener('change', () => mirrorNameValue('name'));
    }
    if (advEl) {
      advEl.addEventListener('change', () => mirrorNameValue('adv'));
    }

    ['age', 'ageMonths', 'height', 'weight', 'sex'].forEach((id) => {
      const el = q(id);
      if (!el) return;
      el.addEventListener('input', () => {
        updateBasicGrowthSectionVisibility();
        calculateBasicGrowth();
      });
      el.addEventListener('change', () => {
        updateBasicGrowthSectionVisibility();
        calculateBasicGrowth();
      });
    });

    document.querySelectorAll('input[name="dataSource"]').forEach((radio) => {
      radio.addEventListener('change', updateBasicGrowthButtonState);
    });
    const resultsModeToggle = q('resultsModeToggle');
    if (resultsModeToggle) {
      resultsModeToggle.addEventListener('change', () => {
        updateBasicGrowthButtonState();
        window.setTimeout(() => {
          try { reconcileGrowthHistoryModules('basic'); } catch (_) {}
        }, 0);
      });
    }
    const clearAllBtn = q('clearAllDataBtn');
    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', () => {
        try { window.basicGrowthData = { measurements: [] }; } catch (_) {}
      });
    }

    restoreCollapsedState();
    mirrorNameValue(nameEl && nameEl.value ? 'name' : advEl && advEl.value ? 'adv' : 'basic');

    if (window.basicGrowthData && Array.isArray(window.basicGrowthData.measurements) && window.basicGrowthData.measurements.length) {
      rehydrateBasicGrowthFromState();
    } else {
      rememberBasicHistorySignature([]);
      addBasicGrowthMeasurementRow();
    }

    updateBasicGrowthSectionVisibility();
    calculateBasicGrowth();
    try { reconcileGrowthHistoryModules('basic'); } catch (_) {}
  }

  try {
    window.vildaRehydrateBasicGrowthFromState = rehydrateBasicGrowthFromState;
    window.calculateBasicGrowth = calculateBasicGrowth;
    window.addBasicGrowthMeasurementRow = addBasicGrowthMeasurementRow;
    window.syncBasicGrowthRowsToAdvanced = syncBasicGrowthRowsToAdvanced;
    window.syncAdvancedGrowthRowsToBasic = syncAdvancedGrowthRowsToBasic;
    window.reconcileGrowthHistoryModules = reconcileGrowthHistoryModules;
  } catch (_) {}

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupBasicGrowthModule);
  } else {
    setupBasicGrowthModule();
  }
})();
