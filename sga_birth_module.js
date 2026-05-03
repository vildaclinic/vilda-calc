
/*
 * Moduł SGA (small for gestational age).
 * Oblicza SDS masy urodzeniowej, długości ciała i obwodu głowy względem wieku ciążowego.
 * Obsługiwane źródła:
 * - Niklasson / Albertsson-Wikland 2008,
 * - INTERGROWTH-21st (24+0 do 42+6 tc),
 * - Malewski i wsp. (populacja polska, lata 1986–1994; tylko masa urodzeniowa, 22–43 tc).
 *
 * Uwaga implementacyjna:
 * - dla tc 24–40 zastosowano wygładzone wartości z tabeli 4 publikacji Niklasson,
 * - dla tc 41–42 zastosowano tygodniowe wartości tabelaryczne z tabel 1–3,
 *   ponieważ tabela 4 kończy się na 40 tc,
 * - masa urodzeniowa w źródle Niklasson liczona jest w skali log10(kg),
 * - źródło Malewski obejmuje wyłącznie masę urodzeniową; wartości dla dodatkowych dni
 *   są interpolowane liniowo między kolejnymi tygodniami, a brakujące 5. i 95. centyle
 *   w najwcześniejszych tygodniach oszacowano z podanej średniej i SD wyłącznie na potrzeby
 *   obliczeń percentyla/SDS.
 */
