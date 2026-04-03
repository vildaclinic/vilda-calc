
/*
 * Moduł SGA (small for gestational age).
 * Oblicza SDS masy urodzeniowej, długości ciała i obwodu głowy względem wieku ciążowego.
 * Obsługiwane źródła: Niklasson / Albertsson-Wikland 2008 oraz
 * INTERGROWTH-21st (24+0 do 42+6 tc).
 *
 * Uwaga implementacyjna:
 * - dla tc 24–40 zastosowano wygładzone wartości z tabeli 4 publikacji,
 * - dla tc 41–42 zastosowano tygodniowe wartości tabelaryczne z tabel 1–3,
 *   ponieważ tabela 4 kończy się na 40 tc,
 * - masa urodzeniowa liczona jest w skali log10(kg).
 */
(function () {
  const NIKLASSON_SOURCE_LABEL = 'Niklasson, A., Albertsson-Wikland, K. Continuous growth reference from 24th week of gestation to 24 months by gender. BMC Pediatr 8, 8 (2008). https://doi.org/10.1186/1471-2431-8-8';
  const INTERGROWTH_SOURCE_LABEL = 'INTERGROWTH-21st International Newborn Size References/Standards (24+0-42+6 tc): Villar et al. Lancet 2014;384:857-68 oraz Villar et al. Lancet 2016;387:844-5.';
  const INTERGROWTH_Z_GRID = [-3, -2, -1, 0, 1, 2, 3];
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
    }
  };
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

  function zFromAnchorTable(value, anchors) {
    if (!Number.isFinite(value) || !Array.isArray(anchors) || anchors.length !== INTERGROWTH_Z_GRID.length) {
      return null;
    }
    const nums = anchors.map((entry) => Number(entry));
    if (nums.some((entry) => !Number.isFinite(entry))) return null;

    if (value <= nums[0]) {
      return interpolateOnSegment(value, nums[0], nums[1], INTERGROWTH_Z_GRID[0], INTERGROWTH_Z_GRID[1]);
    }

    for (let i = 0; i < nums.length - 1; i += 1) {
      if (value <= nums[i + 1]) {
        return interpolateOnSegment(value, nums[i], nums[i + 1], INTERGROWTH_Z_GRID[i], INTERGROWTH_Z_GRID[i + 1]);
      }
    }

    const last = nums.length - 1;
    return interpolateOnSegment(value, nums[last - 1], nums[last], INTERGROWTH_Z_GRID[last - 1], INTERGROWTH_Z_GRID[last]);
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

  document.addEventListener('DOMContentLoaded', function () {
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
        try { existing.remove(); } catch (_) {}
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
          try { toast.remove(); } catch (_) {}
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

    function getSelectedSourceChoice() {
      const selected = sourceInputs.find((input) => input.checked);
      return selected ? selected.value : 'niklasson';
    }

    function setSelectedSourceChoice(value) {
      const normalized = ['niklasson', 'intergrowth', 'compare'].includes(String(value)) ? String(value) : 'niklasson';
      sourceInputs.forEach((input) => {
        input.checked = String(input.value) === normalized;
      });
      return normalized;
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
      } catch (e) {}
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

    function buildStatusSummary(weightSds, lengthSds) {
      const weightStatus = weightSds == null ? 'Brak danych' : (weightSds < -2 ? 'TAK' : 'NIE');
      const lengthStatus = lengthSds == null ? 'Brak danych' : (lengthSds < -2 ? 'TAK' : 'NIE');
      return { weightStatus, lengthStatus };
    }

    function computeNiklassonResult(sex, weeks, days, weightG, lengthCm, headCm) {
      const ref = getInterpolatedRef(sex, weeks, days);
      if (!ref) {
        return { error: 'Nie udało się odczytać danych referencyjnych Niklasson dla podanego wieku ciążowego.' };
      }

      const cards = [];
      let weightSds = null;
      let lengthSds = null;
      let headSds = null;

      if (Number.isFinite(weightG)) {
        weightSds = computeWeightSds(weightG, ref);
        cards.push(metricCardHtml('Masa ciała przy urodzeniu', `${formatNumberTrim(weightG, 0)} g`, weightSds, interpretSds(weightSds)));
      }
      if (Number.isFinite(lengthCm)) {
        lengthSds = computeLinearSds(lengthCm, ref.lengthMean, ref.lengthSd);
        cards.push(metricCardHtml('Długość ciała przy urodzeniu', `${formatNumberTrim(lengthCm, 1)} cm`, lengthSds, interpretSds(lengthSds)));
      }
      if (Number.isFinite(headCm)) {
        headSds = computeLinearSds(headCm, ref.headMean, ref.headSd);
        cards.push(metricCardHtml('Obwód głowy przy urodzeniu', `${formatNumberTrim(headCm, 1)} cm`, headSds, interpretSds(headSds)));
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
      let weightSds = null;
      let lengthSds = null;
      let headSds = null;

      if (Number.isFinite(weightG)) {
        weightSds = zFromAnchorTable(weightG / 1000, weightRow);
        cards.push(metricCardHtml('Masa ciała przy urodzeniu', `${formatNumberTrim(weightG, 0)} g`, weightSds, interpretSds(weightSds)));
      }
      if (Number.isFinite(lengthCm)) {
        lengthSds = zFromAnchorTable(lengthCm, lengthRow);
        cards.push(metricCardHtml('Długość ciała przy urodzeniu', `${formatNumberTrim(lengthCm, 1)} cm`, lengthSds, interpretSds(lengthSds)));
      }
      if (Number.isFinite(headCm)) {
        headSds = zFromAnchorTable(headCm, headRow);
        cards.push(metricCardHtml('Obwód głowy przy urodzeniu', `${formatNumberTrim(headCm, 1)} cm`, headSds, interpretSds(headSds)));
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
        cardCount: cards.length,
        notes,
        summary: buildStatusSummary(weightSds, lengthSds)
      };
    }

    function statusClass(status) {
      if (status === 'TAK') return 'is-sga';
      if (status === 'Brak danych') return 'is-missing';
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
          </div>
        </section>
      `;
    }

    function renderResults(showFeedbackToast = true) {
      const sourceChoice = getSelectedSourceChoice();
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
        resultsEl.innerHTML = '';
        return;
      }

      if (!sex) {
        setMessage('Wybierz płeć dziecka.', 'error');
        resultsEl.style.display = 'none';
        resultsEl.innerHTML = '';
        return;
      }
      if (!Number.isFinite(weeks) || weeks < 24 || weeks > 42) {
        setMessage('Wybierz pełne tygodnie ciąży.', 'error');
        resultsEl.style.display = 'none';
        resultsEl.innerHTML = '';
        return;
      }

      const hasAnyMeasurement = Number.isFinite(weightG) || Number.isFinite(lengthCm) || Number.isFinite(headCm);
      if (!hasAnyMeasurement) {
        setMessage('Podaj co najmniej jeden parametr urodzeniowy: masę, długość lub obwód głowy.', 'error');
        resultsEl.style.display = 'none';
        resultsEl.innerHTML = '';
        return;
      }

      const sourceKeys = sourceChoice === 'compare' ? ['niklasson', 'intergrowth'] : [sourceChoice];
      const genericWarnings = collectWarnings(weightG, lengthCm, headCm);
      const computedResults = [];

      for (let i = 0; i < sourceKeys.length; i += 1) {
        const sourceKey = sourceKeys[i];
        const result = sourceKey === 'intergrowth'
          ? computeIntergrowthResult(sex, weeks, days, weightG, lengthCm, headCm)
          : computeNiklassonResult(sex, weeks, days, weightG, lengthCm, headCm);

        if (result && result.error) {
          setMessage(result.error, 'error');
          resultsEl.style.display = 'none';
          resultsEl.innerHTML = '';
          return;
        }
        computedResults.push(result);
      }

      const sectionsHtml = sourceChoice === 'compare'
        ? `
          <div class="sga-birth-compare-note">
            <p>Tryb porównawczy: te same dane policzono równolegle według Niklasson oraz INTERGROWTH-21st.</p>
          </div>
          <div class="sga-birth-compare-grid">
            ${computedResults.map(renderSourceSection).join('')}
          </div>
        `
        : renderSourceSection(computedResults[0]);

      resultsEl.innerHTML = `
        ${noteBoxHtml(genericWarnings)}
        ${sectionsHtml}
      `;
      resultsEl.style.display = 'block';
      resultsEl.dataset.hasComputed = '1';
      setMessage('', '');
      if (showFeedbackToast) {
        showToast('Wykonano obliczenia.');
      }
    }

    function resetModule(options) {
      const opts = options && typeof options === 'object' ? options : {};
      setSelectedSourceChoice('niklasson');
      sexInputs.forEach((input) => {
        input.checked = false;
      });
      if (gaWeeksSelect) gaWeeksSelect.value = '';
      if (gaDaysSelect) gaDaysSelect.value = '0';
      if (birthWeightInput) birthWeightInput.value = '';
      if (birthLengthInput) birthLengthInput.value = '';
      if (birthHeadInput) birthHeadInput.value = '';
      resultsEl.style.display = 'none';
      resultsEl.innerHTML = '';
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
      return {
        sourceChoice: getSelectedSourceChoice(),
        sex: getSelectedSex(),
        weeks: gaWeeksSelect ? String(gaWeeksSelect.value || '') : '',
        days: gaDaysSelect ? String(gaDaysSelect.value || '') : '',
        weight: birthWeightInput ? String(birthWeightInput.value || '') : '',
        length: birthLengthInput ? String(birthLengthInput.value || '') : '',
        head: birthHeadInput ? String(birthHeadInput.value || '') : '',
        hasComputed: resultsEl.dataset.hasComputed === '1'
      };
    }

    function readSgaBirthPersistFallback() {
      try {
        const raw = localStorage.getItem('sharedUserData');
        if (!raw) return null;
        const root = JSON.parse(raw) || {};
        const persist = root && root._vildaPersist && typeof root._vildaPersist === 'object' ? root._vildaPersist : {};
        const byId = persist.byId && typeof persist.byId === 'object' ? persist.byId : {};
        const radio = persist.radio && typeof persist.radio === 'object' ? persist.radio : {};
        const out = {
          sourceChoice: radio.sgaBirthSource || 'niklasson',
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

      setSelectedSourceChoice(saved.sourceChoice || 'niklasson');
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
        resultsEl.innerHTML = '';
        resultsEl.dataset.hasComputed = '0';
        setMessage('', '');
      }
      return true;
    }

    try {
      if (typeof window !== 'undefined') {
        window.vildaSgaBirthPersistApi = {
          captureState: captureSgaBirthPersistState,
          restoreState: restoreSgaBirthPersistState,
          resetState: resetModule
        };
      }
    } catch (_) {}

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
      } catch (e) {}
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
      input.addEventListener('change', recomputeIfNeeded);
    });

    if (zscoreCard) {
      try {
        const zscoreObserver = new MutationObserver(() => {
          syncZscoreSgaPairLayout();
        });
        zscoreObserver.observe(zscoreCard, { attributes: true, attributeFilter: ['style', 'class'] });
      } catch (_) {}
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
  });
})();