(function () {
  const NIKLASSON_SOURCE_LABEL = 'Niklasson, A., Albertsson-Wikland, K. Continuous growth reference from 24th week of gestation to 24 months by gender. BMC Pediatr 8, 8 (2008). https://doi.org/10.1186/1471-2431-8-8';
  const INTERGROWTH_SOURCE_LABEL = 'INTERGROWTH-21st International Newborn Size References/Standards (24+0-42+6 tc): Villar et al. Lancet 2014;384:857-68 oraz Villar et al. Lancet 2016;387:844-5.';
  const MALEWSKI_SOURCE_LABEL = 'Malewski i wsp. (populacja polska, lata 1986–1994) – tabela masy urodzeniowej wg wieku ciążowego.';
  const INTERGROWTH_Z_GRID = [-3, -2, -1, 0, 1, 2, 3];
  const MALEWSKI_PERCENTILE_Z_GRID = [
    -1.6448536269514729,
    -1.2815515655446004,
    -0.6744897501960817,
    0,
    0.6744897501960817,
    1.2815515655446004,
    1.6448536269514722
  ];
  const SGA_SOURCE_CONFIG = {
    niklasson: {
      shortLabel: 'Niklasson / Albertsson-Wikland',
      helperLabel: 'Wyniki obliczone wg Niklasson 2008.',
      sourceLabel: NIKLASSON_SOURCE_LABEL
    },
    intergrowth: {
      shortLabel: 'INTERGROWTH-21st',
      helperLabel: 'Wyniki obliczone wg INTERGROWTH-21st.',
      sourceLabel: INTERGROWTH_SOURCE_LABEL
    },
    malewski: {
      shortLabel: 'Malewski i wsp. (PL, masa)',
      helperLabel: 'Wyniki obliczone wg tabeli Malewski i wsp.',
      sourceLabel: MALEWSKI_SOURCE_LABEL
    }
  };
  const SGA_SOURCE_KEYS = ['niklasson', 'intergrowth', 'malewski'];
  const SGA_BIRTH_REFS = {
  "male": {
    "24": {
      "lengthMean": 31.9,
      "lengthSd": 1.3,
      "weightMean": -0.165,
      "weightSd": 0.064,
      "headMean": 22.4,
      "headSd": 1.5
    },
    "25": {
      "lengthMean": 33.7,
      "lengthSd": 1.3,
      "weightMean": -0.092,
      "weightSd": 0.063,
      "headMean": 23.6,
      "headSd": 1.5
    },
    "26": {
      "lengthMean": 35.4,
      "lengthSd": 1.3,
      "weightMean": -0.023,
      "weightSd": 0.062,
      "headMean": 24.7,
      "headSd": 1.5
    },
    "27": {
      "lengthMean": 37.0,
      "lengthSd": 1.3,
      "weightMean": 0.041,
      "weightSd": 0.061,
      "headMean": 25.8,
      "headSd": 1.5
    },
    "28": {
      "lengthMean": 38.5,
      "lengthSd": 1.4,
      "weightMean": 0.1,
      "weightSd": 0.061,
      "headMean": 26.8,
      "headSd": 1.5
    },
    "29": {
      "lengthMean": 39.9,
      "lengthSd": 1.4,
      "weightMean": 0.156,
      "weightSd": 0.06,
      "headMean": 27.8,
      "headSd": 1.4
    },
    "30": {
      "lengthMean": 41.2,
      "lengthSd": 1.4,
      "weightMean": 0.207,
      "weightSd": 0.059,
      "headMean": 28.7,
      "headSd": 1.4
    },
    "31": {
      "lengthMean": 42.5,
      "lengthSd": 1.4,
      "weightMean": 0.256,
      "weightSd": 0.058,
      "headMean": 29.6,
      "headSd": 1.4
    },
    "32": {
      "lengthMean": 43.7,
      "lengthSd": 1.4,
      "weightMean": 0.301,
      "weightSd": 0.058,
      "headMean": 30.4,
      "headSd": 1.4
    },
    "33": {
      "lengthMean": 44.8,
      "lengthSd": 1.4,
      "weightMean": 0.343,
      "weightSd": 0.057,
      "headMean": 31.2,
      "headSd": 1.4
    },
    "34": {
      "lengthMean": 45.9,
      "lengthSd": 1.5,
      "weightMean": 0.382,
      "weightSd": 0.056,
      "headMean": 32.0,
      "headSd": 1.4
    },
    "35": {
      "lengthMean": 47.0,
      "lengthSd": 1.5,
      "weightMean": 0.419,
      "weightSd": 0.056,
      "headMean": 32.7,
      "headSd": 1.4
    },
    "36": {
      "lengthMean": 48.0,
      "lengthSd": 1.5,
      "weightMean": 0.453,
      "weightSd": 0.055,
      "headMean": 33.4,
      "headSd": 1.4
    },
    "37": {
      "lengthMean": 48.9,
      "lengthSd": 1.5,
      "weightMean": 0.485,
      "weightSd": 0.055,
      "headMean": 34.0,
      "headSd": 1.4
    },
    "38": {
      "lengthMean": 49.8,
      "lengthSd": 1.5,
      "weightMean": 0.515,
      "weightSd": 0.054,
      "headMean": 34.7,
      "headSd": 1.3
    },
    "39": {
      "lengthMean": 50.7,
      "lengthSd": 1.6,
      "weightMean": 0.544,
      "weightSd": 0.053,
      "headMean": 35.2,
      "headSd": 1.3
    },
    "40": {
      "lengthMean": 51.6,
      "lengthSd": 1.6,
      "weightMean": 0.57,
      "weightSd": 0.053,
      "headMean": 35.8,
      "headSd": 1.3
    },
    "41": {
      "lengthMean": 51.89,
      "lengthSd": 1.87,
      "weightMean": 0.58,
      "weightSd": 0.05,
      "headMean": 35.71,
      "headSd": 1.35
    },
    "42": {
      "lengthMean": 52.4,
      "lengthSd": 1.91,
      "weightMean": 0.59,
      "weightSd": 0.05,
      "headMean": 36.05,
      "headSd": 1.36
    }
  },
  "female": {
    "24": {
      "lengthMean": 32.1,
      "lengthSd": 1.2,
      "weightMean": -0.178,
      "weightSd": 0.069,
      "headMean": 22.7,
      "headSd": 1.5
    },
    "25": {
      "lengthMean": 33.8,
      "lengthSd": 1.2,
      "weightMean": -0.105,
      "weightSd": 0.067,
      "headMean": 23.7,
      "headSd": 1.5
    },
    "26": {
      "lengthMean": 35.3,
      "lengthSd": 1.3,
      "weightMean": -0.036,
      "weightSd": 0.066,
      "headMean": 24.8,
      "headSd": 1.5
    },
    "27": {
      "lengthMean": 36.8,
      "lengthSd": 1.3,
      "weightMean": 0.027,
      "weightSd": 0.065,
      "headMean": 25.8,
      "headSd": 1.5
    },
    "28": {
      "lengthMean": 38.2,
      "lengthSd": 1.3,
      "weightMean": 0.086,
      "weightSd": 0.064,
      "headMean": 26.7,
      "headSd": 1.4
    },
    "29": {
      "lengthMean": 39.6,
      "lengthSd": 1.3,
      "weightMean": 0.141,
      "weightSd": 0.063,
      "headMean": 27.6,
      "headSd": 1.4
    },
    "30": {
      "lengthMean": 40.8,
      "lengthSd": 1.3,
      "weightMean": 0.193,
      "weightSd": 0.062,
      "headMean": 28.5,
      "headSd": 1.4
    },
    "31": {
      "lengthMean": 42.0,
      "lengthSd": 1.4,
      "weightMean": 0.241,
      "weightSd": 0.061,
      "headMean": 29.3,
      "headSd": 1.4
    },
    "32": {
      "lengthMean": 43.2,
      "lengthSd": 1.4,
      "weightMean": 0.285,
      "weightSd": 0.06,
      "headMean": 30.0,
      "headSd": 1.4
    },
    "33": {
      "lengthMean": 44.3,
      "lengthSd": 1.4,
      "weightMean": 0.327,
      "weightSd": 0.059,
      "headMean": 30.8,
      "headSd": 1.4
    },
    "34": {
      "lengthMean": 45.3,
      "lengthSd": 1.4,
      "weightMean": 0.366,
      "weightSd": 0.058,
      "headMean": 31.5,
      "headSd": 1.4
    },
    "35": {
      "lengthMean": 46.3,
      "lengthSd": 1.4,
      "weightMean": 0.402,
      "weightSd": 0.057,
      "headMean": 32.1,
      "headSd": 1.3
    },
    "36": {
      "lengthMean": 47.3,
      "lengthSd": 1.5,
      "weightMean": 0.436,
      "weightSd": 0.057,
      "headMean": 32.8,
      "headSd": 1.3
    },
    "37": {
      "lengthMean": 48.2,
      "lengthSd": 1.5,
      "weightMean": 0.468,
      "weightSd": 0.056,
      "headMean": 33.4,
      "headSd": 1.3
    },
    "38": {
      "lengthMean": 49.1,
      "lengthSd": 1.5,
      "weightMean": 0.498,
      "weightSd": 0.055,
      "headMean": 34.0,
      "headSd": 1.3
    },
    "39": {
      "lengthMean": 50.0,
      "lengthSd": 1.5,
      "weightMean": 0.525,
      "weightSd": 0.054,
      "headMean": 34.5,
      "headSd": 1.3
    },
    "40": {
      "lengthMean": 50.8,
      "lengthSd": 1.5,
      "weightMean": 0.551,
      "weightSd": 0.054,
      "headMean": 35.0,
      "headSd": 1.3
    },
    "41": {
      "lengthMean": 51.01,
      "lengthSd": 1.83,
      "weightMean": 0.57,
      "weightSd": 0.05,
      "headMean": 35.04,
      "headSd": 1.28
    },
    "42": {
      "lengthMean": 51.44,
      "lengthSd": 1.85,
      "weightMean": 0.57,
      "weightSd": 0.05,
      "headMean": 35.32,
      "headSd": 1.3
    }
  }
};

  function parseLocaleNumber(value) {
    if (value == null) return null;
    const normalized = String(value).trim().replace(/\s+/g, '').replace(',', '.');
    if (!normalized) return null;
    const num = Number(normalized);
    return Number.isFinite(num) ? num : NaN;
  }

  function toFiniteNumberOrNull(value) {
    if (value == null || value === '') return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }


  function sgaBirthSetTrustedHtml(element, markup, context) {
    if (!element) return false;
    const html = markup == null ? '' : String(markup);
    try {
      if (typeof window !== 'undefined' && window.VildaHtml && typeof window.VildaHtml.setTrustedHtml === 'function') {
        return window.VildaHtml.setTrustedHtml(element, html, { context: context || 'sgaBirth' });
      }
      element.textContent = html;
      return true;
    } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('sga_birth_module.js', _, { helper: 'sgaBirthSetTrustedHtml', context: context || '' });
      }
      return false;
    }
  }

  function sgaBirthClearHtml(element) {
    if (!element) return false;
    try {
      if (typeof window !== 'undefined' && window.VildaHtml && typeof window.VildaHtml.clearHtml === 'function') return window.VildaHtml.clearHtml(element);
      element.textContent = '';
      return true;
    } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('sga_birth_module.js', _, { helper: 'sgaBirthClearHtml' });
      }
      return false;
    }
  }

  function formatNumber(value, decimals) {
    if (!Number.isFinite(value)) return '–';
    return value.toLocaleString('pl-PL', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  function formatNumberTrim(value, maxDecimals) {
    if (!Number.isFinite(value)) return '–';
    return value.toLocaleString('pl-PL', {
      minimumFractionDigits: 0,
      maximumFractionDigits: maxDecimals
    });
  }

  function normalCdf(z) {
    if (!Number.isFinite(z)) return NaN;
    const absZ = Math.abs(z);
    const t = 1 / (1 + 0.2316419 * absZ);
    const d = 0.3989422804014327 * Math.exp(-absZ * absZ / 2);
    const poly = ((((1.330274429 * t - 1.821255978) * t + 1.781477937) * t - 0.356563782) * t + 0.319381530) * t;
    const p = 1 - d * poly;
    return z >= 0 ? p : 1 - p;
  }

  function percentileLabel(z) {
    const p = normalCdf(z) * 100;
    if (!Number.isFinite(p)) return '–';
    if (p < 0.1) return '<0,1 c';
    if (p > 99.9) return '>99,9 c';
    return formatNumber(p, 1) + ' c';
  }

  function interpretSds(z) {
    if (!Number.isFinite(z)) return '–';
    if (z < -2) return 'poniżej -2 SDS';
    if (z > 2) return 'powyżej +2 SDS';
    return 'w zakresie referencyjnym';
  }

  function escapeHtml(value) {
    if (typeof window !== 'undefined' && window.VildaHtml && typeof window.VildaHtml.escapeHtml === 'function') {
      return window.VildaHtml.escapeHtml(arguments[0]);
    }
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getInterpolatedRef(sex, weeks, days) {
    const sexKey = sex === 'female' ? 'female' : 'male';
    const bySex = SGA_BIRTH_REFS[sexKey];
    const base = bySex[String(weeks)];
    if (!base) return null;
    if (!Number.isFinite(days) || days <= 0 || weeks >= 42) {
      return Object.assign({}, base);
    }
    const next = bySex[String(weeks + 1)];
    if (!next) return Object.assign({}, base);
    const ratio = Math.min(Math.max(days / 7, 0), 1);
    const keys = ['lengthMean', 'lengthSd', 'weightMean', 'weightSd', 'headMean', 'headSd'];
    const out = {};
    keys.forEach((key) => {
      out[key] = base[key] + ratio * (next[key] - base[key]);
    });
    return out;
  }

  function getIntergrowthRow(sex, metric, weeks, days) {
    try {
      const root = (typeof window !== 'undefined' && window.SGA_INTERGROWTH_ZS && typeof window.SGA_INTERGROWTH_ZS === 'object')
        ? window.SGA_INTERGROWTH_ZS
        : null;
      const sexKey = sex === 'female' ? 'female' : 'male';
      const bySex = root && root[sexKey] && typeof root[sexKey] === 'object' ? root[sexKey] : null;
      const byMetric = bySex && bySex[metric] && typeof bySex[metric] === 'object' ? bySex[metric] : null;
      const key = String(weeks) + '+' + String(days);
      return byMetric && Array.isArray(byMetric[key]) ? byMetric[key].slice() : null;
    } catch (_) {
      return null;
    }
  }

  function computeWeightSds(weightG, ref) {
    const weightKg = weightG / 1000;
    if (!Number.isFinite(weightKg) || weightKg <= 0) return null;
    return (Math.log10(weightKg) - ref.weightMean) / ref.weightSd;
  }

  function computeLinearSds(value, mean, sd) {
    if (!Number.isFinite(value) || !Number.isFinite(mean) || !Number.isFinite(sd) || sd <= 0) return null;
    return (value - mean) / sd;
  }

  function interpolateOnSegment(value, x0, x1, y0, y1) {
    if (!Number.isFinite(value) || !Number.isFinite(x0) || !Number.isFinite(x1) || !Number.isFinite(y0) || !Number.isFinite(y1)) {
      return null;
    }
    if (x0 === x1) return y0;
    return y0 + ((value - x0) / (x1 - x0)) * (y1 - y0);
  }

  function zFromAnchorTable(value, anchors, zGrid) {
    const activeGrid = Array.isArray(zGrid) && zGrid.length === anchors.length ? zGrid : INTERGROWTH_Z_GRID;
    if (!Number.isFinite(value) || !Array.isArray(anchors) || anchors.length !== activeGrid.length) {
      return null;
    }
    const nums = anchors.map((entry) => Number(entry));
    if (nums.some((entry) => !Number.isFinite(entry))) return null;

    if (value <= nums[0]) {
      return interpolateOnSegment(value, nums[0], nums[1], activeGrid[0], activeGrid[1]);
    }

    for (let i = 0; i < nums.length - 1; i += 1) {
      if (value <= nums[i + 1]) {
        return interpolateOnSegment(value, nums[i], nums[i + 1], activeGrid[i], activeGrid[i + 1]);
      }
    }

    const last = nums.length - 1;
    return interpolateOnSegment(value, nums[last - 1], nums[last], activeGrid[last - 1], activeGrid[last]);
  }

  function sexLabelForText(sex, form) {
    const isFemale = sex === 'female';
    const forms = isFemale
      ? { singular: 'dziewczynek', noun: 'dziewczynka', short: 'dziewczynek' }
      : { singular: 'chłopców', noun: 'chłopiec', short: 'chłopców' };
    return forms[form] || forms.short;
  }

  function sourceTitle(sourceKey) {
    return SGA_SOURCE_CONFIG[sourceKey] ? SGA_SOURCE_CONFIG[sourceKey].shortLabel : sourceKey;
  }

  function sourceRangeText(sourceKey) {
    if (sourceKey === 'niklasson') return '24–42 tc';
    if (sourceKey === 'intergrowth') return '24+0 do 42+6 tc';
    if (sourceKey === 'malewski') return '22–43 tc (tylko masa urodzeniowa)';
    return '';
  }

  function metricCardHtml(title, valueLabel, sds, interpretation) {
    return `
      <div class="sga-birth-result-card">
        <h4>${escapeHtml(title)}</h4>
        <dl>
          <div><dt>Wartość</dt><dd>${escapeHtml(valueLabel)}</dd></div>
          <div><dt>SDS</dt><dd>${formatNumber(sds, 2)}</dd></div>
          <div><dt>Percentyl</dt><dd>${percentileLabel(sds)}</dd></div>
          <div><dt>Ocena</dt><dd>${escapeHtml(interpretation)}</dd></div>
        </dl>
      </div>
    `;
  }

  function buildMetricResult(title, valueLabel, sds, interpretation) {
    return {
      title,
      valueLabel,
      sds,
      percentile: percentileLabel(sds),
      interpretation,
      unavailable: false
    };
  }

  function buildUnavailableMetricResult(title, interpretation) {
    return {
      title,
      valueLabel: '–',
      sds: null,
      percentile: '–',
      interpretation: interpretation || 'Niedostępne w tym źródle',
      unavailable: true
    };
  }

  function setupSgaBirthModule() {
    const buttonWrapper = document.getElementById('sgaBirthButtonWrapper');
    const toggleBtn = document.getElementById('toggleSgaBirth');
    const card = document.getElementById('sgaBirthCard');
    const computeBtn = document.getElementById('computeSgaBirth');
    const resetBtn = document.getElementById('resetSgaBirth');
    const messageEl = document.getElementById('sgaBirthMessage');
    const resultsEl = document.getElementById('sgaBirthResults');
    const zscoreCard = document.getElementById('zscoreCard');
    let toastTimer = null;

    if (!toggleBtn || !card || !messageEl || !resultsEl) return;

    const sourceInputs = Array.from(document.querySelectorAll('input[name="sgaBirthSource"]'));
    const sexInputs = Array.from(document.querySelectorAll('input[name="sgaBirthSex"]'));
    const gaWeeksSelect = document.getElementById('sgaBirthWeeks');
    const gaDaysSelect = document.getElementById('sgaBirthDays');
    const birthWeightInput = document.getElementById('sgaBirthWeight');
    const birthLengthInput = document.getElementById('sgaBirthLength');
    const birthHeadInput = document.getElementById('sgaBirthHead');

    function hideToast() {
      const existing = document.getElementById('sgaBirthToast');
      clearTimeout(toastTimer);
      if (existing) {
        try { existing.remove(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('sga_birth_module.js', _, { line: 582 });
    }
  }
      }
    }

    function isElementVisible(el) {
      if (!el) return false;
      if (el.style && el.style.display === 'none') return false;
      try {
        return window.getComputedStyle(el).display !== 'none';
      } catch (_) {
        return el.style.display !== 'none' && el.style.display !== '';
      }
    }

    function setInlineOrder(el, value) {
      if (!el) return;
      el.style.order = value == null ? '' : String(value);
    }

    function syncZscoreSgaPairLayout() {
      const zscoreVisible = isElementVisible(zscoreCard);
      if (zscoreVisible) {
        setInlineOrder(buttonWrapper, 7);
        setInlineOrder(card, 8);
      } else {
        setInlineOrder(buttonWrapper, null);
        setInlineOrder(card, null);
      }
    }

    function showToast(text) {
      if (!text) return;
      hideToast();
      const toast = document.createElement('div');
      toast.id = 'sgaBirthToast';
      toast.className = 'sga-birth-toast';
      toast.textContent = text;
      document.body.appendChild(toast);
      requestAnimationFrame(() => {
        toast.classList.add('is-visible');
      });
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        toast.classList.remove('is-visible');
        setTimeout(() => {
          try { toast.remove(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('sga_birth_module.js', _, { line: 627 });
    }
  }
        }, 220);
      }, 2000);
    }

    function setMessage(text, kind) {
      messageEl.textContent = text || '';
      messageEl.classList.remove('is-error', 'is-success', 'is-warning', 'is-visible');
      if (text && kind) {
        messageEl.classList.add('is-' + kind, 'is-visible');
      }
      if (!text) {
        messageEl.style.display = 'none';
      } else {
        hideToast();
        messageEl.style.display = 'block';
      }
    }

    function normalizeSourceSelection(value) {
      const seen = new Set();
      let raw = [];

      if (Array.isArray(value)) {
        raw = value;
      } else if (value && typeof value === 'object' && Array.isArray(value.sourceKeys)) {
        raw = value.sourceKeys;
      } else if (String(value) === 'compare') {
        raw = SGA_SOURCE_KEYS.slice();
      } else if (value != null && value !== '') {
        raw = [value];
      }

      const normalized = raw
        .map((entry) => String(entry))
        .filter((entry) => SGA_SOURCE_KEYS.includes(entry))
        .filter((entry) => {
          if (seen.has(entry)) return false;
          seen.add(entry);
          return true;
        });

      return normalized.length ? normalized : ['niklasson'];
    }

    function getSelectedSourceKeys() {
      return sourceInputs
        .filter((input) => input.checked)
        .map((input) => String(input.value))
        .filter((value) => SGA_SOURCE_KEYS.includes(value));
    }

    function setSelectedSourceKeys(value) {
      const normalized = normalizeSourceSelection(value);
      sourceInputs.forEach((input) => {
        input.checked = normalized.includes(String(input.value));
      });
      return normalized;
    }

    function ensureValidSourceSelection(preferredValue) {
      const selected = getSelectedSourceKeys();
      if (selected.length) return selected;
      return setSelectedSourceKeys(preferredValue || 'niklasson');
    }

    function getSelectedSex() {
      const selected = sexInputs.find((input) => input.checked);
      return selected ? selected.value : '';
    }

    function hideCard() {
      card.style.display = 'none';
      toggleBtn.classList.remove('active-toggle');
      syncZscoreSgaPairLayout();
    }

    function showCard() {
      try {
        const bisphosCard = document.getElementById('bisphosCard');
        const bisphosBtn = document.getElementById('toggleBisphos');
        if (bisphosCard && bisphosCard.style.display !== 'none' && bisphosCard.style.display !== '') {
          bisphosCard.style.display = 'none';
          if (bisphosBtn) bisphosBtn.classList.remove('active-toggle');
        }
      } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('sga_birth_module.js', e, { line: 712 });
    }
  }
      card.style.display = 'block';
      toggleBtn.classList.add('active-toggle');
      syncZscoreSgaPairLayout();
    }

    function collectWarnings(weightG, lengthCm, headCm) {
      const warnings = [];
      if (Number.isFinite(weightG) && (weightG < 300 || weightG > 7000)) {
        warnings.push('Wpisana masa urodzeniowa jest nietypowa. Sprawdź, czy nie ma pomyłki.');
      }
      if (Number.isFinite(lengthCm) && (lengthCm < 20 || lengthCm > 65)) {
        warnings.push('Wpisana długość urodzeniowa jest nietypowa. Sprawdź, czy nie ma pomyłki.');
      }
      if (Number.isFinite(headCm) && (headCm < 15 || headCm > 45)) {
        warnings.push('Wpisany obwód głowy jest nietypowy. Sprawdź, czy nie ma pomyłki.');
      }
      return warnings;
    }

    function buildStatusSummary(weightSds, lengthSds, options) {
      const opts = options && typeof options === 'object' ? options : {};
      const weightStatus = opts.weightUnavailable
        ? 'Niedostępne w tym źródle'
        : (weightSds == null ? 'Brak danych' : (weightSds < -2 ? 'TAK' : 'NIE'));
      const lengthStatus = opts.lengthUnavailable
        ? 'Niedostępne w tym źródle'
        : (lengthSds == null ? 'Brak danych' : (lengthSds < -2 ? 'TAK' : 'NIE'));
      return { weightStatus, lengthStatus };
    }

    function isNiklassonSupported(weeks) {
      return Number.isFinite(weeks) && weeks >= 24 && weeks <= 42;
    }

    function isIntergrowthSupported(weeks, days) {
      return Number.isFinite(weeks) && weeks >= 24 && weeks <= 42 && Number.isFinite(days) && days >= 0 && days <= 6;
    }

    function isMalewskiSupported(weeks) {
      return Number.isFinite(weeks) && weeks >= 22 && weeks <= 43;
    }

    function isSourceSupportedForAge(sourceKey, weeks, days) {
      if (sourceKey === 'intergrowth') return isIntergrowthSupported(weeks, days);
      if (sourceKey === 'malewski') return isMalewskiSupported(weeks);
      return isNiklassonSupported(weeks);
    }

    function getMalewskiRawRow(sex, weeks) {
      try {
        const root = (typeof window !== 'undefined' && window.SGA_MALEWSKI_WEIGHT && typeof window.SGA_MALEWSKI_WEIGHT === 'object')
          ? window.SGA_MALEWSKI_WEIGHT
          : null;
        const sexKey = sex === 'female' ? 'female' : 'male';
        const bySex = root && root[sexKey] && typeof root[sexKey] === 'object' ? root[sexKey] : null;
        const row = bySex ? bySex[String(weeks)] : null;
        return row && typeof row === 'object' ? row : null;
      } catch (_) {
        return null;
      }
    }

    function estimateMalewskiTail(meanG, sdG, direction) {
      if (!Number.isFinite(meanG) || !Number.isFinite(sdG) || sdG <= 0) return null;
      const sign = direction === 'lower' ? -1 : 1;
      return Math.round(meanG + sign * 1.6448536269514722 * sdG);
    }

    function normalizeMalewskiRow(raw, week) {
      if (!raw || typeof raw !== 'object') return null;
      const out = {
        week: Number(week),
        n: toFiniteNumberOrNull(raw.n),
        meanG: toFiniteNumberOrNull(raw.meanG),
        sdG: toFiniteNumberOrNull(raw.sdG),
        p5G: toFiniteNumberOrNull(raw.p5G),
        p10G: toFiniteNumberOrNull(raw.p10G),
        p25G: toFiniteNumberOrNull(raw.p25G),
        p50G: toFiniteNumberOrNull(raw.p50G),
        p75G: toFiniteNumberOrNull(raw.p75G),
        p90G: toFiniteNumberOrNull(raw.p90G),
        p95G: toFiniteNumberOrNull(raw.p95G),
        estimatedTailFields: []
      };

      if (!Number.isFinite(out.p5G)) {
        const est = estimateMalewskiTail(out.meanG, out.sdG, 'lower');
        if (Number.isFinite(est)) {
          out.p5G = est;
          out.estimatedTailFields.push('p5G');
        }
      }
      if (!Number.isFinite(out.p95G)) {
        const est = estimateMalewskiTail(out.meanG, out.sdG, 'upper');
        if (Number.isFinite(est)) {
          out.p95G = est;
          out.estimatedTailFields.push('p95G');
        }
      }
      if (Number.isFinite(out.p5G) && Number.isFinite(out.p10G) && out.p5G >= out.p10G) {
        out.p5G = out.p10G - 1;
      }
      if (Number.isFinite(out.p90G) && Number.isFinite(out.p95G) && out.p95G <= out.p90G) {
        out.p95G = out.p90G + 1;
      }
      return out;
    }

    function interpolateMalewskiRows(base, next, ratio) {
      const keys = ['meanG', 'sdG', 'p5G', 'p10G', 'p25G', 'p50G', 'p75G', 'p90G', 'p95G'];
      if (!base) return null;
      if (!next || !Number.isFinite(ratio) || ratio <= 0) {
        return Object.assign({}, base, {
          interpolated: false,
          baseWeek: base.week,
          nextWeek: null,
          ratio: 0,
          clampedToLastWeek: false,
          estimatedTailFields: Array.isArray(base.estimatedTailFields) ? base.estimatedTailFields.slice() : []
        });
      }
      const out = {
        week: base.week + ratio,
        n: null,
        interpolated: true,
        baseWeek: base.week,
        nextWeek: next.week,
        ratio,
        clampedToLastWeek: false,
        estimatedTailFields: Array.from(new Set([...(base.estimatedTailFields || []), ...(next.estimatedTailFields || [])]))
      };
      keys.forEach((key) => {
        const a = toFiniteNumberOrNull(base[key]);
        const b = toFiniteNumberOrNull(next[key]);
        if (Number.isFinite(a) && Number.isFinite(b)) {
          out[key] = a + ratio * (b - a);
        } else if (Number.isFinite(a)) {
          out[key] = a;
        } else if (Number.isFinite(b)) {
          out[key] = b;
        } else {
          out[key] = null;
        }
      });
      return out;
    }

    function getInterpolatedMalewskiRow(sex, weeks, days) {
      const base = normalizeMalewskiRow(getMalewskiRawRow(sex, weeks), weeks);
      if (!base) return null;
      if (!Number.isFinite(days) || days <= 0 || weeks >= 43) {
        return Object.assign({}, base, {
          interpolated: false,
          baseWeek: weeks,
          nextWeek: null,
          ratio: 0,
          clampedToLastWeek: Number.isFinite(days) && days > 0 && weeks >= 43,
          estimatedTailFields: Array.isArray(base.estimatedTailFields) ? base.estimatedTailFields.slice() : []
        });
      }
      const next = normalizeMalewskiRow(getMalewskiRawRow(sex, weeks + 1), weeks + 1);
      if (!next) {
        return Object.assign({}, base, {
          interpolated: false,
          baseWeek: weeks,
          nextWeek: null,
          ratio: 0,
          clampedToLastWeek: false,
          estimatedTailFields: Array.isArray(base.estimatedTailFields) ? base.estimatedTailFields.slice() : []
        });
      }
      const ratio = Math.min(Math.max(days / 7, 0), 1);
      return interpolateMalewskiRows(base, next, ratio);
    }

    function computeNiklassonResult(sex, weeks, days, weightG, lengthCm, headCm) {
      const ref = getInterpolatedRef(sex, weeks, days);
      if (!ref) {
        return { error: 'Nie udało się odczytać danych referencyjnych Niklasson dla podanego wieku ciążowego.' };
      }

      const cards = [];
      const metrics = {};
      let weightSds = null;
      let lengthSds = null;
      let headSds = null;

      if (Number.isFinite(weightG)) {
        weightSds = computeWeightSds(weightG, ref);
        const interpretation = interpretSds(weightSds);
        const valueLabel = `${formatNumberTrim(weightG, 0)} g`;
        cards.push(metricCardHtml('Masa ciała przy urodzeniu', valueLabel, weightSds, interpretation));
        metrics.weight = buildMetricResult('Masa ciała przy urodzeniu', valueLabel, weightSds, interpretation);
      }
      if (Number.isFinite(lengthCm)) {
        lengthSds = computeLinearSds(lengthCm, ref.lengthMean, ref.lengthSd);
        const interpretation = interpretSds(lengthSds);
        const valueLabel = `${formatNumberTrim(lengthCm, 1)} cm`;
        cards.push(metricCardHtml('Długość ciała przy urodzeniu', valueLabel, lengthSds, interpretation));
        metrics.length = buildMetricResult('Długość ciała przy urodzeniu', valueLabel, lengthSds, interpretation);
      }
      if (Number.isFinite(headCm)) {
        headSds = computeLinearSds(headCm, ref.headMean, ref.headSd);
        const interpretation = interpretSds(headSds);
        const valueLabel = `${formatNumberTrim(headCm, 1)} cm`;
        cards.push(metricCardHtml('Obwód głowy przy urodzeniu', valueLabel, headSds, interpretation));
        metrics.head = buildMetricResult('Obwód głowy przy urodzeniu', valueLabel, headSds, interpretation);
      }

      const notes = [];
      if (weeks === 42 && Number(days) > 0) {
        notes.push('Dla 42 tygodni i dodatkowych dni zastosowano referencję dla 42. tygodnia, bo dane Niklasson kończą się na wartościach tygodniowych.');
      }

      return {
        sourceKey: 'niklasson',
        title: SGA_SOURCE_CONFIG.niklasson.shortLabel,
        helperLabel: SGA_SOURCE_CONFIG.niklasson.helperLabel,
        sourceLabel: SGA_SOURCE_CONFIG.niklasson.sourceLabel,
        cards,
        metrics,
        cardCount: cards.length,
        notes,
        summary: buildStatusSummary(weightSds, lengthSds)
      };
    }

    function computeIntergrowthResult(sex, weeks, days, weightG, lengthCm, headCm) {
      if (!(typeof window !== 'undefined' && window.SGA_INTERGROWTH_ZS)) {
        return { error: 'Brak załadowanych danych referencyjnych INTERGROWTH-21st.' };
      }

      const weightRow = getIntergrowthRow(sex, 'weight', weeks, days);
      const lengthRow = getIntergrowthRow(sex, 'length', weeks, days);
      const headRow = getIntergrowthRow(sex, 'head', weeks, days);

      if ((!weightRow && Number.isFinite(weightG)) || (!lengthRow && Number.isFinite(lengthCm)) || (!headRow && Number.isFinite(headCm))) {
        return { error: 'Nie udało się odczytać danych referencyjnych INTERGROWTH-21st dla podanego wieku ciążowego.' };
      }

      const cards = [];
      const metrics = {};
      let weightSds = null;
      let lengthSds = null;
      let headSds = null;

      if (Number.isFinite(weightG)) {
        weightSds = zFromAnchorTable(weightG / 1000, weightRow);
        const interpretation = interpretSds(weightSds);
        const valueLabel = `${formatNumberTrim(weightG, 0)} g`;
        cards.push(metricCardHtml('Masa ciała przy urodzeniu', valueLabel, weightSds, interpretation));
        metrics.weight = buildMetricResult('Masa ciała przy urodzeniu', valueLabel, weightSds, interpretation);
      }
      if (Number.isFinite(lengthCm)) {
        lengthSds = zFromAnchorTable(lengthCm, lengthRow);
        const interpretation = interpretSds(lengthSds);
        const valueLabel = `${formatNumberTrim(lengthCm, 1)} cm`;
        cards.push(metricCardHtml('Długość ciała przy urodzeniu', valueLabel, lengthSds, interpretation));
        metrics.length = buildMetricResult('Długość ciała przy urodzeniu', valueLabel, lengthSds, interpretation);
      }
      if (Number.isFinite(headCm)) {
        headSds = zFromAnchorTable(headCm, headRow);
        const interpretation = interpretSds(headSds);
        const valueLabel = `${formatNumberTrim(headCm, 1)} cm`;
        cards.push(metricCardHtml('Obwód głowy przy urodzeniu', valueLabel, headSds, interpretation));
        metrics.head = buildMetricResult('Obwód głowy przy urodzeniu', valueLabel, headSds, interpretation);
      }

      const notes = [];
      if (weeks < 28) {
        notes.push('Dla wieku ciążowego poniżej 28 tygodni interpretuj wynik INTERGROWTH-21st ostrożnie ze względu na mniejszą liczebność próby referencyjnej.');
      }

      return {
        sourceKey: 'intergrowth',
        title: SGA_SOURCE_CONFIG.intergrowth.shortLabel,
        helperLabel: SGA_SOURCE_CONFIG.intergrowth.helperLabel,
        sourceLabel: SGA_SOURCE_CONFIG.intergrowth.sourceLabel,
        cards,
        metrics,
        cardCount: cards.length,
        notes,
        summary: buildStatusSummary(weightSds, lengthSds)
      };
    }

    function computeMalewskiResult(sex, weeks, days, weightG, lengthCm, headCm) {
      if (!(typeof window !== 'undefined' && window.SGA_MALEWSKI_WEIGHT)) {
        return { error: 'Brak załadowanych danych referencyjnych Malewski i wsp.' };
      }
      if (!Number.isFinite(weightG)) {
        return { error: 'Źródło Malewski obejmuje tylko masę urodzeniową. Podaj masę ciała przy urodzeniu.' };
      }

      const ref = getInterpolatedMalewskiRow(sex, weeks, days);
      if (!ref) {
        return { error: 'Nie udało się odczytać danych referencyjnych Malewski i wsp. dla podanego wieku ciążowego.' };
      }

      const anchors = [ref.p5G, ref.p10G, ref.p25G, ref.p50G, ref.p75G, ref.p90G, ref.p95G];
      let weightSds = zFromAnchorTable(weightG, anchors, MALEWSKI_PERCENTILE_Z_GRID);
      if (!Number.isFinite(weightSds)) {
        weightSds = computeLinearSds(weightG, ref.meanG, ref.sdG);
      }

      const cards = [
        metricCardHtml('Masa ciała przy urodzeniu', `${formatNumberTrim(weightG, 0)} g`, weightSds, interpretSds(weightSds))
      ];
      const metrics = {
        weight: buildMetricResult('Masa ciała przy urodzeniu', `${formatNumberTrim(weightG, 0)} g`, weightSds, interpretSds(weightSds))
      };
      if (Number.isFinite(lengthCm)) {
        metrics.length = buildUnavailableMetricResult('Długość ciała przy urodzeniu', 'Niedostępne w tym źródle');
      }
      if (Number.isFinite(headCm)) {
        metrics.head = buildUnavailableMetricResult('Obwód głowy przy urodzeniu', 'Niedostępne w tym źródle');
      }

      const notes = [];
      if (ref.interpolated && Number.isFinite(days) && days > 0 && ref.nextWeek) {
        notes.push(`Dla ${weeks}+${days} tc zastosowano interpolację liniową między ${ref.baseWeek}. a ${ref.nextWeek}. tygodniem ciąży.`);
      } else if (ref.clampedToLastWeek) {
        notes.push('Dla 43 tygodni i dodatkowych dni zastosowano referencję dla 43. tygodnia, bo źródło kończy się na wartościach tygodniowych.');
      }
      if (Array.isArray(ref.estimatedTailFields) && ref.estimatedTailFields.length) {
        notes.push('W najwcześniejszych tygodniach fotografia tabeli nie zawierała 5. i/lub 95. centyla; brakujące skrajne punkty oszacowano z podanej średniej i SD wyłącznie na potrzeby obliczeń SDS/percentyla.');
      }

      return {
        sourceKey: 'malewski',
        title: SGA_SOURCE_CONFIG.malewski.shortLabel,
        helperLabel: SGA_SOURCE_CONFIG.malewski.helperLabel,
        sourceLabel: SGA_SOURCE_CONFIG.malewski.sourceLabel,
        cards,
        metrics,
        cardCount: cards.length,
        notes,
        metaLines: [],
        summary: buildStatusSummary(weightSds, null, { lengthUnavailable: true })
      };
    }

    function statusClass(status) {
      if (status === 'TAK') return 'is-sga';
      if (status === 'Brak danych' || status === 'Niedostępne w tym źródle') return 'is-missing';
      return 'is-ok';
    }

    function noteBoxHtml(notes) {
      if (!Array.isArray(notes) || !notes.length) return '';
      return `
        <div class="sga-birth-note-box">
          ${notes.map((note) => `<p>${escapeHtml(note)}</p>`).join('')}
        </div>
      `;
    }

    function renderSourceSection(result) {
      const summary = result.summary || {};
      const resultGridClass = result.cardCount === 1 ? 'sga-birth-result-grid is-single' : 'sga-birth-result-grid';
      const metaLines = Array.isArray(result.metaLines) ? result.metaLines : [];

      return `
        <section class="sga-birth-source-block" data-source="${escapeHtml(result.sourceKey)}">
          <div class="sga-birth-source-header">
            <h3>${escapeHtml(result.title)}</h3>
            <p>${escapeHtml(result.helperLabel || '')}</p>
          </div>
          <div class="sga-birth-summary-box">
            <h3>Podsumowanie</h3>
            <div class="sga-birth-summary-grid">
              <div class="sga-birth-summary-item ${statusClass(summary.weightStatus)}"><span class="sga-birth-summary-label">SGA po masie urodzeniowej</span><strong class="sga-birth-summary-value">${escapeHtml(summary.weightStatus || 'Brak danych')}</strong></div>
              <div class="sga-birth-summary-item ${statusClass(summary.lengthStatus)}"><span class="sga-birth-summary-label">SGA po długości urodzeniowej</span><strong class="sga-birth-summary-value">${escapeHtml(summary.lengthStatus || 'Brak danych')}</strong></div>
            </div>
          </div>
          <div class="${resultGridClass}">
            ${result.cards.join('')}
          </div>
          ${noteBoxHtml(result.notes)}
          <div class="sga-birth-meta-box">
            <p><strong>Źródło referencyjne:</strong> ${escapeHtml(result.sourceLabel)}</p>
            ${metaLines.map((line) => `<p>${escapeHtml(line)}</p>`).join('')}
          </div>
        </section>
      `;
    }

    function metricStatusClass(metric) {
      if (!metric) return 'is-missing';
      return interpretationStatusClass(metric.interpretation);
    }

    function interpretationStatusClass(label) {
      const text = String(label || '').trim();
      if (!text || text === '–' || text === 'Brak danych' || text === 'Brak pomiaru' || text === 'Niedostępne w tym źródle') {
        return 'is-missing';
      }
      if (text === 'poniżej -2 SDS' || text === 'TAK') return 'is-sga';
      return 'is-ok';
    }

    function compareBadgeHtml(text, kindClass) {
      const cls = kindClass || interpretationStatusClass(text);
      return `<span class="sga-birth-compare-badge ${escapeHtml(cls)}">${escapeHtml(text || '–')}</span>`;
    }

    function compareTableSectionHtml(title, columns, rows) {
      return `
        <section class="sga-birth-compare-table-block">
          <h3>${escapeHtml(title)}</h3>
          <div class="sga-birth-compare-table-wrap">
            <table class="sga-birth-compare-table">
              <thead>
                <tr>
                  <th scope="col">Źródło</th>
                  ${columns.map((label) => `<th scope="col">${escapeHtml(label)}</th>`).join('')}
                </tr>
              </thead>
              <tbody>
                ${rows.map((row) => `
                  <tr>
                    <th scope="row">${escapeHtml(row.source)}</th>
                    ${row.cells.map((cell) => `<td data-label="${escapeHtml(cell.label)}">${cell.html}</td>`).join('')}
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </section>
      `;
    }

    function compareReferenceBoxHtml(results) {
      if (!Array.isArray(results) || !results.length) return '';
      return `
        <div class="sga-birth-meta-box sga-birth-compare-reference-box">
          <h3>Źródła referencyjne</h3>
          ${results.map((result) => `<p><strong>${escapeHtml(result.title)}:</strong> ${escapeHtml(result.sourceLabel)}</p>`).join('')}
        </div>
      `;
    }

    function compareFootnotesHtml(results) {
      const lines = [];
      (Array.isArray(results) ? results : []).forEach((result) => {
        const resultTitle = result && result.title ? result.title : '';
        const notes = Array.isArray(result && result.notes) ? result.notes : [];
        const metaLines = Array.isArray(result && result.metaLines) ? result.metaLines : [];
        notes.forEach((note) => {
          if (note) lines.push({ title: resultTitle, text: note });
        });
        metaLines.forEach((line) => {
          if (line) lines.push({ title: resultTitle, text: line });
        });
      });
      if (!lines.length) return '';
      return `
        <div class="sga-birth-note-box sga-birth-compare-footnotes">
          <h3>Uwagi</h3>
          ${lines.map((entry) => `<p><strong>${escapeHtml(entry.title)}:</strong> ${escapeHtml(entry.text)}</p>`).join('')}
        </div>
      `;
    }

    function renderThreeSourceComparison(results, compareParagraphs, inputFlags) {
      const flags = inputFlags && typeof inputFlags === 'object' ? inputFlags : {};
      const safeResults = Array.isArray(results) ? results : [];
      const summaryRows = safeResults.map((result) => {
        const summary = result && result.summary ? result.summary : {};
        return {
          source: result.title,
          cells: [
            {
              label: 'SGA po masie',
              html: compareBadgeHtml(summary.weightStatus || 'Brak danych', statusClass(summary.weightStatus || 'Brak danych'))
            },
            {
              label: 'SGA po długości',
              html: compareBadgeHtml(summary.lengthStatus || 'Brak danych', statusClass(summary.lengthStatus || 'Brak danych'))
            }
          ]
        };
      });

      const sections = [
        compareTableSectionHtml(
          'Podsumowanie SGA',
          ['SGA po masie urodzeniowej', 'SGA po długości urodzeniowej'],
          summaryRows
        )
      ];

      const metricDefinitions = [];
      if (flags.weight) metricDefinitions.push({ key: 'weight', title: 'Masa ciała przy urodzeniu' });
      if (flags.length) metricDefinitions.push({ key: 'length', title: 'Długość ciała przy urodzeniu' });
      if (flags.head) metricDefinitions.push({ key: 'head', title: 'Obwód głowy przy urodzeniu' });

      metricDefinitions.forEach((metricDef) => {
        const metricRows = safeResults.map((result) => {
          const metric = result && result.metrics && result.metrics[metricDef.key] ? result.metrics[metricDef.key] : null;
          const valueLabel = metric ? metric.valueLabel : '–';
          const sdsLabel = metric && Number.isFinite(metric.sds) ? formatNumber(metric.sds, 2) : '–';
          const percentileText = metric && metric.percentile ? metric.percentile : '–';
          const interpretationText = metric ? metric.interpretation : 'Brak pomiaru';
          return {
            source: result.title,
            cells: [
              {
                label: 'Wartość',
                html: `<span class="sga-birth-compare-value">${escapeHtml(valueLabel)}</span>`
              },
              {
                label: 'SDS',
                html: `<span class="sga-birth-compare-value">${escapeHtml(sdsLabel)}</span>`
              },
              {
                label: 'Percentyl',
                html: `<span class="sga-birth-compare-value">${escapeHtml(percentileText)}</span>`
              },
              {
                label: 'Ocena',
                html: compareBadgeHtml(interpretationText, metricStatusClass(metric))
              }
            ]
          };
        });
        sections.push(compareTableSectionHtml(metricDef.title, ['Wartość', 'SDS', 'Percentyl', 'Ocena'], metricRows));
      });

      return `
        <div class="sga-birth-compare-note">
          ${compareParagraphs.map((text) => `<p>${escapeHtml(text)}</p>`).join('')}
        </div>
        <div class="sga-birth-compare-table-stack">
          ${sections.join('')}
        </div>
        ${compareReferenceBoxHtml(safeResults)}
        ${compareFootnotesHtml(safeResults)}
      `;
    }

    function renderResults(showFeedbackToast = true) {
      const selectedSourceKeys = ensureValidSourceSelection('niklasson');
      const compareModeRequested = selectedSourceKeys.length > 1;
      const sex = getSelectedSex();
      const weeks = Number(gaWeeksSelect ? gaWeeksSelect.value : NaN);
      const days = Number(gaDaysSelect ? gaDaysSelect.value : 0);
      const weightG = parseLocaleNumber(birthWeightInput ? birthWeightInput.value : '');
      const lengthCm = parseLocaleNumber(birthLengthInput ? birthLengthInput.value : '');
      const headCm = parseLocaleNumber(birthHeadInput ? birthHeadInput.value : '');

      const invalidNumeric = [weightG, lengthCm, headCm].some((value, idx) => {
        const raw = [birthWeightInput, birthLengthInput, birthHeadInput][idx];
        return raw && raw.value.trim() !== '' && !Number.isFinite(value);
      });
      if (invalidNumeric) {
        setMessage('Sprawdź format liczb. Możesz użyć przecinka lub kropki jako separatora dziesiętnego.', 'error');
        resultsEl.style.display = 'none';
        sgaBirthClearHtml(resultsEl);
        return;
      }

      if (!sex) {
        setMessage('Wybierz płeć dziecka.', 'error');
        resultsEl.style.display = 'none';
        sgaBirthClearHtml(resultsEl);
        return;
      }
      if (!Number.isFinite(weeks) || weeks < 22 || weeks > 43) {
        setMessage('Wybierz pełne tygodnie ciąży w zakresie 22–43 tc.', 'error');
        resultsEl.style.display = 'none';
        sgaBirthClearHtml(resultsEl);
        return;
      }

      const inputFlags = {
        weight: Number.isFinite(weightG),
        length: Number.isFinite(lengthCm),
        head: Number.isFinite(headCm)
      };
      const hasAnyMeasurement = inputFlags.weight || inputFlags.length || inputFlags.head;
      if (!hasAnyMeasurement) {
        setMessage('Podaj co najmniej jeden parametr urodzeniowy: masę, długość lub obwód głowy.', 'error');
        resultsEl.style.display = 'none';
        sgaBirthClearHtml(resultsEl);
        return;
      }

      if (!compareModeRequested) {
        const singleSource = selectedSourceKeys[0] || 'niklasson';
        if (singleSource === 'niklasson' && !isNiklassonSupported(weeks)) {
          setMessage('Źródło Niklasson jest dostępne dla wieku ciążowego 24–42 tc.', 'error');
          resultsEl.style.display = 'none';
          sgaBirthClearHtml(resultsEl);
          return;
        }
        if (singleSource === 'intergrowth' && !isIntergrowthSupported(weeks, days)) {
          setMessage('Źródło INTERGROWTH-21st jest dostępne dla wieku ciążowego 24+0 do 42+6 tc.', 'error');
          resultsEl.style.display = 'none';
          sgaBirthClearHtml(resultsEl);
          return;
        }
        if (singleSource === 'malewski' && !isMalewskiSupported(weeks)) {
          setMessage('Źródło Malewski jest dostępne dla wieku ciążowego 22–43 tc.', 'error');
          resultsEl.style.display = 'none';
          sgaBirthClearHtml(resultsEl);
          return;
        }
        if (singleSource === 'malewski' && !inputFlags.weight) {
          setMessage('Źródło Malewski obejmuje tylko masę urodzeniową. Podaj masę ciała przy urodzeniu.', 'error');
          resultsEl.style.display = 'none';
          sgaBirthClearHtml(resultsEl);
          return;
        }
      }

      const genericWarnings = collectWarnings(weightG, lengthCm, headCm);
      const compareSkippedNotes = [];
      let sourceKeys = [];

      if (compareModeRequested) {
        selectedSourceKeys.forEach((sourceKey) => {
          if (!isSourceSupportedForAge(sourceKey, weeks, days)) {
            compareSkippedNotes.push(`Źródło ${sourceTitle(sourceKey)} pominięto, bo obejmuje ${sourceRangeText(sourceKey)}.`);
            return;
          }
          if (sourceKey === 'malewski' && !inputFlags.weight) {
            compareSkippedNotes.push('Źródło Malewski pominięto w trybie porównawczym, bo nie podano masy urodzeniowej.');
            return;
          }
          sourceKeys.push(sourceKey);
        });
        if (!sourceKeys.length) {
          setMessage('Dla wybranego wieku ciążowego i podanych parametrów nie ma dostępnego źródła do obliczeń. Dodaj masę urodzeniową albo wybierz wiek 24–42 tc.', 'error');
          resultsEl.style.display = 'none';
          sgaBirthClearHtml(resultsEl);
          return;
        }
      } else {
        sourceKeys = [selectedSourceKeys[0] || 'niklasson'];
      }

      const computedResults = [];
      for (let i = 0; i < sourceKeys.length; i += 1) {
        const sourceKey = sourceKeys[i];
        let result = null;
        if (sourceKey === 'intergrowth') {
          result = computeIntergrowthResult(sex, weeks, days, weightG, lengthCm, headCm);
        } else if (sourceKey === 'malewski') {
          result = computeMalewskiResult(sex, weeks, days, weightG, lengthCm, headCm);
        } else {
          result = computeNiklassonResult(sex, weeks, days, weightG, lengthCm, headCm);
        }

        if (result && result.error) {
          setMessage(result.error, 'error');
          resultsEl.style.display = 'none';
          sgaBirthClearHtml(resultsEl);
          return;
        }
        computedResults.push(result);
      }

      let sectionsHtml = '';
      if (compareModeRequested) {
        const computedLabels = computedResults.map((result) => result.title);
        const compareParagraphs = [];
        if (computedResults.length > 1) {
          compareParagraphs.push(`Tryb porównawczy: te same dane policzono równolegle według ${computedLabels.join(', ')}.`);
        } else {
          compareParagraphs.push(`Tryb porównawczy: dla tego wieku ciążowego i podanych parametrów dostępne było tylko źródło ${computedLabels[0]}.`);
        }
        compareParagraphs.push(...compareSkippedNotes);

        if (computedResults.length >= 3 && selectedSourceKeys.length >= 3) {
          sectionsHtml = renderThreeSourceComparison(computedResults, compareParagraphs, inputFlags);
        } else if (computedResults.length > 1) {
          sectionsHtml = `
            <div class="sga-birth-compare-note">
              ${compareParagraphs.map((text) => `<p>${escapeHtml(text)}</p>`).join('')}
            </div>
            <div class="sga-birth-compare-grid">
              ${computedResults.map(renderSourceSection).join('')}
            </div>
          `;
        } else {
          sectionsHtml = `
            <div class="sga-birth-compare-note">
              ${compareParagraphs.map((text) => `<p>${escapeHtml(text)}</p>`).join('')}
            </div>
            ${renderSourceSection(computedResults[0])}
          `;
        }
      } else {
        sectionsHtml = renderSourceSection(computedResults[0]);
      }

      sgaBirthSetTrustedHtml(resultsEl, `
        ${noteBoxHtml(genericWarnings)}
        ${sectionsHtml}
      `, 'sga-birth:resultsEl');
      resultsEl.style.display = 'block';
      resultsEl.dataset.hasComputed = '1';
      setMessage('', '');
      if (showFeedbackToast) {
        showToast('Wykonano obliczenia.');
      }
    }

    function resetModule(options) {
      const opts = options && typeof options === 'object' ? options : {};
      setSelectedSourceKeys('niklasson');
      sexInputs.forEach((input) => {
        input.checked = false;
      });
      if (gaWeeksSelect) gaWeeksSelect.value = '';
      if (gaDaysSelect) gaDaysSelect.value = '0';
      if (birthWeightInput) birthWeightInput.value = '';
      if (birthLengthInput) birthLengthInput.value = '';
      if (birthHeadInput) birthHeadInput.value = '';
      resultsEl.style.display = 'none';
      sgaBirthClearHtml(resultsEl);
      resultsEl.dataset.hasComputed = '0';
      setMessage('', '');
      hideToast();
      if (opts.hideCard) {
        hideCard();
      }
    }

    function recomputeIfNeeded() {
      if (resultsEl.dataset.hasComputed === '1') {
        renderResults(false);
      }
    }

    function captureSgaBirthPersistState() {
      const sourceKeys = ensureValidSourceSelection('niklasson');
      return {
        sourceChoice: sourceKeys.length > 1 ? 'compare' : sourceKeys[0],
        sourceKeys,
        sex: getSelectedSex(),
        weeks: gaWeeksSelect ? String(gaWeeksSelect.value || '') : '',
        days: gaDaysSelect ? String(gaDaysSelect.value || '') : '',
        weight: birthWeightInput ? String(birthWeightInput.value || '') : '',
        length: birthLengthInput ? String(birthLengthInput.value || '') : '',
        head: birthHeadInput ? String(birthHeadInput.value || '') : '',
        hasComputed: resultsEl.dataset.hasComputed === '1'
      };
    }

    function readSharedPersistSnapshot() {
      try {
        const adapter = (typeof window !== 'undefined' && window.VildaPersistence && typeof window.VildaPersistence.readSharedPersist === 'function')
          ? window.VildaPersistence
          : null;
        if (!adapter) return null;
        return adapter.readSharedPersist({ ensurePersist: false });
      } catch (_) {
        return null;
      }
    }

    function readSgaBirthPersistFallback() {
      const snapshot = readSharedPersistSnapshot();
      if (!snapshot) return null;
      try {
        const byId = snapshot.byId && typeof snapshot.byId === 'object' ? snapshot.byId : {};
        const radio = snapshot.radio && typeof snapshot.radio === 'object' ? snapshot.radio : {};
        const out = {
          sourceChoice: radio.sgaBirthSource || 'niklasson',
          sourceKeys: normalizeSourceSelection(radio.sgaBirthSource || 'niklasson'),
          sex: radio.sgaBirthSex || '',
          weeks: byId.sgaBirthWeeks || '',
          days: byId.sgaBirthDays || '',
          weight: byId.sgaBirthWeight || '',
          length: byId.sgaBirthLength || '',
          head: byId.sgaBirthHead || ''
        };
        const hasAny = [out.sex, out.weeks, out.days, out.weight, out.length, out.head].some((value) => String(value || '') !== '');
        if (!hasAny) return null;
        out.hasComputed = !!(out.sex && out.weeks && (out.weight || out.length || out.head));
        return out;
      } catch (_) {
        return null;
      }
    }

    function restoreSgaBirthPersistState(state) {
      const saved = (state && typeof state === 'object') ? state : readSgaBirthPersistFallback();
      if (!saved || typeof saved !== 'object') return false;

      setSelectedSourceKeys(saved.sourceKeys || saved.sourceChoice || 'niklasson');
      sexInputs.forEach((input) => {
        input.checked = !!(saved.sex && String(input.value) === String(saved.sex));
      });
      if (gaWeeksSelect && saved.weeks != null) gaWeeksSelect.value = String(saved.weeks || '');
      if (gaDaysSelect && saved.days != null) gaDaysSelect.value = String(saved.days || '0');
      if (birthWeightInput && saved.weight != null) birthWeightInput.value = String(saved.weight || '');
      if (birthLengthInput && saved.length != null) birthLengthInput.value = String(saved.length || '');
      if (birthHeadInput && saved.head != null) birthHeadInput.value = String(saved.head || '');

      if (saved.hasComputed) {
        renderResults(false);
      } else {
        resultsEl.style.display = 'none';
        sgaBirthClearHtml(resultsEl);
        resultsEl.dataset.hasComputed = '0';
        setMessage('', '');
      }
      return true;
    }

    function handleSgaBirthUserStateCleared() {
      resetModule({ hideCard: true });
    }

    function handleSgaBirthModuleStateCleared(event) {
      const detail = event && event.detail && typeof event.detail === 'object' ? event.detail : {};
      const scope = String(detail.scope || 'all').toLowerCase();
      if (scope === 'all' || scope === '*' || scope === 'sga') {
        resetModule({ hideCard: true });
      }
    }

    try {
      if (typeof window !== 'undefined') {
        window.vildaSgaBirthPersistApi = {
          captureState: captureSgaBirthPersistState,
          restoreState: restoreSgaBirthPersistState,
          resetState: resetModule
        };
        if (!window.__vildaSgaBirthUserStateClearedBound && typeof window.addEventListener === 'function') {
          window.__vildaSgaBirthUserStateClearedBound = true;
          window.addEventListener('vilda:user-state-cleared', handleSgaBirthUserStateCleared);
          window.addEventListener('vilda:module-state-cleared', handleSgaBirthModuleStateCleared);
        }
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('sga_birth_module.js', _, { line: 1551 });
    }
  }

    toggleBtn.addEventListener('click', function () {
      const visible = card.style.display !== 'none' && card.style.display !== '';
      if (visible) {
        hideCard();
      } else {
        showCard();
      }
      try {
        if (typeof adjustTestButtonWidths === 'function') {
          requestAnimationFrame(() => adjustTestButtonWidths());
        }
      } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('sga_birth_module.js', e, { line: 1564 });
    }
  }
    });

    if (computeBtn) {
      computeBtn.addEventListener('click', renderResults);
    }
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        resetModule();
      });
    }

    [gaWeeksSelect, gaDaysSelect, birthWeightInput, birthLengthInput, birthHeadInput].forEach((field) => {
      if (field) {
        field.addEventListener('input', recomputeIfNeeded);
        field.addEventListener('change', recomputeIfNeeded);
      }
    });
    sexInputs.forEach((input) => {
      input.addEventListener('change', recomputeIfNeeded);
    });
    sourceInputs.forEach((input) => {
      input.addEventListener('change', function () {
        ensureValidSourceSelection(this && this.value ? this.value : 'niklasson');
        recomputeIfNeeded();
      });
    });

    if (zscoreCard) {
      try {
        const zscoreObserver = new MutationObserver(() => {
          syncZscoreSgaPairLayout();
        });
        zscoreObserver.observe(zscoreCard, { attributes: true, attributeFilter: ['style', 'class'] });
      } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('sga_birth_module.js', _, { line: 1598 });
    }
  }
    }

    const bisphosBtn = document.getElementById('toggleBisphos');
    if (bisphosBtn) {
      bisphosBtn.addEventListener('click', function () {
        hideCard();
      }, true);
    }

    if (buttonWrapper && buttonWrapper.style.display === '') {
      buttonWrapper.style.display = 'none';
    }
    hideCard();
    resetModule();
    syncZscoreSgaPairLayout();
  }

  function bootSgaBirthModule() {
    if (typeof window !== 'undefined' && typeof window.vildaOnReady === 'function') {
      window.vildaOnReady('sga-birth-module:setup', setupSgaBirthModule);
      return;
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setupSgaBirthModule, { once: true });
    } else {
      setupSgaBirthModule();
    }
  }

  bootSgaBirthModule();
})();
